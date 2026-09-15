# CODE-CROSS-03-REWORK-R1 — self-report (murder case)

Seat: coding, Claude Opus 5, fresh session · mission `consent-ui` · ticket `t_ed4c5e73` ·
rework round 1 of max 3 · lane `.worktrees/consent-s02/dialectical-engine`, branch
`slice/consent-s02`, BASE `4ef2f7d3` → commit **`4cc0f4b6`**.

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How
> can we turn this into a one prompt machine even better.

---

## 1. THE CAUSE — one word, three documents, one API

The blocking finding I discharged is not a coding error. It is a **VOCABULARY SUBSTITUTION inside
a measured remedy.**

The chain, with the actual artifacts:

1. `CODE-REV-CROSS-02 r1` §N2 measured a rival mechanism and wrote it in the vocabulary it
   measured: `compareDocumentPosition & DOCUMENT_POSITION_CONTAINED_BY`. That predicate is
   **strict** — `a.compareDocumentPosition(a)` is `0`, so the `CONTAINED_BY` bit is clear.
2. The orchestrator transcribed that remedy into `CODE-CROSS-03.md:8` as `incumbent.contains(lower)`
   — "`Node.contains`, not `compareDocumentPosition`" — and worded the rule "**DESCENDANT**".
   `Node.contains` is **reflexive**. The English and the API now disagree at exactly one input.
3. `CODE-CROSS-03` implemented the packet literally, **noticed the divergence, and reported it**
   in TOOLING-TRAPS (`:2706`) rather than patching it, on the correct ground that its `allowed`
   list granted no test case for the identity shape. That is textbook seat behaviour.
4. `CODE-REV-CROSS-03 r1` **ran** the shape instead of arguing it, and found it is worse than the
   trap entry said: not one swap but a walk — three surfaces sharing a container hand `Escape` to
   the **earliest** registered.
5. This round: one `||` term, four artifacts, two cases, one round.

**The murder weapon is step 2, and the victim is a round.** Not a big round — round 1 of 3, one
seat, ~50 minutes — but it was fully avoidable at zero cost, because the correct primitive was
already sitting in the verdict the packet was quoting.

