// Proof of Merge's surfaces show only with the lab on and set up (shared/proof-ready.ts), read from the store.
import { proofReady as ready } from '../shared/proof-ready';
import { store } from './state';

/** Is Proof of Merge on and set up, as far as this page knows? */
export const proofReady = (): boolean => ready({ labs: store.labs, bounties: store.bounties, reputation: store.reputation });
