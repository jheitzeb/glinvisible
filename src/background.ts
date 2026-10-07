import { DEFAULT_SETTINGS, normalizeSettings, type Segment, type ProgressRoute } from './types.ts';

let offscreenCreation: Promise<void> | undefined;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offscreenCreation) offscreenCreation = chrome.offscreen.createDocument({
    url: 'offscreen.html', reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run cached GLiNER2 locally in a worker without blocking the webpage.',
  }).finally(() => { offscreenCreation = undefined; });
  await offscreenCreation;
}
async function inference(action: string, segments?: Segment[], progressRoute?: ProgressRoute) {
  await ensureOffscreen();
  const { settings } = await chrome.storage.local.get('settings');
  return chrome.runtime.sendMessage({ target: 'offscreen', action, segments, progressRoute, settings: normalizeSettings(settings) });
}
async function tabAction(action: string, tabId?: number) {
  const tab = tabId ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id || !/^(https?:|file:)/.test(tab.url ?? '')) throw new Error('Chrome protects this page. Open an ordinary webpage or an allowed local HTML file.');
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  return chrome.tabs.sendMessage(tab.id, { target: 'content', action });
}
chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-redaction') return;
  try { await tabAction('toggle'); }
  catch {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
  }
});
chrome.runtime.onInstalled.addListener(async details => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const existing = await chrome.storage.local.get('settings');
  if (!existing.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  if (details.reason === 'install') await chrome.runtime.openOptionsPage();
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'background' || sender.id !== chrome.runtime.id) return;
  const action = message.action;
  const isPage = !sender.url?.startsWith(chrome.runtime.getURL(''));
  if (isPage && !['detect', 'page-state', 'settings-for-page'].includes(action)) { respond({ ok: false, error: 'This request is only available in extension settings.' }); return; }
  (async () => {
    if (action === 'scan-progress') {
      if (sender.url !== chrome.runtime.getURL('offscreen.html')) throw new Error('Invalid progress sender');
      const route = message.progressRoute as ProgressRoute;
      await chrome.tabs.sendMessage(route.tabId, { target: 'content', action: 'scan-progress', scanId: route.scanId, progress: message.progress }).catch(() => {});
      return { ok: true };
    }
    if (action === 'settings-for-page') {
      const { settings } = await chrome.storage.local.get('settings');
      return { ok: true, value: normalizeSettings(settings) };
    }
    if (action === 'page-state') {
      if (sender.tab?.id) {
        await chrome.action.setBadgeText({ tabId: sender.tab.id, text: message.state === 'active' ? 'ON' : message.state === 'scanning' ? '...' : message.state === 'error' ? '!' : '' });
        await chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: message.state === 'error' ? '#b45309' : '#176d61' });
      }
      return { ok: true };
    }
    if (['toggle', 'mask-selection', 'restore', 'state'].includes(action)) return { ok: true, value: await tabAction(action) };
    if (action === 'setup') { await chrome.runtime.openOptionsPage(); return { ok: true }; }
    if (['status', 'self-check', 'unload'].includes(action)) return inference(action);
    if (action === 'detect') {
      if (!Array.isArray(message.segments) || message.segments.some((s: Segment) => typeof s.id !== 'string' || typeof s.text !== 'string')) throw new Error('Invalid viewport request');
      const progressRoute = sender.tab?.id && typeof message.scanId === 'string' && message.scanId.length <= 128
        ? { tabId: sender.tab.id, scanId: message.scanId } : undefined;
      return inference('detect', message.segments, progressRoute);
    }
    throw new Error('Unknown extension action');
  })().then(respond, error => respond({ ok: false, error: error.message || 'Extension request failed' }));
  return true;
});
