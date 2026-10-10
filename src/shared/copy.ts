// The words the office says about itself, in one place: the product's name wherever agents, tools,
// commits and config files see it, where things are in the menu, and the deck's verbs. Server
// strings that reach a toast or a board use these, in plain ASCII with no emoji (tests/copy.test.ts
// checks every string in src/server and src/shared).

/** The product, as people and agents see it. */
export const PRODUCT = 'Kipdeck';
/**
 * One line under the name, the same on every surface: the app's sign-in pages and top bar, the
 * landing page's title, the README, package.json and the installers (tests/one-story.test.ts holds the
 * ones that cannot import it to this exact text).
 */
export const TAGLINE = 'The inbox for your AI coding agents.';
/**
 * What it is in one or two sentences, for the README, package.json and the landing page's share
 * description: control and clarity over every agent, in one place.
 */
export const DESCRIPTION =
  'Full control and clarity over every AI coding agent you run, in one place. See who is waiting on you and for how long, then answer, review and merge without leaving it.';
/**
 * The browser tab's title: "(2) acme-shop - Kipdeck", in plain ASCII, the count left out at zero.
 * `view` names a view other than the inbox: "(2) acme-shop - Deck - Kipdeck" on the Deck.
 */
export function tabTitle(waiting: number, project?: string, view?: string): string {
  return `${waiting > 0 ? `(${waiting}) ` : ''}${project ? `${project} - ` : ''}${view ? `${view} - ` : ''}${PRODUCT}`;
}
/** The command it runs as (agent-office still works, for upstream's scripts). */
export const CLI = 'kipdeck';
/** The public source repository. */
export const REPO_URL = 'https://github.com/zbagdzevicius/kipdeck';
/**
 * Where the full docs are read, linked from the home page's Help: the README, which links every page
 * in docs/. (kipdeck.com is the marketing page, not the docs.)
 */
export const DOCS_URL = `${REPO_URL}#readme`;
/** Where it came from, as the license names it. */
export const UPSTREAM_CREDIT = 'Built on agent-office (AgentSystemLabs / webdevcody), MIT';
/** The same where there is only room for a line of small type (the title block on the deck's floor). */
export const UPSTREAM_CREDIT_SHORT = 'Built on agent-office, MIT';

/** Where things are, as the menu lays them out (src/client/ui/menu.ts). */
export const NAV = {
  signins: 'Menu > Deck > Your sign-ins',
  accounts: 'Menu > Deck > Accounts',
  settings: 'Menu > Deck > Settings',
  decks: 'Menu > Deck > Decks',
  upgrade: 'Menu > Deck > Update Kipdeck',
} as const;

/** Taking a unit off its console, in the deck's words. */
export const STAND_DOWN = { verb: 'stand down', past: 'stood down', label: 'Stand down' } as const;

/** "Ana stood Pixel down: its PR merged", "Pixel stood down: ...". */
export function stoodDown(name: string, why?: string, by?: string): string {
  const head = by ? `${by} stood ${name} down` : `${name} stood down`;
  return why ? `${head}: ${why}` : head;
}
