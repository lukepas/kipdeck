// "For goal": which milestone of the floor's mission a new worker or queue task serves, picked as
// it's hired (the active one unless you pick another). Nothing shows while the floor has none.

import { store } from '../../state';
import { h } from '../dom';

export interface GoalPicker {
  element: HTMLElement | null;
  /** The milestone picked, by id; undefined for none (the server then picks by its issue). */
  value(): string | undefined;
}

export function goalPicker(): GoalPicker {
  const open = store.mission.milestones.filter((m) => !m.done);
  if (!open.length) return { element: null, value: () => undefined };
  const select = h(
    'select',
    { 'aria-label': 'For goal' },
    ...open.map((m) => h('option', { value: m.id, selected: m.id === store.mission.active }, m.title)),
    h('option', { value: '', selected: !open.some((m) => m.id === store.mission.active) }, 'No milestone'),
  ) as HTMLSelectElement;
  return {
    element: h('label.goal-pick', { title: "The milestone of the floor's mission this work serves" }, 'For goal', select),
    value: () => select.value || undefined,
  };
}
