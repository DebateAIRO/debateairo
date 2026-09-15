# T4 CODEX SELF-REPORT — peer review

## r1

### Cause, not symptom

The central failure was **semantic-name laundering**. The change created a local object named
`WayOfKnowingDowngradeRecord` with fields resembling serve's `ConditionMarkRecord`, then the
unit test accepted that resemblance as proof that a condition mark had been emitted. Static
reachability disproved it: the new mark is absent from the canonical `CONDITION_MARKS` enum,
`ConditionMarkSchema` would reject it, and both runner judgement paths discard the new
`JudgedNode.wayOfKnowingDowngrade` field. The object is an isolated return-field, not an engine
condition mark and not visible disclosure.

The same fixture hid a second identity error. It passed the string
`node:downgrade-subject` as `JudgeInput.subjectItemId`, making `subjectRef` look like a node id.
In production, root and child runner calls pass `claimed.workItemId`; the real graph node id is
created only after judgement. The test therefore proves the claimed-value limb but not the
"naming node" limb.

### Price

- The two semantic defects consume at least one rework round and require a real integration
  seam, not another direct-Judge assertion. Canonical visibility crosses the kernel vocabulary,
  contract parsing, runner forwarding, serve records, and presentation labels; the present
  packet does not lawfully assign that whole surface.
- The review marker was set while `pnpm test` was unfinished. At
  `2026-09-01T10:01:40+0300`, `logs/t04/test.log` was 303,597 bytes but had no Vitest summary
  and no `TEST_EXIT`; the report still contained `PENDING_EXIT`, `PENDING_COUNTS`, and
  `PENDING_FAILURES`. That spent a complete reviewer dispatch on evidence the marker promised
  was ready.
- The packet's stale T0 citation forced a second authority audit through D8, D9, and PROGRESS.
  D9 retains `t00-baseline.md` as the pre-provisioning trap record and names a later re-pin as
  baseline-of-record, while W1/T4 was dispatched only after provisioning.
- One small dead end cost two failed source-location probes: the packet's file paths are
  relative to `lane-t4/dialectical-engine`, while git's top level is `lane-t4`; the first
  `git show 1c9578a:packages/...` probes therefore failed until the repository prefix was
  included. The packet path itself was valid, but the two roots should be named explicitly.

### What I nearly got wrong

I nearly accepted "names the node" because the test data wore a `node:` prefix. Tracing the
actual root and child call sites exposed that it is a work-item id. I also nearly treated the
worker's own visibility disclosure as a harmless follow-up because the local DoD says "mark
emitted on normalization"; the higher Scope law says every degradation emits a **visible**
condition mark, so deferral would approve a known global-law violation. Finally, I considered
waiting for the live suite log, but a READY marker with literal pending placeholders is itself
the defect: review evidence must be complete before handoff.

### Dead ends and negative evidence

- Goal lines 112–118 and the frozen S02 transcription are byte-consistent; no spec-drift
  finding.
- Base commit `1c9578a24d5aedd0302fbda5593f66277cd87b98`, branch `lane/t4`, cited judgement
  lines 26–29/130, and serve line 562 all resolved as quoted.
- `git diff 1c9578a..HEAD -- packages/serve/src/index.ts` was empty, and Q51's source remained
  unchanged. The Q51 arm itself is not a finding.
- The three targeted GREEN logs each contain `4 passed (4)` / `47 passed (47)` and exit 0;
  the RED log contains `8 failed | 1 passed (9)` and `RED_EXIT=1`. Those logs were real, but
  they do not repair the integration gap or replace the missing full-suite terminal record.

### Packet friction and upgrades

The packet is four-element and its paths/constants mostly check out, but it fights the task in
two places. First, it cites the superseded pre-provisioning T0 report without D9's finding
reference. Second, it demands a condition-mark record while limiting the task to judgement and
tests, prohibiting serve edits, and inheriting the frozen rule that legacy `web/` is touched
only by T2. The canonical condition-mark enum is exhaustively rendered in that legacy file, so
the packet offers no lawful end-to-end route to "visible".

To make this closer to a one-prompt machine:

1. Add a packet lint that rejects stale baseline pointers after an authority supersession and
   rejects READY reports containing `PENDING_` or named logs without terminal exit/count lines.
