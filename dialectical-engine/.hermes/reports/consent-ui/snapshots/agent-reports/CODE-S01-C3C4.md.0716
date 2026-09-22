# Self-report — CODE-S01-C3C4 (Claude Opus 5, mission `consent-ui`, coding seat, slice S01 clusters C3 + C4, plus the C2 follow-up commit)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

**Outcome:** three commits on `slice/consent-s01`, in the ordered the packet named —
`b21fe942` (C2 follow-up, N1+N2) · `7131d61d` (C3, the bar) · `9dd8042e` (C4, the card).
CMD-C3 and CMD-C4 both verdict **0** on the worst of three runs, in a `/bin/bash` script and
inline. Root typecheck: 0 diagnostics outside the pin. `apps/ui` typecheck: exit 0, 0
diagnostics. Eight files touched, all inside the packet's `allowed` list, verified with a
pathspec-free `git diff --name-only`.

---

## 1. The headline: three of my own assertions were WRONG, and only mutation found them

Every one of them was green. Every one of them would have shipped.

| # | The assertion | What was wrong | How it was found |
|---|---|---|---|
| 1 | "the Essential switch does not move" | Taken ONCE after three activations. Three flips of a boolean return it to its starting value, so the case passed **9/9** against a switch made fully operable. | mutant P2 |
| 2 | "every `bottom:` in the S01 block is a safe-area form" | Unanchored, so it matched `border-bottom:`. Green for C3, RED for a CORRECT stylesheet the moment C4 added a bordered row. | cluster C4's own CSS |
| 3 | "no category string is inlined in the component" (first draft) | `source.includes("Essential")` is true of `onEssentialOnly` and of the footer's `Essential only`. Red against a correct component. | caught while writing, before it ran |

**This is the entire argument for `heartbeat-worker` §2.** A suite of fifteen green
assertions across two clusters contained two that pinned nothing and one that pinned the
wrong thing. Not one of them was visible from a summary line. The refutation duty is not a
formality appended to the work — on this cluster set it was the only thing that produced a
correct test suite, and it cost about 25 minutes of the ~2h40m run.

**Upgrade, and it is cheap:** the PLAN already carries a `MUTANT to watch the RED against`
line for each of C7's five guards (ARCH-REV-S01 **N7**). It carries one for **none** of
C3's or C4's thirteen steps — and C3/C4 are exactly where a component written compliant
makes every assertion pass on arrival. Extend N7's rule to every step whose acceptance is a
property of code the SAME cluster writes. The architecture seat is the cheapest place to
name the mutant, because it is already deriving the property.

---

## 2. What repeatedly cost tokens, in order of cost

### 2.1 Mutants that never applied — twice, in two different ways (~11 min, and nearly a false finding)

- `perl -0pi -e 's/… \x{2014} …/…/'` on a UTF-8 file is a **silent no-op**: without `-CSD`
  perl matches bytes, so a codepoint escape can never match the three bytes on disk. The
  suite reported `6 passed (6)` and the honest-looking conclusion was *"my copy assertion
  pins nothing"*. `diff` against the pristine copy proved the file was never touched.
- An unanchored `s/  position: relative;\n\}/…/` on a 7,384-line stylesheet patched the
  first match **in the whole file**, ~4,000 lines above my block. The test failed for an
  unrelated reason, which reads as *"the neighbouring mutant WAS caught"* — i.e. as an
  over-broad assertion. Two wrong conclusions from two mis-built mutants.

**Cause:** I hand-rolled mutants in shell one at a time. **Upgrade:** a mutation harness
that (a) asserts its anchor exists and is unique before replacing, (b) prints the
replacement count, (c) scopes to a delimited region, and (d) restores by filesystem copy
with an `md5` check. I built it on the second cluster (`mutate.py` + `mut-c4.sh`) and it
paid for itself immediately — it is 12 lines and belongs in the repo, not in a scratchpad.
**A mutation result is only evidence once the mutation is proved to have landed.**

### 2.2 Shell quoting ate two mutants outright (~4 min)

