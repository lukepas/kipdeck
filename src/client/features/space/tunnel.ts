import * as THREE from 'three';
import { DECK } from '../../world/office/materials';
import { NOISE } from './glsl';
import { SPACE_COLORS } from './logic';

// The jump's tunnel and the waypoint's name after it, both drawn as part of the sky: round whichever
// camera draws them, before the room (so every wall, rib and console passes in front and they only
// show through the glass), added to what is behind them and never painted over it.
//
// The tunnel is one open cylinder along the ship's axis, its inside a scrolling noise of ship-cyan and
// white streaks running past toward the stern, brighter toward the vanishing point ahead: one draw.
// Its brightness is capped as the jump's flash is (a third by Night, half by Day), and its shader keeps
// off pow() altogether, so the Night glow has no NaN to blur (tests/shader-pow.test.ts).

const linear = (hex: string) => new THREE.Color(hex);

const TUNNEL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const TUNNEL_FRAG = /* glsl */ `
${NOISE}
uniform float uTime;
uniform float uGain;
uniform vec3 uCyan;
uniform vec3 uWhite;
varying vec2 vUv;
void main() {
  // u round the ship, v along it: 0 astern, 1 dead ahead.
  float a = vUv.x * 64.0;
  float s = vUv.y * 18.0 + uTime * 9.0;
  float n = 0.62 * vnoise(vec3(a, s, 0.0)) + 0.38 * vnoise(vec3(a * 2.7, s * 2.1, 3.1));
  float streak = smoothstep(0.5, 0.86, n);
  // Toward the bow it gathers into a glow: the way out.
  float ahead = clamp((vUv.y - 0.45) / 0.55, 0.0, 1.0);
  ahead = ahead * ahead * ahead;
  // Astern it fades out, so the aft glass sees little of it.
  float aft = clamp(vUv.y / 0.35, 0.0, 1.0);
  vec3 col = mix(uCyan, uWhite, clamp(streak * 0.9 + ahead * 0.6, 0.0, 1.0));
  float k = (0.22 + 1.1 * streak + 1.0 * ahead) * aft * uGain;
  gl_FragColor = vec4(col * clamp(k, 0.0, 1.5), 1.0);
}`;

/** The tunnel's size (m): only its shape on screen matters, as it is drawn round the camera. */
const TUBE = { r: 16, len: 420 } as const;

export class Tunnel {
  readonly mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private t = 0;

  constructor() {
    const geo = new THREE.CylinderGeometry(TUBE.r, TUBE.r, TUBE.len, 48, 1, true);
    // Its axis along the ship's, v running from the stern (+z) to the bow (-z).
    geo.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      vertexShader: TUNNEL_VERT,
      fragmentShader: TUNNEL_FRAG,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
      uniforms: { uTime: { value: 0 }, uGain: { value: 0 }, uCyan: { value: linear(DECK.ship) }, uWhite: { value: linear(SPACE_COLORS.flash) } },
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'space-tunnel';
    // After the sky (-10), before everything else: the room draws over it.
    this.mesh.renderOrder = -9;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      this.mesh.position.copy(camera.position);
      this.mesh.updateMatrixWorld();
    };
  }

  /** How open it is now (0-1, already capped for the light mode), moved on `dt` seconds. */
  set(gain: number, dt: number) {
    this.mesh.visible = gain > 0.002;
    if (!this.mesh.visible) return;
    this.t += dt;
    this.mesh.material.uniforms.uTime.value = this.t;
    this.mesh.material.uniforms.uGain.value = gain;
  }
}

const MONO = (size: number) => `500 ${size}px "JetBrains Mono", ui-monospace, monospace`;

/**
 * Where the name and the countdown hang: this far out (m), this far right of the bow and this high on
 * the sky (degrees), this wide (m). In the clear pane right of the canopy's middle rib from the conn,
 * over the heading band and clear of the destination's world in the pane to its left.
 */
const BANNER = { at: 70, az: 9.5, el: 22.5, w: 19, canvas: [1024, 320] as const } as const;

/** The waypoint's name across the forward glass for a few seconds after the jump. */
export class Banner {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: THREE.CanvasTexture;
  private readonly at = new THREE.Vector3();

  constructor() {
    const [w, h] = BANNER.canvas;
    this.canvas.width = w;
    this.canvas.height = h;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(BANNER.w, (BANNER.w * h) / w), mat);
    this.mesh.name = 'space-banner';
    this.mesh.renderOrder = -8;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const el = THREE.MathUtils.degToRad(BANNER.el);
    const az = THREE.MathUtils.degToRad(BANNER.az);
    this.at.set(Math.sin(az) * Math.cos(el) * BANNER.at, Math.sin(el) * BANNER.at, -Math.cos(az) * Math.cos(el) * BANNER.at);
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      this.mesh.position.copy(camera.position).add(this.at);
      this.mesh.lookAt(camera.position);
      this.mesh.updateMatrixWorld();
    };
  }

  /** Paints `lines` (a small mono line over a large one). */
  write(lines: readonly string[]) {
    const g = this.canvas.getContext('2d')!;
    const { width: W, height: H } = this.canvas;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.letterSpacing = '6px';
    g.fillStyle = DECK.ship;
    g.font = MONO(42);
    g.fillText(lines[0] ?? '', W / 2, H * 0.2, W - 40);
    g.fillRect(W / 2 - 160, H * 0.36, 320, 3);
    g.letterSpacing = '4px';
    g.fillStyle = '#E8F1F6';
    // A countdown's second is set larger than a waypoint's name; a long name steps down to fit.
    const big = (lines[1] ?? '').length <= 2;
    g.font = MONO(big ? 190 : 72);
    g.fillText(lines[1] ?? '', W / 2, H * (big ? 0.7 : 0.64), W - 40);
    this.tex.needsUpdate = true;
  }

  /** How far it shows (0-1). */
  show(k: number) {
    this.mesh.visible = k > 0.002;
    this.mesh.material.opacity = Math.min(1, Math.max(0, k));
  }
}
