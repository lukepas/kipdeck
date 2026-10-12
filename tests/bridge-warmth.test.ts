// The Deck in the crew look (docs/design.md, Warmth): the 3D deck's neutrals are warm graphite at the
// luminance the slate had, Day repaints exactly those, the boards paint with the DOM's tones, the room's
// fill and lamps are warm while the starlight stays cool, the boards' headers are tape labels, and the
// start of watch greets the crew in plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NIGHT } from '../src/shared/tones.ts';
import { DECK } from '../src/client/world/office/materials.js';
import { DAY_PALETTE, LIGHT_MODES } from '../src/client/features/lights/modes.js';
import { INK, TAPE_LABEL } from '../src/client/features/boards/screen.js';
import { PANEL } from '../src/client/features/boards/world.js';
import { welcomeLine } from '../src/client/features/launch/logic.js';
import { conditionLine } from '../src/shared/shiplog.js';
import { crewLine } from '../src/shared/launch.js';

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Warm: red over green over blue, the way graphite and paper lean, never the slate's blue. */
const warm = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return r >= g && g >= b && r > b;
};
const chroma = (hex: string) => {
  const c = rgb(hex);
  return (Math.max(...c) - Math.min(...c)) / 255;
};

/** The deck's neutrals: everything in DECK that is not a state's hue or the instruments' cyan. */
const NEUTRALS = ['void', 'floor', 'gridMinor', 'gridMajor', 'wall', 'wallReveal', 'console', 'consoleTop', 'steel', 'steelLight', 'unit', 'text', 'muted', 'line', 'hull', 'hullSeam', 'instrument'] as const;

test("the deck's neutrals are warm graphite, low in chroma, so no grey is read as a state", () => {
  for (const k of NEUTRALS) {
    assert.ok(warm(DECK[k]), `DECK.${k} ${DECK[k]} leans warm`);
    assert.ok(chroma(DECK[k]) < 0.12, `DECK.${k} ${DECK[k]} stays near grey`);
  }
  assert.equal(DECK.text.toLowerCase(), NIGHT.text);
  assert.equal(DECK.muted.toLowerCase(), NIGHT.muted);
  assert.equal(DECK.working.toLowerCase(), NIGHT.working);
});

test('Day repaints exactly the deck neutrals that have a Day colour, into warm greys', () => {
  const night = new Set(NEUTRALS.map((k) => DECK[k].toLowerCase()));
  for (const [from, to] of Object.entries(DAY_PALETTE)) {
    assert.ok(night.has(from), `${from} is one of the deck's Night neutrals`);
    assert.ok(warm(to) && chroma(to) < 0.12, `Day's ${to} is a warm grey`);
  }
  for (const k of ['floor', 'gridMinor', 'gridMajor', 'wall', 'wallReveal', 'console', 'consoleTop', 'steel', 'line', 'hullSeam'] as const) {
    assert.ok(DAY_PALETTE[DECK[k].toLowerCase()], `Day has a colour for DECK.${k}`);
  }
});

test("the boards paint with the DOM's warm tones, and their headers are tape labels", () => {
  assert.equal(INK.text, NIGHT.text);
  assert.equal(INK.muted, NIGHT.muted);
  assert.equal(INK.card, NIGHT.surface1);
  assert.equal(INK.line, NIGHT.line);
  assert.equal(INK.tape, NIGHT.tape);
  assert.equal(PANEL.text, NIGHT.text);
  assert.equal(PANEL.bg, NIGHT.void);
  assert.equal(PANEL.working, NIGHT.working);
  // The lighter muted for distance sits between muted and working.
  const [m, w, d] = [NIGHT.muted, NIGHT.working, INK.dim].map((c) => rgb(c)[1]);
  assert.ok(d > m && d < w);
  assert.equal(TAPE_LABEL.track, 0.12);
  // The state hues did not move.
  assert.deepEqual([PANEL.signal, PANEL.stuck, PANEL.review, PANEL.proof, PANEL.settled], ['#FF6A1A', '#FF4D5E', '#F5C542', '#A68BFF', '#3DDC97']);
});

test("Night's room is lit warm from inside and cool from the stars", () => {
  const n = LIGHT_MODES.night;
  for (const [what, c] of [['sky fill', n.hemi.sky], ['ground', n.hemi.ground], ['aft fill', n.fill.color], ['pods', n.pods.color], ['table', n.table.color]] as const) {
    assert.ok(warm(c), `the ${what} ${c} is warm`);
  }
  for (const [what, c] of [['key', n.key.color], ['rim', n.rim.color]] as const) {
    const [r, , b] = rgb(c);
    assert.ok(b > r, `the ${what} ${c} is the cool starlight`);
  }
});

