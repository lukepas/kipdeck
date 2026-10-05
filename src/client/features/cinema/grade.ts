import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BOARD_MASK_GLSL } from '../bridge/holo-mask';
import type { GradeLook } from './logic';

// The grade: one pass over the frame after tone mapping and before its edges are smoothed (features/
// lights/bloom.ts), in display colour. A vignette, fine film grain in the shadows only, a chromatic
// fringe at the frame's edges only, a lens's dirt lit where the glow is, and the mode's colour (Night:
// teal in the darkest tones and the practicals' neutral light a touch warm; Day: clean, a touch cool).
// The sums are logic.ts's gradePixel, fringeAt and grainAt, which the tests check the state marks by:
// nothing as bright as a board's type takes grain, and the middle of the frame takes no fringe, so the
// type there reads the same from one frame to the next.

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tGlow;
uniform sampler2D tDirt;
uniform vec2 uRes;
uniform float uSeed;
uniform float uVignette;
uniform float uVignetteFrom;
uniform float uGrain;
uniform float uAberration;
uniform float uDirt;
uniform vec3 uShadow;
uniform float uShadowEnd;
uniform vec3 uWarm;
uniform float uWarmBy;
uniform float uOn;
varying vec2 vUv;
${BOARD_MASK_GLSL}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  if (uOn < 0.5) { gl_FragColor = src; return; }
  vec2 c = vUv - 0.5;
  float aspect = uRes.x / max(uRes.y, 1.0);
  // 0 in the middle of the frame, 1 at a corner.
  float r = length(c * vec2(aspect, 1.0)) / length(vec2(aspect, 1.0) * 0.5);
  // The fringe: red out, blue in, along the line from the middle; none inside 0.55.
  float px = uAberration * smoothstep(0.55, 1.0, r);
  vec3 col = src.rgb;
  if (px > 0.001) {
    vec2 d = normalize(c + vec2(1e-5)) * px / uRes;
    col.r = texture2D(tDiffuse, vUv - d).r;
    col.b = texture2D(tDiffuse, vUv + d).b;
  }
  // The mode's colour: a tint lifted into the darkest tones, neutral highlights pulled warm or cool.
  float l = luma(col);
  col += uShadow * (1.0 - smoothstep(0.0, uShadowEnd, l));
  float sat = max(max(col.r, col.g), col.b) - min(min(col.r, col.g), col.b);
  float hi = smoothstep(0.45, 0.95, l) * (1.0 - smoothstep(0.04, 0.2, sat)) * uWarmBy;
  col += (col * uWarm - col) * hi;
  // A lens's dirt, lit by the glow (linear, so it's weighed down to a display level first).
  vec3 glow = texture2D(tGlow, vUv).rgb;
  float lit = clamp(luma(glow) * 0.6, 0.0, 1.0);
  col += texture2D(tDirt, vUv).rgb * lit * uDirt;
  // The vignette.
  col *= 1.0 - uVignette * smoothstep(uVignetteFrom, 1.05, r);
  // Grain in the shadows only, nothing at or over 0.3 luma, and none on a wall board's face (the
  // rectangles features/boardfaces works out each frame): a board's type never crawls.
  vec2 p = gl_FragCoord.xy + vec2(uSeed * 61.0, uSeed * 37.0);
  float n = fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))) - 0.5;
  float onBoard = 1.0 - boardMask(vUv * 2.0 - 1.0);
  col += n * uGrain * (1.0 - smoothstep(0.04, 0.3, luma(col))) * (1.0 - step(0.5, onBoard));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), src.a);
}`;

/**
 * A lens's dirt, baked once at start: soft smudges heavier toward the edges, a few specks and two faint
 * wiped streaks, grey, on black (the glow lights it). 512 by 256, about half a megabyte.
 */
function dirtTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  let seed = 0xd1a7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  g.globalCompositeOperation = 'lighter';
  const blob = (x: number, y: number, r: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.6, `rgba(255,255,255,${a * 0.35})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    // Heavier toward the edges of the glass, where a lens gathers it.
    const edge = Math.max(Math.abs(x / W - 0.5), Math.abs(y / H - 0.5)) * 2;
    blob(x, y, 10 + rnd() * 46, (0.05 + 0.12 * rnd()) * (0.35 + 0.65 * edge));
  }
  for (let i = 0; i < 160; i++) blob(rnd() * W, rnd() * H, 1 + rnd() * 2.5, 0.25 + rnd() * 0.4);
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    g.lineWidth = 14 + rnd() * 10;
    g.beginPath();
    const y = H * (0.2 + 0.6 * rnd());
    g.moveTo(-20, y);
    g.bezierCurveTo(W * 0.3, y - 40 + rnd() * 80, W * 0.7, y - 40 + rnd() * 80, W + 20, y + (rnd() - 0.5) * 60);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** The grade's pass and what retunes it. */
export interface Grade {
  readonly pass: ShaderPass;
  /** The mode's look (Day's or Night's), and whether the glow is on to light the dirt. */
  look(g: GradeLook, glowing: boolean): void;
  /** Laid over the frame or passed straight through (Low has no composer; this is for a tier that has one but no grade). */
  on(yes: boolean): void;
  /** Each frame: the grain's new seed (held still with less motion), the frame's size and the glow's texture. */
  frame(seed: number, res: THREE.Vector2, glow: THREE.Texture): void;
  readonly bytes: number;
}

/** `boards`: the wall boards' rectangles on screen (NDC), as features/boardfaces packs them for the holo. */
export function makeGrade(boards: THREE.Vector4[]): Grade {
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tGlow: { value: black },
      tDirt: { value: dirtTexture() },
      uRes: { value: new THREE.Vector2(1, 1) },
      uSeed: { value: 0 },
      uVignette: { value: 0 },
      uVignetteFrom: { value: 0.5 },
      uGrain: { value: 0 },
      uAberration: { value: 0 },
      uDirt: { value: 0 },
      uShadow: { value: new THREE.Vector3() },
      uShadowEnd: { value: 0.2 },
      uWarm: { value: new THREE.Vector3(1, 1, 1) },
      uWarmBy: { value: 0 },
      uOn: { value: 1 },
      uBoards: { value: boards },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  const u = pass.material.uniforms;
  // ShaderPass clones its uniforms: the boards' rectangles go in as the live array the holo shares.
  u.uBoards.value = boards;
  let glowing = false;
  return {
    pass,
    look(g, glow) {
      glowing = glow;
      u.uVignette.value = g.vignette;
      u.uVignetteFrom.value = g.vignetteFrom;
      u.uGrain.value = g.grain;
      u.uAberration.value = g.aberration;
      u.uDirt.value = glow ? g.dirt : 0;
      u.uShadow.value.set(...g.shadow);
      u.uShadowEnd.value = g.shadowEnd;
      u.uWarm.value.set(...g.warm);
      u.uWarmBy.value = g.warmBy;
    },
    on(yes) {
      u.uOn.value = yes ? 1 : 0;
    },
    frame(seed, res, glow) {
      u.uSeed.value = seed;
      (u.uRes.value as THREE.Vector2).copy(res);
      u.tGlow.value = glowing ? glow : black;
    },
    bytes: 512 * 256 * 4,
  };
}
