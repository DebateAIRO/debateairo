# Self-report — REV-S01-p1-product-truth

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REV(S01) lens product-truth, pass 1, `claude-opus-5`, Agent-tool background session. Wall clock ≈ 25 min from packet open to verdict. Verdict REWORK with B1 B2 B3 and N1…N5.

## The body on the floor

The slice does what the SPEC says. All three blocking findings are places where **the SPEC is narrower than V's sentence**, and nobody downstream could see it because every seat after REQ was correctly reading the SPEC.

- **B2** (`GET /v1/answers/{id}` serves the answer and never triggers the publish) exists because `SPEC-v2` §1 turned V's *"when a Free run's answer is served"* into a single route. That is a fine engineering observable and a bad product one. The builder hooked the route the SPEC named. The reviewer of the SPEC had one pass and spent it on acceptance-step wording.
- **B3** (a throw leaves the run private with nothing queued) exists because R-9 was written as a *post-condition* (`PUBLISHED`, or `PRIVATE` with a record) instead of as a *mechanism* (enqueue before attempting). A post-condition can be satisfied on four enumerated paths and violated on every unenumerated one, and the four enumerated ones are exactly what the tests cover.
- **B1** (the creator cannot delete their auto-published Free debate from the screen) exists because `ui: no` was read as *"the UI is out of scope"* when V's I-4 said *"no UI file is written"*. Those are different sentences. The first one stops you looking; the second one only stops you typing. Every seat, including the packet, stopped looking — `git diff -- apps/ui` returns 0 and that reads as *nothing to see*.

**The single cause worth fixing: the mission had no step where somebody re-read V's verbatim sentences against the built behaviour before the review.** The intake captured them beautifully and then everything downstream cited the SPEC.

## Price of each finding

| finding | how I got it | cost |
|---|---|---|
| B2 | one `grep -rn "readRunAnswer\|readAnswer" apps/ui` after reading the hook | ~3 min, ~4k tokens |
| B3 | reading `tryAutoPublish` top to bottom asking "what if this line throws" | ~2 min, ~2k tokens |
| B1 | one `grep -n "state === \"PUBLISHED\"" PublicationControl.tsx`, then 40 lines | ~4 min, ~5k tokens |
| N3 (C2 suite dies outside the lane) | running the suites myself instead of trusting the package's table | ~6 min, ~6k tokens (plus 2 retries) |
| N1 | reading the upsert's `next_attempt_at=clock_timestamp()` and then proving it in SQL | ~4 min, ~4k tokens |

The whole probe-and-prove half cost about 35k tokens. The **reading** half — packet, COMMON, intake, SPEC-v2, V rows, DECISIONS §10/§20-25, PLAN §1/§6, the diff — cost roughly twice that before I ran a single command. That is the real bill.

## What repeatedly cost tokens

1. **Re-reading files that restate each other.** Intake C1–C7, `V-DECISIONS-PACKET` V-1…V-7, `SPEC-v2` §2 and `DECISIONS` §10 all encode the same seven decisions in four voices. I read all four because the packet pointed at all four and because §10 exists precisely to correct pointers inside §2. That is ~15k tokens to learn seven facts.
2. **Line-number drift.** `SPEC-v2` cites `apps/api/src/index.ts:1161-1172`; DECISIONS §22 already records that C2's commit moved that block to `:1162-1203`. I re-grepped every citation I leaned on. Cheap individually, constant in aggregate.
3. **Tests-as-harness discovery.** To write an in-process probe I had to learn the `buildApi` fixture shape (AskApplication has ~15 members, all required), the session double, the publications double and the JSDOM globals. ~12k tokens spent reconstructing a fixture the repo already has four copies of.
4. **Two probe iterations that were my bug, not the product's** — a recorder override that stopped recording, and a React controlled checkbox that ignores a synthetic `change`. ~3k tokens.

## What I nearly got wrong

- I almost filed **B1 as a V-3 duplicate and dropped it**, because charge 5 told me UI behaviour is *"residue for V's test point, not a finding against the slice"*. I nearly let a charge's framing decide a finding's tier. The thing that saved it was mechanical: I mounted the component instead of reasoning about it, and a missing button is not a message string.
- I almost reported **`fpd-s01-c2-system-publication` as a slice regression**. Sixteen skipped tests and a suite-level `beforeAll` failure look identical to a broken build. Forcing `LC_ALL=en_US.UTF-8` turned it into 16/16 and turned a false blocking finding into a true non-blocking one. Had I run the suites in the lane, or on a UTF-8 host, I would have seen green and learned nothing.
- I almost accepted `(runId,ownership) => application.readRunAnswer(runId, undefined as never, ownership)` (`apps/api/src/main.ts:290`) as a live crash in the reconciler. The production `readRunAnswer` ignores its session argument (`apps/api/src/index.ts:1472`), so it is ugly and not a defect. Checking cost two greps; asserting it would have cost a pass.

