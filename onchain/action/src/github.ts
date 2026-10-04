// The few GitHub REST calls the action makes, over fetch with the workflow's token. The fetch and the
// API base are injectable, so the tests answer them without a network.
import type { Permission } from '../../solana/sdk/src/index.js';

export interface GitHubUser {
  login: string;
  id: number;
  type: string;
}

/** The fields of a pull request the action reads. */
export interface Pull {
  number: number;
  state: string;
  merged: boolean;
  merge_commit_sha: string | null;
  merged_by: GitHubUser | null;
  merged_at: string | null;
  created_at: string;
  user: GitHubUser | null;
  body: string | null;
  html_url: string;
  base: { ref: string; sha: string; repo: { full_name: string } };
  /** null when the fork it came from was deleted. */
  head: { ref: string; repo: { full_name: string; fork: boolean } | null };
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface GitHubOptions {
  token: string;
  /** "owner/name". */
  repo: string;
  /** GITHUB_API_URL (GitHub Enterprise has its own). */
  apiUrl?: string;
  fetch?: typeof fetch;
}

const PERMISSIONS: readonly Permission[] = ['admin', 'maintain', 'write', 'triage', 'read', 'none'];

export class GitHub {
  private readonly api: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private o: GitHubOptions) {
    this.api = (o.apiUrl ?? 'https://api.github.com').replace(/\/+$/, '');
    this.fetchImpl = o.fetch ?? fetch;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.api}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.o.token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'agent-office-bounty-action',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new GitHubError(`GitHub answered ${res.status} to ${method} ${path}`, res.status);
    return (await res.json()) as T;
  }

  pull(number: number): Promise<Pull> {
    return this.call('GET', `/repos/${this.o.repo}/pulls/${number}`);
  }

  /**
   * What `login` may do on the repository. GitHub's `role_name` says maintain and triage too, and a
   * custom role's name is something else, in which case its base `permission` is what counts.
   */
  async permission(login: string): Promise<Permission> {
    const r = await this.call<{ permission?: string; role_name?: string }>('GET', `/repos/${this.o.repo}/collaborators/${encodeURIComponent(login)}/permission`);
    const role = r.role_name as Permission;
    if (PERMISSIONS.includes(role)) return role;
    return PERMISSIONS.includes(r.permission as Permission) ? (r.permission as Permission) : 'none';
  }

  /** A file's text at `ref`, or undefined when it isn't there. */
  async file(path: string, ref: string): Promise<string | undefined> {
    try {
      const r = await this.call<{ content?: string; encoding?: string; type?: string }>('GET', `/repos/${this.o.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
      if (r.type !== 'file' || r.encoding !== 'base64' || typeof r.content !== 'string') return undefined;
      return Buffer.from(r.content, 'base64').toString('utf8');
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return undefined;
      throw err;
    }
  }

  async comment(issue: number, body: string): Promise<void> {
    await this.call('POST', `/repos/${this.o.repo}/issues/${issue}/comments`, { body });
  }
}
