# ARCH-REV-S01-p2 — blind review of PLAN Revision 2 against SPEC-v5 (pass 2 of 3)

Seat ARCH-REV-PES-S01-p2 · node ARCH-REV(S01) · ticket t_ae707fe5 · lane `.worktrees/pes-s01/dialectical-engine` @ `5b12b2e15`, dirty 0 before and after. The plan under review is `docs/missions/provider-env-selection/slices/S01/PLAN.md` Revision 2, read against `SPEC-v5.md` through `DECISIONS.md:321-326` (the REQ-FIX p6 pointer fold). This pass writes no product code.

VERDICT PASS / CONFIDENCE high / STRONGEST COUNTER: a parser that demands an `S01-` id inside the §6 cell reports a gap (`PLAN.md:117` says "the R1.14 and §5 rows above"), and I15 proves "nothing written" with `count(*)` (`PLAN.md:525`). Both are real. Neither stops a stranger building the behaviour V ruled: the seven-case reference run prints `PES-S01-ACCEPT: PASS`, and the role check throws before a version is inserted.

## What was run

All commands in the lane, `export PATH="/opt/homebrew/bin:$PATH"`, created paths omitted except where a script says otherwise. Logs under `.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S01-p2/`. Markers are the runner's. Agreement is with ARCH-FIX-PES-S01-p2's recorded column (`PLAN.md:139-142`, `probes/ARCH-FIX-PES-S01-p2/base-all-clusters.out`), re-run, not trusted.

| command | marker | agreement |
|---|---|---|
| `base-C1.sh` — operator-command suite `3/3` · `tests/architecture:719:6` · `v9-deployment-mode` `201/201` · `production-environment-floors` `24/24` · `dl7-f7-boot-custody` `14/14` · `v20-optional-primary-provider-keys` `11/11` | `CLUSTER_GREEN` | agrees |
| `base-C2.sh` — `tests/architecture:719:6` · `v9-configured-provider-set-deployment` `14/14` · `text-control-bytes` `3/3` (the `37:0` file S01-06 creates is omitted) | `CLUSTER_GREEN` | agrees |
| `base-C3.sh` — `tests/architecture:719:6` · `dev-deployment-register` `15/15` · `text-control-bytes` `3/3` (the `16:0` and `4:0` files omitted) | `CLUSTER_GREEN` | agrees |
| `base-C4.sh` — `tests/architecture:719:6` · `text-control-bytes` `3/3` (the `9:0` file omitted) | `CLUSTER_GREEN` | agrees |
| `literal-missing-C2.sh` — `tests/unit/pes-s01-hosted-provider-set.test.ts:37:0` alone | `BROKEN` (no summary line) | the plan creates this file (S01-06); BROKEN at base is not a defect |

