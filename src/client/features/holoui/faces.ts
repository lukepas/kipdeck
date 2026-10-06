import * as THREE from 'three';

// The arc's faces in motion, laid into the wall boards' shaders after the cinema's screen character
// (features/cinema/screens.ts), so both share one program a face. All of it is uniforms: nothing
// recompiles, and no canvas is painted again for any of it (a board repaints only when what it says
// changes).
//
// - The build (take the conn): a bottom-up scanline wipe brings each face on, a bright line at its
//   edge; then its header types on left to right behind a block cursor; on the Attention board the
//   counts roll into place like an odometer.
// - The scan: a thin line of ship-cyan sweeps down the whole arc (world height, so it crosses every
//   face at once) at a sixth of the type's strength, a faint trail over it.
// - The header sweep: a bright band across a face's header when what it says has just changed.
// - Card effects on the Attention board: a new card slides in from the right; a call's chevrons sweep
//   across its card; a stuck card has a red sweep once a second and a scanline tear; a card going to
//   review flashes green. With less motion each is a still outline in its hue instead.
// - The fold (the warp): every face folds flat toward its middle and back.

/** The most cards one face animates at once. */
export const CARD_SLOTS = 4;

/** A card effect's kind, as the shader numbers it. */
export const CARD_FX = { none: 0, slide: 1, hail: 2, stuck: 3, done: 4 } as const;
export type CardFxKind = keyof typeof CARD_FX;

/** One face's uniforms: what the shader reads, set by features/holoui each frame something moves. */
export interface FaceUniforms {
  /** x the wipe (0 nothing shown, 1 all), y the header typed, z the odometer, w the fold (0 open, 1 flat). */
  uHuBuild: { value: THREE.Vector4 };
  /** x the header's share of the face's height, y where the counts start (u; 2 for none), z the header sweep (0-1, -1 none), w the arc scan's world height (-100 none). */
  uHuHead: { value: THREE.Vector4 };
  /** The map's repeat (xy) and offset (zw): a wing shows only the top of its canvas. */
  uHuMapT: { value: THREE.Vector4 };
  /** Each animated card's box in the face's uv (u0, v0, u1, v1; v up). */
  uHuCard: { value: THREE.Vector4[] };
  /** Each card's effect: x its kind (CARD_FX), y how far through (0-1), z still (1: an outline instead), w unused. */
  uHuFx: { value: THREE.Vector4[] };
}

/** The clock and the scan's strength, shared by every face. */
export const HU = {
  uHuTime: { value: 0 },
  uHuScanGain: { value: 0.15 },
};

