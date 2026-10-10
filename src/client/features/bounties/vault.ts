import * as THREE from 'three';
import { PROOF_CORNER } from '../../../shared/layout';
import { DECK } from '../../world/office/materials';
import { PANEL } from '../boards/world';
import { INK, MONO, UI, screen, type Screen } from '../boards/screen';
import { chip, chipWidth, label } from '../boards/table';
import { phaseChip } from '../proofcorner/ledger';
import { COIN, beamMaterial, coins } from './coin';
import { MAX_COINS, MAX_STACKS, type Stack, type StackShape, type VaultView } from './logic';

// The vault's hologram: over the escrow vault on the Proof corner, a stack of violet coins for every
// bounty still held, as tall as its amount, standing in its own beam of light; its state as a shape round
// it (a clamp ring once a unit has claimed it, a hollow amber ring with the review dot while it waits on
// an admin, a red hollow triangle when it's blocked, lifted off its beam while it's paying out); and over
// the stacks a label in a column each: the issue, the amount and the state's chip, under a header with
// the network (always a testnet, said in words) and what's held and paid in all. Built once; the coins
// only move when a bounty changes (a funding drops its coins in), never to idle.

/** Where the stacks stand: over the lid near its hinge (so the lid lifting on a release clears them), and how far apart. */
export const HOLO = {
  x: PROOF_CORNER.vault.x - 0.25,
  y: PROOF_CORNER.vault.height + 0.26,
  z: PROOF_CORNER.vault.z,
  spacing: 0.31,
  /** The label: its middle's height over the deck, its size (m) and canvas units a metre. */
  label: { y: 1.95, width: 1.96, height: 0.52, units: 400 },
} as const;

/** How fast coins drop onto a stack (coins a second), and how far above it a new one starts (m). */
const DROP = { rate: 9, from: 0.35 } as const;
/** How far a paying stack lifts off its beam (m). */
const LIFT = 0.07;
/** The vault's coins are a little bigger than the board's own, to read from across the corner. */
const K = 1.2;
const STEP = (COIN.h + COIN.gap) * K;

interface Col {
  issue: number;
  shape: StackShape;
  coins: number;
  /** Coins shown now, easing toward `coins`. */
  shown: number;
  lift: number;
}

/** A thin ring lying flat: `sides` 6 for the claim's hex clamp, 3 for the blocked triangle, many for the review ring. */
function ring(radius: number, sides: number, color: string, n: number): THREE.InstancedMesh {
  const geo = new THREE.TorusGeometry(radius, 0.009, 4, sides).rotateX(Math.PI / 2);
  if (sides === 3) geo.rotateY(Math.PI / 2);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false }), n);
  m.count = 0;
  m.visible = false;
  m.renderOrder = 7;
  return m;
}

export class VaultHolo {
  readonly root = new THREE.Group();
  private readonly coins = coins(MAX_STACKS * MAX_COINS);
  private readonly beams: THREE.InstancedMesh;
  private readonly clamps = ring(COIN.r + 0.022, 6, DECK.proof, MAX_STACKS);
  private readonly reviews = ring(0.15, 40, PANEL.review, MAX_STACKS * 2);
  private readonly blocks = ring(0.17, 3, PANEL.stuck, MAX_STACKS);
  private readonly screen: Screen;
  private readonly label: THREE.Mesh;
  private cols: Col[] = [];
  /** Held bounties past the room on the vault: a column of their own on the label. */
  private more = 0;
  private painted = '';
  private seeded = false;
  private dirty = true;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(K, K, K);
  private readonly v = new THREE.Vector3();
  private readonly violet = new THREE.Color(DECK.proof);

