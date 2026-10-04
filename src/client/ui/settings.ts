import './settings.css';
import type { Net } from '../net';
import type { DeckSound } from '../sound';
import { store, type NeedsYouSound, type Settings, type ViewMode } from '../state';
import { askNotifyPermission, notifyPermission, type DesktopNotifier } from '../notify';
import type { WebhookKind } from '../../shared/protocol';
import { h, openModal, timeAgo } from './dom';
import { agentFields, choiceLabel, officeChoice } from './provider';
import { openPromptEditor, rewrittenPrompts } from './prompts';
import { choiceRow } from './settings-rows';
import { bountySettings } from './bounty-settings';
import { showcaseSettings } from './showcase-settings';
import { brightnessSettings, bridgeSettings, lightSettings } from './bridge-settings';
import { icon, type IconName } from './icons';

const VIEWS: [ViewMode, string, string][] = [
  ['first', 'First person', 'See through your own eyes. Click the office to look around with the mouse and click things to use them. Esc frees the mouse.'],
  ['third', 'Third person', 'Follow your operator from behind. Drag to orbit the camera, scroll to zoom, and click things to use them.'],
];


const WEBHOOK_NAME: Record<WebhookKind, string> = { slack: 'Slack', discord: 'Discord', other: 'a webhook' };

/** The categories down the side of Settings. */
export type SettingsPane = 'you' | 'bridge' | 'sound' | 'notify' | 'building' | 'workers' | 'bounties';

const PANES: { id: SettingsPane; icon: IconName; label: string; blurb: string }[] = [
  { id: 'you', icon: 'operator', label: 'You', blurb: 'How you look, how you see the office, and how you\'re signed in.' },
  { id: 'bridge', icon: 'ship', label: 'Bridge', blurb: 'The lights on the bridge, and how space moves outside the glass.' },
  { id: 'sound', icon: 'volume', label: 'Sound & voice', blurb: 'How loud the office is for you, and how voice chat works.' },
  { id: 'notify', icon: 'bell', label: 'Notifications', blurb: 'Hear about a unit that needs someone, or finished, while you\'re somewhere else.' },
  { id: 'building', icon: 'decks', label: 'Decks', blurb: 'Where new decks are cloned.' },
  { id: 'workers', icon: 'units', label: 'Units', blurb: 'What units start on, how many run at once, when they stand down and what the deck tells them.' },
  { id: 'bounties', icon: 'proof', label: 'Bounties', blurb: 'Proof of Merge: devnet USDC on issues, paid only when a person merges the office\'s pull request.' },
];

/** Who a setting is for, shown by its name: some are yours alone, some the whole office's. */
type Scope = 'you' | 'floor' | 'office';
const SCOPE: Record<Scope, [label: string, title: string]> = {
  you: ['Just you', 'Only for you, kept in this browser'],
  floor: ['This deck', 'The same for everyone on this deck'],
  office: ['Everyone', 'The same for everyone in the building'],
};

/** One setting: its name and who it's for, then whatever sets it. */
const setting = (title: string, scope: Scope | null, ...body: Node[]) =>
  h('div.setting', {}, h('div.setting-head', {}, h('h4', {}, title), scope && h('span.scope', { class: scope, title: SCOPE[scope][1] }, SCOPE[scope][0])), ...body);

/** Where Settings was last, so it opens there again. */
let lastPane: SettingsPane = 'you';

