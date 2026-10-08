// 04 The loop (pinned). Kip stands inside the app window, on its bottom edge under the list column
// (that part of the list is empty in every state), and lives the loop with the scene: he rises as it
// starts, watches the question card form (a talk mark, wide eyes), types along with the reply, hops
// when the answer clears the wait, reads the diff line by line, twitches an ear every four tests,
// raises the wand as Merge charges (eyes on the button, its glow in step with it) and, on the merge,
// points the wand at the MERGED stamp as it lands: a green ring and sparks go off on the stamp
// itself, then a cheer, and he plants the wand as a flag. Scrolling back sets each beat's state at once.
import { timeline, set } from '../tween';
import { span } from '../../engine/drive';
import { spots, once, type Moment, type Run } from './kinds';
import type { Spot } from '../perch';

/** The scene's own marks (scenes/loop.ts). */
const ASK = 0.14, TYPE = 0.28, ANSWER = 0.42, DIFF = [0.52, 0.72] as const, TESTS = [0.62, 0.74] as const, CHARGE = [0.76, 0.87] as const, MERGE = 0.88;

function spot(sec: HTMLElement, s: number) {
  const win = sec.querySelector('.loop-win')?.getBoundingClientRect();
  const list = sec.querySelector('.loop-list')?.getBoundingClientRect();
  if (!win || !list || !win.width) return null;
  return { x: list.left + list.width * 0.5, y: win.bottom - 2, s, face: 'r' as const };
}

const state = new WeakMap<Run, (p: number) => void>();

/** Where the loop does not pin: small, on the app window's bottom edge at its right corner (or its
 *  top edge), facing back into it. When the scene merges, the same zap to the stamp, then a flag. */
const phone: Moment = {
  arrive: 'rise',
  spots(sec) {
    const win = sec.querySelector('.loop-win')?.getBoundingClientRect();
    if (!win || !win.width) return [];
    const s = 0.62, floor: [number, number] = [win.left, win.right];
    // Along its bottom edge from the right corner, then its top edge: the clearance check takes the
    // first one clear of the status line's words and the text above the window.
    const out: Spot[] = [];
    for (const y of [win.bottom - 1, win.top - 1]) for (let x = win.right - 30; x >= win.left + 30; x -= 12) out.push({ x, y, s, face: 'l', floor });
    return out;
  },
  start(run) {
    const { kit, sec } = run;
    const stampEl = sec.querySelector('.stamp');
    let merged = false;
    run.play(timeline().add(kit.lookAt(sec.querySelector('.loop-win') ?? { x: 0, y: 0 })).add(kit.lookAt(null), '+=1'), { ambient: true });
    run.watch(sec, 'is-merged', (on) => {
      if (!on || merged) return;
      merged = true;
      const tl = timeline();
      const at = run.pt(stampEl);
      if (at) {
        tl.add(kit.lookAt(at), 0).add(kit.pointAt(at), 0);
        tl.call(() => kit.zap(at.x, at.y, 'green', 0.3), null, 0.15);
        tl.call(() => kit.ringAt(at.x, at.y, 'green'), null, 0.45);
        tl.add(kit.armTo(0, { duration: 0.2 }), 0.8).add(kit.lookAt(null), 0.8);
      }
      tl.add(kit.cheer({ color: 'green' }), at ? 0.9 : 0);
      tl.add(kit.flag('green'), '+=0.1').add(kit.happy(true), '<');
      run.play(tl);
    }, true);
  },
};

