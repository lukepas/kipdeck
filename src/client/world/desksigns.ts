import * as THREE from 'three';
import { DESK_BY_ID, DESK_SIZE, type DeskDef } from '../../shared/layout';
import type { DeskLabel } from '../../shared/floorplan';
import { deskPoint } from '../../shared/nav';
import type { Fixture } from './office/fixture';
import { DECK } from './office/materials';
import { fontsReady } from './toon';
import { sharp } from './sharp';

// What a console is for ("Operations", "Code cleanup", see shared/floorplan.ts), stencilled on the
// floor on its table side as a tag: its color as a stripe, its words in the UI face. Paint, not a
// sign: nothing hangs between the table and the consoles. It reads the right way up from the console's
// stool, and from across the deck in the Overview.

/** How big a tag is, and how far in from its console's middle (toward the table) it lies. */
export const SIGN = { width: 1.4, depth: 0.36, inset: DESK_SIZE.depth / 2 + 0.5 } as const;

const PX = 400;

/** The tag's face: a hairline box, a stripe in its color, and the text as large as fits. */
function paintFace(canvas: HTMLCanvasElement, label: DeskLabel) {
  const w = Math.round(SIGN.width * PX);
  const h = Math.round(SIGN.depth * PX);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(13,19,26,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = DECK.steel;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  ctx.fillStyle = label.color;
  ctx.fillRect(0, 0, 12, h);
  ctx.fillStyle = DECK.text;
  ctx.textBaseline = 'middle';
  let size = 72;
  const text = label.text.toUpperCase();
  for (; size > 28; size -= 4) {
    ctx.font = `600 ${size}px Archivo, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= w - 60) break;
  }
  ctx.font = `600 ${size}px Archivo, system-ui, sans-serif`;
  let t = text;
  while (t.length > 3 && ctx.measureText(t).width > w - 60) t = `${t.slice(0, -2)}.`;
  ctx.fillText(t, 34, h / 2 + 2);
}

interface Hung {
  root: THREE.Mesh;
  key: string;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  label: DeskLabel;
}

export interface DeskSigns {
  group: THREE.Group;
  /** Lays a tag for each of `labels` by the consoles `built` says are there (the overflow bay's may not be yet). */
  set(labels: Record<string, DeskLabel>, built: (desk: DeskDef) => boolean): void;
  /** The tag by a console, if it has one. */
  get(deskId: string): THREE.Object3D | undefined;
}

export function buildDeskSigns(): DeskSigns {
  const group = new THREE.Group();
  const hung = new Map<string, Hung>();

  const make = (desk: DeskDef, label: DeskLabel): Hung => {
    const canvas = document.createElement('canvas');
    paintFace(canvas, label);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    sharp(tex);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const root = new THREE.Mesh(new THREE.PlaneGeometry(SIGN.width, SIGN.depth).rotateX(-Math.PI / 2), mat);
    const [x, z] = deskPoint(desk, 0, -SIGN.inset);
    root.position.set(x, 0.007, z);
    root.rotation.y = desk.rotY;
    root.renderOrder = 1;
    root.receiveShadow = true;
    group.add(root);
    return { root, key: keyOf(label), canvas, tex, label };
  };

  const keyOf = (label: DeskLabel) => `${label.text}|${label.color}`;
  const drop = (h: Hung) => {
    h.root.removeFromParent();
    h.root.geometry.dispose();
    (h.root.material as THREE.Material).dispose();
    h.tex.dispose();
  };

  // The type may still be on its way the first time a tag is painted.
  void fontsReady().then(() => {
    for (const h of hung.values()) {
      paintFace(h.canvas, h.label);
      h.tex.needsUpdate = true;
    }
  });

  return {
    group,
    get: (deskId) => hung.get(deskId)?.root,
    set(labels, built) {
      for (const [id, h] of hung) {
        const l = labels[id];
        if (l && keyOf(l) === h.key) continue;
        drop(h);
        hung.delete(id);
      }
      for (const [id, label] of Object.entries(labels)) {
        const desk = DESK_BY_ID.get(id);
        if (!desk) continue;
        let h = hung.get(id);
        if (!h) hung.set(id, (h = make(desk, label)));
        h.root.visible = built(desk);
      }
    },
  };
}

declare module './types' {
  interface OfficeHandles {
    /** The tags on the floor by the consoles (see shared/floorplan.ts). */
    signs: DeskSigns;
  }
}

/** The tags by the consoles. */
export const signs: Fixture<'signs'> = () => {
  const built = buildDeskSigns();
  return { group: built.group, handle: { signs: built } };
};
