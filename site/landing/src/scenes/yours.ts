// 06 Yours: one command, your machine, a signed record. The terminal runs the from-source commands
// at a person's pace and streams their output; the moment a measured line prints, its number rolls
// up in giant type beside it (3.4 s, 10.7 s, 4 clicks, measured on the scripted demo). Below, the
// laptop's edge hums: packets that try to leave it bounce off the perimeter, because nothing leaves
// the machine. And merges print into the signed record like a receipt printer, each hash scrambling
// before it settles, while "merged today" rolls up. Hover a record and its wait grows into a bar.
import { env } from '../engine/env';
import { countUp } from '../engine/count';
import { every } from '../engine/loop';
import { whileVisible } from '../engine/wake';
import { odometer } from '../engine/odometer';

const HEX = '0123456789abcdef';

export function mountYours(section: HTMLElement) {
  if (env.reduced) return;
  const term = [...section.querySelectorAll<HTMLElement>('.term-body')].find((el) => !el.hidden && el.offsetParent !== null) ?? section.querySelector<HTMLElement>('.term-body')!;
  const measured = [...section.querySelectorAll<HTMLElement>('.measured li')];
  const ledger = section.querySelector<HTMLElement>('.ledger')!;
  const records = [...ledger.querySelectorAll<HTMLElement>('li')];
  const merged = section.querySelector<HTMLElement>('[data-merged]');
  const setMerged = merged ? odometer(merged) : null;
  setMerged?.('0');

  // ---- The terminal: each character in its own span, shown in time. Layout never changes.
  const spans: HTMLElement[] = [];
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const ch of child.textContent ?? '') {
          if (ch === '\n') {
            frag.append('\n');
            const nl = document.createElement('span');
            nl.className = 'c nl';
            frag.append(nl);
            spans.push(nl);
            continue;
          }
          const s = document.createElement('span');
          s.className = 'c';
          s.textContent = ch;
          frag.append(s);
          spans.push(s);
        }
        child.replaceWith(frag);
      } else walk(child);
    }
  };
  walk(term);
  term.classList.add('typing-term');
  // Lines: split at the newline markers. A line that starts with "$" is typed, the rest print whole.
  const lines: HTMLElement[][] = [[]];
  for (const s of spans) {
    if (s.classList.contains('nl')) lines.push([]);
    else lines[lines.length - 1].push(s);
  }
  const times: { el: HTMLElement; at: number }[] = [];
  const marks: { at: number; fire: () => void }[] = [];
  let t = 300;
  lines.forEach((line) => {
    const text = line.map((s) => s.textContent).join('');
    if (text.trim().startsWith('$')) {
      t += 380;
      line.forEach((s, i) => times.push({ el: s, at: (t += i < 2 ? 0 : 12 + ((i * 37) % 14)) }));
      t += 260;
    } else {
      t += text.includes('added') ? 700 : 220;
      line.forEach((s) => times.push({ el: s, at: t }));
    }
    if (/first agent at work/.test(text)) marks.push({ at: t, fire: () => reveal(0) });
    if (/first merged change/.test(text)) marks.push({ at: t, fire: () => (reveal(1), setTimeout(() => reveal(2), 260)) });
  });
  const caret = document.createElement('span');
  caret.className = 'caret';
  measured.forEach((li) => li.classList.add('waiting-count'));
  function reveal(i: number) {
    const li = measured[i];
    if (!li) return;
    li.classList.remove('waiting-count');
    li.classList.add('counted');
    const b = li.querySelector<HTMLElement>('[data-count]');
    if (b) countUp(b, 900);
  }

  let started = false;
  const run = () => {
    if (started) return;
    started = true;
    const t0 = performance.now();
    let i = 0, m = 0;
    const stop = every({
      write(_dt, now) {
        const el = now - t0;
        while (i < times.length && times[i].at <= el) {
          times[i].el.classList.add('on');
          times[i].el.after(caret);
          i++;
        }
        while (m < marks.length && marks[m].at <= el) marks[m++].fire();
        if (i >= times.length && m >= marks.length) {
          stop();
          setTimeout(() => caret.remove(), 2400);
        }
      },
    });
  };
  const io = new IntersectionObserver(([e]) => e.isIntersecting && (io.disconnect(), run()), { threshold: 0.4 });
  io.observe(term);

  // ---- The receipt printer.
  ledger.classList.add('staged');
  records.forEach((li) => {
    const w = /(\d+):(\d\d)/.exec(li.querySelector('.w')?.textContent ?? '');
    const mins = w ? Number(w[1]) + Number(w[2]) / 60 : 0;
    li.style.setProperty('--wv', Math.max(0.02, Math.min(1, mins / 25)).toFixed(3));
  });
  const printIo = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    printIo.disconnect();
    // Oldest first, as they happened: the receipt prints from the bottom row up.
    [...records].reverse().forEach((li, k) =>
      setTimeout(() => {
        li.classList.add('printed');
        setMerged?.(String(k + 1));
        const h = li.querySelector<HTMLElement>('.h');
        if (h) scramble(h);
      }, 400 + k * 750),
    );
  }, { threshold: 0.5 });
  printIo.observe(ledger);

  // ---- Packets that try to leave the machine bounce off its edge.
  const packets = [...section.querySelectorAll<SVGCircleElement>('.packets circle')];
  const CX = 210, CY = 138, RX = 170, RY = 98;
  const dirs = packets.map((_, i) => {
    const a = (i / packets.length) * Math.PI * 2 + 0.6;
    return { ux: Math.cos(a), uy: Math.sin(a), ph: i * 0.37 };
  });
  const hits = packets.map((c) => {
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('class', 'hit');
    ring.setAttribute('r', '7');
    c.parentNode!.append(ring);
    return ring;
  });
  const laptop = section.querySelector('.laptop');
  if (laptop) {
    whileVisible(laptop, {
      write(_dt, now) {
        packets.forEach((c, i) => {
          const d = dirs[i];
          const max = 1 / (Math.abs(d.ux) / RX + Math.abs(d.uy) / RY);
          const ph = ((now / 1000) * 0.55 + d.ph) % 1;
          const k = ph < 0.5 ? ph * 2 : 2 - ph * 2; // out, then back
          const r = max * (0.12 + 0.86 * (1 - (1 - k) * (1 - k)));
          c.setAttribute('cx', (CX + d.ux * r).toFixed(1));
          c.setAttribute('cy', (CY + d.uy * r).toFixed(1));
          const edge = Math.max(0, 1 - Math.abs(ph - 0.5) * 14);
          hits[i].setAttribute('cx', (CX + d.ux * max * 0.98).toFixed(1));
          hits[i].setAttribute('cy', (CY + d.uy * max * 0.98).toFixed(1));
          hits[i].style.opacity = edge.toFixed(2);
        });
      },
    });
  }
}

function scramble(el: HTMLElement) {
  const final = el.textContent ?? '';
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 520);
    const fixed = Math.floor(t * final.length);
    let s = final.slice(0, fixed);
    for (let i = fixed; i < final.length; i++) s += HEX[(Math.random() * 16) | 0];
    el.textContent = s;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
