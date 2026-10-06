// Timeline / sequencer over src/beatmap.json. The beatmap is the clock: scenes
// ask "when did hit X land" and "how far into it are we" rather than hard-coding
// seconds, so a change to the score moves the picture with it.

import { clamp } from './ease.js';

export function createTimeline(beatmap) {
  const byName = new Map();
  const byKind = new Map();
  for (const h of beatmap.hits) {
    if (!byName.has(h.name)) byName.set(h.name, []);
    byName.get(h.name).push(h);
    if (!byKind.has(h.kind)) byKind.set(h.kind, []);
    byKind.get(h.kind).push(h);
  }
  const sortT = (a, b) => a.t - b.t;
  for (const list of byName.values()) list.sort(sortT);
  for (const list of byKind.values()) list.sort(sortT);
  const kicks = [...beatmap.kicks].sort(sortT);
  const beatSec = beatmap.beatSec;
  const fps = beatmap.envelopes.fps;

  function hit(name, index = 0) {
    const list = byName.get(name);
    if (!list || !list[index]) throw new Error(`beatmap has no hit "${name}"[${index}]`);
    return list[index];
  }

  function at(name, index = 0) { return hit(name, index).t; }

  // All hits whose name starts with prefix (e.g. 'milestone.' or 'mark.cell.').
  function prefixed(prefix) {
    return beatmap.hits.filter((h) => h.name.startsWith(prefix)).sort(sortT);
  }

  function kind(k) { return byKind.get(k) || []; }

  // Seconds since the most recent hit in list at or before t (Infinity if none).
  function sinceLast(list, t) {
    let best = -Infinity;
    for (const h of list) { if (h.t <= t + 1e-9) best = h.t; else break; }
    return t - best;
  }

  // Count of hits in list that have landed by t.
  function landed(list, t) {
    let n = 0;
    for (const h of list) { if (h.t <= t + 1e-9) n++; else break; }
    return n;
  }

  // Envelope sample with linear interpolation between frames.
  function envelope(name, t) {
    const values = beatmap.envelopes[name].values;
    const x = clamp(t * fps, 0, values.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = values[i];
    const b = values[Math.min(values.length - 1, i + 1)];
    return a + (b - a) * f;
  }

  function section(t) {
    const s = beatmap.sections;
    for (let i = s.length - 1; i >= 0; i--) if (t >= s[i].from) return s[i];
    return s[0];
  }

  // Beat-grid helpers.
  const beat = (t) => t / beatSec;
  const beatPhase = (t) => { const b = beat(t); return b - Math.floor(b); };
  const sixteenth = (t) => Math.floor(t / beatmap.sixteenthSec + 1e-9);
  const frameOf = (t) => Math.round(t * fps);

  return {
    beatmap, fps, beatSec, kicks,
    hit, at, prefixed, kind, sinceLast, landed, envelope, section,
    beat, beatPhase, sixteenth, frameOf,
    sidechain: (t) => envelope('sidechain', t),
    energy: (t) => envelope('energy', t),
    sinceKick: (t) => sinceLast(kicks, t),
    tileLandings: beatmap.tileLandings,
    columns: beatmap.columns,
    silences: beatmap.silences,
    duration: beatmap.duration,
  };
}

// Acts and scene registry. Scenes register with an id that matches a beatmap
// section; acts group them for the placeholder pass and for --from/--to work.
export const ACTS = [
  { id: 'act-1', title: 'Chaos to clarity', from: 0, to: 10 },
  { id: 'act-2', title: 'The merge', from: 10, to: 20 },
  { id: 'act-3', title: 'Proof and promise', from: 20, to: 30 },
];

export function actAt(t) {
  for (let i = ACTS.length - 1; i >= 0; i--) if (t >= ACTS[i].from) return ACTS[i];
  return ACTS[0];
}
