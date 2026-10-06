import * as THREE from 'three';
import type { Focus } from '../cinema/grade';

/**
 * The local vignette's focuses, shared live between features/spotlight (which moves them each frame)
 * and the grade (which reads them as uniforms): the waiting station first, the Attention board's rows
 * second. A strength of 0 leaves the frame as it is.
 */
export const FOCUS_NOW: Focus = {
  points: [new THREE.Vector4(0, 0, 0.1, 0.1), new THREE.Vector4(0, 0, 0.1, 0.1)],
  k: new THREE.Vector2(0, 0),
};
