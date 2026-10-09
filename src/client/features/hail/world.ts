import * as THREE from 'three';

// What the beats draw in the room, each one instanced draw shown only while it plays (no draw at rest):
//
// - Flares: a soft billboard of light over a station as its unit starts needing you (orange), gets
//   stuck (red) or finishes (green), swelling and fading.
// - Shockwaves: a ring of light spreading across the floor from the unit.
// - Couriers: a small chevron of light flying a path: a unit's ship marker leaving the holo route for
//   the dais and back, a done unit's tick dropping from its card into the holo. Each one also carries
//   a short call sign on a plate while it's the hail's.

/** Most of each at once. */
const MAX = 8;

const FLARE_VERT = /* glsl */ `
attribute vec2 aFlare;
varying vec2 vUv;
varying vec3 vColor;
varying float vA;
void main() {
  vUv = uv - 0.5;
  vColor = instanceColor;
  vA = aFlare.x;
  // A billboard: the quad turned to the eye, its size the instance's scale.
  vec4 mv = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
  float s = length(instanceMatrix[0].xyz);
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;
}`;

const FLARE_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vA;
void main() {
  float r = length(vUv) * 2.0;
  float core = exp(-r * r * 9.0);
  float halo = exp(-r * 3.2) * (1.0 - smoothstep(0.85, 1.0, r));
  // Four soft rays, the flare's own.
  float rays = exp(-abs(vUv.x * vUv.y) * 260.0) * (1.0 - smoothstep(0.2, 1.0, r));
  gl_FragColor = vec4(vColor * (core * 1.4 + halo * 0.5 + rays * 0.6) * vA, 1.0);
  #include <colorspace_fragment>
}`;

const RING_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vA;
void main() {
  float r = length(vUv) * 2.0;
  // A thin bright front and a faint wash behind it.
  float front = exp(-(r - 0.96) * (r - 0.96) * 900.0);
  float wash = smoothstep(0.4, 0.96, r) * (1.0 - step(0.98, r)) * 0.18;
  gl_FragColor = vec4(vColor * (front + wash) * vA, 1.0);
  #include <colorspace_fragment>
}`;

const RING_VERT = /* glsl */ `
attribute vec2 aFlare;
varying vec2 vUv;
varying vec3 vColor;
varying float vA;
void main() {
  vUv = uv - 0.5;
  vColor = instanceColor;
  vA = aFlare.x;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

/** One flare or ring this frame: where, how big (m), its colour and how bright (0-1). */
export interface Spot {
  at: THREE.Vector3;
  size: number;
  color: THREE.Color;
  a: number;
}

/** Billboards (flares) or floor rings (shockwaves): one instanced additive draw, hidden with none. */
export class Spots {
  readonly mesh: THREE.InstancedMesh;
  private readonly alpha: THREE.InstancedBufferAttribute;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(kind: 'flare' | 'ring') {
    const geo = kind === 'flare' ? new THREE.PlaneGeometry(1, 1) : new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
    geo.setAttribute('aFlare', this.alpha);
    const mat = new THREE.ShaderMaterial({
      vertexShader: kind === 'flare' ? FLARE_VERT : RING_VERT,
      fragmentShader: kind === 'flare' ? FLARE_FRAG : RING_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: kind === 'ring',
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = kind === 'flare' ? 7 : 2;
    this.mesh.name = `hail-${kind}s`;
  }

  set(spots: readonly Spot[]) {
    const n = Math.min(MAX, spots.length);
    for (let i = 0; i < n; i++) {
      const sp = spots[i];
      this.m.compose(sp.at, this.q, this.s.setScalar(sp.size));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, sp.color);
      this.alpha.setX(i, sp.a);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
}

/** One courier this frame: where, which way it's heading, its colour and size. */
export interface Flyer {
  at: THREE.Vector3;
  dir: THREE.Vector3;
  color: THREE.Color;
  size: number;
}

/** Chevrons of light flying their paths: one instanced draw, hidden with none. */
export class Couriers {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3(0, 0, 1);

  constructor() {
    // A flat chevron (the holo's unit marker), nose +z, and a thin keel so it reads edge on.
    const shape = new THREE.Shape([new THREE.Vector2(0, 0.6), new THREE.Vector2(0.45, -0.3), new THREE.Vector2(0, -0.05), new THREE.Vector2(-0.45, -0.3)]);
    const flat = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).rotateY(Math.PI);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    this.mesh = new THREE.InstancedMesh(flat, mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.name = 'hail-couriers';
  }

  set(flyers: readonly Flyer[]) {
    const n = Math.min(MAX, flyers.length);
    for (let i = 0; i < n; i++) {
      const f = flyers[i];
      this.q.setFromUnitVectors(this.fwd, f.dir.lengthSq() > 1e-8 ? f.dir.clone().normalize() : this.fwd);
      this.m.compose(f.at, this.q, this.s.setScalar(f.size));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, f.color);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

/** A unit's call sign on a dark plate, riding with its marker while it hovers by the dais. */
export class SignPlate {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: THREE.CanvasTexture;
  private said = '';

  constructor() {
    this.canvas.width = 256;
    this.canvas.height = 72;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));
    this.sprite.scale.set(0.42, 0.118, 1);
    this.sprite.center.set(0.5, 1.6);
    this.sprite.renderOrder = 8;
    this.sprite.visible = false;
    this.sprite.name = 'hail-sign';
  }

  /** Paints `text` (a call sign) in `hue` on the plate, if it changed. */
  write(text: string, hue: string) {
    if (text === this.said) return;
    this.said = text;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 72);
    g.fillStyle = 'rgba(8,12,18,0.88)';
    g.fillRect(0, 0, 256, 72);
    g.fillStyle = hue;
    g.fillRect(0, 0, 8, 72);
    g.font = '700 44px "JetBrains Mono", ui-monospace, monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = '#E8ECEF';
    g.fillText(text, 132, 38, 230);
    this.tex.needsUpdate = true;
  }
}
