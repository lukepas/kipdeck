import { UPSTREAM_CREDIT_SHORT } from '../../../shared/copy';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BEANBAGS, FLOOR, GRID, MISSION_TABLE, PODS, POD_LETTERS, READY_LINE, TITLE_BLOCK, readySpot } from '../../../shared/layout';
import { fontsReady, stretch } from '../toon';
import type { Fixture } from './fixture';
import { DECK, ink } from './materials';

// What's painted on the deck's floor: the structural grid's column bubbles round its edge (so every
// spot has a cell address, see cellOf), each pod's ready line with its numbered ticks, the Standby
// bench's stencil, and the title block in the south-east corner. Paint, not furniture: nothing here
// stands in anyone's way.

/** Paint just above the floor, lit like it, drawn after it without fighting it. */
function paintMat(map: THREE.Texture, opacity = 1): THREE.MeshStandardMaterial {
  return ink(new THREE.MeshStandardMaterial({ map, transparent: true, opacity, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
}

const solid = (color: string, opacity = 1) =>
  new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });

/** A canvas `w` by `d` meters at `px` pixels a meter, painted by `paint`, lying flat at (x, z), its top edge north. */
export function floorDecal(w: number, d: number, px: number, paint: (g: CanvasRenderingContext2D, W: number, H: number) => void): { mesh: THREE.Mesh; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * px);
  canvas.height = Math.round(d * px);
  const g = canvas.getContext('2d')!;
  paint(g, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // Painted again once the type is in: the first time, it may still be on its way.
  void fontsReady().then(() => {
    g.clearRect(0, 0, canvas.width, canvas.height);
    paint(g, canvas.width, canvas.height);
    texture.needsUpdate = true;
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), paintMat(texture));
  mesh.position.y = 0.006;
  mesh.renderOrder = 1;
  mesh.receiveShadow = true;
  return { mesh, canvas, texture };
}

/**
 * Small decals that never change, painted into one canvas and laid as one mesh: one draw for all of
 * them where each was a draw (and a texture) of its own. Each keeps its own size and place on the floor.
 */
class DecalSheet {
  private items: { w: number; d: number; W: number; H: number; paint: (g: CanvasRenderingContext2D, W: number, H: number) => void; x: number; z: number; turn: number; cx: number; cy: number }[] = [];

  /** A decal `w` by `d` meters at `px` pixels a meter, painted by `paint`, lying at (x, z) turned `turn` about y. */
  add(w: number, d: number, px: number, paint: (g: CanvasRenderingContext2D, W: number, H: number) => void, x: number, z: number, turn = 0) {
    this.items.push({ w, d, W: Math.round(w * px), H: Math.round(d * px), paint, x, z, turn, cx: 0, cy: 0 });
  }

  /** The sheet as one mesh, or null with nothing on it. */
  build(): THREE.Mesh | null {
    if (!this.items.length) return null;
    // Shelves, tallest first, with a gutter so mipmaps don't bleed one decal into the next.
    const PAD = 6;
    const WIDTH = 2048;
    const order = [...this.items].sort((a, b) => b.H - a.H);
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const it of order) {
      if (x + it.W + PAD > WIDTH) {
        x = 0;
        y += shelf + PAD;
        shelf = 0;
      }
      it.cx = x + PAD / 2;
      it.cy = y + PAD / 2;
      x += it.W + PAD;
      shelf = Math.max(shelf, it.H);
    }
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = y + shelf + PAD;
    const g = canvas.getContext('2d')!;
    const paintAll = () => {
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (const it of this.items) {
        g.save();
        g.translate(it.cx, it.cy);
        g.beginPath();
        g.rect(0, 0, it.W, it.H);
        g.clip();
        it.paint(g, it.W, it.H);
        g.restore();
      }
    };
    paintAll();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    void fontsReady().then(() => {
      paintAll();
      texture.needsUpdate = true;
    });
    const CW = canvas.width;
    const CH = canvas.height;
    const geos = this.items.map((it) => {
      const geo = new THREE.PlaneGeometry(it.w, it.d);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (it.cx + uv.getX(i) * it.W) / CW, 1 - (it.cy + (1 - uv.getY(i)) * it.H) / CH);
      return geo.rotateX(-Math.PI / 2).rotateY(it.turn).translate(it.x, 0.006, it.z);
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, paintMat(texture));
    for (const geo of geos) geo.dispose();
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    return mesh;
  }
}

const UI = (weight: number, size: number) => `${weight} ${size}px Archivo, system-ui, sans-serif`;
const MONO = (size: number) => `500 ${size}px "JetBrains Mono", ui-monospace, monospace`;

/** A column bubble: a ruled circle with its letter or number in the wide stencil face. */
function bubble(text: string): (g: CanvasRenderingContext2D, W: number, H: number) => void {
  return (g, W, H) => {
    g.strokeStyle = DECK.steel;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(W / 2, H / 2, W / 2 - 8, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = DECK.muted;
    g.font = UI(700, 64);
    stretch(g, true);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 4);
  };
}

