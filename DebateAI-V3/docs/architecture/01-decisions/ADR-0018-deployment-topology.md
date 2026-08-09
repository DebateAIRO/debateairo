# ADR-0018 — Deployment topology: Docker Compose on Hetzner behind Cloudflare, with vLLM as a provider adapter

| Field | Value |
|---|---|
| **Status** | **RULED — DR-117 (V + the human stack sitting, FINAL).** **Docker Compose + Hetzner + Cloudflare.** The one-transport law (AC-60) **holds through the proxy** — no second path, no privileged bypass. **vLLM** runs as a separate Compose service reached over HTTP, modelled as **one provider adapter behind Seam C's gateway**. |
| **Date** | **2026-08-07** — minted by PROG-V3-R1 / PRE-10 rev 2 |
| **Proposed by** | Ruled directly at the DR-117 stack sitting; this ADR records it and works out the three consequences the ruling implies but does not spell out. |
| **Source of record** | PROG-V3-R1 ledger **DR-117**; execution platform at **DR-118** ([ADR-0017](ADR-0017-durable-execution-hatchet.md)) |
| **Numbering note** | See [ADR-0017](ADR-0017-durable-execution-hatchet.md)'s numbering note; README §2 carries the 0015/0016 resolution. |

## Context

The C4 architecture set decided **what V3 is made of** and deliberately decided
**nothing about where it runs** — no deployment target, no process topology, no
network path appears in Plan.md's stack rows. That was correct at the time and it
left three obligations dangling, each of which becomes checkable only once a
topology exists:

- **AC-60 — one transport front door** (ui §1.4 L5, DR-048). V2's three-path
  transport seam is the named failure. A reverse proxy in front of the API is
  exactly the shape that grows a second path, because *"just bypass the proxy for
  this one case"* is always available and always looks local.
- **AC-36 / AC-37 — one provider interface; a second provider by configuration**
  (DR-029 H1/H2). A locally-hosted model is the most tempting exception a
  deployment can offer: it is on the same network, it costs nothing per token,
  and calling it directly would be trivially easy.
- **VR-3 limb (iii) — operator independence** (charter S1; ADR-0012 clause 2). The
  replay ceremony must be *"run by a person or job that did not produce"* the
  numbers, with **read-only database credentials, scheduled separately**. That is
  an infrastructure requirement, and ADR-0012's own costs section records that
  the build order must carry it.

DR-117 supplies the topology. This ADR records it and discharges the three
obligations against it.

## Options considered

The sitting ruled the target directly, so the options below are recorded for the
record rather than re-argued: **Docker Compose on Hetzner behind Cloudflare** was
chosen; a managed-platform or Kubernetes topology was not taken. What matters
architecturally is that the ruling is **self-host, single-host, one compose
file** — which is the same posture that decided
[ADR-0017](ADR-0017-durable-execution-hatchet.md) (self-hosted engine, no
external control plane) and which keeps AC-02's *"one store"* and VR-3's
credential separation inside artifacts we own.

**The alternative that was genuinely closed by this ruling** is a topology whose
control plane or durable state sits off-host. DR-118 rejected Inngest Cloud on
exactly that ground; this ADR records that the deploy ruling and the execution
ruling point the same way, and that a later proposal to move any durable plane
off-host contradicts both.

## Decision

**Docker Compose on Hetzner, behind Cloudflare.** One compose file describes the
deployment; services are:

| Service | What it is | Notes |
|---|---|---|
| `web` | the kept Next.js interface (SSR + browser assets) | DR-068/069/095; calls the API through the same front door as the browser, never privileged (AC-57) |
| `api` | `apps/api` — Fastify, the single front door, including the SSE route | AC-60; [ADR-0002](ADR-0002-api-encoding-and-front-door.md) |
| `runner` | `apps/runner` — stage execution, the work claim | [ADR-0009](ADR-0009-job-execution-in-postgres.md) |
| `scheduler` | `apps/scheduler` — `job:replay-self-test`, `job:reaper`, `job:settlement-watch` | `03-module-design.md` §1.2; **the three do not share a credential** |
| `hatchet-engine` | the durable-execution engine, self-hosted, Postgres-first, plus its dashboard/migration surface | **DR-118**; [ADR-0017](ADR-0017-durable-execution-hatchet.md). **No RabbitMQ service** — adding one is a recorded law-6 exception |
| `postgres` | **the one Postgres instance** — V3's **seven** schemas (`core`, `ledger`, `memory`, `scorecard`, `register`, `serve`, `evidence`) in one migration lineage, **plus the engine's dedicated, separately-migrated database/schema as a co-tenant**. **One instance is ruled** (DR-118), not a default: a split needs a new human ruling | AC-01/AC-02; **DR-118**; [ADR-0003](ADR-0003-postgres-access-and-migration-tooling.md) rule 4 |
| `vllm` | the local model server, reached over HTTP | one adapter behind Seam C — clause 3 below |

