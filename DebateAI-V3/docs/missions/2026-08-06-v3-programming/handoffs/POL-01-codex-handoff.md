# POL-01 Codex handoff

Worker session: `goal-019ff4fe-cee6-7f92-b3e9-413ccb03d548` / Hermes run 64  
Ticket: `t_a8ad8b2f`  
Workdir: `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3`  
Assignment: first pass + sticky-worker rev2 rework; no Git commit/branch/push/merge/reset operation performed  
Comments read through: `2026-08-12 11:52 codex REWORK READY FOR HERMES REVIEW` (latest at final rev2 scan)

## Outcome and mapping rule

A syntactically valid ask that is refused during the explicit evaluation stage now returns HTTP `422` with that error's exact `code` and `message`. Rev2 moves authority from the HTTP route to an `AskRefusal` marker minted only around maker admission and run-cost-envelope resolution:

- Request-side Zod/syntax failures remain `400 MALFORMED_REQUEST`; response-side schema violations remain `500 INTERNAL_ERROR`.
- `MAKER_INVENTORY_UNSATISFIED` and `RUN_COST_ENVELOPE_MEMBER_UNRESOLVED` are marked at evaluation and remain `422 <typed code>`.
- Deployment capability reads happen outside the marker. All liveness, register, sequence-allocation, memory, enqueue and dispatch faults remain `500 INTERNAL_ERROR`, including typed faults raised from `POST /v1/asks` after `startRun` commits.
- Untyped exceptions remain `500 INTERNAL_ERROR`.

This closes the dual-diamond blocker: route context no longer classifies anything. `MEMORY_MATCH_PREDICATE_DRIFT`, `SEQUENCE_ALLOCATION_FAILED`, and `CONFIGURED_PROVIDER_SET_*` cannot borrow the refusal face merely because they cross `POST /v1/asks`.

The contract client now reads non-2xx JSON bodies, exposes 422 as first-class `UNPROCESSABLE`, retains exact `serverCode`, and puts `<server code>: <server message>` in `Error.message`. The existing `/new` catch renders that message; a behavioral test drives the real `createDebate` data path and proves the exact run-cost refusal reaches it.

The same-origin proxy now distinguishes a rejected fetch (no HTTP answer) as:

```json
{"error":"API_UPSTREAM_UNREACHABLE","message":"The API upstream did not answer the proxy request."}
```

with HTTP 502. An actual upstream HTTP 500 continues to pass through byte-for-byte.

## Rev2 TDD evidence

Five focused RED failures reproduced B1 and the selected advisories before production edits:

```text
Test Files  2 failed (2)
Tests       5 failed | 18 passed (23)

internal TypedDomainError through POST /v1/asks: expected 500, received 422
invalid application response: expected 500, received 400
contract 422 category: expected UNPROCESSABLE, received SERVER_FAILURE
proxy 502 token classification: expected UNREACHABLE, received COORDINATOR_FAILED
looksAuthRelated source audit: heuristic still present
```

The first GREEN established 67/67 focused tests and both typechecks. A stronger evaluation-stage test was then added for both genuine refusal codes and for the unmarked deployment-register fault. Its first run was behavior-green but root-typecheck RED because the fixture used a partial `AskRequest`; replacing that with a full contract-valid request produced:

```text
Test Files  3 passed (3)
Tests       68 passed (68)

$ npx tsc --noEmit
exit 0

$ pnpm --dir apps/v2-ui run typecheck
$ tsc --noEmit -p tsconfig.json
exit 0
```

The regression suite now proves all three stage cases: maker refusal is marked, envelope refusal is marked with exact code/message, and `CONFIGURED_PROVIDER_SET_UNRESOLVED` stays an unmarked internal typed error. The API facade companion proves `MEMORY_MATCH_PREDICATE_DRIFT` thrown by `application.submit` returns 500.

## Rev1 TDD evidence

Initial live RED against the standing API:

```text
HTTP 500
{"error":"INTERNAL_ERROR","message":"No runCostEnvelope member matches the declared depth and effective risk tier"}
```

Initial focused RED after adding behavior-level tests:

```text
Test Files  3 failed (3)
Tests       9 failed | 15 passed (24)

expected 500 to be 422
expected ContractHttpError ... serverCode/message
fetch failed: ECONNREFUSED
readDeploymentRiskTier is not a function
present NULL riskTier did not throw
apps/api/main did not contain readDeploymentRiskTier
```

First GREEN:

```text
Test Files  3 passed (3)
Tests       24 passed (24)
```

The requested bare-catch audit then found a second real RED: the automatic stored-token paths still cleared the token and one said `Saved token is no longer valid.` on network/5xx failures. Regression output:

```text
Test Files  1 failed (1)
Tests       2 failed | 7 passed (9)

shouldClearStoredTokenAfterUnlockFailure is not a function
AuthGate did not route automatic validation through the typed decision
```

