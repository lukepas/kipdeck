// The captain's framing from the chair, as plain numbers for the tests (tests/sightline.test.ts).

/** The field of view seated in the captain's chair, the camera's own, and how far up the arc the view is aimed (0 its foot, 1 its top). */
export const FRAMING = { fov: 50, base: 55, aim: 0.3 } as const;

/** The pitch (radians, up is positive) that aims an eye at (`eyeY`, `eyeZ`) at FRAMING.aim of the way up `arc`, straight down the deck. */
export function seatedPitch(eyeY: number, eyeZ: number, arc: { bottom: number; top: number; z: number }): number {
  const y = arc.bottom + (arc.top - arc.bottom) * FRAMING.aim;
  return Math.atan2(y - eyeY, eyeZ - arc.z);
}
