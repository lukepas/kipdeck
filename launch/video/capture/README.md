# Demo footage and the silent cut

Scripts that capture the technical demo from the real, built office and cut it, so the video reads before the founder records the voiceover. The beats and the voiceover are [demo-script.md](../demo-script.md); [recording-guide.md](../recording-guide.md) covers recording the voice and the face cam.

The outputs go to `launch/video/out/`, which git ignores:

| File | What it is |
| --- | --- |
| `demo-3min-silent.mp4` | 1920x1080, 30 fps, 2:58, a silent stereo track to record the voiceover onto, the voiceover as lower-third captions |
| `demo-3min-captions.srt` | The same captions on the same clock (a copy is kept here) |
| `demo-60s-9x16.mp4` | 1080x1920, 60 s, the highlight for phones |
| `footage/`, `web/`, `gfx/`, `build/` | The shots, the explorer screenshots, the cards and pages, the rendered segments |

[cut-list.txt](cut-list.txt) says where each beat and shot starts, for laying the voiceover in.

## Making it again

```sh
npm run build
node launch/video/capture/office.mjs          # the office shots, about 6 minutes
node launch/video/capture/web.mjs             # explorers, easscan, GitHub
node --import tsx launch/video/capture/pom.ts # the /pom/ ledger from the test fixture
node launch/video/capture/cards.mjs           # cards, pages, captions, overlays
node launch/video/capture/assemble.mjs        # both cuts and the SRT, about 2 minutes
```

`office.mjs` starts its own office on port 4681 (`DEMO_PORT`, 4680 to 4699 only), bound to 127.0.0.1 with `--no-open`, a throwaway password and `HOME` in a fresh temp folder, and stops it when it is done, even on an error. It never touches the office on 4600. Headless Chromium draws the deck on the GPU at 1920x1080 with Quality High and Night lights, and the 3D shots are recorded frame by frame with the page's clock stepped, so nothing stutters.

To change the cut, edit [edit.json](edit.json): the order, lengths, pans, tags, notes and captions are all there. Then run `cards.mjs` and `assemble.mjs` again. `FORK_URL=github.com/<you>/<repo>` puts the fork's address on the end cards once it is public.

## What is real and what is demo data

Every shot carries a tag that says which it is.

- **Real**: the Solana Explorer pages (the escrow program, its first release `2rPSWQ...ZtUc`, issue #2's bounty account on ugc-army-demo), the easscan schema page, the Blockscout pages for the ERC-8004 Reputation registry and the 2026-10-04 x402 payment (Basescan blocks scripts, Blockscout reads the same chain), the GitHub pages for ugc-army-demo, the code and docs pages (the files in this repository, with their line numbers), and the 402 answer, which is the office's own from its real route.
- **Demo data**: everything inside the office. The crew are stand-in units, a shell script that posts Claude Code's hooks. The Issues and PR boards mirror ugc-army-demo as it stands: #1 holds 10 test USDC and is claimed by PR #4, #2 holds 15 and #3 holds 25, read with `ao-bounty show` on 2026-10-07. The merge of PR #4, the payout approval and the payout are replayed in the page, and nothing touches a chain. The `/pom/` ledger is the test fixture, because the live board is empty until the first real merge is attested.

The real merge, the approval from the admin's Phantom wallet, the payout and its attestation happen on recording day (see the shot list in demo-script.md). Re-cut with those recordings in place of the replayed shots, and change the tags in edit.json to match.
