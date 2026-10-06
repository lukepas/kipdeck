import * as THREE from 'three';
import { NOISE } from './glsl';
import { BOARD_SLOTS } from '../bridge/holo-mask';
import { SPACE_COLORS, seeded } from './logic';

// The sky round the ship: a region of space (a deep gradient, the galactic band with its dust lanes,
// a nebula in teal and indigo ahead with a lobe of it out of each side's ports) baked once into a
// cube, and a sphere round whichever camera is drawing that shows it, with crisp stars drawn over it
// per pixel so they stay a pixel or two wide in Walk and in the Overview alike. The nebula's emissive
// knots are baked apart (in the cube's alpha) and added back live: they dim while something needs the
// captain and keep well clear of the wall boards' faces. By Day the sky is paler and a little brighter.
// The sphere is drawn first and behind everything, so the sky only ever shows through the glass, and
// a flash or a swap of region on it lights the windows alone. A region also says where its giant hangs
// (features/vista).

/** How far out the sky's sphere is from the camera: inside both cameras' far planes. */
const RADIUS = 100;
/** The baked cube's faces (px): the band and the nebula are soft, the stars are drawn live. */
const FACE = 512;
/**
 * Day's planet under the ship: the way to its middle (ahead and below, a little to starboard) and its
 * radius on the sky (radians), so its day side fills the lower bow and its limb arcs about 28 degrees
 * over the horizon ahead, across the canopy over the situation arc from the chair, space over it.
 */
export const DAY_PLANET = (() => {
  const d = new THREE.Vector3(0.3, -0.42, -1).normalize();
  return { dir: [d.x, d.y, d.z] as [number, number, number], radius: (42 * Math.PI) / 180 };
})();

/** How fast the sky turns round the ship (radians a second): 3 degrees a minute. */
export const SKY_TURN = (3 * Math.PI) / 180 / 60;

const linear = (hex: string) => new THREE.Color(hex);

const BAKE_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * The sky's bake, by direction (vDir): what features/atmos samples small, for the room's light from
 * outside. Its colour is the sky without its knots; its alpha is the nebula's emissive knots, which the
 * live sky adds back in their own gas's hue (and dims when something needs the captain).
 *
 * The galactic band is a soft great circle, mottled, with dark dust lanes cut through its middle. The
 * nebula is domain-warped fbm twice over in a patch of sky: thin gas indigo, dense gas teal, a deep
 * magenta heart, ridged filaments lit through it, and lanes of dust dark enough to read against it, so
 * from a side port it has value contrast and never reads as grey haze.
 */
