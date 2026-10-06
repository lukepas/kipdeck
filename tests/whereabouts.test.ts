import test from 'node:test';
import assert from 'node:assert/strict';
import { whereabouts } from '../src/client/ui/whereabouts.js';
import { MEETING_TABLE } from '../src/shared/layout.js';
import type { PeerInfo } from '../src/shared/protocol.js';

function peer(x: number, z: number, floor?: string, y = 0): PeerInfo {
  return { id: 'p', name: 'P', color: '#fff', look: { skin: 0, hair: 0, style: 0 }, x, y, z, rotY: 0, moving: false, voice: false, muted: false, sharing: false, floor };
}

test('the review bay and a seat have their own words, and walking about has none', () => {
  assert.equal(whereabouts(peer(MEETING_TABLE.x, MEETING_TABLE.z - 1, 'agent-office')), 'in the review bay');
  assert.equal(whereabouts({ ...peer(0, 10.95, 'agent-office', 1.8), seat: 'conn:0' }), "in the captain's chair");
  assert.equal(whereabouts({ ...peer(2, -14, 'agent-office', 2.2), seat: 'view-2:0' }), 'on the lounge seat');
  assert.equal(whereabouts({ ...peer(0, -4.4, 'agent-office'), seat: 'couch:1' }), undefined, 'the operator bench is gone');
  assert.equal(whereabouts(peer(0, 3, 'agent-office')), undefined);
});

test('someone on the 2D view is on the 2D view, unless they have something open', () => {
  assert.equal(whereabouts({ ...peer(0, 0, 'agent-office'), lite: true }), 'on the 2D view');
  assert.equal(whereabouts({ ...peer(0, 0, 'agent-office'), lite: true, doing: "in Pixel's terminal" }), "in Pixel's terminal");
});
