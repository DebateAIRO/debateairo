# Goal packet — S0′-1 · Deny-by-default preHandler (the enabling refactor)

Board `accounts-phase1`, ticket S0′-1. Coder: Codex (gpt-5.6-sol, reasoning xhigh / "Max").
Progress log (append one line per major step):
`docs/missions/2026-08-17-accounts-privacy-security/logs/S0P1-progress.log`

## Why this ticket exists (read first)

The adversarial review (RESEARCH-CONCLUSIONS.md §5, research/RC) proved that
`apps/api/src/index.ts` is the mission's real serializer: **15 route handlers
each call `resolveSession(request.headers["x-user-dev-token"])` inline**, and
the three expensive Phase-1 slices (sessions S5, authorization S7, dev-token
retirement S9) each rewrite that same idiom at all 15 sites. Splitting the
file into route modules does NOT help (it multiplies the touched-file count).
The fix is to **collapse the 15 inline checks into ONE deny-by-default
`preHandler` hook now, under the existing dev-token semantics**, so every later
auth change is a single edit in one place. This ticket changes NO behaviour —
it is a pure refactor that must be byte-for-byte behaviour-preserving.

## The current shape (evidenced)

- `apps/api/src/index.ts:113-123` — `resolveSession(token, scope="ASKER")`:
  returns `null` for empty/non-string, else `{asker_id:"asker:"+sha256(token),
  session_id:"session:"+..., caller_scope, ownership_provenance,
  provisional_identity_model:true}`. **Do not change its logic in this ticket.**
- 15 call sites at lines 162,168,179,185,213,221,232,244,258,265,272,280,294,
  300,306 — each `const session = resolveSession(request.headers["x-user-dev-token"])`
  then `if (!session) { reply.code(401); return { error:"SESSION_REQUIRED" }; }`.
- Fastify instance built in `buildApi()` (`:125-311`); `Fastify({ logger:false })`
  (`:126`). There are currently ZERO Fastify hooks (`addHook`/`preHandler`).

## Contract (what DONE means)

1. **One deny-by-default authentication `preHandler`** registered on the Fastify
   instance in `buildApi()`. It resolves the session from
   `x-user-dev-token` via the EXISTING `resolveSession`, and on failure replies
   `401 { error: "SESSION_REQUIRED" }` exactly as today. On success it attaches
   the resolved session to the request (e.g. `request.session`) via a typed
   decoration, so handlers read `request.session` instead of re-resolving.
2. **Deny-by-default:** the hook must refuse any route that has NOT explicitly
   declared an auth policy. Implement an explicit per-route policy declaration
   (e.g. a route-config flag `{ config: { auth: "user" | "public" } }` or an
   allow-list keyed by method+path). A route with no declared policy returns
   401 (fail closed), and **a test asserts that adding a route without a policy
   fails.** Today every one of the 15 routes is `user`; encode that. If any
   route is intended public later (none are today), it still must be declared.
3. **Delete all 15 inline `resolveSession(...)` + 401 blocks** from the handler
   bodies; handlers now read `request.session`. `resolveSession` itself and its
   any-string semantics are UNCHANGED (S5 replaces them later).
4. **Zero behaviour change.** Same 401 body, same status, same header name, same
   per-asker identity derivation. The dev token still works exactly as before.
   `provisional_identity_model` stays true.
5. **Tests:**
   - Existing auth tests stay green UNCHANGED — especially
     `tests/unit/api.test.ts` (incl. the :557-561 "any string → 200" assertion,
     which is still correct until S5; do NOT invert it here).
   - Add: a route with no declared policy → 401 (the deny-by-default proof).
   - Add: `request.session` is populated on success and handlers use it (no
     remaining `resolveSession(` call inside any handler body — grep proof).
   - `acceptance/ceremony.test.ts` cross-owner 404 (:475-480) stays green.
6. **File contract (touch ONLY these):** `apps/api/src/index.ts`,
   `packages/contract/src/index.ts` (only if a shared `Session`/policy type is
   needed — do not touch `contractInventory.routes`), and test files under
   `tests/`. **NO** migrations, NO register rows, NO new packages, NO `web/`,
   NO `apps/ui`. If you believe the contract must widen, STOP and post
   `CODEX BLOCKED` on the ticket — do not widen it yourself.
7. **Architecture gates:** `tests/architecture/scaffold.test.ts` must stay green
   — do NOT add a `process.env` read (the audit forbids it outside
   `runtime-environment.ts`), and every new `switch` needs `default:`+
   `exhaustive()`.

## Out of scope (do NOT do in this ticket)
Real credentials, cookies, CSRF, headers, encryption, ownership columns,
`caller_scope`-from-session (that is S7), dev-token removal (S9). This ticket
ONLY collapses 15 inline checks into one hook, behaviour-identical.

## Gates before READY
- `pnpm typecheck` green · `pnpm test` green (the full `tests/**` suite) ·
  `pnpm lint` (the bespoke architecture/source audits) green.
- Post `READY FOR PEER REVIEW` as a ticket comment with the diff summary +
  test evidence + a grep proof that no `resolveSession(` remains in a handler
  body.

## Return rule (spine §4)
Return control at READY FOR PEER REVIEW, a genuine blocker (CODEX BLOCKED with
exact reason), or an IMPORTANT OPERATION. Keep the session resumable. Silence
is normal. Do NOT commit or push. Termination requires the dual diamond
(Opus + Grok) greenlighting — which happens after your handoff.
