REVIEW LENS HANDOFF COMPLETE

# Hermes delta-review lens — human-readability / stranger test

## Prior-finding verification

### 1. CLOSED — stale claims that DR-021, DR-044, and DR-047 did not exist

Evidence:
- `spec-pack/ui-boundary-contract.md` §6 C1, lines 989–994, now explicitly withdraws the false claim and says all three rows were re-resolved against the current ledger.
- The former charter contradiction entries were removed; `spec-pack/quality-charter.md` no longer says those DR rows are absent.
- `wayfinder/decisions-ledger.md` still contains distinct DR-021, DR-044, and DR-047 rows.

This specific finding is closed. New stale-current-state claims introduced in the replacement contradiction sections are reported as delta finding 4.

### 2. PARTIAL — the pack still does not have one adopted verdict model, though the ninth honesty surface is repaired

Closed limb:
- `spec-pack/quality-charter.md` §3 A2.7, lines 133–138, now lists all nine honesty surfaces and includes **builds-on-previous disclosure**.
- `spec-pack/requirements-spec.md` §12.6, lines 1361–1374, and `spec-pack/ui-boundary-contract.md` §0/§4 carry the same nine-surface inventory.

Open limb:
- `wayfinder/GLOSSARY.md` still defines neither **verdict state**, **verdict band**, nor **confidence band**.
- `spec-pack/requirements-spec.md` §12.8, lines 1423–1446, is explicitly `CANDIDATE` pending `OD-C-01`, not adopted law.
- `spec-pack/quality-charter.md` VR-2, lines 308–336, still says whether confidence is a second axis, alias, or derived presentation is open.
- `spec-pack/ui-boundary-contract.md` C10, lines 1068–1075, accurately records that the canonical model does not yet exist.

A stranger can now find the proposed distinction, but cannot yet know the product contract. Cosmetic vocabulary convergence is not closure while the governing model remains unruled.

### 3. CLOSED — glossary graph ontology, V2 status, and stale accusations

Evidence:
- `wayfinder/GLOSSARY.md` lines 19–21 now gives V2 one status: prototype, not live, informal reference only.
- `wayfinder/GLOSSARY.md` lines 43–46 now defines claims connected by typed support/attack arrows and explicitly says hierarchy is not the attack relation.
- `spec-pack/ui-boundary-contract.md` C3, lines 1007–1017, withdraws its former accusation against the glossary.
- The former charter accusation that the glossary still described a live race is gone.

The replacement charter claims about the manifest, rather than the glossary, are a new stale-state regression and appear in delta finding 4.

### 4. CLOSED — requirements open-decision rows are now self-contained

Evidence:
- `spec-pack/requirements-spec.md` §23, lines 2437–2453, establishes the four-part shape and states that links are evidence rather than definitions.
- The formerly opaque A rows now define the action, consequence, complete options, and recommendation in ordinary language; examples include `OD-A-01` at lines 2484–2500, `OD-A-06` at 2567–2581, `OD-A-11` at 2646–2662, and `OD-A-19` at 2765–2777.
- The memory rows likewise restate their match levels, payloads, false-link risks, and test meanings locally; examples include `OD-M-02` at lines 2802–2819, `OD-M-09` at 2899–2913, `OD-M-21` at 3054–3064, and `OD-M-24` at 3091–3102.
- `OD-C-01` now makes the answerable model-vs-threshold distinction explicit at lines 3110–3135; `OD-S-02` and `OD-S-03` now explain the behavior and user consequence at lines 3181–3219.

This verdict addresses self-containedness only. Imperative `CANDIDATE` answers in the body remain an authority defect and are reported separately.

### 5. CLOSED — manifest open-decision rows are now self-contained

Evidence:
- `spec-pack/carryover-manifest.md` §12.4, lines 1459–1477, adopts the required behavior / consequence / options / recommendation template.
- The formerly opaque rows now define concrete behavior and stakes locally: `OD-01` lines 1492–1519, `OD-03` lines 1553–1581, `OD-05` lines 1615–1644, `OD-08` lines 1710–1737, `OD-11` lines 1770–1798, `OD-17` lines 1863–1890, `OD-19` lines 1929–1963, and `OD-22` lines 1996–2025.
- Candidate vocabularies and worked numeric consequences are included where the choice needs them.

The rows are understandable without opening research. Their safe-interim authority is a separate issue under delta finding 1.

### 6. CLOSED — UI/charter register omissions and non-answerable choices

