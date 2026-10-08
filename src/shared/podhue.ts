// The pods' goal colors: one hue per goal, so a pod's zone on the floor (features/pods), and later the
// 2D plot, tells one project from another at a glance. Six desaturated hues from cool to warm, kept
// well clear of the state hues (Signal orange "needs you", red "stuck", yellow "to review", green
// "settled", violet "proof"): a zone's color only says which goal, never that anything is wrong. The
// same values are --pod-1 to --pod-6 and --pod-none in src/client/styles/tokens.css (a test checks).
// Pure: no DOM, no three.js.

/** The goal palette: cyan-blue, violet, teal, indigo, rose, sand. */
export const POD_HUES = ['#4fa8d8', '#8e68a8', '#45a593', '#5c6fd6', '#c98aa8', '#b3a68a'] as const;

/** A pod with no goal: the deck's neutral slate. */
export const POD_HUE_NONE = '#6b7785';

/** FNV-1a over the id's UTF-16 units: the same id lands in the same slot on every page and server. */
function hash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The slot a goal prefers when nothing else on the floor wants it. */
export function preferredSlot(goalId: string): number {
  return hash(goalId) % POD_HUES.length;
}

/**
 * Each goal's slot among the floor's goals: every goal takes its preferred slot, or the next free one
 * round the palette when another goal already has it. Goals claim in order of their preferred slot,
 * then their id, so the answer doesn't depend on the order they're given in, and a new goal moves an
 * old one only when it wants the very same slot and sorts first. Up to six goals never share a hue;
 * past that they wrap.
 */
export function goalSlots(goalIds: Iterable<string | undefined>): Map<string, number> {
  const ids = [...new Set([...goalIds].filter((g): g is string => !!g))];
  ids.sort((a, b) => preferredSlot(a) - preferredSlot(b) || (a < b ? -1 : a > b ? 1 : 0));
  const taken = new Set<number>();
  const out = new Map<string, number>();
  for (const id of ids) {
    let slot = preferredSlot(id);
    if (taken.size < POD_HUES.length) while (taken.has(slot)) slot = (slot + 1) % POD_HUES.length;
    taken.add(slot);
    out.set(id, slot);
  }
  return out;
}

/**
 * A goal's hue. With `among` (the floor's current goals) it is the collision-free one goalSlots gives;
 * without, the goal's preferred slot. No goal: the neutral slate.
 */
export function goalHue(goalId: string | undefined, among?: Iterable<string | undefined>): string {
  if (!goalId) return POD_HUE_NONE;
  const slot = among ? goalSlots([...among, goalId]).get(goalId)! : preferredSlot(goalId);
  return POD_HUES[slot];
}
