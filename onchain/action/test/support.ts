// Stand-ins for the tests: a GitHub that answers from memory, pull requests, inputs and keys.
import { keypairFromSeed, type Keypair, type Permission } from '../../solana/sdk/src/index.js';
import { GitHubError, type GitHubUser, type Pull } from '../src/github.js';
import { readInputs, type Env } from '../src/inputs.js';

export const REPO = 'acme/widgets';
export const kp = (n: number): Keypair => keypairFromSeed(new Uint8Array(32).fill(n));
export const attester = kp(1);
export const approver = kp(2);
export const funder = kp(3);
export const author = kp(4);
export const stranger = kp(5);

export const maintainer: GitHubUser = { login: 'maint', id: 4242, type: 'User' };
export const contributor: GitHubUser = { login: 'Dev-One', id: 777, type: 'User' };

/** A pull request merged by the maintainer from a branch of REPO, closing #12. */
export function mergedPull(over: Partial<Pull> = {}): Pull {
  return {
    number: 31,
    state: 'closed',
    merged: true,
    merge_commit_sha: 'ab'.repeat(20),
    merged_by: maintainer,
    merged_at: '2026-10-04T10:00:00Z',
    created_at: '2026-10-03T09:00:00Z',
    user: contributor,
    body: 'Adds the widget.\n\nCloses #12',
    html_url: `https://github.com/${REPO}/pull/31`,
    base: { ref: 'main', sha: 'base0000', repo: { full_name: REPO } },
    head: { ref: 'feature', repo: { full_name: REPO, fork: false } },
    ...over,
  };
}

/** A GitHub that answers from memory, and remembers what was asked. */
export class FakeGitHub {
  pulls = new Map<number, Pull>();
  permissions = new Map<string, Permission>();
  files = new Map<string, string>();
  comments: { issue: number; body: string }[] = [];
  asked: string[] = [];

  async pull(n: number): Promise<Pull> {
    this.asked.push(`pull ${n}`);
    const p = this.pulls.get(n);
    if (!p) throw new GitHubError(`GitHub answered 404 to GET /repos/${REPO}/pulls/${n}`, 404);
    return p;
  }

  async permission(login: string): Promise<Permission> {
    this.asked.push(`permission ${login}`);
    const p = this.permissions.get(login);
    if (!p) throw new GitHubError('GitHub answered 404', 404);
    return p;
  }

  async file(path: string, ref: string): Promise<string | undefined> {
    this.asked.push(`file ${path}@${ref}`);
    return this.files.get(`${path}@${ref}`);
  }

  async comment(issue: number, body: string): Promise<void> {
    this.comments.push({ issue, body });
  }
}

/** A GitHub with one merged pull request, the maintainer's write access and the author's wallet listed. */
export function github(pull = mergedPull()): FakeGitHub {
  const g = new FakeGitHub();
  g.pulls.set(pull.number, pull);
  g.permissions.set(maintainer.login, 'write');
  g.files.set(`.github/bounty-wallets.json@${pull.base.sha}`, JSON.stringify({ 'dev-one': author.publicKey }));
  return g;
}

export const keyJson = (k: Keypair) => JSON.stringify([...k.secretKey]);

/** The inputs a workflow would pass, as INPUT_ variables. */
export function env(over: Record<string, string> = {}): Env {
  const base: Record<string, string> = { 'github-token': 'ghs_test', approver: approver.publicKey, 'attester-key': keyJson(attester), ...over };
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [`INPUT_${k.toUpperCase()}`, v]));
}

export const inputs = (over: Record<string, string> = {}) => readInputs(env(over), () => {});

export const closedEvent = (n = 31) => ({ eventName: 'pull_request', event: { action: 'closed', pull_request: { number: n } }, repo: REPO });

export function quietLog() {
  const lines: string[] = [];
  return { lines, log: { info: (l: string) => lines.push(l), notice: (l: string) => lines.push(`notice: ${l}`), warning: (l: string) => lines.push(`warning: ${l}`) } };
}
