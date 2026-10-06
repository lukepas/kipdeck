import * as THREE from 'three';
import { DECK } from '../../world/office/materials';
import { CANOPY, canopyPoint, onBridgeLayer } from '../bridge/shapes';
import { HALO_GLINT, RIB_WAVE, WAKE } from './logic';

// What the pulse draws, all of it animated on the GPU from one clock (no per-frame work on the CPU
// but a few uniforms): the rib wave and the halo's glint as one mesh of thin lit strips under the
// canopy's ribs and round its halo (one draw), and the wake as one instanced draw of streaks over the
// glass. Both are additive light, never over a board (they're in the canopy, above the arc).

const RIB_VERT = /* glsl */ `
attribute float aF;
attribute float aK;
attribute float aKind;
varying float vF;
varying float vK;
varying float vKind;
void main() {
  vF = aF;
  vK = aK;
  vKind = aKind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RIB_FRAG = /* glsl */ `
uniform float uT;
uniform float uLevel;
uniform vec3 uColor;
uniform vec3 uGlint;
varying float vF;
varying float vK;
varying float vKind;
void main() {
  float a = 0.0;
  if (vKind < 0.5) {
    // A rib: the wave's head along it, rib k a little behind rib k-1, so it turns round the dome.
    float local = uT - vK * ${RIB_WAVE.lag.toFixed(3)};
    float s = mod(local, ${RIB_WAVE.every.toFixed(1)});
    float head = s * ${(1000 / RIB_WAVE.ms).toFixed(4)};
    float d = (vF - head) / ${RIB_WAVE.width.toFixed(3)};
    // A bright head with a short tail behind it, fading as it nears the eaves.
    float tail = vF < head ? exp(-(head - vF) * 9.0) * 0.35 : 0.0;
    a = (exp(-d * d * 3.0) + tail) * (1.0 - 0.6 * vF) * step(head, 1.0 + ${RIB_WAVE.width.toFixed(3)} * 2.0) * ${RIB_WAVE.gain.toFixed(2)};
    gl_FragColor = vec4(uColor * a * uLevel, 1.0);
  } else {
    // The halo: a glint turning round it, and a faint steady line.
    float g = fract(vK - uT / ${HALO_GLINT.turnS.toFixed(1)});
    float glint = exp(-g * 14.0) + exp(-(1.0 - g) * 60.0);
    gl_FragColor = vec4(uGlint * (0.12 + glint * ${HALO_GLINT.gain.toFixed(2)}) * uLevel, 1.0);
  }
}`;

/** The rib wave's strips and the halo's glint: one mesh, additive. */
export function ribWave(): { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> } {
  const pos: number[] = [];
  const f: number[] = [];
  const k: number[] = [];
  const kind: number[] = [];
  const n = CANOPY.ribs;
  const STEPS = 24;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const side = new THREE.Vector3();
  const quad = (p0: THREE.Vector3, p1: THREE.Vector3, w: number, f0: number, f1: number, kk: number, kd: number) => {
    side.subVectors(p1, p0).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(w / 2);
    const c = [p0.clone().sub(side), p0.clone().add(side), p1.clone().add(side), p1.clone().sub(side)];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(c[i].x, c[i].y, c[i].z);
      f.push(i === 0 || i === 1 ? f0 : f1);
      k.push(kk);
      kind.push(kd);
    }
  };
  for (let r = 0; r < n; r++) {
    const theta = (r / n) * Math.PI * 2;
    for (let i = 0; i < STEPS; i++) {
      canopyPoint(theta, i / STEPS, a);
      canopyPoint(theta, (i + 1) / STEPS, b);
      // Just under the rib's own hairline (hull.ts), a little wider so the wave reads from the chair.
      a.y -= 0.15;
      b.y -= 0.15;
      quad(a, b, 0.1, i / STEPS, (i + 1) / STEPS, r, 0);
    }
  }
  // The halo, under its lit underside.
  const SEG = 96;
  for (let i = 0; i < SEG; i++) {
    const t0 = (i / SEG) * Math.PI * 2;
    const t1 = ((i + 1) / SEG) * Math.PI * 2;
    a.set(Math.cos(t0) * CANOPY.halo, CANOPY.top - 0.16, Math.sin(t0) * CANOPY.halo);
    b.set(Math.cos(t1) * CANOPY.halo, CANOPY.top - 0.16, Math.sin(t1) * CANOPY.halo);
    const p = pos.length;
    quad(a, b, 0.06, 0, 0, i / SEG, 1);
    // Each strip's own place round the halo, at both ends.
    for (let j = 0; j < 6; j++) k[p / 3 + j] = (i + (j === 2 || j === 3 || j === 4 ? 1 : 0)) / SEG;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aF', new THREE.Float32BufferAttribute(f, 1));
  geo.setAttribute('aK', new THREE.Float32BufferAttribute(k, 1));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  const uniforms = { uT: { value: 0 }, uLevel: { value: 0 }, uColor: { value: new THREE.Color(DECK.ship) }, uGlint: { value: new THREE.Color(DECK.ship) } };
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({ vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false }),
  );
  mesh.name = 'pulse-ribs';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh: onBridgeLayer(mesh), uniforms };
}

const WAKE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uT;
varying float vU;
varying float vA;
void main() {
  // Each streak's own lane (x, y), length and phase, streaming aft (+z) and wrapping round its run.
  float len = mix(${WAKE.len[0].toFixed(1)}, ${WAKE.len[1].toFixed(1)}, aSeed.z);
  float z = mod(aSeed.w * ${WAKE.span.toFixed(1)} + uT * ${WAKE.speed.toFixed(1)} * (0.7 + 0.6 * aSeed.z), ${WAKE.span.toFixed(1)}) - ${(WAKE.span / 2).toFixed(1)};
  vec3 p = vec3(aSeed.x, aSeed.y, z + position.y * len);
  vU = position.y;
  // Fading in at the bow and out at the stern, so none pops at the wrap.
  float e = (z + ${(WAKE.span / 2).toFixed(1)}) / ${WAKE.span.toFixed(1)};
  vA = sin(e * 3.14159);
  // A streak a few centimetres wide, facing up and down the canopy (it's seen from under it).
  p.x += position.x * 0.1;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const WAKE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
varying float vU;
varying float vA;
void main() {
  // Bright at its head (the bow end), a long tail aft.
  float head = 1.0 - clamp(vU + 0.5, 0.0, 1.0);
  float a = head * head * vA * ${WAKE.gain.toFixed(2)} * uLevel;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

/** The wake over the canopy: one instanced draw of streaks, each placed by its seed in the shader. */
export function wake(): { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> } {
  const base = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  // The plane lies in x-z; the shader reads its corners as (x across, y along), so swap z into y.
  const p = base.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i), p.getZ(i), 0);
  const geo = new THREE.InstancedBufferGeometry().copy(base as unknown as THREE.InstancedBufferGeometry);
  geo.instanceCount = WAKE.count;
  const seeds = new Float32Array(WAKE.count * 4);
  let s = 0x9e3779b9;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < WAKE.count; i++) {
    seeds[i * 4] = (rnd() * 2 - 1) * WAKE.x;
    seeds[i * 4 + 1] = WAKE.y[0] + rnd() * (WAKE.y[1] - WAKE.y[0]);
    seeds[i * 4 + 2] = rnd();
    seeds[i * 4 + 3] = rnd();
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  const uniforms = { uT: { value: 0 }, uLevel: { value: 0 }, uColor: { value: new THREE.Color('#BFE6F2') } };
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({ vertexShader: WAKE_VERT, fragmentShader: WAKE_FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false }),
  );
  mesh.name = 'pulse-wake';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh: onBridgeLayer(mesh), uniforms };
}
