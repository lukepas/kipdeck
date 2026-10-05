// Telling when the 3D office is too much for this computer: one tier of Quality less (StepDown), and
// at the floor, the 2D view (/lite) instead (SlowFrames).

export interface SlowFramesOptions {
  /** A frame this long or longer on average (ms) is slow: 50 is under 20 frames a second. */
  slowMs: number;
  /** How long frames have to stay that slow (ms of drawing) before it counts. */
  spanMs: number;
  /** Not counted at first (ms from the first frame), while the office loads and its shaders compile. */
  warmupMs: number;
  /** A frame longer than this (ms) is a gap, not a slow frame: a hidden tab, a stall. It starts the span over. */
  gapMs: number;
}

export const SLOW_FRAMES: SlowFramesOptions = { slowMs: 50, spanMs: 10_000, warmupMs: 8_000, gapMs: 1_000 };

/**
 * Watches how long frames take. Once the office has warmed up, frames averaging `slowMs` or more
 * through a whole `spanMs` say the 3D is too slow here, once.
 */
export class SlowFrames {
  private warmUntil: number | null = null;
  private start: number | null = null;
  private total = 0;
  private count = 0;
  private said = false;

  constructor(private opts: SlowFramesOptions = SLOW_FRAMES) {}

  /** A frame drawn at `now`, `dt` ms after the one before. True the first time frames have been slow for a whole span. */
  frame(now: number, dt: number): boolean {
    if (this.said) return false;
    this.warmUntil ??= now + this.opts.warmupMs;
    if (now < this.warmUntil) return false;
    if (dt >= this.opts.gapMs) {
      this.start = null;
      return false;
    }
    if (this.start === null) {
      this.start = now;
      this.total = 0;
      this.count = 0;
    }
    this.total += dt;
    this.count++;
    if (now - this.start < this.opts.spanMs) return false;
    const slow = this.total / this.count >= this.opts.slowMs;
    this.start = null;
    this.said = slow;
    return slow;
  }
}

export interface StepDownOptions {
  /** A frame gap this long or longer (ms) at the 95th percentile says the frames are falling behind: 18 is just over a 60 Hz vsync. */
  overMs: number;
  /** How long the 95th percentile has to stay over `overMs` (ms) before it counts. */
  spanMs: number;
  /** Not counted at first (ms from the first frame), while the office loads and its shaders compile. */
  warmupMs: number;
  /** A gap longer than this (ms) is a hidden tab or a stall, not a slow frame: it starts the span over. */
  gapMs: number;
  /** After a step down, how long (ms) the next tier gets to settle (its targets made, its shaders compiled) before it is judged. */
  settleMs: number;
}

export const STEP_DOWN: StepDownOptions = { overMs: 18, spanMs: 5_000, warmupMs: 8_000, gapMs: 1_000, settleMs: 3_000 };

/**
 * Watches the gaps between frames for Settings > Bridge > Quality at Auto (features/quality): once the
 * office has warmed up, a 95th percentile over `overMs` through a whole `spanMs` says it's time to draw
 * one tier less. Every span is judged on its own frames, so one hitch never counts, and after a step
 * the new tier settles before it's judged. It only ever says down: nothing steps back up by itself, so
 * the deck never flips between two tiers (the hysteresis), and a tier picked by hand is never touched.
 */
export class StepDown {
  private warmUntil: number | null = null;
  private start: number | null = null;
  private gaps: number[] = [];

  constructor(private opts: StepDownOptions = STEP_DOWN) {}

  /** A frame drawn at `now`, `dt` ms after the one before. True when it's time to step down a tier. */
  frame(now: number, dt: number): boolean {
    this.warmUntil ??= now + this.opts.warmupMs;
    if (now < this.warmUntil) return false;
    if (dt >= this.opts.gapMs) {
      this.start = null;
      return false;
    }
    if (this.start === null) {
      this.start = now;
      this.gaps.length = 0;
    }
    this.gaps.push(dt);
    if (now - this.start < this.opts.spanMs) return false;
    const sorted = this.gaps.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    this.start = null;
    if (p95 <= this.opts.overMs) return false;
    this.warmUntil = now + this.opts.settleMs;
    return true;
  }
}
