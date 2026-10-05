/**
 * The crew's body language: each unit carries itself for the state it is really in, so the bridge
 * reads as a crew at work and not a row of statues. At work a unit leans in over its console and now
 * and then glances across at the next screen; the moment it finishes (its work waiting for review, or
 * merged) it stands up off its console and stretches, once; stuck, it slumps lower and sighs, with a
 * slow red breath of light over its desk; needing the captain, it turns toward the conn with a hand up.
 *
 * It is laid over each unit's own pose after everything else has posed it (the 'aim' phase, after the
 * celebrations' gestures) and taken off again first thing next frame (the 'pre' phase, before them),
 * so a unit's state, typing, glide and gestures are never disturbed. Every value eases in and out.
 *
 * It gives way: while anyone waits on the captain the glances stop. Life at Calm keeps only the
 * state's own posture (no glances, no stretch); Silent running, Ship motion Off and reduced motion
 * still it all (the desk glow holds steady). Nothing runs in a hidden tab (no frames). One draw for
 * each stuck unit's desk glow, while it is stuck.
 */
import * as THREE from 'three';
import { CONN } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { GLYPH_HUE, type GlyphKind } from '../../world/glyphs';
import { glowTexture } from '../space/flybys';
import { debugHandle } from '../giveway';
import { POSTURE, deskGlow, easePose, finished, glanceAt, poseFor, postureLevel, type Pose } from './logic';

interface Unit {
  cur: Pose;
  kind: GlyphKind | undefined;
  doneAt: number;
  glanceAt: number;
  nextGlance: number;
  side: number;
  glow: THREE.Sprite | null;
}

interface Laid {
  figure: THREE.Object3D;
  arms: readonly [THREE.Object3D, THREE.Object3D];
  p: Pose;
}

const q = new THREE.Quaternion();
const e = new THREE.Euler();
const at = new THREE.Vector3();
const fwd = new THREE.Vector3();

export interface Posture {
  /** Each unit's posture now, by worker id (the shots and the console). */
  state(): Record<string, { kind: GlyphKind | undefined; pose: Pose }>;
  /** Plays a unit's stretch now, as if it just finished (the shots). */
  stretch(id: string): void;
}

export function installPosture(ctx: Ctx, parts: Pick<Parts, 'views' | 'giveWay'>): Posture {
  const units = new Map<string, Unit>();
  const laid: Laid[] = [];
  let clock = 0;
  let rand = 0x9e3779b9;
  const next = () => {
    rand = (Math.imul(rand ^ (rand >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return rand / 4294967296;
  };
  const glowTex = glowTexture();
  const stuckHue = new THREE.Color(GLYPH_HUE.stuck);

  function makeGlow(): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: stuckHue, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
    s.scale.set(1.3, 0.8, 1);
    s.name = 'posture-desk-glow';
    s.raycast = () => {};
    ctx.scene.add(s);
    return s;
  }

  // Off before anything poses the units again, and before the gestures come off (they were laid first).
  ctx.ticks.add('pre', () => {
    for (const l of laid) {
      l.figure.rotation.x -= l.p.lean;
      l.figure.rotation.y -= l.p.turn;
      l.figure.position.y -= l.p.rise;
      l.arms[0].rotation.x -= l.p.armL;
      l.arms[1].rotation.x -= l.p.armR;
    }
    laid.length = 0;
  });

  ctx.ticks.add('aim', ({ dt, t }) => {
    clock += dt * 1000;
    const frozen = parts.giveWay.frozen();
    const level = postureLevel(frozen, ctx.settings.life);
    const quiet = parts.giveWay.attention();
    const views = parts.views.workerViews;
    for (const [id, v] of views) {
      let u = units.get(id);
      if (!u) units.set(id, (u = { cur: { lean: 0, turn: 0, rise: 0, armL: 0, armR: 0 }, kind: undefined, doneAt: -Infinity, glanceAt: -Infinity, nextGlance: clock + 2000 + next() * 8000, side: 1, glow: null }));
      const kind = v.model.showing;
      if (u.kind !== undefined && finished(u.kind, kind)) u.doneAt = clock;
      u.kind = kind;
      const figure = v.model.figure;
      // A glance across at the next screen now and then, while it works and nobody waits.
      if (kind === 'working' && level === 'full' && !quiet && clock >= u.nextGlance) {
        u.glanceAt = clock;
        u.side = next() < 0.5 ? -1 : 1;
        const [lo, hi] = POSTURE.glance.every;
        u.nextGlance = clock + (lo + (hi - lo) * next()) * 1000;
      }
      let toConn = 0;
      if (kind === 'needs-you') {
        figure.parent!.getWorldQuaternion(q);
        const facing = e.setFromQuaternion(q, 'YXZ').y;
        v.model.where(at);
        const want = Math.atan2(CONN.x - at.x, CONN.z - at.z);
        toConn = Math.atan2(Math.sin(want - facing), Math.cos(want - facing));
      }
      const to = poseFor({ kind, level, t, toConn, glance: glanceAt(clock - u.glanceAt), glanceSide: u.side, sinceDone: clock - u.doneAt, quiet });
      if (frozen) Object.assign(u.cur, to);
      else easePose(u.cur, to, dt);
      const p = { ...u.cur };
      figure.rotation.x += p.lean;
      figure.rotation.y += p.turn;
      figure.position.y += p.rise;
      const arms = v.model.arms;
      arms[0].rotation.x += p.armL;
      arms[1].rotation.x += p.armR;
      laid.push({ figure, arms, p });

      // Stuck: a slow red breath of light over its desk, in front of it.
      if (kind === 'stuck') {
        u.glow ??= makeGlow();
        v.model.where(at);
        figure.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        u.glow.position.set(at.x + fwd.x * 0.62, at.y + 1.02, at.z + fwd.z * 0.62);
        u.glow.material.opacity = 0.32 * deskGlow(t, frozen);
        u.glow.visible = true;
      } else if (u.glow) u.glow.visible = false;
    }
    for (const [id, u] of units) {
      if (views.has(id)) continue;
      if (u.glow) {
        ctx.scene.remove(u.glow);
        u.glow.material.dispose();
      }
      units.delete(id);
    }
  });

  const posture: Posture = {
    state: () => Object.fromEntries([...units].map(([id, u]) => [id, { kind: u.kind, pose: { ...u.cur } }])),
    stretch: (id) => {
      const u = units.get(id);
      if (u) u.doneAt = clock;
    },
  };
  debugHandle('posture', posture);
  return posture;
}
