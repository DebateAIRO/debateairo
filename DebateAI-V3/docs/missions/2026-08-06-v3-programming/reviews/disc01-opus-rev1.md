# DISC-01 — Opus 5 lens, rev 1 (mutation testing + LIVE verification)

**Ticket:** `t_1589a6cc` · board `debateai-v3` · dual diamond, Opus lens.
**Subject:** the DR-181/DR-182 implementation (discovery-owned panels; the
M/envelope apparatus retired; computed structural tripwire; claim-time
probe-loss shrinking; mono disclosure + band cap; persistence identity CHECK).
**Delta:** `git diff 2fea51b` at `/Users/vladmihaimiron/Documents/DebateAIRO`
plus six untracked files.
**Basis read in full:** `reviews/dr181-architecture-plan.md`,
`reviews/dr181-grok-verdict.md` (ten binding conditions), ledger DR-181/DR-182,
`goal-packets/DISC-01-codex-goal.md`, `handoffs/DISC-01-codex-handoff.md`.

**Isolation (DR-163).** Every mutation, every gate and both live ceremonies ran
in `/private/tmp/disc01-opus-clone` (APFS clone of the parent root) and a second
pristine clone at `2fea51b` (`/private/tmp/disc01-opus-base`) used only for
before/after mutation comparison. The standing stack (PG 55432 / API 8790 /
shim 8791 / grok-relay 8792 / UI 3000) was never touched: it was observed
read-only with `lsof`/`ps` to learn the ceremony's boot command, and nothing was
started, stopped, migrated or written on it. Live ceremonies used side ports
55450/55451/55452, 8795, 8796, 8797 with freshly `mkdtemp`'d data directories,
deleted afterwards. Both clones are deleted at the end of this review.

---

## 0. VERDICT SUMMARY

The architecture landed. Discovery is real, the panel is an observed fact, the
DDL identity holds on real PostgreSQL, the tripwire is genuinely computed and
its live value is **exactly** the number an independent recomputation from the
call-site inventory produces, the M-apparatus is gone, and Grok's claim-time
mechanism fires live and is recorded. T1–T9 all re-verified red.

Four findings block.

| # | Finding | Class |
|---|---|---|
| **B4** | **A discovered panel of ONE crashes the live composition root** with a raw `TypeError` before the API listens (`acceptance/main.ts:319`, `additionalProviders[0]!.gateway` on an empty array). Reproduced live. DR-182(2) "MONO-PANEL DAYS SERVE" and DR-182(3) "high-stakes at M=1 serves with band cap" are therefore unreachable in production, and the refusal is untyped. Nothing in 622 tests sees it. | **BLOCKING** |
| **B1** | The codex/OpenAI leg is **ABSENT on every real boot**: `parseCodexCompletion` is written against an event shape the real `codex exec --json` does not emit. Live evidence below. The house that shipped this ticket is the house the ticket silently removed from the panel, and the handoff does not disclose it. | **BLOCKING** |
| **B2** | `tests/render/ux01-new-debate-form.test.tsx` was cut from 18 collected tests to 3. At least four **non-apparatus** load-bearing proofs died with it, and I have demonstrated each as a mutation that was RED at `2fea51b` and is GREEN across all 581 tests now: PROV-01 tier-source honesty, DR-166-A asker-relative owners *through the real page*, B6 as-of preservation, R3 `aria-controls`. The authorized plan §5 ruled R1 "SURVIVES INTACT" and R3 "SURVIVES, untouched"; Grok condition 9 authorized removing **R2 only**. | **BLOCKING** |
| **B3** | The live composition root `acceptance/main.ts` is essentially unpinned. Capping the discovered panel at 2 there, and computing the ask-time ceiling with attempt bound 1 instead of the register's 3, both survive all 622 tests (581 root + 41 acceptance). These are precisely the two properties DR-181(2) and DR-182(4) exist to make unrepresentable — and B4 is what walked into the gap. | **BLOCKING** |

Advisories A1–A10 follow in §7. None of them alone would hold the ticket.

**The shape of the failure is one shape, not four.** Every gate is green, every
pure function is pinned, every fixture passes on real PostgreSQL — and the two
things that break are the two things only a real boot can see. The engine is
right; the wire between the engine and the world was never run.

**VERDICT: BLOCKING** (full statement at the end of this file).

---

## 1. GATES (clone, real embedded PostgreSQL)

```text
$ cd /private/tmp/disc01-opus-clone/DebateAI-V3 && pnpm test
 Test Files  81 passed (81)
      Tests  581 passed (581)
   Duration  33.41s

$ pnpm typecheck
$ tsc --noEmit
(exit 0, no output)

$ pnpm lint
$ tsx tools/orphan-audit/src/cli.ts architecture
{ "edgeRowsChecked": 27, "violations": [] }
$ tsx tools/orphan-audit/src/cli.ts source
{ "blocking": [] }

$ pnpm vitest list | wc -l
581

$ pnpm vitest run --config acceptance/vitest.config.ts
 Test Files  10 passed (10)
      Tests  41 passed (41)
```

Every gate the handoff claims reproduces exactly, including the real
embedded-PostgreSQL integration tests that exercise migration `0022`. The
handoff's numbers are honest.

---

## 2. MUTATION TABLE

Method: exact-anchor source edit in the clone → named test(s) → restore →
`git diff` verified empty. "Full suite" = all 581 root tests; where the mutated
file lives under `acceptance/`, the 41-test acceptance suite was run as well.

### 2.1 The handoff's ledger, T1–T9 — all re-verified

