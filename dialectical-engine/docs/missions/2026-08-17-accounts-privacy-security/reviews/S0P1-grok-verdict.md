# S0′-1 Grok-lens verdict

**GREENLIGHT**

Ticket t_fabdb92f / S0′-1 deny-by-default `preHandler`. Blind lens: this file
does not cite or open the other diamond verdict. Scope was the three Codex
files only (`apps/api/src/index.ts` 2026-08-19 11:15:23, `tests/unit/api.test.ts`
11:11:42, `tests/integration/evaluator-addon-database.test.ts` 11:20:13). Aug-17
rename churn (`tsconfig.json` / `vitest.config.ts` / `pnpm-lock.yaml` at
15:29–15:31) was ignored.

This review did not edit product or test files.

## Findings

1. **Deny-by-default is real, not cosmetic. HOLD.**
   The hook at `apps/api/src/index.ts:140-152` refuses any matched route whose
   `request.routeOptions.config.auth` is not `"user"` (and not `"public"`) with
   `401 { error: "SESSION_REQUIRED" }` *before* `resolveSession` runs
   (`:144-146`). All 15 production registrations declare `{ config: { auth: "user" } }`
   (`:187, :191, :200, :204, :230, :236, :245, :255, :267, :272, :277, :283,
   :295, :299, :303`). `apps/api/src/main.ts` adds no extra routes.
   The new test (`tests/unit/api.test.ts:180-193`) registers
   `GET /test/undeclared-auth-policy` with **no** policy, sends a *valid*
   `x-user-dev-token`, and expects 401. **F1:** if the hook were removed, Fastify
   would run the handler and return `200 { exposed: true }`; if the hook only
   resolved sessions and omitted the undeclared-policy branch, the valid token
   would also yield 200. The assertion therefore fails unless deny-by-default
   is actually on the request path. Live: 24/24 including this case; independent
   inject against shipped `buildApi` also returned 401
   `{ error: "SESSION_REQUIRED" }`.

2. **Behaviour-identical under existing dev-token semantics. HOLD.**
   `resolveSession` (`apps/api/src/index.ts:125-135`) is unchanged: empty /
   non-string → `null`; else `asker:`/`session:` + sha256(token),
   `caller_scope` default `ASKER`, `ownership_provenance: "user_dev_token"`,
   `provisional_identity_model: true`. 401 body and header name are the same
   (`:147-150`). The pre-Codex “any string → 200” pin at
   `tests/unit/api.test.ts:557-561` (index) is still present, unedited, at
   `:595-599` after the +38-line insert — `x-user-dev-token: "other-user-token"`
   on a live `/v1/session` must be 200 + `caller_scope: "ASKER"`. `git diff` of
   `api.test.ts` is additions-only; no existing expect was inverted.
   Live inject of `"other-user-token"` returned 200 with
   `asker_id`/`session_id` digest `2ba6e46162d52d55a13fd77955463d58b072bf59317b1ed3c07733a6438caba3`,
   which is `sha256("other-user-token")`. Missing and whitespace tokens still
   401 `{ error: "SESSION_REQUIRED" }`. Operator header alone still 401
   (`tests/unit/api.test.ts:543-548`).

3. **404 vs 401 preserved. HOLD.**
   `apps/api/src/index.ts:141` returns early on `request.is404`, so Fastify’s
   synthetic 404 is not rewritten to 401. There is no existing unit case that
   injects a *genuinely nonexistent* path (the 404s in `api.test.ts:434` /
   `:475` are real routes returning domain 404s). Live inject of
   `GET /this-route-does-not-exist-s0p1` against the real `buildApi` returned
   Fastify `404 Not Found` **both** without a token and with
   `x-user-dev-token: "other-user-token"`. A 401 there would have been BLOCK.

4. **No `resolveSession(` remains in a handler body. HOLD.**
   Production occurrences are exactly the definition (`apps/api/src/index.ts:125`)
   and the single hook call (`:147`). Handlers read `request.session` (or
   `request.session.asker_id` / `session_id`). `GET /v1/dev/evaluator` binds
   `_request` and does not consume the session — same as the pre-refactor
   “resolve then discard” shape; the hook still requires a token. The new
   decoration test (`tests/unit/api.test.ts:195-216`) proves `request.session`
   is populated on a declared `auth: "user"` route.

5. **Evaluator-addon teardown is legitimate, not a hook cover-up. HOLD.**
   `tests/integration/evaluator-addon-database.test.ts:154-175` (`concurrencyPool`)
   swallows a pool `"error"` only when `stopping === true` **and**
   `error.code === "57P01"`. Any other idle-client error still throws; 57P01
   during the test body (before `stop()`) still throws. The helper is used only
   by the two above-`max` concurrency cases (`:449+`, `:482+`), which never
   import `buildApi`. A hook defect in `apps/api` cannot be the source of a PG
   admin-shutdown on an idle client in this file. Live: both concurrency tests
   passed (`keeps twelve same-run…`, `completes twelve distinct-run…`); the
   full suite exited 0 with no 57P01 flake this run.

6. **Architecture gates unbroken. HOLD.**
   `apps/api/src/index.ts` contains no `process.env`. No new package. The hook
   is `if`/`return`, not a new `switch` that would need `exhaustive()`.
   `pnpm lint` reported `{ "edgeRowsChecked": 27, "violations": [] }` and
   `{ "blocking": [] }`. `tests/architecture/scaffold.test.ts` passed,
   including “matches all 27 dependency-edge rows”. `pnpm typecheck` exited 0.

## Live commands (this lens; not the author log)

| Command | Result |
|---|---|
| `./node_modules/.bin/vitest run tests/unit/api.test.ts` | 24/24, exit 0 |
| `pnpm test` (`vitest run` / `tests/**`) | 104 files, **732/732**, exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0; `edgeRowsChecked: 27`; `blocking: []` |
| one-off `buildApi().inject` on a nonexistent path | 404 with and without token (`PROBE_OK`) |

## Residual (not BLOCK)

The 404-vs-401 property is enforced in source (`:141`) and held live, but it
is not pinned by a unit test in `tests/unit/api.test.ts`. That is a missing
regression pin, not a broken property. This lens did not add that test
(read-only). S5 must still invert the any-string pin; it was correctly left
alone here.

## What would have flipped this to BLOCK

- Undeclared-route test passing if the hook were deleted (failed F1).
- Inversion of `tests/unit/api.test.ts:595-599` (any string → not 200).
- A genuinely missing path returning 401.
- A remaining `resolveSession(` inside a handler body.
- Teardown swallowing non-57P01 errors, or a red `pnpm test` whose failure
  originated in the new hook.
- `edgeRowsChecked !== 27`, a new `process.env` in `index.ts`, or a red
  architecture/source audit.

**PEER REVIEW APPROVED**
