// Line comments on the diff in the pane's Changes tab: click a line's number to leave a comment on it,
// or Tab to the diff's line numbers, move with the arrow keys (or j and k) and press Enter. Every
// comment on an agent's diff goes with its Send back, each anchored to its file and line (store.ts
// keeps them). The Changes window draws its diff afresh as it changes, so the comments are put back
// under their lines each time.

import { anchor, type LineComment } from '../../../shared/brief/comments';
import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { addComment, commentsOf, onComments, removeComment } from './store';

/** Where a diff line is: its file (the diff's header), its number and side. Undefined for a hunk or note line. */
function lineAt(dl: HTMLElement): Omit<LineComment, 'text'> | undefined {
  if (!dl.matches('.dl.add, .dl.del, .dl.ctx')) return undefined;
  const path = dl.closest('.changes-diff')?.querySelector<HTMLElement>('.dh .path')?.title;
  const [o, n] = [...dl.querySelectorAll('.ln')].map((s) => Number(s.textContent));
  const removed = dl.classList.contains('del');
  const line = removed ? o : n;
  if (!path || !line) return undefined;
  return { path, line, ...(removed ? { removed: true } : {}), code: dl.querySelector('.code')?.textContent ?? '' };
}

const sameLine = (a: Omit<LineComment, 'text'>, b: Omit<LineComment, 'text'>) => a.path === b.path && a.line === b.line && !!a.removed === !!b.removed;

/** The lines a comment can go on, in order. */
const commentable = (lines: HTMLElement) => [...lines.querySelectorAll<HTMLElement>('.dl.add, .dl.del, .dl.ctx')];

/** The number a line is commented by: the new file's, or the old file's for a removed line. */
const numberOf = (dl: HTMLElement): HTMLElement | undefined => dl.querySelectorAll<HTMLElement>('.ln')[dl.classList.contains('del') ? 0 : 1];

/**
 * Makes `dl`'s line number the diff's one stop for the keyboard (a roving tab stop, so a long diff is
 * not hundreds of Tab presses). It handles its own keys: the inbox's j, k and Enter (home/keys.ts)
 * and the Changes window's arrows leave it be.
 */
