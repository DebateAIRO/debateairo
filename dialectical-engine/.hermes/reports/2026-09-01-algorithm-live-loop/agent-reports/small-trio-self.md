# SELF-REPORT — lane/small-trio (F-DEV-REGISTER-ROLE-REF-OVERRIDE + F-DIAG-ERASURE-CAUSE-LOSS + F-T9-UNATTENDED-PROMISES) · murder-case format

Seat: heartbeat-worker, Opus 5, one seat, three tickets, one lane, round 0.
Lane: `lane/small-trio`, base `116db3455d5c0aad985c7212e348d8c04a554ad7`, tip `ac2ccbb96cfdd0c0234aa4727e2f80f3f051dcb4`.
Wall clock: 04:15 → 05:00 CEST, 2026-09-08 (≈45 minutes), of which **21 minutes was the T9 gate ×3** and 2 minutes the two erasure integration files. Reading, writing and refuting cost about 20 minutes.

---

## The victim

Three small diagnostic escapes that nobody would ever schedule a lane for on their own, batched into one seat because they share exactly one property: **a place where the code knows something and refuses to say it in a bounded way — or says it in an unbounded way.**

- One appended an operator's environment string to an error code.
- One threw away three different causes and called all of them the same word.
- One held 64 promises for 22 seconds with nobody watching them.

The batching was the right call and it is worth saying why: the three fixes share one *shape* — a frozen vocabulary of constants, chosen by the site, read back through a named function — so the second and third cost a fraction of the first. Three separate lanes would have paid three provisioning costs, three baselines, three gate cycles and three reports for the same 556 lines.

## Cause of death, ticket 1: a template literal that nobody re-read after the code became a code

`` throw new TypeError(`DEV_ALGORITHM_REGISTER_ROLE_REF_UNCONFIGURED:${override}`) ``.

That line was correct on the day it was written, when `DEV_…` codes were just strings. It became a defect the day this corpus decided a `DEV_` code is a **bounded vocabulary** (`apps/runner/src/dev-auth-stack.ts:105–127`, `/^DEV_[A-Z0-9_]+$/u`). Nothing re-scanned the old sites; the joiner's regex only checks the codes it is handed, not the strings that pretend to be codes.

**Upgrade, and it is mechanical:** when a class becomes a vocabulary, grep for every producer of that prefix that is a template literal. One line finds it:
`grep -rnE 'new (Type)?Error\(`[A-Z_]+:' --include='*.ts'`. This is a five-second check that closes a class the moment the class is declared, and it belongs in the ratification of any "X is now bounded" decision.

**The second-order lesson, which is the expensive one.** Appending the value did not only leak. It also silently *closed the bounded channel*: `developmentSynthesisRoleRefUnconfiguredRole` matches the message exactly, so mutant A — which only re-appends the value — killed the role assertion too. A reader who "improves" the message later will disable the diagnostic without any test naming the message as the reason. That is now pinned by three assertions, but the general shape is worth stating: **a classifier that matches on a message makes that message a contract, and nothing in the language says so.**

## Cause of death, ticket 2: `} catch {` is a decision, written as an absence

Three catches, `:746 :761 :966`, each `} catch {` with no binding. The syntax makes discarding the cause look like the default rather than a choice, and reviewers read it as punctuation.

What made this cheap to fix and easy to get wrong: the temptation is to conflate "preserve the cause" with "preserve the CAUSE". The right answer is neither forwarding it nor logging it — it is recording what **the catch knows about itself**, which is bounded by construction because there are exactly three of them. The landed `packages/db/src/auth-risk.ts` pattern already said this in a comment nobody had transplanted here yet.

**The property I nearly missed** is not "the stage is present". It is "the stage is present **only** on the swallow path". `INVALID_EVIDENCE` is returned from three places in one method; if the stage rode on all of them it would say nothing, and it would also break `tests/integration/s6-content-encryption-database.test.ts:2331`, whose `toContainEqual({ runId, outcome })` is an exact object match. That property had no mutant in the packet. I added one (E) and it kills a real assertion. **A packet's mutant list is a floor: the property that protects an EXISTING assertion in another file is exactly the one a packet author, looking at the new code, will not think of.**

## Cause of death, ticket 3: the promise had a `.then`, so it looked handled

`issued.push(injectResend(…).then((observation) => Object.freeze({…})))`.

`.then(onFulfilled)` is not a rejection handler. It creates a *new* promise that rejects the same way, and the original is now attended only through that derived one — which is itself unattended until the join, 22 seconds later. Reading it as "there's a `.then`, so someone's watching" is the trap, and it is a very easy read.

The fix is five lines and preserves `Promise.all`'s exact semantics because `issued` keeps holding the ORIGINAL promise; the helper only marks it attended. The alternative that first suggested itself — `allSettled` and re-raise at the join — changes both which rejection wins and when, on the one path that matters. Worth naming as a dead end below.