test('the bridge sheets that went warm write no hex of their own', () => {
  for (const sheet of ['../src/client/features/launch/watchlog.css', '../src/client/features/moments/card.css']) {
    const css = readFileSync(path.join(import.meta.dirname, sheet), 'utf8');
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, sheet);
  }
  const hud = readFileSync(path.join(import.meta.dirname, '../src/client/styles/hud.css'), 'utf8');
  assert.match(hud, /\.topbar::after \{[^}]*var\(--tape-stripe\)/, 'the Deck top bar carries the tape stripe');
  // The still card (reduced motion, Ship motion Off, Silent running) carries the same greeting as a tape label.
  const card = readFileSync(path.join(import.meta.dirname, '../src/client/features/moments/card.css'), 'utf8');
  assert.match(card, /\.moment-card-eyebrow \{[^}]*var\(--label-font\)[^}]*var\(--label-track\)[^}]*uppercase[^}]*var\(--tape\)/, 'the still card greets in the tape label');
  const launch = readFileSync(path.join(import.meta.dirname, '../src/client/features/launch/index.ts'), 'utf8');
  assert.match(launch, /eyebrow: waiting \? undefined : hello/, 'no greeting on the still card while someone waits');
  assert.match(launch, /if \(cards\.card\?\.eyebrow && parts\.giveWay\.attention\(\)\) cards\.plain\(\);\n\s*if \(phase === 'idle'\) return;/, 'a call while the still card is up takes its greeting off at once');
});

test('screen readers hear the facts before the greeting (docs/voice.md, fact first)', () => {
  const src = (f: string) => readFileSync(path.join(import.meta.dirname, f), 'utf8');
  const log = src('../src/client/features/launch/watchlog.ts');
  assert.match(log, /h\('div\.watch-eyebrow', \{ hidden: true, 'aria-hidden': 'true' \}\)/, 'the log glass greeting is not read on its own');
  assert.match(log, /setAttribute\('aria-label', `\$\{head\}\. \$\{body\}\$\{hello\}`\)/, 'the log is read first, the greeting last');
  const card = src('../src/client/features/moments/card.ts');
  assert.match(card, /h\('p\.moment-card-eyebrow', \{ hidden: true, 'aria-hidden': 'true' \}\)/, 'the still card greeting is not read before its title');
  assert.match(card, /this\.title, this\.body, this\.voice, this\.eyebrowSaid, close/, 'the greeting is read after the card body');
  assert.match(card, /plain\(\) \{[\s\S]*?eyebrow: undefined \};[\s\S]*?this\.eyebrow\.hidden = true;[\s\S]*?this\.eyebrowSaid\.textContent = '';\n  \}/, 'plain() drops the greeting, seen and heard');
});

test('the start of watch greets the crew: aboard the first time, the night shift late, else back', () => {
  assert.equal(welcomeLine({ first: true, hour: 23 }), 'Welcome aboard');
  assert.equal(welcomeLine({ first: false, hour: 23 }), 'Night shift');
  assert.equal(welcomeLine({ first: false, hour: 4 }), 'Night shift');
  assert.equal(welcomeLine({ first: false, hour: 5 }), 'Welcome back');
  assert.equal(welcomeLine({ first: false, hour: 21 }), 'Welcome back');
  for (const hour of [0, 6, 12, 22]) assert.doesNotMatch(welcomeLine({ first: hour === 0, hour }), /[!]|\bcaptain\b/i);
});

test('the Deck names agents, never units, in its band and its log', () => {
  const lines = [
    conditionLine('amber', { waiting: 1, stuck: 0 }),
    conditionLine('amber', { waiting: 2, stuck: 0 }),
    conditionLine('red', { waiting: 0, stuck: 2 }),
    conditionLine('amber', { waiting: 0, stuck: 0, reminder: 'needs-input-long' }),
    crewLine({ review: 0, idle: 0, aboard: 0 }),
    crewLine({ review: 2, idle: 1, aboard: 4 }),
    crewLine({ review: 0, idle: 0, aboard: 4 }),
  ];
  for (const l of lines) {
    assert.doesNotMatch(l, /\bunits?\b|\bstand(ing)? down\b|\borders\b/i, l);
    assert.doesNotMatch(l, /!/, l);
  }
});
