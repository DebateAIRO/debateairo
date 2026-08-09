REVIEW LENS HANDOFF COMPLETE
Lens: red-team (Grok) · Mission REQ-V3-GREENFIELD-R1 · final pack review
Verdict: **PACK FAIL** (do not treat as ready for V accept until coexistence and termination holes close)

Reviewed (read-only):
- `spec-pack/requirements-spec.md`
- `spec-pack/carryover-manifest.md`
- `spec-pack/ui-boundary-contract.md`
- `spec-pack/quality-charter.md`
- `wayfinder/decisions-ledger.md` (DR-001…DR-048 as present)
- `wayfinder/GLOSSARY.md`
- research on demand (`18`, `32`, `33`, `34` only where cited)

**Not re-reported** (known / queued / inside pack DRAFT—V RULES registers):
manifest race framing; `stage11Rollout` / `OD-S-01`; Q27-vs-knob-8; VR-1…VR-4; OD-A-*, OD-M-*, OD-C-*, OD-S-* content as open rows; UI §4 `DRAFT—V RULES` cells; charter §8 listed contradictions.

---

## Per-artifact verdicts

| Artifact | Verdict | One-line reason |
|---|---|---|
| **1 · requirements-spec** | **FAIL** | High-stakes causal path hits unbounded recompose/re-weigh loops and multi-state non-answer collisions that the row table does not terminate. |
| **2 · carryover-manifest** | **CONDITIONAL FAIL** | Organs are buildable as designs; readiness gate “every OD ruled” + OD-23/DR-042 split leave scoring implementable only by inventing product law. |
| **3 · ui-boundary-contract** | **CONDITIONAL PASS** | Maps 14 surfaces and 9 honesty rows honestly; still inherits serve-composition termination hole and “exactly one of five” vs parallel marks. |
| **4 · quality-charter** | **FAIL** | G3/G5 obligate firing demos the launch table does not name; acceptance is V-taste plus gates with no bound on when composition may stop. |

**Pack verdict: FAIL.** A builder can implement many pieces. A builder cannot, from this pack alone, prove a single high-stakes causal answer both *terminates* and *satisfies every hard gate at once*.

---

## Concrete walk — causal high-stakes through LOCK→SETTLE

**Question (chosen):**  
*“Did Acme’s 2025 return-to-office mandate cause the observed ~15% rise in voluntary exits among senior engineers, and should we reverse it?”*

**Run parameters (forced by pack):** risk tier **high-stakes** (DR-011); question class **causal** (Q8); abstention cell = standard causal seed 0.5 × high-stakes 0.6 → **0.3** (DR-012); split justified (Q10) because cause vs confounders vs HR-policy values; CROSS **always** (DR-019 knob 3); blind verification not budget-skippable (DR-021 knob 9).

### Stage-by-stage (pack-only; no invention)

