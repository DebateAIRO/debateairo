# ADR-0014 — Segment-addressed composed text, and the eviction carrier

| Field | Value |
|---|---|
| **Status** | **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at **VG-01**. See [README](README.md#decision-status-across-the-set). |
| **Date** | 2026-08-05 |
| **Proposed by** | ARCH-V3-R1 / C4 lane 2 (architecture seat). **Accepted by V at DR-098 (VS-1)**; rulings DR-068..DR-097 folded in by PROG-V3-R1 / PRE-04, 2026-08-06. |
| **Source of record** | Plan.md rev 3, §4.4 (`composed_text`, the eviction rule clauses 1–4, `served_number`), with §6.6 UI-4 and §8 rule (iii) |
| **Label carried from the plan** | Plan.md §1 preamble: **SEAT-PROPOSAL throughout**. |

## Rulings folded in (PRE-04, 2026-08-06)

| Ruling | Q-nn | What it changes here |
|---|---|---|
| **DR-082** | Q-14 half (i) | The band rule is a **second, independent gate** beside DR-044 (Q51)'s three blocking gates — **not a restatement**. **`band_ceiling {label, basis}` ships on the Answer**, computed from the **load-bearing nodes' way-of-knowing distribution**. New **clause 7**. |
| **DR-086** | Q-14 half (ii) | When the way-of-knowing ceiling gate fires it **CAPS the confidence band** — the answer serves, cannot reach the top band, and **wears its ceiling label visibly**. Mirrors DR-014's cap + label + recorded lift-path pattern. **Never silently blocks.** Serve order = the four gates **plus this cap**. |
| **DR-079** | Q-11 (AM-1) | The **sentence** sense of load-bearing is ruled, so clause 1's segment flag has a **populating rule**, not just a carrier: *a sentence is load-bearing iff it asserts a fact drawn from a load-bearing node or states a served number*. |
| **DR-078** | Q-10 (OQ-G3) | The hard composition-bundle budget — one of AC-53's three compose-time terminals — is an **independent register row**, **user-facing as an asker-selected tier** ("low / medium / high"), with per-tier values in the register (ADR-0011). |
| **DR-074** | Q-07 (A-8) | Narrows **one reason** on clause 4's discriminant, not a member: `WITHHELD(no operator declaration)` (AC-22 / DR-040 Q45) is **deleted** because the deployment operator row is now mandatory. **`WITHHELD(strict-and conjunct unjudged or abstained)` (AC-26 / DR-062 `OD-05`) is LIVE**, so the member stays reachable and the discriminant keeps three members. Carrier text: `02-data-model.md` §7.4. |

## Context

V3 does not render an answer directly from data. **AC-51** fixes four steps in
order: the machine assembles all computed facts into one structured bundle → one
composition model writes the text → a second model judges text↔facts conformance
→ the machine enforces the verdict. **Pure render was rejected** (DR-044; spec
§12.1 S-1…S-3).

That creates a text artifact the rest of the system must be able to talk about
precisely, and three obligations require exactly that:

- **DR-060(a)** gives the conformance record **three per-segment states** —
  `JUDGED / SAMPLED_PASSED / NOT_SAMPLED` — but the pack supplies **no
  sentence-addressing model** (Plan.md §6.6 UI-4).
- **AC-54** requires oversized bundles to compose in multiple passes **ordered by
  load-bearing priority**, with honesty fields machine-injected outside the
  composition model's discretion (DR-058; spec §12.1b S-9a–c).
- **AC-12** evicts a component number that fails replay with a typed
  `MISSING-NUMBER` mark, the rest of the answer serving with a `DEFECT` badge
  (DR-059; spec §12.1c S-9e).

Eviction is where the pressure concentrates. The composed text was written from
a bundle in which every number was present, and it passed conformance against
that bundle — **and the conformance verdict is a frozen input artifact, never
regenerated** (AC-07 · DR-060(b)). So prose reciting an evicted number would
otherwise keep serving: the reader would see a number with no origin and no
replay handle, which **AC-63** states as an absolute ("or it does not arrive"),
and the conformance record would still attest that segment as JUDGED against a
fact that no longer exists — **AC-44** read from the other end ("no served
sentence may imply a check the ledger says did not run").

## Options considered

### Option A — composed text as an opaque string *(rejected)*

Rejected three times over: DR-060(a)'s three states cannot be expressed per
sentence, AC-54's load-bearing composition order has nothing to order, and
eviction cannot locate the prose that recites the evicted number.

### Option B — write the new segment states into the conformance record on eviction *(rejected)*

This was the round-1 wording and Plan.md records it as **two defects**:

1. It **mutates a frozen replay input**. AC-07 / DR-060(b) make the serve
   decision replay as stored data with the conformance verdict an input artifact
   never regenerated; if eviction edited its per-segment states, a ceremony run
   after an eviction would replay a **different serve decision than the one
   served**. Plan.md §4.1's standing rule 1 independently forbids the
   unpreserved mutation.
2. It **mints a fourth per-segment state**. The vocabulary is the ruled three,
   and a new typed state may only be minted where spec §12.3's authority allows
   (AC-65 · DR-051; S-13).

### Option C — a part-composed / part-components hybrid answer *(rejected)*

Rejected because `RULED(DR-049, DR-057)` and ui §4.0 give exactly **two**
answer-surface states — composed, or components-only + `DEFECT` — and the
interface renders those two. A hybrid is a third state with no ruled rendering,
and charter §5.2 row 12's fixture would be written against a surface the
interface contract does not admit.

### Option D — segment addressing plus an append-only suppression projection *(chosen)*

## Decision

### 1. Composed text is an ordered list of typed segments with stable ids

*(architecture term: **segment**.)* Each segment carries its **load-bearing
flag** and a **`segment → served_number` reference set** listing every number the
segment asserts. This is what lets the conformance record express DR-060(a)'s
three states per segment, and what orders DR-058's multi-pass composition. The
composed text is **display only** (AC-63) — no fact is learned by parsing it.

**What populates the flag, after DR-079.** The flag shipped as a carrier because
the sentence sense of "load-bearing" was V's. It is now ruled: the non-node
senses **project from the charter's node definition** — **a sentence is
load-bearing iff it asserts a fact drawn from a load-bearing node or states a
served number**; a *claim* is load-bearing iff its node is; an *unknown* is
load-bearing iff removing it would change the verdict or band. The segment flag
therefore has a **derivation**, and conformance sampling has something real to
sample (Q-11 / DR-079; slice S5).

### 2. The conformance record is never written after it is sealed

Its per-segment vocabulary stays the ruled three, with **no fourth member minted
here** (AC-65, S-13).

### 3. Suppression is a separate, append-only serve projection

`segment_suppression {answer_id, answer_version, segment_id,
evicted_number_ref, at_seq}`, written when a served number transitions to
`EVICTED(MISSING-NUMBER)` and keyed to it. The **served** per-segment state is
the **derived join** of the frozen conformance record and the suppression rows —
AC-88's "status is derived, never asserted", applied here (ADR-0007). **The
replay ceremony reads the conformance record without the overlay**, because the
overlay post-dates the serve decision it is replaying.

**Its named served consumers, so the rows are not orphans** (AC-77; the
never-called list is BLOCKING): the **tier-2 authorized record**
(`GET /v1/answers/{id}/inspection`, where the suppression rows say *which*
segments the eviction withdrew and why) and the **execution-ledger digest**
(`GET /v1/answers/{id}/ledger-digest`, AC-44 — the degradation is a thing that
happened, and the digest is where the reader learns it happened). Under clause 5
there is no served composed text after an eviction, so without these two
consumers named, the rows would be charter G5 dead cost on the day they land.

### 4. One append-only stream carries both status transitions

Eviction causes exactly two state changes, and Seam D classes a served number as
a **frozen artifact**, so neither may be an in-place update.
**`served_number_event {answer_id, answer_version, number_ref, status ∈ {PRESENT,
EVICTED, WITHHELD}, reason, at_seq}`** carries both. The number's current status
is derived from its latest event; the **answer's current serve state is derived
too** — an answer with at least one `EVICTED` event for its version projects as
**components-only + `DEFECT`**, which is clause 5 expressed as a projection
rather than as a write.

**Nothing is overwritten**: the original served-number rows, the composed text,
the fact bundle and the conformance record all stay exactly as sealed. Version
selection on reads is ADR-0007's clause 3 — latest version with its current
projection by default, `?version=` for the sealed artifacts, and the ceremony
always reads the sealed form. So the historical answer replays byte-identically
while the live read shows the degradation: **the two questions eviction raises,
answered by one carrier.**

*(The same discriminant covers the other two number states:
`PRESENT | EVICTED(MISSING-NUMBER) | WITHHELD(reason)`, where `WITHHELD` is the
withheld parent. All three are distinct from **absent**, which is not
representable in a payload — AC-63.)*

**Which `WITHHELD` reason, after DR-074.** The member had two independent
producers, and DR-074 removed exactly one of them:

- **`WITHHELD(no operator declaration)` — AC-22 / DR-040 Q45 — is DELETED.**
  DR-074 makes the deployment operator row **mandatory**, so the resolution
  chain cannot terminate undeclared and this *configuration* reason has no
  reachable producer. It is removed rather than fenced (AC-77 · charter VR-4;
  ADR-0011 clause 8).
- **`WITHHELD(strict-and conjunct unjudged or abstained)` — AC-26 / DR-062
  `OD-05` — is LIVE and untouched.** **Strict-and has no identity element**
  (manifest §4.2b): every declared conjunct must be judged, and where any
  conjunct is unjudged or abstained the parent emits **no number** and its
  components are served. Treating a missing conjunct as certainly true would be
  D1's failure mode in a new costume.

So **the member stands and is reachable**; DR-074 deleted a **reason**, not a
member, and the three-member discriminant is unchanged. `FX-SRV-06` (the number
slot's three states) is unaffected. The carrier text is `02-data-model.md` §7.4,
which scopes `WITHHELD` to exactly the AC-26 limb.

### 5. Eviction transitions the whole answer to components-only + `DEFECT`

The two-state reading satisfies DR-059's "the rest serves" directly: the
verified facts, badges and node graph serve, the evicted number carries its
typed missing-number mark, and **one number is lost, never the answer**.

### 6. The fixture asserts three things

Alongside charter §5.2 row 12's own assertions: **(a)** the frozen conformance
record is **byte-identical** before and after the eviction; **(b)** the
**historical replay** of the sealed answer version still passes, reading the
sealed artifacts without the overlay; **(c)** the **current projection** of that
answer reads as components-only + `DEFECT` with the evicted number carrying its
typed missing-number mark.

### 7. The band ceiling ships on the Answer, and it caps rather than blocks (DR-082 + DR-086)

Folded in from V's two-part ruling on Q-14, because the Answer is this ADR's
artifact and the ceiling rides on it.

**(a) It is a second, independent gate — not a restatement.** The band rule sits
**beside** DR-044 (Q51)'s three blocking gates, not inside them. The serve chain
is therefore **four machine-ordered gates plus this cap** (R9 → Q53 →
conformance → Q51, then the band cap), and a builder who folds the ceiling into
Q51 has deleted a gate.

**(b) `band_ceiling {label, basis}` ships on the Answer.** `basis` is the
**way-of-knowing distribution over the load-bearing nodes** — which is why it
lands here: "load-bearing" is clause 1's flag, now populated by DR-079, and the
distribution is computed from the nodes the answer actually leans on.
`04-api-contract.md` §9.5 carries the wire shape.

**(c) When it fires, it CAPS. It never silently blocks.** The answer **serves**;
it **cannot reach the top confidence band**; it **wears its ceiling label
visibly**. This deliberately mirrors DR-014's cap + label + recorded lift-path
pattern — the same shape the maker-inventory transient path uses
([ADR-0015](ADR-0015-deployment-maker-inventory.md)), so there is one degradation
idiom in the system rather than two.

**(d) The vocabulary and the cut points are register rows.** The label
vocabulary and the band cut points are **V's at DR-023** (AC-66; charter VR-2;
sitting **VG-02**). **No label string and no cut point is stated here**
(AC-76 · DR-039).

*(Interaction with clause 5, stated so nobody has to derive it: an eviction
transitions the answer to components-only + `DEFECT`; a fired band ceiling caps
a **serving** answer. They are different degradations on different axes and
neither consumes the other — the band ceiling is not a fourth compose-time route
any more than eviction is.)*

Status: **ACCEPTED wholesale via DR-098 (VS-1)** — no per-technology ratification row exists; itemized confirmation pending at VG-01.

## Consequences

**Accepted:**

- DR-060(a)'s three states become expressible, so "judged" and "not sampled" are
  **two different served facts** rather than one hedge.
- AC-54's multi-pass composition has a priority order to compose in, and the
  machine-injected honesty fields sit outside any segment's discretion.
- AC-12's eviction has a carrier that mutates nothing frozen.
- **The load-bearing flag is no longer a carrier waiting for a rule.** DR-079
  supplies the projection, so clause 1's flag is derivable and Plan.md §8 rule
  (iv)'s "carriers but not the behaviour" restriction is discharged for S5.
- **The band ceiling has a home on the Answer** (clause 7), and it degrades in
  the same idiom as DR-014's transient cap — one degradation pattern across the
  system, not two.

**Costs, including one the plan prices explicitly for V:**

- **Evicting a single component number withdraws the whole composed text.**
  Plan.md §8 rule (iii) records this deliberately: DR-059's "one number is lost,
  never the answer" is satisfied, and this is the only reading consistent with
  ui §4.0's two states — **but the pack never ruled it, and the
  reading-experience cost is a consequence V may want to see.** Recorded here
  because an ADR that hid it would be hiding the decision's real price.
- Components-only may be **entered at compose time** only by AC-53's three ruled
  routes (`max_recompose = 2`, the failed verdict-R9 pass, and a bundle past the
  declared hard composition budget — DR-049, DR-057, DR-058). A **post-serve**
  eviction transitions an already-served answer to the same surface, which is a
  **degradation of a served answer rather than a fourth compose-time route.**
  Without that distinction a builder would conclude eviction must not reach
  components-only, and would be left with only the two shapes clause 5 rejects.
- Segment ids are stable and load-bearing: they are referenced by the
  conformance record and by suppression rows, so they are frozen alongside the
  text and not free to renumber.
- **`WITHHELD` now carries one reason where it carried two, and a builder must
  not over-delete.** DR-074 removed the AC-22 / Q45 *configuration* reason; the
  **AC-26 / `OD-05` strict-and reason is live**, so the member is reachable and
  the discriminant keeps three members (clause 4's producer note). The risk here
  is a plausible misreading — "the withhold machinery is dropped" taken as
  licence to drop `WITHHELD` itself, which would delete AC-26's **ruled**
  behaviour along with AC-22's dead one and put an unmeasured conjunct back on
  the D1 path. `FX-SRV-06` is the fixture that catches it.
- **The hard composition budget is now asker-selected** (DR-078: an independent
  register row, surfaced as a "low / medium / high" tier the asker picks per
  run). AC-53's third compose-time terminal therefore fires at a threshold the
  *user* chose, which is a behaviour change in *when* components-only is entered
  — not in *what* it is. The per-tier values are register rows V ratifies at
  DR-023/VG-02; **none is stated here** (AC-76).

## Constraints served

| Constraint | Pack citation (as Plan.md carries it) | Carried in this decision by |
|---|---|---|
| AC-51 — four-step serve composition; pure render rejected | DR-044; spec §12.1 S-1…S-3 | segments are the output of the composition step, judged by the next |
| AC-07 — the serve decision replays as stored data | DR-060(b), DR-063 VR-3; charter S1 | the conformance record is never written after sealing |
| AC-12 — replay eviction with a typed `MISSING-NUMBER`, rest serves with `DEFECT` | DR-059; spec §12.1c S-9e | `served_number_event` + `segment_suppression` + the derived serve state |
| AC-54 — compose size law; honesty fields machine-injected | DR-058; spec §12.1b S-9a–c | the load-bearing flag orders multi-pass composition |
| AC-53 — `max_recompose = 2` and its terminals | DR-049, DR-057, DR-058; spec §12.1a S-7…S-9 | the compose-time routes, kept distinct from post-serve degradation |
| AC-63 — every number arrives with origin and replay handle; text is display only | ui §1.1 clauses 2 and 4 | no fact learned from prose; suppression rather than orphan prose |
| AC-44 — no served sentence implies a check that did not run | DR-027; manifest §8.3; charter S3 | the derived join withdraws attested prose whose fact is gone |
| AC-88 — status derived, never asserted | manifest §9.2c | the served per-segment state and the answer's serve state are both derived |
| AC-65 — the typed-state enum is closed and centrally owned | DR-051; spec §12.3 S-11…S-13 | no fourth per-segment member minted |
| AC-77 — no orphaned modules | DR-047 clause 4; charter §5, A4.2 | suppression rows given two named served consumers |
| AC-26 — withheld parent, components served: strict-and has **no identity element**, so an unjudged or abstained conjunct withholds | DR-062 `OD-05`; manifest §4.2b; `FX-SRV-06` | `WITHHELD(reason)` on the same discriminant — **live and untouched by DR-074** |
| AC-22 — the operator declared per parent on a resolution chain | DR-040 Q45; DR-062 OD-22 | the recorded supplying level (ADR-0011). **Its `WITHHELD(no operator declaration)` limb is deleted by DR-074** — a removed reason, not a removed member |
| **DR-082 / DR-086** — the band rule is a second independent gate, and it caps rather than blocks | ARCH-V3-R1 ledger (Q-14, both halves) | clause 7: `band_ceiling {label, basis}` on the Answer, visible label, never a silent block |
| **DR-079** — the non-node senses of load-bearing project from the node definition | ARCH-V3-R1 ledger DR-079 (Q-11) | clause 1's flag derivation |
| AC-66 / charter VR-2 — band numbers deferred | DR-066(3); spec §12.8 S-27 | labels are ordered; the cut-point matrix and label vocabulary are register rows (DR-023, VG-02) |

## Questions this ADR does not rule — all now RULED

**Addressing.** **Q-nn** is the primary C4 address for a question; the Plan.md
id follows in parentheses as provenance only (register:
`08-open-questions-for-V.md`; lane mapping: `01-decisions/README.md`). A Plan id
cited anywhere in this ADR **without** a Q-nn is dispositioned RESOLVED-BY-PACK
or DESIGN-NEUTRALIZED in Plan.md §6 and is **not** one of the 28 questions.
**All 28 are ruled — DR-068..DR-097, closure at DR-100.**

- **RULED — Q-11 (DR-079)** — the non-node senses of "load-bearing"
  **project from the charter's node definition**: a **sentence** is load-bearing
  iff it asserts a fact drawn from a load-bearing node or states a served
  number; a **claim** iff its node is; an **unknown** iff removing it would
  change the verdict or band. Clause 1 carries it, and the carriers-only
  restriction Plan.md imposed until the ruling is **lifted** — conformance
  sampling may now derive behaviour from the flag (S5). *(S0's exhaustive
  conformance stays legal and unaffected: charter A2.5 forbids skipping the
  conformance **role**, it never mandated sampling.)*
- **RULED — Q-10 (DR-078)** — the hard composition-bundle budget is an
  **independent register row**, not a derivation from DR-052's cost envelope, so
  `DEFECT` and `ENVELOPE_EXHAUSTED` stay distinguishable — **with V's amendment
  making the cap user-facing as a "low / medium / high" tier the asker selects
  per run**, the register carrying the per-tier values. AC-53's third
  compose-time terminal now has a declared source.
- **RULED — Q-14 (DR-082 half (i) + DR-086 half (ii))** — the band rule is a
  **second, independent gate**, `band_ceiling {label, basis}` **ships on the
  Answer**, and when the gate fires it **caps the band** with a visible ceiling
  label rather than blocking. Clause 7 carries both halves.

**Still reserved (not a Q-nn):** the **band label vocabulary and cut points**,
and the **per-tier budget values** — register rows, V's at DR-023, sitting
**VG-02** (AC-66; charter VR-2). None is stated here (AC-76 · DR-039).
