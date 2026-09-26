# REV(S03) pass 2: security-data-safety

Seat: REV-PES-S03-p2-security-data-safety. Ticket t_e2a75414. Agent a4b235a7ecb16c621 (Claude Opus, substituting for Grok under V's roster ruling).
Head `60993d2db` in my detached worktree `.worktrees/pes-s03-rev-sd/dialectical-engine`. Base `origin/dev` @ `776359c3`. Lens: security-data-safety. Pass 2 of 3.
Scope: whether F1 of `reviews/REV-S03-p1-UNION.md` is closed by the FIX range `98264a5ea..60993d2db`, the pass-1 mutants re-run, and a ruling on the named retype residual.
Probe directory P = `.hermes/reports/provider-env-selection/probes/REV-PES-S03-p2-security-data-safety/`. Every script takes the worktree root from `$WORKTREE` or argv.

SKILLS LOADED: superpowers:using-superpowers · heartbeat-protocol · heartbeat-reviewer · superpowers:verification-before-completion. I did not load `receiving-code-review`, because nothing is contested.

**VERDICT PASS (pass 2) / CONFIDENCE high / STRONGEST COUNTER:** the pin excludes V-8 codes only from the table's first column. It stays 31/31 when `DAILY_COST_ENVELOPE_REACHED` is written into a Meaning cell, into a second table, or into prose inside the refusal span (N1). V-8's wording is "OUT of README §11's refusal table". Someone could read a Meaning-cell mention as "in the table" and so as part of F1's class. I rated it N because the table's rows are still exactly the 17 codes. That was F1's class. At the head the span holds zero V-8 codes.

## F1: closed

The FIX changes one file, the v9 test (+43/−4). A helper, `refusalTableRows` (`tests/unit/v9-provider-credential-files.test.ts:397-407`), cuts the contiguous rows under `| Code | Meaning |` inside the refusal span. The 12 codes derived from source must now appear in those rows (`:448-449`), not anywhere in §11. The first column must equal exactly the 17-code set (`:452-475`), so a row that is missing, extra, duplicated, holds two codes, or has lost its backticks fails. The resolver-inventory case was also moved from `section` to `table` (`:505`). This diff removes no assertion. The only deletion is the `section` variable, whose single use is replaced. I re-derived the pass-1 mutants in `P/mutants.py`, because the pass-1 scripts can't be re-run as they stand (N4). Every restore was checked with `cmp` and a per-path porcelain comparison. All were true (`P/mutants-summary.json`).

| pass-1 mutant | p1 result | now (v9 / baseline) | failing case |
|---|---|---|---|
| delete row `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` (p1 `:779`) | 31/31 | **1 failed \| 30 passed** / 31/31 | `names every start-up refusal…` |
| delete row `PROVIDER_TARGET_PRICE_REQUIRED` (p1 `:780`, security N3 mutant A) | 31/31 | **1 failed \| 30 passed** / 31/31 | same |
| delete row `PROVIDER_TARGET_PRICE_ZERO` (p1 `:781`) | 31/31 | **1 failed \| 30 passed** / 31/31 | same |
| insert a `DAILY_COST_ENVELOPE_REACHED` row after `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | 31/31 | **1 failed \| 30 passed** / 31/31 | same |
| control: delete row `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` (p1 `:784`) | RED | **1 failed \| 30 passed** / 31/31 | same |
| rename the heading `### What the hosted mode refuses, in code` | not run | **3 failed \| 28 passed** | the pin, the resolver case, the R3.4b(a) row case |

All four pass-1 survivors are RED now. **F1 CLOSED.**

## The named residual: the source-inventory retype. Ruling: out of the slice, not a finding

| mutant | v9 |
|---|---|
| retype: `union` becomes a literal `Set` of the 12 codes, test file only | 31/31 (the residual survives, as the FIX seat said) |
| source: rename `PROVIDER_TARGET_PRICE_ZERO` to `…_NIL` in `packages/providers/src/index.ts`, committed test | **1 failed \| 30 passed** |
| the same source rename, with the retype applied | 31/31 |
| source: add a 13th code (`PROVIDER_TARGET_PRICE_CEILING`) inside anchor E4 `assertPricedProviderTargets`, committed test | **1 failed \| 30 passed** (`union.size` 13) |
| the same 13th code, with the retype applied | 31/31 |

The committed test does read the source. Both product-source drifts turn it RED. The retype is a mutant of the test itself, and at the head it behaves identically, so no suite can kill it. PLAN §3 already says so ("the list would not be RED at base…"). The one detector for it is a review read that the anchors still `readFile` the four source files, which they do at `:411-425`. No suite in this slice can express that pin. I don't count it as a finding against the slice. If the mission wants it pinned anyway, the only option is a meta-assertion over the test's own text, and I don't recommend one.

## Charges

1. Skills loaded as above. I read all four comments on t_e2a75414 before claiming: DISPATCHED (Grok), the Grok CLAIM, SEAT DIED (402), and DISPATCHED (Opus). CLAIM posted at 16:25:15 EEST. HEAD `60993d2db`, dirty 0. The orchestrator's NOTE comment (#5) naming the agent id landed after my 16:25:15 read and before my CLAIM was posted as #6. It names `a4b235a7ecb16c621`, the same id I took from the seat line in the transcript head. I read all six comments before this verdict (N5).
2. Package and packets reviewed. `diff.patch` is byte-identical to a live `git diff 776359c3..HEAD -- . ':!.codex/skills'` (`P/secrets.out`). `commits.txt` lists 4 commits. The FIX handoff's `SKILLS LOADED` covers the whole worker floor plus `receiving-code-review`. Each skill's unique body text is present in rollout `01a0d74f…jsonl` ("Performative Agreement" ×4, "NO FIXES WITHOUT ROOT CAUSE" ×5, "NO PRODUCTION CODE WITHOUT A FAILING TEST" ×8, "NO COMPLETION CLAIMS" ×8). Defects: N4, N5, N6, N7.
3. Cluster commands re-run three times from `P/clusters.sh`. Each run matches `frames/*-gate.out` line for line: C1 `v9 31/0 (expect 24/0)` CLUSTER_RED; C2 `31/0 (expect 28/0)` CLUSTER_RED; C3 v9 31/0 and baseline 31/0 **CLUSTER_GREEN**. C1 and C2 are RED only because their pairs are each cluster's own boundary; this is the PLAN §3 note, not a disagreement. The FIX three-run table (31/31 and 31/31, GREEN ×3) agrees. `pnpm typecheck` gave one diagnostic, `apps/ui/lib/v3/answerExport.ts(2,38) TS2835`, which is the intake baseline, so the delta is 0 (`P/typecheck.log`).
4. Secrets and paths (`P/secrets.sh` → `secrets.out`):
   - **Added lines.** 220 in the whole product diff and 42 in the FIX range. None matches `Bearer`, `sk-…`, `xai-`, `AIza`, a 40+ char base64 run, `0700`, `/Users/`, `/home/`, a private-key header, `ghp_`, `AKIA…` or `eyJ…`.
   - **The three `/etc/` hits.** Two are the worked-example lines (`deploy/vps/README.md:854-855`) that carry the `acme.header` placeholder path. That path was already in the base lines these replace. The third is a test `includes` probe at `:128` of the patch.
   - **Whole changed files.** The README has no key shape. The test has six `Bearer …` fixtures (`:37`, `:348-378`: `t10-fixture-token-…` and `local-relay-*`). They are documented placeholders, none sits in an added hunk (count 0), and they predate the slice.
   - **Credential-file contract.** The span from `### The credential-file contract` to `### Adding a vendor` is byte-identical to both `776359c3` and the tip of `origin/dev` (1165 bytes each, `cmp` 0). No README hunk falls in it: the hunks start at old lines 19, 712, 749, 767, 779, 782, 845 and 848, and the span is `:788-805` at the head.
   - **Sealed v1 row shape and the exact-set invariant are untouched.** `git diff --stat origin/dev...HEAD -- apps packages` prints nothing, and a control range prints 266 files. `tests/architecture` also prints nothing.
5. Refusal table truth (`P/table-truth.sh` → `table-truth.out`):
   - **Heading.** Still `### What the hosted mode refuses, in code` (`:764`), and a mutant confirms the test pins it.
   - **Every code has a source site.** Each of the 17 first-column codes and the 4 nested reasons is defined or thrown in `apps/`/`packages/`. Examples: `runtime-environment.ts:95/99/158/202`; `providers/src/index.ts:195/613/652/655/700/784/786`; `apps/runner/src/main.ts:117`; `provider-topology.ts:76`; `support/model.ts:133/248`; `cost-envelope-policy.ts:132/164`; `crypto/src/index.ts:153/166/181/891`. No code is invented or misspelled.
   - **V-8 and V-9 codes.** Each of the four V-8 codes has count 0 in the span and count 0 in the whole README. The four V-9 codes are also 0 in the span.
   - **Paid-probe paragraph.** `:762` names `max_tokens` and `probe_freshness_ms` once each and gives `600000`. It contains no `recommend`, `suggest` or `should`. Its "minimum" hit is the R3.6 sentence "Hosted mode enforces no minimum".
   - **Worked-example env forms.** They carry `authorization_file` paths and prices only. There is no header value.
6. NO-TOUCH listeners at start (16:25) and end (16:33) are identical to `listeners.txt`: `:4310` node/95068 and `:55432` com.docke/19920, all others empty (`P/listeners-start.txt`, `listeners-end.txt`). I ran no `pnpm install` and started no listener; vitest's own ephemeral fixtures were the only sockets. My worktree porcelain is 0 and the lane `pes-s03` is at `60993d2db` with porcelain 0. No handoff claims a listener.
7. This file. 8. I made no git writes (every read of `origin/dev` used `git show`/`git diff`, with no merge-tree or checkout), ran no install, did not switch boards, read no other lens's pass-2 output, and used no key.

## Findings

No blocking finding.

**N1: the V-8 exclusion is pinned only in the table's first column.** At `tests/unit/v9-provider-credential-files.test.ts:452-475` the exact-set check reads only `row.split("|")[1]`. Measured with v9 at 31/31 and baseline at 31/31 in each case:
- `DAILY_COST_ENVELOPE_REACHED` appended to the `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` Meaning cell;
- a prose line naming it between the heading and the table;
- a second `| Run-time code | Meaning |` table holding it, above the real table;
- all four V-8 codes in prose below the guard sentence, claiming they "are refused at boot as well".

Each of these puts a run-time spend stop under "What the hosted mode refuses, in code", which is the operator misdirection that V-8 was ruled to prevent. The cause is in the packet: pass-1 security N3 asked that the pin "fails if any of the four V-8 codes appears in that span", and `packets/FIX-S03-p1.md` charge 3 narrowed that to "in the table's first column". The FIX seat did what the packet asked. The fix is one assertion: read `PROVIDER_COST_ENVELOPE_REFUSAL_CODES` from `packages/providers/src/index.ts`, so the list comes from source, and require that `refusal` contains none of them. WHEN: the next FIX(S03) node if pass 2 unions to REWORK, otherwise the TEST(S03) residual list.

**N2: nine first-column codes are pinned to a literal, not to source.** The table and the literal can drift away from the source together. The 17-code literal (`:457-474`) is checked against the README only. Nine of its codes are not in the 8-anchor union: `DEPLOYMENT_MODE_UNRESOLVED`, `DEPLOYMENT_MODE_INVALID`, `PROVIDER_BASE_URL_TLS_REQUIRED`, `PROVIDER_TARGET_LOOPBACK_REFUSED`, `PROVIDER_INLINE_CREDENTIAL_REFUSED`, `PROVIDER_AUTHORIZATION_FILE_ABSENT`, `PROVIDER_AUTHORIZATION_FILE_UNUSABLE`, `COST_ENVELOPES_NOT_SEALED` and `RUNNER_PRIMARY_PROVIDER_REF_DRIFT`. Measured:
- **Rename `PROVIDER_TARGET_LOOPBACK_REFUSED` in `packages/providers/src/index.ts`.** v9 and baseline stay 31/31. Behavioural suites do flag the source change (`v9-deployment-mode` 40 failed of 201, `v30-support-provider` 1 failed of 30). But the natural fix there is to edit their literals, and nothing points at README §11. The operator table then names a code the service no longer emits and lacks the one it does emit.
- **The same rename on `PROVIDER_AUTHORIZATION_FILE_UNUSABLE`.** A v9 behaviour case turns RED, not the pin.

This class predates the FIX. Pass 1 found the same at base: the 8 anchors are PLAN §1b's choice, which passed three ARCH-REV passes. It is outside F1, so it is N. WHEN: a later slice or ARCH fold. The cheapest remedy is to add anchors for `assertDeploymentProviderTargets`, the credential resolver's two throws, the deployment-mode error classes and the topology drift throw, and derive the first-column set from them.

**N3: the slice's README can't merge cleanly onto today's `origin/dev`.** Much of its content already exists on dev in other words. `origin/dev` moved from `776359c3` to `a6d6382ba` (2026-09-25 12:51). It carries 5 README commits, `da129da71` `cd4ec91fe` `ff574c775` `dcb63be42` `09c1f5016`, which take the file from 873 to 1344 lines. It also carries +286 lines in `tests/architecture/vps-deployment-baseline.test.ts`. Measured:
- **Six of the slice's eight README hunks overlap or abut dev hunks** (`P/merge-overlap.out`): old lines 19-31 (the known-stale list, which dev dropped as "the stale banner"), 712-713, 749, 779, 845 and 848-849.
- **Dev's own §11 refusal table** (`origin/dev` README `:1015-1036`) already carries the same 17 first-column codes, in a different order and with different Meaning text.
- **The slice's own pins fail against dev's README**, with the slice's v9 run on dev's file in my worktree and then restored: **8 failed | 23 passed**. The failures are the guard-order sentence, the two priced env forms (R3.2), the `max_tokens` paragraph, which is absent on dev (R3.6), the R3.4 and R3.4b EXACT sentences, and the known-stale case. Only the F1 exact-set and union assertions pass on dev's README.
- **Dev commit `cd4ec91fe`** ("make every secret-writing runbook line safe to paste twice") changes secret-writing lines in the same file. A hand-resolved conflict that keeps the slice's side of a region can silently revert them.

This is outside F1 and outside what this lens can settle. It is a mission and V question, so it goes to the V-ROW below. WHEN: before TEST(S03), because V's acceptance runs against the lane, not against what dev will hold.

**N4: the pass-1 probes can't be re-run as the charge asks.** `probes/REV-PES-S03-p1-correctness-tests/mutants-sweep.sh:5-7` (and `mutants.sh`) hard-code `WT=…/pes-s03-rev-ct/…` and write into their own directory. `probes/REV-PES-S03-p1-security-data-safety/` holds no mutant script, only `mutant-pin.log` and `mutant-v8.log`. Running the p1 scripts would mutate another seat's worktree and write outside my `allowed` list. I re-derived all five in `P/mutants.py`, with the root from argv. This breaks COMMON's promoted-probe rule ("the root from `$WORKTREE` or argv, never hard-coded"). WHEN: the orchestrator's promotion check before a probe directory is named as a re-run input.

**N5: my packet's charge-1 cursor is stale for a re-dispatched ticket.** `packets/REV-S03-p2-security-data-safety.md:23` asks for `comments read through: 1`. At dispatch the ticket already held 4 comments: the Grok DISPATCHED, the Grok CLAIM, SEAT DIED and the Opus DISPATCHED. The NOTE that carries the agent id was posted after the seat started, so a seat that claims fast claims before the NOTE exists, and that happened here. The packet was rewritten for Opus in `41e50bbaa`, but charge 1 kept the Grok-era cursor. WHEN: the next packet generation for a re-dispatched node, which should stamp the real cursor and post the NOTE before the Agent call returns.

**N6: the freeze pair in my packet is degenerate.** `packets/REV-S03-p2-security-data-safety.md:10` gives `0b3039434..0b3039434`, so the prescribed `git diff --stat` is empty by construction (measured: no output, rc 0). The pass's real mission-tree change is `0b3039434..c201eae48`: the FIX self-report, FIX probes, the p2 package and both p2 packets. The generator stamped the same freeze on both ends. WHEN: the next gen-rev-packet run, which must refuse a pair whose two ends are equal.

**N7: the package README is a pass-1 shape, and the FIX packet cites the wrong pin line.**
- **Package.** `review-packages/S03-p2/README.md` has no FIX-range diff (`98264a5ea..60993d2db`), no scope line and no pointer to `S03-p1/`, although packet `:10` lists all three for a later pass. I recomputed the diff myself with one command.
- **FIX packet.** `packets/FIX-S03-p1.md` charge 2 calls `:453` (`const closedSet = providers.slice(`) "the pin". At `98264a5ea` the F1 containment was `:437`, and `:453` is the resolver case's extractor. The FIX seat noticed and fixed both loops, so the miscitation did no harm here.

WHEN: at the next package and packet generation.

## Predictions about the other lens

The correctness-tests lens will confirm that F1 is closed with the same five mutants, and will probably also report the FIX's 27/27 class sweep. It will probably rule the retype residual the way I did, by pointing at PLAN §3's "not RED at base" sentence. It may not pair the retype with a source mutant, and that pairing is what shows the committed test is actually source-live. I expect it to miss N1, because the FIX handoff's own neighbour mutant (DAILY in prose outside the table, 31/31) is presented there as expected behaviour. I also expect it to miss N3, because the p1 correctness lens noted only that the merge-base was still `776359c3` and never read `origin/dev`'s README content. The first thing I'd check in its verdict is whether it ran anything against `a6d6382ba`.

## UNVERIFIED

- The four RED-at-base integration suites were not re-run. The FIX range touches only the v9 test, and none of the four reads it.
- The actual merge outcome of N3. I did not run `git merge-tree` or a trial merge, because both write git objects or refs. The overlap is measured from `-U0` hunk ranges and from running the slice's v9 against dev's README.
- Whether the `cd4ec91fe` secret-writing lines sit inside one of the six overlapping regions or only in the same file. I did not diff it line by line.
- UI, both modes: not applicable (the slice is `ui: no`). The shared surface mounted is `tests/architecture/vps-deployment-baseline.test.ts`, at 31/31 in every run.
- No process of mine is still running, so there are no PIDs to kill.

## V-ROW

V-ROW: NEW · S03 · t_42f856af · `origin/dev` (`a6d6382ba`) already carries its own §11 refusal table with the same 17 codes, and it dropped the known-stale banner that R3.7 edits. Six of the slice's eight README hunks overlap dev's, and the slice's v9 fails 8/31 on dev's README (the priced env forms, the `max_tokens` paragraph and the V-11/V-14 EXACT sentences are absent on dev). Recommended default: before TEST(S03), rebase the slice lane onto current `origin/dev` in a new FIX node. Keep the slice's V-ruled sentences (R3.4, R3.4b), R3.2's two priced env forms and R3.6's paragraph, and use dev's text everywhere else, including `cd4ec91fe`'s secret-writing lines. Then re-run REV(S03) pass 3 on the rebased head. Smallest yes/no for V: "Rebase S03 onto today's dev before you test it, keeping your ruled sentences and dev's everything-else?" VERDICT rebase / CONFIDENCE medium / STRONGEST COUNTER: a rebase is a new code change at pass 3 of 3. If V would rather test the lane as built and settle the merge at ff time, the rebase moves the risk to the merge step, where no review pass remains.
