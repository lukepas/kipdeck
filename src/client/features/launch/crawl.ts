// The day's log crawling into the forward starfield at the start of a watch: a block of text lying back
// on a plane ahead of the bow, sliding away into the stars and fading as it goes. White and ship-cyan
// only, on a soft dark ground so it reads over the nebula. Drawn with the sky (before the room, no depth
// test), so the bridge's frames, ribs and glass always pass in front of it and it only ever shows
// through the glass. One draw, only while it plays.
import * as THREE from 'three';
import { DECK } from '../../world/office/materials';
import { crawlSlide } from './logic';

/** Where the crawl lies: this far ahead (m), this high on the sky (degrees), this wide (m), tilted back this far (degrees). */
const BODY = '600 92px Archivo, system-ui, sans-serif';
const CRAWL = { at: 30, el: 17, w: 28, tilt: 50, canvas: [2048, 1536] as const } as const;

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** The text, faded at its far edge so it melts into the stars rather than stopping at a line. */
const fragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float far = 1.0 - smoothstep(0.9, 1.0, vUv.y);
  gl_FragColor = vec4(t.rgb, t.a * uAlpha * far);
}`;

export class Crawl {
  readonly mesh: THREE.Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: THREE.CanvasTexture;
  private readonly mat: THREE.ShaderMaterial;
  private readonly at = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private slide = 0;

  constructor() {
    const [w, h] = CRAWL.canvas;
    this.canvas.width = w;
    this.canvas.height = h;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uAlpha: { value: 0 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      // Drawn with the opaque things, after the sky and before the room, blended over the stars by hand.
      transparent: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(CRAWL.w, (CRAWL.w * h) / w), this.mat);
    this.mesh.name = 'launch-crawl';
    this.mesh.renderOrder = -8;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const el = THREE.MathUtils.degToRad(CRAWL.el);
    this.at.set(0, Math.sin(el) * CRAWL.at, -Math.cos(el) * CRAWL.at);
    // The plane lies back: its own up runs away from the bow's glass, up and out.
    const tilt = THREE.MathUtils.degToRad(CRAWL.tilt);
    this.up.set(0, Math.cos(tilt), -Math.sin(tilt));
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      this.mesh.position.copy(camera.position).add(this.at).addScaledVector(this.up, this.slide);
      this.mesh.rotation.set(-tilt, 0, 0);
      this.mesh.updateMatrixWorld();
    };
  }

  /** Paints the log: its heading in ship-cyan mono, the rest in white, centred and wrapped. */
  write(head: string, body: string) {
    const g = this.canvas.getContext('2d')!;
    const { width: W, height: H } = this.canvas;
    g.clearRect(0, 0, W, H);
    // A soft dark ground under the words, so they read over a bright nebula as well as over black.
    const lines = (() => {
      g.font = BODY;
      return wrap(g, body, W - 260);
    })();
    const top = Math.round(H / 2 - (220 + lines.length * 128) / 2);
    const ground = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.5);
    ground.addColorStop(0, 'rgba(4, 9, 14, 0.62)');
    ground.addColorStop(0.7, 'rgba(4, 9, 14, 0.4)');
    ground.addColorStop(1, 'rgba(4, 9, 14, 0)');
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.letterSpacing = '14px';
    g.fillStyle = DECK.ship;
    g.font = '500 76px "JetBrains Mono", ui-monospace, monospace';
    g.fillText(head, W / 2, top + 60, W - 120);
    g.fillRect(W / 2 - 260, top + 140, 520, 4);
    g.letterSpacing = '2px';
    g.fillStyle = '#EEF5F9';
    g.font = BODY;
    lines.forEach((l, i) => g.fillText(l, W / 2, top + 280 + i * 128, W - 200));
    this.tex.needsUpdate = true;
  }

  /** How far along it is (0-1) and how much it shows (0-1). */
  show(k: number, alpha: number) {
    this.mesh.visible = alpha > 0.002;
    this.mat.uniforms.uAlpha.value = alpha;
    this.slide = crawlSlide(k);
  }
}

/** `text` broken into lines no wider than `max` in the context's font. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > max && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out.slice(0, 9);
}
