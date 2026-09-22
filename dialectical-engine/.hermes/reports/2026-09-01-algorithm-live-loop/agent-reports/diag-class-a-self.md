# SELF-REPORT — lane/diag-class-a (F-DIAG-S04-PANEL-NOTE · F-DIAG-TOKEN-UNLOCK-UNCLASSIFIED · F-DIAG-DEV-AUTH-STACK)

Seat: Opus 5 worker. **Round 0: 17:27–17:57 (30 min). Round 1: 18:13–18:36 (23 min). Round 2: 18:54–19:10 (16 min).** Four commits, three tickets, two of three rework rounds consumed. Murder case: causes, not symptoms; prices in minutes.

## The body: one defect wearing four costumes

Every finding across three reviews is the same mistake at a different depth. I kept establishing that a value came from somewhere trustworthy and calling that a bound on the value.

| round | what I bounded | what was still open | how deep |
|---|---|---|---|
| 0 | the message is gone; a map is used | `instanceof` proves ancestry, not membership | the value's TYPE |
| 0 | the set decides membership | the emitted read is a SECOND read | the value's IDENTITY across reads |
| 1 | the check consults the declared vocabulary | the vocabulary is an exported, unfrozen array | the STORAGE the check reads |
| 2 (self-caught) | a compile-time guard protects the vocabulary | `as` is an assertion; it silences the check | the GUARD itself |

**The pattern: at each level I secured the thing one layer up from the actual leak, and each fix's own foundation became the next round's finding.** The general rule I would give the next seat is: *for every guarantee you write in a comment, name the mechanism that would make it fail, and go break it once.* That is what finally worked in round 2 — I deleted a kind from the private literal and read `TS2741` back out of tsc before writing the sentence claiming the guard exists. Had I done that in round 0 for "the closed list", there would have been no F1 at all.

## What I nearly got wrong, this round

**I nearly shipped `as Record<PanelMemberFailureKind, 0>` with a comment promising both-direction drift detection.** The idiom looks like a constraint and reads like one in review. It is the opposite: `as` tells the compiler to stop checking. Measured on this repo's tsc 7.0.2, `{A:0,B:0} as Record<"A"|"B"|"C",0>` produces **no diagnostic at all**, while the typed-const and `satisfies` forms both give TS2741. Had it shipped, the source would have carried a false guarantee inside the very fix whose subject is false guarantees — and it would have been invisible until someone added a kind and nothing broke.

What saved it was a habit rather than a skill: I stopped before writing the claim and wrote a four-line probe file instead. **Cost of the probe: ~3 minutes. Cost of the alternative: a fourth round, which this ticket did not have.**

## Where the packet and the reviews were unclear

- **P1's residual, and it is the expensive one.** AMENDMENT 1 corrected "closed list" to a runtime-check requirement but still called the array "the sealed list", and codex's own r1 guidance did not distinguish a fixed private vocabulary from an exported compile-time-readonly array. Three parties — packet, reviewer, implementer — used "sealed" for a mutable exported binding, and the result was a round. **The vocabulary that would have prevented it: say "declared spellings" for the type and "membership storage" for the runtime object, and never let one word carry both.**
- **Everything else was clean.** The widened read grant in AMENDMENT 1 removed the round-0 BLOCK deliberation entirely; round 2 cost zero minutes on scope. The r1b verdict gave file:line, input → wrong outcome, and the exact source domain for each misclassified template variable, so F2 was a thirty-second confirmation and then editing.

## Dead ends — do not re-derive

- **Round 0:** a class table for the S04 map (no cited producer; router §2.2 answers it — open key set → redact wholesale).
- **Round 0:** a bounded detail category for tokenUnlock's UNCLASSIFIED branch.
- **Round 1:** a module-level `Set` referencing `PANEL_MEMBER_FAILURE_KINDS` — TDZ at import, because the export is declared *below* the helper. This is also why the round-2 private literal is self-contained rather than derived from the export: the fix that was forced by module order turned out to be the fix the finding required.
- **Round 2:** `as` for exhaustiveness (above). Also: `mutate.sh` rejects an empty NEW string (`NEW=${4:?new}`), so "delete these lines" must be a comment line.

## What repeatedly cost tokens, and the upgrade for each

