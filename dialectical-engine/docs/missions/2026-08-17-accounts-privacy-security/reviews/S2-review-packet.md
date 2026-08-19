# S2 dual-diamond review packet — Identity schema + tamper-evident audit

Ticket t_8e24b1c0, board accounts-phase1. Author: Codex (gpt-5.6-sol xhigh), session 01a01959. It blocked once on a packet contradiction (the ORCHESTRATOR's error, not codex's), then resumed same-session; no product code predates the 12:33 unblock. You are ONE of two blind lenses. **Refute, don't rubber-stamp.** READ-ONLY on source; running tests is REQUIRED.

## What was built
`migrations/0030_identity_foundation.sql`, Drizzle mirror for six identity tables, SHA-256 audit hash-chaining, HMAC email blind index, actor-key severance proof, api-side secret paths. Authority: wave-2 §9–13 **as amended** + V rulings VR-1/VR-2 (see `AMENDMENTS.md`). Codex-reported gates: 108 files / 751 tests; lint 28 edges 0 violations; real-Postgres identity suite 4/4.

## Scope (verify with `find -mmin`; codex window 12:33–12:46)
Expected: `migrations/0030_identity_foundation.sql`, `packages/db/src/{schema,index}.ts`, `packages/crypto/**`, `packages/register/src/runtime-environment.ts`, tests under `tests/`.
**Must be UNTOUCHED:** every `package.json` and `pnpm-lock.yaml` — the packet deferred dependency formalization to S6. Verify their mtimes predate 12:29. Ignore Aug-17 rename churn.

## Claims to verify
1. **VR-1:** the five identity tables (`user`, `mfa_factor`, `recovery_code`, `channel_binding`, `session`) are **MUTABLE** — UPDATE/DELETE succeed against real Postgres. Erasure of identity data is real deletion, never key-shredding.
2. **VR-2:** `identity.audit_event` is **append-only** (UPDATE/DELETE → SQLSTATE 55000) **and** hash-chained, with the actor stored as ciphertext under a per-user audit key. Verify the severance proof: destroying that key makes the actor unreadable **while the row bytes are unchanged and the chain still verifies**. If severance required mutating rows, that breaks append-only — BLOCK.
3. **Chain integrity (F1):** could `verifyChain` pass for the wrong reason? Tamper a row → must break. Simulate a gap → must break. Would it still pass if `this_hash` ignored `prev_hash`?
4. **Blind index (A2-10):** HMAC under a key **separate from the KEK**; same email → same index, different → different; not reversible without the key. Confirm no plaintext email column exists anywhere in the schema.
5. **A3-8:** the migration header enumerates **all** identity tables as ARMED (audit_event) vs UNARMED (the other five) with a reason each.
6. **A3-3:** the header (or an adjacent note) records the ruling that `core.run` ownership/visibility will be **append-only event tables**, never `UPDATE core.run`. This pre-empts S7/S8.
7. **A2-1:** no key material is persisted to Postgres — audit and blind-index keys live in the file secret store.
8. **No secrets in audit rows:** no passwords, tokens, TOTP seeds, recovery codes, prompts, or debate text.
9. **Gates:** `pnpm typecheck`, `pnpm lint` (28 edges, 0 violations), `pnpm test` green; no `process.env` outside `runtime-environment.ts`.

## Live world (the blocking lens must RUN it)
`./node_modules/.bin/vitest run` on the new identity/crypto tests; the real-Postgres integration test; `pnpm typecheck`; `pnpm lint`; enough of `pnpm test` to confirm the suite is green.

## Verdict
Write `reviews/S2-<lens>-verdict.md`: GREENLIGHT or BLOCK + numbered findings with file:line evidence. If BLOCK, state exactly what proof would change your mind. No commit/push.
