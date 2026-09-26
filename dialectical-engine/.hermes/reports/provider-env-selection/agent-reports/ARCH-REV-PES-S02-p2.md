# ARCH-REV-PES-S02-p2 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

Pass 2 re-ran a detector whose HOLDS was true in the author's shell and false in this one, for one reason: `FORCE_COLOR=1` makes pnpm wrap `[ELIFECYCLE]` in ANSI, and the check `[[ $last == \[ELIFECYCLE\]* ]]` does not match those bytes. The marker said BROKEN. The log's line above the trailer was `PES-S02-ACCEPT: FAIL admitted` and the process exited 1. Reading the marker instead of the log would have opened a rework of a CLI that already implements V-12.

## Price

- Almost filed REWORK on `cli-block-run.sh`'s `planned: BROKEN`. Cost if shipped: one ARCH-FIX pass (a full plan re-read, another C1 vitest, another detector round). Avoided by printing the FAIL log with `repr` (~2 minutes, one python).
- C1 re-run: one vitest pass of eight files, marker `CLUSTER_RED`, counts identical to `PLAN.md:65`. Necessary. About a minute of wall clock. Not a token problem.
- First trace regex required `**R2.n**` closed immediately. Five headings are `**R2.5 — …**` with the closing marks at the end of the title, so the parser reported 7 requirements and then "zero gaps" only because it never looked for the other five. A second regex fixed it. Cost: one wrong gap list, caught before the artifact. Dead end: do not count `**id**` as the only heading shape in this SPEC.
- The same first script counted 6 refusal JSON objects against the plan's 5. The sixth is R2.8's admission target, which sits after the table and matches `PLAN.md:783` on its own. Dead end: slice the table at "Each refusal", not at the next heading.

## What the packet fought

Charge 8 says to copy `closure.sh` because it `rm -rf`s `scratch/states`. S02 has no `closure.sh`. That script is under `ARCH-REV-PES-S03-p2/`. S02's scripts that delete are `ARCH-FIX-PES-S02-p3/cli-block-run.sh` and `pnpm-exit-rule.sh`, and their `D=` is an absolute path in another session's scratchpad. A byte-copy still deletes that path. The copy had to have `D=` rewritten to this probe dir before it was run. Say that in the packet: "retarget every absolute scratch path in the copy."

Charge 1's `comments read through: 1` matched the ticket at CLAIM (one DISPATCHED comment). It will not match a ticket that already has a CLAIM. The cursor has to be the count after the read, which is what the protocol says.

## Upgrades, by tokens saved

1. Detectors print the log bytes next to HOLDS/BROKEN, and the packet says which environment variables were set. This pass's whole scare was a marker that hid a correct exit code. One `repr` of the last two lines would have made the author's HOLDS and this re-run comparable without a second reading of SPEC step 8.
2. Cluster re-runs record `FORCE_COLOR` and `NO_COLOR`. The plan already names that pair (`PLAN.md:869`) and then requires an EXACT `$ tsx` line that the pair paints. A seat that inherits the harness env and a seat that unsets it write two different verdicts about the same plan. Unset them for the SPEC-shaped run, and run once with them set when the plan claims to allow the warning.
3. Pointer checks are a `cmp` of the cited paragraph, not a line number. `SPEC-v4.md:9-11` equals `SPEC-v3.md:9-11`. That one comparison answered charge 10(b). E4's allow-list (`withdrew` anywhere on the line) hides the stale read-by cell, so the author's green detector cannot be the check.
4. Heading parsers anchor on `^\*\*(R2\.\d+b?)`, not on `**id**`. The dash form is how this SPEC writes R2.5, R2.7, R2.8, R2.9 and R2.10.

## Nearly wrong

Treating `cli-block-run.sh`'s BROKEN as a failed exit rule. The exit half of the same output line already said `exit=1`. The verdict half was the detector missing ANSI. A rework on that marker would have rewritten a CLI block whose plain-env log is the three lines SPEC-v4 step 8 describes.
