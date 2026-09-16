READY FOR HERMES STAGE REVIEW · comments read through: v-rulings-2026-09-03

# Self-report — cont-t13-w2-diversity-mark · BUILD(CONT-T13) · W2 / F-VS11-1

seat: cont-t13-w2-diversity-mark · model: claude-opus-5 (1M) · pass 1 of 3 · rework round 0
base: `35615ee0` · code commit: `e4bd9821eabd42c39c8ca930c58a558c1d924be8`
branch: `mission/2026-09-16-algorithm-live-loop-continuation`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.

---

## 0. The victim, stated once

A deployment that seals ONE provider identity into both synthesis seats produced a correct debate and
told the reader nothing. The mark that would have told them — `DEGRADED-DIVERSITY` — was declared in
the kernel vocabulary and rendered by the UI as "Model diversity degraded", and **no line of code
anywhere pushed it**. The only trace was a `console.warn` an operator sees once, at register seeding.

The work itself was about ninety minutes and forty lines. **The interesting question is not how it was
fixed; it is how it survived a whole mission of gates.** That is section 1.

---

## 1. CAUSE — how a mark with a label and no producer passed every instrument we own

Not one of our gates can see this class of defect, and each of them looks like it should:

| instrument | why it was satisfied |
|---|---|
| `pnpm run typecheck` | the `case "DEGRADED-DIVERSITY":` arm in `apps/ui/lib/v3/labels.ts` is perfectly well typed. A `switch` arm that is never reached is not a type error in any language we use. |
| the unit suites | a test asserts on the marks an answer HAS. No fixture could carry this one, because nothing minted it. Absence of a producer produces absence of coverage, silently. |
| `tests/unit/s14-live-projections.test.ts` | it pins `CONDITION_MARKS` at **37 members**. A member with no producer satisfies a count pin *perfectly* — that is the whole point of a count pin, and it is why a count pin is not a coverage claim. |
| the UI render tests | they render the marks a fixture supplies. Same blindness, one layer up. |
| grep-based review | every search for the literal returns three kinds of hit — the declaration, the label, and test assertions. **A producer and a mention are indistinguishable in `grep` output.** |

**The cause is that we have no PRODUCER SWEEP.** Everything we run asks "is this datum handled
correctly?" Nothing asks "does this datum ever come into existence?" The finding that caught it
(F-VS11-1) was not found by a gate at all: Fable found it by hand, following V's instruction to check
the other sites of the non-self-grading rule.

**UPGRADE (highest value item in this report).** One test, ~30 lines, that for each member of
`CONDITION_MARKS` asserts a PUSH site exists — `grep -rn` for the member and require at least one hit
that is neither the declaration, nor a label `case`, nor a file under `tests/`. Members that are
legitimately read-only (a historical mark preserved for old answers) go in a named allow-list with the
ruling that retired them. This is the class fix for F-VS11-1, and the class certainly has other
members: nobody has ever checked the other 36.

---

## 2. What repeatedly cost tokens — one dominant item, and it is READ COST

**The read-surface greps cost more than the change.** The packet named five read-surface probes. Four
were useful. Their combined output, plus the four file regions they pointed into, was roughly 25× the
size of the diff I finally wrote (48 added lines of product code, of which 34 are comment).

The expensive part was not reading too much; it was that **I could not tell which of two sites was
"the ONE site" until I had read both.** The packet said "expected in `packages/serve/src/index.ts` or
the runner's synthesis call path; say which and why". Answering that required reading:
`apps/runner/src/index.ts` around `resolveSynthesisRoleMaker` (3780-3860) and its mark assembly
(3540-4350), plus `packages/serve/src/index.ts` (595-1110, 1480-1600). About 400 lines to make one
binary choice.

**The choice is derivable in ONE grep that nobody ran:**

```
grep -rn 'synthesisRoleControls\|synthesizerRoleRef' packages/serve/src packages/register/src apps/runner/src
```

`packages/serve/src/index.ts:153` declares `readonly synthesisRoleControls: SynthesisLoopControls` on
`ServeGateInput`, and `:889` hands it to the loop. That single pair of lines proves the chain both
RESOLVES the identities and OWNS the marks — the two properties the ticket requires of the site. The
runner cannot be the site, because by the time the runner appends its own records the chain has
already returned the answer's marks.

