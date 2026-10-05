// VESPER's caption: one line low over the 3D view, like a subtitle, shown for a few seconds and then
// faded out. Plain words, no hue and no sound (the deck's four cues are the only sounds it has).
import './caption.css';
import { h } from '../../ui/dom';

/** VESPER's mark: five bars of a still waveform, so the ship's mind reads as someone speaking. */
function waveGlyph(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 14');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('vesper-wave');
  [4, 9, 13, 7, 3].forEach((hgt, i) => {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', String(1 + i * 4));
    r.setAttribute('y', String((14 - hgt) / 2));
    r.setAttribute('width', '2');
    r.setAttribute('height', String(hgt));
    r.setAttribute('rx', '1');
    svg.append(r);
  });
  return svg;
}

export class VoiceCaption {
  private readonly line = h('span.vesper-line');
  private readonly el = h('div.vesper', { role: 'status', 'aria-live': 'polite' }, waveGlyph(), h('span.vesper-name', {}, 'VESPER'), this.line);
  private timer = 0;

  constructor() {
    (document.getElementById('hud') ?? document.body).append(this.el);
  }

  /** Shows `text` for `ms`, in place of whatever was up. */
  say(text: string, ms: number) {
    clearTimeout(this.timer);
    this.line.textContent = text;
    this.el.hidden = false;
    // Next frame, so the fade runs from nothing.
    requestAnimationFrame(() => this.el.classList.add('on'));
    this.timer = window.setTimeout(() => this.clear(), ms);
  }

  /** Fades the line out now. */
  clear() {
    clearTimeout(this.timer);
    this.el.classList.remove('on');
    this.timer = window.setTimeout(() => (this.line.textContent = ''), 450);
  }

  /** What it shows now ('' for nothing): the shots read it. */
  get text(): string {
    return this.el.classList.contains('on') ? (this.line.textContent ?? '') : '';
  }
}
