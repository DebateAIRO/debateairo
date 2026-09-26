# Case file — ARCH-FIX-PES-S01-p2 (node ARCH-FIX(S01), pass 2 of 3, ticket t_bba02e7f)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

**Seat and session.** The original ARCH-PES-S01 subagent (`agent-a03aa13cd0b01b6b1.jsonl`), resumed. Model per transcript: claude-opus-5-5.
- Timeline: CLAIM 13:09:38, this report ~13:31 EEST. About 22 minutes of wall-clock.
- Inputs: V's rulings (V-10; V-12/V-13), SPEC-v4, and REQ-FIX p4's list of PLAN steps to change.
- Output: PLAN Revision 2 and 20 DECISIONS rows plus one `V-ROW: NEW`. The probes are d0–d6 plus a trace checker, all under `probes/ARCH-FIX-PES-S01-p2/`.

## The bodies — two defects that every review so far had passed

**1. SPEC-v4 R1.12's role seed cannot run.**

*The claim.* SPEC-v4 says to publish "[the two rows]" with `publishReplacementRegisterFixture`. The database refuses it with `REGISTER_REQUIRED_ROW_MISSING:envelope:envelopeFormulaInputs`. The trigger is in `migrations/0061_algorithm_publication_profiles.sql:17-28`: any publication holding one required row gets the `algorithm` profile, and that profile requires all 17 rows. I measured the refusal on base 5 and on base 4 (probe d2).

*Cause.* REQ-FIX p4 wrote the seed from reading the code, and its own self-report marks it UNVERIFIED ("read, not run"). The node that wrote the requirement had no database run in its contract, so the SPEC froze with an untested write in it.

*Price.*
- It got past one REQ node and was caught here, at ARCH-FIX.
- It raises a `V-ROW: NEW` → V question → SPEC-v5 sentence.
- Without the dry run, BUILD C4 would have gone RED on a SPEC-correct build. That would have cost a BUILD pass and a FIX pass, about 2 seat-hours, and ended in the same V question.

*What caught it.* Running §5 end to end with the reference code (d1) before writing a single step. The first d1 run printed `PES-S01 CASE role-provider-dropped PES-S01-CASE-ERROR`.

*Remedy measured.* d4 publishes R1.12's two rows plus the other 15 rows from the shipped `buildAlgorithmRegisterRows`:
- 17 rows, which gives version 6 with 49 rows;
- the hosted publish on it is refused with `…:evaluatorRoleRef`;
- a control seed publishes 49 → 49, with the role rows byte-equal.

**2. The pass-1 plan would exit 0 on every FAIL. I planned it, and ARCH-REV p1 passed it.**

*The defect.* `embedded-postgres` imports `async-exit-hook`, and that module's `beforeExit` listener calls `process.exit(0)`. So `process.exitCode = 1` is erased once the database has been started. Measured in d3: rc=0 with the database, rc=1 without it, the same result with and without pnpm.

*Why nobody saw it.* Pass-1 K1 asserted exit 0 on PASS only. The `p8` dry run of pass 1 ended in PASS. So V-12/V-13's "exit 1 on FAIL" would have been false in production, with every case green.

*How it surfaced.* By accident. The first d1 run printed FAIL but the shell said `rc=0`, and I did not wave that off.

*Remedy and proof.*
- S01-23 ends with a flushed `process.exit(code)`.
- K6 spawns the real entry with `TMPDIR=/nonexistent` and `TSX_DISABLE_CACHE=1`, expecting UNVERIFIED and exit 1 (d6).
- The mutant m3, which uses `exitCode`, exits 0 there. I watched it fail.

*Price if missed.* V runs the acceptance, sees a FAIL line with `exit=0`, and bounces the slice at TEST(S), the most expensive gate in the fleet.

## What I nearly got wrong

