// Kip's gestures, line for line from the deck (mergeline-deck/site/kip.js), plus riseFrom and squash
// from its wow.js. Each returns a timeline so a moment can lay them on its beats; with less motion
// (kit.static) each one jumps straight to its end.
import { set, to, timeline, getProperty, type Timeline } from './tween';
import type { Core, Face, Pt } from './kit';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ZIP = 240;

export interface RunOpts { y?: number; speed?: number; dash?: boolean; dur?: number; ease?: string; carry?: boolean; keepCarry?: boolean; face?: Face }

export type Moves = ReturnType<typeof moves>;

export function addMoves<C extends Core>(kit: C): C & Moves {
  return Object.assign(kit, moves(kit));
}

function moves(kit: Core) {
  const { P, el, flip, lids, lows } = kit;
  const fin = kit.fin;
  const armTo = kit.armTween;

  /* Steps every ~0.14 s. He leans into the run, the head turns 3/4 toward the travel direction (the far
     ear's inner hidden), legs swing +-50 with the arms in opposition, the body bobs 3 units up at
     mid-stride and the ear tips trail the bob by 0.06 s. Every second contact kicks up dust. */
  function runCycle(tl: Timeline, at: number, dur: number, o: { lean?: number; carry?: boolean; keepCarry?: boolean } = {}) {
    const steps = Math.max(2, Math.round(dur / 0.14)), sd = dur / steps;
    const lean = o.lean ?? 10;
    tl.to(P.root, { rotation: lean, duration: 0.12, ease: 'power2.out' }, at);
    tl.to(P.head, { x: 2, duration: 0.12, ease: 'power2.out' }, at);
    tl.to(P.scarfTails, { rotation: -20, duration: 0.15 }, at);
    tl.to(P.look, { x: 3, duration: 0.12, ease: 'power2.out' }, at);
    tl.to(P.face, { x: 9, duration: 0.12, ease: 'power2.out' }, at);
    tl.to(P.inL, { opacity: 0, duration: 0.08 }, at);
    if (o.carry) {
      armTo(tl, -35, { duration: 0.12 }, at, 35);
      tl.to(P.trail, { opacity: 1, duration: 0.12 }, at + 0.08);
    }
    for (let i = 0; i < steps; i++) {
      const s = i % 2 ? 1 : -1, t = at + i * sd;
      tl.to(P.legL, { rotation: 50 * s, duration: sd, ease: 'sine.inOut' }, t);
      tl.to(P.legR, { rotation: -50 * s, duration: sd, ease: 'sine.inOut' }, t);
      tl.to(P.armL, { rotation: -55 * s, duration: sd, ease: 'sine.inOut' }, t);
      if (!o.carry) armTo(tl, s > 0 ? 55 : -18, { duration: sd, ease: 'sine.inOut' }, t);
      tl.to(P.root, { y: -4, duration: sd / 2, ease: 'sine.out', yoyo: true, repeat: 1 }, t);
      tl.to(P.root, { scaleY: 0.92, scaleX: 1.06, duration: 0.05, ease: 'power1.out', yoyo: true, repeat: 1 }, t);
      tl.to([P.tipL, P.tipR], { rotation: -26, duration: sd / 2, ease: 'sine.out', yoyo: true, repeat: 1 }, t + 0.06);
      if (i % 2) tl.fromTo(P.dust, { opacity: 0.9, x: 0 }, { opacity: 0, x: -10, duration: Math.min(0.3, sd * 2), ease: 'power1.out' }, t);
    }
    runEnd(tl, at + dur, o);
  }
  /** The end of a run: limbs, head and face back to standing. */
  function runEnd(tl: Timeline, end: number, o: { carry?: boolean; keepCarry?: boolean } = {}) {
    tl.to([P.legL, P.legR, P.armL, P.root, P.tipL, P.tipR, P.scarfTails], { rotation: 0, duration: 0.14, ease: 'power2.out' }, end);
    tl.to([P.look, P.head], { x: 0, duration: 0.16 }, end);
    tl.to(P.face, { x: 6, duration: 0.04 }, end);
    tl.to(P.inL, { opacity: 1, duration: 0.1 }, end);
    if (o.carry) {
      armTo(tl, o.keepCarry ? -35 : 0, { duration: 0.14 }, end, o.keepCarry ? 35 : 0);
      tl.to(P.trail, { opacity: 0, duration: 0.25 }, end);
    } else armTo(tl, 0, { duration: 0.14 }, end);
    tl.to(P.root, { y: 0, scaleX: 1, scaleY: 1, duration: 0.1 }, end);
  }

  /** Stops a run cut short (the scroll stopped): back to standing in 0.14 s. */
  function settle() {
    const tl = timeline();
    runEnd(tl, 0);
    tl.to(P.speed, { opacity: 0, duration: 0.1 }, 0);
    return fin(tl);
  }

  function runTo(x: number, o: RunOpts = {}) {
    const tl = timeline();
    const x0 = kit.st.x, y0 = kit.st.y, y = o.y ?? y0;
    const dist = Math.hypot(x - x0, y - y0);
    const speed = o.speed ?? (o.dash ? 1600 : 700);
    const dur = o.dur ?? Math.max(0.2, dist / speed);
    if (dist < 2) return fin(tl);
    kit.faceIn(tl, x >= x0 ? 'r' : 'l', 0);
    tl.to(el, { x: x - kit.w / 2, y: y - kit.h, duration: dur, ease: o.ease ?? 'power1.inOut' }, 0);
    runCycle(tl, 0, dur, { carry: o.carry, keepCarry: o.keepCarry, lean: o.dash ? 14 : 10 });
    if (o.dash) tl.fromTo(P.speed, { opacity: 0 }, { opacity: 0.8, duration: 0.1, yoyo: true, repeat: 1, repeatDelay: Math.max(0, dur - 0.2) }, 0);
    kit.st.x = x;
    kit.st.y = y;
    if (o.face) kit.faceIn(tl, o.face, dur + 0.05);
    return fin(tl);
  }

  /** A run in place, for the scroll-coupled run: the body runs, the director moves him. */
  function running(dur: number, dash: boolean) {
    const tl = timeline();
    runCycle(tl, 0, dur, { lean: dash ? 14 : 10 });
    if (dash) tl.fromTo(P.speed, { opacity: 0 }, { opacity: 0.8, duration: 0.1, yoyo: true, repeat: 1, repeatDelay: Math.max(0, dur - 0.2) }, 0);
    return fin(tl);
  }

  function jumpTo(x: number, y: number, o: { dur?: number; h?: number; face?: Face } = {}) {
    const tl = timeline(), dur = o.dur ?? 0.42, hgt = kit.lift(o.h ?? Math.max(26, Math.abs(y - kit.st.y) * 0.4 + 20));
    if (Math.abs(x - kit.st.x) > 2) kit.faceIn(tl, x > kit.st.x ? 'r' : 'l', 0);
    tl.to(P.root, { scaleY: 0.88, duration: 0.08 }, 0);
    tl.to(P.root, { scaleY: 1.06, duration: 0.12 }, 0.08);
    tl.to(el, { x: x - kit.w / 2, y: y - kit.h, duration: dur, ease: 'none' }, 0.08);
    tl.to(flip, { y: -hgt, duration: dur / 2, ease: 'power2.out' }, 0.08);
    tl.to(flip, { y: 0, duration: dur / 2, ease: 'power2.in' }, 0.08 + dur / 2);
    tl.to(P.armL, { rotation: 60, duration: 0.15 }, 0.08);
    armTo(tl, -60, { duration: 0.15 }, 0.08);
    tl.to(P.root, { scaleY: 0.92, duration: 0.06 }, 0.08 + dur);
    tl.to(P.root, { scaleY: 1, duration: 0.12 }, 0.14 + dur);
    tl.to(P.armL, { rotation: 0, duration: 0.15 }, 0.08 + dur);
    armTo(tl, 0, { duration: 0.15 }, 0.08 + dur);
    kit.st.x = x;
    kit.st.y = y;
    if (o.face) kit.faceIn(tl, o.face, dur + 0.1);
    return fin(tl);
  }

  function hop(hgt = 14) {
    hgt = kit.lift(hgt);
    const tl = timeline();
    tl.to(P.root, { scaleY: 0.9, duration: 0.07 }, 0);
    tl.to(flip, { y: -hgt, duration: 0.14, ease: 'power2.out' }, 0.07);
    tl.to(P.root, { scaleY: 1.05, duration: 0.1 }, 0.07);
    tl.to(flip, { y: 0, duration: 0.14, ease: 'power2.in' }, 0.21);
    tl.to(P.root, { scaleY: 0.94, duration: 0.05 }, 0.35);
    tl.to(P.root, { scaleY: 1, duration: 0.1 }, 0.4);
    return fin(tl);
  }

  function skid() {
    const tl = timeline();
    const dir = kit.st.face === 'l' ? -1 : 1;
    tl.to(P.root, { rotation: -12, duration: 0.08, ease: 'power2.out' }, 0);
    tl.fromTo(P.dust, { opacity: 0, x: 0 }, { opacity: 1, x: -6, duration: 0.12 }, 0);
    tl.to(P.dust, { opacity: 0, x: -14, duration: 0.3 }, 0.14);
    tl.to(el, { x: `+=${8 * dir}`, duration: 0.16, ease: 'power2.out' }, 0);
    tl.to(P.root, { rotation: 0, duration: 0.22, ease: 'back.out(2)' }, 0.16);
    kit.st.x += 8 * dir;
    return fin(tl);
  }

  /** Landing squash and stretch, 0.25 s (wow.js). */
  function squash(tl: Timeline, at: number) {
    tl.to(P.root, { scaleY: 0.8, scaleX: 1.16, duration: 0.07, ease: 'power2.out' }, at);
    tl.to(P.root, { scaleY: 1.08, scaleX: 0.94, duration: 0.08, ease: 'power2.inOut' }, at + 0.07);
    tl.to(P.root, { scaleY: 1, scaleX: 1, duration: 0.1, ease: 'back.out(3)' }, at + 0.15);
    return tl;
  }

  function wave(n = 2, o: { hold?: boolean; keepHappy?: boolean } = {}) {
    const tl = timeline();
    tl.to(P.armL, { rotation: 140, duration: 0.18, ease: 'power2.out' }, 0);
    tl.to(P.head, { rotation: 8, duration: 0.2 }, 0);
    tl.to(lows, { scaleY: 0.7, duration: 0.15 }, 0);
    tl.to(lids, { scaleY: 0, duration: 0.15 }, 0);
    for (let i = 0; i < n; i++) {
      tl.to(P.armL, { rotation: 120, duration: 0.11, ease: 'sine.inOut' }, 0.18 + i * 0.44);
      tl.to(P.armL, { rotation: 160, duration: 0.22, ease: 'sine.inOut' }, 0.29 + i * 0.44);
      tl.to(P.armL, { rotation: 140, duration: 0.11, ease: 'sine.inOut' }, 0.51 + i * 0.44);
    }
    if (!o.hold) {
      const e = 0.2 + n * 0.44;
      tl.to(P.armL, { rotation: 0, duration: 0.22, ease: 'power2.inOut' }, e);
      tl.to(P.head, { rotation: 0, duration: 0.22 }, e);
      if (!o.keepHappy) {
        tl.to(lows, { scaleY: 0, duration: 0.2 }, e + 0.1);
        tl.to(lids, { scaleY: 0.12, duration: 0.2 }, e + 0.1);
      }
    }
    return fin(tl);
  }

  /** Both arms up, a jump and sparks from the wand. `wand` sets the wand arm's angle (default -150,
   *  straight up); a lower one keeps the rod clear of an edge drawn just above his head. */
  function cheer(o: { h?: number; color?: string; hold?: boolean; wand?: number } = {}) {
    const tl = timeline(), hgt = kit.lift(o.h ?? 40);
    tl.to(P.root, { scaleY: 0.9, duration: 0.1 }, 0);
    tl.to(lows, { scaleY: 0.7, duration: 0.1 }, 0);
    tl.to(lids, { scaleY: 0, duration: 0.1 }, 0);
    tl.to(P.armL, { rotation: 150, duration: 0.18 }, 0.08);
    armTo(tl, o.wand ?? -150, { duration: 0.18 }, 0.08);
    tl.to([P.earL, P.earR, P.tipL, P.tipR], { rotation: 0, duration: 0.15 }, 0.08);
    tl.to(P.mouthO, { opacity: 1, duration: 0.1 }, 0.1);
    tl.to(P.mouth, { opacity: 0, duration: 0.1 }, 0.1);
    tl.to(P.root, { scaleY: 1.08, duration: 0.14 }, 0.1);
    tl.to(flip, { y: -hgt, duration: 0.24, ease: 'power2.out' }, 0.1);
    tl.to(flip, { y: 0, duration: 0.22, ease: 'power2.in' }, 0.34);
    tl.to(P.root, { scaleY: 0.92, duration: 0.06 }, 0.56);
    tl.to(P.root, { scaleY: 1, duration: 0.14, ease: 'back.out(3)' }, 0.62);
    // the wand as a sparkler
    tl.to(P.glow, { scale: 1.5, duration: 0.08, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 0.1);
    tl.call(() => {
      const p = kit.tip();
      kit.motes(p.x, p.y, o.color ?? 'multi', 10, 54);
    }, null, 0.3);
    if (!o.hold) {
      tl.to(P.armL, { rotation: 0, duration: 0.25 }, 0.95);
      armTo(tl, 0, { duration: 0.25 }, 0.95);
      tl.to(P.mouthO, { opacity: 0, duration: 0.15 }, 0.95);
      tl.to(P.mouth, { opacity: 1, duration: 0.15 }, 0.95);
    }
    return fin(tl);
  }

  function twirl() {
    const tl = timeline(), s = kit.flipSign();
    const sx = (m: number) => () => m * kit.curS();
    tl.to(flip, { scaleX: sx(-s), duration: 0.14, ease: 'sine.in' }, 0);
    tl.to(flip, { scaleX: sx(s), duration: 0.14, ease: 'sine.out' }, 0.14);
    tl.to(flip, { scaleX: sx(-s), duration: 0.14, ease: 'sine.in' }, 0.28);
    tl.to(flip, { scaleX: sx(s), duration: 0.14, ease: 'sine.out' }, 0.42);
    tl.to(flip, { y: -kit.lift(10), duration: 0.28, ease: 'power2.out', yoyo: true, repeat: 1 }, 0);
    return fin(tl);
  }

  function stamp(color = 'green') {
    const tl = timeline();
    armTo(tl, -70, { duration: 0.07, ease: 'power2.out' }, 0);
    armTo(tl, 25, { duration: 0.07, ease: 'power3.in' }, 0.07);
    tl.to(P.root, { scaleY: 0.92, duration: 0.05, yoyo: true, repeat: 1 }, 0.12);
    tl.call(() => {
      const p = kit.local(78, 108);
      kit.ringAt(p.x, p.y, color);
    }, null, 0.14);
    armTo(tl, 0, { duration: 0.1 }, 0.17);
    return fin(tl);
  }

  /** Raise the wand, plant it upright beside him, and the pennant unfurls and waves twice. */
  function flag(color = 'green') {
    const tl = timeline();
    armTo(tl, -95, { duration: 0.14 }, 0);
    tl.to(P.armR, { rotation: -65, duration: 0.14, ease: 'power3.in' }, 0.14);
    tl.to(P.sprig, { rotation: 32, duration: 0.14, ease: 'power3.in' }, 0.14);
    tl.to(P.armL, { rotation: -28, duration: 0.2 }, 0.14);
    tl.to(P.root, { scaleY: 0.94, duration: 0.05, yoyo: true, repeat: 1 }, 0.28);
    tl.call(() => {
      const p = kit.local(80, 118);
      kit.ringAt(p.x, p.y, color);
    }, null, 0.28);
    tl.fromTo(P.pennant, { autoAlpha: 0, scale: 0.3, svgOrigin: '79.8 75.55' }, { autoAlpha: 1, scale: 1, duration: 0.2, ease: 'back.out(2)' }, 0.3);
    tl.fromTo(P.pen, { skewY: 0 }, { skewY: 8, duration: 0.16, ease: 'sine.inOut', yoyo: true, repeat: 3 }, 0.42);
    tl.to(P.pen, { skewY: -8, duration: 0.16, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 1.06);
    return fin(tl);
  }

  function pointAt(target: Element | Pt) {
    const t = kit.centerOf(target);
    const tl = timeline(), k = kit.k, zs = kit.zs;
    const face: Face = t.x < kit.st.x - 10 ? 'l' : 'r';
    kit.faceIn(tl, face, 0);
    const sx = kit.st.x + (face === 'l' ? -1 : 1) * (65 - 50) * k * zs, sy = kit.st.y - (kit.h - 80 * k) * zs;
    const dx = Math.abs(t.x - sx), dy = t.y - sy;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const rot = clamp(ang - 76, -170, 10);
    armTo(tl, rot, { duration: 0.22, ease: 'back.out(1.6)' }, 0);
    tl.to(P.root, { rotation: 4, duration: 0.2 }, 0);
    tl.to(P.pupils, { x: 2.5, y: clamp(dy / 200, -1, 1) * 2.5, duration: 0.15 }, 0);
    tl.to(P.look, { rotation: clamp(dy / 60, -1, 1) * 6, duration: 0.2 }, 0);
    tl.to(P.glow, { scale: 1.45, duration: 0.12, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.22);
    return fin(tl);
  }

  function lookAt(target: Element | Pt | null) {
    const tl = timeline();
    if (!target) {
      kit.lookHold = false;
      tl.to(P.pupils, { x: 0, y: 0, duration: 0.15 }, 0);
      tl.to(P.look, { rotation: 0, duration: 0.2 }, 0);
      return fin(tl);
    }
    const t = kit.centerOf(target);
    kit.lookHold = true;
    const me = { x: kit.st.x, y: kit.st.y - kit.h * 0.6 * kit.zs };
    const dx = (t.x - me.x) * kit.flipSign(), dy = t.y - me.y;
    tl.to(P.pupils, { x: clamp(dx / 160, -1, 1) * 2.5, y: clamp(dy / 160, -1, 1) * 2.5, duration: 0.1 }, 0);
    tl.to(P.look, { rotation: clamp(dx / 300, -1, 1) * 6 + clamp(dy / 300, -1, 1) * 3 * (dx >= 0 ? 1 : -1), duration: 0.16 }, 0);
    return fin(tl);
  }

  /** Eyes only, at once (for scroll-driven tracking, which must not pile up tweens). */
  function eyesOn(t: Pt) {
    const me = { x: kit.st.x, y: kit.st.y - kit.h * 0.6 * kit.zs };
    const dx = (t.x - me.x) * kit.flipSign(), dy = t.y - me.y;
    kit.lookHold = true;
    set(P.pupils, { x: clamp(dx / 160, -1, 1) * 2.5, y: clamp(dy / 160, -1, 1) * 2.5 });
    set(P.look, { rotation: clamp(dx / 300, -1, 1) * 6 + clamp(dy / 300, -1, 1) * 3 * (dx >= 0 ? 1 : -1) });
  }

  /** Pops in from a clipped edge of the host, ears first, looks around, blinks. */
  function peek(edge: 'l' | 'r', y: number, o: { x?: number } = {}) {
    const tl = timeline(), w = kit.w, right = edge !== 'l', W = kit.place?.width() ?? innerWidth;
    const x0 = right ? W + w / 2 + 6 : -w / 2 - 6;
    const x1 = o.x ?? (right ? W - w * 0.4 + w / 2 : w * 0.4 - w / 2);
    tl.call(() => kit.put(x0, y, right ? 'l' : 'r'), null, 0);
    kit.st.x = x0;
    kit.st.y = y;
    kit.st.face = right ? 'l' : 'r';
    tl.to(el, { x: x1 - w / 2, duration: 0.45, ease: 'back.out(1.4)' }, 0.02);
    tl.fromTo(P.root, { rotation: -14 }, { rotation: 0, duration: 0.5, ease: 'back.out(2)' }, 0.02);
    tl.to(P.pupils, { x: 2.5, duration: 0.1 }, 0.5);
    tl.to(P.pupils, { x: -2, duration: 0.1 }, 0.75);
    tl.to(P.pupils, { x: 0, duration: 0.1 }, 1.0);
    tl.to(lids, { scaleY: 1, duration: 0.06, yoyo: true, repeat: 1 }, 1.1);
    kit.st.x = x1;
    kit.away = false;
    return fin(tl);
  }

  /** Rise from behind an edge (feet line y): ears, then eyes, clipped at the edge, then out (wow.js). */
  function riseFrom(x: number, y: number, face: Face, o: { hold?: number } = {}) {
    const tl = timeline();
    const full = () => kit.h * kit.curS() + 4;
    tl.call(() => {
      kit.put(x, y, face);
      el.style.clipPath = 'inset(-300% -300% 0 -300%)';
      set(flip, { y: full() });
      set(el, { autoAlpha: 1, scale: 1 });
    }, null, 0);
    kit.st.x = x;
    kit.st.y = y;
    kit.st.face = face;
    kit.away = false;
    tl.to(flip, { y: () => full() * 0.45, duration: 0.4, ease: 'back.out(1.7)' }, 0.03);
    tl.add(flick(), 0.4);
    const out = o.hold ?? 0.6;
    tl.to(flip, { y: -Math.min(18, kit.lift(18)), duration: 0.2, ease: 'power2.out' }, out);
    tl.call(() => (el.style.clipPath = ''), null, out + 0.16);
    tl.to(flip, { y: 0, duration: 0.17, ease: 'power2.in' }, out + 0.2);
    tl.to(P.root, { scaleY: 0.88, duration: 0.05, yoyo: true, repeat: 1 }, out + 0.37);
    return fin(tl);
  }

  function zipOut(tl: Timeline, at: number, dist = ZIP) {
    const d = kit.travel || 1;
    kit.faceIn(tl, d > 0 ? 'r' : 'l', at);
    tl.to(el, { x: `+=${dist * d}`, autoAlpha: 0, duration: 0.25, ease: 'power2.in' }, at);
    runCycle(tl, at, 0.25, { lean: 14 });
    tl.fromTo(P.speed, { opacity: 0 }, { opacity: 0.8, duration: 0.1, yoyo: true, repeat: 1 }, at);
    kit.away = true;
  }
  function zipIn(tl: Timeline, x: number, y: number, face: Face | undefined, at: number, dist = ZIP) {
    const d = kit.travel || 1;
    tl.call(() => {
      kit.put(x - dist * d, y, d > 0 ? 'r' : 'l');
      set(el, { autoAlpha: 0 });
    }, null, at);
    kit.st.face = d > 0 ? 'r' : 'l';
    tl.to(el, { x: x - kit.w / 2, autoAlpha: 1, duration: 0.3, ease: 'power2.out' }, at + 0.01);
    runCycle(tl, at + 0.01, 0.3, { lean: 12 });
    tl.fromTo(P.speed, { opacity: 0 }, { opacity: 0.8, duration: 0.1, yoyo: true, repeat: 1 }, at + 0.01);
    if (face) kit.faceIn(tl, face, at + 0.34);
    kit.st.x = x;
    kit.st.y = y;
    kit.away = false;
  }
  /** Runs out that way (+1 right, -1 left) with speed lines, fading over `dist` px (his clear floor). */
  function zipAway(dir: number, dist = ZIP) {
    const tl = timeline();
    if (kit.away) return fin(tl);
    kit.travel = dir;
    zipOut(tl, 0, dist);
    kit.travel = 0;
    return fin(tl);
  }
  /** Runs in from `dist` px back (the other side) to (x, y), heading `dir`, fading in. */
  function zipTo(x: number, y: number, dir: number, face?: Face, dist = ZIP) {
    const tl = timeline();
    kit.travel = dir;
    zipIn(tl, x, y, face, 0, dist);
    kit.travel = 0;
    return fin(tl);
  }

  function poof(x: number, y: number, face?: Face) {
    const tl = timeline(), wasAway = kit.away;
    if (!wasAway) {
      tl.call(() => {
        const p = kit.local(50, 80);
        kit.motes(p.x, p.y, '#E9DCC6', 6, 30);
      }, null, 0);
      tl.to(el, { scale: 0.2, autoAlpha: 0, duration: 0.15, ease: 'power2.in' }, 0);
    }
    tl.call(() => {
      set(el, { x: x - kit.w / 2, y: y - kit.h });
      if (face) kit.face(face);
      const p = kit.local(50, 80, { x, y, face: face ?? kit.st.face });
      kit.motes(p.x, p.y, '#E9DCC6', 6, 30);
    }, null, wasAway ? 0 : 0.15);
    tl.fromTo(el, { scale: 0.2, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.2, ease: 'back.out(2.4)' }, wasAway ? 0.01 : 0.16);
    kit.st.x = x;
    kit.st.y = y;
    if (face) kit.st.face = face;
    kit.away = false;
    return fin(tl);
  }

  function vanish() {
    const tl = timeline();
    if (kit.away) return fin(tl);
    tl.call(() => {
      const p = kit.local(50, 80);
      kit.motes(p.x, p.y, '#E9DCC6', 6, 30);
    }, null, 0);
    tl.to(el, { scale: 0.2, autoAlpha: 0, duration: 0.15, ease: 'power2.in' }, 0);
    kit.away = true;
    return fin(tl);
  }

  function sleep() {
    const tl = timeline();
    kit.poseIn(tl, 'sleep', 0, 0.6);
    kit.sprigIn(tl, 'dim', 0, 0.6);
    tl.call(() => {
      kit.asleep = true;
      el.classList.add('asleep');
      if (kit.static) {
        set([P.z1, P.z2], { opacity: 0.9 });
        return;
      }
      const z = timeline({ repeat: 4, repeatDelay: 0.6 });   // a few z's, then he sleeps still
      [P.z1, P.z2, P.z3].forEach((zz, i) => {
        z.fromTo(zz, { opacity: 0, y: 6 }, { opacity: 0.9, y: 0, duration: 0.5, ease: 'sine.out' }, i * 0.6);
        z.to(zz, { opacity: 0, y: -6, duration: 0.6 }, i * 0.6 + 1.2);
      });
      kit.setZloop(z);
    }, null, 0.6);
    return fin(tl);
  }

  function wake() {
    const tl = timeline();
    tl.call(() => {
      kit.asleep = false;
      el.classList.remove('asleep');
      kit.setZloop(null);
      to([P.z1, P.z2, P.z3], { opacity: 0, duration: 0.2 });
    }, null, 0);
    kit.poseIn(tl, 'stand', 0, 0.3);
    // stretch, then a yawn made of a squint
    tl.to(P.armL, { rotation: 165, duration: 0.3 }, 0.1);
    armTo(tl, -165, { duration: 0.3 }, 0.1);
    tl.to(P.root, { scaleY: 1.08, duration: 0.3 }, 0.1);
    tl.to(lids, { scaleY: 0.6, duration: 0.2 }, 0.2);
    tl.to(P.mouthO, { opacity: 1, scale: 1.4, duration: 0.25 }, 0.25);
    tl.to(P.mouth, { opacity: 0, duration: 0.1 }, 0.25);
    tl.to(P.mouthO, { opacity: 0, scale: 1, duration: 0.2 }, 0.8);
    tl.to(P.mouth, { opacity: 1, duration: 0.1 }, 0.85);
    tl.to(P.armL, { rotation: 0, duration: 0.25 }, 0.8);
    armTo(tl, 0, { duration: 0.25 }, 0.8);
    tl.to(P.root, { scaleY: 1, duration: 0.25 }, 0.8);
    tl.to(lids, { scaleY: 0.12, duration: 0.15 }, 0.95);
    kit.sprigIn(tl, kit.st.sprig === 'dim' ? 'green' : kit.st.sprig, 0.6, 0.3);
    return fin(tl);
  }

  function picto(name: 'heart' | 'bang' | 'talk', dur = 0.9) {
    const part = P[name], tl = timeline();
    tl.fromTo(part, { opacity: 0, y: 6, scale: 0.6, svgOrigin: '50 10' }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: 'back.out(2)' }, 0);
    tl.to(part, { opacity: 0, y: -8, duration: 0.3 }, dur);
    return fin(tl);
  }
  function ears(rot: number, tip = 0, dur = 0.2) {
    const tl = timeline();
    tl.to(P.earL, { rotation: -rot, duration: dur }, 0);
    tl.to(P.earR, { rotation: rot, duration: dur }, 0);
    tl.to(P.tipL, { rotation: -tip, duration: dur }, 0);
    tl.to(P.tipR, { rotation: tip, duration: dur }, 0);
    return fin(tl);
  }
  function flick() {
    const tl = timeline();
    tl.to(P.tipL, { rotation: -26, duration: 0.07, yoyo: true, repeat: 1 }, 0);
    tl.to(P.tipR, { rotation: 26, duration: 0.07, yoyo: true, repeat: 1 }, 0.05);
    return fin(tl);
  }
  function faceTo(f: Face) {
    const tl = timeline();
    kit.faceIn(tl, f, 0);
    return fin(tl);
  }
  function happy(on: boolean) {
    const tl = timeline();
    tl.to(lows, { scaleY: on ? 0.7 : 0, duration: 0.15 }, 0);
    tl.to(lids, { scaleY: on ? 0 : 0.12, duration: 0.15 }, 0);
    return fin(tl);
  }
  function wide(on: boolean) {
    return fin(timeline().to([P.pupilL, P.pupilR], { scale: on ? 1.25 : 1, duration: 0.15 }, 0));
  }
  function type(dur = 0.6) {
    const tl = timeline();
    tl.to(P.armL, { rotation: -30, duration: 0.1 }, 0);
    tl.to(P.armR, { rotation: 30, duration: 0.1 }, 0);
    tl.to(P.armL, { rotation: -42, duration: 0.06, yoyo: true, repeat: Math.round(dur / 0.12) }, 0.1);
    tl.to(P.armR, { rotation: 42, duration: 0.06, yoyo: true, repeat: Math.round(dur / 0.12) }, 0.16);
    tl.to([P.armL, P.armR], { rotation: 0, duration: 0.12 }, dur + 0.2);
    return fin(tl);
  }
  /** A head shake: no. */
  function shake() {
    const tl = timeline();
    tl.to(P.head, { rotation: -9, duration: 0.09 }, 0);
    tl.to(P.head, { rotation: 9, duration: 0.14, ease: 'sine.inOut', yoyo: true, repeat: 2 }, 0.09);
    tl.to(P.head, { rotation: 0, duration: 0.12 }, 0.53);
    return fin(tl);
  }
  /** A small paw tap (left arm), for the phone's touch rings and the seats. */
  function tap() {
    const tl = timeline();
    tl.to(P.armL, { rotation: -60, duration: 0.08, ease: 'power2.out' }, 0);
    tl.to(P.armL, { rotation: -30, duration: 0.08, ease: 'power2.in' }, 0.08);
    tl.to(P.armL, { rotation: 0, duration: 0.15 }, 0.2);
    return fin(tl);
  }
  /** A nod. */
  function nod() {
    const tl = timeline();
    tl.to(P.head, { y: 2.5, duration: 0.08, yoyo: true, repeat: 1 }, 0);
    return fin(tl);
  }

  return {
    runCycle, runTo, running, settle, jumpTo, hop, skid, squash, wave, cheer, twirl, stamp, flag, pointAt, lookAt, eyesOn, peek, riseFrom,
    zipAway, zipTo, poof, vanish, sleep, wake, picto, ears, flick, faceTo, happy, wide, type, shake, tap, nod,
    glowTo: (s: number, dur = 0.2) => fin(timeline().to(P.glow, { scale: s, duration: dur }, 0)),
    flagDown: () => {
      set(P.pennant, { autoAlpha: 0 });
      return kit;
    },
    hasClip: () => !!el.style.clipPath,
    y: () => getProperty(flip, 'y'),
  };
}
