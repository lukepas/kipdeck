// Line comments on an agent's diff, bundled into the note Send back hands it: each one anchored to
// its file and line, so the agent can find the spot without guessing. Pure: the home page keeps the
// comments (home/brief/comments.ts) and the tests read this directly.

export interface LineComment {
  path: string;
  /** The line number: in the new file, or in the old one for a removed line. */
  line: number;
  /** A removed line: `line` is in the old file. */
  removed?: boolean;
  /** The line's code as the diff showed it, for context. */
  code?: string;
  text: string;
}

/** "src/a.ts:12" or "src/a.ts:12 (removed line)". */
export function anchor(c: Pick<LineComment, 'path' | 'line' | 'removed'>): string {
  return `${c.path}:${c.line}${c.removed ? ' (removed line)' : ''}`;
}

/** The comments as the start of a Send back note, in file and line order; empty with none. */
export function bundleComments(comments: readonly LineComment[]): string {
  if (!comments.length) return '';
  const sorted = [...comments].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
  const lines = sorted.map((c) => {
    const code = c.code?.trim();
    return `- ${anchor(c)}${code ? ` \`${code.length > 80 ? `${code.slice(0, 77)}...` : code}\`` : ''}: ${c.text.trim()}`;
  });
  return `Comments on your diff:\n${lines.join('\n')}\n\n`;
}
