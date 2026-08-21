# ENV-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_40b756e7` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-12  
**Review packet:** `docs/missions/2026-08-06-v3-programming/reviews/ENV-01-review-packet.md`  
**Law:** `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` · **DR-159**  
**Worker handoff (evidence only):** `docs/missions/2026-08-06-v3-programming/handoffs/ENV-01-codex-handoff.md`  
**Mode:** read-only. Product / acceptance / ledger sources not edited. Did not read any peer (Opus) ENV-01 verdict. Orchestrator gates cited as already green (root `tsc` clean · v2-ui `tsc` clean · root vitest 62/434 · acceptance vitest 9/35 · architecture 27/0 · source 0 blocking) — **not re-run**. Standing API on `:8790` was **not** treated as seed proof.

## Verdict

**APPROVED**

Nothing found **BLOCKING**. V's DR-159 envelope is seeded byte-faithfully; the seed test fails on partial/drifted members rather than only pinning a happy shape; runtime-policy is shape-validating without re-pinning member count or the ceiling integers; A-1 is enforced as a typed loud failure with a test that drives the shipped parser; A-2 is recorded with a concrete fix proposal (ticket minimum); live proof is internally consistent and does not claim depth expansion. Residual notes are **ADVISORY** only.

---

## Packet checklist

| # | Topic | Judgment | Evidence |
|---|---|---|---|
| 1 | Byte-fidelity to DR-159 | **PASS** | Ten members; integers 42/66/114/210/402; both reachable tiers; no `casual`; provenance `acceptance:DR-159:V-approved` |
| 2 | Closure assertion fails on partial/drifted seed | **PASS** | Equality pin + closed depth×tier key set + explicit no-casual; each named defect class fails |
| 3 | Runtime-policy unpin (shape, no count/integer re-pin) | **PASS** | `z.array(...).min(1)` + positive int attempts; no `z.tuple`, no `42`/`402`/`10` hardcode |
| 4 | A-1 two-segment cap (hard disposition) | **PASS** | Enforced `.max(2, …)` → `COMPOSITION_CONTRACT_ERROR`; test proves three segments fail |
| 5 | A-2 env-var attempt bounds | **PASS** | Recorded + fix proposed (ticket minimum met; not closed) |
| 6 | Live proof honesty + internal consistency | **PASS** | depth-3/standard → 202 + basis 114; 2-node graph; no PRO-01 expansion claim |
| 7 | Named defect class has test teeth | **PASS** | Seed test drives `buildAcceptanceRegisterRows()`; wrong integer / dropped tier / casual added all fail |

---

## 1. Byte-fidelity to DR-159

**Law (DR-159, `decisions-ledger.md`):** depths 1→42 · 2→66 · 3→114 · 4→210 · 5→402 for **both** `standard` and `high-stakes`; `casual` must **not** be seeded; B3-B / B2-A / B1-B.

**Seed (`acceptance/seed-register.ts:9`, `:173–189`):**

| depth | `standard` | `high-stakes` |
|---:|---:|---:|
| 1 | 42 | 42 |
| 2 | 66 | 66 |
| 3 | 114 | 114 |
| 4 | 210 | 210 |
| 5 | 402 | 402 |

- Member count: **10** exactly.
- `casual` rows: **none**.
- Provenance constant: `ACCEPTANCE_RUN_ENVELOPE_SOURCE_REF = "acceptance:DR-159:V-approved"` (`seed-register.ts:9`); row `sourceRef` uses that constant (`:189`).

**Test pin (`acceptance/seed-register.test.ts:110–129`):** deep-equals the same ten members and asserts provenance string byte-identity.

**Independent recompute:** ledger integers = seed integers = test expectations. **AC-76 satisfied** — these are V's values, not worker inventions.

**Judgment: PASS.**

---

## 2. Closure assertion — would partial / drifted seed fail?

Packet question: does the seed test fail on a missing depth, missing tier, extra casual, or only pin today's happy shape?

**What ships** (`seed-register.test.ts:110–138`), driven by the real entry point `buildAcceptanceRegisterRows()`:

1. **Full structural equality** of `runCostEnvelope` (kind, all ten members with exact integers, provenance).
2. **Closed key-set** — maps `depth:tier` and expects exactly  
   `[1..5] × {standard, high-stakes}` (sorted), the DR-151-style closure the goal packet required.
3. **Explicit no-casual** — `envelopeMembers.some(({ risk_tier }) => risk_tier === "casual")` is `false`.

