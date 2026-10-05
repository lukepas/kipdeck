// The drive core's look: a reactor column rising out of the Deck lift's roof, framed by the aft glass.
// A steel collar, cap and two rails, a shader core whose light runs up the column at the ship's cruise
// speed inside a soft halo, twelve steel rings stacked round it, each lit ship-cyan as the run of
// merges reaches it, and a thin white line etched at today's best run; and the fleet's eight-week
// tally over the Services panel; a merge sends a bright pulse up the core, and a plaque on the collar
// says the run's count. Eight draws in all, on the bridge layer (the Overview never shows
// them). No state's hue: ship-cyan, steel and white only.
import * as THREE from 'three';
import { AFT_CORE, TALLY } from '../../../shared/ritual-slots';
import { DECK, matte } from '../../world/office/materials';
import { mergeByMaterial } from '../../world/toon';
import { onBridgeLayer } from '../bridge/shapes';
import { CORE_RINGS, MERGE_PULSE } from './logic';
import { sharp } from '../../world/sharp';

const RING_R = AFT_CORE.r;
const RING_TUBE = 0.06;
/** The height of ring `i` (0 the lowest). */
export const ringY = (i: number) => AFT_CORE.y0 + ((AFT_CORE.y1 - AFT_CORE.y0) * i) / (CORE_RINGS - 1);

const coreVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

/** The core: bands of light running up a glass column, brighter with the glow, breathing with the pulse. */
const coreFragment = /* glsl */ `
uniform float uFlow;
uniform float uGlow;
uniform float uLit;
uniform float uPulseY;
uniform float uPulseK;
uniform vec3 uColor;
uniform vec3 uHot;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  float y = vUv.y;
  // A merge's pulse: a bright band climbing the column.
  float pd = (y - uPulseY) / ${MERGE_PULSE.width.toFixed(3)};
  float pulse = uPulseK * exp(-pd * pd);
  // Soft bands running up the column; the lit part (the run) is brighter than the rest above it.
  float bands = 0.5 + 0.5 * sin((y * 9.0 - uFlow) * 6.2831);
  bands = bands * bands;
  float lit = 1.0 - smoothstep(uLit - 0.04, uLit + 0.04, y);
  float edge = clamp(dot(vNormalV, vViewDir), 0.0, 1.0);
  float body = 0.35 + 0.65 * edge;
  float k = uGlow * body * (0.45 + 0.55 * mix(0.35, 1.0, lit)) * (0.7 + 0.3 * bands);
  vec3 col = mix(uColor, uHot, clamp(k * lit * 0.8 + pulse, 0.0, 1.0));
  gl_FragColor = vec4(col * (k + 1.4 * pulse), 1.0);
}`;

/** The halo round the core: a soft column of light, faint at its edges, never covering what is behind it. */
const haloFragment = /* glsl */ `
uniform float uGlow;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  float edge = clamp(dot(vNormalV, vViewDir), 0.0, 1.0);
  float fall = edge * edge;
  float ends = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
  gl_FragColor = vec4(uColor * (uGlow * 0.32 * fall * ends), 1.0);
}`;

export class CoreWorld {
  readonly group = new THREE.Group();
  private readonly coreMat: THREE.ShaderMaterial;
  private readonly haloMat: THREE.ShaderMaterial;
  private readonly lit: THREE.InstancedMesh;
  private readonly best: THREE.Mesh;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  private readonly ship = new THREE.Color(DECK.ship);
  /** An unlit ring: the steel of the housing, well darker, so lit and unlit read apart at a glance. */
  private readonly steel = new THREE.Color(DECK.steel).multiplyScalar(0.38);
  private readonly plaque: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly plaqueCanvas = document.createElement('canvas');
  private plaqueKey = '';
  private coreBottom = 0;
  private coreH = 1;

