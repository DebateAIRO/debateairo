# Design-pattern register — PROG-V3-R1 backend

2026-08-06 · Identified by the orchestrator from the accepted architecture
(ADR-0001..0014 + Seams A–D + DR-068..DR-101) at V's direction. This names, in
industry vocabulary, the patterns the architecture already mandates — it rules
nothing new. Every entry cites its authority; where a ticket and this register
disagree, the cited ADR/DR wins. Ticket bodies on board `debateai-v3` carry
per-slice extracts of this register.

**Stack ruled 2026-08-07 (ticket PRE-10 rev 2, `RULED — DR-117` / `DR-118`).**
All the humans in the loop ruled the coding stack at the sitting DR-116 mandated:
**TypeScript on Node** across engine, API and interface with **workers TypeScript
initially**; **Fastify + SSE**; **PostgreSQL + Drizzle**; **Hatchet** for durable
execution, self-hosted and Postgres-first (DR-118); **vLLM** over HTTP; **Docker
Compose on Hetzner behind Cloudflare**.

**The eighteen patterns are unchanged** — a pattern is a shape, and no ruling in
this loop has replaced a shape. What rev 2 touched is the **stack-named references
inside them** (P1, P2, P3, P12, P17 restored to the ruled stack) and **P11, which
is genuinely re-grounded**: the work queue now sits behind a dispatcher, and the
laws that keep the dispatcher from becoming the source of record are named there.
**P4** gains the local-model row.

*An earlier ruling (**DR-105**) put the engine on Python/FastAPI and rev 1
re-grounded these same P-refs for it; **DR-117 superseded that**. The episode is
recorded at `docs/architecture/01-decisions/README.md` §5.6, not here.*

**The anti-pattern register carries one entry that is new law and survived the
reversal untouched: `RULED — DR-115`, no scaffolded data.**

## Why these patterns (the V2 defect map)

V3 is a rebuild precisely because V2's shapes generated the D1–D5 defects.
Each defect is answered by a pattern, not a habit:

| Defect | V2 shape | V3 pattern that forbids it |
|---|---|---|
| D1 invented numbers (0.5/0.0/0.7 fallbacks) | silent defaults | **Typed absence** — no Null Object anywhere; unjudged ⇒ no arrow + typed record (P-D1) |
| D2 hardcoded aggregation | source-literal operator | **Strategy + Registry resolution chain** (P-D2 as rescoped by DR-074) |
| D3 counting by string | no provenance identity | **Value objects + cluster collapse keyed on provenance** (P-D3) |
| D4 bare numbers | unlabeled scalars | **Labeled-number value object** — the wire type has no bare-scalar form (P-D4) |
| D5 unreachable calibration | dead config path | **Event-sourced scorecards + G4 config-reachability** (P-D5) |

## The pattern register

**P1 · Modular monolith with enforced boundaries.** One pnpm workspace
(`RULED — DR-117`), one process family; module law = the dependency-edge table
(03 §3.1 rows 1–27) — an absent edge is a prohibition. CI asserts the graph;
`apps/*` are sinks. Never reach across a boundary "just to read" code — frozen
facts are READ from the DB, rules are CALLED across a declared edge, nothing is
re-implemented (structural rule 6; AC-85). **A compose service is not a module**:
`hatchet-engine`, `postgres` and `vllm` run beside the workspace and appear in no
edge (03 §1.3). [ADR-0001; 03 §3]

**P2 · Functional Core / Imperative Shell.** The scoring arithmetic
(`packages/propagation`) and the decision function (`battery/decision`) are
pure: no I/O, clock, randomness, DB, model calls — enforced by import fences
(rules 1/5) + `no-impure-import` lint, not discipline. The fence is airtight
because the closure is small: rows 1 and 4 give those two packages only `kernel`
and `published-arithmetic`, each itself fenced, so there is no permitted package
through which impurity could arrive. Shells (`apps/runner`, `graph`, `serve`) do
the effects. Seam A is the choreography: **materialise → compute → persist** —
build an immutable snapshot, run the pure function, persist the receipt.
[Seam A; ADR-0004; AC-09/AC-48]