| Failure mode | Equality pin fails? | Key-set / no-casual fails? | Result |
|---|---|---|---|
| Missing depth (e.g. drop depth 4) | **yes** | **yes** (key-set shorter / missing keys) | **FAIL** |
| Missing tier (e.g. drop all high-stakes) | **yes** | **yes** | **FAIL** |
| Extra `casual` row | **yes** | **yes** (key-set + `.some(casual)`) | **FAIL** |
| Wrong integer (e.g. depth 3 → 38) | **yes** | no (keys unchanged) | **FAIL** via equality |

This is **not** a source-text-only pin of an unrelated file: the test constructs rows from the shipped seed builder. A partial seed cannot green the suite while the register is incomplete.

**Judgment: PASS** — partial and drifted seeds fail; the closure is real teeth, not a happy-shape rubber stamp.

---

## 3. Runtime-policy unpin

**Before (historical trap):** one-member `z.tuple` of `{depth:1, standard, 9}` — refused to boot on a second member.

**After (`acceptance/runtime-policy.ts:39–46`):**

```ts
runCostEnvelope: z.object({
  kind: z.literal("RUN_COST_ENVELOPE_POLICY"),
  members: z.array(z.object({
    depth_params: z.object({ depth: z.number().int().min(1).max(5) }).strict(),
    risk_tier: z.enum(["standard", "high-stakes"]),
    max_model_attempts: z.number().int().positive()
  }).strict()).min(1)
}).strict(),
```

Checks against the packet's anti-trap criteria:

| Anti-trap | Present? |
|---|---|
| No hardcoded member **COUNT** (no `z.tuple`, no `.length(10)`) | **yes** — only `.min(1)` |
| No hardcoded ceiling integers (no `42` / `402` / `9`) | **yes** — `z.number().int().positive()` |
| Reachable tiers only (`casual` rejected at schema) | **yes** — `z.enum(["standard", "high-stakes"])` |
| Depth range 1..5 | **yes** |

**Regression test (`runtime-policy.test.ts:7–26`)** deliberately builds a ten-member envelope with **42 on every depth** (not the DR-159 series). That proves the schema accepts multi-member shape **without** re-pinning V's ceilings. Provenance still gates via `ACCEPTANCE_RUN_ENVELOPE_SOURCE_REF` at read time (`runtime-policy.ts:157`).

A new pin of `42`/`402`/count would recreate the old trap one ruling later — **that trap is not recreated**.

**Judgment: PASS.**

**ADVISORY-1 (non-blocking):** shape-only boot accepts an incomplete envelope (e.g. a single positive member) if someone hand-edits the DB outside the seed path. That is the correct cost of not re-pinning count; the **seed unit suite** is the place that closes the full DR-159 set. Not a disposition failure.

---

## 4. A-1 — two-segment cap (hard disposition)

Packet (and goal packet): enforce the cap, **or** typed loud failure naming the assumption, **or fail the disposition**. Merely recording the unenforced assumption was **explicitly not permitted**.

**Where the failure fires**

`apps/runner/src/index.ts:67–74`:

```ts
const compositionSchema = z.object({
  segments: z.array(...).min(1).max(2, "Composer output exceeds DR-159's ratified two-segment serve cap")
}).strict();
```

`parseComposerOutput` (`:178–179`) parses through that schema and throws `TypedDomainError` with code **`COMPOSITION_CONTRACT_ERROR`** (message carries the Zod error, including the DR-159 cap phrase). Production compose path calls `parseComposerOutput(response.content)` at `:771`.

Composer system prompt also states the upper bound (`:763`: "segments array of **at most two** …").

**Test proves it**

`tests/unit/env01-runner-policy.test.ts:5–18` drives the **shipped** `parseComposerOutput` from `@debateai/runner` with three segments and expects:

- `code: "COMPOSITION_CONTRACT_ERROR"`
- `message` containing `"ratified two-segment serve cap"`

That is enforce + typed loud naming, with a regression that fails if the cap is removed.

**Disposition: closed loud — not "merely recorded". PASS.**

---

## 5. A-2 — env-var attempt bounds

**Still true in code:** `apps/runner/src/main.ts:26–28` loads organ bounds from `JUDGE_MAX_ATTEMPTS` / `COMPOSER_MAX_ATTEMPTS` / `CONFORMANCE_MAX_ATTEMPTS` via `loadRunnerEnvironment()` (`packages/register/src/runtime-environment.ts:47–49`). Envelope match key still sees only depth × effective risk tier.

