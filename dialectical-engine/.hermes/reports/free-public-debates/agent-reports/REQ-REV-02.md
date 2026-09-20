# SELF-REPORT — REQ-REV-02 · mission `free-public-debates` · node REQ-REV, pass 2

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REQ-REV-02, grok-4.6, same CLI session as pass 1 (`01a0bfd1-bd51-74e0-889e-755d7371a709`) resumed. Wall clock CLAIM to verdict: ~12 minutes. Skills actually loaded this pass: using-superpowers (+ hermes-tools.md from pass 1), heartbeat-protocol, heartbeat-reviewer, verification-before-completion, receiving-code-review, systematic-debugging.

---

## 1. The body: cause, not symptom

**CAUSE of the remaining waste: a pass-2 review still re-reads a 385-line SPEC to confirm ten findings that already have a checker, because the checker does not pin the charges the packet actually cares about.** REQ-FIX handed forward `spec-v2-check.sh` (24 substring assertions). It PASSes SPEC-v2 and FAILs the frozen SPEC and a B1 mutant — that part is real evidence. It also PASSes a mutant that appends `R-26`. This packet's charge 3 is "a new requirement is a finding". The detector cannot see that charge. I paid a Python unique-R-id grep (~20 seconds, ~200 tokens) to close it. The checker should have been that grep.

**CAUSE of N7 recurring: the compass pins a closed V-row range, and the checker pins the same range.** Pass 1 N7 was "INSTRUCTIONS says V-1…V-4 after V-5 exists". FIX wrote V-1…V-5, then opened a new V-ROW that the orchestrator numbered V-6 in the same freeze. The compass and SPEC-v2's authority line still say V-1…V-5. The checker *requires* that string. Updating the compass to the truth would make the handed-forward detector go RED. The class is "a frozen range in the compass"; the instance was closed; the class was conserved by the test.

**CAUSE of the two DECISIONS pointers: append-only files and numeric section cites do not mix.** SPEC-v2 points at §3 for the publish_pending V-ROW and §4 for R-21 residue. After the append, those numbers are V-5 and the old contradiction log. The rows live in §9 and §8. Same class as N2's drifted `publications.ts:301` — a `path:line` (here `path:§n`) copied forward after the target moved. FIX swept that class inside `publications.ts` and did not sweep it inside DECISIONS.md, which they themselves grew.

**Token leak that will repeat if unfixed: executing the pass-1 probe in place.** `probe.sh` tees into its own directory. REQ-FIX reported it and did not run it. This packet tells the next seat to copy first. I copied; sha256 of `probes/REQ-REV-01/probe.out` stayed `56b038f3…`. One missed copy is a destroyed verdict. Price of the copy: 10 seconds. Price of a miss: the p1 evidence is gone and pass 2 cannot show B1 was live.

**Second leak: the copy still greps `SPEC.md`.** "Run the copies against SPEC-v2" is not what the file does. I re-implemented P9/P10 in `probe-p2.sh` against both files. That is the second time this mission has re-implemented P9 (FIX did it inline too). Three seats, one 8-line Python function, three copies.

## 2. What I nearly got wrong

1. **I nearly declared the B1 mutant a checker gap because the first substitute did not land.** Markdown hard-wraps `publishable bound\nrun's`. A literal `\*\*publishable bound run's\*\*` is 0 matches (`n1=0`) and looks like "the checker cannot see R-9". The disclaimer *did* match (`n2=1`). I almost wrote "checker does not kill an unscoped R-9". The wrap was the mutant, not the checker. Price avoided: a false N on the one assertion that actually works. Same class as pass 1's P9 line-wrap (`is a\n  violation`). Flatten whitespace before you substitute.

2. **I nearly re-opened "second user credential" as B3 leftover.** Charge 3 says new breakage only inside what changed. Step 9 was rewritten to name 401; the second account was not introduced. Re-opening it would have been a scope break on a PASS.

