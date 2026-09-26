# REV(S03) pass 2 — lens correctness-tests

Seat REV-PES-S03-p2-correctness-tests (fresh blind Claude Opus subagent `ae1559d39d6236d73`, re-dispatch after the grok 402) · ticket t_b2ed2eae · pass 2 of 3 · head `60993d2db` · base `origin/dev` @ `776359c3` · FIX range `98264a5ea..60993d2db` · worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03-rev-ct/dialectical-engine` (detached; porcelain 0 at claim, after every mutant, and at handoff).

Probes, logs and outputs are in `.hermes/reports/provider-env-selection/probes/REV-PES-S03-p2-correctness-tests/`. Every script there takes its root from `$WORKTREE` or argv. Scripts: `cluster-commands.sh`, `mutants.py`, `accept.sh`, `red-at-base.sh`.

**VERDICT PASS (pass 2 of 3, lens correctness-tests) / CONFIDENCE high / STRONGEST COUNTER:** a V-8 run-time spend code can still sit inside `### What the hosted mode refuses, in code` with the suite at 31/31. Two ways were measured: a second `| Code | Meaning |` table between the pinned table and the guard sentence, and a mention in a Meaning cell. The first-column pin at `tests/unit/v9-provider-credential-files.test.ts:457` reads only the first table's first column (N1). I rule this N rather than a failure to close F1. F1's recorded mutant was a row inserted INTO the table (`REV-S03-p1-UNION.md`, F1), and that mutant now fails. The FIX packet's charge 3 also asked for exactly the first-column check.

## F1 closure — every pass-1 mutant re-run at `60993d2db`

All mutants were re-implemented in `mutants.py` with this seat's paths. The pass-1 scripts write into the pass-1 probe directories, so I did not run them in place. The mutant bodies are the same text. Every mutant started from the bytes captured at start. After each restore, all three touched paths were checked two ways: `cmp`-equal to those bytes, and `git status --porcelain -- <path>` identical to its pre-mutant line. The README is byte-identical between `98264a5ea` and `60993d2db` (`git diff --stat 98264a5ea 60993d2db` names only the test), so the pass-1 line numbers still hold.

| mutant (source lens) | pass 1 (at `98264a5ea`) | pass 2 (at `60993d2db`) | failing assertion |
|---|---|---|---|
| delete row `README.md:781` `PROVIDER_TARGET_PRICE_ZERO` (ct B1, sd N3) | 31/31 GREEN | **1 failed \| 30 passed — RED** | `:449` `PROVIDER_TARGET_PRICE_ZERO: expected '| \`DEPLOYMENT_MODE_UNRESOLVED\`…' to contain…` |
| delete row `:780` `PROVIDER_TARGET_PRICE_REQUIRED` (ct B1 sweep, sd mutant A) | 31/31 GREEN | **1 failed \| 30 passed — RED** | `:449` |
| delete row `:779` `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` (ct B1 sweep) | 31/31 GREEN | **1 failed \| 30 passed — RED** | `:449` |
| insert `DAILY_COST_ENVELOPE_REACHED` row after `:784` (sd V-8 mutant) | 31/31 GREEN | **1 failed \| 30 passed — RED** | `:457` `exact start-up refusal codes… expected […(17)] to deeply equal […(16)]` |
| delete row `:784` `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` (ct control, sd mutant B) | RED | RED, 1 failed \| 30 passed | `:449` |
| delete row `:782` `COST_ENVELOPE_POLICY_UNRESOLVED` | RED (R3.4b row-order case only) | RED, 2 failed \| 29 passed (pin + R3.4b a) | `:449`/`:457` and `:771` |
| delete row `:783` `COST_ENVELOPE_POLICY_INVALID` (pass-1 UNVERIFIED) | not run | RED, 2 failed \| 29 passed | pin + R3.4b a |
| price members out of the `api.env` form only | RED | RED 1/30 | `:694` |
| daily-cap sentence restored | RED | RED 1/30 | `:712` |
| `600000` dropped | RED | RED 1/30 | `:721` |
| known-stale bullet put back | RED | RED 1/30 | `:734` |
| `sealed none` → `sealed nothing` | RED | RED 1/30 | `:758` |
| `unreachable at runtime` → `in production` | RED | RED 1/30 | `:771` |
| `COST_ENVELOPES_NOT_SEALED` added to the §10 bullet | RED | RED 1/30 | `:789` |
| source-read replaced by the literal 12 (retype) | 31/31 | 31/31 (ruled below) | — |

