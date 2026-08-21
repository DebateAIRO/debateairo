# REQUIREMENTS — Docker + Hatchet containerization (Claude Opus 5 seat)

- **Ticket:** `REQ-DOCKER-OPUS`
- **Mission:** `2026-08-21-docker-hatchet` · loop REQUIREMENTS · seat_shape parallel-blind
- **Owner CLI session:** `db2badc6-2b47-43a3-9d32-69aa6da78a3c`
- **Date:** 2026-08-21
- **Repo root (git):** `/Users/vladmihaimiron/Documents/DebateAIRO` (the engine lives at
  `dialectical-engine/`; `git rev-parse --show-toplevel` confirms the parent is the repo)
- **Blindness:** no other seat's artifact, goal packet, or log was read. Inputs were
  `brief.md`, `00-intake-H0.md`, my own goal packet, and the live tree.

> **FREEZE (banner 1 of 6).** No write, retarget, or tweak of identity, registration,
> MFA, sessions, crypto shredding, `packages/crypto/**`, identity migrations `0030+`,
> or `docs/missions/2026-08-17-accounts-privacy-security/**`. No operation of the
> `accounts-phase1` / `accounts-phase4` boards. This artifact writes **no code, no
> Dockerfile, no compose**.

## Evidence conventions

Every claim below is tagged:

- **(a) RULED LAW** — an ADR/DR clause. Restated as a constraint, never re-argued.
- **(b) LIVE-TREE FACT** — verified by me in this session against the working tree, with
  a re-findable path/line or the exact command.
- **(c) JUDGEMENT** — my engineering opinion. Carries a confidence and the strongest
  counter-argument.
- **UNVERIFIED** — I could not check it; the artifact says what would check it.

**Verification ledger** (re-runnable, all read-only, all from `dialectical-engine/`):

| # | Command | Result used in |
|---|---|---|
| V1 | `cat compose.dev.yaml` | A1, A4, C3, C4, C5, D2 |
| V2 | `cat package.json apps/*/package.json web/package.json` | A2, B4, D3 |
| V3 | `cat apps/api/src/main.ts apps/runner/src/main.ts` | A3, C2, D3 |
| V4 | `cat packages/register/src/runtime-environment.ts` | A3, C2, C5, D3 |
| V5 | `cat packages/register/src/compose-env.ts register.bootstrap.json deploy/IMAGE-PINS.md` | A4, E6 |
| V6 | `command -v docker` → **exit 1**; `ls /Applications/Docker.app/Contents/Resources/bin/`; `ls .../cli-plugins/`; `ls /usr/local/bin/docker` → absent; `pgrep -f "Docker Desktop"` → empty | A5, E1 |
| V7 | `cat tests/support/testDatabase.ts tests/unit/test-database-policy.test.ts` | B5 |
| V8 | `sed -n '585,615p' tools/orphan-audit/src/index.ts` | A2, A3, C2 |
| V9 | `grep -n "reaper\|SCAFFOLD_ONLY" apps/scheduler/src/index.ts` | A2 |
| V10 | `git status --porcelain -- dialectical-engine/{apps,packages,tests,deploy,compose.dev.yaml}`; `git ls-files dialectical-engine \| wc -l` → **141**; `git ls-files --error-unmatch dialectical-engine/compose.dev.yaml` → **not known to git**; `git check-ignore -v …` → **no match** | D1, D2, B5 |
| V11 | `find . -maxdepth 4 -name 'Dockerfile*' -o -name '.dockerignore' -o -name 'compose*.y*ml'` → **only `./compose.dev.yaml`** | A1, A5 |
| V12 | `grep -n "process.env\|http" web/lib/serverApi.ts web/lib/api.ts`; `head -25 web/app/api/[...path]/route.ts` | B1, D3, E7 |
| V13 | `uname -m` → `arm64`; `sw_vers -productVersion` → `26.5.2` | A5, B4, E9 |
| V14 | `grep -rli "hetzner\|cloudflare" deploy/ compose.dev.yaml package.json` → **no hits** | B3, E2 |
| V15 | `head -35 packages/crypto/SECRET_STORE_LAYOUT.md` (read-only; frozen tree, not modified) | D3 |

---

# A. Current-state gap

> **FREEZE (banner 2 of 6).** Identity/auth/MFA/crypto and the
> `2026-08-17-accounts-privacy-security` tree are not touched by anything in this section.

## RQ-A1 — ADR-0018's service list vs `compose.dev.yaml` today

**(a) RULED.** ADR-0018 §Decision names **seven** services
(`docs/architecture/01-decisions/ADR-0018-deployment-topology.md`, Decision table):

**(b) LIVE.** `compose.dev.yaml` (project name `debateai-v3`) declares **three**.

| ADR-0018 service | Declared in `compose.dev.yaml`? | Live evidence |
|---|---|---|
| `web` | **NO** | absent |
| `api` | **NO** | absent |
| `runner` | **NO** | absent |
| `scheduler` | **NO** | absent |
| `hatchet-engine` | **NAME MISMATCH** — a service named `hatchet-lite` exists | `compose.dev.yaml:14` |
| `postgres` | YES | `compose.dev.yaml:4-12` |
| `vllm` | YES | `compose.dev.yaml:33-39` |

**Missing services: `web`, `api`, `runner`, `scheduler` — four of seven.** The fifth,
`hatchet-engine`, is present only under a different service name (RQ-C3).

Further live facts about the file, each of which is a requirement gap and not merely
cosmetic:

- **No `healthcheck:` on any service.** `docker compose ps` can therefore only ever
  report `running`, never `healthy`. (RQ-B1.)
- **No `restart:` policy on any service.**
- **`depends_on: - postgres`** on `hatchet-lite` (`compose.dev.yaml:16-17`) is the
  **short form**: start-order only, not readiness. The engine can start before Postgres
  accepts connections.
- **No `networks:` block** (default project network is implied) and **no `env_file:`**.
- **One named volume**, `postgres-data`. There is **no volume for the user DEK store**
  (RQ-D3) and none for engine config.
