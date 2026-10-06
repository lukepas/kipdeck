// When the monitor's live page shows: it is a real web page laid over the canvas (live.ts), so it must
// only be there while the screen it stands on is plainly in view, near enough to read, facing you and
// with nothing of the deck in front of it. Otherwise the screen's own card shows (face.ts). Pure, with
// a gap between showing and hiding so it never flickers at the line (tests/monitor.test.ts).

/** Under `show` metres the page comes up, past `hide` it goes; `facing` is the least cosine between the screen's normal and the way to you. */
export const LIVE = { show: 8.5, hide: 9.5, facing: 0.25, every: 0.12 } as const;

export interface LiveLook {
  /** How far the screen's middle is from the eye (m). */
  dist: number;
  /** The cosine between the screen's normal and the way from it to the eye. */
  facing: number;
  /** Its corners are all on screen (a little past the edge counts). */
  inView: boolean;
  /** Nothing of the deck is between the eye and any of its corners. */
  clear: boolean;
  /** Whether it showed last time. */
  was: boolean;
}

export function liveShown(l: LiveLook): boolean {
  if (!l.inView || !l.clear || l.facing < LIVE.facing) return false;
  return l.was ? l.dist < LIVE.hide : l.dist < LIVE.show;
}
