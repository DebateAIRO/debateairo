REVIEW LENS HANDOFF COMPLETE
Lens: literature-freshness + MCDA/UX fidelity (Grok 4.5)
Verdict research-opus.md: LENS CHANGES REQUESTED
Verdict research-codex.md: LENS CHANGES REQUESTED

Mission: WEIGHT-RESEARCH-R1 · Round: R2 · Seat: grok-4.5 (cross-review only; did not re-read research-grok.md)

---

## Findings

### research-opus.md

1. **[blocker] packet research-opus.md §(c).3 / [SPEC-G] — MCDA category error: ROC used as DF-QuAD edge multipliers**
   - **Evidence:** Opus applies SMARTER/ROC weights by re-weighting argument edges (`w_top = 1.0`, other values `w_v/w_top`, worked in §(e) E2). ROC / SMARTER weights are surrogate **criterion weights for additive multi-attribute evaluation** (Edwards & Barron 1994; Barron & Barrett 1996): they enter `V(a) = Σ w_j u_j(x_aj)` over option×criterion outcomes, not as multipliers on support/attack edges in a gradual bipolar semantics. Using ROC this way invents a non-standard semantics that the cited MCDA papers do not authorize, and it can change winners for reasons unrelated to the swing-elicitation theory that supposedly grounds the numbers. Opus itself rates SPEC-G “low / weakest link,” but still ships it as the default overlay arithmetic in the worked hinge.
   - **Fix:** Either (i) keep ROC strictly as criterion weights in a separate MAUT overlay over evidence-scored consequences (Codex-style), or (ii) if edge admission is desired, ground it in VAF / higher-order AF rules (Bench-Capon; Modgil; Amgoud–Doder–Lagasquie-Schiex) without claiming SMARTER/ROC provenance for the edge weights. Mark any hybrid as SPECULATION and drop “ROC → edge w” from the recommended path until a formal derivation exists.

2. **[major] packet research-opus.md §(a) SPEC-C / §(d) Q1–Q2 / bibliography — stale gap on 2025–2026 base-score elicitation**
   - **Evidence:** Opus’s strongest structural recommendation is a versioned categorical τ table. Live search confirms Oren & Yun, *Eliciting Rational Initial Weights in Gradual Argumentation* (arXiv:2502.07452, 2025; AAMAS 2026 extended abstract *Bounding Acceptability Degrees…*, ACM doi 10.65109/NSCC6791), which specifically targets (1) difficulty of exact numeric initial weights and (2) users confusing initial weights with final acceptability — and proposes interval elicitation + rationality repair. Codex cites this as [B8]; Opus does not. This is not a decorative cite: it is a first-class alternative (or complement) to “lookup table only,” and it would change the open-decision set (intervals vs points; what “judged” means).
   - **Fix:** Add Oren–Yun (and state whether intervals are admitted before table calibration). If the τ table remains preferred, argue against interval elicitation explicitly; do not leave the freshest base-score elicitation paper out of a 2026 packet.

3. **[major] packet research-opus.md §(b) — AHP / burden ranking MCDA fidelity holes**
   - **Evidence:** AHP is rejected solely via Belton & Gear rank-reversal (real, verified). The packet never states AHP consistency-ratio mechanics (`CI = (λ_max − n)/(n − 1)`, `CR = CI/RI`, conventional accept if CR ≲ 0.1). That is the main operational control that distinguishes facilitated AHP from free pairwise ratios. Also, Flow 0 “Named audiences” (Bench-Capon VAF) is ranked *above* ordinal swing+ROC as a “value-weight elicitation flow,” but it is not an MCDA elicitation method at all — it is a pre-authored value ordering. Mixing VAF product labels into an MCDA burden ranking makes the ranking non-comparable and overstates “zero burden” relative to actual preference construction.
   - **Fix:** Describe CR if AHP is discussed; keep VAF audiences in a separate “no-elicitation product fallback” row, not as rank-2 MCDA; restate the MCDA ranking as hinge-triggered swing → SMARTER/ROC → MACBETH → (optional facilitated AHP with CR + frozen alternative set).

