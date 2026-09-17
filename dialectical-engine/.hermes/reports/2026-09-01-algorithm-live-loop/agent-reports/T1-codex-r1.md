CODEX REVIEW T1 r1 — CHANGES · comments read through: t01-r1-2026-09-01

# CODEX REVIEW T1 r1

## VERDICT

**CHANGES** — rework round 1 of the maximum 3. Three blocking findings and one
non-blocking evidence finding.

The contract-door implementation itself is directionally faithful: the schema rejects the
named invalid shapes, the runner imports the contract constants, the touched-file surface is
inside the worker packet, the RED log fails for the right reason, and the focused cluster
logs show 16/16 passing in 3/3 final runs. Approval is nevertheless unavailable because the
single-source DoD is still false, its grep test makes that false state green, and the required
full-suite evidence is absent.

## FINDINGS

### B1 — BLOCKING · The worker packet's scope cannot satisfy the quoted single-source DoD

- **WHAT:** The two named external sites are second definitions of the 1–5 bound, not
  harmless independent literals. `costEnvelopeBasisSchema` is an autonomous Zod validator.
  The UI expression controls `ready`, and `submit()` returns early when `ready` is false;
  the same UI file also enumerates `[1, 2, 3, 4, 5]`. A contract ceiling change would leave
  all of those at 5. Calling the UI a presentation/consumer surface does not save it: under
  a single-source rule, a consumer that hard-codes the bound becomes another source.
- **WHERE:** `packets/t01-depth.md:16-20,48-50` conflicts with
  `packages/budget/src/index.ts:40`, `apps/ui/app/new/page.tsx:76`, and
  `apps/ui/app/new/page.tsx:195`.
- **WHY:** Goal lines 98–101 require the 1–5 bound to be "defined ONCE" in
  `packages/contract` and add the literal negative invariant "No second literal 5 (DoD
  greps for it)." The budget validator is unambiguously another definition; the UI gate and
  option domain independently encode the same maximum. The worker correctly obeyed scope by
  not editing them and correctly named them, but routing them onward does not make T1's DoD
  pass. The dispatch packet created an impossible scope-vs-DoD choice.
- **SUGGESTED FIX:** Reissue/expand the worker packet (or create explicitly linked tickets
  while keeping T1 unapproved) so all duplicate definitions can be removed. Reuse
  `ExpansionDepthSchema` or the exported min/max in `packages/budget`; import the constants
  in `apps/ui` for the readiness gate and derive the option list from them. If V intends a
  narrower runner-only rule, V must change the task text; a worker/reviewer cannot silently
  narrow "defined ONCE / no second literal 5."

### B2 — BLOCKING · The alleged single-source regression test blesses the known breaches

- **WHAT:** The test records the two duplicate-source files in
  `DECLARED_SECOND_SOURCES` and asserts that the scanner equals that list. It therefore
  passes precisely while shipped code has the forbidden second sources. Its deliberately
  same-line regex also misses the UI's `[1, 2, 3, 4, 5]` option-domain literal at line 195.
- **WHERE:** `tests/unit/s1-1-depth-contract.test.ts:223-242,258-274`.
- **WHY:** The DoD asks for a grep test proving a negative invariant, not an exact-set
  registry of known violations. A mutation that adds another duplicate inside an already
  exempted file can also remain invisible because the oracle compares files rather than
  sites. Focused GREEN 16/16 cannot prove the required property when the oracle encodes the
  wrong expected state.
- **SUGGESTED FIX:** After B1's scope is reconciled and the duplicate sites are removed,
  make the independent non-owner scan expect an empty result. Broaden it to catch bound
  validators, comparisons, and option domains; add positive controls showing each syntax is
  detected, plus a negative control for unrelated depth concepts.

### B3 — BLOCKING · Required full-suite evidence is missing, so regressions cannot be assessed

- **WHAT:** The mandated `## SUITES` section contains only `<!--SUITES-->`.
  `typecheck-run2.log` does contain `TYPECHECK_EXIT=0`, but `test-run1.log` ends with
  `[ELIFECYCLE] Test failed` and contains no Vitest `Test Files`, `Tests`, `Duration`, or
  explicit exit marker. `test-nonintegration-run1.log` is likewise incomplete. No full-suite
  passed/total or exhaustive failure classification exists.
- **WHERE:** `agent-reports/t01-depth.md:159-163`; `logs/t01/test-run1.log`;
  `logs/t01/test-nonintegration-run1.log`.
- **WHY:** Worker packet lines 29–36 require `pnpm run typecheck` and `pnpm test` exit codes,
  passed/total, and every failure named/pre-existing-or-owned. Review packet lines 35–40
  make missing static evidence a CANNOT-ASSESS finding. The schema tightening can affect
  ask fixtures and consumers repo-wide, so the focused cluster does not replace the full
  suite.
