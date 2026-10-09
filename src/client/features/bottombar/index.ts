/**
 * The bottom bar under the deck: the mission strip on the left (features/mission fills it), the keys
 * worth knowing as small chips in the middle ("Click to look around" until the view is yours, N next,
 * G overview, Tab menu), and the chat folded to a "T Chat" chip on the right that opens into the chat's
 * input. The Units rail's fold button and its rail live here too: it folds to call signs, and folds by
 * itself for a merge beat so the units behind it are in view.
 */
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { $, h } from '../../ui/dom';
import { storageKey } from '../../shared/storage-key';
import { store } from '../../state';
import { onMinute, paintWait } from '../../ui/waitclock';
import { NEXT_NOBODY, nextWord } from './nextword';

const FOLD_KEY = storageKey('rail-folded');
/** How long the rail stays folded for a merge beat (ms), unless you open it again. */
const BEAT_FOLD_MS = 7000;

export type BottomBarParts = Pick<Parts, 'waiting' | 'overview' | 'hud'>;

export function installBottomBar(ctx: Ctx, parts: BottomBarParts) {
  const key = (k: string, word: string, title: string, run?: () => void, cls = '') =>
    h('button.bb-key', { type: 'button', class: cls, 'data-key': k, title, onclick: run }, h('kbd', {}, k), h('span.kw', {}, word));
  // Shown by the crosshair (core/hintbar.ts) only while a click would take the view.
  const look = h('span.bb-key.look.hidden', { id: 'bb-look', role: 'status' }, h('kbd', {}, 'Click'), h('span.kw', {}, 'to look around'));
  // N says who it goes to next and how long they have waited (nextword.ts), kept up as the roster
  // changes, as each press moves the round on and as the minutes pass (the clocks' shared minute).
  const nKey = key('N', NEXT_NOBODY, 'Go to the next agent waiting on you (N)', () => parts.waiting.goToNextWaiting());
  const nWho = nKey.querySelector<HTMLElement>('.kw')!;
  const nWait = h('span.kw.bb-wait');
  nKey.append(nWait);
  const paintNext = () => {
    const word = nextWord(store.ranked(store.floor), Date.now(), parts.waiting.peekNext());
    if (nWho.textContent !== word.who) nWho.textContent = word.who;
    nWait.hidden = !word.wait;
    if (word.wait) paintWait(nWait, word.wait, word.tone);
  };
  store.on('roster', paintNext);
  parts.waiting.onNextMoved(paintNext);
  onMinute(paintNext);
  $('bb-keys').replaceChildren(
    look,
    nKey,
    key('G', 'overview', 'The whole deck from above (G)', () => parts.overview.toggle()),
    key('Tab', 'menu', 'Everything else (Tab)', () => parts.hud.hud.toggleMenu()),
  );

  // The chat, folded: a chip that opens its input. Esc or sending folds it again (features/chat).
  const chat = $('chat');
  const input = $('chat-input') as HTMLInputElement;
  const open = key('T', 'Chat', 'Say something to everyone on the deck (T)', () => {
    chat.classList.add('peek');
    input.focus();
  }, 'chat-btn');
  chat.append(h('div.chat-row', {}, input, open));

  // The rail: folded to its call signs by you (remembered here), or for a merge beat for a while.
  const rail = $('rail');
  const fold = $('rail-fold');
  let mine = false;
  try {
    mine = localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    // storage blocked: open
  }
  let beatUntil = 0;
  const paint = () => {
    const folded = mine || Date.now() < beatUntil;
    rail.classList.toggle('folded', folded);
    fold.setAttribute('aria-expanded', String(!folded));
    fold.title = folded ? 'Open the rail' : 'Fold the rail to call signs';
  };
  fold.addEventListener('click', () => {
    mine = !(mine || Date.now() < beatUntil);
    beatUntil = 0;
    try {
      localStorage.setItem(FOLD_KEY, mine ? '1' : '0');
    } catch {
      // storage blocked: for this page only
    }
    paint();
  });
  const beat = () => {
    beatUntil = Date.now() + BEAT_FOLD_MS;
    paint();
    setTimeout(paint, BEAT_FOLD_MS + 50);
  };
  ctx.messages.on('landed', (m) => {
    if (m.kind === 'merged') beat();
  });
  ctx.messages.on('bounty.paid', beat);
  paint();
  paintNext();
}
