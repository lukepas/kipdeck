// Every message a browser can send, by type, and the features that keep something per person on a
// floor. A new feature adds its handler file and a line here.
import type { ClientMsg } from '../../../shared/protocol.js';
import { accountsHandlers } from './accounts.js';
import { bountiesHandlers, bountiesView } from './bounties.js';
import { changesHandlers, changesHooks } from './changes.js';
import { floorHandlers, projectView } from './floors.js';
import { githubHandlers, issuesView, pullsView } from './github.js';
import { meetingHandlers, meetingView } from './meetings.js';
import { missionHandlers, missionView } from './mission.js';
import { planHandlers, planView } from './plan.js';
import { presenceHandlers } from './presence.js';
import { queueHandlers, queueView } from './queue.js';
import { reputationHandlers } from './reputation.js';
import { servicesView, settingsHandlers } from './settings.js';
import { showcaseHandlers } from './showcase.js';
import { signinsHandlers } from './signins.js';
import { teamHandlers } from './team.js';
import { timelineHandlers } from './timeline.js';
import { usageHandlers } from './usage.js';
import { whiteboardHandlers, whiteboardHooks, whiteboardView } from './whiteboard.js';
import { workerHandlers, workerHooks, workersView } from './workers.js';
import type { FeatureHooks, HandlerMap, ViewPieces } from './types.js';

/** Each domain's handlers put together, in alphabetical order. */
export const handlers: HandlerMap<ClientMsg> = {
  ...accountsHandlers,
  ...bountiesHandlers,
  ...changesHandlers,
  ...floorHandlers,
  ...githubHandlers,
  ...meetingHandlers,
  ...missionHandlers,
  ...planHandlers,
  ...presenceHandlers,
  ...queueHandlers,
  ...reputationHandlers,
  ...settingsHandlers,
  ...showcaseHandlers,
  ...signinsHandlers,
  ...teamHandlers,
  ...timelineHandlers,
  ...usageHandlers,
  ...whiteboardHandlers,
  ...workerHandlers,
};

/**
 * The features that keep something per person on a floor, in the order they let go of it when
 * someone leaves the floor or the office (see FeatureHooks): the order the office has always done it in.
 */
export const features: readonly FeatureHooks[] = [workerHooks, changesHooks, whiteboardHooks];

/** What someone arriving on a floor is sent (see office/views.ts): a piece from each feature, in the order it has always gone out. */
export const views: ViewPieces = {
  project: projectView,
  workers: workersView,
  issues: issuesView,
  pulls: pullsView,
  queue: queueView,
  plan: planView,
  services: servicesView,
  whiteboard: whiteboardView,
  meeting: meetingView,
  mission: missionView,
  bounties: bountiesView,
};
