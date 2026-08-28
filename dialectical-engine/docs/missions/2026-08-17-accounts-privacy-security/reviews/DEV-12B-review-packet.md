# DEV-12B review packet

## Ticket

**DEV-12B · Refresh production maker handshakes and pin all responders**

Kanban: `t_c1e1a5c5` (Done)

## Intended behavior

The API must validate a trusted target for every configured provider. On ask
admission it may reuse a matching fresh observation; otherwise it performs one
bounded handshake per stale target, appends HEALTHY or ABSENT evidence, and
returns every HEALTHY responder in configured order. One unavailable maker must
not erase the successful responders.

## Changed surface

- `apps/api/src/provider-discovery.ts`
- `apps/api/src/main.ts`
- `packages/register/src/runtime-environment.ts`
- `apps/runner/src/dev-api-environment.ts`
- `apps/runner/src/dev-api-process.ts`
- focused unit and development-environment tests

## Evidence

- RED 1: the focused test failed with `ERR_MODULE_NOT_FOUND` because production
  had no discovery resolver.
- RED 2: after adding the resolver, the entrypoint assertion failed because
  `apps/api/src/main.ts` still used the stale-row-only path.
- GREEN: production discovery plus the affected development environment/process
  selection passed `8/8`; adjacent API-environment unit coverage passed `33/33`.
- Root `pnpm typecheck`: GREEN.
- `git diff --check`: GREEN.
- One pre-existing DEV-10B source assertion remains stale: it expects the now
  implemented `dev:auth:up` script to be absent. It is not counted as DEV-12B
  evidence and production was not weakened to satisfy it.

## Review disposition

Grok 4.6 was unavailable because its usage balance was exhausted. On 2026-08-27
the user explicitly authorized this wave to proceed without Grok. No substitute
review claim is made.

## Remaining boundary

This card fixes ask-time discovery only. The local stack still does not own or
start the provider and runner lifecycles, and publication remains disabled.
