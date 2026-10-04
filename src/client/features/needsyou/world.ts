import * as THREE from 'three';
import { DECK } from '../../world/office/materials';

// The light over a unit that needs you: a soft column of Signal orange rising from the floor round it,
// and a wave spreading across the floor from it, there so it reads from across the deck and from the
// Overview camera. It is light, not a thing: added on top of what's behind it, brightest where you
// look straight through it and gone at its edges and its top, with faint scanlines climbing it. It
// stops at shoulder height over the unit's head, under the boards' bottom edge, so it never covers a
// board, and it fades as the camera comes up to it, so it never stands between you and the unit.
// The ring, the glyph and the ready line are the unit's own (world/character/worker.ts).

/** How high the column goes (m): about one and a half units, under the situation wall's boards. */
export const SHAFT_HEIGHT = 2;
/** How wide it is at the floor and at the top (m). */
const SHAFT_R = { foot: 0.42, top: 0.3 } as const;
/** Its strongest, from across the deck, by Night and by Day (Day's light floor takes more to show). */
export const STRENGTH = { night: 0.34, day: 0.6 } as const;
/** The most it keeps with the camera right up at it: about a third. */
export const NEAR_FLOOR = 0.35;
/** The floor wave: how far out it spreads (m) and how often (s). */
const WAVE = { from: 0.55, to: 1.6, every: 1.6 } as const;

const VERT = /* glsl */ `
varying float vY;
varying float vFacing;
void main() {
  vY = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
uniform float uHeight;
varying float vY;
varying float vFacing;
void main() {
  // Brightest looking straight through the middle, nothing at the silhouette (a fresnel the other way round).
  float body = pow(vFacing, 1.6);
  // Up from the floor, strongest at about the unit's chest, gone by the top.
  float rise = smoothstep(0.0, 0.12, vY) * pow(1.0 - vY, 1.4);
  // Soft scanlines climbing it, a line every 18 cm.
  float scan = 0.72 + 0.28 * sin((vY * uHeight / 0.18 - uTime * 0.9) * 6.2831853);
  float a = uStrength * body * rise * scan;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

let shaftShape: THREE.CylinderGeometry | undefined;
let waveShape: THREE.RingGeometry | undefined;

export class Beacon {
  /** Goes in the scene, not on the unit: it stays upright whatever the unit is doing. */
  readonly root = new THREE.Group();
  private readonly shaft: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly waves: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];

  constructor() {
    shaftShape ??= new THREE.CylinderGeometry(SHAFT_R.top, SHAFT_R.foot, 1, 28, 1, true).translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uColor: { value: new THREE.Color(DECK.signal) }, uStrength: { value: 0 }, uTime: { value: 0 }, uHeight: { value: SHAFT_HEIGHT } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.shaft = new THREE.Mesh(shaftShape, mat);
    this.shaft.scale.y = SHAFT_HEIGHT;
    this.shaft.renderOrder = 4;
    this.root.add(this.shaft);
    waveShape ??= new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(waveShape, new THREE.MeshBasicMaterial({ color: DECK.signal, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      m.position.y = 0.014;
      m.renderOrder = 3;
      this.waves.push(m);
      this.root.add(m);
    }
  }

  /**
   * Where the unit is this frame: `at` its foot and `floor` the floor under it (world heights); `near`
   * 0 with the camera across the deck up to 1 with it right beside the unit; `t` the clock (s);
   * `motion` 0 (hold still: a steady column and one still ring) to 1; `day` whether Day's lights are up.
   */
  update(at: THREE.Vector3, floor: number, near: number, t: number, motion: number, day: boolean) {
    this.root.position.set(at.x, floor, at.z);
    const k = beaconStrength(near, day);
    const u = this.shaft.material.uniforms;
    u.uStrength.value = k;
    u.uTime.value = motion > 0 ? t * motion : 0;
    this.waves.forEach((w, i) => {
      if (motion <= 0) {
        // Holding still: one ring at the middle of its spread, steady.
        w.visible = i === 0;
        w.scale.setScalar((WAVE.from + WAVE.to) / 2);
        w.material.opacity = 0.5 * (k / STRENGTH.night);
        return;
      }
      const p = (((t * motion) / WAVE.every + i / this.waves.length) % 1 + 1) % 1;
      w.visible = true;
      w.scale.setScalar(WAVE.from + (WAVE.to - WAVE.from) * p);
      w.material.opacity = Math.min(1, 0.8 * (k / STRENGTH.night)) * (1 - p) * Math.min(1, p * 6);
    });
  }

  /** Its own materials go; the shapes are every beacon's. */
  dispose() {
    this.root.removeFromParent();
    this.shaft.material.dispose();
    for (const w of this.waves) w.material.dispose();
  }
}

/** The column's strength with the camera `near` (0 across the deck, 1 right beside it): down to NEAR_FLOOR of it close up. */
export function beaconStrength(near: number, day: boolean): number {
  const n = Math.min(1, Math.max(0, near));
  return (day ? STRENGTH.day : STRENGTH.night) * (1 - (1 - NEAR_FLOOR) * n);
}
