/**
 * The window primitive behind openModal (dom.ts): a native <dialog> opened with showModal(), so the
 * page behind it is inert and Tab and Shift+Tab stay inside it. Here are the rules it keeps: the name a
 * screen reader hears (its first h2, else its aria-label), where focus goes when it opens, where it
 * goes back to when it closes, and the toasts riding on top of the topmost window so they stay seen
 * and heard. No three.js and nothing of the office: the home page loads it up front.
 */

/** The ARIA attributes a window's content carries for itself that belong on the <dialog> around it. */
const MOVED = ['role', 'aria-label', 'aria-labelledby', 'aria-describedby'] as const;

/** The form controls initial focus goes to before the ✕. */
const CONTROLS = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

let titles = 0;

/**
 * Makes `dlg` the dialog for `content`: aria-modal, the content's dialog role and labels moved onto it
 * (so there is one dialog, not one inside another), and a name from the content's first h2 (given an
 * id if it has none), else from its aria-label. A content with a role of its own (a menu) keeps it.
 * Returns what puts the content's attributes back, for when it leaves the window (Mission control
 * docks the same panel beside the view).
 */
export function nameDialog(dlg: HTMLElement, content: HTMLElement): () => void {
  dlg.setAttribute('aria-modal', 'true');
  const role = content.getAttribute('role');
  const own = role !== null && role !== 'dialog' && role !== 'alertdialog';
  const saved = new Map<string, string>();
  if (!own) {
    for (const a of MOVED) {
      const v = content.getAttribute(a);
      if (v === null) continue;
      saved.set(a, v);
      content.removeAttribute(a);
      if (a !== 'role' || v === 'alertdialog') dlg.setAttribute(a, v);
    }
  }
  if (!dlg.hasAttribute('aria-labelledby')) {
    const title = content.querySelector('h2');
    if (title) {
      if (!title.id) title.id = `dlg-title-${++titles}`;
      dlg.setAttribute('aria-labelledby', title.id);
    } else if (own && content.getAttribute('aria-label')) dlg.setAttribute('aria-label', content.getAttribute('aria-label')!);
  }
  return () => saved.forEach((v, a) => content.setAttribute(a, v));
}

/**
 * Puts focus inside a window that just opened: on its first [autofocus], else its first form control,
 * else its ✕. One that isn't showing (in a Settings pane you aren't on) or can't take focus is passed over. When
 * none takes it, focus stays where showModal() put it. A window that focuses something itself right
 * after (a palette's input, a terminal) still has the last word.
 */
export function focusInside(content: HTMLElement): HTMLElement | null {
  const tries = [...content.querySelectorAll<HTMLElement>('[autofocus]'), ...content.querySelectorAll<HTMLElement>(CONTROLS), ...content.querySelectorAll<HTMLElement>('.close')];
  for (const el of tries) {
    // Not one in a pane that isn't showing: the browser would take it, then drop it to <body> a frame later.
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue;
    el.focus();
    if (document.activeElement === el) return el;
  }
  return null;
}

/** What Tab stops on. */
const TABBABLE = 'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]';

/** The elements in `root` Tab stops on, in order: enabled, showing, and not taken out with tabindex="-1". */
export function tabStops(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(ok);
}

function ok(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled || el.getAttribute('tabindex') === '-1' || el.getAttribute('type') === 'hidden') return false;
  return typeof el.checkVisibility !== 'function' || el.checkVisibility();
}

/**
 * Tab on the last stop in a window goes round to the first, and Shift+Tab on the first to the last,
 * so focus stays inside rather than leaving for the browser's toolbar. From outside every stop (on
 * the window itself, or nothing), Tab goes to the first and Shift+Tab to the last.
 */
export function wrapTab(dialog: HTMLElement, e: { shiftKey: boolean; preventDefault(): void }) {
  const stops = tabStops(dialog);
  if (!stops.length) return;
  const at = stops.indexOf(document.activeElement as HTMLElement);
  const to = e.shiftKey ? (at <= 0 ? stops[stops.length - 1] : null) : at === -1 || at === stops.length - 1 ? stops[0] : null;
  if (!to) return;
  e.preventDefault();
  to.focus();
}

/**
 * Where focus goes back to when a window closes: the element that had it when the window opened, if
 * it's still on the page. Not when the window was opened from mouse-look on the Deck (the Deck takes
 * the mouse back itself, see input/focus.ts), and not when focus is somewhere else already (a window
 * under the top one closing, or one that closed to open the next) rather than in this window or on
 * nothing.
 */
export function restoreTarget(opener: Element | null, ctx: { inMouseLook: boolean; dialog: Element; active: Element | null; body: Element | null }): HTMLElement | null {
  if (ctx.inMouseLook || !opener || !opener.isConnected || typeof (opener as HTMLElement).focus !== 'function') return null;
  const focusHere = !ctx.active || ctx.active === ctx.body || ctx.dialog.contains(ctx.active);
  return focusHere ? (opener as HTMLElement) : null;
}

/** Where the toasts live when no window is open, to go back to. */
let toastsHome: { parent: Node; next: Node | null } | null = null;

/**
 * Keeps the toasts (#toasts) on top: inside `top`, the topmost window, while one is open (the page
 * behind a modal dialog is inert, so toasts left there would sit under it and go unheard), and back in
 * their place on the page when none is. Called on every open and close.
 */
export function liftToasts(top: HTMLElement | null) {
  const toasts = document.getElementById('toasts');
  if (!toasts) return;
  if (!top) {
    if (toastsHome && toasts.parentNode !== toastsHome.parent) toastsHome.parent.insertBefore(toasts, toastsHome.next?.parentNode === toastsHome.parent ? toastsHome.next : null);
    toastsHome = null;
    return;
  }
  if (toasts.parentNode === top) return;
  if (!toastsHome) toastsHome = { parent: toasts.parentNode!, next: toasts.nextSibling };
  top.append(toasts);
}
