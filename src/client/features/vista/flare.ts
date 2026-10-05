import * as THREE from 'three';
import { DECK } from '../../world/office/materials';
import { SPACE_COLORS } from '../space/logic';
import { FLARE } from './logic';

// The sun's flare: the light a lens makes of a bright star, drawn over the frame as a handful of soft
// shapes, its glow, a short horizontal streak and fine rays at the sun, and ghosts along the line from
// it through the middle of the view. The shapes are painted once into a small atlas; all of them are one
// mesh and one additive draw, placed in the vertex shader from where the sun is on screen. Unlike
// three's Lensflare (examples/jsm/objects/Lensflare.js), which reads the frame back round the sun to
// tell whether it is hidden and draws each shape on its own (three draws and more a frame), the sun's
// own glow is drawn at the far plane against the depth buffer, so a rib crossing it cuts it as it
// should, and the ghosts, which only a clear sun makes, follow a raycast on the CPU against the
// canopy's own shape (logic.ts canopyClear). Each shape fades by itself where it would land on a wall
// board's face (index.ts). Ghosts lean from the sun's warm white to ship-cyan.

/** The atlas: four cells across, two down. */
const CELL = 128;
const COLS = 4;
const ROWS = 2;

/** Paints the atlas's shapes (logic.ts FlareElement.cell): 0 glow, 1 streak, 2 ring, 3 disc, 4 rays. */
function atlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL * COLS;
  c.height = CELL * ROWS;
  const g = c.getContext('2d')!;
  const at = (i: number) => [(i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2] as const;
  const radial = (i: number, stops: [number, number][]) => {
    const [x, y] = at(i);
    const grad = g.createRadialGradient(x, y, 0, x, y, CELL / 2);
    for (const [o, a] of stops) grad.addColorStop(o, `rgba(255,255,255,${a})`);
    g.fillStyle = grad;
    g.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
  };
  // The glow: a bright core and a long soft falloff.
  radial(0, [
    [0, 1],
    [0.06, 0.85],
    [0.18, 0.28],
    [0.45, 0.06],
    [1, 0],
  ]);
  // The streak: a thin horizontal line of light, brightest in the middle.
  {
    const [x, y] = at(1);
    const along = g.createLinearGradient(x - CELL / 2, 0, x + CELL / 2, 0);
    along.addColorStop(0, 'rgba(255,255,255,0)');
    along.addColorStop(0.5, 'rgba(255,255,255,1)');
    along.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = along;
    for (let k = 0; k < 6; k++) {
      g.globalAlpha = 1 / (k + 1);
      g.fillRect(x - CELL / 2, y - k, CELL, 1 + 2 * k);
    }
    g.globalAlpha = 1;
  }
  // The ring: a thin bright circle, soft inside.
  radial(2, [
    [0, 0],
    [0.62, 0.04],
    [0.8, 0.45],
    [0.86, 0.1],
    [1, 0],
  ]);
  // The disc: a soft hexagon, as a lens's iris makes it.
  {
    const [x, y] = at(3);
    g.save();
    g.translate(x, y);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, CELL * 0.44);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      g.lineTo(Math.cos(a) * CELL * 0.42, Math.sin(a) * CELL * 0.42);
    }
    g.closePath();
    g.fill();
    g.restore();
  }
  // The rays: a dozen thin spokes of uneven length.
  {
    const [x, y] = at(4);
    g.save();
    g.translate(x, y);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (i % 3) * 0.07;
      const len = CELL * (i % 2 ? 0.3 : 0.48);
      const grad = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      grad.addColorStop(0, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = grad;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.stroke();
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aElem;
attribute vec2 aMore;
uniform vec2 uSun;
uniform float uAspect;
uniform float uLevel;
uniform float uClear;
uniform float uFade[${FLARE.length}];
varying vec2 vUv;
varying float vGain;
varying float vCyan;
void main() {
  vec2 at = uSun * (1.0 - aElem.x);
  vec2 corner = aCorner;
  // The rays turn as the sun crosses the view.
  if (aElem.z > 3.5) {
    float a = 0.35 * (uSun.x + uSun.y);
    corner = mat2(cos(a), sin(a), -sin(a), cos(a)) * corner;
  }
  vec2 ext = vec2(aElem.y / uAspect, aElem.y);
  // The streak is long and thin.
  if (aElem.z > 0.5 && aElem.z < 1.5) ext.x *= 9.0;
  // The shapes at the sun sit at the far plane, so whatever stands in front of the sun (a rib, the
  // halo ring, a wall) cuts them pixel by pixel; the ghosts are in the lens, in front of everything.
  bool atSun = aElem.x < 0.01;
  gl_Position = vec4(at + corner * ext, atSun ? 0.9999 : -0.9999, 1.0);
  float cell = aElem.z;
  vec2 c = vec2(mod(cell, ${COLS.toFixed(1)}), floor(cell / ${COLS.toFixed(1)}));
  vUv = (c + aCorner * 0.5 + 0.5) / vec2(${COLS.toFixed(1)}, ${ROWS.toFixed(1)});
  vUv.y = 1.0 - vUv.y;
  // The ghosts need the sun clear of the canopy's frame (index.ts, logic.ts canopyClear).
  vGain = aElem.w * uLevel * uFade[int(aMore.x + 0.5)] * (atSun ? 1.0 : uClear);
  vCyan = aMore.y;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uWarm, uCyan;
varying vec2 vUv;
varying float vGain;
varying float vCyan;
void main() {
  // The atlas is white, its shapes in its alpha.
  float a = texture2D(uMap, vUv).a;
  gl_FragColor = vec4(mix(uWarm, uCyan, vCyan) * a * vGain, 1.0);
  #include <colorspace_fragment>
}`;

export class Flare {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  /** Each element's own fade (0-1): out where it would land on a board's face. */
  readonly fade = new Float32Array(FLARE.length).fill(1);

  constructor() {
    const corner: number[] = [];
    const elem: number[] = [];
    const more: number[] = [];
    const index: number[] = [];
    FLARE.forEach((e, i) => {
      const base = corner.length / 2;
      for (const [x, y] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        corner.push(x, y);
        elem.push(e.at, e.size, e.cell, e.gain);
        more.push(i, e.cyan);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const geo = new THREE.BufferGeometry();
    // A position the renderer wants, never read: the shader places every corner itself.
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((corner.length / 2) * 3), 3));
    geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
    geo.setAttribute('aElem', new THREE.Float32BufferAttribute(elem, 4));
    geo.setAttribute('aMore', new THREE.Float32BufferAttribute(more, 2));
    geo.setIndex(index);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uMap: { value: atlas() },
        uClear: { value: 1 },
        uSun: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uLevel: { value: 0 },
        uFade: { value: this.fade },
        uWarm: { value: new THREE.Color(SPACE_COLORS.sun) },
        uCyan: { value: new THREE.Color(DECK.ship) },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'vista-flare';
    this.mesh.frustumCulled = false;
    // After the glass: the ghosts are in the lens, over the room; the sun's own glow behind all of it.
    this.mesh.renderOrder = 50;
    this.mesh.visible = false;
  }

  /**
   * Where the sun is on screen (NDC), the view's aspect, how bright the flare is (0 hides it, and skips
   * the draw), and how clear of the canopy's frame the sun is (the ghosts go with it).
   */
  set(x: number, y: number, aspect: number, level: number, clear: number) {
    const u = this.mat.uniforms;
    u.uClear.value = clear;
    u.uSun.value.set(x, y);
    u.uAspect.value = aspect;
    u.uLevel.value = level;
    this.mesh.visible = level > 0.002;
  }
}
