// Every HTTP route the office answers, in the order they're tried: a new route goes where it has to
// come in that order (see http/router.ts). The public ones are tried first, then the sign-in check,
// then the rest; the last one answers every path left with the client bundle, or a 404.
import type { Route } from '../router.js';
import { actionRoutes } from './actions.js';
import { agentRoutes } from './agents.js';
import { authRoutes } from './auth.js';
import { fileRoutes } from './files.js';
import { githubRoutes } from './github.js';
import { pageRoutes } from './pages.js';
import { reputationRoutes } from './reputation.js';
import { searchRoutes } from './search.js';
import { serviceRoutes } from './services.js';
import { showcaseRoutes } from './showcase.js';
import { x402Routes } from './x402.js';

export const routes: readonly Route[] = [
  // Anyone.
  authRoutes.login,
  authRoutes.loginOptions,
  authRoutes.join,
  authRoutes.claimable,
  authRoutes.claim,
  authRoutes.link,
  authRoutes.logout,
  authRoutes.password,
  pageRoutes.health,
  pageRoutes.assets,
  pageRoutes.login,
  pageRoutes.claim,
  pageRoutes.join,
  pageRoutes.favicon,
  // The public "Fund this issue" Action (devnet), for opted-in repositories only.
  actionRoutes.manifest,
  actionRoutes.icon,
  actionRoutes.fund,
  // Paid tasks over x402 (testnets, --x402 only): the payment is what lets the payer in.
  x402Routes.offer,
  x402Routes.task,
  // Merge-based agent reputation (--reputation): read only, for anyone.
  reputationRoutes.agent,
  reputationRoutes.leaderboard,
  reputationRoutes.dataset,
  reputationRoutes.card,
  // The public showcase (/pom/), once an admin turns it on: read only, GET only.
  showcaseRoutes.page,
  showcaseRoutes.files,
  // Signed in.
  authRoutes.whoami,
  agentRoutes.models,
  fileRoutes.whiteboardFile,
  fileRoutes.termDrop,
  fileRoutes.changedFile,
  fileRoutes.docs,
  searchRoutes.search,
  serviceRoutes.forwards,
  githubRoutes.github,
  pageRoutes.office,
  pageRoutes.lite,
  pageRoutes.bundle,
];