3. **I nearly ran `probes/REQ-REV-01/probe.sh` "just to see".** The packet said not to. The tee would have overwritten p1's `probe.out`. That would have been a destructive action on evidence I am not allowed to edit.

## 3. Dead ends — do not re-derive

- `spec-v2-check.sh`'s `REPO="$HERE/../../../../.."` looks like it points at the wrong git root. It does not: `git -C` from the packet cwd still finds `worktrees/all`, and the `apps/ui` pathspec is cwd-relative, so R-24's 0 is the real 0. Do not "fix" the path; measure it.
- Re-reading `00-intake.md` in full on pass 2. The packet names it. The scoped job does not need C1–C7 restated. I used it only for the no-touch line. Cite, do not reload.
- The 200-word SUPERSEDES line (FIX packet defect 4). It *does* name every changed requirement. Skimming it is a reader problem; I grepped `**R-n**` instead. Unique 1–25. Stop reading line 4 as prose.

## 4. Where THIS packet was unclear — exactly

- **REQ-REV-02.md charge 2: "COPY them … and run the copies against SPEC-v2".** The copy's P9/P10 hard-code `SPEC.md`. Running the copy unmodified re-measures the frozen file, which is the control, not the fix. The packet should say: copy, then point P9/P10 at SPEC-v2, and keep one run on SPEC.md as the RED frame. I did that in `probe-p2.sh`. The unmodified copy is in the probe dir as evidence it was copied, not executed against v2.
- **Charge 2: "say for each what it measures".** The pass-1 probe measures ten product facts (P1–P8) plus two SPEC-text facts (P9, P10). Only P9/P10 can change between SPEC.md and SPEC-v2. The packet does not say "do not re-dump publications.ts". I re-ran P9/P10 only, plus the handed-forward checker. P1–P8 product facts are unchanged because FIX wrote no product file.
- **Charge 1 lists `reviews/REQ-REV-p1.md` as an input.** Correct and cheap. I used it as the finding table and did not re-derive B1 from memory.

## 5. Upgrades, ranked by tokens saved

1. **Handed-forward checkers pin the packet's charges, not the author's sentences.** Add: unique R-ids == {1…25}; every `DECISIONS.md §n` cite resolves to a heading that still exists; compass V-range == ids in the V packet. *Saves:* this seat's S8–S9 greps, and a pass-3 that would otherwise re-discover V-6 drift.
2. **Probes take the spec path as `$1`.** Pass-1 `probe.sh` should have. Then "run the copy against SPEC-v2" is one argument, and cannot clobber `probe.out` if `OUT` is derived from `$1`. *Saves:* the copy ritual and two re-implementations of P9.
3. **Never cite `DECISIONS.md` by section number from a SPEC.** Cite the V-ROW id (`V-6`) or the heading text. Append-only files move numbers. Same rule as "do not copy `publications.ts:301` forward". *Saves:* N2-p2 and its cousin on the next mission.
4. **Compass V-range is "see V-DECISIONS-PACKET.md", not `V-1…V-n`.** One pointer, no lag. *Saves:* N7, N1-p2, and the checker assertion that currently forbids the fix.
5. **Pass-2 packets should list the finding table as the reading floor, not the whole SPEC plus intake plus PLAN.** I still had to diff SPEC.md/SPEC-v2 for charge 3 (changed text). That diff is the right floor. The rest is pointers.

## 6. Price of this pass

- Wall clock: ~12 minutes after CLAIM.
- Tokens: dominated by reading SPEC-v2 once (~385 lines) and DECISIONS append. The checker and mutants were cheap and were the part that could have been the whole job.
- Retries: one (B1 mutant wrap). Pass-1 `probe.out` not overwritten.
- What a one-prompt machine needs: a detector that fails the charges (new R-n, drifted §, lagged V-range) and a SPEC walk whose bodies are already pasted — which they now are. Pass 2 should have been "run checker, run two mutants, diff SPEC.md SPEC-v2, stop". It was, once the packet's copy instruction was decoded.

The SPEC of record is buildable. The three N-findings are pointer hygiene. They should be folded the same day, not reworked.
