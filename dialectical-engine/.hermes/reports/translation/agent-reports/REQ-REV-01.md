# REQ-REV-01 self-report — mission `translation`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

Seat REQ-REV-01, blind reviewer, Opus 5, 2026-09-02, session `a125c37e`. This is the **second**
REQ-REV-01: the first died on an HTTP 429 at ~03:30 having posted a CLAIM and written nothing. I
started from zero. Verdict delivered: REWORK, 4 blocking, 12 non-blocking, 3 new packet defects.

---

## 1. The body on the floor: two 429 deaths in one mission, same window edge

**Cause, and it is not "the API was busy".** Both deaths — REQ-01 at ~00:05 and REQ-REV-01 at ~03:30
— happened at the same account's 5-hour session boundary. The orchestrator dispatched a
~35–90-minute seat into a window it could not know the remaining size of. **Price: 40 minutes and
~120k tokens for REQ-01's re-read, and for me roughly 4 hours of wall-clock (03:30 → 07:33) in which
the mission had zero seats alive and V had nothing to test.** The wall-clock is the expensive half
and nobody paid tokens for it.

**Upgrade, cheap and mechanical: the orchestrator probes the window before dispatching, not after.**
A one-token request that returns a 429 with `resets 7:30am` costs nothing and converts "dispatch and
hope" into "dispatch or wait". Better: **stagger the fleet against the window rather than the work.**
Both deaths were seats launched back-to-back into the tail of a window; a 20-minute seat would have
survived where a 90-minute one did not.

**The deeper upgrade, and the one that generalises: a dying seat should leave a warm start.** REQ-01
diagnosed this for itself (its §1) and its fix — *write your measurement to disk before you write
prose* — is right and incomplete. It does not cover a **reviewer**, whose output is judgement, not
measurement. My equivalent, and I offer it as the reviewer's version of that law: **a reviewer writes
its probe scripts and their raw output to a durable path as it goes, and its verdict last.** When I
died the first time nothing survived because a reviewer's scratch dies with its session. Had my
predecessor's scratch been durable, I would have inherited the ICU probe and the citation resolver
and started the review two probes ahead. **Concrete packet change: give every review seat one
durable `reviews/<SEAT>-probes/` path in its `allowed` list, and require the probe scripts to land
there.** Cost: nothing. It also makes `probe, never read` auditable, which today it is not — a
reviewer can *claim* it built its own fixture and no one can check.

---

## 2. What cost the most tokens, in order, with prices

**2.1 — Reading whole artifacts to answer questions a script answers better. ~25 minutes, ~55k
tokens.** `translation.md` is 334 lines and 52 KB; I read it in full, then wrote scripts that
answered the trace question, the citation question, the partition question and the banned-word
question far more reliably than my reading did. **My four highest-value findings all came from
scripts; my reading produced two.** The reading was not waste — B3's contradiction between
`I07/SPEC.md:28` and `I11/SPEC.md:19` is only visible to a reader — but the ratio says where the
effort belongs.

**Upgrade: the reviewer packet should mandate the mechanical sweep FIRST and the reading second.**
Mine listed thirteen probes without an order, so I read the artifact before I had any machine-checked
ground truth and spent that reading building context a script would have handed me in ten seconds.
Reversing it means every subsequent line I read is read against known numbers.

**2.2 — The `--json` shape of the board. ~4 minutes, two retries.** `hermes kanban … show <t> --json`
puts `.comments[]` at the top level and everything else under `.task`; TOOLING-TRAPS records it and
I still burned a call confirming it. Not a new trap — evidence that a 949-line trap file is not read
at the moment of danger. **REQ-01's §6.3 proposal (split into a ~25-class index plus a case file) is
correct and I am seconding it with independent evidence: I had read the file's relevant entry and
still did not have it in hand when it mattered.** An index you can re-read in 30 seconds is used; a
949-line file is read once, at the start, and then not consulted.

