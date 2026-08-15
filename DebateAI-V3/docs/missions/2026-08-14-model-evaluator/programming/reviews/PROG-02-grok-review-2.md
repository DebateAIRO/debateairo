# PROG-02 Grok peer review — `codex/eval-02-foundation` (rev 2)

**Reviewer:** Grok (read-only peer)  
**Lane / branch:** `codex/eval-02-foundation` vs `dev`  
**Rework commit under review:** `11ad2f3` — `test(evaluator): prove persisted panel isolation`  
**Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-02-foundation/DebateAI-V3`  
**Prior review:** `PROG-02-grok-review-1.md` (**REWORK**, blocker 1 — tautological panel-isolation differential)  
**Binding bar (this round):** FR-0.6 AC5 + Architecture §4.2 panel isolation; explicit round-1 blocker-1 resolution criteria in the goal packet.

**Scope:** Verify blocker 1 is genuinely fixed and that `runEvaluatorCatalogProbe` hosts the isolation call site. Round-1 PASS axes are re-checked only for rework breakage.

---

## Diff surface (`11ad2f3`)

| Path | Change |
|---|---|
| `tests/integration/evaluator-database.test.ts` | New `FR-0.6 AC5 persisted panel-isolation differential` against real register + `PostgresAskApplication` |
| `tests/unit/evaluator-foundation.test.ts` | Removed fixture-only differential; added collision-before-collection via `runEvaluatorCatalogProbe`; extra timeout/endpoint cases |
| `apps/evaluator-worker/src/index.ts` | `assertEvaluatorProviderIsolation` before catalog probe/persist; takes `deployment` + optional `fetch` |
| `migrations/0023_evaluator_foundation.sql` | Style polish only: `IF NOT EXISTS` tables/schema; `DROP TRIGGER IF EXISTS` before creates |

No product dispatch/panel live-path edits (`apps/api` composition root unchanged).

---

## Blocker 1 resolution checklist

### (a) Discovery composed from `configuredProviderSet` the way `main.ts` does — **PASS**

`admitAndReadPersistedRun` (`tests/integration/evaluator-database.test.ts` L146–201):

1. Seeds and reads real `register.register_row` via `readDeploymentMakerCapability(pool, registerVersion)` (`@debateai/critique` — same reader product uses).
2. Builds `resolveDiscoveredPanel` as:
   - `probes.readLatest(deploymentMakers.configuredProviders.map((p) => p.providerRef))`
   - keep only `HEALTHY` rows with non-null `modelId` within freshness window
3. That is the same algorithm as `apps/api/src/main.ts` L43–57 (test hard-codes freshness `60_000` ms instead of `readPanelDiscoveryPolicy`; immaterial to isolation).

**Not** a constant `fixtureDiscoveredPanel` resolver (round-1 defect removed from unit suite).

### (b) Same ask, evaluator present+healthy vs absent — **PASS**

| Arm | Register version | `configuredProviderSet` | Evaluator family | Evaluator health evidence |
|---|---|---|---|---|
| Absent | `201` | product-a + product-b only | **no** `evaluatorProviderFamily` row | product probes healthy; evaluator also recorded in `core.provider_probe` but **not** in configured set |
| Healthy | `202` | **same** product providers | **yes** `evaluatorProviderFamily` + `evaluator.vllm_probe` `AVAILABLE` | same product probes; evaluator family present and healthy on evaluator path |

Both arms admit the same `AskRequest` through `PostgresAskApplication.submit` (L186). Recording a HEALTHY evaluator row in `core.provider_probe` for **both** arms strengthens the case: isolation is enrollment via configured set, not “no probe existed.”

### (c) Compared surfaces are **persisted** `discovered_panel` + `agent_count` — **PASS**

After submit, the test reads `core.run` (L187–201):

```sql
SELECT encode(convert_to(discovered_panel::text, 'UTF8'), 'hex') AS panel_bytes,
       discovered_panel, agent_count
