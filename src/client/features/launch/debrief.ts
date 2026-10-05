// The debrief: a conn panel low on the left over the bottom bar, in VESPER's voice, with what happened
// since you left. Anyone who needs you or is stuck comes first, a plain sentence each with its glyph
// and a button to go to them (N goes to the first, as it always does); then what landed (merges, USDC
// paid, attestations, waypoints, how far the destination came); then one dry closing line. It never
// takes the mouse. A close button top right puts it away, and so does Esc while the mouse is free, which hands the
// mouse straight back to the view. It puts itself away after a while, longer while it lists who waits.
import './debrief.css';
import type { Debrief } from '../../../shared/launch';
import { h, modalOpen } from '../../ui/dom';
import { icon } from '../../ui/icons';

export interface DebriefDeps {
  /** Takes you to a unit that waits, by id. */
  goTo(id: string): void;
  /** Opens the full "While you were away" log. */
  fullLog(): void;
  /** Hands the mouse back to the view. */
  backToGame(): void;
}

export class DebriefPanel {
  private readonly el: HTMLElement;
  private readonly title = h('p.debrief-title');
  private readonly body = h('div.debrief-body');
  private timer = 0;
  private open: Debrief | null = null;

  constructor(private readonly deps: DebriefDeps) {
    const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => this.close(true) }, icon('close', 16));
    this.el = h('section.debrief', { role: 'status', 'aria-live': 'polite', 'aria-label': 'Debrief', hidden: true }, this.title, this.body, close);
    (document.getElementById('hud') ?? document.body).append(this.el);
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape' || !this.open || modalOpen() || document.pointerLockElement) return;
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
      },
      true,
    );
  }

  /** Shows `d` for `ms`. With `attentionOnly`, only who waits (the launch that gave way to them). */
  show(d: Debrief, ms: number, attentionOnly = false) {
    clearTimeout(this.timer);
    this.open = d;
    this.title.textContent = attentionOnly ? 'WAITING ON YOU' : d.title;
    const waiting = d.waiting.map((w, i) =>
      h(
        'li.debrief-wait',
        {},
        h(`span.debrief-glyph.${w.level}`, { 'aria-hidden': 'true' }, icon(w.level, 14)),
        h('span', {}, w.line),
        h('button.btn.small', { type: 'button', title: i === 0 ? 'Go to it (N)' : 'Go to it', onclick: () => (this.close(false), this.deps.goTo(w.id)) }, ...(i === 0 ? ['Go ', h('kbd', {}, 'N')] : ['Go'])),
      ),
    );
    const parts: HTMLElement[] = [];
    if (waiting.length) parts.push(h('ul.debrief-waits', {}, ...waiting));
    if (!attentionOnly) {
      parts.push(h('ul.debrief-lines', {}, ...d.lines.map((l) => h('li', {}, l))));
      if (d.closing) parts.push(h('p.debrief-voice', {}, h('span.debrief-vesper', {}, 'VESPER'), ` ${d.closing}`));
      parts.push(h('button.btn.small.debrief-full', { type: 'button', onclick: () => (this.close(false), this.deps.fullLog()) }, 'Full log'));
    }
    this.body.replaceChildren(...parts);
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('on'));
    this.timer = window.setTimeout(() => this.close(false), ms);
  }

  /** Puts it away; `byHand` (its close button or Esc) also gives the view the mouse back. */
  close(byHand: boolean) {
    if (!this.open) return;
    clearTimeout(this.timer);
    this.open = null;
    this.el.classList.remove('on');
    this.timer = window.setTimeout(() => (this.el.hidden = true), 420);
    if (byHand) this.deps.backToGame();
  }

  /** What it shows now, if anything (the shots read it). */
  get shown(): Debrief | null {
    return this.open;
  }
}
