# ARCH-REV(S02) pass 2 of 3 — closures of Revisions 2 and 3

Seat ARCH-REV-PES-S02-p2 · ticket t_6a40b981 · lane `.worktrees/pes-s02/dialectical-engine` @ `776359c38`, dirty 0 at start and at the end of every probe. Plan under review: `docs/missions/provider-env-selection/slices/S02/PLAN.md` (1003 lines). Freeze pair `0e931c00a..0330ed71b` contains Revision 2 (`3acff611e`) and Revision 3 (`0330ed71b`). SPEC of record: `slices/S02/SPEC-v4.md`. `SPEC-v4.md` lines 8–230 are byte-identical to `SPEC-v3.md` lines 8–230 (0 differing lines).

## Verdict

VERDICT PASS / CONFIDENCE medium / STRONGEST COUNTER: V6's "line 1 is EXACT `$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts`" and step 8's "last line begins `[ELIFECYCLE]`" both fail when `FORCE_COLOR` and `NO_COLOR` are set, so a review seat in this harness cannot mark a correct failing run by the letters of those two sentences, and that should be a rework. The counter loses because the same command with those two variables unset prints the three plain lines SPEC-v4 step 8 describes, the exit code is 1 on FAIL in both environments, and the remedy is a reading-rule fold before REV(S02), not a different CLI.

## Findings

No blocking finding. B1, N1 and N2 of pass 1 are closed. Revision 3's exit mapping matches SPEC-v4 §5 steps 4 and 8. Two non-blocking folds and one V row.

### N1 — `PLAN.md:34` names `SPEC-v3.md` for a paragraph SPEC-v4 repeats

`PLAN.md:34` read-by cell is `` `SPEC-v3.md` header ``. The sentence says SPEC-v3 keeps the S01 dependency withdrawn. The dependency paragraph is byte-identical in `SPEC-v4.md:9-11` and `SPEC-v3.md:9-11`:

`**This slice depends on no other slice.** R2.7 and R2.8 run the shipped provider chain IN PROCESS from literal values: nothing here reads a register, opens a database or publishes a row. V can run this slice's acceptance with no other slice merged.`

It is only a pointer. A seat who opens the frozen file gets the same sentence the SPEC of record has. The author's E4 detector does not see this line: its history allow-list treats any line containing `withdrew` as not live (`exit-rule-detectors.py` E4, re-run here, `ALL-PASS` with line 34 masked). WHEN: before BUILD reads §1, the orchestrator folds the read-by cell to `SPEC-v4.md` header. The history clause can stay if it also names SPEC-v4.

### N2 — three Revision 3 citations of `V-DECISIONS-PACKET.md:24` land on V-10

`PLAN.md:5`, `PLAN.md:39` and `PLAN.md:842` cite `V-DECISIONS-PACKET.md:24` for V-12/V-13 "Exit 1 on FAIL". At this pass line 24 is the V-10 ruling "Yes, refuse at publish". V-12/V-13 is line 26. Each PLAN sentence also names V-12/V-13 and points at `SPEC-v4.md:253-259`, which is the exit rule the CLI implements. `SPEC-v4.md:3` and `SPEC-v4.md:268` cite `:24` too; those are frozen, and the packet's pointer note already says to resolve them by row id. WHEN: the same fold as N1, cite the row id in the three PLAN lines. Class: a line number whose target moved. Members found: the three PLAN cites. The SPEC cites are named and not edited.

### N3 — the Revision 3 log-reading rule does not cover the color bytes of the environment it names

`PLAN.md:191` requires line 1 of the step-4 log to be EXACT `$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts`. `PLAN.md:193-194` allows every other line to begin `(node:` or `(Use `. `PLAN.md:866-870` repeats that for S02-S19's done-when. `PLAN.md:869` names the condition: both `NO_COLOR` and `FORCE_COLOR` set, as in the pass-1 `dns-callback.log`.

Measured 2026-09-25 in `probes/ARCH-REV-PES-S02-p2/scratch/color-off/`, pnpm 11.20.0, stdout redirected to a file (the SPEC step-4 shape):

- With `FORCE_COLOR` and `NO_COLOR` unset, `plain.log` is three lines: `$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts`, `PES-S02-ACCEPT: FAIL admitted`, `[ELIFECYCLE] Command failed with exit code 1.` Process exit 1. SPEC-v4 step 8's rule (last line begins `[ELIFECYCLE]`, verdict is the line before it) holds.
- With `FORCE_COLOR=1` and `NO_COLOR=1`, `forced.log` line 1 is the node warning, the banner is `\x1b[2m$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts\x1b[22m`, and the trailer is ANSI-colored so it does not begin `[ELIFECYCLE]`. Process exit 1. The verdict text is still the line above the trailer.

