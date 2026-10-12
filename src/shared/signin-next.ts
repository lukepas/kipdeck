// Where the sign-in page goes once you're in (login.ts): the page you were sent there from, when it's
// the Deck or one of the inbox's addresses (shared/deeplink.ts), else home. Its own module so the
// sign-in page's rules stay out of what the home page loads up front.

import { DECK_PATH, isDeckPath } from './deck.js';
import { homePath, parseHomePath } from './deeplink.js';

/**
 * Where to go once signed in, from the sign-in page's ?next=: the Deck, an agent or a project
 * (rebuilt from what it parses to, so it can only ever be one of the office's own pages), else home.
 */
export function nextAfterSignIn(next: string | null | undefined): string {
  if (!next) return '/';
  if (isDeckPath(next)) return DECK_PATH;
  let url: URL;
  try {
    url = new URL(next, 'http://x');
  } catch {
    return '/';
  }
  if (url.origin !== 'http://x') return '/';
  const r = parseHomePath(url.pathname, url.search);
  return r ? homePath(r) : '/';
}
