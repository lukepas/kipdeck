// The Deck in the replay demo, its rule (features/replay): the city is up in the replay, and as the
// visitor left it everywhere else.
import type { DemoInfo } from '../../../shared/demo';

/** Whether the city is up, from the welcome's demo info and the visitor's own setting. */
export const cityOnInReplay = (demo: DemoInfo | undefined, saved: boolean): boolean => saved || !!demo?.replay;
