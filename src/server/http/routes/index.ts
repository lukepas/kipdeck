// Every HTTP route the office answers, in the order they're tried: a new route goes where it has to
// come in that order (see http/router.ts). The public ones are tried first, then the sign-in check,
// then the rest; the last one answers every path left with the client bundle, or a 404.
import type { Route } from '../router.js';
import { actionRoutes } from './actions.js';
import { agentRoutes } from './agents.js';
import { authRoutes } from './auth.js';
import { demoRoutes } from './demo.js';
import { fileRoutes } from './files.js';
import { githubRoutes } from './github.js';
import { localRoutes } from './local.js';
import { pageRoutes } from './pages.js';
import { reputationRoutes } from './reputation.js';
import { searchRoutes } from './search.js';
import { serviceRoutes } from './services.js';
import { showcaseRoutes } from './showcase.js';
import { x402Routes } from './x402.js';

/** A route that's only there while Proof of Merge is on in Labs (see labs.ts): off, it answers nothing. */
const proof = (route: Route): Route => ({ ...route, lab: 'proof' });

export const routes: readonly Route[] = [
  // The read-only demo signs whoever opens it in to watch (only there with --demo --read-only).
  demoRoutes.enter,
  // Anyone.
  authRoutes.login,
  authRoutes.loginOptions,
  authRoutes.join,
  authRoutes.claimable,
  authRoutes.claim,
  authRoutes.link,
  // Commands on this computer with the office's local key (kipdeck open, attach).
  localRoutes.link,
  localRoutes.attach,
  authRoutes.logout,
  authRoutes.password,
  pageRoutes.health,
  pageRoutes.assets,
  pageRoutes.login,
  pageRoutes.claim,
  pageRoutes.join,
  pageRoutes.favicon,
  // Proof of Merge (Labs, testnets), each only while the lab is on.
  // The public "Fund this issue" Action (devnet), for opted-in repositories only.
  proof(actionRoutes.manifest),
  proof(actionRoutes.icon),
  proof(actionRoutes.fund),
  // Paid tasks over x402 (testnets, --x402 only): the payment is what lets the payer in.
  proof(x402Routes.offer),
  proof(x402Routes.task),
  // Merge-based agent reputation (--reputation): read only, for anyone.
  proof(reputationRoutes.agent),
  proof(reputationRoutes.leaderboard),
  proof(reputationRoutes.dataset),
  proof(reputationRoutes.card),
  // The public showcase (/pom/), once an admin turns it on: read only, GET only.
  proof(showcaseRoutes.page),
  proof(showcaseRoutes.files),
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
  pageRoutes.home,
  pageRoutes.bridge,
  pageRoutes.lite,
  pageRoutes.bundle,
];
