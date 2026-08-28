# DEV-11E Grok 4.6 review packet

Verdict requested: exactly `GREENLIGHT`, or `BLOCK` with concrete P0/P1
file/line evidence and the smallest repair. This is a read-only review of one
small completed Kanban card; do not edit the repository.

## Ticket

**DEV-11E · Create and reload one private QA debate**

From the authenticated real HTTPS browser, create one private debate through
the production API, prove it commits through the restricted runtime principal,
and prove the exact debate remains readable and listed after hard reload.

## Review boundary

- `apps/runner/src/dev-api-environment.ts`
- `apps/runner/src/dev-api-process.ts`
- `packages/db/src/index.ts`
- `packages/liveness/src/index.ts`
- `packages/memory/src/index.ts`
- `migrations/0040_account_erasure.sql`
- `tests/integration/dev-api-environment.test.ts`
- `tests/integration/dev-api-process.test.ts`
- `tests/integration/dev-database-principals.test.ts`
- the bootable-local-stack and browser-deletion rows in
  `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md`

Treat unrelated dirty-worktree files as out of scope.

## Reproduce-first failures and repairs

1. The first authenticated browser submission reached the real API but refused
   server-owned private content because the local environment still set
   `CONTENT_ENCRYPTION_ENABLED=false`. The dev environment and launcher now
   require exact `true`; the register, external key store, and production run
   provisioning path are unchanged.
2. With encryption enabled, the restricted runtime principal failed with
   `42501` while reading `core.provider_probe`. The repository now reads only
   the latest requested provider rows through
   `core.latest_provider_probes(text[])`; direct table access remains denied.
3. The next failure was `42501` on the private erasure carriers in liveness and
   memory. Owner-scoped reads now use
   `core.run_private_content_is_live(uuid)` for encrypted runs; direct erasure
   table access remains denied.
4. Memory persistence then reached its canonical run lock and failed because
   the runtime principal intentionally has no `UPDATE` privilege on `core.run`.
   `core.lock_owned_live_runs(uuid[],uuid,text)` is a bounded, deduplicated,
   mutually-exclusive owner-scope, `SECURITY DEFINER` capability. It locks only
   currently owned/live runs and grants only EXECUTE to `debateai_runtime`;
   runtime receives no table-write privilege. All MemoryRepository run-lock
   call sites use this capability and retain post-lock ownership/live
   revalidation.

The first failed submission committed an encrypted run before the downstream
memory failure. It is deliberately retained as evidence rather than manually
rewritten. After the repair, a distinct second browser submission returned
`QUEUED` without an error.

## Evidence on current bytes

- Actual restricted-runtime PostgreSQL regression:
  `records memory through the actual runtime role without erasure-table SELECT`
  — `1/1` GREEN. It proves direct erasure-table `SELECT` remains `42501`, the
  ownership-checked lock capability returns the exact owned run, one memory
  question commits, and no table-write grant is added.
- Memory/serve unit group — `34/34` GREEN.
- Root `pnpm typecheck` — GREEN.
- Fresh/replay application of `0040_account_erasure.sql` to the durable local
  PostgreSQL database — GREEN with `ON_ERROR_STOP=1`.
- Deterministic local provider was contacted through its real
  OpenAI-compatible HTTP endpoint before a fresh `HEALTHY` probe receipt was
  recorded. This is local QA state, not a production provider bypass.
- Real authenticated HTTPS browser:
  - submission returned `Queued` at
    `/debate/142467b2-cb1c-4c2e-a153-d5cbcc35c1e1`;
  - hard reload preserved the exact claim and queued state;
  - home hard reload showed `2 total` private debates, including the fresh
    exact claim and the retained failed-attempt run;
  - public library remained `0 total`.
- The supervisor honestly reports
  `DEV_AUTH_STACK_READY=https://localhost:3000:RUNNER_NOT_STARTED`; this card
  proves durable creation/reload, not debate completion.
- `git diff --check` — GREEN.

## Review questions

Return `BLOCK` only for a concrete P0/P1 in the bounded card, especially:

1. Does either capability permit unowned/inactive/erased run disclosure or a
   broader lock/write primitive than the production path needs?
2. Does the memory candidate query preserve legacy plaintext compatibility
   while refusing shredded encrypted content?
3. Can any runtime direct-table privilege now bypass the intended erasure or
   ownership boundary?
4. Is the browser evidence sufficient and scope-honest for saved/reloaded
   debate creation despite the deliberately absent runner?

