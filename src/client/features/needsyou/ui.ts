import './ui.css';
import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import type { BannerText } from './logic';

export interface BannerHooks {
  /** To that worker's desk, on whichever floor it is. */
  go(text: BannerText): void;
}

/** How long the needs-you toast stays before it folds into the top bar's counter (ms). */
const HOLD_MS = 8000;
/** How long the counter pulses once it has (ms): three pulses. */
const PULSE_MS = 3600;

/**
 * A unit needs you: the top bar's needs-you counter owns the count. When one starts asking, a compact
 * chip at the top of the view, under the counters, says who and what for (never a toast in the lower
 * left, where it would cover the deck); a click on it or N goes there. After a few seconds it folds
 * away and the counter pulses three times where it went. The edge of the screen flashes as it comes in.
 * In demo mode the chip stays while anyone needs you.
 */
export class Banner {
  private readonly edge: HTMLElement;
  private card: HTMLElement | null = null;
  private shownKey = '';

  constructor(
    hud: HTMLElement,
    private readonly hooks: BannerHooks,
  ) {
    this.edge = document.createElement('div');
    this.edge.className = 'needs-you-flash';
    this.edge.setAttribute('aria-hidden', 'true');
    this.edge.addEventListener('animationend', () => this.edge.classList.remove('on'));
    hud.append(this.edge);
  }

  private get demo(): boolean {
    return document.body.classList.contains('demo');
  }

  /** What it would say now, or null when nobody needs you: a card that's up goes then. Demo mode keeps one up. */
  show(text: BannerText | null) {
    if (!text) {
      this.fold(false);
      return;
    }
    if (this.demo && (!this.card || text.key !== this.shownKey)) this.announce(text);
  }

  /** One has just started asking: the toast, then it folds into the counter. */
  announce(text: BannerText | null) {
    if (!text) return;
    this.card?.remove();
    this.shownKey = text.key;
    const card = h(
      'button.needs-you-chip',
      { type: 'button', role: 'alert', title: text.detail || 'Go there (N)', onclick: () => this.hooks.go(text) },
      h('span.nyc-glyph', { 'aria-hidden': 'true' }, icon('needs-you', 14)),
      h('span.nyc-text', {}, text.title),
      text.more ? h('span.nyc-more', {}, text.more) : null,
      h('kbd', {}, 'N'),
    );
    (document.getElementById('hud') ?? document.body).append(card);
    this.card = card;
    if (!this.demo) setTimeout(() => this.card === card && this.fold(true), HOLD_MS);
  }

  /** The toast goes; with `pulse`, the counter it folds into pulses. */
  private fold(pulse: boolean) {
    this.card?.remove();
    this.card = null;
    this.shownKey = '';
    if (!pulse) return;
    const pill = document.querySelector<HTMLElement>('#counters .counter.c-needs-you');
    if (!pill) return;
    pill.classList.remove('pulse');
    void pill.offsetWidth;
    pill.classList.add('pulse');
    setTimeout(() => pill.classList.remove('pulse'), PULSE_MS);
  }

  /** A worker has just started asking: the edge of the screen pulses a few times. */
  flash() {
    this.edge.classList.remove('on');
    // Read back, so taking the class off and putting it on again starts the animation over.
    void this.edge.offsetWidth;
    this.edge.classList.add('on');
  }
}
