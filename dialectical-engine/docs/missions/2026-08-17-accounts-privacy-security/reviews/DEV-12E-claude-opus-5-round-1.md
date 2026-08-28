# DEV-12E external review — Claude Opus 5, round 1

- Date: 2026-08-27
- Model: `claude-opus-5` (Anthropic first-party)
- Session: `bca71b37-157d-407f-b579-0d65c91eb039`
- Mode: read-only (`Read`, `Grep`, and `Glob`; no edit, shell, or web tools)
- Frozen input: [`DEV-12E-freeze.sha256`](../logs/DEV-12E-freeze.sha256)
- Verdict: **BLOCK**

## Blocking findings

1. **P1 — provider post-listen socket errors bypassed supervision.**
   `apps/runner/src/dev-local-provider.ts` removed its sole `error` listener after
   `listen`, so an accept-path error could throw outside the awaited supervisor,
   preventing the normal reverse-order shutdown of TLS, UI, runner, API,
   provider, and data plane.
2. **P1 — per-run terminal facts included a global scorecard-cell count.**
   `migrations/0049_terminal_recorded_facts.sql` counted every
   `scorecard.scorecard_cell`, so a foreign run could change Q56 activation for
   the subject run and make settlement refuse.

## Non-blocking findings and requested evidence

- Verify the migrated runtime role has no direct INSERT privilege on
  `core.provider_probe`; `REVOKE ... FROM PUBLIC` alone would not remove an
  older role-specific grant.
- Record the provider target/receipt drift risk and discovery single-flight as
  P2 residuals or repair them in this pass.
- Add `apps/api/src/index.ts` and `apps/api/src/publications.ts` to the next
  frozen review scope so the publication step-up claim is directly reviewable.
- Expand behavioral coverage for the real provider fault path and the SQL
  terminal-facts capability; source-string assertions alone were insufficient.

## Required next action

Return DEV-12E to implementation, reproduce both P1s with behavioral RED tests,
repair them narrowly, prove runtime-role ACLs and cross-run isolation on real
PostgreSQL, refreeze the expanded scope, and request a second terminal review.
