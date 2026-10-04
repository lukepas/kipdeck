// The rows of the controls help (openHelp in hud.ts), in the order it shows them: a key, or the name of
// a glyph in ui/icons.ts for what isn't a key, and what it does. A new control is a new row here.

import { IS_MAC } from './termkeys';

export const HELP_ROWS: readonly (readonly [string, string])[] = [
  ['W A S D', 'Walk (hold Shift to run)'],
  ['Space', 'Jump'],
  ['Mouse', 'Look around in first person (click to capture the mouse, Esc to free it)'],
  ['Click / E', "Use what you look at: hire a worker, open its terminal, read a board, call a meeting in the meeting room, watch the TV, sit on a couch, a beanbag or a chair (walk off to get up)"],
  ['people', 'Click someone under "Operators" to walk over to them (on another floor, you go there first). The line under their name says what they have open or where they are'],
  ['decks', 'Every project is a deck: click the deck name in the top bar to switch to another one, or press E at the Deck lift on the north wall (or Decks in the menu) to add, clone or take off a project'],
  ['units', 'An agent stands by the issues board, the PR board and the task queue. Press E at one and type what you want: it runs as an agent that knows that board. O there opens its terminal, X sends it home'],
  ['board', 'The whiteboard on wheels between the desks and the lounge: press E to draw on it with everyone on your floor, live. What you draw stays up on the board'],
  ['merged', 'Whenever a pull request merges or the task queue finishes, everyone on the floor gets a toast and a ding, and a desktop notification when the office is in another tab'],
  ['I', 'Mission control: the reminders, then what needs someone right now on every floor (needs you, stuck, to review), ranked, with why and one next step; the floor\'s mission and milestones; everything waiting for a review; and the timeline of what happened. 1 2 3 4 switch tabs, the arrows pick a row, Enter does its step'],
  ['N', "Next worker that needs you: go to whoever needs input (they have a Signal beacon over their console, and the alert row up top says what each is asking), then whoever is done and nobody's looked at, longest-waiting first, and again for the next one, then on to the next floor's. One that needs you on another floor comes before one here that's only done. Chevrons at the edge of the screen point to the ones out of sight"],
  ['Drag / wheel', 'Orbit and zoom the camera in third person'],
  ['P', 'Prompt: give a task to a new or existing worker at the desk you face'],
  ['C', 'Changes: what the worker at the desk you face changed — files and diff, commit, discard, open a PR'],
  ['B', 'Open a shared shell (dev servers, git, tests) at an empty desk'],
  ['R', 'Resume a sleeping worker'],
  ['X', 'Send a worker home (frees the desk)'],
  ['L', 'Hang a big sign over the desk you face ("Operations", "Code cleanup"), or change or take down the one there'],
  ['plus', 'Room to grow: E at the sign on the north wall past the elevator knocks through into a back office with 2 more desks, and again for 2 more. The same sign walls a row back up'],
  ['Q', 'Put back the issue card in your hands (E at a note on the issues board, or Pick it up in an issue; then E at an empty desk, a worker or the queue board)'],
  ['O', 'Open a pull request for a worker on its own branch, or see the one it has'],
  ['T', 'Chat'],
  ['/', 'Search the chat and every terminal on your floor, back to before the office last restarted'],
  [IS_MAC ? '⌘K' : 'Ctrl+K', 'Command palette: type a few letters to find a worker, issue, PR, service, board, teammate or action. Enter opens it, Shift+Enter walks you over to it first'],
  ['V', 'Join voice. In voice, hold V to talk (push to talk): you’re muted once you let go. Leave voice from the menu'],
  ['M', 'Mute or unmute your mic in voice. Settings can have you join muted, for push to talk'],
  ['Ctrl+Space', 'Dictate: in a worker’s terminal or a prompt box, hold Ctrl+Space (or the mic button) and talk, and what you said is typed in when you let go, for you to read over and send. A quick tap leaves it listening until you tap again. The browser does the listening (Chrome, Edge and Safari can), so there’s nothing to install'],
  ['Tab', 'The menu, top right: every window, and what shows on screen. Pin what you use most to the top bar'],
  ['Esc', 'Close any window and get back to looking around'],
  ['Ctrl + [', 'Send Esc to a terminal instead, to close a menu like Claude’s /skills or interrupt Claude. ⎋ Esc in the terminal’s header does the same'],
  ['settings', 'Settings (in the menu): switch between first and third person'],
];
