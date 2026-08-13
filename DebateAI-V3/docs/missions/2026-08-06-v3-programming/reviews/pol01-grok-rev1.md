# POL-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_a8ad8b2f` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-12  
**Review packet:** `docs/missions/2026-08-06-v3-programming/reviews/POL-01-review-packet.md`  
**Mode:** read-only. Product / runtime sources not edited. Judged from shipped source and tests, not handoff prose. Did not read any peer (Opus) POL-01 verdict.

## Verdict

**CHANGES REQUESTED**

The refusal/outage theme is largely fixed in the right places: ask-boundary refusals now surface as **422 with the real domain `code`**, proxy outages are no longer a bare undifferentiated 500, stored tokens clear only on observed rejection, and A3/A4 are worked in product code with regression tests. Those pieces hold under file:line inspection.

What does **not** hold is the **boundary rule’s soundness claim**. The handler treats every `TypedDomainError` on `POST /v1/asks` as a “semantic refusal of a syntactically valid ask.” That assumption is false. **A genuine internal fault can already escape that route as a `TypedDomainError` and be dressed as a client-actionable HTTP 422.** Constructed case below (topic 1). Ticket deliverable was explicit: *a genuine internal fault stays 5xx*. That limb is not met.

---

## Judgment topics (packet §What to judge)

### 1. Boundary rule sound, or does it mislabel? (sharp failure mode)

**FAIL — case constructed. BLOCKING.**

**Shipped rule** (`apps/api/src/index.ts:69–87`):

```ts
const malformed = knownError.name === "ZodError" || knownError instanceof SyntaxError;
const askRefusal = knownError instanceof TypedDomainError
  && request.method === "POST"
  && request.routeOptions.url === "/v1/asks";
const statusCode = malformed ? 400 : askRefusal ? 422 : 500;
// error body: askRefusal ? knownError.code : "INTERNAL_ERROR"
```

Route context only. No code allowlist. Comment at 72–76 asserts that a `TypedDomainError` crossing submit “is a semantic refusal.” That is an author intent statement; the type system and call graph do not enforce it.

**Ask-submission throw surface** (`PostgresAskApplication.submit`, `apps/api/src/index.ts:259–309`):

| Step | Site | TypedDomainError codes reachable | Classification |
|---|---|---|---|
| liveness | `#liveness.recordQuery` | `LIVENESS_QUERY_INVALID` | mostly schema-gated |
| risk | `resolveRisk` | `TIER_PROVENANCE_MISSING`, `RISK_TIER_POLICY_INVALID` | policy / input |
| maker read | `resolveDeploymentMakerAvailability` → `readDeploymentMakerCapability` (`main.ts:30`, `packages/critique/src/index.ts:244–288`) | `CONFIGURED_PROVIDER_SET_UNRESOLVED`, `CONFIGURED_PROVIDER_SET_INVALID` | **broken deployment register** |
| maker gate | `assertMakerAdmission` (`packages/critique/src/index.ts:324–337`) | `MAKER_INVENTORY_UNSATISFIED` | policy refusal (client-relevant) |
| envelope | `resolveEnvelopeBasis` → `resolveRunCostEnvelopeBasis` (`packages/register/src/index.ts:253–266`) | `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` | policy refusal (the V-observed case) |
| persist | `#runs.startRun` → `allocateSequence` (`packages/db/src/index.ts:69–73`) | **`SEQUENCE_ALLOCATION_FAILED`** | **internal DB invariant** |
| memory | `#serve.recordMemoryQuestion` | memory package typed faults (e.g. predicate drift) | internal / invariant |
| enqueue | `#work.enqueue` → `allocateSequence` again | **`SEQUENCE_ALLOCATION_FAILED`** | **internal DB invariant** |
| dispatch | `dispatcher.dispatch` | (Hatchet / TypeError path — not `TypedDomainError`) | stays 500 |

**Constructed case (primary):**

1. Client `POST /v1/asks` with a fully schema-valid body and valid session (malformed branch closed).
2. Policy gates pass (makers ok; envelope member resolves).
3. During `startRun`, `ledger.allocate_sequence()` returns no row →  
   `throw new TypedDomainError("SEQUENCE_ALLOCATION_FAILED", "No sequence was allocated")`  
   (`packages/db/src/index.ts:72`).
