# Grok requirements — Docker + Hatchet containerization

- **Seat:** Grok 4.6, REQUIREMENTS, parallel-blind (`REQ-DOCKER-GROK`)
- **Mission:** `2026-08-21-docker-hatchet` / H0-REQUIREMENTS
- **Date:** 2026-08-21
- **Comments read through:** intake

This is requirements research. It is not architecture, not code, not a Dockerfile,
not a compose patch, and not a file-layout proposal.

**Evidence kinds (binding).** Every claim is one of:

- **Ruled law** — already decided (ADR/DR/AC). Restated as a constraint; not re-opened.
- **Live-tree fact** — verified against named files in this tree on 2026-08-21.
- **Vendor fact** — fetched live from `docs.hatchet.run` on 2026-08-21.
- **Judgement** — this seat's recommendation. Always carries a confidence and the
  single strongest argument against it.
- **`UNVERIFIED`** — could not be checked here; what would verify it is stated.

**Freeze (repeat).** Do not write, retarget, or tweak identity, registration, MFA,
sessions, crypto shredding, `packages/crypto`, identity migrations `0030+`, or
`docs/missions/2026-08-17-accounts-privacy-security/**`. Do not operate
`accounts-phase1` / `accounts-phase4`. This seat wrote only the two allowed
paths named in the goal packet.

---

## A. Current-state gap

### RQ-A1. ADR-0018 service list vs `compose.dev.yaml` today

**Question.** What does ADR-0018 list as compose services, and what does
`compose.dev.yaml` actually declare today? Table both. Name the missing services.

**Answer.**

| Source | Services declared |
|---|---|
| **Ruled law** — ADR-0018 Decision table (`docs/architecture/01-decisions/ADR-0018-deployment-topology.md`) | `web`, `api`, `runner`, `scheduler`, `hatchet-engine`, `postgres`, `vllm` |
| **Live-tree fact** — `compose.dev.yaml` `services:` keys | `postgres`, `hatchet-lite`, `vllm` |

**Missing from live compose against the ADR-0018 name list:** `web`, `api`,
`runner`, `scheduler`, and the named service `hatchet-engine`.

**Name collision, not a silent extra:** live compose has `hatchet-lite` instead
of `hatchet-engine`. That is a different vendor image and a different compose
service name (see RQ-C3). It is not an alias of the ADR-0018 row.

**Live compose also omits, relative to the ADR-0018 notes on those rows:**

- No `web` / `api` / `runner` / `scheduler` process services.
- No `apps/replay` service (replay is **not** in the ADR-0018 seven-row table;
  ADR-0018 clause 2 still requires a separately-scheduled read-only ceremony).
- No published Postgres port, no healthchecks, no restart policy on any service
  (`compose.dev.yaml` as read 2026-08-21).
- Hatchet dashboard/gRPC published at `8888` and `7077`; vLLM at `8000`.

**Intake lead re-verified:** three services, not seven. Confirmed.

---

### RQ-A2. How each app process starts today, and which are ADR-0018 units

**Question.** For each of `apps/api`, `apps/runner`, `apps/scheduler`,
`apps/replay`, `apps/evaluator-worker`, `apps/ui`, `web`: how does the process
start today? Which are ADR-0018 deployment units?

**Answer.**

| Unit | How it starts today (**live-tree fact**) | ADR-0018 deployment unit? |
|---|---|---|
| `apps/api` | `apps/api/package.json` script `start` → `tsx src/main.ts`. Listens with `api.listen({ host: environment.API_HOST, port: environment.API_PORT })` (`apps/api/src/main.ts`). No root `package.json` wrapper. | **Yes** — service `api` |
| `apps/runner` | `apps/runner/package.json` script `start` → `tsx src/main.ts`. Process is a long-lived Hatchet worker (`hatchet.worker` + `registerWorkflows` + `start`). | **Yes** — service `runner` |
| `apps/scheduler` | No `start` script in `apps/scheduler/package.json`. Root `package.json` exposes three CLIs: `job:replay-self-test`, `job:liveness-sweep`, `job:settlement-watch` → `tsx apps/scheduler/src/cli.ts <command>`. CLI accepts only those three command names (`apps/scheduler/src/cli.ts`). | **Yes** — service `scheduler`. **Name gap:** ADR-0018 / `03-module-design.md` §1.2 name the middle job `job:reaper`; live scripts name it `job:liveness-sweep`. `tools/orphan-audit` still lists `job:reaper` as a stub. |
| `apps/replay` | `apps/replay/package.json` script `ceremony` and root `replay:ceremony` → `tsx src/cli.ts` with argv `<postgres-url> <operator-attestation.json>`; sets the session read-only then runs the ceremony. One-shot, not a daemon. | **Not a named ADR-0018 compose service.** Clause 2 still requires a separately-scheduled read-only credentialed job. |
| `apps/evaluator-worker` | **No start script, no CLI.** `apps/evaluator-worker/src/index.ts` exports task-family helpers (`EVALUATOR_TASK_FAMILIES`). It is a library, not a process. | **No** — not in the ADR-0018 table. See RQ-E3. |
| `apps/ui` | `apps/ui/package.json`: Next.js `dev` / `start` on port 3000 (`dialectical-engine-v2ui`). | **No** — ADR-0018 `web` is the kept Next.js interface, which module-design §1.2 assigns to package `web`, not `apps/ui`. See RQ-E4. |
| `web` | `web/package.json`: Next.js `dev` / `start` on port 3000 (`dialectical-engine-web`). | **Yes** — service `web` |

**Test harness (shared):** root `package.json` `test` → `vitest run`. Database
tests go through `tests/support/testDatabase.ts` (embedded Postgres today; see
RQ-B5). That is not an ADR-0018 unit.

**Judgement.** The containerization bar is the ADR-0018 seven, plus the replay
*job* (not necessarily a long-running service). `apps/ui` and
`apps/evaluator-worker` are out of the ruled service list unless V adds them
(RQ-E3, RQ-E4).

- **Confidence:** high.
- **Strongest counter-argument:** `apps/ui` is a live Next.js app on the same
  port as `web`; an operator demo that containers `apps/ui` and not `web` would
  look like "the UI is in Docker" while missing the ruled `web` unit.

---

### RQ-A3. Is Hatchet a running dependency of app code, or only a compose sidecar?

**Question.** Search for Hatchet SDK usage, env keys (`HATCHET_*`,
`SERVER_GRPC_*`), and worker registration.

**Answer.** **Live-tree fact: Hatchet is already a running dependency of app
code**, not merely a sidecar. The sidecar exists, and the apps already construct
clients against it. What is missing is the *containerized app processes* and a
proven dispatch loop on this machine (Docker CLI is not on PATH; RQ-A5).

**SDK (lockfile-pinned `1.28.1`):**

- `apps/api/package.json` and `apps/runner/package.json` depend on
  `@hatchet-dev/typescript-sdk` `1.28.1`.
- `pnpm-workspace.yaml` `allowBuilds` includes `@hatchet-dev/typescript-sdk`.
- `apps/scheduler`, `apps/replay`, `apps/evaluator-worker`, `apps/ui`, `web`:
  **no** `hatchet` string in those trees.

