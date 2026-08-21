# Codex REQUIREMENTS research — Docker + Hatchet containerization

Seat: `codex@gpt-5.6-sol`, independent/blind REQUIREMENTS seat. Date:
2026-08-21. This artifact distinguishes **ruled law**, **live-tree fact**,
**vendor fact**, and **engineering judgment**. Normative statements prefixed
`REQ-` are proposed requirements, not claims that the live tree already meets
them. `UNVERIFIED` identifies evidence that this seat could not obtain.

## A. Current-state gap

> **Freeze:** do not write, retarget, or tweak identity, registration, MFA,
> sessions, crypto shredding, `packages/crypto`, identity migrations `0030+`,
> or either 2026-08-17 security mission tree. Do not operate the
> `accounts-phase1` or `accounts-phase4` boards.

### RQ-A1 — ruled services versus live Compose

**Ruled law.** ADR-0018 declares seven Compose services:
`web`, `api`, `runner`, `scheduler`, `hatchet-engine`, `postgres`, and `vllm`.
It expressly excludes RabbitMQ and describes Hatchet's schema/database as a
co-tenant on the one Postgres instance
(`docs/architecture/01-decisions/ADR-0018-deployment-topology.md:54-75`).

**Live-tree fact.** `compose.dev.yaml` currently declares three service keys:
`postgres`, `hatchet-lite`, and `vllm`; its Hatchet service depends only on
Postgres and sets `SERVER_MSGQUEUE_KIND=postgres`
(`compose.dev.yaml:3-40`).

| Deployment unit | ADR-0018 | `compose.dev.yaml` | Gap |
|---|---:|---:|---|
| `web` | yes | no | missing |
| `api` | yes | no | missing |
| `runner` | yes | no | missing |
| `scheduler` | yes | no | missing |
| `hatchet-engine` | yes | no | missing; `hatchet-lite` exists but is not evidence of the production engine/migration surface |
| `postgres` | yes | yes | present |
| `vllm` | yes | yes | present |
| `hatchet-lite` | no | yes | local-only candidate, not an additional ruled production unit |

`REQ-A1-1`: the containerization acceptance inventory SHALL account for all
seven ADR-0018 units. A differently named local substitute SHALL be called out
as such, not counted as silent proof of the ruled production unit.

**Recommendation — confidence: high.** Treat the five absent exact service keys
as the current Compose gap and treat `hatchet-lite` as a possible local profile,
not as automatic `hatchet-engine` equivalence. **Strongest counter-argument:**
service-key names are not behavior; a single lite image could theoretically
expose every required control-plane behavior. That equivalence is
`UNVERIFIED` and would need vendor/version-specific operational proof.

### RQ-A2 — executable start-path inventory

**Live-tree facts.** Root testing is `vitest run`; the S00 harness is
`vitest run tests/unit tests/integration tests/architecture`
(`package.json:14-15`). The process-specific inventory is:

| Path | Runnable path today | Evidence | ADR-0018 deployment unit? |
|---|---|---|---:|
| `apps/api` | package script `start` -> `tsx src/main.ts`; the entry calls `api.listen({host: API_HOST, port: API_PORT})` | `apps/api/package.json:1`; `apps/api/src/main.ts:30-43,120` | yes, `api` |
| `apps/runner` | package script `start` -> `tsx src/main.ts`; entry creates a Hatchet worker, registers the walking-skeleton task, then blocks in `worker.start()` | `apps/runner/package.json:1`; `apps/runner/src/main.ts:42-47` | yes, `runner` |
| `apps/scheduler` | no package-local script; root scripts invoke `tsx apps/scheduler/src/cli.ts` as `job:replay-self-test`, `job:liveness-sweep`, and `job:settlement-watch` | `apps/scheduler/package.json:1`; `package.json:24-26`; `apps/scheduler/src/cli.ts:5-23` | yes, `scheduler` |
| `apps/scheduler` reaper | architecture names `job:reaper`, but the CLI does not accept `reaper`; exported `runReaper` throws `S00_SCAFFOLD_ONLY` | `docs/architecture/03-module-design.md:148-155`; `apps/scheduler/src/cli.ts:5-13`; `apps/scheduler/src/index.ts:74-89` | required behavior is not runnable under its ruled name |
| `apps/replay` | package script `ceremony` -> `tsx src/cli.ts`; root alias `replay:ceremony`; CLI requires a Postgres URL and attestation path and forces the session read-only | `apps/replay/package.json:1`; `package.json:28`; `apps/replay/src/cli.ts:5-18` | not a long-running service; ADR-0018 requires a separately scheduled ceremony job with its own read-only credential (`ADR-0018:106-118`) |
| `apps/evaluator-worker` | no `scripts`, `main.ts`, or CLI; the package exports library functions and six task-family constants | `apps/evaluator-worker/package.json:1-13`; `apps/evaluator-worker/src/index.ts:28-35` | no; open decision RQ-E3 |
| `apps/ui` | Next scripts: `dev`, `build`, `start` on port 3000, plus its own tests | `apps/ui/package.json:6-12` | no; ADR-0018 names `web`, not `apps/ui` |
| `web` | Next scripts: `dev`, `build`, `start` on port 3000 | `web/package.json:6-10`; `docs/architecture/03-module-design.md:158,168-173` | yes, `web` |