- **S01-26's "RED when omitted".** I first wrote G12–G16. G12 (it publishes either way) and G16 (an earlier guard fires) pass without the check, so the correct RED set is G13–G15. A reviewer running the RED frame would have flagged it.
- **K6's fault injection.** With `TMPDIR` alone, tsx dies creating its cache directory (`ENOENT mkdir …/tsx-501`) before any product code runs. The test would have "passed" for a stack trace. Only `TSX_DISABLE_CACHE=1` makes the injection reach `startTestDatabase`.
- **The roster directory.** The pass-1 entry ran `mkdtemp` before the database started. Under a bad TMPDIR, the roster directory fails first, and the UNVERIFIED outcome is unreachable. It is now created lazily.
- **A "the only seed" overclaim** in the V-ROW verdict. Corrected to "the smallest seed that keeps R1.12's two rows byte for byte".

## Dead ends — do not re-derive

- **Importing the dev publisher's role check.** It violates R1.6 (a `dev-` module in the graph), and it refuses on `kind`/`provisional`/key count, which R1.14 does not state.
- **Validating role rows with the register's zod `rowSchemas`.** It is not exported (`algorithm-policy.ts:386`; REQ-FIX p4 found the same).
- **`acceptance/seed-register.ts`'s algorithm rows.** They carry the ceremony's refs, so R1.12's values would need overriding anyway.
- **A test-only env switch in the entry to force FAIL.** That is product code shaped by its test.
- **zsh `echo ======`.** `=` expansion strikes again, my second hit in two nodes (REQ-FIX p4 hit it too). TOOLING-TRAPS still lacks it.

## Where the tokens went — ranked

1. **Probes: ~40%.** d2/d4 cover the register trigger, d3/d6 the exit code, d5 the mutants, and d1 was run twice. Every one earned its cost. The two defects above are each worth more than this whole node.
2. **Reading the migrations: ~15%.** 0050, 0061, 0064 and async-exit-hook, none of them named in the packet. The packet's reading floor could not have named them: the defect lived outside everything any SPEC cited. That is the argument for executing rather than reading.
3. **PLAN edits via an exact-string editor: ~25%.** Every edit asserts that its anchor occurs once, which is safe but verbose. A plan with stable per-step anchors (one file per cluster) would make a revision a file swap.
4. **Re-loading the skill floor and re-reading my own PLAN: ~10%.** Same-session resume saved the design context. It did not save the file contents, which I had to re-read by section.

## Packet — where it was unclear

- **"Re-run every cluster command AS IT NOW STANDS"** with C1 built. For C2–C4 it is unclear whether to run the NEW counts (37/16/9) or the base omission. I ran the base-omission form (created paths omitted) and recorded the final pairs. A packet line should say so.
- **The packet treats V-10 as fully specified by SPEC-v4.** It gives no hint that R1.12's seed was UNVERIFIED, although REQ-FIX p4's self-report says so in §3. The packet should lift every UNVERIFIED line of its predecessor's report into the charges.
- **The rulings range is cited two ways.** The packet cites `V-DECISIONS-PACKET.md:20-28`, while SPEC-v4 cites `:19-27` and `:22`/`:24`. I measured: the rulings table is at 20-28 in the current file. Cosmetic, but it costs a re-read.

## Upgrades, ranked by tokens saved

1. **A REQ node that changes an acceptance step must RUN it against a stub before freezing, or its SPEC says UNVERIFIED in the requirement itself.** That would have saved the V-ROW, a SPEC-v5 and this node's d2/d4. REQ-FIX p4 ranked the same upgrade #1 for the exit rule: the class is "a SPEC sentence about runtime behaviour that nobody executed".
2. **Every acceptance entry gets a mechanical exit-code test (a non-PASS run through the real entry).** A PASS-only K1 is a decoration. This is the class behind F10, and every mission's acceptance that imports `embedded-postgres` has it. The S02 entry should be checked NOW: V-12/V-13 made S02 exit 1 on FAIL too. This is a cross-slice sweep member I could not reach (outside my floor), so it goes in the handoff as UNVERIFIED.
3. **TOOLING-TRAPS headings to add:**
   - "`async-exit-hook` erases `process.exitCode`";
   - "tsx caches under TMPDIR — `TSX_DISABLE_CACHE=1`";
   - "zsh `=word` expansion in echo".
4. **Plans as one file per cluster.** A revision then touches only the clusters it names, and a BUILD seat reads exactly its file (heartbeat 3.8).