2. Add a condition-mark reachability gate: every newly emitted mark must be in
   `CONDITION_MARKS`, accepted by `ConditionMarkSchema`, forwarded by a production consumer,
   and observed at the answer/node projection.
3. Require identity-bearing tests to obtain the identifier from the real producer. A fixture
   may not prove "node id" by passing an arbitrary string prefixed with `node:`.
4. Have dispatch compute the transitive type surface of a new closed-vocabulary member. If an
   exhaustive switch lies outside scope, the packet must carry a prior V ruling or block before
   implementation.
5. Name both the git top-level and command working directory in generated packets so base-path
   probes are mechanically replayable on the first attempt.

## r2

### Cause, not symptom

The rework closed the product defects from r1, but its handoff failed at two gates for the
same underlying reason: **evidence categories were inferred from nearby evidence instead of
checked against the ruling that defines the category**.

First, root `pnpm run typecheck` was treated as the typecheck proof even though D14 says that
root gate excludes both surfaces this rework touched. The report carefully counted exactly
one mapping line in each UI switch, yet omitted both workspace-local compiler gates named
verbatim in the r2 packet.

Second, “present on the r1 tree” drifted into “pre-existing to the lane.” Those are different
claims under D12. The report has strong paired `1c9578a`↔HEAD evidence for 14 failures, T0/F21
or D13 evidence for others, but then says all 26 are accounted while explicitly declining
attribution for eight failed tests. The terminal log also reports `Errors  1 error`; the
report never records or classifies that unhandled rejection.

### Price

- The r1 and r2 terminal full-suite runs cost 2,922.06s + 3,036.07s = 5,958.13s
  (about 99.3 minutes), before the additional ~10-minute SIGTERM attempt. Despite that spend,
  eight failed tests and one unhandled error still lack the classification the packet made a
  gate. Round 3 is now the last lawful rework round.
- The two missing D14 commands are cheap compared with another review cycle, but their
  omission consumes that cycle because root typecheck is expressly non-evidence for ui/web.
- The hand-written diff inventory said eleven files and omitted
  `tests/unit/judgement.test.ts`; the mechanical base-to-HEAD list contains twelve. That cost
  another independent scope reconciliation and made an otherwise careful report look less
  reliable.

### What I nearly got wrong

I nearly approved after tracing the real-node FK and projection path: the r1 B1/B2 mechanics
are genuinely closed, the J5 one-line UI bounds hold, and the targeted RED/GREEN logs are
sound. Searching the report for D14's exact command strings exposed the first blocker.

I also nearly accepted the 26-versus-24 delta as sufficient classification. Enumerating all
26 failure headers showed the report's contradiction: lines 311–313 say every failure is
accounted, while lines 315–324 explicitly refuse attribution for a residual set. A source
probe then showed that memory, authorization, and observability tests in that set import
changed serve/judgement/runner surfaces, so “not in my blast radius” is not static proof.

### Dead ends and negative evidence

- There is no separate worker r2 packet file; the only T04 packet files are the original
  worker packet and the two Codex review packets. J5/D12 are therefore the rework authority.
- The report-body SHA is exact, the ticket is at rework round 1, HEAD is
  `7d179c660adc2d308ac98c2ad99499ad7170b318`, and the worktree is clean.
- B1/B2 are closed: the canonical mark is mid-list, `slice(-4)` still names the DR-176 tail,
  both runner paths bind after `addNode`, the FK targets `core.node(node_id)`, and the served
  node projection reads the persisted mark link.
- J5 scope holds: exactly one line was added to each label switch; serve's only change is the
  typed union member; Q51 and the dead RAN bucket are untouched.
- The targeted evidence is real: r2 RED is 1 failed/60 skipped with exit 1; C3a is 152/152 in
  3/3 runs; the PostgreSQL seam is 1 passed/60 skipped in 3/3 runs; root typecheck exits 0.
  None substitutes for D14's omitted surface-local gates.

### Packet friction and upgrades

