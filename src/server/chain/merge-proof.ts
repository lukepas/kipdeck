// What GitHub says about a merged pull request, asked fresh before the attester vouches for it:
// merged or not, the merge commit, who merged it (a User, or a Bot or app), their permission on the
// repository, whether the head came from a fork, and which issues it closes. The board's list is
// not enough: it doesn't say who merged, and it is up to 90 seconds old.
import { gh } from '../github.js';
import type { PullFacts } from './sdk.js';

/** Runs gh in a checkout; tests pass their own. */
export type GhRun = (args: string[], cwd: string) => Promise<string>;

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/;
const PERMISSIONS = new Set(['admin', 'maintain', 'write', 'triage', 'read', 'none']);

/**
 * The facts for pull request `n` of the checkout at `dir` (base repository `repo`, "owner/name"),
 * as the bounty on issue `issue` needs them. `officeMade` is the office's own say (Floor.officePull);
 * `listedFork` is the board's isCrossRepository, which counts too.
 */
export async function pullFacts(dir: string, repo: string, n: number, issue: number, officeMade: boolean, listedFork: boolean, run: GhRun = (a, c) => gh(a, c)): Promise<PullFacts> {
  const jq = '{merged: .merged, sha: .merge_commit_sha, by: (if .merged_by then {login: .merged_by.login, id: .merged_by.id, type: .merged_by.type} else null end), head: .head.repo.full_name, base: .base.repo.full_name}';
  const [pullText, closesText] = await Promise.all([
    run(['api', `repos/{owner}/{repo}/pulls/${n}`, '--jq', jq], dir),
    run(['pr', 'view', String(n), '--json', 'closingIssuesReferences', '--jq', '[.closingIssuesReferences[].number]'], dir),
  ]);
  const p = JSON.parse(pullText) as { merged?: boolean; sha?: string | null; by?: { login?: string; id?: number; type?: string } | null; head?: string | null; base?: string | null };
  const closes = (JSON.parse(closesText || '[]') as unknown[]).filter((x): x is number => Number.isSafeInteger(x));
  const base = String(p.base ?? repo).toLowerCase();
  // A head repository GitHub no longer shows (a deleted fork) is a fork too.
  const fork = listedFork || !p.head || String(p.head).toLowerCase() !== base;
  const facts: PullFacts = { repo, number: n, officeMade, fork, closesIssue: closes.includes(issue), merged: p.merged === true };
  if (typeof p.sha === 'string' && /^[0-9a-f]{40}$/i.test(p.sha)) facts.mergeSha = p.sha.toLowerCase();
  const by = p.by;
  if (by && typeof by.login === 'string' && LOGIN.test(by.login) && Number.isSafeInteger(by.id)) {
    facts.mergedBy = { login: by.login, id: by.id as number, type: String(by.type ?? '') };
    // Only a person's permission matters; a bot's merge doesn't pay whatever it may do.
    if (facts.mergedBy.type === 'User') {
      const perm = (await run(['api', `repos/{owner}/{repo}/collaborators/${by.login}/permission`, '--jq', '.permission'], dir).catch(() => 'none')).trim();
      facts.mergerPermission = (PERMISSIONS.has(perm) ? perm : 'none') as PullFacts['mergerPermission'];
    }
  }
  return facts;
}
