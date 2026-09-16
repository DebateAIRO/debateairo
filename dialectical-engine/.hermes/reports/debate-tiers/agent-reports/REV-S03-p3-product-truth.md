# Self-report — REV-S03-p3-product-truth (REV(S03) lens product-truth, pass 3 of 3)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat REV-S03-p3-product-truth · ticket `t_08142adf` · head `3f488b3f` · wall clock ~15 min
(12:46:18 → ~13:01 EEST) · verdict PASS. Case file, not a diary.

---

## 1. The body: B1 took three passes and two FIX nodes. The cause is one sentence.

**Not one test in slice S03 took its input from a producer.** Every suite on both sides of the
row↔reader seam built its own row from a literal: the projection test hand-wrote a register row
(`tests/unit/api.test.ts:286-292` at the pass-2 head), the route test stubbed the projection away
entirely, the render suite mocked the client. Three green layers, no seam between them. The defect
lived in the one place no layer looked: the shape the *real publisher* emits.

That is not a testing-discipline failure by any one seat — every one of those tests is individually
well-formed. It is a **missing law**. The fix that finally landed (F1) is four lines of reader-side
projection; the detector that makes it stick is the one line
`import { buildDevelopmentDeploymentRegisterRows }` at `tests/unit/api.test.ts:19`.

**UPGRADE #1 — the producer law, enforced mechanically.** Add to `heartbeat-worker` and to every
ARCH cluster's verification list: *any test that asserts a value crossing a process or storage
boundary must obtain that value by CALLING the code that produces it, never by writing it down.* And
make it checkable, because a law nobody can grep is a law nobody keeps: an architecture test that
fails when a test file constructs a register-row-shaped object literal (`{ kind: "…", … }`) instead
of importing a `build*Rows` function. The repo already has this exact muscle — the
`rosterSelectingFiles()` pin in `tests/architecture/tiers-s02-rosters.test.ts:277-284` — so the
pattern is proven here, not imported.

**Price of not having it:** two REV passes (three blind lenses each) + two FIX nodes + two review
packages + two unions. The FIX that mattered ran 2003 s and touched 2 files. Everything else around
it was the cost of discovering that four lines were wrong.

## 2. What repeatedly cost tokens — three named leaks, with remedies

**Leak A — carried probes that cannot be green, re-litigated every pass.** The pass-2 probe set was
promoted with two cases that were RED *by construction*: case C mocked `readPlanTiers` to REJECT and
then asserted the ids appear (`REV-S03-p2-product-truth-newpage.test.tsx:127`), and case 3b asserted
a writer-side remedy that the FIX deliberately did not make. Those two RED lines then had to be
explained by the FIX seat (its handoff §"REVIEWER DETECTOR"), re-explained by the orchestrator
(`README.md:21`, `probes-p2-carried.md:14`), and re-derived by me. **One defect, four seats, three
documents.** The orchestrator priced its own README defect in the LEDGER — correctly — but the
deeper cause is that a promoted probe has no declared *polarity*.
**UPGRADE #2:** every promoted probe case carries a one-word header — `INVARIANT` (must be green at
every lawful head), `DETECTOR` (green only once the named defect is fixed), or `WITNESS` (records the
current state, asserts nothing about direction). Then a carried DETECTOR flipping to green *is* the
signal, a carried INVARIANT going red is an alarm, and a WITNESS is never re-litigated. My pass-3
probes are labelled this way in prose (`case 7 … recorded, not predicted`; case B relabelled *fault
injection, not the current state*); it should be a field, not prose.

**Leak B — the same twelve facts re-measured by every lens, every pass.** Three blind lenses × three
passes each independently ran C4, the §5 seventeen-file set, and the ancestry/freeze checks. Blindness
requires independent *judgment*, not independent *arithmetic*. The package already re-measures
everything at assembly (`reverify-3f488b3f.txt`, with full argv — my pass-2 N3's remedy, which
worked). I re-ran C4 and §5 anyway and got byte-identical numbers, as did (I predict) both siblings.
**UPGRADE #3:** split the reviewer's verification duty explicitly — *confirm* the package's shared
frames by spot-check (one run, not three), and spend the saved budget on the lens-specific probe.
The value in this fleet has never come from a fourth identical vitest run; it came from the one
fixture nobody else wrote.

**Leak C — the record tree vs the product tree, re-ruled privately by each lens.** My pass-2 N1: the
packet forbade opening `.worktrees/all` and then named twelve absolute-path inputs inside it. Each
lens resolved it privately, which is the most expensive possible outcome — silent divergence. It was
**remedied** for pass 3 (dispatch + `README.md:24` both state the distinction), and the remedy cost
one clause. That is the template: **a rule each seat must interpret is a rule the packet must
spell out.**

## 3. What I nearly got wrong (two things, both serious)

