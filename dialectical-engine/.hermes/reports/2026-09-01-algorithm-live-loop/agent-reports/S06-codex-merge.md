CODEX MERGE REVIEW S06 — CHANGES · comments read through: s06-merge-2026-09-02

VERDICT: CHANGES — 1 blocking evidence finding and 3 non-blocking mandatory
record findings. Filing r4 = rework 2/3 (J19); this opens no new worker rework
round. No product-behaviour defect was found in the merge resolution. B1 is an
acceptance-evidence gap; N1 is a resolution-documentation defect; N2-N3 are
evidence/filing defects. All four require correction before the reverse merge.

## Findings

### B1 — the required root typecheck is not bound to the committed merged tip

Files/lines: `logs/s06/r4/merge-typecheck.log:1-4`;
`agent-reports/s06-selection-label.md:950-979`; review packet
`packets/s06-codex-merge.md:38-39`; merge object `e040b1ee` metadata.

The only compiler record says `root typecheck exit=0`, but its header names only
“the RESOLVED merge”: it contains no commit SHA, tree SHA, or porcelain record.
It is stamped `2026-09-02 12:42:11 EEST`; merge commit `e040b1ee` is stamped
`12:42:55 EEST`. The report promotes that pre-commit record to a check “at the
merged tip.” Static inspection cannot prove that the tree compiled at 12:42:11
was byte-identical to committed tree `2131932e0ce3bd12a40ea045b2bdd3910b8e9050`.

Concrete failure scenario: a type-invalid resolution edit lands after the logged
command and before the merge commit. The log and report still say exit 0, while
the committed tip fails the acceptance-inclusive root config. This is precisely
the provenance class that made S06 r2's pre-final-tip compiler record inadmissible.

Required correction: at committed `e040b1ee5322b3343987632659509e963d0ccd05`,
rerun the root typecheck under the worker's existing authority and file a record
with the full tip plus empty porcelain (or an immutable tree id equal to the
commit tree). Preserve the verbatim command/result. Ticket:
`F-S06-MERGE-B1` — blocking evidence repair, not a rework round.

### N1 — the merge rationale falsely says the T6 resolver reads only two fields

Files/lines: `dialectical-engine/packages/serve/src/index.ts:1184-1188,1191-1226`;
`agent-reports/s06-selection-label.md:895-907`; worker self-report r4 §2; review
packet `packets/s06-codex-merge.md:30-33`.

The new merge comment, report, self-report, and review packet say
`resolveTrueUnjudgedReasons` reads only `mark` and `subjectRef`. The body also
reads `reviewOutcome` and `terminalTransportOutcome`; those are the fields that
select and validate T6's review-versus-transport truth arm.

The widening itself is statically safe for a different, stronger reason:
`PreservedConditionMarkRecord` is
`Omit<ConditionMarkRecord, "servedRootRule"> & { servedRootRule:
ServedRootRuleHistory | null }`. Every field the resolver reads has the same
type and meaning in both union arms; only `servedRootRule` differs, and the
resolver does not read it. The function body is otherwise unchanged from
integration `362299d1`, so no T6 truth-binding decision is weakened.

Concrete failure scenario: a later maintainer relies on the filed two-field
claim while changing either reason field on the preserved shape. Review then
misses a real semantic widening because the merge record says those fields are
irrelevant when they are decision inputs.

Required correction: replace the two-field claim in the code comment, worker
report/self-report, and packet record with the actual four-field access set and
the `servedRootRule`-only type difference. Ticket `F-S06-MERGE-N1` — mandatory
resolution-documentation correction in-lane.

### N2-PACKET — the landmark audit reports 86 marks and a second lane mint that do not exist

Files/lines: `logs/s06/r4/merge-landmarks.log:25-31`; worker report
`agent-reports/s06-selection-label.md:915-925`; review packet
`packets/s06-codex-merge.md:35-37`.

The log says `CONDITION_MARKS length: 86` and headings/packet text claim “both
lanes' mid-list mints.” A static element count at the four relevant trees is:
base `7433be7` = 31, integration `362299d1` = 31, lane parent `6624c3fa` = 32,
merged tip = 32. T6 has no kernel diff at all. S06 adds exactly one mid-list
member, `LABEL-BASIS-INCOMPLETE`; the pre-existing T3 panel pair remains, and
the DR-176 tail remains exactly `HIDDEN-UNJUDGEABLE`,
`DERIVED-STANDING-UNREVIEWED`, `HIDDEN-LOW-SCORE`,
`UNAUTHORED-BRANCH-HALTED`. The worker report's “S06's single mid-list mint” is
correct; its cited landmark record and this packet are not.

