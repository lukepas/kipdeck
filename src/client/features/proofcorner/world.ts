import * as THREE from 'three';
import { FLOOR, PROOF_CORNER } from '../../../shared/layout';
import { mesh, textPlane } from '../../world/toon';
import type { Fixture } from '../../world/office/fixture';
import { DECK, box, contactShadow, flat, matte, practical } from '../../world/office/materials';

// The Proof corner on the west wall, south of the capacity panel: everything on the deck that is
// about proof on chain, and the only violet in the room. The attestation rail on the wall lights one
// segment per merge (a tally that grows), the escrow vault's lid lifts as a bounty is released, and
// the reputation plinth lights a step for each unit with an ERC-8004 record.

export interface ProofCorner {
  /** Lights one segment of the rail per merge attested, up to the rail's length (then all of them). */
  setTally(merged: number): void;
  /** The vault holds a bounty in escrow: its seam glows. */
  setArmed(armed: boolean): void;
  /** Lifts the vault's lid, 0 shut to 1 up 8 cm and tipped back (see index.ts for when). */
  setLid(open: number): void;
  /** Lights the plinth's steps from the bottom, one per unit with a reputation record. */
  setReputation(units: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The Proof corner: the rail, the vault and the plinth (see features/proofcorner). */
    proof: ProofCorner;
  }
}

/** A small mono caption flat on the wall or a face. */
function caption(text: string, color: string = DECK.muted): ReturnType<typeof textPlane> {
  const c = textPlane(text, { face: 'mono', size: 40, color });
  c.scale.multiplyScalar(0.55);
  return c;
}

export const proofCorner: Fixture<'proof'> = (site) => {
  const group = new THREE.Group();
  const violet = practical(DECK.proof);
  const unlit = matte(DECK.console);
  const wallX = FLOOR.minX + 0.03;

  // The rail: a dark spine on the wall and its segments, bottom to top.
  const { rail } = PROOF_CORNER;
  const railH = rail.y1 - rail.y0;
  group.add(mesh(box(0.04, railH + 0.12, rail.width + 0.08), matte(DECK.wallReveal), wallX, (rail.y0 + rail.y1) / 2, rail.z, false));
  const seg = railH / rail.segments;
  const segments: THREE.Mesh[] = [];
  for (let i = 0; i < rail.segments; i++) {
    const s = mesh(box(0.03, seg * 0.72, rail.width - 0.06), unlit, wallX + 0.03, rail.y0 + (i + 0.5) * seg, rail.z, false);
    group.add(s);
    segments.push(s);
  }
  const head = textPlane('PROOF', { face: 'display', size: 56, color: DECK.proof, track: 0.12 });
  head.scale.multiplyScalar(0.7);
  head.position.set(wallX + 0.05, rail.y1 + 0.3, rail.z);
  head.rotation.y = Math.PI / 2;
  group.add(head);
  let count = caption('0 merged', DECK.proof);
  count.position.set(wallX + 0.05, rail.y0 - 0.22, rail.z);
  count.rotation.y = Math.PI / 2;
  group.add(count);

  // The vault: a low console against the wall, its lid hinged at the back.
  const v = PROOF_CORNER.vault;
  const vault = new THREE.Group();
  vault.position.set(v.x, 0, v.z);
  vault.add(mesh(box(v.width - 0.1, v.height - 0.1, v.depth - 0.1), flat(DECK.console), 0, (v.height - 0.1) / 2, 0));
  vault.add(mesh(box(v.width, 0.04, v.depth), matte(DECK.wallReveal), 0, 0.02, 0, false));
  // The lid's hinge is along its back edge, toward the wall (-x).
  const hinge = new THREE.Group();
  hinge.position.set(-v.width / 2, v.height - 0.1, 0);
  const lid = mesh(box(v.width, 0.1, v.depth), flat(DECK.consoleTop), v.width / 2, 0.05, 0);
  hinge.add(lid);
  vault.add(hinge);
  const seamMat = new THREE.MeshBasicMaterial({ color: DECK.proof, toneMapped: false, transparent: true, opacity: 0.25 });
  const seam = mesh(box(0.012, 0.012, v.depth - 0.04), seamMat, v.width / 2 - 0.04, v.height - 0.1, 0, false);
  vault.add(seam);
  const glow = new THREE.PointLight(DECK.proof, 0, 2.2, 2);
  glow.position.set(0.2, v.height + 0.1, 0);
  vault.add(glow);
  const vaultCap = caption('ESCROW  DEVNET');
  vaultCap.position.set(v.width / 2 - 0.045, v.height * 0.55, 0);
  vaultCap.rotation.y = Math.PI / 2;
  vault.add(vaultCap);
  vault.add(contactShadow(v.width + 0.7, v.depth + 0.7));
  group.add(vault);
  site.colliders.push({ minX: FLOOR.minX, maxX: v.x + v.width / 2, minZ: v.z - v.depth / 2, maxZ: v.z + v.depth / 2, top: v.height });

  // The plinth: steps narrowing upward, each with an edge that lights.
  const p = PROOF_CORNER.plinth;
  const plinth = new THREE.Group();
  plinth.position.set(p.x, 0, p.z);
  const edges: THREE.Mesh[] = [];
  for (let i = 0; i < p.steps; i++) {
    const w = p.width - i * 0.22;
    const d = p.depth - i * 0.22;
    plinth.add(mesh(box(w, p.rise, d), flat(i % 2 ? DECK.consoleTop : DECK.console), 0, (i + 0.5) * p.rise, 0));
    const e = mesh(box(0.012, 0.012, d), unlit, w / 2, (i + 1) * p.rise, 0, false);
    plinth.add(e);
    edges.push(e);
  }
  const plinthCap = caption('ERC-8004');
  plinthCap.position.set(p.width / 2 + 0.005, p.rise / 2, 0);
  plinthCap.rotation.y = Math.PI / 2;
  plinth.add(plinthCap);
  plinth.add(contactShadow(p.width + 0.7, p.depth + 0.7));
  group.add(plinth);
  site.colliders.push({ minX: FLOOR.minX, maxX: p.x + p.width / 2, minZ: p.z - p.depth / 2, maxZ: p.z + p.depth / 2, top: p.steps * p.rise });
  site.group.add(group);

  let tally = -1;
  const proof: ProofCorner = {
    setTally(merged) {
      if (merged === tally) return;
      tally = merged;
      segments.forEach((s, i) => (s.material = i < merged ? violet : unlit));
      group.remove(count);
      count.material.map?.dispose();
      count = caption(`${merged} merged`, DECK.proof);
      count.position.set(wallX + 0.05, rail.y0 - 0.22, rail.z);
      count.rotation.y = Math.PI / 2;
      group.add(count);
    },
    setArmed(armed) {
      seamMat.opacity = armed ? 0.9 : 0.25;
    },
    setLid(open) {
      const k = Math.max(0, Math.min(1, open));
      hinge.position.y = v.height - 0.1 + k * 0.08;
      hinge.rotation.z = k * 0.35;
      glow.intensity = k * 3;
    },
    setReputation(units) {
      edges.forEach((e, i) => (e.material = i < units ? violet : unlit));
    },
  };
  return { handle: { proof } };
};
