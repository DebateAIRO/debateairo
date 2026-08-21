# PROG-08 peer review — second reviewer seat (Claude Opus, substituting for Grok)

Lane: `codex/eval-08-metering` (PROGRAMMING, tier 1B)
Commits reviewed: `ae14b46` ("feat(evaluator): capture and normalize observed usage") and
`05f2a58` ("fix(evaluator): complete metering rework") — the branch tip.
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-08-metering`
Binding docs: Architecture §3.6 / §2.1–2.4 / §5 / §7 row 1B / §8; Requirements §6 (FR-6.1,
FR-6.2) and FR-0.1 / FR-0.4 / FR-0.5 / FR-0.6; wayfinder findings
`01-relay-token-cost-exposure-findings.md`.
Reviewer: fresh independent seat under V's outage ruling. By design I read **no** other
PROG-08 review before forming this judgment; every claim below comes from the diff, the
binding docs, and probes I ran myself. Read-only outside this file and my self-report.
No commits, no pushes, no worktree mutation.

## Verdict

**PASS.**

The lane does the thing the findings asset asked for, at the seam it named, with the
honesty law intact: one shared capture hook, observed-only values, absent telemetry
represented as `null` rather than imputed, and a versioned relative-cost derivation whose
one structural constant (local vLLM external spend = 0) is a runtime-class fact from
Architecture §3.6, not an invented token price. Both metering tables take complete rows
under real PostgreSQL. Every gate is green and the author's reported numbers reproduce
exactly. Ten non-blocking findings follow; the load-bearing one (N1) is a seam handoff to
lane 05, not a defect in what shipped.

## Changed surface

```
acceptance/claude-relay.ts                     |  26 +-      acceptance/claude-relay.test.ts        |  33 +
acceptance/grok-relay.ts                       |  36 +-      acceptance/grok-relay.test.ts          |  34 +-
acceptance/model-shim.ts                       |   4 +-      acceptance/model-shim.test.ts          |   4 +-
acceptance/relay-core.ts                       |  15 +       tests/unit/provider.test.ts            |  46 +
acceptance/test-fixtures/fake-claude-cli.mjs   |   8 +-      tests/unit/evaluator-foundation.test.ts|  37 +
acceptance/test-fixtures/fake-grok-cli.mjs     |   8 +-      tests/unit/dr181-discovery.test.ts     |   2 +-
packages/providers/src/index.ts                |  18 +-      tests/integration/evaluator-database.test.ts | 81 +
packages/evaluator/src/index.ts                | 253 +
```

15 files, +587/−18. No migration, no `schema.ts`, no register/domain file, no lockfile, no
sibling-lane file. The lane is 4 commits behind `dev`; I confirmed all 4 are docs and
`.hermes` logs — **zero source drift**, so the tip I tested is the code that would merge.

## Gates I ran myself (in the worktree, not from the author's transcript)

| Gate | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | PASS, no diagnostics |
| Architecture audit | `pnpm run audit:architecture` | 27 edge rows, `violations: []` |
| Source audit | `pnpm run audit:source` | `blocking: []` |
| Orphan audit | `audit:orphans` | no blocking entry for the new exports |
| Relay acceptance (existing + new) | `vitest --config acceptance/vitest.config.ts` on claude/grok/model-shim | 3 files / 22 tests pass |
| **Full** acceptance suite | `vitest run --config acceptance/vitest.config.ts` | 11 files / 47 tests pass |
| Unit | `vitest run tests/unit` | 53 files / 430 tests pass |
| Real-PostgreSQL integration | `vitest run tests/integration/evaluator-database.test.ts` | 5/5 pass |
| Full suite | `vitest run` | 83 files / 601 tests pass |
| Worktree cleanliness | `git status --porcelain` | empty |

Author self-report claims 83/601, 22 acceptance, typecheck, both audits — **all reproduce
exactly**. No fabricated result found.

## Axis 1 — single-hook capture, additive to relay semantics

The capture point is exactly the one the findings named as the single choke point:
`CliCompletion` in `acceptance/relay-core.ts:29-38` gains `usage: CliUsage | null`, and the
relay's response rebuild maps it to a standard OpenAI `usage` plus the `x_cost_usd` vendor
extension. Three adapters feed one seam; there are no per-relay bespoke hooks (the
explicitly not-recommended shape).

Additivity verified structurally and behaviorally: request construction, model resolution,
choices, finish reason, failure codes and status mapping are untouched; the response gains
one key. `usage` is now a **required** field of `CliCompletion`, which is what forced the
codex shim and the DR-181 fixture adapter to state `usage: null` explicitly — honest
compile-time pressure rather than a silently optional field.

**The cost-absent case, which I tested rather than trusted.** On `dev`, grok's envelope
schema *required* `total_cost_usd: z.number().nonnegative()` — an envelope without cost was
a loud failure, and because the same parser runs the startup handshake, a cost-less build
of the CLI would have refused relay boot outright. The lane relaxes it to `.optional()`
(and claude's to optional as well) while leaving model resolution strict. I booted both
relays myself with the cost suppressed:

```
CLAUDE (cost absent) BOOTED: {... "model":"claude-fake-cli-model","maker":"Anthropic",
                              "usage":{"completion_tokens":5}, "choices":[...]}