4. Error handler: `instanceof TypedDomainError` ∧ `POST` ∧ `url === "/v1/asks"` → **HTTP 422** with  
   `{ error: "SEQUENCE_ALLOCATION_FAILED", message: "No sequence was allocated" }`.

The client did not submit an unprocessable ask. The server’s sequence allocator failed. **422 with that code states a client-actionable refusal the system did not observe as a refusal of ask content** (DR-115 on status-as-statement). Ticket DELIVERS #1 required internal faults to stay 5xx. This path violates that.

**Secondary case (deployment integrity, still on the ask route):**  
`main.ts:30` re-reads the register on every submit via `readDeploymentMakerCapability`. If the `configuredProviderSet` row is absent or shape-invalid after process start (or under any composition that wires the same resolver without a prior boot fail-fast), `CONFIGURED_PROVIDER_SET_UNRESOLVED` / `CONFIGURED_PROVIDER_SET_INVALID` become **422** on `POST /v1/asks`. That is a broken deployment invariant, not a depth/tier/maker *admission* decision about the asker’s request.

**What the rule does get right:** non-ask routes keep typed faults as 500 (`DEPLOYMENT_REGISTER_UNAVAILABLE` on `GET /v1/deployment` — `api.test.ts:141–155`). Untyped crashes stay 500. Zod still 400. The *route filter* is real; it is just too coarse for the mixed use of `TypedDomainError` inside `submit`.

**Not a defense:** “422 is still better than lying 500 INTERNAL_ERROR.” Preserving the domain code is good; mislabeling the **status class** (client-actionable 4xx vs server 5xx) is the failure mode the packet named. Fix directions (for implementer, not this seat): refusal allowlist; or typed refusal subclass; or map only pre-persistence policy gates and keep post-`startRun`/`allocateSequence`/`memory` typed faults on 500.

---

### 2. Is 422 right, and is 403 → 422 for `MAKER_INVENTORY_UNSATISFIED` correct?

**PASS for 422 on true policy refusals; 403→422 is defensible with one information loss note (ADVISORY).**

- **422 for envelope/member refusals** matches the observed V incident (`RUN_COST_ENVELOPE_MEMBER_UNRESOLVED`): syntax-valid ask, semantic policy refuse. Body carries exact `code` + `message` (`api.test.ts:102–138`). That is the right face for *that* class.
- **`MAKER_INVENTORY_UNSATISFIED`** (`packages/critique/src/index.ts:324–337`) is admission policy for the effective tier vs configured makers — not principal authorization. Architecture table still lists it as **403** (`docs/architecture/04-api-contract.md` row for `MAKER_INVENTORY_UNSATISFIED`), so wire status and published contract drift (ADVISORY A1).
- **Information lost vs 403:** contract client maps status → closed code (`packages/contract/src/client.ts:49–54`): `403 → FORBIDDEN`, anything else non-special → `SERVER_FAILURE`. After the move, maker refusal arrives as `ContractHttpError.code === "SERVER_FAILURE"`, `status === 422`, `serverCode === "MAKER_INVENTORY_UNSATISFIED"`. Clients that branched on `FORBIDDEN` lose the authorization flavour; clients that read `serverCode` keep the truth. **No client-actionable inventory fact is deleted from the body** — only the 403/FORBIDDEN transport cue.

Given the ticket’s “boundary not hand-picked codes” stance, bundling maker admission with other ask-boundary policy refusals as 422 is coherent **if and only if** the boundary is restricted to real refusals (topic 1). As shipped, the same rule also captures internals; that does not make 422 wrong for maker inventory — it makes the rule too wide.

---

### 3. Refusal / outage distinction end-to-end?

**PASS (stronger than the packet’s stale proxy description).**

