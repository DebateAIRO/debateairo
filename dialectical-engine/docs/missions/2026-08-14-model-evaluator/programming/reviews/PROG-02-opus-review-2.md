# PROG-02 peer review 2 — Claude Opus on `codex/eval-02-foundation`

Mission: `model-evaluator` (PROGRAMMING loop, tier 0)
Reviewer seat: Claude Opus peer reviewer (read-only; no commits)
Lane head: `11ad2f3` "test(evaluator): prove persisted panel isolation" (on `ed9336e`, `f11a307`), base `dev` @ `d0da17e`
Round 1: `PROG-02-opus-review-1.md` — verdict REWORK, three findings.

**VERDICT: PASS.** All three round-1 findings are genuinely resolved. The differential test now composes discovery the way production does, admits real runs, and reads persisted `discovered_panel` / `agent_count`; it is red-demonstrable by construction, and I traced the exact mechanism that makes it fail on a mis-enrolled evaluator. The isolation assertions now guard the only collection entry point, with an observed-boundary test proving neither the network nor the database is touched on refusal. The four style/honesty items I asked for landed too.

---

## 0. Re-verification I ran myself

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean, no output |
| `npx vitest run tests/unit/evaluator-foundation.test.ts` | 8/8 pass (was 6) |
| `npx vitest run tests/integration/evaluator-database.test.ts` | 4/4 pass (was 3), including the new persisted differential |
| `npx vitest run tests/unit tests/integration tests/architecture` | **76 files / 565 tests, all pass** — no regression from the migration-style change or the `runEvaluatorCatalogProbe` signature change |
| `tools/orphan-audit architecture` | `{"edgeRowsChecked":27,"violations":[]}` |
| `tools/orphan-audit source` | `{"blocking":[]}` |
| `git status` in the worktree | clean |
| Files changed vs `dev` | still only 10; the sole pre-existing product files touched remain `packages/db/src/schema.ts` (additive) and `pnpm-lock.yaml` |
| `packages/evaluator/src/index.ts` | **unchanged** in round 2 — the rework touched only the worker root, the migration, and the two test files. No implementation drift smuggled in under a `test(...)` commit besides the deliberate worker-signature change described in its message. |

---

## 1. Finding 1 (BLOCKING in round 1) — the differential test is tautological → **RESOLVED**

The old unit-level test is deleted outright, not patched. Its replacement is `tests/integration/evaluator-database.test.ts:102-243`, and it is a real differential.

What it now does, and why each piece matters:

1. **Two register versions, differing only in evaluator configuration.** Version 201 holds `configuredProviderSet` with `provider:product-a` / `provider:product-b` only. Version 202 holds the *same* `configuredProviderSet` plus an `evaluatorProviderFamily` row and an `AVAILABLE` `evaluator.vllm_probe`. That is exactly the FR-0.6 AC5 contrast: "configured and healthy" versus "absent."
2. **Discovery is composed, not stubbed.** `admitAndReadPersistedRun` calls the real `readDeploymentMakerCapability(pool, registerVersion)` (`packages/critique/src/index.ts:245`) and builds the resolver as `probes.readLatest(deploymentMakers.configuredProviders.map(p => p.providerRef))` filtered on `state === "HEALTHY"`, non-null `modelId`, and probe freshness — a faithful transcription of `apps/api/src/main.ts:43-57`. The evaluator configuration now has a live path through which it *could* reach the panel, which is precisely what round 1 was missing.
3. **Real runs are admitted.** `new PostgresAskApplication(pool, { dispatch: async () => undefined }, settings).submit(ask, session)` — the production write path, not `evaluateAskAdmission` in isolation.
4. **`agent_count` is read from the persisted row.** `SELECT … discovered_panel, agent_count FROM core.run WHERE run_id = $1`. This is the real thing: `RunRepository.startRun` (`packages/db/src/index.ts:352`) inserts `agent_count` as `jsonb_array_length($12::jsonb)` computed by Postgres, and `0022_dr181_discovery.sql:25-30` constrains `agent_count = jsonb_array_length(discovered_panel)`. The value cannot be faked by the test.
5. **Byte identity is asserted on the persisted panel**, via `encode(convert_to(discovered_panel::text,'UTF8'),'hex')`, plus `agentCount` equality, plus absence of `EVALUATOR_PROVIDER_REF` / `EVALUATOR_MAKER` from the persisted membership.

