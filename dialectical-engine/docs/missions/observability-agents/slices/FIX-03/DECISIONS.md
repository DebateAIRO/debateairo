# FIX-03 — DECISIONS (append-only: date · question · choice · reason · who ruled). Never edited, never deleted. Before asking V anything, read this file.

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
- 2026-09-01 · Is S03c (declared-kind projection) its own slice? · NO — folded into FIX-03; the kind list is V-ratified (V-5(a) 2026-08-26) and the runner seam is the Tier-A producer · one V-visible outcome: a runner row joins `obs.run_correlation_v` · REQ-FIX seat
- 2026-09-01 · Is the predecessor runner mis-wiring fixture (JUDGEMENT_POLICY_UNRESOLVED) still valid? · UNVERIFIED-as-fixed — `apps/runner/src/main.ts:97` now wires `judgementPolicy`; FIX-03 uses a real failed run instead · grep 2026-09-01 · REQ-FIX seat
- 2026-09-01 · State of S06 on `dev`? · PARTIAL — installer import at `main.ts:1` and the test file exist (`e8d99d33`); no capture call in `index.ts` · grep 2026-09-01; AUDIT-STATE charge E confirms · REQ-FIX seat
- 2026-09-01 · Tier-B kinds (`node`, `attempt`, `at_seq`) here? · `attempt` moves to FIX-05; `node` and `at_seq` have no owning seam — recorded as gaps · L2-ADDENDUM-2 §2.1 · REQ-FIX seat
