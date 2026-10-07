// What every part of the office shares: the building-wide singletons and the helpers the WebSocket
// handlers, the HTTP routes and the hook server use. startServer (server.ts) makes it a stage at a
// time, in the order the office has always started up in (see each stage's interface), so a part
// only ever uses what was already there when it was made.
import type { Config } from '../config.js';
import type { Auth } from '../auth.js';
import type { HostGuard } from '../hosts.js';
import type { Accounts } from '../accounts.js';
import type { SignIns, GhAs } from '../signins.js';
import type { ModelCatalogue } from '../models.js';
import type { Tailnet } from '../tailnet.js';
import type { Team } from '../team.js';
import type { Upgrader } from '../upgrade.js';
import type { Services } from '../services.js';
import type { Ledger } from '../usage.js';
import type { PlanLimitsReader } from '../limits.js';
import type { Webhook } from '../webhook.js';
import type { Machine } from '../machine.js';
import type { Building, FloorDef } from '../building.js';
import type { Floor } from '../floor.js';
import type { OfficePrompts } from '../prompts.js';
import type { LeaveOnMerge } from '../leave-on-merge.js';
import type { ChatLog } from '../history.js';
import type { Bounties } from '../bounties.js';
import type { X402Gateway } from '../x402/gateway.js';
import type { Reputation } from '../chain/reputation.js';
import type { ReputationIndex } from '../chain/rep-index.js';
import type { MergeProofs } from '../chain/attest.js';
import type { Showcase } from '../showcase/service.js';
import type { Labs } from '../labs.js';
import type { Telemetry } from '../telemetry.js';
import type { ShipLog } from '../shiplog.js';
import type { DemoDirector } from '../demo/director.js';
import type { AgentProvider, FloorInfo, Me, Reminder, ReminderSnooze, ReviewPull, RosterEntry, ServerMsg, ServiceInfo, ServicesState, SignInKind } from '../../shared/protocol.js';
import type { Client } from './client.js';
import type { Spot } from './input.js';

export type ToastLevel = Extract<ServerMsg, { t: 'toast' }>['level'];

/** Made first (office/core.ts). */
export interface Core {
  cfg: Config;
  /** The client bundle the office serves. */
  publicDir: string;
  accounts: Accounts;
  auth: Auth;
  /** Which names the office answers to, and whether a page asking is its own (see hosts.ts). */
  hosts: HostGuard;
  /** Everyone in the office, by connection. */
  clients: Map<string, Client>;
  /** Kept on disk, so a restart doesn't wipe it. */
  chat: ChatLog;
  /** What the office is called where it has no project of its own to go by (webhooks, invites). */
  officeName: string;
  /** The models each provider's own CLI lists, for the ones that list them (see models.ts). */
  models: Partial<Record<AgentProvider, ModelCatalogue>>;
  /** The building: a floor per project, each with its own workers, boards and queue. */
  building: Building;
  floors: Map<string, Floor>;
  /** Which labs are on: the parts beyond the inbox, all off by default (see labs.ts). */
  labs: Labs;
  /** The shipped log: every review the inbox ended, merged or sent back, signed (see shiplog.ts). */
  shipped: ShipLog;
  /** Anonymous usage numbers, off unless someone turns them on (see telemetry.ts). */
  telemetry: Telemetry;
}

/** Made once the hook server listens, before any floor opens (office/services.ts). */
export interface BuildingServices {
  prompts: OfficePrompts;
  leaveOnMerge: LeaveOnMerge;
  ledger: Ledger;
  signins: SignIns;
  /** The office's own Claude plan limits. */
  limits: PlanLimitsReader;
  /** Each account's own, once it runs on a Claude sign-in of its own. */
  accountLimits: Map<string, { key: string; reader: PlanLimitsReader }>;
  webhook: Webhook;
  machine: Machine;
  /** Whose plan `c` sees: their own, on an account with its own Claude sign-in; else the office's. */
  limitsOf(c: Client): PlanLimitsReader;
  /** Queues everywhere may be waiting for room under the worker limit: let them look again. */
  pumpQueues(except?: Floor): void;
}

/** Made as the floors open (office/floors.ts). */
export interface FloorsOpen {
  /** Opens a floor of the building; undefined (and a note in the log) when it can't. */
  openFloor(def: FloorDef): Floor | undefined;
}

/** Made once the floors are open (office/services.ts). */
export interface LateServices {
  team: Team;
  tailnet: Tailnet;
  services: Services;
  upgrader: Upgrader;
  /** A floor's Services board: its own workers' servers. */
  servicesState(floor: Floor | undefined, items?: ServiceInfo[]): ServicesState;
  /** Proof of Merge bounties on every floor's issues (see bounties.ts). */
  bounties: Bounties;
  /** Paid tasks over x402, with --x402 (see x402/gateway.ts). */
  x402?: X402Gateway;
  /** Proof-of-merge attestations on Base Sepolia, with --attest (see chain/attest.ts). */
  proofs?: MergeProofs;
  /** ERC-8004 identities and merge feedback, with --reputation (see chain/reputation.ts). */
  reputation?: Reputation;
  /** The board rebuilt from the chain alone by onchain/indexer, with --reputation-index (see chain/rep-index.ts). */
  reputationIndex?: ReputationIndex;
  /** The public showcase at /pom/, off until an admin turns it on (see showcase/service.ts). */
  showcase: Showcase;
  /** With --demo: seats the scripted agents and, in the read-only demo, plays the reviewer (see demo/director.ts). */
  demo?: DemoDirector;
}