FROM core.run WHERE run_id=$1
```

Assertions (L238–239): `healthy.panelBytes === absent.panelBytes` and `healthy.agentCount === absent.agentCount`. Byte-equal membership is on the **persisted** JSONB text, not an in-memory fixture.

### (d) No evaluator provider/maker among members — **PASS**

L240–242 asserts no panel member carries `provider:evaluator-vllm` or `maker:evaluator-local-vllm` on the healthy arm (the arm where mis-enrollment would show up).

### (e) Demonstrably able to fail on mis-enrollment — **PASS**

Structural failure mode (source audit):

- Discovery membership is exactly the HEALTHY probes for refs in `configuredProviders`.
- The test **already records** a HEALTHY `core.provider_probe` for `EVALUATOR_PROVIDER_REF` / `EVALUATOR_MAKER` (L230–232).
- If the healthy arm’s `configuredProviderSet` were mis-seeded to include that provider, `readLatest` would enroll it → panel length/agent_count 3 vs absent’s 2 → `panelBytes` and `agentCount` equality **and** the evaluator-member assertion would fail.

Complementary explicit negative (unit): `runEvaluatorCatalogProbe` with colliding `configuredProviders` rejects with `EVALUATOR_PROVIDER_PANEL_COLLISION` and never calls `fetch` (`tests/unit/evaluator-foundation.test.ts` L138–153). That proves the worker isolation gate can fail closed; the integration differential proves product discovery does not enroll the separate evaluator path when correctly configured.

### (f) Isolation call site in `runEvaluatorCatalogProbe` — **PASS**

`apps/evaluator-worker/src/index.ts` L18–32:

```ts
export async function runEvaluatorCatalogProbe(pool, family, deployment, fetchImplementation = fetch) {
  assertEvaluatorProviderIsolation(family, deployment);
  const probe = await probeEvaluatorVllmCatalog(family, fetchImplementation);
  const probeId = await new EvaluatorCatalogRepository(pool).record(family, probe);
  ...
}
```

Isolation runs **before** enumeration and **before** persistence. Unit test proves refusal short-circuits both.

---

## Round-1 axes (regression check)

| Axis | Round 1 | After `11ad2f3` |
|---|---|---|
| (a) Deliverable completeness | FAIL only via bad merge gate | **PASS** — merge gate now real |
| (b) Panel isolation differential genuine | **FAIL** | **PASS** (above) |
| (c) No BOUND / zero live-run change | PASS | **PASS** — still UNBOUND-only types; no product live-path edits |
| (d) Migration style / triggers / grants | PASS | **PASS** — rework only adds `IF NOT EXISTS` / `DROP TRIGGER IF EXISTS` polish matching repo style |
| (e) Tests assert real contracts | FAIL on differential | **PASS** — integration drives real `readDeploymentMakerCapability` + `ProviderProbeRepository` + `PostgresAskApplication` + persisted `core.run` |

---

## Focused test evidence

Command (worktree):

```bash
pnpm exec vitest run tests/unit/evaluator-foundation.test.ts tests/integration/evaluator-database.test.ts
```

Result: **2 files, 12 tests, all pass**, including:

- `FR-0.6 AC5 persisted panel-isolation differential > persists byte-identical product membership and agent_count with evaluator healthy versus absent`
- `refuses an isolated-family collision before catalog collection or persistence`

(Log captured under reviewer scratch `prog-02-r2-tests.log`.)

---

## Residual notes (non-blocking)

1. Discovery composition is **inlined** in the test to mirror `main.ts` rather than importing a shared extracted function. Acceptable for tier 0 while the composition root remains unexported; a later extraction would harden against drift.
2. No dedicated integration case that *seeds mis-enrollment and expects inequality* — not required once the healthy arm already plants a HEALTHY evaluator probe and membership is solely configured-set driven; ability to fail is structural and unit-backed.
3. Settlement grant assertion in the observation test was tightened (no evaluator role INSERT on `scorecard.answer_outcome`); still consistent with FR-3.0.

---

## Verdict

Round-1 blocker 1 is **resolved**. The FR-0.6 AC5 differential now admits the same ask through product-shaped discovery from real `configuredProviderSet` rows, compares **persisted** `discovered_panel` bytes and `agent_count`, asserts no evaluator membership, and would fail if the evaluator family were enrolled. `runEvaluatorCatalogProbe` calls `assertEvaluatorProviderIsolation` before any catalog I/O.

REVIEW VERDICT: PASS
