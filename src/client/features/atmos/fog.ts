import * as THREE from 'three';
import type { LightMode } from '../../lighting';
import { SPACE_COLORS } from '../space/logic';

// Height fog: the scene's fog chunks replaced (before anything compiles with them, behind the loading
// screen, with the deck's other material changes) by two fogs in one. The old distance fog stays as
// it was, measured from the camera between the fog's near and far and fading to the void, so what's
// far outside the glass still sinks into space and the Overview's own near and far (core/
// camera-overview.ts) still fade the slab's edges. Over it, an exponential haze that is thickest at
// the floor and thins with height, integrated along the line from the eye, in the fog's colour, which
// features/atmos tints from the sky ahead. Only ALU, every tier. Anything that must never be hazed
// (a board's face, a unit's band, ring, glyph and callout, the needs-you beacon) is fog: false.

/** The haze: how dense at the floor, how fast it thins with height (m), and the most it ever covers. */
export const HAZE = { density: 0.026, height: 1.4, most: 0.32, outside: 55 } as const;

/** The haze's colour by mode, before the sky's tint: a cool slate lit from above by Night, a pale blue-grey by Day. */
export const HAZE_COLOR: Record<LightMode, string> = { night: '#16212D', day: '#B4C0CC' };

const f = (n: number) => n.toFixed(4);

/** Replaces three's fog chunks with the height fog. Call once, before the first frame. */
export function heightFogChunks() {
  const voidColor = new THREE.Color(SPACE_COLORS.void);
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogY;
#endif`;
  // The fragment's height in the world, from the view-space position three already has: (mv - t) R.
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogY = ( ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix ) ).y;
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  {
    // The haze between the eye and here: density e^(-y/H), its mean along the line, times the length.
    // Under the floor (the hull outside) counts as the floor, and nothing past the room takes any.
    float k = ${f(1 / HAZE.height)};
    float y0 = max( cameraPosition.y, 0.0 );
    float y1 = max( vFogY, 0.0 );
    float dy = y1 - y0;
    float e0 = exp( - k * y0 );
    float mean = abs( dy ) > 0.01 ? ( e0 - exp( - k * y1 ) ) / ( k * dy ) : e0;
    float haze = ( 1.0 - exp( - ${f(HAZE.density)} * vFogDepth * mean ) ) * ${f(HAZE.most)};
    haze *= 1.0 - smoothstep( ${f(HAZE.outside * 0.75)}, ${f(HAZE.outside)}, vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, clamp( haze, 0.0, 1.0 ) );
  }
  gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( ${f(voidColor.r)}, ${f(voidColor.g)}, ${f(voidColor.b)} ), fogFactor );
#endif`;
}