V2's six names, from `base-C1.log` with the plan's `^ FAIL  tests/architecture` pipeline, are the six strings at `PLAN.md:175-180`. md5 of the sorted list `baf7d658d63b0317e46ce2928564f630` (the plan's `baf7d658…`).

`d4-role-seed-remedy.ts` re-run (`d4-stdout.txt`, rc 0): 17 required keys; hosted publish on version 4 → receipt version `5`, `rowCount` 32, snapshot `579690d7…`; role seed evaluator `vendor:z` → version `6`, `rowCount` 49; hosted publish on 6 throws `PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef` and `register_version` count stays 3 → 3; control evaluator `vendor:a` publishes version `8`, `rowCount` 49, role rows byte-equal. Same lines as the author's `d4-role-seed-remedy.log`.

`d1` reference entry, clean env (`NO_COLOR` and `FORCE_COLOR` unset, `d1-clean-stdout.txt`): rc 0, stderr 0 bytes, 14 lines, last line `PES-S01-ACCEPT: PASS`, line 11 `PES-S01 ROLE-SEED version=6`, line 12 `PES-S01 CASE role-provider-dropped PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef`. The same command under this harness's `NO_COLOR`+`FORCE_COLOR` pair puts a Node warning on stderr (492 bytes, `d1-stderr.txt`) and the same 14 stdout lines; port `58299` (above 4400) had no listener after, `Bearer` 0, `:55432` stayed PID `19920`. That warning is the harness, the same one pass 1 measured.

F10, two mutants:

- `d3-exitcode-plain.ts` sets `process.exitCode = 1` with no database: rc 1 (`d3-plain-rc.txt`).
- `d3-exitcode-db.ts` starts and stops the embedded database, then sets `process.exitCode = 1`: stdout `d3b stopped; set exitCode=1`, rc 0 (`d3-db-rc.txt`).
- Acceptance twin, `node --import tsx` (not `pnpm`), `TMPDIR=/nonexistent/pes-s01-rev-p2`, `TSX_DISABLE_CACHE=1`. The copy that ends `process.exitCode = exitCode` prints one line `PES-S01-ACCEPT: UNVERIFIED ENOENT: … mkdtemp '/nonexistent/pes-s01-rev-p2/debateai-s00-postgres-i2cG5a'` and exits 0 (`f10-exitcode-stdout.txt`). The copy that keeps `process.exit(exitCode)` prints the same shape of line and exits 1 (`f10-exit-stdout.txt`). stderr 0 bytes on both.

`async-exit-hook` `index.js:90` registers `beforeExit` with code `0`; `:108-116` calls `exit(true, 0)`; `:24` is `process.exit(code)`. `embedded-postgres` `dist/index.js:16` imports it and `:397` registers the hook. The plan's citation (`PLAN.md:73`) matches.

Lane `git status --porcelain` after the runs: 0. Listeners left as found: `:4310` node `95068`, `:55432` docker `19920`. No listener was started on `:3000 :3001 :8790 :8793 :8795 :8796`.

## Trace (own parser)

`probes/ARCH-REV-PES-S01-p2/scratch/trace-parser.py` over `SPEC-v5.md` and `PLAN.md`. Output `trace-parser.out`.

- Headings `S01-01` … `S01-26` exist (`PLAN.md:316` through `:626`), 26 headings. Every heading is in the reverse trace at `PLAN.md:119-125`. Every reverse-trace id is a heading. No PROD step lacks `RED when omitted`. No `Done when:` sentence cites a later step id.
- R1.1–R1.14 each have at least one `S01-` id. Case labels: A1–A9, B1–B3, C1–C2, D1–D2, E1–E3, F1–F2, G1–G16 = 37; I1–I16 = 16; H1–H4 = 4; K1–K9 = 9. Those are the command pairs.
- Citations against SPEC-v5 starts: R1.1–R1.12 match with no shift (`R1.12` is `SPEC-v5.md:193` in both). The p6 fold's six shifts all match: `PLAN.md:113` `:228`→`:243` (R1.13), `:114` `:233`→`:248` (R1.14), `:115` `:249`→`:264` (§4), `:116` `:266`→`:281` (§5), `:117` `:338`→`:353` (§6). `PLAN.md:80` and `:589` cite `:275`; SPEC-v5's roster element E is `:290`. The fold names those two. No folded line changes a behaviour: SPEC-v5 changes R1.12's seed from two rows to seventeen, and Revision 2 already builds that seed (`PLAN.md:89`, `PLAN.md:582`, `PLAN.md:590-592`). The pinned file `probes/ARCH-FIX-PES-S01-p2/proposed/pes-s01-publish-set-acceptance.ts:88-92` calls `buildAlgorithmRegisterRows` with the input SPEC-v5 `:228-230` names. sha256 prefixes in the plan match the files: `3f5e382e…`, `0a31bc00…`, `24cbb2c7…`, `c4f64236…`.
- The author's `trace_check.py` (still opens `SPEC-v4.md`) prints `TRACE: PASS`. Its four mutants each print `TRACE: FAIL`. It does not read § rows, so it does not see the §6 cell below. Pointed at v4 it is alive. It is not a check of the v5 line shifts; the fold is that check, and the shifts hold.
- One forward gap: §6 (`PLAN.md:117`). See N1.
- Banned words `improve|better|robust|handle|appropriate` occur only in the counter-example at `PLAN.md:40-42`.
- `ui: no` (`SPEC-v5.md:3`). No `## Screens` block is required.

Pass-1 `trace-parser.py` replayed onto this plan (`replay-p1-trace-parser.out`) reports a gap on every requirement. It keys the whole first cell, and the cell is now `R1.1 (`SPEC-v4.md:61`)`. That is the old parser, not a hole in the plan. It also reports no later-step citation and no missing `RED when omitted`.

Guard order of step (6): `proposed/hosted-provider-set.ts:241-252` calls `assertHostedRoleProvidersKept` and then `publishGeneral`. S01-14 (`PLAN.md:481-486`) writes the same order. G16 (`PLAN.md:411`) expects the targets code and the vetting code, not the role code, when those earlier checks fail. d4 shows the role code is the one thrown on the seventeen-row seed, with the version count unchanged.

## Charges

1. Skills read as markdown, listed in the handoff. Ticket t_ae707fe5 had one comment at CLAIM (the orchestrator's DISPATCHED). CLAIM posted. Cursor at this verdict is 2.
2. ARCH packet reviewed. Pass-1 N1 is still true and is named below, not re-opened. This pass's packet: the freeze sentence over-claims PROGRESS and under-claims SPEC-v5 (N5). The author's `SKILLS LOADED` on t_bba02e7f names the architecture floor (`brainstorming`, `writing-plans`) plus `receiving-code-review`. The six paths were not opened in that transcript (UNVERIFIED). `~/.claude/skills/heartbeat-protocol/SKILL.md` and `heartbeat-architecture/SKILL.md` exist.
3. The four base cluster commands were re-run from `.sh` files. All four `CLUSTER_GREEN`, agreeing with the recorded verdicts. The created C2 path at base is `BROKEN`.
4. Both-ways trace above. N1 (§6 cell), N3 (I15 and two unit siblings omit the prior-guard sentence), N4 (raw counts). No unlabelled JSON example in a criterion: the new JSON values are marked EXACT (`PLAN.md:89`, `:407`, `:582`). No done-sentence cites a later step id. S01-26's cases cannot go green until S01-14 wires the call (N6); both steps are in C2.
5. V-1 through V-9 and V-11, V-14, V-16 are not this slice's edit. V-10 is step (6) before publication (d4). V-12/V-13: the entry ends `process.exit` (`proposed/pes-accept-publish-set.ts:96`); the exitCode mutant exits 0 on the same UNVERIFIED line. V-15: the seventeen-row seed is what d1 and d4 run, and it is what SPEC-v5 `:217-237` requires. The four RED-at-base pairs in `baselines.tsv` are `dev-api-environment` 9/1, `dev-api-process` 5/5, `dev-provider-panel` 3/1, `t16-algorithm-register` 20/1, which are the 9/10, 5/10, 3/4, 20/21 at `PLAN.md:60` and `00-intake.md:41`. No step edits those files. No real key: clean d1 `Bearer` count 0. Fixture port measured `58299`, above 4400, not a NO-TOUCH port.
6. This file.
7. No edit under review, no git write, no `pnpm install`, no board switch.
8. Closures walked: V-10 (S01-26, G12–G16, I15, I16, K7), V-12/V-13 (S01-22, S01-23, K6, K8, K9), F10 (the exit mutant). V-15 is the ruling on the contested seed, applied by the fold, not by another ARCH-FIX edit. Pass-1 N1, N2, N3 were folded, not assigned to ARCH-FIX. N2's cell was rewritten (N1 here). N3's old members are named, not re-reviewed; the revision added I15 to the class (N3 here).
9. Measured above: step (6) before publication; fourteen-line PASS with the seventeen-row seed; exitCode mutant rc 0, `process.exit` mutant rc 1.
10. The p6 fold does not hide a behaviour change. Every shifted pointer matches SPEC-v5. The "CONTESTED" / "V-ROW default" lines plan the seventeen-row seed V-15 ruled. V12(g) (`PLAN.md:222-224`) is moot, as the fold says.

## Findings

No blocking finding.

**N1 · §6's step-id cell still has no step id.** `PLAN.md:117` traces §6 to "the R1.14 and §5 rows above" and `PLAN.md:126` says gaps are 0. Those two rows do contain step ids (`PLAN.md:114`, `:116`). A parser that requires an `S01-` id in the §6 cell reports a gap (`trace-parser.out`). The author's checker does not look at § rows, so it prints `TRACE: PASS`. Concrete failure: a stranger checking only that cell cannot mark §6 traced, and two checkers disagree. §6 builds nothing (`SPEC-v5.md:355` "None open"). WHEN: name the step ids in that cell before a BUILD packet quotes "gaps 0". Whether: the behaviour is already on the R1.14 and §5 rows. This is pass-1 N2 after the cell was rewritten; the old remedy "name S01-14 and S01-16" is not what the new sentence says.

**N2 · the pass-1 fold cites line numbers Revision 2 moved.** `DECISIONS.md:221` says the §6 cell is `PLAN.md:90`. Line 90 is now "These move only if the fixture moves". The §6 cell is `PLAN.md:117`. `DECISIONS.md:222` says A3–A6 are `PLAN.md:324-327`, G7 is `:350`, I3 is `:446`, I6 is `:449`, I7 is `:450`. Those lines are now S01-01 (`PLAN.md:324-325`), S01-04's `cmp` sentence (`:350`), and not the refusal cases. A3–A6 are `:375-378`, G7 is `:401`, I3 is `:513`, I6 is `:516`, I7 is `:517`. Concrete failure: a BUILD packet that edits the cited lines edits the built C1 reader spec. The case names in the same sentences still find the bullets. WHEN: rewrite those two DECISIONS bullets to the current lines before the C2 packet. The p6 fold (`DECISIONS.md:321-326`) is a different map and its pointers match.

**N3 · new rejection cases that name the code and not the guards that pass first.** G13 (`PLAN.md:408`) says "guards before: g1–g10 pass". These three, added or left bare by Revision 2, do not:

| case | line | names |
|---|---|---|
| G14 | `PLAN.md:409` | `PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef` for a base with only the evaluator row |
| G15 | `PLAN.md:410` | the same code for a non-string or missing `providerRef` |
| I15 | `PLAN.md:525` | stderr EXACT that code, and `count(*)` unchanged |

Concrete failure if an earlier guard starts refusing roster `[E]` on that base: the assertion still says only the role code, so a coder can change the wrong function. It does not fail today. d4 throws `PES_PUBLISH_ROLE_PROVIDER_DROPPED:evaluatorRoleRef` and writes no version. WHEN: copy G13's prior-guard sentence onto these three while writing the assertions. Pass-1 N3's older members (A3–A6, G7, I3, I6, I7) are named below, not re-reviewed.

**N4 · a raw count stands in for "which rows".** Members, all added by Revision 2:

| case | line | the count | what it does not name |
|---|---|---|---|
| G12 | `PLAN.md:407` | `rows` of length 34 | the other 32 entries (G9 at `:403` names its 31 by `rowKey`) |
| G14 | `PLAN.md:409` | `rows` of length 33 | the other 32 |
| I15 | `PLAN.md:525` | `SELECT count(*)` on `register_version` equal before and after | the set of version ids; a delete plus an insert keeps the count |
| I16 | `PLAN.md:526` | `rowCount` 49 | the other 47 rows; the two role rows are compared byte for byte |

Concrete failure: a publish that drops one seed row and inserts a dummy keeps length 34, and G12 still passes if the two role entries match. The p6 fold already says the 49-row figure is a measurement, not an R1.12 pin (`DECISIONS.md:326`). WHEN: when those assertions are written, compare the other rows the way G9 does, and compare the set of `register_version` values in I15. The correct implementation passes today (d4: 3 → 3 versions, role rows byte-equal, `rowCount` 49).

**N5 · packet, the freeze sentence describes a different diff.** `packets/ARCH-REV-S01-p2.md:8` says `git diff --stat aea7d9630..d7d882fb4 -- docs/missions/provider-env-selection/slices/S01` is the PLAN revision, its DECISIONS lines, and the orchestrator's pass-1 folds in DECISIONS and PROGRESS. The measured stat is `DECISIONS.md` +75, `PLAN.md` 330 lines changed, `SPEC-v5.md` +365. PROGRESS.md is not in the range. The range is two commits: `c516f2a6f` (Revision 2) and `d7d882fb4` (SPEC-v5 and the pointer fold). Concrete failure: a seat that treats that diff as "the plan, plus old folds" also has the frozen SPEC in the diff, and looks for a PROGRESS edit that is not there. Charge 9 of the same packet names SPEC-v5 correctly, which is why this is not a rework. WHEN: the next freeze sentence lists SPEC-v5 and does not mention PROGRESS unless the diff contains it.

**N6 · S01-26 cannot be marked done until S01-14.** `PLAN.md:466` says done when G12–G15 pass. Those cases call `publishHostedProviderSet` (`PLAN.md:407-410`), which S01-14 defines at `PLAN.md:474`, after S01-26 in the file. Omitting only the call leaves G13–G15 failing, so the step's own done line is not green at S01-26's boundary. Both steps are in C2; S01-15 is the cluster exit. Concrete failure: a stranger marking steps in file order has no green signal for S01-26 until the later step exists. WHEN: have G13–G15 call `assertHostedRoleProvidersKept` for the refusal, and keep one publish-level case (G16 already exists) for the order. The cluster can still go green.

## Named, not re-reviewed

- Pass-1 N1. `packets/ARCH-S01.md:10` still stops `configured-provider-set.ts` at `:177` and does not name `:178-196`. The fold at `DECISIONS.md:221` already routes the range to the C2 packet.
- Pass-1 N3's older members, now at `PLAN.md:375-378` (A3–A6), `:401` (G7, which names g9 as the guard that fires and not g1–g8 as the guards that pass), `:513` (I3), `:516` (I6), `:517` (I7). The sentences were not the subject of V-10. d4 and the clean d1 did not re-execute those fixtures. The shipped-function result pass 1 recorded is not re-opened.
- C1's reader, ADR-0027, and S01-01…S01-05. Revision 2 says C1 is unchanged. `index.ts:791` is `readOperatorCommandEnvironment`. `runtime-environment.ts:246` is that function.

## PREDICTIONS

A security reader flags I15's `count(*)` (N4) and Review Focus 5 (`PLAN.md:686-688`): a `provider_ref` containing a newline makes the roster refusal span two stderr lines. The plan leaves that unpinned because R1.2 prints the ref raw. The same reader re-opens pass-1 N3's older members from the stale line numbers in `DECISIONS.md:222` and edits S01-01 by mistake (N2). A product-truth reader has no screen (`ui: no`) and spends the pass on the fourteen acceptance lines; the first false REWORK is calling the harness `NO_COLOR`/`FORCE_COLOR` warning a disagreement with "stderr 0 bytes". Clean env stderr is 0 bytes.

## UNVERIFIED

- The author's transcript `agent-a03aa13cd0b01b6b1.jsonl` was not opened. The `SKILLS LOADED` line is checked against the role floor as written, and the two `~/.claude/skills/` paths exist. The skill bodies in that transcript were not read.
- The 36-suite baseline was not re-executed. The four RED pairs were read from `baselines.tsv` and `00-intake.md:41`. No step in this plan edits those four files.
- `pnpm pes:accept-publish-set` does not exist until S01-24. The fourteen-line run is the reference entry, not the pnpm script.
- S02's acceptance entry, which ARCH-FIX named as the other member of the exitCode class, is outside this packet's inputs. Not read.
- Pass-1 probes other than `trace-parser.py` were not replayed. None of them demonstrate V-10 or V-12; those probes predate both. There is no S01 `closure.sh`. The packet's example is `probes/ARCH-REV-PES-S03-p2/closure.sh`, which `rm -rf`s its own `scratch/states`. It was not copied: it is another slice's probe.

## V-ROW

None.