export const BAKE_FRAG = /* glsl */ `
uniform vec3 uVoid, uDeep, uBand, uBandCore, uTeal, uIndigo, uMagenta;
uniform vec3 uBandN, uCore, uNeb, uSeed;
uniform float uNebSize;
uniform vec3 uLobeA, uLobeB;
uniform float uLobeSize;
varying vec3 vDir;
${NOISE}
/** How far inside a soft patch of sky (size in radians) round at the direction d is (0-1). */
float patchOf(vec3 d, vec3 at, float size) {
  return smoothstep(cos(size), cos(size * 0.2), dot(d, at));
}
/** Ridged fbm (0 to about 1): sharp crests where the noise crosses its middle, for filaments. */
float ridged(vec3 p, int octaves) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    float r = 1.0 - abs(2.0 * vnoise(p) - 1.0);
    s += a * r * r;
    p = p * 2.03 + vec3(17.1, 9.2, 4.7);
    a *= 0.5;
  }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uVoid, uDeep, clamp(0.2 + 0.3 * d.y, 0.0, 1.0));
  // The galactic band: a great circle, its edges wobbling, brighter toward the core.
  float h = dot(d, uBandN);
  float wob = fbm(d * 2.2 + uSeed, 3) - 0.5;
  float x = (h + wob * 0.07) / 0.17;
  float band = exp(-x * x);
  float core = pow(max(dot(d, uCore), 0.0), 2.5);
  float coreW = exp(-(h * h) / 0.012) * core;
  float mott = fbm(d * 7.0 + uSeed * 1.3, 4);
  // Dust lanes along its middle: sharp-edged and nearly black where they are thickest.
  float dust = fbm(d * 3.6 + uSeed * 0.7 + 5.0, 5) + 0.18 * (ridged(d * 11.0 + uSeed, 3) - 0.45);
  float lane = 1.0 - 0.86 * smoothstep(0.47, 0.6, dust) * exp(-(h * h) / 0.022);
  float bandL = (0.55 * band * (0.06 + 1.6 * smoothstep(0.42, 0.8, mott)) + 0.9 * coreW) * lane;
  // The band bright enough to read as a galaxy through the glass from the chair (it was a faint smudge):
  // its arms near-white, its core warm white, swelling round the core.
  col += mix(uBand, uBandCore, clamp(coreW * 1.6, 0.0, 1.0)) * bandL * (1.6 + 1.8 * core);
  // A fine haze of unresolved stars in the band, clumped.
  col += uBand * band * lane * smoothstep(0.5, 0.8, fbm(d * 26.0 + uSeed, 3)) * 0.16;
  // Coloured lanes of gas along the band's two edges, magenta on one side and teal on the other, with
  // indigo between: the galaxy reads as colour, not as grey haze.
  float ea = (h - 0.16 + wob * 0.05) / 0.09;
  float eb = (h + 0.15 + wob * 0.05) / 0.08;
  float edgeA = exp(-ea * ea);
  float edgeB = exp(-eb * eb);
  float gasL = smoothstep(0.35, 0.75, fbm(d * 4.2 + uSeed * 0.9 + 17.0, 4)) * (0.45 + 0.55 * core);
  col += uMagenta * edgeA * gasL * 1.6 + uTeal * edgeB * gasL * 2.2 + uIndigo * band * gasL * 0.8 * (1.0 - coreW);
  // The nebula: fbm warped by fbm warped by fbm, in a soft patch round uNeb.
  vec3 q = d * 2.4 + uSeed * 2.1;
  vec3 w = vec3(fbm(q, 4), fbm(q + 3.1, 4), fbm(q + 7.7, 4));
  vec3 r = q * 1.7 + w * 3.0;
  vec3 w2 = vec3(fbm(r + 1.3, 3), fbm(r + 5.9, 3), fbm(r + 9.4, 3));
  float n = fbm(q * 1.5 + w2 * 2.6, 5);
  // The nebula proper ahead, and two smaller lobes of it abeam, out of the side ports.
  float shape = max(patchOf(d, uNeb, uNebSize), max(patchOf(d, uLobeA, uLobeSize), patchOf(d, uLobeB, uLobeSize * 0.85)) * 0.9);
  float gas = smoothstep(0.34, 0.74, n) * shape;
  // Filaments: ridges of the warped field, brightest where the gas is.
  float fil = ridged(q * 3.2 + w2 * 2.2 + 13.0, 4);
  vec3 nebC = mix(uIndigo, uTeal * 1.35, smoothstep(0.32, 0.66, n + 0.3 * (fbm(q * 0.8 + 11.0, 3) - 0.5)));
  nebC = mix(nebC, uMagenta, smoothstep(0.52, 0.78, fbm(q * 1.1 + 23.0, 3)) * smoothstep(0.46, 0.76, n) * 0.85);
  float emis = gas * gas * (0.45 + 1.7 * fil * fil);
  col += nebC * emis * 9.0;
  // A faint wide glow round the whole patch, so its edge falls off into the void rather than stopping.
  col += mix(uIndigo, uMagenta, 0.35) * shape * smoothstep(0.2, 0.6, n) * 1.1;
  // Lanes of dust across the nebula (and the band behind it), dark and crisp.
  float dl = fbm(q * 2.2 + w * 1.8 + 31.0, 5);
  float dark = smoothstep(0.5, 0.6, dl) * smoothstep(0.0, 0.5, shape);
  col *= 1.0 - 0.72 * dark;
  // Space is saturated: the gas's colour pushed past the tone mapping's pull toward white.
  float lumC = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(vec3(lumC) + (col - vec3(lumC)) * 1.45, vec3(0.0));
  // The knots: compact bright cores on the filaments, in the dense gas, off the dust.
  float blob = vnoise(q * 9.0 + w2 * 3.0 + 41.0);
  float knot = smoothstep(0.66, 0.92, blob) * smoothstep(0.32, 0.68, fil) * smoothstep(0.25, 0.7, gas) * (1.0 - dark);
  gl_FragColor = vec4(col, clamp(knot, 0.0, 1.0));
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
varying vec4 vClip;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vClip = gl_Position;
}`;

