# POL-01 dual-diamond review — Grok lens (rev2)

**Ticket:** `t_a8ad8b2f` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-12  
**Review packet:** `docs/missions/2026-08-06-v3-programming/reviews/POL-01-review-packet.md`  
**Rework contract:** `docs/missions/2026-08-06-v3-programming/reviews/POL-01-rework-directive.md`  
**Prior Grok verdict:** `docs/missions/2026-08-06-v3-programming/reviews/pol01-grok-rev1.md` (**CHANGES REQUESTED** on B1)  
**Mode:** read-only. Product / runtime sources not edited. Judged against the **rework directive** (B1 + folded A1/A2), not the original packet alone. Did not read any peer (Opus) POL-01 rev2 verdict. Orchestrator gates cited as already green (root typecheck clean; root vitest 61 files / 433 tests; source audit 0 blocking) — not re-run.

## Verdict

**APPROVED**

Rev2 did **not** merely relabel. Classification authority moved off HTTP route context onto an evaluation-stage marker. Only genuine evaluation refusals (`MAKER_INVENTORY_UNSATISFIED`, `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED`) receive 422; an internal typed error thrown from `submit` (e.g. `MEMORY_MATCH_PREDICATE_DRIFT`) yields 500. Folded advisories A1 and A2 are closed with assertions that can fail for their stated reasons. Residual directive items A3/A4/A7 are fixed in product code; A6 is explicitly deferred with a recorded rationale.

---

## B1 — evaluation-stage boundary (was BLOCKING)

### What the rework required

Move classification from the route (`POST` + `/v1/asks`) to the **evaluation stage**, keeping 422 only for genuine refusals (rows 4–5: maker inventory, run-cost envelope), and add a test proving an internal typed error from `submit` yields **500**.

### Shipped rule (not route-keyed)

`apps/api/src/index.ts:107–120` — error handler:

```ts
const askRefusal = knownError instanceof AskRefusal;
const statusCode = malformed ? 400 : askRefusal ? 422 : 500;
// body.error: askRefusal ? knownError.code : "INTERNAL_ERROR"
```

No `request.method`, no `request.routeOptions.url`. Grep of `index.ts` confirms route context is absent from classification (only the route registration at `:135` remains).

`AskRefusal` (`:60–68`) is an explicit marker; comment at `:56–58` states typed errors from deployment reads or persistence deliberately do not receive it.

### Marker minted only at evaluation stage

`evaluateAskAdmission` (`:274–298`):

| Step | Marked? | Outcome if throws |
|---|---|---|
| `resolveRisk` | no | stays `TypedDomainError` → **500** |
| `resolveDeploymentMakerAvailability` | no | e.g. `CONFIGURED_PROVIDER_SET_*` → **500** |
| `assertMakerAdmission` | **yes** via `markAskRefusal` | `MAKER_INVENTORY_UNSATISFIED` → **422** |
| `resolveEnvelopeBasis` | **yes** via `markAskRefusal` | `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` → **422** |

`PostgresAskApplication.submit` (`:319–364`):

| # | call | after marker? | status if typed fault |
|---|---|---|---|
| 1 | `#liveness.recordQuery` | outside | **500** |
| 2–5 | `evaluateAskAdmission` (above) | stage | 422 only for marked refusals |
| 6 | `#runs.startRun` | outside (post-eval) | **500** (incl. `SEQUENCE_ALLOCATION_FAILED`) |
| 7 | `#serve.recordMemoryQuestion` | outside | **500** (incl. `MEMORY_MATCH_PREDICATE_DRIFT`) |
| 8 | `#work.enqueue` | outside | **500** |

`AskRefusal` from evaluation propagates uncaught out of `submit` (no try/catch around `:321`), so the Fastify handler sees the marker.

### Why this is a real move, not a relabel

Rev1 failed because **every** `TypedDomainError` on the ask route became 422. Rev2 keys 422 solely on `instanceof AskRefusal`, and only two evaluation catches mint that type. The same `readDeploymentMakerCapability` / `CONFIGURED_PROVIDER_SET_*` path that was 422-by-route is now unmarked inside `evaluateAskAdmission` and remains a typed internal on the 500 face — the “same read, two faces” tell from the directive is closed for the ask path.

### Required test present and drives submit

`tests/unit/api.test.ts:217–252`:

- Stubs `application.submit` to throw  
  `TypedDomainError("MEMORY_MATCH_PREDICATE_DRIFT", "Database and domain match predicates disagree")`
- `POST /v1/asks` via real `buildApi` inject
- Asserts **`statusCode === 500`** and body  
  `{ error: "INTERNAL_ERROR", message: "Database and domain match predicates disagree" }`

