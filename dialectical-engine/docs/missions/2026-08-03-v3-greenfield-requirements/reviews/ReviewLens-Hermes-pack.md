REVIEW LENS HANDOFF COMPLETE

# Hermes pack-review lens — human-readability / stranger test

## Per-artifact verdicts

1. **`spec-pack/requirements-spec.md` — FAIL.** The main narrative is unusually careful about plain-language restatement, but the open-decision register fails its own self-containedness standard in multiple rows, and the verdict/confidence vocabulary is not closed coherently across the pack.
2. **`spec-pack/carryover-manifest.md` — FAIL.** The organ descriptions are generally restatable, but a material subset of the V-facing open register requires unstated local jargon or research context, and two passages attribute knob batch 3 to the wrong DR.
3. **`spec-pack/ui-boundary-contract.md` — FAIL.** The nine flex rows are strong reader-facing descriptions, but the artifact contains a factually stale authority warning, one uncounted `DRAFT—V RULES` decision, and several V choices whose consequences are not stated well enough to choose unaided.
4. **`spec-pack/quality-charter.md` — FAIL.** It omits one of the nine honesty surfaces, depends on vocabulary not available in the glossary, contains a broken forward reference, and repeats authority/glossary contradictions that are false against the current inputs.

## Pack verdict

**FAIL.** A stranger cannot yet read `GLOSSARY.md` plus any one artifact and reliably restate the complete obligation. More seriously, the four verdict surfaces do not tell one canonical story: “verdict band” and “confidence band” are both required but never distinguished, and builds-on-previous disclosure is mandatory in the spec and UI contract but absent from the charter’s honesty-surface acceptance list.

I did **not** count the queued manifest race-framing rework, `stage11Rollout` lacking a DR, Q27 versus knob 8, or the substantive product choices already recorded inside the pack’s `DRAFT—V RULES` registers. Findings below concern readability, false current-state statements, broken references, register self-containedness, and cross-artifact coherence.

## Numbered findings

### 1. CRITICAL — Two artifacts tell the reader that three DR rows do not exist, but all three exist in the authority file

**Exact locations:**
- `spec-pack/ui-boundary-contract.md` §6 C1, lines 745–755.
- `spec-pack/quality-charter.md` §8 items 1–2, lines 269–274.
- Refuting authority: `wayfinder/decisions-ledger.md` DR-021 at line 59, DR-044 at line 39, and DR-047 at line 36.

**Evidence:** The UI contract says DR-021, DR-044 and DR-047 have no ledger rows and are embedded in DR-030, DR-046 and DR-048. The charter repeats that claim. The supplied ledger has distinct, explicit rows for all three IDs. These are not harmless historical notes: both passages teach a stranger where governing law lives, and they teach the wrong lookup path.

**Concrete fix:** Delete or rewrite the stale contradiction entries against the current ledger. Add a pack check that every claim of “missing DR,” every DR link, and every DR range is resolved against the ledger before review.

### 2. HIGH — The four verdict surfaces do not define one verdict model

**Exact locations:**
- `spec-pack/requirements-spec.md` §12.5, lines 1099–1117; §23.C `OD-C-01`, line 2104.
- `spec-pack/carryover-manifest.md` §12.4 `OD-13`, line 1338, plus “top confidence band” obligations at §§5.2/9.2.
- `spec-pack/ui-boundary-contract.md` §1.2 Answer resource, line 101, and §2 surface 1, line 182.
- `spec-pack/quality-charter.md` §2 A2.7, lines 78–81, and §7 VR-2, lines 225–252.
- `wayfinder/GLOSSARY.md`: no definition of either “verdict band” or “confidence band.”

**Evidence:** The UI contract requires an Answer to carry both a “verdict band and verdict state” **and** a separate “confidence band.” The charter proposes verdict states `SUPPORTED / CONTESTED / UNSUPPORTED`; the requirements and manifest discuss supported/unsupported boundaries and repeatedly cap a “top confidence band.” No artifact says whether confidence is a second axis, an alias, a derived presentation, or the same band under another name. A stranger cannot know which field DR-014 caps or whether a `CONTESTED` verdict can have a top confidence band.

The same surface drifts on membership. Requirements §12.5 and UI flex row 9 include **builds-on-previous disclosure** as the ninth honesty surface. Charter A2.7 lists only eight and omits it, despite presenting the list as what must “reach the reader.”

