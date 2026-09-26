# Case file — ARCH-FIX-PES-S01-p3 (node ARCH-FIX(S01), pass 3 of 3, ticket t_33713b4f)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

**Seat and session.** The original ARCH-PES-S01 subagent (`agent-a03aa13cd0b01b6b1.jsonl`), resumed for its third node. Model per transcript: claude-opus-5-5.
- Timeline: CLAIM 16:25, this report ~16:44 EEST. About 20 minutes of wall-clock.
- The finding: C3-F1 from BUILD S01-C3, reported BLOCKED on `t_b2472fe7`.
- Output:
  - PLAN Revision 3: new step S01-27, plus changes to S01-20, the §3 C3 row, §4 V9/V14/V12(h), §5, §7 and §9 F11, with the trace re-pointed at SPEC-v5.
  - 10 DECISIONS rows and one `V-ROW: NEW`.
  - Probes q1–q4, `pair_check.py` and the re-pointed `trace_check.py`.

## The body — C3-F1, and whose it is

**What happened.** BUILD S01-C3 was green on every S01 case: 16/16, 4/4, 15/15 and 3/3. It still stopped at 722/7. `tests/architecture/p3-production-database-principals.test.ts:600` pairs every `createPool` file under `apps/{api,runner,scheduler}/src` with its `…DATABASE_URL` tokens, and that pair list must equal the P3-01 manifest's. My S01-18 put `createPool(…MIGRATION_DATABASE_URL)` into a new file under `apps/runner/src`, and I never named that manifest.

**Cause: my own plan, pass 1.** I ran the whole `tests/architecture` directory at base and wrote F1: "the directory in every cluster command catches whole-tree laws". That is true, and it caught this one, but only at BUILD. At base the file did not exist, so a law over files the plan CREATES is invisible to a base run. My "defence in depth" gave detection late, not prevention.

**Price.**
- One BUILD pass stopped at S01-20. The codex seat's 22 mutants were done; only its three gate runs were lost.
- This ARCH-FIX node, about 20 minutes.
- A resume of the C3 seat.
- Cheap compared with a REV finding, because the seat stopped at the right moment and named the exact extra pair.

**How it could have been caught at ARCH.** Take every new file a plan creates, and grep the repo's tests for anything that ENUMERATES source files and compares them with a list: `createPool`, `readdir(…recursive)`, `*.manifest.txt`. The p3 audit shows up on the first pattern. It would have cost 5 minutes at pass 1. This is the upgrade below.

## What I nearly got wrong

1. **My trace checker "passed" its mutants for the wrong reason.** After I copied it to SPEC-v5, a sed left the regex on `SPEC-v4`. Every mutant then FAILED, but because every row "had no SPEC line", not because of the defect each one plants. The summary line said "ALL FAILED (checker live)". Only reading the reasons showed the checker was dead. Then one mutant (drop S01-26 from the reverse trace) PASSED, because its anchor text had moved.

   Lesson, now in how I run checkers: **a mutant must fail with the message that names its own defect.** "Some failure" is not evidence.

2. **The whole architecture directory on a mirror** gave 686/32. The mirror has no `.git`, so git-using suites read the main repository. This is a dead end, recorded as q3. The claim "723/6 after S01-27" therefore rests on:
   - p3 audit 2/2 on the mirror, and 1/2 → 0/2 → 2/2 RED/GREEN;
   - the lane's 722/7, whose only non-baseline failure is the p3 pair case.

   It rests on arithmetic plus the six unchanged failure names, not on one run. I say so in the handoff.

3. **Two unverified claims in the principal decision row.** I had written that `publishGeneral` "runs the sealing path with the migrator's ownership" and that "no runtime service principal can publish". I measured neither. Both were removed before handoff and replaced by an explicit UNVERIFIED.

4. **Diff line counts.** I first wrote "12 lines added" for the test file. `git diff --no-index --numstat` measured 11.

## Class sweep (the part a reviewer should check mechanically)

**The class:** "a registry test that enumerates source files and must list a file this slice adds". Members:

1. **The P3-01 pair audit.**
   - The entry CLI is a member: FAILED, fixed by S01-27.
   - The library is not a member (no `createPool`). `pair_check.py` gives 19 = 19 after the fix.
   - `acceptance/` is not scanned.
2. **The shipped-corpus oracle** (`tests/unit/s1-1-depth-contract.test.ts`, with `tests/support/shipped-corpus.manifest.txt`).
   - It is RED at base `776359c3` too: 1009/1, with 3 dev UI paths.
   - This slice adds exactly 2 names, the C2 library and the C3 CLI.
   - It is in none of the 36 suites nor any cluster command.
   - **Named, not fixed.** It is `tests/support/**` and outside C3-F1. The orchestrator must route it, or S01's REV will see it as "not ours" when 2 of its 5 names are.
3. **The whole-tree scanners of `tests/architecture`**: green.

## Dead ends

- The mirror directory run (above).
- `TMPDIR`/`TSX` tricks were not needed here.
- A standalone detector beats Vitest for this law. `pair_check.py` reads the same rule in about 40 lines, runs in under a second, prints the exact extra or missing pairs, and works against the base lane, the S01 lane and mirrors alike.

## Tokens — where they went

1. **Re-loading six skills and re-reading my own PLAN by section: ~25%.** Same-session resume helps with context, not with files. The PLAN is now 828 lines, and every revision pays to find its anchors again.
2. **The mirror (rsync, RED/GREEN, mutants): ~25%.** Needed because the lane was frozen with someone else's uncommitted work. **A frozen dirty lane is the right safety rule, and it makes an ARCH seat's RED→GREEN proof cost a mirror.**
3. **Sweeping the class: ~20%.** q1 found a second member. Worth every token.
4. **Trace-checker repair: ~10%.** Self-inflicted (above).

## Packet — where it was unclear

- The packet names SPEC-v5 as the SPEC of record but does not say it moved line numbers. My PLAN cited SPEC-v4 lines, and the charge "trace S01-27 → R1.2/R1.3" only implies a re-point. I re-pointed the whole trace (5 lines moved by +15).
- **"The C3 command's `tests/architecture:723:6` pair stays the target"** vs "re-run every cluster command": C1/C2's commands still carry `719:6`, which C3's work makes false. I reported them as measured (RED through the directory pair alone) and noted that a re-run of those built clusters reads `723:6`.
- The packet's reading floor did not include `tests/unit/s1-1-depth-contract.test.ts`. I read it anyway for the class sweep (heartbeat 3.2 requires the sweep), and I report that read here.

## Upgrades, ranked by tokens saved

1. **ARCH gate: "created-file registry sweep".** For every file a plan creates, grep `tests/` for enumerating registries (`createPool`, `readdir(…recursive`, `*.manifest.txt`, `git ls-files`) and name each hit in the step that creates the file. This would have saved this node, a BUILD stop and a resume.
2. **Ship detectors as scripts, not Vitest cases, whenever a law is a set comparison.** `pair_check.py` pattern: base, lane and mirror in seconds, with the diff named.
3. **Mutants assert their own failure message.** Add it to the packet template's "checker ships with a failing fixture" clause: it must fail WITH THE REASON IT PLANTS.
4. **A frozen dirty lane should come with a ready mirror script** from the orchestrator (`logs/mirror-lane.zsh`) that excludes `node_modules`, `.git` and `.hermes`, symlinks `node_modules`, and warns that git-using suites are invalid there.
5. **Route the shipped-corpus row** (F11 member 2) before REV(S01). Otherwise it will be litigated as pre-existing.
