# 03 — Module design

Mission ARCH-V3-R1, step C4 (artifact 4 of the §7 set) · 2026-08-05,
**revised 2026-08-06 at the DR-100 fold-in**, **stack-aligned 2026-08-07 at the
DR-117 stack sitting (PRE-10 rev 2)** · seat: Opus 5 author, lane 4
(session `c4-lane-4`).

**Accepted architecture.** The provisional banner this document carried is
removed under **DR-098**, **DR-099** (amendments A-01..A-13 accepted) and
**DR-100** (ARCHITECTURE SATISFIED). Where a ruling in
`docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` (DR-068..DR-101)
or `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` (DR-102..)
and the older text disagree, **the ruling wins**.

**`RULED — DR-117` / `DR-118` — the stack, and what it changed here.** All the
humans in the loop ruled the coding stack at the sitting DR-116 mandated:
**TypeScript on Node** across engine, API and interface with **workers TypeScript
initially**; **Fastify + SSE**; **PostgreSQL + Drizzle**; **Hatchet** for durable
execution (DR-118); **vLLM** over HTTP; **Docker Compose on Hetzner behind
Cloudflare**. This document's map is **the original C4 map**, and it is ruled
text.

*Two things a reader should know before diffing this file.* **(1)** An earlier
ruling (**DR-105**) replaced the engine language with Python/FastAPI, and PRE-10
rev 1 re-instantiated this document for it; **DR-117 superseded that**, and rev 2
restored the TypeScript text. The episode is preserved in the ADRs
(`01-decisions/README.md` §5.6), not here — **this document carries the operative
map only**. **(2)** Through both passes the **context map, the package inventory,
the 27-row dependency edge table, the six structural rules, the four seams and
every invariant-ownership row never moved**. They are statements about which unit
owns which invariant, and no such statement is a language property.

**What rev 2 added rather than restored:** **§1.3**, the service map — the
deployment now has named services this document never had to mention
(`hatchet-engine`, `postgres`, `vllm`), and a reader needs to know that **none of
them is a module** and none appears in §3.1's edge table. One correction is also
retained from the superseded pass, at **§6.3**, because it was a real gap in a
gate rather than a language artifact.

**Source contract.** This document carries
`docs/missions/2026-08-05-v3-architecture/architecture/Plan.md` **rev 3**
§2.6 (repository layout, dependency edge table, the five structural rules),
§2.7 (lint and CI gates), §3 (bounded contexts, the four seams, the forbidden
anti-patterns) and the shapes §4 names, per §7 row 4.

**Scope, stated as the plan states it** (§7 row 4): package boundaries and the
enforced dependency graph · invariant ownership per context · the provider
gateway's interface · the graph write API · the pure core's signature and its
lint gates · the runner's unit of work · error and failure typing.
**Explicitly out of scope: no per-function design.** Table shapes are
`02-data-model.md`'s; the wire contract is `04-api-contract.md`'s; fixtures are
`06-test-strategy.md`'s; this document names them and never restates them
(AC-85 — one behaviour, one place).

---

## 0. How to read this, knowing nothing

**Status.** Everything here was **SEAT-PROPOSAL** at authoring;
**DR-098/DR-099/DR-100 ratify the C4 artifact set and the thirteen FinalPlan
amendments**, and **DR-068..DR-097 rule all 28 open questions**. **The stack is
RULED and no longer awaits ratification** — the DR-005/DR-024 referral was
discharged at the human stack sitting **DR-116** mandated: **`RULED — DR-117`**
(TypeScript on Node · Fastify + SSE · PostgreSQL + Drizzle · workers TypeScript
initially · vLLM over HTTP · Compose on Hetzner behind Cloudflare) and
**`DR-118`** (durable execution = Hatchet). **GPG-3's five bootstrap pins fill at
S00 under DR-104's resolve-on-machine rule and GPG-4's identifiers are accepted
at DR-104(3)** — so *no* stack or toolchain question gates this document any
more. What remains V's is **values**: the register at DR-023/VG-02. Where an
obligation is stated, it cites the constraint row (`AC-nn`, from Plan.md §1) or
the DR / founding-doc section that imposes it; an uncited normative sentence in
this file is a defect.

**Citation shorthand**, identical to Plan.md's reading contract:
`spec` = `docs/founding/requirements-spec.md`; `manifest` =
`docs/founding/carryover-manifest.md`; `ui` = `docs/founding/ui-boundary-contract.md`;
`charter` = `docs/founding/quality-charter.md`; `ledger` =
`docs/founding/decisions-ledger.md` (DR-001…DR-067) **plus
`docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` (DR-068…DR-101)**.
`AC-nn` are Plan.md §1's consolidated constraint rows, each of which carries its
own founding citation.

**The questions this document carried are ruled**, and §13 is the disposition
table. The `pending V — Q-nn` markers are discharged; each is replaced by the
ruling that closed it.

