# Meta VR Start Developer Competition 2026

Last checked: 2026-10-01. Sources: the Devpost overview and official rules, and Meta's announcement blog post (links below). Anything not stated there is marked [unverified].

Plan: enter Agent Office's WebXR mode (branch `launch/webxr-mode`) as a hands-first productivity app in the Quest browser, where you sit at a desk with your coding agents and manage them with your hands.

Code status on 2026-10-01: `launch/webxr-mode` and `launch/docker-sandbox` have no commits. Nothing in the XR description, the gestures, the seated mode or the sandboxed demo office exists yet; all of it is the plan. Upstream already has the 3D office, workers at desks, shared terminals, voice chat and multiplayer in the browser.

## Deadline

- Submission closes: **Wednesday 2026-11-18, 12:00 PST (UTC-8)**. That is 20:00 UTC and 22:00 in Vilnius. US daylight saving ends on 2026-11-01, so this is PST, not PDT.
- Entry period opened 2026-09-24, 10:00 PT.
- Judging: on or around 2026-11-18 to on or around 2026-12-09.
- The project must stay available to judges until the winner announcement.
- Winners announced: on or around 2026-12-11.
- Internal target: headset footage recorded by 2026-11-12, submit by 2026-11-16 to leave two days for a failed upload.

## Links

- Devpost (register and submit): https://start-developer-competition-26.devpost.com/
- Official rules: https://start-developer-competition-26.devpost.com/rules
- Resources: https://start-developer-competition-26.devpost.com/resources
- Meta VR Start program (membership, required): https://developers.meta.com/vr/discover/programs/start/
- Announcement: https://developers.meta.com/blog/meta-connect-2026-vr-start-developer-competition/
- Developer forum: https://communityforums.atmeta.com/category/horizon-developer-forum

## Eligibility checklist

- [ ] 18 or older, and of the age of majority where you live.
- [ ] Not resident in, or an entity based in, Brazil, Quebec, or an area under comprehensive international sanctions (the rules name Crimea, Russia, Cuba, Iran, North Korea and Syria). Lithuania is fine.
- [ ] A Meta account with developer access enabled.
- [ ] **Member of the Meta VR Start program by the time you submit.** Apply today: approval time is not published [unverified], and without it the entry is void.
- [ ] One submission per person. You can be a solo creator, a solo creator with non-representative team members, or a team representative, but not two of these at once [unverified: whether a non-representative member may also join other teams].
- [ ] Built with tools and SDKs that are public or available to Start members. WebXR in the Quest browser qualifies; IWSDK is Meta's suggested WebXR path (Node 20.19 or newer).
- [ ] Fully usable with hands end to end: someone must be able to finish the whole experience without ever pairing a controller.
- [ ] English, or English subtitles.
- [ ] Third-party code properly licensed: Agent Office is MIT, so keep `LICENSE` and credit it.
- [ ] Employer: check the employer's policy on outside work, IP ownership and accepting prizes before registering.
- [ ] **Division.** Adapted / Significantly Updated is for "any build, prototype, or published app that existed prior to September 24, 2026". Upstream Agent Office's first commit is 2026-09-25, so it does not qualify as pre-existing. New is for a project "conceived of and built within the competition window" with "no pre-existing codebases", and a fork of someone else's codebase may break that. Neither fits cleanly. Ask Meta on the Devpost discussion board or by email which division they expect for a fork of a third-party project started inside the window, keep the answer, and disclose fully either way. [unverified]
- [ ] Track: **Productivity** (multi-panel workspaces, task management). Special awards to aim for: Best Agentic Interaction ($25k) and Social and Multiplayer ($25k).

## Pre-existing code disclosure

The form asks Adapted entries for "a summary of the new features and capabilities added during the competition window" with screenshots and changelogs. Give the same summary in the New division, in the description, so there is no doubt about what is ours. Paste the long text from [disclosure.md](disclosure.md), then:

```field name="What we built during the window" max-chars=1200
During the competition window we added a WebXR immersive mode to Agent Office so it runs in the Meta Quest browser with hands only: pinch to walk to a desk, poke the laptop to focus a worker's terminal, pinch-drag to scroll, a palm-up wrist menu to hire, pause or dismiss a worker, and a seated mode that keeps every desk within reach. Workers run in throwaway Docker containers so the public demo office is safe to open. Everything else (the 3D office, the agents at desks, shared terminals, voice chat, GitHub boards) is upstream Agent Office by webdevcody (MIT). Changelog: {{DIFF_URL}}
```

Then paste the output of `npx tsx launch/tools/whats-new.ts` (see [disclosure.md](disclosure.md)).

## Project description

The official form asks for a project name, track, division, a description (the overview suggests 500 words or less; the rules give no limit) covering inspiration, how it was built, what is next and a target launch date, team details, the build (APK invite link or a WebXR URL) and the video link. Devpost's own name and tagline limits are assumed below [unverified: Devpost defaults].

```field name="Project name" max-chars=60
Agent Office XR
```

```field name="Elevator pitch" max-chars=200
Sit at a desk in VR with your AI coding agents. Hire one with a pinch, watch its terminal on the laptop in front of it, and steer the whole team with your hands.
```