The r2 packet was unusually precise and directly named the D14 absence as a finding, so the
miss belongs to execution/report lint rather than ambiguity. The failure-classification line
could still be made cheaper by defining labels mechanically: `PRE-EXISTING-TO-LANE` must cite
an unmodified-base log; `FLAKE-CLASS` must cite a ticket/ruling; `OWNED` cites the changed
surface; everything else is `CANNOT-ASSESS`, never prose such as “present in run 4.”

One-prompt-machine upgrades:

1. Generate the SUITES checklist from `git diff --name-only`: any `web/` or `apps/ui/` path
   automatically injects D14's exact command and refuses handoff until its log has exit/count
   evidence.
2. Parse Vitest's terminal block into separate `Test Files`, `Tests`, and `Errors` records;
   require classification coverage for all failed-test headers **and** every unhandled error.
3. Distinguish `PRE-EXISTING-TO-REWORK` from `PRE-EXISTING-TO-LANE` in the schema. Only the
   latter closes D12.
4. Generate the diff-surface table mechanically from the same base SHA used by the packet;
   a report may not hand-count or silently omit an inherited r1 file.
5. Before setting `REWORK READY`, run a report linter that checks ruling-triggered gates,
   failure-classification cardinality, named-log existence, and report SHA in one command.

## r3

### Outcome and cause

The worker closed every substantive r2 finding. The four D14 surface-local gates report the
same single TS2882 baseline defect on base and HEAD; all 26 terminal test failures plus the
unhandled error are now classified; pairs A, D, and E have identical base-to-HEAD failure
sets; all three flake attributions resolve to named evidence and pass their isolation probes;
and the twelve-file numstat block is byte-identical to the mechanical base-to-HEAD diff.
HEAD remains `7d179c660adc2d308ac98c2ad99499ad7170b318`, with a clean tree and zero r3 product
changes.

One report-only contradiction survived because the handoff tail was copied forward without
being reconciled to the rebuilt r3 header. It says `Rework round: 1 of 3` and points readers
to the self-report's `## r2` section, while the report header, actual self-report, and later
`Rounds spent: 3 of 3` line all establish r3. The mechanism is a semantic template residue:
the report hash proves byte integrity, but no check proves its repeated round metadata agrees.

### Price

The product and evidence work are assessable and require no worker round 4. The price is one
nonblocking final-round residue that must be carried as a V-packet-ready row instead of being
silently accepted as “concern.” Two stale handoff labels make the final record internally
contradictory even though they do not change the product verdict.

### What I nearly got wrong

I nearly approved once the exact r2 gates converged: the 12-file list matched byte for byte,
the paired suites were symmetric, D14 was symmetric, and each flake had an isolation pass.
Reading the whole report through its handoff—not only the revised evidence sections—exposed
the stale `1 of 3` / `## r2` claims. The heartbeat law does not permit an approve-with-concern,
so the contradiction remains a finding and routes to V because round 3 is the last lawful
review.

### Dead ends and negative evidence

- No product-code delta exists after `7d179c6`; `git status --short` is empty.
- Pair A is 11 failed / 65 passed on both trees; pair D is 7 failed / 15 passed plus the same
  `ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP` error on both; pair E is 1 failed / 68 skipped
  on both.
- Both ui and web D14 gates fail only at their respective `app/layout.tsx:3:8` side-effect CSS
  import, once per surface, with exit 1 on base and HEAD.
- F21's evaluator-consumer member passes 1 / skips 5 in isolation; F22's registration S3b
  member passes 1 / skips 68; the T0 finding-4 POL-03 member passes on both trees inside pair F.
- The worker's `## r3` self-report predates the r3 report marker; the declared report-body SHA
  is exact. Neither fact repairs contradictory prose inside the hashed report body.

### One-prompt-machine upgrades

1. Make report lint compare every `Rework round`, `Rounds spent`, marker-round, and referenced
   self-report heading; reject any disagreement before a READY marker can be written.
2. Generate the HANDOFF round and self-report fields from the same structured metadata used
   for the first-line marker instead of copying prose between rounds.
3. Treat exact SHA validation as an integrity check, not a semantic-validity check; run the
   cross-section metadata lint before hashing.
4. In final round 3, have dispatch automatically render every remaining finding as a V
   decision-packet row and prohibit creation of a nonexistent round-4 packet.
