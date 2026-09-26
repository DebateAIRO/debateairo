# ARCH-REV-S01-p1 — blind review of the S01 plan (pass 1 of 3)

Seat ARCH-REV-PES-S01-p1 · node ARCH-REV(S01) · ticket t_0aced7b4 · lane `.worktrees/pes-s01/dialectical-engine` @ `776359c3`, dirty 0 before and after. The plan under review is `docs/missions/provider-env-selection/slices/S01/PLAN.md` (ARCH-PES-S01, freeze `407a1397..37446fa0`: `PLAN.md` and `DECISIONS.md` only). SPEC of record: `slices/S01/SPEC-v3.md`. This pass writes no product code.

VERDICT PASS / CONFIDENCE high / STRONGEST COUNTER: the rejection cases at `PLAN.md:324-329` (A3–A6), `:350` (G7), `:446` (I3), `:449` (I6) and `:450` (I7) name the code they expect and do not name the guards that pass before it, the class this fleet has blocked when an earlier guard stole the code. Re-running the shipped functions shows those earlier guards do not fire for these fixtures (below, N3), so the clusters can go green. A reader who does not re-run that chain would call REWORK.

## What was run

All commands in the lane, `export PATH="/opt/homebrew/bin:$PATH"`, created paths omitted. Logs under `.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S01-p1/`. Markers are the runner's, not the exit code.