| Was | Ruling | Where here |
|---|---|---|
| Q-01 / Q-02 — may kept UI source be carried, and what is the fence | **DR-068** (yes) + **DR-069** (**NO FENCE**) | §1, §1.2, §2, §3.1 rows 25–26, §3.3 rules 2/4 |
| Q-03 — what an "asker" is | **DR-070** (the requesting user/person; `user_dev_token` adopted; provisional) | §4.4 |
| Q-04 — the undercut's arithmetic | **DR-071** (transmission-reduction; a third ruled producer) | §6.1, §8.2 |
| Q-05 — lifting composition | **DR-072** (folder-lift, then judged-ancestor; both-ends markers in both cases) | §6.1 |
| Q-06 — collapse over attacks | **DR-073** (both polarities) | §6.1 |
| Q-07 — the deployment operator default | **DR-074** (mandatory; the withhold machinery dropped) | §6.1, §4.1 context 6, §10 |
| Q-08 — `pending` nodes and placeholder arrows | **DR-075** + **DR-076** | §6.1, §8.2 |
| Q-09 — what judge weight multiplies | **DR-077** (selection under a declared rule; dispersion served separately) | §4.1 context 4 |
| Q-19 — auto-activation versus not-shipped | **DR-088** (counts as shipped dark; the charter's rule wins) | §11 |
| Q-20 — WAIT and run terminality | **DR-089** (the WAIT drain law; settlement outside the run) | §9.4, §1.2, §5.5.0 |
| Q-24 — the correctness/enrichment classification | **DR-093** (architecture proposes all 71, V ratifies once) | §9.5 |

**Four words a stranger needs.**

| Word | Meaning here |
|---|---|
| **package** | A separately-named unit of code in one workspace, with a declared list of the other packages it may import. The list is the design (§3). |
| **context** | A bounded area of the domain that **owns a set of invariants** — rules that must hold about the data. Contexts differ by which invariants they own, never by holding a different model of the argument (Plan.md §3, AC-14/AC-15/AC-16). |
| **organ** | One of the six behaviours carried over from V2 as re-specified designs (scorer, judge contract, graph shapes, spawn plumbing, ledger, serve). The organ↔stage table is FINAL (AC-17). |
| **seam** | A boundary where two constraints meet and one of them would otherwise be broken — this design has four (§5). |

---

## 1. What the system is made of

One pnpm workspace in the repository `DebateAI-V3` (AC-82, DR-065) holding the
engine **and the kept interface — one workspace, no fence** (DR-068, DR-069;
§2 below). One Postgres database with namespaced schemas and one migration
lineage (AC-01, AC-02). **One language across all of it** (`RULED — DR-117`;
ADR-0001), which is what makes §12's type-graph gates decidable at all.

### 1.1 Packages — the inventory

Responsibilities are Plan.md §2.6's layout comments and §3.1's ownership table;
nothing is added here.

| Package | Kind | Owns (one line) | Context (§3.1) |
|---|---|---|---|
| `kernel` | shared kernel | The closed vocabularies every context speaks: condition marks / abstention kinds / terminal routes transcribed **once** from spec §12.3, branded identities, the labeled-number type. Never extended locally (AC-65, S-13). | 13 |
| `published-arithmetic` | shared kernel (pure) | `agg`, `σ` and the strict-and product — manifest §4.2(a)–(b) and **nothing else**. The one module VR-3 licenses the replay ceremony to share (Plan.md §2.5a). | 14 (boundary inside) |
| `propagation` | shared kernel (pure) | The **one** scoring engine for WEIGH and COMPOSE (AC-14); M1 lifting and markers, M2 operator selection, M3 cluster collapse, the graph fingerprint. Pure by construction (AC-09). | 14 |
| `contract` | published language | The wire vocabulary: resources, projections, event vocabulary, typed error taxonomy. Nothing else declares a wire shape (AC-59/AC-60). | 17 |
| `register` | supporting | The flag/configuration register: rows, versions, resolution chains, naked-constant printing (AC-74/AC-75). See `05-register-skeleton.md`. | 12 |
| `db` | generic | Connection, migrations, the namespaced schema, transaction and advisory-lock helpers (AC-01/AC-02). | — |
| `ledger` | shared kernel (written by all) | Organ 5: the execution ledger, the hash columns, append-only ordering, the four reconstruction paths, the digest projection (AC-44…AC-47). | 15 |
| `providers` | generic subdomain | Organ-agnostic model access: the **one** provider interface (AC-36/AC-37), lanes and context isolation (AC-39), typed call bounds, and AC-38's deployment-level maker inventory. | 16 |
| `graph` | core | Organ 3: nodes, arrows, the three lifecycles, the materialized path, write-time enforcement, construction rules, cycle refusal and shared-crux redirect (AC-18…AC-20, AC-32, AC-33). | 3 |
| `judgement` | core | Organ 2: the per-node judge contract in full (AC-92), the deterministic reducer, panels, dispersion, the disagreement flag, typed non-answers. | 4 |
| `evidence` | core | Frozen queries and typed amendments, admissibility, access depth, absence rows, provenance clusters, freshness, probes, citation routes. | 2 |
| `battery` | core | The 71 row contracts, activation states, stage runners, row-boundary routes. Owns **contract, activation and sequencing**, never a row's substance (§4.2). | 1 (+ sequencing for all) |
| `battery/decision` | core (pure) | Organ 4: the **pure** decision→spawn function over two typed signal bundles plus path state (AC-48). Fenced exactly as `propagation` is (structural rule 5). | 3a |
| `critique` | core | Lineage, blinding, the independence receipt, the symmetry diff, the objection ledger (AC-38 per-run half, AC-39). | 5 |
| `valuation` | core | Hinges, the Pareto trigger, Flows A/B/C, reversal points, the overlay detachment invariant (AC-29/AC-30, DR-017). | 6 |
| `serve` | core | Organ 6: fact bundle, composition, conformance, gate order, terminals, projections, degraded mode, debug facet (AC-51…AC-58, AC-86…AC-91, AC-24's band ceiling). | 7 |
| `memory` | supporting | The four-tier match ladder as database predicates, links, aliases, pinned pulls, the disclosure block (AC-68…AC-71). | 9 |
| `settlement` | core | Resolution events, the proper score, scorecards as pure ledger functions, the model ledger, the eight routing guards (AC-40…AC-43, AC-73). | 8 |
| `liveness` | supporting | Snapshot, wake, propagate, retirement as archival (AC-05, AC-72). | 10 |
| `budget` | supporting | The cost envelope, typed skips, the protected core's refusal to be skipped (AC-49, AC-50). | 11 |

### 1.2 Applications and tools

| Unit | What it is | Constraint |
|---|---|---|
| `apps/api` | **Fastify** (`RULED — DR-117`) — **the single front door**, including the **SSE** realtime route (DR-117; ADR-0002). The only implementation of the contract; SSR and browser call the same addresses through the same generated client, and SSR is never a privileged caller. | AC-60, AC-57; **DR-117**; Plan.md §2.3, §5.1 |
| `apps/runner` | Run execution: Postgres-backed work claim, stage orchestration (§9). | AC-04, AC-44; Plan.md §2.7 |
| `apps/replay` | **The launch ceremony limb only.** The independent replay ceremony: imports **only** `packages/published-arithmetic`, reads frozen records only under read-only credentials, executed by a separate principal, and **never writes** (§5.5). | DR-063 VR-3, charter S1, AC-07; Plan.md §2.5, §2.5a |
| `apps/scheduler` | **The one home for time-triggered work**, with **three** named entry points: **`job:replay-self-test`** — charter S1's *continuous* limb (§5.5), which recomputes each servable number from frozen records and, on a mismatch, writes the eviction transition; **`job:reaper`** — AC-89's *write* half plus the stale-worker reaping AC-62 moves off the read path; and **`job:settlement-watch`** — **DR-089's standing watch**, which *"lives outside the run lifecycle (Stage-11/settlement) and fires when the resolver outcome arrives"*, calling `settlement` to record the outcome and re-derive calibration. Each job is a **named entry point in the published entry-point list** (charter G1, A4.5), so none is an orphan on the day it lands (AC-77). **The three do not share a credential** (§5.5.0, H-O-24). *(Unit named at C4 rework round 1 under H-O-1 / H-O-3, accepted at DR-099 A-04; the third job added at the DR-100 fold-in.)* | AC-06, AC-12, AC-62, AC-73, AC-77, AC-89; **DR-089**; charter S1, §5, A4.2; Plan.md §5.3, §6.6 UI-13 |
| `tools/orphan-audit` | Reachability (G1) + never-called list (G2) + dead-cost indictment (G5) over **one TypeScript program** — under **DR-069** there is no fence, so the interface is inside the same workspace and check 2 (*consumed ⇒ served*) is decided by the type graph itself; **no consumer manifest is a required build input**. Plus **DR-097's advisory lane**: a non-blocking audit reporting any **register key no code ever reads** after full build. | AC-61, AC-77; **DR-069, DR-097**; charter G1/G2/G5, A4.1, A4.2, VR-5 |
| `tools/acceptance-bundle` | Emits the never-called list, the charter §5.2 firing-fixture ids and the entry-point list G1 walked, **and presents the register for V's ratification** — for which it holds a **read-only `register` edge** (§3.1 row 27, resolving gap **MOD-2 ≡ REG-5**). **Emits no aggregate quality score** — charter A1.3 `RATIFIED(DR-039)` forbids a proxy metric standing in for V's judgement. | AC-74; charter A4.2/A4.4/A4.5, §9 item 2; Plan.md §8 S15, §6.9 item 2 |
| `web` | The kept Next.js + React + TypeScript interface, **a plain always-visible package beside the engine packages** (DR-069); the frontend row of `RULED — DR-117` is this package, unchanged. **DR-095 rules what "kept" means: kept SURFACE, rebuilt insides** — the pages, canvas, drawers, badges and navigation stay; components are rebuilt inside as the flex rows require, each altered component approved at its mockup review (DR-064). The data layer is rebuilt against the native contract with **no adapter**, importing `packages/contract` **in-workspace** — no published-artifact pinning, no consumer manifest (DR-069). **DR-096: no verdict-first presentation flag ships** — the verdict banner renders unconditionally. | **DR-069, DR-095, DR-096, DR-117**; DR-048, AC-59, AC-61 |

### 1.3 The service map — what runs, as distinct from what is a module (`RULED — DR-117`, `DR-118`)

**New at rev 2, and the distinction is the point.** §1.1 and §1.2 are the
**module** inventory; §3.1's edge table governs it. The deployment also runs
services that are **not modules**: they are containers V3 talks to. **None of them
appears in §3.1, none is importable, and none may acquire an edge.** The full
topology is [ADR-0018](01-decisions/ADR-0018-deployment-topology.md).

| Service | What it is | Relationship to this document's map |
|---|---|---|
| `web` · `api` · `runner` · `scheduler` | the units of §1.2, deployed | **modules** — §3.1 governs them |
| `postgres` | the one Postgres instance | AC-01/AC-02. Reached only through `packages/db` (§3.1 row 6). **Also hosts the durable-execution engine's own database/schema** — a **co-tenant, not a co-owner**: not in our migration lineage, not in `02-data-model.md`, and **no V3 query joins across the boundary** (ADR-0003 rule 4) |
| `hatchet-engine` | the durable-execution engine, self-hosted, **Postgres-first** (`SERVER_MSGQUEUE_KIND=postgres`), plus its dashboard/migration surface. **No RabbitMQ service** — adding one is a recorded law-6 exception | **not a module.** It **dispatches** `apps/runner`; it does not claim work, does not own the ledger and does not own run state ([ADR-0017](01-decisions/ADR-0017-durable-execution-hatchet.md) clause 2) |
| `vllm` | the local model server, reached over HTTP | **not a module.** It is reached by **one provider adapter inside `packages/providers`**, exactly like a hosted provider — so §3.1 row 9 is unchanged and `FX-HR-H1` covers it without amendment (AC-36; [ADR-0018](01-decisions/ADR-0018-deployment-topology.md) clause 3) |

**Three consequences for this document, stated so nobody looks for a change that
was correctly not made:**

1. **The package inventory and the edge table are unchanged.** A service is not a
   dependency edge. `apps/runner` does not "import Hatchet" in any sense §3.1
   governs — it registers workers with an engine, and the engine's SDK is an
   ordinary third-party dependency like any other, pinned by the lockfile.
2. **`apps/scheduler`'s three jobs are unchanged** — `job:replay-self-test`,
   `job:reaper`, `job:settlement-watch`, each a named entry point in the published
   entry-point list, **and the three still do not share a credential** (§5.5.0).
   DR-118 gives V3 a dispatcher; it does not give the scheduler a fourth job, and
   it does not merge the three. **In particular the reaper is still ours**: the
   engine's assignment timeout is a re-dispatch, not an expiry, and AC-89's write
   half stays with `job:reaper` ([ADR-0017](01-decisions/ADR-0017-durable-execution-hatchet.md)
   clause 3).
3. **The replay ceremony's separateness becomes a topology fact.** VR-3 limb (iii)
   needs a separately-scheduled job with a read-only credential; that is now
   expressible in the compose file rather than owed to it
   ([ADR-0018](01-decisions/ADR-0018-deployment-topology.md) clause 2).

---

## 2. There is no fence, and what that costs (DR-068, DR-069)

`web` is V2-derived source. Manifest §14 binds the clean-room split to *"whoever
implements V3's organs"* and voids DR-003 *"regardless of intent"* (AC-81).
Plan.md's SEAT-PROPOSAL was that `web` land in a **separate workspace or
repository**, separately checked out and import-fenced (Plan.md §2.6,
FLAG-4(b)). **V ruled otherwise, and priced the ruling before making it.**

**DR-068** rules that kept UI component source **MAY** be carried into
DebateAI-V3. **DR-069** rules the fence question, and its terms are reproduced
here rather than paraphrased, because the trade-off is the ruling:

> **NO FENCE.** The kept UI package sits in DebateAI-V3 as a plain,
> always-visible package beside the engine packages — not a separately-checked-out
> workspace, not a separate repository. Chosen explicitly after the cost was
> priced: **DR-003's clean-room mandate has no enforcement mechanism under this
> ruling** — compliance is an honour system, not a checked barrier. The
> consumer-manifest mechanism (§2.6/§2.7's fence-cost) is **not required**.

DR-069's condition travels with it: this is an **accepted trade-off, not a gap —
do not re-raise it as an open question.**

**What follows, mechanically:**

- **The consumer-manifest mechanism is deleted from this design.** Its whole
  purpose was to restore, by generated inventory, the bidirectional AC-61 check
  that a separate checkout would have destroyed. With one workspace the **single
  type graph exists**, so `tools/orphan-audit` decides *consumed ⇒ served* by
  walking the program (§12). There is no `consumer-manifest.json`, no
  pinned-version release gate for it, and **no engine release step that fails on
  a missing manifest** — a gate whose premise is gone would be dead code wearing
  a gate's clothes (charter G3).
- **AC-61 is not weakened; it is enforced by a cheaper mechanism.** Both
  directions of drift stay decidable, and `tools/orphan-audit` still **fails the
  build on an orphan** (§12; AC-77's never-called list still BLOCKS).
- **`RULED — DR-117` restores the property this section rests on.** The single
  type graph is what makes *consumed ⇒ served* a static query rather than an
  inventory join. It is worth naming explicitly, because it briefly was not: under
  the superseded DR-105 stack this check had to be carried by a generated field
  inventory joining two graphs, and the restoration returns it to one walk
  (`01-decisions/README.md` §5.6). **DR-069's no-fence ruling and DR-117's
  one-language ruling are what make it real together** — either alone would not
  suffice.
- **AC-59's "no adapter" is untouched, and never depended on the fence.** It
  requires **one contract declaration**, not one checkout: `packages/contract` is
  the only place a wire shape is declared, and `web` imports it as an ordinary
  in-workspace package (structural rule 2, §3.3). What changes is only that the
  import is a workspace edge rather than a published-artifact dependency.
- **Structural rule 4 survives, on a different basis.** Its code half — no engine
  package imports from `web`, and `web` imports nothing but `contract` — is still
  asserted, but its justification is now **AC-59/AC-60** (one wire declaration,
  one front door) rather than AC-81's clean room. It was always *code* coupling
  that the rule could reach.
- **What is genuinely unenforced, said plainly.** Manifest §14's violation is a
  **reading** violation, and under DR-069 **nothing checks it** — not CI, not
  checkout separation, not the role assignment. DR-003 compliance is an honour
  system. This is written here, in the module design, so that a later reader
  finds the cost recorded where the mechanism would otherwise have been, and does
  not go looking for a barrier that was deliberately not built.

---

## 3. The enforced dependency graph

**This section is the authoritative dependency edge list.** Plan.md §2.6 states
its own table is "the summary the CI rule enforces; the authoritative list is
`03-module-design.md`". The CI rule reads this table.

### 3.1 The edge table

Read as: *the package on the left may import the packages on the right, and
nothing else in the workspace.* Absence of an edge is a prohibition, not an
omission.

| # | Package | May depend on | Basis |
|---:|---|---|---|
| 1 | `kernel` | *(nothing)* | AC-65, AC-35 — the vocabularies must be importable by everyone, so it may import no one |
| 2 | `published-arithmetic` | *(nothing)* | DR-063 VR-3; Plan.md §2.5a — zero dependencies is what makes the shared module provable |
| 3 | `propagation` | `kernel`, `published-arithmetic` | AC-09 purity; AC-14 one engine; structural rule 1 |
| 4 | `battery/decision` | `kernel` **only** | AC-48 purity; structural rule 5 |
| 5 | `contract` | `kernel` | AC-59/AC-60 — one declaration of every wire shape |
| 6 | `db` | `kernel` | AC-01/AC-02 |
| 7 | `register` | `kernel`, `db` | AC-74 |
| 8 | `ledger` | `kernel`, `db`, `register` | AC-44…AC-47 |
| 9 | `providers` | `kernel`, `register`, `ledger` | AC-36/AC-37 (config, not import), AC-13/AC-44 (the gateway writes) |
| 10 | `graph` | `kernel`, `db`, `ledger`, `register` | AC-18, AC-32, AC-33 |
| 11 | `judgement` | `kernel`, `db`, `ledger`, `providers`, `register` | AC-92 |
| 12 | `evidence` | `kernel`, `db`, `ledger`, `providers`, `register`, `graph` | Plan.md §2.6 grouped row |
| 13 | `critique` | `kernel`, `db`, `ledger`, `providers`, `register`, `graph` | Plan.md §2.6 grouped row |
| 14 | `memory` | `kernel`, `db`, `ledger`, `providers`, `register`, `graph` | Plan.md §2.6 grouped row |
| 15 | `liveness` | `kernel`, `db`, `ledger`, `providers`, `register`, `graph` | Plan.md §2.6 grouped row |
| 16 | `settlement` | `kernel`, `db`, `ledger`, `providers`, `register`, `graph` | Plan.md §2.6 grouped row |
| 17 | `valuation` | `kernel`, `db`, `ledger`, `register`, `graph`, `propagation` | AC-30 detachment recomputation runs the same engine |
| 18 | `budget` | `kernel`, `db`, `ledger`, `register` | AC-49, AC-50 |
| 19 | `battery` | `kernel`, `db`, `ledger`, `register`, `budget`, `graph`, **and the domain package owning each stage's substance** — resolved in §3.2 | AC-17; Plan.md §2.6, §3.1 |
| 20 | `serve` | `kernel`, `db`, `ledger`, `register`, `graph`, `propagation`, `providers`, `contract`, `valuation`, `memory`, `liveness` | AC-16, AC-51…AC-58, AC-86…AC-91 |
| 21 | `apps/api` | `contract`, `kernel`, `db`, `register`, `serve`, `battery`, `ledger`, **`settlement`**, **`critique`**, **`liveness`** | AC-60; settlement/critique added at C4 rework round 1; liveness added by S11 for query-driven archival revival |
| 22 | `apps/runner` | every engine package **except** `contract` | Plan.md §2.6 — the runner serves nothing on the wire |
| 23 | `apps/replay` | `published-arithmetic` **only** | DR-063 VR-3 limb (i); structural rule 3 |
| 24 | `apps/scheduler` | `kernel`, `db`, `ledger`, `register`, `propagation`, `serve`, `battery`, **`settlement`**, **`liveness`** | added at C4 rework round 1; settlement added at DR-100; liveness added by S11 for the watched-clock and composite-retirement job |
| 25 | `web` | `contract` only | AC-59, AC-60; structural rule 4. **DR-069: no fence** — this is an ordinary in-workspace edge, and there is no consumer manifest |
| 26 | `tools/orphan-audit` | `kernel`, `contract` (read-only over the TypeScript program — **which now includes `web`**, DR-069) | AC-61, AC-77; **DR-069, DR-097** |
| 27 | `tools/acceptance-bundle` | `kernel`, `contract`, **`register` (read-only)**, `db` (read-only, reached through `register`) | AC-74; Plan.md §8 S15 — **resolves MOD-2 ≡ REG-5**, see the note below |

Rows 12–16 are Plan.md §2.6's single grouped row (`evidence`, `critique`,
`memory`, `liveness`, `settlement`) written out one package per line; the
permission set is unchanged. Plan.md §2.6's single `tools/*` row is split into
rows 26 and 27 because the two tools do not have the same input needs, and the
wildcard hid the difference.

**Why row 21 gained `settlement` and `critique` (H-O-2).** Four declared
endpoints had no legal implementation path: `GET /v1/scorecards` and
`POST /v1/nodes/{id}/feedback` need `settlement` (scorecard cells are **derived
views over the ledger with a recorded derivation version** — AC-41 — so reading
one *applies context 8's rule* and may not be reproduced by a raw query), and
`POST /v1/investigations/{id}/executions` needs `critique` (DR-045's flow). The
alternative — `apps/api` querying `scorecard.*` through its `db` edge — would put
a second implementation of a context's rule outside that context, breaching
AC-85 and charter A3.6. **Acyclicity is unaffected:** `settlement` and `critique`
(rows 13, 16) import no application and no `apps/*` package, and every `apps/*`
unit is a **sink** in this graph.

**Why row 24 exists (H-O-1, H-O-3).** Two obligations in the pack are executed
by *nobody* in the layout as it stood: charter S1's **continuous** replay
self-test (which must recompute a servable number from frozen records **and
write** the eviction transition when it fails — AC-12, DR-059) and AC-89's
**scheduled reaper** (which must transition stale work to failed **without a
read carrying a write side effect** — AC-62, Plan.md §6.6 UI-13). Neither could
live in `apps/replay` without falsifying its read-only credential attestation
(`06-test-strategy.md` FX-IND-03) and breaking VR-3 limbs (ii)/(iii); neither
could live in `ledger` (row 8 cannot reach `propagation`); and neither is a
front-door request. §5.5 states the credential scopes and the limb split.

**Why row 24 gained `settlement` (DR-089).** DR-089 moves Q61 out of the run
lifecycle entirely: *"the standing watch lives outside the run lifecycle
(Stage-11/settlement) and fires when the resolver outcome arrives; calibration
updates version from the ledger record."* A watch that fires between runs is
**time-triggered work with no front-door request**, which is exactly what
`apps/scheduler` is the one home for — and when it fires it must **apply context
8's rules**: the resolution event, the external resolver, scoreability, the
**read-back verification recorded as its own ledger action** (AC-73), and the
proper score registered once. Under **rule 6** those rules are **called across a
declared edge, never re-implemented in the scheduler**; re-implementing them
would put a second copy of context 8's behaviour outside context 8, which is the
breach row 21 was repaired to avoid (AC-85, charter A3.6). **Acyclicity is
unaffected**: `settlement` (row 16) imports no application, and every `apps/*`
unit is a sink.

**Why row 27 exists (MOD-2 ≡ REG-5, adjudicated REAL).** Plan.md §2.6 gives
`tools/*` only `kernel` and `contract`, while Plan.md §8 S15 requires the
acceptance bundle to carry *"the register presented for V's ratification"* —
rows that live in a database table and are not decidable from a TypeScript
program walk. **Resolution, chosen here under the directed repair:** a
**direct read-only `register` dependency** (not an API call, not a separate
export artifact) — the bundle is a build-time tool that must show the register
**as ratified**, and a live-deployment API call would make an acceptance artifact
depend on a running service. The read is **read-only**: the bundle never writes
a register row (`PUT /v1/register/{key}` is the only write path, AC-74).
`05-register-skeleton.md` §5 carries the same resolution.

### 3.2 Resolving row 19 — which domain packages `battery` may import

Plan.md §2.6 states row 19's last clause as a **rule** ("the domain package
owning each stage's substance") rather than a list, while directing that the
authoritative list live here. Resolving it is therefore this document's job, and
the resolution is mechanical: it is exactly §3.1's stage-ownership column.

| Stage (AC-17) | Substance owner | Edge `battery →` |
|---|---|---|
| LOCK, ROUTE | the run's framing state — no separate domain package (§3.1 context 1) | *(none)* |
| AIM, HARVEST, RUN | `evidence` (context 2) | `evidence` |
| SPLIT — the graph object | `graph` (context 3) | `graph` *(already row 19)* |
| SPLIT — spawn mechanics | `battery/decision` (context 3a) | `battery/decision` |
| WEIGH | `judgement` (context 4) | `judgement` |
| CROSS | `critique` (context 5) | `critique` |
| COMPOSE | `valuation` (context 6) | `valuation` |
| SERVE | `serve` (context 7) | `serve` |
| SETTLE | `settlement` (context 8) | `settlement` |

Two consequences a builder needs:

1. **`memory` and `liveness` are not stage-substance owners** (they are
   supporting contexts 9 and 10, §3.1), so row 19 does not admit them. Where a
   stage needs cross-run memory or staleness, it is reached through the stage's
   substance owner or through `serve` — `serve` already carries both edges
   (row 20).
2. **The graph stays acyclic.** `battery → serve` exists; `serve → battery` does
   not (row 20 has no `battery`), and `apps/api` depends on both. Structural
   rule 1 (`propagation` in no cycle) holds trivially: `propagation` imports
   only `kernel` and `published-arithmetic`, neither of which imports anything.

**Resolved, not left open** (gap `MOD-2 ≡ REG-5`, §13): Plan.md gave `tools/*`
`kernel` and `contract` only, while §8 S15 requires the acceptance bundle to
carry *"the register presented for V's ratification"* — rows that are not
decidable from a TypeScript program walk. **Row 27 adds the read-only `register`
edge**, `05-register-skeleton.md` §1.4 records the two rejected alternatives, and
`06-test-strategy.md` **`FX-REG-02`** asserts the edge is exercised on a real
bundle run. The matching **Plan.md §2.6 amendment is carried to FinalPlan** by
this lane.

### 3.3 The structural rules, and the CI check that proves each

Rules 1–5 are Plan.md §2.6's and are CI-enforced. Each is a **graph property**,
which is why it is provable rather than reviewable. **Rule 6 is added at C4
rework round 1** under findings H-O-2 and H-O-10 and is marked as such: it is a
lane-4 SEAT-PROPOSAL, not a Plan.md rule.

| # | Rule | What proves it | Basis |
|---:|---|---|---|
| 1 | `propagation` may not appear in any dependency cycle and may not import anything but `kernel` and `published-arithmetic` | dependency-graph assertion in CI | AC-09 — purity is a graph property, not a habit; the engine must still reach the one shared arithmetic module (§2.5a) |
| 2 | `contract` is the only package the interface may import types from | import assertion over `web`'s build — **an ordinary in-workspace assertion under DR-069**, not a cross-checkout one | AC-59 — "no adapter" means no second declaration of a wire shape anywhere |
| 3 | `apps/replay` imports no workspace package except `packages/published-arithmetic` | dependency-graph assertion **plus** the isolation proof (§5.5) | AC-07 / DR-063 VR-3 limb (i) |
| 4 | No engine package may import from `web`, and `web` may import nothing but `contract` | import assertion both directions | **AC-59/AC-60** — one wire declaration, one front door. Under **DR-069** this rule no longer rests on AC-81's clean room, which has **no enforcement mechanism at all**; see §2 |
| 5 | `battery/decision` may import nothing but `kernel` | dependency-graph assertion + the purity lint (§6.3) | AC-48 — organ 4 gets the fence organ 1 has |
| **6** *(added at C4 rework round 1)* | **Frozen facts are read; rules are called.** A unit may **read another context's already-frozen facts** from the database without importing that context's package. A unit that needs another context's **rule applied** — a derivation, a projection, a status decision, a write to that context's invariants — must call the owning package across a declared edge, and may never re-implement the rule locally. | the import half is the §3.1 edge assertion; the "no re-implementation" half is charter A3.6's maintenance test and charter A3.1's one-of-each, checked at review, not by CI | AC-85 (one behaviour, one place); Plan.md §3 (*"contexts differ by which invariants they own"*, no anti-corruption layer) |

**What rule 6 settles (H-O-10), with the carrier named.** `serve` owns
obligations whose *facts* other contexts produce, and has no edge to `critique`,
`evidence` or `judgement` — deliberately:

- **Q53's residual objection.** The residual objection set is a first-class
  object owned by **context 5 `critique`**, stored in the **objection ledger**
  (Plan.md §2.6 `critique/` — *"objection ledger"*; §3.1 context 5; spec §14,
  §8.1). `serve` **reads those rows as frozen facts** and copies the set into the
  `fact_bundle` field; it never imports `critique` and never decides what belongs
  in the set. **Before S8 exists there are no objection rows, and the field is
  populated with the typed empty set** — which is exactly what Plan.md §8 S0
  means by *"Q53 passes through (vacuous on a one-node graph) **with its
  residual-objection field populated**"*. An absent field would be a different
  thing from an empty one, and only the second is legal (AC-63). **The objection
  ledger's schema home is gap DM-2** (adjudicated REAL, owned by lane 3 /
  FinalPlan); this document names the owner and the read rule, not the table.
- **AC-91's shadow mode.** The evidence gate is run by **context 2 `evidence`**,
  which **records** what it would have suppressed; `serve` reads that recorded
  decision as a frozen fact and publishes it beside the unsuppressed band. The
  gate's eligibility rule stays in `evidence` (AC-91; `09-traceability.md` §1.6).
- **AC-89's stale-work derivation.** `serve` reads the work item's stored
  deadline and applies **its own** invariant (AC-89, Plan.md §6.6 UI-13 — *"the
  read derives"*), which is a rule `serve` owns, not one it borrows. The
  **write** half belongs to `apps/scheduler`'s `job:reaper` (§1.2, §5.4).

**Why rule 5 exists, in one sentence a stranger can check:** without it a
decision could read `now()` for freshness or query the graph for a blocker it
should have been *given* — both compile, both pass every other gate, and both
silently break `decision_record`'s replay identity hash (manifest §7.2f;
Plan.md §2.6).

**A consequence of rule 3 worth stating outright.** VR-3's limb (ii) requires
`apps/replay` to be a **read-only database reader over frozen records**, and
rule 3 forbids it importing `packages/db`. Therefore `apps/replay` reaches
Postgres through the driver directly, under **read-only credentials**, and never
through the engine's database package (Plan.md §2.5 limbs (i)–(iii)). Every
V3-specific structural outcome — lift targets and both-ends markers,
cluster-collapse records, the effective operator and its resolution level, the
recorded arrow order — is **read from the frozen `propagation_run` /
`node_strength_record` rows as data, never recomputed** (Plan.md §2.5).

---

## 4. Invariant ownership — which context owns which rule

**Why ownership is the design.** There is **no anti-corruption layer between
contexts, because there is nothing to translate**: the graph aggregate is shared
and contexts differ by which invariants they own, not by which model they hold
(Plan.md §3; AC-14/AC-15/AC-16 with the organ↔stage table FINAL, AC-17). This is
also charter A3.6's maintenance test made answerable: for any served behaviour,
one context is the single place it is decided.

### 4.1 Core contexts

| # | Context | Package(s) | Stage (AC-17) | Invariants it owns |
|---:|---|---|---|---|
| 1 | Framing | `battery` row contracts + the framing state on `run` | LOCK, ROUTE (greenfield) | the Q4 answer rule frozen and hashed before the first retrieval; `prior_basis` with no DEFAULT/ASSUMED member, never revised upward; Q2 binding as the sole scope key; the five terminal routes; the dual-act phase order machine-enforced (AC-83; spec §5.3 F-6/F-7, §5.5 F-12) |
| 2 | Inquiry | `evidence` | AIM, HARVEST, RUN | the frozen query set with typed amendments; the mixed admissibility rule; three-valued access depth (a preview-only source may never supply a number or quote); absence rows; provenance clusters; freshness never cached; probe capture and instrument certification (spec §7.1–§7.5, §3.5) |
| 3 | Argumentation | `graph` | SPLIT (object + substrate) | node identity never reused; three orthogonal lifecycles; the materialized path (AC-33); **write-time enforcement** (AC-32); the arrow as a stored first-class object with a polymorphic target (AC-18/AC-19); cycle refusal and shared-crux redirect (AC-20); defeater completeness |
| 3a | Spawn decision | `battery/decision` | SPLIT mechanics | AC-48 in full: the pure decision function; the fixed precedence `reopen → challenge → seek evidence → deepen → abandon → continue`; the categorical-only steering law with **unclassified failing closed to scalar**; blockers recorded but excluded from classification; the eight decision audit invariants; the replay identity hash **excluding** idempotency key, spawn count and classification fields; bounded regeneration then the typed "not runnable" abstention |
| 4 | Appraisal | `judgement` | WEIGH | one structured grade per node reduced **deterministically**; parse failure and schema failure kept distinguishable; **no default τ** from a judge that produced nothing (AC-21); **DR-077: the judge's earned weight is consumed in the SELECTION of which judgement becomes the reduced score, under a declared rule — never by averaging**, with the rule recorded on `propagation_run` and the selected judgement on `reduced_judgement`; dispersion across ≥2 judgements **measured and served separately, never blended away**, typed absent below two; the disagreement flag as flag + certainty downgrade; typed non-answers; **organ 2's judge contract in full (AC-92)**, including the claim-type→composition map **held as data, never a source literal** |
| 5 | Adjudication | `critique` | CROSS (greenfield) | different maker = different lineage; independence never fabricated; blinded fingerprinted packets; the Q39 receipt recorded even with no critic; the symmetry set/count diff with **no fairness scalar**, run **over item-scoped actions only, excluded BY KIND never by value** so `UNASSIGNED` stays a real signal (**DR-092**); `UNINSTRUMENTED` withholds the fairness claim and caps the confidence band; the residual objection set as a first-class object; **DR-091: on CASUAL tier the blind-verification trigger is the CROSS-entry leverage snapshot, computed by the pure core with no model calls and recorded as the trigger's basis — never a score input (AC-29); the COMPOSE-time recomputation is authoritative. Standard and high-stakes always verify (DR-019 knob 3).** **DR-090: rival-carver selection runs on the maker-diversity floor alone (DR-013); "measured behavioural difference" is recorded as UNAVAILABLE, never approximated** |
| 6 | Recomposition | `valuation` + calls into `propagation` | COMPOSE | the operator resolution chain (AC-22) with the **deployment row MANDATORY and never blank** (**DR-074**) and the **effective operator plus its supplying level recorded**; the rival reading served where it flips the band; leverage and fragility as **outputs, never weights** (AC-29); the K=1 halt bound (DR-050); the holistic-vs-decomposed diff with averaging forbidden; the overlay detachment invariant (AC-30) |
| 7 | Serving | `serve` | SERVE | the fact bundle of computed facts and typed records only; gate order (AC-52); `max_recompose` and the terminals (AC-53); machine-injected honesty fields (AC-54); degraded-mode projection fields (AC-55); the projection/bundle disclosure split (AC-56/AC-57); Q51 as the sole never-disabled serving invariant; **organ 6 in full — AC-86…AC-91**; **AC-24's band ceiling** (charter VR-2) |
| 8 | Settlement | `settlement` | SETTLE (greenfield) | resolution event + external resolver + scoreability; read-back verification; the proper score registered once; scorecards as **pure ledger functions** (AC-41); cell shape and honest reporting (AC-42); the eight routing guards (AC-40); demonstrated cold-start exit (AC-43) |

### 4.2 The `battery`-vs-domain-package layering rule

**`battery` owns row contracts, activation state and stage sequencing; the named
domain package owns the row's substance** (Plan.md §3.1). An AIM row's
*contract and activation* live in `battery`; its *substance* lives in
`evidence`. Context 3a is the one exception **by ruling**: AC-17 puts spawn
plumbing in SPLIT mechanics, so its substance is a named sub-package of
`battery` rather than of `graph`, and `graph` remains the owner of what a spawn
*writes*.

### 4.3 Supporting contexts and shared modules

| # | Context / module | Package | Owns |
|---:|---|---|---|
| 9 | Memory | `memory` | the key as a projection of already-frozen fields and **not** the cache key; four DB-predicate tiers with no embeddings (AC-68); link-never-merge with no transitive closure (AC-69); pinned pulls (AC-70); a match never reduces the work; three blocking disclosure gates; per-asker scope on question-level pulls (AC-71) |
| 10 | Liveness | `liveness` | relevant-as-of at spawn; watched triggers and TTL review clocks; propagate re-judges only affected nodes; badges never silent; retirement = archival, nothing deleted (AC-05, AC-72) |
| 11 | Budget | `budget` | the visible envelope from asker depth × risk tier; enrichment skips before any hard stop; the protected core's refusal to be skipped (AC-49); rates frozen at run start (AC-50) |
| 12 | Register | `register` | one ratified table of every constant, threshold and flag; the resolution chain per row; provisional rows carrying owner, recalibration trigger and sign-off (charter A5.2); naked-constant printing (AC-75). Detail: `05-register-skeleton.md` |
| 13 | `kernel` | shared kernel | the closed vocabularies; single source = spec §12.3, transcribed once with a test asserting membership **and count** against the spec's own table, never extended locally (AC-65, S-13) |
| 14 | `propagation` (+ `published-arithmetic`) | shared kernel (pure) | the one scoring engine (AC-14) used by Appraisal and Recomposition; `published-arithmetic` is a **boundary inside this module, not a second engine** (Plan.md §2.5a) |
| 15 | `ledger` | shared kernel (written by all) | organ 5; every context writes, SERVE reads (AC-17); recording is not optional anywhere (AC-44) |
| 16 | `providers` | generic subdomain | the one provider interface (AC-36/AC-37); lane assignment and context isolation (AC-39); typed call bounds; **AC-38's deployment-level maker inventory** (§7.3) |
| 17 | `contract` | published language | the wire vocabulary; `apps/api` implements it, `web` consumes it as an **ordinary in-workspace package** (DR-069 — no fence, no published-artifact pinning); nothing else declares a wire shape (AC-59/AC-60) |

### 4.4 Two served surfaces the context map did not name (H-O-2)

Both were declared endpoints with no owning unit anywhere in the C4 set. An
endpoint with no producing unit fails AC-77's reachability audit by
construction, so each is given an owner here.

| Surface | Owning unit | Basis |
|---|---|---|
| **`GET /v1/fleet`** (fleet status) | **`battery`** — run-execution state. `battery` owns *"row contracts, activation state and stage sequencing"* and the stage runners (Plan.md §2.6, §3.1 context 1 + §4.2), so the fleet view is a **read-time projection over the work-claim rows** that sequencing already owns. `apps/api` reaches it through its existing `battery` edge (row 21) — **no new edge**. The reaping side effect that used to ride this read is `apps/scheduler`'s (`job:reaper`), per AC-62 and Plan.md §5.3 | ui §2 surface 14; AC-62, AC-77; Plan.md §5.3 |
| **`GET /v1/session`** (identity/session surface) | **`apps/api`** — it is the principal the front door itself authenticates and scopes, *"what DR-066's 'their session's scope' is evaluated against"* (Plan.md §5.3), and authorization is evaluated per request in the front door against §5.2's three tiers (Plan.md §5.6). It is **separate from the register read** and owns no domain invariant. **DR-070 rules what an asker is: the requesting user/person.** No separate authenticated-principal or session-scope model is built at this stage — **authorization and user credentials are explicitly OUT OF SCOPE**, and V2's `user_dev_token` vertical slice is adopted as sufficient. The resolution `session → asker → answer ownership` collapses to *the requesting user owns their answers*. **DR-070's own condition:** the simplification is **provisional, deferred not designed away**, and real principal/session separation may be needed before a multi-tenant or credentialed launch — so `apps/api` keeps the resolution **behind one function**, and the surface keeps `asker_id`, `session_id` and `caller_scope` as distinct fields, or the revisit becomes a rewrite of every caller | AC-57, DR-066(1); **DR-070**; Plan.md §5.3, §5.6 |

**What the fleet owner depends on, stated plainly.** The work-claim rows behind
both the fleet projection and the reaper's write are the Postgres-backed queue of
Plan.md §2.7, for which **Plan.md §4 declares no table**. **Carrier:
`core.work_item`** (`02-data-model.md` §3.8) — **accepted at DR-099 (amendment
A-05)**, closing gap **MOD-4** (§13). The **owning package** is assigned here to
`battery` under lane authority (§7 row 4 gives lane 4 *"the runner's unit of
work"*), and the table keeps that one owner: `battery` owns the state,
`apps/runner` executes, `apps/scheduler`'s `job:reaper` writes expiries, the
fleet surface reads.

---

## 5. The four seams as module interfaces

A seam is where two constraints meet and one would otherwise break. Plan.md §3.2
states them; this section states them **as the boundary each package presents**.

### 5.1 Seam A — the evaluation snapshot (AC-09 × AC-01)

The graph lives in Postgres; the math may not touch a database. The boundary is
**materialise → compute → persist**:

```
graph.materialiseSnapshot(runId, …)  : EvaluationSnapshot   // impure: reads Postgres
propagation.evaluate(snapshot)       : PropagationOutcome   // pure: no I/O of any kind
ledger.recordPropagationRun(outcome) : PropagationRunRef    // impure: writes Postgres
```

*(architecture term: **evaluation snapshot** — an immutable in-memory value
carrying the node set, the arrow set, the per-parent operator resolution, the
cluster records and a recorded total order over arrows.)* This is the concrete
answer to spec ambiguity AM-11 (Plan.md §3.2, §6.2 AM-11).

**The ordering rule, stated in Plan.md once and only in Seam A** (AC-08): the
arrow evaluation order is a **deterministic function of stable non-identity
content** — `(target_kind, polarity, kind, source node's materialized path,
sibling ordinal)` — with `created_at_seq` as the final tiebreak and
**`NULLS FIRST` declared explicitly on `kind`** (support edges carry
`kind IS NULL` per Plan.md §4.2(1); leaving NULL placement to the engine default
is exactly the storage-engine-specific ordering behaviour manifest §8.2g
refuses). It is **recorded on `propagation_run`**. It is deliberately **not** an
order over opaque identities (manifest §8.2g).

**Because the order is recorded, every recomputation of an already-computed run
consumes the recorded order and never re-derives it.** This binds the
overlay-detachment byte-identity check (AC-30), the replay ceremony (AC-07) and
the removal-based leverage/fragility recomputations (AC-29): without it the
detachment invariant could fail for a reason that is not overlay mutation
(Plan.md §3.2).

**Who derives the order, stated once (H-C-7).** **`graph.materialiseSnapshot` is
the sole production owner of the first derivation.** Plan.md §3.2 defines the
evaluation snapshot as *already carrying* a recorded total order over arrows and
assigns the boundary as *"`graph` builds the snapshot (impure), `propagation`
consumes it"* — so the order is part of what "building the snapshot" means, and
leaving the owner open would fail charter A3.6's maintenance test on the one
value AC-08 exists to protect.

- **`propagation` consumes the supplied order and never derives one.** It
  **rejects** a malformed or non-total order — an order that does not cover the
  snapshot's arrow set exactly once is a typed compute error, not something the
  pure core silently repairs (AC-08, AC-20; the outcome union of §6.1 is where
  it lands).
- **The only other derivation is in the property fixture**, which derives the
  order a second time to assert it is **stable across two independent
  derivations of the same snapshot** (Plan.md §3.2, §7 doc 7). A fixture is not
  a second production owner.
- **On recomputation nobody derives anything**: the recorded order is read from
  `propagation_run` and consumed as data (above).

### 5.2 Seam B — the single writer for graph invariants (AC-32 × AC-20)

All node and arrow writes go through `graph`'s write API inside **one
transaction that takes a per-graph advisory lock**, so acyclicity is checked
against a stable predecessor set. Three layers, all of which must exist
(AC-20; charter §5.2 row 10):

| Layer | Where | Behaviour |
|---|---|---|
| 1 — construction | `graph`'s builder | refuses the cycle-closing edge and **redirects** to a typed shared-crux sub-claim or an ancestor attack (DR-042) |
| 2 — write | DDL + the locked transaction | DDL carries what DDL can (enum `CHECK`s, the non-blank claim, endpoint foreign keys, self-edge rejection, arrow-identity uniqueness); the transaction carries the recursive reachability check |
| 3 — compute | `propagation` | a **typed error** — never a partial result, never a fixed-point approximation. "Circular dependency found" is served information (AC-20) |

Interface in §8.

### 5.3 Seam C — the provider gateway (AC-36 × AC-04 × AC-44)

Every model call crosses **one** interface taking a typed role, a lane, a call
bound and a contract hash, and returning a raw artifact. The gateway persists
the raw artifact **unconditionally** (AC-13) and writes the ledger row (AC-44)
**outside any open write transaction** (AC-04). Provider identity, model id and
`model_version` are configuration values on the way in (AC-36) and recorded keys
on the way out (AC-42). Interface in §7.

### 5.4 Seam D — the projection boundary (AC-56 × AC-64)

`serve` produces two distinguishable kinds of thing:

| Kind | Examples | Discipline |
|---|---|---|
| **Frozen artifacts** | the fact bundle, the conformance record, the served numbers and their provenance | persisted, hashed, replay inputs — freezing them is what AC-06 requires |
| **Projections** | badges, marks, provenance summaries, per-node restatements, current staleness state, the derived per-segment served state | **computed at read time from stored typed fields** — because a staleness state that changed after serving must be visible on the next read (AC-64) |

This is the concrete answer to ui ambiguity 3 (Plan.md §3.2, §6.6 UI-3). Two
consequences this document carries into module boundaries:

- **Status is derived, never asserted** (AC-88). The run's current phase,
  envelope state and per-row activation state are derived from the latest event
  on their append-only streams (Plan.md §4.1a); a served number's status is
  derived from `served_number_event`; an answer with ≥1 `EVICTED` event projects
  as components-only + `DEFECT` (Plan.md §4.4 clause 2a).
- **Stale-job expiry does not write on the read path.** The *state transition* is
  performed by **`apps/scheduler`'s `job:reaper`** (§1.2, edge row 24); the
  *read* derives the failed status from the deadline **without writing** —
  satisfying AC-88 and AC-62 simultaneously (AC-89, disposed at Plan.md §6.6
  UI-13). **Invariant owner: context 7 `serve`** (the derivation) —
  `apps/scheduler` is the *execution host* for the write, not a second owner of
  the rule (rule 6). Its write target is `core.work_item` (`02-data-model.md` §3.8,
  accepted at DR-099 — A-05), whose state §4.4 assigns to `battery`. The pair is fixtured at `06-test-strategy.md` **FX-SRV-10**
  (reaper-writes / read-derives).

### 5.5 The replay boundary (charter S1 / DR-034 / DR-063 VR-3)

Not one of the four seams, but a module boundary of the same kind, and the one
most easily broken by a well-meaning refactor.

#### 5.5.0 Charter S1 has two limbs, and they have different owners (H-O-1)

DR-034 states both in one sentence: V3 *"permanently refuses to serve a number it
cannot recompute from its frozen records (no AI in the replay; **continuously
self-tested**) AND **at launch one independent replay** of recorded runs must
pass exactly — the proof ceremony."* Two obligations, two units. Conflating them
is what left the eviction trigger — the premise of the whole eviction carrier
(AC-12, DR-059, charter §5.2 row 12, **BLOCKING**) — with nowhere to execute.

| | **Continuous limb** | **Launch ceremony limb** |
|---|---|---|
| **Obligation** | every servable number recomputes from frozen records, continuously; a number that fails is **evicted** with a typed `MISSING-NUMBER` mark and the rest of the answer serves with `DEFECT` | **one independent replay** of recorded runs passes **exactly** — byte-identical served numbers |
| **Owner** | **`apps/scheduler` · `job:replay-self-test`** (§1.2, edge row 24) | **`apps/replay`** (§1.2, edge row 23) |
| **Reads** | frozen records through `ledger`'s reconstruction paths (AC-47), plus the register version the run pinned | frozen records only, through the Postgres driver directly — it may not import `packages/db` (structural rule 3) |
| **Recomputes with** | **`propagation`** — the one engine. A separate implementation here would be the **second scoring path AC-14 forbids**; sharing the engine is required, not tolerated | **`published-arithmetic` only**; every V3-specific structural outcome is **read from the frozen rows as data, never recomputed** (Plan.md §2.5) |
| **Writes** | **yes, and only this:** `served_number_event {… status: EVICTED …}` and the matching `segment_suppression` row, through **`serve`'s eviction writer** — `serve` owns the eviction transition (Plan.md §4.4 clauses 2–2a), so the scheduler calls it and does not re-implement it (rule 6) | **never.** A ceremony failure is a **failed launch gate**, not a write |
| **Credentials** | read-only on every schema **except** append rights on `serve`'s two eviction streams | **read-only, full stop** — the scope `06-test-strategy.md` **FX-IND-03** attests |
| **Independence** | **not required by any ruling.** VR-3's three limbs bind *"the ceremony"*; DR-034's continuous limb requires only *no model in the path* | **required, three limbs**, below |

**`apps/scheduler`'s other jobs have their own scopes, and they are not this one
(H-O-24).** The credentials row above is `job:replay-self-test`'s. Stating only
the self-test's scope would leave a deployer granting the one scope written down,
under which the other two jobs cannot write and their obligations silently never
fire — a dark gate (charter G3). **The three jobs share a process and do not
share a credential:**

| Job | Credential scope | If it is misgranted |
|---|---|---|
| **`job:replay-self-test`** | read-only on every schema **except** append rights on `serve`'s two eviction streams (`served_number_event`, `segment_suppression`) | a number that stopped reproducing keeps serving — the failure charter S1's continuous limb exists to catch |
| **`job:reaper`** | read-only on every schema **except** write on the work-claim rows — **`core.work_item`, schema `core`, not `serve`** | stale claims are never transitioned. **AC-89's guarantee survives** (the read derives the failed status from `claim_deadline` without writing, `FX-SRV-10`), so no reader is misled, but `FX-SRV-10`'s **write half never fires** |
| **`job:settlement-watch`** *(DR-089)* | read-only on every schema **except** three appends, all inside `scorecard` and `ledger`: **`scorecard.answer_outcome`**, its **`ledger_entry`** rows, and **INSERT-only on `scorecard.scorecard_cell`** for a **new derivation version** — **no UPDATE and no DELETE on any of the three**, and **no write on `serve` and none on `core`** | a resolver outcome arrives and is never recorded, so the calibration re-derivation never happens and DR-089's *"its outcome saved to the execution ledger"* is unmet — **silently**, because a watch that never fires and a watch with no outcome to record look identical from outside |

**Why the third append exists, and why it is INSERT-only (completing the
mechanism).** DR-089 ends with *"calibration updates version from the ledger
record"*, and `02-data-model.md` §3.9 carries that as **a new `scorecard_cell`
derivation version over the ledger**. `scorecard_cell` is a **derived view
materialised with a recorded derivation version** (`02` §8, §1.1) — so the
calibration update is a **materialisation write**, and a credential naming only
`answer_outcome` and `ledger_entry` would leave the job able to record the
outcome and unable to complete its own documented job. The grant is therefore
extended, and bounded three ways:

- **INSERT-only.** A new derivation version is a **new row set keyed on the
  version**, never an edit of an existing one. Revoking `UPDATE`/`DELETE` is what
  keeps AC-41's *"a cache with a replayable definition, never an independent
  write path"* true at the credential layer — with them, the job could silently
  restate a past scorecard instead of superseding it.
- **Still inside two schemas, not four.** The three-way separation is intact:
  this job writes `scorecard` + its `ledger` rows, the reaper writes `core`, the
  self-test appends to `serve`. **No two jobs share a target.**
- **The rule is still called, never re-implemented.** The materialisation is
  context 8's derivation (AC-41), reached through row 24's `settlement` edge
  under rule 6. The credential says which principal executes it; `settlement`
  remains the single owner of what it computes — `apps/scheduler` is the
  execution host, not a second definer.

**The third scope is the narrowest and the easiest to over-grant.** It must not
carry the reaper's `core` write or the self-test's `serve` append: a settlement
job able to write `serve` could evict a number outside the one owner of the
eviction transition (§5.5.0's Writes row), and a settlement job able to write
`core` could move run state after the run recorded its `TERMINAL` event, which
`02-data-model.md` §3.9 forbids. **Scope separation here is not hygiene — it is
what keeps DR-089's "outside the run lifecycle" true at the credential layer.**

**One type-home consequence, stated so the continuous limb is buildable.**
`ledger` owns the four reconstruction paths (AC-47) and may not import
`propagation` (row 8), so the **snapshot and per-node record types are declared
in `kernel`** — the package every context may import (row 1). `ledger` rebuilds
the *value* from frozen rows; `propagation` computes over it. Without that type
home the continuous limb has no legal way to hand a reconstructed snapshot to
the engine.

**Why this does not reopen VR-3 option (i).** VR-3 rejected *"the same code in a
fresh process, which proves little"* **as the ceremony**. The proof of
independence is supplied at launch by `apps/replay`, under all three limbs. The
continuous limb is a *production safety property* — it must catch a number that
stopped reproducing — and AC-14 requires it to use the same arithmetic, because
a second implementation of the arithmetic inside V3 is itself the defect
(§2.5a). Two different jobs, two different guarantees, and the eviction path now
has exactly one owner instead of none.

**Fixture addresses, landed.** The split is done: `06-test-strategy.md` §6
carries **`FX-LG-01a`** — the continuous limb, owner `apps/scheduler` ·
`job:replay-self-test`, asserting the eviction trigger fires end to end into
`FX-SRV-03` / `FX-SRV-05` — and **`FX-LG-01b`** — the launch-ceremony limb,
owner `apps/replay`, byte-identical numbers, all three VR-3 limbs, credential
scope attested by `FX-IND-03`. **The undivided replay-fixture address no longer
exists** — one address for two guarantees is the conflation this section exists
to end, so every reference names the limb it means.

#### 5.5.1 The ceremony's own boundary

- **`packages/published-arithmetic` holds `agg`, `σ` and the product — and
  nothing else.** A CI assertion pins its **exported surface** to exactly those
  three symbols, because zero dependencies alone would not stop a lift-target
  selector or a collapse filter written inline over plain numbers
  (Plan.md §2.6).
- **A local copy inside `apps/replay` is forbidden.** It would be a **second
  implementation of the scoring arithmetic inside V3** — AC-14 (*"no second
  scoring path anywhere in V3"*) and AC-85 (*"two implementations of one
  behaviour is a defect"*). A ceremony `σ` written with `>` where the engine uses
  `≥` breaks every tie-boundary node, and the pack has no rule for adjudicating a
  ceremony-vs-serving disagreement (Plan.md §2.5a).
- **The isolation proof is pinned at SYMBOL granularity** — exactly `agg`, `σ`
  and `product` — and **fails if `apps/replay` declares any local arithmetic
  symbol of its own**, since structural rule 3 checks *imports* while the proof
  lists *shared symbols* (Plan.md §2.5, §7 doc 7).
- **Three independence limbs, all three carried:** (i) code independence — the
  shared module and nothing beyond it; (ii) frozen records only — a read-only
  database reader, no other input; (iii) **operator independence** — the
  executing principal is a **job with read-only credentials, scheduled
  separately from the acceptance run, reading run ids it did not write**
  (charter S1: *"a person or job that did not produce them"*).

---

## 6. The pure core — signature and fence

Two packages are pure by ruling, for the same structural reason: `propagation`
(AC-09, DR-029 H3) and `battery/decision` (AC-48). "Pure" here has one meaning:
**no model call, no file or network I/O, no clock, no randomness and no database
access** (AC-09).

### 6.1 `propagation`'s signature

Types, not per-function design (§7 row 4's exclusion). Field names are the ones
Plan.md §3.2 and §4.3 already use.

```ts
// packages/propagation — the only entry point the impure world uses
function evaluate(snapshot: EvaluationSnapshot): PropagationOutcome

type EvaluationSnapshot = {
  nodes:            readonly NodeFacts[]        // τ or its absence, lifecycle, path, position label
  arrows:           readonly ArrowFacts[]       // polarity, kind, target (node | edge), strength | UNKNOWN
  operatorByParent: OperatorResolution          // effective operator + the level that supplied it (AC-22)
  clusters:         readonly ClusterRecord[]    // provenance clusters (AC-23)
  arrowOrder:       RecordedArrowOrder          // Seam A; consumed, never re-derived, on recomputation
}

type PropagationOutcome =
  | { ok: true;  perNode: readonly NodeStrengthRecord[]     // AC-34 — never a flat node_id → float map
                 collapses: readonly ClusterCollapseRecord[] // {cluster_id, key, absorbed_edge_ids, surviving_member}
                 fingerprint: GraphFingerprint }             // input-order-independent (Plan.md §4.3)
  | { ok: false; error: TypedComputeError }                  // AC-20 — never a partial result
```

- `NodeStrengthRecord` carries `{strength, tau_source, way_of_knowing,
  cluster_id, judged_by, abstained, supported_by, attacked_by, operator_used,
  position_label, lift_marker}` (manifest §4.3; Plan.md §4.3) — the number joined
  to its origin, so the D4 join cannot be forgotten (AC-34).
- **A partial result is unrepresentable.** AC-20 requires a typed error and
  forbids both a partial result and a fixed-point approximation; whether the
  carrier is a returned discriminated union or a thrown typed value is not
  constrained by the pack, and this document does not constrain it either.
- **No default τ anywhere** (AC-21/M1): an unjudged node emits no arrow and
  carries a typed record; an unjudged **interior** node is transparent, its
  children's arrows attaching to the nearest judged ancestor **with a marker at
  both ends**; deriving an interior base score from children is forbidden.
- **The arithmetic is now ruled, and the signature is unchanged.** Every Theme C
  ruling is a rule over the same inputs and the same recorded outputs, which is
  why none of them moves a type:

| Ruling | What the core does | What it emits |
|---|---|---|
| **DR-071** — undercut = **transmission-reduction** | reduces the **transmitted contribution** of the targeted support edge, computed **inside the pure core**; a third ruled producer of arrow strength under `OD-06` (2 → 3) | a per-edge **transmission-reduction record** on the outcome, persisted to `propagation_run` (`02-data-model.md` §6.4a) |
| **DR-072** — lifting composition | **folder-lift first, then `OD-02`'s judged-ancestor lift**, in that order | **both-ends markers in BOTH cases**, with the applied lift kind, target and ordinal — `lift_records` / `lift_marker` |
| **DR-073** — cluster collapse | applies to **both polarities**, support and attack; a claim node's key derives from its evidence's provenance and the producing run/model family; **a node with no resolvable key clusters alone** | cluster records carrying `polarity` and `key_basis`, singletons included |
| **DR-074** — the operator | resolves parent → run → deployment where the **deployment row is mandatory and never blank**; **no undeclared state exists**, so the core has no withhold branch to take | the **effective operator and the level that supplied it**, on every produced number |
| **DR-075** — `pending` nodes | a `pending` node **is** an unjudged interior node under `OD-02`: no scoring arrow to its parent, children lift to the nearest judged ancestor, skip-markers at both ends. **Placeholder arrows are live, real endpoints** and are ordinary members of the snapshot's arrow set | nothing new — this is M1's existing path, applied |
| **DR-077** — judge weight | consumed in the **selection** of which judgement becomes the reduced score, under a **declared rule**; **never averaging**, and dispersion is **never blended into** the served number | the selected judgement and the rule identity, with dispersion measured separately |

- **Two things the pure core must NOT read, and the snapshot's shape is what
  enforces it.** The `EvaluationSnapshot` above has exactly five fields.
  **DR-091's CROSS-entry leverage snapshot is not one of them** — it is computed
  by the core and recorded as a *trigger basis*, and if it re-entered as an input
  it would make leverage a weight, which **AC-29** forbids outright. Neither is
  **AC-25's semantic-restatement flag** (`02-data-model.md` §5.6). In both cases
  the exclusion is structural: the core *cannot* read what it is not given.

### 6.2 `battery/decision`'s signature

```ts
// packages/battery/decision — organ 4 (context 3a), imports kernel ONLY
function decide(input: {
  signals:   readonly [SignalBundle, SignalBundle]  // the two typed bundles (AC-48)
  pathState: PathState                              // materialised by the caller, never fetched here
}): DecisionOutcome                                 // firing reason, categorical|scalar, blockers, spawn count
```

Its **impure caller is the stage runner**, which materialises the two typed
signal bundles and the path state and passes them in — Seam A's *materialise →
compute → persist*, applied to organ 4 (Plan.md §2.6 rule 5). Two invariants the
signature makes structural: **only categorically-grounded decisions may spawn
real work, and unclassified fails closed to scalar**; **blockers are recorded for
audit but excluded from the classification** (AC-48).

### 6.3 The lint gates that keep both fences

| Rule | Applies to | Forbids | Constraint |
|---|---|---|---|
| `no-impure-import` | **`propagation` and `battery/decision`** | `fs` / `net` / `Date` / `Math.random` / any db import | AC-09, **AC-48** |
| `no-source-literal-constant` | every package | a constant selecting behaviour from a source literal instead of a register row | AC-74, charter A3.5 |
| `require-exhaustive-switch` | every package | **(a)** a non-exhaustive switch over a closed vocabulary, **and (b)** a switch over one with **no default branch at all** | AC-35, AC-65 |
| `no-unlabeled-number` | the wire path | a weight-bearing number serialized without provenance and replay handle | AC-63 |

Charter A3.4 wants each house rule expressed as a gate; these make H3 (AC-09) and
AC-48 **build-time gates rather than review conventions** (Plan.md §2.2, §2.7).
The purity gates for both packages are named fixtures in `06-test-strategy.md`
(Plan.md §7 doc 7).

**`require-exhaustive-switch`'s clause (b) is a correction, and it is retained
from the superseded pass.** The rule as originally written asserted only that a
switch over a closed vocabulary is exhaustive — which the compiler decides when
there is an exhaustiveness assertion in the fall-through. **A switch with no
fall-through branch at all is silently non-exhaustive and gives the compiler
nothing to complain about**, so the gate must assert that the fall-through
**exists** as well as that it is unreachable. The gap was found while
re-expressing this gate for the DR-105 stack and is **not a language artifact**
(`01-decisions/README.md` §5.6 finding 1); it is folded in here because a gate
that can be silently bypassed is not a gate.

**One honesty note, so no reader over-reads the fence.** `no-impure-import`
decides **imports**; an impure call reached through a permitted package's
re-export is not an import here. What closes that hole is not the lint but
**§3.1 rows 1 and 4**: `propagation` may reach only `kernel` and
`published-arithmetic`, `battery/decision` only `kernel`, and each of those is
itself fenced to nothing — so there is **no permitted package through which
impurity could arrive**. A builder who widens rows 1 or 4 has removed the fence
whatever the lint still reports.

---

## 7. The provider gateway (`packages/providers`)

### 7.1 The one interface

```ts
// the ONLY way any V3 code reaches a model (AC-36) — never a model SDK or CLI directly
function call(request: {
  role:          TypedRole          // which role is asking (AC-39 context isolation)
  lane:          Lane               // served | uniform-panel | critic-exempt (AC-40)
  bound:         CallBound          // {max_attempts, token_ceiling, deadline} — values from register rows
  contractHash:  ContractHash       // AC-10 — freezes identity/rubric/prompt/schema/reducer versions
  providerRef:   ProviderConfigRef  // a CONFIGURED value, not an import (AC-36)
  packet:        PromptPacket       // blinded/fingerprinted where the caller's context requires it
}): Promise<RawArtifactRef>
```

**The `await` is where AC-04 is won or lost.** This call may not be awaited inside
an open write transaction, and it takes its own connection for the two writes
below (ADR-0009 clause 7). **`providerRef` is also how the local model is
reached**: vLLM is one adapter behind this interface, selected by a register row —
not a second pathway (`RULED — DR-117`;
[ADR-0018](01-decisions/ADR-0018-deployment-topology.md) clause 3).

`CallBound` is Plan.md's disposition of *"one bounded model call"* — bounded is
modelled as a typed call bound attached per call site and **supplied by register
rows whose values are V's at DR-023** (Plan.md §6.2 AM-13, AC-74). Every attempt,
including schema-failure retries, is a ledger row.

### 7.2 What the gateway must do on every call

| Obligation | Constraint |
|---|---|
| Persist the raw artifact **unconditionally, parseable or not**, with provider metadata allow-listed before storage and recursively scrubbed | AC-13 |
| Write the ledger row — attempts, retries, failures, could-not-dos, typed skips | AC-44 |
| Do both **outside any open write transaction** — never hold a write lock across a model call | AC-04 |
| Record provider, model id and `model_version` as keys on the way out | AC-42 |
| Keep research and criticism in different contexts; never let the agent that produced an artifact grade it; strip agent identity before another role reads prior turns | AC-39 (H6) |
| Keep `raw_text`, provider metadata and request metadata **operator-only** — for every model call including the composition model and the conformance judge | AC-44, AC-87; Plan.md §5.2 |

### 7.3 The deployment-level maker inventory (AC-38) — two predicates, not one

DR-055 separates a **standing configuration** from a **transient outage**, so one
predicate cannot carry both (Plan.md §3.2).

| Predicate | Subject and timing | Reads | Consequence |
|---|---|---|---|
| `deployment_maker_capability` | the **deployment's configuration**, at startup and on every register change; **not** a liveness probe | the register's configured provider set resolved to distinct **makers** (DR-013's bright line) | **the launch/admission gate**: false ⇒ standard-and-above asks are **refused** and the S15 attestation is absent |
| `run_maker_reachability` | **one run**, per critique attempt | the ledger's recorded provider errors/timeouts for that run | **the transient path only**: false on a capable deployment ⇒ DR-014's cap-and-label (`SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE`, confidence-band cap, recorded lift condition) |

A **ledger-derived counter** classifies every capped run against the two
predicates, so a standing misconfiguration can never accumulate as a run of
"transient" outages. Without the split, every standard-tier run on a
one-provider deployment quietly takes DR-014's path and DR-055's launch gate is
dead code wearing a gate's clothes — charter G3's exact indictment
(Plan.md §3.2).

### 7.4 H2 as an executable scenario, not a claim (AC-37)

**The launch artifact already contains at least two provider implementations**,
both compiled into `packages/providers` and both registered in its provider table
at build time; adding or switching the second *configured* provider is a
**register-row change only — no code change anywhere** (Plan.md §3.2). Two
distinct house-rule tests own the two halves, and `06-test-strategy.md` carries
them: **H2-a** (config-only switch: byte-identical source and build inputs
between the two runs except that one register row, including everything inside
`packages/providers` and the rest of `packages/register`) and **H2-b** (a third,
previously unimplemented provider is a code change **inside
`packages/providers` only**). Under AC-38/DR-055, H2-a is a **launch
prerequisite**, not merely charter A5.1's advisory drill.

---

## 8. The graph write API (`packages/graph`)

### 8.1 Shape

```ts
// every node and arrow write goes through here — Seam B
function withGraphWrite<T>(runId: RunId, fn: (w: GraphWriter) => Promise<T>): Promise<T>
// opens ONE transaction and takes the per-graph advisory lock, so acyclicity is
// checked against a stable predecessor set (AC-32 × AC-20)

interface GraphWriter {
  addNode(...):        NodeRef      // write-time checks per AC-32
  reviseNodeText(...): TextRef      // append-only history, exactly one live text (manifest §6.2)
  addArrow(...):       ArrowRef     // upsert semantics below; polymorphic target (AC-18/AC-19)
  markExhaustion(...): void         // defeater completeness: non-empty or exhaustion-marked
}
```

**The callback body is the transaction**, which makes ADR-0009 clause 7 checkable
by reading: **no `await` on the provider gateway may appear lexically inside it.**

### 8.2 The behaviours the write API must present

| Behaviour | Rule | Authority |
|---|---|---|
| **Cycle refusal** | the builder refuses the cycle-closing edge and redirects to a typed shared-crux sub-claim or an ancestor attack | AC-20 layer 1 (DR-042) |
| **Acyclicity at write** | the recursive reachability check inside the locked transaction | AC-20 layer 2, AC-32 |
| **Arrow upsert** | identity = `(source_node_id, target_kind, coalesce(target_node_id, target_edge_id), polarity)`; on conflict, **if `(strength, magnitude_status, strength_source, kind)` are all equal the write collapses** to the existing row; **if any differ it raises the typed integrity error** — never a silent pick | AC-35 (both behaviours, manifest §4.4); Plan.md §4.2(3) |
| **The undercut targets a SUPPORT edge** | enforced by the graph-scoped composite FK plus the `kind`/`target_edge_polarity` `CHECK`; the write API restates it **only for error quality** | DR-066(2), AC-19; Plan.md §4.2(2) |
| **Graph-scoped endpoints** | every endpoint is bound to the edge's **own** graph via `run_id`-carrying composite FKs; a cross-run endpoint is a write error | AC-69, C-11; Plan.md §4.2(5) |
| **Non-blank claim** | `claim_text text NOT NULL` **together with** `CHECK (length(btrim(claim_text)) > 0)` — a bare trimmed-length `CHECK` **accepts the null case it appears to reject** in PostgreSQL | manifest §6.4, charter A3.2; Plan.md §2.4, §4.2 |
| **Closed vocabularies** | node type, child kind, arrow kind, lifecycles — Postgres `CHECK` against the `kernel` enum **plus** an application exhaustiveness check; unknown members fail loudly at write | AC-32, AC-35 |

**Canonical ownership, stated once.** Every invariant above has **one**
authoritative definition — the migration that creates its table, inventoried in
`02-data-model.md`. Application-level checks are **restatements for error
quality and are never the authority** (AC-85; Plan.md §2.4). Every fixture for a
DDL invariant exercises the **migrated database directly**, bypassing every
application validator, or it tests the restatement rather than the authority
(`06-test-strategy.md`).

**Ruled at DR-071.** `strength_source`'s third member (`UNDERCUT_TRANSMISSION`)
is **writable**: DR-071 rules the undercut's shape is **transmission-reduction**
and grants the `DR-062 OD-06` producer-set extension, **two → three**. The
`CHECK` that binds the member to `kind = 'undercutting' AND target_kind = 'EDGE'`
**stays** — it was always the placement rule, never the not-writable rule — and
it is what keeps AC-27's closure intact for every other edge. No removal path
fires, so AC-77 / charter VR-4 are satisfied by use rather than by deletion
(`02-data-model.md` §5.5(4), §12 row 14).

**Ruled at DR-075.** The write API's *"endpoint absent from the node set"*
refusal is **narrowed to genuinely foreign or deleted endpoints**. A
**placeholder arrow is a live, real endpoint** and must be **accepted**: DR-076
requires a pending node to be structurally connected to its parent **from the
moment it spawns**, and a write API that refused the connecting arrow would make
that unsatisfiable. Nothing about the placeholder is special-cased in
`addArrow` — what makes it a placeholder is the target node's
`generation_status`, which is the node's fact (`02-data-model.md` §5.5(5)).
**Serving a placeholder as a claim stays forbidden regardless** (DR-075's own
condition; manifest §6.2 item 10, AC-86) — being a legal endpoint and being a
servable claim are two different permissions, and `graph` grants only the first.

---

## 9. The runner's unit of work (`apps/runner`)

### 9.1 The unit

Stage work is **idempotent scoped work items** — a `(row, node-set)` pair —
rather than monolithic stage passes (Plan.md §6.2 AM-8). One unit serves three
callers that the pack otherwise models separately: Q46's halt-and-deepen
re-entry bounded at **K=1 per parent per run** (DR-050), DR-015's propagate
("re-judge only the affected nodes") and Q29's regeneration return.

### 9.2 Claiming work

**A Postgres-backed queue inside the one store** (`SELECT … FOR UPDATE SKIP
LOCKED`), with work **claimed and committed *before* any model call** and
results written after (Plan.md §2.7). Three constraints force this shape:
AC-02 (a broker or Redis would be a second durable store for run state), AC-04
(never hold a write lock across a model call; a crash mid-batch leaves completed
work durable and resumable) and AC-44 (the ledger is the record of what ran).

**Who owns the work-claim rows.** The queue's rows are **`battery`'s** — it owns
stage sequencing and the stage runners (§4.2, §4.4), and three units read or
write them: `apps/runner` (claim and complete), `apps/scheduler`'s `job:reaper`
(the stale transition, AC-89) and `apps/api` (the fleet projection, §4.4). Each
carries a work item's **`claim_deadline`**, which is what makes `serve`'s
read-time derivation possible without a write (§5.4). **Carrier:
`core.work_item`** (`02-data-model.md` §3.8), **accepted at DR-099 (A-05)** —
gap **MOD-4** closed (§13). The owning *package* is assigned here because §7
row 4 assigns this document "the runner's unit of work"; the *table shape* is
`02-data-model.md`'s proposal, and it is the one mutable operational table,
because the **ledger** is the record and no served number reads it (AC-44,
AC-34).

### 9.3 Starting a run

In **one transaction**, before the first stage executes (Plan.md §4.1a):

1. the `run` **frozen head** — `UPDATE` and `DELETE` both revoked, so
   `stranger_sample_rate`, `envelope_basis`, `register_version` and
   `battery_version` cannot move inside a live run or be erased afterwards
   (AC-50, AC-49, AC-74, AC-05/AC-45);
2. the **mandatory initial events** — `PHASE = EMPIRICAL`,
   `ENVELOPE_STATE = WITHIN`, `ENVELOPE_CONSUMED = 0`, and one
   `run_row_activation_event` per battery row carrying its opening state from its
   activation predicate;
3. one immutable `run_row_activation` row per `(run_id, battery_row_id)`.

**An empty stream is not a legal state and is a typed error on read, never a
default** — "derived from the latest event" is undefined over an empty stream,
and a default here would be the silent assumption the pack forbids everywhere
else (Plan.md §4.1a).

### 9.4 Resuming a run

`last_evaluated_at_seq` is **derived** as the `at_seq` of the latest event for
that `(run_id, battery_row_id)` — not a stored column. It is what makes AC-04's
"resumable" real: **without it a runner restart cannot know which rows were WAIT
under which predicate**, so the resumed run either re-fires rows the ledger
already recorded or files WAIT rows as INACTIVE, which spec §1 forbids — as it
forbids filing `POLICY_BLOCKED` as INACTIVE. A cache hit never sets a row
INACTIVE (spec §1, `OD-M-22`; AC-83).

**Ruled at DR-089 — the WAIT drain law.** *"At debate (run) completion NOTHING
remains in a waiting state — every node is fulfilled and user-visible; a waiting
node completes as soon as its dependencies complete."* The runner's evaluation
policy is therefore fixed, and three obligations follow for `apps/runner`:

1. **A WAIT row is re-evaluated on every dependency completion**, not parked. The
   carrier already supports it — the derived state is the latest event's — so
   what DR-089 selects is the *trigger*: a completing dependency wakes the rows
   that waited on it.
2. **The run may not record its `TERMINAL` event while any row derives `WAIT`**
   (`02-data-model.md` §3.3, §3.9, §12 row 27). **No completed run displays a
   dangling WAIT**, and because the check reads the *derived* state it cannot be
   satisfied by a stale column.
3. **A run that cannot drain does not terminate quietly.** It reaches a terminal
   state through a **typed failure**, recorded like any other (§10) — not by
   filing its waiting rows as INACTIVE, which spec §1 forbids and §9.4's own
   resume argument depends on.

**This amends the literal reading of spec §3 Q61's *"may sit in WAIT
indefinitely"***, and DR-089 says so in terms: the indefinite watch **persists
across runs, outside any run**, and lives in `apps/scheduler`'s
`job:settlement-watch` (§1.2, §5.5.0). **The runner therefore never owns a
standing watch** — a distinction worth stating because the old reading put one
inside the run and made termination undecidable.

### 9.5 What the runner may not do

- It may not compute a score outside `propagation` (AC-14) or decide a spawn
  outside `battery/decision` (AC-48).
- It may not hold a write transaction open across a provider call (AC-04) — the
  gateway's ordering in §7.2 is the mechanism.
- It may not skip a **protected-core** row for budget reasons: provenance,
  abstention typing, standard-and-above blind verification, citation routes and
  serve-conformance are never budget-skippable; every legal skip carries a
  visible `SKIPPED-BY-BUDGET`, and envelope exhaustion hard-stops with
  `ENVELOPE_EXHAUSTED` — **never a silent timeout** (AC-49).

**Which rows are skippable is ruled at DR-093.** The per-row
correctness/enrichment classification is produced by **architecture proposing the
full 71-row split and V ratifying once**, in one sitting alongside the register —
the wholesale-register pattern of DR-061/DR-062. Two clarifications DR-093 puts
on the record, both of which change what the runner must implement:

- **It is one-time design-time config, fully automatic at runtime, with no human
  in any user's loop.** The runner reads a classification; it never asks for one.
- **Until ratified, every row behaves as CORRECTNESS — never skipped.** That is a
  real default with a real cost (a run may exhaust its envelope where a ratified
  split would have skipped an enrichment row), and it is the safe direction: the
  alternative would skip a correctness row on the strength of an unratified
  guess.

**The classification lives in the register**, so `budget` resolves it like any
other configured value (§4.3 context 12) and the runner holds no table of its
own.

---

## 10. Error and failure typing

**The standing rule.** Every caught failure is typed **and written to the
ledger**; a swallowed exception is a defect, not a style preference (AC-85,
charter A3.3). The interface **never parses prose to learn a fact** (AC-63) —
V2's `looksProviderOrTokenRequired`, `isMissingJudgeOutputReason` and the
401/403 substring match die with the death list (Plan.md §5.6).

| Failure class | Typed carrier | Where recorded | Constraint |
|---|---|---|---|
| Any executed action's outcome | `OK \| FAILED \| BLOCKED \| TIMED_OUT \| REFUSED \| SKIPPED_BY_BUDGET` on `ledger_entry` | `ledger` | AC-44, AC-46 |
| An executed check mapping to no action-kind member | `UNCLASSIFIED_ACTION`, itself an `UNINSTRUMENTED` trigger | `ledger` | spec §8.1 A-2 |
| Unparseable model output | the raw artifact is persisted **anyway**, with parse status and error; **parse failure and schema failure stay distinguishable** | `raw_artifact` | AC-13, AC-92 |
| A required node with no raw artifact **in any state** | the completeness gate fails; **no aggregated run is written** | `ledger` | AC-11 |
| An unjudged node that *does* have a persisted raw artifact | **not** a gate failure — M1's path: no arrow, a typed record, and the answer serves | `node_strength_record` | AC-11 × AC-21 |
| A cycle at compute time | typed compute error — never a partial result; "circular dependency found" is **served information** | `propagation` outcome + `ledger` | AC-20 |
| Two arrow rows with one identity and differing payload | the loud **typed integrity error** (its sibling behaviour, identical-duplicate collapse, is not an error) | write path | AC-35 |
| A number that fails replay | evicted with a typed `MISSING-NUMBER` mark; the rest of the answer serves with a `DEFECT` badge. **Detected and written by `apps/scheduler`'s `job:replay-self-test` through `serve`'s eviction writer** (§5.5.0) | `served_number_event` | AC-12, DR-059 |
| A work item past its deadline | typed failed reason — **written** by `apps/scheduler`'s `job:reaper`, **derived on read** by `serve` without a write | `core.work_item` (§9.2; `02` §3.8, accepted at DR-099 / A-05) + the read projection | AC-89 × AC-62; Plan.md §6.6 UI-13 |
| A strict-and conjunct unjudged or abstained | the parent number is **withheld** and its components are served | `served_number` `WITHHELD(reason)` | **AC-26** |
| *(deleted)* a parent with **no declared operator** | **not a reachable failure.** **DR-074** makes the deployment-level operator a **mandatory register row, never blank**, so the resolution chain cannot terminate undeclared and the declare-once/withhold runtime machinery is **dropped from the design**. A row that could never fire would be an **AC-77 orphan** (charter VR-4). The anti-defect property it guarded — the operator is a recorded config value, never a source literal — is preserved by the mandatory row plus the recorded **effective operator and supplying level** (`02-data-model.md` §6.4a, §6.5) | — | **DR-074** |
| Any of five serve preconditions unmet | **five distinct typed refusals** — produced-by-ledger, items-are-a-list, every-item-validates, status-string-known, no-item-references-a-foreign-node | `serve` | AC-86 |
| A verdict with no usable basis | typed `unavailable` — **never a number**; a missing or malformed input is read at its **honest zero-information value, never guessed**; a lean with no live supporting or attacking node returns **nothing** | `serve` | AC-90 |
| Transport-level errors on the wire | a **closed error-code enum** with a stable machine-readable body, rate limiting (429), and **typed auth failure distinguished from typed authorization-scope failure** | `packages/contract` | ui §5 W4; Plan.md §5.6 |
| Envelope exhaustion | `ENVELOPE_EXHAUSTED` hard stop serving already-verified components | `budget` → `serve` | AC-49 |

**Two vocabularies, one closure.** Condition marks, abstention kinds and
terminal routes are **imported from spec §12.3 into `kernel`, never minted
locally** (AC-65, S-13). The typed error taxonomy above is the *transport and
execution* vocabulary and is separate; where a failure surfaces to the reader it
appears as a condition mark from the imported table, not as a new typed state.
The *ruled* half of L8 is run-degradation typing; **transport-error typing is a
CANDIDATE clause proposed here, not inherited as law** (ui §7 item 5;
Plan.md §5.6).

---

## 11. What this module map forbids

Restated from Plan.md §3.3 because a boundary that is not written down is not a
boundary.

- **No second graph model.** Every context reads the same node/arrow aggregate
  (AC-15). A context needing a different view builds a **projection** of it,
  never a parallel persisted model.
- **No second scoring path** — including "just for the debug facet", "just for
  the preview" or "just for the UI" (AC-14, AC-16). The debug facet reads the
  **identical node set** as the scored graph (manifest §9.3, DR-062 `OD-18`) and
  can never affect real scoring.
- **No behaviour in two places** (AC-85). Where two contexts need one rule, the
  rule lives in `kernel` or in the owning context **and is called, not copied**.
- **No module shipped unreachable** (AC-77/AC-78), and the two permitted shapes
  are **not interchangeable**. A deferred capability may ship as a
  register-gated branch **only where the pack has not said otherwise**, and that
  branch must be exercisable in both states by a configuration a production
  caller can produce (charter VR-4 class 1, G4). **Where the pack says a gate does
  not ship, it is not written**: the citation hard-kill gate *"must not exist as
  code that cannot fire"* and coverage-as-gate *"ships as the diagnostic
  `UNCOVERED-SCOPE` note only"* (charter §5.2 deferred table,
  `RATIFIED(DR-020 knob 7)`).
  **DR-088 resolves knob 7's auto-activation clause against the not-shipped
  clause: auto-activation COUNTS as shipped dark, and the charter's
  not-shipped rule WINS.** *"Auto-activates"* describes the **activation event
  only** — the citation hard-kill gate is **written when the quote matcher
  validates, never shipped inert**. Until then the acceptance bundle carries a
  **NOT-SHIPPED attestation** in its place (§12; charter §5.2, A4.4). This closes
  charter §9's contradiction 6 and removes the one reading under which V3 would
  ship dormant gate code and call it deferred.

---

## 12. The gates that keep this document true

Design that no gate enforces is a preference. Each row names what fails if the
design drifts (Plan.md §2.7; charter A3.4, VR-5).

| Gate | Enforces | Blocking? |
|---|---|---|
| dependency-graph assertion | §3.1's edge table (rows 1–27) and structural rules 1–5, plus rule 6's import half | CI failure |
| entry-point list includes `apps/scheduler`'s **three** jobs — `job:replay-self-test`, `job:reaper`, **`job:settlement-watch`** (DR-089) | AC-77 — a scheduled job with no published entry point is an orphan the day it lands | **G2's never-called list BLOCKS** (charter A4.2, A4.5) |
| **NOT-SHIPPED attestation** present for every gate the pack says does not ship (DR-088) | charter §5.2's deferred table — a deferred gate is **attested absent**, never present as inert code | **BLOCKING** (charter A4.4) |
| acceptance-bundle register presentation matches the ratified `register_version` | AC-74; Plan.md §8 S15 — the bundle's read-only `register` edge (row 27) is what makes this assertable | fixture owed; **id is lane 6's to mint** |
| `no-impure-import` lint | AC-09 and AC-48 purity fences (§6.3) | CI failure |
| `no-source-literal-constant` lint | AC-74 / charter A3.5 — constants are register rows | CI failure |
| `require-exhaustive-switch` lint | AC-35/AC-65 closed vocabularies — **both clauses**, exhaustive *and* a fall-through that exists (§6.3) | CI failure |
| `no-unlabeled-number` lint | AC-63 — no bare weight-bearing scalar on the wire | CI failure |
| exported-surface assertion on `published-arithmetic` | exactly `agg`, `σ`, `product` (§5.5) — **with the isolation proof reading the names `apps/replay` actually imports**, which is a different question from what the package exports (ADR-0012 clause 3) | CI failure |
| replay-ceremony **isolation proof** (symbol granularity) + **operator attestation** | VR-3's three independence limbs | S15 bundle; charter A4.4 **BLOCKING** |
| `tools/orphan-audit` — G1 reachability over **one TypeScript program including `web`** (DR-069: no fence, therefore **no consumer manifest**; `RULED — DR-117`: one language, therefore one program), G2 call coverage, G5 dead cost, **plus DR-097's advisory register-key audit** | AC-61 both directions, AC-77; **DR-069, DR-097, DR-117** | **G2's never-called list BLOCKS** (charter A4.2, VR-5); G1's report, G5's reviewed manual audit and **DR-097's stale-key report** are advisory (charter A4.1) |
| firing-fixture presence | charter §5.2's table | **BLOCKING** (charter A4.4) |
| db-integration tests against a real Postgres | that DDL invariants are the authority, not the restatements | CI failure |

`06-test-strategy.md` owns the fixtures behind these gates; this document owns
only the boundary each gate is protecting.

---

## 13. Gap register (module-design gaps, merged dispositions)

**Ids are global** (`MOD-*`), per the C4 rework-round-1 convention; the single
consolidated register of all lane gaps is `09-traceability.md`'s gap index
(lane 1). Dispositions below are the **merge node's**
(`reviews/merge-verdict-c4.md` §5), not this seat's.

| Id | Gap | Merged disposition | State after this round |
|---|---|---|---|
| **MOD-1** | Row 19's last clause is a rule, not a list ("the domain package owning each stage's substance") | **MISREAD** — Plan.md §2.6 puts the authoritative edge list here and §3.1 supplies the stage owners; the mechanical expansion is this lane's assigned work | **closed.** §3.2 carries the expansion and shows the derivation |
| **MOD-2 ≡ REG-5** | `tools/*` → `kernel`, `contract` cannot present the register that §8 S15 requires | **REAL** — define an explicit read/input edge | **resolved here.** Edge row 27 gives `tools/acceptance-bundle` a **read-only `register`** dependency; the alternatives (API call, separate export artifact) are recorded and rejected in §3.1's note. Carried to lane 1's consolidated index and to FinalPlan as a Plan.md §2.6 amendment |
| **MOD-3** | Seam A does not name the first arrow-order derivation owner | **MISREAD** — Plan.md §3.2 already puts the order inside the snapshot `graph` builds | **closed.** §5.1 assigns `graph.materialiseSnapshot`; `propagation` consumes and rejects a non-total order; the second derivation exists only in the property fixture |
| **MOD-4** | The Postgres-backed work-claim queue (Plan.md §2.7) has **no table** in Plan.md §4, yet three units read or write it — `apps/runner`, `apps/scheduler`'s `job:reaper` (AC-89) and the fleet projection (§4.4) | **REAL** (raised at round 1 under H-O-3 / H-O-2) | **CLOSED — DR-099 (A-05).** Owning *package* assigned to `battery` here (§4.4, §9.2); **carrier accepted at `02-data-model.md` §3.8 as `core.work_item`**. `FX-SRV-10`'s write half has an addressable target |
| **DM-2** *(lane 3's, referenced)* | The objection ledger — the residual objection set's persistence home | **REAL** | **CLOSED — DR-099 (A-06)**; referenced by §3.3 rule 6: `serve` reads those rows as frozen facts; the table is lane 3's (`02-data-model.md` §11A.2) |

**Nothing in this document is left open on behaviour.** Every question it carried
is ruled (§0's disposition table). What the rulings changed here, in one place:

| Ruling | Changed at |
|---|---|
| **DR-068 / DR-069** — kept source may be carried; **no fence** | §1, §1.2 (`web`, `tools/orphan-audit`), **§2 rewritten**, §3.1 rows 25–26, §3.3 rules 2 and 4, §12 |
| **DR-070** — the asker is the requesting user/person; `user_dev_token` adopted; provisional | §4.4 |
| **DR-071** — transmission-reduction; `OD-06` 2 → 3 | §6.1, §8.2 |
| **DR-072 / DR-073 / DR-074 / DR-075 / DR-077** — the ruled arithmetic | §6.1's ruling table; §4.1 contexts 4 and 6; §8.2; §10 (the withhold row deleted) |
| **DR-088** — auto-activation counts as shipped dark | §11, §12 |
| **DR-089** — the WAIT drain law; settlement outside the run | §1.2 (**third job**), §3.1 row 24 (**`settlement` edge**), §5.5.0 (**credential separation**), §9.4, §12 |
| **DR-090 / DR-091 / DR-092** — rival-carver floor, the CROSS trigger basis, item-scoped symmetry | §4.1 context 5; §6.1's snapshot-exclusion note |
| **DR-093** — architecture proposes all 71, V ratifies once | §9.5 |
| **DR-095 / DR-096** — kept surface, rebuilt insides; no verdict-first flag | §1.2 (`web`) |
| **DR-097** — advisory register-key audit | §1.2, §12 |

---

## 14. What this document does not decide

- **No numbers.** Every constant named here is a **register key**; values are
  V's at DR-023 and appear only where the pack states one (AC-74, AC-76,
  DR-039). See `05-register-skeleton.md`.
- **No table shapes or DDL.** `02-data-model.md` is the authority; table names
  appear here only to say which module owns the invariant behind them.
- **No wire shapes.** `04-api-contract.md` freezes the resource vocabulary (ui
  §5 W1).
- **No per-function design** (§7 row 4's exclusion). Signatures are given at type
  level to fix the boundary, not the implementation.
- **No ruling of its own.** Where behaviour was open this document built the
  carrier; the behaviour is now supplied by DR-068..DR-097, cited row by row.
  Three things stay V's and are marked at their sections: **register values**
  (DR-023), the **DR-093** 71-row split, and the **DR-084** citation-route
  membership.
- ~~**The stack is a proposal.**~~ **The stack is RULED — `DR-117` / `DR-118`.**
  The sentence this bullet used to carry — *if V rules a different language, §4's
  context ownership and §5's seams survive unchanged; only the package technology
  is re-instantiated (Plan.md §9)* — is now **a proven statement rather than a
  hypothetical**: DR-105 ruled a different language, PRE-10 rev 1 re-instantiated
  exactly the package-technology text, DR-117 reversed it, and **§4's ownership
  and §5's seams never moved in either direction**
  (`01-decisions/README.md` §5.6).

---

*End of `03-module-design.md` — ARCH-V3-R1 / C4 lane 4, 2026-08-05. Authored
against Plan.md rev 3.*

***Revised 2026-08-06 at the DR-100 fold-in (PROG-V3-R1, ticket PRE-02):***
*provisional banner removed (DR-098/DR-099/DR-100); **§2 rewritten for DR-069's
NO FENCE ruling** with the honour-system trade-off recorded verbatim and the
consumer-manifest mechanism deleted from §1.2, §3.1, §3.3 and §12; `apps/scheduler`
carries **three** jobs with **separated credentials** and a new `settlement` edge
(DR-089); §6.1 carries the ruled arithmetic (DR-071/072/073/074/075/077) and the
snapshot-exclusion note (DR-091, AC-29); §10's undeclared-operator withhold row
deleted (DR-074) with AC-26's limb intact; DR-070, DR-088, DR-090, DR-092,
DR-093, DR-095, DR-096 and DR-097 folded in.*

***Rev 3 (same day, Codex finding 5):*** *`job:settlement-watch`'s credential row in
§5.5.0 completed — the job needs **INSERT-only** rights on `scorecard.scorecard_cell`
to materialise DR-089's new calibration derivation version, which the earlier
two-append scope could not do; bounded INSERT-only so AC-41's "cache with a
replayable definition, never an independent write path" holds at the credential
layer, with the three-way separation intact (no two jobs share a target) and
`settlement` still the single definer under rule 6. **This document is accepted
architecture** (DR-100).*
