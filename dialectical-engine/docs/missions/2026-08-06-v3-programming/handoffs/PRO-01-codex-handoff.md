# PRO-01 Codex handoff

Ticket `t_19834503` · worker session `019ff566-acaf-73f3-90b8-7381a2fa1217` · branch `dev` · current repository workdir · no commit (Git is V-gated).

## Inventory

- `apps/runner/src/index.ts` — derives the closed 1..5 expansion depth from the pinned envelope basis; builds a breadth-first binary expansion plan; gives every previous-round node one real support child and one real rebutting attack child through the shipped Judge; alternates configured makers by level; records each child's restatement, reduced judgement, GraphWriter node/edge, and lineage; partitions typed memory disclosure outside the B2-A conformance set while persisting it.
- `packages/propagation/src/index.ts` — keeps the rival operator/strength ledger pair jointly absent when UNKNOWN support causes the rival strict-and reading to be withheld.
- `acceptance/ceremony.test.ts` — depth-1 embedded-PostgreSQL proof for 3 real nodes, support+attack edges, distinct call sites, and maker/strength lineage.
- `tests/unit/pro01-runner-tree.test.ts` — DR-159 counts for depths 1..5, maker alternation, per-parent PRO/CON shape, invalid-depth refusal, memory segment partition, and loud envelope exhaustion.
- `tests/unit/v2ui-data-layer.test.ts` — verifies a real support edge renders PRO while the root position stays neutral CLAIM; no adapter behavior change was needed.
- `acceptance/run-acceptance.ts`, `acceptance/pro01-depth2-proof.ts`, `acceptance/README.md` — isolated live proof runner plus exact model-attempt and per-node lineage reporting/documentation.
- `docs/missions/2026-08-06-v3-programming/handoffs/PRO-01-progress.log` — major-step log.

Pre-existing dirt was present before claim across the repository. In overlapping files, the ENV-01 changes in `apps/runner/src/index.ts` (composer `.max(2)`, `parseComposerOutput`, and prompt cap) and prior UI changes in `tests/unit/v2ui-data-layer.test.ts` were preserved. Unrelated dirty files remain attributed to their earlier lanes. No auth-action wiring was added and the POL-01 `onAuthRejected` trap was not invoked.

## TDD RED → GREEN

RED 1:

```text
$ pnpm vitest run tests/unit/pro01-runner-tree.test.ts
Test Files  1 failed (1)
Tests       8 failed (8)
TypeError: buildDebateExpansionPlan is not a function
TypeError: resolveExpansionDepth is not a function
TypeError: partitionServedSegments is not a function
```

RED 2, real embedded PostgreSQL:

```text
$ pnpm vitest run --config acceptance/vitest.config.ts acceptance/ceremony.test.ts
Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)
AssertionError: expected [...] to have a length of 3 but got 2
```

GREEN focused:

```text
$ pnpm vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/pro01-runner-tree.test.ts tests/unit/scoring.test.ts tests/unit/env01-runner-policy.test.ts
Test Files  4 passed (4)
Tests       75 passed (75)

$ pnpm typecheck
$ tsc --noEmit
```

GREEN depth-1 embedded PostgreSQL:

```text
$ pnpm vitest run --config acceptance/vitest.config.ts acceptance/ceremony.test.ts
Test Files  1 passed (1)
Tests       2 passed (2)
```

## Fixture / acceptance evidence

- DR-159 B3-B arithmetic: pure tests prove 3/7/15/31/63 authored nodes at depths 1..5 and equal support/attack counts in every round.
- Depth 1: embedded-PostgreSQL ceremony proves 3 authored nodes, one real support edge, one real attack edge, `JUDGE:defender:r1:p0` plus `JUDGE:critic:r1:p0`, and each strength cites its node's own artifact.
- UI: existing adapter maps `support → PRO`, `attack → CON`; the new behavioral test proves the position remains neutral CLAIM and its real defender child renders PRO.
- Envelope: a focused provider-gateway test reaches typed `RUN_COST_ENVELOPE_EXHAUSTED` before the defender transport is called when the pinned total is consumed. Runtime calls continue through the shipped budget-aware gateways, so mid-expansion exhaustion stops loudly rather than truncating and claiming completion.
- Memory trap: composer output remains capped by ENV-01's `.max(2)`. Typed memory disclosure is persisted as a third renderer segment but excluded from `runServeGateChain`'s conformance/sampling set, preventing an unratified third conformance call.
- Serve B2-A: `runServeGateChain` still receives only the primary root node; expansion nodes are honestly judged, recorded, propagated, and exposed in the graph, but not individually served.
- DR-115: no runtime data is fabricated; every authored node comes from a real Judge artifact and stores its actual provider lineage.