**Client construction and dispatch (api):** `apps/api/src/main.ts` constructs
`new Hatchet({ token: environment.HATCHET_CLIENT_TOKEN, host_port:
environment.HATCHET_HOST_PORT, api_url: environment.HATCHET_API_URL, tenant_id:
environment.HATCHET_TENANT_ID, tls_config: { tls_strategy:
environment.HATCHET_TLS_STRATEGY } })` and `new HatchetDispatcher(hatchet,
environment.HATCHET_WORKFLOW_NAME)`. `HatchetDispatcher.dispatch` calls
`client.runNoWait(workflowName, { runId, workItemId }, { additionalMetadata:
{ v3RunId, v3WorkItemId, sourceOfRecord: "core.work_item" } })`
(`apps/api/src/index.ts`).

**Worker registration (runner):** `apps/runner/src/main.ts` uses the same client
shape, `declareHatchetWalkingSkeletonTask(...)`, then:

- `const worker = await hatchet.worker(environment.HATCHET_WORKER_NAME);`
- `await worker.registerWorkflows([task]);`
- `await worker.start();`

`declareHatchetWalkingSkeletonTask` (`apps/runner/src/index.ts`) declares
`client.task({ name: workflowName, retries: engineRetries, fn })`. Engine
retries are required to be a non-negative register value (ADR-0017 clause 5).

**Env contract (register loader, not raw `process.env` in apps):**
`packages/register/src/runtime-environment.ts` `hatchetShape` requires
`HATCHET_CLIENT_TOKEN`, `HATCHET_HOST_PORT`, `HATCHET_API_URL`,
`HATCHET_TENANT_ID`, `HATCHET_WORKFLOW_NAME`, `HATCHET_TLS_STRATEGY` ∈
{`tls`,`mtls`,`none`}. Runner additionally requires `HATCHET_ENGINE_RETRIES`
and `HATCHET_WORKER_NAME`. AC-74 (`05-register-skeleton.md`) forbids
`process.env` reads outside this loader.

**`SERVER_GRPC_*`:** **only** on the engine container in `compose.dev.yaml`
(`SERVER_GRPC_BIND_ADDRESS`, `SERVER_GRPC_INSECURE`,
`SERVER_GRPC_BROADCAST_ADDRESS`, `SERVER_GRPC_PORT`). No app source reads
`SERVER_GRPC_*`.

**Consequence.** `loadApiEnvironment` / `loadRunnerEnvironment` will refuse to
boot without a non-empty token and the rest of `hatchetShape`. A compose sidecar
with nobody calling it is **not** the current code shape. A demo that starts
only `hatchet-lite` and leaves `api`/`runner` on the host (or off) is still a
false "we use Hatchet" claim until a worker is registered and a `runNoWait`
is observed (RQ-C2).

---

### RQ-A4. Image pins: what is pinned, what is floating, what AC-74 requires

**Question.** What does `deploy/IMAGE-PINS.md` + `pnpm compose:env` actually pin,
and what is still `:latest` or unpinned? What is the pin requirement (AC-74 /
register discipline)?

**Answer.**

**Live-tree fact — `deploy/IMAGE-PINS.md` (recorded 2026-08-07):**

| Image | Pin actually written | Kind |
|---|---|---|
| `hatchet-lite` | `ghcr.io/hatchet-dev/hatchet/hatchet-lite:latest@sha256:7198bda4d73021a9759d90c57f11f1dd2b32599b81f4c08a5a97ea4cf047c41a` | digest-pinned compose build input. Tag `latest` is present but the digest is the identity. |
| `vllm` | `vllm/vllm-openai:latest@sha256:ffb2d59b1c059a5bd8d781320c9f5189de8293693b7d95da54befddaa54abf52` | digest-pinned **and** bootstrap register row `vllmImageDigest` (`register.bootstrap.json`). |
| `postgres` | `postgres:${POSTGRES_MAJOR_VERSION}` | **major only, no digest.** |

**`pnpm compose:env`:** `packages/register/src/compose-env.ts` writes
`.env.compose` as `POSTGRES_MAJOR_VERSION=<bootstrap.values.postgresMajorVersion>`.
`register.bootstrap.json` has `"postgresMajorVersion": "18"` (resolution:
embedded-postgres darwin-arm64 on 2026-08-07). `compose.dev.yaml` interpolates
`postgres:${POSTGRES_MAJOR_VERSION:?generated from register.bootstrap.json by pnpm compose:env}`.

**Ruled law — AC-74 / `05-register-skeleton.md` §5.4c:**

- Exact digests, **never floating tags**, for both the vLLM register row and the
  Hatchet compose pin.
- `vllm` is **verdict-bearing** → register row `vllmImageDigest` (bootstrap).
- `hatchet-engine` is **not** verdict-bearing → compose digest pin, audited as
  a build input, not a register row.
- No numeral in the ADR; values recorded at S00 under DR-104.
- Vendor compose examples commonly ship `:latest` **without** a digest
  (`https://docs.hatchet.run/self-hosting/docker-compose`,
  `https://docs.hatchet.run/self-hosting/hatchet-lite`, fetched 2026-08-21).
  Copying that is an AC-74 defect.

**Gaps against that law:**

1. Postgres image has no digest. Major `18` is bootstrap-pinned; the patch-level
   image identity can still float.
2. Both Hatchet and vLLM **write** `:latest` next to the digest. Docker will
   honor the digest; operators and `docker compose pull` folklore will not.
3. There is **no** `hatchet-engine` image pin at all — only `hatchet-lite`
   (`deploy/IMAGE-PINS.md`, `compose.dev.yaml`).
4. `VLLM_MODEL` is required at compose-up
   (`${VLLM_MODEL:?VLLM_MODEL must name a real provisioned model}`) and is not
   an image pin. That is a provider/register concern, not a digest.

**Requirement.** Any image this mission adds (app images, a production
`hatchet-engine` image, a future Postgres digest) must be an exact digest.
Hatchet engine digest stays a compose pin; vLLM digest stays the existing
register row. Do not copy vendor `:latest`.

- **Confidence:** high.
- **Strongest counter-argument:** pinning Postgres by digest on top of major
  `18` fights the existing bootstrap rule that the *major* is the semantic pin
  (DDL/`SKIP LOCKED`); a digest pin could be argued as extra operational
  provenance rather than AC-74-required for a non-verdict-bearing database
  image.

---

### RQ-A5. Docker on this machine

**Question.** `/Applications/Docker.app` exists; `docker` was not on PATH at
intake. What must be true of the operator environment before any later coding
seat can honestly claim a container came up?

**Answer.** Re-verified 2026-08-21 against the filesystem (this seat did not
start the engine):

- `/Applications/Docker.app` **exists** (bundle layout present, including
  `Contents/MacOS/Docker Desktop.app` and
  `Contents/Resources/bin/docker`).
- The CLI binary lives inside the app bundle
  (`/Applications/Docker.app/Contents/Resources/bin/docker`; compose plugin
  under `Contents/Resources/cli-plugins/docker-compose`). It is **not** on
  the usual PATH prefixes: `/usr/local/bin` lists only `ollama`;
  `/opt/homebrew/bin` lists `brew` and `gh`; `/usr/bin` has no `docker`.
  A later coding seat still cannot invoke `docker` / `docker compose` until
  that binary is on PATH (Docker Desktop "CLI tools" install, or equivalent).
