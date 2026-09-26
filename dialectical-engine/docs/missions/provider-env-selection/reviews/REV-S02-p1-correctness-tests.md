# REV(S02) pass 1 of 3 — lens correctness/tests — seat REV-PES-S02-p1-correctness-tests

- ticket t_51b0d72f · slice head `dfef0de94` (detached, read-only, own worktree `.worktrees/pes-s02-rev-ct`) · base `776359c3`
- reviewer: fresh blind Claude Opus subagent (agent a7e0677f0df588fee), by V's roster ruling. Started 2026-09-25 16:25:19 EEST.
- probes and logs (all runnable from any worktree through `WORKTREE=<lane dialectical-engine dir>`):
  `P = .hermes/reports/provider-env-selection/probes/REV-PES-S02-p1-correctness-tests/`
- worktree at the end: HEAD `dfef0de94`, `git status --porcelain` empty. Ports 4460–4499 had no listener before or after (`lsof` rc=1).
  NO-TOUCH listeners at the end are the same as the package's `listeners.txt`: 4310 node/95068 and 55432 com.docker/19920, the rest empty.

## VERDICT (this lens, pass 1)

**VERDICT PASS / CONFIDENCE medium / STRONGEST COUNTER:** N3 shows that the slice's own C2 and C3 cluster commands print
`CLUSTER_RED` on correct code when two processes run them at once on this Mac (6 of 12 processes failed at N=4). REV passes
already run lenses that way. A gate that fails correct code under the pass's own parallelism can fairly be called blocking.
I rate it N because every single-process run is green: 3 runs of each cluster, V2, and the acceptance itself. The PLAN
chose `UNVERIFIED port bind-raced` on purpose, and a concurrent acceptance run fails honestly (exit 1), never as a false PASS.

Every finding is non-blocking (N). Each one needs a ticket through the orchestrator.

## What I ran, and what came back (verbatim markers; full logs under P)

