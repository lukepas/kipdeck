// The question card: when the selected agent needs you, its question sits over its terminal in plain
// words, with one reply box and a button for each choice it offered (shared/question.ts reads them
// off the terminal's screen). Answer, from a row or the keyboard, puts the cursor in the box. The
// terminal stays under it for context; its key strip is folded behind Keys.

import { readQuestion, type Question } from '../../shared/question';
import type { RosterEntry } from '../../shared/protocol';
import type { Net } from '../net';
import { h } from '../ui/dom';
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
  const el = h('section.q-card.hidden', { 'aria-label': 'Its question' }, h('h3.q-h', {}, 'It asks'), text, choices, form);
  let workerId: string | undefined;
  let shown: Question | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const paint = (q: Question | undefined) => {
    if (same(q, shown) && text.childElementCount) return;
    shown = q;
    text.replaceChildren(...(q?.text.length ? q.text.map((l) => h('p', {}, l)) : [h('p.q-none', {}, 'Its question is in the terminal below.')]));
    choices.replaceChildren(
      ...(q?.choices ?? []).map((c) =>
        h('button.btn.q-choice', { type: 'button', onclick: () => workerId && net.send({ t: 'term.input', workerId, data: c.key }) }, h('kbd', {}, c.key), c.label),
      ),
    );
    choices.classList.toggle('hidden', !q?.choices.length);
  };

  const read = async () => {
    if (!workerId) return;
    const t = await lazy.terminal();
    const screen = workerId ? t.terminalScreen(workerId) : undefined;
    if (screen) paint(readQuestion(screen));
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const answer = input.value.trim();
    if (!answer || !workerId) return;
    net.send({ t: 'worker.prompt', workerId, prompt: answer });
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
