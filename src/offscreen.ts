const worker = new Worker(chrome.runtime.getURL('worker.js'), { type: 'module' });
let sequence = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
worker.onmessage = event => {
  const request = pending.get(event.data.id);
  if (!request) return;
  pending.delete(event.data.id); clearTimeout(request.timer);
  if (event.data.ok) request.resolve(event.data.value);
  else request.reject(new Error(event.data.error));
};
worker.onerror = event => {
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(event.message || 'Local model worker crashed')); }
  pending.clear();
};
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'offscreen' || sender.id !== chrome.runtime.id) return;
  if (pending.size >= 8) { respond({ ok: false, error: 'Local detector is busy. Retry after the current scan.' }); return; }
  const id = ++sequence;
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Local inference timed out. Restore the page and retry.')); }, 180000);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ ...message, id });
  });
  promise.then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error.message }));
  return true;
});
