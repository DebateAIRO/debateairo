# REV(S03) pass 1 — security-data-safety

seat: REV-PES-S03-p1-security-data-safety · ticket t_3169a5fe · head 98264a5ea · base origin/dev @ 776359c3 · lens security-data-safety · pass 1 of 3

SKILLS LOADED: /Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/using-superpowers/SKILL.md · /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-sd/dialectical-engine/.grok/skills/heartbeat-protocol/SKILL.md · /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md · /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-sd/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md · /Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/verification-before-completion/SKILL.md

The grok `heartbeat-protocol` file is the v3 loader (no §5). The eight-line handoff is the v4 router at `.claude/skills/heartbeat-protocol/SKILL.md` §5. `receiving-code-review` stays unloaded: no finding is contested.

## Charges

1. Comments on t_3169a5fe at claim time: one, the orchestrator's DISPATCHED comment. CLAIM posted. cwd HEAD `98264a5ea`, dirty 0.
2. Package and BUILD packets reviewed. Defects are N1 and N2.
3. Cluster commands re-run once each from `probes/REV-PES-S03-p1-security-data-safety/rerun-clusters.sh` in this worktree. Markers match `frames/*-gate.out`. Handoff three-run tables: UNVERIFIED (N1).

| command | this run | frame |
|---|---|---|
| v9 expect 24/0 + baseline expect 31/0 | v9 rc=0 passed=31 failed=0; baseline rc=0 passed=31 failed=0; CLUSTER_RED | `frames/C1-gate.out` identical |
| v9 expect 28/0 + baseline expect 31/0 | v9 rc=0 passed=31 failed=0; baseline rc=0 passed=31 failed=0; CLUSTER_RED | `frames/C2-gate.out` identical |
| v9 expect 31/0 + baseline expect 31/0 | v9 rc=0 passed=31 failed=0; baseline rc=0 passed=31 failed=0; CLUSTER_GREEN | `frames/C3-gate.out` identical |

C1 and C2 are RED at this head because the file has 31 cases and those commands still expect 24 and 28. That is the pair the package recorded. It is the same marker, so it is not a disagreement. Logs: `C1-rerun.log`, `C2-rerun.log`, `C3-rerun.log`. Worktree dirty 0 after the runs. The C3 pair is the acceptance pair in PLAN §4 (v9 31/31, baseline 31/31).

4. Secrets and paths. `diff.patch` added lines: no `Bearer`, no bounded `sk-` / `xai-` / `AIza`, no 40-character base64 run, no `0700`, no `/Users/` or `/home/`. The added lines do contain `/etc/debateai/runner/providers/acme.header` and `/etc/debateai/api/providers/acme.header` (`deploy/vps/README.md:854-855`). Those paths are the kit's worked-example `authorization_file` placeholders; the replaced base lines already carried the same two paths, and the new text adds the two price integers `3000000` and `15000000` plus the sentence "replace them per vendor" (`:856`). No header value is in either JSON. The credential-file contract, from `### The credential-file contract` through the line before `### Adding a vendor`, is byte-identical to `origin/dev` (1155 bytes, `credential-span-note.txt`). `git diff -U0 origin/dev...HEAD` hunks on the README are at old lines 19, 712, 749, 767, 779, 782, 845, 848 — none of them is that span (`README.md:788-804`). `git diff --stat origin/dev...HEAD -- apps packages` prints nothing. The same pathspec over `origin/dev~200...origin/dev` prints a stat, so the empty result is a real empty. `tests/architecture/` is absent from the product diff. The whole README's only `sk-` character run is inside `systemd-ask-password` at `:822` (pre-existing shell block, not in the diff). The test file's `Bearer …` fixtures and `/home/somebody/.debateai/codex.header` at `tests/unit/v9-provider-credential-files.test.ts:372` are pre-existing and outside the added hunks; they are fixture placeholders.
5. Refusal table. Heading remains `### What the hosted mode refuses, in code` (`deploy/vps/README.md:764`). Seventeen row codes, each present at a throw in `apps/` or `packages/`:

