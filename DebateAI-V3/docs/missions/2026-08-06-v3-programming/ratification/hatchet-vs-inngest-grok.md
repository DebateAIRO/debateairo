# Hatchet vs Inngest — durable-execution comparison for the human stack sitting

| Field | Value |
|---|---|
| **Role** | Grok research / comparison artifact for the orchestrator |
| **Date** | 2026-08-07 |
| **Stack context** | Fastify + TypeScript · PostgreSQL + Drizzle · SSE realtime · TS workers · Docker Compose on Hetzner behind Cloudflare · local LLM via vLLM over HTTP |
| **Open sub-decision** | DR-117: durable execution = **Hatchet OR Inngest** |
| **Acceptance bar** | ADR-0009 (seven laws restated below) |
| **Sources** | Vendor docs and repos checked 2026-08-07; project ADR-0009; honest uncertainty called out where facts are incomplete |

---

## ADR-0009 acceptance bar (non-negotiable)

Any engine must **satisfy** these or **permit us to implement them on top** without fighting the engine:

1. **Claim-before-call** — a work claim is committed **before** any model call; results written after.
2. **Idempotent scoped commands** — work items are idempotent scoped commands (ADR-0009: `(row, node-set)` on `core.work_item`).
3. **No lock across a model call** — never hold a DB lock/transaction across a model call.
4. **Resumability** — a crash mid-batch leaves completed work durable and resumable.
5. **Real artifacts only (DR-115)** — all runtime artifacts are **real** model-call artifacts; no engine-injected retries that **fake** results.
6. **One durable store preference** — strong preference for **one** durable store (PostgreSQL). A second broker/store is a design cost.
7. **Own ledger, own sequence** — every executed attempt must be recordable in **our** append-only ledger with **our** sequence order (`at_seq` lineage).

**Important framing:** neither product *is* ADR-0009's `SELECT … FOR UPDATE SKIP LOCKED` queue on `core.work_item`. Both are external orchestration engines. The real question is which one **interferes least** with implementing those laws in our gateway/runner, and which one **costs less** under law 6 for a self-hosted Compose stack.

---

## Current facts snapshot (as of 2026-08-07)

### Hatchet

| Topic | Fact | Confidence |
|---|---|---|
| **License** | MIT (engine + OSS stack) | High |
| **Self-host** | First-class; Docker Compose, Helm/K8s, `hatchet-lite` single-image, CLI `hatchet server start` | High |
| **Durable store** | **PostgreSQL is the source of truth** for workflow/task state and observability | High |
| **Optional broker** | Production Compose often ships **RabbitMQ**; docs allow **Postgres-only** messaging via `SERVER_MSGQUEUE_KIND=postgres` | High |
| **TS SDK** | Official `@hatchet-dev/typescript-sdk`; workers via long-lived **gRPC** to the engine | High |
| **Execution model** | At-least-once tasks; retries configurable; **durable tasks** checkpoint waits/child spawns and replay event log; plain tasks + DAGs also supported | High |
| **Ops surface** | Engine + dashboard (+ migrate/admin); Postgres required; RabbitMQ optional | High |
| **Maturity** | Public ~2024; active (thousands of commits); purpose-built “Postgres durable queue” narrative | Medium–high (younger than Temporal; not a vapor product) |

### Inngest

| Topic | Fact | Confidence |
|---|---|---|
| **License (server)** | **SSPL** with delayed open-source: Apache 2.0 **3 years after** each release is published | High |
| **License (SDK)** | SDKs commonly Apache-2.0 (app-side dependency is fine) | High |
| **Self-host** | Supported since 1.0 (2024-09); single binary / Docker image; **support team does not guarantee** direct support for self-hosted | High |
| **Stores (self-host)** | Default: **in-memory Redis** for queue + run state, **SQLite** for history. Production path: **external Redis** + **Postgres** (Postgres for config/history since ~2025-01) | High |
| **Cloud** | Mature managed platform; generous free tier; workers still run on *your* compute (HTTP serve or Connect) | High |
| **TS SDK** | Excellent TypeScript-first DX; step functions, events, flow control | High |
| **Execution model** | **Step memoization**: each `step.run` is checkpointed; later runs **inject** stored step results and skip re-execution; steps often run as separate HTTP invocations | High |
| **Ops surface (self-host)** | Inngest server + **Redis** + **Postgres** (or SQLite for toy deploys) | High |
| **Maturity** | Cloud product more mature than self-host path; self-host still evolving (retention tooling, support posture) | Medium for self-host prod |

---

## A. Hatchet (self-hosted)

### PROS