/** The column bubbles: letters along the north and south edges, numbers down the west and east, a short tick at each column line. */
function gridMarks(group: THREE.Group, sheet: DecalSheet) {
  const inset = 0.75;
  const tickMat = solid(DECK.steel);
  for (let c = 0; c < GRID.cols.length; c++) {
    const x = FLOOR.minX + (c + 0.5) * GRID.step;
    for (const z of [FLOOR.minZ + inset, FLOOR.maxZ - inset]) sheet.add(0.9, 0.9, 160, bubble(GRID.cols[c]), x, z);
  }
  for (let r = 0; r < GRID.rows; r++) {
    const z = Math.min(FLOOR.maxZ - inset, FLOOR.minZ + (r + 0.5) * GRID.step);
    for (const x of [FLOOR.minX + inset, FLOOR.maxX - inset]) sheet.add(0.9, 0.9, 160, bubble(String(r + 1)), x, z);
  }
  // Where each column line meets the edge: a tick 1.2 m in from the wall.
  for (let x = FLOOR.minX + GRID.step; x < FLOOR.maxX - 0.01; x += GRID.step) {
    for (const z of [FLOOR.minZ + 0.6, FLOOR.maxZ - 0.6]) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 1.2).rotateX(-Math.PI / 2), tickMat);
      t.position.set(x, 0.005, z);
      group.add(t);
    }
  }
  for (let z = FLOOR.minZ + GRID.step; z < FLOOR.maxZ - 0.01; z += GRID.step) {
    for (const x of [FLOOR.minX + 0.6, FLOOR.maxX - 0.6]) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.03).rotateX(-Math.PI / 2), tickMat);
      t.position.set(x, 0.005, z);
      group.add(t);
    }
  }
}

/** An arc of floor paint `width` wide at radius `r` round the table, from world angle `a0` to `a1`. */
function arc(r: number, width: number, a0: number, a1: number, mat: THREE.Material): THREE.Mesh {
  // A ring lies in its own xy plane; laid flat (-x turn) its angle runs the other way round in the world.
  const geo = new THREE.RingGeometry(r - width / 2, r + width / 2, 48, 1, -a1, a1 - a0).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(MISSION_TABLE.x, 0.005, MISSION_TABLE.z);
  m.renderOrder = 1;
  return m;
}

/**
 * Each pod's ready line: a 6 cm double stripe on the arc in front of it, a tick across it where each
 * unit that needs someone stands (readySpot), and the tick's number beside it, nearest the table.
 */
function readyLines(group: THREE.Group, sheet: DecalSheet) {
  const stripe = solid(DECK.signal, 0.42);
  const tick = solid(DECK.signal, 0.7);
  for (const [p, pod] of PODS.entries()) {
    const letter = POD_LETTERS[p];
    const half = ((READY_LINE.ticks - 1) / 2 + 0.6) * (READY_LINE.spacing / READY_LINE.r);
    for (const dr of [-0.022, 0.022]) group.add(arc(READY_LINE.r + dr, 0.016, pod.ready - half, pod.ready + half, stripe));
    for (let k = 1; k <= READY_LINE.ticks; k++) {
      const s = readySpot(letter, k);
      const a = Math.atan2(s.z - MISSION_TABLE.z, s.x - MISSION_TABLE.x);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.22).rotateX(-Math.PI / 2), tick);
      t.position.set(s.x, 0.006, s.z);
      t.rotation.y = -a + Math.PI / 2;
      t.renderOrder = 1;
      group.add(t);
      const inner = READY_LINE.r - 0.3;
      const number = (g: CanvasRenderingContext2D, W: number, H: number) => {
        g.fillStyle = DECK.muted;
        g.font = MONO(34);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(k), W / 2, H / 2);
      };
      sheet.add(0.32, 0.32, 160, number, MISSION_TABLE.x + Math.cos(a) * inner, MISSION_TABLE.z + Math.sin(a) * inner);
    }
  }
}

/** The Standby bench's stencil on the floor in front of it. */
function standby(group: THREE.Group) {
  const x0 = Math.min(...BEANBAGS.map((b) => b.x)) - 0.7;
  const x1 = Math.max(...BEANBAGS.map((b) => b.x)) + 0.7;
  const z = BEANBAGS[0].z - 1.55;
  const label = floorDecal(x1 - x0, 0.5, 120, (g, W, H) => {
    g.strokeStyle = DECK.steel;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, H - 4);
    g.lineTo(W, H - 4);
    g.stroke();
    g.fillStyle = DECK.muted;
    g.font = UI(700, 34);
    stretch(g, true);
    g.textBaseline = 'middle';
    g.letterSpacing = '6px';
    g.fillText('STANDBY', 8, H / 2 - 2);
    g.font = MONO(24);
    stretch(g, false);
    g.letterSpacing = '0px';
    g.textAlign = 'right';
    g.fillText('parked units wait here', W - 8, H / 2 - 2);
  }).mesh;
  label.position.set((x0 + x1) / 2, 0.006, z);
  group.add(label);
}

