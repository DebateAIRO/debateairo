CODEX REVIEW S11 r2 — REWORK · comments read through: s11-r2-2026-09-03
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging

# Verdict

`REWORK`. The filed three-identity path now runs through grader assignment and the current source emits its degradation marks before the approval gate. That local correction is real. The filing is not ready for V, however, because (1) a coherent one-model deployment still hard-refuses before grader assignment, (2) the per-arm complement ranking makes grader identity a function of the candidate arm and then doubles that grader, so the resulting arm means are confounded, and (3) the artifact claims exact same-model and fresh-instance provenance that its types do not carry.

This was a static-only review of filed tip `725875aecdf9c37eda8712c90a6a6fab3b27017e` on `lane/s11`; I ran no test, build, install, provider call, or mutating git command.

# Packet and custody checks

- The worktree HEAD, branch, filed commit, and tree resolve to `725875aecdf9c37eda8712c90a6a6fab3b27017e`, `lane/s11`, and `ebac4279fb301b1637a29b2e23d8c16692e6b57c`. The worktree was clean when inspected.
- Removing line 2 from [the worker report](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s11-eval-harness.md:1) produced SHA-256 `f749a05d84765bb1819070f741d707c5d7888232603988286fad61680f8ad908`, matching the packet.
- A fresh static search over the filed [packages](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/packages), [apps](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/apps), [tests](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/tests), and [acceptance](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance) trees found no occurrence of `EVAL_BLIND_GRADER_POOL_INSUFFICIENT` (`rg` exit 1: no matches).
- I read, rather than reran, the archived RED at [base-r2-RED-degradation.log](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s11/base-r2-RED-degradation.log:1): it is stamped `2f42eba41de12850868afadad068e640eaa79818`, contains `EVAL_BLIND_GRADER_POOL_INSUFFICIENT`, and records `EXIT = 1`.
- I read all three archived cluster logs. Each is stamped to the filed tip, records `EXIT = 0`, and reports verbatim `Tests  29 passed (29)`: [run 1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s11/r2-gate-cluster-S11-C1-run1.log:47), [run 2](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s11/r2-gate-cluster-S11-C1-run2.log:47), and [run 3](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s11/r2-gate-cluster-S11-C1-run3.log:47).
- I freshly ran the read-only [stamp checker](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/stamp-check.sh:1) against the absolute `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s11/r2-` evidence prefix: `records compared: 23 · failures: 0`, exit 0.
- I freshly ran the read-only [mutant index](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutant-index.py:1) against [the expected manifest](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s11/input-r2-mut-EXPECTED.txt:1): `TALLY: transcripts=12  killed=11  survived=1  invalid=0` and `CLEAN: every transcript well-formed, every outcome matches the manifest`, exit 0. This validates the campaign accounting, not the worker's interpretation of what m10 proves.

# Findings

## B1 · F-S11-4 — the full harness still has no legitimate one-model path

Ticket: [F-S11-4](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-S11-4-candidate-configs-refusal.md:1). Blocking; fix in r3 before refiling.

Concrete input: one configured identity `solo`, with both sealed role refs equal to `solo`, and the required candidate count of three. [deriveCandidateConfigs](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:176) creates the baseline, skips the only `solo/solo` pair as same-role, and throws `EVAL_CANDIDATE_CONFIGS_INSUFFICIENT` at [lines 216–223](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:216). The run therefore never reaches `assignBlindGraders`.

The m10 test does not close that scenario. Its candidate is defined with two role identities at [lines 233–238](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/tests/unit/t15-eval-harness.test.ts:233), then its pool alone is reduced to one identity at [lines 309–337](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/tests/unit/t15-eval-harness.test.ts:309). That is a helper boundary, not a coherent one-model deployment or an end-to-end harness path. The separate test at [lines 415–420](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/tests/unit/t15-eval-harness.test.ts:415) affirmatively pins the contradictory refusal.

Declining to extend the policy was procedurally cautious but substantively wrong after [V-S11-1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md:2252) declared one-model operation legitimate and the policy general. In r3, derive the maximal meaningful candidate set available under the constraint, visibly mark any reduction/non-distinctness, adjust or qualify the projected matrix, and pin a coherent one-provider `runEvalHarness` path through the approval refusal with zero calls. Do not fabricate three identical arms merely to retain the numeral three.

The same ticket must cover the one-model disclosure shape. When synthesizer and evaluator refs are the same identity, the scalar `relationOf` check at [lines 311–314](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:311) classifies it only as `CANDIDATE_SYNTHESIZER`; `GRADER-IS-CANDIDATE-EVALUATOR` is silently omitted. Represent role relationships as a set/flags and emit both applicable marks.

