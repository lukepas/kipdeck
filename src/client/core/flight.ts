/**
 * Camera flights in Walk: when the office puts you somewhere else on the deck (an alert's "go there",
 * N, a search result), the camera flies there in a 700 ms ease-in-out arc instead of cutting, so you
 * keep your bearings. You are already there the moment it starts (your position, what you can use);
 * only the view catches up. Under reduced motion it is a cut. The Overview has its own 300 ms pan and
 * zoom (core/camera-overview.ts).
 */
import * as THREE from 'three';
import type { Ctx } from './context';

/** How long a flight takes (ms), and the most it rises over its middle (m). */
const FLIGHT_MS = 700;
const RISE = 2.5;

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export function installFlight(ctx: Ctx) {
  const { camera } = ctx;
  let flight: { p: THREE.Vector3; q: THREE.Quaternion; at: number } | null = null;
  const p1 = new THREE.Vector3();
  const q1 = new THREE.Quaternion();

  // After the player has put the camera where you now are ('move'), so the flight blends from where
  // the view was toward it, and lets go once it's there.
  ctx.ticks.add('me', ({ now }) => {
    if (!flight) return;
    const k = Math.min(1, (now - flight.at) / FLIGHT_MS);
    if (k >= 1) {
      flight = null;
      return;
    }
    const e = ease(k);
    p1.copy(camera.position);
    q1.copy(camera.quaternion);
    const lift = Math.sin(Math.PI * e) * Math.min(RISE, flight.p.distanceTo(p1) * 0.12);
    camera.position.lerpVectors(flight.p, p1, e);
    camera.position.y += lift;
    camera.quaternion.slerpQuaternions(flight.q, q1, e);
  });

  return {
    /** The view is about to jump: fly from where it is now. Call it before moving you. */
    from() {
      if (ctx.reduceMotion.matches) return;
      // A flight cut short by another starts from where the view is now, mid-air.
      flight = { p: camera.position.clone(), q: camera.quaternion.clone(), at: performance.now() };
    },
    /** Whether a flight is under way. */
    flying: () => !!flight,
  };
}
