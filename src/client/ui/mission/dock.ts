// Mission control docked: a 400px panel down the right of the deck, under the top bar, with no dim, so
// you can triage from the list while the deck reacts. The panel stays up while you look around: a
// click on the deck hands the mouse and keys back to the game (the panel keeps updating), and a click
// on the panel, or I, takes them again. Docked or floating, the ✕ and Esc go through the same window
// close as any other, so you're straight back in mouse-look with no extra click.
//
// The window takes its place on the modal stack (ui/dom.ts) through a stand-in that draws nothing, so
// "a window is open" means the same everywhere (pointer lock, what teammates see you doing), while the
// panel itself lives outside the backdrop and isn't dimmed. The stand-in is a side panel: the deck's
// own keys (G, N, Tab) keep working beside it, the panel taking only the keys it uses. Narrow screens
// float it.

import { h, openModal, toast, type Modal } from '../dom';
import { icon } from '../icons';
import { stillNow } from '../../motion';

export type DockMode = 'float' | 'dock';

/** Where the mode is remembered, per browser. */
export const DOCK_KEY = 'agent-office.mission-dock';
/** Below this many CSS pixels wide, a docked panel would crowd the deck: it floats instead. */
export const DOCK_MIN_WIDTH = 900;

type Read = Pick<Storage, 'getItem'>;
type Write = Pick<Storage, 'setItem'>;

/** The mode remembered, 'float' when there's none, it's nonsense, or storage is blocked. */
export function readDockMode(storage: Read | undefined): DockMode {
  try {
    return storage?.getItem(DOCK_KEY) === 'dock' ? 'dock' : 'float';
  } catch {
    return 'float';
  }
}

/** Remembers the mode; blocked storage just forgets it. */
export function saveDockMode(storage: Write | undefined, mode: DockMode): void {
  try {
    storage?.setItem(DOCK_KEY, mode);
  } catch {
    // private window or blocked site data: the mode lasts as long as the page
  }
}

/** Whether the window docks: asked for, and the screen is wide enough. */
export function dockedNow(mode: DockMode, width: number): boolean {
  return mode === 'dock' && width >= DOCK_MIN_WIDTH;
}

type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

/** FLIP: what takes the window from where it is now (`last`) back to where it was (`first`), or null when it hasn't moved. */
export function flipFrom(first: Box, last: Box): { dx: number; dy: number; sx: number; sy: number } | null {
  if (!last.width || !last.height || !first.width || !first.height) return null;
  const f = { dx: first.left - last.left, dy: first.top - last.top, sx: first.width / last.width, sy: first.height / last.height };
  const still = Math.abs(f.dx) < 1 && Math.abs(f.dy) < 1 && Math.abs(f.sx - 1) < 0.01 && Math.abs(f.sy - 1) < 0.01;
  return still ? null : f;
}

/** This browser's storage, or none where reading it throws. */
function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Less motion, asked for by the system or by Ship motion at Off (motion.ts). */
const calm = () => stillNow();

