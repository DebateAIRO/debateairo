# ADR-0026 — A system publication has its own SECURITY DEFINER function, and never a session or a grant

- **Status:** Accepted (mission `free-public-debates`, slice S01, 2026-09-20)
- **Deciders:** `ARCH(S01)` seat ARCH-S01, ticket `t_eff46252`. V's intake I-1 is the product ruling this ADR instantiates; rows V-1…V-6 bind the edge cases. SPEC of record: `docs/missions/free-public-debates/slices/S01/SPEC-v2.md`.
- **Supersedes / relates to:** ADR-0024 (plan-tier storage and how a `SECURITY DEFINER` function may be redefined — signature unchanged, never `DROP` then `CREATE`). Does not change ADR-0024.

## Context

Owner-driven publish is gated inside the database. `core.transition_run_publication`
(`migrations/0040_account_erasure.sql:3946-4147`, `SECURITY DEFINER`, 14 parameters) returns
NULL unless a live `identity.session` row, a live `identity.step_up_grant` row and a live
`identity.publication_event_binding` row all match. The grant lookup is:

```
SELECT step_grant.step_up_grant_id INTO v_grant_id
FROM identity.step_up_grant AS step_grant
WHERE step_grant.token_hash=p_grant_token_hash
  AND step_grant.session_id=p_session_id AND step_grant.user_id=p_user_id
  AND step_grant.action=p_action AND step_grant.target_run_id=p_run_id
  …
```

(`0040_account_erasure.sql:4014-4022`.) There is no input the system path can present that
satisfies this predicate without inserting a session or a grant that no user minted.

V ruled (I-1) that a Free run's served answer is published by the server itself, with no
step-up grant for that system path, and that the owner-driven path and Premium stay as they
are. SPEC R-20 then requires that the audit row of a system publish be classifiable as the
system by reading that row alone, and that it carry no session id, grant id or grant token
hash belonging to a session or grant that never existed.

`serve.publication_key_provision_intent` (`0040_account_erasure.sql:1017-1023`) is not
reusable either: `session_id uuid NOT NULL REFERENCES identity.session` and
`grant_token_hash text NOT NULL CHECK (grant_token_hash ~ '^sha256:[0-9a-f]{64}$')`.

ADR-0024 already records that redefining a `SECURITY DEFINER` function is
`CREATE OR REPLACE` with the signature unchanged, never `DROP` then `CREATE`, because a DROP
discards the EXECUTE grant and no embedded-postgres test (running as the schema owner)
notices. The owner-driven function's grant is `0040_account_erasure.sql:4157-4160` to
`debateai_runtime`.

## Decision

1. **The owner-driven function is not widened.** `core.transition_run_publication` keeps its
   14-parameter signature and its three live-row gates. Premium and owner-driven Free
   publishes continue to call it.
2. **System publish is a new function** `core.transition_system_run_publication`,
   `SECURITY DEFINER`, `SET search_path = pg_catalog`, `REVOKE ALL FROM PUBLIC`,
   `GRANT EXECUTE TO debateai_runtime`. It accepts no session id and no grant token hash.
   It does not read `identity.session`, `identity.step_up_grant` or
   `identity.publication_event_binding`.
3. **System key provision is a new table** `serve.system_publication_key_provision_intent`
   with no session or grant columns, plus `serve.prepare_system_publication_key_provision`
   / abandon / claim-cleanup siblings granted to `debateai_runtime` (prepare/abandon) and
   `debateai_publication_cleanup` (claim/complete), matching the owner-driven split at
   `0040_account_erasure.sql:6370-6377`.
4. **The audit actor of a successful system publish, and of a failed auto-publish attempt,
   is the literal text `system:free-public-auto-publish`** written to
   `identity.audit_event.actor_key_ref`. The TypeScript application does **not** call
   `identity.append_audit_event_internal` (revoked from `debateai_runtime` at
   `migrations/0040_account_erasure.sql:6211-6213`). Failed attempts that never enter the
   transition are written by `identity.audit_system_publication_attempt`, `SECURITY DEFINER`,
   `GRANT EXECUTE TO debateai_runtime`. Successful ALLOW rows are written inside
   `core.transition_system_run_publication` (also `SECURITY DEFINER`). Owner-driven writes a
   UUID (`v_audit_actor_ref::text`). A test classifies system vs user by
   `actor_key_ref = 'system:free-public-auto-publish'` on that row, with no join.
5. **No phantom identity rows.** A system publish inserts no `identity.session` row, no
   `identity.step_up_grant` row, and no `identity.publication_event_binding` row. The
   snapshot's `created_at` and the public envelope's `published_at` are the same
   `timestamptz` the caller passed (R-22.2). The visibility `warning_version` on a system
   publish is `PUBLIC_INDEXED_V1`, the same value the owner-driven PUBLISH branch writes
   (`0040_account_erasure.sql:4067`).

## Consequences

- Two publication functions exist. Callers must not route an owner request through the
  system function, or a system request through the owner function. The API's
  `PublicationApplication.publish` stays on the owner function; `tryAutoPublish` uses the
  system function.
- Tests that prove the system path must `SET ROLE debateai_runtime` (or the test will pass
  as the schema owner and miss a 42501 on the real database). Tests that prove the owner
  path still requires a live grant must keep calling `core.transition_run_publication`.
- A later migration that needs to change the owner-driven function still uses
  `CREATE OR REPLACE` with the 14-parameter signature. The system function is a separate
  object with its own signature and its own GRANT.
- The well-known UUID `00000000-0000-4000-8000-0000000000f1` fills
  `core.run_visibility_event.actor_audit_token` (typed uuid, so it cannot hold the actor
  literal). It is not the R-20.3 oracle; the audit row is.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Extra/NULL-able parameters on `core.transition_run_publication` | Signature change. Authorization change of the owner path. DROP/CREATE risk to the existing EXECUTE grant. |
| Overload of the same name with a different arity | Two GRANTs on one name; a later `DROP FUNCTION` with the wrong arity discards the owner grant. |
| Fabricated session + grant rows so the owner function can run | R-20.4. Also a live `step_up_grant` for `PUBLISH` would make R-4's grant-count check fail. |
| Put the system actor in `actor_audit_token` only (a UUID) | R-20.3 requires classification from the audit row alone; a UUID is the same shape the owner path writes. |
