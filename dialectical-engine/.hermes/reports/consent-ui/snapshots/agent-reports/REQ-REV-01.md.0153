# REQ-REV-01 self-report — mission `consent-ui` (seat: blind review, Opus 5)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

Seat REQ-REV-01 · model `claude-opus-5[1m]` · ticket `t_12513808` · reviewing REQ-01 (`t_5916299b`)
· round 1 of max 3 · main tree `2b670d30` / `dev` / 90 dirty at CLAIM (untouched) · probes run in
the clean lane `.worktrees/consent-s01/dialectical-engine` (`2b670d30`, 0 dirty, 0 dirty after) ·
no git writes, nothing under review edited. Verdict: **REWORK**, 3 blocking / 9 non-blocking /
5 packet findings — `docs/missions/consent-ui/reviews/REQ-REV-01.md`.

---

## 1. The body on the floor: the finding that only existed because I ran code

**F1 — Three of my twelve findings came from reading. One came from executing, and it is the one
that would have cost a rework round.** (HIGH)

B2 (S02's prescribed test fix cannot work under S02-R17's own prescribed implementation) is
invisible to a reader. Both halves are individually reasonable: R17 says "hold both in React
state"; §Tests says "tick BOTH boxes in all three cases" using the file's own idiom
`field(x).checked = true`. You cannot see the collision by reading, because the collision lives in
React's controlled-input semantics, not in the prose. I only found it because I stopped to ask
"does that idiom still work after R17?" and then **built a 90-line jsdom + React 19.2.8 harness
that runs the exact house idiom and the exact submit helper under both lawful readings of R17**.
Result, deterministic over three runs each: controlled → **0** `register()` calls (suite RED),
uncontrolled+mirror → **1** (suite green).

**Cause, not symptom.** `heartbeat-reviewer` §2 says "probe, never read" and I nearly violated it
in the most seductive way — REQ-01's work is *good*, its citations check out, and after twenty
verified `path:line` claims the pull toward "this author is reliable, skim the rest" is strong.
The reliability of the first twenty claims is exactly what makes the twenty-first dangerous.
**A reviewer's probe budget should be spent where reading is structurally blind, not where the
author looks weakest.** Reading is blind to: framework semantics, timing, concurrency, and
anything whose truth lives in a runtime rather than in a file. That is a checklist, and it should
be one.

**Price.** ~18 minutes to build and run the probe. **Counterfactual:** S02's coding seat rewrites
`SignUpFlow.tsx`, applies the SPEC's one-line test remedy, sees `auth-flow-integration` at 14/17,
and — because the SPEC states 18-passed as a *fact* — blames its own diff. That is a
`systematic-debugging` session against a correct implementation, then a rework round, then a
SPEC-v2 because the SPEC is frozen. Conservatively 2–3 hours of fleet time.

**Upgrade (concrete).** Add to `heartbeat-reviewer` §2 a named list of *structurally unreadable*
claim types that oblige an executed probe rather than a citation check:
> framework/runtime semantics (React controlled inputs, event ordering, hydration) · anything
> asserting a suite's future colour · concurrency and timing · "this test will still pass after
> the change" · numbers derived from layout.
> **A SPEC sentence of the form "the suite must end at N passed" is a claim about the future and
> is never verifiable by reading.**

That last line is the whole finding compressed. Both SPECs contain such a sentence
(`slices/S02/SPEC.md:541-543`, `slices/S01/SPEC.md:353-362`); one of them is false.

---

## 2. What repeatedly cost tokens

**T1 — The biggest single spend was re-deriving ground truth the fleet already measured twice.**
(MEDIUM, systemic, fixable today)

I re-ran four vitest suites (~4 min), eleven `sed -n` line checks, six greps and a fixed-position
CSS sweep. **All of it was correct to re-run** — `heartbeat-reviewer` §2 is explicit that the
author's evidence is theirs, not mine. But note what happened: the orchestrator measured those
four suites at 17:07/17:35, REQ-01 measured two of them at ~17:30, and I measured all four at
~18:05. **The same four commands ran three times in one hour, in three sessions, and produced
byte-identical output all three times.** That is not waste — independence is the product — but it
means the fleet pays 3× for every measurement, and the price scales with the number of lenses.