## Dead ends, so nobody re-derives them

- **A Free run created through the legacy-principal path is not a hole.** `plan_tier` is NULL there, and PTDB-1 confirms NULL + rule reads `bound=false`. Do not spend a pass on it.
- **Owner-publishes-then-unpublishes-before-the-answer-is-served is not reachable.** `POST /v1/runs/{id}/publish` reads the answer first and 404s when it is null.
- **The reconciler IS wired** — boot and 30 s interval, `apps/api/src/main.ts:299-308`. The gap is not the wiring, it is that the queue is only ever written by the code path that failed (B3).
- **`publish_pending` does not leak onto any other response.** `PublicationTransitionSchema` is `.strict()` and the key is omitted unless the work row exists; two keys everywhere else, verified.

## Where THIS packet was unclear, exactly

1. **Charge 5 pre-tiered a finding.** *"residue for V's test point, not a finding against the slice (V-3)"* told me the answer before I looked. It scoped the UI question to the Unpublish control; the class is every owner affordance keyed off `visibility.state`, and the other member of that class is B1. A packet may name a charge; it should not name the tier.
2. **The `inputs` line does not include the BUILD tickets.** The reviewer contract §1 makes me check the author's `SKILLS LOADED` line against their floor, and that line lives in the READY comment on the BUILD ticket — which I am not given. The four `agent-reports/BUILD-S01-C*.md` carry no such line. So a binding duty is unexecutable from the packet as written; I filed it UNVERIFIED.
3. **Charge 10 says a failure outside the five named base-RED tests is mine to explain.** A `beforeAll` that dies produces zero failures and sixteen *skips*. The charge should say: a suite that reports 0 collected or N skipped is a failure too.
4. **PLAN SV-0's lens-worktree gate is `test -f packages/contract/generated/client.ts`.** That gate passes on a host where one integration suite cannot create its database. The gate should also assert the locale, or the suite should stop depending on it (N3).

## Upgrades, ranked by tokens saved

1. **A `VERBATIM.md` per mission — V's sentences and nothing else — and a mandatory step in every REV packet: "walk each sentence against the built behaviour before you open the SPEC."** All three blocking findings came from that walk. Cost: ~20 lines per mission. Saves: the passes a mission burns discovering that a frozen SPEC narrowed a sentence. Biggest single upgrade here.
2. **Collapse the four-voice decision record into one.** Intake C-rows, V rows, SPEC requirements and DECISIONS folds should be one table with one id per decision and one column per voice. ~15k tokens per downstream seat, every seat, every pass.
3. **A shared test-harness package (`tests/support/apiFixture.ts`) exporting the `AskApplication`/`SessionApplication`/`PublicationApplication` doubles.** Every seat that writes an in-process probe currently re-derives ~120 lines of fixture. ~10k tokens per probe-writing seat — and it would also have prevented N3, because a shared `startTestDatabase` is the thing C2's suite declined to use.
4. **Make "requirement → mechanism" the SPEC house style for anything with a failure mode.** R-9 as a post-condition produced B3; R-9 as *"the work row is written before the attempt and cleared on success"* would have been untestable to get wrong.
5. **Teach the runner to treat `skipped > 0` as not-green.** One line in `run-suites.sh`; it converts N3's failure mode from invisible to loud, for every future slice.
6. **Give REV packets a `git grep` budget line for the "untouched" trees.** `git diff -- apps/ui` returning 0 is what made `apps/ui` invisible. A charge that says *"name every file outside the diff that reads a value this slice changes"* would have found B1 mechanically, without my luck.

## On the one-prompt machine

The graph worked: I was blind, I had one lens, I had a byte-clean worktree, and the findings are reproducible by anyone who copies three files and runs three commands. What the machine still lacks is a **cheap way to tell a seat what NOT to read**. My reading floor was correct and still cost more than the work. The fix is not shorter documents — it is one canonical document per fact, and a packet that names the *fact*, not four places the fact appears.
