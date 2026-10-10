// The Deck's Settings: the three panes every page has (settings-core.ts, with your operator and
// the camera added to Account), then the bridge's own: its lights, motion, quality and life, its sound
// and voice, and Bounties while Proof of Merge (a lab) is on. The home page has only the three.
import type { Net } from '../net';
import type { DeckSound } from '../sound';
import { store, type NeedsYouSound, type Settings, type ViewMode } from '../state';
import type { DesktopNotifier } from '../notify';
import { h } from './dom';
import { choiceRow } from './settings-rows';
import { bountySettings } from './bounty-settings';
import { showcaseSettings } from './showcase-settings';
import { brightnessSettings, bridgeSettings, lightSettings } from './bridge-settings';
import { lifeSettings } from './life-settings';
import { soundSettings } from './sound-settings';
import { qualitySettings } from './quality-settings';
import { handsSettings } from './hands-settings';
import { momentSettings } from './moments-settings';
import { ritualSettings } from './rituals-settings';
import { corePanes, type CorePane } from './settings-core';
import { openSettingsFrame, setting, type SettingsPaneDef } from './settings-frame';

const VIEWS: [ViewMode, string, string][] = [
  ['first', 'First person', 'See through your own eyes. Click the office to look around with the mouse and click things to use them. Esc frees the mouse.'],
  ['third', 'Third person', 'Follow your operator from behind. Drag to orbit the camera, scroll to zoom, and click things to use them.'],
];

/** The categories down the side of the Deck's Settings: the three every page has, then the bridge's own. */
export type SettingsPane = CorePane | 'bridge' | 'sound' | 'bounties';

/** Where Settings was last, so it opens there again. */
let lastPane: SettingsPane = 'account';

export function openSettings(net: Net, settings: Settings, onChange: (s: Settings) => void, onCharacter: () => void, sound: Pick<DeckSound, 'cue' | 'ui' | 'jump'>, notifier: DesktopNotifier, onSignOut: () => void, first?: SettingsPane) {
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

  /** Changes some of your own settings, and has the office take them up. */
  const change = (some: Partial<Settings>) => {
    settings = { ...settings, ...some };
    onChange(settings);
  };
  // The main volume and the mixer (sound-settings.ts); letting go of a slider plays a sample of its group.
  const sounds = soundSettings(() => settings, change, {
    sample: (group) => (group === 'alerts' ? sound.cue('review') : group === 'ui' ? sound.ui('open') : group === 'ship' ? sound.jump('surge') : undefined),
  });
  // Voice chat: an open mic, or muted until you hold V.
  const talkRow = choiceRow('Voice chat', [[false, 'Open mic'], [true, 'Push to talk']], () => settings.pushToTalk, (pushToTalk) => change({ pushToTalk }));
  // The alarm when a worker stops to ask you something; picking one plays it.
  const alarmRow = choiceRow<NeedsYouSound>('When a unit needs you', [['once', 'Once'], ['remind', 'Keep reminding me'], ['off', 'Off']], () => settings.needsYouSound, (needsYouSound) => {
    change({ needsYouSound });
    if (needsYouSound !== 'off') sound.cue('needs-you');
  });

  const character = h('button.btn', { type: 'button' }, store.me.account ? 'Change your look' : 'Change your look & name');
  const offs: (() => void)[] = [];
  const core = corePanes({
    net,
    settings: () => settings,
    change,
    sample: () => notifier.sample(),
    signOut: onSignOut,
    extra: {
      account: [setting('Your operator', null, character), setting('Camera view', 'you', seg, note)],
    },
  });

  const bridgePanes: SettingsPaneDef<SettingsPane>[] = [
    {
      id: 'bridge',
      icon: 'ship',
      label: 'Deck',
      blurb: 'The lights on the bridge, how space moves outside the glass, how much the deck draws, and how much the bridge lives.',
      body: [
        setting('Bridge lights', 'you', ...lightSettings(() => settings, change)),
        setting('Brightness', 'you', ...brightnessSettings(() => settings, change)),
        setting('Ship motion', 'you', ...bridgeSettings(() => settings, change)),
        setting('Quality', 'you', ...qualitySettings(() => settings, change)),
        setting('Hands', 'you', ...handsSettings(() => settings, change)),
        setting('Life', 'you', ...lifeSettings(() => settings, change)),
        setting('Moments', 'you', ...momentSettings(() => settings, change)),
        setting('Rituals', 'you', ...ritualSettings(() => settings, change)),
      ],
    },
    {
      id: 'sound',
      icon: 'volume',
      label: 'Sound & voice',
      blurb: 'How loud the bridge is for you, and how voice chat works.',
      body: [
        setting('Sound', 'you', ...sounds.main, h('p.setting-note', {}, 'On from your first click or key (browsers allow sound no sooner). Shift+M turns it all off and on again anywhere on the deck. Voice chat has its own level.')),
        setting('Mixer', 'you', ...sounds.mixer, h('p.setting-note', {}, 'Each group under the main volume. Alerts are never turned down by the deck: everything else steps back while a unit needs you, Calm and Silent running quieten the ambience, and a hidden tab plays the alerts only.')),
        setting('When a unit needs you', 'you', alarmRow, h('p.setting-note', {}, 'The needs-you cue the moment a unit on your deck stops to ask you something or wants a permission. Keep reminding me plays it again, softly, every 30 seconds until someone opens the terminal of that unit. A unit you snoozed in Mission control stays quiet. It plays while sound is on and Alerts are up.')),
        setting('Voice chat', 'you', talkRow, h('p.setting-note', {}, "Either way, V joins voice, holding V talks and you're muted once you let go, and M mutes or unmutes your mic (Shift+M is the deck's own sound). With push to talk you join muted. Leave voice from the menu.")),
      ],
    },
  ];
  // Bounties only with Proof of Merge on (a lab).
  if (store.lab('proof')) {
    const bounty = bountySettings(net);
    const pom = showcaseSettings(net);
    offs.push(bounty.off, pom.off);
    bridgePanes.push({
      id: 'bounties',
      icon: 'proof',
      label: 'Bounties',
      blurb: "Proof of Merge: devnet USDC or test tokens on issues, paid only when a person merges the office's pull request.",
      body: [setting('Proof of Merge bounties', 'office', ...bounty.nodes), setting('Public showcase', 'office', ...pom.nodes)],
    });
  }
  const modal = openSettingsFrame<SettingsPane>([...core.panes, ...bridgePanes], first ?? lastPane, {
    onPick: (id) => (lastPane = id),
    onClose: () => {
      core.off();
      offs.forEach((off) => off());
    },
  });
  character.addEventListener('click', () => {
    modal.close();
    onCharacter();
  });
}