The price-row deletions fail at the scoped containment (`:449`) because, after the FIX, containment reads table rows only. The first-column exact set (`:457`) is independently live. Deleting the `:781` row and moving the code into the `:780` Meaning cell (`p2-price-zero-moved-to-meaning`) gives 1 failed | 30 passed at `:457` (`…(15)] to deeply equal […(16)]`), with `:449` passing. A second V-8 code row (`RUN_COST_ENVELOPE_MONEY_REACHED`) also fails at `:457`. Output verbatim: `mutants.out`; one log per mutant: `mutant-<name>.log`.

**F1: CLOSED for this lens.** The four survivors named in the UNION are RED, and so are both controls.

## The named residual — the source-inventory retype — RULED: not a finding (killed by source mutants)

Measurement. Two temporary mutants of `packages/providers/src/index.ts`, restored the same way as the README mutants:

| mutant | head test (source-read) | retyped test (literal 12) |
|---|---|---|
| `p2-src-rename-zero`: the throw at `index.ts:700` renamed `PROVIDER_TARGET_PRICE_ZERO:` → `PROVIDER_TARGET_PRICE_NONPOSITIVE:` (union size stays 12) | **1 failed \| 30 passed** — `PROVIDER_TARGET_PRICE_NONPOSITIVE: expected '| \`DEPLOYMENT_MODE_UNRESOLVED\`…' to contain 'PROVIDER_TARGET_PRICE_NONPOSITIVE'` | 31/31 GREEN |
| `p2-src-add-code`: a 13th throw `PROVIDER_TARGETS_EMPTY` inside `assertPricedProviderTargets` (`index.ts:683`) | **1 failed \| 30 passed** — `expected 13 to be 12` | 31/31 GREEN |

R3.5 (`SPEC-v3.md:114-120`) protects one property: the table follows the SOURCE when the source moves. The source-read is what defends that property, and it bites on both source mutants. The retype does not. Pass 1 and the FIX seat tried the retype only against README mutants. For those mutants the retype is equivalent by construction, because the literal is what the source yields today, so no README-only mutant can kill it. The retype is killed by the source-mutant family, and it is not a weakness of the pin. No B, no N. Whoever writes the next packet should name this mutant family for this property (see the self-report).

## Findings (all non-blocking; none reopens F1)

**N1 — V-8 codes in the refusal span outside the first table's first column pass.** `tests/unit/v9-provider-credential-files.test.ts:397-407` (`refusalTableRows` takes the FIRST `| Code | Meaning |` header and stops at the first non-`|` line), `:449`, `:457`. README span `deploy/vps/README.md:764-787`. Class: a V-8 code (`PROVIDER_COST_ENVELOPE_REFUSAL_CODES`, `packages/providers/src/index.ts:934-946`) present in the refusal span but outside the table the pin parses. Members measured:
- `p2-second-table-daily`: a blank line, then a second `| Code | Meaning |` / `|---|---|` / `DAILY_COST_ENVELOPE_REACHED` table, placed before the guard sentence at `:786`. Result 31/31. GitHub renders this as a second refusal table under the same heading.
- `p2-second-table-daily-other-header`: the same with header `| Run-time code | Meaning |`. Result 31/31.
- `p2-daily-in-meaning-cell`: `; not \`DAILY_COST_ENVELOPE_REACHED\`` appended to the `:782` Meaning cell. Result 31/31.
- The FIX seat's own neighbour (DAILY in prose outside the table) also passed 31/31 (`handoffs/FIX-PES-S03-p1.md`, "neighbour" paragraph).

