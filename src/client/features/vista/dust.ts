import * as THREE from 'three';
import { NOISE } from '../space/glsl';
import { SPACE_COLORS } from '../space/logic';
import { DUST_LAYERS, DUST_SPAN } from './logic';

// The dust and gas the ship passes close by: a few sheets of it each side, far to near (logic.ts
// DUST_LAYERS), streaming aft as the ship makes way, the nearer ones faster. Seen from a side port they
// slide across one another, and walking past the port shifts the near ones against the far ones: depth
// the sky's cube alone can't give. All the sheets are one mesh and one draw; a layer a tier doesn't draw
// collapses to nothing in the vertex shader. They share one texture, baked once at start (gas, dark
// dust, the gas's teal or indigo, its fine filaments), each layer reading it at its own scale, so
// nothing is drawn per frame but the sheets. Its glow is added, its dust darkens what is behind it;
// the sheets fade out where they are seen at a slant (out of the forward glass and the canopy), at their
// ends, and up and down, so only the side ports look onto them.

/** The texture: wraps round in u (along the ship), not in v (up the sheet). */
const TEX = { w: 512, h: 256 } as const;

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BAKE_FRAG = /* glsl */ `
uniform vec3 uSeed;
varying vec2 vUv;
${NOISE}
float ridged(vec3 p, int octaves) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    float r = 1.0 - abs(2.0 * vnoise(p) - 1.0);
    s += a * r * r;
    p = p * 2.03 + vec3(17.1, 9.2, 4.7);
    a *= 0.5;
  }
  return s;
}
void main() {
  // Round a cylinder in u, so the texture wraps along the ship with no seam.
  float a = vUv.x * 6.2831853;
  vec3 p = vec3(cos(a) * 1.6, sin(a) * 1.6, vUv.y * 1.6) + uSeed;
  vec3 w = vec3(fbm(p, 4), fbm(p + 5.2, 4), fbm(p + 9.1, 4));
  float n = fbm(p * 1.8 + w * 2.5, 5);
  float gas = smoothstep(0.42, 0.78, n);
  float fil = ridged(p * 3.4 + w * 2.0 + 7.0, 4);
  float dust = smoothstep(0.5, 0.66, fbm(p * 2.6 + w * 1.7 + 13.0, 5));
  float hue = smoothstep(0.38, 0.64, fbm(p * 0.7 + 21.0, 3));
  gl_FragColor = vec4(gas, dust, hue, clamp(fil, 0.0, 1.0));
}`;

const VERT = /* glsl */ `
attribute float aLayer;
attribute vec4 aSpec;
uniform vec4 uTravel;
uniform float uShown;
varying vec2 vUv;
varying vec3 vW;
varying vec2 vSpec;
void main() {
  // A layer this tier doesn't draw: its sheets collapse to a point off the screen.
  if (aLayer >= uShown) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec4 one = vec4(equal(vec4(aLayer), vec4(0.0, 1.0, 2.0, 3.0)));
  vec4 world = modelMatrix * vec4(position, 1.0);
  vW = world.xyz;
  // Along the ship, scrolled aft by how far this layer has come; up the sheet, 0 to 1.
  vUv = vec2((position.z - dot(uTravel, one)) / aSpec.x + aSpec.w, (position.y - ${DUST_SPAN.yLow.toFixed(1)}) / ${(DUST_SPAN.yHigh - DUST_SPAN.yLow).toFixed(1)});
  vSpec = aSpec.yz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uTeal, uIndigo;
uniform float uLevel, uDay;
varying vec2 vUv;
varying vec3 vW;
varying vec2 vSpec;
void main() {
  vec4 t = texture2D(uMap, vUv);
  vec4 f = texture2D(uMap, vUv * vec2(2.3, 1.7) + vec2(0.37, 0.11));
  float gas = t.r * (0.5 + 0.9 * f.a);
  // Faded up and down the sheet, at its fore and aft ends, and where it is seen at a slant.
  vec3 v = normalize(cameraPosition - vW);
  float k = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y));
  k *= 1.0 - smoothstep(${(DUST_SPAN.z * 0.6).toFixed(1)}, ${DUST_SPAN.z.toFixed(1)}, abs(vW.z));
  k *= smoothstep(0.4, 0.75, abs(v.x)) * uLevel;
  vec3 col = mix(uIndigo, uTeal, t.b) * gas * vSpec.x;
  // By Day, paler and less of it.
  col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))), 0.4 * uDay);
  float a = t.g * vSpec.y * (1.0 - 0.5 * uDay);
  gl_FragColor = vec4(col * k, a * k);
  #include <colorspace_fragment>
}`;

export class Dust {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly tex = new THREE.WebGLRenderTarget(TEX.w, TEX.h, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, depthBuffer: false });
  /** How far each layer's texture has scrolled (m). */
  readonly travel = new THREE.Vector4();

  constructor(renderer: THREE.WebGLRenderer) {
    // The texture, once.
    const bake = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false, uniforms: { uSeed: { value: new THREE.Vector3(3.1, 7.7, 1.9) } } });
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bake);
    quad.frustumCulled = false;
    scene.add(quad);
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(this.tex);
    renderer.render(scene, new THREE.Camera());
    renderer.setRenderTarget(was);
    bake.dispose();
    quad.geometry.dispose();

    // Two sheets a layer, one each side: x = side * at, z fore to aft, y low to high.
    const pos: number[] = [];
    const layer: number[] = [];
    const spec: number[] = [];
    const index: number[] = [];
    DUST_LAYERS.forEach((l, i) => {
      for (const side of [-1, 1]) {
        const base = pos.length / 3;
        for (const [z, y] of [
          [-DUST_SPAN.z, DUST_SPAN.yLow],
          [DUST_SPAN.z, DUST_SPAN.yLow],
          [DUST_SPAN.z, DUST_SPAN.yHigh],
          [-DUST_SPAN.z, DUST_SPAN.yHigh],
        ]) {
          pos.push(side * l.at, y, z);
          layer.push(i);
          // Its tile, gain and dust, and where along the texture it starts (a different stretch each side).
          spec.push(l.tile, l.gain, l.dust, i * 0.31 + (side > 0 ? 0.5 : 0));
        }
        index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 1));
    geo.setAttribute('aSpec', new THREE.Float32BufferAttribute(spec, 4));
    geo.setIndex(index);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        uMap: { value: this.tex.texture },
        uTravel: { value: this.travel },
        uShown: { value: DUST_LAYERS.length },
        uTeal: { value: new THREE.Color(SPACE_COLORS.nebulaTeal) },
        uIndigo: { value: new THREE.Color(SPACE_COLORS.nebulaIndigo) },
        uLevel: { value: 1 },
        uDay: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'vista-dust';
    this.mesh.frustumCulled = false;
    // After the giant (it is far beyond them), before the stars and the glass.
    this.mesh.renderOrder = -0.4;
  }

  /** How many layers show (far first), how bright they are (0 hides them, and skips the draw), and how far toward Day. */
  set(shown: number, level: number, day: number) {
    const u = this.mat.uniforms;
    u.uShown.value = shown;
    u.uLevel.value = level;
    u.uDay.value = day;
    this.mesh.visible = shown > 0 && level > 0.001;
  }

  /** The texture's memory (bytes), with its mips. */
  bytes(): number {
    return Math.round(TEX.w * TEX.h * 4 * 1.34);
  }
}
