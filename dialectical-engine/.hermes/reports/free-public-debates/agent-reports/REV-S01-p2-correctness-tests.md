# Self-report — seat `REV-S01-p2-correctness-tests` (REV(S01) pass 2, lens correctness/tests)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## The body

All eight of my pass-1 findings are ADDRESSED by measurement. Twelve mutants of the new guards —
every guard the diff since pass 1 introduced — are caught. Two new N-findings, both of the same
shape as my pass-1 B1: **a property the SPEC of record names as checkable, with nothing that would
turn red if it broke.** Nobody wrote the assertion because nobody owns "the SPEC says a test can
decide this".

## The cause, not the symptom

**The pass-1 report identified the disease and the fix cured this instance of it, not the disease.**
My pass-1 self-report said the SPEC's `*Check:*` clauses are prose that nobody owns. SPEC-v3 then
rewrote R-6's Check into three numbered assertions and said, in as many words, "At least one test of
this slice asserts 1, 2 and 3 on the system path". FIX-A wrote assertions 1 and 3 and did not write
2 — and nothing noticed, because the trace table still traces requirement → cluster, not requirement
→ assertion. Mutant `G11` (the owner-driven path diverging from the shared snapshot builder) leaves
five suites green. Same story for SPEC-v3 §1's mechanical consequence (a): the SPEC spells out a
count equality a test can decide, FIX-A's own self-report lists "force a future route through the
helper by a static or route-inventory test" as upgrade #4, and no such test exists — mutant `G12`
adds a third `AnswerSchema.parse(` send site with no trigger and every suite stays green.

**Upgrade:** when a SPEC sentence contains "a test can decide", "a reviewer can run", or an
enumerated Check, the trace row must name the test file and case, and the REV lens greps for it. That
is three lines of tooling and it closes the only class of finding I have raised in two passes.

## What repeatedly cost tokens

| cost | wall-clock | cause | fix |
|---|---|---|---|
| **My own pass-1 probe transcribed the product's SQL instead of calling the product.** `ownedVisibility()` re-implemented `readOwnedVisibility`'s query. At pass 2 it passed — and then `G2`, which deletes the very guard the case exists to check, left it green. A probe that cannot be turned red by deleting its subject is worthless. | ~15 min, 3 full integration runs | Copying SQL into a fixture is faster to write than importing the repository. | A promoted probe must exercise the product's exported surface. Rebinding to `PostgresPublicationRepository` took four lines and made `G2` red. |
| **Two of my three re-derivations silently did not apply.** A multi-line `str.replace` with drifted whitespace is a no-op; I ran the suite and read a product failure that was my own stale assertion. | ~10 min, 2 runs | No assertion on the replacement count. | `mutant.sh` already refuses a non-unique literal — my ad-hoc edits did not. Every textual edit asserts its match count, always. |
| **Re-deriving the batch-cap case.** `0070` added a 30 s…1 h backoff, so `upsert_free_public_auto_publish_work` no longer produces a claimable row; the pass-1 case measured a state that cannot occur now. | ~5 min | The probe hard-coded a timing assumption. | The package's §4 warned about exactly this. The warning was right and cost nothing; the probe header should carry "PASS here means healthy" vs "PASS here proves the defect", as FIX-A also asked. |
| **Not paid this pass:** I did not re-read `product-since-p1.diff` (1395 lines). I read the six changed source files at the head and used `git diff` per path. | — | — | Keep telling reviewers to read the head. |

## What I nearly got wrong

1. **I nearly reported "C-B2 NOT ADDRESSED".** My probe said `publish_pending: true` beside
   `PUBLISHED` at the new head. The fix was there; my transcribed query was not. One more step —
   asking why a guard I could read in the diff did not fire — turned a false REWORK into the probe
   defect above. A false blocking finding at pass 2 sends the slice to its last pass for nothing.
2. **I nearly filed the three "dropped" test cases as a finding.** Pairs moved C2 16→20 and C4 14→17,
   and three case names vanished. Each was renamed to a stronger successor (`"returns NULL for a
   NULL tier with one DENY"` → `"…with no forgeable DENY…"`, because `0070` made the DENY
   unforgeable). Comparing name sets across the two heads, not counts, is what distinguishes a
   rename from a deletion; it is a ten-line script and it belongs in the runner.
