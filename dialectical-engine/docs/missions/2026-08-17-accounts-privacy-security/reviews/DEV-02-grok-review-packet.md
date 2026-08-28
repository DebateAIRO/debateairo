# DEV-02 Grok 4.6 review packet

## Scope

Review only Kanban `t_95612801`, **DEV-02 · Expose a loopback-only development PostgreSQL port**.

Owned files:

- PostgreSQL/depends-on edits in `compose.dev.yaml`
- `deploy/dev-auth/validate-compose-postgres.mjs`
- `deploy/dev-auth/validate-compose-postgres.d.mts`
- `tests/architecture/dev-compose-postgres.test.ts`

DEV-01 topology is a read-only parent contract. Ignore unrelated dirty-tree files. Do not edit.

## Required outcome

- Only development Compose publishes PostgreSQL, exactly `127.0.0.1:55432:5432`.
- No wildcard, all-interface, host-network, additional PostgreSQL port, or production topology change.
- PostgreSQL has an exact variable-driven `pg_isready` health check.
- Hatchet waits for `service_healthy`, not merely container start.
- One executable validator fails absent/non-loopback/multiple/host-network publication, missing health, and wrong dependency condition.
- Source/YAML/parent-topology receipts are honest; this card does not claim the full local stack is bootable.

## Implementation and evidence

The Postgres service gained one quoted port entry and a bounded `pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB` healthcheck (2s interval, 3s timeout, 30 retries, 5s start period). Hatchet's `depends_on` is now the mapping form with `condition: service_healthy`.

The validator isolates the exact `postgres` and `hatchet-lite` service blocks, requires one exact loopback mapping, rejects host networking, requires the exact health command and healthy dependency, and emits `DEV_POSTGRES_COMPOSE_VERIFIED=127.0.0.1:55432:5432`.

- RED 1: validator module absent.
- RED 2 after validator existed: current Compose failed `DEV_POSTGRES_LOOPBACK_PORT_REQUIRED`; absent/wildcard/non-loopback mutants already rejected.
- GREEN: DEV-02 + DEV-01 architecture `5/5`.
- GREEN mutants: absent, bare/wildcard, `0.0.0.0`, unquoted/quoted/single-quoted host networking, missing/wrong health command, and `service_started` all reject.
- GREEN executable validator exact receipt.
- GREEN independent Ruby YAML parse and exact port/health/dependency assertions.
- GREEN root `pnpm typecheck`; GREEN `git diff --check`.
- Docker CLI is not installed on this host, so no `docker compose config` or live container readiness is claimed.

SHA-256:

- `compose.dev.yaml`: `12f34bccc8e9042bcfc4f05e56d0f9fed3a29d05fb4a81d28e9d779bd22775da`
- validator: `a808b74b684cb1f34fb8e009367e7da33572df46c9d23b3e747b87116540853a`
- declaration: `0392f42bbb56f8a7a5b6750ab914aed52002b9fb70989ee19a81318bec06ba1d`
- test: `4c416038ad088cdbe77cbaed87ab88f8c5b0011737ae2f75fb31391723444bfb`

Post-review repair: Grok's first `GREENLIGHT` wording explicitly confirmed only **unquoted** `network_mode: host`. Codex treated that qualifier as a coverage signal, added quoted and single-quoted host-mode mutants, captured RED on the old validator, then repaired the matcher and restored the full `5/5` parent/child gate. The exact same Grok session must re-read this narrow delta before closure.

## Requested verdict

Return exactly `GREENLIGHT`, or `BLOCK` with file/line evidence and the smallest repair, based on P0/P1 exposure, parsing, readiness, production-scope, or evidence-honesty defects.
