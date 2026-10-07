import type { ModelSpec } from '../types.ts';
export const MODELS: ModelSpec[] = [{
  id: 'gliner2-pii-q8', name: 'GLiNER2-PII (local, Q8)',
  upstream: 'fastino/gliner2-privacy-filter-PII-multi',
  repo: 'okasi/gliner2-privacy-filter-pii-multi-onnx',
  revision: '9b451660064ee7e4e8367642633e9d390ea31465',
  adapter: 'gliner2-onnx', license: 'Apache-2.0',
  languages: ['English', 'French', 'Spanish', 'German', 'Italian', 'Portuguese', 'Dutch'],
  files: [
    { path: 'model_q8.onnx', size: 1347162, sha256: '261ee74758005ee265b999299e3d7091ddd541dceccdef414017a69beb4854a4' },
    { path: 'model_q8.onnx.data', size: 533282304, sha256: '55aa98140705a476aea88ad53abf24967066e2460ffe57ef7dc86f4fad87eeff' },
    { path: 'tokenizer.json', size: 16020604, sha256: 'f6df10ec83bea993035b2dd7c39345a3d4fcf23421c2adb6cb4ffc1e6d1bc4b5' },
    { path: 'tokenizer_config.json', size: 712, sha256: 'ab84e8318d586902fe9eb64234524ddf938de745d12164ff07ec9a1f39402220' },
  ],
}];
export function modelById(id: string): ModelSpec {
  const model = MODELS.find(m => m.id === id);
  if (!model) throw new Error(`Unknown local model: ${id}`);
  return model;
}
