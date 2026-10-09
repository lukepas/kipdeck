// The one place the product's name lives on the landing page. The page title, the Open Graph and
// Twitter tags, the wordmark, every sentence that says the name, the repository every link and
// command points at, and the generated share card all read from here. Swap the name by editing BRANDS, or add
// an entry and pick it at build time with KIPDECK_BRAND=<id> npm run build:site.
//
// tests/landing.test.ts builds the page and checks no other product name appears.

import { DESCRIPTION as COPY_DESCRIPTION, TAGLINE } from '../../src/shared/copy.ts';

export interface Brand {
  /** The id KIPDECK_BRAND selects. */
  id: string;
  /** The name as it is written in a sentence. */
  name: string;
  /** One line under the name. */
  tagline: string;
  /** The wordmark: the lead word in the text color, the second muted (the app's KIP DECK lockup). */
  wordmark: { lead: string; muted: string };
  /** The npm package and the command it will be, once it is published. */
  pkg: string;
  /** The source repository: every Source and Docs link, the clone command and the structured data.
   *  KIPDECK_REPO_URL overrides it at build. */
  repo: string;
  /** Where people reach the team: the design-partner application (a mailto: link) and the footer.
   *  It has to work for someone outside the repository, which may be private. */
  contact: string;
  /** The folder a clone lands in (the repository's last path segment). */
  folder: string;
  /** The Formation mark's variant: 'formation' (three chevrons) is the only one drawn today. */
  markVariant: 'formation';
  ogTitle: string;
  ogDescription: string;
}

// The tagline and the description are the app's (src/shared/copy.ts), so the page, the app and the
// README say the same thing. The page adds which agents run and where.
const DESCRIPTION = `${COPY_DESCRIPTION} Claude Code, Codex and Cursor CLI, with OpenCode and Pi in beta. Open source, on your machine.`;

export const BRANDS = {
  kipdeck: {
    id: 'kipdeck',
    name: 'Kipdeck',
    tagline: TAGLINE,
    wordmark: { lead: 'KIP', muted: 'DECK' },
    pkg: 'kipdeck',
    repo: 'https://github.com/zbagdzevicius/kipdeck',
    // Founder TODO: confirm this mailbox receives mail; it is the default until a real address is chosen.
    contact: 'hello@kipdeck.com',
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
