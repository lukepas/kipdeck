import * as THREE from 'three';

// The screens' character, laid into the shaders of the wall boards' faces and the holo (and only
// those), and the light chase along the ship-cyan trim. All of it is uniforms in programs compiled
// once at load: nothing recompiles when it changes.
//
// - A board's face: interlaced scanlines and a slow roll band down it, a faint phosphor lift, a 1 px
//   chromatic fringe at its edges and a glow round its bezel that grows toward grazing angles. All of
//   it on the board's dark ground only: a pixel as bright as its type (the rows' text, the marks)
//   comes through untouched, so the type is the same from one frame to the next.
// - The holo: fine scanlines across its light, a band rolling up it, and now and then a glitch, a thin
//   slice of it knocked sideways for a moment and flickering.
// - The trim: a soft brightening running slowly round the deck along the cove and the ports' bezels.
//
// When something needs the captain, the roll, the glitch and the chase go still (`steady`); with less
// motion they hold where they are.

/** The uniforms every patched program shares. */
export const FX = {
  uFxTime: { value: 0 },
  /** How much of the moving character plays: 1 full, 0 steady (attention) or none (Low). */
  uFxMove: { value: 1 },
  /** How much of the still character shows (scanlines, fringe, bezel glow): 0 at Low. */
  uFxOn: { value: 1 },
  /** Where the roll band is down a board (0-1). */
  uFxRoll: { value: 0 },
  /** The holo's glitch slice: x on (0/1), y its foot (m, world), z its height (m), w its knock sideways (clip x per w). */
  uFxGlitch: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** Where the holo's band is up it (0-1). */
  uFxHoloRoll: { value: 0 },
  /** The trim chase: x where round the deck (radians), y how bright over the strip's own light. */
  uFxChase: { value: new THREE.Vector2(0, 0) },
};

/** Puts `inject` before the last closing brace of `src` (the end of its main()). */
function atEnd(src: string, inject: string): string {
  const i = src.lastIndexOf('}');
  return src.slice(0, i) + inject + '\n' + src.slice(i);
}

function addUniforms(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, FX);
}

const DECL = /* glsl */ `
uniform float uFxTime;
uniform float uFxMove;
uniform float uFxOn;
uniform float uFxRoll;
uniform vec4 uFxGlitch;
uniform float uFxHoloRoll;
uniform vec2 uFxChase;
`;

// ---- The boards' faces -----------------------------------------------------------------------------

const FACE_VERT = /* glsl */ `
  vFxFres = 1.0 - abs(dot(normalize(normalMatrix * normal), normalize(-mvPosition.xyz)));
`;

const FACE_FRAG = /* glsl */ `
  #ifdef USE_MAP
  if (uFxOn > 0.5) {
    vec3 base = diffuseColor.rgb;
    // The dark ground only (the board's black and its cards): none of it on the type, nor on a glyph's
    // softened edge more than a few percent over the ground.
    float ground = 1.0 - smoothstep(0.034, 0.05, max(max(base.r, base.g), base.b));
    vec2 fuv = vMapUv;
    // Interlaced scanlines: every third row of the screen's pixels a little darker.
    float row = mod(floor(gl_FragCoord.y), 3.0);
    float scan = row < 1.0 ? 0.82 : 1.0;
    // The roll band, a soft bright bar sliding down the board, kept off anything near the type: a
    // coarser mip of the board says where type is close by (a thin stroke averages to nearly the ground).
    float d = fuv.y - (1.0 - uFxRoll);
    vec3 near = texture2D(map, fuv, 4.0).rgb;
    float clear = 1.0 - smoothstep(0.03, 0.042, max(max(near.r, near.g), near.b));
    float roll = exp(-d * d * 160.0) * uFxMove * clear * (1.0 - smoothstep(0.03, 0.042, max(max(base.r, base.g), base.b)));
    vec3 phosphor = vec3(0.006, 0.014, 0.018);
    vec3 lit = base * scan + phosphor * (0.6 + 0.4 * scan) + vec3(0.010, 0.022, 0.026) * roll;
    // The fringe: within the last 1.5% of the face, red and blue sampled a pixel apart.
    vec2 edge = min(fuv, 1.0 - fuv);
    float rim = 1.0 - smoothstep(0.0, 0.015, min(edge.x, edge.y));
    if (rim > 0.0) {
      vec2 px = vec2(dFdx(fuv.x), dFdy(fuv.y));
      vec2 out2 = sign(fuv - 0.5) * abs(px);
      lit.r = mix(lit.r, texture2D(map, fuv + out2).r, rim * 0.8);
      lit.b = mix(lit.b, texture2D(map, fuv - out2).b, rim * 0.8);
    }
    gl_FragColor.rgb = mix(gl_FragColor.rgb, lit, ground);
    // The bezel's glow: a hairline of ship-cyan at the face's edge, stronger seen at a slant.
    float bezel = (1.0 - smoothstep(0.0, 0.006, min(edge.x, edge.y))) * (0.35 + 0.65 * clamp(vFxFres, 0.0, 1.0));
    gl_FragColor.rgb += vec3(0.11, 0.30, 0.37) * bezel * 0.5;
  }
  #endif
`;

