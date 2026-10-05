import * as THREE from 'three';
import { ARC } from '../../../shared/amphitheater';
import { FLOOR, MISSION_TABLE, WALL_HEIGHT } from '../../../shared/layout';

// The deck's floor, worked: every meter's tile a shade of its own, the walkways where boots go (round
// the table, the aisles out to the walls and north to the situation arc) scuffed and polished
// smoother than the rest, and that polish reflecting the room. The reflection is the room probe's
// (features/ibl), box-projected onto the deck's own walls so a board's glow lands on the floor where
// the board stands, not at infinity. It is the room's emissives only and never the sky, so nothing in
// the floor moves with space outside: no vection underfoot.

/** Where the room probe stands, and the box its reflections are projected onto (the deck's walls and canopy eaves). */
export const ROOM_PROBE = { x: MISSION_TABLE.x, y: 1.6, z: MISSION_TABLE.z } as const;
const BOX = { min: [FLOOR.minX, 0, FLOOR.minZ], max: [FLOOR.maxX, WALL_HEIGHT, FLOOR.maxZ] } as const;

/** Rough off the walkways, smoother on them (the most a walkway polishes it, at its middle). */
export const FLOOR_ROUGH = { base: 0.92, walk: 0.35 } as const;

/** How many boards the floor mirrors (features/atmos/mirror.ts): the situation wall's five. */
export const MIRROR_BOARDS = 5;

/**
 * The floor's own uniforms: how glossy its walkways are (Settings > Bridge > Quality: 0 at Low, 1
 * above), and its mirror of the wall boards (features/atmos, High only): how strong it is (0 skips
 * it, no lookups), and each board's picture, its inverse world matrix and its face's rectangle in its
 * own space (min x, min y, max x, max y; empty skips it).
 */
export const FLOOR_UNIFORMS = {
  uGloss: { value: 1 },
  uWalkRough: { value: FLOOR_ROUGH.walk as number },
  uMirrorOn: { value: 0 },
  uMirrorMaps: { value: Array.from({ length: MIRROR_BOARDS }, () => null as THREE.Texture | null) },
  uMirrorInv: { value: Array.from({ length: MIRROR_BOARDS }, () => new THREE.Matrix4()) },
  uMirrorBox: { value: Array.from({ length: MIRROR_BOARDS }, () => new THREE.Vector4()) },
};

/** One board in the mirror: the eye's ray off the floor, into the board's own space, onto its face, and its picture there. */
const mirrorBoard = (i: number) => /* glsl */ `
  {
    vec4 bx = uMirrorBox[${i}];
    if (bx.z > bx.x) {
      vec3 p = (uMirrorInv[${i}] * vec4(vFloorPos, 1.0)).xyz;
      vec3 d = (uMirrorInv[${i}] * vec4(rv, 0.0)).xyz;
      if (p.z > 0.0 && d.z < -1e-4) {
        float t = -p.z / d.z;
        vec2 uv = (p.xy + d.xy * t - bx.xy) / (bx.zw - bx.xy);
        if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
          float lod = clamp(1.0 + roughnessFactor * 4.0 + log2(1.0 + t) * 0.8, 0.0, 8.0);
          float edge = smoothstep(0.0, 0.04, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
          seen += textureLod(uMirrorMaps[${i}], uv, lod).rgb * edge * (1.0 - smoothstep(4.0, 9.0, t)) * (1.0 - mirrorBlocked(rv, t));
        }
      }
    }
  }`;

/**
 * Whether the ray off the floor at `vFloorPos` along `rv` is stopped by the mission table (a cylinder
 * round it and its holo) before it has gone `t`: where it passes closest to the table's axis, is it
 * inside and low enough. The table is what stands between most of the floor and the wall from the conn.
 */
const MIRROR_PARS = /* glsl */ `
float mirrorBlocked(vec3 rv, float t) {
  vec2 c = vec2(${MISSION_TABLE.x.toFixed(2)}, ${MISSION_TABLE.z.toFixed(2)});
  vec2 d = rv.xz;
  float s = clamp(dot(c - vFloorPos.xz, d) / max(dot(d, d), 1e-5), 0.0, t);
  vec3 at = vFloorPos + rv * s;
  return step(length(at.xz - c), ${(MISSION_TABLE.r + 0.3).toFixed(2)}) * step(at.y, 1.7);
}`;

