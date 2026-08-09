LENS VERDICT: CHANGES REQUESTED (REWORK ROUND: 1 of 3)

# Codex C4 review — machine executability / spec precision

Mission: ARCH-V3-R1 · stage H4 · reviewed set: `docs/architecture/`

The set is not executable as a frozen architecture. Two blockers remain: the
closed terminal-route vocabulary has conflicting counts and a failing acceptance
test, and the build order allows S0 to appear startable before the conditional
architecture, stack, and bootstrap version pins have been accepted. The remaining
findings are cross-document addressability, ownership, and scope defects that
would force implementers or automation to infer intent.

## Findings

### H-C-1 — BLOCKER — the terminal-route enum is both four and five, and the test suite freezes the wrong side

- **File + location:** `docs/architecture/00-overview.md` §2.1 and §3; `docs/architecture/02-data-model.md` §13, especially line 1095; `docs/architecture/06-test-strategy.md` §5 `FX-LG-04` and §16; `docs/architecture/09-traceability.md` §8.1 G-7.
- **Evidence:** Plan.md AC-65 says `5 abstention kinds + 22 condition marks + 4 terminal routes`, while Plan.md §3.1 context 1 says “the five terminal routes.” The founding pack is also internally split: `requirements-spec.md` §5.2 and DR-037 enumerate five, including depth-zero; §12.3 Home 3 lists only four and omits depth-zero. The authority rule resolves the count: `decisions-ledger.md` DR-037 says **five**, and the ledger wins. Despite recognizing the conflict, `02-data-model.md:1095` and `06-test-strategy.md:281,754-756` normatively assert four; `FX-LG-04` would therefore make the build fail when corrected to the higher-authority five-member vocabulary.
- **Required modification:** In the FinalPlan consolidation and V register, record a directed founding-pack correction: terminal-route count is five under DR-037; add/place the depth-zero route in the §12.3 single-source table or explicitly state why it is not a Home-3 member without contradicting DR-037. Then update AC-65, the data-model enum inventory, overview, traceability, and `FX-LG-04` to one membership list and one count. Do not leave a “count against §12.3” test pointed at the known-incomplete table.
- **OWNING LANE:** 1, 3, 6

### H-C-2 — BLOCKER — S0 has no global acceptance/bootstrap entry gate, and Q-02 is gated unconditionally

- **File + location:** `docs/architecture/07-build-order.md` §0 lines 28–34, §3 S0 row, and §4 S0 “Entry criteria”; compare every file’s CONDITIONAL banner, Plan.md status/§2/§9, and `08-open-questions-for-V.md` Q-01 lines 91–94.
- **Evidence:** The build-order document says slice entry is governed only by predecessors and open questions, and S0 lists Q-01, Q-02, and Q-03. It omits (a) V’s VS-1 steering of the frozen C2 gate, (b) V ratification of the SEAT-PROPOSAL stack/ADRs, and (c) accepted bootstrap values for the runtime/tool pins. Yet every C4 banner says nothing is accepted until V steers, Plan.md says V ratifies the stack, and the register leaves the pins valueless. A builder cannot select a runtime, install dependencies, migrate Postgres, or compile S0 without guessing. Separately, Q-01 says Q-02 becomes live **only if Q-01 is yes**, while build order requires Q-02 regardless.
- **Required modification:** Add a global pre-S0 gate: VS-1 steering recorded; the ADR/stack set accepted or replaced; the bootstrap/toolchain pin mechanism and values accepted; and the resulting contract/register version identified. Make Q-02 conditional on Q-01=yes. If Q-01=no, name the replacement UI-rebuild repository/layout decision that must be recorded before S0 instead of demanding an inapplicable fence answer.
- **OWNING LANE:** 7

### H-C-3 — MAJOR — lanes 2–6 do not implement the C4 question-addressing contract

