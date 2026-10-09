import * as THREE from 'three';
import type { AttentionLevel } from '../../../shared/attention';
import { STATE_NAME, elapsed, headline } from '../../../shared/rowtext';
import type { WorkerStatus, WorkerTask } from '../../../shared/protocol';
import { isAsleep, type WorkerPr } from '../../../shared/status';
import { CALLOUT_SCREEN, FADE_OUT_MS, FAR_MAX, LEAD_MAX, askLine, clip, easeOutCubic, midLine, popAt, sameWords, shortAsk, wrapTwo, type CalloutTier } from '../../features/workers/lod';
import { waitClock } from '../../../shared/wait';
import type { GlyphKind } from '../glyphs';
import { disposeSprite } from '../toon';
import { CALLOUT_PX, calloutSprite, redrawCallout, type CalloutText } from './unit-callout';

/** The chip's word: its level's one name (shared/rowtext.ts STATE_NAME, the rail's and the card's), in capitals. */
const STATE_WORD: Record<GlyphKind, string> = { ...STATE_NAME, merged: 'Merged' };
const scratch = new THREE.Vector3();
/** The near card's task and its third line, at most this many characters. */
const TASK_MAX = 30;
const META_MAX = 44;

/** What a unit has to say, for its callout at any tier. */
export interface UnitSays {
  tier: CalloutTier;
  sign: string;
  name: string;
  kind: GlyphKind;
  level: AttentionLevel;
  since: number;
  reason?: string;
  status: WorkerStatus;
  lost: boolean;
  task?: string;
  /** The task's one-line summary: the near card's task line says it, where the name is only a few words. */
  summary?: string;
  activity?: string;
  pr?: WorkerPr;
  branch?: string;
  model?: string;
  epithet: string;
  /** A word over its head in place of its task (features/moments), shown as the card. */
  said: string | null;
  /** Standing down: its name and this in place of the callout. */
  leaving: string | null;
  /** The selected unit (features/selection): outlined in white, drawn over its neighbours. */
  selected?: boolean;
  /** First in line (the most urgent unit waiting on you, where N goes first): its short ask keeps the whole choice. */
  first?: boolean;
}

/**
 * What a unit has to say, from its own fields (world/character/worker.ts): its task as one title, the
 * whole of it where the short name was cut from the front of its summary, so a card never shows a
 * name cut short as though it were the whole task ("Pick the session"), and its one-line summary
 * where that says more than the name.
 */
export function calloutInput(o: Omit<UnitSays, 'task' | 'summary'> & { task?: WorkerTask }): UnitSays {
  const h = o.task ? headline(o.task) : undefined;
  return { ...o, task: h?.title || undefined, summary: h?.detail || undefined };
}

/** The near card's third line for a unit that needs an answer and says nothing more about what it asks. */
export const NEEDS_ANSWER = 'Needs an answer';

