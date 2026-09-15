# TREL Codex peer-review self-report

## r1

### Case finding: failure-path precedence escaped the worker's proof

The cause was eager JavaScript argument evaluation at all three start call sites. The
patch computes `resolveXBinary()` before `resolveTestGuardedCommand` can select or reject a
`testOnlyCommand`. A blank override therefore raises the new binary-resolution code first,
despite D10 requiring the existing typed-loud paths to remain unchanged. The worker's
non-blank precedence tests and M4 mutant proved only that a valid override does not become
the selected command; they did not cover a resolver that throws before selection.

Price: one rework round, three mirrored call-site corrections, and regression evidence for
both `NODE_ENV=test` selection and non-test `TEST_ONLY_*_COMMAND_FORBIDDEN` precedence. I
nearly accepted the report's “seam still outranks the override” claim because the green logs
and M4 result looked direct; reading the evaluation order rather than the assertion name
caught the gap.

### Case finding: readiness preceded the required suite evidence

The worker set `READY FOR PEER REVIEW` while its mandatory `pnpm test` row remained
`pending`. During this review the report then grew from 326 to 431 lines and replaced that
row with two measured-but-aborted full-suite attempts, an aborted-run log, three 94-test
blast-radius runs, and a final cluster run. The current evidence is materially better but
still has no completed full-suite exit or passed/total. The root cause is fleet saturation:
the worker measured five lanes running vitest/PostgreSQL concurrently and load average
19.35 on 12 cores. Price: at least one additional verification pass on an unsaturated
machine; the worker spent about 13 minutes on the base attempt and about 25 minutes on the
patched attempt without reaching a trustworthy denominator.

Upgrade: gate the READY marker mechanically on existence of every declared suite log, an
exit marker, and a parsed passed/total or named-failure set. This turns “one prompt” closure
from prose discipline into a check the seat cannot accidentally bypass.

The report mutation after READY was itself a second cause: handoff was advertised before
the evidence artifact was stable, forcing a complete evidence reconciliation and making a
stale verdict possible. Publish the report body and logs first, then atomically set READY
and freeze that round's artifact (or include a content hash in the board handoff).

### Packet and tooling costs

- The worker packet names `agent-reports/...` and `logs/trel/**` relative to a working
  directory where those paths do not resolve. The worker first wrote fourteen logs in the
  worktree and reports a 25-minute liveness ping before relocating them. Absolute artifact
  roots in the packet template would remove that whole failure class.
- The reviewer packet says `goal-prompt.md lines` without supplying a range and retains a
  raw `orchestrator instantiates per lane: replace ...` template line. My first targeted
  search therefore expanded to 623 output lines / 33,738 tokens and was truncated. The
  dead end was not needed to decide D10; a concrete `28-40` Global DoD range plus the D10
  range would have made the check bounded.
- I did not run package tests: the packet explicitly forbids it. The effective reviewer
  probe was a source-level call-graph and evaluation-order trace, cross-checked against the
  worker's tee'd RED/GREEN logs. That constraint was clear and prevented provider-spend
  risk.

### One-prompt-machine upgrades

1. Render packet templates through a validator that rejects placeholder prose, relative
   deliverable/log paths, missing cited line ranges, and READY handoffs with pending suite
   rows.
2. Require every precedence claim to name both the ordinary value arm and the throwing arm;
   mutation of only the selected value cannot prove exception ordering.
3. Keep log reconciliation machine-readable: command, commit, exit, passed/total, and log
   path should be one schema-checked row rather than duplicated prose.

## r2

### Case finding: the named guard was fixed, the sibling guard was not

The r2 change correctly made the default command lazy behind
`resolveTestGuardedCommand`, and its six regression arms pin the two
`testOnlyCommand` outcomes. The remaining cause is incomplete guard enumeration:
`startModelShim` has a second pre-existing typed-loud seam,
`testOnlySessionsRoot`, whose `TEST_ONLY_CODEX_SESSIONS_ROOT_FORBIDDEN` check still occurs
after the lazy default is forced whenever `testOnlyCommand` is absent.

Concrete counterexample: `NODE_ENV=production`, blank
`ACCEPTANCE_CODEX_BINARY`, `testOnlySessionsRoot` supplied, and no
`testOnlyCommand`. Baseline reaches the sessions-root guard; r2 forces the thunk first and
throws `CODEX_CLI_BINARY_UNRESOLVED`. This remains inside r1 B1's cause and D10's
“typed-loud failure paths unchanged” bound.

Price: one final lawful rework round for a small ordering correction and one no-provider
regression arm. I nearly approved because the packet's two requested arms, the M6 mutant,
and all three 58/58 cluster logs agree. The dead end was treating the packet's named
`testOnlyCommand` seam as exhaustive. A single `rg` for every `TEST_ONLY_*` code exposed
the Codex-only sibling.

### Evidence and process outcome

- B2 is genuinely closed by D13: the authoritative full suite is now assigned to the
  serial judge-stage semaphore; worker cluster/zone runs are supporting evidence.
- N1/N2 are ticketed and cured in F12. N3 did not recur: the report's body hash matched at
  both reads and its size remained stable during review.
- No test, build, provider process, or git mutation was run in r2; the packet required a
  static review. All dynamic claims were reconciled to the worker's tee'd logs.

### One-prompt-machine upgrade

Before generating rework acceptance arms, derive an inventory from the source:
`rg 'TEST_ONLY_|testOnly'` over the touched start path, and require a disposition for every
guard. Packet templates should attach that inventory to precedence-sensitive rework. This
would have converted two review rounds into one without broadening product scope.

## r3

### Case outcome: mechanics converged; evidence transcription did not

The r3 implementation closes the remaining typed-loud path. The sessions-root guard is
moved, not duplicated; the four input combinations preserve baseline precedence; exactly
four `TEST_ONLY_*` codes exist; only Codex declares `testOnlySessionsRoot`; the prescribed
arm reproduces r2 and the companion arm uniquely kills M8. Both arms terminate before a
CLI call.

The remaining cause is evidence assembled by hand after correct runs. The stable report
quotes r3 GREEN durations of 10.56s / 9.25s / 9.10s, while its named logs record 9.41s /
9.43s / 9.62s. It also says the log directory contains 34 files although it contains 42
(the prior 34 plus the eight disclosed r3 logs). The logs predate the report, so this is
not another moving-snapshot race; the hash sealed incorrect transcription.

Price: product code needs no further rework, but the finding law and final-round cap now
require a V decision row for a report-only correction. I nearly approved after the guard,
M8, scope, hash, and 60/60 counts all checked. Reconciling values in the named logs rather
than treating a matching content hash as evidence of semantic accuracy caught the residue.

### Packet friction and one-prompt upgrade

The packet's final-round rule is clear: even non-blocking residue cannot open round 4. V
must either authorize a report-only correction with a regenerated hash or accept the
corrected values on the decision record. This coordination cost is avoidable.

Generate suite rows and log inventories from one machine-readable manifest after the last
run, then hash both manifest and report body. A pre-marker validator should compare every
named log's exit/count/duration and the directory count to the rendered prose. Hashing alone
detects later mutation; extraction plus validation prevents stable false evidence.
