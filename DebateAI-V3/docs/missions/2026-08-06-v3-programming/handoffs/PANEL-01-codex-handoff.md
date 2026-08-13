# PANEL-01 Codex handoff — rev3

Ticket: `t_eeea2f6e`  
Worker/session: Codex GPT-5.6 Sol / `019ff5ab-8e6e-7fb3-a433-6a06956f07d6` (same rev1 session)  
Comments read through: `2026-08-12 15:24 codex REWORK ACKNOWLEDGED — PANEL-01 rev3`  
Branch/worktree: `dev` / `/Users/vladmihaimiron/Documents/DebateAIRO` (shared pre-existing dirty tree; no commit, branch, push, merge, or destructive Git action)

## Rev3 correction

- B-4 closed: `makeEnvelopeTerminal` now preserves all existing honesty records while appending `SKIPPED-BY-BUDGET` and `ENVELOPE_EXHAUSTED` records. An M=2 components-only envelope terminal therefore carries both `UNSERVED-MAKER-POSITION` and its DR-161 record instead of throwing `CONDITION_MARK_RECORD_REQUIRED`.
- One serve-unit regression drives the M=2 envelope-exhausted result through the same production record-preservation seam and required-record validation. It pins terminal `COMPONENTS_ONLY` and marks `[UNSERVED-MAKER-POSITION, ENVELOPE_EXHAUSTED]` with both matching records.
- Advisory r2-4 folded: the single `servedNodes` collection feeds both `runServeGateChain` and the composer's `availableNodes`; a runtime assertion refuses unless the collection has exactly one member (`FIXED_SINGLE_ROOT_SERVE_VIOLATED`).
- Advisory r2-2 folded: human reason prose now starts `The first configured maker's root was served…`; the raw `first-configured-provider` token remains only in the typed `served_root_rule` field. ACC-01 asserts the token is absent from the reason.
- The three rev2 closures were left intact: the two-way DR-161 enforcement, recorded-rule/served-reality pin, and deletion-sensitive M guard were not changed.

Rev3 RED:

```text
pnpm vitest run tests/unit/serve-s05.test.ts
Test Files  1 failed (1)
Tests  1 failed | 19 passed (20)
TypeError: preserveEnvelopeTerminalConditionMarkRecords is not a function
```

Rev3 final gates:

```text
pnpm run generate:contract
$ tsx packages/contract/src/generate.ts
exit 0

pnpm vitest run tests/unit/pro01-runner-tree.test.ts tests/unit/serve-s05.test.ts tests/unit/s14-ui.test.ts
Test Files  3 passed (3)
Tests  41 passed (41)

pnpm vitest run --config acceptance/vitest.config.ts acceptance/ceremony.test.ts
Test Files  1 passed (1)
Tests  2 passed (2)

pnpm vitest run tests/integration/database.test.ts
Test Files  1 passed (1)
Tests  31 passed (31)

pnpm vitest run tests/architecture
Test Files  14 passed (14)
Tests  49 passed (49)

pnpm test
Test Files  65 passed (65)
Tests  461 passed (461)

pnpm typecheck
$ tsc --noEmit
exit 0

pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source: { "blocking": [] }

bash tests/render-templates.sh  # /Users/vladmihaimiron/Documents/DebateAIRO
Rendered templates into <temporary directory>
exit 0

bash tests/lint-templates.sh    # /Users/vladmihaimiron/Documents/DebateAIRO
exit 0
```

The full-suite count increased from rev2 because other authorized work was present in the shared tree; all 461 tests passed. No paid-provider proof was repeated for this four-line behavior correction.

## Rev2 outcome