**Upgrade.** Do not remove the re-measurement; make it *cheap*. Ship one script,
`.hermes/reports/<mission>/logs/baseline.sh`, that runs the pinned commands and prints the
`passed/total` lines. Then a re-measurement is one call instead of four, the three runs are
literally comparable, and a divergence is visible instead of inferred. Cost to build: ten minutes,
once per mission. Saved: ~3 minutes and ~6 tool calls per lens, per round, forever.

**T2 — The single most expensive *avoidable* cost was reading two 40 KB SPECs in full when the
findings were in the seams.** (MEDIUM)

S01/SPEC.md is 641 lines, S02/SPEC.md 588. I read both end to end (~20k tokens) and **not one of
my twelve findings came from a paragraph read in isolation.** Every one came from holding two
places side by side: R14 against R13 and the states table (B1); R17 against §Tests (B2); S01-R18
against S02-R16 (B3); a cross-reference against its target (N1); a citation against the file it
cites (N2, N3, N5); COMMON §10.7 against two §Parallel-safety sections (P4).

**Cause.** There is no machine-checkable *shape* to a SPEC, so a reviewer must linearise it into
their head before they can cross-reference it. **Upgrade:** the two checks that found five of my
twelve findings are ten lines of Python each and belong in the fleet, not in my scratchpad:
1. **Cross-reference resolver** — every `Sxx-Rnn` / `Rnn` mention resolved against what that
   requirement actually says, printed side by side. Found N1 (and would have found REQ-01's own
   earlier R17→R20 skew before it was fixed by hand).
2. **Citation checker** — every `path:line` in the artifact, `sed`'d and printed beside the
   sentence that cites it. Found N2, N3, N5 in one pass.

Both are author-side tools, not reviewer-side: a requirements seat that runs them before handoff
ships zero of that class. **This is the highest-leverage upgrade in this report** — it converts a
recurring reviewer finding class into a pre-handoff self-check, exactly like the packet's Q8
charge did for contradictions. I have put both scripts at
`/private/tmp/.../scratchpad/req-rev-01/{trace.py,copyfid.py}`; they are ~120 lines together and
mission-agnostic apart from the R-id prefix.