| code | throw |
|---|---|
| `DEPLOYMENT_MODE_UNRESOLVED` | `packages/register/src/runtime-environment.ts:95` `throw new DeploymentModeUnresolvedError()` |
| `DEPLOYMENT_MODE_INVALID` | `:99` `throw new DeploymentModeInvalidError()` |
| `PROVIDER_BASE_URL_TLS_REQUIRED` | `packages/providers/src/index.ts:613` and `:646` |
| `PROVIDER_TARGET_LOOPBACK_REFUSED` | `packages/providers/src/index.ts:652` |
| `PROVIDER_INLINE_CREDENTIAL_REFUSED` | `packages/providers/src/index.ts:655` |
| `PROVIDER_AUTHORIZATION_FILE_ABSENT` | `packages/providers/src/index.ts:784` |
| `PROVIDER_AUTHORIZATION_FILE_UNUSABLE` | `packages/providers/src/index.ts:786` |
| `COST_ENVELOPES_NOT_SEALED` | `packages/register/src/runtime-environment.ts:158` |
| `RUNNER_PRIMARY_PROVIDER_REF_DRIFT` | `apps/runner/src/provider-topology.ts:76` |
| `SUPPORT_MODEL_CREDENTIAL_ABSENT` | `apps/api/src/support/model.ts:248` |
| `SUPPORT_MODEL_PATH_NOT_RATIFIED` | `apps/api/src/support/model.ts:133` |
| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | `packages/providers/src/index.ts:195` |
| `PROVIDER_TARGET_PRICE_REQUIRED` | `packages/providers/src/index.ts:687` and `apps/runner/src/main.ts:117` |
| `PROVIDER_TARGET_PRICE_ZERO` | `packages/providers/src/index.ts:700` |
| `COST_ENVELOPE_POLICY_UNRESOLVED` | `packages/register/src/cost-envelope-policy.ts:164` |
| `COST_ENVELOPE_POLICY_INVALID` | `packages/register/src/cost-envelope-policy.ts:132` |
| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | `packages/register/src/runtime-environment.ts:202` |

Nested refusal names in the meaning cells also throw: `SECRET_CUSTODY_INVALID` at `packages/crypto/src/index.ts:1832`, `CUSTODY_GROUP_UNRESOLVED` at `:600`, `PROVIDER_CREDENTIAL_FILE_INVALID` at `:906`, `PROVIDER_CREDENTIAL_FILE_ABSENT` at `:899`. Re-ran the PLAN §1b anchors against this worktree: union size 12, and every code is inside the refusal span (`security-probe.txt`). The four V-8 codes each have count 0 in that span. The four V-9 codes each have count 0 in that span. The paid-probe paragraph is the single `max_tokens` hit, `deploy/vps/README.md:762`. It names `max_tokens` and `probe_freshness_ms`. The numbers match the tree: `max_tokens: 8` at `packages/providers/src/provider-probe.ts:82`, `probe_freshness_ms` validated as a positive integer at `packages/register/src/index.ts:457`, development seed `600_000` at `apps/runner/src/dev-deployment-register.ts:344`. The paragraph contains none of `recommend`, `suggest`, or `should`. The worked examples at `:854-855` carry prices and `authorization_file` paths and no token an operator could paste as a live secret.
6. Listeners. Start `2026-09-25T14:13:29+0300` and end `2026-09-25T14:23:54+0300`: `:4310` node/95068, `:55432` com.docke/19920, the other NO-TOUCH ports empty. Identical to `review-packages/S03-p1/listeners.txt`. No `pnpm install`. Worktree porcelain empty at handoff. No listener was started here.
7. This file. 8. No git write, no push, no board switch.

## Findings

No blocking finding.

**N1 — package names handoffs that are not in the package.** `review-packages/S03-p1/README.md:13` points this lens at `handoffs/*.md`. The directory is empty (`ls` shows only `.` and `..`). README.md:1 says the package is frames only and that the reading lives in no lens's inputs. Concrete failure: this pass cannot compare a handoff three-run table or an author's `SKILLS LOADED` line to the transcript. The suite markers were still checked against `frames/*-gate.out` (charge 3) and they match. WHEN: before pass 2 uses this package, either the handoff files are in `handoffs/` or the packet stops naming them.

**N2 — BUILD packets name a frozen SPEC and a PLAN range that is not §3.** `packets/BUILD-S03-C1.md:10` and `packets/BUILD-S03-C2.md:10` name `slices/S03/SPEC.md` as the acceptance oracle and `PLAN.md:671-711` as §3, with the C1 row at `:679` and the C2 row at `:680`. `SPEC.md:4-5` is the frozen v1 ("A change after that marker is `SPEC-v2.md`"). The record is `SPEC-v3.md` (`INSTRUCTIONS.md:31-33`); its §5 is lines 161-185. `PLAN.md:679` is a known-stale bullet row inside a step; §3 starts at `PLAN.md:946`. Concrete failure: a seat who reads only the cited range does not read the cluster table or SPEC-v3. The shipped README matches SPEC-v3 R3.4, R3.4b, and R3.6, so this pass's operator text is the record's text. WHEN: the next packet for this mission names `SPEC-v3.md` and re-stamps PLAN anchors after the line count moves.