V-8 (`V-DECISIONS-PACKET.md:12`) keeps the four codes out of "README §11's refusal table" because that table is the start-up list. An operator reading the span sees no difference between the first table and a second one. Remedy, by the SHAPE (a closed set of four codes read from the source): assert that none of `PROVIDER_COST_ENVELOPE_REFUSAL_CODES` occurs anywhere in the refusal span. It must be read out of `index.ts:934`, the same way the 12 codes are. WHEN: the next FIX(S03) node, if pass 2 unions to REWORK. Otherwise a ticket before TEST(S03).

**N2 — the pin does not tie a row's Meaning cell to its code (R3.3).** `tests/unit/v9-provider-credential-files.test.ts:450-475` extracts only the first column. R3.3 (`SPEC-v3.md:65-70`) requires each row's Meaning to state the condition that emits the code. Members measured:
- `p2-price-rows-swapped-codes`: the codes of rows `:780` and `:781` are exchanged, so `PROVIDER_TARGET_PRICE_ZERO` now "declares no price pair" and `…_REQUIRED` now "is below 1 micro-unit". Result 31/31.
- `p2-price-zero-row-emptied-meaning`: the `:781` Meaning cell is emptied to `| |`. Result 31/31.

Only `COST_ENVELOPES_NOT_SEALED`'s cell is pinned (`:771`, R3.4b a). The rows are correct at the head: the Meaning cells at `:779-784` match the throws `index.ts:195/278`, `:687`, `:700` and `cost-envelope-policy.ts:131-135/163-167`, as pass 1 measured and I re-read. So this is a future-drift gap, not a wrong runbook. Remedy: pin one condition keyword per row for the six R3.3 rows (e.g. `no price pair` on the `_REQUIRED` row, `below 1 micro-unit` on the `_ZERO` row), or V accepts the PROGRESS record plus human review as R3.3's only guard. WHEN: same as N1.

**N3 — packet: the freeze pair is degenerate.** `packets/REV-S03-p2-correctness-tests.md:10` stamps `0b3039434..0b3039434`. Both ends are the same commit, so the mandated `git diff --stat` is empty by construction and records nothing (rc=0, no output). The pass's record landed at `c201eae48` ("consume FIX S03 p1 … GATE(S03) p2 + scoped REV S03 p2 packets"). `git diff --stat 0b3039434..c201eae48` over the three mission trees prints 144 files, and over the S03-p2 package plus this packet prints 10 files. The generator stamped the pair before its own freeze. Class: any packet generated in the same run as the freeze it should close over.

**N4 — packet charge 1 was not regenerated for the re-dispatch, and the NOTE it promises raced the seat.** `packets/REV-S03-p2-correctness-tests.md:23` tells the seat to take its agent id from "the orchestrator's NOTE comment after DISPATCHED" and to write `comments read through: 1`. I read the ticket at 16:25:07. It had 4 comments: DISPATCHED (grok), the grok CLAIM, SEAT DIED, and DISPATCHED (Opus). There was no NOTE. The NOTE arrived at 16:25:22, 15 s later, as comment 5, and it names `ae1559d39d6236d73`. That matches the id I had already taken from my transcript's first line, so my CLAIM at 16:25:41 ("no orchestrator NOTE comment names it", `comments read through: 4`) was true when I read the ticket and wrong by the time I posted. The count `1` in the packet is stale for a re-dispatched ticket. The ticket title still reads `[grok-4.7]`. Remedy: post the NOTE before the seat launches (the id is known once `Agent` returns, and the seat could wait on it), or put the id in the dispatch prompt. The packet's cursor should say "every comment" and carry no count.

**N5 — the package is pass-1 shaped.** The packet (`:10`) says a later pass gets "the diff since the previous head, the FIX handoffs, the scope, the orchestrator's re-verification, and a pointer to the pass-1 package". `review-packages/S03-p2/README.md:4` gives only the full slice range `776359c3..60993d2db`, and `diff.patch` is the whole slice (24,802 bytes). There is no FIX-range diff, no scope section and no pointer. I derived `98264a5ea..60993d2db` myself: 1 file, +43/−4. The FIX handoff is present.

