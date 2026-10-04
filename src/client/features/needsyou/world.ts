import * as THREE from 'three';
import { DECK } from '../../world/office/materials';

// The light shaft over a unit that needs you: a faint column of Signal orange rising from the floor
// round it, there so it reads from across the deck and from the Overview camera. The ring, the glyph
// and the ready line are the unit's own (world/character/worker.ts); this only says "over here".
// It thins out as you walk up, so it never stands between you and the unit.

/** How high the shaft goes (m): well over the unit and its callout, short of the boards' tops. */
const SHAFT_HEIGHT = 4.2;
/** Its strongest, from across the deck. Added on top of what's behind it, so it never hides anything. */
const STRENGTH = 0.2;

let shaftShape: THREE.CylinderGeometry | undefined;
let shaftTexture: THREE.CanvasTexture | undefined;

/** The shaft's fade from the floor up: strongest just over the unit's head, gone by the top. */
function fade(): THREE.CanvasTexture {
  if (shaftTexture) return shaftTexture;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  shaftTexture = new THREE.CanvasTexture(c);
  shaftTexture.colorSpace = THREE.SRGBColorSpace;
  return shaftTexture;
}

export class Beacon {
  /** Goes in the scene, not on the unit: it stays upright whatever the unit is doing. */
  readonly root = new THREE.Group();
  private readonly shaft: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;

  constructor() {
    shaftShape ??= new THREE.CylinderGeometry(0.26, 0.36, 1, 20, 1, true).translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: DECK.signal, map: fade(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.shaft = new THREE.Mesh(shaftShape, mat);
    this.shaft.scale.y = SHAFT_HEIGHT;
    this.shaft.renderOrder = 4;
    this.root.add(this.shaft);
  }

  /**
   * Where the unit is this frame: `at` its foot, `floor` the floor under it (world heights), and `near`
   * 0 from across the deck up to 1 with you right beside it.
   */
  update(at: THREE.Vector3, floor: number, near: number) {
    this.root.position.set(at.x, floor, at.z);
    const far = 1 - near;
    this.shaft.material.opacity = STRENGTH * far;
    this.shaft.visible = far > 0.02;
  }

  /** Its own material goes; the shape and the fade are every beacon's. */
  dispose() {
    this.root.removeFromParent();
    this.shaft.material.dispose();
  }
}
