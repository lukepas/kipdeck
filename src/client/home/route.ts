// The inbox's address follows what it shows (shared/deeplink.ts): /a/<project>/<agent> while an agent
// is open, /p/<project> while the list is filtered to one project, / otherwise. Opening an agent or a
// project adds a history entry, so the browser's Back (a phone's back gesture) closes it again, and
// the pane's own Back button is that same step back. The pane opening one by itself on a wide screen,
// a tab switch, and arriving at an address only replace the entry. An address opened from a link,
// a notification or another device opens that agent once the office has sent its agents.

import { homePath, parseHomePath, type HomeRoute } from '../../shared/deeplink';
import { store } from '../state';
import { toast } from '../ui/dom';
import { home } from './state';

/** How long an address waits for its agent or project to show up before it says it isn't there. */
const WAIT_MS = 8_000;

/** What history entries this page pushed carry: the address it was opened from. */
interface Pushed {
  kipdeck: true;
  from: string;
}

const here = () => location.pathname + location.search;

/** What the inbox shows now, as a route. */
export function routeNow(): HomeRoute {
  const e = home.selected && home.paneOpen ? store.rosterEntry(home.selected) : undefined;
  if (e) return { kind: 'agent', project: e.floor, agent: e.id, tab: home.tab };
  if (home.project) return { kind: 'project', project: home.project };
  return { kind: 'home' };
}

/** The address without its query: a different one is a different place, the same one only another tab. */
const place = (path: string) => path.split('?')[0];

export function installRoutes() {
  /** An address still waiting for what it names to arrive. */
  let pending: HomeRoute | undefined;
  /** Changes made to follow the address (arriving, Back) never push an entry of their own. */
  let following = false;

  const sync = () => {
    if (pending || following) return;
    const path = homePath(routeNow());
    const now = here();
    if (path === now) return;
    const state = history.state as Pushed | null;
    // Closing what an entry of ours opened: step back to where it was opened from, as Back would.
    if (!path.startsWith('/a/') && state?.kipdeck && state.from === path) return history.back();
    const push = !home.auto && place(path) !== place(now);
    home.auto = false;
    if (push) history.pushState({ kipdeck: true, from: now } satisfies Pushed, '', path);
    else history.replaceState(state, '', path);
  };

  /** Shows what `r` names, if it's there yet: true once done (or given up on). */
  const apply = (r: HomeRoute): boolean => {
    following = true;
    try {
      if (r.kind === 'home') {
        home.held = true;
        if (home.selected) home.select(undefined);
        if (home.project) home.setProject('');
        return true;
      }
      if (r.kind === 'project') {
        if (!store.floors.some((f) => f.id === r.project)) return false;
        home.held = true;
        if (home.selected) home.select(undefined);
        if (home.project !== r.project) home.setProject(r.project);
        return true;
      }
      const e = store.rosterEntry(r.agent);
      if (!e) return false;
      // Filtered to another project: widen to its project so its row is in the list too.
      if (home.project && home.project !== e.floor) home.setProject(e.floor);
      home.select(e.id, r.tab ?? (e.status === 'done' && e.work?.files ? 'changes' : 'terminal'));
      return true;
    } finally {
      following = false;
    }
  };

  /** Follows the address: now if it can, else once the office has sent what it names. */
  const follow = (r: HomeRoute | undefined) => {
    pending = undefined;
    if (!r || apply(r)) return sync();
    pending = r;
    setTimeout(() => {
      if (pending !== r) return;
      pending = undefined;
      toast(r.kind === 'agent' ? "That agent isn't here any more. It may have been archived." : "That project isn't open in this Kipdeck.", 'warn');
      sync();
    }, WAIT_MS);
  };

  const retry = () => {
    if (pending && apply(pending)) {
      pending = undefined;
      sync();
    }
  };

  window.addEventListener('popstate', () => follow(parseHomePath(location.pathname, location.search) ?? { kind: 'home' }));
  store.on('roster', retry);
  store.on('floors', retry);
  home.on(sync);
  // Arriving at / asks for nothing: the pane may open the oldest waiting agent by itself as usual.
  const first = parseHomePath(location.pathname, location.search);
  follow(first?.kind === 'home' ? undefined : first);
}
