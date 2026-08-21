# XREV-01 — Codex handoff

Ticket `t_b8750870` · worker session `019ff7d3-d99a-7212-9bd3-33271c577712` · shared `dev` tree · no commit (Git is V-gated).

## Outcome

Every authored node in a currently ratified depth-1/2 M=2 debate is reviewed through the shipped Judge organ by a configured maker whose recorded house differs from the author. The append-only `ledger.node_review` resource links author artifact, review artifact, typed outcome, reasons, and the review artifact's actual model lineage. The database rejects same-maker grading and author-lineage mismatches.

The closed kernel vocabulary is exactly `agree | dispute | cannot-assess`. A valid `cannot-assess` is recorded model judgement. A failed/invalid review call creates no verdict and, under DR-165(3), throws `NODE_REVIEW_UNAVAILABLE` before any answer can be served. The database's same-maker integrity refusal retains its exact typed code, `PRODUCER_GRADING_FORBIDDEN`, across the repository and runner boundaries.

DR-137 mono-maker runs remain lawful. Until V resolves their tension with DR-165's total-review wording, they serve only with the existing typed disclosures `SINGLE-LINEAGE` and `CRITIQUE-UNAVAILABLE`, each backed by a required answer-level condition-mark record and the lift path `RUN_DIFFERENT_MAKER_CRITIQUE`. The depth guard is unconditional for M=1 and M=2: depth 3+ currently throws `NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED` before model calls.

The served Node contract carries required `review: NodeReview | null`. Null remains truthful for incomplete/pre-review resources. V2 canvas cards reuse `ModelBadge` and `scoreBadge`; the existing node drawer shows reviewer house, outcome, and reasons. No new widget class was introduced.

## Changed files

- Domain/engine: `packages/kernel/src/index.ts`, `packages/judgement/src/index.ts`, `apps/runner/src/index.ts`.
- Persistence/projection/contract: `migrations/0019_xrev01_node_review.sql`, `packages/db/src/schema.ts`, `packages/serve/src/index.ts`, `packages/contract/src/index.ts`.
- V2 UI: `apps/v2-ui/components/DebateCanvas.tsx`, `apps/v2-ui/components/NodeDetailDrawer.tsx`, `apps/v2-ui/app/globals.css`.
- Tests/fixtures: `tests/unit/xrev01-node-review.test.ts`, `tests/unit/contract.test.ts`, `tests/unit/v2ui-pages.test.ts`, `tests/unit/s14-ui.test.ts`, `tests/integration/database.test.ts`, `tests/support/v2uiFixtures.ts`, `acceptance/ceremony.test.ts`.
- Proof: `acceptance/run-acceptance.ts`, `acceptance/xrev01-depth1-proof.ts`.
- Durable mission artifacts: this file and `XREV-01-progress.log`.

The shared tree contained extensive pre-existing work in several modified files. XREV-01 edits were kept to the listed seams and additive files; no unrelated changes were reverted or committed.

## TDD RED → GREEN

RED command:

```text
pnpm vitest run tests/unit/xrev01-node-review.test.ts tests/unit/contract.test.ts
Test Files 2 failed (2)
Tests 4 failed | 4 passed (8)
Failures: REVIEW_OUTCOMES undefined; selector absent; Judge.review absent; strict NodeSchema rejected review.
```

GREEN focused result after implementation and DR-165 strengthening:

```text
pnpm vitest run tests/unit/xrev01-node-review.test.ts
Test Files 1 passed (1)
Tests 5 passed (5)

pnpm vitest run tests/integration/database.test.ts -t "failed review honestly absent|depth-2 two-maker"
Test Files 1 passed (1)
Tests 2 passed | 31 skipped (33)
```

Rev2 integration RED reproduced the mono disclosure and typed-code laundering defects while the newly added depth-3 M=2 call-site test was already GREEN against the still-present call site:

```text
pnpm vitest run tests/integration/database.test.ts -t "depth-3 M=2|producer-grading refusal|claims, judges through"
Test Files 1 failed (1)
Tests 2 failed | 1 passed | 32 skipped (35)
Failures: mono answer had condition_marks=[]; PRODUCER_GRADING_FORBIDDEN became NODE_REVIEW_UNAVAILABLE.
```

