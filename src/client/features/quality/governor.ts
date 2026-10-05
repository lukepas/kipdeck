/**
 * Auto's judgement of the frames (Settings > Bridge > Quality at Auto), as plain logic with no
 * Three.js and no clock of its own, so tests/quality-governor.test.ts can feed it made-up frame
 * streams. features/quality/index.ts feeds it every frame's gap and applies what it says.
 *
 * The rules, in order of how often they matter:
 *
 * - Warm-up and hitches don't count. The first WARMUP_MS after load are thrown away, and so is
 *   everything inside a suspend window: a Night/Day switch, a tier change, a floor arriving or being
 *   cloned, a jump, the tab coming back, a burst of terminal output. Each of those compiles shaders or
 *   rebuilds something once, and a slow frame then says nothing about the frames after it.
 * - Down one tier only when the 95th percentile of frame gaps stays over DOWN_OVER_MS through a whole
 *   DOWN_SPAN_MS, and never twice within DOWN_EVERY_MS.
 * - Back up one tier after UP_SPAN_MS with the 95th percentile under UP_UNDER_MS, never above the tier
 *   Auto started from (the top). If a tier it climbed back to fails again within UP_HOLD_MS, it stops
 *   climbing for UP_BACKOFF_MS, so the deck can't flip between two tiers every minute.
 * - A floor: on graphics that start at High (Apple silicon, a discrete GPU) Auto holds at Medium, and
 *   goes under it only if the 95th percentile stays over FLOOR_OVER_MS through FLOOR_SPAN_MS.
 */
import { TIERS, type Tier } from './tiers';

export interface GovernorOptions {
  /** Not judged at first (ms from the first frame), while the office loads and compiles. */
  warmupMs: number;
  /** How long a suspend window lasts when no length is given (ms). */
  suspendMs: number;
  /** A gap this long (ms) is a hidden tab or a stall, not a slow frame: it starts every span over. */
  gapMs: number;
  downOverMs: number;
  downSpanMs: number;
  downEveryMs: number;
  upUnderMs: number;
  upSpanMs: number;
  upHoldMs: number;
  upBackoffMs: number;
  floorOverMs: number;
  floorSpanMs: number;
}

export const GOVERNOR: GovernorOptions = {
  warmupMs: 6_000,
  suspendMs: 4_000,
  gapMs: 1_000,
  downOverMs: 22,
  downSpanMs: 10_000,
  downEveryMs: 60_000,
  upUnderMs: 12,
  upSpanMs: 30_000,
  upHoldMs: 120_000,
  upBackoffMs: 600_000,
  floorOverMs: 30,
  floorSpanMs: 15_000,
};

/** What Auto did last, for Settings and the HUD menu to say. */
export interface Step {
  to: Tier;
  dir: 'down' | 'up';
  /** When (ms on the clock the frames came with). */
  at: number;
  /** Why, in a few words: 'slow frames', 'very slow frames', 'frames to spare'. */
  why: string;
}

/** The 95th percentile of `xs` (sorted in place). */
export function p95(xs: number[]): number {
  if (!xs.length) return 0;
  xs.sort((a, b) => a - b);
  return xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))];
}

const rank = (t: Tier) => TIERS.indexOf(t);

/**
 * One span of frames being judged: the gaps since `start`, cleared when it has been judged or when
 * something (a suspend, a stall, a step) makes the frames in it say nothing.
 */
class Span {
  start: number | null = null;
  gaps: number[] = [];
  reset() {
    this.start = null;
    this.gaps.length = 0;
  }
  add(now: number, dt: number) {
    if (this.start === null) this.start = now - dt;
    this.gaps.push(dt);
  }
  /** The span's 95th percentile once it is `ms` long (and then it starts over), or null before. */
  judged(now: number, ms: number): number | null {
    if (this.start === null || now - this.start < ms) return null;
    const p = p95(this.gaps);
    this.reset();
    return p;
  }
}

