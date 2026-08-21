# Plan re-review 2 — final round, independent Opus lens (ARCH-V3-R1 / G3)

Reviewer seat: `g3-reviewer`, Opus 5, independent — same seat and lens
(red-team / pack-coherence) across all three rounds. Artifact:
`architecture/Plan.md` at 1737 lines (1107 → 1489 → 1737). Inputs: the author's
`reviews/rework-2-resolution-index.md`, the revised Plan, my own
`opus-plan-review.md` and `opus-plan-rereview.md`, and the founding pack for
spot checks. No `codex-*` file was read in any round.

```
LENS VERDICT: PASS  (with residual risks, and two must-fix-before-C4 items)
REWORK ROUND: 3 of 3
```

**Verification tally**

| Round | Findings | Verdict |
|---|---:|---|
| Round 1 (O-1…O-22) | 22 | 22 REPAIRED — re-confirmed by regression spot-check this round |
| Round 2 (O-23…O-38) | 16 | **16 REPAIRED, 0 NOT-REPAIRED** |
| Round 3 new (O-39…O-44) | 6 | 0 BLOCKER · **2 MAJOR** · **4 MINOR** |

Every round-2 repair was attacked at its claimed location rather than accepted
on the index's word, including the four the coordinator named. All six new
findings are **text-consistency defects created by the round-2 repairs**, not new
design defects: in each case the intended design is stated correctly somewhere in
the document and stated incorrectly, or not propagated, somewhere else. None of
the six requires a design change; five are deletions or one-clause edits.

**Why PASS.** The two round-1 BLOCKERs and all 36 subsequent findings are closed.
The three hardest structural questions in this plan — replay-ceremony
independence, the run entity's frozen/mutable split, and what eviction does to a
served answer — now have designs that survived deliberate attack. The remaining
imperfections are places where a correct design is described twice and one
description is stale. I record the closest call explicitly under O-40 rather than
burying it: it is the one finding where a builder following the plan's own
sequencing rule could be led into a shape the pack forbids, and I did not block
on it because the charitable reading is available, natural, and the newer text is
the argued one. A human steering this should confirm O-39 and O-40 land before
C4 begins.

---

## Part 1 — Verification of O-23…O-38

