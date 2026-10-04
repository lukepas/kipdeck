import * as THREE from 'three';
import { FAR } from '../../core/scene';
import { SPACE_COLORS, seeded } from './logic';

// The stars streaming past: three layers of points in a long box round the ship, each drifting aft
// (the ship goes north, -z) at its own speed and wrapping round, the near ones fast enough to read as
// parallax in the side ports. Each layer is one draw; a jump or a surge adds one more per layer for
// the streaks, and only while it runs. Stars fade out well before the hull, so none is ever inside.
//
// The walk camera sees no further than FAR: a star past that is drawn on its own line of sight at
// just under FAR, so it lands on the same pixel and still sits behind every wall. The Overview's
// camera is orthographic, so its stars are drawn where they are. The stars test depth (they're drawn
// with the see-through things, after the walls, which must hide them) but write none; the sky's sphere
// (RADIUS, sky.ts) is nearer than STAR_CLAMP and still behind them only because it neither tests nor
// writes depth and is drawn first. Glass that wrote depth would hide the stars and not the sky.

interface LayerSpec {
  count: number;
  /** The box's half sizes (m): x, y, z. */
  box: readonly [number, number, number];
  /** Point size at its typical distance (px). */
  size: number;
  /** How far off a star is drawn at `size` (m); nearer ones draw bigger, up to twice. */
  at: number;
  /** Cruise speed (m/s). */
  speed: number;
  gain: number;
}

const LAYERS: readonly LayerSpec[] = [
  { count: 6000, box: [320, 160, 600], size: 1.0, at: 260, speed: 2, gain: 0.55 },
  { count: 2500, box: [200, 110, 400], size: 1.6, at: 140, speed: 8, gain: 0.8 },
  { count: 400, box: [110, 70, 260], size: 2.4, at: 70, speed: 30, gain: 1.0 },
];

/** How far out a star past the walk camera's far plane is drawn, on its own line of sight (see above). */
export const STAR_CLAMP = FAR * 0.92;

/** The ship's own bulk round the deck (m): stars inside 1.5 times it fade away. */
const SHIP = new THREE.Vector3(32, 22, 46);
/** How long a streak is at full stretch, against its layer's box length. */
const STREAK = 0.6;
/** The stretch that draws streaks at full length (a jump's). */
const FULL_STRETCH = 60;

const VERT = /* glsl */ `
attribute float aMag;
attribute float aTail;
uniform float uTravel;
uniform float uBoxZ;
uniform float uClamp;
uniform float uSize;
uniform float uAt;
uniform float uPixel;
uniform float uStreak;
uniform vec3 uShip;
varying float vAlpha;
varying float vMag;
/** The smallest a point is drawn (px): a star never goes under two pixels, which would crawl as it moves. */
const float MIN_PX = 2.0;
void main() {
  vec3 p = position;
  p.z = mod(p.z + uTravel + uBoxZ, 2.0 * uBoxZ) - uBoxZ;
  // The tail of a streak trails where the star came from (ahead, -z).
  p.z -= aTail * uStreak;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  float dist = length(view.xyz);
  if (dist > uClamp) view.xyz *= uClamp / dist;
  gl_Position = projectionMatrix * view;
  float want = uSize * uPixel * clamp(uAt / max(dist, 1.0), 0.75, 1.5);
  // Drawn no smaller than MIN_PX, its light spread over the bigger dot so it's just as bright in all.
  float drawn = max(want, MIN_PX * uPixel);
  gl_PointSize = drawn;
  float q = length(p / uShip);
  vAlpha = smoothstep(1.0, 1.6, q) * (1.0 - aTail) * min(1.0, (want * want) / (drawn * drawn) * 1.6);
  // Fade in from the far end of the box and out at the near end, so the wrap never pops.
  vAlpha *= smoothstep(uBoxZ, uBoxZ * 0.8, abs(p.z));
  vMag = aMag;
}`;

