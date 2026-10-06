import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { ARC } from '../src/shared/amphitheater.js';
import { BOARDS, TV } from '../src/shared/layout.js';
import { FRAMING, seatedPitch } from '../src/client/features/amphitheater/framing.js';
import { ambientSafe, hueOf } from '../src/client/features/space/logic.js';
import { Messages, Ticks } from '../src/client/core/registry.js';
import {
  BEAT,
  CROWN_TOP,
  RELAY,
  RELAY_ARRIVE,
  RELAY_COLORS,
  RELAY_JUMP_MS,
  anchor,
  beatAllowed,
  deckRing,
  layoutNodes,
  ledgerOf,
  lightLevel,
  outlineBox,
  outlinePoints,
  project,
  relayJumpAt,
  ringPoint,
  ringPose,
  seatedEye,
  spinsAt,
  spirePose,
  apply,
  armAngle,
  threadsOf,
  tierLook,
  toShip,
  wanderAt,
  type View,
} from '../src/client/features/relay/logic.js';

// The Relay Beacon (features/relay): where it stands from the captain's chair, that it keeps clear of
// the arc's boards, what each tier draws, its palette, its outline (never a ring crossed by a slanted
// bar), its beats, and that switching it off takes every object and listener away.

const DEG = Math.PI / 180;
const eye = seatedEye();
const CHAIR: View = { eye, pitch: seatedPitch(eye.y, eye.z, ARC), fov: FRAMING.fov, aspect: 1440 / 900 };

test("it stands off the starboard bow, about 8 degrees tall and as wide, from the captain's chair", () => {
  const a = anchor();
  const dx = a.x - eye.x;
  const dz = a.z - eye.z;
  const bearing = Math.atan2(dx, -dz) / DEG;
  assert.ok(Math.abs(bearing - RELAY.bearing) < 1e-6 && bearing > 0, `bearing ${bearing.toFixed(1)} to starboard`);
  assert.ok(Math.abs(Math.hypot(dx, dz) - RELAY.range) < 1e-6, 'its range');
  const base = Math.atan2(a.y - eye.y, Math.hypot(dx, dz)) / DEG;
  const crown = Math.atan2(a.y + CROWN_TOP - eye.y, Math.hypot(dx, dz)) / DEG;
  assert.ok(base > 13 && base < 15, `its base ${base.toFixed(1)} degrees up`);
  assert.ok(crown - base > 7 && crown - base < 10, `${(crown - base).toFixed(1)} degrees tall`);
  // Across its rings: the widest ring's diameter.
  const wide = (2 * Math.atan(RELAY.rings[2].r / RELAY.range)) / DEG;
  assert.ok(wide > 7 && wide < 10, `${wide.toFixed(1)} degrees across`);
});

/** A board's rectangle on screen from the chair (NDC). */
function boardRect(p: { x: number; y: number; z: number; rotY: number; width: number; height: number }) {
  const pts = [-1, 1].flatMap((s) => [-1, 1].map((t) => project(CHAIR, { x: p.x + s * Math.cos(p.rotY) * (p.width / 2), y: p.y + (t * p.height) / 2, z: p.z - s * Math.sin(p.rotY) * (p.width / 2) })!));
  return { x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) };
}

test("from the chair at 1440x900 its outline keeps clear of every board's face and 0.12 round it, whole in the frame under the top bar", () => {
  const margin = 0.12;
  for (let t = 0; t < 320; t += 16) {
    const box = outlineBox(CHAIR, spinsAt(t), wanderAt(t));
    for (const [id, p] of Object.entries({ attention: TV, ...BOARDS })) {
      const r = boardRect(p);
      const clear = box.x0 > r.x1 + margin || box.x1 < r.x0 - margin || box.y0 > r.y1 + margin || box.y1 < r.y0 - margin;
      assert.ok(clear, `at ${t} s its box ${JSON.stringify(box)} is within ${margin} of ${id} ${JSON.stringify(r)}`);
    }
    // In the frame, and under the top bar (44 px of 900).
    assert.ok(box.x0 > -1 && box.x1 < 1 && box.y0 > -1, 'in the frame');
    assert.ok(box.y1 < 1 - (2 * 44) / 900, `its crown at ${box.y1.toFixed(3)} clears the top bar`);
  }
});