4. **[major] packet research-opus.md §(e) E2 / §(c).5 — UX hinge display partly grounded, partly over-specified as “standard of care”**
   - **Evidence:** Preference-sensitive decision aids and IPDAS-style values clarification (Martin et al. / IPDAS lineage, opus [LIT-52]) legitimately ground: balanced options, values clarification, no single evidence-only winner. The specific served-answer schema (branch table + flip statement + `value_source: unset` ⇒ no scalar) is good product design but is **not** “the standard of care” as a graph-engine display contract — that leap is product invention. Opus mostly marks SPEC elsewhere; §(c).5’s phrasing “This is not a novel UX invention; it is the standard of care…” overclaims.
   - **Fix:** Keep IPDAS as analogy for *requirements* (mark value-decided; show trade-offs); mark the exact branch-set UI as SPECULATION / proposed contract (as Codex does for `VALUE-DECIDED`).

5. **[minor] packet research-opus.md [LIT-56] — overstated content claim on confidence band**
   - **Evidence:** arXiv:2410.09724 (Leng et al., *Taming Overconfidence…*) and arXiv:2604.01457 (*Wired for Overconfidence…*) exist and support verbalized overconfidence / RLHF worsening. The claim that confidence is “concentrated in the 80–100% band” is secondary (opus marks **S**) and was not re-verified as a paper-stated fact under this lens. Using it as a hard driver for “ordinal keys only” oversells.
   - **Fix:** Cite authors for both arXiv IDs; downgrade the band claim to “systematic overconfidence (see …)” unless the primary text is quoted.

6. **[minor] packet research-opus.md completeness vs intake (a)–(g)**
   - **Evidence:** Structure (a)–(g), worked examples, SPECULATION register, and non-negotiables (unjudged→nothing via edge suppression; typed abstention; provenance for numbers) all hold. No blocker on skeleton completeness.
   - **Fix:** None for skeleton; fix findings 1–3 before any “ready” claim.

---

### research-codex.md

7. **[blocker] packet research-codex.md §(c) — value overlay does not sit on the evidence-scored *argument graph***
   - **Evidence:** Intake (c) requires how a value overlay sits **on top of the evidence-scored graph at the nodes where it applies**. Codex defines a clean MAUT stack: `EvidenceResult(option, criterion)` → `ValueProfile` → additive `V(a;w)` with `VALUE-DECIDED` / break-even. That is excellent MCDA, but the hinge is **among alternatives on criteria**, not among **nodes/edges of the DF-QuAD map**. There is no hinge detector on bipolar contention, no rule for which graph nodes receive value tags, and no statement of what a stranger sees *on the argument map* when evidence scores two competing subclaims ~equally. For a product whose served answer *is* an argument map, this is a contract hole, not a style difference.
   - **Fix:** Add an explicit bridge: (i) which graph nodes/subtrees become criteria or alternatives; (ii) when the map itself is the decision object vs when the map only supplies consequence estimates; (iii) how `VALUE-DECIDED` is attached to map nodes (not only to option scores). Prefer keeping MAUT math; do not leave the graph unmentioned.

8. **[major] packet research-codex.md §(a) redundancy / bibliography — missed similarity-aware gradual semantics (would change the recommended algorithm)**
   - **Evidence:** Codex’s redundancy pipeline (hash → embedding → complete-link → lineage max → `F`) is careful engineering but cites only Amgoud et al. KR 2018 similarity [B4] in passing for warnings. It does **not** use Amgoud & David’s three-function **adjustment / aggregation / influence** setting (AAAI 2021; COMMA 2020), which is the literature’s principled slot for similarity before aggregation — Opus’s core structural architecture. Missing that work makes “complete-link + family max” look more free-standing than it is and skips a rationality-constrained alternative that could replace or constrain the cubic clustering recipe.
   - **Fix:** Cite Amgoud–David 2021; state whether the v1 pipeline is an engineering approximation of an adjustment function or a deliberate rejection; add property tests those papers imply.

9. **[major] packet research-codex.md §(b)–(c) — missed 2024–2026 preference-in-argumentation UX/semantics**
   - **Evidence:** Live search confirms: Battaglia, Baroni, Rago & Toni, SUM 2024 (preferences into gradual bipolar personalised decision support); Civit, Rago, Andriella, Alenyà & Toni, arXiv:2602.14674 (2026) base-score extraction from user preferences. Codex never engages them — neither to adopt nor to reject. For a packet whose value layer is pure MCDA, silence on the argumentation community’s actual preference-insertion proposals is a freshness miss that would change §(c) (at least as an explicit rejected alternative, as Opus does).
   - **Fix:** Cite both; keep the “do not launder preferences into τ” rule if desired, but record the rejection.

