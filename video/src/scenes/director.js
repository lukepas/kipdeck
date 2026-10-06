// Director: maps time to the scene for the beatmap section playing at t, and
// answers per-frame questions the engine asks (motion-blur samples, grain).
// Scene modules register here, one per beatmap section id.

import { actAt } from '../engine/timeline.js';
import { ACT1 } from './act1.js';
import { ACT2 } from './act2.js';
import { ACT3 } from './act3.js';

export function createDirector({ tl }) {
  const scenes = new Map();
  for (const s of [...ACT1, ...ACT2, ...ACT3]) scenes.set(s.id, s);
  const missing = tl.beatmap.sections.filter((s) => !scenes.has(s.id)).map((s) => s.id);
  if (missing.length) throw new Error(`no scene registered for beatmap sections: ${missing.join(', ')}`);

  const sceneAt = (t) => scenes.get(tl.section(t).id);

  return {
    draw(S) {
      S.act = actAt(S.t);
      sceneAt(S.t).draw(S);
    },
    // Sub-frame samples for motion blur. Samples never straddle a scene cut:
    // a cut is a hard cut, so blur is off on the first frame of a section.
    blurSamples(t, shutter) {
      const sec = tl.section(t);
      if (t - sec.from < shutter) return 1;
      const s = sceneAt(t);
      return s.blur ? s.blur(t) : 1;
    },
    // Shutter as a share of the 180-degree default (a scene's shutter(t)).
    shutter(t) {
      const s = sceneAt(t);
      return s.shutter ? s.shutter(t) : 1;
    },
    grainAmount(t) {
      // Grain rises with the track's energy curve, never fully off.
      return 0.7 + 0.6 * tl.energy(t);
    },
  };
}
