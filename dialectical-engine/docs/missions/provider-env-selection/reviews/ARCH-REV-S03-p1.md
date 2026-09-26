# ARCH-REV-S03 pass 1 — blind review of the plan

Seat ARCH-REV-PES-S03-p1 · node ARCH-REV(S03) · ticket t_3889dc21 · lane `.worktrees/pes-s03/dialectical-engine` @ 776359c3, dirty 0 at exit. Plan under review is the freeze `43e000be..b57409e2` (PLAN.md filled, DECISIONS.md appended; the PROGRESS.md line is the orchestrator's and is not under review).

## Findings

### B1 — a done-when count does not equal the lines it names, at that step's own boundary

Class: count oracles. Three members. A stranger who runs the written pattern on a correct edit cannot mark the step done. Fixing one member and leaving the others is a failed fix.

1. `docs/missions/provider-env-selection/slices/S03/PLAN.md:174-175` (C1-2). The criterion is `/usr/bin/grep -c '^| '` over the span from `### What the hosted mode refuses, in code` to `### The credential-file contract`, and it demands **19** (header + separator + 11 existing rows + 6 new). It names the separator `:771` as a member. Measured in the lane today (`probes/ARCH-REV-PES-S03-p1/measure.log`): that span has **12** lines matching `^| ` (L770 and L772–L782). L771 is `|---|---|` (`space=false`). The separator does not match `^| `. Six new `| ` rows make **18**. The criterion demands 19, so a correct table fails it. (Lines matching `^|` with no space requirement are 13 today and would be 19 after the six rows. The criterion as written includes the space.)

2. `PLAN.md:285-288` (C2-5). The criterion demands **8** lines beginning `| ` in the span from `| Member | Value |` to the next blank line, and the arithmetic counts the separator. Measured: that span has **5** lines beginning `| ` (header + `provider_ref` + `base_url` + `model` + `authorization_file`). The separator is `|---|---|` and does not begin with `| `. Two added rows make **7**. The criterion demands 8.

3. `PLAN.md:304-308` (C2-6). Done-when says `/usr/bin/grep -c 'input_price_micros_per_million' deploy/vps/README.md` returns **3**, and names three members (the C2-5 table row, the `runner.env` line, the `api.env` line). The same bullet says the pre-existing hit at `deploy/vps/README.md:20` (known-stale bullet B1) stays until C2-9, and that 4 before C2-9 and 3 after is the expected sequence. Measured today: the only hit is line 20. After a correct C2-5 and a correct C2-6, and before C2-9, the count is **4**. The done-when number 3 is true only after C2-9, a later step. At C2-6's own boundary the criterion condemns a correct edit, and marking the step done requires a judgement call about which sentence in the bullet wins.

### N1 — C1-3 names no case that goes RED when the sentence is omitted

`PLAN.md:195-200`. C1-3's done-when is a string check (three tokens between the table's last `| ` line and `### The credential-file contract`). A stranger can run that check. The step also says, in its own words, that omitting it fails no case, and C1-4's cluster command does not read the sentence. WHEN: the BUILD packet for S03-C1 adds one assertion, in the C1-1 case or beside it, that fails when those three tokens are absent, and C1-4 stays the green gate. Whether the sentence ships is already decided; this sets when the pin exists.

### N2 — two literal oracles reject a faithful spelling

1. `PLAN.md:259` and `PLAN.md:327` require the cost paragraph to contain the character sequence `600000`. The cited seed line `apps/runner/src/dev-deployment-register.ts:344` is `probe_freshness_ms: 600_000`. Measured: that line contains `600_000` and does not contain `600000` (`measure.log` §4). A paragraph that quotes the tree fails C2-3. C2-8 tells the seat to write `600000`, so a seat who follows C2-8 passes.
2. `PLAN.md:260` bans the substrings `recommend`, `suggest`, and `should be`. R3.6's own sentence is "The paragraph states no recommended value" (`SPEC.md:89`). A paragraph that uses that sentence contains `recommend` and fails C2-3.

WHEN: before C2-3 is written, accept both `600000` and `600_000`, and ban those three as whole words.

### N3 — "no leftover" is true of the eight anchors, and the rejected-scan count is wrong

`PLAN.md:78-82` says the anchor union's absent set is character-for-character R3.3's six, with no leftover. Re-implemented the eight anchors independently (`measure.log` §3): union 12, absent set equals the six, `ABSENT === R3.3 SIX true`. That part agrees with `probes/ARCH-PES-S03/enumeration.log`.