**I nearly re-raised B1 as unfixed.** The carried pass-2 probes come back RED at this head —
`Tests 2 failed | 8 passed (10)` — and a lens that trusts its own prior artifact reads that as "the
promise still fails, third pass running". The only thing that stopped it was reading *which* two
cases failed and *why*, then re-deriving them. **The general lesson: a reviewer's own prior probe is
the input it is least sceptical of, and therefore the most dangerous.** My own pass-2 predictions
warned the other lenses about trusting tests that look like proofs; I nearly failed the same way
against my own.

**I nearly ruled N1 blocking.** "The card shows one roster and the run uses another" has exactly the
shape of a blocking product-truth defect, and at pass 3 a REWORK is a V row — so the temptation to
escalate is structural. What stopped it: the packet's own bar (*blocking only if S03's own promise is
unmet at 3f488b3f*), and the D1 control showing the two sources **agree** at the committed file, with
an architecture test pinning that equality. The divergence needs an operator editing a file. Blocking
it would have cost V a rework round for a one-sentence SPEC gap. **Writing the control case before
the finding is what made the tiering honest** — I built D1 (they agree) before D3 (nothing
regenerates), and D1 is what demoted the finding.

## 4. Dead ends, so nobody re-derives them

- **`grep -rn … --include=*.ts` fails under zsh** here (`no matches found`) — the glob is expanded by
  the shell before grep sees it. Use `grep -rn "…" apps packages --include "*.ts"` (quoted) or
  `grep -rn … | grep '\.ts:'`. Cost me one round-trip; it will cost every seat one.
- **`s03-product-files.txt` as a pathspec argument** produced an empty diff — the same
  git-root-relative vs cwd-relative trap the packet warns about for the freeze pair. The packet's
  warning is correct and well-placed; it just does not cover the *file list* in the package, which
  has the same shape. Read the patch file instead; it is authoritative and short.
- **Running fastify `inject` inside a `@vitest-environment jsdom` file works** — I expected it to
  need a two-file split with a JSON hand-off between them and was wrong. That is what made the
  page↔route join possible in a single fixture, and it is the single most valuable technique from
  this pass. Anyone joining a route to a render should not re-discover it.

## 5. Where THIS packet was unclear — exactly two places

1. **Charge 2 asks two different questions in one breath.** *"Re-run your P1 and P2 at 3f488b3f as
   promoted, then READ … your case C … cannot be GREEN at any head — re-derive it against the
   resolved read"*. "Re-derive against the resolved read" reads as *mock a resolved value*, which is
   pass-2's case A — a control that says nothing about whether the route works. The re-derivation
   that actually answers the charge is the **join**: drive the page with the bytes the real route
   returns. I did the latter, and I think it was intended, but the packet's wording permits the weak
   reading, and the weak reading looks green and proves nothing. **A packet that names a remedy
   should name the property, not the mechanism.**
2. **"a REWORK at pass 3 is a V row" is stated three times; the blocking bar is stated once**
   (charge 6, final clause). The asymmetry pushes toward escalation. Put the bar first and once:
   *blocking iff the slice's own promise is unmet at the reviewed head* — then say what a REWORK
   costs.

Everything else in this packet was checkable and checked out: every commit, every ancestry claim, the
freeze pair, the V-row range, the `:127` line reference, the mount label. **Notably the packet
corrected two of my three pass-2 findings before I arrived** (N1 and N3), which is the first time
in this mission I have had nothing to re-raise against the packet. That is the process working.

## 6. Toward the one-prompt machine — the three changes with the best ratio

1. **The producer law (§1), enforced by an architecture test.** This mission's single most expensive
   defect class — pass-1 B1 and pass-2 B1 are the *same* defect at two altitudes — dies to one
   grep-able rule. Highest value by a wide margin.
2. **Probe polarity as a field (§2, Leak B).** Turns the promoted-probe archive from a liability that
   must be re-explained each pass into a monotone signal. Cheap: one header line per case.
3. **A standing "seam inventory" per slice, written at ARCH time, reviewed at REV.** Every place a
   value crosses a process, a schema or a storage boundary, with the producer and the consumer named.
   S03 had exactly two seams that mattered (row→reader, file→generated-constant); **both produced a
   finding, and neither was listed anywhere.** My N1 is the second one, found on the last lawful pass
   by accident — I went looking for the run's roster only because I asked *"is what V sees the same
   as what V gets?"*, which no charge asked me to ask. A seam inventory would have surfaced both at
   planning time, for the price of a table.

One thing to **keep**: the blind-lens predictions. Writing my pass-2 predictions forced me to name
what a correctness lens would miss and why, and the same discipline this pass is what made me check
whether admission and display share a source. **The prediction paragraph is not ceremony — it is the
cheapest defect-finding instrument in this protocol**, because it makes a seat argue against its own
verdict while it still has the evidence loaded.