| Stage | What the pack obliges | Collision / dead-end |
|---|---|---|
| **LOCK** | Q1 action table; Q2 binding; Q3 presuppositions; Q4 frozen answer rule; Q5 prior with no default; Q6 resource envelope + cell | Mixed empirical+value question: Q7 may later route pure `value` to human, but Q1 already mapped “reverse mandate” as an action. No rule says whether a mixed empirical/recommendation question is one settlement act or two runs. |
| **ROUTE** | Q7 settlement act; Q8 causal + R7 field standards; Q9 rivals; Q10 split + stored undivided baseline | If Q7 picks `measurement`, empirical path continues **and** Q50 only fires for comparative/design — the “should we reverse” half has no COMPOSE home except Q57 recommendations. Recommendation without owner is a **defect** (Q57 / V-10), not a band. |
| **AIM/HARVEST** | Frozen queries with disconfirmers; opposition class required; provenance cluster collapse | Fine until WEIGH. |
| **RUN** | Q20–Q25; causal/measurement fires Q37 seven bias domains | If nothing runnable → Q25 “not runnable” abstention. Cell price 0.3 *permits* ready abstention — so honesty is cheap while the asker’s decision is high-stakes. Not a logic bug; a product bite ARCHITECTURE will re-ask V. |
| **SPLIT** | Q26 children+defeaters one act; system-routed defeaters; Q28 cold-reader per child; Q29 falsifier rotation; Q31 rival carver; cap 2 regen / 3 attempts | **Cost product starts here** (Finding 4). Q28 fail → regen → cap → typed not-runnable. That is a legal SERVE outcome, but Q51 still always runs and R9 still blocks if load-bearing restatements fail. |
| **WEIGH** | Per-node judges; M1 no default τ; Q32–Q38; Q34 stamps; UNINSTRUMENTED blocks fairness | Without stamps, Q46 (MACHINE halt) cannot run honestly (pack itself says so). Day-one high-stakes causal either ships a **dead MACHINE gate** or invents telemetry — both pack failures. |
| **CROSS** | Always for high-stakes; Q39 receipt even with no critic; DR-014 cap if no second lineage | Top band unreachable under single-lineage cold start **while** charter wants “best engine on outputs.” Servable, but never top-confidence, on the very questions V will judge hardest. |
| **COMPOSE** | Q45 operator or withhold parent; Q46 leverage halt; Q47 rival operator; Q48 stored baseline; Q49 fragility | **Q46 bounce has no loop bound** (Finding 2). Fragility/leverage are O(nodes) recomputes (Finding 4). |
| **SERVE** | Fact bundle → composition model → conformance judge → recompose **or** defect; R9/Q51/Q53 hard blocks; five abstention kinds exactly-one; honesty surfaces | **Unbounded recompose** (Finding 1). **Stranger prose vs no-invented-hedge** (Finding 1). **Exactly-one-of-five vs parallel typed marks** (Finding 3). |
| **SETTLE** | Q59 external resolver; Q61 never reduces work; memory disclosure | Outcome may never arrive; scorecards stay `basis: NONE`. Capability routing cannot leave cold start on this class — D5’s disease reappears *for this class* until resolution data exists, while process facts still route. |

**Named coexistence failures from this walk:** F1, F2, F3, F4, F5 below.

---

## Numbered findings

### 1. Blocker — Serve-composition recompose has no termination law

**Severity:** Blocker  
**Where:** `requirements-spec.md` §12.1 S-1 steps 3–4; charter A2.5; UI §1.1 items 1–2, L7  
**Evidence:** Pack says mismatch → **recompose or defect flag**. It never states: max recompose count; whether a second fail must defect-flag; whether defect-flagged composition may leave SERVE at all (UI L7 forbids serving as clean; does not say what the user gets); whether R9’s mechanical stranger check runs on pre-composition node text, post-composition prose, or both; whether a conformance “drop this hedge” instruction that makes a load-bearing node fail R9 is resolved by recompose, regen of the node (paying SPLIT cap), or block.  
**Constructed failure:** Composition writes “roughly 15%” for stranger readability; fact bundle has `0.148 ± …`; judge rejects softener (S-3); recompose uses exact figure; R9/A2.4 reject bare numbers in top layer; recompose adds prose; judge rejects unbundled claim; **loop**. Parallel failure: judge accepts text that omits a residual objection present in the graph → Q53 blocks serving while composition “passes” local text↔facts for the sentences it wrote.  
**Concrete fix:** One normative table: `max_recompose = N` (register row); after N → mandatory defect-flag **and** declared serve mode (blocked / serve-with-DEFECT badge / components-only); order of gates **R9 → Q53 → conformance → Q51**; conformance may not demand edits that violate R9; Q53 residual must be a **fact-bundle field**, not optional prose.  
**Refutation attempted:** “Defect flag stops the loop.” Incomplete — without a serve mode for defect-flagged payloads, implementers invent one; without N, recompose burns budget forever under H8’s “cost soft” (cost cannot stop a correctness loop).  
**Proof that flips:** A single worked SERVE state machine (states, transitions, caps) that admits R9 fail, Q53 fail, conformance fail, and defect-flag, with fixtures for each terminal.

---

### 2. Blocker — Q46 halt + Q34 re-verify form an unbounded re-weigh loop