- A search of the tree found **no `Dockerfile`**.
- This seat did **not** start Docker Desktop and did **not** put the CLI on
  PATH (IMPORTANT OPERATION; RQ-E1).

**Requirement (falsifiable).** A later coding seat may claim "a container came
up" only if all of the following are true on the claiming machine, with
captured output:

1. Docker Engine is running (`docker info` succeeds).
2. `docker` and `docker compose` resolve on PATH.
3. The claimed compose file was used (not a vendor sample).
4. `docker compose ps` shows the named services in a healthy/running state
   matching the mission bar (RQ-B1), using the pinned digests (RQ-A4).
5. The claiming seat did not start Docker Desktop or install the CLI unless V
   has closed RQ-E1.

Until then, any "container is up" statement is **`UNVERIFIED`**. What would
verify it: the five bullets above, captured in the coding seat's evidence.

---

## B. What "containerized" must mean (behavior)

### RQ-B1. Operator-visible acceptance bar

**Question.** State the operator-visible acceptance bar for "the app is
containerized" in this repo. One-command lifecycle? Named health checks? Logs?
Restart of a single service without taking the board down? What state would make
a demo *look* containerized while the app still ran on the host?

**Answer (judgement, made falsifiable).**

For **this mission's local-dev complete bar** (see RQ-B3 for production deferral),
"the app is containerized" means all of the following, observed by an operator
who is not looking at source:

1. **One documented compose lifecycle** brings up every process in the local
   required set (RQ-B2) from the pinned images / app images. Generating
   `.env.compose` via `pnpm compose:env` may precede it; that is still one
   documented operator path, not a hidden host `pnpm start` of `api`/`runner`.
2. **Named health checks** exist for `postgres`, the Hatchet dispatcher, `api`,
   and `runner`. "Up" without ready is not enough. Vendor engine default
   `SERVER_HEALTHCHECK=true` on port `8733`
   (`https://docs.hatchet.run/self-hosting/configuration-options`) is available
   for the dispatcher; live compose does **not** currently declare any
   `healthcheck:` keys.
3. **Logs** for each named service are reachable via `docker compose logs
   <service>` (or the documented equivalent). A worker that is "using Hatchet"
   must emit the vendor-documented connect/heartbeat lines (RQ-C2).
4. **Single-service restart:** `docker compose restart api` (or `runner`) does
   not stop `postgres` or the Hatchet dispatcher, and does not stop Hermes on
   host port 9119.
5. **Hermes on 9119 stays on the host** and keeps answering while compose
   services restart (intake: port 9119 always).

**False-containerized demo (the current tree is already this shape):**

- `postgres` + `hatchet-lite` + maybe `vllm` run in compose.
- `apps/api`, `apps/runner`, `web` are started with `tsx` / `next` on the host.
- Hatchet UI on `localhost:8888` is screenshot-able.
- No app service names appear in `docker compose ps`.

That demo **looks** like "we Dockerized Hatchet" and **fails** this bar.

- **Confidence:** high for the five-point bar; medium that healthcheck port
  `8733` is the right dispatcher probe (vendor default; live compose does not
  publish it; **`UNVERIFIED` until Docker CLI exists to query the running
  lite image**).
- **Strongest counter-argument:** requiring healthchecks and single-service
  restart as part of *requirements* over-specifies operations that ADR-0018
  never named, and could delay the actual gap (app processes not in compose).

---

### RQ-B2. What MUST run in Compose vs MUST stay on the host

**Question.** Which processes MUST run inside Compose for the claim to hold, and
which MUST stay on the host? Justify each exclusion.

**Answer.**

**MUST be Compose services for the local-dev claim (judgement, constrained by
ruled law):**

| Process | Why |
|---|---|
| `postgres` | ADR-0018 / AC-02 one instance. Already present. |
| Hatchet dispatcher | ADR-0017 / ADR-0018. Locally `hatchet-lite` is lawful as the S0 scaffold (`07-build-order.md` S0 row 9); production name is `hatchet-engine` (RQ-C3). |
| `api` | ADR-0018; AC-60 one front door. Currently host-only. |
| `runner` | ADR-0018; this is the Hatchet worker (RQ-A3, RQ-C2). Currently host-only. |
| `scheduler` | ADR-0018. The three jobs may be one image / three commands, but they run as compose-scheduled jobs, not as a hidden host crontab. |
| `web` | ADR-0018. Currently host-only Next.js. |

**MUST stay on the host:**

| Process | Why (ruled law unless noted) |
|---|---|
| Agent CLIs (Grok / Claude / Codex / this seat) | Operator tools. Not product. Putting them in compose would make the coding loop a deployment unit. |
| Hermes dashboard on **9119** | Intake standing law: always, never overridden. It is the board, not the product topology. |
| CLI relays under **DR-179 HOLD** | Intake: no API keys for now; CLI-relay access remains the lawful model-call mechanism; **relays are not Hatchet workers**. They wrap host CLI sessions (`acceptance/relay-core.ts` and friends). Containerizing them would either smuggle a network token surface or break the relay. |
| Test runners (Vitest, orphan-audit, acceptance-bundle) | Dev/CI host processes. They may *start* Testcontainers (RQ-B5) but they are not ADR-0018 services. |
| Docker Engine / Docker Desktop | The runtime; it cannot containerize itself as a product service. |

**Replay:** not a long-running ADR-0018 service. **Requirement:** invoke it as a
one-shot compose job (`docker compose run` of `apps/replay`) with its own
read-only credential (ADR-0018 clause 2, module-design §5.5.0), not as a host
script that happens to point at compose Postgres. Confidence medium. Strongest
counter: a host-invoked `pnpm replay:ceremony` against compose Postgres already
satisfies "separately scheduled + read-only role" without another image.

**`vllm`:** already a compose service. Inclusion in *this mission's required
bar* is RQ-B4.

**`apps/evaluator-worker` / `apps/ui`:** not ADR-0018 units (RQ-E3, RQ-E4).
They MUST NOT be smuggled into the "containerized" claim.

---

### RQ-B3. Dev compose vs production compose

**Question.** Does this mission need both, or is local-dev the
requirements-complete bar with production as a later slice that must not
contradict ADR-0018? Rank. Do not silently drop Hetzner / Cloudflare.

**Answer (ranked judgement).**

1. **This mission's requirements-complete bar is local-dev compose** that runs
   the RQ-B2 set on this machine (once RQ-E1 is closed), with Hatchet
   Postgres-first and RabbitMQ off.
2. **Production Hetzner + Cloudflare is deferred as a later slice**, not
   dropped. The deferred slice remains bound by ADR-0018: one compose file as
   the deployment description, Cloudflare in front of the one origin (`apps/api`),
   no privileged bypass, SSE through the proxy, `hatchet-engine` as the named
   service, no RabbitMQ, one Postgres instance, vLLM as a provider adapter.
3. **Local-dev may use `hatchet-lite`; production may not claim ADR-0018
   compliance with lite-only** (RQ-C3).
4. **Insecure Hatchet flags** (`SERVER_AUTH_COOKIE_INSECURE`,
   `SERVER_GRPC_INSECURE`) and `debateai-dev-only` are local-only. Production
   must not inherit them. That is a requirement on the later slice, not a
   licence to edit the live security-cited compose in this mission (RQ-D2).