const POINT_FRAG = /* glsl */ `
uniform vec3 uCool, uWarm;
uniform float uGain;
varying float vAlpha;
varying float vMag;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // A gaussian dot, not a hard disc: no edge to snap from pixel to pixel as it drifts.
  float a = exp(-dot(c, c) * 9.0) * vAlpha;
  vec3 col = mix(uCool, uWarm, fract(vMag * 37.0)) * uGain * (0.25 + 0.75 * vMag);
  gl_FragColor = vec4(col * a, 1.0);
  #include <colorspace_fragment>
}`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uCool;
uniform float uGain;
varying float vAlpha;
varying float vMag;
void main() {
  gl_FragColor = vec4(uCool * uGain * (0.3 + 0.7 * vMag) * vAlpha, 1.0);
  #include <colorspace_fragment>
}`;

class Layer {
  readonly points: THREE.Points;
  readonly streaks: THREE.LineSegments;
  private travel = 0;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly lineUniforms: Record<string, THREE.IUniform>;

  constructor(
    readonly spec: LayerSpec,
    seed: number,
  ) {
    const r = seeded(seed);
    const pos = new Float32Array(spec.count * 3);
    const mag = new Float32Array(spec.count);
    const [bx, by, bz] = spec.box;
    for (let i = 0; i < spec.count; i++) {
      pos[i * 3] = (r() * 2 - 1) * bx;
      pos[i * 3 + 1] = (r() * 2 - 1) * by;
      pos[i * 3 + 2] = (r() * 2 - 1) * bz;
      mag[i] = Math.pow(r(), 2.2);
    }
    const shared = (): Record<string, THREE.IUniform> => ({
      uTravel: { value: 0 },
      uBoxZ: { value: bz },
      uClamp: { value: STAR_CLAMP },
      uSize: { value: spec.size },
      uAt: { value: spec.at },
      uPixel: { value: 1 },
      uStreak: { value: 0 },
      uShip: { value: SHIP },
      uCool: { value: new THREE.Color(SPACE_COLORS.starCool) },
      uWarm: { value: new THREE.Color(SPACE_COLORS.starWarm) },
      uGain: { value: spec.gain },
    });
    const blend = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false } as const;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    geo.setAttribute('aTail', new THREE.BufferAttribute(new Float32Array(spec.count), 1));
    this.uniforms = shared();
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: POINT_FRAG, uniforms: this.uniforms, ...blend }));

    // The streaks: two ends per star, the tail trailing ahead of it.
    const lpos = new Float32Array(spec.count * 6);
    const lmag = new Float32Array(spec.count * 2);
    const tail = new Float32Array(spec.count * 2);
    for (let i = 0; i < spec.count; i++) {
      for (let e = 0; e < 2; e++) {
        lpos.set(pos.subarray(i * 3, i * 3 + 3), (i * 2 + e) * 3);
        lmag[i * 2 + e] = mag[i];
        tail[i * 2 + e] = e;
      }
    }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
    lgeo.setAttribute('aMag', new THREE.BufferAttribute(lmag, 1));
    lgeo.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
    this.lineUniforms = shared();
    this.streaks = new THREE.LineSegments(lgeo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: LINE_FRAG, uniforms: this.lineUniforms, ...blend }));
    this.streaks.visible = false;

    for (const o of [this.points, this.streaks]) {
      o.frustumCulled = false;
      o.renderOrder = -1;
      o.onBeforeRender = (renderer, _s, camera) => {
        const u = o === this.points ? this.uniforms : this.lineUniforms;
        u.uClamp.value = (camera as THREE.OrthographicCamera).isOrthographicCamera ? 1e6 : STAR_CLAMP;
        u.uPixel.value = renderer.getPixelRatio();
      };
    }
  }

  /** Moves the layer on `dt` seconds at `speed` times cruise; streaks `streak` (0-1) of their full stretch. */
  step(dt: number, speed: number, streak: number, stretch: number) {
    this.travel = (this.travel + this.spec.speed * speed * dt) % (this.spec.box[2] * 2);
    const len = streak * STREAK * this.spec.box[2] * Math.min(1, stretch / FULL_STRETCH);
    for (const u of [this.uniforms, this.lineUniforms]) u.uTravel.value = this.travel;
    this.lineUniforms.uStreak.value = len;
    this.streaks.visible = len > 0.5;
  }

  setGain(k: number) {
    this.uniforms.uGain.value = this.spec.gain * k;
    this.lineUniforms.uGain.value = this.spec.gain * k * 0.8;
  }
}

/** The three layers, far to near. */
export class Starfield {
  readonly group = new THREE.Group();
  private readonly layers: Layer[];
  /** How many layers move: Settings > Effects at Low leaves only the far one. */
  moving = LAYERS.length;

  constructor() {
    this.group.name = 'space-stars';
    this.layers = LAYERS.map((spec, i) => new Layer(spec, 0xa11 + i * 101));
    for (const l of this.layers) this.group.add(l.points, l.streaks);
  }

  /**
   * Moves the stars on `dt` seconds at `speed` times cruise. `streak` (0-1) draws them as streaks
   * `stretch` times their cruise length (a surge, a jump), or not at all at 0.
   */
  step(dt: number, speed: number, streak = 0, stretch = 1) {
    this.layers.forEach((l, i) => {
      l.points.visible = i < this.moving || i === 0;
      l.step(i < this.moving ? dt : 0, speed, i === 0 ? 0 : streak, stretch);
    });
  }

  setGain(k: number) {
    for (const l of this.layers) l.setGain(k);
  }
}
