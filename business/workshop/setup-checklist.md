# Workshop setup checklist

## Two weeks before

- [ ] Confirm group size, format (1 or 3 days), remote or on-site, and whether a client repository is used on day 3.
- [ ] Create or reset the workshop GitHub organization; fork the five exercise repositories into it and reset each to its `workshop-start` tag.
- [ ] Branch protection on every default branch: PRs required, one approval, CI must pass.
- [ ] Provision the shared office on a VM in an EU region (4-8 vCPU, 16-32 GB RAM), behind TLS, with accounts only (shared password off).
- [ ] Create one office account per participant; send invite links on the morning of day 1, not before (they are single-use).
- [ ] Model access: one API key per participant with a spending limit, or confirm each participant's own plan and its limits.
- [ ] Rerun every seeded issue with the current model. Note which ones still show their lesson; replace the rest.
- [ ] Prepare the fallback PRs for the review blocks (T6 weakened test, T9 extra dependency, B5 logged personal data).

## Participants, one week before

Send this list:

- [ ] A GitHub account, and acceptance of the workshop organization invite.
- [ ] A laptop with a current browser. No local installs needed: everything runs in the shared office.
- [ ] Optional: your own Claude or other coding-agent subscription, if your company prefers you use it.
- [ ] Read the one-page task template (attach it).

## Morning of each day

- [ ] Office up, TLS valid, every account can sign in.
- [ ] Exercise repositories reset; CI green on the default branches.
- [ ] Spend dashboard or provider usage pages open on the instructor screen.
- [ ] Shared doc for the rejected-PR list.

## After the workshop

- [ ] Export metrics (merged, rejected, review minutes, spend per participant) and send them to the group.
- [ ] Revoke the participant keys and office accounts, or hand the office over if it continues as a pilot.
- [ ] Delete participant data from the office within 30 days unless agreed otherwise.
- [ ] Send the survey results and your notes on what to change to the next run's materials.
