// The one place the product's name lives on the landing page. The page title, the Open Graph and
// Twitter tags, the wordmark, every sentence that says the name, the command and the generated
// share card all read from here. Swap the name by editing BRANDS, or pick one at build time:
//
//   MERGELINE_BRAND=ugc-army npm run build:site
//
// tests/landing.test.ts builds the page once per brand and checks the other name appears nowhere.

export interface Brand {
  /** The id MERGELINE_BRAND selects. */
  id: string;
  /** The name as it is written in a sentence. */
  name: string;
  /** One line under the name. */
  tagline: string;
  /** The wordmark: the lead word in the text color, the second muted (the app's MERGE LINE lockup). */
  wordmark: { lead: string; muted: string };
  /** The npm package and the command it will be, once it is published. */
  pkg: string;
  /** The folder a clone lands in, for the from-source command. */
  folder: string;
  /** The Formation mark's variant: 'formation' (three chevrons) is the only one drawn today. */
  markVariant: 'formation';
  ogTitle: string;
  ogDescription: string;
}

const DESCRIPTION =
  'One inbox for every coding agent you run: Claude Code, Codex, Cursor, OpenCode and Pi. See who is waiting on you and for how long, answer in one box, review and merge. Open source, on your machine.';

export const BRANDS = {
  mergeline: {
    id: 'mergeline',
    name: 'Mergeline',
    tagline: 'The inbox for your AI coding agents.',
    wordmark: { lead: 'MERGE', muted: 'LINE' },
    pkg: 'mergeline',
    folder: 'mergeline',
    markVariant: 'formation',
    ogTitle: 'Mergeline: your agents are waiting on you',
    ogDescription: DESCRIPTION,
  },
  'ugc-army': {
    id: 'ugc-army',
    name: 'UGC Army',
    tagline: 'The inbox for your AI coding agents.',
    wordmark: { lead: 'UGC', muted: 'ARMY' },
    pkg: 'ugc-army',
    folder: 'ugc-army',
    markVariant: 'formation',
    ogTitle: 'UGC Army: your agents are waiting on you',
    ogDescription: DESCRIPTION,
  },
} as const satisfies Record<string, Brand>;

export type BrandId = keyof typeof BRANDS;

/** The brand for an id (MERGELINE_BRAND), Mergeline when it is unset. An unknown id is an error, not a silent default. */
export function brandFor(id: string | undefined): Brand {
  const key = (id ?? '').trim() || 'mergeline';
  if (!(key in BRANDS)) throw new Error(`MERGELINE_BRAND=${key} is not one of: ${Object.keys(BRANDS).join(', ')}`);
  return BRANDS[key as BrandId];
}
