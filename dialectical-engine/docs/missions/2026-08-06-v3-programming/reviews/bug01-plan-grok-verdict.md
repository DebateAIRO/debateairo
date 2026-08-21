# BUG-01 plan — Grok authorization verdict (DR-171)

**Lens:** Grok (authorizing, adversarial). **Seat:** DR-171 independent Grok.
**Plan under review:** `docs/missions/2026-08-06-v3-programming/reviews/bug01-architecture-plan.md`
**Packet:** `docs/missions/2026-08-06-v3-programming/reviews/bug01-plan-grok-authorization-packet.md`
**Method:** read-only source checks against the live tree; plan text not trusted without file:line evidence. Standing stack not touched. Sole write: this file.

---

## What was checked (packet items 1–8)

### 1. Decisive citation — `03-module-design.md` §7.1

**Confirmed.** `docs/architecture/03-module-design.md:896-899` states, in the Seam C / `CallBound` paragraph:

> Every attempt, including schema-failure retries, is a ledger row.

The surrounding context is the gateway call shape and register-sourced bounds, not an orphan note. Companion §10 row (`:1139`) requires unparseable output to be persisted with distinguishable parse vs schema status (AC-13, AC-92). The plan’s reading — schema-failure retries are a **designed-in** gateway property whose implementation is missing — matches the architecture text.

### 2. Chosen seam — `packages/providers` attempt loop + `classifyContent`

**Confirmed.**

| Claim | Evidence |
|---|---|
| Attempt loop exists | `packages/providers/src/index.ts:156-263` (`for` over `bound.maxAttempts`) |
| `classifyContent` is optional on the request | `:31-34` |
| Fallback when absent is JSON-parse-only | `contentParseStatus` `:131-138`; used at `:192-195` |
| Classification is already computed and written to the artifact | `:189-218` (`parseStatus` / `parseError` on `raw_artifact`) |
| Content rejection does **not** retry today | On HTTP OK the gateway always ledgers `outcome: "OK"` and **returns** content (`:221-244`); no `continue` on `SCHEMA_FAILED` / `PARSE_FAILED` |
| Incident throw path | `packages/judgement/src/index.ts:134-136` re-parses and throws `JUDGE_SCHEMA_FAILURE` on first schema failure |
| Untyped exhaustion | `providers:264` `throw new Error("PROVIDER_CALL_FAILED")` |

**Absent-predicate ⇒ default path:** without `classifyContent`, the gateway classifies for the record via `contentParseStatus` and still returns after one successful transport attempt. The plan’s guard — retry **only** when a declared predicate returns `PARSE_FAILED` or `SCHEMA_FAILED` — is therefore **additive**: callers with no predicate keep one-shot return behaviour. That guard is load-bearing (plan T4); the architecture reading of the seam is sound.

`inputHash` is hoisted outside the loop today (`:152`); recomputing it per attempt when a repair packet changes is required for P10, as the plan states.

### 3. N-genericity (DR-162-A) — shared content-rejection defect

**Confirmed that the defect is shared across organs; one count claim is wrong.**

Production `provider.call` sites (packages / apps production paths):

| # | Site | Predicate today | Post-return failure |
|---:|---|---|---|
| 1 | `packages/judgement/src/index.ts:92` (`Judge.judge`) | yes (`:125-132`) | `JUDGE_SCHEMA_FAILURE` `:136` |
| 2 | `packages/judgement/src/index.ts:169` (`Judge.review`) | yes (`:194-201`) | `NODE_REVIEW_SCHEMA_FAILURE` `:205` |
| 3 | `apps/runner/src/index.ts:1135` (composer) | **none** | `parseContent` / `COMPOSITION_CONTRACT_ERROR` via `:199-205`, `:207-208` |
| 4 | `apps/runner/src/index.ts:1191` (conformance) | **none** | `CONFORMANCE_CONTRACT_ERROR` `:1206` |
| 5 | `apps/runner/src/index.ts:1210` (post-compose R9) | **none** | `POST_COMPOSE_R9_CONTRACT_ERROR` `:1225` |