1. **Postgres-first durability matches law 6.** Official architecture: PostgreSQL holds workflow definitions and execution state; simple workloads need no second broker. This is the closest product shape to ADR-0009's “queue lives in Postgres” preference among the two candidates.
2. **Postgres-only messaging is documented.** Compose guides that ship RabbitMQ also document dropping it (`SERVER_MSGQUEUE_KIND=postgres`). For a Hetzner Compose stack, we can start with **one durable store engine** and add Rabbit only if throughput forces it.
3. **MIT license, no SSPL friction.** Clean for self-host, fork, audit, and long-term vendor-independence.
4. **Worker model fits our TS workers.** Long-lived workers (gRPC) map cleanly to Docker Compose services next to Fastify and the runner — better than a serverless-first “re-POST the function each step” default.
5. **At-least-once + explicit idempotency story.** Docs state tasks can run more than once and must be idempotent — aligns with law 2 if we own the idempotency key on `core.work_item`.
6. **Durable tasks give real resumability.** Checkpoints for sleeps, event waits, and child task completion; crash/restart resumes from durable event log without re-running completed children — supports law 4 when model calls live in **child** tasks (as Hatchet itself recommends for side effects).
7. **Operational fit for Compose + observability.** Dashboard, OpenTelemetry, Prometheus; hatchet-lite for local/low volume; full multi-service Compose for production. Same architecture for Cloud vs OSS (ops ownership differs).
8. **Polyglot optionality without redesign.** TS now; Python/Go workers later if a lane needs it — without changing the control plane.

### CONS

1. **Not a substitute for `core.work_item`.** Hatchet state is *its* schema/history, not our ledger. We still implement claim-before-call, activation stream, and gateway writes ourselves. Dual bookkeeping is permanent.
2. **Production Compose often pulls RabbitMQ.** Even if optional, many copy-paste deploys and high-throughput paths introduce a second moving part — law 6 design cost if we “just follow the guide.”
3. **gRPC control plane is extra surface.** Engine, dashboard, migrations, tokens, cert/config volumes — more services than “a table + SKIP LOCKED in our app.”
4. **Durable-task determinism tax.** Side effects must not sit naked in durable orchestrator code; they belong in child tasks. Wrong structure → replay bugs or double side effects. Easy to misuse under time pressure.
5. **At-least-once retries re-run work.** Engine retries do not invent tokens (good for law 5), but they **will re-invoke** a failed task — including another real model call — unless we scope retries and gate on our claim/ledger. Risk of multi-attempt cost/noise, not fake artifacts.
6. **Claim semantics are engine-owned, not ours.** Hatchet decides assignment, redelivery, timeouts. Mapping that onto “claim committed in *our* DB before any model call” requires discipline at the worker boundary; the engine will not enforce ADR-0009 clause 7's transaction shape.
7. **Younger ecosystem than Inngest Cloud's mindshare.** TS SDK is real and maintained; community depth and “battle stories at our scale” are thinner than Temporal/classic queues. Unsure of edge-case maturity under multi-day debate batches + local vLLM latency variance.
8. **Shared Postgres capacity risk.** Putting Hatchet tables on the same Postgres instance as the ledger (sensible for law 6) concentrates load: polling, locks, dashboard queries compete with graph/ledger writes. Separate DB instance is cleaner ops but softens “one store” into “one *kind* of store.”

---

## B. Inngest

Treat **self-hosted** and **cloud** separately — they are different products for law 6 and ops.

### B1. Inngest self-hosted — PROS

1. **Best-in-class TypeScript DX.** Event + step model is idiomatic for TS teams; local dev server is polished; large ecosystem of examples (including AI agent step patterns).
2. **Strong step-level resumability.** Completed `step.run` results are memoized; resume skips completed steps — law 4 is a native feature, not a bolt-on.
3. **Simple binary / single Docker image.** `inngest start` + Compose is easy to bootstrap compared to multi-image Hatchet full stack.
4. **Flow control built in.** Concurrency, throttle, debounce, rate limit, batching — useful around vLLM capacity without inventing a second policy layer immediately.
5. **Functions run on our compute.** Even self-hosted, model calls stay in our workers/app — good for Hetzner + local vLLM (orchestration state is local too).
6. **Dashboard + history for debugging runs.** Operational visibility without building admin UI day one.

### B1. Inngest self-hosted — CONS

