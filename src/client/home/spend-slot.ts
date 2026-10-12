// Where spend and control (spend.ts) plug into the list, the pane, the pulse and the commands. It
// loads just after the page first draws, so it costs the first load nothing
// (tests/home-budget.test.ts); until then, and if it never loads, those places draw without it.

import type { ServerMsg } from '../../shared/protocol';
import type { Net } from '../net';
import { home } from './state';

type Spend = typeof import('./spend');

let spend: Spend | undefined;

/** Spend and control, once loaded. */
export const spendUi = (): Spend | undefined => spend;

/** Loads it, puts Pause all in the top bar, and draws the page again with the badges. */
export function installSpend(net: Net) {
  void import('./spend').then((m) => {
    spend = m;
    m.installSpend(net);
    home.change();
  });
}

/** Hands it the server's messages, once it's loaded. */
export function spendMessage(msg: ServerMsg) {
  spend?.spendMessage(msg);
}
