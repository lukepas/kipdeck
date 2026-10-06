// The Ambience group: what the bridge sounds like when nothing is happening. A low bed everywhere (a
// rumble of the hull, a faint hum, life support's air slowly breathing), the drive's drone from the
// core aft, the holo table's shimmer at the middle of the deck, and Bolt's hover hum wherever it flies.
// The three placed ones pan and fall off with distance as you walk (core.ts place), so the deck has a
// shape you can hear: louder aft by the drive, a glassy whisper by the table.
//
// It is quiet by design (the alerts are the loudest thing on the deck), sinks while a unit needs you
// (mix.ts), and stops altogether, its sources torn down, once it has been silent a couple of seconds:
// muted, turned down, or a hidden tab, so a background tab spends nothing on it. The bed follows upstream
// agent-office's room tone (origin/main src/client/sound/ambience.ts, MIT), tuned down for a ship.

import { AFT_CORE } from '../../../shared/ritual-slots';
import { MISSION_TABLE } from '../../../shared/layout';
import type { At } from '../../sound';
import type { AudioCore } from '../../sound/core';
import { noise } from '../../sound/dsp';

/** Where the placed sources are: the drive core aft, and over the holo table. */
export const DRIVE_AT: At = { x: AFT_CORE.x, y: (AFT_CORE.y0 + AFT_CORE.y1) / 2, z: AFT_CORE.z };
export const HOLO_AT: At = { x: MISSION_TABLE.x, y: 1.5, z: MISSION_TABLE.z };

/** Each source's level into the Ambience bus. */
export const AMBIENCE_LEVELS = { rumble: 0.09, hum: 0.026, air: 0.016, drive: 0.08, holo: 0.007, hover: 0.06 } as const;

/** How far Bolt must move (m) before its hum's place is updated. */
export const HOVER_MOVE = 0.05;

export class Ambience {
  private nodes: AudioScheduledSourceNode[] = [];
  private out: GainNode | null = null;
  private hover: { panner: PannerNode; gain: GainNode; on: boolean; x: number; y: number; z: number } | null = null;

  get on(): boolean {
    return this.out !== null;
  }

  /** Starts every source into `bus` through a fade-in of 2 s. */
  start(ctx: AudioContext, bus: AudioNode, a: AudioCore) {
    if (this.out) return;
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(1, t0 + 2);
    out.connect(bus);
    this.out = out;
    const L = AMBIENCE_LEVELS;
    const loop = (kind: 'white' | 'brown') => {
      const s = ctx.createBufferSource();
      s.buffer = noise(ctx, kind);
      s.loop = true;
      this.nodes.push(s);
      return s;
    };
    const osc = (f: number, wave: OscillatorType = 'sine', detune = 0) => {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.value = f;
      o.detune.value = detune;
      this.nodes.push(o);
      return o;
    };
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const filter = (type: BiquadFilterType, f: number, q = 0.7) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    /** A slow wobble of `param` by `depth` at `hz`. */
    const lfo = (param: AudioParam, hz: number, depth: number) => {
      const o = osc(hz);
      o.connect(gain(depth)).connect(param);
    };

    // The bed: the hull's rumble, a faint hum, and air breathing through the vents.
    loop('brown').connect(filter('lowpass', 170, 0.5)).connect(gain(L.rumble)).connect(out);
    const hum = gain(L.hum);
    osc(55).connect(hum);
    osc(110, 'sine', 4).connect(gain(0.35)).connect(hum);
    hum.connect(out);
    const air = filter('bandpass', 700, 0.8);
    const airGain = gain(L.air);
    loop('white').connect(air).connect(airGain).connect(out);
    lfo(airGain.gain, 0.07, L.air * 0.5);
    lfo(air.frequency, 0.05, 160);

    // The drive aft: two low saws a fifth apart, beating slowly, under a breathing low-pass.
    const drive = filter('lowpass', 210, 1.2);
    const driveGain = gain(L.drive);
    osc(36.7, 'sawtooth').connect(drive);
    osc(55.05, 'sawtooth', 9).connect(gain(0.6)).connect(drive);
    lfo(drive.frequency, 0.11, 60);
    drive.connect(driveGain).connect(a.place(ctx, out, DRIVE_AT, 3, 1.2));

    // The holo table: two high sines a few hertz apart, and a hiss of light.
    const holo = gain(L.holo);
    osc(1760).connect(holo);
    osc(1763.5).connect(holo);
    loop('white').connect(filter('bandpass', 5200, 3)).connect(gain(0.4)).connect(holo);
    holo.connect(a.place(ctx, out, HOLO_AT, 1.4, 2));

    // Bolt's hover: a soft low buzz and the rush of its fans, moved with it (hover()).
    const hoverGain = gain(0);
    const panner = a.place(ctx, out, HOLO_AT, 2, 1.3) as PannerNode;
    const fan = filter('bandpass', 900, 1.5);
    osc(180, 'triangle').connect(gain(0.5)).connect(hoverGain);
    loop('white').connect(fan).connect(hoverGain);
    hoverGain.connect(panner);
    this.hover = { panner, gain: hoverGain, on: false, x: HOLO_AT.x, y: HOLO_AT.y, z: HOLO_AT.z };

    for (const n of this.nodes) {
      if (n instanceof AudioBufferSourceNode) n.start(t0, Math.random() * 1.5);
      else n.start(t0);
    }
  }

  /**
   * Bolt's hover hum at `at`, or silent while it is docked or away (null). Only a change is scheduled:
   * the level when Bolt wakes or docks, the place once it has moved HOVER_MOVE m, so a still droid costs
   * the audio thread nothing.
   */
  droid(ctx: AudioContext, at: At | null) {
    const h = this.hover;
    if (!h) return;
    const now = ctx.currentTime;
    if (!!at !== h.on) {
      h.on = !!at;
      h.gain.gain.setTargetAtTime(at ? AMBIENCE_LEVELS.hover : 0, now, 0.4);
    }
    if (!at || Math.hypot(at.x - h.x, at.y - h.y, at.z - h.z) < HOVER_MOVE) return;
    h.x = at.x;
    h.y = at.y;
    h.z = at.z;
    const p = h.panner;
    if (p.positionX) {
      p.positionX.setTargetAtTime(at.x, now, 0.05);
      p.positionY.setTargetAtTime(at.y, now, 0.05);
      p.positionZ.setTargetAtTime(at.z, now, 0.05);
    } else p.setPosition(at.x, at.y, at.z);
  }

  /** Fades out and tears every source down. */
  stop(ctx: AudioContext) {
    const out = this.out;
    if (!out) return;
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(0, t, 0.1);
    for (const n of this.nodes) n.stop(t + 0.6);
    const nodes = this.nodes;
    setTimeout(() => {
      for (const n of nodes) n.disconnect();
      out.disconnect();
    }, 800);
    this.nodes = [];
    this.out = null;
    this.hover = null;
  }
}