`REQ-A2-1`: every long-running ADR unit SHALL start through its existing package
entry path or a semantically identical invocation; containerization SHALL NOT
create a second application implementation. `REQ-A2-2`: the scheduler cannot
be accepted until all three ruled jobs have runnable, published entry points;
the present liveness-sweep/reaper mismatch SHALL fail that check.

**Recommendation — confidence: high.** Reuse the existing `start`/Next entry
paths and expose scheduler jobs as separately invocable units; do not invent a
new bootstrap layer in application source. **Strongest counter-argument:**
production images often benefit from compiled-output commands rather than
`tsx`; architecture may legitimately choose a build-stage output as long as it
proves semantic identity to these entries.

### RQ-A3 — Hatchet SDK, environment, and registration proof

**Live-tree verdict: Hatchet is already an application dependency, not only a
sidecar.** The intake lead is stale.

- `apps/api` and `apps/runner` both pin
  `@hatchet-dev/typescript-sdk` `1.28.1`; the lockfile resolves that exact SDK
  (`apps/api/package.json:1`; `apps/runner/package.json:1`;
  `pnpm-lock.yaml:156-158,225-227,1465-1466`).
- The API constructs a `Hatchet` client, injects six `HATCHET_*` values, and
  dispatches with `runNoWait`; the metadata carries V3 run/work-item IDs and
  names `core.work_item` as source of record
  (`apps/api/src/main.ts:38-43`; `apps/api/src/index.ts:359-381`).
- The runner declares a Hatchet task, creates the named worker, registers the
  workflow, and starts the worker
  (`apps/runner/src/index.ts:2494-2525`; `apps/runner/src/main.ts:42-47`).
- The shared loader requires
  `HATCHET_CLIENT_TOKEN`, `HATCHET_HOST_PORT`, `HATCHET_API_URL`,
  `HATCHET_TENANT_ID`, `HATCHET_WORKFLOW_NAME`, and
  `HATCHET_TLS_STRATEGY`; runner additionally requires
  `HATCHET_ENGINE_RETRIES` and `HATCHET_WORKER_NAME`
  (`packages/register/src/runtime-environment.ts:44-48,78-94`).
- `SERVER_GRPC_*` and `SERVER_MSGQUEUE_KIND` occur in current Compose, while
  no Compose service currently injects the application's `HATCHET_*` contract
  (`compose.dev.yaml:21-31`).

**Absence-search receipt.** On 2026-08-21 this seat ran a case-sensitive search
over `apps`, `packages`, `web`, root package/workspace/lockfile, current Compose,
and `deploy` for SDK names, `Hatchet`, `HATCHET_*`, `SERVER_GRPC_*`, message-queue
kind, and worker/workflow registration. The only application registration hit
was `apps/runner/src/main.ts:45-47`; scheduler had no Hatchet hit. This bounded
absence claim does not cover forbidden mission trees or generated dependencies.

`REQ-A3-1`: Compose SHALL connect the existing API dispatcher and runner worker
to the same Hatchet tenant, workflow identity, and internal engine address.
`REQ-A3-2`: acceptance SHALL prove registration and a real dispatch, not merely
that the SDK imports or sidecar starts.

**Recommendation — confidence: high.** Containerize the already-wired API and
runner path before proposing new Hatchet integration. **Strongest
counter-argument:** the existing walking-skeleton task may not represent every
future workflow; accepting only it could overstate coverage. The acceptance bar
therefore proves current integration, not completeness of future work.

### RQ-A4 — image and toolchain pins

**Live-tree facts.**

- Hatchet lite is `:latest@sha256:7198...41a` and vLLM is
  `:latest@sha256:ffb2...f52`; despite the human-readable `latest` tag, the
  digest makes the selected content exact
  (`compose.dev.yaml:14-15,33-34`; `deploy/IMAGE-PINS.md:3-6`).
- Postgres is `postgres:${POSTGRES_MAJOR_VERSION}`. `pnpm compose:env` reads
  `register.bootstrap.json` and writes only
  `POSTGRES_MAJOR_VERSION=<postgresMajorVersion>` to `.env.compose`; the current
  bootstrap value is major `18`
  (`compose.dev.yaml:4-5`; `packages/register/src/compose-env.ts:1-8`;
  `register.bootstrap.json:4-8`). It is major-pinned, not patch- or
  digest-pinned.
- The vLLM digest is a verdict-bearing bootstrap row; the Hatchet digest is an
  exact audited Compose build input. Architecture requires exact digests for
  both and acceptance-bundle provenance
  (`docs/architecture/05-register-skeleton.md:721-783`).
- No Dockerfile was found under the contract-approved `apps`, `packages`,
  `web`, `deploy`, or root Dockerfile names on 2026-08-21; therefore no
  application image identity exists yet. Search receipt:
  `find apps packages web deploy` for `Dockerfile*` plus root-name checks ->
  `NO_DOCKERFILES_IN_ALLOWED_PRODUCT_SCOPES`.