**Ruled law that stays in force while deferred:** DR-117 / ADR-0018 (Compose on
Hetzner behind Cloudflare; AC-60 through the proxy). A local-dev bar that
invents a second origin, a host-published API as a production path, or a
Cloudflare bypass is a defect even if production files are not written yet.

- **Confidence:** high (matches `07-build-order.md` S0 row 9: lite is scaffold,
  not the production topology).
- **Strongest counter-argument:** V's prompt was "use Docker and Hatchet to
  containerize the app" against a topology that is already ruled as Hetzner
  production; deferring production could ship a local-only shape that later
  cannot be promoted without a rewrite (especially lite vs `hatchet-engine`).

---

### RQ-B4. `vllm` — required, optional, or split?

**Question.** `vllm` is already a compose service. Include it in this mission's
required bar, make it optional, or split it? GPU / host-requirement
consequences.

**Answer (judgement).** **Split.** Keep `vllm` in the compose description
(ADR-0018 already lists it; live compose already has it). Do **not** make a
successful vLLM GPU boot a blocking acceptance criterion for the local-dev
"app is containerized" bar on this Mac.

**Why split.** The `vllm/vllm-openai` image is a GPU serving runtime. This
operator environment is macOS with Docker.app installed and no Docker CLI on
PATH; GPU passthrough for that image on Docker Desktop for Mac is commonly
unavailable. **`UNVERIFIED` on this machine:** whether this host has an NVIDIA
GPU visible to Docker. What would verify it: after RQ-E1, `docker info` and an
attempted `vllm` up with the pinned digest.

**Production (deferred slice) still requires the `vllm` service** as a provider
adapter behind Seam C (ADR-0018 clause 3). Selecting it remains a register-row
change (AC-37). Relays under DR-179 stay on the host and are not a substitute
vLLM path.

- **Confidence:** high for "do not block local-dev on GPU vLLM"; medium for
  "compose profiles / optional service" as the mechanism (mechanism is
  architecture).
- **Strongest counter-argument:** ADR-0018 lists `vllm` as a first-class
  service, so a "containerized" claim that never exercises it is already a
  false claim against the ruled topology.

---

### RQ-B5. Containerized app services vs Testcontainers

**Question.** How must containerized *app* services relate to Testcontainers so
tests do not silently switch stores or skip Hatchet?

**Answer (requirement, not a test plan).**

**Ruled law.** ADR-0012 / `06-test-strategy.md` §2: database tests are
**Testcontainers + real Postgres**, image tag from `postgresMajorVersion`
through the register loader, never a literal in a test file (AC-74). Hatchet is
deliberately **not** a test layer: claim-before-call is asserted against
`core.work_item` and the ledger. Where a test needs the engine, it is a compose
concern (`07-build-order.md` S0), not a new layer. A test that needs the engine
to prove claim-before-call has misplaced the law.

**Live-tree fact.** `tests/support/testDatabase.ts` implements
`startWithTestcontainers` **and** `startWithEmbedded`.
`selectPrototypeDatabaseMechanism()` returns `embedded-postgres` /
`DEFERRED BY DR-121`. `startTestDatabase()` **always** calls
`startWithEmbedded`. Integration tests currently record Testcontainers as
deferred (`tests/integration/database.test.ts`). Root `package.json` still
depends on `testcontainers` `12.1.0`.

**Requirements:**

1. **No silent store switch.** Tests must not connect to the compose product
   `postgres` volume (`postgres-data` / `POSTGRES_DB=debateai`) as a
   convenience. Product compose and the test database are different instances.
   Sharing them would let tests mutate operator data and would hide
   Testcontainers/embedded failures behind "compose was up".
2. **Same major pin.** When DR-121 is lifted and Testcontainers becomes ACTIVE,
   the image remains `postgres:${postgresMajorVersion}` from
   `loadBootstrapRegister()`, never a different major than compose.
3. **Hatchet is not skipped by accident.** Unit/property/contract tests continue
   **without** the engine (ruled). Tests of the *dispatch path* (runner worker
   registration, api `runNoWait`) must either (a) run against a dedicated
   Hatchet + test DB, or (b) be explicitly marked as compose-integration and
   fail loud when the engine is absent — never skip, never fall back to an
   in-process fake dispatcher in production code.
4. **App containers are not the test runner.** Vitest stays on the host
   (RQ-B2). App compose services must not be the only way to run the suite.

- **Confidence:** high.
- **Strongest counter-argument:** once app services only exist as containers,
  developers will point tests at compose Postgres because it is already up;
  forbidding that adds a second Postgres and fights "one store" rhetoric
  (answered: AC-02 is the *product* store; tests using it are not a second
  product store, they are contamination).

---

## C. Hatchet as dispatcher (do not reopen DR-118)

### RQ-C1. What Hatchet may own and must not own

**Question.** Restate, as requirements, what Hatchet may own and what it must
not own. Cite ADR-0017 clauses.

**Answer (ruled law, restated as requirements).**

**Hatchet MAY own (dispatcher only — ADR-0017 headline + clause 2):**

- Assignment: which worker should *attempt* this task now.
- Redelivery, assignment timeouts, worker lifecycle, child-task fan-out,
  scheduling of engine tasks, dashboard / migration surface for *its* schema.
- Its own tables in a dedicated database/schema on the **one** Postgres
  instance (clause 6). Live fact: `deploy/postgres/init-hatchet.sql` is
  `CREATE DATABASE hatchet;`; compose `DATABASE_URL` points at that database
  on the same `postgres` service.

**Hatchet MUST NOT own:**

| Forbidden ownership | ADR-0017 |
|---|---|
| Claim-before-call on `core.work_item` | clause 2, clause 3(a): assignment is not a claim |
| Seam C gateway artifacts | clause 2; clause 4 — model calls live in plain/child tasks, artifacts from our gateway |
| Our ledger sequence / `at_seq` | clause 2: engine ordering is not `at_seq` |
| Run state | clause 2: derived from our event streams, never queried from the engine |
| Expiry of our claim | clause 3(f): our reaper owns expiry; engine timeout is a re-dispatch |
| A second durable store | clause 1: `SERVER_MSGQUEUE_KIND=postgres`; RabbitMQ off |
| Engine history as the audit trail | clause 2: dashboard is not the ledger |
| Retry budget | clause 5: engine retries bound by register values, never engine defaults |
| Joins from V3 queries into engine tables | clause 6; ADR-0003 rule 4 |

**Requirement.** A worker task's first act remains: open a short transaction,
settled-identity check, `SELECT … FOR UPDATE SKIP LOCKED` on `core.work_item`,
COMMIT, then (and only then) the model call (clause 3(b)). Containerization
must not invert that order or treat Hatchet assignment as authorization for a
model call.

---

### RQ-C2. Minimum wiring that makes "we use Hatchet" true

**Question.** What is the minimum wiring that makes "we use Hatchet" true, vs a
sidecar nobody calls? Name the worker(s) that must register, the env contract,
and the observable that proves dispatch.

**Answer.** Grounded in **live vendor docs (2026-08-21)** plus live-tree
registration that already exists.

**Vendor facts (fetched):**

- Workers are long-running processes that register with Hatchet and then
  receive assignments (`https://docs.hatchet.run/home/workers`, last updated
  2026-08-17 on the fetched page).
- TypeScript registration (vendor 2026 shape):

  `const worker = await hatchet.worker('simple-worker', { workflows: [...], slots: 100 }); await worker.start();`

  (`https://docs.hatchet.run/home/workers`)