const SKY_FRAG = /* glsl */ `
uniform samplerCube uA;
uniform samplerCube uB;
uniform float uMix;
uniform mat3 uRot;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform vec3 uLift;
const float KNOT = 0.85;
uniform vec3 uCool, uWarm;
uniform float uDim;
uniform float uDrift;
uniform float uBoost;
uniform float uDay;
uniform vec4 uPlanet;
uniform vec3 uOcean, uLand, uAtmo;
varying vec3 vDir;
varying vec4 vClip;
${NOISE}
uniform vec4 uBoards[${BOARD_SLOTS}];
/** 0 on a wall board's face and within 0.12 (NDC) of it, 1 clear of every one. */
float clearOfBoards(vec2 p) {
  float m = 1.0;
  for (int i = 0; i < ${BOARD_SLOTS}; i++) {
    vec4 r = uBoards[i];
    vec2 inside = min(p - r.xy, r.zw - p);
    m *= 1.0 - smoothstep(-0.12, -0.02, inside.x) * smoothstep(-0.12, -0.02, inside.y);
  }
  return m;
}

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
  vec3 col = sky.rgb;
  // More stars where the sky is brighter (the band, the nebula), fewer in the dust lanes.
  float density = 0.55 + 1.6 * clamp(dot(col, vec3(0.3, 0.5, 0.2)) * 7.0, 0.0, 1.0);
  // The knots, in their own gas's hue lifted toward white, dimmed (uDim) while something needs the
  // captain, and kept off the wall boards' faces (and well clear of them, so they never glow over a row).
  vec3 hue = col / max(max(col.r, max(col.g, col.b)), 1e-3);
  vec2 ndc = vClip.xy / max(vClip.w, 1e-4);
  float clear = clearOfBoards(ndc);
  // The knots shimmer as the gas drifts: a slow wave of brightness travelling through them.
  float drift = 0.72 + 0.28 * sin(dot(d, vec3(9.0, 6.0, 4.0)) + uDrift * 0.9) * sin(dot(d, vec3(-5.0, 8.0, 3.0)) - uDrift * 0.55);
  col += mix(hue, vec3(1.0), 0.4) * sky.a * KNOT * uDim * clear * drift;
  // The mission complete: the galaxy brightens for a few seconds (1 at rest).
  col *= uBoost;
  // Behind the wall boards and just round them the sky sinks to a quarter: the arc always has a dark
  // ground behind its smoked glass, however bright the gas is there, and its type keeps its contrast.
  col *= mix(0.22, 1.0, clear);
  // The finest layer is the moving far stars' (stars.ts): the sky's own start a step coarser.
  col += stars(d, 60.0, 0.16, 1.0, 1.25, density);
  col += stars(d, 22.0, 0.20, 1.6, 1.6, 1.0);
  // By Day the ship is in high orbit over a sunlit planet: space over it a little lifted, and the
  // planet's day side filling the lower bow, its limb a bright blue arc with the atmosphere's glow over
  // it. Fixed to the ship (vDir, not the sky's slow turn), so the horizon holds still.
  if (uDay > 0.001) {
    col = col * (1.0 - 0.6 * uDay) + uLift * uDay * 0.3;
    vec3 v = normalize(vDir);
    float c = dot(v, uPlanet.xyz);
    float edge = cos(uPlanet.w);
    // Angle in from the limb (radians, about): positive on the planet, negative over it.
    float into = (c - edge) / max(sin(uPlanet.w), 1e-3);
    // The sun high over the ship's port quarter: the face we see is the day side, its terminator off to starboard.
    vec3 sunD = normalize(vec3(-0.55, 0.7, 0.45));
    if (into > 0.0) {
      // The ray onto a unit sphere seen from its own orbit (sin of its angular radius = 1 / distance),
      // so the ground foreshortens toward the limb as it does from a ship.
      float D = 1.0 / max(sin(uPlanet.w), 0.05);
      float disc = max(1.0 - D * D * (1.0 - c * c), 0.0);
      vec3 H = v * (D * c - sqrt(disc)) - uPlanet.xyz * D;
      float cl = smoothstep(0.56, 0.7, fbm(H * vec3(18.0, 30.0, 18.0) + vec3(3.1, 7.7, 1.9), 5)) * smoothstep(0.35, 0.6, fbm(H * 4.0 + 2.0, 3));
      float land = smoothstep(0.52, 0.56, fbm(H * 5.0 + vec3(11.0), 5));
      vec3 ground = mix(uOcean, uLand, land);
      float lit = clamp(0.15 + 1.1 * dot(H, sunD), 0.03, 1.25);
      vec3 surf = mix(ground, vec3(0.95, 0.97, 1.0), cl * 0.9) * lit;
      // Seen through more air toward the limb: bluer and brighter.
      float slant = 1.0 - clamp(dot(H, -v), 0.0, 1.0);
      surf = mix(surf, uAtmo * (0.6 + 1.4 * lit), slant * slant * 0.85);
      col = mix(col, surf * 1.7, uDay * smoothstep(0.0, 0.003, into));
    }
    // The atmosphere's glow over the limb, fading into space.
    float glow = exp(-max(-into, 0.0) / 0.05) * step(into, 0.0);
    col += uAtmo * (glow * 1.8 + exp(-max(-into, 0.0) / 0.012) * step(into, 0.0) * 1.5) * uDay;
  }
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
  /** The nebula's two lobes abeam, one out of each side's ports, and how big they are (radians). */
  lobes: [THREE.Vector3, THREE.Vector3];
  lobeSize: number;
  seed: THREE.Vector3;
  /** The big body off one side (features/vista): the way to it, how big it looks (radians across its disc), its ring's tilt and its palette. */
  giant: { dir: THREE.Vector3; size: number; tilt: number; spin: number; palette: number; seed: number };
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
  // A lobe abeam on each side, a little up, ahead of or behind the beam.
  const lobe = (side: number, az: number, up: number) => new THREE.Vector3(side * Math.cos(up) * Math.cos(az), Math.sin(up), Math.cos(up) * Math.sin(az));
  const lobes: [THREE.Vector3, THREE.Vector3] = n === 0 ? [lobe(-1, 0.35, 0.16), lobe(1, -0.3, 0.05)] : [lobe(-1, (r() - 0.5) * 0.9, r() * 0.3), lobe(1, (r() - 0.5) * 0.9, r() * 0.3)];
  // The big body: out of the port side's ports on arrival, a little aft of the beam and over the eye;
  // after that on either side, never ahead or astern, so it stays out of the forward glass.
  const gSide = n === 0 ? -1 : r() < 0.5 ? -1 : 1;
  const gAz = (n === 0 ? 0 : (r() - 0.4) * 40) * deg;
  const gUp = (n === 0 ? 2.5 : 2 + r() * 9) * deg;
  const giant = {
    dir: new THREE.Vector3(gSide * Math.cos(gUp) * Math.cos(gAz), Math.sin(gUp), Math.cos(gUp) * Math.sin(gAz)),
    size: (n === 0 ? 12 : 9 + r() * 6) * deg,
    tilt: (n === 0 ? 0.42 : 0.2 + r() * 0.5) * (r() < 0.5 ? -1 : 1),
    spin: r(),
    palette: n === 0 ? 0 : Math.floor(r() * 3),
    seed: r() * 50,
  };
  return { bandN, core, neb, nebSize: (n === 0 ? 46 : 32 + r() * 16) * deg, lobes, lobeSize: (n === 0 ? 28 : 22 + r() * 10) * deg, seed, giant };
}

/** The side (-1 west, 1 east) clear of region `n`'s giant: where a passing planet goes. */
export function clearOfGiant(n: number): -1 | 1 {
  return region(n).giant.dir.x < 0 ? 1 : -1;
}

/** The bake's uniforms, for a region set with setRegion: the sky's cube and features/atmos's small sky share them. */
export function bakeUniforms(): Record<string, THREE.IUniform> {
  return {
    uVoid: { value: linear(SPACE_COLORS.void) },
    uDeep: { value: linear(SPACE_COLORS.deep) },
    uBand: { value: linear(SPACE_COLORS.band) },
    uBandCore: { value: linear(SPACE_COLORS.bandCore) },
    uTeal: { value: linear(SPACE_COLORS.nebulaTeal) },
    uIndigo: { value: linear(SPACE_COLORS.nebulaIndigo) },
    uMagenta: { value: linear(SPACE_COLORS.nebulaMagenta) },
    uBandN: { value: new THREE.Vector3(0, 1, 0) },
    uCore: { value: new THREE.Vector3(0, 0, -1) },
    uNeb: { value: new THREE.Vector3(0, 0, -1) },
    uSeed: { value: new THREE.Vector3() },
    uNebSize: { value: 0.5 },
    uLobeA: { value: new THREE.Vector3(-1, 0, 0) },
    uLobeB: { value: new THREE.Vector3(1, 0, 0) },
    uLobeSize: { value: 0.4 },
  };
}

/** Sets the bake's uniforms (bakeUniforms) to region `n`. */
export function setRegion(u: Record<string, THREE.IUniform>, n: number) {
  const r = region(n);
  u.uBandN.value.copy(r.bandN);
  u.uCore.value.copy(r.core);
  u.uNeb.value.copy(r.neb);
  u.uSeed.value.copy(r.seed);
  u.uNebSize.value = r.nebSize;
  u.uLobeA.value.copy(r.lobes[0]);
  u.uLobeB.value.copy(r.lobes[1]);
  u.uLobeSize.value = r.lobeSize;
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
  /** Which region each cube holds. */
  private readonly held = [0, -1];
  private readonly rot = new THREE.Matrix4();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    boards: THREE.Vector4[],
  ) {
    const opts = { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.targets = [new THREE.WebGLCubeRenderTarget(FACE, opts), new THREE.WebGLCubeRenderTarget(FACE, opts)];
    this.bakeMat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms: bakeUniforms(),
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
        uDrift: { value: 0 },
        uBoost: { value: 1 },
        uDay: { value: 0 },
        uLift: { value: linear(SPACE_COLORS.dayLift) },
        uPlanet: { value: new THREE.Vector4(...DAY_PLANET.dir, DAY_PLANET.radius) },
        uOcean: { value: linear(SPACE_COLORS.dayOcean) },
        uLand: { value: linear(SPACE_COLORS.dayLand) },
        uAtmo: { value: linear(SPACE_COLORS.dayAtmosphere) },
        uBoards: { value: boards },
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
    setRegion(this.bakeMat.uniforms, n);
    this.held[slot] = n;
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

  /** The region showing now (the one more than half faded in), and how far the sky has turned round the ship (radians). */
  view(): { region: number; angle: number } {
    const mix = this.material.uniforms.uMix.value as number;
    const shown = (this.front === 0 ? mix : 1 - mix) > 0.5 ? 1 - this.front : this.front;
    return { region: this.held[shown], angle: this.angle };
  }

  /** Turns the sky `dt` seconds' worth round the ship, and drifts the nebula's knots. */
  turn(dt: number) {
    this.angle = (this.angle + SKY_TURN * dt) % (Math.PI * 2);
    this.material.uniforms.uDrift.value += dt;
    this.rot.makeRotationY(this.angle);
    this.material.uniforms.uRot.value.setFromMatrix4(this.rot);
  }

  /** The warp's flash over the sky (0-1). */
  setFlash(k: number) {
    this.material.uniforms.uFlash.value = k;
  }
  /** How bright the nebula's knots are (1, or less while something needs the captain). */
  setDim(k: number) {
    this.material.uniforms.uDim.value = k;
  }
  /** How bright the whole sky is, times its own (the mission complete lifts it 30%). */
  setBoost(k: number) {
    this.material.uniforms.uBoost.value = k;
  }
  /** How far toward Day the sky is (0 Night, 1 Day): paler and brighter. */
  setDay(k: number) {
    this.material.uniforms.uDay.value = k;
  }
}
