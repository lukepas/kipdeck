// VESPER's caption: one line low over the 3D view, like a subtitle, shown for a few seconds and then
// faded out. Plain words, no hue and no sound (the deck's four cues are the only sounds it has).
import './caption.css';
import { h } from '../../ui/dom';

export class VoiceCaption {
  private readonly line = h('span.vesper-line');
  private readonly el = h('div.vesper', { role: 'status', 'aria-live': 'polite' }, h('span.vesper-name', {}, 'VESPER'), this.line);
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
