// The holo city's meshes: four draws whatever the project. Every tower, district floor and the next
// step's beam is an instance of one box (one draw), the district outlines, the projector's corner rays
// and not-started towers' wireframes one set of lines, the milestone rings one mesh, the recent commits
// one Points buffer. The city stands CITY.lift over the tabletop; the rings stay on it. All light in the
// holo's way: additive, never in the aim's way (the stand-ins in world.ts take the aim). The towers
// write depth, so looking along a row adds the nearest one or two, not every tower in it (which summed to
// a white blur from the side), and every colour is capped under the bloom's threshold except a stuck
// part's, capped just over it: only stuck glows. Each frame only uniforms change. Every shader keeps
// clear of pow() and division, so no fragment is ever NaN (the black frame).
import * as THREE from 'three';
import type { Status } from '../../../shared/rundown/schema';
import { CITY, RINGS, type CityLayout } from './logic';

/** Each status's light (linear): only stuck is meant to reach the bloom. */
export const STATUS_LIGHT: Record<Status, { color: string; gain: number }> = {
  done: { color: '#4ADE80', gain: 0.26 },
  'in-progress': { color: '#60A5FA', gain: 0.3 },
  'not-started': { color: '#A8AFBB', gain: 0.1 },
  stuck: { color: '#FF4D5E', gain: 1.1 },
};
/** The brightest any fragment of the city gets: under the bloom's threshold (lights/modes.ts, 0.85), a stuck part's just over it. */
export const CAP = { calm: 0.6, stuck: 1.0 } as const;
export const ACCENT = '#FF8A3D';

const TOWER_VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec2 aFlags;
uniform float uTime;
uniform float uMotion;
varying vec3 vColor;
varying float vY;
varying float vLift;
varying float vCap;
void main() {
  vec4 world = instanceMatrix * vec4(position, 1.0);
  vCap = mix(${CAP.calm.toFixed(2)}, ${CAP.stuck.toFixed(2)}, aFlags.x);
  vY = clamp(position.y, 0.0, 1.0);
  // A stuck part blinks slowly; one with uncommitted changes shimmers (both still with motion off).
  float blink = mix(1.0, 0.55 + 0.45 * sin(uTime * 2.2), aFlags.x * uMotion);
  float shimmer = mix(1.0, 0.82 + 0.18 * sin(uTime * 6.0 + world.x * 23.0 + world.z * 17.0), aFlags.y * uMotion);
  vColor = aColor * blink * shimmer;
  vLift = step(0.98, position.y);
  gl_Position = projectionMatrix * modelViewMatrix * world;
}`;

const TOWER_FRAG = /* glsl */ `
uniform float uGain;
varying vec3 vColor;
varying float vY;
varying float vLift;
varying float vCap;
void main() {
  // Brighter toward the top, the roof brightest: light standing on the table.
  float a = (0.12 + 0.38 * vY + 0.3 * vLift) * uGain;
  gl_FragColor = vec4(min(vColor * a, vec3(vCap)), 1.0);
  #include <colorspace_fragment>
}`;

const RING_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aPulse;
uniform float uTime;
uniform float uMotion;
varying vec3 vColor;
void main() {
  vColor = aColor * mix(1.0, 0.75 + 0.25 * sin(uTime * 1.6), aPulse * uMotion);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RING_FRAG = /* glsl */ `