## One authorized REAL depth-2 proof

Command:

```text
ACCEPTANCE_DB_PORT=55433 ACCEPTANCE_API_HOST=127.0.0.1 \
ACCEPTANCE_API_PORT=18080 ACCEPTANCE_SHIM_PORT=18081 \
ACCEPTANCE_STRANGER_SAMPLE_RATE=1 ACCEPTANCE_BATTERY_VERSION=acceptance-v1 \
ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:pro01-depth2 \
./node_modules/.bin/tsx acceptance/pro01-depth2-proof.ts
```

Real output:

```text
ACC-01 run id: 9e39a95d-5ca9-4d50-92fd-e0cc616cfeb6
ACC-01 answer id: 13730d8a-d211-4e79-8e88-2c7007bdc32d
FAIR-01 graph: 7 nodes · 3 attack edge(s)
FAIR-01 makers: Anthropic, OpenAI · independent attack edges: 3
PRO-01 model calls (all outcomes): 11
PRO-01 DEPTH-2 PROOF: 9e39a95d-5ca9-4d50-92fd-e0cc616cfeb6 13730d8a-d211-4e79-8e88-2c7007bdc32d 7 nodes 11 model calls
```

Persisted per-node lineage:

```text
depth 0 · root     · OpenAI    · gpt-5.6-sol    · acceptance:codex-cli
depth 1 · support  · Anthropic · claude-opus-5  · acceptance:claude-cli
depth 1 · defeater · Anthropic · claude-opus-5  · acceptance:claude-cli
depth 2 · support  · OpenAI    · gpt-5.6-sol    · acceptance:codex-cli
depth 2 · defeater · OpenAI    · gpt-5.6-sol    · acceptance:codex-cli
depth 2 · support  · OpenAI    · gpt-5.6-sol    · acceptance:codex-cli
depth 2 · defeater · OpenAI    · gpt-5.6-sol    · acceptance:codex-cli
```

All seven artifacts were read from the settled database. Total model consumption for PRO-01 was exactly 11 real calls (including the Claude startup handshake); both failed setup attempts stopped before any model call. This is below the packet's approximate 22-call expectation because the healthy shipped path made one attempt per organ/call site. No depth-3 run was made; it remains reserved for V.

## Full gates

```text
$ pnpm test
Test Files  63 passed (63)
Tests       449 passed (449)

$ pnpm vitest run --config acceptance/vitest.config.ts
Test Files  9 passed (9)
Tests       35 passed (35)

$ pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }

$ git diff --check
(no output)
```

The root instructions named `bash tests/render-templates.sh` and `bash tests/lint-templates.sh`; this imported app repository contains neither script and has no `skeleton/`, `VERSION`, or `docs/upgrade-guide.md`, so those skeleton-only gates are not applicable here.

## Acknowledged deferrals / risks

- Depth 3 live proof is deliberately deferred to V per the packet. Pure tests cover its 15-node shape.
- Real proof evidence is pasted here because the isolated caller-owned database was stopped and removed after capture; this avoids modifying or resetting the already-running sealed standing acceptance DB.
- Edge magnitudes remain typed UNKNOWN because no evidence verifier measured them; this is inherited FAIR-01/S07 honesty, not a fabricated score.
- The ticket's legacy Kanban card has no typed state block, file contract, authority epoch, or worktree lane. Work followed the explicit goal packet and user-supplied claim authorization in the current workdir.

## Environment tail

- Existing standing acceptance PostgreSQL PID 77685 on port 55432 was left running and untouched.
- The depth-2 proof used a temporary database directory and removed it after clean shutdown.
- No commit, branch, worktree, push, merge, release, database deletion, or product-data mutation was performed.

## Questions for V

None blocking. The review diamond should note that observed healthy depth-2 spend was 11 real calls, below the earlier ~22 estimate, while the V-ratified retry-tolerant ceiling remains 66.
