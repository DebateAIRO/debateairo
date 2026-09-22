# PACKET CODE-REV-OBS-01-C1-C4-OPUS5-R1 — independent code review (mission `observability-agents`)

Read this packet in full before doing anything. The user explicitly replaced the unavailable Grok/GLM review gate with Claude Opus 5. This is an ObservationAgent-only review. PR #8 and every security-hardening branch, commit, check, comment, and file remain parked: do not fetch, inspect, compare, comment on, modify, merge, close, or otherwise touch them.

## 1. Ticket, reviewer, and immutable lane

- Board: `observability-agents`; review ticket: `t_b232f7c0`; work ticket: `t_9f418bcd`.
- Seat/author: `CODE-REV-OBS-01-C1-C4-OPUS5-R1`; runtime/model: Claude Code `claude-opus-5`; replacement-review round 1 of maximum 3.
- Work under review: commit `7f8a805f5732ed2de6fe11eb2750d69ebb1eebbe`, based on `2b670d3059c60d7262cf655bd5d402c88100dff3`; rework delta `33b788230c8d0c78d4d94091e7679db539e06e33..7f8a805f5732ed2de6fe11eb2750d69ebb1eebbe`.
- Detached review cwd for every code, test, and git command: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-01-review-r2/dialectical-engine`.
- Prove before review: exact HEAD above, empty branch name, dependencies present, and porcelain containing at most the historical `.review-scratch-glm-r1/` directory. Never read or use that directory as evidence.
- Never work in the author lane or main checkout. Main-checkout authority files are read-only except for this review's two explicit outputs and board comments below.

## 2. Authoritative review protocol

Read `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/CODE-REV-OBS-01-C1-C4-grok-r2.md` in full as the exhaustive review protocol, with these exact substitutions:

- Its model, seat, ticket, claim, output paths, scratch path, and historical reviewer identity are non-operative.
- Its required reads, frozen rulings, P1–P7 probes, independent refutation-mutant obligations, exact C1–C4 commands/counts, repository gates, finding quality bar, no-subagent rule, and all exclusions remain fully binding.
- Use this packet's model, seat, ticket, paths, and handoff instructions instead.

Do not merely summarize the protocol. Execute all P1–P7 work yourself. Do not spawn or delegate to subagents.

## 3. Mandatory evidence and independence

Before P1, read in full:

- `/Users/vladmihaimiron/Documents/DebateAIRO/.superpowers/sdd/PLAN-ObservationAgent/task-1-review-package-r2.md` — immutable full `base..head` package, including its complete diff.
- `/Users/vladmihaimiron/Documents/DebateAIRO/.superpowers/sdd/PLAN-ObservationAgent/task-1-review-delta-r2.md` — immutable rework delta.
- Current comments on `t_e5a82913`, `t_c70799fe`, `t_00dbafc1`, and `t_9f418bcd`, always with `--board observability-agents`.

Historical process facts only: Grok round 1 reproduced the missing listener schema-USAGE defect but produced no verdict; GPT-5.6-sol rework commit `7f8a805f` fixed it and independently exposed/fixed the grant-order bug that erased UPDATE on the two mutable tables; Grok round 2 never began because three launches returned HTTP 402; GLM completed partial P1–P3 evidence but hit its external quota before P4 and produced no verdict.

For independence, do **not** read `.review-scratch-glm-r1/` at any time. Do **not** read the GLM self-report until your own P1–P7 evidence, provisional findings, and provisional verdict are complete and written in your own scratch notes. Only then read `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/CODE-REV-OBS-01-C1-C4-glm-r1.md` to disposition historical partial findings; never inherit a conclusion without independently reproducing it.

Independently prove at minimum:

1. `SET ROLE debateai_obs_listener` can read only `observation.defect_signal_v` through the intended boundary; direct signal/open-view reads and schema object creation are denied.
2. `SET ROLE debateai_obs_agent` has exactly seven INSERT and two UPDATE table privileges; UPDATE is effective only on `observation.heartbeat` and `observation.sample_ring`; five immutable tables, DELETE, TRUNCATE, and out-of-schema mutations are denied.
3. All required independent mutants meaningfully fail before exact restoration from HEAD.
4. C1/C2/C3/C4 pass three times each at exactly 10/14/12/18 tests.
5. Contract generation and agent TypeScript pass; root typecheck reproduces exactly the pinned eight S14 diagnostics and zero ObservationAgent diagnostics; trace resolution stays inside this worktree; source audit has only the three pinned obs-capture blockers; final committed lane is unchanged.

## 4. Exhaustive write boundary

Allowed:

- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/reviews/CODE-REV-OBS-01-C1-C4-opus5-r1.md`
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/CODE-REV-OBS-01-C1-C4-opus5-r1.md`
- Scratch only under `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-01-review-r2/dialectical-engine/.review-scratch-opus5-r1/`; remove it before handoff.
- Append-only `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` only for a newly proven reusable tooling trap.
- A CLAIM/pointer comment on `t_b232f7c0`, concise phase heartbeats there, and one complete verdict comment on `t_9f418bcd`, always using `--board observability-agents`, `--author CODE-REV-OBS-01-C1-C4-OPUS5-R1`, and `--max-len 80000` where needed.

Forbidden:

- Editing reviewed implementation, tests, migrations, author reports, requirements, plans, SPEC, DECISIONS, ledgers, packets, git refs, or committed worktree content.
- Live database/service mutation outside isolated scratch fixtures; numbered V acceptance; provisioning; launchd mutation; Docker stop/start/restart; browser/UI drills; or real notifications.
- Any PR #8/security-hardening access or operation; any push, merge, rebase, branch creation, amend, or commit.
- Reading/reviewing FixAgent or SupportAgent product implementations.

Temporary refutation mutants must remain uncommitted in the detached review lane. Record the target hash before each mutant, prove behavioral RED, restore the exact file from HEAD, verify its hash, and finish with no Opus-created porcelain entries.

## 5. Claim, verdict, and handoff

After all mandatory reads and lane proof, post CLAIM on `t_b232f7c0`. Send a concise heartbeat at meaningful milestones. Write the self-report first, then the verdict.

Exact verdict structure:

```markdown
# CODE-REV-OBS-01-C1-C4-OPUS5-R1 — verdict
SKILLS LOADED: <only skills actually read>
## Verdict: PASS | REWORK | BLOCKED
## Packet review
## Prior finding disposition
## Blocking findings B1…
## Non-blocking findings N1…
## SPEC conformance
## Code quality
## What I verified and how
## What I did NOT verify
## Predictions for OBS-02
## comments read through: <n>
```

Every finding needs `file:line`, concrete input → wrong outcome, direct evidence, and required correction. No “pass with concerns”; concerns are N findings. Live V acceptance is expected to remain unverified and is not itself a code-review blocker or slice PASS.

Post the complete verdict as one comment on work ticket `t_9f418bcd`, then a one-line verdict pointer on `t_b232f7c0`. Finish with `READY FOR PEER REVIEW` opening with `SKILLS LOADED`, then stop. Never mark either ticket Done.