**Concrete fix:** Add one canonical verdict model to the glossary and link all four artifacts to it: define verdict state, verdict band, confidence band, abstention, allowed combinations, and which gates cap which field. Make the charter’s A2.7 list exactly match the nine-item canonical honesty-surface list, including builds-on-previous disclosure.

### 3. HIGH — The glossary gives a stranger the wrong graph ontology and an internally inconsistent description of V2

**Exact locations:**
- `wayfinder/GLOSSARY.md` “V2,” lines 19–20; “The race,” lines 32–36; “Node-by-node reasoning,” lines 42–45.
- `spec-pack/ui-boundary-contract.md` §4 row 3, lines 349–390, especially “not as a child in a list.”
- `spec-pack/carryover-manifest.md` §§3 and 6: one graph with nodes and typed arrows.
- `spec-pack/quality-charter.md` §0, lines 14–18.
- Stale claims about the glossary: UI contract §6 C3, lines 768–774; charter §8 item 6, lines 283–285.

**Evidence:** The glossary says each claim has “supporting and attacking children.” The governing graph story says attacks/supports are first-class typed arrows and explicitly says an attack is **not** represented as a child in a list. A stranger starting with the glossary will restate the obsolete tree model.

The glossary also calls V2 the “current, working debate engine” and a frozen “control arm,” while its updated race entry calls V2 a prototype reference, and the charter says V2 is “not live.” Meanwhile the UI contract and charter still claim the glossary describes the race and golden-vector framework as live, which the current glossary no longer does. The packet therefore contains both the repaired text and stale accusations that it is unrepaired.

**Concrete fix:** Rewrite the node entry as “claims connected by typed support/attack edges; hierarchy is not the attack relation.” Give V2 one canonical status sentence consistent with DR-047. Remove the stale glossary-contradiction claims from the UI contract and charter after verifying the current glossary.

### 4. HIGH — The requirements open-decision register is not self-contained for V

**Exact location:** `spec-pack/requirements-spec.md` §23, especially blocks A–D, lines 2047–2114.

**Evidence:** The following rows cannot be answered from the row itself plus the glossary because the decision object, option consequence, or referenced mechanism is not defined:

- `OD-A-01` (“census,” “applied-kinds set difference,” and the proposed scalar are not identified); `OD-A-02`–`03` (what the stamps order and what “the diff” compares are unstated); `OD-A-04` (the telemetry being classified is not named); `OD-A-06`–`07` (the Q34 identity/stance limb and “stance-blind appraisal” are not described); `OD-A-08` (“disposition-rate disparity conditional on observables” and “under-identification” are research shorthand); `OD-A-09` (neither fixture nor passing behavior is defined); `OD-A-11`–`14` (“served lane,” “measurement lane,” “panel,” “soft routing,” “exploration floor,” “logged propensities,” and the critic exemption’s operational effect are not defined); `OD-A-15` (“the prior rule” is not named); `OD-A-19` does not explain what making scorecards internal would exempt or what user-visible/replay consequence follows.
- `OD-M-02`–`03` name four match tiers and a “middle band” without restating their matching conditions; `OD-M-05` does not say what normalization changes or the false-link consequence of each source; `OD-M-09` uses “pull,” “settlement facts,” “open triggers,” “graph revival,” and “narrow tiers” without stating what enters the new run; `OD-M-11` uses “load-bearing” and “re-promote” without defining the served consequence; `OD-M-13` assumes the reader understands a DR-015 wake-up; `OD-M-16` uses AIM, falsifiers and the ignorance ledger without stating the resulting behavior; `OD-M-17` again relies on unnamed “two narrow tiers”; `OD-M-21` uses “typed reconciliation,” “artifact-traceable adjustments,” and LOCK/AIM placement without a plain-language consequence; `OD-M-23` gives statistical choices without explaining what false conclusion naive `n` enables; `OD-M-24` names “inertness proof” and “firing proof” but does not restate either test.
- `OD-C-01` asks V to place thresholds without supplying candidate boundaries, required evidence, or a rule for obtaining them; its own charter treatment says numbers cannot be invented. As written it is not an answerable choice.
- `OD-S-02` refers to “the merged contract,” “source appendix,” an “alternate method,” and a permanent-WAIT consequence without saying what Q43 is checking; `OD-S-03` asks about a terminal survivor set using Q numbers rather than restating the three user-visible obligations under decision.

These rows may be understandable after reading §§8, 16 and 17 or the research files. That is exactly the failure under this lens: V’s closure register should not require reconstructing the research design before V can answer it.