test('each tier draws three, three and two, Low without threads or glow', () => {
  assert.deepEqual(
    (['high', 'medium', 'low'] as const).map((t) => tierLook(t).draws),
    [3, 3, 2],
  );
  assert.equal(tierLook('low').threads, false);
  assert.equal(tierLook('low').glow, 0);
  assert.equal(tierLook('medium').glow, 0.5);
  assert.equal(tierLook('medium').brace, RELAY.spire.brace * 2, 'bracing every 22 m at Medium');
  assert.equal(tierLook('low').streak, false, 'the jump is a fade at Low');
});

test('its palette: no saturated yellow, no violet, no state hue, the crown a warm white under 0.15 saturation', () => {
  const sat = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
    const max = Math.max(r, g, b);
    return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
  };
  for (const [name, hex] of Object.entries(RELAY_COLORS)) {
    const { hue } = hueOf(hex);
    assert.ok(!(hue >= 40 && hue <= 60 && sat(hex) > 0.3), `${name} ${hex} reads as a brand's yellow`);
    assert.ok(ambientSafe(hex), `${name} ${hex} is in a reserved (state or proof) hue`);
  }
  assert.ok(sat(RELAY_COLORS.crown) < 0.15, 'the crown is a warm white');
});

/** Where a segment of the beacon's frame lands on a 1440x900 screen from `v` (pixels, y down). */
function px(v: View, p: { x: number; y: number; z: number }) {
  const q = project(v, toShip(p));
  return q && { x: 720 + q.x * 720, y: 450 - q.y * 450 };
}

/** Where two screen segments cross, or null. */
function cross(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * r.x, y: a.y + t * r.y } : null;
}

test("no straight member crosses a lone ring's outline at a slant, from the chair, turned to starboard and from the deck", () => {
  const toward = (bearing: number, up: number) => ({ yaw: bearing * DEG, pitch: up * DEG });
  const views: View[] = [CHAIR, { ...CHAIR, ...toward(30, 13) }, { eye: { x: 7.5, y: 2.4, z: -1.5 }, fov: 55, aspect: 1440 / 900, ...toward(22, 22) }];
  for (const v of views) {
    for (let t = 0; t < 320; t += 20) {
      const spins = spinsAt(t);
      const wander = wanderAt(t);
      const rings = [0, 1, 2].map((i) => Array.from({ length: 97 }, (_, k) => px(v, ringPoint(i, (k / 96) * Math.PI * 2, spins[i + 1], i === 2 ? wander : 0))!));
      // The members: the spire's axis from foot to crown, and the four docking arms.
      const sp = spirePose(spins[0]);
      const members = [[apply(sp, { x: 0, y: 0, z: 0 }), apply(sp, { x: 0, y: CROWN_TOP, z: 0 })]];
      for (let j = 0; j < RELAY.collar.arms; j++) {
        const a = armAngle(j);
        const r = RELAY.collar.radius + RELAY.collar.arm;
        members.push([{ x: RELAY.collar.radius * Math.cos(a), y: 0, z: RELAY.collar.radius * Math.sin(a) }, { x: r * Math.cos(a), y: 0, z: r * Math.sin(a) }]);
      }
      for (const [m0, m1] of members) {
        const a = px(v, m0)!;
        const b = px(v, m1)!;
        const fromVertical = Math.abs(Math.atan2(b.x - a.x, b.y - a.y) / DEG) % 180;
        const slant = Math.min(fromVertical, 180 - fromVertical);
        if (slant < 15 || slant > 75) continue;
        rings.forEach((ring, i) => {
          for (let k = 0; k < ring.length - 1; k++) {
            const hit = cross(a, b, ring[k], ring[k + 1]);
            if (!hit) continue;
            const other = rings.some((o, j) => j !== i && o.some((p) => Math.hypot(p.x - hit.x, p.y - hit.y) < 10));
            assert.ok(other, `a member at ${slant.toFixed(0)} degrees crosses ring ${i + 1} alone at (${hit.x.toFixed(0)}, ${hit.y.toFixed(0)})`);
          }
        });
      }
    }
  }
});