| command | marker | agreement with ARCH-PES-S01 |
|---|---|---|
| `base-C1.sh` — `tests/architecture:719:6` · `v9-deployment-mode.test.ts:201:0` · `production-environment-floors.test.ts:24:0` · `dl7-f7-boot-custody.test.ts:14:0` · `v20-optional-primary-provider-keys.test.ts:11:0` | `CLUSTER_GREEN` | agrees with `probes/ARCH-PES-S01/base-all-clusters.out` |
| `base-C2.sh` — `tests/architecture:719:6` · `v9-configured-provider-set-deployment.test.ts:14:0` · `text-control-bytes.test.ts:3:0` | `CLUSTER_GREEN` | agrees |
| `base-C3.sh` — `tests/architecture:719:6` · `dev-deployment-register.test.ts:15:0` · `text-control-bytes.test.ts:3:0` | `CLUSTER_GREEN` | agrees (final command's `723:6` is after H1–H4 exist) |
| `base-C4.sh` — `tests/architecture:719:6` · `text-control-bytes.test.ts:3:0` | `CLUSTER_GREEN` | agrees |
| `missing-path-broken.sh` — the C1 suite path S01-01 creates | `BROKEN` (no summary line) | omission of created paths is required; including one at base is not RED |

V2's six names, from `base-C1.log` with the plan's `^ FAIL  tests/architecture` pipeline, are exactly the six strings at `PLAN.md:144-149`. The same six appear in `base-C2.log`, `base-C3.log` and `base-C4.log`.

`pnpm typecheck` (clean env, `base-typecheck.log`): rc=1, the per-file delta is exactly `apps/ui/lib/v3/answerExport.ts`. Matches V5 and `00-intake.md:41`.

`p1-shipped-chain.ts` re-run (`p1-shipped-chain.log`) matches the plan's EXACT block (`PLAN.md:59-65`): built-row canonical text, snapshot `579690d7a51248ea486632c347c32ee0dbd99814206f1a5c05d85c7d405931c9`, publication id `2a1ff6e9-7bfe-4bc8-b7d9-36e786ab80b4`, hosted id `f46205a2-12c8-4dad-a14a-abb2b836354e`, development id `e5e29eff-627c-4507-b9d5-e131a69c35de`. `resolveDeploymentMode(undefined, undefined)` returns `local`. `parseRegisterVersionText(undefined)` throws `REGISTER_VERSION_TEXT_INVALID`. Empty `maker` throws `CONFIGURED_PROVIDER_SET_INVALID`. A `base_url` ending `/v2` throws `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID`. A relative `authorization_file` throws `PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID`.

`p2-scratch-db.ts` re-run: OS port `62888` (above 4400, not NO-TOUCH); v4 seed 32 rows, snapshot `120bdfea…`; version `999` has 0 rows; first hosted publish receipt `registerVersion=5`, `rowCount=32`, snapshot `579690d7…`; the other 31 rows byte-equal; identical replay returns version `5`; a new id on base 4 after the head moved returns version `6`; republication appends the suffix once; `stop()` then `ECONNREFUSED`. `:55432` stayed PID `19920`.

`p8-acceptance-dry-run.ts` re-run, clean env (`NO_COLOR` and `FORCE_COLOR` unset): rc=0, stderr 0 bytes, stdout the 12 lines of K1 ending `PES-S01-ACCEPT: PASS`, receipt version `5` and snapshot `579690d7…`, port `62837` gone after, `Bearer` count 0, lane dirty 0. `:55432` stayed PID `19920`.

Clean-env `pnpm audit:text-bytes`: stderr is exactly `$ tsx tools/check-text-control-bytes.ts\n`; stdout is the script's own line. The author's p4 shape holds: a failing `pnpm typecheck` ends stdout with `[ELIFECYCLE] Command failed with exit code 1.` and puts the `$ tsc --noEmit` echo on stderr. V-13's default matches that measurement. A harness that sets both `NO_COLOR` and `FORCE_COLOR` prints a Node warning around the echo; an operator shell without those two variables does not. V10's "first line is the echo" is true for the clean env.

Lane `git status --porcelain` after every run: 0. No listener was started on `:3000 :3001 :4310 :8790 :8791 :8792 :8793 :8795 :8796 :55432`.

## Trace (own parser)

`probes/ARCH-REV-PES-S01-p1/scratch/trace-parser.py` over `SPEC-v3.md` and `PLAN.md`.

- Headings `S01-01` … `S01-25` exist (`PLAN.md:266` through `:530`). Every heading appears in the reverse trace at `PLAN.md:92-98`.
- R1.1–R1.13 each have at least one step id in the forward table (`PLAN.md:75-89`). R1.8 is `**R1.8 — …**` (`SPEC-v3.md:166`), so a regex that demands `**` immediately after the number misses it; the table row is there.
- Every `PROD` step (`S01-02`, `S01-03`, `S01-07` … `S01-14`, `S01-18`, `S01-19`, `S01-22`, `S01-23`, `S01-24`) contains `RED when omitted` before the next heading. No `Done when:` sentence cites a later step id.
- Case counts in the headings equal the command pairs: A1–G11 = 32, I1–I14 = 14, H1–H4 = 4, K1–K5 = 5.
- Banned words `improve|better|robust|handle|appropriate` occur only in the counter-example at `PLAN.md:26-28`.
- `ui: no` (`SPEC-v3.md:3`). No `## Screens` block is required, and none is missing.

§6's step-id cell does not contain an `S01-` id (N2). The cases it names, G9 and I9, sit in S01-14 and S01-16.

## Charges

1. Skills read as markdown, listed in the handoff. Ticket t_0aced7b4 had one comment at CLAIM (the orchestrator's DISPATCHED). CLAIM posted. Cursor at this verdict is the comments present before it.
2. ARCH packet reviewed first. One packet defect (N1). The author's `SKILLS LOADED` on t_96e1881a names `using-superpowers`, `heartbeat-protocol`, `heartbeat-architecture`, `brainstorming`, `writing-plans`, and `verification-before-completion`, which is the architecture floor. The transcript body was not opened (UNVERIFIED). Freeze `407a1397..37446fa0` is `DECISIONS.md` +58 and `PLAN.md` +604/−33, nothing else. Base `776359c3` matches the lane. ADR-0025 (`62a4c367`) and ADR-0026 (`5ef138b7`) exist as commits; this tree's decision directory ends at ADR-0024 plus the new ADR-0027. Allowed list covers the plan, DECISIONS, one ADR, probes, and the self-report.
3. The four base cluster commands were re-run from `.sh` files. All four `CLUSTER_GREEN`, agreeing with the recorded verdicts. A created path at base is `BROKEN`.
4. Both-ways trace above. One non-blocking cell (N2). One non-blocking oracle class (N3). No step whose done-criterion needs a later step or a later cluster. No unlabelled JSON example found in a criterion. The count `32` in G9 (`PLAN.md:352`) is paired with rowKey equality to the seed, not used as a bare membership oracle.
5. V-1: the mode switch is `resolveDeploymentMode` only (`PLAN.md:399-401`). V-2: no `PROVIDER_DISCOVERY_TARGETS_PATH`; targets are derived and printed. V-3: the planning seat's handoff records `claude-opus-5-5`. V-4: base `776359c3`. V-5: no real key; p8 `Bearer` count 0; I10's sentinel is the fake string `pes-s01-sentinel-7f3a`. V-6: the plan codes the publish door, not the already-shipped mode switch. V-7: no probe-freshness floor. V-8 and V-9: this slice does not edit README §11. V-10: role rows carried forward, no check (`PLAN.md:242-243`, G9, I9). V-11: S03's seal sentence is not this slice's. V-12 stands for S02; this plan does not edit S02. V-13: the default is applied (`DECISIONS.md:206-217`); exit 0 on every outcome is the rejected alternative (`DECISIONS.md:193`). The four RED-at-base pairs are pinned at V1 (`PLAN.md:136-140`) and `SPEC-v3.md:229-232`, and no step changes those files. Fixture listeners are OS-assigned ports asserted `> 4400` and outside the NO-TOUCH set (`PLAN.md:498`, K2); measured `62837` and `62888`.
6. This file.
7. No edit under review, no git write, no `pnpm install`, no board switch.

## Findings

No blocking finding.

**N1 · packet, the builder body is not in the reading floor.** `packets/ARCH-S01.md:10` names `packages/register/src/configured-provider-set.ts:177` and does not name `:178-196`. Line 194 is the unconditional suffix append (`sourceRef: \`${sealedSourceRef}${CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF}\``). A seat that read only the named line would not see it. This seat recorded the omission at `PLAN.md:191` and the plan strips one trailing suffix before that append (D2, G11, I11; p2 `suffixCount 1`). Concrete failure: the next architecture packet can ship the same signature-only range and a seat that obeys the floor will plan a double suffix. WHEN: the next packet for this surface includes `:178-196`. Whether: the class is "a function named by its signature line". Not a plan rework.

**N2 · §6's step-id cell has no step id.** `PLAN.md:90` traces §6 to `§5 boundary "not built"; G9/I9` and the plan then says gaps are 0 (`PLAN.md:98`). A parser that requires an `S01-` id in that column reports a gap. G9 is a case of S01-14 (`PLAN.md:352`) and I9 is a case of S01-16 (`PLAN.md:452`), and both carry the non-provider rows forward, which is V-10's default. Concrete failure: the zero-gap sentence is false for that parser, and a stranger checking only the step-id column cannot mark §6 traced. WHEN: name `S01-14` and `S01-16` in that cell before BUILD. The behaviour is already specified.

**N3 · rejection oracles that name the code and not the guards that pass first.** The plan's own chain is g1–g11 (`PLAN.md:251-262`). These cases name the refusing code and omit the guards that pass before it, while a sibling case states them:

| case | line | names | sibling that states the priors |
|---|---|---|---|
| A3, A4, A5, A6 | `PLAN.md:324-327` | `PES_PUBLISH_ROSTER_INVALID:` and the suffix | A2 at `:323` |
| G7 | `PLAN.md:350` | `CONFIGURED_PROVIDER_SET_INVALID` at `configured-provider-set.ts:79` | G6 at `:349` (`g1–g8 pass`) |
| I3 | `PLAN.md:446` | the roster code, before the database | G2 at `:345` |
| I6 | `PLAN.md:449` | `PROVIDER_VENDOR_NOT_VETTED:vendor:a` | G6 |
| I7 | `PLAN.md:450` | `PES_PUBLISH_SET_TARGETS_REJECTED:PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID` | G8 at `:351` (`g1–g9 pass`) |

Concrete failure if an earlier guard starts refusing the same fixture: the case still says only the later code, so a coder can "fix" the wrong function and watch the assertion fail for a reason the step does not name. It does not fail today. p1 throws `CONFIGURED_PROVIDER_SET_INVALID` for `maker: ""`, `PROVIDER_VENDOR_NOT_VETTED:vendor:a` for `named_in_privacy_notice: false`, and `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID` for a `/v2` base URL. R1.2's roster gate (`SPEC-v3.md:77-92`) checks the ten keys, adapter kind, vetting keys and a repeated ref; it does not refuse an empty maker, so g4 passes and g9's shape guard is the one G7 observes. WHEN: while writing those assertions, copy the prior-guard sentence the sibling already uses. Not a rework: the expected strings are the ones the shipped functions throw.

## PREDICTIONS

A security reader flags Review Focus 5 (`PLAN.md:585-587`): a `provider_ref` containing a newline makes `PES_PUBLISH_ROSTER_INVALID:` span two stderr lines, and I1–I7 require stderr to be exactly one line plus `\n`. The plan leaves it unpinned because R1.2 prints the ref raw. That is a disclosed limit, not a second code. The same reader flags V-12 against V-13 and expects this plan to exit 0 on FAIL; the plan rejects that (`DECISIONS.md:193`) and V-13's default is the one S01 builds. The first check that would have produced a false REWORK is H2's "every module path begins `apps/runner/src/` or `packages/`" (`PLAN.md:464`) against `node:crypto`: p6's walker (`probes/ARCH-PES-S01/p6-module-graph.py`) returns no node for `node:` and third-party specifiers, and H2 calls those leaves, so they are not module paths.

## UNVERIFIED

- The author's transcript `agent-a03aa13cd0b01b6b1.jsonl` was not opened, so the `SKILLS LOADED` line is checked against the role floor as written, not against the skill bodies in that transcript.
- The 36-suite baseline was not re-executed here. The four RED-at-base pairs are the intake's (`00-intake.md:41`, `baselines.tsv`). No step in this plan edits those four files. `pnpm typecheck`'s delta was re-run (above).
- `pnpm pes:accept-publish-set` does not exist until S01-24. The twelve-line run was the reference entry (`p8`), not the pnpm script. The pnpm echo and the failure trailer were re-measured on `audit:text-bytes` and `pnpm typecheck`.

## V-ROW

None.
