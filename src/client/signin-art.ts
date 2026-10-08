// What the sign-in pages (login, join, claim) share besides their sheet: the credit under the card,
// and the colors the lights were last set to in this browser (lighting.ts). Nothing behind the card:
// one field, one button. Static, drawn once.
import { UPSTREAM_CREDIT } from '../shared/copy';
import { markPageLight, savedLighting } from './lighting';

/** The credit under the card, in the page's colors. */
export function mountSigninArt() {
  markPageLight(savedLighting());
  const foot = document.createElement('footer');
  foot.className = 'credit';
  const a = document.createElement('a');
  a.href = 'https://github.com/AgentSystemLabs/agent-office';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = UPSTREAM_CREDIT;
  foot.append(a);
  document.body.append(foot);
}
