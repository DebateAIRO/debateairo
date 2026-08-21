REVIEW LENS HANDOFF COMPLETE

# Codex delta review — machine-executability / spec-precision

## Prior-finding verification

### 1. PARTIAL — the requirements spec still gives imperative answers to open registers

The scorecard collisions were substantially repaired: §16.1 K-1 is explicitly `CANDIDATE` for `OD-A-10`; §16.2 K-3 splits the version-key question to `OD-A-17`; K-11 is candidate for `OD-A-16`; and §16.5 K-25 marks G1–G4 and the casual limb of G6 as candidates. The memory clauses in §§17.1–17.6 likewise name their `OD-M-*` rows.

The repair is not complete. Section 17 begins by authorizing imperative wording inside a `CANDIDATE` block, directly contradicting R-AUTH-2 in §2.1 and this review round's explicit rule that an imperative candidate is a finding. Examples include M-2, “The memory key therefore drops `as_of` and `policy_version`”; M-3, “never marks a row satisfied, never skips”; M-9, “V3 never gives two runs the same question identity”; M-13, “prior served prose is never fed”; M-14, “Wide match + deep payload is prohibited”; M-17's “typed admissibility rule”; and M-18/M-24, which are even titled `Requirement` while tagged `CANDIDATE`. K-25 G1–G4 also state the proposed behavior in present imperative form. A builder still has to decide whether “candidate” or “must/never/prohibited” wins.

### 2. CLOSED — Q34 no longer contradicts DR-045

Requirements spec §8.1 A-8 now faithfully requires the model-authored, openly marked explanation, effort grade, and closure suggestion from DR-045. The former A-9 prohibition is explicitly deleted. A-3, A-7, A-11, and A-12 are visibly `CANDIDATE` and point to `OD-A-01`, `OD-A-05`, `OD-A-07`, and `OD-A-09` respectively.

### 3. PARTIAL — §3 distinguishes classification from carried contract, but is not a complete authority proof

Requirements spec §3 now explains the distinction and marks eleven sampled overextensions `[CD]`, including Q3, Q7, Q10, Q12, Q13, Q26, Q31, Q46, Q49, Q53, and Q60. That is a meaningful repair.

It still has no explicit DR column, and many detailed row requirements remain unmarked even though the cited batch DR establishes only classification/riders. The same problem continues in the body: e.g. §16 K-2 and K-5–K-10 are imperative `Requirement` clauses with neither a `RULED` nor `CARRIED-DESIGN` tag, despite §1 saying every normative sentence cites a DR and §2.1 saying every normative clause carries one of the three tags. Section 26 audits the previously reported K/M collisions, not every mandatory clause. It therefore is not the claimed machine-checkable authority map.

### 4. CLOSED — the manifest's organ choices are separated from open decisions

Manifest §§4–9 consistently distinguish `RULED`, `CARRIED-DESIGN`, and `CANDIDATE(OD-n)` for the previously reported organ collisions: operator edge cases (`OD-05`), arrow-strength authority (`OD-06`), interior-node conduction (`OD-02`), provenance width (`OD-09`), way-of-knowing ceiling (`OD-12`), claim normalization (`OD-16`), scored-state membership (`OD-18`), arrow vocabulary (`OD-19`), and evidence suppression (`OD-20`). Cycle handling is no longer open: §§4.2(d), 4.4 and 6.4 carry DR-056's construction/compute/write law.

### 5. CLOSED — monotonicity is mathematically satisfiable

Manifest §4.5 now requires non-increasing attack and non-decreasing support generally, and states strictness preconditions using positive novel contribution, interior `tau`, unsaturated aggregates, non-duplicates, and non-cluster-absorbed arrows. Section 12.2 explicitly requires those preconditions in generators.

### 6. OPEN — the canonical stranger-restatement contract is still contradictory

Requirements spec §12.7 correctly admits that no DR defines the payload and makes the schema/action scope `CANDIDATE` at `OD-S-06`, recommending verdict-only `action_consequence`. The other artifacts do not converge on that authority or shape:

- Manifest §6.2 item 1 still restates a three-field node payload instead of citing the canonical contract.
- UI §1.2 `Node` cites the spec-owned contract but incorrectly labels the payload `RULED(DR-018 R9)`, although the spec says DR-018 rules scope, not fields.
- Quality Charter §3 A2.4 labels four fields on every restatement `RATIFIED(DR-018)`, including “what to do differently”; that is precisely the unruled `OD-S-06` choice.

This is not merely waiting for V: two artifacts falsely claim the open choice is already ruled.

