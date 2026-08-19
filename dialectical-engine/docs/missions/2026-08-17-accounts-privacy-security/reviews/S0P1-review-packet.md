# S0′-1 dual-diamond review packet

Ticket t_fabdb92f, board accounts-phase1. Author: Codex (gpt-5.6-sol xhigh),
session 01a01911-24e3-71f3-86b8-4a496b13c104. You are ONE of two blind lenses
(Opus + Grok); you do not see the other's verdict. **Refute, don't rubber-stamp.**
READ-ONLY on source: verify against the working tree, do not edit product/test files.

## What the ticket was
Collapse the 15 inline `resolveSession(request.headers["x-user-dev-token"])` +
401 checks in `apps/api/src/index.ts` into ONE deny-by-default `preHandler`,
**behaviour-identical**, under the existing dev-token semantics. Full packet:
`docs/missions/2026-08-17-accounts-privacy-security/logs/S0P1-packet.md`.
This is the enabling refactor that must land first and alone (per RESEARCH-CONCLUSIONS §5 / research/RC).

## True change scope (verified by the orchestrator via mtime)
Codex touched EXACTLY three files (work window 2026-08-19 11:10–11:23):
- `apps/api/src/index.ts` — the preHandler
- `tests/unit/api.test.ts` — new tests (+38 lines)
- `tests/integration/evaluator-addon-database.test.ts` — a teardown-scoped
  handler for an expected admin-shutdown PG 57P01 during pool stop (disclosed
  in the progress log as a pre-existing flaky teardown, NOT caused by the hook)

⚠ **Ignore the noisy `git diff`.** The working tree carries large uncommitted
churn from V's Aug-17 repo rename (tsconfig, vitest.config, pnpm-lock,
tools/orphan-audit, render/v2ui tests — all mtime Aug 17 15:29). Those are NOT
Codex's changes. Confirm this yourself: `find <file> -mmin -120` — only the
three files above are recent.

## Claims to verify (evidence, not agreement)
1. **Deny-by-default is real, not cosmetic.** A route with NO declared auth
   policy must return 401 (fail closed). Prove the new test actually exercises
   this — could it pass if the hook were removed? (F1 check.) Confirm all 15
   production routes are declared `auth: "user"`.
2. **Behaviour-identical.** Same 401 body `{error:"SESSION_REQUIRED"}`, same
   status, same `x-user-dev-token` header, same per-asker sha256 identity.
   CRITICAL: `tests/unit/api.test.ts` "any string → 200" assertion (the
   provisional-identity test) must STILL PASS and must NOT be inverted here
   (that is S5's job, later). If it was inverted, BLOCK.
3. **404 vs 401 preserved.** Codex claims it kept Fastify's synthetic 404 for
   genuinely nonexistent routes while denying real routes without policy.
   Verify a nonexistent path returns 404 (not 401) — a 401 there would leak
   route existence. This is a real security property; test it live.
4. **No `resolveSession(` remains in any handler body** — only the definition
   (~:125) and the single hook call (~:147). `request.session` is populated and
   handlers read it.
5. **The evaluator-addon teardown change is legitimate**, not masking a failure
   the hook introduced. Scrutinise it: does it swallow only the expected 57P01
   admin-shutdown, or could it hide a real error?
6. **Architecture gates unbroken:** `tests/architecture/scaffold.test.ts` green
   (no new `process.env` outside runtime-environment.ts; `edgeRowsChecked`
   unchanged at 27 — this ticket adds NO package); switch-exhaustiveness holds.

## Live world (the blocking lens must RUN it)
- `./node_modules/.bin/vitest run tests/unit/api.test.ts` — expect 24/24.
- `pnpm test` (full `tests/**`) — expect green (Codex reported 732 tests; note
  it flagged a flaky PG teardown race it handled — confirm the suite exits 0).
- `pnpm typecheck` and `pnpm lint` (the bespoke audits) green.

## Verdict
Write `docs/missions/2026-08-17-accounts-privacy-security/reviews/S0P1-<lens>-verdict.md`:
GREENLIGHT or BLOCK + numbered findings with file:line evidence. If BLOCK,
state exactly what proof would change your mind. No commit/push (V approves pushes).
