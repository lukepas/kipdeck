import * as THREE from 'three';
import { CONN, FLOOR, MISSION_TABLE, WALL_HEIGHT } from '../../../shared/layout';

// The deck's floor, worked: every meter's tile a shade of its own, the walkways where boots go (round
// the table, the aisles out to the walls, the way down to the conn and the lift) scuffed and polished
// smoother than the rest, and that polish reflecting the room. The reflection is the room probe's
// (features/ibl), box-projected onto the deck's own walls so a board's glow lands on the floor where
// the board stands, not at infinity. It is the room's emissives only and never the sky, so nothing in
// the floor moves with space outside: no vection underfoot.

/** Where the room probe stands, and the box its reflections are projected onto (the deck's walls and canopy eaves). */
export const ROOM_PROBE = { x: MISSION_TABLE.x, y: 1.6, z: MISSION_TABLE.z } as const;
const BOX = { min: [FLOOR.minX, 0, FLOOR.minZ], max: [FLOOR.maxX, WALL_HEIGHT, FLOOR.maxZ] } as const;

/** Rough off the walkways, smoother on them (the most a walkway polishes it, at its middle). */
export const FLOOR_ROUGH = { base: 0.92, walk: 0.35 } as const;

/** The floor's own uniforms: how glossy its walkways are (Settings > Bridge > Quality: 0 at Low, 1 above). */
export const FLOOR_UNIFORMS = { uGloss: { value: 1 }, uWalkRough: { value: FLOOR_ROUGH.walk as number } };

const v3 = (a: readonly number[]) => `vec3(${a.map((n) => n.toFixed(2)).join(', ')})`;

/** The envmap chunk with its reflection vector projected onto the deck's box (see the top of this file). */
function boxProjected(): string {
  const chunk = THREE.ShaderChunk.envmap_physical_pars_fragment;
  const at = 'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );';
  if (!chunk.includes(at)) return chunk;
  return chunk.replace(
    at,
    `${at}
    {
      vec3 rv = reflectVec;
      vec3 far = mix(${v3(BOX.min)}, ${v3(BOX.max)}, step(vec3(0.0), rv));
      vec3 t = (far - vFloorPos) / (rv + sign(rv + 1e-6) * 1e-5);
      float hit = min(min(t.x, t.y), t.z);
      reflectVec = normalize(vFloorPos + rv * hit - ${v3([ROOM_PROBE.x, ROOM_PROBE.y, ROOM_PROBE.z])});
    }`,
  );
}

/** The walkways' mask as GLSL: 1 in the middle of one, 0 off them, soft at the edges. */
const WALKWAYS = /* glsl */ `
float walkway(vec2 p) {
  float r = length(p - vec2(${MISSION_TABLE.x.toFixed(1)}, ${MISSION_TABLE.z.toFixed(1)}));
  // Between the ready lines (1.4 m off the table) and the consoles: the attention marks keep their own plain floor.
  float ring = smoothstep(${(MISSION_TABLE.r + 1.8).toFixed(2)}, ${(MISSION_TABLE.r + 2.3).toFixed(2)}, r) * (1.0 - smoothstep(${(MISSION_TABLE.r + 2.9).toFixed(2)}, ${(MISSION_TABLE.r + 3.4).toFixed(2)}, r));
  // Out along the axes: the way down to the conn and the lift, up to the wall, and out to the side ports.
  float ns = 1.0 - smoothstep(0.7, 1.4, abs(p.x));
  float ew = 1.0 - smoothstep(0.7, 1.4, abs(p.y));
  float axes = max(ns * step(${(MISSION_TABLE.r).toFixed(1)}, abs(p.y)) * (1.0 - smoothstep(${(CONN.z + 3).toFixed(1)}, ${(CONN.z + 4.5).toFixed(1)}, p.y)), ew * step(${MISSION_TABLE.r.toFixed(1)}, abs(p.x)) * (1.0 - smoothstep(13.5, 15.5, abs(p.x))));
  return max(ring, axes);
}`;

/** Gives the floor's material its tiles, walkways and box-projected room reflection. */
export function workedFloor(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGloss = FLOOR_UNIFORMS.uGloss;
    shader.uniforms.uWalkRough = FLOOR_UNIFORMS.uWalkRough;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloorPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFloorPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFloorPos;
        uniform float uGloss;
        uniform float uWalkRough;
        float floorWalk = 0.0;
        float floorHash(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
        float floorNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(floorHash(i), floorHash(i + vec2(1.0, 0.0)), u.x), mix(floorHash(i + vec2(0.0, 1.0)), floorHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        ${WALKWAYS}`,
      )
      .replace('#include <envmap_physical_pars_fragment>', boxProjected())
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vFloorPos.xz;
          // Each meter's tile a shade lighter or darker than its neighbours.
          float tile = floorHash(floor(p));
          diffuseColor.rgb *= 0.93 + 0.12 * tile;
          // Scuffs along the walkways: streaks along the way people walk, broken up.
          float streak = floorNoise(vec2(p.x * 1.4, p.y * 9.0)) * floorNoise(vec2(p.x * 9.0, p.y * 1.4));
          floorWalk = walkway(p) * (0.65 + 0.35 * floorNoise(p * 0.7));
          diffuseColor.rgb *= 1.0 - 0.07 * floorWalk * streak - 0.04 * floorWalk;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, uWalkRough, floorWalk * uGloss);`,
      );
  };
  m.customProgramCacheKey = () => 'worked-floor';
  return m;
}
