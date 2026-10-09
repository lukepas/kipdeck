// The three Settings panes every page has, in the inbox's words: Account (who you're signed in as,
// your password, signing out), Agents (what agents start on, how many run at once, what happens after
// a merge, where new projects are cloned, the office's prompts) and Notifications (this browser's
// desktop notifications, the team's Slack or Discord channel). No three.js and nothing of the 3D
// bridge: the home page loads this when Settings is first opened. A page adds rows of its own through
// `extra`; the Deck adds its own panes after these (ui/settings.ts).
import type { Net } from '../net';
import { store, type Settings } from '../state';
import { askNotifyPermission, notifyPermission } from '../notify';
import type { WebhookKind } from '../../shared/protocol';
import { h, timeAgo } from './dom';
import { agentFields, choiceLabel, officeChoice } from './provider';
import { openPromptEditor, rewrittenPrompts } from './prompts';
import { setting, type SettingsPaneDef } from './settings-frame';

export type CorePane = 'account' | 'agents' | 'notify';

const WEBHOOK_NAME: Record<WebhookKind, string> = { slack: 'Slack', discord: 'Discord', other: 'a webhook' };

export interface CoreDeps {
  net: Net;
  settings: () => Settings;
  change: (some: Partial<Settings>) => void;
  /** Shows a sample desktop notification. */
  sample: () => void;
  signOut: () => void;
  /** Rows a page adds at the end of a pane. */
  extra?: Partial<Record<CorePane, Node[]>>;
}

