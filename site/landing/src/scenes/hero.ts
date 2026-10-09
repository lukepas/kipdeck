// 01 Hero: the wait, felt. The page opens the way the headline reads: Codex is already waiting on
// the visitor, its question at the top of the inbox, and every clock on the page counts the
// visitor's own time (the wait bar, the stopwatch on "waiting", the top bar's pulse, the wait clock
// along the top, the lit unit in the far field and the favicon). Answering the row clears all of
// them at once and sends Codex back to work at the foot of the list; a little later it stops and
// asks again, and its next question types in at the top. Only the visitor's own answer (or the
// ghost cursor's one demonstration) clears it: scrolling and copying never do. The review row
// under it is a real Merge, and "merged today" counts it.
//
// One state object drives every number in the mock and the top bar (paintCounts and paintClock), so
// the pill, the mini pill, the section counts, the row and the stopwatch never disagree. The list
// never reorders in the DOM: rows move by their `translate` property only, so nothing shifts, and
// the HTML (and a reader without script or with less motion) has the asking state.
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
import { cue } from '../ui/sound';
import { announce } from '../ui/controls';

/** The agent's questions, one per time it stops (demo data, labelled on the card). */
const QUESTIONS = [
  'Update the snapshot or fix the selector?',
  'Run the whole suite or only the checkout specs?',
  'Commit the new fixture or build it in CI?',
];
const WORKING_SUB = 'Bash: npx playwright test checkout';
const ANSWERED_SUB = 'Answered. Back at work.';

/** The status glyph's two shapes, written with the same points so one morphs into the other. */
const BAR = 'M5 10.5 19 10.5 19 13.5 5 13.5Z';
const DIAMOND = 'M12 3.5 20.5 12 12 20.5 3.5 12Z';

/** How long Codex has waited when the page opens: the 0:07 the HTML ships. */
const OPEN_WAIT = 7;
/** How long the wait clock along the top takes to cross the viewport, and the row's bar to fill (seconds). */
const CLOCK_SPAN = 180;
const BAR_SPAN = 300;

/** The hero's one piece of state. Every count and clock in the mock and the top bar is painted from it. */
interface HeroState {
  /** Codex is waiting on the visitor. */
  asking: boolean;
  /** The whole second the clocks show, -1 before the next paint. */
  second: number;
}

