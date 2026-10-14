// The land queue (server/landqueue.ts): whether each agent's finished branch still lands on the branch
// it merges into, looked at before anyone presses Merge. How far behind it is, which files would
// conflict, what its row and the brief say about it, and the prompt Restack sends. Pure, so the server,
// the home page and the tests share it.

/** The most conflicting files a row carries; the rest are counted. */
export const LAND_FILES_MAX = 20;

/** How an agent's branch would land on its base right now. */
export interface LandState {
  /** Commits on the base its branch doesn't have. */
  behind: number;
  /** Commits on its branch the base doesn't have (only branches with some are looked at). */
  ahead: number;
  /** Files that conflict if it were merged now (at most LAND_FILES_MAX); empty when it merges clean. */
  conflicts: string[];
  /** Conflicting files past the list. */
  more?: number;
  /** This git can't merge without touching a checkout (merge-tree --write-tree came in git 2.38): conflicts unknown. */
  unknown?: true;
}

/** Another live agent on the same project that changed some of the same files. */
export interface OverlapState {
  /** The other agents' ids. */
  with: string[];
  /** The files both changed (at most LAND_FILES_MAX). */
  files: string[];
  more?: number;
}

/** Whether merging it now would conflict. */
export const conflicts = (land: LandState | undefined): boolean => !!land && land.conflicts.length > 0;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "src/api/user.ts", "a.ts and b.ts", "a.ts, b.ts and 3 more". */
export function fileList(files: readonly string[], more = 0, shown = 2): string {
  const names = files.slice(0, shown);
  const rest = files.length - names.length + more;
  if (rest > 0) return `${names.join(', ')} and ${rest} more`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
}

/** "behind 2": the row's badge, or undefined when it's up to date. */
export function behindWords(land: LandState | undefined): string | undefined {
  return land && land.behind > 0 ? `behind ${land.behind}` : undefined;
}

/** "Conflicts in src/api/user.ts": the row's status for a branch that won't merge clean. */
export function conflictLabel(land: LandState): string {
  return `Conflicts in ${fileList(land.conflicts, land.more ?? 0)}`;
}

/** "behind main by 2 commits; merging now conflicts in a.ts and b.ts": the longer reason, for a title or a tooltip. */
export function landReason(land: LandState, into: string): string {
  const behind = land.behind > 0 ? `behind ${into} by ${plural(land.behind, 'commit')}` : `on top of ${into}`;
  if (land.unknown) return `${behind}; this git can't tell whether it conflicts (git 2.38 or newer can)`;
  return land.conflicts.length ? `${behind}; merging now conflicts in ${fileList(land.conflicts, land.more ?? 0, 5)}` : `${behind}; merges clean`;
}

/** What Restack asks the agent, in the send-back box where the person can change it first. */
export function restackPrompt(e: { branch?: string; into?: string; land?: LandState; pr?: { number: number; state: string } }): string {
  const into = e.into ?? "the project's branch";
  const land = e.land;
  const where = e.branch ? `Your branch ${e.branch}` : 'Your branch';
  const behind = land && land.behind > 0 ? ` is ${plural(land.behind, 'commit')} behind ${into}` : ` has fallen behind ${into}`;
  const clash = land?.conflicts.length ? `, and merging it now conflicts in ${fileList(land.conflicts, land.more ?? 0, 8)}` : '';
  const push = e.pr && e.pr.state === 'open' ? ` Then push it with \`git push --force-with-lease\` so pull request #${e.pr.number} updates.` : '';
  return `${where}${behind}${clash}. Rebase it onto ${into} (\`git rebase ${into}\`), resolve each conflict so both sides' changes survive, run the tests, and finish when it merges clean.${push}`;
}

/** "Also changed by Fix login: src/api/user.ts": the overlap note, naming the others by `nameOf`. */
export function overlapWords(o: OverlapState, nameOf: (id: string) => string): string {
  const who = o.with.map(nameOf);
  const by = who.length > 2 ? `${who.slice(0, 2).join(', ')} and ${who.length - 2} more` : who.join(' and ');
  return `Also changed by ${by}: ${fileList(o.files, o.more ?? 0, 3)}`;
}