**Version pins for the engine and vLLM images are not stated here and are not
numerals in any document** — `05-register-skeleton.md` §5.4c carries how they are
pinned (AC-74, AC-76 · DR-039).

### 1. The one-transport law holds through the proxy

**Cloudflare is in front of the one front door, not beside it.** AC-60 says
server-side rendering and the browser read the same contract through the same
front door; the proxy does not change that, and three clauses keep it true:

- **There is one origin address for the contract, and it is `apps/api`.** No
  second hostname, no `/api/*` proxy inside `web`, no direct-to-origin route that
  skips Cloudflare for some callers. **A path that exists only for one caller is
  the V2 seam AC-60 exists to forbid**, whatever the reason it was added.
- **SSR is not privileged by being inside the network.** The SSR path forwards
  the asker's session scope (AC-57 · DR-066(1)) and calls the same addresses.
  Network position is not authorization: co-location makes a privileged bypass
  *easy*, and easy is precisely why this is written down.
- **The proxy is a transport participant, not a policy layer.** Authorization is
  evaluated once per request against a payload class inside the API
  ([ADR-0013](ADR-0013-authorization-tiers.md)); no tier decision, no disclosure
  decision (AC-56) and no honesty-field injection (AC-54) may be implemented at
  the edge. An edge rule that suppressed or reshaped a payload would be a second
  place where a serving decision is made — AC-85, and an unauditable one.

**The SSE consequence, named because it is the likely incident.** The realtime
stream ruled at DR-117 ([ADR-0002](ADR-0002-api-encoding-and-front-door.md))
passes through the proxy, and proxy buffering is the classic way a working stream
becomes a silently broken one. **The fix is proxy configuration; the fix is never
a second path.** Opening a direct-to-origin stream endpoint would breach AC-60
for a purely operational reason, which is the worst kind of breach — invisible in
the code review that mattered.

### 2. Ceremony independence is a topology property here

VR-3 limb (iii) and ADR-0012 clause 2 need what a compose file can express: the
replay ceremony runs as **a job with its own read-only database credential,
scheduled separately from the acceptance run, reading run ids it did not write.**

- **A separate read-only Postgres role exists in the deployment**, and
  `apps/replay` has no other credential. This is what makes limb (ii)
  ("frozen records only") structural rather than promised.
- **The ceremony is not scheduled inside the job that produced the runs.**
  ADR-0012 records why: the obvious CI shape satisfies limbs (i) and (ii) and
  **defeats the failure limb (iii) guards**.
- **`apps/scheduler`'s three jobs do not share a credential** (`03-module-design.md`
  §5.5.0). The compose file is where that separation is real rather than
  intended.

### 3. vLLM is one provider adapter behind Seam C's gateway

**vLLM is a separate service reached over HTTP.** It is **not** a second model
pathway, **not** a special case, and **not** a Python component of V3 — it is a
service that one adapter talks to, exactly like a hosted provider.

**(a) It crosses the one interface like everything else.** AC-36 forbids calling
model SDKs or endpoints outside the one provider interface (DR-029 H1). vLLM is
reached by a provider implementation behind
`packages/providers`' `call(...)`, so the gateway persists the raw artifact
unconditionally (AC-13), writes the ledger row (AC-44), and records provider,
model id and `model_version` on the way out (AC-42). **`FX-HR-H1` covers it
unchanged**: no scoring, debate, evidence, metareasoning or orchestration code
may reach it directly, and the assertion is over the dependency graph rather than
by review.

**(b) Selecting it is a register-row change.** AC-37's *"a second provider by
configuration"* holds: provider identity is a **configured value, not an import**
(`05-register-skeleton.md`, *configured provider set*). Switching to or from vLLM
moves a register row and nothing else — which is also what makes H2-a's
byte-identical-build-inputs test meaningful.

**(c) Lineage is the served model's maker, not the serving runtime.** This is the
clause that would otherwise be got wrong, and DR-117 states it: **DR-013's
maker-diversity floor counts vLLM's served model by the maker of that model**, not
by "vLLM". vLLM is inference infrastructure; a maker is who produced the model.
Two consequences:

- **Running two models under one vLLM service does not by itself create maker
  diversity** — if both weights come from the same maker, the floor sees one
  maker. Conversely a locally-served model from a different maker than the hosted
  provider **does** count toward the floor.
- **AC-38's deployment maker inventory counts it by that maker.** DR-055's
  multi-maker arithmetic and the two-predicate `deployment_maker_capability`
  design are [ADR-0015](ADR-0015-deployment-maker-inventory.md)'s and are **not
  restated here** (AC-85); what this ADR fixes is only *which maker a locally
  served model is attributed to*. **DR-090** is unaffected: rival-carver
  selection still runs on the maker-diversity floor alone, and the measured
  behavioural-difference criterion is still **recorded as unavailable, never
  approximated**.

