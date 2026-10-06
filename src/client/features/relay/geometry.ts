import * as THREE from 'three';
import { RELAY, RELAY_COLORS, armAngle } from './logic';

// The Relay Beacon's three draws, all built in code (no model files):
//
// - The steel: the spire's triangular truss, its crown, the docking collar and its arms, and the three
//   rings, in one merged geometry. Each vertex says which part it belongs to (the spire, or ring 1, 2
//   or 3), and the vertex shader turns it by that part's pose, so the rings turn on their own with no
//   draw of their own. The bracing a tier leaves out collapses in the vertex shader. The innermost
//   ring carries the ledger's 32 segments, lit by a count.
// - The lights: one draw of points (the crown's core and its halo, the strobe, the approach lights,
//   the node-stars, the merge packet, the deploy trace and the arrival's flash), placed each frame.
// - The threads: hairlines between the nodes and down to the spire, one draw of line segments.
//
// All three are drawn round the camera on their own line of sight (index.ts), small and close, and
// write the depth of a span behind the dust and the escorts (DEPTH_SPAN), so the nearer things outside
// pass in front of it and its own parts still hide one another.

/** The depth the beacon writes: its view depth squeezed into [near, far] round the distance it is drawn at. */
const DEPTH_GLSL = /* glsl */ `
uniform vec3 uDepth;
vec4 relayDepth(vec4 clip, vec4 mv, float bias) {
  float d = -mv.z;
  float dd = clamp(0.5 * (uDepth.x + uDepth.y) + (d - uDepth.z) * 0.33 - bias, uDepth.x, uDepth.y);
  float zc = projectionMatrix[2][2] * (-dd) + projectionMatrix[3][2];
  clip.z = zc / dd * clip.w;
  return clip;
}`;

/** Stretched aft through the jump (+z in the ship's frame), and slid aft. */
const STREAK_GLSL = /* glsl */ `
uniform vec2 uStreak;
vec3 relayStreak(vec3 p) {
  return vec3(p.x, p.y, p.z * uStreak.x + uStreak.y);
}`;

const STEEL_VERT = /* glsl */ `
attribute vec4 aInfo;
uniform mat4 uPart[5];
uniform float uCoarse;
varying vec3 vN;
varying vec3 vView;
varying vec4 vInfo;
varying float vH;
${DEPTH_GLSL}
${STREAK_GLSL}
void main() {
  vInfo = aInfo;
  vH = position.y;
  // The bracing the tier leaves out: the fine set at Medium and Low, the coarse set at High.
  bool gone = (aInfo.y > 0.5 && aInfo.y < 1.5 && uCoarse > 0.5) || (aInfo.y > 1.5 && uCoarse < 0.5);
  if (gone) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  mat4 m = uPart[int(aInfo.x + 0.5)];
  vec3 p = relayStreak((m * vec4(position, 1.0)).xyz);
  vN = normalize(mat3(m) * normal);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // The way to the eye in the ship's frame (the group is only moved and scaled, never turned).
  vView = normalize(-(transpose(mat3(viewMatrix)) * mv.xyz));
  gl_Position = relayDepth(projectionMatrix * mv, mv, 0.0);
}`;