10. **[major] packet research-codex.md §(b) — AHP retained without rank-reversal / scale caveats; burden ranking incomplete vs literature toolkit**
    - **Evidence:** Codex ranks AHP as flow 3 (high burden) with consistency diagnostics and Aloysius et al. 2006 effort findings [B18] — good. It never mentions Belton & Gear (1983) / Dyer (1990) rank reversal, nor Saaty CR thresholds formally. For an engine that can grow the option set as new arguments appear, rank reversal is not academic: adding an alternative can flip prior rankings without new evidence — a value-layer analogue of fabricated confidence. Also, no MACBETH (qualitative pairwise differences) despite it being the natural non-numeric high-stakes alternative to AHP ratios; intake research brief listed AHP/swing/SMART(SMARTER) only, so MACBETH absence is **major for UX completeness**, not a contract breach.
    - **Fix:** Add rank-reversal warning; state CR formula and 0.1 rule; freeze alternative set if AHP is offered; optionally add MACBETH as non-ratio high-burden flow.

11. **[minor] packet research-codex.md §(b) UX — `VALUE-DECIDED` badge honesty is good; SMARTER confirmation step is well grounded**
    - **Evidence:** Codex correctly labels `VALUE-DECIDED` wording as proposed, not a standard [S6]; cites ValueDecisions (Haag, Aubert, Lienert 2022) and Aubert et al. EJOR 2024 for contribution displays / sensitivity / consistency-loop cognitive load. Under this lens those UX claims **hold**.
    - **Fix:** None; preserve the honesty about badge novelty.

12. **[minor] packet research-codex.md [B7] — author-order slip**
    - **Evidence:** Codex lists Rago, Vasileiou, **Son Tran, Francesca Toni**, Yeoh. Primary listings (arXiv:2410.22209; Scholar) put **Toni before Son/TC Son**. Not fabricated; still a citation-quality defect in a packet that claims all entries VERIFIED.
    - **Fix:** Correct author order from the KR/arXiv record.

13. **[minor] packet research-codex.md non-negotiables & (a)(b)(d)(e)(f)(g)**
    - **Evidence:** Hard `Judged`/`Abstained` gate, `ABSENT` ≠ 0, `VALUE_UNSET` ≠ equal weights, provenance ledger, worked examples, and SPECULATION register all satisfy intake non-negotiables. Skeleton (a)–(g) present.
    - **Fix:** None beyond finding 7 for (c).

---

## Cross-packet contradictions

1. **Where values write.**
   - **Opus:** values reweight **edges** at hinges inside the DF-QuAD graph; never write τ; produce a branch set of graphs.
   - **Codex:** values live in a **separate MAUT profile** over criteria; produce `V(a;w)` and break-evens; graph supplies consequences only.
   - **Verdict under this lens:** Codex’s MCDA math is the literature-faithful use of swing/SMARTER/ROC; Opus’s graph-local hinge detection matches the product surface (argument maps). **Neither is fully right alone.** Required synthesis: Codex-style weights + Opus-style hinge detection on the map; **reject Opus SPEC-G ROC→edge-w** unless re-derived.

2. **Default elicitation flow.**
   - **Opus:** hinge-triggered 0–1 ordinal question (then ROC if needed); named audiences as zero-question fallback; MACBETH high-stakes; AHP rejected.
   - **Codex:** SMARTER first; SMARTS second; AHP third; no hinge-gate, no named audiences, no MACBETH.
   - **Verdict:** Opus’s **burden proportionality** (ask only when evidence doesn’t decide) is superior UX for this product and is aligned with weight-stability / sensitivity practice; Codex’s **SMARTER default when elicitation is needed** is the correct MCDA default. Combine: hinge gate → SMARTER/ROC; do not default to AHP.

3. **Provenance type → number.**
   - **Opus:** provenance type is a **τ-table key** (with verification/source class) — type contributes to the number via policy table.
   - **Codex:** provenance type is a **validator router only**; no uncalibrated type multiplier (`lambda_type` only with calibration artifact).
   - **Verdict:** Codex is stricter against fabricated ordinal hierarchies and matches “type is not quality.” Opus’s table can still be defended as **reviewable policy**, not silent hierarchy — but only if rows are justified and versioned. **Open decision**, not a silent pick; both must state the double-counting risk with corroboration.