**P3 · Contract-first + single Facade front door.** `packages/contract`
declares every wire shape once; codegen produces client types, runtime
validators, OpenAPI and the AC-61 field inventory from that one source.
`apps/api` (**Fastify**, `RULED — DR-117`) is the only implementation, **and the
SSE stream is a route on it, not a second front door**; SSR is an ordinary caller.
Parse, don't validate: inputs cross the boundary only through generated
validators into branded types. **The one-transport law holds through the
Cloudflare proxy** — a buffered stream is fixed as proxy configuration, **never**
as a second path (ADR-0018 clause 1). [ADR-0002; ADR-0018]

**P4 · Gateway/Adapter for providers (Seam C).** Every model call crosses ONE
interface — `call(typed role, lane, CallBound, contractHash, PromptPacket) →
RawArtifactRef`. Provider implementations are compiled-in adapters selected by
register config only (H2a: switching providers is a one-register-row change).
**`RULED — DR-117`: the local model is one such adapter** — vLLM is a separate
compose service reached over HTTP, with no lower bar for anything, and **lineage
is the SERVED MODEL's maker, never "vLLM"** (DR-013's diversity floor, AC-38's
inventory; ADR-0018 clause 3).
The gateway persists the raw artifact UNCONDITIONALLY (parseable or not) and
writes the ledger row OUTSIDE any open write transaction — never hold a write
lock across a model call. **`RULED — DR-115`: the raw artifact is a REAL call's
artifact.** This gateway is the only place a model artifact enters V3, so it is the
only place the no-scaffolded-data law can be broken. A failed call yields a typed
failure and a ledger row, **never a substituted artifact**; a cache hit replays a
recorded *real* artifact under the contract-hash identity and yields a new ledger
row; a runtime path that selects a test double is a BLOCKING finding.
[Seam C; ADR-0009 clause 1; H1/H2; **DR-115**]

**P5 · Event sourcing with derived status.** Append-only event streams
(`run_progress_event`, `run_row_activation_event`, `served_number_event`,
`segment_suppression`) are the only mutation; current state = fold(events),
computed on read, never stored. Initial events are written in the same
transaction as the frozen head; an empty stream is a TYPED ERROR on read,
never a default. If a fact is derivable, deriving it is mandatory (02 §14's
13 derived-only rows). [ADR-0006/0007; AC-88]

**P6 · CQRS-lite: sealed artifacts vs read-time projections (Seam D).** The
write side seals frozen artifacts (fact bundle, conformance record, served
numbers + provenance); the read side computes projections (badges, marks,
summaries, current staleness) at read time from typed fields. `answer_index`
is a VIEW, never a materialized cache. `?version=` returns sealed artifacts;
no version param returns latest + current projection — reads legitimately
differ, so tests pin the version. [Seam D; ADR-0007/0014]

**P7 · Aggregate with a single-writer transaction (Seam B).** All node/arrow
writes go through `graph`'s write API (`withGraphWrite` + `GraphWriter`) in
one transaction under a per-graph advisory lock. Invariants live at the
aggregate boundary: cycle refusal-and-redirect (layer 1), write-time recursive
reachability (layer 2), pure-core typed error (layer 3) — all three exist.
[Seam B; ADR-0005; 03 §8]

**P8 · Strategy + Registry via resolution chains.** Every configurable
behaviour (operators accumulate/strict-and first among them) sits behind a
strategy interface; selection resolves parent → run → deployment through the
register, the supplying level is RECORDED on the produced number, and the
deployment row is mandatory (DR-074). A source-literal selection is a defect
by definition. No silent defaults: `Unresolved` blocks visibly, the loader
substitutes nothing. [ADR-0011; DR-074; H4; FX-PT-D2]

**P9 · Pipeline of typed gates.** Serve is a fixed machine-ordered gate chain
— R9 → Q53 → conformance → Q51, plus the DR-082/086 band-cap — where every
gate returns a member of a closed outcome vocabulary and every terminal is a
VALUE (components-only + DEFECT, downgrade, block), never an exception.
`max_recompose = 2`; three compose-time routes to components-only; post-serve
eviction is a degradation, not a fourth route. [DR-049/057; DR-082/086; AC-52/53]

