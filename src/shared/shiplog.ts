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

/** "MAKING FOR AUTH REWRITE - WAYPOINT 2 OF 4 - 47%", then "BEHIND SCHEDULE: 4 DAYS" when it is overdue. */
export function headingBand(b: HeadingBand): string[] {
  const lines = [`MAKING FOR ${clip(b.title, 40).toUpperCase()} - WAYPOINT ${b.n} OF ${b.of} - ${Math.round(b.percent)}%`];
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
