// The Rundown window (Labs > Rundown): a map of a project's parts, milestones, activity and decisions,
// for any floor of the building, shared by the inbox (avatar menu, Ctrl+K, the project picker) and the
// Bridge view (its menu, Ctrl+K, and E at a district of the holo city). The office computes it
// (server/rundown/service.ts) while the window watches the floor; Refresh asks for it again and
// "Download map.html" saves the same self-contained page the /rundown skill writes. Loaded the first
// time it opens (home/lazy.ts). A top-right close and Esc put it away; on the bridge that is straight
// back into mouse-look (input/focus.ts).
import type { Net } from '../../net';
import { store } from '../../state';
import { h, openModal, toast, type Modal } from '../dom';
import { icon } from '../icons';
import { branchLanes } from './branches';
import { activity } from './heatmap';
import { changes, decisions, facts, milestones, needsYou, overview, partDetail } from './sections';
import { treemap } from './treemap';
import './ui.css';

export interface RundownOptions {
  /** The floor to show first: else the one you're on, else the first. */
  floor?: string;
  /** A part to open on arrival. */
  part?: string;
  /** Called once it closes, after it stopped watching (the bridge watches its own floor again). */
  onClose?(): void;
}

export interface RundownWindow {
  modal: Modal;
  /** Scrolls to a part and opens its details. */
  openPart(id: string): void;
  /** Shows another floor. */
  show(floor: string): void;
}

let current: RundownWindow | null = null;

/** Opens the window, or brings the open one to `opts.floor` and `opts.part`. */
export function openRundown(net: Net, opts: RundownOptions = {}): RundownWindow {
  if (current) {
    if (opts.floor) current.show(opts.floor);
    if (opts.part) current.openPart(opts.part);
    return current;
  }
  const floors = () => store.floors.filter((f) => !f.cloning);
  let floor = opts.floor ?? (store.floor && floors().some((f) => f.id === store.floor) ? store.floor : floors()[0]?.id) ?? '';
  let part: string | null = opts.part ?? null;
  const tabs = h('div.rd-tabs', { role: 'tablist', 'aria-label': 'Project' });
  const body = h('div.body.rd-body');
  const refresh = h('button.btn', { type: 'button' }, icon('refresh', 14), 'Refresh');
  const download = h('a.btn', { download: '' }, icon('external', 14), 'Download map.html') as HTMLAnchorElement;
  const status = h('span.grow');
  const el = h('div.modal.rundown', { role: 'dialog', 'aria-label': 'Rundown' }, h('header', {}, h('h2', {}, 'Rundown'), tabs), body, h('footer', {}, status, refresh, download));

  const watch = () => floor && net.send({ t: 'rundown.watch', floor });
  refresh.addEventListener('click', () => floor && net.send({ t: 'rundown.refresh', floor }));

  const paintTabs = () => {
    const list = floors();
    tabs.replaceChildren(...list.map((f) => h('button.rd-tab', { type: 'button', role: 'tab', 'aria-selected': String(f.id === floor), class: f.id === floor ? 'on' : '', onclick: () => show(f.id) }, f.name)));
    tabs.classList.toggle('hidden', list.length < 2);
  };

  const render = () => {
    paintTabs();
    download.href = floor ? `/api/rundown/${encodeURIComponent(floor)}/map.html` : '#';
    const view = store.rundowns.get(floor);
    const r = view?.rundown ?? null;
    el.classList.toggle('computing', !!view?.computing);
    status.textContent = view?.computing ? 'Computing...' : r ? `Updated ${new Date(r.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${r.project.head ? ` at ${r.project.head.sha.slice(0, 7)}` : ''}` : '';
    if (!r) {
      body.replaceChildren(h('p.rd-empty', {}, view?.error ?? (floor ? 'Computing the first rundown of this project...' : 'No project to map yet.')));
      return;
    }
    const scroll = body.scrollTop;
    const selected = part && r.parts.some((p) => p.id === part) ? r.parts.find((p) => p.id === part)! : null;
    const now = new Date();
    body.replaceChildren(
      ...(view?.error ? [h('p.rd-banner.warn', {}, view.error)] : []),
      ...(r.parts.some((p) => p.statusSource === 'inferred') ? [h('p.rd-banner', {}, 'Statuses inferred. Run /rundown in this project for a real read.')] : []),
      overview(r),
      changes(r),
      h('section.rd-parts', { 'aria-label': 'Parts map' }, h('h3', {}, 'Parts map'), needsYou(r, openPart), h('div.rd-scroll', {}, treemap(r, openPart, part)), selected ? partDetail(r, selected, () => ((part = null), render())) : null),
      milestones(r),
      ...(r.facts.git ? [h('section', { 'aria-label': 'Commit activity' }, h('h3', {}, 'Commit activity'), activity(r.facts.git, now))] : []),
      ...(r.facts.git?.branches.length ? [h('section', { 'aria-label': 'Branches and worktrees' }, h('h3', {}, 'Branches and worktrees'), branchLanes(r.facts.git, r.project.defaultBranch, now))] : []),
      decisions(r),
      facts(r),
    );
    body.scrollTop = scroll;
  };

  function openPart(id: string) {
    part = id;
    render();
    const d = body.querySelector('.rd-detail');
    d?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    (body.querySelector(`[data-part="${CSS.escape(id)}"]`) as SVGElement | null)?.focus?.();
  }

  function show(id: string) {
    if (id === floor) return;
    floor = id;
    part = null;
    watch();
    render();
  }

  const offs = [store.on('rundown', render), store.on('floors', render)];
  const modal = openModal(el, {
    doing: 'reading the rundown',
    onClose: () => {
      offs.forEach((off) => off());
      net.send({ t: 'rundown.unwatch' });
      current = null;
      opts.onClose?.();
    },
  });
  watch();
  render();
  if (!floor) toast('No project to map yet', 'warn');
  current = { modal, openPart, show };
  if (part) queueMicrotask(() => openPart(part!));
  return current;
}

/** The open window, if any. */
export const rundownWindow = () => current;
