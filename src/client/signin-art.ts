// What the sign-in pages (login, join, claim) share besides their sheet: the colors the lights were
// last set to in this browser (lighting.ts). Nothing behind the card: one field, one button. The
// upstream credit is in the home page's Help > About and in NOTICE, not under the card.
import { markPageLight, savedLighting } from './lighting';

/** The page in this browser's colors. */
export function mountSigninArt() {
  markPageLight(savedLighting());
}
