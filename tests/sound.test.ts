// The deck's sound (src/client/sound, features/soundscape): the mix each group plays at, and what the
// deck hears from you and from Bolt each frame. The recipes themselves are Web Audio and are heard in
// the design shots (design/shoot-sound.mjs); everything that decides when and how loud is tested here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTENTION_KEEPS, LIFE_KEEPS, busGains, curve, masterGain, type MixScene } from '../src/client/sound/mix.js';
import { MIX_DEFAULTS } from '../src/client/state/persist.js';
import { AIR_MIN, CHATTER, DroidVoice, Footfalls, STEP_MIN, surfaceAt, type Body, type DroidNow } from '../src/client/features/soundscape/logic.js';
import { LOUNGE } from '../src/shared/lounge.js';
import { JUMP_SOUNDS } from '../src/client/sound/jump.js';
import { PAID_CHORD } from '../src/client/features/bounties/sound.js';
import { MIX_ROWS } from '../src/client/ui/sound-settings.js';
import { BROWN_RMS, env, makeNoise, matchedOffsets } from '../src/client/sound/dsp.js';
import { FEET, HOLD_GAIN, STEP_JITTER_DB, STEP_LEVEL } from '../src/client/features/soundscape/sfx.js';

/** A seeded random source, so the noise is the same every run. */
function seeded(seed = 7) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dB = (x: number) => 20 * Math.log10(x);
const rmsOf = (d: Float32Array, from: number, n: number) => {
  let s = 0;
  for (let i = from; i < from + n; i++) s += d[i] * d[i];
  return Math.sqrt(s / n);
};

const calm: MixScene = { hidden: false, life: 'full', attention: false };

test('sound is on by default, each group at its own level, alerts the loudest', () => {
  const g = busGains(MIX_DEFAULTS, calm);
  assert.ok(masterGain(0.7, false) > 0, 'on by default');
  assert.equal(masterGain(0.7, true), 0, 'muted is silent');
  for (const k of ['ui', 'ship', 'ambience'] as const) assert.ok(g.alerts > g[k], `alerts over ${k}`);
  assert.ok(g.ambience < g.ship, 'the ambience sits under the effects');
  // Squared, so the slider feels even to the ear, and clamped.
  assert.equal(curve(0.5), 0.25);
  assert.equal(curve(2), 1);
  assert.equal(curve(Number.NaN), 0);
});

test('a hidden tab hears the alerts only, at full level', () => {
  const g = busGains(MIX_DEFAULTS, { ...calm, hidden: true });
  assert.deepEqual([g.ui, g.ship, g.ambience], [0, 0, 0]);
  assert.equal(g.alerts, busGains(MIX_DEFAULTS, calm).alerts);
});

test('Calm and Silent running quieten the ambience; a unit that needs you sinks it, never the alerts', () => {
  const full = busGains(MIX_DEFAULTS, calm);
  const c = busGains(MIX_DEFAULTS, { ...calm, life: 'calm' });
  const s = busGains(MIX_DEFAULTS, { ...calm, life: 'silent' });
  assert.ok(full.ambience > c.ambience && c.ambience > s.ambience && s.ambience > 0);
  assert.ok(s.ship < full.ship, 'Silent running steps the effects back too');
  assert.equal(s.alerts, full.alerts);
  assert.equal(LIFE_KEEPS.full.ambience, 1);
  const calls = busGains(MIX_DEFAULTS, { ...calm, attention: true });
  assert.ok(Math.abs(calls.ambience - full.ambience * ATTENTION_KEEPS.ambience) < 1e-9);
  assert.ok(calls.ship < full.ship);
  assert.equal(calls.alerts, full.alerts, 'the alert itself is never ducked');
  // Your own slider is the only thing that moves the alerts.
  assert.equal(busGains({ ...MIX_DEFAULTS, alerts: 0 }, calm).alerts, 0);
});

/** You on your feet at (x, z), walked `phase` along. */
const body = (o: Partial<Body> = {}): Body => ({ walkPhase: 0, moving: false, grounded: true, x: 0, y: 0, z: 0, vy: 0, seat: null, rig: false, ...o });

