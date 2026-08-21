# SYNTHESIZED REQUIREMENTS — Docker + Hatchet containerization

- **Ticket:** `REQ-DOCKER-SYNTH` · mission `2026-08-21-docker-hatchet` · loop REQUIREMENTS
- **Seat shape:** `synthesis-after-blind` · owner: Claude Opus 5, **new session**
  `1a0b5071-8f67-4133-91c3-874017f90ad2`
- **Date:** 2026-08-21 · risk_tier high · planning_tier 2 · comments read through: intake
- **Inputs (the only ones):** `brief.md`, `00-intake-H0.md`, my goal packet, the three blind
  artifacts (`opus-requirements.md`, `grok-requirements.md`, `codex-requirements.md`) and
  their three self-reports, ADR-0017, ADR-0018.
- **This artifact is REQUIREMENTS.** No architecture, no Dockerfile, no compose, no code, no
  file layout. Nothing here was executed. Docker was not started (RQ-E1 is still V's).

> **FREEZE.** Nothing in this document authorizes a write to identity, registration, MFA,
> sessions, crypto shredding, `packages/crypto/**`, identity migrations `0030+`, or
> `docs/missions/2026-08-17-accounts-privacy-security/**`. The `accounts-phase1` /
> `accounts-phase4` boards are not operated. Section 4 is the mechanism that keeps this true.

## How to read this

Seat attributions are **`[O]`** Opus (`REQ-DOCKER-OPUS`), **`[G]`** Grok (`REQ-DOCKER-GROK`),
**`[C]`** Codex (`REQ-DOCKER-CODEX`). A synthesized requirement is `SR-*`; seat-local ids
(`R-A4.1`, `REQ-B1-09`, …) are preserved so the upstream artifact can be re-found.

Three statuses, and they are not interchangeable:

- **AGREED** — the seats converge. Passed through; architecture may build on it.
- **CONTESTED** — the seats disagree on a **requirements** question. Both readings are kept
  verbatim, with what would settle it. **Not averaged.**
- **OPEN-V** — the question is V's (product, scope, ruling supersession, register value,
  operator software). Requirements cannot close it. Routed to §5.

Where a seat marked something `UNVERIFIED`, it stays `UNVERIFIED` here unless another seat
independently verified it — in which case the triangulation is named.

---

# 1. Mission bar

What must be true for **"the app is containerized using Docker and Hatchet"** to be an
honest claim. Every row is a command whose captured output either shows the property or does
not. Prose, screenshots and "the process started" do not satisfy any row.

**Scope of the bar is itself decided by RQ-E2/RQ-B3 (OPEN-V).** As written, MB-1…MB-11 are
the **local-dev** bar. Whether this mission must additionally clear a production-target bar
is V's (§5, V-2). MB-11 is what keeps a local-dev pass from being described as ADR-0018
production compliance.

| # | Criterion | Falsifier | Source |
|---|---|---|---|
| **MB-1** | **One command up.** After a documented preflight (`pnpm install`, `pnpm compose:env`) one documented command brings every **required** service (MB-2) to healthy. No host `pnpm`/`tsx`/`next` process is required by any required service; no second terminal starts an app process. | Run it on a machine where the app has never run. A second command or a host process for any required service fails MB-1. | `[O]` CB-1, `[C]` REQ-B1-01, `[G]` B1.1 — unanimous |
| **MB-2** | **Declared inventory.** The **resolved** compose model lists every required service before startup. A differently-named local substitute (`hatchet-lite` for `hatchet-engine`) is **called out as a substitute**, never counted as silent proof of the ruled unit. | Resolved config missing a required service, or a substitute counted as the ruled row, fails MB-2. | `[C]` REQ-A1-1 / REQ-B1-02, `[G]` C3, `[O]` A1 |
| **MB-3** | **Named health checks that exercise the service's own contract.** Every required service declares `healthcheck:`; `docker compose ps` reports `healthy`; dependency edges use `depends_on: { condition: service_healthy }`, not the short form. Postgres readiness covers **both** the product database and the `hatchet` co-tenant database. | A `healthcheck` whose test is `["CMD","true"]`, a bare TCP connect on a port bound before readiness, or a `depends_on` short form, fails MB-3. | `[O]` CB-2, `[C]` REQ-B1-04, `[G]` B1.2 |
| **MB-4** | **Logs come from the container.** `docker compose logs <svc>` yields attributable startup / readiness / dispatch / failure records for every required service, **without printing token or credential values**. | Empty logs for a demonstrably working service, or a secret value in the log stream, fails MB-4. | `[O]` CB-3, `[C]` REQ-B1-06, `[G]` B1.3 |
| **MB-5** | **Single-service restart.** Restarting `api` (and separately `runner`) returns it to healthy while siblings stay healthy and are **not** restarted (compare `StartedAt`), the runner **re-registers**, a new dispatch completes, and **Hermes on host port 9119 keeps answering throughout**. | Any sibling restarting, a full `down`/`up` being required, a runner that does not re-register, or a 9119 interruption, fails MB-5. | `[O]` CB-4, `[C]` REQ-B1-07, `[G]` B1.4–B1.5 |
| **MB-6** | **Durability across `down`/`up`.** `docker compose down` **without `-v`** then `up -d` preserves the Postgres data **and** the `USER_DEK_STORE_PATH` tree. | Any required durable state in a container writable layer or an undeclared anonymous volume fails MB-6. | `[O]` CB-6 + R-D3.3 (Opus-only; see §2 D3) |
| **MB-7** | **One-command non-destructive stop.** One documented stop command stops mission containers and **deletes no product/database volume** (DR-188). | A documented stop path that removes volumes, or that requires `-v` to work, fails MB-7. | `[C]` REQ-B1-08 (Codex-only) |
| **MB-8** | **Image provenance.** Every running container maps to an exact recorded image identity: third-party images by **digest**, newly built app images by **immutable image ID/digest** in the acceptance receipt. Mutable tag text alone fails. | A container whose image resolves only to a floating tag, or an app image with no recorded immutable id, fails MB-8. | `[C]` REQ-A4-1/2 + REQ-B1-03, `[G]` A4, `[O]` §5.4c restatement |
| **MB-9** | **Dispatch is real, not a sidecar.** All three observables hold, captured from inside containers: **(O-1)** the runner's worker is registered/connected under `HATCHET_WORKER_NAME` for `HATCHET_WORKFLOW_NAME`; **(O-2)** an engine-side artifact (dashboard, API, **or** engine/worker log line) exists for that workflow carrying a **real** `v3WorkItemId`; **(O-3)** the matching `core.work_item` row shows a committed claim and our ledger has the attempt row. | Any one of the three missing fails MB-9. O-1 alone is a sidecar; O-3 alone is indistinguishable from the pre-Hatchet acceptance harness. | **Unanimous, independently derived:** `[O]` CB-8/O-1..O-3, `[G]` C2 three observables, `[C]` REQ-B1-05/REQ-C2-4 |
| **MB-10** | **Anti-masquerade.** No host `node`/`tsx`/`next` process owns any port the claim depends on; `docker compose top` shows each app process inside its service; in the file the claim is made against, no required service bind-mounts host source or host `node_modules`; in-compose services address each other by **compose service DNS only** — never `localhost`, never `host.docker.internal`, never a published host port. | A green `docker compose ps` alongside a host process serving an app port, or a required service whose `volumes:` source is a host path under the repo, fails MB-10. | `[C]` REQ-B1-09, `[O]` CB-7 + R-D2.2, `[G]` B1 "false-containerized demo" |
| **MB-11** | **The label is bounded in writing.** The deploy record states plainly what the passing bar does **not** prove: (i) local-dev is **not** ADR-0018 production compliance; (ii) if `vllm` is off, **no real model call occurs** and no seat may describe the stack as "running debates"; (iii) `job:reaper` is a stub, so AC-89's write half does not fire in this deployment. | Any seat, review lens, or Hermes verdict describing the stack in terms the bar did not prove fails MB-11. | `[C]` REQ-B3-1 + REQ-B4-2, `[O]` R-B4.3 + R-C5.5, `[G]` B3.3/C3 |

**The default failure mode, named by all three seats:** today's exact shape —
`postgres` + `hatchet-lite` (+ `vllm`) in compose, `api`/`runner`/`web` on the host via
`tsx`/`next`, a screenshot-able Hatchet UI on `localhost:8888`, and no app service in
`docker compose ps`. It is where the tree already is, it passes a naive check, and MB-1 +
MB-10 exist to exclude it. Four further look-alike states are enumerated by `[O]` RQ-B1
(shell-around-host-state; host-network escape; liveness theatre; `web` fronting a host api;
green stack with dead dispatch) and are excluded by MB-3, MB-9 and MB-10.

**Preflight is a precondition of the whole bar, not part of it.** Before any seat may claim
a container came up (union of `[O]` R-A5, `[C]` REQ-A5-1/2, `[G]` A5):

1. `docker` resolves on `PATH` (or, `[C]`'s allowance, one explicit absolute path used
   reproducibly by **every** operator command and automation).
2. `docker version` prints **both** Client and Server blocks. Client-only = daemon down;
   all three seats flag this as the likely half-success on this machine.
3. `docker compose version` succeeds — Compose **v2 plugin**, not a standalone v1 binary.
   `[O]`: the two differ in `depends_on` condition support and `include:`, which §4 depends on.
4. `docker info` succeeds and reports daemon status, host architecture, storage driver, and
   available memory/disk. Those numbers are recorded — vLLM + Postgres on one host is the
   documented single-host concentration risk (ADR-0018 §Consequences).
5. The **named context** is recorded `[C]`, and a non-mutating pull/build feasibility check
   covers every required platform `[C]`.
6. The **claimed compose file was used**, not a vendor sample `[G]`.
7. The claiming seat did **not** start Docker Desktop or install the CLI unless V has closed
   RQ-E1 `[G]`.

**Until preflight passes, the honest verdict word is `UNPROVEN`, not "containerized"**
(`[O]` R-A5 judgement, `[G]` A5, `[C]` REQ-A5-2 — unanimous).

---

# 2. Per-RQ merge table

Every brief id. Extra ids invented by seats are in §2.6, not dropped.

## 2.1 Section A — current-state gap

