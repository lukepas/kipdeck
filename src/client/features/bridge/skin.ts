import * as THREE from 'three';
import { FLOOR, WALL_HEIGHT, WALL_T, WING } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK, hullPanels, matteUnique } from '../../world/office/materials';
import { OUTLINE } from './hull';
import { OUTSIDE_LAYER } from './shapes';

// The ship's skin round the bridge, seen from outside (the Overview, the aft glass): a sloped skirt
// of plating from the foot of the walls down and out to the hull's edge all round, rising at the bow
// into a glacis under the forward viewport; an armoured brow along the top of the walls, chamfered
// back; and running lights at the hull's extremities, red to port and green to starboard as ships
// have them, with a white strobe at the bow and on the nacelles. The red and green are drawn for the
// Overview's camera only (OUTSIDE_LAYER), so no state's hue is ever seen from the deck.

/** The running lights, which blink while the ship moves and hold steady when motion is off. */
export interface RunningLights {
  /** Holds them steady (motion off) or lets them blink. */
  still(yes: boolean): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The hull's running lights (features/bridge/skin.ts). */
    runningLights: RunningLights;
  }
}

/** Where the walls' outer faces are (m from the middle). */
const OUT = FLOOR.maxX + WALL_T;
/** How high the skirt meets each wall: under the low ports, and at the bow under the forward glass. */
const MEET = { side: 0.62, bow: 2.3, stern: 0.32 } as const;
/** The skirt's foot: just under the hull plate's top edge. */
const FOOT = -0.3;
/** The brow: how far it stands out from the wall, and how far down it reaches. */
const BROW = { out: 0.75, drop: 1.0 } as const;

/** Where a point of the hull's outline meets the walls, and how high. */
function onWalls(x: number, z: number): THREE.Vector3 {
  const cx = Math.max(-OUT, Math.min(OUT, x));
  const cz = Math.max(-OUT, Math.min(OUT, z));
  // At the bow (north), under the forward glass but clear of the back office's walls when it's built.
  const bow = z < -OUT + 0.01 && Math.abs(cx) < OUT - 0.01 && cx < WING.minX - 1;
  const stern = z > OUT - 0.01 && Math.abs(cx) < OUT - 0.01;
  return new THREE.Vector3(cx, bow ? MEET.bow : stern ? MEET.stern : MEET.side, cz);
}

/** The skirt: a loft from the hull's outline (its foot) up to where each point meets the walls. */
function skirt(): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = OUTLINE.length;
  const foot = OUTLINE.map(([x, z]) => new THREE.Vector3(x * 0.985, FOOT, z * 0.985));
  const top = OUTLINE.map(([x, z]) => onWalls(x, z));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Two triangles, wound so their faces point out and up.
    pos.push(...foot[i].toArray(), ...top[i].toArray(), ...foot[j].toArray());
    pos.push(...foot[j].toArray(), ...top[i].toArray(), ...top[j].toArray());
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** The brow along one wall: a wedge `len` long standing out of the wall's top, chamfered back down to it. Built for the east wall, then turned. */
function brow(len: number, along: number, rotY: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, WALL_HEIGHT + 0.08);
  shape.lineTo(BROW.out, WALL_HEIGHT - 0.2);
  shape.lineTo(BROW.out * 0.8, WALL_HEIGHT - BROW.drop * 0.6);
  shape.lineTo(0, WALL_HEIGHT - BROW.drop);
  shape.lineTo(0, WALL_HEIGHT + 0.08);
  // Extruded along +z, then laid along the wall: x out of the wall, z along it.
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  geo.translate(OUT, 0, along);
  geo.rotateY(rotY);
  geo.deleteAttribute('uv');
  return geo;
}