**Is it red-demonstrable?** Yes, and the design detail that guarantees it is the adversarial fixture: the test seeds a `core.provider_probe` row for `provider:evaluator-vllm` / `maker:evaluator-local-vllm` with `state: "HEALTHY"`, `modelId: "model:evaluator-local"`, and `probedAt = now` — present in **both** arms. `ProviderProbeRepository.readLatest` (`packages/db/src/index.ts:245-262`) selects `DISTINCT ON (provider_ref)` over `provider_ref = ANY($1)` with no state filter, so the moment the evaluator ref appears in `configuredProviderSet`, that row is returned, survives all three resolver filters, and enters the panel. The healthy arm would then persist three members instead of two: `panelBytes` diverges, `agentCount` goes 3 vs 2, and the membership predicate flips true — all three assertions fail simultaneously. Codex reports having run exactly that mutation and observing three-vs-two; I did not re-run the mutated variant (I am read-only outside my two files), but the failure is a deterministic consequence of code I read end-to-end, and Codex's reported numbers match what the mechanism predicts.

**It also cannot pass vacuously through an empty panel.** `core.run.agent_count` carries `CHECK (agent_count > 0)` from `0000_s00.sql:54`, so a zero-member panel would abort the INSERT rather than yield a trivially-equal pair. Passing implies both arms persisted a non-empty, identical product panel.

One note for future readers so the fixture is not misread: the test writing a `core.provider_probe` row for the evaluator provider ref is a *hostile fixture*, not a law violation. Architecture §4.2 forbids **evaluator code** from writing that table, and it does not — `grep` for `ProviderProbeRepository` / `provider_probe` across `packages/evaluator` and `apps/evaluator-worker` returns only the README sentence stating the prohibition. The test imports the repository directly to manufacture the worst case. That makes the proof stronger than the architecture strictly required.

Residual (non-blocking): the persisted `envelope_basis` is not asserted, though Architecture §4.2 lists structural `envelopeBasis` alongside panel and `agent_count`. Here it is a pure function of `panelSize`, which byte-identical panels already pin, so nothing can diverge — but adding `envelope_basis` to the `SELECT` and the equality assertion would cost one line and close the AC verbatim. Likewise §4.2's "identical root author and review maker populations" bullet needs authored nodes and so belongs to a later lane's full-run QA, not tier 0.

## 2. Finding 2 (BLOCKING in round 1) — `agent_count` never observed → **RESOLVED**

Covered above: `agent_count` is now read from `core.run` after a real `submit`, is DB-computed at insert, and is CHECK-tied to `jsonb_array_length(discovered_panel)`. This is the strongest available form of the FR-0.6 AC5 claim short of a full multi-model run.

## 3. Finding 3 (blocking-adjacent in round 1) — isolation assertions had no call site → **RESOLVED**

`runEvaluatorCatalogProbe` (`apps/evaluator-worker/src/index.ts:18-33`) now takes the deployment set as a **required** parameter and calls `assertEvaluatorProviderIsolation(family, deployment)` as its first statement, before `probeEvaluatorVllmCatalog` and before `EvaluatorCatalogRepository.record`. The signature change is load-bearing: a caller cannot reach collection without supplying the configured-provider set, so omission is now a type error rather than a silent gap.

The accompanying test (`tests/unit/evaluator-foundation.test.ts:139-155`) is an honest observed-boundary proof rather than a code-path assertion: it passes a `vi.fn()` fetch and a pool whose `query` throws `"persistence must not start"`, asserts the rejection carries `EVALUATOR_PROVIDER_PANEL_COLLISION`, and asserts `fetchImplementation` was never called. Both the network and the database are observed to be untouched. That is the right shape for "before collection or persistence."

Residual (non-blocking, unchanged from round 1): `readEvaluatorProviderFamily` still returns a family row without demanding the deployment set, so §4.2 assertions 1–2 are enforced at the collection entry point rather than at the reader. With one entry point that is equivalent; when ticket 04 adds the tagger call path, that path must make the same call. Worth carrying forward as a note in the ticket-04 packet.

## 4. Requested non-blocking items from round 1

