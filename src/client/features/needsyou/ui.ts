import './ui.css';
import { h } from '../../ui/dom';
import type { BannerText } from './logic';
import { icon } from '../../ui/icons';

export interface BannerHooks {
  /** To that worker's desk, on whichever floor it is. */
  go(text: BannerText): void;
  /** Put away until someone else needs you. */
  hide(): void;
}

/**
 * The banner under the top bar while a worker needs you, on any floor: who, what it's asking and for
 * how long, and a click away from its desk (N gets you there too). The edge of the screen flashes red when one starts asking.
 */
export class Banner {
  private readonly el: HTMLElement;
  private readonly go: HTMLButtonElement;
  private readonly edge: HTMLElement;
  private shown: BannerText | null = null;

  constructor(
    private readonly hud: HTMLElement,
    hooks: BannerHooks,
  ) {
    this.go = h('button.needs-you-go', { type: 'button', onclick: () => this.shown && hooks.go(this.shown) });
    const x = h('button.needs-you-x', { type: 'button', 'aria-label': 'Hide', title: 'Hide until another unit needs you', onclick: () => hooks.hide() }, icon('close', 16));
    this.el = h('div.needs-you-alert.hidden', { role: 'status', 'aria-live': 'polite' }, this.go, x);
    this.edge = h('div.needs-you-flash', { 'aria-hidden': 'true' });
    this.edge.addEventListener('animationend', () => this.edge.classList.remove('on'));
    hud.append(this.el, this.edge);
    window.addEventListener('resize', () => this.place());
  }

  /** What it says now, or null to put it away. It's only redrawn when it would read differently, so a click never lands on a button that's just been swapped. */
  show(text: BannerText | null) {
    if (text?.key === this.shown?.key) return;
    this.shown = text;
    this.el.classList.toggle('hidden', !text);
    if (!text) return;
    this.go.title = `Go to ${text.title.replace(/ needs you$/, '')}'s desk`;
    this.go.replaceChildren(
      h('span.needs-you-icon', { 'aria-hidden': 'true' }, icon('needs-you', 16)),
      h('span.needs-you-text', {}, h('strong', {}, text.title), text.detail ? h('span.needs-you-ask', {}, text.detail) : null),
      ...(text.more ? [h('span.needs-you-more', {}, text.more)] : []),
      h('span.key', {}, 'N'),
    );
    this.place();
  }

  /** A worker has just started asking: the edge of the screen pulses red a few times. */
  flash() {
    this.edge.classList.remove('on');
    // Read back, so taking the class off and putting it on again starts the animation over.
    void this.edge.offsetWidth;
    this.edge.classList.add('on');
  }

  /**
   * Under the top bar, and under the dock or the mission strip too where either is in its way (the
   * dock wraps down on a narrow screen; the strip sits under the floor's name). The toasts come out under it.
   */
  private place() {
    if (!this.shown) return;
    this.el.style.top = '';
    const me = this.el.getBoundingClientRect();
    let top = me.top;
    for (const sel of ['.dock', '#mission-strip']) {
      const r = this.hud.querySelector(sel)?.getBoundingClientRect();
      // Not showing (hidden from the menu, or empty): no size.
      if (!r || !r.width || !r.height) continue;
      if (r.left < me.right && r.right > me.left && r.bottom > top - 8) top = Math.round(r.bottom + 10);
    }
    if (top !== me.top) this.el.style.top = `${top}px`;
    this.hud.style.setProperty('--needs-you-bottom', `${Math.round(top + me.height + 8)}px`);
  }
}
