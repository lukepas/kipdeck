import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RING_INLAY } from '../lights/modes';
import { drawGlyph } from '../../world/glyphs';
import { DECK } from '../../world/office/materials';
import { HULL, HULL_COLORS, type HullClass } from './logic';

// The escorts' hulls, built in code: a corvette, a frigate and a cruiser, each one geometry with what
// each face is in its attributes (hull plate, a port, a drive nozzle or a running light), which port it
// is, and when its plate goes on while the deck is cloned. One shader draws them all: graphite plate in
// a cold key light, ports lit one per unit at work, drives in ship-cyan by how hard they push, white
// running lights that blink for a salute. No orange, red or violet: those are the states'.

/** What a face is: plate, a port, a drive nozzle, a running light. */
const KIND = { hull: 0, port: 1, drive: 2, run: 3 } as const;

type Part = { geo: THREE.BufferGeometry; kind: number; port?: number; plate: number };

/** A box `w` wide, `h` high and `l` long, its bow (-z) end narrowed to `nose` of its width and `noseH` of its height. */
function wedge(w: number, h: number, l: number, nose: number, noseH = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, l, 1, 1, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    // 0 at the stern end, 1 at the bow end.
    const k = 0.5 - p.getZ(i) / l;
    const sx = 1 + (nose - 1) * k;
    const sy = 1 + (noseH - 1) * k;
    p.setXYZ(i, p.getX(i) * sx, p.getY(i) * sy, p.getZ(i));
  }
  g.computeVertexNormals();
  return g;
}

function tagged({ geo, kind, port = -1, plate }: Part): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
  g.setAttribute('aPort', new THREE.BufferAttribute(new Float32Array(n).fill(port), 1));
  g.setAttribute('aPlate', new THREE.BufferAttribute(new Float32Array(n).fill(plate), 1));
  return g;
}

/**
 * The hull's plates in `n` segments from the stern forward, so a clone builds the ship up from its keel:
 * `l` long, `h` high, its width tapering from `wStern` to `wBow` (and its height to `hBow` of itself), its
 * middle at z = `mid`.
 */
function taper(parts: Part[], o: { l: number; h: number; wStern: number; wBow: number; hBow?: number; n: number; mid?: number; y?: number; plates: [number, number] }) {
  const { l, h, wStern, wBow, hBow = 1, n, mid = 0, y = 0 } = o;
  const width = (z: number) => wBow + (wStern - wBow) * ((z - mid) / l + 0.5);
  const height = (z: number) => h * (hBow + (1 - hBow) * ((z - mid) / l + 0.5));
  for (let i = 0; i < n; i++) {
    const z0 = mid + l / 2 - (l * i) / n;
    const z1 = mid + l / 2 - (l * (i + 1)) / n;
    const geo = wedge(width(z0), height(z0), z0 - z1, width(z1) / width(z0), height(z1) / height(z0)).translate(0, y, (z0 + z1) / 2);
    parts.push({ geo, kind: KIND.hull, plate: o.plates[0] + ((o.plates[1] - o.plates[0]) * i) / n });
  }
}

/** A row of `n` ports down both flanks at height `y`, `x` out, from `z0` to `z1`. */
function ports(parts: Part[], n: number, x: number, y: number, z0: number, z1: number, row = 0, of = 1) {
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * (i + 0.5)) / n;
    for (const s of [-1, 1]) parts.push({ geo: new THREE.BoxGeometry(0.03, 0.1, 0.52).translate(s * x, y, z), kind: KIND.port, port: i * of + row, plate: 0.9 });
  }
}

/** A drive nozzle facing aft at (x, y, z), `r` across. */
function drive(parts: Part[], x: number, y: number, z: number, r: number) {
  parts.push({ geo: new THREE.CylinderGeometry(r * 1.15, r * 0.95, r * 1.6, 14).rotateX(Math.PI / 2).translate(x, y, z), kind: KIND.hull, plate: 0.05 });
  parts.push({ geo: new THREE.CircleGeometry(r * 0.85, 14).translate(x, y, z + r * 0.81 + 0.01), kind: KIND.drive, plate: 0.05 });
}