**P10 · Append-only ledger + content-addressed identity.** Total order from a
dedicated sequence allocator under a write lock (never timestamps). Named hash
columns each hash one thing (`input_hash` excludes the contract hash;
`contract_hash` is in cache identity); a cache hit yields a NEW row.
Immutability is a database property: UPDATE and DELETE revoked + raising
triggers. [ADR-0006]

**P11 · Transactional work queue behind a dispatcher (competing consumers +
idempotent commands).** `core.work_item` claimed via
`SELECT … FOR UPDATE SKIP LOCKED`; the claim COMMITS BEFORE any model call; a
work item is an idempotent `(row, node-set)` command. The reaper writes
expiries; reads DERIVE expiry from `claim_deadline` without writing (AC-62 ×
AC-89 — both halves, never a lazy write). The queue is never a provenance source.

**`RULED — DR-118`: Hatchet dispatches this queue — it does not become it.**
Nine laws, and each one is the answer to a way the boundary erodes:

1. **Assignment is not a claim.** Hatchet decides *which worker attempts this
   now*; the claim is a **committed row in our database**, taken as the worker's
   **first act inside any task**, before any model call. Never treat engine
   assignment as the claim.
2. **The first lines are THREE checks, not one** — open a short txn →
   **settled-COMMAND check for this `(row, node-set)`, which no-ops regardless of
   claim liveness** → claim (`SKIP LOCKED`) → COMMIT → only then the model. The
   live-claim check alone closes the *concurrent* case; **the ledger-first check
   closes the case where the work is done and the claim is long gone** (law 7:
   the ledger, not the claim, is the source of record). **Scope it exactly**: it
   fires on **command completion** — success or a terminal typed state that ends
   the command — and **never on a retryable ledgered failure**. An attempt row
   proves an attempt happened, not that the command finished; a typed failure
   with budget remaining leaves the command unsettled, and **that is exactly what
   a redelivered attempt is for**. Firing there strands the work permanently.
3. **Settlement completion before the gateway — FINISH, DON'T REDO.** A claim is
   not a licence to call. If the command already has a **durably-ledgered attempt
   artifact awaiting settlement**, **complete the settlement from it** and exit;
   if the **attempt ledger already shows the shared budget exhausted**, commit the
   terminal exhausted state and exit. Neither ⇒ proceed — and a retryable failure
   with budget remaining *is* "neither". This closes the window **between the
   gateway's writes and the conditional settle**, where the command is not settled
   and yet must not be re-called: *settled* and *completable* are different
   questions. **Remaining budget comes from the attempt ledger, never from the
   unsettled work-item row.**
4. **`claim_deadline` must outlive the call it authorizes** — derived from the
   call site's `CallBound.deadline` plus margin, both register values. **A claim
   shorter than the call it authorizes is a defect in the register values, never
   a licence for a second call.** Heartbeat-extension is the permitted
   alternative where bounds vary (local vLLM latency).
5. **The residual is named, not hidden.** A frozen worker is indistinguishable
   from a dead one, so an expired claim **may** be re-claimed while a zombie
   attempt is in flight and **two real calls may overlap**. Safe because:
   attempt-scoped identities, **first settled wins with the loser RECORDED as a
   superseded attempt** (never discarded — AC-44/AC-45), and **one attempt budget
   counting both**. A duplicate is a cost event, **not** a DR-115 breach — both
   artifacts are real; **discarding one would be** the breach.
6. **Two expiry mechanisms compose, they do not compete.** Engine timeout →
   re-dispatch; **our reaper** → expiry. The engine decides *when to try*; **our
   claim and our ledger together** decide *whether work happens*.
7. **Engine state is not the ledger and engine order is not `at_seq`.** Where they
   disagree, ours wins. A dashboard is not an audit trail.
8. **Model calls live in plain/child tasks, never naked in durable orchestrator
   code** — replayed orchestrator code either re-issues the call or skips it, and
   neither is acceptable. Orchestrators carry wait/spawn control flow only.