- Starting without the CLI requires `HATCHET_CLIENT_TOKEN`. For a self-hosted
  engine without TLS: `HATCHET_CLIENT_TLS_STRATEGY=none`
  (`https://docs.hatchet.run/home/workers` and
  `https://docs.hatchet.run/self-hosting/worker-configuration-options`).
- Worker env keys (vendor): `HATCHET_CLIENT_TOKEN` (required),
  `HATCHET_CLIENT_HOST_PORT` (gRPC, else inherited from token),
  `HATCHET_CLIENT_API_URL` (TypeScript SDK), `HATCHET_CLIENT_TLS_STRATEGY`
  default `tls` (`https://docs.hatchet.run/self-hosting/worker-configuration-options`,
  last updated 2026-08-17).
- Token creation for self-host compose: dashboard Settings → API Tokens, or
  `hatchet-admin token create` against the production compose setup-config
  (`https://docs.hatchet.run/self-hosting/docker-compose`).
- Observable on connect (vendor): logs containing `starting hatchet`,
  `waiting for [...]`, `acquired action listener`, `sending heartbeat`
  (`https://docs.hatchet.run/home/workers`).
- Trigger without waiting: TypeScript `runNoWait(workflow, input, options)`
  (`https://docs.hatchet.run/sdks/typescript`).

**Live-tree mapping (already implemented; this is the contract to preserve,
not a new SDK design):**

| Role | Process | What it must do |
|---|---|---|
| **The worker that must register** | `apps/runner` only (today) | `hatchet.worker(HATCHET_WORKER_NAME)` → `registerWorkflows([task])` → `start()`. SDK 1.28.1 also accepts `workflows` in the constructor and calls `registerWorkflows` internally (`apps/runner/node_modules/@hatchet-dev/typescript-sdk/v1/client/worker/worker.js`). Either form is the same registration. |
| **The dispatcher that must call** | `apps/api` | `HatchetDispatcher.dispatch` → `runNoWait(HATCHET_WORKFLOW_NAME, { runId, workItemId })`. |
| **No other app is a Hatchet worker** | scheduler / replay / evaluator-worker / ui / web | Must stay that way unless a later ruling says otherwise. Relays are not workers (DR-179). |

**Env contract the worker and api need** (live loader names → vendor names).
Constructor overrides in `new Hatchet({ token, host_port, api_url, tenant_id,
tls_config })` are accepted by the SDK config-loader, which otherwise reads
`HATCHET_CLIENT_*` (`config-loader.js`).

| Live loader key (`packages/register/src/runtime-environment.ts`) | Vendor key | Required for |
|---|---|---|
| `HATCHET_CLIENT_TOKEN` | `HATCHET_CLIENT_TOKEN` | api + runner |
| `HATCHET_HOST_PORT` | `HATCHET_CLIENT_HOST_PORT` | gRPC to engine (compose `7077` / engine `7070`) |
| `HATCHET_API_URL` | `HATCHET_CLIENT_API_URL` | dashboard/API URL |
| `HATCHET_TENANT_ID` | (token-derived; live still requires it) | api + runner |
| `HATCHET_TLS_STRATEGY` | `HATCHET_CLIENT_TLS_STRATEGY` | local insecure compose ⇒ `none` |
| `HATCHET_WORKFLOW_NAME` | (ours) | must match between api dispatch and runner task name |
| `HATCHET_WORKER_NAME` | worker `name` | runner only |
| `HATCHET_ENGINE_RETRIES` | task `retries` | runner; register-bound (ADR-0017 clause 5) |