- DR-161's closed kernel vocabulary now contains `UNSERVED-MAKER-POSITION`; both UI label surfaces render the plain chip text `Another maker's position was not served`.
- The mark has a required typed `ConditionMarkRecord`. The serve gate enforces both directions: a required mark without its record and a record without its served-answer mark are typed refusals.
- The record names both makers and both authored root ids, identifies the served root in `subject_ref`, and carries `served_root_rule: first-configured-provider` through migration, persistence, contract, and API projection.
- `SERVED_ROOT_RULE` and `selectServedRoot` make the B2-A rule explicit. The selected outcome drives the actual served fact, node, number, provenance, envelope subject, and terminal completion; ACC-01 pins the recorded subject to the root owning the served number.
- `UNCOVERED-SCOPE` remains in its original Q27 diagnostic vocabulary but is no longer used for PANEL-01.
- Integration covers both `agent_count: 3 → RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` and requested/configured mismatch, with provider call count and persisted `MODEL_CALL` count both zero.
- Engine topology, cross-root edges, lineage, and arithmetic behavior were not changed.

## Files owned by this rework

- `packages/kernel/src/index.ts`, `packages/contract/src/index.ts`, `packages/serve/src/index.ts`, `migrations/0018_panel01_rework.sql`
- `apps/runner/src/index.ts`, `apps/runner/src/main.ts`, `acceptance/main.ts`
- `apps/v2-ui/lib/v3/labels.ts`, `web/lib/v3Presentation.ts`
- `tests/unit/{serve-s05,s14-ui,pro01-runner-tree}.test.ts`, `tests/integration/database.test.ts`, `tests/support/v2uiFixtures.ts`, `acceptance/ceremony.test.ts`
- `acceptance/README.md`, `decisions-ledger.md`, and the PANEL progress/handoff files
- `packages/contract/generated/*` was regenerated; its checked-in output was already byte-current.

Pre-existing shared-tree changes outside these paths were preserved.

## TDD RED → GREEN

RED:

```text
pnpm vitest run tests/unit/s14-ui.test.ts acceptance/ceremony.test.ts tests/integration/database.test.ts
Test Files  1 failed | 1 passed (2)
Tests  1 failed | 44 passed (45)
expected CONDITION_MARKS length 24; received 23

pnpm vitest run --config acceptance/vitest.config.ts acceptance/ceremony.test.ts
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
expected [ 'UNCOVERED-SCOPE', … ] to include 'UNSERVED-MAKER-POSITION'
```

The integration guard cases were already GREEN in the RED run, proving the production guard was correct while adding the missing deletion-sensitive coverage.

GREEN focused:

```text
pnpm vitest run tests/unit/pro01-runner-tree.test.ts tests/unit/serve-s05.test.ts tests/unit/s14-ui.test.ts
Test Files  3 passed (3)
Tests  40 passed (40)
```

The serve unit case independently removes each half of the DR-161 pair:

```text
missing record → CONDITION_MARK_RECORD_REQUIRED
missing mark   → CONDITION_MARK_RECORD_WITHOUT_MARK
```

## Final gate output

```text
pnpm run generate:contract
$ tsx packages/contract/src/generate.ts
exit 0

pnpm vitest run --config acceptance/vitest.config.ts acceptance/ceremony.test.ts
Test Files  1 passed (1)
Tests  2 passed (2)

pnpm vitest run tests/integration/database.test.ts
Test Files  1 passed (1)
Tests  31 passed (31)

pnpm vitest run tests/architecture
Test Files  14 passed (14)
Tests  49 passed (49)

pnpm test
Test Files  63 passed (63)
Tests  457 passed (457)

pnpm typecheck
$ tsc --noEmit
exit 0

pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source: { "blocking": [] }

bash tests/render-templates.sh  # /Users/vladmihaimiron/Documents/DebateAIRO
Rendered templates into <temporary directory>
exit 0

bash tests/lint-templates.sh    # /Users/vladmihaimiron/Documents/DebateAIRO
exit 0
```

The first architecture attempt correctly rejected bare migration DDL (`ADD COLUMN` without `IF NOT EXISTS`); the migration was made replay-safe, then the architecture suite passed 49/49.

## Advisory disposition

- A-1 folded: deleted the zero-production-caller `buildDebateExpansionPlan`; the live multi-maker planner now refuses its FAIR-illegal dead M=1 branch. Live two-maker topology is unchanged.
- A-2 recorded: mono-maker remains the existing one-root/no-expansion path; the old M=1 seven-node proof is not claimed reachable by PANEL-01.
- A-3 recorded in DR-161 and here: independent root authorship is +1 logical call versus DR-159's original arithmetic; depth 1 observed 12 rather than 11 and depth 5 computes to 405 rather than 402. The ratified 402 gateway ceiling remains authoritative and hard-stops before an unfunded call; only V may revise it.
- A-4 recorded: the UI still accepts unbounded positive `agent_count`; runtime now has deletion-sensitive typed refusal coverage for values above M=2. UI max/hint is follow-up surface work.
- A-5 recorded: two of four depth-1 cross-root attack edges are visible only in the edge/drawer representation because the tree chooses the support parent. No graph data is lost.
- A-6 recorded: both authored roots retain the existing aggregate materialized path `0`; node ids and provenance remain distinct.
- A-7 folded: acceptance README call-site examples now include `root<root>`.
- A-8 recorded: the ruled cross-root exchange remains one fixed round and does not deepen with the depth dial.

The rev1 live proof remains valid because both lenses verified its engine evidence (2 roots, 8 nodes, 4 attacks, 4 independent cross-maker attacks, 12/42 calls). No second paid-provider proof was run for this honesty-only rework.

## Open questions

None. DR-161 and the rev1 diamond decided the contract and serve-choice rule.
