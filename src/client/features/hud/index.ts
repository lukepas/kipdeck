/**
 * The HUD: a few buttons on the top bar, everything else in the menu (Tab), with H for the controls;
 * the project in the corner (click it for the floors); Settings, and your
 * character.
 */
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { attentionChip } from '../../ui/mission';
import { saveSettings, store } from '../../state';
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
import { openWhiteboard } from '../whiteboard/ui';

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
  const noMedia = () => (window.isSecureContext ? undefined : 'Voice and screen sharing need HTTPS or localhost — use a TLS proxy, --self-signed, or an SSH tunnel');
  const hud = mountHud(
    [
      // Always on the top bar, the hub of the office: "2 need you · 1 stuck · 3 to review" while anyone,
      // on any floor, needs someone, and a quiet "Mission control" while nobody does.
      {
        id: 'mission',
        icon: 'mission',
        label: 'Mission control',
        section: 'Open',
        key: 'I',
        status: () => true,
        // The counters beside the deck's name carry the numbers; this is the one labelled way in.
        chip: () => 'Mission control',
        dot: () => attentionChip().reminders > 0,
                title: () => `Mission control: what needs someone, on every floor, and the floor's goals (I)${attentionChip().text ? ` · ${attentionChip().text}` : ''}${attentionChip().reminders ? ` · reminders open: ${attentionChip().reminders}` : ''}`,
        run: () => parts.mission.showMission(attentionChip().tab),
      },
      { id: 'issues', icon: 'issue', label: 'Issues', section: 'Open', count: () => store.issues.items.filter((i) => i.state === 'OPEN').length, run: () => openBoard('issues', net, actions.boardActions()) },
      { id: 'pulls', icon: 'pull', label: 'Pull requests', section: 'Open', count: () => store.pulls.items.filter((p) => p.state === 'OPEN').length, run: () => openBoard('pulls', net, actions.boardActions()) },
      { id: 'queue', icon: 'queue', label: 'Task queue', section: 'Open', count: () => store.queue.tasks.filter((t) => t.status !== 'done').length, title: () => 'Issues and tasks waiting for a unit', run: waiting.showQueue },
      { id: 'services', icon: 'services', label: 'Services', section: 'Open', count: () => store.services.items.length, title: () => 'Web servers the units are running', run: () => openServices() },
      { id: 'whiteboard', icon: 'board', label: 'Whiteboard', section: 'Open', title: () => 'Draw together, live', run: () => openWhiteboard(net) },
      // Up on the top bar while a meeting is on: what's being worked through in the meeting room.
      {
        id: 'meeting',
        icon: 'meeting',
        label: 'Review bay',
        section: 'Open',
        status: () => store.meeting.current?.status === 'running',
        chip: () => 'In a meeting',
        title: () => 'Call a meeting: units work through a question or a task together',
        run: () => parts.meeting.showMeeting(),
      },
      { id: 'search', icon: 'search', label: 'Search', section: 'Open', key: '/', title: () => 'Search the chat and every terminal', run: waiting.showSearch },
      { id: 'docs', icon: 'docs', label: 'Docs', section: 'Open', title: () => 'Read the project’s docs', run: parts.bookshelf.showBookshelf },
      { id: 'elevator', icon: 'decks', label: 'Decks', section: 'Open', count: () => store.floors.reduce((n, f) => n + (f.id === store.floor ? 0 : f.waiting), 0), title: () => 'Go to another project, or add one', run: travel.showElevator },
      // In voice, V is push to talk, so leaving is only from here.
      { id: 'voice', icon: 'mic', label: () => (voice.inVoice ? 'Leave voice' : 'Join voice'), section: 'Together', key: () => (voice.inVoice ? undefined : 'V'), on: () => voice.inVoice, blocked: noMedia, run: () => void talk.toggleVoice() },
      // While you're in voice, the top bar keeps the mute button handy. Muted is the usual with push to talk, so it doesn't stand out then.
      {
        id: 'mute',
        icon: () => (voice.muted ? 'mic-off' : 'mic'),
        label: () => (voice.muted ? 'Unmute' : 'Mute'),
        section: 'Together',
        key: 'M',
        shown: () => voice.inVoice,
        status: () => voice.inVoice,
        on: () => voice.inVoice,
        tone: () => (voice.muted && !settings.pushToTalk ? 'danger' : undefined),
        title: () => (voice.muted ? 'Muted: hold V to talk, or M to unmute' : 'Mute (M) · hold V to talk'),
        run: () => voice.toggleMute(),
      },
      { id: 'share', icon: 'screen', label: () => (voice.sharing ? 'Stop sharing' : 'Share screen'), section: 'Together', on: () => voice.sharing, status: () => voice.sharing, chip: () => 'Sharing', blocked: noMedia, run: () => void talk.toggleShare() },
      { id: 'team', icon: 'invite', label: 'Invite teammates', section: 'Together', shown: () => store.invites, run: () => openTeam(net) },
      { id: 'accounts', icon: 'key', label: 'Accounts', section: 'Together', shown: () => store.me.admin, title: () => 'Invite people, see who has an account, revoke them', run: () => openAccounts(net) },
      { id: 'signins', icon: 'lock', label: 'Your sign-ins', section: 'Together', shown: () => !!store.me.account, tone: () => (needsSigningIn() ? 'danger' : undefined), status: needsSigningIn, chip: () => 'Sign in to Claude', title: () => 'The Claude plan and GitHub account your units run on: your own', run: () => openSignIns(net) },
      { id: 'settings', icon: 'settings', label: 'Settings', section: 'Office', run: showSettings },
      { id: 'help', icon: 'keyboard', label: 'Controls', section: 'Office', key: 'H', run: openHelp },
      { id: 'lite', icon: 'plot', label: '2D view', section: 'Office', title: () => 'The units, their terminals and the boards without the 3D: for a phone or a slow computer', run: () => location.assign('/lite') },
      {
        id: 'upgrade',
        icon: 'upgrade',
        label: () => (store.upgrade.phase === 'building' ? 'Upgrading…' : store.upgrade.latest ? 'Update UGC Army' : 'Upgrade UGC Army'),
        section: 'Office',
        shown: () => store.upgrade.available,
        // A new version, or one being built, gets a place on the top bar until it's in.
        status: () => !!store.upgrade.latest || store.upgrade.phase === 'building',
        chip: () => (store.upgrade.phase === 'building' ? 'Upgrading…' : 'Update'),
        tone: () => (store.upgrade.latest && store.upgrade.phase !== 'building' ? 'primary' : undefined),
        title: () => (store.upgrade.latest ? `New version: ${store.upgrade.latest.subject}` : 'Upgrade UGC Army'),
        run: () => openUpgrade(net),
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
        sound.setVolume(settings.volume, settings.muted);
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
