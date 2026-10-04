// The one Three.js orthographic pass. The Canvas 2D scene is uploaded as a
// texture, optionally accumulated over several sub-frame times (motion blur),
// then run through a single fragment shader that does the pixel-sort smear,
// the merge ripple (radial displacement plus colour remap), the 1-frame invert
// and the full-frame flash (paper by default, any palette colour through
// fx.flashColor). Rendering is explicit: render() is only called from
// window.__render, never from requestAnimationFrame.

import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const ACCUM_FRAG = /* glsl */`
uniform sampler2D uTex;
uniform float uWeight;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uTex, vUv).rgb * uWeight, 1.0); }
`;

const POST_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;          // px
uniform float uSort;        // 0..1 streak length
uniform float uThresh;      // pixel-sort threshold (0.9 calm .. 0.4 chaos)
uniform float uSortCols;    // streak column width in px
uniform float uSortPolarity; // 0 = ink streaks on paper, 1 = paper streaks on ink
uniform float uSortCover;   // 0..1 share of streaking columns (1 = all)
uniform float uSeed;
uniform vec2 uRipC;         // ripple centre, px from top-left
uniform float uRipR;        // ripple radius, px (<0 = off)
uniform float uRipW;        // ripple band width, px
uniform float uRipAmp;      // displacement, px
uniform float uRipRemap;    // colour remap strength at the wavefront
uniform float uInvert;      // 0/1
uniform float uFlash;       // 0..1 full-frame flash
uniform vec3 uFlashColor;   // its colour (paper by default)
varying vec2 vUv;