`DECISIONS.md:14` says a `throw new TypeError` scan of `packages/providers/src/index.ts` yields 15 codes of which 8 are absent from §11. The same scan re-run (`measure.log` §6): **16** distinct codes, **9** absent from §11. After R3.3's three price codes from that file land in §11, six TypeError codes in the file are still absent: `CONFIGURED_PROVIDER_DUPLICATE`, `PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID`, `PROVIDER_DISCOVERY_TARGETS_INVALID`, `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID`, `PROVIDER_DISCOVERY_TARGET_DUPLICATE`, `PROVIDER_LENGTH_RETRY_FAILURE_COUNT_INVALID`. The anchor list is a deliberate narrowing (DECISIONS row, and V-8 for the four run-time spend codes). The "no leftover" sentence overclaims, and the 15/8 count is not the measurement. WHEN: the orchestrator corrects the count when it folds this pass. Whether the four parse codes belong in the table is the V-ROW below, not a silent widening of `expect(union.size).toBe(12)`.

### N4 — the angle-bracket catch is attributed to guards that do not implement it

`PLAN.md:166-169` and `:179`. C1-2 says a row written with `<ref>` is caught by `tests/unit/v9-provider-credential-files.test.ts:418` and by the `^| ` count, and that `:378` forbids an angle bracket in §11. `:418` forbids the one string `PROVIDER_AUTHORIZATION_FILE_UNUSABLE:<ref>:KEK_UNRESOLVED`. `:378-384` checks `/<[a-z-]+>/` only inside `` ```sh `` blocks. A table cell `` `PROVIDER_TARGET_PRICE_REQUIRED:<ref>` `` matches neither, and it still counts as one `^| ` line. R3.9 (`SPEC.md:104-105`) binds shell blocks, which the plan's JSON lines stay outside of. WHEN: C1-2's case asserts the refusal span does not match `/<[a-z-]+>/`, or the plan stops citing `:418` and `:378` as that catch.

### N5 — packet defect: N-findings on S03 that do not exist

`packets/ARCH-S03.md:10` says the REQ-REV verdict's N-findings on S03 bind the plan. `reviews/REQ-REV-p1.md` N1–N12 name the intake, the REQ packet, S01, and S02. None names an S03 requirement. The dispatch comment on t_21a1edcf says REQ-REV p1 filed no finding on S03. The seat was not bound by a finding that is not there. WHEN: the orchestrator stops copying that clause onto later S03 packets. No plan edit.

## Verification (re-run, not read)

Lane `776359c3`, `export PATH="/opt/homebrew/bin:$PATH"`, scripts under `probes/ARCH-REV-PES-S03-p1/`. Markers agree with the ARCH seat. No BROKEN.

| command | this pass | ARCH seat recorded |
|---|---|---|
| `run-suites.sh` v9 `:23:0` + baseline `:31:0` | `passed=23 failed=0` · `passed=31 failed=0` · `CLUSTER_GREEN` (`c1-base.log`) | `CLUSTER_GREEN` |
| S03-C1 command, v9 `:24:0` + baseline `:31:0` | `passed=23 failed=0 (expect 24/0)` · `passed=31 failed=0` · `CLUSTER_RED` (`c1-after-pair.log`) | `CLUSTER_RED` |
| S03-C2 command, v9 `:28:0` + baseline `:31:0` | `passed=23 failed=0 (expect 28/0)` · `passed=31 failed=0` · `CLUSTER_RED` (`c2-after-pair.log`) | `CLUSTER_RED` |
| `pnpm typecheck` | rc=1, count **1**, `apps/ui/lib/v3/answerExport.ts(2,38) TS2835` (`typecheck-base.log`) | the same one diagnostic |

`run-suites.sh` exits 1 when the marker is `CLUSTER_RED`. The marker is the verdict.

Trace, parser of record `trace.log` (the first parse in `measure.log` §7 kept one physical line of a wrapped reverse trace and is not the result): 9 requirements R3.1–R3.9, 14 steps C1-1–C1-4 and C2-1–C2-10, every requirement has a step, every step has a requirement, zero gaps both ways. Every step has a Done-when.

`wc -l deploy/vps/README.md` = 873. Last `^## ` heading is line 721, `## 11. Providers and vendors`. `git diff --stat origin/dev...HEAD -- apps packages` is empty (rc=0). The same pathspec over `origin/dev~200...origin/dev` prints `258 files changed`. `-- dialectical-engine/apps` over that range prints nothing.