/** What the callout says, from what the unit has to say and the time now. */
export function calloutText(u: UnitSays, now: number): CalloutText {
  if (u.leaving !== null) return { tier: 'mid', sign: '', name: `${u.name}  ${u.leaving}`, kind: null };
  const urgent = u.kind === 'needs-you' || u.kind === 'stuck';
  const tier = u.said ? 'near' : u.tier;
  const sel = u.selected ? { selected: true } : {};
  // How long it has waited on someone, toned (shared/wait.ts): only for one that needs you, is stuck
  // or waits for review, and never for a merged one taking its bow.
  const clock = u.kind !== 'merged' ? waitClock(u.level, now - u.since) : { text: '' };
  const wait = clock.tone ? { wait: clock.text, waitTone: clock.tone } : {};
  // What one that needs you or is stuck asks, short, for the tab and for where callouts crowd: "npm publish?".
  const shortly = urgent && !u.lost ? shortAsk({ activity: u.activity, level: u.level, label: u.reason }, u.first ? LEAD_MAX : FAR_MAX) : u.lost ? 'worktree deleted' : null;
  const asks = shortly ? { ask: shortly } : {};
  // From far off a tab, but one that needs someone (to review too) or is selected keeps its call sign
  // beside it, and one that needs you or is stuck what it asks and for how long ("A-03 npm publish? 12m").
  if (tier === 'far') {
    const keeps = urgent || u.kind === 'review' || u.selected;
    return { tier, sign: keeps ? u.sign : '', name: u.name, kind: u.kind, ...(keeps ? { ...asks, ...wait } : {}), ...sel };
  }
  const line = midLine({ activity: u.activity, level: u.level, label: u.reason, title: u.task });
  if (tier === 'mid') return { tier, sign: u.sign, name: u.name, kind: u.kind, line, ...asks, ...wait, ...sel };
  const parked = u.kind === 'parked';
  const chip = (u.lost ? STATE_NAME.stuck : parked && isAsleep(u.status) ? 'Offline' : STATE_WORD[u.kind]).toUpperCase();
  // The task in full, on two lines at most, said once.
  const task = wrapTwo(u.said ?? (u.summary || u.task || line), TASK_MAX);
  // One that needs someone spends its third line on what it asks or why it's stuck, unless that's the
  // task over again (a question whose prompt is the task); the engine is for the rest.
  const asked = u.lost ? 'worktree deleted' : urgent ? (askLine({ activity: u.activity, level: u.level, label: u.reason }) ?? undefined) : undefined;
  const said = u.said ?? u.task;
  const ask = asked && !(said && sameWords(asked, said)) && !(u.summary && sameWords(asked, u.summary)) ? asked : undefined;
  const pr = u.pr ? `PR #${u.pr.number}${u.pr.state === 'open' ? '' : ` ${u.pr.state}`}` : '';
  // One that needs you never spends its third line on the engine: with nothing more to say about what
  // it asks (a question whose prompt is the task), it says it wants an answer, in its hue.
  const bare = !ask && u.kind === 'needs-you' && !u.lost;
  const meta = ask ?? (bare ? NEEDS_ANSWER : [u.branch, pr, u.model].filter(Boolean).join(' / '));
  // A stuck unit's reason takes its red, and so does a bare "Needs an answer"; what one asks reads muted under the task.
  const stuckWhy = (ask && (u.lost || u.kind === 'stuck')) || bare;
  return {
    tier,
    sign: u.sign,
    name: u.name,
    kind: u.kind,
    chip,
    ...(parked || u.kind === 'merged' ? {} : { clock: elapsed(now - u.since) }),
    ...asks,
    ...wait,
    task,
    ...(meta ? { meta: clip(meta, META_MAX), metaHue: !!stuckWhy } : {}),
    ...(u.epithet && !u.said ? { epithet: u.epithet } : {}),
    ...sel,
  };
}

/**
 * A unit's callout as drawn: the full one and the call sign alone (for where callouts crowd), at the
 * tier it shows now. A change of tier waits the unit's own delay (features/workers/lod.ts; none for
 * one that needs someone, so it is never the last to arrive), fades the old content out over 90 ms,
 * then swaps it and pops in, from 88% and clear to full size and strength in 180 ms; a unit that has
 * just come on the deck pops in the same way. A cut under reduced motion.
 */
export class CalloutView {
  full: THREE.Sprite | null = null;
  compact: THREE.Sprite | null = null;
  /** The tier it shows, the one it's headed to, and when it gets there (performance.now ms). */
  tier: CalloutTier = 'mid';
  private want: CalloutTier = 'mid';
  private switchAt = 0;
  private popFrom = -Infinity;
  /** When the old content started fading out ahead of a swap, or null. */
  private outFrom: number | null = null;
  private born = false;
  private key = '';
  private shape = '';
  /** Its delay before a change (ms), from its id. */
  delay = 0;
  /** This frame's pop: how big against its size, how strong, and how far (px as drawn) it still has to rise. */
  pop = { scale: 1, alpha: 1, rise: 0 };
  /** Held out of sight (the Overview on the move): it pops in, after its delay, once let go. */
  private held = false;

  constructor(private readonly parent: THREE.Object3D) {}

  /** Heads for `tier`; it shows once its delay is up (at once when `calm`, or with no wait when `urgent`). */
  request(tier: CalloutTier, now: number, calm: boolean, urgent = false) {
    if (tier === this.want) return;
    this.want = tier;
    this.switchAt = now + (calm || urgent ? 0 : this.delay);
  }

