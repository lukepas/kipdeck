// 03 The problem (pinned), the deck's clock moment adapted. Kip sits on top of the "10:25" at the end
// of the wait bar and watches the bar grow toward him from 10:02, his ears drooping minute by
// minute; when "23 min" lands he slumps. When the view widens to the workday he is gone until the
// total starts to fill along the line under the day, then comes up over that line's end, follows the
// total, watches the bar fly up, and, as it docks into the wait clock along the top of the page,
// ears up, a bang, and the wand points up at it. He leaves from there in a puff (no floor runs on).
import { timeline, set } from '../tween';
import { span, ease } from '../../engine/drive';
import { obstacles, pick, inkTop, type Spot } from '../perch';
import { spots, once, type Moment, type Run } from './kinds';

const ARRIVE = 0.06, RUN_END = 0.36, SWAP = 0.5, SUM = [0.82, 0.92] as const, FLY = [0.92, 0.99] as const, DOCK = 0.985;

/** On the total line under the day: its right end (orange under his feet once it has filled), or
 *  just past the drawing where the end is crowded (viewport px). */
function lineEnd(sec: HTMLElement): Spot[] {
  const svg = sec.querySelector('.lanes svg')?.getBoundingClientRect();
  if (!svg || !svg.width) return [];
  const u = Math.min(svg.width / 600, svg.height / 256);
  const ox = (svg.width - 600 * u) / 2, oy = (svg.height - 256 * u) / 2;
  const right = svg.left + ox + 600 * u, y = svg.top + oy + 229 * u;
  return [{ x: right - 30, y, s: 1, face: 'l' }, { x: right + 54, y: svg.top + oy + 232 * u + 3, s: 1, face: 'l' }];
}

