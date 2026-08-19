# S4 — Secrets, Operations & Assurance Posture (research asset, Wave 1)

Read-only audit, 2026-08-17. Git root = `/Users/vladmihaimiron/Documents/DebateAIRO` (the engine is a subdirectory — matters for `.gitignore` resolution). Remote `DebateAIRO/debateairo`, **PUBLIC** (`gh repo view` → visibility PUBLIC).

## 0. HEADLINE — a live datadir was public on GitHub
`acceptance/.pgdata-debate-091b7663-awaiting-rebaseline/` — **1,731 tracked files, 72 MB**, incl. `global/pg_authid` (role hashes) and `base/` heap files with `ledger.raw_artifact.raw_text`. Present on `origin/dev` (1731), absent from `origin/main` (0). Matched **no** `.gitignore` rule: root `.gitignore` covered `.pgdata/` and `.pgdata-backup-*/` only; the archive name `.pgdata-debate-*` matched neither. The password inside is the public local-dev literal, so no *credential* is newly exposed — the exposure is **user/debate content + the ledger**.
*(Orchestrator note: contained 2026-08-17 — `git rm --cached`, `**/.pgdata-*` catch-all added; history purge + repo privacy remain V's call.)*

## 1. Secrets inventory
- **Env vars** read via `process.env` (names only): `DIALECTICAL_API_BASE`, `NEXT_PUBLIC_API_BASE`, `DATABASE_URL`/`POL03_DATABASE_URL` (embed passwords), `GROK_RELAY_PORT`, `CODEX_HOME`, `DEV_OBSERVABILITY*`, `NODE_ENV`, various `NEXT_PUBLIC_*` flags.
- **Zod-declared** (`packages/register/src/runtime-environment.ts`, `.strict()`): **`HATCHET_CLIENT_TOKEN`** (REQUIRED for api+runner — a real secret DR-179's audit does not cover), **`VLLM_AUTHORIZATION`** (OPTIONAL bearer), and several `*_DATABASE_URL`s. Two good guards: `EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN`, `EVALUATOR_DEV_MENU_DATABASE_URL_REQUIRED`.
- **`.env` files:** three tracked (`.env.compose`, `apps/ui/.env.local`, `web/.env.local`) — **all benign today** (no secret values), but **`.gitignore` does not cover `.env*`**, so the first real credential written to one commits by default.
- **Committed-secret scan:** `git ls-files | grep -iE '\.env|\.pem|\.key|credential|secret|token'` → 15 hits, all benign by name. Hardcoded non-secret creds: `acceptance/standing-db.ts:8` (`debateai-acceptance-local`), `compose.dev.yaml:8,22` (`debateai-dev-only`), both self-labelled local-only.
- **DR-179 status:** held on the shipped acceptance CLI path (all three makers keyless local CLIs, auth in each vendor's keychain, reached because `relay-core.ts:93` preserves `HOME`). But `HATCHET_CLIENT_TOKEN` (mandatory) and `VLLM_AUTHORIZATION` (optional) are real credentials the non-acceptance stack would consume.

## 2. Logging hygiene
- **API logs nothing** — `Fastify({ logger: false })` (`apps/api/src/index.ts:126`). No request/access/error log, **no audit trail**. Error envelope returns `knownError.message` verbatim on 500 (internal-message-to-client leak).
- **Relays log nothing deliberately** — `relay-core.ts:100` drains vendor stderr to `/dev/null`; stdout buffered in memory only.
- **Structured events** (`oplog`-style) carry "ids, types, outcomes, durations only — never LLM text/prompts/tokens/PII" as an explicit law.
- **Storage (not logging):** `ledger.raw_artifact.raw_text` stores verbatim model output permanently, unencrypted, immutable (REVOKE + trigger). DR-188 forbids deletion → no erasure path.
- **Two leak channels:** prompts travel as **argv** (visible in `ps auxww` to any local user); Codex persists rollouts to `~/.codex/sessions/**` (verbatim prompts+completions on disk, outside the engine's retention story). Claude/Grok exempt via `--no-session-persistence`/`--no-memory`.
- **Rotation/retention: none anywhere.**

## 3. Deployment posture
- `deploy/` contains only `IMAGE-PINS.md` + `postgres/init-hatchet.sql`. **No production compose, Dockerfile, k8s, systemd, nginx/Caddy, or TLS material.** `compose.dev.yaml` is dev-only and explicitly insecure (`SERVER_*_INSECURE: "true"`, `sslmode=disable`, publishes ports without a `127.0.0.1:` prefix).
- **Ruled (ADR-0018 / DR-117):** Docker Compose on Hetzner behind Cloudflare, single host, one front door, replay gets a read-only role. **Built: no.** TLS: `UNKNOWN` (no doc specifies termination/cert/domain).
- **Internet-exposed today: the app no** (API/relays/PG bind loopback), **the repo yes** (§0).
- **Vendors that would receive data:** OpenAI/Anthropic/xAI (full prompt), Hatchet (self-hosted), vLLM (local), GitHub (source + the leaked datadir), Hetzner/Cloudflare (if ADR-0018 built).

## 4. Database access control
`acceptance/standing-db.ts:7-9,37`: user `debateai`, password hardcoded in tracked source, **the initdb bootstrap superuser** — every harness connection uses it. The ~40 least-privilege GRANTs (`debateai_runtime`, `_replay`, `_settlement_watch`, `_evaluator_*`) are **all `NOLOGIN`** and nothing connects as them: the privilege model is **designed but inert**. `pg_hba.conf`: loopback-only (good) but method `password` (cleartext on wire, not `scram-sha-256`) and `all all`. **Consequence:** a superuser bypasses REVOKE and can `SET session_replication_role='replica'` to defeat every append-only trigger. What "DB access with credentials + audit" builds on: `ALTER ROLE … LOGIN`, per-service DSNs, `scram-sha-256`, `log_connections`/pgaudit (none configured), a secret store.

## 5. Assurance tooling
**Absent:** CI (no `.github/`), pre-commit hooks, ESLint/Biome, dependency scanning, SAST, **secret scanning** (what let §0 happen), SBOM.
**Present:** `pnpm lint` = bespoke architecture/source audits (`tools/orphan-audit`), `typecheck` = `tsc --noEmit`, hard-pinned Node/pnpm, digest-pinned images (a real supply-chain positive).
**Test corpus:** ~131 files / 764 cases. Security-relevant: `test_api_auth_settings`-equivalent auth/authz suite; CONT-01 containment tests (one per maker); append-only rejection tests; refusal-code tests. **Gap:** no test asserts logs are secret-free; none covers TLS/rate-limit/CORS/CSRF (none exist).

## 6. Backup & recovery
15 plaintext PGDATA dirs (~1 GB) under `acceptance/`, mode `drwx------` (the only access control). **Manual, ad-hoc, ceremony-driven** (register-conflict guard forces a datadir swap; operator copies aside first). **No encryption, no retention (DR-188 makes it infinite by law), no off-machine copy, no restore test**; one dir named `-corrupt`. One good recovery runbook exists (`DEBATE-REVIVAL-091b7663.md`) — the only one; no general restore/IR/breach process.

## 7. CONT-01 containment (already shipped)
`relay-core.ts:86-97` — empty scratch cwd + PWD/OLDPWD rewrite + best-effort reap; loopback-only relay HTTP. Per-vendor flags: codex `--sandbox read-only --ignore-rules --ignore-user-config`; claude `--tools "" --no-session-persistence`; grok `--no-memory --no-subagents --disable-web-search --tools ""`. **Extend, don't duplicate:** sandbox-flag asymmetry (only codex has a vendor sandbox flag; grok's `--sandbox` is unused), env is a full passthrough (`{...process.env}` incl. `DATABASE_URL`/`SSH_AUTH_SOCK`), no OS-level jail, prompt-in-argv uncovered, codex rollout persistence outside the scratch dir.

## RISK SUMMARY
1. **72 MB plaintext debate DB public on GitHub** (§0) — top operational risk; contained going forward, history remains.
2. **No authentication** (any non-empty string = identity) + token as a plain header with no TLS assumption.
3. **No audit trail** (`logger:false`, no pgaudit) — a hosted breach would be unreconstructable.
4. **App connects as bootstrap superuser** with a repo-hardcoded password; least-privilege roles are `NOLOGIN` → superuser defeats append-only.
5. **Every question passed as argv** to vendor CLIs (visible via `ps`); Codex persists prompts to `~/.codex/sessions`.
6. **Zero assurance automation** — no CI/secret-scanning/SAST/dep-scanning; §0 is the direct consequence.
7. **DR-188 vs erasure** — immutable `raw_artifact` + 13 unencrypted never-expiring backups (~1 GB), same disk, no off-machine copy, no restore test.
8. **No production deploy artifacts**; `compose.dev.yaml` insecure; TLS unspecified.
9. **Containment env-permissive** — every vendor CLI inherits the full operator environment.
10. **The one well-built redaction engine (`apps/ui/lib/observability/logger.ts`) is dead code** — zero call sites.
