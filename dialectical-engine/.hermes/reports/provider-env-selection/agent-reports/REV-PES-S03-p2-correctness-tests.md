# Self-report: REV-PES-S03-p2-correctness-tests (REV(S03) pass 2, correctness-tests, t_b2ed2eae)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: fresh blind Claude Opus subagent `ae1559d39d6236d73`. Wall-clock is about 12 minutes, from 16:25 CLAIM to the verdict. Suites took about 3.5 minutes of that: the mutants about 60 s, the four integration suites 97 s, the clusters 9 s, and typecheck 2 s.

## The case

**Cause 1: the "retype survives" residual was a wrong-family mutant. It was not a pin weakness.** Pass 1 and the FIX seat both tested the retype only against README mutants. A literal list that equals what the source yields today is an EQUIVALENT mutant for every README edit, by construction, so nothing README-side can kill it. The property that R3.5's source-read defends is source drift. Two source mutants settled it in one run: a rename at `index.ts:700` and a 13th throw. The source-read form went RED on both, and the retype stayed GREEN on both. Price: pass 1 spent one mutant and a paragraph on the retype. The FIX seat carried it forward as "still survives", which cost a paragraph and a charge in this packet. Neither was needed. A two-row table ends it.
- **Upgrade (highest tokens saved):** every "does the pin detect X" charge in `gen-rev-packet.py` should name the mutant FAMILY that matches the property. A source-derived claim gets source mutants, and a doc-table claim gets README mutants. The retype charge should read: "kill the retype with a source mutant, or show that it survives one."

**Cause 2: the packet was generated for the grok dispatch and was not regenerated when the seat was re-dispatched. The NOTE it promises raced the seat.** Charge 1 says to take the agent id from "the NOTE comment after DISPATCHED" and to write `comments read through: 1`. At my read (16:25:07) the ticket had 4 comments and no NOTE. The NOTE landed at 16:25:22, and my CLAIM went up at 16:25:41 saying no NOTE existed. The id matched, because I had found it myself by grepping the subagent directory, which took about 2 minutes and two tool calls. **Upgrade:** put the agent id in the dispatch prompt, or post the NOTE before the seat can read the ticket. The cursor line should carry no hard count.

**Cause 3: the freeze pair was degenerate (`0b3039434..0b3039434`).** The generator stamped both ends before the freeze that would close the pass (`c201eae48`). The mandated diff is empty by construction, and it looks exactly like "nothing changed". I nearly read it that way. The only reason I didn't is that `git cat-file` plus the log showed the pass's record at `c201eae48`. **Upgrade:** `packet-check.sh` refuses a pair whose two ends are the same sha.

**Cause 4: the package README is pass-1 shaped at pass 2.** There is no FIX-range diff and no scope block. Price: small, one `git diff 98264a5ea..60993d2db`. However, a seat that trusts `diff.patch` reviews 232 lines, when the pass is really 47 lines.

## What I nearly got wrong

- **I nearly ran the pass-1 `mutants.sh` as the packet said ("re-run the pass-1 mutants from …").** That script writes its backups into the pass-1 probe `scratch/` and its logs into the pass-1 directory. Both are outside my allowed list, and the writes would have overwritten pass-1 evidence. I re-implemented the same mutant bodies in my own `mutants.py` instead. The packet should say to re-run the pass-1 mutant BODIES and must not point at the scripts. Otherwise the pass-1 scripts should take their output directory from an environment variable.
- **I nearly read the price-row mutants as proof that the new exact-set assertion works.** They fail at the SCOPED CONTAINMENT (`:449`), not at `:457`. Without the move-to-meaning mutant, which fails at `:457` alone, I would have credited the wrong assertion. Always read WHICH assertion failed, not just the count.

## Dead ends (so nobody re-derives them)

- `probes/ARCH-PES-S03/enumeration.mjs` still hard-codes the `pes-s03` lane. Use `probes/REV-PES-S03-p1-correctness-tests/enumeration.mjs <root>`.
- `pnpm typecheck` finishes in 2 s at this head, and its log is identical to the intake log. It is not a signal that anything was skipped.
- A second table or a Meaning-cell mention of a V-8 code passes (N1). Hunting for more parse-shape bypasses of `refusalTableRows` is not worth the time. A header rename or a blank line mid-table fails it closed (the result is [] or rows drop off).

## Ranked upgrades (tokens saved)

1. Name the mutant family per property in REV charges. This saves a charge, a paragraph and a finding round per pin review.
2. Regenerate the packet on every re-dispatch, and have packet-check refuse identical freeze ends and a `comments read through` count the ticket contradicts.
3. Promoted probes must never write outside their caller's directory. This means `OUT=${OUT:-$(dirname $0)}` and root from argv. N6 is the same class.
4. The later-pass package should carry `fix-range.patch` plus a scope block. This saves one git call and prevents reviewing the wrong range.

## Where this packet was unclear, exactly

- `:10`: freeze pair `0b3039434..0b3039434` (N3).
- `:23`: the NOTE comment that arrived 15 s after my read, and `comments read through: 1` (N4).
- The SCOPE block (the second charge 8): "re-run the pass-1 mutants from `<dirs>`" points at scripts that write outside `allowed`.
- The charge numbering has two 8s.
- Charges 3 to 6 are full pass-1 charges, while SCOPE narrows the pass to F1. I ran them all because they are cheap here (under 4 minutes of suites). On a slow slice, this ambiguity costs a full re-verification.
