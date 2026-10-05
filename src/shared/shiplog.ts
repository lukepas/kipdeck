// The bridge's world in words: what the heading band ahead says, the hail lines from sister decks,
// the captions on the escorts and the picket. Plain ASCII and upper case as the instruments are, no
// exclamation marks, no emoji, and nothing about war (tests/copy.test.ts checks this file). Slow
// numbers are said plainly, never as a scolding; units and outcomes are named, never people ranked.

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
};
const plural = (n: number, one: string, many = `${one}S`) => `${n} ${n === 1 ? one : many}`;

/** What the band under the destination says while the ship makes for a waypoint. */
export interface HeadingBand {
  /** The waypoint's title, its place (1-based) and how many there are. */
  title: string;
  n: number;
  of: number;
  /** How far the whole mission has come, 0-100. */
  percent: number;
  /** Whole days past the waypoint's due date, when it is overdue. */
  behindDays?: number;
}

/** "AUTH REWRITE - 2/4 - 47%" (short enough for one clear pane of the canopy), then "BEHIND SCHEDULE: 4 DAYS" when it is overdue. */
export function headingBand(b: HeadingBand): string[] {
  const lines = [`${clip(b.title, 28).toUpperCase()} - ${b.n}/${b.of} - ${Math.round(b.percent)}%`];
  if (b.behindDays !== undefined && b.behindDays > 0) lines.push(`BEHIND SCHEDULE: ${plural(b.behindDays, 'DAY')}`);
  return lines;
}

/** Every waypoint passed: the ship is in orbit. */
export const MISSION_COMPLETE = 'MISSION COMPLETE';
/** The band once every waypoint is passed. */
export function orbitBand(statement: string): string[] {
  return statement ? [MISSION_COMPLETE, `IN ORBIT: ${clip(statement, 56).toUpperCase()}`] : [MISSION_COMPLETE];
}
/** The card when the arrival can't play (reduced motion, or it waited too long behind a call). */
export function missionCompleteCard(statement: string): string {
  return statement ? `Mission complete: ${clip(statement, 80)}. The ship holds orbit until a new mission is set.` : 'Mission complete. The ship holds orbit until a new mission is set.';
}

/** A sister deck reached a waypoint: "HAIL FROM BILLING-API: WAYPOINT STRIPE V2 REACHED". */
export function hailLine(deck: string, waypoint: string): string {
  return `HAIL FROM ${clip(deck, 24).toUpperCase()}: WAYPOINT ${clip(waypoint, 40).toUpperCase()} REACHED`;
}

/** The escorts past the ones in view, on the hail strip: "3 MORE DECKS IN THE FLEET". */
export function fleetOverflow(n: number): string {
  return n > 0 ? `${plural(n, 'MORE DECK')} IN THE FLEET` : '';
}

/** The escort that holds station in a one-deck office. */
export const LONE_ESCORT = 'ADD A DECK TO GROW THE FLEET';

/** The name painted on an escort's hull: its repository's name, else the deck's. */
export function hullName(name: string, repo?: string): string {
  return clip((repo?.split('/').pop() || name).toUpperCase(), 22);
}

/** Under the picket ahead: how many open pull requests hold there, and how many past the sixteen shown. */
export function picketCaption(open: number, shown: number): string {
  if (open <= 0) return '';
  const head = `PICKET: ${plural(open, 'OPEN PR')}`;
  return open > shown ? `${head} (${open - shown} NOT SHOWN)` : head;
}

// ---- Moments: the jump, the alert conditions, the celebrations' cards ------------------------------

/** The countdown before a jump, on the band under the overhead strip: "JUMP TO WAYPOINT 4: BILLING V2 - 3". */
export function jumpCountdown(o: { n: number; title: string; final: boolean }, left: number): string {
  const to = o.final ? `FINAL APPROACH: ${clip(o.title, 40).toUpperCase()}` : `JUMP TO WAYPOINT ${o.n}: ${clip(o.title, 40).toUpperCase()}`;
  return `${to} - ${Math.max(1, Math.ceil(left))}`;
}

