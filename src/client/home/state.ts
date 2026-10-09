// What the inbox at / keeps of its own, apart from the office's store: which agent is selected, the
// project, owner (Mine or Team) and search it's filtered by, whether Idle is open, the pane's tab, the shipped log the
// office sent, and the first-run checklist (this browser's). Every change fires `change`.

import type { ShipRecord } from '../../shared/protocol';
import { checklistDone, type ChecklistState, type ChecklistStep, type OwnerFilter } from '../../shared/inbox';
import { storageKey } from '../shared/storage-key';

export type PaneTab = 'terminal' | 'changes' | 'log';

const CHECK_KEY = storageKey('checklist');
const IDLE_KEY = storageKey('idle-open');
const PROJECT_KEY = storageKey('project');
const OWNER_KEY = storageKey('owner');
const FIRST_MERGE_KEY = storageKey('first-merge');

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked: it lasts as long as the page
  }
}

function readChecklist(): ChecklistState & { hidden?: boolean } {
  try {
    const v = JSON.parse(read(CHECK_KEY) ?? '{}') as Record<string, unknown>;
    return { deploy: v.deploy === true, answer: v.answer === true, merge: v.merge === true, hidden: v.hidden === true };
  } catch {
    return {};
  }
}

const listeners = new Set<() => void>();

export const home = {
  /** The agent the pane shows (a roster id). */
  selected: undefined as string | undefined,
  /** The pane's tab. */
  tab: 'terminal' as PaneTab,
  /** Put the cursor in this agent's reply box once its terminal is up (Answer). */
  focusReply: undefined as string | undefined,
  /** When this page last asked for an agent: the next new one is selected. */
  deployedAt: 0,
  /** On a phone: the pane is up over the list. */
  paneOpen: false,
  /** A demo office (`--demo`): no Get started checklist. */
  demo: false,
  /** Esc emptied the pane on purpose: nothing opens in it by itself until another agent needs you (pane.ts). */
  held: false,
  /** '' for All projects, else a floor id. */
  project: read(PROJECT_KEY) ?? '',
  /** Everyone's agents (Team), or only the ones this person deployed (Mine). */
  owner: (read(OWNER_KEY) === 'mine' ? 'mine' : 'team') as OwnerFilter,
  query: '',
  idleOpen: read(IDLE_KEY) === '1',
  /** The shipped log, newest first, once the office has sent it. */
  records: [] as ShipRecord[],
  /** The public key the records are signed with (PEM). */
  key: '',
  checklist: readChecklist(),

  on(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  change() {
    listeners.forEach((fn) => fn());
  },

  select(id: string | undefined, tab?: PaneTab) {
    this.selected = id;
    if (id) this.held = false;
    if (tab) this.tab = tab;
    this.paneOpen = !!id;
    this.change();
  },
  setProject(id: string) {
    this.project = id;
    write(PROJECT_KEY, id || null);
    this.change();
  },
  setOwner(owner: OwnerFilter) {
    this.owner = owner;
    write(OWNER_KEY, owner === 'mine' ? owner : null);
    this.change();
  },
  setIdleOpen(open: boolean) {
    this.idleOpen = open;
    write(IDLE_KEY, open ? '1' : null);
    this.change();
  },
  /** A step of the checklist is done. */
  check(step: ChecklistStep) {
    if (this.checklist[step]) return;
    this.checklist = { ...this.checklist, [step]: true };
    this.saveChecklist();
  },
  hideChecklist() {
    this.checklist = { ...this.checklist, hidden: true };
    this.saveChecklist();
  },
  saveChecklist() {
    write(CHECK_KEY, JSON.stringify(this.checklist));
    this.change();
  },
  checklistShown(): boolean {
    return !this.checklist.hidden && !checklistDone(this.checklist);
  },
  /** True once, for this browser's first merge (the toast that says so), false after. */
  firstMerge(): boolean {
    if (read(FIRST_MERGE_KEY)) return false;
    write(FIRST_MERGE_KEY, String(Date.now()));
    return true;
  },
  addRecord(r: ShipRecord) {
    if (this.records.some((x) => x.id === r.id)) return;
    this.records = [r, ...this.records];
    this.change();
  },
};
