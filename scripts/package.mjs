import { execFileSync } from 'node:child_process';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('artifacts', { recursive: true });
const output = resolve(`artifacts/glinvisible-${version}.zip`);
await rm(output, { force: true });
execFileSync('zip', ['-qr', output, '.'], { cwd: 'dist' });
console.log(output);