## B2 · S11-R2-B2 — complement grading is arm-confounded; a mark does not make the means comparable

Ticket: `S11-R2-B2`. Blocking; route and fix before any V-approved eval run or scored T15b table.

The root cause is optimizing each cell for local author/grader separation without preserving the experiment's cross-arm measurement basis. At [lines 318–330](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:318), any independent identity excludes every candidate identity from `ordered`, and modulo seating then repeats the complement. On the sealed deployment, C1 and C2 are graded twice by Grok while C3 is graded twice by Codex, as the generated artifact records at [lines 29–36](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s11/r2-T15b-comparison-table.md:29).

The stated rationale says candidate graders would correlate grader and arm, but complement selection also makes grader identity a deterministic function of the arm. Repetition then gives that arm-specific model two correlated observations and twice the apparent grade count. The filing did see the varying panels and disclose them; it did not remove the confound.

This is not safe to hand V as a role comparison with only a mark. [renderComparisonTable](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:729) describes the score table as answering which config graded better and always renders a pooled numeric mean at [lines 752–764](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:752), while the non-commensurability warning appears only after both tables at [lines 785–790](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:785). A warning discloses invalid comparability; it does not restore it.

In r3, use a common or counterbalanced panel/paired estimator that makes grader effects separable from arm effects. If deployment constraints cannot support such an estimator, the scored artifact must suppress cross-arm ranking/pooled comparison and state that no role choice can be inferred; it must not present the means as comparable.

## B3 · S11-R2-B3 — same-model and fresh-instance provenance is asserted without being represented

Ticket: `S11-R2-B3`. Blocking; fix before any provider-approved run.

[ConfiguredProviderIdentity](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:252) carries only `providerRef` and `maker`. `sameModelAsCandidate` is therefore computed from provider-ref role equality at [line 347](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:347), not from model identity. The CLI actively drops model information when building this input at [lines 141–147](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness-cli.ts:141). Yet the table reports `same-model yes/no` at [lines 769–783](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:769), and the disclosure asserts that repeated seats are fresh instances at [lines 360–371](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:360).

Concrete wrong outcome: two provider refs backed by the same actual model are reported `sameModelAsCandidate: false`; only maker-family coincidence can be noticed. The repository's provider result already distinguishes `model` and `modelVersion` at [ProviderCallResult](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/packages/providers/src/index.ts:77), but the harness's `grade` result at [lines 493–500](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:493) returns only score and notes. No session/instance identifier or explicit stage prompt is recorded either.

`CANNOT-ASSESS`: whether the eventual adapters really create a fresh instance per seat with a stage-specific prompt. Those adapters are unwritten and no provider call is authorized. What settles it is an implemented adapter contract that creates a new session per call, carries an explicit grading task/prompt, returns observed provider/model/version plus a per-call instance/session reference, and persists/renders those facts. Until then the artifact must not state fresh-instance or exact same-model facts as known.

## N1 · S11-R2-N1 — only the umbrella mark is ordered against the approval gate by a test

Ticket: `S11-R2-N1`. Non-blocking in current source; fix in r3 before the next filing.

The source currently emits assignment marks and `GRADER-SET-VARIES-BY-CONFIG` at [lines 621–637](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:621), before the approval branch at [line 653](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:653). So the present placement is correct.

The ordering assertion at [lines 442–462](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/tests/unit/t15-eval-harness.test.ts:442), however, compares only the first `BLIND-GRADING-DEGRADED` line with the gate. It does not assert that `GRADER-REPEATS-IDENTITY` or the emitted `GRADER-SET-VARIES-BY-CONFIG` line precedes the gate; checking the returned summary is not an emission-order assertion. Pin the exact distinct mark set and require every emitted condition-mark index to be before the gate.

## N2 · S11-R2-N2 — the summary can mark a degraded comparison while declaring `anyDegraded: false`

Ticket: `S11-R2-N2`. Non-blocking for the current printed table; fix in r3 before any programmatic consumer uses the summary.

[summariseGradingProvenance](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:395) adds `GRADER-SET-VARIES-BY-CONFIG` when signatures differ, but computes `anyDegraded` solely from per-assignment flags at [lines 403–410](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:403). With four identities and three configs, every arm can have two distinct non-candidate graders while the grader sets still vary; the summary then contains the degradation mark and simultaneously returns `anyDegraded: false`. Include run-level degradation in the boolean and add the missing four-identity/three-config assertion.

## N3 · S11-R2-N3 — D56 failure behavior is proved, but the claimed historical order is not self-authenticating

