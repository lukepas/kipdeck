import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DECK } from '../../world/office/materials';
import { BLINK, MARK, type Signal } from './logic';

// The attention signals in the room, each its own shape, colour, motion and place, so a unit's state
// reads from the captain's chair without a word: an orange diamond turning half a metre over the head
// of one that needs you, and a beam of orange light from it up to its card on the Attention board; a
// red triangle over one that's stuck, blinking once a second, and a red rim on the floor round its
// station; an amber ring turning slowly at the feet of one to review; a small cyan pip over one at
// work. Each kind is one instanced draw for every unit that shows it. The marks are set at their hue's
// full strength and no further: the tone mapping (Neutral) washes a hue past that toward white, and a
// diamond has to stay orange to say "needs you".

/** Most units one kind draws (a deck seats 16 at its consoles, the overflow bay and the Standby bench more). */
const MAX = 32;

/** HDR colour: `hex` at `k` times its strength, so it rises over the bloom threshold. */
const hot = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, order: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, MAX);
  m.count = 0;
  m.visible = false;
  m.frustumCulled = false;
  m.castShadow = false;
  m.receiveShadow = false;
  m.renderOrder = order;
  return m;
}

const BEAM_VERT = /* glsl */ `
varying float vY;
void main() {
  vY = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uGain;
varying float vY;
void main() {
  // A faint thread of light (it read as a hard red line across the crew from the chair), dashes of data
  // streaming up it to the card, and a pulse running up it (still with less motion: uTime held).
  float head = fract(uTime / 1.6);
  float d = vY - head;
  float pulse = exp(-d * d * 260.0);
  float dash = step(0.55, fract(vY * 16.0 - uTime * 2.2));
  float a = (0.05 + 0.1 * vY + 0.22 * dash + 0.9 * pulse) * uGain;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

/** The meshes and how to set each frame's marks. */
export class SignalSet {
  readonly root = new THREE.Group();
  private readonly diamonds: THREE.InstancedMesh;
  private readonly triangles: THREE.InstancedMesh;
  private readonly rims: THREE.InstancedMesh;
  private readonly rings: THREE.InstancedMesh;
  private readonly pips: THREE.InstancedMesh;
  private readonly beams: THREE.InstancedMesh;
  private readonly triMat: THREE.MeshBasicMaterial;
  private readonly beamMat: THREE.ShaderMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    const basic = (color: THREE.Color, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: true, ...extra });
    // Needs you: a diamond, a little taller than wide.
    this.diamonds = instanced(new THREE.OctahedronGeometry(MARK.diamond, 0).scale(1, 1.35, 0.55), basic(hot(DECK.signal, 1)), 6);
    // Stuck: a triangle standing up, point up, turned to the eye each frame.
    const tri = new THREE.CylinderGeometry(MARK.triangle, MARK.triangle, 0.05, 3).rotateX(Math.PI / 2).rotateZ(Math.PI);
    this.triMat = basic(hot(DECK.stuck, 1));
    this.triangles = instanced(tri, this.triMat, 6);
    // Its station's rim: a square frame flat on the floor round it.
    const rim = new THREE.RingGeometry(MARK.rim - 0.06, MARK.rim, 4, 1).rotateZ(Math.PI / 4).rotateX(-Math.PI / 2);
    this.rims = instanced(rim, basic(hot(DECK.stuck, 0.9), { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), 3);
    // To review: a broken amber ring at the feet, three arcs of it, turning.
    const arcs = [0, 1, 2].map((i) => new THREE.RingGeometry(MARK.ring - 0.05, MARK.ring, 24, 1, (i * Math.PI * 2) / 3, (Math.PI * 2) / 3 - 0.45).rotateX(-Math.PI / 2));
    this.rings = instanced(mergeGeometries(arcs), basic(hot(DECK.review, 0.9), { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), 3);
    // Working: a small cyan pip.
    this.pips = instanced(new THREE.SphereGeometry(MARK.pip, 10, 6), basic(hot(DECK.ship, 1)), 6);
    // The beam from a unit that needs you up to its card: a thin tube 0 to 1 m up, stretched to reach.
    this.beamMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { uColor: { value: hot(DECK.signal, 0.8) }, uTime: { value: 0 }, uGain: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.beams = instanced(new THREE.CylinderGeometry(MARK.beam, MARK.beam, 1, 6, 1, true).translate(0, 0.5, 0), this.beamMat, 5);
    for (const mesh of [this.rims, this.rings, this.beams, this.pips, this.diamonds, this.triangles]) this.root.add(mesh);
    this.root.name = 'signals';
  }

  /**
   * Sets this frame's marks: `signals` (where each unit is, what it shows, and where its card is, if it
   * has one), the eye's yaw (the triangles face it), the clock `t` (s) and `motion` (0 holds everything
   * still: the triangles steady, the rings and diamonds unturned, no pulse up the beams).
   */
  set(signals: readonly Signal[], eyeYaw: number, t: number, motion: number) {
    const tm = t * motion;
    let nd = 0;
    let nt = 0;
    let nr = 0;
    let nrim = 0;
    let np = 0;
    let nb = 0;
    for (const sg of signals) {
      const { head, foot } = sg;
      switch (sg.kind) {
        case 'needs-you': {
          if (nd >= MAX) break;
          const bob = Math.sin(tm * 2.1 + sg.phase) * 0.04;
          this.q.setFromAxisAngle(this.up, tm * 1.4 + sg.phase);
          this.m.compose(this.p.set(head.x, head.y + MARK.over + bob, head.z), this.q, this.s.set(1, 1, 1));
          this.diamonds.setMatrixAt(nd++, this.m);
          if (sg.card && nb < MAX) {
            // From just under the diamond up to the card's left edge.
            this.p.set(head.x, head.y + MARK.over - MARK.diamond * 1.4, head.z);
            this.dir.subVectors(sg.card, this.p);
            // A new call's beam climbs to its card (features/hail): only so much of it is drawn yet.
            const len = this.dir.length() * Math.max(0.001, sg.reach);
            this.q.setFromUnitVectors(this.up, this.dir.normalize());
            this.m.compose(this.p, this.q, this.s.set(1, len, 1));
            this.beams.setMatrixAt(nb++, this.m);
          }
          break;
        }
        case 'stuck': {
          if (nt >= MAX) break;
          this.q.setFromAxisAngle(this.up, eyeYaw);
          this.m.compose(this.p.set(head.x, head.y + MARK.over, head.z), this.q, this.s.set(1, 1, 1));
          this.triangles.setMatrixAt(nt++, this.m);
          this.q.identity();
          this.m.compose(this.p.set(sg.station.x, foot.y + 0.02, sg.station.z), this.q, this.s.set(1, 1, 1));
          this.rims.setMatrixAt(nrim++, this.m);
          break;
        }
        case 'review': {
          if (nr >= MAX) break;
          this.q.setFromAxisAngle(this.up, tm * 0.35 + sg.phase);
          this.m.compose(this.p.set(foot.x, foot.y + 0.025, foot.z), this.q, this.s.set(1, 1, 1));
          this.rings.setMatrixAt(nr++, this.m);
          break;
        }
        case 'working': {
          if (np >= MAX) break;
          this.q.identity();
          this.m.compose(this.p.set(head.x, head.y + MARK.pipOver + Math.sin(tm * 1.3 + sg.phase) * 0.02, head.z), this.q, this.s.set(1, 1, 1));
          this.pips.setMatrixAt(np++, this.m);
          break;
        }
      }
    }
    const done: [THREE.InstancedMesh, number][] = [
      [this.diamonds, nd],
      [this.triangles, nt],
      [this.rims, nrim],
      [this.rings, nr],
      [this.pips, np],
      [this.beams, nb],
    ];
    for (const [mesh, n] of done) {
      mesh.count = n;
      mesh.visible = n > 0;
      if (n) mesh.instanceMatrix.needsUpdate = true;
    }
    // Stuck blinks once a second (held lit with motion off).
    this.triMat.color.copy(hot(DECK.stuck, motion > 0 ? (blinkOn(t) ? 1 : 0.22) : 1));
    this.beamMat.uniforms.uTime.value = motion > 0 ? t : 0.35 * 1.6;
  }
}

/** Whether a 1 Hz blink is lit at `t` seconds: on for BLINK.on of each second. */
export function blinkOn(t: number): boolean {
  return ((t % 1) + 1) % 1 < BLINK.on;
}
