import * as THREE from 'three';
import { mesh } from '../toon';
import { DECK, box, practical } from './materials';

// The deck's fittings that more than one fixture uses: the panel every board, screen and the
// capacity panel is drawn on.

/**
 * A panel on a wall: a thin dark bezel, flush, with a lit hairline along its top edge, and a face
 * that gets a canvas texture (a board, a screen). Built facing +z. A `glass` panel (the situation arc's)
 * has no slab behind it: its face is lit glass, drawn see-through over the arc's smoked pane (its canvas
 * paints a smoked ground at 88%), and its frame is the arc's chrome (features/arcchrome).
 */
export function wallBoard(width: number, height: number, glass = false): { group: THREE.Group; face: THREE.Mesh } {
  const group = new THREE.Group();
  if (!glass) {
    group.add(mesh(box(width + 0.08, height + 0.08, 0.05), new THREE.MeshStandardMaterial({ color: DECK.wallReveal, roughness: 0.9 }), 0, 0, 0, false));
    group.add(mesh(box(width + 0.08, 0.012, 0.012), practical(DECK.line), 0, height / 2 + 0.046, 0.03, false));
  }
  // An attention carrier: a board's face never takes fog (docs/design.md).
  const faceMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false, transparent: glass });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), faceMat);
  face.position.z = 0.027;
  // After the arc's smoked pane behind it (renderOrder 2, features/amphitheater/arc.ts).
  if (glass) face.renderOrder = 3;
  group.add(face);
  return { group, face };
}
