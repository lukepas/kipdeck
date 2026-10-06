import * as THREE from 'three';
import { drawDone } from '../../world/glyphs';
import { PANEL } from '../boards/world';
import { INK, MONO, UI, UNITS_PER_M, screen, type Screen } from '../boards/screen';
import { coins } from './coin';
import { FLIGHT, FLY, MAX_COINS, coinAt, flightTime, flySize, receiptAlpha, type P3 } from './logic';

// The tokens moving: a coin over each funded issue's row on the Issues board, and a payout's coins
// flying out of the vault over the deck to the console of the unit that earned them, where a receipt
// floats up with the amount, who it went to and the devnet transaction. With less motion there is no
// flight: the receipt is simply there over the console for as long, and gone.

/** How far in front of the board's glass its coins hover (m), and how big they are against a vault coin. */
const BOARD = { out: 0.07, scale: 1.9, max: 8 } as const;

/** A funded row's place on the Issues board: its issue and where its coin goes on the canvas (canvas units). */
export interface Socket {
  number: number;
  x: number;
  y: number;
}

/** The coins hovering over the Issues board's funded rows. */
export class BoardCoins {
  readonly mesh = coins(BOARD.max);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qFace = new THREE.Quaternion();
  private readonly tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  private readonly s = new THREE.Vector3(BOARD.scale, BOARD.scale, BOARD.scale);
  private readonly v = new THREE.Vector3();
  private readonly box = new THREE.Box3();
  private readonly violet = new THREE.Color(PANEL.proof);
  /** What was placed last: the sockets' list (the same array while the board isn't repainted) and the face's place. */
  private placed: readonly Socket[] | null = null;
  private readonly at = new THREE.Matrix4();

  constructor() {
    this.mesh.name = 'issue-bounty-coins';
  }

