// The office's labs (see shared/labs.ts): every one on until an admin switches it off from the Labs
// window, unless the command line holds it on (--labs, AGENT_OFFICE_LABS, or a chain flag for proof)
// or holds it off (--labs -proof, or --labs none).
// An admin's choice is kept in the office's data folder through the state-file helpers, as
// { v: 2, on, by, at }. A file with no `v` was written while labs were off by default, when saving
// one switch wrote all seven, so its falses are the old defaults and not anyone's choice: only its
// trues carry over, and every other lab takes today's default, on. A lab a file doesn't name is on.
import path from 'node:path';
import { cleanLabs, defaultLabs, LAB_IDS, type LabId, type Labs as LabsOn, type LabsState } from '../shared/labs.js';
import { readStateJson, writeState } from './safefs.js';
import type { ChainFlags } from './chain/flags.js';

/** The labs.json format written since labs went on by default. */
export const LABS_FILE_VERSION = 2;

interface Saved {
  v: typeof LABS_FILE_VERSION;
  on: LabsOn;
  by?: string;
  at?: number;
}

/** What a labs.json says, old or new, as today's labs. */
export function readSavedLabs(raw: unknown): LabsOn {
  const file = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (file.v === LABS_FILE_VERSION) return cleanLabs(file.on);
  // An older office: keep what someone switched on, and let the rest fall to the default.
  const on = file.on && typeof file.on === 'object' ? (file.on as Record<string, unknown>) : {};
  return cleanLabs(Object.fromEntries(Object.entries(on).filter(([, v]) => v === true)));
}

export class Labs {
  private saved: Saved;
  private readonly file?: string;
  private readonly forced: ReadonlySet<LabId>;
  private readonly heldOff: ReadonlySet<LabId>;

  /**
   * `dataDir` undefined keeps nothing on disk (tests). `forced` are held on and `heldOff` held off,
   * whatever an admin says (the command line; config.ts never names one lab in both).
   */
  constructor(dataDir: string | undefined, forced: readonly LabId[] = [], heldOff: readonly LabId[] = []) {
    this.forced = new Set(forced);
    this.heldOff = new Set(heldOff);
    this.file = dataDir ? path.join(dataDir, 'labs.json') : undefined;
    let raw: Record<string, unknown> | undefined;
    try {
      raw = this.file ? (readStateJson(this.file) as Record<string, unknown>) : undefined;
    } catch {
      // a broken file means the defaults: all on
    }
    this.saved = {
      v: LABS_FILE_VERSION,
      on: readSavedLabs(raw),
      ...(typeof raw?.by === 'string' ? { by: raw.by.slice(0, 64) } : {}),
      ...(typeof raw?.at === 'number' ? { at: raw.at } : {}),
    };
  }

  /** Is `id` on, by an admin's choice or the command line's? */
  on(id: LabId): boolean {
    if (this.heldOff.has(id)) return false;
    return this.forced.has(id) || this.saved.on[id];
  }

  state(): LabsState {
    const on = defaultLabs();
    for (const id of LAB_IDS) on[id] = this.on(id);
    const heldOff = LAB_IDS.filter((id) => this.heldOff.has(id));
    return {
      on,
      forced: LAB_IDS.filter((id) => this.forced.has(id)),
      ...(heldOff.length ? { heldOff } : {}),
      ...(this.saved.by ? { by: this.saved.by } : {}),
      ...(this.saved.at ? { at: this.saved.at } : {}),
    };
  }

  /** An admin's change (the caller checks they are one). Returns the labs whose effective state changed. */
  set(patch: unknown, by: string): LabId[] {
    const before = this.state().on;
    this.saved = { v: LABS_FILE_VERSION, on: cleanLabs(patch, this.saved.on), by: by.slice(0, 64), at: Date.now() };
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

/**
 * The labs the command line holds on and off: --labs and AGENT_OFFICE_LABS, and proof held on by any
 * chain flag (they're proof's own switches). One lab can't be held both ways.
 */
export function commandLineLabs(labs: { on: LabId[]; off: LabId[]; unknown: string[] }, chain: ChainFlags): { labs: LabId[]; labsOff: LabId[] } {
  if (labs.unknown.length) {
    console.error(`kipdeck: --labs: unknown lab ${labs.unknown.map((u) => JSON.stringify(u)).join(', ')} (boards, bridge, ops, meetings, voice, ambience, proof, all or none; a leading minus holds one off)`);
    process.exit(2);
  }
  const on = new Set(labs.on);
  if (chain.x402.enabled || chain.attest.enabled || chain.reputation.enabled) on.add('proof');
  const off = new Set(labs.off);
  const both = [...on].filter((id) => off.has(id));
  if (both.length) {
    console.error(`kipdeck: --labs: ${both.join(', ')} held both on and off (a chain flag such as --x402 holds proof on)`);
    process.exit(2);
  }
  return { labs: [...on], labsOff: [...off] };
}
