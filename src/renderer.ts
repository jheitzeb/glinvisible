import type { PageSegment } from './scanner.ts';
import type { Span } from './types.ts';
type Mask = { rect: DOMRect; text: string; element: Element };
function background(element: Element): string {
  for (let el: Element | null = element; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)' && !/rgba\([^)]*,\s*0(?:\.\d+)?\)$/.test(color)) return color;
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? '#171c22' : '#fff';
}
export class MosaicRenderer {
  readonly host = document.createElement('div');
  readonly shadow: ShadowRoot;
  private canvas = document.createElement('canvas');
  private cover = document.createElement('div');
  private badge = document.createElement('div');
  private masks: Mask[] = [];
  constructor(private onRestore: () => void) {
    this.host.dataset.glinvisible = 'true'; this.host.setAttribute('popover', 'manual');
    this.host.style.cssText = 'position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;height:100vh;background:transparent;pointer-events:none;z-index:2147483647;overflow:hidden;color-scheme:light;';
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial}canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.cover{position:absolute;inset:0;background:#e9efec;display:flex;align-items:center;justify-content:center;font:600 17px system-ui;color:#214b43}.badge{position:absolute;right:18px;bottom:18px;border-radius:12px;background:#183e36;color:white;box-shadow:0 4px 18px #0003;padding:12px 14px;max-width:420px;font:13px/1.45 system-ui;pointer-events:auto}.badge button{margin-left:12px;border:1px solid #ffffff55;border-radius:7px;padding:5px 9px;background:transparent;color:white;cursor:pointer;font:inherit}';
    this.cover.className = 'cover'; this.badge.className = 'badge';
    this.shadow.append(style, this.canvas, this.cover, this.badge);
    document.documentElement.append(this.host);
  }
  show() { if (!this.host.matches(':popover-open')) this.host.showPopover(); }
  status(text: string, covered = false) {
    this.show(); this.cover.hidden = !covered; this.cover.style.display = covered ? 'flex' : 'none';
    this.cover.textContent = covered ? 'GLiNvisible: detecting locally...' : '';
    this.badge.replaceChildren(document.createTextNode(text));
    const button = document.createElement('button'); button.textContent = 'Restore'; button.onclick = this.onRestore;
    this.badge.append(button);
  }
  clear() { this.masks = []; this.paint(8); }
  addSegment(segment: PageSegment, spans: Span[]) {
    for (const span of spans) for (const piece of segment.pieces) {
      const start = Math.max(span.start, piece.start), end = Math.min(span.end, piece.end);
      if (start >= end) continue;
      if (piece.field) this.masks.push({ rect: piece.field.getBoundingClientRect(), text: segment.text.slice(start, end), element: piece.field });
      else if (piece.node?.parentElement) {
        const range = document.createRange(); range.setStart(piece.node, start - piece.start); range.setEnd(piece.node, end - piece.start);
        for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) this.masks.push({ rect, text: segment.text.slice(start, end), element: piece.node.parentElement });
      }
    }
  }
  addElement(element: Element) { this.masks.push({ rect: element.getBoundingClientRect(), text: '', element }); }
  addSelection(range: Range) {
    const parent = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
    if (parent) for (const rect of range.getClientRects()) this.masks.push({ rect, text: range.toString(), element: parent });
  }
  paint(blockSize: number) {
    const ratio = devicePixelRatio || 1;
    this.canvas.width = Math.ceil(innerWidth * ratio); this.canvas.height = Math.ceil(innerHeight * ratio);
    const context = this.canvas.getContext('2d')!; context.scale(ratio, ratio);
    for (const { rect, text, element } of this.masks) {
      if (rect.bottom < 0 || rect.top > innerHeight || rect.width <= 0 || rect.height <= 0) continue;
      const width = Math.ceil(rect.width) + 2, height = Math.ceil(rect.height) + 2;
      const style = getComputedStyle(element);
      const raster = document.createElement('canvas'); raster.width = width; raster.height = height;
      const ctx = raster.getContext('2d')!;
      // Opaque backing ensures original glyphs cannot show through pixel gaps.
      ctx.fillStyle = background(element); ctx.fillRect(0, 0, width, height);
      if (text) {
        ctx.font = style.font || `${style.fontSize} ${style.fontFamily}`; ctx.fillStyle = style.color;
        ctx.textBaseline = 'middle'; ctx.fillText(text, 1, height / 2);
      } else {
        ctx.fillStyle = '#80988f'; ctx.fillRect(0, 0, width, height);
      }
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const block = Math.max(blockSize, Math.round(parseFloat(style.fontSize) * 0.45) || blockSize);
      context.save(); context.beginPath(); context.rect(rect.x - 1, rect.y - 1, width, height); context.clip();
      for (let y = 0; y < height; y += block) for (let x = 0; x < width; x += block) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let yy = y; yy < Math.min(y + block, height); yy++) for (let xx = x; xx < Math.min(x + block, width); xx++) {
          const offset = (yy * width + xx) * 4; r += pixels[offset]; g += pixels[offset + 1]; b += pixels[offset + 2]; count++;
        }
        context.fillStyle = `rgb(${Math.round(r / count)} ${Math.round(g / count)} ${Math.round(b / count)})`;
        context.fillRect(rect.x - 1 + x, rect.y - 1 + y, block, block);
      }
      context.restore();
    }
  }
  destroy() { this.host.remove(); this.masks = []; }
}