| charge | command (script under P) | result |
|---|---|---|
| 3 · V1 three runs | `run-clusters.sh r1/r2/r3` | C1 `CLUSTER_GREEN` ×3, pairs 203/0 · 11/1 · 6/5 · 8/0 · 7/0 · 16/0 · 3/0 · 14/1. C2 `CLUSTER_GREEN` ×3, 6/0. C3 `CLUSTER_GREEN` ×3, 8/0. These are identical to `frames/C1-gate.out`, `C2-gate.out`, `C3-gate.out` and to every row of the three handoffs' three-run tables. No disagreement. |
| 5 · V2 regression (36 + 3) | `run-v2-v4.sh` → `V2-regression.log` | `CLUSTER_GREEN`, 39/39 suites at their pairs. My pair list is byte-identical to `probes/ARCH-PES-S02/REV-regression-pairs.txt`. Failures, all dated at base (intake 2026-09-24 13:32–13:37, re-measured 2026-09-25): DEV-09 ×1, DEV-10B ×5, dev-provider-panel 'loads the exact live CLI targets…', t16 'seeds every ruled algorithm row…', register-support-publication `:475`. None is caused by this slice. The RED-at-base pairs hold: dev-provider-panel 3/1 and t16 20/1 (unchanged); dev-api-environment 9/1→11/1 and dev-api-process 5/5→6/5 (R2.4; the only additions are the slice's new cases). |
| 5 · V4 typecheck | `V4-typecheck.log` | rc=1 with exactly 1 diagnostic, `apps/ui/lib/v3/answerExport.ts(2,38) TS2835`. That equals the base list, so the per-file delta is 0. |
| V5 static (a)–(h) | `run-v5.sh` → `V5.out` | (a) 1 line, at `acceptance/pes-s02-fake-vendor.ts:8`. (b) and (c) print nothing; a control proved the pattern can print (`rejectUnauthorized: true` ×2, `https://` ×11). (d) 2 lines, at `:77` and `:103`. (e) prints 1 line, `acceptance/pes-s02-fake-vendor.ts:12` (the 55432 exclusion datum; ruling below). (f) empty, and the empty-tree control prints 7 files. (g) 13 paths, exactly §5's list. (h) prints 2. Each of the four R2.3 `it()` texts occurs exactly once; they moved from :248/:255/:264/:273 to :262/:269/:278/:287 because 14 import lines were inserted at `tests/unit/v9-deployment-mode.test.ts:22-35`. The texts are unchanged and GREEN. |
| 6 · acceptance §5 steps 2–10 | `accept/run-acceptance.sh` → `accept/acceptance.out`, `accept/pes-s02-accept.log` | Step 2: `Tests  2 passed \| 201 skipped (203)`. Step 3: both lsof lists empty. Step 4: `exit=0`. Log line 1 is `$ tsx --no-cache acceptance/pes-s02-hosted-cli.ts`; the 13 `PES-S02` lines match S02-S18 in order (DNS `127.0.0.1,::1`, PORT-FREE and FAKE-VENDOR both 4460); no other line. Step 7: `0` and `0`. Step 8: last line `PES-S02-ACCEPT: PASS`. Step 9: `1`, and the scratch root starts with `os.tmpdir()`. Port 4460 is not listening after the run. Step 10: before equals after (`cmp`). |
| 6 · untouched paths | `run-untouched.sh` → `untouched.out` | `git diff --stat origin/dev...HEAD` is empty for all 10 §5 forbidden pathspecs (7 files, `deploy/vps`, `pnpm-lock.yaml`, `support-config-principals.test.ts`). Each pathspec was also proved able to print against the empty tree. `origin/dev` is now `a6d6382ba`; its merge-base with HEAD is `776359c3` (see N9). |
| 4 · refutation | `mutate.py` + `mutants/mutants.json` → `mutants/mutants.out`; `upgrade/mutants-c1-upgrade.json` → `upgrade/mutants.out` | Every case the slice ADDED turned RED under a mutant of the product line it pins (24 of 24; table below). Every restore was followed by `git status --porcelain`, which showed only my temporary fixture while it existed, then empty. |
| 8a F10 | `f10/run-f10.sh` → `f10/f10.out` | The runtime module graph of `acceptance/pes-s02-hosted.ts`, the CLI's only import, is 122 resolved URLs. It contains no `embedded-postgres`, `async-exit-hook`, `standing-db`, `pg` or `testDatabase`. The `@debateai/db` import at `pes-s02-hosted.ts:9` is `import type` and is erased; `packages/db` never loads. The `beforeExit` and `exit` listener counts are 0 before and after the import. |
| 8c exit rule | `exit-rule/run-exit-rule.sh` → `exit-rule/exit-rule.out` | Run through real pnpm with `FORCE_COLOR`/`NO_COLOR` unset (0 ESC bytes in every log). PASS gives `exit=0` and last line `PES-S02-ACCEPT: PASS`. UNVERIFIED (my own listener held all 40 candidate ports; killed by PID) gives `exit=1`, with `PES-S02-ACCEPT: UNVERIFIED port none-free` on the line before `[ELIFECYCLE]`. FAIL (temporary table mutant) gives `exit=1`, with `PES-S02-ACCEPT: FAIL refused-price` before `[ELIFECYCLE]`. A thrown run (temporary mutant) gives `exit=1` with `PES-S02-ACCEPT: FAIL internal`; the thrown message is not printed (0 hits). Every scratch root was gone afterwards. |
| 8d V-16 | `v16/REV-PES-S02-p1-ct-v16.ts` → `v16/v16.out` | A lookup that never calls back leaves `runHostedAcceptance` pending after 3000 ms (`after 3000 ms: pending`). `resolveAll` (`pes-s02-hosted.ts:100-107`) contains no timer or `AbortSignal`, and there is no `dns.promises`. The V-16 default holds. |
| 8e fake vendor | `vendor-auth/REV-PES-S02-p1-ct-vendor-auth.ts` → `vendor-auth/vendor-auth.out`; diff greps | Returned 401 for: absent, empty, `Bearer`, a wrong token, lowercase `bearer`, the token without its scheme, token+suffix, and `Basic`. The exact literal gets 200 on POST and 404 on GET. A trailing space gets 200, because the server's HTTP parser strips trailing whitespace (RFC 9110 OWS); the vendor never sees a different value. No 401 body contains the token. The added lines of the diff contain no real vendor host (`openai.com`, `anthropic.com`, `api.x.ai`, `openrouter`, …) and no key shape (`sk-…`, `xai-…`, `AKIA…`). Hosts present: `api.localtest.me`, `127.0.0.1`, `localhost` (test support only). The package `diff.patch` is byte-identical to `git diff 776359c3..HEAD`. |

### Refutation matrix — the cases the slice added (each mutant: RED, then restored from captured bytes, then `git status --porcelain`)

| case (file) | mutant of the product line it pins | RED |
|---|---|---|
| v9 (a) API declares local | `dev-api-environment.ts:547` value row removed / value `""` | (a) 1 failed, 202/203 |
| v9 (b) runner declares local | `dev-runner-process.ts:86` removed | (b) 1 failed |
| env (a) upgrade | `:458-464` predicate → `false` | (a) RED |
| env (b) drift refusal (`DEV_API_ENVIRONMENT_DRIFT`; guards before it: lock, byte-equal reuse, the four shipped predicates, then the new one) | predicate → `true`; hosted-row admitted | (b) RED |
| process refusal + local positive control (`DEV_API_PROCESS_ENVIRONMENT_INVALID` from `validateExactEnvironment` after the custody checks) | `dev-api-process.ts:214` entry removed; value → `hosted` | new case RED; the positive control makes the hosted mutant fail too |
| fake-vendor 1–6 | SAN widened · body `OK.` · absent admitted · `Bearer *` admitted · agent with no CA + `rejectUnauthorized:false` · excluded set ignored · `autoSelectFamily:false` | each target case RED, 5/6 |
| hosted T1–T8 | refusal id renamed · custody path printed · `vendor.close()` removed · admission check removed · message compare removed · DNS error falls back to 127.0.0.1 · openssl-missing → FAIL · Bearer arm removed | each target case RED, 7/8 |

Every rejection case in the refusal table names its code AND the guard stage it throws at: deployment, deployment, parse,
credentials, priced. T1 asserts both. The stage check itself is covered in N2.

## Findings

**N1 — three of the five upgrade paths the slice composes have no case (`apps/runner/src/dev-api-environment.ts:461`, `:463`, `:464`).**
`isExactEnvironmentWithoutDeclaredDeploymentMode` re-uses five shipped predicates. The slice's case (a) exercises only
`declared === expected` (`:460`) and the legacy-timeout path (`:462`). Mutants U1, U2 and U3 each delete one disjunct, and
every slice suite stays at its pair: dev-api-environment 11/1, v9 203/0. My probe cases (temporary fixture
`tests/rev-pes-s02-ct-upgrade.test.ts`, source `P/upgrade/rev-pes-s02-ct-upgrade.test.ts`) turn RED:
- P1 is a base-era `api.env` (no mode row) whose relay credentials were refreshed on the same boot. The panel is
  handshake-derived and changes on each start, so this is the most likely real first boot after S02 lands. With U1 applied
  it goes `DEV_API_ENVIRONMENT_DRIFT` and the dev stack refuses to start.
- P2 is a pre-Support-target file.
- P3 is a forward register publication.

The product is correct at the head: the probe is 4/4 green (`upgrade/head-run2.log`). The regression guard is missing.
P4 confirms that a hosted row (at the end or at the top), a local row out of place, no trailing newline and a duplicated
row all drift with the bytes kept. The `:458` guards are redundant with the composed predicates (U4, U5 and U6 are
equivalent mutants), so they are not findings.
Remedy: add P1–P3 to `tests/integration/dev-api-environment.test.ts`. The pair becomes 14/1, which is a PLAN §3/§4 edit.

**N2 — outcome branches with no case (class: a classification branch whose outcome no test observes).** Members, each a
mutant that survives at 8/8 or 6/6:
- `pes-s02-hosted.ts:287` `vendor-requests` FAIL (X1 survives; T1 pins only the printed counts line)
- `:188` `dns no-ipv4-loopback` (X2)
- `:211` `trust-seam handshake-*`: flipping it to FAIL survives (X3). This is the R2.5b UNVERIFIED step that SPEC-v4 §5 step 8 names; T7 covers only the openssl side of R2.5b.
- `:219` `trust-seam default-fetch-accepted` (X4)
- `:196` `port none-free`: flipping it to FAIL survives (X5). The branch works end to end (8c above).
- `:195` `port lsof-unavailable`, `:203` `port bind-raced`, `:175` `openssl-rc-N`: by inspection, no case reaches them
- `:256` the `stage !== refusal.stage` arm (X9). T5 pins the message arm through a `refusalCases` override; no override pins the stage arm.
- `:235` the custody-layout self-check: deleting it survives (X6). Its production side is pinned: X7, a custody directory at 0755, turns T1, T4 and T5 RED.
- `pes-s02-fake-vendor.ts:80` compares case-sensitively, and no case sends a case-variant (F3c survives)
- `pes-s02-fake-vendor.ts:34` the `port <= 4400` floor (F5b survives; case 5's candidate list has no sub-4400 port outside the excluded set)

The deps already allow `portCandidates`, `isPortListening`, `lookup` and `refusalCases` to be injected, so each branch can
be driven in-process. Remedy: add cases, or record a PLAN decision that they stay unpinned.

**N3 — the fixture suites fail correct code under concurrent processes.** `pickFreePort` (`pes-s02-fake-vendor.ts:29-40`)
measures with lsof and then binds. On `EADDRINUSE` it gives up (`:100` → `PES_S02_PORT_BIND_RACED`) instead of trying the
next measured-free candidate. The "released" assertions read the global port state (`pes-s02-fake-vendor.test.ts:131`,
`:138`; `pes-s02-hosted.test.ts:83`). Measured by `concurrency/run-concurrent.sh` (N=4 processes × 3 rounds): **6 of 12
processes failed**, with `PES_S02_PORT_BIND_RACED`/`EADDRINUSE`, `expected 'UNVERIFIED' to be 'PASS'`, and
`expected true to be false` on the release assertions. Single-process runs are 100% green. This pass runs two lenses in
parallel on this Mac against the same 4460–4499 range.
Remedy (PLAN S02-S14 change): retry the next lsof-measured candidate on `EADDRINUSE`, which keeps R2.5a's "measured free".
Assert release as "this process holds no listener on the port" (`lsof -a -p <pid>`), not as the global state.

**Packet and package findings (against the orchestrator):**
- **N4 — the preamble range is mislabelled.** `packets/BUILD-S02-C2.md:10` gives PLAN.md `281-495` and `BUILD-S02-C3.md:10` gives `281-632` as the "§6 preamble". The preamble is `PLAN.md:281-286` (C1's packet says `281-287`). This made C2 and C3 read their predecessors' steps, a 3.8 violation. Class: the generator's preamble range. C1 is correct; C2 and C3 are wrong. C3's seat already reported it; the class needs the generator fix.
- **N5 — a truncated allowed entry.** `packets/BUILD-S02-C3.md:22` reads `package.json (one ·`: the backticked text was dropped. The meaning ("one `scripts` entry") survives only in PLAN §5.
- **N6 — the PID-file path contradicts `allowed`.** The review package README's dev-stack recipe tells a lens to write PID files to `.hermes/reports/provider-env-selection/logs/<seat>.<proc>.pid`. That path is outside this packet's `allowed` (§2). I wrote `P/exit-rule/REV-PES-S02-p1-correctness-tests.portblock.pid` instead.
- **N7 — duplicate charge number.** The packet numbers two charges "8." (`:30`, `:32`). (Retracted after re-reading the ticket: the NOTE naming my agent id, comment 2, arrived AFTER my first read at 16:25, which showed 1 comment, and BEFORE my CLAIM. It names a7e0677f0df588fee, the same id I had measured from `subagents/`. The race is benign.)
- **N8 — the gate frames are not in the record, and the freeze pair is too wide.** `review-packages/S02-p1/frames/` is untracked (`??` in the main tree) and is in neither freeze `a7ab744ec` nor `a7bc68425`, so the gate frames exist on disk only; the README's quote is the one committed copy. The packet's freeze pair `0e931c00a..a7ab744ec` diffs 498 files and +132,510 lines across S01, S02 and S03 records, so it is not a pass-scoped record.
- **N9 — the base fact is stale.** COMMON §6 says the base is "`origin/dev` @ 776359c3". `origin/dev` is now `a6d6382ba`: 53 commits later, touching 4 files the slice reads or edits: `packages/register/src/runtime-environment.ts`, `packages/providers/src/index.ts`, `packages/crypto/src/index.ts` and `package.json` (a new `register:publish-hosted` script in a different hunk from the slice's). Together that is +78/−12 (`git diff --stat 776359c3 origin/dev -- …`). Every proof in this review holds at `776359c3`. Before V's merge, the slice needs the V2 list and the acceptance re-run on a rebase.

**Author SKILLS LOADED check:**
- C1 and C2 name the full worker floor, including `systematic-debugging`; C2 hit a bug (TS2339) and loaded it.
- C3 omits `systematic-debugging`, which is conditional ("any bug"), and C3 reports no bug.
- No fabrication found. I cannot check the lines against the skill bodies in their transcripts; that is the orchestrator's check.

## Rulings the packet asked this lens for

- **8a / F10 (t_758b03f9).** The measurement found no embedded-postgres in `pes:accept-hosted`'s graph, and no exit-code
  reset. **Gate V5(e) must name them**, because a future direct import would otherwise pass the gate. A static grep over
  `acceptance/pes-s02-*` cannot see transitive imports, so the transitive property is proved by the module-graph probe
  (`f10/run-f10.sh`: "matches … (none)") as a companion gate, V5(e2).
  VERDICT name them + add e2 / CONFIDENCE high / STRONGEST COUNTER: the static grep can never prove the transitive property
  alone; e2 needs node's `module.register`, which is deprecated on node 26 (`DEP0205`, still works); `registerHooks` is the
  replacement.
- **8b / V5(e) final text** (read through the BUILD S02-C2 fold at `DECISIONS.md:140-142`). The 55432 literal at
  `pes-s02-fake-vendor.ts:12` is exclusion data. The gate as written condemns correct code (it prints 1 line). Final text:
  `git grep -n -E 'from "pg"|createPool|startTestDatabase|embedded-postgres|standing-db|testDatabase|import \{[^}]*\} from "@debateai/db"|55432' -- 'acceptance/pes-s02-*' | grep -v -F '3000, 3001, 8790, 4310, 8791, 8792, 8793, 8795, 8796, 55432, 4455'`
  → **no output**. Measured by `gate-v5e.sh` → `gate-v5e.out`: at the head it prints nothing. It prints one line for each of
  three temporary mutants: a `…:55432` URL, `import "embedded-postgres"`, and a value import from `@debateai/db`. The
  `import type` from `@debateai/db` stays lawful. The exclusion is matched by row CONTENT, never by line number (TRAPS
  Variant 6).
  VERDICT adopt / CONFIDENCE high / STRONGEST COUNTER: any edit to the excluded-port row, even a reorder, makes the gate
  print. Given the gate's purpose, that is acceptable.
- **8c** holds (table above). **8d** holds. **8e** holds.

## Predictions about the other lens (security/data-safety)

- It will pass the stdout law (R2.9). It will flag at least one of: the fake TLS private key and cert lying in
  `<scratch>/tls` for the run's lifetime; no SIGINT handler, so a V-16 DNS hang followed by Ctrl-C leaves the scratch root
  in `$TMPDIR` (not executed here; the custody directory does not exist yet at the DNS stage); or the default-fetch negative
  control connecting to `https://127.0.0.1:<port>` outside the trusting seam.
- If it ran its fixture suites at the same time as mine (16:26–16:45), it may have printed a spurious C2/C3 `CLUSTER_RED`
  or an `UNVERIFIED port bind-raced` (N3). I would check that first before trusting any RED from it on those suites.
- It will likely also rule V5(e) lawful as exclusion data. I expect it NOT to have noticed that the CLI's module graph is
  free of embedded-postgres only at runtime, since the grep proves nothing transitive.

## V-ROW

None.

## UNVERIFIED

- Both-modes and browser measurement: S02 is not a UI slice (no DONE.md), so neither applies.
- "One mount of every surface this slice shares with another slice or the app shell": I did not start the dev stack. §5
  forbids touching :3000/:8790, and R2.11 forbids starting services. The shared surface (`apps/runner/src/dev-*`) was
  exercised only through its suites, V2, and my probe.
- The slice is not re-proven at the current `origin/dev` `a6d6382ba` (N9).
- `port lsof-unavailable`, `port bind-raced` (single process) and `openssl-rc-N` were not driven (N2, by inspection).
- Interrupt behaviour (SIGINT mid-run) was not executed.
- I did not run the S01 surface's own suites; §5 names it but lists no paths.
- The authors' SKILLS LOADED lines cannot be checked against the skill bodies in their transcripts.
