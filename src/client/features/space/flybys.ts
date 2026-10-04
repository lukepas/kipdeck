import * as THREE from 'three';
import { NOISE } from './glsl';
import { FLYBY_MS, SPACE_COLORS, between, seeded, type FlybyKind } from './logic';

// What passes the ship now and then, one at a time and always off to the side of what you read: a
// planet or moon slowly across a side port, an asteroid field tumbling past, or a comet high across the
// top of the forward glass. Planets and comets are far: they stay put as you walk, drawn round the
// camera on their own line of sight. Asteroids are near, in the ship's own space, so they parallax.

/** How far out the far flybys are drawn (m): inside the walk camera's far plane. */
const FAR_AT = 92;

// The planet's surface is baked once per flyby into a small map (longitude by latitude), so drawing
// it is one texture read and a little light, not noise per pixel.
const SURFACE = { w: 512, h: 256 } as const;

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BAKE_FRAG = /* glsl */ `
uniform vec3 uA, uB, uC, uSeed;
uniform float uBands;
varying vec2 vUv;
${NOISE}
void main() {
  float lon = vUv.x * 6.2831853;
  float lat = (vUv.y - 0.5) * 3.1415927;
  vec3 o = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  float f;
  vec3 col;
  if (uBands > 0.5) {
    // A gas giant: bands by latitude, stirred.
    float t = o.y * 6.0 + (fbm(o * 3.0 + uSeed, 4) - 0.5) * 1.6;
    f = 0.5 + 0.5 * sin(t * 2.2) * (0.6 + 0.4 * fbm(o * 9.0 + uSeed, 3));
    col = mix(uA, uB, f);
    col = mix(col, uC, smoothstep(0.55, 0.8, fbm(o * 5.0 + uSeed * 2.0, 4)) * 0.6);
  } else {
    // A rocky world: continents, seas, a little ice at the poles.
    f = fbm(o * 2.4 + uSeed, 5);
    col = mix(uC, uA, smoothstep(0.45, 0.55, f));
    col = mix(col, uB, smoothstep(0.62, 0.75, fbm(o * 6.0 + uSeed, 4)) * step(0.5, f));
    col = mix(col, uB * 1.15, smoothstep(0.82, 0.92, abs(o.y)));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const PLANET_VERT = /* glsl */ `