/**
 * The mirror's GLSL, added to the floor's light where it is on: what the eye sees of each board off
 * the floor (mirrorBoard), only within 9 m of a board and clear of the table, stronger at a grazing
 * look and on the polished walkways, blurred by how rough the floor is here and how far the ray went.
 */
const MIRROR = /* glsl */ `
if (uMirrorOn > 0.0) {
  vec3 eyeDir = normalize(vFloorPos - cameraPosition + vec3(0.0, -1e-4, 0.0));
  vec3 rv = vec3(eyeDir.x, -eyeDir.y, eyeDir.z);
  vec3 seen = vec3(0.0);
  ${Array.from({ length: MIRROR_BOARDS }, (_, i) => mirrorBoard(i)).join('')}
  float graze = 0.3 + 0.7 * (1.0 - clamp(-eyeDir.y, 0.0, 1.0));
  outgoingLight += seen * graze * (1.0 - roughnessFactor * 0.85) * uMirrorOn;
}`;

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
  // Round the pit, inside the ready lines (1.4 m off the table): the attention marks keep their own plain floor.
  float ring = smoothstep(${(MISSION_TABLE.r + 0.2).toFixed(2)}, ${(MISSION_TABLE.r + 0.5).toFixed(2)}, r) * (1.0 - smoothstep(${(MISSION_TABLE.r + 0.9).toFixed(2)}, ${(MISSION_TABLE.r + 1.2).toFixed(2)}, r));
  // Out along the axes: north from the pit to the situation arc, and out to the side ports.
  float ns = 1.0 - smoothstep(0.7, 1.4, abs(p.x));
  float ew = 1.0 - smoothstep(0.7, 1.4, abs(p.y));
  float axes = max(ns * step(${MISSION_TABLE.r.toFixed(1)}, -p.y) * (1.0 - smoothstep(${(-ARC.z - 1.5).toFixed(1)}, ${(-ARC.z).toFixed(1)}, -p.y)), ew * step(${MISSION_TABLE.r.toFixed(1)}, abs(p.x)) * (1.0 - smoothstep(13.5, 15.5, abs(p.x))));
  return max(ring, axes);
}`;

/** Gives the floor's material its tiles, walkways and box-projected room reflection. */
/** The floor's materials, and whether their programs carry the mirror's GLSL (see floorMirror). */
const worked = new Set<THREE.MeshStandardMaterial>();
let mirrorBuilt = false;

/**
 * Whether the floor's program carries the mirror at all. Only the tiers that draw it want its GLSL:
 * a software renderer compiles every line of it, so Low and Medium leave it out, and the floor is
 * compiled again (that one program) only when High is picked after load. Off again it stays built,
 * at no cost with its level at nothing.
 */
export function floorMirror(want: boolean) {
  if (!want || mirrorBuilt) return;
  mirrorBuilt = true;
  for (const m of worked) m.needsUpdate = true;
}

export function workedFloor(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  worked.add(m);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGloss = FLOOR_UNIFORMS.uGloss;
    shader.uniforms.uWalkRough = FLOOR_UNIFORMS.uWalkRough;
    shader.uniforms.uMirrorOn = FLOOR_UNIFORMS.uMirrorOn;
    shader.uniforms.uMirrorMaps = FLOOR_UNIFORMS.uMirrorMaps;
    shader.uniforms.uMirrorInv = FLOOR_UNIFORMS.uMirrorInv;
    shader.uniforms.uMirrorBox = FLOOR_UNIFORMS.uMirrorBox;
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
        uniform float uMirrorOn;
        uniform sampler2D uMirrorMaps[${MIRROR_BOARDS}];
        uniform mat4 uMirrorInv[${MIRROR_BOARDS}];
        uniform vec4 uMirrorBox[${MIRROR_BOARDS}];
        float floorWalk = 0.0;
        float floorHash(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
        float floorNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(floorHash(i), floorHash(i + vec2(1.0, 0.0)), u.x), mix(floorHash(i + vec2(0.0, 1.0)), floorHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        ${WALKWAYS}
        ${MIRROR_PARS}`,
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
      )
      .replace('#include <opaque_fragment>', `${mirrorBuilt ? MIRROR : ''}\n#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => (mirrorBuilt ? 'worked-floor-mirror' : 'worked-floor');
  return m;
}