/** The Formation mark: three chevrons nested in an upward V, the lead one solid, at `s` pixels per grid unit. */
export function drawMark(g: CanvasRenderingContext2D, x: number, y: number, s: number, lead: string, trail: string) {
  const chevron = (dy: number) => {
    g.beginPath();
    g.moveTo(x + 4 * s, y + (14 + dy) * s);
    g.lineTo(x + 12 * s, y + (6 + dy) * s);
    g.lineTo(x + 20 * s, y + (14 + dy) * s);
  };
  g.lineJoin = 'miter';
  g.lineCap = 'square';
  g.lineWidth = 2.5 * s;
  g.strokeStyle = trail;
  chevron(10);
  g.stroke();
  chevron(5);
  g.stroke();
  g.lineWidth = 4 * s;
  g.strokeStyle = lead;
  chevron(0);
  g.stroke();
}

/** What the title block says: the deck, its number, who's looking, and the build's revision. */
export interface TitleInfo {
  deck: string;
  n?: number;
  operator?: string;
}

declare const __REVISION__: string;

/** The title block's drawing: a ruled rectangle split into cells, the way a drawing's title block is. */
function paintTitle(g: CanvasRenderingContext2D, W: number, H: number, info: TitleInfo) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(13,19,26,0.55)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = DECK.steel;
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);
  g.lineWidth = 2;
  const split = Math.round(W * 0.36);
  const row = Math.round(H / 3);
  g.beginPath();
  g.moveTo(split, 0);
  g.lineTo(split, H);
  g.moveTo(split, row);
  g.lineTo(W, row);
  g.moveTo(split, row * 2);
  g.lineTo(W, row * 2);
  g.stroke();
  // The lockup: the mark and the wordmark.
  const s = H / 64;
  drawMark(g, 14 * s, 6 * s, s * 1.2, DECK.text, DECK.muted);
  g.textBaseline = 'alphabetic';
  g.font = UI(600, Math.round(H * 0.16));
  stretch(g, true);
  g.fillStyle = DECK.text;
  g.letterSpacing = `${Math.round(H * 0.01)}px`;
  g.fillText('UGC', 14 * s, H * 0.8);
  const ugc = g.measureText('UGC ').width;
  g.fillStyle = DECK.muted;
  g.fillText('ARMY', 14 * s + ugc, H * 0.8);
  g.letterSpacing = '0px';
  stretch(g, false);
  // The cells: deck, revision, operator; each a small caption and its value in mono.
  const rev = typeof __REVISION__ === 'string' ? __REVISION__ : 'dev';
  const cells: [string, string][] = [
    ['DECK', `${info.n ? `${String(info.n).padStart(2, '0')}  ` : ''}${info.deck}`],
    ['REV', rev],
    ['OPERATOR', info.operator ?? '-'],
  ];
  cells.forEach(([cap, value], i) => {
    const y = i * row;
    g.fillStyle = DECK.muted;
    g.font = UI(600, Math.round(row * 0.22));
    g.fillText(cap, split + 18, y + row * 0.34);
    g.fillStyle = DECK.text;
    g.font = MONO(Math.round(row * 0.34));
    let v = value;
    while (v.length > 4 && g.measureText(v).width > W - split - 36) v = `${v.slice(0, -2)}.`;
    g.fillText(v, split + 18, y + row * 0.8);
  });
  g.fillStyle = DECK.muted;
  g.font = UI(500, Math.round(H * 0.075));
  g.fillText(UPSTREAM_CREDIT_SHORT, 14 * s, H - 12);
}

/** The title block on the floor: say what it shows with set(). */
export interface TitleBlock {
  set(info: TitleInfo): void;
}

declare module '../types' {
  interface OfficeHandles {
    /** The title block stencilled on the floor in the south-east corner. */
    titleBlock: TitleBlock;
  }
}

/** The floor's paint: the grid's bubbles, the ready lines, the bench's stencil and the title block. */
export const floorPaint: Fixture<'titleBlock'> = (site) => {
  const group = new THREE.Group();
  // The bubbles and the ready lines' numbers: one sheet, one draw.
  const sheet = new DecalSheet();
  gridMarks(group, sheet);
  readyLines(group, sheet);
  const marks = sheet.build();
  if (marks) group.add(marks);
  standby(group);
  const tb = TITLE_BLOCK;
  let info: TitleInfo = { deck: 'Lobby' };
  const decal = floorDecal(tb.maxX - tb.minX, tb.maxZ - tb.minZ, 150, (g, W, H) => paintTitle(g, W, H, info));
  decal.mesh.position.set((tb.minX + tb.maxX) / 2, 0.006, (tb.minZ + tb.maxZ) / 2);
  group.add(decal.mesh);
  const set = (next: TitleInfo) => {
    info = next;
    paintTitle(decal.canvas.getContext('2d')!, decal.canvas.width, decal.canvas.height, info);
    decal.texture.needsUpdate = true;
  };
  site.group.add(group);
  return { handle: { titleBlock: { set } } };
};