**2.3 — One dead end I paid for and nobody should pay again: counting "logical CSS properties" with
a `-(inline|block)-(start|end)` regex returns 0 on this stylesheet, and 0 is wrong.** The eight
logical properties in `globals.css` are `padding-inline` × 7 and `padding-block` × 1 — the
**shorthand** forms, which carry no `-start`/`-end` segment. I briefly believed I had refuted the
author's "8 logical properties" claim. I had refuted my own regex. **Price: ~5 minutes and one nearly
false finding.** Recorded in §4.

**2.4 — What was almost free, and should be doctrine.** Three things cost me almost nothing and
produced the review's best evidence:
- **Verifying ALL 76 citations instead of the 12 the packet asked me to sample.** The seeded draw of
  12 would have cost the same script and told me a twelfth as much. **When a packet asks for a sample
  and the population is machine-enumerable, take the population.** A sample is a concession to human
  effort and a script does not need it.
- **Stating my own census rule in writing before reading the author's.** That is the only reason my
  two disagreements are findings rather than opinions: I can show the rule that produced them was not
  reverse-engineered from theirs.
- **Joining `census.json` to the SPEC owned-files tables.** B1 — the mission's most expensive finding
  — is invisible in either file alone and obvious in the join. **Whenever an artifact makes a claim
  about a partition, the review is a join, not a read.**

---

## 3. What I nearly got wrong

**3.1 — I nearly passed the 56/56 coverage claim.** It is stated three times (board comment,
`translation.md:311`, self-report receipts) and it names its method (`comm` of cited vs defined
R-ids). A named method reads as evidence. I re-ran it only because `heartbeat-reviewer` §2 says to,
and the answer is 54/56 — because a body-wide `R\d\d` extractor matches `R10` inside `I01-R10`.
**The lesson is not "check the numbers". It is that a claim which names its method is more
dangerous than one that does not, because the method is the thing that gets nodded at.** I predicted
in the verdict that another lens will repeat this receipt rather than re-run it.

**3.2 — I nearly filed the "8 logical properties" refutation.** §2.3. I had the wrong regex and the
right confidence. What saved me was widening the probe before writing the finding, out of habit, not
suspicion. **Habit is not a control.** The control that would work: a reviewer's negative finding
about a COUNT must be produced by two differently-shaped probes before it is written down. Positive
confirmations need one; refutations need two, because a refutation's failure mode is silent.

**3.3 — I nearly filed `handle` in `glossary.md:49` as a banned-word violation.** `COMMON.md` §4
scopes the ban to "any acceptance criterion or requirement" and a glossary definition is neither. I
filed it as N11 with the scope stated, not as a violation. **A reviewer manufacturing a finding to
look thorough costs the author a round and the fleet its trust in findings.**

**3.4 — I nearly treated B4 as non-blocking.** "The census counts 15 strings it should not" sounds
cosmetic. It is blocking because `R23` is absolute — *every* string counted must move to a catalog —
so the census is not a measurement any more, it is an order. **A measurement that a requirement
quantifies over stops being a measurement.** That is the sharpest general lesson I have from this
review, and it applies to `census.md`'s every number.

---

## 4. Dead ends — do not re-derive these

- **`(margin|padding|border|inset)-(inline|block)-(start|end)` finds no logical properties in
  `apps/ui/app/globals.css`.** The eight that exist are shorthands: `padding-inline` × 7,
  `padding-block` × 1. Any RTL audit must match the shorthand forms too.
- **`grep -rn '<ModeToggle' apps/ui --include=*.tsx` fails under zsh** with `no matches found`: zsh
  globs the `--include` value before `grep` sees it. Pass directories instead
  (`grep -rn '<ModeToggle' apps/ui/app apps/ui/components`) or quote the pattern. Appended to
  TOOLING-TRAPS.
- **`cat -n` on a 52 KB file is persisted to a tool-results file with a 2 KB preview**, which is
  useless for reading prose. Use `Read` for the artifact and `sed -n 'a,bp'` for slices of it.
- **Counting mission-requirement citations with `/R\d\d/` over a slice SPEC body is wrong** — it
  matches the slice-local ids (`I01-R10`). Anchor to the trace column:
  `^\|\s*`ID`\s*\|.*\|([^|]*)\|\s*$`. This is the bug behind the author's 56/56.
