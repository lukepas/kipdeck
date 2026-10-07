// 01 Hero: the wait, felt. The page opens on a working inbox: the agents leave the mark in the top
// bar and fly out to their lanes, the headline breathes in on Archivo's width axis and five rows
// stream into Working. Then, about 2.4 s in, Codex stops and asks: its steel bar turns into the
// needs-you diamond, the row climbs to the top of the list, its question types in, and from that
// moment every clock on the page counts the visitor's own time (the wait bar, the stopwatch on
// "waiting", the top bar's pulse, the wait clock along the top, the lit unit in the far field and
// the favicon). Answering the row, or copying the command, clears all of them at once and sends
// Codex back to work: the whole product in one gesture.
//
// The list never reorders in the DOM. Rows move by their `translate` property only, so nothing
// shifts, and the HTML (and a reader without script or with less motion) has the final state.
import { every } from '../engine/loop';
import { Spring } from '../engine/spring';
import { env } from '../engine/env';
import { morph } from '../engine/morph';
import { typeInto } from '../engine/type';
import { odometer } from '../engine/odometer';
import { slideTo } from '../engine/flip';
import { mountField, type FieldHandle } from '../fx/field';
import { wait, clock } from '../ui/wait';
import { ghostOnIdle } from '../ui/ghost';

/** The agent's questions, one per time it stops (demo data, labelled on the card). */
const QUESTIONS = [
  'Update the snapshot or fix the selector?',
  'Run the whole suite or only the checkout specs?',
  'Commit the new fixture or build it in CI?',
];
const WORKING_SUB = 'Bash: npx playwright test checkout';

/** The status glyph's two shapes, written with the same points so one morphs into the other. */
const BAR = 'M5 10.5 19 10.5 19 13.5 5 13.5Z';
const DIAMOND = 'M12 3.5 20.5 12 12 20.5 3.5 12Z';

/** When Codex stops and asks (ms after the page starts). */
const ASK_AT = 2400;
/** How long the wait clock along the top takes to cross the viewport, and the row's bar to fill (seconds). */
const CLOCK_SPAN = 180;
const BAR_SPAN = 300;

