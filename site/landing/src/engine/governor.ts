// The quality governor the page's canvases share. It watches two things, once a frame:
//
// - Frame time, averaged over 30 frames. Over 18 ms steps quality down a level: level 1 halves the
//   units, level 2 also draws the canvas at two thirds of its pixels. It never steps back up during
//   a visit: a device that stuttered once will stutter again.
// - Scroll speed. While the page is flung faster than 2,400 px/s the canvas draws at half its
//   resolution (nobody can see the difference at that speed), and full resolution comes back once
//   the scroll has stayed under 1,200 px/s for 200 ms.
//
// Call read() in the frame's read pass (it reads scrollY with the other layout reads) and tick(dt)
// in its write pass. onChange fires only when the quality actually changes.

export interface Quality {
  /** Share of the units to draw, 0 to 1. */
  units: number;
  /** Multiplier on the canvas's device pixel ratio. */
  dprScale: number;
}

const SLOW_FRAME = 0.018;
const FLING = 2400;
const CALM = 1200;

export function governor(onChange: (q: Quality) => void) {
  let frames = 0, sum = 0, level = 0;
  let fast = false, calmFor = 0;
  let y = 0, lastY = Number.NaN;
  const quality = (): Quality => ({ units: level >= 1 ? 0.5 : 1, dprScale: (level >= 2 ? 0.67 : 1) * (fast ? 0.5 : 1) });
  return {
    read() {
      y = scrollY;
    },
    tick(dt: number) {
      frames++;
      sum += dt;
      if (frames === 30) {
        if (sum / 30 > SLOW_FRAME && level < 2) {
          level++;
          onChange(quality());
        }
        frames = 0;
        sum = 0;
      }
      if (!Number.isNaN(lastY) && dt > 0) {
        const v = Math.abs(y - lastY) / dt;
        if (!fast && v > FLING) {
          fast = true;
          calmFor = 0;
          onChange(quality());
        } else if (fast) {
          calmFor = v < CALM ? calmFor + dt : 0;
          if (calmFor > 0.2) {
            fast = false;
            onChange(quality());
          }
        }
      }
      lastY = y;
    },
    /** Forget the last scroll position (the loop paused, so the next delta would be a jump). */
    rest() {
      lastY = Number.NaN;
    },
    get quality() {
      return quality();
    },
  };
}
