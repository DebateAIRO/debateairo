# ARCH-REV-PES-S01-p2 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

Line numbers are being used as identity. Revision 2 inserted a header and about a hundred lines, and the pass-1 fold at `DECISIONS.md:221-222` still points at the old lines. `PLAN.md:90` is no longer the §6 cell. `PLAN.md:324` is no longer A3. The case names in those same bullets are stable and the line numbers are not. TOOLING-TRAPS already records this ("A packet that freezes line anchors must freeze the HEADER too", 2026-09-13). This pass paid for it again.

The second cause is a probe shape copied onto the wrong runner. `TMPDIR=/nonexistent` on `pnpm exec tsx` dies inside pnpm's own `temp-dir` (`lstat '/nonexistent'`) before the script runs. The author's `d6-unverified.sh` already says to use `node --import tsx`. I used `pnpm exec` because `d3-exitcode.sh` does, and I put the hostile `TMPDIR` on that shape.

## Price

| finding | wall-clock | what it cost |
|---|---|---|
| N2, stale fold lines | ~20 min of reading to prove the lines had moved | one more seat will repeat it if the C2 packet quotes `DECISIONS.md:222` |
| N1, §6 cell | ~10 min, plus a parser | the author's checker prints PASS because it never looks at § rows |
| N5, freeze sentence | ~5 min (`git diff --stat`, `git log`) | a false picture of the diff (SPEC-v5 is in it, PROGRESS is not) |
| dead end, `pnpm` + `TMPDIR` | one failed mutant, then a 16 s re-run the right way | small, and already written down in `d6-unverified.sh:4-5` |
| four `tests/architecture` runs | 377 s for `run-all.sh` (C1–C4, d1, d4, and the failed mutant) | the C2–C4 omitted commands are the same suites pass 1 ran |

The p6 fold itself saved a pass. Its six pointer shifts all match SPEC-v5. Verifying that was the job and it held. Do not replace that fold with another ARCH-FIX round for labels.

## What I nearly got wrong

The first d1 run showed stderr of 492 bytes against the author's "stderr 0 bytes". That was this harness setting both `NO_COLOR` and `FORCE_COLOR`. Pass 1 had already measured that warning. A clean env re-run is stderr 0 bytes, rc 0, fourteen lines, `PES-S01-ACCEPT: PASS`. Filing the warning as a disagreement would have been a false REWORK.

The replay of the pass-1 trace parser reports a gap on every requirement. It uses the whole table cell as the key, and the cell now contains `` (`SPEC-v4.md:61`) ``. That is a stale parser, not a missing step. My parser, which takes the id before the space, finds one real gap: the §6 cell.

## Dead ends

- `pnpm exec` with `TMPDIR=/nonexistent`. Use `node --import tsx` and `TSX_DISABLE_CACHE=1`, as `d6-unverified.sh` says.
- Reading `closure.sh` as an S01 file. The only one is `probes/ARCH-REV-PES-S03-p2/closure.sh`. It deletes its own `scratch/states`. S01 has no such probe.
- Treating "at base" as `git checkout 776359c3`. The lane is `5b12b2e15` because C1 is built. "At base" for C2–C4 means the created files are omitted. Running the omitted commands is `CLUSTER_GREEN`. Running the missing C2 file alone is `BROKEN`, and S01-06 creates it.

## Where this packet was unclear

- `ARCH-REV-S01-p2.md:8` says the freeze diff is the plan, the DECISIONS lines, and pass-1 folds in DECISIONS and PROGRESS. Measured: that range also adds `SPEC-v5.md` and does not touch PROGRESS. Charge 9 corrects the SPEC name. The sentence and the charge disagree.
- `ARCH-REV-S01-p2.md:28` says to replay every pass-1 probe that touched a closed finding, and mentions `closure.sh` as the probe that `rm -rf`s beside itself. Pass 1's findings were folded, not assigned to ARCH-FIX. The closures this pass actually had were V-10, V-12/V-13, and F10, which the pass-1 probes predate. The `closure.sh` example is another slice.
- "Re-run every cluster command at base" and "the lane is `5b12b2e15` (C1 built)" sit in the same packet. The plan's own column resolves it (created paths omitted). A packet that says "run the §3 command as written" would have been `BROKEN` on three clusters and looked like a defect.

## Upgrades, by tokens saved

1. Folds and packets cite the case id (`A3`, `I15`, `S01-26`) and a generator re-greps the line at dispatch. Stops the class in N2. This is the standing traps entry and it is still losing seats.
2. `trace_check.py` takes the SPEC path as an argument and fails when a § row has no `S01-` id. The next reviewer then does not write a parser to discover N1, and does not have to re-derive the v4→v5 map by hand. The fold stays the label pass; the checker learns the filename.
3. A charge that says "re-run the exitCode mutant" names `node --import tsx` and `TSX_DISABLE_CACHE=1` in the charge, not only inside the author's script. One sentence. Saves the pnpm dead end.
4. For a pass whose cluster commands did not change except a count on a file that does not exist yet, re-run the one command that changed (C1, because the suite now exists) and one architecture log for the six names. Re-running C2, C3, and C4 here changed nothing and cost most of the 377 s. The contract required them. The contract is the thing to change.
