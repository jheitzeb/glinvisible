import type { Segment } from './types.ts';
export type Piece = { node?: Text; field?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; start: number; end: number; snapshot: string };
export type PageSegment = Segment & { pieces: Piece[] };
const SKIP = 'script,style,noscript,template,[hidden],[aria-hidden="true"],input,textarea,select,option';
function visible(element: Element) {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility !== 'visible' || style.opacity === '0') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
}
function blockFor(element: Element): Element {
  let block = element;
  while (block.parentElement && !/^(block|flex|grid|table-cell|list-item|flow-root)$/.test(getComputedStyle(block).display)) block = block.parentElement;
  return block;
}
export function collectViewport(host: HTMLElement): { segments: PageSegment[]; media: Element[] } {
  const groups = new Map<Element, PageSegment>();
  const media: Element[] = [];
  const roots: (Document | ShadowRoot)[] = [document];
  let id = 0;
  for (let rootIndex = 0; rootIndex < roots.length; rootIndex++) {
    const root = roots[rootIndex];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!parent || parent === host || parent.closest(SKIP) || !node.data || !visible(parent)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      if (![...range.getClientRects()].some(r => r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) continue;
      const block = blockFor(parent);
      let group = groups.get(block);
      if (!group) { group = { id: String(++id), text: '', pieces: [] }; groups.set(block, group); }
      // Inline nodes stay adjacent, preserving names like John <b>Doe</b>.
      const start = group.text.length;
      group.text += node.data;
      group.pieces.push({ node, start, end: group.text.length, snapshot: node.data });
    }
    for (const element of root.querySelectorAll('*')) {
      if (element === host) continue;
      if (element.shadowRoot) roots.push(element.shadowRoot);
      if (element.matches('iframe,canvas,video') && visible(element)) media.push(element);
    }
    for (const field of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input:not([type="hidden"]):not([type="password"]),textarea,select')) {
      if (!visible(field)) continue;
      const text = field instanceof HTMLSelectElement ? field.selectedOptions[0]?.textContent ?? '' : field.value || field.placeholder;
      if (!text.trim()) continue;
      groups.set(field, { id: String(++id), text, pieces: [{ field, start: 0, end: text.length, snapshot: text }] });
    }
  }
  const segments = [...groups.values()].filter(segment => segment.text.trim());
  if (segments.length > 120 || segments.reduce((n, s) => n + s.text.length, 0) > 18000) throw new Error('This viewport contains too much text. Zoom in or reduce the visible region, then retry.');
  return { segments, media };
}
export function segmentUnchanged(segment: PageSegment): boolean {
  return segment.pieces.every(p => p.node ? p.node.isConnected && p.node.data === p.snapshot : p.field?.isConnected && (p.field instanceof HTMLSelectElement ? p.field.selectedOptions[0]?.textContent ?? '' : p.field!.value || p.field!.placeholder) === p.snapshot);
}
