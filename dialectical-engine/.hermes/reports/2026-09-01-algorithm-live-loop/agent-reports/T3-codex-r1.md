CODEX REVIEW T3 r1 — CHANGES · comments read through: t03-r1-2026-09-01

# T3 flagship lane — static peer review

## Verdict

**REWORK / CHANGES, round r1 of 3.** Ten findings: **B1-B5 blocking** and
**N1-N5 non-blocking but mandatory**. B1-B3 are J12's expected r2 content, not
surprises or retroactive blame: the worker filed before J12 existed and disclosed the
choice that the ruling later overturned.

This seat obeyed the packet's STATIC-only boundary. I ran no tests, builds, live provider
calls, or product writes. I inspected the frozen report/logs and ran read-only source,
history, and diff probes. Therefore I do not independently claim the worker's green
suites; I report their existing logs and use `CANNOT-ASSESS` where runtime evidence was
forbidden.

## Independent verification

- Packet first: the worker packet's base `5868a38`, branch `lane/t3`, two worker commits
  (`f2c76d0`, `7bf9193`), nine-file `+1155/-40` diff, 1c9578a source anchors, current
  provisioning paths, 23-test stable-red baseline, F13/F21/F22 references, report SHA
  scheme, and required worker deliverables all resolve. The worker report SHA reproduced
  as `78ec0f7551b84a52c73d436fd5b7bfddf0e2bcf3c7e31ae4470f630a566a67ae` with
  `sed '$d'`.
- RED: `logs/t03/red-acceptance-panel.log` fails at the persisted
  `panel_member_count >= 2` assertion with `expected 1 to be greater than or equal to 2`,
  `1 failed/1`; this is the desired skeleton-literal failure, not setup or classifier
  scaffolding.
- Wiring: both production `reduceAssessment` producers (root at runner `:1779-1840`,
  child at `:1932-2012`) call shared `runNodePanel`. The only
  `createUnmeasuredDisagreement()` production call is behind
  `effectiveMakerCount <= 1` at `:1530-1537`. Static search found no third producer.
- Policy: the production additions bind register-reader values by identifier; a diff-only
  scan found no redeclared `0.25`, `0.5`, band vocabulary, or provider-family values.
  `readPanelWeightingControls` plus `readVerdictLabelControls` feed the acceptance boot.
- Mutant 3 story checks out statically: the shipped receipt assertion now requires a
  non-null family that belongs to the sealed family set
  (`acceptance/panel-multi-maker.test.ts:308-321`), so an always-UNKNOWN `familyOf`
  mutation reaches a failing assertion instead of the old vacuous ordinal branch.
- Confirm-item 5's all-failed receipt is present: the acceptance fixture asserts the
  degraded mark, zero non-author voices, typed parse failure, typed-absent dispersion,
  one contract hash, and T16-derived real band movement (`:400-438`). Timeout and parse
  failure kinds also have direct unit coverage. The partial mark is the uncovered arm in
  B5.
- F29 and F30 are already filed and correctly routed. The hand-maintained orphan list was
  corrected in-lane; serve-side consumption of the recorded step-down belongs to T12.
- The worker's two load flips were not absorbed into the T3 failure set: the registration
  RSS case is an F22-class instance; the obs-capture child was signal-killed after 5166ms,
  then the combined isolation probe passed `67/67`. N3/N5 preserve the required ticket
  follow-through.

Fresh static probe, output verbatim:

```text
$ git diff --quiet 5868a38..HEAD -- dialectical-engine/tests/integration/database.test.ts; echo "database.test.ts diff exit=$?"
database.test.ts diff exit=0
$ rg 'scoringOperator:' dialectical-engine/tests/integration/database.test.ts | wc -l | tr -d ' '
8
$ rg -n 'PANEL-PARTIAL' dialectical-engine --glob '!node_modules/**'
dialectical-engine/apps/runner/src/index.ts:152:export const PANEL_PARTIAL_MARK = "PANEL-PARTIAL" as const;
$ rg -n 'familyOrdinal === 1|MULTIPLIER branch is therefore unreachable' dialectical-engine/acceptance/panel-multi-maker.test.ts
323:            member.familyOrdinal === 1
330:        // The repeated-family MULTIPLIER branch is therefore unreachable here
```