export function mountHero(section: HTMLElement) {
  const $ = <T extends Element>(sel: string, root: ParentNode = section) => root.querySelector(sel) as T;
  const waiting = $<HTMLElement>('#waiting');
  const stopwatch = $<HTMLElement>('#stopwatch');
  const row = $<HTMLButtonElement>('[data-clear]');
  const rowWait = $<HTMLElement>('[data-row-wait]');
  const rowWaitSr = $<HTMLElement>('[data-row-wait-sr]');
  const rowSub = row.querySelector<HTMLElement>('.row-sub')!;
  const ageWord = row.querySelector<HTMLElement>('.age-w')!;
  const rowBtn = row.querySelector<HTMLElement>('.row-btn')!;
  const shape = row.querySelector<SVGPathElement>('.st-shape');
  const bar = row.querySelector<HTMLElement>('.waitbar > i')!;
  const list = $<HTMLElement>('.app-list');
  const needsHead = $<HTMLElement>('.sec-needs');
  const needsCount = needsHead.querySelector<HTMLElement>('.count')!;
  const workingCount = $<HTMLElement>('.sec-working .count');
  const miniWaiting = $<HTMLElement>('[data-mini-waiting]');
  const miniLongest = $<HTMLElement>('[data-mini-median]');
  const miniMerged = $<HTMLElement>('[data-mini-merged]');
  const reviewRow = $<HTMLButtonElement>('[data-merge]');
  const glow = $<HTMLElement>('.hero-glow');
  const clockBar = document.querySelector<HTMLElement>('#waitclock')!;
  const pulse = document.querySelector<HTMLElement>('.pulse')!;
  const pulseCount = pulse.querySelector<HTMLElement>('[data-pulse-count]')!;
  const pulseWait = pulse.querySelector<HTMLElement>('[data-pulse-wait]')!;
  const lockup = document.querySelector<HTMLElement>('.lockup')!;
  const favicon = document.querySelector<HTMLLinkElement>('#favicon')!;
  const setStopwatch = odometer(stopwatch);
  const setRowWait = odometer(rowWait, true);

  const state: HeroState = { asking: true, second: -1 };
  const clockSpring = new Spring(0, 120, 16);
  const barSpring = new Spring(0, 160, 17);
  let question = 0;
  let first = true;
  let backTimer = 0;

  // After six idle seconds with Codex waiting, a ghost cursor answers it once, to show the gesture.
  const armGhost = ghostOnIdle({
    scope: section,
    target: () => (wait.since !== null ? rowBtn : null),
    act: () => wait.clear(),
  });

  const canvas = section.querySelector<HTMLCanvasElement>('#field');
  // The field keeps clear of every block of words, so nothing crosses the text.
  const words = [...section.querySelectorAll('.hero-copy > .label, .hero-h .w, .hero .lede, .hero-sub, .try, .cta, .facts')];
  const field: FieldHandle | null = canvas ? mountField(canvas, words) : null;
  // On a phone the headline fills the lanes, so the unit that will wait on you works in the gap
  // between the headline and the subhead, to the right of "on you."
  if (field && env.phone) {
    const h1 = $<HTMLElement>('h1'), lede = $<HTMLElement>('.lede');
    const perch = () => field.perch((h1.getBoundingClientRect().bottom + lede.getBoundingClientRect().top) / 2);
    perch();
    new ResizeObserver(perch).observe(h1);
  }

  // ---- Painting from the state. Nothing else writes these numbers.
  function paintCounts() {
    const n = state.asking ? '1' : '0';
    pulseCount.textContent = n;
    miniWaiting.textContent = n;
    needsCount.textContent = n;
    needsHead.classList.toggle('zero', !state.asking);
    workingCount.textContent = state.asking ? '3' : '4';
    pulse.classList.toggle('calm', !state.asking);
    lockup.classList.toggle('alert', state.asking);
    favicon.href = state.asking ? 'favicon-alert.svg' : 'favicon.svg';
    stopwatch.classList.toggle('idle', !state.asking);
    // Nobody waits: the pill's clock and the longest wait have nothing to show.
    if (!state.asking) miniLongest.textContent = '-';
    document.documentElement.classList.toggle('agent-waiting', state.asking);
    field?.blocked(state.asking);
  }

  /** One m:ss value in every clock: the stopwatch, the row, the mini pill and the top bar. */
  function paintClock(s: number) {
    const whole = Math.floor(s);
    if (whole === state.second) return;
    state.second = whole;
    const text = clock(whole);
    setStopwatch(text);
    setRowWait(text);
    if (state.asking) {
      miniLongest.textContent = text;
      // The row's clock is drawn for the eye; its name carries the wait for a screen reader.
      rowWaitSr.textContent = `, waiting ${text}, `;
    }
    pulseWait.textContent = text;
  }

  function setState(asking: boolean) {
    state.asking = asking;
    state.second = -1;
    paintCounts();
    paintClock(wait.seconds());
  }

  // ---- The list's two layouts: Codex asking at the top (the HTML), or working at the foot.
  const items = [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.classList.contains('demo-tag'));
  const after = items.slice(items.indexOf(row) + 1);
  function layout(asking: boolean, instant = false) {
    const H = after[0].offsetTop - needsHead.offsetTop;
    const last = items[items.length - 1];
    const foot = last.offsetTop + last.offsetHeight - 1 - H - row.offsetTop;
    list.classList.toggle('none-waiting', !asking);
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

  /** The arrival: a one-shot Signal ring around the row as a question lands (CSS, never with less motion). */
  function arrive() {
    row.classList.remove('arrive');
    void row.offsetWidth;
    row.classList.add('arrive');
  }

  /** Codex at work at the foot of the list, after the visitor answers. */
  function working(instant: boolean, sub = WORKING_SUB) {
    row.classList.remove('needs', 'cleared', 'checked', 'arrive');
    row.classList.add('working');
    row.disabled = true;
    rowSub.textContent = sub;
    ageWord.textContent = 'working';
    rowWaitSr.textContent = ', working';
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
    rowBtn.textContent = 'Answer';
    ageWord.textContent = 'waiting ';
    setState(true);
    armGhost();
    // The first question is the one the HTML already shows: it is simply there, as the headline says.
    if (first || env.reduced) {
      if (shape) shape.setAttribute('d', DIAMOND);
      rowSub.textContent = q;
      layout(true, true);
      // Its ring plays as the row lands, once the list has streamed in.
      if (first && !env.reduced) setTimeout(() => wait.since !== null && arrive(), 1400);
      first = false;
      return;
    }
    if (shape) void morph(shape, DIAMOND, 380);
    // The question arrives a beat after the row starts to climb.
    rowSub.textContent = '';
    setTimeout(() => void typeInto(rowSub, q, 56), 260);
    layout(true);
    arrive();
  }

  function answered() {
    question++;
    clearTimeout(backTimer);
    row.classList.remove('needs', 'arrive');
    row.classList.add('cleared', 'checked');
    row.disabled = true;
    rowSub.textContent = ANSWERED_SUB;
    rowBtn.textContent = 'Answered';
    ageWord.textContent = 'answered ';
    setState(false);
    if (env.reduced) {
      // Less motion: straight to the settled list, the answer still said in words.
      working(true, ANSWERED_SUB);
      return;
    }
    stopwatch.classList.add('flash');
    setTimeout(() => stopwatch.classList.remove('flash'), 90);
    row.classList.remove('burst');
    void row.offsetWidth;
    row.classList.add('burst');
    // A moment to see the check, then Codex goes back to work at the foot of the list.
    backTimer = window.setTimeout(() => working(false), 1300);
  }

  wait.on((since) => {
    if (since === null) answered();
    else ask();
    start();
  });
  row.addEventListener('click', () => wait.clear());

  // The finished change under To review is a real Merge: the row settles into a check, To review
  // empties and "merged today" counts it. Nothing merges it but the visitor.
  const setMerged = odometer(miniMerged);
  const reviewCount = $<HTMLElement>('.sec-review .count');
  reviewRow.addEventListener('click', () => {
    if (reviewRow.disabled) return;
    reviewRow.disabled = true;
    reviewRow.classList.replace('review', 'merged');
    reviewRow.querySelector('.st')!.className = 'glyph g-merged st';
    reviewRow.querySelector('.row-sub')!.textContent = 'Merged, 3 files';
    reviewRow.querySelector('.row-age')!.textContent = 'merged just now';
    reviewCount.textContent = '0';
    setMerged('1');
    if (!env.reduced) {
      reviewRow.classList.add('burst');
      cue('merge');
    }
    announce('Merged: Add rate limiting to /api/login.');
  });

  // ---- One task for every clock on the page: it reads the row's place for the field's hairline,
  // then writes transforms and, once a second, text.
  let stop: (() => void) | null = null;
  let tick = 0;
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
      if (wait.since !== null) paintClock(s);
      field?.target(rowRect);
      if (wait.since === null && !moving) {
        stop?.();
        stop = null;
      }
    },
  };
  function start() {
    if (env.reduced) {
      // Less motion: no growing bar or glow, but the clocks still count (a digit changing is not
      // motion), so the page never reads as frozen. Every clock shows the same value.
      clockBar.hidden = true;
      waiting.style.setProperty('--ws', '125%');
      if (!tick) tick = window.setInterval(() => wait.since !== null && paintClock(wait.seconds()), 1000);
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

  // ---- The opening. The agents leave the mark for their lanes while the headline inhales; any key,
  // click or scroll plays that to its end at once. Codex waits on the visitor from the first frame.
  if (!env.reduced) {
    const mark = lockup.querySelector('.mark')!.getBoundingClientRect();
    field?.launch(mark.left + mark.width / 2, mark.top + mark.height / 2);
    const skipOn = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const;
    const skip = () => {
      for (const ev of skipOn) removeEventListener(ev, skip, { capture: true });
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
    };
    for (const ev of skipOn) addEventListener(ev, skip, { once: true, passive: true, capture: true });
  }
  wait.ask(OPEN_WAIT);

  return {
    attend(x: number, y: number) {
      field?.attend(x, y);
    },
  };
}
