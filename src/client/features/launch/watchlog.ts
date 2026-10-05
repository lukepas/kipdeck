// The day's log at the start of a watch: a flat panel high over the view, as if projected on the
// forward glass. A scanline wipes down it, the heading comes up in ship-cyan mono, then the log is
// typed a line at a time in white, held, and faded. A DOM panel rather than anything in the scene, so
// no rib or frame ever cuts its words, its width is capped to the view, and it costs the GPU nothing.
import './watchlog.css';
import { h } from '../../ui/dom';
import { logLines, typedAt } from './logic';

export class WatchLog {
  private readonly head = h('div.watch-head');
  private readonly body = h('div.watch-body');
  private readonly scan = h('div.watch-scan');
  private readonly el = h('div.watch-log', { role: 'status', 'aria-live': 'polite' }, this.head, h('div.watch-rule'), this.body, this.scan);
  private lines: string[] = [];
  private rows: HTMLElement[] = [];
  private shown = '';

  constructor() {
    (document.getElementById('hud') ?? document.body).append(this.el);
    this.el.hidden = true;
  }

  /** Sets the log: its heading and the body, typed a sentence a line. */
  write(head: string, body: string) {
    this.head.textContent = head;
    this.lines = logLines(body);
    this.rows = this.lines.map(() => h('p.watch-line'));
    this.body.replaceChildren(...this.rows);
    // Screen readers get the whole log at once, not a letter at a time.
    this.el.setAttribute('aria-label', `${head}. ${body}`);
    this.shown = '';
  }

  /** The log `ms` after it starts; a negative `ms` hides it. */
  at(ms: number) {
    if (ms < 0) {
      this.el.hidden = true;
      return;
    }
    const t = typedAt(ms, this.lines.map((l) => l.length));
    this.el.hidden = t.alpha <= 0.002;
    if (this.el.hidden) return;
    this.el.style.opacity = t.alpha.toFixed(3);
    this.scan.style.top = `${(t.wipe * 100).toFixed(1)}%`;
    this.scan.style.opacity = t.wipe >= 1 ? '0' : '1';
    const key = t.typed.join(',');
    if (key === this.shown) return;
    this.shown = key;
    // The cursor sits on the line being typed.
    const busy = t.typed.findIndex((n, i) => n < this.lines[i].length);
    this.rows.forEach((row, i) => {
      row.textContent = this.lines[i].slice(0, t.typed[i]);
      row.classList.toggle('typing', i === busy && t.typed[i] > 0);
    });
  }

  /** What it shows now (the shots read it). */
  get text(): string {
    return this.el.hidden ? '' : this.rows.map((r) => r.textContent).join(' ');
  }
}