  /**
   * Steps the pop and the switch; true when the tier changed and it wants drawing again. While `hold`
   * (the Overview on the move) it shows nothing and keeps its tier; let go, it takes the tier it's
   * headed for at once and pops in after its delay, so the cards arrive once the view has landed.
   */
  tick(now: number, calm: boolean, hold = false): boolean {
    if (!this.born) {
      this.born = true;
      this.popFrom = calm ? -Infinity : now + this.delay;
    }
    if (hold && !calm) {
      this.held = true;
      this.outFrom = null;
      this.pop = { ...popAt(-1), alpha: 0 };
      this.rise();
      return false;
    }
    let changed = false;
    if (this.held) {
      this.held = false;
      changed = this.tier !== this.want;
      this.tier = this.want;
      this.popFrom = now + this.delay;
    }
    if (this.want === this.tier) this.outFrom = null;
    else if (now >= this.switchAt) {
      // The old content fades out first, so the callout never blinks out in one frame.
      if (!calm && this.outFrom === null) this.outFrom = now;
      if (calm || now - (this.outFrom ?? now) >= FADE_OUT_MS) {
        this.tier = this.want;
        this.popFrom = calm ? -Infinity : now;
        this.outFrom = null;
        changed = true;
      }
    }
    if (calm) this.pop = { scale: 1, alpha: 1, rise: 0 };
    else if (this.outFrom !== null) {
      const fading = 1 - easeOutCubic((now - this.outFrom) / FADE_OUT_MS);
      // Fading from wherever its own pop-in had got to.
      const was = popAt(now - this.popFrom);
      this.pop = { ...was, alpha: Math.min(was.alpha, fading) };
    } else this.pop = popAt(now - this.popFrom);
    this.rise();
    return changed;
  }

  /** Sets both sprites this frame's rise below their place: their anchor that far up into them. */
  private rise() {
    for (const c of [this.full, this.compact]) {
      if (c) c.center.y = this.pop.rise / Math.max(1, (c.userData.base as THREE.Vector3).y / CALLOUT_PX);
    }
  }

  /**
   * Where the callout's bottom and top edges are in the world, standing `y` up `mover` (lift left out),
   * the top along the camera's `up` (a billboard): the full one's, or with `compact` the call sign's.
   * Measured at its full size, not part way through a pop. False when it has none.
   */
  edges(mover: THREE.Object3D, y: number, bottom: THREE.Vector3, top: THREE.Vector3, up: THREE.Vector3, compact: boolean): boolean {
    const c = compact ? this.compact : this.full;
    if (!c) return false;
    mover.localToWorld(bottom.set(0, y, 0));
    top.copy(bottom).addScaledVector(up, (c.scale.y / this.pop.scale) * mover.getWorldScale(scratch).y);
    return true;
  }

  /** A callout's width over its height, as drawn: the full one's, or the call sign's. */
  aspect(compact: boolean): number {
    const c = compact ? this.compact : this.full;
    return c ? c.scale.x / c.scale.y : 1;
  }

  /**
   * Sizes both sprites for a view that spans `span` meters at the unit (its full height): never smaller
   * than its tier's `min` of the view, never taller than its `max` (lod.ts CALLOUT_SCREEN), times
   * `weight` (demo mode), `boost` (an urgent unit from the Overview) and this frame's pop.
   */
  size(span: number, weight: number, boost: number) {
    const full = this.full;
    if (!full) return;
    const { min, max } = CALLOUT_SCREEN[this.tier];
    const fullY = (full.userData.base as THREE.Vector3).y;
    for (const c of [full, this.compact]) {
      if (!c) continue;
      const base = c.userData.base as THREE.Vector3;
      const lo = Math.max(weight, (min * weight * span) / base.y);
      const k = Math.min(lo, (max * weight * span) / Math.max(base.y, fullY)) * boost * this.pop.scale;
      c.scale.set(base.x * k, base.y * k, 1);
    }
  }

  /** Draws `text` when it says something new: in place when only a clock moved, else both sprites anew. */
  draw(text: CalloutText): boolean {
    const key = JSON.stringify(text);
    if (key === this.key) return false;
    this.key = key;
    const { clock: _, wait: __, waitTone: ___, ...rest } = text;
    const shape = JSON.stringify(rest);
    if (shape === this.shape && this.full) {
      redrawCallout(this.full, text);
      if (this.compact) redrawCallout(this.compact, { ...text, compact: true });
      return true;
    }
    this.shape = shape;
    this.dispose();
    this.full = calloutSprite(text);
    this.compact = calloutSprite({ ...text, compact: true });
    this.parent.add(this.full, this.compact);
    return true;
  }

  dispose() {
    for (const c of [this.full, this.compact]) {
      if (!c) continue;
      this.parent.remove(c);
      disposeSprite(c);
    }
    this.full = this.compact = null;
  }
}