The same colored trailer is in `scratch/cli-block-run/planned-FAIL.log` (10 lines; line 9 `PES-S02-ACCEPT: FAIL admitted`; line 10 the colored ELIFECYCLE). The copied `cli-block-run.sh` printed `BROKEN` for FAIL, UNVERIFIED and THROW because its zsh test `[[ $last == \[ELIFECYCLE\]* ]]` does not match the colored trailer. The exit half of that line was `'exit=1' (want exit=1)` for all three. The author's `probes/ARCH-FIX-PES-S02-p3/pnpm-exit-rule.out` HOLDS lines match the plain environment, not this one. The exit mapping is not the defect. WHEN: before REV(S02) runs V6, compare the banner and the trailer after stripping ANSI, or treat a colored `[ELIFECYCLE]` trailer as the line step 8 names. The CLI block stays as written.

## Closures

### B1 — closed

`PLAN.md:777` calls `resolveAll(deps.lookup, FAKE_VENDOR_HOST)`. `PLAN.md:796-804` is the callback wrapper. `PLAN.md:666-669` defaults `lookup` to `import { lookup } from "node:dns"`. `callbackLookup` is the same block at `PLAN.md:530-541` and `PLAN.md:689-700`. Copied `fix-detectors.py` on the current PLAN: `ALL-PASS` (B1a–B1g, N1a, N1b, N2). On `PLAN-p1-as-reviewed.md`: `FAILED:B1a,B1b,B1c,B1d,B1e,B1f,B1g,N1a,N1b,N2`.

Re-run of the shape probe (`b1-lookup-shapes.out`, tsc rc=0): G1 `127.0.0.1,::1`, G2 `127.0.0.1`, G3 `ENOTFOUND`, G5–G7 `status=200`, G8–G9 `authorized=true`. M1 still throws `ERR_INVALID_ARG_TYPE`. M2 `req-timeout`. M3 never calls back. Own `hang-resolveAll.mjs`: callback `lookup` through `resolveAll` settles `127.0.0.1/4,::1/6`; a call with no callback throws `ERR_INVALID_ARG_TYPE`. Port 4460 was free after teardown. Lane dirty 0.

### N1 (pass 1) — closed

`PLAN.md:65` says dev-api-environment **10 / 2** at the RED event, and `PLAN.md:382-388` says case (b) passes there because `publishExactFile` already throws `DEV_API_ENVIRONMENT_DRIFT`. That throw is `apps/runner/src/dev-api-environment.ts:286`, inside the condition at `:284-285`. The final pair in the C1 command stays `11:1`.

### N2 (pass 1) — closed

`PLAN.md:399` labels the mock body EXACT and cites `tests/integration/dev-api-process.test.ts:213`. The JSON scan (a `{"` with no EXACT or CONTAINS on that line or the three above) printed no line.

### Revision 3 — exit 1 on FAIL, applied

`PLAN.md:846-856` is the CLI block (opening fence `:846`, `process.exitCode = 1` at `:854`, closing fence `:856`), matching the CORRECTION on t_50d2d8d3. The mapping line `process.exitCode = result.outcome === "PASS" ? 0 : 1;` occurs twice (block and the gate at `:862`). `process.exitCode = 0` occurs 0 times. Copied `exit-rule-detectors.py`: current PLAN `ALL-PASS` (E1–E10); Revision 2 fixture `FAILED:E1,E2,E3,E4,E5,E6,E7,E8,E9,E10`; anchor mutant `R2.8 :152` → `:153` `FAILED:E10`. SHA-256 prefix of the extracted block `4a2b73be7c2d6eb1`, tsc rc=0. Plain-env FAIL log quoted under N3. Mutant `process.exitCode = 0` prints `exit=0` on FAIL (`pnpm-exit-rule.out` and `cli-block-run.out`).

§2 anchors in `PLAN.md:43` resolve: each `R2.*` line starts with that heading, step 2 is `SPEC-v4.md:223`, step 4 is `:230`, step 8 is `:253`, §4 is `:201`, §5 is `:217`.

The five R2.7 target JSON strings in the SPEC table equal the five in the PLAN table. The R2.8 admission target equals `PLAN.md:783`.

## What was checked and held

S02-C1 re-run from `probes/ARCH-REV-PES-S02-p2/C1-base.sh` at `776359c38`. Marker `CLUSTER_RED`. Counts, verbatim:

```
tests/unit/v9-deployment-mode.test.ts rc=0 passed=201 failed=0 (expect 203/0)
tests/integration/dev-api-environment.test.ts rc=1 passed=9 failed=1 (expect 11/1)
tests/integration/dev-api-process.test.ts rc=1 passed=5 failed=5 (expect 6/5)
tests/unit/dev-runner-process.test.ts rc=0 passed=8 failed=0 (expect 8/0)
tests/unit/dev-api-environment-cli.test.ts rc=0 passed=7 failed=0 (expect 7/0)
tests/architecture/dev-custody-root.test.ts rc=0 passed=16 failed=0 (expect 16/0)
tests/architecture/dev-real-provider-only.test.ts rc=0 passed=3 failed=0 (expect 3/0)
tests/architecture/register-support-publication.test.ts rc=1 passed=14 failed=1 (expect 14/1)
CLUSTER_RED
```

