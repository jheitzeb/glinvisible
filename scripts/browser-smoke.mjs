import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import assert from 'node:assert/strict';
const profile = resolve('artifacts/browser-profile');
await mkdir('artifacts', { recursive: true });
await rm(profile, { recursive: true, force: true });
const extension = resolve('artifacts/smoke-extension');
await rm(extension, { recursive: true, force: true });
await cp('dist', extension, { recursive: true });
// Headless CDP keystrokes do not grant activeTab. This test-only origin stands
// in for the access a real toolbar click or native shortcut grants.
const manifest = JSON.parse(await readFile(`${extension}/manifest.json`, 'utf8'));
manifest.host_permissions.push('file:///*');
await writeFile(`${extension}/manifest.json`, JSON.stringify(manifest));
const executablePath = process.env.CHROMIUM_PATH;
const launch = () => chromium.launchPersistentContext(profile, { headless: true, ignoreDefaultArgs: ['--disable-extensions'], channel: executablePath ? undefined : 'chromium', executablePath, viewport: { width: 1100, height: 850 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--allow-file-access-from-files'] });
let context = await launch();
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const options = await context.newPage(); await options.goto(`chrome-extension://${id}/options.html`);
  await options.waitForSelector('#model option', { state: 'attached' });
  await options.locator('#import').setInputFiles(resolve('artifacts/models/gliner2-pii-q8'));
  await options.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Model installed.'), null, { timeout: 180000 });
  const details = await context.newPage();
  await details.goto('chrome://extensions/');
  const devMode = details.locator('#devMode');
  if (await devMode.getAttribute('aria-pressed') !== 'true' && await devMode.getAttribute('checked') === null) await devMode.click();
  await details.goto(`chrome://extensions/?id=${id}`);
  const fileAccess = details.locator('#allow-on-file-urls cr-toggle');
  if (await fileAccess.getAttribute('checked') === null) await fileAccess.click();
  await new Promise(r => setTimeout(r, 1500));
  console.log('Model import verified. File access enabled. Restarting Chromium.');
  await context.close();
  // Restart Chrome to prove a cold load reads persistent files rather than warm tensors.
  context = await launch();
  const extensionId = id;
  const remote = [];
  context.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await context.route(/^https?:/, route => route.abort());
  await context.setOffline(true);
  const setup = await context.newPage(); await setup.goto(`chrome-extension://${extensionId}/options.html`);
  setup.on('console', msg => console.log('setup:', msg.text()));
  setup.on('pageerror', error => console.log('setup error:', error.message));
  await setup.locator('#check').click();
  await setup.waitForFunction(() => document.querySelector('#status').dataset.kind === 'success' || document.querySelector('#status').dataset.kind === 'error', null, { timeout: 180000 });
  const status = await setup.locator('#status').textContent(); console.log(status);
  assert.match(status, /^Offline ready/);
  await setup.screenshot({ caret: 'initial', path: 'artifacts/setup-offline.png', fullPage: true });
  const page = await context.newPage(); await page.goto(`file://${resolve('test/fixtures/page.html')}`); await page.bringToFront();
  const original = await page.locator('section').innerHTML();
  await page.screenshot({ caret: 'initial', path: 'artifacts/page-before.png' });
  const action = action => setup.evaluate(async action => chrome.runtime.sendMessage({ target: 'background', action }), action);
  const toggle = await action('toggle'); assert.equal(toggle?.ok, true, JSON.stringify(toggle));
  async function waitState() {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const result = await action('state');
      if (!result?.ok) throw new Error(result?.error || 'Extension did not respond');
      if (result.value?.state === 'error') throw new Error(result.value.detail);
      if (result.value?.state === 'active') return result.value;
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Redaction timed out');
  }
  const first = await waitState(); console.log('page:', first);
  assert.match(first.detail, /[1-9]\d* detected masks/);
  assert.equal(await page.locator('[data-glinvisible]').count(), 1);
  assert.equal(await page.locator('section').innerHTML(), original);
  await page.screenshot({ caret: 'initial', path: 'artifacts/page-redacted.png' });
  await page.locator('#dynamic').evaluate(el => el.textContent = 'New message from Alice Smith: alice@example.com');
  await new Promise(r => setTimeout(r, 250));
  const changed = await waitState(); console.log('changed:', changed);
  await page.screenshot({ caret: 'initial', path: 'artifacts/page-dynamic.png' });
  await page.locator('section p').nth(2).evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  const manual = await action('mask-selection'); assert.equal(manual.ok, true);
  await new Promise(r => setTimeout(r, 250)); await waitState();
  await page.screenshot({ caret: 'initial', path: 'artifacts/page-manual.png' });
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await new Promise(r => setTimeout(r, 250));
  const scrolled = await waitState(); assert.match(scrolled.detail, /[1-9]\d* detected masks/);
  await page.screenshot({ caret: 'initial', path: 'artifacts/page-scrolled.png' });
  const restore = await action('restore'); assert.equal(restore.ok, true);
  assert.equal(await page.locator('[data-glinvisible]').count(), 0);
  assert.equal(await page.locator('input').inputValue(), 'alice@example.com');
  assert.deepEqual(remote, [], `Unexpected remote requests: ${remote.join(', ')}`);
  const evidence = { date: new Date().toISOString(), chromium: context.browser()?.version(), fixtureOnlyFilePermission: true, coldRestart: true, browserOffline: true, remoteRequests: remote.length, selfCheck: status, first, changed, manualSelection: true, scrollRescan: true, originalDomPreserved: true, restored: true };
  await writeFile('artifacts/offline-smoke.json', JSON.stringify(evidence, null, 2));
  console.log('PASS: cached model, cold restart, offline inference, DOM overlay, dynamic content, restore, zero remote requests.');
} finally { await context.close(); }
