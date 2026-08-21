# ADR-0013 — Three authorization tiers on one handle

| Field | Value |
|---|---|
| **Status** | **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at **VG-01**. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. |
| **Source of record** | Plan.md rev 3, §5.2, with §5.1, §5.3, §5.6, §6.1 OQ-G5 and §6.6 UI-5 |
| **Label carried from the plan** | Plan.md §1 preamble: **SEAT-PROPOSAL throughout**. The authorization *model* itself is **RESOLVED-BY-PACK** at DR-066(1); the tiering is the seat's design. |

## Rulings folded in (PRE-04, 2026-08-06)

| Ruling | Q-nn | What it changes here |
|---|---|---|
| **DR-070** | Q-03 (AM-12) | **Asker = the requesting user/person.** **No separate authenticated-principal / session-scope model for now** — authorization and user credentials are **explicitly OUT OF SCOPE for this stage**; V2's existing `user_dev_token` vertical slice is **adopted as sufficient**. **Provisional simplification, not a design-away** (see clause 5). |
| **DR-094** | Q-25 (AM-5) | Risk tier: **the asker declares; deployment policy may RAISE but never lower.** `tier_source` provenance is recorded and printed as designed. |
| **DR-095** | Q-26 (C5) | "Kept component" = **kept SURFACE, rebuilt insides** — pages, canvas, drawers, badges and navigation stay; components are rebuilt inside as the flex rows require, each altered component approved at its mockup review (DR-064). Decides which surfaces render tier-1 material, not who may read it. |

## Context

**AC-56** splits what crosses the wire: the browser receives typed honesty
**projections**, while the complete fact bundle and the conformance record are
fetchable on demand through an **authorized inspection/replay endpoint** — the
same handle the replay law needs — with internal prompt material excluded from
the default view (DR-054; spec §12.6 S-22…S-24).

**AC-57** settles who may use that handle: **authorization is asker-scoped** —
the asker may replay their own answer's full record on demand, authorization
being their session's scope, with internal prompt material operator-only
(**DR-066(1)**). This closes the pack's open item on the authorization model
(Plan.md §6.1 OQ-G5, **RESOLVED-BY-PACK**).

Two further rules constrain what may reach the asker at all:

- **AC-44** — two tiers of ledger record: **raw tapes internal**, digest
  user-visible; **raw judge text never reaches a served item** (DR-027; manifest
  §8.3; charter S3).
- **AC-87** — sanitizing on the way out: re-validate every item, **strip raw
  judge output**, reduce debug detail to declared version fields or drop
  entirely, scrub every served reason string for secret markers and **drop
  rather than serve damaged**, copy optional scalars only when well-typed
  (manifest §9.2b).

The sharp case is the **conformance judge**. It is a model call, so Seam C and
AC-13 give it a `raw_artifact` row like any other. Left implicit, that row is
internal by AC-44's raw-tapes rule **and** asker-visible by DR-066(1)'s "full
record" — and both readings break something.

## Options considered

### Option A — two tiers: default projections and operator-only *(rejected)*

Rejected because the asker then loses a ruled entitlement: DR-066(1) gives the
asker their own answer's full record on demand.

### Option B — three tiers, routing the conformance judge's raw artifact to the asker tier *(rejected)*

Rejected because raw tapes would then reach a served surface through **the one
endpoint the asker is guaranteed** — breaching AC-44 and AC-87 at exactly the
point where the breach is least visible.

### Option C — three tiers, with the line drawn at the structured record *(chosen)*

`04-api-contract.md`'s `conformance_record` is a **distinct structured table**
(Plan.md §4.4), so the line can be drawn there: the asker gets the structured
record; the raw text of every model call, conformance judge included, is
operator-only.

## Decision

**Three payload classes, one handle shape, authorization evaluated once per
request.**

