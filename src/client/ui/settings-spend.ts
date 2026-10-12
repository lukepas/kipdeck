// Settings > Agents, the rows for spend and control (docs/spend.md): each project's default
// permission mode, and the budget caps that pause an agent (per agent, and for everyone in a day).
// Everyone sees them; admins change them. Shared by the inbox and the Deck through settings-core.ts.
import { AUTONOMY_META, AUTONOMY_MODES, MODE_PROVIDERS, isAutonomy } from '../../shared/autonomy';
import { fmtCost } from '../../shared/protocol/usage';
import { PROVIDER_META } from '../../shared/providers';
import { cleanCap } from '../../shared/spend';
import type { Net } from '../net';
import { store } from '../state';
import { h, timeAgo } from './dom';
import { setting } from './settings-frame';
import './settings-spend.css';

type Follow = (fn: () => void, ...topics: ('spend' | 'floors' | 'me')[]) => void;

/** The two rows, kept current while Settings is open through `follow`. */
export function spendSettings(net: Net, follow: Follow): Node[] {
  // Whatever page opened Settings, it hears the current state now.
  net.send({ t: 'spend.get' });
  const which = MODE_PROVIDERS.map((p) => PROVIDER_META[p].label).join(', ');

  // ---- Permission mode, per project ------------------------------------------------------------
  const modes = h('div.spend-modes');
  const modeNote = h('p.setting-note');
  follow(() => {
    const admin = store.me.admin;
    const floors = store.floors.filter((f) => !f.cloning);
    const set = store.spend?.modes ?? {};
    modes.replaceChildren(
      ...floors.map((f) => {
        const now = set[f.id];
        if (!admin) return h('p.spend-mode-row', {}, h('b', {}, f.name), ` ${now ? AUTONOMY_META[now].badge : "the agent's own settings"}`);
        const select = h(
          'select.spend-mode',
          { 'aria-label': `Permission mode for ${f.name}` },
          h('option', { value: '' }, "Agent's own settings"),
          ...AUTONOMY_MODES.map((m) => h('option', { value: m }, `${AUTONOMY_META[m].badge}: ${AUTONOMY_META[m].says}`)),
        ) as HTMLSelectElement;
        select.value = now ?? '';
        select.addEventListener('change', () => net.send({ t: 'spend.mode', floor: f.id, mode: isAutonomy(select.value) ? select.value : null }));
        return h('label.spend-mode-row', {}, h('b', {}, f.name), select);
      }),
    );
    modeNote.textContent =
      `New ${which} agents on a project start in its mode, and each row shows the mode as a badge. ` +
      'A mode on the command line Kipdeck was started with (--agent-args or AGENT_OFFICE_AGENT_ARGS) wins. Other agents show what their own command line says.' +
      (admin ? '' : ' Admins can change it.');
  }, 'spend', 'floors', 'me');

  // ---- Budget caps --------------------------------------------------------------------------------
  const agentCap = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Per agent, $', 'aria-label': 'Budget per agent, in dollars', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const dayCap = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Per day, $', 'aria-label': 'Budget per day, in dollars', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const capRow = h('div.webhook.spend-caps', {}, agentCap, dayCap);
  const capNote = h('p.setting-note');
  const save = (input: HTMLInputElement, key: 'agentCap' | 'dayCap') => {
    const raw = input.value.trim();
    const v = raw ? cleanCap(raw) : null;
    if (raw && v === undefined) return input.focus();
    net.send({ t: 'spend.caps', [key]: v ?? null });
  };
  for (const [input, key] of [[agentCap, 'agentCap'], [dayCap, 'dayCap']] as const) {
    input.addEventListener('change', () => save(input, key));
    input.addEventListener('keydown', (e) => e.key === 'Enter' && save(input, key));
  }
  follow(() => {
    const s = store.spend;
    const admin = store.me.admin;
    capRow.classList.toggle('hidden', !admin);
    if (document.activeElement !== agentCap) agentCap.value = s?.agentCap ? String(s.agentCap) : '';
    if (document.activeElement !== dayCap) dayCap.value = s?.dayCap ? String(s.dayCap) : '';
    const caps = [s?.agentCap ? `${fmtCost(s.agentCap)} per agent` : '', s?.dayCap ? `${fmtCost(s.dayCap)} a day` : ''].filter(Boolean).join(' and ');
    const today = s ? `Agents spent ${fmtCost(s.today)} today.` : '';
    const by = s?.by && s.at ? ` Set by ${s.by} ${timeAgo(s.at)}.` : '';
    capNote.textContent =
      `${caps ? `Capped at ${caps}.` : 'No cap.'} ${today} At 80 percent everyone gets a warning; at 100 percent an agent at work is paused and waits in Needs you until someone lets it carry on. ` +
      "Only agents whose CLI reports a cost count (Claude Code, OpenCode); the inbox says how many it can't count." +
      by +
      (admin ? ' Leave a box empty for no cap.' : ' Admins can change them.');
  }, 'spend', 'me');

  return [setting('Permission mode', 'floor', modes, modeNote), setting('Budget', 'office', capRow, capNote)];
}
