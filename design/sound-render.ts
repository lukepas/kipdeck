// Bundled by design/sound-levels.mjs and run in headless Chromium: renders every recipe of the deck's
// sound offline (OfflineAudioContext, 48 kHz stereo) through the deck's own chain (the group's bus at its
// default level, the master at the default volume, the same compressor), and measures each one. Nothing
// here ships: it only imports the real recipes.
import { CUES, playCue, type Cue } from '../src/client/sound/alerts';
import { playJump, JUMP_SOUNDS, type JumpSound } from '../src/client/sound/jump';
import { playUi, type UiSound } from '../src/client/sound/ui';
import { busGains, masterGain, type SoundGroup } from '../src/client/sound/mix';
import { MIX_DEFAULTS } from '../src/client/state/persist';
import type { AudioCore, At } from '../src/client/sound/core';
import type { Recipe } from '../src/client/sound';
import { droid, gate, grab, land, leap, rung, sit, stand, step } from '../src/client/features/soundscape/sfx';
import { payout } from '../src/client/features/bounties/sound';
import type { DroidSay } from '../src/client/features/soundscape/logic';

const RATE = 48_000;
/**
 * Silence before each sound (s), cut from what is measured: the compressor's make-up gain settles over
 * its release, and a live deck's compressor has long settled, so a sound measured at the very start of a
 * render reads several dB quiet.
 */
const PRE = 0.8;
const calm = { hidden: false, life: 'full' as const, attention: false };

/** One event of a render: at `t` s, `fire` plays something on the core. */
type Ev = [t: number, fire: (a: OfflineCore) => void];

/** Just enough of AudioCore for the recipes: the buses, placing, counting, the duck. */
class OfflineCore {
  readonly bus = {} as Record<SoundGroup, GainNode>;
  readonly played: Record<string, number> = {};
  constructor(readonly ctx: OfflineAudioContext) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const master = ctx.createGain();
    master.gain.value = masterGain(0.7, false);
    master.connect(comp).connect(ctx.destination);
    const g = busGains(MIX_DEFAULTS, calm);
    for (const k of ['alerts', 'ui', 'ship', 'ambience'] as const) {
      this.bus[k] = ctx.createGain();
      this.bus[k].gain.value = g[k];
      this.bus[k].connect(master);
    }
    const l = ctx.listener;
    l.positionX.value = 0;
    l.positionY.value = 1.6;
    l.positionZ.value = 0;
    l.forwardX.value = 0;
    l.forwardY.value = 0;
    l.forwardZ.value = -1;
  }
  count(what: string) {
    this.played[what] = (this.played[what] ?? 0) + 1;
  }
  live(group: SoundGroup) {
    return { ctx: this.ctx as unknown as AudioContext, out: this.bus[group] };
  }
  duck() {}
  place(ctx: AudioContext, out: AudioNode, at: At, ref = 2.5, rolloff = 1): AudioNode {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 60;
    p.positionX.value = at.x;
    p.positionY.value = at.y;
    p.positionZ.value = at.z;
    p.connect(out);
    return p;
  }
  play(group: SoundGroup, r: Recipe) {
    r(this.ctx as unknown as AudioContext, this.bus[group], this as unknown as AudioCore);
  }
}

const ship = (r: Recipe): Ev[] => [[0.02, (a) => a.play('ship', r)]];
const series = (r: () => Recipe, n: number, gap: number): Ev[] => Array.from({ length: n }, (_, i) => [0.02 + i * gap, (a) => a.play('ship', r())] as Ev);
const BOLT: At = { x: 0, y: 1.3, z: -2.2 };

