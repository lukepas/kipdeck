# Controls

Back to the [README](../README.md).

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk (hold Shift to run) |
| Space | Jump (you can land on consoles) |
| Mouse drag / wheel | Orbit / zoom the camera |
| G | The Overview: the whole deck from above, a little off the axis on the starboard side, so the dais, the tiers, the pit and the arc facing you read as one plan. The view rises into it from your eyes in 650 ms and dollies back down into them the same way (G or Esc pressed during it is taken once it lands, other keys wait; with less motion it cuts). In it, Q / E turn it a quarter, W A S D, the arrows or a drag pan, the wheel zooms (eased, into the point under the pointer), a click on a unit selects it (see [Selecting a unit](#selecting-a-unit)), and G or Esc walks again. Left alone for 8 s it drifts by half a degree. The deck opens in whichever view you were last in (see [The deck](deck.md#walk-and-overview)) |
| E | Interact: hire a worker, open its terminal, read a board, take an issue's note off the board, prompt a board agent, call a review in the Review bay, sketch on the planning board, read the docs at the docs rack, watch a shared screen at the Attention board (or share yours), put a service on the service monitor (E on its row of the Services board) and use its live page there, sit down (or get up), climb the forward lounge's ladder up or down, open the Floors window at the Deck lift, open the overflow bay past the lift for 2 more consoles (at the **Room to grow** sign) |
| P | Prompt: give a task to a new worker, or to the one at this desk |
| C | Changes: the files the worker at this desk changed and their diff; commit, discard or open a PR |
| B | Open a shared shell at an empty desk |
| R | Resume a sleeping worker (or restart a shell) |
| X | Send a worker home (frees the desk; a worker with its own worktree asks what to do with it) |
| L | Stencil a tag on the floor by the console you face (*Operations*, *Code cleanup*), in one of seven colors; again to change it or take it up |
| O | Open a pull request for a worker on its own branch, or see the one it has (a worker across several projects gets one in each) |
| I | Mission control: the reminders, then what needs someone on every floor, ranked, with why and one next step; the floor's mission and milestones; everything waiting for a review; the timeline of what happened. Inside, 1-5 switch tabs, the arrows pick a row, Enter does its step and D docks it down the right of the deck or floats it again (see [Mission control](mission-control.md)) |
| N | Go to the next unit waiting on someone and select it (the view flies to the unit, where it is standing: 2.2 m out from it on the side away from the mission table, facing it and looking about 10 degrees down at its chest so the whole unit shows, so a unit that needs you is framed on its pod's ready line rather than at its empty console, and one still at its console is seen from 60 degrees or more round to the side rather than from behind, from 1.6 m where its neighbours along the row block the view from 2.2 m; corner brackets in its state's hue close in on it as you land, clear of the hint and the bottom bar, and Locate in Mission control lands the same way; from the Overview it pans onto it), the ones that need you first and then the ones that are done, longest-waiting first, with a toast that counts as the top bar does (`1 of 2 need you · 2 to review. N for the next`); again for the next one, and after the last one on your floor, on to the next floor's (one that needs you on another floor comes before one here that's only done; snoozed ones are skipped) |
| Q | Put back the issue card you're carrying |
| H | These controls |
| T / Enter | Chat |
| / | Search the chat and every terminal on your floor |
| Ctrl + K (⌘K on a Mac) | Command palette: find a worker, issue, PR, service, board, teammate or action; Enter opens it, Shift+Enter walks you there first |
| V | Join voice; in voice, hold to talk (you're muted when you let go) |
| M | Mute / unmute your mic in voice |
| Shift + M | Turn all of the deck's sound off, or back on (Settings > Sound & voice has the main volume and the mixer; see [the design system](design.md#sound)) |
| Ctrl + Space | Dictate, in a worker's terminal or a prompt box: hold it and talk, and what you said is typed in when you let go. A quick tap leaves it listening until the next tap. The mic button does the same |
| Tab | The menu (top right of the top bar): every window, and what shows on screen |
| Esc | Close any window (a terminal too) and get back to looking around, or to the Overview if you opened it there; with a unit selected and no window open, let go of it; in a forward lounge seat, stand up |
| Ctrl + [ | Send Esc to a terminal instead, to close a menu like Claude's `/skills` or interrupt Claude. **Esc** in the terminal's header does the same |

Sitting in the captain's chair (E at it) frames the bridge: a slightly narrower view, aimed low on the situation arc, the bow and the arc over the pit and the crew. From the conn (in the chair, or standing on the dais with the mouse captured), once you've moved the mouse, rest the crosshair on a wall board for a moment and the view leans in on it, so its rows read without walking up; move the mouse or press a key and it eases back. With reduced motion, or Settings > Bridge > Ship motion at Off, it cuts instead of easing.

In first person your gloved hands are at the bottom of the view while you walk: when you press E or click something, the right one reaches out and taps it, and while Mission control is open the left one holds up a datapad with the top bar's counts. They step out of the way when you sit, in third person and in the Overview. Settings > Bridge > Hands turns them on at every Quality tier, or off (Auto leaves them out at Low). See [the design system](design.md#your-hands-in-first-person).

The service monitor on the east wall shows the live page of a web server a unit is running. Point at a row of the Services board and press E to put that service on it (O opens the board's window). Walk up to the monitor: E gives the page the mouse (Esc, E or a click on the deck takes mouse-look back; a page you clicked into keeps Esc, so move the pointer off it first), O opens it full screen in a window (its close button top right, or Esc), C goes to the next service and R reloads it. At Low quality, or with the office on another computer, E opens it instead. See [the deck](deck.md#the-service-monitor).

The forward lounge is a balcony at the bow, behind the Attention and Pull requests boards, for looking out at space. Walk round behind the arc to the foot of its ladder and press E: you square up to it, climb hand over hand (W or S turns you round on the rungs) and step over its head onto the balcony as its gate swings open. E at a lounge seat sits you facing the glass, the view a few degrees wider and lifted to the stars, and you can look anywhere; Esc, E or a step gets you up, and E at the gate climbs back down. See [the deck](deck.md#the-forward-lounge).

Bounties need no keys of their own: walk to the Proof corner on the west wall to read the escrow vault's stacks and the ledger over it, or press E at the Issues board, where a funded issue's row carries its amount and a violet coin, to fund one (see [Proof of Merge bounties](bounties.md#in-the-office)).

You can also click a nearby console to interact with it.

## Selecting a unit

One unit can be selected at a time, and the Overview, the Units rail and Walk all agree on which one it is:

| Do | What happens |
| --- | --- |
| Click a unit in the Overview | It's selected and the view flies to it, landing it in the middle of the deck you can see (right of the Units rail, left of a docked Mission control). A white ring locks on under it on the floor, just outside a working unit's quiet meter so the two never overlap (and follows it, to the ready line too), its callout gets a white outline and draws over its neighbours' (zoomed in to a pod, it shows its whole card; another unit that needs you slides aside rather than hide under it), its row in the Units rail is marked (its group opens if you'd folded it), and a card bottom right shows its call sign, name, state and how long it's been that way, its task, its latest activity, and its branch, PR and engine. With Mission control docked, the card sits left of it |
| Point at a unit in the Overview | The pointer cursor and a faint ring under it. In Walk the rings stay off: you're standing at the unit, and the crosshair says what you aim at |
| Click bare deck in the Overview | Lets go of the selection (a drag still pans) |
| Click a row in the Units rail | Selects that unit and finds it: the Overview flies to it, and in Walk you're taken to its console, facing it. Pointing at a row (or tabbing to it) shows the faint ring under the unit on the deck |
| Double-click a rail row, or Enter on it | Opens the unit's terminal |
| N, a needs-you badge, a notification, or Locate in Mission control | The unit you're taken to becomes the selected one, so the rail and the card move with you (and the ring, in the Overview) |
| The card's button | The one thing the unit's state asks for: **Answer** (it needs you: its terminal), **Review changes** (it's done), **Open terminal** (it's stuck), or **Terminal** and **Changes** while it works |
| Esc, or the card's close button (X) | Lets go of the selection, before Esc does anything else; in Walk you're straight back in mouse-look. Up in the Overview the next Esc walks again, and puts away an open notice such as the "Waiting on you" debrief in the same press |

With reduced motion, or Settings > Bridge > Ship motion at Off, the ring and the card cut in and out instead of easing, and the ring doesn't turn. To change decks, click the deck name in the top-left corner.

For a screen share, a projector or a recording, open the deck with `?demo=1`: bigger type and callouts, the needs-you toast kept up, and the Overview turning slowly round the mission table until you press a key, drag or scroll (see [the design system](design.md#demo-mode)).

On a phone, use the 2D view at `/lite` instead: a terminal there has a row of keys under it (**1** **2** **3**, the arrows, Enter, Tab, Esc, Ctrl+C) and a box to send a prompt. See [Features](features.md).

## In a terminal

The prompt edits the way it does in your own terminal (iTerm2's *Natural Text Editing*, or VS Code's), in Claude Code, Codex, OpenCode and a shell alike:

| Key | Action |
| --- | --- |
| Shift + Enter | A new line in an agent's prompt, without sending it (in a shell it runs the line, like Enter) |
| Ctrl + Space | Dictate: hold it and talk, and what you said is typed in at the cursor when you let go (see [Features](features.md)). **Dictate** in the terminal's header does the same |
| Ctrl + ⌫ / ⌥ + ⌫ | Delete the word before the cursor |
| ⌘ + ⌫ | Delete to the start of the line (Mac) |
| ⌘ + ⌦ | Delete to the end of the line (Mac) |
| ⌘ + ← / → | Jump to the start / end of the line (Mac) |
