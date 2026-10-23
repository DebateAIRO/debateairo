# ADR-0033 — The database derives the account itself: a verified session credential, row security on every account table, and system logins for cross-account work

- **Status:** Proposed (mission `row-level-security`, slice S01, ARCH(S01) pass 1, 2026-10-23); accepted when REV(S01)
  passes and V does not veto the slice; lands on `dev` with the slice.
- **Deciders:** `ARCH(S01)` seat ARCH-S01, ticket `t_39b2b8c2`. The WHAT is V's (V-2 "verified context", V-1 "one
  drained release"); this ADR is the HOW. Two V rows bind parts of it by their defaults (S01 DECISIONS D41, D48).
- **Number:** 0033 — `ls` of this directory in the lane on 2026-10-23 ends at ADR-0032; gaps are not reused.
- **Relates to:** ADR-0003 (Postgres access and migration tooling), ADR-0013 (authorization tiers), ADR-0027 (only
  `runtime-environment.ts` reads the environment); `docs/missions/row-level-security/slices/S01/SPEC-v4.md`,
  `PLAN.md` and `DECISIONS.md` D27-D53.

## Context

Until 0124 the API's two request logins could read every account's rows of 113 relations; ownership was enforced only
by the API's own `WHERE` clauses (audit finding L5-F12). An SQL-injection bug, or any query that forgot its owner
predicate, read other accounts. V asked for a context the database derives and checks itself, so that nothing an API
login can write — a setting, a role, a function argument — makes the database derive another account.

## Decision

1. **The credential, not an identity, crosses the wire.** For each statement a signed-in request makes, the API writes
   the request's raw session token into the custom setting `debateai.session_credential` with a bind parameter at
   checkout and clears it before the connection returns to the pool; a connection that comes back inside a transaction
   block (open or aborted), or with a statement still in flight that leaves it inside one once the clear has run, is
   destroyed instead, because a later `ROLLBACK` would restore a value set before that block (S01 DECISIONS D58, D72,
   measured). Policies never read the setting directly: they
   call migrator-owned `SECURITY DEFINER` functions in schema `rls` (`search_path = pg_catalog`) that hash it exactly as
   `hashToken("session", …)` does and look it up in `identity.session` (not revoked, CSRF hash set, idle and absolute
   expiry in the future). A forged value yields no account.
2. **Row security on every account table, never forced.** Each in-scope table gets `ENABLE ROW LEVEL SECURITY` and two
   permissive `FOR ALL` policies: `rls_account` `TO debateai_runtime` (the per-account predicate, `USING` = `WITH
   CHECK`) and `rls_all_accounts` `TO` the cross-account roles (`true`). No policy reaching a request login admits more
   than one account; the migrator owns the tables and stays outside row security.
3. **Cross-account work runs on logins the request logins cannot borrow.** The API holds two system logins mirroring
   its two request logins (`api-system`, `api-authorization-system`), each a member of the marker role
   `debateai_rls_all_accounts`; the runner and scheduler-liveness logins hold the marker too. In the API, a statement
   made outside any request scope goes to the pool's system target, and an in-request cross-account site is wrapped
   in `crossAccount("<id>", …)` or built on `crossAccountPool(pool, "<id>")`; the ids are pinned by an architecture test.
4. **Views apply the invoker's security** (`security_invoker = true`).
5. **The forward chain can amend an earlier step's postcondition by record.** A step may declare
   `amendsPostconditionsOf`; the chain stores the amended step's re-measured digest with the declaration, and every
   later `migrate()` compares against it, so an unrecorded change still refuses.

## Consequences

- Every new account-keyed table must get the two policies in the migration that creates it (its predicate one of the
  shapes of S01 DECISIONS D32), and every new repository method that must read across accounts must take an id and
  be added to the pinned site list; a missed one reads zero rows of other accounts, it does not fail open.
- A statement on a request login costs one InitPlan per policy evaluation (re-hash and session lookup); measured once
  (25.1 ms for a full scan of 1,001 runs), otherwise UNVERIFIED.
- Code that runs on a system login (the billing runtime, background loops, the listed sites) is not limited by row
  security; that boundary is recorded per reader in S01 DECISIONS D36.
- Rejected: a plain owner-id setting (forgeable), an HMAC blob signed by the API (the key sits with the attacked
  login), one role per account, a definer-only data layer, `SET LOCAL` per statement, a session-level setting left on
  idle connections (S01 DECISIONS D27, D29).
