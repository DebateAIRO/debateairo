# REV(S03) pass 1 — lens correctness-tests

Seat REV-PES-S03-p1-correctness-tests · ticket t_69b33cb0 · head `98264a5ea` · base `origin/dev` @ `776359c3` · worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-ct/dialectical-engine` (detached, porcelain 0 at handoff).

VERDICT REWORK / CONFIDENCE high / STRONGEST COUNTER: R3.5's own sentence says the pin asserts each code appears in §11, the guard sentence at `deploy/vps/README.md:786` still names the three price codes after their rows are deleted, and those rows are present at this head, so a green suite is a missing row-shape assertion rather than a runbook that is wrong today.

## Findings

### B1 — three R3.3 refusal-table rows can be deleted and both suites stay green

Class: an enumerated code whose refusal-table row is not its only mention in §11. The widened pin asserts substring presence in the §11 slice, not a table row.

`tests/unit/v9-provider-credential-files.test.ts:437` — `for (const code of union) expect(section, code).toContain(code)` with `section` cut at `## 11. Providers and vendors` (`:425`).

Concrete inputs → wrong outcome, each mutant restored (`git status --porcelain` empty after every restore; logs under `.hermes/reports/provider-env-selection/probes/REV-PES-S03-p1-correctness-tests/`):

| row deleted | code still in §11 at | v9 | baseline |
|---|---|---|---|
| `deploy/vps/README.md:781` `PROVIDER_TARGET_PRICE_ZERO` | `:786` the guard sentence | 31 passed / 0 failed | 31 passed / 0 failed |
| `:780` `PROVIDER_TARGET_PRICE_REQUIRED` | `:786` | 31/0 | 31/0 |
| `:779` `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | `:786`, and the member-table cells `:850` and `:851` | 31/0 | 31/0 |

R3.3 (`SPEC-v3.md:65-70`) requires a row in §11's refusal table for each of those three codes. Acceptance step 3 says each of the six appears on a line inside that table. After the row deletion the only remaining hits for `PROVIDER_TARGET_PRICE_ZERO` and `PROVIDER_TARGET_PRICE_REQUIRED` are the sentence below the table, which is not a row. `tests/architecture/vps-deployment-baseline.test.ts` does not catch it either (31/31).

The case is not dead. Deleting the `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` row at `:784` (its only §11 mention) fails `:437`: `expected '## 11…' to contain 'SUPPORT_ADMISSION_SCOPES_NOT_SEALED'`, 1 failed | 30 passed (`mutant-row-unique.log`). Deleting the `COST_ENVELOPE_POLICY_UNRESOLVED` row fails the sibling at `:743` (`rowAt` is -1, so it is not below the `COST_ENVELOPES_NOT_SEALED` row), 1 failed | 30 passed (`sweep-policy-unresolved-v9.log`). The widened pin itself stays green on that deletion too, because the code remains in the support note (`:739`) and in the `COST_ENVELOPES_NOT_SEALED` cell (`:775`).

Members of the class, measured: the three price rows above. Not members: `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` (only mention; the pin goes red) and `COST_ENVELOPE_POLICY_UNRESOLVED` (the R3.4b row-order expect at `:743` goes red). `COST_ENVELOPE_POLICY_INVALID` was not deleted; it is the same `rowAt` loop as its pair.

The price rows use a colon inside the first cell (`| \`PROVIDER_TARGET_PRICE_REQUIRED:\``). `:741`'s prefix is `"| \`" + code + "\` |"`, which does not match that colon form, so extending the C3 loop as written would not see these three rows.

### N1 — `handoffs/` was empty at dispatch and was filled during this pass

`review-packages/S03-p1/README.md:13` says the BUILD handoffs live in `handoffs/*.md`. At the start of this pass the directory existed and contained 0 files. The orchestrator's comment on t_69b33cb0 at 2026-09-25 14:28:26 (`PACKAGE CORRECTED`) then placed `BUILD-PES-S03-C1.md`, `C2.md`, and `C3.md` there. The records were checked after that comment (N4). The empty directory at dispatch is a package defect; the correction arrived before the verdict.

### N2 — both BUILD packets cite PLAN §3 at lines that are now C2 step text

`packets/BUILD-S03-C1.md:11` and `packets/BUILD-S03-C2.md:11` say PLAN §3 is `PLAN.md:671-711` (rows `:679` and `:680`). At the PLAN this review read, `## 3. Cluster table` is `PLAN.md:946`. Line 671 is inside C2's done-when text. The cluster commands are also spelled in full in each packet's verification section, and the committed tests match those commands, so the stale anchors did not send the suites off the pairs. Same class, two members.

