import * as THREE from 'three';

// The holo's course in motion, laid into the course tube's light (features/bridge/holo.ts) after the
// cinema's holo character: a fill running up it from the table to the ship when a unit's work goes to
// review (the route segment filling), and the whole ribbon turned to the conn's gold for the mission
// complete. Uniforms only.

/** x the fill's head along the course (0 the foot, 1 the top; -1 none), y its strength, z the gold (0-1), w unused. */
export const COURSE = { uCourse: { value: new THREE.Vector4(-1, 0, 0, 0) } };

const DECL = /* glsl */ `
uniform vec4 uCourse;
varying float vCoU;
`;

const FRAG = /* glsl */ `
  {
    // The gold first (the ribbon's own light, warmed), then the fill over it: bright behind its head, a flare at it.
    vec3 gold = vec3(0.95, 0.78, 0.36);
    float lum = dot(gl_FragColor.rgb, vec3(0.3, 0.55, 0.15));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gold * lum * 2.6, uCourse.z);
    if (uCourse.x >= 0.0) {
      float d = (vCoU - uCourse.x) * 24.0;
      float behind = vCoU < uCourse.x ? 0.7 : 0.0;
      gl_FragColor.rgb += vec3(0.5, 0.95, 1.0) * uCourse.y * (behind + 2.2 * exp(-d * d));
    }
  }
`;

function atEnd(src: string, inject: string): string {
  const i = src.lastIndexOf('}');
  return src.slice(0, i) + inject + '\n' + src.slice(i);
}

/** Lays the fill and the gold into the course's materials, once each. */
export function courseFx(scene: THREE.Object3D) {
  for (const name of ['holo-course', 'holo-course-sheath']) {
    const mesh = scene.getObjectByName(name) as THREE.Mesh | undefined;
    const mat = mesh?.material as THREE.Material | undefined;
    if (!mat || mat.userData.courseFx) continue;
    mat.userData.courseFx = true;
    const before = mat.onBeforeCompile;
    const key = mat.customProgramCacheKey();
    mat.onBeforeCompile = (shader, renderer) => {
      before.call(mat, shader, renderer);
      Object.assign(shader.uniforms, COURSE);
      shader.vertexShader = DECL + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCoU = uv.x;');
      shader.fragmentShader = DECL + atEnd(shader.fragmentShader, FRAG);
    };
    mat.customProgramCacheKey = () => `${key}|course`;
    mat.needsUpdate = true;
  }
}
