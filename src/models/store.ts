import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { ModelSpec, ModelFile } from '../types.ts';

async function directory(spec: ModelSpec) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(`${spec.id}-${spec.revision}`, { create: true });
}
export async function installed(spec: ModelSpec): Promise<boolean> {
  try {
    const dir = await directory(spec);
    const marker = await (await dir.getFileHandle('ready.json')).getFile();
    const ready = JSON.parse(await marker.text());
    if (ready.revision !== spec.revision) return false;
    for (const item of spec.files) {
      const file = await (await dir.getFileHandle(item.path)).getFile();
      if (file.size !== item.size || ready.hashes[item.path] !== item.sha256) return false;
    }
    return true;
  } catch { return false; }
}
export async function readAsset(spec: ModelSpec, path: string): Promise<File> {
  if (!await installed(spec)) throw new Error('Local model is not installed. Open setup while online, or import the model files.');
  const dir = await directory(spec);
  return (await dir.getFileHandle(path)).getFile();
}
export async function removeModel(spec: ModelSpec): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try { await root.removeEntry(`${spec.id}-${spec.revision}`, { recursive: true }); } catch (e) {
    if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e;
  }
}
async function writeAsset(dir: FileSystemDirectoryHandle, asset: ModelFile, body: ReadableStream<Uint8Array>, progress: (bytes: number) => void, signal?: AbortSignal) {
  const handle = await dir.getFileHandle(asset.path, { create: true });
  const writer = await handle.createWritable();
  const reader = body.getReader();
  const hash = sha256.create();
  let bytes = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      hash.update(value);
      await writer.write(value as Uint8Array<ArrayBuffer>);
      bytes += value.byteLength;
      if (bytes > asset.size) throw new Error(`Unexpected size for ${asset.path}`);
      progress(bytes);
    }
    if (bytes !== asset.size || bytesToHex(hash.digest()) !== asset.sha256) throw new Error(`Integrity check failed for ${asset.path}. Retry setup.`);
    await writer.close();
  } catch (error) {
    await reader.cancel().catch(() => {});
    await writer.abort().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
/** The only remote fetch in the app is this explicit model installation path. */
export async function installModel(spec: ModelSpec, progress: (bytes: number, total: number, file: string) => void, signal?: AbortSignal, localFiles?: File[]) {
  const dir = await directory(spec);
  await dir.removeEntry('ready.json').catch(() => {});
  let completed = 0;
  const total = spec.files.reduce((sum, file) => sum + file.size, 0);
  for (const asset of spec.files) {
    signal?.throwIfAborted();
    let stream: ReadableStream<Uint8Array>;
    if (localFiles) {
      const file = localFiles.find(f => f.name === asset.path);
      if (!file) throw new Error(`Missing ${asset.path} in selected model folder.`);
      stream = file.stream();
    } else {
      const url = `https://huggingface.co/${spec.repo}/resolve/${spec.revision}/${asset.path}`;
      const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}). Retry setup or import files.`);
      stream = response.body;
    }
    await writeAsset(dir, asset, stream, bytes => progress(completed + bytes, total, asset.path), signal);
    completed += asset.size;
  }
  const writer = await (await dir.getFileHandle('ready.json', { create: true })).createWritable();
  await writer.write(JSON.stringify({ revision: spec.revision, hashes: Object.fromEntries(spec.files.map(f => [f.path, f.sha256])) }));
  await writer.close();
  // Best effort. Extension unlimitedStorage also prevents quota-based eviction.
  await navigator.storage.persist?.().catch(() => false);
}