Concrete failure scenario: packet automation treats a source-line span (`86`)
as the closed-vocabulary cardinality and treats a phantom T6 mint as present,
so a missing or colliding actual member can pass the purported landmark gate.

Required correction: refile the landmark block using structural element counts
and parent comparison, and correct the packet constant to one S06 mint plus the
retained prior vocabulary. Ticket `F-PACKET-S06-MERGE-N2` — orchestrator/evidence
correction, mandatory and non-blocking to product semantics.

### N3 — both required r4 sections are malformed Markdown headings

Files/lines: worker report `agent-reports/s06-selection-label.md:808`; worker
self-report `agent-reports/s06-selection-label-self.md:452`; worker packet
`packets/s06-merge-r4.md:6-8,40-43`; review packet
`packets/s06-codex-merge.md:20-22`.

Both artifacts contain `# ## r4 ...`, an H1 whose text begins with literal hash
characters. Neither contains the required `## r4` section. The review packet
nevertheless tells this seat to inspect section `## r4 (evidence repair +
integration merge)`.

Concrete failure scenario: a filing parser anchored on `^## r4` cannot locate
either appended record and concludes that the report/self-report is absent or
reads the preceding r3 section as current. Human visual similarity does not
repair the machine-readable section contract.

Required correction: change both headings to real `## r4` headings and
recompute the worker report's line-2 SHA after its heading changes. Ticket
`F-S06-MERGE-N3` — mandatory filing correction.

## Static verification record

- Read the dispatch packet in full before the diff, then the reviewer/protocol
  contracts, Codex r3 before r1/r2, D24 plus both addenda, J17-J19, the S06 judge
  verdict, ticket, worker merge packet, worker report/self-report, both
  parent-relative diffs, combined merge diff, touched source/tests, and all r4
  evidence blocks. Both authorized output paths resolve inside the exact
  writable surface; no mandatory deliverable is outside it.
- Read-only metadata returns HEAD
  `e040b1ee5322b3343987632659509e963d0ccd05`, parents
  `6624c3fa37d90f24fa84b1580f64f0259a9e9c95` and
  `362299d124f9a0403c56c3bea7d8a2b59f72915f`, tree
  `2131932e0ce3bd12a40ea045b2bdd3910b8e9050`, and empty porcelain. The
  integration-parent diff is 25 files, `+2242/-71`; the lane-parent diff is 17
  files, `+2168/-100`. Neither parent-relative summary contains a mode-change
  line. Both `git diff --check` inspections are empty, and no conflict marker
  remains in the five overlap files.
- The two content conflicts and third type seam are accounted for. Contract
  keeps T6's extracted `ConditionMarkRecordSchema`, `review_outcome`, and XOR
  refinement while applying J17's `SERVED_ROOT_RULE_HISTORY` at the one
  definition. Serve imports are the disjoint union. The resolver's parameter is
  widened to `PersistableConditionMarkRecord`; its body is unchanged except for
  type annotations, and the accurate safety proof is recorded under N1.
- All 12 touched tests were diffed against `362299d1`: ceremony; two
  architecture; two integration; one render; and six unit files. The dedicated
  T6 unit/integration and TINT1 migration tests, TINT1's adversarial/panel
  acceptance files, review-bearing support, migration 0053/0054, judgement
  source, and root tsconfig are byte-identical to integration. The deletions in
  existing touched tests replace retired-rule expectations, update vocabulary
  count pins, or extend return shapes; no T6/TINT1 assertion is removed or
  weakened. Recorded lane clusters are C1 15/15 x3, C2 24/24 x3, C3 9/9 x3,
  C4 5/5 x3; recorded landed-lane clusters are T6 10/10 and 9/9, TINT1 3/3.
  These are author-produced records, not reviewer reruns.
