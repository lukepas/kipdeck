// Kip's pose registry for the inbox (docs/voice.md#kip): each pose is a small inline SVG in a module of
// its own, loaded the first time it is wanted, so none of them counts against the home page's up-front
// budget. A pose is decoration: it is always aria-hidden and never takes focus. A new pose is one line
// in POSES and one file beside this one.

import type { KipPose } from '../../../shared/warmth';

const POSES: Record<KipPose, () => Promise<{ default: string }>> = {
  watching: () => import('./watching'),
  napping: () => import('./napping'),
  lantern: () => import('./lantern'),
  cheer: () => import('./cheer'),
  wave: () => import('./wave'),
  sticker: () => import('./sticker'),
};

/** The poses already loaded, so a redraw puts them in without waiting. */
const loaded = new Map<KipPose, string>();

/** The pose's SVG markup, loaded once. */
export async function kipSvg(pose: KipPose): Promise<string> {
  const have = loaded.get(pose);
  if (have) return have;
  const svg = (await POSES[pose]()).default;
  loaded.set(pose, svg);
  return svg;
}

/** Puts `pose` into `slot` (aria-hidden), at once when it is loaded, else when it arrives and `still()` says it may. */
export function fillKip(slot: HTMLElement, pose: KipPose, still: () => boolean = () => true): Promise<boolean> {
  slot.setAttribute('aria-hidden', 'true');
  slot.dataset.pose = pose;
  const put = (svg: string) => {
    // A redraw or a question may have taken the slot while the pose loaded: then it is dropped.
    if (slot.dataset.pose !== pose || !still()) return false;
    slot.innerHTML = svg;
    slot.querySelector('svg')?.setAttribute('focusable', 'false');
    return true;
  };
  const have = loaded.get(pose);
  if (have) return Promise.resolve(put(have));
  return kipSvg(pose).then(put, () => false);
}

/** Every pose's name, for the tests. */
export const KIP_POSES = Object.keys(POSES) as KipPose[];
