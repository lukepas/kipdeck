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

/**
 * The pull requests a prompt tells a worker to check out (`gh pr checkout 12`): the ones whose code
 * it would run. The office checks each before the prompt reaches a worker or the queue, whoever
 * wrote it: a person, or a board agent a PR's text talked into it.
 */
export function checkedOutPulls(prompt: string): number[] {
  const found = new Set<number>();
  // The rest of the command, up to the end of its line, its code span or the next command.
  for (const m of prompt.matchAll(/\bgh\s+pr\s+checkout\b([^\n`;&|]*)/g)) {
    for (const n of m[1].matchAll(/(?:^|\s|\/pull\/|#)(\d+)(?!\w|[.-]\w)/g)) {
      const v = Number(n[1]);
      if (Number.isSafeInteger(v) && v > 0) found.add(v);
    }
  }
  // A PR's head fetched by hand (git fetch origin pull/12/head) is a checkout too.
  for (const m of prompt.matchAll(/\bpull\/(\d+)\/(?:head|merge)\b/g)) found.add(Number(m[1]));
  return [...found];
}