**N6 — a promoted probe still hard-codes a lane.** `probes/ARCH-PES-S03/enumeration.mjs:8` has `const LANE = "…/.worktrees/pes-s03/dialectical-engine/"`. Charge 5 names this script, and the allowed-list law says promoted probes take their root from `$WORKTREE` or argv. Pass-1 security listed it UNVERIFIED for this reason, and nobody ticketed it. I ran pass-1 correctness's argv-rooted `enumeration.mjs` instead.

## Charges

1. Skills loaded with the Skill tool, in the order below. Comments read: 4 before CLAIM; the orchestrator's NOTE (comment 5) landed between my read and my CLAIM, and it was re-read before this verdict (read through 6). CLAIM posted at 2026-09-25T16:25:07+0300. HEAD `60993d2db`, dirty 0.
2. Package and packets reviewed. Package defects: N5. Packet defects: N3, N4, N6. `commits.txt` has 4 commits; the head is the FIX `60993d2db`. `diff-stat.txt` matches `git diff --stat 776359c3 HEAD -- . ':!.codex/skills'` (2 files, +232/−20). `listeners.txt` matches my start and end snapshots: `:4310` node/95068, `:55432` com.docke/19920, the others empty. FIX handoff line claims were checked against the tree. The helper is at `:397-408`, the source-inventory case at `:409`/`:449`, the exact set at `:457-475`, and the resolver case at `:487`/`:503`/`:505`. The base lines `:425`, `:436-437` and `:466` are the removed or changed lines at `98264a5ea`. The sweep's case lines `:518/529-530`, `:694`, `:712`, `:721`, `:734`, `:758`, `:771` and `:789` all name the cases the handoff says they do. FIX packet charge 2 cites `:453` `closedSet` as the pin. The FIX seat already reported that this is the resolver extractor and that the failing containment was `:437`, so I record the correction and do not re-file it. FIX `SKILLS LOADED`: I checked for each named skill's body phrase in the rollout, after the FIX dispatch (ordinal ≥254): `1% chance`, `Heartbeat Protocol`, `Worker contract`, `Performative`, `NO PRODUCTION CODE WITHOUT A FAILING TEST`, `NO COMPLETION CLAIMS…`, `NO FIXES WITHOUT ROOT CAUSE`. Each phrase appears 2 times. The two `references/` files were checked by path only.
3. Cluster commands, `cluster-commands.sh` via `run-suites.sh` (`cluster-commands.out`):

| command | this pass | frame |
|---|---|---|
| C1 v9:24:0 + baseline:31:0 | v9 rc=0 passed=31 failed=0 (expect 24/0); baseline 31/0; CLUSTER_RED | `frames/C1-gate.out` same |
| C2 v9:28:0 + baseline:31:0 | v9 31/0 (expect 28/0); baseline 31/0; CLUSTER_RED | `frames/C2-gate.out` same |
| C3 v9:31:0 + baseline:31:0, run 1/2/3 | 31/0 + 31/0, CLUSTER_GREEN ×3 | `frames/C3-gate.out` same; FIX three-run table 31/31 ×3 same |

C1 and C2 show RED because each pair is its own cluster's boundary (24, 28) and the head has 31 cases (PLAN §3 note). This is not a disagreement.

