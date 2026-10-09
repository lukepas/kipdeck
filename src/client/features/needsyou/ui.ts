import './ui.css';
import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { paintWait } from '../../ui/waitclock';
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
 * In demo mode the chip stays while anyone needs you. A screen reader hears each new call once, politely
 * (a hidden status line): the chip itself is a plain button, its clock repainting in silence.
 */

/** What a screen reader hears when one starts asking, and the button's own name: who, what, how long, and the key. */
export function spokenCall(text: Pick<BannerText, 'title' | 'ask' | 'wait'>): { said: string; label: string } {
  const said = [text.title, text.ask, text.wait && `waiting ${text.wait}`].filter(Boolean).join(', ');
  return { said, label: `${said}. Go there (N)` };
}
export class Banner {
  private readonly edge: HTMLElement;
  /** The polite status line a new call is said into, once. */
  private readonly live: HTMLElement;
  private card: HTMLElement | null = null;
  private cardId = '';
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
    this.live = h('div.sr-only', { role: 'status', 'aria-live': 'polite' });
    hud.append(this.live);
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
    // The chip that's up keeps its clock live: the same unit, its words and wait drawn again in place.
    if (this.card && text.id === this.cardId) return this.paint(this.card, text);
    if (this.demo && (!this.card || text.key !== this.shownKey)) this.announce(text);
  }

  /** The chip's words for `text`: who, what it asks, how long in its tone, how many more. */
  private paint(card: HTMLElement, text: BannerText) {
    this.shownKey = text.key;
    card.title = text.detail || 'Go there (N)';
    card.setAttribute('aria-label', spokenCall(text).label);
    const set = (cls: string, value: string) => {
      const el = card.querySelector<HTMLElement>(`.${cls}`);
      if (!el || el.textContent === value) return;
      el.textContent = value;
      el.hidden = !value;
    };
    set('nyc-text', text.title);
    set('nyc-ask', text.ask);
    const wait = card.querySelector<HTMLElement>('.nyc-wait');
    if (wait) paintWait(wait, text.wait, text.tone);
    set('nyc-more', text.more);
  }

  /** One has just started asking: the toast, then it folds into the counter. */
  announce(text: BannerText | null) {
    if (!text) return;
    this.card?.remove();
    this.shownKey = text.key;
    const card = h(
      'button.needs-you-chip',
      { type: 'button', title: text.detail || 'Go there (N)', 'aria-label': spokenCall(text).label, onclick: () => this.hooks.go(text) },
      h('span.nyc-glyph', { 'aria-hidden': 'true' }, icon('needs-you', 14)),
      h('span.nyc-text', {}, text.title),
      h('span.nyc-ask', { hidden: !text.ask }, text.ask),
      h('span.nyc-wait.wait-clock', { title: 'How long it has waited', 'aria-hidden': 'true' }),
      h('span.nyc-more', { hidden: !text.more }, text.more),
      h('kbd', {}, 'N'),
    );
    paintWait(card.querySelector<HTMLElement>('.nyc-wait')!, text.wait, text.tone);
    (document.getElementById('hud') ?? document.body).append(card);
    this.live.textContent = spokenCall(text).said;
    this.card = card;
    this.cardId = text.id;
    if (!this.demo) setTimeout(() => this.card === card && this.fold(true), HOLD_MS);
  }

  /** Hides the chip while `held` says the unit it names is quiet (the selected one: its card says the same thing). */
  quietFor(held: (id: string) => boolean) {
    if (this.card) this.card.hidden = !!this.cardId && held(this.cardId);
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
