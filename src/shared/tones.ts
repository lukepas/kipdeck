// The warm neutrals and the crew's extras as hex, for what cannot read a CSS variable: canvases (the
// Deck's boards, callouts and the 2D plan), the browser's theme-color, and tests. The same values as
// src/client/styles/tokens.css; tests/tones.test.ts fails if the two drift. docs/design.md (Warmth)
// says where each one may go, and docs/voice.md says what the words around them sound like.

/** One set of neutrals: night is the default dark set, day the light "print" set. */
export interface Tones {
  void: string;
  surface1: string;
  surface2: string;
  surface3: string;
  line: string;
  lineStrong: string;
  /** The edge of a field or toggle: 3:1 or more on every surface. */
  lineInput: string;
  text: string;
  muted: string;
  /** Marks and dividers only, never text that carries meaning. */
  faint: string;
  working: string;
  /** Cassette-label ink for warm eyebrows. Never a state. */
  tape: string;
  /** The tape stripe's third line and nothing else. */
  plum: string;
}

export const NIGHT: Tones = {
  void: '#15120f',
  surface1: '#1c1814',
  surface2: '#231e1a',
  surface3: '#2b2520',
  line: '#342d27',
  lineStrong: '#4d443b',
  lineInput: '#7d7266',
  text: '#f2ece3',
  muted: '#a69c8f',
  faint: '#7a7064',
  working: '#d6cdc1',
  tape: '#e6d9c3',
  plum: '#8a6f86',
};

export const DAY: Tones = {
  void: '#f8f4ed',
  surface1: '#fffdf9',
  surface2: '#f1ece3',
  surface3: '#e7e0d5',
  line: '#ded6c9',
  lineStrong: '#c4b9a8',
  lineInput: '#7f7466',
  text: '#1c1814',
  muted: '#5f574d',
  faint: '#8a7f70',
  working: '#5f574d',
  tape: '#6b5a46',
  plum: '#7a5f76',
};

/**
 * The sunset behind Kip, horizon first: apricot, dusty rose, plum, then the void. The landing hero
 * and the sign-in page only, never in the app, never next to a state mark, never under text.
 */
export const SUNSET = ['#f2b48c', '#c47f93', '#4a3560'] as const;