Ticket: `S11-R2-N3`. Evidence-quality finding; fix when r3 captures its citation checks.

I reran [cite-check.py](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/cite-check.py:1) read-only against [the bad-case input](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s11/input-r2-cite-BADCASE.tsv:1). It found one absent anchor and one anchor matching 30 sites, and exited 1. Thus the checker can fail for both intended reasons.

`CANNOT-ASSESS`: the stronger historical claim that the bad run occurred before the good run. [The bad record](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s11/r2-cite-badcase-MUSTFAIL.log:1) and [the good record](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s11/r2-cite-check.log:1) have the same second-level modification time, and neither embeds an execution time, sequence, or `EXIT =` line. The bad input predates the good input, which supports but does not prove execution order. A single ordered driver transcript containing both commands, timestamps/sequence numbers, and both exits would settle it.

## N4 · S11-R2-N4 — the worker's skill declaration omits its debugging floor

Ticket: `S11-R2-N4`. Process finding; the worker must load and declare the missing skill before beginning r3 diagnosis.

The worker declares its loaded skills at [line 3](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s11-eval-harness.md:3) but omits `superpowers:systematic-debugging`. The worker floor requires it for any bug at [heartbeat-protocol](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md:43), and r2 diagnosed both an initially surviving one-identity mutant and incoherent fixtures. This cannot be repaired retroactively; r3 must make the compliance observable.

## N5 · F-S11-2 — the hand-copied spend ceiling remains a valid carried finding

Ticket: `F-S11-2`, already named in [the worker report](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s11-eval-harness.md:279). Non-blocking for r2; fix before the first V-approved run or any register-bound change, whichever comes first.

[EVAL_HARNESS_SPEND](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11/dialectical-engine/acceptance/eval-harness.ts:42) hard-codes the currently matching ceiling, while the CLI's runtime-policy read does not assert equality. The worker's drift concern is valid: the harness can later print and enforce a stale ceiling while claiming it matches the sealed deployment. Bind the value to the owning sealed bound or add a preflight equality refusal/mark with a regression assertion.

# Required questions answered

1. **Does every degradation disclose?** No. The current sealed-three repeat and varying-panel facts are visible, but a coherent one-model dual-role identity loses its evaluator relation, exact model identity is absent, and the run summary can call a varying-panel comparison non-degraded.
2. **Is the ranking sound?** It is locally defensible for maximizing non-candidate seats, and it honestly states that repeated grades are not independent. It is not sound for T15b's comparative purpose: complement selection correlates the grader with the arm, and repeating that grader amplifies the confound.
3. **Are the marks before the gate and asserted?** In the filed source, yes: all three distinct sealed-deployment mark kinds are emitted before the approval branch. In tests, only the umbrella mark's position is asserted; the repeat and varying-panel emissions are not individually ordered against the gate.
4. **Is the non-commensurable comparison safe with only a mark?** No. Disclosure is necessary but cannot turn differently scaled arm means into a valid role ranking. Use a common/counterbalanced measurement design or suppress the cross-arm inference.
5. **Does a remaining refusal contradict V-S11-1?** Yes: `EVAL_CANDIDATE_CONFIGS_INSUFFICIENT` prevents the coherent one-model harness from reaching degradation. The other reviewed refusals do not: an empty model pool has no possible worker; missing recorded debates are independently governed by V-S11-3; an absent synthesis surface has no implementation to grade; `EVAL_ROLE_REF_NOT_CONFIGURED` remains J24's default for an invalid sealed identity unless V closes V-ROLE-1; and the approval refusal is the mandatory spend gate. Generic invalid-input/preflight-integrity errors are not capacity degradations.

# CANNOT-ASSESS

- Actual fresh-session behavior and stage-specific grader prompting, for the reasons in B3. The implemented adapter plus recorded per-call identity/session provenance would settle it.
- The worker's historical statement that no provider call was made. Static repository and archived-test evidence show no authorized live path or live result, but cannot prove the absence of an unrecorded external action. Provider/ledger audit evidence for the filing window would settle it. No provider call was made by this reviewer.
- The historical D56 bad-before-good execution order, for the reasons in N3.

## PREDICTIONS

Another lens is most likely to accept m10's kill as proof of V's one-model scenario without noticing that the test changes only the grader pool while retaining a two-identity candidate. A second likely miss is to treat `GRADER-SET-VARIES-BY-CONFIG` as sufficient because it is honest; the first thing to check is whether the eventual numeric table still invites a winner across panels. I also expect a lens focused on provider refs to overlook that provider identity, maker family, exact model/version, and fresh session are four different provenance facts.