Evidence:
- `spec-pack/ui-boundary-contract.md` §3 D-1, lines 257–286, now puts the death-list scope decision into the register with behavior, consequence, options, and recommendation.
- W2, lines 931–937, includes D-1 in the closure dependency.
- UI row 5(d), lines 638–661, now explains composition/template consequences for replay, conformance, components-only serving, and readability.
- UI row 6(b), lines 715–736, preserves DR-019's binding menu-plus-free-text rule and asks only where/how that pair appears.
- UI row 9(b), lines 897–918, now states what happens to already-pulled facts and rejects disclosure-only detach unless the payload is provably empty.
- `spec-pack/quality-charter.md` VR-4, lines 349–359, has no broken `§8.7` reference and defines the three shipped-flag units before proposing exemption authority.

The specific omissions are closed. New closure-count arithmetic drift is reported as delta finding 5.

### 7. CLOSED — the Quality Charter now supplies its acceptance vocabulary locally

Evidence:
- `spec-pack/quality-charter.md` §1, lines 41–84, defines receipts, execution digest, load-bearing node, stranger coverage, strength, value overlay, register changes, swappable semantics/strategy interface, operators, scorecard, Stage-11 job, proper score, abstentions/marks, protected core, all eight house rules, and P-D1…P-D5.
- The acceptance sections state observable pass/fail behavior rather than delegating all meaning to sibling artifacts; examples include A1.1–A1.5, A2.1–A2.7, the five no-orphan gates, and the G3 fixture table.

A new authority error in A2.4 is not a vocabulary failure; it is reported as delta finding 2.

### 8. CLOSED — manifest knob batch 3 is attributed to DR-021

Evidence:
- `spec-pack/carryover-manifest.md` §13.2, lines 2074–2081, explicitly assigns budget override, visible fallback, per-run ownership, and graph measurement quota to DR-021 and calls out the prior misattribution.
- The traceability index at line 2135 assigns the same four values to DR-021.
- DR-030's traceability row at line 2143 is now limited to composition and the final organ↔stage table.

## Authority-machinery spot check

Fifteen tags were checked against the current decisions ledger and the artifacts' own authority rules:

| # | Location | Tag | Verdict | Evidence |
|---:|---|---|---|---|
| 1 | requirements §5.5 F-10 | `RULED(DR-053)` | Correct | DR-053 creates the typed dual act and narrows the value terminal route to pure value acts. |
| 2 | requirements §10.2 C-5a | `RULED(DR-050)` | Correct | DR-050 sets K=1 and `LEVERAGE_UNRESOLVED`. |
| 3 | requirements §10.5 C-15 | `RULED(DR-056)` | Correct | DR-056 closes cycle handling at construction, compute, and write. |
| 4 | requirements §12.1a S-7 | `RULED(DR-049)` | Correct | DR-049 sets max recomposition to 2 and components-only + DEFECT. |
| 5 | requirements §12.3 S-11 | `RULED(DR-051)` | Correct | DR-051 separates ledger-unknown abstentions from parallel condition marks. |
| 6 | requirements §12.6 S-22–S-24 | `RULED(DR-054)` | Correct | DR-054 establishes projections by default and an authorized full-bundle handle. |
| 7 | requirements §14.4 L-12 | `RULED(DR-055)` | Correct | DR-055 makes real different-maker critique a standard+ launch gate. |
| 8 | requirements §17.1 M-3 | `CANDIDATE(OD-M-22)` | Incorrect form | The clause says a match **never** marks, skips, or substitutes, despite R-AUTH-2 forbidding imperative candidate language. |
| 9 | requirements §17.4 M-13 | `CANDIDATE(OD-M-10)` | Incorrect form | “The prior served prose is never fed to any model” is an imperative answer to the open row. |
| 10 | manifest §4.2(d) | `RULED — DR-056(b) · DR-042` | Correct | The three cycle layers and shared-crux redirect match the two rulings. |
| 11 | manifest §5.2(g) | `RULED — DR-055` | Correct | Standard+ real different-maker critique is a launch requirement; degraded operation is labeled. |
| 12 | manifest §4.4, abstained children | `CANDIDATE(OD-07)` | Incorrect form | The “interim” orders the parent number withheld and components served before OD-07 is ruled. |
| 13 | UI §1.1 item 1 | `RULED(DR-054)` | Correct | Typed projections and authorized on-demand inspection are the exact wire ruling. |
| 14 | UI §1.3 E3 | `CANDIDATE` | Incorrect form | “An event's payload is used or not sent” is written as a binding law and has no counted closure row. |
| 15 | charter §3 A2.4 | `RATIFIED(DR-018)` | Incorrect | DR-018 rules whole-graph scope, not a four-field payload with a per-node action consequence; that payload is still candidate `OD-S-06`. |

Result: the §26 audit table is useful but not complete. It records earlier collisions while current body clauses still answer open rows imperatively.

## Delta findings

### 1. CRITICAL — `CANDIDATE` text still imposes build obligations outside the DRAFT registers

