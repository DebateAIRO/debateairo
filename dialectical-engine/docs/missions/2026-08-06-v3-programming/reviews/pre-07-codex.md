# PRE-07 — Codex review lens

Ticket: `t_ddb54539`  
Artifact: `docs/missions/2026-08-06-v3-programming/ratification/citation-routes.md`  
Review boundary: Claude-authored artifact; comments read through the `READY FOR PEER REVIEW` marker at `1786046852`. No later ticket comment and no Grok verdict/review artifact was read.

## Verdict

CHANGES REQUESTED. The package has the required eight-route shape, but the closure proof is not yet total and several serve consequences are not rules the cited pack already contains.

## Checks that pass

- The artifact is new and untracked. It has exactly eight route headings, R1 through R8. Each route has one triggering condition, one recorded-fields clause, one serve consequence, and one loudness clause. There is no generic `OTHER` member.
- The `PROPOSED-FOR-RATIFICATION` banner is present. The artifact consistently reserves ratification and the §12.3 mint to V.
- The §12.3 draft adds only two reader-facing marks: `UNVERIFIED-CITATION` and `CITATION-WITHDRAWN`. The 22 → 24 consequential count change is flagged for follow-through and is not applied here.
- DR-088 is held: the proposal contains no kill predicate, register key, dormant-gate implementation, or hard-kill carrier. The later kill set remains V-owned.
- SP-1 is expressly labelled “V's call,” and SP-4 sits in the section headed “what V must rule.” Neither is presented as ratified fact.
- The cited identifiers and counts checked here already exist in the pack; no new scalar or threshold is introduced.

## Independent closure walk

| Rung | Result | Review |
|---:|---|---|
| 1 — evidence-store resolution | **FAIL** | The stated three branches do not cover every combination of `source_record` completeness and `absence_row` presence. Finding 1. |
| 2 — access depth | **FAIL for reopen attempts** | E-7 obliges the harvest/source access-depth record, but the proposed carrier reads that historical value through `source_ref`; it has no already-owed attempt-scoped value for a later Q40 reopen failure. Finding 2. |
| 3 — version/freshness | Conditional pass | Once the artifact is readable, the Boolean split is unique. A changed version whose span still matches goes to R5 by first-failure ordering, but R5's consequence overreaches E-13. Finding 4. |
| 4 — comparison-result existence | Route split passes; record does not | “No result” uniquely reaches R6, but R6 cannot record all already-typed execution outcomes. Finding 3. |
| 5 — span present | Pass | Under the stated preconditions, Q40 `not-found` uniquely reaches R7. |
| 6 — exact match | Pass | Under the stated preconditions, Q40 `deviates` uniquely reaches R8 and `verified` exits the failure domain. |

Adversarial cases:

1. A source opened fully at harvest but paywalled/404 on Q40 reopen does not have an unambiguous route from the fields as proposed: its referenced `source_record` still says `OPENED_FULL`, while no fresh access-depth field is owed or carried. Intended R3; as written, escape.
2. A quote taken from a preview lands uniquely in R4's `PROHIBITED_EXTRACTION` limb and is refused at write. No overlap found.
3. A source edited after retrieval whose cited span still matches lands uniquely in R5 because currency is checked before exactness. The route is unique, but the claimed refuse/state consequence is not ruled for version drift.
4. An instrument-executed/source-level lookup with no stable span lands uniquely in R6 (`NO_SPAN_CITED` or `MEDIUM_UNSUPPORTED`). No overlap found.
5. An incomplete `source_record` plus an `absence_row` covering the claim lands in neither R1 nor R2 under their written triggers. Escape.

## Numbered findings

### 1. Blocking — rung 1 is not a total or disjoint case-split

R1 requires **no** source record plus an absence row. R2 accepts an incomplete locator/version/time triple only when **no absence row** covers the claim. The closure table nevertheless declares three exhaustive cases: complete record; no record plus absence; neither. An incomplete record plus a covering absence row is a fourth constructible combination: it cannot descend, R1 rejects it because a record exists, and R2 rejects it because an absence row exists.