function light(parts: Part[], x: number, y: number, z: number) {
  parts.push({ geo: new THREE.BoxGeometry(0.16, 0.16, 0.16).translate(x, y, z), kind: KIND.run, plate: 0.95 });
}

/** Where each class's drive nozzles are (local, m): the plumes are drawn from there. */
export const DRIVES: Readonly<Record<HullClass, readonly (readonly [number, number, number, number])[]>> = {
  corvette: [[0, 0, 3.75, 0.45]],
  frigate: [
    [-1.9, -0.1, 6.6, 0.55],
    [1.9, -0.1, 6.6, 0.55],
  ],
  cruiser: [
    [-2.2, 0.2, 12.2, 0.9],
    [0, 0.5, 12.4, 1.05],
    [2.2, 0.2, 12.2, 0.9],
  ],
};

/** Where the name goes on each class's flank (local x out, y, z), and how long it is (m). */
export const NAME_AT: Readonly<Record<HullClass, { x: number; y: number; z: number; len: number }>> = {
  corvette: { x: 0.82, y: -0.05, z: 0.4, len: 3.8 },
  frigate: { x: 1.22, y: -0.25, z: 0.2, len: 7 },
  cruiser: { x: 2.45, y: -0.2, z: 2.5, len: 12 },
};

/** Where its beacon sits (over its bridge), local. */
export const BRIDGE_AT: Readonly<Record<HullClass, readonly [number, number, number]>> = {
  corvette: [0, 1.3, 1.0],
  frigate: [0, 2.1, 2.2],
  cruiser: [0, 3.9, 7.4],
};

