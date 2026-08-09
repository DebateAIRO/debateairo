# S04 · Codex handoff — judge contract and panel

Worker session: `019fe0ad-de0d-75f1-823a-3144013a874c` (Hermes run 37)  
Ticket: `t_25fb27f0`  
Workdir: `/Users/vladmihaimiron/Documents/DebateAI-V3` (existing V-provided workdir; no branch/worktree/commit/push operation)  
Comments read through: comment `#204`, including V's `#203` DR-128 ruling and the rework acknowledgement

## Inventory

- `packages/kernel/src/index.ts` — the single closed claim-type vocabulary and spec §12.3's five abstention kinds.
- `packages/judgement/src/s04.ts` — code-first claim normalization; bounded unknown-model result enforcement; strict raw → one-fence → brace-balanced parsing; the register-row-shaped deterministic reducer; panel bulkhead; typed member failures; dispersion; correlated-family discount; DR-077 selection; declared disagreement outcome; typed non-answer enforcement.
- `docs/architecture/05-register-skeleton.md`, `packages/register/src/index.ts` — DR-128's surgical `claimTypeCompositionMap` key + `ClaimTypeCompositionMember` structural mint, canonical reader, and typed-loud missing/invalid outcomes. No production value or claim-type cell was added.
- `packages/judgement/src/index.ts` — the real P4 judge gateway now requires the five assessment sub-objects, applies the ordered parser, returns distinct `JUDGE_PARSE_FAILURE` / `JUDGE_SCHEMA_FAILURE`, asks for model claim typing only when code returned `unknown`, and supplies the raw-artifact contract classifier before persistence.
- `packages/providers/src/index.ts`, `packages/ledger/src/index.ts` — unconditional raw persistence now records the contract's `PARSED` / `PARSE_FAILED` / `SCHEMA_FAILED` result and error; classifier failure itself still produces an artifact.
- `apps/runner/src/index.ts` — real **single-judge** shell attachment: shared claim-type resolution → model assessment → deterministic reduction → DR-077 weighted selection → truthful `NOT_MEASURED` disagreement receipt → propagation. The multi-member panel, dispersion, correlated-error discount, declared-disagreement evaluation, and typed non-answer surfaces remain explicitly unattached in `reports/orphan-audit.json`; missing V-ratified policy data fails loudly before claim/generation.
- `migrations/0004_s04.sql`, `migrations/0005_s04_rework.sql`, `packages/db/src/schema.ts` — `core.node.claim_type`; raw parse error/status; the full reduced-judgement receipt; typed-null dispersion; panel contract hashes; disagreement receipt; once-per-run selection-rule key/version/source provenance; the walkable `node_strength_record.reduced_judgement_ref`; and the DR-128 register-row shape gate. Post-review DDL lives in 0005 because 0004 may already be recorded by the applied-migrations ledger.
- `packages/graph/src/index.ts` — graph writes carry the code/model-enforced claim type.
- `tests/unit/judgement-s04.test.ts`, `tests/unit/register-s04.test.ts`, `tests/unit/judgement.test.ts`, `tests/unit/provider.test.ts` — all named S04 gates, the typed-loud DR-128 reader, the truthful single-judge disagreement receipt, and provider-boundary persistence.
- `tests/architecture/s04-contract.test.ts` — DDL vocabulary/carrier parity and real runner attachment.
- `tools/orphan-audit/src/index.ts`, `tests/architecture/scaffold.test.ts`, `reports/orphan-audit.json` — the S03 Seam-A operator resolver plus all six reviewed S04 surfaces are inventoried with truthful `ATTACHED` / `UNATTACHED` state; the five genuinely unattached panel/dispersion/correlation/disagreement/non-answer units also remain in `neverCalled`, while the shared `resolveClaimType` is truthfully attached.

## RED → GREEN

The first S04 RED exercised all new behavior before any implementation:

```text
Test Files  1 failed (1)
Tests       10 failed (10)
classifyClaimText / parseJudgeAssessment / reduceAssessment /
runJudgePanel / measureDispersion / applyCorrelatedErrorDiscount /
selectReducedJudgement / applyDeclaredDisagreement were absent
```

The first GREEN was `10/10`; the final S04 unit file is `11/11`, including the later spec-§12.3 non-answer assertion.

## Gate evidence

