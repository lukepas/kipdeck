# Demo footage and the silent cut

Scripts that capture the technical demo from the real, built office and cut it, so the video reads before the founder records the voiceover. The cut's voiceover is [voiceover.txt](voiceover.txt), generated from the captions in [edit.json](edit.json); [../README.md](../README.md) says how to record it and lay it on. [demo-script.md](../demo-script.md) is the live recording-day plan.

The outputs go to `launch/video/out/`, which git ignores:

| File | What it is |
| --- | --- |
| `demo-3min-silent.mp4` | 1920x1080, 30 fps, 2:56, video only (no audio track), the voiceover as one-line captions |
| `demo-3min-captions.srt` | The same captions on the same clock (a copy is kept here) |
| `demo-60s-9x16.mp4` | 1080x1920, 60 s, the highlight for phones, video only |
| `footage/`, `web/`, `gfx/`, `build/` | The shots, the explorer screenshots, the cards and pages, the rendered segments |

[cut-list.txt](cut-list.txt) says where each beat and shot starts, and [voiceover.txt](voiceover.txt) where each line of the voiceover starts.

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

To change the cut, edit [edit.json](edit.json): the order, lengths, pans, crops, address bars, tags, notes and captions are all there. Then run `cards.mjs` and `assemble.mjs` again. `assemble.mjs` refuses a caption over 42 characters or faster than 17 characters a second. The title and end cards print the source repository, `github.com/zbagdzevicius/kipdeck` (`FORK_URL=github.com/<owner>/<repo>` overrides it), and Kip's mark from `design/logo/mark.svg`. `REUSE=1` keeps segments already in `out/build/`; delete a segment's `seg-NN.mp4` to render it again (the title is 00, the end card 28).

Rules the edit keeps: hard cuts only (a crossfade only out of the title card); at most three text layers on a shot (a note or a web page's address bar at the top, the source tag, the caption); one line per caption; mission control drawn 1.4x; the key hints and the bottom bar hidden in office shots.

## What is real and what is demo data

Every shot carries a tag that says which it is.

- **Real**: the Solana Explorer pages (issue #2's bounty account on the demo repository `zbagdzevicius/ugc-army-demo`, a test repository that keeps its name from before the rename because its bounties' addresses are derived from it, and the release `2CNXXdgQ...LSELWD8r` from a 2026-10-03 test run through the approver-wallet path, signed by the attester `3VFT...ZFHk` and the approver `55vg...5ypN`, with no GitHub merge behind it), the easscan schema page (test attestations only), the Blockscout page for the 2026-10-04 x402 payment (Basescan blocks scripts; Blockscout reads the same chain), PR #4 on GitHub (merged on 2026-10-07 by the operator's own account, so it counted as self and paid nothing), the code pages (this repository's files with their line numbers, including the escrow program's Release, InitBounty and Refund), and the 402 answer, which is the office's own from its real route on a local test office.
- **Demo data**: everything inside the office. The crew are stand-in units, a shell script that posts Claude Code's hooks. The Issues board mirrors the demo repository's devnet bounties: #1 holds 10 test tokens and is claimed by PR #4 (paid 0), #2 holds 15 and #3 holds 25. The board labels them TEST, since the mint is a devnet test token standing in for USDC. The unit hired on camera for issue #2 is the one whose terminal is shown next.
- **Replay**: a counted merge and its payout, played on PR #4. The real PR #4 was merged by its own operator, so it counted as self and nothing was paid. The payout runs on the office's mock chain, so the toast and receipt say "mock chain" and link to no transaction. No real transaction is paired with PR #4.
- **Test data**: the `/pom/` ledger is the test fixture, because the live board is empty until the first real merge is attested.

The ERC-8004 registry shot and the x402 queue shot were dropped: no feedback transaction exists yet, and the queue's tag sat over its Approve button.

After a merge that counts (an agent's new pull request merged by a second account with write access; PR #4 can no longer be one), the approval from the admin's Phantom wallet, the payout and its attestation (see the shot list in demo-script.md), put those recordings in `out/footage/`, point the replayed segments in edit.json at them with the right tags, change the beat 4-7 captions from "when" to what happened, and re-run `cards.mjs` and `assemble.mjs`.
