// 02 Every vendor (pinned). Kip comes up over the ranked card's top edge, at its right end, once the
// card's frame is drawn, facing the vendor chips. His eyes ride the swarm as it streams in from the
// chips; while it spirals his pupils trace the vortex (a little dizzy by the end: his head tilts),
// then a blink with the ears back. As each row fills he hops and points the wand at it; when the
// rows re-rank he points at the one on top with a bang (it waits on you), and when the list settles
// on oldest wait first, a stamp ring and a happy face.
import { timeline, set } from '../tween';
import { span } from '../../engine/drive';
import { onTop, spots, type Moment, type Run } from './kinds';

/** Where the rows fill in (scenes/funnel.ts: the canvas hands over to the card from 0.64 to 0.72). */
const ROWS = [0.645, 0.665, 0.685, 0.705, 0.725];
const RISE = 0.3, SWIRL = [0.26, 0.56] as const, BLINK = 0.56, RANK = 0.82, DONE = 0.98;
const state = new WeakMap<Run, (p: number) => void>();

export const funnel: Moment = {
  pinned: true,
  arrive: 'none',
  spots(sec) {
    const card = sec.querySelector('.app.ranked');
    return spots(onTop(card, -80, 1, 'l'), onTop(card, -60, 1, 'l'), onTop(card, -80, 0.85, 'l'));
  },
  start(run) {
    const { kit, sec } = run;
    const vendors = sec.querySelector('.vendors');
    const top = () => sec.querySelector('.ranked-list .row.needs') ?? sec.querySelector('.ranked-list .row');
    const rows = [...sec.querySelectorAll('.ranked-list .row')];
    const rowBeats = ROWS.map((at, i) => ({
      at,
      on: () => {
        const r = rows[i + 1] ?? rows[i];
        const tl = timeline().add(kit.ears(0, 0, 0.2)).add(kit.hop(6), 0);
        if (r) tl.add(kit.pointAt(r), 0.05);
        return tl;
      },
      home: () => kit.ears(0, 0),
    }));
    state.set(run, run.beats([
      { at: RISE, on: () => timeline().add(kit.riseFrom(run.spot.x, run.spot.y, 'l', { hold: 0.5 })).add(vendors ? kit.lookAt(vendors) : timeline(), 0.4), home: () => undefined },
      { at: BLINK, on: () => timeline().add(kit.ears(30, 20, 0.2)).to(kit.lids, { scaleY: 1, duration: 0.07, yoyo: true, repeat: 1 }, 0.05).add(kit.lookAt(null), 0.2), home: () => kit.ears(30, 20) },
      ...rowBeats,
      { at: 0.76, on: () => kit.armTo(0, { duration: 0.25 }), home: () => kit.armTo(0) },
      { at: RANK, on: () => timeline().add(kit.pointAt(top() ?? { x: 0, y: 0 })).add(kit.picto('bang', 0.8), 0.1), home: () => kit.pointAt(top() ?? { x: 0, y: 0 }) },
      { at: DONE, on: () => timeline().add(kit.armTo(0)).add(kit.stamp('green'), 0.05).add(kit.happy(true), 0.2).add(kit.lookAt(null), 0.2), home: () => kit.happy(true) },
    ], () => kit.hide()));
  },
  progress(run, p) {
    state.get(run)?.(p);
    const { kit, sec } = run;
    if (!run.busy() && !kit.away && p >= RISE && p < SWIRL[0] + 0.02) {
      // The swarm streams from the chips to the card: his eyes ride its middle.
      const v = run.pt(sec.querySelector('.vendors')), c = run.pt(sec.querySelector('.ranked-list'));
      const t = span(p, 0.1, SWIRL[0] + 0.02);
      if (v && c) kit.eyesOn({ x: v.x + (c.x - v.x) * t, y: v.y + (c.y - v.y) * t });
    }
    if (run.busy() || kit.away || p < SWIRL[0] || p >= SWIRL[1]) {
      if (p >= SWIRL[1] && p < RANK && !run.busy() && !kit.away) set(kit.P.head, { rotation: 0 });
      return;
    }
    // The vortex: a turn and a half while the units pour in.
    const t = span(p, SWIRL[0], SWIRL[1]);
    const a = t * Math.PI * 3;
    kit.lookHold = true;
    set(kit.P.pupils, { x: Math.cos(a) * 2.4, y: Math.sin(a) * 2.2 });
    set(kit.P.head, { rotation: 7 * span(p, 0.45, SWIRL[1]) * Math.sin(a) });
  },
};
