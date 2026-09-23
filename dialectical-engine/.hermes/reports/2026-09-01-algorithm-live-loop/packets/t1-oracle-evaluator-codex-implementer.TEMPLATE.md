# CODEX IMPLEMENTER PACKET (TEMPLATE) — F-T1-ORACLE-EVALUATOR · used ONLY if codex's review of the V-authorised rework still blocks (V's directive, 2026-09-07: "put Codex to do the implementation and you do the review")

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator   (branch lane/t1-oracle-evaluator; base = <the last reviewed tip>; you WRITE in this lane — codex exec --cd <lane> --sandbox workspace-write)
working dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine
the plan      : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md (REVISION 4) · the manifest /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-manifest.md · every verdict snapshot under /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/
your own reviews: you wrote r0–r2b; the residual you named is the work.
review        : the ORCHESTRATOR (Fable 5.1) reviews your implementation — it wrote none of it; V directed the switch. Opus 5 seats are released.
```

## NAMED FACT (D68 ADDENDUM 2), carried verbatim
Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

## OUTCOME
<the residual from the last verdict, verbatim> — then round 3 per your own "Conditional round-3 dispatch reconciliation" (emission RED by the wrong key,
the start:end key, both WHOLE_DOMAIN fallbacks removed, the three bare controls routed, the nine LoginFlow layouts as a modelled case, the model mutants
remeasured at emission, the 44 transcripts under /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh v3 with the LoginFlow K30/m6 grant, the gates, ONE full suite with fourcount5).

## Contract (D61)
allowed  : tests/support/depthOracle.ts · tests/unit/s1-1-depth-contract.test.ts · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-codex-impl.md (your report) ·
           /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-manifest.md (append-only execution columns) · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/* · the lane's .hermes/TOOLING-TRAPS.md (append-only) ·
           temporary mutant targets: the two files above and apps/ui/components/LoginFlow.tsx (K30/m6 only), each restored inside one v3 transcript
forbidden: all_others · no permanent shipped-file edit · never push · never merge · never touch integration, lane-devsync or lane-t1-oracle-loginfp · no edits to the board or the DECISIONS file · no credential values (D18)
Commit on the lane with a message naming the round; RED first per step; STRENGTH on every claim; end your report with `READY FOR PEER REVIEW` or `BLOCKED <why>`.

## Records and gates (D64 ADDENDUM 6 — binding, verbatim; added 08:50 2026-09-09 per F-EVALUATOR-R3-STAMPS — the v1 template carried no stamp contract, so round 3's 148 records had 99 NO-STAMP and 2 STALE)
# RECORDS BLOCK — pasted verbatim into every worker packet from 2026-09-07 (D64 ADDENDUM 6). Absolute paths only.

## Records and gates (binding)
- Every acceptance gate is emitted by `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/gate-run.sh <worktree-engine-dir> <absolute-log-path> <label> <command…>` (D45) — never a hand-rolled `vitest run … > file`; the tool stamps commit and tree and checks clean state before and after.
  The command must name the TOOL, not a package script, so the emitter records the compiler/runner identity: `pnpm exec vitest run <file>` and `pnpm exec tsc --noEmit -p <tsconfig>` (reproduce the package script's semantics), never `pnpm run typecheck`. Baselines at the untouched base are taken the same way.
- Commit EVERYTHING of the round — source, tests, the manifest, `.hermes/TOOLING-TRAPS.md` appends — BEFORE taking any gate record, transcript or stamp (D64 ADDENDUM 5). A record taken before a later commit is re-taken.
- Every record carries `commit=<40 hex>` (gate-run.sh and mutate.sh v3 write it; anything you write by hand carries it on its first line). Run `bash /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/stamp-check.sh <lane-worktree> <absolute-log-dir>/<final-round-prefix>` at your final tip over your FINAL-HEAD gate and mutant records only (the base provisioning record and RED/baseline captures are reported separately by name), and paste its last line.
- Exit codes are read UNPIPED (zsh has no $PIPESTATUS; `cmd | tail` hides the exit). Run the command, capture `$?`, then print.
- The project-local runner for every capture: `pnpm exec vitest run …` (mutants included); re-run transcripts go to NEW file names (mutate.sh appends).
- Mutants via `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh` v3 (`MUT_EXPECT=<n>` for multiplicity): each must name the assertion it kills. Scope the mutant to the layer of the property: a RUNTIME property whose value the callers supply is pinned by a CALL-SITE mutant; a SIGNATURE contract (a required parameter, a return type) belongs to the DECLARATION and is pinned by a declaration mutant against a TYPE-LEVEL observer (a compile-negative contract check). Before declaring any mutant unobservable, check the runtime, type and build observers in turn.
- Every claim carries STRENGTH (entailed / consistent-with / undetermined — D67); every number is read from its artifact at write time; every file path in your report is read from the tree by grep, never assumed; timestamps only from `date`.
- Provisioning is the orchestrator's: `<log-dir>/01-provision.log` ends with `PROVISIONED OK commit=<40 hex>` and nothing follows it (the file is sealed); if that line is not its last line, BLOCKED — do not provision yourself.
- BASELINES at the untouched base are the orchestrator's too: they are supplied as records under `<log-dir>/baseline/` with their own note `<log-dir>/baseline/00-BASELINE.log` (never appended to the provisioning log) (taken through gate-run.sh in a separate base worktree) or the packet names the base worktree you may READ. Never detach, checkout or reset your lane to another commit, never create a worktree; if a baseline you need is absent, BLOCK and name it.
- The programmatic compiler for in-test contract checks is the declared `typescript-classic` alias (`npm:typescript@5.9.3`), not the shipped `typescript@7.0.2` — say which one a check runs on.

For a Codex seat the same block binds: every gate record through gate-run.sh with the tool named; every hand-written record (RED captures, JSON summaries, notes) carries `commit=<40 hex>` on its first line; `stamp-check.sh <lane> <log-dir>/<final-round-prefix>` at the final tip over the final-head gate and mutant records, its last line pasted into the report. The codex sandbox cannot listen() — a full suite inside it is not a gate (TOOLING-TRAPS); the orchestrator takes the full suite outside.