## Findings

### B1 — J12 loud stop is not implemented

**File/line:** `dialectical-engine/apps/runner/src/index.ts:1539-1554`.

**Scenario:** construct/boot an M>=2 run without sealed T16 panel controls ->
`runNodePanel` selects the author's voice, records
`reason: "PANEL_WEIGHTING_UNCONFIGURED"`, and lets execution continue. **Required
outcome:** J12 says the run stops loudly, following the scoring-operator precedent; the
missing-row condition must not become a degraded self-grade after model spend.

**Evidence:** the fallback branch and value are present verbatim at runner `:1539` and
`:1549`; the worker disclosed this as F6 before J12 existed. Replace the fallback with a
typed loud guard on the M>=2 path (before the first model call), and add a RED proving the
typed stop and zero model-call spend. Route: T03 r2.

### B2 — J12's eight M>=2 database fixtures are not coherently panel-seeded

**File/line:** `dialectical-engine/tests/integration/database.test.ts:289-317,
1594-1611, 1702-1719, 1797-1808, 1926-1944, 1992-2008, 2076-2096,
2623-2640`.

**Scenario:** apply B1's lawful loud stop, then run any of the eight existing
`scoringOperator`-bearing M>=2 fixtures -> each lacks a panel policy/seeded panel rows and
stops on configuration instead of exercising its unchanged subject assertion. Current
HEAD avoids the blast radius only through B1's now-forbidden fallback.

**Evidence:** the fresh probe counted exactly eight `scoringOperator:` sites and
`git diff --quiet` returned 0 for the entire file. Seed/read the T16 panel rows as the
J12 coherence consequence, teach the shared provider double to answer panel assessment
calls without consuming the old fixture queue, and leave each fixture's subject
assertions unchanged. Route: T03 r2.

### B3 — J12's paired base-to-HEAD database failure payload is absent

**File/line:** worker report `t03-panel.md:252-272`; T3 log directory.

**Scenario:** the J12 coherence edits change execution in
`tests/integration/database.test.ts`, a file already in the 23-test stable-red set -> a
count-only or unpaired after-run can hide a changed failure cause as "pre-existing".
**Required outcome:** paired base/HEAD failure payloads disclose whether the existing
failure signature changed, while the fixture's own assertions remain unchanged.

**Evidence:** the report lists typecheck, zone, acceptance, and D15 deferral but no
database-test pair; the log directory contains no database base/HEAD payload. Capture and
report both sides after B2. Route: T03 r2 evidence gate.

### B4 — the acceptance receipt never reaches the repeated-family multiplier

**File/line:** `dialectical-engine/acceptance/panel-multi-maker.test.ts:294-334`;
`dialectical-engine/acceptance/seed-register.ts:41-56`;
`dialectical-engine/packages/register/src/algorithm-policy.ts:96-99,313-318`.

**Scenario:** break or bypass the ordinal>1 multiplier arithmetic while leaving sealed
family lookup and ordinal-1 recording intact -> the current acceptance test remains
green, because every configured provider belongs to a distinct family. That is stage
execution, not acceptance-path proof that the ruled family discount is live.

**Judge's explicit question:** a same-family acceptance fixture is **lawful and cheap**.
The register schema already accepts multiple provider refs in one family; no production
topology change or live provider is needed. Seed a test map with two configured provider
refs sharing a family, assert an ordinal-2 member has
`effectiveWeight = earnedWeight * sealedMultiplier`, and make selection discriminate the
discounted from undiscounted arm. This can share one M=3 standing-database fixture with
B5. Route: T03 r2.

### B5 — the partial-panel mark branch is untested

**File/line:** `dialectical-engine/apps/runner/src/index.ts:1646-1652`;
`dialectical-engine/tests/unit/t03-judge-panel.test.ts:195-217`.

**Scenario:** in M=3, one non-author panel member fails and one parses -> production is
supposed to proceed and persist `PANEL-PARTIAL`. Delete the runner's partial-mark line ->
the current suite still has no assertion that fails. The unit case proves only that
`runJudgePanel` keeps parsed voices; it does not call the nested runner branch or read the
receipt. M=2 acceptance can express only healthy or all-other-failed.