export class Governor {
  /** The tier Auto draws at now. */
  tier: Tier;
  /** The best it will climb back to: where it started on these graphics. */
  readonly top: Tier;
  /** The tier it holds at unless frames are very slow (Medium on graphics that start at High). */
  readonly floor: Tier;
  /** What it did last, if anything. */
  last: Step | null = null;

  private warmUntil: number | null = null;
  private quietUntil = -Infinity;
  private downAt = -Infinity;
  private upAt = -Infinity;
  private upTo: Tier | null = null;
  private noUpUntil = -Infinity;
  private readonly down = new Span();
  private readonly up = new Span();

  constructor(
    opts: { top: Tier; start?: Tier; floor?: Tier },
    private readonly o: GovernorOptions = GOVERNOR,
  ) {
    this.top = opts.top;
    this.floor = opts.floor ?? 'low';
    this.tier = opts.start && rank(opts.start) > rank(this.top) ? opts.start : this.top;
  }

  /** Throws away the frames from `now` for `ms` (a toggle, a recompile, a jump): they say nothing about the frames after. */
  suspend(now: number, ms = this.o.suspendMs) {
    this.quietUntil = Math.max(this.quietUntil, now + ms);
    this.down.reset();
    this.up.reset();
  }

  /** Whether frames at `now` are being thrown away (warm-up or a suspend window). */
  quiet(now: number): boolean {
    return now < (this.warmUntil ?? Infinity) || now < this.quietUntil;
  }

  /** Starts judging over from the top (Settings' 'Try High'): no cap, no back-off. */
  reset(now: number) {
    this.tier = this.top;
    this.last = null;
    this.noUpUntil = -Infinity;
    this.downAt = -Infinity;
    this.upTo = null;
    this.suspend(now);
  }

  /** A frame drawn at `now`, `dt` ms after the one before. Returns the step Auto takes, if it takes one now. */
  frame(now: number, dt: number): Step | null {
    this.warmUntil ??= now + this.o.warmupMs;
    if (this.quiet(now)) return null;
    if (dt >= this.o.gapMs) {
      this.down.reset();
      this.up.reset();
      return null;
    }
    this.down.add(now, dt);
    this.up.add(now, dt);
    const atFloor = rank(this.tier) >= rank(this.floor);
    const downSpan = atFloor ? this.o.floorSpanMs : this.o.downSpanMs;
    const downOver = atFloor ? this.o.floorOverMs : this.o.downOverMs;
    const slow = this.down.judged(now, downSpan);
    if (slow !== null && slow > downOver && this.tier !== 'low' && now - this.downAt >= this.o.downEveryMs) {
      // A tier it had just climbed back to fails again: stop climbing for a while.
      if (this.upTo === this.tier && now - this.upAt < this.o.upHoldMs) this.noUpUntil = now + this.o.upBackoffMs;
      return this.step(now, TIERS[rank(this.tier) + 1], 'down', atFloor ? 'very slow frames' : 'slow frames');
    }
    const fast = this.up.judged(now, this.o.upSpanMs);
    if (fast !== null && fast < this.o.upUnderMs && rank(this.tier) > rank(this.top) && now >= this.noUpUntil) {
      return this.step(now, TIERS[rank(this.tier) - 1], 'up', 'frames to spare');
    }
    return null;
  }

  private step(now: number, to: Tier, dir: 'down' | 'up', why: string): Step {
    this.tier = to;
    if (dir === 'down') this.downAt = now;
    else {
      this.upAt = now;
      this.upTo = to;
    }
    this.last = { to, dir, at: now, why };
    // The new tier builds its targets and compiles its shaders: let it settle before it is judged.
    this.suspend(now);
    return this.last;
  }
}

/**
 * Where Auto starts and how far down it holds on the graphics the browser names: the top is
 * autoTier's pick, and graphics that start at High hold at Medium unless frames are very slow.
 */
export function floorFor(top: Tier): Tier {
  return top === 'high' ? 'medium' : 'low';
}