`REQ-A4-1`: every third-party runtime image SHALL resolve to an exact digest in
the acceptance provenance; `vllmImageDigest` SHALL equal the Compose-selected
digest and the ratified register value. `REQ-A4-2`: every newly built app image
SHALL be named by immutable image ID/digest in the acceptance receipt. A major
tag alone SHALL NOT be described as an exact image pin.

**Recommendation — confidence: high.** Preserve the current digest discipline,
add immutable application-image receipts, and explicitly report Postgres as
major-only until a stronger identity is chosen. **Strongest counter-argument:**
pinning Postgres by digest can obstruct routine security rebuilds; if the
project retains major-only policy, it must say so and capture the actual pulled
digest per accepted run rather than pretend the tag is immutable.

### RQ-A5 — operator environment preconditions

**Live-machine receipt, 2026-08-21.** `/Applications/Docker.app` is present; its
bundled `Contents/Resources/bin/docker` is executable; `command -v docker`
returned no path; and no Docker Desktop/backend process was observed by
`pgrep`. Docker was not started and no CLI installation/linking was performed.

`UNVERIFIED`: Docker daemon reachability, Compose plugin version, current
context, platform/architecture, available disk/RAM/GPU, and ability to pull the
pinned images. These require an authorized operator preflight after V closes
RQ-E1.

`REQ-A5-1`: before any coding seat claims a container started, a recorded
preflight SHALL show: `docker` resolvable on `PATH`; `docker version` reports
both client and server; `docker compose version` succeeds; the intended context
is named; `docker info` reports a running daemon and host architecture; and a
non-mutating pull/build feasibility check covers every required platform.
`REQ-A5-2`: a filesystem-installed GUI without those receipts is not a running
container environment.

**Recommendation — confidence: high.** Gate all container build/up work on the
preflight and V authorization; continue requirements work without starting
Docker. **Strongest counter-argument:** the bundled CLI can be invoked by
absolute path without changing `PATH`; that is acceptable only if the operator
command and all automation use that same explicit path reproducibly.

## B. What “containerized” must mean

> **Freeze:** the acceptance bar may observe the API but must not modify identity,
> auth, registration, MFA, sessions, crypto, or identity migrations.

### RQ-B1 — falsifiable operator-visible acceptance bar

The following is the minimum falsifiable bar. A later plan may add stricter
checks but SHALL NOT replace these with screenshots or “process started” logs.

1. `REQ-B1-01 — one-command start`: from a documented clean-checkout preflight,
   one documented command resolves environment/pins, builds app images, and
   brings up the selected profile. No second terminal may be needed to start an
   app process on the host.
2. `REQ-B1-02 — declared inventory`: the resolved Compose model lists every
   required profile service before startup. For the full ADR profile that is
   `web`, `api`, `runner`, `scheduler`, `hatchet-engine`, `postgres`, and
   `vllm` (`ADR-0018:54-75`).
3. `REQ-B1-03 — image provenance`: every running container ID maps to the exact
   image identity recorded under RQ-A4; mutable tag text alone fails.
4. `REQ-B1-04 — named readiness`: Postgres accepts a query to both the product
   and Hatchet co-tenant databases; Hatchet's control surface answers and
   reports Postgres messaging; the API answers HTTP and proves its required
   Postgres/Hatchet dependencies; the runner appears as the expected registered
   worker/workflow; the web route renders and reaches the one API front door;
   vLLM's configured model endpoint is ready when its profile is required.
   Scheduler jobs are one-shot readiness/exit checks under their own
   credentials, not one ambiguous scheduler PID.
5. `REQ-B1-05 — real dispatch`: one API-created work item produces a Hatchet run
   whose metadata has the same V3 run/work-item IDs, is received by the named
   runner, and leaves the corresponding `core.work_item`/ledger result. This is
   grounded in the current metadata path
   (`apps/api/src/index.ts:371-381`) and dispatcher-only law
   (`ADR-0017:123-161`).
6. `REQ-B1-06 — logs`: `docker compose logs <service>` yields attributable
   startup/readiness/dispatch/failure records for every required unit without
   exposing token or credential values.
7. `REQ-B1-07 — isolated restart`: restarting only `runner` preserves the API,
   web, Postgres, Hatchet, and the host-run Hermes board on port 9119; after
   restart the runner re-registers and a new dispatch completes. Port 9119 is
   reserved by the spine (`docs/agent-protocols/debateai-heartbeat-protocol.md:315-321`).
8. `REQ-B1-08 — one-command stop`: one documented non-destructive stop command
   stops mission containers. It SHALL NOT delete product/database volumes; DR-188
   forbids deletion (`00-intake-H0.md`, “Standing law”).
9. `REQ-B1-09 — anti-masquerade`: acceptance fails if any required app service
   is absent from resolved Compose, if `docker compose top` does not show its app
   process, or if a host Node/`tsx`/Next process owns the app port. Infra-only
   containers plus host-run `web`, `api`, or `runner` are a false demo.