function cursorOn(lines: HTMLElement, dl: HTMLElement, focus: boolean) {
  const at = lineAt(dl);
  const ln = numberOf(dl);
  if (!at || !ln) return;
  for (const old of lines.querySelectorAll<HTMLElement>('.ln[data-own-keys]')) {
    if (old !== ln) for (const a of ['tabindex', 'role', 'aria-label', 'data-own-keys']) old.removeAttribute(a);
  }
  ln.tabIndex = 0;
  ln.setAttribute('role', 'button');
  ln.setAttribute('data-own-keys', '');
  ln.setAttribute('aria-label', `Comment on ${anchor(at)}. Up and down arrows move between lines.`);
  if (focus) {
    ln.focus({ preventScroll: true });
    ln.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Follows the pane's body for `workerId()`'s diff: a click on a line number (or Enter on it) opens a
 * comment box under that line, and the comments already left are drawn under theirs whenever the
 * diff is drawn again.
 */
export function installComments(body: HTMLElement, workerId: () => string | undefined) {
  const note = (id: string, c: LineComment) =>
    h(
      'div.rb-note',
      { 'data-anchor': anchor(c) },
      icon('chat', 14),
      h('span.rb-note-text', {}, c.text),
      h('button.btn.quiet.rb-note-x', { type: 'button', 'aria-label': `Delete the comment on ${anchor(c)}`, title: 'Delete this comment', onclick: () => removeComment(id, c) }, icon('close', 12)),
    );

  /** Puts each comment under its line in the diff on screen, and takes away the ones deleted. */
  const decorate = () => {
    const id = workerId();
    const lines = body.querySelector<HTMLElement>('.diff-lines');
    if (!lines) return;
    lines.querySelectorAll('.rb-note').forEach((n) => n.remove());
    // A diff drawn afresh: its first line is where the keyboard comes in.
    if (!lines.querySelector('.ln[data-own-keys]')) {
      const first = commentable(lines)[0];
      if (first) cursorOn(lines, first, false);
    }
    if (!lines.dataset.keys) {
      lines.dataset.keys = '1';
      lines.addEventListener('keydown', (ev) => onLineKey(lines, ev));
    }
    if (!id) return;
    const comments = commentsOf(id);
    if (!comments.length) return;
    for (const dl of lines.querySelectorAll<HTMLElement>('.dl')) {
      const at = lineAt(dl);
      if (!at) continue;
      const c = comments.find((x) => sameLine(x, at));
      if (c) dl.after(note(id, c));
    }
  };

  const compose = (dl: HTMLElement) => {
    const id = workerId();
    const at = lineAt(dl);
    if (!id || !at) return;
    body.querySelector('.rb-compose')?.remove();
    const existing = commentsOf(id).find((x) => sameLine(x, at));
    const ta = h('textarea', { rows: 2, placeholder: `Comment on ${anchor(at)}...`, 'aria-label': `Comment on ${anchor(at)}` }) as HTMLTextAreaElement;
    ta.value = existing?.text ?? '';
    /** Closes the box, and puts the keyboard back on its line when it was in the box. */
    const close = () => {
      const had = box.contains(document.activeElement);
      box.remove();
      const lines = dl.closest<HTMLElement>('.diff-lines');
      if (had && lines && dl.isConnected) cursorOn(lines, dl, true);
    };
    const save = () => {
      const text = ta.value.trim();
      close();
      if (text) addComment(id, { ...at, text });
      else if (existing) removeComment(id, existing);
    };
    const box = h(
      'form.rb-compose',
      {},
      ta,
      h('div.rb-compose-acts', {}, h('span.grow', {}, 'Enter to save · goes with Send back'), h('button.btn', { type: 'button', onclick: close }, 'Cancel'), h('button.btn.primary', { type: 'submit' }, 'Comment')),
    );
    box.addEventListener('submit', (ev) => {
      ev.preventDefault();
      save();
    });
    ta.addEventListener('keydown', (ev) => {
      // What is typed here is the comment: the Changes window's j, k and arrows (which pick another
      // file) must not see it.
      ev.stopPropagation();
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault();
        save();
      }
    });
    // Left empty (Esc goes back to the list): it closes by itself.
    ta.addEventListener('blur', () => setTimeout(() => !ta.value.trim() && !box.contains(document.activeElement) && box.remove(), 150));
    (dl.nextElementSibling?.classList.contains('rb-note') ? dl.nextElementSibling : dl).after(box);
    ta.focus();
  };

  /** The keys on the diff's line number: move to another line, or comment on this one. */
  const onLineKey = (lines: HTMLElement, ev: KeyboardEvent) => {
    const ln = ev.target as HTMLElement;
    if (ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey || !ln.matches?.('.ln[data-own-keys]')) return;
    const dl = ln.closest<HTMLElement>('.dl');
    const all = commentable(lines);
    const i = dl ? all.indexOf(dl) : -1;
    if (!dl || i < 0) return;
    const to = (j: number) => cursorOn(lines, all[Math.max(0, Math.min(all.length - 1, j))], true);
    if (ev.key === 'ArrowDown' || ev.key === 'j') to(i + 1);
    else if (ev.key === 'ArrowUp' || ev.key === 'k') to(i - 1);
    else if (ev.key === 'Home') to(0);
    else if (ev.key === 'End') to(all.length - 1);
    else if (ev.key === 'Enter' || ev.key === ' ') compose(dl);
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  };

  body.addEventListener('click', (ev) => {
    const ln = (ev.target as HTMLElement).closest?.('.diff-lines .dl .ln');
    const dl = ln?.closest<HTMLElement>('.dl');
    if (dl) compose(dl);
  });
  // The diff is drawn again when its file changes or another file is picked: comments go back under their lines.
  new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n instanceof HTMLElement && (n.matches('.diff-lines, .desk-changes') || !!n.querySelector?.('.diff-lines'))))) decorate();
  }).observe(body, { childList: true, subtree: true });
  onComments(decorate);
}
