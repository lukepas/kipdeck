/**
 * Where Auto keeps a step down for a reload, so a slow machine doesn't start High again on every
 * refresh, and how that keeping runs out. Plain logic over a Storage-like pair (localStorage for the
 * cap, sessionStorage for the session it was made in), so tests read and write a fake.
 *
 * A cap is only good for the graphics it was made on, in the browser session it was made in, and for
 * CAP_TTL_MS. A new session (a new tab or window, the browser started again) starts from the top, and
 * so does a cap written in the old format: the first version had no expiry and could lock Auto at Low
 * for good after one slow minute, so it is deleted on sight.
 */
import type { Tier } from './tiers';

/** The cap's key, versioned: a new format gets a new key, and the old ones are deleted. */
export const CAP_KEY = 'agent-office.quality-cap.v2';
/** Keys of older formats, deleted whenever a cap is read. */
export const OLD_CAP_KEYS = ['agent-office.quality-cap'] as const;
export const CAP_VERSION = 2;
/** How long a cap holds (ms) even within one session. */
export const CAP_TTL_MS = 24 * 3600_000;
/** The session marker's key in sessionStorage: a cap from another session is stale. */
export const SESSION_KEY = 'agent-office.quality-session';

export interface Cap {
  renderer: string;
  tier: Tier;
  at: number;
  version: number;
  session: string;
}

/** The part of Storage this needs. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** This browser session's marker, made on first use. */
export function sessionId(session: Store | null): string {
  try {
    let id = session?.getItem(SESSION_KEY) ?? null;
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      session?.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'none';
  }
}

/**
 * The cap for `renderer` that still holds at `now` in session `session`, or null. Deletes old-format
 * keys, and a cap that has run out or belongs to other graphics or another session.
 */
export function readCap(local: Store | null, renderer: string, session: string, now: number): Tier | null {
  if (!local) return null;
  try {
    for (const k of OLD_CAP_KEYS) local.removeItem(k);
    const raw = local.getItem(CAP_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<Cap> | null;
    const good =
      !!c &&
      c.version === CAP_VERSION &&
      c.renderer === renderer &&
      c.session === session &&
      typeof c.at === 'number' &&
      now - c.at >= 0 &&
      now - c.at < CAP_TTL_MS &&
      (c.tier === 'medium' || c.tier === 'low');
    if (!good) {
      local.removeItem(CAP_KEY);
      return null;
    }
    return c.tier as Tier;
  } catch {
    try {
      local.removeItem(CAP_KEY);
    } catch {
      // storage blocked
    }
    return null;
  }
}

/** Keeps `tier` as the cap for `renderer` (or clears it, at the top). */
export function writeCap(local: Store | null, renderer: string, session: string, tier: Tier, top: Tier, now: number) {
  if (!local) return;
  try {
    if (tier === top) local.removeItem(CAP_KEY);
    else local.setItem(CAP_KEY, JSON.stringify({ renderer, tier, at: now, version: CAP_VERSION, session } satisfies Cap));
  } catch {
    // storage blocked
  }
}

/** Forgets the cap ('Try High'). */
export function clearCap(local: Store | null) {
  try {
    local?.removeItem(CAP_KEY);
  } catch {
    // storage blocked
  }
}