Required change: rewrite rung 1 over explicit predicates and cover every combination, or cite an existing invariant that makes the missing combination impossible. Preserve a positive R2 definition and first-failure ordering; do not solve this with a generic residual member.

### 2. Blocking — later access loss has no already-obliged field at rung 2

R3 says `ACCESS_BLOCKED` may arise “at harvest or on Q40's reopen,” but the proof cites E-7's three-valued source access-depth record, and §6 deliberately stores no attempt access depth, reading it through `source_ref`. For a source that was `OPENED_FULL` at harvest and later 404s, that field passes rung 2. Q40 obliges reopen plus `verified / deviates / not-found`; it does not oblige a second access-depth value. The later failure therefore cannot reach R3 through the field the proof names.

Required change: make the rung test and carrier line up with an already-owed attempt record (for example, the existing typed execution/ledger outcome), or demonstrate and cite an existing attempt-scoped E-7 record that Q40 writes and `citation_route_record` references. Then rerun the totality and first-failure proof for the harvest-success/reopen-failure sequence.

### 3. Blocking — R6's recorded-reason enum is incomplete

Rung 4 routes every missing comparison result to R6, but `compare_unavailable_reason` admits only `MEDIUM_UNSUPPORTED`, `NO_SPAN_CITED`, and `EXECUTION_FAILED`; the last is limited to ledger outcomes `FAILED / TIMED_OUT`. The pack's already-obliged execution outcomes also include `BLOCKED` and `REFUSED`. A current, fully opened source whose exact compare is recorded `BLOCKED` or `REFUSED` reaches R6 but cannot populate the required reason field. A missing result with no scheduled execution record has the same representability problem.

Required change: make R6's recorded-reason domain total over the already-ruled execution outcomes (while retaining the protected-core prohibition on budget skipping), and keep the merge itself explicitly subject to V's SP-4 ruling.

### 4. Blocking — R5, R7, and R8 claim serve consequences the cited rules do not already establish

- E-13 rules refuse/state behavior for **newest-source age against `as_of`**. R5 extends that behavior to any `VERSION_DRIFT`, including a fresh edited source whose cited span is unchanged. That extension is not in E-13.
- R7 and R8 say the span is withdrawn and the rest of the answer stands by applying S-9e's **number replay eviction** “to a quote.” S-9e rules only an unreplayable component number; Q40 rules the typed `not-found / deviates` outcomes, not quote withdrawal or partial-answer survival.

Required change: state only consequences already ruled for these cases, with exact authority, or expose the behavioral extensions as separate V riders instead of asserting that the pack already rules them. Recheck the wording of the `CITATION-WITHDRAWN` draft after that correction.

CODEX REVIEW: CHANGES REQUESTED — 1. Rung 1 is non-total; 2. later access loss escapes the obliged fields; 3. R6 cannot record all missing-result causes; 4. R5/R7/R8 invent serve consequences

---

## Rev 2 re-review

Review boundary: prior Codex review above; the worker's `REWORK ACKNOWLEDGED` and
`READY FOR PEER REVIEW (rev 2)` comments through `1786048251`; and the untracked
`docs/missions/2026-08-06-v3-programming/ratification/citation-routes.md` read
directly. No Grok review artifact or verdict was used. The ratification work
remains one untracked file.

## Verdict

CHANGES REQUESTED. Rev 2 repairs findings 1 and 4 and the named 404 and non-OK
outcome cases from findings 2 and 3, but two fresh constructible record states
still escape the claimed total mappings.

## Finding-by-finding verification

### Prior finding 1 — repaired

Expanding §3.1's compressed table gives all eight Boolean cells:

| `P_ref` | `P_rec` | `P_abs` | Result |
|:---:|:---:|:---:|---|
| F | F | F | R2 |
| F | F | T | R1 |
| F | T | F | R2 (`P_rec` is vacuous) |
| F | T | T | R1 (`P_rec` is vacuous) |
| T | F | F | R2 |
| T | F | T | R2 |
| T | T | F | descend |
| T | T | T | descend |