| Face | Status | Body | UI surface |
|---|---|---|---|
| Policy refusal (API up) | **422** | `error: <domain code>`, `message: …` | `/new` shows `exc.message` → `"CODE: message"` via contract client (`apps/v2-ui/app/new/page.tsx:117–118`; `packages/contract/src/client.ts:70–73`) |
| API process crash / untyped internal | **500** | `error: "INTERNAL_ERROR"` | same path; message preserved; code collapsed |
| Proxy cannot reach API (`fetch` reject, ECONNREFUSED) | **502** | `error: "API_UPSTREAM_UNREACHABLE"`, honest message (`apps/v2-ui/app/api/[...path]/route.ts:51–59`) | contract client: `SERVER_FAILURE` status 502 + `serverCode` when JSON; direct network without proxy: `NETWORK_FAILURE` |
| Token check outage | classified `UNREACHABLE` / `COORDINATOR_FAILED` | never “rejected” | `tokenUnlock.ts` |

Packet text still says the proxy turns ECONNREFUSED into a **bare 500**. Shipped code returns **502 + `API_UPSTREAM_UNREACHABLE`** and states only the observed proxy fact (DR-115 comment at 55–56). Browser can tell refusal (422 + domain code) from outage (502 / NETWORK_FAILURE / non-rejection token copy). Pass-through of upstream status means a real API 422 is not rewritten by the proxy.

Caveat (ADVISORY): contract client has no dedicated `UNPROCESSABLE`/`422` member — 422 still maps to `SERVER_FAILURE` with `serverCode` preserved. Distinguishable in practice via `status` + `serverCode`, not via a first-class client enum.

---

### 4. Token audit

**PASS.**

- Classifier: `apps/v2-ui/lib/v3/tokenUnlock.ts:28–67` — `REJECTED` only for `SESSION_REQUIRED` / `FORBIDDEN`; outage / server / malformed / unclassified never claim rejection.
- Clear predicate: `shouldClearStoredTokenAfterUnlockFailure` = `kind === "REJECTED"` only (`:75–76`).
- Call sites that auto-check stored tokens:
  - `AuthGate.tsx:29, 52` — clear only via predicate; message via `tokenUnlockFailureMessage`.
  - `DebatePageClient.tsx:513, 953` — same.
- Explicit lock / reject-action paths (`DebatePageClient.tsx:962–970`) clear because the **user** locked or rejected — not a bare catch inventing a coordinator verdict.
- Structural regression test: `tests/unit/pol01-policy.test.ts:89–109` asserts clear-on-rejection / no-clear-on-outage and that AuthGate / DebatePageClient route through the helper; AuthGate must not contain `"Saved token is no longer valid."`.

No remaining action path found that narrates “token rejected” from a bare catch.

---

### 5. Accumulated advisories A3 / A4

**PASS — both worked in product code, not merely recorded.**

| Advisory | Shipped proof | Test proof |
|---|---|---|
| **A3** dual floor source (register vs `DEPLOYMENT_RISK_TIER` env) | `apps/api/src/main.ts:24, 32–40`: `readDeploymentRiskTier(pool, environment.REGISTER_VERSION)` feeds `resolveEffectiveRiskTier`; **no** `environment.DEPLOYMENT_RISK_TIER` | `pol01-policy.test.ts:63–67` source assertion: contains `readDeploymentRiskTier`, not `environment.DEPLOYMENT_RISK_TIER`; behavioral refusals for absent/NULL/invalid row (`:45–53`) |
| **A4** present-null `riskTier` ABSENT-vs-INVALID | UI `runCostEnvelopeFromDeployment` (`apps/v2-ui/lib/v3/adapter.ts:578–586`): **absent row** → `deploymentRiskTier: null`; **present non-vocab including `null`** → `RISK_TIER_POLICY_INVALID`. Engine `readDeploymentRiskTier` (`packages/register/src/index.ts:181–189`) refuses absent and non-enum (null fails `z.enum`) | `pol01-policy.test.ts:55–61` |

Cosmetic FAIR-01 `independence: undefined` not re-litigated (packet lists it as cosmetic).

---

### 6. Would tests fail if mapping regressed to 500?

**PARTIAL PASS — refusal regression is covered; internal-mislabel is not.**

**Would fail on 500 regression of a refusal:**

