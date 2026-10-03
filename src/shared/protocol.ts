// Wire protocol between browser and server. Every WebSocket frame is one JSON object.
//
// Each part of the office keeps its state types and its messages in ./protocol/<domain>.ts; this
// file puts them back together, so everything is still imported from here, and makes the two
// unions every frame is one of.

import type { AccountsClientMsg, AccountsServerMsg, SignInsClientMsg, TeamClientMsg } from './protocol/accounts.js';
import type { BountiesClientMsg, BountiesServerMsg } from './protocol/bounties.js';
import type { ChangesClientMsg, ChangesServerMsg } from './protocol/changes.js';
import type { FloorClientMsg, FloorServerMsg, PlanClientMsg } from './protocol/floors.js';
import type { GitHubClientMsg, GitHubServerMsg } from './protocol/github.js';
import type { MeetingClientMsg, MeetingServerMsg } from './protocol/meetings.js';
import type { PresenceClientMsg, PresenceServerMsg } from './protocol/presence.js';
import type { QueueClientMsg, QueueServerMsg } from './protocol/queue.js';
import type { ReputationClientMsg, ReputationServerMsg } from './protocol/reputation.js';
import type { LandedServerMsg } from './protocol/landed.js';
import type { MissionClientMsg, MissionServerMsg } from './protocol/mission.js';
import type { SettingsClientMsg, SettingsServerMsg } from './protocol/settings.js';
import type { ShowcaseClientMsg, ShowcaseServerMsg } from './protocol/showcase.js';
import type { TimelineClientMsg, TimelineServerMsg } from './protocol/timeline.js';
import type { WhiteboardClientMsg, WhiteboardServerMsg } from './protocol/whiteboard.js';
import type { UsageClientMsg, UsageServerMsg } from './protocol/usage.js';
import type { WorkerClientMsg, WorkerServerMsg } from './protocol/workers.js';

export * from './protocol/accounts.js';
export * from './protocol/agents.js';
export * from './protocol/bounties.js';
export * from './protocol/changes.js';
export * from './protocol/floors.js';
export * from './protocol/github.js';
export * from './protocol/meetings.js';
export * from './protocol/landed.js';
export * from './protocol/mission.js';
export * from './protocol/presence.js';
export * from './protocol/queue.js';
export * from './protocol/reputation.js';
export * from './protocol/settings.js';
export * from './protocol/showcase.js';
export * from './protocol/timeline.js';
export * from './protocol/whiteboard.js';
export * from './protocol/usage.js';
export * from './protocol/workers.js';

export type ClientMsg =
  | PresenceClientMsg
  | WorkerClientMsg
  | GitHubClientMsg
  | QueueClientMsg
  | MeetingClientMsg
  | FloorClientMsg
  | PlanClientMsg
  | ChangesClientMsg
  | TeamClientMsg
  | AccountsClientMsg
  | SignInsClientMsg
  | SettingsClientMsg
  | UsageClientMsg
  | WhiteboardClientMsg
  | MissionClientMsg
  | TimelineClientMsg
  | BountiesClientMsg
  | ReputationClientMsg
  | ShowcaseClientMsg;

export type ServerMsg =
  | PresenceServerMsg
  | LandedServerMsg
  | WorkerServerMsg
  | GitHubServerMsg
  | QueueServerMsg
  | MeetingServerMsg
  | FloorServerMsg
  | ChangesServerMsg
  | AccountsServerMsg
  | SettingsServerMsg
  | UsageServerMsg
  | WhiteboardServerMsg
  | MissionServerMsg
  | TimelineServerMsg
  | BountiesServerMsg
  | ReputationServerMsg
  | ShowcaseServerMsg;