export function faceUniforms(): FaceUniforms {
  return {
    uHuBuild: { value: new THREE.Vector4(1, 1, 1, 0) },
    uHuHead: { value: new THREE.Vector4(0, 2, -1, -100) },
    uHuMapT: { value: new THREE.Vector4(1, 1, 0, 0) },
    uHuCard: { value: Array.from({ length: CARD_SLOTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uHuFx: { value: Array.from({ length: CARD_SLOTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };
}

const DECL = /* glsl */ `
uniform vec4 uHuBuild;
uniform vec4 uHuHead;
uniform vec4 uHuMapT;
uniform vec4 uHuCard[${CARD_SLOTS}];
uniform vec4 uHuFx[${CARD_SLOTS}];
uniform float uHuTime;
uniform float uHuScanGain;
varying vec2 vHuUv;
varying float vHuY;
`;

const VERT = /* glsl */ `
  vHuUv = uv;
  // The warp folds the face flat toward its middle.
  transformed.y *= 1.0 - 0.97 * uHuBuild.w;
  vHuY = (modelMatrix * vec4(transformed, 1.0)).y;
`;

const FRAG = /* glsl */ `
  #ifdef USE_MAP
  {
    vec2 fu = vHuUv;
    vec3 cyan = vec3(0.32, 0.72, 0.86);
    float head0 = 1.0 - uHuHead.x;
    // ---- Card effects (the Attention board) ----
    for (int i = 0; i < ${CARD_SLOTS}; i++) {
      vec4 r = uHuCard[i];
      vec4 f = uHuFx[i];
      if (f.x < 0.5 || fu.x < r.x || fu.x > r.z || fu.y < r.y || fu.y > r.w) continue;
      vec2 cu = (fu - r.xy) / max(r.zw - r.xy, vec2(1e-4));
      vec3 hue = f.x < 2.5 ? vec3(1.0, 0.42, 0.1) : f.x < 3.5 ? vec3(1.0, 0.3, 0.37) : vec3(0.24, 0.86, 0.59);
      if (f.x < 1.5) hue = cyan;
      vec2 edge = min(cu, 1.0 - cu);
      float outline = 1.0 - smoothstep(0.0, 0.025, min(edge.x * 3.0, edge.y));
      if (f.z > 0.5) {
        // Less motion: a still outline in the card's hue, nothing travels.
        gl_FragColor.rgb += hue * outline * 0.9;
        continue;
      }
      float k = clamp(f.y, 0.0, 1.0);
      vec2 src = fu;
      bool resample = false;
      if (f.x < 1.5 || f.x > 1.5 && f.x < 2.5) {
        // Slides in from the right over its first part (a call's slide is the first 40%).
        float s = f.x < 1.5 ? k : clamp(k / 0.4, 0.0, 1.0);
        float e = 1.0 - (1.0 - s) * (1.0 - s) * (1.0 - s);
        src.x = fu.x + (1.0 - e) * (r.z - r.x) * 0.9;
        resample = e < 0.999;
      }
      if (f.x > 2.5 && f.x < 3.5) {
        // Stuck: a scanline tear for the first 120 ms of each second, a few slices knocked sideways.
        float ph = fract(uHuTime);
        float slice = step(0.62, fract(cu.y * 7.0 + floor(uHuTime * 9.0) * 0.37));
        if (ph < 0.12) {
          src.x = fu.x + slice * 0.012 * (fract(floor(uHuTime * 9.0) * 0.61) - 0.5) * 2.0;
          resample = true;
        }
      }
      if (resample) {
        vec4 t = vec4(0.0);
        if (src.x <= r.z) t = texture2D(map, src * uHuMapT.xy + uHuMapT.zw);
        else t = vec4(0.03, 0.04, 0.05, 0.94);
        gl_FragColor = linearToOutputTexel(vec4(t.rgb * diffuse, t.a * opacity));
      }
      if (f.x > 1.5 && f.x < 2.5) {
        // A call: chevrons in its orange sweeping across the card, then its rim lit as it settles.
        // Chevrons pointing the way they sweep (right), riding a band that crosses the card and is gone by the end.
        float x = cu.x - (k * 1.8 - 0.4);
        float s = fract(cu.x * 7.0 + abs(cu.y - 0.5) * 2.4 - uHuTime * 3.0);
        float chev = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.32, 0.42, s));
        gl_FragColor.rgb += hue * chev * exp(-x * x * 18.0) * 0.85 * (1.0 - smoothstep(0.8, 1.0, k));
        gl_FragColor.rgb += hue * outline * (1.0 - k) * 1.2;
      } else if (f.x > 2.5 && f.x < 3.5) {
        // Stuck: a red sweep across its card once a second, and its rim blinking at 1 Hz.
        float x = cu.x - fract(uHuTime) * 1.3 + 0.15;
        gl_FragColor.rgb += hue * exp(-x * x * 60.0) * 0.55;
        gl_FragColor.rgb += hue * outline * step(fract(uHuTime), 0.62) * 0.8;
      } else if (f.x > 3.5) {
        // To review: a green flash out from the card's left, fading.
        gl_FragColor.rgb += hue * (1.0 - k) * (0.18 + 0.5 * exp(-cu.x * 4.0)) + hue * outline * (1.0 - k);
      } else if (f.x < 1.5) {
        gl_FragColor.rgb += hue * outline * (1.0 - k) * 0.8;
      }
    }
    // ---- The odometer: the header's counts roll up into place, each column a beat after the last ----
    if (uHuBuild.z < 0.999 && fu.y > head0 && fu.x > uHuHead.y) {
      float col = (fu.x - uHuHead.y) / max(1.0 - uHuHead.y, 1e-3);
      float k = clamp(uHuBuild.z * 1.6 - col * 0.6, 0.0, 1.0);
      float e = 1.0 - (1.0 - k) * (1.0 - k) * (1.0 - k);
      float v = (fu.y - head0) / max(uHuHead.x, 1e-3);
      float vs = fract(v - 3.0 * (1.0 - e));
      vec4 t = texture2D(map, vec2(fu.x, head0 + vs * uHuHead.x) * uHuMapT.xy + uHuMapT.zw);
      gl_FragColor = linearToOutputTexel(vec4(t.rgb * diffuse * (0.55 + 0.45 * e), t.a * opacity));
    }
    // ---- The header types on behind a block cursor ----
    if (uHuBuild.y < 0.999 && fu.y > head0) {
      float cols = 28.0;
      float typed = floor(uHuBuild.y * (cols + 1.0)) / cols;
      float on = step(fu.x, typed);
      float cursor = step(typed, fu.x) * step(fu.x, typed + 1.0 / cols) * step(head0 + uHuHead.x * 0.2, fu.y) * step(fu.y, 1.0 - uHuHead.x * 0.15);
      gl_FragColor.rgb = mix(vec3(0.003, 0.005, 0.008), gl_FragColor.rgb, on) + cyan * cursor * 0.9;
    }
    // ---- The header sweep: what this face says just changed ----
    if (uHuHead.z >= 0.0 && fu.y > head0) {
      float d = fu.x - (uHuHead.z * 1.3 - 0.15);
      gl_FragColor.rgb += cyan * exp(-d * d * 300.0) * 0.45;
    }
    // ---- The scan down the arc ----
    if (uHuHead.w > -50.0) {
      float ds = vHuY - uHuHead.w;
      float trail = ds > 0.0 ? exp(-ds * 7.0) * 0.22 : 0.0;
      gl_FragColor.rgb += cyan * (exp(-ds * ds * 900.0) + trail) * uHuScanGain;
    }
    // ---- The wipe: on from the bottom up, a bright scanline at its edge ----
    if (uHuBuild.x < 0.999) {
      float edgeY = uHuBuild.x * 1.06 - 0.03;
      float shown = step(fu.y, edgeY);
      float d = (fu.y - edgeY) * 80.0;
      float line = exp(-d * d);
      // Just under the line the face comes up bright and settles, every other row of it lit first.
      float warm = 1.0 - smoothstep(0.0, 0.1, edgeY - fu.y);
      float rows = 0.75 + 0.25 * step(0.5, fract(fu.y * 120.0));
      // Not yet on: the face's dark glass alone, so the arc reads as dark panels waiting (never the sky through them).
      vec3 lit = gl_FragColor.rgb * (1.0 + warm * 0.8) * mix(1.0, rows, warm);
      gl_FragColor.rgb = mix(vec3(0.004, 0.006, 0.009), lit, shown) + cyan * line * 1.2;
      gl_FragColor.a = max(mix(0.94 * opacity, gl_FragColor.a, shown), line * 0.9);
    }
  }
  #endif
`;

/** Puts `inject` before the last closing brace of `src` (the end of its main()). */
function atEnd(src: string, inject: string): string {
  const i = src.lastIndexOf('}');
  return src.slice(0, i) + inject + '\n' + src.slice(i);
}

/**
 * Lays the arc's motion into a board face (a MeshBasicMaterial with its canvas as map), after whatever
 * it already lays in (the cinema's screen character), with `u` as this face's own uniforms.
 */
export function holoFace(mat: THREE.MeshBasicMaterial, u: FaceUniforms) {
  const before = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    before.call(mat, shader, renderer);
    Object.assign(shader.uniforms, HU, u);
    shader.vertexShader = DECL + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT);
    shader.fragmentShader = DECL + atEnd(shader.fragmentShader, FRAG);
  };
  mat.customProgramCacheKey = () => `${key}|holoui`;
  mat.needsUpdate = true;
}
