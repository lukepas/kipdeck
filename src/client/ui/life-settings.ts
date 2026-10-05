// Settings > Bridge > Life: how much the bridge's life moves, and each part of the world outside the
// glass on or off. Full is everything; Calm drops the gestures (an escort's salute, a hail line);
// Silent running stops all ambient life and slows the stars to a crawl. Whatever it says, a unit that
// needs you or is stuck shows at full strength, and life gives way to it.

import './life-settings.css';
import { LIFE_PARTS, type LifeLevel, type LifePart, type Settings, type VoiceMode } from '../state';
import { h } from './dom';
import { choiceRow } from './settings-rows';

const NOTE: Record<LifeLevel, string> = {
  full: 'The bridge lives with the work: the destination ahead grows with real progress, sister decks fly in formation and salute their waypoints, and a fighter patrols for each unit at work.',
  calm: 'The same world with no gestures: no salutes, no hail lines, no patrols, no droid rounds. The picket of open pull requests, the beacons and the droid\'s errands stay.',
  silent: 'Silent running: no ambient life at all, the stars at a crawl, the ticker paused, the droid docked and the ship\'s voice plain. Units that need you or are stuck still show at full strength.',
};

const PARTS: Record<LifePart, [label: string, note: string]> = {
  destination: ['Destination ahead', 'The mission as a world dead ahead, growing with each waypoint and issue closed.'],
  fleet: ['Fleet in formation', 'Every other deck as an escort ship off the side ports, with a beacon when it needs you.'],
  sorties: ['Squadron sorties', 'A fighter for each working unit, and open pull requests holding on the picket ahead.'],
  epithets: ['Crew epithets', 'Titles and chevrons units earn from their real record (the Mechanic, the Night Owl), the Crew tab and the unit of the watch on the Proof plinth. Words only, never a ranking of people.'],
  droid: ['Bridge droid', 'Bolt, a hovering tool-drone that carries finished work to the Review bay in its arm and waits by a unit that needs you. Docks itself with Ship motion Off or Silent running.'],
};

const VOICE_NOTE: Record<VoiceMode, string> = {
  on: 'VESPER, the ship\'s mind, says a dry line now and then about what the crew really did, on the ticker and under the top bar. When a unit needs you it says one plain sentence and goes quiet until that clears.',
  plain: 'VESPER keeps to plain status lines: merges, waypoints and who needs you, without the humour.',
  off: 'VESPER says nothing. The ticker still runs the deck\'s log.',
};

/** The Life rows: the level, and a switch for each part, saved for you in this browser. */
export function lifeSettings(get: () => Settings, change: (some: Partial<Settings>) => void): Node[] {
  const note = h('p.setting-note');
  const paint = () => void (note.textContent = NOTE[get().life]);
  const level = choiceRow<LifeLevel>('Life', [['full', 'Full'], ['calm', 'Calm'], ['silent', 'Silent running']], () => get().life, (life) => {
    change({ life });
    paint();
  });
  paint();
  const parts = LIFE_PARTS.map((part) => {
    const [label, about] = PARTS[part];
    const row = choiceRow<boolean>(label, [[true, 'On'], [false, 'Off']], () => get().lifeParts[part], (on) => change({ lifeParts: { ...get().lifeParts, [part]: on } }));
    return h('div.life-part', {}, h('span.life-part-name', {}, label), row, h('p.setting-note', {}, about));
  });
  const voiceNote = h('p.setting-note');
  const paintVoice = () => void (voiceNote.textContent = VOICE_NOTE[get().voice]);
  const voice = choiceRow<VoiceMode>("Ship's voice", [['on', 'On'], ['plain', 'Plain only'], ['off', 'Off']], () => get().voice, (v) => {
    change({ voice: v });
    paintVoice();
  });
  paintVoice();
  return [level, note, h('div.life-part', {}, h('span.life-part-name', {}, "Ship's voice"), voice, voiceNote), ...parts];
}
