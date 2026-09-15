## 2026-09-03 — S11 r2 independent review

### Case outcome

The review found a local fix wrapped around an unresolved policy class. The worker correctly removed the strict grader-pool stop for the filed three-provider deployment, but the helper-level test made the ruling look more general than the full harness is: a coherent one-provider deployment still dies in candidate derivation. The same local-vs-system boundary caused the experimental-design error—the ranking maximizes per-cell separation while sacrificing cross-arm comparability.

### What nearly fooled me

The test name `EXACTLY ONE identity available` nearly carried the claim by itself. Reading its fixture against the candidate declared above it showed that the candidate still names two identities and only the grader pool was narrowed. Price: one additional end-to-end data-flow pass through [the test](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/tests/unit/t15-eval-harness.test.ts:232), [deriveCandidateConfigs](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:176), and [runEvalHarness](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:577). Value: it changed the answer to the central V-policy question.

A second near-miss was accepting “independent of the candidate” as “independent of the arm.” They are not equivalent. With three identities, the complement grader is mechanically selected by which two identities define the arm; repeating it doubles the model-specific effect. The useful upgrade is a mandatory experiment-design question in every eval packet: *is treatment assignment separable from judge assignment?*

### Dead ends and evidence limits

The reviewer protocol says to probe rather than read, while the dispatch says static only. I did not try to smuggle a test through that conflict. I used deterministic branch tracing plus read-only evidence parsers, and reported runtime freshness as `CANNOT-ASSESS`.

The D56 chronology is not recoverable from the two filed outputs: both have the same second-level modification time and neither records order or exit. Re-running the bad input proved the checker fails now, not that the historical bad run preceded the historical good one. The one-prompt improvement is mechanical: any “A before B” evidence requirement should ship one ordered transcript template with sequence, timestamps, and exits.

### Friction I caused

I twice passed a JavaScript-side path variable as though it were a shell variable, and once used zsh's reserved `status` name while formatting a no-match search result. Price: three avoidable read-only command retries. The prevention rule is simple: use explicit working directories or interpolate before dispatch, and prefix every shell temporary with the lane/task ID (`s11_...`).

`rg --files` also hid ignored `.log` evidence, which briefly made the evidence directory look incomplete. `ls`/`find` showed the records were present. For mission evidence, enumerate the named absolute artifacts directly rather than relying on VCS-aware file discovery.

### Packet friction and upgrade

The dispatch's exact required first line conflicts with the reviewer protocol's instruction to open with `SKILLS LOADED`. The direct dispatch is higher and was followed; the skills declaration is line 2. Future review packets should explicitly state that this is an intentional override so a reviewer does not have to adjudicate formatting law while filing.

The packet would become materially stronger by including three required review fixtures as data, not prose:

1. A coherent whole-deployment one-model fixture: configured providers, sealed role refs, candidate derivation, grader seating, marks, and expected gate outcome.
2. A cross-arm assignment matrix showing candidate identities and grader identities side by side, so confounding is visible before code review.
3. A provenance schema separating provider ref, maker family, exact model/version, and fresh session/instance. Conflating these made `same-model` look proven when only provider-ref equality was available.

### Skills actually loaded

`superpowers:using-superpowers`, `heartbeat-protocol`, `heartbeat-reviewer`, `superpowers:verification-before-completion`, and `superpowers:systematic-debugging`.

## 2026-09-03 — S11 r3 independent final-worker-round review

### Case outcome

The three r2 blockers are closed. The important distinction is that the owned harness now has a
coherent one-provider path, while the current CLI still has an independent T9-adapter availability
stop. V-S11-3 makes the former the lane's closure boundary; conflating those two would either reopen
a fixed policy defect or hide a real integration dependency.

The verdict is `APPROVE` with two non-blocking tickets: correct the mutation-credit accounting when
the mission next consumes the lane, and update two stale strict-policy comments at the first T9
adapter integration touch.

### What nearly fooled me

The freshly run mutant index returned CLEAN, and the generated credit artifact appeared stronger
because it listed every failed test. Counting the source data instead of trusting the label changed
the result: 82 `killed by:` prefixes contain only 81 actual failures because the m9 survivor is
written with the same prefix. Reading causes then exposed collateral D43 edges: four unrelated
mutations fail a projection-order test only because that test hard-codes the refusal's absolute
index and the number of condition marks changed.

The counterweight was equally important. I did not let the accounting defect become a product
blocker by association. Tracing m15–m22 individually showed each r3 target still has a direct
discriminating failure. The evidence description is wrong; the three repairs are not thereby
uncovered.

### Process corrections

I first used `rg -h` expecting “hide filename”; in ripgrep that spelling prints help, producing a
bogus 135-line count. Repeating with the unambiguous `--no-filename` option produced 81, and a
normalised set comparison showed all 81 real labels match their transcripts. Prevention: never use
short options in evidence-count commands when the tool's dialect is easy to confuse.

My first normalised-set command also let BSD `sed` parse a substituted Unicode test title badly.
Moving the transformation into `awk -v` removed shell interpolation from the pattern and produced
an empty `comm -3`, the intended proof. Price: two avoidable read-only retries; neither changed the
workspace.

### Skill influence

`superpowers:systematic-debugging` changed the mutation finding from “the count is off” to a root-
cause statement: the survivor sentinel shares the kill prefix, and the extractor records every
failed test rather than only the assertion targeted by a mutant. `superpowers:verification-before-completion`
set the final gate: exact first line, absolute citations, first report/last predictions, append-only
self-report, clean lane worktree, and diff restricted to the two authorized reports.

### Review upgrade

Future mutation-credit artifacts should have typed rows rather than prose prefixes: mutant,
outcome, targeted property, failing assertion, and credit classification (`DIRECT`, `COLLATERAL`,
`THREW_BEFORE_ASSERTION`, `SURVIVED`). A count can then be derived by class instead of treating
every failed test—or a survivor sentinel—as equivalent evidence.