**Upgrade:** the lane/flakes trap entry says to read an unhandled-rejection stack as "who was holding this promise". Add the corollary this lane paid for: **`.then(fn)` on a pushed promise does not attend it — grep for `push(` followed by a promise expression that has no `.catch` and no `await` in the same statement.**

---

## What repeatedly cost tokens and wall clock

| what | cost | fixable? |
|---|---|---|
| **T9 ×3** | **21 min of a 45 min lane, 47%** | Partly. Each run is ~7 min and 68 of the 69 rows in the file are filtered out, so ~1 min of it is the test and ~6 min is embedded-PostgreSQL start plus module import plus five other windows. See below. |
| Two erasure *integration* files (s6 is 5,160 lines, 48 tests) | ~90 s | No, and it bought the strongest evidence in the lane. |
| Reading 2,343 lines of TOOLING-TRAPS | ~2 min of context, and it paid for itself twice | No. Two entries (the shape-legal synthetic; the promise held across an await) directly shaped two tests. |
| Re-deriving that `-t` needs the ENCLOSING `it`'s name, not the region | ~1 min | Yes — a packet that names a `-t` gate should quote the filter string. |
| The `ERR_UNHANDLED_REJECTION` marker | ~4 min | Yes, and now it is a trap entry. |

**The T9 number is the headline.** The packet asks for T9 ×3 to prove the window's behaviour is unchanged. That is the right requirement. But 6 of every 7 minutes is spent on five windows and a database that the change cannot touch, and the run is serialised behind `fileParallelism: false`. Three runs of a ~1-minute property cost 21 minutes of a 45-minute lane.

## What I nearly got wrong

1. **I nearly wrote a hand-written copy of the T9 loop.** It would have been green before and after the fix. I caught it by asking the §2 question *before* writing the assertion — "what mutant does this catch?" — and the answer was "none". That question, asked before the test rather than after, is the single highest-yield habit in this contract. It cost 30 seconds and saved a round.
2. **I nearly reported the s8 failure as unexplained.** It is `Cannot read properties of undefined (reading 'map')` in a publication proxy test — plausibly mine at a glance, since I edit a `packages/db` file that the test imports. Four cheap checks settled it in under two minutes: `DECISIONS.md` names the exact test and error (D23 ADDENDUM-5), `git merge-base --is-ancestor` puts the regression inside my base, a sibling lane's log has the identical received string, and my diff touches nothing on that path. **A failure you cannot attribute is not a failure you may narrate; there are always four mechanical checks and they are all faster than a paragraph of hedging.**
3. **I nearly declared the RED capture sufficient for the T9 control row.** The row's assertion text changed after the capture. Rather than argue it, mutant F gives the corrected row an explicit tip-side red frame. Cheap; and "the assertion changed after the RED" is exactly the shape that turns into a review finding.

## Dead ends — do not re-derive these

- **`allSettled` + re-raise at the join** for T9. It works, but it changes which rejection wins (first-by-index rather than first-in-time) and when it is raised (after all settle, not on first rejection). `void p.catch(() => undefined)` while pushing the ORIGINAL preserves both exactly. Do not "improve" it into `allSettled`.
- **Named imports in a test whose subject is a NEW export.** The module's link step fails and every row in the file reports the same load error, so the RED capture names the module rather than the property. A namespace import (`import * as m from …`) makes the leak rows fail on their own assertions and the new-symbol row fail on its own missing member. Two of the three test files here use it for exactly that reason.
- **Asserting `ERR_UNHANDLED_REJECTION`** to detect a process killed by an unhandled rejection. Node prints that code only for non-Error reasons. Assert the death: nonzero exit, the post-join marker absent, the join's own catch never reached. In TOOLING-TRAPS now.
- **Mutating a stage string to a sibling stage string with mutate.sh.** The pre-gate requires the NEW token to be absent from the file, and the sibling constant is present in the vocabulary array. Widen the OLD/NEW to a multi-line block that includes the surrounding lines; mutate.sh v2+ counts substrings, so multi-line works.
- **Emptying a line with mutate.sh** — already in TOOLING-TRAPS from lane/dev-health, and still true: `"abc".count("")` is 4, so an empty NEW always trips the pre-gate.

## Where the packet was unclear, exactly

The packet was, by the standards of this corpus, unusually good: every fact it quoted was true, every path resolved, and the outcome statements were mechanism-free. Three places still cost me a decision each.