| Class | Contents | Who may read |
|---|---|---|
| **Default projections** | all nine honesty surfaces as typed fields; composed text or the components-only rendering; serve state + conformance outcome; every served number with its origin label and a provenance reference carrying a replay handle; the node set and the **edge set** | anyone authorized to read the answer |
| **Authorized record** *(tier 2)* | the complete fact bundle; the conformance judge's full record **meaning the structured `conformance_record`** — outcome, which R9 pass failed, the per-segment `JUDGED / SAMPLED_PASSED / NOT_SAMPLED` states, the judge's structured findings; and the recomputation trail for any served number — **the trail being the frozen typed inputs, the input/contract/content hashes, the reducer / contract / engine versions, the recorded arrow order, the cluster-collapse records and the arithmetic: sufficient to recompute, containing no raw model text** | the asker, in their own session's scope, for their own answer |
| **Operator-only** *(tier 3)* | internal prompt material; the raw text, provider metadata and request metadata of **every** model call — per-node judges, the composition model **and the conformance judge alike**; plus the internal debug facet | operator scope |

Four rules ride with the tiering, and a **fifth clause** is folded in below from
DR-070:

1. **"Show me why" is a property of the contract, not a per-screen feature**
   (ui §4 row 2): every number's provenance carries the **same handle shape**.
2. **Authorization is evaluated once per request** — against
   (session → asker → answer ownership) for tier 2, and against operator scope
   for tier 3 — resolved against `GET /v1/session`'s principal (AC-57).
3. **SSR is a caller, never a privileged one** (Plan.md §5.1, §6.6 UI-5): the
   SSR path forwards the asker's session scope and receives exactly what the
   browser would. There is no service-identity read path for asker-scoped
   material, and operator-scoped material is not reachable from SSR at all. The
   same address never returns different content for the same principal.
4. **Errors distinguish authentication from authorization scope.** The typed
   error taxonomy in `packages/contract` carries **typed auth failure
   distinguished from typed authorization-scope failure** (ui §5 W4), and
   nothing is ever string-sniffed — the interface never parses prose to learn a
   fact (AC-63; Plan.md §5.6).

### 5. Who the asker is — the DR-070 simplification, and its provisional label

**RULED (DR-070): the asker is the requesting user/person.** There is **no
separate authenticated-principal / session-scope model for now** —
**authorization and user credentials are explicitly OUT OF SCOPE for this
stage** — and **V2's existing `user_dev_token` vertical slice is adopted as
sufficient**.

What that does to rule 2 above: **tier 2's evaluation still happens once per
request, and its subject is the asker.** The chain rule 2 stated as
*(session → asker → answer ownership)* collapses at its head for this stage —
the session is not a separately modelled principal, so the evaluation is
*requesting user → answer ownership*, resolved through the adopted
`user_dev_token` slice. **Tier 3 is unchanged**: operator scope is not a user
scope, and none of the three payload classes moves.

**This is a deferral, not a design-away, and DR-070 says so in terms:**
*authorization/credentialing deferred, not designed away — the simplified model
is provisional and may need real principal/session separation before a
multi-tenant or credentialed launch.* DR-070 attaches an explicit instruction:
**flag it for quality-charter A5.2-style revisit language when built.** So:

> **A5.2-STYLE REVISIT — recorded, not implied.** The asker model is
> **provisional**. Its recalibration trigger is a **multi-tenant or credentialed
> launch**; at that trigger, real principal/session separation is revisited
> before shipping. The revisit is owed an owner and a sign-off route in the same
> shape charter A5.2 gives provisional register rows — a **column, not a
> convention** (ADR-0011 clause 1).

**What this ADR does *not* rule, deliberately:** whether `asker_id`,
`session_id` and `caller_scope` remain three separately declared fields is
`02-data-model.md`'s (ticket PRE-02). The architectural requirement this ADR
does state is the consequence of "provisional": **the separation must remain
re-introducible without re-architecture** — the tier-2 handle evaluates one
subject today, and adding a principal must not move the tier boundaries, the
payload classes or the handle shape.

**The fixture this ADR owes**: `/v1/answers/{id}/inspection` asserts that **no
`raw_text` appears anywhere in the tier-2 payload** (`06-test-strategy.md`).

**The debug facet has an address** — `GET /v1/answers/{id}/inspection/debug`,
tier 3, operator scope — attached only on the successful path, absent when not
requested, and **explicitly not part of the stable wire contract**. Giving it an
address is what stops it being a shipped unit with no entry point: a charter G1
orphan on the BLOCKING never-called list the day the serve slice lands
(AC-77; ADR-0010).

Status: **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at VG-01.

## Consequences

**Accepted:**

