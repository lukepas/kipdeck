// 01 Hero: the wait, felt. An agent in the mini inbox is waiting on the visitor from the first
// frame: its row's wait bar fills, the word "waiting" widens on Archivo's width axis while a
// stopwatch counts beside it, the top bar's pulse ticks and the wait clock grows along the top of
// the viewport. Answering the row (or copying the command) clears all of them at once, which is
// the whole product in one gesture.
import { every } from '../engine/loop';
import { Spring } from '../engine/spring';
import { env } from '../engine/env';
import { mountField, type FieldHandle } from '../fx/field';
import { wait, clock } from '../ui/wait';

/** Who asks next, after the visitor answers: the demo's agents, labelled as demo data on the card. */
const ASKERS = [
  { sign: 'Cx', title: 'Fix the flaky checkout test', q: 'Update the snapshot or fix the selector?', who: 'Codex' },
  { sign: 'OC', title: 'Port the settings page to the form kit', q: 'Keep the old submit handler or move it into the kit?', who: 'OpenCode' },
  { sign: 'Pi', title: 'Upgrade the payment SDK to v5', q: 'Pin acme-pay-sdk to 5.1.0 or allow any 5.x?', who: 'Pi' },
];

/** How long the wait clock along the top takes to cross the viewport, and the row's bar to fill (seconds). */
const CLOCK_SPAN = 180;
const BAR_SPAN = 300;

export function mountHero(section: HTMLElement) {
  const $ = <T extends Element>(sel: string) => section.querySelector(sel) as T;
  const waiting = $<HTMLElement>('#waiting');
  const stopwatch = $<HTMLElement>('#stopwatch');
  const row = $<HTMLButtonElement>('[data-clear]');
  const rowWait = $<HTMLElement>('[data-row-wait]');
  const bar = row.querySelector<HTMLElement>('.waitbar > i')!;
  const needsCount = $<HTMLElement>('.sec-needs .count');
  const miniWaiting = $<HTMLElement>('[data-mini-waiting]');
  const miniMedian = $<HTMLElement>('[data-mini-median]');
  const clockBar = document.querySelector<HTMLElement>('#waitclock')!;
  const pulse = document.querySelector<HTMLElement>('.pulse')!;
  const pulseCount = pulse.querySelector<HTMLElement>('[data-pulse-count]')!;
  const pulseWait = pulse.querySelector<HTMLElement>('[data-pulse-wait]')!;
  const lockup = document.querySelector<HTMLElement>('.lockup')!;
  const favicon = document.querySelector<HTMLLinkElement>('#favicon')!;

  // The headline's inhale: each word springs open on entry (transform only, so nothing reflows).
  section.querySelectorAll<HTMLElement>('.hero-h .w').forEach((w, i) => w.style.setProperty('--i', String(i)));
  document.documentElement.classList.add('inhale');

  const clockSpring = new Spring(0, 120, 16);
  const barSpring = new Spring(0, 160, 17);
  let lastSecond = -1;
  let asker = 0;
  let field: FieldHandle | null = null;

  const canvas = section.querySelector<HTMLCanvasElement>('#field');
  if (canvas) field = mountField(canvas);

  function paintSecond(s: number) {
    const whole = Math.floor(s);
    if (whole === lastSecond) return;
    lastSecond = whole;
    const text = clock(s);
    stopwatch.textContent = env.reduced ? '23:00' : clock(s, true);
    rowWait.textContent = text;
    miniMedian.textContent = text;
    pulseWait.textContent = text;
  }

  function setWaiting(on: boolean) {
    const a = ASKERS[asker % ASKERS.length];
    row.classList.toggle('needs', on);
    row.classList.toggle('cleared', !on);
    row.querySelector('.glyph')?.remove();
    row.querySelector('.sign')!.textContent = a.sign;
    row.querySelector('.row-title')!.textContent = a.title;
    row.querySelector('.row-sub')!.textContent = on ? a.q : 'Answered. Back at work.';
    row.querySelector('.row-btn')!.textContent = on ? 'Answer' : 'Answered';
    row.querySelector('.row-age')!.firstChild!.textContent = on ? 'waiting ' : 'answered ';
    row.setAttribute('aria-label', on ? `${a.who} asks: ${a.q} Answer it` : `${a.who} was answered`);
    row.disabled = !on;
    needsCount.textContent = on ? '1' : '0';
    miniWaiting.textContent = on ? '1' : '0';
    pulseCount.textContent = on ? '1' : '0';
    pulse.classList.toggle('calm', !on);
    lockup.classList.toggle('alert', on);
    favicon.href = on ? 'favicon-alert.svg' : 'favicon.svg';
    field?.blocked(on);
    if (!on) {
      stopwatch.classList.add('flash');
      setTimeout(() => stopwatch.classList.remove('flash'), 90);
      lastSecond = -1;
      paintSecond(0);
    }
  }

  wait.on((since) => {
    if (since === null) {
      setWaiting(false);
      asker++;
    } else {
      setWaiting(true);
    }
    start();
  });

  row.addEventListener('click', () => wait.clear());

  // One task for every clock on the page: it reads the row's place for the field's hairline, then
  // writes transforms and, once a second, text.
  let stop: (() => void) | null = null;
  let rowRect: DOMRect | null = null;
  let visible = true;
  const task = {
    read() {
      rowRect = visible ? row.getBoundingClientRect() : null;
    },
    write(dt: number) {
      const s = wait.seconds();
      clockSpring.target = Math.min(1, s / CLOCK_SPAN);
      barSpring.target = Math.min(1, Math.max(0.04, s / BAR_SPAN));
      if (wait.since === null) barSpring.target = 0;
      const a = clockSpring.step(dt);
      const b = barSpring.step(dt);
      const moving = a || b;
      clockBar.style.setProperty('--wait', clockSpring.value.toFixed(4));
      bar.style.setProperty('--w', barSpring.value.toFixed(4));
      // "waiting" widens with the wait: width 118 at rest, 125 after a minute.
      waiting.style.setProperty('--ws', `${(118 + Math.min(7, (s / 60) * 7)).toFixed(2)}%`);
      if (wait.since !== null) paintSecond(s);
      field?.target(wait.since !== null ? rowRect : null);
      if (wait.since === null && !moving) {
        stop?.();
        stop = null;
      }
    },
  };
  function start() {
    if (env.reduced) {
      // Less motion: the final, readable state and no ticking.
      clockBar.hidden = true;
      waiting.style.setProperty('--ws', '125%');
      paintSecond(wait.seconds());
      return;
    }
    if (!stop) stop = every(task);
  }

  if (field) {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      field!.active(visible);
    }).observe(section);
  }

  // The agent has been waiting a few seconds by the time the page is up.
  wait.ask(7);
  return {
    attend(x: number, y: number) {
      field?.attend(x, y);
    },
  };
}