**Locations:**
- `spec-pack/requirements-spec.md` R-AUTH-2, lines 153–156; §17 preface, lines 1916–1920; Candidate M-3, lines 1943–1947; Candidate M-13, lines 2011–2015; Candidate M-14, lines 2017–2022; Candidate M-17, lines 2043–2050.
- `spec-pack/carryover-manifest.md` authority definition, lines 89–98; §4.4 abstained-children row, line 352; §5.2(a), lines 416–426; §6.2 perspective container interim, lines 654–658; §9.2(e), lines 1000–1005.
- `spec-pack/ui-boundary-contract.md` §1.3 E3, lines 186–188; §1.4 L3, L4 and L8, lines 210–215.
- `spec-pack/requirements-spec.md` §26, lines 3408–3465, which claims the collisions are resolved.

**Evidence:** The shared delta packet makes any imperative `CANDIDATE` a finding. The requirements spec's own R-AUTH-2 says a candidate never uses “must”, “requires”, “prohibited”, or “blocking”. Yet Candidate M-3 says a prior match **never** marks a row satisfied, **never** skips work, and **never** substitutes for judgment; M-13 says prior prose is **never fed** to a model; M-14 says wide-match/deep-payload is **prohibited**; M-17 declares only two inputs admissible. The manifest's candidate/safe-interim text likewise selects operative behavior before V rules. The UI labels E3/L3/L4/L8 candidates while wording them as contract-wide laws, and those candidates are not routed through its counted DRAFT register.

The requirements preface cannot cure this by saying imperative wording merely describes an option: that directly contradicts R-AUTH-2 and the review packet's explicit test. A builder reading the body is still ordered to implement one option.

**Fix:** Rewrite every candidate body clause in conditional option language (“under option a, the system would…”), remove all pre-ruling safe-interim mandates unless a DR independently authorizes them, and add every still-needed UI candidate to the counted closure register. Re-run §26 mechanically against all candidate spans, not only the 44 historical rows.

### 2. HIGH — the charter falsely ratifies one answer to the still-open restatement schema

**Locations:**
- `spec-pack/quality-charter.md` §3 A2.1, lines 112–118, and A2.4, lines 123–125.
- `spec-pack/requirements-spec.md` §12.7, lines 1383–1421, and `OD-S-06`, lines 3259–3277.
- `spec-pack/ui-boundary-contract.md` §1.2 Node, line 136, and C11, lines 1077–1087.
- Authority: `wayfinder/decisions-ledger.md` DR-018, line 57.

**Evidence:** A2.4 is tagged `RATIFIED(DR-018)` and requires every restatement to contain claim, certainty, what would change it, **and what to do differently**. DR-018 only amends the scope to every node and verdict; it does not adopt a payload schema or require a per-node action consequence. The requirements spec explicitly marks the schema `CANDIDATE` and routes the action-consequence scope to `OD-S-06`, recommending verdict-only. The UI's C11 correctly says this remains undecided.

A2.1 also says every node **carries** a restatement while A2.2 says non-load-bearing nodes are sampled; the UI correctly distinguishes “every node is restatable” from “every node carries a checked restatement.” The charter therefore gives a stranger a mandatory four-field implementation that the canonical source says V has not chosen.

**Fix:** Demote the field-list and carry-everywhere claims to `PROPOSED TEST`/candidate pending `OD-S-06`; state only DR-018's ruled whole-graph scope as ratified; distinguish a node's ability to be restated from the sampled check result and payload presence. After V rules, make all four artifacts cite the one adopted schema.

### 3. HIGH — the supposedly exhaustive DR-051 mapping table omits typed states minted elsewhere in the same spec

**Locations:**
- `spec-pack/requirements-spec.md` §12.3 S-12/S-13, lines 1273–1295.
- Typed states outside that table: `UNPRICED` at lines 216 and 2322–2324; `UNADJUDICATED` at lines 280 and 885–889; `UNCOVERED-SCOPE` at lines 269 and 955–960; `non-comparable` at lines 308 and 1068–1071; `NOT_SAMPLED` at lines 1403 and 1418–1421.
- `spec-pack/ui-boundary-contract.md` §1.2 Condition marks, line 148, and C12, lines 1089–1096.
- Authority: `wayfinder/decisions-ledger.md` DR-051, line 35.

**Evidence:** S-12 says every typed non-answer state maps to exactly one of three homes and residue is impossible. S-13 says an unplaced state is a specification defect. The table does not place the five states above. UI C12 independently identifies four additional required labels absent from its seven-member condition-mark list: unresolved-type fallback, independent-critique-unavailable, off-subject downgrade, and amended-search notice. Thus the current pack simultaneously claims closure and records an open tail.

This is not a DRAFT-register product choice: DR-051 already rules exhaustiveness, and the merge addendum assigns the table to requirements §12.3.

