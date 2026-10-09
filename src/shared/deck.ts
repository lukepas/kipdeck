// The Deck: the 3D view of the same agents the inbox lists, a page of its own. Its address is /deck;
// /bridge, its old one, still lands there (http/routes/pages.ts), so links, bookmarks and wall
// displays from before keep working. One place for both, for the server's sign-in redirect and the
// pages that send you back after signing in.

/** Where the Deck is. */
export const DECK_PATH = '/deck';

/** Where the Deck used to be: still answered, with a redirect to DECK_PATH. */
export const OLD_DECK_PATH = '/bridge';

/** Is `path` the Deck, by its name now or its old one? */
export const isDeckPath = (path: string): boolean => path === DECK_PATH || path === OLD_DECK_PATH;

/** The sign-in page, coming back to the Deck afterwards when that's where `path` was. */
export const loginUrlFor = (path: string): string => (isDeckPath(path) ? `/login?next=${DECK_PATH}` : '/login');