**Disposition (handoff §A-2):** recorded at minimum; **fix proposed** — register-owned attempt-policy (or fold the three organ attempt bounds into the envelope member / match basis), load under the same register version as `runCostEnvelope`, fail typed-loud on startup unless runtime bounds match; do not silently clamp env values.

Ticket law: *"Record it at minimum; propose the fix."* That bar is met. A-2 remains **open by design** for a later ruled contract change.

**Judgment: PASS** (minimum disposition). Residual risk is real but out of ENV-01 close scope.

---

## 6. Live proof — internal consistency, no depth-expansion claim

Evidence from handoff + progress log (not re-hit live; standing `:8790` deliberately ignored per packet):

| Claim | Evidence | Consistent? |
|---|---|---|
| Fresh DB / reseed | Three ignored backups (`…0919Z`, `…0919Z-pre-reseed`, `…0928Z-pre-final-live`); final `.pgdata` re-initialized | **yes** |
| New register / provenance | `register_source_ref: "acceptance:DR-159:V-approved"`; `seeded_member_count: 10` | **yes** |
| Depth-3 standard ask | Progress: run `770e7f52…`; handoff final POST run `db2d02bb…` both 202/QUEUED | **yes** (packet names both) |
| Resolved basis 114 | `envelope_basis.max_model_attempts: 114`; `derived_from.depth_params.depth: 3` + `risk_tier: "standard"` | **yes** (DR-159 depth-3 ceiling) |
| Graph shape | Ceremony: **2 nodes · 1 attack edge** (FAIR dual-maker) | **yes** with inert depth |
| Depth expansion claim? | Handoff: *"Depth remains inert… does not claim depth-driven tree expansion"*; `apps/runner/src/index.ts` has **zero** occurrences of `depth` | **no false claim** |

**Judgment: PASS.** Internally consistent; honesty held on DR-157 inertness / PRO-01 ownership.

---

## 7. Named defect class — would tests fail on seed regression?

Packet defect class: wrong integer / dropped tier / casual added — vs source-text-only pins that survive behaviour drift.

| Regression | Fails? | How |
|---|---|---|
| Wrong integer in seed | **yes** | `seed-register.test.ts` deep-equals members via `buildAcceptanceRegisterRows()` |
| Dropped tier or depth | **yes** | equality + closed key-set |
| Casual member added | **yes** | equality + key-set + explicit no-casual |
| Composer emits 3+ segments | **yes** | `env01-runner-policy.test.ts` → shipped `parseComposerOutput` |
| Runtime re-pins one-member / literal 9 | **yes** | multi-member acceptance test + schema shape (would reject re-introduced tuple pin at compile/test) |

Third pin of old `9`: `tests/support/v2uiFixtures.ts:119` is now `max_model_attempts: 42` (depth-1 ratified ceiling).

**Judgment: PASS** — teeth are on shipped builders/parsers, not orphaned prose.

---

## Findings

### BLOCKING

None.

### ADVISORY

| ID | Severity | Location | Note |
|---|---|---|---|
| A1 | ADVISORY | `acceptance/runtime-policy.ts:39–46` | Shape-only boot still accepts incomplete envelopes if DB is hand-edited; full DR-159 closure lives in the seed unit test (intentional — do not re-pin count/integers). |
| A2 | ADVISORY | `apps/runner/src/main.ts:26–28` · `packages/register/src/runtime-environment.ts:47–49` | A-2 remains open: organ attempt bounds are env-sourced and invisible to the envelope match key. Recorded + fix proposed; not ENV-01 blocking. |
| A3 | ADVISORY | `tests/unit/pol01-policy.test.ts:22` | Local POL-01 fixture still uses `max_model_attempts: 9`. Not the ENV-01 "third pin" (that was `v2uiFixtures.ts:119`, now 42). Residual old-9 litter only — does not affect seed or runtime policy. |

---

## Scope notes (explicit non-claims)

- Orchestrator gates were **not** re-run; treated as already verified.
- Standing ceremony on `:8790` was **not** used as envelope proof.
- Depth-driven PRO/CON expansion is **PRO-01** (DR-157); ENV-01 proves admission + budget resolution only.
- Peer Opus ENV-01 verdict was **not** read (diamond independence).
- No product, acceptance, test, or ledger sources were edited by this review.

---

## Summary

ENV-01 executes DR-159 with byte-fidelity, real closure teeth on the seed, a shape-only runtime unpin that does not recreate the one-member trap, a **hard** A-1 close (enforce + typed loud + tested), and a compliant A-2 record-and-propose. Live depth-3 proof is coherent and honest about inert depth. **APPROVED.**