- **`deploy/postgres/init-hatchet.sql`** (`CREATE DATABASE hatchet;`) is mounted into
  `/docker-entrypoint-initdb.d/` (`compose.dev.yaml:12`). **(c) JUDGEMENT + UNVERIFIED:**
  the official `postgres` image runs `docker-entrypoint-initdb.d` scripts **only when the
  data directory is empty**, so on any machine where `postgres-data` already exists the
  `hatchet` database is never created and the engine fails to connect with an error that
  looks like a credentials problem. Verify at `hub.docker.com/_/postgres` (§"Initialization
  scripts") and empirically by `docker compose down` (no `-v`) → delete `init-hatchet.sql`
  → `up`. **Requirement:** engine database creation must be idempotent and must not depend
  on first-boot-only semantics, or the deploy doc must state the reset procedure.
- **(b)** `compose.dev.yaml` is **not tracked by git** (V10). See RQ-D2 — this is the
  sharpest collision risk in the mission.

## RQ-A2 — How each app starts today, and which are ADR-0018 units

**(b) LIVE**, from `package.json` files and `tools/orphan-audit/src/index.ts:590-599`
(the published entry-point list, which is the authoritative "what runs" artifact under
charter G1 / A4.5).

| App | How the process starts today | ADR-0018 deployment unit? |
|---|---|---|
| `apps/api` | `apps/api/package.json` script `start` → `tsx src/main.ts`. Boots Fastify, `await api.listen({host: API_HOST, port: API_PORT})` (`apps/api/src/main.ts`, last line). | **YES** — `api` |
| `apps/runner` | `apps/runner/package.json` script `start` → `tsx src/main.ts`. Ends with `hatchet.worker(...)` → `registerWorkflows([task])` → `worker.start()`. | **YES** — `runner` |
| `apps/scheduler` | **No package script of its own.** Root `package.json` exposes `job:replay-self-test`, `job:liveness-sweep`, `job:settlement-watch`, each `tsx apps/scheduler/src/cli.ts <cmd>`. `cli.ts:5-8` rejects any other command name. | **YES** — `scheduler` |
| `apps/replay` | `apps/replay/package.json` script `ceremony`; root `replay:ceremony` → `tsx apps/replay/src/cli.ts <postgres-url> <attestation.json>`. Takes its DB URL as **argv**, then `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` (`apps/replay/src/cli.ts:5-16`). | **NO** — not in ADR-0018's seven. It is ADR-0018 **clause 2**'s separately-credentialed, separately-scheduled ceremony job. |
| `apps/evaluator-worker` | **No scripts key at all. No `main.ts`.** `package.json` has only `"exports": "./src/index.ts"`; `src/` contains exactly `index.ts`, a library surface exporting `EVALUATOR_TASK_FAMILIES` and `run*` functions. **It is not a process today.** | **NO** — absent from ADR-0018 and from `03-module-design.md` §1.3's service map. See RQ-E3. |
| `apps/ui` | package name `dialectical-engine-v2ui`; `next dev -p 3000` / `next build` / `next start -p 3000`. | **NO** — not in the ruled list. |
| `web` | package name `dialectical-engine-web`; `next dev -p 3000` / `next build` / `next start -p 3000`. Root `build` script builds **only** `dialectical-engine-web`. | **YES** — `web` |

Three facts that a later architecture seat will trip over if they are not carried:

1. **(b) Port collision.** `apps/ui` and `web` both hardcode `-p 3000`. Only one is a
   ruled unit. (RQ-D3.10, RQ-E8.)
2. **(b) `job:reaper` does not exist as a runnable job.** ADR-0018 and
   `03-module-design.md` §1.2 name the scheduler's three jobs as `job:replay-self-test`,
   **`job:reaper`**, `job:settlement-watch`. The live tree ships `job:liveness-sweep`
   instead, and `runReaper` is a stub: `apps/scheduler/src/index.ts:87-88` throws
   `S00_SCAFFOLD_ONLY: job:reaper implementation belongs to its later slice`. The
   entry-point list records this honestly:
   `"apps/scheduler:job:reaper (stub; invocation throws SCAFFOLD_ONLY)"`
   (`tools/orphan-audit/src/index.ts:601`). **Requirement:** the containerized scheduler
   must not schedule `job:reaper`, and the deploy doc must record that AC-89's write half
   does not fire in this deployment — a silently-scheduled stub would crash-loop a
   container and look like a container defect.
3. **(b) `apps/runner/src/main.ts:2` imports across the workspace boundary by relative
   path**: `import { loadKek } from "../../../packages/crypto/src/index.js"`, while
   `apps/runner/package.json` does **not** declare `@debateai/crypto` as a dependency.
   This forces a workspace-root build context (RQ-D3.2) and cannot be fixed by this
   mission — the fix touches the frozen `packages/crypto` boundary.

## RQ-A3 — Is Hatchet a running dependency of app code, or only a sidecar?

**Answer: Hatchet is fully wired into app code and has (so far as the tree shows) never
been exercised at runtime.** Both halves matter; the intake's phrasing ("only a compose
sidecar") is **too pessimistic** and the opposite claim ("we already use Hatchet") would
be **too optimistic**.

**(b) LIVE — the SDK is a real dependency:**

- `apps/api/package.json` and `apps/runner/package.json` both declare
  `"@hatchet-dev/typescript-sdk": "1.28.1"`.
- `pnpm-workspace.yaml` `allowBuilds:` includes `'@hatchet-dev/typescript-sdk': true`.

**(b) LIVE — the dispatch producer exists:**

- `apps/api/src/main.ts` constructs `new Hatchet({ token, host_port, api_url, tenant_id,
  tls_config: { tls_strategy } })` and wraps it in `new HatchetDispatcher(hatchet,
  environment.HATCHET_WORKFLOW_NAME)`.
- `apps/api/src/index.ts:363-383` — `HatchetDispatcher implements Dispatcher`, calling
  `client.runNoWait(workflowName, { runId, workItemId }, { additionalMetadata: { v3RunId,
  v3WorkItemId, sourceOfRecord: "core.work_item" } })`. Note the metadata literally names
  `core.work_item` as the source of record — ADR-0017 clause 2 made mechanical.

**(b) LIVE — the worker registration exists:**

- `apps/runner/src/main.ts` (final three statements):
  `declareHatchetWalkingSkeletonTask({ client, runner, failures, workflowName, engineRetries })`
  → `await hatchet.worker(environment.HATCHET_WORKER_NAME)` →
  `await worker.registerWorkflows([task])` → `await worker.start()`.
- `apps/runner/src/index.ts:2494-2525` — `declareHatchetWalkingSkeletonTask` returns
  `client.task({ name: workflowName, retries: engineRetries, fn })`, and **throws**
  `"Hatchet retry count must be a non-negative register value"` if `engineRetries` is not
  a non-negative integer (`:2501-2503`). ADR-0017 clause 5 enforced in code.
- The published entry-point list carries `"apps/runner:Hatchet walking-skeleton task"`
  (`tools/orphan-audit/src/index.ts:598`), so it is **not** an orphan.

**(b) LIVE — the env contract exists** (`packages/register/src/runtime-environment.ts:44-48`,
the shared `hatchetShape`, spread into **both** `loadApiEnvironment()` and
`loadRunnerEnvironment()`):

`HATCHET_CLIENT_TOKEN` (non-empty), `HATCHET_HOST_PORT` (non-empty),
`HATCHET_API_URL` (**must parse as a URL**), `HATCHET_TENANT_ID` (non-empty),
`HATCHET_WORKFLOW_NAME` (non-empty), `HATCHET_TLS_STRATEGY` ∈ `{"tls","mtls","none"}`.
Runner adds `HATCHET_WORKER_NAME` (non-empty) and `HATCHET_ENGINE_RETRIES`
(non-negative integer).

**(b) LIVE — `SERVER_GRPC_*` appears only on the engine side**, in `compose.dev.yaml:26-31`
(`SERVER_GRPC_BIND_ADDRESS`, `SERVER_GRPC_INSECURE`, `SERVER_GRPC_BROADCAST_ADDRESS`,
`SERVER_GRPC_PORT`). **No application file reads any `SERVER_*` key** — the apps read
`HATCHET_*` only, and only through `packages/register`'s loader (AC-74 satisfied).

**(b) LIVE — but it has never run.** Three independent signals:

- `acceptance/main.ts:94` defines `AcceptanceDispatcher implements Dispatcher`, used at
  `:321`, with the comment at `:101` "the acceptance API keeps the same non-blocking 202
  contract as Hatchet's…". `acceptance/README.md:156`: *"The runtime environment is strict
  and contains no Hatchet keys"*.
- **(a) RULED, still ACTIVE:** `DR-121` (2026-08-07, V-STEER) —
  *"for now we do not install anything from the Docker family… hatchet-lite dev-compose
  stays AUTHORED-DORMANT (files only); the engine smoke and every container-dependent
  fixture are DEFERRED BY RULING"*
  (`docs/missions/2026-08-06-v3-programming/decisions-ledger.md:311-329`), reaffirmed by
  `DR-121-r` (2026-08-09, *"just defer docker and hatchet for now"*, `:547-550`). **Both
  rows are marked ACTIVE.** See RQ-E4.
- `tests/unit/claim-law.test.ts:4` tests ADR-0017 clause 3's six-case composition as
  **logic**, not against a live engine.

**Net requirement:** the containerization mission does **not** need to write Hatchet SDK
wiring. It needs to supply the **environment and network** in which the wiring that
already exists can register and dispatch, and the **observable** that proves it did
(RQ-C2). Anything more is scope expansion.

## RQ-A4 — Image pins: what is pinned, what is not, what the rule is

**(a) RULED — the rule.** `docs/architecture/05-register-skeleton.md` **§5.4c**
(line 721 ff.), applying AC-74 / AC-76 (DR-023, DR-039):

- The **classification test**: hold all recorded inputs fixed, change only the image
  digest, run the same work; if any produced artifact or served result differs, the digest
  is **verdict-bearing** and becomes a **register row**; otherwise it is build provenance
  and a compose pin suffices.
- `vllm` → **VERDICT-BEARING → register row** `vllmImageDigest`, class
  `DESCRIPTIVE · deployment · bootstrap`.
- `hatchet-engine` → **NOT verdict-bearing → compose build input**, digest-pinned and
  named in the acceptance bundle's input list alongside the lockfile.
- **"Required of both, and not optional: Exact digests, never floating tags — for the
  register row and the compose pin alike."** (§5.4c)
- ADR-0018 §Constraints served, AC-74/AC-76 row: *"image tags pinned per
  `05-register-skeleton.md` §5.4c; no numeral here"*.
- `05-register-skeleton.md` §1.3 (line 165): *"No `process.env` read outside the
  register's loader… **This binds the compose environment too**: a value injected as a
  container environment variable is still a constant, and reading it anywhere but the
  loader is the same defect."*

**(b) LIVE — what is actually pinned.**

| Image | Live pin | Verdict against §5.4c |
|---|---|---|
| `hatchet-lite` | `ghcr.io/hatchet-dev/hatchet/hatchet-lite:latest@sha256:7198bda4d73021a9759d90c57f11f1dd2b32599b81f4c08a5a97ea4cf047c41a` (`compose.dev.yaml:15`; `deploy/IMAGE-PINS.md:3-4`, resolved by GHCR manifest HEAD 2026-08-07) | **PINNED.** Digest wins over the tag; the `:latest` text is cosmetic but misleading and should be dropped or documented. |
| `vllm` | `vllm/vllm-openai:latest@sha256:ffb2d59b1c059a5bd8d781320c9f5189de8293693b7d95da54befddaa54abf52` (`compose.dev.yaml:34`; `deploy/IMAGE-PINS.md:5-6`) | **PINNED, but as a compose LITERAL.** The same digest is the register row `vllmImageDigest` in `register.bootstrap.json`. |
| `postgres` | `postgres:${POSTGRES_MAJOR_VERSION}` → **`postgres:18`** (`compose.dev.yaml:5`; `.env.compose` generated by `pnpm compose:env`) | **NOT DIGEST-PINNED — a floating tag.** `postgres:18` resolves to whatever the registry currently points `18` at. |

**(b) LIVE — what `pnpm compose:env` actually does.**
`packages/register/src/compose-env.ts` is nine lines: it loads the bootstrap register and
writes **exactly one line** to `.env.compose`:
`POSTGRES_MAJOR_VERSION=${bootstrap.values.postgresMajorVersion}`. `.env.compose` exists on
disk (26 bytes, 2026-08-07) and is **not** listed in `.gitignore` (V10).

Two consequences the intake did not record:

- **The register row and the compose pin are duplicated with nothing keeping them equal.**
  `register.bootstrap.json` holds `"vllmImageDigest": "sha256:ffb2d59b…"` and
  `compose.dev.yaml:34` holds the same digest as a source literal. They agree **today**;
  nothing detects a drift. Under §1.3's rule this literal is the defect shape AC-74 names.
  **Requirement (R-A4.1):** every compose image identity that is a register row must be
  **interpolated from a variable emitted by `pnpm compose:env`**, never written as a
  literal in the compose file. `compose-env.ts` is the lawful home (and has no live writer
  — RQ-D1).
- **`docker compose up` cannot succeed today on a clean machine.**
  `compose.dev.yaml:39` requires `${VLLM_MODEL:?VLLM_MODEL must name a real provisioned
  model}` and `compose:env` never emits `VLLM_MODEL`. Compose fails at variable
  interpolation before pulling anything. This is a live blocker against RQ-B1's
  one-command bar. **Requirement (R-A4.2):** every `:?`-guarded variable in any compose
  file this mission ships must have a named, register-sourced producer, or the required
  bar must not include the service that needs it (see RQ-B4).

**Requirement (R-A4.3):** `postgres` must be digest-pinned to satisfy §5.4c's
"exact digests, never floating tags". Resolving that digest mints a **value**, and values
are V's (AC-76, DR-023) resolved on the machine under DR-104. Routed to **RQ-E6**.

## RQ-A5 — Docker on this machine, and the honesty bar for "a container came up"

**(b) LIVE, verified this session:**

- `command -v docker` → **exit 1**. Docker is **not on PATH**.
- `/Applications/Docker.app` exists. The CLI binary is present inside the bundle at
  `/Applications/Docker.app/Contents/Resources/bin/docker`, and the Compose v2 plugin at
  `/Applications/Docker.app/Contents/Resources/cli-plugins/docker-compose` (alongside
  `docker-buildx`, `docker-init`, etc.).
- `/usr/local/bin/docker` **does not exist** — the usual symlink Docker Desktop installs
  has not been created.
- `pgrep -f "Docker Desktop"` → **no output**. The daemon is **not running**.
- Host: `uname -m` → `arm64`; macOS `26.5.2`.
- `find` over the tree: **no `Dockerfile`, no `.dockerignore`, no second compose file**.
  `./compose.dev.yaml` is the only container artifact.

**(a) RULED (intake, Stop conditions):** *"Docker CLI installation / Docker Desktop start
→ IMPORTANT OPERATION, packet to V; do not do it silently."* I did not do it. Routed to
**RQ-E1**.

**Requirement (R-A5) — what must be true before any coding seat may honestly claim a
container came up.** All five, and all five produce **captured output, not prose**:

1. `docker version` prints **both** a Client **and a Server** block. A Client-only output
   means the CLI is on PATH and the daemon is down — the most likely half-success on this
   machine.
2. `docker compose version` succeeds (Compose v2 plugin resolvable from the CLI, not a
   standalone `docker-compose` v1 binary — the two differ in `depends_on` condition
   support and in `include:`, which RQ-D2 depends on).
3. `docker info` succeeds and reports the storage driver, available memory and disk. The
   deploy doc records those numbers, because vLLM and Postgres on one host are the
   documented single-host concentration risk (ADR-0018 §Consequences).
4. **`docker compose ps` output is pasted, showing every required service with STATE
   `running` and HEALTH `healthy`.** `running` alone is not the bar (RQ-B1 CB-2).
5. **A host-side negative check is pasted**: no host `node`/`tsx`/`next` process is
   serving any port the claim depends on. Without this, RQ-B1's fake-containerization
   states are indistinguishable from the real thing.

**(c) JUDGEMENT, high confidence:** if RQ-E1 is answered "not now", the mission's later
loops are **documentation-only** and **no** seat, review lens, or Hermes verdict may
record "containerized" — the honest verdict word is **UNPROVEN**. *Strongest counter:* a
requirements artifact that makes the executable bar conditional on an operator action
invites a later seat to declare the bar "deferred" and ship a green board anyway; a harder
line would be to make RQ-E1 a **blocking** gate on the whole mission rather than a
question. I stop short of that because the intake already classified it as V's call.

---

# B. What "containerized" must mean

> **FREEZE (banner 3 of 6).** Nothing in this section authorizes an edit to identity,
> auth, MFA, crypto, or the `2026-08-17-accounts-privacy-security` tree. Where a
> containerization requirement collides with one of those files, it is recorded under
> RQ-D2/RQ-D3 and **not widened**.

## RQ-B1 — The operator-visible acceptance bar, stated falsifiably

**(c) JUDGEMENT.** Eight criteria. Each is a command whose output either shows the
property or does not; none is satisfiable by prose.

| # | Criterion | Falsifier |
|---|---|---|
| **CB-1** | **One command up, from a clean clone.** After `pnpm install` and `pnpm compose:env`, a single `docker compose … up -d` brings every **required** service (RQ-B2) to `healthy`. No host `pnpm`, `tsx`, or `next` process is required by any required service. | Run it on a machine where the app has never run. If any required service needs a second command or a host process, CB-1 fails. |
| **CB-2** | **Named health checks, not liveness theatre.** Every required service declares `healthcheck:`; `docker compose ps` reports `healthy`. Each dependency edge uses `depends_on: { condition: service_healthy }`, not the short form. A health check must exercise the service's own contract (api: an HTTP route it serves; postgres: `pg_isready` against the app database and the `hatchet` co-tenant database; runner: that its Hatchet worker is registered — see CB-8). | `docker compose config` shows a `healthcheck` whose test is `["CMD","true"]`, a bare TCP connect, or a `depends_on` short form → CB-2 fails. |
| **CB-3** | **Logs come from the container.** `docker compose logs <svc>` yields that process's stdout/stderr for every required service. No required service writes its only log to a host path outside a declared volume. | A service whose `logs` output is empty while the process is demonstrably working → CB-3 fails. |
| **CB-4** | **Single-service restart without taking the board down.** `docker compose restart api` returns `api` to `healthy` while `postgres`, the engine, `runner` and `scheduler` remain `healthy` and are **not** restarted (compare container `StartedAt` before/after). The same for `runner`. | Any sibling container restarting, or the stack requiring a full `down`/`up`, → CB-4 fails. |
| **CB-5** | **Restart safety of in-flight work.** Restarting `runner` mid-claim must not corrupt or strand work: recovery is `core.work_item`'s claim + our reaper, never the engine (ADR-0017 §3(f)). Because `job:reaper` is a **stub** (RQ-A2 note 2), the honest statement of CB-5 for **this** deployment is: a restarted runner must not double-settle, and the stuck window is `claim_deadline` **with no reaper to expire it** — recorded, not glossed. | A restart that produces a second settled outcome for one work item, or a container `restart: always` loop that silently re-dispatches, → CB-5 fails. |
| **CB-6** | **Durability across `down`/`up`.** `docker compose down` (**without** `-v`) then `up -d` preserves the Postgres data **and** the user DEK store (RQ-D3.3). | Any required durable state living in the container's writable layer or in an undeclared anonymous volume → CB-6 fails. |
| **CB-7** | **The image contains the app.** In the production-shaped file, no required service bind-mounts host source or host `node_modules`. Dev bind-mounts are permitted and must live in a **visibly separate** override, so a demo cannot pass CB-1 by wrapping the host tree. | `docker compose config` shows a `volumes:` entry whose source is a host path under the repo, for a required service, in the file the claim is made against → CB-7 fails. |
| **CB-8** | **Dispatch is real, not a sidecar.** The three observables of RQ-C2 (O-1 worker registered, O-2 engine task run carrying a real `v3WorkItemId`, O-3 our `core.work_item` claim + ledger attempt row) all hold, captured from **inside** containers. | Any one of the three missing → CB-8 fails and the Hatchet half of the mission is unproven. |

**Recommendation: CB-1…CB-8 are the bar. Confidence: high.**
*Strongest counter-argument:* CB-2 and CB-8 are expensive — writing a health check that
proves a Hatchet worker is registered, and capturing an engine-side task run, is real
engineering that a "just containerize it" ask did not obviously buy. A cheaper bar
(CB-1, CB-3, CB-6 only) would ship faster. I reject the cheaper bar because CB-8 is
precisely the difference between this mission and DR-121's authored-dormant state — the
compose file has had a Hatchet service in it since 2026-08-07 and nothing has ever used
it; without CB-8 this mission would end in the same place with more YAML.

### The states that LOOK containerized while the app runs on the host

**(c) JUDGEMENT.** Each is a real, reachable configuration; each produces a green
`docker compose ps`; each must be explicitly excluded.

| State | Why it passes a naive check | Why it is false |
|---|---|---|
| **(i) Today's exact shape.** `postgres` + `hatchet-lite` + `vllm` in compose; `apps/api` and `apps/runner` on the host via `tsx`. | `docker compose ps` shows three healthy services. A screenshot is indistinguishable from success. | Four of seven ADR-0018 units are host processes. **This is the default failure mode**, because it is where the tree already is. |
| **(ii) Shell-around-host-state.** An `api` service whose command is `pnpm --filter @debateai/api start` over a bind-mounted repo with host `node_modules`. | The process really is in a container; `docker compose ps` is green; logs stream. | The image contains nothing; the container cannot start on a machine without the repo. Excluded by **CB-7**. |
| **(iii) Host-network escape.** `network_mode: host`, or `extra_hosts: host.docker.internal` used so a containerized `api` reaches a **host** Postgres. | Everything is "in Docker". | The one store is not in the deployment (AC-01/AC-02, ADR-0018). Excluded by requiring **compose-DNS-only** service addressing (RQ-D2). |
| **(iv) Liveness theatre.** `healthcheck: ["CMD","true"]`, or a TCP connect to a port the process binds before it is ready. | `healthy` in `docker compose ps`. | Proves nothing. Excluded by **CB-2**'s contract-exercising requirement. |
| **(v) `web` fronting a host api.** `DIALECTICAL_API_BASE=http://host.docker.internal:<port>` — and **(b) LIVE**, `web/lib/serverApi.ts:6` already defaults to `http://127.0.0.1:8000`, so this is the *path of least resistance*, not a hypothetical. | The UI works end to end in a browser. | `api` is on the host. Excluded by **CB-7** + compose-DNS-only. |
| **(vi) Green stack, dead dispatch.** All services `healthy`, but `runner` never registered a worker, so `HatchetDispatcher.runNoWait` enqueues into an engine with zero workers. | Nothing errors. `api` returns 202 (its non-blocking contract). | Hatchet is a sidecar nobody calls — the exact state RQ-C2 exists to exclude. Excluded by **CB-8**. |

## RQ-B2 — What MUST run inside Compose, and what MUST stay on the host

**MUST be inside Compose** (each is an ADR-0018 ruled service):
`postgres`, the durable-execution engine, `api`, `runner`, `scheduler`, `web`.
`vllm` is ruled but conditionally scoped — see RQ-B4.

**MUST stay on the host**, with the justification for each exclusion:

| Excluded | Justification |
|---|---|
| **Agent CLIs (`claude` / `codex` / `grok`) and the CLI relays** | **(a) RULED — DR-179** (`decisions-ledger.md:1429-1439`): *"Model access remains exclusively through V's authenticated CLI subscriptions (claude / codex / grok CLIs wrapped as local relays). No direct API-key provider may be built, configured, stored, or requested — no key material enters the repo, the register, the environment, or any config."* Containerizing a relay means putting V's subscription credential into an image, a volume, or an env var — every one of those is the prohibited surface. **(a)** The intake's standing-law section adds: *"Relays are not Hatchet workers."* They are therefore neither a compose service nor a dispatch target. |
| **Hermes on 9119** | **(a) RULED** (intake: *"Port 9119: Hermes dashboard, always, never overridden"*). Hermes holds **board custody** for this and four foreign boards. It is orchestration infrastructure, not product; ADR-0018's compose file describes *the product deployment*. Containerizing the thing that adjudicates the containerization is a custody hazard, and a compose `down` would take the board down mid-mission. |
| **Test runners (`pnpm test`, `vitest`)** | **(a) RULED — DR-121** clause (1): the embedded-real-PostgreSQL path is *"the STANDING dev/test database for the prototype phase"*. **(b) LIVE:** `tests/unit/test-database-policy.test.ts` asserts `selectPrototypeDatabaseMechanism()` equals `{mechanism:"embedded-postgres", testcontainersStatus:"DEFERRED BY DR-121"}` **"without probing a Docker-family runtime"**. A containerized test runner is the single easiest way to flip the store silently. See RQ-B5. |
| **`apps/replay`'s ceremony** | **(a) RULED — VR-3 limb (iii) / ADR-0012 clause 2 / ADR-0018 clause 2**: the ceremony must be *"run by a person or job that did not produce the numbers"*, with **read-only** credentials, **scheduled separately**. It may be *packaged* as an image, but it **must not be a service in the same `up` that runs the production stack** — ADR-0012 records that the obvious CI shape satisfies limbs (i) and (ii) and *defeats* limb (iii). **(b) LIVE:** `apps/replay/src/cli.ts:5` takes its connection string as **argv**, not env, which already makes "baked into the stack's env" structurally wrong. **(c) Recommendation:** a one-shot `docker compose run --rm` under an opt-in profile, never a `depends_on` of the stack. Confidence medium-high. *Counter:* a profile in the same compose project still shares the project network and can be started by a careless `--profile all`, so "separately scheduled" is honored by convention rather than by construction; a genuinely separate compose project would be stronger and is more operational overhead. |
| **`apps/evaluator-worker`** | **(b) LIVE:** it is not a process (no scripts, no `main.ts`). You cannot containerize a library. Routed to **RQ-E3**. |
| **`apps/ui`** | **(b) LIVE:** not in ADR-0018's seven; collides with `web` on port 3000. Routed to **RQ-E8**. |

## RQ-B3 — Dev compose vs production compose: rank

**Recommendation: local-dev compose is the requirements-complete bar for THIS mission;
production Hetzner/Cloudflare is a later slice that must not contradict ADR-0018.
Confidence: high.**

Ranked reasons:

1. **(a) DR-121 / DR-121-r are still ACTIVE rows.** No container has ever been built in
   this repo (**(b)** no `Dockerfile` exists; `find` V11). Going from *zero images* to
   *a production deployment on a rented host behind a third-party edge* in one mission
   skips the step where anything is known to work.
2. **(b) Production has no inputs in the tree.** `grep -rli "hetzner\|cloudflare"` over
   `deploy/`, `compose.dev.yaml`, `package.json` → **no hits**; `deploy/` contains exactly
   two files. There is no host, no zone, no domain, no TLS material, no secret store.
   Producing them is spend and an external-account action — V's, not a seat's (**RQ-E2**).
3. **Collision surface.** Every production artifact touching secrets, ports, or TLS is
   adjacent to what the live security mission is actively deciding (RQ-D2).

**Constraints that must NOT be silently dropped by deferring production.** The dev slice
must be *shaped so production is a parameterization, not a rewrite*:

- **(a)** ADR-0018 clause 1: **one origin for the contract, and it is `apps/api`.** No
  second hostname, no direct-to-origin route that skips the edge for some callers.
- **(a)** ADR-0018 clause 1, SSE: proxy buffering is *"the classic way a working stream
  becomes a silently broken one"*, and **the fix is proxy configuration; the fix is never
  a second path.** The dev slice must therefore keep the SSE route
  (`apps/api:GET /v1/runs/:id/events`, entry-point list) reachable through whatever front
  the dev stack uses, so the production proxy inherits a shape that was already streaming.
- **(a)** ADR-0018 clause 1: the proxy is a transport participant, not a policy layer —
  no tier (ADR-0013), disclosure (AC-56) or honesty-field (AC-54) decision at the edge.
- **(a)** ADR-0018 clause 2: `apps/replay` has **no** credential other than the read-only
  one; the scheduler's three jobs **do not share a credential** (RQ-C5).
- **(a)** ADR-0017 clause 6 / ADR-0003 rule 4: **one** Postgres instance; the engine's
  database is a co-tenant on it. Moving it needs a **new human ruling**, not a deploy-time
  capacity judgement.
- **(a)** ADR-0017 clause 1: `SERVER_MSGQUEUE_KIND=postgres`; **no RabbitMQ** (RQ-C4).
- **(c) Requirement (R-B3.1):** the dev file must use **the ADR-0018 service names**
  (`web`, `api`, `runner`, `scheduler`, `hatchet-engine`, `postgres`, `vllm`) and **the
  same env contract**, with production differing only in: published ports, TLS strategy,
  the insecure dev flags, image build-vs-pull, and secret sourcing. If production needs a
  different service *shape*, the dev slice was mis-designed.

*Strongest counter-argument:* deferring production means the clauses ADR-0018 spends most
of its text on — AC-60 through a proxy, SSE buffering, Cloudflare-as-transport-not-policy
— are **never exercised**, and those are exactly where the ADR predicts the incident. A
dev-only slice can be declared "done" while the ruled topology remains entirely unproven,
and the mission's own name ("containerize the app") would then be satisfied by something
that has never run where the app is meant to run. I accept that cost and mitigate it with
R-B3.1: the dev slice must be *production-shaped*, so the deferred work is configuration
rather than architecture.

## RQ-B4 — `vllm`: required, optional, or split?

**Recommendation: SPLIT — `vllm` moves behind an opt-in compose profile and is NOT part
of this mission's required bar; it is neither deleted nor demoted from ADR-0018.
Confidence: medium-high.**

Evidence:

- **(b)** `compose.dev.yaml:37-39` — the service's `command` requires
  `${VLLM_MODEL:?VLLM_MODEL must name a real provisioned model}`. **(b)**
  `packages/register/src/compose-env.ts` emits only `POSTGRES_MAJOR_VERSION`. So **today,
  `docker compose up` fails at interpolation before any image is pulled** — with `vllm` in
  the required set, CB-1 cannot pass until someone supplies `VLLM_MODEL` by hand, which is
  itself a second command (CB-1 violation) and an unregistered constant (AC-74 violation).
- **(b)** Host is `darwin/arm64`. **UNVERIFIED:** whether
  `vllm/vllm-openai@sha256:ffb2d59b…` publishes an `arm64` variant, and whether it can run
  without a CUDA GPU. Verify with
  `docker manifest inspect vllm/vllm-openai@sha256:ffb2d59b…` (lists platforms) and
  `docker compose --profile models up vllm` once RQ-E1 is closed. My expectation is that
  it is a linux/amd64 CUDA image and will not run natively here — but I have not checked
  and will not assert it.
- **(b)** The **runner still needs vLLM *values* even if vLLM is not running**:
  `loadRunnerEnvironment()` requires `VLLM_BASE_URL` (must parse as a URL), `VLLM_MODEL`,
  `VLLM_MAKER` (`runtime-environment.ts`), and `apps/runner/src/main.ts` passes them into
  `createPostgresProviderGateway`. So a containerized runner **boots fine** with a valid
  but unreachable URL, and every model call then fails **typed, with a ledger row**.
  **(a)** That is DR-115-lawful: ADR-0018 clause 3(d) — *"a vLLM failure is a typed failure
  with a ledger row — never a substituted result."*

**Requirements:**

- **R-B4.1** `vllm` is declared under a compose **profile**; the required-bar `up` does not
  start it, and no required service `depends_on` it.
- **R-B4.2** No `:?`-guarded variable may remain in the required path. `VLLM_MODEL` (and
  `vllmImageDigest`, per R-A4.1) must be emitted by `pnpm compose:env` from
  `register.bootstrap.json` — they are register-governed constants, and a bare `:?` makes
  the operator's shell the source of a constant, which §1.3 forbids.
- **R-B4.3** With `vllm` off, the deploy doc must state plainly that **no real model call
  occurs** in the required bar, and no seat may describe the stack as "running debates".
  Routed to **RQ-E9**.
- **R-B4.4** GPU/host requirements for the `vllm` profile are recorded in `deploy/`
  (platform, GPU, memory), resolved on the machine, not guessed.

*Strongest counter-argument:* ADR-0018 rules **seven** services and `vllm` is one of them.
Making it optional means this mission can declare "containerized" over a deployment that
has never once run the ruled service list end to end — and since `vllm` is the only
in-compose provider, the required bar would never make a real model call, which is exactly
the DR-115 "real artifacts only" property that everyone will *assume* a containerization
proved. That is a genuine reduction in what the claim means, and it is why R-B4.3 forces
the reduction to be written down rather than discovered later.

## RQ-B5 — How containerized app services must relate to Testcontainers

**(a) RULED, two rulings in tension, and the tension is the requirement.**

- `docs/architecture/06-test-strategy.md:169`: database tests use **Testcontainers + real
  Postgres**, because *"the constraints, triggers, advisory locks and `SKIP LOCKED`
  semantics under test **are** Postgres behaviours"*; and *"The container's image tag is
  the `postgresMajorVersion` bootstrap pin read through the register loader, **never a
  literal in a test file**"* (AC-74).
- **DR-121** clause (1): embedded-real-PostgreSQL is the **standing** dev/test database for
  the prototype phase; *"Testcontainers wiring stays authored-dormant per ADR-0012 for the
  later Docker phase."*

**(b) LIVE — the tree implements DR-121, not §169:**

- `tests/support/testDatabase.ts` — `startTestDatabase()` calls `startWithEmbedded(...)`
  **unconditionally**. `startWithTestcontainers(...)` exists and is **unreachable from
  `startTestDatabase`**: authored-dormant, exactly as DR-121 says.
- `selectPrototypeDatabaseMechanism()` returns a **constant**
  `{ mechanism: "embedded-postgres", testcontainersStatus: "DEFERRED BY DR-121" }`.
- `tests/unit/test-database-policy.test.ts` asserts that value and its test name is
  *"selects real embedded PostgreSQL **without probing a Docker-family runtime**"*.
- Both paths read the Postgres major from `loadBootstrapRegister()` — AC-74 already
  satisfied on both branches.

**Requirements (the requirement, not the test plan):**

- **R-B5.1 — No ambient probe may decide the store.** The presence of a Docker daemon
  **must not** change which database the test suite runs against. The mechanism must be an
  **explicit, recorded selection**. This is the property `test-database-policy.test.ts` is
  the tripwire for: it fails loudly if someone makes the choice ambient. **That tripwire
  must survive this mission.**
- **R-B5.2 — Flipping the default is a RULING, not a refactor.** DR-121 is ACTIVE. If this
  mission's outcome is that Testcontainers becomes live, that supersession must be a
  recorded ledger row (**RQ-E4**) and the policy test must move in the same change.
  **Contract note:** `tests/**` is **not** in this mission's readonly list and is not in
  its allowed list. Touching it is a **coding-loop act under a contract this mission does
  not currently hold** — architecture must either obtain that path class explicitly or
  leave DR-121's clause (1) untouched. **My recommendation is to leave it untouched:** the
  containerization claim does not need the test store to change.
- **R-B5.3 — One version source.** Whichever mechanism runs, the Postgres major comes from
  `register.bootstrap.json` through the register loader. **No Dockerfile `FROM postgres:…`
  and no compose literal may become a second Postgres version source** — that would be the
  `no-source-literal-constant` defect at the container boundary (AC-74; charter A3.5).
- **R-B5.4 — Test containers and the deployment store must be disjoint.** A
  Testcontainers-provisioned Postgres must never be the compose `postgres` service, must
  never share its named volume, and must never be reachable at the compose service DNS
  name. A test run must be structurally incapable of writing the dev/prod store.
- **R-B5.5 — No test may require the stack; no stack service may require a test.** Neither
  direction. `docker compose up` must not be a precondition of `pnpm test`, and no compose
  service may `depends_on` anything test-scoped.
- **R-B5.6 — Hatchet must not be silently skipped.** The seams are already narrow and
  fake-able by design: `HatchetDispatcher` takes `Pick<Hatchet,"runNoWait">`
  (`apps/api/src/index.ts:365`) and `declareHatchetWalkingSkeletonTask` takes
  `Pick<Hatchet,"task">` (`apps/runner/src/index.ts:2495`). **Requirement:** a test that
  asserts Hatchet behaviour must either use those seams (engine-independent, always runs)
  or, if it needs a live engine, **fail loudly or be an explicitly recorded deferral —
  never a conditional skip keyed on engine reachability.** A suite that goes green because
  an engine was absent is the dark gate charter G3 names, and it is the specific way
  containerization would make the Hatchet claim weaker instead of stronger.

**Confidence: high.** *Strongest counter-argument:* R-B5.2's conservatism means the repo
ends this mission with Docker running the app but **not** the database tests, so
`06-test-strategy.md:169`'s Testcontainers requirement stays unmet and the test strategy
document stays out of step with the tree — an inconsistency that a reviewer will
reasonably read as an incomplete containerization. I accept it because flipping the test
store is a separate risk with a separate blast radius, and DR-121's clause (1) is a
V-endorsed standing decision that this mission's prompt does not obviously address.

---

# C. Hatchet as dispatcher — restated as requirements

> **FREEZE (banner 4 of 6).** No identity/auth/MFA/crypto file is read or written for
> this section. DR-118 is **not** reopened: no comparison of engines, no RabbitMQ, no
> second durable store, no managed control plane.

## RQ-C1 — What Hatchet may own, and what it must not

All rows below are **(a) RULED**, cited to
`docs/architecture/01-decisions/ADR-0017-durable-execution-hatchet.md`.

**MAY own:**

| ID | Requirement | Clause |
|---|---|---|
| HR-1 | The engine decides **which worker attempts a task now**, and owns **redelivery, assignment timeouts, child-task fan-out** and time-triggered dispatch. | §3(a) table ("Owned by: the engine — assignment, redelivery, timeouts"); §3(f) |
| HR-2 | The engine's own state is **its record of dispatch**, and that is legitimate. | cl. 2 preamble |

**MUST NOT own:**

| ID | Requirement | Clause |
|---|---|---|
| HR-3 | **The claim is not the engine's.** `core.work_item`'s claim-before-call — a committed row via `SELECT … FOR UPDATE SKIP LOCKED`, committed **before** any model call — is ours. *"Never rely on Hatchet's assignment as the claim."* Assignment authorizes an **attempt**; the claim authorizes **the model call**. | cl. 3; §3(a) table; §3(b) |
| HR-4 | **Engine run history is not the ledger.** AC-44 is discharged by our ledger row per attempt. *"A dashboard is not an audit trail."* | cl. 2, bullet 1 |
| HR-5 | **Engine ordering is not `at_seq`.** Where they disagree, **`at_seq` wins**; nothing may read engine order as the sequence of record. | cl. 2, bullet 2; ADR-0006 |
| HR-6 | **Engine state is not run state.** Run phase, envelope state and row activation are folds over `run_progress_event` / `run_row_activation_event` — *"never a query against the engine."* | cl. 2, bullet 3; ADR-0007 |
| HR-7 | **The engine holds no model artifacts.** The **gateway** writes the raw artifact (AC-13) and the ledger row (AC-44). *"It **is** a breach the moment an engine-stored task output is treated as an artifact without a gateway write behind it."* | cl. 4 boundary; DR-115 |
| HR-8 | **Model calls live in plain or child tasks**, never naked in durable orchestrator code; orchestrator tasks carry wait/spawn control flow only. | cl. 4 |
| HR-9 | **Engine retries are register values under DR-020's caps, never engine defaults.** One budget, not two: engine retries and gateway attempts consume the **same** declared `max_attempts`. **No numeral in any engine configuration file.** Default posture: retries disabled or tightly bounded. | cl. 5 |
| HR-10 | **`SERVER_MSGQUEUE_KIND=postgres`; RabbitMQ OFF**; enabling it is a **recorded law-6 exception** with the measurement that forced it. | cl. 1 |
| HR-11 | **Engine tables live in a dedicated database/schema on the ONE Postgres instance.** Not in our migration lineage, not in `02-data-model.md`, migrated by the engine's own tooling. **No V3 query joins across the boundary.** Moving it to a second instance requires **a new human ruling**. | cl. 6; ADR-0003 rule 4 |

**(b) LIVE — the tree already honors HR-9, HR-10 and HR-11:**
`HATCHET_ENGINE_RETRIES` is a register-loaded non-negative integer and
`declareHatchetWalkingSkeletonTask` throws if it is not
(`apps/runner/src/index.ts:2501-2503`); `compose.dev.yaml:23` sets
`SERVER_MSGQUEUE_KIND: postgres` and no broker service exists; `deploy/postgres/init-hatchet.sql`
creates a **`hatchet` database** on the same instance and `compose.dev.yaml:22` points the
engine at `postgres:5432/hatchet`.

**Containerization requirement (R-C1):** none of HR-3…HR-11 may be *weakened by a
deployment convenience*. Concretely: no compose-level retry/restart setting may become a
second retry authority (a `restart: always` on `runner` combined with engine redelivery is
two recovery mechanisms, and only the register-bounded one is lawful); and no health check
or dashboard query may become a read of run state (HR-6).

## RQ-C2 — The minimum wiring that makes "we use Hatchet" true

**The workers that must register — exactly one today.**
**(b)** `apps/runner`, worker name from `HATCHET_WORKER_NAME`, registering the single task
named by `HATCHET_WORKFLOW_NAME`
(`apps/runner/src/main.ts`: `hatchet.worker(...)` → `registerWorkflows([task])` →
`worker.start()`). Published entry point:
`"apps/runner:Hatchet walking-skeleton task"` (`tools/orphan-audit/src/index.ts:598`).
No other app registers a worker. **Requirement (R-C2.1):** this mission must not add a
second worker; a scheduler-as-Hatchet-worker design is architecture, not requirements, and
today the scheduler is a **CLI**, not a worker.

**The producer that must dispatch.**
**(b)** `apps/api`, via `HatchetDispatcher.dispatch()` →
`runNoWait(workflowName, {runId, workItemId}, {additionalMetadata: {v3RunId, v3WorkItemId,
sourceOfRecord: "core.work_item"}})` (`apps/api/src/index.ts:373-382`).

**The env contract they need** (**(b)** `packages/register/src/runtime-environment.ts`):

| Key | Both | Runner only | Validation |
|---|---|---|---|
| `HATCHET_CLIENT_TOKEN` | ✓ | | non-empty string |
| `HATCHET_HOST_PORT` | ✓ | | non-empty string |
| `HATCHET_API_URL` | ✓ | | **must parse as a URL** |
| `HATCHET_TENANT_ID` | ✓ | | non-empty string |
| `HATCHET_WORKFLOW_NAME` | ✓ | | non-empty string |
| `HATCHET_TLS_STRATEGY` | ✓ | | enum `tls` \| `mtls` \| `none` |
| `HATCHET_WORKER_NAME` | | ✓ | non-empty string |
| `HATCHET_ENGINE_RETRIES` | | ✓ | non-negative integer |

**Requirement (R-C2.2) — preserve fail-fast.** The loader is
`z.object(shape).strict().parse(...)` evaluated at module load. A missing or malformed key
**throws before the server listens or the worker registers**, so the container exits
non-zero and the health check never goes green. **This is a feature and must be
preserved**: no Dockerfile `ENV` default, no compose fallback (`${VAR:-default}`), and no
`try/catch` may be introduced to make a half-wired container start. A container that
starts without a valid Hatchet contract is state (vi) of RQ-B1.

**Requirement (R-C2.3) — one workflow name, one source.** `HATCHET_WORKFLOW_NAME` must be
**byte-identical** in `api` and `runner`. If they differ, `api` enqueues into a workflow
nothing is registered for: **no error on either side**, the ask returns its non-blocking
202, and work silently never runs. This is the most likely silent failure of the whole
mission. The value is a register-governed constant (AC-74), so it must be emitted once by
`pnpm compose:env` and injected into both services from that single variable — never typed
twice.

**Requirement (R-C2.4) — the API container must run the real dispatcher.**
**(b)** `acceptance/main.ts:94,321` defines and uses `AcceptanceDispatcher` — an in-process
substitute — and `acceptance/README.md:156` states the acceptance environment *"contains no
Hatchet keys"*. The compose `api` service must run `apps/api/src/main.ts` (which constructs
`HatchetDispatcher`), **not** any acceptance entrypoint. A stack that is green because it
booted the acceptance harness has proven nothing about Hatchet.