That is the plan's recorded base verdict (`PLAN.md:65`). No disagreement. Dirty after the run: 0.

S02-C2 and S02-C3 commands, run as written: `BROKEN` (no summary line) because both files are absent. Absence check: all six created paths `ABSENT-AT-BASE`. The plan creates them (`PLAN.md:66-67`), so BROKEN at base is not a finding.

Own trace: 12 requirement headings `R2.1`–`R2.11` including `R2.2b` and `R2.5`, each a row of §2; §5 is a row of §2; §10 lists `S02-S01`–`S02-S20`. Zero gaps. A first regex that required `**R2.n**` with the closing marks immediately after the id missed the five headings whose bold runs to the end of the title (`**R2.5 — …**`). The heading regex `^\*\*(R2\.\d+b?)` is the one that counts.

V-1 through V-14: the plan still declares the mode in the assembled file (V-1), adds no second key path (V-2), pins `probeFreshnessMs` `600000` (V-7, `PLAN.md:783`), and uses the literal `Bearer pes-s02-fake-vendor-token` (V-5). No `sk-` or `AKIA` token in the plan. V-12/V-13 is the exit mapping above. V-8, V-9, V-10, V-11 and V-14 name other slices; this plan does not take them up. The four RED-at-base suites stay pinned: dev-api-environment and dev-api-process move only by the new cases (final pairs `11:1` and `6:5` in the C1 command); `dev-provider-panel` `3:1` and `t16-algorithm-register` `20:1` are in §4 V2 (`PLAN.md:133`, `:136`). `baselines.tsv` rows are 9/1/10, 5/5/10, 3/1/4, 20/1/21.

Listeners at review: `:4310` (node 95068) and `:55432` (docker 19920). `:3000 :3001 :8790 :8791 :8792 :8793 :8795 :8796` had no listener. The fixture range is 4460–4499 (`PLAN.md:505`). `ui: no` on `SPEC-v4.md:3`; there is no `## Screens` block.

`resolveAll` (`PLAN.md:796-804`) contains no `setTimeout`, `AbortSignal` or `timeout`. Ruled under V-ROW, not as a plan defect: SPEC-v4 has no duration and no `dns timeout` verdict. R2.6 (`SPEC-v4.md:123-124`) says a step that cannot resolve the name is UNVERIFIED with the resolver's own error. A timer would invent both the duration and the token. The stock callback lookup does call back (measured above). The promises function, which does not, is the thing the two `node:dns` greps at `PLAN.md:834-836` forbid.

## Named, not re-reviewed

Pass-1 N3 stands as text: `packets/ARCH-S02.md:23` still tells the architecture seat its transcript is the newest `agent-*.jsonl` under the orchestrator's `subagents/` directory. It was not in the ARCH-FIX assignment (B1, N1, N2). The ARCH packet's base `776359c3` matches this lane. No new packet defect in `ARCH-S02.md`.

## PREDICTIONS

A tests lens re-runs C1, sees `CLUSTER_RED` with these eight counts, and accepts the exit gates because the grep strings are in the file. A security lens clears the fake token and does not open a failing pnpm log. The check that separates those from this pass is the last line of a FAIL log when `FORCE_COLOR=1`: it begins with an escape, and the verdict is the line above it.

## UNVERIFIED

The post-change tree was not executed. This seat writes no product code. Author transcripts were not opened, so the ARCH and ARCH-FIX `SKILLS LOADED` lines were checked against the names in the READY comments only. `receiving-code-review` was not loaded: the READY comments on t_8bddd97c and t_50d2d8d3 mark the assigned items ADDRESSED or APPLIED, and none CONTESTED.

## V-ROW

V-ROW: NEW · S02 · t_080a7819 · Recommended default: do not add a deadline to `resolveAll`. The callback `lookup` of `node:dns` calls back (measured `127.0.0.1,::1`), and the two greps at `PLAN.md:834-836` forbid `dns.promises.lookup`, which does not call back. A deadline is a duration and an UNVERIFIED token that SPEC-v4 does not name (`SPEC-v4.md:123-124` asks for the resolver's own error). Smallest yes/no for V: "Should resolveAll give up when the lookup never calls back and print UNVERIFIED, or do the callback lookup and the two node:dns greps stand?" · VERDICT: the greps stand / CONFIDENCE: medium / STRONGEST COUNTER: a callback-shaped lookup that never calls back leaves `pnpm pes:accept-hosted` pending before teardown (`hang-resolveAll.mjs`: still pending at 400 ms), while `https.request` reaches its own timeout (M2 `req-timeout`). A yes is a SPEC amendment, then one plan sentence.
