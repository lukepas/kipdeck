import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLAG_BOLD, FLAG_DIM, FLAG_INVERSE, RGB_FLAG, type Run } from '../../../shared/protocol';
import { mesh } from '../../world/toon';
import { DECK, flat, practical } from '../../world/office/materials';
import { TERM_THEME } from '../../ui/termtheme';
import type { ScreenState } from '../../state/store';
import { sharp } from '../../world/sharp';

const BASE16 = [
  TERM_THEME.black, TERM_THEME.red, TERM_THEME.green, TERM_THEME.yellow, TERM_THEME.blue, TERM_THEME.magenta, TERM_THEME.cyan, TERM_THEME.white,
  TERM_THEME.brightBlack, TERM_THEME.brightRed, TERM_THEME.brightGreen, TERM_THEME.brightYellow, TERM_THEME.brightBlue, TERM_THEME.brightMagenta, TERM_THEME.brightCyan, TERM_THEME.brightWhite,
];

const PALETTE: string[] = (() => {
  const p = [...BASE16];
  const steps = [0, 95, 135, 175, 215, 255];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) p.push(`rgb(${steps[r]},${steps[g]},${steps[b]})`);
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    p.push(`rgb(${v},${v},${v})`);
  }
  return p;
})();

function color(c: number, fallback: string): string {
  if (c < 0) return fallback;
  if (c >= RGB_FLAG) {
    const rgb = c & 0xffffff;
    return `rgb(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255})`;
  }
  return PALETTE[c] ?? fallback;
}

const runLen = (runs: Run[] | undefined) => (runs ? runs.reduce((n, r) => n + [...r[0]].length, 0) : 0);
const CHAR_WIDTH = 0.6;
const LINE_HEIGHT = 1.25;
const MIN_ZOOM_ROWS = 12;
const MIN_ZOOM_COLS = 56;

/**
 * The part of a terminal worth showing on a small laptop. Keep the usual recent rows, then add
 * surrounding rows for its natural character aspect ratio to use the available canvas.
 */
function activeWindow(s: ScreenState, width: number, height: number, preferredRows: number): { top: number; rows: number; cols: number; first: number; last: number } {
  let first = -1;
  let last = -1;
  let cols = MIN_ZOOM_COLS;
  for (let y = 0; y < s.rows; y++) {
    const runs = s.lines[y];
    if (!runs?.some((r) => r[0].trim() || r[2] !== -1)) continue;
    if (first < 0) first = y;
    last = y;
    cols = Math.max(cols, runLen(runs));
  }
  cols = Math.min(s.cols, cols);
  // A natural terminal cell is about .6 characters wide by 1.25 characters high. Add enough
  // surrounding rows for a wide PTY to use the laptop's height without vertically stretching glyphs.
  const aspectRows = Math.ceil((height * CHAR_WIDTH * cols) / (width * LINE_HEIGHT));
  const rows = Math.min(s.rows, Math.max(MIN_ZOOM_ROWS, preferredRows, aspectRows));
  const top = last < 0 ? 0 : Math.max(0, Math.min(last + 1 - rows, s.rows - rows));
  const contentFirst = first < 0 ? top : Math.max(top, first);
  const contentLast = last < 0 ? top : Math.min(top + rows - 1, last);
  return { top, rows, cols, first: contentFirst, last: contentLast };
}

/** Paints a terminal screen onto a canvas. Shared by the 3D laptops and the HUD previews. */
export function paintScreen(ctx: CanvasRenderingContext2D, w: number, h: number, s: ScreenState | undefined, placeholder?: string, zoomRows = 0) {
  ctx.fillStyle = TERM_THEME.background;
  ctx.fillRect(0, 0, w, h);
  if (!s) {
    ctx.fillStyle = DECK.muted;
    ctx.font = `500 ${Math.round(h / 14)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(placeholder ?? 'booting...', w / 2, h / 2);
    ctx.textAlign = 'left';
    return;
  }
  const pad = w * 0.02;
  const win = zoomRows
    ? activeWindow(s, w - pad * 2, h - pad * 2, zoomRows)
    : { top: 0, rows: s.rows, cols: s.cols, first: 0, last: s.rows - 1 };
  const cellW = (w - pad * 2) / win.cols;
  const cellH = (h - pad * 2) / win.rows;
  const fontSize = Math.max(4, Math.min(cellW / CHAR_WIDTH, cellH / LINE_HEIGHT));
  const charW = fontSize * CHAR_WIDTH;
  const lineH = fontSize * LINE_HEIGHT;
  const gridW = win.cols * charW;
  const contentRows = Math.max(1, win.last - win.first + 1);
  const gridH = contentRows * lineH;
  const left = pad + (w - pad * 2 - gridW) / 2;
  const top = pad + (h - pad * 2 - gridH) / 2;
  ctx.textBaseline = 'top';
  for (let y = 0; y < win.rows; y++) {
    const runs = s.lines[win.top + y];
    if (!runs) continue;
    let x = 0;
    const py = top + (win.top + y - win.first) * lineH;
    for (const [text, fgc, bgc, flags] of runs) {
      const len = [...text].length;
      let fg = color(fgc, TERM_THEME.foreground);
      let bg = bgc < 0 ? null : color(bgc, TERM_THEME.background);
      if (flags & FLAG_INVERSE) {
        const tmp = fg;
        fg = bg ?? TERM_THEME.background;
        bg = tmp;
      }
      const px = left + x * charW;
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(px, py, len * charW + 0.5, lineH + 0.5);
      }
      if (text.trim()) {
        ctx.font = `${flags & FLAG_BOLD ? 700 : 400} ${fontSize}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.globalAlpha = flags & FLAG_DIM ? 0.55 : 1;
        ctx.fillStyle = fg;
        ctx.fillText(text, px, py + (lineH - fontSize) / 2);
        ctx.globalAlpha = 1;
      }
      x += len;
    }
  }
}

