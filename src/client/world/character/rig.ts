import * as THREE from 'three';

// The bodies' shared measurements, and the parts of a Worker that the other files here pose, passed
// to them by the class (see worker.ts).

/** The Person's hips above their feet, standing. Sitting puts them on the seat, and your eyes move with them. */
export const HIPS = 0.42;

/** A Worker's moving parts, and its skin and status light. Forward is +z. */
export interface WorkerRig {
  root: THREE.Group;
  body: THREE.Group;
  skin: THREE.MeshStandardMaterial;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  feet: THREE.Mesh[];
  pupils: THREE.Mesh[];
  bulb: THREE.MeshStandardMaterial;
  bulbMesh: THREE.Mesh;
  /** What it acts out with: the papers in its hands and the globe beside its laptop (see worker-props.ts). */
  props: THREE.Object3D[];
}