**Concrete fix:** Give every listed row a fixed four-part shape: (1) one-sentence behavior in ordinary language, (2) the user/system consequence, (3) complete options with trade-offs, and (4) the seat recommendation or “none.” Expand every codename in the row; retain section/research links only as evidence, not as missing definitions.

### 5. HIGH — The manifest’s V-facing open register also depends on local and research shorthand

**Exact location:** `spec-pack/carryover-manifest.md` §12.4, lines 1313–1354.

**Evidence:** These rows fail self-containedness:

- `OD-01` does not explain what a “cardinality-insensitive aggregator” would do beyond breaking vectors.
- `OD-03` never defines a “perspective container” or the user/scoring consequence of grouping-only versus scored node.
- `OD-05` relies on undefined “strict-and,” “accumulate,” “tie behavior,” and “identity element.”
- `OD-06` relies on M3’s “cluster gate” and does not show what a freely set arrow strength means in a concrete case.
- `OD-08` requires complete-linkage, transitive collapse, polarity scoping, M3, and gaming analysis that only the research link supplies.
- `OD-10` does not restate what the operator combines or what serving components without a parent number looks like.
- `OD-11` never defines the “Leans meter,” so V cannot decide whether to retain it or what its admission rule governs.
- `OD-12` does not state how a numeric ceiling differs in served behavior from a band-only rule.
- `OD-14` relies on an unexplained “shadow-mode precedent” and “handed back” outcome.
- `OD-17` says an “evidence term” is dropped for two unnamed claim types; neither term nor existing types are shown.
- `OD-18` asks which node states enter the graph but supplies no candidate state set.
- `OD-19` uses “rebut” and “undercut” without defining the distinction or its effect.
- `OD-20` supplies neither the candidate claim types nor what passing the evidence gate permits.
- `OD-22` never explains what the engine/operator identifier selects, so per-run versus per-deployment scope has no visible trade-off.

**Concrete fix:** Apply the same four-part V-decision template proposed in finding 4. In particular, include candidate vocabularies and a tiny worked example for arithmetic/graph choices; no option should require opening `research/32-weight-derivation.md` to learn what is being chosen.

### 6. HIGH — The UI and charter DRAFT registers are incomplete or not independently answerable

**Exact locations:**
- `spec-pack/ui-boundary-contract.md` §3 scope note, lines 208–214; §4 row 5(d), lines 495–500; row 6(b), lines 548–553; row 9(b), lines 680–684; §5 W2, line 698.
- `spec-pack/quality-charter.md` §7 VR-4, lines 261–265.

**Evidence:**

- The UI death-list scope note is stamped `DRAFT—V RULES`, asks V to ratify the `DEAD / ABSORBED / NOT-UI-PLANE` reading, but it is not counted in W2’s “27 open user-experience choices” and has no closure row. A V choice can therefore be omitted from the handoff while the artifact claims the register is complete.
- UI row 5(d) asks “composition model or template” without stating the reliability, replay, editability, or conformance consequence of either option.
- UI row 6(b) offers “free text or menu-constrained” even though the same row cites DR-019’s binding menu **and** free-text law. The row does not explain what remains open after that ruling, so V cannot tell whether the choice is presentation, availability, or a proposed override.
- UI row 9(b) offers immediate rerun, mark-for-rerun, or detach-only without stating what happens to facts already pulled into the current answer; the safety difference is the decision.
- Charter VR-4 points to `§8.7`, but there is no section 8.7; the intended target appears to be §8 item 7. The proposal also does not explain whether an off flag is shipped reachable code, dormant code, or configuration data, so V cannot apply the orphan definition consistently.

**Concrete fix:** Add the death-list scope ruling to the counted UI register/W2 dependency. Rewrite the three flex questions around concrete consequences and DR-019’s remaining presentation choice. Repair VR-4’s reference and define the exact shipped unit under consideration before asking whether it is exempt.

### 7. HIGH — The Quality Charter cannot pass its own “GLOSSARY + this artifact” stranger test

**Exact locations:**
- `spec-pack/quality-charter.md` §1 A1.1–A1.2, lines 36–42; §2 A2.2–A2.3, lines 62–68; §3 A3.4, lines 97–99; §5, lines 155–188; §6 S1–S2, lines 192–200; §7 VR-2 and VR-4, lines 225–265.
- `wayfinder/GLOSSARY.md`, which does not define the terms below.

