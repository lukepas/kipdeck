import * as THREE from 'three';
import { NOISE } from '../space/glsl';
import { BOARD_MASK_GLSL } from '../bridge/holo-mask';
import { OVERHEAD_MASK_GLSL, type Shaft } from './plan';

// The shafts of light: every shaft (plan.ts) as an open frustum, all of them merged into one mesh and
// drawn in one additive call. No depth texture: a fragment's light comes from how square the shaft's
// surface is to the eye (through its thick middle bright, its silhouette fading), how far along the
// shaft it is (soft at both ends) and how high it is off the floor, with slow noise drifting through
// it for dust. The camera can stand inside one, so the view vector is nudged off zero; and like the
// holo, a shaft fades to nothing where a wall board's face is on screen.

/** Segments round each shaft. */
const ROUND = 20;

const VERT = /* glsl */ `
attribute float aT;
attribute float aBow;
attribute vec2 aRound;
attribute vec3 aAxis;
uniform float uSet;
varying vec3 vAxis;
varying vec3 vWorld;
varying vec3 vN;
varying float vT;
varying vec2 vRound;
void main() {
  vT = aT;
  vRound = aRound;
  vAxis = aAxis;
  vWorld = position;
  vN = normal;
  vec4 clip = projectionMatrix * viewMatrix * vec4(position, 1.0);
  // Not hung at this tier (uSet: -1 none, 0 the bow's only, 1 all): out past the far plane, so it costs no pixel.
  if (uSet < -0.5 || (uSet < 0.5 && aBow < 0.5)) clip = vec4(0.0, 0.0, 2.0, 1.0);
  gl_Position = clip;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
uniform float uTime;
uniform vec2 uRes;
varying vec3 vWorld;
varying vec3 vN;
varying float vT;
varying vec2 vRound;
varying vec3 vAxis;
${NOISE}
${BOARD_MASK_GLSL}
${OVERHEAD_MASK_GLSL}
void main() {
  // The eye can be inside a shaft, even on its surface: the view vector never quite zero.
  vec3 toEye = cameraPosition - vWorld;
  vec3 V = normalize(toEye + vec3(1e-4, 2e-4, 1e-4));
  vec3 N = normalize(vN + vec3(1e-5));
  float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
  // How far the look is off the shaft's axis: seen end on, its surface is edge on to the eye however
  // thick the light is, so the facing is taken against that, and the light seen down its length counts more.
  float across = sqrt(clamp(1.0 - dot(V, vAxis) * dot(V, vAxis), 0.0, 1.0));
  float thick = clamp(facing / max(across, 0.12), 0.0, 1.0);
  // Through its thick middle bright, its silhouette gone.
  float body = thick * thick * thick * min(1.0 / max(across, 0.5), 1.6);
  // Brightest where the light comes in, thinning toward where it lands, soft at both ends.
  float along = smoothstep(0.0, 0.06, vT) * (1.0 - smoothstep(0.55, 1.0, vT)) * (1.0 - 0.45 * vT);
  float low = smoothstep(0.05, 1.2, vWorld.y);
  // Rays along the shaft: noise round it, stretched along it, drifting slowly down it.
  float ring = vRound.x * 6.2831853;
  float rays = vnoise(vec3(cos(ring) * 2.4 + vRound.y * 7.0, sin(ring) * 2.4, vT * 1.6 - uTime * 0.04));
  rays = 0.3 + 0.7 * smoothstep(0.3, 0.8, rays);
  // Close up a shaft is air, not a wall of light.
  float near = smoothstep(0.3, 2.2, length(toEye));
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  float a = body * along * low * rays * near * boardMask(ndc) * overheadMask(vWorld);
  // Each face adds half: the axis, seen through both, takes the whole of uLevel.
  gl_FragColor = vec4(uColor * (uLevel * 0.5 * a), 1.0);
  #include <colorspace_fragment>
}`;

/** The shafts' geometry: each an open frustum, merged, with how far along it (aT) and whether it's the bow's (aBow). */
export function shaftGeometry(list: readonly Shaft[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const t: number[] = [];
  const bow: number[] = [];
  const round: number[] = [];
  const ax: number[] = [];
  const idx: number[] = [];
  const axis = new THREE.Vector3();
  const across = new THREE.Vector3();
  const side = new THREE.Vector3();
  const at = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const s of list) {
    axis.set(...s.axis);
    across.set(...s.across);
    side.crossVectors(axis, across).normalize();
    at.set(...s.at);
    const base = pos.length / 3;
    for (let end = 0; end < 2; end++) {
      const [a, b] = end ? s.r1 : s.r0;
      for (let i = 0; i <= ROUND; i++) {
        const th = (i / ROUND) * Math.PI * 2;
        const c = Math.cos(th);
        const sn = Math.sin(th);
        p.copy(at).addScaledVector(axis, end * s.len).addScaledVector(across, c * a).addScaledVector(side, sn * b);
        // The ellipse's outward normal, leaning a little with the frustum's flare.
        n.copy(across).multiplyScalar(c / Math.max(a, 1e-3)).addScaledVector(side, sn / Math.max(b, 1e-3)).normalize();
        pos.push(p.x, p.y, p.z);
        nrm.push(n.x, n.y, n.z);
        t.push(end);
        bow.push(s.bow ? 1 : 0);
        round.push(i / ROUND, list.indexOf(s));
        ax.push(axis.x, axis.y, axis.z);
      }
    }
    for (let i = 0; i < ROUND; i++) {
      const a = base + i;
      const b = base + ROUND + 1 + i;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  g.setAttribute('aBow', new THREE.Float32BufferAttribute(bow, 1));
  g.setAttribute('aRound', new THREE.Float32BufferAttribute(round, 2));
  g.setAttribute('aAxis', new THREE.Float32BufferAttribute(ax, 3));
  g.setIndex(idx);
  return g;
}

/** The shafts' one mesh: additive, writing no depth, seen from inside as well as out. */
export function makeShafts(list: readonly Shaft[], boards: THREE.Vector4[]): { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> } {
  const uniforms = {
    uColor: { value: new THREE.Color() },
    uLevel: { value: 0 },
    uTime: { value: 0 },
    uSet: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uBoards: { value: boards },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const mesh = new THREE.Mesh(shaftGeometry(list), mat);
  mesh.name = 'atmos-shafts';
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return { mesh, uniforms };
}
