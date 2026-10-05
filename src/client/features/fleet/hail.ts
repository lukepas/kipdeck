// The hail strip: a line of mono lettering in the canopy's top-left corner. A sister deck's waypoint
// reached shows there for a few seconds ("HAIL FROM BILLING-API: WAYPOINT STRIPE V2 REACHED"), and
// under it, quietly, how many decks fly past the eight in view. Plain words, no hue, no sound.
import './hail.css';
import { h } from '../../ui/dom';

export class HailStrip {
  private readonly el = h('div.hail-strip', { 'aria-live': 'polite' });
  private readonly line = h('span.hail');
  private readonly more = h('span.more');
  private timer = 0;

  constructor() {
    this.el.append(this.line, this.more);
    (document.getElementById('hud') ?? document.body).append(this.el);
  }

  /** Shows `text` for `ms`, in place of whatever hail was up. */
  hail(text: string, ms: number) {
    clearTimeout(this.timer);
    this.line.textContent = text;
    this.line.classList.add('on');
    this.timer = window.setTimeout(() => {
      this.line.classList.remove('on');
      this.timer = window.setTimeout(() => (this.line.textContent = ''), 200);
    }, ms);
  }

  /** The decks past the ones in view ('' for none). */
  setMore(text: string) {
    if (this.more.textContent !== text) this.more.textContent = text;
  }

  /** Off with the strip (the fleet switched off). */
  show(on: boolean) {
    this.el.hidden = !on;
  }
}
