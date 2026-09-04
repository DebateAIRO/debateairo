# FIX-09 C3 implementation report

Date: 2026-09-04
Base C1/C2 PASS: `4d598fd91d7db20d0f884871215203bdc7f608ec`

## Outcome

Implemented only the authorized C3 deterministic tier gate and its minimum C2 fold
integration. The pure gate projects a closed input, computes
`sha256(canonical incident + canonical bundle hash)`, returns only closed policy fields,
and fails malformed, hostile, unknown, non-first-party, non-production, rootless,
external-root, floor-path, and zone-boundary inputs to report-only ESCALATE. A floor-clear
small first-party production root receives the QUICK size label, while both QUICK and
PR_FIX retain the bundle's APPROVAL_FIRST route with `quick_arm` OFF.

The listener persists the closed `policy_ref`, `input_hash`, and
`<size label>|<floor verdict>` result before ACK and cursor advancement in the existing
C2 transaction. The pre-trace daemon supplies an explicit UNCONFIRMED root, so this
phase cannot invent code-root evidence and conservatively persists
`ESCALATE|FLOOR_DENIED`. It writes no model-budget row and links no model, provider, CLI,
child-process, or `@debateai/db` dependency.

No C1 policy semantic or file changed. No C4, watchdog, launchd, V acceptance, dispatch,
mutation, product-code, board, merge, push, or Hermes action was performed.

## Entry and authority gates

- Entered on clean tracked HEAD `4d598fd91d7db20d0f884871215203bdc7f608ec`;
  pre-existing untracked C1/C2 Sol reports were left untouched.
- C1's independent canonical bundle hash remained exactly
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- The frozen C1 interface TypeScript project compiled with exit 0.
- C2's final Sol review was PASS and the baseline C2 unit plus real-PostgreSQL suite
  passed 20/20 before C3 edits.
- Final byte comparison against the base shows every C1 file and every C2 file outside
  the authorized minimal `fold.ts` integration unchanged.

## RED/GREEN record

- Genuine RED command:
  `pnpm exec vitest run tests/unit/fix09-tier-gate.test.ts tests/architecture/fix09-no-model.test.ts --reporter=dot`.
  The unit suite could not resolve the absent `tier-gate.js`; the architecture graph
  lacked the tier gate; and the real daemon persisted zero policy decisions instead of
  one. Exit was 1.
- Initial GREEN after the minimum implementation: 2 files passed, 7 tests passed.
- The final focused suite contains 8 tests after adding exact-bound inverse coverage.
  Three consecutive fresh runs passed 2/2 files and 8/8 tests each.
- The deterministic property runs 1,000 fixed-seed inputs twice and compares serialized
  policy-decision bytes. Dedicated cases cover canonical property ordering, incident
  identity, strict source ordering, closed invalid input, and hostile accessors without
  copying raw text, root paths, or fingerprints into output.
- The real daemon test resolves the live `main.ts` import graph, observes the tier gate,
  rejects forbidden dependency edges, persists one closed policy decision, and observes
  `obs.budget_usage` count 0.

## Mutation and inverse evidence

- Floor bypass mutant (`FLOOR_PATH` returned PR_FIX/FLOOR_CLEAR) failed the floor case;
  1 of 6 unit tests failed. Restored.
- Bundle-hash omission mutant (removed the bundle hash from input SHA-256) failed the
  independently pinned expected hash; 1 of 6 unit tests failed. Restored.
- Persistence omission mutant (removed `appendTierDecision`) failed the real daemon case
  with policy-decision count 0 instead of 1; the import-graph case remained green.
  Restored.
- QUICK off-by-one mutant (`productionFiles < max` instead of `<= max`) failed the exact
  boundary input by producing PR_FIX instead of QUICK; 1 of 6 unit tests failed.
  Restored.
- Inverse controls remain green: the exact QUICK boundary labels QUICK; exceeding each
  file/line boundary or removing RED/GREEN labels PR_FIX; property reordering preserves
  the byte result while changing incident identity changes the input hash.

## Final verification

- Focused C3, three consecutive real-PostgreSQL runs: `2 passed`, `8 passed` each run.
- Adjacent C1/C2 suite: `3 passed`, `99 passed`, including real PostgreSQL.
- Standing S01+C1 suite: `2 passed`, `91 passed`, including real PostgreSQL.
- C1 independent hash: exact value above; frozen interface compile: exit 0.
- Daemon source scans: zero matches for `occurrence_detail`, `identity.*`, raw
  `core.run`, `budget_usage`, model/provider packages, `@debateai/db`, `node:child_process`,
  or spawn/exec/fork calls. The real resolver trace supplies the executable import-graph
  proof.
- Text-byte audit passed: `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check` passed.
- Repository typecheck has no C3 diagnostic. It retains exactly the documented eight
  pre-existing `tests/unit/s14-ui.test.ts` diagnostics: TS2307 twice, TS18046 twice,
  TS2339 twice, and TS7006 twice.
- Source audit has no C3 finding. It retains the three pre-existing obs-capture direct
  environment findings and the two documented migration 0062 replay-form findings.
- Architecture audit remains blocked before a C3-specific result by the pre-existing
  absent sparse-worktree `web/package.json` (`ENOENT`). The dedicated C3 architecture
  suite passed independently.

## Files

- `tools/obs-listener/src/daemon/tier-gate.ts`
- `tools/obs-listener/src/daemon/fold.ts`
- `tests/unit/fix09-tier-gate.test.ts`
- `tests/architecture/fix09-no-model.test.ts`
- `.superpowers/sdd/PLAN-FixAgent/FIX-09-C3.md`

This report records the C3 implementation milestone only. FIX-09 acceptance and Done
remain pending V.
