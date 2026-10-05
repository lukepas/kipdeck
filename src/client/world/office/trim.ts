import * as THREE from 'three';

// The trim atlas: the wear of a working ship on every matte surface of the deck, with no uvs and no
// draws of its own. One 1024 square, baked at start, covers two meters by two of plating: panel seams
// in staggered rows, bolt rows along them, a vent grille now and then, cavity dirt in the seams and
// round the bolts, and edges polished bright where hands and boots rub. Panels are a meter by half a
// meter, every other row stepped half a panel. Its height is drawn on a
// canvas and turned into a normal map with a Sobel pass, and the four channels hold all of it at once:
// RG the normal's slope, B the dirt, A the wear, 5.6 MB with its mips.
//
// The shader (trimShader) projects it from the world's own axes onto whichever plane the face turns
// most toward (a box's six faces, a console's top and its front), so it needs nothing from the mesh,
// and adds the seams' shade, the dirt's darkening, the wear's sheen and the slopes to the light.

/** The atlas's size (px), and the square of plating it covers (m). */
export const TRIM_PX = 1024;
export const TRIM_M = 2;
/** The panels: 1 m by 0.5 m, every other row stepped half a panel. */
const PANEL = { w: 1, h: 0.5 } as const;

/** A small fixed-seed random, so every page bakes the same atlas. */
function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Paints the atlas's height (R), dirt (G) and wear (B) on a canvas, in atlas pixels (TRIM_PX per TRIM_M meters). */
function paint(c: HTMLCanvasElement) {
  const n = TRIM_PX;
  c.width = c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const px = n / TRIM_M;
  const r = rand(0x7e1);
  // Mid height, no dirt, no wear.
  g.fillStyle = 'rgb(160,0,0)';
  g.fillRect(0, 0, n, n);
  const rows = Math.round(TRIM_M / PANEL.h);
  const cols = Math.round(TRIM_M / PANEL.w);
  const pw = PANEL.w * px;
  const ph = PANEL.h * px;
  // Each panel a hair higher or lower than its neighbours, so the light breaks across a wall.
  for (let y = 0; y < rows; y++) {
    const step = (y % 2) * pw * 0.5;
    for (let x = -1; x < cols; x++) {
      const v = 150 + Math.floor(r() * 22);
      g.fillStyle = `rgb(${v},0,0)`;
      g.fillRect(x * pw + step, y * ph, pw, ph);
    }
  }
  g.globalCompositeOperation = 'lighter';
  // Grime: soft blotches, heavier low on each panel where dust settles.
  for (let i = 0; i < 260; i++) {
    const x = r() * n;
    const y = r() * n;
    const rad = 8 + r() * 40;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(0,${Math.floor(10 + r() * 26)},0,1)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    for (const [dx, dy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) g.fillRect(x - rad + dx, y - rad + dy, rad * 2, rad * 2);
  }
  g.globalCompositeOperation = 'source-over';
  const seam = Math.max(3, Math.round(0.012 * px));
  // Seams: a groove down to nothing, dirt in it, the panel's edge either side worn bright.
  const groove = (x: number, y: number, w: number, h: number) => {
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgb(40,140,0)';
    g.fillRect(x, y, w, h);
  };
  const wearAlong = (x: number, y: number, w: number, h: number) => {
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(0,0,70,1)';
    g.fillRect(x, y, w, h);
    g.globalCompositeOperation = 'source-over';
  };
  for (let y = 0; y <= rows; y++) {
    const yy = y * ph - seam / 2;
    wearAlong(0, yy - seam, n, seam);
    wearAlong(0, yy + seam, n, seam);
    groove(0, yy, n, seam);
    // A row of bolts under each seam.
    for (let x = 0; x < n; x += 0.25 * px) {
      const bx = x + 0.125 * px + (y % 2) * 0.06 * px;
      const by = yy + seam + 0.035 * px;
      g.fillStyle = 'rgb(30,120,0)';
      g.beginPath();
      g.arc(bx, by, 0.011 * px, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgb(225,30,90)';
      g.beginPath();
      g.arc(bx, by, 0.0075 * px, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let y = 0; y < rows; y++) {
    const step = (y % 2) * pw * 0.5;
    for (let x = -1; x <= cols; x++) {
      const xx = x * pw + step - seam / 2;
      wearAlong(xx - seam, y * ph, seam, ph);
      wearAlong(xx + seam, y * ph, seam, ph);
      groove(xx, y * ph, seam, ph);
    }
  }
  // A vent grille in a few panels: slots pressed in, dirt in them.
  for (let i = 0; i < 2; i++) {
    const y = Math.floor(r() * rows);
    const x = Math.floor(r() * cols);
    const step = (y % 2) * pw * 0.5;
    const x0 = x * pw + step + pw * 0.2;
    const y0 = y * ph + ph * 0.28;
    for (let k = 0; k < 7; k++) {
      g.fillStyle = 'rgb(70,120,0)';
      g.fillRect(x0, y0 + k * ph * 0.06, pw * 0.3, ph * 0.025);
    }
  }
  // Fine scratches, worn into the wear channel only (they catch the light, they don't cut).
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(0,0,40,1)';
  g.lineWidth = 1;
  for (let i = 0; i < 500; i++) {
    const x = r() * n;
    const y = r() * n;
    const a = (r() - 0.5) * 0.6;
    const len = 6 + r() * 30;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
}

/**
 * The atlas as a texture: the canvas's height turned to slopes (a Sobel pass, wrapping round the
 * edges so the tile repeats), packed with its dirt and wear. `strength` is how steep a seam's walls are.
 */
export function bakeTrim(strength = 2.2): THREE.DataTexture {
  const c = document.createElement('canvas');
  paint(c);
  const n = TRIM_PX;
  const src = c.getContext('2d')!.getImageData(0, 0, n, n).data;
  const out = new Uint8Array(n * n * 4);
  const h = (x: number, y: number) => src[(((y + n) % n) * n + ((x + n) % n)) * 4] / 255;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x - 1, y) - h(x - 1, y + 1);
      const dy = h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x, y - 1) - h(x + 1, y - 1);
      const i = (y * n + x) * 4;
      // The slope down the surface, as a normal's x and y; the canvas's y runs down, the surface's up.
      out[i] = Math.max(0, Math.min(255, 128 - dx * strength * 32));
      out[i + 1] = Math.max(0, Math.min(255, 128 + dy * strength * 32));
      out[i + 2] = src[i + 1];
      out[i + 3] = src[i + 2];
    }
  }
  const t = new THREE.DataTexture(out, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

let atlas: THREE.DataTexture | null = null;
/** The one atlas every material shares, baked the first time it's asked for. */
export function trimAtlas(): THREE.DataTexture {
  atlas ??= bakeTrim();
  return atlas;
}

/** How much of the trim a material takes: seams and slopes (`k`), and how much its wear polishes it (`sheen`). */
export interface TrimLook {
  k: number;
  sheen: number;
}

/** The uniforms one trimmed material shares with the rest: the atlas, and how much it shows (0 hides it, as Low might). */
export const TRIM_UNIFORMS = { uTrim: { value: null as THREE.Texture | null }, uTrimOn: { value: 1 } };

/**
 * Adds the trim to a MeshStandardMaterial's shader (see the top of this file): call it from the
 * material's onBeforeCompile. `look` sets how much this material takes.
 */
export function trimShader(shader: THREE.WebGLProgramParametersWithUniforms, look: TrimLook) {
  TRIM_UNIFORMS.uTrim.value ??= trimAtlas();
  shader.uniforms.uTrim = TRIM_UNIFORMS.uTrim;
  shader.uniforms.uTrimOn = TRIM_UNIFORMS.uTrimOn;
  // How much this material takes, as uniforms of its own: every trimmed material shares one program.
  shader.uniforms.uTrimK = { value: look.k };
  shader.uniforms.uTrimSheen = { value: look.sheen };
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTrimPos;').replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
    {
      vec4 tp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        tp = instanceMatrix * tp;
      #endif
      vTrimPos = (modelMatrix * tp).xyz;
    }`,
  );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      varying vec3 vTrimPos;
      uniform sampler2D uTrim;
      uniform float uTrimOn;
      uniform float uTrimK;
      uniform float uTrimSheen;
      vec4 trimS = vec4(0.5, 0.5, 0.0, 0.0);
      vec3 trimT = vec3(1.0, 0.0, 0.0);
      vec3 trimB = vec3(0.0, 1.0, 0.0);
      vec3 trimN = vec3(0.0, 0.0, 1.0);`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Off (a uniform, the same for every pixel, Low): nothing worked out, nothing fetched.
      if (uTrimOn > 0.0) {
        // The face's own normal in the world, from the surface itself: the plane the atlas is cast on.
        trimN = normalize(cross(dFdx(vTrimPos), dFdy(vTrimPos)));
        vec3 a = abs(trimN);
        vec2 q;
        if (a.y >= a.x && a.y >= a.z) { q = vTrimPos.xz; trimT = vec3(1.0, 0.0, 0.0); trimB = vec3(0.0, 0.0, 1.0); }
        else if (a.x >= a.z) { q = vTrimPos.zy; trimT = vec3(0.0, 0.0, 1.0); trimB = vec3(0.0, 1.0, 0.0); }
        else { q = vTrimPos.xy; trimT = vec3(1.0, 0.0, 0.0); trimB = vec3(0.0, 1.0, 0.0); }
        trimS = texture2D(uTrim, q / ${TRIM_M.toFixed(1)});
        // Dirt darkens, wear lifts a little: the seams read as cut lines, the edges as handled.
        diffuseColor.rgb *= 1.0 - uTrimK * (0.55 * trimS.b - 0.18 * trimS.a);
      }`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + uTrimOn * (0.25 * trimS.b - uTrimSheen * trimS.a), 0.08, 1.0);`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        vec2 slope = (trimS.rg - 0.5) * 2.0 * uTrimK * uTrimOn;
        vec3 wn = transformDirectionByInverseViewMatrix(normal, viewMatrix);
        wn = normalize(wn + trimT * slope.x + trimB * slope.y);
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
      }`,
    );
}