Rev2 focused GREEN:

```text
Test Files 1 passed (1)
Tests 3 passed | 32 skipped (35)

Test Files 1 passed (1)
Tests 5 passed (5)

$ tsc --noEmit
```

## Mutation-proof assertions

- Kernel array equality kills renaming, widening, reordering, or removing any typed outcome.
- N-generic selector expectations kill `!== → ===`, fixed-index, and hardcoded-pair selection.
- 16/16 depth-2 review rows kill loop deletion, partial/root-only coverage, and depth-1 hardcoding.
- Every `author_maker !== reviewer_maker` plus the database rejection probe kills selector bypass and trigger removal.
- `NODE_REVIEW_UNAVAILABLE`, zero review rows for the first invalid response, and zero served answers kill fabricated `cannot-assess`, swallowed call failure, and serving incomplete coverage.
- Depth 1/2 pass plus depth 3/5 typed refusal kills removal or widening of the DR-165 coverage gate.
- Real-runner depth-3 M=2 and depth-5 M=1 probes both assert the typed refusal and zero persisted `MODEL_CALL` rows; restoring the former `effectiveMakerCount > 1` guard or deleting the call site now fails integration.
- Mono depth-1 projection assertions require both disclosure marks and both required records, including their typed reason and lift path.
- A same-recorded-maker provider-double run requires `PRODUCER_GRADING_FORBIDDEN` and zero answers, killing the bare-catch laundering path.
- Exhausted gateway returning `RUN_COST_ENVELOPE_EXHAUSTED` kills review calls outside the ratified budget path.
- Contract omission/invalid-vocabulary tests kill optional review absence and UI-parsed free prose.
- Card/drawer source assertions kill reviewer-house removal, outcome removal, reason removal, and fabricated absence styling.

## Per-depth review arithmetic (DR-165(3))

Current M=2 engine topology has `A(d)=2^(d+2)` authored opinions: two full B3-B root trees plus two ordered cross-root responses. Total review coverage adds exactly `A(d)` review calls. A healthy pre-XREV run is `A+4` logical calls; a healthy reviewed run is `2A+4`. The full first-try topology is `2A+7`, including the shipped serve reservation. Provider bounds permit up to three charged attempts per logical call.

XREV therefore halves ratified healthy-run headroom at every depth, not only depth 3+: current-member/healthy ratios fall from `3.50→2.10`, `3.30→1.83`, `3.17→1.68`, `3.09→1.59`, and `3.05→1.55`. Every first-try topology fits arithmetically under the present members, but none of the five depths fits a full three-attempt reservation. DR-165 separately rules operational coverage to depth 1–2, so the engine refuses depth 3–5 even though their first-try arithmetic is below the current member.

| Depth | A: authored + reviews | Current member | Healthy pre-XREV `A+4` | Pre headroom | Healthy XREV `2A+4` | XREV headroom | Full first try `2A+7` | Restore 3x healthy | Full 3-attempt reservation |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8 + 8 | 42 | 12 | 3.50x | 20 | 2.10x | 23 | 60 | 69 |
| 2 | 16 + 16 | 66 | 20 | 3.30x | 36 | 1.83x | 39 | 108 | 117 |
| 3 | 32 + 32 | 114 | 36 | 3.17x | 68 | 1.68x | 71 | 204 | 213 |
| 4 | 64 + 64 | 210 | 68 | 3.09x | 132 | 1.59x | 135 | 396 | 405 |
| 5 | 128 + 128 | 402 | 132 | 3.05x | 260 | 1.55x | 263 | 780 | 789 |

The two candidate member sets placed before V, without recommendation, are:

- `60 / 108 / 204 / 396 / 780`: restores 3x headroom over the healthy XREV path `2A+4`.
- `69 / 117 / 213 / 405 / 789`: reserves three charged attempts for the full `2A+7` topology.

These are derived candidates, not ratified register values; AC-76 leaves the choice to V.

## Real depth-1 proof (single authorized paid/real run)

Command used isolated ports/database and did not restart or mutate the standing ceremony:

