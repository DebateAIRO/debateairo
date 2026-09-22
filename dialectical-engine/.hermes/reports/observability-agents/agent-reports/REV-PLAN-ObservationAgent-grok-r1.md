# Self-report — REV-PLAN-OBS / Grok 4.6 / t_20c8cf26

Seat: independent pre-implementation reviewer of `plans/PLAN-ObservationAgent.md`.
Model: Grok 4.6. Round 1 of max 3.
Tree at CLAIM: `dev @ 2b670d30`, `git status --short` = 70 pre-existing entries, preserved. No git writes.
Comments at CLAIM: 0.

## The case

The plan is a 785-line implementation contract written from a snapshot of OBS artifacts that **pre-dates the reviewer-authorized r3 contract**. Dispatching coders against it would rebuild the exact contradictions REQ-REV-OBS rounds 1–3 already closed.

That is the cause, not a pile of typos. One wrong freeze (`Source-integrity note` at PLAN:21 plus header PLAN:5) produced Task 0's eleven live F-OBS gates, stale "verbatim" V-acceptance for OBS-03/04/05/06/07, the `targets.dev.json` append protocol N7 already killed, and the OBS-02-R06 class that Q2 no longer uses.

## What repeatedly would cost tokens if this plan shipped

| Failure | Price if dispatched | Cause |
|---|---|---|
| Coders implement OBS-03 STOP+STALL as UNRESOLVED | one full OBS-03 seat + rework round against a SPEC that already split the proofs | PLAN Task 3 steps 7–8 vs SPEC:86-88 / DECISIONS:13 |
| Coders `chmod 000` a spool dir as the CAPTURE_GAP drill | unsafe live-FS command + a drill the installer design cannot produce | PLAN Task 4 step 5 vs SPEC:32,58,68 |
| Six parallel worktrees cut from OBS-01 while Tasks 3–7 "depend on OBS-02 merged" | merge fights or incomplete runner-presence modules | PLAN:105 vs SPEC depends-on and S3 ledger |
| OBS-02 appends OBS-01's `targets.dev.json` | N7 replay; two writers on one file | PLAN:110,286 vs OBS-01/DECISIONS.md:17 |
| Vitest treated as V's numbered acceptance | N9 replay; V cannot paste PSQL | PLAN VAL evidence blocks vs SPEC "Worker milestones" |

## What I nearly got wrong

- Nearly treating Task 0 as a harmless paper gate. It is the dispatch poison: it tells the orchestrator to wait for SPEC v2 on defects the SPECs already disposed.
- Nearly scoring PostgreSQL 16 as Blocking. It is a stale stack fact (live is 18.6) but does not change the agent's SQL. Filed Important.
- Nearly treating M2 "acceptance not dispatch" as a clever parallelism trick. OBS-03 consumes OBS-02's runner presence; coding OBS-03 against OBS-01-only trees is a missing-interface defect, not a later-merge cost.
- Nearly folding file-ownership into "style". `src/oactl/witness.ts` and `src/oactl/ack.ts` sit inside OBS-01's `src/oactl/**` create list. That is a single-writer break, the same class as N7.

## Dead ends (do not re-derive)

- `hermes kanban --board observability-agents list --json` is a **top-level array** of 35 tasks, not `{tasks:[…]}`. PLAN Task 7 step 4 still uses `.tasks[]` (the r1 N6 defect). SPEC:79 uses `.[]`.
- `core.work_item.state` is already `READY|CLAIMED|DONE|FAILED` at `migrations/0000_s00.sql:103`. Task 0's "ARCH pin from battery" is a re-derivation, not a missing fact.
- `core.provider_probe` columns are in the INSERT list of `migrations/0048_provider_probe_capability.sql:26-28`: `probe_id,provider_ref,maker,state,model_id,failure_code,probed_at`. State enum is `HEALTHY|ABSENT`.
- Highest migration on this tree is `0049_terminal_recorded_facts.sql` (51 files; two share prefix `0025_`). PLAN correctly leaves `<n>` blank, but Task 0 does not mention PR #8's `0056` on the hardening branch.
- `tests/acceptance/obs-agent-*-fixture.ts` and `*-query-budget.sql` **do not exist yet**. r3 SPECs name them; the plan never creates them.
- Slice `PLAN.md` files are still SCAFFOLDs. PLAN:17 claims "this plan fills them". It did not.

## Where this packet was unclear

- No on-disk packet in `.hermes/planning/observability-agents/packets/` for this seat (same pattern as REQ-REV-SYNTH). The user prompt is the launch contract. Allowed writes are named there, not in COMMON §5's generic `<SEAT>.md` shape — I used the two paths the prompt named.
- COMMON's historical tree (`8d38185c`, 111 dirty) is stale; measured `2b670d30` / 70. Not a finding against the PLAN.
- "Blocking or Important" vocabulary (user) vs heartbeat-reviewer B/N. I used Blocking/Important as the prompt required; B = Blocking, I = Important. No Non-blocking residual class.
- Handoff marker is `READY FOR CONTROLLER REVIEW`, not `READY FOR HERMES REVIEW`. Followed the prompt.

## Packet vs me

The prompt ordered a review of the 785-line plan against **operative r3 OBS artifacts and current repo, not its older snapshot**. That sentence is the whole job. The plan's own header admits it argued from OBS-03..07 as "untracked concurrent-session FROZEN-AT-CREATION" files. Those files are now the r3-amended SPECs. Reviewing the plan's snapshot against itself would have been a false PASS.

Sub-delegation: two read-only Explore children launched (SPEC-vs-PLAN catalog; repo-fact probes). Parent verified every finding at `path:line` below; child claims that were not parent-verified do not enter the verdict.

## Spend

Wall-clock: CLAIM 19:40Z → handoff same session. Skills loaded in full before CLAIM. No product commands that write. Docker SELECT-only + `psql version()`. `hermes list --json` read-only.

## What must be upgraded (V's question, applied to this seat)

Write-as-you-go held (CLAIM, HEARTBEAT, this file before the verdict). The one-prompt machine fails when an architecture seat freezes the **wrong generation** of SPECs and then copies "verbatim" acceptance that is no longer on disk. Mechanical gate: `diff` the plan's quoted V-steps against `slices/OBS-0n/SPEC.md` numbered steps before any CODE packet is minted. That grep would have caught B2–B5 in minutes.
