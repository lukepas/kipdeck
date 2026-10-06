import * as THREE from 'three';
import { DECK } from '../../world/office/materials';
import { BRIDGE_LAYER } from '../bridge/shapes';
import { CONN_GOLD } from '../bridge/conn';
import type { TypeCard } from './logic';

// What the set pieces draw: the kinetic type plane, one canvas on its own dark backing under the bow's
// glass over the arc (one draw while it shows, none at rest); and the iris, a shutter over the glass
// for a switch of Night and Day (one draw for its 1.2 s), drawn with the sky so the room stands in front
// of it and it shows only through the glass.

/** Where the type plane hangs: on the axis, under the canopy over the arc, facing the conn's seated eye. */
export const PLANE = { x: 0, y: 8.3, z: -4, w: 7.6, canvas: [2048, 384] as const, faces: [0, 2.98, 10.75] as const } as const;

const TYPE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const TYPE_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uReveal;
uniform float uA;
uniform vec3 uTone;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float edge = uReveal * 1.04;
  float on = step(vUv.x, edge);
  float d = (vUv.x - edge) * 70.0;
  float line = uReveal < 0.999 ? exp(-d * d) : 0.0;
  gl_FragColor = vec4(t.rgb * on + uTone * line * 1.6, (t.a * on + line * 0.85) * uA);
  #include <colorspace_fragment>
}`;

const UI = (w: number, s: number) => `${w} ${s}px Archivo, system-ui, sans-serif`;
const MONO = (s: number, w = 600) => `${w} ${s}px "JetBrains Mono", ui-monospace, monospace`;

/** Fits `text` in `max` px by shortening it with an ellipsis. */
function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}...`).width > max) t = t.slice(0, -1).trimEnd();
  return `${t}...`;
}

/** The kinetic type plane over the bow. */
export class TypePlane {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: THREE.CanvasTexture;
  private said = '';

  constructor() {
    const [w, h] = PLANE.canvas;
    this.canvas.width = w;
    this.canvas.height = h;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mat = new THREE.ShaderMaterial({
      vertexShader: TYPE_VERT,
      fragmentShader: TYPE_FRAG,
      uniforms: { uMap: { value: this.tex }, uReveal: { value: 0 }, uA: { value: 0 }, uTone: { value: new THREE.Color(DECK.ship) } },
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE.w, (PLANE.w * h) / w), mat);
    this.mesh.position.set(PLANE.x, PLANE.y, PLANE.z);
    this.mesh.lookAt(new THREE.Vector3(...PLANE.faces));
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'kinetic-type';
    this.mesh.layers.set(BRIDGE_LAYER);
  }

  /** Paints `card`, if it changed. */
  write(card: TypeCard) {
    const key = JSON.stringify(card);
    if (key === this.said) return;
    this.said = key;
    const g = this.canvas.getContext('2d')!;
    const { width: W, height: H } = this.canvas;
    const tone = card.tone === 'gold' ? CONN_GOLD : DECK.ship;
    g.clearRect(0, 0, W, H);
    // Its own dark backing, so the words read against the brightest gas.
    g.fillStyle = 'rgba(4,7,11,0.93)';
    g.fillRect(0, 0, W, H);
    g.fillStyle = tone;
    g.fillRect(0, 0, 14, H);
    g.fillRect(0, H - 6, W, 6);
    const digitW = card.digit ? 340 : 0;
    const textW = W - 90 - digitW - 60;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.letterSpacing = '8px';
    g.font = MONO(58);
    g.fillStyle = tone;
    g.fillText(fit(g, card.small, textW), 60, 104);
    g.fillRect(60, 132, Math.min(textW, 520), 4);
    g.letterSpacing = '6px';
    g.font = UI(800, 156);
    g.fillStyle = '#EEF4F8';
    g.fillText(fit(g, card.big, textW), 56, 312);
    g.letterSpacing = '0px';
    if (card.digit) {
      const x = W - digitW - 40;
      g.strokeStyle = tone;
      g.lineWidth = 8;
      g.strokeRect(x, 36, digitW, H - 84);
      g.fillStyle = card.tone === 'gold' ? 'rgba(217,196,109,0.14)' : 'rgba(111,195,223,0.14)';
      g.fillRect(x, 36, digitW, H - 84);
      g.textAlign = 'center';
      g.font = MONO(270, 700);
      g.fillStyle = '#FFFFFF';
      g.fillText(card.digit, x + digitW / 2, H - 76);
      g.textAlign = 'left';
    }
    this.tex.needsUpdate = true;
    (this.mesh.material.uniforms.uTone.value as THREE.Color).set(tone);
  }

  /** How far the words have swept on (0-1) and how strongly the plane shows (0-1). */
  show(reveal: number, a: number) {
    const u = this.mesh.material.uniforms;
    u.uReveal.value = reveal;
    u.uA.value = a;
    this.mesh.visible = a > 0.003;
  }
}

const IRIS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const IRIS_FRAG = /* glsl */ `
uniform float uOpen;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p) / (0.5 * length(vec2(uAspect, 1.0)));
  float a = atan(p.y, p.x);
  // Seven blades, each edge a sweep round the middle: the aperture is what's inside the edge.
  float blade = fract(a / 6.2831853 * 7.0 + r * 0.55);
  float edge = uOpen * 1.2 + 0.14 * blade - 0.07;
  if (r < edge) discard;
  float d = (r - edge) * 60.0;
  vec3 hull = vec3(0.012, 0.018, 0.026);
  // The blades' seams, and a ship-cyan rim at the aperture's edge.
  float sb = blade * 30.0;
  float seam = exp(-sb * sb) * 0.7;
  // Each blade a little lighter toward its leading edge, so the seven read as plates sliding over each other.
  vec3 plate = hull * (0.7 + 0.9 * blade);
  gl_FragColor = vec4(plate + vec3(0.3, 0.75, 0.9) * (exp(-d * d) * 1.8 + seam), 1.0);
  #include <colorspace_fragment>
}`;

/**
 * The iris: a screen-filling quad drawn with the sky (after it, before the room), so it closes over
 * whatever space shows through the glass and the room stands in front of it.
 */
export class Iris {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly ahead = new THREE.Vector3();

  constructor() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: IRIS_VERT,
      fragmentShader: IRIS_FRAG,
      uniforms: { uOpen: { value: 1 }, uAspect: { value: 1.6 } },
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.renderOrder = -8;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'kinetic-iris';
    this.mesh.layers.set(BRIDGE_LAYER);
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      const c = camera as THREE.PerspectiveCamera;
      const dist = 40;
      this.ahead.set(0, 0, -dist).applyQuaternion(c.quaternion);
      this.mesh.position.copy(c.position).add(this.ahead);
      this.mesh.quaternion.copy(c.quaternion);
      const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad((c.fov ?? 50) / 2)) * 1.05;
      this.mesh.scale.set(h * (c.aspect ?? 1.6), h, 1);
      mat.uniforms.uAspect.value = c.aspect ?? 1.6;
      this.mesh.updateMatrixWorld();
    };
  }

  /** How open it is (1 open: not drawn at all). */
  set(open: number) {
    this.mesh.material.uniforms.uOpen.value = open;
    this.mesh.visible = open < 0.999;
  }
}
