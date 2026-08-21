# Plan re-review — rework round 1 verification, independent Opus lens (ARCH-V3-R1 / G3)

Reviewer seat: `g3-reviewer`, Opus 5, independent — same seat and same lens
(red-team / pack-coherence) as `reviews/opus-plan-review.md`. Artifact:
`architecture/Plan.md` at 1489 lines (was 1107). Inputs: the author's
`reviews/rework-1-resolution-index.md`, the revised Plan, my own round-1
findings, and the founding pack for spot checks. The parallel Codex lens review
was **not** read, in either round.

```
LENS VERDICT: CHANGES REQUESTED
REWORK ROUND: 2 of 3
```

**Verification tally:** O-1…O-22 — **22 REPAIRED, 0 NOT-REPAIRED.** Both round-1
BLOCKERs are genuinely closed at the claimed locations, and every repair was
attacked rather than accepted on the resolution index's word.

**New findings:** 16 — **0 BLOCKER, 9 MAJOR, 7 MINOR** (O-23…O-38). Twelve of
the sixteen are consequences *of* the repairs rather than pre-existing defects
the first round missed; that is stated per finding so the author can see which
are regressions and which are new surface.

---

## Part 1 — Verification of O-1…O-22

| # | Sev (r1) | Verdict | Evidence checked, and what I attacked |
|---|---|---|---|
| **O-1** | BLOCKER | **REPAIRED** | §2.5 replay row rewritten: `apps/replay` "contains **its own self-contained implementation of `agg`/`σ`/product** and **imports neither `propagation` nor `kernel` nor any other workspace package**"; structural outcomes (lift targets and markers, cluster-collapse records, effective operator and resolution level, recorded arrow order) "**read from the frozen `propagation_run` / `node_strength_record` rows as data, never recomputed**". Enforced, not asserted: §2.6 dependency table gives `apps/replay` → *(nothing)*; structural rule **3** makes it a CI-checked graph property; §7 doc 7 and §8 S1 both require the **isolation proof artifact** with expected content *none*. **Attack:** I enumerated what the ceremony must recompute to produce a byte-identical strength — τ, arrow strengths, contributions, the per-target left fold — and confirmed every V3-specific input is a frozen column (`reduced_judgement.τ`, `edge.strength`, `propagation_run.{cluster records, arrow order, operator, resolution level}`, `node_strength_record.lift_marker`). Nothing structural is recomputed by shared code. The original defect is gone. **Two consequences the repair did not carry — O-23, O-24.** |
| **O-2** | BLOCKER | **REPAIRED** | §6.7's D-4/D-5 row now reads "**Corrected at rework round 1 — these do NOT ship as register-gated branches**", quotes charter §5.2's `RATIFIED(DR-020 knob 7)` text, ships the eight routes and **not** the gate, and carries the NOT-SHIPPED attestation. §3.3 bullet 4 rewritten so the two shapes are "**not interchangeable**" and the register-gated shape "may not be used to license them". §8 S6 and §8 S15 both agree. Charter §9 item 6 is raised as a V-QUESTION (§6.9, blocks from S6) rather than resolved. **Attack:** I re-checked every other register-gated branch the plan still proposes (§6.7 D-11, manifest O-3…O-8, §6.3 U-1) — each is a DR-066(2) pre-approved-contingent successor or an open V-QUESTION, i.e. inside §3.3's "only where the pack has not said otherwise". No second instance of the defect. |
| **O-3** | MAJOR | **REPAIRED** | AC-11 now defines "required node" as an architecture term, reconciles it with AC-21 in the same row (*"an unjudged node that has ≥1 persisted raw artifact satisfies the completeness gate and takes M1's path"*), and §8 S1 carries **both** fixtures (fires on a genuinely missing artifact; does not fire on an unparseable-but-persisted one). §7 docs 3 and 7 both list it. **Attack:** the reconciliation is correct and P-D1 is now assertable. The *predicate's wording* is defective — **O-32**. |
| **O-4** | MAJOR | **REPAIRED** | §5.2 tier 3 now names raw judge output explicitly (*"stated explicitly, because omission put it in the asker's tier"*): `raw_artifact.raw_text`, provider metadata, request metadata. Tier 2's trail is enumerated positively and closes with "**containing no raw model text**". §5.3's `/v1/numbers/{ref}/replay` restates it, and a tier-3 `/inspection/prompts` address exists. AC-87 (manifest §9.2b sanitizing) added and owned by context 7. **Attack:** the asker-facing trail as enumerated is genuinely sufficient to recompute without tapes. **One artifact is now double-assigned — O-25.** |
| **O-5** | MAJOR | **REPAIRED** | §3.2 Seam A now carries "**The ordering rule, stated once and only here**": content-derived `(target_kind, polarity, kind, source node's materialized path, sibling ordinal)` with `created_at_seq` as final tiebreak, recorded on `propagation_run`, and explicitly *"not an order over opaque identities"* citing manifest §8.2g. §4.1 rule 5 now points at Seam A and separates the ledger's `sequence` allocator as "a different mechanism for a different purpose"; §6.2 AM-11 defers to Seam A rather than restating. The mandatory-reuse clause I asked for is present and binds AC-30, AC-07 and AC-29 by name. **Attack:** I checked totality — the arrow-identity unique index makes `(source, target, polarity)` unique, materialized paths are unique per node, so the key is total within a target's incoming set; and I checked that a later regeneration cannot retroactively change an already-recorded order (it cannot: the order is per `propagation_run`). One residual — **O-37**. |
| **O-6** | MAJOR | **REPAIRED** | Context **3a "Spawn decision (organ 4 — its own context, previously homeless)"** added, package `battery/decision`, stage ownership "SPLIT mechanics (AC-17)", with AC-48 spelled out in full in the invariant column. The `battery`-vs-domain layering rule is stated in one sentence with 3a named as the one exception by ruling. **Attack:** I re-ran the dependency graph for cycles with 3a in place — none. Ownership is now answerable for all six organs. **The new context ships without the purity gate its invariant needs — O-31.** |
| **O-7** | MAJOR | **REPAIRED** | §4.1a added. Checked against all seven obligations I named: `stranger_sample_rate` (AC-50) ✓; `envelope_basis/consumed/state` on `run` with the reason stated (AC-49, spec N-9) ✓; `register_version` (AC-74) ✓; `battery_version` (`OD-S-04`) ✓; `phase` + monotone transition + `phase_settled_at_seq` (DR-053 F-12) ✓; `run_row_activation {state, predicate_ref, predicate_inputs, skip_evidence, last_evaluated_at_seq}` (AM-10, OQ-G9, AC-04 resumability) ✓; risk tier / asker / session / caller scope / `as_of` (AM-5) ✓. `answer` now carries `run_id` and only the serve-time projection. Both tables written before the first stage executes. **Attack:** the tables exist and are complete. **They have no immutability discipline and one promised column is missing — O-26.** |
| **O-8** | MAJOR | **REPAIRED** | AC-24 rewritten with an explicit **Owner: context 7 (`serve`)**; the carrier is `band_ceiling` on `answer` (§4.4) and `band_ceiling {label, basis}` on the wire (§5.4) with the failure scenario I gave reproduced verbatim as its rationale; content deferred to **AQ-1** (§6.10, blocks from S5); §8 S5 gate "**every band names its way-of-knowing ceiling** (charter VR-2, AC-24)". **Attack:** I verified charter VR-2's *"Every band names its abstention-price cell, its way-of-knowing ceiling…"* against `docs/founding/quality-charter.md` §8 — present as quoted. AC-24 is no longer a constraint with no carrier. **Its manifest citation is over-read — O-33.** |
| **O-9** | MAJOR | **REPAIRED** | AC-86…AC-91 added for manifest §9.2a–f (five typed refusal preconditions; sanitizing; coverage reconciliation with "status is derived, never asserted"; stale-job expiry; honest-degradation vocabulary; suppression + shadow mode) and AC-92 for organ 2's §5.2a–m. Context 7 and context 4 own them by AC id. The §9.2d × AC-62 contradiction I flagged is dispositioned as **UI-13** with exactly the split I proposed (scheduled reaper writes; the read derives from the deadline without writing). §8 S5 gate adds "five distinct typed refusals each demonstrated". **Attack:** I checked AC-86…AC-92 against the manifest digest's §9.2 and §5.2 summaries — the transcription is faithful, including the "no measurement below two" dispersion clause and the claim-type→composition map "held as data, never a source literal". |
| **O-10** | MAJOR | **REPAIRED** | S0 is retitled "**Walking skeleton — a *legal* serve path**" and now delivers "fact bundle → one composition call → one conformance call → machine enforcement", with the reasoning I gave reproduced ("a slice that serves without a conformance judge ships a serve path the pack forbids"). The gate list now says "R9 stranger block **in gate position**" and "Q51 locator gate blocks **after conformance has run and passed**", citing AC-52. New sequencing rule **(iii)** states which slices may serve and that "until a conformance judge exists in the tree **no run is servable**". **Attack:** the author took option 1, the stronger of my two. **It pulled an unruled dependency into S0 and left one gate out of the chain — O-30, O-35.** |
| **O-11** | MAJOR | **REPAIRED** | AC-38 rewritten to name the deployment level, quote DR-055's *"does not pass launch"*, and assign the owner (context 16 `providers`). §3.2 Seam C gains "**The deployment-level maker inventory**" with all three outputs I required: the recorded attestation into S15, the **standard+ ask refusal** (wired at `POST /v1/asks`, §5.3), and the ledger-derived transient-vs-standing counter. §8 S8 carries the fixture **pair** (fires on a one-maker deployment; does not fire on a two-maker deployment with one transient outage); S15 lists the attestation. **Attack:** I tested the transient case (provider reachable at startup, fails mid-run → assertion passes, run takes DR-014's cap path, counter classifies it transient) and the standing case (one maker configured → assertion fails, standard+ refused, attestation absent at S15). Both behave. The gate can now fire. |
| **O-12** | MAJOR | **REPAIRED** | §4.2(4) adds `UNDERCUT_TRANSMISSION`, fenced by `CHECK (strength_source <> 'UNDERCUT_TRANSMISSION' OR (kind = 'undercutting' AND target_kind = 'EDGE'))`, states what the column holds under each of A-1's three answers, and makes **A-1 an entry criterion for S2** with removal-if-inert as S2's exit condition (AC-77, VR-4). **Attack (per the coordinator's instruction, I tested all three A-1 answers):** answer (b) inert — member never declared, clean; answer (c) third shape — carried on `propagation_run`, member removed, clean; **answer (a) transmission-reduction — the member is written, and it is a producer of arrow strength that DR-062 `OD-06` does not name — O-28.** The fence keeps AC-27 intact for every *other* edge, exactly as claimed, but it does not make the third producer ratified. |
| **O-13** | MAJOR | **REPAIRED** | §6.9 added, disposing all seven charter §9 contradictions on the same three-way scheme (5 RESOLVED-BY-PACK, 2 V-QUESTION). Item 6 (not-shipped vs auto-activating) blocks from S6; item 7 (register rows with no executable unit) blocks from S15 and is an S15 entry criterion. Item 2's disposition is made checkable (`tools/acceptance-bundle` emits no aggregate quality score; no CI gate computes one) and item 3's routes the dead-check detector to G5 at advisory force. **Attack:** I checked each of the seven against the charter text; the dispositions are accurate and item 7's consequence (every unfilled register key on the BLOCKING never-called list) is stated in the terms I raised. |
| **O-14** | MAJOR | **REPAIRED** | `composed_text` gains "a **`segment → served_number` reference set** listing every number the segment asserts"; §4.4 carries "**The eviction rule (AC-12 × AC-63 × AC-44)**" with the failing sequence I gave and the rule I asked for; §8 S5's row-12 gate now includes the eviction fixture. **Attack:** the segment→number link makes charter §5.2 row 12's fixture constructible, which it was not. **The rule's second half writes into a frozen artifact and mints a third surface state — O-27.** |
| **O-15** | MAJOR | **REPAIRED** | FLAG-4 is split into **(a) the carry question** and **(b) the barrier question**, both queued as AQ-2/AQ-3 blocking from **S0**, with FLAG-4(b) stating the consequence in the terms I required (*"DR-003 has no enforcement mechanism"*, *"the role split becomes an honour system, which manifest §14 explicitly refuses"*). §2.6 moves `web/` behind an explicit "clean-room barrier" as a SEAT-PROPOSAL separate workspace/repository consuming `packages/contract` as a published artifact, and adds structural rule **4**. The "one contract *declaration*, not one *checkout*" reading of AC-59 is stated. **Attack (per the coordinator's instruction on rule 4): rule 4 does not enforce the clean-room split** — it is an import rule; manifest §14's violation is a *reading* violation. That is a residual, not a failure of the repair I specified (which was to raise both questions and record the consequence, all done) — **O-29, O-38.** |
| **O-16** | MAJOR | **REPAIRED** | `condition_mark` gains `affected_node_ids` plus a `condition_mark_node` join "populated **at write time from the ledger rows that caused the mark**"; UI-9's disposition is explicitly corrected, retracts the earlier "no reconciliation rule is needed" claim, and restates the weaker true claim ("the affected set is stored once and projected"). The D4-shape consequence and the charter §5.2 row-6 fixture risk are both written out. **Attack:** the projection is now computable. **Two storage sites are declared for one fact — O-34.** |
| **O-17** | MINOR | **REPAIRED** | §6.8 replaces the single launch-blocking flag with a **blocks-from-slice-Sn** table; OQ-G10 → S6, AM-12 → S0, A-8 → S3 as I required, each row's own text carries the same field, and `07-build-order.md` treats them as entry criteria (§7 doc 8). **Attack:** I reconciled every V-QUESTION row against the table — all 29 distinct questions appear exactly once, the per-row `blocks from` labels match the table, and the arithmetic (23 + 2 + 4 = 29) checks out. **One classification is now wrong because S0's scope changed — O-30.** |
| **O-18** | MINOR | **REPAIRED** | §2.6 publishes the full **Declared dependency edges** table for all 18 packages plus the three apps, `web` and `tools/*`; the CI rule now points at `03-module-design.md` as authoritative and the summary is normative only "for the rules it states". **Attack:** I traced the graph for cycles including `battery`'s open-ended "and the domain package owning each stage's substance" edge — acyclic. |
| **O-19** | MINOR | **REPAIRED** | The debug facet gets an address — `GET /v1/answers/{id}/inspection/debug`, tier 3, operator scope — with the orphan consequence stated in my own terms ("what stops it being a shipped unit with no entry point — a charter G1 orphan on the BLOCKING never-called list the day S5 lands"), and S5 delivers it "at its operator-scoped address". §2.7's orphan row now names **three** mechanisms with G5 as a reviewed manual audit at charter A4.1's advisory force, plus the `measurement_lane` exemption. |
| **O-20** | MINOR | **REPAIRED** | §5.5's E4 bullet rewritten to the two-limb form I specified: correctness on the read path **and** "the stream **MUST** additionally carry the `staleness trigger fired` honesty event for every subscribed answer, with a declared consumer per E1", with the tab-left-open failing client named. **Attack:** the conforming-client gap is closed. **§6.5 C6 was not updated to match — O-36.** |
| **O-21** | MINOR | **REPAIRED** | §4.2(3) states the upsert rule exactly as required: identical `(strength, magnitude_status, strength_source, kind)` collapses to the existing row; any difference raises the typed integrity error; both fixtures in S2. AC-35's two distinct behaviours are now separable. |
| **O-22** | MINOR | **REPAIRED** | OQ-G2's recommendation replaced with a typed **`UNCLASSIFIED`** state aligned to OQ-G9's `POLICY_BLOCKED` idiom, treated as correctness at runtime and **reported by the acceptance bundle as an outstanding item**; S15 lists "the `UNCLASSIFIED` battery-row report"; §7 doc 8 records charter §5.2 row 6's fixture as an explicit launch-readiness dependency. The silent-default idiom is gone, and the row explains why ("A silent `CORRECTNESS` default would have disabled a blocking gate while looking healthy"). |

---

## Part 2 — New findings (O-23 onward)

### O-23 · MAJOR · The O-1 repair dropped VR-3's third limb — operator independence

**Location:** §2.5 "Replay ceremony" row; §8 S1 gate list; §8 S15 acceptance bundle.

**Regression introduced by the repair.** Round 1's §2.5 row read "…reading only
frozen records, **run by a job that did not produce them**". The rewritten row
quotes VR-3 only as far as *"sharing no code path with the serving run beyond
the published arithmetic"* and never restates the operator clause. Charter S1
and VR-3 both define **independent** with three limbs: code independence,
frozen-records-only, and *"run by a **person or job that did not produce
them**"*. The rewritten S1 gate now reads "replay ceremony passes exactly,
byte-identical numbers, no model in the path · the isolation proof artifact is
produced and lists no shared symbol" — code independence only. S15 carries "the
replay-ceremony isolation proof" — again code only.

**Breaking scenario.** The obvious implementation of a green CI pipeline is: the
acceptance job runs the recorded runs, then runs `apps/replay` against the rows
it just produced, in the same job, on the same worker, against the same
connection. Every stated gate passes; VR-3's operator independence is silently
absent; and the failure mode it guards — a ceremony whose inputs were staged by
the very process under test — is live on the BLOCKING launch gate.

**Required modification.** Restore the clause to §2.5 and give it a checkable
form: name the executing principal (a job with read-only database credentials,
scheduled separately from the acceptance run, reading runs it did not write) and
add its attestation — executing principal, credential scope, and the run ids it
did not produce — to the S1 gate and the S15 bundle beside the isolation proof.
Independence is now two artifacts, not one.

### O-24 · MAJOR · `apps/replay`'s own arithmetic is a second implementation, and neither AC-14 nor AC-85 is exempted

**Location:** §2.5 replay row; §2.6 structural rule 3; §3.3 anti-pattern 2;
§1.3 AC-14; §1.8 AC-85.

**Consequence of the repair, and I share the authorship of it** — my round-1
required modification named "a self-contained `agg`/`σ`/product implementation
inside `apps/replay`". The author implemented it exactly. What neither of us
recorded is that the result is, literally, a **second implementation of the
scoring arithmetic inside V3**. AC-14 (`DR-030 J1`, spec §18 O-1) is
categorical: *"no second scoring path **anywhere in V3**"*. AC-85 (charter
A3.1): *"two implementations of one behaviour is a defect"*. §3.3's own
anti-pattern list forbids a second scoring path "including 'just for the debug
facet', 'just for the preview' or 'just for the UI'" — and does not exempt the
ceremony. Note also that VR-3's option (ii) *permits* sharing the published
arithmetic ("sharing no code path … **beyond** the published arithmetic"), while
rejected option (iii) is "an independent re-implementation, disproportionate at
launch"; the repair moved toward (iii) when a narrower move was available.

**Breaking scenario.** `apps/replay`'s σ is written with `>` where the serving
engine uses `≥`. Manifest §4.2(b) is explicit that this is the discontinuity
DF-QuAD exists to avoid, and that the tie case `va == vs` must return exactly τ.
Every tie-boundary node now fails the ceremony. The pack has no rule for
adjudicating a ceremony-vs-serving disagreement, so the launch gate reports a
serving defect that does not exist — or, in the mirror case, a genuine serving
change is masked because both implementations were edited together by the same
author in the same commit.

**Required modification.** Choose one and record it. Either (a) extract the
published arithmetic into a zero-dependency module — `agg`, `σ`, product, and
nothing else — that both `propagation` and `apps/replay` import, which is
precisely what VR-3 option (ii)'s "beyond the published arithmetic" licenses,
and keep structural rule 3 as "imports no workspace package **except**
`packages/published-arithmetic`"; or (b) keep the duplicate and record it as a
**declared, V-approved exemption to AC-14 and AC-85**, with a named drift
control — the two literature vectors (manifest §4.5) and the σ tie-boundary case
run against **both** implementations in CI, so a divergence is caught as a
divergence rather than as a ceremony failure. Option (a) is smaller and keeps
"one behaviour, one place" intact.

### O-25 · MAJOR · The conformance judge's own raw artifact is assigned to two tiers at once

**Location:** §5.2 payload-class table, tier-2 and tier-3 rows; §3.2 Seam C;
§4.3 `raw_artifact`; §4.4 `conformance_record`.

**Breaking scenario / citation.** Tier 3 now reads "raw judge output:
`raw_artifact.raw_text`, provider metadata and request metadata", on AC-44's
*"raw tapes internal"*. Tier 2 reads "the conformance judge's **full** record",
on AC-56/AC-57 and DR-066(1)'s ruled entitlement (*"the asker may replay their
own answer's full record on demand"*). The conformance judge is a model call, so
by Seam C and AC-13 the gateway "persists the raw artifact **unconditionally**"
— there is a `raw_artifact` row whose `raw_text` is the conformance judge's
output. That row is tier 3 by the new rule and tier 2 by DR-066(1). §4.4's
`conformance_record` is a distinct structured table, so the distinction the plan
needs is available — it simply is not drawn.

Both readings break something. Route the row to tier 3 and the asker is denied
part of the "full record" DR-066(1) grants. Route it to tier 2 and AC-44's raw
tapes reach a served surface, which is the defect O-4 existed to close, and it
reaches it through the one endpoint the asker is guaranteed.

**Required modification.** State in §5.2 that tier 2's "conformance judge's full
record" means the **structured `conformance_record`** — outcome, which R9 pass
failed, per-segment `JUDGED / SAMPLED_PASSED / NOT_SAMPLED`, and the judge's
structured findings — and that the underlying `raw_artifact.raw_text` of *every*
model call, conformance judge included, is tier 3. Add the corresponding
sentence to `04-api-contract.md`'s authorization tiers, and give `/inspection`
a fixture asserting no `raw_text` in the tier-2 payload.

### O-26 · MAJOR · `run` and `run_row_activation` carry the frozen-at-run-start obligations with no immutability discipline

**Location:** §4.1a; §4.1 standing rule 1; §1.5 AC-50; §1.8 AC-74; AC-32.

**Breaking scenario.** §4.1's first standing rule is absolute: "Every
mutable-looking fact is either **append-only** or **versioned with the old row
preserved**; nothing is deleted." §4.1a introduces the plan's first frankly
mutable table — `envelope_consumed` and `envelope_state` change continuously
during a run, `phase` transitions once, `run_row_activation.state` and
`last_evaluated_at_seq` change on every predicate re-evaluation — and says
nothing about which discipline applies. On the same row sit
`stranger_sample_rate` (AC-50: *"freezes at run start"*), `register_version`
(AC-74: *"every run pins one, so a register change cannot retroactively move a
served number"*) and `battery_version`. With the table mutable and no column-level
protection, "frozen at run start" is enforced by nothing: a mid-run `UPDATE run
SET stranger_sample_rate = …` moves conformance coverage inside a live run
(AC-50 says the ratchet applies to the *next* run), and a mid-run
`register_version` change makes the run's replay read a register the run did not
use — breaking AC-06 with no trace, because the ledger records what executed, not
what the run row said when it executed. Charter A3.2/AC-32's bar is *"enforced
once, at write time"*, not by convention, and the plan applies that bar to nodes
and arrows while leaving the run's frozen columns unguarded.

Second, smaller limb: §6.2 AM-5's design-that-fits-every-answer is that the tier
"carries **`tier_source ∈ {ASKER, DEPLOYMENT_POLICY, DERIVED}`** with its
provenance recorded", and §5.3's `POST /v1/asks` requires it — but §4.1a's `run`
column list has `risk_tier` and no `tier_source`. The promised carrier has no
column.

**Required modification.** Split `run` explicitly: an **immutable frozen head**
(`run_id`, `asker_id`, `session_id`, `caller_scope`, `as_of`, `risk_tier`,
`tier_source`, `depth_params`, `agent_count`, `stranger_sample_rate`,
`envelope_basis`, `register_version`, `battery_version`, `created_at_seq`) with
`UPDATE` revoked on those columns by trigger or by a separate `run_frozen`
table, and a **mutable progress record** (`envelope_consumed`, `envelope_state`,
`phase`, `phase_settled_at_seq`) whose transitions are append-only events with
the current value derived — which is also what AC-88's "status is derived, never
asserted" already requires elsewhere. Do the same for
`run_row_activation.state`. Add `tier_source` to the frozen head.

### O-27 · MAJOR · The eviction rule writes into the artifact AC-07 freezes, and mints an answer-surface state the UI contract does not have

**Location:** §4.4 "The eviction rule (AC-12 × AC-63 × AC-44)"; §1.2 AC-07;
§4.1 standing rule 1; §1.6 AC-53; ui §4.0.

**Breaking scenario, limb 1 — mutation of a frozen replay input.** The rule's
own second sentence establishes that "the conformance verdict is a **frozen
input artifact, never regenerated** (AC-07)". Its last sentence then prescribes
"the conformance record's per-segment state for suppressed segments is recorded
as `SUPERSEDED` rather than silently retained." Those cannot both hold of the
same row. DR-060(b) and charter S1 make the serve decision replay **as stored
data**; if eviction edits the stored per-segment states, then a ceremony run
after an eviction replays a *different* serve decision than the one served, and
the ceremony's determinism guarantee — the reason no model runs inside it —
rests on an artifact that changes after the fact. §4.1's standing rule 1
independently forbids the unpreserved mutation.

**Limb 2 — a third answer-surface state.** "Every segment referencing the
evicted number is suppressed and replaced by its components-only projection"
produces an answer that is partly composed prose and partly components-only
rendering. `RULED(DR-049, DR-057)` and ui §4.0 give exactly **two** answer-surface
states — "Composed, or components-only + DEFECT" — and W20, which §8 S14 builds
first precisely because it is fully ruled with no mockup dependency, renders
those two. A hybrid is a third state with no ruled rendering, and charter §5.2
row 12's fixture would be written against a surface the interface contract does
not admit.

**Required modification.** Limb 1: record the suppression as an **append-only
overlay** — a `segment_suppression {answer_id, answer_version, segment_id,
evicted_number_ref, at_seq}` row — and define the served per-segment state as the
*derived* join of the frozen conformance record and the suppression rows, so the
frozen artifact is never written and AC-88's "derived, never asserted" holds.
State that the replay ceremony reads the conformance record **without** the
overlay, since the overlay post-dates the serve decision. Limb 2: either declare
that eviction transitions the whole answer to components-only + `DEFECT` (the
two-state reading, and the simplest thing that satisfies DR-059's "the rest
serves"), or record the hybrid as a third declared surface state, route it to a
mockup review under DR-064, and say so in §6.5/§8 S14 — but do not leave the
interface contract's two-state law contradicted in a data-model paragraph.

### O-28 · MAJOR · `UNDERCUT_TRANSMISSION` is an unratified third producer of arrow strength, and A-1's question does not ask V to ratify it

**Location:** §4.2(4); §1.3 AC-27; §6.4 A-1.

**Breaking scenario / citation.** AC-27 restates `DR-062 OD-06`: arrow strength
"is **only ever** the evidence verifier's grounded score or provenance cluster
collapse. **No author, policy, model or configuration row may set it freely.**"
§4.2(4) declares a third member and argues that fencing it by `CHECK` means
"AC-27's closure is preserved intact **for every other edge**". That is true and
it is not the point: `OD-06` closes the set of *producers* of arrow strength, not
the set of edges to which the closure applies. Under A-1's answer (a) — the
seat's own recommendation — an undercut edge carries a `MEASURED` strength
produced by a mechanism `OD-06` does not name. That is a ratified-closure
extension, which §4.2(1) correctly refuses to do for the *arrow-kind* vocabulary
five paragraphs earlier ("minting one would extend a ratified closed enum, which
architecture may not do") and then does here for the *strength-source*
vocabulary without noting the asymmetry.

The consequence is procedural and real: **A-1 as posed cannot be answered into a
buildable state.** Its question text is *"Does an undercut reduce the transmitted
contribution of the support edge it targets, and by what rule?"* — a "yes" is
not sufficient authority to write the column, because `OD-06` still says the
producer set is closed at two. S2's entry criterion ("A-1 answered") would be
met and the edge table still could not be frozen.

**Required modification.** Extend A-1's question with the second half it needs:
*"…and if so, is the undercut's transmission reduction a third ruled producer of
arrow strength under `DR-062 OD-06`, or is it carried outside `edge.strength`
altogether?"* State in §4.2(4) that answer (a) entails an amendment to `OD-06`
and that the member is not writable until V grants it. Note the cheaper
alternative in the same place: carrying the reduction as a per-edge quantity on
`propagation_run` (A-1's answer (c) shape) needs no `OD-06` amendment at all,
because it never becomes an arrow strength — which may make it the answer that
minimizes what V has to reopen.

### O-29 · MAJOR · The clean-room fence breaks the single-type-graph argument that AC-61's audit and W19's build gate rest on

**Location:** §2.6 clean-room barrier and dependency table; §2.2 rationale
bullet 2; §5.7; §8 S14; §1.6 AC-61.

**Breaking scenario.** §2.2's second and strongest argument for TypeScript is
that "**AC-61's bidirectional no-orphan audit is decidable in one type graph** …
with one TypeScript program it is a static query, and charter G1's 'publish the
entry-point list it walked' becomes a build artifact rather than a manual
inventory." §2.6 then moves the interface — the entire *consumer* side of "no
served field without a consumer" — into a separately-checked-out workspace or
repository, and asserts only that "the orphan audit still walks one field
inventory (the contract's), with the UI's consumer side **reported against it**".
"Reported against it" is not a mechanism. AC-61 is bidirectional and both
directions are defects; §5.7 promises the inventory is "machine-checkable in
**both** directions"; §8 S14's gate is "W19's reachability check **fails the
build on an orphan**". Which build? The engine's build cannot see the UI's
consumers; the UI's build cannot see which contract fields the API actually
serves at runtime.

Concrete failure: a field is added to the Answer resource in `packages/contract`
and served; no UI consumer is ever written. The engine build passes (the field
has a producer). The UI build passes (it consumes what it consumes). The
never-called list — the **BLOCKING** artifact — is assembled from the engine
repository and shows nothing. A served-but-unread field survives to release,
which is precisely the D4-shaped failure ui §3.2's death list inventories nine
instances of.

**Required modification.** Name the cross-boundary mechanism, and name where it
runs. Recommended: the fenced interface publishes a **consumer manifest** — a
generated inventory of every contract field and event name it references,
emitted by its own build against the pinned `packages/contract` version — and
`tools/orphan-audit` in the engine repository consumes that manifest as a build
input, failing on either direction of drift. State that the engine's release
build **requires** a consumer manifest for the pinned contract version, so a
missing manifest fails the release rather than passing vacuously. Then repair
§2.2's rationale bullet, which currently claims a property the layout no longer
provides, and add the mechanism to AQ-3's consequence text so V can see what the
fence costs.

### O-30 · MAJOR · Moving conformance into S0 pulls AM-1's unruled rule into S0, while §6.8 still classifies AM-1 as blocking from S5

**Location:** §8 S0 deliverable and rule (iii); §6.2 AM-1; §6.8 blocking table
(S5 row); §1.5 AC-50; DR-060(a).

**Breaking scenario.** The O-10 repair puts "one conformance call" in S0. DR-060(a)
— restated by the plan at AC-51/AC-54 and by charter A2.5 — scopes that call:
"**load-bearing sentences always judged**; non-load-bearing sampled at the frozen
stranger rate". AM-1 says the *sentence* sense of load-bearing is unruled, is a
V-QUESTION, and closes with an explicit prohibition: "**Until ruled, C4 may
define carriers and provenance for the non-node senses only — not
conformance-sampling or serving behaviour derived from them.**" §6.8 classifies
AM-1 as blocking from **S5**. Rule (iv) says a slice does not start before its
blocking questions are answered.

So S0, which "nothing else starts before", must run a conformance call whose
scoping rule the plan forbids implementing until S5's question is answered. A
builder following the plan either (a) invents a load-bearing-sentence rule to get
S0 moving — a DR-039 violation and exactly what AM-1's disposition exists to
prevent — or (b) discovers at S0 that an S5-labelled question is actually an S0
entry criterion.

There is a clean resolution the plan does not state: judging **every** segment is
always legal (the protected core "forbids skipping the conformance **role**, it
never mandates exhaustive sampling" — charter A2.5), so S0 can run conformance
exhaustively and defer sampling entirely. But that must be written down, because
the alternative is an invented rule.

**Required modification.** Add to S0's deliverable: "conformance runs
**exhaustively** at S0 — every segment judged, no sampling — because DR-060(a)'s
sampling rule depends on the sentence sense of load-bearing, which AM-1 leaves
unruled; sampling arrives at S5 with AM-1's answer." Re-label AM-1 in §6.8 as
blocking from **S5 for sampling, S0 for anything narrower than exhaustive**, or
split it into the two questions it now is. Check the same way for AC-50: S0 writes
`run.stranger_sample_rate` but must not consume it for conformance coverage until
AM-1 lands.

### O-31 · MAJOR · Context 3a ships organ 4's purity with no enforcement gate, while AC-09's purity gets three

**Location:** §3.1 context 3a; §2.6 dependency table (`battery` row) and
structural rules; §2.7 Lint row; §1.5 AC-48.

**Breaking scenario.** AC-48 (manifest §7.2a) is categorical: "**Decision→spawn
is a pure function** over typed signal bundles with fixed precedence", and its
replay identity hash is meaningful only if the function is deterministic over its
declared inputs. The O-6 repair homes it at `battery/decision`. But `battery` may
depend on `kernel, db, ledger, register, budget, graph, and the domain package
owning each stage's substance` — i.e. the decision function sits inside a package
with database access, a clock-bearing ledger writer and provider-reaching
siblings. §2.6's structural rule 1 fences `propagation`; §2.7's `no-impure-import`
lint names `propagation`; there is no analogue for `battery/decision`. §2.2's own
argument is that "AC-09 purity is a **mechanically enforced module boundary** …
Charter A3.4 wants each house rule expressed as a gate" — the same reasoning
applies to AC-48 and is not applied.

Failing sequence: a decision implementation reads `now()` to decide freshness, or
queries the graph directly for a blocker it could have received in the signal
bundle. Both compile, both pass every declared CI gate, and both make
`decision_record`'s replay identity hash non-reproducible — which manifest §7.2f
requires to "replay" for identical content and "fail loudly" for different
content. The failure is silent in exactly the way P-D2's and D5's failures were.

**Required modification.** Give `battery/decision` its own package boundary in the
dependency table (`kernel` only, like `propagation`), extend `no-impure-import` to
it, and add a fifth structural rule: "`battery/decision` may import nothing but
`kernel` — AC-48's purity is a graph property." Its impure caller (the stage
runner) materialises the two signal bundles and the path state and passes them in,
mirroring Seam A's materialise → compute → persist. Add the purity gate to `§7
doc 7`'s house-rule gate list.

---

### O-32 · MINOR · AC-11's "required node" predicate is self-negating as drafted

**Location:** §1.2 AC-11.

The architecture term reads: *"**required node** — a node for which a judgement
was **scheduled under the running job** and for which **no raw artifact exists in
any state**, parseable or not"*, and the surrounding clause reads "every
**required node** must have ≥1 raw artifact". Substituting the definition: *every
node that has no raw artifact must have ≥1 raw artifact* — a predicate that is
either vacuous or contradictory depending on how a reader resolves it. The
operational rule is unambiguous two sentences later ("an unjudged node that has
≥1 persisted raw artifact satisfies the completeness gate"), so the intent is
recoverable; but §7 doc 3 instructs C4 to carry "the **'required node'
predicate**" forward, and it is the predicate that is broken.

**Required modification.** Truncate the definition at the first clause —
*"a node for which a judgement was scheduled under the running job"* — and move
"and for which no raw artifact exists in any state" into the gate's *failure*
condition where it belongs.

### O-33 · MINOR · AC-24 presents a contested reading of manifest §4.2(h) as settled

**Location:** §1.3 AC-24; §6.10 AQ-1.

I verified the quote against `docs/founding/carryover-manifest.md` line 330 — it
is accurate, and so is AQ-1's second quote (line 331). But the sentence in situ
reads: *"`RULED — DR-062 (OD-12)` for the arithmetic half: there is no numeric
ceiling on τ. **The band rule alone carries the consequence, because DR-044
already made the downgrade blocking**…"* — and four lines earlier the same
paragraph labels DR-044(Q51)'s locator gate, provenance join and reasoning-only
downgrade "**the band half**". The most natural reading is that "the band rule"
*is* that band half, not a second obligation beside it. AC-24 nonetheless asserts
"the obligation is therefore carried in **two** places, **both of which must
exist**". The independent authority for a second carrier is charter VR-2's
*"Every band names … its way-of-knowing ceiling"* — which is real, is cited, and
is sufficient on its own. The manifest quote is doing work it does not do.

**Required modification.** Rest AC-24's second carrier on charter VR-2 alone and
say so; drop the manifest sentence to supporting context. Widen AQ-1's question to
include the prior one V actually has to settle: *"is the band rule a second
obligation, or manifest §4.2(h)'s restatement of DR-044's band half?"* — because
if it is the latter, `band_ceiling` is a charter-VR-2 display obligation rather
than a gate, and S5's gate text changes.

### O-34 · MINOR · `condition_mark` declares two storage sites for one fact

**Location:** §4.4 `condition_mark`; §6.6 UI-9.

The repaired shape carries **both** `affected_node_ids` (an array on the mark
row) **and** a `condition_mark_node` join table, with no statement of which is
authoritative. UI-9's corrected claim is "the affected set is **stored once** and
projected" — the shape stores it twice. That is AC-85's "one behaviour, one
place" applied to data, and it is the same class of defect (two copies, no
reconciliation rule) that UI-9 was corrected for.

**Required modification.** Keep the `condition_mark_node` join as the single
authoritative store — it is the one that supports the write-time population from
ledger rows and the read-time projection — and delete `affected_node_ids` from
the row, or declare it a generated/derived column. State the choice in
`02-data-model.md`.

### O-35 · MINOR · S0's terminal wording, and gate 2 of the ordered chain is still missing from S0

**Location:** §8 S0 deliverable and gate list; §1.6 AC-52, AC-53.

Two residuals of an otherwise good repair. (i) The deliverable chain reads
"…machine enforcement → **the components-only terminal** → served answer", which
on a literal reading makes components-only + `DEFECT` S0's only serve outcome —
i.e. every S0 run wears a defect badge. The intent is plainly that the terminal
is *reachable*, not that it is the path. (ii) S0's gate list demonstrates R9
(gate 1) and Q51 (gate 4) "in gate position" under AC-52's law
`R9 → Q53 → conformance → Q51`, and adds conformance (gate 3) — but **Q53
objection visibility (gate 2) is still absent from S0** and does not arrive until
S5. The argument I made about conformance applies unchanged to Q53: a fixture only
demonstrates gate 4 "in that position" if the positions before it exist. On a
one-node graph Q53 passes vacuously, so this is cheap to close rather than
structural.

**Required modification.** Reword the chain to "…machine enforcement → served
answer, **with the components-only terminal reachable and fixtured**". Add Q53's
pass-through and its residual-objection fact-bundle field to S0's deliverable, and
note in the gate list that row 2's *firing* fixture is S5's while S0 demonstrates
the position.

### O-36 · MINOR · Three cross-references were not updated with the repairs

**Location:** §7 doc 1; §3 preamble; §6.5 C6.

- §7 doc 1 still scopes the traceability spine as "**AC-01…AC-85** → where each
  is carried". The O-9 repair added **AC-86…AC-92**, so seven constraints —
  including all of organ 6's serve behaviour and organ 2's judge contract — are
  outside the spine that §1's own law ("a constraint with no design element
  carrying it is a gap") depends on to be checkable.
- §3's preamble still reads "**eight core contexts** … and **four
  shared-kernel / generic modules**". With context 3a the core table has nine
  rows, and the shared table lists five (13–17). The section that introduces the
  map miscounts it in both directions.
- §6.5 **C6** still concludes "so **no streaming or polling decision is
  load-bearing for correctness**", while the O-20 repair at §5.5 now states that
  without the mandatory stream event "a conforming client … is **never told the
  answer went STALE**, breaching DR-015's 'never silently'". Those are two
  different claims about the same path.

**Required modification.** Extend doc 1's spine to AC-01…AC-92; correct §3's two
counts; and amend C6 to the two-limb form (`correctness on the read path; the
stream carries the mandatory staleness event when a stream exists`), matching
§5.5.

### O-37 · MINOR · The arrow-order key sorts on a nullable column with no NULL placement stated

**Location:** §3.2 Seam A ordering rule; §4.2(1).

The ordering key is `(target_kind, polarity, kind, source node's materialized
path, sibling ordinal)` with `created_at_seq` as tiebreak. Repair C-2 made `kind`
**NULL for every support edge** (`polarity = 'support'` requires
`kind IS NULL`). Sorting on a nullable column without an explicit
`NULLS FIRST | NULLS LAST` leaves the placement to the engine's default, and
AC-08 is a determinism obligation whose whole point (manifest §8.2g) is that no
storage-engine-specific ordering behaviour carries. The order is recorded on
`propagation_run`, so replay is safe either way — but the *first* computation and
the overlay-detachment recomputation both derive it, and a configuration or
version difference between environments would produce two different recorded
orders for the same graph.

**Required modification.** State the placement explicitly in Seam A
(`NULLS FIRST` on `kind`, so support edges sort ahead of typed attacks, or
`NULLS LAST` — either, but declared), and add a property test asserting that the
derived order is stable across two independent derivations of the same snapshot.

### O-38 · MINOR · AQ-3 offers V an option that FLAG-4(b)'s own consequence text refutes, and structural rule 4 covers only half the barrier

**Location:** §6.10 AQ-3; §1.9 FLAG-4(b); §2.6 structural rule 4 and the
"Why the UI is nonetheless fenced" paragraph.

AQ-3 asks "separate repository, separate workspace, or **import-fenced package
in this one**?" FLAG-4(b) argues, correctly, that "a barrier that depends on an
implementer not searching their own working tree is not a barrier" — which
disqualifies the third option, since an import-fenced package in this repository
is in every implementer's working tree, editor index and agent context.
Offering it to V without that annotation invites the answer the plan's own
analysis rules out. Separately, structural rule 4 ("No engine package may import
from the interface, and the fenced interface may import nothing but the published
contract") is an **import** rule enforced in CI; manifest §14's violation is a
**reading** violation ("A single participant who reads V2 source and then writes
V3's implementation has voided DR-003 regardless of intent"). Rule 4 is necessary
and is not the barrier.

**Required modification.** Annotate AQ-3's third option as "**does not satisfy
FLAG-4(b)'s own test**", leaving V a genuine two-way choice. Add one sentence to
§2.6 saying what rule 4 does and does not enforce: it prevents code coupling; the
clean-room split is enforced by **checkout separation** plus manifest §14's role
assignment, and nothing in CI can substitute for it.

---

## Part 3 — The author's three recorded deviations

| # | Deviation | Assessment |
|---|---|---|
| 1 | **Length overrun** (1107 → 1489 lines), all repair content | **Acceptable, not a finding.** I sampled the growth: §4.1a, §4.2(1)–(5), §6.9, §6.10, AC-86…AC-92 and the §6.8 blocking table account for nearly all of it, and each is content a finding required. The real cost is stranger-law load — 92 AC rows, 68 dispositions and 29 V-questions is at the edge of what a stranger can restate — and §7 doc 1's overview plus doc 10's traceability index are the right mitigation. **O-36** notes that doc 1's spine no longer covers the whole base, which is the first symptom of that load. |
| 2 | **O-10 resolved via option 1** (composition + conformance in S0) | **Acceptable, and the better of the two options I offered** — it keeps every slice from S0 onward a legal serve path and makes rule (iii) statable, which the alternative (a non-serving harness) would not have. But the choice has two consequences the repair did not carry through: it pulls AM-1's explicitly-blocked conformance-sampling rule into S0 (**O-30**), and it leaves Q53 outside the ordered chain S0 claims to demonstrate (**O-35**). Not a deviation defect; an incomplete propagation of the choice. |
| 3 | **O-1 resolved via option (a)** (`apps/replay` imports no workspace package; own `agg`/σ/product; structural outcomes from frozen rows) | **Not a deviation at all** — option (a) is what my round-1 required modification specified, including the self-contained arithmetic, and the author implemented it precisely and made it CI-enforceable (structural rule 3 + the isolation proof), which is more than I asked. Two things neither of us recorded: the duplicate arithmetic is a second implementation that AC-14/AC-85 forbid without a declared exemption (**O-24** — shared authorship, stated as such), and the rewrite dropped VR-3's operator-independence limb that round 1's text had carried (**O-23** — a regression). |

---

## Residual risks

Not applicable under CHANGES REQUESTED. For round 2, the findings that change
shape rather than wording are **O-24** (one arithmetic or a declared exemption),
**O-26** (frozen head vs mutable progress on `run`), **O-27** (append-only
suppression overlay, and which surface state eviction produces), **O-29** (the
cross-boundary consumer manifest) and **O-31** (organ 4's purity fence). **O-23**,
**O-25**, **O-28** and **O-30** are single-paragraph repairs with real
consequences. The seven MINORs are corrections within the existing structure.

Nothing in Part 1 needs re-opening: all 22 round-1 findings are closed at the
claimed locations, and I did not re-litigate ground passed in round 1.

---

*End of opus-plan-rereview.md — ARCH-V3-R1 / G3, rework round 2 of 3,
2026-08-05. Independent seat; the parallel Codex lens review was not read in
either round. Read-only review: no file other than this one was created or
edited.*
