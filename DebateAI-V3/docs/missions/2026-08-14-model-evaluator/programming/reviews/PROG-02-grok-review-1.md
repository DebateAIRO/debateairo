# PROG-02 Grok peer review — `codex/eval-02-foundation` (rev 1)

**Reviewer:** Grok (read-only peer)  
**Lane / branch:** `codex/eval-02-foundation` vs `dev`  
**Worktree inspected:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-02-foundation/DebateAI-V3`  
**Diff basis:** `git diff dev...codex/eval-02-foundation` (10 files, +1366 / −1)  
**Commits in range:** `f11a307` test contracts; `ed9336e` feat foundation  
**Binding docs (MAIN checkout only):**
- `docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md` §§1–4, 6, 7 tier-0 row, 8  
- `docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md` FR-0.1, FR-0.6 AC5, FR-3.x foundation constraints  

**Scope of review:** foundation deliverables and merge gates for tier 0 only. No implementation, no commits, no later-lane scope.

---

## Diff surface (lane hygiene)

| Path | Role |
|---|---|
| `packages/evaluator/**` | Module package + boundary README |
| `apps/evaluator-worker/**` | Separate composition-root scaffold |
| `migrations/0023_evaluator_foundation.sql` | Hand-written foundation schema |
| `packages/db/src/schema.ts` | Drizzle mapping for `evaluator.*` |
| `tests/unit/evaluator-foundation.test.ts` | Foundation unit / isolation tests |
| `tests/integration/evaluator-database.test.ts` | Migration / append-only / grants |
| `pnpm-lock.yaml` | Workspace wiring |

**Out-of-lane product edits:** none observed under `apps/api`, `apps/runner`, settlement, panel discovery, or provider production selection. That supports FR-0.1 “zero live-run behavior change” for this lane’s tree.

---

## Axis (a) — Deliverable completeness vs Architecture §7 tier-0 row

**Architecture §7 tier-0 deliverable list:** package/app scaffold; 0023 schema, triggers/grants; register readers; pinned local family; health/catalog/enumeration; collision assertions; binding resolver; shared blind DTO.  
**Merge gates:** module boundary, DB migration tests, panel-isolation differential test.

| Deliverable | Finding | Citation |
|---|---|---|
| `packages/evaluator` scaffold | **PASS** | `packages/evaluator/package.json` (`@debateai/evaluator`); `packages/evaluator/src/index.ts`; boundary README |
| `apps/evaluator-worker` composition root | **PASS** (scaffold) | `apps/evaluator-worker/src/index.ts` exports `EVALUATOR_TASK_FAMILIES` matching Architecture §1.2 task family names; thin catalog probe composition only (appropriate for tier 0) |
| `0023` schema + triggers/grants | **PASS** | `migrations/0023_evaluator_foundation.sql` — 14 evaluator tables, roles, triggers, grants, indexes |
| Register readers | **PASS** | `readEvaluatorProviderFamily`, `readEvaluatorDispatchBinding` in `packages/evaluator/src/index.ts` |
| Pinned local family | **PASS** | `EVALUATOR_PROVIDER_REF = provider:evaluator-vllm`, `EVALUATOR_MAKER = maker:evaluator-local-vllm`, adapter `vllm-openai-compatible-http`, `source: LOCAL_CONTAINER_NO_AUTH`, local-host allowlist |
| Health/catalog/enumeration | **PASS** | `probeEvaluatorVllmCatalog` → `AVAILABLE` / `UNAVAILABLE`; `EvaluatorCatalogRepository.record` writes `evaluator.vllm_probe` + `evaluator.vllm_catalog_model` only |
| Collision assertions | **PASS** | `assertEvaluatorProviderIsolation` → `EVALUATOR_PROVIDER_PANEL_COLLISION` / `EVALUATOR_MAKER_PANEL_COLLISION` |
| Binding resolver default UNBOUND | **PASS** | `readEvaluatorDispatchBinding` always returns `state: "UNBOUND"`; type admits only `"UNBOUND"` |
| Shared blind DTO | **PASS** | `createBlindEvaluationSample` allowlists `sampleId`, `questionExcerpt`, `taskExcerpt`, `grade`, `reasons` |
| Drizzle mapping | **PASS** | `packages/db/src/schema.ts` evaluator schema + 14 table mappings |
| Module-boundary merge gate | **PASS** | README forbids product import of evaluator persistence/selectors; package does not import `apps/*` |
| DB migration tests merge gate | **PASS** | `tests/integration/evaluator-database.test.ts` |
| Panel-isolation differential merge gate | **FAIL** | Present by name, not genuine — see axis (b) |

**FR-3.x foundation constraints (as they constrain storage/boundaries):** evaluator-owned `observation` with `domain_id` + `step` (Option E), separate from `scorecard.answer_outcome`; consensus `truth_basis='CONSENSUS'` insertable without settlement FK; settlement rows require `answer_outcome_id` — matches Architecture §3.4 / FR-3.0 / FR-3.5. Integration test inserts JUDGING/CONSENSUS observation and asserts `scorecard.answer_outcome` count stays 0.

**Axis (a) overall: FAIL** — nearly complete foundation surface, but the named merge gate “panel-isolation differential test” is not satisfied as a real gate (axis b).

---

## Axis (b) — Panel-isolation differential test is genuine

**Binding standard.**

- **FR-0.6 AC5:** evaluator vLLM must not enter `configuredProviderSet`; QA test: a run admitted with evaluator vLLM configured+healthy has the **same panel membership and `agent_count`** as an otherwise identical run with that path **absent**.  
- **Architecture §4.2:** required differential QA — admit same ask healthy vs absent; byte-identical `discovered_panel`, `agent_count`, structural `envelopeBasis`; identical root author/review maker populations; no evaluator provider/maker in product artifacts.  
- **Architecture §8 / REQ-02a note 3:** panel differential is mandatory for configuration-shaped influence, not only evaluator-derived data.

**What shipped.**

`tests/unit/evaluator-foundation.test.ts` describe `"FR-0.6 AC5 panel-isolation differential"` (approx. L138–191):

1. Builds `RunCreationSettings` with **`resolveDiscoveredPanel: async () => panel`** where `panel = fixtureDiscoveredPanel(2)` — a constant test fixture (`tests/support/discoveredPanel.ts`), not product discovery.
2. Arms “healthy” and “absent” only by calling `probeEvaluatorVllmCatalog` with different fetch stubs.
3. Calls `evaluateAskAdmission(settings, ask)` **twice with the same settings object**.
4. Asserts panel/envelope equality and that the fixture panel does not contain evaluator refs.

**Why this is not a genuine differential.**

| Required property | Observed in test | Verdict |
|---|---|---|
| Healthy vs absent evaluator path can affect admission inputs | Probe results are never passed into `evaluateAskAdmission` or `resolveDiscoveredPanel` | **Tautology** — arms are independent of the compared outputs |
| Product panel discovery path under test | `resolveDiscoveredPanel` is fully mocked to a constant | **Does not exercise** `apps/api/src/main.ts` discovery (`configuredProviders` → `ProviderProbeRepository.readLatest` only) |
| Same membership / agent_count from real enrollment rules | Equality is guaranteed by the fixture returning the same array both times | **Does not prove** isolation |
| Non-enrollment in `configuredProviderSet` on the product path | No register/`configuredProviderSet` composition is constructed for either arm | **Not shown** in this test (collision helper is tested separately, which is necessary but not the differential) |
| Author/review maker populations unchanged | Not asserted | **Gap** vs Architecture §4.2 list |

`evaluateAskAdmission` (`apps/api/src/index.ts` L314–349) only does `await settings.resolveDiscoveredPanel()` and derives envelope from `panelSize`. With a constant resolver, healthy vs absent **cannot fail** the equality assertions even if a future bug enrolled evaluator vLLM into real discovery.

Separate **collision** unit (L49–67) correctly drives `assertEvaluatorProviderIsolation` against a mock deployment set and expects typed refusal codes. That is a real contract test for the helper, **not** a substitute for FR-0.6 AC5’s healthy-vs-absent admission differential.

**What would satisfy the gate (guidance only; this review does not implement):** drive the real product panel-resolution composition (or an extracted pure function matching `main.ts`: map `deploymentMakers.configuredProviders` → probe/read-latest → members), with evaluator family configured as a **separate** register path and healthy vs absent (or present vs absent register family), assert identical `discovered_panel` / panel-length/`agent_count` input / `envelopeBasis`, assert evaluator provider/maker absent from members, and keep the collision assertion as a second, complementary check that enrollment into `configuredProviderSet` refuses.

**Axis (b) overall: FAIL — blocker.**

---

## Axis (c) — No BOUND state; zero live-run behavior change

| Check | Finding | Citation |
|---|---|---|
| Binding resolver admits BOUND | **PASS — none** | `EvaluatorDispatchBinding.state` is typed `"UNBOUND"` only; zod parse accepts only `state: "UNBOUND"`; absent/invalid → `UNBOUND` (`packages/evaluator/src/index.ts` L105–142) |
| DB shadow binding | **PASS** | `shadow_decision.binding_state text NOT NULL CHECK (binding_state='UNBOUND')` (`0023` L273) |
| Live product dispatch/panel call site | **PASS — none in lane** | Diff does not touch `apps/api/src/main.ts`, runner selection, or settlement routing |
| Product imports evaluator for live paths | **PASS — none** | No product app wiring; worker is separate package |
| Dev-menu bind control | **PASS N/A** | Out of tier-0 scope; not introduced |

Unit coverage: defaults UNBOUND for absent and malformed rows (`evaluator-foundation.test.ts` L69–78). Explicit `EXPLICIT_UNBOUND` happy-path is untested but code path exists; not a blocker given type-level impossibility of BOUND.

**Axis (c) overall: PASS.**

---

## Axis (d) — Migration matches hand-written SQL style, append-only triggers, grants

| Check | Finding | Citation |
|---|---|---|
| Hand-written SQL (not drizzle-kit generated as authority) | **PASS** | Full imperative `0023_evaluator_foundation.sql`; `schema.ts` is mapping-only (Architecture §1.1) |
| Roles / schema | **PASS** | `debateai_evaluator_{ddl,worker,api,reader}`; `CREATE SCHEMA evaluator AUTHORIZATION debateai_evaluator_ddl` |
| Cross-schema REFERENCES grants | **PASS** | `answer_outcome_id`, `run_id`, `raw_artifact_id`, `ledger_entry_id` (REQ-02a / Architecture §3.1) |
| Tables match Architecture §3 | **PASS** | domain through consumer_output; Option E columns on observation/profile; observation maker-guard + supersession functions |
| Append-only triggers | **PASS** | Loop installs `reject_mutation` BEFORE UPDATE OR DELETE on all 14 tables via `core.reject_mutation()`; REVOKE UPDATE/DELETE from runtime roles |
| Narrow grants | **PASS** | Worker SELECT-wide + enumerated INSERT; API SELECT subset + INSERT only `consumer_selection`; no scorecard/core product write grants for evaluator roles |
| Indexes | **PASS** | Matches Architecture §3.8 operational index set |
| Integration proofs | **PASS** | Tables list exact 14 names; 28 reject_mutation events (14 tables × UPDATE/DELETE); mutation UPDATE throws append-only; API INSERT restricted to `consumer_selection` |

**Style nits (non-blocking):** Architecture §3.8 and prior migrations (e.g. `0015_s12.sql`) use `DROP TRIGGER IF EXISTS` before create; `0023` only creates. Architecture uses `CREATE SCHEMA IF NOT EXISTS`; ship uses bare `CREATE SCHEMA`. Acceptable for a first foundation migration on a clean number; note for rework polish only.

**Axis (d) overall: PASS.**

---

## Axis (e) — Tests assert real contracts on shipped surfaces

| Test | Real surface? | Finding |
|---|---|---|
| Worker task-family list | Imports `apps/evaluator-worker/src/index.ts` | **PASS** |
| Family read + collision | Imports `readEvaluatorProviderFamily` / `assertEvaluatorProviderIsolation` from package | **PASS** — real zod pin + TypedDomainError codes |
| UNBOUND default | Real `readEvaluatorDispatchBinding` with fake Pool rows | **PASS** |
| Catalog enumerate / fail-closed | Real `probeEvaluatorVllmCatalog` against local HTTP server + closed port | **PASS** — no auth header; UNAVAILABLE on absence |
| Blind DTO | Real `createBlindEvaluationSample` | **PASS** — extra identity keys stripped; JSON has no maker/provider/model/artifact |
| Panel differential | `evaluateAskAdmission` real, but panel resolver mocked constant; healthy/absent decoupled | **FAIL** — does not prove FR-0.6 AC5 / §4.2 |
| DB tables/triggers/grants/mutation | Real `migrate()` + SQL against test Postgres | **PASS** |
| Catalog repo does not write `core.provider_probe` | Not integration-tested | **Gap / non-blocking** for tier 0 if isolation is otherwise structural; prefer explicit assert in a later tighten |

Focused unit run (this worktree): `pnpm exec vitest run tests/unit/evaluator-foundation.test.ts` → **6/6 pass**. Passing status does not redeem the tautological differential: a broken product isolation path would still pass that test.

**Axis (e) overall: FAIL** solely due to the panel-isolation merge-gate test; other foundation tests are real.

---

## Summary

The lane delivers a strong, architecture-aligned foundation: isolated package and worker scaffold, complete hand-written `0023` schema with append-only triggers and narrow grants, Drizzle mappings, pinned evaluator vLLM family readers, catalog probe/persist, collision helpers, UNBOUND-only binding resolver, and allowlist blind DTO. FR-0.1 dark-launch posture is respected in the type system and tree (no BOUND, no product dispatch wiring).

The **hard merge gate** for FR-0.6 AC5 / Architecture §4.2 — a **genuine** healthy-vs-absent panel-isolation differential — is **not met**. The current test labels itself as that gate but compares two admissions through a constant fixture panel, with evaluator health decoupled from discovery. That is test theater relative to the binding requirement.

---

## Blockers (REWORK)

1. **Replace the FR-0.6 AC5 panel-isolation differential with a genuine healthy-vs-absent test** that exercises the **product panel-discovery composition** (configuredProviderSet / `configuredProviders` → probe/read-latest → members, as in `apps/api/src/main.ts`), not a constant `resolveDiscoveredPanel` fixture. Arms must differ only in evaluator vLLM path health/presence while product configured providers stay fixed; assert identical `discovered_panel` (byte-equal membership), panel-size/`agent_count` input, and structural `envelopeBasis`; assert evaluator `provider:evaluator-vllm` / `maker:evaluator-local-vllm` are absent from panel members; keep (or strengthen) collision refusal as a separate complementary assertion. The test must be able to fail if product discovery enrolled the evaluator family.

REVIEW VERDICT: REWORK
