// The activity timeline: what happened on each floor (hired, stuck, PR merged...), kept by the
// server in a capped log per floor, so coming back after lunch doesn't mean walking every floor.

export type TimelineKind =
  | 'hired'
  | 'needs-input'
  | 'done'
  | 'stuck'
  | 'resumed'
  | 'sent-home'
  | 'pr-opened'
  | 'pr-merged'
  | 'pr-closed'
  | 'task-started'
  | 'task-done'
  | 'task-failed'
  | 'meeting-started'
  | 'meeting-ended'
  | 'mission'
  | 'milestone'
  | 'milestone-done'
  /** A milestone's issues closed went from `from` to `to`, of `of`. */
  | 'progress';

/**
 * One thing that happened on a floor. Written by the server from state changes only, never from text
 * a browser sent (mission edits aside, which are cleaned first): `text` is the office's own words.
 */
export interface TimelineEvent {
  /** Made by the server, unique on its floor. */
  id: string;
  at: number;
  kind: TimelineKind;
  floor: string;
  /** The worker it's about, by id, and its name. */
  worker?: string;
  name?: string;
  /** The milestone it's about (its id). */
  goal?: string;
  issue?: number;
  pr?: number;
  /** What happened, in plain words, at most TIMELINE_TEXT characters. */
  text: string;
  /** 'progress': issues closed before, now, and of how many. */
  from?: number;
  to?: number;
  of?: number;
  /** 'sent-home': what it spent and how long it worked. */
  usd?: number;
  workedMs?: number;
}

/** Characters in an event's text. */
export const TIMELINE_TEXT = 200;
/** Events in one answer to 'timeline.get'. */
export const TIMELINE_PAGE = 100;

export type TimelineClientMsg =
  /**
   * Events newest first: on one floor, or on every floor without `floor`; only ones after `since`
   * (the digest) or before `before` (the next page), each ms since epoch.
   */
  { t: 'timeline.get'; floor?: string; since?: number; before?: number };

export type TimelineServerMsg =
  /** The answer to 'timeline.get', with what was asked; `more` when there are older ones. */
  | { t: 'timeline'; events: TimelineEvent[]; more: boolean; floor?: string; since?: number; before?: number }
  /** Something just happened, on any floor (sent to everyone, droppable). */
  | { t: 'timeline.event'; event: TimelineEvent };
