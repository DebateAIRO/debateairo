CODEX REVIEW TREL r3 — CHANGES · comments read through: trel-r3-2026-09-01

# CODEX REVIEW TREL r3

## VERDICT

**CHANGES — 1 NON-BLOCKING finding.** The product mechanics satisfy the r3 packet and the
D10 bounds. No product-code rework is requested. The stable worker report contains one
evidence-integrity defect, however, and the finding law does not permit approval with that
residue. Because r3 is the final review round, N1 is ready for the V decisions packet rather
than another rework round.

## FINDINGS

### N1 — Stable report transcribes evidence values that disagree with its named logs

**Severity:** NON-BLOCKING (report-only; no product-mechanics defect)

**WHAT:** The report's r3 GREEN table gives durations `10.56s`, `9.25s`, and `9.10s`,
whereas the three named logs record `9.41s`, `9.43s`, and `9.62s`. The handoff also says
the TREL log directory contains 34 files, while the directory contains 42 regular files
(the prior 34 plus eight r3 logs). The report body hash is valid, but it seals the
incorrectly transcribed values; it does not establish semantic agreement with the evidence.

**WHERE:** `trel-relay.md:256-258` (durations) and `trel-relay.md:519` (file count), checked
against `r3-green-cluster-run1.log`, `r3-green-cluster-run2.log`,
`r3-green-cluster-run3.log`, and the TREL log-directory inventory.

**WHY V MUST RULE:** This is non-product evidence residue, but every finding must be filed
or fixed and this is round 3 of 3. A fourth review round is not available. The logs predate
the stable report, so the mismatch is not a moving-snapshot race.

**SUGGESTED DISPOSITION:** V should either authorize a report-only correction of the four
values followed by regeneration of the body hash, or accept the correct log-derived values
on the decision record. No implementation change is needed.

## V DECISIONS PACKET ROW

| WHAT | WHERE | WHY V MUST RULE | RECOMMENDED DISPOSITION |
|---|---|---|---|
| Stable evidence report disagrees with its named logs: GREEN durations are `10.56/9.25/9.10s` instead of `9.41/9.43/9.62s`, and inventory is 34 instead of 42 files. | `trel-relay.md:256-258,519`; the three named r3 GREEN logs; TREL log directory. | Finding law forbids approval with residue, while the round-3 cap forbids another reviewer cycle. The defect is report-only and the product mechanics are complete. | Authorize report-only value correction plus regenerated body hash, or record the corrected values directly in V's decision. |

## MECHANICS VERIFIED

- The sessions-root acceptance arm matches the r2 requested input: production mode, blank
  `ACCEPTANCE_CODEX_BINARY`, `testOnlySessionsRoot` supplied, no `testOnlyCommand`, and an
  exact `TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN` assertion.
- M8 is real: if the new `testOnlyCommand === undefined` condition is removed, the original
  prescribed arm still passes. The disclosed companion arm is necessary and uniquely kills
  that mutant by requiring command-guard precedence when both seams are supplied in
  production.
- The sessions-root guard was moved rather than duplicated. The four relevant combinations
  are correct: production plus command reaches the command guard; test plus command selects
  the seam; production without command reaches the sessions-root guard; test without command
  resolves the default lazily.
- The acceptance source contains exactly four distinct `TEST_ONLY_*` codes. Only Codex
  declares `testOnlySessionsRoot`; Claude and Grok expose only their command seam.
- The cumulative diff remains inside `dialectical-engine/acceptance/**`. All behavior changes
  are env overrides or test-only guard mechanics. Unset-env behavior retains the existing
  defaults. The two new tests throw before `invokeCli`, so neither can make a live provider
  call.

## PACKET REVIEW

**CONFORMANT.** The r3 commit is `4aa9832449aab8350e634f12b5e484d9ff34c194` atop r2
`848deb4`; the r3 diff touches only `model-shim.ts` and `model-shim.test.ts` under the
acceptance directory, with 58 insertions and 3 deletions. The worktree is clean and
`git diff --check 1c9578a..HEAD` reports no diagnostics. The companion arm stays within the
judge's provisionally accepted scope.

## EVIDENCE CHECKED

- Stable report body hash recomputed as
  `4d5de8f58f19b1fc4dc59c3d5bc153606fd0ec2f0a8e251c17e7658e15e0075a`, matching its
  declared hash on repeated reads.
- Prescribed r3 RED: `1 failed | 12 passed (13)`, exit 1, with the expected sessions-root
  code versus `CODEX_CLI_BINARY_UNRESOLVED` before the implementation.
- M8 companion run: `1 failed | 13 passed (14)`, exit 1, expected command-forbidden but
  received sessions-root-forbidden after the mutant.
- Three r3 GREEN logs: 4 files and 60/60 tests, exit 0 on every run; actual logged durations
  are `9.41s`, `9.43s`, and `9.62s`.
- Typecheck log: exit 0. Zone log: the same two disclosed pre-existing failures, with
  `100 passed (102)`, exit 1.

## NOT VERIFIED

The full repository `pnpm test` remains reserved to the judge under D13. In accordance with
the packet and reviewer contract, I ran no tests or builds, made no provider call, and made
no product or git mutation.

## PREDICTIONS

Another lens may approve because the guard mechanics, mutant kills, scope, clean state, and
body hash all reconcile. The likely miss is treating a matching hash as proof that the
report agrees with its source logs; the hash proves immutability only, not transcription
accuracy.
