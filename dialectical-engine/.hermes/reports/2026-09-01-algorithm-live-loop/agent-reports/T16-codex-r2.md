CODEX REVIEW T16 r2 — CHANGES · comments read through: t16-r2-2026-09-01

# CODEX REVIEW T16 r2

## VERDICT

**CHANGES — 0 BLOCKING, 3 NON-BLOCKING.**

All four r1 product blockers are closed: development v5 and acceptance v2 preserve sealed
v4/v1, role provenance partitions exactly five J1 rows from two J8 rows, the warning is on
the real dev CLI seeding path and acceptance seeding path, and the scanner catches the four
r1-shaped hardcodes across runner/API/package consumers. The report and file-board metadata
are not converged, however. Under the reviewer contract, non-blocking findings are mandatory
fixes. Round 3 is the last lawful rework; the residue below is text/state-only and already
shaped for the final r3 packet.

## FINDINGS

### N1 · NON-BLOCKING · The suite row and authority narrative still implement D13, not D15

- **WHAT:** The revised report says `D13-DEFERRED` and assigns the authoritative full run to
  the judge-stage serialized run in this worktree. Ruling D15 and the r2 packet require the
  exact label `D15-DEFERRED` and move authority to the integration branch's post-merge batch.
- **WHERE:** `agent-reports/t16-register.md:243-257`.
- **FAILURE SCENARIO:** An integration owner follows the r2 handoff → reads that the judge
  worktree run is authoritative → treats the actual D15 post-merge-batch run as secondary.
  Even if nobody follows the prose, the packet's exact-label gate fails at line 243.
- **EVIDENCE:** `rg 'D13-DEFERRED|D15-DEFERRED'` returns the D13 row at line 243 and no D15
  row; lines 245-257 repeat the obsolete execution locus. This is the sole unresolved r1
  finding. The lack of a full-suite result remains non-blocking by ruling.
- **R3 FIX / TICKET:** T16 worker: replace the suite result with exact `D15-DEFERRED /
  CANNOT-ASSESS`, rewrite the authority paragraph for the integration post-merge batch, and
  retain the two interrupted runs only as non-authoritative trap records.

### N2 · NON-BLOCKING · The authoritative board never recorded the r2 review transition

- **WHAT:** The board still describes r1 rework as dispatched, keeps `rework_round: 0`, and
  has no r2 review comment/state even though the worker filed an r2 marker and the r2 review
  packet was dispatched.
- **WHERE:** `board/T16-register.md:7,21,25-30`.
- **FAILURE SCENARIO:** A heartbeat seat reads the board as protocol law 2.4 requires → sees
  active r1 rework rather than an r2 review/final-r3 transition → either wakes the wrong
  owner or duplicates rework.
- **EVIDENCE:** The board says `status: changes_requested`, `rework_round: 0`, verification
  `codex static review r1`, and `comments_read_through: packet-t16-2026-09-01`; the worker
  marker and current packet both say r2. The user's direct dispatch made this review
  executable but did not cure the state disagreement.
- **R3 FIX / TICKET:** Orchestrator: reconcile the board to this r2 CHANGES verdict, advance
  its rework accounting, and dispatch the final r3 from that recorded state. If the state
  cannot be reconciled, route a V-packet row; round 4 is forbidden.

### N3 · NON-BLOCKING · The handoff claims a self-report section that does not exist exactly

- **WHAT:** The worker report says the self-report contains section `## r2`; the actual line
  is `# ## r2 — the rework round, as a case file`.
- **WHERE:** `agent-reports/t16-register.md:368-369` and
  `agent-reports/t16-register-self.md:219`.
- **FAILURE SCENARIO:** A round extractor looks for an exact `^## r2` section → does not find
  the claimed section → cannot associate the r2 case file with this handoff.
- **EVIDENCE:** `rg -n '^# ## r2|^## r2$' t16-register-self.md` prints only
  `219:# ## r2 — the rework round, as a case file` for the worker self-report.
- **R3 FIX / TICKET:** T16 worker: change line 219 to an exact `## r2` heading (move the
  descriptive text below it if desired) and make the handoff claim byte-accurate.

## R1 FINDING CLOSURE

- **B1 CLOSED.** `DEVELOPMENT_REGISTER_VERSION=5` and
  `ACCEPTANCE_REGISTER_VERSION=2`; the migration governs versions 5/2 and leaves 4/1
  undeclared. Two integration fixtures seal base-shaped v4/v1, snapshot rows plus version
  records, seed the new version, and assert the historical snapshot is unchanged. Launch
  pins in dev API environment/process and the live topology JSON now resolve to v5.