**Evidence:** the repository-wide static probe found `PANEL-PARTIAL` only at its constant
definition; no test contains the value. Add an M=3 receipt fixture with one failed and one
surviving non-author voice and assert the mark, retained voice, typed failure note, and
continued reduction. Route: T03 r2.

### N1 — packet repeats the F9 visible-mark surface defect

**Packet/line:** `packets/t03-panel.md:32-35`.

**Scenario:** a worker must implement "partial panel -> visible mark" while serve/UI is
forbidden, but the packet names neither the mark nor the authoritative visibility
surface -> the worker invents `PANEL-PARTIAL` and chooses the disagreement JSONB receipt.
Another worker could lawfully choose a different name/surface, producing incompatible
receipts.

This is a packet finding, not worker blame. Ratify the partial vocabulary member and
surface (or cite the ruling that does) in r2. Route as a recurrence of board F9's packet
lint class.

### N2 — mandatory packet paths advertised as absolute do not resolve

**Packet/line:** `packets/t03-panel.md:8-10`.

**Scenario:** use the packet's literal self-report or log path from its declared cwd ->
`.../t03-panel-self.md` and `.../logs/t03/` are not paths. The board made reconstruction
possible, but the packet explicitly claimed these were absolute.

Replace both abbreviations with full paths and extend the packet path lint to reject
ellipsis in writable/deliverable fields. Route as an F12 recurrence.

### N3 — the obs-capture signal-kill flake needs its own tracked family row

**File/line:** `tests/architecture/obs-l2-s05-import-graph.test.ts:461`; worker log
`logs/t03/after-zone-run1.log:505-512,1378-1396`.

**Scenario:** saturated host -> the runner child lasts 5166ms and `spawnSync.status` is
`null` -> the import-graph assertion reports a false semantic failure. The same test
passes in the worker's isolation probe. This is not T3-owned, but it is not optional.

Route the worker's F5 to a named board row alongside F13/F21/F22; harden the process
fixture or constrain it to the D15 quiet-host gate.

### N4 — the ceremony double's dead classifier still guesses from FIFO

**File/line:** `dialectical-engine/acceptance/ceremony.test.ts:69-74`.

**Scenario:** a judge prompt is JSON wire-escaped, so the literal
`"statement": non-empty string` check does not match -> the double selects queue index 0
when no class matches. A shifted queue can return a plausible wrong response and surface
as a bogus production schema failure instead of a fixture refusal.

The worker documented this as F7 but did not fix it. Match an escape-safe discriminator
and return a named 500/unclassified record rather than FIFO guessing. Route same day;
non-blocking changes timing, not obligation.

### N5 — the registration RSS flip must extend F22's tracked membership

**File/line:** `dialectical-engine/tests/unit/registration.test.ts:271`; worker logs
`base-fails.txt:11`, `probe-obs-l2-isolated.log:13-18`.

**Scenario:** load changes the isolated RSS curve enough to fail on base, while the same
test passes after and in the 67/67 isolation probe -> later lanes can misclassify a
coincidental green/red transition as diff behavior. The worker did not absorb it, but
F22 currently names the S3b separation-ceiling test, not this S3c RSS instance.

Append this exact test to F22 (or mint a sibling registration-load row) with its paired
evidence so membership, not a generic "same class" phrase, is authoritative.

## Not independently verified

- No suite, build, typecheck, database fixture, mutant, or provider call was rerun; the
  packet prohibited them. Worker runtime claims remain upstream evidence.
- D15 full-suite product proof remains deferred to the integration batch.
- Serve-side consumption of F30's recorded band step-down is outside T3 and remains T12's
  responsibility.
- I did not inspect the 1,959-line spine.

## PREDICTIONS

I predict another lens will accept the family receipt because `familyOrdinal` is present,
missing that every ordinal is 1 and the multiplier branch is unreachable. I predict a
second lens will merge J12's three obligations into only the loud-stop code change and
omit either the eight unchanged-assertion coherence fixtures or the paired database
failure payload. I predict a test-focused lens will notice the all-failed acceptance arm
but miss that `PANEL-PARTIAL` appears nowhere in tests because an M=2 topology cannot
reach it. Finally, I expect at least one review to call the obs-capture/registration flips
"known flakes" without adding the exact new test membership to a ticket; the first thing
to check is the board row's enumerated membership, not its generic family label.
