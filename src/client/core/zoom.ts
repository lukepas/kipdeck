import type * as THREE from 'three';

// One place that sets a camera's field of view, so whatever frames the view (the jump's punch,
// features/space; the captain's focus lean on a board, features/focuslean; the Overview's own framing)
// adds its say to the camera's base instead of writing the field over each other. Each source sets
// how many degrees it adds (less than zero to close in); the camera gets the base plus the sum, and its
// projection is updated only when that changes.

export interface Zoom {
  /** `source` adds `degrees` to the base field of view (0 takes its say away). */
  set(source: string, degrees: number): void;
  /** What `source` adds now. */
  get(source: string): number;
  /** The field of view the camera has now. */
  readonly fov: number;
}

const zooms = new WeakMap<THREE.PerspectiveCamera, Zoom>();

/** The base plus every source's say, never under `min` or over `max` degrees. */
export function fieldOf(base: number, says: Iterable<number>, min = 10, max = 120): number {
  let f = base;
  for (const d of says) f += d;
  return Math.min(max, Math.max(min, f));
}

/** `camera`'s zoom, made the first time it's asked for with the field it has then as its base. */
export function zoomOf(camera: THREE.PerspectiveCamera): Zoom {
  let z = zooms.get(camera);
  if (z) return z;
  const base = camera.fov;
  const says = new Map<string, number>();
  z = {
    set(source, degrees) {
      if ((says.get(source) ?? 0) === degrees) return;
      if (degrees) says.set(source, degrees);
      else says.delete(source);
      const fov = fieldOf(base, says.values());
      if (fov === camera.fov) return;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    },
    get: (source) => says.get(source) ?? 0,
    get fov() {
      return camera.fov;
    },
  };
  zooms.set(camera, z);
  return z;
}