/** The three panes, and `off` to stop following the office once Settings closes. */
export function corePanes(d: CoreDeps): { panes: SettingsPaneDef<CorePane>[]; off: () => void } {
  const { net } = d;
  const offs: (() => void)[] = [];
  const follow = (fn: () => void, ...topics: Parameters<typeof store.on>[0][]) => {
    fn();
    for (const t of topics) offs.push(store.on(t, fn));
  };

  // ---- Account --------------------------------------------------------------------------------
  const account = store.me.account;
  const signOut = h('button.btn', { type: 'button', onclick: d.signOut }, 'Sign out');
  const signedIn = account
    ? `As ${account.name}, with your own account (${account.role}).`
    : store.me.admin
      ? `As ${store.profile.name}, an admin of this Kipdeck.`
      : `As ${store.profile.name}.`;
  // Your own account's password: a new one signs you out of every other browser (the office does it).
  const pwCurrent = h('input', { type: 'password', placeholder: 'Current password', 'aria-label': 'Current password', autocomplete: 'current-password' }) as HTMLInputElement;
  const pwNew = h('input', { type: 'password', placeholder: 'New password', 'aria-label': 'New password', autocomplete: 'new-password' }) as HTMLInputElement;
  const pwSave = h('button.btn', { type: 'button' }, 'Change password');
  const pwNote = h('p.setting-note', {}, 'A new password signs you out of every other browser.');
  pwSave.addEventListener('click', async () => {
    if (!pwCurrent.value || !pwNew.value) return (pwCurrent.value ? pwNew : pwCurrent).focus();
    pwSave.disabled = true;
    try {
      const res = await fetch('/api/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current: pwCurrent.value, password: pwNew.value }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) return location.reload();
      pwNote.textContent = body.error ?? `That didn't work (${res.status})`;
    } catch {
      pwNote.textContent = "Couldn't reach Kipdeck";
    }
    pwSave.disabled = false;
  });

  // ---- Agents ---------------------------------------------------------------------------------
  // The agent everyone starts on, unless whoever deploys one picks another. Admins pick it.
  const agent = agentFields(store.project, 'office-agent', officeChoice(store.project));
  let agentTouched = false;
  agent.element.addEventListener('change', () => (agentTouched = true));
  agent.element.addEventListener('input', () => (agentTouched = true));
  const agentSave = h('button.btn.primary', { type: 'button' }, 'Save');
  const agentBack = h('button.btn', { type: 'button' });
  const agentActions = h('div.seg', { style: 'margin-top:8px' }, agentSave, agentBack);
  const agentNow = h('p.outside-now');
  const agentNote = h('p.setting-note');
  follow(() => {
    const admin = store.me.admin;
    const picked = store.prompts.agent;
    const now = officeChoice(store.project);
    agent.element.classList.toggle('hidden', !admin);
    agentActions.classList.toggle('hidden', !admin);
    agentNow.classList.toggle('hidden', admin);
    agentNow.textContent = choiceLabel(now);
    agentBack.classList.toggle('hidden', !picked);
    agentBack.textContent = `Back to ${store.project?.agentCmd.split(' ')[0].split(/[\\/]/).pop() ?? 'the --agent'}`;
    if (!agentTouched) agent.set(now);
    agentNote.textContent =
      'The Deploy sheet starts on this agent and model. Pick another there for one agent only.' +
      (picked ? ` Set by ${picked.by} ${timeAgo(picked.at)}.` : ' It is the agent Kipdeck was started with, on its own default model.') +
      (admin ? '' : ' Admins can change it.');
  }, 'prompts', 'me');
  agentSave.addEventListener('click', () => {
    if (!agent.valid()) return;
    agentTouched = false;
    net.send({ t: 'prompts.agent', choice: agent.choice() });
  });
  agentBack.addEventListener('click', () => {
    agentTouched = false;
    net.send({ t: 'prompts.agent', choice: null });
  });

  // The most agents running at once, across every project. Admins set it.
  const limitInput = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'Most agents at once', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  // Saved as you leave the box or press Enter: no button of its own.
  const limitClear = h('button.btn', { type: 'button' });
  const limitRow = h('div.webhook', {}, limitInput, limitClear);
  const limitNote = h('p.setting-note');
  follow(() => {
    const m = store.machine;
    const admin = store.me.admin;
    limitRow.classList.toggle('hidden', !admin);
    limitInput.placeholder = m.ceiling ? `1 to ${m.ceiling}` : 'e.g. 6';
    limitClear.textContent = m.ceiling ? `Back to ${m.ceiling}` : 'No limit';
    limitClear.classList.toggle('hidden', !m.set);
    const now =
      m.limit === undefined
        ? `No limit. ${m.workers} running now, across every project.`
        : `At most ${m.limit} at once, across every project (${m.workers} now). Deploying past that is refused.`;
    const from = m.set ? ` Set by ${m.set.by} ${timeAgo(m.set.at)}.` : '';
    const cap = m.ceiling ? ` Kipdeck was started with --max-workers ${m.ceiling}, so it can't go higher.` : '';
    limitNote.textContent = now + from + cap + (admin ? '' : ' Admins can change it.');
  }, 'machine', 'me');
  const saveLimit = () => {
    const n = Number(limitInput.value.trim());
    if (!limitInput.value.trim() || !Number.isInteger(n) || n < 1) return limitInput.focus();
    net.send({ t: 'machine.limit', limit: n });
    limitInput.value = '';
  };
  limitInput.addEventListener('change', () => limitInput.value.trim() && saveLimit());
  limitInput.addEventListener('keydown', (e) => e.key === 'Enter' && saveLimit());
  limitClear.addEventListener('click', () => net.send({ t: 'machine.limit', limit: null }));

  // Whether an agent whose work merged is archived by itself, for everyone.
  const leaveRow = h('div.seg', { role: 'radiogroup', 'aria-label': 'Agents whose work merged' });
  const leaveNote = h('p.setting-note');
  follow(() => {
    const { on, by, at } = store.leaveOnMerge;
    leaveRow.replaceChildren(
      ...([
        [true, 'Archive them'],
        [false, 'Keep them in Ready'],
      ] as const).map(([value, label]) =>
        h('button.btn', { type: 'button', role: 'radio', 'aria-checked': String(on === value), class: on === value ? 'on' : '', onclick: () => store.leaveOnMerge.on !== value && net.send({ t: 'leaveOnMerge.set', on: value }) }, label),
      ),
    );
    const now = on
      ? "Once an agent's pull request merges and it isn't working or waiting on you, its session ends and its worktree and branch are deleted. A worktree with uncommitted changes, or commits that aren't on GitHub, is kept."
      : 'An agent whose pull request merged stays in Ready until someone archives it.';
    leaveNote.textContent = `${now} The same for everyone${by ? `, set by ${by}${at ? ` ${timeAgo(at)}` : ''}` : ''}.`;
  }, 'leaveOnMerge');

  // Where new projects are cloned on Kipdeck's machine. Admins move it.
  const dirInput = h('input', { type: 'text', placeholder: '~/Workspace', 'aria-label': 'Projects folder', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const dirSave = h('button.btn.primary', { type: 'button' }, 'Save');
  const dirDefault = h('button.btn', { type: 'button', onclick: () => net.send({ t: 'floor.projectsDir', dir: '' }) }, 'Use the default');
  const dirRow = h('div.webhook', {}, dirInput, dirSave);
  const dirActions = h('div.seg', { style: 'margin-top:8px' }, dirDefault);
  const dirNote = h('p.setting-note');
  follow(() => {
    const { dir, custom, by, at } = store.projectsDir;
    const admin = store.me.admin;
    dirInput.value = dir;
    dirRow.classList.toggle('hidden', !admin);
    dirActions.classList.toggle('hidden', !admin || !custom);
    dirNote.textContent =
      `Projects added from GitHub are cloned into ${dir}/<owner>/<repo>.` +
      (custom && by && at ? ` Set by ${by} ${timeAgo(at)}.` : '') +
      (admin ? ' A checkout of the same repository already there is used as it is.' : ' An admin can move it.');
  }, 'projectsDir', 'me');
  const saveDir = () => {
    const dir = dirInput.value.trim();
    if (!dir) return dirInput.focus();
    if (dir !== store.projectsDir.dir) net.send({ t: 'floor.projectsDir', dir });
  };
  dirSave.addEventListener('click', saveDir);
  dirInput.addEventListener('keydown', (e) => e.key === 'Enter' && saveDir());

  // The prompts Kipdeck writes for agents by itself. Admins rewrite them.
  const promptsOpen = h('button.btn', { type: 'button', onclick: () => openPromptEditor(net) });
  const promptsNote = h('p.setting-note');
  follow(() => {
    const n = rewrittenPrompts();
    promptsOpen.textContent = store.me.admin ? 'Edit the prompts...' : 'Read the prompts...';
    promptsNote.textContent =
      'What the buttons that hand an agent work add to its task: an issue or pull request from the boards, a task from the queue, Fix checks. ' +
      (n ? `${n} of them rewritten.` : 'All as Kipdeck wrote them.') +
      (store.me.admin ? '' : ' Admins can rewrite them.');
  }, 'prompts', 'me');

  // ---- Notifications --------------------------------------------------------------------------
  // Desktop notifications: this browser's permission, then your own on or off.
  const notifyRow = h('div.seg');
  const notifyNote = h('p.setting-note');
  const paintNotify = () => {
    const perm = notifyPermission();
    const on = perm === 'granted' && d.settings().notify;
    notifyRow.replaceChildren();
    if (perm === 'default') {
      notifyRow.append(
        h('button.btn.primary', {
          type: 'button',
          onclick: async () => {
            if ((await askNotifyPermission()) === 'granted') {
              d.change({ notify: true });
              d.sample();
            }
            paintNotify();
          },
        }, 'Turn on notifications'),
      );
    } else if (perm === 'granted') {
      for (const [value, label] of [
        [true, 'On'],
        [false, 'Off'],
      ] as const) {
        notifyRow.append(
          h('button.btn', { type: 'button', role: 'radio', 'aria-checked': String(on === value), class: on === value ? 'on' : '', onclick: () => (d.change({ notify: value }), paintNotify()) }, label),
        );
      }
      if (on) notifyRow.append(h('button.btn', { type: 'button', onclick: d.sample }, 'Show me one'));
    }
    notifyNote.textContent =
      perm === 'unsupported'
        ? "This browser can't show notifications from this page. They need https or localhost (an SSH tunnel counts)."
        : perm === 'denied'
          ? 'Your browser blocks notifications from this page. Allow them in the site settings (the icon left of the address), then open this again.'
          : 'Only when an agent starts needing you or has something to review, while you are in another tab or app. Click one to go straight to that agent. The tab title counts them either way.';
  };
  paintNotify();

  // The team's Slack or Discord webhook, shared by everyone.
  const hookStatus = h('p.setting-note');
  const hookInput = h('input', { type: 'text', placeholder: 'https://hooks.slack.com/services/...', 'aria-label': 'Slack or Discord webhook URL', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const hookSave = h('button.btn.primary', { type: 'button' }, 'Save');
  const hookTest = h('button.btn', { type: 'button', onclick: () => net.send({ t: 'notify.test' }) }, 'Send a test');
  const hookRemove = h('button.btn.danger', { type: 'button', onclick: () => net.send({ t: 'notify.webhook', url: '' }) }, 'Remove');
  const hookActions = h('div.seg', { style: 'margin-top:8px' }, hookTest, hookRemove);
  const hookRow = h('div.webhook', {}, hookInput, hookSave);
  follow(() => {
    const { webhook, error, lastSentAt } = store.notify;
    const admin = store.me.admin;
    hookRow.classList.toggle('hidden', !admin);
    hookRemove.classList.toggle('hidden', !admin);
    hookTest.classList.toggle('hidden', !admin);
    hookActions.classList.toggle('hidden', !webhook);
    hookSave.textContent = webhook ? 'Replace' : 'Save';
    hookStatus.classList.toggle('bad', !!error);
    hookStatus.textContent = !webhook
      ? "Paste an incoming https webhook from Slack or Discord, and that channel hears when an agent needs input, finishes or gets stuck and nobody has it open. It's for everyone."
      : error
        ? `Posting to ${WEBHOOK_NAME[webhook.kind]} (${webhook.hint}) failed: ${error}`
        : `Posting to ${WEBHOOK_NAME[webhook.kind]} (${webhook.hint}), set by ${webhook.by} ${timeAgo(webhook.at)}${lastSentAt ? ` · last message ${timeAgo(lastSentAt)}` : ''}.`;
    if (!admin) hookStatus.textContent += ' Admins can change it.';
  }, 'notify', 'me');
  const saveHook = () => {
    const url = hookInput.value.trim();
    if (!url) return hookInput.focus();
    net.send({ t: 'notify.webhook', url });
    hookInput.value = '';
  };
  hookSave.addEventListener('click', saveHook);
  hookInput.addEventListener('keydown', (e) => e.key === 'Enter' && saveHook());

  const extra = d.extra ?? {};
  const panes: SettingsPaneDef<CorePane>[] = [
    {
      id: 'account',
      icon: 'operator',
      label: 'Account',
      blurb: "Who you're signed in as, and how this page looks for you.",
      body: [
        setting('Signed in', null, h('p.setting-note', {}, signedIn), h('div.seg', { style: 'margin-top:8px' }, signOut)),
        ...(account ? [setting('Password', null, h('div.webhook', {}, pwCurrent, pwNew, pwSave), pwNote)] : []),
        ...(extra.account ?? []),
      ],
    },
    {
      id: 'agents',
      icon: 'units',
      label: 'Agents',
      blurb: 'What agents start on, how many run at once, and what happens after a merge. These apply to everyone using this Kipdeck.',
      body: [
        setting('Default agent', 'office', agentNow, agent.element, agentActions, agentNote),
        setting('Agents at once', 'office', limitRow, limitNote),
        setting('After a merge', 'office', leaveRow, leaveNote),
        setting('Projects folder', 'office', dirRow, dirActions, dirNote),
        setting('Prompts', 'office', promptsOpen, promptsNote),
        ...(extra.agents ?? []),
      ],
    },
    {
      id: 'notify',
      icon: 'bell',
      label: 'Notifications',
      blurb: 'Hear about an agent that needs you, or has something to review, while you are somewhere else.',
      body: [setting('Desktop notifications', 'you', notifyRow, notifyNote), setting('Team channel (Slack or Discord)', 'office', hookRow, hookActions, hookStatus), ...(extra.notify ?? [])],
    },
  ];
  return { panes, off: () => offs.forEach((off) => off()) };
}