const STEEL_FRAG = /* glsl */ `
uniform vec3 uSun, uLit, uShade, uFill, uCrown, uCyan, uWarm;
uniform float uDay, uCrownK, uLedgerLit, uLedgerLevel, uLedgerBase, uLedgerFlash, uLights, uShow, uSeg;
varying vec3 vN;
varying vec3 vView;
varying vec4 vInfo;
varying float vH;
void main() {
  vec3 n = normalize(vN);
  float ndl = dot(n, uSun);
  // The sun's key from high over the bow, so its terminator agrees with the deck's shadows.
  float lit = smoothstep(-0.15, 0.85, ndl);
  vec3 col = mix(uShade, uLit, lit) * (1.0 + 0.6 * uDay);
  // A cool rim where a face turns away from the eye, catching the nebula's light, so the lattice keeps its edges.
  float edge = 1.0 - clamp(abs(dot(n, normalize(vView))), 0.0, 1.0);
  col += uFill * edge * edge * (1.0 - 0.5 * uDay);
  float kind = vInfo.w;
  // The crown's housing: lit from inside by the core, brightest round its waist.
  if (kind > 0.5 && kind < 1.5) {
    float waist = 1.0 - clamp(abs(vH - ${(RELAY.spire.height + RELAY.crown.height * 0.55).toFixed(1)}) / ${(RELAY.crown.height * 0.5).toFixed(1)}, 0.0, 1.0);
    col += uCrown * uCrownK * (0.25 + 0.75 * waist) * uLights;
  }
  // A ring's outer face: a faint ship-cyan hairline, so the rings read by Night.
  if (kind > 1.5 && kind < 2.5) col += uCyan * 0.16 * uLights * (1.0 - 0.7 * uDay);
  // The ledger: the innermost ring's segments, lit to the count of payouts this watch.
  if (vInfo.z >= 0.0) {
    float seg = floor(vInfo.z);
    float u = fract(vInfo.z);
    float gap = step(0.08, u) * step(u, 0.92);
    float on = step(seg + 0.5, uLedgerLit) * uLedgerLevel + uLedgerBase;
    // The newest segment comes up over its own beat.
    if (abs(seg - (uLedgerLit - 1.0)) < 0.5) on *= uSeg;
    col += uWarm * gap * (on + uLedgerFlash) * 0.9 * uLights;
  }
  gl_FragColor = vec4(col * uShow, uShow);
  #include <colorspace_fragment>
}`;