**Recommendation — confidence: high.** Use this bar as a blocking checklist and
archive command outputs, resolved Compose, image IDs, worker-registration proof,
and correlated dispatch IDs. **Strongest counter-argument:** an end-to-end model
call can be expensive or impossible on the Mac; that justifies a separately
authorized provider-proof gate, not weakening the container/process and Hatchet
dispatch proofs.

### RQ-B2 — Compose boundary versus host boundary

| Process | Required location | Basis |
|---|---|---|
| `web`, `api`, `runner`, `scheduler`, `hatchet-engine`, `postgres`, `vllm` | inside Compose for the full claim | ruled service list, `ADR-0018:54-75` |
| `apps/replay` launch ceremony | container-expressible, separately scheduled one-shot job with its own read-only credential; not necessarily long-running | `ADR-0018:106-118`; `apps/replay/src/cli.ts:5-18` |
| `apps/evaluator-worker` | excluded pending RQ-E3 | absent from ADR service list and has no process entry (`apps/evaluator-worker/package.json:1-13`) |
| `apps/ui` | excluded; `web` is the ruled frontend | `docs/architecture/03-module-design.md:158,168-173` |
| Codex/Claude/Grok CLIs and the orchestrator relay | host | they are control-plane development tools, not product services; mission intake records their Terminal transports (`00-intake-H0.md`, seat roster) |
| Hermes board | host on 9119 | spine port law (`debateai-heartbeat-protocol.md:315-321`) |
| DR-179 CLI model relays | host | ruled HOLD recorded in `00-intake-H0.md`, “Standing law”; relays are explicitly not Hatchet workers |
| Vitest/test runner | host by default; Testcontainers may launch its real Postgres dependency | root test scripts (`package.json:14-15`) and ADR-0012 test-layer law (`ADR-0012-test-stack-and-replay-ceremony-isolation.md:130-150`) |

`REQ-B2-1`: control-plane agent tools SHALL NOT be smuggled into product Compose
to inflate the service count. Product workers SHALL NOT remain on the host when
the full containerization claim is made.

**Recommendation — confidence: high.** Keep the product/control-plane boundary
above. **Strongest counter-argument:** containerizing test runners can improve
CI reproducibility; it may be added as a test profile, but it still is not a
product deployment unit.

### RQ-B3 — development versus production scope

**Ruled law.** Production remains Docker Compose on Hetzner behind Cloudflare,
with one API origin, no direct-origin bypass, and vLLM behind the provider
gateway (`ADR-0018:1-5,54-103`).

**Ranked requirements posture:**

1. **Preferred:** one mission with a local-dev executable slice first and a
   production-target slice before mission closure. The local gate proves builds,
   readiness, Hatchet dispatch, restarts, and host-process absence. The
   production slice proves the resolved target topology, non-insecure settings,
   exact pins, one Cloudflare-facing API origin, private internal services, and
   separately injected credentials. A live Hetzner/Cloudflare deployment remains
   an important operation and is not implied by static config proof.
2. **Acceptable only by V decision:** local-dev is mission-complete and
   production is a named successor mission carrying every ADR-0018 constraint.
3. **Not recommended:** production-only first; it delays the fastest falsifiable
   feedback and mixes infrastructure access with basic image/entrypoint defects.

`REQ-B3-1`: no local-dev acceptance may be labelled ADR-0018 production
compliance. `REQ-B3-2`: deferring production SHALL create an explicit successor
and preserve Hetzner, Cloudflare, one-front-door, pin, co-tenant, and credential
requirements.

**Recommendation — confidence: medium-high.** Rank option 1 first.
**Strongest counter-argument:** V may intend a narrowly local containerization
mission; requiring a production slice now adds cloud/proxy scope and may trigger
external-operation gates before the core value is proven. RQ-E2 closes this.

### RQ-B4 — vLLM mission bar and host consequences