varying vec3 vN;
varying vec2 vUv;
varying vec3 vView;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const PLANET_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uAtmo, uSun;
uniform float uSpin;
uniform float uGain;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vView;
void main() {
  vec3 col = texture2D(uMap, vec2(vUv.x + uSpin, vUv.y)).rgb;
  vec3 n = normalize(vN);
  float lit = smoothstep(-0.08, 0.5, dot(n, uSun));
  float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 3.0);
  vec3 outc = col * (0.025 + 0.975 * lit) + uAtmo * rim * 0.25 * (0.25 + 0.75 * lit);
  gl_FragColor = vec4(outc * uGain, 1.0);
  #include <colorspace_fragment>
}`;

/** A soft round glow, for the comet's head. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One flyby under way: where it is in its pass, 0 to 1. */
interface Pass {
  kind: FlybyKind;
  ms: number;
  at: number;
  /** Which side it passes on: -1 west, 1 east. */
  side: number;
  /** Its own dealt numbers (size, height, spin). */
  r: number[];
}

export class Flybys {
  /** The far ones: kept round the camera that draws them. */
  readonly far = new THREE.Group();
  /** The near ones: in the ship's own space. */
  readonly near = new THREE.Group();
  private pass: Pass | null = null;
  private readonly planet: THREE.Mesh;
  private readonly planetMat: THREE.ShaderMaterial;
  private readonly comet = new THREE.Group();
  private readonly cometHead: THREE.Sprite;
  private readonly cometTail: THREE.Points;
  private readonly rocks: THREE.InstancedMesh;
  private readonly rockMat: THREE.MeshLambertMaterial;
  private readonly rockSpots: { x: number; y: number; z: number; s: number; ax: THREE.Vector3; spin: number }[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();

  private readonly surface = new THREE.WebGLRenderTarget(SURFACE.w, SURFACE.h, { type: THREE.HalfFloatType, wrapS: THREE.RepeatWrapping, generateMipmaps: false });
  private readonly bakeMat: THREE.ShaderMaterial;
  private readonly bakeScene = new THREE.Scene();
  private readonly bakeCamera = new THREE.Camera();

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.far.name = 'space-flybys-far';
    this.near.name = 'space-flybys-near';
    // Round whichever camera draws it, as the sky is.
    const follow = (_r: unknown, _s: unknown, camera: THREE.Camera) => {
      this.far.position.copy(camera.position);
      this.far.updateMatrixWorld();
    };

    this.bakeMat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uA: { value: new THREE.Color(SPACE_COLORS.planetA) },
        uB: { value: new THREE.Color(SPACE_COLORS.planetB) },
        uC: { value: new THREE.Color(SPACE_COLORS.planetC) },
        uSeed: { value: new THREE.Vector3() },
        uBands: { value: 0 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bakeMat);
    quad.frustumCulled = false;
    this.bakeScene.add(quad);
    this.planetMat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      fog: false,
      uniforms: {
        uMap: { value: this.surface.texture },
        uAtmo: { value: new THREE.Color(SPACE_COLORS.atmosphere) },
        uSun: { value: new THREE.Vector3(-0.3, 0.55, -0.78).normalize() },
        uSpin: { value: 0 },
        uGain: { value: 1 },
      },
    });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.planetMat);
    this.planet.onBeforeRender = follow;
    this.planet.visible = false;
    this.far.add(this.planet);

    // The comet: a head and a 300-point tail streaming away from the galaxy's core.
    this.cometHead = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: SPACE_COLORS.comet, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    this.cometHead.scale.setScalar(2.4);
    this.cometHead.onBeforeRender = follow;
    const tail = new Float32Array(300 * 3);
    const tailMag = new Float32Array(300);
    const deal = seeded(0xc0e7);
    for (let i = 0; i < 300; i++) {
      const k = Math.pow(deal(), 1.6);
      const spread = 0.08 + k * 1.6;
      tail[i * 3] = k * 18;
      tail[i * 3 + 1] = (deal() - 0.5) * spread + k * k * 3;
      tail[i * 3 + 2] = (deal() - 0.5) * spread;
      tailMag[i] = (1 - k) * (0.5 + 0.5 * deal());
    }
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute('position', new THREE.BufferAttribute(tail, 3));
    tgeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(300 * 3).map((_, i) => tailMag[Math.floor(i / 3)] * 0.55), 3));
    this.cometTail = new THREE.Points(tgeo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, color: SPACE_COLORS.comet, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    this.cometTail.onBeforeRender = follow;
    this.comet.add(this.cometHead, this.cometTail);
    this.comet.visible = false;
    this.far.add(this.comet);

    // The asteroids: 150 lumpy icosahedrons in graphite, one draw.
    const rock = new THREE.IcosahedronGeometry(1, 1);
    const p = rock.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      this.v.fromBufferAttribute(p, i);
      const n = 0.78 + 0.32 * (0.5 + 0.5 * Math.sin(this.v.x * 5.1 + this.v.y * 3.7) * Math.cos(this.v.z * 4.3 - this.v.x * 2.1));
      this.v.multiplyScalar(n);
      p.setXYZ(i, this.v.x, this.v.y, this.v.z);
    }
    rock.computeVertexNormals();
    this.rockMat = new THREE.MeshLambertMaterial({ color: SPACE_COLORS.rock, flatShading: true });
    this.rocks = new THREE.InstancedMesh(rock, this.rockMat, 150);
    this.rocks.frustumCulled = false;
    this.rocks.visible = false;
    this.near.add(this.rocks);
  }

  /** The flyby under way, if any. */
  get current(): FlybyKind | null {
    return this.pass?.kind ?? null;
  }

  /** Starts a flyby of `kind`, dealt from `rand`, `at` (0-1) of the way through it, on `side` (-1 west, 1 east) or one dealt. */
  start(kind: FlybyKind, rand: () => number, at = 0, side?: -1 | 1) {
    const r = Array.from({ length: 8 }, rand);
    this.pass = { kind, ms: between(r[0], FLYBY_MS[kind]), at, side: side ?? (r[1] < 0.5 ? -1 : 1), r };
    this.planet.visible = kind === 'planet';
    this.comet.visible = kind === 'comet';
    this.rocks.visible = kind === 'asteroids';
    if (kind === 'planet') {
      const u = this.bakeMat.uniforms;
      u.uBands.value = r[2] < 0.55 ? 1 : 0;
      u.uSeed.value.set(r[3] * 50, r[4] * 50, r[5] * 50);
      const was = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.surface);
      this.renderer.render(this.bakeScene, this.bakeCamera);
      this.renderer.setRenderTarget(was);
      this.planet.scale.setScalar(10 + r[6] * 10);
    }
    if (kind === 'asteroids') {
      this.rockSpots.length = 0;
      for (let i = 0; i < 150; i++) {
        const x = 26 + Math.pow(rand(), 0.8) * 70;
        this.rockSpots.push({ x, y: (rand() - 0.4) * 46, z: (rand() - 0.5) * 140, s: 0.35 + Math.pow(rand(), 3) * 3.6, ax: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), spin: (rand() - 0.5) * 1.2 });
      }
    }
    this.place();
  }

  /** Ends the flyby under way at once (a jump, say). */
  clear() {
    this.pass = null;
    this.planet.visible = this.comet.visible = this.rocks.visible = false;
  }

  /** How bright the flybys are (ducked while something needs you). */
  setGain(k: number) {
    this.planetMat.uniforms.uGain.value = k;
    (this.cometHead.material as THREE.SpriteMaterial).opacity = k;
    (this.cometTail.material as THREE.PointsMaterial).opacity = k;
    this.rockMat.color.set(SPACE_COLORS.rock).multiplyScalar(0.4 + 0.6 * k);
  }

  /** Moves the flyby on `dt` seconds at `speed` times cruise. Returns false once it has passed. */
  step(dt: number, speed: number): boolean {
    const p = this.pass;
    if (!p) return false;
    p.at += (dt * 1000 * Math.max(0.15, speed)) / p.ms;
    if (p.at >= 1) {
      this.clear();
      return false;
    }
    this.place();
    return true;
  }

  private place() {
    const p = this.pass;
    if (!p) return;
    const k = p.at;
    if (p.kind === 'planet') {
      // Along an arc off one side, from ahead of the beam to behind it, a little above the eye.
      const a = THREE.MathUtils.degToRad(-62 + 124 * k);
      const elev = THREE.MathUtils.degToRad(7 + p.r[7] * 9);
      this.planet.position.set(p.side * FAR_AT * Math.cos(a) * Math.cos(elev), FAR_AT * Math.sin(elev), FAR_AT * Math.sin(a) * Math.cos(elev));
      this.planetMat.uniforms.uSpin.value = k * 0.1 + p.r[5];
    } else if (p.kind === 'comet') {
      // High across the top of the forward glass, from one side to the other.
      const az = THREE.MathUtils.degToRad(p.side * (-55 + 110 * k));
      const elev = THREE.MathUtils.degToRad(30 + p.r[7] * 8);
      this.cometHead.position.set(Math.sin(az) * Math.cos(elev) * FAR_AT, Math.sin(elev) * FAR_AT, -Math.cos(az) * Math.cos(elev) * FAR_AT);
      this.cometTail.position.copy(this.cometHead.position);
      // The tail points away from the core (behind and above the way it goes).
      this.cometTail.rotation.set(0, p.side > 0 ? Math.PI : 0, -0.25);
    } else {
      // The field streams aft past one side, tumbling: 520 m in its 40 seconds.
      const run = -260 + 520 * k;
      this.rockSpots.forEach((r, i) => {
        this.q.setFromAxisAngle(r.ax, r.spin * (k * p.ms * 0.001) + i);
        this.v.set(p.side * r.x, r.y, r.z + run);
        this.sc.setScalar(r.s);
        this.rocks.setMatrixAt(i, this.m.compose(this.v, this.q, this.sc));
      });
      this.rocks.instanceMatrix.needsUpdate = true;
    }
  }
}
