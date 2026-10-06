/**
 * The arc's chrome kept current: each board's bezel and brackets follow its face as the wings fold
 * (features/boards/fold.ts) and take the colour of its most urgent state (the Attention board's from its
 * cards: orange while anyone needs you, red for stuck, amber for review; Pull requests red for failing
 * checks, amber for one waiting on review; Queue orange while one of its units needs you), and a run of
 * light chases round the Attention board while someone needs the captain or is stuck; the wings take
 * their hue at a little over half its strength, so the hero stays the brightest frame. The chase is still with
 * Ship motion off, reduced motion or the Low tier; nothing runs while the tab is hidden (no frames).
 * While a unit that needs you (or is stuck) is out of view, the arc's outer edge on its side pulls the
 * eye toward it: three chevrons in its hue stepping outward, beside the compass's mark at the edge.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { PANEL } from '../boards/world';
import { CHROME, type ChromeId } from './logic';

/** No pull either side (the Overview has its own view of the deck). */
const NO_PULL = { [-1]: null, [1]: null } as Record<-1 | 1, string | null>;

/** How long a bezel takes to crossfade to the hue of a new state (s). */
const CROSSFADE_S = 0.4;

const HUE = { 'needs-you': PANEL.signal, stuck: PANEL.stuck, review: PANEL.review, working: CHROME.idle, done: CHROME.idle } as const;

export function installArcChrome(ctx: Ctx, parts: Pick<Parts, 'boards' | 'tv' | 'quality' | 'waiting' | 'views' | 'stage'>) {
  const chrome = ctx.office.arcChrome;
  const at = new THREE.Vector3();
  /** Which side of the view each waiting unit out of sight is on, the most urgent's hue a side. */
  function pullSides(): Record<-1 | 1, string | null> {
    const out: Record<-1 | 1, string | null> = { [-1]: null, [1]: null } as Record<-1 | 1, string | null>;
    const camera = parts.stage.view ?? ctx.camera;
    for (const id of parts.waiting.pointed()) {
      const v = parts.views.workerViews.get(id);
      const kind = v?.model.showing;
      if (!v || (kind !== 'needs-you' && kind !== 'stuck')) continue;
      v.model.where(at).applyMatrix4(camera.matrixWorldInverse);
      const side = at.x < 0 ? -1 : 1;
      // Needs you outranks stuck for the side's hue (orange if anyone needs you).
      if (out[side] !== PANEL.signal) out[side] = kind === 'needs-you' ? PANEL.signal : PANEL.stuck;
    }
    return out;
  }
  const painted = new Map<ChromeId, string>();
  /** Each board's hue as shown now, crossfading toward the one it should have (CROSSFADE_S). */
  const shown = new Map<ChromeId, { now: THREE.Color; from: THREE.Color; to: THREE.Color; k: number; chase: number; gain: number }>();
  const placed = new Map<ChromeId, string>();
  let t = 0;
  ctx.ticks.add('world', ({ dt }) => {
    const still = ctx.reduceMotion.matches || parts.quality?.tier() === 'low';
    if (!still) t += dt;
    // The edge-light chase round every board once every 6 s: part of the motion layer, so still with it.
    chrome.step(t, still ? 0 : 1);
    // The pull: the arc's outer edge on the side of a waiting unit out of view, chevrons pointing to it.
    const sides = parts.stage.view ? NO_PULL : pullSides();
    chrome.pull(sides, t, !still);
    const rects = parts.boards.rects();
    for (const id of ['issues', 'queue', 'pulls', 'services'] as const) {
      const r = rects[id];
      const key = `${r.y.toFixed(3)}|${r.height.toFixed(3)}`;
      if (placed.get(id) === key) continue;
      placed.set(id, key);
      chrome.place(id, r);
    }
    const urgent = parts.boards.urgency();
    const top = parts.tv.top();
    const want: [ChromeId, keyof typeof HUE | null][] = [
      ['tv', top],
      ['issues', urgent.issues],
      ['queue', urgent.queue],
      ['pulls', urgent.pulls],
      ['services', urgent.services],
      ['capacity', null],
    ];
    for (const [id, level] of want) {
      // A wing on the side a waiting unit is out of view brightens in its hue with the pull.
      const side = id === 'issues' || id === 'queue' ? -1 : id === 'pulls' || id === 'services' ? 1 : 0;
      const pulled = side ? sides[side] : null;
      const hue = pulled ?? (level ? HUE[level] : CHROME.idle);
      // The chase runs round the Attention board alone: the wings take their hue, quieter (the hero leads).
      const hero = id === 'tv';
      const chase = hero && (level === 'needs-you' || level === 'stuck') ? 1 : 0;
      const gain = hero || pulled || !level ? 1 : CHROME.wingGain;
      const key = `${hue}|${chase}|${gain}`;
      let s = shown.get(id);
      if (painted.get(id) !== key) {
        painted.set(id, key);
        // A change of state crossfades the bezel to its new hue (at once with less motion, or the first time).
        if (!s) shown.set(id, (s = { now: new THREE.Color(hue), from: new THREE.Color(hue), to: new THREE.Color(hue), k: 1, chase, gain }));
        s.from.copy(s.now);
        s.to.set(hue);
        s.k = ctx.reduceMotion.matches ? 1 : 0;
        s.chase = chase;
        s.gain = gain;
        if (s.k >= 1) s.now.copy(s.to);
        chrome.paint(id, s.now, chase, gain);
        continue;
      }
      if (!s || s.k >= 1) continue;
      s.k = Math.min(1, s.k + dt / CROSSFADE_S);
      s.now.copy(s.from).lerp(s.to, s.k * s.k * (3 - 2 * s.k));
      chrome.paint(id, s.now, s.chase, s.gain);
    }
  });
}