float hash(float n) { return fract(sin(n * 127.1 + uSeed * 311.7) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;   // top-left origin, like canvas
  vec2 uv = vUv;

  // Merge ripple: radial displacement in a gaussian band around the wavefront.
  float ring = 0.0;
  if (uRipR >= 0.0) {
    vec2 d = px - uRipC;
    float dist = length(d);
    float k = (dist - uRipR) / max(uRipW, 1.0);
    ring = exp(-k * k);
    vec2 dir = dist > 0.0 ? d / dist : vec2(0.0);
    vec2 off = dir * ring * uRipAmp * sin(k * 3.14159);
    uv = vec2((px.x - off.x) / uRes.x, 1.0 - (px.y - off.y) / uRes.y);
  }

  vec3 col = texture2D(uTex, uv).rgb;

  // Pixel-sort smear: ink pixels above bleed downward as monochrome streaks.
  // With uSortPolarity = 1 (ink background) the bright pixels streak instead.
  // uSortCover picks the share of columns that streak at all; lengths are
  // skewed short so a few long streaks read against many short ones. Pixels
  // no streak reaches keep their colour, so status pips stay red and amber.
  if (uSort > 0.001) {
    float colId = floor(px.x / uSortCols);
    float onCol = step(hash(colId * 1.731 + 7.0), uSortCover);
    float hl = hash(colId);
    float len = onCol * uSort * uRes.y * (0.06 + 0.94 * hl * hl) * 0.42;
    float l0 = luma(col);
    if (uSortPolarity > 0.5) l0 = 1.0 - l0;
    float l = l0;
    const int N = 40;
    for (int i = 1; i <= N; i++) {
      float fi = float(i) / float(N);
      vec2 suv = uv + vec2(0.0, fi * len / uRes.y);
      if (suv.y > 1.0 || len < 1.0) break;
      float sl = luma(texture2D(uTex, suv).rgb);
      if (uSortPolarity > 0.5) sl = 1.0 - sl;
      if (sl < 1.0 - uThresh) {
        float streak = mix(sl, l0, fi * fi);  // streak fades toward its tail
        l = min(l, streak);
      }
    }
    if (l < l0 - 0.004) {
      if (uSortPolarity > 0.5) l = 1.0 - l;
      col = vec3(l);                           // monochrome: no RGB split
    }
  }

  // Colour remap at the ripple front: invert inside the band.
  col = mix(col, vec3(1.0) - col, clamp(ring * uRipRemap, 0.0, 1.0));

  if (uInvert > 0.5) col = vec3(1.0) - col;
  col = mix(col, uFlashColor, uFlash);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createPost(glCanvas, sourceCanvas, design) {
  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas, antialias: false, alpha: false, preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(design.w, design.h, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.autoClear = false;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);

  const srcTex = new THREE.CanvasTexture(sourceCanvas);
  srcTex.colorSpace = THREE.NoColorSpace;
  srcTex.minFilter = THREE.LinearFilter;
  srcTex.magFilter = THREE.LinearFilter;
  srcTex.generateMipmaps = false;

  const accumRT = new THREE.WebGLRenderTarget(design.w, design.h, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  accumRT.texture.colorSpace = THREE.NoColorSpace;

  const accumMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: ACCUM_FRAG,
    uniforms: { uTex: { value: srcTex }, uWeight: { value: 1 } },
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });
  const accumScene = new THREE.Scene();
  accumScene.add(new THREE.Mesh(quad, accumMat));

  // Raw sRGB components: the pass works on display values end to end (the
  // canvas texture is NoColorSpace and the output is not converted), so the
  // flash colour must not go through THREE.Color's sRGB-to-linear step.
  const rgb = (c) => {
    const n = parseInt(c.slice(1), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  };
  const paper = rgb(design.palette.paper);
  const postMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: POST_FRAG,
    depthTest: false, depthWrite: false,
    uniforms: {
      uTex: { value: srcTex },
      uRes: { value: new THREE.Vector2(design.w, design.h) },
      uSort: { value: 0 }, uThresh: { value: 0.9 }, uSortCols: { value: 4 * design.u }, uSortPolarity: { value: 0 }, uSortCover: { value: 1 }, uSeed: { value: 0 },
      uRipC: { value: new THREE.Vector2() }, uRipR: { value: -1 }, uRipW: { value: 40 }, uRipAmp: { value: 0 },
      uRipRemap: { value: 0 }, uInvert: { value: 0 }, uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Vector3(paper.r, paper.g, paper.b) },
    },
  });
  const postScene = new THREE.Scene();
  postScene.add(new THREE.Mesh(quad, postMat));

  // drawAt(ts) paints the 2D scene for sub-time ts. times: sub-frame times.
  function render(times, drawAt, fx) {
    if (times.length === 1) {
      drawAt(times[0]);
      srcTex.needsUpdate = true;
      postMat.uniforms.uTex.value = srcTex;
    } else {
      renderer.setRenderTarget(accumRT);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, false, false);
      accumMat.uniforms.uWeight.value = 1 / times.length;
      for (const ts of times) {
        drawAt(ts);
        srcTex.needsUpdate = true;
        renderer.render(accumScene, camera);
      }
      postMat.uniforms.uTex.value = accumRT.texture;
    }
    const u = postMat.uniforms;
    u.uSort.value = fx.sort || 0;
    u.uThresh.value = fx.threshold ?? 0.9;
    u.uSortPolarity.value = fx.sortPolarity || 0;
    u.uSortCover.value = fx.sortCover ?? 1;
    u.uSeed.value = fx.seed || 0;
    if (fx.ripple) {
      u.uRipC.value.set(fx.ripple.x, fx.ripple.y);
      u.uRipR.value = fx.ripple.r;
      u.uRipW.value = fx.ripple.width;
      u.uRipAmp.value = fx.ripple.amp;
      u.uRipRemap.value = fx.ripple.remap;
    } else {
      u.uRipR.value = -1;
      u.uRipRemap.value = 0;
    }
    u.uInvert.value = fx.invert ? 1 : 0;
    u.uFlash.value = fx.flash || 0;
    const fc = fx.flashColor ? rgb(fx.flashColor) : paper;
    u.uFlashColor.value.set(fc.r, fc.g, fc.b);
    renderer.setRenderTarget(null);
    renderer.clear(true, false, false);
    renderer.render(postScene, camera);
  }

  return { render, renderer };
}
