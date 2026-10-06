import * as THREE from 'three';
import { FLOOR, WALL_T, type Side } from '../../../shared/layout';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { trimShader, type TrimLook } from './trim';

// What the deck is made of: one family of matte, slightly rough materials on a slate ramp, the
// emissive practicals that light it, the floor's grid, the contact shadows that ground everything,
// and smoked glass. world/toon.ts hands these out under its old names, so most call sites stay as
// they were. Every color here is in DESIGN.md's 3D row.

/**
 * The deck's 3D palette by Night (low light): slate and steel, with hue kept for state and proof. Day
 * (high light) swaps the neutrals for its own (DAY_PALETTE in features/lights/modes.ts) on the same
 * materials; the hues and the instrument black under every mark stay.
 */
export const DECK = {
  void: '#0D131A',
  floor: '#1C2430',
  gridMinor: '#2C3744',
  gridMajor: '#3A4858',
  wall: '#1C2530',
  wallReveal: '#0A0F15',
  console: '#26303C',
  consoleTop: '#2E3946',
  steel: '#3A4756',
  steelLight: '#8A97A5',
  unit: '#333D49',
  text: '#E8ECEF',
  muted: '#8A97A5',
  line: '#26313D',
  signal: '#FF6A1A',
  stuck: '#FF4D5E',
  review: '#F5C542',
  working: '#C9D2DC',
  proof: '#A68BFF',
  settled: '#3DDC97',
  /** The bridge's hull plating, its seams, and the instrument black under screens and marks. */
  hull: '#1C2530',
  hullSeam: '#2A3644',
  instrument: '#0B1219',
  /** Ship-cyan: the instruments' own color, never a state. Hairlines and small type only; `shipDim` for lit areas. */
  ship: '#6FC3DF',
  shipDim: '#2C5E70',
} as const;

/**
 * Old names some fixtures still paint with (the back office's desks, the meeting room's chairs), all
 * mapped onto the slate ramp: nothing on the deck is pastel any more.
 */
export const PALETTE = {
  desk: DECK.consoleTop,
  deskLeg: DECK.steel,
  wood: DECK.console,
  ink: DECK.wallReveal,
  wall: DECK.wall,
  wallTrim: DECK.wallReveal,
  chairs: [DECK.unit],
};

interface MatOpts {
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  flat?: boolean;
  roughness?: number;
  metalness?: number;
  /** The trim atlas's seams, dirt and wear (./trim.ts): as its finish has it, or none with false. */
  trim?: false;
}

/**
 * How each of the deck's surfaces is finished, by its Night color: how rough and how metal it is, and
 * how much of the trim atlas it takes. Four finishes, each one you can tell apart: brushed steel and
 * rails at 0.35, the consoles' glass tops at 0.1, wall and deck plate at 0.6 with the atlas's seams, and
 * 0.85 only for rubber. The units' shells are their own (world/character/unit-body.ts). Anything not
 * listed is plate with a light trim.
 */
const FINISH: Readonly<Record<string, { roughness: number; metalness: number; trim: TrimLook | null }>> = {
  // Brushed steel and rails: 0.35, a metal that catches the room's strips and screens.
  [DECK.steel.slice(1).toLowerCase()]: { roughness: 0.35, metalness: 0.55, trim: { k: 0.8, sheen: 0.22 } },
  [DECK.steelLight.slice(1).toLowerCase()]: { roughness: 0.35, metalness: 0.7, trim: { k: 0.6, sheen: 0.22 } },
  // The console tops are glass over instruments: 0.1, a crisp reflection of the boards and the holo.
  [DECK.consoleTop.slice(1).toLowerCase()]: { roughness: 0.1, metalness: 0.2, trim: { k: 0.5, sheen: 0.3 } },
  [DECK.console.slice(1).toLowerCase()]: { roughness: 0.5, metalness: 0.2, trim: { k: 1, sheen: 0.24 } },
  // Wall and hull plate: 0.6 with the trim atlas's seams.
  [DECK.wall.slice(1).toLowerCase()]: { roughness: 0.6, metalness: 0.25, trim: { k: 1, sheen: 0.24 } },
  [DECK.hullSeam.slice(1).toLowerCase()]: { roughness: 0.55, metalness: 0.35, trim: { k: 0.4, sheen: 0.24 } },
  [DECK.wallReveal.slice(1).toLowerCase()]: { roughness: 0.7, metalness: 0.1, trim: { k: 0.7, sheen: 0.12 } },
  [DECK.instrument.slice(1).toLowerCase()]: { roughness: 0.25, metalness: 0.2, trim: { k: 0.35, sheen: 0.1 } },
  // Rubber and the units' old matte: 0.85 is for these only.
  [DECK.unit.slice(1).toLowerCase()]: { roughness: 0.85, metalness: 0.05, trim: null },
};
const PLAIN_TRIM: TrimLook = { k: 0.6, sheen: 0.15 };

