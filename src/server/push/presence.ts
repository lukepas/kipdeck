// Who is at a desk: each page says when it's focused and being used (keys, clicks, scrolls, taps)
// and when it isn't. An open tab nobody touches doesn't count, and neither does a terminal the inbox
// opened by itself: that's what used to keep the team's channel quiet while nobody was there.
import { presentIn, type PresenceMark } from '../../shared/push.js';

export class Presence {
  private pages = new Map<string, PresenceMark & { person: string }>();

  /** A page (by its connection) of `person` is focused and was just used, or isn't any more. */
  mark(clientId: string, person: string, focused: boolean, now = Date.now()) {
    const had = this.pages.get(clientId);
    // Losing focus keeps when it was last used; it just stops counting.
    this.pages.set(clientId, { person, focused, at: focused ? now : (had?.at ?? 0) });
  }

  /** What a page last said: focused or not (undefined before it said anything). */
  focused(clientId: string): boolean | undefined {
    return this.pages.get(clientId)?.focused;
  }

  /** The page closed. */
  drop(clientId: string) {
    this.pages.delete(clientId);
  }

  /** `person` is at a desk: one of their pages is focused and was used within PRESENCE_MS. */
  present(person: string, now = Date.now()): boolean {
    return presentIn([...this.pages.values()].filter((p) => p.person === person), now);
  }

  /** Anyone is: the inbox puts a waiting agent in front of them. */
  anyone(now = Date.now()): boolean {
    return presentIn(this.pages.values(), now);
  }
}
