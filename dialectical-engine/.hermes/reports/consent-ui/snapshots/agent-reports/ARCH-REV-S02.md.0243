# ARCH-REV-S02 — self-report (mission `consent-ui`, ticket `t_00133ced`, review seat)

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

**Seat:** ARCH-REV-S02, Claude Opus 5, one fresh blind session, round 1 of max 3. **Ran**
2026-09-06 20:12–21:0x EEST. Main tree `2b670d30` / `dev` / 90 dirty (pre-existing, untouched).
Lane `.worktrees/consent-s02/dialectical-engine` — read-only, `git status --porcelain` **0
before and 0 after**. No git write. Nothing under review edited.
**Verdict:** REWORK — B1, B2 blocking; N1–N8; P1–P4 against the packets.

---

## 1. The finding that matters, and the exact reason four seats walked past it

**B1 is not in any document. It is in the arithmetic of two documents that are each correct.**
`SPEC.md` R17 pins an `onChange` mirror on the checkbox. `PLAN.md` C7 pins
`event.preventDefault()` on the row. Both are right. Composed, React fires `onChange` with
`checked === true` *during* the click, and jsdom reverts the DOM property *after* it — so the
mirror says ticked, the DOM says empty, and the submit button (computed from the mirror alone)
enables with the box visibly unticked and the policy never opened past its first frame. Two
clicks and the box ticks and `register()` fires.

**Why nobody saw it.** Every review artefact in this mission is scoped to ONE artefact at a
time: a requirement, a step, a cluster. The refutation table asks "what does *this step* miss";
it never asks "does a *later cluster* change what this step observes". `S02-S49` asserts the
DOM. `S02-S54` asserts the DOM. C4's six cases assert the button — but they run before C7
exists, and **C4's own command does not even include C7's test file** (N7). The defect lives in
the seam, and no artefact in the harness owns seams.

**The upgrade, and it is cheap.** Add one standing charge to the architecture packet, beside
A6:

> **A6b — the seam table.** For every step whose assertion reads a file that a LATER cluster
> edits, state in one line whether the later cluster changes that observation. A step whose
> observation a later cluster changes, without a later step re-asserting it, is a defect.

For S02 that table would have had ~14 rows and B1 would have been row 1. It costs the
architecture seat ten minutes and it is the only mechanism in the harness that would have
caught this class.

**Second upgrade, and it is the one I would spend money on.** The mission's probe directory
(`.hermes/reports/consent-ui/probes/`) contains `v3-r17-cases-probe.mjs` — six cases × four
implementation variants. **It models the component with no click handler on the privacy row.**
Three seats re-ran it and read "all six PASS" as "the plan's component is right". It is not
that: it is "the plan's component *at cluster C4* is right". **A probe carries the version of
the world it modelled, and nobody wrote that down.** Every probe copied into the directory
should carry a header line: `MODELS: <what is in the component> · DOES NOT MODEL: <what is
not>`. Mine do. That one line converts a probe from an oracle into an oracle with a stated
domain, and it is the difference between reusing it correctly and reusing it as an alibi.

## 2. What the review actually cost — priced

