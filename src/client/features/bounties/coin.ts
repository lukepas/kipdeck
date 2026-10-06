import * as THREE from 'three';

// The bounty token every part of the room draws: a hexagonal coin of proof's violet light, hollow in the
// middle and bright at its rim, so it reads as a hologram and not a gold piece. One geometry and one pair
// of materials (its side band and its faces) for every coin on the deck, the vault's stacks, the Issues
// board's and the payout's alike; each set of them is one instanced mesh, coloured per instance.

/** A coin's radius and thickness (m). */
export const COIN = { r: 0.075, h: 0.024, gap: 0.006 } as const;

let shared: { geometry: THREE.CylinderGeometry; materials: THREE.MeshBasicMaterial[] } | undefined;

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A coin's face: a bright hexagonal rim, a second hex inside it, a faint fill and a mark in the middle. */
function faceTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    const hex = (r: number) => {
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        const x = 64 + Math.cos(a) * r;
        const y = 64 + Math.sin(a) * r;
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
    };
    hex(60);
    g.fillStyle = 'rgba(255,255,255,0.32)';
    g.fill();
    g.lineJoin = 'miter';
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 9;
    hex(56);
    g.stroke();
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    hex(36);
    g.stroke();
    // The mark: a small solid diamond, the token's own, never a state's glyph.
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(64, 50);
    g.lineTo(76, 64);
    g.lineTo(64, 78);
    g.lineTo(52, 64);
    g.closePath();
    g.fill();
  });
}

/** A coin's edge: bright lines along both lips over a dimmer band, so a stack reads coin by coin. */
function sideTexture(): THREE.CanvasTexture {
  return canvasTexture(4, 32, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.42)';
    g.fillRect(0, 0, 4, 32);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.fillRect(0, 0, 4, 5);
    g.fillRect(0, 27, 4, 5);
  });
}

/** The one coin geometry and its materials: [side, faces]. */
export function coinParts(): { geometry: THREE.CylinderGeometry; materials: THREE.MeshBasicMaterial[] } {
  if (shared) return shared;
  const mat = (map: THREE.Texture) =>
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, opacity: 0.95 });
  const face = mat(faceTexture());
  const geometry = new THREE.CylinderGeometry(COIN.r, COIN.r, COIN.h, 6, 1);
  // The two faces are one group (their indices run on from each other), so a set of coins is two draws, not three.
  const [side, top, bottom] = geometry.groups;
  geometry.clearGroups();
  geometry.addGroup(side.start, side.count, 0);
  geometry.addGroup(top.start, top.count + bottom.count, 1);
  shared = { geometry, materials: [mat(sideTexture()), face] };
  return shared;
}

/** An instanced set of up to `n` coins, none drawn until placed. */
export function coins(n: number): THREE.InstancedMesh {
  const { geometry, materials } = coinParts();
  const m = new THREE.InstancedMesh(geometry, materials, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.renderOrder = 7;
  return m;
}

/** A soft column of light rising off a pad, bright at its foot and gone at its top: the stacks' projector beams. */
export function beamMaterial(color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  const map = canvasTexture(4, 64, (g) => {
    const grad = g.createLinearGradient(0, 64, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
  });
  return new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
}
