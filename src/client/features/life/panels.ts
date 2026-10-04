import * as THREE from 'three';
import { DESKS } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import { DECK } from '../../world/office/materials';
import { BLINK, PANEL, type PanelMode } from './logic';

// The station screens: a wide screen on the face of every console's pedestal, toward the table, so you
// see each station's life from the table, the conn and across the deck. A working station's screen
// runs bars that scroll with its unit's terminal output, a scan line sweeps it now and then, and three
// blinkers twinkle at its end; a station whose unit needs you, is stuck, has work to review or just
// merged shows that state's glyph in its own hue and shape and goes quiet around it; one standing by
// keeps a dim dash and one steady blinker. All sixteen are one instanced mesh with one shader.

export interface StationPanels {
  /** What `deskId`'s screen shows: its mode, how busy it is (0-1) and how loud its ambient life is (0-1). */
  set(deskId: string, mode: PanelMode, activity: number, gain: number): void;
  /** The screens' clock (s): held still under reduced motion. */
  time(t: number): void;
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The station screens on the consoles' pedestals (features/life). */
    panels: StationPanels;
  }
}

/** The screen on the pedestal's face: its size, how high its middle is, and how far out from the console's middle. */
const SCREEN = { w: 0.96, h: 0.3, y: 0.42, z: -0.338 } as const;

const vertex = /* glsl */ `
attribute float aMode;
attribute float aAct;
attribute float aGain;
attribute float aSeed;
varying vec2 vUv;
varying float vMode;
varying float vAct;
varying float vGain;
varying float vSeed;
void main() {
  vUv = uv;
  vMode = aMode;
  vAct = aAct;
  vGain = aGain;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const fragment = /* glsl */ `
uniform float uTime;
uniform vec3 uInk;
uniform vec3 uShip;
uniform vec3 uShipDim;
uniform vec3 uLed;
uniform vec3 uSteel;
uniform vec3 uSignal;
uniform vec3 uStuck;
uniform vec3 uReview;
uniform vec3 uProof;
uniform vec3 uPeriods;
uniform float uOn;
varying vec2 vUv;
varying float vMode;
varying float vAct;
varying float vGain;
varying float vSeed;

const float ASPECT = ${(SCREEN.w / SCREEN.h).toFixed(3)};

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float line(float d, float w) { return 1.0 - smoothstep(w, w * 1.8, d); }

float blink(float led, float p) {
  float phase = mod(uTime + vSeed * p * 7.31 + led * 1.7, p);
  return step(phase, uOn);
}

