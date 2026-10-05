// A celebration's card: the ship's log slip under the top bar, for a waypoint's numbers, the mission's
// roll of the units that merged, or any moment that comes out as its card (Settings > Bridge >
// Celebrations at Cards only, reduced motion, or one held too long behind a call). One at a time, the
// newest in place of the last. It never takes the mouse: it shows while you keep walking and puts itself
// away after a while. A ✕ top right puts it away now, and so does Esc while the mouse is free, which
// hands the mouse straight back to the view, as every window does.
import './card.css';
import type { MomentCard } from '../../../shared/shiplog';
import { h, modalOpen } from '../../ui/dom';
import { icon } from '../../ui/icons';

export class MomentCards {
  private readonly title = h('p.moment-card-title');
  private readonly body = h('div');
  private readonly voice = h('p.moment-card-voice');
  private readonly el: HTMLElement;
  private timer = 0;
  private shown: MomentCard | null = null;

  constructor(private readonly backToGame: () => void) {
    const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => this.close(true) }, icon('close', 16));
    this.el = h('div.moment-card', { role: 'status', 'aria-live': 'polite', hidden: true }, this.title, this.body, this.voice, close);
    (document.getElementById('hud') ?? document.body).append(this.el);
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !this.shown || modalOpen() || document.pointerLockElement) return;
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
      },
      true,
    );
  }

  /** Shows `card` for `ms`, with VESPER's line under it when there is one. */
  show(card: MomentCard, ms: number, voice?: string | null) {
    clearTimeout(this.timer);
    this.shown = card;
    this.title.textContent = card.title;
    this.body.replaceChildren(...card.lines.map((l) => h('p.moment-card-line', {}, l)));
    this.voice.textContent = voice ?? '';
    this.voice.hidden = !voice;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('on'));
    this.timer = window.setTimeout(() => this.close(false), ms);
  }

  /** Puts it away; `byHand` (its ✕ or Esc) also gives the view the mouse back. */
  close(byHand: boolean) {
    if (!this.shown) return;
    clearTimeout(this.timer);
    this.shown = null;
    this.el.classList.remove('on');
    this.timer = window.setTimeout(() => (this.el.hidden = true), 420);
    if (byHand) this.backToGame();
  }

  /** What it shows now, if anything (the shots read it). */
  get card(): MomentCard | null {
    return this.shown;
  }
}
