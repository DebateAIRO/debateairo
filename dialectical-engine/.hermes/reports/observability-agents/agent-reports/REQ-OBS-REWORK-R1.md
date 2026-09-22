# REQ-OBS-REWORK-R1 — requirements rework case file

**Status:** READY FOR PEER REVIEW

**Authority:** reviewer-authorized round-1 rework under `docs/missions/observability-agents/reviews/REQ-REV-OBS.md` (named verdict `REWORK`). This work does not rewrite the ended REQ-OBS session: every amended frozen SPEC says that the original freeze remains historical, and every superseding choice has an append-only DECISIONS receipt.

**Scope:** filesystem-addressable B1–B10 and N1–N8 in the reviewer verdict. No product code, packet, board, PROGRESS file, reviewer verdict, git index, or git history was changed by this worker. No subagent was launched and no destructive/live acceptance drill was run.

## Finding-by-finding disposition

| Finding | Disposition | Exact author artifacts |
|---|---|---|
| B1 | Resolved. Q2 owns `IMPACT_SLOW` and `IMPACT_RUNNER_GONE`; OBS-01's closed CHECK therefore admits the values OBS-02 emits. The active OBS-02 contract contains one class/severity/impact tuple; the discarded alternatives remain only in review/history receipts. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-01/SPEC.md`; `slices/OBS-01/PLAN.md`; `slices/OBS-01/DECISIONS.md`; `slices/OBS-02/SPEC.md`; `slices/OBS-02/PLAN.md`; `slices/OBS-02/DECISIONS.md` |
| B2 | Resolved. The STOP drill proves `WORKER_LOST` and zero defect rows. Separate isolated fixtures with a fresh heartbeat and healthy Postgres/Hatchet prove `STALL`, `QUEUE_NOT_DRAINING`, `NO_PROGRESS`, and `SUSPICIOUS_SUCCESS`; the acceptance command no longer demands mutually exclusive outcomes from one fault. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-03/SPEC.md`; `slices/OBS-03/PLAN.md`; `slices/OBS-03/DECISIONS.md` |
| B3 | Resolved. The queue acceptance drill submits 10 asks, matching the frozen `queue >= 10 for 5 min` threshold; no one-ask expectation remains in the active contract. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-06/SPEC.md`; `slices/OBS-06/PLAN.md`; `slices/OBS-06/DECISIONS.md` |
| B4 | Resolved. Storm formation occurs on the fifth qualifying signal in a rolling 60-second window; the 15-second summary budget starts at that fifth signal's `detected_at`. An isolated exactly-five-signal fixture and four-signal negative control replace the nondeterministic Postgres-stop expectation. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-07/SPEC.md`; `slices/OBS-07/PLAN.md`; `slices/OBS-07/DECISIONS.md` |
| B5 | Resolved. The capture-gap acceptance injects an isolated typed `obs.capture_gap` row and measures `closed_at` to `detected_at`; it does not claim that changing directory permissions invalidates an already-open file descriptor. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-04/SPEC.md`; `slices/OBS-04/PLAN.md`; `slices/OBS-04/DECISIONS.md` |
| B6 | Resolved. `STALL`, `QUEUE_NOT_DRAINING`, `NO_PROGRESS`, and `SUSPICIOUS_SUCCESS` are each fixed at SEVERE in Q5, the compass, and OBS-03-R11. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-03/SPEC.md`; `slices/OBS-03/PLAN.md`; `slices/OBS-03/DECISIONS.md` |
| B7 | Resolved with B1. OBS-02-R06 now says exactly `THROUGHPUT_ANOMALY` / DEGRADED / `IMPACT_SLOW`; the frozen-source argument is preserved as a reviewer-authorized DECISIONS receipt, not left as an implementation choice. | `slices/OBS-02/SPEC.md`; `slices/OBS-02/PLAN.md`; `slices/OBS-02/DECISIONS.md`; `requirements/observationagent.md` |
| B8 | Resolved without inventing telemetry. The provider safe view remains exactly `provider_ref, model_id, parse_status, at_seq`; provider latency is explicitly `NOT OBSERVABLE`, and no substitute elapsed time is implied. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-06/SPEC.md`; `slices/OBS-06/PLAN.md`; `slices/OBS-06/DECISIONS.md` |
| B9 | Resolved. Q2 now owns fixed template-only `IMPACT_RUN_FAILURE` and `IMPACT_HATCHET_DISPATCH_SLOW` sentences, and OBS-06 binds the two detectors to those codes. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-06/SPEC.md`; `slices/OBS-06/PLAN.md`; `slices/OBS-06/DECISIONS.md` |
| B10 | Resolved without a fifth agent env input. `notify.dev_capture_dir` is validated from the OBS-07 target fragment, must resolve inside the fixed mode-0700 state directory, and is projected only to the sendmail child as `DEBATEAI_DEV_MAIL_CAPTURE_DIR`. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-07/SPEC.md`; `slices/OBS-07/PLAN.md`; `slices/OBS-07/DECISIONS.md` |
| N1 | Resolved. The connections drill measures baseline B and the signal's measured total U after 25 added clients, asserts `U >= B + 25`, and checks exact copy using U rather than literal `25/100`. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-05/SPEC.md`; `slices/OBS-05/PLAN.md`; `slices/OBS-05/DECISIONS.md` |
| N2 | Resolved. The Postgres and Kanban pins are `Plan.md:203` and `Plan.md:240`, respectively, including the OBS-02 ground-truth reference. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-02/SPEC.md`; `slices/OBS-02/DECISIONS.md` |
| N3 | Resolved. Each query-budget test loads exactly 220 runs and 210 work items (10 times the stated 22/21 baseline) into an isolated test database before measuring the bound, then rolls back. | `slices/OBS-03/SPEC.md`; `slices/OBS-03/PLAN.md`; `slices/OBS-03/DECISIONS.md`; `slices/OBS-06/SPEC.md`; `slices/OBS-06/PLAN.md`; `slices/OBS-06/DECISIONS.md` |
| N4 | Disposed as historical/controller-owned, not fabricated. The missing original `.hermes/reports/observability-agents/agent-reports/REQ-OBS.md` is named in the requirements receipt and remains missing; this case file is the rework worker's own report. | `requirements/observationagent.md`; this file |
| N5 | Resolved. The exact state directory is `${HOME}/.local/state/dialectical-engine/observation-agent`; OBS-01 acceptance uses that path and no Architecture placeholder. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; `slices/OBS-01/SPEC.md`; `slices/OBS-01/PLAN.md`; `slices/OBS-01/DECISIONS.md` |
| N6 | Resolved. Hermes list output is treated as a top-level array (`.[]`); the recovery step derives exactly one matching ticket id instead of retaining a placeholder. | `slices/OBS-07/SPEC.md`; `slices/OBS-07/PLAN.md`; `slices/OBS-07/DECISIONS.md` |
| N7 | Resolved as a disjoint extension protocol. Slices own `targets.dev.d/OBS-nn.json` fragments and optional module-local `oactl/*.ts` contributions; OBS-01 lexically discovers them and rejects duplicate keys/verbs. Later slices do not append an OBS-01 file or central registry. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; every `slices/OBS-01` through `slices/OBS-07` `SPEC.md`, `PLAN.md`, and `DECISIONS.md` |
| N8 | Resolved without concealing chronology. The handoff is explicitly historical, records that the original READY/zero-contradictions claims were premature, and separates current rework receipts from the ended seat's claims. | `requirements/observationagent.md`; `requirements/observationagent-compass-block.md`; all seven `SPEC.md` status lines and appended `DECISIONS.md` receipts |

## Files changed by this rework worker

- `docs/missions/observability-agents/requirements/observationagent.md`
- `docs/missions/observability-agents/requirements/observationagent-compass-block.md`
- `docs/missions/observability-agents/slices/OBS-01/{SPEC,PLAN,DECISIONS}.md`
- `docs/missions/observability-agents/slices/OBS-02/{SPEC,PLAN,DECISIONS}.md`
- `docs/missions/observability-agents/slices/OBS-03/{SPEC,PLAN,DECISIONS}.md`
- `docs/missions/observability-agents/slices/OBS-04/{SPEC,PLAN,DECISIONS}.md`
- `docs/missions/observability-agents/slices/OBS-05/{SPEC,PLAN,DECISIONS}.md`
- `docs/missions/observability-agents/slices/OBS-06/{SPEC,PLAN,DECISIONS}.md`
- `docs/missions/observability-agents/slices/OBS-07/{SPEC,PLAN,DECISIONS}.md`
- `.hermes/reports/observability-agents/agent-reports/REQ-OBS-REWORK-R1.md`

The seven `PROGRESS.md` files were read but deliberately not edited because they name the orchestrator as sole writer. Unrelated FIX/SUP/controller changes already present in the shared worktree were preserved.

## Verification evidence

Focused static verification only; the reviewer/controller prohibited destructive or live acceptance drills.

- Trace equality: OBS-01 `15=15`, OBS-02 `10=10`, OBS-03 `12=12`, OBS-04 `8=8`, OBS-05 `10=10`, OBS-06 `10=10`, OBS-07 `11=11`; total `76 SPEC requirements = 76 PLAN rows`.
- Frozen/rework provenance: all 7 SPEC status lines say `FROZEN at creation` and identify reviewer-authorized round-1 amendment; each slice has an appended DECISIONS receipt.
- Compass: 17 lines, within the 25-line limit.
- Banned-word scan: the only 7 matches are the PLAN quantifiability-law lines that enumerate the forbidden words; zero matches occur in requirements or V-runnable acceptance criteria.
- Closed vocabulary: active SPEC `IMPACT_*` tokens are a subset of the Q2 impact enum. The two discarded OBS-02 draft tokens occur only in historical/rejection receipts, not as active requirements.
- Stale acceptance scan: no active `Plan.md:199`, `Plan.md:238`, `.tasks[]`, literal `Postgres is at 25/100`, `chmod 000`, one-ask queue expectation, unresolved state-dir placeholder, or ticket/signal/mail-dir placeholder remains.
- Citation bounds: 99 path/line citations resolved mechanically to one existing file and an in-range line (98 direct/aliased, one unique by line bound); four basename-shortened citations were then resolved by their surrounding sentence to `apps/runner/src/main.ts` and `apps/scheduler/src/index.ts`, and were in range. This mission's `00-intake-H0.md` and corrected target pins 203 and 240 were also read directly.
- Immutability: reviewer verdict SHA-256 remained `9e8d8f528ccc0ff20e751f6076fd1bf4bfc3390f71dbf1353943be1193164d13`; all seven PROGRESS SHA-256 values remained at their pre-rework values recorded below.
- Formatting: global `git diff --check` passed; a separate whitespace/EOF scan passed for every changed author artifact, including untracked slice artifacts and this case file.

PROGRESS hashes: OBS-01 `40137f5b9a5f727c262c8a5c60a6c6fad0d71465e2a59c85d21d135845a25e7f`; OBS-02 `11be8cdcd1a0020137e751c11c3cf1779efdf8551279bd6aac5a23299908a1d8`; OBS-03 `b7dc272c079ebdf3bace8a9d1b11bd60086032afb13d4c6ff140eb9c43662165`; OBS-04 `57a8de0c64c3d50ebbc64f555f0f050a8ff085a763ec478c0df2ec8d8eea7fcc`; OBS-05 `fc49a79936571ae352a8e0bd1b337c8bc77559c63466b05a60701f546f47d814`; OBS-06 `a83debb87b08125797f0053b130c2d5c68539b1e4a8117fa34ee1657e2dd72c8`; OBS-07 `e5f40acf16f378600644db733123a99ddd0e556c12cb9bbce97ae02c517b7e96`.

## Controller-owned packet/history remainder

No filesystem-author artifact remains blocked by B1–B10 or N1–N8. The controller still owns packet/board/history work outside this seat's write authority:

- P1: replace or explain the reviewer packet's `__CURSOR__` placeholder.
- P2/N4: reconcile the packet's demand for the missing original `REQ-OBS.md` with the already-disposed seat death; do not manufacture that report.
- P3: reconcile the packet/H0 demo-log path and the review-time absence finding before treating the 6/1/21 counts as verified.
- P6: correct or retain with override explanation the stale reviewer-model label.
- P7: correct `cli.ts and its three jobs`; the job implementations are in `apps/scheduler/src/index.ts`.
- Board handoff, peer-review ticket/comment, and any Grok round-2 authorization remain controller-only.

P4 and P5 were reviewer confirmations, not open corrections.

**READY FOR PEER REVIEW**

## Round-3 cleanup — REQ-REV-OBS-r2 N9

**Authority and scope:** the round-2 reviewer passed B1–B10/N1–N8 and filed only N9 against the rework-touched V-acceptance clauses. The controller authorized a final N9-only cleanup. No detector, threshold, severity, vocabulary, privacy, timing, source, or ownership semantics changed.

**Disposition:** addressed. The isolated Vitest fixtures remain intact as explicitly non-V worker milestones, outside the numbered V-runnable sections. Each affected SPEC now requires a stimulus-only acceptance preparer that may create a fresh isolated database/state directory, plant named inputs, and run real agent cycles, but may not read or assert the output surfaces. V personally judges independent, pasteable observations:

- OBS-03: `oactl status` counters; a PSQL join from `observation.defect_signal_v` to four exact SEVERE signal rows; four fixed digest lines; PSQL recovery `0|4`; direct labelled EXPLAIN plans at exactly 220 runs / 210 work items.
- OBS-04: the causal `obs.capture_gap` input joined to its OPEN signal with 0–17 s detection delta; status and exact digest copy; the CLEARED successor with 0–20 s delta and zero remaining OPEN rows.
- OBS-06: status, PSQL and fixed digest copy for deterministic 3/4 run failure and 31 s dispatch-p95 inputs; direct labelled EXPLAIN plans at exactly 220 runs / 210 work items plus provider fixtures.
- OBS-07: five PSQL signal rows at offsets 0/10/20/30/40; status/digest root `postgres`, membership 5 and fifth-to-summary delay 0–15 s; a separate four-row `storm QUIET` control; PSQL recovery `0|5`.

**Files in this N9 pass:** `requirements/observationagent.md`; `slices/OBS-03/{SPEC,PLAN,DECISIONS}.md`; `slices/OBS-04/{SPEC,PLAN,DECISIONS}.md`; `slices/OBS-06/{SPEC,PLAN,DECISIONS}.md`; `slices/OBS-07/{SPEC,PLAN,DECISIONS}.md`; and this case file. Each implicated DECISIONS file has an append-only N9 receipt, and each SPEC/PLAN status preserves the earlier freeze/rework history.

**Verification:** focused trace equality remains OBS-03 `12=12`, OBS-04 `8=8`, OBS-06 `10=10`, OBS-07 `11=11`; no numbered V-acceptance step in those four SPECs invokes Vitest; all four have a separate `Worker milestones (not V acceptance)` section; banned words are absent from active requirements/acceptance; the prior stale needles remain absent from active contracts; the round-2 verdict and all four PROGRESS files remained byte-unchanged; whitespace/EOF checks and global `git diff --check` passed. No live fixture, migration, product process, database, packet, board, git index/history, product code, reviewer file, or PROGRESS file was changed or exercised by this requirements pass.

**READY FOR PEER REVIEW — N9 ONLY**