`mut "P9 … the design's 38px"` inside a heredoc: the apostrophe re-split the arguments and
python received the label as a filename. Two mutants (P9, P10) never ran, and the failure
was a `FileNotFoundError` buried mid-output that is easy to skim past. **Upgrade:** the
harness should take its label as `$1` and never interpolate prose into an argument list; or
simply ban apostrophes in mutant labels. Trivial, and it is the second time in this mission
that a shell-quoting detail cost a seat real time.

### 2.3 Reading: ~25 minutes, and it is not the prose that costs it

The packet, COMMON (128 numbered amendments), INSTRUCTIONS, SPEC v3 (784 lines), PLAN (1,193
lines), DECISIONS (295), BASELINE, TOOLING-TRAPS (1,600), the design extracts, the review's
N1/N2, and four V rows. **Every one of them was load-bearing** — I used something from each,
and cutting any would have cost more than it saved. The cost is not verbosity; it is that
the same fact is stated in four places and I had to reconcile them (§3 below).

---

## 3. Where the packet and the plan were unclear — exactly

### 3.1 `S01-S18`'s acceptance contradicts `S01-S17`'s, and both are frozen-SPEC requirements

`S01-S18` accepts *"the S01 block contains exactly one `bottom:` declaration for
`.consentBar`, it is `calc(22px + var(--safe-b))`"*. `S01-S17` requires the 719.98px media
query to drop the three insets to 12px — which is a second `bottom:` for `.consentBar`.
**Obeying S01-S18 literally means not shipping R10.** I asserted S01-S18's stated PROPERTY
(route-independence) in the form that satisfies both frozen requirements, and reported it.

**Cause, and it is general:** an acceptance clause was written as a COUNT over a file
(`exactly one`) while a neighbouring step adds to the same file. `COMMON.md` §10.28 already
bans a file from stating a count over ITSELF; the sibling rule is missing: **a step's
acceptance never states a count over an artifact a LATER step in the same cluster writes
into.** Count within the step's own scope, or assert the property directly.

### 3.2 `S01-S24` bans "a `keydown` listener of its own"; `S01-S21` requires Space and Enter

The switch cannot answer Space and Enter without an `onKeyDown` prop, and jsdom supplies no
native activation from a key (already in TOOLING-TRAPS). The ban's real target is
`SPEC.md` §Out of scope's *"no second DOCUMENT-LEVEL Esc listener and no second focus trap"*,
which C7's `S01-S45` states mechanically and correctly (`addEventListener("keydown"`,
`"Escape"`, `.focus()`). `S01-S24`'s looser paraphrase of the same ban is the problem.
**Upgrade: when two steps state the same ban, one states it MECHANICALLY and the other
points at it.** A paraphrase of a rule in a second place is a second rule.

### 3.3 The N2 remedy was quoted as a SIGNATURE, and the signature deletes a SPEC pin

The packet gave `decisionFor(c: "accept-all" | "essential-only"): ConsentDecision`.
Implemented literally, `decisionFor("essential-only", { … })` becomes `TS2554` — and that is
the exact call at `tests/render/consent-storage.test.tsx:170`, which pins **R04 row 3**
("`Essential only` produces the identical object from the bar and from the card", where the
card is precisely the entry point that HAS toggles). It also contradicts `consent.ts:149-151`,
a comment the C1C2 review PASSED. I shipped a superset (`toggles?` on that overload),
satisfying the ruling's operative clause — `decisionFor("save-choices")` no longer compiles,
measured — and disclosed it per §10.22.

**Upgrade:** when a packet quotes a signature, it states the PROPERTY the signature exists to
enforce in the same sentence, and the seat is told to satisfy the property. This packet did
carry that clause ("so `decisionFor("save-choices")` no longer compiles") — which is the only
reason the deviation was safe to take. Make it mandatory rather than lucky.

### 3.4 §10.10 cannot discharge a finding whose remedy is a TYPE

The reviewer's probe proves three runtime defects and one type defect. Vitest transpiles
without typechecking, so after a CORRECT fix the probe still fails `P4` — forever. A seat
obeying §10.10 literally either reports the fix incomplete, or (the dangerous branch)
invents a runtime fallback for the omitted argument, and **every candidate fallback silently
records a consent value the visitor never chose**. The ticket body named the right guard
("the apps/ui typecheck arm is the guard"); COMMON's rule and the ticket's sentence are only
reconcilable if you read both and notice the tension. **One line in COMMON fixes it:** a
probe is a RUNTIME oracle; a type-level remedy is discharged by a compiler transcript, and
the packet says which of the two applies per finding.

