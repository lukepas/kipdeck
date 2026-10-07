import * as THREE from 'three';
import { DESKS, MISSION_TABLE, heightAt } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK } from '../../world/office/materials';

// Data motes: over every working station's console, a few points of ship-cyan light drift up off its
// screen and fade, more and faster the busier the station is, so a deck at work fizzes gently even
// when no state changes. Additive, writing no depth, under the glow's threshold; the motion is all in
// the vertex shader (each mote rises on its own loop from a seed), so a frame only sets one uniform
// per station. One draw call for the lot.

export interface Motes {
  /** How busy `deskId`'s station is (0 none: its motes are gone, 1 at full). */
  set(deskId: string, k: number): void;
  /** Moves the motes on `dt` seconds (0 holds them where they are). */
  step(dt: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The motes rising off the working stations' consoles (features/life). */
    motes: Motes;
  }
}

/** Motes per station, how high they rise (m) and how long one takes (s). */
export const MOTES = { per: 7, rise: 0.75, loopS: 3.2 } as const;

const VERT = /* glsl */ `
attribute float aSeed;
attribute float aStation;
uniform float uTime;
uniform float uBusy[${DESKS.length}];
uniform float uPixel;
varying float vA;
void main() {
  float busy = uBusy[int(aStation)];
  // Its own loop: busier stations run them faster.
  float speed = 0.55 + 0.9 * busy;
  float k = fract(aSeed * 7.31 + uTime * speed / ${MOTES.loopS.toFixed(2)});
  vec3 p = position;
  p.y += k * ${MOTES.rise.toFixed(2)};
  p.x += sin(aSeed * 40.0 + k * 5.0) * 0.06;
  p.z += cos(aSeed * 23.0 + k * 4.0) * 0.06;
  // Only so many of a station's motes show: more the busier it is.
  float on = step(fract(aSeed * 13.7), 0.2 + 0.8 * busy) * step(0.02, busy);
  vA = on * smoothstep(0.0, 0.15, k) * (1.0 - k) * (0.35 + 0.65 * busy);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPixel * clamp(0.06 * 600.0 / max(-mv.z, 0.5), 2.0, 9.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 14.0) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a * 0.9, 1.0);
  #include <colorspace_fragment>
}`;

export const motes: Fixture<'motes'> = (site) => {
  const n = DESKS.length * MOTES.per;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const station = new Float32Array(n);
  const index = new Map<string, number>();
  DESKS.forEach((d, i) => {
    index.set(d.id, i);
    const out = new THREE.Vector3(d.x - MISSION_TABLE.x, 0, d.z - MISSION_TABLE.z).normalize();
    // Off the console's screen face, toward the table, from just over its hood.
    const x = d.x - out.x * 0.36;
    const z = d.z - out.z * 0.36;
    for (let j = 0; j < MOTES.per; j++) {
      const o = i * MOTES.per + j;
      const s = (Math.sin((o + 1) * 12.9898) * 43758.5453) % 1;
      const r = Math.abs(s);
      pos.set([x + (r - 0.5) * 0.5, 0.95 + heightAt(d.x, d.z), z + (((r * 7.1) % 1) - 0.5) * 0.18], o * 3);
      seed[o] = r;
      station[o] = i;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aStation', new THREE.BufferAttribute(station, 1));
  const busy = new Array<number>(DESKS.length).fill(0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uTime: { value: 0 }, uBusy: { value: busy }, uPixel: { value: 1 }, uColor: { value: new THREE.Color(DECK.ship) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.name = 'life-motes';
  // Light, not a thing: never in the way of the crosshair (a Points cloud catches any ray within a metre of a mote).
  points.raycast = () => {};
  points.onBeforeRender = (renderer) => void (mat.uniforms.uPixel.value = renderer.getPixelRatio());
  site.group.add(points);
  return {
    handle: {
      motes: {
        set(deskId, k) {
          const i = index.get(deskId);
          if (i !== undefined) busy[i] = Math.max(0, Math.min(1, k));
        },
        step(dt) {
          mat.uniforms.uTime.value += dt;
        },
      },
    },
  };
};