/** Plays the window from `first` to where it is now, over 240ms. */
function flip(el: HTMLElement, first: Box) {
  if (typeof el.animate !== 'function' || calm()) return;
  const f = flipFrom(first, el.getBoundingClientRect());
  if (!f) return;
  el.animate([{ transformOrigin: '0 0', transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.sx}, ${f.sy})` }, { transformOrigin: '0 0', transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2, .8, .2, 1)' });
}

let dockedOpen = false;
/** How wide a docked panel is (px, mission.css's .mc-dock-host). */
export const DOCK_WIDTH = 400;
/**
 * Tells the page's CSS how much of the deck's right side a docked panel covers (--dock-right), so
 * what sits bottom right (the selected unit's card, the bottom bar) moves left of it instead of under it.
 */
function claimRight(px: number) {
  document.documentElement.style.setProperty('--dock-right', `${px}px`);
}
/** Whether Mission control is open and docked: what it does next to it (Locate) can leave it up. */
export function missionDocked(): boolean {
  return dockedOpen;
}

/** Mission control's window, floating or docked. */
export interface Shell {
  /** Takes the keys and the mouse (puts it on the modal stack), docked or not. */
  engage(): void;
  /** Whether it has the keys: on the stack, and no other window over it. */
  onTop(): boolean;
  /** Whether it has the keys or is the top window; a docked one that let go of them doesn't. */
  engaged(): boolean;
  docked(): boolean;
  /** Dock it, or float it again; remembered. */
  toggle(): void;
  /** Puts it away for good, by the ✕ or Esc. */
  close(): void;
}

/**
 * Puts `el` (a .modal with a header) up, docked or floating as last chosen, with a Dock/Float button
 * and the ✕ at the end of its header. `onEnd` runs once when it's put away for good.
 */
export function mountShell(el: HTMLElement, opts: { doing: string; onEnd(): void }): Shell {
  let mode = readDockMode(storage());
  let isDocked = dockedNow(mode, window.innerWidth);
  let m: Modal | null = null;
  /** Set around closes made here that aren't the end (switching modes, letting go of the keys). */
  let quiet = false;
  /** Set once it's being put away for good. */
  let ending = false;
  let host: HTMLElement | null = null;
  /** What stands on the modal stack for a docked panel: it draws nothing. */
  const proxy = h('div.mc-dock-proxy');

  const modeBtn = h('button.btn.small.mc-dock-btn', { type: 'button', onclick: () => shell.toggle() }) as HTMLButtonElement;
  const x = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => shell.close() }, icon('close', 16));
  el.querySelector(':scope > header')?.append(modeBtn, x);

  function paint() {
    modeBtn.textContent = mode === 'dock' ? 'Float' : 'Dock';
    modeBtn.title = mode === 'dock' ? 'Float it in the middle again (D)' : 'Dock it to the right, the deck stays in view (D)';
    modeBtn.setAttribute('aria-pressed', String(mode === 'dock'));
    // Too narrow to dock: no button that would do nothing you could see (D says why).
    modeBtn.hidden = window.innerWidth < DOCK_MIN_WIDTH;
    el.classList.toggle('docked', isDocked);
    // Docked but the deck has the keys: its tabs dim, so 1-5 not switching them is no surprise.
    el.classList.toggle('mc-keys-away', isDocked && !m);
    dockedOpen = isDocked && !ending;
    claimRight(dockedOpen ? DOCK_WIDTH : 0);
  }

  function onClose() {
    if (quiet) return;
    m = null;
    // Something else put the windows away (a row's action opening a terminal, a ride to another deck):
    // docked, the panel stays up and keeps watching.
    if (isDocked && !ending) return;
    end();
  }

  /** Onto the modal stack, in the layout it's in now. */
  function put() {
    if (isDocked) {
      host ??= h('div.mc-dock-host');
      if (el.parentElement !== host) host.append(el);
      // Just before the windows, in their stacking context: a window or the menu opened over it is on
      // top, rather than tucked under a panel that sits over the whole view.
      const windows = document.getElementById('modal-root');
      if (!host.isConnected) windows ? windows.before(host) : document.body.append(host);
      // Under the view's top bar, however tall it is (the 3D office's, the 2D view's).
      const bar = document.querySelector('.topbar, .lite-bar');
      if (bar) host.style.top = `${Math.max(0, Math.round(bar.getBoundingClientRect().bottom))}px`;
      m = openModal(proxy, { escCloses: false, closeButton: false, doing: opts.doing, onClose, side: true });
      m.backdrop.classList.add('mc-dock-backdrop');
    } else {
      host?.remove();
      m = openModal(el, { escCloses: false, closeButton: true, doing: opts.doing, onClose });
    }
    paint();
  }

  /** Off the stack without ending: the deck has the keys and the mouse, the panel stays. */
  function release() {
    if (!m) return;
    quiet = true;
    m.close();
    quiet = false;
    m = null;
    paint();
  }

  /** Into the other layout, from where it is to where it goes. */
  function relayout(next: boolean) {
    if (next === isDocked) return;
    const first = el.getBoundingClientRect();
    release();
    isDocked = next;
    // The move plays as one motion, not the window's entrance again.
    el.classList.add('mc-moved');
    put();
    flip(el, first);
  }

  /** A click outside a docked panel: on the deck it hands the mouse back; on the panel it takes it. */
  function onPointer(e: PointerEvent) {
    if (!isDocked || ending) return;
    const t = e.target as Node | null;
    if (!t) return;
    if (el.contains(t)) {
      if (!m) put();
      return;
    }
    if (!m || !shell.onTop() || document.getElementById('modal-root')?.contains(t)) return;
    // The 3D deck: only its canvas (a click on the HUD may be opening a window of its own). The 2D view: anywhere.
    if (t instanceof HTMLCanvasElement || !document.querySelector('canvas#scene')) release();
  }

  const onResize = () => {
    relayout(dockedNow(mode, window.innerWidth));
    paint();
  };

  function end() {
    ending = true;
    dockedOpen = false;
    claimRight(0);
    window.removeEventListener('pointerdown', onPointer, true);
    window.removeEventListener('resize', onResize);
    const gone = host;
    host = null;
    if (gone) {
      if (typeof el.animate === 'function' && !calm()) {
        const out = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(24px)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
        out.onfinish = () => gone.remove();
        setTimeout(() => gone.remove(), 400);
      } else gone.remove();
    }
    opts.onEnd();
  }

  const shell: Shell = {
    engage: () => void (m || ending ? 0 : put()),
    onTop() {
      const top = document.querySelector('#modal-root > .backdrop:last-child');
      return !!m && top === m.backdrop;
    },
    engaged: () => !!m,
    docked: () => isDocked,
    toggle() {
      mode = mode === 'dock' ? 'float' : 'dock';
      saveDockMode(storage(), mode);
      if (mode === 'dock' && window.innerWidth < DOCK_MIN_WIDTH) toast(`Docking needs a window at least ${DOCK_MIN_WIDTH}px wide: it floats until then`);
      paint();
      relayout(dockedNow(mode, window.innerWidth));
    },
    close() {
      if (ending) return;
      ending = true;
      if (m) m.close();
      else end();
    },
  };

  window.addEventListener('pointerdown', onPointer, true);
  window.addEventListener('resize', onResize);
  put();
  return shell;
}
