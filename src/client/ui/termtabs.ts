// Tabs on a worker's terminal: the terminal itself, plus any web pages pinned open beside it (a
// linked chat, docs for the task). They're this browser's own: nothing goes to the office or to
// anyone else, and they're kept per worker until the page reloads.
import './termtabs.css';
import { clip, h, toast } from './dom';
import { WEB_TAB_SANDBOX, webTabUrl } from '../../shared/webtabs';

/** A web page pinned open beside a worker's terminal. */
interface WebTab {
  id: string;
  title: string;
  url: string;
}

/** Web tabs survive closing and reopening a worker's terminal, until the page reloads. */
const tabsByWorker = new Map<string, WebTab[]>();

export interface TermTabsOptions {
  /** The terminal's own area and keypad, hidden while a web page shows. */
  host: HTMLElement;
  keypad: HTMLElement | null;
  /** Back on the terminal's tab. */
  focusTerm(): void;
}

/** The tab bar (above the terminal) and where the pages show (beside it). */
export function termTabs(workerId: string, opts: TermTabsOptions): { bar: HTMLElement; pages: HTMLElement } {
  const tabsBar = h('div.term-tabs', { role: 'tablist', 'aria-label': 'Tabs' });
  const tabName = h('input', { type: 'text', placeholder: 'Tab name (e.g. ChatGPT)', 'aria-label': 'Tab name', maxlength: '40', autocomplete: 'off' }) as HTMLInputElement;
  const tabUrl = h('input', { type: 'url', placeholder: 'https://...', 'aria-label': 'Web page address', autocomplete: 'off' }) as HTMLInputElement;
  const cancelBtn = h('button.btn', { type: 'button' }, 'Cancel');
  const form = h('form.term-tab-form.hidden', {}, tabName, tabUrl, h('button.btn.primary', { type: 'submit' }, 'Add'), cancelBtn);
  const addBtn = h('button.term-tab-add', { type: 'button', title: 'Pin a web page open beside this terminal (a linked chat, docs, anything with an address)' }, '+ Web page');
  // Plenty of sites won't show inside another page (chatgpt.com doesn't): this opens the one showing in a tab of its own.
  const openOut = h('a.term-tab-out.hidden', { target: '_blank', rel: 'noopener noreferrer', title: "Open this page in a browser tab of its own (for a site that won't show here)" }, 'New tab') as HTMLAnchorElement;
  const bar = h('div.term-tabbar', {}, tabsBar, openOut, addBtn, form);
  const pages = h('div.term-webhost.hidden');

  const tabs = tabsByWorker.get(workerId) ?? [];
  tabsByWorker.set(workerId, tabs);
  const frames = new Map<string, HTMLIFrameElement>();
  let active = 'main';

  const render = () => {
    const mainTab = h('div.term-tab', { class: active === 'main' ? 'on' : '' }, h('button.term-tab-label', { type: 'button', role: 'tab', 'aria-selected': String(active === 'main'), onclick: () => show('main') }, 'Terminal'));
    tabsBar.replaceChildren(
      mainTab,
      ...tabs.map((t) =>
        h(
          'div.term-tab',
          { class: active === t.id ? 'on' : '' },
          h('button.term-tab-label', { type: 'button', role: 'tab', 'aria-selected': String(active === t.id), title: t.url, onclick: () => show(t.id) }, `${clip(t.title, 18)}`),
          h(
            'button.term-tab-close',
            {
              type: 'button',
              'aria-label': `Close ${t.title} tab`,
              onclick: (e: Event) => {
                e.stopPropagation();
                close(t.id);
              },
            },
            '×',
          ),
        ),
      ),
    );
    const page = tabs.find((t) => t.id === active);
    openOut.classList.toggle('hidden', !page);
    if (page) openOut.href = page.url;
  };
  const show = (id: string) => {
    active = id;
    const onMain = id === 'main';
    opts.host.classList.toggle('hidden', !onMain);
    pages.classList.toggle('hidden', onMain);
    opts.keypad?.classList.toggle('hidden', !onMain);
    for (const [tid, frame] of frames) frame.classList.toggle('hidden', tid !== id);
    render();
    if (onMain) opts.focusTerm();
  };
  const close = (id: string) => {
    const i = tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    tabs.splice(i, 1);
    frames.get(id)?.remove();
    frames.delete(id);
    if (active === id) show('main');
    else render();
  };
  const frameFor = (t: WebTab) => {
    const frame = h('iframe.term-webframe.hidden', { src: t.url, title: t.title, loading: 'lazy', referrerpolicy: 'no-referrer', sandbox: WEB_TAB_SANDBOX }) as HTMLIFrameElement;
    frames.set(t.id, frame);
    pages.append(frame);
  };
  for (const t of tabs) frameFor(t);
  render();

  addBtn.addEventListener('click', () => {
    form.classList.remove('hidden');
    tabName.focus();
  });
  const closeForm = () => {
    form.classList.add('hidden');
    tabName.value = '';
    tabUrl.value = '';
  };
  cancelBtn.addEventListener('click', closeForm);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // https only, and never the office's own pages (see shared/webtabs.ts).
    const parsed = webTabUrl(tabUrl.value, location.origin);
    if (typeof parsed === 'string') return toast(parsed, 'warn');
    const tab: WebTab = { id: `web-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: tabName.value.trim() || parsed.hostname.replace(/^www\./, ''), url: parsed.toString() };
    tabs.push(tab);
    frameFor(tab);
    closeForm();
    show(tab.id);
  });
  return { bar, pages };
}
