# ADR-0010 — The orphan-audit mechanism, and how AC-61's consumer direction is decided

> **Title change on the record.** This ADR was authored as *"The orphan-audit
> mechanism, and the consumer manifest"*. **DR-069 voids the consumer manifest**
> — there is no fence, so there is no boundary for an artifact to cross. The
> mechanism it named is replaced, not merely deleted; see the *Rulings folded
> in* table and Decision clause **G1**.

| Field | Value |
|---|---|
| **Status** | **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at **VG-01**. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. |
| **Source of record** | Plan.md rev 3, §2.7 (orphan-detection row) and §2.6 (the consumer manifest, **voided by DR-069**), with §5.7, §6.6 UI-11 and §6.9 items 2–3 |
| **Label carried from the plan** | **SEAT-PROPOSAL** — §2.6/§2.7 were part of the plan's stack proposal; accepted wholesale at DR-098, with §2.6's fence-cost mechanism voided at DR-069 |

## Rulings folded in (PRE-04, 2026-08-06)

| Ruling | Q-nn | What it changes here |
|---|---|---|
| **DR-068 + DR-069** | Q-01, Q-02 | **NO FENCE.** The kept UI is a plain in-repo package. The **consumer-manifest mechanism is not required** — and is **voided, not made optional** (an optional manifest is its own G5 orphan). **G1 is rewritten**: AC-61's consumer direction is decided by an **intra-repo static type-graph pass**, because there is one repository and one type graph. Recorded at [ADR-0016](ADR-0016-repository-layout-no-fence.md); routing resolved at ticket **PRE-01**. |
| **DR-097** | Q-28 | An **unratified register row is OUTSIDE charter clause 4's orphan reach** — register rows are **data, not code**; the never-called list stays about **executable units**; AC-74's ratify-before-production gate governs the register. **Plus V's amendment: an advisory (non-blocking) audit reports any key no code ever reads after full build.** New clause **G6**. |
| **DR-088** | Q-19 | Auto-activation **counts as shipped dark** — the charter's not-shipped rule wins. The citation hard-kill gate is **written when the quote matcher validates, never shipped inert**; **NOT-SHIPPED attestation** in the acceptance bundle until then. Confirms this ADR's AC-78 consequence rather than changing it. |

## Context

Two rules make dead code a release-blocking defect rather than a tidiness
concern:

- **AC-77** — a shipped unit (module, function, endpoint, table, migration,
  config flag, prompt) is **live** only if reachable from a **named** entry point
  and actually called on a real run. The never-called list ships with every
  release and **blocks** it; exemptions are configuration-class only, granted by
  V alone, dated. Dead cost is an orphan even when reachable and called
  (DR-047 clause 4; charter §5, G1/G2/G5, A4.2, VR-4).
- **AC-61** — bidirectional no-orphan: no served field without a consumer, no
  consumer without a served field, no emitted event without a declared consumer.
  **Both directions of drift are defects** (DR-047 clause 4; ui §1.4 L6, §1.3 E1).

The interface contract records the non-interface half of this rule as unowned
(register row D-1). Plan.md §6.6 UI-11 disposes it **RESOLVED-BY-PACK** — the
charter already owns the rule and names the unit — and **architecture claims the
mechanism**. This ADR is that mechanism.

One complication was structural rather than technical, and it is **now
dissolved**. As authored, this ADR assumed the clean-room barrier
(AC-81 · manifest §14; Plan.md FLAG-4) would put the kept interface in a
separate checkout, costing the single-type-graph property ADR-0001 relies on and
leaving half of AC-61 decided nowhere. **DR-069 ruled NO FENCE**: one
repository, one checkout, **one type graph**. The complication the manifest
existed to solve does not arise.

## Options considered

### Option A — a manual inventory reviewed at release *(rejected)*

Rejected because charter G1 wants the **entry-point list it walked** published as
an artifact (charter A4.5), and because a manual list cannot answer AC-61's
consumer direction across a checkout boundary at all.

### Option B — one reachability check *(rejected)*

Rejected because AC-77 asks three different questions and one mechanism answers
only the first: reachability from an entry point, actual invocation on a real
run, and dead cost. The third — "a unit whose output no served surface, no
ledger row and no downstream decision consumes" — is **not statically
decidable**, so a single static check would silently under-report it.

### Option C — "reported against" the fence, without a cross-boundary artifact *(rejected)*

Rejected in Plan.md §2.6 in terms: **"reported against it" is not a mechanism**.
Without an artifact crossing the boundary the failure is silent and D4-shaped —
a field is added to the Answer resource and served, no consumer is ever written,
the engine build passes (it has a producer), the interface build passes (it
consumes what it consumes), and the **BLOCKING** never-called list, assembled in
the engine repository, shows nothing.

### Option D — three named mechanisms plus a required cross-boundary consumer manifest *(chosen as authored; the manifest half is VOIDED by DR-069)*

### Option E — three named mechanisms over one intra-repo type graph *(the ruled shape)*