### N3 — the REV packet names two of the three BUILD packets that produced the diff

`commits.txt` line 1 is `98264a5ea` `S03-C3`. Charge 2 names `BUILD-S03-C1.md` and `BUILD-S03-C2.md` only. C3's tests are in `diff.patch` and were probed here. C3's dispatch packet was not in this seat's inputs. C3's READY comment was in the corrected `handoffs/` set and its at-commit lines were checked (N4).

### N4 — C1 and C2 PROGRESS records name README lines the head does not have those rows on

Source spans in both handoffs match this tree (the enumeration's E1–E7 lines). The README destinations do not, because later clusters edited the same file.

`handoffs/BUILD-PES-S03-C1.md:141-146` places the six rows at README `783-788` and the guard sentence at `:790`. At `98264a5ea` the rows are `:779-784`, the sentence is `:786`, and `:788` is `### The credential-file contract`. Line `:783`, which C1 names as `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`, is the `COST_ENVELOPE_POLICY_INVALID` row.

`handoffs/BUILD-PES-S03-C2.md:126-131` places the same six rows at `:773-778`. Those lines are not the rows at this head.

`handoffs/BUILD-PES-S03-C3.md:174-176` (the at-commit column) matches: §10 bullet `:699-701` names only the two live codes, the support note's build-integrity sentence is `:741`, the refusal row is `:775`.

C2's other coordinates that this pass re-read do match the head: `package.json:27` is `keys:rotate-kek`, `README.md:246` is `### Changing a master key`, `README.md:690` is still the §10 "KEK rotation is not implemented" sentence, `deploy/vps/env/api.env.example:35` is `SUPPORT_DATABASE_URL` and `:57` is `SUPPORT_KEK_PATH`, `apps/api/src/main.ts:217` reads `admissionPolicy` and `:230` calls `assertHostedSupportAdmissionSealed`, `session-policy.ts:134-136` are the three optional support scopes. The three-run tables (C1 24/0 ×3, C2 28/28 ×3, C3 31/31 ×3, each CLUSTER_GREEN) are the cluster's own boundary, not the head. They do not disagree with `frames/*-gate.out`, which are the head re-runs.

## Charges

1. Skills read as markdown, listed in the handoff. CLAIM posted on t_69b33cb0 after the one DISPATCHED comment. HEAD `98264a5ea`, dirty 0 at claim and at handoff.

2. Package reviewed. `diff-stat.txt` and `git diff --stat origin/dev...HEAD -- . ':!.codex/skills'` agree: `deploy/vps/README.md` and `tests/unit/v9-provider-credential-files.test.ts`, 2 files, +192/−19. `commits.txt` is the three cluster commits. `listeners.txt` matches the README's NO-TOUCH snapshot (`:4310` node/95068, `:55432` docker/19920, the others empty). Frames match the re-runs in charge 3. Defects: N1, N2, N3, N4. Freeze `git diff --stat 86ba5fd3a..5481b388b` with cwd-relative pathspecs printed 279 files (not empty).

3. Cluster commands re-run once each from `probes/REV-PES-S03-p1-correctness-tests/cluster-commands.sh` via `run-suites.sh`. They match `frames/*-gate.out`. No disagreement.

| command | this pass | frame |
|---|---|---|
| C1 expect v9 24/0, baseline 31/0 | v9 rc=0 passed=31 failed=0 (expect 24/0); baseline rc=0 passed=31 failed=0 (expect 31/0); CLUSTER_RED | same |
| C2 expect v9 28/0, baseline 31/0 | v9 31/0 (expect 28/0); baseline 31/0; CLUSTER_RED | same |
| C3 expect v9 31/0, baseline 31/0 | v9 31/0; baseline 31/0; CLUSTER_GREEN | same |

C1 and C2 are red because the expected pair is that cluster's own boundary and the head has C3's 31 tests. That is the PLAN §3 note, not a broken suite. Logs: `c1.log`, `c2.log`, `c3.log`.

4. Every added case was turned red by a README mutant, except the widened pin's reaction to a price-code row deletion (B1). Retype result: the pin cannot tell.

| mutant | case that went red | pair |
|---|---|---|
| delete `:784` only | widened pin `:437` | 1 failed \| 30 passed |
| delete `:781` (and the `:780` / `:779` sweep) | none | 31/31 v9 and 31/31 baseline |
| price members removed from the `api.env` example only | price-members case `:655` | 1 failed \| 30 passed |
| phrase `the daily call cap is the only ceiling` put back in the support note | daily-cap case `:673` | 1 failed \| 30 passed |
| `` The development seed publishes `600000`. `` replaced with a sentence that has no number | cost case `:682` | 1 failed \| 30 passed |
| bullet `§11's hosted provider target example` put back under Known-stale | stale-list case `:695` | 1 failed \| 30 passed |
| `sealed none` → `sealed nothing` in the R3.4 sentence | R3.4 case `:719` | 1 failed \| 30 passed |
| table cell `unreachable at runtime` → `unreachable in production` | R3.4b row case `:732` | 1 failed \| 30 passed |
| `` `COST_ENVELOPES_NOT_SEALED` `` added to the §10 bullet | R3.4b bullet case `:750` | 1 failed \| 30 passed |
| source-read at `:399-422` replaced with a `Set` of the 12 literal codes | none — 31 passed | the pin cannot tell |

5. Enumeration run as `enumeration.mjs <this worktree>` (argv root, not the ARCH script's hard-coded `pes-s03` lane). `pes-s03` was also `98264a5ea` when checked. Union size 12:

`COST_ENVELOPE_POLICY_INVALID`, `COST_ENVELOPE_POLICY_UNRESOLVED`, `CUSTODY_GROUP_UNRESOLVED`, `PROVIDER_CREDENTIAL_FILE_ABSENT`, `PROVIDER_CREDENTIAL_FILE_INVALID`, `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`, `PROVIDER_TARGET_PRICE_REQUIRED`, `PROVIDER_TARGET_PRICE_ZERO`, `SECRET_CUSTODY_INVALID`, `SUPPORT_ADMISSION_SCOPES_NOT_SEALED`, `SUPPORT_MODEL_CREDENTIAL_ABSENT`, `SUPPORT_MODEL_PATH_NOT_RATIFIED`.

Each is in §11, in the refusal span, and on a table row at this head (before mutants). Anchors: E1 `index.ts:740-744`, E2 `:725`, E3 `support/model.ts:41-44`, E4 `index.ts:679-703`, E5 `:192-198`, E6a `cost-envelope-policy.ts:129-146`, E6b `:153-170`, E7 `runtime-environment.ts:175-182`.

Guard order, read at the three call sites. The target block is parse, then hosted target rules, then price:

- `apps/api/src/main.ts:300` `parseProviderDiscoveryTargets`, `:305` `assertDeploymentProviderTargets`, `:312` `assertPricedProviderTargets`
- `apps/runner/src/main.ts:74`, `:81`, `:87` in that same order
- `packages/providers/src/index.ts:278` and `:195` throw `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` inside the parse; `:687` throws `PROVIDER_TARGET_PRICE_REQUIRED` and `:700` throws `PROVIDER_TARGET_PRICE_ZERO`, both only after `mode === "hosted"` at `:683`

The sentence at `README.md:786` matches that parse-before-price order. It does not claim to run before every hosted rule. Hosted seals run earlier (`apps/api/src/main.ts:97`, `:230`, `:241-242`; `apps/runner/src/main.ts:38`). That is what PLAN C1-3 (`PLAN.md:405-431`) measured, and the forbidden pattern at the test `:433-435` is the claim those lines falsify.

V-8: `RUN_COST_ENVELOPE_MONEY_REACHED`, `PROVIDER_USAGE_UNREPORTED`, `COST_ENVELOPE_CHARGE_UNREPRESENTABLE`, `DAILY_COST_ENVELOPE_REACHED` are absent from the union, from the refusal span, and from the whole README. V-9's four parse-time codes are also absent from the README (the only nearby prose code is the pre-existing `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT` at `:858`).

6. Acceptance at the head, compared with `probes/ARCH-PES-S03/accept-base.log`:

| step | base | head |
|---|---|---|
| 2 | v9 23/23, baseline 31/31 | `pnpm vitest run` both files, rc=0, Test Files 2 passed, Tests 62 passed (31+31). `accept-step2.log` |
| 3 | lines 22, 25, 26, 27, all in the known-stale notice; §11 at 721 | six codes have refusal-table rows at `:779-784`. Hits also exist in §10 (`:700-701`), the support note (`:739-740`), the sentence (`:786`), and the member table (`:850-851`). None are in the known-stale list |
| 4 | one hit, line 20, inside bullet B1 | `:850` member row, `:854` `runner.env`, `:855` `api.env` |
| 5 | five bullets in `sed -n 14,40p`, including the two §11 bullets and the daily-cap bullet | those three headlines are gone; `KEK rotation is not implemented` and `deploy/vps/env/api.env.example` remain |
| 6 | rc=1, no hit | one hit, `:762`, in §11, in a sentence that names `probe_freshness_ms` and states no recommended value. Numbers match `provider-probe.ts:82` (`max_tokens: 8`), `packages/register/src/index.ts:457` (positive integer), `dev-deployment-register.ts:344` (`600_000`) |
| 7 | empty, and a moved range printed | `git diff --stat origin/dev...HEAD -- apps packages` printed nothing, and `git diff --stat 776359c3...HEAD -- apps packages` printed nothing. Merge-base of current `origin/dev` (`a6d6382ba`) and HEAD is still `776359c3`. `origin/dev~200...origin/dev -- apps packages` printed 266 files. C2's handoff quotes 265 files for that spelling; `origin/dev` has since moved to `a6d6382ba`, so the counts are not the same range. The empty result is capable of printing |

`git diff --stat origin/dev...HEAD -- tests/architecture/vps-deployment-baseline.test.ts` printed nothing (byte-identical to base). `git diff --stat origin/dev...HEAD -- . ':!.codex/skills'` names exactly the two slice files.

`pnpm typecheck` rc=1, one diagnostic, `apps/ui/lib/v3/answerExport.ts(2,38) TS2835`, the intake diagnostic. Delta per file zero. `typecheck.log`.

Four RED-at-base suites, `red-at-base.sh`, marker CLUSTER_GREEN against the intake pairs (the marker is green because the failures match the expected pairs):

| suite | pair | failure (pre-existing, intake 2026-09-24 §5b) |
|---|---|---|
| `tests/integration/dev-api-environment.test.ts` | 9 passed / 1 failed | `atomically assembles the exact environment without returning credential values` — `toContain` on undefined at `:177` |
| `tests/integration/dev-api-process.test.ts` | 5 passed / 5 failed | five DEV-10B cases; the logged one expected `spawn failed with secret argv` and got `DEV_API_PROCESS_ENVIRONMENT_INVALID` |
| `tests/integration/dev-provider-panel.test.ts` | 3 passed / 1 failed | `loads the exact live CLI targets…` — healthy refs gained `development:codex-premium-cli` and `development:claude-premium-cli` |
| `tests/integration/t16-algorithm-register.test.ts` | 20 passed / 1 failed | `seeds every ruled algorithm row…` — `providerFamilyMap` gained the same two premium refs |

No embedded-postgres listener was left on a NO-TOUCH port (`reservePort` uses `listen(0)`; this seat did not open `:55432`).

`## PROGRESS records` were checked after the 14:28 package correction (N1, N4). Meaning cells at `:779-784` match the throws cited in charge 5 and `cost-envelope-policy.ts:131-135` / `:163-167`, `runtime-environment.ts:112-124` and `:191-202` (the row keys `support_reads` / `support_sessions` / `support_model_calls` are the JSON members `session-policy.ts:134-136` maps onto `supportReads` / `supportSessions` / `supportModelCalls`). R3.5 anchor lines in the C1 and C2 handoffs match the enumeration. R3.7's leave-exactly bullets are still the two survivors. R3.8's claim that the baseline file is byte-identical is the empty `tests/architecture/` diff above.

7. This file. 8. No git writes, no `pnpm install`, no listener on a NO-TOUCH port, no real key, no other lens's output read, no `boards switch`.

## Predictions

The other lens will treat the guard sentence at `README.md:786` as false because `assertHostedCostEnvelopesSealed` runs at `apps/api/src/main.ts:97` and `apps/runner/src/main.ts:38`, before the parse, and will file that as a product defect. The sentence only orders `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` ahead of the two price codes, which is what the three call sites do; the earlier seals are the order PLAN C1-3 already recorded and the test at `:433` forbids claiming otherwise. The check I would make first on their verdict is whether they quoted the sentence or the packet's "parse → hosted rules → price" parenthesis. A security lens that flags the probe paragraph's "no minimum" is re-litigating V-7: the validator is `z.number().int().positive()` at `packages/register/src/index.ts:457`, and the paragraph states that.

## V-ROW

None.

## UNVERIFIED

- Whether each BUILD author's `SKILLS LOADED` line is backed by the skill body in that seat's transcript. The three corrected handoffs name `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`, `test-driven-development`, and `verification-before-completion` (the worker floor for a BUILD node; `systematic-debugging` is also named on the same line). A fabrication check needs the transcript, which this packet does not include.
- Whether a retyped 12-code list would have been RED at base. That needs the base tree checked out. At this head the retype is green (charge 4), which is the outcome PLAN §3 describes once §11 already contains the codes.
- `COST_ENVELOPE_POLICY_INVALID`'s row was not deleted on its own. It sits in the same `rowAt` loop as `COST_ENVELOPE_POLICY_UNRESOLVED` (`:742-744`), which was deleted and did turn that case red.
