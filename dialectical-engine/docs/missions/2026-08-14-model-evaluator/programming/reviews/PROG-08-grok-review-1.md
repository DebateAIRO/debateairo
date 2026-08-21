# PROG-08 Grok peer review — `codex/eval-08-metering` (rev 1)

**Reviewer:** Grok (read-only peer)  
**Lane / branch:** `codex/eval-08-metering` vs `dev`  
**Tip commit:** `ae14b46` — `feat(evaluator): capture and normalize observed usage`  
**Worktree inspected:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-08-metering/DebateAI-V3`  
**Diff basis:** `git diff dev...codex/eval-08-metering` (13 files, +309 / −13)  
**Binding docs (MAIN checkout only):**
- `docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md` §§3.6, 5, 7 row 1B, 8  
- `docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md` §6 FR-6.1–6.2, FR-0.1 / FR-0.5 / FR-0.x  
- `docs/missions/2026-08-14-model-evaluator/wayfinder/assets/01-relay-token-cost-exposure-findings.md`

**Scope of review:** tier-1B metering only — single-hook usage capture, additive relay semantics, provider parse/persist, evaluator projection + `relative-external-spend/v1`, unmetered honesty, BOUND/DR-179 hygiene, test honesty. No product-code edits, no commits from this seat.

---

## Diff surface (lane hygiene)

| Path | Role |
|---|---|
| `acceptance/relay-core.ts` | Widen `CliCompletion` with `usage`; emit OpenAI-shaped `usage` / `null` on HTTP response |
| `acceptance/claude-relay.ts` | Parse observed `total_cost_usd` + per-model `input_tokens`/`output_tokens` from CLI envelope |
| `acceptance/grok-relay.ts` | Same observed capture for Grok envelope (cost already required; tokens from `modelUsage`) |
| `acceptance/model-shim.ts` | Explicit Codex `usage: null` (no session-file meters invented) |
| `packages/providers/src/index.ts` | Optional standard/vLLM usage parse; persist exact block or `null` in `metadata_json` |
| `packages/evaluator/src/index.ts` | `EvaluatorMeteringRepository.recordCall` + `deriveRelativeCostCellsV1` |
| `acceptance/*-relay*.test.ts`, `model-shim.test.ts` | Additive usage assertions on existing relay suites |
| `tests/unit/provider.test.ts` | Observed usage persistence + null path |
| `tests/unit/evaluator-foundation.test.ts` | Paid-vs-local cross-unit normalization |
| `tests/integration/evaluator-database.test.ts` | Real-Postgres METERED / UNMETERED projection |
| `tests/unit/dr181-discovery.test.ts` | Fixture adapter returns `usage: null` for new contract |

**Out-of-lane mass edits:** none. No registry/domain files, no migrations, no skeleton/templates, no API-key surfaces, no live panel/dispatch wiring, no `BOUND` introduction.

---

## Axis (a) — Findings fidelity: single choke-point capture

**Binding standard (findings recommendation + Architecture §3.6 capture design):**
1. Widen shared `CliCompletion` with optional observed usage.  
2. Claude/Grok fill from CLI envelopes already on the wire; Codex stays `usage: null` until stdout usage is verified.  
3. Emit standard OpenAI `usage` (+ vendor extension) from the shared relay HTTP rebuild.  
4. One gateway parse; no per-relay bespoke persistence hooks; no session-file primary meter.

| Check | Finding | Citation |
|---|---|---|
| Single shared seam widened | **PASS** | `acceptance/relay-core.ts` L29–42: `CliCompletion.usage: CliUsage \| null` with optional `promptTokens` / `completionTokens` / `totalTokens` / `costUsd` |
| Single HTTP emission point | **PASS** | `relay-core.ts` L168–180: one rebuild site maps null → `usage: null`, else `prompt_tokens` / `completion_tokens` / `total_tokens` / `x_cost_usd` |
| Claude observed fields | **PASS** | `claude-relay.ts` L45–84: requires observed `total_cost_usd`; reads per-model `input_tokens`/`output_tokens` optionally; omits absent token components; emits `totalTokens` only when both sides observed (exact sum) |
| Grok observed fields | **PASS** | `grok-relay.ts` L17–67: same pattern; keeps pre-existing `costUsd` on parse result for handshake while also filling `usage` |
| Codex explicit unmetered | **PASS** | `model-shim.ts` L130–138: return type and value `usage: null`; no `token_count` / `total_token_usage` parsing added (session files still used only for pre-existing model lineage) |
| Partial honesty (not inventing missing half) | **PASS** | Claude fixture has only `output_tokens: 5` (`acceptance/test-fixtures/fake-claude-cli.mjs` L21); test expects exactly `{ completion_tokens: 5, x_cost_usd: 0 }` (`claude-relay.test.ts` L57) — no fabricated `prompt_tokens` / `total_tokens` |

**Axis (a) overall: PASS.**

---

## Axis (b) — Additive-only / relay request–choice–completion semantics

**Merge gate:** zero behavior change beyond the additive usage block; existing relay tests stay green.

| Check | Finding | Citation |
|---|---|---|
| Request schema unchanged | **PASS** | `relay-core.ts` `requestSchema` still `model` + `messages` only; no request-path metering edits |
| Choice / content / model wiring | **PASS** | Response still builds `choices: [{ message: { role, content }, finish_reason: "stop" }]` from `completion.content` / `completion.model` / `adapter.maker` |
| Failure laws unchanged | **PASS** | Pre-existing tests for 502/504, multi-model refusal, non-JSON, dead handshake remain in suite and green |
| Re-run evidence | **PASS** | This seat re-ran: `pnpm exec vitest run --config acceptance/vitest.config.ts acceptance/claude-relay.test.ts acceptance/grok-relay.test.ts acceptance/model-shim.test.ts` → **3 files, 18 tests passed** |

**Axis (b) overall: PASS.**

---

## Axis (c) — Provider parse/persist (optional standard usage, never estimate)

**Binding standard (findings #2 + Architecture §3.6 steps 3–5; FR-6.1):** parse optional usage once in `OpenAICompatibleProviderGateway`; persist exact block or null in `raw_artifact.metadata_json`; no estimate path.

| Check | Finding | Citation |
|---|---|---|
| Response schema optional/nullable usage | **PASS** | `packages/providers/src/index.ts` L159–171: optional nullable object with optional nonnegative ints + `x_cost_usd`, `.passthrough()` for vendor extensions |
| Persist exact block or null | **PASS** | L269–273: `usage: strict.success ? strict.data.usage ?? null : null` — invalid outer schema → null (no salvage/estimate from raw text) |
| Metadata type widened only as needed | **PASS** | `RawArtifactInput.metadata` → `Record<string, unknown>` so nested usage objects can serialize; still additive |
| Unit test drives shipped gateway | **PASS** | `tests/unit/provider.test.ts` L14–38: real `OpenAICompatibleProviderGateway.call` twice (observed block then `null`); asserts `metadata.usage` equality — not a hardcoded bypass of `call` |

**Axis (c) overall: PASS.**

---

## Axis (d) — Evaluator projection + `relative-external-spend/v1` + unmetered honesty

**Binding standard (Architecture §3.6 tables + normalization basis; FR-6.1–6.2; FR-0.5):**
- Project completed calls into `evaluator.model_call_usage` with METERED / UNMETERED invariants.  
- Normalization basis `relative-external-spend/v1`: paid USD means → relative scale; `LOCAL_VLLM` external spend structurally `0`; paid tokens without USD → UNKNOWN; never rank free local above paid on raw token volume.  
- Unmetered: `usage: null` / all usage columns null; contribute only to `unmetered_call_count`.

| Check | Finding | Citation |
|---|---|---|
| Projection repository | **PASS** | `EvaluatorMeteringRepository.recordCall` (`packages/evaluator/src/index.ts` L324–359): `usage === null` → `UNMETERED` with all token/vendor/raw_usage null; else `METERED` with observed fields + `raw_usage` JSON + `USD` unit when `x_cost_usd` present |
| Empty usage rejected (no empty METERED) | **PASS** | `assertObservedUsage` L307–321 throws `MODEL_CALL_USAGE_EMPTY` / total-mismatch guards |
| Integration projection against real DB | **PASS** | `tests/integration/evaluator-database.test.ts` L26–68: inserts ledger rows, calls shipped `recordCall`, reads back METERED row with tokens/USD and UNMETERED row with all nulls — **re-run green** (embedded Postgres) |
| Normalization basis constant | **PASS** | `RELATIVE_COST_NORMALIZATION_BASIS = "relative-external-spend/v1"` L287 |
| LOCAL_VLLM → 0 external spend | **PASS** | `deriveRelativeCostCellsV1` L409–410: `runtimeClass === "LOCAL_VLLM" ? 0 : …` |
| Paid without observed USD → UNKNOWN | **PASS** | Mean paid only from `x_cost_usd`; else `relativeCost: null`, `comparability: "UNKNOWN"` L411–419 |
| Unmetered counts | **PASS** | `unmeteredCallCount = calls.length - metered.length` where metered is `usage !== null` |
| Cross-unit test genuine | **PASS** | `tests/unit/evaluator-foundation.test.ts` L39–49: drives **shipped** `deriveRelativeCostCellsV1` with local `50_000` tokens vs paid Grok `10` tokens + `$0.02` vs unmetered Claude `usage: null`. Asserts local `relativeCost: 0`, Grok `1`, Claude `UNKNOWN` / `unmeteredCallCount: 1`. Failable: swapping runtime class or inventing token→USD would break assertions. **Not a tautology.** |

**Module-boundary note (non-blocking):** projection is an evaluator repository API + pure normalizer, not an automatic write inside `ProviderGateway.call`. That matches FR-0.2 / package isolation (providers must not import evaluator). Harvest/worker auto-wiring remains a later composition concern; lane 1B deliverable of “usage projection” is satisfied by the tested repository path into `evaluator.model_call_usage`.

**Axis (d) overall: PASS.**

---

## Axis (e) — No BOUND; DR-179; no estimates; test honesty

| Check | Finding | Citation |
|---|---|---|
| No `BOUND` state introduced | **PASS** | Lane-file hygiene: no bare `BOUND` hits; pre-existing foundation binding remains `UNBOUND`-only |
| DR-179 no API keys | **PASS** | No API-key material in lane-changed files; no new auth surfaces |
| No estimate / fabricate / impute / token-price helpers | **PASS** | Only pre-existing “NEVER fabricates” DR-115 comments/test titles; no estimate helpers |
| Codex not session-file-metered | **PASS** | Explicit `usage: null`; no token_count tailer (Architecture §9 / findings non-recommendation) |
| Tests drive shipped code | **PASS** | Relay HTTP round-trips; provider `gateway.call`; evaluator `recordCall` + `deriveRelativeCostCellsV1`; no reimplementation of production logic inside expects |

**Re-run evidence (this seat):**
- Relay acceptance: **18/18 pass**  
- Unit provider + evaluator-foundation: **17/17 pass** (includes new usage + cross-unit cases)  
- Integration evaluator-database: **5/5 pass** (includes real-Postgres projection)

**Axis (e) overall: PASS.**

---

## Axis (f) — FR-0.1 / Architecture §8 dark-launch obligations for this lane

| Check | Finding |
|---|---|
| No live seat-share / panel integration | **PASS** — lane does not touch dispatch, panel discovery composition, or seat-share allocator |
| Metering collect-only surface | **PASS** — capture + projection + relative-cost pure function only; no bind control |
| FR-0.5 unmetered honesty | **PASS** — null paths explicit end-to-end (relay → metadata → model_call_usage → normalization counts) |

---

## Residual non-blockers (observations only)

1. Gateway will store a wire `usage: {}` object if present and schema-valid with all fields optional; projection rejects empty via `assertObservedUsage`. Prefer future hardening (treat empty object as null) if empty vendor objects appear — not required by this lane’s tests or binding docs.  
2. Paid path with observed `x_cost_usd === 0` yields `UNKNOWN` relative cost (mean not `> 0`); free local remains structural `0`. Acceptable for v1 external-spend basis; document if product later wants free-paid as COMPARABLE 0.  
3. `relative_cost_cell` table writes are not in this lane — only the pure `deriveRelativeCostCellsV1` derivation. Consistent with repository-boundary projection + later harvest/derivation jobs.

---

## Verdict

Lane `codex/eval-08-metering` @ `ae14b46` matches Architecture §3.6 / FR-6 / ticket-01 findings: single shared capture hook, additive relay emission, gateway optional usage persistence, evaluator METERED/UNMETERED projection, `relative-external-spend/v1` normalization with a genuine paid-vs-local cross-unit test, explicit unmetered nulls without estimates, no BOUND, no API keys. Focused suites re-run green.

REVIEW VERDICT: PASS
