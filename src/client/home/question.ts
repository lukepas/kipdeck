// The question card: when the selected agent needs you, its question sits over its terminal in plain
// words, with one reply box and a button for each choice it offered (shared/question.ts reads them
// off the terminal's screen). Answer, from a row or the keyboard, puts the cursor in the box. The
// terminal stays under it for context; its key strip is folded behind Keys.
//
// A permission request that came through the agent's hook is the Approval card instead (approval.ts).
// This card is the fallback for the rest: a CLI with no permission hook, or a request handed back to
// the terminal. It says it was read off the screen, and a choice is only typed while the screen still
// shows the prompt it was drawn from.

import { looksLikePermission, readQuestion, type Question } from '../../shared/question';
import type { RosterEntry } from '../../shared/protocol';
import type { Net } from '../net';
import { h, toast } from '../ui/dom';
import { answered } from './advance';
import * as lazy from './lazy';
import { home } from './state';
import './question.css';

/** How often the card reads the terminal again while it's up (the question can still be printing). */
const READ_MS = 700;

export interface QuestionCard {
  el: HTMLElement;
  /** Shows the card for `e` when it needs you, or hides it. */
  show(e: RosterEntry | undefined): void;
}

const same = (a?: Question, b?: Question) => JSON.stringify(a) === JSON.stringify(b);

export function questionCard(net: Net): QuestionCard {
  const text = h('div.q-text');
  const choices = h('div.q-choices', { role: 'group', 'aria-label': 'Choices' });
  const input = h('input', { type: 'text', placeholder: 'Type your answer...', 'aria-label': 'Your answer', autocomplete: 'off', enterkeyhint: 'send' }) as HTMLInputElement;
  const send = h('button.btn.primary', { type: 'submit' }, 'Send');
  const form = h('form.q-reply', {}, input, send);
  const heading = h('h3.q-h', {}, 'It asks');
  const source = h('p.q-src.hidden', {}, 'Read off its terminal: check it below before you pick.');
  const el = h('section.q-card.hidden', { 'aria-label': 'Its question' }, heading, text, source, choices, form);
  let workerId: string | undefined;
  let shown: Question | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const paint = (q: Question | undefined) => {
    if (same(q, shown) && text.childElementCount) return;
    shown = q;
    text.replaceChildren(...(q?.text.length ? q.text.map((l) => h('p', {}, l)) : [h('p.q-none', {}, 'Its question is in the terminal below.')]));
    const permission = looksLikePermission(q);
    heading.textContent = permission ? 'Permission, read from the terminal' : 'It asks';
    source.classList.toggle('hidden', !q?.choices.length);
    choices.replaceChildren(...(q?.choices ?? []).map((c) => h('button.btn.q-choice', { type: 'button', onclick: () => void pick(q!, c.key) }, h('kbd', {}, c.key), c.label)));
    choices.classList.toggle('hidden', !q?.choices.length);
  };

  /** What its screen shows now, read again. */
  const current = async (): Promise<Question | undefined> => {
    if (!workerId) return undefined;
    const t = await lazy.terminal();
    const screen = workerId ? t.terminalScreen(workerId) : undefined;
    return screen ? readQuestion(screen) : undefined;
  };

  const read = async () => {
    const q = await current();
    if (q) paint(q);
  };

  /** Types choice `key`, but only while the screen still shows the prompt the button was drawn from. */
  const pick = async (from: Question, key: string) => {
    const id = workerId;
    const now = await current();
    if (!id || id !== workerId || !same(now, from)) {
      if (now) paint(now);
      toast('Its prompt changed: check it again.', 'warn');
      return;
    }
    net.send({ t: 'term.input', workerId: id, data: key });
    answered(id);
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const answer = input.value.trim();
    if (!answer || !workerId) return;
    net.send({ t: 'worker.prompt', workerId, prompt: answer });
    answered(workerId);
    input.value = '';
  });

  return {
    el,
    show(e) {
      const asking = !!e && e.kind === 'agent' && e.status === 'needs_input' && home.tab === 'terminal';
      el.classList.toggle('hidden', !asking);
      el.closest('.pane')?.classList.toggle('asking', asking);
      if (!asking) {
        if (timer) clearInterval(timer);
        timer = undefined;
        workerId = undefined;
        shown = undefined;
        text.replaceChildren();
        return;
      }
      if (workerId !== e.id) {
        workerId = e.id;
        shown = undefined;
        input.value = '';
        paint(undefined);
      }
      timer ??= setInterval(() => void read(), READ_MS);
      void read();
      // Answer asks for the box. The card never takes the keyboard by itself: the inbox's keys (N, /,
      // the arrows) keep working while a question waits.
      if (home.focusReply === e.id) {
        home.focusReply = undefined;
        setTimeout(() => input.focus({ preventScroll: true }), 60);
      }
    },
  };
}
