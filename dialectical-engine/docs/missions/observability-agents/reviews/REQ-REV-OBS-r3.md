# REQ-REV-OBS — verdict on ObservationAgent requirements (round 3)
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion

Round-1 `docs/missions/observability-agents/reviews/REQ-REV-OBS.md` is preserved (SHA-256 `9e8d8f528ccc0ff20e751f6076fd1bf4bfc3390f71dbf1353943be1193164d13`).
Round-2 `docs/missions/observability-agents/reviews/REQ-REV-OBS-r2.md` is preserved (SHA-256 `6afcc63eacfcab066aa9f2128da29b709c3171e6eeec8fc32704957c811182ec`).

**HERMES AUTHORIZED NEXT read:** `t_f1236b44` comment 7 (`codex-orchestrator`, 728 chars) — ROUND 3 final, inspect only r2 N9 against current Q7 and OBS-03/04/06/07 SPEC/PLAN/DECISIONS plus the appended N9 section of `REQ-OBS-REWORK-R1.md`; numbered V-acceptance must expose independent PSQL/status/digest/direct-EXPLAIN; Vitest only in non-numbered worker-milestone sections; preparers stimulus-only; preserve r1/r2; write this r3 file; append self-report Round 3; CLAIM/READY here and a pointer on `t_3af6affd`; Grok 4.6; no git writes; no artifact-under-review edits.

Packet P-findings and r1 B1–B10 / N1–N8 are out of scope this round.

## Verdict: PASS | REWORK | BLOCKED

**Named verdict: PASS** (round 3 of max 3 — last lawful product rework round).

## r2 N9

**N9 ADDRESSED.**

Original r2 claim (`reviews/REQ-REV-OBS-r2.md:74-78`): numbered V-acceptance steps for OBS-03 defect rows + 220/210 EXPLAIN, OBS-04 CAPTURE_GAP open/clear, OBS-06 run-failure/dispatch copy + EXPLAIN, and OBS-07 five-signal storm clock were `pnpm exec vitest run …` exiting 0, which COMMON §4 forbids as V's personal QA.

Current files (probed from that CLAIM, not from the rework "addressed" paragraph):

- Numbered V-acceptance lines matching `^\d+\.` that contain `vitest`: **none** in OBS-03/04/06/07 SPEC. Q7 one-liners (`requirements/observationagent.md:178,179,181,182`) contain **no** `vitest`.
- Each of those four SPECs has a non-numbered heading `## Worker milestones (not V acceptance)` (OBS-03 `:93`, OBS-04 `:75`, OBS-06 `:86`, OBS-07 `:89`) holding the vitest commands. Worker text says a green result does not replace the numbered steps.
- Former N9 properties now have pasteable V observations:
  - OBS-03 defect rows: SPEC `:86-87` — `oactl status` counters; PSQL join from `observation.defect_signal_v` to four exact SEVERE rows; four digest lines. Recovery PSQL `0|4` at `:88`. Direct labelled EXPLAIN at 220/210: SPEC `:90` pipes `tests/acceptance/obs-agent-03-query-budget.sql` and requires V to read `Execution Time: X ms` with X ≤ 100.
  - OBS-04 CAPTURE_GAP: SPEC `:68-70` — PSQL join of typed gap row to OPEN with 0–17 s delta; status + digest copy; CLEARED successor 0–20 s and zero remaining OPEN.
  - OBS-06 copy + EXPLAIN: SPEC `:78-79` status `3/4` and `31s`, PSQL two impact rows, two digest lines; SPEC `:84` counts `220|210` then labelled EXPLAIN SQL.
  - OBS-07 storm: SPEC `:83-85` five PSQL offset rows `ui|0` … `tls_front_door|40`; status/digest root `postgres`, members 5, delay 0–15 s; four-row `storm QUIET` control; recovery PSQL `0|5`.
- Stimulus preparers: each SPEC's V-acceptance preamble (`OBS-03/SPEC.md:76`, `OBS-04/SPEC.md:62`, `OBS-06/SPEC.md:70`, `OBS-07/SPEC.md:72`) forbids the fixture from reading or asserting signal/delivery/status/digest/EXPLAIN. Numbered steps expect only a ready/recovered token from the preparer (`OBS-03 FIXTURE READY`, `OBS-04 GAP INPUT READY`, `OBS-06 ANOMALY INPUT READY`, `OBS-07 FIVE INPUTS READY`); product verdicts are the subsequent PSQL/status/digest/EXPLAIN lines. PLAN/DECISIONS receipts (`OBS-03/PLAN.md:72`, `OBS-03/DECISIONS.md:16` and the OBS-04/06/07 twins) bind the same split.

Q7 one-liners now name stimulus-only preparers plus V-owned PSQL/status/digest/EXPLAIN, not a suite verdict.

## New breakage (N9-touched clauses only)

None. No new Critical or Important defect in the inspected Q7 rows or OBS-03/04/06/07 SPEC/PLAN/DECISIONS. Preparer ready-tokens are input-complete handshakes, not product assertions. Isolated-database EXPLAIN is V-read SQL, not a pass/fail wrapper.

## What I verified and how

Catalog of every numbered V-acceptance step in OBS-03 (14), OBS-04 (10), OBS-06 (13), OBS-07 (14) with vitest/PSQL/status/digest/EXPLAIN/preparer flags: `{SCRATCH}/probes/r3/acceptance-catalog.txt`. Numbered-vitest grep: empty. All vitest hits in scoped files sit under Worker milestones or PLAN/DECISIONS receipts. Q7 rows re-read at `observationagent.md:178-182`. Did not treat `REQ-OBS-REWORK-R1.md` Round-3 "Disposition: addressed" as evidence.

## What I did NOT verify

- r1 B1–B10 / N1–N8 (out of contract this round).
- Packet P-findings (controller path).
- Whether `tests/acceptance/obs-agent-*-fixture.ts` or the checked-in EXPLAIN SQL files exist on disk (coding/ARCH; specified, not shipped).
- Live fixture execution.
- Sibling FIX/SUP reviews (unread).

## Predictions

I expect ARCH to implement the stimulus preparers as quiet input planters and then still be tempted to make V's EXPLAIN step a wrapped `test` that prints PASS. First check: the four `tests/acceptance/*-query-budget.sql` / storm PSQL strings remain the thing V pastes, not a vitest reporter line moved back into a numbered step.

## comments read through: 9