- **B2 CLOSED.** Independent builder output was:
  `J1(5)=disagreementThreshold,dispersionScale,downgradeBands,providerFamilyMap,repeatedFamilyMultiplier`
  and `J8(2)=evaluatorRoleRef,synthesizerRoleRef`. Both role rows ended in
  `#J8+configured-provider-set-derivation`; the exact-source-ref test and closed-partition
  test are present.
- **B3 CLOSED.** The dev CLI resolves validated role overrides and passes them to
  `seedDevelopmentDeploymentRegister`, whose entrypoint calls
  `warnOnIdenticalSynthesisRoleRefs` before database work. The integration test spawns that
  CLI and asserts exactly one warning for identical refs and empty stderr for differing
  refs. Acceptance seeding has both arms. `readSynthesisRoleControls` retains its warning.
- **B4 CLOSED.** The scanner covers `packages/{judgement,serve,propagation}/src`,
  `apps/runner/src`, and `apps/api/src`; committed controls cover every consumer family,
  integer-valued policies, bands, and UNKNOWN-family behavior. Independent output:

  ```text
  runner-repeated-family: hits=2 rules=SEALED_DECIMAL,POLICY_IDENTIFIER_LITERAL
  serve-evaluator-rounds: hits=1 rules=POLICY_IDENTIFIER_LITERAL
  api-envelope-inputs: hits=2 rules=POLICY_IDENTIFIER_LITERAL
  judgement-family-behavior: hits=1 rules=FAMILY_BEHAVIOR
  surface=packages/judgement/src,packages/serve/src,packages/propagation/src,apps/runner/src,apps/api/src
  real-files=46 real-offences=0
  ```

- **N1 OPEN as r2 N1.** Placeholders are gone, but D15's exact label and authority are not.
- **N2 CLOSED.** The r2 packet no longer uses the T0 pre-provisioning report for failure
  classification; the worker applies D12 in its report.
- **N3 CLOSED.** The r2 packet explicitly enumerates acceptance seeding and both register
  writers.

## PACKET REVIEW

The r2 packet resolves, carries J7/J8/D15/J10(c), names both seeders, fixes the failure-
authority and acceptance-scope defects from r1, and bounds this seat to two report files.
Its content is conformant. Dispatch state is not: N2 records the board disagreement against
the orchestrator rather than the worker.

## EVIDENCE CHECKED

- Worker report marker and body hash are valid: the declared SHA-256 equals the hash of
  lines 3 onward.
- `git log --oneline 1c9578a..HEAD`: five T16 commits, ending at
  `c85d8c6fcaf5521e031676d8b38fcad9ab5c4c5f`. Diff shortstat: 20 files changed, 1870
  insertions, 59 deletions. `git status --short` was empty; `git diff --check` emitted no
  output.
- Base and HEAD `register.bootstrap.json` both resolve to blob
  `b6b1cfe7409abdc642ae0b6548d0aad184da5531`; the strict five-pin file is untouched.
- Pure row-builder probe: 15 rows; exact J1/J8 partitions quoted above; scale 1, threshold
  0.25, multiplier 0.5, `CAPPED→CAPPED` / `FULL→CAPPED`, OpenAI/Anthropic/xAI, unmapped
  kind `UNKNOWN`, behavior `EXEMPT_FROM_REPEATED_FAMILY_DISCOUNT`.
- Pure scanner discrimination output is quoted verbatim under B4.
- Worker r2 RED log: `Test Files  1 failed | 1 passed (2)`,
  `Tests  7 failed | 18 passed (25)`, `RED2_EXIT=1`. It includes the historical dev and
  acceptance failures, J1/J8 failures, and real-entrypoint warning failures.
- Worker GREEN logs 1/2/3: each reports 8/8 files, 56/56 tests, and exit 0; durations are
  110.23s, 206.98s, and 118.14s. Normalized sorted test names in all three hash to
  `ea9a7f601bb32e51509f9744ada3c135fbbeb8ce4d17ac3296c7cfd1bc7e1b5a`.
- Missing-row coverage statically enumerates all five manifest families and all five typed
  reader failures. Identical/differing warning arms and configured-provider rejection are
  present for the dev CLI; acceptance has identical/differing arms.

**NOT VERIFIED:** No pnpm, Vitest, build, typecheck, database, or application command was
run; the packet required static review. The full suite is deliberately not assessed here;
D15 makes the integration post-merge batch authoritative. I did not read the 1,959-line
spine and did not edit the product worktree, board, worker report, or worker self-report.

## PREDICTIONS

I predict another lens may approve because every product-level r1 blocker is genuinely
closed and all three 56/56 logs agree. The first counter-check should be the suite row at
worker-report line 243: its exact D13 label and judge-stage authority contradict the r2
packet's D15 gate. A board-driven lens may instead refuse to start because the board still
shows r1 rework; the direct r2 dispatch resolves this seat's authority but not the
orchestrator-state defect.
