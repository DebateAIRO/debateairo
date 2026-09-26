# Self-report — REV-PES-S02-p1-correctness-tests (REV(S02) pass 1, lens correctness/tests, t_51b0d72f)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

**Session:** Opus subagent a7e0677f0df588fee, 16:25–~16:50 EEST, about 25 minutes wall-clock. **Verdict:** PASS, with 9 N findings.
**Artifact:** `docs/missions/provider-env-selection/reviews/REV-S02-p1-correctness-tests.md`.

## The case file

**1. The builders' refutation matrices answered the wrong question.**
- Cause: the three BUILD seats wrote 18 + 27 + 18 mutants. Each asked "does my case bite?" None asked "which product line has no case at all?"
- My survivors are all of the second kind:
  - three of the five upgrade disjuncts (N1), one of them the realistic first-boot path;
  - eight outcome branches in the hosted acceptance (N2).
- Price: none this pass, because the product is correct. The next person who deletes a "redundant-looking" disjunct at `dev-api-environment.ts:461` breaks every dev's first boot after S02, with every gate green.
- Upgrade: the worker contract's refutation duty should add one line: "for every `||`, `if … stop`, `catch → classify` in YOUR production diff, one mutant; a survivor is either a new case or a DECISIONS row." It costs about 10 mutants per cluster, roughly 3 minutes of vitest.

**2. The packets never set a concurrency parameter, and the pass itself runs concurrently.**
- Cause: the fixture measures a port with lsof, binds it, and gives up on the race. The suites then assert on global port state.
- Nobody ran two processes at once, yet REV runs two lenses at once on the same 4460–4499 range.
- Measured: 6 of 12 processes failed at N=4 (N3).
- Price: potentially one spurious REWORK or a BLOCKED lens, which is a whole seat cycle (~30–60 minutes, ~1M tokens), on correct code.
- Upgrade: the gate recipe should either give each parallel lens a disjoint candidate range through an env or dep, or require "retry next candidate". A three-run table could add "one run with N=2 concurrent" for any suite that binds a port.

**3. Packet generator defects recur as a class.**
- The "§6 preamble" range in the C2 and C3 packets swallowed the predecessor clusters (N4).
- A backticked phrase was eaten from C3's allowed list (N5).
- The package README tells lenses to write PID files outside their `allowed` (N6).
- There are two charges numbered 8 (N7). The agent-id NOTE was posted after the seat launched; a benign race.
- Each costs a seat a few minutes of doubt. The preamble one cost C3 real reading: about 350 PLAN lines, roughly 15k tokens.
- Upgrade: `packet-check.sh` should assert that (a) the preamble range ends before the first `### S02-C` heading, (b) no `(`…`·` appears with an unclosed paren, (c) every path a README tells a seat to write is under that seat's `allowed`, and (d) charge numbers are unique.

**4. The recorded evidence is not in the record.**
- `review-packages/S02-p1/frames/` is untracked in the main tree (N8), so the evidence a lens compares against exists only on disk.
- The freeze pair the packet stamps (`0e931c00a..a7ab744ec`) spans 498 files across three slices, so "what changed in this pass" is not recoverable from it.
- Upgrade: `freeze.zsh` should `git add` the package `frames/`. The packet generator should stamp the freeze pair per slice, meaning the previous freeze that touched THIS slice's records.

**5. The base moved under the mission.**
- `origin/dev` is 53 commits past `776359c3` and touches 4 files the slice reads or edits (N9).
- Nobody re-measured COMMON §6's base row since 13:34 on 09-24.
- Price: deferred, a rebase and re-proof before merge.
- Upgrade: the orchestrator's review-package assembler should print `git rev-parse origin/dev` next to the base, plus a `git diff --stat base origin/dev -- <slice paths + read surface>` line. That is one command, and it makes the drift visible at REV instead of at V's merge.

## What I nearly got wrong

- I nearly accepted "trailing space → 200" as a vendor defect. It is the HTTP parser stripping OWS, so the value the server compares is the exact literal. I verified this by reasoning, not by a raw socket; the artifact says so.
- My first upgrade probe run failed 3/4 with `DEV_DEPLOYMENT_REGISTER_RECEIPT_CUSTODY_INVALID`. That was my own leaked `DEBATEAI_DEV_CUSTODY_ROOT` between cases, not a product bug.
- The same failure leaked 3 `debateai-s02-dev-api-env-*` temp roots, because the helper's `mkdtemp` root is never returned when a later step throws. I found and deleted them at cleanup; they held only fake fixture credentials.
- Lesson: check `$TMPDIR` for your own prefixes before handoff.
- I nearly reported U4–U6 (the `:458` guards and the equality disjunct) as unpinned. They are equivalent mutants: the composed predicates already refuse or accept the same inputs. My P4 variants prove it.

## Dead ends (so nobody re-derives them)

- `vitest.config.ts` sets `fileParallelism: false`, so `pnpm test` alone never shows N3. It needs two processes.
- F10 cannot be settled by grep. Use the loader-hook probe `f10/run-f10.sh`: `module.register` works on node 26 with a DEP0205 warning.
- The UNVERIFIED exit through real pnpm needs no product mutant. Occupying 4460–4499 with your own listener (killed by PID) drives `port none-free` honestly.

## Where THIS packet was unclear

- Charge 1 says the agent id is named by "the orchestrator's NOTE comment after DISPATCHED". The NOTE landed after my first read of the ticket (1 comment then), so I measured the id from `subagents/`. It matched. The seat reads the ticket before the NOTE is posted, and the dispatcher should post the NOTE before launching the seat.
- §2 `allowed` omits the `logs/<seat>.<proc>.pid` path that the package README orders (N6).
- Charges 3 and 5 both say "re-run every cluster command", so they are one job. And "every suite the SPEC of record's §4 names at its pair" versus "PLAN §4 V2" means the same 39 suites said two ways.
- "One mount of every surface this slice shares with the app shell" conflicts with §5 and R2.11, which forbid starting services. The packet should say "N/A for a non-UI, no-service slice".

## Upgrades ranked by tokens saved

1. `packet-check.sh` assertions (a)–(d) in item 3. They kill a recurring class; about 15k tokens and a doubt cycle per affected seat.
2. The refutation line for "branches with no case" in the worker contract (item 1). Survivors are found by the author, not by REV, which saves a FIX node (~0.5–1M tokens) whenever REV would have made it blocking.
3. A concurrency run in the gate for port-binding suites (item 2). It prevents a spurious REWORK, about 1M tokens.
4. Base-drift line in the review package (item 5). It is cheap, and it saves a surprise rebase round at V's gate.
5. Freeze the package frames (item 4). It makes REV's "disagreement with a frame" charge checkable from git.

## One-prompt machine

- The review itself is almost mechanical. `run-clusters.sh`, `run-v2-v4.sh`, `run-v5.sh`, `run-untouched.sh`, `accept/run-acceptance.sh`, `exit-rule/run-exit-rule.sh`, `f10/run-f10.sh` and `mutate.py` + JSON all take `WORKTREE` and run unchanged from any worktree.
- If the orchestrator shipped a REV "harness" (these scripts, generalised with a slice's cluster table as input), a correctness lens would spend its tokens only on picking mutants and reading survivors. That is where every finding in this pass came from.
