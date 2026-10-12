// What the terminal says while Kipdeck starts: "Starting Kipdeck..." at once, a line for each slow
// step, and the address and sign-in link the moment the server listens, before the slower checks
// (which agent CLIs are installed) finish.
import { PRODUCT } from '../shared/copy.js';

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

/** The lines that say where it is and how to get in, printed as soon as it listens. */
export function addressLines(o: { urls: readonly string[]; signIn: string; opened: boolean; openCmd: string }): string[] {
  return [
    '',
    `  ${PRODUCT} is running at ${o.urls.join('  ')}`,
    o.signIn ? (o.opened ? '  Opened in your browser, signed in.' : `  Sign in (the link works once): ${o.signIn}`) : '',
    o.signIn ? `  Lost the tab? Run \`${o.openCmd}\` for a new link.` : '',
  ];
}

/** Lines with no blank line twice in a row, as one block of text. */
export function block(lines: readonly string[]): string {
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
}
