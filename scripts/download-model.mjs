import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const result = await build({ entryPoints: ['src/models/catalog.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { MODELS } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
for (const model of MODELS) {
  const dir = `artifacts/models/${model.id}`; await mkdir(dir, { recursive: true });
  for (const asset of model.files) {
    const path = `${dir}/${asset.path}`;
    let bytes = await readFile(path).catch(() => null);
    const valid = value => value?.length === asset.size && createHash('sha256').update(value).digest('hex') === asset.sha256;
    if (!valid(bytes)) {
      console.log(`Downloading ${asset.path} (${Math.round(asset.size / 1e6)} MB)...`);
      const response = await fetch(`https://huggingface.co/${model.repo}/resolve/${model.revision}/${asset.path}`);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (!valid(bytes)) throw new Error(`SHA-256 or size mismatch for ${asset.path}`);
      await writeFile(path, bytes);
    }
    console.log(`Verified ${path}`);
  }
}
console.log('Import this model folder in extension setup. Files never enter the Git repository or extension zip.');