**The observables that prove dispatch — all three required (this is CB-8):**

| ID | Observable | Where | Why it alone is insufficient |
|---|---|---|---|
| **O-1** | The runner's worker appears **connected** to the engine, with the registered workflow name, on the engine's dashboard/API surface (compose exposes `8888` UI / `7077` gRPC today). | engine | Proves registration, not dispatch. |
| **O-2** | An engine task run exists for that workflow whose `additionalMetadata.v3WorkItemId` equals a **real** `core.work_item` id. | engine | Proves the engine received work. Per HR-4 this is **not** the audit trail. |
| **O-3** | The matching `core.work_item` row shows a **committed claim** by `RUNNER_WORKER_ID`, and our ledger has the attempt row. | our Postgres | Proves work happened — but an in-process runner would show the same. Alone it proves nothing about Hatchet. |

**A claim resting on O-1 only is a sidecar. A claim resting on O-3 only is
indistinguishable from the pre-Hatchet acceptance harness.** All three, captured from
inside containers.

**Confidence: high on the requirement; the *surface names* are UNVERIFIED.** I have not
run a Hatchet dashboard or API and I will not invent an endpoint path, a dashboard label,
or a `runNoWait` return shape. What would verify: `docker compose up` the engine and read
`8888`, plus the vendor docs at the implementation ticket — which ADR-0017 §"What this ADR
does not rule" already **requires**: *"vendor Compose examples and version pins must be
re-checked at the implementation ticket."*
*Strongest counter-argument:* requiring an engine-side observable couples this mission's
acceptance to a vendor UI whose shape we have not seen; if the lite distribution's
dashboard or API differs from expectation, CB-8 could block on a surface question rather
than on a real defect. Mitigation: O-2 may be satisfied by **any** engine-side artifact
(dashboard, API, or engine log line) that carries the `v3WorkItemId` — the requirement is
the *correlation*, not a particular UI.

