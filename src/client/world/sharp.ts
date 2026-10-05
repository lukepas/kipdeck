import type * as THREE from 'three';

// The screens' filtering: every painted screen in the scene (the wall boards, the pit wall, the ticker,
// the station screens, the signs) samples at the renderer's most anisotropy, so text seen at a slant
// from the conn stays sharp instead of smearing along the slant. The renderer tells us its most once
// it's made (see core/scene.ts); a screen made before that is brought up to it then.

const screens = new Set<THREE.Texture>();
let most = 8;

/** `texture` filtered at the renderer's most anisotropy, now and once that's known. */
export function sharp<T extends THREE.Texture>(texture: T): T {
  texture.anisotropy = most;
  screens.add(texture);
  return texture;
}

/** The renderer's most anisotropy (renderer.capabilities.getMaxAnisotropy()), for every screen. */
export function sharpenScreens(max: number) {
  most = Math.max(1, max);
  for (const t of screens) {
    if (t.anisotropy === most) continue;
    t.anisotropy = most;
    t.needsUpdate = true;
  }
}
