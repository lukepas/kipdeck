// What the bottom bar's N chip says: who the next press of N goes to and how long they have waited
// ("next: Byte, 12m"), so the first thing you read is who and how long; "next agent" when nobody waits.
// Pure: the round's cursor (features/waiting peekNext) says who is next; without one, the first in line.
import type { Ranked } from '../../../shared/attention';
import { ago } from '../../../shared/rowtext';
import { waitTone, type WaitTone } from '../../../shared/wait';
import { nLine } from '../../nextup';

export interface NextWord {
  /** "next: Byte," or "next agent". */
  who: string;
  /** "12m" and its tone, or none when nobody waits. */
  wait?: string;
  tone?: WaitTone;
}

/** The words when nobody waits. */
export const NEXT_NOBODY = 'next agent';

/** The N chip's words for this floor's ranking at `now`: about `next` (who N goes to now), else the first in line. */
export function nextWord(ranked: readonly Ranked[], now: number, next?: string): NextWord {
  const id = next ?? nLine(ranked)[0]?.id;
  const r = id ? ranked.find((x) => x.entry.id === id) : undefined;
  if (!r) return { who: NEXT_NOBODY };
  const ms = now - r.att.since;
  return { who: `next: ${r.entry.name},`, wait: ago(ms), tone: waitTone(ms) };
}