1. **Redis is effectively mandatory for serious deploys.** Queue + run state live in Redis (in-memory default is not production-grade). Postgres covers config/history — **two stores by design**. Direct pressure on law 6.
2. **SSPL + 3-year Apache delay.** Fine for internal self-host use for many teams, but it is **not** MIT; legal/vendor posture is worse than Hatchet if we ever expose orchestration as a service or need pure OSS certainty. *(Not a product blocker for private Hetzner use; still a real cost.)*
3. **Self-host support is explicitly second-class.** Docs: support team does **not** guarantee direct support for self-hosted instances; enterprise for guarantees. We own breakage.
4. **Self-host maturity lag vs cloud.** Production Postgres backend is relatively recent (~2025-01); retention/cleanup tooling still called out as roadmap-ish. Risk of ops surprises on multi-month debate history growth.
5. **HTTP step re-entry model can fight long workers.** Classic serve path re-invokes the function per step over HTTP. `connect` improves this, but the mental model and failure modes differ from a simple long-running worker loop — more moving parts to keep correct under law 1/3.
6. **Memoization is easy to misuse with model calls.** If a step wraps “call model + write ledger” incorrectly, or if non-deterministic logic sits *outside* `step.run`, you get wrong resumes. Engine injects **prior step outputs**, not invented model text — but dual sources of truth (Inngest state vs our ledger) get out of sync easily.
7. **Does not give us SKIP LOCKED / our claim table.** Same dual-system problem as Hatchet, plus Redis state that is **not** in our Postgres backup story unless we carefully snapshot Redis too.
8. **Default auto-retries** can re-execute steps (real re-calls). Same multi-attempt cost risk as Hatchet; defaults are convenience-oriented, not ADR-0009-oriented.

### B2. Inngest Cloud — PROS

1. **Zero Compose surface for the control plane.** Fastest path to durable steps, UI, and retries; least ops toil.
2. **Most mature Inngest product.** Features, reliability, and support land here first.
3. **Workers stay on Hetzner** (events + orchestration off-box). Local vLLM still reachable from our network if workers are ours.
4. **Excellent TS onboarding** and managed multi-tenant fairness/queueing we do not have to tune.
5. **Free tier / pay-as-you-go** can delay infra work during early slices.

### B2. Inngest Cloud — CONS

1. **Hard fail on law 6 preference.** Run state, step memoization, and queue live in Inngest's store — a second durable system outside our Postgres. ADR-0009 / AC-02 “one store” is violated at the architecture level, not merely “optional Redis.”
2. **Claim and resume truth leave the building.** Even if we dual-write the ledger, “what is running / what step is done” is partially external — complicates law 4/7 incident response and air-gapped or data-minimizing deployments.
3. **Network and availability coupling.** Cloudflare + Hetzner + Inngest Cloud + vLLM becomes a multi-party dependency chain; outages and latency are not all under our compose file.
4. **Data residency / event payload sensitivity.** Debate metadata, prompts, and step outputs may transit or rest off-Hetzner depending on what we put in events/step returns. We can minimize payloads, but the control plane is still external.
5. **Vendor lock on orchestration semantics.** Migrating off cloud step history later is real work; self-host is not a free dual of cloud feature parity.
6. **Cost and rate limits at debate scale** are uncertain without load numbers; local multi-call batteries can be chatty.
7. **Weaker fit for the project's self-host Compose law of the land** (DR-117 deploy choice). Cloud is an exception that needs an explicit architecture ADR, not a silent default.

---

## C. Sharpest risks to the seven laws

| Law | Hatchet (self-host) — sharpest risk | Inngest self-host — sharpest risk | Inngest Cloud — sharpest risk |
|---|---|---|---|
| **1 Claim-before-call** | Worker starts task before our DB claim commits; or claim is only “Hatchet assigned” with no `core.work_item` row. **Mitigation:** first lines of every task: open short txn → claim → **COMMIT** → then model. Never rely on Hatchet alone as the claim. | Step boundaries may wrap claim+call together; on retry, claim logic re-enters. If claim is not idempotent, double-claim or lost claim. **Mitigation:** dedicated claim step that only upserts our row; separate step for model; both keyed to work-item id. | Same dual-claim problem, plus we cannot inspect engine claim storage with our Postgres tools during incidents. |
| **2 Idempotent scoped commands** | At-least-once redelivery re-runs a non-idempotent task → double model call / double ledger attempt. | Memoized steps hide non-idempotency until a step is *retried after partial side effects* outside memoization. | Same as self-host; harder to audit step state offline. |
| **3 No lock across model call** | App code holds a Drizzle transaction open across an `await` model call (engine does not prevent this). | Same app footgun; plus long-running step HTTP request might encourage “do everything in one step” patterns that sprawl transactions. | Same app footgun. |
| **4 Resumability** | Using **only** plain tasks without persisting our activation/ledger → engine resume ≠ battery resume. Durable tasks help, but **our** resume must still be `run_row_activation_event` + work_item state. | Redis run state lost or desynced from Postgres history → engine thinks step done, ledger disagrees (or reverse). Backup story for Redis becomes part of resume. | Cloud state loss/outage pauses resume even if our Postgres is healthy. |
| **5 Real artifacts only** | Retries produce **extra real** calls (cost/consistency), not fakes — still dangerous if ledger treats attempt identity loosely. Durable replay of **child outputs** is OK if children wrote real artifacts; danger is treating engine output as artifact without gateway write. | **Memoization re-injects prior step return values** without re-calling the model. That is correct *if* the stored value was a real call's result and the gateway already ledgered it; it is a **DR-115 breach** if we ever store synthetic/fixture step outputs or skip the gateway on the first run. | Same memoization semantics; plus less visibility into raw stored step payloads under their retention. |
| **6 One durable store** | **Lowest risk of the three** if we run **Postgres-only** messaging and co-locate (or carefully separate-instance) Hatchet tables. Risk rises if RabbitMQ is enabled “for free.” | **Structural two-store (Redis + Postgres).** Cannot satisfy “one durable store” without accepting Redis as second durable system for run state. | **Structural external store.** Strongest law-6 violation. |
| **7 Own ledger + sequence** | Teams start using Hatchet run history as the sequence of record; `at_seq` drifts. Engine order ≠ battery order. | Same, with step IDs/hashes as accidental primary keys instead of our ledger. | Same, with external UI as the “source of truth” during ops. |