/** Every sound and its group: what the levels and the budgets are checked on. */
export const SOUNDS: Record<string, { group: SoundGroup; seconds: number; events: Ev[]; gap?: number }> = {
  ...Object.fromEntries((Object.keys(CUES) as Cue[]).map((c) => [`alert-${c}`, { group: 'alerts' as const, seconds: 0.8, events: [[0.02, (a: OfflineCore) => playCue(a as unknown as AudioCore, c)]] as Ev[] }])),
  ...Object.fromEntries((['click', 'open', 'close', 'on'] as UiSound[]).map((u) => [`ui-${u}`, { group: 'ui' as const, seconds: 0.5, events: [[0.02, (a: OfflineCore) => playUi(a as unknown as AudioCore, u)]] as Ev[] }])),
  ...Object.fromEntries((Object.keys(JUMP_SOUNDS) as JumpSound[]).map((j) => [`jump-${j}`, { group: 'ship' as const, seconds: JUMP_SOUNDS[j].len + 0.6, events: [[0.02, (a: OfflineCore) => playJump(a as unknown as AudioCore, j)]] as Ev[] }])),
  'step-plate': { group: 'ship', seconds: 0.35, events: ship(step('plate', false)) },
  'step-plate-run': { group: 'ship', seconds: 0.35, events: ship(step('plate', true)) },
  'step-stair': { group: 'ship', seconds: 0.35, events: ship(step('stair', false)) },
  'step-grate': { group: 'ship', seconds: 0.35, events: ship(step('grate', false)) },
  'steps-plate-walk-8': { group: 'ship', seconds: 4.3, events: series(() => step('plate', false), 8, 0.5), gap: 0.5 },
  'steps-plate-run-8': { group: 'ship', seconds: 2.9, events: series(() => step('plate', true), 8, 0.34), gap: 0.34 },
  'steps-stair-6': { group: 'ship', seconds: 3.4, events: series(() => step('stair', false), 6, 0.5), gap: 0.5 },
  'steps-grate-6': { group: 'ship', seconds: 3.4, events: series(() => step('grate', false), 6, 0.5), gap: 0.5 },
  'steps-plate-walk-50': { group: 'ship', seconds: 25.4, events: series(() => step('plate', false), 50, 0.5), gap: 0.5 },
  leap: { group: 'ship', seconds: 0.3, events: ship(leap) },
  'land-soft': { group: 'ship', seconds: 0.4, events: ship(land(0.2)) },
  'land-hard': { group: 'ship', seconds: 0.4, events: ship(land(1)) },
  'jump-and-land': { group: 'ship', seconds: 1.2, events: [[0.02, (a) => a.play('ship', leap)], [0.62, (a) => a.play('ship', land(0.7))]] },
  'sit-conn': { group: 'ship', seconds: 0.9, events: ship(sit(true)) },
  'sit-seat': { group: 'ship', seconds: 0.6, events: ship(sit(false)) },
  stand: { group: 'ship', seconds: 0.5, events: ship(stand) },
  'climb-grab': { group: 'ship', seconds: 0.3, events: ship(grab) },
  'climb-rung': { group: 'ship', seconds: 0.35, events: ship(rung) },
  'climb-gate': { group: 'ship', seconds: 0.5, events: ship(gate) },
  ...Object.fromEntries((['wake', 'dock', 'pickup', 'handoff', 'hold', 'chatter'] as DroidSay[]).map((d) => [`droid-${d}`, { group: 'ship' as const, seconds: 0.8, events: ship(droid(d, BOLT)) }])),
  'payout-still': { group: 'ship', seconds: 2.2, events: ship(payout({ x: -6, y: 1.2, z: -3 }, { x: 0, y: 1.2, z: -1.5 }, 3, true)) },
  'payout-flight': { group: 'ship', seconds: 4.5, events: ship(payout({ x: -6, y: 1.2, z: -3 }, { x: 0, y: 1.2, z: -1.5 }, 3, false)) },
};

const db = (v: number) => +(20 * Math.log10(Math.max(1e-9, v))).toFixed(1);

/** Peak, RMS and the loudest 50 ms (10 ms hop) of the mixed-down channels. */
function measure(b: AudioBuffer, gap?: number) {
  const l = b.getChannelData(0);
  const r = b.getChannelData(1);
  const n = l.length;
  const m = new Float32Array(n);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    m[i] = (l[i] + r[i]) / 2;
    peak = Math.max(peak, v);
    sum += m[i] * m[i];
  }
  const win = Math.floor(0.05 * RATE);
  let loud = 0;
  for (let at = 0; at + win <= n; at += Math.floor(0.01 * RATE)) {
    let s = 0;
    for (let i = at; i < at + win; i++) s += m[i] * m[i];
    loud = Math.max(loud, Math.sqrt(s / win));
  }
  const out: Record<string, number> = { seconds: +(n / RATE).toFixed(2), peakDb: db(peak), rmsDb: db(Math.sqrt(sum / n)), loudest50msDb: db(loud) };
  if (gap) {
    // Each step's own peak, for the spread across a series.
    const per: number[] = [];
    for (let at = 0; at + gap * RATE <= n; at += Math.floor(gap * RATE)) {
      let p = 0;
      for (let i = at; i < at + gap * RATE; i++) p = Math.max(p, Math.abs(l[i]), Math.abs(r[i]));
      if (p > 0) per.push(20 * Math.log10(p));
    }
    out.stepSpreadDb = +(Math.max(...per) - Math.min(...per)).toFixed(1);
    out.peakOverLoudestDb = +(out.peakDb - out.loudest50msDb).toFixed(1);
  }
  return out;
}

/** 16-bit stereo WAV bytes of `b`, base64. */
function wav(b: AudioBuffer): string {
  const n = b.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  const l = b.getChannelData(0);
  const r = b.getChannelData(1);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 0x7fff, true);
    v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 0x7fff, true);
  }
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

/** Renders `name`; its levels, and the WAV when asked. */
async function render(name: string, withWav: boolean) {
  const s = SOUNDS[name];
  const ctx = new OfflineAudioContext(2, Math.ceil((PRE + s.seconds) * RATE), RATE);
  const a = new OfflineCore(ctx);
  for (const [t, fire] of s.events) {
    // Each event fires with the render paused at its time, as a live deck's would (currentTime moving);
    // a recipe called before rendering starts, at time 0, plays its ramps wrong and reads ~11 dB quiet.
    void ctx.suspend(Math.round((PRE + t) * 375) / 375).then(() => {
      fire(a);
      void ctx.resume();
    });
  }
  const all = await ctx.startRendering();
  const b = new AudioBuffer({ numberOfChannels: 2, length: all.length - Math.round(PRE * RATE), sampleRate: RATE });
  for (const c of [0, 1]) b.copyToChannel(all.getChannelData(c).subarray(Math.round(PRE * RATE)), c);
  return { name, group: s.group, levels: measure(b, s.gap), wav: withWav ? wav(b) : undefined };
}

(window as unknown as { renderAll: (wavs: boolean) => Promise<unknown[]> }).renderAll = async (wavs: boolean) => {
  const out = [];
  for (const name of Object.keys(SOUNDS)) out.push(await render(name, wavs));
  return out;
};
