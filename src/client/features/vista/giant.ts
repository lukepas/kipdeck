import * as THREE from 'three';
import { NOISE } from '../space/glsl';
import { SPACE_COLORS } from '../space/logic';

// The big body: a ringed gas giant off one side of the ship, filling about a third of a side port. Two
// draws: the planet with its atmosphere's glow past the limb (one sphere, a little bigger than the
// planet, ray-traced inside so the disc and the glow are one shader), and its ring. Its face is baked
// once per region into a map (bands stirred by turbulence, a few storms) and turns slowly; the light on
// it is the sun's, the same that throws the room's shadows, so its terminator falls where the key light
// comes from. The ring's shadow falls across its face and its own shadow across the ring, both worked
// out per pixel against the other's shape, and the ring's far side is hidden behind the planet the same
// way, so neither needs the other in the depth buffer. It is far: drawn round the camera on its own
// line of sight, as the sky is, so it stays put as you walk.

/** How far out it is drawn (m): inside the walk camera's far plane, ring and all. */
export const GIANT_AT = 78;
/** The ring's inner and outer radius, in the planet's. */
const RING = { inner: 1.32, outer: 2.25 } as const;
/** The atmosphere's shell, in the planet's radius. */
const SHELL = 1.07;
/** The face's map: longitude by latitude. */
const MAP = { w: 1024, h: 512 } as const;

/** The giants' palettes (deep, mid, pale, storm), all clear of the state hues (space/logic.ts ambientSafe). */
const PALETTES: readonly (readonly [string, string, string, string])[] = [
  [SPACE_COLORS.giantDeep, SPACE_COLORS.giantMid, SPACE_COLORS.giantPale, SPACE_COLORS.giantStorm],
  [SPACE_COLORS.giantDeep, SPACE_COLORS.planetC, SPACE_COLORS.planetB, SPACE_COLORS.giantPale],
  [SPACE_COLORS.nebulaIndigo, SPACE_COLORS.giantMid, SPACE_COLORS.band, SPACE_COLORS.giantStorm],
];

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** The face, by longitude and latitude: bands by latitude, sheared and stirred, with a few storms. */
const BAKE_FRAG = /* glsl */ `
uniform vec3 uDeep, uMid, uPale, uStorm;
uniform float uSeed;
varying vec2 vUv;
${NOISE}
void main() {
  float lon = vUv.x * 6.2831853;
  float lat = (vUv.y - 0.5) * 3.1415927;
  vec3 o = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 s = vec3(uSeed, uSeed * 0.7, uSeed * 1.3);
  // Turbulence that shears along the bands: the latitude is pushed about by noise stretched east-west.
  vec3 st = vec3(o.x * 2.0, o.y * 9.0, o.z * 2.0) + s;
  float turb = fbm(st, 5) - 0.5;
  float swirl = fbm(vec3(o.x * 5.0, o.y * 22.0, o.z * 5.0) + s * 1.7 + turb * 3.0, 4) - 0.5;
  float y = o.y + turb * 0.09 + swirl * 0.035;
  // The bands: a few broad zones and many fine belts.
  float zones = 0.5 + 0.5 * sin(y * 11.0 + sin(y * 3.0) * 2.0);
  float belts = 0.5 + 0.5 * sin(y * 47.0 + turb * 6.0);
  vec3 col = mix(uDeep, uMid, smoothstep(0.2, 0.8, zones));
  col = mix(col, uPale, smoothstep(0.55, 0.95, zones) * 0.8);
  col *= 0.82 + 0.3 * belts;
  // Storms: a big oval and a few small ones, pale, wound into the band they sit in.
  vec2 big = vec2(lon - 2.2, (lat + 0.38) * 2.4);
  float oval = exp(-dot(big, big) / 0.05);
  float small = smoothstep(0.78, 0.9, vnoise(vec3(o.x * 14.0, o.y * 40.0, o.z * 14.0) + s * 2.3)) * (0.5 + 0.5 * belts);
  col = mix(col, uStorm, clamp(oval * (0.7 + 0.3 * swirl * 4.0) + small * 0.6, 0.0, 1.0));
  // Darker toward the poles, hazed.
  col *= 0.65 + 0.35 * smoothstep(1.0, 0.55, abs(o.y));
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** The ring's density at radius rr (in the planet's): bands, gaps and a dark division, fading at both edges. */
const RING_GLSL = /* glsl */ `
float ringDensity(float rr) {
  float k = (rr - ${RING.inner.toFixed(2)}) / ${(RING.outer - RING.inner).toFixed(2)};
  if (k <= 0.0 || k >= 1.0) return 0.0;
  float bands = 0.6 + 0.25 * sin(k * 61.0) + 0.15 * sin(k * 23.0 + 1.3);
  float division = 1.0 - 0.85 * smoothstep(0.52, 0.55, k) * (1.0 - smoothstep(0.6, 0.63, k));
  float edges = smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.86, 1.0, k));
  return clamp(bands * division * edges * (0.6 + 0.4 * k), 0.0, 1.0);
}`;

const PLANET_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uCam, uSun, uAtmo;
uniform float uSpin, uGain, uRim;
varying vec3 vPos;
${RING_GLSL}
void main() {
  vec3 ro = uCam;
  vec3 rd = normalize(vPos - uCam);
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.0;
  float h = b * b - c;
  vec3 col;
  float alpha;
  if (h > 0.0) {
    vec3 n = normalize(ro + rd * (-b - sqrt(h)));
    // Longitude two ways round, taking the one that doesn't jump here, so no seam shows where atan wraps.
    float ua = atan(n.z, n.x) / 6.2831853 + 0.5;
    float ub = fract(ua + 0.5) - 0.5;
    float lon = fwidth(ua) <= fwidth(ub) + 1e-6 ? ua : ub;
    vec2 uv = vec2(lon + uSpin, asin(clamp(n.y, -1.0, 1.0)) / 3.1415927 + 0.5);
    vec3 alb = texture2D(uMap, uv).rgb;
    float ndl = dot(n, uSun);
    // A soft terminator, a little warm-grey dusk in it from the atmosphere.
    float lit = smoothstep(-0.1, 0.4, ndl) * (0.75 + 0.25 * smoothstep(0.4, 0.9, ndl));
    // The ring's shadow: from this point toward the sun, where it crosses the ring's plane.
    float shade = 1.0;
    if (abs(uSun.y) > 0.001) {
      float ts = -n.y / uSun.y;
      if (ts > 0.0) shade = 1.0 - 0.8 * ringDensity(length((n + uSun * ts).xz));
    }
    float mu = max(dot(n, -rd), 0.0);
    // Darker at the limb, and the atmosphere's scattering in a rim of its own colour on the lit side.
    float rim = pow(clamp(1.0 - mu, 0.0, 1.0), 3.0);
    col = alb * 1.7 * lit * shade * (0.6 + 0.4 * mu);
    col += uAtmo * rim * smoothstep(-0.25, 0.45, ndl) * 0.55 * uRim;
    // The night side: faint, with its rim still catching the atmosphere's scattered light.
    col += alb * 0.035 + uAtmo * rim * 0.06 * uRim;
    alpha = 1.0;
  } else {
    // Past the limb: the atmosphere's glow, thinning out over the shell, on the lit side only.
    float dmin = length(ro - rd * b);
    float glow = pow(1.0 - clamp((dmin - 1.0) / ${(SHELL - 1).toFixed(2)}, 0.0, 1.0), 3.0);
    float side = smoothstep(-0.3, 0.5, dot(normalize(ro - rd * b), uSun));
    col = uAtmo * glow * side * 0.7 * uRim;
    alpha = 0.0;
  }
  gl_FragColor = vec4(col * uGain, alpha);
  #include <colorspace_fragment>
}`;

