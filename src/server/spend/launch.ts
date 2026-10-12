// A worker's permission mode at launch: the project's default from Settings put on its command line
// when that doesn't already pick one, and the mode it ends up with noted on the worker for its badge
// (see shared/autonomy.ts). The worker manager hands every launch plan through `withMode`.
import { modeFromArgs, withDefaultMode, type Autonomy } from '../../shared/autonomy.js';
import type { WorkerInfo } from '../../shared/protocol.js';
import type { LaunchPlan } from '../providers/types.js';

/** The default mode of the project checked out in `dir`, as Settings has it; none until the office says. */
let defaultFor: (dir: string) => Autonomy | undefined = () => undefined;

/** Where the defaults come from (the Spend service, as the office starts). */
export function setDefaultModes(fn: (dir: string) => Autonomy | undefined) {
  defaultFor = fn;
}

/**
 * `plan` with the default mode of the project in `dir` added for `info`'s provider, and `info.mode`
 * set to what the final command line says (undefined: its CLI's own settings decide).
 */
export function withMode(plan: LaunchPlan, info: WorkerInfo, dir: string): LaunchPlan {
  if (info.kind !== 'agent') return plan;
  const args = withDefaultMode(info.provider, plan.args, defaultFor(dir));
  info.mode = modeFromArgs(info.provider, args);
  return args === plan.args ? plan : { ...plan, args };
}
