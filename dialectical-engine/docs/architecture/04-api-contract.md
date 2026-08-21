# 04 — API contract

**W1's deliverable: the frozen resource vocabulary and encoding.**

Mission ARCH-V3-R1, step C4, lane 5 · 2026-08-05, **revised 2026-08-06 at the
DR-100 fold-in** · seat: Opus 5 artifact author (session c4-lane-5). Source:
`docs/missions/2026-08-05-v3-architecture/architecture/Plan.md`
rev 3, §5 in full, under §7 row 5's scope. Upstream authority: `docs/founding/`,
`docs/founding/decisions-ledger.md` (DR-001…DR-067) and
`docs/missions/2026-08-05-v3-architecture/decisions-ledger.md`
(**DR-068…DR-101**).

**Accepted architecture.** The provisional banner this document carried is
removed under **DR-098**, **DR-099** and **DR-100** (ARCHITECTURE SATISFIED).
Where a ruling and the older text disagree, **the ruling wins**.

---

## 0. How to read this document

**What this is.** The UI boundary contract is explicit that it is *not* endpoint
design and that "whether that is REST, GraphQL, one document or twelve, is the
ARCHITECTURE loop's to propose and V's to ratify" (`ui §0`). `ui §5` **W1** is the
work item that asks ARCHITECTURE to freeze the native contract's resource
vocabulary and encoding from `ui §1.2`–`§1.4`. **This document is where that
freeze is written.** Everything a client can address, send, receive, subscribe to,
or fail on is named here, once.

**Reading contract.**
- `spec` = `docs/founding/requirements-spec.md`; `manifest` =
  `docs/founding/carryover-manifest.md`; `ui` =
  `docs/founding/ui-boundary-contract.md`; `charter` =
  `docs/founding/quality-charter.md`; `ledger` =
  `docs/founding/decisions-ledger.md` (DR-001…DR-067).
- Order of authority (`spec §2` item 1; `manifest §2.2` item 1): **the ledger wins
  over a founding doc; a founding doc wins over a digest.**
- `AC-nn` refers to the consolidated constraint base in Plan.md §1
  (AC-01…AC-92). Every normative sentence below cites its AC row and/or its DR /
  founding-doc section. **An uncited normative sentence in this file is a
  defect.**
- Vocabulary is `docs/founding/GLOSSARY.md`. Terms coined by the plan are marked
  *(architecture term)* at first use.

**Three status labels, and they are not decoration.**

| Label | Means | Consequence |
|---|---|---|
| **RULED** | the pack decides it; the citation is given | binding on every builder |
| **SEAT-PROPOSAL** | this seat proposes it; V ratifies (DR-005 as narrowed by DR-024) | build it, but it is not law until V says so |
| **CANDIDATE** | the *pack itself* labels the clause a proposal, not a rule (`ui §7` item 5 names them: E3, and the second halves of L3, L4 and L8) | written in conditional voice; **no builder is ordered by it** |

**The encoding as a whole is SEAT-PROPOSAL** (Plan.md §5.1, §5.3). So are every
path, every field name and every wire spelling in this document: `ui §1.2` says
field names in the contract are "illustrative, not normative", which makes naming
architecture's to do and V's to ratify. What is **RULED** is what each resource
*must be able to carry*, who may read it, and what may never appear on it — and
those clauses carry their citations individually.

**No invented numbers** (DR-039, AC-76). No page size, no poll interval, no rate
limit, no band cut-point and no timeout has a value in this document. Where a
value is needed it is named as a register row whose value is V's at DR-023
(AC-74), and the register key inventory lives in `05-register-skeleton.md`, not
here.

**The three controls this contract requires a register row for**, so no builder
has to invent a key or put a literal where AC-74 forbids one (H-C-14). Their
**keys, types, scopes and consumers are `05-register-skeleton.md` §5.4's** — the
carrier class for *"keys the architecture needs, with no pack-stated value"* —
**as amended round 3**; their values stay `— none stated` until V ratifies
(AC-74, AC-76).

| Control | Where this contract requires it | Consumer | Key home |
|---|---|---|---|
| the declared **poll interval** | §4.2 (a poll is event-driven or *declared with a stated interval*, AC-62) | `apps/api` + `web` | `05` §5.4 **as amended round 3** |
| the page-size **maximum** | §7.3 | `apps/api` | `05` §5.4 **as amended round 3** |
| the page-size **default** | §7.3 | `apps/api` | `05` §5.4 **as amended round 3** |

**No key name is minted here.** Minting register keys is `05`'s lane; naming the
*requirement* is this one's, and the two must not both hold a key list (AC-85).

**Rules nothing of its own** (DR-005). Where this contract touched an open
question it built the **carrier**; **DR-068..DR-097 have since ruled all 28**, so
the `pending V — Q-nn` markers are **discharged** and replaced by the ruling that
closed each one. §17 is the disposition table, and §0.1 is the index.

### 0.1 The questions that touched this contract, and the rulings that closed them

Source: `08-open-questions-for-V.md` §0's index (28 questions). Only the thirteen
that touch this contract are listed.

