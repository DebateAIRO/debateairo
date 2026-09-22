SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, superpowers:using-superpowers, superpowers:verification-before-completion

# FIX-01 C1 fallback reviewer case file — Sol

- **Cause, not symptom:** the executable brief named an exported installer contract that does not exist. The worker preserved frozen files by inventing a parallel type in the test, so green type mutants prove that parallel type rather than the frozen seam.
- **Price:** adjudication required 12 lock-serialized compiler/test invocations: three required C1 runs, one baseline typecheck, four public-shape mutants, one import mutant, one neighbour mutant, one exact-contract probe, and one final restored-code run. Without the packet defect, the three required runs plus one refutation cycle would have sufficed.
- **Impact:** at least one rework/architecture decision is now unavoidable; ordinary worker rework cannot lawfully export or change the frozen installer type under the current file contract.
- **Second cause:** the task brief widened the frozen allowed set by mandating `tests/architecture/fix01-import-graph.test.ts`. The worker obeyed the brief and still crossed the frozen SPEC on paper.
- **Near miss:** I almost treated the clean `5/5` ×3 result plus four caught shape mutants as proof of R01. Reading the actual installer body exposed the incompatible return and private one-function interface.
- **Dead end:** asking the worker to “just import `RuntimeCaptureModule`” cannot work; `install/scheduler.ts:26` declares it without `export`, and `install/*.ts` is read-only. The authority problem must be repaired before redispatch.
- **What worked:** the resolve-hook test is a real child trace and the `@debateai/db` mutant failed at the intended assertion. The private-identifier neighbour remained green, so that test is discriminating on its declared local property.
- **What fought the review:** the exact task command is green while the governing contract is false. This is a proof-target problem, not flaky tooling or test execution.
- **Tooling avoided:** the 1,034-line traps file warned that checkout-based restores can stage mutations. Every mutation was restored by inverse `apply_patch`, followed by porcelain and SHA-256 checks; the lens ended byte-identical and clean.
- **Packet ambiguity:** task brief line 87 assumes an exported installer type, while the frozen artifact disproves it; task brief line 6 requires an architecture test, while SPEC §7 omits that suite from `Allowed`.
- **Upgrade:** pre-dispatch validation should resolve every named exported symbol from the exact seat checkout and fail if it is private or absent.
- **Upgrade:** pre-dispatch validation should mechanically require every mandatory deliverable path to be a subset of the frozen allowed set; packet widening must stop before a worker is launched.
- **Upgrade:** contract tests should import one authoritative type. Locally duplicating a “frozen” interface must be rejected by review unless byte identity to an exported source is itself machine-proved.
- **Efficiency:** provide raw RED/GREEN log artifact paths in the worker report. The current narrative is specific, but a reviewer cannot independently establish historical ordering from a one-commit task.
- **Result:** C1 spec compliance ❌; C1 code quality ❌. No Critical or Minor findings; Important I1–I2 are fully detailed in `fix01-c1-review-sol.md`.
- **Boundary:** C2–C5 and Task 1 Done were not reviewed or claimed.
