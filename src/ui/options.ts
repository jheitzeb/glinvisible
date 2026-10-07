import { MODELS, modelById } from '../models/catalog.ts';
import { installed, installModel, removeModel } from '../models/store.ts';
import { normalizeSettings, type Settings, type Category } from '../types.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let settings: Settings;
let controller: AbortController | undefined;
let working = false;
function status(text: string, kind = '') { $('status').textContent = text; $('status').dataset.kind = kind; }
async function refresh() {
  const spec = modelById(settings.modelId);
  const ready = await installed(spec);
  $('model-state').textContent = ready ? 'Downloaded and verified' : 'Model download needed';
  $('model-state').dataset.ready = String(ready);
  $('download').textContent = ready ? 'Download again' : 'Download local model';
  ($('check') as HTMLButtonElement).disabled = !ready || working;
  $('size').textContent = `${Math.round(spec.files.reduce((n, f) => n + f.size, 0) / 1e6)} MB download, stored only in this Chrome profile`;
  $('languages').textContent = spec.languages.join(', ');
}
async function install(files?: File[]) {
  if (working) return;
  working = true; controller = new AbortController();
  $('cancel').hidden = false; ($('download') as HTMLButtonElement).disabled = true;
  ($('import') as HTMLInputElement).disabled = true;
  $('progress').hidden = false;
  try {
    await chrome.runtime.sendMessage({ target: 'background', action: 'unload' });
    await installModel(modelById(settings.modelId), (done, total, file) => {
      ($('progress') as HTMLProgressElement).value = done / total;
      status(`${files ? 'Importing' : 'Downloading'} ${file}: ${Math.round(done / total * 100)}%. Verifying SHA-256 as files arrive.`);
    }, controller.signal, files);
    status('Model installed. Run the offline readiness check, then turn off Wi-Fi.', 'success');
  } catch (e) { status(e instanceof Error ? e.message : 'Installation failed', 'error'); }
  finally {
    working = false; controller = undefined; $('cancel').hidden = true;
    ($('download') as HTMLButtonElement).disabled = false; ($('import') as HTMLInputElement).disabled = false;
    await refresh();
  }
}
async function save() {
  const categories = [...document.querySelectorAll<HTMLInputElement>('[name="category"]:checked')].map(el => el.value as Category);
  settings = normalizeSettings({
    modelId: ($('model') as HTMLSelectElement).value,
    threshold: Number(($('threshold') as HTMLInputElement).value),
    blockSize: Number(($('block-size') as HTMLInputElement).value),
    hideAvatars: ($('avatars') as HTMLInputElement).checked,
    categories, manualTerms: ($('manual') as HTMLTextAreaElement).value.split('\n'),
  });
  await chrome.storage.local.set({ settings });
  status('Preferences saved. Toggle redaction off and on to apply them to an active page.', 'success');
  await refresh();
}
async function init() {
  settings = normalizeSettings((await chrome.storage.local.get('settings')).settings);
  for (const model of MODELS) { const option = document.createElement('option'); option.value = model.id; option.textContent = model.name; ($('model') as HTMLSelectElement).append(option); }
  ($('model') as HTMLSelectElement).value = settings.modelId;
  ($('threshold') as HTMLInputElement).value = String(settings.threshold);
  ($('block-size') as HTMLInputElement).value = String(settings.blockSize);
  ($('avatars') as HTMLInputElement).checked = settings.hideAvatars;
  ($('manual') as HTMLTextAreaElement).value = settings.manualTerms.join('\n');
  document.querySelectorAll<HTMLInputElement>('[name="category"]').forEach(el => { el.checked = settings.categories.includes(el.value as Category); });
  const shortcut = (await chrome.commands.getAll()).find(c => c.name === 'toggle-redaction')?.shortcut;
  $('shortcut').textContent = shortcut || 'No shortcut assigned. Open shortcut settings to choose one.';
  $('download').onclick = () => void install();
  $('cancel').onclick = () => controller?.abort();
  $('save').onclick = () => void save();
  $('shortcuts').onclick = () => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  ($('import') as HTMLInputElement).onchange = event => {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (files.length) void install(files);
  };
  $('remove').onclick = async () => {
    if (working) return;
    await chrome.runtime.sendMessage({ target: 'background', action: 'unload' });
    await removeModel(modelById(settings.modelId)); await refresh(); status('Cached model removed. Your preferences are preserved.');
  };
  $('check').onclick = async () => {
    ($('check') as HTMLButtonElement).disabled = true;
    status('Loading cached weights and detecting a synthetic name and email. No remote requests are permitted. This may take a minute on CPU.');
    try {
      const result = await chrome.runtime.sendMessage({ target: 'background', action: 'self-check' });
      if (!result?.ok) throw new Error(result?.error || 'Readiness check failed');
      const spans = result.value.results[0].spans;
      if (!spans.some((s: { category: string }) => s.category === 'person' || s.category === 'email')) throw new Error('Model loaded, but the synthetic check returned no expected masks.');
      status('Offline ready. Cached model inference passed with remote access blocked. You can turn off Wi-Fi and use the shortcut on a loaded page.', 'success');
      $('offline-ready').hidden = false;
    } catch (e) { status(e instanceof Error ? e.message : 'Readiness check failed', 'error'); }
    finally { await refresh(); }
  };
  await refresh();
}
void init().catch(e => status(e.message, 'error'));
