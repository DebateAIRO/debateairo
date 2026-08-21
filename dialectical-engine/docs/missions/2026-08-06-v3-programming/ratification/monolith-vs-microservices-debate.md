# Debate artifact — Modular Monolith vs Microservices for DebateAI-V3

| | |
|---|---|
| **Ordered by** | V, 2026-08-07: "fire some subagents and alongside Grok explore pros and cons to Modular Monolith and Microservices as architectures for our project… based on the V2 coding and V3 planning" |
| **Question** | Should V3's domain code be a modular monolith (the standing P1 posture, ADR-0001) or be decomposed into domain microservices? |
| **V's stated concerns** | (1) The code must respect SOLID, DRY, KISS. (2) "Our project needs to be scalable." |
| **Seats** | Grok (independent lens, read both repos itself) · Modular-Monolith Advocate (Opus) · Microservices Advocate (Opus) |
| **Grounding** | V3 planning pack (`docs/`) + V2 shipped code (`/Users/vladmihaimiron/Documents/DebateAIRO`) · read-only · no invented numbers |
| **Status** | **ALL THREE SEATS IN.** Grok verdict IN · Monolith brief IN · Microservices brief IN · Synthesis written |
| **Ruling** | **PENDING V.** This artifact argues; V rules. P1 stands as written until the verdict. |◊◊

---

# SEAT 1 — Grok, independent verdict

**Lens:** Grok (independent; no deference to prior positions)
**Mode:** read-only · grounded in ruled ADRs, founding docs, design patterns, and V2 source

## Framing (what this debate is actually about)

V3 already **ruled** process topology without ruling service-per-domain:

| Layer | Ruled shape |
|---|---|
| **Code units** | One pnpm workspace, dependency-edge table (27 rows), CI-asserted (`03-module-design.md` §3; P1) |
| **Deploy processes** | Compose services: `web`, `api`, `runner`, `scheduler`, `hatchet-engine`, `postgres`, `vllm` (ADR-0018) |
| **Host** | Single Hetzner box behind Cloudflare (DR-117) |
| **Durable execution** | Hatchet = **dispatcher only**; claim/ledger/`at_seq` stay ours (ADR-0017) |
| **Language** | One TypeScript type graph (ADR-0001 · AC-59 / AC-61 / AC-85) |

So "microservices" here means **splitting domain packages into independently deployable services with network contracts**, not "have more than one process." V3 already has multi-process deploy. The open question is whether **domain decomposition should ride network boundaries**.

## Ground truth from V2 (where the pain actually was)

V2 is already multi-process: FastAPI **coordinator**, poll **workers**, Next **web**, plus proxies (`apps/dialectical-engine/README.md`; `deploy/local-single-computer-dezbatere.md`). That did **not** prevent the defects V3 exists to kill.

### Pain was joins / mirrors / duplication inside the code — not "we needed more services"

