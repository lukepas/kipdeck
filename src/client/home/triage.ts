// Triage (T, or Triage in Ctrl+K): the inbox one card at a time, in its own attention order (Needs
// you, then To review), answered from the keyboard. An approval takes Y (allow once), A (always allow,
// when it offers a rule) and N (deny); Shift+Y allows the byte-identical call for every agent waiting
// on it. A question read off the terminal takes 1-9 for its choices and R to reply in words. A finished
// change takes M (the merge, held 7 seconds with Undo as from the pane: merge-hold.ts) and S (send
// back). Z snoozes any card for an hour, Enter opens it in the pane, J and K move between cards.
//
// Two guards against the wrong card getting a key: every key is ignored for TRIAGE_ARM_MS after a card
// appears, and allowing a call tagged destructive takes a held key (or a held click), TRIAGE_HOLD_MS.
// The pane behind follows the card on show, so its terminal is the one the question is read from.
// The rules are pure in shared/triage.ts. Loaded through lazy.ts the first time it opens.

import { mergeWords, changeSummary, rowAction } from '../../shared/inbox';
import { readQuestion, type Question } from '../../shared/question';
import { needsHold, nextCardIndex, sameCallRequests, triageArmed, triageCards, triageVerb, TRIAGE_HOLD_MS, TRIAGE_SNOOZE_MS, type TriageCard, type TriageVerb } from '../../shared/triage';
import type { ApprovalView } from '../../shared/protocol';
import { store } from '../state';
import { h, openModal, toast, type Modal } from '../ui/dom';
import type { Actions } from './actions';
import { approvalOf, RISK_LABEL } from './approval';
import * as lazy from './lazy';
import { currentView, entryRef, entryTitle, whereLabel } from './list';
import { inFlight, latestHeld } from './merge-hold';
import { home } from './state';
import './triage.css';

/** How often a question card reads its terminal again (it can still be printing). */
const READ_MS = 700;

let open: Modal | undefined;

/** Every open request, every agent's. */
const allApprovals = (): ApprovalView[] => [...store.approvals.values()].flat();

/** Whether triage is up. */
export const triageOpen = () => !!open;

