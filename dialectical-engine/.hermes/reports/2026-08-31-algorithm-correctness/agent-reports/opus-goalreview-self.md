FULLY DONE — opus (T4) self-report · goal-review seat, rounds 1–2 · mission 2026-08-31-algorithm-correctness

# Self-report — T4 opus-goalreview

Router §3 as a case file, for the review seat specifically (my T1 blind-lens self-report is
`opus-blind.md` and covers different ground). Scores: r1 filed 20 items, 20 accepted; r2 filed 3,
all residue of my own r1 fixes; 0 unresolved r1 findings.

## 1. The finding that nearly did not happen, and the one that took three passes

**Near-miss — r1 B4 (live-UI verdict vocabulary).** T11 v1 ended "UI banner consumes the states it
already declares." I opened `web/components/VerdictBanner.tsx:5`, saw it print `answer.verdict.state`
raw, and had already written "correct, no-op" in my notes. The finding exists only because I ran one
more grep for a *second* banner and found `apps/ui/components/VerdictBanner.tsx:35` consuming an
entirely different vocabulary (`endorsed | endorsed_with_caveat | suppressed_no_evidence`,
`apps/ui/lib/types.ts:613`). **Price of the check: one grep. Price if missed: the mission ships a
code-derived three-state verdict that never reaches the live product's headline** — and it would
have shipped looking green, because the legacy banner the draft was implicitly describing does
render it. Transferable rule, and it is the same rule my T1 seat learned in a different costume:
**never confirm a claim against the first file that satisfies it — confirm it against the file the
product actually runs.**

**Three passes on one defect class.** The verdict ladder was found independently by me (r1 B3:
not total, not disjoint) and by codex (their B1, with concrete counterexamples). v2's fix — an
ordered four-step ladder plus a property test over the `(winner, margin, disagreement)` cube — is
correct and still incomplete: a mono-maker run has no runner-up and therefore no margin, and
`measureDispersion` returns ABSENT below two judgements (`s04.ts:270-271`), so two of the three
inputs do not exist for a run the Global DoD explicitly requires to complete (r2 B1). **Three
reviews, one defect class, still open.** That is the strongest evidence in this mission for the
upgrade in §4.3: totality is not a finding you fix, it is an obligation you template.

## 2. What repeatedly cost tokens

**(a) Re-verifying file:line anchors by hand — the single largest line item across both rounds.**
Review question 3 was "are the file:line references correct against the pinned tree", and answering
it is pure mechanical work: open range, compare, record. r1 checked ~17 anchors; r2 checked ~12 new
ones. Between us, codex and I spent a meaningful fraction of two review rounds on it and found three
one-line drifts and one wrong path prefix. **This is a linter, not a seat.** See §4.1.