**UPGRADE.** A packet that offers a seat a CHOICE of sites should name the DISCRIMINATOR, not the
candidates: "the site is whichever of these both receives `synthesisRoleControls` and writes
`conditionMarks` — one grep decides it." Same information, one command instead of four hundred lines.
Generalised: **when a packet is uncertain, it should hand over the test that resolves the uncertainty,
never the list of possibilities.** Possibilities are read in full; a test is run once.

---

## 3. What I NEARLY got wrong — three, and the first two were close

**(a) I nearly widened `ConditionMarkRecord` and broke the contract.** The packet says the mark must
carry `{ roles, identity }` "matching the record shape the other marks carry — measure it". The
obvious reading is `ConditionMarkRecord` — the typed persistence record at
`packages/serve/src/index.ts:1576` (line numbers in this report are AT `e4bd9821`). That reading is a trap: its `mark` field is a CLOSED union of 17
members that does not contain `DEGRADED-DIVERSITY`, and widening it drags in
`ConditionMarkRecordSchema` in `packages/contract` (outside my contract), the persist path, and a
migration. It would also have been WRONG on the merits: no `ConditionMarkRecord` has a `roles` or an
`identity` field, so the shape the packet describes is not that shape.

What the measurement actually says: inside `ServeGateResult`, a mark's detail rides on a TYPED SIBLING
FIELD — `standingObjection` for the objection mark, `bandCeiling` for the band marks, `crashClass` for
the crash marks. That is the house idiom, and `degradedDiversity` is its next member. Two readings of
one packet sentence, one of them a three-package change. **Price of the check: ~10 minutes. Price of
the wrong branch: most of a pass.**

**(b) I nearly made the new field REQUIRED.** `ServeGateResult` is constructed as a full literal in
two files outside my contract (`tests/support/settledRun.ts:83`,
`tests/integration/serve-answer-content-encryption.test.ts:162`), both describing pre-T9 answers. A
required field makes both a TS2739 — and **no vitest run reports it**, because vitest transpiles
without typechecking (traps `:4934`). My cluster and neighbour gates would all have been green and
`pnpm run typecheck` at the very end would have handed me a failure in two files I am not allowed to
edit. The second file's own comment records the identical collision when T9 added four fields, which
is how I found it before writing rather than after. **Reading a fixture's comments is cheap
archaeology and it paid here.**

**(c) I nearly took a MISSING-SYMBOL red as my RED.** The natural test imports
`DEGRADED_DIVERSITY_MARK` from `@debateai/serve`. At base that export does not exist, and per trap
`:1807` the import does not error — it binds `undefined`, and the assertion becomes
`toContain(undefined)`. That is a missing-symbol red (`:2076`, `:5161`), not the defect's red. I
asserted on the literal `"DEGRADED-DIVERSITY"` instead, and got the frame that actually indicts the
product: `AssertionError: expected [] to include 'DEGRADED-DIVERSITY'`. **The previous seat filed that
trap yesterday and it saved me a bad RED today — the traps file is working.**

---

## 4. DEAD ENDS — do not re-derive these

1. **`ConditionMarkRecord` is not the carrier for this mark.** Its `mark` union excludes it, and
   `REQUIRED_CONDITION_MARK_RECORDS` (`:1636`) does not list it, so `assertRequiredConditionMarkRecords`
   demands no record for it. The orphan check runs the other way (a record without a mark throws); a
   mark without a record is lawful by design. **No contract change, no migration, no runner change.**
2. **The runner needs no edit at all.** It persists `JSON.stringify(input.result.conditionMarks)`
   verbatim, and the read path parses each mark with `ConditionMarkSchema`, which already accepts this
   member. The mark reaches the database and the UI with a one-file change. I checked this before
   writing anything, and it is the reason the diff is 48 lines instead of 300.
3. **`packages/serve/src/synthesis.ts` is NOT the site**, even though the sibling marks
   (`SYNTHESIS-OBJECTION-STANDING`, `DIGEST-COMPRESSED`) are declared there. The synthesis module sees
   `SynthesisLoopControls`, but it does not assemble the served answer's `conditionMarks` — the chain
   in `index.ts` does, at `:1131`. Declaring beside the siblings would have split the rule from its
   only consumer.
4. **`grep -rln 'DEGRADED-DIVERSITY' tests apps/ui` finds no test.** The packet's UI gate reduces to a
   no-op. The owed outcome is reached by grepping for importers of `v3/labels` instead. Filed as a
   trap.

---

## 5. Where the packet was unclear or wrong — four, all cheap to fix