/** Gives `m` the trim atlas (see ./trim.ts), on top of whatever its shader already does. */
export function withTrim<M extends THREE.MeshStandardMaterial>(m: M, look: TrimLook): M {
  const before = m.onBeforeCompile;
  const key = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    trimShader(shader, look);
  };
  m.customProgramCacheKey = () => `${key.call(m)}|trim`;
  m.userData.trim = look;
  return m;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Marks `m` as lettering or paint on a wall or the floor: light on Night's dark surfaces, it would
 * wash out on Day's light ones, so Day darkens it (features/lights/palette.ts). Not for type on a
 * screen or a console, which stay dark in both modes.
 */
export function ink<M extends THREE.Material>(m: M): M {
  m.userData.ink = true;
  return m;
}

/** A shared matte material: roughness 0.85, almost no metal, the same object for the same recipe. */
export function matte(color: THREE.ColorRepresentation, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 1}|${opts.opacity ?? 1}|${opts.flat ? 1 : 0}|${opts.roughness ?? ''}|${opts.metalness ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = matteUnique(color, opts);
  cache.set(key, m);
  return m;
}

/** A material of its own (uncached), for something whose color changes. */
export function matteUnique(color: THREE.ColorRepresentation, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const finish = FINISH[new THREE.Color(color).getHexString()];
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? finish?.roughness ?? 0.6, metalness: opts.metalness ?? finish?.metalness ?? 0.1, flatShading: !!opts.flat });
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.transparent || (opts.opacity ?? 1) < 1) {
    m.transparent = true;
    m.opacity = opts.opacity ?? 1;
  }
  const trim = opts.trim === false || m.transparent || opts.emissive !== undefined ? null : finish === undefined ? PLAIN_TRIM : finish.trim;
  if (trim) withTrim(m, trim);
  return m;
}

/** Flat-shaded matte, for consoles and units: crisp facets that read at any distance. */
export const flat = (color: THREE.ColorRepresentation) => matte(color, { flat: true });

const glow = new Map<string, THREE.MeshBasicMaterial>();
/**
 * A practical: something that gives light rather than takes it (a light bar, a lit edge, a screen's
 * glow). Unlit and untouched by tone mapping, so it holds its color in the dark.
 */