`P_abs` is consulted only when `P_ref` is false. In particular, the former hole
`(T, F, T)` now lands in R2. The honesty argument is sound: a named source with
an incomplete retrieval record is not an honest "searched and found nothing";
the positive fact is that the store does not back what was cited.

### Prior finding 2 — the named scenario is repaired, but the rung is still not total

The requested harvest/reopen trace now works: Q16 harvests `OPENED_FULL`, current,
exact, so attempt A1 writes `VERIFIED`; Q40 later reopens to a 404, its recheck
action writes `FAILED`, §3.2 derives `ACCESS_BLOCKED`, and attempt A2 lands in R3.
Those are two attempt rows under §11A.1, not one attempt landing twice. The same
derivation covers `BLOCKED`, `TIMED_OUT`, and `REFUSED`, and the attempt depth is
not redundantly stored on `citation_route_record`.

The remaining hole is the `OK` limb. Section 3.2 says an `OK` action yields "the
E-7 value that entry recorded," but the ruled `ledger_entry` shape in
`02-data-model.md` §6.1 carries action kind, typed outcome, timings, fingerprints,
and digest text — it declares no typed action-result/access-depth payload. A-2
names `locator resolution`, `access depth`, and `rechecks (Q40)` as action kinds;
an action kind plus outcome `OK` does not select `OPENED_FULL` versus
`PREVIEW_ONLY`. Section 11A.1 gives the typed depth to `source_record`, which rev
2 itself identifies as the historical source-scoped value for this problem.

Fresh adversarial case 1: harvest A1 records `OPENED_FULL`; on A2, Q40 resolves
the locator successfully but receives only a teaser/preview, so the action outcome
is `OK` and the E-7 value for this attempt is `PREVIEW_ONLY`. The historical
`source_record` still says `OPENED_FULL`, while the declared ledger row has no
typed depth payload. Rung 2 therefore cannot derive the attempt's required value
from the cited carrier and may descend instead of firing R4. Rev 2 needs either
an already-ruled typed attempt-depth carrier or an explicit proposed carrier and
reference; the sentence asserting that the ledger entry recorded the value is not
itself authority.

### Prior finding 3 — non-OK coverage is repaired, but the reason split is still not total

The four written reasons now cover: no comparison owed (`NO_SPAN_CITED`), owed but
medium-unsupported (`MEDIUM_UNSUPPORTED`), owed/supportable with no execution row
(`COMPARE_NOT_EXECUTED`), and an execution row whose outcome belongs to the
ledger's non-`OK` membership (`COMPARE_EXECUTION_NOT_OK`). Referencing that
membership through `ledger_entry_ref` correctly covers `FAILED`, `BLOCKED`,
`TIMED_OUT`, and `REFUSED` without copying the ledger enum. SP-4 is widened and
remains open; rider R6-a correctly prices a route split as changing DR-084's count
from eight to nine.

Fresh adversarial case 2: comparison is owed and supported; an exact-compare
ledger row exists with outcome `OK`, but the Q40 semantic result
`verified/deviates/not-found` is absent (for example, the ledger append survived
and the result write did not). Rung 4 observes no comparison result and sends the
attempt to R6, but none of the four reasons applies: a span was cited, the medium
supports comparison, execution exists, and its outcome is not non-`OK`. No cited
invariant makes that record combination impossible or atomically binds `OK` to a
semantic result. Cover it with a reason (this does not change the eight-route
count), broaden an existing reason honestly, or cite and carry such an invariant.

### Prior finding 4 — repaired

R5 now applies E-13's verbatim refusal/staleness/WAIT consequence only to
`OUTSIDE_FRESHNESS_ENVELOPE`; `VERSION_DRIFT` is disclosure-only and explicitly
does not cite E-13. R7/R8 now stop at Q40's per-item `not-found`/`deviates`,
AC-90's honest zero-information value, S-19 digest visibility, and the proposed
reader mark. The §12.3 draft is renamed `CITATION-RECHECK-FAILED`; its Says text
states the failed recheck and that the span supports nothing, with no withdrawal
or partial-survival remedy. The unratified drift, R6-split, and
withdrawal/survival consequences are presented as riders in §9.1 rather than as
route behavior.