/** `first` opens on that category instead of the last one. */
export function openSettings(net: Net, settings: Settings, onChange: (s: Settings) => void, onCharacter: () => void, sound: Pick<DeckSound, 'cue'>, notifier: DesktopNotifier, onSignOut: () => void, first?: SettingsPane) {
  const seg = h('div.seg', { role: 'radiogroup', 'aria-label': 'Camera view' });
  const note = h('p.setting-note');
  const paint = () => {
    seg.replaceChildren(
      ...VIEWS.map(([view, label]) =>
        h(
          'button.btn',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(settings.view === view),
            class: settings.view === view ? 'on' : '',
            onclick: () => {
              if (settings.view === view) return;
              settings = { ...settings, view };
              onChange(settings);
              paint();
            },
          },
          label,
        ),
      ),
    );
    note.textContent = VIEWS.find(([v]) => v === settings.view)![2];
  };
  paint();

  /** A volume slider with its mute button. Dragging it turns the sound back on; letting go plays `preview`. */
  const volumeRow = (label: string, level: 'volume', muted: 'muted', preview?: () => void) => {
    const slider = h('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': label });
    const pct = h('span.vol-pct');
    const mute = h('button.btn', { type: 'button' });
    const row = h('div.volume', {}, mute, slider, pct);
    const paint = () => {
      const v = Math.round(settings[level] * 100);
      slider.value = String(v);
      slider.style.setProperty('--fill', `${v}%`);
      pct.textContent = settings[muted] ? 'Off' : `${v}%`;
      mute.textContent = settings[muted] ? 'Turn on' : 'Turn off';
      mute.setAttribute('aria-pressed', String(settings[muted]));
      mute.classList.toggle('primary', settings[muted]);
      row.classList.toggle('muted', settings[muted]);
    };
    paint();
    slider.addEventListener('input', () => {
      settings = { ...settings, [level]: Number(slider.value) / 100, [muted]: false };
      onChange(settings);
      paint();
    });
    if (preview) slider.addEventListener('change', preview);
    mute.addEventListener('click', () => {
      settings = { ...settings, [muted]: !settings[muted] };
      onChange(settings);
      paint();
      if (!settings[muted]) preview?.();
    });
    return row;
  };
  const soundRow = volumeRow('Sound cues volume', 'volume', 'muted', () => sound.cue('review'));

  /** Changes some of your own settings, and has the office take them up. */
  const change = (some: Partial<Settings>) => {
    settings = { ...settings, ...some };
    onChange(settings);
  };
  // Voice chat: an open mic, or muted until you hold V.
  const talkRow = choiceRow('Voice chat', [[false, 'Open mic'], [true, 'Push to talk']], () => settings.pushToTalk, (pushToTalk) => change({ pushToTalk }));
  // The alarm when a worker stops to ask you something; picking one plays it.
  const alarmRow = choiceRow<NeedsYouSound>('When a unit needs you', [['once', 'Once'], ['remind', 'Keep reminding me'], ['off', 'Off']], () => settings.needsYouSound, (needsYouSound) => {
    change({ needsYouSound });
    if (needsYouSound !== 'off') sound.cue('needs-you');
  });

  // Desktop notifications: this browser's permission, then your own on/off.
  const notifyRow = h('div.seg');
  const notifyNote = h('p.setting-note');
  const paintNotify = () => {
    const perm = notifyPermission();
    const on = perm === 'granted' && settings.notify;
    notifyRow.replaceChildren();
    if (perm === 'default') {
      notifyRow.append(
        h(
          'button.btn.primary',
          {
            type: 'button',
            onclick: async () => {
              if ((await askNotifyPermission()) === 'granted') {
                settings = { ...settings, notify: true };
                onChange(settings);
                notifier.sample();
              }
              paintNotify();
            },
          },
          'Turn on notifications',
        ),
      );
    } else if (perm === 'granted') {
      for (const [value, label] of [
        [true, 'On'],
        [false, 'Off'],
      ] as const) {
        notifyRow.append(
          h(
            'button.btn',
            {
              type: 'button',
              role: 'radio',
              'aria-checked': String(on === value),
              class: on === value ? 'on' : '',
              onclick: () => {
                settings = { ...settings, notify: value };
                onChange(settings);
                paintNotify();
              },
            },
            label,
          ),
        );
      }
      if (on) notifyRow.append(h('button.btn', { type: 'button', onclick: () => notifier.sample() }, 'Show me one'));
    }
    notifyNote.textContent =
      perm === 'unsupported'
        ? 'This browser can\'t show notifications from the office here. They need https or localhost (an SSH tunnel counts).'
        : perm === 'denied'
          ? 'Your browser blocks notifications from the office. Allow them in the site settings (the icon left of the address), then open this again.'
          : 'When a worker needs you, finishes or gets stuck while you\'re in another tab or app, you get a notification. Click it to go straight to that worker; for one that needs you or is done, you\'re put at its desk with its terminal open. The tab title counts the workers that need someone either way.';
  };
  paintNotify();

  // The office's Slack / Discord webhook, shared by everyone.
  const hookStatus = h('p.setting-note');
  const hookInput = h('input', { type: 'text', placeholder: 'https://hooks.slack.com/services/...', 'aria-label': 'Slack or Discord webhook URL', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const hookSave = h('button.btn.primary', { type: 'button' }, 'Save');
  const hookTest = h('button.btn', { type: 'button' }, 'Send a test');
  const hookRemove = h('button.btn.danger', { type: 'button' }, 'Remove');
  const hookActions = h('div.seg', { style: 'margin-top:8px' }, hookTest, hookRemove);
  const hookRow = h('div.webhook', {}, hookInput, hookSave);
  const paintHook = () => {
    const { webhook, error, lastSentAt } = store.notify;
    // Where every worker's status is posted: only admins change it (the office checks too).
    const admin = store.me.admin;
    hookRow.classList.toggle('hidden', !admin);
    hookRemove.classList.toggle('hidden', !admin);
    hookTest.classList.toggle('hidden', !admin);
    hookActions.classList.toggle('hidden', !webhook);
    hookSave.textContent = webhook ? 'Replace' : 'Save';
    hookStatus.classList.toggle('bad', !!error);
    hookStatus.textContent = !webhook
      ? 'Paste an incoming https webhook from Slack or Discord, and the office posts to that channel when a worker needs input, finishes or gets stuck and nobody has its terminal open. It\'s for everyone in the office.'
      : error
        ? `Posting to ${WEBHOOK_NAME[webhook.kind]} (${webhook.hint}) failed: ${error}`
        : `Posting to ${WEBHOOK_NAME[webhook.kind]} (${webhook.hint}), set by ${webhook.by} ${timeAgo(webhook.at)}${lastSentAt ? ` · last message ${timeAgo(lastSentAt)}` : ''}.`;
    if (!admin) hookStatus.textContent += ' Admins can change it.';
  };
  paintHook();
  const saveHook = () => {
    const url = hookInput.value.trim();
    if (!url) return hookInput.focus();
    net.send({ t: 'notify.webhook', url });
    hookInput.value = '';
  };
  hookSave.addEventListener('click', saveHook);
  hookInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveHook();
  });
  hookTest.addEventListener('click', () => net.send({ t: 'notify.test' }));
  hookRemove.addEventListener('click', () => net.send({ t: 'notify.webhook', url: '' }));

  // The worker everyone starts on, unless whoever starts one picks another. Admins pick it.
  const agent = agentFields(store.project, 'office-agent', officeChoice(store.project));
  let agentTouched = false;
  agent.element.addEventListener('change', () => (agentTouched = true));
  agent.element.addEventListener('input', () => (agentTouched = true));
  const agentSave = h('button.btn.primary', { type: 'button' }, 'Save');
  const agentBack = h('button.btn', { type: 'button' });
  const agentActions = h('div.seg', { style: 'margin-top:8px' }, agentSave, agentBack);
  const agentNow = h('p.outside-now');
  const agentNote = h('p.setting-note');
  const paintAgent = () => {
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
      'Every worker starts on this: hired at a desk, handed an issue or a pull request from the boards, taken off the queue, the board agents and meetings. Where you start one, Edit picks another just for it.' +
      (picked ? ` Set by ${picked.by} ${timeAgo(picked.at)}.` : ' It\'s the agent the office was started with, on its own default model.') +
      (admin ? '' : ' Admins can change it.');
  };
  paintAgent();
  agentSave.addEventListener('click', () => {
    if (!agent.valid()) return;
    agentTouched = false;
    net.send({ t: 'prompts.agent', choice: agent.choice() });
  });
  agentBack.addEventListener('click', () => {
    agentTouched = false;
    net.send({ t: 'prompts.agent', choice: null });
  });

  // The prompts the office writes for workers by itself, for the whole office. Admins rewrite them.
  const promptsOpen = h('button.btn', { type: 'button', onclick: () => openPromptEditor(net) });
  const promptsNote = h('p.setting-note');
  const paintPrompts = () => {
    const n = rewrittenPrompts();
    promptsOpen.textContent = store.me.admin ? 'Edit the prompts...' : 'Read the prompts...';
    promptsNote.textContent =
      'What Hand to a worker, Review and the boards\' other buttons tell a worker, the note the queue adds to a task, the board agents\' briefs, the meeting room\'s parts and the sign writer\'s instructions. ' +
      (n ? `${n} of them rewritten.` : 'All as the office wrote them.') +
      (store.me.admin ? '' : ' Admins can rewrite them.');
  };
  paintPrompts();

  // The most workers the office runs at once, across every floor. Admins set it.
  const limitInput = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'Most workers at once', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const limitSave = h('button.btn.primary', { type: 'button' }, 'Set limit');
  const limitClear = h('button.btn', { type: 'button' });
  const limitRow = h('div.webhook', {}, limitInput, limitSave, limitClear);
  const limitNote = h('p.setting-note');
  const paintLimit = () => {
    const m = store.machine;
    const admin = store.me.admin;
    limitRow.classList.toggle('hidden', !admin);
    limitInput.placeholder = m.ceiling ? `1 to ${m.ceiling}` : 'e.g. 6';
    limitClear.textContent = m.ceiling ? `Back to ${m.ceiling}` : 'No limit';
    limitClear.classList.toggle('hidden', !m.set);
    const now =
      m.limit === undefined
        ? `No limit: the office hires a worker for every free seat. ${m.workers} ${m.workers === 1 ? 'is' : 'are'} here now, across every deck.`
        : `At most ${m.limit} worker${m.limit === 1 ? '' : 's'} at once, across every deck (${m.workers} now), shells and board agents too. Hiring past that is refused.`;
    const from = m.set ? ` Set by ${m.set.by} ${timeAgo(m.set.at)}.` : '';
    const cap = m.ceiling ? ` The office was started with --max-workers ${m.ceiling}, so it can't go any higher.` : '';
    limitNote.textContent = now + from + cap + (admin ? '' : ' Admins can change it.');
  };
  paintLimit();
  const saveLimit = () => {
    const n = Number(limitInput.value.trim());
    if (!limitInput.value.trim() || !Number.isInteger(n) || n < 1) return limitInput.focus();
    net.send({ t: 'machine.limit', limit: n });
    limitInput.value = '';
  };
  limitSave.addEventListener('click', saveLimit);
  limitInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveLimit();
  });
  limitClear.addEventListener('click', () => net.send({ t: 'machine.limit', limit: null }));

  // Whether a worker whose pull request merged goes home by itself, for everyone.
  const leaveRow = h('div.seg', { role: 'radiogroup', 'aria-label': 'Units whose pull request merged' });
  const leaveNote = h('p.setting-note');
  const paintLeave = () => {
    const { on, by, at } = store.leaveOnMerge;
    leaveRow.replaceChildren(
      ...([
        [true, 'Stand down by themselves'],
        [false, 'Stay until stood down'],
      ] as const).map(([value, label]) =>
        h(
          'button.btn',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(on === value),
            class: on === value ? 'on' : '',
            onclick: () => {
              if (store.leaveOnMerge.on !== value) net.send({ t: 'leaveOnMerge.set', on: value });
            },
          },
          label,
        ),
      ),
    );
    const now = on
      ? "Once a unit's pull request merges, it stands down as soon as it isn't working or waiting on you and nobody has its terminal open, and its worktree and branch are deleted. A worktree with uncommitted changes, or commits that aren't on GitHub, is kept."
      : 'A unit whose pull request merged stays at its console, outlined in violet, until someone stands it down. Turned on, the ones already merged go too.';
    leaveNote.textContent = `${now} It's the same for everyone in the building${by ? `, set by ${by}${at ? ` ${timeAgo(at)}` : ''}` : ''}.`;
  };
  paintLeave();

  // Where the elevator clones new projects on the office's machine. Admins move it.
  const dirInput = h('input', { type: 'text', placeholder: '~/Workspace', 'aria-label': 'Workspace folder', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const dirSave = h('button.btn.primary', { type: 'button' }, 'Save');
  const dirDefault = h('button.btn', { type: 'button' }, 'Use the default');
  const dirRow = h('div.webhook', {}, dirInput, dirSave);
  const dirActions = h('div.seg', { style: 'margin-top:8px' }, dirDefault);
  const dirNote = h('p.setting-note');
  const paintDir = () => {
    const { dir, custom, by, at } = store.projectsDir;
    const admin = store.me.admin;
    dirInput.value = dir;
    dirRow.classList.toggle('hidden', !admin);
    dirActions.classList.toggle('hidden', !admin || !custom);
    dirNote.textContent =
      `New decks from the Deck lift are cloned into ${dir}/<owner>/<repo> on the office's machine.` +
      (custom && by && at ? ` Set by ${by} ${timeAgo(at)}.` : '') +
      (admin ? ' A checkout of the same repository that\'s already there is used as it is. Decks you already have stay where they are.' : ' An admin can move it.');
  };
  paintDir();
  const saveDir = () => {
    const dir = dirInput.value.trim();
    if (!dir) return dirInput.focus();
    if (dir !== store.projectsDir.dir) net.send({ t: 'floor.projectsDir', dir });
  };
  dirSave.addEventListener('click', saveDir);
  dirInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveDir();
  });
  dirDefault.addEventListener('click', () => net.send({ t: 'floor.projectsDir', dir: '' }));

  const account = store.me.account;
  const signOut = h('button.btn', { type: 'button' }, 'Sign out');
  signOut.addEventListener('click', onSignOut);
  const character = h('button.btn', { type: 'button' }, account ? 'Change your look' : 'Change your look & name');
  // Your own account's password: a new one signs out every other browser it's in (the office does it).
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
      pwNote.textContent = "Couldn't reach the office";
    }
    pwSave.disabled = false;
  });
  const bounty = bountySettings(net);
  const pom = showcaseSettings(net);
  const panes: Record<SettingsPane, Node[]> = {
    you: [
      setting('Your operator', null, character),
      setting('Camera view', 'you', seg, note),
      setting('Signed in', null, h('div.volume', {}, signOut), h('p.setting-note', {}, account ? `As ${account.name}, with your own account (${account.role}).` : 'With the shared office password.')),
      ...(account ? [setting('Password', null, h('div.webhook', {}, pwCurrent, pwNew, pwSave), pwNote)] : []),
    ],
    bridge: [
      setting('Bridge lights', 'you', ...lightSettings(() => settings, change)),
      setting('Brightness', 'you', ...brightnessSettings(() => settings, change)),
      setting('Ship motion', 'you', ...bridgeSettings(() => settings, change)),
    ],
    sound: [
      setting('Sound cues', 'you', soundRow, h('p.setting-note', {}, 'Off until you turn them on. Four short cues, one per change worth hearing from another tab: a unit needs you (two rising notes), a unit is stuck (two low ticks), a unit is ready for review (one soft tone) and a merge is proven on chain (a low thunk and a tick). The deck makes no other sound, and voice chat has its own level.')),
      setting('When a unit needs you', 'you', alarmRow, h('p.setting-note', {}, 'The needs-you cue the moment a unit on your deck stops to ask you something or wants a permission. Keep reminding me plays it again, softly, every 30 seconds until someone opens the terminal of that unit. A unit you snoozed in Mission control stays quiet. It plays only while sound cues are on.')),
      setting('Voice chat', 'you', talkRow, h('p.setting-note', {}, 'Either way, V joins voice, holding V talks and you\'re muted once you let go, and M mutes or unmutes. With push to talk you join muted. Leave voice from the menu.')),
    ],
    notify: [
      setting('Desktop notifications', 'you', notifyRow, notifyNote),
      setting('Team notifications (Slack / Discord)', 'office', hookRow, hookActions, hookStatus),
    ],
    building: [
      setting('Workspace folder', 'office', dirRow, dirActions, dirNote),
    ],
    workers: [
      setting('Default unit', 'office', agentNow, agent.element, agentActions, agentNote),
      setting('Unit limit', 'office', limitRow, limitNote),
      setting('Units whose pull request merged', 'office', leaveRow, leaveNote),
      setting('Prompts', 'office', promptsOpen, promptsNote),
    ],
    bounties: [setting('Proof of Merge bounties', 'office', ...bounty.nodes), setting('Public showcase', 'office', ...pom.nodes)],
  };

  // The categories down the side, the one picked on the right.
  const nav = h('nav.settings-nav', { role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': 'Settings' });
  const tabs = new Map<SettingsPane, HTMLButtonElement>();
  const bodies = new Map<SettingsPane, HTMLElement>();
  for (const p of PANES) {
    const tab = h('button.settings-tab', { type: 'button', role: 'tab', onclick: () => show(p.id) }, h('span.icon', { 'aria-hidden': 'true' }, icon(p.icon, 16)), h('span', {}, p.label)) as HTMLButtonElement;
    tabs.set(p.id, tab);
    nav.append(tab);
    bodies.set(p.id, h('section.settings-pane', { role: 'tabpanel', 'aria-label': p.label }, h('div.settings-head', {}, h('h3', {}, p.label), h('p', {}, p.blurb)), ...panes[p.id]));
  }
  const show = (id: SettingsPane) => {
    lastPane = id;
    for (const [t, tab] of tabs) {
      tab.classList.toggle('on', t === id);
      tab.setAttribute('aria-selected', String(t === id));
      tab.tabIndex = t === id ? 0 : -1;
    }
    for (const [t, body] of bodies) body.classList.toggle('hidden', t !== id);
    bodies.get(id)!.scrollTop = 0;
    // On a phone the categories are a row across the top that scrolls sideways.
    tabs.get(id)!.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  nav.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = PANES.findIndex((p) => p.id === lastPane);
    const next = PANES[(i + step + PANES.length) % PANES.length].id;
    show(next);
    tabs.get(next)!.focus();
  });

  const close = h('button.btn.close', { 'aria-label': 'Close' }, icon('close', 16));
  const el = h('div.modal.settings', { role: 'dialog', 'aria-label': 'Settings' }, h('header', {}, h('h2', {}, 'Settings'), close), h('div.settings-body', {}, nav, ...bodies.values()));
  const offNotify = store.on('notify', paintHook);
  const offLeave = store.on('leaveOnMerge', paintLeave);
  const offLimit = [store.on('machine', paintLimit), store.on('me', paintLimit)];
  const offDir = [store.on('projectsDir', paintDir), store.on('me', paintDir)];
  const offPrompts = [store.on('prompts', paintAgent), store.on('prompts', paintPrompts), store.on('me', paintAgent), store.on('me', paintPrompts)];
  const modal = openModal(el, {
    doing: 'in settings',
    onClose: () => {
      offNotify();
      offLeave();
      offLimit.forEach((off) => off());
      offDir.forEach((off) => off());
      offPrompts.forEach((off) => off());
      bounty.off();
      pom.off();
    },
  });
  show(first ?? lastPane);
  close.addEventListener('click', () => modal.close());
  character.addEventListener('click', () => {
    modal.close();
    onCharacter();
  });
}
