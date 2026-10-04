// Alert conditions (src/client/features/alert/logic.ts): green, amber and red from the ranking and the
// reminders, a latch that never flickers, the room stepped darker (never tinted), the stand-down aft to
// bow, and what the band says (src/shared/shiplog.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ConditionLatch, DIM, SEVERAL_STUCK, STAND_DOWN_MS, STEP_DOWN_MS, dimRig, lampLevel, rawCondition, standDownAt, whyOf, type Waiter } from '../src/client/features/alert/logic.js';
import { LIGHT_MODES } from '../src/client/features/lights/modes.js';
import { ALERT_DEFAULTS } from '../src/client/state/persist.js';
import { conditionLine, recoveredLine } from '../src/shared/shiplog.js';

const MIN = 60_000;
const th = ALERT_DEFAULTS;
const w = (level: Waiter['level'], min: number, unit = 'A-01'): Waiter => ({ level, ms: min * MIN, unit });

test('green while nobody waits long, amber past five minutes or on a reminder, red past ten stuck or with several stuck', () => {
  assert.deepEqual([th.amberMin, th.redMin, th.on], [5, 10, true]);
  assert.equal(rawCondition([], [], th), 'green');
  assert.equal(rawCondition([w('needs-you', 4)], [], th), 'green', 'a fresh call is the glyph and the beacon, not a condition');
  assert.equal(rawCondition([w('needs-you', 5)], [], th), 'amber');
  assert.equal(rawCondition([w('stuck', 6)], [], th), 'amber');
  assert.equal(rawCondition([w('needs-you', 90)], [], th), 'amber', 'needs-you never goes red: red is for stuck');
  assert.equal(rawCondition([w('stuck', 10)], [], th), 'red');
  assert.equal(SEVERAL_STUCK, 3);
  assert.equal(rawCondition([w('stuck', 1), w('stuck', 1), w('stuck', 1)], [], th), 'red');
  for (const k of ['needs-input-long', 'approved-unmerged', 'milestone-overdue'] as const) assert.equal(rawCondition([], [k], th), 'amber', k);
  assert.equal(rawCondition([], ['queue-paused', 'unpushed-asleep', 'snooze-over'], th), 'green', 'only the reminders that wait on the captain');
  // Thresholds are the captain's: 2 and 30 minutes.
  assert.equal(rawCondition([w('needs-you', 3)], [], { amberMin: 2, redMin: 30 }), 'amber');
  assert.equal(rawCondition([w('stuck', 20)], [], { amberMin: 2, redMin: 30 }), 'amber');
});

test('the latch steps up at once and down only once the lower condition has held', () => {
  const l = new ConditionLatch();
  assert.equal(STEP_DOWN_MS, 4000);
  assert.deepEqual(l.step('amber', 0), { changed: true, stoodDown: false });
  assert.deepEqual(l.step('red', 1000), { changed: true, stoodDown: false });
  // A unit blinks back to work for a moment: still red, on its way down.
  assert.deepEqual(l.step('green', 2000), { changed: false, stoodDown: false });
  assert.equal(l.stepping, true);
  l.step('red', 3000);
  l.step('green', 4000);
  assert.equal(l.step('green', 7000).changed, false);
  assert.equal(l.value, 'red');
  assert.deepEqual(l.step('green', 8000), { changed: true, stoodDown: true });
  assert.equal(l.value, 'green');
  assert.equal(l.stepping, false);
  // Red to amber is a step down, not a stand-down.
  l.step('red', 9000);
  l.step('amber', 9000);
  assert.deepEqual(l.step('amber', 13_000), { changed: true, stoodDown: false });
});

test('the room steps darker, never another colour, and the pods over a unit that waits stay up', () => {
  assert.equal(DIM.green.room, 1);
  assert.ok(Math.abs(DIM.amber.room - 0.8) < 1e-9, 'about a fifth down at amber');
  assert.ok(DIM.red.room < DIM.amber.room && DIM.red.cove < DIM.amber.cove);
  assert.equal(lampLevel('red', 'pods', true), 1);
  assert.equal(lampLevel('red', 'pods', false), DIM.red.room);
  for (const mode of ['night', 'day'] as const) {
    for (const c of ['amber', 'red'] as const) {
      const rig = LIGHT_MODES[mode];
      const dim = dimRig(rig, c);
      assert.equal(dim.exposure, rig.exposure, 'the exposure holds: the marks give their own light');
      assert.deepEqual(dim.bloom, rig.bloom);
      for (const k of ['key', 'fill', 'rim', 'pods', 'table', 'holo'] as const) {
        assert.equal(dim[k].color, rig[k].color, `${mode} ${c} ${k} keeps its colour`);
        assert.ok(dim[k].i < rig[k].i, `${mode} ${c} ${k} steps down`);
      }
      assert.deepEqual([dim.hemi.sky, dim.hemi.ground], [rig.hemi.sky, rig.hemi.ground]);
    }
  }
});

test('the stand-down brings the lights up aft to bow in 1.5 s', () => {
  assert.equal(STAND_DOWN_MS, 1500);
  const aft = 22;
  const bow = -20;
  assert.equal(standDownAt(0, aft), 0);
  assert.ok(standDownAt(500, aft) > standDownAt(500, 0), 'aft is up first');
  assert.ok(standDownAt(900, 0) > standDownAt(900, bow), 'the bow is last');
  for (const z of [aft, 0, bow]) assert.equal(standDownAt(STAND_DOWN_MS, z), 1, `all up by the end at z ${z}`);
});

test('the band says why, in plain upper case', () => {
  assert.equal(conditionLine('amber', whyOf([w('needs-you', 6, 'A-03'), w('needs-you', 7, 'B-01')], [])), 'CONDITION AMBER - 2 UNITS AWAIT ORDERS');
  assert.equal(conditionLine('amber', whyOf([w('needs-you', 6)], [])), 'CONDITION AMBER - 1 UNIT AWAITS ORDERS');
  assert.equal(conditionLine('red', whyOf([w('stuck', 14, 'C-01')], [])), 'CONDITION RED - C-01 STUCK 14 MIN');
  assert.equal(conditionLine('red', whyOf([w('stuck', 1), w('stuck', 2), w('stuck', 3)], [])), 'CONDITION RED - 3 UNITS STUCK');
  assert.equal(conditionLine('amber', whyOf([], ['approved-unmerged'])), 'CONDITION AMBER - AN APPROVED PR WAITS TO MERGE');
  assert.equal(conditionLine('green', whyOf([], []), 4), 'CONDITION GREEN - ALL STATIONS WORKING');
  assert.equal(conditionLine('green', whyOf([], []), 0), 'CONDITION GREEN - ALL CLEAR');
  assert.equal(recoveredLine('Widget', 'B-02', 40 * MIN), 'WIDGET (B-02) RECOVERED, 40M STUCK');
  assert.equal(recoveredLine('Widget', undefined, 125 * MIN), 'WIDGET RECOVERED, 2H 05M STUCK');
});
