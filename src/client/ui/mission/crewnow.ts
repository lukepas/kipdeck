// What the Crew tab's Now column says and the order its rows go in. Pure (no DOM, no store), so the
// tests can check it: the words are shared/rowtext.ts's, the same as every other row on the deck.

import { spokenActivity, type Ranked } from '../../../shared/attention';
import { callSign } from '../../../shared/callsign';
import type { RosterEntry } from '../../../shared/protocol';
import { ago, headline, sameText, statusPhrase } from '../../../shared/rowtext';

export interface CrewNow {
  /** The status phrase: "needs input", "working", "done 12 min ago, nobody looked"... */
  state: string;
  /** How long it has been that way, short: "12m". */
  elapsed: string;
  /** Its latest activity line, when it says something the state doesn't. */
  activity: string;
}

/** The Now column for a ranked unit at `now`. */
export function crewNow(r: Ranked, now: number): CrewNow {
  const e = r.entry;
  // An asking tool's bare name ("request_user_input") says nothing: never shown (shared/attention.ts).
  const said = spokenActivity(e.activity);
  const head = headline(e.task, said);
  const state = statusPhrase(r.att, head.title);
  const line = (said ?? '').split('\n')[0].trim();
  // Never the state again, whatever its case: "working" under "Working" says nothing.
  const fresh = (t: string) => !!t && !sameText(t, state) && !sameText(t, r.att.label);
  const activity = fresh(line) && !sameText(line, head.title) ? line : fresh(head.title) ? head.title : '';
  return { state, elapsed: ago(now - r.att.since), activity };
}

/**
 * The Crew tab's order: the attention ranking's (whoever needs you first), then any unit the ranking
 * doesn't have yet, yours first, by deck and call sign.
 */
export function crewOrder(roster: readonly RosterEntry[], ranked: readonly Ranked[], floor: string | null): RosterEntry[] {
  const rank = new Map(ranked.map((r, i) => [r.entry.id, i]));
  const at = (e: RosterEntry) => rank.get(e.id) ?? Number.POSITIVE_INFINITY;
  return [...roster].sort((a, b) => {
    const d = at(a) - at(b);
    if (d) return d;
    if (Number.isFinite(at(a))) return 0;
    return Number(b.floor === floor) - Number(a.floor === floor) || a.floorName.localeCompare(b.floorName) || callSign(a.deskId).localeCompare(callSign(b.deskId));
  });
}