**N3 — the widened pin does not lock the operator table.** `tests/unit/v9-provider-credential-files.test.ts:437` asserts each enumerated code is contained in all of §11 (`section`), and the comment on `:436` says so. Two mutants, each restored (sha256 `9eaf221e…a723b2` before and after, porcelain 0):

- Delete the row at `deploy/vps/README.md:780` (`PROVIDER_TARGET_PRICE_REQUIRED`). The code remains in the order sentence at `:786`. `pnpm exec vitest run tests/unit/v9-provider-credential-files.test.ts -t "names every start-up refusal"` rc=0, 1 passed / 30 skipped. The table no longer names that start-up refusal and the pin stays green.
- Insert a row `DAILY_COST_ENVELOPE_REACHED` (one of the four V-8 run-time spend codes) beside `:784`. The same command rc=0, 1 passed. The boot table now names a run-time spend stop and the pin stays green.

Control: delete the row at `:784` (`SUPPORT_ADMISSION_SCOPES_NOT_SEALED`, which appears nowhere else in the README). The same command rc=1, and the failure is `:437` (`expected '## 11…' to contain 'SUPPORT_ADMISSION_SCOPES_NOT_SEALED'`). The pin does bite when the code is gone from §11 entirely. Same shape as the first mutant, not separately mutated: `PROVIDER_TARGET_PRICE_ZERO` (`:781` and `:786`), `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` (`:779`, `:786`, `:850-851`), `COST_ENVELOPE_POLICY_UNRESOLVED` and `COST_ENVELOPE_POLICY_INVALID` (rows `:782-783` and also `:739-740`). WHEN: the assertion at `:437` requires a table row inside the refusal span for each enumerated code, and it fails if any of the four V-8 codes appears in that span. The shipped table at 98264a5ea already has the rows and has none of the four, which is why this is not blocking.

## Predictions

The correctness lens will either call C1 and C2 CLUSTER_RED a product failure or will match the frames the way this pass did; the first check is whether their re-run is compared to `frames/*-gate.out` or to the PLAN's base pair of 23. They should also hit N3, because reading the test name "names every start-up refusal" without deleting `README.md:780` leaves the gap invisible. They are likely to flag SPEC-v3's frozen line anchors (R3.1 still says the member table is `:841-846`; the built rows are `:850-851`) and step 5's `sed -n '14,40p'` window, which now runs through the topology heading because the stale list shrank — the two surviving `- ` bullets are still the KEK bullet and the `api.env.example` bullet, and neither removed phrase is in that window. They are likely to skip the credential-contract byte compare, which sits outside the new cases.

VERDICT PASS / CONFIDENCE high / STRONGEST COUNTER: the pin at `tests/unit/v9-provider-credential-files.test.ts:437` stays green if the `PROVIDER_TARGET_PRICE_REQUIRED` row is deleted or if `DAILY_COST_ENVELOPE_REACHED` is inserted, so the suite does not protect the table this pass verified by grep.

## UNVERIFIED

- BUILD handoff three-run tables, refutation matrices, and author `SKILLS LOADED` lines. `handoffs/` is empty (N1).
- The four RED-at-base integration suites. Not re-run. The product diff does not name their files. PLAN §4 records them as the intake pairs and says this plan writes no file they read.
- `pnpm typecheck` delta. Not re-run. The package log `frames/typecheck-gate.log` shows one diagnostic, `apps/ui/lib/v3/answerExport.ts(2,38) TS2835`, which is the intake baseline. This pass does not claim that delta.
- `probes/ARCH-PES-S03/enumeration.mjs` was not executed: it hardcodes the slice lane `pes-s03`. The eight anchors were re-run against this worktree instead (`security-probe.txt`, union size 12).
- UI, both modes: this slice is `ui: no`. No app-shell route renders the README. The shared surface mounted here is `tests/architecture/vps-deployment-baseline.test.ts`, 31/31 inside each cluster command.
- No process of this seat was left running, so there is no PID to kill.

## V-ROW

None.