const RING_FRAG = /* glsl */ `
uniform vec3 uCam, uSun, uRingA, uRingB;
uniform float uGain;
varying vec3 vPos;
${RING_GLSL}
void main() {
  vec3 q = vPos;
  float d = ringDensity(length(q.xz));
  // Behind the planet from here: hidden.
  vec3 rd = normalize(q - uCam);
  float b = dot(uCam, rd);
  float h = b * b - (dot(uCam, uCam) - 1.0);
  if (h > 0.0 && -b - sqrt(h) < length(q - uCam)) d = 0.0;
  // In the planet's shadow: from here toward the sun through the planet.
  float bs = dot(q, uSun);
  float shadow = (bs < 0.0 && bs * bs - (dot(q, q) - 1.0) > 0.0) ? 0.12 : 1.0;
  float k = (length(q.xz) - ${RING.inner.toFixed(2)}) / ${(RING.outer - RING.inner).toFixed(2)};
  vec3 col = mix(uRingA, uRingB, clamp(k, 0.0, 1.0)) * (0.2 + 0.3 * abs(uSun.y)) * shadow;
  gl_FragColor = vec4(col * d * uGain, d * 0.8);
  #include <colorspace_fragment>
}`;

const premultiplied = { transparent: true, depthWrite: false, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;

/** Where a region's giant is (space/sky.ts region()). */
export interface GiantPlace {
  dir: THREE.Vector3;
  size: number;
  tilt: number;
  spin: number;
  palette: number;
  seed: number;
}

export class Giant {
  readonly group = new THREE.Group();
  private readonly planet: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly ringMat: THREE.ShaderMaterial;
  private readonly map = new THREE.WebGLRenderTarget(MAP.w, MAP.h, { type: THREE.HalfFloatType, wrapS: THREE.RepeatWrapping, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  private readonly bakeMat: THREE.ShaderMaterial;
  private readonly bakeScene = new THREE.Scene();
  private readonly bakeCamera = new THREE.Camera();
  private readonly dir = new THREE.Vector3(-1, 0, 0);
  private readonly turn = new THREE.Quaternion();
  private readonly tilt = new THREE.Quaternion();
  private readonly inv = new THREE.Matrix4();
  private readonly sunWorld = new THREE.Vector3();
  private radius = 10;
  private spin0 = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.group.name = 'vista-giant';
    this.bakeMat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: { uDeep: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uPale: { value: new THREE.Color() }, uStorm: { value: new THREE.Color() }, uSeed: { value: 0 } },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMat);
    quad.frustumCulled = false;
    this.bakeScene.add(quad);

    const shared = { uCam: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uGain: { value: 1 } };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: PLANET_FRAG,
      ...premultiplied,
      uniforms: { ...shared, uMap: { value: this.map.texture }, uAtmo: { value: new THREE.Color(SPACE_COLORS.atmosphere) }, uSpin: { value: 0 }, uRim: { value: 1 } },
    });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(SHELL, 64, 32), this.mat);
    this.planet.renderOrder = -0.6;
    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: RING_FRAG,
      ...premultiplied,
      side: THREE.DoubleSide,
      uniforms: { ...shared, uRingA: { value: new THREE.Color(SPACE_COLORS.giantPale) }, uRingB: { value: new THREE.Color(SPACE_COLORS.giantMid) } },
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(RING.inner, RING.outer, 160, 1).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.renderOrder = -0.5;
    for (const m of [this.planet, this.ring]) {
      m.frustumCulled = false;
      this.group.add(m);
    }
    // Round whichever camera draws it, on its own line of sight; the camera's place in its own terms for the shaders.
    this.planet.onBeforeRender = (_r, _s, camera) => this.follow(camera);
  }

  /** Bakes and places region's giant: its face, its palette, where it hangs and how its ring is tilted. */
  place(p: GiantPlace) {
    const pal = PALETTES[p.palette % PALETTES.length];
    const u = this.bakeMat.uniforms;
    u.uDeep.value.set(pal[0]);
    u.uMid.value.set(pal[1]);
    u.uPale.value.set(pal[2]);
    u.uStorm.value.set(pal[3]);
    u.uSeed.value = p.seed;
    const was = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.map);
    this.renderer.render(this.bakeScene, this.bakeCamera);
    this.renderer.setRenderTarget(was);
    this.dir.copy(p.dir).normalize();
    this.radius = GIANT_AT * Math.sin(p.size / 2);
    this.spin0 = p.spin;
    // The ring's plane tipped toward the eye, its axis leaning: an open ellipse, never edge-on.
    this.tilt.setFromEuler(new THREE.Euler(p.tilt, Math.atan2(this.dir.x, this.dir.z), 0.35 * Math.sign(p.tilt), 'YXZ'));
  }

  /** The sun's way (world, unit), how bright the giant is (the sky's Day lift), its rim (given way), its turn, and the sky's turn round the ship (radians). */
  set(sun: THREE.Vector3, gain: number, rim: number, spin: number, skyAngle: number) {
    this.sunWorld.copy(sun);
    this.mat.uniforms.uGain.value = gain;
    this.mat.uniforms.uRim.value = rim;
    this.mat.uniforms.uSpin.value = this.spin0 + spin;
    // It turns round the ship with the sky (the sky's shader samples rotY(angle) times the view).
    this.turn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -skyAngle);
  }

  private readonly at = new THREE.Vector3();
  private follow(camera: THREE.Camera) {
    this.at.copy(this.dir).applyQuaternion(this.turn);
    this.group.position.copy(camera.position).addScaledVector(this.at, GIANT_AT);
    this.group.quaternion.copy(this.turn).multiply(this.tilt);
    this.group.scale.setScalar(this.radius);
    this.group.updateMatrixWorld(true);
    this.inv.copy(this.group.matrixWorld).invert();
    const u = this.mat.uniforms;
    u.uCam.value.copy(camera.position).applyMatrix4(this.inv);
    u.uSun.value.copy(this.sunWorld).transformDirection(this.inv);
  }

  /** The memory its face holds (bytes): half floats, four channels, with mips. */
  bytes(): number {
    return Math.round(MAP.w * MAP.h * 8 * 1.34);
  }
}
