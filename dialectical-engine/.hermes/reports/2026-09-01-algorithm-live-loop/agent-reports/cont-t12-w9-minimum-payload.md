READY FOR PEER REVIEW · comments read through: v-minimum-payload-2026-09-03

# Self-report — cont-t12-w9-minimum-payload · BUILD(CONT-T12) · W9 (V-MINIMUM-PAYLOAD)

Seat: cont-t12-w9-minimum-payload (Claude Opus 5, 1M context) · mission `2026-09-01-algorithm-live-loop`
(continuation of 2026-09-16) · base `b37263e4` · code commit `7cfbde9e` · branch
`mission/2026-09-16-algorithm-live-loop-continuation`.

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

---

## 1 · The body: what actually went wrong, and why

The ticket was small — stop serialising four fields into a prompt, and add one sentence to an
instruction string. It took roughly 3× the tool calls it should have, and every one of the overruns
traces to the SAME generating condition, which is the finding I would put in front of V above all
others:

> **A fact that arrives pre-measured is the most expensive sentence in a packet, because it is the
> one nobody re-measures.**

My packet carried, as a named fact I was explicitly told not to re-derive:

> no double keys on `roleRef`, `round`, `stage` or `registerVersion` (grep over
> `tests/integration/t17-envelope-ledger.test.ts tests/integration/database.test.ts
> acceptance/ceremony.test.ts acceptance/panel-multi-maker.test.ts` found none)

It is **false at b37263e4**. `tests/integration/t17-envelope-ledger.test.ts:126-141` parses `.round`
out of the model-facing payload and THROWS when it is absent. I shipped a green unit gate, a green
neighbour gate and a clean typecheck over a change that broke an integration suite, and only caught
it because I ran the reader suites the WHO-READS-THIS-STRING rule told me to run — a rule in the
same packet that told me I did not need to.

Two independent reasons the orchestrator's grep missed it, both worth institutionalising:

1. **The grep looked for a DISPATCHER, not a READER.** It filtered on `includes|body|classify|match`.
   `evaluatorRound` classifies first and then reads a field to decide what to ANSWER. A payload gets
   consumed in two distinct ways and only one of them looks like a discriminator.
2. **It was case-sensitive.** `\bround\b` does not match the identifier `evaluatorRound`; `"round"`
   does not match `.round`.

Price: ~9 tool calls (ablation, two diagnostic edits, two diagnostic runs, root-cause reading,
repair, re-run) and one near-miss on a handoff that would have been REWORKed at REV(S).

## 2 · What I nearly got wrong

- **I nearly reported "the failure is probably pre-existing."** The t17 failure appeared in a suite I
  had not edited, in a file about envelope ceilings, with an error (`ANSWER_PERSIST_FAILED`) that
  named nothing in my diff. The ablation is what refused that story: green at base, red with my
  change, 1 command. **Do the ablation before writing the sentence, not after.**
- **I nearly claimed a RED I had not earned.** The guard imports the symbol the fix introduces, so at
  true base 12 of 14 rows failed with `toSynthesisPromptPayload is not a function`. Per `:2076` that
  is a missing-symbol frame, not the defect. Pasting it as "RED-first" would have been a fabricated
  RED with a true-looking transcript. I took a second red after a behaviour-preserving extraction,
  where the frame reads `expected [ 'roleRef', 'round', 'registerVersion', 'stage' ] to deeply equal
  []`. Both are in the SDD report; neither is presented as the other.
- **I nearly trusted the packet's mechanism for the doubles' survival.** It says their discriminator
  is "a token of `EVALUATOR_INSTRUCTIONS`, which your projection KEEPS". Measured: `fairness_to_losers`
  is in `EVALUATOR_CONTRACT_TEXT` (`apps/runner/src/index.ts:176-177`), the SYSTEM message, which I
  never touch. Right outcome, wrong reason — and the wrong reason is load-bearing, because a future
  seat that drops `instructions` from the projection would believe it is breaking four doubles when
  it is not, and a seat that edits the system prompt would believe it is safe when it is not.

## 3 · Dead ends, named so nobody re-derives them

- **`t09-synthesis.test.ts` needs no edit at all.** The packet and brief both anticipate a T9
  assertion that pins the SENT payload. There is none: t09 drives `runServeGateChain` with a
  `ServeGateDependencies` double that receives the REQUEST OBJECT and never reaches the runner's
  prompt construction. Every t09 assertion (`:324` `priorCandidateRef`, `:336-339` key sets,
  `:344-346` the variable literally named `wire`, `:356-358` roleRefs) is a RECORD assertion. The
  one named `wire` is the trap: it is `JSON.stringify` of the recorded request, not of the packet.
  **Do not go looking for a sent-shape assertion in t09; it does not exist.**
- **Do not try to drive the "real call path" from a unit test.** The prompt construction lives inside
  `WalkingSkeletonRunner`'s private `execute`, in a dependencies literal ~2,300 lines into a method
  that needs a database and a claimed work item. The packet's Step 1 ("render through the REAL call
  path with a fake provider that records `messages`") is not reachable from `tests/unit/`. The owed
  OUTCOME is reachable another way — see §4.
