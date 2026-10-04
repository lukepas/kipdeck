import { store } from '../state';
import type { Voice } from '../voice';
import { $, h } from './dom';
import { whereabouts } from './whereabouts';
import { icon } from './icons';

/** What the people list last showed, so it's only drawn again when something in it changed. */
let peopleKey = '';

/** The people list in the sidebar. Click yourself to change your character, or anyone else to walk over to them. */
export function renderPeople(voice: Voice, onEditProfile: () => void, onWalkTo: (id: string) => void, force = true) {
  const peers = [...store.peers.values()].sort((a, b) => (a.id === store.you ? -1 : b.id === store.you ? 1 : a.name.localeCompare(b.name)));
  // What each of them is up to changes as they walk about (into the meeting room).
  const doing = peers.map((p) => (p.id === store.you ? undefined : whereabouts(p)));
  const key = peers.map((p, i) => `${p.id}|${doing[i] ?? ''}`).join('\n');
  if (!force && key === peopleKey) return;
  peopleKey = key;
  const ul = $('people');
  ul.replaceChildren();
  peers.forEach((p, i) => {
    const you = p.id === store.you;
    const mic = !p.voice ? null : icon(p.muted ? 'mic-off' : 'mic', 13);
    const sub = doing[i];
    const li = h(
      'li',
      { 'data-peer': p.id, class: p.lite && !you ? undefined : 'walk', title: you ? 'Change your character' : p.lite ? `${p.name} is on the 2D view` : `${store.onMyFloor(p) ? 'Walk over to' : 'Go over to'} ${p.name}${sub ? ` (${sub})` : ''}` },
      h('span.dot', { style: `background:${p.color}` }),
      h('span.name', {}, p.name, sub ? h('span.sub', {}, sub) : null),
      p.account ? h('span.acct', { title: `Signed in with ${you ? 'your' : 'their'} own account` }, icon('check', 12)) : null,
      you ? h('span.you', {}, '(you)') : null,
      // Somewhere else in the building: which floor.
      !you && !store.onMyFloor(p) ? h('span.where', { title: 'On another deck' }, store.floors.find((f) => f.id === p.floor)?.name ?? 'lobby') : null,
      p.sharing ? h('span.mic', { title: 'Sharing screen' }, icon('screen', 13)) : null,
      h('span.mic', {}, mic),
    );
    li.addEventListener('click', () => (you ? onEditProfile() : onWalkTo(p.id)));
    ul.append(li);
  });
  $('people-count').textContent = String(peers.length);
  void voice;
}

export function updateSpeaking(voice: Voice) {
  for (const li of document.querySelectorAll<HTMLElement>('#people li[data-peer]')) {
    const lvl = voice.levelOf(li.dataset.peer!);
    li.classList.toggle('speaking', lvl > 0.04);
  }
}
