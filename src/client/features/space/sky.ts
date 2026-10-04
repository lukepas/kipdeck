import * as THREE from 'three';
import { NOISE } from './glsl';
import { SPACE_COLORS, seeded } from './logic';

// The sky round the ship: a region of space (a deep gradient, the galactic band with its dust lanes,
// one nebula in teal and indigo) baked once into a cube, and a sphere round whichever camera is
// drawing that shows it, with crisp stars drawn over it per pixel so they stay a pixel or two wide in
// Walk and in the Overview alike. The sphere is drawn first and behind everything, so the sky only
// ever shows through the glass, and a flash or a swap of region on it lights the windows alone.

/** How far out the sky's sphere is from the camera: inside both cameras' far planes. */
const RADIUS = 100;
/** The baked cube's faces (px): the band and the nebula are soft, the stars are drawn live. */
const FACE = 512;
/** How fast the sky turns round the ship (radians a second): 0.6 degrees a minute. */
export const SKY_TURN = (0.6 * Math.PI) / 180 / 60;

const linear = (hex: string) => new THREE.Color(hex);

const BAKE_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BAKE_FRAG = /* glsl */ `
uniform vec3 uVoid, uDeep, uBand, uTeal, uIndigo;
uniform vec3 uBandN, uCore, uNeb, uSeed;
uniform float uNebSize;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uVoid, uDeep, 0.35 + 0.35 * d.y);
  // The galactic band: a great circle, its edges wobbling, brighter toward the core.
  float h = dot(d, uBandN);
  float wob = fbm(d * 2.2 + uSeed, 3) - 0.5;
  float x = (h + wob * 0.07) / 0.18;
  float band = exp(-x * x);
  float core = pow(max(dot(d, uCore), 0.0), 2.5);
  float coreW = exp(-(h * h) / 0.012) * core;
  float mott = fbm(d * 7.0 + uSeed * 1.3, 4);
  // Dust lanes along its middle.
  float dust = fbm(d * 3.6 + uSeed * 0.7 + 5.0, 5);
  float lane = mix(1.0, 0.35, smoothstep(0.5, 0.62, dust) * exp(-(h * h) / 0.02));
  float bandL = (0.6 * band * (0.5 + 0.8 * mott) + 0.55 * coreW) * lane;
  col += uBand * bandL * 0.34;
  // A fine haze of unresolved stars in the band.
  col += uBand * band * smoothstep(0.45, 0.75, fbm(d * 26.0 + uSeed, 3)) * 0.07;
  // The nebula: domain-warped fbm in a soft patch, teal into indigo.
  vec3 q = d * 2.6 + uSeed * 2.1;
  vec3 w = vec3(fbm(q, 4), fbm(q + 3.1, 4), fbm(q + 7.7, 4));
  float n = fbm(q * 1.5 + w * 2.4, 5);
  float shape = smoothstep(cos(uNebSize), cos(uNebSize * 0.25), dot(d, uNeb));
  float neb = smoothstep(0.3, 0.62, n) * shape;
  vec3 nebC = mix(uTeal, uIndigo, smoothstep(0.35, 0.65, fbm(q * 0.8 + 11.0, 3)));
  col += nebC * neb * 0.95;
  // A filament or two of brighter gas through it.
  col += nebC * smoothstep(0.58, 0.66, n) * shape * 0.3;
  gl_FragColor = vec4(col, clamp(band * 0.8 + coreW + neb * 0.5, 0.0, 1.0));
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform samplerCube uA;
uniform samplerCube uB;
uniform float uMix;
uniform mat3 uRot;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform vec3 uCool, uWarm;
uniform float uDim;
varying vec3 vDir;
${NOISE}

/** One layer of stars: one at most in each of N x N cells on each face of a cube round the sky. */
vec3 stars(vec3 d, float n, float prob, float gain, float sizePx, float density) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec2 g = (uv * 0.5 + 0.5) * n;
  vec2 cell = floor(g);
  vec3 r = hash33(vec3(cell, face * 13.0 + n));
  float on = step(r.z, prob * density);
  vec2 at = cell + 0.25 + 0.5 * r.xy;
  // A pixel's size in cells, from the direction (smooth across the cube's seams), not from g (which jumps there).
  float px = max(length(fwidth(d)) * n * 0.5, 1e-4);
  float dist = length(g - at) / px;
  float mag = pow(max(hash13(vec3(cell * 1.7, face + n * 3.0)), 0.0), 5.0);
  // At least a pixel and a half across, a soft gaussian core: a star never shrinks under a pixel and crawls.
  float size = max(1.5, sizePx * (0.7 + 1.1 * mag));
  float core = exp(-(dist * dist) / (size * size * 0.36));
  vec3 tint = mix(uCool, uWarm, hash13(vec3(cell, face + 91.0)));
  // The faintest fade out rather than draw as specks.
  return tint * on * core * gain * smoothstep(0.02, 0.2, mag) * (0.12 + 0.88 * mag);
}

void main() {
  vec3 d = normalize(uRot * vDir);
  vec4 a = textureCube(uA, d);
  vec4 b = textureCube(uB, d);
  vec4 sky = mix(a, b, uMix);
  float density = 0.55 + 1.6 * sky.a;
  vec3 col = sky.rgb;
  // The finest layer is the moving far stars' (stars.ts): the sky's own start a step coarser.
  col += stars(d, 60.0, 0.16, 1.0, 1.25, density);
  col += stars(d, 22.0, 0.20, 1.6, 1.6, 1.0);
  col *= uDim;
  // The jump's flash: light added over the sky, so its stars and its band still show through it.
  col += uFlashColor * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** A region of sky: where the band runs, where its core is, and where the nebula sits. */
export interface Region {
  bandN: THREE.Vector3;
  core: THREE.Vector3;
  neb: THREE.Vector3;
  nebSize: number;
  seed: THREE.Vector3;
}

/**
 * The `n`th region the ship comes to. The first has its nebula 20 degrees right of the bow, a little
 * up, so it shows in the forward viewport on arrival; each later one is dealt from the seed, its
 * nebula somewhere ahead.
 */
export function region(n: number): Region {
  const r = seeded(0x5eed + n * 7919);
  const deg = Math.PI / 180;
  // The band is tilted 20 to 30 degrees off the horizon: it rises over the bow into the canopy and
  // comes down to about eye level abeam, so it crosses the side ports as well as the forward glass.
  const ahead = n === 0 ? new THREE.Vector3(0.12, 0.5, -1) : new THREE.Vector3((r() - 0.5) * 0.5, 0.36 + r() * 0.22, -1);
  const side = n === 0 ? new THREE.Vector3(1, 0.05, 0.12) : new THREE.Vector3(r() < 0.5 ? -1 : 1, (r() - 0.3) * 0.16, (r() - 0.5) * 0.4);
  const bandN = new THREE.Vector3().crossVectors(ahead, side).normalize();
  // Its bright core ahead, a little to one side of the bow.
  const core = n === 0 ? new THREE.Vector3(-0.35, 0.3, -1) : new THREE.Vector3((r() - 0.5) * 1.4, 0.2, -1);
  core.sub(bandN.clone().multiplyScalar(core.dot(bandN))).normalize();
  const nebAz = n === 0 ? 20 * deg : (r() - 0.5) * 80 * deg;
  const nebUp = n === 0 ? 14 * deg : (6 + r() * 20) * deg;
  // Ahead is -z; right of the bow, facing it, is +x.
  const neb = new THREE.Vector3(Math.sin(nebAz) * Math.cos(nebUp), Math.sin(nebUp), -Math.cos(nebAz) * Math.cos(nebUp));
  const seed = new THREE.Vector3(r() * 40, r() * 40, r() * 40);
  return { bandN, core, neb, nebSize: (n === 0 ? 34 : 24 + r() * 16) * deg, seed };
}

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly targets: [THREE.WebGLCubeRenderTarget, THREE.WebGLCubeRenderTarget];
  private readonly bakeScene = new THREE.Scene();
  private readonly bakeMat: THREE.ShaderMaterial;
  private readonly cubeCamera: THREE.CubeCamera;
  /** Which of the two cubes is showing (the other takes the next region). */
  private front = 0;
  private angle = 0;
  private readonly rot = new THREE.Matrix4();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const opts = { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.targets = [new THREE.WebGLCubeRenderTarget(FACE, opts), new THREE.WebGLCubeRenderTarget(FACE, opts)];
    this.bakeMat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uVoid: { value: linear(SPACE_COLORS.void) },
        uDeep: { value: linear(SPACE_COLORS.deep) },
        uBand: { value: linear(SPACE_COLORS.band) },
        uTeal: { value: linear(SPACE_COLORS.nebulaTeal) },
        uIndigo: { value: linear(SPACE_COLORS.nebulaIndigo) },
        uBandN: { value: new THREE.Vector3() },
        uCore: { value: new THREE.Vector3() },
        uNeb: { value: new THREE.Vector3() },
        uSeed: { value: new THREE.Vector3() },
        uNebSize: { value: 0.5 },
      },
    });
    this.bakeScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.bakeMat));
    this.cubeCamera = new THREE.CubeCamera(0.1, 50, this.targets[0]);

    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      uniforms: {
        uA: { value: this.targets[0].texture },
        uB: { value: this.targets[1].texture },
        uMix: { value: 0 },
        uRot: { value: new THREE.Matrix3() },
        uFlash: { value: 0 },
        uFlashColor: { value: linear(SPACE_COLORS.flash) },
        uCool: { value: linear(SPACE_COLORS.starCool) },
        uWarm: { value: linear(SPACE_COLORS.starWarm) },
        uDim: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 48, 24), this.material);
    this.mesh.name = 'space-sky';
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    // Round whichever camera draws it, the walk camera or the Overview's. The Overview's is
    // orthographic: its parallel rays meet the far side of the sphere across a patch of sky as wide as
    // the sphere is small against the view, so there the sphere shrinks to just cover the view and
    // shows about a third of the sky rather than a magnified sliver of it.
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      this.mesh.position.copy(camera.position);
      const o = camera as THREE.OrthographicCamera;
      const r = o.isOrthographicCamera ? (1.12 * Math.hypot(o.right - o.left, o.top - o.bottom)) / 2 / o.zoom : RADIUS;
      this.mesh.scale.setScalar(r / RADIUS);
      this.mesh.updateMatrixWorld();
    };
    this.bake(0, 0);
  }

  /** Bakes region `n` into cube `slot`. About six draws of a full face each: done once, and again on a jump. */
  private bake(n: number, slot: number) {
    const r = region(n);
    const u = this.bakeMat.uniforms;
    u.uBandN.value.copy(r.bandN);
    u.uCore.value.copy(r.core);
    u.uNeb.value.copy(r.neb);
    u.uSeed.value.copy(r.seed);
    u.uNebSize.value = r.nebSize;
    this.cubeCamera.renderTarget = this.targets[slot];
    const was = this.renderer.getRenderTarget();
    this.cubeCamera.update(this.renderer, this.bakeScene);
    this.renderer.setRenderTarget(was);
  }

  /** Which region the cube that isn't showing holds, once one has been baked into it. */
  private ready = -1;

  /**
   * Makes region `n` ready in the cube that isn't showing, to swap to with `show`. Space bakes the
   * next region in idle time after each swap, so a jump's own start finds it ready and doesn't stall.
   */
  prepare(n: number) {
    if (this.ready === n) return;
    this.bake(n, 1 - this.front);
    this.ready = n;
  }

  /** How far the prepared region has replaced the showing one (0-1); at 1 it is the showing one. */
  show(k: number) {
    const toB = this.front === 0;
    this.material.uniforms.uMix.value = toB ? k : 1 - k;
    if (k >= 1) {
      this.front = 1 - this.front;
      this.ready = -1;
    }
  }

  /** Turns the sky `dt` seconds' worth round the ship. */
  turn(dt: number) {
    this.angle = (this.angle + SKY_TURN * dt) % (Math.PI * 2);
    this.rot.makeRotationY(this.angle);
    this.material.uniforms.uRot.value.setFromMatrix4(this.rot);
  }

  /** The warp's flash over the sky (0-1), and how bright the sky is otherwise (ducked while something needs you). */
  setFlash(k: number) {
    this.material.uniforms.uFlash.value = k;
  }
  setDim(k: number) {
    this.material.uniforms.uDim.value = k;
  }
}