/** The countdown across the forward glass: where the ship jumps to over the seconds left. */
export function countdownBanner(o: { n: number; title: string; final: boolean }, left: number): string[] {
  const to = o.final ? `FINAL APPROACH: ${clip(o.title, 32).toUpperCase()}` : `JUMP TO WAYPOINT ${o.n}: ${clip(o.title, 32).toUpperCase()}`;
  return [to, String(Math.max(1, Math.ceil(left)))];
}

/** A jump that waits for the captain: every call answered first. */
export const JUMP_READY = 'JUMP READY - AWAITING CAPTAIN';

/** What the ship comes out of a jump under, across the forward glass for 3 s. */
export function waypointBanner(o: { n: number; title: string; final: boolean }): string[] {
  return o.final ? ['ON FINAL APPROACH', clip(o.title, 36).toUpperCase()] : [`WAYPOINT ${o.n}`, clip(o.title, 36).toUpperCase()];
}

/** The alert conditions (features/alert): green, amber and red. */
export type ConditionName = 'green' | 'amber' | 'red';

/** Why the bridge is at amber or red, as the band says it. */
export interface ConditionWhy {
  /** Units that need the captain or are stuck, snoozed ones left out. */
  waiting: number;
  stuck: number;
  /** The unit that has waited longest, its call sign and minutes. */
  top?: { unit: string; min: number; stuck: boolean };
  /** A reminder that fired on this deck (needs-input-long, approved-unmerged, milestone-overdue). */
  reminder?: 'needs-input-long' | 'approved-unmerged' | 'milestone-overdue';
  /** While the line names a stuck unit: the units that need the captain (quick to answer), the first one's call sign. */
  asks?: { n: number; unit: string };
}

const REMINDER_WORDS: Record<NonNullable<ConditionWhy['reminder']>, string> = {
  'needs-input-long': 'A UNIT HAS WAITED OVER AN HOUR',
  'approved-unmerged': 'AN APPROVED PR WAITS TO MERGE',
  'milestone-overdue': 'A WAYPOINT IS PAST ITS DATE',
};

/** "CONDITION AMBER - 2 UNITS AWAIT ORDERS", "CONDITION RED - C-01 STUCK 14 MIN", "CONDITION GREEN - ALL STATIONS WORKING". */
export function conditionLine(c: ConditionName, why: ConditionWhy, working = 0): string {
  if (c === 'green') return working > 0 ? 'CONDITION GREEN - ALL STATIONS WORKING' : 'CONDITION GREEN - ALL CLEAR';
  const head = `CONDITION ${c.toUpperCase()}`;
  if (c === 'red') {
    if (why.stuck > 1) return `${head} - ${plural(why.stuck, 'UNIT')} STUCK`;
    if (why.top?.stuck) return `${head} - ${why.top.unit} STUCK ${why.top.min} MIN${asksTail(why)}`;
  }
  if (why.waiting > 0) return `${head} - ${plural(why.waiting, 'UNIT')} ${why.waiting === 1 ? 'AWAITS' : 'AWAIT'} ORDERS`;
  return why.reminder ? `${head} - ${REMINDER_WORDS[why.reminder]}` : head;
}

/** The quick answer after a stuck unit's line: " - +1 AWAITS ORDERS (A-03)". */
function asksTail(why: ConditionWhy): string {
  if (!why.asks?.n) return '';
  return ` - +${why.asks.n} ${why.asks.n === 1 ? 'AWAITS' : 'AWAIT'} ORDERS (${why.asks.unit})`;
}

/** What the band says while the latch is still on its way down and nothing waits any more. */
export const STANDING_DOWN = 'STANDING DOWN - EVERY CALL CLEARED';

/** A unit back from stuck that landed its work: "WIDGET (B-02) RECOVERED, 40M STUCK". */
export function recoveredLine(name: string, unit: string | undefined, stuckMs: number): string {
  const who = unit ? `${clip(name, 24)} (${unit})` : clip(name, 24);
  return `${who.toUpperCase()} RECOVERED, ${stuckFor(stuckMs)} STUCK`;
}