/** Lays the screen's character into a wall board's face (a MeshBasicMaterial with its canvas as map). */
export function screenFace(mat: THREE.MeshBasicMaterial) {
  mat.onBeforeCompile = (shader) => {
    addUniforms(shader);
    shader.vertexShader = DECL + 'varying float vFxFres;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + FACE_VERT);
    shader.fragmentShader = DECL + 'varying float vFxFres;\n' + atEnd(shader.fragmentShader, FACE_FRAG);
  };
  mat.customProgramCacheKey = () => 'cinema-face';
  mat.needsUpdate = true;
}

// ---- The holo --------------------------------------------------------------------------------------

const HOLO_VERT = /* glsl */ `
  vFxY = (modelMatrix * vec4(position, 1.0)).y;
  if (uFxGlitch.x > 0.5 && vFxY > uFxGlitch.y && vFxY < uFxGlitch.y + uFxGlitch.z) gl_Position.x += uFxGlitch.w * gl_Position.w;
`;

const HOLO_FRAG = /* glsl */ `
  if (uFxOn > 0.5) {
    // Fine scanlines across the light, 3 cm apart.
    float s = 0.78 + 0.22 * step(0.5, fract(vFxY * 33.0));
    // A band rolling up through it.
    float b = fract(vFxY * 0.9 - uFxHoloRoll) - 0.5;
    float roll = 1.0 + 0.55 * exp(-b * b * 90.0) * uFxMove;
    float k = s * roll;
    // The glitch's slice: brighter and split toward white.
    if (uFxGlitch.x > 0.5 && vFxY > uFxGlitch.y && vFxY < uFxGlitch.y + uFxGlitch.z) k *= 1.7;
    gl_FragColor.rgb *= k;
  }
`;

/** Lays the holo's character into one of its materials (its lines, marks, stars, cone and glow). */
export function holoLight(mat: THREE.Material) {
  const key = `cinema-holo-${mat.type}`;
  mat.onBeforeCompile = (shader) => {
    addUniforms(shader);
    shader.vertexShader = DECL + 'varying float vFxY;\n' + atEnd(shader.vertexShader, HOLO_VERT);
    shader.fragmentShader = DECL + 'varying float vFxY;\n' + atEnd(shader.fragmentShader, HOLO_FRAG);
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}

// ---- The trim --------------------------------------------------------------------------------------

const TRIM_VERT = /* glsl */ `
  vFxAt = (modelMatrix * vec4(position, 1.0)).xz;
`;

const TRIM_FRAG = /* glsl */ `
  {
    // Round the deck from its middle: a soft bright stretch, and a fainter one half a lap behind.
    float a = atan(vFxAt.x, -vFxAt.y);
    float d = abs(mod(a - uFxChase.x + 3.14159265, 6.2831853) - 3.14159265);
    float d2 = abs(mod(a - uFxChase.x, 6.2831853) - 3.14159265);
    gl_FragColor.rgb *= 1.0 + uFxChase.y * (exp(-d * d * 18.0) + 0.35 * exp(-d2 * d2 * 30.0));
  }
`;

/** Lays the light chase into the ship-cyan trim's material (the cove, the ports' bezels). */
export function trimChase(mat: THREE.MeshBasicMaterial) {
  mat.onBeforeCompile = (shader) => {
    addUniforms(shader);
    shader.vertexShader = DECL + 'varying vec2 vFxAt;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + TRIM_VERT);
    shader.fragmentShader = DECL + 'varying vec2 vFxAt;\n' + atEnd(shader.fragmentShader, TRIM_FRAG);
  };
  mat.customProgramCacheKey = () => 'cinema-trim';
  mat.needsUpdate = true;
}
