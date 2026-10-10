# Videos for the Colosseum entry

Everything for the two videos Colosseum asks for: a 2-3 minute pitch with the founder on camera, and a technical demo of at most 3 minutes. The deadline is 2026-10-12 23:59 PT; plan to submit on 2026-10-11.

## What each file is

Scripts and notes (in git):

| File | What it is |
| --- | --- |
| [pitch-script.md](pitch-script.md) | The pitch: beats, timings and the clean text for the teleprompter |
| [demo-script.md](demo-script.md) | The technical demo as it would be recorded live after a merge that counts (by someone other than the operator), with the shot list and fallbacks |
| [recording-guide.md](recording-guide.md) | Camera, light, sound, screen recording and keeping secrets off camera |
| [gtm.md](gtm.md) | The go-to-market note for the form |
| [description.txt](description.txt) | The video description: the source repository, every ID in the demo as a full link, and the credit |
| [capture/](capture/README.md) | The scripts that capture the demo from the real office and cut it |
| [capture/voiceover.txt](capture/voiceover.txt) | The voiceover for the cut below, line by line, with the time each line starts |
| [capture/cut-list.txt](capture/cut-list.txt) | Where each beat and shot starts in the cut |
| [capture/edit.json](capture/edit.json) | The edit: shots, lengths, tags, notes and captions |

Rendered files (in `out/`, ignored by git):

| File | What it is |
| --- | --- |
| `out/demo-3min-silent.mp4` | The technical demo, 1920x1080, 30 fps, 2:56. Video only, no audio track: lay the voiceover on it (below) before you submit it. The captions are burned in |
| `out/demo-3min-captions.srt` | The same captions as a subtitle file, on the same clock, for platforms that take one |
| `out/demo-60s-9x16.mp4` | A 60 s 1080x1920 highlight for X, LinkedIn and Shorts, video only |
| `out/footage/`, `out/web/`, `out/gfx/`, `out/build/` | The shots, explorer screenshots, cards and rendered segments; safe to delete, they only speed up a re-cut |

The 30 s teaser is made in this repository's `video/` folder (`video/out/final/`).

## What the demo cut shows, and what it does not

PR #4 on the demo repository was merged on 2026-10-07 by the operator's own account. Under the product's own rule that is `self`: it is not counted and pays nothing, and its bounty (issue #1) is still claimed with nothing paid. So no real merge has paid an agent yet. The cut is honest about that:

- The voiceover says PR #4 was merged by its own operator and labelled self, so it paid nothing. The merge and the payout shown are replays of what a counted merge does, tagged `REPLAY` on screen. The payout runs on the office's mock chain, so the toast and the receipt say "mock chain" and link to nothing.
- The Solana release on screen is a real devnet transaction from a test run (2026-10-03, the approver-wallet path, signed by the attester and the approver), shown on its own and labelled "no GitHub merge behind it".
- The EAS shot is the schema page with test attestations; the `/pom/` board is the test fixture. Both say so.
- Every shot carries a tag: `REAL`, `DEMO DATA`, `REPLAY` or `TEST DATA`.
- The demo repository keeps its name from before the rename, `zbagdzevicius/ugc-army-demo` (its devnet bounties' addresses are derived from it); the cards label it a test repository, and its bounties hold a devnet test token, called test tokens everywhere, including the Deck's Issues board header ("N funded in test tokens", `src/client/features/boards/world.ts`) and the `/pom/` board ("test tokens in escrow (devnet)", amounts in TEST).

Last render: 2026-10-10, from this branch, with every step below (the office on port 4693 through `DEMO_PORT`, the `/pom/` shots on 4694). One frame a second of both cuts (236 frames) was read with tesseract and the key frames looked at: the source repository is on the first and last cards, Kip's mark is on the title, problem and end cards, and nothing says `SET FORK_URL`, "still open", "Mission control for", UGC Army or Mergeline. "test USDC" shows only on the x402 payment (Circle's test USDC on Base Sepolia, which is right). Not done yet: the `/pom/` share image (`src/server/showcase/og.ts`) still prints USDC, it is not in either cut; and the demo repository's GitHub description still says "UGC Army / Proof of Merge demo".

