// The office's Spend service (see service.ts), made with the building's services: every open
// floor's workers, everyone's pages for the state and the toasts, and --budget as the daily cap
// until an admin sets one in Settings.
import type { Ctx } from '../office/context.js';
import { Spend, type SpendFloor } from './service.js';

export function createSpend(ctx: Ctx): Spend {
  const floors = (): SpendFloor[] => [...ctx.floors.values()].map((f) => ({ id: f.id, name: f.def.name, dir: f.def.dir, workers: f.workers, sendHome: (id, cleanup) => f.sendHome(id, cleanup) }));
  return new Spend({
    dataDir: ctx.cfg.dataDir,
    floors,
    broadcast: (msg) => ctx.broadcast(msg),
    toast: (text, level) => ctx.toastAll(text, level),
    budget: ctx.cfg.budget,
  });
}