## RQ-C3 — `hatchet-lite` vs `hatchet-engine`: local vs production

**(b) LIVE:** the compose service is named **`hatchet-lite`** (`compose.dev.yaml:14`) and
`deploy/IMAGE-PINS.md:3` uses the same key.
**(a) RULED:** ADR-0018's service table and `03-module-design.md` §1.3 both name the row
**`hatchet-engine`**.

**What is actually required is a set of properties, not an image:** Postgres-first
messaging (HR-10), no RabbitMQ, self-hosted **inside** the deployment (ADR-0017 §Consequences:
*"the control plane sits inside the deployment rather than off it"*), dispatcher-only
(HR-3…HR-8), co-tenant database on the **one** instance (HR-11), digest-pinned (§5.4c), and
gRPC + dashboard reachable by our worker.

**R-C3.1 — Name the service `hatchet-engine`.** **(c) JUDGEMENT, medium-high confidence.**
ADR-0018's service table is the artifact a compliance check reads. A service named
`hatchet-lite` makes "does the deployment match ADR-0018?" a judgement call instead of a
string comparison. Let the **service name** be `hatchet-engine` and the **image** be the
lite distribution in dev. *Counter:* renaming moves the `deploy/IMAGE-PINS.md` row key and
loses the honest signal that dev is running an all-in-one distribution — a reader could
mistake the dev stack for the production composition. Mitigation: R-C3.3. Routed to
**RQ-E5** because it touches a ruled artifact's naming.