  constructor() {
    this.root.position.set(HOLO.x, 0, HOLO.z);
    // A narrow cone of light flaring up from the lid to the stack's foot, not a pedestal.
    const beamGeo = new THREE.CylinderGeometry(COIN.r * K, COIN.r * 0.35, 1, 6, 1, true).translate(0, 0.5, 0);
    this.beams = new THREE.InstancedMesh(beamGeo, beamMaterial(DECK.proof), MAX_STACKS);
    this.beams.count = 0;
    this.beams.visible = false;
    this.beams.renderOrder = 6;
    const L = HOLO.label;
    this.screen = screen(L.width, L.height, L.units, 1.25);
    this.label = new THREE.Mesh(
      new THREE.PlaneGeometry(L.width, L.height),
      new THREE.MeshBasicMaterial({ map: this.screen.texture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.label.position.set(0.02, L.y, 0);
    this.label.rotation.y = Math.PI / 2;
    this.label.renderOrder = 8;
    this.label.name = 'escrow-holo-label';
    this.coins.frustumCulled = true;
    this.root.add(this.beams, this.coins, this.clamps, this.reviews, this.blocks, this.label);
    this.root.visible = false;
  }

  /** Where stack `i` of `n` stands along the wall (z, relative to the vault's middle). */
  private static zOf(i: number, n: number): number {
    return ((n - 1) / 2 - i) * HOLO.spacing;
  }

  /** Shows `v`: new bounties' coins drop in (all at once on the first paint, or with `still`). */
  set(v: VaultView, still: boolean) {
    this.root.visible = v.on;
    const old = new Map(this.cols.map((c) => [c.issue, c]));
    this.cols = v.stacks.map((s: Stack) => {
      const was = old.get(s.issue);
      const shown = !this.seeded || still ? s.coins : Math.min(was?.shown ?? 0, s.coins);
      return { issue: s.issue, shape: s.shape, coins: s.coins, shown, lift: was?.lift ?? 0 };
    });
    this.more = v.more;
    this.seeded = true;
    this.dirty = true;
    const key = JSON.stringify(v);
    if (key !== this.painted) {
      this.painted = key;
      this.paint(v);
    }
  }

  /** Moves the coins on: drops still on their way, a paying stack lifting. True while anything moves. */
  step(dt: number, still: boolean): boolean {
    let moving = false;
    for (const c of this.cols) {
      if (c.shown < c.coins) {
        c.shown = still ? c.coins : Math.min(c.coins, c.shown + dt * DROP.rate);
        moving = true;
      } else if (c.shown > c.coins) c.shown = c.coins;
      const lift = c.shape === 'paying' ? LIFT : 0;
      if (Math.abs(lift - c.lift) > 1e-4) {
        c.lift = still ? lift : c.lift + (lift - c.lift) * Math.min(1, dt * 6);
        moving = true;
      }
    }
    if (moving || this.dirty) this.layout();
    this.dirty = false;
    return moving;
  }

  private layout() {
    const n = this.cols.length + (this.more ? 1 : 0);
    let k = 0;
    let clamps = 0;
    let reviews = 0;
    let blocks = 0;
    this.q.identity();
    this.cols.forEach((c, i) => {
      const z = VaultHolo.zOf(i, n);
      const base = HOLO.y + c.lift;
      const whole = Math.floor(c.shown);
      const part = c.shown - whole;
      // The beam: from the lid up through the stack.
      this.s.set(1, base - PROOF_CORNER.vault.height, 1);
      this.m.compose(this.v.set(0, PROOF_CORNER.vault.height, z), this.q, this.s);
      this.beams.setMatrixAt(i, this.m);
      this.s.set(K, K, K);
      for (let j = 0; j < Math.ceil(c.shown) && k < this.coins.instanceMatrix.count; j++) {
        // The coin still dropping comes down from above its place.
        const fall = j === whole ? (1 - part) * (1 - part) * DROP.from : 0;
        this.m.compose(this.v.set(0, base + (COIN.h * K) / 2 + j * STEP + fall, z), this.q, this.s);
        this.coins.setMatrixAt(k, this.m);
        this.coins.setColorAt(k, this.violet);
        k++;
      }
      const mid = base + (Math.max(1, c.coins) * STEP) / 2;
      if (c.shape === 'claimed') {
        this.m.compose(this.v.set(0, mid, z), this.q, this.s);
        this.clamps.setMatrixAt(clamps++, this.m);
      } else if (c.shape === 'approve') {
        // The review glyph laid flat: a hollow ring round the stack's foot and a small one at its top.
        this.m.compose(this.v.set(0, base - 0.01, z), this.q, this.s);
        this.reviews.setMatrixAt(reviews++, this.m);
        this.m.compose(this.v.set(0, base + Math.max(1, c.coins) * STEP + 0.03, z), this.q, this.s.set(0.25, 1, 0.25));
        this.reviews.setMatrixAt(reviews++, this.m);
        this.s.set(K, K, K);
      } else if (c.shape === 'blocked') {
        this.m.compose(this.v.set(0, base - 0.01, z), this.q, this.s);
        this.blocks.setMatrixAt(blocks++, this.m);
      }
    });
    this.coins.count = k;
    this.beams.count = this.cols.length;
    this.clamps.count = clamps;
    this.reviews.count = reviews;
    this.blocks.count = blocks;
    for (const m of [this.coins, this.beams, this.clamps, this.reviews, this.blocks]) {
      m.visible = m.count > 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      // Culled with the rest of the corner when it's out of view (the conn doesn't see it).
      if (m.count) m.computeBoundingSphere();
    }
  }

  /** Where the top of the vault's stacks is, in the world: where a payout's coins rise from. */
  mouth(out: THREE.Vector3): THREE.Vector3 {
    return out.set(HOLO.x, HOLO.y + 0.1, HOLO.z);
  }

  /** The label: a header (ESCROW, the network, held and paid) over a column per stack, lined up with them. */
  private paint(v: VaultView) {
    const { g, W, H } = this.screen;
    g.clearRect(0, 0, W, H);
    if (!v.on) {
      this.screen.texture.needsUpdate = true;
      return;
    }
    const ppm = HOLO.label.units;
    // A faint smoked band behind the words only, so they hold up against the port's stars.
    g.fillStyle = 'rgba(8,12,18,0.8)';
    g.beginPath();
    g.roundRect(0, 0, W, H, 10);
    g.fill();
    g.fillStyle = PANEL.proof;
    g.fillRect(0, 0, W, 4);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = INK.text;
    g.font = UI(700, 30);
    g.letterSpacing = '4px';
    g.fillText('ESCROW', 18, 30);
    const w = g.measureText('ESCROW').width;
    g.letterSpacing = '0px';
    // What's held and paid, measured first so the network's label never runs into it.
    g.textAlign = 'right';
    g.font = MONO(22, 600);
    g.fillStyle = INK.text;
    // The token is said once, by the network's label ("DEVNET  TEST TOKENS"): the sums are amounts alone.
    const bare = (t: string) => t.replace(/ \S+$/, '');
    const sums = `${bare(v.held.total)} held${v.paid.count ? `  ${bare(v.paid.total)} paid` : ''}`;
    g.fillText(sums, W - 18, 31);
    const lx = 18 + w + 16;
    label(g, v.network, lx, 31, 17, 'left', PANEL.proof, W - 18 - g.measureText(sums).width - 16 - lx);
    g.fillStyle = INK.lineStrong;
    g.fillRect(14, 54, W - 28, 2);
    const cols = v.stacks.length + (v.more ? 1 : 0);
    if (!cols) {
      g.textAlign = 'center';
      g.fillStyle = INK.dim;
      g.font = UI(600, 28);
      g.fillText('Nothing in escrow', W / 2, 104);
      g.fillStyle = INK.muted;
      g.font = UI(500, 22);
      g.fillText(v.paid.count ? `${v.paid.count} paid out, ${v.paid.total}` : 'Fund an issue from the Issues board', W / 2, 146);
      this.screen.texture.needsUpdate = true;
      return;
    }
    const colW = HOLO.spacing * ppm;
    v.stacks.forEach((s, i) => {
      const x = W / 2 + (i - (cols - 1) / 2) * colW;
      const hue = s.shape === 'approve' ? PANEL.review : s.shape === 'blocked' ? PANEL.stuck : INK.text;
      g.textAlign = 'center';
      g.fillStyle = hue;
      g.font = UI(700, 30);
      g.fillText(`#${s.issue}`, x, 84);
      g.fillStyle = INK.text;
      g.font = MONO(25, 600);
      g.fillText(s.amount, x, 120);
      g.fillStyle = INK.dim;
      g.font = MONO(16, 500);
      g.fillText(s.symbol, x, 143);
      const c = s.shape === 'funded' ? { ...phaseChip('open'), text: 'funded' } : phaseChip(shapePhase(s.shape));
      const cw = chipWidth(g, c, 18, colW - 6);
      chip(g, c, Math.round(x - cw / 2), 180, 18, colW - 6);
    });
    if (v.more) {
      const x = W / 2 + (cols - 1 - (cols - 1) / 2) * colW;
      g.textAlign = 'center';
      g.fillStyle = INK.dim;
      g.font = MONO(28, 600);
      g.fillText(`+${v.more}`, x, 104);
      g.font = UI(500, 18);
      g.fillText('more held', x, 136);
    }
    this.screen.texture.needsUpdate = true;
  }
}

/** The ledger's chip for a stack's shape (so the label and the ledger say a state the same way). */
function shapePhase(s: Exclude<StackShape, 'funded'>) {
  return s === 'approve' ? 'awaiting-approval' : s;
}