export function hullGeometry(cls: HullClass): THREE.BufferGeometry {
  const parts: Part[] = [];
  const { length: L, ports: P } = HULL[cls];
  if (cls === 'corvette') {
    taper(parts, { l: 5.6, h: 0.9, wStern: 1.6, wBow: 0.45, hBow: 0.6, n: 4, mid: -0.4, plates: [0.1, 0.7] });
    parts.push({ geo: new THREE.BoxGeometry(0.62, 0.42, 1.4).translate(0, 0.62, 1.0), kind: KIND.hull, plate: 0.75 });
    parts.push({ geo: new THREE.BoxGeometry(3.2, 0.08, 1.1).translate(0, -0.1, 1.9), kind: KIND.hull, plate: 0.6 });
    drive(parts, ...(DRIVES.corvette[0] as [number, number, number, number]));
    ports(parts, P, 0.73, 0.1, -1.4, 1.4);
    light(parts, -1.62, -0.1, 1.9);
    light(parts, 1.62, -0.1, 1.9);
    light(parts, 0, 0.88, 0.6);
  } else if (cls === 'frigate') {
    taper(parts, { l: 9, h: 1.4, wStern: 2.4, wBow: 2.4, n: 5, plates: [0.1, 0.55] });
    parts.push({ geo: wedge(2.4, 1.4, 3.6, 0.25, 0.45).translate(0, 0, -6.3), kind: KIND.hull, plate: 0.6 });
    parts.push({ geo: new THREE.BoxGeometry(1.5, 0.6, 4.4).translate(0, 0.98, 1.4), kind: KIND.hull, plate: 0.7 });
    parts.push({ geo: new THREE.BoxGeometry(0.9, 0.45, 1.6).translate(0, 1.5, 2.2), kind: KIND.hull, plate: 0.8 });
    for (const s of [-1, 1]) {
      parts.push({ geo: new THREE.BoxGeometry(1.0, 0.18, 1.6).translate(s * 1.5, -0.1, 4.6), kind: KIND.hull, plate: 0.3 });
      parts.push({ geo: new THREE.CylinderGeometry(0.62, 0.62, 5.2, 14).rotateX(Math.PI / 2).translate(s * 1.9, -0.1, 3.4), kind: KIND.hull, plate: 0.35 });
    }
    for (const d of DRIVES.frigate) drive(parts, d[0], d[1], d[2], d[3]);
    ports(parts, P, 1.22, 0.25, -4.2, 3.6);
    light(parts, -2.55, -0.1, 1.2);
    light(parts, 2.55, -0.1, 1.2);
    light(parts, 0, 1.78, 2.2);
    light(parts, 0, 0.1, -8.05);
  } else {
    // A long arrowhead in two stepped decks, a tower aft with its bridge, three drives.
    taper(parts, { l: L, h: 1.6, wStern: 8, wBow: 0.6, n: 8, plates: [0.1, 0.6] });
    parts.push({ geo: wedge(4.2, 1.0, 14, 0.25, 0.7).translate(0, 1.3, 3.0), kind: KIND.hull, plate: 0.65 });
    parts.push({ geo: new THREE.BoxGeometry(2.6, 1.6, 3.2).translate(0, 2.4, 7.6), kind: KIND.hull, plate: 0.78 });
    parts.push({ geo: new THREE.BoxGeometry(4.0, 0.5, 1.2).translate(0, 3.4, 7.4), kind: KIND.hull, plate: 0.85 });
    for (const s of [-1, 1]) parts.push({ geo: new THREE.SphereGeometry(0.45, 10, 8).translate(s * 1.4, 3.9, 7.6), kind: KIND.hull, plate: 0.88 });
    for (const d of DRIVES.cruiser) drive(parts, d[0], d[1], d[2], d[3]);
    // Two rows of ports, down the lower deck's flank.
    ports(parts, P / 2, 3.45, 0.15, -1.5, 10.5, 0, 2);
    ports(parts, P / 2, 3.45, -0.35, -1.5, 10.5, 1, 2);
    light(parts, -3.9, 0.0, 11.0);
    light(parts, 3.9, 0.0, 11.0);
    light(parts, 0, 3.75, 7.4);
    light(parts, 0, 0.2, -11.9);
  }
  const g = mergeGeometries(parts.map(tagged))!;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const HULL_VERT = /* glsl */ `
attribute float aKind;
attribute float aPort;
attribute float aPlate;
attribute float iPorts;
attribute float iSalute;
attribute float iBuild;
attribute float iThrottle;
attribute float iGain;
varying vec3 vN;
varying vec3 vP;
varying vec3 vView;
varying float vKind;
varying float vLit;
varying float vPlate;
varying float vBuild;
varying float vThrottle;
varying float vSalute;
varying float vGain;
void main() {
  vKind = aKind;
  vLit = (aPort >= 0.0 && aPort < iPorts) ? 1.0 : 0.0;
  vPlate = aPlate;
  vBuild = iBuild;
  vThrottle = iThrottle;
  vSalute = iSalute;
  vGain = iGain;
  vP = position;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const HULL_FRAG = /* glsl */ `
uniform vec3 uPlate, uSeam, uPort, uDark, uDrive, uRun, uSun;
varying vec3 vN;
varying vec3 vP;
varying vec3 vView;
varying float vKind;
varying float vLit;
varying float vPlate;
varying float vBuild;
varying float vThrottle;
varying float vSalute;
varying float vGain;
void main() {
  // Plates not yet on while the deck clones; the newest ones edged in ship-cyan.
  if (vPlate > vBuild + 0.001) discard;
  vec3 n = normalize(vN);
  vec3 c;
  if (vKind < 0.5) {
    // Graphite plate in a cold key, a fill from below, and a rim so the silhouette holds on black.
    float key = max(dot(n, uSun), 0.0);
    // Both flanks catch a little light, so the side that faces the bridge never goes flat black.
    float fill = max(dot(n, vec3(0.0, -1.0, 0.2)), 0.0) * 0.12 + abs(n.x) * 0.38;
    float rim = pow(max(1.0 - max(dot(n, normalize(vView)), 0.0), 0.0), 3.0);
    // Panel lines every metre or so along the hull.
    float seam = step(0.94, fract(vP.z * 0.9)) + step(0.96, fract(vP.x * 0.6 + 0.3));
    vec3 base = mix(uPlate, uSeam, min(1.0, seam) * 0.6);
    c = base * (0.1 + 0.9 * key + fill) + uDrive * rim * 0.12;
    if (vBuild < 0.999 && vPlate > vBuild - 0.08) c += uDrive * 0.5;
  } else if (vKind < 1.5) {
    c = vLit > 0.5 ? uPort * 1.6 : uDark;
  } else if (vKind < 2.5) {
    c = uDrive * (0.2 + 1.4 * vThrottle);
  } else {
    c = uRun * (0.35 + 1.8 * vSalute);
  }
  gl_FragColor = vec4(c * vGain, 1.0);
  #include <colorspace_fragment>
}`;

/** The one material the three classes share; each class's InstancedMesh carries its own per-ship attributes. */
export function hullMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
    fog: false,
    uniforms: {
      uPlate: { value: new THREE.Color(HULL_COLORS.plate) },
      uSeam: { value: new THREE.Color(HULL_COLORS.seam) },
      uPort: { value: new THREE.Color(HULL_COLORS.port) },
      uDark: { value: new THREE.Color(DECK.instrument) },
      uDrive: { value: new THREE.Color(DECK.ship) },
      uRun: { value: new THREE.Color(HULL_COLORS.run) },
      uSun: { value: new THREE.Vector3(-0.25, 0.85, -0.45).normalize() },
    },
  });
}

/** The drive plume's falloff: bright at the nozzle, gone a few metres aft. */
export function plumeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  const along = g.createLinearGradient(0, 0, 128, 0);
  along.addColorStop(0, 'rgba(255,255,255,1)');
  along.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  along.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = along;
  g.fillRect(0, 0, 128, 32);
  g.globalCompositeOperation = 'destination-in';
  const across = g.createLinearGradient(0, 0, 0, 32);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 128, 32);
  return new THREE.CanvasTexture(c);
}

/**
 * The beacon over a sister deck that needs you: the deck's own needs-you diamond in Signal orange on a
 * disc of instrument black (RING_INLAY), the same glyph and carrier as every unit's ring, so it holds
 * its contrast against any sky (tests/lights.test.ts and tests/fleet.test.ts).
 */
export function beaconTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = RING_INLAY;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  drawGlyph(g, 'needs-you', 32, 32, 17);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The names painted on the hulls, a row each of one canvas; `row` picks which a plane shows. */
export const NAME_ROWS = 16;
export class NameAtlas {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private readonly rows: string[] = [];
  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 64 * NAME_ROWS;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }
  /** Paints `names` (a row each, in order); repaints only when they change. */
  set(names: string[]) {
    if (names.length === this.rows.length && names.every((n, i) => n === this.rows[i])) return;
    this.rows.splice(0, this.rows.length, ...names);
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = '600 40px "JetBrains Mono", ui-monospace, monospace';
    g.letterSpacing = '6px';
    g.fillStyle = 'rgba(206,214,222,0.85)';
    names.slice(0, NAME_ROWS).forEach((n, i) => g.fillText(n, 512, 64 * i + 33));
    g.letterSpacing = '0px';
    this.texture.needsUpdate = true;
  }
}

const NAME_VERT = /* glsl */ `
attribute float iRow;
varying vec2 vUv;
void main() {
  vUv = vec2(uv.x, (uv.y + float(${NAME_ROWS - 1}) - iRow) / float(${NAME_ROWS}));
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const NAME_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uGain;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  gl_FragColor = vec4(t.rgb, t.a * uGain);
  #include <colorspace_fragment>
}`;

/** The names' material: one plane per ship, its row of the atlas. */
export function nameMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: NAME_VERT, fragmentShader: NAME_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, uniforms: { uMap: { value: map }, uGain: { value: 1 } } });
}