  constructor() {
    const steel = matte(DECK.steel, { metalness: 0.55, roughness: 0.42 });
    const dark = matte(DECK.wallReveal, { metalness: 0.4, roughness: 0.6 });
    const { x, z, base, top } = AFT_CORE;
    // The collar on the lift's roof, the cap under the canopy and the two rails between, one mesh per material.
    const housing = new THREE.Group();
    const add = (g: THREE.BufferGeometry, mat: THREE.Material, y: number, dx = 0) => {
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(x + dx, y, z);
      housing.add(mesh);
    };
    add(new THREE.CylinderGeometry(RING_R + 0.18, RING_R + 0.3, 0.14, 8), dark, base + 0.07);
    add(new THREE.CylinderGeometry(RING_R + 0.06, RING_R + 0.18, 0.24, 8), steel, base + 0.26);
    add(new THREE.CylinderGeometry(RING_R + 0.18, RING_R + 0.04, 0.2, 8), steel, top - 0.1);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.09, top - base - 0.3, 0.12), steel, (top + base) / 2, s * (RING_R + 0.16));
    this.group.add(mergeByMaterial(housing));

    // The core, and the soft column of light round it.
    const bottom = base + 0.38;
    const h = top - 0.2 - bottom;
    this.coreBottom = bottom;
    this.coreH = h;
    const uniforms = { uFlow: { value: 0 }, uGlow: { value: 0.3 }, uLit: { value: 0 }, uPulseY: { value: -1 }, uPulseK: { value: 0 }, uColor: { value: new THREE.Color(DECK.ship) }, uHot: { value: new THREE.Color('#E6FAFF') } };
    this.coreMat = new THREE.ShaderMaterial({ uniforms, vertexShader: coreVertex, fragmentShader: coreFragment, toneMapped: false });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, h, 24, 1, true), this.coreMat);
    core.position.set(x, bottom + h / 2, z);
    this.group.add(core);
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: { uGlow: uniforms.uGlow, uColor: uniforms.uColor },
      vertexShader: coreVertex,
      fragmentShader: haloFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, h + 0.4, 24, 1, true), this.haloMat);
    halo.position.copy(core.position);
    halo.renderOrder = 4;
    this.group.add(halo);

    // The rings: dark steel, each lit ship-cyan from within as the run reaches it.
    const ringGeo = new THREE.TorusGeometry(RING_R, RING_TUBE, 10, 48).rotateX(Math.PI / 2);
    this.lit = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), CORE_RINGS);
    for (let i = 0; i < CORE_RINGS; i++) {
      this.m.makeTranslation(x, ringY(i), z);
      this.lit.setMatrixAt(i, this.m);
      this.lit.setColorAt(i, this.c.copy(this.steel));
    }
    this.group.add(this.lit);

    // Today's best: a thin white line etched round the column.
    this.best = new THREE.Mesh(new THREE.TorusGeometry(RING_R + 0.13, 0.012, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#F4F8FB', transparent: true, opacity: 0.85, toneMapped: false }));
    this.best.visible = false;
    this.group.add(this.best);
    // The run's count on the collar, facing the bow: "RUN 4 / BEST 6" in ship-cyan and white mono.
    this.plaqueCanvas.width = 512;
    this.plaqueCanvas.height = 160;
    const ptex = new THREE.CanvasTexture(this.plaqueCanvas);
    ptex.colorSpace = THREE.SRGBColorSpace;
    sharp(ptex);
    this.plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.3), new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false }));
    // On the collar under the core, drawn after the halo so its light never washes the count out.
    this.plaque.position.set(x, base + 0.2, z - RING_R - 0.36);
    this.plaque.rotation.y = Math.PI;
    this.plaque.renderOrder = 5;
    this.group.add(this.plaque);

    onBridgeLayer(this.group);
    this.group.name = 'drive-core';
  }

  /** Paints the run's count on the collar's plaque. */
  count(lines: readonly string[]) {
    const key = lines.join('|');
    if (key === this.plaqueKey) return;
    this.plaqueKey = key;
    const g = this.plaqueCanvas.getContext('2d')!;
    const { width: W, height: H } = this.plaqueCanvas;
    g.fillStyle = DECK.instrument;
    g.fillRect(0, 0, W, H);
    g.fillStyle = DECK.shipDim;
    g.fillRect(0, 0, W, 3);
    g.fillRect(0, H - 3, W, 3);
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.letterSpacing = '6px';
    g.font = '600 64px "JetBrains Mono", ui-monospace, monospace';
    g.fillStyle = DECK.ship;
    g.fillText(lines[0] ?? '', lines[1] ? W * 0.3 : W / 2, H / 2 + 2);
    if (lines[1]) {
      g.font = '500 40px "JetBrains Mono", ui-monospace, monospace';
      g.fillStyle = '#F4F8FB';
      g.fillText(lines[1], W * 0.74, H / 2 + 2);
    }
    g.letterSpacing = '0px';
    (this.plaque.material.map as THREE.CanvasTexture).needsUpdate = true;
  }

  /** A merge's pulse climbing the column: where (0-1 of its height) and how bright. */
  pulse(y: number, k: number) {
    this.coreMat.uniforms.uPulseY.value = y;
    this.coreMat.uniforms.uPulseK.value = k;
  }

  /** Each ring's light (0-1, lowest first). */
  rings(levels: readonly number[]) {
    for (let i = 0; i < levels.length; i++) this.lit.setColorAt(i, this.c.copy(this.steel).lerp(this.ship, Math.min(1, levels[i])).multiplyScalar(1 + 1.1 * levels[i]));
    if (this.lit.instanceColor) this.lit.instanceColor.needsUpdate = true;
  }

  /** Today's best run, etched just over its ring (none under two). */
  bestAt(best: number) {
    this.best.visible = best >= 2;
    const i = Math.min(CORE_RINGS, best) - 1;
    this.best.position.set(AFT_CORE.x, ringY(Math.max(0, i)) + 0.13, AFT_CORE.z);
  }

  /** The core's light: how bright, how many rings the run has lit, and how far its bands have run. */
  light(glow: number, lit: number, flow: number) {
    const u = this.coreMat.uniforms;
    u.uGlow.value = glow;
    u.uLit.value = lit > 0 ? (ringY(Math.min(CORE_RINGS, lit) - 1) + 0.12 - this.coreBottom) / this.coreH : 0;
    u.uFlow.value = flow % 1000;
  }
}