test('from the chair each ring is an open ellipse, never edge on (a ring seen edge on reads as a slanted bar)', () => {
  const a = anchor();
  const c = { x: a.x - eye.x, y: a.y + RELAY.ringAt - eye.y, z: a.z - eye.z };
  const len = Math.hypot(c.x, c.y, c.z);
  for (let i = 0; i < 3; i++) {
    for (const w of i === 2 ? [-5, 0, 5] : [0]) {
      const m = ringPose(i, 0.7, w).m;
      const open = Math.abs((m[1] * c.x + m[4] * c.y + m[7] * c.z) / len);
      assert.ok(open > 0.35, `ring ${i + 1} (wander ${w}) is ${open.toFixed(2)} open`);
    }
  }
});

test('the spire stands upright and the three rings are always drawn together', () => {
  const sp = spirePose(1.3);
  const top = apply(sp, { x: 0, y: CROWN_TOP, z: 0 });
  assert.ok(Math.abs(top.x) < 1e-9 && Math.abs(top.z) < 1e-9, 'the spire turns round its own vertical axis');
  assert.equal(RELAY.rings.length, 3);
  // The outline has all three rings' points at any moment.
  assert.equal(outlinePoints(spinsAt(42)).length, 21 * 3 + RELAY.collar.arms + 3 * 48);
});

test('nodes: one per unit at work across the fleet, on its deck\'s ring, at most 24; threads join each deck\'s group', () => {
  assert.deepEqual(layoutNodes([]), [], 'nobody at work, bare rings');
  assert.deepEqual([0, 1, 2, 3, 4].map(deckRing), [0, 1, 2, 0, 1]);
  const decks = [
    { id: 'a', order: 0, units: ['a1', 'a2', 'a3'] },
    { id: 'b', order: 1, units: ['b1'] },
    { id: 'c', order: 2, units: Array.from({ length: 30 }, (_, i) => `c${i}`) },
  ];
  const nodes = layoutNodes(decks);
  assert.equal(nodes.length, RELAY.nodes);
  assert.deepEqual(nodes.slice(0, 4).map((n) => [n.id, n.ring]), [['a1', 0], ['a2', 0], ['a3', 0], ['b1', 1]]);
  const threads = threadsOf(nodes.slice(0, 4));
  assert.equal(threads.filter((t) => t.b === 'spire').length, 2, 'one bright thread to the spire per deck');
  assert.equal(threads.filter((t) => t.b !== 'spire').length, 2, 'a faint thread between neighbours');
});

test('beats: dropped (not queued) while a unit needs you, the lights giving way as the rest of space', () => {
  assert.equal(beatAllowed(true), false);
  assert.equal(beatAllowed(false), true);
  assert.equal(lightLevel({ attention: false, callAgeMs: Infinity, silent: false }), 1);
  assert.equal(lightLevel({ attention: true, callAgeMs: 500, silent: false }), 0.6, 'ducked to 60% after a new call');
  assert.equal(lightLevel({ attention: true, callAgeMs: 5000, silent: false }), 0.8, 'then held at 80%');
  assert.equal(lightLevel({ attention: false, callAgeMs: Infinity, silent: true }), 0.6, 'Silent running at 60%');
  assert.deepEqual(ledgerOf(0), { lit: 0, level: 0.7, laps: 0 });
  assert.deepEqual(ledgerOf(33), { lit: 1, level: 0.4, laps: 1 }, 'a second lap at 40%');
});

test('the jump: streaked away before the tunnel, back 1.5 s after the ship; with motion off only a fade', () => {
  assert.ok(relayJumpAt(500, false).stretch > 8.9, 'nine times as long at 0.5 s');
  assert.ok(relayJumpAt(1100, false).show < 0.01, 'gone before the tunnel');
  assert.equal(relayJumpAt(RELAY_ARRIVE - 10, false).show, 0);
  assert.ok(relayJumpAt(RELAY_ARRIVE + 60, false).flash > 0.5, 'a point flash as it drops in');
  assert.ok(relayJumpAt(RELAY_ARRIVE + 1200, false).stretch < 1.01, 'back to 1x over 1.1 s');
  assert.equal(relayJumpAt(RELAY_JUMP_MS, false).spin, 1);
  for (let ms = 0; ms < RELAY_JUMP_MS; ms += 50) {
    const j = relayJumpAt(ms, true);
    assert.equal(j.stretch, 1, `no streak at ${ms} ms under reduced motion`);
    assert.equal(j.slide, 0);
    assert.equal(j.flash, 0);
  }
  assert.equal(BEAT.packetThread + BEAT.packetClimb, 1600, 'the merge packet takes 1.6 s');
});