The plan’s phrase “exactly six gateway call sites” is **false**: it enumerates five line anchors and the tree has **five** production call sites. No sixth production site was found.

**Eight call-site key families** are real in `apps/runner/src/index.ts`: `JUDGE` (`:568`), `JUDGE:root:secondary` (`:797`), `JUDGE:${role}:root…` (`:833`, including the incident key `JUDGE:critic:root0:r1:p0`), `JUDGE:cross-root:*` (`:860`), `JUDGE:review:*` (`:889`), `COMPOSER:*` (`:1138`), `CONFORMANCE:*` (`:1194`), `POST_COMPOSE_R9:*` (`:1213`).

Composer path spot-check: `parseContent` (`:199-205`) throws on first organ-contract failure; no content-rejection retry. A fix only inside `judgement` would leave composer/conformance/R9 broken — the plan’s DR-162-A argument holds despite the off-by-one site count.

DR-162-A text (`decisions-ledger.md` ~1011–1020): algorithm is N-generic; no special-casing to one maker/site. Plan respects that.

### 4. No new numbers (AC-76 / DR-039)

**Confirmed.**

- Register-sourced bounds: `acceptance/seed-register.ts:161-171` — `acceptanceOrganCostBounds` sets `JUDGE` / `COMPOSER` / `CONFORMANCE` `maxAttempts: 3`.
- DR-159 B1-B (`decisions-ledger.md` ~936–939): failed and timed-out model calls are charged; **each call site independently permits 3 attempts**; ceiling is a limit, not a spend.
- Plan binds retry to existing `CallBound.maxAttempts`; invents no new literal.
- VROW-1 / VROW-3 correctly leave a *separate* repair sub-bound (if V wants one) as a register row with value “none stated”, not a source constant.
- DR-159 risk A-2 still true: Hatchet path reads env in `apps/runner/src/main.ts:26-28` (`JUDGE_MAX_ATTEMPTS` etc.); plan names and does not deepen it as a silent fix.

### 5. Envelope accounting — four counters outcome-blind

**Confirmed.**

| Counter | Location | Outcome filter? |
|---|---|---|
| `countRunModelAttempts` | `packages/budget/src/index.ts:246-253` | **none** — `action_kind = 'MODEL_CALL'` only |
| `assertModelAttemptAllowed` | `packages/budget/src/index.ts:265-273` | uses the same count |
| `countModelAttempts` | `packages/ledger/src/index.ts:501-515` | **none** |
| `findExhaustedModelAttempt` | `packages/ledger/src/index.ts:470-499` | **none** — `HAVING count(*) >= maxAttempts` by `call_site_key` |

Wrapper already derives remaining budget from the ledger (`apps/runner/src/index.ts:1433-1446`). Content-rejected attempts that write a `MODEL_CALL` row are charged with **zero new counter code**.

`FAILED` is already a member of `LEDGER_OUTCOMES` (`packages/kernel/src/index.ts:185`) and of the DDL CHECK (`migrations/0000_s00.sql:164`). Relabeling rejected attempts from `OK` → `FAILED` needs no migration.

`findSuccessfulCommandArtifact` (`packages/ledger/src/index.ts:452-468`) filters `outcome IN ('OK','BLOCKED')` but only on `action_kind = 'SERVE'` — unaffected by `MODEL_CALL` outcome changes.

### 6. Typed loudness (DR-115) preserved

**Confirmed in the plan’s design; no fabricate / silent-accept hole found.**

