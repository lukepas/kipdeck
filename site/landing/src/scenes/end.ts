// 11 End: nothing waits on you. The giant wordmark opens on Archivo's width axis from condensed (62)
// to the header's own width (118) as the page reaches its end, the way the hero's headline inhaled:
// at rest it is the same lockup as the top bar's. The calm inbox above it is honest about the
// page's one piece of state: if an agent has started waiting on the visitor again (the hero's Codex
// asks every so often), it says so, counts the wait, turns Kip's light Signal and
// offers Answer; answering settles it back to a check.
import { clamp } from '../engine/loop';
import { whileVisible } from '../engine/wake';
import { env } from '../engine/env';
import { wait, clock } from '../ui/wait';

/** The width axis: where the wordmark starts, and the header's own (base.css, .wordmark text). */
const CONDENSED = 62;
const HEADER = 118;

export function mountEnd(section: HTMLElement) {
  const text = section.querySelector<SVGTextElement>('.giant text');
  calmInbox(section);
  if (!text || env.reduced) return;
  let progress = 0;
  let last = -1;
  const task = {
    read() {
      const r = section.getBoundingClientRect();
      progress = clamp((innerHeight - r.top) / Math.max(1, r.height));
    },
    write() {
      const v = Math.round((CONDENSED + (HEADER - CONDENSED) * progress) * 10) / 10;
      if (v !== last) text.style.setProperty('--gs', `${(last = v)}%`);
    },
  };
  whileVisible(section, task);
}

function calmInbox(section: HTMLElement) {
  const box = section.querySelector<HTMLElement>('.calm-inbox');
  if (!box) return;
  const line = box.querySelector<HTMLElement>('#end-h')!;
  const clockEl = box.querySelector<HTMLElement>('.calm-clock')!;
  const answer = box.querySelector<HTMLButtonElement>('.calm-answer')!;
  let stop: (() => void) | null = null;
  let shown = '';
  answer.addEventListener('click', () => wait.clear());
  const paint = () => {
    const t = clock(wait.seconds());
    if (t !== shown) clockEl.textContent = shown = t;
  };
  const render = (since: number | null) => {
    const waiting = since !== null;
    box.classList.toggle('waiting', waiting);
    answer.tabIndex = waiting ? 0 : -1;
    line.textContent = waiting ? 'Codex is waiting on you.' : 'Nothing waits on you.';
    if (!waiting) {
      clockEl.textContent = shown = '0:00';
      box.classList.remove('settled');
      void box.offsetWidth;
      box.classList.add('settled');
      stop?.();
      stop = null;
    } else if (!stop) {
      paint();
      const id = window.setInterval(paint, 250);
      stop = () => clearInterval(id);
    }
  };
  wait.on(render);
  // Mounted late: the hero may already be waiting.
  if (wait.since !== null) render(wait.since);
}