**Severity:** Blocker  
**Where:** `requirements-spec.md` §3.9 Q46; §8.1 A-8, A-13; §10.2 C-5  
**Evidence:** Q46 is MACHINE: highest-leverage least-verified → **halt recombination and return to WEIGH/RUN**. A-8: under-checked side **re-verified under the stricter standard**. No cap on Q46→WEIGH→COMPOSE cycles; no statement that a second Q46 fire on the same node becomes residual/UNINSTRUMENTED rather than another halt. A-13 admits Q46 is dead without Q34 stamps — but when stamps exist and verification remains asymmetric, the halt is live and unbounded.  
**Constructed failure:** Causal graph: one high-leverage HR dataset leaf lightly checked; Q46 returns it; re-weigh deepens it; new highest-leverage confounder appears; Q46 returns again; … until budget. H8 forbids budget killing correctness rows → **run cannot terminate by cost**.  
**Concrete fix:** Bound `max_leverage_return = 1` (or K) per parent per run; excess → serve components + typed `LEVERAGE_UNRESOLVED` residual (not a sixth silent band); join that residual to Q44 and Q53.  
**Refutation attempted:** “graphMeasurementQuota / Stage-6 caps stop this.” They cap SPLIT topics/regens and measurement probes, not COMPOSE↔WEIGH bounce.  
**Proof that flips:** Explicit state machine for Q46 with a terminal other than re-entry, plus a fixture that would loop without the bound.

---

### 3. Blocker — Exactly-one-of-five abstentions cannot absorb concurrent typed non-answers

**Severity:** Blocker (build-time coexistence)  
**Where:** `requirements-spec.md` §3.10 Q55, §6.2 P-2, §12.3 S-7; UI C7 (recorded but unresolved); DR-044 Q55  
**Evidence:** Machine enforces **exactly one** of five abstention kinds per open unknown and residue-free map from Q12. The same pack mints concurrent first-class non-answer marks: `UNINSTRUMENTED` (blocks fairness), `UNFALSIFIED-AFTER-ROTATION`, `SKIPPED-BY-BUDGET`, `NOT_EMPIRICALLY_DECIDABLE`, `INERT`, independent-critique-unavailable, `AMBIGUOUS_ATTRIBUTION`, DEGRADED DIVERSITY. UI keeps separate fields; Q55 still claims exactly-one with no residue.  
**Constructed failure (same causal question):** Leaf A exhaustion-marked UNFALSIFIED-AFTER-ROTATION; leaf B UNINSTRUMENTED symmetry; parent “not runnable” after regen cap; answer still has open value recommendation without owner. Q55 cannot pick one kind without residue; P-2 says residue is a **defect** at serve time — so SERVE fails *because honesty succeeded*.  
**Concrete fix:** Ruling: five kinds apply only to **ignorance-ledger unknowns**; parallel marks are a separate closed enum never forced through Q55; or expand the vocabulary with DR amendment and drop “exactly one of five” as global.  
**Refutation attempted:** “They are different fields so no collision.” Collision is at **ledger consistency** (Q55 enforcement) and stranger serve (reader sees five badges and one abstention kind that cannot name them all).  
**Proof that flips:** One normative mapping table: every typed non-answer mark → either (a) one of five, (b) non-abstention honesty mark, or (c) terminal route — partition exhaustive, residue impossible by construction.

---

### 4. Blocker — Cost product explodes despite named caps

**Severity:** Blocker (operational; will force illegal silent skips)  
**Where:** `requirements-spec.md` §9 preamble; D-1–D-13; §12.1 S-2; DR-019 knobs 1&3; DR-020 knob 5; DR-041; §10.2 C-5/C-6  
**Evidence:** Caps exist for **regen (3 attempts)** and **topics (7)**. They do **not** bound the product:

`children × (Q28 restatement) × (Q29 falsifier rotations) × (Q26 system defeater model) × (Q31 rival carver) × (per-node WEIGH judges [× panel]) × (CROSS always on high-stakes) × (Q40–Q44) × (Q46/Q49 removal recomputes) × (Q47 rival operator) × (composition) × (conformance × recompose) × (stranger sample ratchet-up-only)`

