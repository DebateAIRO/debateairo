# Self-report: REV-PES-S03-p2-security-data-safety (REV(S03) pass 2, security lens, t_e2a75414)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Agent a4b235a7ecb16c621 (Opus, substituting for Grok). Wall-clock 16:25 to 16:36 EEST, about 11 minutes. Roughly 30 tool calls. Verdict: PASS with N1 to N7 and one V-ROW.

## The case

**1. The biggest risk sat outside every packet's reading list: `origin/dev` moved under the slice (N3).** Cause: COMMON §6 measured the base once, on 2026-09-24 at 13:34, and nothing re-measures it before a review. Dev landed five README commits overnight. They included its own 17-code refusal table and dropped the stale banner. Six of the slice's eight README hunks now overlap dev hunks, and the slice's pins fail 8/31 against dev's README.

I found this by accident. I was checking whether the credential-contract span still matched base, ran `git show origin/dev:…` instead of `776359c3:…`, and the line numbers came out 250 lines off. The pass-1 correctness lens noted only that the merge-base was unchanged. That check is blind here, because the merge-base doesn't move when dev moves.

Price: if this surfaces at `ff-main.sh` time rather than at REV, it is a full rework cycle after V's test (FIX + REV + V re-test, about 3 to 5 seat-hours) on a slice that may be partly redundant with dev. Upgrade: `assemble-gate.zsh` should print `git log --oneline <base>..origin/dev -- <every file in diff-stat>` plus the `-U0` hunk-overlap count into the package README. It's one command, and it would have put this in front of every lens on pass 1.

**2. The FIX packet narrowed a reviewer's remedy without saying so (N1).** Pass-1 security N3 asked for "fails if any of the four V-8 codes appears in that span". The union F1 re-phrased that as a row insertion. FIX charge 3 then said "in the table's first column". The FIX seat did exactly what it was told, so a Meaning-cell or in-span mention of `DAILY_COST_ENVELOPE_REACHED` stays green. The FIX seat's own neighbour mutant showed that (DAILY in prose, 31/31) and reported it as expected behaviour.

Cause: when the orchestrator folds a finding into F-classes, it keeps the SAMPLE (the row) and drops the reviewer's WHEN clause. Price: likely another FIX node (about 30 minutes of Codex) plus one review line on pass 3. Upgrade: the union should quote every contributing lens's WHEN verbatim under each F, and the FIX packet should cite it and never paraphrase it.

**3. The pass-1 probes could not be re-run (N4). This cost me the most time.** The correctness scripts hard-code `pes-s03-rev-ct` and write into their own directory. The security directory holds logs only, with no script. I rebuilt all five mutants from log prose and table text. That took about 8 tool calls, including two failed runs: the first because `| Code | Meaning |` occurs more than once in the README, and the second because my first span grep broke on zsh quoting. The FIX seat hit the same wall and rewrote them too (`reviewer-ct-mutate.py`, "hardcoded review-lane/output paths … replaced"). That is at least two seats paying for one un-promoted probe. Upgrade: `packet-check.sh` should refuse a packet that names a probe directory as a re-run input unless that directory holds an executable whose text has no `.worktrees/<lane>` literal.

## What I nearly got wrong

- **Closing the retype residual on the FIX seat's say-so, or calling it a B.** A retype-only mutant can't be distinguished at the head, by construction. The measurement that settles it is the pair: a source mutant turns the committed test RED, and the same source mutant with the retype stays green. Without that pair, either verdict would have been an argument.
- **Calling N1 a B that breaks F1's closure.** V-8 says "OUT of … the refusal table", and a Meaning cell is inside the table. I kept it N because F1's class, as the union wrote it, is "the table holds exactly these rows", and the rows are exact. The STRONGEST COUNTER in the artifact states the other reading so the orchestrator can overrule me.
- **Counting 26 "codes" in the refusal span.** Five of them are env-var names (`PROVIDER_REF`, `REGISTER_VERSION`, …). My first throw-site grep printed "NO SOURCE HIT" for every code because of a quoting bug. I nearly read that as a table-truth failure before I noticed that every line said the same thing.

## Dead ends, so nobody re-derives them

- `git merge-tree` would answer N3 exactly, but it writes git objects, which the packet forbids. Running the slice's v9 on dev's README (a temporary mutant in my own worktree) was the lawful substitute, and it was more informative.
- The freeze pair `0b3039434..0b3039434` is empty by construction (N6). The real pair is `..c201eae48`.

## Where the packet was unclear

- `:23`: `comments read through: 1`, and "the orchestrator's NOTE comment … names it". This was a re-dispatched ticket that held 4 comments at dispatch, and the NOTE arrived after I had read the ticket, so I claimed without it. I derived the same id from my transcript head (N5).
- `:10` describes a later-pass package (a diff since the previous head, the scope, a pointer to the pass-1 package), but the S03-p2 package has the pass-1 shape (N7).
- `:32` says "Re-run the pass-1 mutants from" two directories, one of which holds no script (N4).

## Upgrades, ranked by tokens saved

1. **Base-drift line in every review package**, with a hunk-overlap count against `origin/dev`. This saves a whole post-test rework cycle, the largest item on this list.
2. **Verbatim WHEN clauses carried from the lenses into the union and into FIX packets.** This saves one FIX+REV round whenever a remedy gets narrowed, as it did here.
3. **A promoted-probe gate in packet-check** (argv root, no lane literal, the script present). This saves about 8 to 10 tool calls per downstream seat, and two seats paid it on this finding alone.
4. **gen-rev-packet refusing a degenerate freeze pair and a stale comment cursor.** This saves a line of confusion for each seat.