/** Opens triage on the first card that waits on you (or brings the open one forward). */
export function openTriage(actions: Actions) {
  if (open) return;
  const net = actions.deps.net;
  /** Cards answered or snoozed here, by key, skipped until the office says they've gone. */
  const passed = new Set<string>();
  let cards: TriageCard[] = [];
  let index = 0;
  let shownKey: string | undefined;
  let shownAt = 0;
  let question: Question | undefined;
  let replying = false;
  let hold: { verb: TriageVerb; key?: string; timer: ReturnType<typeof setTimeout> } | undefined;

  const count = h('span.tr-count', { 'aria-live': 'polite' });
  const card = h('section.tr-card', { tabindex: '-1', autofocus: '', 'aria-label': 'The card on show' });
  const reply = h('input.tr-reply-input', { type: 'text', placeholder: 'Type your answer...', 'aria-label': 'Your answer', autocomplete: 'off', enterkeyhint: 'send' }) as HTMLInputElement;
  const replyForm = h('form.tr-reply.hidden', { onsubmit: (ev: Event) => (ev.preventDefault(), sendReply()) }, reply, h('button.btn.primary', { type: 'submit' }, 'Send'));
  const keysRow = h('div.tr-keys', { role: 'group', 'aria-label': 'Keys' });
  const el = h('div.modal.triage', { role: 'dialog', 'aria-label': 'Triage' }, h('header', {}, h('h2', {}, 'Triage'), count), h('div.body', {}, card, replyForm, keysRow));

  const current = (): TriageCard | undefined => cards[index];

  /** The cards now, with the one on show kept in place when it's still there. */
  const refresh = () => {
    const live = new Set<string>();
    cards = triageCards(currentView(), approvalOf, (key, id) => {
      live.add(key);
      return passed.has(key) || inFlight(id);
    });
    // A card the office has dropped can't come back under the same key: forget it.
    for (const k of passed) if (!live.has(k)) passed.delete(k);
    index = nextCardIndex(cards, shownKey, index);
  };

  /** The pane behind follows the card, so its terminal (and a question on it) is this agent's. */
  const follow = (c: TriageCard) => {
    const tab = c.kind === 'review' ? 'changes' : 'terminal';
    if (home.selected !== c.id || home.tab !== tab) home.select(c.id, tab);
  };

  const readScreen = async (): Promise<Question | undefined> => {
    const c = current();
    if (c?.kind !== 'question') return undefined;
    const screen = (await lazy.terminal()).terminalScreen(c.id);
    return screen ? readQuestion(screen) : undefined;
  };

  const keyButton = (keys: string, label: string, verb: TriageVerb, extra: { danger?: boolean; choice?: string } = {}) => {
    const b = h('button.btn.tr-key', { type: 'button', class: extra.danger ? 'danger' : undefined, 'data-verb': verb }, h('kbd', {}, keys), label);
    if (needsHold(verb, current()?.approval?.risks)) {
      b.addEventListener('pointerdown', () => startHold(verb));
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => cancelHold(verb));
      b.title = 'Hold to allow: it is tagged destructive';
    } else b.addEventListener('click', () => run(verb, extra.choice));
    return b;
  };

  const approvalBody = (a: ApprovalView): HTMLElement[] => {
    const same = sameCallRequests(allApprovals(), a).length;
    return [
      h('p.tr-what', {}, a.command ? 'It wants to run this command:' : `It wants to: ${a.title}`),
      ...(a.command ? [h('pre.tr-command', {}, a.command)] : []),
      ...(!a.command && a.paths.length ? [h('ul.tr-paths', {}, ...a.paths.map((p) => h('li', {}, p)))] : []),
      ...(a.risks.length ? [h('p.tr-risks', {}, ...a.risks.map((r) => h('span.ap-risk', { class: `r-${r}` }, RISK_LABEL[r])))] : []),
      ...(same > 1 ? [h('p.tr-same', {}, `${same} agents wait on this same call. Shift+Y allows it for all of them.`)] : []),
      ...(a.risks.includes('destructive') ? [h('p.tr-hold-note', {}, 'Tagged destructive: hold the key to allow it.')] : []),
    ];
  };

  const paint = () => {
    refresh();
    const c = current();
    count.textContent = cards.length ? `${index + 1} of ${cards.length}` : '';
    if (!c) {
      shownKey = undefined;
      replying = false;
      replyForm.classList.add('hidden');
      card.replaceChildren(h('p.tr-empty', {}, 'Nothing waits on you now. Esc closes triage.'));
      keysRow.replaceChildren();
      return;
    }
    if (c.key !== shownKey) {
      // A new card: keys wait TRIAGE_ARM_MS, a half-typed reply and a hold go with the old one.
      shownKey = c.key;
      shownAt = Date.now();
      question = undefined;
      replying = false;
      reply.value = '';
      if (hold) cancelHold(hold.verb);
      card.classList.remove('arming');
      void card.offsetWidth;
      card.classList.add('arming');
      void readScreen().then((q) => {
        if (current()?.key === c.key && q) ((question = q), paint());
      });
    }
    follow(c);
    const e = c.ranked.entry;
    const title = h('div.tr-title', {}, h('h3', {}, entryTitle(e)), h('p', {}, whereLabel(e)));
    let body: HTMLElement[];
    let keys: HTMLElement[];
    if (c.kind === 'approval' && c.approval) {
      body = approvalBody(c.approval);
      keys = [keyButton('Y', 'Allow once', 'once'), ...(c.approval.always ? [keyButton('A', `Always allow ${c.approval.always}`, 'always')] : []), keyButton('N', 'Deny', 'deny', { danger: true })];
      if (sameCallRequests(allApprovals(), c.approval).length > 1) keys.splice(1, 0, keyButton('Shift Y', 'Allow for all', 'same'));
    } else if (c.kind === 'question') {
      const q = question;
      body = [
        h('p.tr-what', {}, 'It asks:'),
        ...(q?.text.length ? q.text.map((l) => h('p.tr-q', {}, l)) : [h('p.tr-q.muted', {}, 'Its question is in the terminal. Press R to reply.')]),
      ];
      keys = [...(q?.choices ?? []).map((ch) => keyButton(ch.key, ch.label, 'choice', { choice: ch.key })), keyButton('R', 'Reply', 'reply')];
    } else if (c.kind === 'review') {
      const facts = [changeSummary(e.work), e.pr ? `PR #${e.pr.number}` : '', e.pr?.conflicting ? 'conflicts' : ''].filter(Boolean).join(' · ');
      body = [h('p.tr-what', {}, 'It is done and waits for your review.'), ...(facts ? [h('p.tr-facts', {}, facts)] : []), h('p.tr-facts', {}, `M: ${mergeWords(e)}.`)];
      keys = [keyButton('M', 'Merge', 'merge'), keyButton('S', 'Send back', 'send-back')];
    } else {
      body = [h('p.tr-what', {}, c.ranked.att.reason ? `${c.ranked.att.label}: ${c.ranked.att.reason}` : c.ranked.att.label)];
      keys = [];
    }
    const hadFocus = el.contains(document.activeElement) && document.activeElement !== reply;
    card.replaceChildren(title, ...body, h('span.tr-hold-bar', { 'aria-hidden': 'true', style: `--hold-ms:${TRIAGE_HOLD_MS}ms` }));
    keysRow.replaceChildren(...keys, keyButton('Enter', 'Open', 'open'), keyButton('Z', 'Snooze 1 h', 'snooze'));
    replyForm.classList.toggle('hidden', !replying);
    if (hadFocus && (!document.activeElement || document.activeElement === document.body)) card.focus();
  };

  /** Marks `c` done here, so the next card shows at once rather than when the office says so. */
  const pass = (...keys: string[]) => {
    keys.forEach((k) => passed.add(k));
    paint();
  };

  const sendable = () => {
    if (net.up) return true;
    toast('Not connected: your answer would go nowhere. It reconnects by itself.', 'warn');
    return false;
  };

  function sendReply() {
    const c = current();
    const text = reply.value.trim();
    if (!c || !text || !sendable()) return;
    net.send({ t: 'worker.prompt', workerId: c.id, prompt: text });
    reply.value = '';
    replying = false;
    card.focus();
    pass(c.key);
  }

  async function pick(c: TriageCard, choice: string) {
    const from = question;
    const now = await readScreen();
    if (current()?.key !== c.key) return;
    if (!from || !now || JSON.stringify(now) !== JSON.stringify(from)) {
      question = now;
      paint();
      return void toast('Its prompt changed: check it again.', 'warn');
    }
    if (!sendable()) return;
    net.send({ t: 'term.input', workerId: c.id, data: choice });
    pass(c.key);
  }

  function run(verb: TriageVerb, choice?: string) {
    const c = current();
    if (verb === 'next' || verb === 'prev') {
      if (!cards.length) return;
      index = Math.max(0, Math.min(cards.length - 1, index + (verb === 'next' ? 1 : -1)));
      // Forgotten, so the card it lands on counts as new: its keys wait TRIAGE_ARM_MS too.
      shownKey = undefined;
      return paint();
    }
    if (verb === 'undo') {
      // The merge taken back comes back on show, so it can be looked at again.
      const held = latestHeld();
      if (!held) return;
      actions.undoMerge(held);
      refresh();
      const back = cards.findIndex((x) => x.id === held);
      if (back >= 0) ((index = back), (shownKey = undefined));
      return paint();
    }
    if (!c) return;
    const e = c.ranked.entry;
    const a = c.approval;
    switch (verb) {
      case 'once':
      case 'always':
      case 'deny':
        if (!a || !sendable()) return;
        net.send({ t: 'approval.answer', id: a.id, decision: verb });
        return pass(c.key);
      case 'same': {
        if (!a || !sendable()) return;
        const all = sameCallRequests(allApprovals(), a);
        net.send({ t: 'approval.answer', id: a.id, decision: 'once', same: true });
        if (all.length > 1) toast(`Allowed for ${all.length} agents: ${a.title}`);
        return pass(...all.map((x) => `a:${x.id}`));
      }
      case 'choice':
        return choice ? void pick(c, choice) : undefined;
      case 'reply':
        replying = true;
        replyForm.classList.remove('hidden');
        return reply.focus();
      case 'merge':
        if (e.pr?.state === 'merged' || actions.merging.has(e.id)) return;
        actions.merge(e);
        return paint();
      case 'send-back':
        return actions.sendBack(e);
      case 'snooze':
        if (!sendable()) return;
        net.send({ t: 'worker.snooze', workerId: e.id, until: Date.now() + TRIAGE_SNOOZE_MS });
        toast(`Snoozed for an hour: ${entryRef(e)}`);
        return pass(c.key);
      case 'open':
        modal.close();
        return actions.act(e, rowAction(c.ranked.att).action);
    }
  }

  function startHold(verb: TriageVerb, key?: string) {
    if (hold || !triageArmed(shownAt, Date.now())) return;
    card.classList.add('holding');
    hold = {
      verb,
      key,
      timer: setTimeout(() => {
        hold = undefined;
        card.classList.remove('holding');
        run(verb);
      }, TRIAGE_HOLD_MS),
    };
  }

  function cancelHold(verb: TriageVerb, key?: string) {
    if (!hold || hold.verb !== verb || (key && hold.key && hold.key.toLowerCase() !== key.toLowerCase())) return;
    clearTimeout(hold.timer);
    hold = undefined;
    card.classList.remove('holding');
  }

  /** Whether a key press is meant for triage: the window on top has it, and it isn't in the reply box. */
  const ours = (ev: KeyboardEvent) => {
    const t = ev.target;
    if (!(t instanceof Node) || !modal.backdrop.contains(t)) return false;
    if (t === reply) return false;
    // A button with the focus does what it says on Enter and Space.
    if (t instanceof HTMLButtonElement && (ev.key === 'Enter' || ev.key === ' ')) return false;
    return !ev.isComposing && !ev.ctrlKey && !ev.metaKey && !ev.altKey;
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' || !ours(ev)) return;
    const c = current();
    const v = triageVerb(ev, c?.kind ?? 'other', { always: !!c?.approval?.always, choices: question?.choices.length ?? 0 });
    if (!v) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.repeat || !triageArmed(shownAt, Date.now(), v.verb)) return;
    if (needsHold(v.verb, c?.approval?.risks)) return startHold(v.verb, ev.key);
    run(v.verb, v.choice);
  };
  const onKeyUp = (ev: KeyboardEvent) => {
    // Let go before the hold ran out: nothing is sent.
    if (!hold?.key || ev.key.toLowerCase() !== hold.key.toLowerCase()) return;
    ev.preventDefault();
    toast('Hold the key to allow a destructive call.', 'warn');
    cancelHold(hold.verb, ev.key);
  };

  const unsubs = [home.on(paint), store.on('approvals', paint), store.on('roster', paint)];
  const timer = setInterval(() => {
    if (current()?.kind !== 'question') return;
    void readScreen().then((q) => {
      if (q && JSON.stringify(q) !== JSON.stringify(question)) ((question = q), paint());
    });
  }, READ_MS);
  const modal = openModal(el, {
    onClose: () => {
      open = undefined;
      if (hold) cancelHold(hold.verb);
      unsubs.forEach((u) => u());
      clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    },
  });
  open = modal;
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  paint();
  card.focus();
}