| Defect class | Concrete V2 locus | Would network services fix it? |
|---|---|---|
| **D1 invented numbers** | `coordinator/app/qbaf/debate_adapter.py` — `DEFAULT_TAU = 0.5`; silent base scores; invented 0.7 for contradicted evidence | **No** — would reappear as adapter defaults on every service boundary |
| **D2 source-literal aggregation** | `protocol/runner.py` + `debate_adapter.py` semantics switch | **No** — config/authority problem, not topology |
| **D3 string-equality "dedup"** | inventory across `qbaf/dfquad.py`, `scoring/*`, `evidence/extraction.py:177` (no dedup) | **No** — multiplies copies of the same wrong key |
| **D4 provenance not joined** | carryover-manifest §10.4: *"The defect is the join, not the recording."* Flat `node_id → float` beside tau sources; UI never consumes provenance (`web/lib/types.ts`, `VerdictBanner`) | **Worse** — every hop needs a mirror; join failure becomes network-shaped |
| **Three disjoint graph models** | carryover-manifest §6.1: V2 has three graphs, nothing converts | **Worse** — each service tends to own "its" model |
| **Dual / triple transport** | Next catch-all `web/app/api/[...path]/route.ts` (suspicious-scoring hook) vs `scripts/web_proxy.py` (bypass) vs SSR `web/lib/serverApi.ts` → coordinator direct (`ui-boundary-contract` L5 / death list #11) | **Worse** — services love privileged internal paths |
| **Hand mirror types** | `web/lib/types.ts` (hand-authored; open `NodeType` as `string & {}`) | **Worse** — ADR-0001's exact AC-59 failure mode |
| **Writer contention** | `coordinator/app/core/write_lock.py` — lock-ordering deadlock with SQLite pool (documented 2026-07-26 incident) | Partial only via **Postgres + single-writer aggregate (P7)**; not via domain microservices |

**Verdict on V2:** process extraction (workers, local models) was useful and is already in V3's design. **Domain microservices would have amplified the defect class that killed V2** — adapters, joins, mirrors, dual front doors.

## Founding docs: what they ACTUALLY demand for "scale"

Grep of `docs/founding/requirements-spec.md` (and related founding surfaces) for load, concurrency, user counts, RPS, latency budgets, horizontal capacity:

| Claim | Founding-doc status |
|---|---|
| Concurrent users / RPS / peak QPS | **Not specified** — no invented figures |
| p99 API latency SLA | **Not specified** |
| Horizontal cluster size / multi-region | **Not specified** |
| What *is* required | Correctness under LLM-panel evaluation: pure propagation (AC-09), claim-before-call (AC-04), append-only ledger (AC-44/45), single store (AC-01/02), one front door (AC-60), one behaviour one place (AC-85), process metrics including **latency and cost per node** as *observability* (§16.1 Tier 1), compose-size / load-bearing priority (DR-058) — not traffic SLOs |
| Deployment posture | Single-host Compose (ADR-0018); V2 runbook is single-Mac `dezbatere.ro` |

So "our project needs to be scalable" is **underspecified as a product requirement**. The real scale dimensions in this system are: **model-call throughput**, **GPU for vLLM**, **Postgres write contention under single-writer / ledger sequence**, and **SSE fan-out on one front door** — not classic web request fan-out.

## 1. Modular monolith — FOR THIS PROJECT

### Pros

| Pro | Why it fits *this* stack |
|---|---|
| **AC-59 / AC-61 are structural** | Same package declarations for API + web; orphan audit is one type-graph walk (ADR-0001). No OpenAPI-codegen-as-truth pipeline. |
| **AC-85 enforceable by CI edge table** | Rule 6: read frozen facts from DB; call rules across declared edges — never re-implement (`03-module-design.md` §3.3). Microservices force re-implementation or a "shared kernel" service that recreates the monorepo. |
| **P7 / P10 / P13 stay coherent** | Graph single-writer, ledger `at_seq`, recorded evaluation order for replay — all same-process/same-DB transactions without distributed sagas. |
| **Matches ruled deploy** | ADR-0018 already separates **operational** processes (runner, scheduler, hatchet, vllm) without splitting the domain graph. P1 says: compose service ≠ module. |
| **Python episode is the cost measurement** | DR-105→117 showed cross-language (and by extension cross-service) boundaries replace *identity* with *gates*. Microservices are that cost again, in English. |
| **Honest scaling knobs already exist** | Scale `runner` replicas under Hatchet; scale GPU/host for `vllm`; tune Postgres — without redesigning the type graph. |
| **KISS for one Hetzner box** | One compose file, one backup lineage, one store (AC-02). |

### Cons (adversarial)

| Con | Honest weight |
|---|---|
| **Single-host resource contention** | ADR-0018 costs: API, workers, engine, DB, vLLM share one machine. Real risk under concurrent debates + local inference. |
| **Discipline, not the OS, enforces module law** | Edge table is CI; a hurried PR can still smuggle a bad import until CI fails. Network boundaries fail at deploy time instead — different failure mode, not always better. |
| **Blast radius of a bad deploy** | One bad release can take the whole app family (mitigated by process isolation of runner vs api vs vllm, but not by independent domain versioning). |
| **Team parallelism ceiling** | One repo/workspace; multi-team ownership friction appears only when team size grows past what monorepo ownership maps handle. **Not today's problem given founding docs.** |
| **SSE + long work in one product surface** | Must keep claim/ledger discipline carefully (ADR-0017 residual case D). Architecture does not make that free. |

## 2. Microservices — FOR THIS PROJECT

### Pros (steelman, then discount)

| Pro | Steelman | Discount for *this* project |
|---|---|---|
| Independent scale of axes | Scale "judgement workers" vs "serve API" separately | **Already available** via `runner`/`scheduler` processes + Hatchet without domain service splits |
| Failure isolation | Kill scoring without killing list API | Partial: process isolation already planned; domain microservices add **partial failure as normal**, which fights single-writer ledger and deterministic replay |
| Polyglot freedom | Python workers later | ADR-0001 prices this as **spending the type graph**; Hatchet allows it without redesign — still not free |
| Team ownership | Conway's law | Founding docs show **one operator / one product / single host**, not multi-team product lines |

### Cons (load-bearing)

| Con | Why it hurts *this* domain |
|---|---|
| **Recreates V2's D4 defect shape** | Every service boundary needs serializers; provenance "recorded beside" and not joined is the V2 death path. |
| **AC-59/AC-61 become gate-enforced** | Exactly the Python instantiation price list in ADR-0001 — three mechanisms where identity was free. |
| **AC-85 multiplies** | Serve rules, settlement rules, graph invariants will be reimplemented or over-fetched across RPC to "avoid a cycle." |
| **P7 single-writer becomes distributed locking or sagas** | Graph advisory lock + one transaction is the design; microservices turn that into "which service owns the lock?" |
| **P10 `at_seq` + dual bookkeeping** | Already accepting engine dual bookkeeping (ADR-0017). Domain services add *more* non-authoritative clocks. |
| **P13 replay ceremony** | VR-3 wants frozen records + pure arithmetic. Distributed write paths complicate "what is frozen" and "who wrote order." |
| **AC-02 / one store** | Microservices culture drifts to "service-owned DBs." That is a **ruling-level** conflict with AC-02 and DR-118's one-instance law. |
| **AC-60 second paths** | V2's dual-transport seam is the dress rehearsal. Internal service mesh + privileged SSR is the same bug class. |
| **LLM-bound work pays network tax twice** | Latency budget is model call + claim/ledger. Extra hops around the critical path buy little. |
| **Operational surface on one box** | More deployables, health checks, version skew on a **single Hetzner host** is pure cost. |

## 3. SOLID / DRY / KISS — answered directly

**These principles are not coupled to deployment topology.**
They are properties of **module boundaries, dependency direction, and single sources of truth**.

| Principle | What actually enforces it here | Monolith vs microservices |
|---|---|---|
| **S**ingle responsibility | Bounded contexts + edge table ownership (`03` §1.1, §3) | **Equal in theory**; monorepo CI can prove it. Microservices often *claim* SRP while dumping DTOs and anti-corruption layers into every service. |
| **O**pen/closed | Strategy + register (P8), pure cores (P2) | Language/module design, not process count. |
| **L**iskov / interfaces | Provider gateway Seam C (P4) | Already process-external for vLLM; **no need** for domain microservices. |
| **I**nterface segregation | `contract` package; apps as sinks | One facade (P3) is simpler than N public APIs. |
| **D**ependency inversion | Edge table: pure packages at bottom | Microservices often invert badly (shared "utils" service, or circular HTTP). |
| **DRY** | One type graph; AC-85; rule 6 "call, don't re-implement" | **Monolith wins structurally.** Microservices **force** duplication of contracts, auth, error taxonomies, or a shared library that is a monorepo in denial. |
| **KISS** | Single host, one store, dispatcher-only engine | Microservices on one box is **ceremonial complexity** — maximum moving parts for minimum traffic. |

**Direct answer:** Neither architecture *guarantees* SOLID/DRY/KISS.
**For this project's ruled constraints (AC-59, AC-61, AC-85, P7, P10, P13), the modular monolith with CI-asserted edges is the architecture that makes those principles *checkable*.** Microservices systematically pressure DRY and KISS unless you rebuild the monorepo as a multi-repo SDK — which is the monolith again, with worse deploy coupling.

## 4. Scalability — answered directly

### What must scale

1. **LLM panel evaluation** — many model calls per debate; bound by provider/vLLM throughput and attempt budgets (DR-020), not by HTTP QPS.
2. **vLLM** — separate process (already); bottleneck is **GPU/memory on the host** (ADR-0018 costs).
3. **Single-writer graph + ledger sequence** — **sequential by design** (P7, P10). Horizontal "scale out writers" **fights the product**.
4. **SSE fan-out** — one front door through Cloudflare; bottleneck is connections + proxy buffering (ADR-0018 clause 1 forbids a second path as "fix").
5. **Postgres** — one instance co-tenanting product + Hatchet (DR-118); shared capacity is **accepted**.

### Where the bottleneck is **not**

- Classic "API tier CPU under millions of users" — **founding docs never state that load.**
- Need for independent deploys of `judgement` vs `evidence` as products.

### Horizontal scaling under each

| Axis | Modular monolith (current posture) | Domain microservices |
|---|---|---|
| Model work | **N `runner` workers** claiming `core.work_item` via Hatchet; scale workers | Same, but each domain service still waits on the same gateway/ledger laws — **no free lunch** |
| Inference | Scale/move **`vllm`** host/GPU (operational split allowed if one durable store survives — ADR-0018) | Unrelated to domain service count |
| Graph/ledger | Scale **up** Postgres; careful claim/reaper; **not** multi-writer | Worse: distributed consensus or lost invariants |
| Read/SSE | Scale `api` replicas carefully with sticky/SSE config; still one contract | Multiple services → multiple streams → AC-60 risk |
| Host pressure | Split hosts later **without** changing module architecture | Premature split of domains does not fix GPU contention |

**Direct answer:** Real scalability for this system is **worker fan-out + inference capacity + Postgres write path**, under **single-writer and append-only constraints**. A modular monolith with process-separated runners and vLLM **matches those axes**. Microservices address a bottleneck (independent domain deploy/scale) that **the founding docs do not demand and that the single-writer ledger partially forbids**.

## 5. ONE recommendation

**Recommend: modular monolith with enforced module boundaries (P1) — keep the ruled multi-process shell (`api` / `runner` / `scheduler` / `hatchet` / `postgres` / `vllm`), refuse domain microservices.**

**Justification.** V2 already tried multi-process deployment; its failure modes were **adapters inventing numbers, provenance not joined, three graph models, and three transport paths** — all *code-join* defects. V3's hardest laws (one type graph, one behaviour one place, claim-before-call, append-only `at_seq`, pure replay arithmetic) are **monorepo identity properties**, not network properties. The deployment that was ruled (single Hetzner Compose) already extracts the *actual* heterogeneous resources (GPU inference, durable dispatcher, long workers) as services that are **not modules**. Further domain service splits would re-introduce the measured cost of the Python episode (gates instead of identity) while fighting P7/P10 and inventing load numbers the founding docs never gave. Scale the **workers and vLLM**; keep the **domain graph in one type system**.

## 6. Flip conditions (when Grok would reverse to microservices)

Extraction of a domain service only if **several** of the following become measured facts (not vibes), and extraction is scoped (not a wholesale rewrite):

1. **Measured multi-tenant load** that saturates a well-tuned monolith on **API/SSE** while workers and GPU are idle — *and* founding/product docs gain real concurrent-user or connection targets. (Today: no such numbers.)
2. **Independent team ownership** of a bounded context with a **hard release cadence conflict** that monorepo ownership cannot absorb (e.g. two full-time teams shipping weekly against each other with permanent merge pain).
3. **Isolation requirement** (regulatory, multi-tenant hard tenancy, blast-radius mandate) where **process isolation is proven insufficient** and a separate deployable + credential boundary is required.
4. **Asymmetric resource profile** of one package that **cannot** be expressed as a worker pool or sidecar (unlike vLLM/Hatchet today) — e.g. a separate language runtime forced by hardware, with the **type-graph cost explicitly re-priced** in a human sitting (DR-116 rule).
5. **Proven need for independent failure domains** where a crash in package X must not share a process with Y — and the extractable unit has a **tiny, frozen, versioned contract** that does not touch graph single-writer or ledger sequence (candidate-ish: pure offline batch analytics — *not* serve/judgement/graph).
6. **Operational measurement** that RabbitMQ/second store or multi-host becomes necessary **and** domain ownership split is the only way to keep SLO — still: split **process/host first**, domain service last.

**Default flip order (cheapest first):**
(1) more `runner` replicas → (2) bigger/separate GPU host for `vllm` → (3) Postgres capacity / connection tuning → (4) split API vs workers across hosts **keeping one repo and one store** → (5) only then consider a **single** domain extraction with a written contract and AC-59/61 price tag.

Until those triggers are real, microservices for this project are **premature topology theater** — and adversarial to the defects V3 was rebuilt to eliminate.

### Closing adversarial notes

- **Against soft monolith cheerleading:** P1 without CI edge enforcement and structural rule 6 is just a big ball of mud with nice folders. The recommendation is **modular monolith as machine-checked law**, not "one repo forever and hope."
- **Against soft microservice cheerleading:** "Scalable" without founding load numbers, under single-writer ledger and vLLM-bound work, is an empty slogan. V2's multi-process layout already proved process count ≠ correctness.
- **Against deferring to Claude:** this verdict rests on ADR-0001/0017/0018, module edge law, P1/P7/P10/P13, founding absence of load figures, and concrete V2 paths (`debate_adapter.py`, `types.ts`, dual proxy/SSR, write_lock deadlock, carryover D1–D4).

---

# SEAT 2 — Modular-Monolith Advocate (Opus)

**Seat:** Modular Monolith Advocate · **Grounding:** V3 planning pack + V2's shipped code · **Status:** read-only, nothing modified

## 0. The finding that reframes the whole debate

**V2 was already a distributed system, and it is the defendant here — not the monolith.**

`/Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine/` shipped as **three services in two languages across two machines**:

| Service | Language | Size | Deploy unit |
|---|---|---|---|
| `coordinator/` | Python/FastAPI | 261 `.py` files, 17 domain dirs | `deploy/launchd/coordinator.plist` |
| `worker/` | Python | 26 files, 13 model adapters | `deploy/launchd/worker.plist` |
| `web/` | Next.js/TS | 46 files | `deploy/launchd/web.plist` |

Plus `watchdog.plist`, `lmstudio-worker.plist`, `cloudflared.plist` — **six launchd services** on a Mac mini + MacBook.

So the question is not "would services have saved V2?" We have the experiment. **V2 ran the microservices arm and produced D1–D5.** And V2's *internal* structure was a monolith with **no enforced boundaries at all** — `coordinator/app/scoring/service.py` imports freely from `app.core`, `app.models`, `app.providers`, `app.services`, `app.scoring.*` with nothing but folder convention holding the line.

**V2 paid every cost of distribution and captured none of the discipline.** V3's proposal is the exact inverse: pay one-process simplicity, and buy the discipline with CI.

## 1. PROS of the modular monolith for THIS project

### P1 — Boundaries become machine-checked instead of aspirational
`docs/architecture/03-module-design.md` §3.1 is a **27-row dependency edge table**: "the package on the left may import the packages on the right, and nothing else in the workspace. **Absence of an edge is a prohibition, not an omission.**" §12 makes it a CI gate ("dependency-graph assertion → CI failure"), with six structural rules, `apps/*` as graph sinks, and proven acyclicity.

This is a **stronger** boundary than a network call, because a network call is a boundary you can always place *one more* of. An absent edge cannot be routed around.

### P2 — Purity is a graph property, not a code review
`propagation` and `battery/decision` may import *nothing* but `kernel`/`published-arithmetic` (rows 3–4, structural rules 1 and 5). ADR-0001 makes AC-09's "no model calls, no I/O, no clock, no randomness, no DB" **a build-time gate**: zero-dependency package + `no-impure-import` lint. Design-patterns P2 states why the fence is airtight: "the closure is small… there is no permitted package through which impurity could arrive."

**A service boundary cannot express this.** "This service performs no I/O" is unenforceable across a network; an import fence over a closed dependency closure is decidable.

### P3 — AC-59's "no adapter" is structural, and V2 proves what the alternative costs
ADR-0001: "the wire types the API serves and the types the interface consumes are the **same declarations** in one package." The measured alternative is on the record — ADR-0001 §"The superseded episode" priced the cross-language boundary and concluded: **"three gates carried what one identity carried… Exactly one thing improved."**

The physical evidence is V2's `/Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine/web/lib/types.ts` — **823 lines, 24 KB of hand-maintained mirror**. Pure duplication, existing only because a process/language boundary sat between producer and consumer.

### P4 — AC-61's bidirectional orphan audit is one static walk
`tools/orphan-audit` decides *served ⇒ consumed* and *consumed ⇒ served* over **one TypeScript program including `web`** (row 26; DR-069 no fence + DR-117 one language). §12: G2's never-called list **BLOCKS the release**.

V2 could not answer this question at all, in either direction. Recorded in `docs/founding/ui-boundary-contract.md` L6: served-and-unread (`score_provenance` — "the single open-schema field on the wire… absent from `types.ts` and read by nothing", `evidencePresence`, `argument_claim`, `judge_disagreements`, `score_caps`) and declared-but-never-served (`DebateNode.lens`, `DebateNode.score`, `DebateDetail.scoring`).

### P5 — The append-only ledger's total order needs one process family
P10: total order from "a dedicated sequence allocator **under a write lock**". P7: all graph writes in one transaction under a **per-graph advisory lock**. ADR-0017 clause 2: "Where they disagree, `at_seq` wins."

These are **single-writer serialization points by design**, because AC-07 demands byte-identical replay. A monolith expresses them as a transaction. Services express them as distributed consensus — new machinery, new failure modes, in service of a property distribution actively fights.

### P6 — One compose file makes credential separation reviewable
ADR-0018 clause 2: the replay ceremony's read-only role, and `apps/scheduler`'s **three jobs not sharing a credential**, are real *because* "one compose file is the whole deployment description." VR-3 limb (iii) operator independence becomes a topology fact in an artifact you can read in one sitting.

### P7 — The stable core is topology-independent, and this was proven, not predicted
ADR-0003 §"The superseded episode": through a full language replacement **and its reversal**, "`02-data-model.md` was not opened in either direction. The DDL — every `CHECK`, trigger, partial unique index, graph-scoped composite FK and revoked grant — survived untouched." Module design §"Two things a reader should know": "the context map, the package inventory, the 27-row dependency edge table, the six structural rules, the four seams and every invariant-ownership row **never moved**."

**The things that make this system correct are invariant-ownership statements. Topology buys nothing on that axis.**

## 2. CONS conceded, on the record, with severity

| # | Concession | Severity | Detail |
|---|---|---|---|
| **C1** | **AC-85 "one behaviour, one place" is NOT fully machine-checked** | **MEDIUM — V's instinct is correct here** | §3.3 rule 6: the import half is the edge assertion, but the "no re-implementation" half is *"checked at review, not by CI."* Charter A3.6 (the maintenance test) is **ADVISORY**, not RATIFIED. **Verified as instructed and it does not fully hold.** A service boundary would not *prevent* re-implementation either — but it would make it *visible*, because a duplicate would have to be re-served. |
| **C2** | An import fence cannot see **local re-declarations** | **LOW-MED** | Structural rule 2 asserts `web` imports types only from `contract` — nothing stops `web` declaring a local wire shape beside it. Flagged by Codex at `docs/missions/2026-08-06-v3-programming/reviews/pre-10-codex.md` finding 2. Smaller under one type graph than two, not zero. |
| **C3** | **Blast radius**: one process family, one bad deploy | **MEDIUM** | Services give independent deploy and fault domains. P15 bulkhead isolates a panel member's failure to a typed note, but that is in-process isolation, not process isolation. |
| **C4** | **Single-host resource concentration** | **MEDIUM** | ADR-0018's own Costs: "API, workers, engine, database and model server share one machine's resources… the model server adds GPU/memory pressure on the same host." ADR-0017 §A con 8: engine polling competes with graph and ledger writes for Postgres capacity. |
| **C5** | **Clean-room has no enforcement mechanism** | **ACCEPTED (V priced it)** | DR-069: "DR-003's clean-room mandate has no enforcement mechanism under this ruling — compliance is an honour system." A separate checkout *would* have enforced it. V ruled the trade knowingly; §2 says do not re-raise it. |
| **C6** | **Language monoculture forfeits best-in-class tools** | **LOW** | ADR-0001 names it plainly: hypothesis over fast-check was "genuinely better in kind" for charter S2's mandatory property layer. |
| **C7** | **The scaling ceiling is real and needs a human ruling to move** | **MEDIUM** | ADR-0017 clause 6: moving even the engine's schema to a second Postgres instance "is **NOT** an operational decision… it requires a new human ruling." See §3.2. |

### Where microservices genuinely win — conceded without hedging
1. **Hard fault isolation** between components with different failure profiles.
2. **Independent scaling** of one genuinely hot component.
3. **Independent deploy cadence** for multiple teams.
4. **Polyglot** where a domain truly needs another runtime.
5. **Hard resource isolation** (CPU/GPU/memory ceilings per component).

**And V3 already takes all five, exactly where they pay.** ADR-0018 runs seven compose services. `vllm` is a separate service over HTTP (Python). `hatchet-engine` is a separate service (Go). ADR-0001 records this as "an **operational** polyglot surface, not a code one."

> **The debate is not monolith vs. services. V3 is already a hybrid. The question is only WHERE the boundary goes — and V3 puts one wherever it buys fault isolation, resource isolation, or a runtime we don't own, and refuses one wherever it would only buy a join.**

## 3. Direct answers to V's two concerns

### 3.1 SOLID, DRY, KISS — are these coupled to deployment topology?

**No. Not one of them. They are module-level properties, and a network hop neither creates nor enforces any of them.** The proof is that V2 *had* the network hops and violated all three.

| Principle | How V3's monolith enforces it | What V2's service split did to it |
|---|---|---|
| **SRP** | §4.1: one context owns each invariant. §3.3 rule 6: "frozen facts are read; rules are called." | `web/app/api/[...path]/route.ts` — the **transport proxy** imports `recordSuspiciousScoringResponse` and performs **domain validation**. A transport layer making a policy decision. |
| **OCP** | P8 Strategy + Registry resolution chains; operator resolves parent→run→deployment; "a source-literal selection is a defect by definition." | D2: hardcoded aggregation via source-literal operator. Config sprawled into `launchd` plists as `DIALECTICAL_*` env flags. |
| **LSP** | P12: discriminated unions + `require-exhaustive-switch` (**both halves**) + one runtime schema + a Postgres CHECK. | `NodeType = LegacyNodeType \| (string & {})` — the union was **deliberately opened** to `any string` because the consumer could not trust the producer across the wire. |
| **ISP** | **The edge table *is* interface segregation**, written down in 27 rows and asserted by CI. Row 23: `apps/replay` may import exactly one package. | No declared interfaces at all — folder convention only. |
| **DIP** | P4: one provider gateway; provider identity is "a **configured value, not an import**." Seams A–D invert every dependency that matters. | Honest note: V3 **rejects DI containers** (charter A3.6 — "construction is explicit, no service locator"). V3 does DIP via seams, not frameworks. |

**DRY is the decisive one, and it runs the opposite way from the microservices intuition.**

> **A service boundary is a DRY violation generator.** Every wire crossing forces the same shape to be declared on both sides. That is not a bug in how V2 did microservices — it is what a service boundary *is*.

V2's receipts:
- `web/lib/types.ts` — **823 lines of duplicated shapes**.
- `errors[].status` — a 2-member closed vocabulary "**pinned in both `models.py` and `types.ts`**" (ui-boundary-contract §row 8). One vocabulary, two declarations, two languages, no gate between them.
- `web/lib/scoring/scoringResponseSpecification.ts` — the frontend maintains **a specification of what the backend should have sent**, emitting `missing_required_fields` and `missing_artifact_chain` findings. A second copy of the contract living on the consumer side.
- `web/lib/scoringResponse.ts` — 13.6 KB of defensive re-derivation, including **string-sniffing the wire**: `looksProviderOrTokenRequired()`, `isMissingJudgeOutputReason()`.
- Surface #6: `GET .../scoring` was a separate call **joined client-side by `node_id`** (`indexScoringResponse`). The distributed system pushed a join into the browser.

**KISS:** V3 ships one compose file. V2 needed a **24,500-byte Makefile**, a `production_readiness.sh`, a `production_acceptance_sequence.sh`, six launchd plists and a preflight checker — to run three services on two Macs.

**Verdict on 3.1: SOLID is served by module boundaries, which the monolith enforces in CI and V2 did not enforce at all. DRY is actively damaged by service boundaries, with 823 lines of proof. KISS is not close.**

### 3.2 Scalability — the honest answer, including the ceiling

#### The finding the advocate is obliged to report

**A search of the entire founding and architecture pack for a load requirement finds none.**

`grep` across `docs/founding/` and `docs/architecture/` for *scalab·, horizontal, autoscal, concurrent, throughput, requests per second, p95, p99, SLA, SLO, traffic, simultaneous users, peak load* returns **zero requirements**. Every "scale" hit is the word *scalar* (a number) or "the supported↔unsupported **scale**" (a verdict band). The only `throughput` in the pack is conditional and about RabbitMQ: *"add Rabbit only if throughput forces it."*

**There is no stated user count, no concurrency figure, no latency budget, and no availability target anywhere in `docs/founding/requirements-spec.md`.** No number invented here. The measured baseline is V2's actual production: **one Mac mini + one MacBook worker behind a cloudflared tunnel**, serving `dezbatere.ro`.

This does not make V's concern illegitimate — it makes it a concern about *the shape of the future*, which deserves a concrete answer:

#### What horizontal scaling of this monolith actually looks like

| Tier | How it scales | Ceiling |
|---|---|---|
| `web` (Next.js SSR) | stateless — **N replicas**, trivially | none in practice |
| `api` (Fastify) | stateless — **N replicas**. Authorization is per-request against a payload class (ADR-0013); nothing is held in process. Caveat: **SSE holds long-lived connections**, so replicas need connection-count headroom, not statefulness. | file descriptors / memory per replica; horizontal |
| `runner` | **This is the real horizontal axis.** P11: competing consumers on `core.work_item` via `SELECT … FOR UPDATE SKIP LOCKED`, dispatched by a **Hatchet worker fleet** (ADR-0017). Add worker processes; `SKIP LOCKED` makes them safely concurrent. Work items are idempotent `(row, node-set)` commands. | Postgres claim throughput |
| `vllm` | separate compose service over HTTP, selected by a **register row** (ADR-0018 clause 3b). Scale the GPU tier independently; add hosts; put a load balancer in front. **Zero code change** — provider identity is "a configured value, not an import." | GPU capacity — **and this is the true bottleneck for an LLM-panel system** |
| `postgres` | vertical first; read replicas for the CQRS read side (P6 — projections computed at read time from frozen artifacts, replica-friendly) | **the hard ceiling** |

**The workload is vLLM-bound.** For a system whose unit of work is a panel of LLM judgements, the wall clock is dominated by inference, and ADR-0018 already puts inference on its own independently-scalable service. **The scaling story is solved for the one tier that actually saturates**, and it was solved without decomposing the domain.

#### The honest ceiling — where the monolith's story runs out

**The wall is `postgres`, and it is placed by law, not by accident.**

1. **AC-02 — one store.** ADR-0017 clause 6: the engine's schema lives on **the one Postgres instance**, and "moving the engine to a second instance is **NOT an operational decision**… it requires **a new human ruling** under DR-116's rule, not a capacity judgement at deploy time. The shared-capacity cost is real and is **accepted**, not held open as an exit."
2. **P10 — one sequence allocator under a write lock.** `at_seq` is a **global total order**. Every ledgered attempt passes through it.
3. **P7 — one advisory lock per graph** for all node/arrow writes.

When ledger write throughput saturates that instance, the monolith is out of road.

#### But — the load-bearing point — **microservices do not move that wall**

The serialization points above are **required by the product, not by the topology**:

- AC-07 demands **byte-identical deterministic replay**. That requires a recorded total order (AC-08, P13). A total order is, definitionally, a serialization point.
- AC-45 demands an **append-only ledger in our order**.
- P7 demands a **single-writer aggregate**.

Decompose into services and you get exactly two outcomes:

- **Services sharing one Postgres** = a **distributed monolith**. Same ceiling, plus N network hops, N deploy pipelines, and V2's join defects back in the building.
- **Services with separate databases** = AC-02, AC-45, AC-07 and P7 broken. Trading **the correctness properties that are the entire reason V3 exists** for throughput nobody has asked for.

> **Honest closing on scalability: the monolith's ceiling is one Postgres instance's write capacity on a globally-ordered append-only ledger. Microservices would not raise that ceiling — they would raise it only by abandoning the determinism guarantee that sets it. Before that ceiling binds, there are three cheaper moves in order: scale the GPU tier, add runner workers, split hosts (explicitly permitted — ADR-0018: "Splitting hosts later is an operational change, not an architectural one").**

## 4. The V2 autopsy — what actually hurt, and which architecture fixes it

### The headline wound: the three-path transport seam

`docs/founding/ui-boundary-contract.md` death-list entry #11, quoted:

> Two mutually exclusive front doors for `/api/*`: the Next catch-all (`web/app/api/[...path]/route.ts`, which alone runs the `recordSuspiciousScoringProxyResponse` hook) and `scripts/web_proxy.py` (the launchd front door, which routes `/api/*` **straight to the coordinator, bypassing that hook entirely**) — plus SSR, which calls the coordinator directly and uses neither. **which one is live on V's machine could not be determined without running it.**
> **DEAD — replaced by law L5, one transport. A safety hook that only fires on one of three paths is not a safety hook.**

All four artifacts verified to exist:

| Path | File | Behaviour |
|---|---|---|
| 1 | `web/lib/api.ts` | browser client, `API_BASE = NEXT_PUBLIC_API_BASE \|\| ""` → relative → hits the Next catch-all |
| 2 | `web/app/api/[...path]/route.ts` | Next catch-all proxy → `DIALECTICAL_COORDINATOR_URL`; **the only path running the scoring safety hook** |
| 3 | `scripts/web_proxy.py` | 18 KB Python proxy, `DEFAULT_COORDINATOR_PREFIXES = ("/api/", "/healthz", …)` → **straight to coordinator, hook bypassed** |
| 4 | `web/lib/serverApi.ts` | SSR client → coordinator **directly**, its own timeout, its own `CoordinatorHttpError` — uses neither proxy |

**Diagnosis: this is a topology pain that services *caused*.** A single front door is trivially maintainable when there is one process serving it. Three paths grew because `web` and `coordinator` were separate deployables, and each new integration problem had a locally-reasonable network answer. Adding a fourth service multiplies this — it does not divide it.

**V3's fix:** AC-60 one transport front door; `apps/api` is the sole implementation, **SSE is a route on it, not a second front door** (P3); SSR is an ordinary, never-privileged caller (AC-57). ADR-0018 clause 1 closes the exact escape hatch V2 took: *"no `/api/*` proxy inside `web`, no second hostname, no direct-to-origin route that skips Cloudflare for some callers… **A path that exists only for one caller is the V2 seam AC-60 exists to forbid.**"* And it pre-refuses the operational temptation: SSE buffering *"is fixed as proxy configuration; the fix is never a second path."*

### The rest of the wound list, classified

| V2 pain | Evidence | Topology pain, or join/duplication pain? |
|---|---|---|
| 823-line hand-kept type mirror | `web/lib/types.ts` | **Join** — services multiply it |
| Consumer-side contract spec | `web/lib/scoring/scoringResponseSpecification.ts` | **Join** — multiply |
| Client-side `node_id` join | `indexScoringResponse` (surface #6) | **Join** — multiply |
| Vocabulary pinned twice | `errors[].status` in `models.py` **and** `types.ts` | **Join** — multiply |
| Wire string-sniffing | `looksProviderOrTokenRequired`, `isMissingJudgeOutputReason` | **Join** — multiply |
| Bidirectional orphans | `score_provenance` served-unread; `lens`/`score` declared-never-served; `v2_generation_readiness` discarded | **Join** — multiply |
| Three transport paths | above | **Topology** — services *caused* it |
| Config sprawl across processes | `DIALECTICAL_*` flags in `coordinator.plist` | **Topology** — services *caused* it |
| D1 invented numbers (0.5/0.0/0.7 fallbacks) | `coordinator/app/scoring/` | **Neither** — a domain-law failure. Topology-neutral. |
| D2 hardcoded aggregation | source-literal operator | **Neither** — topology-neutral |
| D5 unreachable calibration | dead config path | **Neither** — topology-neutral |

**Verdict of the autopsy: of eleven named V2 pains, six get strictly worse with more services, two were caused by having services, and three are indifferent to topology. Not one is fixed by adding a service boundary.**

### The one V2 split that worked — and V3 keeps it

`worker/app/adapters/` holds 13 model adapters (`lmstudio`, `ollama`, `claude_cli`, `codex_cli`, `gemini_api`, `grok_cli`, `xai_api`…) behind a coordinator-polling client. **The inference tier as a separate process was V2's correct decision** — different resource profile, different failure mode, different lifecycle.

**V3 keeps exactly that split and only that split**: `vllm` as a separate compose service over HTTP, behind `packages/providers`' one `call(...)` interface (ADR-0018 clause 3, P4). This is not a coincidence — it is the evidence-based boundary, kept because it earned its keep, while the boundaries that only produced joins were deleted.

## 5. The extraction path — how a module leaves later, and what it costs

**ADR-0018 grants the permission up front:** *"Splitting hosts later is an operational change, not an architectural one — **provided nothing acquires a second durable store while doing it**."* That proviso is the whole cost model.

### What makes extraction cheap
1. **The surface is already written down.** §3.1 gives every package a declared, CI-asserted import list. You never have to *discover* a module's boundary — you read the row.
2. **`apps/*` are sinks.** Nothing imports an application. Every app is already a leaf.
3. **The four seams are already process-shaped.** Seam A's `EvaluationSnapshot` is "an immutable in-memory value" — already serializable. Seam C is already `call(typed role, lane, CallBound, contractHash, PromptPacket) → RawArtifactRef` — already one interface, already speaking HTTP to vLLM. Seam B is a write API. Seam D is already a read/write split.
4. **`packages/contract` already declares every wire shape once** — a new front door reuses the declarations rather than mirroring them.
5. **The extraction is already proven once.** `apps/replay` (row 23) imports **exactly one** workspace package and reaches Postgres through the driver directly under read-only credentials, with a CI **isolation proof at symbol granularity**. That is a fully extracted component running inside the monolith today.

### The cheapest-first extraction ladder

| Order | Module | Cost | Why |
|---|---|---|---|
| 1 | `propagation`, `battery/decision` | **Near-free** | Pure, zero-dependency, stateless. Input is an immutable snapshot, output is a value. Add transport, done. |
| 2 | `providers` gateway | **Cheap** | Already one interface, already HTTP-bound to vLLM. Caveat: it writes ledger rows (AC-13/AC-44), so it needs the ledger. |
| 3 | `evidence` retrieval | **Moderate** | I/O-bound, externally-facing, few shared invariants — but shares `graph`. |
| 4 | `graph`, `ledger`, `settlement` | **Expensive → blocked** | See below. |

### What makes extraction expensive — named honestly

1. **AC-02, one store.** Any extraction wanting its own database needs **a new human ruling**, not an ops decision (ADR-0017 clause 6). This is the single biggest brake, and it is deliberate.
2. **P7's per-graph advisory lock.** An in-process Postgres advisory lock does not survive splitting a *writer*. The single-writer aggregate must stay whole, or you buy distributed locking.
3. **P10's `at_seq` allocator.** Split writers must still share one sequence allocator — so `ledger` cannot become N independent services without keeping a shared serialization point, which is the thing extraction was supposed to remove.
4. **AC-07 byte-identical replay.** Extraction inserts network nondeterminism precisely where the replay ceremony must reproduce results.
5. **Rule 6's frozen-fact reads.** "A unit may read another context's already-frozen facts from the database without importing that context's package." Every such cross-context read becomes an API call on extraction. **This is the largest mechanical cost — and it is countable**: it is exactly the set of cross-context DB reads, enumerable today from §4.1 and §3.1.

**The honest summary:** the pure tiers extract almost for free; the stateful core extracts only by reversing laws V has already ruled. That asymmetry is not an accident — it is the design telling you where a boundary would be real and where it would be theatre.

## 6. Closing statement — flip conditions

Not arguing that microservices are wrong — arguing that **for this system, at this moment, with these requirements, a boundary must earn its keep — and only three have.** V3 already grants those three: `vllm`, `hatchet-engine`, `postgres`.

**Flip to further decomposition when any of the following is true. Each is falsifiable, and none is a matter of taste:**

1. **A measured Postgres write ceiling** on the ledger sequence allocator — *measured*, recorded per AC-74 discipline, and only after vertical scaling, GPU-tier scaling, and host-splitting are exhausted. Even then the first move is splitting hosts (permitted, operational), not splitting the domain.
2. **A second team with an independent release cadence.** One deploy unit is a coordination cost that scales with headcount, and CI-enforced module boundaries do not solve merge-queue contention. Today the project has one authority; this trigger is inactive.
3. **A domain that genuinely requires another runtime.** Already permitted and already priced — ADR-0001 leaves the polyglot worker lane open ("workers TypeScript *initially*"), ADR-0017 confirms it needs no control-plane redesign. Taking it spends the single-type-graph property, and ADR-0001's superseded episode is the invoice.
4. **A component whose failure must categorically not touch the rest.** Conceded as a genuine microservices win — and already exercised for `vllm` and `hatchet-engine`.
5. **A regulatory or tenancy requirement forcing physical data separation.** This reverses AC-02 and needs a human ruling regardless of topology.

**What does *not* trigger the flip, stated plainly:**

- *"Microservices are needed for SOLID/DRY/KISS."* They are not. SOLID is a module property, enforced here by a CI-asserted 27-row edge law. DRY is **damaged** by service boundaries — `web/lib/types.ts` is 823 lines of proof, and `errors[].status` was pinned in two languages because a wire ran between them.
- *"It feels more scalable."* The pack states **no** load requirement. The bottleneck is GPU, and GPU is already its own service. The ceiling is a globally-ordered ledger, and that ceiling is set by the determinism guarantee — not by the topology.
- *"It worked for large companies."* It did not work for V2, which ran three services in two languages across two machines and produced a safety hook that fired on one of three paths, with nobody able to say which path was live without running the machine.

**The case in one sentence:**

> V2 already ran the microservices experiment and lost — not because the split was executed badly, but because every boundary it drew between producer and consumer of the same model created a join, and the join was the defect. V3's modular monolith keeps the three boundaries that isolate a *runtime* and deletes the ones that only isolated *a type declaration from itself* — and it replaces the network, which was never enforcing anything, with a dependency-edge table that CI actually checks.

**Concessions on the record:** AC-85's one-behaviour-one-place is enforced by review, not by CI (§3.3 rule 6, charter A3.6 ADVISORY). The import fence cannot see local re-declarations. Blast radius and resource isolation are genuinely weaker. And the single-Postgres ceiling is real, accepted, and movable only by a human ruling. **Those are the four honest costs, for V to rule on with the numbers in front of them.**

### Files cited (absolute)

**V3 planning** — `/Users/vladmihaimiron/Documents/DebateAI-V3/docs/`: `architecture/01-decisions/ADR-0001-language-and-runtime.md` · `ADR-0003-postgres-access-and-migration-tooling.md` · `ADR-0017-durable-execution-hatchet.md` · `ADR-0018-deployment-topology.md` · `architecture/03-module-design.md` (§1.1–1.3, §3.1 edge table, §3.3 structural rules, §5 seams, §12 gates) · `missions/2026-08-06-v3-programming/design-patterns.md` (P1–P18 + anti-patterns) · `missions/2026-08-06-v3-programming/reviews/pre-10-codex.md` · `founding/requirements-spec.md` (searched — **no load requirement**) · `founding/ui-boundary-contract.md` (L1–L11, §2 fourteen surfaces, §3 death list entry 11) · `founding/quality-charter.md` (A3.1–A3.6)

**V2 code** — `/Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine/`: `web/lib/types.ts` (823 lines) · `web/lib/api.ts` · `web/lib/serverApi.ts` · `web/app/api/[...path]/route.ts` · `scripts/web_proxy.py` · `web/lib/scoringResponse.ts` · `web/lib/scoring/scoringResponseSpecification.ts` · `coordinator/app/scoring/service.py` · `worker/app/adapters/` · `deploy/launchd/*.plist` · `Makefile` (24,500 bytes)

---

# SEAT 3 — Microservices Advocate (Opus)

**Seat:** Microservices Advocate · **Posture:** READ-ONLY, nothing modified · **Grounding:** V3 planning repo + V2 codebase (`/Users/vladmihaimiron/Documents/DebateAIRO`)

## 0. Two findings on the record before arguing, because they bound everything below

**Finding A — there is no load requirement anywhere in the pack, and the architecture says so itself.**
Grep of `docs/founding/requirements-spec.md`, `docs/founding/quality-charter.md` and all of `docs/architecture/` for concurrency, throughput, RPS, latency targets, p95/p99, user counts, uptime and availability targets: **every hit on "load" is the word "load-bearing"** — a semantic term about claims, not traffic. The only relevant sentence in the corpus is `ADR-0006-ledger-ordering-and-hash-triple.md:150-152`:

> "The sequence allocator is a serialization point. The plan states no throughput target and this ADR invents none (AC-76 · DR-039); any bound is a register key."

`ADR-0009-job-execution-in-postgres.md:399-401` repeats it for the queue: *"the queue's operational values — poll interval, batch size, worker count. The plan states none and this ADR invents none."* **No number invented here.** Any argument from scale is therefore an argument from *anticipated* load, and must be labelled as such. V asked for scalability; the pack has not yet said what scale means. That is the first thing the debate should fix, and it is not an architecture decision.

**Finding B — V3 as ruled is already a seven-service deployment. This debate is narrower than its title.**
`ADR-0018-deployment-topology.md:55-66` names the compose services: `web`, `api`, `runner`, `scheduler`, `hatchet-engine`, `postgres`, `vllm`. Four of those are V3 application processes with independent replica counts; `apps/replay` is a fifth, separately scheduled under its own read-only credential. The "modular monolith" of design-pattern **P1** is not one process — `03-module-design.md` §1.3 says *"one process family."*

So the live question is **not** monolith-vs-services. It is: **should any module acquire its own datastore and its own release train?** `AC-02` (one store) answers the datastore half by ruling. The case must therefore be made on release trains, blast radius, and admission control — not on process count, which is already granted.

## 1. Proposed service decomposition

Constraint accepted up front: **`AC-02` forbids a second durable store**, so this is a shared-database service fleet. Purists call that an anti-pattern. The label is owned; the alternative is arguing to overturn `AC-02`, and this seat does not, because `ADR-0006`'s total-order ledger and `AC-07`'s byte-identical replay both die with it.

### The cuts this seat would make

**S1 · `gateway-svc` — extract Seam C (`packages/providers`)** — *the strongest cut, and the only one defensible in isolation.*

| | |
|---|---|
| **Owns** | The one provider interface (`AC-36`), lane assignment + context isolation (`AC-39`), typed call bounds, unconditional raw-artifact persistence (`AC-13`), the ledger row (`AC-44`), the maker inventory (`AC-38`) — **plus GPU admission control and per-maker circuit breaking, which today have no owner.** |
| **Wire contract** | `POST /internal/v1/call` → body `{ role: TypedRole, lane: Lane, bound: CallBound, contractHash, packet: PromptPacket }` → `202 { attemptId }` then `GET /internal/v1/attempts/{id}` → `RawArtifactRef`. Types are the *existing* `03-module-design.md` §7 signature, imported from `packages/contract` — **no new declaration, no mirror.** Plus `GET /internal/v1/capacity` → `{ lane, inFlight, admitted, queueDepth }`. |
| **Why here** | It is already a seam with one narrow interface. It is *"the only place a model artifact enters V3"* (design-patterns **P4**), which makes it the only place `DR-115` can be broken — a security-grade argument for its own process and credential. And it is the front door of the true bottleneck (§4). |

**S2 · `stream-svc` — extract the SSE observer (P14)**

| | |
|---|---|
| **Owns** | Long-lived SSE connections; folds `run_progress_event` and pushes the closed event vocabulary from `packages/contract`. Zero writes. |
| **Wire contract** | `GET /v1/runs/{id}/events` (SSE), same closed vocabulary, same `packages/contract` declarations, **same origin path through Cloudflare** — routed by path at the edge, not by a second hostname. |
| **Why here** | Connection-lifetime workload with an fd/memory profile nothing like request-response; today a `runner` or `api` deploy drops every live stream mid-run on a system whose runs are *long* (V2's wall-clock default was 14400s — `flip-readiness-final-stretch.md:399`). |
| **Honest flag** | The cut most likely to be ruled illegal. `ADR-0018` clause 1 pre-emptively forbids the justification: *"The fix is proxy configuration; the fix is never a second path."* Same-origin path-routing arguably keeps `AC-60`; a reviewer may reasonably say the law is about the *contract* having one door, and this splits it. **Conceded as arguable; would not ship over an `AC-60` objection.** |

**S3 · `runner-*` stage families** — `runner-judgement`, `runner-critique`, `runner-evidence` as separate deployments.
**WITHDRAWN as a service cut.** Three deployments of the same binary with a stage filter, all importing the same packages. `ADR-0009` already routes `worker count` to a register key and `P11` already makes them competing consumers on `core.work_item`. **A compose-file knob V3 already has. Calling it a microservice would be dishonest.**

**S4 · `replay-svc`** — **already cut, and the proof the method works.** `03-module-design.md` §3.1 row 23: `apps/replay` imports `packages/published-arithmetic` **only**, runs under a separate read-only credential, scheduled by a different principal (`ADR-0018` clause 2). V3 extracted a service for *isolation*, not scale, and the cut is surgically clean **because the interface was already narrow**. That is the whole method, already validated in the pack.

### The cuts this seat refuses to make, stated so nobody proposes them later

| Candidate | Why it must not be cut |
|---|---|
| **`graph-svc` (Seam B)** | `AC-32`'s write-time **recursive reachability check runs inside the same transaction as the write**, under a per-graph advisory lock (`03` §5.2 layer 2). **You cannot split a transaction across a service boundary.** Proposed to self; killed. |
| **`ledger-svc`** | `AC-45`/`AC-08` require a **total order** from one sequence allocator. Distributing it means either a distributed consensus round per ledger row or losing the total order — and `AC-07`'s byte-identical replay dies with the order. |
| **`propagation` / `published-arithmetic`** | Pure functions with zero dependencies (`03` §3.1 rows 2–3). A network hop to a pure function is pure overhead and pure new failure modes. |
| **`kernel` / `contract`** | Shared vocabulary. Making these services is how you get the very mirror `AC-59` forbids. |

**Net honest count: one strong cut, one arguable cut, one already made, three forbidden.** A small fleet — better said plainly than inflated.

## 2. PROS — each grounded in a cited doc or V2 file

**P-1 · Bulkheading resource pools is the single defect class V2 died of, repeatedly.**
`coordinator/app/core/write_lock.py:19-45` records the 2026-07-26 incident verbatim: *"a lock-ordering inversion… The two orders together deadlock, and nothing breaks the deadlock but a timeout,"* with *"141 'QueuePool limit of size 5 overflow 10 reached' failures clustered immediately before the lock victims."* `coordinator/app/scoring/jobs.py:89-99` names the cause: *"across debates nothing bounded how many passes ran at once… Unbounded passes therefore translate directly into pinned pool slots (the 2026-07-26 incident: all 15 held)."* The last ~25 commits in V2 are almost entirely deadlock, pool-exhaustion, writer-starvation and event-loop-blocking fixes. **A separate process has a separate pool by construction. Scoring cannot exhaust the graph writer's connections if it does not share them.**

**P-2 · The provider tier needs an admission-control owner, and today it has none.**
V2's `docs/improvement-plan-2026-07-22.md:66-71` measured it: *"the job deadline (~95s observed) is below realistic generation latency… my live probe took 51.2s; under yesterday's load (6 concurrent jobs) it repeatedly exceeded 95s,"* producing *"a metronomic claim→expire→reclaim cycle every ~95s, 8 times, same worker."* **Textbook oversubscription of a fixed inference tier.** In V3, `worker count` is a register key (`ADR-0009:320`) and each `apps/runner` replica sizes its own concurrency — so N replicas collectively oversubscribe one GPU exactly as V2's 6 jobs did, and no single component can see it happening. `gateway-svc` (S1) is the only shape where admission is decided once, against real capacity.

**P-3 · Circuit-breaking per maker fixes a named, measured V2 failure that V3 has not designed away.**
`improvement-plan-2026-07-22.md:57-61`: *"POV jobs are pinned to one model at creation… retries never switch model… so one flaky backend = one permanently dead branch."* Measured outcome in one real debate: **4 of 7 perspectives failed at 8/8 attempts each** (`:47-89`). V3's `ADR-0017` clause 5 makes retry bounds register values, but **retry-with-the-same-sick-provider is still retry**. A gateway service with per-maker health is where a breaker lives naturally — and it matters more in V3 than V2 because `DR-013`'s maker-diversity floor means a dead maker degrades a *correctness* property, not just throughput.

**P-4 · Credential separation is already an accepted architectural goal, and processes are how you enforce it.**
`ADR-0018` clause 2 and `03-module-design.md` §1.2 require that `apps/scheduler`'s three jobs **do not share a credential**, and that `apps/replay` **has no other credential** than read-only. The pack already reasons in units of process-scoped authority. `gateway-svc` extends exactly this: it is the only component that must hold provider API keys, and today those keys sit in the same process as the graph writer and the serve layer.

**P-5 · Independent release trains for the component with the highest change rate.**
`ADR-0017`'s consequences concede the engine's *"edge-case maturity under multi-day debate batteries and local vLLM latency variance is unproven for this workload."* Provider adapters, call bounds and vLLM tuning will churn hardest and earliest. Today shipping a vLLM timeout change redeploys the process that holds the graph write API.

**P-6 · A network boundary cannot be bypassed by a tired engineer at 2am; a lint rule can.**
V2 is the exhibit. It had **zero** boundary enforcement — no eslint config, no dependency-cruiser, no import-linter, no workspace tooling — and it produced `dialectical_v2.py` at **3,534 LOC**, `orchestrator.py` at **2,173 LOC** imported by 16 modules, `entities.py` imported by **38**, the ORM layer importing the service layer, and **nine in-code comments admitting circular imports they must dodge** — including `orchestrator.py:1573`, *"Mirrors `dialectical_v2.publish_event` (not imported: circular import)"*, **a function copy-pasted purely to break a cycle**. That is `AC-85` violated by a workaround for a boundary that did not exist.

**P-7 · `ADR-0018` already grants the escape hatch, which proves the seams are real.**
*"Splitting hosts later is an operational change, not an architectural one — provided nothing acquires a second durable store while doing it"* (`ADR-0018:183-184`). The architecture has already conceded the seams are clean enough to distribute. This case is only about **when**, not **whether**.

## 3. CONS conceded, with severity

| # | Concession | Severity |
|---|---|---|
| **C-1** | **V2 was already distributed — six `launchd` processes across two physical laptops, no Docker, no CI, no contracts.** V2 is therefore **not evidence that monoliths fail**. It is evidence that *distribution without contracts* fails. The single most damaging fact to this seat's own case, so it leads the concessions. | **CRITICAL** |
| **C-2** | **DRY is the weakest flank, and microservices actively hurt it.** `AC-85`/charter A3.1 demand one behaviour in one place, and A3.6's maintenance test asks an engineer to name *the single place*. `03-module-design.md` structural **rule 6** — *"frozen facts are read; rules are called"* — becomes, across a service boundary, an HTTP call with a timeout, a retry and a partial-failure mode. **That makes local re-implementation more tempting, not less.** The fleet's standard answer to a shared rule is a shared library, which is what V3 already has, minus the network. | **CRITICAL** |
| **C-3** | **KISS: lost outright at current scope.** *"One compose file is the whole deployment description, which makes the credential separations of clause 2 reviewable in one artifact"* (`ADR-0018:170-171`). Unbeatable for a system with no stated load, one store, one language and one type graph. | **CRITICAL** |
| **C-4** | **More services means more transport paths, and V2's worst structural defect was too many paths.** V2 had **four** client→server paths plus SSE plus a raw `<a href>` — and the production path (`scripts/web_proxy.py`, run by `deploy/launchd/web.plist:17`) **silently bypassed the 214-line Next.js handler and its `recordSuspiciousScoringProxyResponse` observability hook entirely**. `AC-60` exists because of this. The S2 cut walks toward that fire. | **HIGH** |
| **C-5** | **The single-writer laws are anti-distribution, and they are correct.** `AC-45`'s total order needs one serialization point; Seam B's advisory-lock transaction cannot cross a process. V2's `instance_lock.py:3-6` records the counter-case: *"two writers against one SQLite database silently fight over job state."* More processes is the direction that produced that incident. | **HIGH** |
| **C-6** | **The type graph proves compile-time agreement, never deployed agreement.** The honest cost of any process split, and *not* the same as the language-mirror cost (see §5). One artifact means compiled agreement equals runtime agreement. N artifacts means version skew is possible at every deploy, and no static walk can see it. **A genuinely new failure class the monolith does not have.** | **HIGH** |
| **C-7** | **The orphan audit degrades if the fleet ever leaves one workspace.** `tools/orphan-audit` decides `consumed ⇒ served` by walking **one TypeScript program** (`03` §3.1 row 26, §12; `DR-069`). It survives a service split *inside one workspace*. It does not survive a repo split. Given V2 shipped ~10 never-called endpoints, 3 dead components, 18+ ignored SSE events and whole unrendered payload sections, **weakening that audit would attack the exact defect V3 exists to close** (charter clause 4). | **HIGH** |
| **C-8** | **`gateway-svc` puts a network hop between the provider response and `AC-13`'s unconditional artifact write.** A gateway crash after the model returned but before the write loses a *real* artifact. Not a `DR-115` breach (nothing fabricated) but a hole in the record that the in-process design does not have. | **MEDIUM–HIGH** |
| **C-9** | **Hatchet already gives most of what would be claimed.** `ADR-0017` provides worker lifecycle, redelivery, timeouts, child fan-out and scheduling; `ADR-0009` gives competing consumers over `SKIP LOCKED`. **Independent horizontal scaling of the work tier is already a register-key change.** Much of the "scalability" case for extraction is already banked. | **MEDIUM–HIGH** |
| **C-10** | **Cross-service circular *calls* are worse than circular imports.** V2's nine import cycles at least failed at build time. The same coupling across a network deadlocks at runtime, under load, in production. | **MEDIUM** |
| **C-11** | **Dual bookkeeping is already permanent and services would add a third surface.** `ADR-0017` accepts engine state vs. our ledger as an accepted standing cost. Each new service adds its own operational truth. | **MEDIUM** |

## 4. Direct answers on SOLID/DRY/KISS and on scalability

### SOLID

| | Verdict |
|---|---|
| **SRP** | **Marginal win, honestly stated.** Services give SRP a *deployment* unit. But SRP is about reasons to change, and the 27-row edge table already assigns one reason per package. Microservices add an **enforcement mechanism**, not the principle. |
| **OCP / LSP** | **Neutral — no gain.** `P8`'s Strategy + Registry resolution chain and `AC-37`'s *"a second provider by configuration"* are textbook OCP/LSP, and they work identically in-process. Nothing claimed here. |
| **ISP** | **Genuine win.** Every interface widening across a wire costs a contract change and a deploy, so interfaces stay narrow under economic pressure rather than review pressure. But `packages/contract` plus row 25 (`web` may import `contract` **only**) already achieves most of it. |
| **DIP** | **No gain — already inverted.** `apps/*` are **sinks** in the edge table; every domain package imports abstractions and no application. Already better than most microservice fleets manage. |

**Honest SOLID summary: one genuine win (ISP), one marginal (SRP), two nil.**

### DRY

**Conceded to the monolith.** See C-2. The one nuance held: DRY is about *knowledge*, not text, and V2's real DRY failure was **823 hand-written lines in `web/lib/types.ts` duplicating knowledge that lived in Python** — a duplication caused by a *language* boundary, not a *process* boundary. A TypeScript fleet in one pnpm workspace importing `packages/contract` duplicates nothing. So microservices are **DRY-neutral on the wire** and **DRY-negative on shared rules** (rule 6). Net: negative.

### KISS

**Conceded outright at current scope.** See C-3. One qualification: KISS measures *total* system complexity, not source complexity. V2's "simple" answer produced a hand-run 11-step Makefile deploy across two laptops with a 900-word acceptance gate and no CI. Simplicity that only holds in the source file is not simplicity. But V3's compose file is genuinely simple *and* the source is simple, so this is lost cleanly.

### Scalability — the honest answer, including where the bottleneck actually is

**The bottleneck is the GPU/vLLM tier, not the app tier. The evidence is one-sided.**

1. **The workload is a fan-out of model calls, and the pack says so.** `requirements-spec.md` §21.2 (`DR-052`) names the product that had no bound: *"children × cold-reader restatements × falsifier rotations × the system defeater model × the rival carver × per-node judges (× panel) × always-on CROSS at high stakes × the checker rows × leverage and fragility recomputes × the rival operator × composition × conformance × recompose."* Every factor there is a GPU-seconds consumer.
2. **The app tier's work per node is trivial by comparison.** Materialise a snapshot, run a pure fold over arrows (`packages/propagation`, zero dependencies, no I/O), write ledger rows. Microseconds-to-milliseconds against a model call V2 measured at **51.2s** (`improvement-plan-2026-07-22.md:68`).
3. **Therefore: splitting `judgement` from `critique` into separate services adds exactly zero inference capacity.** If runs are slow, they are slow because the GPU is busy, and no amount of app-tier decomposition moves that number.
4. **The one extraction that matters for scale is already in the ruled design.** `ADR-0018` runs `vllm` as a separate compose service over HTTP, and states host splits are *"an operational change, not an architectural one."* **The scaling seam V needs already exists.**
5. **Horizontal app-tier scaling is already available without any extraction.** `worker count` and `concurrency limits` are register keys (`ADR-0009:399-401`, `ADR-0017:470`); `P11` makes runners competing consumers via `SKIP LOCKED`; `apps/*` are sinks so replication is a compose knob.

**What service extraction actually buys on scalability — precisely two things, no third claimed:**

- **(a) Admission control against a fixed inference tier.** N runner replicas each sizing their own concurrency cannot see aggregate GPU demand. Not theoretical — exactly V2's measured `95s`-deadline collapse under 6 concurrent jobs. `gateway-svc` is the only shape where "how much inference is in flight right now" is a single answerable question. **The strongest true scalability argument in this brief — and note it is an argument about *correctness under contention*, not throughput.**
- **(b) Independent availability for long-lived streams.** Runs are long; SSE connections are long; deploys are not. Decoupling the stream tier's lifecycle from the runner's is an availability gain, subject to the `AC-60` objection conceded in C-4.

**Honest closing on scale: with no stated load target (Finding A), the correct scalability posture is the one `ADR-0006` already takes — state no target, invent none, make the bound a register key.** V3's design does that. Extraction for unquantified scale is speculative, and speculation must not be dressed as engineering.

## 5. Rebuttal to ADR-0001's "the defect is the join"

**The argument to beat**, from `ADR-0001-language-and-runtime.md:25-31`: a cross-language wire boundary *"needs a generated mirror of the wire types, and a mirror that drifts is the exact defect shape the pack indicts as D4 — 'the defect is the join'. V2's own `web/lib/types.ts` mirror is on the death list for this reason."*

### First: the exhibit is conceded completely. It is worse than the ADR says.

`web/lib/types.ts` is **823 lines, zero imports, 100% hand-written**, and it *names its own source of truth in comments* — `types.ts:162-166` cites `coordinator/app/scoring/models.py`; `:577-579` says `VerdictSummary` *"matches `coordinator/app/scoring/verdict.py`'s `verdict_summary()` wire shape exactly."* It did not. Measured drift:

- **Server fields the mirror never knew about:** `score_provenance` (`models.py:392-403`) ships on every scored node — and it is declared `extra="allow"`, the only open-schema field on the wire — with **zero hits across all of `web/`**. Also `derivation.source` (`serialization.py:944-945`).
- **Server fields the mirror filed in the wrong place:** `evidencePresence` is emitted as a **top-level key** of `debate_to_dict` (`serialization.py:924`); `types.ts:599` declares it as a field of `VerdictSummary`. Read by nothing.
- **Mirror fields the server never emits:** `DebateDetail.scoring` (`types.ts:697`) — `debate_to_dict` never emits the key. Dead FE slot.
- **The mirror fused two different server classes into one type:** `api/scoring.py:70-72`'s `DebateScoringWithFeedbackResponse` adds fields absent from `models.py:429`'s `DebateScoringResponse`; the TS type has both.
- **It was written defensively *because* drift was expected** — `types.ts:71-74`: *"Absent on older cached/SSR payloads — callers must fall back to `stopping_reason`, never assume presence."*

`ADR-0001` is right. `AC-59` is right. Anyone arguing this exhibit away is not arguing honestly.

### The rebuttal: the exhibit proves a claim about *languages*, and is being used to carry a claim about *processes*.

**Every mechanism of that defect is a language-split mechanism.** The mirror existed because Pydantic declarations cannot be imported by TypeScript. `ADR-0001`'s own price list confirms it — the superseded-episode table at `:211-217` lists what the Python instantiation had to build: *"one pydantic declaration → OpenAPI as a build artifact → types-only TS codegen → a byte-equality regeneration gate,"* and the verdict *"three gates carried what one identity carried."* **Every item on that list is a translation step between two type systems. None of them is a network hop.**

**A TypeScript service fleet in one pnpm workspace has no join to defect.** `gateway-svc` and `apps/runner` both `import { CallBound, PromptPacket, RawArtifactRef } from '@v3/contract'` — **the same declarations, compiled into both sides, walked by the same `tsc` program.** There is no mirror because there is nothing to mirror.

**And `03-module-design.md` §2 concedes exactly this point, in the pack's own words:**

> **"AC-59's 'no adapter' is untouched, and never depended on the fence. It requires one contract declaration, not one checkout."**

Substitute the term: it requires one contract declaration, **not one process**. The same §2 shows the pack already reasoning this way — `DR-069` deleted the consumer-manifest mechanism the moment the type graph was unified, on the grounds that *"with one workspace the single type graph exists, so `tools/orphan-audit` decides consumed ⇒ served by walking the program."* **That walk is over the workspace, not over the process table.** Split `apps/runner` into two deployables inside the same workspace and the program the auditor walks is byte-for-byte identical.

**Honest scoring of `AC-59`, `AC-61` and `AC-85` under this proposal:**

| Obligation | Survives a same-workspace TS service split? |
|---|---|
| `AC-59` — no adapter | **Yes, intact.** One declaration in `packages/contract`; both sides import it. |
| `AC-61` — bidirectional no-orphan | **Yes, intact.** One type graph, one static walk, `DR-069`'s mechanism unchanged. |
| `AC-85` — one behaviour, one place | **Yes for the wire; at risk for rules.** See C-2 — this is where real damage lands, not on the mirror. |

### The cost that will not be hidden — the real rebuttal to the rebuttal

**A single type graph proves that all services *compiled* against the same contract. It cannot prove they are all *running* the version they compiled against.** The monolith gets that for free: one artifact, one deploy, compile-time agreement **is** runtime agreement. A fleet must buy it — atomic deploy, or version negotiation, or additive-only discipline enforced at runtime rather than by `tsc`.

**That is a genuinely new failure class, and it is the correct form of "the defect is the join" for a process split.** `ADR-0001` states the argument in its language-split form because that is the boundary it was ruling on. Restated properly for this proposal, the join defect does not become a *drifting mirror* — it becomes a **deploy-skew window**. Smaller, differently shaped, and mitigable by additive-only contract discipline (which `ADR-0002` already mandates). **But real, and not present in the monolith.**

**Verdict on this exchange:** `ADR-0001`'s reasoning is sound and its exhibit is devastating — *against a second language*. It is load-bearing for `DR-117`'s TypeScript ruling and is not attacked there. It is **over-extended** if cited against a same-workspace, same-language process split, because the mechanism it indicts is absent from that case. **What it should be cited for instead is C-6**, which is the argument that actually costs this seat.

## 6. Closing statement — the conditions under which microservices is the right call

**No claim to the win on today's evidence. The modular monolith of P1 is the correct decision for DebateAI-V3 as the pack currently stands, and here is why, said plainly:**

There is no stated load target (Finding A). The bottleneck is the GPU tier, which `ADR-0018` has already extracted. Horizontal scaling of the work tier is already a register-key change under `ADR-0009`/`ADR-0017`. `AC-02` forbids the datastore split that gives microservices most of their real independence. `AC-45`'s total order and Seam B's in-transaction reachability check are actively anti-distribution and are *correct*. And V2 — this seat's own best source of pain — turns out to be a **distributed** system that failed for lack of contracts, not a monolith that failed for lack of services.

**What is claimed: four conditions are foreseeable, and each is a real trigger. When one fires, extraction stops being speculation:**

1. **The GPU tier stops being one box.** A second GPU host, or a burst tier to a hosted provider under `AC-37`. At that moment in-process admission control becomes structurally incapable of seeing aggregate capacity, and `gateway-svc` (S1) goes from nice to necessary. **The most likely trigger, and the one to pre-design for.**
2. **A polyglot worker lane arrives.** `ADR-0001` leaves this open in `DR-117`'s own word — *"workers TypeScript initially"* — and `ADR-0017` records the engine permits it *"without a control-plane redesign."* The moment a non-TS worker exists, **the single-type-graph property is already spent**, the microservice cost is already paid, and refusing the benefits would be paying a price for nothing. At that point the debate reopens automatically and V should treat it as such.
3. **Observers decouple from runs.** `P14`'s SSE stream is currently one consumer per run. If runs acquire many concurrent observers — a shared debate, a public view, a replay audience — the connection tier's profile diverges from everything else and `stream-svc` (S2) earns its keep, subject to settling the `AC-60` question honestly rather than operationally.
4. **Deploy contention becomes measurable.** More than one owner per deployable, or a provider-tuning change blocked behind an unrelated graph change. `ADR-0017` already flags provider/vLLM latency behaviour as *"unproven for this workload"* — that is the component that will churn, and it is S1.

**And one condition that must be met before any of the above is acted on:** somebody must produce a number. `ADR-0006` and `ADR-0009` both refuse to invent one, and they are right to. **Extraction justified by unquantified scale is how a team acquires eleven services and one user.** If V wants scalability as a ruling rather than an aspiration, the honest first move is not a topology decision — it is a load requirement in `requirements-spec.md`, at which point this debate can be settled with arithmetic instead of advocacy.

**Recommendation, as the advocate who lost:** rule the modular monolith, and **write S1's boundary down now while it is still a seam rather than a refactor**. `packages/providers` is already the narrowest interface in the system (`03` §7), already the sole entry point for model artifacts (`P4`), and already the owner of the only resource that is genuinely scarce. Keep it in-process. Keep it *extractable*. `apps/replay` proves V3 can cut a service cleanly when the interface was narrow first — **that is the property worth preserving, and it costs nothing to preserve it today.**

---

# SYNTHESIS

## The vote: 3–0 for the modular monolith

| Seat | Verdict |
|---|---|
| Grok (independent) | **Modular monolith.** "Until those triggers are real, microservices for this project are premature topology theater." |
| Monolith Advocate | **Modular monolith**, with four concessions named for V to price (AC-85 review-only enforcement, local re-declarations, blast radius, the Postgres ceiling). |
| Microservices Advocate | **Modular monolith** — the steelman seat *conceded its own motion*: "The modular monolith of P1 is the correct decision for DebateAI-V3 as the pack currently stands." |

## Five findings all three seats reached independently

1. **No load requirement exists anywhere in the pack.** All three seats grepped the corpus separately and found the same absence — and found the pack itself refusing to invent one (`ADR-0006`: "The plan states no throughput target and this ADR invents none"). "Needs to be scalable" is currently an aspiration, not a requirement. **If V wants it to be a requirement, the move is a load figure in `requirements-spec.md` — then the topology question becomes arithmetic.**
2. **V2 already ran the distributed experiment.** Six launchd services, two languages, two machines — and it produced D1–D5 anyway, *plus* two defect classes (the three-path transport seam, config sprawl) that distribution itself caused. V2 is evidence that distribution-without-contracts fails, and separately that its internal code — which had *no* enforced boundaries — rotted regardless of topology. The lesson cuts both ways and both cuts favour P1: enforce boundaries in CI, don't buy them with a network.
3. **SOLID/DRY/KISS are module properties, not topology properties.** The microservices seat's own scoring: one genuine SOLID win (ISP), one marginal (SRP), two nil — and DRY and KISS conceded outright. The 27-row CI-asserted edge table is what makes these principles *checkable*; a service boundary is a DRY-violation generator (823 lines of V2 proof).
4. **The true bottleneck is the GPU/vLLM tier, and it is already its own service.** App-tier decomposition adds zero inference capacity. The scaling ladder that exists without touching the architecture: runner replicas (register key) → GPU host(s) → Postgres capacity → host splits (ADR-0018: operational, not architectural).
5. **The single-writer laws are anti-distribution and correct.** AC-07's byte-identical replay demands a total order; a total order is a serialization point; distributing it either builds consensus machinery or breaks the guarantee V3 exists to provide.

## What the debate produced beyond the verdict — items for V's attention

The losing seat earned its keep. Four genuinely new, actionable observations survived cross-examination, **none of which requires reversing P1**:

| # | Item | Source | Nature |
|---|---|---|---|
| Y-1 | **Keep Seam C (`packages/providers`) extraction-ready.** It is already the narrowest interface in the system and the sole model-artifact entry point; preserving its extractability costs nothing today and pre-designs for the most likely flip trigger (a second GPU host). | Microservices seat closing | Design discipline, no doc change strictly required |
| Y-2 | **GPU admission control has no owner.** N runner replicas each sizing their own concurrency cannot see aggregate GPU demand — V2's measured 95s-deadline collapse under 6 concurrent jobs is the precedent. Worth deciding where "how much inference is in flight" is answered (a register-key concurrency budget at Seam C is the in-process answer). | Microservices seat P-2 | Potential future ticket / register consideration |
| Y-3 | **Per-maker circuit breaking is undesigned.** Retry bounds exist (ADR-0017 clause 5) but retry-with-the-same-sick-provider is still retry, and DR-013's maker-diversity floor makes a dead maker a *correctness* degradation. V2 measured 4 of 7 perspectives dead at 8/8 attempts. | Microservices seat P-3 | Potential future ticket |
| Y-4 | **AC-85's "one behaviour, one place" is review-enforced, not CI-enforced.** Both advocates flagged it independently (rule 6's no-re-implementation half; charter A3.6 is ADVISORY). V's instinct that something was unguarded here is confirmed — but the gap is closed by review discipline or future tooling, not by service boundaries, which both seats agree make re-implementation *more* tempting. | Both advocates | Known gap, on the record |

## Consolidated flip triggers (union of all three seats)

Extraction stops being speculation when one of these becomes a measured fact: a second GPU host / hosted burst tier (→ extract Seam C first); a polyglot worker lane actually taken (single-type-graph property already spent); many concurrent SSE observers per run (→ stream tier, subject to AC-60); a measured Postgres write ceiling on the ledger allocator after cheaper rungs are exhausted; a second team with independent release cadence; a regulatory/tenancy isolation mandate. Cheapest-first ladder before any of it: runner replicas → GPU capacity → Postgres tuning → host splits → single scoped extraction with a written AC-59/61 price tag.

## The decision before V

1. **Affirm P1 as written** — modular monolith with enforced boundaries; this artifact becomes the debate record ADR-style, citable the way ADR-0017 cites the Hatchet debate.
2. **Affirm P1 with the Y-1 rider** — same, plus an explicit sentence in the pattern register or ADR-0018 that Seam C's extractability is a preserved property (all three seats would endorse this).
3. **Reverse to microservices** — against the unanimous advice of all three lenses; would require a human sitting under DR-116's rule and reopens AC-02/AC-60/AC-07 obligations.

**The ruling is V's.**