| Pin | Mutation applied | Target | Result |
|---|---|---|---|
| **T1** | `discoverPanel` truncates its result to the first two targets | `dr181-discovery` | **RED** — 3 failed (panels of 3 and 4, and the dead-CLI case) |
| **T2** | `probeProvider` re-throws `CliRelayFailure` instead of recording ABSENT | `dr181-discovery` | **RED** — the ABSENT row loses its loud per-adapter code |
| **T3** | `parseCodexCompletion` returns a hardcoded `"gpt-5.6-sol"` (D1 resurrection) | `dr181-discovery`, `model-shim` | **RED** |
| **T4** | `RunRepository.startRun` binds a literal `2` instead of `jsonb_array_length($12::jsonb)` | `integration/database` (real PG) | **RED** — 24 failed; `run_panel_count_identity` rejects the insert |
| **T5** | freshness window multiplied ×1000 (never re-probe a stale record) | `dr181-discovery` | **RED** |
| **T5b** | freshness check forced false (re-probe every provider every ask) | `dr181-discovery` | **RED** — the spawn-count assertion fires |
| **T6a** | `applySingleLineageBandCap` returns the candidate band uncapped | `integration/database` (real PG) | **RED** — mono answer no longer `TEST_CAPPED_BAND` |
| **T6b** | mono `MONO_LINEAGE_DEPTH_NOT_EXPANDED` reason replaced by the pre-DR-182 string | `integration/database` (real PG) | **RED** |
| **T7** | `finalRetryTotal` forced to 0 (DR-174's final retry dropped from the ceiling) | `dr181-ceiling` | **RED** |
| **T7b** | `fixedSites` counts one compose round instead of `maxRecompose` (Set A's 12-attempt deficit re-introduced) | `dr181-ceiling` | **RED** |
| **T8** | `ENGINE_BRANCHING_FACTOR` drifts 2 → 3 | `dr181-ceiling` | **RED** |
| **T9** | `DR159_RATIFIED_MAKER_COUNT = 2` re-declared in the runner | `dr181-ceiling` | **RED** — the source sweep catches it |

The handoff's mutation ledger is accurate. Nothing in T1–T9 is overstated.

### 2.2 Independent hunting — beyond the ledger

| # | Mutation | Scope run | Result |
|---|---|---|---|
| **H1** | Resurrect a panel-size refusal in the runner under a **fresh symbol** (`if (configuredMakers.length > 2) throw RUN_PANEL_TOO_LARGE`) — the T9 source sweep cannot see it | full suite | **RED** — the real-PG three-maker rotation test kills it |
| **H2** | The live boot probe in `acceptance/main.ts` invents a model id (`modelId: "gpt-5.6-sol"` instead of `body.model`) | full + acceptance | **RED** (acceptance suite) |
| **H3** | Bypass the claim-time re-probe entirely and serve a phantom pinned member | full suite | **RED** — both DR-182(6) real-PG tests |
| **H4** | `readStructuralCeilingPolicyInputs` returns `judgeMaxAttempts: 1` instead of the register's `JUDGE.maxAttempts` | full suite | **GREEN — SURVIVED** |
| **H4b** | `computeStructuralCeilingBasis` evaluates every run at depth 1 | full suite | **RED** |
| **H4c** | The **live** ask-time ceiling in `acceptance/main.ts` is computed with `judgeMaxAttempts: 1, organMaxAttempts: 1` | full + acceptance | **GREEN — SURVIVED** |
| **H5** | The **live** discovered panel in `acceptance/main.ts` is truncated to 2 members | full + acceptance | **GREEN — SURVIVED** |
| **H6a** | `buildNewDebateAskConfig` always reports `tier_source: "MACHINE_DEFAULT"` (PROV-01) | full suite | **GREEN — SURVIVED** (RED at `2fea51b`) |
| **H6b** | `/new` stops using `deriveSessionAskDefaults().decisionOwner` and hardcodes `"asker:anonymous"` (DR-166-A) | full suite | **GREEN — SURVIVED** (RED at `2fea51b`, 2 tests) |
| **H6c** | Submit overwrites an asker-edited `as_of` (B6) | full suite | **GREEN — SURVIVED** (RED at `2fea51b`) |
| **H6d** | `aria-controls="additionalRunOptions"` is emitted while the panel does not exist (R3) | full suite | **GREEN — SURVIVED** (RED at `2fea51b`) |
| **H7** | `excludeHiddenSubtrees` renamed out of the call path (class-H / RESIL-01 composition) | full suite | **RED** — 22 failed, including both RESIL-01 rev2 R1 cases and T33 |

Six surviving mutations. H4/H4c/H5 are B3; H6a–H6d are B2.

---

## 3. INDEPENDENT CEILING RECOMPUTATION

I rebuilt the call-site inventory from the runner source rather than from the
plan or the test, and confirmed there is **no model-consuming call site outside
it** (`grep` for `callSiteKey:` across `apps/` and `packages/` returns only the
runner's own sites plus the ledger/provider plumbing that carries them).

**Inventory, per run:**

| Site family | Source | Count |
|---|---|---|
| `JUDGE` (primary root) | `:949`, `:956` | 1 |
| `JUDGE:root:secondary` | `:1211` (guarded `effectiveMakerCount > 1`) | 1 if M ≥ 2 |
| `JUDGE:root:${i}` | `:1236`, loop `i = 2 … M−1` | M−2 if M ≥ 3 |
| `JUDGE:${role}:root${r}:r${n}:p${p}` | `:1291`, one per `buildMultiMakerExpansionPlan` leg | M·(2^(d+1)−2), M ≥ 2 |
| `JUDGE:cross-root:${a}->${b}` | `:1327`, `buildCrossRootExchangePlan` | M(M−1), M ≥ 2 |
| `JUDGE:review:${nodeId}` | `:1361`, one per authored node, gated `> 1` at `:1358` | = authored, M ≥ 2 |
| `COMPOSER:${attempt}` | `:1718` | maxRecompose = 2 |
| `CONFORMANCE:${attempt}:${segment}` | `:1769` | maxRecompose × segmentCap = 4 |
| `POST_COMPOSE_R9:${attempt}` | `:1791` | maxRecompose = 2 |

so `authored(M,d) = M·(2^(d+1)−1) + M(M−1)` for M ≥ 2, `authored(1,d) = 1`;
`fixedSites = maxRecompose · (1 + segmentCap + 1) = 8`.

**Per-site bound.** `createPostgresProviderGateway` (`:2007–2023`) counts
attempts on `(runId, workItemId, contractHash, callSiteKey)` and clamps through
`remainingProviderAttempts` to `CALL_BUDGET_EXHAUSTED`. So each key is worth at
most `A = 3` (`acceptanceOrganCostBounds.*.maxAttempts`).

**DR-174 final retry.** `withCooldownRetry` (`:178–257`) verified line by line:
the retry call is `input.attempt(baseMaxAttempts + policy.finalRetryAttempts)` =
`attempt(4)`, and the gateway subtracts the 3 already consumed, so a held site
gets exactly **one** extra attempt. `holds >= maxCooldownHoldsPerRun` is checked
**before** recording, so exactly 2 holds are ever granted. Run-wide surplus is
therefore `2 × 1 = 2`, not per-site — the formula's `finalRetryTotal` is right.

**Therefore** `ceiling(M,d) = (authored + reviews)·3 + 8·3 + 2`.

| M \ d | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| **1** | 29 | 29 | 29 | 29 | 29 |
| **2** | **74** | 122 | 218 | 410 | 794 |
| **3** | 116 | 188 | 332 | 620 | 1196 |

**Dominance holds** by construction: every model attempt a lawful run can make
is charged to exactly one of the enumerated keys, each key is clamped at 3, and
the only attempts beyond a key's clamp are the 2 run-wide final retries — all
three terms are in the sum. The shipped `computeStructuralCeilingBasis`
reproduces this table (verified against `dr181-ceiling.test.ts`'s enumeration
from real plan objects, and against the live `envelope_basis` below).

**Live confirmation.** The depth-1, panel-2 run pinned
`"max_model_attempts": 74` — my independently computed `ceiling(2,1)`. The
formula and its shipped wiring agree today.

**Two qualifications, recorded honestly.**

1. `dr181-ceiling.test.ts` is only *partly* independent: `authored` genuinely
   comes from the engine's plan objects, but the attempt multipliers (`3`, `3`,
   `2`) are literals duplicated on both sides of the comparison. That is why H4
   and H4c survive — the formula's **inputs** are unpinned even though the
   formula is not (see B3).
2. The ceiling assumes **one work item per run**. The per-site key includes
   `workItemId`; a run with a second work item would get a fresh 3-attempt
   budget per key. This is the runaway class the tripwire is meant to see, and
   it is strictly better than the retired Set A on this axis (74 > 60), so it is
   not a regression — recorded as an observation only.

**Set A's 14-attempt shortfall independently confirmed:** Set A = `6·authored +
12`; lawful = `6·authored + 26`. Deficit 14 = 12 (recompose counted once) + 2
(DR-174 never folded in). The plan and Grok's verdict are correct.

---

## 4. LIVE VERIFICATION

Throwaway ceremony, side ports only, fresh `mkdtemp` data directory, boot
command copied from the standing stack's own argv with the ports changed:

```text
ACCEPTANCE_DB_PORT=55450 ACCEPTANCE_API_HOST=127.0.0.1 ACCEPTANCE_API_PORT=8795 \
ACCEPTANCE_SHIM_PORT=8796 ACCEPTANCE_GROK_RELAY_PORT=8797 \
ACCEPTANCE_STRANGER_SAMPLE_RATE=1 ACCEPTANCE_BATTERY_VERSION=acceptance-v1 \
ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:standing-watch \
./node_modules/.bin/tsx acceptance/opus-disc01-live-proof.ts
```

### 4.1 (a) Boot performs discovery — and finds TWO houses, not three

`core.provider_probe`, verbatim from the throwaway database:

```json
[
 { "provider_ref": "acceptance:codex-cli",  "maker": "OpenAI",
   "state": "ABSENT",  "model_id": null,
   "failure_code": "CODEX_CLI_MODEL_UNRESOLVED",
   "probed_at": "2026-08-14T15:19:21.977Z" },
 { "provider_ref": "acceptance:claude-cli", "maker": "Anthropic",
   "state": "HEALTHY", "model_id": "claude-opus-5",   "failure_code": null,
   "probed_at": "2026-08-14T15:19:21.980Z" },
 { "provider_ref": "acceptance:grok-cli",   "maker": "xAI",
   "state": "HEALTHY", "model_id": "grok-4.6-build",  "failure_code": null,
   "probed_at": "2026-08-14T15:19:21.980Z" },
 { "provider_ref": "acceptance:claude-cli", "maker": "Anthropic",
   "state": "HEALTHY", "model_id": "claude-opus-5",   "failure_code": null,
   "probed_at": "2026-08-14T15:19:27.322Z" },
 { "provider_ref": "acceptance:grok-cli",   "maker": "xAI",
   "state": "HEALTHY", "model_id": "grok-4.6-build",  "failure_code": null,
   "probed_at": "2026-08-14T15:19:35.104Z" }
]
```

**What this proves, positively:**

- Discovery is real. Rows 2 and 3 carry **CLI-reported** model ids —
  `claude-opus-5` and `grok-4.6-build` — not literals. DR-115 satisfied for the
  two houses that answered.
- Rows 4 and 5 are the **claim-time re-probes** (DR-182(6), Grok's ruled
  mechanism) firing in production, 5.3 s and 13.1 s after boot, each a real CLI
  round trip, each recorded as evidence.
- One provider that cannot answer costs **one member, not the debate** —
  DR-181(2)'s central promise, observed live at zero model spend for the absent
  provider.

**What this proves, negatively — FINDING B1.** Row 1 is the OpenAI house, and it
is absent on **every** boot, on a machine where the codex CLI is installed,
authenticated and working. I ran the shipped invocation by hand:

```text
$ /Applications/ChatGPT.app/Contents/Resources/codex exec --json "Reply with the single word: OK"
{"type":"thread.started","thread_id":"01a000e7-3ea0-7f91-b166-7104741ef333"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"OK"}}
{"type":"turn.completed","usage":{"input_tokens":15490, ... }}
```

**No event carries a `model` field.** `parseCodexCompletion`
(`acceptance/model-shim.ts`) collects `event.model` across the event stream and
throws `CliRelayFailure("FAILED", "CODEX_CLI_MODEL_UNRESOLVED")` when the count
is not exactly 1 — which is always 0 here. The unit fixture in
`tests/unit/dr181-discovery.test.ts:111` asserts against
`{"type":"turn.started","model":"gpt-fixture"}`, an event shape the real CLI
does not emit. The parser and its pin were written against an imagined CLI
contract and never run against the real one.

Consequences:

1. **A live, healthy, authenticated maker is recorded ABSENT.** That is the same
   DR-115 class the ticket was fired to close, pointing the other way: the
   system's record of the world is false.
2. The ticket **removes a working house from every future debate**. Before
   DISC-01 the codex leg served (with a hardcoded id — the D1 soft spot). After
   DISC-01 it never serves. V's three-house machine is a two-house machine, and
   nothing on the answer says so beyond a probe row nobody reads.
3. The handoff states the shim "accepts exactly one CLI-reported model ID". It
   is more accurate to say it accepts none. The plan's own D1 clause is explicit
   about the correct disposition here: *"If the codex CLI's output shape cannot
   yield an unambiguous id, that is a finding for V, not a licence for the
   literal."* The finding was never raised.

I make no proposal about the fix (a different flag, a `codex --version`-class
side channel, or V's ruling that OpenAI simply cannot self-report today). The
blocking part is that the ticket shipped an unverified transport claim and lost
a maker without disclosing it.

### 4.2 (b) A bare ask admits with the discovered panel and a computed ceiling

The wire no longer accepts a count: `agent_count` is gone from
`AskRequestSchema` (`packages/contract/src/index.ts:114`), from
`parseAcceptanceArguments`' supported-argument set, and from both `/new`
surfaces. The ask submitted here carried only question, risk, budget,
depth-params and the four owner/scope/as-of machine fields.

`core.run`, verbatim:

```json
{
 "run_id": "cd3cfa96-d719-4110-9775-255004e29fec",
 "agent_count": 2,
 "panel_len": 2,
 "discovered_panel": [
  { "maker": "Anthropic", "model_id": "claude-opus-5",
    "provider_ref": "acceptance:claude-cli",
    "probe_evidence_ref": "3aa2b28b-a5ad-4b17-8116-c31ce677c898",
    "probed_at": "2026-08-14T15:19:21.980Z" },
  { "maker": "xAI", "model_id": "grok-4.6-build",
    "provider_ref": "acceptance:grok-cli",
    "probe_evidence_ref": "c46946e2-6407-44b2-b51d-d47209a868aa",
    "probed_at": "2026-08-14T15:19:21.980Z" }
 ],
 "depth_params": { "depth": 1 },
 "envelope_basis": {
  "kind": "COMPUTED_STRUCTURAL_CEILING",
  "max_model_attempts": 74,
  "panel_size": 2,
  "depth": 1,
  "per_site_attempts": { "judge": 3, "organ": 3 },
  "hold_cap": 2,
  "final_retry_attempts": 1,
  "formula_version": "DR-181-v1",
  "bounds_source_ref": "engine-exports+register"
 }
}
```

`agent_count == jsonb_array_length(discovered_panel) == 2` on a real
PostgreSQL row governed by `run_panel_count_identity`. Every panel member cites
its probe evidence. The ceiling is **74** — the exact value of my independent
`ceiling(2,1)`, with the register's real `judge: 3 / organ: 3` bounds and
DR-174's `hold_cap: 2 / final_retry_attempts: 1` folded in. The shipped wiring
is correct today; B3 is that nothing keeps it correct.

### 4.3 (c) The live debate — served, two houses

The run completed and served. Verbatim:

```json
{
 "runId": "cd3cfa96-d719-4110-9775-255004e29fec",
 "answerId": "c4c1cf0c-a185-4930-8cc9-06511ddad6a4",
 "elapsedSeconds": 1043,
 "modelCallCount": 16,
 "rootCount": 2,
 "rootMakers": [
  "Anthropic/claude-opus-5/acceptance:claude-cli",
  "xAI/grok-4.6-build/acceptance:grok-cli"
 ],
 "fairDebate": { "nodeCount": 8, "attackEdgeCount": 4,
                 "distinctMakers": ["Anthropic","xAI"],
                 "independentAttackEdgeCount": 4 }
}
```

**Cross-house review rotation, every authored node, verbatim:**

| node | author | reviewer | reviewer model | outcome |
|---|---|---|---|---|
| 62002513 | Anthropic | xAI | grok-4.6-build | dispute |
| fffb990c | xAI | Anthropic | claude-opus-5 | agree |
| e33e8455 | xAI | Anthropic | claude-opus-5 | dispute |
| 730360fc | xAI | Anthropic | claude-opus-5 | dispute |
| 186ad675 | Anthropic | xAI | grok-4.6-build | dispute |
| e8372302 | Anthropic | xAI | grok-4.6-build | dispute |
| 2d957635 | Anthropic | xAI | grok-4.6-build | dispute |
| f371c5c8 | xAI | Anthropic | claude-opus-5 | agree |

Eight authored nodes, eight reviews, **no node reviewed by its own house** —
DR-165(3) satisfied on real transport, with the reviewer's own CLI-reported
model id on every row. Four independent attack edges (cross-house), so
DR-140(b)'s fair-debate gate passes on independence, not merely on count.

**Spend against the ceiling.** All 16 `MODEL_CALL` ledger rows, one attempt
each, zero retries, zero cooldown holds:

```text
JUDGE                                    1     JUDGE:review:186ad675…   1
JUDGE:root:secondary                     1     JUDGE:review:2d957635…   1
JUDGE:defender:root0:r1:p0               1     JUDGE:review:62002513…   1
JUDGE:critic:root0:r1:p0                 1     JUDGE:review:730360fc…   1
JUDGE:defender:root1:r1:p1               1     JUDGE:review:e33e8455…   1
JUDGE:critic:root1:r1:p1                 1     JUDGE:review:e8372302…   1
JUDGE:cross-root:0->1                    1     JUDGE:review:f371c5c8…   1
JUDGE:cross-root:1->0                    1     JUDGE:review:fffb990c…   1
```

16 of a pinned 74. The tripwire sits at roughly 4.6× the observed healthy spend
at this panel and depth — comfortably incapable of refusing a normal run, which
is DR-182(4)'s requirement, observed rather than argued. The observed judge-site
count (16) is exactly the `authored + reviews = 8 + 8` my §3 inventory predicts
for M=2, d=1.

**The honest shortfall against the goal.** This is **not** the first three-house
debate. It is the second two-house debate, with a different second house
(xAI in place of OpenAI). The three-house debate did not happen because the
OpenAI leg is ABSENT — finding **B1**. Every structural property the goal asked
me to check at three houses I could only check at two live; the M=3 and M=4
properties rest on the real-PostgreSQL fixture tests (`wires the latest
persisted reviewer into three-maker rotation on real PostgreSQL`,
`dr181-discovery` panels of 3 and 4) and on mutation H1, which confirms a
resurrected M>2 refusal is caught.

**One observation for the honesty surface.** Only `JUDGE`-family call sites
appear under `action_kind='MODEL_CALL'`; the composition organs
(`COMPOSER:*`, `CONFORMANCE:*`, `POST_COMPOSE_R9:*`) do not, even though the
answer was composed and served. `modelCallCount` (16) equals the judge rows
exactly. The ceiling budgets 24 attempts for those fixed organs, so the error is
in the safe direction and it predates DISC-01 — but it means `consumed_model_attempts`
understates the completions a run actually burned. Recorded as advisory A9.

### 4.4 (d) Panel loss without a run — and a hard crash on a mono panel

**Boundary, disclosed honestly first.** The goal asked for a second admission
with a killed relay and **zero model spend**, "admission-layer only if the design
permits". The design does not permit it as posed: after boot the probe records
are seconds old, so `resolveDiscoveredPanel` reuses them without re-probing
(correct per DR-182(1)), and the ruled shrink for a member lost after admission
happens at **claim** time inside the run (DR-182(6)), not at admission. There is
no shipped entry point that admits an ask and stops before dispatch. So I tested
the loss at the **boot** layer instead, which is where it is reachable at zero
model spend, and it produced something worse than the goal anticipated.

**Setup.** Occupy `ACCEPTANCE_GROK_RELAY_PORT` (8797) with a plain TCP listener
before boot, so `startGrokRelay` cannot bind. Ask: **high-stakes, depth 4** —
chosen to exercise DR-182(2) and DR-182(3) together. The codex leg is already
absent for the reason in §4.1. Expected discovered panel: **1** (Anthropic).

**Result — the ceremony crashed before the API ever listened:**

```text
OCCUPIED grok relay port 8797 before boot
=== MONO CEREMONY THREW ===
TypeError: Cannot read properties of undefined (reading 'gateway')
```

```json
--- provider_probe ---
[ { "provider_ref": "acceptance:codex-cli", "maker": "OpenAI",
    "state": "ABSENT", "failure_code": "CODEX_CLI_MODEL_UNRESOLVED" },
  { "provider_ref": "acceptance:grok-cli",  "maker": "xAI",
    "state": "ABSENT",
    "failure_code": "listen EADDRINUSE: address already in use 127.0.0.1:8797" } ]
--- run head ---      []
--- model spend ---   []
--- nodes ---         [ { "nodes": 0 } ]
```

**FINDING B4 — a discovered panel of one cannot boot.**
`acceptance/main.ts:318–322`:

```ts
    critique: {
      provider: additionalProviders[0]!.gateway,
      providerRef: additionalProviders[0]!.providerRef,
      maker: additionalProviders[0]!.maker
    },
```

`additionalProviders` is `discoveredProviders.slice(1)`. With one healthy
provider it is `[]`, and the unconditional non-null assertion throws a **raw
`TypeError`** during runtime composition — before the API listens, before any
ask, before any model call.

Why this is blocking:

1. **DR-182(2) — "MONO-PANEL DAYS SERVE" — does not work.** The runner's mono
   path is correct and well pinned on real PostgreSQL (T6a/T6b kill both the
   band cap and the depth disclosure), but the live composition root cannot
   build a runner for a one-member panel, so that path is unreachable in
   production. V's ruling is implemented in the engine and defeated at the wire.
2. **DR-182(3) — high-stakes at M=1 serves with band cap — is likewise
   unreachable live**, for the same reason. My ask was high-stakes precisely to
   test it and never got as far as admission.
3. **DR-181(2) is violated at its strictest reading.** A lawful debate — one
   healthy model, casual or standard or high-stakes — is refused because of
   panel size. It is not refused by a guard anybody can find; it is refused by an
   index-out-of-range.
4. **The failure is untyped.** `TypeError: Cannot read properties of undefined`
   names no law, carries no code, offers no lift path. The rewrite replaced two
   loud typed throws (`ACCEPTANCE_PRIMARY_PROVIDER_UNRESOLVED`,
   `ACCEPTANCE_PROVIDER_RELAY_UNRESOLVED` — the D3 defect) with a silent `!`.
5. **DISC-01 is the ticket that makes this reachable.** Before DR-181, a panel of
   one on this machine was not an ordinary production state; DR-181 makes it the
   normal consequence of two CLIs being unavailable, and DR-182(2) is V's ruling
   about it.
6. **Nothing in 622 tests sees it.** No test constructs
   `createAcceptanceRuntime` with a single relay. This is B3's abstract finding
   made concrete: the live composition root is unpinned, and the first thing that
   walked into the gap was V's own ruling.

**What (d) did nonetheless prove, positively:** boot-layer discovery loss is
recorded as ABSENT evidence with a real failure reason, at **zero model spend**
(`model spend: []`, `nodes: 0`, no run head) — the absent providers cost
nothing, which is the property the goal asked me to observe. And the claim-time
instant re-probe with its recorded evidence is proven live in §4.1 (probe rows 4
and 5) and by fixture on real PostgreSQL (mutation H3).

---

## 5. SUITE-SHRINK AUDIT (589 → 581)

Per-file collected-test delta, from `pnpm vitest list` on both clones:

| File | 2fea51b | DISC-01 | Δ | Justified by apparatus death? |
|---|---|---|---|---|
| `tests/unit/dr181-discovery.test.ts` | 0 | 7 | **+7** | new |
| `tests/unit/dr181-ceiling.test.ts` | 0 | 3 | **+3** | new |
| `tests/integration/database.test.ts` | 57 | 58 | **+1** | new: T4 identity + two DR-182(6) claim-gap cases |
| `tests/unit/v2ui-data-layer.test.ts` | 58 | 55 | **−3** | **YES** — all three tested `runCostEnvelopeFromDeployment` / `selectRunCostEnvelopeMember(s)`, whose subjects are deleted |
| `tests/unit/pol01-policy.test.ts` | 9 | 8 | **−1** | **YES** — tested `runCostEnvelopeFromDeployment`'s absent-vs-NULL policy distinction; subject deleted (see A6) |
| `tests/render/ux01-new-debate-form.test.tsx` | 18 | 3 | **−15** | **NO — see B2** |
| **Total** | **589** | **581** | **−8** | |

Re-pins done correctly and worth naming: `xrev01-node-review.test.ts` moves both
mutation kills (delete-the-bound → depth 6 passes; narrow-the-bound → depth 3
throws) onto `resolveExpansionDepth`, exactly as the plan §4 required;
`pro01-runner-tree.test.ts` replaces the retired `assertRatifiedMakerCount`
guard with an N-genericity assertion on the plan builders at M=4.

### B2 in detail

Of the fifteen removed `ux01` tests, five are lawfully apparatus-bound
(`ASK-01 RED + mutations: caps configured makers at the ratified guard source`,
`M7` — which is Grok condition 9's authorized R2 removal — `ASK-01 live
regression: configured=3 and ratified=2`, and the two `B2/B5` cases whose
subjects were `deriveAgentCountDefault` / the envelope). Ten are not. Four of
those ten I have demonstrated as live coverage loss, by applying the same
mutation to both clones:

| Mutation | at `2fea51b` | at DISC-01 |
|---|---|---|
| `buildNewDebateAskConfig` always emits `tier_source: "MACHINE_DEFAULT"` | **1 failed** / 17 passed | **581 passed** |
| `/new` hardcodes `"asker:anonymous"` instead of `deriveSessionAskDefaults().decisionOwner` | **2 failed** / 16 passed | **581 passed** |
| submit overwrites an asker-edited `as_of` | **1 failed** / 17 passed | **581 passed** |
| `aria-controls` emitted while its panel does not exist | **1 failed** / 17 passed | **581 passed** |

None of these four has anything to do with the M-apparatus, the envelope, or
`agent_count`. They are PROV-01 provenance honesty, DR-166-A asker-relative
ownership proven *through the real rendered page*, B6 as-of preservation, and
the R3 a11y pin. The first is the proof ASK-01 rev2 was BLOCKED on by both
lenses and had only just restored; the authorized plan §5 states it "SURVIVES
INTACT", and the R3 row states "SURVIVES, untouched".

The structural cause is that the replacement file no longer renders anything:
it is three pure-function/source-grep assertions with no `@testing-library`
render and no real submit. `tests/render/` now contains **no DOM-level proof of
the `/new` surface at all**, so DR-180's "machine controls are never rendered"
survives only as a source `grep` in `v2ui-pages.test.ts` — and that grep asserts
the machine field names are *present* in the page source, which is the opposite
polarity from "absent from the DOM".

This is the DR-159 hazard the ledger names verbatim (*"the guard is correct but
deleting it leaves the whole suite green"*), applied to four guards at once.

**Remedy that would clear B2:** restore the ux01 render tests minus R2 and minus
the five apparatus-bound cases, with `agentCount` kept in the machine-field
absence loop (where its absence is now structural rather than conditional), plus
the plan's own strengthening — assert the submitted payload carries no
`agent_count` key.

---

## 6. GROK'S TEN BINDING CONDITIONS

| # | Condition | Status |
|---|---|---|
| 1 | No invented VROW values | **MET.** All six ruled by DR-182. `panelDiscoveryPolicy` seeded `probe_freshness_ms: 600_000`, `probe_max_attempts: 1`, `source_ref: acceptance:DR-182:V-approved`. The band cap is **derived**, not invented: `applySingleLineageBandCap` takes the index below the candidate in the ruled `bandCeiling.value.bandOrder` (`["CAPPED","FULL"]`), so `FULL → CAPPED`; it throws `CRITIC_UNAVAILABLE_BAND_CAP_UNRESOLVED` rather than picking when no lower band exists. Provenance traces to the `bandCeiling` register row, whose own `cuts[0].ceilingBand` is also `CAPPED`. No literal, no typed question owed. **Caveat: correct in the engine, unreachable in production — see B4.** |
| 2 | D1 dead before discovery ships | **MET IN LETTER, FAILED IN FACT — B1.** The literal is gone and the handshake is real; the handshake never succeeds against the real CLI. |
| 3 | `RUN_MAKER_CONFIGURATION_MISMATCH` + `slice(0, agentCount)` cannot survive | **MET.** Both gone; gateways resolve by `providerRef`; only the read-side `agentCount` FACT survives in `readFrozenHead`/`schema.ts`, as ruled. |
| 4 | Identity CHECK **and** write-side derivation in one commit | **MET.** `migrations/0022` + `jsonb_array_length($12::jsonb)` in the same change set; `StartRunInput` has no `agentCount`. Verified live and by mutation T4. |
| 5 | T7/T8/T9 ship with the retirement | **MET, with the gap at B3** — the formula is pinned, its inputs are not. |
| 6 | Harness touch-list completed in the same ticket | **PARTIAL — A2.** `acceptance/panel01-depth1-proof.ts:21` still refuses any panel that is not exactly 2 roots, and both it and `xrev01-depth1-proof.ts:27` still assert the retired `> 42` Set-A bound. Neither is in a vitest suite, so nothing catches it. |
| 7 | `claimMs` must not shrink | **MET, improved.** `claimMs` now = `longestDeadline × ceiling(configuredProviders, depth 5) + cooldownMs × maxCooldownHoldsPerRun`. At three configured providers that is 1196 attempts vs the retired table's 780, and the hold term is new — the old claim did not cover two 10-minute holds at all. |
| 8 | No keys, no evaluator, no Hatchet parity theatre | **MET.** `apps/runner/src/main.ts` untouched; no key material anywhere; no selection logic. |
| 9 | ASK-01 rev2 sequencing — remove **R2 only** | **VIOLATED — B2.** R1 and R3 were removed with it, plus eight further proofs. |
| 10 | VROW-5 implementer rule | **MET.** V ruled it; Grok's mechanism (one instant probe, no hold, ABSENT with evidence, shrink with disclosure, serve remainder, empty panel = `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM`) is what shipped, and it fires live. |

---

## 7. ADVISORIES

**A1 — probe spend is real and undisclosed.** Every discovery probe is a real
CLI completion. A single depth-1 ceremony on a three-provider machine burns 3 at
boot, up to 3 more at ask time when records are stale, and 3 more at claim
time — none of them written to `ledger.ledger_entry` as `MODEL_CALL`, so none
counted by `countRunModelAttempts` or shown in the answer's
`consumed_model_attempts`. The live run shows two claim-time probes costing 5.3 s
and 13.1 s of wall clock. The number V sees understates the completions the
machine actually burned. Recorded in `core.provider_probe`, so it is
*recoverable*, but it is not *disclosed*. Worth a ledger row.

**A2 — stale proof scripts.** See condition 6 above.

**A3 — `acceptance/discovery.ts` is dead in shipped source.** The plan's central
new module (`probeProvider`, `discoverPanel`, `resolveFreshDiscovery`) is
imported by exactly one file: `tests/unit/dr181-discovery.test.ts`. The live path
uses a separate hand-rolled `probeRelay()` in `acceptance/main.ts` that HTTP-POSTs
the relay instead of invoking the CLI adapter. So T1/T2/T5 pin a module the
product never calls — which is the mechanical reason H5 survives. The
`orphan-audit` source rules do not scan `acceptance/`, so nothing flags it.
Either wire the live root through `discovery.ts` or move the pins onto
`probeRelay`.

**A4 — duplicate condition mark.** When a run is mono **because** of a
claim-time loss, `CRITIQUE-UNAVAILABLE` is pushed both by `monoMakerConditionMarks`
and by `hiddenConditionMarks` (`apps/runner/src/index.ts:1516–1524`), and
`buildFactBundle` does not de-duplicate. The answer's `condition_marks` array
carries the mark twice. Cosmetic, but it is on the honesty surface.

**A5 — `NOT VALID` is the right call, with one named consequence.** Scrutinised
as the handoff asked. `NOT VALID` is enforced on INSERT and UPDATE and only
skips the back-scan of existing rows; since `core.run` already refuses UPDATE
and DELETE outright (FX-DB-01a/01b), the constraint is effectively total for
every writable path, and new rows cannot drift. The honest consequence is that a
legacy run written before `0022` carries `discovered_panel = '[]'` with a
non-zero `agent_count`; if such a run still has an unclaimed work item when the
migration lands, the runner will stop it with
`RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM`. That is loud, not silent, and therefore
lawful — but V should know that migrating the standing database can strand an
in-flight debate.

**A6 — a rider lost with a justified deletion.** `pol01-policy.test.ts`'s removed
case also carried the "absent policy vs present-NULL policy" distinction
(`RISK_TIER_POLICY_INVALID`). The envelope half is dead; the risk half now has no
pin in that file.

**A7 — engine constants evade the numeric-literal lint by accident.**
`auditSourceRules` blocks `export const NAME = <number>;` in `packages/`,
`apps/`, `tools/`. `export const ENGINE_BRANCHING_FACTOR = 2 as const;` does not
match the pattern because of `as const`. The plan §8 deliberately and correctly
argues these are code facts rather than register rows, and Grok authorized it —
but the exemption is currently accidental rather than declared. Worth a comment
naming the exemption so a later reader does not "fix" it into a register row.

**A9 — composition organs are missing from the MODEL_CALL ledger.** See §4.3.
Pre-existing, safe direction, but `consumed_model_attempts` understates real
spend and the ceiling's 24-attempt fixed-organ term is currently unexercised.

**A10 — a raw system message is stored as a typed failure code.**
`run-acceptance.ts` writes `result.reason.message` straight into
`provider_probe.failure_code`; the live mono boot recorded
`"listen EADDRINUSE: address already in use 127.0.0.1:8797"`. The DDL only
requires non-empty text so it is lawful, and it is genuinely informative — but
the plan's design was loud **typed** codes (`GROK_CLI_FAILED`,
`CLAIM_GATEWAY_UNRESOLVED`), and a free-text column will not stay greppable.

**A8 — the production API root never probes.** `apps/api/src/main.ts`'s
`resolveDiscoveredPanel` only *reads* `provider_probe` rows and filters by
freshness; it never re-probes. On that path an empty or stale probe table
refuses every ask with `MAKER_INVENTORY_UNSATISFIED` — a staleness-driven
refusal, which is what T5 exists to forbid. The path is the known-dead Hatchet
composition (the plan §1.4 drew that boundary deliberately and §6.3 keeps it out
of scope), so this is advisory, not blocking — but it should not be allowed to
come to life in that shape.

---

## 8. WHAT IS RIGHT — recorded so the blockers are read in proportion

- The panel is genuinely an observed fact with per-member evidence, on real
  PostgreSQL, verified live.
- The DDL identity is the strongest part of the ticket: it makes a second maker
  count unrepresentable rather than merely discouraged, and T4 proves the
  database — not discipline — is what enforces it.
- The tripwire is computed, its live value is exactly right, and it is no longer
  ratified, no longer user-visible, and no longer able to refuse a lawful run
  from a frozen table's drift.
- Grok's claim-time mechanism is implemented as ruled, fires live, records its
  evidence outside any transaction (so the evidence survives the empty-panel
  throw), and never sleeps ten minutes waiting for a gateway that was never
  wired.
- The mono path derives its band cap from a ruled register row and refuses
  loudly rather than inventing when no lower band exists — the one place the
  goal packet warned an invented literal would be blocking, and it is clean.
  (The engine is right; B4 is that the wire cannot reach it.)
- RESIL-01 / DR-176 class-H composition is untouched and heavily pinned (H7
  killed 22 tests).
- The M-apparatus is gone, including the second, never-inventoried refusal at
  `RUN_MAKER_CONFIGURATION_MISMATCH`.

---

## 9. WHAT WOULD CLEAR THIS REVIEW

0. **B4** — make `acceptance/main.ts` compose a runner for a panel of one:
   `critique` becomes optional (the runner already treats it as optional —
   `settings.critique === undefined` is handled at construction), and every
   remaining discovered member goes to `additionalMakers`. Pin it with a
   composition test that builds the runtime from **one** relay and asserts the
   mono marks, the `CAPPED` band and `MONO_LINEAGE_DEPTH_NOT_EXPANDED` on the
   served answer. Any residual impossibility must be a typed domain error, never
   an index assertion.
1. **B1** — run the shipped codex handshake against the real CLI, and either
   make it yield the CLI's own model id or surface the impossibility to V as the
   plan's D1 clause requires. Replace the fabricated `turn.started`+`model`
   fixture with the CLI's actual event stream. Whatever the outcome, the loss of
   the OpenAI house must be stated in the handoff, not discovered by a reviewer.
2. **B2** — restore the ten non-apparatus `ux01` proofs (R1, R3, the four
   MUTATION owner/scope/as-of cases, the DR-180 DOM-absence case, B5, B6, and the
   five-machine-field case), removing only R2 and the apparatus-bound cases.
3. **B3** — pin the live composition root: assert that `acceptance/main.ts`
   feeds `computeStructuralCeilingBasis` the register's own `JUDGE` /
   `COMPOSER` / `CONFORMANCE` bounds and death policy, and that its
   `resolveDiscoveredPanel` returns every healthy provider it finds. The house
   precedent is `acceptance/runtime-policy.test.ts:74–90`, which already asserts
   against `main.ts` source; a fixture-driven test over the composed resolver
   would be stronger.

---

**VERDICT: BLOCKING**
