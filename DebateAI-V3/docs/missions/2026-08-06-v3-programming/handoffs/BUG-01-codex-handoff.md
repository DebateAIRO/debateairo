# BUG-01 Codex handoff

## Identity and scope

- Ticket: `t_fcd509b0` — BUG-01
- Worker/session: Codex GPT-5.6 Sol / `019ffc32-38c1-76f1-a3d4-3cd833fd0b66`
- Branch/worktree: `dev` / `/Users/vladmihaimiron/Documents/DebateAIRO`
- Commit: none; the ticket is awaiting its dual review diamond and git operations remain V-gated.
- Comments read through before final handoff: `2026-08-13 20:37` (`WORKER CLAIM`); no later review/rework comment existed.

## Inventory

- `packages/providers/src/index.ts` — declared-content rejection retry inside the existing bounded attempt loop; `FAILED` attempt ledgering; per-attempt packet hash; optional repair builder; typed transport/content exhaustion carriers.
- `packages/judgement/src/index.ts` — closed `claim_type`; machine-error-only repair packets; translation of exhausted content rejection to the unchanged judge/review domain codes.
- `apps/runner/src/index.ts` — declared composer, conformance, and post-compose-R9 predicates/builders; unchanged organ failure codes after exhaustion.
- `tests/unit/provider.test.ts` — T1–T6 gateway behavior and mutation guards.
- `tests/unit/judgement.test.ts` — T7–T10 incident, strictness, error-code, and repair-packet guards.
- `tests/integration/database.test.ts` — T11–T13 real PostgreSQL accounting/exhaustion/terminal-count guards plus a production composer retry.
- `tests/architecture/scaffold.test.ts` — T14 closed outcome vocabulary; the existing 27-edge audit supplies T15.
- `docs/missions/2026-08-06-v3-programming/handoffs/BUG-01-progress.log` — append-only progress receipts.

No kernel vocabulary, migration, register number, dependency edge, contract artifact, or standing-stack process was changed. The pre-existing untracked goal packet was left untouched.

## TDD evidence

RED command:

```text
$ pnpm vitest run tests/unit/provider.test.ts
Test Files  1 failed (1)
Tests       4 failed | 3 passed (7)
Failures proved: rejected content returned immediately; typed content exhaustion absent; repair attempt/hash absent.
```

GREEN focused command after implementation/refactor:

```text
$ pnpm vitest run tests/unit/provider.test.ts tests/unit/judgement.test.ts tests/architecture/scaffold.test.ts
Test Files  3 passed (3)
Tests       24 passed (24)
```

Real PostgreSQL production-seam proof:

```text
$ pnpm vitest run tests/integration/database.test.ts
[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly
✓ BUG-01 T11/T13 charges every rejected attempt while terminal execution counts only the accepted attempt
✓ BUG-01 T12 exposes the last rejected artifact to the redelivery exhaustion check
✓ TERM-01 ... declares the reasoning-only segment contract and settles the answer as hypothesis + research plan
Test Files  1 passed (1)
Tests       39 passed (39)
```

## T1–T15 mutation ledger

| Test | Load-bearing assertion | Mutation killed |
|---|---|---|
| T1 | rejected attempt then accepted attempt resolves accepted content and persists both artifacts | delete content-rejection `continue` / return attempt 1 |
| T2 | rejected ledger row is `FAILED` and links its raw artifact | retain dishonest `OK` or drop `raw_artifact_ref` |
| T3 | exhaustion is structured `PROVIDER_CONTENT_UNACCEPTED`, uses the full bound, carries the last error | bare error, early throw, or first-error carrier |
| T4 | absent predicate with non-JSON content and `maxAttempts: 3` makes exactly one artifact/ledger attempt and returns identical content | let fallback `UNPARSED` trigger retries |
| T5 | repair changes per-attempt `input_hash` while `contract_hash` stays identical | hoist input hash or vary contract identity per attempt |
| T6 | no builder re-sends the identical HTTP body and input hash | gateway authors repair prose |
| T7 | incident-shaped nested `notes_absent` remains `SCHEMA_FAILED` | widen/strip/passthrough the strict evidence schema |
| T8 | judge exhaustion remains `JUDGE_SCHEMA_FAILURE` with the last error; repair packet excludes raw model content | salvage/default, rename terminal code, carry first error, or interpolate rejected output |
| T9 | review exhaustion remains `NODE_REVIEW_SCHEMA_FAILURE` with the last error | fix judge only and leave XREV review untyped |
| T10 | bogus `claim_type` is classified `SCHEMA_FAILED` | restore `z.unknown()` and defer failure until after gateway return |
| T11 | 2 rejected + 1 accepted rows count as 3 in run and call-site attempt counters | add an `outcome='OK'` filter and make retries free |
| T12 | redelivery exhaustion returns the final rejected artifact | hide failed attempts from grouped exhaustion |
| T13 | terminal `judgeCallCount` is 1 for 2 `FAILED` + 1 `OK` | count failed artifacts as executed checks |
| T14 | `LEDGER_OUTCOMES` remains exactly the ruled six members | mint a retry-specific outcome / ripple into DDL |
| T15 | architecture audit still checks 27 rows with zero violations | add a new dependency edge or cross the module contract |