/** A running light: a small bright bead and a soft glow round it. */
function light(color: string, size: number): { root: THREE.Group; glow: THREE.SpriteMaterial; bead: THREE.MeshBasicMaterial } {
  const root = new THREE.Group();
  const bead = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  root.add(new THREE.Mesh(new THREE.SphereGeometry(0.09 * size, 10, 8), bead));
  const glow = new THREE.SpriteMaterial({ map: glowDot(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const s = new THREE.Sprite(glow);
  s.scale.setScalar(1.3 * size);
  root.add(s);
  return { root, glow, bead };
}

let dotTex: THREE.CanvasTexture | undefined;
function glowDot(): THREE.CanvasTexture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

/** The colors of the running lights: port red, starboard green, the strobes white. Hull only. */
export const RUNNING = { port: '#FF3B30', starboard: '#30D158', strobe: '#F2FAFF' } as const;

export const skin: Fixture<'runningLights'> = (site) => {
  const g = new THREE.Group();
  const plate = hullPanels(matteUnique(DECK.hullSeam, { metalness: 0.3, roughness: 0.62 }));
  // Seen from above and from under the canopy's edge alike, whichever way a face was wound.
  plate.side = THREE.DoubleSide;
  const skirtMesh = new THREE.Mesh(skirt(), plate);
  skirtMesh.receiveShadow = true;
  g.add(skirtMesh);
  const span = 2 * OUT;
  const brows = [brow(span, -OUT, 0), brow(span, -OUT, Math.PI)];
  // Along the north wall as far as the back office, whose walls stand on their own.
  const north = WING.minX + OUT;
  brows.push(brow(north, -OUT, Math.PI / 2));
  for (const geo of brows) {
    const m = new THREE.Mesh(geo, plate);
    m.receiveShadow = true;
    g.add(m);
  }

  // The running lights: port and starboard at the hull's widest, on the brow's corners, a strobe at the bow and on each nacelle's tail.
  const steady: { glow: THREE.SpriteMaterial; bead: THREE.MeshBasicMaterial; phase: number }[] = [];
  const strobes: { glow: THREE.SpriteMaterial; bead: THREE.MeshBasicMaterial; phase: number }[] = [];
  const put = (color: string, x: number, y: number, z: number, size: number, strobe: boolean, phase: number) => {
    const l = light(color, size);
    l.root.position.set(x, y, z);
    // Red and green only from outside (the Overview): never seen from the deck through a port.
    if (!strobe) l.root.traverse((o) => o.layers.set(OUTSIDE_LAYER));
    g.add(l.root);
    (strobe ? strobes : steady).push({ glow: l.glow, bead: l.bead, phase });
  };
  put(RUNNING.port, -20.4, -0.2, 1, 1.4, false, 0);
  put(RUNNING.starboard, 20.4, -0.2, 1, 1.4, false, 0);
  put(RUNNING.port, -OUT - BROW.out, WALL_HEIGHT - 0.2, -OUT, 1, false, 0.5);
  put(RUNNING.starboard, OUT + BROW.out, WALL_HEIGHT - 0.2, -OUT, 1, false, 0.5);
  put(RUNNING.strobe, 0, 0.15, -29.8, 1.2, true, 0);
  put(RUNNING.strobe, -13, 1.85, 32.5, 0.6, true, 0.15);
  put(RUNNING.strobe, 13, 1.85, 32.5, 0.6, true, 0.15);
  site.group.add(g);

  let still = false;
  const color = new THREE.Color();
  const shade = (l: (typeof steady)[number], k: number) => {
    l.glow.opacity = k;
    l.bead.color.set(color.copy(l.glow.color).multiplyScalar(0.35 + 0.65 * k));
  };
  return {
    handle: { runningLights: { still: (yes) => void (still = yes) } },
    update(t) {
      for (const l of steady) shade(l, still ? 0.85 : 0.6 + 0.4 * Math.max(0, Math.sin((t / 2.4 + l.phase) * Math.PI * 2)));
      // The strobes: a double flash every 1.8 s.
      for (const l of strobes) {
        const p = (t / 1.8 + l.phase) % 1;
        shade(l, still ? 0.5 : p < 0.05 || (p > 0.12 && p < 0.17) ? 1 : 0.08);
      }
    },
  };
};