- **`census.json`'s `plural_sites`, `format_sites` and `jsx_markup_split_sites` are top-level arrays
  beside `rows`**, not categories inside `rows`. The join that produces B1 needs them.

---

## 5. Where THIS packet was unclear, exactly

1. **P5 asks for "12 `path:line` citations chosen by a seeded random draw".** The population is 76
   and a script checks all 76 for the same cost. A packet that prescribes a *sample size* to a seat
   that can enumerate the population is prescribing a weaker review than it could get. **Fix: "verify
   every citation the artifact makes; state the extraction rule and the total."** Same for P6's "6
   files by seeded random draw" — there the sample is justified, because the check is a hand-read,
   and the packet should say *why* the two differ. It does not, so I had to decide.
2. **P1 asks whether "V, with no context, can run it in a browser and observe the stated result" for
   five slices in full plus six by draw — 11 acceptance walks — and gives no criterion for a
   FAILING step.** Every step I read is observable; the honest answer is "none fail", but I cannot
   distinguish "this bar is met" from "this bar is too loose to fail". **Fix: give the stranger test
   a negative example — one step shape that MUST be called a failure — so the reviewer's pass means
   something.**
3. **P3 says "per requirement ≥1 row" and P8 says the PLAN is a scaffold with empty step cells.**
   These are the same table read two ways and it took me a minute to see that P3 means the trace row
   must exist, not that a step must. **Fix: "one PLAN trace row per SPEC requirement, its step and
   cluster cells EMPTY."**
4. **The `allowed` list gives me `reviews/REQ-REV-01.md` and a scratch directory and nothing durable
   for probe scripts.** §1. My probes are the evidence for six of my sixteen findings and they die
   with this session. **Fix: `reviews/REQ-REV-01-probes/` in the allowed list.**
5. **P11 asks me to judge the author's brainstorming substance-compliance, which is a protocol
   question, not a review question.** I answered it, but a reviewer ruling on whether a mandatory
   skill's letter may be waived is a reviewer making law. **Fix: the orchestrator or V settles this
   once, in the spine, and the packet cites the ruling instead of asking each reviewer to re-derive
   it.** It recurs for every requirements and architecture seat, exactly as REQ-01 said.
6. **Nothing in the packet says what to do when the artifact under review is FROZEN and my finding
   requires changing it.** Four of my blockers require editing frozen SPECs. `COMMON.md` §4 says
   SPEC.md is frozen at creation; `heartbeat-reviewer` §4 says a REWORK names the exact change. I
   resolved it by naming the change and calling it a superseding version, because these SPECs have
   not been consumed by ARCH yet. **Fix: state the rule — "a REWORK before the first downstream seat
   consumes a SPEC supersedes it in place; after that it is a new version ratified by V."**

---

## 6. Toward the one-prompt machine — five upgrades, ranked by what they save

**6.1 — Make the review's mechanical layer a shipped tool, not a per-seat rediscovery.** I wrote four
scripts this session — trace/coverage checker, citation resolver, partition joiner, banned-word
scanner — and every future requirements review in this harness needs all four. They are **generic
over the heartbeat document format**, not over this mission. Right now they die in scratch and
REQ-REV-02 writes them again, differently, and gets a different answer. **This is the same finding
REQ-01 made about its census classifier (its §6.1), one loop later, and that is the point: the
harness throws away its measuring instruments twice per mission.** Ship `tools/heartbeat-lint/` with
four checks and have every review seat run it before reading anything. **Saving: ~25 minutes and
~40k tokens per review seat, and — more valuable — it makes the numbers comparable across seats.**

**6.2 — A claim stated more than once must be stated once and referenced.** The 56/56 coverage number
appears in three places. When it turned out to be wrong, it was wrong in three places, and a
reviewer who checks one and moves on has "verified" it. Every duplicated number in this mission
(1371, 90 lines, 79 declarations, 28/28) is a place where a correction can be applied incompletely.
**Rule: the handoff table cites `translation.md:<line>`; the self-report cites the handoff. One
source, N pointers.**

