// Settings > Sound & voice > Sound: the main volume with its mute (Shift+M does the same), and the
// mixer under it, one level for each group of the deck's sound (sound/mix.ts). Dragging a slider turns
// sound back on; letting go of one plays a sample of that group (the ambience you hear as you drag).

import type { SoundGroup, SoundMix } from '../sound';
import type { Settings } from '../state';
import { h } from './dom';
import './sound-settings.css';

/** Each group's row: its name, and what it is. */
export const MIX_ROWS: readonly (readonly [SoundGroup, string, string])[] = [
  ['alerts', 'Alerts', 'Needs you, stuck, ready for review, merged. The loudest group.'],
  ['ui', 'Interface', 'Clicks, and windows opening and closing.'],
  ['ship', 'Ship', 'Your steps and the ladder, seats, Bolt, a payout, the jump.'],
  ['ambience', 'Ambience', "The bridge's hum and the drive's drone aft, placed where they are."],
];

export interface SoundPreview {
  /** Plays a sample of `group` (a cue, a click). */
  sample(group: SoundGroup): void;
}

/** A slider for a 0-1 level, with its percentage beside it. */
function slider(label: string, get: () => number, set: (v: number) => void, dim: () => boolean, done?: () => void) {
  const input = h('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': label });
  const pct = h('span.vol-pct');
  const paint = () => {
    const v = Math.round(get() * 100);
    input.value = String(v);
    input.style.setProperty('--fill', `${v}%`);
    pct.textContent = dim() ? 'Off' : `${v}%`;
  };
  input.addEventListener('input', () => {
    set(Number(input.value) / 100);
    paint();
  });
  if (done) input.addEventListener('change', done);
  return { input, pct, paint };
}

/** The main volume row and the mixer, saved for you in this browser. */
export function soundSettings(get: () => Settings, change: (some: Partial<Settings>) => void, preview: SoundPreview): { main: Node[]; mixer: Node[] } {
  const rows: (() => void)[] = [];
  const paintAll = () => rows.forEach((p) => p());

  const mute = h('button.btn', { type: 'button' });
  const main = slider('Main volume', () => get().volume, (volume) => change({ volume, muted: false }), () => get().muted, () => preview.sample('alerts'));
  const mainRow = h('div.volume', {}, mute, main.input, main.pct);
  const paintMain = () => {
    const muted = get().muted;
    main.paint();
    mute.textContent = muted ? 'Turn on' : 'Turn off';
    mute.setAttribute('aria-pressed', String(muted));
    mute.classList.toggle('primary', muted);
    mainRow.classList.toggle('muted', muted);
  };
  rows.push(paintMain);
  mute.addEventListener('click', () => {
    change({ muted: !get().muted });
    paintAll();
    if (!get().muted) preview.sample('ui');
  });

  const mixer = h('div.mixer', { role: 'group', 'aria-label': 'Mixer' });
  for (const [group, name, what] of MIX_ROWS) {
    const set = (v: number) => change({ mix: { ...get().mix, [group]: v } as SoundMix, muted: false });
    const s = slider(`${name} volume`, () => get().mix[group], set, () => get().muted, group === 'ambience' ? undefined : () => preview.sample(group));
    rows.push(() => {
      s.paint();
      row.classList.toggle('muted', get().muted);
    });
    const row = h('div.mix-row.volume', {}, h('div.mix-name', {}, h('b', {}, name), h('span', {}, what)), s.input, s.pct);
    mixer.append(row);
  }
  // A drag on any slider turns sound back on: the rest repaint with it.
  mixer.addEventListener('input', paintAll);
  mainRow.addEventListener('input', paintAll);
  paintAll();
  return { main: [mainRow], mixer: [mixer] };
}
