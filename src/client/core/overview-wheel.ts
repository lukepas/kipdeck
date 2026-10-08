// The Overview's wheel zoom (core/camera-overview.ts hands it the wheel and asks it each frame): a
// critically damped spring toward where the wheel is taking the zoom (overview-transition.ts
// zoomSpring), into the point under the pointer while zooming in, and back toward the framed middle
// while zooming out past the framing (pullHome), never out past 60% of the framed zoom (zoomFloor), so
// the deck stays whole in the free view instead of drifting off into a corner.
import { pullHome, zoomFloor, zoomPan, zoomSpring } from './overview-transition';

/** How much one wheel notch's deltaY changes the zoom (as a power of e). */
export const WHEEL_PER_DELTA = 0.0011;

/** The framed view: where its middle is on the deck, and its zoom. */
export interface Home {
  x: number;
  z: number;
  zoom: number;
}

export class WheelZoom {
  /** Where the wheel is taking the zoom, and how fast the zoom moves now (per second). */
  goal = 1;
  private vel = 0;
  /** The pointer the zoom goes into (px from the window's middle). */
  private at = { x: 0, y: 0 };
  /** The framed view, which zooming out past it heads back to. */
  readonly home: Home = { x: 0, z: 0, zoom: 1 };

  constructor(private readonly least: number, private readonly most: number) {}

  /** The least zoom: 60% of the framed zoom, within the camera's own range. */
  min(): number {
    return zoomFloor(this.home.zoom, this.least);
  }

  /** Holds the zoom at `zoom` (a trip up, a flight), with no speed left over. */
  hold(zoom: number) {
    this.goal = zoom;
    this.vel = 0;
  }

  /** A wheel event: `deltaY` from the pointer at (`x`, `y`) px from the window's middle. */
  wheel(deltaY: number, x: number, y: number) {
    this.goal = Math.min(this.most, Math.max(this.min(), this.goal * Math.exp(-deltaY * WHEEL_PER_DELTA)));
    this.at.x = x;
    this.at.y = y;
  }

  /** Whether the zoom still has somewhere to go. */
  moving(zoom: number): boolean {
    return zoom !== this.goal || this.vel !== 0;
  }

  /**
   * One frame: the next zoom from `zoom`, and how far to move the view's middle (`pan`, along the view's
   * right and down the deck, as zoomPan) or how much of the way to take it home (`home`, 0-1).
   */
  step(zoom: number, dt: number, still: boolean, perPx: number, pitch: number): { zoom: number; pan: [number, number]; home: number } {
    let next = this.goal;
    if (still) this.vel = 0;
    else [next, this.vel] = zoomSpring(zoom, this.vel, this.goal, dt);
    next = Math.min(this.most, Math.max(Math.min(this.min(), zoom), next));
    const home = pullHome(zoom, next, this.home.zoom, this.min());
    return { zoom: next, pan: home ? [0, 0] : zoomPan(this.at.x, this.at.y, zoom, next, perPx, pitch), home };
  }
}
