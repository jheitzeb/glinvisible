import type { Span } from './types.ts';
export function localPatterns(text: string, manualTerms: string[] = []): Span[] {
  const spans: Span[] = [];
  const patterns: [Span['category'], RegExp][] = [
    ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
    ['phone', /(?<!\w)(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]\d{3,4}[ .-]\d{3,4}(?!\w)/g],
    ['identifier', /\b\d{3}-\d{2}-\d{4}\b/g],
    ['secret', /\b(?:sk-[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/g],
  ];
  for (const [category, regex] of patterns) for (const m of text.matchAll(regex)) spans.push({
    start: m.index!, end: m.index! + m[0].length, category, score: 1, source: 'local-pattern',
  });
  for (const term of manualTerms) {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) continue;
    for (const m of text.matchAll(new RegExp(escaped, 'giu'))) spans.push({ start: m.index!, end: m.index! + m[0].length, category: 'person', score: 1, source: 'manual' });
  }
  return spans;
}
export function mergeSpans(spans: Span[], length: number): Span[] {
  const valid = spans.filter(s => Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end <= length && s.end > s.start).sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const span of valid) {
    const last = merged.at(-1);
    if (last && span.start < last.end) { last.end = Math.max(last.end, span.end); last.score = Math.max(last.score, span.score); }
    else merged.push({ ...span });
  }
  return merged;
}
