# Recording guide

How to record the face-cam pitch and the screen demo's voiceover on a Mac, with what is already at home or cheap to buy. Plan: dry run 2026-10-08, record 2026-10-09, edit 2026-10-10, submit 2026-10-11, a day before the 2026-10-12 23:59 PT deadline.

Colosseum doesn't set a file format or host. Clear sound and a clear face matter more than resolution: judges review the pitch first and score how well you explain the product.

## Before anything: keep secrets off camera

- Turn on Do Not Disturb (Control Centre > Focus) so no messages or emails pop up.
- Close every window you don't need. Hide the Dock and desktop icons.
- Never show: key files under `~/.config/agent-office-chain`, the office password or one-time sign-in link the office prints at start, `.env` files, wallet seed phrases, email addresses, anything from your employer or its clients.
- Start the office in a terminal you don't record, and use a second, clean terminal for the curl and x402 shots.
- Watch every take back once before you publish it, looking only for secrets.

## The face cam (pitch)

### Camera

Best to worst:

1. Your iPhone's rear camera through Continuity Camera. Mount the phone on a tripod or a stack of books at eye level, landscape. In QuickTime Player: File > New Movie Recording, click the arrow next to the record button, choose the iPhone as camera.
2. The iPhone recording on its own (Camera app, 1080p at 30 fps), then copied over with AirDrop. Sharpest picture; use it if Continuity is flaky.
3. The Mac's built-in camera. Fine if the light is good; raise the laptop so the lens is at eye level, not looking up your nose.

Framing: head and shoulders, eyes about a third from the top, a little space above the head. Look at the lens, not your own face on screen.

### Teleprompter

Put the clean text block from `pitch-script.md` in a narrow window right under the camera, large font, a dozen words a line. Scroll it by hand or with any teleprompter app. With the iPhone as camera, put the Mac's screen just below the phone so your eyes stay near the lens. Read a few times out loud first; if a line trips you, reword it in your own words.

### Light

- Face a window, never sit with one behind you. Daylight from the front and slightly to one side is the best free light.
- Evening: one lamp or a cheap LED panel at 45 degrees in front of you, a bit above eye level, bounced off a wall or diffused with baking paper; a second weaker light or a white wall on the other side to soften shadows.
- Turn off the overhead light if it makes dark eye sockets.
- Background: tidy and plain, a little depth behind you. No whiteboards with anything written on them.

### Sound

Sound matters more than picture. In order of preference:

1. A USB microphone (a Samson Q2U or similar) a hand's width from your mouth, off to the side.
2. A wired lavalier clipped to your shirt, into the iPhone, recorded in Voice Memos as a separate track.
3. The iPhone's own mic close to you, out of shot, recording Voice Memos.
4. The MacBook's mics, only in a quiet, soft room.

Skip AirPods: Bluetooth records at low quality. Pick a small room with soft things in it (a bedroom with curtains, a wardrobe full of clothes). Turn off fans, the fridge if it hums, and notifications. Record 10 seconds of silence first ("room tone") for the edit.

If you record sound on a separate device, clap once on camera at the start of each take to sync them.

## The screen demo

- Record the screen first, without voice, following the shot list in `demo-script.md`. Then record the voiceover to the finished picture. This is easier than talking and driving the app at once, and retakes are cheap.
- macOS: Cmd + Shift + 5, Record Selected Portion or Entire Screen. Options: no microphone, show mouse clicks on. For more control use OBS Studio (free): 1920 x 1080 canvas, 30 fps (60 for the bridge's motion if the Mac keeps up), MKV or MP4.
- Set the display to a 1080p-friendly scale (System Settings > Displays) so text isn't tiny when shrunk, and zoom the browser to 125 to 150 percent for GitHub, explorers and terminals.
- Use the office with `?demo=1`, and Settings > Bridge > Quality High if the Mac holds a steady frame rate; if it stutters, Medium.
- Terminal: a large font (18 to 20 pt), a short prompt, a dark theme that matches the bridge.
- Move the mouse slowly and pause on what you want people to read for a full second.
- Record each shot as its own clip, named by its number in the shot list (`06b-explorer.mov`).

## The voiceover

- Same mic setup as above. In QuickTime Player: File > New Audio Recording, choose the mic, Maximum quality. GarageBand or Audacity also work and show levels.
- Speak about a hand's width from the mic, slightly off-axis so p and b sounds don't pop.
- Loudest words should peak around -12 to -6 dB, never touching 0.
- Record one beat (one numbered section) at a time, watching its clip so the timing fits.
- Drink water, not coffee or milk, just before. Stand up if you can; the voice has more energy.

## Retakes

- Say the take before each attempt: "Pitch, beat 3, take 2." It saves time in the edit.
- After a mistake, pause two seconds and restart the whole sentence, not the word. Cuts between sentences are invisible; cuts mid-sentence aren't.
- Do three good takes of the hook and the ask; they matter most. Everything else, one good take is enough.
- Don't chase perfect. A natural take with a small stumble beats a stiff perfect one.
- Re-record anything where a number changed since `counts.json` was last refreshed.

## Editing

- iMovie is enough. DaVinci Resolve (free) if you want more control.
- Cut the face cam to the clean takes, drop the cutaways from the demo footage over the matching lines, keep each under four seconds.
- Add burned-in captions; many judges watch on mute. CapCut or DaVinci Resolve can generate them, then fix product names by hand (Kipdeck, Solana, Base Sepolia, devnet, x402, EAS, ERC-8004).
- Music: none, or very quiet under the demo only. Never over the pitch's voice.
- Check the runtime: pitch at or under 2:30, demo at or under 3:00.
- Export H.264, 1920 x 1080, 30 fps.

## Uploading

- YouTube, unlisted, or Loom. Give each a plain title ("Kipdeck - pitch", "Kipdeck - technical demo").
- Open each link in a private window, signed out, and watch it to the end before pasting it into the form.
- Keep the original files; they also make the build-in-public posts and the weekly update.

## Checklist for recording day

- [ ] Focus on, desktop clean, office started in an unrecorded terminal.
- [ ] `counts.json` refreshed; pitch traction lines match it.
- [ ] Light from the front; camera at eye level; mic close; room tone recorded.
- [ ] Pitch: hook and ask, three takes each; everything else, one good take.
- [ ] Demo: every shot recorded as its own clip; the merge recorded only once, on the real take.
- [ ] Voiceover recorded beat by beat to picture.
- [ ] Watched once for secrets, once for runtime, once signed out after upload.