4. The added cases were refuted, as shown in the F1 table above: every added case goes RED on its mutant. The widened pin against the RETYPED list: the pin cannot tell under README mutants, and it can tell under source mutants (ruling above).
5. Enumeration: pass-1 correctness's `enumeration.mjs <this worktree>` (`enumeration.out`) gives union 12, E1–E7, each code on a table row. The table's first column (`table-first-column.txt`, 17 codes) equals the pin's expected set (`pin-expected.txt`); `diff` is empty. 8 of the 12 are first-column codes. The other 4 (`SECRET_CUSTODY_INVALID`, `CUSTODY_GROUP_UNRESOLVED`, `PROVIDER_CREDENTIAL_FILE_INVALID`, `PROVIDER_CREDENTIAL_FILE_ABSENT`) are nested reasons in Meaning cells. Guard order: `apps/api/src/main.ts:300` parse, `:305` hosted target rules, `:312` price. `apps/runner/src/main.ts:74`, `:81`, `:87` run in the same order. `packages/providers/src/index.ts:195`/`:278` throw `…PRICE_INVALID` in the parse, and `:687`/`:700` throw only after `mode !== "hosted"` returns at `:683`. The sentence at `README.md:786` states parse before price and nothing more. V-8: all four codes have 0 hits in the README at the head.
6. Acceptance at the head (`accept.out`), compared with `accept-base.log`:
   - Step 2: 2 files, 62/62, rc=0. Base: v9 23, baseline 31.
   - Step 3: the six codes are on rows `:779-784`, plus `:700-701`, `:739-740`, `:786` and `:850-851`. None is in the known-stale list. Base: `:22`, `:25-27`, all in the notice.
   - Step 4: `:850` (member table), `:854` (`runner.env`) and `:855` (`api.env`). Base: `:20` only.
   - Step 5: two bullets remain, KEK and `api.env.example`. Base: five.
   - Step 6: one hit at `:762` in §11, which names `probe_freshness_ms` and recommends no value. Base: rc=1, no hit.
   - Step 7: `git diff --stat origin/dev...HEAD -- apps packages` prints 0 lines. The same pathspec over `origin/dev~200...origin/dev` prints `266 files changed`, so the command is capable of printing. The merge-base is still `776359c38` (`origin/dev` is now `a6d6382ba`).
   - `tests/architecture/vps-deployment-baseline.test.ts`: `git diff 776359c3 HEAD` is 0 lines.
   - `pnpm typecheck` rc=1 with one diagnostic, `apps/ui/lib/v3/answerExport.ts(2,38) TS2835`, identical to `baseline-intake-typecheck.log`. The per-file delta is 0.
   - The four RED-at-base suites (`red-at-base.out`) sit exactly at their intake pairs: dev-api-environment 9/1, dev-api-process 5/5, dev-provider-panel 3/1, t16 20/1. CLUSTER_GREEN.
   - PROGRESS records: the FIX changed only the test, so R3.3, R3.5, R3.7 and R3.8 are as pass 1 verified. At this head I re-checked R3.3's rows `:779-784` and R3.8's byte-identical baseline file.
7. This file. 8. No git writes, no `pnpm install`, no listener started (the NO-TOUCH snapshot is identical at start and end), no real key, no other lens's pass-2 output read, no `boards switch`. The only processes were foreground runs, so there were no PIDs to kill and no pane tabs to close.

## Predictions

The security-data-safety lens will call F1 closed on the same four mutants and will PASS. It will probably not try a second table or a Meaning-cell mention, so N1 will not appear in its verdict. If it does find N1, it will likely call it B, because V-8 is a data-exposure-to-operator rule. It will re-run its byte-compare of the credential-file contract span (`README.md:788-804`) and find it unchanged, because the FIX never touched the README. It may also flag the FIX handoff's statement that the retype "still survives" as an open weakness without running a source mutant. The first thing I would check in its verdict is whether it quotes a source-mutant result for the retype, or repeats the README-only result.

## V-ROW

None.

## UNVERIFIED

- Whether the FIX seat's `references/codex-tools.md` and `writing-good-tests.md` were read as bodies. Only the path appears in the rollout (18 hits each).
- The FIX seat's 27 class-mutant logs under `probes/FIX-PES-S03-p1/`. I did not open them; I re-derived the load-bearing ones independently (the four survivors, both controls, V-8 row insertion, move-to-meaning).
- UI in both modes and the DOM: this slice is `ui: no`. The shared surface is `tests/architecture/vps-deployment-baseline.test.ts`, 31/31 in every cluster run.
- Whether the retyped list would have been RED at base. That needs the base tree, and the source-mutant measurement makes it unnecessary for the ruling.
