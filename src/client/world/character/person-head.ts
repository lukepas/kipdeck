import * as THREE from 'three';
import { HAIR_STYLES } from '../../../shared/avatar';
import { mesh } from '../toon';

/**
 * What sits on an operator's head plate (whose middle is 0,0,0, 0.2 wide, 0.25 tall and 0.22 deep,
 * the visor facing +z), in `style` of HAIR_STYLES: a flat plate, a crest, twin fins, a hood, a brow
 * ridge, a bar over the visor, or nothing.
 */
export function styleHead(g: THREE.Group, m: THREE.Material, style: number) {
  for (const o of g.children) (o as THREE.Mesh).geometry.dispose();
  g.clear();
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
    const part = mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
    part.rotation.x = rx;
    g.add(part);
  };
  switch (HAIR_STYLES[style]) {
    case 'Plate':
      add(0.22, 0.03, 0.24, 0, 0.14, 0);
      break;
    case 'Crest':
      add(0.035, 0.07, 0.22, 0, 0.16, -0.01);
      break;
    case 'Twin fins':
      for (const x of [-0.07, 0.07]) add(0.025, 0.06, 0.18, x, 0.15, -0.02);
      break;
    case 'Hood':
      add(0.24, 0.2, 0.08, 0, 0.03, -0.13);
      add(0.24, 0.04, 0.26, 0, 0.14, -0.01);
      break;
    case 'Brow':
      add(0.22, 0.035, 0.05, 0, 0.075, 0.11, -0.2);
      break;
    case 'Visor bar':
      add(0.23, 0.02, 0.03, 0, 0.0, 0.125);
      break;
    case 'Bare':
      break;
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
}