- **File + location:** all 14 files under `docs/architecture/01-decisions/`; `02-data-model.md` §18; `03-module-design.md` §0/§13; `04-api-contract.md` §17; `05-register-skeleton.md` §§5–6; `06-test-strategy.md` §16. Compare `08-open-questions-for-V.md` §0 line 28 and the lane packet authoring law 5.
- **Evidence:** `08-open-questions-for-V.md` declares `Q-nn` to be the identifier used by **every other C4 document**. Lanes 2–6 instead use only Plan-local ids such as `AQ-1`, `A-8`, `AM-12`, and `OQ-G10`; none of those files contains a `Q-01`…`Q-28` reference. This defeats stable cross-document linking and makes “pending V” markers dependent on a human lookup.
- **Required modification:** Add the complete relevant `Q-nn ↔ Plan source id` mapping to each affected lane and change every behavior marker to `pending V — Q-nn (Plan-id)`. ADR “Questions this ADR does not rule” sections must use the same stable ids. Preserve Plan ids only as provenance, not as the primary C4 address.
- **OWNING LANE:** 2, 3, 4, 5, 6

### H-C-4 — MAJOR — the canonical `FX-*` fixture namespace is disconnected from traceability and build order

- **File + location:** `docs/architecture/06-test-strategy.md` §0 lines 38–40 and §15; `docs/architecture/07-build-order.md` §§4–6; `docs/architecture/09-traceability.md` §§1, 2, and 7 lines 466–483; `docs/architecture/00-overview.md` constraint spine.
- **Evidence:** Lane 6 defines `FX-*` as the canonical fixture-id scheme and supplies a roster. No `FX-*` identifier appears in `00-overview.md`, `07-build-order.md`, or `09-traceability.md`. The traceability contract is DR → requirement → module → table → endpoint → **test**, but its test leg uses prose such as “completeness-gate pair” and “eviction fixture.” Automation cannot join these rows to lane 6, and similarly worded fixtures cannot be distinguished.
- **Required modification:** Put exact `FX-*` ids in each per-slice gate/done condition in `07-build-order.md` and in every fixture cell of `09-traceability.md`, including AC-86…AC-92. Add exact ids to the overview spine where it points to acceptance. Create new lane-6 ids for adjudicated real fixture gaps (AC-25, AC-31, AC-89, and AC-90’s no-live-node limb), then consume those ids in lanes 1 and 7.
- **OWNING LANE:** 1, 6, 7

### H-C-5 — MAJOR — the register does not contain executable toolchain keys, and the acceptance bundle cannot read the register

- **File + location:** `docs/architecture/05-register-skeleton.md` §5.4 line 372, §5.6 lines 391–403, §7 G-5; `docs/architecture/03-module-design.md` §3.1 row 25 and §13 G-2; ADR-0001 “Consequences”; Plan.md §2.7.
- **Evidence:** ADR-0001 and Plan.md say Node LTS, pnpm, Postgres major, and TypeScript are pinned as **register rows**. The key inventory represents all four as one prose row named “Runtime/tool version pins,” then counts it as one of 48 keys. It supplies no stable key for any of the four, so a run/build cannot reference or audit the pins. Separately, the authoritative dependency graph permits `tools/*` to read only `kernel` and `contract`, while S15 requires `tools/acceptance-bundle` to present the register for ratification. Both lane-4 files recognize the contradiction and leave it unresolved.
- **Required modification:** Split the aggregate entry into four stable keys, update inventory/provisional/total counts, and state the bootstrap location from which tooling can read them before the database-backed register is available. Distinguish runtime/deployment pins from dependency versions pinned by the lockfile (Fastify, Drizzle, Vitest, fast-check, Testcontainers, ESLint, etc.). Resolve the acceptance-bundle edge explicitly: direct read-only `register` dependency, a declared API/artifact input, or a separate register-export artifact; update the authoritative dependency graph and fixtures accordingly.
- **OWNING LANE:** 4

### H-C-6 — MAJOR — lane 3 refuses a data-model choice its scope assigns

