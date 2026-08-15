# PROG-08 peer review 1 — Claude Opus on `codex/eval-08-metering`

Mission: `model-evaluator` (PROGRAMMING loop, tier 1B)
Reviewer seat: Claude Opus peer reviewer (read-only; no commits)
Lane: `codex/eval-08-metering` @ `ae14b46`, base `dev` @ `d0da17e`
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-08-metering`

**VERDICT: REWORK** — two blocking defects:

1. **The versioned relative-cost surface is not delivered.** `deriveRelativeCostCellsV1` produces an in-memory shape that omits every field `evaluator.relative_cost_cell` declares `NOT NULL` (`window_start/window_end`, `derivation_version`, `derivation_input`, `derivation_hash`, `as_of`), nothing in the repository ever writes that table, and `RELATIVE_COST_DERIVATION_VERSION` is exported dead. Architecture §8 (FR-6 row) requires "per-call table, unmetered counts, **versioned** external-spend normalization"; the packet requires "usage projection into the evaluator metering **tables**" (§3.6 covers both). No other lane owns this table.
2. **The relay envelope schemas were tightened, not widened.** `acceptance/claude-relay.ts:47` now makes `total_cost_usd` a **required** field, and both relays now require every `modelUsage` value to be an object (was `z.unknown()`). Because `parseClaudeEnvelope` runs inside the startup handshake (`acceptance/claude-relay.ts:129`), a live Claude envelope that varies on either point no longer degrades to an unmetered call — it **refuses relay boot**. The merge gate is "zero behavior change to relay request/response semantics beyond the additive usage block".

Both are narrow, cheap fixes. Everything else in the lane is good work: the capture point is exactly the one ticket 01 recommended, the unmetered discipline is real and unbroken, the cross-unit test is genuine and not tautological, no fixture was doctored, and no estimation appears anywhere.

---

## 0. What I verified independently

| Check | Result |
|---|---|
| `pnpm run typecheck` (`tsc --noEmit`) | clean, no output |
| `npx vitest run` (full default suite) | **83 files / 599 tests passed** — matches Codex's reported numbers exactly |
| `npx vitest run --config acceptance/vitest.config.ts claude-relay grok-relay model-shim` | 3 files / 18 tests passed |
| `npx vitest run tests/integration/evaluator-database.test.ts` | 5/5 pass on embedded PostgreSQL with the real 0023 applied |
| `pnpm run audit:architecture` | `{"edgeRowsChecked":27,"violations":[]}` |
| `pnpm run audit:source` | `{"blocking":[]}` |
| `pnpm run audit:orphans` | no new blocking entry |
| Grep for `BOUND` (excl. `UNBOUND`) in the diff | zero hits |
| Grep for key/bearer/secret material (DR-179) | zero hits; only `tokenCeiling` (a pre-existing limit) and token *counts* |
| Files touched | 13, all in lane scope; `migrations/0023*.sql` untouched (lane 02 owns it); no registry/domain files; no sibling-lane files |
| Fixtures | `fake-claude-cli.mjs` and `fake-grok-cli.mjs` are **byte-unchanged** — the usage/cost fields the tests assert were already in the previously captured envelopes |
| Grants for the new writes | 0023 already grants `INSERT ON evaluator.model_call_usage, evaluator.relative_cost_cell` and `EXECUTE ON ledger.allocate_sequence()` to `debateai_evaluator_worker` — the repository's SQL is grant-compatible |

Codex's self-report is accurate on everything I could check. Two omissions from its "Risks / review focus" section are material and are the two blockers below: it does not mention that the Claude envelope schema became stricter, and it does not mention that `relative_cost_cell` is never written.

---

## 1. Axis 1 — deliverable completeness vs lane row 1B

Architecture §7 row 1B: *relay/gateway usage capture, usage projection, v1 normalization and unmetered surfaces.*

| Deliverable | Status | Evidence |
|---|---|---|
| Relay usage capture | **present** | `CliCompletion.usage: CliUsage \| null` (`acceptance/relay-core.ts:29-41`), filled by Claude (`claude-relay.ts:71-87`) and Grok (`grok-relay.ts:53-69`); emitted as OpenAI `usage` + `x_cost_usd` (`relay-core.ts:174-179`) |
| Gateway usage capture | **present** | `responseSchema` reads optional/nullable `usage` (`packages/providers/src/index.ts:160-167`); it lands in `raw_artifact.metadata_json.usage` (`:269-273`). Same path serves vLLM's standard `usage`, satisfying FR-6.1 bullet 3 |
| Projection into `evaluator.model_call_usage` | **present, no production caller** | `EvaluatorMeteringRepository.recordCall` (`packages/evaluator/src/index.ts:324-361`) writes one row per call with the correct METERED/UNMETERED discipline; only tests call it. Lane 02 set the precedent of an uncalled evaluator repository under dark launch, so I treat this as non-blocking — but 02 at least added a worker-level composition entry (`apps/evaluator-worker/src/index.ts:18`) and 08 added none |
| Projection into `evaluator.relative_cost_cell` | **absent** | grep across `packages`, `apps`, `tests`, `acceptance`: the table appears only in `migrations/0023` and `packages/db/src/schema.ts`. **Blocker 1** |
| v1 normalization | **partial** | `deriveRelativeCostCellsV1` implements the §3.6 rules faithfully in memory, but is not versioned or persistable — see §5 |
| Explicit unmetered surfaces | **present** | `usage: null` on the codex path (`model-shim.ts:138`), `metadata.usage: null`, `metering_status='UNMETERED'` with every usage column null, and `unmeteredCallCount` per cell |

FR-6.1 AC1 ("a completed call stores non-null usage inspectable per model identity") **is** met on the real path: the gateway is the live call site and `raw_artifact` carries `model_id`. FR-6.1 AC2 and FR-6.2 AC2 are met by `deriveRelativeCostCellsV1` and its test. FR-6.2 AC1 is met only in memory, which is blocker 1.

---

## 2. Axis 2 — capture-point fidelity to the ticket-01 findings

The findings' recommendation was: one primary hook at the shared `CliCompletion` seam; adapters fill from what their CLI actually reports; one gateway read; metadata-json persistence first. The lane implemented exactly that, with no bespoke second hook and no session-file tailer (explicitly not recommended). Codex stays `usage: null` because its stdout usage event is still unverified — matching the findings and Architecture §9.

`usage` is a **required** member of `CliCompletion` rather than optional. That is the right call: it forces every adapter (including the `dr181-discovery` test adapter) to declare metered-ness explicitly rather than silently omit it.

One fidelity nit, non-blocking: `totalTokens` is synthesized as `input + output` when both are observed (`claude-relay.ts:79-81`, `grok-relay.ts:61-63`). That is arithmetic over observed values, not an estimate, and it matches the table's own `total_tokens = prompt_tokens + completion_tokens` CHECK — but the synthesized value is then stored into `raw_usage` (`packages/evaluator/src/index.ts:353`), which reads as "the raw vendor block" and is actually the relay-normalized one. Prefer storing the CLI's own usage object there, or rename the intent in a comment.

---

## 3. Axis 3 — relay semantics (BLOCKER 2)

All 18 pre-existing relay acceptance tests stay green, no fixture was edited, request construction is untouched, and the added `usage` key is additive on the response. But the **input** contract changed in two ways that the packet's gate forbids:

- `acceptance/claude-relay.ts:47` — `total_cost_usd: z.number().nonnegative()` is now **required**. Previously the field was not in the schema at all (passthrough). Since `envelopeSchema.safeParse` precedes the `is_error` branch (`:60-63`), an envelope without it now fails as `CLAUDE_CLI_OUTPUT_INVALID` instead of reaching the `CLAUDE_CLI_FAILED` diagnosis — and on the startup handshake (`:129`) it kills relay boot for the whole Anthropic seat.
- `acceptance/claude-relay.ts:48-51` and `acceptance/grok-relay.ts:21-24` — `modelUsage` values must now be objects. `.passthrough()` tolerates extra keys but not a non-object value, which `z.unknown()` previously accepted.

The empirically captured envelopes do carry `total_cost_usd`, so this is a robustness/blast-radius argument, not a claim that today's CLI breaks. But the one live variant we have on record — the 2026-08-10 expired-OAuth envelope noted in `fake-claude-cli.mjs:38-40` — is exactly the kind of degenerate envelope (`modelUsage: {}`) whose cost field nobody has verified, and the lane converted an unverified assumption into a hard parse requirement on a live path.

**Required fix.** Make both additions non-load-bearing: `total_cost_usd: z.number().nonnegative().optional()` with `costUsd` omitted from the usage block when absent (an absent cost is an unmetered cost, not a relay refusal), and keep `modelUsage` values permissive (`z.unknown()`, then `safeParse` the selected model's value into the optional token shape, falling back to no token fields). Add one test per relay for the cost-absent envelope showing an honest partial/unmetered usage instead of a failure.

---

## 4. Axis 4 — the paid-vs-local cross-unit test

`tests/unit/evaluator-foundation.test.ts:39-49` is genuine and is the case Architecture §3.6 names verbatim: 50,000 local vLLM tokens vs a 10-token paid Grok call at $0.02, plus an unmetered paid Claude call. It asserts local `relativeCost: 0` / `COMPARABLE`, Grok `1` / `COMPARABLE`, Claude `null` / `UNKNOWN` with `unmeteredCallCount: 1`. It would fail under a raw-token-total implementation (local would dominate), so it is not tautological.

Two weaknesses worth closing, non-blocking:

- Every assertion uses `expect.objectContaining`, so `sourceUnitTotals` is never checked. Architecture §3.6 requires local token counts to be **retained as local utilization**; nothing proves the 50,000 tokens survive into `sourceUnitTotals.tokens`.
- The `LOCAL_VLLM` branch returns `0` before consulting `usage` at all, so the test cannot distinguish "local utilization retained and correctly excluded from spend" from "local usage ignored". Asserting `sourceUnitTotals` fixes both.

---

## 5. Axis 5 — no estimation of unmetered paths

Clean, and this is the strongest part of the lane:

- Codex emits `usage: null`; nothing imputes it.
- A paid remote call whose observed `x_cost_usd` is absent **or zero** yields `relativeCost: null` / `UNKNOWN` (`packages/evaluator/src/index.ts:408-420`) — notably, a subscription-billed Claude envelope reporting `total_cost_usd: 0` does not silently become "free paid", which is the honest outcome.
- `assertObservedUsage` refuses a METERED row with nothing in it (`MODEL_CALL_USAGE_EMPTY`), mirroring the table CHECK.
- Sums are taken only over metered calls; unmetered calls contribute only to `unmeteredCallCount`.

Two observations:

- **Divergence from §3.6 wording (should reconcile).** §3.6 says "mean observed external spend **per metered call**". The implementation divides by the number of calls that reported a USD amount (`meanPaidUsd`, `:400`), not by `meteredCallCount` (`:396`). The implementation is the more honest of the two (the literal reading would impute $0 for token-only metered calls), but the doc and the code now say different things, and `sourceUnitTotals.usd / meteredCallCount` will not reproduce the mean. Fix one or the other.
- **Gateway drops observed usage on a schema-failed response.** `usage: strict.success ? ... : null` (`packages/providers/src/index.ts:272`) records UNMETERED for a response that may well have carried a `usage` block, merely because `choices` failed the strict schema. Prefer parsing `usage` off the lenient `candidate` shape so an honest observation is not discarded (the bytes survive in `raw_text`, but the metering surface asserts "unmetered", which is not what was observed).

Also non-blocking: `RawArtifactInput.metadata` was widened to `Record<string, unknown>` to carry the nested block. Typecheck is clean and the column is `jsonb`, so this is safe, but it removes a scalar-only guard from a shared providers contract — worth a line in the lane report since the packet routes shared type changes through the orchestrator.

---

## 6. Axis 6 — no BOUND state, DR-179, no product behavior change

- No `BOUND` state anywhere in the diff; the binding resolver is untouched.
- No API keys, bearer tokens, or authorization material; the only `authorizationHeader` reference is pre-existing gateway code.
- No product behavior change: no UI, no currency surface, no routing/selection call site, no migration. The relay response gains a key and `raw_artifact.metadata_json` gains a `usage` member; `contentHash` for relayed calls now digests a body that includes `usage`, which is new-observation drift, not behavior change, and the full suite confirms nothing depended on the old bytes.

---

## 7. Axis 7 — test honesty

Good. The RED→GREEN claim is credible (the provider assertion reads `metadata.usage`, which did not exist before), fixtures were not doctored to manufacture green, the integration test exercises real 0023 CHECK constraints for both the METERED and UNMETERED rows, and the UNMETERED row is asserted with a **strict** object (every usage column null) rather than `objectContaining`.

Gaps, all non-blocking:

- All four `assertObservedUsage` refusal branches (`_EMPTY`, `_INVALID`, `_TOKEN_INVALID`, `_TOTAL_MISMATCH`) are untested.
- No test covers a partial-usage envelope (only one of input/output observed) even though the report calls that the headline risk.
- `recordCall` has no idempotency story; `ledger_entry_id` is UNIQUE, so a re-run raises a raw PG unique violation rather than a typed refusal or a documented no-op. Worth deciding before a caller exists.

---

## 8. Rework list

**Blocking**

1. Deliver the versioned relative-cost surface: attach `derivation_version` (use the already-exported `RELATIVE_COST_DERIVATION_VERSION`), the window bounds, `as_of`, and a `derivation_input`/`derivation_hash` pair to the derived cells, and add the repository write for `evaluator.relative_cost_cell` (grants already exist). If persistence is genuinely meant to land elsewhere, that must be an explicit named deferral in the lane report and in Architecture §7 — today no lane owns it.
2. Revert the relay schema tightening to additive-only: optional `total_cost_usd` on the Claude envelope with `costUsd` omitted when absent, permissive `modelUsage` values on both relays, plus a cost-absent test per relay proving an honest partial rather than a boot/parse failure.

**Should fix (non-blocking)**

3. Assert `sourceUnitTotals` in the cross-unit test so local utilization retention is actually proven.
4. Reconcile the mean-spend denominator with Architecture §3.6 (code divides by cost-reporting calls, doc says per metered call).
5. Parse `usage` off the lenient candidate shape in the gateway so a schema-failed response is not mislabeled unmetered.
6. Cover the four `assertObservedUsage` refusals and one partial-usage envelope.
7. Add a worker-level composition entry for metering (mirroring `runEvaluatorCatalogProbe`), or state in the report which lane will call `recordCall`.
8. Store the CLI's own usage object in `raw_usage`, not the relay-normalized one with the synthesized `total_tokens`.
9. Note the `RawArtifactInput.metadata` contract widening in the lane report.

---

## 9. Honest limits of this review

- I did not exercise a real `claude`/`grok`/`codex` CLI; relay behavior is verified against the repo's captured fixtures plus code reading. My blocker-2 argument is about blast radius under envelope variation, not a reproduced live failure.
- I did not run 0023 under the non-superuser `debateai_evaluator_worker` role; grant compatibility is read from the migration, not executed.
- The acceptance suites that need real CLIs and a booted stack (`ceremony`, `fair-debate`, `dual-maker-proof`) were not run; the three relay suites and the full default suite were.
- Writes made: exactly the two files in my packet. No commits, no pushes, no edits inside the lane worktree.
