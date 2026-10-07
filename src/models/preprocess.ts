export const LABELS = ['name', 'address', 'email', 'phone_num', 'id_num', 'url', 'username'] as const;
export type Word = { text: string; start: number; end: number };
// Matches upstream GLiNER2's whitespace splitter; offsets remain UTF-16 for DOM Range.
export function splitWords(text: string): Word[] {
  const pattern = /(?:https?:\/\/[^\s]+|www\.[^\s]+)|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|@[a-z0-9_]+|[\p{L}\p{N}_]+(?:[-_][\p{L}\p{N}_]+)*|\S/giu;
  return [...text.matchAll(pattern)].map(m => ({ text: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length }));
}
export function prepareInput(text: string, encode: (word: string) => number[]) {
  const schema = ['(', '[P]', 'entities', '(', ...LABELS.flatMap(label => ['[E]', label]), ')', ')', '[SEP_TEXT]'];
  const inputIds = schema.flatMap(encode);
  const words = splitWords(text);
  const wordIndices: number[] = [];
  for (const word of words) {
    const tokens = encode(word.text);
    if (!tokens.length) throw new Error('Tokenizer produced an empty word. Scan stopped to preserve span alignment.');
    wordIndices.push(inputIds.length);
    inputIds.push(...tokens);
  }
  return { inputIds, attentionMask: inputIds.map(() => 1), wordIndices, words };
}
/** Overlapping word chunks preserve entities crossing a boundary. Never truncate silently. */
export function chunkText(text: string, maxWords = 80, overlap = 12): { text: string; offset: number }[] {
  if (maxWords <= overlap || overlap < 0) throw new Error('Invalid chunk dimensions');
  const words = splitWords(text);
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords - overlap) {
    const end = Math.min(i + maxWords, words.length);
    chunks.push({ text: text.slice(words[i].start, words[end - 1].end), offset: words[i].start });
    if (end === words.length) break;
  }
  return chunks;
}