| RQ | Status | Synthesis (one line) | Citations |
|---|---|---|---|
| **A1** | **AGREED** | ADR-0018 rules seven services (`web`, `api`, `runner`, `scheduler`, `hatchet-engine`, `postgres`, `vllm`); `compose.dev.yaml` declares three (`postgres`, `hatchet-lite`, `vllm`); `web`/`api`/`runner`/`scheduler` are absent and `hatchet-engine` is present only as a differently-named, different-image substitute. | `[O]`A1 `[G]`A1 `[C]`A1 — identical tables |
| **A2** | **AGREED** (one consequence CONTESTED → V-7) | `api`/`runner` start via package `start` → `tsx src/main.ts`; `scheduler` has no package script and is three root CLIs; `replay` is a one-shot argv-driven ceremony, not a service; `evaluator-worker` is a **library with no process**; `apps/ui` and `web` both bind 3000 and only `web` is the ruled unit. All three seats independently found the ruled `job:reaper` is not runnable (live script is `job:liveness-sweep`; `runReaper` throws `S00_SCAFFOLD_ONLY`). | `[O]`A2 `[G]`A2 `[C]`A2 |
| **A3** | **AGREED — the intake lead is corrected, unanimously** | Hatchet is **already a running dependency of app code**, not only a sidecar: SDK `1.28.1` in `apps/api` + `apps/runner`, `HatchetDispatcher.runNoWait` with `sourceOfRecord: "core.work_item"` metadata, `worker.registerWorkflows([task])` + `worker.start()` in the runner, and a `.strict()` `HATCHET_*` env contract in `packages/register`. `SERVER_GRPC_*` exists **only** on the engine service; no app source reads it. **What is missing is a runtime that has ever exercised it**, plus the containerized processes and the env/network to connect them. | `[O]`A3 `[G]`A3 `[C]`A3 (`[C]` records a bounded absence-search receipt; `[O]` adds three independent never-run signals incl. DR-121 — see §2.6 / V-4) |
| **A4** | **AGREED on the facts; CONTESTED on `postgres` → V-5** | `hatchet-lite` and `vllm` are digest-pinned (the `:latest` text next to the digest is cosmetic and misleading); `postgres` is `postgres:${POSTGRES_MAJOR_VERSION}` → major-only, **not** digest-pinned; `pnpm compose:env` emits exactly one line, `POSTGRES_MAJOR_VERSION`. Rule (§5.4c/AC-74): exact digests, never floating tags; `vllm` digest is a **register row**, the engine digest is a **compose build input**. Do not copy vendor `:latest`. | `[O]`A4 `[G]`A4 `[C]`A4 |
| **A5** | **AGREED** | `/Applications/Docker.app` exists and contains the CLI and the Compose v2 plugin; `command -v docker` fails; `/usr/local/bin/docker` absent; **daemon not running**; no `Dockerfile`, `.dockerignore`, or second compose file anywhere in the tree. These are **three separate states** (`[O]`), not one. Preflight receipts = §1. No seat started Docker. | `[O]`A5 `[G]`A5 `[C]`A5 |

### A4 — two Opus-only findings architecture must carry

Neither `[G]` nor `[C]` reported these; both are live-tree facts with a named consequence.

- **`docker compose up` cannot succeed today on a clean machine.** `compose.dev.yaml`'s
  `vllm` command requires `${VLLM_MODEL:?…}` and `compose:env` never emits `VLLM_MODEL`, so
  Compose fails at variable interpolation before pulling anything (`[O]` R-A4.2). This is a
  live blocker against MB-1 and it is why B4's split matters mechanically, not just
  politically.
  **SR-A4.1:** no `:?`-guarded variable may remain on the required path; every such variable
  needs a named register-sourced producer, or the service that needs it is not in the
  required set.
- **The register row and the compose pin are duplicated with nothing keeping them equal.**
  `register.bootstrap.json` holds `vllmImageDigest` and `compose.dev.yaml` holds the same
  digest as a source literal; they agree today and nothing detects drift (`[O]` R-A4.1).
  **SR-A4.2:** every compose image identity that is a register row must be **interpolated
  from a variable emitted by `pnpm compose:env`**, never written as a compose literal.
  **Note the contract consequence:** SR-A4.2 requires extending `packages/register/src/compose-env.ts`,
  which `[G]` and `[C]` did **not** place in the may-extend class. See §2.4 D1 (CONTESTED).

## 2.2 Section B — what "containerized" must mean