4. **Corroboration / redundancy mechanism.**
   - **Opus:** probabilistic sum already maximal-independence ⇒ no sibling corroboration bonus; redundancy = adjustment; corroboration as **τ bucket + sibling collapse** (pick one).
   - **Codex:** cluster → lineage-family **max** → independent families via `F`; unknown lineage collapses (no extra accrual).
   - **Verdict:** Shared anti-double-count spirit. Codex’s family-max algorithm is more implementable and conservative; Opus’s THM-5 “one knob” constraint is the right formal frame. Prefer Codex computation inside an Amgoud–David adjustment slot (Opus architecture).

5. **AHP.**
   - **Opus:** not recommended (rank reversal).
   - **Codex:** high-burden option 3.
   - **Verdict:** Opus is right to demote AHP for a growing argument graph; Codex is right that pairwise methods can help facilitated high-stakes cases **if** alternative set is frozen and CR is enforced. **Do not ship AHP as default.**

6. **Unjudged root / base prior.**
   - **Opus:** allows declared editorial prior τ=0.5 on root with provenance; forbids silent default on leaves.
   - **Codex:** unjudged root ⇒ typed abstention, not a scored answer; every numeric contribution needs judged node **and** relation.
   - **Verdict:** Codex is closer to intake “unjudged → nothing.” Opus’s “declared prior on root is OK” is a product policy that must be an explicit owner decision, not smuggled as semantics.

7. **Counter / scrutiny channel.**
   - **Opus:** DF-QuAD can’t show “challenged and vindicated”; proposes count pair `scrutiny`.
   - **Codex:** unjudged counters visible as `COUNTER_UNJUDGED`; may block serve under skeptic policy; no second float.
   - **Verdict:** Compatible. Both correctly refuse a fake second confidence float.

---

## Citations checked

(Live web / publisher / arXiv checks this seat performed. ≥5 per packet.)

### From research-opus.md

| Cite | Claim checked | Result |
|---|---|---|
| [LIT-1] Rago et al., KR 2016 DF-QuAD | Existence, authors, venue, year | **PASS** — DBLP/ACM/AAAI; formulas consistent with stated F/D |
| [LIT-14] Amgoud & David, AAAI 2021 | Authors, pages 6185–6192, similarity / adjustment setting | **PASS** — AAAI OJS / DBLP |
| [LIT-31] Civit et al., arXiv:2602.14674 (2026) | Exists; base-score extraction from preferences | **PASS** — arXiv abs; content matches §(c) rejection target |
| [LIT-44] Edwards & Barron, SMARTS/SMARTER, OBHDP 1994 | Authors, venue, year, SMARTER rank substitution | **PASS** — ScienceDirect / standard citation |
| ROC weights (via SMARTER / Barron–Barrett) | Formula `w_i=(1/k)Σ_{j=i..k} 1/j`; k=2 → 0.75/0.25 | **PASS** formula; **FAIL application** when used as edge weights (Finding 1) |
| [LIT-42] Belton & Gear, Omega 1983 | AHP rank-reversal shortcoming | **PASS** — ScienceDirect/standard |
| [LIT-50] O’Shea et al., weight stability intervals, ESWA | Existence / topic | **PASS with year niggle** — article exists (ESWA; records show 2025 online / 2026 volume); full author list still thin in packet |
| [LIT-56] arXiv:2410.09724 & 2604.01457 | Papers exist; overconfidence theme | **PASS existence**; **CONTENT OVERCLAIM** on “80–100% band” (Finding 5) |
| [LIT-24] Amgoud, Doder, Lagasquie-Schiex, JAIR 86 (2026) | Weighted higher-order AFs | **PASS** — jair.org doi 10.1613/jair.1.21469 |
| [LIT-30] Alfano et al., arXiv:2605.02551 | Double-ReLU modular QBAF semantics | **PASS** — arXiv abs/html |
| [LIT-20] Yin et al., arXiv:2507.11323 Contestability / G-RAEs | Existence | **PASS** — arXiv:2507.11323 |
| [LIT-32] Battaglia et al., SUM 2024 | Preferences into gradual bipolar | **PASS** — Springer/ACM doi 10.1007/978-3-031-76235-2_2 |