**Fix:** Inventory every backticked/typed state across all four artifacts and place each exactly once as abstention kind, condition mark, terminal route, check status, or another explicitly ruled channel. Make the enum literal rather than “and peers”/ellipsis; have the UI resource import that exact membership; add a mechanical no-unplaced-state check.

### 4. HIGH — the rework introduced stale contradiction sections that refute current files

**Locations and current refutations:**
- `spec-pack/carryover-manifest.md` §16 items 1–2, lines 2184–2196, say the 17 rows have no routing and the DR-051 mapping table does not exist. `reviews/merge-verdict-pack.md` ORCH ROUTING ADDENDUM, lines 82–87, formally routes the 17 rows and assigns/records the table in requirements §12.3; the table exists at requirements lines 1277–1291.
- `spec-pack/ui-boundary-contract.md` C4, lines 1019–1025, says the sibling manifest still attributes knob batch 3 to DR-030. The current manifest fixes it at lines 2074–2081 and 2135.
- `spec-pack/quality-charter.md` §9 items 1–2, lines 374–380, says the current manifest still carries a live race and stale OD-13 owner. The current manifest purges the race at lines 28–35 and 1373–1385 and reroutes OD-13 at line 1484.

**Evidence:** These are presented as present-tense pack contradictions, not historical withdrawn entries. They were not re-verified after the current files and merge addendum landed. A stranger is explicitly instructed that the pack disagrees with itself where it no longer does.

**Fix:** Re-verify every contradiction entry against the final current inputs; withdraw or rewrite these entries with dated disposition text, following UI C1/C3's good pattern. Add a final stale-claim audit for every phrase such as “does not exist”, “still”, “no owner”, “queued”, and “current”.

### 5. MEDIUM — closure arithmetic is inconsistent in both the manifest pointer and the UI register

**Locations:**
- `spec-pack/requirements-spec.md` §23 cross-reference, lines 2466–2476, says the manifest stands at **21 open rows**.
- `spec-pack/carryover-manifest.md` §12.4, lines 1476–1488, says **17 rows are open** and lists six closed/rerouted rows; `reviews/merge-verdict-pack.md` addendum lines 82–84 also says 17.
- `spec-pack/ui-boundary-contract.md` §3 D-1, lines 257–258, calls D-1 “decision 1 of **28**”; W2 at lines 931–937 and acceptance item 6 at lines 1140–1142 say **29** flex cells plus D-1 = **30**.

**Evidence:** The authoritative current manifest inventory is 01–09, 11, 12, 16–20, and 22: 17 rows. The requirements pointer's 21 is stale. In the UI, the same D-1 cannot be both 1 of 28 and the thirtieth total decision. These counts are closure gates, not editorial trivia: a wrong denominator lets a choice disappear or makes acceptance impossible.

**Fix:** Generate register totals from stable row IDs rather than prose. Change the requirements pointer to 17; change D-1's local count to 1 of 30 (or remove ordinal wording); add an exact list/checksum of the 29 flex-cell IDs plus D-1.

## Per-artifact verdicts

1. **`spec-pack/requirements-spec.md` — LENS CHANGES REQUESTED.** The open rows are now self-contained and the new coexistence rulings are generally clear, but imperative candidates contradict its own authority law, the canonical verdict model remains unadopted, the DR-051 closure table is not exhaustive, and the manifest-register count is stale.
2. **`spec-pack/carryover-manifest.md` — LENS CHANGES REQUESTED.** The register and knob attribution are repaired, but candidate safe-interim behavior still selects open options and §16 contains current-state claims refuted by the merge addendum and requirements spec.
3. **`spec-pack/ui-boundary-contract.md` — LENS CHANGES REQUESTED.** The death-list decision and prior UX-choice explanations are repaired, but contract-wide candidate laws remain imperative and uncounted, C4 is stale against the current manifest, and the closure denominator disagrees with itself.
4. **`spec-pack/quality-charter.md` — LENS CHANGES REQUESTED.** Vocabulary and the nine honesty surfaces are repaired, but A2.4 falsely ratifies the still-open restatement payload and §9 teaches two manifest contradictions that the current manifest has already removed.

## Pack verdict

**LENS CHANGES REQUESTED.** Seven of eight prior findings are closed and the eighth is materially improved, but the authority rework does not yet hold under its own test. Open choices are still expressed as mandatory body law; one charter acceptance item is attributed to a DR that did not decide it; the allegedly exhaustive condition-state partition has unplaced states; and three artifacts carry stale “current contradiction” claims. A stranger can understand much more of the pack than before, but still cannot reliably distinguish adopted law from a seat's preferred option or trust the packet's own closure counts.

I did not re-adjudicate substantive choices inside the DRAFT—V RULES registers, the known `stage11Rollout` / Q27-vs-knob-8 items, or the two new ORCH ROUTING ADDENDUM register rows.