let shellGeo: THREE.BufferGeometry | null = null;
/**
 * The laptop's shell in the laptop's own space with the lid open flat (rotation 0): the plinth on
 * bone 0, the bezel on bone 1 (the lid's hinge, 14 mm up and 5 cm back). Shared by every laptop.
 */
function shellGeometry(): THREE.BufferGeometry {
  if (shellGeo) return shellGeo;
  const bound = (geo: THREE.BufferGeometry, x: number, y: number, z: number, bone: number) => {
    const g = geo.translate(x, y, z);
    const n = g.attributes.position.count;
    const index = new Uint16Array(n * 4);
    const weight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      index[i * 4] = bone;
      weight[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
    return g;
  };
  const parts = [bound(new THREE.BoxGeometry(0.3, 0.014, 0.1), 0, 0.007, -0.05, 0), bound(new THREE.BoxGeometry(0.41, 0.255, 0.018), 0, 0.014 + 0.1275, -0.05, 1)];
  shellGeo = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return shellGeo;
}

export class Laptop {
  readonly root = new THREE.Group();
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private lid = new THREE.Bone();
  private hairline: THREE.Mesh;
  private drawnVersion = -1;
  private paintedAt = 0;
  private openT = 0;
  private placeholder = 'booting...';

  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 614;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    sharp(this.texture);
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;

    // The screen: a slim slab with a dark bezel, hinged on a low plinth at its foot. It lies flat
    // while the unit comes in and tilts up, leaning well back so the unit shows over it from the table.
    // The bezel and the plinth are one skinned mesh over two bones (the laptop, and the lid's hinge),
    // so the lid tilts as before and the laptop's shell is one draw and one shadow draw.
    this.lid.position.set(0, 0.014, -0.05);
    this.root.add(this.lid);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.385, 0.231), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    screen.position.set(0, 0.1275, 0.0095);
    this.lid.add(screen);
    const base = new THREE.Bone();
    this.root.add(base);
    this.lid.rotation.x = 0;
    this.root.updateMatrixWorld(true);
    const shell = new THREE.SkinnedMesh(shellGeometry(), flat(DECK.console));
    shell.castShadow = true;
    shell.receiveShadow = true;
    this.root.add(shell);
    shell.bind(new THREE.Skeleton([base, this.lid]));
    // A hairline along its foot, lit: the console is live. Left out from far off (setDetail).
    this.hairline = mesh(new THREE.BoxGeometry(0.36, 0.004, 0.004), practical(DECK.steel), 0, 0.002, 0.012, false);
    this.lid.add(this.hairline);
    this.lid.rotation.x = Math.PI / 2; // lying flat; tilts up as it boots
    paintScreen(this.ctx, this.canvas.width, this.canvas.height, undefined, this.placeholder);
    this.texture.needsUpdate = true;
  }

  /** Whether its small parts are drawn: the hairline is left out from far off (Quality's detail range). */
  setDetail(on: boolean) {
    this.hairline.visible = on;
  }

  setPlaceholder(text: string) {
    if (text === this.placeholder) return;
    this.placeholder = text;
    this.drawnVersion = -2;
  }

  /** `distance` to the camera throttles repaints: far-away laptops refresh rarely. */
  update(dt: number, screen: ScreenState | undefined, distance = 0) {
    if (this.openT < 1) this.setLid(Math.min(1, this.openT + dt * 1.6));
    const version = screen ? screen.version : -1;
    const now = performance.now();
    const every = distance < 6 ? 150 : distance < 14 ? 600 : 2000;
    if (version !== this.drawnVersion && (now - this.paintedAt > every || this.drawnVersion < 0)) {
      this.paintedAt = now;
      this.drawnVersion = version;
      paintScreen(this.ctx, this.canvas.width, this.canvas.height, screen, this.placeholder, 22);
      this.texture.needsUpdate = true;
    }
  }

  /** Folds the lid down a little further (it snaps shut at the end); true once it's closed. */
  shut(dt: number): boolean {
    this.setLid(Math.max(0, this.openT - dt * 2));
    return this.openT === 0;
  }

  private setLid(open: number) {
    this.openT = open;
    const e = 1 - Math.pow(1 - open, 3);
    this.lid.rotation.x = Math.PI / 2 - e * (Math.PI / 2 + 0.55);
  }

  dispose() {
    this.texture.dispose();
  }
}
