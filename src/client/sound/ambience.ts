import { DESKS } from '../../shared/layout';
import { NowAndThen, type AudioCore } from './core';
import { biquad, envelope, pick, rand, randInt } from './dsp';

// ---- Around the room --------------------------------------------------------------------------

export function startRoomTone(a: AudioCore) {
  const ctx = a.ctx!;
  // A low rumble of building and traffic...
  const rumble = a.noise(a.buf.brown, true);
  const rumbleG = ctx.createGain();
  rumbleG.gain.value = 0.07;
  rumble.connect(biquad(ctx, 'lowpass', 300, 0.7)).connect(rumbleG).connect(a.ambience);
  // ...and the air vents, swelling slowly.
  const air = a.noise(a.buf.white, true);
  const airG = ctx.createGain();
  airG.gain.value = 0.009;
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.06;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 0.004;
  swell.connect(swellDepth).connect(airG.gain);
  air.connect(biquad(ctx, 'bandpass', 650, 0.5)).connect(airG).connect(a.ambience);
  rumble.start();
  air.start();
  swell.start();
}

/** A desk phone rings a couple of times somewhere across the room, then someone picks up. */
function phone(a: AudioCore, now: number) {
  const ctx = a.ctx!;
  const l = a.listener;
  const far = DESKS.filter((d) => Math.hypot(d.x - l.x, d.z - l.z) > 7);
  const desk = pick(far.length ? far : DESKS);
  a.count('phone');
  const out = a.panner({ x: desk.x, y: 0.9, z: desk.z }, 1.5, 1.2);
  out.connect(biquad(ctx, 'lowpass', 3000, 0.7)).connect(a.ambience);
  const rings = randInt(2, 3);
  for (let r = 0; r < rings; r++) {
    const t = now + 0.05 + r * 2.4;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    // A warbling trill, flipping between two notes.
    for (let k = 0; k < 18; k++) o.frequency.setValueAtTime(k % 2 ? 1450 : 1150, t + k / 18);
    const g = ctx.createGain();
    envelope(g.gain, t, [
      [0.02, 0.045],
      [0.95, 0.045],
      [1, 0],
    ]);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.05);
  }
}

/** A desk phone ringing across the room now and then. */
export function deskPhones(a: AudioCore): NowAndThen {
  return new NowAndThen(
    () => rand(60, 150),
    () => rand(90, 240),
    (now) => phone(a, now),
  );
}
