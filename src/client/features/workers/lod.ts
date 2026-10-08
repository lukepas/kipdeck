// How much a unit's callout says, by how close you are: its level of detail. From far off it's a small
// square tab in its state's hue (its glyph, no words), from the middle distance one line (glyph, call
// sign and what it's doing now), and near, the three-line card (who, its state and for how long, its
// task, its branch, PR and model). Each boundary has a 10% band of hysteresis, so a callout never
// flickers between two tiers at the edge, and a change ripples across the crew: each unit pops in
// after a delay of its own rather than all at once. From the Overview the ripple runs outward from the
// middle of the view, the units that need someone first (rippleDelays); walking, each unit's delay
// comes from its id (staggerDelay). Pure, so the tests run it;
// world/character/callout-view.ts animates it and features/workers/views.ts picks the tier each frame.

import type { AttentionLevel } from '../../../shared/attention';
import { STATE_NAME, splitTag, statusDetail } from '../../../shared/rowtext';

export type CalloutTier = 'far' | 'mid' | 'near';

/** Where the tiers change: past `far` meters it's a tab, under `near` the full card, between them one line. */
export interface TierBounds {
  far: number;
  near: number;
}

/** From the Overview: the orthographic view's half-height (m), the same for every unit in it. */
export const OVERVIEW_BOUNDS: TierBounds = { far: 13, near: 6 };
/** Walking: each unit's distance from the camera (m). */
export const WALK_BOUNDS: TierBounds = { far: 14, near: 5 };
/** How far past a boundary (a fraction of it) the view has to go before the tier changes back. */
export const HYSTERESIS = 0.1;

/** The tier at `v` meters for `bounds`, staying at `prev` until `v` is HYSTERESIS past the boundary it crosses. */
export function tierAt(v: number, bounds: TierBounds, prev?: CalloutTier): CalloutTier {
  const plain: CalloutTier = v > bounds.far ? 'far' : v < bounds.near ? 'near' : 'mid';
  if (!prev || plain === prev) return plain;
  // Leaving `prev`: only once well past the edge it's leaving by.
  const up = 1 + HYSTERESIS;
  const down = 1 - HYSTERESIS;
  if (prev === 'far') return v < bounds.near * down ? 'near' : v < bounds.far * down ? 'mid' : 'far';
  if (prev === 'near') return v > bounds.far * up ? 'far' : v > bounds.near * up ? 'mid' : 'near';
  return v > bounds.far * up ? 'far' : v < bounds.near * down ? 'near' : 'mid';
}

/** What the tier is read from: the Overview's orthographic frustum, or (walking) the unit's distance. */
export interface TierView {
  /** The Overview's camera while it's up; its half-height sets the tier for every unit. */
  ortho?: { top: number; bottom: number } | null;
  /** The camera's distance from the unit (m), for Walk. */
  distance: number;
}

/**
 * What sets a unit's tier besides the view. The selected unit shows its one line (glyph, call sign,
 * what it's doing) at any distance: never a bare tab, and never its whole card either, which up close
 * would cover the unit itself and only repeat the selection card (features/selection). One that needs
 * you or is stuck is never a bare tab either, but from far off it stays a tab with its call sign beside
 * it (callout-view.ts) rather than a whole line, which would pile onto its neighbours' tabs and fold
 * into a "2 units" chip that hides it. While the view moves up into the Overview or back down, every
 * callout is a tab (`moving`), so no card flashes across the screen mid-move.
 */
export interface TierFloor {
  selected?: boolean;
  /** The Overview's zoom tier (core/overview-transition.ts), for modules that show more up close. */
  zoom?: 'deck' | 'pod' | 'unit';
  /** The move up into the Overview, or back down, is under way. */
  moving?: boolean;
}

/** A unit's callout tier this frame, given the one it had (`prev`, for the hysteresis). */
export function tierFor(view: TierView, prev?: CalloutTier, floor: TierFloor = {}): CalloutTier {
  if (floor.selected) return 'mid';
  if (floor.moving) return 'far';
  return view.ortho ? tierAt((view.ortho.top - view.ortho.bottom) / 2, OVERVIEW_BOUNDS, prev) : tierAt(view.distance, WALK_BOUNDS, prev);
}

/**
 * How much of the view's height a callout takes at each tier, at least and at most: a tab about 16
 * pixels high on a 900-pixel view, a line about 22, and a card big enough that its smallest line is read.
 */
export const CALLOUT_SCREEN: Record<CalloutTier, { min: number; max: number }> = {
  far: { min: 0.018, max: 0.03 },
  mid: { min: 0.024, max: 0.075 },
  near: { min: 0.085, max: 0.11 },
};

/** The longest a unit waits before its callout changes with a zoom (ms), and how long the change takes. */
export const STAGGER_MAX = 240;
export const POP_MS = 220;
/** The ripple from the Overview: this many ms between one unit and the next out from the middle, at most RIPPLE_MAX. */
export const RIPPLE_STEP = 45;
export const RIPPLE_MAX = 360;
/** How far (px, as drawn) a callout rises as it pops in. */
export const POP_RISE = 6;
/** How long the old content fades out before a change of tier swaps it (ms). */
export const FADE_OUT_MS = 90;
/** How small a callout starts as it pops in, against its full size. */
export const POP_FROM = 0.88;

/** A unit's own delay (0-STAGGER_MAX ms) before its callout changes tier: the same every time for the same id. */
export function staggerDelay(id: string): number {
  // FNV-1a: a small, even spread of ids.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % (STAGGER_MAX + 1);
}

