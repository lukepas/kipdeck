import { MEETING_ROOM, SEATING_BY_ID, WING, inWing, seatAt } from '../../shared/layout';
import type { PeerInfo } from '../../shared/protocol';

/**
 * What a teammate is up to, for the line under their name tag and in the sidebar: whatever they have
 * open ("in Pixel's terminal", "reading PR #12"), else somewhere worth saying they are ("on
 * the couch", "in the meeting room"). Nothing while they're just walking around the office.
 */
export function whereabouts(p: PeerInfo): string | undefined {
  if (p.doing) return p.doing;
  // Not standing anywhere: in on the 2D view, from a phone, say.
  if (p.lite) return 'on the 2D view';
  const place = p.seat ? seatAt(p.seat) : undefined;
  const seat = place && SEATING_BY_ID.get(place.seatId);
  if (seat) {
    // "Couch" -> "on the couch" (a 3D sign's leading symbol, if it has one, is left out).
    const name = seat.label.replace(/^[^\p{L}\p{N}]+/u, '');
    return `on the ${name.toLowerCase()}`;
  }
  // Through the north wall in the back office: nobody gets there unless the floor's built out.
  if (p.y > -1 && inWing(p.x, p.z, WING.rows)) return 'in the back office';
  if (p.x > MEETING_ROOM.minX && p.z > MEETING_ROOM.minZ) return 'in the meeting room';
  return undefined;
}

