import { MEETING_ROOM, SEATING_BY_ID, WING, inWing, seatAt } from '../../shared/layout';
import type { PeerInfo } from '../../shared/protocol';

/**
 * What a teammate is up to, for the line under their name tag and in the sidebar: whatever they have
 * open ("in Pixel's terminal", "reading PR #12"), else somewhere worth saying they are ("on
 * the lounge seat", "in the review bay"). Nothing while they're just walking about the deck.
 */
export function whereabouts(p: PeerInfo): string | undefined {
  if (p.doing) return p.doing;
  // Not standing anywhere: in on the 2D view, from a phone, say.
  if (p.lite) return 'on the 2D view';
  const place = p.seat ? seatAt(p.seat) : undefined;
  const seat = place && SEATING_BY_ID.get(place.seatId);
  if (seat) {
    // "Captain's chair" -> "in the captain's chair", "Lounge seat" -> "on the lounge seat" (a 3D sign's
    // leading symbol, if it has one, is left out).
    const name = seat.label.replace(/^[^\p{L}\p{N}]+/u, '');
    return `${/chair$/i.test(name) ? 'in' : 'on'} the ${name.toLowerCase()}`;
  }
  // Through the north wall in the overflow bay (the back office): nobody gets there unless the floor's built out.
  if (p.y > -1 && inWing(p.x, p.z, WING.rows)) return 'in the overflow bay';
  if (p.x > MEETING_ROOM.minX && p.x < MEETING_ROOM.maxX && p.z > MEETING_ROOM.minZ && p.z < MEETING_ROOM.maxZ) return 'in the review bay';
  return undefined;
}

