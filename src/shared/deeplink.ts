// The inbox's addresses: /a/<project>/<agent> opens one agent (with ?tab=changes or ?tab=log for that
// tab), /p/<project> one project's list, and / everything. The page keeps the address in step with
// what it shows (client/home/route.ts) so Back closes what you opened and a link opens the same
// thing on another device; notifications and the team channel link to an agent the same way. The
// server serves the inbox at these paths, and a sign-in on the way comes back to them.

import { DECK_PATH, isDeckPath } from './deck.js';

export type HomeTab = 'terminal' | 'changes' | 'log';

export type HomeRoute = { kind: 'home' } | { kind: 'project'; project: string } | { kind: 'agent'; project: string; agent: string; tab?: HomeTab };

const TABS: readonly HomeTab[] = ['terminal', 'changes', 'log'];
/** Longest project or agent id an address carries; ids are far shorter. */
const MAX_ID = 128;

/** A path segment back to an id, or undefined when it isn't one (empty, too long, or with a slash in it). */
function idOf(seg: string | undefined): string | undefined {
  if (!seg) return undefined;
  let id: string;
  try {
    id = decodeURIComponent(seg);
  } catch {
    return undefined;
  }
  return id && id.length <= MAX_ID && !/[/\\\0-\x1f]/.test(id) ? id : undefined;
}

/** What an address opens, or undefined when it isn't one of the inbox's. `search` is the query (?tab=...). */
export function parseHomePath(pathname: string, search = ''): HomeRoute | undefined {
  if (pathname === '/' || pathname === '/index.html') return { kind: 'home' };
  const parts = pathname.split('/');
  // ['', 'a', project, agent] or ['', 'p', project], with an optional trailing slash.
  if (parts[parts.length - 1] === '' && parts.length > 2) parts.pop();
  if (parts[0] !== '') return undefined;
  if (parts[1] === 'p' && parts.length === 3) {
    const project = idOf(parts[2]);
    return project ? { kind: 'project', project } : undefined;
  }
  if (parts[1] === 'a' && parts.length === 4) {
    const project = idOf(parts[2]);
    const agent = idOf(parts[3]);
    if (!project || !agent) return undefined;
    const tab = new URLSearchParams(search).get('tab') as HomeTab | null;
    return { kind: 'agent', project, agent, ...(tab && TABS.includes(tab) && tab !== 'terminal' ? { tab } : {}) };
  }
  return undefined;
}

/** The address for a route, path and query. */
export function homePath(r: HomeRoute): string {
  if (r.kind === 'project') return `/p/${encodeURIComponent(r.project)}`;
  if (r.kind === 'agent') return `/a/${encodeURIComponent(r.project)}/${encodeURIComponent(r.agent)}${r.tab && r.tab !== 'terminal' ? `?tab=${r.tab}` : ''}`;
  return '/';
}

/** One agent's address. */
export const agentPath = (project: string, agent: string, tab?: HomeTab): string => homePath({ kind: 'agent', project, agent, tab });

/** Is `path` one of the inbox's deeper addresses (an agent or a project), which the server answers with the inbox? */
export const isDeepHomePath = (path: string): boolean => {
  const r = parseHomePath(path);
  return !!r && r.kind !== 'home';
};

/** The sign-in page for someone signed out who asked for `path` (with `search`): back there afterwards. */
export function signInUrlFor(path: string, search = ''): string {
  if (isDeckPath(path)) return `/login?next=${DECK_PATH}`;
  const r = parseHomePath(path, search);
  return r && r.kind !== 'home' ? `/login?next=${encodeURIComponent(homePath(r))}` : '/login';
}

/** A full link to an agent on an office reached at `base` (https://office.example.com), for messages sent elsewhere. */
export function agentLink(base: string, project: string, agent: string): string {
  return `${base.replace(/\/+$/, '')}${agentPath(project, agent)}`;
}
