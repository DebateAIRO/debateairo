# SELF-REPORT — REQ-FIX-03 · mission `free-public-debates` · node REQ-FIX, pass 3 of 3 (the cap)

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REQ-FIX-03 — the REQ-01 seat resumed a second time. Wall clock: ~31 minutes. 0 new skills (all
five were already loaded), 11 file reads, 14 shell calls, 19 mutants, 0 escaped. `REQ-01.md` and
`REQ-FIX-02.md` are not repeated here; this is the third death, and it is the same killer.

---

## 1. Cause of death: I define a term from the first example I read, not from the set

Three passes, three blocking findings, one shape.

| pass | finding | the term I wrote from one example |
|---|---|---|
| 1 → 2 | B1 | `bound` covered two populations; only R-4 carved out `BLOCKED` |
| 1 → 2 | B3 | the acceptance walk, written from the **route** file, never from the request schemas |
| 2 → 3 | **P-B2** | **the served answer = `GET /v1/runs/{id}/answer`**, the one route I had read |

P-B2 is the most expensive of the three because it was *correct on its face*. Every requirement
inherited the narrow definition faithfully, ARCH planned against it, a coder built it, and three
review lenses walked a slice that does exactly what the SPEC says — while a Free debate read through
`GET /v1/answers/{id}` stayed private for ever, through the route the shipped UI tries **first**
(`apps/ui/lib/serverApi.ts:104`). PRICE: the C2 build, a full REV(S01) pass across three lenses, this
rework and the scoped re-review that follows it. On my estimate 150–250k tokens and most of a day of
fleet wall-clock, for one sentence in a vocabulary block.

**The cause is not carelessness; it is the wrong kind of definition.** I defined by *instance*. A
definition by instance is true the day it is written and silently false afterwards. What I wrote this
pass is a definition by **predicate plus the command that enumerates it**: a route is answer-serving
exactly when its success reply sends a body parsed by `AnswerSchema`, and
`grep -c 'AnswerSchema.parse(' apps/api/src/index.ts` → **2**. Had §1 said that at pass 1, P-B2 could
not have existed: the second route would have been found by a command in the first five minutes,
rather than by a lens after the code was written.

## 2. Counts I was given, and what I found

Charge 2 says the product-truth lens "measured two and named two more it did not assert". I measured
all of them, plus the rest of the family:

- **Answer-serving routes: 2**, not 4 — `GET /v1/runs/{id}/answer` (`:1115`) and `GET /v1/answers/{id}`
  (`:1007`), the only two `AnswerSchema.parse(` send sites in the whole API at `db4758da`.
- The two the lens listed but did not assert are **not** triggers: `.../inspection` sends
  `InspectionSchema`, `.../nodes/{nodeId}` sends `NodeSchema`. `GET /v1/answers` sends
  `AnswerIndexSchema`, and `.../ledger-digest` sends `ExecutionLedgerDigestSchema`.
- This mattered. The charge's wording ("named two more") invites a seat to include all four to be
  safe. Publishing a Free debate because its owner fetched **one node** would publish a debate nobody
  read — a rule stricter than V asked for, and one no acceptance step would have caught.

## 3. What I nearly got wrong

1. **I nearly enumerated the two routes and stopped.** That is P-B2 again with a bigger number. What
   saved it was charge 2's last clause — "say what a route added LATER must do" — which forced the
   predicate. That clause did more work than the rest of the packet.
2. **I nearly left the second Free debate public at the end of V's walk.** Steps 3b/3c create a second
   published debate; step 11 asserts the public list is back to its step-1 total. Without step 11b,
   V's own acceptance would fail at step 11 — an unrunnable walk, which is the exact defect pass 2
   existed to fix. I caught it only because I was writing 3c's cross-reference and re-read step 11.
   **Twice in two passes I have broken the walk by adding to it.**
3. **My own checker passed with three dead assertions, and the mutants found all three.** In a
   checker written by the seat that introduced the mutant discipline:
   - `"GET /v1/answers/{id}"` is a **prefix** of `"GET /v1/answers/{id}/inspection"`, so deleting the
     route's table row still satisfied a naive substring search;
   - R-4's sweep guard keyed on a phrase **I had myself rewritten**, so the guard could never fire;
   - `"11b."` also matches the cross-reference "…for step 11b." in step 3c, so deleting step 11b
     entirely still passed.
   Three decorations out of 45. Without the mutant run I would have quoted a green checker over a
   spec with an unguarded route table.

