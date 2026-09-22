# REQ-REV-OBS — verdict on ObservationAgent requirements (round 2)
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion

Round-1 verdict `docs/missions/observability-agents/reviews/REQ-REV-OBS.md` is preserved (SHA-256 `9e8d8f528ccc0ff20e751f6076fd1bf4bfc3390f71dbf1353943be1193164d13`, byte-unchanged this seat).

**HERMES AUTHORIZED NEXT read:** `t_f1236b44` comment 4 (`codex-orchestrator`, 891 chars). Scoped re-review of B1–B10 and N1–N8; inspect only rework-touched product/compass/OBS SPEC/PLAN/DECISIONS; N4 historical; packet P-findings out of scope; write this r2 file; append self-report Round 2; CLAIM/READY here and a pointer on `t_3af6affd`; Grok 4.6; no git writes; no artifact-under-review edits.

## Verdict: PASS | REWORK | BLOCKED

**Named verdict: PASS** (round 2 of max 3).

Every round-1 blocking finding's original failure scenario no longer holds in the active contract. N4 remains historical/controller-owned. One new Important finding (N9) is filed below; it does not restore any r1 blocker.

Probes were built from the r1 CLAIM strings against current files. The rework report's "Resolved" column was not treated as evidence.

## Round-1 findings B1–B10 and N1–N8

**B1 ADDRESSED** · original: OBS-02 added `IMPACT_SLOW` / `IMPACT_RUNNER_GONE` / `IMPACT_LATENCY` outside Q2 while OBS-01-R03 CHECKed Q2 only.
Evidence: Q2 impact paragraph at `requirements/observationagent.md:80` now contains `IMPACT_SLOW` and `IMPACT_RUNNER_GONE` with fixed sentences; `IMPACT_LATENCY` is not a Q2 member. OBS-02-R06 is one tuple `THROUGHPUT_ANOMALY` / DEGRADED / `IMPACT_SLOW` (`slices/OBS-02/SPEC.md:43`). OBS-01-R03 still enumerates every Q2 `impact_code` (`slices/OBS-01/SPEC.md:35`). Active SPEC `IMPACT_*` set is a subset of Q2 (mechanical extract). `INFRA_DEGRADED` / `IMPACT_LATENCY` remain only in historical receipts (`observationagent.md:278`, `slices/OBS-02/DECISIONS.md:13`), not as requirements.

**B2 ADDRESSED** · original: one `kill -STOP` had to produce both WORKER_LOST and STALL/NO_PROGRESS.
Evidence: Q7 one-liner (`observationagent.md:178`) now requires STOP → only WORKER_LOST and zero defect rows, then a separate fixture for the four defect classes. OBS-03 acceptance step 7 (`slices/OBS-03/SPEC.md:84`) prints `0` STALL/QUEUE_NOT_DRAINING/NO_PROGRESS/SUSPICIOUS_SUCCESS rows after STOP; step 9 (`:86`) is an isolated healthy-infrastructure fixture. `UNRESOLVED SOURCE CONTRADICTION` = 0 hits in the scoped files. Q2 truth table is unchanged in force (`observationagent.md:72-78` still suppresses defect rows when heartbeat is stale).

**B3 ADDRESSED** · original: one ask vs queue ≥ 10 for 5 min.
Evidence: Q7 (`observationagent.md:181`) and compass (`observationagent-compass-block.md:11`) require `kill -STOP` plus **10** asks and Q ≥ 10 for 5 min. OBS-06 acceptance step 7 (`slices/OBS-06/SPEC.md:77`) submits ten named asks. Active "plus one ask" = 0 hits; remaining "one ask" is a DECISIONS rejection (`slices/OBS-06/DECISIONS.md:13`). Q5 still ships `Hatchet queue ≥ 10 for 5 min SEVERE` (`observationagent.md:149`).

**B4 ADDRESSED** · original: one Postgres stop as a 5-signal storm with a 15 s clock from first detection.
Evidence: Q3 (`observationagent.md:103`) starts the 15 s summary budget at the **fifth** signal's `detected_at`; fewer than five is not a storm. Q7 (`observationagent.md:182`) and OBS-07-R08 (`slices/OBS-07/SPEC.md:44`) plus acceptance step 10 (`:83`) use exactly five typed fixture signals and a four-signal negative control.

**B5 ADDRESSED** · original: `chmod 000 "$OBS_SPOOL_DIR"` as CAPTURE_GAP stimulus.
Evidence: `chmod 000` = 0 hits in product/compass/SPEC/PLAN (historical note in OBS-04 SPEC `:58` records the invalid drill). Q7 (`observationagent.md:179`) and OBS-04-R04 (`slices/OBS-04/SPEC.md:32`) plus acceptance steps 5–6 (`:68-69`) insert a typed `obs.capture_gap` row in an isolated test database.

