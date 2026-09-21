# Self-report — REV-S01-p2-product-truth

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REV(S01) lens product-truth, pass 2 (scoped), `claude-opus-5`, the pass-1 session resumed with context intact. Wall clock ≈ 20 min. Verdict PASS with N-findings P2-N1, P2-N2, P2-N3.

## The one-line finding of this pass

**Resuming the same session was worth more than everything else in the packet.** I did not re-read the intake, COMMON's tables, the V rows I already knew, the pass-1 package or the code I had already mapped. Pass 1 cost roughly 70k tokens of reading before the first command; pass 2 cost about 18k, and the difference is almost entirely "I already know this repository". If one number from this mission goes into the protocol, make it that one: **a scoped re-review in a resumed session is ~4× cheaper than a blind one, and it lost nothing** — I still refuted, still found residue in the fix I asked for, and still caught the packet repeating its own ticketed defect.

## Cause, not symptom

The three fixes I measured were all correct *and* all narrower than the class I named. That is one cause, not three:

- **P-B3.** I wrote "no enqueue-before-attempt: **any throw** leaves the run PRIVATE with nothing outstanding." FIX-A swept "5/5 fallible **attempt** sites". Those are different sets. The enqueue landed after the bound check *and* after the visibility read, so two calls still sit above it (P2-N1). Nobody was careless: my finding named a class in prose, and the seat re-derived the class from the code it was pointed at.
- **P-B2.** Fixed properly, and fixed *upstream* — SPEC-v3 §1 replaced a route name with a mechanical test (`a route is answer-serving exactly when its success reply sends an AnswerSchema body`) that binds routes not yet written. That is the only fix of this pass that closes the class instead of its members, and it is the one where a REQ node, not a coder, did the work.
- **P-N1.** Backoff added, cap deliberately not — because V-2's default says "retried until it lands". Correct reading of a binding row.

**The cause: a finding travels as prose, and prose loses its quantifier.** "Any throw" became "the throws in the attempt". The remedy is not more words; it is that a blocking finding should ship with the *detector* that fails, so the fix is measured against an executable statement of the class rather than a sentence about it.

## Price

| item | cost |
|---|---|
| reading the pass-2 inputs (packet, COMMON, package, union, SPEC-v3 §1/§4, DECISIONS §31, V-8…V-11, two FIX handoffs) | ~18k tokens, ~6 min |
| re-deriving the pass-1 probe at the new head (15 unit + 5 DB cases) | ~12k tokens, ~5 min |
| six locale runs of the 21-file slice list + typecheck | ~4k tokens, ~7 min wall clock |
| the `zsh` quoted-list retry | ~1k tokens, 1 min |
| the case-name diff that produced garbage twice before I switched to `git show` + `it("` titles | ~3k tokens, ~3 min |

P2-N1 cost one probe case (P2-9) and about 90 seconds of thinking: "which calls are above the new line?"

## What I nearly got wrong

- **I nearly verdicted P-B3 ADDRESSED and stopped.** The diff reads convincingly: `ensureAutoPublishWork` sits right there before the fallible work, the try/catch is new, the tests grew 8→14. I only found the residue because I re-derived my own probe *case by case* instead of re-running it and reading the summary — three of my five pass-1 failures were interface drift, and if I had treated all five as "expected inversions" I would have missed that PT-4's replacement needed a *new* case for the calls above the line.
- **I nearly tiered P2-N1 blocking.** R-9 says in terms that PRIVATE-with-nothing-outstanding is a violation, and it is still reachable. I held it non-blocking because a REWORK here spends the slice's last lawful pass on an infrastructure-transient window, while the thing V will actually hit — V-8, no delete control — is already a V row no FIX can close. I want that trade recorded rather than hidden: if the orchestrator or another lens disagrees, the argument is in §5 of the verdict, with the counter stated.
- **I nearly repeated my own pass-1 trap.** I quoted `"$LIST"` into vitest and got `No test files found`, which the tooling-traps file says is BROKEN, not RED. I had read that heading at pass 1 and still did it. Reading a trap is not the same as having the habit.