9. **Engine retries are register values under DR-020's caps, never defaults** —
   and they consume **the same attempt budget** as the gateway's, not an extra
   one. Every attempt is a ledger row whoever initiated it.

**And the transaction footgun is ours regardless of engine:** no `await` on the
provider gateway inside a transaction callback; the gateway's two writes take
their own connection; a sibling's failure is caught, typed and ledgered per item,
never propagated as a batch abort. [ADR-0009 clauses 1 and 7; **ADR-0017**; A-05]

**P12 · Algebraic data types everywhere.** Closed vocabularies are minted once
(spec §12.3 → transcribed once into `kernel`), modeled as discriminated
unions with compile-time exhaustive switches + one runtime schema + a Postgres
CHECK. **Exhaustiveness needs both halves**: the compiler decides a switch is
exhaustive *when there is a fall-through to decide against*, so the
`require-exhaustive-switch` lint must also assert **the fall-through exists** — a
switch with none is silently non-exhaustive and the compiler has nothing to
complain about (03 §6.3). Branded identity types; the labeled-number value object
(number + kind + source + producer + replay handle) is the ONLY number shape that
crosses the wire. Unknown member ⇒ loud typed failure, never coercion.
[ADR-0001; AC-35/63/65]

**P13 · Memento / deterministic replay.** The evaluation snapshot is
immutable; the arrow order is derived once (`graph.materialiseSnapshot`),
RECORDED on `propagation_run` (`NULLS FIRST` explicit), and every
recomputation CONSUMES the recorded order — nobody re-derives. Every ruled
structural outcome (lift markers, cluster records, operator + level,
transmission reductions, selection rule) lands as recorded columns, or the
ceremony proves nothing. [ADR-0004/0012]

**P14 · Observer via SSE with declared consumers.** One stream on the same
front door; closed event vocabulary in `packages/contract`; E1 — no event
without a declared consumer (orphan audit enforces); E2 — one name per
meaning; payloads projection-grade or bare signals, never bundle-grade.
DR-076's lifecycle events follow these laws. [ADR-0008; DR-076]

**P15 · Bulkhead failure isolation.** A panel member's failure isolates to a
typed note — never fails the primary run; dispersion needs ≥2 judgements or
is typed absent (never zero). Every caught failure is typed AND ledgered — a
swallowed exception is a defect. [AC-04; FX-LG-15; charter A3]

**P16 · Shadow mode (dark launch) for gates.** A gate whose policy V has not
filled runs tier-invariant in shadow: it PUBLISHES what it would have
suppressed beside the unsuppressed result (`shadow_suppression`). Register-
gated branches must be exercisable in BOTH states by a producible
configuration (G4); a gate the pack says does not ship is NOT WRITTEN
(attestation instead — never dormant code). [DR-085; DR-081; DR-088]

**P17 · DDL as the single authority.** Invariants live in hand-authored SQL
inside the migration that creates the table — **`drizzle-kit` migrations under
`RULED — DR-117`, with Drizzle declaring the tables**; application checks are
courtesy restatements. **A schema-diffing generator is a drafting aid, NEVER the
authority** — it will not see the CHECK expressions, triggers, grants or
partial-index predicates it did not itself emit, so a builder who trusts it
silently drops the exact layer AC-32 lives in. Fixtures insert through the **RAW
connection**, bypassing every validator. Null-safety is explicit (`NOT NULL` +
CHECK — a bare btrim CHECK accepts NULL). Upserts distinguish collapse (identical
payload → no-op) from typed integrity error (differing payload) — not expressible
as a unique index. **The durable-execution engine is a co-tenant on the instance,
never a co-owner of the lineage**: its schema is not ours, not in `02`, and **no
V3 query joins across the boundary** (ADR-0003 rule 4). [ADR-0003 rules 1–4;
ADR-0005]

**P18 · Attestations as first-class artifacts.** Receipts and attestations
(independence receipt, operator attestation, NOT-SHIPPED, maker-capability)
are typed, falsifiable artifacts assembled into the acceptance bundle — an
absence is a typed reason, never a default ("independence unknown" ≠
"independent"). [VR-3; charter §5.2; AC-38]

