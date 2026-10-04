# Controls

Back to the [README](../README.md).

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk (hold Shift to run) |
| Space | Jump (you can land on consoles and the operator bench) |
| Mouse drag / wheel | Orbit / zoom the camera |
| G | The Overview: the whole deck from above. In it, Q / E turn it a quarter, W A S D, the arrows or a drag pan, the wheel zooms, and G or Esc walks again (see [The deck](deck.md#walk-and-overview)) |
| E | Interact: hire a worker, open its terminal, read a board, take an issue's note off the board, prompt a board agent, call a review in the Review bay, draw on the whiteboard, read the docs at the docs rack, watch the Attention board, sit down (or get up), open the Floors window at the Deck lift, open the overflow bay past the lift for 2 more consoles (at the **Room to grow** sign) |
| P | Prompt: give a task to a new worker, or to the one at this desk |
| C | Changes: the files the worker at this desk changed and their diff; commit, discard or open a PR |
| B | Open a shared shell at an empty desk |
| R | Resume a sleeping worker (or restart a shell) |
| X | Send a worker home (frees the desk; a worker with its own worktree asks what to do with it) |
| L | Stencil a tag on the floor by the console you face (*Operations*, *Code cleanup*), in one of seven colors; again to change it or take it up |
| O | Open a pull request for a worker on its own branch, or see the one it has (a worker across several projects gets one in each) |
| I | Mission control: the reminders, then what needs someone on every floor, ranked, with why and one next step; the floor's mission and milestones; everything waiting for a review; the timeline of what happened. Inside, 1 2 3 4 switch tabs, the arrows pick a row and Enter does its step (see [Mission control](mission-control.md)) |
| N | Go to the next unit waiting on someone (the view flies there; from the Overview it pans onto it), the ones that need you first and then the ones that are done, longest-waiting first; again for the next one, and after the last one on your floor, on to the next floor's (one that needs you on another floor comes before one here that's only done; snoozed ones are skipped) |
| Q | Put back the issue card you're carrying |
| H | These controls |
| T / Enter | Chat |
| / | Search the chat and every terminal on your floor |
| Ctrl + K (⌘K on a Mac) | Command palette: find a worker, issue, PR, service, board, teammate or action; Enter opens it, Shift+Enter walks you there first |
| V | Join voice; in voice, hold to talk (you're muted when you let go) |
| M | Mute / unmute in voice |
| Ctrl + Space | Dictate, in a worker's terminal or a prompt box: hold it and talk, and what you said is typed in when you let go. A quick tap leaves it listening until the next tap. The mic button does the same |
| Tab | The menu (top right of the top bar): every window, and what shows on screen |
| Esc | Close any window (a terminal too) and get back to looking around, or to the Overview if you opened it there |
| Ctrl + [ | Send Esc to a terminal instead, to close a menu like Claude's `/skills` or interrupt Claude. **Esc** in the terminal's header does the same |

You can also click a nearby desk to interact with it, or click a unit in the Units panel (on screen from the start) to open its terminal. To change floors, click the project name in the top-left corner.

For a screen share, a projector or a recording, open the deck with `?demo=1`: bigger type and callouts, the alert strip pinned, and the Overview turning slowly round the mission table until you press a key, drag or scroll (see [the design system](design.md#demo-mode)).

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