test('a step each time a foot comes down, only when you covered ground', () => {
  const f = new Footfalls();
  assert.deepEqual(f.update(body(), 0.016), []);
  // Half a walk cycle and 1.3 m on: one step on the deck's plates, a walk's.
  let heard = f.update(body({ walkPhase: Math.PI + 0.01, moving: true, z: -1.3 }), 0.29);
  assert.deepEqual(heard, [{ kind: 'step', surface: 'plate', run: false }]);
  // Walking on the spot against a wall: the phase turns but you go nowhere.
  heard = f.update(body({ walkPhase: 2 * Math.PI + 0.01, moving: true, z: -1.3 + STEP_MIN / 2 }), 0.29);
  assert.deepEqual(heard, []);
  // A run's stride is longer.
  heard = f.update(body({ walkPhase: 3 * Math.PI + 0.01, moving: true, z: -3.1 }), 0.22);
  assert.deepEqual(heard, [{ kind: 'step', surface: 'plate', run: true }]);
  // Down a riser: a stair.
  heard = f.update(body({ walkPhase: 4 * Math.PI + 0.01, moving: true, z: -4.4, y: -0.3 }), 0.29);
  assert.equal(heard[0]?.kind === 'step' && heard[0].surface, 'stair');
});

test('the lounge is grating, the deck plates, a riser a stair', () => {
  const mid = { x: (LOUNGE.x0 + LOUNGE.x1) / 2, z: (LOUNGE.z0 + LOUNGE.z1) / 2 };
  assert.equal(surfaceAt(mid.x, LOUNGE.top, mid.z, LOUNGE.top), 'grate');
  assert.equal(surfaceAt(mid.x, 0, mid.z, 0), 'plate', 'under the balcony is the deck');
  assert.equal(surfaceAt(0, 0.6, 9, 0.3), 'stair');
  assert.equal(surfaceAt(0, 0.6, 9, 0.6), 'plate');
});

test('a jump pushes off and lands as hard as you fell; a seat sits and stands; a climb is the ladder\'s own', () => {
  const f = new Footfalls();
  f.update(body(), 0.016);
  assert.deepEqual(f.update(body({ grounded: false, vy: 6, y: 0.1 }), 0.016), [{ kind: 'leap' }]);
  for (let t = 0; t < 0.6; t += 0.05) f.update(body({ grounded: false, vy: 6 - 18 * t, y: 1 }), 0.05);
  const [landed] = f.update(body(), 0.016);
  assert.ok(landed.kind === 'land' && landed.hard > 0.3 && landed.hard < 1, 'a jump on the level is a firm landing, not the hardest');
  // A stair's drop is too short a flight to be a landing.
  f.update(body({ grounded: false, vy: -1 }), AIR_MIN / 3);
  assert.deepEqual(f.update(body(), 0.016), []);
  assert.deepEqual(f.update(body({ seat: 'conn' }), 0.016), [{ kind: 'sit', seat: 'conn' }]);
  assert.deepEqual(f.update(body({ seat: 'conn', walkPhase: 9, moving: true, z: 3 }), 0.016), [], 'nothing while sat');
  assert.deepEqual(f.update(body(), 0.016), [{ kind: 'stand' }]);
  // On the ladder the climb says its own sounds (rungs, the gate): no steps.
  assert.deepEqual(f.update(body({ rig: true, walkPhase: 20, moving: true, z: -9 }), 0.016), []);
});

test('Bolt beeps when what it does changes, and chatters only now and then with nobody waiting', () => {
  const v = new DroidVoice(() => 0);
  const at = (o: Partial<DroidNow>): DroidNow => ({ mode: 'idle', carrying: false, ...o });
  assert.equal(v.update(at({ mode: 'docked' }), 0.016, true), null);
  assert.equal(v.update(at({ mode: 'idle' }), 0.016, true), 'wake');
  assert.equal(v.update(at({ mode: 'errand', carrying: true }), 0.016, true), 'pickup');
  assert.equal(v.update(at({ mode: 'errand' }), 0.016, true), 'handoff');
  assert.equal(v.update(at({ mode: 'hold' }), 0.016, true), 'hold');
  assert.equal(v.update(at({ mode: 'docked' }), 0.016, true), 'dock');
  // Chatter: not before CHATTER.min of rounds, and never while units need you (chatty false).
  v.update(at({ mode: 'idle' }), 0.016, true);
  assert.equal(v.update(at({}), CHATTER.min - 1, true), null);
  assert.equal(v.update(at({}), 2, true), 'chatter');
  assert.equal(v.update(at({}), CHATTER.max * 2, false), null);
});