| Round-1 item | Status |
|---|---|
| Timeout path / `EVALUATOR_VLLM_TIMEOUT` untested | Landed (`tests/unit/…:122-136`) — injects a `DOMException("…","TimeoutError")` and asserts `failureCode: "EVALUATOR_VLLM_TIMEOUT"`. Synthetic in that it fakes the abort rather than hanging a real socket, so the `AbortSignal.timeout` wiring itself is still only verified by reading it; the classification branch FR-0.6 AC1 depends on is now covered. Accepted. |
| `assertLocalEndpoint` rejection untested | Landed (`tests/unit/…:69-75`) — an `https://models.example.test/v1` family row is asserted to reject with `EVALUATOR_PROVIDER_ENDPOINT_FORBIDDEN`. This is the DR-179 "no cloud fallback" guard, now falsifiable. |
| Vacuous `answer_outcome` count assertion | Replaced (`tests/integration/…:74-83`) with a privilege proof: no `debateai_evaluator_%` role holds INSERT on `scorecard.answer_outcome`. Unlike the count, this fails if a grant is ever widened. Correctly scoped to evaluator roles. |
| Migration style vs house style / Architecture §3.1, §3.8 | Restored: `CREATE SCHEMA IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS` on all 14 tables, `DROP TRIGGER IF EXISTS` before all three `CREATE TRIGGER`s (the `reject_mutation` loop plus both observation triggers — the latter two go beyond what I asked). 0023 is now rerunnable and matches `0000`/`0015`/`0019`/`0022`. |
| `EvaluatorCatalogRepository.record` untested | Still untested directly. Downgraded rather than escalated: the differential test now persists and reads an `evaluator.vllm_probe` row, and the isolation test proves persistence is not reached on refusal, so the repository is no longer wholly dark. A ticket-04 test that records a probe and asserts zero new `core.provider_probe` rows would close it. |
| `queryPool()` ignores the query text | Unchanged; low severity, row keys are exported constants. |
| Collection-policy register reader (§6.1) | Still absent; Codex lists it as a deferred non-blocker. Needs an explicit owner in ticket 04 so it does not fall between lanes. |
| `@debateai/evaluator` missing from root devDependencies | Still absent; deferred by Codex. Cosmetic — tests reach both new packages by relative path, an existing repo convention. |

## 5. Invariants re-checked after the rework

- **No BOUND state.** `shadow_decision.binding_state CHECK (binding_state='UNBOUND')` intact; `EvaluatorDispatchBinding.state` remains the `"UNBOUND"` literal only; grep for `BOUND` outside `UNBOUND` across evaluator sources and 0023 still returns nothing. No dispatch call site.
- **No live-run behavior change.** The round-2 commit touched one app file (new evaluator worker), the new migration, and two test files. `packages/db/src/schema.ts` remains additive-only. The full 565-test suite is green, which is the strongest available evidence that the migration-style change and the worker signature change broke nothing.
- **DR-179.** No key or authorization material anywhere; the `.strict()` register schema still structurally rejects an `authorizationHeader`, and the remote-endpoint test now also proves a cloud base URL is refused.
- **Migration fidelity.** 14 tables, both §3.4 trigger functions on the shared `core.reject_mutation`, all §3.8 grants and the seven §3.8 indexes — unchanged from round 1 apart from the idempotency guards. The 28-trigger count assertion still passes after the `DROP TRIGGER IF EXISTS` additions.
- **Test honesty.** The four integration tests and eight unit tests all assert falsifiable properties. I found no remaining assertion that cannot fail. The one test I flagged in round 1 as titled beyond its assertion has been rewritten to match its title.

## 6. Carry-forward notes for downstream lanes (not gating this merge)

1. Ticket 04 must call `assertEvaluatorProviderIsolation` on the tagger path too; the guard is per-entry-point, not global.
2. Ticket 04 or 09 should own the §6.1 collection-policy register reader.
3. `evaluator.vllm_catalog_model.metadata_json` stores the whole upstream `/v1/models` entry; ticket 11 must not pipe it into a consumer prompt unfiltered.
4. Deployment note: 0023 sets `AUTHORIZATION debateai_evaluator_ddl` on the schema but never `SET ROLE`, so tables are owned by the migrating role and the four `GRANT REFERENCES` statements are inert. Harmless under a superuser migrator (both test mechanisms are); worth confirming before a least-privilege deployment role runs it.
5. The `EVALUATOR_VLLM_HTTP_<status>` failure code is still derived by string-prefix matching on `Error.message`; a typed error would be sturdier.

---

**REVIEW VERDICT: PASS**
