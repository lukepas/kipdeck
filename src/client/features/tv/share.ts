// Which shared screen the Attention board shows, and what E at the board does with it. Pure, so the
// board (./index.ts), voice (features/voice) and the tests agree. There is no seat for watching: E at
// the board itself watches what's on it full screen, or shares your screen while nobody is sharing.

/** The screens shared on a floor, by who's sharing them ('You' for your own). */
export type Shares = readonly (readonly [who: string, stream: unknown])[];

/** The share up on the board: someone else's before your own (yours is what the others see anyway). */
export function onTv<S extends Shares>(shares: S): S[number] | undefined {
  return shares.find(([who]) => who !== 'You') ?? shares[0];
}

/** What E at the Attention board does: watch what's on it full screen, or share your screen when nothing is. */
export function tvAction(shares: Shares): 'watch' | 'share' {
  return shares.length ? 'watch' : 'share';
}
