import * as THREE from 'three';
import { TAKE } from './logic';

// The amphitheatre's lit lines in motion, laid into the materials they're drawn with (the ship-cyan
// lips and nosings, the conn's gold, the stations' footwells): taking the conn lights them a step at a
// time from the pit up to the dais, each flaring and settling; and a band of the conn's gold rolls up
// the tiers to the dais, faint every 8 s and bright when a waypoint is reached. Only where a point is
// on the amphitheatre (south of the table, under 2.2 m): the same materials elsewhere (the hull's lines,
// the arc's hairlines) are left as they are. Uniforms only, set in a program compiled once.

/** x seconds into a take of the conn (99 at rest), y the gold chase's head (m from the table, -100 none), z its strength. */
export const LIPS = { uTc: { value: new THREE.Vector4(99, -100, 0, 0) } };

const DECL = /* glsl */ `
uniform vec4 uTc;
varying vec3 vTcWorld;
`;

const VERT = /* glsl */ `
  {
    vec4 tcW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
    tcW = instanceMatrix * tcW;
    #endif
    vTcWorld = (modelMatrix * tcW).xyz;
  }
`;

const FRAG = /* glsl */ `
  {
    vec3 w = vTcWorld;
    float r = length(w.xz);
    if (w.z > 1.0 && w.y < 2.2 && abs(w.x) < 11.0 && r > 2.0 && r < 12.8) {
      float tcStep = r < 4.6 ? 0.0 : r < 6.4 ? 1.0 : r < 9.2 ? 2.0 : r < 11.2 ? 3.0 : 4.0;
      float since = uTc.x - tcStep * ${(TAKE.tierStep / 1000).toFixed(3)};
      float lit = since < 0.0 ? 0.06 : 1.0 + 2.5 * exp(-since * ${(6000 / TAKE.flare).toFixed(3)});
      float d = r - uTc.y;
      vec3 gold = vec3(0.85, 0.72, 0.36);
      gl_FragColor.rgb = gl_FragColor.rgb * lit + gold * uTc.z * exp(-d * d * 1.6);
    }
  }
`;

/** Puts `inject` before the last closing brace of `src` (the end of its main()). */
function atEnd(src: string, inject: string): string {
  const i = src.lastIndexOf('}');
  return src.slice(0, i) + inject + '\n' + src.slice(i);
}

/** Lays the take of the conn and the gold chase into `mat` (a lit line's MeshBasicMaterial), after what it has already. */
export function lipLights(mat: THREE.Material) {
  if (mat.userData.takeConn) return;
  mat.userData.takeConn = true;
  const before = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    before.call(mat, shader, renderer);
    Object.assign(shader.uniforms, LIPS);
    shader.vertexShader = DECL + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT);
    shader.fragmentShader = DECL + atEnd(shader.fragmentShader, FRAG);
  };
  mat.customProgramCacheKey = () => `${key}|takeconn`;
  mat.needsUpdate = true;
}


const STRIP_FRAG = /* glsl */ `
  #ifdef USE_MAP
  if (uArm < 0.999) {
    // Booting along its length, a bright ship-cyan line at the edge of what's on.
    float on = step(vMapUv.x, uArm * 1.05);
    float d = (vMapUv.x - uArm * 1.05) * 40.0;
    gl_FragColor.rgb = gl_FragColor.rgb * on + vec3(0.35, 0.8, 0.95) * exp(-d * d);
  }
  #endif
`;

/** Lays the armrest strip's boot into its face (`u.uArm`: 0 off, 1 on), for the take of the conn. */
export function stripBoot(mat: THREE.MeshBasicMaterial, u: { uArm: { value: number } }) {
  const before = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    before.call(mat, shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = 'uniform float uArm;\n' + atEnd(shader.fragmentShader, STRIP_FRAG);
  };
  mat.customProgramCacheKey = () => `${key}|armboot`;
  mat.needsUpdate = true;
}