## Remaining closure checks

- Exactly eight route headings exist, R1 through R8, with no generic `OTHER`.
- R2 remains a positive, early precondition failure rather than an end-of-list
  residue bucket.
- DR-088 is held: there is no kill predicate, activation key, hard-kill column,
  or dormant gate.
- The behavioral riders are defined in §9.1; other sections only point to them.
- The worker artifact is one untracked ratification file. This review appends only
  this review file.

The no-other and disjointness arguments are structurally sound once each rung's
tested value is representable, but totality is not yet established because the
two cases above leave rung 2 and R6's required reason field without a value.

CODEX REVIEW (rev 2): CHANGES REQUESTED — 1. attempt-scoped `OK` access has no typed depth carrier; 2. R6 omits `OK` execution with a missing comparison result

---

## Rev 3 re-review

Review boundary: the prior Codex reviews above; PRE-07's ticket body and comments
through the worker's `READY FOR PEER REVIEW (rev 3)` marker at `1786049160`;
the untracked ratification artifact read directly; `02-data-model.md` §§6.1,
6.2, 11A.1 and the cited §13 row; founding-ledger DR-027; requirements-spec
E-7, Q16, Q40, A-2 and S-19; and design-pattern register P4. This is an
independent DR-101 lens; no Grok evidence is used in the verdict.

## Verdict

CHANGES REQUESTED. Both rev-2 findings are substantively repaired, including the
teaser-reopen case and the missing-result reason. The new access-depth carrier is
a legitimate placement repair, not invented vocabulary, but its unconditional
nullability rule makes the row impossible to populate honestly for two earlier
routes. Two collateral statements also remain stale after the rev-3 edits.

## Verification of the two rev-2 findings

### Prior finding 1 — core repair accepted; carrier constraint still has a hole

The phantom derivation is withdrawn. `02-data-model.md` §6.1 carries action kind,
typed outcome, timings, fingerprints, register references and digest text, but no
typed action-result payload. Section 6.2 is model-call-shaped and likewise does
not carry E-7 access depth. An `OK` ledger outcome therefore cannot distinguish
`OPENED_FULL` from `PREVIEW_ONLY`.

The three-case replacement is otherwise coherent:

- a non-`OK` access/recheck outcome maps to `ACCESS_BLOCKED`;
- an `OK` Q16 harvest is constrained to the `source_record` value;
- an `OK` reopen records the depth established by that opening through
  CARRIER-1.

CARRIER-1 is a legitimate obliged-record placement proposal. E-7 already makes
access depth a required three-valued record; Q40 performs another opening by
reopening the locator; and §11A.1 currently places the value on a per-source row,
which cannot represent two openings of the same source at different depths. The
§6.1 `action_scope` reasoning is a sound mirror: per-kind facts must not be
duplicated per row, while per-opening facts must not be collapsed per source.
This adds a home for an existing fact and vocabulary rather than minting a new
domain rule.

The adversarial trace now routes correctly: Q16 harvests `OPENED_FULL` and
verifies; Q40 later reopens successfully but receives only a teaser; the Q40
attempt records `PREVIEW_ONLY`; rung 2 fires; the second attempt lands in R4.
It no longer inherits the harvest value or descends to comparison.

### Prior finding 2 — repaired

`COMPARE_RESULT_MISSING` covers the exact former escape: comparison owed,
supportable and executed; ledger outcome `OK`; semantic comparison result absent.
Together with the other four reasons, the five are the leaves of the ordered
Boolean chain `owed? -> supportable? -> executed? -> outcome OK?`, under rung
4's no-result precondition. The split is total and positively defined.

