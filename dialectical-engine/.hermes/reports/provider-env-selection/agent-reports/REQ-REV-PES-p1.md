# Agent report — REQ-REV-PES-p1

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

The expensive miss is a closed input list that the type system already contradicts. S01 R1.2 says the hosted row comes from the shipped parser plus a three-field vetting file, and from nothing else. The parser's second argument is the row being published (`packages/providers/src/index.ts:232-234`), and the JSON allow-list has no `maker` and no `adapterKind` (`index.ts:264-268`). The builder also requires `requiredDistinctMakers` (`configured-provider-set.ts:178-182`). The REQ packet's mandated range stopped at line 144; the builder starts at 177. The seat found line 177 and still froze a schema that cannot supply the fields, because the packet had told them the range was the whole file that mattered. That is the cause of B1: a range that ends before the signature, followed by a sentence that says "nothing else".

The second cause is two editors of one step number. S02's header, INSTRUCTIONS, and PLAN say acceptance step 5 publishes with S01's command. The numbered step 5 is the admit line. R2.9 then forbids the word `authorization` on stdout while step 4 requires two refusal codes that contain it. Nobody re-read the header against the list, or the requirement against the grep, after the last edit. A diff of "step 5" sentences would have caught both.

The third cause is a table rewrite that was not a patch. F1 fixed concatenated `passed/total` figures by replacing a span that included §6–§9. The compass still points at the deleted sections. Every later seat either re-derives the caller table or cites a section that is not there. I did the first.

## Price

- B1, if it reaches BUILD: one cluster thrown away. The publish command's inputs are the cluster. A REQ-FIX now is one planning pass. A FIX after a green-looking unit test of a hardcoded maker is a REV pass plus a rebuild. Call it the whole S01 slice once, if it escapes.
- B2: one seat blocks S02 on S01 and invents a publish step the numbered list does not contain; the other ships an acceptance that never publishes. Either way the acceptance is rewritten once. Hours, not a research spike.
- B3: the first acceptance run fails its own grep, or the coder deletes the word from R2.9 in the implementation and the security lens files it later. One debug loop, the kind that burns a context re-read of SPEC §5.
- N1: I spent a `git show` of the pre-image to learn the sections were deleted rather than never written. Every ARCH and BUILD seat that trusts INSTRUCTIONS.md:54 pays that again. Restoring the four sections is cheaper than another seat's re-grep.
- N3 and N4: the first hosted acceptance fails inside `probeTarget` (body not exactly `OK`, or TLS verify) with an error that says ABSENT, not "your fixture is the wrong shape". One opaque debug loop per miss.
- This pass: the SPECs are ~500 lines and the cited code is a few hundred more. The wasted tokens were the deleted intake sections and the packet range that excluded the builder. The useful tokens were reading `parseProviderDiscoveryTargets` instead of the gap table.

## What I nearly got wrong

- I nearly called gap (a) false. `publishGeneral` has callers in `dev-deployment-register.ts`. Both pass `deployment: "local"`. The hosted door is still missing. A grep for the symbol without the deployment literal would have flipped a true GAP.
- I nearly called `api.localtest.me` refused, because it resolves to `127.0.0.1`. The checker does not resolve names (`index.ts:569-578`). R2.6 is right. I resolved the name and read the function before writing the finding.
- I nearly called the credential-file BUILT unpinned, because the cited test at `v9-provider-credential-files.test.ts:110` does not assert the inline refusal. The pin is `v9-deployment-mode.test.ts:142`. That is N6, a wrong line, not a false BUILT.
- I nearly called S03 non-vertical because it is a README. V can run the six greps with no other slice. The charge's "only refactors" does not cover it.

## Dead ends

- Connecting to `:55432` to see if `CREATE DATABASE` works. The seat law forbids it, and the verdict does not need the answer. N12 records the hole for the security lens.
- Re-running the 36 baseline suites. The charge is whether the SPECs pin the four RED pairs, which is a text check. A fresh run would not move B1–B3.
- Reading the spike as a source of requirements. It is marked stale, and the requirements reject its claims rather than repeat them. The time was better spent on the parser signature.
- Treating `~/.claude/skills/heartbeat-*.md` as a different contract from the repo copies. `cmp` says identical. Not a fabrication.

## Where this packet was unclear

- Line 9, "EXACTLY what the seat under review wrote", with a parenthetical `INSTRUCTIONS.md + slices/**`. The diff also contains the orchestrator's intake regeneration and the V-2 correction. Comment 1 on the ticket resolves it. The packet sentence alone does not. Two reviewers could have included or excluded `00-intake.md`.
- Charge 3 says re-measure every BUILT verdict. The gap table has none; all five cells are GAP. I re-measured the GAP cells and the intake §10 prose bullets that say BUILT. Say "GAP cells, and every prose sentence that says BUILT" in the next packet so the seat does not hunt for a column that is not there.
- Charge 4 demands acceptance commands a stranger can run. The REQ packet's charge 6 demands empty PLAN step-id cells. S02 step 2 says "the suite PLAN.md names". At REQ freeze that name cannot exist. The two charges fight, and N7 is the scar.

## Upgrades, by tokens saved

1. A packet range that includes the signature of every function the charge names, checked by a script: the symbol must occur inside the range. This would have put line 177 inside the REQ seat's required read and made "nothing else" fail on the same day. Saves a REQ-FIX pass and, if missed, an S01 rebuild. Largest saving.
2. A one-shot check before READY: every "step N" sentence in a header, INSTRUCTIONS, and PLAN matches the numbered step's first verb, and every refusal code required on stdout is exempt from a word-ban or the word-ban is edited. Saves B2 and B3, which are edit errors, not design questions.
3. Intake table fixes are patches of the pair column, not a rewrite of the following sections. Saves every later seat a re-derivation of §6–§9.
4. `path:line` citations are checked by extracting the line and requiring the symbol in the sentence to appear on it. `main.ts:305` is `assertDeploymentProviderTargets`, not the parse. Cheap, and it kills N6 and N10 before review.