Correction: all automatic and manual unlock paths clear storage only for observed 401/403 rejection; outages/5xx retain the stored token and use the typed non-verdict message. Focused GREEN:

```text
Test Files  3 passed (3)
Tests       80 passed (80)
```

## Live product-path evidence

Rev2 reran the isolated real-PostgreSQL `PostgresAskApplication` after the marker change. The depth-3 refusal is minted by the real envelope evaluation, before persistence/dispatch:

```text
HTTP/1.1 422 Unprocessable Entity
content-type: application/json; charset=utf-8
content-length: 136

{"error":"RUN_COST_ENVELOPE_MEMBER_UNRESOLVED","message":"No runCostEnvelope member matches the declared depth and effective risk tier"}
standing API 8790: HTTP 200
standing UI 3000: HTTP 200
```

The isolated API was then stopped. No provider dispatch was reachable and the standing stack was not restarted or interrupted.

The standing acceptance API was launched without watch mode and still had the pre-edit module loaded. Restarting it would rerun the ceremony and invoke real model providers, so it was not restarted without an IMPORTANT OPERATION approval. Instead, an isolated temporary API on 8792 used the same real PostgreSQL/register policy and the real `PostgresAskApplication`; its dispatcher was deliberately unreachable because the ruled depth-3 refusal occurs before dispatch. A separate Next dev proxy on 3001 used a `/tmp` dist directory. The standing stack stayed up.

Real depth-3 refusal through the browser-facing proxy:

```text
POST /api/v1/asks -> HTTP 422
{"error":"RUN_COST_ENVELOPE_MEMBER_UNRESOLVED","message":"No runCostEnvelope member matches the declared depth and effective risk tier"}
GET /new -> HTTP 200
<title>Dialectical Engine
```

After stopping only the isolated API:

```text
GET /api/v1/session with isolated API down -> HTTP 502
{"error":"API_UPSTREAM_UNREACHABLE","message":"The API upstream did not answer the proxy request."}
standing API 8790 still up -> HTTP 200
standing UI 3000 still up -> HTTP 200
```

The in-app browser runtime reported no available browser instance, so no rendered screenshot or form-click receipt is claimed. The HTTP proxy proof and `createDebate` behavioral test are real; rendered visual acceptance remains for the orchestrator/human browser seat.

## Advisory disposition

Rev2 review findings:

| Finding | Disposition |
|---|---|
| A1: source checks satisfied by imports | Fixed. The composition-root check asserts `deploymentRiskTier.value`; token call-site checks count the exact guarded statement twice in each component, and behavior tests cover both 401 and 403 clear vs network/500/502 retain. |
| A2: `looksAuthRelated` substring sniff | Fixed. Function and all three action-path calls deleted; no production occurrence remains. These currently unsupported actions display their error but cannot silently clear credentials from message prose. |
| A3: 422 collapses to typed `SERVER_FAILURE` | Fixed. `ContractErrorCode` has `UNPROCESSABLE`; status 422 maps to it while exact `serverCode` and message remain available. Exhaustiveness coverage includes the new member. |
| A4: proxy 502 renarrated as coordinator failure | Fixed. `API_UPSTREAM_UNREACHABLE` and HTTP 502/503/504 classify as `UNREACHABLE`, retain the token, and state that the coordinator was never reached. |
| A6: `logger: false` | Explicitly deferred. Enabling Fastify logging is an application-wide operational/security policy change (destination, redaction, retention and test/runtime configuration), not a safe one-line POL-01 behavior change. Rev2 restores truthful 500 status/body diagnostics for internal failures; a dedicated observability decision/ticket must own server logging. |
| A7: response Zod failure blamed on request | Fixed. Only request schemas cross `parseRequest` and receive `MalformedRequestError`; response-side Zod failures now stay 500. A facade test pins an invalid `submit` response to 500. |

Original accumulated ticket advisories:

| Advisory | Disposition |
|---|---|
| A3: deployment floor has env and register sources | Fixed. `readDeploymentRiskTier` loudly reads/validates/provenances the `riskTier` register row; `apps/api/src/main.ts` uses it, and `loadApiEnvironment` no longer requires `DEPLOYMENT_RISK_TIER`. Missing/NULL/invalid/provenance-free rows fail loudly. |
| A4: present NULL means absent in UI, invalid in engine | Fixed. Only a missing row projects typed absence (`null`); a present NULL row throws `RISK_TIER_POLICY_INVALID`. |
| A6: embedded NUL makes source audits skip adapter | Already fixed in pre-existing UI-02 work before this claim via escaped `\u0000` delimiters and `modelLedgerIdentityKey`. Audit result during POL-01: `adapter NUL bytes: 0`. POL-01 does not claim authorship of that hunk. |
| Token false-rejection sites | The two manual messages were already routed through `tokenUnlockFailureMessage`; POL-01 additionally fixed their unconditional token clearing and found/fixed both automatic stored-token paths. Remaining bare catches either decode local input, render an honest pending/unavailable state, or route to `/new`; none narrates an unobserved server verdict. |
| FAIR report `independence: undefined` | Fixed to print the recorded `independentAttackEdgeCount`; no new independence value is invented. |
| Ledger DR-158 | The packet orders DR-148..DR-158, but the repository ledger currently ends at DR-157 and `rg DR-158` finds only the packet reference. No DR-158 text was available to apply; no conflicting direction was inferred. |

