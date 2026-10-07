import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Tokenizer } from '@huggingface/tokenizers';
import { chunkText, prepareInput, splitWords } from '../src/models/preprocess.ts';
import { decodeSpans, numericData } from '../src/models/decode.ts';
import { localPatterns, mergeSpans } from '../src/patterns.ts';

test('UTF-16 offsets preserve original spelling and surrogate pairs', () => {
  const text = 'Hi 🦊, Élodie Smith: john@example.com';
  const words = splitWords(text);
  for (const word of words) assert.equal(text.slice(word.start, word.end).toLowerCase(), word.text);
  assert.equal(words.find(w => w.text === '🦊')!.end - words.find(w => w.text === '🦊')!.start, 2);
});
test('overlapping chunks cover the entire document and carry absolute offsets', () => {
  const text = Array.from({ length: 240 }, (_, i) => `word${i}`).join(' ');
  const chunks = chunkText(text);
  assert.deepEqual(chunkText('first second', 1, 0).map(c => c.text), ['first', 'second']);
  assert.equal(chunks[0].offset, 0);
  assert.equal(chunks.at(-1)!.offset + chunks.at(-1)!.text.length, text.length);
  for (let i = 1; i < chunks.length; i++) assert.ok(chunks[i].offset < chunks[i - 1].offset + chunks[i - 1].text.length);
});
test('half precision values are decoded as floats, including signed values', () => {
  assert.deepEqual(Array.from(numericData(new Uint16Array([0x3c00, 0x3800, 0xbc00, 1]), 'float16')), [1, 0.5, -1, 2 ** -24]);
});
test('span decoder respects widths, thresholds and original character boundaries', () => {
  const words = splitWords('John Doe visits home.');
  const data = new Float32Array(7 * words.length * 8);
  data[1] = 0.95; data[0] = 0.8;
  const spans = decodeSpans(data, [1, 7, words.length, 8], words, 0.5);
  assert.deepEqual(spans.map(s => [s.start, s.end, s.category]), [[0, 8, 'person']]);
});
test('literal manual terms and overlapping model masks preserve full coverage', () => {
  const text = 'Project [A+B] uses joe@example.com';
  const spans = localPatterns(text, ['[A+B]']);
  assert.equal(text.slice(spans.find(s => s.source === 'manual')!.start, spans.find(s => s.source === 'manual')!.end), '[A+B]');
  const merged = mergeSpans([{ start: 0, end: 8, category: 'person', score: 0.8, source: 'model' }, { start: 5, end: 12, category: 'email', score: 1, source: 'pattern' }], 20);
  assert.deepEqual(merged.map(s => [s.start, s.end]), [[0, 12]]);
});
const tokenizerPath = 'artifacts/models/gliner2-pii-q8/tokenizer.json';
test('real tokenizer exactly matches pinned upstream inference fixture', { skip: !existsSync(tokenizerPath) }, () => {
  const ref = JSON.parse(readFileSync('test/reference/gliner2-smoke.json', 'utf8'));
  const tokenizer = new Tokenizer(JSON.parse(readFileSync(tokenizerPath, 'utf8')), JSON.parse(readFileSync('artifacts/models/gliner2-pii-q8/tokenizer_config.json', 'utf8')));
  const input = prepareInput(ref.text, word => tokenizer.encode(word, { add_special_tokens: false }).ids);
  assert.deepEqual(input.inputIds, ref.feed.input_ids[0]);
  assert.deepEqual(input.wordIndices, ref.feed.text_word_indices[0]);
  assert.deepEqual(input.words.map(w => w.start), ref.start_mapping);
  assert.deepEqual(input.words.map(w => w.end), ref.end_mapping);
});
