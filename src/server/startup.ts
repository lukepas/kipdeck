// What the terminal says while Kipdeck starts and stops: "Starting Kipdeck..." at once, a line for
// each slow step, the address and sign-in link the moment the server listens, before the slower
// checks (which agent CLIs are installed) finish, and one line when it stops.
//
// The crew voice (docs/voice.md) gets one warm clause at ready and the session's tally at exit, and
// nothing else: errors, help, --json and account output stay plain. No colour and no art, so the
// output reads the same in a pipe, a log or with NO_COLOR set.
import { PRODUCT } from '../shared/copy.js';
import type { ShipRecord } from '../shared/protocol.js';

export interface Out {
  write(s: string): unknown;
}

/** The arguments that print something of their own and stop, so nothing is starting. */
export function startsOffice(argv: readonly string[]): boolean {
  return !argv.some((a) => a === '-h' || a === '--help' || a === '--reset-password');
}

/** One line per slow step, as it starts: never rewritten in place, since the office logs between them. */
export function step(text: string, out: Out = process.stdout) {
  out.write(`  ${text}\n`);
}

export const STARTING = `Starting ${PRODUCT}...`;

/** The one warm clause at ready, after the fact it follows. */
export const ON_WATCH = "Kip's on watch.";

/**
 * The lines that say where it is and how to get in, printed as soon as it listens. `warm` (a person
 * at the terminal, and nobody waiting on them) adds the one warm clause after "Opened in your browser".
 */
export function addressLines(o: { urls: readonly string[]; signIn: string; opened: boolean; openCmd: string; warm?: boolean }): string[] {
  return [
    '',
    `  ${PRODUCT} is running at ${o.urls.join('  ')}`,
    o.signIn ? (o.opened ? `  Opened in your browser, signed in.${o.warm ? ` ${ON_WATCH}` : ''}` : `  Sign in (the link works once): ${o.signIn}`) : '',
    o.signIn ? `  Lost the tab? Run \`${o.openCmd}\` for a new link.` : '',
  ];
}

/** How many of the shipped log's records are merges made at or after `since` (this run's start). */
export function mergedSince(records: readonly ShipRecord[], since: number): number {
  return records.filter((r) => r.kind === 'merged' && r.at >= since).length;
}

/**
 * The line it stops on. Ctrl+C stops the agents with it; a restart (SIGTERM, `keep`) leaves them
 * working for the next start. The tally is left out when nothing merged.
 */
export function goodbye(o: { merged: number; keep: boolean }): string {
  const tally = o.merged > 0 ? `${o.merged} shipped this session` : '';
  if (o.keep) return `${PRODUCT} stopped. ${tally ? `${tally}; your` : 'Your'} agents keep working.`;
  return `${PRODUCT} stopped, and its agents with it.${tally ? ` ${tally}.` : ''}`;
}

/** Lines with no blank line twice in a row, as one block of text. */
export function block(lines: readonly string[]): string {
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
}