export const loop: Moment = {
  pinned: true,
  phone,
  arrive: 'none',
  spots: (sec) => spots(spot(sec, 1), spot(sec, 0.85)),
  still: { pose: 'flag', face: 'l' },
  start(run) {
    const { kit, sec } = run;
    const q = sec.querySelector('.qcard');
    const merge = sec.querySelector('.merge-btn');
    const stampEl = sec.querySelector('.stamp');
    const merged = () => {
      const tl = timeline();
      const at = run.pt(stampEl);
      if (at) {
        // The wand on the stamp as it comes down (520 ms), and the zap where it lands.
        tl.add(kit.lookAt(at), 0);
        tl.add(kit.pointAt(at), 0);
        // The zap: green motes thrown from the wand along one arc, landing on the stamp with it.
        tl.call(() => kit.zap(at.x, at.y, 'green', 0.3), null, 0.15);
        tl.call(() => {
          kit.ringAt(at.x, at.y, 'green');
          kit.motes(at.x, at.y, 'green', 12, 70);
        }, null, 0.45);
        tl.to(kit.P.glow, { scale: 1.7, duration: 0.1, yoyo: true, repeat: 1 }, 0.4);
        tl.add(kit.armTo(0, { duration: 0.2 }), 0.8);
        tl.add(kit.lookAt(null), 0.8);
      }
      const t1 = at ? 0.9 : 0;
      tl.add(kit.cheer({ color: 'green' }), t1);
      tl.add(kit.flag('green'), t1 + 1.0);
      tl.add(kit.happy(true), t1 + 1.0);
      return tl;
    };
    const charged = () => {
      kit.face('r');
      kit.armTo(-95);
      if (merge) kit.lookAt(merge);
    };
    const beat = run.beats([
      { at: 0.04, on: () => timeline().add(kit.riseFrom(run.spot.x, run.spot.y, 'r', { hold: 0.5 })), home: () => undefined },
      { at: ASK, on: () => timeline().add(kit.lookAt(q ?? { x: 0, y: 0 })).add(kit.picto('talk', 0.9), 0).add(kit.wide(true), 0), home: () => (q && kit.lookAt(q), kit.wide(true)) },
      { at: TYPE, on: () => timeline().add(kit.wide(false)).add(kit.type(0.9), 0), home: () => q && kit.lookAt(q) },
      { at: ANSWER, on: () => timeline().add(kit.lookAt(null)).add(kit.happy(true), 0).add(kit.hop(10), 0.05), home: () => kit.happy(true) },
      { at: DIFF[0], on: () => kit.happy(false), home: () => undefined },
      ...[4, 8].map((n) => ({ at: TESTS[0] + (n / 12) * (TESTS[1] - TESTS[0]), on: () => kit.flick(), home: () => undefined })),
      { at: TESTS[1], on: () => timeline().add(kit.flick()).add(kit.poseTo('pawup', 0.2), 0).add(kit.poseTo('stand', 0.2), 0.7), home: () => undefined },
      { at: CHARGE[0], on: () => timeline().add(kit.faceTo('r')).add(kit.armTo(-95, { duration: 0.3, ease: 'back.out(1.6)' }), 0).add(merge ? kit.lookAt(merge) : timeline(), 0), home: charged },
      { at: MERGE, on: merged, home: () => (kit.pose('flag'), kit.happy(true)) },
    ], () => kit.hide());
    state.set(run, beat);
    // A real Merge click lands the merge before the scroll gets there.
    run.watch(sec, 'is-merged', (on) => on && !run.busy() && run.play(merged()));
  },
  progress(run, p) {
    state.get(run)?.(p);
    if (run.busy() || run.kit.away) return;
    const { kit, sec } = run;
    if (p >= DIFF[0] && p < DIFF[1]) {
      // Eyes step down the diff as it assembles.
      const lines = once(run, 'lines', () => [...sec.querySelectorAll('.diff .l')]);
      const i = Math.min(lines.length - 1, Math.floor(span(p, DIFF[0], DIFF[1]) * lines.length));
      const c = once(run, `line${i}`, () => run.pt(lines[i] ?? null, 0.3));
      if (c) kit.eyesOn(c);
    }
    if (p >= CHARGE[0] && p < MERGE) {
      // He powers the button: eyes on it while the wand's glow charges with it.
      const m = once(run, 'merge', () => run.pt(sec.querySelector('.merge-btn')));
      if (m) kit.eyesOn(m);
      set(kit.P.glow, { scale: 1 + 0.6 * span(p, CHARGE[0], CHARGE[1]) });
    }
  },
};
