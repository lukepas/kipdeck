/** The board agents: what each is for, and the ones waiting by their boards before anyone has asked them anything. */
import { STATION_AGENT, type StationKind } from '../../shared/layout';
import { OFFICE_PLAN } from '../../shared/plan';
import { callSign } from '../../shared/callsign';
import { Worker } from '../world/character';
import type { DeskView } from '../world/types';
import type { World } from '../world/world';
import type { IconName } from '../ui/icons';

/** What each board agent is for: its board's icon, what it offers on the card over its head, and an example ask. */
export const STATION_INFO: Record<StationKind, { icon: IconName; offer: string; does: string; example: string }> = {
  issues: { icon: 'issue', offer: 'Ask me about issues', does: 'I file, find, triage, label and close them', example: 'File an issue: the queue board shows done tasks twice' },
  pulls: { icon: 'pull', offer: 'Ask me about PRs', does: 'I sum up, review, comment on and merge them', example: 'Review the newest PR and tell me if it’s ready to merge' },
  queue: { icon: 'queue', offer: 'Ask me to queue work', does: 'I turn it into tasks for fresh workers', example: 'Queue every open bug issue, most important first' },
};

/** A board agent waiting by its board before anyone has asked it anything (see buildKiosk), and where. */
export interface IdleAgent {
  model: Worker;
  view: DeskView;
}

/** The board agents waiting by their boards in `w`. */
export function idleAgentsIn(w: World): IdleAgent[] {
  return OFFICE_PLAN.stations.map((def) => {
    const kind = def.station!;
    const agent = STATION_AGENT[kind];
    const model = new Worker(agent.name, agent.color);
    model.setStatus('idle');
    model.setCallSign(callSign(def.id));
    model.setProvider('', agent.color);
    model.setTask({ name: STATION_INFO[kind].offer, summary: STATION_INFO[kind].does });
    const view = w.desks.get(def.id)!;
    view.vacancy.children[0].add(model.root);
    model.dockOn(view.group);
    return { model, view };
  });
}
