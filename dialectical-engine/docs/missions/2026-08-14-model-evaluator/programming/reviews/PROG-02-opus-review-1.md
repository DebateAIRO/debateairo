# PROG-02 peer review 1 — Claude Opus on `codex/eval-02-foundation`

Mission: `model-evaluator` (PROGRAMMING loop, tier 0)
Reviewer seat: Claude Opus peer reviewer (read-only; no commits)
Lane: `codex/eval-02-foundation` @ `ed9336e` (on top of `f11a307`), base `dev` @ `d0da17e`
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-02-foundation`

**VERDICT: REWORK** — one blocking defect (the FR-0.6 AC5 differential test is tautological and therefore the lane's stated merge gate is unmet), plus one blocking-adjacent enforcement gap (the four mandatory isolation assertions have no call site on the collection path).

Everything else in the lane is strong. The migration is a faithful, high-fidelity implementation of Architecture §3; the package/app boundary is clean; the binding resolver, blind DTO and enumeration path are correct and honestly tested. This is a narrow rework, not a redesign.

---

## 0. What I verified independently

| Check | Result |
|---|---|
| `npx tsc --noEmit` (repository typecheck) | clean, no output |
| `npx vitest run tests/unit/evaluator-foundation.test.ts` | 6/6 pass |
| `npx vitest run tests/integration/evaluator-database.test.ts` | 3/3 pass (embedded-postgres, real 0023 apply) |
| `tools/orphan-audit architecture` | `{"edgeRowsChecked":27,"violations":[]}` |
| `tools/orphan-audit source` | `{"blocking":[]}` |
| Grep for `BOUND` (excluding `UNBOUND`) in evaluator sources + 0023 | zero hits |
| Grep for key/bearer/token material (DR-179) | zero hits; only `token`-as-usage-column and prose "sends no authorization secret" |
| Non-evaluator files touched | `packages/db/src/schema.ts` (additive declarations only) and `pnpm-lock.yaml` — no product behavior change |
| TDD split | `f11a307` is tests-only, `ed9336e` is implementation-only — honest RED→GREEN commits |
| Worktree state | clean, no stray files |

Codex's self-report claims are accurate as far as I could verify. The one claim I would qualify is "GREEN evidence: focused unit 6/6" — the tests pass, but one of the six is incapable of failing (§2 below).

---

## 1. Axis 1 — deliverable completeness vs the tier-0 lane row

Architecture §7 lane row: *package/app scaffold; 0023 schema, triggers/grants; register readers; pinned local family; health/catalog/enumeration; collision assertions; binding resolver; shared blind DTO.*

| Deliverable | Status | Evidence |
|---|---|---|
| `packages/evaluator` = `@debateai/evaluator` | present | one-package/one-export convention held; deps limited to `@debateai/db`, `@debateai/kernel`, `pg`, `zod` — matches §1.1's allowed dependency set; no `apps/*` import |
| `apps/evaluator-worker` composition root | present | `EVALUATOR_TASK_FAMILIES` lists exactly the six §1.2 families; `runEvaluatorCatalogProbe` is the only behavior |
| `migrations/0023_evaluator_foundation.sql` | present, 0023 is the next free number | all 14 §2.2 tables, both §3.4 triggers, the §3.8 append-only loop, all §3.8 grants and all seven §3.8 indexes |
| Register readers | partial | `readEvaluatorProviderFamily` + `readEvaluatorDispatchBinding`. **No collection-policy reader** (§6.1's other independent control) — see §6, non-blocking |
| Pinned local family | present | `provider:evaluator-vllm` / `maker:evaluator-local-vllm` / `vllm-openai-compatible-http` as zod literals; `deadlineMs` read from the row, not invented (§4.1 honored) |
| Health/catalog/enumeration | present | `probeEvaluatorVllmCatalog` returns the three §4.3 outcomes; `EvaluatorCatalogRepository` writes only `evaluator.vllm_probe` / `evaluator.vllm_catalog_model`; no `ProviderProbeRepository` import anywhere in the package |
| Collision assertions | present as a function, **not wired** | `assertEvaluatorProviderIsolation` covers §4.2 assertions 1–2; assertion 3 is enforced by the zod literal; assertion 4 by `assertLocalEndpoint`. Nothing calls the pair before collection — see §3 |
| Binding resolver defaulting UNBOUND | present and correct | absent row → `ROW_ABSENT`; malformed/blank-source row → `ROW_INVALID`; valid row → `EXPLICIT_UNBOUND`. The return type is `state: "UNBOUND"` only — `BOUND` is unrepresentable |
| Shared blind DTO | present and correct | `createBlindEvaluationSample` **constructs** from an allowlist rather than deleting known identity keys — exactly what §5.3 demands |

Schema mapping (`packages/db/src/schema.ts`) declares all 14 tables with correct column names and cross-schema FK references, and is additive only. Drizzle is treated as a mapping, not a second authority, per §1.1.

`packages/evaluator/README.md` is a genuine boundary contract satisfying FR-0.2 AC1 / FR-3.0 AC1 (write tables listed separately from `scorecard.answer_outcome`, grants named, routing-decision read ban stated).

Nit (non-blocking): `@debateai/evaluator` and `@debateai/evaluator-worker` were not added to root `package.json` devDependencies, unlike every other workspace package. The tests reach them by relative path (an existing repo convention, cf. `tests/unit/critique-s08.test.ts`), so nothing breaks — but the alias is unresolvable from root-level code.

---

## 2. Axis 2 — the panel-isolation differential test (BLOCKING)

**The test at `tests/unit/evaluator-foundation.test.ts:1395-1448` cannot fail, and therefore proves nothing about FR-0.6 AC5.**

Mechanism, bottom-up:

1. `evaluateAskAdmission(settings, ask)` (`apps/api/src/index.ts:314`) does not discover a panel. It calls the injected `settings.resolveDiscoveredPanel()` and returns whatever that closure returns.
2. The test injects `resolveDiscoveredPanel: async () => panel`, where `panel = fixtureDiscoveredPanel(2)` is a frozen constant built at describe-time.
3. Both branches call `evaluateAskAdmission(settings, ask)` with the **same** `settings` object and the **same** `ask`. The `healthyProbe` / `absentProbe` values are computed and asserted on, but they are never passed to `evaluateAskAdmission`, never reach the register, and never reach the panel closure. They are dead inputs with respect to the assertion under test.
4. Consequently `expect(healthy.discoveredPanel).toEqual(absent.discoveredPanel)` is `expect(f(x)).toEqual(f(x))` on a constant. It would still pass if the evaluator family were enrolled in `configuredProviderSet` and authoring on every ask.
5. `expect(healthy.discoveredPanel).toHaveLength(absent.discoveredPanel.length)` is implied by the preceding `toEqual` and adds nothing.
6. The final assertion — no member has `provider_ref === EVALUATOR_PROVIDER_REF` or `maker === EVALUATOR_MAKER` — is checked against a fixture whose members are `provider:test-layer` / `maker:N`. Vacuously false by construction.

What the requirement actually asks (FR-0.6 AC5, Architecture §4.2 "Required differential QA"): *a run **admitted** while the evaluator's vLLM path is configured and healthy has the same panel membership and `agent_count` as an otherwise identical run admitted with that path absent.* No run is admitted in this test, so `agent_count` — which only exists as `jsonb_array_length(discovered_panel)` on the persisted `core.run` row (`migrations/0022`) — is never observed at all, despite the test title claiming it.

The influence channel FR-0.6 AC5 exists to close is *configuration-shaped*, and it runs through code this test bypasses entirely: `readDeploymentMakerCapability(pool, registerVersion)` reads `configuredProviderSet` from `register.register_row` (`packages/critique/src/index.ts:245`), and `apps/api/src/main.ts:43` builds the real panel resolver as `probes.readLatest(deploymentMakers.configuredProviders.map(p => p.providerRef))` filtered by health/freshness. Stubbing that closure removes the only surface where evaluator configuration could ever leak into the panel.

**A genuine test is straightforwardly available in the existing harness.** `tests/integration/critique-database.test.ts:49-60` already demonstrates the pattern: insert a `configuredProviderSet` register row directly, then call `readDeploymentMakerCapability`. A faithful differential would be an integration test that:

- seeds `configuredProviderSet` plus `core.provider_probe` rows for the product providers;
- in branch A additionally seeds the `evaluatorProviderFamily` row (and, ideally, an evaluator `vllm_probe` in `AVAILABLE` state) — branch B omits both;
- builds the panel resolver the way `apps/api/src/main.ts` does, from `readDeploymentMakerCapability` + `ProviderProbeRepository.readLatest`, rather than from a fixture;
- admits the same ask through `PostgresAskApplication.submit` in both branches; and
- asserts byte-identical `core.run.discovered_panel`, equal `core.run.agent_count`, equal structural `envelope_basis`, and absence of the evaluator provider ref / maker from the persisted panel and from the authoring/review maker populations.

Only the last bullet survives from the current test, and only in a form that can actually observe a violation. Until that exists, the lane's stated merge gate ("panel membership and `agent_count` identical … configured-and-healthy versus absent") is not met.

---

## 3. Axis 3 — BOUND state, live-run behavior, DR-179

**No BOUND state.** Confirmed three ways: the `shadow_decision.binding_state text NOT NULL CHECK (binding_state='UNBOUND')` column constraint; the `EvaluatorDispatchBinding.state` type admitting only the `"UNBOUND"` literal; and a grep of the evaluator sources and 0023 for `BOUND` outside `UNBOUND`, which returns nothing. There is no dispatch call site, no import of the evaluator package from `apps/api`, `apps/runner`, or `packages/critique`, and no dev-menu bind control (no UI in this lane at all). FR-0.1 AC2 (no automatic threshold can flip the switch) holds structurally: the resolver has no code path that returns anything but `UNBOUND`.

**No live-run behavior change.** The only pre-existing files touched are `packages/db/src/schema.ts` (pure additive table declarations plus one `pgSchema` export and the `void [...]` line) and `pnpm-lock.yaml`. Everything else is new files. Migration 0023 adds a new schema and four `NOLOGIN` roles; it does not alter, grant on, or revoke from any existing product table beyond the standard `REVOKE UPDATE, DELETE … FROM PUBLIC, debateai_runtime` on the *new* evaluator tables. Nothing in `core`, `serve`, `memory`, or `scorecard` is modified. I ran the two new test files only; Codex reports the full 593/593 suite green, and since no product source changed, I have no reason to doubt it.

**DR-179 respected.** No key, token, or authorization header appears in any lane file. The register value schema is `.strict()`, so a family row carrying `authorizationHeader` (or any unknown field) fails parse with `EVALUATOR_PROVIDER_FAMILY_INVALID` — a real structural ban, not a comment. `probeEvaluatorVllmCatalog` issues a bare `GET` with no headers object, and the unit test asserts the server saw `request.headers.authorization === undefined`. Endpoints are constrained to `http:` on `{vllm, localhost, 127.0.0.1, [::1]}`, so no cloud fallback is reachable.

**Blocking-adjacent enforcement gap.** Architecture §4.1 says startup *refuses* on collision; §4.2 says the reader performs the four assertions *before enabling collection*. In the delivered code, `readEvaluatorProviderFamily` performs assertions 3 and 4, but assertions 1 and 2 live in a separate exported function that takes a deployment set — and **nothing calls it**. `runEvaluatorCatalogProbe` (the only collection entry point in this lane) reads no deployment set and asserts no isolation before probing and persisting. The guard is therefore opt-in, and a future lane wiring the worker can silently omit it. Cheapest structural fix: make the deployment maker capability a required argument of `readEvaluatorProviderFamily` (so a family row cannot be obtained without the collision check), or make `runEvaluatorCatalogProbe` take the deployment set and assert first. I am not failing the lane on this alone, but it should land with the §2 rework.

---

## 4. Axis 4 — migration correctness vs the hand-written SQL house style

I compared 0023 against `0015_s12.sql`, `0019_xrev01_node_review.sql`, `0021_dr174_cooldown_prune.sql`, `0022_dr181_discovery.sql`, and the role/trigger block at the end of `0000_s00.sql`.

**Correct and idiomatic:**

- Hand-written, not drizzle-kit generated. Text + CHECK instead of enums, matching house style.
- Role creation uses the exact `IF NOT EXISTS (SELECT 1 FROM pg_roles …)` guard pattern from `0000_s00.sql:291` and `0015_s12.sql`.
- Append-only triggers call the shared `core.reject_mutation()` (`0000_s00.sql:31`), exactly as `0019` and `0022` do — the evaluator does not invent a second rejection function. The integration test asserts the real error text `append-only or immutable table observation rejects UPDATE`, which is `core.reject_mutation`'s format string, so the shared function is genuinely firing.
- Trigger loop + `REVOKE UPDATE, DELETE` loop mirror `0000_s00.sql:325-327` structurally.
- Grants transcribe Architecture §3.8 line for line: worker gets schema-wide SELECT with table-by-table INSERT; API gets read set + `consumer_selection` INSERT only; `EXECUTE` on both trigger functions is revoked from PUBLIC before being granted narrowly.
- `GRANT SELECT ON ALL TABLES IN SCHEMA evaluator` is correctly placed *after* all `CREATE TABLE`s.
- All seven §3.8 operational indexes present; the `evaluator_pipeline_one_success` partial unique index is present with the right predicate.
- Table DDL is a faithful transcription of §3.2–§3.7 including the `UNIQUE NULLS NOT DISTINCT` constraints, the `n = consensus_count + settlement_count + addon_count` invariant, the metered/unmetered exclusivity CHECK, and the composite FK from `consumer_selection` to `(vllm_probe_id, model_id)`.
- `migrate()` (`packages/db/src/index.ts:123`) applies each file once under an advisory lock with a `debateai_schema_migration` ledger, so 0023 will not double-apply.

**Style deviations (non-blocking, but they diverge from both the house style and the architecture text):**

1. `CREATE SCHEMA evaluator AUTHORIZATION debateai_evaluator_ddl;` — Architecture §3.1 and every schema creation in `0000_s00.sql` use `IF NOT EXISTS`. Codex dropped it.
2. `CREATE TABLE evaluator.<t> (…)` without `IF NOT EXISTS`, where `0015`/`0019`/`0022` all use `CREATE TABLE IF NOT EXISTS`.
3. The trigger loop omits `DROP TRIGGER IF EXISTS reject_mutation ON %s` before `CREATE TRIGGER`, which Architecture §3.8 specifies verbatim and which `0000_s00.sql:325`, `0019:44`, and `0022:16` all do.
4. Indexes *do* use `IF NOT EXISTS` while tables do not — internally inconsistent.

None of these break a clean apply (the migration ledger guarantees single application), but they make the file non-rerunnable in a way the rest of `migrations/` deliberately is not, and (3) is a direct departure from the architecture's own SQL.

**Ownership note (non-blocking):** §3.1 says "the migration runs under a DDL role that owns the new schema." 0023 sets `AUTHORIZATION debateai_evaluator_ddl` on the schema but never `SET ROLE`, so the tables are owned by the migrating role, not by `debateai_evaluator_ddl`, and the four `GRANT REFERENCES` statements to that role are inert (the FKs are created by the migrating role instead). This is harmless where migrations run as a superuser (both test mechanisms do), but on a least-privilege deployment role the `CREATE TABLE evaluator.*` statements would need `CREATE` on a schema owned by another role. Worth a line in the deployment note rather than a code change.

---

## 5. Axis 5 — test honesty

Genuinely load-bearing assertions:

- **Trigger coverage**: `SELECT count(*) FROM information_schema.triggers WHERE trigger_schema='evaluator' AND event_manipulation IN ('UPDATE','DELETE') AND trigger_name='reject_mutation'` must equal 28 = 14 tables × 2 events. This fails if any table is added without a guard. Good check.
- **Table roster**: exact `toEqual` on the sorted 14-table list — fails on any omission or stray table.
- **Append-only enforcement**: a real INSERT then a real UPDATE, asserting the real `core.reject_mutation` error text. Real.
- **API grant narrowness**: asserts `consumer_selection` INSERT present, and that the API role holds *no* UPDATE/DELETE on any evaluator table and *no* INSERT on any other evaluator table. This is the strongest test in the lane and would catch a widened grant.
- **Collision refusal**: both positive and negative cases, asserting typed codes `EVALUATOR_PROVIDER_PANEL_COLLISION` / `EVALUATOR_MAKER_PANEL_COLLISION`.
- **UNBOUND default**: absent row and malformed row both asserted, with distinct reason codes.
- **Blind DTO**: passes four identity fields in and asserts exact structural equality against the five-field allowlist plus a `JSON.stringify` regex sweep. Real.
- **No authorization header**: asserted from the server side against a real `node:http` listener. Real.

Weak, vacuous, or over-titled:

1. **The differential test** — fully vacuous; see §2. This is the blocking one.
2. `expect(settlementRows.rows[0]!.count).toBe("0")` under the title *"keeps consensus observations outside settlement"*. Nothing in the test ever attempts a `scorecard.answer_outcome` write, so the count is trivially zero regardless of evaluator behavior. The title claims a property the assertion cannot test. Either retitle, or make it real by asserting the evaluator roles hold no INSERT on `scorecard.answer_outcome` (which `information_schema.role_table_grants` can prove, and which *would* fail on a widened grant).
3. `expect(family.value).not.toHaveProperty("authorizationHeader")` — the fixture never had that key, and `.strict()` would have rejected it upstream. The valuable test is the inverse: a family row *with* `authorizationHeader` must fail with `EVALUATOR_PROVIDER_FAMILY_INVALID`. Missing.
4. The "fails closed on absence" leg reuses the port of a server that the `finally` block already closed, so it exercises connection-refused (`EVALUATOR_VLLM_UNAVAILABLE`), not the `AbortSignal.timeout` path, despite setting `deadlineMs: 25`. `failureCode` is never asserted, so the distinction is invisible. FR-0.6 AC1's "never a silent hang" and §4.3's `EVALUATOR_VLLM_TIMEOUT` branch are therefore untested. Add a hanging server plus an assertion on `failureCode === "EVALUATOR_VLLM_TIMEOUT"`.
5. `assertLocalEndpoint` — §4.2 assertion 4 — has no rejection test. An `https://` or remote-host `chatBaseUrl` should be asserted to throw `EVALUATOR_PROVIDER_ENDPOINT_FORBIDDEN`. This is the DR-179 "no cloud fallback" guard and it is currently unverified.
6. `EvaluatorCatalogRepository.record` has no test at all. The README's claim that catalog evidence lands only in `evaluator.vllm_probe` / `evaluator.vllm_catalog_model` and never `core.provider_probe` is unproven — an integration test recording a probe and asserting rows in the two evaluator tables and zero new `core.provider_probe` rows would close it cheaply.
7. `queryPool()` returns the same rows for *any* query, so `readEvaluatorProviderFamily` and `readEvaluatorDispatchBinding` are never verified to query the right `row_key`. Low severity — the row keys are exported constants — but it means a swapped row key would pass.

Items 3–7 are individually non-blocking; taken together they mean the FR-0.6 guardrails are asserted mostly on their happy paths. I'd like at least 4 and 5 to land with the rework, since they are the two that protect DR-179 and the "never a silent hang" AC.

---

## 6. Non-blocking observations

- **Collection-policy reader missing.** Architecture §6.1 names two independent controls; only dispatch binding has a reader. The lane row says "register readers" without enumerating them, so this may legitimately belong to ticket 04, but someone should own it explicitly rather than letting it fall between lanes.
- `probeEvaluatorVllmCatalog` sorts catalog models by code unit before returning — an unrequested but welcome determinism property. Worth an explicit test so a future refactor cannot silently drop it.
- `metadataJson: Object.freeze({ ...entry })` retains the whole upstream `/v1/models` entry. That is correct for a catalog (it is not a blinded surface), but ticket 11 must not pipe it into a consumer prompt unfiltered.
- The `EVALUATOR_VLLM_HTTP_<status>` failure code is derived by string-prefix matching on an `Error.message`, which is brittle. A typed error class would be cleaner, though the current form is contained.

---

## 7. Required for PASS on re-review

1. Replace the FR-0.6 AC5 differential test with one that varies evaluator configuration through the real panel-resolution path and observes persisted `discovered_panel` and `agent_count` (§2). It must be capable of failing if the evaluator family were enrolled in `configuredProviderSet` — demonstrate that, ideally by showing the test red against a deliberately enrolled fixture.
2. Give the four §4.2 isolation assertions a mandatory call site on the collection path, so a probe cannot run without them (§3).
3. Requested with the rework, not gating on their own: a timeout-path test asserting `EVALUATOR_VLLM_TIMEOUT`, and a rejection test for `assertLocalEndpoint` (§5 items 4–5).
4. Optional cleanup: restore `IF NOT EXISTS` / `DROP TRIGGER IF EXISTS` to match house style and Architecture §3.1/§3.8 (§4), and retitle or strengthen the `answer_outcome` count assertion (§5 item 2).

---

**REVIEW VERDICT: REWORK**