- **File + location:** `docs/architecture/02-data-model.md` §7.9 lines 918–927 and §19 item 5; Plan.md §7 row 3.
- **Evidence:** The document leaves `answer_index` undecided between a base table and a view and calls that a Plan gap. Plan.md §7 row 3 expressly assigns lane 3 the per-schema table shapes, indexes, append-only mechanics, and canonical owners. Nothing in the pack requires V to choose between those implementation-equivalent carriers, while AC-85/AC-88 already rule out an independently writable copy.
- **Required modification:** Choose and name the canonical form under the lane’s SEAT-PROPOSAL authority—most directly, a read-time view/projection over authoritative rows—or state an equally precise materialized-cache invalidation contract. Remove this item from the Plan-gap list and update `09-traceability.md`’s table inventory to the chosen kind.
- **OWNING LANE:** 3

### H-C-7 — MAJOR — the first arrow-order derivation is left ownerless despite Plan.md assigning the materialization boundary

- **File + location:** `docs/architecture/03-module-design.md` §5.1 lines 318–346 and §13 G-3; Plan.md §3.2 Seam A.
- **Evidence:** Lane 4 says either `graph` or `propagation` may derive the first order. Plan.md defines the evaluation snapshot as already carrying the recorded total order and states `graph builds the snapshot; propagation consumes it`. The module’s own signature is `graph.materialiseSnapshot(...) -> EvaluationSnapshot` followed by `propagation.evaluate(snapshot)`. Leaving ownership open contradicts the named materialize → compute boundary and makes the “single place” maintenance test fail.
- **Required modification:** Assign initial deterministic order derivation to `graph.materialiseSnapshot`, with `propagation` consuming the supplied order and rejecting a malformed/non-total one. Keep independent re-derivation only in the property fixture, not as a second production owner. Remove G-3 from the Plan-gap list.
- **OWNING LANE:** 4

### H-C-8 — MAJOR — provisional-number governance is promoted to provisional ordering without authority

- **File + location:** `docs/architecture/05-register-skeleton.md` §5.6 lines 401–403 and §7 G-4 line 424.
- **Evidence:** Charter A5.2 applies the owner/trigger/sign-off triple to every provisional **number**. `orderingPolicy` is a provisional ordering. The register document notes the mismatch but nonetheless makes the full triple mandatory and counts `orderingPolicy` among the seven governed provisional rows. That is a silent promotion of a conservative seat preference to law.
- **Required modification:** Either remove `orderingPolicy` from the A5.2-mandated count, or label extending A5.2 to nonnumeric provisional policy rows as an explicit SEAT-PROPOSAL for V. Do not cite A5.2 as if it already requires the extension. Correct the provisional count after the ruling.
- **OWNING LANE:** 4

### H-C-9 — MAJOR — the open-question artifact exceeds its lane contract with two non-question review dossiers

- **File + location:** `docs/architecture/08-open-questions-for-V.md` “Standing items for V’s morning attention,” SI-1 and SI-2 (lines 753–829).
- **Evidence:** Plan.md §7 row 9 scopes this file to the 28 distinct V questions and calls it the single place V answers them. The lane packet’s source contract is Plan.md §§6/8 and founding citations. SI-1 imports the C2 merge-verdict steering record; SI-2 imports an Opus review’s residual-risk dossier. The file admits neither is an architecture question. This is new scope from review artifacts, and it makes a machine consumer unable to treat the document as the promised 28-entry question register.
- **Required modification:** Remove SI-1 and SI-2 from the C4 architecture file. Keep VS-1 in the mandatory banner and route the steering decision/residual-review record to the mission’s authorized V-decisions packet or FinalPlan consolidation. Preserve exactly the 28 `Q-nn` entries in this artifact.
- **OWNING LANE:** 7

### H-C-10 — MAJOR — gap identifiers collide and no C4 document consolidates all lane gaps

