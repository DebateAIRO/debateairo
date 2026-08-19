# S0′-1 — Opus lens verdict

**GREENLIGHT**

Ticket t_fabdb92f (board accounts-phase1). Author: Codex. Reviewed adversarially
against the live working tree; every claim verified by running the code, not by
trusting the handoff.

## Scope confirmation
`find … -mmin` confirms EXACTLY three files are recent — no more, no less:
- `apps/api/src/index.ts`
- `tests/unit/api.test.ts`
- `tests/integration/evaluator-addon-database.test.ts`

The rest of `git diff` is V's Aug-17 rename churn (DebateAI-V3 pgdata deletes,
AGENTS.md/CHANGELOG deletes, etc.) — correctly NOT attributed to the author.

## Findings

1. **Deny-by-default is real, not cosmetic — F1 PASSES.**
   `apps/api/src/index.ts:140-152` — the preHandler reads
   `request.routeOptions.config.auth`; anything that is neither `"public"` nor
   `"user"` returns `401 {error:"SESSION_REQUIRED"}`. The new test
   `tests/unit/api.test.ts:180` registers `/test/undeclared-auth-policy` with NO
   config and asserts 401 + exact body. Traced: delete the preHandler and that
   handler returns `{exposed:true}` at 200 → the test fails. It is therefore NOT
   worthless; it genuinely exercises fail-closed. (The companion test at :192
   would likewise return `undefined` and fail its `toMatchObject` if the hook
   were removed.)

2. **All 15 production routes declared `auth:"user"`.** Grep of every
   `api.get/post` registration (index.ts:187–303) shows all 15 carry
   `{ config: { auth: "user" } }`. No route in the file is public and none was
   left un-migrated, so nothing is unexpectedly fail-closed. Route count matches
   the ticket exactly.

3. **Behaviour-identical — provisional identity NOT inverted.**
   `tests/unit/api.test.ts:164-176` still asserts `x-user-dev-token: "test-token"`
   → **200** with `provisional_identity_model: true`, `caller_scope: "ASKER"`,
   `ownership_provenance: "user_dev_token"`. The "any string → 200" assertion is
   intact and un-inverted (inverting it is S5's job). The hook calls
   `resolveSession(request.headers["x-user-dev-token"])` with the same default
   ASKER scope as the removed inline checks; operator-token-on-user-route → 401
   is preserved (api.test.ts:546). Same 401 body, same status, same header.

4. **404 vs 401 preserved — leak-free, verified LIVE.** Ran an in-repo injection
   probe (then deleted it): GET `/definitely/not/a/route` with a valid token →
   **404** (`"Route GET:… not found"`), and without a token → **404**. The
   `if (request.is404) return;` guard (index.ts:141) lets Fastify's synthetic 404
   stand, so route existence is NOT leaked via 401.

5. **No `resolveSession(` remains in any handler body.** Only occurrences are the
   definition (index.ts:125) and the single hook call (index.ts:147). All 15
   handlers read `request.session`; `api.decorateRequest("session")` +
   `request.session = session` populate it.

6. **Evaluator-addon teardown change is legitimate, not a mask.**
   `tests/integration/evaluator-addon-database.test.ts:154-175` — the
   `concurrencyPool` error handler swallows an error ONLY when
   `stopping === true` AND `error.code === "57P01"` (admin shutdown during
   `pool.end()`). During the test body (`stopping=false`) every error is
   re-thrown loud; any non-57P01 error during shutdown is re-thrown loud. It
   cannot hide a real failure introduced by the preHandler (which is in a
   different app entirely, unrelated to this pg-pool integration test). Narrow
   and correct. (Minor observation, non-blocking: bundling this pre-existing
   flaky-teardown fix is mild scope creep, but it was disclosed and is harmless.)

7. **Architecture gates unbroken.** `pnpm lint` → `edgeRowsChecked: 27`,
   `violations: []`, `blocking: []` (unchanged; no package added). `grep process.env`
   in index.ts → 0 (none added). `tests/architecture/scaffold.test.ts` → 8/8 green.

## Live world (all RUN)
- `vitest run tests/unit/api.test.ts` → **24/24 passed**.
- `pnpm typecheck` (`tsc --noEmit`) → clean.
- `pnpm lint` (architecture + source audits) → clean.
- `pnpm test` (full `tests/**`) → **104 files, 732 tests passed, exit 0**. No PG
  teardown flake observed this run.

Nothing to refute. The refactor is behaviour-identical, fails closed, does not
leak route existence, and the new tests cannot pass with the hook removed.
No commit/push performed (V approves pushes).