| Cost | Price | Cause | Fix |
|---|---|---|---|
| **Rebuilding the component from the PLAN's prose to run B1** | ~35 min, ~20k tokens | The packet's rule (correct) is "plant a mutant in scratch — never in the lane". There is no product code yet, so there was nothing to mutate: I had to transcribe `PLAN.md:420-423` + `:702-706` into a React component by hand and hope I transcribed the seat's intent. | **The architecture seat should ship the pinned handler as an executable probe, not as prose.** It already writes prose precise enough to transcribe; ten more lines makes it `node`-runnable, and every downstream reviewer inherits an oracle instead of re-typing one. This is the single biggest lever on this list. |
| **A wrong hypothesis I spent 20 minutes on** | ~12k tokens | I predicted C7 would make R17's case 4 go RED (the click no longer ticks the box → button never enables). I was wrong: it goes green, because the mirror moves even though the DOM does not. **The wrong hypothesis is what found the right defect** — but only because I ran it instead of writing it up. Had I filed the reasoning without executing, I would have shipped a false blocking finding. | Nothing to fix. This is `heartbeat-reviewer` §2 working exactly as written, and it is worth the 12k. |
| **Reading 113 KB of PLAN + 60 KB of SPEC + 42 KB of DECISIONS in full** | ~60k tokens, ~15 min | Unavoidable and correct for a plan review. | Keep. But see below on DECISIONS. |
| **Cross-referencing DECISIONS against PLAN by hand before scripting it** | ~8 min | I read `DECISIONS.md:82` ("the merge … `S02-S45`"), remembered the merge as `S02-S66`, and only then wrote the script. Eight of nine references are wrong (B2). | **Make the PLAN↔DECISIONS id diff a mechanical gate the author runs**, exactly like the SPEC↔PLAN trace it already runs. `COMMON.md` §10.6 says "diff its own artifacts against each other" — the seat did it for one pair and not the other, because only one pair had a script. **A charge without a script is a charge that gets done for whichever pair is easiest.** |

**What cost nothing and should be copied:** the `run()` guard function is pasted verbatim into
`PLAN.md:981-993`. I re-ran all nine commands by copying eight lines out of the plan. Compare
`opacity: .65`, where I had to re-implement WCAG luminance from scratch because the author's
`env-probe.mjs` is in their scratch and blindness forbids reading it. **Both numbers were
right. One took 30 seconds to verify and one took 12 minutes.** The rule that follows:
*an artefact that states a measurement must state the code that produced it, inline* — the plan
does this for the guard and not for the contrast.

## 3. What I nearly got wrong

1. **I nearly filed "R17 case 4 goes RED after C7" as B1.** It does not. Executing the
   hypothesis instead of writing it up turned a false blocking finding into a true one.
2. **I nearly filed 57 steps as "missing an Acceptance clause".** My first regex matched
   `**Acceptance:` but the plan writes `**RED before, GREEN after. Acceptance:**` — one bold
   span. **A reviewer's script is exactly as trustworthy as a seat's, and mine was wrong first.**
   I re-ran with the real formatting: 0 steps missing. Had I posted the first run I would have
   filed 57 fabricated findings against a seat that did nothing wrong.
3. **I nearly charged the banned-word scan.** 18 hits for `handle` — all of them the noun
   "handler" (`submitRegistration`, `backdropCloseHandler`). The ban is on the verb.
4. **I nearly called N1 blocking.** C9's command genuinely cannot catch a lost S01 block — but
   `S02-S66`'s own step acceptance carries the `grep`. The command's *column* overclaims; the
   *step* does not. That is an N, not a B.

## 4. Dead ends — do not re-derive these

- **`v3-r17-cases-probe.mjs` does not settle the finished component.** Its `makeApp` has no row
  handler. Re-running it proves C4, never C7. My two probes are the C7 oracle.
- **`.click()` on a checkbox whose row calls `preventDefault`** does *not* leave React's state
  untouched. Measured: DOM `false`, mirror `true`. This is the opposite of the intuition every
  document in this mission has been building since B2, and it is why B1 exists.
- **The A9 table is correct.** I re-ran all nine commands and reproduced it line for line. Do
  not spend another seat's time on it.
- **`opacity: .65` is correct.** Independently re-derived to the digit, including the composited
  hexes. Do not re-measure.
- **`S02-R14` ≡ `S01-R20`** — md5 `a0440e4f9e1492c200f63079da89f236` on both. Settled.
- **`v2ui-node-runner.test.ts:19` IS the manifest assertion.** REQ-01's contest of
  REQ-REV-01 N5 is correct; I re-measured. Nobody "fix" it back.

## 5. Where THIS packet was unclear — exactly