**B6 ADDRESSED** · original: STALL / QUEUE_NOT_DRAINING / NO_PROGRESS / SUSPICIOUS_SUCCESS had no severity.
Evidence: Q5 defaults (`observationagent.md:149`) fix all four at SEVERE. OBS-03-R11 (`slices/OBS-03/SPEC.md:54`) and vocabulary (`:67`) use SEVERE. DECISIONS receipt `slices/OBS-03/DECISIONS.md:14`.

**B7 ADDRESSED** · original: OBS-02-R06 was an unfinished "hmm" argument inside a frozen SPEC.
Evidence: `hmm` = 0 hits in scoped files. OBS-02-R06 (`slices/OBS-02/SPEC.md:43`) is a single class/severity/impact tuple. Abandoned alternatives live only in `slices/OBS-02/DECISIONS.md:13`.

**B8 ADDRESSED** · original: Q1 required provider latency from a view with no duration field.
Evidence: Q1 row 11 (`observationagent.md:33`) now requires failure rate from the named safe columns and states latency is `NOT OBSERVABLE` until a successor names a start/finish/duration source; sequence distance is forbidden as a substitute. OBS-06-R05 (`slices/OBS-06/SPEC.md:34-35`) matches. Compass `:11`.

**B9 ADDRESSED** · original: run-failure and dispatch-p95 alerts had no Q2 impact sentences.
Evidence: Q2 (`observationagent.md:80`) owns `IMPACT_RUN_FAILURE` and `IMPACT_HATCHET_DISPATCH_SLOW` with fixed sentences. OBS-06-R03 (`slices/OBS-06/SPEC.md:29`) and R07 (`:41`) bind those codes. Vocabulary block `:60`.

**B10 ADDRESSED** · original: capture dir needed a fifth agent env key under G10.
Evidence: G10 (`observationagent.md:116`) still lists exactly four agent keys; `notify.dev_capture_dir` is validated JSON inside `OBSERVATION_STATE_DIR` and is passed **only** to the sendmail child as `DEBATEAI_DEV_MAIL_CAPTURE_DIR`. OBS-07-R01 (`slices/OBS-07/SPEC.md:23`) and acceptance step 2 (`:75`) check the fragment and "no fifth agent env key".

**N1 ADDRESSED** · original: exact banner `Postgres is at 25/100 connections`.
Evidence: Q7 (`observationagent.md:180`) and OBS-05 acceptance steps 4–5 (`slices/OBS-05/SPEC.md:73-74`) record baseline B, open 25 clients, require measured U ≥ B+25 and copy `Postgres is at U/100`. Literal active `25/100` as the required numerator is gone from SPEC/Q7 (only a historical DECISIONS line remains: `slices/OBS-05/DECISIONS.md:13`).

**N2 ADDRESSED** · original: `Plan.md:199` (postgres) and `Plan.md:238` (Kanban).
Evidence: `Plan.md:199` and `Plan.md:238` = 0 hits in scoped files. Postgres pin is `Plan.md:203` (`observationagent.md:23`); independently verified that line is the `postgres` ruled-service row. Kanban pin is `Plan.md:240` (`observationagent.md:39`, `slices/OBS-02/SPEC.md:22`); independently verified that line is "Hermes Kanban, port 9119".

**N3 ADDRESSED** · original: EXPLAIN ANALYZE on live cardinality claimed to be 10×.
Evidence: OBS-03 acceptance step 12 (`slices/OBS-03/SPEC.md:89`) and OBS-06 step 10 (`slices/OBS-06/SPEC.md:81`) load exactly 220 runs and 210 work items into an isolated test database, then roll back.

**N4 HISTORICAL / CONTROLLER-OWNED** · original missing `agent-reports/REQ-OBS.md`.
Evidence: file still absent (`ls` → no such file). This seat does not demand fabrication. Named in `observationagent.md:283`. Packet P-findings remain on the controller path.

**N5 ADDRESSED** · original: OBS-01 step 4 "ARCH pins" the state-dir.
Evidence: OBS-01 acceptance step 4 (`slices/OBS-01/SPEC.md:90`) uses `${HOME}/.local/state/dialectical-engine/observation-agent` with no Architecture placeholder. G6 (`observationagent.md:112`) pins the same path. Remaining "ARCH pins" hits are the unrelated UNVERIFIED `core.provider_probe` columns (`observationagent.md:241`), not N5.