```field name="Description" max-words=500
## Inspiration
Coding agents now work for hours on their own, but managing five of them means five terminal tabs on a laptop screen. Agent Office (an MIT open source project by webdevcody) already turned that into a shared 3D office: every agent sits at a desk, its live terminal on the laptop in front of it. A headset is the natural home for that office. You get a desk that is as wide as the room, and your hands are free.

## What it does
Agent Office XR opens the office in the Quest browser. You sit, and the desks come to you. Pinch to hire a Claude Code, Codex or other worker at an empty desk and give it a GitHub issue. Poke a laptop to bring that worker's terminal up in front of you, pinch-drag to scroll, and look away to let it keep working. Turn your palm up for a wrist menu that pauses, resumes or sends a worker home. Teammates can join the same office from a browser or another headset and talk over voice.

## How we built it
Upstream Agent Office is TypeScript with three.js on the client and a Node server that runs each agent in a pseudo-terminal. We added a WebXR session, hand-tracking input with pinch, poke and palm gestures, a seated layout, and terminal panels readable at headset resolution. Workers in the public demo run in throwaway Docker containers with no host secrets.

## Challenges
Readable terminal text in a headset, keeping 60 fps with several live terminals, and gestures that do not fire by accident while you are reading.

## What's next
Eyes-and-hands focus for picking a terminal by looking at it, passthrough so the office desk sits on your real one, and an App Lab build.

## Target launch date
{{LAUNCH_DATE}}

## Credit
Built on Agent Office by webdevcody / AgentSystemLabs (MIT). Only the XR mode and sandbox work listed in the changelog are ours: {{DIFF_URL}}
```

Testing instructions for judges (not word-limited): open `{{DEMO_URL}}` in the Quest browser, tap "Enter VR", sign in with the judge password `{{JUDGE_PASSWORD}}` (a demo office whose workers run in sandboxes and cannot reach the internet except GitHub and the model API).

## Judging criteria

Stage one is a pass/fail check against the requirements. Stage two scores four criteria at 25 percent each.

| Criterion (25% each) | What judges look for | Our answer |
| --- | --- | --- |
| Innovation and creativity | Originality, ambition, fit with the track | Managing a team of coding agents as coworkers at desks is new in VR; productivity track, agentic interaction award |
| Experience design | Mechanics, user journey, seated and hands-first | Seated mode, desks within reach, pinch and poke only, a satisfying loop in under ten minutes: hire, assign, watch it open a PR |
| Technical implementation | Expertise, reliability, platform tools, performance [unverified: whether a frame-rate floor is stated] | WebXR hand tracking, instanced office geometry, terminal text as textures updated only on change; show the frame counter in the video |
| Polish and presentation | UI, art direction, submission material | Cartoon office art from upstream, clear wrist menu, a video that leads with the best 20 seconds |

Special awards that fit: Best Agentic Interaction (agents doing real work while you watch), Social and Multiplayer (a team in the same office with voice).

## Demo video script

Rules: less than three minutes, footage of the project as viewed on a Meta Quest device or via the XR Simulator or an equivalent emulator, public on YouTube or Vimeo [unverified: hosting sites]. Lead with the best material. **Meta's judging notes say: "show real gameplay that honestly represents the experience. Don't lean on AI-generated video to carry the pitch."** Use real footage only. Treat an AI voiceover the same way and narrate it yourself; the rules do not mention voiceover separately [unverified]. English narration or English subtitles.

Runtime target: 2:45 (limit: under 3:00)

Record on a Quest 3 with the built-in recorder at 1080p, plus a phone on a tripod for the over-the-shoulder shots of your hands. Keep the frame counter visible in shots 4 and 7.

| Time | Shot | Voiceover (your own voice) |
| --- | --- | --- |
| 0:00-0:15 | Headset view: you sit down, three desks with agents typing slide in around you | "These are my coworkers. They are coding agents, and in VR they sit around me." |
| 0:15-0:35 | Over-the-shoulder, then headset: pinch an empty desk, pick Claude Code, pick a GitHub issue | "Pinch an empty desk to hire a worker and hand it an issue. No controllers, ever." |
| 0:35-1:00 | Poke the laptop, the terminal comes up, pinch-drag to scroll the agent's output | "Poke a laptop to read what that agent is doing. Pinch and drag to scroll." |
| 1:00-1:20 | Palm up, wrist menu, pause one worker, resume another; frame counter visible | "Palm up for the wrist menu: pause, resume, or send a worker home." |
| 1:20-1:45 | A teammate joins from a laptop browser, their avatar walks in, voice chat | "My teammate joins from a browser. Same office, same agents, and we can talk." |
| 1:45-2:10 | The worker finishes: the PR appears on the board, you open it in VR | "The agent opened a pull request. I review it without leaving my desk." |
| 2:10-2:30 | Seated wide shot, all desks busy; cut to the sandbox view showing a blocked command | "Every worker runs in its own sandbox, so a public office stays safe." |
| 2:30-2:45 | Title card: Agent Office XR, built on Agent Office by webdevcody (MIT), repo and demo URL | "Built on the open source Agent Office. Link below." |

## Submission checklist

- [ ] Meta VR Start membership approved (screenshot the approval email).
- [ ] Organizer's answer on the division saved.
- [ ] WebXR build hosted at `{{DEMO_URL}}` over HTTPS, reachable from the Quest browser, and staying up until at least 2026-12-11.
- [ ] Judge password set, demo office seeded with a repo and two issues, sandboxes on, spending caps on the model API key.
- [ ] Whole flow done with hands only, controllers switched off, seated.
- [ ] 60 fps checked on a Quest 3 with three live terminals.
- [ ] Video: under 3:00, real headset footage, own voice, English, public on YouTube or Vimeo.
- [ ] Description under 500 words (run `npx tsx launch/tools/lint.ts`), all `{{...}}` placeholders filled.
- [ ] Track Productivity, division as agreed, target launch date given.
- [ ] Changelog and screenshots attached; `whats-new.ts` output pasted.
- [ ] Submitted on Devpost before 2026-11-18 12:00 PST, and the confirmation email saved.