| RQ | Status | Synthesis (one line) | Citations |
|---|---|---|---|
| **B1** | **AGREED** on the core; extras merged as a union | One-command lifecycle + named contract-exercising health checks + per-service logs + isolated restart + anti-masquerade, all falsifiable. Union adds durability across `down`/`up` (`[O]`), non-destructive one-command stop (`[C]`), image provenance (`[C]`), image-contains-the-app (`[O]`), Hermes-9119 survives (`[G]`,`[C]`). = §1 MB-1…MB-11. | `[O]`CB-1..8 `[C]`REQ-B1-01..09 `[G]`B1.1-5 |
| **B2** | **AGREED** | **Inside compose:** `postgres`, the Hatchet dispatcher, `api`, `runner`, `scheduler`, `web` (`vllm` conditional — B4). **On the host:** agent CLIs and DR-179 CLI relays (relays are not Hatchet workers; containerizing one puts V's subscription credential into an image/volume/env — the exact prohibited surface); Hermes on 9119 (board custody, and a compose `down` would take the board down mid-mission); test runners; the Docker engine itself. **`replay`** is a separately-scheduled one-shot with its own read-only credential — container-expressible, never a `depends_on` of the stack. **`evaluator-worker`** and **`apps/ui`** must not be smuggled into the claim. | `[O]`B2 `[G]`B2 `[C]`B2 |
| **B3** | **CONTESTED 2–1 → OPEN-V (V-2)** | `[O]` and `[G]` rank **local-dev only** first, production as a later slice bound by ADR-0018. `[C]` ranks **local-dev slice + a production-*target* slice inside this mission** first, and treats local-only as "acceptable only by V decision". All three agree deferring production must not drop Hetzner/Cloudflare, one-front-door, pins, co-tenant, or credential separation. Quoted in §3.1. | `[O]`B3 `[G]`B3 `[C]`B3 |
| **B4** | **AGREED** to split; **CONTESTED/OPEN-V** on what may then be claimed (V-8) | All three: `vllm` moves behind an explicit hardware-gated profile; the required-bar `up` does not start it; no required service `depends_on` it; production/ADR still lists it; GPU/platform/model/cache requirements are preflighted and recorded, not guessed. Whether the pinned CUDA image runs on this `darwin/arm64` host is **UNVERIFIED by all three seats**. The disagreement is about the *label* — see §3.2. | `[O]`B4 `[G]`B4 `[C]`B4 |
| **B5** | **Invariants AGREED; the ruled-law reading is CONTESTED → V-4** | Agreed invariants: no ambient probe may decide the store; the Postgres major comes from the register loader on every path (no Dockerfile `FROM postgres:…`, no compose literal as a second version source); test stores and the deployment store are **disjoint** (no shared volume, no compose-DNS reachability); no test may require the stack and no stack service may `depends_on` anything test-scoped; **Hatchet must never be silently skipped** — a dispatch test either uses the existing narrow seams or fails loudly, never a conditional skip keyed on engine reachability. Contested: whether Testcontainers is the *standing* law right now. §3.3. | `[O]`B5 `[G]`B5 `[C]`B5 |

## 2.3 Section C — Hatchet as dispatcher

| RQ | Status | Synthesis (one line) | Citations |
|---|---|---|---|
| **C1** | **AGREED** — three near-identical restatements | **MAY own:** assignment (which worker attempts now), redelivery, assignment timeouts, worker lifecycle, child-task fan-out, time-triggered dispatch, and its own record of dispatch. **MUST NOT own:** the claim (`core.work_item` claim-before-call via `FOR UPDATE SKIP LOCKED`, committed before any model call — assignment authorizes an *attempt*, the claim authorizes *the call*); the ledger (a dashboard is not an audit trail); `at_seq`; run state; claim expiry (ours, via the reaper); model artifacts (gateway writes them); the retry budget (register values under DR-020 caps — one budget, not two, no numeral in engine config); a second durable store; joins across the co-tenant boundary. | `[O]`HR-1..11 `[G]`C1 `[C]`REQ-C1-01..07 |
| **C2** | **AGREED — strongest triangulation in the mission** | Minimum wiring = `api` dispatcher + `runner` worker + dispatcher control plane on one internal network sharing token, tenant, engine address, **workflow name** and TLS posture. Exactly **one** worker registers today (`apps/runner`); no other app is or may become a Hatchet worker in this mission. Proof = the MB-9 triple, and none of the three alone suffices. | `[O]`C2 `[G]`C2 `[C]`C2 |
| **C3** | **AGREED** that lite-only ≠ ADR-0018 compliance; **CONTESTED** on the service name → V-3 | Agreed: lite MAY stay for dev under five conditions (Postgres messaging, no RabbitMQ in the rendered config, digest-pinned, dev-only insecure flags structurally unable to reach production, the lite-vs-production composition difference written down); lite-only is a false ADR-0018 claim; and **`SERVER_GRPC_BROADCAST_ADDRESS: localhost:7077` is wrong for a containerized runner** — an in-compose worker resolves `localhost` inside its own container. Contested: whether to rename the service to `hatchet-engine`. §3.4. | `[O]`C3 `[G]`C3 `[C]`C3 |
| **C4** | **AGREED**; minor CONTESTED on the exception mechanism | The check runs on the **rendered/resolved** configuration (after every `-f`, override, `extends:`, `include:`, interpolation and profile), not the source file — a copy-paste acquires the service through exactly the layer a source-file check cannot see. It fails on: any `rabbitmq` (case-insensitive) in service key/image/dependency/hostname/env key or value/command/URL/volume; any `amqp://`/`amqps://`; any published or exposed **5672/15672**; and — **positively** — `SERVER_MSGQUEUE_KIND` **unset, empty, or ≠ `postgres`**. It is **blocking**, in the same gate as `pnpm lint`, fails closed on an unparseable/absent config, and prints the offending path. `[C]` additionally requires the check's own fixture to demonstrate RED against a **renamed** vendor-style broker and GREEN against today's config. | `[O]`R-C4.1-6 `[G]`C4 `[C]`REQ-C4-1 |
| **C5** | **AGREED** on three roles; **CONTESTED** on co-residency | Agreed: three **real Postgres principals** with the §5.5.0 grants, one per named job, injected as three distinct references — a shared admin/superuser URL exported under three names satisfies the shape and destroys the property; no shared `env_file`, YAML anchor, or `extends:`-inherited environment may carry any of the three; `apps/replay` is a **fourth**, read-only-full-stop principal supplied at invocation (its CLI already takes the URL as argv); image reuse is permitted, credential reuse is not; rendered evidence proves distinctness without printing values; **runtime receipts must include the negative** — each principal denied representative writes from the other two scopes (positive-only checks pass under a shared superuser). Contested: whether one container may hold all three secrets. §3.5. | `[O]`R-C5.1-8 `[G]`C5 `[C]`REQ-C5-1..4 |

### C2 — additions each seat contributed alone (all merged as requirements)

- **SR-C2.1 (`[O]` R-C2.2) — preserve fail-fast.** The loader is `.strict()` at module load;
  a missing or malformed key throws **before** the server listens or the worker registers, so
  the container exits non-zero and the health check never goes green. **No Dockerfile `ENV`
  default, no compose `${VAR:-default}` fallback, and no `try/catch` may be introduced to
  make a half-wired container start.**
- **SR-C2.2 (`[O]` R-C2.3) — one workflow name, one source.** `HATCHET_WORKFLOW_NAME` must be
  byte-identical in `api` and `runner`, emitted **once** and injected into both. If they
  differ, `api` enqueues into a workflow nothing is registered for, **neither side errors**,
  the ask returns its non-blocking 202, and work silently never runs. Named by `[O]` as the
  most likely silent failure of the whole mission.
- **SR-C2.3 (`[O]` R-C2.4) — the `api` container must run the real dispatcher.** Not any
  acceptance entrypoint: `acceptance/main.ts` defines an in-process `AcceptanceDispatcher`
  and its README states the acceptance environment contains no Hatchet keys. A stack that is
  green because it booted the acceptance harness has proven nothing about Hatchet.
- **SR-C2.4 (`[G]` C2, vendor-cited) — the broadcast address and the token are coupled.**
  Vendor self-host docs state that an in-network worker must dial the engine's container
  hostname rather than `localhost`, **and that changing the broadcast address requires
  re-issuing the API token**. This makes C3's live blocker a two-part change and feeds
  directly into the D2 collision (§4, and Grok's E4-c in §2.6).
- **SR-C2.5 (`[C]` REQ-C2-3) — if Hatchet ever schedules the scheduler jobs**, the
  registration/execution design must preserve C5's three credential scopes rather than
  absorbing them into the runner credential. (Out of scope for this mission: `[O]` R-C2.1 —
  this mission must not add a second worker.)
- **Vendor-name mismatch (`[G]`, flagged not resolved).** Our loader keys are `HATCHET_*`
  and are passed as SDK **constructor overrides**; the vendor's documented worker env names
  are `HATCHET_CLIENT_*`. `[G]`'s own strongest counter-argument is that treating our names
  as the contract will confuse anyone copying current vendor docs. Architecture must decide
  how the two name spaces are documented; AC-74 says the **values** come through the register
  loader either way.

## 2.4 Section D — isolation from the live security mission

| RQ | Status | Synthesis (one line) | Citations |
|---|---|---|---|
| **D1** | **AGREED** on the classes; **CONTESTED** on two path classes | Agreed rule: a path with a live foreign writer is forbidden; if a needed path is inside another live mission's contract, post `BLOCKED` and escalate — do not widen. `[C]` and `[O]` independently converge on the enforcement shape: **exact files, not directory globs**, declared before the PROGRAMMING loop, with foreign ownership **fresh-read immediately before each edit phase**. Full classes in §4. Contested: `packages/register/src/compose-env.ts` and `tests/**`. §3.6. | `[O]`D1 `[G]`D1 `[C]`D1 |
| **D2** | **AGREED — unanimous, and the strongest agreement in section D** | This mission **must not edit `compose.dev.yaml` in place** while `accounts-phase1`/S3d is live. Default is a **sibling compose file** that composes with or includes it, leaving the base byte-unchanged. All three cite the same collision material: `POSTGRES_PASSWORD: debateai-dev-only`, `SERVER_AUTH_COOKIE_INSECURE`, `SERVER_GRPC_INSECURE`, published `8888`/`7077`/`8000`, `localhost` cookie/broadcast addresses. `[C]` allows an exception only under an explicit **fresh ownership clearance naming the file**; `[O]` and `[G]` prefer BLOCKED-and-escalate. The split must record its **expiry condition** (the security mission closing) so it is merged back rather than becoming permanent. | `[O]`D2 `[G]`D2 `[C]`D2 |
| **D3** | **AGREED** | Command = the **existing published entry point**; **no new entrypoint file inside `apps/**`** (a wrapper, if needed, lives under `deploy/`). Build context = **workspace root**; per-app contexts are forbidden. Inject every currently-required loader key at runtime; bake none into a layer; rename none; log none. Secrets arrive as **mounts, never layers**. `API_HOST` binds a container-reachable interface (`0.0.0.0`); only the approved front door is published; `web`→`api` uses compose DNS. **Identity/auth code is byte-for-byte untouched** — if the image cannot boot without editing it, that is a freeze collision → `BLOCKED`, not a patch. Neither the `PUBLIC_APP_URL` `https://` refine nor the dev-menu guards may be relaxed to make a container start. | `[O]`D3 `[G]`D3 `[C]`D3 |

### D3 — five Opus-only requirements with named mechanisms

`[G]` and `[C]` state the same principles; `[O]` supplies the specific live-tree mechanisms.
All five are carried forward.

- **SR-D3.1 — `USER_DEK_STORE_PATH` must be a named volume that survives `down`.** It is a
  directory tree with mode semantics (`0700` dirs, `0600` `dek.v1.json`, per
  `packages/crypto/SECRET_STORE_LAYOUT.md`, read-only). **Losing it destroys every user's
  wrapped DEK — crypto-shredding by accident, unrecoverable.** The container **adapts to**
  the documented layout and must not relax the modes "to make it work"; this mission changes
  no file under `packages/crypto`. (This is MB-6's teeth.)
- **SR-D3.2 — the workspace-root build context is forced, not preferred.**
  `apps/runner/src/main.ts` imports `loadKek` by the relative path
  `../../../packages/crypto/src/index.js` while `apps/runner/package.json` does not declare
  the dependency. A per-app context cannot resolve it, and normalizing the import would edit
  a runner file whose target is the **frozen** crypto boundary. A `.dockerignore` (a new
  file, no writer) is what then keeps `node_modules`, `.pgdata*` and `.next` out of the image.
- **SR-D3.3 — `MAIL_SENDMAIL_PATH` is validated only as a non-empty string.** A container
  with no sendmail binary **boots fine and fails only when a registration email is sent**.
  Either the image provides a sendmail-compatible executable at that path, or `deploy/`
  **records** that registration mail is non-functional in the containerized dev stack —
  recorded, never discovered. **Do not "fix" it by editing `mail-channel.ts`**: that file is
  dirty and foreign.
- **SR-D3.4 — `web`'s API base must be explicit.** `web/lib/serverApi.ts` defaults to
  `http://127.0.0.1:8000`, which inside a container points at the **web container itself**
  and on the host **collides with `vllm`'s published 8000**; the route handler throws
  `DIALECTICAL_API_BASE_REQUIRED` if unset and `NEXT_PUBLIC_API_BASE` throws on a
  non-same-origin value. `DIALECTICAL_API_BASE` is set explicitly to the `api` service DNS —
  never relied on by default, never `host.docker.internal`.
- **SR-D3.5 — exactly one `web`.** `apps/ui` and `web` both hardcode `-p 3000`; only `web` is
  a ruled unit. Exactly one is containerized as the `web` service and the other is not
  started by the same compose invocation. Which one is V's (V-7 / `[G]` E4-a / `[O]` E8).

Also **`[O]` R-C5.8 / `[G]` D2, agreed:** do **not** change `POSTGRES_PASSWORD: debateai-dev-only`.
It is cited by live security research; changing it is a collision, not a hardening win for
this mission.

## 2.5 Section E — the brief's four ids

| RQ | Status | Synthesis (one line) | Citations |
|---|---|---|---|
| **E1** — enable Docker CLI / start Docker Desktop now? | **OPEN-V (V-1)** | All three agree the seat must not do it silently (intake classifies it an IMPORTANT OPERATION) and that no honest "containerized" claim exists until it is done. They differ only on **timing**: `[O]` V enables now; `[C]` authorize at the programming preflight with the exact A5 receipt and no persistent change beyond V's authorization; `[G]` defer to the first programming ticket unless V wants a same-day coding seat. | `[O]`E1 `[G]`E1 `[C]`E1 |
| **E2** — production Hetzner compose in this mission? | **OPEN-V (V-2), CONTESTED 2–1** | `[O]`/`[G]`: local-dev only, production a named successor still bound by ADR-0018. `[C]`: local slice **plus a production-target (static config) slice** before mission closure, with live cloud deployment separately V-gated. §3.1. | `[O]`E2 `[G]`E2 `[C]`E2 |
| **E3** — is `apps/evaluator-worker` an ADR-0018 unit? | **OPEN-V (V-6), unanimous recommendation** | All three: **exclude it from this mission**. It is not a process (no `scripts`, no `main.ts`, only a library exporting `EVALUATOR_TASK_FAMILIES`), and it is absent from ADR-0018's seven and from `03-module-design.md` §1.3's service map. You cannot containerize a library. It stays V-owned because ADR-0018's list is V-ruled (DR-117). | `[O]`E3 `[G]`E3 `[C]`E3 |
| **E4** — anything else | **Filled differently by each seat** | The brief's "add or strike with evidence" slot: `[O]` expanded it into **E4–E9** (six distinct questions), `[G]` into **E4-a…E4-e** (five), `[C]` used E4 for a single vLLM-deferral question. None are dropped — §2.6 lists them and §5 rules on which are V-owned. | §2.6 |

## 2.6 Extra RQ ids invented by seats — listed, not dropped

Per the synthesis contract. The right-hand column records where each lands.

| Seat id | Question | Disposition |
|---|---|---|
| `[O]` **E4** | Does V's 2026-08-21 prompt supersede **DR-121 / DR-121-r**, and *how much* of them? Both rows are marked **ACTIVE** ("for now we do not install anything from the Docker family… hatchet-lite dev-compose stays AUTHORED-DORMANT… every container-dependent fixture [is] DEFERRED BY RULING"; "just defer docker and hatchet for now"). The row has two separable clauses, so "obviously lifted" is not precise enough to act on. | **→ V-4.** V-owned: superseding a V ruling is V's act. Neither `[G]` nor `[C]` raised the supersession question; `[G]` cites DR-121 as the reason the test store is embedded; `[C]` does not mention it at all, which is why `[C]`'s B5 reads Testcontainers as current standing law. |
| `[O]` **E5** | Service name: rename to `hatchet-engine` (keeping the lite image in dev), or keep `hatchet-lite` and record an alias? | **→ V-3.** Kept as V-owned: it moves a key in a ruled artifact's pin inventory and changes whether ADR-0018 compliance is a string comparison or a judgement call. **`[G]` directly contradicts `[O]`'s recommendation** — §3.4. |
| `[O]` **E6** | Digest-pin `postgres`, against §5.4c's "exact digests, never floating tags"? | **→ V-5.** V-owned: resolving a digest **mints a value**, and values are V's (AC-76 / DR-023) resolved on the machine under DR-104. `[O]` flags that reading §5.4c as binding `postgres` is **his own extension** — §5.4c classifies `vllm` and `hatchet-engine`. `[G]` and `[C]` both push back. |
| `[O]` **E7** | Is `web`'s `/api/[...path]` reverse proxy the second path AC-60 forbids, or the sanctioned SSR forwarder? ADR-0018 clause 1 says *"no `/api/*` proxy inside `web`"*; the route exists today. | **→ V-9.** V-owned AC-60 ruling question. **Opus-only finding.** The condition **predates this mission**; the requirement here is only that containerization must not **deepen** it. |
| `[O]` **E8** / `[G]` **E4-a** | `apps/ui` vs `web`: which is the ruled `web` unit; is the other retired, a second UI, or the demo surface? | **→ V-7.** V-owned module-inventory question. Both seats recommend containerizing `web` and not starting `apps/ui` in the same invocation; both name the same risk — the port-3000 collision means a wrong pick is not noticed until both are started together. `[G]`'s counter is sharper: *"`apps/ui` is where the live debate canvas actually is; containerizing `web` could ship an empty/kept shell."* |
| `[O]` **E9** / `[C]` **E4** | Does the required bar include a **real model call** from inside the compose network — and may a stack that never makes one be called "the app, containerized"? | **→ V-8.** V-owned: it is the boundary of what V's word "containerize the app" means. `[O]` adds the constraint that makes it hard: DR-179 keeps model access exclusively on host CLI relays, relays are not Hatchet workers, and `vllm` is the only in-compose provider — so a fully-containerized runner may have **no lawful in-network way to make a real call**. |
| `[G]` **E4-b** | `job:reaper` (ruled name) vs `job:liveness-sweep` (live script): rename, or containerize the live CLI with the reaper credential scope? | **→ V-7.** Also **CONTESTED** as a requirement — §3.7. |
| `[G]` **E4-c** | May local compose keep broadcasting gRPC on `localhost:7077` while `runner` is on the host, switching only when `runner` moves into compose — given that the switch touches a security-cited file and forces a token re-issue? | **DEMOTED to ARCHITECTURE, with a trigger.** §4's rule already governs: no in-place edit of `compose.dev.yaml`; if the change cannot be expressed additively, `BLOCKED` and escalate. It becomes a V row **only if** the verification in §4 (SR-D2.4) shows a sibling file cannot override an existing service's env key — then V chooses serialize-vs-exception. |
| `[G]` **E4-d** | Postgres digest pin — is major `18` the semantic pin, or does V want an exact digest? | **→ V-5** (merged with `[O]` E6). |
| `[G]` **E4-e** | Hatchet token provisioning for local dev: may the repo document the vendor default UI credentials, or must a non-default token be minted? Never commit `HATCHET_CLIENT_TOKEN`. | **→ V-10** (merged with `[O]` R-C5.7's DR-179-scope reading). |
| `[C]` **E4** | May full local acceptance defer vLLM to a compatible host, withholding the "full app containerized" label until vLLM passes? | **→ V-8** (merged with `[O]` E9). |

---

# 3. Contested rows, quoted

Where the seats disagree, both readings stand. Nothing below is averaged.

## 3.1 B3 / E2 — scope of this mission (2–1)

> `[O]` RQ-B3: **"local-dev compose is the requirements-complete bar for THIS mission;
> production Hetzner/Cloudflare is a later slice that must not contradict ADR-0018.
> Confidence: high."** Reasons ranked: DR-121/DR-121-r are still ACTIVE rows and no container
> has ever been built here; production has **no inputs in the tree** (`grep -rli
> "hetzner\|cloudflare"` over `deploy/`, `compose.dev.yaml`, `package.json` → **no hits**;
> `deploy/` contains exactly two files); and every production artifact touching secrets,
> ports or TLS is adjacent to what the live security mission is actively deciding.

> `[G]` RQ-E2: **"Option 1 [local-dev complete this mission]. Production-only is untestable
> here until RQ-E1 and a Hetzner host exist. Both-in-one fights the compose freeze (RQ-D2)
> and the lite vs engine split (RQ-C3)."**

> `[C]` RQ-B3: **"Preferred: one mission with a local-dev executable slice first and a
> production-target slice before mission closure… The production slice proves the resolved
> target topology, non-insecure settings, exact pins, one Cloudflare-facing API origin,
> private internal services, and separately injected credentials. A live Hetzner/Cloudflare
> deployment remains an important operation and is not implied by static config proof."**
> `[C]` explicitly demotes the other two seats' answer to **"Acceptable only by V decision:
> local-dev is mission-complete and production is a named successor mission."**

**What separates them:** `[C]`'s production slice is a **static, resolved-config proof**, not
a deployment — which removes `[O]`/`[G]`'s "untestable without a host" objection, but not
`[O]`'s "adjacent to the live security mission's decisions" objection.

**What would settle it:** V's answer to V-2 alone. This is a scope decision, not an evidence
question, and no further research changes it.

**What all three agree on regardless of the answer** (`[O]` R-B3.1, `[C]` REQ-B3-2, `[G]` B3.2):
deferring production must not drop ADR-0018's clauses, and the dev slice must be
**production-shaped** — same ADR-0018 service names, same env contract, with production
differing only in published ports, TLS strategy, the insecure dev flags, image build-vs-pull,
and secret sourcing. `[O]`: *"If production needs a different service shape, the dev slice was
mis-designed."* And no local-dev acceptance may be **labelled** ADR-0018 production
compliance (MB-11).

**The cost of the majority answer, stated by its own proponent** (`[O]`, strongest counter):
> *"deferring production means the clauses ADR-0018 spends most of its text on — AC-60 through
> a proxy, SSE buffering, Cloudflare-as-transport-not-policy — are **never exercised**, and
> those are exactly where the ADR predicts the incident."*

## 3.2 B4 — vLLM: split agreed, the label contested

All three split it. They differ on what the resulting pass may be **called**:

> `[C]` REQ-B4-1/2: **"vLLM SHALL remain required for full ADR/profile and end-to-end local
> provider claims. Local base-container work MAY use an explicit hardware-gated profile that
> omits vLLM, but its result SHALL be labelled 'control-plane/app containers ready — provider
> proof pending,' never 'full app containerized.'"** The successor vLLM proof stays
> **blocking and explicitly owned**.

> `[O]` R-B4.3 + E9: with `vllm` off, `deploy/` **must state plainly that no real model call
> occurs** and no seat may describe the stack as "running debates" — but whether the bar
> *itself* includes a real model call is routed to V, because DR-179 may leave a fully
> containerized runner with no lawful in-network way to make one.

> `[G]` B4: split, high confidence for "do not block local-dev on GPU vLLM"; strongest
> counter: **"ADR-0018 lists `vllm` as a first-class service, so a 'containerized' claim that
> never exercises it is already a false claim against the ruled topology."**

**Settled by:** V-8. Requirements can and do close the *disclosure* half (MB-11), and have.
Requirements cannot close whether "containerized" means "can answer a question".

**Still UNVERIFIED by all three seats:** whether `vllm/vllm-openai@sha256:ffb2d59b…` publishes
an `arm64` variant or runs without a CUDA GPU on this `darwin/arm64` host. Verified by
`docker manifest inspect` on the pinned digest plus an attempted profiled `up`, after V-1.
`[C]` cites vendor docs that the official CUDA path requires the NVIDIA runtime and
`--gpus all`, and warns that experimental Apple-Silicon paths are **not** proof that *this
pinned image* runs here. The target Hetzner host's GPU is likewise unknown.

## 3.3 B5 — which test-store law is standing

> `[C]` REQ-B5-1: **"Testcontainers and app Compose SHALL use the same ruled Postgres major
> and the same migrations/invariants"** — written from `06-test-strategy.md` / ADR-0012 as
> current law. `[C]` does not mention DR-121 anywhere.

> `[O]` R-B5.2: **"Flipping the default is a RULING, not a refactor. DR-121 is ACTIVE."** Live
> tree: `startTestDatabase()` calls `startWithEmbedded(...)` unconditionally,
> `startWithTestcontainers(...)` is unreachable, `selectPrototypeDatabaseMechanism()` returns
> the constant `{mechanism:"embedded-postgres", testcontainersStatus:"DEFERRED BY DR-121"}`,
> and `tests/unit/test-database-policy.test.ts` asserts it *"without probing a Docker-family
> runtime"*. **`[O]` recommends leaving it untouched: "the containerization claim does not
> need the test store to change."**

> `[G]` B5: states the ADR-0012 law **and** the DR-121 live reality, and phrases the
> requirement conditionally — **"When DR-121 is lifted and Testcontainers becomes ACTIVE, the
> image remains `postgres:${postgresMajorVersion}` from `loadBootstrapRegister()`."**

**Synthesis:** `[G]`'s conditional phrasing is the merge. The invariants in §2.2 B5 hold under
**either** mechanism and are AGREED. The **flip** is V-4, not a requirements finding. Two
independent reasons reinforce `[O]`'s conservatism and both are live-tree facts:
`tests/**` is in neither this mission's `allowed` nor its `readonly` list, and — per `[O]`'s
git evidence in §4 — `tests/**` has a **live foreign writer** right now.

`[O]`'s own strongest counter, kept: leaving clause (1) alive means `06-test-strategy.md`
stays out of step with the tree, *"an inconsistency that a reviewer will reasonably read as an
incomplete containerization."*

## 3.4 C3 — `hatchet-lite` vs `hatchet-engine`: a direct contradiction

> `[O]` R-C3.1: **"Name the service `hatchet-engine`… Let the service name be `hatchet-engine`
> and the image be the lite distribution in dev."** Rationale: ADR-0018's service table is what
> a compliance check reads; `hatchet-lite` makes "does this match ADR-0018?" a judgement call
> instead of a string comparison. Medium-high confidence, routed to V.

> `[G]` C3: **"Renaming the lite container `hatchet-engine` while still using the
> `hatchet-lite` image is also a false claim."** `[G]` fetched vendor docs showing lite and the
> production compose are different images, different service names, different control-plane
> shapes (lite = one image, UI `8888`, gRPC `7077:7077`; production = `hatchet-engine` +
> `hatchet-dashboard` + `hatchet-migrate` + `hatchet-admin`, dashboard `8080:80`, gRPC
> `7077:7070`). High confidence.

> `[C]` REQ-A1-1: **"A differently named local substitute SHALL be called out as such, not
> counted as silent proof of the ruled production unit,"** and REQ-C3-2 requires production to
> prove the ADR-named engine's control-plane, migration and dashboard surfaces. `[C]` marks as
> **UNVERIFIED** whether the pinned lite digest is vendor-supported for production or exposes
> all the migration/dashboard behaviour ADR-0018 expects.

**Two-thirds lean against the rename**, and `[O]` anticipated exactly `[G]`'s objection in his
own counter-argument (*"the name `hatchet-lite` honestly signals that dev runs an all-in-one
distribution; renaming it hides a real difference behind a compliant label"*). **Not averaged:**
V-3 decides. What would inform V: `[C]`'s version-specific vendor audit of the pinned lite
digest, which no seat could perform without Docker.

**Agreed regardless of the name** — and this is the load-bearing part:

- **SR-C3.1:** lite MAY remain the **local** dispatcher image under all five conditions
  (Postgres messaging; no RabbitMQ in the rendered config; digest-pinned; the dev-only
  insecure settings structurally unable to be inherited by a production file; the
  lite-vs-production composition difference written down in `deploy/`).
- **SR-C3.2:** **lite-only is a false claim of ADR-0018 compliance.** Three ways to make it
  false (`[O]` R-C3.3): claiming the ruled topology is deployed when production has never been
  described; presenting the all-in-one composition **as** the `hatchet-engine` row without
  recording that production needs a different composition; letting `SERVER_GRPC_INSECURE=true`
  or a `localhost` broadcast address reach anything Hetzner-facing.
- **SR-C3.3 — the live blocker, triangulated.** `SERVER_GRPC_BROADCAST_ADDRESS: localhost:7077`
  is the address the engine hands clients as "where to reach me". Correct for a **host**
  worker on a published port; **wrong** for a containerized `runner`, which resolves
  `localhost` inside its own container where nothing listens. `[O]` derived this from what the
  key means and marked it UNVERIFIED-by-execution; **`[G]` independently confirmed it against
  vendor docs**, which further state the change **requires re-issuing the API token**. `[C]`
  states the same requirement (REQ-C3-1: "Container-to-container addresses SHALL be internal
  service addresses, not `localhost`"). Treat as verified-by-two-sources at the documentation
  level; still unexecuted.

## 3.5 C5 — credential co-residency

> `[O]` R-C5.1: **"No single container may hold more than one of the three connection
> strings."** The code reads one, but `process.env` in that container would *contain* all
> three, so one `scheduler` service carrying all three defeats §5.5.0 **at the injection
> layer regardless of what the code does**. Three separate injection contexts, one credential
> each; whether that is three services, three profiled one-shots, or three host-scheduled
> `compose run` invocations is architecture's call.

> `[G]` C5.3: **"A container that holds all three secrets is allowed only if each *invocation*
> still uses exactly one (current CLI shape). A single long-running scheduler daemon that
> opens all three pools at once is not forbidden by today's code, but it must still present
> three roles, not one."**

> `[C]` REQ-C5-1 + counter: a shared admin URL with an in-process "mode" flag **fails**; a
> single scheduler container switching credentials per subprocess **"is harder to audit and
> risks making all three secrets simultaneously available; it must meet the same non-sharing
> and exposure proofs to be accepted."** `[C]` recommends separate invocations/services from
> one image.

**The disagreement is precisely whether §5.5.0's property is about *which role is used* (`[G]`)
or about *what is reachable from the process* (`[O]`), with `[C]` between them and leaning
`[O]`.** `[O]`'s own counter is that §5.5.0 says the three jobs *"share a process"* — but he
answers that this describes the **module**, not the runtime container.

**What would settle it:** an architecture ruling on whether the credential separation is an
exposure property or a usage property. Both readings satisfy `[C]` REQ-C5-3's negative
permission receipts, which are AGREED and are the check that actually catches a collapsed
superuser.

## 3.6 D1 — two path classes the seats do not agree on

**(a) `packages/register/src/compose-env.ts`.**

> `[O]` D1 "MAY EXTEND": **"the lawful home for compose constants"** (§1.3: a container env var
> is still a constant and must come through the register), with the caution that
> `packages/register/src/auth-policy.ts` is a live security-WIP file **in the same package** —
> same package ≠ same file, so one-writer-per-file permits it, but no package-wide refactors,
> formatters, or import reorganizations.

> `[C]` D1: **"Read-only by default: current app entrypoints and
> `packages/register/src/runtime-environment.ts`; containerization should consume their
> contracts rather than refactor them"**; extension of "image-pin/bootstrap carriers" is
> allowed **only under an explicit exclusive lane contract**.

> `[G]` D1: `packages/**` is readonly for this seat; the may-extend class names
> `compose.dev.yaml` and `deploy/**` only — `compose-env.ts` is **not listed**.

**Why it matters:** SR-A4.1, SR-A4.2, SR-C2.2 and `[O]` R-B4.2 all require compose constants
to be **emitted by `pnpm compose:env`**, which is a write to `compose-env.ts`. If architecture
does not obtain that path class, either those requirements cannot be met lawfully, or the
constants become compose literals — the exact AC-74 defect §1.3 names.
**Requirement:** architecture must either obtain explicit exclusive ownership of
`compose-env.ts` (naming the file, not the package) **or** name a different lawful home for
register-sourced compose constants. It may not resolve this by writing literals.

**(b) `tests/**`.** `[O]` places it in **MUST NOT TOUCH** — not in this mission's `allowed`
*or* `readonly` list, and (per §4) actively dirty. `[C]` and `[G]` both contemplate test work
(compose-integration acceptance gates, dispatch tests). **Merge:** the *bar* may require
evidence that today's tests do not silently change behaviour (§2.2 B5 invariants), but
**writing under `tests/**` is a path class this mission does not hold**. If architecture
concludes a test file must change, that is a contract request, not a refactor.

## 3.7 A2 / C5 — the `job:reaper` consequence

> `[C]` REQ-A2-2: **"the scheduler cannot be accepted until all three ruled jobs have
> runnable, published entry points; the present liveness-sweep/reaper mismatch SHALL fail that
> check."**

> `[O]` R-C5.5: **"`job:reaper` must not be scheduled."** `runReaper` throws
> `S00_SCAFFOLD_ONLY`; scheduling it produces a crash-looping container that reads as a Docker
> defect. Its **credential should still be provisioned** so the later slice needs no
> deployment change, and `deploy/` records that AC-89's write half does not fire here.

> `[G]` E4-b: **"containerize the live CLI (`liveness-sweep`) with the reaper *credential
> scope*; V (or architecture) must say whether to rename. Not a silent alias."**

**The conflict is real:** `[C]`'s rule blocks the scheduler service from ever passing this
mission's bar (the stub belongs to a later slice, so nothing this mission may lawfully do
would clear it); `[O]`/`[G]` containerize what exists and disclose the gap. **Not averaged.**
→ V-7, with the disclosure requirement (MB-11 iii) holding under either answer.

---

# 4. Hard constraints carried forward, and the collision / file-contract rule

## 4.1 Standing law — restated as constraints, not reopened

Requirements may restate these; nothing in this mission re-argues them. Reopening any of them
is a stop condition per intake.

| Constraint | Effect on this mission |
|---|---|
| **DR-117 / ADR-0018** — Docker Compose on Hetzner behind Cloudflare; services `web`, `api`, `runner`, `scheduler`, `hatchet-engine`, `postgres`, `vllm` | The seven names are the inventory (MB-2). Deferring production does not drop the clauses (§3.1). No Kubernetes, no managed Hatchet Cloud, no Inngest. |
| **DR-118 / ADR-0017** — self-hosted Hatchet, Postgres-first (`SERVER_MSGQUEUE_KIND=postgres`), **dispatcher only** | §2.3 C1's full ownership boundary. No engine comparison, no second durable store, no managed control plane. |
| **RabbitMQ OFF** until measured need; enabling it is a recorded **law-6 exception** | §2.3 C4's rendered-config check, including the positive assertion that the key is present and `postgres`. |
| **AC-60** — one transport front door (`apps/api`); no privileged bypass, no second origin | Only the approved front door is published (SR-D3.4). The pre-existing `web` `/api/*` proxy question is **V-9**; this mission must not deepen it. |
| **AC-02 / one store** — one Postgres instance; Hatchet's database is a **co-tenant**; no V3 joins across the boundary | Moving the engine's database to a second instance requires a **new human ruling**, never a deploy-time capacity judgement. Test stores stay disjoint from the product store (§2.2 B5). |
| **DR-179 HOLD** — no API keys; CLI relays are the lawful model-call mechanism; **relays are not Hatchet workers** | Relays stay on the host (§2.2 B2). Containerizing one would put V's subscription credential into an image, volume, or env var. Feeds V-8 and V-10. |
| **DR-188** — no product/database deletion | MB-7: the documented stop path deletes no volume. |
| **Port 9119** — Hermes dashboard, always, never overridden | Hermes stays on the host; MB-5 requires it to keep answering while compose services restart. |
| **AC-74 / AC-76 / §5.4c / §1.3** — register discipline; exact digests never floating tags; **"a value injected as a container environment variable is still a constant"** | MB-8; SR-A4.1/A4.2; SR-C2.1/C2.2; no Dockerfile `ENV` default and no compose literal may become the **source** of a register-governed constant. |
| **Freeze** — identity, registration, MFA, sessions, crypto shredding, `packages/crypto/**`, identity migrations `0030+`, the `2026-08-17-*` mission trees; boards `accounts-phase1`, `accounts-phase4`, `debateai-v3`, `dialectical-engine`, `model-evaluator` | §4.2. Byte-for-byte untouched; a required edit is a `BLOCKED` escalation, never a patch. |

## 4.2 The collision rule (section D), stated so a coding seat can honor it

**The finding that changes the enforcement mechanism — Opus-only, and neither other seat
found it.** From the git root (`/Users/vladmihaimiron/Documents/DebateAIRO`), `[O]` verified:

- only **141 files** under `dialectical-engine/` are tracked by git;
- **`compose.dev.yaml` is not tracked** (`git ls-files --error-unmatch` → not known to git)
  **and not ignored** (`git check-ignore -v` → no match) — it was simply never added. The
  same holds for `deploy/**`, `apps/runner/src/index.ts`, `apps/scheduler/**`,
  `apps/replay/**`, `apps/evaluator-worker/**`, and most of `packages/**`;
- the **tracked-and-dirty set is exactly the security mission's write set** — seven files,
  **three of them under `tests/`**: `apps/api/src/mail-channel.ts`, `apps/api/src/registration.ts`,
  `packages/db/src/identity.ts`, `packages/register/src/auth-policy.ts`,
  `tests/integration/identity-database.test.ts`, `tests/integration/registration-database.test.ts`,
  `tests/unit/registration.test.ts`;
- `dialectical-engine/Makefile` is tracked but deleted in the working tree, so **there is no
  one-command dev lifecycle on disk today**.

**SR-D1.1 — one-writer-per-file cannot be adjudicated by `git diff` for the paths this
mission most needs.** A coding seat that "checks the diff" sees its own new files and does
**not** see whether it overwrote a sibling mission's untracked edit to `compose.dev.yaml`.
Therefore the contract is a **declared path-class manifest with exact files**, recorded in
this mission's directory **before** the PROGRAMMING loop; a write outside it is a breach
regardless of what the diff shows. (`[C]` REQ-D1-1 converges independently: *"H6 SHALL assign
exact files, not only directory globs, and SHALL fresh-read foreign ownership immediately
before each edit phase."*)

**SR-D1.2 — re-check, do not snapshot.** The dirty set above is a 2026-08-21 snapshot; the
security mission will dirty **new** files mid-mission. Every PROGRAMMING ticket re-runs
`git status --porcelain` at claim time and treats every dirty tracked file as foreign until
proven otherwise.

### Path classes

**MAY CREATE** (no existing writer): `Dockerfile*`, `.dockerignore`; a **new sibling compose
file**; new files under `deploy/**`, including container entrypoint / wait scripts — **never
under `apps/**`**; anything under `docs/missions/2026-08-21-docker-hatchet/**`.
`[C]` adds: new containerization-owned deployment assets under a new `deploy/` subtree, and
build files colocated with the ruled units — colocation is architecture's call **provided**
SR-D3.6 below holds.

**MAY EXTEND** (only for containerization of already-ruled services, and only when no live
foreign writer holds the file, verified at claim time): `deploy/IMAGE-PINS.md` (additive rows
only); root `package.json` **scripts only** — if it is dirty at ticket time, post `BLOCKED`
rather than edit; image-pin / bootstrap carriers **under an explicit exclusive lane contract**
(`[C]`). **`packages/register/src/compose-env.ts` is CONTESTED — §3.6(a); architecture must
obtain it explicitly by name or nominate another lawful home.**

**MUST NOT TOUCH:** the seven dirty files above; `packages/crypto/**` including
`SECRET_STORE_LAYOUT.md`; `migrations/0030_identity_foundation.sql` and later identity/auth
migrations; `migrations/pending/**` belonging to that mission;
`docs/missions/2026-08-17-accounts-privacy-security/**` and
`docs/missions/2026-08-17-mfa-recovery-requirements/**`; the five foreign boards;
**`tests/**`** (§3.6(b)); identity / registration / MFA / session / auth routes and behaviour,
**byte-for-byte**.

### `compose.dev.yaml` — unanimous

**SR-D2.1 — do not edit `compose.dev.yaml` in place while `accounts-phase1` / S3d is live.**
Add a sibling compose file that composes with or includes it and leave the base **byte-unchanged**.
Two reasons, and the second is specific to this repo:

1. **Overlapping keys.** Live security research already cites this file's insecure flags,
   published ports and `debateai-dev-only` password. A hardening outcome from that mission
   plausibly edits **the same keys** this mission would touch.
2. **The file is untracked, so a collision would not surface as a merge conflict.** It would
   surface as one seat's edit being silently overwritten, **with no diff, no conflict marker,
   and no history to recover from.** Materially worse than the ordinary one-writer risk.

**SR-D2.2 — compose-DNS-only addressing.** This mission's services must not depend on any
**published host port** of a base service. In-compose services address each other by compose
service DNS on the project network; published ports exist only for humans. This single
requirement does four things at once (`[O]` R-D2.2): it makes the two missions independent by
construction; it forecloses the `host.docker.internal` escape (MB-10); it is the shape that
fixes SR-C3.3's broadcast-address problem; and it is what production needs anyway.

**SR-D2.3 — record an expiry.** The split is a consequence of the freeze, not a design
preference. Record the condition that ends it (the security mission closing) so the files are
merged back rather than becoming permanent. Production must never inherit the dev insecure
flags, and resolved-config acceptance must prove it (`[C]` REQ-D2-2).

**SR-D2.4 — verify the merge mechanism, then re-decide `[G]` E4-c.** Whether the bundled
Compose plugin supports `include:` and whether a sibling file may **override an existing
service's environment key** (e.g. `SERVER_GRPC_BROADCAST_ADDRESS`) without editing the base
file is **UNVERIFIED by all three seats** — no seat had a Docker CLI. Verify with
`docker compose version` and `docker compose -f … -f … config` once V-1 is closed. If an
override is impossible, `[G]` E4-c escalates to V (serialize the missions vs. a named
exception); if it is possible, `[G]` E4-c is closed by SR-D2.1 + SR-D2.2 and stays with
architecture.

**SR-D3.6 — no new file inside `apps/**`.** The container command is the existing published
entry point; wrappers live under `deploy/`. Rationale (`[O]` R-D3.1): `apps/api/src/` holds
two files the security mission is actively editing, and adding a third file to that directory
puts this mission inside their review surface for no gain. This bounds `[C]`'s
"build files colocated with the ruled units".

**SR-D2.5 — the ADR-0018 cost of the split, recorded not hidden.** ADR-0018 §Consequences
banks on *"One compose file is the whole deployment description, which makes the credential
separations of clause 2 reviewable in one artifact."* A two-file dev deployment weakens exactly
that reviewability. All three seats accept the cost for dev and require production to remain
one file; `[C]` requires the resolved-model security gate and later consolidation as
**mandatory, not optional cleanup**. If a reviewer prefers the single-file property even in
dev, the alternative is to **serialize the two missions — which is V's call** (folded into
V-2's options).

---

# 5. V DECISIONS PACKET — draft

Ten rows. Each states the question, the options, every seat's recommendation, and **why
REQUIREMENTS cannot close it**. No seat contacted V. This is a draft for the orchestrator to
batch; it is not a message to V.

---

### V-1 — Enable the Docker CLI / start Docker Desktop on this Mac?
**Brief id:** RQ-E1 (all three seats).
**Question.** May a named seat put Docker on PATH and start the daemon, or does V do it — and
when?
**Why REQUIREMENTS cannot close it.** The intake classifies it an **IMPORTANT OPERATION**
(operator software): *"packet to V; do not do it silently."* No seat touched it.
**Evidence (unanimous).** `command -v docker` → exit 1; CLI at
`/Applications/Docker.app/Contents/Resources/bin/docker` and the Compose v2 plugin at
`…/cli-plugins/docker-compose`; `/usr/local/bin/docker` absent; daemon not running.
**Options.** (a) V enables Docker Desktop and adds the CLI to PATH now. (b) V authorizes a
named seat to do it **at the programming preflight** as a recorded IMPORTANT OPERATION, with
no persistent system change beyond the authorization. (c) Do it on a different, V-named
machine. (d) Defer — the mission becomes documentation-only.
**Seat recommendations.** `[O]` **(a)**, high. `[C]` **(b)**, high, with the exact A5 receipt.
`[G]` **(b)** if PROGRAMMING is not starting immediately, **(a)** if V wants a same-day coding
seat; explicitly warns against (c) unless V names the machine, *"evidence in this repo is
about this Mac."*
**Consequence of (d), unanimous.** No seat, review lens, or Hermes verdict may record
"containerized"; the honest word is **UNPROVEN**.
**Strongest counter to enabling now** (`[O]`): starting Docker Desktop changes the machine's
memory and CPU profile while `accounts-phase1` is live on the same machine running
embedded-Postgres work; daemon + Postgres container + (later) vLLM could destabilize a mission
V cares more about right now. `[C]` adds it still cannot prove the vLLM GPU profile.
**Blocks:** every executable claim in §1; SR-D2.4's verification; five of the seats' six
consolidated UNVERIFIED items.

---

### V-2 — Does this mission produce a production Hetzner/Cloudflare slice?
**Brief id:** RQ-E2 (all three). **CONTESTED 2–1** — full quotes at §3.1.
**Why REQUIREMENTS cannot close it.** It is a scope decision, not an evidence question. `[C]`:
*"both preserve DR-117/ADR-0018, but they differ materially in scope, external access, and
acceptance timing."* Provisioning a host, zone, domain and TLS is spend and an external-account
action — V's, not a seat's. `[O]` verified there are **no production inputs in the tree**
(`grep -rli "hetzner\|cloudflare"` over `deploy/`, `compose.dev.yaml`, `package.json` → no
hits; `deploy/` has two files).
**Options.** (a) Local-dev complete this mission; production a **named successor** carrying
every ADR-0018 constraint. (b) Local-dev slice **plus a production-*target* static-config
slice** before mission closure; live deployment separately V-gated. (c) Production only.
(d) **Serialize** — wait for the security mission to release `compose.dev.yaml` and do this
mission single-file (raised at §4 SR-D2.5 as the cost-avoiding alternative).
**Seat recommendations.** `[O]` **(a)**, high, conditioned on the dev slice being
production-*shaped*. `[G]` **(a)**, high. `[C]` **(b)** preferred, medium-high; classes (a) as
*"acceptable only by V decision."* No seat recommends (c). (d) is the synthesis's addition,
recommended by none.
**Strongest counter to (a)** (`[O]`, against his own answer): deferring leaves ADR-0018's
proxy / SSE-buffering / AC-60 clauses entirely unexercised — *"exactly where the ADR predicts
the incident."* `[G]`: *"local-dev lite will ossify and the production `hatchet-engine` row will
never be cut."*
**Strongest counter to (b)** (`[C]`, against his own answer): *"V may intend a narrowly local
containerization mission; requiring a production slice now adds cloud/proxy scope and may
trigger external-operation gates before the core value is proven."*
**Holds under every answer:** the dev slice must be production-shaped (same ADR-0018 service
names, same env contract), and no local pass may be **labelled** ADR-0018 compliance (MB-11).

---

### V-3 — Hatchet service name: `hatchet-engine` or `hatchet-lite`?
**Extra id:** `[O]` E5. **CONTESTED — direct contradiction, quoted at §3.4.**
**Why REQUIREMENTS cannot close it.** It moves a key in a ruled artifact's pin inventory
(`deploy/IMAGE-PINS.md`) and decides whether ADR-0018 compliance is a string comparison or a
judgement call. V may delegate it to ARCHITECTURE; it is listed here because it touches a
V-ruled service table.
**Options.** (a) Rename the compose service to `hatchet-engine`, keep the lite **image** in
dev. (b) Keep `hatchet-lite`, record the substitution explicitly in ADR-0018 / `deploy/`.
**Seat recommendations.** `[O]` **(a)**, medium-high. `[G]` **(b)** — calls (a) *"also a false
claim."* `[C]` effectively **(b)**: a substitute must be *"called out as such."*
**Strongest counter to (a)** (`[O]`'s own): *"the name `hatchet-lite` honestly signals that dev
runs an all-in-one distribution; renaming it hides a real difference behind a compliant label,
which is the opposite of what a topology document is for."*
**Strongest counter to (b)** (`[O]`): ADR-0018's table is what a compliance check reads;
a mismatched name makes every future compliance question a judgement call.
**What would inform V and no seat could obtain:** `[C]`'s version-specific vendor audit of
whether the pinned lite digest is vendor-supported for production and exposes the
migration/dashboard surfaces ADR-0018 expects (**UNVERIFIED**, needs V-1).
**Unaffected by the answer:** SR-C3.1, SR-C3.2, SR-C3.3 (§3.4) hold either way.

---

### V-4 — Does V's prompt supersede DR-121 / DR-121-r, and how much?
**Extra id:** `[O]` E4. Raised by one seat; the omission is itself evidence (§3.3).
**Question.** DR-121 (2026-08-07, V-STEER: *"for now we do not install anything from the
Docker family… hatchet-lite dev-compose stays AUTHORED-DORMANT (files only); the engine smoke
and every container-dependent fixture are DEFERRED BY RULING"*) and DR-121-r (2026-08-09,
*"just defer docker and hatchet for now"*) are **both marked ACTIVE** in
`docs/missions/2026-08-06-v3-programming/decisions-ledger.md`. V's 2026-08-21 prompt says
*"use Docker and Hatchet to containerize the app."* Does that supersede them, and how much?
**Why REQUIREMENTS cannot close it.** Superseding a V ruling is V's act — and the row has
**two separable clauses**, so "it's obviously lifted" is not precise enough to act on.
**Options.** (a) Lift clause (2) only — Docker/Hatchet for the **application stack** — while
**preserving** clause (1), which makes embedded-Postgres the standing test database.
(b) Lift the whole row, flipping test provisioning to Testcontainers as `06-test-strategy.md`
requires. (c) Treat the mission prompt as self-evidently superseding; mint no ledger row.
**Seat recommendations.** `[O]` **(a), recorded as a new DR**, high — the smallest lift that
unblocks the mission, keeps `tests/**` untouched, and leaves the test-store change separately
reviewed. `[G]` implicitly (a) — phrases the Testcontainers requirement as conditional on
DR-121 being lifted. `[C]` **did not see the ruling** and wrote from ADR-0012 /
`06-test-strategy.md` as if Testcontainers were already standing.
**Strongest counter** (`[O]`): V may see a ceremonial DR as bureaucracy when the prompt is
unambiguous; and leaving clause (1) alive keeps `06-test-strategy.md` out of step with the
tree, which a later reviewer will read as an incomplete job.
**Additional weight for (a) found in this synthesis:** `tests/**` is in neither this mission's
`allowed` nor its `readonly` contract, **and** it has a live foreign writer right now (§4).

---

### V-5 — Digest-pin `postgres`, or is major `18` the pin?
**Extra ids:** `[O]` E6, `[G]` E4-d. **CONTESTED.**
**Why REQUIREMENTS cannot close it.** Resolving a digest **mints a value**, and values are V's
(AC-76, DR-023) resolved on the machine under DR-104. It would add a bootstrap register row.
**Evidence.** `compose.dev.yaml` uses `postgres:${POSTGRES_MAJOR_VERSION}` → `postgres:18`, a
floating tag, against §5.4c's *"Exact digests, never floating tags — for the register row and
the compose pin alike."*
**Options.** (a) Add `postgresImageDigest` to `register.bootstrap.json`, resolved on the
machine, emitted into compose by `pnpm compose:env`. (b) Keep the major as the semantic pin
and **record the exception**, capturing the actually-pulled digest per accepted run. (c) Defer
to the production slice.
**Seat recommendations.** `[O]` **(a)**, medium-high — and volunteers the weakness: §5.4c is
written about the two services it classifies (`vllm`, `hatchet-engine`), so *"reading it as
binding `postgres` too is my extension"*; `postgresMajorVersion` is already a ratified
bootstrap row. `[G]` **(b)**: *"major remains the bootstrap semantic pin; digest is optional
provenance, not a new register row."* `[C]` **(b)**: report Postgres as **major-only** until a
stronger identity is chosen — never describe a major tag as an exact pin — with the counter
that digest-pinning can obstruct routine security rebuilds.
**Two-thirds for (b).** Not averaged; V-5 decides. Under **either** answer MB-8 holds: the
identity actually used must be recorded, and a mutable tag alone never counts as a pin.

---

### V-6 — Is `apps/evaluator-worker` an ADR-0018 deployment unit?
**Brief id:** RQ-E3. **Unanimous recommendation, still V-owned.**
**Why REQUIREMENTS cannot close it.** ADR-0018's service list is V-ruled (DR-117); adding a
unit to it is a topology decision.
**Evidence (unanimous).** No `scripts` key, no `main.ts`, no CLI; `src/` is a library exporting
`EVALUATOR_TASK_FAMILIES` and `run*` functions; absent from ADR-0018's seven and from
`03-module-design.md` §1.3's service map. **It is not a process. You cannot containerize a
library.**
**Options.** (a) Out of the list on purpose; not containerized here. (b) It is a unit and needs
a process plus a service. (c) It belongs to the live `model-evaluator` mission's own deployment
slice. (d) Run its families on `apps/runner` as extra Hatchet workflows.
**Seat recommendations.** `[O]` **(a)**, medium-high, with (c) noted as the likely long-run
answer. `[G]` **(a)**, high — explicitly rejects (d) as expanding what the runner owns. `[C]`
**(a)**, high — revisit through a new architecture ruling when it has an executable ownership
contract.
**Strongest counter** (`[O]`): the `model-evaluator` mission is **live**; if it lands a worker
process next week, this mission will have containerized everything except the one component
that was actively growing, forcing a second pass. `[G]`: *"`EVALUATOR_TASK_FAMILIES` looks like
Hatchet task names waiting for a worker."*

---

### V-7 — Module inventory: `apps/ui` vs `web`, and `job:reaper` vs `job:liveness-sweep`
**Extra ids:** `[O]` E8, `[G]` E4-a (UI); `[G]` E4-b, `[C]` REQ-A2-2, `[O]` R-C5.5 (reaper).
Two questions, one owner: both are `03-module-design.md` inventory facts that diverge from the
live tree, and both change what "the app" means.
**Why REQUIREMENTS cannot close them.** Which UI is the product, and whether a ruled job name
may be containerized under a different live name, are product/architecture inventory rulings.

**(a) `apps/ui` vs `web`.** Both are Next apps with parallel `app/` trees, both hardcode
`-p 3000`; only `web` is an ADR-0018 unit and only `dialectical-engine-web` is built by the
root `build` script. **Both seats recommend containerizing `web`** and not starting `apps/ui`
in the same compose invocation, recording `apps/ui` as out-of-topology pending V.
**Strongest counter** (`[G]`, sharper than `[O]`'s): *"`apps/ui` is where the live debate canvas
actually is; containerizing `web` could ship an empty/kept shell."* `[O]` adds that the port
collision guarantees a wrong pick is not noticed until both are started together.

**(b) `job:reaper`.** Ruled name vs live `job:liveness-sweep`; `runReaper` throws
`S00_SCAFFOLD_ONLY`. **CONTESTED — quoted at §3.7.** `[C]` would **fail scheduler acceptance**
until all three ruled jobs are runnable; `[O]` says do not schedule it, provision its
credential anyway, and record that AC-89's write half does not fire; `[G]` says containerize
the live CLI with the reaper *credential scope* and let V/architecture decide the rename —
*"not a silent alias."*
**Note:** `[C]`'s rule cannot be cleared by anything this mission may lawfully do — the stub
belongs to a later slice — so answering it decides whether the scheduler can pass this
mission's bar at all.

---

### V-8 — Does "containerized" require a real model call?
**Extra ids:** `[O]` E9, `[C]` E4; `[G]` B4's counter. **§3.2.**
**Why REQUIREMENTS cannot close it.** It is the boundary of what V's word *"containerize the
app"* means, and it collides with a standing ruling.
**Evidence.** DR-179: model access is **exclusively** through V's authenticated CLI
subscriptions wrapped as local relays; the intake adds *"relays are not Hatchet workers"*, and
relays are host processes. `vllm` is the only in-compose provider, requires an unregistered
`VLLM_MODEL`, and whether its pinned image runs on this `darwin/arm64` host is **UNVERIFIED**.
So a fully-containerized runner may have **no lawful in-network way to make a real call**.
Mitigating law: a vLLM failure is a **typed failure with a ledger row, never a substituted
result** (ADR-0018 clause 3(d), DR-115) — and the runner boots fine with a valid but
unreachable `VLLM_BASE_URL`.
**Options.** (a) The bar **excludes** a real model call: dispatch + claim + a typed failure
with a ledger row is the bar, stated explicitly in `deploy/`. (b) The bar **includes** a real
call — requiring either a GPU host for `vllm` or a container→host relay bridge, and a relay
bridge is a **DR-179 question**, not an engineering choice. (c) `[C]`'s middle path: allow
split proof, but **withhold the words "full app containerized"** until vLLM passes on
compatible hardware, with that successor proof blocking and explicitly owned.
**Seat recommendations.** `[O]` **(a)** for this mission, medium-high, with the disclosure
mandatory. `[C]` **(c)**, high. `[G]` split, high — production still requires `vllm`.
**Strongest counter to (a)** (`[O]`'s own): *"a bar that never makes a model call proves the
plumbing and not the product. V asked to containerize **the app**, and an app that cannot
answer a question is not, in the ordinary sense of the word, containerized — a QA lens could
reasonably refuse the claim on exactly that ground."* `[G]` agrees from the ADR side.
**Strongest counter to (c)** (`[C]`'s own): split proof can let provider-network and
model-mount defects survive until late.
**Requirements has already closed the disclosure half** (MB-11 ii): whatever V decides, a
stack with `vllm` off may not be described as "running debates."

---

### V-9 — Is `web`'s `/api/[...path]` proxy the second path AC-60 forbids?
**Extra id:** `[O]` E7. **Opus-only.**
**Question.** `web/app/api/[...path]/route.ts` is a real reverse proxy (`readApiBase()` →
`DIALECTICAL_API_BASE`). ADR-0018 clause 1 says *"There is one origin address for the contract,
and it is `apps/api`. No second hostname, **no `/api/*` proxy inside `web`**, no direct-to-origin
route that skips Cloudflare for some callers."* Is the live route the forbidden second path, or
the sanctioned SSR forwarder AC-57 describes?
**Why REQUIREMENTS cannot close it.** It is an AC-60 ruling question, and the condition
**predates this mission** — no seat created it and none may resolve it.
**Options.** (a) Declare it lawful same-origin SSR forwarding under AC-57 (it forwards the
asker's scope and decides nothing), adding the clause to ADR-0018 at the architecture loop.
(b) Declare it the forbidden proxy; the browser reaches `api` directly through the edge and
the route is removed.
**Seat recommendation.** `[O]` **(a)**, medium confidence, bounded by a written clause that the
route may never make a tier (ADR-0013), disclosure (AC-56) or honesty-field (AC-54) decision —
ADR-0018 clause 1's *"the proxy is a transport participant, not a policy layer."*
**Strongest counter** (`[O]`'s own): ADR-0018's prohibition is worded specifically enough that
reading the live route as compliant *"looks like fitting the law to the code; and a
containerization mission that publishes `web` as the browser's origin makes the proxy **the**
path rather than a path, which is the strongest possible version of the breach."*
**Requirement holding under either answer:** containerization must not **deepen** the condition
— no new route, no new origin, and the proxy stays a pure forwarder.

---

### V-10 — DR-179's scope over engine credentials, and Hatchet token provisioning
**Extra ids:** `[O]` R-C5.7, `[G]` E4-e.
**Question (two halves, one ruling).** (i) Is `HATCHET_CLIENT_TOKEN` inside DR-179's
prohibition? DR-179 says *"no key material enters the repo, the register, the environment, or
any config"*, written about **model-provider API keys**. (ii) May the repo document the
vendor's default local-dev UI credentials, or must a non-default token be minted at operator-up?
**Why REQUIREMENTS cannot close it.** Both halves are readings of a V ruling, and (ii) is a
safety choice about documenting vendor default credentials.
**Seat positions.** `[O]`: the narrow reading is the only coherent one — DR-179's subject is
model access, so introducing an engine token is **not** a violation — *"but it **is** a reading,
and V may want to confirm it."* Any DR-179 secret-scan gate must be written to know the
difference, *"or it will either false-positive on every Hatchet deployment or be disabled
entirely. Both outcomes are worse than naming the exception."* `[G]`: **never commit
`HATCHET_CLIENT_TOKEN`; generate it at operator-up**; records that vendor docs publish default
UI credentials for lite and production, and flags documenting them as V's call.
**Strongest counter** (`[O]`'s own): a stricter reading of DR-179 would forbid the token
outright, *"which would make self-hosted Hatchet unusable and contradict DR-118."*
**Agreed regardless** (`[O]` R-C5.6, `[C]` REQ-C5-2, `[G]`): no credential literal in any
compose file, Dockerfile, or `.env.compose`. `.env.compose` is **generated and not gitignored**,
so anything written there is committable — it stays **derived and secret-free**; operator
secrets live in a separate gitignored operator-provided file or a compose `secrets:` mount;
rendered evidence proves distinctness **without printing values**; logs never print them (MB-4).

---

# 6. What Architecture may start from

The synthesized **bar and constraints** — not a design. Architecture chooses mechanisms;
nothing below chooses one for it.

**Start from these, as given:**

1. **The mission bar, MB-1…MB-11 (§1)**, plus the preflight preconditions. Every row is
   falsifiable and every row has an owner among the three seats.
2. **The Hatchet ownership boundary (§2.3 C1)** — eleven MAY/MUST-NOT clauses, restated from
   ADR-0017 by three seats independently and in agreement. Architecture adds the
   containerization-specific corollary (`[O]` R-C1): **no compose-level `restart:` policy may
   become a second retry authority** — engine redelivery plus `restart: always` is two recovery
   mechanisms and only the register-bounded one is lawful — and **no health check or dashboard
   query may become a read of run state**.
3. **The minimum Hatchet wiring and its three-part proof (§2.3 C2 + MB-9)**, including
   SR-C2.1 (fail-fast preserved), SR-C2.2 (one workflow name, one source), SR-C2.3 (the real
   dispatcher, not the acceptance harness), SR-C2.4 (broadcast address and token are coupled).
   **The wiring already exists in app code** — this mission supplies the environment and
   network in which it can register and dispatch, and the observable that proves it did.
   Anything more is scope expansion.
4. **The RabbitMQ check (§2.3 C4)** — resolved-config, blocking, fails closed, positive
   assertion included, RED/GREEN fixture, exception only by recorded law-6 decision.
   **Honest scope limit** (`[O]`): a repo-local check makes the defect impossible **to commit**,
   not impossible **to run**; closing the second half needs an operator-checklist assertion
   that no non-project broker container runs on the host.
5. **Credential separation (§2.3 C5)** — three principals, three injection references, a fourth
   read-only replay principal, and **negative** permission receipts per job.
6. **The file-contract manifest and the sibling-compose rule (§4)**, including SR-D1.1's
   finding that `git diff` cannot adjudicate ownership here, and SR-D1.2's re-check-per-ticket
   rule.
7. **The `apps/api` image contract (§2.4 D3 + SR-D3.1…SR-D3.6)** — five named live-tree
   mechanisms, each with the specific way it fails if ignored.

**Architecture must resolve these before the PROGRAMMING loop, and they are not V's:**

- **The `compose-env.ts` path class** (§3.6 a) — obtain it by name, or nominate another lawful
  home for register-sourced compose constants. Writing compose literals instead is the AC-74
  defect, not a workaround.
- **The compose merge mechanism** (SR-D2.4) — `-f` chain vs `include:`, and whether a sibling
  file can override an existing service's env key. Verify with `docker compose version` and
  `docker compose … config` after V-1. `[G]` E4-c's escalation depends on the answer.
- **The scheduler's runtime shape** — three services, three profiled one-shots, or three
  invocations, subject to §3.5's unresolved co-residency question.
- **The replay ceremony's invocation shape** — a one-shot under an opt-in profile is the
  seats' lean; `[O]` notes a profile in the same project still shares the network and can be
  started by a careless `--profile all`, so *"separately scheduled"* is honored by convention
  rather than by construction. A genuinely separate compose project is stronger and costs more.
- **Where the `vllm` profile boundary sits** and how MB-11's disclosure is worded, once V-8
  lands.
- **How the vendor `HATCHET_CLIENT_*` / live `HATCHET_*` name spaces are documented** so a
  reader copying vendor docs is not misled (`[G]`'s own strongest counter).

**Architecture must not start these:** anything gated on V-1…V-10; any write under the freeze;
any edit to `compose.dev.yaml`; any test-store change; any second Hatchet worker; any
Dockerfile or compose file at all until the planning route (G1 → H1 → C2 → …) authorizes it.

**Consolidated UNVERIFIED list (what six items every seat left open, and what closes each):**

| # | Unverified | Closed by | Raised by |
|---|---|---|---|
| U-1 | Whether `vllm/vllm-openai@sha256:ffb2d59b…` publishes an `arm64` variant or runs without CUDA on this host; and the target Hetzner host's GPU | `docker manifest inspect` on the pinned digest + a profiled `up`, after V-1 | all three |
| U-2 | The `postgres` image's first-boot-only `docker-entrypoint-initdb.d` semantics — if true, `init-hatchet.sql` never runs on a machine with an existing `postgres-data` volume and the engine fails with what looks like a credentials error | official image docs + `down` (no `-v`) → remove the script → `up` | `[O]` only |
| U-3 | Which Compose merge mechanism the bundled plugin supports, and whether a sibling file can override a base service's env key | `docker compose version`; `docker compose -f … -f … config`, after V-1 | `[O]`, `[G]` |
| U-4 | Hatchet's dashboard/API surface names for MB-9's O-1/O-2 — no seat will invent an endpoint path, dashboard label, or `runNoWait` return shape. **ADR-0017 §"What this ADR does not rule" already requires vendor Compose examples and version pins to be re-checked at the implementation ticket.** O-2 is satisfied by **any** engine-side artifact carrying the `v3WorkItemId` — the requirement is the **correlation**, not a particular UI | vendor docs at the implementation ticket + a running engine | all three |
| U-5 | Whether the pinned `hatchet-lite` digest is vendor-supported for production and exposes the migration/dashboard surfaces ADR-0018 expects | version-specific vendor release audit | `[C]` |
| U-6 | The `SERVER_GRPC_BROADCAST_ADDRESS` consequence for an in-compose runner — derived from the key's meaning by `[O]`, confirmed against vendor docs by `[G]`, **not executed by anyone** | start the stack; read the runner's connect target in its logs | `[O]`, `[G]`, `[C]` |

**Two live blockers architecture will hit on day one** (both `[O]`, both live-tree):
`docker compose up` cannot succeed today because `${VLLM_MODEL:?…}` has no producer
(SR-A4.1); and `dialectical-engine/Makefile` is tracked-but-deleted, so there is **no
one-command dev lifecycle on disk** for MB-1 to extend.

---

## Synthesis method and residual risk

- **What I did.** Read the three artifacts and three self-reports in full, plus `brief.md`,
  `00-intake-H0.md` and my goal packet. Compared them question by question. Where they agree
  I passed the agreement through; where they disagree I kept both readings and named what
  would settle it. **I invented no fourth opinion to break a tie on a product question** —
  the three 2–1 splits (B3/E2, C3 naming, A4/postgres digest) are recorded as splits and
  routed to V, not resolved by majority.
- **Where I added something.** Two places only, both procedural: the **merge-mechanism
  verification** (SR-D2.4) that decides whether `[G]`'s E4-c is a V question or an
  architecture one, and the **serialize-the-missions** option in V-2, which follows from
  `[O]`'s and `[C]`'s own statements of the two-file cost. Neither invents a fact.
- **Evidence asymmetries, recorded not smoothed.** `[O]` verified the git-tracking state and
  DR-121's ACTIVE status; neither other seat did, and `[C]`'s section B5 reads differently
  because of it. `[G]` fetched live vendor docs and independently confirmed `[O]`'s derived
  broadcast-address finding, and found the copy-paste trap (`SERVER_MSGQUEUE_KIND` defaults to
  `rabbitmq` when unset, while the vendor's "Postgres (Default)" lite sample **omits the key**)
  — which is the strongest justification for C4's "unset = fail" rule and was found by no one
  else. `[C]` contributed the non-destructive-stop bar, the resolved-config RED/GREEN fixture
  discipline, image-provenance receipts for built images, and the fresh-read-ownership rule.
  Where a seat marked something `UNVERIFIED` and another verified it, the triangulation is
  named at the point of use.
- **Residual risk.** This synthesis is only as good as three artifacts written on 2026-08-21
  against a tree that a live mission is actively changing. `[O]`'s dirty-file set is a
  snapshot (SR-D1.2). Nothing here was executed. Six items are `UNVERIFIED`, ten questions are
  V's, and seven requirements-level disagreements are unresolved by design.
- **Blindness / freeze / writes.** I read the three artifacts by contract — that is this
  seat's job, not a blindness breach; the three producing seats were blind to each other and
  each says so. No file under the freeze was read or written. **Writes: exactly the two paths
  in my goal packet's `allowed` list.** No code, Dockerfile, compose, schema, migration, or
  configuration. No commit. No push. No board operated. No V contact.

---

```
WORKER CLAIM:
- ticket: REQ-DOCKER-SYNTH
- owner CLI session: 1a0b5071-8f67-4133-91c3-874017f90ad2
READY FOR HERMES STAGE REVIEW:
- mission/step: 2026-08-21-docker-hatchet / H0-REQUIREMENTS-SYNTH
- owner CLI session: 1a0b5071-8f67-4133-91c3-874017f90ad2
- artifact path: docs/missions/2026-08-21-docker-hatchet/research/synthesized-requirements.md
- upstream artifacts used:
  docs/missions/2026-08-21-docker-hatchet/goal-packets/synth.md;
  docs/missions/2026-08-21-docker-hatchet/brief.md;
  docs/missions/2026-08-21-docker-hatchet/00-intake-H0.md;
  docs/missions/2026-08-21-docker-hatchet/research/opus-requirements.md;
  docs/missions/2026-08-21-docker-hatchet/research/grok-requirements.md;
  docs/missions/2026-08-21-docker-hatchet/research/codex-requirements.md;
  docs/missions/2026-08-21-docker-hatchet/agent-reports/{opus,grok,codex}-selfreport.md;
  docs/architecture/01-decisions/ADR-0017-durable-execution-hatchet.md;
  docs/architecture/01-decisions/ADR-0018-deployment-topology.md
- checks/evidence: all 22 brief RQ ids (A1-A5, B1-B5, C1-C5, D1-D3, E1-E4) carry an
  AGREED / CONTESTED / OPEN-V row in §2 with per-seat citations; all seat-invented extra
  ids are listed in §2.6 with a disposition (Opus E4-E9, Grok E4-a..E4-e, Codex E4) and
  none is dropped; the seven contested rows quote both readings verbatim in §3 and none is
  averaged; ten V-owned questions are drafted in §5 with options, every seat's
  recommendation, and why REQUIREMENTS cannot close each; one extra id (Grok E4-c) is
  demoted to ARCHITECTURE with a named re-escalation trigger. Six UNVERIFIED items are
  consolidated in §6 with the command or source that closes each. Nothing was executed;
  Docker was not started.
- assumptions/risks: three 2-1 splits (mission scope B3/E2, Hatchet service naming C3,
  postgres digest A4) are recorded as splits and routed to V, not resolved by majority;
  Codex did not see DR-121/DR-121-r (both ACTIVE), which is why its B5 treats
  Testcontainers as standing law - recorded as an evidence asymmetry, not corrected away;
  Opus's git-tracking finding (compose.dev.yaml untracked; only 141 tracked files; the
  dirty set is the security mission's write set incl. three tests/ files) is single-source
  and load-bearing for section 4 - it should be re-verified at the first PROGRAMMING claim;
  the dirty-file set is a 2026-08-21 snapshot and must be re-checked per ticket;
  architecture is blocked on the compose-env.ts path class and the compose merge mechanism.
- comments read through: intake
```