- **File + location:** `02-data-model.md` §19; `03-module-design.md` §13; `04-api-contract.md` §18; `05-register-skeleton.md` §7; `06-test-strategy.md` §3.3; `07-build-order.md` §9; `09-traceability.md` §8.1.
- **Evidence:** Each file restarts at `G-1` or uses bare numbering, so `G-1` means an evidence-schema absence, a dependency-list derivation, a zero-call slice omission, and an AC-89 fixture omission in different files. `09-traceability.md`, the set’s cross-document index, contains only its own seven gaps. There is no stable key that the FinalPlan consolidation or V register can consume, and no way to prove all lane gaps were adjudicated once.
- **Required modification:** Give every gap a globally unique id (the prefixes in the table below are acceptable), add a consolidated gap index to `09-traceability.md`, and carry every **REAL** row into FinalPlan plus the V register as either a directed repair or an explicit V decision. Remove **MISREAD** rows after applying the cited resolution; do not preserve them as open architecture questions.
- **OWNING LANE:** 1

## Gap adjudication

`REAL` means a missing or contradictory contract fact that must enter the
FinalPlan consolidation and V register. `MISREAD` means the cited source already
resolves it or the C4 lane itself owns the choice.

| Gap id | Verdict | Adjudication |
|---|---|---|
| **DM-1** (`02` §19.1, evidence storage) | **REAL** | Plan.md §3.1 context 2 and §8 S6 require persistent query sets, amendments, absence rows, probes, and certification, but §4 gives them no schema/table carrier; add one in FinalPlan/V register. |
| **DM-2** (`02` §19.2, critique/valuation storage) | **REAL** | Plan.md §3.1 contexts 5–6 requires replayable independence receipts, symmetry diffs, objection records, hinges, flows, and reversal points; generic prose fields do not name authoritative persistence homes. |
| **DM-3** (`02` §19.3, composition-map home) | **REAL** | AC-92/manifest §5.2 require the claim-type→composition map to be data, while Plan.md §4 names no table/register row; assign one canonical home. |
| **DM-4** (`02` §19.4, scheduled-judgement input) | **REAL** | AC-11 defines required nodes by a scheduled judgement, but Plan.md §4.3 supplies no action member/field that makes that predicate queryable; add the carrier and enum member. |
| **DM-5** (`02` §19.5, `answer_index` table vs view) | **MISREAD** | Plan.md §7 row 3 assigns lane 3 table shapes and canonical ownership; AC-85/AC-88 rule out an independent writable copy, leaving a lane design choice, not a V gap. |
| **DM-6** (`02` §19.6, eight citation routes) | **MISREAD** | Plan.md §6.1 OQ-G10 explicitly makes membership/ownership pending V (Q-16) and blocks S6; lane 3 must carry no invented members. |
| **MOD-1** (`03` §13 G-1, row-19 dependency expansion) | **MISREAD** | Plan.md §2.6 says the authoritative edge list lives in `03-module-design.md`, and §3.1 supplies stage owners; the lane’s mechanical expansion is exactly its assigned work. |
| **MOD-2** (`03` §13 G-2, tools cannot present register) | **REAL** | Plan.md §2.6’s `tools/* -> kernel, contract` edge contradicts §8 S15’s register-presentation artifact; define an explicit read/input edge. Same defect as REG-5. |
| **MOD-3** (`03` §13 G-3, first arrow-order owner) | **MISREAD** | Plan.md §3.2 says `graph` builds the evaluation snapshot containing the order and `propagation` consumes it; production ownership is already at `graph.materialiseSnapshot`. |
| **API-1** (`04` §18.1, execution pagination) | **REAL** | AC-62 requires real pagination and `GET /v1/nodes/{nodeId}/executions` is unbounded under AC-44; add keyset pagination semantics to Plan/API. |
| **API-2** (`04` §18.2, Investigation endpoint) | **MISREAD** | Plan.md §5.2 already requires the Investigation listing as an `Answer` tier-1 projection; no founding requirement demands a separate collection endpoint. |
| **API-3** (`04` §18.3, three serve records vs two surfaces) | **MISREAD** | `ui-boundary-contract.md` §1.2 records lifecycle/status (`COMPOSED`, `RECOMPOSED_ONCE`, degraded), while §4.0 defines two rendering surfaces; `RECOMPOSED_ONCE` projects to composed without minting a third surface. |
| **REG-4** (`05` §7 G-4, A5.2 for ordering) | **MISREAD** | Charter A5.2 says provisional **number**; applying it to an ordering is a new SEAT-PROPOSAL, not a Plan gap or existing law. |
| **REG-5** (`05` §7 G-5, tools/register edge) | **REAL** | Same contradiction as MOD-2; FinalPlan must choose the acceptance bundle’s register input and update the edge list. |
| **REG-6** (`05` §7 G-6, `stage11Rollout`) | **MISREAD** | The authority rule plus DR-061 `OD-S-01` resolves the stale spec row to phased; Plan.md FLAG-3 already records this correction. |
| **TEST-1** (`06` §3.3, zero-strength-source exclusion) | **MISREAD** | Plan.md §7 row 7 expressly requires the manifest’s generator preconditions and exclusion sets in full; §2.5’s parenthetical is not the test-scope authority. Carrying all six is correct. |
| **BUILD-1** (`07` §9 G-1, zero-call proof has no slice) | **REAL** | Spec §22.1/DR-037 makes the zero-call proof a launch gate; Plan.md §8 assigns no owning slice. Assign it (naturally S0/S6 plus S15 evidence) and an exact `FX-*` id. |
| **BUILD-2** (`07` §9 G-2, P-D4 has no slice) | **REAL** | Charter §7 S2 and manifest §12.2 require P-D1…P-D5; Plan.md §8 names D1–D3 and D5 but no D4 owner. Assign `FX-PT-D4` to S5/S14. |
| **BUILD-3** (`07` §9 G-3, review count 12 vs 19) | **MISREAD** | This is an Opus-review arithmetic error, not a Plan gap; Plan.md §6.8’s enumerated rows and the 28-question index are authoritative. |
| **BUILD-4** (`07` §9 G-4, Q-03 absent at S13) | **MISREAD** | Q-03 is a hard S0 entry criterion and S13 follows S0; once answered, the identity definition remains a frozen prerequisite without being re-gated at S13. |
| **TRACE-1** (`09` §8.1 G-1, AC-89 fixture) | **REAL** | AC-89’s read-derives/reaper-writes split has no named acceptance pair; add exact fixtures for side-effect-free expired read and reaper transition. |
| **TRACE-2** (`09` §8.1 G-2, AC-90 no-live-node fixture) | **REAL** | AC-90 forbids a fabricated even split but no fixture asserts the no-live-node result; add a named S5 fixture. |
| **TRACE-3** (`09` §8.1 G-3, AC-03 acceptance) | **MISREAD** | AC-03 is a repository-scope negative and AC-80 forbids V2 conformance; absence of a V2 migration path plus repository review is its acceptance form. |
| **TRACE-4** (`09` §8.1 G-4, structural rows lack fixtures) | **MISREAD** | AC-15/17/82/85 are enforced by context/dependency/repository assertions; trace them to those CI/static artifacts rather than demanding runtime fixtures. |
| **TRACE-5** (`09` §8.1 G-5, AC-25/AC-31 fixtures) | **REAL** | Both are machine-checkable invariants and currently have no assertion: add property fixtures for restatement-number invariance and no position re-encoding. |
| **TRACE-6** (`09` §8.1 G-6, AC-81 unfixturable) | **MISREAD** | Plan.md §2.6 explicitly assigns checkout separation and role governance because CI cannot prove a reading prohibition; trace to a launch attestation, not a code fixture or new question. |
| **TRACE-7** (`09` §8.1 G-7, terminal count) | **REAL** | DR-037 and spec §5.2 say five while spec §12.3 omits depth-zero and Plan AC-65 copies four; resolve as H-C-1 and register the founding-table correction. |

CODEX LENS COMPLETE