3. **I nearly graded R-6 as fully asserted.** Assertions 1 and 3 are there and are strong. Assertion
   2 is absent, and the literal-object assertion subsumes it for every *system*-path divergence —
   which is why it looks done until you mutate the *owner* path.

## Dead ends — do not re-derive these

- The C-B4 locale defect is gone: `tests/integration/fpd-s01-c2-system-publication.test.ts:224-234`
  now carries `initdbFlags: ["--encoding=UTF8", …]`, and the slice list is 19/19 at its pairs with
  **zero** skipped tests under `env -u LANG -u LC_ALL` — the exact environment that produced 0/0 at
  pass 1. The class is swept: the repo has exactly two `new EmbeddedPostgres(` sites and both pin it.
- The 202 on a contended delete is now true: `0069` records the contention in a variable, completes
  the erasure (grant consumed, `PRIVATE` written, `private_run_key_cleanup_intent` inserted) and
  *then* returns `CONTENDED`. Measured, not read. Do not re-open V-9 on the old evidence.
- Every new guard in the diff since pass 1 has a failing case: twelve mutants, twelve reds. Do not
  spend a pass-3 budget re-mutating `ensureAutoPublishWork`, the projection guard, the
  `finishFailedAutoPublish` re-read, the answers-route trigger, `0069`'s queueing and both trigger
  tightenings, or `0070`'s prepare-bound check, backoff and audit admission.

## Where this packet fought me

1. **Charge 1 says "re-run your own pass-1 probe … A probe that hard-codes the pre-fix state is
   re-derived first, and you say what changed."** That is the right instruction and it saved the
   pass. What it does not say is *which direction a pass means* after re-derivation — my pass-1
   integration probe had one case whose PASS proved the defect and five whose PASS proved health, in
   one file. The packet should require the pass-2 seat to state, per case, what PASS means now; I did
   it in the probe README because nothing asked for it.
2. **Charge 3 says "passed=0 failed=0 or any skipped test is BROKEN"** — correct, and it is my own
   pass-1 N2 promoted to a packet rule. It is still not in `run-suites.sh:17-23`, so every seat
   re-implements the skip scan by hand (I grepped the logs). Putting the rule in the runner instead
   of in the packets is one `if`.
3. **Charge 4 sends me to the FIX seats' agent-reports for their `SKILLS LOADED` lines. Neither
   report contains one** — both carry it in the READY comment instead, which the same charge also
   names, so the line exists and this is not a fabrication. But the charge reads as though either
   source would do, and a stricter seat would have filed a finding on a formatting choice. Name one
   authoritative location.
4. **Packet line 8 again says "comment cursor at dispatch: 0 comments"**; `t_d2c8d5fc` already
   carried the orchestrator's `DISPATCHED` comment. Same defect as my pass-1 N4, unfixed.

## Upgrades, ranked by tokens saved

1. **`run-suites.sh`: `0 passed && 0 failed`, or any skipped test, ⇒ `BROKEN`.** Raised at pass 1,
   restated in this packet's charge 3, still not in the file. Every seat pays the hand-rolled scan.
2. **A promoted probe must call the product's exported surface, never a transcription of it**, and
   `mutant.sh`-style match-count assertions must guard every textual edit a seat makes. This pass
   lost ~25 minutes to the two failures of that rule, and one of them nearly produced a false REWORK.
3. **Trace row = requirement → test file:case, generated from the SPEC's `*Check:*` clauses.** Both
   new N-findings are invisible without it and mechanical with it.
4. **Case-name set diff between heads, printed by the runner when a pair moves.** Turns "did a case
   disappear?" from a judgement into a line of output.
5. **Probe headers declare PASS-means-healthy vs PASS-proves-defect, plus the head they were written
   against.** FIX-A asked for this independently; two seats paying the same tax is the signal.

## Toward the one-prompt machine

Pass 1 produced four blocking findings from 23 mutants. Pass 2 confirmed all eight fixes and found
two more gaps from 14 mutants — and every single one of those gaps is *a sentence the SPEC already
wrote*. The machine does not need a cleverer reviewer; it needs the SPEC's own Check clauses turned
into addressable rows that a script can mark covered or not. Combine that with the rule I proposed at
pass 1 — a cluster is not green until a named mutant of each requirement it covers has been shown to
turn it red — and the review seat stops being a judge and becomes a report reader. That is the last
expensive human-shaped step in this loop.
