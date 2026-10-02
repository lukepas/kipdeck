// What a worker's provider adapter is handed of it (see WorkerHandle): its info and state, and the
// few things the manager lets an adapter do to it.
import type { WorkerStatus } from '../../shared/protocol.js';
import type { Worker, WorkerHandle } from './types.js';

/** What the manager does for a handle. */
export interface HandleOps {
  setStatus(w: Worker, status: WorkerStatus): void;
  emit(w: Worker): void;
  persist(): void;
  notePrompt(w: Worker, prompt: string): void;
  noteTool(w: Worker, tool: string): void;
  clearTask(w: Worker): void;
  scheduleScan(w: Worker): void;
  prompt(id: string, text: string): string | undefined;
}

/** The worker's handle: made once, kept on the worker. */
export function workerHandle(w: Worker, ops: HandleOps): WorkerHandle {
  return (w.handle ??= {
    get info() {
      return w.info;
    },
    get state() {
      return w.state;
    },
    get running() {
      return !!w.pty;
    },
    get bootBlocked() {
      return !!w.bootBlocked;
    },
    set bootBlocked(v) {
      w.bootBlocked = v;
    },
    get leftNeedsInputAt() {
      return w.leftNeedsInputAt;
    },
    set leftNeedsInputAt(v) {
      w.leftNeedsInputAt = v;
    },
    get failStreak() {
      return w.failStreak;
    },
    set failStreak(v) {
      w.failStreak = v;
    },
    get tracker() {
      return w.tracker;
    },
    get pendingPrompt() {
      return w.pendingPrompt;
    },
    set pendingPrompt(v) {
      w.pendingPrompt = v;
    },
    setStatus: (status) => ops.setStatus(w, status),
    emit: () => ops.emit(w),
    persist: () => ops.persist(),
    notePrompt: (prompt) => ops.notePrompt(w, prompt),
    noteTool: (tool) => ops.noteTool(w, tool),
    clearTask: () => ops.clearTask(w),
    scheduleScan: () => ops.scheduleScan(w),
    prompt: (text) => ops.prompt(w.info.id, text),
  });
}
