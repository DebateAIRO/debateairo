# REQ-REV-PES-p2 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

The rework proved itself with a detector that searches for the words of the fix. `check_b1` passes when six names sit in a markdown table. `check_b3` passes when the word `authorization` is pardoned. The pass-1 failure was the same shape from the other side: a requirement written from the call site without walking the callee. Pass 2 walked the callee, then wrote a checker that never calls it. A green checker of that kind costs a full review pass, because the next seat has to re-derive the control flow the checker skipped.

## What it cost

- Detector run, both versions: one command, rc 1 then rc 0. Price of trusting it: a false PASS, and pass 3 would have been spent on a different bug. I did not trust it. The price of not trusting it was re-reading `parseProviderDiscoveryTargets` (`index.ts:232-338`), the row builder (`configured-provider-set.ts:172-195`), and `publishGeneral`'s argument list (`register-publication.ts:427-441`, `:868-872`). That is the bulk of this pass.
- A shell probe called `rg`, which was not on PATH, and `|| echo "NO HITS"` turned the failure into a clean-looking result. Caught before it entered the verdict. If it had not been caught, the replay of pass-1 probes 4 and 6 would have been fabricated evidence. One more review pass.
- `sed -n '232,256p;288,296p'` concatenated two ranges. Read as one function, the duplicate throw looks like it sits inside the configured-provider loop, which inverts B1. The earlier line-numbered read is what prevented that. Cost: a correction appended to the probe log, and a rule I will not skip again.
- Hunting the eight-line handoff in the spine. It lives in `.claude/skills/heartbeat-protocol/SKILL.md` §5. I had opened the thin `.grok/skills/heartbeat-protocol/SKILL.md` first. About 250 spine lines, zero verdict content.

## What I nearly got wrong

I nearly failed the closure because the packet's B1 parenthesis says the roster file determines every row member. The table's database source for `requiredDistinctMakers` is the fix pass 1 asked for. The real failure is that the acceptance database has no such row, and that a duplicate roster does not throw the code step 2 names. Scoring the parenthesis would have sent the fix seat back toward a one-file design the builder cannot implement.

I nearly treated "any substring after the scheme word" as a blocking contradiction. Step 7 already greps the full token. The unbounded reading fails on the letter `e`, so a coder will not ship it. It is N2.

## Dead ends

- Executing `parseProviderDiscoveryTargets` under Node. Not attempted past the source read. The throw order is three straight-line `throw` statements; a harness import would not change the order.
- Re-measuring the gap table. No cell flipped to BUILT, the lane SHA is unchanged, and charge 8 says untouched requirements stay untouched. Another full grep pass would have repeated pass 1.
- Opening the REQ-FIX transcript to audit SKILLS LOADED. The five named files exist. The comment already declares the four earlier skills were not re-invoked. A transcript grep would have re-derived a declared shortfall.

## Where this packet was unclear

- Charge 8's parenthesis (roster determines every member) and pass-1 B1 (the builder needs two fields the roster cannot hold) are different pass tests. N4.
- Charge 3 says re-measure every BUILT verdict. Charge 8 says do not re-review anything the closures did not touch. The gap table was not a closure. I followed charge 8.
- "Replay every pass-1 probe that touched a closed finding." The pass-1 probe file is one log of ten probes. Which lines "touched" N3 is a judgement. I replayed the two greps that established the builder has no `apps` caller and that `apps/` does not mention the mode, because those are the claims N5 and the B1 context still stand on.
- The input list names S03 and the whole intake. The scope sentence says not to re-review them. The scope sentence is the one that saved the tokens.

## Upgrades, ranked by tokens saved

1. A closure detector fails by running the callee on the fixture the acceptance names, and prints the thrown code. String presence stays a pre-check. Saves the next reviewer the parser read, which was most of this pass, and saves a false PASS if the reviewer is tired.
2. A packet's pass test quotes the finding's fork (two inputs, two codes). It does not invent a new success sentence. N4 is a whole scoring argument that did not need to exist.
3. Probe shells use a known-absolute search binary, and a missing binary is a failed probe. `|| echo NO HITS` is how a clean bill of health gets forged. One forged replay is a rework.
4. Scope means line ranges. "Read both SPECs" plus "do not re-review untouched requirements" still costs both files, because the closure is not marked with line numbers in the packet. The READY comment's `path:line` list was the usable index. Put that list in the packet.
5. Handoff shape: one pointer, `.claude/skills/heartbeat-protocol/SKILL.md` §5. The spine is the wrong file. I burned a read confirming that.