The impossibility route is correctly rejected. DR-027/S-19's record-before-math
clause governs raw model judgements, not a machine character comparison, and no
cited rule makes the action ledger append atomic with the semantic-result write.
Design-pattern register P4's provider-call rule places its ledger write outside
an open write transaction; it does not supply the missing atomicity invariant.
The missing-result row is therefore both the honest R6 route evidence and input
to the completeness audit. Reasons remain fields on R6, so there are still
exactly eight routes.

## Numbered findings

### 1. Blocking — unconditional `attempt_access_depth NOT NULL` cannot represent R1 or R2

Section 6 and CARRIER-1 say `attempt_access_depth` is `NOT NULL` and is written by
**each** citation attempt. But R1 explicitly has no named source and null
`source_ref`, while R2 includes both no source and an incomplete/unresolvable
source record. Those attempts fail rung 1, before any access-depth test, and no
honest E-7 value exists for them. Writing `ACCESS_BLOCKED` would falsely claim an
opening was blocked; writing either other member would be worse. The route rows'
own recorded-field clauses omit the value, contradicting the universal carrier
constraint.

Required change: make depth absent for the rung-1 terminal routes and required
for every row that descends to rung 2, using a route/outcome-aware invariant. The
Q40 reopen limb must remain write-time-required, so a missing reopen depth still
fails rather than inheriting `source_record.OPENED_FULL`.

### 2. Collateral consistency — SP-8 and R6's merge text are stale

- SP-8 says access depth has no row in `02-data-model.md` §13 and calls the
  missing vocabulary half of the same gap as CARRIER-1. The current §13 already
  has an `access depth` row with all three E-7 members, its `kernel` home and the
  `evidence.source_record` enforcement site; §11A.1 itself says the vocabulary is
  inventoried at §13. CARRIER-1's per-opening placement gap still stands, but the
  inventory gap does not. SP-8 and the CARRIER-1 cross-link must distinguish the
  resolved inventory limb from the remaining placement limb.
- R6's row says reasons “①–④ share one route and one reader mark” after adding
  reason ⑤. SP-4 correctly says five causes and remains open for V, but the route
  definition must say ①–⑤ so `COMPARE_RESULT_MISSING` is explicitly covered by
  the same merge argument.

The other requested collateral is aligned: R3/R4, §§5.1/5.3/6, the eight-route
count, the no-other proof, the serve consequences, and the three behavioral
riders remain consistent with the substantive repairs.

CODEX REVIEW (rev 3): CHANGES REQUESTED — 1. `attempt_access_depth NOT NULL` cannot represent R1/R2; 2. SP-8 and R6's five-reason merge text remain stale

## Rev 4 bounded receipt

Receipt boundary: the two directed rev-3 repairs only; ticket comments read
through the `READY FOR RECEIPT (rev 4)` handoff at `1786049932`. No Grok content
was used.

- **Item 1 — YES.** `attempt_access_depth` is `NULL` exactly on R1/R2 and required
  below rung 1; the four checks bind opening presence through
  `opening_action_ref` and declared `ledger_entry.action_kind`, enforce harvest
  equality and non-`OK` → `ACCESS_BLOCKED`, decide rung 1 before a depth read,
  preserve no-silent-inheritance, and address R2 after a physical fetch.
- **Item 2 — NO.** SP-8 is correctly retired after verifying the landed §13
  access-depth row, only CARRIER-1's placement limb survives, and R6's merge row
  now covers reasons ①–⑤. However, rider R6-a still proposes splitting
  `COMPARE_EXECUTION_NOT_OK` and/or `COMPARE_NOT_EXECUTED`; it was not repriced
  over reason ⑤ `COMPARE_RESULT_MISSING` as the rev-4 handoff and change log
  state.

No non-blocking observations outside the two receipt items.

CODEX RECEIPT: FAILED — item 2: rider R6-a still omits `COMPARE_RESULT_MISSING`, so the collateral repair was not fully applied as directed
Rev 4.1 re-receipt: R6-a now names both engine-side reasons and prices either or both as one ninth route; neighboring rider rows are unchanged.
CODEX RECEIPT: CLEAN — R6-a repair applied as directed
