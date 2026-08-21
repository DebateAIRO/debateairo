# ADR-0005 — The polymorphic edge and the undercut carrier

| Field | Value |
|---|---|
| **Status** | **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at **VG-01**. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. |
| **Source of record** | Plan.md rev 3, §4.2 (clauses 1–5), with §3.2 Seam B, §6.4 A-1/A-2, §6.6 UI-2 |
| **Label carried from the plan** | Plan.md §1 preamble: **SEAT-PROPOSAL throughout**. The arithmetic half was an open V-QUESTION (A-1) when this ADR was written; **it is now ruled — DR-071**. |

## Rulings folded in (PRE-04, 2026-08-06)

| Ruling | Q-nn | What it changes here |
|---|---|---|
| **DR-071** | Q-04 (A-1) | Undercut shape = **`transmission-reduction`**, computed in the pure core, recorded per edge — a **third ruled producer** of arrow strength. **Clause 6's NOT-WRITABLE fence is discharged**: `strength_source = 'UNDERCUT_TRANSMISSION'` is **writable**. The `CHECK` scoping it to undercutting edges **stays**. |
| **DR-073** | Q-06 (A-4) | Provenance-cluster collapse applies to **both polarities**, so `strength_source = CLUSTER_COLLAPSE` is written on attack arrows too; a node with no resolvable key clusters alone. |
| **DR-075** | Q-08 (A-9) | **Placeholder arrows are live, real arrow endpoints.** The "endpoint absent from the node set" error is reserved for genuinely foreign or deleted endpoints — never a legitimate placeholder. |
| **DR-068** | Q-01 | Kept UI source is carried in-repo, so this ADR's edge/`Edge`-shape reachability to the kept UI is an ordinary in-tree dependency ([ADR-0016](ADR-0016-repository-layout-no-fence.md)). |

## Context

An **edge** (equivalently an **arrow**) is the typed relation between argument
nodes — support or attack. Three rulings fix its status and its target, and one
of the three is newer than the founding text it contradicts:

- **AC-18** — edges are stored **first-class objects, never derived at read
  time**, and an edge may target a node that is not the source's structural
  parent (DR-022 as narrowed by DR-035; DR-030 J2; manifest §6.3; ui §1.2 Edge).
  Manifest §6.3 names the absent edge table as the largest structural gap
  carried over.
- **AC-19** — the undercut is a typed attack targeting the support **EDGE**,
  never the claim node; architecture inherits it as a requirement
  (**DR-066(2)**).
- **AC-15** — one graph, no conversion layer: the split's children and defeaters
  **are** the graph's nodes and typed edges (DR-030 J2; spec §18 O-2).

The interface contract's node-to-node `Edge` shape predates DR-066(2), and its
field names are "illustrative, not normative" (ui §1.2), so the shape is
**refined here, not contradicted** (Plan.md §6.6 UI-2, **RESOLVED-BY-PACK**).

What an edge-targeting attack **does to the arithmetic** was the one thing this
ADR could not settle. **It is now ruled: DR-071 (Q-04 / A-1)** — the undercut is
a **transmission-reduction**, a reduction of the targeted support edge's
transmitted contribution, computed inside the pure core and recorded per edge,
and it is a **third ruled producer** of arrow strength. Clause 6 below carries
the consequence.

## Options considered

### For the undercut's carrier

**Option A — model the undercut as a plain attack on the target node.**
Rejected: forbidden in terms by DR-066(2) (AC-19).

**Option B — a separate `undercut` table beside the edge table.** Rejected: two
stores for one relation contradicts AC-15's one-graph rule and AC-85's one
behaviour in one place (charter A3.1), and it splits arrow identity — so
AC-35's duplicate-collapse and integrity rules would need two implementations.

**Option C — one edge table with a polymorphic target, constrained in DDL.**
*(chosen)*

### For enforcing "a SUPPORT edge specifically"

**Option C1 — `target_kind = EDGE` alone.** Rejected as too weak: it admits an
undercut of an *attack* edge, which DR-066(2) does not license.

**Option C2 — an application-level check in the graph write API.** Rejected
under AC-32: enforcement is owed at write time in the database, not by
convention, and an application check is a restatement rather than an authority
(ADR-0003 rule 1).

**Option C3 — a graph-scoped composite foreign key plus a `CHECK`.** *(chosen)*