That is the directive’s missing test: internal typed error from submit → 500, not a renamed type asserted without the HTTP path.

Companion stage tests (`api.test.ts:67–113`):

- maker inventory → `AskRefusal` / `MAKER_INVENTORY_UNSATISFIED`
- envelope unresolved → `AskRefusal` / exact code + message
- `CONFIGURED_PROVIDER_SET_UNRESOLVED` from deployment read → remains **`TypedDomainError`** (unmarked)

Facade refusal path (`:178–215`): `submit` throws `AskRefusal(...)` → **422** with real code/message.

**B1 judgment: PASS — closed.** Boundary is evaluation-stage, not route; internals cannot borrow 422 merely by crossing `POST /v1/asks`.

---

## A1 — pol01-policy assertion can fail for its stated reason

### What the rework required

`expect(...).toContain("shouldClearStoredTokenAfterUnlockFailure")` was satisfiable by the **import line alone**. Require a check that fails if bare `clearStoredToken()` is restored without the guard.

### Shipped

`tests/unit/pol01-policy.test.ts:111–124`:

```ts
expect(authGate.match(/if \(shouldClearStoredTokenAfterUnlockFailure\(error\)\) clearStoredToken\(\)/g)).toHaveLength(2);
expect(debatePage.match(/if \(shouldClearStoredTokenAfterUnlockFailure\(error\)\) clearStoredToken\(\)/g)).toHaveLength(2);
```

A regression restoring  
`catch { clearStoredToken(); setError("Saved token is invalid."); }`  
while leaving the import yields **match length 0** → test fails. Import-alone no longer greens.

Also `:69` now asserts `deploymentRiskTier.value` (directive family note at `:63–67`).

Live call sites match the guarded form (`AuthGate.tsx:29,52`; `DebatePageClient.tsx:508,948`).

**A1 judgment: PASS — closed.**

---

## A2 — `looksAuthRelated` deleted

### What the rework required

Delete the substring-sniff heuristic from production UI surfaces (`DebatePageClient`, `DebateTree`, `NodeDetailDrawer`).

### Shipped

- `rg looksAuthRelated apps/` → **zero** matches.
- Residual mentions are only in review/handoff docs and in `pol01-policy.test.ts:121–123` asserting **absence** on those three files.
- Token clear paths use `shouldClearStoredTokenAfterUnlockFailure` only; no message-prose clear.

**A2 judgment: PASS — closed.**

---

## Optional directive items (A3 / A4 / A6 / A7) — recorded, not expanded

| Item | Disposition (from shipped code + handoff) |
|---|---|
| **A3** 422 → `SERVER_FAILURE` at typed client | **Fixed.** `packages/contract/src/client.ts:54` maps 422 → `UNPROCESSABLE`; `api.test.ts:287–291` pins it. |
| **A4** proxy 502 renarrated as coordinator failure | **Fixed.** `tokenUnlock.ts:36–40` treats `API_UPSTREAM_UNREACHABLE` and 502/503/504 as `UNREACHABLE` (“never checked”). |
| **A6** `Fastify({ logger: false })` | **Explicitly deferred** in handoff (ops/security policy, not a one-line POL-01 behavior change). Status/body now truthful for internal 500s; logging remains a separate decision. Not re-opened as BLOCKING. |
| **A7** response Zod → 400 | **Fixed.** Only request bodies use `parseRequest` / `MalformedRequestError` (`index.ts:138,197`); response `AskAcceptedSchema.parse` etc. stay outside that marker → 500 (`api.test.ts:295–322`). |

---

## BLOCKING

None.

## ADVISORY

1. **A6 logger still off** — intentional deferral recorded; worth a dedicated observability ticket so post-commit 500s are not body-only forever (`index.ts:106` still `logger: false`).
2. **Architecture doc drift (carry from rev1)** — if `docs/architecture/04-api-contract.md` still lists `MAKER_INVENTORY_UNSATISFIED` as 403, update when convenient; not a runtime defect.

## What is solid (do not regress)

- Evaluation-stage `AskRefusal` only around maker + envelope.
- Internal typed faults on ask path → 500 with `INTERNAL_ERROR` body (code collapsed; message preserved).
- Real domain code/message on 422 refusals.
- Proxy 502 / `API_UPSTREAM_UNREACHABLE` distinct from refusal.
- Token clear only on observed rejection; no `looksAuthRelated`.
- Contract client first-class `UNPROCESSABLE` for 422.
- Stage + facade tests that would fail if classification regressed to route-wide 422 or if internal submit faults became 422.

## Bottom line

The rev1 BLOCKING case is closed by a real classification move, not a rename. Folded A1/A2 hold under source inspection. No new BLOCKING defect constructed from shipped code.

**APPROVED.**
