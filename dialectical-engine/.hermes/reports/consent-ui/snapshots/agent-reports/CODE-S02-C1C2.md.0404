# CODE-S02-C1C2 — self-report (murder-case form)

**Seat:** CODE-S02-C1C2 · worker · Claude Opus 5 · mission `consent-ui`, slice S02, clusters
`S02-C1` (shared `modalSemantics.ts` + render test + ADR-0022) and `S02-C2` (policy content
module + unit test) · lane `.worktrees/consent-s02/dialectical-engine`, branch
`slice/consent-s02`, base `2b670d30`.

**Status:** both clusters landed. C1 `8fe1e0bc49b75beab632d28e489f48c945e500b1`, C2
`91877847bcb5e638949661ccd90dc9486a60f544`, on `slice/consent-s02`, parent `2b670d30`, not
pushed. Written incrementally (COMMON §4b).

> **The question, verbatim from V:** *treat it like a murder case. I want to get a nice report
> on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we
> can make the coding more efficient. How can we turn this into a one prompt machine even
> better.*

---

## 1. The single most expensive thing in this seat, and it is a GOOD cost

**Reading cost dominated writing cost, roughly 4:1, and almost all of it was correct.** The
packet's reading order is COMMON.md (123 lines) → INSTRUCTIONS.md (100) → SPEC.md (757, read
in slices) → PLAN.md (2224, read in slices) → DECISIONS.md (191) → BASELINE.md (33) →
TOOLING-TRAPS.md (1466, read by heading index + 4 targeted slices). That is ~4,900 lines of
prose to produce ~250 lines of TypeScript and ~300 lines of test.

**This is not waste and the fix is not "write less".** Three specific facts, each buried in
that prose, would each have cost a full rework round if missed:

1. `jsdom 30.0.1 has no `window.matchMedia`` (DECISIONS + TOOLING-TRAPS). Without the guard,
   *every* render test that mounts the modal throws, and the failure names a DOM API, so it
   reads as an environment bug rather than as my design.
2. **Variant 7** of the acceptance-command family — a multi-path `vitest run` silently drops a
   path that does not exist and still exits 0. Without the `Test Files <n> passed (<n>)` arm a
   cluster reports GREEN having never run part of its target.
3. **§10.16 / §10.21** — a guard term matching vitest's `✓`/`×` glyph is `0` forever inside a
   `.sh` file under BSD grep in the C locale. My verification script therefore anchors on
   `Tests`/`Test Files`/`FAIL` and on test NAMES, never on a glyph, and prints its own
   `grep --version` and `LC_ALL` so a reader can see which grep produced the verdict.

**The upgrade is not less reading — it is an INDEX.** Everything I actually needed to *decide*
something fits in about 120 lines. What cost tokens was locating those 120 lines inside 4,900.
See §5 for the concrete proposal.

## 2. What I nearly got wrong (the near-misses, named)

- **NEAR-MISS 1 — I wrote the pop and the attach-once guard at step S02-S01, before any test
  demanded them.** Consequence: `S02-S09` ("closing the inner surface hands Escape back") and
  `S02-S10` ("exactly one listener") were **GREEN on their first run**. Under a naive reading
  of "RED before, GREEN after" I could have pasted a green frame and called it RED-first. I did
  not: I ran the two mutants the steps themselves name (`M9-stack-never-pops`,
  `M10-second-keydown-listener`), which turn each of those tests red, and reported them as the
  RED evidence with the frames. **The general lesson: when a later step's mechanism was written
  early, its RED comes from mutation, and the handoff must SAY that rather than imply a
  first-run red.** A seat that quietly re-ordered its own history here would be undetectable
  from the artifacts.
- **NEAR-MISS 2 — `S02-S06` is unsatisfiable under the textbook focus trap.** The step's
  property is *"focus reaches the newly enabled button rather than wrapping past it."* The
  classic trap only intervenes at the two ends (`preventDefault` + wrap); everywhere else it
  defers to the browser — and **jsdom implements no sequential focus navigation**, so under
  that design focus never moves and the assertion fails against a *correct* implementation.
  This is exactly the REQ-REV-01 B4/B5 defect class (an idiom prescribed without being
  executed) arriving from a new direction. The resolution: the trap manages **every** `Tab`
  inside the surface from a live `querySelectorAll`, not only the ends. I discovered this by
  building the end-wrap-only version first and watching `S02-S06` go red — i.e. the plan's own
  RED-first cadence caught it. Had I written the full version at S02-S04 I would have shipped a
  green suite and never learned that the classic design fails the step.