**Evidence:** A stranger given the glossary and charter still has to open the manifest or requirements spec to understand “execution digest” and “receipts”; “load-bearing node” and the run-parameter-derived coverage rate; the “eight Proposal-B rules”; “swappable semantics,” “strategy interface,” “combination operators,” “scorecard,” “Stage-11 job,” “value overlay,” “strength,” “register change,” “proper score,” and the P-D1…P-D5 property suite. VR-2 additionally relies on OD-07, M4 and OD-12; VR-4 has the broken `§8.7` reference. These are obligations, not optional implementation detail.

The charter explicitly promises at lines 20–22 that a stranger can restate pass and fail. For the cited passages, pass/fail is delegated to other artifacts.

**Concrete fix:** Add a short charter vocabulary section defining every acceptance-level term and summarize all eight house rules in one line each. Each acceptance item must state its own observable pass and fail condition; cross-links may provide evidence or detail but must not carry the missing meaning.

### 8. HIGH — The manifest restates knob batch 3 under the wrong authority ID

**Exact locations:**
- `spec-pack/carryover-manifest.md` §13.2, lines 1406–1410.
- `spec-pack/carryover-manifest.md` §15 traceability, line 1474.
- Correct authority: `wayfinder/decisions-ledger.md` DR-021, line 59; DR-030, line 58.

**Evidence:** Manifest §13.2 says “The knobs already ruled (DR-019, DR-020, DR-030)” and then lists budget override, visible fallback, per-run ownership and graph measurement quota. Its traceability row says DR-030 owns knobs 9–12. The ledger places all four in DR-021. DR-030 is the composition ruling. This is exactly the kind of ruling restatement that can rot: the manifest’s plain-language summary sends a stranger to the wrong source.

**Concrete fix:** Replace DR-030 with DR-021 in §13.2 and remove “knobs 9–12” from the DR-030 traceability row; add a DR-021 traceability row covering those four parameters.

## Refutations attempted

1. **“The ledger may really lack those rows; the artifacts may be newer than it.”** Refuted by opening the supplied authority file: DR-021, DR-044 and DR-047 are present as distinct rows.
2. **“Verdict band and confidence band may be synonyms.”** Refuted by the UI contract requiring both fields on the same Answer resource. If they are synonyms, the wire shape duplicates one fact; if not, the pack owes a distinction and combination law.
3. **“Charter A2.7 is illustrative, not exhaustive.”** The sentence says honesty surfaces “are part of being human-oriented” and then enumerates the surfaces that reach the reader; requirements §12.5 and DR-048 treat a fixed nine-item set. Omitting memory changes acceptance coverage.
4. **“A section or research link makes each DRAFT row self-contained.”** A link makes a row traceable, not self-contained. The assigned lens expressly asks whether V can answer without opening a research file. The listed rows omit the meaning or consequence needed to choose.
5. **“The UI’s death-list scope question is already covered by the 27 flex choices.”** It sits in §3, governs eleven death-list entries, and is not one of the three lettered questions in each of the nine flex rows. W2’s count therefore does not include it.
6. **“The glossary’s children language is harmless shorthand.”** UI row 3 makes the opposite representation a user-visible contract: attack edges are “not as a child in a list.” The shorthand changes what object a stranger believes must be built.
7. **“The charter may rely on the complete four-artifact pack.”** Its own law and this review lens require `GLOSSARY.md` plus any one artifact. Cross-artifact links may support a claim; they cannot supply all of its meaning.

## Proof that flips this review

I would flip to PASS when all of the following are shown in the reviewed files:

1. UI §6 and charter §8 are reconciled against the current decisions ledger; no current-state claim says an existing DR is missing.
2. A canonical glossary entry and one cross-artifact table define verdict state/band, confidence band, abstention, allowed combinations and gate effects; requirements, manifest, UI and charter all point to the same model.
3. The charter’s honesty-surface acceptance list contains the same nine rows as requirements §12.5 and UI §4, including builds-on-previous disclosure.
4. Every DRAFT row listed in findings 4–6 is rewritten so V can understand the behavior, consequence, options and trade-offs without opening a research file; the UI death-list ruling is included in the counted closure register.
5. The glossary’s graph and V2-status entries match DR-047 and the one-graph/typed-edge contract, and stale claims about the glossary are removed.
6. The charter defines its acceptance vocabulary locally and all forward references resolve.
7. The manifest attributes knob batch 3 to DR-021, not DR-030.
8. A mechanical final audit reports: all DR references resolve; all section links resolve; each DRAFT choice is counted once; and the nine honesty surfaces have one matching requirement, UI row and charter acceptance hook.
