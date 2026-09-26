# Self-report — REV-PES-S03-p3-security-data-safety (REV(S03) pass 3 of 3, security/data-safety, t_2f09dd19)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: blind Claude Opus subagent aa9c7d3723d777616 · 2026-09-25 21:01:41 → ~21:20 EEST · HEAD 9f29022f3, dirty 0 at start and end · verdict PASS (lens), 8 N findings, 1 V-ROW.

## The case in one paragraph
The rebase itself is sound for this lens: every mutant passes 1–2 proved RED is still RED at 9f29022f3 (18/18 identical outcomes, before→after table in the artifact), the FIX seat's 43 replayed members all match, the credential-file contract and §3 are byte-identical to dev, nothing under apps/ or packages/ moved, and no secret shape is in the diff. The one thing the rebase got wrong is not in the diff at all: dev's Task 14b hosted publisher (`pnpm register:publish-hosted`) seals a CODE-OWNED `panelDiscoveryPolicy` row at 600000 ms, and the operator file cannot carry that row. So R3.6's re-applied sentence ("the number an operator publishes is the whole control") describes a knob the sanctioned hosted path does not offer. The FIX seat's R3.6 row said "§11 has no paid-probe paragraph" and stopped there; it did not read the dev SOURCE that bears on the claim. That is N1 and the V-ROW.

## Cause, not symptom
1. **Rebase reconciliation was done README-against-README, not claim-against-source.** The FIX packet (charge 3) asks for "dev's README line(s) that bear on it". A frozen SPEC's factual sentence (R3.6) depends on SOURCE that dev also changed (hosted-register-publish.ts, 706 new lines). Upgrade: a rebase packet's reconciliation table gets a fourth column, "dev source that bears on the claim (path:line)", for every requirement that asserts behaviour. Price: one N1 + one V-ROW at pass 3 instead of a CONTESTED row at FIX time (~0 extra tokens if asked then).
2. **Pins check that words are present, not that the numbers are right.** Six mutants survive on R3.6/R3.1 alone (max_tokens 8→4096, "no minimum" → "a minimum of 60000", "publish at least 600000", floor 1→0, member rows reverted to dev's). These weaknesses predate the rebase and were not caught in passes 1–2 by the lenses' mutant sets (they mutated tables, not prose numbers). Upgrade: a README pin for a requirement that quotes a number reads that number from its source line (the way the 12-code pin reads codes) — `max_tokens` from provider-probe.ts, 600000 from dev-deployment-register.ts.

## What repeatedly cost tokens
- **Mutant scripts hard-code their lane and their output dir, and refuse to overwrite logs.** The FIX seat's f1-mutants.py asserts `LANE == pes-s03`; the p2 lens's mutants.py writes logs into its own (now-foreign) dir. Every pass re-points them by hand (~6k tokens here, similar in every prior pass). The packet law already says "root from $WORKTREE or argv, never hard-coded"; the FIX seat's scripts broke it. Upgrade: packet-check.sh greps promoted probes for `/Users/…/.worktrees/` literals and for `HERE`-relative log dirs.
- **The mission tree carries 11 MB of snapshot copies** (FIX-PES-S03-p2: 86 `.saved` README/test copies plus 1,600-line copies of packages/providers/src/index.ts), committed in 4e0d2a581 (145 files, 130k lines). Every `git diff --stat` over the freeze pair prints them. I deleted my own `.saved` copies after the cmp proof. Upgrade: `.saved` snapshots are scratch, never promoted; the RESTORE line with cmp=0 is the evidence.
- **Row-prefix mutants broke on dev's second table.** `p1-drop-PRICE_REQUIRED` asserted a unique row prefix and crashed because dev's publisher table (README:1225) starts with the same code. It cost one rerun. Scope row mutants by the full first cell (`… and the provider ref |`), not by the code.

## What I nearly got wrong
- I nearly counted the charge-4 "no absolute path of a credential file" rule as broken by the rebased api.env JSON (`/etc/debateai/api/providers/acme.header`, README:1113). It is the documented example path, and it is in dev at base (count 1 at a6d6382ba and 1 at head). Only its spelling inside JSON is new.
- I nearly read "support chat … daily call cap … still the only ceilings" (README:1005) as the sentence R3.4 removes. It is dev's newer claim: support chat spend is not counted in the envelopes. Source bears it out (packages/providers/src/index.ts:670-676, `assertPricedProviderTargets` covers DEBATE targets only), so it is KEPT-DEV and true.
- I nearly called N1 a REWORK. The sentence is SPEC-exact and overstates the exposure: the real hosted path is safer than the text says. A REWORK here would be V's row either way. PASS plus a V-ROW routes it the same way at lower cost.

## Dead ends (do not re-derive)
- Mutating the credential-file contract text shows that no suite pins it. It is dev-owned and byte-identical to base, so it is not an S03 defect (N8, routed out of the slice).
- `probes/FIX-PES-S03-p2/source-runtime-mutants.py` (executes copied source through a vi.mock seam) was not re-run: in MY worktree the direct source mutants (restored from captured bytes) test the same property more simply, and gave the same results as p2.
- The listener grep over the FIX seat's logs matched `:3000`. The match was the price literal `3000000`, not a port.

## Where the packet was unclear or fought me
- Charge 3 says to re-run "EVERY cluster command of the PLAN §3 table". Those pairs are 776359c3-era, so C1–C3 print CLUSTER_RED by construction. Only the package README's `## Pass 3` block gives the rebased command. PLAN §3 and SPEC §5 steps 2 and 5 were never restated for V (N7). A reviewer spends a turn making sure the RED is expected. The packet should name the rebased command as the verdict line.
- Charge 9 cites `reviews/REV-S03-p2-UNION.md`, but that file is not on the inputs line. I did not open it and relied on the FIX handoff's R1/R2 description. The packet should either list it or quote R1–R4 inline.
- The skill names `heartbeat-protocol` / `heartbeat-reviewer` resolve to the scoped `dialectical-engine:` variants; I loaded those. The packet could spell the scoped names.

## Upgrades ranked by tokens saved
1. Probe portability lint in packet-check.sh: no hard-coded lane, logs relative to the running seat's dir. Saves ~5–8k per reviewer per pass.
2. A "dev source bearing" column in any rebase reconciliation table. Saves a pass-3 V-ROW class.
3. Number-from-source pins for prose requirements. Closes six survivors, saving one future REV cycle.
4. No `.saved` promotion. Saves ~10 MB and a noisy freeze diff every pass.
5. Restate the rebased acceptance (SPEC §5 steps 2 and 5) in the V test point before TEST(S). Saves V a false RED at test time.