**(b) The read-set defect cost a full round on one item.** r1's packet lifted my blind law for
exactly two files while its own §2 named a third (`judge-adjudication.md`) as an artifact I should
use. I filed it (r1 N11), honoured the narrow lift, and parked the cross-check as CANNOT-ASSESS
(N12a). The orchestrator fixed the packet and I answered N12a this round — where it produced a real,
verified, untasked item (codex C11: every child node is claim-type-classified from the *original
question's* text, `runner:1633` → `judgement/index.ts:121-122` → `s04.ts:74-82`, so every node's τ is
composed through the root question's claim-type row). **A too-narrow read set did not lose that
finding; it deferred it by one round.** Cheap here because the round happened anyway. It would have
been expensive if r1 had been the last round.

**(c) Ambiguity in the *standard*, not the draft.** The Stop-1 correction says steering "contract
fields + dead askContract storage remain the cleanup surface" — which can mean "clean these now" or
"these are what is left to clean later". I burned two reads resolving it against S1-2's original
"contract fields stay so stored data remains valid" before concluding T2 read it correctly, and
filed the gap as M2 (the dead storage was in neither a task nor Non-goals). v2 closed it with one
Non-goals line. **When the review standard is prose, reviewers pay to disambiguate it once per
reviewer per round.**

## 3. Dead ends and what I nearly got wrong

- **T2 versus the "cleanup surface" phrase** (§2c) — resolved to *no defect in T2*, real defect in
  coverage. Recorded so a future reviewer does not re-litigate T2.
- **`resolveLeverage` looked like the answer to T7 and is a stub** (`propagation:637-644`, returns
  `LEVERAGE_UNRESOLVED` unconditionally). I nearly wrote "T7 should use `resolveLeverage`" before
  reading its body. The real source is `sensitivityRecords[].leverage` (`:605-626`). Filed as r1 N3;
  v2 now defines leverage over sensitivity records and gives the stub implement-or-delete. **A
  well-named stub is worse than no function**, and this one was sitting in exactly the place a
  builder would reach.
- **Over-reading the envelope path.** I initially drafted r2's envelope finding as blocking —
  a seventh COMPONENTS_ONLY producer outside T9's enumeration. Reading `createEnvelopeExhaustedResult`
  properly (`serve:370-411`: fires only after `protectedCoreVerified`, emits no prose,
  `ENVELOPE_EXHAUSTED` not `DEFECT`) showed it is crash-adjacent, not a quality fallback. Downgraded
  to non-blocking naming gap. **Severity discipline is part of the finding**; a blocking label I
  could not defend would have cost the drafter a redesign it does not need.
- **Codex C18 — verified, then deliberately not filed.** The evaluator does numericize review
  outcomes (`evaluator/src/index.ts:2476-2480`), which narrows my r1 D5. It does not contradict T6,
  because T6 changes consumption and not stored values. Recorded in the r2 N12a section as a
  one-line note for T6 rather than inflated into a finding.

## 4. What to upgrade — ranked by evidence from this mission

**4.1 · An anchor-resolution linter. Highest leverage, lowest cost.** Planning documents in this
mission cite code as `path:line` and `path:line-range`. A script that resolves every such anchor in
`.hermes/**/*.md` against the pinned commit and fails on a miss would have eliminated r1 N12c (three
drifts), codex N1 (a wrong `serve/src/...` path prefix), and the bulk of two reviewers' mechanical
time — and it would keep working every time the baseline moves. It also converts "all refs verified"
from a claim in a header into a checked fact. Build this before the next planning mission.

**4.2 · Read-set ⊇ evidence-set, enforced at packet construction.** A review packet's `readonly`
list must be a superset of every artifact its own §2 task text names. This is mechanically checkable
at dispatch. It is exactly the r1 N11 violation, and the r2 packet — full typed state, both
deliverable paths, verbatim marker, explicit lift — shows the fix works; that packet fought me
nowhere.

**4.3 · A totality obligation template for every "code derives a state" task.** Any task whose
output is a computed label/state ships with a mandatory DoD clause: *ordered, total, disjoint over
the named input domain, **plus** a named arm for every input that can be absent, with the property
test covering both.* Three review passes on the verdict ladder each caught a different slice of the
same class (mine: not total; codex: not disjoint; r2: domain excludes mono-maker). One template
clause catches all three at once.

**4.4 · "Enumerate the producers" rule for suppression rulings.** When a ruling says "X survives
only in case Y", the task must enumerate every *current* producer of X from the code and give each a
disposition — never assert the new state and move on. My r1 B2 found six untasked COMPONENTS_ONLY
gates; v2's per-gate table is excellent and still missed the seventh (r2 N1). The rule is cheap and
it is the difference between a table that is complete and a table that is merely long.

**4.5 · Consequence-tracing as an explicit review question.** My highest-value r1 findings — B1
(envelope formula still assumes two model sites per node, `register:172-200`) and B2 — were not
faithfulness or reference errors. They were *second-order*: a ruling changed the call topology, and
nothing propagated that into the code that budgets calls. The four review questions I was given ask
about faithfulness, DoD testability, references, and internal contradictions. **Add a fifth: "what
existing code assumes the old behaviour, and is it tasked?"** That question alone produced T17.

## 5. Toward the one-prompt machine

The reviewable unit that worked here was: *a pinned commit + a dated decisions file + a draft that
cites both*. That triple is what let two blind lenses converge and be adjudicated at all. To make it
one-prompt:

1. Ship 4.1 and 4.2 as CI/dispatch checks — they remove an entire review question and an entire
   round-trip class from the loop.
2. Ship 4.3 and 4.4 as /goal template clauses — they remove the two defect classes that survived
   the most review passes in this mission.
3. Keep the blind-then-adjudicate shape. It is expensive and it earned its cost: codex and I found
   the verdict ladder, the envelope, and the digest-membership defects independently, and the
   two-UI split (A1) was only resolvable *because* two lenses disagreed from different files.
4. Keep self-reports in the loop. Three of v2's "Recommended follow-ups OUTSIDE this /goal"
   (orphan-audit as CI gate, enum-reachability lint, stored-never-read column check) came from seat
   self-reports rather than findings. That is the mechanism turning per-mission pain into standing
   infrastructure, and it is working.

## 6. What I did not do

No probe was run in either round: no build, no tests, no database, no process. Every assertion in r1
and r2 is a static citation verified in my own pinned worktree, including the claims I imported from
the codex audit — I re-opened C11 and C18 in my tree rather than relaying them. I wrote exactly the
files each packet allowed (r1: one report; r2: this report plus `opus-goalreview-r2.md`), touched no
code, ran no git mutation beyond `status`/`rev-parse`, and did not read `board/inputs/*.html`, which
stayed forbidden in both rounds.

## 7. r3 addendum (verification round, goal-v3) — three corrections to the case file above

**7.1 · I was wrong to praise a DoD, and a cross-lens fix caught it.** §1 of this report and my r1
review both singled out v1's fresh-context DoD — "the synthesizer request contains digest only" — as
the best-specified clause in the draft. Taken literally it would have starved the EVALUATOR, which
needs the candidate statement and the prior objection on retries. Codex's r2 caught it; v3 now
splits the assertion per role and restates it as "NO debate transcript or provider history beyond
those named artifacts — never the absence of artifacts a role needs." **The lesson corrects §1's:
checking a claim against the file the product runs is necessary but not sufficient — a DoD must also
be checked against every ROLE that must satisfy it.** I checked the synthesizer's request and never
asked what the evaluator's request would need to contain. Cheap to catch, and I did not.

**7.2 · The totality template (§4.3) is now evidence-backed, not a hunch.** The verdict ladder took
four passes: mine (not total) → codex's (not disjoint) → mine again (domain excludes mono-maker) →
v3's step-0 ABSENT arm, which finally closes it. Four passes, one defect class, three reviewers'
time. A single template clause — *ordered, total, disjoint over the named domain, plus a named arm
for every input that can be absent* — would have produced the v3 text on pass one. This is the
highest-confidence upgrade in this report and I would ship it before the next planning mission.

**7.3 · "Enumerate the producers" (§4.4) needs a second half: enumerate the OBLIGATIONS.** v3
completed the COMPONENTS_ONLY producer list by naming envelope exhaustion as the fourth crash class
and assigning it to T9 — and gave it no DoD, because T9's DoD still says "one test per former gate
path" and the envelope is not a former gate (r3 N1). The pattern generalises: **an ownership
sentence without a matching obligation clause reads as coverage and is not.** Amend 4.4 to:
when a ruling says "X survives only in case Y", enumerate every current producer of X, give each a
disposition, *and* give each an obligation in the owning task's DoD — the count of dispositions and
the count of tests must match. That check is mechanical and would have caught this edit.

**Round economics, for the record.** r1: 20 items on a full read of v1. r2: 3 items, all residue of
my own r1 fixes. r3: 1 item, residue of a v3 edit. The convergence is real, and the cost per round
fell roughly in proportion — but every round's findings were *created by the previous round's
fixes*, which is the strongest argument in this file for front-loading templates (7.2, 7.3) over
adding review rounds.