```text
ACCEPTANCE_DB_PORT=55433 ACCEPTANCE_API_HOST=127.0.0.1 ACCEPTANCE_API_PORT=8792 ACCEPTANCE_SHIM_PORT=8793 ... tsx acceptance/xrev01-depth1-proof.ts
```

Pasted terminal result:

```text
ACC-01 run id: f5d0c6f6-5ae4-4e8c-aa98-5001c6a38bd0
ACC-01 answer id: 603ef41f-0fd8-4d99-af5f-4a005342bb43
FAIR-01 graph: 8 nodes · 4 attack edge(s)
FAIR-01 makers: Anthropic, OpenAI · independent attack edges: 4
PRO-01 model calls (all outcomes): 20
XREV-01 DEPTH-1 PROOF: f5d0c6f6-5ae4-4e8c-aa98-5001c6a38bd0 603ef41f-0fd8-4d99-af5f-4a005342bb43 8/8 authored/reviewed nodes 20/42 model calls
```

Outcomes: `agree` ×3, `dispute` ×2, `cannot-assess` ×3. Every OpenAI-authored node was reviewed by Anthropic `claude-opus-5`; every Anthropic-authored node was reviewed by OpenAI `gpt-5.6-sol`. Each review carried a distinct persisted raw-artifact UUID (full JSON lineage was printed by the proof command).

Spend disclosure: exactly 20 run-scoped `MODEL_CALL` ledger attempts against the 42 ceiling, plus one Anthropic relay startup health handshake outside the run ledger. The local CLI relays expose no currency/token-price receipt, so exact monetary spend is unavailable and is not fabricated.

## Verification

```text
pnpm test
Test Files 68 passed (68)
Tests 486 passed (486)

pnpm typecheck
$ tsc --noEmit

pnpm run generate:contract
$ tsx packages/contract/src/generate.ts

pnpm lint
architecture: 27 edge rows checked, violations []
source: blocking []

pnpm run audit:text-bytes
REPOSITORY_TEXT_CONTROL_BYTES=0

pnpm vitest run --config acceptance/vitest.config.ts acceptance/ceremony.test.ts
Test Files 1 passed (1)
Tests 2 passed (2)

pnpm --filter dialectical-engine-web build
Compiled successfully; 8/8 static pages generated.
```

The root `AGENTS.md` names `bash tests/render-templates.sh` and `bash tests/lint-templates.sh`, but neither file exists in this repository; both commands returned `No such file or directory`. XREV-01 does not touch `skeleton/`, so no VERSION/CHANGELOG/upgrade-guide change applies.

## Risks / review focus

- DR-165 arrived after the real proof. The proof is depth 1 and remains valid; the final code additionally refuses unratified depth 3+ and makes failed reviews unservable.
- Review rows are append-only and unique per node. Future re-review/version semantics require a separate ruling rather than silently overwriting lineage.
- The depth arithmetic has an explicit tension: every first-try topology fits its current member, no full three-attempt topology fits, and DR-165 explicitly limits operation to depths 1–2. The implementation follows the ruling, not an inferred larger scope.
- The standing ceremony database does not gain `ledger.node_review` until its next restart/migration ceremony. No restart was performed in night mode. After that restart, the two existing pre-XREV debates will truthfully project `review: null` / `REVIEW N/A` for every historical node because no review rows exist for them.

## QUESTIONS FOR V

1. For depths 1–5, should the replacement `max_model_attempts` members be `60/108/204/396/780` (restore 3x healthy-XREV headroom), `69/117/213/405/789` (full three-attempt reservation), or another V-ruled set? No option is recommended here.
2. Does DR-165's total-review wording change DR-137 mono-maker legality, or should lawful mono-maker runs continue serving with `SINGLE-LINEAGE` + `CRITIQUE-UNAVAILABLE` records as implemented?
3. Should a future reviewed-node version create a second append-only review version, or is one immutable review per authored node the permanent product rule?
4. Currency spend cannot be reconstructed from the local CLI relays. If monetary disclosure is required, should a provider billing-receipt carrier be added in a separately ruled slice?

## Handoff gate

REWORK READY FOR HERMES REVIEW — XREV-01 rev2. Comments read through: Codex `REWORK ACKNOWLEDGED` at 2026-08-13 01:01:01 Europe/Bucharest; no newer comment at the final pre-handoff scan.