GROK   handshakeCostUsd: null
GROK   (cost absent) BOOTED: {... "model":"grok-fake-cli-model","maker":"xAI",
                              "usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}, ...}
```

Both start, both serve, tokens survive, and **no `x_cost_usd` key is invented** — the
absent field is omitted, not zero-filled. Degrading further (cost absent *and* a non-object
`modelUsage`) yields `usage: null`, which I also confirmed. `handshakeCostUsd` widening to
`number | null` has exactly one consumer in the repo (its own test), so no caller breaks.

## Axis 2 — versioned derivation writes `relative_cost_cell` completely

I diffed the INSERT in `EvaluatorMeteringRepository.recordRelativeCostCells` column-by-column
against `migrations/0023_evaluator_foundation.sql`. All 16 columns are supplied
(`relative_cost_cell_id` defaults): every NOT NULL column — provider, model_id,
model_version, window_start, window_end, comparability, metered_call_count,
unmetered_call_count, source_unit_totals, normalization_basis, derivation_version,
derivation_input, derivation_hash, as_of, at_seq — plus the deliberately nullable
`relative_cost`. The CHECKs are respected by construction: `comparability='UNKNOWN'` iff
`relative_cost IS NULL`; the ratio is `mean / max(positive means)` so it can never exceed 1
or go negative; `derivation_hash` is a real SHA-256 hex digest of a canonicalized input;
`window_end > window_start` is asserted in code before the insert. The integration test
reads the complete row back under real PostgreSQL with strict `toEqual`, not a subset match
— that is the right shape of assertion and I re-ran it green.

`model_call_usage` likewise satisfies its two-armed CHECK: `assertObservedUsage` guarantees a
METERED row carries at least one observed value and non-null `raw_usage`, and the UNMETERED
arm writes all six usage columns null. Zero values are handled with `??`, not `||`, so an
observed `0` token count or `$0.00` survives as `0` rather than collapsing to null. Worker
INSERT grants for both tables exist in 0023 (lane 02), so the repository is runnable under
the real role, not just as superuser.

## Axis 3 — the paid-vs-local cross-unit case is genuine

Architecture §3.6 states the test explicitly: a local vLLM call with **more** tokens than a
paid call must still have relative external spend 0. The shipped unit test uses 50,000 local
tokens against a 10-token, $0.02 paid call. I ran my own variants to check the rule is
structural rather than fixture-tuned:

```
local 900,000 tokens, no paid peer   -> relativeCost 0, COMPARABLE, tokens retained (900000)
local 50k tok vs grok $0.02          -> local 0 / grok 1
cheap $0.01 vs dear $0.04            -> 0.25 / 1                      (real ratio arithmetic)
paid metered w/ cost + paid metered w/o cost -> UNKNOWN, no zero imputed
paid + one UNMETERED call            -> mean over metered only; unmetered surfaced separately
```

The mean divides by metered calls only, and only when **every** metered call in the group
carries an observed USD amount — so a missing amount is never silently treated as $0. Local
token totals are retained as utilization in `source_unit_totals.tokens` while contributing
nothing to spend: the requirement's "raw token totals MUST NOT rank a free local model as
more expensive" holds for the right reason. Mixed runtime classes inside one model identity
throw rather than average across bases. The derivation hash is stable under input reordering
(I checked), and version + basis are persisted on every row, so FR-6.2's "documented and
tested normalization basis" is met with the document (§3.6), the constant
(`relative-external-spend/v1`), and the tests all agreeing.

## Axis 4 — no estimation anywhere

I looked for imputation on every path and found none. Absent CLI fields are omitted from the
usage object, and an object that ends up empty becomes `null` in both adapters. `total_tokens`
is emitted only when both observed components exist and is their exact sum — a summation of
observed values, consistent with the DDL's own `total = prompt + completion` CHECK, not an
estimate. Codex is `usage: null` by construction, matching the findings' verdict that no
usage event is confirmed on its exec stream (session-file tailing correctly stays out of
scope). Malformed vendor usage fails closed to `null` rather than being partially salvaged.
`UNMETERED` rows contribute only to `unmetered_call_count`, and a paid path with tokens but
no vendor amount stays `UNKNOWN` — exactly the three-line honesty rule from findings §Rec 3.
No price table, no token-to-USD rate, no currency or billing surface anywhere in the diff.

## Axis 5 — no BOUND state, DR-179, no product behavior change, test honesty

- **No BOUND state**: the string does not appear; the only `bound:` occurrences are
  pre-existing per-call budget objects in test requests. No dispatch binding, no selector
  call site, no seat-share touch.
- **DR-179**: no API key, token, bearer header, or credential material in the diff. The
  gateway change adds no authorization header. Fixtures carry redacted values only.
- **No product behavior change**: the relay response gains one additive key that no
  consumer requires; `raw_artifact.metadata_json` gains a `usage` entry (jsonb, no
  migration, as the findings recommended). `RawArtifactInput.metadata` widening from
  scalars to `unknown` is not a loosening of the persistence boundary — the ledger's own
  `persistRawArtifact` already declared `Readonly<Record<string, unknown>>` and
  `JSON.stringify`s into a jsonb NOT NULL column; the providers type was the narrower
  outlier and now matches. Full suite, full acceptance suite, both audits and the contract
  generator inputs are unaffected.
- **Test honesty**: every number in the author's self-report reproduced on my machine. The
  RED→GREEN narrative matches the code. Two softness notes are in N3 and N4 below, but no
  test asserts something the code does not do, and no result is fabricated.

## Non-blocking findings

**N1 — the projection has no caller, and the classification it depends on is undelivered.**
`EvaluatorMeteringRepository.recordCall`, `recordRelativeCostCells` and
`deriveRelativeCostCellsV1` have **zero non-test callers** repo-wide. Nothing derives a
`ModelCallUsageInput` from a completed call: `runtimeClass`, `provider`, `modelId`,
`modelVersion`, `callSiteKey` and the `ledger_entry_id`/`raw_artifact_id` pairing are all
supplied by hand in the tests. Architecture §3.6 step 3 says "project it to one
`model_call_usage` row per completed call"; what shipped is the insert half. I do **not**
treat this as a blocker: §2.2 makes these writes worker-owned, the harvest task family that
would read `ledger.raw_artifact` for call usage (§2.1) belongs to lane 05, and wiring the
projection into the product gateway would have made the product path write evaluator rows
synchronously — a §2.4 / FR-0.1 isolation violation. But the middle link of the chain is
undelivered and must be named in lane 05's packet rather than assumed: specifically a pure
`metadata_json.usage + ledger_entry → ModelCallUsageInput` projector, a
`providerRef → PAID_REMOTE | LOCAL_VLLM` classifier (the evaluator already owns
`EVALUATOR_PROVIDER_REF` and the family reader, so this is cheap and belongs near them), and
idempotency — `recordCall` is a bare INSERT against a `UNIQUE ledger_entry_id`, so a
re-run of a projector will raise rather than no-op.

**N2 — no end-to-end proof that a relayed call's usage reaches the database.** The relay
tests stop at the HTTP response; the gateway test stubs `persistRawArtifact` and asserts on
the in-memory metadata; the integration test starts from hand-written literals. FR-6.1 AC1
("a completed call stores non-null usage inspectable per model identity") is therefore
satisfied by design and by two half-tests, but never observed once. The join is low-risk
(the ledger already jsonb-serializes whatever metadata it is given, and `raw_artifact`
carries provider/model_id/model_version columns), yet one integration test that drives the
real gateway at a relay and then reads `metadata_json->'usage'` back out of
`ledger.raw_artifact` would convert the lane's headline claim from inferred to observed.

**N3 — the integration test's name overstates what it proves.** It is titled "projects usage
and versioned relative cost into both evaluator metering tables", but it constructs the
projection input itself; nothing is projected. Rename it (or land N1's projector and let the
name become true).

**N4 — the no-fabrication assertion in the cost-absent tests is loose.** Both new relay
tests use `toMatchObject` on a nested `usage`, which passes even if an `x_cost_usd` were
invented alongside the observed tokens — i.e. the very property the test exists to defend is
not asserted. I verified empirically that no cost key is emitted, so this is an assertion
gap, not a defect; `toEqual` on `usage` (as the existing handshake test already does) would
close it.

**N5 — an observed paid mean of exactly $0 yields UNKNOWN, not 0.** Only *positive* means map
into (0,1], so a paid remote path that honestly reports `total_cost_usd: 0` is
`comparability='UNKNOWN'`. That matches §3.6's wording and is the conservative, honest read
(it refuses to declare a paid path free), but it is load-bearing: the claude CLI envelope can
report `0` on subscription usage — the repo's own fixture does — which would leave claude
perpetually UNKNOWN while grok ranks. Worth pinning as a ruled semantic in §3.6 (and a test)
rather than leaving it as an emergent property of `> 0`.

**N6 — a LOCAL_VLLM cell is `relative_cost=0, COMPARABLE` even with `metered_call_count=0`.**
I confirmed this by probe. It follows from §3.6's runtime-class fact (no vendor billing
endpoint ⇒ structurally zero marginal external spend) and is not an estimate, but it means a
COMPARABLE cost cell can rest on zero observations. Downstream seat-share (lane 10) should
read `metered_call_count` alongside `relative_cost`, not `relative_cost` alone.

**N7 — `CliUsage`'s all-optional shape admits an empty object.** An adapter returning
`usage: {}` would emit `"usage":{}` on the wire, persist `{}` in metadata, and then throw
`MODEL_CALL_USAGE_EMPTY` at record time — a METERED-shaped nothing. Both in-repo adapters
normalize `{}` to `null` (I checked), so this is currently unreachable; normalizing once in
`relay-core` would make it unreachable by construction for future adapters.

**N8 — float sums are computed in input order while the hash is over canonical order.** Two
runs over the same multiset in different orders produce the same `derivation_hash` but could
produce ULP-different `source_unit_totals`. Negligible in practice and shielded by the
table's uniqueness constraint; summing over the already-canonicalized input would make the
receipt exactly reproducible.

**N9 — claude's token capture is fixture-grounded, grok's is real-envelope-grounded.** Grok's
assertion rides the previously captured Grok Build 1.0.0 envelope replay; claude's rides a
hand-written fake using `output_tokens`. If the installed claude CLI reports its
`modelUsage` values under different key names, claude silently degrades to unmetered. The
failure mode is graceful and honest — which is why this is not a blocker — but the claim
"claude is metered" is only as good as that fixture, and one captured real envelope would
settle it.

**N10 — cosmetic.** The gateway's `usage` schema is `.passthrough()`, so arbitrary vendor
fields inside `usage` land verbatim in `metadata_json` (no new exposure: `raw_text` already
stores the whole body). And the self-report's handoff line reads
`codex/eval-eval-08-metering` — a doubled prefix, same typo class as the PROG-03 report.

## Recommendation to the orchestrator

Nothing from my seat blocks merge; the dual gate needs the other reviewer's verdict
alongside this one. Before lane 05 starts, hand it N1 explicitly — the projector, the
runtime-class classifier and projection idempotency are the unbuilt middle of this chain,
and lane 05 is where they belong. N2/N3/N4 are cheap enough to fold into either this lane or
lane 05 (one integration test plus two assertion tightenings). N5 wants a one-line ruling in
Architecture §3.6 so the zero-cost paid case is decided by the doc rather than by an
inequality. Rebase onto `dev` at merge time is a formality: the 4-commit gap is docs only.