S-2 prices conformance by stranger coverage **and ratchets up on failures** — cost is **monotone non-decreasing** mid-run. Q46/Q49 are full-graph recomputes per examined node. H8 + knob 9: budget may not skip correctness/safety (provenance, abstention typing, standard+ blind verification, citation).  
**Constructed failure:** Depth dial “3”, high-stakes causal, split into 5 load-bearing children → each needs cold reader, falsifier path, defeater obligation; CROSS full; compose recomputes 5 leverage drops; serve composition + conformance on every load-bearing restatement. Token spend is **orders of magnitude** above casual lookup with no legal skip. Implementer will either (a) invent an illegal skip, or (b) time out and violate “everything executed is recorded” with partial digests that still try to serve.  
**Concrete fix:** A **run call budget** that is *visible* and *terminal* (typed enrichment skip vs hard stop with partial serve of components already judged), orthogonal to knob 9; declare which of Q28/Q29/Q31/Q46/Q49/conformance are correctness vs enrichment; freeze conformance sample rate for the run (no mid-run ratchet) or ratchet only on the *next* run.  
**Refutation attempted:** “Asker depth dial is the budget.” Dial raises SPLIT work *and* stranger exhaustive load-bearing *and* measurement quota — it multiplies cost, it does not cap the product above.  
**Proof that flips:** Worked cost envelope for the causal example with upper bounds per stage that still satisfy high-stakes CROSS and R9 exhaustive load-bearing.

---

### 5. Major — Charter G3/G5 vs pack rows: gates with no obligated firing row, rows with no gate catch

**Severity:** Major  
**Where:** `quality-charter.md` §4 G1–G5, A4.1–A4.4; `requirements-spec.md` §22.1 launch table; DR-020 knobs 7–8  
**Evidence:**

| Charter obligation | Pack gap |
|---|---|
| **G3** every blocking/flag path demonstrated firing on real data before ship | Launch table names demos for disagreement, symmetry, cold-start exit, memory inertness/firing, stranger coverage, overlay detachment, zero-call MACHINE. **Missing as launch demos:** Q51 locator block, Q53 hidden-objection block, R9 serve block, DR-014 cap path, DR-015 STALE badge path, budget-skip marker path, citation hard-kill (explicitly **not** live until matcher ships), coverage-as-gate (explicitly deferred). Deferred gates ship as code that **cannot** fire → pure G3 violation on day one. |
| **G5** dead-cost: unit spends tokens whose output no surface/ledger/decision consumes | Conformance judge tokens when result is always “accept” on templated fixtures still cost; panel lane forever (K-25 G1) is *intentional* cost — but G5 has no exemption vocabulary. Risk: G5 deletes the measurement lane charter needs for D5 exit. |
| Spec rows that **no gate would catch** | Composition model invents a familiarity sentence with empty memory (M-23 gate 1 is a *serve* check — if composition runs only when `matched` is false-silent, implementer can omit the field). Mid-run stranger ratchet increasing sample without a G2 call-coverage event for the *new* calls. |

**Concrete fix:** Extend §22.1 with one firing fixture per hard serve block (Q51, Q53, R9, DR-014, STALE); mark deferred gates as **not shipped** until fireable (not shipped-dark); add G5 exemption class `measurement_lane` with named consumer = scorecard.  
**Refutation attempted:** “Z-1 already says every check must fail on purpose.” Z-1 is discipline; G3/A4.4 demand **recorded acceptance-bundle demos**. The launch table is incomplete relative to G3’s own minimum list.  
**Proof that flips:** A4.4 checklist mapping each G3-bound path → fixture id in the acceptance bundle.

---

### 6. Major — Mixed causal + “what should we do” has no single settlement home

**Severity:** Major  
**Where:** `requirements-spec.md` §5.2 F-4/F-5; §3.2 Q7; §3.9 Q50; §15 V-3; §3.10 Q57  
**Evidence:** Q7 records **exactly one** of six settlement acts; `value` stops the empirical path. Causal high-stakes questions almost always carry a decision half. Q50 only triggers for comparative/design. Flow A answers value-conditional **comparisons**, not “reverse the mandate?” after a causal finding. Q57 forbids recommendations without owner.  
**Constructed failure:** Asker wants one answer. Engine either (a) stops at value→human and never measures exits, or (b) measures, serves causal finding, and defects on the recommendation block, or (c) smuggles a recommendation under findings (Q57 violation).  
**Concrete fix:** Explicit product rule: two-phase runs (empirical then value) with one shared graph; or allow dual settlement acts with machine-enforced phase order; or force asker to split the question at Q1.  
**Refutation attempted:** “Q1 maps answer→action so recommendations are implied.” Mapping is not a normative owner for Q57.  
**Proof that flips:** One worked dual-phase disposition that keeps Q7’s exactly-one law without silencing either half.

