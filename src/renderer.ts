import type { PageSegment } from './scanner.ts';
import type { Span, ScanProgress } from './types.ts';
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
  private title = document.createElement('strong');
  private message = document.createElement('p');
  private spinner = document.createElement('span');
  private track = document.createElement('div');
  private fill = document.createElement('div');
  private counter = document.createElement('span');
  constructor(private onRestore: () => void) {
    this.host.dataset.glinvisible = 'true'; this.host.setAttribute('popover', 'manual');
    this.host.style.cssText = 'position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;height:100vh;background:transparent;pointer-events:none;z-index:2147483647;overflow:hidden;color-scheme:light;';
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host{all:initial}[hidden]{display:none!important}
      canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
      .cover{position:absolute;inset:0;background:rgb(243 247 242 / 18%);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:24px;font:14px/1.5 system-ui;color:#214b43}
      .cover[data-error]{background:#e9efec;backdrop-filter:none}
      .card{width:min(360px,100%);box-sizing:border-box;padding:22px 24px;border:1px solid #ffffffab;border-radius:16px;background:rgb(255 255 255 / 94%);box-shadow:0 12px 42px #173b3626;pointer-events:auto}
      .heading{display:flex;align-items:center;gap:11px}.heading strong{font-size:16px;font-weight:650}
      .spinner{width:17px;height:17px;border:2px solid #d4e5dc;border-top-color:#217867;border-radius:50%;animation:spin .85s linear infinite;flex-shrink:0}
      .card p{font-size:13px;color:#60756c;margin:13px 0 18px}
      .track{height:5px;background:#e3ebe5;border-radius:8px;overflow:hidden}
      .fill{height:100%;background:#217867;border-radius:inherit;transition:width .18s ease;width:0}
      .track[data-indeterminate] .fill{width:35%;animation:sweep 1.3s ease-in-out infinite}
      .footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:13px;font-size:11px;color:#60756c}
      button{border:1px solid #cbdcd1;border-radius:7px;padding:5px 9px;background:transparent;color:#315f50;cursor:pointer;font:12px system-ui}
      .badge{position:absolute;right:18px;bottom:18px;border-radius:12px;background:#183e36;color:white;box-shadow:0 4px 18px #0003;padding:12px 14px;max-width:420px;font:13px/1.45 system-ui;pointer-events:auto}
      .badge button{margin-left:12px;border-color:#ffffff55;color:white;font:inherit}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes sweep{0%{transform:translateX(-105%)}100%{transform:translateX(390%)}}
      @media(prefers-reduced-motion:reduce){.spinner,.track[data-indeterminate] .fill{animation:none}.fill{transition:none}}
    `;
    this.cover.className = 'cover'; this.cover.hidden = true; this.badge.className = 'badge';
    const card = document.createElement('div'); card.className = 'card';
    const heading = document.createElement('div'); heading.className = 'heading';
    this.spinner.className = 'spinner'; this.spinner.setAttribute('aria-hidden', 'true');
    this.message.setAttribute('role', 'status');
    heading.append(this.spinner, this.title);
    this.track.className = 'track'; this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-label', 'Visible text blocks checked');
    this.track.setAttribute('aria-valuemin', '0'); this.track.setAttribute('aria-valuemax', '100');
    this.fill.className = 'fill'; this.track.append(this.fill);
    const footer = document.createElement('div'); footer.className = 'footer';
    const cancel = document.createElement('button'); cancel.textContent = 'Restore page'; cancel.onclick = onRestore;
    footer.append(this.counter, cancel);
    card.append(heading, this.message, this.track, footer); this.cover.append(card);
    this.shadow.append(style, this.canvas, this.cover, this.badge);
    document.documentElement.append(this.host);
  }
  show() { if (!this.host.matches(':popover-open')) this.host.showPopover(); }
  scanning(text: string, progress?: ScanProgress) {
    this.show(); this.host.dataset.state = 'scanning';
    this.cover.hidden = false; delete this.cover.dataset.error; this.badge.hidden = true;
    this.spinner.hidden = false; this.track.hidden = false; this.counter.hidden = false;
    this.title.textContent = 'Redacting locally'; this.message.textContent = text;
    const loading = !progress || progress.phase === 'loading';
    const total = progress?.total ?? 0, completed = Math.min(total, Math.max(0, progress?.completed ?? 0));
    this.counter.textContent = progress ? `${completed} of ${total} text blocks checked` : 'Preparing visible text...';
    if (loading) {
      this.track.dataset.indeterminate = 'true';
      this.track.removeAttribute('aria-valuenow'); this.track.setAttribute('aria-valuetext', text);
    } else {
      delete this.track.dataset.indeterminate;
      const percent = total ? Math.floor(completed / total * 100) : 100;
      this.fill.style.width = `${percent}%`;
      this.track.setAttribute('aria-valuenow', String(percent)); this.track.setAttribute('aria-valuetext', this.counter.textContent);
    }
  }
  error(text: string) {
    this.show(); this.host.dataset.state = 'error';
    this.cover.hidden = false; this.cover.dataset.error = 'true'; this.badge.hidden = true;
    this.spinner.hidden = true; this.track.hidden = true; this.counter.hidden = true;
    this.title.textContent = 'Scan paused'; this.message.textContent = text;
  }
  status(text: string) {
    this.show(); this.host.dataset.state = 'active'; this.cover.hidden = true; this.badge.hidden = false;
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
