// Whether a pull request is one the office may hand to a worker to check out, build and merge.
// "Fix & merge" and "Fix conflicts" have a worker check the branch out, install and run it: for a
// pull request from a fork, or from someone who can't push to the repository, that runs a
// stranger's code (an npm postinstall, a test, a build script) with the office's sign-ins. Those
// get a warning instead (see docs/security.md).

/** GitHub's repository permissions that can push to it. */
const WRITE = new Set(['admin', 'maintain', 'write']);

export interface GhPullTrust {
  /** Safe to hand to a worker that checks it out and builds it. */
  trusted: boolean;
  /** From a fork (GitHub's isCrossRepository). */
  fork: boolean;
  /** The author's permission on the repository, when GitHub said. */
  permission?: string;
  /** Why it isn't trusted, for the warning. */
  reason?: string;
}

/** Whether a pull request's code may be run by a worker: not from a fork, and by someone who can push to the repository. */
export function pullTrust(fork: boolean, author: string, permission: string | undefined): GhPullTrust {
  const who = author ? `@${author}` : 'its author';
  if (fork) return { trusted: false, fork, permission, reason: `This pull request comes from a fork, so its code is ${who}'s, not the repository's.` };
  if (permission === undefined) return { trusted: false, fork, reason: `The office couldn't check whether ${who} can push to this repository.` };
  if (!WRITE.has(permission)) return { trusted: false, fork, permission, reason: `${who} can't push to this repository (their access is ${permission || 'none'}).` };
  return { trusted: true, fork, permission };
}

/** gh pr checkout's flags that take a value (`-b mine`), so the value isn't read as the PR. */
const VALUE_FLAGS = new Set(['-b', '--branch', '-R', '--repo']);

/**
 * What a `gh pr checkout` names, when it isn't a plain number: a branch (`patch-1`), a fork's
 * `owner:branch`, or `--repo` when it checks out a pull request of another repository altogether.
 * The office asks GitHub which PR a branch is, and refuses what it can't pin down.
 */
export type PullRef = number | string;

/**
 * The pull requests a prompt tells a worker to check out (`gh pr checkout 12`): the ones whose code
 * it would run. The office checks each before the prompt reaches a worker or the queue, whoever
 * wrote it: a person, or a board agent a PR's text talked into it. A checkout by branch name comes
 * back as that name (see PullRef), so it is looked up rather than let through.
 */
export function checkedOutPulls(prompt: string): PullRef[] {
  const found = new Set<PullRef>();
  // The rest of the command, up to the end of its line, its code span or the next command. Looked
  // at without consuming it, so a second checkout on the same line is found too.
  for (const m of prompt.matchAll(/\bgh\s+pr\s+checkout\b(?=([^\n`;&|]*))/g)) {
    const ref = checkoutArg(m[1]);
    if (ref !== undefined) found.add(ref);
  }
  // A PR's head fetched by hand (git fetch origin pull/12/head) is a checkout too.
  for (const m of prompt.matchAll(/\bpull\/(\d+)\/(?:head|merge)\b/g)) found.add(Number(m[1]));
  return [...found];
}

/** The one pull request a `gh pr checkout` names, from what follows the command on its line. */
function checkoutArg(rest: string): PullRef | undefined {
  const words = rest.trim().split(/\s+/).filter(Boolean);
  let otherRepo = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^["'(]+|["'),.:;!?]+$/g, '');
    if (w.startsWith('-')) {
      const flag = w.split('=')[0];
      if (flag === '-R' || flag === '--repo' || /^-[a-zA-Z]*R/.test(flag)) otherRepo = true;
      if (VALUE_FLAGS.has(flag) && !w.includes('=')) i++;
      continue;
    }
    if (otherRepo) return '--repo';
    if (!w) return undefined;
    const n = /^(?:#)?(\d+)$/.exec(w) ?? /\/pull\/(\d+)(?:[/?#].*)?$/.exec(w);
    if (n) {
      const v = Number(n[1]);
      return Number.isSafeInteger(v) && v > 0 ? v : undefined;
    }
    return w;
  }
  return otherRepo ? '--repo' : undefined;
}
