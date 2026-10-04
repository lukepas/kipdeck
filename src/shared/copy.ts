// The words the office says about itself, in one place: the product's name wherever agents, tools,
// commits and config files see it, where things are in the menu, and the deck's verbs. Server
// strings that reach a toast or a board use these, in plain ASCII with no emoji (tests/copy.test.ts
// checks every string in src/server and src/shared).

/** The product, as people and agents see it. */
export const PRODUCT = 'UGC Army';
/** The command it runs as (agent-office still works, for upstream's scripts). */
export const CLI = 'ugc-army';
/** Where it came from, as the license names it. */
export const UPSTREAM_CREDIT = 'Built on agent-office (AgentSystemLabs / webdevcody), MIT';

/** Where things are, as the menu lays them out (src/client/ui/menu.ts). */
export const NAV = {
  signins: 'Menu > Deck > Your sign-ins',
  accounts: 'Menu > Deck > Accounts',
  settings: 'Menu > Deck > Settings',
  decks: 'Menu > Deck > Decks',
  upgrade: 'Menu > Deck > Update UGC Army',
} as const;

/** Taking a unit off its console, in the deck's words. */
export const STAND_DOWN = { verb: 'stand down', past: 'stood down', label: 'Stand down' } as const;

/** "Ana stood Pixel down: its PR merged", "Pixel stood down: ...". */
export function stoodDown(name: string, why?: string, by?: string): string {
  const head = by ? `${by} stood ${name} down` : `${name} stood down`;
  return why ? `${head}: ${why}` : head;
}
