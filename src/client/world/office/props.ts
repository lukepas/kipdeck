import * as THREE from 'three';
import { mesh } from '../toon';
import { DECK, box, practical } from './materials';

// The deck's fittings that more than one fixture uses: the panel every board, screen and the
// capacity panel is drawn on.

/**
 * A panel on a wall: a thin dark bezel, flush, with a lit hairline along its top edge, and a face
 * that gets a canvas texture (a board, a screen). Built facing +z.
 */
export function wallBoard(width: number, height: number): { group: THREE.Group; face: THREE.Mesh } {
  const group = new THREE.Group();
  group.add(mesh(box(width + 0.08, height + 0.08, 0.05), new THREE.MeshStandardMaterial({ color: DECK.wallReveal, roughness: 0.9 }), 0, 0, 0, false));
  group.add(mesh(box(width + 0.08, 0.012, 0.012), practical(DECK.line), 0, height / 2 + 0.046, 0.03, false));
  const faceMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), faceMat);
  face.position.z = 0.027;
  group.add(face);
  return { group, face };
}