Anchor re-implementation agrees with the ARCH enumeration for the eight anchors (union 12, absent set = R3.3's six).

Rows V-1..V-8, default applied: the plan adds no runtime hostname check (V-1), no second credential path (V-2), stays on `776359c3` (V-4), puts no real key in the example (V-5; the object is `vendor:acme` and two file paths), codes the README gap (V-6), states no probe floor and no recommended number (V-7), and keeps the four `PROVIDER_COST_ENVELOPE_REFUSAL_CODES` out of the table and out of the pin (V-8). V-3 is a staffing row and does not touch this plan. The four RED-at-base pairs in `PLAN.md:421-425` match `logs/baselines.tsv` (`dev-api-environment` 9/10, `dev-api-process` 5/10, `dev-provider-panel` 3/4, `t16-algorithm-register` 20/21). A grep of those four files finds no `README.md` and no `v9-provider-credential-files`. No fixture endpoint is planned; `SPEC.md:124-125` forbids a process, a port, and the network, so no listener is placed above 4400 because no listener is placed at all. `ui: no` (`SPEC.md:2`); there is no `## Screens` block and none is owed. Next ADR number: highest in the lane is ADR-0024, so ADR-0025 as recorded. `deploy/vps/README.md:703` still says KEK rotation is not implemented, which is the measurement behind leaving B4.

Author READY on t_21a1edcf names the architecture floor (using-superpowers, heartbeat-protocol, heartbeat-architecture, brainstorming, writing-plans). The two heartbeat paths under `~/.claude/skills/` exist. Fabrication of the skill body is UNVERIFIED (the subagent jsonl was not opened).

## PREDICTIONS

A product-truth lens that starts from R3.5's class sentence will call the eight-anchor pin a narrowed class and will want `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID` in the table; the V-ROW is that question, and `index.ts:670-677` is why the support-target sentence at `README.md:741-742` stays at four members (the price rule is not applied to the support target). A lens that passes the plan will treat "19" as obvious arithmetic and will not run `grep -c '^| '`. The check to run first on the rework diff is: the three written counts, on a correct edit, at that step's boundary — 18, 7, and 4 — with the separator still `|---|---|`.

## UNVERIFIED

- The four RED-at-base suites were not re-executed. Pairs are the intake table; the grep above is the evidence they do not name the two files this slice writes.
- The ARCH seat's skill-tool transcript body was not opened.
- No listener was started, so "port above 4400 is free" was not measured with `lsof`. The plan starts none.
- `DECISIONS.md:14`'s "59 uppercase tokens" figure was not re-counted. The TypeError half of that sentence was.

VERDICT REWORK / CONFIDENCE high / STRONGEST COUNTER: dropping the space so the pattern is `^|` makes today's separator count match 19 and 8 (pipe-any is 13 and 6 today), and the C2-6 bullet already says 4 is expected before C2-9, so a careful seat can mark all three done on a correct edit without a rework. The written patterns include the space, and C2-6's Done-when line still says 3. A seat who runs the criterion as written fails a correct edit. That is the rework.

## V-ROW

V-ROW: NEW · S03 · the parse-time discovery codes that are not in R3.3's six · Recommended default: leave `PROVIDER_DISCOVERY_TARGETS_INVALID`, `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID`, `PROVIDER_DISCOVERY_TARGET_DUPLICATE`, and `PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID` out of §11's refusal table and out of the 12-code pin. R3.3 names the six. `deploy/vps/README.md:782` already says a malformed API target refuses with the matching `PROVIDER_DISCOVERY_*` code. `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT` and `PROVIDER_DISCOVERY_TARGET_SET_MISMATCH` are already in §11 prose (`:851`, `:869`). Smallest yes/no for V: "Leave those four parse-time codes out of §11's refusal table in this slice?" · VERDICT exclude / CONFIDENCE medium / STRONGEST COUNTER: R3.5's class is every operator-facing refusal code the provider surface can emit, and a `base_url` that does not end in `/v1` throws `PROVIDER_DISCOVERY_TARGET_BASE_URL_INVALID` at `packages/providers/src/index.ts:226-228`, which the table does not name; the TLS row is a different check.