### From research-codex.md

| Cite | Claim checked | Result |
|---|---|---|
| [B1] Rago et al., KR 2016 | DF-QuAD F/D | **PASS** |
| [B2] Amgoud et al., IJCAI 2017 | Weighted AF acceptability / h-categorizer family | **PASS** — doi 10.24963/ijcai.2017/9 |
| [B4] Amgoud et al., KR 2018 similarity | Exists; used for duplicate warning | **PASS** |
| [B7] Rago et al., KR 2025 incompleteness-tolerant | Exists doi 10.24963/kr.2025/49 | **PASS with author-order error** (Finding 12) |
| [B8] Oren & Yun AAMAS 2026 + arXiv:2502.07452 | Interval elicitation / initial vs final weights | **PASS** — ACM doi 10.65109/NSCC6791; arXiv abstract matches use |
| [B10] Al Anaissy et al., AAMAS 2025 impact measures | Authors, pages ~69 | **PASS** — IFAAMAS / AAMAS program |
| [B15] Edwards & Barron 1994 SMARTER | As above | **PASS** |
| [B16] Barron & Barrett, Management Science 1996 ROC | ROC accuracy vs other rank weights | **PASS** — JSTOR/INFORMS |
| [B19] Aubert, Schmid, Lienert, EJOR 2024 | Online MCDA elicitation interfaces / learning load | **PASS** — ScienceDirect |
| [B20] Haag, Aubert, Lienert, EMS 2022 ValueDecisions | Multi-stakeholder MCDA app, sensitivity | **PASS** — ScienceDirect |
| [B18] Aloysius et al., EJOR 2006 | Pairwise more effortful than absolute measurement | **PASS** (metadata; content use is standard and plausible) |

**No fully invented citations found in either packet.** Opus is more careful about verification status (V/P/S/U). Codex’s blanket VERIFIED is mostly earned but overstated for B7 order and for formula-level claims not always re-read in primary PDF.

---

## Refutations attempted (could not break)

1. **Typed abstention ≠ τ=0 / ≠ silent 0.5.** Both packets encode unjudged as non-contribution with visible type. Formal identity of 0 under probabilistic sum (Opus THM-1) and Codex `ABSENT` vs judged-0 distinction both survive attack. Non-negotiable holds.
2. **Centrality / flip-sensitivity as inputs.** Both correctly park influence in explanation layer. Literature (attribution / impact measures [B9]/[B10]; Opus G-RAEs) supports post-hoc use; feeding back as weights would break directionality — agreement stands.
3. **SMARTER/ROC arithmetic (as criterion weights).** Formula and low user burden claims hold under Barron–Barrett / Edwards–Barron.
4. **Swing range-dependence.** “Stored magnitude weights without ranges are non-portable” (Opus [LIT-45] von Winterfeldt & Edwards; Codex §(b) preamble) holds; neither packet can be broken here.
5. **Codex hard gate before aggregation.** Could not find a path from unjudged node to numeric contribution under the stated piecewise `x(i→p)` definition.
6. **Opus THM-9 (unchallenged vs vindicated).** DF-QuAD strength channel really cannot carry scrutiny counts; second channel proposal is coherent (implementation SPEC, not false).
7. **Rejecting preference→τ laundering (Opus C3).** Civit et al. really do map preferences into base scores; given intake provenance rules, rejecting that insertion point is defensible and literature-aware.

---

## Lens summary for Orchestrator (Fable)

| Packet | Verdict | One-line reason |
|---|---|---|
| research-opus.md | **LENS CHANGES REQUESTED** | Strong formal/semantics and honest cites, but **ROC-as-edge-weight is an MCDA misuse**, AHP/burden ranking is fuzzy, and **Oren–Yun interval elicitation (2025/26) is missing**. |
| research-codex.md | **LENS CHANGES REQUESTED** | Strong gates, SMARTER fidelity, and honest `VALUE-DECIDED` speculation, but **value overlay never attaches to the argument graph**, **similarity-adjustment and 2024–26 preference-argumentation literature are missing**, and **AHP lacks rank-reversal controls**. |

Neither packet is citation-fraudulent. Both clear non-negotiable intent. Neither is merge-ready under literature-freshness + MCDA/UX fidelity without the fixes above.
