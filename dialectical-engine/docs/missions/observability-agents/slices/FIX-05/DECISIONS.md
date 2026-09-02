# FIX-05 — DECISIONS (append-only: date · question · choice · reason · who ruled). Never edited, never deleted. Before asking V anything, read this file.

- 2026-09-01 · Does the predecessor D11 auto-merge apply in phase 1? · NO — every FixAgent action is approval-first; QUICK auto-merge is a V-flipped later phase (`quick_arm` OFF, FIX-14) · V newer statement "Initially I want to be in charge of everything" wins (intake C1); row V-1 asks CONFIRM · orchestrator (intake), V to confirm
- 2026-09-01 · Is a shared read-only `obs.*` store coupling between two "standalone" agents? · NO — standalone = separately deployable, startable, killable processes with their own kill switch · intake C3 · orchestrator
- 2026-09-01 · Who detects "it just does not work" (stalls, non-draining queues, blind periods)? · ObservationAgent detects and emits a typed signal; the FixAgent consumes only error/defect-shaped input · intake C4 default; row V-3 pending · orchestrator, V to confirm
- 2026-09-01 · Do predecessor S-tickets carry over as slice tickets? · NO — FIX slices are fresh on board `observability-agents`, each citing the S-tickets it absorbs; the old board is history · intake C7 · orchestrator
- 2026-09-01 · What is Done for this slice? · V personally runs SPEC §5 and vetoes; green suites and PASS verdicts are milestones · V vertical-slice law, spine v3.4.0 item 2 · V
- 2026-09-01 · User-linked identifiers in any obs row? · NONE — `asker_id`/`session_id` inexpressible; correlation via declared kinds only · R-E4 (V 2026-08-21) + Batch-7 (V 2026-08-22) · V
- 2026-09-01 · Free-text remnant anywhere in `obs.*`? · NONE — codes, chain codes, typed template parameters only · Batch-3 row 6 (V 2026-08-21) · V
- 2026-09-01 · How many custodians? · ONE — V; additional approvers are a future grant · E6-02 as amended (V 2026-08-22) · V
- 2026-09-01 · Filesystem metadata on zone files? · NONE — no read, import, listing, hash/size/mtime/mode; no SQL against `identity.*`; mount reality from the text of `apps/api/src/index.ts` only · Batch-8 (V 2026-08-26) · V
- 2026-09-01 · Model access for any worker this slice spawns? · CLI relay only; a DR-179 lift swaps the adapter and expands no authority · DR-179 + OBS-R090 · V
- 2026-09-01 · Deletion or pruning of obs data? · NONE absent an explicit V retention law · DR-188 · V
- 2026-09-01 · Test-file partition for this mission? · `tests/<suite>/fix<NN>-*.test.ts(x)` per slice; landed `obs-l*` files keep their names · REQ-FIX (extends predecessor GLOBAL-TEST-SURFACE) · REQ-FIX seat
- 2026-09-01 · Banned words in any step or criterion? · improve, better, robust, handle, appropriate — never · COMMON §4 · orchestrator
- 2026-09-01 · Does Done wait on RP-0? · YES — the registered code (`PROVIDER_CALL_FAILED`) requires the `declared_gap` hash V ratifies on `t_4deda7ab`; before it the row is honest but minimized · RP-0 card + V-5 row · V
- 2026-09-01 · Which Tier-B kind lands here? · `attempt` (hoist `lastAttemptId`) and Tier-A `ledger_entry` · L2-ADDENDUM-2 §2.1 rows 4-5 · REQ-FIX seat