/** The tally's look: eight weeks of the fleet's merges as bars, this week in ship-cyan, the rest steel, the record a hairline. */
export class TallyPlaque {
  readonly mesh: THREE.Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private key = '';

  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = Math.round((1024 * TALLY.height) / TALLY.width);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    sharp(this.texture);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(TALLY.width, TALLY.height), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.mesh.position.set(TALLY.x, TALLY.y, TALLY.z);
    this.mesh.rotation.y = TALLY.rotY;
    this.mesh.name = 'drive-tally';
    onBridgeLayer(this.mesh);
  }

  paint(weeks: readonly number[], record: number) {
    const key = `${weeks.join(',')}|${record}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d')!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.fillStyle = DECK.instrument;
    g.fillRect(0, 0, W, H);
    g.fillStyle = DECK.shipDim;
    g.fillRect(0, 0, W, 3);
    g.fillRect(0, H - 3, W, 3);
    g.textBaseline = 'middle';
    g.font = '500 30px "JetBrains Mono", ui-monospace, monospace';
    g.fillStyle = DECK.ship;
    g.fillText('FLEET MERGES', 28, 44);
    g.fillStyle = DECK.muted;
    g.textAlign = 'right';
    g.fillText(record > 0 ? `8 WEEKS - RECORD ${record}` : '8 WEEKS', W - 28, 44);
    g.textAlign = 'left';
    const top = 84;
    const bottom = H - 26;
    const max = Math.max(1, record, ...weeks);
    const slot = (W - 56) / weeks.length;
    weeks.forEach((n, i) => {
      const h = ((bottom - top) * n) / max;
      const now = i === weeks.length - 1;
      g.fillStyle = now ? DECK.ship : DECK.steel;
      g.fillRect(28 + i * slot + slot * 0.18, bottom - h, slot * 0.64, Math.max(2, h));
      g.font = '500 24px "JetBrains Mono", ui-monospace, monospace';
      g.fillStyle = now ? DECK.text : DECK.muted;
      g.textAlign = 'center';
      if (n) g.fillText(String(n), 28 + i * slot + slot / 2, Math.max(top + 12, bottom - h - 18));
      g.textAlign = 'left';
    });
    if (record > 0) {
      const y = bottom - ((bottom - top) * record) / max;
      g.fillStyle = '#F4F8FB';
      for (let x = 28; x < W - 28; x += 18) g.fillRect(x, y - 1, 10, 2);
    }
    this.texture.needsUpdate = true;
  }
}