| Gate / law | Evidence |
|---|---|
| DR-062 claim typing | Eight-member kernel vocabulary; code-first regex leg; multiple matches → `mixed`; no match → `unknown`; scope remains absent unless extracted; the real judge prompt asks the model for `claim_type` only on `unknown`, and code rejects an out-of-set proposal. |
| FX-LG-16 parsing | Raw JSON, one fence, then brace-balanced extraction respecting strings/escapes. A successfully parsed wrong shape stops as `SCHEMA_FAILURE`; it is never relabeled parse failure. The provider persists the distinction and error on the unconditional artifact. |
| FX-LG-16 reducer | Typed assessment → typed receipt. Composition cells and every coefficient/cap/ladder value come from the provenance-bearing `CompositionMapRegisterRow`; absent V-pending cells return `COMPOSITION_UNRESOLVED`, never a score. Branch, fixed driver order, ordered what/to-what/why/by-what caps, typed holes, ladder position, weakest link and two-direction rationale are emitted. |
| FX-LG-15 bulkhead | Primary is preserved when a panel member fails; failure note carries member role, contract hash, closed failure kind and reason. Producer identity is rejected before the member callback (`FX-HR-H6`). |
| FX-LG-15 dispersion | Fewer than two distinct judgement refs returns typed `ABSENT`, not zero. At two, spread is scaled by declared row data, clamped, and carried with a `DISPERSION` source separate from τ. |
| FX-LG-15 correlation | Known families are grouped in first-appearance order; first keeps earned weight; repeats receive one flat declared multiplier from original weight (never compounding); unknown-family records remain uncoupled with their typed reason. The served record contains role/derived family, never provider/model fields. |
| DR-077 selection | Selection score is exactly `tau × effectiveWeight`; highest score chooses one candidate; served τ is that candidate's exact τ, never a mean or weighted τ. The named test moves the serve from `0.7` to `0.9` solely by changing earned weights. Rule key/version/source and selected ref are recorded. |
| FX-S22-01 | Both flag branches execute from a declared predicate result with predicate/observation provenance. Fire emits `DISAGREEMENT` + certainty downgrade and never abstains; no-fire leaves certainty unchanged. No threshold or should-not-fire case was authored; S12 still owns the standing rate monitor. |
| FX-PT-D1 | Seed `404077`, 200 arbitrary unusable-panel runs: empty usable candidates always return typed `NO_USABLE_JUDGEMENTS`; no τ exists. |
| Typed non-answers | The model's choice is code-enforced against spec §12.3 Home 1's five members with unknown/provenance refs; an unknown sixth member fails loudly and no numeric stand-in is created. |
| DR-115 | Production generation still crosses the real provider gateway. All numeric fixtures and policy cells are explicitly test-layer values passed only by tests; the production main supplies none and therefore fails loudly until V-ratified policy rows are composed. |

## Exact local verification

```text
pnpm exec vitest run tests/unit tests/architecture
Test Files  21 passed (21)
Tests       88 passed (88)
```

```text
pnpm typecheck
$ tsc --noEmit
```

```text
pnpm lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }
```

```text
pnpm build
✓ Compiled successfully
✓ Generating static pages (7/7)
```

## PostgreSQL environment tail

The focused DB command was attempted locally:

```text
pnpm exec vitest run tests/integration/database.test.ts tests/integration/graph-database.test.ts
```

Both suites stopped during embedded PostgreSQL provisioning, before migration or any assertion:

```text
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...)
Test Files 2 failed (2)
Tests      34 skipped (34)
```

Review must run those two files outside the sandbox. In particular, verify migration `0004_s04.sql`, `recordReduced`, the new graph `claim_type` write, raw parse-error persistence, and the runner's selection-rule provenance columns on real PostgreSQL.

## Carry-forward acknowledgements

- S03 operator attachment remains outside this patch's ruled inputs; the required `packages/register.resolveScoringOperator` honesty row is now generated in `reports/orphan-audit.json` and asserted. No false attachment was claimed.
- `web/lib/recommendation.ts` still has the locale-sensitive comparison recorded for S14; S04 did not churn that lane.
- S03's O(n²) scale observation and production collation-pin suggestion remain non-blocking future work.
- The S03 entry conditions, propagation purity, P8 resolver behavior and DR-115 paths were reviewer-verified; none were redesigned.

## Questions for V

None added. DR-128 closed the structural authority gap only. Map contents remain V's at VG-02/DR-023 and are still absent/loud; the disagreement threshold and labelled should-not-fire case also remain deliberately absent.

## Rework 1 · migration-ledger expectation

The first outside-sandbox run reached `121/122`. The sole failure was the S01 idempotency fixture's hard-coded applied-migration list, which still ended at `0003_s03.sql` after S04 added `0004_s04.sql`. `migrate()` had already applied and transactionally registered 0004, then correctly skipped it on the second call; the stale assertion rejected that truthful fifth ledger member. The fixture now expects all five names through `0004_s04.sql`. No production DDL or migration-runner behavior was weakened or bypassed.