### 7. CLOSED — terminal freshness is transport-neutral

UI §1.3 E4 now requires only that reads/subscriptions after a wake expose current staleness, expressly says it does not require an open stream or polling, and leaves push/pull to flex row 4. W6 implements the invariant first and waits on row 4(a) only to specialize transport.

### 8. CLOSED — browser disclosure now has a ruled boundary

DR-054 closes the product decision. Requirements spec §12.6 and UI §§1.1–1.2/L10 now send typed honesty projections by default, put the complete fact bundle and conformance record behind an authorized inspection/replay handle, and exclude internal prompt material from the default view.

### 9. CLOSED — derived charter machinery is demoted from acceptance law

Quality Charter §0 defines `PROPOSED TEST` as non-blocking pending VR-5. A1.2, A3.2, A3.6, the generalized mechanisms in G1–G4, the `measurement_lane` exemption, A4.1–A4.5, and the upgrade tests are visibly proposed rather than silently ratified. The charter still has separate authority errors, reported below, but the prior finding's gate-expansion defect is repaired.

## Authority-tag spot check (12 tags)

| Location | Tag checked | Verdict |
|---|---|---|
| Requirements §8.1 A-8 | `RULED(DR-045)` | Correct: exact remediation layer. |
| Requirements §8.1 A-7 | `CANDIDATE` / `OD-A-05` | Correct: answer consequence remains open. |
| Requirements §16.1 K-1 | `CANDIDATE` / `OD-A-10` | Correct tag, but prose remains present-tense design nearby. |
| Requirements §16.2 K-3 | candidate version keys + carried remainder | Correct split. |
| Requirements §17.1 M-2 | `CANDIDATE` / `OD-M-01` | **Incorrect form:** stated imperatively (“therefore drops”). |
| Requirements §17.3 M-9 | `CANDIDATE` / `OD-M-07` | **Incorrect form:** “V3 never gives...” is imperative law. |
| Manifest §4.2(d) cycle law | `RULED(DR-056, DR-042)` | Correct. |
| Manifest §4.2(i) sibling restatement | `CANDIDATE(OD-08)` | Correct and non-imperative. |
| UI §1.3 E4 | `RULED(DR-015)` + `CARRIED-DESIGN` | Correct split between freshness and transport-neutral elaboration. |
| UI §1.4 L10 | `RULED(DR-054)` | Correct disclosure boundary. |
| UI §1.2 `Node` restatement payload | `RULED(DR-018 R9)` | **Incorrect:** DR-018 does not rule the payload fields. |
| Charter §3 A2.4 | `RATIFIED(DR-018)` | **Incorrect:** per-node action consequence is open at `OD-S-06`. |

## New findings

### 1. BLOCKER — the authority machinery expressly permits imperative CANDIDATE law

**Location:** requirements spec §2.1 R-AUTH-2, §17 preamble, §§17.1–17.6 M-2/M-3/M-6–M-25; §16.5 K-25 G1–G4; UI §1.3 E3 and §1.4 L3/L4/L8.

**Evidence:** R-AUTH-2 says a candidate never uses “must”, “requires”, “prohibited”, or “blocking”. Section 17 then says imperative wording inside candidate blocks is allowed, and the blocks use “never”, “prohibited”, “must”, and `Requirement` labels. UI L3 says an unknown value “must show” while renderer robustness is `CANDIDATE`; L4 states a “never-parse prohibition” as candidate; L8 requires typed error handling while that limb is candidate. A warning not to build the text does not make an imperative contract machine-unambiguous.

**Fix:** make every candidate grammatical and structural proposal text: “If V selects option X, the implementation would...”. Remove `Requirement` titles from candidates. Add a mechanical lint that rejects imperative/modal obligation vocabulary inside candidate spans across all four artifacts.

### 2. HIGH — the stranger schema has three incompatible authority states

**Location:** requirements spec §12.7/`OD-S-06`; manifest §6.2 item 1; UI §1.2 `Node` and C11; Quality Charter §3 A2.4.

**Evidence:** the spec says the field list and action scope are unruled; the UI calls the payload ruled; the charter calls all four fields per restatement ratified; the manifest still supplies only three. Thus the canonical-schema repair has not happened and two tags are false.

**Fix:** until `OD-S-06` closes, all artifacts must cite the candidate schema without claiming its fields are ruled. After ruling, promote exactly one schema and action scope everywhere.

### 3. HIGH — reworked artifacts contain stale claims contradicted by current authority and current sibling files