**1 · Records re-taken three times because the tip moved after measuring.**
D64 ADDENDUM 5 says commit first, then measure — and I did, every round. The cost is structural: any trap discovered *during* measurement (round 1's `mutate.sh` append) forces a commit and a full re-measure. Rounds 1 and 2 each re-took 15–18 records.
**Upgrade: separate the record's stamp from the record's file.** If `stamp-check` accepted a sidecar (`<record>.stamp` written at the end of a round) instead of grepping the first `commit=` inside the artifact, a late commit would rewrite one small file per record rather than forcing every gate, mutant and audit to be re-run. That single change removes the whole re-measure cycle.

**2 · `mutate.sh` appends (round 1, ~4 min + a re-measure).** Filed as F-TOOL-MUTATE-3. Round 2 used new `-r2` names and archived the round-1 transcripts to a subdirectory. **Upgrade unchanged: the tool should truncate, or refuse a path already containing a transcript header.**

**3 · Identity gates compared with `diff` (round 1, ~1 min and a false alarm).** Now compared by sha256, both sides extracted with the same command, both hashes printed per run.

**4 · Custody arguments instead of custody (round 1's F4).** The lesson generalises: **re-take under custody rather than arguing that an unstamped artifact is trustworthy.** Round 1 spent a finding on this; round 2 pre-empted the same shape by filing `28-gate-neighbours-at-tip.log`, because codex had noted the neighbours claim had no saved transcript. That cost 40 seconds.

**5 · An audit that describes its procedure instead of being it (round 2's F2).** Part B printed a derivation summary while claiming to print the generating command. **Upgrade, done: the script is a real file (`audit-tools/derive-dev-set.py`), the audit prints its sha256, invokes it, prints its output and then its source, and it exits non-zero when the sets disagree.** An audit section should be a *run*, not a *description of a run*.

**6 · `.hermes/TOOLING-TRAPS.md` is now ~2,235 lines.** Unchanged across three rounds: every seat must read it, no seat can. Split into an index plus topic files, or scope the duty to headings plus entries matching the seat's toolchain.

## What made three rounds converge instead of thrash

- **Every codex finding carried input → wrong outcome, a file:line, and a required fix**, plus an explicit STRENGTH and a Not-verified section. Nothing needed re-investigation; disagreement was possible and never necessary.
- **The reviews corrected themselves.** r1b explicitly said its own r1 guidance had failed to distinguish the private vocabulary from the exported array. A review that charges its own earlier advice is what let round 2 be 16 minutes.
- **Mutants are the only claim I never had to defend.** Eleven transcripts, each binding tip and tree, OLD/NEW text, anchor multiplicity, before/after hashes and porcelain. Codex verified them against Git without re-running anything.
- **Pairing mutants per property.** J (wrong storage) and K (wrong contents) together pin the F1 remainder; either alone is satisfiable by a wrong implementation. **One mutant per finding is not enough when the finding has two failure modes.**

## Toward the one-prompt machine

1. **Add the read-once/own-your-storage rule to the class template.** Six members of this class have landed and the template still says "explicit map + fixed fallback". That sentence does not prevent any of F1, F3 or the F1 remainder. The steps are: sweep producers **including template expansion** → open vs closed key set (router §2.2) → map or redact → **read once, validate that read, emit that read or your own literal** → **own the membership storage; never alias an exported binding** → independent expected list → a mutant per failure mode.
2. **A guarantee written in a comment must cite the mechanism and the observed failure.** "This is a compile error if X" should be followed by the diagnostic code someone actually saw. Cheap to write, and it would have caught both "the closed list" and my `as`.
3. **`grant-check.sh` → reachability** (round 0 and P2 both point here): for each granted module list the other tests importing it and the non-granted modules it imports, and require the packet to name each.
4. **A lint for expected-lists imported from the module under test** — codex has now raised this on two lanes.
5. **Producer sweeps need a template-expansion pass as a standard step**, shipped as a tool rather than rediscovered: print the literal set, the error-construction candidate set, and each candidate's interpolated variables with their call sites, for the author to classify. Round 1 invented the pass; round 2 proved the *classification* is where it goes wrong, so the tool should force the resolution to be written down per variable.

## Self-charges

- Four rounds of the same error at four depths: I secured the layer above the leak each time and called it closed.
- I stopped applying my own audit rule two sites early, and the false "unbounded" label became a ticket someone else had to file and unfile.
- I wrote `as` where I meant a constraint, and drafted the comment before probing the compiler.
- Round 1's accessor test had a title stronger than its assertion — membership in a list where it should have been the exact value and the exact read sequence.
- Across three rounds I have never once been the one to discover a finding in my own shipped code. Every level was found by review. The round-2 `as` catch is the single exception, and it happened only because I had just been charged with the same species of error.