## Rework 2 · directed review findings

Completed every directed item that does not depend on the pending V mint:

- added `ledger.node_strength_record.reduced_judgement_ref` and a real served-number → strength → reduced-judgement join assertion;
- attached `resolveClaimType` to the real judge and removed the divergent inline classifier;
- records a truthful typed `NOT_MEASURED / SINGLE_JUDGE_WALKING_SKELETON` disagreement receipt rather than misusing a dispersion-absence reason or claiming a no-disagreement measurement;
- checks unresolved judgement policy before claiming work;
- generated and asserted honesty rows for the currently unattached S04 panel surface.

The reducer, parser, DR-077 arithmetic, and DR-115 paths were not churned.

## Rework 3 · DR-128 carrier and final directed evidence

DR-128 is implemented without supplying a value:

- canonical key: `claimTypeCompositionMap`;
- declared member type: `ClaimTypeCompositionMember` as recorded surgically in `05-register-skeleton.md`;
- database gate: `register.claim_type_composition_map_is_valid(value_json)` is enforced only for that key;
- reader: `readClaimTypeCompositionMap(pool, registerVersion)` returns typed `CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED` when no V-ratified row exists and `..._INVALID` when a present row violates the declared type;
- production startup calls the reader before registering the worker; no migration inserts a value or a claim-type cell;
- migration `0005_s04_rework.sql` also owns the DR-077 FK so databases where 0004 is already ledgered still converge.

Fresh RED evidence:

```text
tests/unit/register-s04.test.ts + tests/architecture/s04-contract.test.ts
Test Files  2 failed (2)
Tests       5 failed (5)
Missing 0005, canonical key, reader, loud error, DR-128 skeleton row and production wiring.
```

```text
tests/unit/judgement-s04.test.ts
Test Files  1 failed (1)
Tests       1 failed | 11 passed (12)
createUnmeasuredDisagreement was absent.
```

Final local GREEN:

```text
pnpm exec vitest run tests/unit tests/architecture
Test Files  22 passed (22)
Tests       92 passed (92)
```

```text
pnpm run typecheck
$ tsc --noEmit
```

```text
pnpm run lint
architecture: { "edgeRowsChecked": 27, "violations": [] }
source:       { "blocking": [] }
```

```text
pnpm run build
✓ Compiled successfully
✓ Generating static pages (7/7)
```

The focused PostgreSQL command was attempted again. Embedded PostgreSQL failed during `initdb`, before migrations or assertions, with `shmget(...): Operation not permitted`; 35 tests were skipped. The required outside-sandbox gate is:

```text
pnpm exec vitest run tests/integration/database.test.ts tests/integration/graph-database.test.ts
```

It must verify 0005 appears once in `public.debateai_schema_migration`, a second `migrate()` is a no-op, invalid DR-128 member shapes are rejected, the test-layer canonical row is read, served number → strength → reduced judgement is walkable, the disagreement receipt persists exactly, and unresolved policy leaves the work item `READY` before any provider call.

## Acknowledged non-blockers not taken this round

- Claude 4: FX-S22-01 still consumes a caller-declared predicate result; no unruled threshold or labelled should-not-fire case was invented.
- Claude 5: the pure dispersion driver is not yet prepended to a production multi-member reducer path; that path is honestly unattached.
- Claude 6: the clarity/uncertainty formula provenance concern remains; reducer arithmetic was reviewer-verified and deliberately not churned.
- Claude 7: an empty `terms` cell is still a non-blocking typed-validation edge; no new cell/value policy was invented under DR-128.
- Claude 9: the pure panel primary contract-hash concern remains on the unattached multi-member surface.
- Claude 10: selection-rule provenance's legacy all-null persistence branch remains outside the directed cheap fixes.
- Claude 12: the runner source attachment assertion remains textual and not every S04 column has a value-level DB assertion; the directed register, join, disagreement and pre-claim policy assertions were added.
- Claude 13: the pre-existing `RAN` → `REASONING` rewrite remains carried forward.
- Claude 15: scalar JSON's parse/schema edge label remains carried forward; the reviewer-verified core parse/schema distinction was not churned.
- Grok 2: the FX-PT-D1 generated failure-array framing remains vacuous even though the no-default-τ assertion itself is real.
- Grok 3–5: Seam-A operator attachment, family-source policy, and the web locale comparator remain honestly deferred to their recorded later owners.
