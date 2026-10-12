import { icon } from './icons';
import { ago } from '../../shared/rowtext';
import { focusInside, liftToasts, nameDialog, restoreTarget, wrapTab } from './dialog';

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | number | null | undefined | false;

/** Tiny hyperscript helper: h('div.card', { onclick }, 'text', child) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K | `${K}.${string}`, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name) as HTMLElementTagNameMap[K];
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = `${el.className} ${v}`.trim();
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

// ------------------------------------------------------------------------------------------------

export interface Modal {
  el: HTMLElement;
  backdrop: HTMLElement;
  /** What having it open says you're doing, under your name tag (see PeerInfo.doing). */
  doing?: string;
  /** You're reading while it's open: the bookshelf shows who else is (see PeerInfo.reading). */
  reading?: boolean;
  /**
   * A panel docked beside the view (Mission control docked): on the stack, so pointer lock and what
   * teammates see agree that a window is open, but it doesn't take the view's keys (see viewKeysHeld).
   */
  side?: boolean;
  close(): void;
}

const stack: Modal[] = [];
const listeners = new Set<(open: boolean) => void>();
const doingListeners = new Set<() => void>();

export function onModalChange(fn: (open: boolean) => void) {
  listeners.add(fn);
}

export function modalOpen(): boolean {
  return stack.length > 0;
}

/**
 * Whether a window holds the view's own keys (G, N, Tab...): any window on the stack but a side panel.
 * With only a docked panel open the view keeps its keys, and the panel takes the ones it uses first
 * (it handles them in the capture phase and calls preventDefault), so `e` says which it took.
 */
export function viewKeysHeld(e?: { defaultPrevented: boolean }): boolean {
  return stack.some((m) => !m.side) || (stack.length > 0 && !!e?.defaultPrevented);
}

/** What the open windows say you're doing: the topmost one that says anything (a merge dialog over a PR is still "reading PR #12"). */
export function doingNow(): string | undefined {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].doing) return stack[i].doing;
  return undefined;
}

/** Whether a window you're reading in is open (see Modal.reading). */
export function readingNow(): boolean {
  return stack.some((m) => m.reading);
}

/** Hears when an open window changes what it says you're doing (see setDoing). */
export function onDoingChange(fn: () => void) {
  doingListeners.add(fn);
}

/** Changes what an open window says you're doing, like the doc you turned to on the bookshelf. */
export function setDoing(modal: Modal, doing: string | undefined) {
  if (modal.doing === doing) return;
  modal.doing = doing;
  doingListeners.forEach((fn) => fn());
}

/**
 * Opens a modal. Esc closes it unless `escCloses` is false (for dialogs you mustn't skip), and so
 * does a ✕ in its top right corner unless `closeButton` is false (it follows `escCloses`). `doing`
 * is what teammates see under your name tag while it's open, like "reading PR #12", and `reading`
 * puts an open book in your character's hands. `onClose` hears whether it was the Esc key.
 *
 * The window is a native <dialog> opened with showModal() (ui/dialog.ts has its rules): the page
 * behind is inert, Tab stays inside, it has aria-modal and a name, focus goes inside on open and back
 * to what had it on close. A `side` panel is a plain element instead, and leaves the page live.
 */