export function mountHero(section: HTMLElement) {
  const $ = <T extends Element>(sel: string, root: ParentNode = section) => root.querySelector(sel) as T;
  const waiting = $<HTMLElement>('#waiting');
  const stopwatch = $<HTMLElement>('#stopwatch');
  const row = $<HTMLButtonElement>('[data-clear]');
  const rowWait = $<HTMLElement>('[data-row-wait]');
  const rowSub = row.querySelector<HTMLElement>('.row-sub')!;
  const rowAge = row.querySelector<HTMLElement>('.row-age')!;
  const shape = row.querySelector<SVGPathElement>('.st-shape');
  const bar = row.querySelector<HTMLElement>('.waitbar > i')!;
  const list = $<HTMLElement>('.app-list');
  const needsHead = $<HTMLElement>('.sec-needs');
  const needsCount = needsHead.querySelector<HTMLElement>('.count')!;
  const workingCount = $<HTMLElement>('.sec-working .count');
  const miniWaiting = $<HTMLElement>('[data-mini-waiting]');
  const miniMedian = $<HTMLElement>('[data-mini-median]');
  const glow = $<HTMLElement>('.hero-glow');
  const clockBar = document.querySelector<HTMLElement>('#waitclock')!;
  const pulse = document.querySelector<HTMLElement>('.pulse')!;
  const pulseCount = pulse.querySelector<HTMLElement>('[data-pulse-count]')!;
  const pulseWait = pulse.querySelector<HTMLElement>('[data-pulse-wait]')!;
  const lockup = document.querySelector<HTMLElement>('.lockup')!;
  const favicon = document.querySelector<HTMLLinkElement>('#favicon')!;
  const setStopwatch = odometer(stopwatch);
  rowWait.textContent = '0:00';
  const setRowWait = odometer(rowWait, true);

  const clockSpring = new Spring(0, 120, 16);
  const barSpring = new Spring(0, 160, 17);
  let lastSecond = -1;
  let question = 0;
  let introDone = false;
  let askTimer = 0;
  let backTimer = 0;

  // After six idle seconds with Codex waiting, a ghost cursor answers it once, to show the gesture.
  const armGhost = ghostOnIdle({
    scope: section,
    target: () => (wait.since !== null ? row.querySelector<HTMLElement>('.row-btn') : null),
    act: () => wait.clear(),
  });

  const canvas = section.querySelector<HTMLCanvasElement>('#field');
  const field: FieldHandle | null = canvas ? mountField(canvas) : null;

  // ---- The list's two layouts: Codex asking at the top (the HTML), or working at the foot.
  const items = [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.classList.contains('demo-tag'));
  const after = items.slice(items.indexOf(row) + 1);
  function layout(asking: boolean, instant = false) {
    const H = after[0].offsetTop - needsHead.offsetTop;
    const last = items[items.length - 1];
    const foot = last.offsetTop + last.offsetHeight - 1 - H - row.offsetTop;
    list.classList.toggle('none-waiting', !asking);
    workingCount.textContent = asking ? '3' : '4';
    needsCount.textContent = asking ? '1' : '0';
    if (instant || env.reduced) {
      row.style.translate = asking ? '' : `0 ${foot}px`;
      for (const el of after) el.style.translate = asking ? '' : `0 ${-H}px`;
      return;
    }
    row.classList.add('lift');
    void slideTo(row, asking ? 0 : foot, 820).then(() => row.classList.remove('lift'));
    // The rest make room in a ripple, nearest first.
    after.forEach((el, i) => void slideTo(el, asking ? 0 : -H, 760, (asking ? i : after.length - i) * 28));
  }

  function paintSecond(s: number) {
    const whole = Math.floor(s);
    if (whole === lastSecond) return;
    lastSecond = whole;
    const text = clock(s);
    setStopwatch(env.reduced ? '23:00' : clock(s, true));
    setRowWait(text);
    miniMedian.textContent = text;
    pulseWait.textContent = text;
  }

  function chrome(on: boolean) {
    miniWaiting.textContent = on ? '1' : '0';
    pulseCount.textContent = on ? '1' : '0';
    pulse.classList.toggle('calm', !on);
    lockup.classList.toggle('alert', on);
    favicon.href = on ? 'favicon-alert.svg' : 'favicon.svg';
    stopwatch.classList.toggle('idle', !on);
    document.documentElement.classList.toggle('agent-waiting', on);
    field?.blocked(on);
  }

  /** Codex at work at the foot of the list (before it asks, and after the visitor answers). */
  function working(instant: boolean) {
    row.classList.remove('needs', 'cleared');
    row.classList.add('working');
    row.disabled = true;
    rowSub.textContent = WORKING_SUB;
    rowAge.firstChild!.textContent = 'working';
    if (shape) {
      if (instant) shape.setAttribute('d', BAR);
      else void morph(shape, BAR, 420);
    }
    layout(false, instant);
  }

  function ask() {
    const q = QUESTIONS[question % QUESTIONS.length];
    clearTimeout(backTimer);
    row.classList.remove('working', 'cleared', 'checked');
    row.classList.add('needs');
    row.disabled = false;
    row.setAttribute('aria-label', `Codex asks: ${q} Answer it`);
    row.querySelector('.row-btn')!.textContent = 'Answer';
    rowAge.firstChild!.textContent = 'waiting ';
    chrome(true);
    armGhost();
    if (env.reduced) {
      rowSub.textContent = q;
      return;
    }
    if (shape) void morph(shape, DIAMOND, 380);
    // The question arrives a beat after the row starts to climb.
    rowSub.textContent = '';
    setTimeout(() => void typeInto(rowSub, q, 56), 260);
    layout(true);
  }

  function answered() {
    question++;
    row.classList.remove('needs');
    row.classList.add('cleared', 'checked');
    row.disabled = true;
    rowSub.textContent = 'Answered. Back at work.';
    row.querySelector('.row-btn')!.textContent = 'Answered';
    rowAge.firstChild!.textContent = 'answered ';
    row.setAttribute('aria-label', 'Codex was answered and is back at work');
    chrome(false);
    stopwatch.classList.add('flash');
    setTimeout(() => stopwatch.classList.remove('flash'), 90);
    lastSecond = -1;
    paintSecond(0);
    if (env.reduced) return;
    row.classList.remove('burst');
    void row.offsetWidth;
    row.classList.add('burst');
    // A moment to see the check, then Codex goes back to work at the foot of the list.
    backTimer = window.setTimeout(() => {
      row.classList.remove('checked');
      working(false);
    }, 1300);
  }

  wait.on((since) => {
    if (since === null) answered();
    else ask();
    start();
  });
  row.addEventListener('click', () => wait.clear());

  // ---- One task for every clock on the page: it reads the row's place for the field's hairline,
  // then writes transforms and, once a second, text.
  let stop: (() => void) | null = null;
  let rowRect: DOMRect | null = null;
  let visible = true;
  let lastHeat = -1;
  const task = {
    read() {
      rowRect = visible && wait.since !== null ? row.getBoundingClientRect() : null;
    },
    write(dt: number) {
      const s = wait.seconds();
      clockSpring.target = Math.min(1, s / CLOCK_SPAN);
      barSpring.target = wait.since === null ? 0 : Math.min(1, Math.max(0.04, s / BAR_SPAN));
      const moving = clockSpring.step(dt) || barSpring.step(dt);
      clockBar.style.setProperty('--wait', clockSpring.value.toFixed(4));
      bar.style.setProperty('--w', barSpring.value.toFixed(4));
      // "waiting" widens with the wait: width 118 at rest, 125 after a minute.
      waiting.style.setProperty('--ws', `${(118 + Math.min(7, (s / 60) * 7)).toFixed(2)}%`);
      // The glow behind the inbox warms as the wait grows (opacity only).
      const heat = Math.round(Math.min(1, s / 90) * 100) / 100;
      if (heat !== lastHeat) glow.style.opacity = String(0.45 + 0.55 * (lastHeat = heat));
      if (wait.since !== null) paintSecond(s);
      field?.target(rowRect);
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
      field.active(visible);
    }).observe(section);
  }

  // ---- The opening. With less motion it is already over: Codex is waiting, as in the HTML.
  if (env.reduced) {
    introDone = true;
    wait.ask(7);
  } else {
    chrome(false);
    paintSecond(0);
    working(true);
    const mark = lockup.querySelector('.mark')!.getBoundingClientRect();
    field?.launch(mark.left + mark.width / 2, mark.top + mark.height / 2);
    askTimer = window.setTimeout(endIntro, ASK_AT);
    const skipOn = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const;
    const skip = () => {
      // Any key, click or scroll during the opening plays it to its end at once.
      for (const a of document.getAnimations()) {
        const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
        if (!(a instanceof CSSAnimation) || !target || !(section.contains(target) || lockup.contains(target))) continue;
        try {
          a.finish();
        } catch {
          // An endless animation cannot finish; it is not part of the opening.
        }
      }
      field?.land();
      endIntro();
    };
    for (const ev of skipOn) addEventListener(ev, skip, { once: true, passive: true, capture: true });
    function endIntro() {
      if (introDone) return;
      introDone = true;
      clearTimeout(askTimer);
      for (const ev of skipOn) removeEventListener(ev, skip, { capture: true });
      wait.ask(0);
    }
  }


  return {
    attend(x: number, y: number) {
      field?.attend(x, y);
    },
  };
}