---

### 7. Major — Manifest readiness vs DR-042 leaves cycle law half-closed for builders

**Severity:** Major  
**Where:** `carryover-manifest.md` §12.4 OD-23, readiness gate; `requirements-spec.md` §10.5 C-13/C-14; DR-042  
**Evidence:** DR-042 / C-13: builder **refuses** cycle-closing edges and redirects to shared-crux — construction-time law. Manifest OD-23 still lists reject / refuse-to-score / cycle-tolerant semantics as open, and readiness demands every OD ruled. Builder of the scoring organ still needs compute-time and storage-time policy when a cycle is asserted by a bug or migration. Spec says “watch OD-23” without closing it.  
**Concrete fix:** Amend OD-23 to “construction: DR-042; compute: typed error never partial; storage: reject at write” as default law, or drop OD-23 from readiness if DR-042 fully owns it.  
**Refutation attempted:** “C-13 is enough.” C-13 is write-path; DF-QuAD eval path and ledger still need a named error (manifest §4.4 already wants typed cycle error — align OD-23 with that text and close).  
**Proof that flips:** Single paragraph superseding OD-23 with DR-042 + typed compute error, marked FINAL.

---

### 8. Major — ARCHITECTURE will still have to ask V (register-orphan decisions)

**Severity:** Major  
**Where:** pack-wide; contrast §23 registers and UI DRAFT cells (not re-listed)  
**Evidence:** Destination claim (intake / DR-001 spirit): ARCHITECTURE starts without new product questions. The following are **product** and **absent** from open registers and DRAFT stamps:

1. **SERVE termination** after conformance/R9/Q53 conflict (Finding 1).  
2. **Q46 re-entry bound** (Finding 2).  
3. **Global call/time envelope** for high-stakes runs that still forbids silent correctness skips (Finding 4).  
4. **Dual empirical+value questions** (Finding 6).  
5. **Whether defect-flagged composition is user-visible, operator-only, or non-servable** (UI L7 + S-1 underspecify).  
6. **Fact-bundle size vs model context** when whole-graph stranger law puts all load-bearing nodes in one composition prompt — truncate? multi-pass compose? which facts drop first?  
7. **Whether panel-lane forever-cost (K-25) is accepted at charter G5** (Finding 5).  
8. **Cold single-lineage high-stakes**: permanent top-band cap (DR-014) vs “best engine” judged on those outputs — is that acceptable product, or must multi-maker be a launch gate?

**Concrete fix:** Add a short **ARCHITECTURE-input register** owned by this mission (or charter S-items) so these are V-closed before coding, not mid-build.  
**Refutation attempted:** “DR-005 says stack is architecture.” These are not stack; they decide what users see and whether runs end.  
**Proof that flips:** V rulings or explicit “ARCHITECTURE may choose within {enumerated options}” for each of 1–8.

---

### 9. Major — Charter G1/G2 vs serve-composition second model as optional-looking cost

**Severity:** Major  
**Where:** charter §4; DR-044; requirements §12.1  
**Evidence:** Conformance judge is mandatory for serve philosophy. If an implementer “optimizes” by shipping composition without judge under a flag, G4 requires the off branch to be production-producible — both branches must be testable. Pack never says the judge is a **correctness row never budget-skippable**. Knob 9 lists provenance, abstention typing, blind verification, citation — **not conformance**.  
**Constructed failure:** Cost pressure marks conformance as enrichment → SKIPPED-BY-BUDGET on the only machine enforcement of stranger-facing prose → A2.5 fails while ledger is “consistent” (skip was recorded).  
**Concrete fix:** Name conformance enforcement a **correctness/safety** row under knob 9 (or sibling law).  
**Refutation attempted:** “A2.5 already requires zero unenforced mismatches.” Without knob-9 membership, budget law permits the skip.  
**Proof that flips:** One sentence in knob 9 / H8 successor list: serve-composition conformance is never budget-skippable.