| # | Sev | Verdict | Evidence, and what I attacked |
|---|---|---|---|
| **O-23** | MAJOR | **REPAIRED** | §2.5's replay row is restructured around "**Independence has three limbs, all three from charter S1 / DR-063 VR-3's ruled text, and all three are carried here**", and limb (iii) is restored in operational form: "a **job with read-only database credentials, scheduled separately from the acceptance run, reading run ids it did not write** — because the obvious CI shape (acceptance job produces runs, then replays them in the same job on the same worker) satisfies limbs (i) and (ii) and defeats the failure limb (iii) guards" — my exact scenario, carried. **Two attestations, not one**: the isolation proof *and* the operator attestation (executing principal, credential scope, run ids it did not produce). §8 S1's gate lists all three limbs by name; §15's bundle carries both artifacts; §7 doc 7 owes both. **Attack:** every limb is now evidenced by an artifact rather than by prose, and each artifact has a falsifiable expected content. |
| **O-24** | MAJOR | **REPAIRED** | `packages/published-arithmetic` — zero dependencies, `agg`/`σ`/product and nothing else — imported by **both** `propagation` and `apps/replay`; §2.5a ("Why the ceremony does not create a second scoring path") records the AC-14/AC-85 argument and the σ `>`-vs-`≥` breaking scenario; §2.6's dependency table gives `apps/replay` → `published-arithmetic` **only**; structural rule 3 is amended to match. **Attack 1 — does the shared package stay inside VR-3's licence?** Yes, literally: VR-3 option (ii) permits sharing "no code path … **beyond** the published arithmetic", so sharing *exactly* the published arithmetic is the licensed maximum, and the plan defines it as manifest §4.2(a)–(b) plus the product — which is the manifest's own scope for the published definitions. The plan is also right that option (iii) (independent re-implementation) was rejected, so the round-2 duplicate was drifting toward a rejected option. **Attack 2 — is the drift control real?** The original drift risk is *dissolved*, not controlled: with one implementation there are no two copies to diverge. The residual control ("literature vectors and the `va == vs` tie-boundary case run against `published-arithmetic` in CI") is now simply correctness testing of the shared module, which is right. **What the licence rests on is scope creep of that package — see O-41**, and **two stale sites still instruct the duplicate — see O-39.** |
| **O-25** | MAJOR | **REPAIRED** | §5.2's tier-2 row now reads "the conformance judge's 'full record' — **meaning the structured `conformance_record`**" and enumerates it; tier 3 carries "the `raw_artifact.raw_text`, provider metadata and request metadata of **EVERY** model call — per-node judges, the composition model, and the conformance judge alike". A dedicated paragraph, "Why the conformance judge needs saying twice", reproduces the two-way break I described and draws the line. `/v1/answers/{id}/inspection` owes a fixture asserting **no `raw_text` anywhere in the tier-2 payload**. **Attack:** the plan picks the AC-44-preserving side of a genuine DR-066(1) ambiguity, which is the fail-safe direction for a disclosure boundary, and states the tension rather than hiding it. Recorded as a residual risk (R-1), not a finding. |
| **O-26** | MAJOR | **REPAIRED** | §4.1a is rewritten as "**The run is split into a frozen head and a progress record**", with the reason stated in my terms ("the same row cannot be both continuously mutable and the carrier of 'frozen at run start'"). `run` is the immutable head — `stranger_sample_rate`, `envelope_basis`, `register_version`, `battery_version`, `tier_source`, `tier_provenance_ref`, `as_of`, `risk_tier` — with "**`UPDATE` is revoked on this table** (column-level grant revocation plus a raising trigger)" and my mid-run-`UPDATE` failure scenario quoted as the reason. `run_progress_event` is append-only with envelope consumption, `envelope_state` and `phase` **derived from the latest event** (AC-88's "status is derived, never asserted"), and the monotone phase transition enforced as a write-time check against the latest `PHASE` event. `run_row_activation`'s **state** is likewise an append-only event stream. **Attack (per the coordinator's question — does the split actually deliver immutability?): for `run`, yes** — grant revocation plus trigger is write-time enforcement, not convention, which is AC-32/A3.2's bar. **Two gaps remain at the edges — O-42 (DELETE not revoked) and O-43 (`run_row_activation`'s non-state columns).** Neither touches the frozen head's guarantees. |
| **O-27** | MAJOR | **REPAIRED** | §4.4's eviction rule is rebuilt in four numbered clauses with an explicit supersession note ("*This supersedes the round-1 wording … Both halves were defects: the first mutated a frozen replay input, the second minted a third answer-surface state*"). Clause 1: "**The conformance record is never written after it is sealed**", with the per-segment vocabulary held to the ruled three and "**no fourth member minted here**" (AC-65, S-13). Clause 2: suppression is an **append-only `segment_suppression`** projection and the served per-segment state is the **derived join**, with "**The replay ceremony reads the conformance record without the overlay**". Clause 4: a fixture asserting the frozen record is **byte-identical before and after** the eviction, carried into S5's gate and §7 doc 7. **Attack (per the coordinator's question — does the agreed shape hold?): clauses 1, 2 and 4 hold exactly.** The replay input is untouched, the mutation is gone, and the byte-identity assertion is the right proof. **Clause 3's two-state resolution was not propagated — see O-40**, which is this round's closest call. |
| **O-28** | MAJOR | **REPAIRED** | §4.2(4) gains "**The fence is not a ratification, and this plan does not treat it as one**", which states my argument in full — `OD-06` closes the set of **producers**, not the set of edges; fencing preserves AC-27 for every *other* edge and nothing more; under A-1's answer (a) the member is a ratified-closure extension, "the very thing §4.2(1) five paragraphs above refuses to do for the arrow-kind vocabulary" — and concludes "**the member is declared in the schema but is NOT WRITABLE until V rules**". §6.4's A-1 is extended to a two-half question, with half (ii) asking explicitly whether the reduction is a third ruled `OD-06` producer or is carried outside `edge.strength`, and stating that "a 'yes' to (i) alone leaves S2's entry criterion satisfied and the edge table still unfreezable". The cheaper path — answer (c), needing no `OD-06` amendment — is surfaced for V. **Attack:** "NOT WRITABLE" has no stated enforcement mechanism, but A-1 is an S2 **entry** criterion, so the interim never coincides with shipped code; recorded as residual risk R-3 rather than a finding. |
| **O-29** | MAJOR | **REPAIRED** | §2.6 gains "**The cross-boundary mechanism the fence requires: the consumer manifest**" — the fenced interface's own build emits `consumer-manifest.json` against the pinned `packages/contract` version; `tools/orphan-audit` consumes it **as a required build input**; "**The engine's release build requires a consumer manifest for the pinned contract version**, so a missing manifest fails the release rather than passing vacuously", with my D4-shaped silent-failure scenario reproduced. §2.7's orphan row carries it inside G1. §8 S15 lists it in the bundle. §2.2's rationale bullet is narrowed exactly as required — it no longer claims one type graph, it claims "one language keeps both halves machine-decided" with the producer and consumer sides named separately. AQ-3's consequence now prices the fence ("one more moving part than a single checkout"). |
| **O-30** | MAJOR | **REPAIRED** | §6.2's AM-1 is re-labelled "**blocks from S5 for conformance *sampling*; S0 for anything narrower than exhaustive**" and gains a "**How S0 proceeds without the answer**" paragraph resting on charter A2.5's own words (*"forbids skipping the conformance **role**, it never mandates exhaustive sampling"*) — so "judging every segment is always legal", S0 runs conformance **exhaustively** with **no consumption of `run.stranger_sample_rate` for coverage**, and sampling arrives at S5. §6.8's table carries the same split in both the S0 and S5 rows, and S0's deliverable says it inline. **Attack:** the AC-50 interaction I raised is closed by name. This is a complete repair. |
| **O-31** | MAJOR | **REPAIRED** | `battery/decision` gets its own dependency row — "`kernel` **only** — AC-48's purity, fenced exactly as `propagation` is"; `no-impure-import` is extended to it explicitly in §2.7; **structural rule 5** states the fence, names the materialise → compute → persist caller shape, and reproduces my failure mode ("a decision could read `now()` for freshness or query the graph for a blocker it should have received, both of which compile, pass every other gate, and silently break `decision_record`'s replay identity hash"). §7 doc 7 owes purity gates for both packages. |
| **O-32** | MINOR | **REPAIRED** | AC-11's architecture term is truncated to "*a node for which a judgement was **scheduled under the running job***", with "**The gate's failure condition is separate from the definition**" as its own sentence and the vacuous/contradictory reading recorded so the fix cannot be undone by a later editor. |
| **O-33** | MINOR | **REPAIRED** | AC-24 now rests carrier (ii) on "**charter VR-2 alone**", quotes it, and adds "**Note on a reading this plan does not assert**": manifest §4.2h's "the band rule alone carries the consequence" "most naturally refers back to that same band half rather than to a second obligation, so it is **supporting context here, not the authority**". AQ-1 is widened to two halves, (i) being exactly the prior question I said V has to settle, with the consequence spelled out ("`band_ceiling` is a charter-VR-2 **display obligation rather than a gate**, and S5's gate text changes accordingly"). Exemplary handling of a citation-strength objection. |
| **O-34** | MINOR | **REPAIRED** | §4.4's `condition_mark` drops `affected_node_ids` and names "**`condition_mark_node` as the single authoritative store of the affected set**", with the reason recorded ("two storage sites for one fact is the same two-copies-no-reconciliation defect UI-9 was corrected for, and AC-85's 'one behaviour, one place' applies to data"). **§6.6 UI-9's basis text was not updated to match — see O-44.** |
| **O-35** | MINOR | **REPAIRED** | S0's deliverable now ends "with the components-only + `DEFECT` terminal **reachable and fixtured** rather than being the path", and Q53 is added to both the deliverable (the fact bundle "carrying Q53's residual-objection field") and the gate list ("Q53 **passes through** (vacuous on a one-node graph) with its residual-objection field populated — its *firing* fixture is S5's, S0 demonstrates the position"). Beyond what I asked: **the full ordered S0 serve trace is published** as a code block with all four AC-52 gates plus DR-057's post-composition verdict-R9, and the named AC-53 terminal S0 must fixture (two conformance failures) with the other two routes assigned to S5. "Every S0 gate fixture names which of the four positions it occupies, so a later gate's 'in position' claim is checkable rather than asserted." |
| **O-36** | MINOR | **REPAIRED** | All three limbs. §7 doc 1's spine is rescoped to "**AC-01…AC-92**" and gains a real obligation — "**each of AC-86…AC-92 must resolve to its owner, its data/API carrier and its acceptance fixture in `09-traceability.md`**; a row that does not is the gap §1's own law names". §3's preamble now reads "**nine core contexts** … **four supporting contexts**, and **five shared-kernel / generic modules**". §6.6 C6 is restated in the two-limb form matching §5.5. |
| **O-37** | MINOR | **REPAIRED** | Seam A declares "**`NULLS FIRST` declared explicitly on `kind`**" with the manifest §8.2g reasoning ("leaving NULL placement to the engine default is exactly the storage-engine-specific ordering behaviour manifest §8.2g refuses to carry"), plus the order-stability property test "across two independent derivations of the same snapshot", added to S2's gate list. |
| **O-38** | MINOR | **REPAIRED** | AQ-3 is reduced to a genuine two-way choice, with the third option "**named only to be excluded**" and the reason given in FLAG-4(b)'s own terms. §2.6 gains "**What structural rule 4 does and does not enforce**": "It prevents *code* coupling, and that is all it can do … the clean-room split is enforced by **checkout separation** plus manifest §14's role assignment, and **nothing in CI can substitute for it**." |

## Regression spot-check on the round-1 repairs

| Round-1 finding | Still stands? | Note |
|---|---|---|
| **O-1** replay isolation | **Design: yes, strengthened.** | Three limbs now, two attestations, dependency-table and structural-rule enforcement. **Text: regressed in two places — O-39.** |
| **O-7** run obligations | **Yes.** | All seven survive the frozen-head/event split: `stranger_sample_rate`, `envelope_basis` (+ consumption/state as events), `register_version`, `battery_version`, `phase` (events, monotone write-time check), `run_row_activation`, and the AM-5 carrier — now `tier_source` **and** `tier_provenance_ref`, which is more than the round-2 gap required. |
| **O-12** undercut fence | **Yes, strengthened.** | The fence CHECK is unchanged and now sits under "The fence is not a ratification"; endpoints and the target-edge FK are additionally **graph-scoped** by `run_id` composites, closing a cross-run hole I had not reached. |
| **O-15** clean-room | **Yes, strengthened.** | FLAG-4(a)/(b), AQ-2/AQ-3 blocking from S0, the fenced `web/`, rule 4's stated scope, and the consumer manifest as the priced cost of the fence. |

---

## Part 2 — New findings (O-39…O-44)

### O-39 · MAJOR · Two stale sites still instruct the duplicated arithmetic that §2.5a declares a defect — and no gate catches a local duplicate

**Location:** §2.6 repository-layout code block, the `apps/replay/` entry; §8 slice
S1, the "What it delivers end to end" cell.

**Regression from the O-24 repair.** Both still carry the round-2 wording:

- §2.6: `replay/  the independent replay ceremony (DR-063 VR-3). Imports NO
  workspace package; **carries its own agg/sigma/product** (§2.5).`
- §8 S1: "`apps/replay` running the ceremony against recorded runs — **importing
  no workspace package, carrying its own `agg`/`σ`/product**, reading every
  structural outcome from frozen rows (§2.5)."

§2.5, §2.5a, the dependency table and structural rule 3 all say the opposite, and
§2.5a's entire purpose is to establish that a duplicated `agg`/`σ`/product inside
`apps/replay` is "a **second implementation of the scoring arithmetic inside V3**
— forbidden by AC-14 … and AC-85". S1's own *gate* cell, in the same table row as
the stale deliverable, correctly requires "the isolation proof lists
`published-arithmetic` and nothing else".

**Breaking scenario.** The repository-layout block and the slice deliverable are
the two places a build team reads to learn what to create. A team scaffolding
from them writes a private `agg`/`σ`/product inside `apps/replay`. **No CI gate
catches it:** structural rule 3 checks *imports*, and the isolation proof lists
*shared* symbols — neither sees a local copy. The result is exactly the AC-14 /
AC-85 breach §2.5a exists to prevent, and the σ `>`-vs-`≥` tie-boundary failure
mode §2.5a describes becomes live.

**Required modification.** Delete "carries its own agg/sigma/product" from §2.6's
layout block and replace with "imports **only** `packages/published-arithmetic`
(§2.5a)"; make the same edit in S1's deliverable cell. Then close the gate gap:
state in §2.5 that the isolation proof's expected content is a **symbol-level
allow-list** (`agg`, `σ`, `product`) and that `apps/replay` declaring any local
arithmetic symbol fails it — otherwise the only defence against this is review.

### O-40 · MAJOR · The eviction rule's two-state resolution was not propagated: §8 rule (iii) forbids it, and clause 2's suppression projection loses its served consumer

**Location:** §4.4 eviction rule clauses 2 and 3; §8 sequencing rule (iii).

**Regression from the O-27 repair, and this round's closest call.** Clause 3 now
rules that "**Eviction transitions the whole answer to components-only +
`DEFECT`**", correctly, on ui §4.0's two-state law. But §8's sequencing rule
(iii) still ends: "**components-only may only be reached by AC-53's three ruled
routes**" — and eviction is none of the three (a second conformance failure, a
failed post-composition verdict-R9, a bundle past the hard composition budget;
all three are compose-time). The two sentences cannot both be followed.

**Breaking scenario.** A builder implementing S5's row-12 fixture reads rule
(iii), concludes that eviction must **not** transition to components-only, and is
left with the only two remaining shapes: keep the composed prose with the
suppressed segments removed — the part-composed/part-components hybrid clause 3
itself rejects as "a third state with no ruled rendering" against
`RULED(DR-049, DR-057)` and ui §4.0 — or keep the prose intact, serving a number
with no origin and no replay handle, which AC-63 states as an absolute. Both
outcomes breach a pack obligation, reached by following the plan's own
sequencing law.

**Second limb.** Clause 2's `segment_suppression` projection and its "derived
join" for the served per-segment state were designed for the hybrid. Under clause
3 there is no served composed text after an eviction, so the derived per-segment
state has **no named served consumer** — which is charter G5's dead-cost shape
and, by §8's own rule (ii), "an orphan on the day it lands". The rows are still
worth keeping (they record *why* the answer degraded, and they belong in the
tier-2 record and the execution digest) — but the plan must name that consumer,
because the never-called list is BLOCKING.

**Why I did not block on it.** Rule (iii)'s sentence sits inside a paragraph about
*which slices may produce a served answer* and about not shipping "interim
renders"; read in that context it constrains **compose-time entry**, while clause
3 describes a **post-serve degradation** to the same surface. That reading is
natural, and clause 3 is the newer, argued, authority-citing text. The
contradiction is real but resolvable by one sentence, not by a design change.

**Required modification.** Amend rule (iii) to distinguish the two moments:
"components-only may be **entered at compose time** only by AC-53's three ruled
routes; a **post-serve** replay eviction transitions an already-served answer to
the same surface (§4.4), which is a degradation of a served answer rather than a
fourth compose-time route." Then name clause 2's consumer — the tier-2 authorized
record and the execution-ledger digest are the natural ones — so
`segment_suppression` is not an orphan. Consider also flagging for V, in one
line, that eviction of a single component number withdraws the whole composed
text: DR-059's "one number is lost, never the answer" is satisfied, but the
reading experience cost is a consequence V may want to see priced.

### O-41 · MINOR · `published-arithmetic`'s licence rests on a prose scope rule with no symbol-level pin

**Location:** §2.6 layout note ("No V3-specific rule may enter it"); §2.5's
isolation-proof expected content.

VR-3's licence covers sharing "no code path … **beyond** the published
arithmetic", so the whole independence property now depends on
`packages/published-arithmetic` never growing past `agg`, `σ` and the product.
Its zero-dependency rule prevents it importing `kernel`'s vocabularies but does
not prevent a V3-specific rule being written inline over plain numbers and arrays
— a lift-target selector or a collapse filter needs no imports. The only stated
guard is the prose sentence, and the isolation proof's expected content is
declared at **package** granularity ("`published-arithmetic` and nothing else"),
which a grown package satisfies.

**Required modification.** Pin the expected content at symbol granularity
(`agg`, `σ`, `product`) in §2.5 and §7 doc 7, and add a one-line CI assertion on
the package's exported surface. Cheap, and it makes the licence checkable rather
than trusted.

### O-42 · MINOR · The `run` frozen head revokes `UPDATE` but not `DELETE`

**Location:** §4.1a `run`; §4.1 standing rule 1; AC-05.

§4.1's standing rule 1 requires append-only tables to have "**`UPDATE`/`DELETE`
revoked and a trigger that raises**"; §4.1a's frozen head names only `UPDATE`.
AC-05 is "**Nothing is ever deleted**". A `DELETE` on `run` erases the pinned
`register_version`, `stranger_sample_rate` and `battery_version` for a run whose
answer has been served, making that answer unreplayable with no trace — the
ledger records what executed, not what the run row pinned.

**Required modification.** Revoke `DELETE` alongside `UPDATE` on `run`,
`run_progress_event`, `run_row_activation` and `run_row_activation_event`, with
the same raising trigger, and say so in §4.1a.

### O-43 · MINOR · `run_row_activation`'s non-state columns were not brought under the event discipline

**Location:** §4.1a `run_row_activation`.

The O-26 repair event-streamed `state` and left `{predicate_ref,
predicate_inputs, skip_evidence}` on the row with no stated discipline.
`skip_evidence` is by definition written *at* the transition to INACTIVE — i.e.
after row creation — so the row must be updated, and spec §1 requires an INACTIVE
skip to be "recorded with predicate + evidence". On R3, the one row with an
explicit re-activation clause, a second skip overwrites the first. The fact is
not lost (AC-44 puts it in the ledger too), so the exposure is hygiene rather
than correctness — but the table is now half event-sourced and half mutable, and
the halves are not marked.

**Required modification.** Move `skip_evidence` and the evaluated
`predicate_inputs` onto `run_row_activation_event` (they belong to the
transition, not to the row), leaving `predicate_ref` on the immutable row. One
discipline per table.

### O-44 · MINOR · Three stale texts left behind by this round's repairs

**Location:** §6.6 UI-9; §6.10 preamble; §2.6 layout block.

- **§6.6 UI-9** still reads "`condition_mark` **gains `affected_node_ids`** with
  a `condition_mark_node` join" — the shape O-34's repair deleted from §4.4,
  which now names `condition_mark_node` the *single authoritative store*. UI-9 is
  the disposition a reader consults for this exact question.
- **§6.10's preamble** still opens "**Four** questions this seat raises rather
  than answers" while the table carries three (AQ-1…AQ-3) and AQ-4's withdrawal
  is explained immediately below it. §6.8's counts are correct (3, and 28
  distinct); only the preamble sentence is stale.
- **§2.6's layout block** has no `battery/decision` entry, though the dependency
  table and structural rule 5 treat it as a fenced package with its own boundary
  — a reader scaffolding from the block will not create it.

**Required modification.** Update UI-9's basis sentence to the single-store shape;
change "Four" to "Three"; add `battery/decision/` to the layout block with its
`kernel`-only note.

---

## Residual risks accepted under PASS

Ordered by how much a human steering this should care.

- **R-1 — "Full record" is read as *structured* record (§5.2).** DR-066(1) grants
  the asker "their own answer's **full record**"; the plan reads that as the
  structured `conformance_record` and routes every model call's raw text to
  operator scope. This is the fail-safe direction for a disclosure boundary and
  the plan states the tension in the open, but it is a seat reading of a ruled
  entitlement and V may read "full" more broadly. If V does, the repair is a tier
  change, not a design change. **Watch item for the C4 open-questions document —
  arguably it belongs there as a question rather than a resolved reading.**
- **R-2 — Eviction withdraws the whole composed answer.** Under §4.4 clause 3, one
  unreplayable component number costs the reader the entire composed text. This
  satisfies DR-059's letter ("one number is lost, never the answer") and is the
  only reading consistent with ui §4.0's two states, but the pack never ruled it,
  and the behavioural cost is large. See O-40's closing note.
- **R-3 — `UNDERCUT_TRANSMISSION` is "NOT WRITABLE" by convention.** No mechanism
  enforces it. The exposure is bounded because A-1 is an S2 **entry** criterion,
  so V's answer precedes any shipped code and the member is either live or
  removed before S2 completes. If that entry criterion is ever relaxed, this
  becomes a live gap.
- **R-4 — The standing-misconfiguration counter's consequence is unnamed
  (§3.2 Seam C).** `deployment_maker_capability` reads configuration only and is
  explicitly "not a liveness probe", so a deployment with two makers configured
  and one permanently unusable (revoked credential) passes the launch gate. The
  ledger-derived counter is the stated catch — "a standing misconfiguration can
  never accumulate as a run of 'transient' outages" — but what happens when it
  trips is not stated: whether it flips the capability predicate, refuses
  standard+ asks, or only reports. **Naming the consequence is a one-line
  addition and would close this entirely.**
- **R-5 — S0's gate BLOCK outcomes are unnamed.** The published S0 trace shows
  `PASS | BLOCK` at gates 1, 2 and 4 without naming what a BLOCK produces.
  AC-53's terminals and spec §12.1a's state machine cover it and S5 owns the six
  terminal fixtures, so nothing is unruled — but S0's own fixtures would benefit
  from naming the terminal each block reaches.
- **R-6 — 28 open questions for V, 12 of them blocking a slice at or before S6.**
  Not a defect; it is the honest state of the pack, and §6.8's per-slice entry
  criteria are the right instrument. It is the single largest determinant of
  whether the build order in §8 is executable, and it is what a human should look
  at first.

---

## Closing note on the three rounds

The plan I first reviewed had two obligations it provably could not meet (a
replay ceremony that shared the engine it was auditing, and a deferred gate
planned to ship as live code) and fourteen credible failure scenarios. Across two
rework rounds all 38 findings closed, and the mechanisms that closed them are
mostly *enforcement* rather than *prose*: revoked grants and raising triggers,
composite foreign keys, dependency-graph rules, symbol-level attestations, fixture
pairs that must fire both ways. That is the right direction of travel for a plan
whose founding charter indicts checks that cannot fire.

What remains is bookkeeping — six places where a correct decision is recorded
twice and one copy is stale — plus six residual risks, two of which (R-1, R-4)
would be closed by a sentence each. None enables a failure the plan has not
already named. It is fit for human steering.

---

*End of opus-plan-rereview-2.md — ARCH-V3-R1 / G3, rework round 3 of 3,
2026-08-05. Independent seat across all three rounds; no `codex-*` file was read
in any of them. Read-only review: no file other than this one was created or
edited.*
