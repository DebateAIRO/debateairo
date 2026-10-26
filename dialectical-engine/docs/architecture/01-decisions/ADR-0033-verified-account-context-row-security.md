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
- A predicate that reaches the account through a parent (`EXISTS` over a parent row the context owns) holds only when a
  request login cannot make an own parent row that matches another account's child: the compared parent columns are a
  unique key, every child row has its parent by a validated foreign key, and no request login re-keys the parent.
  Otherwise the table carries its own owner column, filled by its writer, and its predicate is the owner one:
  `billing.cancel_token` keyed on `billing.subscription_event.subscription_id`, a key any account may append under its
  own owner, so one own event naming another account's subscription read that account's cancel links (REV-S01-p1-security
  B1, measured); since V-15's default it keys on its own `owner_ref`. `tests/integration/rls-catalog.test.ts` S6.4-e
  sweeps every parent predicate against these conditions; S6.4-f requires that no child row may lack its parent row.
  Six billing tables failed the foreign-key condition (saved cards, their revocations, NETOPIA notices, their outcomes
  and raw copies, quarantined notices: FIX-S01-p1a NEW-1, measured); no signed-in request reads them on a request
  login, so since V-17's default their request-login predicate is `false`, as `billing.outbox`'s is.
- A row keyed on its own owner may still NAME an entity of another account that a cross-account reader then acts on for
  that account: a subscription event or cancel link naming another account's subscription let the public cancel page
  cancel that plan (FIX-S01-p1a NEW-2, measured), and a subscription event naming another account's saved card would let
  a renewal charge it. Since V-18's default a row written under an account's context may name only a subscription with no
  event yet or whose first event is the context's, and only a saved card of the context's customer: the trigger guard
  `billing.guard_own_references()` on the five tables that name a subscription refuses anything else (42501). It is a
  trigger, EXECUTE-able by no login, because a function a request login may EXECUTE answers R42's calls, and a
  "may name" answer is true for an id no row carries (FIX-S01-p1e: two such definers made `rls:proof` print `widened=1`).
  The owner predicate is also ANDed with a run the context owns (`rls.owns_run`) or a parent row the request login can
  see (`EXISTS`). `cancelByToken` also refuses a link whose owner is not its subscription's first owner.
  `tests/integration/rls-forgery.test.ts` S6.3-F12 writes each of the ten members, once naming the other account's
  entity (refused) and once naming its own (accepted).
- A statement on a request login costs one InitPlan per policy evaluation (re-hash and session lookup); measured once
  (25.1 ms for a full scan of 1,001 runs), otherwise UNVERIFIED.
- Code that runs on a system login (the billing runtime, background loops, the listed sites) is not limited by row
  security; that boundary is recorded per reader in S01 DECISIONS D36.
- Rejected: a plain owner-id setting (forgeable), an HMAC blob signed by the API (the key sits with the attacked
  login), one role per account, a definer-only data layer, `SET LOCAL` per statement, a session-level setting left on
  idle connections (S01 DECISIONS D27, D29).
