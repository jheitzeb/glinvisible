import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-web/wasm';
import type { Detector, ModelSpec, Span } from '../types.ts';
import { readAsset } from './store.ts';
import { chunkText, prepareInput } from './preprocess.ts';
import { decodeSpans, numericData } from './decode.ts';

export class Gliner2Detector implements Detector {
  readonly id: string;
  private tokenizer?: Tokenizer;
  private session?: ort.InferenceSession;
  constructor(private readonly spec: ModelSpec) { this.id = spec.id; }
  async load() {
    // Every runtime asset is bundled with the extension. No CDN or lazy remote load.
    ort.env.wasm.wasmPaths = new URL('runtime/', import.meta.url).href;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const tokenizerFile = await readAsset(this.spec, 'tokenizer.json');
    const configFile = await readAsset(this.spec, 'tokenizer_config.json');
    this.tokenizer = new Tokenizer(JSON.parse(await tokenizerFile.text()), JSON.parse(await configFile.text()));
    const graphFile = await readAsset(this.spec, 'model_q8.onnx');
    const weightsFile = await readAsset(this.spec, 'model_q8.onnx.data');
    this.session = await ort.InferenceSession.create(await graphFile.arrayBuffer(), {
      executionProviders: ['wasm'], graphOptimizationLevel: 'all',
      externalData: [{ path: 'model_q8.onnx.data', data: new Uint8Array(await weightsFile.arrayBuffer()) }],
    });
  }
  async detect(text: string, threshold: number): Promise<Span[]> {
    if (!this.session || !this.tokenizer) throw new Error('Local detector is not loaded');
    const result: Span[] = [];
    for (const chunk of chunkText(text)) {
      const input = prepareInput(chunk.text, word => this.tokenizer!.encode(word, { add_special_tokens: false }).ids);
      // Rechunk exceptionally long words instead of feeding an oversized context.
      if (input.inputIds.length > 512) {
        if (input.words.length <= 1) throw new Error('A visible text token exceeds the model context. Add a manual mask for this region.');
        const smaller = Math.max(1, Math.floor(input.words.length / 2));
        for (const sub of chunkText(chunk.text, smaller, Math.min(1, smaller - 1))) {
          const spans = await this.detect(sub.text, threshold);
          result.push(...spans.map(s => ({ ...s, start: s.start + chunk.offset + sub.offset, end: s.end + chunk.offset + sub.offset })));
        }
        continue;
      }
      const tensor = (data: number[], dims: number[]) => new ort.Tensor('int64', BigInt64Array.from(data, BigInt), dims);
      const feeds = {
        input_ids: tensor(input.inputIds, [1, input.inputIds.length]),
        attention_mask: tensor(input.attentionMask, [1, input.inputIds.length]),
        text_word_indices: tensor(input.wordIndices, [1, input.words.length]),
        text_word_counts: tensor([input.words.length], [1]),
      };
      const outputs = await this.session.run(feeds);
      try {
        const scores = outputs.span_scores;
        const count = outputs.count_logits;
        if (!scores || !count) throw new Error('The selected model has an incompatible tensor contract');
        const counts = numericData(count.data as ArrayLike<number | bigint>, count.type);
        let best = 0;
        for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
        if (best > 0) result.push(...decodeSpans(numericData(scores.data as ArrayLike<number | bigint>, scores.type), scores.dims, input.words, threshold)
          .map(s => ({ ...s, start: s.start + chunk.offset, end: s.end + chunk.offset })));
      } finally {
        Object.values(outputs).forEach(t => t.dispose());
        Object.values(feeds).forEach(t => t.dispose());
      }
    }
    return result;
  }
  async dispose() { await this.session?.release(); this.session = undefined; this.tokenizer = undefined; }
}
