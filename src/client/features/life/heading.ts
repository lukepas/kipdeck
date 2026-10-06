import * as THREE from 'three';
import { MISSION_TABLE } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK } from '../../world/office/materials';
import { sharp } from '../../world/sharp';

// The holo table's heading: one caption on a dark plate at the table's lip on the conn's side, tilted
// up to the captain's chair, that says where the ship is making for and how far it has come ("AUTH
// REWRITE  2/4  40%"); and a progress ring on the table's top, an arc from the bow round as far as the
// waypoint has come. The caption is a plate, not light: solid, so it reads against whatever the holo
// is doing behind it.

export interface HoloHeading {
  /** What the caption says, and how far round the ring goes (0-1, none without a measure). */
  set(caption: string, progress: number | undefined): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The holo table's caption plate and progress ring (features/life). */
    heading: HoloHeading;
  }
}

/** The plate: how wide and tall (m), how far out from the table's middle toward the conn, how high over its top, its tilt back. */
export const PLATE = { w: 2.6, h: 0.34, out: MISSION_TABLE.r - 0.12, y: 0.22, tilt: 0.25 } as const;
/** The progress ring on the tabletop, out past the emitter. */
const RING = { inner: MISSION_TABLE.r * 0.72 + 0.36, outer: MISSION_TABLE.r * 0.72 + 0.44 } as const;
/** Canvas pixels a metre of plate. */
const PX = 420;

const UI = (weight: number, size: number) => `${weight} ${size}px Archivo, system-ui, sans-serif`;

function light(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: DECK.ship, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
}

/** The caption on its plate: instrument black, a ship-cyan rule over it, the words centred in white. */
function paintPlate(g: CanvasRenderingContext2D, W: number, H: number, caption: string) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(8,13,19,0.94)';
  g.fillRect(0, 0, W, H);
  g.fillStyle = DECK.ship;
  g.fillRect(0, 0, W, 5);
  g.fillStyle = DECK.shipDim;
  g.fillRect(0, H - 3, W, 3);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = DECK.text;
  let size = Math.round(H * 0.5);
  g.font = UI(700, size);
  g.letterSpacing = `${Math.round(H * 0.05)}px`;
  while (size > 12 && g.measureText(caption).width > W - 40) {
    size -= 2;
    g.font = UI(700, size);
  }
  g.fillText(caption, W / 2, H * 0.54);
  g.letterSpacing = '0px';
}

export const heading: Fixture<'heading'> = (site) => {
  const root = new THREE.Group();
  root.position.set(MISSION_TABLE.x, MISSION_TABLE.h, MISSION_TABLE.z);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PLATE.w * PX);
  canvas.height = Math.round(PLATE.h * PX);
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  sharp(texture);
  // At the lip on the conn's side (+z), leaning back so its face looks up the aisle to the chair.
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(PLATE.w, PLATE.h), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, fog: false }));
  plate.position.set(0, PLATE.y, PLATE.out);
  plate.rotation.x = -PLATE.tilt;
  plate.renderOrder = 4;
  plate.name = 'holo-caption';
  root.add(plate);

  const track = new THREE.Mesh(new THREE.RingGeometry(RING.inner, RING.outer, 128).rotateX(-Math.PI / 2), light(0.06));
  track.position.y = 0.013;
  root.add(track);
  const arcMat = light(0.6);
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), arcMat);
  arc.position.y = 0.014;
  root.add(arc);
  root.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  track.renderOrder = 3;
  arc.renderOrder = 3;
  root.name = 'life-heading';
  site.group.add(root);

  let key = '';
  const set = (caption: string, progress: number | undefined) => {
    const k = JSON.stringify([caption, progress]);
    if (k === key) return;
    key = k;
    paintPlate(g, canvas.width, canvas.height, caption);
    texture.needsUpdate = true;
    arc.geometry.dispose();
    const p = Math.max(0, Math.min(1, progress ?? 0));
    // From the bow (-z), clockwise as seen from above; a sliver at 0% so the start reads.
    arc.geometry = new THREE.RingGeometry(RING.inner, RING.outer, 128, 1, Math.PI / 2, -Math.max(0.02, p) * Math.PI * 2).rotateX(-Math.PI / 2);
    arc.visible = progress !== undefined;
  };
  set('NO COURSE SET', undefined);
  return { handle: { heading: { set } } };
};
