# Credits - PROOF OF MERGE, UGC Army (30 s)

The film is drawn frame by frame in code from `video/src/` and scored by the synthesizer in `video/audio/`. It uses no stock footage, no samples, no bitmaps and no AI-generated imagery or audio.

## Upstream

Built on [agent-office](https://github.com/AgentSystemLabs/agent-office) by webdevcody / AgentSystemLabs, MIT License, Copyright (c) 2026 AgentSystemLabs. The office the film shows (the agents, terminals, mission control, the review inbox and the x402 task gateway) is that project and this fork of it. The fork is not run by the upstream authors.

## Fonts

All three are under the SIL Open Font License 1.1. The licence texts ship beside the font files in `video/assets/fonts/`.

| Font | Use in the film | Copyright | Licence file |
|------|-----------------|-----------|--------------|
| Archivo (variable, wght 100-900, wdth 62-125) | Display type, the wordmark | Copyright 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo) | `OFL-Archivo.txt` |
| Inter Tight (variable) | UI labels | Copyright 2022 The Inter Project Authors (https://github.com/rsms/inter-tight) | `OFL-InterTight.txt` |
| JetBrains Mono (variable) | Data, hashes, terminals | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) | `OFL-JetBrainsMono.txt` |

The fonts are embedded in the rendered frames, which the OFL permits. They are not sold on their own.

## Music and sound

Original, synthesized from oscillators and seeded noise by `video/audio/compose.mjs`. Mastered to -14 LUFS integrated with a true peak at or below -2 dBTP.

## On-chain values

The release tx, the escrow program id and the EAS schema UID shown in the film are real testnet artifacts (Solana devnet and Base Sepolia). The funds are test USDC. Every other figure, name and row is marked `demo data` on screen.

## Tools

- [three.js](https://threejs.org) 0.186 (MIT) for the post-processing pass
- [Playwright](https://playwright.dev) `playwright-core` (Apache-2.0) with headless Chromium for frame capture
- [FFmpeg](https://ffmpeg.org) 7.1 (LGPL/GPL) with libx264 and libvpx-vp9 for encoding and loudness measurement
- Python 3 with [Pillow](https://python-pillow.org) (HPND) for the review tools
