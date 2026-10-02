import { rankRoster, type Ranked } from '../../../shared/attention';
import { emptyMission } from '../../../shared/mission';
import type { Mission, RosterEntry } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** Every hired worker in the building, on every floor (see RosterEntry). */
    roster: RosterEntry[];
    /** What the floor you're on is for: its mission statement and milestones. */
    mission: Mission;
    /** The roster ranked by who needs someone most (see shared/attention.ts), now; `floor` for one floor's. */
    ranked(floor?: string | null): Ranked[];
    /** A worker's roster entry, on any floor. */
    rosterEntry(id: string): RosterEntry | undefined;
  }
  interface Topics {
    roster: true;
    mission: true;
  }
}

/** Mission control: the building-wide roster, and the floor's mission. */
export const mission: Slice = {
  init(s) {
    s.roster = [];
    s.mission = emptyMission();
  },
  methods: {
    ranked(floor) {
      const now = Date.now();
      return rankRoster(floor === undefined ? this.roster : this.roster.filter((e) => e.floor === floor), now);
    },
    rosterEntry(id) {
      return this.roster.find((e) => e.id === id);
    },
  },
  on: {
    welcome(s, m) {
      s.roster = m.roster ?? [];
      return ['roster'];
    },
    roster(s, m) {
      s.roster = m.entries;
      return ['roster'];
    },
    mission(s, m) {
      if (m.floor !== s.floor) return;
      s.mission = m.mission;
      return ['mission'];
    },
  },
  enter(s, v) {
    s.mission = v.mission ?? emptyMission();
    return ['mission'];
  },
};
