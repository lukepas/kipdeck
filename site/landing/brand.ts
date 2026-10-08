// The one place the product's name lives on the landing page. The page title, the Open Graph and
// Twitter tags, the wordmark, every sentence that says the name, the repository every link and
// command points at, and the generated share card all read from here. Swap the name by editing BRANDS, or add
// an entry and pick it at build time with KIPDECK_BRAND=<id> npm run build:site.
//
// tests/landing.test.ts builds the page and checks the old names (Mergeline, UGC Army) appear nowhere.

export interface Brand {
  /** The id KIPDECK_BRAND (or the older MERGELINE_BRAND) selects. */
  id: string;
  /** The name as it is written in a sentence. */
  name: string;
  /** One line under the name. */
  tagline: string;
  /** The wordmark: the lead word in the text color, the second muted (the app's KIP DECK lockup). */
  wordmark: { lead: string; muted: string };
  /** The npm package and the command it will be, once it is published. */
  pkg: string;
  /** The source repository: every Source and Docs link, the clone command, the design-partner
   *  application (a new issue there) and the structured data. KIPDECK_REPO_URL overrides it at build. */
  repo: string;
  /** The folder a clone lands in (the repository's last path segment). */
  folder: string;
  /** The Formation mark's variant: 'formation' (three chevrons) is the only one drawn today. */
  markVariant: 'formation';
  ogTitle: string;
  ogDescription: string;
}

const DESCRIPTION =
  'One inbox for every coding agent you run: Claude Code, Codex, Cursor, OpenCode and Pi. See who is waiting on you and for how long, answer in one box, review and merge. Open source, on your machine.';

export const BRANDS = {
  kipdeck: {
    id: 'kipdeck',
    name: 'Kipdeck',
    tagline: 'The inbox for your AI coding agents.',
    wordmark: { lead: 'KIP', muted: 'DECK' },
    pkg: 'kipdeck',
    repo: 'https://github.com/zbagdzevicius/kipdeck',
    folder: 'kipdeck',
    markVariant: 'formation',
    ogTitle: 'Kipdeck: your agents are waiting on you',
    ogDescription: DESCRIPTION,
  },
} as const satisfies Record<string, Brand>;

export type BrandId = keyof typeof BRANDS;

/** The brand for an id (KIPDECK_BRAND), Kipdeck when it is unset. An unknown id is an error, not a silent default. */
export function brandFor(id: string | undefined): Brand {
  const key = (id ?? '').trim() || 'kipdeck';
  if (!(key in BRANDS)) throw new Error(`KIPDECK_BRAND=${key} is not one of: ${Object.keys(BRANDS).join(', ')}`);
  return BRANDS[key as BrandId];
}