export function practical(color: THREE.ColorRepresentation, opacity = 1): THREE.MeshBasicMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opacity}`;
  let m = glow.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    glow.set(key, m);
  }
  return m;
}

/**
 * Smoked glass: dark, a little see-through, for the Review bay. Its panes are flat, so one pass draws
 * both sides as two passes would (see-through and double sided is otherwise two draws a pane).
 */
export const GLASS = new THREE.MeshStandardMaterial({ color: '#1B2733', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });

/**
 * Viewport glass: almost clear looking straight through, with a cold tint that thickens toward
 * grazing angles (a fresnel) and a faint sheen, so it reads as glass rather than a hole, and space
 * reads through it. Drawn after what's outside it (renderOrder 2), in one pass: its panes are flat.
 */
export const VIEWPORT_GLASS = new THREE.MeshStandardMaterial({ color: '#16242F', roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
VIEWPORT_GLASS.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `{
      float fres = pow(max(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0), 3.0);
      // Thicker and bluer at a slant, and a soft sheen from the room's light down the pane.
      diffuseColor.a = mix(diffuseColor.a, 0.3, fres);
      outgoingLight += vec3(0.03, 0.065, 0.085) * (0.1 + fres) + vec3(0.008, 0.014, 0.018) * smoothstep(-1.0, 1.0, normalize(vViewPosition).y);
    }
    #include <opaque_fragment>`,
  );
};
VIEWPORT_GLASS.customProgramCacheKey = () => 'viewport-glass-fresnel';

/** A sheet of glass `w` by `h` (smoked unless `material` says otherwise), centered, facing +z. */
export function glassPane(w: number, h: number, material: THREE.Material = GLASS): THREE.Group {
  const g = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  pane.renderOrder = 2;
  g.add(pane);
  return g;
}

/** The middle of an outside wall at `u` along it, and the turn that makes local +z point outdoors. */
export function onWall(side: Side, u: number): { x: number; z: number; rotY: number } {
  switch (side) {
    case 'north':
      return { x: u, z: FLOOR.minZ - WALL_T / 2, rotY: Math.PI };
    case 'south':
      return { x: u, z: FLOOR.maxZ + WALL_T / 2, rotY: 0 };
    case 'west':
      return { x: FLOOR.minX - WALL_T / 2, z: u, rotY: -Math.PI / 2 };
    case 'east':
      return { x: FLOOR.maxX + WALL_T / 2, z: u, rotY: Math.PI / 2 };
  }
}

/** Pixels per meter of the floor's grid texture, and how many meters one tile of it covers. */
const GRID_PX = 128;
const GRID_TILE = 5;

/** The deck's floor: graphite, a fine line every meter and a stronger one every five. */
export function paintGrid(c: HTMLCanvasElement, colors: { floor: string; gridMinor: string; gridMajor: string } = DECK) {
  const size = GRID_PX * GRID_TILE;
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = colors.floor;
  g.fillRect(0, 0, size, size);
  g.fillStyle = colors.gridMinor;
  for (let i = 1; i < GRID_TILE; i++) {
    g.fillRect(i * GRID_PX - 1, 0, 2, size);
    g.fillRect(0, i * GRID_PX - 1, size, 2);
  }
  // The major line sits on the tile's edge, half on each side, so tiles meet in one line.
  g.fillStyle = colors.gridMajor;
  g.fillRect(0, 0, 2, size);
  g.fillRect(size - 2, 0, 2, size);
  g.fillRect(0, 0, size, 2);
  g.fillRect(0, size - 2, size, 2);
}

/**
 * The floor's grid as a texture, lined up with the world's meters (uvs in meters / GRID_TILE), so the
 * room, the back office and the apron round the slab all share one grid.
 */
/** Every floor grid made, for the lights to paint again in Day's colors (features/lights). */
export const FLOOR_GRIDS: THREE.CanvasTexture[] = [];

export function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  paintGrid(c);
  const t = new THREE.CanvasTexture(c);
  FLOOR_GRIDS.push(t);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Gives a horizontal plane's uvs in world meters over the grid's tile (see floorTexture). */
export function worldUv(geo: THREE.BufferGeometry, ox = 0, oz = 0) {
  const uv = geo.getAttribute('uv');
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + ox) / GRID_TILE, -(pos.getZ(i) + oz) / GRID_TILE);
  uv.needsUpdate = true;
}

let shadowTex: THREE.CanvasTexture | null = null;
/** A soft dark blot, darkest in the middle: the shadow a thing casts straight down. */
function contactTexture(): THREE.CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.38)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

