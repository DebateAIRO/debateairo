# PROG-08 peer review 2 — Claude Opus on `codex/eval-08-metering`

Mission: `model-evaluator` (PROGRAMMING loop, tier 1B)
Reviewer seat: Claude Opus peer reviewer (read-only; no commits)
Lane: `codex/eval-08-metering` @ `05f2a58` (rework of `ae14b46`), base `dev` @ `d0da17e`
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-08-metering`

**VERDICT: PASS.**

Both round-1 blockers are genuinely resolved — verified against the code and against tests I ran and probed myself, not against Codex's claims. The three cheap non-blockers I asked for landed, and the two I asked to be *documented* were documented accurately in the lane report. Remaining items are carry-forwards for later lanes, listed in §6; none of them gate this merge.

---

## 0. What I verified independently (round 2)

| Check | Result |
|---|---|
| `pnpm run typecheck` | clean |
| `npx vitest run` (full default suite) | **83 files / 601 tests pass** (was 599; +2 new unit/provider tests) — matches Codex's reported numbers |
| `npx vitest run --config acceptance/vitest.config.ts claude-relay grok-relay model-shim` | **22/22 pass** (was 18; +4 degradation tests) |
| `npx vitest run tests/integration/evaluator-database.test.ts tests/unit/evaluator-foundation.test.ts tests/unit/provider.test.ts` | 24/24 pass (embedded PostgreSQL, real 0023) |
| `pnpm run audit:architecture` / `audit:source` | `{"violations":[]}` / `{"blocking":[]}` |
| Fixture default output, executed directly | byte-identical to round 1 for both relays — the new env-gated branches change nothing on the default path |
| Round-2 diff scope | 11 files, all lane-owned; no migration, registry/domain, or sibling-lane file touched; worktree clean on `codex/eval-08-metering` |

---

## 1. Blocker 1 — versioned relative-cost surface: **RESOLVED**

Round 1: the derived cells omitted every `NOT NULL` column of `evaluator.relative_cost_cell`, nothing wrote the table, and `RELATIVE_COST_DERIVATION_VERSION` was dead.

What now exists (`packages/evaluator/src/index.ts`):

- `RelativeCostCellV1` carries `windowStart`, `windowEnd`, `derivationVersion`, `derivationInput`, `derivationHash`, `asOf` in addition to the round-1 fields.
- `deriveRelativeCostCellsV1(samples, window)` validates the window (`RELATIVE_COST_WINDOW_INVALID`, `RELATIVE_COST_WINDOW_ORDER_INVALID` — the latter matching the table's `window_end > window_start` CHECK), re-asserts observed usage on every sample, and refuses a group whose runtime class is inconsistent (`RELATIVE_COST_RUNTIME_CLASS_MISMATCH`).
- `derivationHash` is sha256 over `{basis, version, window bounds, canonical input}`, where `canonicalDerivationInput` fixes key order by construction and sorts by serialized bytes — deterministic, and it satisfies the table's `^[0-9a-f]{64}$` CHECK (the unit test asserts the regex, not just presence).
- `EvaluatorMeteringRepository.recordRelativeCostCells` writes all 16 columns including `at_seq` from `allocateSequence`, under `withWriteTransaction`.
- `RELATIVE_COST_DERIVATION_VERSION` is now load-bearing in both the cell and the hash.

The integration test does a **strict** `toEqual` round-trip of all 15 non-sequence columns out of real PostgreSQL, so every CHECK on that table (`comparability`/`relative_cost` coupling, `relative_cost BETWEEN 0 AND 1`, `jsonb_typeof(derivation_input)='array'`, the hash regex, the window ordering) is exercised by a real write rather than asserted in memory. That is the proof round 1 was missing.

## 2. Blocker 2 — relay semantics: **RESOLVED**

Round 1: `total_cost_usd` had become required and `modelUsage` values had to be objects, so envelope variation could refuse relay boot.

What now exists:

- `acceptance/claude-relay.ts:47-48` and `acceptance/grok-relay.ts:20-21`: `total_cost_usd` is `.optional()` and `modelUsage` is back to `z.record(…, z.unknown())`. Token extraction moved to a separate `observedTokenUsageSchema.safeParse` of the selected model's value, so a non-object value degrades to "no tokens observed" instead of failing the envelope.
- When nothing is observable, `usage` is `null` (`Object.keys(usage).length === 0 ? null : …`) — the honest unmetered outcome, not a fabricated zero and not a refusal.
- Grok's `costUsd` / `handshakeCostUsd` widened to `number | null` rather than defaulting to 0.

I proved the accept/reject boundary myself rather than trusting the diff: running the round-1 and round-2 schemas over both variant envelopes gives `OLD costAbsent:false, OLD nonObject:false` / `NEW costAbsent:true, NEW nonObject:true`. And I executed the fixtures directly to confirm the variants are real — `FAKE_CLAUDE_COST_ABSENT=1` emits an envelope with **no** `total_cost_usd` key, and the non-object variant emits `"modelUsage":{"claude-fake-cli-model":"usage unavailable"}`. So the four new tests are not vacuous.

Crucially, each degradation test calls `start()` **with the env variant active**, so the startup handshake parses the degraded envelope too. That is exactly the failure mode I flagged (boot refusal for the whole maker seat), and it is now covered rather than merely fixed.

Fixture honesty: both fixtures were edited, but only by adding env-gated branches; the default byte output is unchanged (I diffed it by execution), so no previously-green assertion was weakened to accommodate the rework.

## 3. Round-1 non-blockers 3–5: landed

- **`sourceUnitTotals` now asserted** — the cross-unit test checks `{ tokens: 50_000, usd: 0 }` on the local cell, so local utilization retention is proven, and the token sum now falls back to `prompt + completion` when `total_tokens` is absent.
- **Denominator reconciled, and reconciled in the honest direction** — `meanPaidUsd` divides by `metered.length` (Architecture §3.6's "per metered call") but only when `hasCompletePaidSpend`, i.e. every metered call in the group reported USD; otherwise the cell is `UNKNOWN`. This avoids the imputation that a literal reading of §3.6 would have required, and the new test ("keeps paid spend UNKNOWN when any metered call lacks observed cost") pins it: two metered calls, one with cost, yields `relativeCost: null` / `UNKNOWN` with `sourceUnitTotals: { tokens: 30, usd: 0.02 }` — spend still visible, rank withheld. This is a *stricter-than-documented* rule; see §6.
- **Gateway no longer discards observed usage on a strict-schema rejection** — `usage` is parsed off a lenient `{ usage }` shape (`packages/providers/src/index.ts:242-243, 276`), and the new provider test proves a response with `choices: []` still persists `usage: {prompt_tokens: 7, completion_tokens: 1, total_tokens: 8}` while the call itself fails.

## 4. No-estimation discipline re-checked end to end

Nothing in the rework weakens it, and two paths got more honest: absent cost is now omitted rather than required, and a paid group with incomplete cost coverage is `UNKNOWN` rather than averaged over an imputed zero. `LOCAL_VLLM` still returns `0` as a runtime-class fact per §3.6, unmetered calls still contribute only to `unmeteredCallCount`, and no token→USD rate exists anywhere in the lane.

## 5. Dark-launch invariants re-checked at `05f2a58`

No `BOUND` state; no key/bearer/secret material; no migration, no UI, no currency surface, no routing/selection call site; `RawArtifactInput.metadata` widening is unchanged from round 1 and is now disclosed in the lane report.

## 6. Carry-forwards (none gate this merge)

1. **No production caller** for `recordCall`, `deriveRelativeCostCellsV1`, or `recordRelativeCostCells`, and still no worker-level composition entry mirroring `runEvaluatorCatalogProbe`. Consistent with lane 02's accepted dark-launch posture, but the owning lane for actually populating both metering tables should be named in the stage verdict, since Architecture §7 assigns it to no one downstream.
2. **Architecture §3.6 should record the stricter rule** the code now implements: a paid group is `UNKNOWN` unless *every* metered call carries an observed vendor amount. Today the doc says only "mean observed external spend per metered call". Doc-side action for the architecture seat, not a lane defect.
3. **Refusal branches remain untested**: the four `assertObservedUsage` errors plus the three new ones (`RELATIVE_COST_WINDOW_INVALID`, `RELATIVE_COST_WINDOW_ORDER_INVALID`, `RELATIVE_COST_RUNTIME_CLASS_MISMATCH`).
4. **Idempotency undecided** for both repository writes: `model_call_usage.ledger_entry_id` and the `relative_cost_cell` uniqueness tuple are UNIQUE, so a re-run surfaces a raw PG unique violation rather than a typed refusal or documented no-op. Worth settling before a scheduler calls either.
5. **Fixture provenance comment**: the two new env-gated branches model *hypothesised* envelope variation, while the fixture headers describe empirically captured shapes. One comment marking them as robustness variants would stop a future reader citing them as observed evidence.
6. **Lane report handoff string is wrong**: the final marker reads `READY FOR PEER REVIEW: codex/eval-eval-08-metering` (doubled `eval-`). The branch is `codex/eval-08-metering`; the spine matches on that string, so Hermes should have it corrected.

## 7. Honest limits

- Still no real `claude`/`grok`/`codex` CLI exercised; relay behavior is verified against captured fixtures, direct fixture execution, and schema probing.
- 0023 was not run under the non-superuser `debateai_evaluator_worker` role; grant compatibility for the new `relative_cost_cell` insert is read from the migration (the grant exists), not executed under that role.
- Stack-dependent acceptance suites (`ceremony`, `fair-debate`, `dual-maker-proof`) were not run; the three relay suites and the full default suite were.
- Writes made: exactly the two files in my packet. No commits, no pushes, no edits inside the lane worktree.