**COMMON §10.68 now states the rule** ("when a packet changes the primitive a measured remedy
used, it lists the cases where the two differ"). I want to record what §10.68 does NOT yet do:
it is a rule addressed to a human writing prose, and the failure mode it guards is a
**two-token substitution that reads identically in English**. `contains` and `CONTAINED_BY`
differ in one boundary case out of an infinite input space, and no reader spots that by reading.

**The upgrade that would actually catch it:** a packet that prescribes a DOM predicate carries a
three-line truth table for the boundary inputs, filled in — `x === y`, `y === null`,
`x` detached — and the seat's first act is to run it. `CODE-REV-CROSS-03 r1` did exactly this and
it took the reviewer six probe cases. Six cases is cheaper than a round, and it is the same six
cases every time this class recurs.

---

## 2. WHAT I NEARLY GOT WRONG

**(a) I nearly shipped an assertion that pins nothing.** The packet's §2 charge reads: "two
surfaces sharing one container node → the last-opened answers `Escape` **and traps Tab**". I
wrote the Escape case, and then — before writing the Tab half — asked what mutant it would catch.
The answer is **none**: two entries holding the SAME container give `trapTab` an identical
`querySelectorAll` result whichever entry `topmostSurface()` returned, so no mutation of the
tiebreak can move the outcome. The reviewer's own probe says the same in its P5 comment
(`code-rev-cross-03-r1-reflexive-contains.probe.test.tsx:232-234`), and its P5 exists to
DEMONSTRATE that Tab is not a second ranking, not to pin one.

Had I transcribed the packet literally I would have shipped a green assertion with no discriminating
mutant — precisely the acceptance-defect family this repo has recorded eleven variants of, arriving
inside a TEST rather than inside a command. `heartbeat-worker` §2 is explicit ("if you cannot
construct a mutant your test catches, the test pins nothing — say so rather than shipping it"), and
it is the only thing that stopped me. **Cost: ~4 minutes of thinking. Cost if I had not: a green
assertion in the ONE shared helper's suite, believed to cover Tab, forever.**

**(b) I nearly wrote ONE case instead of two.** The packet says the three-sharer case is
"optional". My first instinct was that it is redundant — both cases go red under the same mutant
(the identity term removed), so the second one looked like scroll. I built the mutant that
separates them before deciding: **an identity guard applied on the FIRST pass-2 iteration only.**
With two sharers, pass 2 runs exactly once, so that half-fix is GREEN against the pair and WRONG
against the triple. Measured: `M4 | 1 failed | 34 passed (35)`, the three-sharer case alone.

That is the general technique and it is worth naming: **when two cases look redundant, do not
argue about it — construct the mutant that separates them. If none exists, delete one; if one
exists, you have just written the comment that justifies both.** It cost one mutant run (~7s).

**(c) I posted a HEARTBEAT with a cursor one short of the truth.** I wrote "comments read
through: 7" when the ticket held 8 at that moment, because I counted with a `grep -c '^  \['`
over `k show`'s human output, which merges comment lines and audit-log lines and wraps long
first lines. The accurate count comes from `show --json` and `len(d['comments'])`. Worse: the
comment I had not read (#7, `ORCHESTRATOR VERDICT CONSUMED`) landed between my first `k show`
and my CLAIM post, so my CLAIM's "6" was true when measured and stale when posted. I read #7
immediately afterwards; it changed nothing. **COMMON §10.56 says measure at POSTING time; it does
not say WITH WHAT, and the obvious tool is wrong.** See §5 for the one-line fix.

---

## 3. DEAD ENDS — do not re-derive these

* **Do not look for a case where `Tab` discriminates the shared-container shape.** It cannot, by
  construction: `trapTab(entry)` reads `entry.read().containerRef.current`, and both entries hold
  the same node. The case that DOES pin "Tab reads the entry Escape reaches" is the existing
  nested pair, where the containers differ, and mutant M2 reds it.
* **Do not try to write a fixture for `!container.isConnected` in pass 2.** The reviewer's proof
  reproduces and I re-derived it independently: pass 2 runs only while `topContainer !== null`;
  pass 1 chose a `null`-or-CONNECTED container; every node a connected element `contains()` is
  connected; so a disconnected `container` already fails the next line. There is no fixture. The
  finding says so, and I am repeating it here because a future seat will meet the term and reach
  for a test before it reaches for the proof.
* **Do not "fix" the `TS2307: Cannot find module 'react'` in the declaration-emit probe.**
  TOOLING-TRAPS `:2616` already says this and I confirm it: `React` appears only in type
  positions, declaration emit prints the specifiers verbatim, and both `.d.ts` files are complete
  and comparable. Aliasing `react` into a throwaway tsconfig buys nothing.
* **Do not read `CMD-C6`'s `verdict=1` on a dirty S02 lane as a regression.** Its `s02` arm is
  `git diff --stat HEAD -- <the four S02-owned paths>`, and in the S02 lane those paths are
  exactly what a coding seat edits. It is `1` for the whole working-tree phase and `0` the moment
  you commit. (Both of its S02 arms are then vacuous here, because `slice/consent-s02` resolves to
  HEAD — already ticketed, `t_38c6bbf2`.)

---

## 4. WHAT REPEATEDLY COSTS TOKENS — measured on this run

**(a) Reading TOOLING-TRAPS in full: 2,814 lines, ~4 tool calls, ~45k tokens of context, and it
is the single largest fixed cost of a coding seat in this mission.** It is also correct policy —
`CODE-CROSS-03` paid a live gate cycle for a trap recorded 114 lines above its packet's delta
boundary, which is why §10.67 exists. But the cost is now paid by EVERY seat, in full, forever,
and it grows by ~150 lines per seat.

The remedy is already requested (`t_38c6bbf2`, a 20-line index) and **I want to sharpen the ask,
because an index alone will not work.** A subject index invites a seat to read four entries and
skip the rest, which reproduces exactly the delta-read failure §10.67 was written to kill. What
works is an index **keyed to the seat's own file surface**: entries tagged with the paths and
tools they constrain (`modalSemantics.ts`, `globals.css`, `hermes kanban`, `vitest --config`,
`git checkout`), so a packet can say "read the whole file, and these N entries are the ones that
touch your `allowed` list" — the full read stays mandatory, the ATTENTION is directed, and the
tagging is mechanical (a `path:`/`tool:` line per entry, added at append time by the seat that
already knows).

**(b) Three of the four artifacts I changed are PROSE re-statements of one sentence.** The class
sweep for B1 has four members: the code, the helper's doc comment, `CookieConsent.tsx`'s
comment, and ADR-0022's addendum — plus a fifth in `S02/DECISIONS.md`. Every one had to be found,
read, edited and re-verified by hand, and the same shape recurred in `CODE-CROSS-03`'s round
(`returnFocusRef`'s trigger clause was stated in three places and wrong in all three).

**This is the mission's most expensive structural habit and it has a mechanical fix.** A rule that
governs a shared helper should have ONE canonical statement, in the helper, and every other
artifact should QUOTE it by pointer rather than paraphrase it. A `tests/support/` module already
does this for the four CSS marker strings (`consentMarkers.ts`, this ticket's own previous round).
The prose equivalent is cheaper still: a `CONTRACT:` block in `modalSemantics.ts` whose exact text
the ADR and the component comments cite by name, plus a source-text test asserting the ADR
contains that block byte-identically. Two of the last three rounds on this ticket were spent on
prose drift between copies of one sentence.

**(c) The `k show` cursor problem cost me a defective marker and will cost the next seat one too**
(§2c). Fix in §5.

**(d) What did NOT cost anything, and is worth copying.** The scratchpad `--config` route for
running a promoted probe (COMMON §10.46 / TRAPS `:2306`, `:2440`, `:2485`) worked first time, with
zero files created in the lane and porcelain `0` from CLAIM to handoff. I built the runner by
copying the lane's `vitest.config.ts` alias array and replacing `import.meta.dirname` with `$LANE`,
exactly as `:2440` prescribes, then adding the probe's own `@lane/modalSemantics` specifier. Three
recorded traps, obeyed literally, saved what the record says is ~15 minutes each.

---

## 5. THE ONE-PROMPT MACHINE — five upgrades, cheapest first

1. **Give the board CLI a cursor verb.** `hermes kanban --board <b> cursor <ticket>` printing one
   integer. Today every seat re-derives it from `show`'s human output with a grep that is wrong
   (it merges the audit log with the comments, and wraps), or from `show --json | jq
   '.comments | length'`, which is right and which nobody's packet spells. **COMMON §10.56 should
   carry the exact command, not the rule alone.** Cost: one line in COMMON today, one CLI verb
   later. This defect has now been paid for by at least two seats.

2. **A packet that prescribes a DOM/string predicate carries its boundary truth table, filled in.**
   Three rows — identity, `null`, disconnected — with the answer per row, derived at packet-write
   time. This is §10.68 made executable instead of exhortative, and it is the exact defect that
   produced this round.

3. **Tag every TOOLING-TRAPS entry with the paths and tools it constrains** (§4a). Keeps the
   mandatory full read while making the packet able to say which entries are load-bearing for THIS
   seat's `allowed` list.

4. **One canonical statement per shared rule, cited rather than paraphrased** (§4b), with a
   source-text test that the citations still match. Two of three rounds on this ticket were prose
   drift.

5. **Make "name the mutant that separates two cases" an explicit step of the refutation duty.**
   `heartbeat-worker` §2 already demands a mutant per assertion and a neighbouring mutant that
   must NOT be caught. It does not demand the mutant that **separates two cases you suspect are
   redundant**, and that is where a seat either ships scroll or deletes a load-bearing case. It
   cost me one 7-second run to answer it here and it produced the strongest sentence in the ADR
   addendum.

---

## 6. WHERE THIS PACKET WAS UNCLEAR OR WRONG — with `file:line`

The packet (`.hermes/planning/consent-ui/packets/CODE-CROSS-03-REWORK-R1.md`) is the best-shaped
one this ticket has had: §0 MEASURED TRUTH above the reading list, the probe named with its
expected figure, the remedy quoted as a line of code, the class enumerated per member, the guard
suites named with their line ranges, and the TRAPS instruction in §10.67's corrected form (I
verified `wc -l` = **2814**, exactly the dispatch figure). Four defects, all minor, none blocking:

* **P1 — `CODE-CROSS-03-REWORK-R1.md:9` cites the helper's doc comment as `modalSemantics.ts:148-156`;
  the tiebreak bullet whose termination argument is charged lives at `:150-154`.** `:148-149` are
  the tail of the pass-1 bullet and `:155-156` are a blank line and the start of the `FOLLOWING`
  paragraph. The range CONTAINS the target, so nothing was misled, but COMMON §10.24 requires a
  `grep -n`-measured range and this one was not measured. (Measured by me at BASE `4ef2f7d3`.)

* **P2 — `:21`/§2.1 prescribes an assertion that cannot discriminate.** "two surfaces sharing one
  container node → the last-opened answers `Escape` **and traps Tab**". The Tab half pins nothing
  (§2a above), and the reviewer's own probe comment says so at
  `.hermes/reports/consent-ui/probes/code-rev-cross-03-r1-reflexive-contains.probe.test.tsx:232-234`.
  The packet quotes that probe as its oracle and did not carry the sentence that would have kept
  the charge honest. **CLASS: a packet transcribing a probe's CASE LIST without transcribing what
  each case was written to prove** — COMMON §10.59's family (a probe cited as an oracle is READ to
  its assertions first), one level up: read it to its COMMENTS too, because a demonstration case
  and a pinning case are indistinguishable from their names.

* **P3 — `:26` requires the SET's test count as "195 + your new cases — measure, do not predict",
  which is correct, and in the same sentence pins the PAIR at "`35/35` or `34/34`", which is a
  prediction of the same quantity.** Both cannot be right about the same edit under COMMON §10.42.
  It happens to resolve (I added two cases, so 35), and the "state which and why" clause makes it
  answerable rather than binding — but a packet should not name the number in one arm and forbid
  naming it in the next.

* **P4 — the packet does not name the ONE gate that legitimately reads non-zero in this lane, and
  a seat could read it as a regression.** `CMD-C6`'s `verdict` is **1** for the entire
  working-tree phase, because its `s02` arm is a `git diff --stat HEAD` over four S02-owned paths
  and this is the S02 lane. §0 records that `CMD-C6`'s S02 arms are *vacuous* here (true after the
  commit) but not that they are *actively red* before it. Cost me one re-derivation; it would cost
  a seat under time pressure a `BLOCKED`.

**Not a defect, recorded because I checked it:** §0's claim that `CookieConsent.tsx` contains the
containment word exactly once at `4ef2f7d3` is correct (`grep -n 'contain'` → one hit, `:197`).

---

## 7. WHAT I DID NOT DO

* **No `t_457c9898` action.** It is still `ready` on a dead premise (recorded by the previous
  round); it is not in my `allowed` list and I did not touch it.
* **No browser.** Every measurement here is jsdom 30.0.1 / React 19.2.8. The `Escape` stack in a
  real browser is V's acceptance step.
* **No reachability change.** No surface in this repository shares a container with another, and
  none nests, so nothing a visitor can reach moves. The correction removes a trap for a shape the
  product cannot currently produce, in the module `A11Y-OVERLAYS` (`t_8962842f`) will implement
  seven overlays from — which is the whole reason it is worth a round.
* **`run_c9`'s two merge arms are `1`/`1` and I did not repair them.** Known-false, ticketed
  (`t_4f97ca86`), diagnosed twice independently; `globals.css` is not in my `allowed` list and
  this commit touches no CSS.