void main() {
  vec2 p = vec2(vUv.x * ASPECT, vUv.y);
  int mode = int(vMode + 0.5);
  vec3 col = uInk;
  // The bezel's hairline round the screen, and a rule between the glyph and the rest.
  float edge = min(min(p.x, ASPECT - p.x), min(p.y, 1.0 - p.y));
  col = mix(col, uShipDim, line(edge, 0.012) * 0.9);
  col = mix(col, uShipDim, line(abs(p.x - 1.0), 0.005) * step(0.14, p.y) * step(p.y, 0.86) * 0.7);

  // The glyph cell: the state's shape in its own hue (a dash, quiet, for at work or standing by).
  vec2 g = (p - vec2(0.5)) / 0.34;
  float ad = abs(g.x) + abs(g.y);
  if (mode == 4) col = mix(col, uSignal, line(ad - 0.78, 0.02) + step(ad, 0.78));
  else if (mode == 5) {
    // A hollow triangle, point up.
    vec2 q = vec2(abs(g.x), g.y + 0.25);
    float tri = max(q.x * 0.866 + q.y * 0.5, -q.y) - 0.5;
    col = mix(col, uStuck, line(abs(tri), 0.07));
  } else if (mode == 3) col = mix(col, uReview, line(abs(length(g) - 0.62), 0.09));
  else if (mode == 6) {
    vec2 a = abs(g);
    float sq = max(a.x, a.y) - 0.7;
    // The check: two strokes, short down-right then long up-right.
    vec2 c = g - vec2(-0.08, -0.18);
    float s1 = abs(dot(c, normalize(vec2(1.0, 1.0)))) + step(0.0, c.x) * 9.0 + step(c.x, -0.36) * 9.0;
    float s2 = abs(dot(c, normalize(vec2(1.0, -1.15)))) + step(c.x, 0.0) * 9.0 + step(0.5, c.x) * 9.0;
    col = mix(col, uProof, max(line(abs(sq), 0.07), line(min(s1, s2), 0.07)));
  } else if (mode == 2) col = mix(col, uShip, line(abs(g.y), 0.06) * step(abs(g.x), 0.6) * 0.9);
  else if (mode == 1) col = mix(col, uSteel, line(abs(g.y), 0.05) * step(abs(g.x), 0.5) * 0.45);

  // The readout: from x 1.12 to 2.72, y 0.16 to 0.84.
  float rx = (p.x - 1.12) / 1.6;
  float ry = (p.y - 0.16) / 0.68;
  float inR = step(0.0, rx) * step(rx, 1.0) * step(0.0, ry) * step(ry, 1.0);
  float gain = vGain;
  if (mode == 2) {
    // Bars that scroll left with the output, as tall as the station is busy, brighter toward their tops.
    float cols = 22.0;
    float rate = 2.0 + 6.0 * vAct;
    float shift = uTime * rate + vSeed * 40.0;
    float c = floor(rx * cols + fract(shift) );
    float h = vAct * (0.2 + 0.8 * hash(c - floor(shift) + vSeed * 13.0));
    float fx = fract(rx * cols + fract(shift));
    float bar = step(0.18, fx) * step(fx, 0.82) * step(ry, h);
    col = mix(col, uShip, bar * inR * (0.45 + 0.55 * ry) * (0.35 + 0.65 * gain));
    col = mix(col, uShipDim, line(abs(ry), 0.01) * inR);
    // A scan line down the readout every 6 s, faint.
    float scan = 1.0 - fract(uTime / 6.0 + vSeed);
    col += uShip * line(abs(ry - scan), 0.012) * inR * 0.12 * gain;
  } else if (mode == 5) {
    // A dead station: still red hatching, dim.
    float hatch = step(0.5, fract((rx * 1.6 + ry * 0.68) * 9.0));
    col = mix(col, uStuck, hatch * inR * 0.16);
  } else if (mode == 3) col = mix(col, uReview, line(abs(ry - 0.5), 0.02) * inR * 0.45);
  else if (mode == 6) col = mix(col, uProof, line(abs(ry - 0.5), 0.02) * inR * 0.6);
  else if (mode == 4) col = mix(col, uSignal, line(abs(ry - 0.5), 0.015) * inR * 0.35);
  else if (mode == 1) col = mix(col, uSteel, line(abs(ry - 0.5), 0.01) * step(0.5, fract(rx * 24.0)) * inR * 0.25);

  // Three blinkers at the end: twinkling at work, one steady for standing by, dark otherwise.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float d = length(p - vec2(ASPECT - 0.2, 0.25 + 0.25 * fi));
    float dot1 = 1.0 - smoothstep(0.045, 0.06, d);
    float lit = 0.0;
    if (mode == 2) lit = mix(0.18, 1.0, blink(fi, uPeriods[i])) * (0.3 + 0.7 * gain);
    else if (mode == 1 && i == 0) lit = 0.35;
    else if (mode == 3 && i == 0) lit = 0.2;
    vec3 led = i == 1 ? uLed : uShip;
    col = mix(col, mix(uInk * 1.6, led, lit), dot1);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export const panels: Fixture<'panels'> = (site) => {
  const n = DESKS.length;
  const geo = new THREE.PlaneGeometry(SCREEN.w, SCREEN.h);
  const attr = (name: string, init: (i: number) => number) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n).map((_, i) => init(i)), 1);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  const mode = attr('aMode', () => PANEL.empty);
  const act = attr('aAct', () => 0);
  const gain = attr('aGain', () => 1);
  attr('aSeed', (i) => (i * 0.618) % 1);
  const c = (hex: string) => new THREE.Color(hex);
  const uniforms = {
    uTime: { value: 0 },
    uInk: { value: c(DECK.instrument) },
    uShip: { value: c(DECK.ship) },
    uShipDim: { value: c(DECK.shipDim) },
    uLed: { value: c('#DDEFF5') },
    uSteel: { value: c(DECK.steel) },
    uSignal: { value: c(DECK.signal) },
    uStuck: { value: c(DECK.stuck) },
    uReview: { value: c(DECK.review) },
    uProof: { value: c(DECK.proof) },
    uPeriods: { value: new THREE.Vector3(...BLINK.periodsS) },
    uOn: { value: BLINK.onS },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms });
  const screens = new THREE.InstancedMesh(geo, mat, n);
  const place = new THREE.Object3D();
  const local = new THREE.Object3D();
  place.add(local);
  local.position.set(0, SCREEN.y, SCREEN.z);
  local.rotation.y = Math.PI;
  const index = new Map<string, number>();
  DESKS.forEach((d, i) => {
    index.set(d.id, i);
    place.position.set(d.x, 0, d.z);
    place.rotation.set(0, d.rotY, 0);
    place.updateMatrixWorld(true);
    screens.setMatrixAt(i, local.matrixWorld);
  });
  screens.castShadow = false;
  screens.receiveShadow = false;
  // Its bounds are the whole ring of consoles, not the one plane it's made of.
  screens.computeBoundingSphere();
  screens.name = 'life-panels';
  site.group.add(screens);

  const set = (deskId: string, m: PanelMode, a: number, g: number) => {
    const i = index.get(deskId);
    if (i === undefined) return;
    if (mode.getX(i) !== m) {
      mode.setX(i, m);
      mode.needsUpdate = true;
    }
    if (Math.abs(act.getX(i) - a) > 0.005) {
      act.setX(i, a);
      act.needsUpdate = true;
    }
    if (Math.abs(gain.getX(i) - g) > 0.005) {
      gain.setX(i, g);
      gain.needsUpdate = true;
    }
  };
  return { handle: { panels: { set, time: (t) => void (uniforms.uTime.value = t) } } };
};