---

### 10. Minor — Organ↔stage table still vetoable while pack treats it as law

**Severity:** Minor  
**Where:** DR-030; requirements §18 O-7; manifest §3  
**Evidence:** Table is “vetoable at review.” Spec §18 reproduces as given. Three lenses now *are* that review; without explicit confirm/veto, ARCHITECTURE inherits a maybe.  
**Concrete fix:** Orchestrator merge stamps organ↔stage **FINAL** or records a veto.  
**Proof that flips:** One line in merge verdict.

---

## Charter five gates vs spec rows (summary matrix)

| Gate | Obligation | Row / surface that must satisfy it | Gap |
|---|---|---|---|
| **G1** reachability | Every shipped unit named from entry points | UI W19 orphan sweep; death list | Panel-lane and deferred citation matcher need named entry points or “not shipped” |
| **G2** call coverage | Acceptance run calls every unit | Launch demos incomplete (F5) | Conformance + Q46 path + STALE wake not in §22.1 |
| **G3** fireable paths | Real-data fire before ship | DR-032, A2.3, abstention, etc. | Deferred citation/coverage gates; serve blocks under-demo’d |
| **G4** config reachability | Every register branch producible | DR-023 fresh register | Off-by-default vs orphan — charter already flags; not re-opened |
| **G5** dead cost | No token spend without consumer | K-25 panel lane; conformance | Panel lane needs exemption; conformance needs correctness classification |

---

## Serve-composition + conformance loop (failure catalogue)

| # | Failure | Pack says | Missing |
|---|---|---|---|
| L1 | Recompose forever | recompose **or** defect | N, priority, serve mode after defect |
| L2 | Conformance vs stranger | both block/serve laws | conflict order |
| L3 | Conformance vs badge honesty | text must honor facts; badges from fact bundle | composed text may omit badge-backed residual → Q53 |
| L4 | Judge invents “pass” | machine enforces | no requirement judge is different lineage from composer (DR-013 spirit applied only to research/critique) |
| L5 | Budget skips judge | not listed under knob 9 | F9 |

---

## Cost-bomb row combinations (explicit)

| Multiplier | Source | Cap today? |
|---|---|---|
| Children | Q26 | topic 7 (follow-ups), not child count |
| Retries | Q26/Q28/Q29 | 2 rounds / 3 attempts **per regenerate unit** — unit of accounting underspecified (node vs stage) |
| Lineages | Q26 defeater, Q29, Q31, CROSS | maker floor; no global lineage budget |
| Conformance | S-1, S-2 | sample + **ratchet up only** |
| Restatement | R9 / Q28 | load-bearing exhaustive always |
| Removal math | Q46, Q49 | none |
| Rival operator | Q47 | none (cheap if pure) |

---

## Refutations attempted (global)

1. **“Open registers already list hard questions.”** True for OD-A/M/C/S and DRAFT cells; false for termination, Q46 bounds, mixed settlement, conformance-as-correctness, cost envelope (F8).  
2. **“Caps + H8 are enough.”** Caps miss the product; H8 forbids the only escape (cost-stop on correctness).  
3. **“UI C7 already recorded the abstention collision.”** Recording is not a fix; Q55 still asserts exactly-one residue-free as law.  
4. **“Day-one soft-launch skips Stage 11 / multi-maker.”** Then high-stakes outputs V judges under charter clause 1 permanently lack top band and capability weights — product, needs V, not an implementer default.

---

## Proof that flips the pack to PASS

All of:

1. SERVE state machine with recompose cap + defect serve mode + gate order (F1).  
2. Q46 bounded re-entry (F2).  
3. Exhaustive non-answer partition (F3).  
4. High-stakes cost envelope that preserves CROSS/R9 without illegal skips (F4).  
5. G3 demo list complete relative to charter’s own minimum (F5).  
6. Mixed causal+decision disposition (F6).  
7. OD-23 closed or reduced to typed error under DR-042 (F7).  
8. Conformance never budget-skippable (F9).  
9. Organ↔stage stamped FINAL at merge (F10).

Until then: **PACK FAIL** — independent of how strong individual chapters read.

---

*End of single allowed artifact. Silence thereafter is normal; Orchestrator merges.*
