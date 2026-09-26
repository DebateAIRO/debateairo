# Self-report: ARCH-FIX-PES-S02-p2 (node ARCH-FIX(S02), pass 2 of 3, ticket t_8bddd97c, 2026-09-25)

This is the ARCH-PES-S02 agent a19b961f9def28575 (claude-opus-5-5), resumed from the same session. Lane `.worktrees/pes-s02` @ 776359c38, dirty 0 at start and at end. The verdict consumed is `reviews/ARCH-REV-S02-p1.md` (REWORK), findings B1, N1 and N2. Artifacts: PLAN.md Revision 2 (949 lines) and a DECISIONS.md block of 7 rows, one of them a correction. Probes are in `probes/ARCH-FIX-PES-S02-p2/`.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## 1. The three killings and their causes

| # | Finding | CAUSE (not the symptom) | Price |
|---|---|---|---|
| B1 | One `deps.lookup` was written as two Node functions. Row 3 called it with no callback. Neither stock function reaches `PES-S02-ACCEPT: PASS`. | **My pass-1 feasibility spike used `dns.promises.lookup`, while the design passed the value to `https.request`.** The spike proved the chain, not the seam, and I copied its call shape into row 3 without running that shape against `node:dns` `lookup`. A spike that only partly matches the design is worse than none: it gave the row a "measured" feel it had not earned. | One full ARCH-REV pass plus this node (~1 pass each). Uncaught, BUILD would have gone 8/8 green on stubs, then failed S02-S19 with `FAIL internal`, or hung forever with the promise default. That costs one FIX pass at least, and the hang has no timeout to report it. |
| N1 | The checkpoint said 9/3; the true count is 10/2. | **I wrote a RED count by reasoning about the test titles, not the oracles.** Case (b) expects a throw that base already produces, so it is green before production. I never simulated each new case against base. | Cheap to fix, but a BUILD seat trusting 9/3 would have "fixed" (b) to fail, rewriting a test that needs no change. That is one BUILD cycle. |
| N2 | One JSON example was unlabelled. | **My pass-1 self-check regex matched only backtick-opened literals** (`` `{" ``). It missed a single-quoted `'{"…"}'` inside backticks, so the check reported "0 unlabeled" on a plan with one. I watched it FAIL on the reviewed copy in this pass (`selfcheck6-mutant.out`). | Minutes. But it is the exact failure the packet names: a checker that had only ever passed. |

## 2. What I nearly got wrong in THIS pass

1. **The promisify reason.** I first wrote a DECISIONS row rejecting the verdict's `util.promisify` repair because `node:dns` `lookup` "dispatches to `util.promisify.custom`". That was a memory, not a measurement. I then ran `b1-promisify.mjs`: there is no `promisify.custom` on node v26.9.0, and promisify returns the same array. The row is append-only, so I appended a CORRECTION row. The choice (`resolveAll`) stands on a weaker, true reason. The same disease as B1 nearly recurred inside the node that fixes B1.
2. **"tsc will catch it."** I assumed the typecheck would reject `dns.promises.lookup` as a `LookupFunction`. It does not: fewer parameters and a return value that is ignored are both assignable (`b1-tsc-mutant.out`: the no-callback call is rejected, TS2353; the promise function is ACCEPTED). Without that measurement the plan would have leaned on `pnpm typecheck` (S02-S15/S02-S20) as the guard. So S02-S18 now carries two `node:dns` greps.
3. **The tsc mutant in the wrong directory.** I first put the mutant copy in the scratchpad. It compiled as CommonJS and produced 19 unrelated TS1309 errors, which a hasty reader would take as "the mutant fails". I moved it into the module-typed probes dir, and only the intended error remained.

## 3. Dead ends (do not re-derive)

- **Relying on `tsc` to police the lookup binding.** Measured insufficient (above).
- **`dns.promises.lookup` anywhere in S02.** It never calls back through `https.request` (`req-timeout`) or `resolveAll` (never settles). It is REJECTED in DECISIONS with the log.
- **Rewriting S02-S03 (b) to fail at the checkpoint.** It guards the refusal rule after S02-S06. Making it RED earlier changes a test the final pair does not need changed.
- **Re-running the reviewer's `C1-base.sh` as it stands.** It writes its LOG into the reviewer's probe dir, which is outside my allowed list. I ran a copy with the LOG redirected (`rev-C1-base.sh`); the pair list is identical to PLAN §3.

## 4. Where THIS packet was unclear

- §1 says the comment cursor is 1. It is 3: two superseded orchestrator comments sit above the DISPATCHED comment. The dispatch message corrected it; the packet did not.
- §1 "run the reviewer's trace parser if one is in the probes". None was handed over (the verdict says "own parser"). I used my pass-1 checker and watched it FAIL on a mutant with one reverse row renamed (`trace-mutant.out`: `reverse=0`, `GAP`).
- "Re-run the reviewer's detectors". B1's two logs (`dns-callback.log`, `promise-lookup-as-https.log`) have no script in the dir. I rebuilt both as mutants M1–M2 inside `b1-lookup-shapes.ts`, plus M3.

## 5. Upgrades, ranked by tokens saved

1. **A spike must run the DESIGN's call shape, and the plan must say which lines it proved.** Pass 1 cited "spike log: the resolver admits through it" for a seam the spike never exercised. Rule: every "measured at base" citation names the exact expression measured. This saves an ARCH-REV + ARCH-FIX pair (the price of B1).
2. **Code in a plan is typechecked AND run by the ARCH seat before READY.** This node pastes `callbackLookup` and `resolveAll` byte-for-byte from a probe that `tsc` checked and ran, and `fix-detectors.py` (B1c/B1d) enforces the byte equality. As a template step, this closes the whole "plan code that does not compile or does not connect" class.
3. **Checkpoint counts are derived per case, with a table**: new case → its oracle → its state at base. N1 would not have been possible with that table.
4. **Ship `fix-detectors.py` and `plan-selfcheck.sh` with a failing fixture as standard.** Here the fixture is `git show <freeze>:PLAN.md`; every detector FAILED on it and PASSED on the revision.
5. **Packet generator: compute the comment cursor from the board, not from the template.**

## 6. One-prompt machine

The rework took roughly 40 tool calls. About 60% of them re-derived facts the pass-1 seat should have measured: the lookup shapes, the per-case RED states and the regex coverage. If upgrades 1–3 are in the ARCH template, a REWORK of this shape becomes a PASS at ARCH-REV p1, and this node does not exist.
