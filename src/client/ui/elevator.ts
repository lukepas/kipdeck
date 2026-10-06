import './elevator.css';
import type { CloneProgress, FloorInfo, RepoChoice, ServerMsg } from '../../shared/protocol';
import { cloneLabel, cloneStep, normalizeRepo, sameRepo } from '../../shared/floors';
import type { Net } from '../net';
import { store } from '../state';
import { h, openModal, timeAgo, toast, type Modal } from './dom';
import { confirmDialog } from './prompt';
import { icon, LEVEL_ICON } from './icons';
import { attentionCounts, LEVEL_LABEL, rankRoster, type AttentionLevel } from '../../shared/attention';
import { shortPath } from '../../shared/rowtext';

// The Floors window: a button for every floor (every project), and "add a project", which clones
// one of the repositories the office's gh login can see and makes it a new floor. The first time
// the office runs there are no floors, and this is where you start. Admins can take a floor off the
// building here too; its checkout stays on disk.

export interface ElevatorOptions {
  net: Net;
  /** Rides to a floor. */
  go(floorId: string): void;
}

/** How many repositories the list shows at once; typing narrows it down. */
const SHOWN = 60;
/** Ask gh for the repositories again after this long. */
const REPOS_STALE_MS = 5 * 60_000;
/** Longer than the office takes to ask GitHub about a repository before its clone starts. */
const START_MS = 60_000;

/** Panels waiting on a clone; each says whether the answer was for it. */
const addedWaiters = new Set<(msg: Extract<ServerMsg, { t: 'floor.added' }>) => boolean>();

/** Main feeds server messages through here, so a panel waiting on its clone hears back. */
export function routeElevatorMessage(msg: ServerMsg) {
  if (msg.t !== 'floor.added') return;
  let heard = false;
  for (const fn of addedWaiters) heard = fn(msg) || heard;
  // The panel was closed while it cloned: a clone that failed still says why.
  if (!heard && msg.error) toast(`${msg.error}`, 'warn');
}

/** How far through its step a floor's clone is, as a bar (none until git gives a percentage). */
function cloneBar(p: CloneProgress | undefined): HTMLElement | null {
  if (p?.percent === undefined) return null;
  return h('span.clone-bar', { role: 'progressbar', 'aria-label': p.step, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(p.percent) }, h('span', { style: `width:${p.percent}%` }));
}

let current: Modal | null = null;

export function elevatorPanelOpen(): boolean {
  return !!current;
}