**R-C3.2 — Lite MAY stay for dev, conditionally.** All five conditions:
(i) `SERVER_MSGQUEUE_KIND=postgres`; (ii) no RabbitMQ anywhere in the rendered config
(RQ-C4); (iii) digest-pinned; (iv) the dev-only insecure settings — **(b)**
`SERVER_AUTH_COOKIE_INSECURE: "true"`, `SERVER_GRPC_INSECURE: "true"`,
`SERVER_URL: http://localhost:8888`, `SERVER_GRPC_BROADCAST_ADDRESS: localhost:7077`,
`SERVER_INTERNAL_CLIENT_INTERNAL_GRPC_BROADCAST_ADDRESS: localhost:7077`
(`compose.dev.yaml:25-31`) — are **confined to the dev file and structurally cannot be
inherited by a production file**; (v) the lite-vs-production composition difference is
written down in `deploy/`.

**R-C3.3 — What would make lite-only a FALSE claim of ADR-0018 compliance.** Any of:

1. Claiming the ruled topology is deployed when **production has never been described at
   all** — ADR-0018 is a *Hetzner behind Cloudflare* ruling, and a dev stack is not that.
2. Presenting the lite all-in-one composition **as** the `hatchet-engine` row without
   recording that production requires a different composition (dashboard/migration surface
   as separate concerns — ADR-0017 §Costs: *"engine, dashboard, migrations, tokens, config
   volumes"*).
3. Letting `SERVER_GRPC_INSECURE=true` or a `localhost` broadcast address reach anything
   Hetzner-facing.

**R-C3.4 — A concrete live blocker, stated because it will bite on day one.**
**(b)** `SERVER_GRPC_BROADCAST_ADDRESS: localhost:7077` is the address the engine hands
back to clients as "where to reach me". It is correct only while the client shares the
engine's network namespace — i.e. for a **host** process reaching a published port. **A
containerized `runner` that resolves `localhost:7077` resolves it inside its own
container**, where nothing listens. **Requirement:** in-compose services must address each
other by **compose service DNS** (`hatchet-engine:7077`), and the engine's broadcast
address must be the value the *clients* can actually reach. This is not an edit I may
make; it is a requirement architecture must carry, and it is the strongest argument for
RQ-D2's compose-DNS-only rule.
**(c) JUDGEMENT + UNVERIFIED-by-execution.** The mechanism (broadcast address → client
dial target) follows from what the key means; I have not executed it. Verify by starting
the stack and reading the runner's connect target in its logs.

## RQ-C4 — Keeping RabbitMQ off, written so a copied vendor compose fails a check

**(a) RULED — ADR-0017 clause 1**, quoted because the wording is the requirement:
*"the vendor's production Compose examples commonly ship RabbitMQ, so a copy-pasted
deployment acquires a second store without anyone deciding to… **A deployment that has
RabbitMQ running without a recorded exception is a defect, not a configuration
preference.**"*

**(b) LIVE:** `deploy/IMAGE-PINS.md:10` says *"RabbitMQ is intentionally absent."* That is
**prose**. Prose does not fail a build. The requirement is to make it executable.

| ID | Requirement |
|---|---|
| **R-C4.1** | No compose file, override, profile, `include`, or deploy artifact in this repository may declare a service whose **image reference, service name, or container name** matches `rabbitmq` (case-insensitive), and none may set `SERVER_MSGQUEUE_KIND` to any value other than `postgres`. |
| **R-C4.2** | **The check runs on the RENDERED configuration, not the source file.** The artifact under test is the output of `docker compose -f <every file in the claim> config`. An override, an `extends:`, or an `include:` can add a service the base file does not show — which is exactly how a copy-paste acquires one. Checking `compose.dev.yaml` alone is a check that cannot see the defect it exists for. |
| **R-C4.3** | The check must **not** key on the name alone. A copied vendor compose can call it `broker` or `mq`. It must also fail on: any published or exposed **5672 / 15672**; any env key matching `RABBITMQ_*` or `AMQP_*`; any value matching `amqp://`. |
| **R-C4.4** | The check is **BLOCKING**, in the same gate as `pnpm lint` (root `lint` = `audit:architecture` + `audit:source`), and it must fail closed: an unparseable or absent rendered config is a failure, not a skip. |
| **R-C4.5** | The **only** lawful way to pass with a broker present is an explicit allowlist entry citing a **recorded law-6 exception with the measurement that forced it** (ADR-0017 cl. 1). The check reads that allowlist from a file; it must not be disable-able by an env var or a CLI flag. |
| **R-C4.6** | **Assert the positive, not only the negative.** `SERVER_MSGQUEUE_KIND: postgres` must be **present** in the rendered engine config. A missing key means the engine's default decides — and ADR-0017 cl. 1 rules the value, so leaving it to a default is already non-compliance even if the default happens to be Postgres today. |

**Confidence: high.** *Strongest counter-argument:* a repo-local check bounds **our
artifacts**, not the machine. An operator who runs a vendor compose file from outside the
repo on the same host still gets a second durable store, and R-C4 will report green.
Honest scope statement: R-C4 makes the defect impossible **to commit**, not impossible **to
run**. Closing the second half needs a runtime assertion (e.g. the deploy doc's operator
checklist asserting no non-project containers on the host), which is operational, not
architectural.

## RQ-C5 — Scheduler jobs must not share a credential

**(a) RULED — `03-module-design.md` §5.5.0** (lines 659-702), H-O-24, and ADR-0018 clause 2.
*"The three jobs share a process and do not share a credential"*, with three scopes:

| Job | Credential scope (§5.5.0) | Failure if misgranted |
|---|---|---|
| `job:replay-self-test` | read-only on every schema **except** append on `serve`'s two eviction streams (`served_number_event`, `segment_suppression`) | a number that stopped reproducing keeps serving |
| `job:reaper` | read-only **except** write on `core.work_item` (**schema `core`, not `serve`**) | stale claims never transition; `FX-SRV-10`'s write half never fires |
| `job:settlement-watch` | read-only **except** three appends inside `scorecard`+`ledger`: `scorecard.answer_outcome`, its `ledger_entry` rows, **INSERT-only** on `scorecard.scorecard_cell` — **no UPDATE, no DELETE**, no write on `serve`, none on `core` | a resolver outcome is never recorded, **silently** |

*"No two jobs share a target."* And ADR-0018 clause 2: *"`apps/replay` has no other
credential"* — read-only, full stop (§5.5.0's ceremony column; `FX-IND-03` attests).

**(b) LIVE — the separation mechanism already exists, as three distinct env keys**, each
loaded by its own `.strict()` parser
(`packages/register/src/runtime-environment.ts`):
`loadReplaySelfTestEnvironment() → REPLAY_SELF_TEST_DATABASE_URL`,
`loadLivenessEnvironment() → LIVENESS_DATABASE_URL`,
`loadSettlementEnvironment() → SETTLEMENT_DATABASE_URL`
(plus a fourth, `loadMigrationEnvironment() → MIGRATION_DATABASE_URL`).
`apps/scheduler/src/cli.ts:9-13` picks exactly one per command.

**Requirements on compose / secret injection (no file design):**

| ID | Requirement |
|---|---|
| **R-C5.1** | **No single container may hold more than one of the three connection strings.** The code reads one, but `process.env` in that container would *contain* all three, so one `scheduler` service carrying all three defeats §5.5.0 at the injection layer regardless of what the code does. Therefore: **three separate injection contexts, one credential each.** Whether that is three services, three profiled one-shots, or three host-scheduled `compose run` invocations is architecture's call — the **requirement** is one credential per context. |
| **R-C5.2** | **Three real Postgres roles with the §5.5.0 grants must exist in the deployment.** One superuser URL exported under three variable names satisfies the *shape* and destroys the *property*. The check is `SELECT current_user` per job, plus a **negative** test per job proving it cannot write the other two jobs' targets. Positive-only checks pass under a shared superuser. |
| **R-C5.3** | **No shared `env_file`, no top-level YAML anchor (`x-common-env`), and no `environment` block inherited via `extends:` may carry any of the three.** This is the likeliest accidental violation, because sharing env is the obvious DRY move in a compose file. |
| **R-C5.4** | **`apps/replay` gets a fourth, read-only-full-stop credential, supplied at invocation, not baked in.** **(b)** `apps/replay/src/cli.ts:5` reads it from **argv**; it must not be moved into an image layer, a shared env file, or the stack's environment — argv-at-invocation is what keeps ADR-0018 clause 2's "scheduled separately" honest. |
| **R-C5.5** | **`job:reaper` must not be scheduled.** **(b)** `runReaper` throws `S00_SCAFFOLD_ONLY` (`apps/scheduler/src/index.ts:87-88`) and root `package.json` has no `job:reaper` script. Scheduling it produces a crash-looping container that reads as a Docker defect. Its **credential** should still be provisioned (so the later slice does not need a deployment change), and the deploy doc must record that AC-89's write half does not fire here. |
| **R-C5.6** | **No credential literal in any compose file, Dockerfile, or `.env.compose`.** **(b)** `.env.compose` is **generated** (`compose-env.ts`) and **not gitignored** (V10) — so anything written there is committable. Requirement: `.env.compose` stays **derived and secret-free**; operator secrets live in a separate, gitignored, operator-provided file (or a compose `secrets:` mount). **(a)** DR-179's discipline — *"no key material enters the repo, the register, the environment, or any config"* — is written about model-provider API keys; **(c)** I read it as the governing discipline for credential handling generally, and I flag the distinction rather than assert it. |
| **R-C5.7** | **`HATCHET_CLIENT_TOKEN` is engine credential material, not a model API key.** **(c) JUDGEMENT:** DR-179 does not literally prohibit it (its subject is model access via API keys), so introducing it is **not** a DR-179 violation — but it must be operator-injected at runtime, never committed, never in `.env.compose`, and any DR-179 secret-scan gate must be written to know the difference, or it will either false-positive on every Hatchet deployment or be disabled entirely. Both outcomes are worse than naming the exception. *Counter:* a stricter reading of DR-179 ("no key material… in the environment") would forbid it outright, which would make self-hosted Hatchet unusable and contradict DR-118 — so the narrow reading is the only coherent one, but it **is** a reading, and V may want to confirm it. |
| **R-C5.8** | **Do not change the existing dev Postgres password.** **(b)** `POSTGRES_PASSWORD: debateai-dev-only` (`compose.dev.yaml:9`) and the same literal inside the engine's `DATABASE_URL` (`:22`). The brief records that the live security research already cites these. Changing them is a **collision** (RQ-D2), not a hardening win for this mission. |

**Confidence: high.** *Strongest counter-argument:* R-C5.1 turns one scheduler service into
three injection contexts, which contradicts §5.5.0's own phrasing that *"the three jobs
**share a process**"*. That phrase describes the **module** (`apps/scheduler` is one unit
with three entry points), not the runtime container — but a reviewer could reasonably read
R-C5.1 as inventing a topology the architecture did not ask for. My answer: §5.5.0's
credential separation is only real if the credentials are not co-resident, and a
containerized deployment is precisely where co-residency becomes the default.

