import type { Category, Span } from '../types.ts';
import { LABELS, type Word } from './preprocess.ts';
const CATEGORIES: Category[] = ['person', 'address', 'email', 'phone', 'identifier', 'url', 'username'];
/** ONNX float16 tensors store IEEE-754 bits in Uint16Array. */
export function numericData(data: ArrayLike<number | bigint>, type: string): ArrayLike<number> {
  if (type !== 'float16') return data as ArrayLike<number>;
  return Float32Array.from(Array.from(data, value => {
    const bits = Number(value), sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >>> 10) & 31, fraction = bits & 1023;
    return exponent === 31 ? (fraction ? NaN : sign * Infinity) :
      sign * (exponent === 0 ? fraction * 2 ** -24 : (1 + fraction / 1024) * 2 ** (exponent - 15));
  }));
}
export function decodeSpans(data: ArrayLike<number>, dims: readonly number[], words: Word[], threshold: number): Span[] {
  if (dims.length !== 4 || dims[0] !== 1 || dims[1] !== LABELS.length || dims[2] < words.length) throw new Error('Unexpected GLiNER2 output shape');
  const [, labels, wordCount, widths] = dims;
  const result: Span[] = [];
  for (let label = 0; label < labels; label++) {
    const candidates: Span[] = [];
    for (let start = 0; start < words.length; start++) {
      for (let width = 0; width < widths && start + width < words.length; width++) {
        const score = Number(data[(label * wordCount + start) * widths + width]);
        if (Number.isFinite(score) && score >= threshold) candidates.push({
          start: words[start].start, end: words[start + width].end,
          category: CATEGORIES[label], score, source: 'gliner2-pii-q8',
        });
      }
    }
    // Greedy non-overlap per label follows the export's reference decoder.
    const selected: Span[] = [];
    for (const span of candidates.sort((a, b) => b.score - a.score)) {
      if (!selected.some(s => span.start < s.end && s.start < span.end)) selected.push(span);
    }
    result.push(...selected);
  }
  return result.sort((a, b) => a.start - b.start || a.end - b.end);
}
