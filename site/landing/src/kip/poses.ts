// Kip's poses, pivots and wand safety, as in the deck (mergeline-deck/site/kip.js).

export type PartVars = Record<string, number>;
export type Pose = Record<string, PartVars>;

export const NEUTRAL: Pose = {
  root: { rotation: 0, scaleX: 1, scaleY: 1, y: 0 }, head: { rotation: 0, y: 0 },
  armL: { rotation: 0 }, armR: { rotation: 0 }, legL: { rotation: 0, scaleY: 1 }, legR: { rotation: 0, scaleY: 1 },
  earL: { rotation: 0 }, earR: { rotation: 0 }, tipL: { rotation: 0 }, tipR: { rotation: 0 }, tuft: { rotation: 0 },
  tail: { rotation: 0, scale: 1 }, torso: { scaleY: 1 }, scarfTails: { rotation: 0 },
  lidL: { scaleY: 0.12 }, lidR: { scaleY: 0.12 }, lowL: { scaleY: 0 }, lowR: { scaleY: 0 },
  mouth: { opacity: 1 }, mouthO: { opacity: 0, scale: 1 }, sprig: { rotation: 0, autoAlpha: 1 },
  pupilL: { scale: 1 }, pupilR: { scale: 1 }, pennant: { autoAlpha: 0 }, pen: { skewY: 0 }, inL: { opacity: 1 },
};
const HAPPY: Pose = { lidL: { scaleY: 0 }, lidR: { scaleY: 0 }, lowL: { scaleY: 0.7 }, lowR: { scaleY: 0.7 } };
const SIT: Pose = { root: { y: 9 }, legL: { rotation: 55 }, legR: { rotation: -55 } };

export function mix(...poses: Pose[]): Pose {
  const o: Pose = {};
  for (const a of poses) for (const k in a) o[k] = { ...(o[k] ?? {}), ...a[k] };
  return o;
}

export const POSES = {
  stand: {},
  happy: HAPPY,
  sit: SIT,
  sitdown: mix(SIT, { earL: { rotation: -38 }, earR: { rotation: 38 }, tipL: { rotation: -30 }, tipR: { rotation: 30 }, lidL: { scaleY: 0.42 }, lidR: { scaleY: 0.42 } }),
  wave: mix(HAPPY, { armL: { rotation: 140 }, head: { rotation: 8 } }),
  point: { armR: { rotation: -70 }, root: { rotation: 4 } },
  // The flag stands upright beside his head (arm out, rod turned to vertical), pennant flying.
  flag: { armR: { rotation: -65 }, sprig: { rotation: 32 }, armL: { rotation: -28 }, pennant: { autoAlpha: 1 } },
  tada: mix(HAPPY, { armL: { rotation: 150 }, armR: { rotation: -22 }, sprig: { rotation: 18 } }),
  pawup: mix(HAPPY, { armL: { rotation: 150 }, head: { rotation: -6 } }),
  cheer: mix(HAPPY, { armL: { rotation: 150 }, armR: { rotation: -150 }, mouthO: { opacity: 1 }, mouth: { opacity: 0 } }),
  belly: mix(HAPPY, { armL: { rotation: -38 }, armR: { rotation: 38 }, sprig: { autoAlpha: 0 } }),
  lie: { root: { y: 10, scaleY: 0.86 }, legL: { rotation: 60 }, legR: { rotation: -60 }, armL: { rotation: -50 }, armR: { rotation: 50 }, head: { y: 3, rotation: 4 }, lidL: { scaleY: 0.4 }, lidR: { scaleY: 0.4 } },
  sleep: {
    root: { scaleY: 0.74 }, legL: { rotation: 60 }, legR: { rotation: -60 }, armL: { rotation: -40 }, armR: { rotation: 40 }, head: { rotation: 10, y: 6 },
    earL: { rotation: -50 }, earR: { rotation: 50 }, tipL: { rotation: -40 }, tipR: { rotation: 40 }, lidL: { scaleY: 1 }, lidR: { scaleY: 1 }, lowL: { scaleY: 0 }, lowR: { scaleY: 0 },
  },
} satisfies Record<string, Pose>;
export type PoseName = keyof typeof POSES;

export const ORIGINS: Record<string, string> = {
  root: '50 128', head: '50 72', look: '50 72', earL: '39 37', earR: '61 37', tipL: '33.4 16.2', tipR: '66.6 16.2', tuft: '50 34',
  armL: '35 80', armR: '65 80', legL: '38 106', legR: '62 106', torso: '50 112', scarf: '60 76', scarfTails: '60 76', tail: '66 110',
  lidL: '40 45', lidR: '60 45', lowL: '40 59', lowR: '60 59', sprig: '70 95', pupilL: '40 52', pupilR: '60 52', glow: '79 76.5', mouthO: '50 67.6',
  pen: '79.8 75.55',
};

// ---------- the wand never crosses his face ----------
// The rod's points (mid, tip, chevron apex) in body units for an arm and Sprig rotation. Every arm
// move picks the nearest Sprig angle that keeps those points off the head (an ellipse around the
// face, plus the ears).

type P = [number, number];
export const ROD_PTS: P[] = [[74.5, 83.7], [78.6, 77.4], [79.8, 75.55]];
function rotP(p: P, o: P, d: number): P {
  const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), x = p[0] - o[0], y = p[1] - o[1];
  return [o[0] + x * c - y * s, o[1] + x * s + y * c];
}
export function onHead(p: P): boolean {
  const [x, y] = p;
  return Math.pow((x - 51) / 25.5, 2) + Math.pow((y - 54.5) / 23, 2) < 1 || (x > 30 && x < 70 && y < 37);
}
/** The rod's points for an arm and wand rotation, in body units. */
export function rodAt(arm: number, spr: number): P[] {
  return ROD_PTS.map((p) => rotP(rotP(p, [70, 95], spr), [65, 80], arm));
}
export function sprigSafe(arm: number, spr: number): boolean {
  return !rodAt(arm, spr).some(onHead);
}
export function sprigFor(arm: number, base = 0): number {
  for (let d = 0; d <= 180; d += 5) {
    if (sprigSafe(arm, base + d)) return base + d;
    if (d && sprigSafe(arm, base - d)) return base - d;
  }
  return base;
}

// ---------- which glow is lit ----------
export type Sprig = 'green' | 'teal' | 'cyan' | 'rose' | 'dim' | 'off';
const glowOf = (c: Sprig) => (c === 'cyan' || c === 'teal' ? 'teal' : 'green');
export function glowOn(c: Sprig, g: string): number {
  return c === 'off' ? 0 : c === 'dim' ? (g === 'green' ? 0.28 : 0) : glowOf(c) === g ? 1 : 0;
}