Not an option this seat could offer: it presupposes **Q-02 = no fence**, which
was V's to rule and which V ruled at **DR-069**. Options A and C stay rejected
for the reasons above — the failure mode Option C describes is the one an
*optional* manifest would reintroduce, which is why clause G1 below **removes**
the manifest rather than making it best-effort.

## Decision

**`tools/orphan-audit` implements three named mechanisms, not one** — plus, under
DR-097, one advisory lane over the register. There is **no cross-boundary
artifact**, because under DR-069 there is no boundary.

### G1 — reachability *(static)*

A static walk of the program, the contract field inventory and the event
registry from a **published entry-point list** — **over the single, whole-repo
type graph**. Both directions of AC-61 are decided by that one pass:

- **producer → consumer**: a served field or emitted event with no reference in
  the kept UI package (or any other consumer in the tree) is a defect;
- **consumer → producer**: a reference to a contract field or event name that
  `packages/contract` does not declare is a defect.

**Why this is a mechanism and not a hope.** The kept UI package sits inside the
same workspace, is compiled by the same toolchain against the same
`packages/contract` declaration, and is walked by the same pass — so a drift in
either direction fails a build that already runs, with no artifact to generate,
pin, version or forget to require. ADR-0001's single-type-graph property, which
the fence would have split, is the mechanism here (ADR-0016 clause 5).

**The consumer manifest is voided, not optional.** `consumer-manifest.json` is
**not written, not emitted, and not consumed**. An optional manifest — generated
but required by no build — is a generated artifact with no consumer: charter
**G5** dead cost, an orphan on the day it lands, and precisely the class of
defect this ADR exists to find (DR-069; AC-77).

### G2 — call coverage *(runtime; this is what BLOCKS)*

A runtime call tape from the acceptance run, yielding the **never-called list**.
G2's output is what blocks the release (charter A4.2, VR-5).

### G5 — dead cost *(reviewed manual audit; ADVISORY)*

A reviewed manual audit under charter A4.1's **advisory** class, because dead
cost is not statically decidable. It carries the `measurement_lane` exemption:
spend whose only consumer is the scorecard, **with the consumer named on the
lane and its output demonstrably reaching the scorecard**. G5's advisory status
is charter VR-5's own classification, not a softening introduced here.

*(Charter §9 item 3 is disposed **RESOLVED-BY-PACK** in Plan.md §6.9: both
authorities apply at different scopes. `tools/orphan-audit` **does** owe a
dead-check detector, at advisory force, while the named G3 subjects and the
never-called list **block**.)*

### G6 — the register-key lane *(advisory, added by DR-097)*

**An unratified register row is OUTSIDE charter clause 4's orphan reach.**
Register rows are **data, not code**; the never-called list stays about
**executable units**, and **AC-74's ratify-before-production gate** is what
governs the register. So the skeleton's unfilled keys are **not** entries on the
**BLOCKING** never-called list, and no dated V exemption (charter A4.3) is owed
for them.

**Plus V's amendment, and it is not optional:** the audit runs an **advisory,
non-blocking** lane that **reports any register key no code ever reads after a
full build**. Stale rows are therefore *noticed* without being turned into
exemption paperwork. The lane is advisory in the same sense G5 is — it reports,
it does not block — and it is a **named lane with an owner**, so it is not
itself a G5 orphan. (DR-097; Q-28; slice **S15**, run from S0 onward like the
rest of the audit.)

### What no CI rule can enforce, after DR-069

As authored, this section said the fence's structural rule 4 prevents **code**
coupling and nothing more, because manifest §14's violation is a **reading**
violation: *"a single participant who reads V2 source and then writes V3's
implementation has voided DR-003 regardless of intent."* **DR-069 removed the
fence entirely**, so the position is now simpler and worse, and it is stated
plainly rather than softened:

- There is **no checkout separation**, **no import fence** and **no CI rule**
  standing between V2-derived source and the organ implementers.
- **DR-003's clean-room mandate is carried by manifest §14's role assignment
  alone — an honour system, not a checked barrier.** V chose this explicitly
  after the cost was priced, and DR-069 records it as an **accepted trade-off,
  not a gap — "do not re-raise as an open question."**
- Any lint, CI rule or checklist still asserting an engine↔interface import
  fence must be **removed**, not weakened: a partial fence is Option C's
  "reported against it" shape wearing a barrier's clothes.

The full record is [ADR-0016](ADR-0016-repository-layout-no-fence.md).

### One further clause, from the charter's own contradiction list

Charter §9 item 2 is disposed **RESOLVED-BY-PACK** (Plan.md §6.9): charter A1.3
(`RATIFIED(DR-039)`) holds that no proxy metric may stand in for V's judgment.
The architecture consequence, stated so it is checkable: **`tools/acceptance-bundle`
emits no aggregate quality score, and no CI gate computes one.**

Status: **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at VG-01.

## Consequences

**Accepted:**

- AC-61 is decided in both directions **inside one type graph**, by a pass that
  already runs — not by a generated artifact and not by a review opinion.
