import test from 'node:test';
import assert from 'node:assert/strict';
import { whereabouts } from '../src/client/ui/whereabouts.js';
import { MEETING_TABLE } from '../src/shared/layout.js';
import type { PeerInfo } from '../src/shared/protocol.js';

function peer(x: number, z: number, floor?: string, y = 0): PeerInfo {
  return { id: 'p', name: 'P', color: '#fff', look: { skin: 0, hair: 0, style: 0 }, x, y, z, rotY: 0, moving: false, voice: false, muted: false, sharing: false, floor };
}

test('the meeting room and a seat have their own words, and walking about has none', () => {
  assert.equal(whereabouts(peer(MEETING_TABLE.x, MEETING_TABLE.z - 1, 'agent-office')), 'in the meeting room');
  assert.equal(whereabouts({ ...peer(10.5, 0, 'agent-office'), seat: 'couch:1' }), 'on the couch');
  assert.equal(whereabouts(peer(0, 3, 'agent-office')), undefined);
});

test('someone on the 2D view is on the 2D view, unless they have something open', () => {
  assert.equal(whereabouts({ ...peer(0, 0, 'agent-office'), lite: true }), 'on the 2D view');
  assert.equal(whereabouts({ ...peer(0, 0, 'agent-office'), lite: true, doing: "in Pixel's terminal" }), "in Pixel's terminal");
});