## Dead ends

- **Comparing test-case names from vitest logs across passes does not work** — the `✓`/`×`/`↓` markers and the duplicated `describe >` prefixes defeat `comm`. Use `git show <old>:<path> | grep -oE 'it\("[^"]+"'` against the same grep at the new head. That found all three renamed cases in one command.
- **`grep -c 'rev-s01-p2-product-truth'` over a typecheck log counts the worktree path, not the file.** Anchor on `^tests/`.
- **`ensure_free_public_auto_publish_work` resetting the backoff was my first suspicion and it is wrong**: its `ON CONFLICT … DO UPDATE … WHERE cleared_at IS NOT NULL` leaves an outstanding row alone. PTDB2-5 proves it; do not re-derive.

## Where THIS packet was unclear

1. **Line 8 says `comment cursor at dispatch: 0 comments`; the ticket had 1.** Identical to the defect ticketed at pass 1 (C-N4). The packet generator still counts before the DISPATCHED comment it is about to write. One-line fix at the source, and it has now cost three lenses a double-take across two passes.
2. **Charge 4 says the FIX seats' *agent-reports* carry the `SKILLS LOADED` lines.** They do not; the READY comments do, which the same sentence also names, so I could execute it — but a seat that opened only the reports would have filed a false fabrication finding. That is the sharp end of a loose sentence.
3. **Charge 1 says "re-run your own pass-1 probe … A probe that hard-codes the pre-fix state is re-derived first, and you say what changed."** Good instruction, and it is the single most useful sentence in this packet. What it does not say is what to do when a probe fails for *neither* reason — mine failed three times on an interface change to the repository double, which is neither "the product changed" nor "the probe pinned the old state". A third category ("the seam moved") belongs in that sentence.
4. **Charge 6 pre-verdicts P-B1 as "with V".** I agree with it here, and I said so. But it is the same shape as pass 1's charge 5, which I filed as a defect for pre-tiering: a packet telling a lens what verdict to write on a specific finding. The difference is that this one names the reason (no file of a backend-only slice can close it) and is checkable — which is the right way to do it, and worth copying.

## Upgrades, ranked by tokens saved

1. **Every blocking finding ships with its detector.** I promoted probes at pass 1 and the packet made the FIX seats re-run them — that is why four of five findings are cleanly verdicted today. Make it a law rather than a charge: *a blocking finding without an executable case is incomplete*, and the FIX node's exit condition is that case inverting. It would have caught P2-N1 inside FIX-A's own run, at a cost of zero review passes.
2. **Resume the lens session for scoped passes, always.** ~4× on reading tokens, measured here against my own pass 1. The blindness that matters (other lenses) is preserved; the blindness that costs (my own repository knowledge) is not worth re-buying.
3. **Fix the class upstream when the root cause is a definition.** SPEC-v3 §1's mechanical test for an answer-serving route is the cheapest artifact of this whole mission: it closed P-B2, it binds routes nobody has written, and it turned into a two-line test (P2-3) that any future reviewer can run. Prefer "write the test that decides the term" over "hook the second route".
4. **Put the locale pair in the runner, not in the packets.** Charge 3 now says run every list twice and treat a skip as BROKEN. That is protocol text repeated in three packets per pass; it belongs in `run-suites.sh` once (C-N2's ticket), where it also fixes the summary line that made P-N3 invisible at pass 1.
5. **Give `DECISIONS.md` folds a `path:line` citation requirement.** §31's N4-p3 names the public list where step 3b reads the answer index (my P2-N2). A fold that must cite the line it corrects cannot name the wrong route.

## On the one-prompt machine

Pass 1 found three holes because I was blind and slow. Pass 2 found the residue of one of them because I was resumed and fast. Both were needed, and the protocol already knows this — blind first, scoped after. The remaining waste is not in the passes, it is in the *handoff format between them*: a finding written as prose has to be re-understood by a fixer, re-verified by a reviewer, and re-argued when they disagree about its edges. Ship the case, not the sentence, and the second pass becomes a re-run instead of a re-reading.