/** How long something was stuck, the ticker's way: 40M, 2H 05M. */
function stuckFor(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m}M` : `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, '0')}M`;
}

/** A celebration's card: a title in mono, plain lines under it. */
export interface MomentCard {
  title: string;
  lines: string[];
}

/** Tier 1: the day's first merge, or a unit's first ever. */
export function firstMergeCard(o: { unit: string; pr?: number; firstEver: boolean }): MomentCard {
  const pr = o.pr ? ` with PR #${o.pr}` : '';
  return { title: o.firstEver ? 'FIRST MERGE' : 'FIRST MERGE OF THE DAY', lines: [o.firstEver ? `${o.unit} landed its first merge${pr}.` : `${o.unit} opened the day's log${pr}.`] };
}

/** Tier 1, recovery: a unit back from stuck that landed its work. */
export function recoveryCard(o: { unit: string; stuckMs: number; merged: boolean }): MomentCard {
  return { title: 'RECOVERED', lines: [`${o.unit} was stuck ${stuckFor(o.stuckMs).toLowerCase()} and ${o.merged ? 'merged anyway' : 'finished its work'}.`] };
}

/** Tier 2: three merges inside an hour with nothing stuck. */
export function streakCard(o: { merges: number }): MomentCard {
  return { title: 'STREAK', lines: [`${o.merges} merges inside the hour, nothing stuck.`] };
}

/** How long a stretch took, in plain words: "2 days", "5 hours", "under an hour". */
export function spanWords(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return 'under an hour';
  if (h < 36) return `${Math.round(h)} ${Math.round(h) === 1 ? 'hour' : 'hours'}`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

/** What a stretch of the log came to: the numbers on a waypoint's or a mission's card. */
export interface LogTally {
  merges: number;
  spanMs: number;
  /** Reverts on record, when the reputation index knows; left out otherwise. */
  reverts?: number;
  /** Bounties paid in the stretch, already written ("120.00 USDC"), when any. */
  paid?: string;
  recoveries: number;
  /** The units that merged, by call sign or name, most merges first. */
  units: string[];
}

const tallyLine = (t: LogTally) =>
  [`${t.merges} ${t.merges === 1 ? 'merge' : 'merges'}`, spanWords(t.spanMs), ...(t.reverts !== undefined ? [`${t.reverts} ${t.reverts === 1 ? 'revert' : 'reverts'}`] : []), ...(t.paid ? [`${t.paid} paid`] : [])].join(', ');

/** Tier 3: "Waypoint 3: 14 merges, 2 days, 0 reverts, 120.00 USDC paid". */
export function waypointCard(o: { n: number; title: string; tally: LogTally }): MomentCard {
  const lines = [`Waypoint ${o.n}: ${tallyLine(o.tally)}.`];
  if (o.tally.recoveries) lines.push(`${o.tally.recoveries} ${o.tally.recoveries === 1 ? 'unit' : 'units'} came back from stuck to land their work.`);
  if (o.tally.units.length) lines.push(`Merged by ${listWords(o.tally.units)}.`);
  return { title: `WAYPOINT ${o.n} REACHED: ${clip(o.title, 40).toUpperCase()}`, lines };
}

/** Tier 4: the mission complete, every unit that merged named. */
export function missionCard(o: { statement: string; waypoints: number; tally: LogTally }): MomentCard {
  const lines = [`${o.waypoints} ${o.waypoints === 1 ? 'waypoint' : 'waypoints'} passed: ${tallyLine(o.tally)}.`];
  lines.push(o.tally.units.length ? `The crew that merged: ${listWords(o.tally.units)}.` : 'No merges on record for this mission.');
  return { title: o.statement ? `MISSION COMPLETE: ${clip(o.statement, 48).toUpperCase()}` : MISSION_COMPLETE, lines };
}

/** "A-01, B-02 and C-03", the rest counted past `max`. */
function listWords(items: readonly string[], max = 12): string {
  const shown = items.slice(0, max);
  const more = items.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length < 2 ? (shown[0] ?? '') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}