| Was | Ruling | Where it lands in this contract |
|---|---|---|
| **Q-01 / Q-02** — kept UI source, and the fence | **DR-068** (may be carried) + **DR-069** (**NO FENCE**) | §15.3 — the consumer-manifest mechanism is **deleted**; check 2 returns to the single type graph |
| **Q-03** — who the principal is | **DR-070** (the requesting user/person; `user_dev_token` adopted; provisional) | §3, §3.1, §4.3, §17 |
| **Q-04** — the undercut's arithmetic | **DR-071** (transmission-reduction; `OD-06` 2 → 3) | §8.11, §10 |
| **Q-10** — the composition-bundle budget | **DR-078** (independent register row; **asker-selected `low`/`medium`/`high` tier**) | §5.1, §10, §13.4 |
| **Q-11** — per-segment conformance sampling | **DR-079** (the non-node senses project from the node definition) | §6.6 |
| **Q-12** — the abstention price cell's key | **DR-080** (three separate vocabularies + two register-row mapping tables) | §8.7 row 1, §10 |
| **Q-13** — projection depth | **DR-081** (layer 1 default; layer 2 behind a register row V flips) | §8 |
| **Q-14** — the band rule and the ceiling label | **DR-082** (a second independent gate) + **DR-086** (**it caps the band, never blocks**) | §8.9, §9.5 |
| **Q-16** — the eight citation-route members | **DR-084** (architecture proposes the closed enum, V ratifies) | §10 |
| **Q-25** — the risk tier's authority | **DR-094** (**the asker declares; policy may RAISE, never lower**) | §5.1, §10 |
| **Q-26 / Q-27** — kept components, verdict-first flag | **DR-095** (kept surface, rebuilt insides) + **DR-096** (**no such flag ships**) | §8 (rendering only) |
| **Q-28** — unfilled register keys as orphans | **DR-097** (**outside** charter clause 4's reach; an **advisory** stale-key audit instead) | §15.3 |

### 0.2 Explicitly out of scope

- **Presentation cells (DR-064).** The UI's 30 delegated decisions — the 29
  `DRAFT—V RULES` cells across `ui §4`'s nine flex rows plus register row D-1 —
  are ruled against actual mockups in the UI build phase. *"Architecture consumes
  their consequences, not their shapes"* (DR-064). This document therefore carries
  **every fact** the cells might present and **no layout and no copy**: no field
  here says where a badge sits, whether edges are drawn or listed, what a sentence
  reads, or whether a meter is live.
- **Storage shapes.** Table shapes, keys, constraints and DDL are
  `02-data-model.md`'s. This document cites §4's storage decisions where a wire
  rule depends on one (notably §4.4's version selection) and restates none of them.
- **Module internals.** Package boundaries, the provider gateway and the graph
  write API are `03-module-design.md`'s. Write-time invariant failures that never
  cross the wire are named in §13.5 as *not* API errors, and go no further here.
- **Test code.** Fixtures this contract owes are listed by obligation in §16 and
  specified in `06-test-strategy.md`.

---

## 1. Encoding and front door — SEAT-PROPOSAL

**Resource-shaped JSON over HTTP, one versioned namespace (`/v1`), served by
`apps/api` as the single front door** (Plan.md §5.1; AC-60).

| # | Rule | Status | Citation |
|---|---|---|---|
| 1.1 | `apps/api` is the **only** implementation of the contract. There is no second address and no proxy path. | RULED (encoding SEAT-PROPOSAL) | AC-60 (`ui §1.4` L5, DR-048) |
| 1.2 | SSR and the browser use the **same generated client and the same addresses**; the asker's session scope is forwarded on the SSR path and **SSR is never a privileged caller**. The same address never returns different content for the same principal. | RULED | AC-57, AC-60; Plan.md §5.1, §6.6 UI-5 |
| 1.3 | The wire contract is **declared once**, as schemas in `packages/contract`, and published as OpenAPI. The same declarations generate the client types, the runtime validators, the OpenAPI document **and the field inventory the AC-61 audit walks** (§15). | SEAT-PROPOSAL | Plan.md §2.3; AC-59, AC-61 |
| 1.4 | `packages/contract` is the **only** package the interface may import wire types from. No second declaration of a wire shape exists anywhere — that is what AC-59's "no adapter" means: **one contract declaration, not one checkout**. | RULED (mechanism SEAT-PROPOSAL) | AC-59; Plan.md §2.6 structural rule 2 |
| 1.5 | Encoding is JSON. Numbers on the wire are never bare scalars (§9.1). | SEAT-PROPOSAL | Plan.md §5.4; AC-63 |

**Alternatives rejected, with the constraint that rejected them** (Plan.md §2.3,
recorded here so this document is restatable on its own):

- **GraphQL** — per-field selection would make "no served field without a
  consumer" nearly free, but the disclosure boundary is the harder constraint:
  AC-56 splits the payload into default projections and an authorized bundle, and
  a resolver graph turns one authorization gate into a per-field decision over an
  unbounded query space. AC-54 additionally requires honesty fields to be
  machine-injected and non-droppable, which is structurally at odds with a query
  language whose premise is that the client chooses its fields.
- **tRPC / RPC-only** — end-to-end types with no declared contract artifact; the
  pack requires a nameable, freezable resource vocabulary (`ui §5` W1) and an
  auditable field inventory (AC-61), neither of which a procedure surface yields.
- **NestJS** — decorator/DI indirection works against charter A3.6's maintenance
  test ("name the single place where a behaviour is decided").

---

## 2. The three payload classes, and the boundary between them

This is the load-bearing section of the contract. Everything addressable in §5
and §6 is one of these three tiers, and the tier is a property of the **field**,
not of the endpoint.

### 2.1 The tiers (Plan.md §5.2, reproduced with its citations)

| Class | Contents | Who may read | Constraint |
|---|---|---|---|
| **Tier 1 — default projections** | all nine honesty surfaces as typed fields, composed text or the components-only rendering, serve state + conformance outcome, every served number with origin label and provenance reference carrying a replay handle, the node set and the **edge set** | anyone authorized to read the answer | AC-56, AC-58, AC-63 |
| **Tier 2 — authorized record** | the complete fact bundle; **the conformance judge's "full record" — meaning the structured `conformance_record`**: outcome, which R9 pass failed, the per-segment `JUDGED / SAMPLED_PASSED / NOT_SAMPLED` states and the judge's structured findings; and the recomputation trail for any served number — **the trail being the frozen typed inputs, the input/contract/content hashes, the reducer / contract / engine versions, the recorded arrow order, the cluster-collapse records and the arithmetic: sufficient to recompute, containing no raw model text** | the asker, in their own session's scope, for their own answer | AC-56, AC-57, AC-06; DR-066(1) |
| **Tier 3 — operator-only** | internal prompt material; **the `raw_artifact.raw_text`, provider metadata and request metadata of EVERY model call — per-node judges, the composition model, and the conformance judge alike**; plus the internal debug facet | operator scope | AC-56, AC-57, **AC-44** (*"raw tapes internal"*, *"raw judge text never reaches a served item"*), **AC-87** (`manifest §9.2b` *"strip raw judge output"*), `manifest §5.3`, `§9.3` |

### 2.2 Why the conformance judge is named twice

The conformance judge is a model call, so Seam C and AC-13 give it a
`raw_artifact` row like any other model call. Left implicit, that row is tier 3
by the raw-tapes rule (AC-44) and tier 2 by DR-066(1)'s *"the asker may replay
their own answer's full record"* — and **both readings break something**: route it
to tier 3 and the asker loses part of a ruled entitlement; route it to tier 2 and
raw tapes reach a served surface through the one endpoint the asker is guaranteed.

`02-data-model.md`'s `conformance_record` (Plan.md §4.4) is a distinct
**structured** table, so the line is drawn there:

> **The asker gets the structured record; the raw text of every model call,
> conformance judge included, is operator-only.**

This is the tier boundary in one sentence, and it is the sentence §15's audit
enforces mechanically (check 6).

### 2.3 One handle, two tiers

"Show me why" is a property of the contract, not a per-screen feature (`ui §4`
row 2). **Every number's provenance carries the same handle shape** (§9.1), and
authorization is **evaluated once per request** — against (session → asker →
answer ownership) for tier 2, and against operator scope for tier 3 (Plan.md
§5.2; AC-57).

### 2.4 The tier boundary is machine-checked, not observed

Because every field in the inventory carries its tier (§15.1), the following are
decidable by the audit rather than by review:

- **No tier-2 or tier-3 field may appear in a tier-1 payload**, and no tier-3
  field in a tier-2 payload (AC-56, AC-87).
- `GET /v1/answers/{id}/inspection` **owes a fixture asserting that no `raw_text`
  appears anywhere in the tier-2 payload** (Plan.md §5.2; AC-44, AC-87). This is
  the single most load-bearing fixture in this document.

---

## 3. Authorization tiers

**RULED: authorization is asker-scoped** — the asker may replay their own
answer's full record on demand; authorization is **their session's scope**;
internal prompt material stays operator-only (DR-066(1); AC-57). This closes
`spec` OQ-G5 and `ui` C14 (Plan.md §6.1 OQ-G5, §6.6 UI-1).

| # | Rule | Status | Citation |
|---|---|---|---|
| 3.1 | The principal is resolved **session → asker → answer ownership**. `GET /v1/session` is the identity/session surface this is evaluated against, and it is **separate** from the deployment register read. **DR-070 rules the asker is the requesting user/person**, so at this stage the chain collapses to *the requesting user owns their answers* and **V2's `user_dev_token` vertical slice is adopted as the mechanism**. | **RULED** (the identity) — **DR-070**; the resolution chain is retained as the shape a later principal model plugs into | **DR-070**; DR-066(1); AC-57; Plan.md §5.3 |
| 3.2 | **Tier 1** requires only that the principal is authorized to read the answer. | RULED | AC-56 |
| 3.3 | **Tier 2** requires that the principal's session resolves to the **asker who owns that answer**. Tier 2 is not a role: it is an ownership relation evaluated per request. | RULED (the entitlement); **the resolution mechanism is 3.1's SEAT-PROPOSAL** | DR-066(1); AC-57 |
| 3.4 | **Tier 3** requires **operator scope**. No asker-scoped principal reaches tier 3 by any path, including export (§2, §3) and including SSR. | RULED | AC-56 S-24, AC-44 |
| 3.5 | **SSR is a caller, never a privileged one.** There is no service-identity read path for asker-scoped material, and operator-scoped material is not reachable from SSR at all. | RULED | AC-57; Plan.md §6.6 UI-5 |
| 3.6 | Authentication failure and authorization-scope failure are **distinct typed errors** and are never distinguished by string matching (§13). | RULED | Plan.md §5.6; `ui §5` W4; AC-63 |

**RULED — DR-070.** *What an "asker" is* is settled: **the requesting
user/person**. There is **no separate authenticated-principal or session-scope
model for now** — **authorization and user credentials are explicitly OUT OF
SCOPE for this stage**, and **V2's existing `user_dev_token` vertical slice is
adopted as sufficient**. Three consequences this contract carries:

1. **`GET /v1/session` resolves against `user_dev_token`**, and §13.2's
   `UNAUTHENTICATED` / `SCOPE_FORBIDDEN` split stays typed and distinct (row 3.6)
   — DR-070 defers *credentialing*, not *typing*.
2. **`asker_id`, `session_id` and `caller_scope` stay three distinct fields.**
   One identity populates the resolution today; collapsing the fields would make
   the revisit below a change to every stored answer rather than a change to one
   resolution rule.
3. **The simplification is provisional and DR-070 says so**: authorization is
   *"deferred, not designed away"*, it *"may need real principal/session
   separation before a multi-tenant or credentialed launch"*, and
   **charter-A5.2-style revisit language is owed when it is built**. The
   confidentiality stake is unchanged and is why the fields stay separate: if
   caller scope and asker identity are conflated, a question-level memory pull
   can cross an asker boundary (AC-71).

---

## 4. Resource surface — reads

All reads are **side-effect-free** (AC-62). SEAT-PROPOSAL, per Plan.md §5.3.

| Method + path | Tier | Returns | Declared consumer | Citation |
|---|---|---|---|---|
| `GET /v1/answers` | 1 | the answer index: question line, verdict state, staleness state, abstention kind + cell name, serve state, builds-on-previous flag | `ui §2` surface 1 (list/cards); `ui §5` W3 | AC-62; `ui §2` surface 1 |
| `GET /v1/answers/{id}` | 1 | Answer + node set + **edge set** + honesty projections + serve record, in **one coherent read** | `ui §2` surface 2; W3, W8, W10, W20 | AC-56; `ui §2` surface 2 |
| `GET /v1/answers/{id}/nodes/{nodeId}` | 1 | node envelope: claim, way of knowing, base score and final strength each with a provenance reference, defeater state, exploration state, node-scoped marks, `stranger_restatement` with `check_status` | `ui §5` W8 (node envelope); `ui §1.2` Node | `ui §1.2` Node; AC-67 |
| `GET /v1/answers/{id}/export` | 1 (tiering per §2/§3) | composed text or components-only rendering + serve state + honesty projections + execution-ledger digest | `ui §2` surface 5; `ui §5` W18 | `ui §2` surface 5; AC-44 |
| `GET /v1/answers/{id}/ledger-digest` | 1 | the user-visible execution digest | `ui §5` W18; §7.4's suppression consumer | AC-44 |
| `GET /v1/answers/{id}/inspection` | **2** | complete fact bundle + conformance record | `ui §5` W8's authorization gate ("show me why"); the asker | AC-56, AC-57 |
| `GET /v1/numbers/{provenanceRef}/replay` | **2** | the frozen typed inputs, hashes, versions, recorded arrow order, cluster records and the recomputation — **no raw judge text** (that is tier 3), **no model in the path** | `ui §5` W8; `ui §1.2` Replay trail | AC-06, AC-44, AC-87 |
| `GET /v1/answers/{id}/inspection/debug` | **3** | the internal debug facet — graph fingerprint, per-node strengths, the full tau-source map **as the per-node provenance record, not a flat float map**, the operator identifier actually used, deduplicated attack/support arrow lists over the **identical node set** as the scored graph | operator | `manifest §9.3` (DR-062 `OD-18`); AC-34, AC-56, AC-77 |
| `GET /v1/answers/{id}/inspection/prompts` | **3** | internal prompt material and raw judge artifacts | operator | AC-56 S-24, AC-44 |
| `GET /v1/nodes/{nodeId}/executions` | 1 | execution-ledger read scoped to the node, **keyset-paginated** (§7.5); **an empty list means "nothing happened", never "the read failed"**. Fixture **`FX-WIRE-02`** (§16 row 8; **S1 + S14**) | `ui §2` surface 11 | `ui §2` surface 11; AC-44, AC-62; **A-11** |
| `GET /v1/register` | 1 | deployment register read | `ui §2` surface 12; `ui §5` W17 | AC-74; `ui §2` surface 12 |
| `GET /v1/scorecards` | 1 | scorecard + model-ledger read | `ui §2` surface 14; W17 | AC-41, AC-42 |
| `GET /v1/fleet` | 1 | fleet status | `ui §2` surface 14; W17 | `ui §2` surface 14 |
| `GET /v1/session` | 1 | identity/session surface — **separate** from the register read; resolves the requesting user through the adopted `user_dev_token` slice (DR-070). Fixture **`FX-WIRE-03`** (§16 row 9; **S0 + S13**) | `ui §2` surface 12; §3.1's principal resolution | **DR-070**; DR-066(1); AC-71; `ui §2` surface 12 |
| `GET /v1/runs/{id}/events` | 1 | the SSE event stream (§12) | `ui §2` surface 4; `ui §5` W6 | AC-60; `ui §1.3` |

### 4.1 The debug facet has an address on purpose

`GET /v1/answers/{id}/inspection/debug` is **attached only on the successful
path, absent when not requested, explicitly not part of the stable wire
contract** (§14.4), and reached through the authorized handle. **Giving it an
address is what stops it being a shipped unit with no entry point** — a charter G1
orphan on the BLOCKING never-called list the day S5 lands (Plan.md §5.3; AC-77,
`manifest §9.3`).

### 4.2 Reads carry no write side effects — and the one place that bites

AC-62 is absolute on the read path, and `manifest §9.2d` (AC-89) requires stale
active jobs to transition to failed **on every read**. Plan.md §6.6 **UI-13**
disposes the contradiction and this contract implements the disposition:

- the **state transition** is performed by a **scheduled reaper**, never by a read;
- the **read derives** the failed status from the job's deadline **without
  writing**.

That satisfies `manifest §9.2c`'s *"status is derived, never asserted"* (AC-88)
and AC-62 simultaneously, and it preserves §9.2d's actual guarantee — a stuck job
can never masquerade as work-in-progress on any read — because the derivation is
evaluated on every read **even when the reaper has not yet run** (Plan.md §6.6
UI-13; AC-89). The same rule retires the fleet surface's stale-worker reaping side
effect (`ui §2` surface 14; Plan.md §5.3): the reaper is **`apps/scheduler`'s
`job:reaper`**, the **expiry writer** over work-claim rows that **`battery`
owns** and `apps/runner` executes against (`03` §4.4, §9.2; §4.3 below).

**Polling.** Where a client polls rather than subscribes, the poll is
**event-driven or a declared poll with a stated interval** (AC-62, `ui §2`
surface 14). The interval is a **register row** — key, type, scope and consumer in
`05-register-skeleton.md` **§5.4 as amended round 3** (§0's control table) — and
**this document states no value** (AC-74, AC-76).

### 4.3 What each endpoint requires — the declared dependency side of the surface

**Why this table exists.** `apps/api` is the only implementation of the contract
(§1.1), so **every endpoint declared in §4 and §5 is a claim on `apps/api`'s
dependency edge list**, which is `03-module-design.md`'s to fix (Plan.md §2.6:
the authoritative list lives there). Declaring the surface without declaring what
it needs is how an endpoint reaches CI with no legal implementation path.
**This table is the endpoint side of that contract; the edge-list side is lane
4's** (H-O-2).

**Owner** = the context that owns the invariant behind the read (Plan.md §3.1).
**Needs** = the package(s) whose state the endpoint reads or writes.

| Endpoint | Owning context (Plan.md §3.1) | Needs | Status |
|---|---|---|---|
| `/v1/answers*`, `/v1/answers/{id}/nodes/{nodeId}`, `/export`, `/inspection*` | 7 Serving (`serve`) | `serve`, `graph`, `ledger`, `contract` | reachable on the current edge list |
| `/v1/answers/{id}/ledger-digest`, `/v1/nodes/{nodeId}/executions` | 15 `ledger` (shared kernel; **SERVE reads**, AC-17) | `ledger` | reachable |
| `/v1/numbers/{provenanceRef}/replay` | 7 Serving (`serve`) over frozen `ledger` rows | `serve`, `ledger` | reachable |
| `/v1/register`, `PUT /v1/register/{key}` | 12 Register (`register`) | `register` | reachable |
| `/v1/session` | **`apps/api`** — the principal the front door itself authenticates and scopes, *"what DR-066's 'their session's scope' is evaluated against"* (Plan.md §5.3); it owns no domain invariant and is **separate from the register read**. **DR-070 rules the identity: the requesting user/person, resolved through the adopted `user_dev_token` slice** | *(none — front-door state)* | **owner assigned** (`03` §4.4); **identity ruled (DR-070)**; fixture **`FX-WIRE-03`** at **S0** |
| `/v1/scorecards`, `POST /v1/nodes/{id}/feedback` | 8 Settlement (`settlement`) | `settlement` | **reachable** — `03` §3.1 **row 21** carries `apps/api → settlement` (added at C4 rework round 1 under H-O-2, with the acyclicity argument supplied) |
| `POST /v1/investigations/{id}/executions` | 5 Adjudication (`critique`) — DR-045's flow | `critique` | **reachable** — `03` §3.1 **row 21** carries `apps/api → critique` (same repair) |
| `POST /v1/asks`, `POST /v1/answers/{id}/steering` | 1 Framing (`battery` + the run's framing state, Plan.md §4.1a) | `battery`, `db` | reachable |
| `POST /v1/answers/{id}/memory-link/unlink` | 9 Memory (`memory`) | `memory` via `serve` (row 20 carries `memory`) | reachable |
| `/v1/runs/{id}/events` | 7 Serving (`serve`) + 15 `ledger` | `serve`, `ledger` | reachable |
| **`GET /v1/fleet`** | **`battery`** — run-execution **sequencing and work-claim state** (`03` §4.4, under Plan.md §2.6, §3.1 context 1, §4.2's layering rule). **SEAT-PROPOSAL: the fleet read is a read-time projection over the work-claim rows `battery`'s stage sequencing already owns**; `apps/runner` **executes** against those rows and the **scheduler's reaper is the expiry writer** (§4.2, AC-89) — neither owns the state | `battery` — **reached through `apps/api`'s existing `battery` edge; no new edge** | **reachable**; the queue's **carrier is `core.work_item`** (`02` §3.8), **accepted at DR-099 (A-05)** — gap **MOD-4** closed |

**Every endpoint in §4 and §5 now has a legal implementation path.** `03` §3.1
**row 21** carries `apps/api → contract, kernel, db, register, serve, battery,
ledger, settlement, critique` — the last two added at C4 rework round 1 under
H-O-2, with the acyclicity argument supplied (`apps/*` are sinks). The three rows
that read *"not reachable"* in this document's first round are **reachable as of
that repair**, and the Status cells above say so rather than sending a builder to
file a blocker against a repair that already landed (H-O-20).

**API-4 — fully closed.** Naming the *context* was `03-module-design.md` §4.4's,
and it has: the fleet's state is **`battery`-owned** and `/v1/session` is
**`apps/api`'s**. This document's rows are **aligned to** that assignment rather
than restating it — **one owner, one place** (AC-85). The carrier
`core.work_item` — the one mutable operational table, with the ledger as its
record — is **accepted at DR-099 (A-05)**, closing gap **MOD-4**; the audit's
check 9 (§15.2) has a producing unit to look for and `FX-SRV-10`'s write half has
an addressable target. **The last residue — `/v1/session` carried no fixture and
no slice — is closed at §16 row 9 (`FX-WIRE-03`, S0).**

**Three units touch the work-claim rows, and only one owns them** (`03` §4.4,
§9.2): `battery` **owns** the state; `apps/runner` **executes** against it;
`apps/scheduler`'s reaper is the **expiry writer** (AC-89, §4.2). The fleet read
writes nothing (AC-62). **`apps/scheduler` now runs three jobs** — the reaper, the
replay self-test and **DR-089's settlement watch** — and **none of them is
reachable from this contract**: they are time-triggered, not front-door, and the
surface here reads their effects only (`03` §1.2, §5.5.0).

---

## 5. Resource surface — writes

SEAT-PROPOSAL, per Plan.md §5.3.

| Method + path | Effect | Citation |
|---|---|---|
| `POST /v1/asks` | starts a run; writes `run` and `run_row_activation` **before the first stage executes** (Plan.md §4.1a) | AC-45; Plan.md §4.1a |
| `POST /v1/nodes/{id}/regenerations` | bounded by **2 regeneration rounds / 3 attempts** (DR-020 knob 5) with model rotation (DR-041); returns a typed job + replay handle; **at cap exhaustion a typed "not runnable" abstention carrying the rejection evidence** | DR-020 knob 5, DR-041; `ui §2` surface 10 |
| `POST /v1/investigations/{id}/executions` | DR-045's flow; returns a typed job + replay handle | DR-045; `ui §2` surface 8 |
| `POST /v1/answers/{id}/steering` | menu selections + **verbatim** free-text annotations, typed as human-steer input and **disclosed in the served trail** | DR-019 knob 4; `ui §1.2` Steering record |
| `POST /v1/answers/{id}/memory-link/unlink` | the unlink control; **the endpoint exists, the effect is register/mockup-governed** (delegated cell `ui` 9(b), DR-064) | `spec §17.6` M-22; DR-064 |
| `POST /v1/nodes/{id}/feedback` | node-scoped outcome signal into the model ledger | `ui §2` surface 9; DR-046 |
| `PUT /v1/register/{key}` | deployment register write, **keys V-ratified** | AC-74; `ui §2` surface 13 |

### 5.1 `POST /v1/asks` — the required inputs

Required: **question**; **risk tier** ∈ casual / standard / high-stakes carried
**with its supplier**; **composition-budget tier** ∈ `low` / `medium` / `high`;
depth / agent-count parameters; decision/action owner; caller scope; `as_of`
(defaulting to now); steering pre-sets (Plan.md §5.3; DR-011, DR-019, DR-021
knob 11; **DR-078**; `ui §1.2` Ask).

**The risk tier's authority is RULED — DR-094.** **The asker declares; deployment
policy may RAISE but never lower.** `tier_source ∈ {ASKER, DEPLOYMENT_POLICY,
DERIVED}` with `tier_provenance_ref` records **who set it**, and the tier is
non-nullable. Three wire consequences:

- **The request carries the asker's declaration**, always. A request without one
  is `MALFORMED_REQUEST` (§13.2) — there is no policy default filling in for a
  missing declaration, because that is the silent-assumption shape the pack
  forbids (AC-76).
- **A policy raise is recorded, not substituted.** Where policy raises, the run
  carries `tier_source = DEPLOYMENT_POLICY` **and** `tier_provenance_ref`
  pointing at the asker's superseded declaration, so **both** are printed
  (AC-75). A **lowering** raise is refused at write (`02-data-model.md` §12
  row 26); it is a server-side invariant, not a client-visible negotiation.
- **The supplier is printed wherever the tier is** — the tier moves the cost
  envelope, the abstention price cell and CROSS coverage, and a moved number
  whose supplier is unprintable is the D4 shape (AC-34, AC-75).

**Routed, not resolved: `DERIVED` has no producer under DR-094.** The ruling
names two suppliers and no producer for the third, so **a member with no producer
is an AC-77 orphan** (charter VR-4). It is **not removed by this fold-in**,
because reachability is decided against a **built** path: the **S09 ticket body
(`t_c5e8ec5a`)** carries the audit as an entry obligation — *"if no production
path produces it, remove the member or it is an `FX-ORPH-02` BLOCKING orphan, and
rescope `FX-DB-07` from 'all three suppliers' to the reachable set"*. The residue
therefore has an **owner, a blocking gate and a fixture consequence**, and cannot
survive silently. **The fixture half is already applied**: §16 row 2 asserts the
round-trip over the **reachable** suppliers, not all three
(`02-data-model.md` §13's note, §3.7).

### 5.1a The composition-budget tier — RULED (DR-078)

**DR-078 rules the hard composition-bundle budget an independent register row**,
distinct from DR-052's cost envelope — *so `DEFECT` and `ENVELOPE_EXHAUSTED` stay
distinguishable* — **with V's amendment that the cap is user-facing as a tier
list the asker selects per run: `low` / `medium` / `high`.**

| Element | On the wire | Constraint |
|---|---|---|
| the asker's **choice** | a required `POST /v1/asks` input over the closed three-member tier vocabulary (§10) | **DR-078**; AC-35 |
| the per-tier **values** | **nowhere on the wire** — register rows whose values are V's at DR-023; `05-register-skeleton.md` owns the keys | AC-74, AC-76, DR-039 |
| the tier **in force** on a served answer | the run projection beside `cost_envelope`, so the reader can see which cap applied | AC-75 |

**Two gates, two marks, and this endpoint must not merge them.** The composition
budget's terminal and the envelope's exhaustion are **independent**: the first
reaches **components-only + `DEFECT`** (§13.4), the second the
**`ENVELOPE_EXHAUSTED` condition mark**. Neither reads the other's state, and a
single "budget" field on the Ask covering both would make the two
indistinguishable at exactly the point DR-078 separated them.

**It mirrors the asker-depth dial** (DR-021 knob 11), which is why a tier list
and not a number: the asker chooses a **named** cap, the deployment ratifies what
each name costs, and **no builder writes a number into this contract**.

### 5.2 `POST /v1/asks` refuses on a deployment that cannot execute multi-maker

**RULED.** A **standard-or-above** ask is **refused with a typed error** on a
deployment failing the maker-inventory assertion (AC-38; DR-055; Plan.md §3.2
Seam C, §5.3). DR-055's launch gate *"a deployment that cannot execute
multi-maker at standard+ does not pass launch"* has to be able to say no
somewhere, **and this endpoint is where**.

The refusal reads the **`deployment_maker_capability`** predicate — the
deployment's *configuration*, evaluated at startup and on every register change,
**not a liveness probe**. The second predicate, `run_maker_reachability`, is
per-run and **never refuses an ask**: it invokes DR-014's transient
cap-and-label path (`SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE`, confidence-band
cap, recorded lift condition), which is served, not refused (Plan.md §3.2 Seam C;
§6.6 UI-12). **Two different objects, two different verdicts** — a run is
servable wearing the marks; a deployment is not launchable.

### 5.3 What a write never returns

- **Cap exhaustion is not an error.** `POST /v1/nodes/{id}/regenerations` at cap
  returns a **typed "not runnable" abstention with its rejection evidence** —
  abstention kind 4 of `spec §12.3` Home 1 — not a transport failure (DR-020;
  `ui §2` surface 10, flex row 1).
- **Envelope exhaustion is not an error.** `ENVELOPE_EXHAUSTED` is a **condition
  mark** (`spec §12.3` Home 2 #4) served with the answer; *"never a silent
  timeout"* (DR-052, AC-49).
- **No write returns raw model text at any tier below 3** (AC-44, §2.1).

---

## 6. Version selection on reads

**RULED by Plan.md §4.4 clause 2a**, which is the carrier for both state changes
replay eviction causes. This is a read-contract rule and belongs in the frozen
vocabulary.

| # | Rule | Citation |
|---|---|---|
| 6.1 | With **no `version` parameter**, `GET /v1/answers/{id}` returns the **latest `answer_version` with its current derived projection**. A post-serve eviction therefore shows as **components-only + `DEFECT`**. | Plan.md §4.4 clause 2a, §5.3; AC-12, AC-63 |
| 6.2 | With **`?version=`**, the read returns that version's artifacts **as sealed**. | Plan.md §4.4 clause 2a |
| 6.3 | **The replay ceremony always reads the sealed form** — it reads the conformance record **without** the suppression overlay, because the overlay post-dates the serve decision being replayed. | Plan.md §4.4 clauses 2, 2a; AC-07, DR-060(b) |
| 6.4 | **Nothing is overwritten.** The original `served_number` rows, the composed text, the fact bundle and the conformance record all stay exactly as sealed; the number's current status is derived from its latest `served_number_event`, and the answer's current serve state is derived too. | Plan.md §4.4 clauses 1, 2a; AC-07, AC-88 |
| 6.5 | An answer version with **≥1 `EVICTED` event** projects as **components-only + `DEFECT`** — the whole answer, not a hybrid. `ui §4.0` admits exactly **two** answer-surface states, and a part-composed / part-components answer would be a third with no ruled rendering. | Plan.md §4.4 clause 3; DR-049, DR-057, DR-059 |
| 6.6 | The per-segment conformance vocabulary stays the ruled three — `JUDGED / SAMPLED_PASSED / NOT_SAMPLED` — with **no fourth member minted**. The **served** per-segment state is the **derived join** of the frozen conformance record and the suppression rows. **Which segments are load-bearing, and so which the sampling rule prioritises, is RULED at DR-079**: the non-node senses **project from the charter's node definition** — *a sentence is load-bearing iff it asserts a fact drawn from a load-bearing node or states a served number*. The `segment → served_number` reference set (§8.9) supplies the second limb directly, so **the flag is computable from fields this contract already carries** and no new field is owed. S0 still runs conformance **exhaustively**, which is always legal (charter A2.5 forbids skipping the conformance **role**, never mandating exhaustive sampling). | Plan.md §4.4 clauses 1, 2; **DR-079**; DR-060(a), AC-65, AC-88 |

**So the historical answer replays byte-identically while the live read shows the
degradation** — the two questions eviction raises, answered by one carrier
(Plan.md §4.4 clause 2a).

**Priced explicitly for V, because the pack never ruled it** (Plan.md §8 rule
(iii)): evicting a single component number **withdraws the whole composed text**.
DR-059's *"one number is lost, never the answer"* is satisfied and this is the
only reading consistent with `ui §4.0`'s two states, but the reading-experience
cost is a consequence V may want to see.

**Consumers of the suppression rows, so they are not orphans** (AC-77): the
**tier-2 authorized record** (`/inspection` — which segments the eviction withdrew
and why) and the **execution-ledger digest** (`/ledger-digest` — the degradation
is a thing that happened, and the digest is where the reader learns it happened)
(Plan.md §4.4 clause 2; AC-44).

---

## 7. Pagination

| # | Rule | Citation |
|---|---|---|
| 7.1 | **Real pagination**: the answer index is **keyset-paginated** — `limit` + an **opaque `cursor`** — and both are **sent and honoured**. V2 sent neither `limit` nor `offset` and read neither, so a library past its first page was silently truncated; that failure does not carry. | AC-62; `ui §2` surface 1; Plan.md §5.3 |
| 7.2 | The page envelope is declared once in `packages/contract` and carries `items` plus an opaque `next_cursor`. The cursor is opaque by construction: a client may not decode it, and nothing in the contract promises it is an offset. | SEAT-PROPOSAL (encoding); AC-62 |
| 7.3 | The maximum and default `limit` are **register rows**, inventoried in `05-register-skeleton.md` **§5.4 as amended round 3** (§0's control table names both, with `apps/api` as consumer). **This document states no value** (AC-76). | AC-74, AC-76 |
| 7.4 | `GET /v1/answers/{id}` is bounded **by construction, not by paging**: **projections cross the wire, not the bundle**. | AC-56; Plan.md §5.3 |
| 7.5 | **`GET /v1/nodes/{nodeId}/executions` is keyset-paginated**, on §7.2's envelope: `limit` + opaque `cursor`, both sent and honoured, ordered by the ledger's own `sequence` — **the total order is the sequence, never a timestamp and never a random tiebreak**, so the cursor is stable and a page boundary cannot reorder or drop a row. | AC-62 (*"real pagination"*); AC-45, AC-08; Plan.md §4.3 |
| 7.6 | **Every collection-returning read declares a bound.** A collection whose length grows with recorded execution is unbounded by construction, and AC-44 records *"attempts, retries, failures, could-not-dos, abstentions, condition marks, typed skips"* per node — so an unpaginated execution read is the same silent-truncation defect AC-62 exists to kill, arriving from the server side instead of the client's. | AC-62, AC-44 |

**API-1 (REAL, merged) — repaired here, and now fixtured.** The round-1 review
recorded that this document declared pagination for the answer index only while
`GET /v1/nodes/{nodeId}/executions` is unbounded under AC-44
(`merge-verdict-c4.md` gap index, Codex API-1). Rows 7.5 and 7.6 close it on the
reusable envelope of §7.2, and §4's read table carries the same declaration. **No
number is stated** — the limit's maximum and default remain register rows (§7.3,
AC-74/AC-76). The Plan-side residue — Plan.md §5.3 itself declaring pagination for
one read only — was ratified as amendment **A-11** at **DR-099**, so the Plan-side
row is closed by the amendment rather than by this document.

**The fixture, assigned here (the last piece of A-11).** A-13's six minted
fixture ids do **not** include one for A-11, so this repair had a declared
surface and **no assertion anywhere** — the untested-claim shape charter clause 4
indicts, and the exact gap AC-79 exists to close. **Assigned: `FX-WIRE-02`**, on
the `FX-WIRE-*` family this contract's fixtures already use (§16 row 8). **It is
specified in `06-test-strategy.md`, which has landed the row** — that document
owns the specification, this one owns the obligation and the surface it asserts
against (AC-85). **It asserts no number**: keyset order over the ledger
`sequence`, the register default resolving an absent `limit`, an over-maximum
`limit` **refused rather than clamped**, and no write side effect on the read —
never what the page size is.

---

## 8. Projections — what they are and when they are computed

*(architecture term: **projection** — a value computed at read time from stored
typed fields, as distinct from a frozen artifact.)*

**Seam D — the projection boundary** (Plan.md §3.2; AC-56 × AC-64). `serve`
produces two distinguishable things:

| Kind | Members | Property |
|---|---|---|
| **Frozen artifacts** | the fact bundle, the conformance record, the served numbers and their provenance | persisted, hashed, **replay inputs** (AC-06) |
| **Projections** | badges, marks, provenance summaries, per-node restatements, staleness state, the derived serve state | **computed at read time from stored typed fields** (AC-64) |

Freezing the facts is what AC-06 requires; computing the projections at read time
is what AC-64 requires, **because a staleness state that changed after serving
must be visible on the next read**. This is the concrete answer to `ui` ambiguity
3 (Plan.md §6.6 UI-3).

| # | Rule | Citation |
|---|---|---|
| 8.1 | Projections are delivered **inline on the Answer / Node resources in one coherent read** — not as a separate fetch the client must remember to make. | Plan.md §6.6 UI-3; AC-56 |
| 8.2 | **Honesty projections are non-optional fields** on the Answer resource. DR-058 machine-injects them; making them optional would let a serializer do what the composition model is forbidden to do. Where a surface has nothing to report, the field carries its **typed empty**, never absence. | Plan.md §5.4; AC-54, AC-63 |
| 8.3 | **E4 freshness on every read**: every answer read attaches the answer's **current** staleness state, computed at read time. | AC-64; Plan.md §3.2 Seam D, §5.5 |
| 8.4 | **Two sentence-shaped surfaces get structured projection fields that render without composed prose** — the value **reversal point** and the **builds-on-previous disclosure** — so degraded mode serves them as data. | AC-55; DR-059; `ui §1.2` Honesty projections |
| 8.5 | The interface **never parses prose to learn a fact**; the composed text is display, never data. | AC-63; `ui §1.1` clauses 2 and 4 |
| 8.6 | A projection may never carry **bundle-grade** material. Payload class is a per-field property (§2.4). | AC-56 |

### 8.7 The nine honesty surfaces as typed fields

`spec §12.2`'s canonical list is nine (S-22, `RULED(DR-048)`), each with **exactly
one requirement, one UI row and one charter acceptance hook** (AC-58, S-25).
Tier 1, non-optional, on the Answer unless the row says otherwise. Field names are
SEAT-PROPOSAL; **what each must carry is RULED**.

| # | Honesty surface | Wire projection | Must carry | Declared consumer | Citation |
|---:|---|---|---|---|---|
| 1 | Typed abstention badges | `abstention` | which of the **five kinds**, the **price cell** (question class × risk tier, naming its register row), the unlock condition, the ledger-unknown ref. **DR-080: the question-class axis is its own vocabulary** — one of **three separate closed sets of six**, reached from a Q8 type through the register-row mapping table `Q8 type → abstention class`, **never the Q8 type itself** | `ui §5` W9 | `spec §12.3` Home 1; DR-011/DR-012; **DR-080**; AC-65 |
| 2 | Per-node provenance and ways of knowing | `nodes[].provenance`, `nodes[].way_of_knowing` | per number and per claim: who or what produced it, from which inputs, **with a locator**, the method, and a **replay handle**; `way_of_knowing ∈ LOOKED_UP \| RAN \| REASONING` | `ui §5` W8 | `ui §1.2` Node, Provenance record; AC-24, AC-34, AC-63 |
| 3 | Defeaters as visible first-class attacks | `edges[]`, `nodes[].defeater_state` | the **edge set** as first-class objects with polymorphic targets, not implied by nesting | `ui §5` W10 | AC-18, AC-19; `ui §1.2` Edge |
| 4 | STALE / UNDER-REVIEW badges | `staleness_state` (answer and node) | `FRESH \| UNDER_REVIEW \| STALE \| ARCHIVED_REVIVED`, current as of this read | `ui §5` W11 | AC-64, AC-72; DR-015, DR-016 |
| 5 | Value markers and reversal points | `value_hinges[]`, `reversal_point` | criteria and sources, option vectors, the Pareto set, `weight_source` union (§9.4), owner, the **reversal point** and the band on each side, **visibly-served rejected criteria** | `ui §5` W13 | DR-017, DR-043; AC-55 |
| 6 | Investigate-deeper | `investigations[]` | the gap; its typed verdict (including `UNINSTRUMENTED`, which **blocks the fairness claim**); the remediation layer — why the gap exists, the effort grade, the machine-constructed prompt — **openly marked model-authored and biased, never replacing the verdict**; whether user input is accepted | `ui §5` W14 | DR-045; `ui §1.2` Investigation |
| 7 | UNDER-EXPLORED | carried in `condition_marks[]` (mark 12) | the branch marker, **never a retirement cause** | `ui §5` W11 | `spec §12.3` Home 2 #12; DR-016 |
| 8 | SKIPPED-BY-BUDGET and fallback labels | `condition_marks[]` + `cost_envelope` | the uniform mark projection (§8.8) and the run's visible envelope and state | `ui §5` W12, W21 | DR-021 knobs 9–10; DR-052; AC-49 |
| 9 | Builds-on-previous disclosure | `memory_disclosure`, `builds_on_previous` | whether a prior run was matched, the tier and relation, the prior run's **own staleness state**, the agreed/disagreed fields, what payload was pulled, **candidates found but not linked**, and an unlink control | `ui §5` W15 | `spec §17.6`; AC-69, AC-70; DR-044 Q61 |

**The answer-surface frame both renderings must survive** (`ui §4.0`, not a tenth
surface): `serve_state` and the `DEFECT` mark travel as data on every answer, so
**a components-only answer never pretends to be a composed one** (`ui §1.4` L7;
AC-53).

### 8.8 Condition marks — one uniform projection, two appearances, one store

The wire carries **one uniform `condition_marks[]` projection** with
`{mark, scope ∈ {answer, node}, subject_ref, reason, lift_path?}` on **Answer and
Node** (Plan.md §6.2 AM-6; `ui §1.2` Condition marks; DR-014's lift path). Because
the projection is uniform, **every member of the closed enum has a rendering
regardless of which surface it visually lands on** — which is what makes the
mark→surface map a delegated presentation question (DR-064, cells 8(a)/8(c))
rather than an API dependency.

**The affected-node list is a read-time projection of a single store.** DR-021
knob 10 and `ui §4` row 8 require an answer-level mark to be *"echoed into **each
affected node's** provenance"*. `condition_mark_node` is the **single
authoritative store** of the affected set, populated at write time from the
ledger rows that caused the mark; there is **no `affected_node_ids` array on the
mark row**. **One authoritative store, two payload appearances, no drift**
(Plan.md §4.4, §6.6 UI-9; AC-85).

### 8.9 What the Answer resource carries (tier 1, non-optional)

Assembled from `ui §1.2` Answer, Plan.md §4.4 `answer` and Plan.md §5.4. Names
SEAT-PROPOSAL; contents RULED with the citations shown.

| Field | Carries | Citation |
|---|---|---|
| `question_line` | the question as asked | `ui §1.2` Answer |
| `verdict_state` | `SUPPORTED \| CONTESTED \| UNSUPPORTED` — **closed at three** | AC-66; DR-066(3); Plan.md §1.9 FLAG-2 |
| `confidence_band` | an **ordered label**; cut points come from the register (question class × risk tier); `UNINSTRUMENTED` and DR-014 cap **the band, never the verdict state** | AC-66, AC-74; DR-063 VR-2; `spec §12.8` S-27 |
| `band_ceiling` | `{label, basis}` — the way-of-knowing ceiling every band must name (§9.5). **DR-082/DR-086: a second independent gate that CAPS the band and wears its label — never a silent block.** Non-optional | AC-24; charter VR-2; **DR-082, DR-086** |
| `abstention` | surface 1, or the typed empty | AC-65; DR-012 |
| `condition_marks[]` | §8.8's uniform projection | AC-65; DR-051 |
| `staleness_state` | §8.7 row 4, computed at read time | AC-64 |
| `value_hinges[]`, `reversal_point` | surface 5 | DR-017; AC-55 |
| `memory_disclosure`, `builds_on_previous` | surface 9 | AC-69, AC-70; AC-55 |
| `investigations[]` | surface 6 | DR-045 |
| `cost_envelope` | `{basis, state ∈ WITHIN \| ENRICHMENT_SKIPPED \| EXHAUSTED}` and the **protected-core statement** | DR-052; AC-49 |
| `composition_budget_tier` | the tier the asker selected for this run (`low` / `medium` / `high`), so the reader sees **which cap applied**. **A separate axis from `cost_envelope`** — two gates, two marks, neither reading the other's state (§5.1a) | **DR-078**; AC-75 |
| `serve_state`, `conformance_outcome` | serve state, and the conformance **outcome** — *always on the answer*, including **which R9 pass failed when one did** | AC-53; DR-049, DR-054, DR-057; `ui §1.2` Serve record |
| `residual_objection` | Q53's residual objection **as a fact-bundle field**, so the strongest objection reaches the reader as data **even when the prose fails** | DR-049; `ui §1.1` clause 5; AC-52 |
| `sections[]` | for a mixed empirical-and-value question, **two labeled sections** — "what is true" / "what follows given your values"; the phase order is machine-enforced, so section order is not a presentation choice | DR-053; `ui §4.0` |
| `composed_text` | an **ordered list of typed segments with stable ids**, each carrying its **load-bearing flag** and its **`segment → served_number` reference set**; **display only** | Plan.md §4.4; AC-63; DR-060(a) |
| `nodes[]`, `edges[]` | the node set and the edge set (§8.10, §8.11) | AC-15, AC-18; Plan.md §5.2 |
| `ledger_digest_handle` | a handle to the run's execution-ledger digest | AC-44; DR-027 |
| `inspection_handle` | the tier-2 authorized inspection/replay handle | AC-56; DR-054, DR-034 |
| `root_node_ref`, `answer_version`, `as_of`, `run_ref` | identity and version selection (§6) | AC-73; Plan.md §4.4 |

**`phase`, `envelope_*`, `register_version` and `battery_version` live on `run`,
not on the answer**; the Answer carries only their **serve-time projection**,
because the envelope must be visible **before any answer exists** and the phase
gate is read **during** the run (Plan.md §4.4, §4.1a; `spec` N-9; DR-053 F-12).

### 8.10 What the Node resource carries (tier 1)

Claim text; `way_of_knowing`; **base score and final strength each as a labeled
number** with a provenance reference (§9.1); defeater state; exploration state;
node-scoped abstention and condition marks; `position_label`; the node-level
provenance projection **readable at the node, not a join away**; and the canonical
`stranger_restatement` payload with `check_status ∈ {PASS, FAIL, NOT_SAMPLED}`
(`ui §1.2` Node; AC-31, AC-34, AC-67; Plan.md §4.2, §5.3).

`stranger_restatement`'s **field list lives once in the requirements spec and is
cited, never restated** — `{subject_ref, claim, certainty, what_would_change_it,
action_consequence, generated_at, check_status}`, with `action_consequence`
**verdict-only** (nodes carry `NOT_APPLICABLE`) (AC-67; DR-061 `OD-S-06`;
`spec §12.7` S-26/S-26a). `NOT_SAMPLED` is **a fact about the run the interface
shows as such, never as a blank** (`ui §1.2` Node).

### 8.11 What the Edge resource carries (tier 1)

`{source_node_id, target_kind ∈ NODE|EDGE, target_node_id | target_edge_id,
polarity ∈ support|attack, kind ∈ rebutting|undercutting (attacks only, NULL on
support), strength as a labeled number or a typed unknown magnitude,
provenance_ref}` (Plan.md §4.2, §5.4; AC-18, AC-19, AC-28).

Two refinements of `ui §1.2`'s illustrative Edge shape, both required rather than
optional:

1. **The target is polymorphic** — DR-066(2) rules the undercut is *"a typed
   attack targeting the support EDGE, never the claim node"*, so a node-to-node
   shape cannot carry it (AC-19; Plan.md §6.6 UI-2).
2. **The `kind` vocabulary is closed at two members and types attacks only.**
   The pack declares no support-side member, and minting one would extend a
   ratified closed enum (DR-062 `OD-19`; Plan.md §4.2(1)). A support edge is fully
   typed by its polarity.

**Cycles cannot appear in a payload**: refused at construction, rejected at write,
typed error at compute — and *"circular dependency found"* is **served
information**, not a silent omission (AC-20; DR-042, DR-056(b)).

**RULED — DR-071.** An edge-targeting attack's shape is
**transmission-reduction**: it reduces the targeted support edge's transmitted
contribution, computed inside the pure core and **recorded per edge**, and DR-071
grants the `DR-062 OD-06` producer-set extension **two → three**. The wire shape
is unchanged and `UNDERCUT_TRANSMISSION` is now a **writable** value of
`strength.source`, carried like any other labeled number (§9.1).

**What the wire does NOT carry, and why that is deliberate.** The per-edge
**reduction applied to the target** is a frozen record on `propagation_run`
(`02-data-model.md` §6.4a), reachable at **tier 2** through
`GET /v1/numbers/{provenanceRef}/replay` as part of the recomputation trail —
**not** as a tier-1 field on the Edge. The undercut edge serves its own strength;
what that strength did to another edge is recomputation material, and putting it
on the tier-1 Edge would serve one edge's arithmetic effect on another as a bare
projection with no replay handle of its own (AC-63).

**Also RULED — DR-075:** a placeholder arrow is a **live, real endpoint** and
appears in `edges[]` like any other, so a client rendering the graph sees the
connection **from the moment the node spawns** — which is the structural half of
DR-076 (§12.3).

---

## 9. Typed shapes that make illegal states unrepresentable

Plan.md §5.4, in full. These are the contract's teeth: each one converts a rule
that could be broken at runtime into a shape that cannot be serialized.

### 9.1 The labeled number

**Every weight-bearing number on the wire is
`{ value, provenance_ref, replay_handle, kind, source, producer }` — never a bare
scalar.** `ui §1.4` L1 ("no unlabeled number") and L2 ("every number carries a
replay handle"), and the pack's P-D4, then hold **by type**: *a number without
provenance cannot be serialized* (AC-63, AC-34; DR-028, DR-034).

This is also what makes `ui` ambiguity 10 harmless: if a mockup later asks for a
number on an index card, it uses **the same labeled-number type**, so L1 and L2
hold by type rather than by policy (Plan.md §6.6 UI-10).

### 9.2 The number slot

`PRESENT | EVICTED | WITHHELD` as a **discriminated union** — distinct from
**absent**, which the schema does not admit (Plan.md §5.4; AC-12, AC-26
— **AC-22's limb deleted at DR-074, §9.2**;
AC-63).

| Member | Means | Citation |
|---|---|---|
| `PRESENT` | the number is served, labeled per §9.1 | AC-63 |
| `EVICTED(MISSING-NUMBER)` | a component number **failed replay** and was evicted; its place carries the typed missing-number mark and the rest of the answer serves | AC-12; DR-059; `spec §12.3` Home 2 #22 |
| `WITHHELD(reason)` | the parent number is withheld — an **unjudged or abstained conjunct under strict-and** (AC-26) — and **its components are served** | **AC-26**; DR-040 Q45, DR-062 `OD-05` |

**One `WITHHELD` reason is deleted, and the other survives — DR-074.** The member
count is unchanged at three; what changes is the reason vocabulary behind it.

- **Deleted: `WITHHELD(undeclared operator)` (AC-22's limb).** DR-074 makes the
  deployment-level scoring operator **mandatory, never blank**, so the resolution
  chain cannot terminate undeclared and **nothing can produce this reason**. A
  reason the server can never send is an **AC-77 orphan** on a closed wire
  vocabulary — worse than dead code, because a client would branch on it forever.
  The declare-once/withhold runtime machinery goes with it (DR-074: *"dropped
  from the design (nothing left to trigger it)"*).
- **Survives: `WITHHELD(strict-and conjunct unjudged or abstained)` (AC-26's
  limb).** Its trigger is a **conjunct, not a config**. Under strict-and a parent
  whose conjunct carries no judgement has no product to serve, and DR-074 says
  nothing about that. **AC-26 stands; the member stands; the fixture that fires
  it stands.**
- **The anti-defect property survives by a different mechanism**, so nothing is
  lost: the operator is *"a recorded config value, never a hardcoded literal"*
  because the register row is mandatory, and the **effective operator and the
  level that supplied it** are recorded on frozen rows and reachable through the
  tier-2 replay trail (§2.1).

### 9.3 Honesty projections are non-optional fields

Restated here because it is a *type* rule, not only a projection rule: DR-058
machine-injects them, and **making them optional would let a serializer do what
the composition model is forbidden to do** (Plan.md §5.4; AC-54).

### 9.4 The value hinge's weight is a union

`{source: owner_elicited | org_policy, owner, vector}` **or** `{source: none}`
**with no vector field at all** — so `weight_source` cannot acquire a `default`
member and *"owner_elicited with a null vector"* is unrepresentable (Plan.md §5.4,
§6.6 UI-8; DR-017; `ui` ambiguity 8).

### 9.5 Verdict fields are two independent axes

`verdict_state` and `confidence_band` are separate fields, **with an abstention
carried in its own field, never as a band and never as a mid-range number**
(AC-66; DR-066(3); `spec §12.3` S-14: *"An abstention rendered as a mid-range
number is a rule violation"*).

**The band names its way-of-knowing ceiling.** The Answer carries
`band_ceiling {label, basis}`, where `basis` is the `way_of_knowing` distribution
over the answer's **load-bearing nodes** — **that distribution alone**, per
**DR-082** (see below) (Plan.md §5.4; AC-24; charter VR-2). This is M4's
surviving carrier once DR-062 `OD-12`
removed the numeric τ ceiling: **without it, an answer whose load-bearing nodes
are all `REASONING` passes Q51's downgrade and can still read at the top band from
the register cut-points alone** — exactly the outcome `OD-12` removed the ceiling
*on the understanding that the band rule would carry*.

**RULED — DR-082 and DR-086, in two halves.**

**DR-082 (half i): the band rule is a SECOND, INDEPENDENT GATE** beside
DR-044(Q51)'s three blocking gates — **not a restatement of them**. So the serve
gate chain is the four machine-ordered gates **plus this cap**, and a client must
not infer the ceiling from the Q51 downgrade state or vice versa: they are two
obligations that can fire independently.

**`band_ceiling.basis` is the way-of-knowing distribution over the load-bearing
nodes, and nothing else.** DR-082's own words are that the ceiling is *"computed
from the load-bearing nodes' way-of-knowing distribution"*; it names no second
input. **Plan.md §6.10 AQ-1's recommendation proposed a wider basis** — *"the
load-bearing nodes' `way_of_knowing` distribution **and the Q51 downgrade
state**"* — but that was a SEAT-PROPOSAL written while half (i) was open, and
**the ruling narrows it**. Feeding Q51's state into this basis would make the two
gates share an input at exactly the point DR-082 declared them independent, and
an uncited extra input is a defect by this document's own law (§0).

**Q51's outcome records on its own existing carrier**, not inside the ceiling:
the reasoning-only downgrade surfaces through `condition_marks[]` (§8.8's uniform
projection) and the conformance outcome through `conformance_outcome` (§8.9) —
both already tier-1 and non-optional. **The reader still learns which gate did
what**; it reads two fields rather than one compound basis, which is what
independence looks like on the wire. `02-data-model.md` §7.6 carries the same
single-input reading.

**DR-086 (half ii): when it fires, it CAPS the confidence band.** The answer
**serves**; it **cannot reach the top band**; it **wears its ceiling label
visibly**. It **never silently blocks**, and it never blocks at all — mirroring
DR-014's cap + label + recorded lift-path pattern. Three wire consequences:

- **`band_ceiling` is non-optional on every Answer** (§8.9). An answer whose band
  names no ceiling is an answer that broke charter VR-2's *"every band names its
  ceiling"*, and optionality would let a serializer do the omitting.
- **A capped answer is an ordinary served answer** — no new `serve_state` member,
  no terminal route, no error. §13.4's "deliberately not an error" list holds.
- **The label vocabulary and the cut points remain register rows V ratifies at
  DR-023**, printed per AC-75. **This document still states no value**
  (AC-74, AC-76).

This is M4's surviving carrier once `OD-12` removed the numeric τ ceiling, and
DR-082/086 are what make it a gate rather than a decoration. **The fixture is
`06-test-strategy.md`'s `FX-SRV-13`** — *the band cap: a second, independent gate
that caps and serves* — at **S5**.

### 9.6 Edges carry a polymorphic target

`{target_kind: NODE, target_node_id}` or `{target_kind: EDGE, target_edge_id}`
(AC-19; Plan.md §5.4, §6.6 UI-2). See §8.11.

---

## 10. Closed enums and their single sources

**The rule** (AC-35, AC-65): every closed vocabulary has **exactly one source**,
is transcribed **once** into `packages/kernel`, and is **cited — never extended —**
by every sibling artifact. Unknown members **fail loudly** at the boundary; a
`require-exhaustive-switch` lint rule backs the exhaustiveness check in code
(Plan.md §2.7). **A new typed state may not be minted without being placed in
`spec §12.3`'s table, and that table is the only place it may be minted**
(S-13; AC-65).

**CANDIDATE, not law**: `ui §1.4` L3's second half — *"a renderer meeting a value
it does not recognize would show that value's raw label rather than nothing"* — is
a proposal the pack labels CANDIDATE (`ui §7` item 5). **No builder is ordered by
it**, and this contract does not depend on it.

| Enum | Members | Single source | On the wire at |
|---|---|---|---|
| `verdict_state` | `SUPPORTED`, `CONTESTED`, `UNSUPPORTED` (**closed at three**) | GLOSSARY canonical verdict model, ratified by **DR-066(3)**; charter VR-2 | Answer, answer index |
| **abstention kind** | **5 members — imported by citation, never restated** | `spec §12.3` **Home 1** (AC-65, DR-051) | Answer, Node, index |
| **condition marks** | **22 members — imported by citation, never restated** | `spec §12.3` **Home 2** (AC-65, DR-051; `spec §26` audit: *"22 marks enumerated; 0 ellipses"*) | `condition_marks[]` on Answer and Node |
| **terminal routes** | **5 — imported by citation, never restated**: inert stop (Q1) · false-presupposition non-answer (Q3) · value→human (Q7, pure value acts only per DR-053) · `NOT_EMPIRICALLY_DECIDABLE` (Q9) · **depth-zero, no-justification-no-split (Q10)** | **`spec §12.3` Home 3** — **complete at five**, row 5 placed by **DR-099 / A-01** (follow-through DR-100); **DR-037** is the routes' authority and `spec §5.2` F-4 enumerates the same five under *"The five terminal routes code must enforce (DR-037)"* | Answer (a terminal route **is** the answer) — §10.1 |
| `way_of_knowing` | `LOOKED_UP`, `RAN`, `REASONING` | AC-24; `ui §1.2` Node (DR-040 Q22 — irreproducible output auto-relabels `REASONING`) | Node; `band_ceiling.basis` |
| `staleness_state` | `FRESH`, `UNDER_REVIEW`, `STALE`, `ARCHIVED_REVIVED` | AC-72; Plan.md §4.8; `ui §4` row 4 | Answer, Node, index |
| `serve_state` | `COMPOSED`, `RECOMPOSED_ONCE`, `COMPONENTS_ONLY` | `ui §1.2` Serve record (DR-049, DR-054, DR-057) | Answer, index, export |
| conformance per-segment | `JUDGED`, `SAMPLED_PASSED`, `NOT_SAMPLED` (**no fourth member**) | DR-060(a); Plan.md §4.4 clause 1 | tier-2 `conformance_record` |
| number slot | `PRESENT`, `EVICTED`, `WITHHELD` (§9.2) | AC-12, **AC-26** (**AC-22's undeclared-operator reason deleted at DR-074** — the member count is unchanged at three); Plan.md §4.4 clause 2a, §5.4 | every served number |
| `magnitude_status` | `MEASURED`, `UNKNOWN` | AC-28 (DR-062 `OD-04`); Plan.md §4.2, §6.4 A-2 | Edge |
| edge `target_kind` | `NODE`, `EDGE` | AC-19 (DR-066(2)) | Edge |
| edge `polarity` | `support`, `attack` | Plan.md §4.2 | Edge |
| edge `kind` | `rebutting`, `undercutting` — **attacks only; NULL on support** | `manifest §6.3` (DR-062 `OD-19`); Plan.md §4.2(1) | Edge |
| `check_status` | `PASS`, `FAIL`, `NOT_SAMPLED` | AC-67 (DR-061 `OD-S-06`) | Node `stranger_restatement` |
| `weight_source` | `owner_elicited`, `org_policy`, `none` — **no `default` member**, carried as the union of §9.4 | DR-017; `ui §1.2` Value hinge | Answer `value_hinges[]` |
| risk tier | `casual`, `standard`, `high-stakes` | DR-011; `ui §1.2` Ask | `POST /v1/asks`, abstention price cell |
| `tier_source` | `ASKER`, `DEPLOYMENT_POLICY`, `DERIVED` | Plan.md §4.1a; **DR-094** rules the authority — **the asker declares, policy may RAISE never lower**. `DERIVED` has **no producer under DR-094** and is an owed AC-77 decision (§5.1) | `POST /v1/asks`, run projection |
| **`composition_budget_tier`** | `low`, `medium`, `high` — the tier list V amended **DR-078** with; **the per-tier values are register rows and appear nowhere on the wire** | **DR-078**; `05-register-skeleton.md` owns the keys | `POST /v1/asks`, Answer run projection |
| envelope state | `WITHIN`, `ENRICHMENT_SKIPPED`, `EXHAUSTED` | DR-052; Plan.md §4.1a | Answer `cost_envelope` |
| ledger typed outcome | `OK`, `FAILED`, `BLOCKED`, `TIMED_OUT`, `REFUSED`, `SKIPPED_BY_BUDGET` | Plan.md §4.3 | ledger digest, node executions |
| `stance_at_action` | `SUPPORTS`, `ATTACKS`, `NEUTRAL`, `UNASSIGNED` | AC-46 (DR-045; `spec §8.1` A-1) | ledger digest, node executions |
| scorecard `basis` | `MEASURED_OUTCOME`, `MEASURED_PROCESS`, `EXTERNAL_BENCHMARK`, `NONE` — **no `ASSUMED`, no `DEFAULT`** | AC-42 (`spec §16.2` K-3…K-11) | `GET /v1/scorecards` |
| memory match tier | `EXACT_QUESTION`, `SAME_BINDING`, `PARTIAL_BINDING`, `TERM_OVERLAP` | AC-68 (`spec §17.2` M-4…M-7) | `memory_disclosure` |
| memory link relation | `REPEATS`, `REFINES`, `CONTRADICTS_PRIOR`, `RELATED_ONLY` | AC-69 (`spec §17.3` M-9); Plan.md §4.7 | `memory_disclosure` |
| node `generation_status` | `pending`, `complete`, `failed`, `stale` | Plan.md §4.2 | Node |
| node `path_status` | `active`, `abandoned` | Plan.md §4.2 | Node |
| **error codes** | §13's closed taxonomy | `packages/contract` (this document) | every response |
| **event names** | §12's closed vocabulary | `packages/contract` (this document) | `GET /v1/runs/{id}/events` |

**Two enums this contract deliberately does not mint, and both now have a named
route.** The **eight typed citation failure routes** are under **DR-084**'s
propose-and-ratify route — *architecture proposes the closed enum, V ratifies*,
with **loud failure, no generic "other"**, and any member surfacing to a reader
placed in `spec §12.3` by amendment (S-13 intact). The **abstention-matrix
question-class axis** is ruled at **DR-080**: it is **its own vocabulary**, one of
three separate closed sets of six, reached through the register-row mapping table
`Q8 type → abstention class`, whose **contents are V's at ratification**. The
wire carries their carriers and **no membership is invented here**. See §17.

**One enum this contract does not mint because the ruling forbade it (DR-096).**
There is **no verdict-first presentation flag** at any default: the verdict
banner renders unconditionally, honesty surfaces 1 and 4 always have their
landing place, and **the register carries no such row**. A flag would have needed
a wire member; none exists, and none may be added.

### 10.1 The terminal-route vocabulary is five on the wire, and why

**The wire enum is `packages/kernel`'s, and `kernel` holds five** — transcribed
once from **`spec §12.3` Home 3** and asserted by the S0 membership-and-count
gate (`06-test-strategy.md` `FX-LG-04`: *"5 abstention kinds + 22 condition marks
+ **5 terminal routes**"*). Declaring four in `packages/contract` would break this
document's own §10 rule — *one source, transcribed once, cited never extended* —
in one of exactly two ways, both defects: the `require-exhaustive-switch` lint
over the wire enum fails against `kernel`'s fifth member, **or** the fifth member
is silently dropped at the boundary.

**`spec §12.3` Home 3 now carries five, so all three homes are cited the same
way.** Row 5 is Q10's depth-zero route, **authority DR-037**, **placed in the
table by DR-099 / amendment A-01** with DR-100 naming the correction in its
mechanical follow-through. **DR-037 (`V-RULING`, FINAL) remains the routes'
authority** — *"inert stop; false-assumption non-answer; value→human;
`NOT_EMPIRICALLY_DECIDABLE`; **no-justification-no-split**"* — and `spec §5.2`
F-4 enumerates the same five. **§12.3 and DR-037 agree**, and this contract cites
the §12.3 membership like every other sibling artifact (AC-65, S-13).

**The order-of-authority workaround is retired, and is recorded as history.**
Until 2026-08-06 Home 3 listed only the first four, omitting depth-zero, so this
contract sourced the five to **DR-037** on the explicit rule that **the ledger
wins over a founding doc** (`spec §2` item 1; `manifest §2.2` item 1) and cited
Home 3 as known-incomplete **for terminal routes only**. That citation is now
**false and is removed**. Two things worth keeping straight about what the
correction did: it **minted no typed state** — the route's authority was always
DR-037, so the edit *placed an already-ruled state* rather than creating one, and
**S-13's single-minting-place law is untouched** — and it changed **nothing** for
the abstention-kind and condition-mark memberships, which were never in dispute.
**Gap `TRACE-7 ≡ H-C-1` is DISCHARGED** (`02-data-model.md` §7.7, §19 carry the
same reading).

**Depth-zero has a wire representation, because a route with none would be a
silence.** `spec` **F-4** requires each terminal route to be *"a **recorded,
servable outcome**, never a silence"*, and §10's own note is that **a terminal
route *is* the answer**. So a depth-zero run — Q10's *no recorded justification,
therefore the question is answered undivided* — serves as an Answer whose
terminal route is that member, carrying its provenance like any other served
outcome (AC-63), rather than as an empty graph, a missing field or an error
(§13.4). **No new typed state is minted here**: the member is DR-037's, and this
document cites it (AC-65, `spec §12.3` S-13).

---

## 11. Frozen artifacts addressable through the contract

Named here because their **identity and version** cross the wire even though
their **contents** are tier 2 or 3.

| Artifact | Addressed at | Tier | Citation |
|---|---|---|---|
| `fact_bundle` | `/inspection`; its **identity and content hash** on the `fact bundle frozen` event | 2 | Plan.md §4.4; AC-51, AC-06; §6.2 AM-7 |
| `conformance_record` | `/inspection`; its **outcome** is tier 1 on the Answer | 2 (outcome: 1) | Plan.md §4.4; DR-060(b), AC-07 |
| recomputation trail | `/numbers/{provenanceRef}/replay` | 2 | AC-06; `ui §1.2` Replay trail |
| `raw_artifact` (**every** model call) | `/inspection/prompts` | **3** | AC-13, AC-44, AC-87 |
| debug facet | `/inspection/debug` | **3** | `manifest §9.3` (DR-062 `OD-18`) |

**The fact bundle's schema and version are architecture's to declare and are
declared here** (`AM-7`, DESIGN-NEUTRALIZED): the bundle is a **versioned,
content-hashed artifact keyed to `(answer_id, answer_version)`**; its *contents*
stay defined by the pack (S-1's exclusion rule plus every requirement that names a
field). Any V clarification lands **as fields, not as a change of kind** (Plan.md
§6.2 AM-7, §4.4).

---

## 12. Event vocabulary, with a declared consumer per name

**Transport**: `GET /v1/runs/{id}/events` (SSE) over the **same front door**
(Plan.md §5.5; AC-60). SEAT-PROPOSAL for the transport and the spellings; the
families and the laws are the pack's.

### 12.1 The laws on the stream

| # | Law | Status | Citation |
|---|---|---|---|
| E1 | **No emitted event without a declared consumer.** The event vocabulary lives in `packages/contract` with a declared consumer per name, **checked by `tools/orphan-audit`**. | RULED | AC-61, AC-77; `ui §1.3` E1 (DR-047 clause 4) |
| E2 | **One name per meaning, declared once.** V2 emitted `synthesis_completed` while the interface listened for `synthesis_complete`, and v2 debates never streamed prose to the browser at all. That is **a contract-level test, not a runtime hope**. | RULED | `ui §1.3` E2; Plan.md §5.5 |
| — | **Payload grade**: events carry **projection-grade payloads or bare signals only**. No event carries bundle-grade material, because **AC-56's authorization gate cannot be re-evaluated per frame on a long-lived subscription**. The "fact bundle frozen" event carries the bundle's **identity and hash, not its contents**. | RULED (from AC-56) | Plan.md §5.5, §6.6 UI-6; AC-56 |
| E3 | *"Under this option, an event would carry only fields a consumer reads, and a payload nothing reads would not be sent."* | **CANDIDATE — no builder is obliged by it** | `ui §1.3` E3; `ui §7` item 5 |
| E4 | **The freshness invariant, in two halves** (§12.2). | RULED | AC-64; `ui §1.3` E4 (DR-015) |

### 12.2 E4, precisely — and why the stream carries a second obligation

AC-64 binds *"every read of, **or subscription to**, an answer that occurs after a
wake-up"*. So:

1. **Correctness is discharged on the read path** — every answer read attaches the
   answer's current staleness state, computed at read time (Seam D, §8.3).
2. **AND the stream MUST additionally carry the `staleness trigger fired` honesty
   event for every subscribed answer**, with a declared consumer per E1.

Without half 2, **a client holding an open subscription and issuing no further
reads — the tab-left-open case `ui` cell 4(a) analyses explicitly — is a
conforming client that is never told the answer went STALE**, breaching DR-015's
*"never silently"* on a path this contract itself ships. With both halves, **push,
pull and pull+ping all conform**, which is what delegated cell 4(a) needs (Plan.md
§5.5, §6.5 C6; `ui §4` row 4).

### 12.3 The vocabulary

Six declared families (`ui §1.3`). The **meaning** column is the pack's; the
**name** column is the proposed canonical spelling (SEAT-PROPOSAL, E2's "declared
once"); the **consumer** column is what E1 requires and what §15's audit verifies
by walking the one TypeScript program (§15.3 — **DR-069: no consumer manifest**).
Grade: **P** = projection-grade payload,
**S** = bare signal.

| Family | Meaning (pack-named) | Name | Grade | Declared consumer | Citation |
|---|---|---|---|---|---|
| run lifecycle | accepted | `run.accepted` | S | `ui §5` W6, W16 | `ui §1.3` |
| run lifecycle | planning | `run.planning` | S | W6 | `ui §1.3` |
| run lifecycle | running | `run.running` | S | W6 | `ui §1.3` |
| run lifecycle | terminal **with a typed kind** | `run.terminal` | P | W6, W20 | `ui §1.3`; **DR-037's five-member list** (§10, §10.1) |
| node lifecycle | spawned — **with the spawn-time placeholder connection** | `node.spawned` | **P** | W6, W8, **W10** (the canvas draws the connection) | `ui §1.3`; **DR-076**; DR-075 |
| node lifecycle | generating | `node.generating` | S | W6, W8 | `ui §1.3`; **DR-076** |
| node lifecycle | **being judged** | **`node.being_judged`** | S | W6, W8 | **DR-076** |
| node lifecycle | **scored** | **`node.scored`** | **P** | W6, W8, W10 | **DR-076**; AC-63, AC-21 |
| node lifecycle | text delta | `node.text_delta` | P | W6, W20 (**the one real token-streaming name**, E2) | `ui §1.3`; `ui §2` surface 4 |
| node lifecycle | complete | `node.complete` | S | W6, W8 | `ui §1.3` |
| node lifecycle | failed **with a typed reason** | `node.failed` | P | W6, W8 | `ui §1.3`; AC-85 |
| node lifecycle | retrying **with the attempt count** against DR-020's cap of 2 regeneration rounds | `node.retrying` | P | W6, W8 | `ui §1.3`; DR-020 knob 5 |
| graph | edge added **with its relation** | `graph.edge_added` | P | W6, W10 | `ui §1.3`; AC-18 |
| graph | cycle refused and **redirected to a shared-crux node** | `graph.cycle_refused` | P | W6, W10 | `ui §1.3`; DR-042, AC-20 (*"circular dependency found" is served information*) |
| serve-composition | fact bundle frozen — **identity and hash only** | `serve.bundle_frozen` | P | W6, W20 | Plan.md §5.5; §6.6 UI-6 |
| serve-composition | composition started | `serve.composition_started` | S | W6, W20 | `ui §1.3` |
| serve-composition | composition delta | `serve.composition_delta` | P | W6, W20 | `ui §1.3` |
| serve-composition | conformance verdict returned | `serve.conformance_verdict` | P | W6, W20 | `ui §1.3`; DR-044 |
| serve-composition | recompose **or defect flag** | `serve.recompose_or_defect` | P | W6, W20 | `ui §1.3`; AC-53 |
| honesty | abstention typed | `honesty.abstention_typed` | P | W6, W9 | `ui §1.3`; DR-051 |
| honesty | budget skip marked | `honesty.budget_skip_marked` | P | W6, W12, W21 | `ui §1.3`; DR-021 knob 9 |
| honesty | fallback labeled | `honesty.fallback_labeled` | P | W6, W12 | `ui §1.3`; DR-021 knob 10 |
| honesty | investigation gap opened | `honesty.investigation_gap_opened` | P | W6, W14 | `ui §1.3`; DR-045 |
| honesty | memory link decided | `honesty.memory_link_decided` | P | W6, W15 | `ui §1.3`; AC-69 |
| honesty | **staleness trigger fired** | `honesty.staleness_trigger_fired` | P | W6, W11 — **mandatory per §12.2** | AC-64; DR-015; Plan.md §5.5 |
| honesty | branch marked `UNDER-EXPLORED` | `honesty.under_explored_marked` | P | W6, W11 | `ui §1.3`; DR-016 |
| ledger | each executed attempt | `ledger.attempt` | P | W6, W18; `ui §2` surface 11 | `ui §1.3`; DR-027 |
| ledger | each failure | `ledger.failure` | P | W6, W18 | `ui §1.3`; DR-027 |
| ledger | each could-not-do | `ledger.could_not_do` | P | W6, W18 | `ui §1.3`; DR-027 |

**Adding a name is adding a consumer.** A name may enter this table only with a
consumer in the same change; the audit fails the build otherwise (E1, AC-61,
AC-77). **A name may not be removed while a consumer references it** — that is
E1's other direction, decided by the **single type graph** now that DR-069 puts
`web` in the same workspace (§15.3).

### 12.4 The node-lifecycle mint — DR-076, under E1 and E2

**What DR-076 requires.** A pending node must be **structurally connected to its
parent from the moment it spawns**, via the (DR-075-confirmed live) placeholder
arrow, **and its lifecycle — generating → being judged → scored — must be
observable live in the UI, not only after settling**. DR-076 is explicit that
this is an **observability/streaming requirement, not an arithmetic one**: *"it
does not change what contributes to a served score."* The ruling deferred the
event **names** to this revision rather than inventing them at grilling time;
they are minted above and justified here.

**E1 — a declared consumer per name.** All four rows carry theirs: **W6** (the
live run view) for every one, **W8** (the node envelope) for the per-node
lifecycle, and **W10** (the graph canvas) for the two that change what is drawn —
the spawn-time connection and the arrival of a strength. No name enters without
one, and `tools/orphan-audit`'s check 3 fails the build otherwise.

**E2 — one name per meaning. Two collisions were possible and both are
resolved:**

1. **The placeholder connection gets NO new name.** DR-075 makes a placeholder
   arrow a **live, real arrow endpoint**, so its creation **is** an edge
   addition, and `graph.edge_added` already means exactly that. Minting
   `graph.placeholder_edge_added` would be **two names for one meaning** — the
   precise defect E2 exists to prevent (V2's
   `synthesis_completed` / `synthesis_complete`). Instead **`node.spawned` is
   upgraded from a bare signal to projection-grade**, carrying
   `{node_ref, parent_ref, placeholder_edge_ref}`, so one event tells a consumer
   the node exists **and** that it is already connected. The edge itself still
   arrives on `graph.edge_added`; the spawn event carries the **reference**, not
   a second declaration of the edge.
2. **`node.scored` is NOT `node.complete`.** They read alike and mean different
   things: `node.complete` is `ui §1.3`'s **generation** lifecycle reaching
   `complete` (the text is finished), while `node.scored` is DR-076's **appraisal**
   lifecycle reaching a strength. A node can be generation-complete and unjudged
   for the whole run — that is M1's ordinary path (AC-21). Collapsing them would
   make an unjudged node indistinguishable from a scored one on the stream, which
   is the D1 shape arriving through the event vocabulary.

**Payload grade — projection-grade only (ADR-0008 / §12.1).** No lifecycle event
carries bundle-grade material, because AC-56's authorization gate cannot be
re-evaluated per frame on a long-lived subscription.

| Name | Grade | Payload | Why that and no more |
|---|---|---|---|
| `node.spawned` | **P** | `{node_ref, parent_ref, placeholder_edge_ref}` | three references, no content — enough to draw the connection DR-076 requires, and nothing a gate would have to re-check |
| `node.generating` | S | bare signal | a lifecycle position with no value attached |
| `node.being_judged` | S | bare signal | likewise; **the judgement's contents are tier 2/3 and never reach the stream** (§2.1) |
| `node.scored` | **P** | the node's strength **as a labeled number** (§9.1) — `{value, provenance_ref, replay_handle, kind, source, producer}` — **or the typed record where the node is unjudged** | AC-63 is absolute: *a number without provenance cannot be serialized*, so if the event carries a strength it carries the labeled shape. **It never fabricates one**: an unjudged node emits M1's typed record, never a default τ (AC-21) |

**The fixture is `06-test-strategy.md`'s `FX-LG-17`** — the lifecycle rendered
live, at **S14** — so these four names have an assertion from the slice that
first renders them, not only a declared consumer.

**Nothing here becomes a column — the DR-076 trap.** The live lifecycle surface
is **event-derived and streamed**, over facts the store already holds:
*generating* is derived-only and **never persisted** (`02-data-model.md` §13,
§14), *being judged* derives from a `JUDGEMENT_SCHEDULED` ledger row with no
reduced judgement yet, and *scored* derives from the presence of a
`node_strength_record` row. A persisted `lifecycle_state` column would be a
fourth authority beside those three and is exactly the *stored derivable state*
the design forbids. **The one thing that IS stored is the placeholder arrow** —
an ordinary `edge` row — because a connection is a fact while a lifecycle
position is a projection of facts.

---

## 13. Typed error taxonomy

**A closed error-code enum with a stable machine-readable body**, declared in
`packages/contract` (Plan.md §5.6).

### 13.1 The rules

| # | Rule | Status | Citation |
|---|---|---|---|
| 13.1.1 | The enum is **closed**; an unknown member fails loudly rather than degrading to a generic error. | RULED | AC-35 |
| 13.1.2 | The body is **stable and machine-readable**: `{code, http_status, detail?}`. A client branches on `code`, never on text. | SEAT-PROPOSAL (shape) | Plan.md §5.6 |
| 13.1.3 | **Typed auth failure is distinguished from typed authorization-scope failure.** | RULED | Plan.md §5.6; `ui §5` W4; DR-066(1) |
| 13.1.4 | **Rate limiting (429) is a typed member.** V2's `apiFetch` threw the body text as a generic `Error` and had no 429 handling at all; that dies with the death list. | RULED (the member); the wider transport-typing clause is **CANDIDATE** (13.1.6) | Plan.md §5.6; `ui §5` W4; `ui §1.4` L8 |
| 13.1.5 | **Never string-sniffed.** V2's `looksProviderOrTokenRequired`, `isMissingJudgeOutputReason` and the `401`/`403` substring match die with the death list; **the interface never parses prose to learn a fact**. | RULED | `ui §3.2`; AC-63; `ui §1.4` L4 (typed-state half) |
| 13.1.6 | **The ruled half of L8 is run-degradation typing** — envelope exhaustion and the hard stop are typed served states with their marks, never a silent stop. **Transport-error typing is a CANDIDATE clause** and is **proposed here, not inherited as law**. | RULED / **CANDIDATE** as marked | Plan.md §5.6; `ui §1.4` L8; `ui §7` item 5 |
| 13.1.7 | **An error code may never be used to mint a served typed state.** `spec §12.3`'s table is the only place a typed state may be minted (S-13, AC-65); any member that must reach the reader is placed there **by amendment**, never invented at the transport layer. | RULED | AC-65; `spec §12.3` S-13 |

### 13.2 The taxonomy

HTTP status mapping is SEAT-PROPOSAL (encoding); the **refusal each code names**
is RULED with the citation shown.

| Code | Status | Names | Citation |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | no principal resolved | `ui §5` W4; AC-57 |
| `SCOPE_FORBIDDEN` | 403 | a principal resolved, but not to the tier the field or endpoint requires (§3) | DR-066(1); AC-56, AC-57 |
| `RATE_LIMITED` | 429 | rate limiting, typed rather than thrown as body text | Plan.md §5.6; `ui §5` W4 |
| `MALFORMED_REQUEST` | 400 | the request fails contract validation | Plan.md §2.3 (runtime validators) |
| `UNKNOWN_ENUM_MEMBER` | 400 | a closed vocabulary received a member it does not declare — **loud failure, never a silent coercion** | AC-35 |
| `UNKNOWN_RESOURCE` | 404 | no such answer / node / number / run | — (encoding) |
| `UNKNOWN_VERSION` | 404 | `?version=` names a version that was never sealed (§6) | Plan.md §4.4 clause 2a |
| `MAKER_INVENTORY_UNSATISFIED` | 403 | a **standard-or-above** ask on a deployment failing `deployment_maker_capability` (§5.2) | AC-38; DR-055; Plan.md §3.2 Seam C |
| `SERVE_OUTPUT_NOT_FROM_LEDGER` | 409 | AC-86 refusal 1 — the stored output was not produced by the ledger | AC-86 (`manifest §9.2a`) |
| `SERVE_ITEMS_NOT_A_LIST` | 409 | AC-86 refusal 2 — the items are not a list | AC-86 |
| `SERVE_ITEM_INVALID` | 409 | AC-86 refusal 3 — **every** item must validate | AC-86 |
| `SERVE_STATUS_UNKNOWN` | 409 | AC-86 refusal 4 — the status string is not a known member | AC-86 |
| `SERVE_ITEM_OUT_OF_NODE_SET` | 409 | AC-86 refusal 5 — an item references a node outside the current set | AC-86 |

### 13.3 The five serve preconditions are five distinct codes on purpose

AC-86 is explicit: *"Each refusal is a distinct typed reason."* Collapsing them
into one `SERVE_PRECONDITION_FAILED` would make S5's *"five distinct typed
refusals each demonstrated"* fixture unwritable (Plan.md §8 S5).

**And the replay precondition is per number, not per payload**: an unreplayable
number is **evicted** (§9.2, §6) and **the rest serves** — it is never one of these
five refusals (AC-86; DR-059).

### 13.4 What is deliberately **not** an error

| Not an error | It is | Citation |
|---|---|---|
| regeneration cap exhaustion | a typed **"not runnable" abstention** with rejection evidence | DR-020 knob 5; `spec §12.3` Home 1 #4 |
| envelope exhaustion | the **`ENVELOPE_EXHAUSTED` condition mark**, served; *never a silent timeout* | DR-052; AC-49 |
| a budget skip | the **`SKIPPED-BY-BUDGET` condition mark**, visible | AC-49; DR-021 knob 9 |
| two failed conformance attempts | **components-only + `DEFECT`**, a served answer-surface state | AC-53; DR-049, DR-057 |
| a replay eviction | the **number slot's `EVICTED`** member plus the `MISSING-NUMBER` mark | AC-12; DR-059 |
| a stale job past its deadline | a **derived** failed status on the resource (§4.2) | AC-88, AC-89; Plan.md §6.6 UI-13 |
| an empty execution list | **"nothing happened"** — and it must never mean "the read failed" | `ui §2` surface 11 |
| a verdict with no usable basis | a typed **`unavailable`**, **never a number**; a lean with no live supporting or attacking node returns **nothing**, never a fabricated even split | AC-90 (`manifest §9.2e`) |

### 13.5 Write-time invariant failures are not wire errors

The graph's write-time refusals — the cycle rejection, the arrow-identity
integrity error, the undercut's support-edge target check, the non-blank claim
check — are typed errors of `graph`'s **write API** (Seam B), not of this
contract: **no endpoint in §5 writes a node or an edge**. They reach a client only
where an endpoint's typed job records one (Plan.md §3.2 Seam B, §4.2;
`03-module-design.md`).

---

## 14. Versioning policy and contract governance

| # | Rule | Citation |
|---|---|---|
| 14.1 | **`/v1` is additive-only.** A shape change that is not additive is **a new version**, because charter A5.5 says research findings land as data, **not** as changes to the serve contract. | Plan.md §5.7; AC-84; charter §6, A5.3, A5.5 |
| 14.2 | Removing a field, narrowing a type, or **removing a member from a closed enum** is not additive. Adding a **member** to a closed enum is a **vocabulary revision governed by its single source** (§10), not an API decision. | AC-65, AC-84; `spec §12.3` S-13 |
| 14.3 | `packages/contract` is the **single declaration** of every wire shape, consumed by `web` as an **ordinary in-workspace package**. **DR-069 removes the fence**, and with it the pinned-version consumption and the consumer-manifest release gate (§15.3) — AC-59's "no adapter" never required a checkout, only one declaration. | **DR-069**; Plan.md §2.6; AC-59, AC-61 |
| 14.4 | The **debug facet is explicitly not part of the stable wire contract** — it has an address so it is not an orphan, not so clients may depend on its shape. | Plan.md §5.3; AC-77 |
| 14.5 | **Answer versioning is a data property, not an API version**: `answer_version` selects artifacts (§6) and moves independently of `/v1`. | Plan.md §4.4; AC-73 |
| 14.6 | **Research upgradeability is preserved by construction**: a validated finding lands as a register row, a scorecard or a strategy implementation — the expected cost of adoption is **a register change plus a re-run**, not a contract change. | AC-84; charter §6 |

---

## 15. The field inventory AC-61's audit walks

**AC-61 / L6 / E1 — bidirectional no-orphan**: *no served field without a
consumer, no consumer without a served field; no emitted event without a declared
consumer.* **Both directions of drift are defects** (DR-047 clause 4; `ui §1.4`
L6, `ui §1.3` E1).

**The field inventory is machine-checkable in both directions**, and
`tools/orphan-audit` **ends in a check that fails the build on an orphan**
(Plan.md §5.7; `ui §5` W19).

### 15.1 The inventory row

Generated from `packages/contract`'s declarations — not hand-maintained, because a
hand-maintained inventory is the thing that drifts (Plan.md §2.3).

| Column | Meaning |
|---|---|
| `surface` | resource, event, or error |
| `path` | the field path (e.g. `Answer.band_ceiling.label`) or the event/error name |
| `type` | the declared type, including which closed enum (§10) it draws on |
| `tier` | 1, 2 or 3 (§2) |
| `optionality` | non-optional / typed-empty-bearing / optional — honesty projections are **non-optional** (§9.3) |
| `producer` | the owning context and package (Plan.md §3.1) |
| `consumers[]` | the declared consumer(s): a `ui §5` W item, a `ui §2` surface, or a named internal consumer |
| `citation` | the AC row and/or DR the field carries |

### 15.2 The checks

| # | Check | Fails when | Citation |
|---|---|---|---|
| 1 | **served ⇒ consumed** | a field or event name is declared and served with **no consumer** | AC-61 (L6, E1) |
| 2 | **consumed ⇒ served** | a consumer references a field or event name **the contract does not declare** | AC-61 |
| 3 | **event-consumer** | an event name has no declared consumer | `ui §1.3` E1 |
| 4 | **one name per meaning** | two names carry one meaning, or one name two meanings | `ui §1.3` E2 |
| 5 | **honesty-surface coverage** | any of the nine surfaces (§8.7) maps to **no** non-optional tier-1 projection field | AC-58, AC-54 |
| 6 | **tier containment** | a tier-2 or tier-3 field appears in a tier-1 payload, or a tier-3 field in a tier-2 payload — **including any `raw_text`** | AC-56, AC-44, AC-87; §2.4 |
| 7 | **enum single-source** | a closed vocabulary is declared in two places, or extended locally | AC-35, AC-65 |
| 8 | **labeled-number** | a weight-bearing number is serialized without `provenance_ref` + `replay_handle` (the `no-unlabeled-number` lint rule is the compile-time half) | AC-63; Plan.md §2.7 |
| 9 | **reachability (G1)** | a declared endpoint, field or event is unreachable from the **published entry-point list** | AC-77; charter G1 |
| 10 | **call coverage (G2)** | a shipped unit is never called on the acceptance run — this is the **never-called list, and it BLOCKS** | AC-77; charter A4.2, VR-5 |
| 11 | **dead cost (G5)** | a unit's output reaches no served surface, no ledger row and no downstream decision — **advisory**, per charter VR-5's own classification | AC-77; charter G5, A4.1 |

### 15.3 There is no consumer manifest — DR-069 removed the mechanism's premise

**RULED — DR-068 and DR-069.** Kept UI source **may** be carried into
DebateAI-V3 (DR-068), and there is **NO FENCE**: the kept UI package sits *"as a
plain, always-visible package beside the engine packages — not a
separately-checked-out workspace, not a separate repository"* (DR-069).

The consumer manifest existed for exactly one reason: a fence would have
destroyed the **single type graph** that makes check 2 (*consumed ⇒ served*)
decidable, and *"reported against it"* is not a mechanism. **With one workspace
the type graph exists**, so:

- **`tools/orphan-audit` decides both directions by walking one TypeScript
  program**, which now includes `web`. Check 1 and check 2 are unchanged in
  force; only their input changes.
- **There is no `consumer-manifest.json`**, no pinned-`packages/contract`
  consumption, and **no engine release step that fails on a missing manifest**.
  §14.3's release gate goes with it. A gate whose premise has been removed is
  dead code wearing a gate's clothes (charter G3), and keeping it would be worse
  than useless: it would pass vacuously forever.
- **AC-61 is not weakened.** The D4-shaped failure it guards — a field served
  with no consumer ever written, passing both builds and showing nothing on the
  **BLOCKING** never-called list — is still caught, and still by
  `tools/orphan-audit` failing the build (§15.2 checks 1, 2, 9, 10).

**What is genuinely unenforced, recorded here because this document is where the
mechanism used to be.** DR-069 priced its own cost and V accepted it: **DR-003's
clean-room mandate has no enforcement mechanism under this ruling — compliance is
an honour system, not a checked barrier.** DR-069's condition travels with it:
this is an **accepted trade-off, not a gap — not to be re-raised as an open
question**. `03-module-design.md` §2 carries the ruling in full.

**RULED — DR-097: an unratified register row is OUTSIDE charter clause 4's orphan
reach.** Register rows are **data, not code**; the never-called list stays about
**executable units**, and **AC-74's ratify-before-production gate is what governs
the register**. So `packages/register`'s skeleton of keys with no values (AC-76)
puts **nothing** on the **BLOCKING** list at S15.

**V's amendment, which is what keeps this from being an exemption.** An
**advisory, non-blocking audit reports any register key no code ever reads after
full build**, so a stale row is **noticed** without exemption paperwork. It runs
in `tools/orphan-audit`'s advisory lane beside G1 and G5 (`03-module-design.md`
§1.2, §12) and **never blocks a release** — charter A4.1's classification, not a
softening of A4.2.

---

## 16. Fixtures this contract owes

Specified in `06-test-strategy.md`; listed here so each obligation has an owner on
the contract side (AC-79: **every gate is shown to fire both ways before it counts
as adopted**).

| # | Fixture | Asserts | Citation |
|---|---|---|---|
| 1 | **no `raw_text` in any tier-2 payload** | `/inspection` returns no raw model text anywhere — conformance judge included | Plan.md §5.2; AC-44, AC-87 |
| 2 | **`tier_source` round-trip, the REACHABLE suppliers** *(`FX-DB-07`)* | each **reachable** supplier survives `POST /v1/asks` → run → served projection, **plus DR-094's raise-never-lower direction**: a `DEPLOYMENT_POLICY` row strictly raises, and a lowering write is refused. **Rescoped from "all three"** — DR-094 names a producer for `ASKER` and `DEPLOYMENT_POLICY` and none for `DERIVED`, whose audit is routed to **S09** (§5.1) | **DR-094**; Plan.md §4.1a |
| 3 | **the eviction trio** | (a) the frozen conformance record is **byte-identical** before and after; (b) the **sealed version still replays**; (c) the **current projection** reads components-only + `DEFECT` with the typed missing-number mark | Plan.md §4.4 clause 4; AC-07, AC-12 |
| 4 | **five distinct typed refusals** | each AC-86 precondition demonstrated separately (§13.2) | AC-86; Plan.md §8 S5 |
| 5 | **maker-inventory pair** | `MAKER_INVENTORY_UNSATISFIED` **fires** on a standing one-maker deployment and **does not fire** on a two-maker deployment with one transient outage | AC-38; DR-055/DR-014; Plan.md §8 S8 |
| 6 | **W19 reachability** | the orphan audit **fails the build** on an orphan, both directions (§15.2) | AC-61, AC-77; `ui §5` W19 |
| 7 | **contract tests re-authored from the declaration** | the 35-of-50 `.mjs` tests that assert against interface **source text** are re-authored against `packages/contract`; **snapshot tests are rejected** — a snapshot asserts what the server happened to send, which is how a served-but-unread field survives an audit | `ui §5` W7; Plan.md §2.5; AC-61 |
| 8 | **`FX-WIRE-02` — execution-read pagination** | `GET /v1/nodes/{nodeId}/executions` is **keyset-paginated, ordered by the ledger `sequence`** — never by a timestamp — on `contract`'s single page envelope (§7.2); an **absent `limit` resolves to the register default** and a `limit` **above the register maximum is REFUSED, not silently clamped** past the bound, both read from the register and never as literals (§7.3); and **the read carries no write side effect** (§4.2). **Asserts the mechanism, never a number** — both limits ship `— none stated` and are V's at DR-023. Slices **S1** (the paginated read over the ledger) · **S14** (interface limb, through the one transport) | **A-11** (DR-099); AC-62, AC-44, AC-74, AC-76, AC-08, AC-89; §7.5, §7.6, §4.2 |
| 9 | **`FX-WIRE-03` — `GET /v1/session`, the principal surface** | the principal resolves **session → asker → answer ownership**, and the **tier-2 `/inspection` gate and the per-asker memory scope are evaluated against this surface** rather than against an ad-hoc identity (§3.1, §3.3). **`RULED — DR-070`**: the asker is the requesting user/person, resolved through the adopted **`user_dev_token`** slice. **Scope, stated so it is not overclaimed: authorization and user credentials are explicitly out of scope at this stage, so the fixture asserts OWNERSHIP SCOPING AND ITS PROVENANCE — never authentication strength.** It also records DR-070's own condition: a **provisional simplification** expected to need real principal/session separation before a multi-tenant or credentialed launch, carrying **charter-A5.2-style revisit language when built**. Slices **S0** (the surface lands with the walking skeleton) · **S13** (AC-71's per-asker pull scope evaluated against it) | **DR-070**; DR-066(1); AC-57, AC-71; §3, §3.1 |

**Rows 8 and 9 are reconciled to the landed roster, not merely aligned with it.**
Both ids were minted at this fold-in because A-13 named six fixture ids and
**neither of these was among them** — A-11's repair and API-4's `/v1/session`
residue each had a declared surface with **no assertion anywhere**, the
untested-claim shape charter clause 4 indicts. `06-test-strategy.md` has since
landed both rows in full; **the specification is that document's and the
obligation is this one's** (AC-85), so the rows above restate the slices and the
asserted subjects **from** the roster rather than beside it. Three corrections
this reconciliation made, recorded because a reader of the earlier text would
have been misled:

- **Slices were understated**: `FX-WIRE-02` is **S1 + S14**, not S1 alone;
  `FX-WIRE-03` is **S0 + S13**, not S0 alone.
- **`FX-WIRE-02`'s subject was understated**: the register default/maximum
  resolution — with a **refusal rather than a silent clamp** — and the
  **no-write-side-effect** limb are part of the assertion, and both are this
  contract's rules (§7.3, §4.2).
- **`FX-WIRE-03` carried the wrong limb.** The earlier text asserted the
  `UNAUTHENTICATED` / `SCOPE_FORBIDDEN` split — **an authentication-strength
  claim the roster explicitly excludes**, and which DR-070 puts out of scope at
  this stage. The typed distinction between those two errors remains a live rule
  of this contract (§13.1.3, §13.2); it is simply **not what this fixture
  asserts**, and claiming it would have made the fixture attest a guarantee the
  ruling declined to make.

**One cross-document provenance mismatch, routed not fixed.** This contract and
the FinalPlan consolidation call executions pagination **A-11**; `06`'s
`FX-WIRE-02` row and its fixture index call it **A-12**. **A-11 is correct** —
FinalPlan §A-11 is *"Pagination on the execution read"* and **A-12 is the
charter-A5.2-over-orderings SEAT-PROPOSAL**, a different amendment entirely.
This document is **not changed**; the mis-citation is **routed to PRE-03** as the
owner of `06` (and of `05`/`00`, which repeat it).

---

## 17. The questions that touched this contract, and how they landed

**All 28 are ruled** (DR-068..DR-097; DR-100 closes the loop). Each row names the
ruling and what it froze here. **No row in this table is open.**

| Was | Ruling | What is now frozen here |
|---|---|---|
| **Q-01 / Q-02** — the fence | **DR-068** + **DR-069** | kept source may be carried; **NO FENCE**. §15.3's consumer manifest, pinned-version consumption and release gate are **deleted**; check 2 returns to the single type graph. DR-003's clean room is an **honour system** — an accepted trade-off, not a gap |
| **Q-03** — who a principal is | **DR-070** | the asker is the **requesting user/person**; authorization and credentials **out of scope**; **`user_dev_token` adopted**. `asker_id` / `session_id` / `caller_scope` stay distinct because the simplification is **provisional** (§3) |
| **Q-04** — the undercut's arithmetic | **DR-071** | **transmission-reduction**, a third ruled producer (`OD-06` 2 → 3); `UNDERCUT_TRANSMISSION` is **writable**; the per-edge reduction is tier-2 replay material, not a tier-1 Edge field (§8.11) |
| **Q-10** — the composition budget | **DR-078** | an **independent register row**, distinct from the envelope, **user-facing as an asker-selected `low`/`medium`/`high` tier** on `POST /v1/asks` (§5.1a). Two gates, two marks |
| **Q-11** — load-bearing, non-node senses | **DR-079** | they **project from the charter's node definition**; the `segment → served_number` set already carries the "states a served number" limb, so **no new field** (§6.6) |
| **Q-12** — the abstention price cell's key | **DR-080** | **three separate vocabularies** + two register-row mapping tables; `question_class` is the **abstention-class** vocabulary, not Q8's types (§8.7 row 1, §10) |
| **Q-13** — projection depth | **DR-081** | `OD-11` layer 2 activates behind **a register row V flips**; **layer 1 is the default**, both states testable before the flip, **nothing ships dark** (§8) |
| **Q-14** — the band rule and the ceiling | **DR-082** + **DR-086** | a **second independent gate** beside DR-044's three, which **caps the band and wears its label — never blocks**; `band_ceiling` non-optional; labels and cuts stay register rows (§9.5) |
| **Q-16** — the eight citation routes | **DR-084** | **architecture proposes the closed enum, V ratifies**; loud failure, **no generic "other"**; a member reaching a reader is placed in `spec §12.3` by amendment. **No membership minted here** (§10) |
| **Q-25** — the risk tier's authority | **DR-094** | **the asker declares; policy may RAISE, never lower**, with `tier_source` + `tier_provenance_ref` printed. `DERIVED` has **no producer** and is an owed AC-77 decision before S9 (§5.1) |
| **Q-26 / Q-27** — kept components; verdict-first | **DR-095** + **DR-096** | **kept SURFACE, rebuilt insides**, each altered component approved at its mockup review (DR-064); **no verdict-first flag ships at any default** and the register carries no such row (§10) |
| **Q-28** — unfilled register keys as orphans | **DR-097** | register rows are **data, not code** — **outside** charter clause 4's reach; AC-74's ratify-before-production gate governs them, plus V's **advisory** stale-key audit (§15.3) |

**What is still V's, and is not an open question.** **Register values** (DR-023,
AC-74/AC-76) and the **DR-084 citation-route membership** — both marked at their
sections rather than carried as questions here.

---

## 18. Gap register for this document — merged dispositions

**Ids are global** and use the C4 gap-id convention fixed by
`merge-verdict-c4.md` (Codex prefixes; **`09-traceability.md`'s consolidated index
is the single register**, H-C-10). **REAL** = a missing or contradictory contract
fact that enters the FinalPlan consolidation and the V register. **MISREAD** = the
cited source already resolves it, or a C4 lane owns the choice; a MISREAD row
closes with its citation and is **not** preserved as an open architecture
question.

| Gap id | Verdict | Disposition |
|---|---|---|
| **API-1** — execution-read pagination | **REAL** | **CLOSED.** AC-62 requires real pagination and `GET /v1/nodes/{nodeId}/executions` was unbounded under AC-44. **Repaired on this document's surface** at §7.5/§7.6 and §4's read table (keyset, ledger-`sequence`-ordered, no value stated); the **Plan-side** residue was ratified as amendment **A-11** at **DR-099**. **The last piece — a fixture — is assigned at the DR-100 fold-in as `FX-WIRE-02`** (§7's note, §16 row 8), because A-13's six ids did not include one and a repaired surface with no assertion is an untested claim (AC-79, charter clause 4). |
| **API-2** — Investigation endpoint | **MISREAD** — closed | *"Plan.md §5.2 already requires the Investigation listing as an `Answer` tier-1 projection; no founding requirement demands a separate collection endpoint"* (`merge-verdict-c4.md` gap index). This document carries it as `investigations[]` (§8.7 row 6) and **claims no missing endpoint**. Closed with that citation. |
| **API-3** — three serve records vs two surfaces | **MISREAD** — closed | *"`ui-boundary-contract.md` §1.2 records lifecycle/status (`COMPOSED`, `RECOMPOSED_ONCE`, degraded), while §4.0 defines two rendering surfaces; `RECOMPOSED_ONCE` projects to composed without minting a third surface"* (`merge-verdict-c4.md` gap index). That is exactly the reading §10 and §8.9 build — **lifecycle status and rendering surface are two different axes**, and `DEFECT` travels as condition mark 14, so no state is minted (AC-65). Closed; **not** a Plan.md defect. |
| **API-4** — `GET /v1/fleet` and `GET /v1/session` had no owning context, and three endpoints had no legal dependency path | **REAL** (cross-lane) — **CLOSED** | H-O-2 / H-O-20. **Owners, resolved by `03` §4.4**: `/v1/fleet`'s state is **`battery`**-owned run-execution sequencing / work-claim state (`apps/runner` executes; `apps/scheduler`'s reaper is the expiry writer), reached through `apps/api`'s existing `battery` edge — **no new edge**; `/v1/session` is **`apps/api`**'s, with what an asker *is* **now ruled at DR-070**. **Edges, resolved by `03` §3.1 row 21**: `apps/api → settlement, critique` landed at rework round 1, so `/v1/scorecards`, `POST /v1/nodes/{id}/feedback` and `POST /v1/investigations/{id}/executions` are **reachable**; §4.3's Status cells are synced. **CLOSED at DR-099** — the carrier `core.work_item` (`02` §3.8) is accepted as amendment **A-05**, closing gap **MOD-4**; `/v1/session`'s identity is ruled at **DR-070**. **The residue closed at the DR-100 fold-in: `/v1/session` had no fixture and no slice.** Assigned **`FX-WIRE-03`** (**S0 + S13**), alongside the `user_dev_token` adoption (§16 row 9) — a surface with an owner, an identity and no assertion is still an untested claim. |

**Nothing in this section is a V-QUESTION.** Open questions are §17's, addressed
as `Q-nn`; a gap is a missing or contradictory *fact*, which is a repair, not a
ruling.

---

## 19. Traceability — what this document carries

The full bidirectional index is `09-traceability.md`'s. This table is the local
half: the constraint rows this contract is the named carrier for.

| AC | Carried at |
|---|---|
| AC-06 (replay law) | §2.1 tier 2, §4 `/replay`, §6.3, §11 |
| AC-12 (replay eviction) | §6, §9.2, §13.4 |
| AC-18, AC-19 (first-class edges, polymorphic target) | §8.11, §9.6, §10 |
| AC-20 (cycle law, served information) | §8.11, §12.3 `graph.cycle_refused` |
| AC-26 (withheld parent, strict-and limb) | §9.2 — **AC-22's undeclared-operator limb deleted at DR-074** |
| AC-24 (way-of-knowing ceiling) | §8.7 row 2, §9.5 |
| AC-28 (typed unknown magnitude) | §8.11, §10 |
| AC-31 (position label) | §8.10 |
| AC-34 (per-node record, never a flat map) | §4 `/inspection/debug`, §8.10, §9.1 |
| AC-35, AC-65 (closed enums, single source, loud failure) | §10, §13.1.1, §13.1.7, §15.2 check 7 |
| AC-38 (maker inventory at standard+) | §5.2, §13.2, §16 fixture 5 |
| AC-42 (scorecard cell shape, no ASSUMED/DEFAULT) | §10 |
| AC-44 (everything recorded; raw tapes internal) | §2.1 tier 3, §4 `/ledger-digest`, §12.3 ledger family |
| AC-49 (protected core, visible skips) | §5.3, §8.7 row 8, §13.4 |
| AC-51…AC-55 (composition, gate order, terminals, size law, degraded mode) | §8.2, §8.4, §8.9, §9.3, §13.4 |
| AC-56, AC-57 (wire boundary; asker-scoped authorization) | §2, §3 |
| AC-58 (nine canonical honesty surfaces) | §8.7, §15.2 check 5 |
| AC-59, AC-60 (no adapter; one transport) | §1 |
| **AC-61** (bidirectional no-orphan) | **§15** |
| AC-62 (real pagination; no write side effects; declared polls) | §4.2, §7 |
| AC-63 (origin + replay handle, or it does not arrive) | §9.1, §9.2, §8.5 |
| AC-64 (E4 freshness) | §8.3, §12.2 |
| AC-66 (verdict model, two axes) | §8.9, §9.5, §10 |
| AC-67 (`stranger_restatement`) | §8.10, §10 |
| AC-69, AC-70, AC-71 (memory links, pinned pulls, scope split) | §8.7 row 9, §10, §3 |
| AC-72 (staleness states and badges) | §8.7 row 4, §10, §12.3 |
| AC-73 (`(answer_id, answer_version, as_of)`) | §6, §8.9, §14.5 |
| AC-74, AC-75, AC-76 (register rows; printed constants; no invented numbers) | §0, §7.3, §8.7 row 1, §9.5 |
| AC-77 (no orphaned modules) | §4.1, §6 consumers, §12.1 E1, §15 |
| AC-84 (research-upgradeability) | §14.1, §14.6 |
| AC-85 (one behaviour, one place) | §1.4, §8.8 |
| AC-86…AC-91 (organ 6: refusals, sanitizing, reconciliation, stale expiry, honest degradation, suppression) | §4.2, §13.2, §13.3, §13.4, §6 |

---

*End of `04-api-contract.md` — ARCH-V3-R1 / C4 lane 5, 2026-08-05. Authored
against Plan.md rev 3 §5 under §7 row 5's scope. **SEAT-PROPOSAL throughout for
encoding and naming; RULED where cited.***

***Revised 2026-08-06 at the DR-100 fold-in (PROG-V3-R1, ticket PRE-02):***
*provisional banner removed (DR-098/DR-099/DR-100); **§12.4 mints DR-076's
node-lifecycle event names** (`node.spawned` upgraded to projection-grade with
the placeholder connection, `node.being_judged`, `node.scored`) under E1's
declared-consumer rule and E2's one-name-per-meaning rule, with the two possible
E2 collisions resolved on the record; `POST /v1/asks` gains **DR-078's
composition-budget tier** (§5.1a) and **DR-094's raise-never-lower risk-tier
semantics** (§5.1); **DR-082/086's band ceiling** recorded as a gate-with-cap
(§9.5, §8.9); **AC-22's undeclared-operator `WITHHELD` reason deleted** and
AC-26's strict-and limb kept (§9.2, DR-074); **§15.3 rewritten for DR-069's NO
FENCE** and **DR-097's advisory register-key audit**; DR-070, DR-071, DR-075,
DR-079, DR-080, DR-081, DR-084, DR-095 and DR-096 folded in; **two fixture ids
assigned — `FX-WIRE-02` (A-11 / API-1) and `FX-WIRE-03` (`GET /v1/session`, S0)**,
owed to `06-test-strategy.md`'s roster. **Rev 2 (same day, PRE-02 fix cycle):**
the **Home-3 restatement** — §10's terminal-routes row and §10.1 now source the
five to **`spec §12.3` Home 3 itself**, complete after **DR-099 / A-01** placed
row 5 (DR-100 follow-through); DR-037 travels as the routes' authority, the
order-of-authority workaround and the "known-incomplete" citation are recorded as
**history** and removed as live claims, and **`TRACE-7 ≡ H-C-1` is DISCHARGED**.
**Rev 3 (same day, Codex findings):** `band_ceiling.basis` narrowed to the ruled
**way-of-knowing distribution alone** (DR-082), with Plan.md AQ-1's wider
recommendation recorded as the superseded SEAT-PROPOSAL and Q51's outcome left on
its own carriers; §16 rows 8 and 9 **reconciled to `06-test-strategy.md`'s landed
roster** (slices S1+S14 and S0+S13; `FX-WIRE-02`'s register-default/maximum and
no-write-side-effect limbs added; `FX-WIRE-03`'s authentication-strength limb
**removed** as outside the roster's stated scope); the **A-11 vs A-12**
provenance mismatch in `06`/`05`/`00` routed to PRE-03; `FX-DB-07` rescoped to
the reachable suppliers with `DERIVED`'s audit routed to **S09**; `FX-LG-17` and
`FX-SRV-13` cross-referenced; stale AC-22 citations cleaned from the number-slot
provenance lines. **This document is accepted architecture** (DR-100).*