---

# D. Isolation from the live security mission

> **FREEZE (banner 5 of 6).** This entire section exists to keep the freeze intact. No
> file under identity/auth/MFA/crypto or `2026-08-17-accounts-privacy-security/**` is
> written, retargeted, or tweaked by any requirement below.

## RQ-D1 — The file-contract rule that keeps this mission legal

**(b) LIVE — the enforcement situation is worse than "one-writer-per-file", and this is the
finding.** From the git root (`/Users/vladmihaimiron/Documents/DebateAIRO`):

- **Only 141 files under `dialectical-engine/` are tracked by git**
  (`git ls-files dialectical-engine | wc -l`).
- **`compose.dev.yaml` is not tracked**:
  `git ls-files --error-unmatch dialectical-engine/compose.dev.yaml` → *"did not match any
  file(s) known to git"*. `git check-ignore -v` returns **nothing**, so it is not ignored —
  it was simply never added. The same holds for `deploy/**`, `apps/runner/src/index.ts`,
  `apps/scheduler/**`, `apps/replay/**`, `apps/evaluator-worker/**`, and most of
  `packages/**`.
- **The tracked-and-dirty set is exactly the security mission's write set — seven files,
  and three of them are tests**: `apps/api/src/mail-channel.ts`,
  `apps/api/src/registration.ts`, `packages/db/src/identity.ts`,
  `packages/register/src/auth-policy.ts`, `tests/integration/identity-database.test.ts`,
  `tests/integration/registration-database.test.ts`, `tests/unit/registration.test.ts`.
  **`tests/` has a live writer.** That materially strengthens R-B5.2: `tests/**` is not
  merely outside this mission's contract, it is **actively contended**. (Note:
  `tests/unit/test-database-policy.test.ts` — R-B5.1's tripwire — is **clean**, i.e. not
  currently theirs either; it is simply not ours to move.)
- `dialectical-engine/Makefile` is **tracked but deleted in the working tree** (uncommitted
  deletion), so there is **no one-command dev lifecycle on disk today**.

**The rule (R-D1.1): one-writer-per-file cannot be adjudicated by `git diff` for the paths
this mission most needs.** A coding seat that "checks the diff" will see its Dockerfile and
will **not** see whether it overwrote a sibling mission's untracked edit to
`compose.dev.yaml`. Therefore the contract must be a **declared path-class manifest**,
recorded in this mission's directory before the PROGRAMMING loop, and any write outside it
is a contract breach regardless of what the diff shows.

**Path classes:**

**MAY CREATE (no existing writer):**
- `Dockerfile*`, `.dockerignore` (none exist — V11)
- a **new** sibling compose file (RQ-D2)
- new files under `deploy/**` (two files exist today; no live writer)
- container entrypoint / wait scripts under `deploy/**` — **never** under `apps/**`
- anything under `docs/missions/2026-08-21-docker-hatchet/**`

**MAY EXTEND (only for containerization of already-ruled services — intake §Isolation):**
- `deploy/IMAGE-PINS.md` — additive rows only
- `packages/register/src/compose-env.ts` — **the lawful home for compose constants**
  (§1.3: a container env var is still a constant and must come through the register).
  **CAUTION:** `packages/register/src/auth-policy.ts` is a live security-WIP file in the
  **same package**. Same package ≠ same file, so one-writer-per-file permits this — but a
  coding seat must not run package-wide refactors, formatters, or import reorganizations.
- root `package.json` **scripts only**. **(b)** currently clean in `git status`, so it is
  available; it is also high-traffic. **Requirement:** if it is dirty at ticket time, post
  `BLOCKED` rather than edit.
- `compose.dev.yaml` — **permitted by the intake, but recommended against**: see RQ-D2.

**MUST NOT TOUCH:**
- `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`,
  `packages/db/src/identity.ts`, `packages/register/src/auth-policy.ts`,
  `tests/integration/identity-database.test.ts`,
  `tests/integration/registration-database.test.ts`, `tests/unit/registration.test.ts`
  (dirty = actively written)
- `packages/crypto/**`, including `SECRET_STORE_LAYOUT.md`
- `migrations/0030_identity_foundation.sql` and later identity/auth migrations;
  `migrations/pending/**`
- `docs/missions/2026-08-17-accounts-privacy-security/**`,
  `docs/missions/2026-08-17-mfa-recovery-requirements/**`
- boards `accounts-phase1`, `accounts-phase4`, `debateai-v3`, `dialectical-engine`,
  `model-evaluator`
- **`tests/**`** — not in this mission's allowed **or** readonly list. See R-B5.2.

**R-D1.2 — Re-check, do not snapshot.** The dirty set above is a snapshot taken
2026-08-21. The security mission will dirty **new** files mid-mission. Every ticket in the
PROGRAMMING loop must re-run `git status --porcelain` at claim time and treat every dirty
tracked file as foreign until proven otherwise.

**Confidence: high.** *Strongest counter-argument:* a declared manifest is only as good as
the seat that honors it, and it adds ceremony to a mission whose whole point is a few new
files. A lighter rule — "only create new files; extend nothing" — would be nearly as safe
and much cheaper. I keep the manifest because R-A4.1/R-B4.2 require extending
`compose-env.ts`, and that single extension is what keeps the compose constants lawful
under AC-74; once one extension is permitted, the manifest is what bounds the rest.

## RQ-D2 — `compose.dev.yaml` is the collision surface

**Requirement (R-D2.1): this mission must NOT edit `compose.dev.yaml` in place. It must add
a sibling compose file that composes with it, and leave the base file byte-unchanged.**

Two reasons, and the second is specific to this repo:

1. **Overlapping keys.** The brief records that the live security research already cites
   this file's insecure flags, published ports, and `debateai-dev-only` password — **(b)**
   all present (`compose.dev.yaml:9, 18-20, 22, 25-31, 35-36`). A hardening outcome from
   that mission plausibly edits **the same keys** this mission would touch.
2. **The file is untracked (V10), so a collision would not surface as a merge conflict.**
   It would surface as one seat's edit being silently overwritten by the other's write, with
   **no diff, no conflict marker, and no history to recover from**. This is materially
   worse than the ordinary one-writer-per-file risk and it is the single strongest reason
   for R-D2.1.

**Mechanism (naming it is requirements; choosing the layout is architecture).** Compose
supports merging multiple `-f` files in order, and recent versions support a top-level
`include:`. **UNVERIFIED:** which of these the bundled Compose plugin supports — verify with
`docker compose version` once RQ-E1 is closed. Either satisfies R-D2.1.

