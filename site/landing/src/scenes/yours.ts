// 06 Yours: one command, your machine, a signed record. Every part of it looks finished within a
// second of coming into view:
//
// - The terminal runs the commands that put the inbox on your own project. Only the "$" lines type,
//   briskly; their output prints whole. The whole run takes about 1.2 s. The text is real text the
//   whole time: a line that has not run yet is only clipped, so a screen reader reads every line.
// - The measured numbers (3.4 s, 10.7 s, 4 clicks on the scripted demo) count up from zero at full
//   contrast as soon as their list comes into view, on their own clock, not the terminal's.
// - The wall: your machine as a box. Packets from the agents pass through its edge to their own
//   model's API; packets from the inbox toward a server of ours stop at the edge (there is none),
//   and the stop mark flashes. Inside, the inbox talks to the agents and to the signed record.
// - The record prints like a receipt, a row every 140 ms, each hash scrambling before it settles,
//   and "merged today" ticks only once its row has printed. Hover a record and its wait becomes a bar.
import { env } from '../engine/env';
import { countUp } from '../engine/count';
import { every } from '../engine/loop';
import { whileVisible } from '../engine/wake';
import { odometer } from '../engine/odometer';

const HEX = '0123456789abcdef';
/** ms per typed character, and the pause before a command and after one. */
const CHAR_MS = 4;
const BEFORE_CMD = 60;
const AFTER_CMD = 70;
const OUTPUT_GAP = 50;

export function mountYours(section: HTMLElement) {
  if (env.reduced) return;
  // A build for a private repository has no terminal here (site/build.mjs): the rest still plays.
  const term = [...section.querySelectorAll<HTMLElement>('.term-body')].find((el) => !el.hidden && el.offsetParent !== null) ?? section.querySelector<HTMLElement>('.term-body');
  const measuredList = section.querySelector<HTMLElement>('.measured')!;
  const measured = [...measuredList.querySelectorAll<HTMLElement>('li')];
  const ledger = section.querySelector<HTMLElement>('.ledger')!;
  const records = [...ledger.querySelectorAll<HTMLElement>('li')];
  const merged = section.querySelector<HTMLElement>('[data-merged]');
  const setMerged = merged ? odometer(merged) : null;
  setMerged?.('0');

  // ---- The terminal: whole lines, clipped until they run. A command uncovers in character steps.
  if (term) runTerminal(term);

  // ---- The numbers: up from zero, at full contrast, as soon as their list is in view.
  measuredList.classList.add('staged');
  const figures = measured.map((li) => li.querySelector<HTMLElement>('[data-count]')!);
  once(measuredList, () => {
    measured.forEach((li, i) => {
      const b = figures[i];
      // Each number keeps the width of its final string, so counting never moves its unit.
      b.style.minWidth = `${Math.ceil(b.getBoundingClientRect().width)}px`;
      li.classList.add('counted');
      countUp(b, 650 + i * 60);
      // countUp has taken the final value; from this frame on it counts from zero.
      b.textContent = (0).toFixed(Number(b.dataset.dec ?? 0));
    });
  }, 0.25);

  // ---- The receipt printer.
  ledger.classList.add('staged');
  records.forEach((li) => {
    const w = /(\d+):(\d\d)/.exec(li.querySelector('.w')?.textContent ?? '');
    const mins = w ? Number(w[1]) + Number(w[2]) / 60 : 0;
    li.style.setProperty('--wv', Math.max(0.02, Math.min(1, mins / 25)).toFixed(3));
  });
  once(ledger, () => {
    // Oldest first, as they happened: the receipt prints from the bottom row up.
    [...records].reverse().forEach((li, k) =>
      setTimeout(() => {
        li.classList.add('printed');
        const h = li.querySelector<HTMLElement>('.h');
        if (h) scramble(h);
        // The count moves when its row has finished printing, never ahead of it.
        setTimeout(() => setMerged?.(String(k + 1)), 360);
      }, 120 + k * 140),
    );
  }, 0.4);

  // ---- The wall: what passes through your machine's edge, and what stops at it.
  const wall = section.querySelector<SVGSVGElement>('.wall');
  if (wall) {
    wall.classList.add('staged');
    const out = wall.querySelector<SVGCircleElement>('.pk-out')!;
    const stop = wall.querySelector<SVGCircleElement>('.pk-stop')!;
    const locals = [...wall.querySelectorAll<SVGCircleElement>('.pk-local')];
    const mark = wall.querySelector<SVGPathElement>('.stop-x')!;
    // A second packet on the way out, half a cycle behind the first.
    const out2 = out.cloneNode() as SVGCircleElement;
    out.after(out2);
    let lastHit = -1;
    whileVisible(wall, {
      write(_dt, now) {
        const s = now / 1000;
        // Agents to their model: out through the wall and on to the API, then again.
        [out, out2].forEach((c, i) => {
          const k = (s * 0.55 + i * 0.5) % 1;
          c.setAttribute('cx', (216 + 104 * k).toFixed(1));
          c.style.opacity = (k > 0.92 ? (1 - k) / 0.08 : 1).toFixed(2);
        });
        // The inbox toward a server of ours: it reaches the wall and goes no further.
        const k = (s * 0.5) % 1;
        const x = 216 + Math.min(1, k / 0.6) * 62;
        stop.setAttribute('cx', x.toFixed(1));
        stop.style.opacity = (k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.25)).toFixed(2);
        const cycle = Math.floor(s * 0.5);
        if (k >= 0.6 && cycle !== lastHit) {
          lastHit = cycle;
          mark.classList.remove('hit');
          void mark.getBoundingClientRect();
          mark.classList.add('hit');
        }
        // Inside the machine: the inbox and the agents, the inbox and the record.
        locals.forEach((c, i) => {
          const q = (s * 0.7 + i * 0.35) % 1;
          const y0 = i === 0 ? 100 : 180;
          c.setAttribute('cy', (y0 + 34 * (q < 0.5 ? q * 2 : 2 - q * 2)).toFixed(1));
        });
      },
    });
  }
}

/** Runs `fn` once, when `el` is `threshold` in view. */
function once(el: Element, fn: () => void, threshold: number) {
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    fn();
  }, { threshold });
  io.observe(el);
}

function scramble(el: HTMLElement) {
  const final = el.textContent ?? '';
  const start = performance.now();
  const stop = every({
    write(_dt, now) {
      const t = Math.min(1, (now - start) / 360);
      const fixed = Math.floor(t * final.length);
      let s = final.slice(0, fixed);
      for (let i = fixed; i < final.length; i++) s += HEX[(Math.random() * 16) | 0];
      el.textContent = s;
      if (t >= 1) stop();
    },
  });
}

function runTerminal(term: HTMLElement) {
  const lines = [...term.querySelectorAll<HTMLElement>('.tl')];
  term.classList.add('typing-term');
  const plan: { el: HTMLElement; at: number }[] = [];
  let t = 80;
  for (const line of lines) {
    const text = line.textContent ?? '';
    if (text.trim().startsWith('$')) {
      t += BEFORE_CMD;
      const n = Math.max(1, text.length);
      line.style.setProperty('--type-ms', `${n * CHAR_MS}ms`);
      line.style.setProperty('--type-n', String(Math.min(n, 60)));
      plan.push({ el: line, at: t });
      t += n * CHAR_MS + AFTER_CMD;
    } else {
      t += OUTPUT_GAP;
      plan.push({ el: line, at: t });
    }
  }
  const runTerm = () => plan.forEach(({ el, at }) => setTimeout(() => el.classList.add('on'), at));
  once(term, runTerm, 0.25);
}