**T3 — In the other direction, so this report is not only complaints.** The single cheapest
finding in the run was N6 (`grep -i baseline INSTRUCTIONS.md` → one row, pointing at the wrong
mission's baseline). Two seconds. The pattern generalises: **for every file the artifacts call
"the authority", grep the compass for it.** A compass that does not point at its own authority is
a compass defect, and it is a one-line check.

---

## 3. Where THIS packet fought me — exactly

1. **`REQ-REV-01.md:8` names "the V-row defaults" as ground truth, but rows V-9…V-14 were routed
   FROM REQ-01's own contested decisions at 17:45 — three minutes after REQ-01 wrote them and
   after the SPECs were frozen at 17:39.** Judging the author against rows derived from the
   author's output is circular, and a less careful lens would have "verified" six rows against
   themselves and reported a clean sweep. I noticed only because `V-DECISIONS-PACKET.md:68`
   carries an explicit provenance header — which is good orchestrator hygiene and is the only
   reason this was recoverable. **Fix:** when a packet names a document as ground truth, it names
   the **version or timestamp** the author saw. One clause: "V-DECISIONS-PACKET.md *as of 17:22*
   (rows V-1…V-8); rows V-9+ post-date the work and are not evidence against it."

2. **`REQ-REV-01.md:14` (probe 2) tells me to script the copy check and cite "the design line and
   the SPEC line" for every miss — but the design extracts store non-ASCII as literal `\uXXXX`
   escapes in some places (`policySections`) and as real characters in others (`cookieCats`).**
   A naive scripted comparison reports ~30 false misses. I lost ~8 minutes to discovering this and
   writing the de-escaper. **Fix:** COMMON §7 already pre-measures the token map; it should also
   state the encoding of the extracts in one line. Every seat that touches copy hits this — REQ-01
   hit it too and left a slightly wrong note about it (my N8).

3. **`REQ-REV-01.md:9` grants me one verdict comment on `t_5916299b` and my packet §3 wants the
   whole verdict in it, while COMMON §2 caps comment bodies at the shell argument limit.** My
   verdict is ~19 KB. The two instructions are only compatible because §3 also says
   "`--max-len 80000` if long" — but `--max-len` raises the *server* cap, not the shell's `ARG_MAX`.
   I resolved it by posting a dense summary plus the file path, which is what COMMON §2 actually
   prescribes ("put long handoffs in the FILE your packet names and post a pointer + summary").
   **Fix:** delete "post the verdict as ONE comment" from review packets and say "post a summary
   + the verdict file path"; the two sentences currently contradict each other.

4. **Commendation, worth copying.** Probe 4 ("quote both sentences and diff them. A mismatch is
   blocking") is the best-designed charge in my packet: it named the artefact, the method and the
   severity in one line, and it is why B3 is filed as blocking rather than as a shrug. **Every
   cross-artifact charge should carry its own severity**, so a reviewer is not silently choosing
   the tier the orchestrator already decided.

---

## 4. What I nearly got wrong

- **I nearly filed B3 as an N.** The reasoning that almost won: "ARCH will site one shared helper
  (COMMON §10.7), a helper naturally owns a surface stack, so Esc precedence falls out for free."
  That is a prediction about a seat that has not run yet, dressed as an analysis. What stopped me
  was checking for a **hook**: no test named in either SPEC, and no V step, exercises Esc with the
  modal open over the card. A defect with no observer is not mitigated by an optimistic
  architecture. I recorded the counter-argument in the verdict's Predictions §5 so a contesting
  author has my strongest case against myself.
- **I nearly accepted `t9-mode-tokens.test.ts:380-383` on sight**, because the *claim* attached to
  it is true (set equality does exist) and the rationale built on it is sound. Reading the actual
  lines took eight seconds and showed a different assertion two lines further down. **A true claim
  with a wrong citation is still a wrong citation**, and it is the kind a downstream seat acts on.
- **I nearly reported "banned words: clean" without checking the PLANs.** They have five hits —
  all in the law quoting its own banned list. Had I grepped only the SPECs I would have missed
  that the PLAN scaffolds carry the law verbatim (correct), and had I grepped only naively I would
  have filed five false findings. Whole-word, case-insensitive, and then *read every hit*.
- **I nearly trusted my own copy-fidelity green.** 89/89 with zero misses is exactly the shape of a
  broken extractor. I dumped all 89 strings and hand-checked the counts against the design
  (24 = 6 + 6 + 12 for S01; 65 = 4 + 8 + 8 + 33 + 12 for S02) before believing it.

## 5. Dead ends — do not re-derive

- **The `--z-*` / fixed-overlay sweep.** Done, scripted, complete: `.tokenDock` (z 40, bottom 18px)
  is the **only** fixed bottom-anchored surface below `--z-consent-bar: 45`. S01-R29's class sweep
  is correct. Do not re-survey.
- **The six "zero hits" greps** (`createPortal`, `Escape`, `focusTrap`, `.focus()`, `document.body`,
  `addEventListener("keydown"`) over `apps/ui/**/*.{ts,tsx}`: all **0**, re-run by me. Seven
  overlays declare `aria-modal`. Confirmed twice now (REQ-01 and me). Do not run a third time.
- **The four baseline suites.** Measured three times by three sessions with identical output.
  Re-measure only after someone commits.
- **Business facts in the policy** (retention periods, `dezbatere.ro/subprocessors`,
  "DebateAIRO SRL", `v2.1 · EFFECTIVE 12 AUG 2026`). The repo is not their source of truth.
  REQ-01 said so; I agree; `UNVERIFIED` is the answer. Third derivation would be waste.
- **`node -e` with jsdom globals:** `globalThis.navigator = …` throws
  `TypeError: Cannot set property navigator of #<Object> which has only a getter` on Node 22.
  Use `Object.defineProperty(globalThis, k, {value, configurable: true, writable: true})`.
  Cost me one round-trip; appended to TOOLING-TRAPS.

## 6. How to make this more of a one-prompt machine

Ranked by leverage.

1. **Ship the cross-reference resolver and the citation checker as author-side pre-handoff
   checks** (§2 T2). Five of my twelve findings — N1, N2, N3, N5 and half of N4 — are mechanical
   and would never reach a reviewer. This is the same move that made the packet's Q8 charge pay
   for itself, generalised. Estimated saving: one N-cluster per artifact-producing seat, forever.
2. **Name the *unreadable* claim classes in `heartbeat-reviewer` and require an executed probe for
   each** (§1 F1). The specific sentence that earns its place: *"a claim about a suite's future
   colour is never verifiable by reading."* One rule, one blocking finding.
3. **Version-stamp every ground-truth pointer in a review packet** (§3.1). A blind lens that
   cannot tell which rows post-date the work will validate the author against the author.
4. **One `baseline.sh` per mission** (§2 T1). Turns a 3×-duplicated four-command ritual into one
   call, and makes divergence between lenses visible instead of inferred.
5. **State the extracts' encoding in COMMON** (§3.2). Every copy-touching seat in this mission hit
   the `\uXXXX` question; two of us wrote something about it and one of us wrote it wrong.
6. **Give every cross-artifact charge its own severity** (§3.4), so tiering is the orchestrator's
   decision rather than a per-reviewer coin flip.

## 7. Cost accounting

| Item | Cost | Avoidable? |
|---|---|---|
| Reading both SPECs (641 + 588 lines) + compass + intake + V packet + COMMON + both packets in full | ~35k tokens, ~12 min | **No.** Findings live in the seams; you cannot cross-reference what you have not read. But see §2 T2 — the *mechanical* seams should be scripted, leaving the reader for the semantic ones. |
| Scripting copy fidelity (`copyfid.py`, 89 strings) | ~10 min incl. the `\uXXXX` discovery | No — and it is the only way to say "89/89" instead of "looks right". Reusable next mission. |
| The React controlled-checkbox probe | ~18 min incl. one Node-globals dead end | **No — the single best spend of the run.** It is the whole of B2. |
| Re-running four vitest suites | ~4 min | No (independence is the product), but §2 T1 makes it one call. |
| Verifying ~40 `path:line` citations | ~8 min | **Yes** — author-side citation checker (§6.1). |
| Verifying my *own* citations before posting | ~3 min | **No, and it is mandatory.** It caught one error of mine (self-report line count 308 → 307) and completed N2's class sweep from 5 occurrences to 7. A reviewer filing mis-citation findings while committing one is the worst possible outcome. |
| Node `globalThis.navigator` trap | ~2 min | **Yes** — now in TOOLING-TRAPS. |

**Deliverables:** 1 verdict (`docs/missions/consent-ui/reviews/REQ-REV-01.md`), this report,
2 reusable probe scripts + 1 experiment harness in scratch, TOOLING-TRAPS appended, 2 ticket
comments. No git writes, no edits to anything under review, no sub-delegation (I used zero of my
3 permitted read-only `Explore` children — every probe was cheaper to run directly than to
delegate and re-verify).

## 8. On the author

Recorded because a verdict of REWORK reads harsher than the run deserves, and the orchestrator is
routing on the tier, not the text. **Every measured claim REQ-01 made survived independent
re-measurement**: four suite results exact to the character, an eleven-entry z-index ladder exact
line by line, six zero-hit greps, a seven-overlay count, ~40 `path:line` citations with three
wrong line *ranges* and zero wrong *facts*, and 89/89 design strings verbatim including every
escaped codepoint. Its two edits to a frozen SPEC were declared in the handoff **and** in
DECISIONS before any seat consumed the file. Its self-report is a genuine case file. The three
blocking findings are two spec-internal state-machine holes and one cross-slice gap — the kind a
blind lens exists to catch, not the kind that indicts the seat. **The lesson the fleet should take
is §6.1, not "REQ-01 needs supervision."**

---

# PART II — ROUND 2, the scoped re-review (fresh session, 2026-09-06 18:33→ EEST)

Same seat, different session (the harness cannot resume; my round-1 verdict file was my memory).
Main tree `2b670d30`, branch `dev`, 90 dirty entries, read-only, no git writes.
Outcome: **REWORK**, 12 of 12 findings addressed, **2 new blocking defects introduced by the fix**.

## 9. The body on the floor, round 2: the fix re-committed the crime it was fixing

B2 was: *the SPEC prescribes a test idiom that cannot work.* The author fixed the implementation
correctly — my probe confirms the pinned shape (uncontrolled + `onChange` mirror + `FormData`
truth) is the **only** one of three that keeps the three existing cases green. Then, in the very
sentence that states the remedy, it prescribed a **second** test idiom it never executed:

> `field(name).click()` **(or `field(name).dispatchEvent(new Event("change", { bubbles: true }))`)**

Measured, React 19.2.8 / jsdom 30.0.1, three runs, deterministic: the second one does nothing.
React routes checkbox/radio `onChange` through the **click** event, so a synthetic `change` never
reaches the handler; the mirror never updates; the button stays disabled. A seat that picks the
second of two options the SPEC calls equivalent gets **exactly** B2's failure — and B2's own
sentence tells it what to conclude: *"the button is disabled, the test blames the component."*

And R17's fifth hook case — the one deliberately added to pin the mechanism — is unsatisfiable by
**either** idiom: after `.checked = true`, `.click()` *toggles the box back to false*, and the
`change` dispatch is ignored. Four idioms tested, zero pass that case.

**CAUSE, and it is not carelessness.** The author re-verified every *premise* of every finding at
`path:line` before editing — that is visible and correct. But it never re-ran the *remedy*. A
review finding proved by execution can only be discharged by execution. Prose fixes to a
prose-level defect are cheap; prose fixes to an **executable** defect are a coin flip.

**PRICE:** one full rework round (round 3 of max 3, the last lawful one) for two sentences that a
90-second `node` script would have settled. Round 4 would be a V DECISIONS PACKET row.

**THE UPGRADE, and it is one line of packet law:**

> *A finding proved by a probe is discharged only by re-running that probe against the fix. The
> rework packet names the probe file; the handoff prints its output.*

My round-1 verdict handed over `controlled-probe.mjs` by path. The rework packet quoted my
*conclusion* (§1.3: "pin the only implementation that survives the reviewer's probe") but never
told the author to **run** it. The author obeyed the packet exactly. **This is a packet defect,
not an author defect** — and it is the single highest-value fix in this mission so far, because
it generalises: every B-finding in this fleet's history that came from execution has been
discharged by prose at least once.

## 10. Two things I got wrong in round 1, both now measured

**N5 was simply wrong, and the author refuted it correctly.** I reported the manifest-equality
assertion at `tests/unit/v2ui-node-runner.test.ts:21`; it is at **`:19`**, exactly where REQ-01
had it. The file is unmodified since commit `3e7d83e9` (2026-09-01), identical md5 in both trees.
**Cause:** in round 1 I read that range through a pager after several other line-range
corrections in the same minute and carried an off-by-two from the *neighbouring* file's output.
I was correcting other people's line ranges and introduced one. `receiving-code-review` says
verify before implementing; the reviewer's mirror of that rule is **verify before reporting a
line number**, and a line number is the one class of claim I can check in one command.
**PRICE:** the author spent ~4 minutes re-measuring in two trees to refute me, plus a defensive
note now frozen into `slices/S02/SPEC.md:656` forever. Cheap this time. It would not have been
cheap if the author had "fixed" a correct citation to a wrong one and a coding seat had followed it.

**My round-1 N1 class sweep was incomplete, and I asserted it was complete.** I wrote: *"those two
are the only remaining mis-resolving references in either SPEC."* A third survives —
`slices/S01/SPEC.md:167` cites `(R21)` for a claim about `:root` tokens and the test's
`MODE_INDEPENDENT` map, which is R24; R21 is the Settings panel. It is pre-existing
(`SPEC-v1.md:147`), and the author's rework sweep missed it too.
**Cause:** my round-1 heuristic compared a reference against a hand-classified topic. This round I
used a different one — zero lexical overlap between the referencing line and the target's own
heading — and it surfaced immediately. **Two heuristics found one defect each that the other
missed.** The lesson is not "use a better heuristic"; it is that **a single-heuristic sweep must
never be reported as an exhaustive class sweep.** I did exactly that and it cost a round.

## 11. What the machine should change

1. **Probe-discharge law (above).** Highest value. One sentence in `heartbeat-reviewer` §4 and in
   every rework packet.
2. **Seats share a scratchpad namespace.** The author's `xref_sweep.py` was sitting in
   `scratchpad/` root while I, the blind lens, worked in `scratchpad/req-rev-01-r2/`. I did not
   read it and say so on the record — but *blindness enforced by good manners is not blindness*.
   Round-1 law already requires one worktree per lens; the same rule must cover the scratchpad.
   **Fix: `scratchpad/<seat>-<round>/`, created by the harness, and nothing at the root.**
3. **A count in a frozen artifact must be reproducible by the reader.** `slices/S01/SPEC.md:16`
   says the sweep covered "125 references"; the handoff it cites prints "221"; I measure 277.
   Three numbers for one sweep, none derivable from the others. COMMON §10.3 already demands the
   derivation in the same sentence — it needs to bind *counts*, not only geometry constants.
4. **The verdict table should carry the probe command per finding.** My round-2 packet had to
   spell out "re-run the B2 jsdom probe, your own N1 sweep, the md5s, the compass count". That
   list should have been generated from my round-1 verdict, not hand-written by the orchestrator —
   which is possible only if every finding names its own reproduction command. Adding a
   `probe:` field to each finding makes the scoped re-review packet mechanical.
5. **What worked and should be kept:** the author's per-finding `file:line` table, the
   supersession header naming a finding id per change, and archiving `SPEC-v1.md` before any edit.
   I verified the archives byte-identically against my round-1 citations in one command. That
   convention turned "did anything else move?" from an argument into a `diff`.

## 12. Round-2 cost accounting

| Item | Cost | Avoidable? |
|---|---|---|
| Re-reading the packet chain from disk in a fresh session (packet, COMMON, round-1 packet, my own 557-line verdict, rework packet, 293-line handoff) | ~12 min | **Partly.** The verdict file worked as memory exactly as intended — this is the cheap half. |
| Writing the B2 re-probe from the v2 SPEC's own hooks | ~10 min | No. It is the finding. Reusing my round-1 harness saved ~10 more. |
| The idiom matrix (4 idioms × pre-assign on/off) | ~5 min | No — it converted "the change dispatch looks wrong" into four measured rows. |
| Re-scripting the xref sweep with a *different* heuristic | ~12 min | No, and see §10: the second heuristic is what found N10. |
| v1→v2 diff read, 31 hunks, mapping each to a named finding | ~15 min | **Yes, largely** — the supersession headers made it verifiable, but I still read every hunk. A `finding-id` marker per changed block would make this a script. |
| Re-measuring N5 to rule on the contest | ~2 min | No. Two commands, and it overturned my own finding. |

**Deliverables:** `reviews/REQ-REV-01-r2.md`, this Part II, one TOOLING-TRAPS append, three board
comments, four scratchpad probes retained for round 3.

## 13. On the author, round 2

It contested exactly one finding and it was **right**, with a measurement in two trees. It swept
B1's class and found two members I had not named — both real. It found and fixed two defects it
introduced *during* the fix, and said so in the handoff rather than letting me find them. That is
the behaviour the loop is supposed to produce. The two new blocking findings are not sloppiness;
they are the predictable output of a packet that asked for a prose fix to an executable defect.
**Charge them to §11.1, not to the seat.**

---

# PART III — ROUND 3, the last lawful review round (fresh session, 2026-09-06 19:25→ EEST)

Continued, not restarted. Part I is the blind round-1 review, Part II the round-2 scoped
re-review; both were other sessions of this seat, and the only thing that survived between them
is the verdict file on disk. This part is mine.

## 14. The body on the floor, round 3: there wasn't one — and that is the finding

Round 1 found 3 blocking defects. Round 2 found 2 *new* blocking defects introduced by the fix.
Round 3 found **zero blocking defects**, and the difference between round 2 and round 3 is one
sentence in a packet: `COMMON.md` §10.10 — *a finding proved by a probe is discharged only by
re-running that probe against the fix*. That rule was written **because of** round 2's damage,
by the orchestrator, on the same day. Round 3 is the first round in this mission where the
author executed the remedy before freezing it, and it is the first round with no new blocking
defect. One rule, written once, changed the outcome of the next round. That is the whole case.

**The counterfactual, priced.** Round 2's B4 and B5 cost a full author round plus a full review
round — call it ~2.5 seat-hours and two provider sessions. The probe that would have prevented
both takes **3 seconds** to run and was already on disk, by absolute path, in my own round-2
verdict. §10.10 is the cheapest rule in this mission's book.

## 15. What I nearly got wrong, round 3

**I nearly ruled the author's case 6 out of scope.** My round-2 verdict's prediction 1 said, in
terms: *"B4 and B5 will be fixed in under ten minutes and will be the only content of round 3.
If round 3 touches anything else, that is the signal the loop has lost its scope."* The author
applied my ordered remedy verbatim **and then added a sixth hook case I never asked for**, and
declared it, and offered to have it deleted. My first instinct was to charge it against my own
prediction.

That instinct was wrong, and the probe is why. The sentence B5 charges does two things: it
states a hook, and it claims that hook *"exists so a future seat that switches to controlled
inputs breaks a test that names the reason."* My remedy fixed the hook. **My own probe, run
this round, shows the fixed hook is green under all four implementation variants — it detects
nothing.** Applying my order literally would have left the SPEC asserting a guarantee that is
measurably false: B2's class, in the sentence written to close B2's class, for the third round
running. The author caught what my remedy would have shipped.

**The lesson for the review seat, not the author:** *a remedy dictated in a review verdict is
itself an unrun claim.* I proved B5 by execution and then prescribed the fix by reasoning. Round
2's root cause was "the packet quoted the reviewer's conclusion instead of ordering the probe" —
but the conclusion the packet quoted was **mine**, and my remedy sentence had never been run
either. §10.10 currently binds the author. **It should bind the reviewer symmetrically: a
reviewer who prescribes a specific remedy runs it first, or writes the finding without a
remedy.** That is the single change I would make to this loop.

## 16. Where THIS packet fought me — exactly

1. **`allowed` names the wrong scratch directory.** `REQ-REV-01-R3.md:8` grants scratch under
   `…/scratchpad/req-rev-01-r2/` — round 2's directory — while `COMMON.md` §10.11 (written in
   response to my own round-2 deferred item) requires `<seat>-<round>`. I used
   `req-rev-01-r3/` and am declaring the deviation rather than obeying a stale path into a
   directory holding another round's evidence. **Cost: ~1 minute and this paragraph.** Cause: the
   packet was cloned from R2 and one path was not re-templated.
2. **The packet orders me to check `SPEC-v2.md` byte-identity "md5s from your round-2 verdict" —
   and my round-2 verdict records no whole-file md5 for the v2 SPECs**, only for `SPEC-v1.md`
   (they were `SPEC.md` when I reviewed them). I substituted a stronger check: every round-2
   citation re-read *at its round-2 line number* inside `SPEC-v2.md`, plus the interface
   paragraph md5 and the v2 header row counts, all of which my round-2 verdict does record. All
   matched. **Cost: ~4 minutes.** Cause: an orchestrator writing a re-review packet cannot know
   which constants the previous verdict actually pinned; **the fix is a `## Pins for the next
   round` block at the end of every verdict** — a machine-readable list of the md5s, counts and
   line numbers the next lens must be able to re-check. I am adding one to this verdict.
3. **Nothing else.** The R3 packet is the best of the three: it names the probes by absolute
   path, names the scope as four finding ids, and states the round-3 law (no fourth author
   round; residue becomes a V row) *in the packet* rather than leaving me to derive it.

## 17. What repeatedly cost tokens, across all three rounds of this seat

| Cause | Rounds | Priced |
|---|---|---|
| Reading 600–800-line frozen SPECs to check a four-line change | 2, 3 | ~15 min/round. **Fix: the supersession header's `Where` column should carry the v3 line range, not just the section name** — I derived the ranges from `diff` every time. |
| No archive diff is produced by the author | 2, 3 | ~5 min/round. `diff -u SPEC-v2.md SPEC.md` is the first thing any re-reviewer runs. **The author should print the hunk headers in the handoff**; it costs one line and saves the reviewer from proving "nothing unnamed changed" from scratch. |
| Counts stated without their command | 1, 2, 3 | ~20 min total, and it is *still* producing findings in round 3 (N13). §10.10's corollary is right and is not yet habitual. |
| Ticket-comment archaeology | 1, 2, 3 | ~4 min/round. The board's `show --json` truncates; every round I re-write the same `jq`/python slicer. **Fix: `hermes kanban comments <ticket> --full`.** |
| Re-deriving the harness (jsdom + React from `apps/ui/node_modules`, `IS_REACT_ACT_ENVIRONMENT`, `createRoot` + `act`) | 1 only | ~25 min once. Now amortised: my round-1/2 probes are in `.hermes/reports/consent-ui/probes/` and round 3 built a new probe on top of them in ~6 minutes. **Probe reuse is the single highest-leverage artefact this mission produced.** |

## 18. How to make this more of a one-prompt machine

1. **Promote §10.10 to the spine and make it symmetric.** Author *and* reviewer: no prescribed
   remedy without an executed remedy. Three of this mission's five blocking findings are the
   same defect class — a claim written into a frozen document without being run.
2. **A `## Pins for the next round` block, mandatory on every verdict.** md5s, counts, line
   numbers, probe paths. It is the interface between two blind sessions of the same seat, and
   right now it is prose that the next session has to mine.
3. **A frozen document should be lintable.** Every count in this mission's SPECs could be
   machine-checked: `tools/spec-lint` re-running each stated command and diffing its output
   against the stated number would have killed N11 in round 1, N13 in round 3, and both of the
   author's own count slips in this round's handoff, at zero human cost. The author proposes the
   same tool in its Part III §22. **Two independent seats converged on it; build it.**
4. **Ship the probes with the packet.** The R3 packet's single best line is the absolute path to
   the probe directory. Every re-review packet should carry it.
5. **Stop paying for line ranges by hand.** `COMMON.md` §10.5 makes the orchestrator supply line
   ranges for product files; extend it to mission artefacts in re-review packets. Half my
   round-3 reading was locating four line ranges the `diff` already knew.

## 19. Round-3 cost accounting

- Wall clock: ~45 min. Probes: 3 (one new, two re-runs) + 2 sweeps + ~20 measurement commands.
- Blocking findings: **0**. Non-blocking: 3 (N12–N14), one of which needs a V row because the
  document it lives in is frozen and a fourth author round is not authorized.
- Findings withdrawn or downgraded: 0. Predictions from round 2 falsified: **1 of 6** (my
  prediction 1 — round 3 *did* go beyond B4/B5, and it was right to).
- Nothing I reviewed was edited by me; no git write; read-only throughout.

## 20. On the author, round 3

It ran the probes **before** editing, reproduced both findings RED, and then did the thing no
seat in this mission had done: **it executed the remedy it had been ordered to write**, found
it green under every variant, and said so instead of shipping it. It then measured which pin
*does* discriminate and moved the guarantee onto it — and flagged the whole thing as the one
judgement call in the round, with an explicit "delete these twelve lines together if you rule it
out of scope." That is the correct shape for an author who thinks its reviewer's order is
incomplete: obey it, measure it, extend it, declare it, and hand the reviewer a clean revert.

It also filed a defect against its own DECISIONS lines ten minutes after naming that same defect
class, appended rather than edited, and left its wrong first `awk` on the record beside the right
one. Two of its stated counts are still wrong (N13) — in the handoff, not the SPEC, and both
harmless. **Charge those to the absence of a lint, not to the seat.**