**R-D2.2 — The residual collision a sibling file does NOT solve, and the requirement that
does.** Adding services in a sibling file does not touch the base file — good. But if the
security mission **removes** the published host ports `8888` / `7077` / `8000`
(`compose.dev.yaml:18-20, 35-36`) as a hardening step, a sibling file that depended on them
breaks. **Requirement: this mission's services must not depend on any *published host
port* of a base service. In-compose services address each other by compose service DNS on
the project network** (`postgres:5432`, `hatchet-engine:7077`). Published ports exist only
for humans.

This one requirement does four things at once: it makes the two missions independent by
construction; it forecloses RQ-B1 state (iii) (`host.docker.internal`); it is the fix for
RQ-C3.4's `localhost:7077` broadcast-address problem; and it is what production will need
anyway.

**R-D2.3 — Record an expiry.** The split is a consequence of the freeze, not a design
preference, and it must be recorded with the condition that ends it (the security mission
closing), so the files are merged back rather than becoming permanent.

**Confidence: high.** *Strongest counter-argument, and it is a real cost:* ADR-0018's
§Consequences explicitly banks on *"One compose file is the whole deployment description,
which makes the credential separations of clause 2 reviewable in one artifact."* A two-file
dev deployment weakens exactly the reviewability the ADR chose. My answer: ADR-0018's claim
is about **the deployment** (production), which must remain one file; the dev split is
temporary, scoped, and expires under R-D2.3. If a reviewer prefers the single-file
property even in dev, the alternative is to serialize the two missions — which is V's call,
not a requirements finding.

## RQ-D3 — Containerizing `apps/api` without editing identity/auth code

**(b) LIVE — the full boot contract** (`packages/register/src/runtime-environment.ts`,
`loadApiEnvironment()`; `.strict()`, evaluated at module load, so a violation exits the
container before `listen`):

**Required:** `KEK_PATH` (special: empty/missing throws `RuntimeKekUnresolvedError`
/ `KEK_UNRESOLVED`), `BLIND_INDEX_KEY_PATH`, `AUDIT_KEY_STORE_PATH`,
`AUDIT_SOURCE_IP_SALT_PATH`, `USER_DEK_STORE_PATH`, `MAIL_SENDMAIL_PATH`,
`MAIL_FROM` (must match `/^noreply@[A-Za-z0-9.-]+$/`),
`PUBLIC_APP_URL` (must be a URL **and start with `https://`**),
`DATABASE_URL`, `API_HOST`, `API_PORT`, `STRANGER_SAMPLE_RATE` (0..1),
`REGISTER_VERSION`, `BATTERY_VERSION`, `SETTLEMENT_WATCH_HANDLE`, plus the six `HATCHET_*`.
**Optional:** `NODE_ENV`, `EVALUATOR_DEV_MENU_ENABLED` (default `"false"`),
`EVALUATOR_DEV_MENU_DATABASE_URL`.

**Requirements on the image (cwd, command, env, port) that keep the freeze intact:**