## Inventory

- `apps/api/src/index.ts` — evaluation-stage `AskRefusal`, request-only malformed marker, exact refusal body, internal-submit/response faults on 500.
- `packages/contract/src/client.ts` — first-class `UNPROCESSABLE` plus preserved non-2xx server code/message.
- `apps/v2-ui/app/api/[...path]/route.ts` — explicit 502 transport-outage response; upstream HTTP responses remain passthrough.
- `apps/v2-ui/lib/v3/tokenUnlock.ts` — clear-storage decision only for observed rejection; named proxy/gateway outages classify unreachable.
- `apps/v2-ui/components/AuthGate.tsx` — automatic/manual checks retain tokens and narrate outages honestly.
- `apps/v2-ui/app/debate/[id]/DebatePageClient.tsx` — same automatic/manual action-token correction; dead substring-auth heuristic removed.
- `apps/v2-ui/components/DebateTree.tsx` and `NodeDetailDrawer.tsx` — dead substring-auth heuristics removed; unrelated shared UI-02 hunks preserved.
- `packages/register/src/index.ts` — canonical deployment `riskTier` row reader.
- `packages/register/src/runtime-environment.ts` — removes the second env policy source from API startup.
- `apps/api/src/main.ts` — composes effective risk from the canonical register row.
- `apps/v2-ui/lib/v3/adapter.ts` — present NULL is invalid; missing remains typed absence. This file contained unrelated pre-existing UI-02 edits, preserved untouched.
- `acceptance/run-acceptance.ts` — prints recorded independent attack-edge count instead of undefined.
- `tests/unit/api.test.ts` — behavioral evaluation-marker, internal-submit 500, response-contract 500, 422 and client-disclosure regressions.
- `tests/unit/v2ui-proxy.test.ts` — behaviorally distinguishes upstream 500 from transport 502.
- `tests/unit/pol01-policy.test.ts` — register source, NULL parity, `/new` data path, 502 classification, exact guarded token-clear sites and no-substring-sniff regressions.
- `tests/unit/v2ui-data-layer.test.ts` — `UNPROCESSABLE` added to closed client failure taxonomy coverage; unrelated shared UI-02 hunks preserved.
- `docs/missions/2026-08-06-v3-programming/handoffs/POL-01-progress.log` — required major-step timeline.
- This handoff.

## Rev2 final gates — real output

Root and v2-ui typechecks (run separately from Vitest):

```text
$ npx tsc --noEmit
exit 0

$ pnpm --dir apps/v2-ui run typecheck
$ tsc --noEmit -p tsconfig.json
exit 0
```

Root Vitest:

```text
Test Files  61 passed (61)
Tests       433 passed (433)
Duration    20.61s
```

Acceptance Vitest:

```text
Test Files  9 passed (9)
Tests       34 passed (34)
Duration    6.44s
```

Architecture audit:

```json
{"edgeRowsChecked":27,"violations":[]}
```

Source audit:

```json
{"blocking":[]}
```

Additional integrity evidence:

```text
git diff --check -> exit 0
adapter NUL bytes: 0
```

Two non-ticket commands are unavailable in this checkout and are not claimed green: `pnpm --dir apps/v2-ui test` points to missing `apps/v2-ui/scripts/run-node-tests.mjs`; the root-instruction template commands point to missing `tests/render-templates.sh` / `tests/lint-templates.sh`. The enforced root and acceptance Vitest suites above are green.

## Allowed-scope / dirty-tree attribution

The shared tree was dirty before claim. Pre-existing changes included UI-02 files (`DebateCanvas.tsx`, `NodeDetailDrawer.tsx`, `lib/types.ts`, most of `lib/v3/adapter.ts`, contract/serve/tests), the decisions ledger, and mission packets/reviews. They were neither reverted nor claimed. POL-01's adapter ownership is only the `riskTier` NULL-vs-absent hunk. Temporary live-proof files were placed/moved under `/tmp`; no generated Next directory remains in the repository.

## Risks and questions for V

- The original standing API on 8790 must be restarted by the authorized orchestration/acceptance seat before port 8790 itself serves the new mapping. Its current process remains healthy but has the old module loaded.
- No product/register values, schema, migration, model call, or provider call were introduced.
- No question for V blocks peer review. Rendered-browser visual acceptance is still outstanding because no browser instance was available in this seat.