**Cross-cutting truth:** laws **1, 2, 3, 5, 7** are **application contracts**. No engine enforces them. Laws **4 and 6** are where product architecture most diverges — Hatchet can be made to sit mostly on Postgres; Inngest self-host cannot drop Redis for real; Inngest Cloud is an external durable plane.

---

## D. Recommendation

**Recommend: Hatchet, self-hosted, Postgres-first (RabbitMQ off until measured need).**

**Argument (two sentences):** Under ADR-0009, the only law that is mostly a *product architecture* choice rather than app discipline is law 6 — and Hatchet is the only option of the two that can keep durable orchestration state in PostgreSQL without a mandatory second store, while still offering durable resumability and a MIT self-host path that fits Docker Compose on Hetzner. Inngest's TS DX is better, but self-host Inngest forces Redis+Postgres and treats self-host as a second-class path, while Inngest Cloud fails the one-store preference outright — so Hatchet is the lower-risk substrate on which we still implement `core.work_item` claim-before-call, gateway ledger writes, and our own `at_seq` as the sequence of record.

### Implementation posture if Hatchet is chosen (not part of the either/or, but implied)

- Engine = **dispatcher + durability for worker lifecycle**, not the settlement store.
- Every model path still crosses Seam C; raw artifacts and ledger rows remain ours (laws 1, 5, 7).
- Prefer **plain or child tasks** for model calls; use durable orchestrator tasks only for wait/spawn control flow.
- Start with `SERVER_MSGQUEUE_KIND=postgres`; document RabbitMQ as an explicit scale exception to law 6.
- Prefer a **dedicated Postgres database/schema** for Hatchet on the same instance (one backup lineage) unless load forces a second instance.
- Disable or tightly bound automatic retries at the engine where our reaper + typed failures own recovery; never let retries write non-real artifacts.

### When Inngest would still be the better call

- If the sitting **explicitly relaxes law 6** (accept Redis or accept Cloud as a second durable plane).
- If **time-to-first-slice** dominates and the team accepts dual truth + later migration cost.
- If the product shifts toward **serverless multi-tenant** workers rather than Compose workers on Hetzner.

---

## Uncertainty / what we did not verify in-repo

- Exact Hatchet and Inngest **version pins** and whether Compose examples match latest minor (docs change; re-check at implementation ticket).
- Whether co-locating Hatchet schema on the **same database** as `core.*` is blessed by Hatchet support or only “works in practice.”
- Production load numbers for debate batteries (calls/sec, step fan-out) — both engines are fine at modest rates; bottlenecks unproven for this pack.
- Legal review of SSPL for this project's distribution model (likely fine for private self-host; not asserted here as legal advice).

---

## Source pointers (for the sitting)

- Hatchet architecture & guarantees: https://docs.hatchet.run/v1/architecture-and-guarantees  
- Hatchet Docker Compose (Postgres-only note): https://docs.hatchet.run/self-hosting/docker-compose  
- Hatchet durable tasks: https://docs.hatchet.run/v1/durable-tasks  
- Hatchet GitHub (MIT): https://github.com/hatchet-dev/hatchet  
- Inngest self-hosting: https://www.inngest.com/docs/self-hosting  
- Inngest execution / memoization: https://www.inngest.com/docs/learn/how-functions-are-executed  
- Inngest license (SSPL + delayed Apache 2.0): https://github.com/inngest/inngest/blob/main/LICENSE.md  
- Project law: `docs/architecture/01-decisions/ADR-0009-job-execution-in-postgres.md`  
- Stack either/or: `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` (DR-117)

---

*End of comparison artifact. Ready for the human stack sitting.*