## Decision

**Adopt the first-class `edge` table with a polymorphic target, with every
invariant below owned by the migration that creates the table** (ADR-0003 rule 1;
the shape and column inventory are `02-data-model.md`'s). Six clauses bind:

### 1. The arrow-kind vocabulary is closed at two members, and it types attacks

Manifest §6.3 (DR-062 `OD-19`) distinguishes **rebutting** an attack from
**undercutting** it — both members are distinctions *within* an attack. The pack
declares **no support-side member**, and minting one would extend a ratified
closed enum, which architecture may not do (DR-062 `OD-19`; spec S-13's
discipline; DR-039). Therefore `kind` is **bound to polarity by `CHECK`**:
`polarity = 'attack'` requires `kind IN ('rebutting','undercutting')`;
`polarity = 'support'` requires `kind IS NULL`. A support edge is fully typed by
its polarity. Unknown values fail loudly at write (AC-35).

*(This is also why ADR-0004's ordering rule must declare `NULLS FIRST` on `kind`
explicitly: support edges carry a NULL there by construction.)*

### 2. The undercut targets a SUPPORT edge — enforced, not described

A **graph-scoped composite foreign key**
`(run_id, target_edge_id, target_edge_polarity) REFERENCES edge (run_id, edge_id, polarity)`,
plus
`CHECK (kind <> 'undercutting' OR (target_kind = 'EDGE' AND target_edge_polarity = 'support'))`.
The denormalized polarity column cannot drift, because the foreign key makes the
database resolve it against the target edge's actual polarity — and carrying
`run_id` on both sides means the resolution can only land inside the same graph.
`06-test-strategy.md` owes a **rejecting** fixture (an undercut written against an
attack edge is refused) alongside the accepting one, per AC-79 (DR-063 VR-1/VR-5).

### 3. Graph-scoped integrity on every endpoint

`node` carries `UNIQUE (run_id, node_id)`, and the edge's endpoints are
`(run_id, source_node_id)` and `(run_id, target_node_id)` referencing it. Without
`run_id` in those keys an edge in one run could take a node or a support edge in
another run as an endpoint — contradicting one-graph-per-run and **AC-69**'s
link-never-merge, no-transitive-closure rule (spec §17.3 M-9…M-11), under which
the only legal cross-run relation is a typed memory link. Rejection fixtures are
owed for **every** cross-run source/target combination, including an
otherwise-valid undercut of a support edge in another run.

**What "absent endpoint" means, after DR-075.** A **placeholder** endpoint is
**live**: a `pending` node is structurally connected to its parent from the
moment it spawns, via a placeholder arrow that is a real arrow endpoint. The
absent-endpoint error is therefore reserved for **genuinely foreign or deleted**
endpoints — a legitimate placeholder must never raise it. (DR-075; the
authoritative statement of the edge-integrity rules is `02-data-model.md`'s.)

### 4. Upsert semantics — collapse and integrity error are different outcomes

AC-35 carries two distinct behaviours from manifest §4.4: duplicate identical
arrows **collapse**, and one identity carrying two different strengths is a
**loud typed integrity error**. A bare unique index cannot tell them apart and
would reject both, turning a legitimate re-derivation into a write failure. The
rule: identity is
`(source_node_id, target_kind, coalesce(target_node_id, target_edge_id), polarity)`;
on conflict, if `(strength, magnitude_status, strength_source, kind)` are all
equal the write **collapses** to the existing row (no-op, returning the existing
`edge_id`); if any differ it **raises the typed integrity error** — never a
silent pick. Both cases get a fixture (Plan.md §8 S2).

### 5. Unknown magnitude is representable without a sentinel number

`strength` is **nullable** with a companion `magnitude_status ∈ {MEASURED,
UNKNOWN}` and a `CHECK` binding the two: `(strength IS NULL) = (magnitude_status
= 'UNKNOWN')`. The core treats `UNKNOWN` as contributing nothing. This carries
**AC-28** — a contradicting verdict yields an attack arrow with a typed unknown
magnitude, visible and contributing nothing, while unverifiable / pending /
absent / malformed yields **no arrow at all** (DR-062 `OD-04`; manifest §6.3) —
and it is the disposition of ambiguity A-2 (Plan.md §6.4,
**DESIGN-NEUTRALIZED**). `OD-04`'s pre-approved contingent successor (a
verifier-vouched magnitude) lands as a value in the same column with no schema
change.

### 6. The `strength_source` fence — declared, scoped by `CHECK`, and WRITABLE under DR-071

**AC-27** closes arrow strength to ruled producers — the evidence verifier's
grounded score or provenance cluster collapse (DR-062 `OD-06`; manifest §4.2c).
The seat's own recommended answer to A-1 (an undercut that reduces the
transmitted contribution of the support edge it targets) is a magnitude from
neither producer. A strictly two-member enum would leave the only representable
undercut as `magnitude_status = UNKNOWN` — option (ii), which Plan.md §6.4 A-1
itself indicts as "a first-class relation that changes nothing". **A ruled
relation must not be dead by construction on day one, whichever way V rules.**