let shadowMat: THREE.MeshBasicMaterial | null = null;
/**
 * A contact shadow `w` by `d` under something standing on the floor at (x, z), turned `rotY`: what
 * grounds it when the key light's shadow is soft or falls elsewhere.
 */
export function contactShadow(w: number, d: number, x = 0, z = 0, rotY = 0, y = 0.004): THREE.Mesh {
  shadowMat ??= new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), shadowMat);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.renderOrder = 1;
  return m;
}

export function box(w: number, h: number, d: number) {
  return new THREE.BoxGeometry(w, h, d);
}

/**
 * A box painted face by face, its faces gathered by paint: a box with two paints is two draws (and
 * two shadow draws), not one per face.
 */
export function paintedBox(geo: THREE.BufferGeometry, paint: THREE.Material[]): THREE.Mesh {
  const index = geo.index!;
  const mats = [...new Set(paint)];
  const out: number[] = [];
  const groups = geo.groups.map((g) => ({ ...g }));
  geo.clearGroups();
  for (const [k, mat] of mats.entries()) {
    const start = out.length;
    for (const g of groups) if (paint[g.materialIndex ?? 0] === mat) for (let i = g.start; i < g.start + g.count; i++) out.push(index.getX(i));
    geo.addGroup(start, out.length - start, k);
  }
  geo.setIndex(out);
  return new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
}

/**
 * A box with its edges rounded off by `r` (m) in `segments` steps: a console's or a hood's, whose
 * edges catch the light as a fitted part's do. It draws the same (the merge makes the consoles one
 * draw), at about a hundred triangles to a box's twelve with one step.
 */
export function rbox(w: number, h: number, d: number, r = 0.025, segments = 1) {
  return new RoundedBoxGeometry(w, h, d, segments, Math.min(r, w / 2, h / 2, d / 2));
}

/** The materials and textures a floor paints in its own colors. On the deck every floor is the same slate. */
export interface Looks {
  wall: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  planks: THREE.CanvasTexture[];
}

/**
 * Gives `m` the hull's plating, worked out from where each point is in the world (no texture, no
 * uvs): panels 2.4 m long and 1.4 m high in staggered rows, a dark seam between them, and each panel a
 * shade lighter or darker than its neighbors. On walls it runs along the wall; on the plate under the
 * deck, across it. For the outside of the ship (shell.ts, features/bridge).
 */
export function hullPanels<M extends THREE.MeshStandardMaterial>(m: M): M {
  const before = m.onBeforeCompile;
  const key = m.customProgramCacheKey;
  // The outside of the ship: it reflects the sky, not the room (features/ibl).
  m.userData.outside = true;
  m.onBeforeCompile = (shader, renderer) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHullPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHullPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHullPos;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec3 fn = normalize(cross(dFdx(vHullPos), dFdy(vHullPos)));
        vec2 q = abs(fn.y) > 0.6 ? vHullPos.xz : (abs(fn.x) > abs(fn.z) ? vHullPos.zy : vHullPos.xy);
        vec2 cell = vec2(2.4, 1.4);
        float row = floor(q.y / cell.y);
        vec2 p = vec2(q.x / cell.x + 0.5 * mod(row, 2.0), q.y / cell.y);
        vec2 f = abs(fract(p) - 0.5);
        vec2 w = fwidth(p) * 1.2 + vec2(0.012 / cell.x, 0.012 / cell.y);
        float edge = 1.0 - max(smoothstep(0.5 - w.x * 1.5, 0.5, f.x), smoothstep(0.5 - w.y * 1.5, 0.5, f.y));
        vec2 id = floor(p);
        float tone = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
        diffuseColor.rgb *= mix(0.55, 1.0, edge) * (0.9 + 0.18 * tone);
        diffuseColor.rgb += vec3(0.006, 0.01, 0.014) * step(0.82, tone) * edge;
      }`,
    );
    // And the trim it was given (its finish's), over the panels.
    before.call(m, shader, renderer);
  };
  m.customProgramCacheKey = () => `hull-panels|${key.call(m)}`;
  return m;
}