**N6 ADDRESSED** · original: `jq '.tasks[]'` on `hermes kanban list --json`.
Evidence: OBS-07 acceptance step 4 (`slices/OBS-07/SPEC.md:77`) uses `.[]` on a top-level array. `.tasks[]` remains only as a rejected form in `slices/OBS-07/DECISIONS.md:16`.

**N7 ADDRESSED** · original: OBS-02 appends OBS-01-owned `targets.dev.json` / verb table.
Evidence: Q7 single-writer (`observationagent.md:188`) and OBS-01-R01/R04 (`slices/OBS-01/SPEC.md:29,38`) discover `targets.dev.d/OBS-nn.json` and module-local `oactl/*.ts` lexically, rejecting duplicates. OBS-02 owns `targets.dev.d/OBS-02.json` and `src/modules/job-witness/oactl/witness.ts` (`slices/OBS-02/SPEC.md:87`, `PLAN.md:60`) and edits no OBS-01 file.

**N8 ADDRESSED** · original: in-file Handoff treated a premature READY as completion evidence.
Evidence: section retitled `## Historical handoff and reviewer-authorized round-1 rework` (`observationagent.md:248-252`) labels the original READY as HISTORICAL CLAIM, cites H0 `:75-100` and r1 N8, and records that `Contradictions found: 0` was false (`:267`).

## New breakage (rework-touched clauses only)

**N9** `requirements/observationagent.md:178,179,182` · `slices/OBS-03/SPEC.md:86,89` · `slices/OBS-04/SPEC.md:68` · `slices/OBS-07/SPEC.md:83` · `slices/OBS-06/SPEC.md:77,81`.
Input: V follows those numbered acceptance steps as QA (COMMON §4: human-runnable in the real stack; "a green test suite is a worker milestone, never V's acceptance").
→ Wrong outcome: the STALL/queue/no-progress/suspicious-success proof, the capture-gap causal drill, the storm membership/clock proof, and the 10× query-budget proof are specified as `pnpm exec vitest run tests/integration/…` exiting 0. That is a worker suite, not a V-observable banner/PSQL/status path.
Evidence: those exact commands are the numbered V-runnable steps. OBS-01/02/05 and the OBS-03 STOP path remain terminal/PSQL/osascript. This does not revive B2/B4/B5/N3 — the properties are now consistent — but it demotes V's personal QA for those properties to a green test.
Same-day ticket: keep the isolated fixtures as worker clusters; add a V-facing observation (status/PSQL/digest) per property, or explicitly label the vitest steps as worker milestones outside the V-acceptance section.

No new Critical leftover. No new contradiction that restores a mutually exclusive Q7/Q2 pair.

## What I verified and how

Stale-needle scan over product + compass + OBS-01..07 SPEC/PLAN/DECISIONS (verbatim hit counts in `{SCRATCH}/probes/r2/stale-needles.txt`): `chmod 000` 0; `Plan.md:199` 0; `Plan.md:238` 0; `.tasks[]` 1 (DECISIONS rejection only); active `25/100` 0 in SPEC/Q7; `hmm` 0; `UNRESOLVED SOURCE CONTRADICTION` 0; `plus one ask` 0.

IMPACT extract: Q2 has 39 codes including `IMPACT_SLOW`, `IMPACT_RUNNER_GONE`, `IMPACT_RUN_FAILURE`, `IMPACT_HATCHET_DISPATCH_SLOW`. All seven SPECs' extras vs Q2 = none.

Banned-word grep: 7 hits, all PLAN.md:14 enumerating the ban. Trace: 15/15, 10/10, 12/12, 8/8, 10/10, 10/10, 11/11; PLAN step cells empty. Compass 17 lines. All seven SPECs still FROZEN-at-creation plus reviewer-authorized amendment language.

`Plan.md:203` and `Plan.md:240` re-read on disk this seat.

Did not treat `REQ-OBS-REWORK-R1.md` disposition table as proof.

## What I did NOT verify

- Packet P1–P7 (controller path).
- Whether the named vitest files exist (coding/ARCH; they are specified, not shipped).
- Live docker/hatchet/osascript drills.
- Sibling FIX/SUP reviews (unread).
- Rework worker skill **load** (board comment on `t_3af6affd` from REQ-OBS-REWORK does not open with `SKILLS LOADED`; not a product-file finding).

## Predictions

I expect a synthesis seat to paste Q7 vitest one-liners into `INSTRUCTIONS.md` as if they were V's personal QA. I expect an architecture seat to treat N9 as optional and ship only the test files. First check I would make on ARCH output: whether OBS-03/04/07 clusters still have a PSQL or status observation V can paste without reading vitest reporter text.

## comments read through: 6
