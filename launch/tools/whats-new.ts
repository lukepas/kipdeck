// The older kits' entry point to the one disclosure generator, launch/chain/tools/whats-new.ts. It used
// to keep its own copy, which counted from upstream's 665aeec by author; our history starts from snapshot
// imports of upstream instead, so both kits now read the same rules (launch/chain/deadlines.json):
//
//   npx tsx launch/tools/whats-new.ts                 since the baseline (226452e4, our import of upstream 1bc3028)
//   npx tsx launch/tools/whats-new.ts --base <sha>    since another commit
//
// Paste its output under "Exactly what is new" in the kit you are submitting.

import { isMain } from './calendar.js';
import { main } from '../chain/tools/whats-new.js';

export * from '../chain/tools/whats-new.js';

if (isMain(import.meta.url)) main(process.argv.slice(2));
