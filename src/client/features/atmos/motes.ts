import * as THREE from 'three';
import { BOARD_MASK_GLSL } from '../bridge/holo-mask';
import { MAX_SHAFTS, OVERHEAD_MASK_GLSL, type Shaft } from './plan';

// Dust in the light: points that drift only inside the shafts. Each mote belongs to one shaft and
// lives in that shaft's own terms (how far along it, how far out from its axis, and round which way),
// so wherever it drifts it stays inside, and it shows only as much as it is near the axis. All the
// drift is in the vertex shader from one clock, which only runs while Ship motion does: frozen with it
// Off or under reduced motion. The bow's shafts take the first motes, so Medium draws just those (a
// shorter draw range) and Low none. One draw.

const VERT = /* glsl */ `
attribute vec4 aMote;
attribute float aShaft;
uniform vec3 uAt[${MAX_SHAFTS}];
uniform vec3 uAxis[${MAX_SHAFTS}];
uniform vec3 uAcross[${MAX_SHAFTS}];
uniform vec4 uRadii[${MAX_SHAFTS}];
uniform float uLen[${MAX_SHAFTS}];
uniform float uTime;
uniform float uPixel;
varying float vA;
${OVERHEAD_MASK_GLSL}
void main() {
  int i = int(aShaft + 0.5);
  vec3 axis = uAxis[i];
  vec3 across = uAcross[i];
  vec3 side = normalize(cross(axis, across));
  vec4 r = uRadii[i];
  // Along the shaft it sinks slowly, wrapping round; round the axis it turns, and in and out it breathes.
  float seed = aMote.w;
  float t = fract(aMote.x + uTime * (0.004 + 0.006 * fract(seed * 7.3)));
  float rho = clamp(aMote.y + 0.12 * sin(uTime * (0.2 + 0.3 * fract(seed * 3.1)) + seed * 40.0), 0.0, 1.0);
  float th = aMote.z + uTime * (0.03 + 0.05 * fract(seed * 5.7)) * (fract(seed * 11.0) < 0.5 ? -1.0 : 1.0);
  vec2 rad = mix(r.xy, r.zw, t);
  vec3 p = uAt[i] + axis * (t * uLen[i]) + across * (cos(th) * rho * rad.x) + side * (sin(th) * rho * rad.y);
  // Only in the light: full near the axis, gone at the shaft's edge and at its ends, never under the floor.
  vA = (1.0 - smoothstep(0.55, 1.0, rho)) * smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.75, 1.0, t)) * smoothstep(0.05, 0.4, p.y);
  // A mote catches the light now and then: a slow twinkle.
  vA *= 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * (0.5 + fract(seed * 13.0)) + seed * 91.0));
  vA *= overheadMask(p);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  // None within a few metres of the lens: a mote right by it is a soft disc over whatever is behind it (a callout's words).
  vA *= smoothstep(1.0, 3.0, -mv.z);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPixel * clamp(0.03 * 900.0 / max(-mv.z, 0.4), 1.5, 5.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
uniform vec2 uRes;
varying float vA;
${BOARD_MASK_GLSL}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 12.0) * vA * uLevel;
  if (a < 0.002) discard;
  a *= boardMask(gl_FragCoord.xy / uRes * 2.0 - 1.0);
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

/** A deterministic 0-1 dealer, so every viewer's dust is the same. */
function dealer(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** How many of `total` motes the bow's shafts take: they come first, so a draw range of this many is the bow's alone. */
export function bowMotes(total: number, list: readonly Shaft[]): number {
  return list.some((s) => !s.bow) ? Math.round(total * (800 / 1500)) : total;
}

/**
 * The motes: `total` points, the first `bowMotes(total)` of them in the bow's shafts (spread by how
 * big each is), the rest in the others.
 */
export function makeMotes(list: readonly Shaft[], total: number, boards: THREE.Vector4[]) {
  const bowN = bowMotes(total, list);
  const deal = dealer(0xd057);
  const mote = new Float32Array(total * 4);
  const shaft = new Float32Array(total);
  const volume = (s: Shaft) => s.len * (s.r0[0] * s.r0[1] + s.r1[0] * s.r1[1]);
  const pick = (want: boolean) => {
    const ids = list.map((s, i) => [s, i] as const).filter(([s]) => s.bow === want);
    const sum = ids.reduce((a, [s]) => a + volume(s), 0);
    return () => {
      let x = deal() * sum;
      for (const [s, i] of ids) if ((x -= volume(s)) <= 0) return i;
      return ids[ids.length - 1][1];
    };
  };
  const bow = pick(true);
  const rest = list.some((s) => !s.bow) ? pick(false) : bow;
  for (let i = 0; i < total; i++) {
    shaft[i] = i < bowN ? bow() : rest();
    mote.set([deal(), Math.sqrt(deal()), deal() * Math.PI * 2, deal()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  // Positions are worked out in the shader; three only needs a count.
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  geo.setAttribute('aMote', new THREE.BufferAttribute(mote, 4));
  geo.setAttribute('aShaft', new THREE.BufferAttribute(shaft, 1));
  // The uniform arrays are as long as the shader's (MAX_SHAFTS), the unused ends empty.
  const all = Array.from({ length: MAX_SHAFTS }, (_, i) => list[i] ?? null);
  const v3 = (k: 'at' | 'axis' | 'across') => all.map((s) => (s ? new THREE.Vector3(...s[k]) : new THREE.Vector3(0, -1, 0)));
  const uniforms = {
    uAt: { value: v3('at') },
    uAxis: { value: v3('axis') },
    uAcross: { value: v3('across') },
    uRadii: { value: all.map((s) => (s ? new THREE.Vector4(s.r0[0], s.r0[1], s.r1[0], s.r1[1]) : new THREE.Vector4())) },
    uLen: { value: all.map((s) => s?.len ?? 0) },
    uTime: { value: 0 },
    uPixel: { value: 1 },
    uColor: { value: new THREE.Color() },
    uLevel: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uBoards: { value: boards },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const points = new THREE.Points(geo, mat);
  points.name = 'atmos-motes';
  points.frustumCulled = false;
  points.renderOrder = 7;
  return {
    points,
    uniforms,
    /** Draws `n` of them: the bow's first. */
    count(n: number) {
      geo.setDrawRange(0, Math.max(0, Math.min(total, n)));
      points.visible = n > 0;
    },
    bowN,
  };
}
