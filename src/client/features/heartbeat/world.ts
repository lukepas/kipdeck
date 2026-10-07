import * as THREE from 'three';
import { HEARTBEAT } from './logic';

// The heartbeat on the floor: a thin ring that swells out from a unit's console each time one of its
// tool calls lands, in the hue of what the call was, and a 300-degree arc under each working unit that
// drains clockwise as it goes quiet. Each is one instanced draw for every unit on the deck, and setting
// a frame's instances allocates nothing.

/** Most units drawn (a deck seats 16 at its consoles, the overflow bay and the Standby bench more). */
const MAX = 32;
/** The arc's width (m) and how many segments it's cut in. */
const ARC_W = 0.06;
const ARC_SEGMENTS = 60;
/** How bright the drained part of the arc stays, so the meter still reads as a meter when it's empty. */
const TRACK = 0.1;

const METER_VERT = /* glsl */ `
attribute float along;
attribute vec4 aMeter;
varying float vAlong;
varying vec4 vMeter;
void main() {
  vAlong = along;
  vMeter = aMeter;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const METER_FRAG = /* glsl */ `
uniform float uGain;
varying float vAlong;
varying vec4 vMeter;
void main() {
  // vMeter.a is how much has drained: the arc is lit from there to its end, so it empties clockwise.
  float lit = step(vMeter.a, vAlong);
  float a = mix(${TRACK.toFixed(2)}, 0.9, lit) * uGain;
  gl_FragColor = vec4(vMeter.rgb, a);
  #include <colorspace_fragment>
}`;

/** A flat arc on the floor, `sweep` radians clockwise seen from above, its gap centred on +z (the unit's front). */
function arcGeometry(r: number, w: number, sweep: number, segments: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const along: number[] = [];
  const index: number[] = [];
  // Seen from above, (sin a, -cos a) runs clockwise; the gap is centred on a = PI, which is +z.
  const start = Math.PI + (Math.PI * 2 - sweep) / 2;
  for (let i = 0; i <= segments; i++) {
    const k = i / segments;
    const a = start + sweep * k;
    const s = Math.sin(a);
    const c = -Math.cos(a);
    pos.push(s * (r - w / 2), 0, c * (r - w / 2), s * (r + w / 2), 0, c * (r + w / 2));
    along.push(k, k);
    if (i < segments) {
      const j = i * 2;
      // Wound to face up (+y), as the deck's other floor marks do.
      index.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(index);
  return g;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, MAX);
  m.count = 0;
  m.visible = false;
  m.frustumCulled = false;
  m.castShadow = false;
  m.receiveShadow = false;
  m.renderOrder = 3;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

/** The two meshes, and a frame's pulses and meters set one at a time between begin() and end(). */
export class HeartbeatSet {
  readonly root = new THREE.Group();
  private readonly rings: THREE.InstancedMesh;
  private readonly meters: THREE.InstancedMesh;
  private readonly meterAttr: THREE.InstancedBufferAttribute;
  private readonly meterMat: THREE.ShaderMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly s2 = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly c = new THREE.Color();
  private nRings = 0;
  private nMeters = 0;

  constructor() {
    // The pulse: a thin ring 1 m out, scaled to its radius; its hue times its opacity, added to what's under it.
    const ring = new THREE.RingGeometry(0.93, 1, 64, 1).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.rings = instanced(ring, ringMat);
    for (let i = 0; i < MAX; i++) this.rings.setColorAt(i, this.c.setRGB(0, 0, 0));
    this.rings.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    // The quiet meter: its hue and how far it's drained, an instance at a time.
    const arc = arcGeometry(HEARTBEAT.meterR, ARC_W, HEARTBEAT.sweep, ARC_SEGMENTS);
    this.meterAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.meterAttr.setUsage(THREE.DynamicDrawUsage);
    arc.setAttribute('aMeter', this.meterAttr);
    this.meterMat = new THREE.ShaderMaterial({
      vertexShader: METER_VERT,
      fragmentShader: METER_FRAG,
      uniforms: { uGain: { value: 1 } },
      transparent: true,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.meters = instanced(arc, this.meterMat);
    this.root.add(this.meters, this.rings);
    this.root.name = 'heartbeat';
  }

  begin() {
    this.nRings = 0;
    this.nMeters = 0;
  }

  /**
   * A pulse ring centred on `at`, `shape.x` m out, in `hue` at opacity `shape.y`. The numbers come in
   * vectors, not as arguments: a computed number passed to a call that isn't inlined is boxed, which
   * would allocate every frame.
   */
  pulse(at: THREE.Vector3, shape: THREE.Vector2, hue: THREE.Color) {
    if (this.nRings >= MAX || shape.y <= 0) return;
    this.q.identity();
    this.m.compose(at, this.q, this.s2.set(shape.x, 1, shape.x));
    this.rings.setMatrixAt(this.nRings, this.m);
    this.rings.setColorAt(this.nRings, this.c.copy(hue).multiplyScalar(shape.y));
    this.nRings++;
  }

  /** A meter under a unit at `at`, turned `turn.x` (its front's yaw), drained `turn.y` (0-1), in `hue`. */
  meter(at: THREE.Vector3, turn: THREE.Vector2, hue: THREE.Color) {
    if (this.nMeters >= MAX) return;
    this.q.setFromAxisAngle(UP, turn.x);
    this.m.compose(at, this.q, this.s2.set(1, 1, 1));
    this.meters.setMatrixAt(this.nMeters, this.m);
    this.meterAttr.setXYZW(this.nMeters, hue.r, hue.g, hue.b, turn.y);
    this.nMeters++;
  }

  /** How bright the meters are (1, less while someone needs you), read at end(). */
  readonly gain = { meter: 1 };

  /** Puts the frame's instances up. */
  end() {
    this.rings.count = this.nRings;
    this.rings.visible = this.nRings > 0;
    if (this.nRings) {
      this.rings.instanceMatrix.needsUpdate = true;
      this.rings.instanceColor!.needsUpdate = true;
    }
    this.meters.count = this.nMeters;
    this.meters.visible = this.nMeters > 0;
    if (this.nMeters) {
      this.meters.instanceMatrix.needsUpdate = true;
      this.meterAttr.needsUpdate = true;
    }
    this.meterMat.uniforms.uGain.value = this.gain.meter;
  }

  /** How many of each were drawn this frame (for the shots and the probe). */
  counts(): { rings: number; meters: number } {
    return { rings: this.nRings, meters: this.nMeters };
  }
}

const UP = new THREE.Vector3(0, 1, 0);