/** How much of the total bar is filled (0 to 1), as the scene drew it (its clip-path). */
function filled(sec: HTMLElement, p: number): number {
  const el = sec.querySelector<SVGElement>('.lane-total');
  const m = el && /inset\(\s*[\d.]+(?:px)?\s+([\d.]+)%/.exec(el.style.clipPath);
  return m ? 1 - Number(m[1]) / 100 : ease(p, SUM[0], SUM[1]);
}

/** On top of the wait bar, near its right end, out of the way of "10:25" as it lights up. */
function barEnd(sec: HTMLElement, s: number): Spot | null {
  const bar = sec.querySelector('.span-bar')?.getBoundingClientRect();
  if (!bar || !bar.width) return null;
  return { x: bar.right - 30 * s - 30, y: bar.top, s, face: 'r', floor: [bar.left, bar.right] };
}

/** How far his seat drops below his feet line in the sit pose (px at size 1), plus the timestamp's
 *  growth when the clock reaches it. */
const SEAT = 8;

/** The top of an element's glyphs (viewport px), and its left and right. */
function glyphs(el: Element): { l: number; r: number; t: number } | null {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rs = [...range.getClientRects()].filter((r) => r.width > 0);
  if (!rs.length) return null;
  const ink = inkTop(el, (el.textContent ?? '').trim());
  return { l: Math.min(...rs.map((r) => r.left)), r: Math.max(...rs.map((r) => r.right)), t: Math.min(...rs.map((r) => r.top + r.height * ink)) };
}

const state = new WeakMap<Run, { beat: (p: number) => void; b: () => Spot | null; rise: (p: number) => void }>();

/** The baseline of an element's first line of text (viewport px), and its glyphs' right end. */
function baselineOf(el: Element): { y: number; r: number } | null {
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = [...range.getClientRects()].find((x) => x.width > 0);
  if (!r) return null;
  const cs = getComputedStyle(el);
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return null;
  c.font = `${cs.fontStyle} ${cs.fontWeight} 100px ${cs.fontFamily}`;
  const m = c.measureText(el.textContent ?? '');
  const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
  if (!(a > 0)) return null;
  // A range's rect is the font's content area: ascent above the baseline, descent below.
  return { y: r.top + r.height * (a / (a + d)), r: r.right };
}

/** Where the section does not pin (a phone): small, on the baseline of the big orange "23", just
 *  past its glyphs. He comes up as it lands, looks at it, and his ears droop as he sits. */
const phone: Moment = {
  arrive: 'rise',
  spots(sec) {
    const huge = sec.querySelector('.huge');
    const n = huge?.querySelector('span');
    const b = n && baselineOf(n);
    if (!huge || !b) return [];
    // Past the 40 px every display line keeps clear (perch.ts) on both lines ("23", and "min" where
    // it wraps under it), plus his wand held out toward them.
    const range = document.createRange();
    range.selectNodeContents(huge);
    const right = Math.max(b.r, ...[...range.getClientRects()].filter((r) => r.width > 0).map((r) => r.right));
    return spots({ x: right + 88, y: b.y, s: 0.62, face: 'l' }, { x: b.r + 88, y: b.y, s: 0.62, face: 'l' });
  },
  start(run) {
    const { kit, sec } = run;
    const n = sec.querySelector('.huge span');
    const tl = timeline();
    if (n) tl.add(kit.lookAt(n));
    tl.add(kit.ears(-20, -12, 0.5), 0.4);
    tl.add(kit.poseTo('sitdown', 0.3), 0.6).add(kit.flick(), 1.0);
    run.play(tl);
  },
};

export const problem: Moment = {
  pinned: true,
  phone,
  arrive: 'none',
  // The workday is drawn in the same place but hidden while he sits on the clock.
  ignore: '.layer-b, .span-now',
  spots(sec) {
    const el = sec.querySelector('.ts-end');
    const t = el && glyphs(el);
    if (!t) return [];
    const x = (t.l + t.r) / 2;
    // He sits on the digits themselves (not on the empty top of their line box): his seat drops
    // SEAT px below his feet line, and the timestamp grows a little when the clock reaches it.
    return spots({ x, y: t.t - SEAT, s: 1, face: 'l' }, { x, y: t.t - SEAT * 0.85, s: 0.85, face: 'l' });
  },
  start(run) {
    const { kit, sec, host } = run;
    // The end of the day's line, measured once the workday has settled in (from 0.6 on).
    const spotB = () => {
      const b0 = pick(lineEnd(sec), obstacles(sec, { ignore: '.layer-a, .huge, .span-now' }));
      return b0 ? { ...b0, ...host.toLocal(b0.x, b0.y) } : null;
    };
    let b: Spot | null = null;
    const atB = () => {
      b = spotB();
      if (!b) return void kit.hide();
      kit.at(b.x, b.y, 'l');
    };
    const clock = document.querySelector('#waitclock');
    // When the clock reaches 10:25 (it lights up and grows), he hops off it to the bar's right end.
    const off = () => {
      const sp = pick([barEnd(sec, kit.zs)].filter((x): x is Spot => !!x), obstacles(sec, { ignore: '.layer-b, .span-now' }));
      return sp ? { ...sp, ...host.toLocal(sp.x, sp.y) } : null;
    };
    let up = false;
    /** Up over the line's end once the total has actually filled under it (from 97% on). */
    const rise = (p: number) => {
      if (p < SUM[0]) {
        up = false;
        return;
      }
      if (up || filled(sec, p) < 0.97) return;
      up = true;
      b = spotB();
      if (b) run.play(timeline().add(kit.riseFrom(b.x, b.y, 'l', { hold: 0.35 })));
    };
    const beat = run.beats([
      { at: ARRIVE, on: () => timeline().add(kit.riseFrom(run.spot.x, run.spot.y, 'l', { hold: 0.45 })).add(kit.poseTo('sit', 0.2), 0.9), home: () => kit.pose('sit') },
      {
        at: RUN_END,
        on: () => {
          const to = off();
          const tl = timeline();
          if (to) {
            tl.add(kit.poseTo('stand', 0.12));
            tl.add(kit.jumpTo(to.x, to.y, { h: 22, dur: 0.34, face: 'l' }));
            kit.squash(tl, tl.duration() - 0.08);
            tl.add(kit.faceTo('r'));
          }
          const at = tl.duration();
          tl.add(kit.poseTo('sitdown', 0.3), at).add(kit.flick(), at + 0.32);
          tl.to(kit.P.root, { y: 3, duration: 0.06, yoyo: true, repeat: 1 }, at + 0.32);
          return tl;
        },
        home: () => {
          const to = off();
          if (to) kit.at(to.x, to.y, 'r');
          kit.pose('sitdown');
        },
      },
      { at: SWAP, on: () => kit.vanish(), home: () => kit.hide() },
      // Nothing to stand on until the total has filled the day's line: progress() brings him up then.
      {
        at: SUM[0],
        on: () => undefined,
        home: () => {
          up = false;
          kit.hide();
        },
      },
      {
        at: DOCK,
        on: () => {
          const tl = timeline().add(kit.ears(-4, -10, 0.12)).add(kit.wide(true), 0).add(kit.picto('bang', 0.8), 0);
          if (clock) tl.add(kit.pointAt(clock), 0.2);
          return tl;
        },
        home: () => ((up = true), atB(), clock && kit.pointAt(clock), kit.wide(true)),
      },
    ], () => kit.hide());
    state.set(run, { beat, b: () => b, rise });
  },
  progress(run, p) {
    const st = state.get(run);
    if (!st) return;
    st.beat(p);
    st.rise(p);
    const { kit, sec } = run;
    if (run.busy() || kit.away) return;
    if (p >= ARRIVE && p < RUN_END) {
      // Eyes on the bar's growing end, ears drooping minute by minute.
      const bar = once(run, 'bar', () => {
        const r = sec.querySelector('.span-bar')?.getBoundingClientRect();
        return r ? { a: run.host.toLocal(r.left, r.top + r.height / 2), w: r.width } : null;
      });
      const t = span(p, ARRIVE, RUN_END);
      if (bar) kit.eyesOn({ x: bar.a.x + bar.w * t, y: bar.a.y });
      set(kit.P.earL, { rotation: -38 * t });
      set(kit.P.earR, { rotation: 38 * t });
    } else if (st.b() && p >= SUM[0] && p < FLY[1]) {
      // In his layer: the line's left end, its unit, and the window's top (where the bar flies to).
      const g = once(run, 'lanes', () => {
        const svg = sec.querySelector('.lanes svg')?.getBoundingClientRect();
        if (!svg) return null;
        const u = Math.min(svg.width / 600, svg.height / 256), ox = (svg.width - 600 * u) / 2, oy = (svg.height - 256 * u) / 2;
        return { o: run.host.toLocal(svg.left + ox, svg.top + oy + 232 * u), u, top: run.host.toLocal(0, 0).y };
      });
      if (!g) return;
      if (p < SUM[1]) kit.eyesOn({ x: g.o.x + (40 + 560 * span(p, SUM[0], SUM[1])) * g.u, y: g.o.y });
      else {
        const f = span(p, FLY[0], FLY[1]);
        kit.eyesOn({ x: g.o.x + 300 * g.u * (1 - f), y: g.top + (g.o.y - g.top) * (1 - f) });
      }
    }
  },
};
