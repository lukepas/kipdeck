// The service monitor's page full screen: the same sandboxed frame in a window with its ✕ top right
// (openModal adds it), Reload and Open in a tab. Esc closes it and puts you straight back into
// mouse-look (input/focus.ts). A page that has the keyboard keeps Esc to itself, so the moment the
// pointer is off the page the window takes the keyboard back, and Esc closes it again.
import { h, openModal, type Modal } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { MONITOR_SANDBOX } from './pick';
import './ui.css';

/** Takes the keyboard back from `frame` whenever the pointer moves anywhere off it, onto `to`. */
export function keysBackOffFrame(frame: () => HTMLIFrameElement | null, to: () => HTMLElement | null): () => void {
  const take = () => {
    const f = frame();
    if (!f || document.activeElement !== f) return;
    to()?.focus({ preventScroll: true });
  };
  window.addEventListener('pointermove', take);
  return () => window.removeEventListener('pointermove', take);
}

/** Opens the service's page at `url` full screen. */
export function openMonitorModal(url: string, title: string, tab: () => void): Modal {
  const frame = h('iframe.monitor-modal-frame', { src: url, title: `Live page: ${title}`, sandbox: MONITOR_SANDBOX, referrerpolicy: 'no-referrer', allow: '' }) as HTMLIFrameElement;
  const reload = h('button.btn', { type: 'button', title: 'Reload', onclick: () => (frame.src = url) }, icon('refresh', 16), 'Reload');
  const open = h('button.btn', { type: 'button', title: 'Open in a tab', onclick: () => tab() }, icon('external', 16), 'Tab');
  const el = h(
    'div.modal.monitor-modal',
    { role: 'dialog', 'aria-label': `Service: ${title}`, tabindex: -1 },
    h('header', {}, h('h2', {}, title), reload, open),
    h('div.monitor-modal-body', {}, frame),
    h('p.monitor-note', {}, 'Esc, with the pointer off the page, or the close button takes you back to the deck'),
  );
  const off = keysBackOffFrame(() => frame, () => el);
  const modal = openModal(el, { doing: `watching ${title} on the monitor`, onClose: () => off() });
  el.focus({ preventScroll: true });
  return modal;
}