When a merge that counts happens (an agent's new pull request merged by a second GitHub account with write access, the admin approving in Phantom, the release and the EAS attestation landing), record those steps by the shot list in demo-script.md and replace the replayed shots. PR #4 cannot be that merge any more. The capture README says how.

## The source repository

Colosseum needs a public code repository, and the cards show it: the title and end cards of both cuts print `github.com/zbagdzevicius/kipdeck`, which is public, and description.txt links it. `FORK_URL` overrides it only if the code moves:

```sh
FORK_URL=github.com/<owner>/<repo> node launch/video/capture/cards.mjs
REUSE=1 node launch/video/capture/assemble.mjs
```

The title and end cards carry no tag overlay, so their segments are re-rendered from the new card images; delete `out/build/seg-00.mp4` and `out/build/seg-28.mp4` first so they are. Then change the link in description.txt to match.

## Recording the pitch

Follow [recording-guide.md](recording-guide.md). In short:

1. Face cam: an iPhone through Continuity Camera at eye level, a window in front of you, a USB or lavalier mic a hand's width from your mouth. Record 10 s of room tone first.
2. Read from the clean text block in [pitch-script.md](pitch-script.md) on a teleprompter under the lens. Three good takes of the hook and the ask; one of the rest.
3. Edit in iMovie or DaVinci Resolve: cut to the clean takes, keep it between 2:00 and 3:00, and use only real footage as cutaways (the explorer pages, the code pages, GitHub). Do not cut to the replayed merge or payout shots in the pitch.
4. Export 1920x1080, H.264, AAC 48 kHz.

## Recording the demo voiceover

1. Open `out/demo-3min-silent.mp4` in QuickTime and [capture/voiceover.txt](capture/voiceover.txt) beside it. The voiceover is exactly the captions, so what you say matches what a viewer reads with the sound off.
2. In QuickTime: File > New Audio Recording, your mic, Maximum quality. Record the whole voiceover in one file while the video plays, starting your first line at the time voiceover.txt gives (about 0:07; the title and problem cards are silent). If a beat goes wrong, record it again on its own and lay it at its start time in iMovie instead.
3. Peaks around -12 to -6 dB, never 0. Save as `voiceover.wav` (or `.m4a`).

## Laying the voiceover onto the cut

From the repository root, with the voiceover recorded from the start of the video:

```sh
ffmpeg -i launch/video/out/demo-3min-silent.mp4 -i voiceover.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11,apad" -c:a aac -b:a 192k -ar 48000 \
  -t 176 -movflags +faststart launch/video/out/demo-3min.mp4
```

The picture is copied untouched, the voice is levelled to -16 LUFS, padded with silence and cut at 176 s, the length of the cut (the first line of capture/cut-list.txt; change `-t` if you re-cut). Use `-t`, not `-shortest`: with `apad` and a copied picture, `-shortest` never ends. If the voiceover starts at its first line instead of at 0:00, delay it by that much: add `-itsoffset 7.05` before `-i voiceover.wav` (use the first time in voiceover.txt).

Check the result with `ffprobe launch/video/out/demo-3min.mp4`: one video and one audio stream, under 180 s. Watch it through once with sound and once without.

## Submission checklist

- [ ] The cards show `github.com/zbagdzevicius/kipdeck`, the same link as description.txt and the Colosseum form ([../chain/colosseum-worlds-fair.md](../chain/colosseum-worlds-fair.md)).
- [ ] The cards show Kip's mark (the logo from `design/logo/mark.svg`), not the old 3x3 grid.
- [ ] Pitch: 2:00-3:00, founder on camera, clear sound, only real footage as cutaways, the agent-office credit said or shown.
- [ ] Demo: `demo-3min.mp4` with the voiceover, under 3:00, one audio stream. Never submit `demo-3min-silent.mp4` itself.
- [ ] If a merge that counts (not by the operator) happens before you record: the replayed shots are replaced with the real merge, approval, release and attestation, the tags in edit.json changed, and the voiceover moved from the replay to what happened.
- [ ] Every number said aloud matches `../chain/data/counts.json`.
- [ ] Each video watched once looking only for secrets: no key files, passwords, sign-in links, `.env`, email addresses.
- [ ] Both videos uploaded (YouTube unlisted or Loom), the description from description.txt pasted under the demo, links opened in a private window.
- [ ] GTM note and form text use actuals, not targets (see gtm.md).
- [ ] Submitted by 2026-10-11, a day before the 2026-10-12 23:59 PT deadline.
