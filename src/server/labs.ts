// The office's labs (see shared/labs.ts): every one off until an admin switches it on from the Labs
// window, or the command line holds it on (--labs, AGENT_OFFICE_LABS, or a chain flag for proof).
// An admin's choice is kept in the office's data folder through the state-file helpers.
import path from 'node:path';
import { cleanLabs, defaultLabs, LAB_IDS, type LabId, type Labs as LabsOn, type LabsState } from '../shared/labs.js';
import { readStateJson, writeState } from './safefs.js';

interface Saved {
  on: LabsOn;
  by?: string;
  at?: number;
}

export class Labs {
  private saved: Saved;
  private readonly file?: string;
  private readonly forced: ReadonlySet<LabId>;

  /** `dataDir` undefined keeps nothing on disk (tests). `forced` are held on whatever an admin says. */
  constructor(dataDir: string | undefined, forced: readonly LabId[] = []) {
    this.forced = new Set(forced);
    this.file = dataDir ? path.join(dataDir, 'labs.json') : undefined;
    let raw: Record<string, unknown> | undefined;
    try {
      raw = this.file ? (readStateJson(this.file) as Record<string, unknown>) : undefined;
    } catch {
      // a broken file means the defaults: all off
    }
    this.saved = { on: cleanLabs(raw?.on), ...(typeof raw?.by === 'string' ? { by: raw.by.slice(0, 64) } : {}), ...(typeof raw?.at === 'number' ? { at: raw.at } : {}) };
  }

  /** Is `id` on, by an admin's choice or the command line's? */
  on(id: LabId): boolean {
    return this.forced.has(id) || this.saved.on[id];
  }

  state(): LabsState {
    const on = defaultLabs();
    for (const id of LAB_IDS) on[id] = this.on(id);
    return { on, forced: LAB_IDS.filter((id) => this.forced.has(id)), ...(this.saved.by ? { by: this.saved.by } : {}), ...(this.saved.at ? { at: this.saved.at } : {}) };
  }

  /** An admin's change (the caller checks they are one). Returns the labs whose effective state changed. */
  set(patch: unknown, by: string): LabId[] {
    const before = this.state().on;
    this.saved = { on: cleanLabs(patch, this.saved.on), by: by.slice(0, 64), at: Date.now() };
    if (this.file) {
      try {
        writeState(this.file, JSON.stringify(this.saved, null, 2));
      } catch {
        // disk issues shouldn't take the office down
      }
    }
    const after = this.state().on;
    return LAB_IDS.filter((id) => before[id] !== after[id]);
  }
}
