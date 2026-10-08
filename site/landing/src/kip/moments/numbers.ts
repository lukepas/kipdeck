// 08 Numbers. Kip comes up on the chart's top gridline over Thursday, facing the big median figure.
// He goes down the staircase with the chart itself: each time its cursor (the bar with .cur) steps to
// the next day he hops, and from Thursday on each hop carries him one bar to the right along the line.
// Days he missed are hopped in a quick run, one bar each. When it reads 7, on Sunday's bar, he cheers.
import { timeline } from '../tween';
import { obstacles, pick, boxAt, type Spot } from '../perch';
import { spots, type Moment, type Run } from './kinds';

/** The first bar whose value label sits below the gridline (scenes' chart: Thursday). */
const FIRST = 3;

/** The chart's geometry (viewBox 560 x 240, the top gridline at y=50, bars 78 apart from x=48). */
function grid(sec: HTMLElement) {
  const svg = sec.querySelector('.chart svg')?.getBoundingClientRect();
  if (!svg || !svg.width) return null;
  const u = Math.min(svg.width / 560, svg.height / 240);
  const ox = svg.left + (svg.width - 560 * u) / 2, oy = svg.top + (svg.height - 240 * u) / 2;
  return { y: oy + 50 * u, col: (i: number) => ox + (48 + 78 * i) * u, l: svg.left, r: svg.right };
}

/** The day the chart's cursor is on (0 Monday to 6 Sunday), -1 before it starts. */
function curDay(sec: HTMLElement): number {
  return [...sec.querySelectorAll('.chart .cols rect')].findIndex((r) => r.classList.contains('cur'));
}

const sizeHere = () => (innerWidth < 720 ? 0.8 : 1);

export const numbers: Moment = {
  // Up on Thursday at once: a zip in from the side takes long enough for the chart to finish first.
  arrive: 'rise',
  spots(sec) {
    const g = grid(sec);
    const chart = sec.querySelector('.chart')?.getBoundingClientRect();
    const b = sec.querySelector('.big-num b')?.getBoundingClientRect();
    if (!g || !chart || !b) return [];
    const s = sizeHere();
    const floor: [number, number] = [g.l, g.r];
    return spots(
      { x: g.col(FIRST), y: g.y, s, face: 'l', floor },
      { x: chart.right - 100, y: g.y, s, face: 'l', floor },
      { x: chart.right - 90, y: g.y, s: 0.85, face: 'l', floor },
      // A phone: small, on the same line.
      { x: g.col(FIRST), y: g.y, s: 0.62, face: 'l', floor },
      { x: g.col(FIRST + 1), y: g.y, s: 0.62, face: 'l', floor },
      // The figure's baseline, out past its caption, if the line has no room.
      { x: chart.right - 90, y: b.bottom, s: 1, face: 'l' },
    );
  },
  start(run) {
    const { sec, host, kit } = run;
    /** Where he can stand over each bar from Thursday on (null where a label or the figure is in the
     *  way), and the line's height, in host px. Measured at each step: the page above may have
     *  settled its height since he came. */
    const measure = () => {
      const g = grid(sec);
      const xs: (number | null)[] = [];
      if (!g) return { xs, y: run.spot.y };
      const obs = obstacles(sec);
      for (let i = 0; i < 7; i++) {
        const sp: Spot | null = i < FIRST ? null : pick([{ x: g.col(i), y: g.y, s: kit.zs, face: 'l' }], obs);
        const b = sp && boxAt(sp);
        xs.push(sp && b && b.l >= 0 && b.r <= document.documentElement.clientWidth ? host.toLocal(sp.x, sp.y).x : null);
      }
      return { xs, y: host.toLocal(0, g.y).y };
    };
    // On the line, or on the figure's baseline (no staircase there).
    const onLine = () => {
      const g = grid(sec);
      return !!g && Math.abs(host.toClient(kit.st.x, kit.st.y).y - g.y) < 3;
    };
    let { xs, y: lineY } = measure();
    /** The bar he stands over for day d: the latest clear one up to it (-1: his spot). */
    const colFor = (day: number) => {
      for (let i = day; i >= FIRST; i--) if (xs[i] != null) return i;
      return -1;
    };
    const home0 = Math.abs((xs[FIRST] ?? NaN) - run.spot.x) < 2 ? FIRST : -1;
    const target = (day: number) => (onLine() ? Math.max(home0, colFor(day)) : home0);
    const xOf = (c: number) => (c < 0 ? run.spot.x : xs[c]!);
    const st = { day: -1, col: home0, hopping: false, cheered: false };
    const step = () => {
      if (!run.live() || (st.hopping && run.busy()) || kit.away) return;
      ({ xs, y: lineY } = measure());
      const d = curDay(sec);
      const to = target(d);
      if (to < st.col || d < st.day) {
        // Scrolled back: at the bar for that day at once.
        st.day = d;
        st.col = to;
        st.cheered = false;
        run.home(() => kit.at(xOf(to), onLine() ? lineY : run.spot.y, 'l'));
        return;
      }
      if (d === st.day) return;
      const tl = timeline();
      const cs: number[] = [];
      for (let c = st.col + 1; c <= to; c++) if (c >= FIRST && xs[c] != null) cs.push(c);
      // One hop per bar still to go, 0.26 s each, quicker (x1.6) when he has more than one to catch up.
      const k = cs.length >= 2 ? 1 / 1.6 : 1;
      // Back to back, one every `gap` s (crouch and flight inside it), a squash on the last landing.
      const gap = 0.26 * k;
      cs.forEach((c, i) => tl.add(kit.jumpTo(xOf(c), lineY, { h: 14, dur: gap - 0.08, face: 'l' }), i * gap));
      if (cs.length) kit.squash(tl, cs.length * gap);
      if (!cs.length) tl.add(kit.hop(6));
      st.day = d;
      st.col = to;
      if (d === 6 && !st.cheered) {
        st.cheered = true;
        tl.add(kit.cheer({ color: 'green' })).add(kit.happy(true), '+=0.1');
      }
      st.hopping = true;
      tl.call(() => {
        st.hopping = false;
        // The cursor may have moved on while he hopped.
        step();
      });
      run.play(tl);
    };
    const cols = sec.querySelector('.chart .cols');
    if (cols) {
      const mo = new MutationObserver(step);
      mo.observe(cols, { attributes: true, attributeFilter: ['class'], subtree: true });
      run.cleanup(() => mo.disconnect());
    }
    step();
    // And once a second while he stands still: if he was moved back onto his line (the page settled
    // under him), he catches up with the chart from there.
    const tick = () => run.later(1000, () => {
      if (!run.busy()) {
        if (st.day >= 0 && onLine() && st.col < target(st.day)) st.day = -1;
        step();
      }
      tick();
    });
    tick();
  },
};