const POINT_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uPx;
varying vec3 vColor;
varying float vSoft;
${DEPTH_GLSL}
${STREAK_GLSL}
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(relayStreak(position), 1.0);
  gl_Position = relayDepth(projectionMatrix * mv, mv, 0.6);
  gl_PointSize = max(aSize * uPx, 0.0);
  // The big soft halos (over 10 px) fall off gently; the small points are a crisp core.
  vSoft = clamp((aSize - 6.0) / 30.0, 0.0, 1.0);
}`;

const POINT_FRAG = /* glsl */ `
uniform float uShow;
varying vec3 vColor;
varying float vSoft;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 9.0);
  float halo = (1.0 - r2) * (1.0 - r2);
  float k = mix(core + 0.18 * halo, 0.55 * halo * halo, vSoft);
  gl_FragColor = vec4(vColor * k * uShow, 1.0);
  #include <colorspace_fragment>
}`;

const LINE_VERT = /* glsl */ `
attribute vec3 aColor;
varying vec3 vColor;
${DEPTH_GLSL}
${STREAK_GLSL}
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(relayStreak(position), 1.0);
  gl_Position = relayDepth(projectionMatrix * mv, mv, 0.3);
}`;

const LINE_FRAG = /* glsl */ `
uniform float uShow;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor * uShow, 1.0);
  #include <colorspace_fragment>
}`;

const additive = { transparent: true, depthWrite: false, depthTest: true, fog: false, blending: THREE.AdditiveBlending } as const;

/** What the steel's builder collects: flat-shaded triangles, each vertex with its part, brace set, ledger segment and glow. */
class Builder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly info: number[] = [];

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, info: readonly number[] | ((p: THREE.Vector3) => readonly number[])) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    for (const p of [a, b, c, a, c, d]) {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(n.x, n.y, n.z);
      this.info.push(...(typeof info === 'function' ? info(p) : info));
    }
  }

  /** A square member `w` thick from `a` to `b`. */
  member(a: THREE.Vector3, b: THREE.Vector3, w: number, info: readonly number[]) {
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(w / 2);
    const v = new THREE.Vector3().crossVectors(u, dir).normalize().multiplyScalar(w / 2);
    const corner = (p: THREE.Vector3, s: number, t: number) => p.clone().addScaledVector(u, s).addScaledVector(v, t);
    const ring = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ] as const;
    for (let i = 0; i < 4; i++) {
      const [s0, t0] = ring[i];
      const [s1, t1] = ring[(i + 1) % 4];
      this.quad(corner(a, s0, t0), corner(a, s1, t1), corner(b, s1, t1), corner(b, s0, t0), info);
    }
  }

  /** A band round a circle of radius `r` in the xz plane, `width` across and `thick` high, in `n` pieces. */
  band(r: number, width: number, thick: number, n: number, part: number, ledger: boolean) {
    const at = (a: number, rr: number, y: number) => new THREE.Vector3(rr * Math.cos(a), y, rr * Math.sin(a));
    const r0 = r - width / 2;
    const r1 = r + width / 2;
    const h = thick / 2;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      // The ledger's segment and how far along it this piece is, by its middle's angle.
      const seg = (a: number) => {
        if (!ledger) return -1;
        const k = (a / (Math.PI * 2)) * RELAY.ledger;
        return Math.floor(k) + Math.min(0.999, k - Math.floor(k));
      };
      const lit = (glow: number) => (p: THREE.Vector3) => [part, 0, seg((Math.atan2(p.z, p.x) + Math.PI * 2) % (Math.PI * 2)), glow];
      this.quad(at(a0, r1, -h), at(a1, r1, -h), at(a1, r1, h), at(a0, r1, h), lit(2));
      this.quad(at(a0, r0, h), at(a1, r0, h), at(a1, r0, -h), at(a0, r0, -h), [part, 0, -1, 0]);
      this.quad(at(a0, r1, h), at(a1, r1, h), at(a1, r0, h), at(a0, r0, h), lit(0));
      this.quad(at(a0, r0, -h), at(a1, r0, -h), at(a1, r1, -h), at(a0, r1, -h), lit(0));
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    return g;
  }
}

/** The spire's leg `j` (of 3) at height `h`, on the truss's taper. */
export function legAt(j: number, h: number): THREE.Vector3 {
  const s = RELAY.spire;
  const w = s.base + ((s.top - s.base) * Math.min(h, s.height)) / s.height;
  const a = (j * Math.PI * 2) / 3;
  return new THREE.Vector3((w / 2) * Math.cos(a), h, (w / 2) * Math.sin(a));
}


/** The steel, in one geometry (see above). */
export function steelGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const s = RELAY.spire;
  const levels = Math.round(s.height / s.brace);
  // The three legs, a piece per brace level so they taper smoothly.
  for (let j = 0; j < 3; j++) for (let k = 0; k < levels; k++) b.member(legAt(j, k * s.brace), legAt(j, (k + 1) * s.brace + 0.4), s.leg, [0, 0, -1, 0]);
  // The bracing: a ring of struts at every level and a diagonal up each face, zig-zagging. The fine set
  // (every 11 m, 1) at High; the coarse set (every 22 m, 2) at Medium and Low; set 0 at every tier.
  for (let k = 0; k <= levels; k++) {
    const set = k % 2 === 0 ? 0 : 1;
    for (let j = 0; j < 3; j++) b.member(legAt(j, k * s.brace), legAt((j + 1) % 3, k * s.brace), s.strut, [0, set, -1, 0]);
  }
  for (let k = 0; k < levels; k++) {
    for (let j = 0; j < 3; j++) {
      const up = (k + j) % 2 === 0;
      b.member(legAt(up ? j : (j + 1) % 3, k * s.brace), legAt(up ? (j + 1) % 3 : j, (k + 1) * s.brace), s.strut, [0, 1, -1, 0]);
    }
  }
  for (let k = 0; k < levels; k += 2) {
    for (let j = 0; j < 3; j++) {
      const up = (k / 2 + j) % 2 === 0;
      b.member(legAt(up ? j : (j + 1) % 3, k * s.brace), legAt(up ? (j + 1) % 3 : j, Math.min(levels, k + 2) * s.brace), s.strut, [0, 2, -1, 0]);
    }
  }
  // The crown: a faceted lamp housing, six sides, widest a little over its middle, glowing from inside.
  const c = RELAY.crown;
  const ring = (h: number, r: number) => Array.from({ length: 6 }, (_, i) => new THREE.Vector3(r * Math.cos((i * Math.PI) / 3 + Math.PI / 6), h, r * Math.sin((i * Math.PI) / 3 + Math.PI / 6)));
  const foot = ring(s.height, s.top / 2 + 0.4);
  const waist = ring(s.height + c.height * 0.55, c.radius);
  const tip = new THREE.Vector3(0, s.height + c.height, 0);
  for (let i = 0; i < 6; i++) {
    const n = (i + 1) % 6;
    b.quad(foot[i], foot[n], waist[n], waist[i], [0, 0, -1, 1]);
    b.quad(waist[i], waist[n], tip, tip, [0, 0, -1, 1]);
  }
  // The docking collar at the foot, and its four arms.
  const cl = RELAY.collar;
  const seg = 32;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    b.member(new THREE.Vector3(cl.radius * Math.cos(a0), 0, cl.radius * Math.sin(a0)), new THREE.Vector3(cl.radius * Math.cos(a1), 0, cl.radius * Math.sin(a1)), cl.tube, [4, 0, -1, 0]);
  }
  // A turntable under the truss, which the truss turns on inside the still collar.
  for (let j = 0; j < 3; j++) b.member(legAt(j, 0), new THREE.Vector3(0, -2, 0), s.leg, [0, 0, -1, 0]);
  for (let j = 0; j < cl.arms; j++) {
    const a = armAngle(j);
    b.member(new THREE.Vector3(cl.radius * Math.cos(a), 0, cl.radius * Math.sin(a)), new THREE.Vector3((cl.radius + cl.arm) * Math.cos(a), 0, (cl.radius + cl.arm) * Math.sin(a)), 2.6, [4, 0, -1, 0]);
  }
  // The rings, the first carrying the ledger.
  RELAY.rings.forEach((r, i) => b.band(r.r, RELAY.band.width, RELAY.band.thick, 160, i + 1, i === 0));
  return b.geometry();
}

/** The steel's material: lit by the sun's key, the crown's housing and the ledger glowing. */
export function steelMaterial(): THREE.ShaderMaterial {
  const c = (hex: string) => new THREE.Color(hex);
  return new THREE.ShaderMaterial({
    vertexShader: STEEL_VERT,
    fragmentShader: STEEL_FRAG,
    fog: false,
    uniforms: {
      uPart: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
      uCoarse: { value: 0 },
      uDepth: { value: new THREE.Vector3() },
      uStreak: { value: new THREE.Vector2(1, 0) },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uLit: { value: c(RELAY_COLORS.steelLit) },
      uShade: { value: c(RELAY_COLORS.steelShade) },
      uFill: { value: c('#2E5A70') },
      uCrown: { value: c(RELAY_COLORS.crown) },
      uCyan: { value: c(RELAY_COLORS.cyan) },
      uWarm: { value: c(RELAY_COLORS.warm) },
      uDay: { value: 0 },
      uCrownK: { value: 1 },
      uLedgerLit: { value: 0 },
      uLedgerLevel: { value: 0.7 },
      uLedgerBase: { value: 0 },
      uLedgerFlash: { value: 0 },
      uSeg: { value: 1 },
      uLights: { value: 1 },
      uShow: { value: 1 },
    },
  });
}

/** The most lights it draws at once. */
export const LIGHTS = 112;

export function lightsMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    ...additive,
    uniforms: { uDepth: { value: new THREE.Vector3() }, uStreak: { value: new THREE.Vector2(1, 0) }, uPx: { value: 1 }, uShow: { value: 1 } },
  });
}

/** The most thread segments: one per node, and one per deck to the spire. */
export const THREADS = RELAY.nodes + 12;

export function threadsMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    ...additive,
    uniforms: { uDepth: { value: new THREE.Vector3() }, uStreak: { value: new THREE.Vector2(1, 0) }, uShow: { value: 1 } },
  });
}

/** An empty, growable buffer of `n` points with a colour and (when `sized`) a size each. */
export function dynamicGeometry(n: number, sized: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const at = (k: number) => new THREE.BufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', at(3));
  g.setAttribute('aColor', at(3));
  if (sized) g.setAttribute('aSize', at(1));
  g.setDrawRange(0, 0);
  return g;
}
