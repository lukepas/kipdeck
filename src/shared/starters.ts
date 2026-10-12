// The first-run task box's suggestions (home/starter.ts): three tasks drawn from the repository
// itself, so the first agent does something you'd have asked for anyway. What the office found in the
// folder (server/starters.ts) goes in; the chips come out, most useful first. Pure, so the tests read it.

/** What the office found in a project's folder. */
export interface RepoFacts {
  /** The command that runs its tests (`npm test`, `cargo test`...), when it has one. */
  test?: string;
  /** TODO and FIXME comments: how many, and the file with the most. */
  todos?: { count: number; file?: string; inFile?: number };
  /** Its README: none at all, or the parts it lacks. */
  readme?: { exists: false } | { exists: true; missing: ReadmePart[] };
  /** Open GitHub issues, newest first (only when gh is signed in). */
  issues?: { number: number; title: string }[];
}

export type ReadmePart = 'install' | 'run' | 'test';

export interface Starter {
  kind: 'issue' | 'tests' | 'todo' | 'readme' | 'tour' | 'test-gap';
  /** The chip's words. */
  label: string;
  /** What it puts in the task box. */
  prompt: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s);
const PART_WORDS: Record<ReadmePart, string> = { install: 'install', run: 'run', test: 'test' };

/** Each kind of chip there's something for, in the order they're worth doing. */
function candidates(f: RepoFacts): Starter[] {
  const out: Starter[] = [];
  const issue = f.issues?.[0];
  if (issue) {
    // Anyone can title an issue: one line, and no quote or backtick that could end the quoted title early.
    const title = issue.title.replace(/\s+/g, ' ').replace(/["`]/g, "'").trim();
    out.push({
      kind: 'issue',
      label: clip(`Fix #${issue.number}: ${title}`, 48),
      prompt: `Work on GitHub issue #${issue.number}, "${clip(title, 120)}". Read it first with gh issue view ${issue.number}. Ask me before you pick between approaches, and keep the change small.`,
    });
  }
  if (f.test) {
    out.push({
      kind: 'tests',
      label: 'Run the tests and fix what fails',
      prompt: `Run \`${f.test}\`. If anything fails, find the cause and fix it, and ask me if the right fix is unclear. If everything passes, say so and change nothing.`,
    });
  }
  if (f.todos && f.todos.count > 0) {
    const where = f.todos.file ? ` in ${f.todos.file}` : '';
    out.push({
      kind: 'todo',
      label: clip(f.todos.file ? `Clear a TODO in ${shortPath(f.todos.file)}` : 'Clear one of the TODOs', 48),
      prompt: `This repository has ${f.todos.count} TODO or FIXME comment${f.todos.count === 1 ? '' : 's'}${f.todos.file ? `, ${f.todos.inFile ?? 'some'} of them in ${f.todos.file}` : ''}. Pick the one${where} that is safest to finish, finish it and remove the comment. Ask me before changing anything other code relies on.`,
    });
  }
  if (f.readme && !f.readme.exists) {
    out.push({ kind: 'readme', label: 'Write a README', prompt: 'This repository has no README. Write a short README.md: what it is, how to install it, run it and test it. Read the code and config to find out; ask me about anything you cannot tell.' });
  } else if (f.readme?.exists && f.readme.missing.length) {
    const parts = f.readme.missing.map((p) => PART_WORDS[p]);
    const words = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    out.push({ kind: 'readme', label: `Add ${words} steps to the README`, prompt: `The README doesn't say how to ${words} this project. Find out from the code and config, and add short steps for it to README.md. Change no other file, and ask me about anything you cannot tell.` });
  }
  return out;
}

/** The last two parts of a path, so a chip stays short. */
function shortPath(p: string): string {
  const parts = p.split('/');
  return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : p;
}

/** For a repository with little to go on: still something worth asking. */
const FALLBACKS: Starter[] = [
  { kind: 'tour', label: 'Explain how this repo fits together', prompt: 'Read this repository and tell me how it fits together: the main parts, where to start reading, and how to run and test it. Change no files.' },
  { kind: 'test-gap', label: 'Add a test where one is missing', prompt: 'Find the most important code path that has no test, add one test for it and run it. Ask me first if you are unsure which path matters most.' },
  { kind: 'readme', label: 'Check the README against the code', prompt: 'Read the README and check it against the code. List what is out of date or missing and fix it in README.md only. Ask me before removing anything.' },
];

/** The three chips: what the repository has to work on, topped up with the fallbacks. */
export function starterChips(f: RepoFacts, max = 3): Starter[] {
  const out = candidates(f).slice(0, max);
  for (const s of FALLBACKS) {
    if (out.length >= max) break;
    if (!out.some((o) => o.kind === s.kind)) out.push(s);
  }
  return out;
}
