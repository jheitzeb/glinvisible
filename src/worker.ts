import { modelById } from './models/catalog.ts';
import { installed } from './models/store.ts';
import { createDetector } from './models/registry.ts';
import { localPatterns, mergeSpans } from './patterns.ts';
import type { Detector, Segment, Settings, ScanProgress } from './types.ts';

let detector: Detector | undefined;
// Defend the offline contract: inference workers have no remote fetch route.
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, import.meta.url);
  if (url.origin !== new URL(import.meta.url).origin) throw new Error('Remote access is disabled during local inference');
  return originalFetch(input, init);
}) as typeof fetch;

async function handle(message: { action: string; settings: Settings; segments?: Segment[] }, progress: (value: ScanProgress) => void) {
  const spec = modelById(message.settings.modelId);
  if (message.action === 'status') return { installed: await installed(spec), loaded: detector?.id === spec.id, name: spec.name };
  if (message.action === 'unload') { await detector?.dispose(); detector = undefined; return { unloaded: true }; }
  if (message.action !== 'detect' && message.action !== 'self-check') throw new Error('Unknown inference request');
  const segments = message.action === 'self-check' ? [{ id: 'synthetic', text: 'John Doe lives at 742 Evergreen Terrace, email john@example.com.' }] : message.segments ?? [];
  if (segments.length > 120 || segments.reduce((n, s) => n + s.text.length, 0) > 18000) throw new Error('Viewport is too large. Scroll to a smaller region and retry.');
  if (!detector || detector.id !== spec.id) {
    progress({ phase: 'loading', completed: 0, total: segments.length });
    await detector?.dispose(); detector = undefined;
    const next = createDetector(spec);
    try { await next.load(); detector = next; } catch (error) { await next.dispose().catch(() => {}); throw error; }
  }
  progress({ phase: 'scanning', completed: 0, total: segments.length });
  const results = [];
  for (const segment of segments) {
    const modelSpans = await detector.detect(segment.text, message.settings.threshold);
    if (message.action === 'self-check') {
      if (!modelSpans.some(s => s.category === 'person' && segment.text.slice(s.start, s.end) === 'John Doe') ||
          !modelSpans.some(s => s.category === 'email' && segment.text.slice(s.start, s.end) === 'john@example.com')) {
        throw new Error('Cached model inference did not return the expected synthetic name and email.');
      }
    }
    const patterns = localPatterns(segment.text, message.settings.manualTerms);
    const allowed = [...modelSpans, ...patterns].filter(s => message.action === 'self-check' || s.source === 'manual' || message.settings.categories.includes(s.category));
    results.push({ id: segment.id, spans: mergeSpans(allowed, segment.text.length) });
    progress({ phase: 'scanning', completed: results.length, total: segments.length });
  }
  return { results, model: spec.id, offline: true };
}
let chain = Promise.resolve();
self.onmessage = event => {
  const { id, ...message } = event.data;
  chain = chain.then(async () => {
    try { self.postMessage({ id, ok: true, value: await handle(message, progress => self.postMessage({ id, type: 'progress', progress })) }); }
    catch (e) { self.postMessage({ id, ok: false, error: e instanceof Error ? e.message : 'Local inference failed' }); }
  });
};