1. **`ARCH-REV-S02.md:16` is the best line in any packet I have seen** — *"a cluster whose
   command cannot fail for the mutant class it claims (reason it through, **or plant a trivial
   mutant in scratch — never in the lane**) is a finding."* It named the technique, it named
   where, and it named where not. It is what produced B1. **Copy it into every review packet.**
2. **`:24` says "Round 3 REWORK → V row".** The rule is that a REWORK *opening round 4* becomes
   a V row. As written it reads as though a round-3 REWORK is unlawful. I am round 1, so nothing
   turned on it; a round-3 lens would lose time on it.
3. **`:13` asks me to find "ONE step a stranger cannot mark done or not-done".** 67 of 69
   acceptances are mechanical, which is a genuinely high bar — so the charge as phrased pushes
   toward manufacturing a marginal finding to satisfy it. **Phrase it as a question, not a
   quota:** "how many steps have a non-mechanical acceptance, and which". I found two (N5) and
   said two.
4. **Nothing told me the probe directory's probes carry no domain statement.** §1 named the
   directory as "the R17 six-case oracle" — which is what three seats before me also believed,
   and it is half true. See §1.

## 6. How to make this more of a one-prompt machine — four changes, by payoff

1. **The seam charge (A6b, §1).** The only mechanism that would have caught B1. Every
   multi-cluster plan that edits one file from three clusters has this exposure; S02 has three
   clusters on `SignUpFlow.tsx` and this is the first plan in the mission to hit it.
2. **Every cluster command re-runs the earlier clusters' test files for files it shares** (N7).
   One number changes per command; it converts "C9 finds it eventually" into "C7 finds it at
   the moment it is introduced", which is a whole review round.
3. **A probe carries `MODELS:` / `DOES NOT MODEL:` in its header.** A probe reused outside its
   domain is worse than no probe, because it launders an assumption as a measurement. This
   mission has one such probe and it cost this review 35 minutes to work around.
4. **Every artefact-pair the author must self-diff gets a script, or it does not get diffed.**
   SPEC↔PLAN had one and is perfect (24/24, 69/69, no orphans). PLAN↔DECISIONS had none and is
   8-for-9 wrong. Same seat, same hour, same care. **The difference is the script.**

## 7. What I could not do, and said so

- **I did not verify the author actually loaded the six skills declared** — only the
  declaration's form and floor coverage. That is the orchestrator's transcript grep
  (`COMMON.md` §21).
- **I did not read S01's PLAN**, so my prediction that the two plans disagree on
  `modalSemantics.ts`'s signature is a prediction, not a finding. It is one `diff` away and I
  named the command in the verdict.
- **I ran each cluster command ONCE, not three times.** The three-run law is the coding seat's.
- **The Esc stack, the geometry, the pill scroll, the narrow viewport and the live mode flip
  remain UNVERIFIED by every seat in this mission.** They are V's steps 1-2, 5, 6, 7, 12, 13, 14
  and the plan concedes them honestly.
- **`superpowers:receiving-code-review` — not loaded this session; not needed, nothing was
  contested with me** (per-session declaration, `COMMON.md` §10.9).

## 8. Probes worth keeping (orchestrator: copy to `.hermes/reports/consent-ui/probes/`)

`scratchpad/arch-rev-consent-s02/` — `c7-mirror-desync-probe.mjs` and `scenario3.mjs` are the
**B1 oracle**; `COMMON.md` §10.10 makes re-running them the only lawful discharge of B1.
`r17-vs-c7-probe.mjs` is the A-vs-E variant matrix that shows why the existing R17 oracle does
not settle C7. `a9.sh` re-runs all nine cluster commands. `contrast.mjs` re-derives the opacity
pin. `trace.py` is the SPEC↔PLAN↔DECISIONS id diff — **it should become a mission-standard
script, per §6.4.**

---