- **NEAR-MISS 3 — the ADR's acceptance arm greps the literal string `Status: Proposed`.** My
  first draft put the status in a markdown table cell (`| **Status** | **Proposed** — …`),
  which is the house ADR format and reads correctly to a human. `grep -c 'Status: Proposed'`
  returned **0**. The arm is the acceptance; the prose is not. Fixed by hoisting a
  `**Status: Proposed**` line above the table and deleting the table row, so the count is
  exactly `1` and cannot double.

- **NEAR-MISS 4 — the mutant that proves the escape guard was itself a no-op, and it looked like
  a dead assertion.** `S02-S16` exists to catch *"a `\uXXXX` escape shipped as six visible
  characters"*. My first refutation mutant put `\u2019` into the `.ts` source in place of `’` —
  **all six tests stayed green**, which reads exactly like "this assertion pins nothing". It
  pins plenty: TypeScript **decodes** `\u2019` in a string literal, so the runtime value was
  byte-identical and the mutant changed the file without changing the program. The mutant that
  models the real defect writes a **double** backslash (`\\u2019`, the shape a value gets after
  a round trip through `.json` or raw JSX); under that one the guard fires and names the string.
  **The general rule, now in TOOLING-TRAPS: a source-text mutation is only a mutant if it
  changes the RUNTIME value** — escapes, `as const`, whitespace and type-only annotations all
  mutate the file and not the program. And I then made the identical mistake a second time
  *while writing the trap entry itself*, typing the decoded `’` where the prose said "escape" —
  the same defect REQ-01 rework R2 recorded against `SPEC-v2.md`. **This confusion has now been
  paid for three times in one mission by three different seats. It is not a person problem; it
  is a "the two forms are indistinguishable in a rendered document" problem**, and the only
  cure that has worked is dumping codepoints (`[(i, ch, hex(ord(ch)))]`) rather than reading.
- **NEAR-MISS 5 — I nearly hand-typed 23 policy strings.** Instead I extracted the eleven
  sections TWICE, from two independent sources: `design/design-data.js` (a small JS-literal
  parser, escapes decoded) for the module, and `SPEC.md` §Copy (a markdown parser) for the
  test's literals — then diffed the two extractions field by field before writing either file
  (`TWO-SOURCE AGREEMENT: YES`, 11/11 sections, 8/8 pills, all four fields). **Had I typed
  them, a single wrong character would have gone into BOTH files** (I would have copied the
  test literal from the module or vice versa) and the byte-exactness test would have passed
  while the reader saw the typo. Two sources, two parsers, one diff: ~15 minutes, and it is the
  only reason `S02-S16` means anything.

## 3. Packet defects and imprecisions found (each priced)

*(Filled in and priced in the handoff; carried here so the case file is self-contained.)*

- **The packet calls it "the four-member `ModalSurface`".** `ModalSurface` has **three**
  members (`containerRef`, `initialFocusRef`, `onClose`) in the PLAN's byte-fixed block. The
  four-member type in this slice is `PrivacyPolicyModal`'s **prop** type (`open`, `mode`,
  `onClose`, `onAcknowledge`, step `S02-S33`, cluster C5 — not mine). Cost: ~3 minutes and one
  re-read of DECISIONS `:168`, which settles it. Class: **a packet sentence that compresses two
  different types into one noun.** Remedy: when a packet names a member count, it names the
  type's defining artifact and line in the same clause.
