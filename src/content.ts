import { collectViewport, segmentUnchanged } from './scanner.ts';
import { MosaicRenderer } from './renderer.ts';
import { normalizeSettings, type Detection, type ScanProgress } from './types.ts';

// Programmatic injection is idempotent and lives in Chrome's isolated world.
if (!(globalThis as any).__glinvisible) {
  (globalThis as any).__glinvisible = true;
  let active = false, epoch = 0, running = false, again = false;
  let renderer: MosaicRenderer | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state = 'off', detail = '';
  const cache = new Map<string, Detection['spans']>();
  let settingsKey = '';
  const manualRanges: Range[] = [];
  let scanInfo: { id: string; epoch: number; cached: number; total: number } | undefined;
  let progress: ScanProgress | undefined;
  const scanning = (text: string, value?: ScanProgress) => {
    detail = text; progress = value; renderer?.scanning(text, value);
  };
  const notify = (value: string) => { state = value; void chrome.runtime.sendMessage({ target: 'background', action: 'page-state', state }).catch(() => {}); };
  const restore = () => {
    active = false; epoch++; again = false; scanInfo = undefined; progress = undefined; clearTimeout(timer); observer.disconnect();
    renderer?.destroy(); renderer = undefined; cache.clear(); manualRanges.length = 0; notify('off');
  };
  const observer = new MutationObserver(records => {
    if (records.every(r => r.target === renderer?.host || (r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(n => n === renderer?.host)))) return;
    schedule();
  });
  function schedule() {
    if (!active) return;
    // Keep page context visible while refreshing text and mask positions.
    epoch++; scanInfo = undefined; scanning('Checking changed content on your device...'); notify('scanning');
    clearTimeout(timer); timer = setTimeout(scan, 180);
  }
  async function scan() {
    if (!active) return;
    if (running) { again = true; return; }
    running = true; again = false;
    const revision = epoch;
    try {
      scanInfo = undefined; scanning('Preparing visible text on your device...'); notify('scanning');
      const response = await chrome.runtime.sendMessage({ target: 'background', action: 'settings-for-page' }).catch(() => null);
      // Settings arrive with detection results. Page scripts never receive model files.
      const settings = normalizeSettings(response?.value);
      const nextKey = JSON.stringify(settings);
      if (nextKey !== settingsKey) { cache.clear(); settingsKey = nextKey; }
      const { segments, media } = collectViewport(renderer!.host);
      const pending = segments.filter(s => !cache.has(s.text));
      if (!active || revision !== epoch) { again = active; return; }
      scanInfo = { id: crypto.randomUUID(), epoch: revision, cached: segments.length - pending.length, total: segments.length };
      scanning('Checking visible text on your device...', { phase: 'scanning', completed: scanInfo.cached, total: scanInfo.total });
      if (pending.length) {
        const answer = await chrome.runtime.sendMessage({ target: 'background', action: 'detect', scanId: scanInfo.id, segments: pending.map(({ id, text }) => ({ id, text })) });
        if (!answer?.ok) throw new Error(answer?.error || 'Local inference did not complete');
        for (const detection of answer.value.results as Detection[]) {
          const segment = pending.find(s => s.id === detection.id);
          if (segment) cache.set(segment.text, detection.spans);
        }
      }
      if (!active || revision !== epoch) { again = active; return; }
      if (segments.some(s => !segmentUnchanged(s))) { schedule(); return; }
      renderer!.clear();
      let masked = 0;
      for (const segment of segments) { const spans = cache.get(segment.text) ?? []; masked += spans.length; renderer!.addSegment(segment, spans); }
      media.forEach(el => renderer!.addElement(el));
      if (settings.hideAvatars) document.querySelectorAll('img').forEach(img => { if (/avatar|profile|gravatar/i.test(img.className + ' ' + img.alt + ' ' + img.src)) renderer!.addElement(img); });
      for (const range of manualRanges) if (range.startContainer.isConnected) renderer!.addSelection(range);
      renderer!.paint(settings.blockSize);
      detail = `${masked} detected masks. Local AI active${media.length ? `. ${media.length} embedded regions covered` : ''}.`;
      scanInfo = undefined; progress = undefined; renderer!.status(detail); notify('active');
      if (cache.size > 400) cache.clear();
    } catch (error) {
      if (active && revision === epoch) {
        detail = error instanceof Error ? error.message : 'Local scan failed';
        scanInfo = undefined; progress = undefined; renderer!.error(`${detail} Restore the page to stop or retry.`); notify('error');
      }
    } finally { running = false; if (again && active) { again = false; void scan(); } }
  }
  function start() {
    active = true; epoch++; renderer = new MosaicRenderer(restore);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'src', 'value', 'aria-hidden'] });
    void scan();
  }
  document.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  document.addEventListener('input', schedule, true); document.addEventListener('change', schedule, true);
  document.fonts.addEventListener('loadingdone', schedule);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.target !== 'content' || sender.id !== chrome.runtime.id) return;
    if (message.action === 'scan-progress') {
      const update = message.progress as ScanProgress;
      if (active && running && scanInfo && scanInfo.id === message.scanId && scanInfo.epoch === epoch && update.total === scanInfo.total - scanInfo.cached) {
        const completed = Math.min(scanInfo.total, scanInfo.cached + update.completed);
        // Progress counts completed inference, including already cached blocks.
        if (!progress || completed >= progress.completed) scanning(update.phase === 'loading' ? 'Loading the local model into memory...' : 'Checking visible text on your device...', {
          phase: update.phase, completed, total: scanInfo.total,
        });
      }
      respond({ ok: true }); return;
    }
    if (message.action === 'toggle') { if (active) restore(); else start(); }
    if (message.action === 'restore') restore();
    if (message.action === 'mask-selection') {
      const selection = getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) { respond({ state, error: 'Select text on the page first.' }); return; }
      const range = selection.getRangeAt(0).cloneRange();
      if (!active) start(); manualRanges.push(range); selection.removeAllRanges(); schedule();
    }
    respond({ state, detail, progress });
  });
}
