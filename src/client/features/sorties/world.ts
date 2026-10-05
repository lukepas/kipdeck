import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DECK } from '../../world/office/materials';
import { MAX_FIGHTERS } from './logic';

// The squadron as the scene draws it: one instanced mesh of small graphite fighters (about 60
// triangles each), one layer of ship-cyan engine points (their trails too), and a line of mono under
// the picket. Achromatic but for the engines, which are the ship's own cyan, never a state's hue.

/** A fighter, nose to -z, about 3 m long: a six-sided fuselage, swept wings, a fin and two engine pods. */
export function fighterGeometry(): THREE.BufferGeometry {
  const parts = [
    new THREE.ConeGeometry(0.34, 2.8, 6).rotateX(-Math.PI / 2),
    new THREE.BoxGeometry(2.6, 0.06, 0.8).translate(0, -0.02, 0.55),
    new THREE.BoxGeometry(0.06, 0.6, 0.7).translate(0, 0.3, 0.95),
    new THREE.BoxGeometry(0.26, 0.24, 1.0).translate(-0.62, -0.02, 0.75),
    new THREE.BoxGeometry(0.26, 0.24, 1.0).translate(0.62, -0.02, 0.75),
  ].map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return n;
  });
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

/** Where a fighter's engines are, behind it (local, m). */
export const ENGINE_AT = new THREE.Vector3(0, 0, 1.3);

const ENGINE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Smaller with distance, as a light on a hull is, but never under two pixels or over sixteen.
  gl_PointSize = clamp(aSize * uScale * 30.0 / max(-mv.z, 1.0), 2.0, 16.0);
  gl_Position = projectionMatrix * mv;
}`;
const ENGINE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = (1.0 - smoothstep(0.0, 1.0, r)) * vAlpha;
  float core = 1.0 - smoothstep(0.0, 0.35, r);
  gl_FragColor = vec4((uColor + vec3(core * 0.6)) * a, a);
  #include <colorspace_fragment>
}`;

/** The engines and trails: points sized on screen, additive ship-cyan. Capacity for every engine and a trail behind each. */
export const TRAIL_POINTS = 48;
export class EngineLayer {
  readonly points: THREE.Points;
  readonly pos: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  private n = 0;
  readonly cap = MAX_FIGHTERS * (1 + TRAIL_POINTS);
  constructor() {
    this.pos = new Float32Array(this.cap * 3);
    this.size = new Float32Array(this.cap);
    this.alpha = new Float32Array(this.cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: ENGINE_VERT, fragmentShader: ENGINE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(DECK.ship) }, uScale: { value: 1 } } }));
    this.points.frustumCulled = false;
  }
  /** Starts a frame's points; `pixelRatio` keeps them the same size on any screen. */
  begin(pixelRatio = 1) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = pixelRatio;
    this.n = 0;
  }
  add(p: THREE.Vector3, size: number, alpha: number) {
    if (this.n >= this.cap || alpha <= 0.005) return;
    this.pos.set([p.x, p.y, p.z], this.n * 3);
    this.size[this.n] = size;
    this.alpha[this.n] = alpha;
    this.n++;
  }
  end() {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    for (const k of ['position', 'aSize', 'aAlpha']) (g.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
    this.points.visible = this.n > 0;
  }
}

/** The line of mono under the picket ("PICKET: 3 OPEN PRS"), facing the bridge. */
export class PicketCaption {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly canvas = document.createElement('canvas');
  private text = '';
  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 64;
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    this.mesh.visible = false;
  }
  set(text: string) {
    if (text === this.text) return;
    this.text = text;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.font = '500 34px "JetBrains Mono", ui-monospace, monospace';
    g.letterSpacing = '5px';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(190,200,210,0.9)';
    g.fillText(text, 512, 33);
    g.letterSpacing = '0px';
    this.mesh.material.map!.needsUpdate = true;
    this.mesh.visible = !!text;
  }
}