- Migrations are uniquely ordered
  `0053_t06_review_outcome_disclosure.sql` ->
  `0054_tint1_reject_edge_mutation_public_revoke.sql` ->
  `0055_t10_served_root_selection.sql`. Generated client/OpenAPI/inventory
  artifacts are present and were stamped `12:41:15`; inspection of
  `generate.ts` shows the merge's nested schema resolution does not alter their
  generated top-level inventory shape. I did not rerun generation.
- The report's current line-2 SHA recomputes exactly to
  `c55d91122b4c17ff71730b5fcd0b0835c09704801db46634e05bc33feec8af3a`.
  D14/D16 base-versus-merged payloads are byte-identical after their evidence
  header. The recorded merged root typecheck says exit 0 but is not tip-bound,
  as B1 states. The previous TS2741 input is statically repaired by TINT1's
  `edges: []`, and the root config includes `acceptance/**/*.ts`; compiler
  success at committed tip remains CANNOT-ASSESS pending B1.
- The base and merged zone failure-name files are byte-identical and contain 14
  names. Thirteen are members of T0's 23-stable-red authority; one is the
  separately tracked F22 S3c RSS member. The exact names are:

  1. `[T0]` `tests/architecture/s04-contract.test.ts` — DR-128 register wiring.
  2. `[T0]` `tests/architecture/s10-carrier-erasure-red.test.ts` — private tombstone filtering.
  3. `[T0]` `tests/architecture/s13-contract.test.ts` — append-only memory carriers.
  4. `[T0]` `tests/architecture/s7-authorization-contract.test.ts` — immutable memory scope ownership.
  5. `[T0]` `tests/architecture/scaffold.test.ts` — purity/provider/source/switch/number gates.
  6. `[T0]` `tests/architecture/scaffold.test.ts` — 28 dependency-edge rows and rules 1-5.
  7. `[T0]` `tests/unit/load01-run-projection.test.ts` — owned terminal projection.
  8. `[T0]` `tests/unit/obs-l2-s04-zone.test.ts` — mount-list resolver ZI-1..ZI-4.
  9. `[T0]` `tests/unit/obs-l2-s04-zone.test.ts` — 15 falsification mutants.
  10. `[T0]` `tests/unit/pro01-runner-tree.test.ts` — exhausted defender call.
  11. `[F22]` `tests/unit/registration.test.ts` — S3c B4 isolated RSS curve.
  12. `[T0]` `tests/unit/s6-content-encryption.test.ts` — encryption-off/v1 retirement/wrapping keys.
  13. `[T0]` `tests/unit/v2ui-node-runner.test.ts` — active Node-test manifest.
  14. `[T0]` `tests/unit/xrev01-node-review.test.ts` — exhausted review call.

- Codex r3 N1 is closed as evidence: each of `R3-B1-BEFORE`,
  `R3-B1-AFTER`, `R3-N3-M1`, and `M4-omitted` prints literal NEW between the
  delimiters, records `pre=0 -> applied=1 -> restored=0`, mutation diff,
  discriminating result, restore command, equal before/after SHA-256, and empty
  porcelain. BEFORE records `a10c2254` plus the lane id before/after; outcomes
  remain respectively survives, caught, caught, and not caught by construction.
- Codex r3 N2 is closed as record truth: the report preserves that S06 never
  executed the ceremony, withdraws the stale V ask, names W12 as execution
  owner, requires D15 plus acceptance-inclusive typecheck for lane closure, and
  routes an attributable W12 failure back as an S06 micro-fix.
- I ran no tests, builds, installs, database fixtures, provider calls, or
  mutating Git commands. Runtime/compiler counts above are recorded upstream
  evidence. I did not verify the live acceptance ceremony; J18 routes it to W12.

## PREDICTIONS

A log-first lens is likely to APPROVE because every post-commit test record is
green or set-equal; I predict it will miss that the sole root compiler record
predates the immutable merge tip and carries no tree id. A source-focused lens
may report N1 as a semantic widening bug; I predict the code is safe because the
union arms differ only at `servedRootRule`, which the resolver never reads. A
packet-focused lens may catch the malformed r4 headings but trust the landmark
heading and miss that `86` counts source lines and T6 minted no kernel member. I
would check first, after refile, for a full `e040b1ee` typecheck header and empty
porcelain, then the corrected four-field resolver rationale, the structural
31/31/32/32 vocabulary counts, and anchored `## r4` headings with a new report
hash.