  /**
   * Puts a coin over each socket on `face` (the Issues board's mesh), whose canvas is `W` units wide;
   * the face shows its canvas's top `face height x UNITS_PER_M` units (boards/fold.ts scales it).
   */
  place(face: THREE.Mesh | undefined, sockets: readonly Socket[], W: number) {
    if (!face || !sockets.length) {
      this.mesh.count = 0;
      this.mesh.visible = false;
      this.placed = null;
      return;
    }
    // Nothing to do while the board's sockets and its place are as they were: no string, no garbage.
    if (sockets === this.placed && face.matrixWorld.equals(this.at)) return;
    this.placed = sockets;
    this.at.copy(face.matrixWorld);
    const geo = face.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    this.box.copy(geo.boundingBox!);
    const gw = this.box.max.x - this.box.min.x;
    const gh = this.box.max.y - this.box.min.y;
    const shown = gh * face.scale.y * UNITS_PER_M;
    face.getWorldQuaternion(this.qFace);
    this.q.copy(this.qFace).multiply(this.tilt);
    let n = 0;
    for (const s of sockets) {
      if (n >= BOARD.max || s.y > shown) continue;
      // The canvas point on the face, then out of the glass toward the room.
      this.v.set((s.x / W - 0.5) * gw, (0.5 - s.y / shown) * gh, 0);
      face.localToWorld(this.v);
      this.v.add(new THREE.Vector3(0, 0, BOARD.out).applyQuaternion(this.qFace));
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.violet);
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** What a payout's receipt says. */
export interface Receipt {
  /** "+50.00 USDC". */
  amount: string;
  /** "to Vega  PR #77". */
  to: string;
  /** "devnet tx 9AbcD...wXyz", or the mock chain's. */
  tx: string;
}

interface Flight {
  from: P3;
  to: P3;
  n: number;
  receipt: Receipt;
  still: boolean;
  t: number;
}

/** The receipt's size (m), its canvas units a metre, and how far over the console it floats: above the unit's own callout. */
const RECEIPT_SIZE = { width: 1.6, height: 0.5, units: 300, over: 2.15 } as const;

/** A payout on its way, and its receipt over the console once it lands. One at a time, the rest wait their turn. */
export class PayoutFlight {
  readonly root = new THREE.Group();
  /** Each coin and its trail (FLY.trail.n fading coins behind it), one draw. */
  private readonly coins = coins(MAX_COINS * (1 + FLY.trail.n));
  private readonly screen: Screen;
  private readonly card: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly queue: Flight[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly violet = new THREE.Color(PANEL.proof);
  private readonly dim = new THREE.Color();
  private readonly eye = new THREE.Vector3();
  private painted: Receipt | null = null;

  constructor() {
    this.coins.name = 'payout-coins';
    const R = RECEIPT_SIZE;
    this.screen = screen(R.width, R.height, R.units, 1.25);
    this.card = new THREE.Mesh(
      new THREE.PlaneGeometry(R.width, R.height),
      new THREE.MeshBasicMaterial({ map: this.screen.texture, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }),
    );
    this.card.renderOrder = 9;
    this.card.visible = false;
    this.card.name = 'payout-receipt';
    this.root.add(this.coins, this.card);
  }

  /** Sends `n` coins from `from` to `to`, then shows `receipt` over `to`; with `still`, only the receipt. */
  start(from: P3, to: P3, n: number, receipt: Receipt, still: boolean) {
    this.queue.push({ from, to, n: Math.min(MAX_COINS, Math.max(1, n)), receipt, still, t: 0 });
  }

  /** Whether a payout is on its way or its receipt is up. */
  get busy(): boolean {
    return this.queue.length > 0;
  }

  /** Moves the flight on `dt` seconds; the receipt turns to face `camera`. */
  step(dt: number, camera: THREE.Camera) {
    const f = this.queue[0];
    if (!f) return;
    f.t += dt;
    const fly = f.still ? 0 : flightTime(f.n);
    // The coins in the air.
    let k = 0;
    if (!f.still && f.t < fly) {
      camera.getWorldPosition(this.eye);
      const T = FLY.trail;
      for (let i = 0; i < f.n; i++) {
        // The coin, then its trail: the same coin a moment back along its path, smaller and dimmer.
        for (let g = 0; g <= T.n; g++) {
          const t = f.t - g * T.gap;
          const { p, k: u } = coinAt(i, t, f.from, f.to);
          if (u <= 0 || u >= 1) continue;
          // Each coin turns over as it flies, as big as reads from where you are, and shrinks into the console as it lands.
          const spin = (t - i * FLIGHT.gap) * 9 + i;
          this.e.set(spin * 0.6, spin, 0.4);
          this.q.setFromEuler(this.e);
          const d = this.v.set(p.x, p.y, p.z).distanceTo(this.eye);
          const size = flySize(d) * (u > 0.85 ? (1 - u) / 0.15 : Math.min(1, u / 0.08)) * (1 - g * T.shrink);
          this.m.compose(this.v, this.q, this.s.setScalar(Math.max(0.001, size)));
          this.coins.setMatrixAt(k, this.m);
          this.coins.setColorAt(k, g ? this.dim.copy(this.violet).multiplyScalar(1 - g * T.dim) : this.violet);
          k++;
        }
      }
    }
    this.coins.count = k;
    this.coins.visible = k > 0;
    if (k) {
      this.coins.instanceMatrix.needsUpdate = true;
      if (this.coins.instanceColor) this.coins.instanceColor.needsUpdate = true;
    }
    // The receipt: from the first coin's landing (at once with less motion).
    const since = f.t - (f.still ? 0 : FLIGHT.s);
    const a = receiptAlpha(since, f.still);
    if (a > 0) {
      if (this.painted !== f.receipt) this.paint(f.receipt);
      this.card.visible = true;
      this.card.material.opacity = a;
      const rise = f.still ? 0 : (1 - Math.min(1, since / 0.6)) * -0.25;
      this.card.position.set(f.to.x, f.to.y + RECEIPT_SIZE.over + rise, f.to.z);
      // Turned toward you about the vertical only, so it stands upright.
      camera.getWorldPosition(this.v);
      this.card.rotation.set(0, Math.atan2(this.v.x - f.to.x, this.v.z - f.to.z), 0);
    } else this.card.visible = false;
    if (f.t > fly + 0.1 && since > 0 && a === 0) {
      this.queue.shift();
      this.card.visible = false;
    }
  }

  private paint(r: Receipt) {
    this.painted = r;
    const { g, W, H } = this.screen;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,12,18,0.88)';
    g.beginPath();
    g.roundRect(0, 0, W, H, 12);
    g.fill();
    g.strokeStyle = PANEL.proof;
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = PANEL.proof;
    g.fillRect(0, 0, W, 5);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = PANEL.proof;
    g.font = MONO(54, 700);
    g.fillText(r.amount, 24, 48);
    g.fillStyle = INK.text;
    g.font = UI(600, 30);
    g.fillText(r.to, 24, 96);
    drawDone(g, 40, 128, 11);
    g.fillStyle = INK.dim;
    g.font = MONO(22, 500);
    g.fillText(r.tx, 62, 129);
    this.screen.texture.needsUpdate = true;
  }
}
