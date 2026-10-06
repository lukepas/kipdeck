/**
 * The HUD: Mission control and what you pinned on the top bar, everything else in the menu (Tab),
 * grouped by the deck's jobs (Command, Work, Proof, Deck, and Comms folded at the bottom), with H for
 * the controls; the deck's name in the corner (click it for the decks); Settings, and your operator.
 */
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { attentionChip } from '../../ui/mission';
import { saveSettings, store } from '../../state';
import { markMotion } from '../../motion';
import { openAccounts } from '../../ui/accounts';
import { openBoard } from '../../ui/boards';
import { openCharacter } from '../../ui/character';
import { $ } from '../../ui/dom';
import { toggleFloorMenu } from '../../ui/floormenu';
import { openHelp } from '../../ui/hud';
import { mountHud } from '../../ui/menu';
import { openServices } from '../../ui/services';
import { openSettings, type SettingsPane } from '../../ui/settings';
import { needsSigningIn, openSignIns } from '../../ui/signins';
import { openTeam } from '../../ui/team';
import { openUpgrade } from '../../ui/upgrade';
import { openLabs } from '../../ui/labs';
import { openWhiteboard } from '../whiteboard/ui';
import { qualityMenuAction } from '../quality/menu';

export type HudParts = Pick<Parts, 'place' | 'travel' | 'you' | 'actions' | 'waiting' | 'meeting' | 'bookshelf' | 'talk' | 'notifier' | 'mission'>;

