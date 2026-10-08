// The words the office says about itself, in one place: the product's name wherever agents, tools,
// commits and config files see it, where things are in the menu, and the deck's verbs. Server
// strings that reach a toast or a board use these, in plain ASCII with no emoji (tests/copy.test.ts
// checks every string in src/server and src/shared).

/** The product, as people and agents see it. */
export const PRODUCT = 'Kipdeck';
/** The command it runs as (agent-office still works, for upstream's scripts). */
export const CLI = 'kipdeck';
/**
 * Where the full docs are read, linked from the home page's Help: the product's site. The docs/
 * folder lives with the source. TODO(founder): kipdeck.com has no site yet and its DNS sits on the
 * registrar's suspension nameservers, which usually means the registrant email or ICANN verification
 * is not done. Finish that before the landing page goes there, or the domain may lapse.
 */
export const DOCS_URL = 'https://kipdeck.com';
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