## The anti-pattern register (rejected by ruling — do not introduce)

- **SCAFFOLDED / DEMO DATA ON A RUNTIME PATH — `RULED — DR-115`, and the newest
  entry here.** V's standing law: *"the algorithm never fabricates runtime data —
  every judgement, composition, evidence item, score and served artifact in any run
  comes from REAL model calls, real retrieval and real computation."* No stubbed
  judge responses, no hardcoded sample debates, no seeded artifacts masquerading as
  generation, no demo data on production paths, **and no fixture used as a fallback
  when a call fails** — an unjudged node emits no arrow and a typed record (P-D1),
  never a sample judgement. Test fixtures stay **legal exactly where the pack
  mandates them** — literature vectors, property generators, the one synthetic
  settled outcome, DDL fixtures — **confined to the test layer, labeled at the
  artifact and not merely at the file, fenced from production packages by
  a dependency-graph assertion, never seeded into a served run**. Note the trap: **the replay
  ceremony cannot catch this** — a run seeded with a stub replays byte-identically
  and passes, because replay checks arithmetic against records, not records against
  reality. **A scaffolded-data path found in review is a BLOCKING finding**, and
  reviewers are instructed to hunt for it on every implementation ticket.
  [**DR-115**; ADR-0009 clause 1; ADR-0012 clause 7; extends the spine's
  never-create-fake-runtime-data law and D1]
- **DI container / decorator indirection** — NestJS rejected under the superseded
  stack; the reason is charter A3.6 and it binds the ruled language identically —
  **construction is explicit, no service locator, and no framework-managed
  dependency graph standing between a caller and the behaviour it calls**.
- **ORM as invariant authority** — **Drizzle declares and types; SQL owns**
  (`RULED — DR-117`). Prisma was rejected for hiding the DDL, and a schema-diffing
  generator may never be the authority (P17).
- **Adapter/anti-corruption layers** — none between UI and API (DR-048 no
  adapter), none between contexts (rule 6: read facts, call rules). **With one
  language there is nothing to adapt**: `packages/contract`'s declarations are
  what both sides use (`RULED — DR-117`).
- **A second path around the front door** — no `/api/*` proxy in `web`, no second
  hostname, **no direct-to-origin bypass of the Cloudflare proxy**, and no serving
  decision implemented at the edge. A path that exists for one caller is V2's
  three-path seam returning (AC-60; ADR-0018 clause 1).
- **Treating engine state as the record** — dispatch history is not the ledger,
  engine completion order is not `at_seq`, engine assignment is not a claim, and
  engine timeout is not an expiry (P11; ADR-0017 clauses 2–3).
- **Null Object / silent defaults** — for config, τ, weights, statuses. Typed
  absence + visible blocking, always.
- **Second implementations** — one engine, one graph, one serving truth
  (AC-14/15/16/85). The replay ceremony's separate arithmetic is the SOLE
  sanctioned duplicate, bounded to `published-arithmetic`'s three symbols.
- **Pure render** — rejected by DR-044; composition is four machine-ordered
  steps with machine-injected honesty fields.
- **GraphQL / per-field resolvers, RPC-only, snapshot tests, string-sniffed
  errors** — each rejected with reasons in ADR-0002/0012 §rejected. **Add: a
  checked-in OpenAPI document** — a second wire declaration that goes stale
  exactly as the deleted consumer manifest did (ADR-0002).
- **Storing derivable state** — 02 §14's list is derived-only, forever.
- **A second durable store** — Redis or a broker for run state (AC-02); and
  **RabbitMQ beside the engine is off by default** — turning it on is a **recorded
  law-6 exception**, never a copy-pasted compose default (ADR-0017 clause 1).
- **Transitive closure jobs** (memory links), **`process.env` reads** outside
  the register loader — **including compose-injected environment variables** —
  and **source-literal constants** anywhere, **retry counts in task decorators
  included** (ADR-0017 clause 5).

---
*Orchestrator artifact; feeds the PRE-01..04 fold-in, the PRE-10 rev-2 stack
alignment and the S-ticket pattern sections. Review per DR-101 variant
(Codex + Grok lenses).*
