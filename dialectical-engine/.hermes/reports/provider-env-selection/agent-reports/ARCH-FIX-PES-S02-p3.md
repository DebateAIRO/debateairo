# Self-report: ARCH-FIX-PES-S02-p3 (node ARCH-FIX(S02), pass 3 of 3, ticket t_50d2d8d3, 2026-09-25)

This is agent a19b961f9def28575 (claude-opus-5-5), resumed for its third node on S02. The lane `.worktrees/pes-s02` is at 776359c38, dirty 0 at start and at end.
- **Input:** V's ruling V-12/V-13, "Exit 1 on FAIL" (`V-DECISIONS-PACKET.md:24`), as SPEC-v4 §5 steps 4 and 8 word it.
- **Output:** PLAN.md Revision 3 (1003 lines) and a DECISIONS block of 7 rows, one of them a correction.
- **Probes:** `probes/ARCH-FIX-PES-S02-p3/`.
- **Duration:** about 35 minutes of wall-clock.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## 1. The body: why this node exists at all

**Cause.** At pass 1 I recommended "exit 0 on every outcome" so that the last stdout line would always be the verdict. That fitted the v3 SPEC's wording, "the run's LAST stdout line". I optimised for the SPEC's sentence, not for what a person running a CLI expects: a non-zero exit on failure. V ruled against it. REQ then had to reword the SPEC (step 8 now reads the line above `[ELIFECYCLE]`), and this node re-plans S02-S19.

**Price.** One V question, one REQ-FIX node, one ARCH-FIX node (this one) and one extra ARCH-REV surface.

**The cheaper route.** At pass 1, I should have measured both options through pnpm and written the SPEC change as the recommendation: exit 1, with step 8 reading the line above pnpm's trailer. A V-ROW that recommends bending the product around a SPEC sentence should instead recommend changing the sentence. The strongest counter in my own V-ROW said exactly this ("a non-zero exit is the universal failure signal"). REQ-FIX p4's self-report names the same failure: the default did not follow the side the strongest counter supported.

## 2. What I nearly got wrong in THIS pass

1. **A mutant that never existed.** My first self-check mutant script asserted on a fixture row that does not contain `price_micros` (refused-price has no price, by design). The Python step died. The self-check then ran against a missing file and printed "GAP" and a blank `defined=`, which looked like the detector firing. I caught it only because the Python traceback was in the output. Fix: `set -eu -o pipefail` plus a `mutant written: <n> lines` guard. A mutant run that reports FAIL on a file it never built is fabricated evidence.
2. **A symlinked `tsx`.** My first real-pnpm run of the CLI block symlinked the lane's `.bin/tsx`. The pnpm shim resolves from its own `$0`, so every run crashed with MODULE_NOT_FOUND. The verdict column showed `Node.js v26.9.0`, and "exit=1 HOLDS" for FAIL, which was right for the wrong reason. I read the log before trusting the table. Fix: a wrapper script that `exec`s the lane's shim by absolute path.
3. **Miscounting my own sweep.** I wrote "16 found" into DECISIONS before counting; it was 19. The block is append-only, so it now carries a correction row. That is the second correction row I have appended in two nodes. The fix is mechanical: count first, then write.
4. **"EXACTLY 14 lines".** My first S02-S19 Done-when pinned the log to 14 lines. A review seat's environment has emitted node's `NO_COLOR`/`FORCE_COLOR` warning into a merged log (`probes/ARCH-REV-PES-S02-p1/dns-callback.log`). The gate now pins line 1, the `PES-S02` lines and the last line, and allows only `(node:` / `(Use ` lines otherwise. I could NOT reproduce the warning with `node -e` (`color-warning.out`), so the tolerance rests on the reviewer's log, not on my measurement.

## 3. Dead ends

- **Exporting `exitCodeFor(outcome)` plus a 9th S02-S17 case.** It is rejected in DECISIONS: it moves the 7-name gate, the C3 pair and the RED count to kill a mutant that an exact-line gate kills for free.
- **Running a FAIL through the real CLI inside the suites.** That needs public DNS, which the suites are designed never to touch.
- **`ln -s` of a pnpm `.bin` shim** (see §2).

## 4. Where THIS packet was unclear

- Charge 2 says "start from REQ-FIX p4's list and CHECK it". The list named 5 members; the class has 19. The packet cannot know that, but it could name the class ("every sentence that cites SPEC-v3 as live, or describes steps 4 or 8") instead of a list. A list propagates its omissions, which is the packet's own warning in §3.
- Charge 3 says "keep Revision 2's text intact except where the exit rule forces a change". Re-pointing the SPEC of record (charge 2) is not an exit-rule change, but it is required. I read charge 2 as overriding charge 3 for SPEC-version citations only; each such edit is listed in the Revision 3 line.
- The `inputs` name "the reviewer's probes REQ-FIX-PES-p4/ (if present)". They are present, but they are REQ's checks, not a reviewer's. I read the directory listing and reused the stub idea, running it through real pnpm.

## 5. Upgrades, ranked by tokens saved

1. **A V-ROW's recommended default must be executed both ways through the real toolchain before it is written.** My pass-1 V-ROW measured pnpm's streams but never ran "exit 1 + read the line above". That run would have made the SPEC change the recommendation and avoided a V question, a REQ-FIX node and this node.
2. **Mutant scripts fail closed.** Use `set -eu -o pipefail`, and assert the mutant file exists and differs from the original before running the checker. This is a TOOLING-TRAPS entry; it nearly shipped fabricated evidence here.
3. **Code blocks in plans are hashed.** Store the sha of each block a probe ran (E9 here), so a later edit to the block without a re-run fails a detector.
4. **Packets name defect CLASSES, not member lists.**
5. **Count before you write an append-only row.**

## 6. One-prompt machine

Every rework on this slice (B1, N1, N2, this exit rule) had the same root: a sentence written without executing its claim on the real toolchain. For each claim type, the probe that would have caught it is now in the probes dirs:
- the pnpm stream probe;
- the lookup-shape probe;
- the CLI-block run;
- the anchor resolver.

Bundle them as the ARCH template's standard pre-READY suite, and this slice's three ARCH-FIX nodes become zero.