// ---- The installed beacon, on a stand-in context --------------------------------------------------

(globalThis as { window?: unknown }).window ??= {};

async function rig() {
  const { installRelay } = await import('../src/client/features/relay/index.js');
  const scene = new THREE.Scene();
  const ticks = new Ticks();
  const inner = new Messages<{ t: string }>(() => {});
  let live = 0;
  const messages = {
    on: (t: string, fn: (m: never) => void) => {
      live++;
      const off = inner.on(t, fn as never);
      return () => {
        live--;
        off();
      };
    },
    dispatch: (m: { t: string }) => inner.dispatch(m),
  };
  const world = { on: true, attention: false, motion: 1, phase: 'idle' as string };
  const ctx = {
    scene,
    ticks,
    messages,
    camera: new THREE.PerspectiveCamera(55, 1.6, 0.1, 120),
    renderer: { getPixelRatio: () => 1, domElement: { height: 900 } },
    reduceMotion: { ship: 'full', matches: false },
  };
  const parts = {
    space: { phase: () => world.phase },
    quality: { tier: () => 'high' },
    giveWay: { wants: () => world.on, motion: () => world.motion, attention: () => world.attention, callAge: () => Infinity, level: () => 'full', frozen: () => false },
    lights: { mode: () => 'night' },
    boardFaces: { faces: () => [] },
  };
  const relay = installRelay(ctx as never, parts as never);
  let t = 0;
  const run = (frames: number) => {
    for (let i = 0; i < frames; i++) {
      t += 1 / 60;
      ticks.run({ delta: 1 / 60, dt: 1 / 60, t, now: t * 1000 });
    }
  };
  return { relay, scene, messages, world, run, live: () => live };
}

test('switched off under Life it takes every object, draw and listener away, and comes back whole', async () => {
  const { relay, scene, world, run, live } = await rig();
  run(2);
  assert.equal(relay.state().mounted, true);
  assert.ok(scene.getObjectByName('relay'), 'in the scene');
  assert.ok(live() > 0 && relay.state().listeners > 0);
  world.on = false;
  run(2);
  assert.equal(relay.state().mounted, false);
  assert.equal(scene.getObjectByName('relay'), undefined, 'no object left');
  assert.equal(live(), 0, 'no message listener left');
  assert.equal(relay.state().listeners, 0, 'no tick or store listener left');
  assert.equal(relay.state().draws, 0);
  world.on = true;
  run(2);
  assert.ok(scene.getObjectByName('relay'), 'back');
});

test('at rest nothing changes without an event, and a merge while a unit needs you is dropped', async () => {
  const { relay, messages, world, run } = await rig();
  relay.seed([{ id: 'deck', order: 0, units: ['u1', 'u2', 'u3'] }]);
  run(120);
  const before = relay.state();
  run(600);
  const after = relay.state();
  assert.deepEqual([after.nodes, after.ledger, after.packet], [before.nodes, before.ledger, before.packet], 'ten idle seconds change nothing but the turn and the breath');
  assert.equal(after.nodes, 3);
  world.attention = true;
  messages.dispatch({ t: 'landed', kind: 'merged', pr: 7 } as never);
  run(2);
  assert.equal(relay.state().packet, false, 'dropped, not queued');
  messages.dispatch({ t: 'bounty.paid' } as never);
  run(2);
  assert.equal(relay.state().ledger, 1, 'the ledger still counts');
  world.attention = false;
  run(600);
  assert.equal(relay.state().packet, false, 'nothing played later');
  messages.dispatch({ t: 'landed', kind: 'merged', pr: 7 } as never);
  run(2);
  assert.equal(relay.state().packet, true, 'a merge with nobody waiting plays');
});

test('the beacon carries no text, no mark and no texture, and nothing in it is named for a brand', () => {
  const dir = path.join(import.meta.dirname, '../src/client/features/relay');
  for (const f of readdirSync(dir)) {
    const src = readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/TextureLoader|CanvasTexture|ImageLoader|\.png|\.svg|fillText/.test(src), `${f} loads or draws an image or text`);
    assert.ok(!/stellar|lumen/i.test(src), `${f} names a brand`);
  }
});
