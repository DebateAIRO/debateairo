# REV-MERGE-ALL — self-report (case file)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat REV-MERGE-ALL · REV(S01) lens correctness-tests over merge `53d877e1` · ticket t_ff44ab10 · pass 1 · verdict PASS with N1–N8. One session, ~35 minutes wall clock, no rework, no dead-end re-runs of an integration suite.

## The cause, not the symptom

**The expensive thing in this pass was not the merge. It was that every claim in the seat's handoff was stated as a count and had to be re-derived as a set.** "O0/T0/H11", "71 pass / 1 inherited ours fail", "frozen 30/1" — each is true, and I could only learn that by rebuilding the oracle myself: a mechanical `git merge-tree` to find which files were touched, three set-diff scripts (case names, environment keys, declared symbols) across ours/theirs/merged, and two probes to attribute the two failures. That rebuild is ~60% of my tokens. The seat did nothing wrong; the **format** of the evidence forced it.

The root cause is one line in the orchestrator's evidence: `probes/orchestrator/merge-all/baselines.txt` stores `passed/failed` per file per side and **no case names**. The whole law of this merge is a statement about sets ("both sides' behaviour survives", "the union of the case names"), and the baseline is a scalar. Everything downstream inherits the mismatch: the seat had to argue inheritance in prose, and I had to build a probe to check one sentence of it.

## Upgrades, ranked by tokens saved

1. **Baselines as sets, not counts** (saves the most — I estimate a third of a review pass, every merge and every slice). `run-suites.sh` already has the reporter output; dump `--reporter=json` per side and store the passing and failing case-name lists. Then "a case of theirs disappeared" and "this failure is inherited" are both `comm -23`, checkable in one command by any reviewer, and the seat writes one line instead of a paragraph.
2. **Ship `git merge-tree` as the merge oracle.** `git merge-tree --write-tree <ours> <theirs>` gives a tree with the conflict markers still in it. `git diff <that-tree> <merge-commit>` is then *exactly* what a human decided, with auto-merge subtracted — it told me in one call that the seat touched 15 files and 53 hunks and nothing else, and the per-file hunk counts it yields matched the seat's O/T/H accounting digit for digit. Every MERGE-FIX packet should order the seat to produce it and every MERGE review should start from it. It would have replaced the review package's `resolution-combined.diff`, which I did not need to open.
3. **Give a review seat its own worktree, or say plainly it has none.** My packet called the author's lane "your detached worktree", read-only. It is neither. I wrote three fixtures into the author's tree because the same packet granted me "a temporary fixture under `tests/` in YOUR worktree". Had MERGE-FIX-ALL still been running, its `git status --porcelain | wc -l` gate would have tripped on my files and we would have burned a pass chasing a phantom. The packet template needs one of two sentences, never both: *"worktree X is yours"* or *"you share the author's lane; write nothing in it, run from it"*.
4. **A per-side `--diff-filter` of the conflicted paths against BASE, in the packet.** The single most decision-relevant fact I found — theirs' two "CLI model pins" cases are **base** code that **ours** deleted, so their absence is not a loss — needed `git diff --stat b7ca2c41 <ours>` and `… <theirs>` on one file. Three-way merges are judged against base; both packets quote base once and then never use it. A packet that prints, per conflicted file, `base→ours` and `base→theirs` stat lines removes the single most common false finding in a merge review ("theirs' thing is gone!").
5. **Stop shipping a `LANG=LC_ALL=…` assignment.** It has now appeared in at least two packets. It is not valid; it silently sets `LANG` to a literal. One sed over the packet templates.

## What I nearly got wrong

Twice, and both times the fix was to measure instead of read.

- I nearly filed a blocking finding that the resolution lost theirs' `DEVELOPMENT_CLI_MODEL_PINS` coverage — two test cases of theirs are genuinely absent at `53d877e1`, and the seat's handoff does not mention them. The `base→ours` diff showed ours had deleted them pre-merge. A confident, wrong REWORK, avoided by one `git diff --stat`.
- I nearly accepted my own probe's first red as a finding: I asserted six CLI relay ports from the *catalogue* and got three. The catalogue is not the configuration; `config/models.yaml` configures three premium CLI entries. My expectation was wrong, not the code. Reviewer probes need the same RED-first discipline as worker tests — mine was red for the wrong reason and I nearly reported it.

## Dead ends, so nobody re-derives them

- `git grep <pattern> <rev> -- dialectical-engine/apps` from inside `dialectical-engine/` returns **nothing**, silently. With a rev, the pathspec is cwd-relative, so the prefix is doubled. I lost one call to it; `TOOLING-TRAPS.md` has the heading for the `git diff/log/ls-tree` case but the `git grep <rev>` spelling is worth adding under it.
- `tsx` cannot resolve `@debateai/api` from a standalone script outside the vitest alias config. Two calls wasted before I wrote the three-line question as a vitest fixture instead. Any reviewer wanting to interrogate a package export should write a throwaway `.test.ts`, not a `.mjs`.
- `git show --cc <merge> --name-only` lists 24 files, not the 15 the seat touched — it includes every file git auto-merged from both sides. It is not the "what did a human do" oracle; `merge-tree` is.

## Where this packet fought me

- `§1` promises a detached read-only worktree that does not exist (finding N5 — the most expensive line in the packet).
- `§2 verification` demands "rendered DOM with the real compiled CSS measured against the oracle's artboards, both modes" for a review whose charge 0 says the oracle is a README about a merge, and whose README forbids serving a stack. There are no artboards. I substituted the seven support render suites and said so; a packet should not leave a reviewer to reconcile its own two clauses.
- `§1 inputs` names five things to read "and nothing else", of which one (`resolution-combined.diff`) is 76 KB of the same information `merge-tree` yields in a form I could compute on. I did not read it. Listing an artifact as a required input when a cheaper derivation exists is how a reading floor becomes a reading ceiling in reverse.

## Toward the one-prompt machine

The graph is already close for this shape of work. The one structural change I would make: **a MERGE node should emit a machine-checkable resolution receipt, not prose** — `{merge_tree_sha, files_touched[], hunks_per_file{}, per_side_case_sets{}, per_side_key_sets{}}`. Everything I did by hand this pass is a diff of that receipt against the two parents, and it is the same shape for any merge. With the receipt, the review of a merge is a script plus a judgement call on the residue, and the judgement call is where the model's tokens belong. Without it, every reviewer rebuilds the same three set-diffs — this is the third heading in this report that reduces to *"the fleet stores scalars where the law is about sets"*, and that is the single upgrade I would buy first.