- DR-115 (`decisions-ledger.md` ~175–189): no scaffolded runtime data; loud honesty over defaults.
- Today: first schema failure → `TypedDomainError("JUDGE_SCHEMA_FAILURE", …)` (`judgement:136`); acceptance wraps as `ACCEPTANCE_EXECUTION_FAILED:${code}` (`acceptance/main.ts:71-75`).
- Plan §3.3.E–F: after bound exhaustion the gateway raises a typed `PROVIDER_CONTENT_UNACCEPTED` carrier with **last** parse error; `Judge.judge` / `review` rethrow the **same** organ codes (`JUDGE_SCHEMA_FAILURE` / `NODE_REVIEW_SCHEMA_FAILURE`) with that last error. Terminal string continuity holds.
- Repair laws: only the machine `parseError` is interpolated; no suggested score/value; no builder ⇒ identical packet re-send; gateway never authors prompt text; `contract_hash` constant across attempts.
- Option B (strip) rejected; no salvage / default τ after exhaustion (NON-goal §9.3).

Residual implementer risks (not plan design holes): a buggy `buildRepairPacket` that leads the model, or a strip smuggled in via schema change — both killed by plan tests T5–T8 if those tests ship.

### 7. Strictness recommendation + value questions as V rows

**Confirmed sound.**

- `evidence` is only `{quality, relevance}` (`packages/judgement/src/s04.ts:95`); the incident key `notes_absent` has no honest slot — plan’s “model reaching for honesty the schema lacks” is factual.
- **A** keep `.strict()` + bounded repair: consistent with P12 / DR-115 / ruled `splitIterationLimit` shape (`05-register-skeleton.md` §5.1 row 9: 2 regen rounds / 3 attempts then typed abstention).
- **B** strip: correctly rejected as silent coercion.
- **C** schema widen: correctly left to **VROW-2**.
- **VROW-1** (content shares the 3-attempt bound), **VROW-3** (else a new sub-bound), **VROW-4** (degrade-vs-die) are flagged, not decided. Plan’s reading that DR-159 + §7.1 already cover content rejections under `CallBound` is supportable; confirmation is still correctly listed as VROW-1 rather than smuggled as a new number.

### 8. Bonus findings

**Both real; same gateway content-acceptance / ledger-honesty seam class.**

1. **Ledger `OK` while artifact `SCHEMA_FAILED`:** gateway writes `parseStatus` from classification (`providers:213-214`) but hardcodes ledger `outcome: "OK"` on successful HTTP (`:228`). Records disagree. `packages/battery/src/terminal.ts:1032-1035` counts `MODEL_CALL … outcome = 'OK'` as evidence an owed check executed — so a rejected attempt currently inflates DR-139 executed-check evidence. Plan’s `FAILED` + `continue` repairs this honesty defect as part of the same seam.

2. **Composer (and conformance / R9) artifacts record `PARSED` on organ-contract violations:** those call sites declare no `classifyContent`; fallback `contentParseStatus` returns `PARSED` for any `JSON.parse`-able body (`providers:131-138`); organ schema is enforced only after return via `parseContent` (`runner:199-205`). Declaring predicates at those sites (plan §3.4) is the correct fix and is the same seam’s caller-side limb — not a separate architecture.

Orthogonal adjacent finding (plan §10.1, not this ticket): `terminal.ts:1032` matches `call_site_key = 'JUDGE'` **exactly**, so multi-maker keys (`JUDGE:critic:*`, etc.) are invisible to `judge_calls`. Confirmed; correctly out of scope.

---

## Refuted claims

| Claim in plan | Finding |
|---|---|
| “exactly six gateway call sites” (plan §3.1) | **Refuted.** Live tree has **five** production `provider.call` sites; the plan’s own line list is five anchors. Does **not** defeat N-genericity or the seam choice. Coder ticket must use the correct count. |

No other load-bearing factual claim was refuted.

## Unverifiable (honest limits)

| Item | Why |
|---|---|
| Live ledger rows for run `50802f65-…` | Packet and this seat forbid touching the standing stack / DB. Incident facts treated as packet-given ledger context, not re-queried. |
| Live model re-fire of schema failure | Out of scope (DR-115; plan §8). Authorization rests on static source + design soundness, not a summoned live rejection. |

