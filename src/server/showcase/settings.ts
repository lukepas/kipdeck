// ⚙️ Settings for the public showcase (/pom/): off until an admin turns it on, and an admin's choice
// of how each repository shows there (full, redacted or hidden) over the defaults (see
// shared/showcase.ts: public ones in full, everything else redacted). Kept in the office's data
// folder through the state-file helpers.
import path from 'node:path';
import { REPO_VISIBILITIES, type RepoVisibility } from '../../shared/showcase.js';
import { readStateJson, writeState } from '../safefs.js';

export interface ShowcaseSaved {
  enabled: boolean;
  repos: Record<string, RepoVisibility>;
  by?: string;
  at?: number;
}

const REPO = /^[a-z0-9_.-]{1,100}\/[a-z0-9_.-]{1,100}$/;
/** Repositories an admin may set a choice for. */
const REPOS_KEPT = 200;

const isVisibility = (v: unknown): v is RepoVisibility => REPO_VISIBILITIES.includes(v as RepoVisibility);

/** Settings as read back or sent: anything that doesn't fit is left as it was. */
export function cleanShowcase(raw: unknown, base: ShowcaseSaved = { enabled: false, repos: {} }): ShowcaseSaved {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: ShowcaseSaved = { ...base, repos: { ...base.repos } };
  if (typeof r.enabled === 'boolean') out.enabled = r.enabled;
  if (r.repos && typeof r.repos === 'object') {
    for (const [k, v] of Object.entries(r.repos as Record<string, unknown>)) {
      const repo = k.toLowerCase();
      if (!REPO.test(repo)) continue;
      if (v === null) delete out.repos[repo];
      else if (isVisibility(v) && (repo in out.repos || Object.keys(out.repos).length < REPOS_KEPT)) out.repos[repo] = v;
    }
  }
  if (typeof r.by === 'string') out.by = r.by.slice(0, 64);
  if (typeof r.at === 'number' && Number.isFinite(r.at)) out.at = r.at;
  return out;
}

export class ShowcaseSettings {
  private saved: ShowcaseSaved;
  private file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'showcase.json');
    let raw: unknown;
    try {
      raw = readStateJson(this.file);
    } catch {
      // a broken file means the defaults: off
    }
    this.saved = cleanShowcase(raw);
  }

  get(): ShowcaseSaved {
    return structuredClone(this.saved);
  }

  /** Admins' changes (the caller checks). */
  set(patch: unknown, by: string) {
    const p = (patch ?? {}) as Record<string, unknown>;
    this.saved = cleanShowcase({ enabled: p.enabled, repos: p.repos, by, at: Date.now() }, this.saved);
    try {
      writeState(this.file, JSON.stringify(this.saved, null, 2));
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}