## Enforced collection proof (P2)

```text
$ pnpm vitest list
exit 0
tests/integration/database.test.ts > BUG-01 content-rejection retry accounting > T11/T13 ...
tests/integration/database.test.ts > BUG-01 content-rejection retry accounting > T12 ...
tests/architecture/scaffold.test.ts > ... > BUG-01 T14 ...
tests/unit/provider.test.ts > ... > BUG-01 T1/T2 ...
tests/unit/provider.test.ts > ... > BUG-01 T3 ...
tests/unit/provider.test.ts > ... > BUG-01 T5/T6 ...
tests/unit/judgement.test.ts > ... > BUG-01 T7/T10 ...
tests/unit/judgement.test.ts > ... > BUG-01 T8 ...
tests/unit/judgement.test.ts > ... > BUG-01 T9 ...
```

T4 is the collected existing provider test `persists the raw real HTTP response unconditionally before ledgering the attempt`, strengthened to use `maxAttempts: 3`. T15 is the collected architecture test `matches all 27 dependency-edge rows and structural rules 1–5`.

## Final gates — real output

Typecheck:

```text
$ pnpm typecheck
$ tsc --noEmit
exit 0
```

Architecture suite:

```text
$ pnpm vitest run tests/architecture
Test Files  14 passed (14)
Tests       51 passed (51)
```

Full enforced suite:

```text
$ pnpm test
Test Files  76 passed (76)
Tests       543 passed | 1 skipped (544)
Duration    23.11s
```

Lint/audits:

```text
$ pnpm lint
{ "edgeRowsChecked": 27, "violations": [] }
{ "blocking": [] }
```

Contract generation / zero drift:

```text
$ pnpm generate:contract
$ tsx packages/contract/src/generate.ts
exit 0
Before and after git diff path sets were identical; no generated contract file changed.
```

Diff hygiene:

```text
$ git diff --check
exit 0
```

## Acceptance and architecture evidence

- Absent predicate remains a successful-transport one-shot path; its HTTP body/content and hash are unchanged.
- Declared `PARSE_FAILED`/`SCHEMA_FAILED` consumes only the existing `CallBound.maxAttempts`; there is no new literal or nested retry loop.
- Each rejected attempt persists a raw artifact and a `FAILED` model-call row. Counters remain outcome-blind, while terminal executed-check facts remain `OK`-only.
- Repair builders retain the original organ prompt/schema and interpolate only the machine parse error. No suggested score, value, completion, or rejected raw content is inserted.
- Contract hash stays fixed across attempts; input hash follows the actual packet for each attempt.
- Exhausted judge and review calls preserve `JUDGE_SCHEMA_FAILURE` and `NODE_REVIEW_SCHEMA_FAILURE`; runner composer/conformance/R9 preserve their existing contract-error codes.
- Strict schemas, kernel/DDL vocabulary, and the 27 dependency edges remain unchanged.

## Live verification (P3)

The standing PG 55432 / API 8790 / UI 3000 stack was not queried, restarted, or mutated, as the ticket forbids stack process control. No malformed response was injected into a live acceptance run (DR-115). The real execution proof is the enforced test-layer local HTTP provider plus real embedded PostgreSQL: it records `FAILED/SCHEMA_FAILED` then `OK/PARSED` through the production gateway and runner composer call site. A future naturally occurring live rejection can prove the live retry fired; a green live run without such a rejection would prove only no regression.

## Acknowledged deferrals / residual risks

- The pre-existing exact `call_site_key = 'JUDGE'` terminal-count blind spot for multi-maker judge keys is unchanged and remains a separate ticket.
- DR-159 A-2 environment-sourced Hatchet bounds are unchanged.
- No schema widening for evidence absence, degradation-after-exhaustion policy, repair sub-bound, or third-maker costing was introduced.
- The repair callback is caller-owned by design; all five production calls now use fixed templates that interpolate only `parseError`.

## Environment tail

- No environment variable, dependency, migration, register seed, or standing service change.
- Testcontainers remained deferred by DR-121; integration used embedded PostgreSQL 18.4.

## Questions for V

None for this ticket. VROW-2/VROW-4 remain independent architecture/product questions and were not pulled into BUG-01.
