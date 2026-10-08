// 11 Proof of Merge. Kip stands on the escrow box's lid, at its right end, clear of the coin. His
// eyes follow the coin down; as the lid closes he hops and lands on it with a squash (he sits on the
// lid to shut it); an ear flick when the lock is ready. When the merge releases the pay (on its own
// or by the button): eyes on the button, a cheer with amber motes as the coin rises, then, as the
// lid swings open where he stands, he is off in a puff and dashes in along the top of the release
// receipt, cheers there with green sparks, points the wand at its "settled on devnet" and looks
// happy. The replay brings him back to the lid for the next drop.
import { timeline } from '../tween';
import { span } from '../../engine/drive';
import { obstacles, pick, boxAt, type Spot } from '../perch';
import { H } from '../kit';
import { spots, type Moment, type Run } from './kinds';

/** On the receipt's top edge, at its right end, facing back along it (viewport px). */
function onReceipt(sec: HTMLElement, s: number): Spot | null {
  const r = sec.querySelector('.receipt')?.getBoundingClientRect();
  if (!r || !r.width) return null;
  return { x: r.right - 80, y: r.top - 1, s, face: 'l', floor: [r.left, r.right] };
}

/** Points along the attestation line from the lock to the receipt (viewport px), once it is drawn. */
function attest(sec: HTMLElement): { x: number; y: number }[] {
  const path = sec.querySelector<SVGPathElement>('.attest path');
  const m = path?.getScreenCTM();
  if (!path || !m || !path.getAttribute('d') || !sec.querySelector('.proof-grid.released')) return [];
  const len = path.getTotalLength();
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= 40; i++) {
    const p = path.getPointAtLength((len * i) / 40);
    out.push({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
  }
  return out;
}

/** On the escrow box's flat top edge, at its right end: where his whole box stays right of the lid
 *  when it stands open (it pivots on its left end, up to 32 degrees) and clear of the attestation
 *  line. Viewport px; none where the box is too narrow for that. */
function onLid(sec: HTMLElement, s: number): Spot[] {
  const svg = sec.querySelector('.escrow svg')?.getBoundingClientRect();
  const box = sec.querySelector('.escrow .box')?.getBoundingClientRect();
  if (!svg || !box || !svg.width) return [];
  const u = Math.min(svg.width / 320, svg.height / 220);
  const ox = svg.left + (svg.width - 320 * u) / 2;
  // The open lid's line at his head's height: right of this x it is above him.
  const top = (H * s + 8) / u;
  const lidX = ox + (70 + top / Math.tan((32 * Math.PI) / 180)) * u;
  const line = attest(sec);
  const out: Spot[] = [];
  for (const face of ['l', 'r'] as const) {
    for (let x = box.right - 14 * s; x >= box.left + 40 * s; x -= 12) {
      const sp: Spot = { x, y: box.top, s, face, floor: [box.left, box.right] };
      const b = boxAt(sp);
      // The wand may reach out past the box's end, over nothing: only his feet need the box.
      if (b.l < lidX) continue;
      if (line.some((p) => p.x > b.l && p.x < b.r && p.y > b.t && p.y < b.b + 6)) continue;
      out.push(sp);
      break;
    }
  }
  return out;
}

const state = new WeakMap<Run, { drop: number; landed: boolean; ready: boolean }>();

export const proof: Moment = {
  arrive: 'rise',
  spots(sec) {
    const lid = [...onLid(sec, 1), ...onLid(sec, 0.85), ...onLid(sec, 0.62)];
    // Once released the lid stands open over the box: he waits on the receipt instead.
    if (sec.querySelector('.proof-grid.released')) return spots(onReceipt(sec, 1), onReceipt(sec, 0.85), ...lid);
    return spots(...lid);
  },
  // The escrow's own progress (scenes/proof.ts: drive(escrow, ..., { fallback: 'view', viewEnd: 0.3 })).
  p(sec) {
    const r = sec.querySelector('.escrow')?.getBoundingClientRect();
    if (!r) return 0;
    return Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.7)));
  },
  start(run) {
    const { kit, sec } = run;
    const grid = sec.querySelector('.proof-grid');
    const chip = sec.querySelector('.merge-chip');
    const settled = sec.querySelector('.receipt .settled');
    state.set(run, { drop: -1, landed: false, ready: false });
    let onTop = true;
    /** The receipt spot in host px, if it is clear now. */
    const receipt = () => {
      const sp = pick([onReceipt(sec, kit.zs)].filter((x): x is Spot => !!x), obstacles(sec), { screen: true });
      return sp ? { ...sp, ...run.host.toLocal(sp.x, sp.y) } : null;
    };
    const released = () => {
      const tl = timeline();
      if (chip) tl.add(kit.lookAt(chip));
      tl.add(kit.cheer({ color: 'amber', wand: -70 }), 0.26);
      const to = onTop ? receipt() : null;
      if (to) {
        // Off the lid before it swings open under him, and in along the receipt's top.
        const left = run.host.toLocal(sec.querySelector('.receipt')!.getBoundingClientRect().left, 0).x;
        tl.add(kit.vanish(), 1.05);
        tl.add(kit.zipTo(to.x - 8, to.y, 1, undefined, Math.max(40, Math.min(240, to.x - left - 40))), '+=0.05');
        tl.add(kit.skid());
        kit.squash(tl, tl.duration() - 0.2);
        tl.add(kit.faceTo('l'));
        tl.call(() => (onTop = false));
        tl.add(kit.cheer({ color: 'green', wand: -70 }), '+=0.05');
      } else if (onTop) {
        // Staying on the box: the attestation line now runs from the lock to the receipt, so he
        // steps along the edge to where it does not cross him (if he is not there already).
        const sp = pick(onLid(sec, kit.zs), obstacles(sec));
        const now = run.host.toClient(kit.st.x, kit.st.y);
        if (sp && Math.abs(sp.x - now.x) > 4) {
          const p = run.host.toLocal(sp.x, sp.y);
          tl.add(kit.jumpTo(p.x, p.y, { h: 14, dur: 0.3, face: sp.face }), 1.0);
          kit.squash(tl, tl.duration() - 0.08);
        }
      }
      if (settled) tl.add(kit.pointAt(settled), '+=0.1');
      tl.add(kit.armTo(0, { duration: 0.25 }), '+=0.7');
      tl.add(kit.lookAt(null), '<');
      tl.add(kit.happy(true), '<');
      run.play(tl);
    };
    const back = () => {
      if (onTop) return;
      onTop = true;
      run.play(timeline().add(kit.happy(false)).add(kit.poof(run.spot.x, run.spot.y, 'l')));
    };
    // Came while it was released: already on the receipt if that was his spot.
    if (grid?.classList.contains('released')) {
      const atReceipt = Math.abs(run.host.toClient(run.spot.x, run.spot.y).y - (sec.querySelector('.receipt')?.getBoundingClientRect().top ?? -9) + 1) < 2;
      onTop = !atReceipt;
      run.play(kit.happy(true));
    }
    run.watch(grid, 'released', (on) => (on ? released() : back()));
  },
  progress(run, p) {
    const st = state.get(run);
    if (!st) return;
    const { kit, sec } = run;
    if (!st.landed && p >= 0.5) {
      st.landed = true;
      if (p < 0.7) {
        const tl = timeline().add(kit.hop(16));
        kit.squash(tl, 0.38);
        run.play(tl);
      }
    }
    if (!st.ready && p >= 0.72) {
      st.ready = true;
      if (!run.busy()) run.play(kit.flick());
    }
    if (p >= 0.05 && p < 0.45 && !run.busy() && !kit.away) {
      const coin = sec.querySelector('.escrow .coin')?.getBoundingClientRect();
      if (coin) kit.eyesOn(run.host.toLocal(coin.left + coin.width / 2, coin.top + coin.height / 2));
      st.drop = span(p, 0.05, 0.45);
    }
  },
};