test('the jump has four parts and the surge, the payout ends on a soft chord, the mixer has every group', () => {
  assert.deepEqual(Object.keys(JUMP_SOUNDS).sort(), ['arrival', 'punch', 'release', 'spool', 'surge']);
  // The punch is the deepest thing the ship plays; the surge is a rush with a pitch under it, loud
  // enough to hear over the ambience (it was -41 dBFS; design/sound-levels.mjs measures it now).
  assert.ok(JUMP_SOUNDS.punch.sine[1] < JUMP_SOUNDS.release.sine[1] + 10);
  assert.ok(JUMP_SOUNDS.surge.sine[0] > 0 && JUMP_SOUNDS.surge.sine[1] > JUMP_SOUNDS.surge.sine[0], 'the surge rises in pitch');
  assert.ok(JUMP_SOUNDS.surge.gain >= 0.15);
  assert.deepEqual([...PAID_CHORD], [1047, 1319, 1568]);
  assert.deepEqual(MIX_ROWS.map(([g]) => g).sort(), Object.keys(MIX_DEFAULTS).sort());
});

test('an envelope is silent from the moment it is made, so a source starting between samples never clicks', () => {
  const calls: [string, number, number][] = [];
  const param = {
    value: 1,
    setValueAtTime(v: number, t: number) {
      calls.push(['set', v, t]);
    },
    exponentialRampToValueAtTime(v: number, t: number) {
      calls.push(['ramp', v, t]);
    },
  };
  const ctx = { currentTime: 3.2, createGain: () => ({ gain: param }) } as unknown as BaseAudioContext;
  env(ctx, 3.204, 0.3, 0.003, 0.08);
  // A GainNode starts at 1: one full-level sample got through before t0, the -11 dBFS tick on a walk.
  assert.equal(param.value, 0);
  assert.deepEqual(calls[0], ['set', 0, 3.2], 'silent from now, not from t0');
  assert.ok(calls.every(([, v]) => v <= 0.3), 'never over its peak');
});

test('brown noise has no slow excursions: 50 bursts in a row are within a couple of dB of each other', () => {
  const rate = 48_000;
  const d = makeNoise('brown', rate, seeded());
  assert.ok(Math.abs(dB(rmsOf(d, 0, d.length)) - dB(BROWN_RMS)) < 1, 'scaled to the level the recipes were tuned at');
  const starts = matchedOffsets(d, rate);
  assert.ok(starts.length >= 8, `enough start points to vary (${starts.length})`);
  // 50 steps: each takes a start point in turn, and 75 ms of it (a step's body).
  const n = Math.floor(0.075 * rate);
  const levels = Array.from({ length: 50 }, (_, i) => dB(rmsOf(d, Math.floor(starts[(i * 7) % starts.length] * rate), n)));
  const spread = Math.max(...levels) - Math.min(...levels);
  assert.ok(spread < 4, `50 bursts spread ${spread.toFixed(1)} dB`);
  // Raw offsets, as before, were noise luck: a wider spread than the matched ones.
  const raw = Array.from({ length: 50 }, (_, i) => dB(rmsOf(d, Math.floor(((i * 0.6180339) % 1) * 1.5 * rate), n)));
  assert.ok(Math.max(...raw) - Math.min(...raw) > spread, 'matching narrows it');
});

test('steps wander a little and alternate feet; the levels sit under the alerts', () => {
  assert.ok(STEP_JITTER_DB > 0 && STEP_JITTER_DB <= 2, 'about +-2 dB, never a jump');
  assert.ok(STEP_LEVEL < 1, 'a walk sits under the alerts (design/sound-levels.mjs measures it)');
  assert.equal(FEET.length, 2);
  assert.ok(FEET[0].pitch < 1 && FEET[1].pitch > 1, 'the left lower, the right higher');
  assert.ok(FEET[0].pan < 0 && FEET[1].pan > 0 && Math.abs(FEET[0].pan) <= 0.15);
  // Bolt's hold note goes straight out, not through a band that took most of it: heard, but soft.
  assert.ok(HOLD_GAIN > 0.02 && HOLD_GAIN < 0.06);
});

test('footsteps and Bolt make no garbage: the same array back each frame', () => {
  const f = new Footfalls();
  const a = f.update(body(), 0.016);
  const b = f.update(body({ walkPhase: Math.PI + 0.01, moving: true, z: -1.3 }), 0.29);
  assert.equal(a, b);
  assert.equal(b.length, 1);
});
