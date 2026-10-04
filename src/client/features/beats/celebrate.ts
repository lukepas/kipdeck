import * as THREE from 'three';
import { BOARDS, MISSION_TABLE } from '../../../shared/layout';
import { DECK, practical } from '../../world/office/materials';

// The bridge's moment when a pull request merges, 1.2 s across the whole deck once the merge's pulse
// reaches the table: a ring of violet light sweeps out from the holo table across the floor, the Pull
// requests board flashes green, a ring rises off the merging unit's console, and every lit line on the
// bridge (the canopy's, the frames', the ports') swells to full ship-cyan and back. With motion off it
// is only a steady green on the board and the lines held bright for the same 1.2 s. Nothing of it
// moves the camera, and none of it is in a state's hue but proof's violet, which a merge is.

/** How long the whole moment takes (s). */
export const CELEBRATE_S = 1.2;
/** How far out the sweep runs across the floor (m). */
const SWEEP_TO = 15;

let ringTex: THREE.CanvasTexture | undefined;
/** A ring of soft light: bright at a radius of 0.85 of the texture, fading both ways. */
function ringTexture(): THREE.CanvasTexture {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.05)');
  grad.addColorStop(0.88, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.95, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
}

const additive = (color: string, map?: THREE.Texture) =>
  new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });

export class Celebration {
  readonly root = new THREE.Group();
  private readonly sweep: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly board: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly ping: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  /** The bridge's lit lines (practical ship-cyan, dim): they swell with the moment. */
  private readonly lines = practical(DECK.shipDim);
  private readonly dim = new THREE.Color(DECK.shipDim);
  private readonly full = new THREE.Color(DECK.ship);
  private t = Infinity;
  private still = false;

  constructor() {
    this.sweep = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), additive(DECK.proof, ringTexture()));
    this.sweep.position.set(MISSION_TABLE.x, 0.02, MISSION_TABLE.z);
    this.sweep.renderOrder = 3;
    const b = BOARDS.pulls;
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(b.width, b.height), additive(DECK.settled));
    // Just in front of the board's face, toward the table.
    const toward = new THREE.Vector3(Math.sin(b.rotY), 0, Math.cos(b.rotY)).multiplyScalar(0.06);
    this.board.position.set(b.x + toward.x, b.y, b.z + toward.z);
    this.board.rotation.y = b.rotY;
    this.board.renderOrder = 6;
    this.ping = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 48).rotateX(Math.PI / 2), additive(DECK.proof));
    this.ping.renderOrder = 6;
    this.root.add(this.sweep, this.board, this.ping);
    this.root.visible = false;
  }

  /** Plays the moment now, its ring rising off the console at `unit` (when there is one); `still` with motion off. */
  start(unit: THREE.Vector3 | null, still: boolean) {
    this.t = 0;
    this.still = still;
    this.root.visible = true;
    this.ping.visible = !!unit && !still;
    if (unit) this.ping.position.set(unit.x, 0.9, unit.z);
  }

  /** Moves it on `dt` seconds. */
  step(dt: number) {
    if (this.t === Infinity) return;
    this.t += dt;
    const k = Math.min(1, this.t / CELEBRATE_S);
    if (this.still) {
      // Only a colour flash: the board green and the lines bright, held, then gone.
      this.sweep.visible = false;
      this.board.material.opacity = k < 1 ? 0.22 : 0;
      this.lines.color.copy(k < 1 ? this.full : this.dim);
    } else {
      const ease = 1 - Math.pow(1 - k, 2);
      this.sweep.visible = true;
      this.sweep.scale.setScalar(MISSION_TABLE.r + (SWEEP_TO - MISSION_TABLE.r) * ease);
      this.sweep.material.opacity = 0.75 * (1 - k);
      // The board: a quick flash as the sweep reaches the wall, easing off.
      const flash = Math.max(0, 1 - Math.abs(k - 0.45) / 0.35);
      this.board.material.opacity = 0.32 * flash;
      this.ping.scale.setScalar(1 + 1.4 * ease);
      this.ping.position.y = 0.9 + 1.6 * ease;
      this.ping.material.opacity = 0.9 * (1 - k);
      // The lit lines swell and settle.
      this.lines.color.copy(this.dim).lerp(this.full, Math.sin(Math.PI * k));
    }
    if (k >= 1) this.end();
  }

  /** Puts it away (and the lit lines back as they were). */
  end() {
    this.t = Infinity;
    this.root.visible = false;
    this.lines.color.copy(this.dim);
  }
}
