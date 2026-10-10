import path from 'node:path';
import type { Config } from '../config.js';
import { Auth } from '../auth.js';
import { HostGuard } from '../hosts.js';
import { Accounts } from '../accounts.js';
import { providerCommand } from '../agents.js';
import type { AgentProvider } from '../../shared/providers.js';
import { createModelCatalogues } from '../models.js';
import { Building } from '../building.js';
import type { Floor } from '../floor.js';
import { ChatLog } from '../history.js';
import { Labs } from '../labs.js';
import { ShipLog } from '../shiplog.js';
import { Telemetry } from '../telemetry.js';
import type { Core, Ctx } from './context.js';
import type { Client } from './client.js';

/** The first of the office: accounts and sign-in, the people in it, chat, and the building's floors. */
export function createCore(ctx: Ctx, cfg: Config, publicDir: string): Core {
  const accounts = new Accounts(cfg.dataDir);
  const auth = new Auth(cfg.verifier, cfg.salt, cfg.secret, accounts, cfg.dataDir);
  const hosts = new HostGuard(cfg);
  const clients = new Map<string, Client>();
  // Kept on disk, so a restart doesn't wipe it.
  const chat = new ChatLog(cfg.dataDir);
  /** What the office is called where it has no project of its own to go by (webhooks, invites). */
  const officeName = cfg.project ? path.basename(cfg.project) : 'the office';
  // The model lists come from the provider's own CLI: the office's --agent when it's that one.
  const cli = (provider: AgentProvider) => {
    const command = providerCommand(provider, cfg.agentCmd);
    return command.includes('/') ? path.resolve(command) : command;
  };
  const models = createModelCatalogues(cli, cfg.dir);

  // --- The building: a floor per project, each with its own workers, boards and queue -----------
  const building = new Building(cfg.dataDir, cfg.projectsDir);
  if (cfg.projects) {
    const err = building.setProjectsDir(cfg.projects, 'the command line');
    if (err) console.error(`kipdeck: --projects: ${err}`);
  }
  const floors = new Map<string, Floor>();
  // The parts beyond the inbox: on until an admin switches one off, or held on or off by the command line.
  const labs = new Labs(cfg.dataDir, cfg.labs, cfg.labsOff ?? []);
  // Every review the inbox ends, merged or sent back, signed and kept on disk.
  const shipped = new ShipLog(cfg.dataDir);
  // Anonymous usage numbers: off unless someone turns them on.
  const telemetry = new Telemetry(cfg.dataDir, cfg.telemetry);
  return { cfg, publicDir, accounts, auth, hosts, clients, chat, officeName, models, building, floors, labs, shipped, telemetry };
}
