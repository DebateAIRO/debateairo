# Self-report — REV-PES-S03-p3-correctness-tests (REV(S03) pass 3 of 3, lens correctness-tests, ticket t_6c233407)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: fresh blind Claude Opus subagent `ab2e794c86368ef69`, worktree `.worktrees/pes-s03-rev-ct` at 9f29022f3, 2026-09-25 21:01–21:2x EEST. Wall-clock ~25 min; no retries; 74 mutants + 1 behaviour fixture + 3×3 suite runs.

## The case: what the rebase killed, and who let it die

**Victim:** R3.3's Meaning clause ("each row's Meaning column states the condition that emits it, taken from the line of source that throws it") for `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`.
**Weapon:** the V-18 rebase's KEPT-DEV rule. Before the rebase the slice's row said "a declared amount is not an integer from 0 through `Number.MAX_SAFE_INTEGER`" (passes 1–2 checked it). The rebased C2 commit (b57c45ca5, visible in `range-diff.txt` as the `-|` rows) dropped it in favour of dev's row, README:1040 — "a price that is not a whole, non-negative number" — which says nothing of the upper bound. My behaviour fixture ran the shipped parser: `2**53` is a whole non-negative number and still refuses `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID`.
**Accomplice:** the FIX-S03-p2 packet. Its method sentence ("either dev's text already says what the requirement asks (quote dev's line — then keep DEV's text …)") was applied to R3.3 as PRESENCE of six rows, because charge 3 of that packet framed R3.3 only as "six rows … measured against BOTH tables". Nobody re-derived the Meaning cells from source. **Cause, not symptom:** a KEPT-DEV decision has no mechanical oracle. The seat quoted dev's line, and the quote was true, but the quote was not compared to the source line the requirement names.
**Why no pin caught it:** residue R2 (Meaning cells are not tied to code). It was ticketed as a TEST gap; here it turned into a TRUTH regression, because the rebase replaced correct text with text that no pin reads. R2 cost nothing while nobody edited Meaning cells, and it cost this pass once somebody did.

## What cost tokens (priced)

1. **Re-anchoring other seats' mutants: ~30% of my tokens.** p1/p2/FIX mutant scripts anchor on literal README text and on 776359c3's JSON member order. The p2 script writes logs BESIDE ITSELF, so I could not run it in place (that would have written into another pass's probe directory, outside my `allowed`). I re-implemented 38 of them. Upgrade: every promoted mutant script takes `OUT=` from argv, and anchors on STRUCTURE (the row whose first cell is `X`, the example line holding `/api/`), never on prose.
2. **Reading the package's two contradictory typecheck lines: ~2k tokens.** Its frames bullet says "the baseline is 1 (… TS2835)"; its Pass-3 block says 0. The template line was never updated for the new base.
3. **Stale oracles across the board: ~8k tokens.** PLAN §3's pairs (31 baseline, 24/28 v9) print CLUSTER_RED at the head by design. SPEC §5 step 2 says the intake pair (31/0), and the head shows 43/0. Step 5 reads a list dev deleted. Each one had to be proved "red by construction" before I could trust the GREEN command. The V-18 rebase changed the base, and none of the orchestrator's oracles were re-stamped.

## What I nearly got wrong

- I nearly filed R3.4 as broken because the head still says "for the support chat its own daily call cap and per-visitor share are still the only ceilings". The source's own docstring (`packages/providers/src/index.ts:671-676`: support keeps its own spend accounting) and dev's Known-limitations bullet (README:952) make it TRUE, and the sentence names two ceilings, so it does not say "the daily call cap is the only ceiling". I downgraded it to a note.
- I nearly counted `COST_ENVELOPE_POLICY_INVALID`'s "malformed" as a second member of B1. The throwing line's own message (`cost-envelope-policy.ts:134`, "absent or malformed") uses that word, so I kept it out.
- I nearly trusted "range-diff `=` for C1" to mean C1 was unchanged in effect. At e6d059552 the table carries all six codes TWICE, 14 rows, with conflicting Meaning cells (C1's rows beside dev's), and C2 removes the duplicates. The intermediate commit is not bisect-clean.

## Dead ends (do not re-derive)

- Running the p2 `mutants.py` unmodified: it writes into its own directory and aborts on the first 776359c3-era anchor.
- A retype-versus-source check without a source mutant proves nothing. Only `retype + src-rename/add` (GREEN) against `src-rename/add` (RED) shows what the source-read buys.

## Where the packet was unclear

- Charge 4 says "a TEMPORARY mutant of `deploy/vps/README.md`". Charge 9 asks me to re-run p2's source mutants, which write `packages/providers/src/index.ts`. The rebase seat used source COPIES because it read production writes as forbidden. I read §2's "a temporary mutant in YOUR worktree … is the refutation duty" as covering it, and restored byte-exactly. One sentence would settle it.
- "V-8's exclusion and R3.3 are measured against BOTH tables": R3.3 names ONE table (SPEC :64). I measured both and judged R3.3 on the primary one.
- The inputs line lists the freeze diff but not what to look for in 130k lines of it. I ran it (it prints: 145 files) and used only the package paths.

## Upgrades, ranked by tokens saved

1. **KEPT-DEV needs an oracle** (saves a pass-3 REWORK plus a V row). A FIX packet that says "keep dev's text where it already says X" must also name the SOURCE LINE X is checked against, and the seat's reconciliation row must quote both. Better still, make R2 a pin: every six-code row's Meaning is compared to a per-code condition string read from source anchors.
2. **Re-stamp every oracle at a rebase** (~8k tokens a lens). When V-18-style rebases change the base, the orchestrator regenerates SPEC §5's pairs, PLAN §3's pairs and the package template lines in one script before dispatching REV.
3. **Promoted mutants are structure-anchored and write logs where they are TOLD to** (~30% of a lens's tokens on every later pass).
4. **Pin values, not names** (closes N2–N4 cheaply). Parse §11's two env forms through `parseProviderDiscoveryTargets` + the hosted checks (my `rev-pes-s03-p3-ct-behaviour.test.ts` does it in 40 lines). A pin that only greps a member NAME cannot tell a 0 price from a real one.
