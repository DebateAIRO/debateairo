# DEV-01 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_a35fe261`, **DEV-01 · Specify one-command local-auth topology and invariants**.

Ticket-owned files:

- `docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.json`
- `docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.md`
- `tests/architecture/dev-local-auth-topology-spec.test.ts`

This is a specification ticket only. No package script, runtime behavior, service, database, principal, secret, certificate, mail, account, or trust-store mutation is authorized or claimed.

## Required outcome

- One exact future up/stop/reset command contract with current implementation status stated honestly.
- Exact long-lived services, loopback endpoints/ports, public HTTPS origin, and exposure rules.
- Exact persistent custody paths and modes.
- Exact migration/runtime/content-provision/erasure/Hatchet principal memberships, forbidden memberships, ownership, and connection purpose.
- Ordered startup and complete boot attestations without weakening production HTTPS, Origin/CSRF, Secure cookies, role witnesses, key file rules, or register reads.
- Sendmail-compatible local capture without direct identity seeding.
- Non-destructive stop and explicit confirmation-gated reset.
- Source gate proving the contract matches current loader, API, UI, and compose facts while the unimplemented command remains unpublished.

## Design summary

The future public origin is byte-exact `https://localhost:3000`. A TLS front door is the only public-loopback listener. UI moves privately to `127.0.0.1:3001`, API stays at the existing `127.0.0.1:8790` convention, Postgres uses private loopback `55432`, and Hatchet keeps vendor ports `8888`/`7077` privately. Mail capture is a sendmail-compatible file sink with no network listener.

All state is beneath `.local/dev-auth`, which must be gitignored before its first runtime write. Directories are 0700; operator/key files are 0600; KEK, blind-index key, and audit source salt are 32 raw bytes. Stop preserves state. Reset is separate, resolves/rejects unsafe targets, and requires `DELETE_LOCAL_AUTH_DATA`.

The application uses distinct wrapper LOGINs for `debateai_runtime`, `debateai_content_provision`, and `debateai_erasure_runtime`; each has the exact current test-proven attributes, no cross-role/`pg_*` membership, and no ownership. The one-shot migrator owns the application database and ten ordinary migration-created schemas and is never a service credential. Migration 0023's `evaluator` schema remains owned by NOLOGIN `debateai_evaluator_ddl`, now pinned directly by the source test. Hatchet owns only its separate database.

The startup sequence preflights trust/ports/custody, starts Postgres, verifies principals, applies plus replays migrations, seeds the complete sealed production register, verifies/generates persistent secrets, starts Hatchet and mail capture, then production API, private UI, and TLS edge. Readiness performs only non-mutating/static/negative security checks; it does not fabricate an auth account. The operator later tests the real sign-up → captured mail → TOTP → login path.

## RED / GREEN

- RED: the focused architecture test failed with `ENOENT` for the absent topology JSON; the independent current-source-facts test was already GREEN.
- GREEN: focused architecture contract `2/2`.
- Root `pnpm run typecheck`: exit 0.
- `git diff --check`: exit 0.

SHA-256:

- topology JSON: `a7a13ebd2ddef630ffb1e3c236b9cf094e3fec6ed9ee955e2ef0aa2b60c9567b`
- topology documentation: `90b19f8928606d92b2befbb6e7f37d44a0943cf86d1493c205cdc3c05e094545`
- architecture test: `9dd2800ed3de8ac1a5ad7aab1f83ff206316eb03bccf4025b1a33a602d323c05`

## Requested verdict

Inspect the three scoped files and the cited current source facts. Return exactly one of:

- `GREENLIGHT` if DEV-01 is an implementation-ready and scope-honest topology contract with no bounded P0/P1 design issue; or
- `BLOCK` with concrete file/line evidence, the unsafe/ambiguous/missing invariant, and the smallest documentation/test repair.