**Ruled law.** `vllm` is an ADR-0018 service and one provider adapter behind the
gateway (`ADR-0018:69-75,120-153`). **Vendor fact.** The official CUDA Docker
example requires the NVIDIA runtime and `--gpus all`; current vendor docs also
describe other hardware paths, including experimental/native Apple Silicon
paths that are not the same as proving this repository's pinned CUDA image
works on this Mac ([vLLM Docker docs](https://docs.vllm.ai/en/latest/deployment/docker/),
[vLLM installation matrix](https://docs.vllm.ai/en/latest/getting_started/installation/)).

`UNVERIFIED`: this Mac's CPU architecture/GPU capability and the pinned image's
ability to run under Docker Desktop; the target Hetzner host/model/GPU is also
unknown.

`REQ-B4-1`: vLLM SHALL remain required for full ADR/profile and end-to-end local
provider claims. `REQ-B4-2`: local base-container work MAY use an explicit
hardware-gated profile that omits vLLM, but its result SHALL be labelled
“control-plane/app containers ready — provider proof pending,” never “full app
containerized.” `REQ-B4-3`: the vLLM profile SHALL state and preflight its
platform/GPU/model/cache requirements and retain exact digest provenance.

**Recommendation — confidence: high.** Split vLLM behind an explicit profile,
but keep compatible-host vLLM proof as a blocking full-mission acceptance item.
**Strongest counter-argument:** profiles create drift and weaken the one-command
story; a single mandatory GPU profile is simpler and catches provider wiring on
every run, but it may make the current Mac unusable for all other container work.

### RQ-B5 — Testcontainers relationship

**Ruled law.** Database tests use Testcontainers with real Postgres and the
bootstrap `postgresMajorVersion`; Hatchet is intentionally absent from unit,
property, contract, and database-invariant layers. Tests of dispatch use the
Compose engine; claim-before-call is proven against `core.work_item` and the
ledger, not delegated to Hatchet
(`docs/architecture/01-decisions/ADR-0012-test-stack-and-replay-ceremony-isolation.md:130-150`).

`REQ-B5-1`: Testcontainers and app Compose SHALL use the same ruled Postgres
major and the same migrations/invariants; neither may substitute an in-memory
or differently shaped store. `REQ-B5-2`: tests that assert Hatchet dispatch
SHALL explicitly bring up the Compose Hatchet path and fail if it is absent;
ordinary database tests SHALL not acquire a fake Hatchet substitute.
`REQ-B5-3`: test selection SHALL be explicit, so a green default test run cannot
silently skip all dispatch proof while being reported as container acceptance.

**Recommendation — confidence: high.** Preserve Testcontainers for database
invariants and add a separately named Compose-integration acceptance gate for
Hatchet/app services. **Strongest counter-argument:** two Postgres launch paths
increase time and config-drift risk; shared pin/migration assertions are required
to control that risk rather than collapsing the two test purposes.

## C. Hatchet as dispatcher

> **Freeze:** Hatchet requirements must not reopen or modify auth, identity,
> sessions, MFA, crypto, or the live security mission.

### RQ-C1 — ownership boundary

**Ruled law translated to requirements:**

- `REQ-C1-01`: Hatchet MAY own assignment, redelivery, task timeout, worker
  lifecycle, child-task fan-out/waits, scheduling, and its operational
  dashboard/history (`ADR-0017:87-98`).
- `REQ-C1-02`: Hatchet SHALL use Postgres messaging; RabbitMQ is off unless a
  new recorded law-6 exception cites measured need (`ADR-0017:123-137`).
- `REQ-C1-03`: engine assignment is not the claim. The worker SHALL perform the
  settled/completable checks and commit the `core.work_item` claim before any
  model call; Hatchet timeout SHALL NOT release that claim
  (`ADR-0017:163-244,304-325`).
- `REQ-C1-04`: Hatchet history SHALL NOT replace the product ledger; Hatchet
  ordering SHALL NOT replace `at_seq`; Hatchet state SHALL NOT become run state
  (`ADR-0017:139-161`).
- `REQ-C1-05`: every model call SHALL remain in a plain/child task behind Seam C,
  with its real gateway artifact and product ledger row; a stored engine output
  is not an artifact by itself (`ADR-0017:326-346`).
- `REQ-C1-06`: engine retries SHALL consume the same register-governed attempt
  budget and every attempt SHALL be counted from the product ledger, never from
  engine defaults/counters (`ADR-0017:348-377`).
- `REQ-C1-07`: Hatchet's separately migrated database/schema SHALL remain a
  co-tenant on the one Postgres instance with no product query joins across the
  boundary (`ADR-0017:379-399`).

**Recommendation — confidence: high.** Make these seven clauses blocking
acceptance invariants rather than operational guidance. **Strongest
counter-argument:** some properties cannot be inferred from Compose or the
dashboard; they require application/database evidence. That is why RQ-B1's
correlated dispatch and ledger receipt are mandatory.

### RQ-C2 — minimum real wiring and observable

**Live-tree basis.** The API already calls `runNoWait` with V3 correlation
metadata, and the runner already registers and starts the walking-skeleton task
(`apps/api/src/index.ts:359-381`; `apps/runner/src/main.ts:42-47`). Current
Compose injects none of that application's environment contract
(`compose.dev.yaml:14-31`; `packages/register/src/runtime-environment.ts:44-48,78-94`).

`REQ-C2-1`: minimum wiring is `api` dispatcher + `runner` worker + Hatchet
control plane on one internal network, sharing token/tenant/engine endpoint,
workflow name, and TLS posture. Runner alone is not enough; API import alone is
not enough. `REQ-C2-2`: the runner SHALL register the current
`HATCHET_WORKER_NAME` and `HATCHET_WORKFLOW_NAME` before it is ready.
`REQ-C2-3`: scheduler jobs SHALL remain three named entry points; if Hatchet
schedules them, the registration/execution design SHALL preserve RQ-C5's three
credential scopes rather than absorbing them into the runner credential.

`REQ-C2-4 — proof`: acceptance SHALL capture (a) Hatchet control-surface/API
evidence for the named registered runner and workflow, (b) engine/API logs for a
dispatch, and (c) the product `core.work_item` + ledger result with the same
`v3RunId`/`v3WorkItemId`. A dashboard screenshot without product correlation
fails. Official worker lifecycle documentation confirms registration precedes
`worker.start()` ([Hatchet TypeScript worker docs](https://www.mintlify.com/hatchet-dev/hatchet/sdk/typescript/worker)).

**Recommendation — confidence: high.** Accept Hatchet use only on the correlated
API->engine->registered-runner->product-ledger proof. **Strongest
counter-argument:** dashboard/API schemas vary by Hatchet version; the exact
query is implementation-time vendor work. The required observable correlation
does not depend on one endpoint spelling.

### RQ-C3 — lite locally versus full engine in production

**Live-tree fact.** The current `hatchet-lite` service uses a digest, Postgres
messaging, `localhost` broadcast addresses, and explicitly insecure cookie/gRPC
flags (`compose.dev.yaml:14-31`). **Vendor fact.** Current self-host docs describe
a bundled single-container quick local start, while a self-hosted installation
has a server/control-plane, PostgreSQL, and optional RabbitMQ; workers run
separately. The Docker-Compose guide says an in-network worker requires the
engine container hostname rather than `localhost`, and Postgres messaging
requires removing all RabbitMQ references
([Hatchet self-host overview](https://www.mintlify.com/hatchet-dev/hatchet/self-hosting/overview),
[Hatchet Docker Compose guide](https://www.mintlify.com/hatchet-dev/hatchet/self-hosting/docker-compose)).

`UNVERIFIED`: whether the pinned `hatchet-lite` digest is vendor-supported for
production and whether it exposes all migration/dashboard behavior ADR-0018
expects. This needs version-specific vendor release documentation or an
implementation-time vendor image audit.

`REQ-C3-1`: lite MAY remain a local integration profile only if it proves the
same SDK dispatch/registration path, Postgres messaging, one Postgres instance,
exact pin, and no RabbitMQ. Container-to-container addresses SHALL be internal
service addresses, not `localhost`. `REQ-C3-2`: production SHALL prove the
ADR-named `hatchet-engine` control-plane, migration, and dashboard surfaces with
non-insecure network/auth settings. Lite-only with localhost/insecure flags
SHALL fail production compliance.

**Recommendation — confidence: medium-high.** Retain lite for fast local proof
and require full-engine production proof. **Strongest counter-argument:** the
vendor describes Docker Compose as suitable for development and small
production deployments; if the pinned lite image is the supported consolidated
server, a forced multi-image split may add ceremony without behavior. The
version audit can overturn the packaging recommendation, not the security and
observable requirements.

### RQ-C4 — RabbitMQ exclusion that fails on copied vendor Compose

The vendor repository's current root Compose includes a `rabbitmq` service, so
copying vendor Compose is a live regression vector
([official Hatchet `docker-compose.yml`](https://github.com/hatchet-dev/hatchet/blob/main/docker-compose.yml)).
ADR-0017 makes an unrecorded running RabbitMQ a defect
(`ADR-0017:123-137`).

`REQ-C4-1 — blocking resolved-model check`: after all Compose includes,
overrides, interpolation, and profiles are resolved, a parser SHALL fail if:

1. any service key, image, dependency, hostname, environment key/value, command,
   URL, or volume reference contains case-insensitive `rabbitmq`, `amqp://`, or
   `amqps://`;
2. any resolved service publishes or exposes canonical RabbitMQ ports 5672 or
   15672;
3. any Hatchet engine/setup service resolves `SERVER_MSGQUEUE_KIND` to anything
   other than exact `postgres` or omits it; or
4. the resolved service graph contains a broker dependency other than the ruled
   Postgres path.

The scan SHALL run on every Compose input/profile, not merely the top-level file,
and SHALL print the offending JSON path. The check's own fixture SHALL include a
vendor-style renamed broker service (for example, neutral service key but
RabbitMQ image/AMQP URL) and demonstrate RED; current Postgres-only resolved
input demonstrates GREEN. An exception SHALL require a cited, V-approved law-6
decision and a changed `authority_epoch`, never an allowlist comment.

**Recommendation — confidence: high.** Make this check a required static gate
before any pull/up, so a broker cannot be started before detection.
**Strongest counter-argument:** string/port detection can false-positive on
comments or unrelated telemetry. Parsing the resolved semantic model, reporting
the exact path, and limiting the scan to deployment inputs avoids comment-only
false positives while still catching renamed services.

### RQ-C5 — scheduler credential separation

**Ruled law.** The three scheduler jobs share a process but not a credential.
The replay self-test may append only to two `serve` eviction streams; the reaper
may write `core.work_item`; settlement-watch may append only the specified
`scorecard`/`ledger` records, with no update/delete and no `serve`/`core` write
(`docs/architecture/03-module-design.md:640-702`).

`REQ-C5-1`: Compose/secret injection SHALL supply three distinct database
principals and three distinct secret references/URLs, one per named job. A
shared admin URL with an in-process “mode” flag fails. `REQ-C5-2`: rendered
Compose evidence SHALL prove the references are distinct without printing
secret values. `REQ-C5-3`: runtime permission receipts SHALL show each principal
can perform its documented write and is denied representative writes from the
other two scopes. `REQ-C5-4`: image reuse is permitted; credential reuse is not.

**Recommendation — confidence: high.** Run the jobs as separate Compose
invocations/services from one image, each with one least-privilege secret.
**Strongest counter-argument:** three service entries increase operational
surface. A single scheduler container could switch credentials per subprocess,
but that is harder to audit and risks making all three secrets simultaneously
available; it must meet the same non-sharing and exposure proofs to be accepted.

## D. Isolation from the live security mission

> **Freeze:** the security mission owns its WIP. File convenience never overrides
> one-writer-per-file or the explicit freeze.

### RQ-D1 — machine-honorable path classes

These path classes constrain the later coding seat; they do not authorize writes
during REQUIREMENTS.

| Class | Later mission rule |
|---|---|
| **May create** | new container build files colocated with the ruled `apps/api`, `apps/runner`, `apps/scheduler`, and `web` units; new containerization-owned deployment assets under a new `deploy/` subtree; new sibling Compose/profile files; new docs only under `docs/missions/2026-08-21-docker-hatchet/**` |
| **May extend only under an explicit exclusive lane contract** | container scripts in root `package.json`; image-pin/bootstrap carriers; existing non-security package manifests; `deploy/IMAGE-PINS.md`; and `compose.dev.yaml` only after RQ-D2's collision is cleared |
| **Read-only by default** | current app entrypoints and `packages/register/src/runtime-environment.ts`; containerization should consume their contracts rather than refactor them |
| **Must not touch** | `docs/missions/2026-08-17-accounts-privacy-security/**`; `docs/missions/2026-08-17-mfa-recovery-requirements/**`; identity/registration/MFA/session/auth routes; `packages/crypto/**`; identity migrations `0030+`; security-owned `migrations/pending/**`; foreign boards; any file/hunk currently assigned to accounts S3/S3d |

`REQ-D1-1`: H6 SHALL assign exact files, not only directory globs, and SHALL
fresh-read foreign ownership immediately before each edit phase. `REQ-D1-2`: a
required collision produces `waiting_hermes`/file-contract escalation; the
containerization lane SHALL not absorb or “finish” security WIP. `REQ-D1-3`:
app-source edits are not presumed necessary merely because app images are new.

**Recommendation — confidence: high.** Prefer create-only deployment lanes and
leave current app source read-only until architecture proves a source edit is
unavoidable. **Strongest counter-argument:** Docker health/shutdown behavior may
need a small app change. If so, architecture must identify a new non-security
file/hunk and secure exclusive ownership; it may not edit through the frozen
identity/auth bootstrap.

### RQ-D2 — `compose.dev.yaml` collision surface

**Live fact.** `compose.dev.yaml` contains dev credentials, published Hatchet
and vLLM ports, localhost addresses, and insecure cookie/gRPC flags
(`compose.dev.yaml:4-40`). Intake records that the live security research already
cites this file and allows extension only if no foreign file contract owns it
(`00-intake-H0.md`, “Isolation”).

`REQ-D2-1`: while accounts S3/S3d is active, this mission SHALL NOT edit
`compose.dev.yaml` without an explicit fresh ownership clearance naming the
file. The default SHALL be a new sibling Compose layer/profile that consumes or
overrides the base without modifying it. `REQ-D2-2`: resolved-config acceptance
SHALL prove insecure/local-only base values do not leak into a production
profile. `REQ-D2-3`: after the foreign mission closes, architecture may propose
consolidation under one writer; it is not implied by this requirement.

**Recommendation — confidence: high.** Use a sibling Compose input during the
overlap. **Strongest counter-argument:** layering can hide inherited insecure
settings and contradict ADR-0018's “one compose file describes deployment”
legibility goal. The resolved-model security gate and later consolidation are
therefore mandatory, not optional cleanup.

### RQ-D3 — containerizing API without changing identity/auth

**Live-tree facts.** API startup is `tsx src/main.ts`; it reads its complete
environment through `loadApiEnvironment`, then listens on `API_HOST` and
`API_PORT` (`apps/api/package.json:1`; `apps/api/src/main.ts:30-43,120`;
`packages/register/src/runtime-environment.ts:50-75`). The same bootstrap also
loads security key paths and registration infrastructure
(`apps/api/src/main.ts:30-65`), which is frozen, not a reason to alter it.

`REQ-D3-1 — build context/cwd`: the image SHALL preserve pnpm workspace
resolution and run from a working directory in which the existing
`@debateai/api` start script resolves; it SHALL NOT copy/rewrite identity source
to make imports work. `REQ-D3-2 — command`: use the existing API start contract
or its compiled semantic equivalent; no alternate auth-free API entrypoint.
`REQ-D3-3 — environment`: inject every currently required loader key at runtime;
do not bake values into the image, invent defaults, log secrets, or rename keys
inside security code. Secret files SHALL arrive through read-only external
mounts/injection at their existing paths. `REQ-D3-4 — network`: inside the
container `API_HOST` SHALL bind a container-reachable interface and `API_PORT`
SHALL be the single declared internal API port; only the approved front door may
be externally published. `REQ-D3-5`: identity/auth routes and behavior SHALL be
byte-for-byte untouched by this mission.

**Recommendation — confidence: high.** Treat the API image as packaging around
the existing entry/environment contract. **Strongest counter-argument:** the
existing bootstrap may couple API readiness to unfinished security secrets,
making container startup cumbersome. That coupling belongs to the frozen
security mission; bypassing it here would create a second, less secure API path.

## E. Open questions only V can close

> **Freeze:** record these questions for the batched V DECISIONS PACKET. Do not
> contact V from this seat and do not perform the operation speculatively.

### RQ-E1 — authorize Docker operator preflight now?

- **Question:** may the later implementation seat start Docker Desktop and make
  its bundled Docker CLI reproducibly available to the mission shell?
- **Why REQUIREMENTS cannot close it:** starting operator software and changing
  CLI availability is an important operation; current receipt shows app present
  but CLI/daemon unavailable (RQ-A5).
- **Options:** (A) authorize start/CLI setup on this Mac for implementation;
  (B) defer and use another already-prepared Docker host; (C) keep the mission at
  static requirements only.
- **Recommendation — confidence: high:** A, but only at programming preflight
  with the exact A5 receipt and no automatic login/persistent system change
  beyond V's authorization. **Strongest counter-argument:** Docker Desktop may
  consume substantial laptop resources and still cannot prove the vLLM GPU
  profile.

### RQ-E2 — production target inside this mission?

- **Question:** does mission completion require the production-target Compose
  slice for Hetzner/Cloudflare, or may it stop after the local-dev acceptance bar
  with a successor mission?
- **Why REQUIREMENTS cannot close it:** both preserve DR-117/ADR-0018, but they
  differ materially in scope, external access, and acceptance timing.
- **Options:** (A) local first plus production-target slice in this mission;
  (B) local complete, production as an explicit successor; (C) production first.
- **Recommendation — confidence: medium-high:** A, with live cloud deployment
  separately V-gated. **Strongest counter-argument:** B is more likely to deliver
  a falsifiable local result without mixing Cloudflare/Hetzner operations into
  basic container packaging.

### RQ-E3 — is `apps/evaluator-worker` a deployment unit?

- **Question:** add `apps/evaluator-worker` to this mission's deployment scope,
  or preserve ADR-0018's deliberate seven-service list?
- **Why REQUIREMENTS cannot close it:** the package exists and defines evaluator
  task families, but it has no process script and ADR-0018 does not name it
  (`apps/evaluator-worker/package.json:1-13`;
  `apps/evaluator-worker/src/index.ts:28-35`; `ADR-0018:54-75`). Adding it is an
  architecture/scope expansion.
- **Options:** (A) exclude it; (B) add it as an eighth long-running service;
  (C) make it an explicitly deferred profile/successor.
- **Recommendation — confidence: high:** A for this mission; revisit through a
  new architecture ruling when it has an executable ownership contract.
  **Strongest counter-argument:** omitting a real evaluator consumer could leave
  the “app” behavior incomplete even though the ruled service list is satisfied.

### RQ-E4 — may full local acceptance defer vLLM to a compatible host?

- **Question:** on a Mac that may not run the pinned vLLM image, may local
  acceptance stop at the app/control-plane profile while the vLLM provider proof
  runs later on compatible hardware?
- **Why REQUIREMENTS cannot close it:** current Mac/target GPU compatibility is
  `UNVERIFIED`, and changing the definition of mission-complete is a product
  acceptance decision.
- **Options:** (A) allow split proof but withhold “full app containerized” until
  vLLM passes; (B) require vLLM on this Mac; (C) require a compatible remote host
  before any acceptance.
- **Recommendation — confidence: high:** A. **Strongest counter-argument:** split
  proof can let provider-network and model-mount defects survive until late; the
  successor proof must therefore remain blocking and explicitly owned.

WORKER CLAIM:
- ticket: REQ-DOCKER-CODEX
- owner CLI session: 01a02369-393a-72f0-a92c-a811020c050b
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / H0-REQUIREMENTS
- owner CLI session: 01a02369-393a-72f0-a92c-a811020c050b
- artifact path: docs/missions/2026-08-21-docker-hatchet/research/codex-requirements.md
- upstream artifacts used: brief.md; 00-intake-H0.md; ADR-0012; ADR-0017; ADR-0018; 03-module-design.md; 05-register-skeleton.md; 06-test-strategy.md; approved live-tree paths; linked primary Hatchet/vLLM documentation
- checks/evidence: 22/22 RQ headings exactly once; 22/22 confidence-labelled recommendations; 22/22 strongest counter-arguments; local citations and UNVERIFIED labels present; bounded Hatchet/env/registration and Dockerfile absence searches recorded; only the two allowed artifact paths written
- assumptions/risks: production support of pinned hatchet-lite and this Mac/target host vLLM compatibility remain UNVERIFIED; V must close RQ-E1..E4; no Docker/Compose execution was authorized
- comments read through: intake
