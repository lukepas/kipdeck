import { AWAY_MS } from '../../../shared/attention';
import type { TimelineEvent } from '../../../shared/protocol';
import { lastHere } from '../persist';
import type { Slice } from '../store';

/** The most events the page keeps of the building's timeline (what the Timeline tab has loaded, and what came since). */
const TIMELINE_KEPT = 1000;

declare module '../store' {
  interface Store {
    /**
     * The building's timeline as far as it was loaded, newest first: the Timeline tab's first page
     * and the ones after it, and every event that happened since. `more` when there are older ones.
     */
    timeline: { events: TimelineEvent[]; loaded: boolean; more: boolean };
    /**
     * You came back after a while away: since when, and what happened meanwhile, once the server
     * answered (see shared/digest.ts). The digest opens once from it. Undefined until the first
     * welcome, null when you weren't away.
     */
    away: { since: number; events?: TimelineEvent[]; more?: boolean } | null | undefined;
  }
  interface Topics {
    timeline: true;
    away: true;
  }
}

/** Newest first, each event once. */
function merge(a: readonly TimelineEvent[], b: readonly TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  return [...a, ...b]
    .filter((e) => {
      const k = `${e.floor}:${e.id}`;
      return !seen.has(k) && !!seen.add(k);
    })
    .sort((x, y) => y.at - x.at || y.id.localeCompare(x.id))
    .slice(0, TIMELINE_KEPT);
}

/** The activity timeline, and the digest of what happened while you were away. */
export const timeline: Slice = {
  init(s) {
    s.timeline = { events: [], loaded: false, more: false };
    s.away = undefined;
  },
  on: {
    welcome(s, m) {
      // Back from a reconnect: what happened meanwhile isn't here, so the next look asks again.
      s.timeline = { ...s.timeline, loaded: false };
      // Only the page's first welcome says whether you were away: a reconnect isn't coming back.
      if (s.away !== undefined) return ['timeline'];
      // An account's last visit is the office's to remember; on the shared password, this browser's.
      const here = m.me.account ? undefined : lastHere();
      const since = m.me.account ? m.awaySince : here !== undefined && Date.now() - here >= AWAY_MS ? here : undefined;
      s.away = since === undefined ? null : { since };
      return ['timeline', 'away'];
    },
    timeline(s, m) {
      // The digest's answer: everything since you left.
      if (m.since !== undefined && m.floor === undefined && s.away && m.since === s.away.since) {
        s.away = { ...s.away, events: m.events, more: m.more };
        return ['away'];
      }
      // The building's own pages; a floor's filter is the Timeline tab's to look at on its own.
      if (m.floor !== undefined || m.since !== undefined) return;
      s.timeline = { events: merge(m.before === undefined ? [] : s.timeline.events, m.events), loaded: true, more: m.more };
      return ['timeline'];
    },
    'timeline.event'(s, m) {
      s.timeline = { ...s.timeline, events: merge([m.event], s.timeline.events) };
      if (s.away?.events) s.away = { ...s.away, events: merge([m.event], s.away.events) };
      return ['timeline'];
    },
  },
};
