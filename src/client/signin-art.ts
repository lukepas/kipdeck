// What the sign-in pages (login, join, claim) share besides their sheet: the colors the lights were
// last set to in this browser (lighting.ts), and Kip waving over the card on a sunset glow
// (docs/design.md#warmth-the-crew-look). The glow and the grain sit behind Kip and around the card,
// never under it, its words or its field, and the light sets drop both. Kip is decoration: aria-hidden.
// The upstream credit is in the home page's Help > About and in NOTICE, not under the card.
import { markPageLight, savedLighting } from './lighting';
import wave from './home/kip/wave';

/** The page in this browser's colors, with Kip waving over the card. */
export function mountSigninArt() {
  markPageLight(savedLighting());
  const card = document.querySelector('main.card');
  if (!card) return;
  const art = document.createElement('div');
  art.className = 'signin-kip';
  art.setAttribute('aria-hidden', 'true');
  art.innerHTML = `<span class="signin-glow"></span><span class="kip">${wave}</span>`;
  art.querySelector('svg')?.setAttribute('focusable', 'false');
  card.before(art);
}