So a third member, `UNDERCUT_TRANSMISSION`, is **declared** and **fenced** by
`CHECK (strength_source <> 'UNDERCUT_TRANSMISSION' OR (kind = 'undercutting' AND target_kind = 'EDGE'))`,
which preserves AC-27's closure intact for every other edge.

**The fence was not a ratification, and this ADR never treated it as one.**
`DR-062 OD-06` closes the set of **producers** of arrow strength, not the set of
edges the closure applies to; an undercut edge carrying a `MEASURED` strength
from a mechanism `OD-06` does not name would be a ratified-closure extension,
which is exactly what clause 1 above refuses to do for the arrow-kind
vocabulary. So the member shipped declared-but-not-writable, and A-1 asked V for
the ratification explicitly.

**RULED — Q-04 (DR-071). The member is writable.** V ruled the undercut shape to
be **`transmission-reduction`**: a reduction of the targeted support edge's
transmitted contribution, computed inside the pure core and **recorded per
edge** — and the ruling **grants the `DR-062 OD-06` producer-set extension from
two to three** in terms. Three consequences, stated so no builder has to infer
them:

1. **`strength_source = 'UNDERCUT_TRANSMISSION'` is writable.** The
   not-writable prohibition is **discharged**, not relaxed.
2. **The `CHECK` stays.** `CHECK (strength_source <> 'UNDERCUT_TRANSMISSION' OR
   (kind = 'undercutting' AND target_kind = 'EDGE'))` still binds — the ruling
   extended the **producer set**, not the set of edges the producer may write.
   AC-27's closure remains intact for every other edge.
