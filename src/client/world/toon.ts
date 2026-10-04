import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { matte, matteUnique } from './office/materials';

// The shapes and labels everything in the world is built from. The materials were toon-shaded once;
// now toon() and toonUnique() are a thin shim over world/office/materials.ts (matte, slightly rough,
// no outline), kept under their old names so the call sites read as they did.

/** A shared matte material in `color` (see matte in world/office/materials.ts). */
export function toon(color: THREE.ColorRepresentation, opts: { emissive?: THREE.ColorRepresentation; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
  return matte(color, opts);
}

/** A fresh (uncached) material, for things whose color animates. */
export function toonUnique(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return matteUnique(color);
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function roundedBox(w: number, h: number, d: number, r = 0.06): THREE.BufferGeometry {
  // Cheap rounded box: an extruded rounded rectangle, centered.
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r);
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -h / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

type TextOpts = {
  color?: string;
  bg?: string;
  size?: number;
  border?: string;
  /** 'mono' for data (call signs, cells, counts), 'display' for the wide stencil face, else the UI face. */
  face?: 'ui' | 'mono' | 'display';
  /** Letter spacing in ems, for stencils. */
  track?: number;
};
const TEXT_SCALE = 0.0055;

let fonts: Promise<unknown> | null = null;
/**
 * Resolves once the deck's type (Archivo, its wide cut, and JetBrains Mono) is loaded, so a canvas
 * painted then is painted in it. A canvas asks for no font itself, so this asks for them.
 */
export function fontsReady(): Promise<unknown> {
  if (fonts) return fonts;
  const set = typeof document === 'undefined' ? undefined : document.fonts;
  fonts = set ? Promise.all(['600 32px Archivo', '700 32px Archivo', '500 32px "JetBrains Mono"'].map((f) => set.load(f))).catch(() => undefined) : Promise.resolve();
  return fonts;
}

/** Archivo's wide cut for the display face (its font file spans 62% to 125%), where the canvas can stretch. */
export function stretch(ctx: CanvasRenderingContext2D, wide: boolean) {
  const c = ctx as CanvasRenderingContext2D & { fontStretch?: string };
  if ('fontStretch' in c) c.fontStretch = wide ? 'expanded' : 'normal';
}
const FACES = {
  ui: (size: number) => `600 ${size}px Archivo, system-ui, sans-serif`,
  display: (size: number) => `700 ${size}px Archivo, system-ui, sans-serif`,
  mono: (size: number) => `500 ${size}px "JetBrains Mono", ui-monospace, monospace`,
};

/** A text label drawn to a texture, on a plate with a 1px-style hairline and square-ish corners; `w`/`h` are the canvas size in pixels. */
function textTexture(text: string, opts: TextOpts) {
  const size = opts.size ?? 48;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = FACES[opts.face ?? 'ui'](size);
  const track = opts.track ?? 0;
  ctx.font = font;
  stretch(ctx, opts.face === 'display');
  const w = Math.ceil(ctx.measureText(text).width + track * size * Math.max(0, [...text].length - 1)) + size;
  const h = Math.ceil(size * 1.6);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  stretch(ctx, opts.face === 'display');
  if (track) ctx.letterSpacing = `${track * size}px`;
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, Math.max(2, size * 0.12));
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.05);
    ctx.strokeStyle = opts.border ?? '#3A4756';
    ctx.stroke();
  }
  ctx.fillStyle = opts.color ?? '#E8ECEF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2 + (track * size) / 2, h / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, w, h };
}

/** A camera-facing text label. */
export function textSprite(text: string, opts: TextOpts = {}): THREE.Sprite {
  const { tex, w, h } = textTexture(text, opts);
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w * TEXT_SCALE, h * TEXT_SCALE, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** A flat text sign facing +Z, for mounting on a wall (a sprite would swing into the wall). */
export function textPlane(text: string, opts: TextOpts = {}): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const { tex, w, h } = textTexture(text, opts);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, toneMapped: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(w * TEXT_SCALE, h * TEXT_SCALE), mat);
}

export function disposeSprite(s: THREE.Sprite) {
  s.material.map?.dispose();
  s.material.dispose();
}

/**
 * Merges every (untextured) mesh under `root` into one per material, keeping which ones cast
 * shadows: a few draw calls instead of dozens, for things that never move on their own.
 */
export function mergeByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const byKey = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const mat = m.material as THREE.Material;
    const key = `${mat.uuid}${m.castShadow ? '+' : '-'}`;
    if (!byKey.has(key)) byKey.set(key, { mat, cast: m.castShadow, geos: [] });
    byKey.get(key)!.geos.push(geo);
  });
  const out = new THREE.Group();
  for (const { mat, cast, geos } of byKey.values()) {
    out.add(mesh(mergeGeometries(geos)!, mat, 0, 0, 0, cast));
    for (const geo of geos) geo.dispose();
  }
  return out;
}