# Part II — ARCH-REV-S02, round 2 (fresh blind session, ticket `t_00133ced`)

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

**Verdict: REWORK.** 1 new blocking (B3), N6 carried over with one unswept member, 2 new
non-blocking (N9, N10), 1 packet finding (P5). B1 and B2 discharged; N1–N5, N7, N8 and P1–P4
closed. **Two of my predecessor's own remedy WORDINGS withdrawn as measurably wrong**, each
refuted by a probe I ran myself before agreeing with the author.

## 1. The murder: a correct fix killed two pinned cases, and the round's OTHER fix is what
## made the body visible

**B3.** Cluster C4 pins R17's six cases. Case 4 says clicking both boxes ENABLES `Create
account`. Cluster C7 makes clicking the unchecked privacy box open the modal instead of
ticking. Under round 0's **defective** mirror rule those two coexisted — the desync set the
mirror `true` while the DOM said `false`, so case 4 went green **for the wrong reason**. The
B1 fix removes the desync, and case 4 (and case 5) go red. Measured, 3 runs:
`STAGE c4: 6/6` · `STAGE c7: 4/6` · `STAGE c7-unfixed: 6/6`.

**Name the cause, not the symptom.** The cause is not the fix. It is that **a cluster's pinned
expected values were written against the component as an EARLIER cluster leaves it, and no
artifact records which of them survive the LATER cluster's change.** The plan has exactly one
sentence on the subject (`PLAN:595-597`), attached to the one case where the invariance
happens to hold, and it generalises: *"C7 adds no assertion that changes it."* It does not
change an assertion; it changes the **truth value** of two.

**And the thing that made it visible is the round's own N7 fix.** Before this round C7's
command was two files and C4's gate test was never re-run by C7; the conflict would have
surfaced at C9, after four more clusters had been built on it. N7 pulled the discovery four
clusters earlier — into a blind review instead of into a coding seat's dead end.

**UPGRADE, and it is the one I would ship first:** *when a cluster adds another cluster's test
file to its command, it must state, per assertion in the added file, whether that assertion's
expected value survives its own change.* Cluster-level chaining is not enough; the chain arm is
a promise about **cases**, and cases are what break. Three lines in the plan would have caught
this: for C4's six cases, "invariant under C7 / not invariant under C7", per case.

## 2. What repeatedly cost tokens — priced

| Cost | Price | Cause |
|---|---|---|
| **`ugrep` vs BSD `grep`, again** | ~10 min, 3 dead tool calls | I wrote `.` where the author's pattern had a literal `·` and got `0 0 0` for three counts, briefly believing N8 was unaddressed. §10.16/§10.21 warn about the glyph; **nobody warns about the reviewer's own transcription of a multibyte character into a regex**. The author's commands were fine. |
| **Reading a 2041-line PLAN to find one table cell** | ~15 min | N6's unswept member is `PLAN:1887`, 1500 lines from the step that fixed the same thing. A "swept as a class" claim should carry the command that enumerates the members, not a prose list. |
| **Rebuilding the component from prose, twice** | ~25 min | Unavoidable and worth every token — it is how B3 was found, exactly as it is how B1 was found in round 1. `ARCH-REV-S02.md:16`'s "plant a trivial mutant in scratch — never in the lane" remains the best line in this packet family. |
| **A9 re-run at full length** | ~9 min wall-clock | Nine vitest invocations twice over. Cheap and non-negotiable; the author's table was right to the character, and I could only know that by running it. |

## 3. What I nearly got wrong

- **I nearly PASSED.** B1, B2 and N1–N8 all check out, the A9 proof is the best in the mission,
  and the write-up is disciplined. I opened the C4 section only to confirm the *B1 qualification*
  had landed there, noticed `S02-S27`'s reassuring note, and asked whether it was true of case 4.
  It is not. **Reading a step's reassurance as evidence is the failure mode this seat exists to
  prevent, and I was one paragraph from committing it.**
- **I nearly filed N6 as blocking.** The step is correctly anchored; only the boundary row is
  stale. Blocking on it alone would have burned round 3 on a table cell. It is N, listed inside
  a round B3 already requires.
- **I nearly took the author's refutation of my predecessor's remedies on trust** because both
  were argued so well. I implemented both wrong remedies myself instead (`MODE verdict`,
  `space-fact.mjs`). Both refutations reproduce exactly. **Agreeing with an author on their
  evidence is still reading, not probing.**

## 4. Dead ends — do not re-derive these

- **`setPrivacyMirror(false)` beside `preventDefault()` is byte-for-byte as bad as no fix**:
  5 desynced routes, 2 unlawful `register()`, 7 unlawfully-enabled routes — identical to the
  unfixed rule. React fires the ROW's `onClick` before the INPUT's `onChange`; the later write
  wins. Settled twice now, by two seats, independently.
- **Member 2 (the dismissal resync) is genuinely not load-bearing.** `MODE m1only` is identical
  to `MODE pinned` across all 12 routes. Keep it as defence in depth; never cite it as the fix.
- **jsdom 30.0.1 does not implement Space-activates-checkbox.** `clickEventsSeen=0`. Any step
  worded "dispatch Space and assert it toggles" is RED forever. This is now in TOOLING-TRAPS.
- **The two plans' `modalSemantics.ts` blocks are BYTE-IDENTICAL** (`md5 3a737c18f8109515e5927a6cd004100e`).
  My predecessor's top prediction is falsified; stop re-checking it.
- **`pnpm typecheck` in the lane writes nothing**: `packages/contract/generated/` is present and
  gitignored, so a reviewer can run G1 without dirtying the lane. Porcelain stayed `0`.

## 5. Where THIS packet was unclear — exactly

- **§2 probe 3 was not re-swept when `COMMON.md` §10.16–§10.21 landed** (filed as P5). It still
  prescribes "signature grep + anchored summary", the method §10.16 explicitly calls
  insufficient. §4 and the dispatch message repaired it, so it cost nothing — but this is the
  **third round running** in which a packet section survived an amendment that supersedes it
  (P1, P2, now P5). **The amendment should carry the sweep**: when §10.n is appended to COMMON,
  the packets are grepped for the sentence it supersedes, in the same edit.
- **§4's three-way `ADDRESSED / NOT ADDRESSED / WITHDRAWN` has no cell for "one member of the
  class unswept".** N6 is genuinely two-thirds addressed. I resolved it by calling it NOT
  ADDRESSED and marking it non-blocking in the body — but a reviewer that reads "NOT ADDRESSED
  (blocking again)" literally would have opened round 3 on a table cell. **Suggested fourth
  value: `ADDRESSED — CLASS INCOMPLETE`, with the unswept members named.**
- **The dispatch message was excellent** on three points and they should be template text: naming
  the two probe files by absolute path and ordering me to diff them; stating that the orchestrator
  ruled the class binding and the wording advisory; and telling me the author's declared skill
  shortfall so I judged it rather than discovered it.

## 6. How to make this more of a one-prompt machine — four changes, by payoff

1. **Per-case survival, not per-cluster chaining** (§1 above). The single change that would have
   prevented this round. A chain arm without a per-case survival statement moves a defect
   earlier; it does not prevent one.
2. **Adopt the author's P8 into the reviewer contract.** *A reviewer that proves a finding with
   a probe runs its own proposed remedy through that same probe and pastes the result, or marks
   it `UNVERIFIED — direction only`.* Round 1 shipped two wrong remedies for want of ninety
   seconds; I ran mine (`remedy-check.mjs`, 3 runs) before writing it. This costs nothing and it
   is the highest-yield line available.
3. **Every "swept as a class" claim carries the enumerating command.** `DECISIONS.md:160` lists
   eight members in prose and seven are done. A command that lists the members — even
   `grep -n ':324' PLAN.md` — makes the eighth impossible to miss, by the author and by me.
4. **Ship `trace.py` and an `a9.sh` skeleton as mission-standard scripts**, as my predecessor
   already asked. I rewrote A9 from scratch this round because building my own is the reviewer's
   duty — but the *skeleton* (capture-first, four ASCII terms, `Test Files <n>`, the three cause
   counters) should be a file every seat starts from, not prose every seat re-types. Two seats
   have now independently discovered variant 7.

## 7. What I could not do, and said so

- I did not verify the author's declared skills; only a transcript grep does (N9 covers the one
  absence and why the substance was nonetheless discharged).
- I ran each cluster command twice (script + inline), never three times — the three-run law is
  the coding seat's.
- Rendered geometry, the Esc stack in a real browser, the pills' scroll, the narrow viewport and
  the live mode flip stay UNVERIFIED by every seat. They are V's.
- I did not audit the author's own `arch-s02-rework-r1-a9.sh` line by line; I wrote and ran my
  own and compared the nine verdicts.
- The ADR-0019 collision with the halted `translation` mission is still unresolved. It is the
  orchestrator's, and it is now reported twice.

## 8. Probes worth keeping (orchestrator: copy to `.hermes/reports/consent-ui/probes/`)

From `scratchpad/arch-rev-consent-s02-r2/`:
`r17-post-c7.mjs` — **the B3 oracle, and per `COMMON.md` §10.10 the only lawful discharge of
B3**; suggested name `arch-rev-s02-r2-r17-post-c7.mjs`. `r2-allroutes.mjs` — 12 routes × 4
mechanisms; it is the superset of both B1 probes and it should replace them as the mission's
mirror oracle. `remedy-check.mjs` — the remedy run through the probe before proposing it (§6.2).
`space-fact.mjs` — the jsdom Space fact, standalone. `a9-r2.sh` and `guard-matrix.sh` — the
nine commands plus the satisfiability/mutant/glyph matrix, the §6.4 skeleton candidate.

---

# Part III — ARCH-REV-S02, round 3 (fresh blind session, ticket `t_00133ced`, verdict PASS)

*Appended; Parts I and II untouched. Answers V's standing question for this round only.*

`SKILLS LOADED (this session): superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:writing-plans` · `receiving-code-review` not loaded — nothing was contested with me.

## 1. The finding that matters: I found N12 by BUILDING the thing, and I would not have found it any other way

My packet told me to verify a discharge. The discharge verified in four minutes: run the probe
three times, read `STAGE c7: 6/6 pass`, done. **That would have been a worthless review.** What
made it worth a seat is that I then wrote my own component from the PLAN's prose — not from the
author's harness — and it did not work. The modal never opened. Fifteen minutes of thinking it
was my bug produced N12: **the click rule pins the ACTION but not the VALUE its predicate
reads**, and the natural reading (`input.checked`) is the in-flight activated value, so the rule
inverts, the box ticks on a bare click, and two clicks reach an enabled `Create account` with the
policy never shown — B1's outcome class through a different door.

**The generalisable rule, and it is the whole lesson of this mission's three rounds:**

> Round 1 found B1 by running the author's mechanism. Round 2 found B3 by running the author's
> CASES against the component at more than one STAGE. Round 3 found N12 by running the author's
> PROSE — by making the sentences into code and watching them fail. Each round went one level
> further down the same technique: **execute the artifact, never read it.** A reviewer who reads
> a rule agrees with it every time, because the rule was written by someone who knew what they
> meant.

The corollary for the fleet: **a plan sentence is not verified until someone who does not know
what the author meant has turned it into code.** That is cheap — my probe is 180 lines and took
25 minutes — and it is the only method that finds ambiguity, as opposed to error.

## 2. What repeatedly cost tokens this round — priced

- **~6 min, twice: copying a jsdom harness from memory instead of from an existing probe.**
  `globalThis.navigator = …` throws on Node 22 (getter-only), and react resolves under
  `apps/ui/node_modules/`, not the repo root. Both are one-line facts, both already encoded in
  every probe in the directory, and I retyped instead of copying. **Now in `TOOLING-TRAPS.md`.**
  The structural fix: probes should start from a shared `harness.mjs` this mission never wrote.
- **~9 min: proving "nothing else changed" without a baseline.** `docs/missions/consent-ui/` is
  untracked, so there is no `git diff`, and I searched every seat's scratch tree for a snapshot
  of the round-2 PLAN before accepting that none exists. The entire cost is avoidable: **one
  `cp` per handoff** (P8). This is the single highest-leverage change in this report.
- **~5 min: reading 2224 lines to localise ~183 lines of edit.** The author marks its own edits
  (`ARCH-REV-S02-r2`, `V-18`, `r2`), which is why a marker grep localised them in one command —
  but the marker convention is a courtesy, not a rule. **Make it a rule:** every rework edit
  carries its finding id in the line. It converts a read into a grep.
- **~0 min, and worth noting because it is the counter-example: the nine cluster commands.**
  Twice over, script and inline, with the satisfiability matrix — under 3 minutes total, because
  §A9 states the exact function and the exact file lists. **A plan that writes out its own
  executed command is a plan a reviewer can re-run instead of re-derive.** Every artifact in this
  fleet should carry that block.

## 3. What I nearly got wrong

- **I nearly filed N12 as BLOCKING.** Its measured outcome is a registration with the policy
  never shown — V's goal defeated — which reads B on sight. It is not: `S02-S49` asserts a
  `[role="dialog"]` and goes red immediately, so the plan CATCHES it. The discipline that saved
  me: *the question is not "how bad is the outcome" but "can a stranger still mark every step
  done or not-done".* They can. It costs a debug cycle, not a defect.
- **I nearly accepted the plan's "C4 has lost its positive control" on its face.** It is a claim
  about a mutant, and a mutant claim is testable in ten lines. I ran it: `mut_disabled_true`
  leaves C4 **4/4 green**. Had it been wrong in the other direction, the plan would have been
  understating its own coverage — harmless — but a coding seat would have trusted the C7 row's
  "this mutant is caught here" and it would not have been. **Mutant-class columns are the least
  verified thing in every plan I have reviewed, and the cheapest to verify.**
- **I nearly reported the 37/14 ADR counts as a defect of this seat.** The timeline refutes it:
  `COMMON.md` §10.23's correction landed at 22:03; the handoff was 22:00. **Check the clock
  before attributing a stale constant** — the constant's author is usually not its transcriber.
- **I nearly missed N15 entirely.** I found it in the last sweep before writing the verdict, by
  grepping every line mentioning `S02-S28` rather than only the regions I knew had changed. A
  step that changes CATEGORY (GREEN-before → RED-before) invalidates every sentence that counts
  its category, and those sentences live nowhere near the step.

## 4. Dead ends — do not re-derive these

- **There is no baseline of any `consent-ui` doc anywhere.** Untracked directory, no snapshots,
  no scratch copies. Do not search for one; write one (P8).
- **`STAGE c7-unfixed` in the corrected probe no longer discriminates** (6/6). That is correct
  and declared, not a regression: under the corrected route the B1 desync is not what makes the
  cases pass — which is the entire point of the fix.
- **The three reviewer probes in `probes/arch-rev-s02-r2-*` are byte-untouched.** Proven by md5
  against the round-2 seat's own scratch copies plus `cmp`, not by mtime. Do not re-check.
- **`modalSemantics.ts`'s block is byte-identical across S02's and S01's PLANs** (`md5
  3a737c18f8109515e5927a6cd004100e`), for the third round running. Stop re-diffing it; watch it
  only if a seat is told to change the surface.

## 5. Where THIS packet was unclear — exactly

- **§1's `allowed (exhaustive)` omits `probes/arch-rev-s02-r3-*`, which the dispatch message
  requires me to write BEFORE the verdict comment.** Exhaustive lists and dispatch instructions
  are two sources of truth; when they disagree the seat guesses. Filed as P8(i).
- **§4 orders a "targeted `grep -n` sweep that NOTHING ELSE changed" against an artifact with no
  baseline.** The charge is right and impossible as worded; I did the strongest available
  substitute and said so. Filed as P8(ii).
- **§2 probe 3 still tells me to feed each command "a known-GOOD synthetic capture" and check
  "the mutant that flips it" — and separately §4 tells me to run all nine from a `.sh` AND
  inline.** Both are right and they are the same charge stated twice, in two sections, with
  different vocabulary. Round 2 filed the ancestor of this as P5. **When an amendment lands in
  COMMON, the packet sections it supersedes are still not being re-read** — third round in a row.

## 6. How to make this more of a one-prompt machine — four changes, by payoff

1. **Snapshot every artifact at every handoff.** `cp <artifact> .hermes/reports/<mission>/snapshots/<name>.<seat>.<round>.md`, one line in the handoff block the seat already prints. It converts "nothing else changed" — asked of every rework reviewer, in every mission — from a judgement into `diff`. **Highest payoff in this report by a distance**, and it retires an entire class of unverifiable claim.
2. **Every rework edit carries its finding id in the edited line.** ARCH-S02 does this voluntarily and it is why localisation cost one grep. Make it law and the reviewer's first command is `grep -n '<finding-id>'` instead of a 2224-line read.
3. **A shared probe harness per mission.** `probes/_harness.mjs` exporting the jsdom+React setup. Three seats have now retyped the same 12 lines; two of them (me included) broke it in the same two ways. The traps file now records both, but a file nobody has to write cannot be typed wrong.
4. **Make "build the component from the prose" a standing reviewer charge for architecture reviews.** Not "read the plan and judge it" — *implement two steps of it blind and report where you had to guess*. Every guess is an ambiguity, and ambiguity is what survives three rounds of review: B1, B3 and N12 are all the same defect species, and none of them was visible to reading.

## 7. What I could not do, and said so

- I could not verify the author's `SKILLS LOADED` beyond form and floor coverage; only a
  transcript grep settles it (N11 is filed on the one absence, with its honest declaration noted).
- I could not verify "nothing else changed" at byte level — no baseline (§4 of the verdict, P8).
- I did not run the cluster commands three times; twice (script + inline). The third run is the
  coding seat's.
- I did not run `S02-S52`/`S02-S53`'s focus question, which round 2 predicted and the author
  reported as a candidate finding. **Nobody has run it in three rounds.** It is my top prediction
  for the next defect and it should be a charge on the CODE-S02-C7 packet, not a hope.
- I ran nothing in a browser: the Esc stack, geometry, the narrow viewport, the live mode flip
  and `Space` on a focused checkbox remain V's steps.

## 8. Probes worth keeping (already copied to `.hermes/reports/consent-ui/probes/`)

- `arch-rev-s02-r3-b3-independent.mjs` — **the component built from the PLAN's prose**, 5 modes × 6 cases × 3 runs. It is the oracle for N12, the proof that B3's remedy holds off the author's harness, and the measurement of C4's lost mutant. **This one should become the mission's template**: every future architecture review starts by copying it and re-writing `makeApp` from the plan under review.
- `arch-rev-s02-r3-a9.sh` — the nine cluster commands with the §10.17 cause classifier and the known-GOOD / per-term-mutant / glyph matrix, in one file.
- `arch-rev-s02-r3-checks.sh` — N6/N10/ADR/structural counts, all with their commands.
- `arch-rev-s02-r3-nothing-else.sh` — the localisation grep plus every round-2 pin re-checked as a named string. **Run it as the first command of the next review of this PLAN.**