| ID | Requirement |
|---|---|
| **R-D3.1 — command** | The container command is the **existing published entry point**: `tsx apps/api/src/main.ts` (the `start` script). **No new entrypoint file inside `apps/**`.** If a wrapper (wait-for-dependency, signal forwarding) is needed, it lives under `deploy/`. Rationale: `apps/api/src/` holds two files the security mission is actively editing; adding a third file to that directory puts this mission inside their review surface for no gain. |
| **R-D3.2 — build context** | **The build context is the workspace root; per-app contexts are forbidden.** **(b)** `apps/runner/src/main.ts:2` imports `loadKek` via the relative path `../../../packages/crypto/src/index.js`, and `apps/runner/package.json` does **not** declare `@debateai/crypto`. A context copying only `apps/runner/` cannot resolve it. Normalizing that import would mean editing a runner file whose target is the **frozen** `packages/crypto` boundary — out of scope. So: workspace-root context, and the `.dockerignore` (a new file, no writer) is what keeps the image from carrying `node_modules`, `.pgdata*`, and `.next`. |
| **R-D3.3 — secrets are mounts, never layers** | `KEK_PATH`, `BLIND_INDEX_KEY_PATH`, `AUDIT_KEY_STORE_PATH`, `AUDIT_SOURCE_IP_SALT_PATH` are **file paths**; `USER_DEK_STORE_PATH` is a **directory tree** with mode semantics — **(b)** `packages/crypto/SECRET_STORE_LAYOUT.md`: `USER_DEK_STORE_PATH/` `0700`, `users/` `0700`, `<uuid>/` `0700`, `dek.v1.json` `0600`; the audit salt is *"a separate 32-byte mode-0600 secret"*. **Requirements:** (i) none of these may be baked into an image layer or passed as an env **value**; (ii) `USER_DEK_STORE_PATH` must be a **named volume** that survives `docker compose down` (**CB-6**) — losing it destroys every user's wrapped DEK, which is **crypto-shredding by accident** and unrecoverable; (iii) the container's UID must own the tree with the documented modes, and the image must **not** relax them to "make it work"; (iv) the container **adapts to** the layout — **this mission changes no file under `packages/crypto`.** |
| **R-D3.4 — `PUBLIC_APP_URL`** | Must be an `https://` URL **even in local dev** (the zod `refine`). The dev value is a real https URL the operator names. **The refine must not be relaxed** — that is an auth-surface edit and a freeze violation. |
| **R-D3.5 — `MAIL_SENDMAIL_PATH`** | Validation is only "non-empty string", so **a container with no sendmail binary boots fine and fails only when a registration email is sent** (`apps/api/src/mail-channel.ts`, `SendmailMailSender`). **Requirement:** either the image provides a sendmail-compatible executable at that path, or `deploy/` **records** that registration mail is non-functional in the containerized dev stack. Recorded, never discovered. **Do not "fix" it by editing `mail-channel.ts`** — that file is dirty and foreign. |
| **R-D3.6 — host and port** | `API_HOST` must be `0.0.0.0` inside the container; `127.0.0.1` makes the service unreachable from siblings. This is an **env value**, not a code change (`api.listen({host: API_HOST, port: API_PORT})`). Publish a host port only where a human must reach the service; `web`→`api` uses compose DNS (R-D2.2). |
| **R-D3.7 — dev menu off** | `EVALUATOR_DEV_MENU_ENABLED` must be `"false"` or unset in any production-intended image. The loader already throws on `"true"` + `NODE_ENV=production`, and on `"true"` without `EVALUATOR_DEV_MENU_DATABASE_URL`. **Neither guard may be weakened to make a container start.** |
| **R-D3.8 — AC-74 at the container boundary** | Every value above is a **constant**. **(a)** §1.3: *"a value injected as a container environment variable is still a constant, and reading it anywhere but the loader is the same defect."* **Requirement:** no Dockerfile `ENV` default and no compose literal may become the **source** of a register-governed constant; compose variables are generated from `register.bootstrap.json` by `pnpm compose:env`. **(b)** `packages/register` is already the only `process.env` reader (`parseEnvironment` in `runtime-environment.ts`) — this property must survive containerization. |
| **R-D3.9 — `web`'s API base** | **(b)** `web/app/api/[...path]/route.ts` **throws `DIALECTICAL_API_BASE_REQUIRED`** if unset, and `web/lib/serverApi.ts:6` defaults to `http://127.0.0.1:8000` — which inside a container points at the **web container itself**, and on the host **collides with `vllm`'s published 8000** (`compose.dev.yaml:36`). Also `web/lib/api.ts:3-8`: `NEXT_PUBLIC_API_BASE` defaults to `/api` and **throws `NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH`** if given a non-same-origin value. **Requirement:** `DIALECTICAL_API_BASE` is set explicitly to the `api` service DNS; **never** relied on by default; **never** `host.docker.internal`. |
| **R-D3.10 — one `web`** | **(b)** `apps/ui` and `web` both bind `-p 3000`. Only `web` is an ADR-0018 unit (root `build` builds `dialectical-engine-web`; `03-module-design.md` §1.2's `web` row describes it). **Requirement:** exactly one is containerized as the `web` service and the other is not started by the same compose invocation. Recommend `web`. Routed to **RQ-E8**. |

**One live tension I found and am not ruling on.** **(b)** `web` contains a real reverse
proxy at `web/app/api/[...path]/route.ts` (`readApiBase()` → forwards to
`DIALECTICAL_API_BASE`). **(a)** ADR-0018 clause 1 states: *"There is one origin address for
the contract, and it is `apps/api`. No second hostname, **no `/api/*` proxy inside `web`**,
no direct-to-origin route that skips Cloudflare for some callers."* This condition **exists
today and is not created by this mission**. **Requirement for this mission:**
containerization must not **deepen** it — no new route, no new origin, and the proxy must
remain a pure forwarder that makes no tier (ADR-0013), disclosure (AC-56) or honesty-field
(AC-54) decision. Whether the route is the forbidden second path or the sanctioned SSR
forwarder is an **AC-60 ruling question**, routed to **RQ-E7**.

---

# E. Open questions only V can close

> **FREEZE (banner 6 of 6).** V was **not** contacted. Each item below is for the
> orchestrator's V DECISIONS PACKET. Nothing here authorizes any write to identity, auth,
> MFA, crypto, or the `2026-08-17-accounts-privacy-security` tree.

### RQ-E1 — Enable the Docker CLI / start Docker Desktop on this Mac now?

**Question.** May a seat put Docker on PATH and start the daemon, or does V do it?
**Why REQUIREMENTS cannot close it.** The intake classifies it as an **IMPORTANT OPERATION**
(operator software), *"packet to V; do not do it silently."*
**Evidence.** `command -v docker` → exit 1; binaries present at
`/Applications/Docker.app/Contents/Resources/bin/docker` and `…/cli-plugins/docker-compose`;
`/usr/local/bin/docker` absent; daemon not running (V6).
**Options.** (a) V enables Docker Desktop and adds the CLI to PATH. (b) V authorizes a
named seat to do it as a recorded IMPORTANT OPERATION. (c) Defer — the mission becomes
documentation-only.
**Recommendation: (a).** Confidence high. Under (c), **no** seat, review lens, or Hermes
verdict may record "containerized"; the honest word is **UNPROVEN** (R-A5).
*Strongest counter:* starting Docker Desktop changes the machine's memory and CPU profile
while `accounts-phase1` is live on this same machine running embedded-Postgres work; a
daemon plus a Postgres container plus (later) vLLM could destabilize a mission V cares more
about right now.

### RQ-E2 — Production Hetzner compose in this mission, or local-dev first?

**Question.** Does this mission produce a production compose for Hetzner behind Cloudflare?
**Why not mine.** It requires a provisioned host, a Cloudflare zone, a domain, and TLS —
none exist (**(b)** `grep -rli "hetzner\|cloudflare"` over `deploy/`, `compose.dev.yaml`,
`package.json` → no hits; `deploy/` has two files). Provisioning is spend and an external
account action.
**Options.** (a) Local-dev only this mission; production as a named follow-up. (b) Both.
(c) Production only.
**Recommendation: (a)**, with R-B3.1's production-shaped constraint so the follow-up is
configuration rather than a rewrite. Confidence high.
*Strongest counter:* see RQ-B3 — deferring leaves ADR-0018's proxy/SSE/AC-60 clauses
entirely unexercised, and those are where the ADR predicts the incident.

### RQ-E3 — Is `apps/evaluator-worker` an ADR-0018 unit?

**Question.** Must it be containerized, or is it out of the ruled service list on purpose?
**Why not mine.** ADR-0018's service list is V-ruled (DR-117); adding a unit to it is a
topology decision.
**Evidence.** **(b)** `apps/evaluator-worker/package.json` has **no `scripts` key**; `src/`
contains only `index.ts` (a library exporting `EVALUATOR_TASK_FAMILIES` and `run*`
functions); there is no `main.ts`. It is **not a process**. It is absent from ADR-0018's
seven and from `03-module-design.md` §1.3's service map. `apps/api` optionally wires
`PostgresEvaluatorDevMenuRepository` behind `EVALUATOR_DEV_MENU_ENABLED`.
**Options.** (a) Out of the list on purpose; not containerized here. (b) It is a unit and
needs a process + a service. (c) It belongs to the live `model-evaluator` mission's own
deployment slice.
**Recommendation: (a)**, with (c) noted as the likely long-run answer. Confidence
medium-high. *Strongest counter:* the `model-evaluator` mission is **live**; if it lands a
worker process next week, this mission will have containerized everything except the one
component that was actively growing, forcing a second pass.

### RQ-E4 — Does V's mission prompt lift DR-121 / DR-121-r?

**Question.** DR-121 (*"for now we do not install anything from the Docker family… hatchet-lite
dev-compose stays AUTHORED-DORMANT… every container-dependent fixture [is] DEFERRED BY
RULING"*) and DR-121-r (*"just defer docker and hatchet for now"*) are **both marked
ACTIVE** in `docs/missions/2026-08-06-v3-programming/decisions-ledger.md:311-329` and
`:547-550`. V's 2026-08-21 prompt says *"use Docker and Hatchet to containerize the app."*
Does that supersede them, and **how much** of them?
**Why REQUIREMENTS cannot close it.** Superseding a V ruling is V's act. And the row has
**two separable clauses**, so "it's obviously lifted" is not precise enough to act on.
**Options.** (a) Lift clause (2) only — Docker/Hatchet for the **application** stack —
while **preserving** clause (1), which makes embedded-Postgres the standing test database.
(b) Lift the whole row, flipping test provisioning to Testcontainers as
`06-test-strategy.md:169` requires. (c) Treat the mission prompt as self-evidently
superseding, mint no ledger row.
**Recommendation: (a), recorded as a new DR.** Confidence high. It is the smallest lift
that unblocks the mission, it keeps `tests/**` (a path class this mission does not hold —
R-B5.2) untouched, and it leaves the test-store change as a separate, separately-reviewed
decision. *Strongest counter:* V may see a ceremonial DR as bureaucracy when the mission
prompt is unambiguous; and leaving clause (1) alive means `06-test-strategy.md:169` stays
out of step with the tree, which a later reviewer will read as an incomplete job.

### RQ-E5 — Service name: `hatchet-lite` or `hatchet-engine`?

**Question.** ADR-0018 and `03-module-design.md` §1.3 name the service `hatchet-engine`;
the live compose declares `hatchet-lite` (`compose.dev.yaml:14`) and `deploy/IMAGE-PINS.md:3`
keys the pin under `hatchet-lite`. Is aligning the name a documentation fix, or a topology
decision?
**Why not mine.** It moves a key in a ruled artifact's pin inventory.
**Options.** (a) Rename the service to `hatchet-engine`, keep the lite **image** in dev.
(b) Keep `hatchet-lite` and record an alias in ADR-0018 / `deploy/`.
**Recommendation: (a).** Confidence medium-high — it makes ADR-0018 compliance a string
comparison rather than a judgement call. *Strongest counter:* the name `hatchet-lite`
honestly signals that dev runs an all-in-one distribution; renaming it hides a real
difference behind a compliant label, which is the opposite of what a topology document is
for.

### RQ-E6 — Digest-pin `postgres`?

**Question.** `compose.dev.yaml:5` uses `postgres:${POSTGRES_MAJOR_VERSION}` → `postgres:18`,
a **floating tag**, against §5.4c's *"Exact digests, never floating tags — for the register
row and the compose pin alike."* Resolving a digest mints a **value**, and values are V's
(AC-76, DR-023) under DR-104's resolve-on-machine rule.
**Why not mine.** It mints a bootstrap register row.
**Options.** (a) Add `postgresImageDigest` to `register.bootstrap.json`, resolved on the
machine, emitted into compose by `pnpm compose:env` (R-A4.1). (b) Accept the major-version
tag as sufficient, and record the exception. (c) Defer to the production slice.
**Recommendation: (a).** Confidence medium-high. *Strongest counter:* §5.4c's digest
requirement is written **about the two services it classifies** (`vllm`, `hatchet-engine`);
reading it as binding `postgres` too is **my extension**, and `postgresMajorVersion` is
already a ratified bootstrap row — V may reasonably hold that the ruled major is the pin
that was intended, and that a digest adds churn (every upstream patch release moves it) for
a service whose behaviour the major already fixes.

### RQ-E7 — Is `web`'s `/api/[...path]` proxy the second path AC-60 forbids?

**Question.** **(b)** `web/app/api/[...path]/route.ts` is a real reverse proxy
(`readApiBase()` → `DIALECTICAL_API_BASE`). **(a)** ADR-0018 clause 1 says *"no `/api/*`
proxy inside `web`."* Is the live route the forbidden second path, or the sanctioned
SSR forwarder AC-57 describes?
**Why not mine.** It is an AC-60 ruling question, and the condition **predates this
mission** — I did not create it and must not resolve it.
**Options.** (a) Declare it lawful same-origin SSR forwarding under AC-57 (it forwards the
asker's scope and decides nothing), and add the clause to ADR-0018 at the architecture
loop. (b) Declare it the forbidden proxy; the browser reaches `api` directly through the
edge and the route is removed.
**Recommendation: (a)**, bounded by a written clause that the route may never make a tier
(ADR-0013), disclosure (AC-56) or honesty-field (AC-54) decision — which is exactly ADR-0018
clause 1's *"the proxy is a transport participant, not a policy layer"*. Confidence medium.
*Strongest counter:* ADR-0018's prohibition is worded specifically enough (*"no `/api/*`
proxy inside `web`"*) that reading the live route as compliant looks like fitting the law to
the code; and a containerization mission that publishes `web` as the browser's origin makes
the proxy **the** path rather than a path, which is the strongest possible version of the
breach.

### RQ-E8 — `apps/ui` vs `web`: which one is the ruled `web` unit, and is the other retired?

**Question.** **(b)** Both bind port 3000; both are Next apps with parallel `app/` trees
(`admin`, `api`, `debate`, `new`, `settings`). Only `web` is an ADR-0018 unit and only
`dialectical-engine-web` is built by the root `build` script. Is `apps/ui` retired, a
second unit, or a staging copy?
**Why not mine.** It is a module-inventory question (`03-module-design.md` §1.2), not a
containerization requirement.
**Recommendation:** containerize `web`; do not start `apps/ui` in the same compose
invocation; record `apps/ui` as out-of-topology pending V/architecture. Confidence
medium-high.
*Strongest counter:* if `apps/ui` is the newer surface and `web` the stale one, this
recommendation containerizes the wrong UI, and the port collision guarantees the mistake
will not be noticed until both are started together.

### RQ-E9 — Does the required bar include a REAL model call?

**Question.** Must a "containerized" claim include at least one real model call made from
inside the compose network?
**Why not mine.** It is the boundary of what V's word "containerize the app" means, and it
collides with a standing ruling.
**Evidence.** **(a)** DR-179: model access is **exclusively** through V's authenticated CLI
subscriptions, wrapped as **local relays**; the intake adds *"Relays are not Hatchet
workers."* Relays are host processes (RQ-B2). **(b)** `vllm` is the only in-compose
provider, requires an unregistered `VLLM_MODEL`, and **UNVERIFIED** whether its pinned image
runs on this `darwin/arm64` host at all. So a fully-containerized runner may have **no
lawful in-network way to make a real call**.
**Options.** (a) The bar **excludes** a real model call: dispatch + claim + a **typed
failure with a ledger row** is the bar — **(a)** DR-115-lawful per ADR-0018 clause 3(d).
(b) The bar **includes** a real call, which requires either a GPU host for `vllm` or a
container→host relay bridge — and a relay bridge is a **DR-179 question**, not an
engineering choice.
**Recommendation: (a) for this mission, stated explicitly in `deploy/`** so that no later
seat, review, or verdict describes the containerized stack as "running debates". Confidence
medium-high.
*Strongest counter:* a bar that never makes a model call proves the plumbing and not the
product. V asked to containerize **the app**, and an app that cannot answer a question is
not, in the ordinary sense of the word, containerized — a QA lens could reasonably refuse
the claim on exactly that ground.

---

## Assumptions and residual risks

1. **Blindness held.** No other seat's artifact, packet, or log was opened. If another seat
   verified something I marked UNVERIFIED, synthesis should prefer their evidence.
2. **Snapshot risk.** RQ-D1's dirty-file set is a 2026-08-21 snapshot. `accounts-phase1` is
   live and will dirty new files. R-D1.2 requires re-checking per ticket.
3. **UNVERIFIED items, consolidated:** (i) whether `vllm/vllm-openai@sha256:ffb2d59b…`
   publishes an `arm64` variant or runs without CUDA — verify by
   `docker manifest inspect`; (ii) the `postgres` image's first-boot-only
   `docker-entrypoint-initdb.d` semantics — verify against the official image docs and
   empirically; (iii) which Compose merge mechanism (`-f` chain vs `include:`) the bundled
   plugin supports — verify by `docker compose version`; (iv) Hatchet's dashboard/API
   surface names for RQ-C2's O-1/O-2 — ADR-0017 already **requires** re-checking vendor docs
   at the implementation ticket; (v) RQ-C3.4's `SERVER_GRPC_BROADCAST_ADDRESS` consequence is
   derived from what the key means, not from execution.
4. **Nothing was executed against Docker.** No install, no daemon start, no pull, no build.
   RQ-E1 is untouched and open.
5. **No code, Dockerfile, compose, schema, migration, or configuration was written.** Only
   the two paths in my goal packet's `allowed` list were written.

---

```
WORKER CLAIM:
- ticket: REQ-DOCKER-OPUS
- owner CLI session: db2badc6-2b47-43a3-9d32-69aa6da78a3c
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / H0-REQUIREMENTS
- owner CLI session: db2badc6-2b47-43a3-9d32-69aa6da78a3c
- artifact path: docs/missions/2026-08-21-docker-hatchet/research/opus-requirements.md
- upstream artifacts used: docs/missions/2026-08-21-docker-hatchet/brief.md;
  docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md;
  docs/missions/2026-08-21-docker-hatchet/goal-packets/opus.md;
  docs/architecture/01-decisions/ADR-0017-durable-execution-hatchet.md;
  docs/architecture/01-decisions/ADR-0018-deployment-topology.md;
  docs/architecture/03-module-design.md (§1.2, §1.3, §5.5.0);
  docs/architecture/05-register-skeleton.md (§1.3, §5.4c);
  docs/architecture/06-test-strategy.md (line 169);
  docs/missions/2026-08-06-v3-programming/decisions-ledger.md (DR-121, DR-121-r, DR-179);
  live tree: compose.dev.yaml, deploy/**, register.bootstrap.json, package.json,
  pnpm-workspace.yaml, apps/{api,runner,scheduler,replay,evaluator-worker,ui}/**,
  web/**, packages/register/src/{runtime-environment.ts,compose-env.ts},
  tests/support/testDatabase.ts, tests/unit/test-database-policy.test.ts,
  tools/orphan-audit/src/index.ts, acceptance/{main.ts,README.md},
  packages/crypto/SECRET_STORE_LAYOUT.md (read-only)
- checks/evidence: 15-row Verification ledger at the head of the artifact; every command
  is read-only and re-runnable. Key negative results: `command -v docker` exit 1;
  no Dockerfile/.dockerignore/second compose file anywhere; no Hetzner/Cloudflare artifact;
  compose.dev.yaml not tracked by git and not gitignored; only 141 files under
  dialectical-engine/ are tracked; the seven tracked-and-dirty files are the security
  mission's write set and three of them are under tests/.
- assumptions/risks: see "Assumptions and residual risks" above — blindness held; the
  dirty-file set is a snapshot and must be re-checked per ticket; five items are marked
  UNVERIFIED with the command that would verify each; nothing was executed against Docker;
  no code, Dockerfile, compose, schema, migration, or configuration was written.
- comments read through: intake
```