---

## Confirmed load-bearing claims (summary)

1. Architecture already names schema-failure retries under `CallBound` (§7.1:896-899) — conformance repair, not amendment.
2. Seam belongs inside the existing providers attempt loop; classification is already present at the decision point.
3. Absent `classifyContent` must not become a silent multi-attempt path.
4. Content rejection is shared across judge + review + composer + conformance + R9 (five sites, eight key families).
5. Bound is register / DR-159 `CallBound.maxAttempts` (3); no new literal.
6. Four named counters are outcome-blind; retries charge without new accounting code.
7. After exhaustion the run still dies with the same typed organ codes and the **last** parse error.
8. Strictness option A is the only option consistent with P12/DR-115 without a V contract change; value questions stay V rows.
9. Bonus ledger/composer honesty defects are real and fixed by the same seam (outcome + declared predicates).

---

## Findings the coder ticket must carry

1. **Implement only the authorized seam:** honour declared `classifyContent` rejection inside `OpenAICompatibleProviderGateway.call` (`packages/providers/src/index.ts` loop); ledger `FAILED` + `raw_artifact_ref` + `continue`; per-attempt `input_hash`; optional `buildRepairPacket`; typed exhaustion carrier (`PROVIDER_CONTENT_UNACCEPTED` / transport `PROVIDER_CALL_FAILED`).
2. **Absent predicate never retries** (plan T4) — single most important guard.
3. **Terminal codes unchanged:** `JUDGE_SCHEMA_FAILURE` / `NODE_REVIEW_SCHEMA_FAILURE` / composer contract codes after bound spent; message carries **last** parse error.
4. **Repair packet laws:** contract text only; interpolate machine `parseError` only; never suggest values; no builder ⇒ identical re-send; `contract_hash` identical across attempts.
5. **Declare predicates** at composer / conformance / R9 (`apps/runner`) so artifacts record honest `SCHEMA_FAILED` (bonus finding B).
6. **`claim_type` tighten** to `z.enum(CLAIM_TYPES).optional()` so bogus claim types are retryable schema rejections (plan §3.4).
7. **Downstream of OK→FAILED:** `battery/terminal.ts` executed-check counts become stricter (desired); add test; do not “fix” by counting `FAILED` as executed.
8. **Site count:** five production call sites, not six — ticket prose must not invent a sixth.
9. **Do not:** schema widen (VROW-2), strip unknown keys, invent a repair sub-bound literal, fix DR-159 A-2 here, special-case the incident call site, add kernel vocabulary / DDL / new edges, restart the standing stack.
10. **Tests T1–T15** as specified in the plan (mutation-proof suite under `tests/**/*.test.ts`).
11. **Adjacent (own tickets, not this scope):** `terminal.ts` exact `JUDGE` key miss for multi-maker families; DR-159 A-2 env-var bounds on Hatchet runner path.

---

## Authorization

The plan’s architecture claims hold against the live tree. The defect is a missing implementation of a named Seam C behaviour; the chosen repair is additive, N-generic, number-clean, envelope-correct, and DR-115-loud. One minor count error does not justify refusal.

**Binding conditions (must hold in the coding ticket):**

1. Retry fires only when a **caller-declared** `classifyContent` returns `PARSE_FAILED` or `SCHEMA_FAILED`; absent predicate remains byte-identical one-shot behaviour.
2. Exhaustion still terminal-fails with the **same** typed organ codes carrying the **last** `parse_error`; no salvage, strip, fabricate, or default judgement.
3. Bound is existing `CallBound.maxAttempts` only; no new source literal; VROW-1 reading used for implementation (shared bound) unless V later rules a separate sub-bound.
4. No schema widening, no DDL/kernel vocabulary change, no new dependency edge, no stack process control.
5. Coder ticket carries the findings list above (including the five-site correction and bonus ledger/composer honesty work as part of the seam).

AUTHORIZATION: GRANTED (binding conditions 1–5 above)