**Location:** requirements spec §25 items 3–4; manifest §16 items 1–2; Quality Charter §9 items 1, 2, and 9; UI §6 C4, C10, and C12.

**Evidence:**

- Requirements §25 says DR-053 does not sequence the dual act against the pure-value terminal route and says DR-052 fails to name its DR-019 amendment. The current ledger contains explicit precisions for both: DR-053 narrows the terminal route to pure value acts; DR-052's `supersedes` field names the DR-019 ratchet timing.
- Manifest §16 says its 17 ODs have no routing and DR-051's mapping table has no owner. The current merge verdict's ORCH ROUTING ADDENDUM routes the 17 rows to V and assigns the mapping table to requirements §12.3. (This finding does not re-report the addendum's two new register rows.)
- Charter §9 still says the retired race is live in the manifest and OD-13 points to the retired sitting; the current manifest §§1, 12.1–12.4 has already purged the race and rerouted the band question. Charter item 9 claims DR-055 is tier-ambiguous, but the current ledger precision says degraded single-maker is transient provider-unavailability handling only and never a legal standing standard+ configuration.
- UI C4 says the sibling manifest still misattributes knob batch 3 to DR-030; current manifest §13.2 explicitly corrects it to DR-021. UI C10 promises a canonical verdict model “being defined once, in the GLOSSARY”, but the current GLOSSARY defines neither verdict state/band nor confidence band. UI C12 says DR-051 names seven marks followed by an ellipsis; the current ledger explicitly enumerates the full closed set and assigns closure to the spec mapping table.

**Fix:** re-run every “contradiction” and “open tension” against the current ledger, both merge verdicts, GLOSSARY, and sibling artifacts; withdraw or narrow stale entries with current evidence.

### 4. HIGH — §26 is called a mechanical authority audit but is only a hand-written collision list

**Location:** requirements spec §§1, 2.1, 3, 16, 17, and 26.

**Evidence:** §1 says every normative sentence cites a DR; §2.1 says every normative clause carries exactly one tag; §26 claims the mechanical check. Yet K-2 and K-5–K-10 are untagged imperative requirements, §17 intentionally allows imperative candidates, and §3 lacks an explicit per-row DR authority column while only eleven excess clauses are `[CD]`. Section 26 reports 44 known repairs but does not establish the universal property it claims.

**Fix:** define parseable tag spans for every normative clause, add the DR/authority column to all 71 rows, and generate §26 from a lint that checks untagged obligations, candidate imperatives, missing/final DRs, and open-OD collisions.

### 5. MEDIUM — the UI work plan and acceptance count are internally inconsistent

**Location:** UI §5 W2 and Phase 2; §7 items 4 and 6.

**Evidence:** W2 claims “30 decisions” and §7 claims “29 DRAFT—V RULES cells + D-1”, while the spec and charter each maintain additional cross-artifact open rows that materially determine UI shapes (`OD-S-06`, `OD-C-01`). The UI also says most Phase 2 work is blocked only by W2, although W8/Node rendering cannot freeze before the canonical restatement and verdict models close. A builder following the dependency table can start on types that the pack itself says are unresolved elsewhere.

**Fix:** include explicit dependencies on `OD-S-06` and `OD-C-01` (without duplicating them into the UI's counted register), and state that W1/W3 cannot freeze those resource fields until their owning rows close.

## Per-artifact verdicts

- `spec-pack/requirements-spec.md`: **LENS CHANGES REQUESTED** — candidate imperatives, incomplete authority audit, and stale ledger contradictions remain.
- `spec-pack/carryover-manifest.md`: **LENS CHANGES REQUESTED** — the organ/math rework is strong, but the stranger payload still drifts and §16 contains stale routing/ownership claims.
- `spec-pack/ui-boundary-contract.md`: **LENS CHANGES REQUESTED** — wire and freshness repairs are correct, but candidate clauses remain imperative, schema authority is false, dependencies are incomplete, and several contradictions are stale.
- `spec-pack/quality-charter.md`: **LENS CHANGES REQUESTED** — proposed gates are properly demoted, but A2.4 overclaims DR-018 and §9 contains multiple stale contradictions.

## Pack verdict

**LENS CHANGES REQUESTED.** The rework closes six of the nine prior findings and materially improves two more, but ARCHITECTURE still cannot consume the pack without choosing whether candidate imperatives are law, choosing a stranger-restatement payload that the artifacts assign three different authority states, and detecting stale contradiction records manually. The authority audit is not yet the universal mechanical proof it claims to be.