export function openModal(content: HTMLElement, opts: { escCloses?: boolean; onClose?: (byEsc: boolean) => void; backdropCloses?: boolean; closeButton?: boolean; doing?: string; reading?: boolean; dock?: HTMLElement; side?: boolean } = {}): Modal {
  if (opts.dock) return dockModal(content, opts.dock, opts);
  const modalWindow = !opts.side;
  const backdrop = modalWindow ? (h('dialog.backdrop', {}) as HTMLDialogElement) : h('div.backdrop', {});
  const unname = modalWindow ? nameDialog(backdrop, content) : () => {};
  backdrop.append(content);
  const root = document.getElementById('modal-root')!;
  // What had focus, and whether the Deck had the mouse, before the window and its listeners took them.
  const opener = document.activeElement;
  const inMouseLook = !!document.pointerLockElement;
  let closed = false;
  let byEsc = false;
  const onTop = () => stack[stack.length - 1] === modal;
  const onKey = (e: KeyboardEvent) => {
    if (!onTop()) return;
    if (e.key === 'Escape' && opts.escCloses !== false) {
      // Stop it here so the Esc that closes a terminal isn't also typed into it.
      e.preventDefault();
      e.stopPropagation();
      byEsc = true;
      modal.close();
    }
  };
  // Once whatever has focus has had the key (a terminal takes Tab and Esc itself): an Esc for a window
  // Esc mustn't close is cancelled, so the browser doesn't close the <dialog> on its own (see the
  // cancel and close events below), and Tab off either end goes round to the other, not out to the
  // browser's toolbar.
  const onKeyAfter = (e: KeyboardEvent) => {
    if (!onTop() || e.defaultPrevented) return;
    if (e.key === 'Escape' && opts.escCloses === false) e.preventDefault();
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) wrapTab(backdrop, e);
  };
  const modal: Modal = {
    el: content,
    backdrop,
    doing: opts.doing,
    reading: opts.reading,
    side: opts.side,
    close() {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(modal);
      if (i >= 0) stack.splice(i, 1);
      liftToasts(topWindow());
      const back = restoreTarget(opener, { inMouseLook, dialog: backdrop, active: document.activeElement, body: document.body });
      backdrop.remove();
      unname();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keydown', onKeyAfter);
      back?.focus({ preventScroll: true });
      opts.onClose?.(byEsc);
      listeners.forEach((fn) => fn(stack.length > 0));
    },
  };
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop && opts.backdropCloses !== false) modal.close();
  });
  if (opts.closeButton ?? opts.escCloses !== false) addCloseButton(content, () => modal.close());
  // A window you have to answer (neither Esc nor a ✕ puts it away) carries the Signal rule on top.
  if (opts.escCloses === false && !opts.closeButton && content.classList.contains('modal')) content.classList.add('blocking');
  window.addEventListener('keydown', onKey, true);
  stack.push(modal);
  root.append(backdrop);
  if (modalWindow) {
    const dlg = backdrop as HTMLDialogElement;
    // The browser's own Esc (a close request): handled here, so the stack and onClose always hear it.
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (opts.escCloses === false || !onTop()) return;
      byEsc = true;
      modal.close();
    });
    // Closed by the browser after all (it closes on a second Esc it wasn't allowed to cancel).
    dlg.addEventListener('close', () => {
      if (closed) return;
      if (opts.escCloses === false && dlg.isConnected) return dlg.showModal();
      byEsc = true;
      modal.close();
    });
    window.addEventListener('keydown', onKeyAfter);
    dlg.showModal();
    liftToasts(dlg);
    // Once the caller has finished setting the window up (Settings picks its pane after this returns),
    // unless it put focus somewhere of its own choosing meanwhile.
    const shown = document.activeElement;
    queueMicrotask(() => {
      if (!closed && (document.activeElement === shown || !dlg.contains(document.activeElement))) focusInside(content);
    });
  }
  listeners.forEach((fn) => fn(true));
  return modal;
}

/** The topmost window that is a dialog (not a side panel), for the toasts to ride on. */
function topWindow(): HTMLElement | null {
  for (let i = stack.length - 1; i >= 0; i--) if (!stack[i].side) return stack[i].backdrop;
  return null;
}

/**
 * A window put in a pane of the page (`dock`) instead of over it: the home page's terminal and Changes
 * tabs. It isn't on the stack of windows, so Esc, closeAllModals() and the windows over it leave it
 * be; whoever docked it closes it (or docks another in its place) and the pane gives it its frame.
 */