3. **The producer is the pure core.** The reduction is computed in
   `packages/propagation` (ADR-0004's purity seam) and lands as a recorded
   per-edge quantity; it is not a model output and not a write-path literal.

*(The `06-test-strategy.md` fixture for this column is now an **accepting**
fixture as well as a rejecting one: a legitimate `UNDERCUT_TRANSMISSION` write
succeeds, and the same write on a support edge or a node-targeting attack is
refused — AC-79 both ways.)*

Status: **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at VG-01.

## Consequences

**Accepted:**

- The interface's `Edge` shape becomes `{target_kind: NODE, target_node_id}` or
  `{target_kind: EDGE, target_edge_id}` on the wire (Plan.md §5.4) — a
  refinement of an illustrative shape, not a contradiction of a contract.
- The write path is single (Seam B): all node and arrow writes go through
  `graph`'s write API inside one transaction taking a per-graph advisory lock,
  so acyclicity is checked against a stable predecessor set. That is **layer two**
  of AC-20's three-layer cycle law; layer one is the builder's refusal-and-redirect
  in the same package, layer three is `propagation`'s typed compute-time error —
  and charter §5.2 row 10 requires all three to exist.
- AC-18's "never derived at read time" is satisfied by construction: there is a
  table, and reads select from it.

**Costs and risks, stated plainly:**

- ~~**`UNDERCUT_TRANSMISSION` is unreachable until V rules A-1.**~~
  **DISCHARGED by DR-071.** The member is written by a live producer, so the
  AC-77 / charter VR-4 removal-or-live exit condition on S2 is **satisfied by
  the member being live** rather than by deleting it. The alternative branches
  the ADR carried — remove the member if the inert shape is ruled, or carry the
  effect on `propagation_run` under answer (c) — are **moot**.
- ~~**A-1 is an entry criterion for slice S2.**~~ **SATISFIED.** The edge table
  is freezable: Q-04 is ruled (DR-071) and Q-06 is ruled (DR-073), which were
  the two open questions touching this table.
- **The reduction is now a third thing the arithmetic must get right**, and it
  is verdict-affecting. It is recorded per edge, so the replay ceremony consumes
  a recorded quantity rather than re-deriving one (ADR-0004/0012's discipline).
- The denormalized `target_edge_polarity` column exists only to make clause 2's
  foreign key expressible. It is not independent state — the foreign key forces
  the database to resolve it — but a reader must not treat it as a fact that can
  be updated on its own.
- Clause 4's conditional upsert cannot be expressed as a plain unique index; it
  needs written SQL, which is one of the reasons ADR-0003 chose a SQL-first tool.

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-18 — edges are first-class stored objects | DR-022 as narrowed by DR-035; DR-030 J2; manifest §6.3; ui §1.2 | the `edge` table itself |
| AC-19 — the undercut targets the support edge | DR-066(2) | clause 2's composite FK + `CHECK` |
| AC-15 — one graph, no conversion layer | DR-030 J2; spec §18 O-2 | one edge store; no parallel undercut table |
| AC-35 — closed vocabularies; collapse vs typed integrity error | manifest §4.4, §6.3, §6.4 | clauses 1 and 4 |
| AC-28 — typed unknown magnitude vs no arrow | DR-062 OD-04; manifest §6.3 | clause 5's nullable strength + `magnitude_status` |
| AC-27 — arrow strength is closed to ruled producers | DR-062 OD-06, **as extended two → three by DR-071**; manifest §4.2c | clause 6's `CHECK` fence, with the member **writable** and scoped to undercutting edges |
| AC-32 — write-time enforcement | manifest §6.2, §6.4; charter A3.2 | every invariant in DDL, owned by the creating migration |
| AC-69 — link never merge, no transitive closure | spec §17.3 M-9, M-10, M-11 | clause 3's graph-scoped endpoint keys |
| AC-20 — cycle law at three layers | DR-056(b), DR-042; manifest §4.2d; charter §5.2 row 10 | Seam B's single-writer transaction as layer two |
| AC-77 — no orphaned modules | DR-047 clause 4; charter §5, A4.2, VR-4 | the removal-or-live exit condition on `UNDERCUT_TRANSMISSION`, **satisfied live** under DR-071 |
| AC-79 — every gate shown to fire both ways | DR-063 VR-1/VR-5; spec §22 Z-1 | the accepting **and** rejecting fixtures owed for clauses 2, 3, 4 |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.
**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-04 (DR-071)** — (`08-open-questions-for-V.md`; Plan.md §6.4) —
  both halves answered: *(i)* an undercut **does** reduce the transmitted
  contribution of the support edge it targets — the ruled shape is
  **transmission-reduction**, computed in the pure core and recorded per edge;
  *(ii)* it **is** a third ruled producer of arrow strength, the `DR-062 OD-06`
  producer set being extended from two to three by the same ruling. Answer (c)
  — carrying the reduction outside `edge.strength` on `propagation_run` — was
  **not** taken. Clause 6 carries this; S2's entry criterion is satisfied.
- **RULED — Q-06 (DR-073)** — provenance-cluster collapse applies to **both
  polarities** (support **and** attack). A claim node's cluster key derives from
  the provenance of its evidence and the producing run/model-family; **a node
  with no resolvable key clusters alone**. So `strength_source =
  CLUSTER_COLLAPSE` is written on attack arrows too — the column's existence was
  never in question, and now neither is its population rule.
- **RULED — Q-08 (DR-075, amended by DR-076)** — a `pending` node **is** an
  unjudged interior node, and **placeholder arrows are live, real arrow
  endpoints**; the absent-endpoint error is reserved for genuinely foreign or
  deleted endpoints. DR-076 adds that the pending node is structurally connected
  to its parent from the moment it spawns and that its lifecycle must be
  observable live — an observability requirement carried by the event
  vocabulary (ADR-0008), not by this table.
- **RULED — Q-01 / Q-02 (DR-068 / DR-069)** — the kept UI sits in-repo with no
  fence, so the `Edge` shape's reachability to the kept UI is an ordinary
  in-tree dependency edge ([ADR-0016](ADR-0016-repository-layout-no-fence.md)).
