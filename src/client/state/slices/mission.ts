import { attentionCounts, rankRoster, type AttentionCounts, type Ranked } from '../../../shared/attention';
import { emptyMission } from '../../../shared/mission';
import { bountyPayouts, inboxCount, reviewInbox, type ReviewItem } from '../../../shared/review';
import type { Mission, Reminder, ReviewPull, RosterEntry } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** Every hired worker in the building, on every floor (see RosterEntry). */
    roster: RosterEntry[];
    /** Pull requests waiting for a person that no worker on the roster stands for (see ReviewPull). */
    reviewQueue: ReviewPull[];
    /** Who the office's own gh is signed in as, when known. */
    ghViewer?: string;
    /** The reminders open on every floor (see Reminder), the snoozed ones too. */
    reminders: Reminder[];
    /** What the floor you're on is for: its mission statement and milestones. */
    mission: Mission;
    /** The roster ranked by who needs someone most (see shared/attention.ts), now; `floor` for one floor's. */
    ranked(floor?: string | null): Ranked[];
    /** Everything on every floor waiting for a person's decision, oldest first (see shared/review.ts). */
    inbox(): ReviewItem[];
    /**
     * How many need someone at each level across the building, as the chip and the tab title count
     * them: the ranking's, with "to review" the whole review inbox.
     */
    counts(): AttentionCounts;
    /** A worker's roster entry, on any floor. */
    rosterEntry(id: string): RosterEntry | undefined;
  }
  interface Topics {
    roster: true;
    mission: true;
    reminders: true;
  }
}

/** Mission control: the building-wide roster and review queue, the reminders, and the floor's mission. */
export const mission: Slice = {
  init(s) {
    s.roster = [];
    s.reviewQueue = [];
    s.reminders = [];
    s.ghViewer = undefined;
    s.mission = emptyMission();
  },
  methods: {
    ranked(floor) {
      const now = Date.now();
      return rankRoster(floor === undefined ? this.roster : this.roster.filter((e) => e.floor === floor), now);
    },
    inbox() {
      // Your own GitHub sign-in's login, else the office's (the shared password, or an admin on the machine's).
      const mine = this.signins?.github.status === 'ok' ? this.signins.github.who : undefined;
      // Bounties waiting for a person, only with Proof of Merge on in Labs: approving a payout is an admin's, setting a wallet anyone's.
      const payouts = this.lab('proof') ? this.floors.flatMap((f) => bountyPayouts(f, this.bounties?.[f.id])).filter((p) => p.kind !== 'approve' || this.me.admin) : [];
      return reviewInbox(this.ranked(), this.reviewQueue, mine ?? this.ghViewer, payouts);
    },
    counts() {
      const c = attentionCounts(this.ranked());
      c.review = inboxCount(this.inbox());
      return c;
    },
    rosterEntry(id) {
      return this.roster.find((e) => e.id === id);
    },
  },
  on: {
    welcome(s, m) {
      s.roster = m.roster ?? [];
      s.reviewQueue = m.reviewQueue ?? [];
      s.reminders = m.reminders ?? [];
      s.ghViewer = m.viewer;
      return ['roster', 'reminders'];
    },
    roster(s, m) {
      s.roster = m.entries;
      s.reviewQueue = m.reviewQueue ?? [];
      if (m.viewer) s.ghViewer = m.viewer;
      return ['roster'];
    },
    reminders(s, m) {
      s.reminders = m.items;
      return ['reminders'];
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