- **`tests/unit/evaluator-addon.test.ts:138` is NOT a member of the withheld-field class**, despite
  parsing `request.packet.messages.at(-1)!.content`. It is the blind grading add-on
  (`evaluator.grade-judge-output.v1`), a different surface with `sampleId`/`questionExcerpt`/`grade`.
  I checked it so the next seat does not have to.

## 4 · Where the packet was unclear or wrong (each with the outcome I reached instead)

| # | Packet said | Measured | What I did |
|---|---|---|---|
| P1 | no double keys on the four fields | `t17-envelope-ledger.test.ts:133` reads `.round` and throws | repaired that double at one point under WHO-READS-THIS-STRING; reported |
| P2 | the doubles' discriminator is a token of `EVALUATOR_INSTRUCTIONS` | it is `EVALUATOR_CONTRACT_TEXT`, the SYSTEM message | same outcome, different mechanism; recorded so it cannot mislead later |
| P3 | `t17-envelope-ledger.test.ts:192` | the line is `:206` at b37263e4 | re-located (the packet's own `:5045` rule) |
| P4 | ticket names `index.ts:4038` / `:4114` | `:4081` / `:4157` | re-located, as the packet instructed |
| P5 | Step 1: render through the REAL call path from `tests/unit/` | unreachable — needs a DB-backed runner | rendered the SHIPPED projection + SHIPPED request builders, and added a SOURCE coverage row pinning that the runner's two sites call exactly that projection and `JSON.stringify(request)` occurs 0 times |
| P6 | `allowed` omits `tests/integration/t17-envelope-ledger.test.ts` | the repair was mandatory to keep the suite honest | admitted by the packet's own WHO-READS-THIS-STRING clause ("such a test is INSIDE your allowed surface at that assertion"); flagged for the reviewer to rule on |

P5 is the one I want V to notice. **A suggested MECHANISM that is impossible is cheap to route around;
what is expensive is not being told which part of the step is the requirement.** Here the requirement
was "assert over the bytes actually sent"; the mechanism was "drive the runner". Had the packet said
which was which, I would not have spent calls proving the mechanism impossible before substituting one.

## 5 · What repeatedly cost tokens — ranked, with the upgrade

1. **Pre-measured facts with no expiry stamp (P1-P4).** Four of six packet defects are stale or wrong
   MEASUREMENTS, not wrong intentions. `:5045` already rules that a ticket quoting a count writes it
   `as of <sha>: N`. **It is not being applied to PACKETS, only to tickets.** Upgrade: the packet
   template refuses to interpolate any count, line number or grep result without `as of <sha>`, and a
   seat treats an unstamped one as unmeasured. This would have deleted four of my six defects.
2. **Errors that discard their cause.** `apps/runner/src/index.ts:1981` rethrows
   `TypedDomainError(code, code)`. Recovering the real cause cost two edits and two runs. One
   `String(error)` in the message would have made the root cause the FIRST thing I read.
3. **Doubles that die instead of refusing.** A fixture that throws in its HTTP handler produces a
   dead socket, which the product correctly classifies `TRANSPORT_DEATH`. The fixture's bug wears the
   product's costume, and you debug the wrong layer until an ablation stops you.
4. **The sandbox's git-adjacency heuristic.** Three commands were refused — a `cat >> file <<EOF`
   heredoc, and two loops containing `md5` — because a runtime variable made them "too complex to
   verify". Each cost a re-issue in a different form. Not wrong to be careful; the cost is real and
   it is paid on every seat, every session. A per-worktree allow of `md5`/`cp`/`cat` would remove it.

## 6 · Toward the one-prompt machine — three concrete upgrades

1. **Make the packet's factual claims EXECUTABLE instead of prose.** Every "grep found none" in a
   packet should ship as the command plus its expected output, so the seat's first act is to re-run
   it — one call, and a false premise dies before any code is written. Mine would have died in call
   4 instead of call 30. This is the single highest-leverage change available.
2. **A `--verify-packet` preamble.** Mechanically: re-run every quoted grep, `[ -f ]` every path,
   `sed -n` every quoted line, `git rev-parse` the base. All six of my packet defects are detectable
   by that preamble, and none of them needs judgement to detect. It is ~5 tool calls and it front-loads
   exactly the failures that are most expensive when found late.
3. **Give prompts a stable ORGAN MARKER so prose stops being an API.** `:5015` said this in July and
   it is still true: four doubles key on product prose, a fifth READS product payload fields. Both
   classes vanish the day the request envelope carries an `organ` field and a round ordinal that the
   doubles may read while the MODEL-facing projection withholds it. My repair (count, do not parse)
   fixes one member; the class stays open, and it will bite the next payload ruling too. This is a
   1-ticket, high-ROI structural fix and I recommend it be minted now.

## 7 · The one thing I would keep

The refutation duty. Eight mutants, six killed as designed and two neighbours confirmed NOT caught —
including one that rewords the F-W9-1 sentence entirely and stays green, which is the difference
between pinning a PROPERTY and pinning my own prose. It cost 4 tool calls and it is the only reason I
can say the guard catches the re-added key rather than the demo I showed it.