- DR-066(1)'s entitlement is delivered in full without any raw tape reaching a
  served surface — the two obligations that appeared to conflict are both met,
  because the structured record is a different artifact from the raw one.
- The replay handle the asker uses is **the same handle the replay law needs**
  (AC-56), so there is one inspection mechanism rather than a user-facing one
  and an internal one (AC-85).
- Authorization stays a per-request, per-class decision — which is what made the
  resource-shaped encoding preferable to a per-field query language (ADR-0002)
  and what keeps the event stream's payload grade decidable (ADR-0008).

**Costs and risks:**

- Tier 2 contains enough to recompute a number. That is the intent (AC-06), and
  it means the recomputation trail must be curated: **sufficient to recompute,
  containing no raw model text**. A trail assembled by "include everything
  frozen" would leak raw artifacts into tier 2.
- The debug facet is deliberately outside the stable contract, so it may change
  without a version bump. Any consumer that depends on its shape has taken on
  that risk knowingly.
- Tier boundaries are only as good as the sanitizer. AC-87's obligations —
  strip, scrub, **drop rather than serve damaged**, copy optional scalars only
  when well-typed — are owed on the way out of every tier, not only tier 1.

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-56 — wire boundary; authorized inspection/replay endpoint | DR-054; spec §12.6 S-22…S-24 | the three payload classes; the bundle and record behind the handle |
| AC-57 — asker-scoped authorization | DR-066(1) | tier 2 evaluated against session → asker → answer ownership |
| AC-44 — raw tapes internal; raw judge text never served | DR-027; manifest §8.3; charter S3 | every model call's raw text in tier 3, conformance judge included |
| AC-87 — sanitizing on the way out | manifest §9.2b | strip / scrub / drop-rather-than-serve-damaged on the serve path |
| AC-63 — every number arrives with origin and replay handle | ui §1.1 clauses 2 and 4 | the provenance reference and replay handle on every served number |
| AC-06 — replay from frozen records, no model in the path | DR-034; spec §12.5 S-17 | the tier-2 recomputation trail: frozen inputs, hashes, versions, order |
| AC-60 — one transport | ui §1.4 L5 | one front door; SSR never privileged |
| AC-77 — no orphaned modules | DR-047 clause 4; charter §5, A4.2 | the debug facet given a named, reachable address |
| AC-58 — the nine honesty surfaces are canonical | DR-048; spec §12.6; charter A2.7 | all nine ship as typed fields in the default class |
| AC-85 — one behaviour, one place | charter A3.1, A3.6 | one handle shape, one authorization evaluation point |
| **DR-070** — asker = the requesting user/person; credentials out of scope this stage | ARCH-V3-R1 ledger DR-070 (Q-03) | clause 5, with the A5.2-style revisit recorded |
| **DR-094** — the asker declares the risk tier; policy may raise, never lower | ARCH-V3-R1 ledger DR-094 (Q-25) | `tier_source` recorded and printed; the API asserts no ownership |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.
**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-03 (DR-070)** — the asker is **the requesting user/person**. No
  separate authenticated-principal or session-scope model for now;
  authorization and user credentials are **out of scope for this stage**; V2's
  `user_dev_token` vertical slice is adopted as sufficient. Clause 5 carries it,
  **with its provisional label and A5.2-style revisit note intact** — DR-070 is
  filed FINAL *as a provisional simplification*, which is a ruling about scope,
  not a claim that the modelling question is closed forever. The confidentiality
  consequence Plan.md named (the `EXACT_QUESTION` memory tier and per-asker
  boundaries) now has one subject rather than three, which is what makes the
  simplification safe *at this stage* and what the revisit trigger exists to
  re-examine.
- **RULED — Q-25 (DR-094)** — **the asker declares the risk tier; deployment
  policy may RAISE it but never lower it.** `tier_source` provenance is recorded
  and printed as designed, and the API still asserts no ownership of the value
  (Plan.md §5.3). Consistent with DR-078's user-facing tier dials and with
  DR-070's asker ruling.
- **RULED — Q-26 (DR-095)** — "kept component" = **kept SURFACE, rebuilt
  insides**. It decides which surfaces render tier-1 material, not who may read
  it, so no tier boundary moves; the S14 rebuild happens in-tree under
  [ADR-0016](ADR-0016-repository-layout-no-fence.md).
