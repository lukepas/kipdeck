import * as THREE from 'three';
import type { AttentionLevel } from '../../../shared/attention';
import { elapsed } from '../../../shared/rowtext';
import type { WorkerStatus } from '../../../shared/protocol';
import { isAsleep, type WorkerPr } from '../../../shared/status';
import { clip, midLine, popAt, type CalloutTier } from '../../features/workers/lod';
import type { GlyphKind } from '../glyphs';
import { disposeSprite } from '../toon';
import { calloutSprite, redrawCallout, type CalloutText } from './unit-callout';

const STATE_WORD: Record<GlyphKind, string> = {
  'needs-you': 'NEEDS YOU',
  stuck: 'STUCK',
  review: 'TO REVIEW',
  working: 'WORKING',
  parked: 'ON DECK',
  merged: 'MERGED',
};
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
  activity?: string;
  pr?: WorkerPr;
  branch?: string;
  model?: string;
  epithet: string;
  /** A word over its head in place of its task (features/moments), shown as the card. */
  said: string | null;
  /** Standing down: its name and this in place of the callout. */
  leaving: string | null;
}

/** What the callout says, from what the unit has to say and the time now. */
export function calloutText(u: UnitSays, now: number): CalloutText {
  if (u.leaving !== null) return { tier: 'mid', sign: '', name: `${u.name}  ${u.leaving}`, kind: null };
  const urgent = u.kind === 'needs-you' || u.kind === 'stuck';
  const tier = u.said ? 'near' : u.tier;
  if (tier === 'far') return { tier, sign: urgent ? u.sign : '', name: u.name, kind: u.kind };
  const line = midLine({ activity: u.activity, level: u.level, label: u.reason, title: u.task });
  if (tier === 'mid') return { tier, sign: u.sign, name: u.name, kind: u.kind, line };
  const parked = u.kind === 'parked';
  const chip = u.lost ? 'STUCK' : parked && isAsleep(u.status) ? 'OFFLINE' : STATE_WORD[u.kind];
  const stuckWhy = u.lost ? 'worktree deleted' : u.kind === 'stuck' ? u.reason : undefined;
  const pr = u.pr ? `PR #${u.pr.number}${u.pr.state === 'open' ? '' : ` ${u.pr.state}`}` : '';
  const meta = stuckWhy ?? [u.branch, pr, u.model].filter(Boolean).join(' / ');
  return {
    tier,
    sign: u.sign,
    name: u.name,
    kind: u.kind,
    chip,
    ...(parked || u.kind === 'merged' ? {} : { clock: elapsed(now - u.since) }),
    task: clip(u.said ?? (u.task || line), TASK_MAX),
    ...(meta ? { meta: clip(meta, META_MAX), metaHue: !!stuckWhy } : {}),
    ...(u.epithet && !u.said ? { epithet: u.epithet } : {}),
  };
}

/**
 * A unit's callout as drawn: the full one and the call sign alone (for where callouts crowd), at the
 * tier it shows now. A change of tier waits the unit's own delay (features/workers/lod.ts), then
 * swaps the content and pops in, from 88% and clear to full size and strength in 180 ms; so does a
 * unit that has just come on the deck. A cut under reduced motion.
 */
export class CalloutView {
  full: THREE.Sprite | null = null;
  compact: THREE.Sprite | null = null;
  /** The tier it shows, the one it's headed to, and when it gets there (performance.now ms). */
  tier: CalloutTier = 'mid';
  private want: CalloutTier = 'mid';
  private switchAt = 0;
  private popFrom = -Infinity;
  private born = false;
  private key = '';
  private shape = '';
  /** Its delay before a change (ms), from its id. */
  delay = 0;
  /** This frame's pop: how big against its size, how strong. */
  pop = { scale: 1, alpha: 1 };

  constructor(private readonly parent: THREE.Object3D) {}

  /** Heads for `tier`; it shows once its delay is up (at once when `calm`). */
  request(tier: CalloutTier, now: number, calm: boolean) {
    if (tier === this.want) return;
    this.want = tier;
    this.switchAt = now + (calm ? 0 : this.delay);
  }

  /** Steps the pop and the switch; true when the tier changed and it wants drawing again. */
  tick(now: number, calm: boolean): boolean {
    if (!this.born) {
      this.born = true;
      this.popFrom = calm ? -Infinity : now + this.delay;
    }
    let changed = false;
    if (this.want !== this.tier && now >= this.switchAt) {
      this.tier = this.want;
      this.popFrom = calm ? -Infinity : now;
      changed = true;
    }
    this.pop = calm ? { scale: 1, alpha: 1 } : popAt(now - this.popFrom);
    return changed;
  }

  /** Draws `text` when it says something new: in place when only the clock moved, else both sprites anew. */
  draw(text: CalloutText): boolean {
    const key = JSON.stringify(text);
    if (key === this.key) return false;
    this.key = key;
    const { clock: _, ...rest } = text;
    const shape = JSON.stringify(rest);
    if (shape === this.shape && this.full) {
      redrawCallout(this.full, text);
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