**6.3 — Require the verifier to be verified against a known-bad input.** REQ-01's coverage script
reported 100% and was never run against a document with a deliberately-orphaned requirement. It
would have failed instantly. This is `superpowers:test-driven-development`'s RED-first applied to
measurement scripts, and no role contract currently asks for it. **Add to `heartbeat-protocol` §2.5:
"a script that reports a property is run once against an input that must violate it, and the
violation is shown."** Cost: one minute per script. It would have prevented B2 and, by REQ-01's own
account (its §3.1), three of its four census iterations.

**6.4 — Order the reviewer's probes: sweep, join, then read.** §2.1. My packet listed P1–P13 as a set.
The right order is (a) run every mechanical check and record the numbers, (b) join the artifacts that
claim a partition, (c) read the prose against those numbers. I did it roughly in that order by
instinct; a packet should not rely on instinct.

**6.5 — Dispatch against the rate-limit window, and give reviewers durable probe paths.** §1. Two
seats died the same death four hours apart in one mission. Neither death produced a lesson on the
record until now, because a dead seat writes nothing — which is exactly why the durable-probe-path
fix is worth more than its cost.

---

## 7. Receipts

| Claim in my verdict | How it was established |
|---|---|
| 17/17 language rows match ICU | `node -e` over `Intl.PluralRules` (cardinal + ordinal), `Intl.Locale().maximize()`, `.textInfo.direction`, `Intl.NumberFormat().resolvedOptions()`, Node v22.23.1 |
| 76 citations, 0 fabricated | `p5.mjs`: regex over 3 requirement files + 84 slice files, resolved against 5 candidate roots, printed the real source line for each |
| Coverage is 54/56, not 56/56 | `p3.mjs`: trace-column-anchored extractor; confirmed by `grep -rnoE '\bR1[02]\b' slices/` showing every hit is a slice-local id |
| Trace equality 28/28, claim line matches parse | `p3.mjs`, same run |
| Partition: 0 dup, 0 unowned, 0 missing, sums 1371 | `p6part.mjs`: `census.json` joined to the 11 SPEC owned-files tables, with glob and brace-expansion resolution |
| I11 writes 16 files owned by 7 concurrent slices | `census.json`'s `plural_sites` + `format_sites` joined to the file→slice map |
| 15 machine-code invariant rows; 2 CSS-value rows | regex sweep of all 1371 rows: `^[A-Z][A-Z0-9_]{5,}:\s` and a CSS-keyword set |
| 8 test assertions depend on those messages | `grep -rn 'V3_HAS_NO_\|ASK_FIELD_REQUIRED\|PROXY_FETCH_' tests apps/ui` |
| 9 test files shared by concurrent slices | `p7b.mjs`: 1113 distinct census texts (len ≥ 14) × 221 test files → owning-slice sets |
| 79 physical CSS direction declarations | my own rule, written before reading `census.md`; per-property histogram matches the author's table row for row |
| The true 18 zero-string files | 91 scanned minus 73 in `census.json`; `census.md` lists 11, one of which is not a `.ts`/`.tsx` |
| 10 test files read `apps/ui` source | `grep -rlE 'readFileSync\|readdirSync'` ∩ `apps/ui` path strings — reproduces the author's receipt exactly |
| 28/28 freeze and format law | script checking FROZEN header, SCAFFOLD marker, pre-filled cells, cluster count, PROGRESS emptiness, DECISIONS seeding |
| Author wrote nothing out of contract | `git status --porcelain` + `git diff --numstat` on `.hermes/TOOLING-TRAPS.md` (+87 / −0) |

**What I did not do:** no test run, no build, no dev server, no network. I sampled 6 of 73 files for
the hand-count and swept the two rule gaps it exposed across all 1371 rows, but a third rule gap in
the 67 files I did not read by hand would not have been found. I did not read
`docs/missions/ui-overhaul/design/`, so R44–R46's design fit is unreviewed. I made no judgement on
the per-language register decisions, which are not mechanically checkable.