uniform float uGain;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor * uGain, 1.0);
  #include <colorspace_fragment>
}`;

const PULSE_VERT = /* glsl */ `
attribute vec3 aInfo;
uniform float uTime;
uniform float uPixel;
varying float vA;
void main() {
  // aInfo: the tower's height, the pulse's phase, how bright. It climbs the tower and fades at the top.
  float u = fract(uTime * 0.4 + aInfo.y);
  vec3 p = position + vec3(0.0, u * aInfo.x + 0.02, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vA = aInfo.z * (1.0 - u) * smoothstep(0.0, 0.1, u);
  // Never a blot up close: 2 to 14 pixels.
  gl_PointSize = clamp(uPixel * 0.022 * 900.0 / max(-mv.z, 0.5), 2.0, 14.0 * uPixel);
}`;

const PULSE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uGain;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = min(exp(-dot(c, c) * 14.0) * vA * uGain, 0.7);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

/** Never under the aim: the city is light, and its stand-ins take the clicks. */
const noRay = (o: THREE.Object3D) => {
  o.raycast = () => {};
  o.castShadow = false;
  o.receiveShadow = false;
  o.renderOrder = 3;
  o.frustumCulled = false;
};

export interface CityMeshes {
  group: THREE.Group;
  /** Draws `layout` (only when it changed). */
  build(layout: CityLayout): void;
  /** One frame: `t` seconds of motion (held with motion off), how much shows (0-1), whether pulses run. */
  frame(t: number, gain: number, motion: boolean, pulses: boolean): void;
  /** The top of the tallest tower in each district over the tabletop (the lift included), for its callout. */
  tops(): Map<string, number>;
}

export function cityMeshes(): CityMeshes {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uMotion: { value: 1 }, uGain: { value: 1 } };

  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const max = CITY.maxTowers + 16;
  const colors = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const flags = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
  box.setAttribute('aColor', colors);
  box.setAttribute('aFlags', flags);
  const towerMat = new THREE.ShaderMaterial({ vertexShader: TOWER_VERT, fragmentShader: TOWER_FRAG, uniforms, ...additive, depthWrite: true });
  towerMat.userData.holo = true;
  const towers = new THREE.InstancedMesh(box, towerMat, max);
  towers.count = 0;

  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, ...additive, opacity: 0.55, toneMapped: false });
  lineMat.userData.holo = true;
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat);

  const ringMat = new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, uniforms, ...additive, side: THREE.DoubleSide });
  ringMat.userData.holo = true;
  const rings = new THREE.Mesh(new THREE.BufferGeometry(), ringMat);
  rings.position.y = 0.016;

  const pulseUniforms = { uTime: uniforms.uTime, uGain: uniforms.uGain, uPixel: { value: 1 }, uColor: { value: new THREE.Color('#FFE6CC') } };
  const pulseMat = new THREE.ShaderMaterial({ vertexShader: PULSE_VERT, fragmentShader: PULSE_FRAG, uniforms: pulseUniforms, ...additive });
  pulseMat.userData.holo = true;
  const pulses = new THREE.Points(new THREE.BufferGeometry(), pulseMat);
  pulses.onBeforeRender = (renderer) => void (pulseUniforms.uPixel.value = renderer.getPixelRatio());

  // The city on its plane over the table; the milestone rings on the tabletop under it.
  const raised = new THREE.Group();
  raised.position.y = CITY.lift;
  raised.add(towers, lines, pulses);
  group.add(raised, rings);
  group.traverse(noRay);

  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let topOf = new Map<string, number>();

  const build = (layout: CityLayout) => {
    let i = 0;
    const put = (x: number, z: number, w: number, h: number, d: number, status: Status | 'beam', k: number, blink: number, shimmer: number, y = 0) => {
      m.makeScale(w, h, d).setPosition(x, y, z);
      towers.setMatrixAt(i, m);
      const L = status === 'beam' ? { color: ACCENT, gain: 0.55 } : STATUS_LIGHT[status];
      c.set(L.color).multiplyScalar(L.gain * k);
      colors.setXYZ(i, c.r, c.g, c.b);
      flags.setXY(i, blink, shimmer);
      i++;
    };
    // The district floors, faint, then the towers.
    for (const d of layout.districts) put(d.x, d.z, d.w, 0.012, d.d, d.status, 0.45, d.status === 'stuck' ? 1 : 0, d.dirty ? 1 : 0);
    topOf = new Map();
    for (const t of layout.towers) {
      if (i >= max) break;
      const dirty = layout.districts.find((d) => d.id === t.partId)?.dirty ? 1 : 0;
      put(t.x, t.z, t.w, t.h, t.d, t.status, t.status === 'not-started' ? 0.6 : 1, t.status === 'stuck' ? 1 : 0, dirty);
      topOf.set(t.partId, Math.max(topOf.get(t.partId) ?? 0, t.h));
    }
    // The next step's beam: a thin shaft of the accent rising from its district, breathing.
    if (layout.beam && i < max) put(layout.beam.x, layout.beam.z, 0.035, 0.95, 0.035, 'beam', 1, 1, 0, topOf.get(layout.beam.partId) ?? 0);
    towers.count = i;
    towers.instanceMatrix.needsUpdate = true;
    colors.needsUpdate = true;
    flags.needsUpdate = true;

    // Outlines: each district's edge, and a not-started part's towers as wireframe.
    const pos: number[] = [];
    const col: number[] = [];
    const seg = (a: number[], b: number[], color: THREE.Color) => {
      pos.push(...a, ...b);
      col.push(color.r, color.g, color.b, color.r, color.g, color.b);
    };
    // The projector's rays: from the tabletop up to the plane's corners, faint.
    const half = CITY.size / 2;
    c.set('#7FD8EE').multiplyScalar(0.22);
    for (const [x, z] of [[-half, -half], [half, -half], [half, half], [-half, half]]) seg([x * 0.35, -CITY.lift, z * 0.35], [x, 0, z], c);
    for (const d of layout.districts) {
      const L = STATUS_LIGHT[d.status];
      c.set(L.color).multiplyScalar(Math.min(0.6, L.gain + 0.25));
      const x0 = d.x - d.w / 2;
      const x1 = d.x + d.w / 2;
      const z0 = d.z - d.d / 2;
      const z1 = d.z + d.d / 2;
      const y = 0.014;
      seg([x0, y, z0], [x1, y, z0], c);
      seg([x1, y, z0], [x1, y, z1], c);
      seg([x1, y, z1], [x0, y, z1], c);
      seg([x0, y, z1], [x0, y, z0], c);
    }
    for (const t of layout.towers) {
      if (t.status !== 'not-started') continue;
      c.set(STATUS_LIGHT['not-started'].color).multiplyScalar(0.35);
      const xs = [t.x - t.w / 2, t.x + t.w / 2];
      const zs = [t.z - t.d / 2, t.z + t.d / 2];
      for (const x of xs) for (const z of zs) seg([x, 0, z], [x, t.h, z], c);
      for (const y of [0, t.h]) {
        seg([xs[0], y, zs[0]], [xs[1], y, zs[0]], c);
        seg([xs[1], y, zs[0]], [xs[1], y, zs[1]], c);
        seg([xs[1], y, zs[1]], [xs[0], y, zs[1]], c);
        seg([xs[0], y, zs[1]], [xs[0], y, zs[0]], c);
      }
    }
    lines.geometry.dispose();
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    lines.geometry = lg;

    // The rings: solid when done, the active one dim with its done arc lit and breathing, dashed ahead.
    const rp: number[] = [];
    const rc: number[] = [];
    const rpulse: number[] = [];
    const SEG = 160;
    for (const ring of layout.rings) {
      const r0 = ring.radius - RINGS.width / 2;
      const r1 = ring.radius + RINGS.width / 2;
      for (let s = 0; s < SEG; s++) {
        if (ring.state === 'ahead' && s % 8 >= 4) continue;
        // From the bow (-z), clockwise from above, like the heading's progress ring.
        const a0 = -Math.PI / 2 - (s / SEG) * Math.PI * 2;
        const a1 = -Math.PI / 2 - ((s + 1) / SEG) * Math.PI * 2;
        const lit = ring.state === 'active' && s / SEG < ring.progress;
        if (ring.state === 'done') c.set(STATUS_LIGHT.done.color).multiplyScalar(0.35);
        else if (ring.state === 'active') c.set(ACCENT).multiplyScalar(lit ? 0.75 : 0.18);
        else c.set('#A8AFBB').multiplyScalar(0.16);
        const p = [Math.cos(a0) * r0, 0, Math.sin(a0) * r0, Math.cos(a0) * r1, 0, Math.sin(a0) * r1, Math.cos(a1) * r1, 0, Math.sin(a1) * r1, Math.cos(a1) * r0, 0, Math.sin(a1) * r0];
        const quad = [0, 1, 2, 0, 2, 3];
        for (const q of quad) {
          rp.push(p[q * 3], p[q * 3 + 1], p[q * 3 + 2]);
          rc.push(c.r, c.g, c.b);
          rpulse.push(ring.state === 'active' ? 1 : 0);
        }
      }
    }
    rings.geometry.dispose();
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    rg.setAttribute('aColor', new THREE.Float32BufferAttribute(rc, 3));
    rg.setAttribute('aPulse', new THREE.Float32BufferAttribute(rpulse, 1));
    rings.geometry = rg;
    rings.visible = rp.length > 0;

    // The pulses: one point per recent commit and tower, climbing it.
    const pp: number[] = [];
    const info: number[] = [];
    for (const p of layout.pulses.slice(0, CITY.maxPulses)) {
      const t = layout.towers[p.tower];
      if (!t) continue;
      pp.push(t.x, 0, t.z);
      info.push(t.h, p.phase, p.bright);
    }
    pulses.geometry.dispose();
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    pg.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3));
    pulses.geometry = pg;
    pulses.userData.has = pp.length > 0;
  };

  const frame = (t: number, gain: number, motion: boolean, runPulses: boolean) => {
    uniforms.uTime.value = t;
    uniforms.uMotion.value = motion ? 1 : 0;
    uniforms.uGain.value = gain;
    pulses.visible = runPulses && !!pulses.userData.has;
    lineMat.opacity = 0.55 * gain;
  };

  return { group, build, frame, tops: () => new Map([...topOf].map(([id, h]) => [id, h + CITY.lift])) };
}
