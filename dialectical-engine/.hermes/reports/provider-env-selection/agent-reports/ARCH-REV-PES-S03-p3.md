# ARCH-REV-PES-S03-p3 — self-report

Question, verbatim: treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

A pass-N closure probe that hardcodes the previous plan's sentence cannot see a wording fix, and the packet still says to replay it and quote it. `closure.mjs` §F (pass 2) inserts Revision 2's sentence and runs Revision 2's token check. On Revision 3 it still prints `C1-2 + EXACT sentence PASS`. That PASS is the old detector reproducing itself. The revised gate, extracted from `PLAN.md:271-273` and `:260-262` and run on the same README, prints `FAIL` for that sentence. Stopping at the replay would have been a false REWORK. At pass 3 a false REWORK is a V row.

The same file's §E prints boot order off the first textual hit. Those hits are imports (`apps/api/src/main.ts:24`, runner `:23` holds three names on one import). The calls are `apps/api/src/main.ts:97`, `:230`, `:242`, `:300`, `:312` and `apps/runner/src/main.ts:38`, `:74`, `:87`, `:111`. Pass 2 already wrote this under UNVERIFIED. I re-derived it anyway.

## Price

| item | cost | if the near-miss had shipped |
|---|---|---|
| Separating §F's PASS from the revised gate | one reading of `closure.mjs` §F plus one extracted-gate run (~minutes, one probe file) | a pass-3 REWORK, which is a V row, and a BUILD that waits on a wording V already does not need |
| §E import lines vs call parens | the same re-derivation pass 2 already paid | a false "the plan's line numbers disagree" finding |
| Checker asked `:112` alone for `unreachable` | one failed token, caught before the artifact | a false citation finding; the word is on `:113`, inside the cited `:112-114` |
| Cluster re-runs | three `run-suites.sh` pairs, wall-clock under 5s (v9 336ms, baseline 170ms) | none — they match the ARCH-FIX claim |
| Reading the v3 grok protocol before the v4 router | one short file, then the file COMMON actually names | none |

N1 (`PLAN.md:604`, "at run time") is a fold, not a pass. Filing it as B would have spent a V row on a parenthetical the next two lines already override.

## What I nearly got wrong

1. Quoted §F's PASS as "the old sentence still passes the plan." It passes the pass-2 checker. The plan's own `(1b)` and EXACT `toContain` fail it (`rev3-check.log`, `S2_rev2` and `SELFTEST_OK`).
2. Treated §E's `api seal 24` as a disagreement with `PLAN.md:397`. That number is the import.
3. The cluster driver finished in about four seconds. That looked like a stub. `c1-cluster.log` has `Tests  23 passed` and `Duration  336ms`. The suites are that small.

## Dead ends

- `eval` of the first `not.toMatch` in the plan swallowed the angle-bracket regex and threw `SyntaxError` at `rev3-check.mjs`. The `(1b)` regex is the line that contains `hosted rules?`. Do not take the first `not.toMatch`.
- `closure.sh` `rm -rf`s `scratch/states` beside itself. The copy had to have its absolute `PROBE` path rewritten or the replay would have deleted the pass-2 states. The pass-2 script's mtime is still `Sep 24 20:06`. Its `scratch/states` still has 10 files.
- The grok `heartbeat-protocol` SKILL.md in this worktree is Graph Spine v3. The mission's router is `.claude/skills/heartbeat-protocol/SKILL.md` (v4). The v3 file sends you to the spine. The packet says the spine is not floor reading.

## Where this packet was unclear

- `packets/ARCH-REV-S03-p3.md` charge 3 says re-run every cluster command. Charge 8 says review only the closures and the steps Revision 3 changed. Both are doable. The sentence that is missing is what a replayed PASS means when the probe hardcodes the old sentence.
- Charge 5 calls V-11 "the ARCH seat's own V-ROW." The row is ARCH-FIX `t_f54b7505` (`V-DECISIONS-PACKET.md` V-11). The obligation (honour V-1..V-11, default applied) did not change, so this is not filed.
- Charge 1's CLAIM template says `comments read through: 1`, which was right at dispatch. After the CLAIM the cursor is 2.

## Upgrades, by tokens saved

1. In every pass-N review packet, one sentence: a replayed detector that hardcodes the previous sentence will PASS that sentence even after the fix; the closure is the new gate run on the old sentence, and it must FAIL. This is the false-REWORK trap above. It is the same family as TOOLING-TRAPS "a pass-N lens ordered to re-run the pass-1 probes hits their head guard," one variant later.
2. Probe headers that print boot order should search for `name(`, not the first hit of the identifier. Pass 2 paid for this and pass 3 paid again.
3. Identify a corrected row by a quoted string in the packet. `PLAN.md:141` was `:140` in freeze `5108aa89` and is `:162` in Revision 3. The FIX seat recovered by content. The line number did not survive one edit.
4. Do not make a seat re-discover that these two suites finish in a few hundred milliseconds. The Duration line is the evidence. Re-running them is still required; re-arguing that the speed is suspicious is not.