/** A unit on screen for the ripple: where it stands (px) and whether it needs someone. */
export interface RippleUnit {
  x: number;
  y: number;
  urgent: boolean;
}

/**
 * Each unit's delay (ms) before its callout pops in from the Overview: the ones that need someone at
 * once, then the rest one at a time out from the view's middle (`cx`, `cy`), RIPPLE_STEP apart and
 * never later than RIPPLE_MAX, so the cards arrive as a ripple rather than all in the same frame.
 */
export function rippleDelays(units: readonly RippleUnit[], cx: number, cy: number): number[] {
  const order = units.map((_, i) => i).filter((i) => !units[i].urgent);
  const far = (i: number) => Math.hypot(units[i].x - cx, units[i].y - cy);
  order.sort((a, b) => far(a) - far(b));
  const out = units.map(() => 0);
  order.forEach((i, n) => (out[i] = Math.min(RIPPLE_MAX, (n + 1) * RIPPLE_STEP)));
  return out;
}

export const easeOutCubic = (k: number) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;

/**
 * A callout `ms` into its pop: its scale (POP_FROM to 1), opacity (0 to 1) and how far it still has to
 * rise (POP_RISE px to none), eased out.
 */
export function popAt(ms: number): { scale: number; alpha: number; rise: number } {
  const e = easeOutCubic(ms / POP_MS);
  return { scale: POP_FROM + (1 - POP_FROM) * e, alpha: e, rise: (1 - e) * POP_RISE };
}

/** Cuts `s` to at most `n` characters at a word's end, with three dots when it's cut. */
export function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 3);
  const space = cut.lastIndexOf(' ');
  return `${(space > n / 2 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

/**
 * `s` on at most two lines of at most `n` characters, broken at a word: the second cut with three dots
 * when it still runs over. One line when it fits on one.
 */
export function wrapTwo(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const head = t.slice(0, n + 1);
  const space = head.lastIndexOf(' ');
  const cut = space > n / 2 ? space : n;
  return `${t.slice(0, cut).trimEnd()}\n${clip(t.slice(cut).trim(), n)}`;
}

/** Whether `a` and `b` say the same thing (one starts with the other, case and spacing aside). */
export function sameWords(a: string, b: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/\.{3}$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x.startsWith(y) || y.startsWith(x));
}

/** The most characters the middle tier's activity takes. */
export const MID_MAX = 22;

/**
 * A tool call as a short verb ("Bash: npm test", "Edit worker.ts"): a file's path comes down to its
 * name after the tool's, anything else stays as the tool reported it. Cut to MID_MAX.
 */
export function activityLine(activity: string): string {
  const one = activity.split('\n')[0].trim();
  const m = /^([A-Za-z][\w.-]{0,30}):\s+(.+)$/.exec(one);
  if (m && /^[^\s]*[/\\][^\s]*$/.test(m[2])) {
    const file = m[2].split(/[/\\]/).filter(Boolean).pop() ?? m[2];
    return clip(`${m[1]} ${file}`, MID_MAX);
  }
  return clip(one, MID_MAX);
}

/** `o` with a leading "[ask]" or "[perm]" taken off its activity and label: a callout never shows the brackets. */
function untagged<T extends { activity?: string; label?: string }>(o: T): T {
  return { ...o, activity: o.activity === undefined ? undefined : splitTag(o.activity).text, label: o.label === undefined ? undefined : splitTag(o.label).text };
}

/** "Wants permission: Bash: npm publish": the hook's words for a tool call waiting on your yes. */
const PERMISSION = /^Wants permission:\s*/i;

/** What a permission wait asks, without the hook's words ("Bash: npm publish"), or null when it isn't one. */
export function permissionAsk(o: { activity?: string; label?: string }): string | null {
  for (const s of [o.activity, o.label]) {
    const one = s?.split('\n')[0].trim() ?? '';
    if (PERMISSION.test(one)) return one.replace(PERMISSION, '').trim() || null;
  }
  return null;
}

/**
 * The middle tier's words after the call sign: what it's doing now while it works or waits on you (its
 * latest tool call or prompt), else the ranking's label, or its level's name (shared/rowtext.ts). A permission wait
 * says what you'd allow, as a question ("Allow npm publish?"), not the hook's own words.
 */
export function midLine(raw: { activity?: string; level: AttentionLevel; label?: string; title?: string }): string {
  const o = untagged(raw);
  if (o.level === 'needs-you') {
    const ask = permissionAsk(o);
    // The tool's name goes too: the command says it ("npm publish", not "Bash: npm publish").
    if (ask) return `Allow ${clip(ask.replace(/^[A-Za-z][\w.-]{0,30}:\s*/, '') || ask, MID_MAX - 7)}?`;
  }
  if (o.activity?.trim() && (o.level === 'working' || o.level === 'needs-you')) return activityLine(o.activity);
  // The glyph's hue beside it says the state: the line says what about it ("Done: PR ready"), or its name.
  const att = { level: o.level, label: o.label ?? '' };
  return clip(statusDetail(att, o.title) || STATE_NAME[o.level], MID_MAX);
}

/**
 * The near card's third line for a unit that needs someone: what it asks (a permission's tool call, a
 * question's prompt) or why it's stuck, in place of its branch and engine. Null for any other unit.
 */
export function askLine(raw: { activity?: string; level: AttentionLevel; label?: string }): string | null {
  const o = untagged(raw);
  if (o.level === 'stuck') return o.label?.trim() || null;
  if (o.level !== 'needs-you') return null;
  return permissionAsk(o) ?? (o.activity?.split('\n')[0].trim() || o.label?.trim() || null);
}
