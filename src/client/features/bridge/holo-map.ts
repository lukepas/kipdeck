import * as THREE from 'three';
import { DECK } from '../../world/office/materials';
import { BOARD_MASK_GLSL, boardSlots, coneHeight } from './holo-mask';

// The holo's star map: a small spiral of a galaxy floating over the course plot, turning slowly, over a
// cone of projected light with scanlines climbing it, and a glow where the ship is on the course. All of
// it additive ship-cyan and white, writing no depth: light standing over the table, never a thing in
// the way (features/bridge/holo.ts). Neither the stars nor the cone are drawn over a wall board's face.

/** How high over the tabletop the map floats, how wide it is, and how many stars it has. */
export const MAP = { y: 0.85, r: 1.25, stars: 900 } as const;

const MAP_VERT = /* glsl */ `
attribute float aMag;
uniform float uPixel;
uniform float uTime;
varying float vA;
${BOARD_MASK_GLSL}
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // A slow twinkle, each star on its own phase; none over a wall board's face (holo-mask.ts).
  float tw = 0.75 + 0.25 * sin(uTime * 1.7 + aMag * 91.0);
  float clear = gl_Position.w > 0.0 ? boardMask(gl_Position.xy / gl_Position.w) : 1.0;
  vA = (0.25 + 0.75 * aMag) * tw * clear;
  gl_PointSize = max(2.0, uPixel * (0.018 + 0.03 * aMag) * 900.0 / max(-mv.z, 0.5));
}`;

const MAP_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uGain;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 12.0) * vA * uGain;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uColor, uCore, vA * 0.6) * a, 1.0);
  #include <colorspace_fragment>
}`;

const CONE_VERT = /* glsl */ `
varying float vY;
varying float vFacing;
varying vec4 vClip;
void main() {
  vY = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
  vClip = gl_Position;
}`;

const CONE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uGain;
varying float vY;
varying float vFacing;
varying vec4 vClip;
${BOARD_MASK_GLSL}
void main() {
  // Brightest at the emitter, gone at the top, soft at the silhouette; thin scanlines climbing it.
  // Every pow() base is kept off zero's wrong side: vY overshoots 1.0 a hair along the top rim, pow() of a
  // negative is NaN on Apple GPUs, and the bloom blurs one NaN pixel over the whole frame (a black flash).
  float rise = pow(max(1.0 - vY, 0.0), 1.6);
  float scan = 0.55 + 0.45 * smoothstep(0.6, 1.0, sin((vY * 40.0 - uTime * 1.3) * 6.2831853));
  float a = 0.07 * rise * scan * (0.4 + 0.6 * pow(max(vFacing, 0.0), 0.7)) * uGain;
  a *= vClip.w > 0.0 ? boardMask(vClip.xy / vClip.w) : 1.0;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

export interface StarMap {
  readonly group: THREE.Group;
  /** The wall boards' rectangles on screen, which the map and its cone keep out of (holo-mask.ts). */
  readonly boards: THREE.Vector4[];
  /** Moves it on: `dt` seconds of turning and shimmer at `k` times its pace (0 holds it). */
  step(dt: number, k: number): void;
  /** Puts the ship's glow at `at` (in the plot's space). */
  ship(at: THREE.Vector3): void;
  /** How much of its light shows, 0-1 (1 as built); at 0 it isn't drawn at all. */
  gain(k: number): void;
}

/** A spiral of `n` stars, two arms and a bright core, in a disc `r` across, dealt from a fixed seed. */
function spiral(n: number, r: number): { pos: Float32Array; mag: Float32Array } {
  let seed = 0x5a17;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pos = new Float32Array(n * 3);
  const mag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const core = i < n * 0.22;
    const d = core ? Math.pow(rnd(), 1.8) * 0.28 : 0.15 + Math.pow(rnd(), 0.8) * 0.85;
    const arm = rnd() < 0.5 ? 0 : Math.PI;
    const a = arm + d * 5.2 + (rnd() - 0.5) * (core ? 6.3 : 0.55);
    pos[i * 3] = Math.cos(a) * d * r;
    pos[i * 3 + 1] = (rnd() - 0.5) * (core ? 0.12 : 0.05) * r * (1 - d * 0.6);
    pos[i * 3 + 2] = Math.sin(a) * d * r;
    mag[i] = core ? 0.5 + rnd() * 0.5 : Math.pow(rnd(), 2.2);
  }
  return { pos, mag };
}

export function starMap(coneFrom: number): StarMap {
  const group = new THREE.Group();
  const boards = boardSlots();
  const { pos, mag } = spiral(MAP.stars, MAP.r);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  const mapMat = new THREE.ShaderMaterial({
    userData: { holo: true },
    vertexShader: MAP_VERT,
    fragmentShader: MAP_FRAG,
    uniforms: { uPixel: { value: 1 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(DECK.ship) }, uCore: { value: new THREE.Color('#E8F6FB') }, uGain: { value: 0.8 }, uBoards: { value: boards } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const disc = new THREE.Points(geo, mapMat);
  disc.onBeforeRender = (renderer) => void (mapMat.uniforms.uPixel.value = renderer.getPixelRatio());
  disc.frustumCulled = false;
  const tilt = new THREE.Group();
  tilt.position.y = MAP.y;
  tilt.rotation.x = 0.32;
  tilt.add(disc);
  group.add(tilt);

  // The cone of projected light from the emitter ring up to the map.
  const coneMat = new THREE.ShaderMaterial({
    userData: { holo: true },
    vertexShader: CONE_VERT,
    fragmentShader: CONE_FRAG,
    uniforms: { uColor: { value: new THREE.Color(DECK.ship) }, uTime: { value: 0 }, uGain: { value: 1 }, uBoards: { value: boards } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  // No taller than the conn's line to the Attention board's bottom bezel allows (holo-mask.ts).
  const H = coneHeight(MAP.y + 0.15, MAP.r * 0.95);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(MAP.r * 0.95, coneFrom, H, 64, 1, true).translate(0, H / 2, 0), coneMat);
  group.add(cone);

  // The ship's glow on the course.
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: '#E8F6FB', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.8 });
  glowMat.userData.holo = true;
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(0.32);
  group.add(glow);

  let t = 0;
  let gainK = 1;
  return {
    group,
    boards,
    step(dt, k) {
      t += dt * k;
      disc.rotation.y = t * 0.05;
      mapMat.uniforms.uTime.value = t;
      coneMat.uniforms.uTime.value = t;
      glowMat.opacity = (0.65 + 0.3 * Math.sin(t * 2.4)) * gainK;
    },
    ship(at) {
      glow.position.copy(at);
    },
    gain(k) {
      const g = Math.max(0, Math.min(1, k));
      mapMat.uniforms.uGain.value = 0.8 * g;
      coneMat.uniforms.uGain.value = g;
      gainK = g;
      group.visible = g > 0.001;
    },
  };
}