1. **"the resolve helper only" vs the bounded channel.** The `allowed` list says the helper; the outcome requires a bounded channel; a bounded channel needs a vocabulary and a reader, which are not "the helper". I widened by 16 lines and disclosed it. **A packet that requires a landed PATTERN should name the pattern's own footprint in the `allowed` list** — "the resolve helper, plus a frozen vocabulary and its reader beside it, as in `packages/db/src/auth-risk.ts:49–69`" would have removed the decision entirely.
2. **"the four erasure tests ×1 each … stay green."** One of them has a pre-existing dev failure that the mission's own DECISIONS file already records. The packet did not say so, so a seat has to discover it mid-gate and prove it. **Any packet that names an existing test as a gate should carry that test's known-red rows, or say "no known-red rows".** This is a one-line lookup for a packet author with the DECISIONS file open and a five-minute investigation for a worker who is mid-gate.
3. **"T9 via `-t` ×3 isolated"** without the filter string. The region is at `:7104`; the enclosing `it` is at `:6461` and its name is 79 characters long. Quoting it in the packet is free.

One thing the packet got exactly right and that is worth copying: **"OUTCOME (D58: what must be true; you choose the mechanism)"** followed by "RED first: …" per ticket. Being handed the property and the required red frame, and *not* the implementation, is what let the T9 test become a behavioural pin instead of a grep — the packet's own suggestion ("show the unhandled-rejection path … in a unit-sized reproduction if you can isolate it; otherwise state why") explicitly invited the better answer and licensed the honest fallback.

## How to make this more of a one-prompt machine

1. **Ship a gate-cost budget in the packet.** "T9 ×3 ≈ 21 min" would have let me start it earlier and interleave the report drafting instead of polling. A packet that names each gate's expected wall clock lets a seat schedule its own lane. The orchestrator has these numbers from every prior lane; the seat has none.
2. **Start the long gates before the short ones.** I ran unit + typecheck first because they are cheap, then queued the 23 minutes of database gates. Reversed — long gates in the background, cheap gates and the report draft in the foreground — this lane finishes in about 30 minutes instead of 45. That is a scheduling rule, not a skill: **launch every gate whose cost exceeds two minutes as a detached job at the moment the tip is committed, then do everything else while they run.** I did this only for the second half.
3. **A `known-red.md` per mission, generated, not written.** One file listing every test row that is red at the mission's dev base, with the DECISIONS line that adjudicated it. Every lane that trips one currently pays 2–5 minutes proving it is not theirs; there have been at least three such lanes (w5, t1-oracle, this one). Generate it from the last full-suite record — the orchestrator already has those logs.
4. **Promote "extract the region and run it" to a named technique.** It converted a source-text check into a behavioural one at a cost of about 40 lines, and it applies to every property that lives inside an expensive integration test — of which this corpus has many. The recipe is in TOOLING-TRAPS now: two stable anchors, a stub preamble, `node --input-type=module-typescript -e`, and a positive control that mutates the slice and requires death. **The control is not optional: without it the row passes on an empty string.**
5. **Make the RED capture per-file, not per-batch.** One capture over three files gave `11 failed | 5 passed (16)`, which is correct but forces a reader to reconstruct which failure belongs to which ticket. Three captures cost three seconds and read as three tickets. I reconstructed it by hand into the report's RED table; the tooling could have.
6. **A mutant that pins an EXISTING assertion in another file should be mandatory, not discretionary.** Mutant E was my addition. The rule that generates it: *for every field you add to a returned record, mutate it onto the paths where it must be absent.* Any packet that says "public vocabulary unchanged" implies this mutant and should ask for it by name.

## Findings I could not fix, named for tickets

- **`tests/integration/s8-publication-database.test.ts:1678`** — the pre-existing dev regression (DECISIONS D23 ADDENDUM-5) has an adjudication but, as far as this seat can see, no ticket. It taxes every lane in this area. Out of contract here.
- **`tests/unit/s14-ui.test.ts`** — the 8 diagnostics that make repo-wide `tsc --noEmit` exit 1 (two missing `../../web/lib/*` modules, two `unknown`, two implicit `any`, two `TS2339`). They make every lane's typecheck gate an identity check against a red baseline. Out of contract here; small and self-contained if anyone wants the repo green.

## Cost

| phase | wall clock |
|---|---|
| packet, protocol, skills, TOOLING-TRAPS, the three tickets | 04:15 → 04:22 |
| verifying every packet fact by grep, reading the three sites and the two landed patterns | 04:22 → 04:26 |
| writing the three RED test files, scratch run, RED commit + capture | 04:26 → 04:31 |
| the three fixes, GREEN, the one debugging cycle, traps append, commit | 04:31 → 04:32 |
| unit ×3 + typecheck ×3 + identity | 04:31 → 04:32 |
| erasure ×4 + t16 + T9 ×3 (detached) | 04:32 → 04:56 |
| six mutants + stamp-check | 04:57 → 04:58 |
| report + self-report | 04:58 → 05:00 |

Two commits, no rework rounds, no blocked steps, no re-taken records. The single re-measure risk — a TOOLING-TRAPS append moving the tip after records were stamped, which cost lane/diag-tail a full re-take — was avoided by appending and committing before the first tip record, which is the ordering that file itself now recommends.