- **SUGGESTED FIX:** Complete `pnpm test` in the worker-authorized environment, capture an
  explicit exit marker and totals, classify every failure against a valid baseline, and
  populate `## SUITES`. If the suite cannot complete, use the packet's BLOCKED marker and
  name the unresolved resource/evidence instead of setting READY FOR PEER REVIEW.

### N1 — NON-BLOCKING · Two evidence-provenance claims are not present in their named logs

- **WHAT:** The report says each mutant log records `git status --porcelain` after restore,
  but the named `mut*.log` files end at test `EXIT=` lines and contain no restore-status
  output. It also cites `generate-contract.log` for a snapshot/diff measurement, while that
  log records only generator output plus `GEN_EXIT=0`, not the snapshot comparison or its
  exit status. Current `git status --short` is clean, but that cannot reconstruct each
  historical restore.
- **WHERE:** `agent-reports/t01-depth.md:128-141,215-224` and
  `logs/t01/mut*.log`, `logs/t01/generate-contract.log`.
- **WHY:** Heartbeat protocol §2.6 requires reported evidence to be verbatim and the review
  packet requires line-level verification against named logs. The mutation counts do match
  the logs; the additional provenance claims do not.
- **SUGGESTED FIX:** Capture the full mutate/run/restore/status transcript and the
  snapshot/generate/diff/exit transcript in the cited logs, or narrow the report to what the
  existing logs actually prove.

## PACKET REVIEW

**Worker packet: non-conformant because of B1.** It has all four elements, every absolute
path resolves, its allowed list covers its demanded deliverables, branch `lane/t1` and base
`1c9578a` resolve, the cited base runner function is at lines 987–996, `generate:contract`
maps to `tsx packages/contract/src/generate.ts`, and the frozen SPEC hash matches the goal
prompt. Its load-bearing defect is quoting the repo-wide single-source invariant while
excluding already-existing violating surfaces from the allowed implementation scope.

The request for the exact parseRequest machine code is also needlessly under-specified: the
packet requires it but does not name `MALFORMED_REQUEST`. This was discoverable and the
worker got it right, so I treat it as packet-efficiency debt rather than another blocker.
The cited T0 baseline is pre-generation and cannot by itself classify failures exposed only
after provisioning; B3's rework needs a comparable post-generation pin or an explicit
failure-by-failure determination.

**Reviewer packet: conformant.** Its ticket state matches `waiting_review`; both writable
paths are permitted; base, goal line range, marker, and static-only stop condition resolve.
I wrote only the two authorized reviewer files.

## EVIDENCE CHECKED

- Ran the packet-mandated `git diff 1c9578a..HEAD` and `git log --oneline
  1c9578a..HEAD`: two `T1:` commits, HEAD `1963530c33638515aa8f70b45a044cc1364f0fb6`.
- `git diff --name-status` shows exactly five worker-packet files; `git status --short` was
  empty and `git diff --check` exited 0.
- Verified goal lines 97–106 against the frozen SPEC and verified goal SHA-256
  `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986`.
- Independent shipped-code scan returned the owning contract literal plus
  `packages/budget/src/index.ts:40` and `apps/ui/app/new/page.tsx:76`; context inspection
  found the reinforcing UI option domain at line 195. Traced budget use through
  `parseCostEnvelopeBasis` and UI use through `ready` → early return in `submit()`.
- `red1-depth9.log`: `1 failed / 1 total`, received HTTP 202 instead of desired 400,
  `RED1_EXIT=1`. Base inspection confirms `depth_params` was an open unknown record and the
  runner used literal 1/5.
- `cluster-s02c1-final-run{1,2,3}.log`: each `16 passed / 16 total`, `EXIT=0`.
- Mutation summaries match the report: clean 16/16; open record 8 failed/8 passed; ceiling
  9 gives 3 failed/13 passed; non-strict gives 1 failed/15 passed; runner literal gives
  2 failed/14 passed; neighbour message gives 16/16.
- `typecheck-run1.log`: two owned TS2353 failures; `typecheck-run2.log`:
  `TYPECHECK_EXIT=0`. `generate-contract.log`: `GEN_EXIT=0`, but no recorded diff result.
- `test-run1.log` and `test-nonintegration-run1.log`: no terminal totals/exit evidence.

**Not verified:** No pnpm, install, typecheck, test, or suite command was run because the
review packet explicitly forbids it. Full-suite status, snapshot byte identity, and each
historical mutant restore therefore remain unverified beyond the artifacts described above.

## PREDICTIONS

I predict a behavior-focused lens will approve the new contract schema and runner import but
underweight the literal "defined ONCE" requirement by treating the UI as presentation. I
predict a report-focused lens will catch the empty `## SUITES` section but may miss
`page.tsx:195` because the worker's scanner catches only the readiness expression in that
file. The first checks I would compare are whether any lens accepts an exception list as a
single-source proof and whether it mistakes an incomplete log's existence for a completed
suite.