---

## 4. What I nearly got wrong

1. **Nearly concluded my byte-exact copy assertion was worthless** because a no-op mutant
   ran green (§2.1). One `diff` away from filing a false finding against my own test.
2. **Nearly reported the C2 fix as incomplete** because the reviewer's probe still showed a
   failure (§3.4). The failing case is unreachable by any correct implementation.
3. **Nearly shipped an operable Essential switch's test as "proved"** — the mutant that
   would have shipped it passed 9/9 (§1).
4. **Nearly wrote the containment guard as `includes()`**, which is red against a correct
   component. Caught at writing time, not by a run.

## 5. Dead ends — do not re-derive these

1. **Do not try to make probe case P4 pass.** It cannot pass against a correct
   implementation. Every runtime fallback for an omitted `toggles` invents a consent value.
2. **Do not implement N2's overloads literally** without first reading
   `consent-storage.test.tsx:170`.
3. **Do not put the reduced-motion block in C3 or C4.** The S01 block ships zero `animation:`
   and zero `transition:` declarations, which satisfies `S01-S43`'s first branch outright.
   C7 has nothing to add unless a later cluster introduces motion.
4. **`.modalScrim` cannot be reused** for the card — already settled in DECISIONS with a
   mechanical reason (its `z-index: 70` is declared above the block S01 may append to). I
   re-derived half of it before finding the entry. It is there; read DECISIONS §ARCH.
5. **The `apps/ui` typecheck is not optional decoration.** It found a live `TS7053` in a
   component whose nine render tests were green (`const`-narrowing does not survive into a
   `setState` updater closure). Run it after every cluster, as §10.30 says.

## 6. Toward the one-prompt machine

1. **Ship a mutation harness with the repo.** `scripts/mutate.py` + a `mut()` shell function:
   assert-anchor-unique, print the replacement count, restore by copy, verify by `md5`, print
   `git status --porcelain`. Three of this session's four wasted stretches were mutation-harness
   bugs, not thinking. This is the single highest-leverage artifact I could hand the next seat.
2. **Give every step a named mutant, not just C7's guards.** N7's rule is right and is applied
   to five steps out of forty-seven. Extend it to every step whose acceptance is a property of
   code the same cluster writes — which is most of them.
3. **Ban count-over-a-shared-artifact in step acceptances** (§3.1) and require a step's
   acceptance to be satisfiable simultaneously with every other step in its own cluster. A
   two-minute self-check by the architecture seat: for each cluster, does any pair of
   acceptance clauses contradict? It would have caught S17/S18.
4. **State every ban mechanically in exactly one place** (§3.2); everywhere else, point at it.
5. **Say per finding whether its oracle is runtime or compile-time** (§3.4).
6. **Have the packet pre-extract the copy strings** with the codepoint dump already done.
   Every seat in this mission re-runs the same `python3` dump over the same SPEC table. The
   orchestrator could ship `design/copy.decoded.json` once and every seat's byte-exactness
   becomes a comparison against a shared artifact instead of a per-seat transcription ritual.
7. **A per-cluster "what else reads this file?" list.** I appended to `globals.css` and then
   had to discover, by grep, that five other suites read it, and to measure each of them with
   and without my block to be able to say honestly that their failures predate me. That list
   is static and the architecture seat could compute it once per cluster. It cost me ~8
   minutes; it will cost every future `globals.css` cluster the same.

## 7. Evidence index (for the reviewer)

- Three-run tables, RED frames, the thirteen-mutant C3 matrix and the sixteen-mutant C4 matrix,
  the t9 hit-list delta and both typecheck arms: the `READY FOR PEER REVIEW` comment on
  `t_14e117ec`.
- Scratch (harness + pristine copies + per-command `.sh` files):
  `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/CODE-S01-C3C4-r1/`.
- Eight new entries in `.hermes/TOOLING-TRAPS.md` under this seat's heading.