function dockModal(content: HTMLElement, dock: HTMLElement, opts: { onClose?: (byEsc: boolean) => void; doing?: string; reading?: boolean }): Modal {
  const backdrop = h('div.docked', {}, content);
  content.classList.add('in-dock');
  dock.replaceChildren(backdrop);
  let closed = false;
  return {
    el: content,
    backdrop,
    doing: opts.doing,
    reading: opts.reading,
    close() {
      if (closed) return;
      closed = true;
      backdrop.remove();
      opts.onClose?.(false);
    },
  };
}

/** The ✕ for a window that didn't bring its own: at the end of its header, or else on its top right corner. */
function addCloseButton(content: HTMLElement, close: () => void) {
  if (content.querySelector('.close')) return;
  const x = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: close }, icon('close', 16));
  const header = content.querySelector(':scope > header');
  if (header) return header.append(x);
  x.classList.add('corner');
  content.append(x);
}

export function closeAllModals() {
  while (stack.length) stack[stack.length - 1].close();
}

/** What a proof toast adds under its sentence: the transaction or attestation in mono, where it settled and a link to see it there. */
export interface ToastProof {
  /** The transaction signature or attestation id, shortened here to its ends. */
  hash?: string;
  /** Where it settled, after the tick: "devnet", "Base Sepolia". */
  settled?: string;
  /** A testnet explorer page for it. */
  href?: string;
}

/** A hash cut to its ends, `4kQm...9xPa`, for a mono chip. */
export const shortHash = (hash: string) => (hash.length > 12 ? `${hash.slice(0, 4)}...${hash.slice(-4)}` : hash);

/** A toast's level: its stripe, its glyph and its color. */
export type ToastLevel = 'info' | 'warn' | 'error' | 'proof' | 'needs-you' | 'shipped';
const TOAST_GLYPH = { info: 'info', warn: 'review', error: 'stuck', proof: 'merged', 'needs-you': 'needs-you', shipped: 'check' } as const;

/**
 * A toast, in the one stack top right under the bar: a 3px stripe and a glyph in its level's color,
 * one sentence, and how long ago in mono from the deck's one clock (shared/rowtext.ts). A proof toast
 * (violet) also shows the hash, a settled tick and an explorer link, and stays up longer so there is
 * time to click it. `opts.ms` keeps one up longer, `opts.onclick` makes it a way to go somewhere.
 */
export function toast(text: string, level: ToastLevel = 'info', proof?: ToastProof, opts: { ms?: number; onclick?: () => void; sub?: string } = {}): HTMLElement {
  const now = Date.now();
  const at = h('time.toast-at', { datetime: new Date(now).toISOString() }, ago(0));
  const trail = proof
    ? h(
        'span.toast-proof',
        {},
        proof.hash ? h('code', {}, shortHash(proof.hash)) : null,
        proof.settled ? h('span.settled', {}, `settled on ${proof.settled}`) : null,
        proof.href ? h('a', { href: proof.href, target: '_blank', rel: 'noopener noreferrer' }, 'View') : null,
      )
    : null;
  const el = h(
    'div.toast',
    { class: `${level}${opts.onclick ? ' go' : ''}`, role: level === 'error' || level === 'needs-you' ? 'alert' : 'status' },
    h('span.toast-icon', { 'aria-hidden': 'true' }, icon(TOAST_GLYPH[level], 14)),
    h('span.toast-text', {}, text, opts.sub ? h('small', {}, opts.sub) : null),
    at,
    trail,
  );
  if (opts.onclick) el.addEventListener('click', opts.onclick);
  document.getElementById('toasts')!.append(el);
  setTimeout(
    () => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    },
    opts.ms ?? (proof ? 8000 : 3500),
  );
  return el;
}


export function timeAgo(iso: string | number): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** `text` cut to at most `max` characters, with an ellipsis when it was longer. */
export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export const STATUS_LABEL: Record<string, string> = {
  starting: 'starting',
  idle: 'idle',
  working: 'working',
  needs_input: 'needs you',
  done: 'done',
  exited: 'exited',
  offline: 'asleep',
};