- **`S02-S14` catches no mutant that `S02-S11` and `S02-S12` do not already catch — measured,
  not asserted.** Its property ("every pill target resolves to exactly one section, and to the
  mapped one") is fully implied by the two literal pins that precede it: `POLICY_JUMP` is pinned
  record-by-record and the `no` array is pinned element-by-element, so any target or numbering
  mutation trips one of those first. Five mutants confirm it (`P1a`, `P1b`, `P4` each fire
  `S02-S11` **and** `S02-S14`; `P2` fires five tests at once). **It is still worth keeping** —
  it is the only assertion that survives a future edit which legitimately changes the pill list,
  because it states the invariant rather than the data. But a plan should not claim a step is
  RED-before when the two steps in front of it have already fixed the value; `S02-S14` was
  **GREEN on first write** and the handoff says so.
- **`PLAN.md` §Per-cluster boundaries, the C1 row, still names S01's ADR as
  `ADR-0019-consent-storage-contract.md`** in its `forbidden` column; under COMMON §10.23 that
  string is now `ADR-0021-…`. Already reported by ARCH-S02-REWORK-R2 as a known residual and
  re-confirmed here; it sits in a `forbidden` column, so no seat acts on it. Cost: 0 (I was
  pre-warned by DECISIONS `:186`).

## 4. Dead ends — do not re-derive these

- **The end-wrap-only focus trap.** Measured dead against `S02-S06` in jsdom. See NEAR-MISS 2.
  Any future seat that "simplifies" `trapTab` back to intervening only at the two ends will
  turn `S02-S06` red, and the correct reading of that red is *the simplification is wrong*, not
  *the test is wrong*.
- **Putting the ADR status only in the metadata table.** Measured dead against `S02-S72`'s
  ARM2.
- **Assuming `git status --porcelain` inside the lane prints lane-relative paths.** It prints
  them **git-root-relative** (`dialectical-engine/apps/ui/...`) because the git root is one
  level above the project root. Harmless, but a guard written as
  `grep '^?? apps/ui'` would be `0` forever — the same shape as the glyph trap.
- **Mutating a `\uXXXX` escape in a `.ts` file to prove the escape guard works.** Measured
  no-op; see NEAR-MISS 4. The mutant needs a double backslash.
- **Expecting the six-case C2 suite to pin `readonly`.** Mutant `Q2-readonly-dropped-from-types`
  (`readonly PolicyJump[]` → `PolicyJump[]`) leaves all six tests green, because it is a
  type-level change with no runtime effect. `readonly` is pinned by the exported-surface check
  against `PLAN.md` and by `pnpm typecheck`, and by nothing else. Same for
  `Q1-field-order-swapped` (object key order): green, correctly.

## 5. How to make this more of a one-prompt machine

1. **Ship a per-cluster CONSTANTS CARD with the packet.** Everything a coding seat must
   *transcribe rather than compute*, on one page, with its source `path:line` beside it: for
   C1 the ten-line exported-surface block; for C2 the eleven bodies, the twelve bullets, the
   eight pills, the accent array, the section ids. I re-derived the C2 accent array by reading
   two documents (SPEC §R12's table and `design-data.js:57-84`) to confirm they agree. A card
   the packet hands me makes that a diff, not a derivation. **Estimated saving: 30-40% of this
   seat's reading budget.**
2. **Ship the `run` idiom as an executable file, not as a fenced block to retype.** Every
   coding seat in this mission re-types the same 12-line bash function, and §10.21 exists
   precisely because re-typing a guard is how the `·`-as-`.` defect got in. Put `a9.sh` (or a
   `verify.sh <cluster>`) in `.hermes/planning/<mission>/` and have the packet say *run this
   file*. **A retyped guard is a new guard.**
3. **Make "the mechanism was written early, so this step's RED is a mutant" a first-class
   reporting slot in the handoff template.** It happened twice in ten steps here. Without a
   named slot, an honest seat writes a paragraph and a careless one writes nothing, and the two
   are indistinguishable to the reviewer.
4. **Every acceptance arm in a PLAN should be executable text, not prose about text.**
   `S02-S72`'s three arms were already in this form and that is exactly why NEAR-MISS 3 was
   caught in seconds rather than in review. The steps whose acceptance reads "a stranger runs
   the C1 command and reads `Tests 1 passed (1)`" are one degree weaker — they describe the
   command instead of being it.
5. **Make transcription a two-source EXTRACTION, never a typing task, and say so in the step.**
   `S02-S16` demands 23 byte-exact strings. Typing them is a coin flip, and worse, the natural
   way to make the test agree with the module is to copy one from the other — which makes the
   test tautological. The method that works, and that took 15 minutes: parse
   `design-data.js` for the module, parse `SPEC.md` §Copy for the test's literals, diff the two
   extractions before writing either file. **A step that says "byte-exact" should name the two
   sources and require the diff**; then byte-exactness is a measurement instead of a hope.
6. **State the RED-first order INSIDE steps whose implementations overlap.** `S02-S04`,
   `S02-S05` and `S02-S06` are three properties of one function, and the ONLY order in which
   all three are genuinely RED-first is end-wrap-forward → add shift → generalise to every Tab.
   The plan does not say so; I found it by building it. One sentence in `S02-S06` ("implement
   the end-wrap form first; this step is what forces the live query") would transfer that for
   free.

---

# PART II — rework round 1 (seat `CODE-S02-C1C2-REWORK-R1`, fresh session, Opus 5)

**Answers** `docs/missions/consent-ui/reviews/CODE-REV-S02-C1C2-r1.md`: B1 blocking, N1/N2/N3
non-blocking (N4 is orchestrator process, not mine). **One commit:** `06ab1da4` on
`slice/consent-s02`, parent `91877847`, not pushed. Part I above is my predecessor's and is
untouched.

## 1. The murder: what made B1 invisible, and what it actually cost

**Cause, stated once:** the module derived *topmost* from **when a surface registered** instead
of from **where it is**. Registration happens in a `React.useEffect`; React runs effects
child-first inside one commit; so a nested pair lands as `[inner, outer]` and "the last entry"
names the surface underneath. Every artifact in the chain — `SPEC` R14/R16, `PLAN` S02-S01
("outer first then inner"), `DECISIONS`, `ADR-0022` §Decision ("only the last entry's
`onClose`") — is *true of siblings and false of nesting*, and none of them says which
arrangement it means. The predecessor's fixture mounted **siblings**, the one arrangement where
the proxy and the property agree. Four artifacts and a green suite all pointed the same wrong
way.

**The load-bearing detail nobody wrote down:** the two consumers this module exists for are
NESTED — S01's policy modal is a React child of S01's preferences card. The defect was not in a
corner case; it was in the only shape the mission actually builds.

**Price.** Round 1 of 3 spent: my session end-to-end ≈ 55 min wall-clock, of which the fix
itself was ~8 minutes (a 20-line internal function). The other ~47 went to reading (packet,
COMMON, verdict, predecessor handoff, three probe files), reproducing, and the refutation
harness. **The fix was cheap; discovering that it was needed cost a full review round.** The
generalisable number: a defect that only a *shape* of fixture can see costs one round per
missing shape.

**What I nearly got wrong — twice.**
1. I nearly wrote the nested **Tab** case as "focus in outer, press Tab, expect a control inside
   inner" with the outer surface holding only its close button. That case is **GREEN against
   the broken module**: the outer's `querySelectorAll` reaches *into* the nested inner (it is a
   DOM descendant), so the wrong surface produces the right element by accident. It only turns
   RED when the outer has a focusable of its own that would be next. I caught it by computing
   both branches on paper before writing the assertion. **A nested fixture is not automatically
   a discriminating fixture.**
2. I nearly reported the N1 "advance past an element `focus()` refused" arm as pinned by the
   hidden-input case. It is not: with both remedies in place they *overlap*, and removing
   either one alone leaves the suite green (measured: `M-N1b`, `M-N1c` → `17 passed (17)`;
   `M-N1d`, both removed → RED). Reported as an overlap, not as coverage.

## 2. What repeatedly costs tokens (upgrades, in priority order)

1. **A property stated in prose has no arrangement; a fixture does. Packets must name the
   ARRANGEMENT, not just the property.** "Mount two surfaces, one over the other" was satisfied
   by siblings by four different readers. The cheap fix, and my concrete recommendation: for any
   ordering/stacking/priority property, the SPEC hook enumerates the arrangements
   (`siblings same commit · nested same commit · nested sequential · N-deep · after a remount`)
   and the cluster owes one case per arrangement. This is the same class as the mission's
   already-recorded "a sample is not the class" law, applied to *fixtures* instead of to
   *files* — that generalisation is not in COMMON §2.2 today and should be.
2. **Derive from the property, never from a proxy — and say which is which in the code.** LIFO
   array position, insertion order, effect order, `z-index` declaration order are all proxies
   for "on top". The reviewer's one-line test — *is this the property, or a stand-in that
   usually agrees with it?* — would have caught this at write time for free. Worth a line in the
   worker contract.
3. **Two remedies for one class must each be priced separately.** The orchestrator ruling for N1
   ordered a filter AND an advance-past-unfocusable loop. In jsdom only `input[type=hidden]`
   refuses `focus()` (measured: `tabindex="-1"`, `[hidden]`, `display:none`,
   `visibility:hidden` all take programmatic focus), so the environment can only ever
   discriminate one of the two. A packet that orders two remedies should say which one the test
   environment can see, or the seat spends its budget hunting for a fixture that cannot exist.
   I spent ~6 minutes on that hunt before measuring the environment directly — **measure the
   environment first is cheaper than reasoning about it** (the mission's own §3 "measure before
   you speculate", again).
4. **The kit re-run instruction needs a lane-independent path.** The reviewer's kit hard-codes
   `cd .worktrees/rev-s02-c1c2/…` in `code-rev-s02-c1c2-r1-cluster.sh` and
   `code-rev-s02-c1c2-r1-surface-check.py`. Both had to be edited to run in the author's lane —
   and an author editing a reviewer's probe is exactly what COMMON §10.10 wants to avoid. **Take
   the worktree from `git rev-parse --show-toplevel` (or `$1`), never from a literal**, and the
   probe kit becomes re-runnable by every later seat with zero edits.
5. **The probes must live one level under the package root** (they import
   `../apps/ui/components/consent/modalSemantics.js`), so re-running the kit *requires* creating
   a directory inside the lane that no author's `allowed` list names. I used the kit's own
   `.review-scratch/`, deleted it before the commit and proved porcelain empty — but a packet
   that orders a kit re-run should grant that path explicitly, or the kit should resolve the
   module through an alias instead of a relative path.

## 3. Toward the one-prompt machine

- **The single highest-value artifact in this round was the reviewer's probe kit**, because it
  is executable and arrangement-complete. It turned a verdict into a 4-second RED/GREEN oracle
  (`2 failed | 27 passed` → `29 passed`). **Every blocking finding should ship with one.** The
  cost is small — the reviewer already wrote the fixtures to find the bug.
- **A rework packet should state the expected RED string for the AUTHOR's own cluster too**, not
  only for the kit. Mine correctly pinned `Tests 2 failed | 27 passed (29)` for the kit; the
  cluster's post-fix count (`<n>` rises) was left to me to state. One line — "expect the cluster
  to go from `10 passed` to `10 + <cases you add>`" — makes the count a checkable constant
  instead of a self-reported one.
- **Ship the mutation harness with the module, not with the seat.** I re-derived a mutant runner
  my predecessor had already written (their 20-mutant runner lived in a per-round scratch dir
  that is gone). A `probes/` file promoted at seat exit is retained; a scratch file is not.
  **Anything that took more than ten minutes to write and can be re-run should be promoted, and
  the promotion should be the orchestrator's automatic step at seat exit, not a remembered one.**
- **`heartbeat-worker` §2's "neighbouring mutant" clause paid for itself here.** Two neighbours
  (`reverse the scan order`; `keep only the FOLLOWING arm`) confirmed the new assertions pin the
  *property* (topmost by document position) and not the loop's incidental shape. Without them a
  reviewer cannot tell an over-fitted assertion from a real one.

## 4. Dead ends (do not re-derive)

- **`[hidden]`, `display:none` and `visibility:hidden` cannot be discriminated in jsdom 30.0.1**
  — `focus()` lands on all three. Measured, not assumed. Only `input[type=hidden]` is refused.
  Anyone trying to write a jsdom test for the visibility member of N1 is wasting the round; it
  belongs to V or Grok in a real browser, exactly as the ruling says.
- **`Node.DOCUMENT_POSITION_CONTAINED_BY` is redundant beside `DOCUMENT_POSITION_FOLLOWING`** —
  a contained node is also *following*, so the containment arm is documentation, not logic
  (measured: dropping it changes no test). Kept because it names the intent.
- **The reviewer's own negative control #1 in `code-rev-s02-c1c2-r1-surface-check.py`**
  (`"export function openSurfaceCount(): number "` with a trailing space) returns `True`, not
  `False`, because the implementation reads `…): number {` — the space before the brace matches.
  The verdict text quietly lists only the other three controls, so nothing was claimed falsely;
  but the file as promoted contains one control that cannot discriminate. Do not treat it as a
  four-control discriminator.