- `tests/unit/api.test.ts:102–138` — mocks `submit` throwing `TypedDomainError("RUN_COST_ENVELOPE_MEMBER_UNRESOLVED", …)`, asserts **`statusCode === 422`** and body  
  `{ error: "RUN_COST_ENVELOPE_MEMBER_UNRESOLVED", message: "…" }`.  
  A regression to 500 / `INTERNAL_ERROR` **fails this test**. Not a vacuous “an error is returned.”
- `tests/unit/api.test.ts:168–180` — contract client preserves `status: 422` and `serverCode` from a 422 body.
- `tests/unit/pol01-policy.test.ts:69–87` — `/new` data path surfaces the typed code string through `createDebate`.

**Would NOT catch the sharp defect:**

- `keeps typed internal faults … on the 500 face` (`api.test.ts:141–166`) only exercises **`GET /v1/deployment`**, not `POST /v1/asks`. There is **no** test that `SEQUENCE_ALLOCATION_FAILED` (or any internal code) on submit stays 500 — and under the current rule such a test would correctly fail, documenting the gap.

So: the mission’s costly “green for the wrong reason” class is **avoided for the V-observed refusal**, and **unaddressed for internal-as-422**.

Narrow suite re-run this seat: `tests/unit/api.test.ts` + `tests/unit/pol01-policy.test.ts` → **22/22 pass** (evidence under implementer scratch `pol01-api-test.log`). Orchestrator gates not re-run per packet.

---

## BLOCKING

1. **Internal `TypedDomainError` on `POST /v1/asks` → HTTP 422**  
   - **Rule:** `apps/api/src/index.ts:77–80`  
   - **Concrete case:** `allocateSequence` → `SEQUENCE_ALLOCATION_FAILED` (`packages/db/src/index.ts:72`) during `startRun` / `enqueue` inside `submit` (`apps/api/src/index.ts:267–308`) → status **422**, `error: "SEQUENCE_ALLOCATION_FAILED"`.  
   - **Also:** `CONFIGURED_PROVIDER_SET_UNRESOLVED` / `_INVALID` from `readDeploymentMakerCapability` on the per-submit maker re-read (`main.ts:30`, `critique/src/index.ts:254–268`) → same 422 face.  
   - **Why it blocks:** ticket + DR-115 require internal faults to stay 5xx / not be stated as client-actionable refusals. Route-only classification of all `TypedDomainError` as “refusal” is false against the shipped throw graph.  
   - **Missing proof:** no unit test that forces an internal typed fault through `POST /v1/asks` and expects 500.

## ADVISORY

1. **Contract doc drift:** `docs/architecture/04-api-contract.md` still maps `MAKER_INVENTORY_UNSATISFIED` → 403; shipped handler maps ask-boundary typed errors → 422. Update the contract table when the status rule is ratified.
2. **Contract client taxonomy:** 422 has no first-class `ContractErrorCode`; relies on `status` + `serverCode`. Fine for `/new` string display; brittle if future UI branches only on `code === "SERVER_FAILURE"`.
3. **Packet staleness:** review packet still describes proxy ECONNREFUSED as bare 500; shipped proxy is 502 + `API_UPSTREAM_UNREACHABLE` — do not re-open that as a defect.
4. **No dedicated 422 assertion for `MAKER_INVENTORY_UNSATISFIED`** on the HTTP facade (only pure `assertMakerAdmission` unit tests). Refusal regression coverage is carried by the envelope-member case.

## What is solid (do not regress)

- Real domain code on ask-boundary refusals instead of `INTERNAL_ERROR` collapse for the V-observed envelope miss.
- Proxy outage face distinct from API refusal (`502` / `API_UPSTREAM_UNREACHABLE`).
- Token clear-only-on-`REJECTED` with call-site audit.
- A3 register-owned deployment floor in `apps/api` main; A4 absent vs invalid `riskTier` alignment in UI adapter.
- Refusal→422 tests that assert **status and code**, not mere error presence.

## Bottom line

Ship the refusal visibility and the token/proxy honesty; **do not approve the boundary rule as stated** until an internal typed fault on submit cannot be dressed as 422 (or the product explicitly redefines “refusal” to include sequence/register integrity failures — which would still need an honest client story and would contradict the ticket’s 5xx limb).

**CHANGES REQUESTED** on BLOCKING-1. Residual items are ADVISORY.