/** Listens for clicks on the HUD and the project, registers what the HUD follows (see mountHud), and binds Tab, H and F. */
export function installHud(ctx: Ctx, parts: HudParts) {
  const { net, voice, settings, player, sound } = ctx;
  const { travel, waiting, actions, talk } = parts;

  // Buttons must not keep focus, or Space (jump) would click them again.
  $('hud').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (btn) setTimeout(() => btn.blur(), 0);
  });
  // The project in the corner is the floor you're on; click it for the list of floors to go to.
  $('project').addEventListener('click', () => {
    if (!store.floor) return travel.showElevator();
    toggleFloorMenu($('project'), { go: (id) => travel.switchFloor(id), floors: travel.showElevator });
  });

  // ---- The HUD: a few buttons on the top bar, everything else in the menu ----------------------------
  const noMedia = () => (window.isSecureContext ? undefined : 'Voice and screen sharing need HTTPS or localhost: use a TLS proxy, --self-signed, or an SSH tunnel');
  const hud = mountHud(
    [
      // ---- Command: what needs a person, and the mission ----------------------------------------------
      // Always on the top bar, the hub of the deck. The counters beside the deck's name carry the numbers.
      {
        id: 'mission',
        icon: 'mission',
        label: 'Mission control',
        section: 'Command',
        key: 'I',
        status: () => true,
        chip: () => 'Mission control',
        dot: () => attentionChip().reminders > 0,
        title: () => `Mission control: what needs someone, on every deck (I)${attentionChip().text ? ` · ${attentionChip().text}` : ''}${attentionChip().reminders ? ` · reminders open: ${attentionChip().reminders}` : ''}`,
        run: () => parts.mission.showMission(attentionChip().tab),
      },
      { id: 'review-inbox', icon: 'review', label: 'Review inbox', section: 'Command', count: () => store.counts().review, title: () => 'Finished work and pull requests waiting for a decision', run: () => parts.mission.showMission('review') },
      { id: 'timeline', icon: 'clock', label: 'Timeline', section: 'Command', lab: 'ops', title: () => 'What happened, on every deck', run: () => parts.mission.showMission('timeline') },
      { id: 'goals', icon: 'target', label: 'Mission and milestones', section: 'Command', lab: 'ops', title: () => "What this deck is for: the statement units are given, and its milestones", run: () => parts.mission.showMission('goals') },
      { id: 'search', icon: 'search', label: 'Search terminals', section: 'Command', key: '/', title: () => 'Search the chat and every terminal', run: waiting.showSearch },
      // ---- Work: the boards ---------------------------------------------------------------------------
      { id: 'issues', icon: 'issue', label: 'Issues', section: 'Work', count: () => store.issues.items.filter((i) => i.state === 'OPEN').length, run: () => openBoard('issues', net, actions.boardActions()) },
      { id: 'pulls', icon: 'pull', label: 'Pull requests', section: 'Work', count: () => store.pulls.items.filter((p) => p.state === 'OPEN').length, run: () => openBoard('pulls', net, actions.boardActions()) },
      { id: 'queue', icon: 'queue', label: 'Task queue', section: 'Work', count: () => store.queue.tasks.filter((t) => t.status !== 'done').length, title: () => 'Issues and tasks waiting for a unit', run: waiting.showQueue },
      { id: 'services', icon: 'services', label: 'Services', section: 'Work', lab: 'ops', count: () => store.services.items.length, title: () => 'Web servers the units are running', run: () => openServices() },
      { id: 'docs', icon: 'docs', label: 'Docs', section: 'Work', title: () => "The project's docs", run: parts.bookshelf.showBookshelf },
      // ---- Proof: what is settled on testnets (Labs > Proof of Merge) ----------------------------------
      { id: 'ledger', icon: 'proof', label: 'Proof ledger', section: 'Proof', lab: 'proof', title: () => 'The public Proof of Merge ledger at /pom/ (opens a new tab)', run: () => window.open('/pom/', '_blank', 'noopener') },
      { id: 'bounties', icon: 'bounty', label: 'Bounties and payouts', section: 'Proof', lab: 'proof', title: () => 'Devnet USDC escrowed on issues, paid only on a human merge', run: () => showSettings('bounties') },
      // ---- Deck: this office --------------------------------------------------------------------------
      { id: 'elevator', icon: 'decks', label: 'Decks', section: 'Deck', count: () => store.floors.reduce((n, f) => n + (f.id === store.floor ? 0 : f.waiting), 0), title: () => 'Go to another project, or add one', run: travel.showElevator },
      { id: 'settings', icon: 'settings', label: 'Settings', section: 'Deck', run: showSettings },
      qualityMenuAction(() => showSettings('bridge')),
      { id: 'help', icon: 'keyboard', label: 'Controls', section: 'Deck', key: 'H', run: openHelp },
      // Always on the top bar: the way back to the home page, which is the product; the bridge is a view of it.
      { id: 'lite', icon: 'home', label: 'Back to inbox', section: 'Deck', status: () => true, chip: () => 'Inbox', title: () => 'Back to the inbox: every agent ranked by what needs you, without the 3D', run: () => location.assign('/') },
      { id: 'labs', icon: 'labs', label: 'Labs', section: 'Deck', title: () => 'Switch on the parts beyond the inbox: the bridge in full, goals, meetings, voice, Proof of Merge', run: () => openLabs(net) },
      { id: 'team', icon: 'invite', label: 'Invite teammates', section: 'Deck', shown: () => store.invites, run: () => openTeam(net) },
      { id: 'accounts', icon: 'key', label: 'Accounts', section: 'Deck', shown: () => store.me.admin, title: () => 'Invite people, see who has an account, revoke them', run: () => openAccounts(net) },
      { id: 'signins', icon: 'lock', label: 'Your sign-ins', section: 'Deck', shown: () => !!store.me.account, tone: () => (needsSigningIn() ? 'danger' : undefined), status: needsSigningIn, chip: () => 'Sign in to Claude', title: () => 'The Claude plan and GitHub account your units run on: your own', run: () => openSignIns(net) },
      {
        id: 'upgrade',
        icon: 'upgrade',
        label: () => (store.upgrade.phase === 'building' ? 'Updating...' : store.upgrade.latest ? 'Update UGC Army' : 'Rebuild UGC Army'),
        section: 'Deck',
        shown: () => store.upgrade.available,
        // A new version, or one being built, gets a place on the top bar until it's in.
        status: () => !!store.upgrade.latest || store.upgrade.phase === 'building',
        chip: () => (store.upgrade.phase === 'building' ? 'Updating...' : 'Update'),
        tone: () => (store.upgrade.latest && store.upgrade.phase !== 'building' ? 'primary' : undefined),
        title: () => (store.upgrade.latest ? `New version: ${store.upgrade.latest.subject}` : 'Rebuild UGC Army'),
        run: () => openUpgrade(net),
      },
      // ---- Comms: talking to the rest of the team (folded in the menu) --------------------------------
      // In voice, V is push to talk, so leaving is only from here.
      { id: 'voice', icon: 'mic', label: () => (voice.inVoice ? 'Leave voice' : 'Join voice'), section: 'Comms', lab: 'voice', key: () => (voice.inVoice ? undefined : 'V'), on: () => voice.inVoice, blocked: noMedia, run: () => void talk.toggleVoice() },
      // While you're in voice, the top bar keeps the mute button handy. Muted is the usual with push to talk, so it doesn't stand out then.
      {
        id: 'mute',
        icon: () => (voice.muted ? 'mic-off' : 'mic'),
        label: () => (voice.muted ? 'Unmute' : 'Mute'),
        section: 'Comms',
        lab: 'voice',
        key: 'M',
        shown: () => voice.inVoice,
        status: () => voice.inVoice,
        on: () => voice.inVoice,
        tone: () => (voice.muted && !settings.pushToTalk ? 'danger' : undefined),
        title: () => (voice.muted ? 'Muted: hold V to talk, or M to unmute' : 'Mute (M) · hold V to talk'),
        run: () => voice.toggleMute(),
      },
      { id: 'share', icon: 'screen', label: () => (voice.sharing ? 'Stop sharing' : 'Share screen'), section: 'Comms', lab: 'voice', on: () => voice.sharing, status: () => voice.sharing, chip: () => 'Sharing', blocked: noMedia, run: () => void talk.toggleShare() },
      { id: 'whiteboard', icon: 'board', label: 'Planning board', section: 'Comms', lab: 'meetings', title: () => 'Sketch the plan. Everyone on this deck sees it.', run: () => openWhiteboard(net) },
      // Up on the top bar while a review is on: what's being worked through in the Review bay.
      {
        id: 'meeting',
        icon: 'meeting',
        label: 'Review bay',
        section: 'Comms',
        lab: 'meetings',
        status: () => store.meeting.current?.status === 'running',
        chip: () => 'In review',
        title: () => 'Call a review: units work through a question or a task together',
        run: () => parts.meeting.showMeeting(),
      },
    ],
    settings,
    () => saveSettings(settings),
  );
  ctx.keys.bind({
    code: 'Tab',
    preventDefault: true,
    run: () => {
      hud.toggleMenu();
    },
  });
  ctx.keys.bind({
    code: 'KeyH',
    run: () => {
      openHelp();
    },
  });
  function showSettings(pane?: SettingsPane) {
    openSettings(
      net,
      settings,
      (s) => {
        // Switching to push to talk mutes you now; back to an open mic turns it on.
        const talkChanged = s.pushToTalk !== settings.pushToTalk;
        Object.assign(settings, s);
        saveSettings(settings);
        if (talkChanged) {
          voice.setMuted(settings.pushToTalk);
          hud.refresh();
        }
        player.setView(settings.view);
        sound.apply(settings);
        markMotion(settings.shipMotion);
      },
      editProfile,
      sound,
      parts.notifier,
      signOut,
      pane,
    );
  }

  async function signOut() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    location.href = '/login';
  }

  function editProfile() {
    openCharacter((p) => {
      parts.you.showMyProfile(p);
      net.send({ t: 'profile', name: p.name, color: p.color, look: p.look });
    });
  }

  return { hud, showSettings, editProfile };
}