export function openElevator(opts: ElevatorOptions): void {
  if (current) return;
  // Nowhere to go yet: the panel greets you. It closes like any other; the elevator (or the floor
  // name in the corner) opens it again.
  const setup = !store.floor;
  const { net } = opts;
  let filter = '';
  let selected: string | null = null;
  let adding: string | null = null;
  /** The office has started cloning `adding` (it's on the floor list). */
  let seen = false;
  let startTimer: number | undefined;
  let error = '';
  let showAdd = setup || !store.floors.length;
  /** The search box and list are in place (rebuilding them would lose the focus mid-typing). */
  let built = false;

  const floorsEl = h('div.floors');
  const addEl = h('div.add');
  const input = h('input', { type: 'text', placeholder: 'Search your repositories, or type owner/name', 'aria-label': 'Repository', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const listEl = h('div.repo-list', { role: 'listbox', 'aria-label': 'Repositories' });
  const statusEl = h('div');
  const addBtn = h('button.btn.primary', { type: 'button' }, 'Add deck');
  const refreshBtn = h('button.btn', { type: 'button', title: 'Ask GitHub for the list again', 'aria-label': 'Refresh the list' }, icon('refresh', 16));
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close', title: 'Close (Esc)' }, icon('close', 16));

  // Where clones go. Admins can move it right here: the first project is when it matters.
  const dirInput = h('input', { type: 'text', placeholder: '~/Workspace', 'aria-label': 'Workspace folder', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const dirSave = h('button.btn.primary', { type: 'button' }, 'Save');
  const dirCancel = h('button.btn', { type: 'button' }, 'Cancel');
  const dirEl = h('div.webhook.dir-pick.hidden', {}, dirInput, dirSave, dirCancel);
  const editDir = (on: boolean) => {
    dirEl.classList.toggle('hidden', !on);
    if (!on) return;
    dirInput.value = store.projectsDir.dir;
    setTimeout(() => dirInput.focus(), 0);
  };
  const saveDir = () => {
    const dir = dirInput.value.trim();
    if (!dir) return dirInput.focus();
    // The server says why it can't, if it can't; the folder moving closes this.
    if (dir === store.projectsDir.dir) editDir(false);
    else net.send({ t: 'floor.projectsDir', dir });
  };
  dirSave.addEventListener('click', saveDir);
  dirCancel.addEventListener('click', () => editDir(false));
  dirInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) saveDir();
  });

  const needRepos = () => {
    const r = store.repos;
    if (r.loading || (r.at && Date.now() - r.at < REPOS_STALE_MS && !r.error)) return;
    store.repos = { ...r, loading: true };
    net.send({ t: 'floor.repos' });
  };

  /** What "Add floor" would add: the row picked, else what's typed if it's owner/name. */
  const choice = (): string | undefined => selected ?? normalizeRepo(filter);

  /** A deck's units by state, as the top bar shows them: glyph and number, the zeros left out. */
  const deckChips = (f: FloorInfo): HTMLElement[] => {
    const c = attentionCounts(rankRoster(store.roster.filter((e) => e.floor === f.id), Date.now()));
    const levels: AttentionLevel[] = ['needs-you', 'stuck', 'review', 'working'];
    return levels.filter((l) => c[l]).map((l) => h('span.deck-chip', { class: l, title: `${LEVEL_LABEL[l]}: ${c[l]}` }, icon(LEVEL_ICON[l], 12), String(c[l])));
  };

  const floorButton = (f: FloorInfo, i: number) => {
    const here = f.id === store.floor;
    const stats: HTMLElement[] = f.cloning ? [h('span', { title: f.clone?.detail ?? 'Being cloned' }, cloneLabel(f.clone))] : deckChips(f);
    if (!f.cloning && f.people) stats.push(h('span.deck-chip.people', { title: `${f.people} ${f.people === 1 ? 'person' : 'people'} on this deck` }, icon('people', 12), String(f.people)));
    const where = f.repo ?? shortPath(f.dir);
    const btn = h(
      'button.floor-btn',
      { type: 'button', class: here ? 'here' : '', disabled: f.cloning || here, title: here ? "You're on this deck" : f.cloning ? 'Still being cloned' : `Go to ${f.name}` },
      h('span.floor-no', {}, String(i + 1)),
      h(
        'span.floor-text',
        {},
        h('span.floor-name', {}, f.name, here ? h('span.here-tag', {}, 'you are here') : null),
        h('span.floor-sub', { title: f.dir }, [where, f.cloning ? f.clone?.detail : ''].filter(Boolean).join(' · ')),
        // What it's for, so every deck's purpose shows from anywhere (see Mission control).
        f.missionLine ? h('span.floor-sub.floor-mission', { title: f.missionLine }, f.missionLine) : null,
        f.cloning ? cloneBar(f.clone) : null,
      ),
      h('span.floor-stats', {}, ...stats),
    );
    btn.addEventListener('click', () => {
      if (here || f.cloning) return;
      modal.close();
      opts.go(f.id);
    });
    return btn;
  };

  /** The deck's button, with its kebab for admins: taking it off this office is in there, behind a confirm. */
  const floorRow = (f: FloorInfo, i: number) => {
    const btn = floorButton(f, i);
    if (f.cloning) {
      if (!store.me.admin && !(adding && sameRepo(f.repo, adding))) return btn;
      const stop = h('button.btn.floor-off', { type: 'button', title: `Stop cloning ${f.repo ?? f.name}`, 'aria-label': `Stop cloning ${f.name}` }, icon('stop', 16));
      stop.addEventListener('click', () => confirmDialog(`Stop cloning ${f.repo ?? f.name}?`, "What's come down so far is thrown away. You can add it again any time.", 'Stop cloning', () => net.send({ t: 'floor.cancel', floor: f.id })));
      return h('div.floor-row', {}, btn, stop);
    }
    if (!store.me.admin) return btn;
    const remove = h('button.btn.danger.small.floor-remove', { type: 'button', hidden: true }, 'Remove deck...');
    remove.addEventListener('click', () => confirmRemove(f));
    const more = h('button.btn.icon.floor-more', { type: 'button', title: `More for ${f.name}`, 'aria-label': `More for ${f.name}`, 'aria-expanded': 'false' }, icon('more', 16));
    more.addEventListener('click', () => {
      remove.hidden = !remove.hidden;
      more.setAttribute('aria-expanded', String(!remove.hidden));
    });
    return h('div.floor-row', {}, btn, h('div.floor-menu-col', {}, more, remove));
  };

  const confirmRemove = (f: FloorInfo) => {
    const next = store.floors.find((o) => o.id !== f.id && !o.cloning);
    const workers = f.workers ? `Its ${f.workers} unit${f.workers === 1 ? '' : 's'} stop${f.workers === 1 ? 's' : ''}. ` : '';
    const people = f.people ? `Everyone on it goes to ${next ? next.name : 'the lobby'}. ` : '';
    // The office was started in it: its accounts, password and chat live in that .agent-office too, and stay.
    const own = f.local ? ' The office keeps its own settings there too, so it carries on as before, just without this deck.' : '';
    confirmDialog(`Take ${f.name} off this office?`, `${workers}${people}Nothing is deleted: its checkout stays in ${f.dir}, .agent-office folder and all.${own}`, 'Remove deck', () => net.send({ t: 'floor.remove', floor: f.id }));
  };

  const renderFloors = () => {
    const floors = store.floors;
    // Top floor first, the way an elevator's buttons stack.
    floorsEl.replaceChildren(...(floors.length ? floors.map(floorRow).reverse() : [h('p.empty', {}, 'No decks yet.')]));
  };

  const repoRow = (r: RepoChoice) => {
    const floor = store.floors.find((f) => sameRepo(f.repo, r.name));
    const row = h(
      'div.repo',
      { role: 'option', class: selected && sameRepo(selected, r.name) ? 'sel' : '', 'aria-selected': String(!!selected && sameRepo(selected, r.name)), title: r.description ?? r.name },
      h('span.nm', {}, r.name),
      r.private ? h('span', { title: 'Private' }, icon('lock', 12)) : null,
      h('span.desc', {}, r.description ?? ''),
      floor ? h('span.pill', {}, floor.id === store.floor ? 'you are here' : `deck ${store.floors.indexOf(floor) + 1}`) : r.pushedAt ? h('span.when', {}, timeAgo(r.pushedAt)) : null,
    );
    row.addEventListener('click', () => {
      if (adding) return;
      if (floor) {
        // Already a floor: the button takes you there.
        if (floor.id !== store.floor && !floor.cloning) {
          modal.close();
          opts.go(floor.id);
        }
        return;
      }
      selected = r.name;
      renderAdd();
    });
    row.addEventListener('dblclick', () => {
      if (!floor) add(r.name);
    });
    return row;
  };

  const renderAdd = () => {
    if (!showAdd) {
      const open = h('button.btn', { type: 'button' }, icon('plus', 14), 'Add a deck from a repo');
      open.addEventListener('click', () => {
        showAdd = true;
        needRepos();
        renderAdd();
        setTimeout(() => input.focus(), 0);
      });
      addEl.replaceChildren(open);
      addBtn.classList.add('hidden');
      return;
    }
    addBtn.classList.remove('hidden');
    const r = store.repos;
    const q = filter.trim().toLowerCase();
    const typed = normalizeRepo(filter);
    const matches = r.list.filter((x) => !q || x.name.toLowerCase().includes(q) || (x.description ?? '').toLowerCase().includes(q));
    const rows: HTMLElement[] = [];
    // owner/name that isn't in the list (someone else's public repository): offer it anyway.
    if (typed && !r.list.some((x) => sameRepo(x.name, typed))) rows.push(repoRow({ name: typed, private: false, description: 'Not in your list: the office will try to clone it' }));
    rows.push(...matches.slice(0, SHOWN).map(repoRow));
    if (!rows.length) rows.push(h('p.empty', { style: 'padding:10px' }, r.loading ? 'Asking GitHub for your repositories...' : r.error ? '' : q ? 'Nothing matches. Type owner/name to clone any repository.' : 'No repositories.'));
    if (matches.length > SHOWN) rows.push(h('p.empty', { style: 'padding:8px 10px' }, `...and ${matches.length - SHOWN} more: type to narrow it down`));
    listEl.replaceChildren(...rows);
    const pick = choice();
    const dest = pick ? `${store.projectsDir.dir}/${pick}` : `${store.projectsDir.dir}/<owner>/<repo>`;
    const change = store.me.admin ? h('button.btn.dir-change', { type: 'button', title: 'Clone new projects into another folder on the office\'s machine' }, 'Change folder') : null;
    change?.addEventListener('click', () => editDir(true));
    // While it clones: how far it's got (the office asks GitHub about it first).
    const on = addingFloor();
    const lines = adding
      ? [
          h('p.note.busy', {}, on ? `Cloning ${on.repo ?? adding} into ${store.projectsDir.dir}/${on.repo ?? adding}` : `Asking GitHub about ${adding}...`),
          on ? cloneBar(on.clone) : null,
          on ? h('p.note', {}, [cloneStep(on.clone), on.clone?.detail].filter(Boolean).join(' · ')) : null,
          h('p.note', {}, 'You can close this and carry on: everyone hears when the new deck opens.'),
        ]
      : [h('p.note', {}, `Cloned into ${dest} with this machine's gh login. Everything on the new deck works in that checkout.`, change)];
    statusEl.replaceChildren(...lines.filter((l): l is HTMLElement => !!l), ...[r.error, error].filter(Boolean).map((e) => h('p.err', {}, e)));
    addBtn.disabled = !!adding || !pick || store.floors.some((f) => sameRepo(f.repo, pick));
    addBtn.textContent = adding ? 'Cloning...' : pick ? `Add ${pick}` : 'Add deck';
    input.disabled = !!adding;
    if (!built) {
      built = true;
      addEl.replaceChildren(
        h('h3', {}, setup && !store.floors.length ? 'Pick your first project' : 'Add a deck from a repo'),
        h('div.repo-search', {}, input, refreshBtn),
        listEl,
        statusEl,
        dirEl,
      );
    }
  };

  /** The floor being added, once the office is cloning it (and after, when it's there). */
  const addingFloor = () => (adding ? store.floors.find((f) => sameRepo(f.repo, adding!)) : undefined);

  const add = (repo: string) => {
    if (adding) return;
    adding = repo;
    seen = false;
    error = '';
    renderAdd();
    net.send({ t: 'floor.add', repo });
    // The office went away before it started (a restart): don't wait forever.
    clearTimeout(startTimer);
    startTimer = window.setTimeout(() => {
      if (adding !== repo || seen) return;
      adding = null;
      error = `The office didn't start cloning ${repo} - try again`;
      renderAdd();
    }, START_MS);
  };

  /** Done waiting on the clone, one way or another. */
  const settle = (floor: string | undefined, why?: string) => {
    adding = null;
    clearTimeout(startTimer);
    if (floor) {
      modal.close();
      opts.go(floor);
      return;
    }
    error = why ?? 'The deck could not be added';
    renderAdd();
  };

  const onAdded = (msg: Extract<ServerMsg, { t: 'floor.added' }>) => {
    if (!adding || msg.repo !== adding) return false;
    settle(msg.error ? undefined : msg.floor, msg.error);
    return true;
  };

  /**
   * The floor list changed. The office answers the one who asked with floor.added, but if it
   * restarted mid-clone that answer went nowhere: the floor list still shows how it ended.
   */
  const checkAdding = () => {
    if (!adding) return;
    const f = addingFloor();
    if (f?.cloning) seen = true;
    else if (seen) settle(f?.id, `Cloning ${adding} stopped before it finished - add it again`);
  };
  addedWaiters.add(onAdded);

  input.addEventListener('input', () => {
    filter = input.value;
    // Typing something else drops the row that was picked, unless it's still what's typed.
    if (selected && !sameRepo(selected, normalizeRepo(filter))) selected = null;
    renderAdd();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const q = filter.trim().toLowerCase();
    const matches = store.repos.list.filter((x) => !store.floors.some((f) => sameRepo(f.repo, x.name)) && (x.name.toLowerCase().includes(q) || (x.description ?? '').toLowerCase().includes(q)));
    const pick = choice() ?? (q && matches.length === 1 ? matches[0].name : undefined);
    if (pick) add(pick);
  });
  addBtn.addEventListener('click', () => {
    const pick = choice();
    if (pick) add(pick);
  });
  refreshBtn.addEventListener('click', () => {
    store.repos = { ...store.repos, loading: true, error: undefined };
    renderAdd();
    net.send({ t: 'floor.repos', refresh: true });
  });

  const intro = setup
    ? h(
        'p.intro',
        {},
        store.floors.length
          ? 'Every project is a deck. Pick one to go to, or add another from a repository.'
          : "Every project is a deck, and this office has none yet. Pick one of your repositories: the office clones it and it becomes the first deck.",
      )
    : null;
  const el = h(
    'div.modal.elevator',
    { role: 'dialog', 'aria-label': 'Elevator' },
    h('header', {}, h('h2', {}, setup ? 'Welcome to Mergeline' : 'Deck lift'), close),
    h('div.body', {}, intro, floorsEl, addEl),
    h('footer', {}, h('span.grow', {}, setup ? 'Your office, one deck per project · Esc to look around first' : 'Pick a deck · Esc to stay here'), addBtn),
  );
  const unsubs = [store.on('floors', () => (checkAdding(), renderFloors(), renderAdd())), store.on('repos', renderAdd), store.on('projectsDir', () => (editDir(false), renderAdd())), store.on('floor', renderFloors), store.on('peers', renderFloors), store.on('me', () => (renderFloors(), renderAdd()))];
  const modal = openModal(el, {
    doing: 'looking at the decks',
    // A stray click shouldn't lose the first-run panel; ✕ and Esc still close it.
    backdropCloses: !setup,
    onClose: () => {
      current = null;
      clearTimeout(startTimer);
      addedWaiters.delete(onAdded);
      for (const off of unsubs) off();
    },
  });
  current = modal;
  close.addEventListener('click', () => modal.close());
  renderFloors();
  if (showAdd) needRepos();
  renderAdd();
  if (showAdd) setTimeout(() => input.focus(), 30);
}