Inside compose, `SERVER_GRPC_BROADCAST_ADDRESS` must be an address **workers
can dial**. Vendor production compose documents that workers *inside the same
compose* need `hatchet-engine:7070`, not `localhost:7077`
(`https://docs.hatchet.run/self-hosting/docker-compose` § "Connecting to the
engine from within Docker"). **Live compose today broadcasts `localhost:7077`**,
which is correct for a **host** worker and **wrong** for a containerized
`runner`. Changing that broadcast address requires re-issuing the API token
(same vendor section). That is a requirements constraint on containerizing
`runner`, not a compose patch from this seat.

**Minimum observable that proves dispatch (all three, not one):**

1. **Worker registered:** Hatchet dashboard Workers page shows
   `HATCHET_WORKER_NAME` as active, **or** runner logs match the vendor
   heartbeat lines.
2. **A run exists that api created:** after an ask that creates a work item,
   dashboard (lite UI `http://localhost:8888` per
   `https://docs.hatchet.run/self-hosting/hatchet-lite`) shows a workflow run
   for `HATCHET_WORKFLOW_NAME` whose input carries `workItemId` /
   `sourceOfRecord=core.work_item`.
3. **Claim still happened in our DB:** the same `workItemId` is claimed on
   `core.work_item` (ADR-0017 clause 3). Dashboard success alone is not
   enough.

Sidecar-nobody-calls failure mode: (1) is missing, or (2) is missing, even if
ports `8888`/`7077` are up.

- **Confidence:** high on the worker=runner / dispatcher=api split and the
  three observables; medium that lite dashboard Workers page is the operator
  path (vendor documents UI login `admin@example.com` / `Admin123!!`; **not
  exercised here** because Docker CLI is absent).
- **Strongest counter-argument:** treating constructor-override live env names
  (`HATCHET_HOST_PORT`) as the contract fights the vendor `HATCHET_CLIENT_*`
  names and will confuse anyone copying current Hatchet docs.

---

### RQ-C3. `hatchet-lite` vs `hatchet-engine` (ADR-0018 name)

**Question.** What is required locally vs production? May lite stay for dev?
What would make lite-only a false claim of ADR-0018 compliance?

**Answer. Blunt: `hatchet-lite` cannot satisfy ADR-0018's named
`hatchet-engine` service.** They are different vendor images, different compose
service names, and different control-plane shapes.

**Vendor facts (fetched 2026-08-21):**

| | **hatchet-lite** (`https://docs.hatchet.run/self-hosting/hatchet-lite`) | **Production compose** (`https://docs.hatchet.run/self-hosting/docker-compose`) |
|---|---|---|
| Purpose | "development and low-volume use-cases"; "get up and running quickly" | "production-ready deployment" |
| Image | `ghcr.io/hatchet-dev/hatchet/hatchet-lite:latest` (single image) | `hatchet-engine`, `hatchet-dashboard`, `hatchet-migrate`, `hatchet-admin` (setup-config), plus Postgres; RabbitMQ in the sample |
| Compose service name | `hatchet-lite` | **`hatchet-engine`** (plus `hatchet-dashboard`) |
| UI port in the sample | `8888:8888` | dashboard `8080:80` |
| gRPC in the sample | `7077:7077` | `7077:7070` on `hatchet-engine` |
| Messaging | Heading "With Postgres (Default)" **does not set** `SERVER_MSGQUEUE_KIND` in the sample YAML. A second sample "With Postgres + RabbitMQ" sets `SERVER_MSGQUEUE_KIND: rabbitmq`. | Sample ships a `rabbitmq` service. Docs say RabbitMQ is optional: set `SERVER_MSGQUEUE_KIND=postgres` and delete RabbitMQ references. |

**Vendor config default:** `SERVER_MSGQUEUE_KIND` is `rabbitmq` unless set
(`https://docs.hatchet.run/self-hosting/configuration-options`, Task Queue
Configuration). **Copying the lite "Postgres (Default)" YAML without the
override can therefore reintroduce RabbitMQ-kind messaging even when no
RabbitMQ container is declared.** What the lite *image* itself defaults to
when the var is unset is **`UNVERIFIED`** without running it. What would
verify it: start lite without the var and inspect engine config / connections.
**Live compose already sets `SERVER_MSGQUEUE_KIND: postgres`** — keep that as
a requirement regardless of image.

**Ruled law:**

- ADR-0018 service list names **`hatchet-engine`**, "plus its
  dashboard/migration surface". **No RabbitMQ service.**
- `07-build-order.md` S0 row 9 **explicitly scaffolds `hatchet-lite`** "for
  local development and CI": single-image, Postgres-only, dispatch path
  present, **not** the full production control plane. Row 9 is "a scaffold
  row, not a slice deliverable".

**Requirements:**

- **Local-dev / this mission's complete bar:** `hatchet-lite` **may stay** as
  the dispatcher image, with `SERVER_MSGQUEUE_KIND=postgres`, no `rabbitmq`
  service, co-tenant DB `hatchet` on the one Postgres. That matches S0 row 9
  and the live compose service name.
- **ADR-0018 compliance (production, and any claim that uses those words):**
  a compose service **named `hatchet-engine`**, running the engine image (digest
  pinned), plus dashboard/migration surface, Postgres-first, no RabbitMQ.
  **Lite-only is a false ADR-0018 claim.** Renaming the lite container
  `hatchet-engine` while still using the `hatchet-lite` image is also a false
  claim.
- **This mission must not pretend the local lite row closes DR-117 topology.**

- **Confidence:** high.
- **Strongest counter-argument:** ADR-0018 cares that a self-hosted
  Postgres-first dispatcher exists, not that the vendor binary is split into
  engine+dashboard images; a digest-pinned lite in production might be
  operationally enough and the name check overly literal.

---

### RQ-C4. RabbitMQ must stay off

**Question.** Write the requirement so a copied vendor compose cannot reintroduce
it without failing a check.

**Answer (requirement).**

**Ruled law (ADR-0017 clause 1):** `SERVER_MSGQUEUE_KIND=postgres`. RabbitMQ is
OFF until measured need. Enabling it is a recorded law-6 exception. **"A
deployment that has RabbitMQ running without a recorded exception is a defect,
not a configuration preference."** The failure mode is convenience: vendor
production compose commonly ships RabbitMQ.

**Vendor fact:** production compose sample includes a `rabbitmq` service and
`SERVER_MSGQUEUE_RABBITMQ_URL`. Docs tell you to set
`SERVER_MSGQUEUE_KIND=postgres` and delete RabbitMQ references
(`https://docs.hatchet.run/self-hosting/docker-compose`). Config default kind
is `rabbitmq` (`https://docs.hatchet.run/self-hosting/configuration-options`).
Lite "Postgres + RabbitMQ" sample sets `SERVER_MSGQUEUE_KIND: rabbitmq`.

**Live-tree fact:** `compose.dev.yaml` sets `SERVER_MSGQUEUE_KIND: postgres`
and has no `rabbitmq` service. `deploy/IMAGE-PINS.md`: "RabbitMQ is
intentionally absent."

**Requirements a later check must fail on (state, not files):**

1. A compose service whose image or name is RabbitMQ (`rabbitmq`,
   `bitnami/rabbitmq`, etc.) exists in the active product compose, unless a
   recorded law-6 exception is present in the architecture record.
2. `SERVER_MSGQUEUE_KIND` is unset, empty, or not `postgres` on the Hatchet
   engine/lite service.
3. `SERVER_MSGQUEUE_RABBITMQ_URL` is set on that service.

Any one of those three is a failed bar. Copy-paste of vendor compose must hit
(1) and (2) immediately.

- **Confidence:** high.
- **Strongest counter-argument:** a static compose-file grep cannot see a
  runtime default inside the image when the var is unset (the lite-sample
  trap); the check must treat *unset* as fail, not only `rabbitmq`.

---

### RQ-C5. Scheduler jobs must not share a credential

**Question.** `job:replay-self-test`, `job:reaper`, `job:settlement-watch` must
not share a credential (`03-module-design.md` §5.5.0). What does that require
of compose / secret injection, without designing the files?

**Answer.**

**Ruled law (§5.5.0):** the three jobs share a process home and **do not share
a credential**. Scopes:

| Job | Credential scope |
|---|---|
| `job:replay-self-test` | read-only everywhere except append on `serve`'s eviction streams |
| `job:reaper` | read-only everywhere except write on `core.work_item` |
| `job:settlement-watch` | read-only everywhere except three appends in `scorecard`/`ledger` (INSERT-only on `scorecard_cell`); no write on `serve` or `core` |

No two jobs share a write target. ADR-0018 clause 2: the compose file is where
that separation is real rather than intended.

**Live-tree fact:** three *different env vars* already exist and are loaded by
*different functions*: `REPLAY_SELF_TEST_DATABASE_URL`, `LIVENESS_DATABASE_URL`,
`SETTLEMENT_DATABASE_URL` (`packages/register/src/runtime-environment.ts`).
The CLI picks exactly one per invocation (`apps/scheduler/src/cli.ts`). Live
script name for the reaper path is `job:liveness-sweep` (RQ-A2).

**Requirements on compose / secret injection (no file design):**

1. Inject **three distinct connection secrets** (three Postgres roles), one per
   job, matching the three loader keys. Do not inject a single `DATABASE_URL`
   that all three jobs reuse.
2. Do not reuse `apps/api` / `apps/runner` `DATABASE_URL` for any scheduler job
   (those roles can claim and serve; the jobs must not).
3. A container that holds all three secrets is allowed only if each
   *invocation* still uses exactly one (current CLI shape). A single long-running
   scheduler daemon that opens all three pools at once is not forbidden by
   today's code, but it must still present three roles, not one.
4. Replay *ceremony* (`apps/replay`) is a fourth principal: read-only, full
   stop, not one of the three.

- **Confidence:** high.
- **Strongest counter-argument:** three roles on one instance is operational
  toil; a later implementer will collapse them into one `scheduler` user with
  the union of GRANTs and call it "separated in comments".

---

## D. Isolation from the live security mission

### RQ-D1. One-writer-per-file rule and path classes

**Question.** Given `accounts-phase1` is running against this same repo, what
file-contract rule keeps this mission legal? List path classes this mission may
create, may extend, and must not touch.

**Answer.**

**Rule (intake isolation + global one-writer-per-file):** a path with a live
foreign writer is forbidden to this mission. If a needed path is inside another
live mission's file contract, post `BLOCKED` and escalate — do not widen.
Foreign boards (`accounts-phase1`, `accounts-phase4`, `debateai-v3`,
`dialectical-engine`, `model-evaluator`) must not be claimed or mutated.

| Class | Paths | This mission |
|---|---|---|
| **Must not touch** | Identity / registration / MFA / sessions / crypto-shredding / auth routes; `packages/crypto/**`; `apps/api/src/registration.ts` and `mail-channel.ts` as *edits*; migrations `0030_identity_foundation.sql` and later identity/auth migrations; `migrations/pending/**` if they belong to that mission; `docs/missions/2026-08-17-accounts-privacy-security/**`; `docs/missions/2026-08-17-mfa-recovery-requirements/**` | **Forbidden.** Freeze. |
| **May create (later loops, not this REQUIREMENTS seat)** | New Dockerfiles; sibling compose files under this mission or `deploy/**` for already-ruled services; Hatchet worker-registration *new* files if they are not the frozen identity tree; deploy docs under `docs/missions/2026-08-21-docker-hatchet/**` | Allowed after REQUIREMENTS, still subject to one-writer-per-file. |
| **May extend, only for containerization of already-ruled services, and only when no live foreign writer holds the file** | `compose.dev.yaml`, `deploy/**` (IMAGE-PINS, postgres init) | **Collision on `compose.dev.yaml` — see RQ-D2.** `deploy/IMAGE-PINS.md` and `deploy/postgres/init-hatchet.sql` are currently this topology's pins; extend only for Hatchet/Postgres/vLLM/app image pins, never for identity. |
| **Readonly during REQUIREMENTS (this seat)** | `apps/**`, `packages/**`, `web/**`, ADRs, founding, protocols, `register.bootstrap.json` | Read start paths and env keys only. |

This REQUIREMENTS seat writes **only**:

- `docs/missions/2026-08-21-docker-hatchet/research/grok-requirements.md`
- `docs/missions/2026-08-21-docker-hatchet/agent-reports/grok-selfreport.md`

---

### RQ-D2. `compose.dev.yaml` collision surface

**Question.** Security research already cites it (insecure flags, published
ports, `debateai-dev-only`). Can this mission extend that file, or must it add
a sibling compose that includes it?

**Answer (requirement).**

**Live-tree fact — collision material already in `compose.dev.yaml`:**

- `POSTGRES_PASSWORD: debateai-dev-only`
- `SERVER_AUTH_COOKIE_INSECURE: "true"`
- `SERVER_GRPC_INSECURE: "true"`
- Published `8888`, `7077`, `8000`
- Hatchet cookie domain `localhost`

Intake: accounts/privacy/security is live and unfinished; this file is a
likely live writer surface. One-writer-per-file is global.

**Requirement while `accounts-phase1` (or any security ticket) is live:** this
mission **must not edit `compose.dev.yaml`**. Add a **sibling compose file**
that `include`s or composes-with the existing file and declares only the new
app services (`web`, `api`, `runner`, `scheduler`, and any replay job). If a
needed change cannot be expressed as additive sibling keys (for example
changing `SERVER_GRPC_BROADCAST_ADDRESS` from `localhost:7077` to the engine
hostname for in-compose workers — RQ-C2), **BLOCKED** and escalate; do not
widen into the security-cited keys.

**After** the security mission releases the file, a later slice may fold the
sibling in. Production must still not inherit the insecure flags (RQ-B3).

- **Confidence:** high as a freeze requirement; medium that Compose `include`
  is available at the Docker version this machine will run (`UNVERIFIED`
  until Docker CLI exists). Fallback: a second file passed as
  `docker compose -f compose.dev.yaml -f compose.<sibling>.yaml`.
- **Strongest counter-argument:** two compose files drift (pins, env, network);
  a later merge will fight IMAGE-PINS and the security citations at once.
  Waiting until security releases the file is cleaner if V will accept delay.

---

### RQ-D3. Containerizing `apps/api` without editing identity/auth code

**Question.** What requirements on the image (cwd, command, env, port) keep the
freeze intact?

**Answer (requirement).**

`apps/api/src/main.ts` already loads identity: `FileUserDekStore`, `loadKek`,
`loadSecretKey`, `RegistrationService`, `InProcessAuthRateLimiter`,
`PostgresIdentityRepository`. Containerizing the process will **run** that
code. The freeze is: **do not edit it**.

| Image concern | Requirement |
|---|---|
| **cwd** | Workspace root (or an equivalent layout that still resolves the pnpm workspace and `@debateai/*` packages). Do not invent a new API package path. |
| **command** | The existing start path: `tsx src/main.ts` / `pnpm --filter @debateai/api start`. No new entrypoint that bypasses `loadApiEnvironment` or `RegistrationService`. |
| **env** | Inject the keys `loadApiEnvironment()` already requires (`packages/register/src/runtime-environment.ts`), including `KEK_PATH`, `BLIND_INDEX_KEY_PATH`, `AUDIT_*`, `USER_DEK_STORE_PATH`, `MAIL_*`, `PUBLIC_APP_URL` (already constrained to `https://`), `DATABASE_URL`, `API_HOST`, `API_PORT`, Hatchet shape. No new identity env keys. No reading those secrets except through the register loader (AC-74). |
| **secrets/files** | Mount the **existing** KEK / DEK / blind-index / audit files as volumes. Do not bake key material into an image. Do not create a new crypto store layout. |
| **port** | `API_PORT` from the loader. One published front door. No second hostname (AC-60 / ADR-0018 clause 1). |
| **source** | Copy/build current `apps/api` + workspace packages **as they are**. Do not retarget `registration.ts`, `packages/crypto`, or identity migrations `0030+` "to make the image work". If the image cannot boot without those edits, that is a freeze collision → BLOCKED, not a patch. |

- **Confidence:** high.
- **Strongest counter-argument:** `PUBLIC_APP_URL` must be `https://` and
  `MAIL_SENDMAIL_PATH` must exist, so a local container will fail to boot
  without host-like mounts; an implementer will be tempted to loosen the
  loader (forbidden — that is register/identity code).

---

## E. Open questions only V can close

### RQ-E1. Enable Docker CLI / start Docker Desktop on this Mac now?

**Question.** Enable Docker CLI / start Docker Desktop on this Mac now?

**Why REQUIREMENTS cannot close it.** Intake classifies this as an IMPORTANT
OPERATION (operator software). This seat must not do it silently. No coding
seat can honestly claim a container came up until it is done (RQ-A5).

**Options.**

1. V enables Docker Desktop + CLI on PATH now, before PROGRAMMING.
2. Defer enablement to the first programming ticket, still as an IMPORTANT
   OPERATION packet, not silent.
3. Do the work on a different machine that already has Docker CLI.

**Recommendation.** Option 2 if PROGRAMMING is not starting immediately;
option 1 if V wants a same-day coding seat. Do **not** option-3 unless V names
the machine — evidence in this repo is about *this* Mac.

- **Confidence:** high that this seat must not flip it; medium on timing.
- **Strongest counter-argument:** leaving Docker off means the whole
  containerization mission cannot be empirically closed on this host, so
  enabling now is cheaper than a blocked coding loop.

---

### RQ-E2. Production Hetzner compose in this mission, or local-dev first?

**Question.** Production Hetzner compose in this mission, or local-dev first?

**Why REQUIREMENTS cannot close it.** Scope vs V's "containerize the app"
prompt vs ruled ADR-0018 production topology. A product/planning choice.

**Options.**

1. Local-dev complete bar this mission; production as a later slice still
   bound by ADR-0018 (RQ-B3).
2. This mission delivers both local-dev and a production compose.
3. Production-only (skip local-dev).

**Recommendation.** Option 1. Production-only is untestable here until RQ-E1
and a Hetzner host exist. Both-in-one fights the compose freeze (RQ-D2) and
the lite vs engine split (RQ-C3).

- **Confidence:** high.
- **Strongest counter-argument:** local-dev lite will ossify and the production
  `hatchet-engine` row will never be cut.

---

### RQ-E3. Is `apps/evaluator-worker` an ADR-0018 unit?

**Question.** Is `apps/evaluator-worker` an ADR-0018 unit that must be
containerized, or is it out of the ruled service list on purpose?

**Why REQUIREMENTS cannot close it.** ADR-0018's table does not list it.
Module-design §1.3 service map does not list it. Live tree: library, no
process (RQ-A2). Whether the evaluator harvest/probe families must run as a
Compose worker is a product/architecture add, not a gap-close.

**Options.**

1. Out of this mission's required bar (ruled list wins).
2. V adds it as an eighth compose service.
3. Run its families *on* `apps/runner` as extra Hatchet workflows (would
   expand what the runner owns — architecture, and possibly Hatchet-worker
   scope).

**Recommendation.** Option 1 for this mission. Do not containerize a
non-process. If evaluator work must be scheduled, that is a later mission
after the ADR-0018 seven are actually in compose.

- **Confidence:** high.
- **Strongest counter-argument:** `EVALUATOR_TASK_FAMILIES` looks like Hatchet
  task names waiting for a worker; leaving it out while "using Hatchet"
  creates a second, host-only worker lane by accident.

---

### RQ-E4. Other product / architecture / safety decisions found

**Question.** Anything else that is a V decision rather than a requirements
recommendation?

**E4-a. `apps/ui` vs `web`.** Two Next.js apps, both `next start -p 3000`.
ADR-0018 `web` maps to package `web` (module-design §1.2, DR-095 kept
surface). `apps/ui` is `dialectical-engine-v2ui`. **Recommendation:**
containerize `web` only. V must say if `apps/ui` is retired, a second UI, or
still the demo surface.

- **Confidence:** high that REQUIREMENTS cannot pick the UI.
- **Strongest counter-argument:** `apps/ui` is where the live debate canvas
  actually is; containerizing `web` could ship an empty/kept shell.

**E4-b. `job:reaper` vs `job:liveness-sweep`.** Ruled name vs live script.
**Recommendation:** containerize the live CLI (`liveness-sweep`) with the
reaper *credential scope*; V (or architecture) must say whether to rename.
Not a silent alias.

**E4-c. May local compose keep broadcasting gRPC on `localhost:7077` while
`runner` stays on the host, and only switch broadcast when `runner` moves
into compose?** That broadcast/token re-issue is a safety change on a
security-cited file (RQ-C2, RQ-D2). **Recommendation:** treat the switch as
blocked on `compose.dev.yaml` until sibling-compose or security release;
V chooses delay vs exception.

**E4-d. Postgres digest pin (RQ-A4 gap).** Whether major `18` is enough or V
wants an exact digest like vLLM. **Recommendation:** major remains the
bootstrap semantic pin; digest is optional provenance, not a new register
row. V can overrule.

**E4-e. Hatchet token provisioning for local-dev.** Vendor default UI user
`admin@example.com` / `Admin123!!` (lite and production docs). Whether this
repo may document those vendor defaults for local-dev, or must mint a
non-default token without writing secrets into git, is a safety choice.
**Recommendation:** never commit `HATCHET_CLIENT_TOKEN`; generate at
operator-up. Do not contact V from this seat — recorded here only.

---

## Ranked recommendations (this seat)

1. **Local-dev bar this mission:** put `api`, `runner`, `scheduler` (three
   job commands), and `web` into compose *additively*, keep `postgres` +
   `hatchet-lite` + optional `vllm`, prove RQ-C2's three observables.
   Confidence high. Counter: see RQ-E2 ossification risk.
2. **Do not edit `compose.dev.yaml` while security is live** — sibling file
   (RQ-D2). Confidence high. Counter: drift.
3. **Lite may stay for local; lite-only is not ADR-0018.** Production (later)
   needs a named `hatchet-engine` service. Confidence high. Counter: name
   literalism (RQ-C3).
4. **RabbitMQ: unset kind fails; no rabbit service; no rabbit URL** (RQ-C4).
   Confidence high. Counter: none strong; vendor default is the trap.
5. **Three scheduler secrets, never one** (RQ-C5). Confidence high. Counter:
   operational toil.
6. **Do not start Docker in this seat; V closes RQ-E1.** Confidence high.
   Counter: blocked empirical loop.
7. **vLLM split: present, not blocking on this Mac** (RQ-B4). Confidence
   high. Counter: ADR-0018 lists it.
8. **evaluator-worker and apps/ui out of bar** pending V (RQ-E3, RQ-E4).
   Confidence high. Counter: they look like product processes.

---

WORKER CLAIM:
- ticket: REQ-DOCKER-GROK
- owner CLI session: 01a02368-b8ac-72c2-99c3-0a33b4d0bc79
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / H0-REQUIREMENTS
- owner CLI session: 01a02368-b8ac-72c2-99c3-0a33b4d0bc79
- artifact path: docs/missions/2026-08-21-docker-hatchet/research/grok-requirements.md
- upstream artifacts used: docs/missions/2026-08-21-docker-hatchet/brief.md; docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md; docs/missions/2026-08-21-docker-hatchet/goal-packets/grok.md; docs/architecture/01-decisions/ADR-0017-durable-execution-hatchet.md; docs/architecture/01-decisions/ADR-0018-deployment-topology.md; docs/architecture/03-module-design.md §1.2–1.3 §5.5.0; docs/architecture/05-register-skeleton.md §5.4c; docs/architecture/06-test-strategy.md §2; docs/architecture/07-build-order.md S0 row 9; compose.dev.yaml; deploy/IMAGE-PINS.md; deploy/postgres/init-hatchet.sql; package.json; pnpm-workspace.yaml; apps/{api,runner,scheduler,replay,evaluator-worker,ui}/package.json; web/package.json; packages/register/src/runtime-environment.ts; packages/register/src/compose-env.ts; apps/api/src/{main,index}.ts; apps/runner/src/{main,index}.ts; apps/scheduler/src/cli.ts; tests/support/testDatabase.ts; register.bootstrap.json; vendor https://docs.hatchet.run/self-hosting/docker-compose ; https://docs.hatchet.run/self-hosting/hatchet-lite ; https://docs.hatchet.run/self-hosting/configuration-options ; https://docs.hatchet.run/home/workers ; https://docs.hatchet.run/self-hosting/worker-configuration-options ; https://docs.hatchet.run/sdks/typescript
- checks/evidence: live-tree re-verify of ADR-0018 vs compose.dev.yaml; Hatchet SDK/env/worker search; IMAGE-PINS + compose:env; Docker.app exists and docker not on PATH; no Dockerfile in tree; live fetch of Hatchet docs on 2026-08-21. Did not start Docker Desktop. Did not read sibling seats.
- assumptions/risks: Docker CLI enablement is RQ-E1 (IMPORTANT OPERATION). compose.dev.yaml is a freeze collision (RQ-D2). Vendor lite "Postgres default" sample omits SERVER_MSGQUEUE_KIND while config default is rabbitmq — copy-paste trap. Lite cannot satisfy ADR-0018 named hatchet-engine. Token usage UNVERIFIED (see self-report).
- comments read through: intake