**(d) Being on the local network changes no law.** No lower bar for artifact
persistence, no lane exemption (AC-40), no context-isolation exemption (AC-39),
and no exemption from DR-115: **a vLLM response is a real model call's artifact
and a vLLM failure is a typed failure with a ledger row** — never a substituted
result ([ADR-0009](ADR-0009-job-execution-in-postgres.md) clause 1). Zero
marginal cost is not a licence to loosen the record.

## Consequences

**Accepted:**

- **Every durable plane is inside the deployment.** Postgres holds V3's data and
  the engine's dispatch state (ADR-0003 rule 4); nothing about *"what is running"*
  or *"what was served"* lives with a third party. This is the same property that
  decided DR-118 and it is now a topology fact rather than a preference.
- **One compose file is the whole deployment description**, which makes the
  credential separations of clause 2 reviewable in one artifact.
- **A local model becomes an ordinary provider row**, so cost pressure does not
  create an architectural exception.

**Costs and risks:**

- **Single-host concentration.** API, workers, engine, database and model server
  share one machine's resources. ADR-0003 and ADR-0017 already record the
  Postgres-contention half; the model server adds GPU/memory pressure on the same
  host. Splitting hosts later is an operational change, not an architectural one —
  **provided nothing acquires a second durable store while doing it**.
- **The proxy is a shared failure and configuration surface** for the whole front
  door including SSE. Clause 1 forbids the tempting workaround, which means proxy
  misconfiguration must be fixed as proxy misconfiguration.
- **A third-party edge sits in front of a self-hosted system.** Availability and
  TLS termination are partly outside the compose file. This is accepted at
  DR-117; what is *not* accepted is any serving decision migrating to that edge
  (clause 1).
- **Local-model attribution is a standing review point.** Clause 3(c) is easy to
  get wrong precisely because the serving runtime has a name and a service entry
  while the maker does not. A deployment maker inventory that lists *"vLLM"* as a
  maker is a defect.

## Constraints served

| Constraint | Citation | Carried in this decision by |
|---|---|---|
| AC-60 — one transport front door | ui §1.4 L5 (DR-048) | clause 1 — one origin for the contract, no bypass, proxy is transport not policy |
| AC-57 — asker-scoped authorization; SSR never privileged | DR-066(1) | clause 1 — network position is not authorization |
| AC-56 / AC-54 — disclosure split; machine-injected honesty fields | DR-054, DR-058 | clause 1 — no edge rule may reshape a payload |
| AC-36 / AC-37 — one provider interface; second provider by configuration | DR-029 H1/H2 | clause 3(a)/(b) — vLLM is one adapter, selected by a register row |
| AC-13 / AC-44 / AC-42 — artifact persisted, ledger row written, honest keys recorded | manifest §8.2a, §8.3; spec §16.2 | clause 3(a) — the gateway's obligations are identical for a local model |
| **DR-115** — no scaffolded data | PROG-V3-R1 ledger DR-115 | clause 3(d) — a local failure is a typed failure, never a substitute |
| DR-013 / AC-38 / DR-055 — maker-diversity floor and the deployment maker inventory | DR-013, DR-055; charter S4 | clause 3(c) — lineage is the **served model's maker**; the inventory's design stays [ADR-0015](ADR-0015-deployment-maker-inventory.md)'s |
| AC-07 / charter S1 / VR-3 limb (iii) — operator independence | DR-063 VR-3; charter S1 | clause 2 — separate read-only credential, separately scheduled |
| AC-01 / AC-02 — Postgres, one store | DR-024; spec §20 W-3 | one `postgres` service; the engine co-tenant scoped by ADR-0003 rule 4 |
| AC-74 / AC-76 — no invented numbers | DR-023, DR-039 | image tags pinned per `05-register-skeleton.md` §5.4c; no numeral here |

## What this ADR does not rule

- **Image tags and version values.** Not stated here; the pinning **mechanism** is
  proposed at `05-register-skeleton.md` §5.4c and the values are V's (AC-76).
- **Which model vLLM serves.** That is a configured provider value and a maker
  attribution (clause 3(c)), not an architecture decision.
- **Host sizing, GPU selection, backup schedule, TLS specifics.** Operational, and
  none of them is a behaviour a served verdict can depend on.
- **Whether services later split across hosts.** Permitted as an operational
  change, subject to the one-durable-store law surviving it.
- **The maker inventory's design.** [ADR-0015](ADR-0015-deployment-maker-inventory.md)'s
  two predicates and its BLOCKING launch gate are unchanged and unrestated here.