| # | packet text | reality | cost |
|---|---|---|---|
| P1 | read-surface: `grep -n 'SYNTHESIS-OBJECTION-STANDING\|condition_marks\|conditionMarks' packages/serve/src/index.ts` | that mark is **not in that file** — it is declared at `packages/serve/src/synthesis.ts:127`. The other two alternatives match, so the OR exits 0 and the miss is silent. | small, but it is how a packet defect hides |
| P2 | "match the record shape the other marks carry — measure it" | two defensible readings, one of them a three-package change (see 3a). The packet should say WHICH artifact's shape: `ServeGateResult`'s sibling fields, or `ConditionMarkRecord`. | the largest single risk in this ticket |
| P3 | "the UI test that renders marks (`grep -rln …`) — run it if it is a test" | resolves to `apps/ui/lib/v3/labels.ts`, product code. Literally, the step names nothing. | see trap; I reached the outcome another way |
| P4 | "expected in `packages/serve/src/index.ts` or the runner's synthesis call path" | correct but expensive — the discriminator is one grep (see section 2). | ~400 lines of reading |

**None of these stopped the work, and I report all four rather than absorbing any.** P1 and P3 are
packet defects in the strict sense: a command that does not do what the packet says it does.

---

## 6. Toward the one-prompt machine — the three changes I would actually make

**(1) Ship a producer sweep and run it on every vocabulary.** Section 1. This is not a process change,
it is one test file, and it converts "a seat happened to notice" into "the suite always notices". The
same shape generalises to every reader-facing enum we render: error codes, gate traces, root rules,
badges. **If one thing from this report is done, this is it.**

**(2) A packet should carry DISCRIMINATORS, not CANDIDATES.** Section 2 and P2/P4. Every place a
packet says "expected in A or B", or "match the shape — measure it", it is handing the seat an
ambiguity to resolve by reading. Each such phrase has a one-command resolution that the packet author
already knows or can find in the time it takes to write the ambiguous sentence. The rule that makes
this mechanical: **if a packet sentence contains "or", "expected", or "measure it", it must be
followed by the command whose output decides.** This is the single highest-leverage change to packet
authoring in this mission, and it is worth more than any amount of extra prose.

**(3) State the WRITE-SURFACE CONSEQUENCE of a type change in the packet.** A packet that says "add
the emitter" does not say "and note that widening a shared result interface is a change to fixtures in
other packages that only `typecheck` will report". That fact is knowable at packet-authoring time from
one grep for the interface name. Three seats in this continuation have now hit a version of "vitest
never typechecks". **It should be a standing line in every packet whose contract touches an exported
type, not a trap each seat rediscovers.**

### On efficiency, honestly

The RED-first discipline cost one extra suite run (~2s) and bought the only proof that the assertion
indicts the product. The refutation duty cost four more runs (~10s) and killed three mutants, one of
which — the hardcoded identity — is a mistake I consider genuinely likely from a model writing this
emitter quickly, because `controls.synthesizerRoleRef` and the literal string are visually identical at
the call site. **The process overhead here was about fifteen seconds of machine time. It is not what
makes this slow. Reading to resolve ambiguity is what makes this slow**, and that is fixed in the
packet, not in the seat.

---

## 7. Deliberate boundaries and known gaps (not defects, but named)

- **The mark is emitted on the SERVED path only.** `componentsOnly` and `createEnvelopeExhaustedResult`
  set `degradedDiversity: null` explicitly. This follows the existing rule for that terminal — a crash
  answer's marks are the fact bundle's plus the crash class's, and the chain's own marks do not survive
  there either (a compressed digest loses `DIGEST-COMPRESSED` on that path today). If a reviewer holds
  that a COMPONENTS_ONLY answer also owes this disclosure, that is a change to how crash answers carry
  chain marks in general — a ticket, not a line.
- **The idempotence guard is not pinned.** `!conditionMarks.includes(DEGRADED_DIVERSITY_MARK)` mirrors
  every other push site in the file; removing it is my neighbouring mutant and the suite correctly does
  NOT catch it, because no fixture supplies an answer whose fact bundle already carries the mark. Named
  rather than padded with a row that would pin the guard and nothing else.
- **The T15 half of F-VS11-1's recommendation is untouched.** The finding also recommends emitting the
  mark "once T15's harness lands, whenever a grader shares an identity with its candidate". That
  harness is not in scope here and `deriveDegradedDiversity` is exported so a second caller can reuse
  the rule rather than restate it.