/** Sending to browsers (office/messaging.ts). */
export interface Messaging {
  sendTo(c: Client, msg: ServerMsg): void;
  broadcast(msg: ServerMsg, except?: string, droppable?: boolean): void;
  toastAll(text: string, level?: ToastLevel): void;
  /** To everyone on one floor. */
  toFloor(floor: Floor, msg: ServerMsg, droppable?: boolean): void;
  toastFloor(floor: Floor | undefined, text: string, level?: ToastLevel): void;
  /** To everyone else on the same floor as `c`: nobody on another floor can see them. */
  toNeighbors(c: Client, msg: ServerMsg, droppable?: boolean): void;
  /** Tells just this person why their request didn't happen; nothing when there's no error. */
  warn(c: Client, error: string | undefined): void;
}

/** The building's floors (office/floors.ts). */
export interface FloorHelpers {
  floorOf(c: Client): Floor | undefined;
  /** The floor a worker sits on. Worker ids are unique across the building. */
  workerFloor(workerId: string): Floor | undefined;
  floorInfos(): FloorInfo[];
  /** The elevator's counts change with every worker update; tell everyone at most a few times a second. */
  floorsChanged(): void;
  /** Drops a `floorsChanged` still waiting to go out (the office is closing). */
  cancelFloorsChanged(): void;
  /** Where someone arriving goes: the floor they asked for, else the first one there is. */
  arrivalFloor(wanted: string | null): Floor | undefined;
  /**
   * Takes `floor` off the building (already out of floors.json): everyone on it goes to
   * the next floor, or out to the lobby if it was the last, and its workers stop.
   */
  closeFloor(floor: Floor, who: string): void;
}

/** Every hired worker in the building, for the attention ranking (office/roster.ts). */
export interface RosterHelpers {
  rosterEntries(): RosterEntry[];
  rosterEntryOf(workerId: string): RosterEntry | undefined;
  /** The pull requests waiting for a person that no worker stands for (see server/review.ts). */
  reviewQueue(): ReviewPull[];
  /** Who the office's own gh is signed in as, once known. */
  viewer(): string | undefined;
  /** Something a roster entry shows may have changed: tell everyone, at most a few times a second, if it did. */
  rosterChanged(): void;
  /** Drops a `rosterChanged` still waiting to go out (the office is closing). */
  cancelRosterChanged(): void;
}

/** Reminders for what nobody has answered yet (office/reminders.ts). */
export interface ReminderHelpers {
  /** The reminders open now, the snoozed ones too. */
  reminders(): Reminder[];
  /** Looks for reminders again (once a minute, and after a snooze): tells everyone when they changed, and toasts new ones. */
  sweepReminders(): void;
  /** Puts reminder `key` aside (null: no longer); why not, if it can't. */
  snoozeReminder(key: string, snooze: ReminderSnooze | null): string | undefined;
}

/** Who's signed in (office/people.ts). */
export interface People {
  /** Who a connection is: its account's current name and role, or an admin guest on the shared password. */
  meOf(accountId: string | undefined): Me;
  /** Still signed in: the account wasn't revoked, and the shared password wasn't switched off. */
  stillIn(c: Client): boolean;
  signOut(c: Client): void;
  onlineAccounts(): Set<string>;
  /** Tells each admin what the accounts are now, and everyone whether they're (still) an admin. */
  accountsChanged(): void;
}

/** Going between floors (office/navigation.ts). */
export interface Navigation {
  /**
   * Takes `c` to another floor: everyone sees them leave and arrive, and they get the new floor's
   * everything. They arrive in the elevator, or `at` the spot they came by.
   */
  goToFloor(c: Client, floor: Floor, at?: Spot): void;
  /** Out to the lobby, where the elevator has nowhere to go: the building's last floor was taken off. */
  toLobby(c: Client): void;
}

/** What has to be true before something happens for someone (office/gates.ts). */
export interface Gates {
  /**
   * A worker took on GitHub issue `n` (handed over from its window, or its card dropped on the desk):
   * it moves to In progress on the board and is assigned on GitHub (see GitHub.claim), and comes off
   * the queue so nobody else is seated for it.
   */
  takeIssue(c: Client, floor: Floor, n: number): void;
  /**
   * Runs `go` once `c` has a sign-in of their own to `which` (only accounts need one: on the shared
   * password it's the office's own). Without one it looks again, since they may have just signed
   * in from a shell, and otherwise tells them why (`refused`, else a toast) and opens their sign-ins.
   */
  withSignIn(c: Client, which: SignInKind | undefined, go: () => void, refused?: (why: string) => void): void;
  /**
   * Runs `go` once a worktree made on `floor` would start from what's on GitHub now (see
   * Worktrees.fetch): right away when that was just fetched, else after a fetch, if `c` and the floor
   * are still there.
   */
  withFreshBase(c: Client, floor: Floor | Floor[], go: () => void): void;
  /** Runs `go` with how the office acts on GitHub for `c`: as them, or as itself (no account, or an admin's choice). */
  withGitHub(c: Client, go: (as: GhAs | undefined) => void, refused?: (why: string) => void): void;
  /** Needs a Claude sign-in of its own when the worker it starts runs Claude. */
  claudeFor(provider: string | undefined): SignInKind | undefined;
}

export type Ctx = Core & BuildingServices & FloorsOpen & LateServices & Messaging & FloorHelpers & RosterHelpers & ReminderHelpers & People & Navigation & Gates;