- The exemption path stays narrow and attributable: **configuration-class only,
  granted by V alone, dated** (AC-77 · charter A4.3) — and under DR-097 the
  register's unfilled keys never enter that path at all.
- AC-78's "deferred gates are not shipped dark" gains an enforcement partner:
  where the pack says a gate does not ship, the audit finds nothing to report
  because nothing is written — and the acceptance bundle carries a **NOT-SHIPPED
  attestation** instead (Plan.md §6.7, §8 S6). **DR-088 confirms this reading**
  for the sharp case: auto-activation *counts* as shipped dark, the citation
  hard-kill gate is **written when the quote matcher validates, never shipped
  inert**, and the attestation stands until then.
- The audit runs **from S0 onward** and its never-called list is reviewed at
  every slice boundary, not only at the launch bundle (Plan.md §8 rule (ii)) —
  a module without a caller is an orphan **on the day it lands**.

**Costs and risks:**

- ~~The consumer manifest is one more moving part.~~ **Withdrawn under DR-069**:
  the manifest does not exist, the type graph is not split, and Plan.md §6.10
  AQ-3's priced cost is not paid. What is paid instead is DR-069's own accepted
  cost — **DR-003 is unenforced** — which is a clean-room cost, not an
  orphan-audit one, and is carried at ADR-0016 rather than hedged here.
- G5 is advisory, so a dead-cost finding does not block. That is the charter's
  classification (VR-5), not a choice made here, and it means dead cost is
  caught by review rather than by CI. **G6 is advisory for the same reason**, by
  V's own amendment at DR-097.
- **The "reported against it" failure mode migrated rather than vanished.** With
  no required cross-boundary input, the thing that must not be optional is now
  **G1's whole-repo walk**: an audit configured to skip the kept UI package, or
  to treat an unresolvable reference as "not my package", has reintroduced
  Option C exactly. The observable difference is that the walk covers **every
  package in the workspace**, kept UI included.
- **DR-097 narrows what the BLOCKING list contains**, and a builder must not
  widen it back: an unread register key is an **advisory G6 report**, never a
  never-called-list entry. The opposite reading would put the entire unratified
  register skeleton on the blocking list at S15.

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-77 — no orphaned modules; never-called list blocks | DR-047 clause 4; charter §5, G1/G2/G5, A4.2, VR-4 | G1 + G2 + G5, with G2's list blocking; **G6 advisory over the register (DR-097)** |
| AC-61 — bidirectional no-orphan | DR-047 clause 4; ui §1.4 L6, §1.3 E1 | the contract field inventory walked with the whole repo in **one type graph** (DR-069) |
| AC-81 — the clean-room role split is binding | DR-003, DR-033; manifest §14 | **no structural barrier** under DR-069 — manifest §14's role assignment alone, honour-system, stated plainly (ADR-0016) |
| **DR-097** — unratified register rows are outside charter clause 4's orphan reach | ARCH-V3-R1 ledger DR-097 (Q-28) | G6: the never-called list stays about executable units; the advisory lane reports unread keys |
| **DR-088** — auto-activation counts as shipped dark | ARCH-V3-R1 ledger DR-088 (Q-19) | the NOT-SHIPPED attestation stands until the quote matcher validates |
| AC-59 — no adapter | DR-048; spec §12.6 | one contract declaration, pinned and consumed; structural rule 2 |
| AC-78 — deferred gates not shipped dark | DR-020 knobs 7–8; charter §5.2; spec §22.1 | NOT-SHIPPED attestations in place of unfireable code |
| AC-76 / AC-39-adjacent — no invented measurements; no proxy for V's judgment | DR-039; charter A1.3 (`RATIFIED(DR-039)`) | no aggregate quality score emitted or computed |
| AC-85 — one behaviour, one place | charter A3.1, A3.6 | one audit tool owning all three mechanisms |
| AC-79 — gates shown to fire both ways | DR-063 VR-1/VR-5; spec §22 Z-1 | the audit's own gates are subject to the same discipline |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.
**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-28 (DR-097)** — an unratified register key is **not** an orphan:
  register rows are data, not code, and charter clause 4's reach is executable
  units. **None** of the skeleton's unfilled keys is on the BLOCKING
  never-called list, and none needs a dated exemption. V's amendment adds the
  **advisory** register-key lane (G6). The never-called list's contents at S15
  are therefore defined.
- **RULED — Q-01 / Q-02 (DR-068 / DR-069)** — kept UI source **may** be carried
  in, and there is **NO FENCE**. The consumer manifest crosses no boundary
  because there is none; it is voided. G1 walks one type graph
  ([ADR-0016](ADR-0016-repository-layout-no-fence.md)).
- **RULED — Q-19 (DR-088)** — auto-activation **counts as shipped dark**; the
  charter's not-shipped rule wins. "Auto-activates" describes the activation
  event only: the citation hard-kill gate is **written when the quote matcher
  validates, never shipped inert**, and the acceptance bundle carries the
  **NOT-SHIPPED attestation** until then. Charter §9 contradiction 6 is
  resolved.