## 4. Dead ends, and what I deliberately did not read

None this pass — and that is the number worth reporting. Pass 3's reading was: the packet, COMMON §6,
the union verdict, three named lens sections, V-10, and ~60 lines of product at the lane head. I did
**not** re-read `migrations/0040`, the intake baseline table, the 1145-line PLAN in full, or the
twenty-two requirements no finding touched. Reading cost was roughly a third of pass 2's, because the
packet named sections rather than files. That is the packet doing its job, and it is worth saying so:
`inputs` that name `<file> (section B2 only)` is the single cheapest line in this whole system.

## 5. Where THIS packet was unclear — exactly

- **`REQ-FIX-03.md:29`** tells me the lens "named two more it did not assert" and to name the routes,
  but not what to do when the two turn out not to qualify. Read literally it nudges toward including
  them. I measured and excluded them, and wrote the measurement into §1 so the next seat does not
  re-open it.
- **`:29`'s read command.** The lane worktree is `.worktrees/fpd-s01` but the path inside `git show`
  carries a `dialectical-engine/` prefix; the packet gives the command, which is right, but the two
  path shapes in one line are easy to transpose. Cost: one failed command.
- **`:31`, "decidable from the snapshot and the run alone".** Assertion 2 (parity between the system
  and owner paths) needs a second snapshot as a control. I read "alone" as excluding *external state*
  — a clock, a deploy time — not as excluding a control sample, and said so explicitly in the Check.
  If the charge meant one snapshot literally, parity is impossible and S-N7 cannot be closed the way
  the lens asked.
- **`:28` vs `:17`, for the third packet running.** Charge 1: change only what the findings force.
  §2 verification: re-point every `path:line` that points into a SPEC. `DECISIONS.md` §10 had already
  recorded two SPEC pointers as wrong. Carrying a known-wrong pointer forward and fixing it each
  violate one of the two lines. I fixed, and declared it on the supersession line as folded-not-new.
  **This collision should be settled in COMMON once, not re-adjudicated by every REQ-FIX seat.**
- **The allowed list still has no home for a handed-forward detector.** `spec-v3-check.sh` sits in
  `slices/S01/` for the same reason `spec-v2-check.sh` does.

## 6. Upgrades, ranked by tokens saved

1. **Define every term by a predicate over the code plus the command that enumerates it.** Three of
   four blocking findings across three passes were a definition written from one example. This is the
   highest-value single rule in this mission. *Saves a REV pass and a build cycle per occurrence —
   here, on the order of 150–250k tokens.*
2. **A vocabulary lint on §1 of every SPEC.** Each defined noun carries the predicate, the command
   that lists today's instances, and the count that command returns. A reviewer re-runs the command on
   any later commit; "is the SPEC still true?" becomes one line instead of a re-read. *Saves the
   re-derivation every lens does.*
3. **Make the acceptance walk self-balancing.** Any step that creates public state names the step that
   removes it, and the walk ends at the baseline it measured at step 1. A script can check it. I broke
   this in two consecutive passes.
4. **A prefix-collision rule for text assertions.** A needle that is a prefix of another token in the
   same document is a decoration. Two of my three dead assertions were prefix collisions; a checker
   can self-test by asserting each needle's occurrence *count*, not its presence.
5. **Ship the mutant harness beside the checker it exercises.** Mine lives in a scratchpad and dies
   with this session, so the next seat re-derives it. Blocked today by the allowed list (§5).
6. **Put "killed / escaped" in the eight-line handoff.** It is the one number that distinguishes a
   checker from a decoration, and it costs four words.

## 7. What I did not verify

No live `$API` / `$WEB`: steps 3b, 3c and 11b are verified as **text** against the contract schemas at
`db4758da` and are **UNVERIFIED as executed**. No suite was run and no cluster command re-run — the
cluster table is the coding seats', and REQ writes no code. I did not read the lens probes, only the
three lens sections my packet named. The count of answer-serving routes (2) is measured at both
`db4758da` and mission-home HEAD. Both earlier SPEC versions were verified byte-identical to their
freeze commits (`06e4eceb`, `69d119c5`) by the checker, on every run.
