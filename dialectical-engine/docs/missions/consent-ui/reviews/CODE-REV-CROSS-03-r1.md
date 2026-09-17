# CODE-REV-CROSS-03 — round 1 — blind review of `4ef2f7d3` (seat CODE-CROSS-03, ticket `t_ed4c5e73`)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion`

`superpowers:systematic-debugging` — **not loaded this session; not needed** (COMMON §10.9's honest
form): nothing I judged was a failure needing root-causing. Every RED in this review is a mutant I
planted deliberately, and its cause is the line I planted. `superpowers:receiving-code-review` —
**not loaded this session; not needed**: no finding of mine has been contested yet. If B1 is
contested I load it before answering.

## Verdict: **REWORK**

1 blocking (B1) · 2 non-blocking (N1, N2) + 1 confirmed duplicate (N3, on `t_4f97ca86`) · 6 packet
findings (P1–P6, against the orchestrator; P5 and P6 are against MY OWN packet and are discharged here).
Round 1 of max 3, so a round-2 rework is lawful; nothing here goes to a V DECISIONS PACKET row.

**Everything the packet charged me to verify about the SHIPPED BEHAVIOUR is correct.** The four
mutants the packet names all discriminate, the flip list is exactly the three named cases with
nothing weakened, every residue item is discharged, the file surface is exactly nine files, the
exported contract is byte-identical, and every gate is at or above its pin on the worst of three
runs. **B1 is a divergence between the code and the rule the same commit writes into three
documents** — and it is the packet's defect (P1), correctly obeyed and correctly disclosed by the
author, not the author's error.

---

## TIER RULING — the reflexive-`contains` question (the packet's `RULE ON THIS`)

> **BLOCKING. A REWORK round: one `||` term in `modalSemantics.ts`, one sentence in ADR-0022, and one
> new case in `consent-modal-semantics.test.tsx`.**

The rule was ruled as **"DESCENDANT"**, which is strict. The shipped predicate is
**descendant-or-self**. I measured the consequence rather than reasoning about it, and it is not a
technicality: with two surfaces sharing one container node, `Escape` goes to the surface opened
**first**; with three, it walks past both and reaches the **earliest-registered** one. That is a full
inversion of open order — the same harm as `CODE-REV-S02-C9 r1` **B1**, in a third shape.

**Why blocking and not a ticket.** The commit's own justification for the tiebreak is a shape nobody
can reach today — the helper's doc comment says so in as many words ("No surface in this product nests
today … it is there for the next overlay pair"). If unreachability were sufficient to defer a defect,
it would have been sufficient to skip the commit. The two cannot be graded differently. And the
artifact is not ordinary code: it is the mission's **ONE shared modal-semantics helper**, plus
**ADR-0022**, which is the specification the seven-overlay retrofit `A11Y-OVERLAYS` (`t_8962842f`)
will implement from — and ADR-0022 now states `Node.contains` in prose, so fixing only the code would
leave the wrong predicate as the standing instruction.

**CONFIDENCE: high** — on the mechanism and the remedy, both measured three times. **Medium** on the
tier itself, which is a judgement about cost, not a measurement.

**STRONGEST COUNTER, stated in full because it is a good one.** Two `useModalSurface` calls pointed at
one container node is arguably a *caller error* rather than a legitimate arrangement, so the shipped
behaviour may be undefined rather than wrong; nothing a visitor can reach changes; the author
disclosed it in TOOLING-TRAPS; and the Grok "UI element fully done" gate already requires every
non-blocking finding to be closed before the slice ships, so an N-finding would also prevent it
reaching V. A reasonable reviewer rules this **N**. I answer: the helper's contract is "one entry per
OPEN surface" and open order is its stated tiebreak for everything except containment, so the case is
*specified*, not undefined — and P4 shows the outcome is deterministic, not arbitrary. **If the
orchestrator or V grades it N instead, the measurement and the remedy below stand unchanged and must
land the same day; the tier is the only part of B1 I would not defend to the last round.**

---

## Packet review (against the orchestrator — every constant re-derived, §10.24)

### Constants that are CORRECT (stated, because a review packet is only reviewed here)

| Constant | Where | Re-derived |
|---|---|---|
| review package = 942 lines | my packet §1 | `wc -l` → **942** ✓ |
| TOOLING-TRAPS at dispatch = 2716 lines | my packet §4 | `wc -l` → **2716** ✓ |
| 9 files, 347 insertions, 79 deletions, one commit on `c334136d` | my packet §1 | `git diff --stat c334136d..HEAD` → **9 files, 347 insertions(+), 79 deletions(-)** ✓ |
| `consent-card.test.tsx:491` asserts `\bdocument\b` absent | my packet §4 | `:491` = `expect(/\bdocument\b/.test(source), "the card reaches the document").toBe(false);` ✓ |
| the consent SET is seventeen files at BASE | my packet §4 | `Test Files 17 passed (17)` ✓ |
| t9 = `2 failed \| 7 passed (9)`, one hit at `globals.css:6116` | my packet §4 | measured exactly ✓ |
| root typecheck: 8 in `s14-ui`, 0 outside | my packet §4 | `n_tc=0`, `tt=1`, `n_tcran=1` ✓ |
| the three guard suites = 32/32 | my packet §4 | `Tests 32 passed (32) / Test Files 3 passed (3)` ✓ |
| `CMD-C6`'s two S02 arms are vacuous in this lane | my packet §4 | `slice/consent-s02` resolves to `4ef2f7d3` = HEAD, so `HEAD..HEAD` is empty ✓ |
| the `allowed` list covers every mandated deliverable and both tickets | my packet §1 | verdict, self-report, TRAPS append, probes dir, `t_5d7078fe`, `t_ed4c5e73` — all present ✓ |

### P1 — `CODE-CROSS-03.md:8` prescribes a REFLEXIVE predicate for a rule it words as strict (BLOCKING's cause)

Verbatim (`.hermes/reports/consent-ui/snapshots/packets/CODE-CROSS-03.md.at-dispatch:8`):

> a LOWER entry wins over the incumbent ONLY when the lower entry's container is a **DESCENDANT** of
> the incumbent's container (`incumbent.contains(lower)` — `Node.contains`, not
> `compareDocumentPosition`, no FOLLOWING arm anywhere)

The reviewer whose measurement that same line cites — `CODE-REV-CROSS-02-r1.md:345` — used
**`CONTAINED_BY`**: *"only when the incumbent's container `CONTAINED_BY` it"*. `a.contains(a)` is
`true`; `a.compareDocumentPosition(a)` is `0`, so the `CONTAINED_BY` bit is clear. **The packet swapped
the API inside a measured remedy and did not re-state the boundary case the swap changes.**

**CLASS:** *a packet transcribing a measured remedy into a different API without re-deriving the
boundary cases where the two APIs differ — reflexivity, `null` handling, short-circuiting.*
**REMEDY: BINDING (measured — the full battery in "What I verified" below).**

### P2 — `CODE-CROSS-03.md:6` displaced the full TOOLING-TRAPS read, and the displaced entry was the one that cost the author

Verbatim `:6`: *"**TOOLING-TRAPS at dispatch: 2651 lines** (COMMON §10.66). Read everything past that
line at CLAIM and again at handoff"*. The file had not grown, so "everything past that line" was the
empty set. The trap at `TOOLING-TRAPS.md:2537-2545` — a one-word JSDoc addition tripping
`consent-card.test.tsx:491`'s `\bdocument\b` ban, written by the *immediately preceding* seat — sits
**above** 2651 and was therefore never read.

Scored honestly: **the packet complied with §10.66 as it then stood; §10.66 was the defect.** COMMON
§10.67 now fixes the wording, and it was created by this finding. I file it so the correction has a
measured second witness, not to charge the packet author twice. My own packet applies §10.67
correctly.

### P3 — `CODE-CROSS-03.md:23` names ONE suite for mutant M2 where THREE cases in TWO files go red

Verbatim `:23`: *"M2 a FOLLOWING arm added back → `consent-cross-slice.test.tsx` RED"*. Measured
(mutant M2, below):

```
M2-FOLLOWING | exit=1 | CAUGHT | Tests  3 failed | 30 passed (33)
   FAIL  tests/render/consent-cross-slice.test.tsx > … > P4 · one Escape closes the sign-up policy, not the cookie card underneath it
   FAIL  tests/render/consent-cross-slice.test.tsx > … > P7 · the closed policy returns focus to its own opener and leaves the card's state alone
   FAIL  tests/render/consent-modal-semantics.test.tsx > … > delivers one Escape by OPEN order when two surfaces opened out of DOM order
```

This is not cosmetic. `:8` also tells the seat *"name any other flip as a regression and stop"*. A
seat obeying both lines, watching an unnamed suite go red under a packet-ordered mutant, is made to
choose between stopping the line and ignoring an explicit instruction. **CLASS:** COMMON §10.62 — *a
packet describes what a case SET discriminates, never what one case flips.* **REMEDY: BINDING
(measured).**

### P4 — `CODE-CROSS-03.md:19` orders a comment reword into a file scanned by a `\bdocument\b` guard, and names no guard

Verbatim `:19`: *"`apps/ui/components/consent/CookiePreferencesCard.tsx` (the `returnFocusRef` prop's
doc comment only: it serves when the captured opener is not a connected element AT CLOSE, never 'the
opening commit')"*. That file is scanned by `consent-card.test.tsx:489-492` for `addEventListener`,
`.focus()`, `/\bdocument\b/` and `/["']Escape["']/`, and by
`consent-policy-link.test.tsx:384-391` for a **bare** `Escape`. The packet names none of them.
**Compounding with P2:** the packet both suppressed the full TRAPS read and ordered the exact edit the
suppressed entry warns about. The author shipped it correctly anyway (measured: 0 hits for every
needle in both changed product files), but by re-deriving the knowledge.

### P5 — my own packet's residue charge is unsatisfiable as worded

`CODE-REV-CROSS-03-R1.md:27`: *"C9 r1 N1 (consent-bar case renamed — grep the OLD title across
`docs/missions/consent-ui/` and `tests/`; every remaining hit is a finding)"*. Measured: exactly one
hit survives —

```
docs/missions/consent-ui/reviews/CODE-REV-S02-C9-r1.md:120
  `ships R09's geometry inside ONE delimited S01 block at the end of globals.css` while `:240-258` now
```

— which is the verdict sentence **reporting** the defect, and which must quote the old title to say
what was wrong. Editing it would falsify a review record. The WORK packet worded this correctly
(`CODE-CROSS-03.md:26`: *"report every hit (edit only BASELINE's line)"*); the review packet widened
it. **CLASS:** TOOLING-TRAPS `:1409` — *a sweep claim counted as raw occurrences can never reach zero
once you write the correction.* **REMEDY: BINDING (measured):** *"every hit outside a review verdict is
a finding; a verdict quoting the old title in order to report the rename is the record and stays."*
**This is not a finding against the author** — it is discharged.

### P6 — my own packet's `.review-scratch/` grant is superseded, and its skip instructions carry no line ranges

(a) `CODE-REV-CROSS-03-R1.md:12` grants scratch under `<lane>/.review-scratch/`. TOOLING-TRAPS `:1785`
and the 03:10 correction at `:2306` both record that a probe cannot RUN from there and that the
corrected route is a scratchpad-owned `--config` — which COMMON §10.46 also now says. The grant's only
remaining effect is to invite files into the tree under review. I used the scratchpad route; the
lane's `git status --porcelain` was **0** at CLAIM, after every mutant, and at exit.

(b) `:5` and `:23` tell me to skip `BASELINE.md`'s `CLAIMED — UNVERIFIED` list and the
`[CODE-CROSS-03, 4ef2f7d3]` TRAPS entries "until the appendix step" and give **no line ranges**. Both
files are append-only, so the boundary is discoverable only by reading past it. **DISCLOSURE: I read
both.** `BASELINE.md` is 52 lines and I read it top-to-bottom; TOOLING-TRAPS I read in full as §10.67
orders and reached `:2653` the same way. **Containment:** my probe was written, run ×3, mutated for
its remedy, and written to
`<scratch>/MEASURED-FIRST.md` **before** either section was opened; the appendix section of this
verdict records what changed after I read them (nothing). **REMEDY: BINDING (measured — the boundary
is only knowable by reading):** every skip instruction carries a `grep -n`-measured line range, or the
orchestrator moves the `CLAIMED — UNVERIFIED` block into a sibling file the review packet does not
list. §10.54/§10.65 are otherwise unenforceable.

---

## B1 (BLOCKING) — `apps/ui/components/consent/modalSemantics.ts:193`: the (b′) tiebreak fires on identity, inverting open order for surfaces that share a container

```ts
// apps/ui/components/consent/modalSemantics.ts:190-196
    const container = entry.read().containerRef.current;
    if (container === null || !container.isConnected) continue;
    if (!topContainer.contains(container)) continue;      // <- :193, REFLEXIVE
    top = entry;
    topContainer = container;
```

**Concrete inputs → wrong outcome.** Two surfaces register with `containerRef` pointing at the SAME
element; `first` registers, then `second` (measured, not assumed — the probe asserts effect order).
Pass 1 takes `second` as the incumbent. Pass 2 evaluates `topContainer.contains(container)` where
`container === topContainer`, which is `true`, so `first` **replaces** `second`. One `Escape` closes
the surface the visitor opened FIRST — the one underneath — and leaves focus trapped in the surface
that refused the key. With three sharers the loop keeps replacing and reaches the earliest of the
three.

**Evidence — my own probe, from the CLAIM, three identical runs** (`probes/reflexive-contains.test.tsx`):

```
P3 RESULT firstClose=1 secondClose=0          <- rule requires secondClose=1
P4 RESULT closed=["a"]                        <- rule requires ["c"]
P6 RESULT closed=["inner"]                    <- control, correct
      Tests  2 failed | 4 passed (6)
```

Controls P1 (two unrelated containers → last opened wins), P2 (a strict descendant → descendant
wins), P5 (Tab) and P6 (a shared pair plus a genuine descendant) all pass, so the harness
discriminates and the defect is specific to identity.

**Second, independent tell.** The function's own doc comment argues its termination from a property
the shipped predicate does not have: *"Because each replacement is strictly deeper, one pass reaches
the innermost open surface"* (`modalSemantics.ts:180-182`). Under `contains`, a replacement need not be
deeper at all. The loop still terminates (the index decreases), but the prose and the predicate
disagree — which is the same defect this very commit exists partly to fix in `CookieConsent.tsx`.

**CLASS (binding):** *a rule stated in one vocabulary ("DESCENDANT") and implemented in another
(`Node.contains`), in a SHARED contract whose prose is the specification for future consumers.* The
class members in this commit are the code at `:193`, the helper's own doc comment (`:178-182`),
**ADR-0022's addendum** (*"replaces the incumbent by any connected entry whose container the incumbent's
container `contains` (`Node.contains`)"*, and the earlier sentence *"a LOWER entry replaces the
incumbent when, and only when, its container is inside the incumbent's"*), and the `CookieConsent.tsx`
comment (*"applies containment only where one surface is nested inside the other"*). **A fix that
touches only the code fixes one of four.**

**REMEDY — BINDING (measured):**

```ts
    if (container === topContainer || !topContainer.contains(container)) continue;
```

Planted with `cp`-snapshot / `cp`-restore / `diff -q` (never `git checkout`, TRAPS `:2111`):

```
probe under the remedy   :  Tests  6 passed (6)     (was 2 failed | 4 passed)
the whole consent SET    :  Test Files 17 passed (17) / Tests 195 passed (195), exit 0   (unchanged)
consent-modal-semantics + consent-cross-slice : Tests 33 passed (33)                     (unchanged)
```

**The remedy costs nothing.** `compareDocumentPosition(container) & DOCUMENT_POSITION_CONTAINED_BY` is
equally correct and is what CROSS-02 measured; the `===` guard is one token and keeps the ADR's
"one `Node.contains` call" argument intact.

**The rework must also fix the CLASS, not the instance:** ADR-0022's addendum, the helper's doc
comment and the `CookieConsent.tsx` sentence each state the relation, and each must say *strict*
descendant (and the ADR must stop offering bare `Node.contains` as the rule, since it is the
specification `A11Y-OVERLAYS` will implement from). One new case in
`consent-modal-semantics.test.tsx` pins it — the packet must grant it, because the author's `allowed`
list granted exactly one new case and it was spoken for (see "The author is not charged" below).

**The author is not charged.** `CODE-CROSS-03.md:8` prescribed `Node.contains` verbatim; the author
implemented the packet, **disclosed the divergence and its exact consequence** in TOOLING-TRAPS under
its own heading, and declined to patch it on the correct ground that no test case was granted. That is
the behaviour the protocol asks for. B1 is the packet's defect (P1) surfacing in the code.

---

## N1 (non-blocking) — ADR-0022's (b′) addendum claims FOUR pinning cases; exactly THREE pin the tiebreak

`docs/architecture/01-decisions/ADR-0022-shared-modal-semantics.md` (the 2026-09-07 (b′) addendum):

> Pinned by four cases in `tests/render/consent-modal-semantics.test.tsx` (the nested pair in one
> commit, the nested pair in a later commit, the three-deep chain, and the `Tab` trap reading the same
> entry)

Measured — mutant **M1**, the tiebreak removed (`for (index -= 1; false && index >= 0; …)`):

```
M1-NO-TIEBREAK | exit=1 | CAUGHT | Tests  3 failed | 30 passed (33)
   FAIL  … > delivers one Escape to the nested INNER surface of a pair mounted in ONE commit
   FAIL  … > delivers one Escape to exactly one of three surfaces, and it is the innermost
   FAIL  … > traps Tab in the same surface Escape reaches, for the same nested pair
```

**`delivers one Escape to a nested inner surface that opened in a LATER commit` stays GREEN with the
tiebreak removed** — correctly, because there the inner surface is already the last registered and
plain open order reaches it. The test file's own comment is honest about this (*"Nesting neither helps
nor hinders it"*); the ADR is the document that overstates.

**Concrete inputs → wrong outcome:** a future seat reads the ADR, deletes the "later commit" case
believing three others still pin the tiebreak, and is right; or — the expensive direction — deletes
one of the three believing four cover it. **CLASS:** *an artifact stating its own coverage without
running the mutant that would establish it* (TOOLING-TRAPS `:1619`, "two remedies for one defect class
can hide each other — price each with the other removed"). **REMEDY: BINDING (measured):** the
addendum says **three**, names them, and says the later-commit case is green either way because open
order already reaches that surface. Fold into B1's rework, same file.

## N2 (non-blocking) — `modalSemantics.ts:191`'s `!container.isConnected` disjunct is unreachable, and nothing pins it

```ts
// :191
    if (container === null || !container.isConnected) continue;
```

**Proof of unreachability.** Pass 2 runs only while `topContainer !== null`. `topContainer` was
selected in pass 1 by `container === null || container.isConnected`, so a non-null `topContainer` is
`isConnected`. Any node a connected element `contains()` is itself connected. Therefore
`!container.isConnected` implies `!topContainer.contains(container)`, and the next line would
`continue` anyway. The two reads are in one synchronous loop with no DOM mutation between them, so
there is no window.

**Evidence** — mutant **M6**, the disjunct removed:

```
M6-PASS2-KEEPS-DETACHED | exit=0 | SURVIVED | Tests  33 passed (33)
```

**CLASS:** *a guard term that cannot fail* — the acceptance-defect family this repo has recorded six
variants of, arriving inside product code rather than inside a command. **REMEDY: ADVISORY** (the
author may refute with output): either drop the disjunct, or keep it and write the unreachability
proof above into the comment so the next reader does not try to pin it. **Do not spend a round writing
a fixture** — there is no fixture.

## N3 (CONFIRMED DUPLICATE — see the appendix; PRE-EXISTING, not caused by `4ef2f7d3`) — `run_c9`'s two merge arms are unsatisfiable by construction; here is the cause

> **Downgraded at the appendix step:** the author derived this cause independently and reported it in
> their handoff §5. N3 is therefore **not a new finding** — it is a second, blind derivation of the
> same diagnosis, and it belongs on `t_4f97ca86`, not on this commit. Kept in full because two
> independent derivations of one cause is the strongest signal this harness produces.


`slices/S02/PLAN.md:1413-1416` is already ticketed as known-false (`t_4f97ca86`, and
`CODE-CROSS-03.md:9` lists it). **The diagnosis was not recorded, so it is here.** Measured at HEAD:

```
S02-C9 | mergeArms: --scrim:=1 (expect 2)  S02markers=1 (expect 2)   ->  run_c9 VERDICT=1
```

* `grep -c -- '--scrim:'` expects **2** on the derivation *"declared once in each of the two token
  blocks S01 owns"*. It is not: `--scrim` is a **mode-independent** token — COMMON §7's own table says
  so (*"NEW mode-independent token … both modes … register in the test's `MODE_INDEPENDENT` map"*) — so
  it is declared **once**, at `globals.css:65`, in `:root` only. `html[data-mode="chamber"]` correctly
  does not redeclare it.
* `grep -c -- '=== consent-ui S02 ==='` expects **2** for *"an opening and a closing marker"*. The
  closing marker is `/* === end consent-ui S02 === */`, which does not contain that substring. The
  count is 1 against a perfectly delimited block. Markers measured at `globals.css:7617` and `:8036`.

Both arms are **1 forever against a correct tree**. `run_c9`'s vitest half is GREEN
(`Tests 112 passed (112) / Test Files 10 passed (10)`, exit 0); the command's overall `VERDICT=1` is
entirely these two arms. **This commit touches no CSS at all** (`globals.css` is not among the nine
files), so it neither caused nor could fix it. **REMEDY: ADVISORY**, on `t_4f97ca86`: `--scrim:`
expects **1** with its derivation restated, and the marker arm greps `'consent-ui S02'` (matching both
markers, expect 2) or counts the two markers separately.

---

## What I verified, and HOW (verbatim outputs)

**Setup.** Detached worktree `.worktrees/rev-cross-03/dialectical-engine` @ `4ef2f7d3`,
`git status --porcelain` = **0** at CLAIM; `pnpm run generate:contract` exit 0, porcelain still 0.
Probes ran through a scratchpad-owned `--config` (COMMON §10.46, TRAPS `:2306`/`:2440`) whose alias
array mirrors the lane's `vitest.config.ts` including the `@` alias; lane from `LANE`, never a
hard-coded `.worktrees/` path (COMMON §10.35). **Zero files created in the lane, zero under `tests/`.**

### 1. The reflexive question — my own probe, built from the CLAIM (B1's evidence)

Harness written from the repo's pre-existing `createRoot` + `act` idiom
(`tests/render/auth-flow-integration.test.tsx:1-40`), **not** from the file under review. Six cases:
two controls that must hold under the ruled rule, the two that put the question, one Tab case, one
mixed case. Registration order is **asserted**, not assumed (`expect(order).toEqual(["first","second"])`).
Three runs, identical; figures in B1 above.

### 2. Mutant battery — `cp` snapshot, `cp` restore, `diff -q`, anchor-uniqueness asserted, landing asserted

Run against `tests/render/consent-modal-semantics.test.tsx` + `tests/render/consent-cross-slice.test.tsx`
(33 cases). Classification is BROKEN / CAUGHT / SURVIVED, never zero-vs-nonzero (TRAPS `:1637`,
`:1890`, `:2310`).

| id | mutant | packet charge | result |
|---|---|---|---|
| M1 | the (b′) tiebreak removed | (i) the nested-pair pins RED | **CAUGHT** — `3 failed \| 30 passed (33)`, the three named cases |
| M2 | a `FOLLOWING` arm added | (ii) cross-slice **and** the out-of-DOM-order case RED | **CAUGHT** — `3 failed \| 30 passed (33)`: cross-slice P4, P7, and `delivers one Escape by OPEN order when two surfaces opened out of DOM order` |
| M3 | the `isConnected` skip removed | (iii) the detached case RED | **CAUGHT** — `2 failed \| 31 passed (33)`: `never lets a surface whose container has detached consume Escape` + `never lets a DETACHED entry receive Escape, however many have detached` |
| M4 | `container !== null && …` | (iv) the new null-container case RED | **CAUGHT** — `1 failed \| 32 passed (33)`: `delivers Escape to a registered surface that renders NO container of its own` |
| M5 | pass 2 `break`s at the first descendant | *mine, from the SPEC property* | **CAUGHT** — `1 failed \| 25 passed (26)`: the three-deep chain. The "repeat until innermost" property IS pinned |
| M6 | pass 2 keeps a disconnected lower entry | *mine* | **SURVIVED** — `33 passed (33)` → **N2** |
| R1 | the B1 remedy (`container === topContainer \|\|`) | *mine* | **SURVIVED** — `33 passed (33)`; and the full SET `17 files / 195 tests` |

All four packet charges (i)–(iv) **discriminate as stated**. Target byte-identical to its snapshot
after every mutant; `git status --porcelain` = 0 after the battery.

### 3. Gates as deltas — ×3 from a `.sh` under `/bin/bash`, worst run is the verdict

All three runs **byte-identical**; commit column = `4ef2f7d3` throughout.

```
### lane=…/.worktrees/rev-cross-03/dialectical-engine  HEAD=4ef2f7d3  dirty=0
S01-C6 verdict=0   summary:      Tests  14 passed (14)  files: Test Files  1 passed (1)   S02-files: ref resolved 0, commits in 4ef2f7d3…..HEAD touching them: 0, working-tree diff: 'none'   tsc ran: 1 exit 1, outside the pin: 0
S01-C7 verdict=0   summary:      Tests  76 passed (76)  files: Test Files  6 passed (6)   hit-list: 1 (pinned: 1)  t9 failures: 2  S01 css blocks: 1   tsc ran: 1 exit 1, outside the pin: 0
 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
     FAIL  tests/unit/t9-mode-tokens.test.ts > T9-C3 … > renders one accessible toggle that reads the document mode, flips it, and persists it
     FAIL  tests/unit/t9-mode-tokens.test.ts > T9-C3 … > leaves no mode-inert colour literal in the four Wave-0 product files
    HIT +   "…/apps/ui/app/globals.css:6116:background: color-mix(in srgb, #0a0806 32%, transparent);",
S02-C9 | vt=0 guard=0 VERDICT=0 |       Tests  112 passed (112) |  Test Files  10 passed (10)
S02-C9 | mergeArms: --scrim:=1 (expect 2)  S02markers=1 (expect 2)
run_c9 VERDICT=1
SET exit=0
 Test Files  17 passed (17)
      Tests  195 passed (195)
GUARDS | vt=0 guard=0 VERDICT=0 |       Tests  32 passed (32) |  Test Files  3 passed (3)
apps/ui tsc exit=0
```

| gate | pin | measured (worst of 3) | delta |
|---|---|---|---|
| `CMD-C6` | `1 passed (1)` | verdict **0**, `Tests 14 passed (14)` | at pin; its two S02 arms are vacuous here (`slice/consent-s02` **is** HEAD) |
| `CMD-C7` | `6 passed (6)` + t9 delta + one block | verdict **0**, `Tests 76 passed (76)` | at pin |
| t9 | `2 failed \| 7 passed (9)`, hit list = 1 at `:6116` | exactly that, both failures by NAME | at pin |
| `run_c9` vitest half | `Test Files 10 passed (10)` | `112 passed (112)` / `10 passed (10)`, exit 0 | at pin; overall VERDICT=1 is N3's two broken arms only |
| consent SET | 17 files | `17 passed (17)` / `195 passed (195)`, exit 0 | at pin |
| root typecheck | 8 in `s14-ui`, 0 outside | `n_tcran=1`, `tt=1`, outside the pin **0** | at pin |
| `apps/ui` project tsc (§10.30) | exit 0 | **exit 0** | at pin |
| the three source-text guard suites | 32/32 | `32 passed (32)` / `3 files` | at pin; **no guard weakened** — `consent-card.test.tsx` and `consent-guards.test.tsx` are not among the nine files, and `consent-policy-link.test.tsx`'s guard block is byte-identical (only an assertion was added, elsewhere) |

**The inline arm, done the way TRAPS `:2587` requires** — the guard's own terms typed into the tool
call, where `grep` is `ugrep 7.8.4` (confirmed in-call), not `zsh script.sh`:

```
term1 (Tests N passed, anchored) -> 0    GOOD -> 0   BAD "Tests 0 passed" -> 1   BAD title-pollution -> 1
term2 (no 'failed' in summary)   -> 1    fires on a failing summary -> 0
term3 (Test Files 1 passed (1))  -> 0    GOOD -> 0   BAD "2 passed (2)"   -> 1
t9 hit-list term                 -> GOOD 1, BAD 0
```

Every term is satisfiable in both directions and the two shells agree; no dialect split.

### 4. Boundaries

* **Exactly nine files**, matching the packet: `git diff --name-only c334136d..HEAD | wc -l` = **9**;
  `git diff --stat` = **347 insertions(+), 79 deletions(-)**.
* **No exported-shape change** — declaration-emit diff (TRAPS `:2616`, `--ignoreConfig`; the `TS2307`
  on `react` is harmless and expected), NOT an export grep (TRAPS `:2566`):
  `diff base-out/modalSemantics.d.ts head-out/modalSemantics.d.ts` → **empty**. The head surface is the
  same five members including the full `ModalSurface` body.
* **`globals.css` untouched**, so the block discipline is unchanged by construction; markers verified
  at `:7244` / `:7615` (S01) and `:7617` / `:8036` (S02), nothing after S02's close.
* **`consent-cross-slice.test.tsx`, `consent-card.test.tsx`, `consent-guards.test.tsx`,
  `CookieBar.tsx` untouched** (byte-identical, diffed).
* **`BASELINE.md` untouched by the seat**, and its conditional edit correctly resolved to "none
  exists": BASELINE names **neither** the old nor the new consent-bar case title.
* **`PROGRESS.md` / `PLAN.md` / `SPEC.md`** are untracked mission docs, absent from the commit;
  `PLAN.md` (22:51) and `SPEC.md` (19:09) predate the run entirely. `PROGRESS.md` (06:46) and
  `BASELINE.md` (06:46) were written at the orchestrator's own packet-writing minute, and the
  orchestrator is PROGRESS's sole lawful writer. **I cannot prove authorship of an untracked file** —
  recorded as such, not asserted.
* **Registration request shape unchanged:** `git diff c334136d..HEAD | grep -E 'register\(|adult_affirmed|privacy_accepted'` → **zero hits**.
* **No-touch surfaces:** the full `--name-only` list contains no `apps/api`, `packages/`,
  `migrations/`, `tools/`, `apps/runner`, `apps/scheduler` or `tests/integration` path (listed with
  **no pathspec**, then grepped — TRAPS `:1580`).

### 5. The flip list — exactly the three former inversion pins, nothing weakened

Comment-stripped code diff of both files against `c334136d`. `consent-modal-semantics.test.tsx`:
25 → **26** `it()`s. `consent-policy-link.test.tsx`: 14 → **14**.

| case | change | classification |
|---|---|---|
| `delivers one Escape to the LAST-REGISTERED surface of a pair mounted in ONE commit` → `…to the nested INNER surface…` | title rewritten; `outerClose 1 / innerClose 0` → `innerClose 1 / outerClose 0`; **plus a new premise assertion** that the inner container really is nested | **outcome changed + mechanism pin strengthened** |
| `…exactly one of three surfaces, and it is the last registered` → `…and it is the innermost` | title rewritten; `toEqual(["a"])` → `toEqual(["c"])` | **outcome changed**; still `toEqual` on the whole array, so it fails both if a second surface acts and if the wrong one does |
| `traps Tab in the same surface Escape reaches, for the same nested pair` | title **unchanged**; `labelled("outer-2")` → `labelled("close-inner")` | **outcome changed, title still describes its assertion** — the title names the agreement property, not an outcome. **Not weakened:** `outer-2` is still rendered and is exactly where Tab lands if the trap reads the OUTER entry; mutant M1 reds this case |
| `delivers Escape to a registered surface that renders NO container of its own` | **NEW** | pins CROSS-02 r1 N1; asserts both preconditions (the ref is `null`, the rival is rendered); mutant M4 reds it |
| `stays silent on Escape from the Settings entry when a valid decision is stored` | one `document.activeElement` assertion added inside the existing `it()` | CROSS-01 r1 N1; **no count moves** (COMMON §10.42), and 14 → 14 confirms it |

**No `expect` was deleted, no assertion loosened, no case removed.** The comment-stripped diff shows
exactly these five changes and nothing else.

### 6. Residue — verified, not trusted

| item | verdict |
|---|---|
| C9 r1 **N1** rename | Done. New title in `consent-bar.test.tsx`; old title survives only at `CODE-REV-S02-C9-r1.md:120`, which is the record and stays (**P5**) |
| C9 r1 **N2** duplicate-comment assertion in its own `it()` | Done. New `it("S02-S59 · writes no duplicated comment inside the S02 block")`; the three operands byte-unchanged |
| C9 r1 **N3** markers module | Done. All four literals live only in `tests/support/consentMarkers.ts`; both suites import from `../support/consentMarkers.js` (the `.js` extension — `node16`, TRAPS `:2214`); **no marker literal remains in either suite** |
| C9 r1 **N4** co-owner sentence | Done, and **on both sides**: `consent-bar.test.tsx` names the S02 contract case, `consent-s02-style-contract.test.ts` names `consent-bar` back |
| CROSS-01 r1 **N1** | Done, in the right case (`stays silent on Escape from the Settings entry when a valid decision is stored`), asserting `Cookie preferences` |
| CROSS-01 r1 **N3** "at close" | Done in all three: the `ModalSurface` member JSDoc (*"NOT A USABLE ELEMENT AT CLOSE"*), the card prop doc, and ADR-0022 by a **correcting addendum**, not an edit — which is the right shape for an ADR |
| CROSS-01 **P7** | Done. `manageRef` → **zero hits** repo-wide; `CookieBar.tsx` byte-unchanged and its `chooseRef` prop intact |
| CROSS-02 r1 **N1** null-container pin | Done, and it discriminates (M4) |
| CROSS-02 r1 **N5** `CookieConsent.tsx` comment | Done. Now states the arrangement is a recorded constraint and the mechanism is open order + containment, and quotes the sentences it replaces — good practice, and it costs nothing because the file's guards ban `Escape`/`.focus()`/`addEventListener`, all of which I re-ran myself (0 hits each) |
| the banned-token guards over the two reworded product files | Re-run **by me** with `grep -F` (TRAPS `:2008`): `CookiePreferencesCard.tsx` and `CookieConsent.tsx` → `addEventListener` 0, `.focus()` 0, bare `Escape` 0, `\bdocument\b` 0. `modalSemantics.ts` (the file that must CONTAIN them) → `addEventListener("keydown"` 1, `"Escape"` 1 (`:203`), `.focus()` 1 |

---

## What I did NOT verify

* **CROSS-02 r1 N4** (the DECISIONS correction line for the blind export grep) and the S02
  `DECISIONS.md` rows dated for CROSS-03 — the packet defers these to the appendix step; see below.
* **Anything in a real browser.** Every measurement here is jsdom 30.0.1 / React 19.2.8. The Esc
  stack, focus return and the `Tab` trap in a real browser are V's acceptance steps, not mine.
* **Roles and `aria-*`.** The packet's §2 lists "a11y claims (roles, focus, Esc) probed, not read"; I
  probed **Esc, Tab and focus routing through the shared helper**. `role="dialog"` / `aria-modal` /
  `aria-labelledby` on the two consumer components are unchanged by this commit (neither file's markup
  is touched) and I did not re-probe them.
* **Whether `t_4f97ca86` already records N3's diagnosis.** I did not read that ticket — out of my
  posting contract and irrelevant to the verdict; if the diagnosis is already there, N3 is a duplicate
  and should be closed as one.
* **The S01 lane and any Grok worktree.** Untouched, unread.

---

## Predictions (falsifiable evidence that blindness held)

I expect the other lenses to have **confirmed the four mutants and missed the two things that needed a
probe nobody was told to write**. Specifically: (1) I expect at least one lens to have ruled the
reflexive question **non-blocking on the reachability argument alone**, without running the
three-sharer case — P4 is the observation that changes the character of the finding, because a single
swap looks like a coin flip and a walk to the earliest-registered entry does not; (2) I expect **N1 to
be missed entirely** — the ADR's "four cases" claim is only falsifiable by reading M1's red list
against the ADR's sentence, and a lens that runs M1 to confirm the packet's charge (i) will see three
reds, tick the charge, and never compare the number to the ADR; (3) I expect **N2 to be missed**,
because M6 is not on anyone's charge list and a surviving mutant on an unlisted clause reads as noise;
(4) I expect at least one lens to have filed the surviving old-title hit at `CODE-REV-S02-C9-r1.md:120`
as a finding **against the author**, because the review packet's wording invites exactly that. The
first thing I would check in another lens's verdict is whether its reflexive ruling cites a
**measurement or an argument** — and if a measurement, whether it used two sharers or three.

---

---

## Appendix — the author's claims, opened AFTER the above was on disk (COMMON §10.52)

Read at this point and not before: the `READY FOR PEER REVIEW` comment on `t_ed4c5e73` (26,916
bytes), `BASELINE.md:49-51`, ADR-0022's two addenda, and the `[CODE-CROSS-03, 4ef2f7d3]`
TOOLING-TRAPS entries. **Nothing in this section changed a finding above.** My probe was written,
run ×3, mutated for its remedy and written to `<scratch>/MEASURED-FIRST.md` before any of it was
opened (P6(b) discloses the two sections I saw early and why the boundary was unknowable).

### Where we converge — and what that convergence is worth

| the author's | my independent measurement | status |
|---|---|---|
| **F4**: `CODE-CROSS-03.md:8` prescribes reflexive `Node.contains` for a rule worded "DESCENDANT"; two entries sharing one container would let the earlier one win; unreachable today; **shipped the packet's literal mechanism and did NOT add the guard**, because the `allowed` list grants exactly one new case and the divergence is "the orchestrator's to close, not a coding seat's"; *"If ruled for, it is one `&&` and one case — round-2 work"* | **B1**, measured, three runs | **The author is right on every count, and I am ruling FOR.** What I add is the thing F4 does not have: the behaviour **run**, not argued. It is not one swap — with three sharers the loop walks past both and reaches the earliest-registered. And the remedy is measured free (`17 files / 195 tests`, unchanged), so the "one `&&` and one case" estimate is confirmed, not assumed |
| **F3**: M2 also reds `delivers one Escape by OPEN order when two surfaces opened out of DOM order` | **P3**, same three-case red set across the same two files | **Independent convergence.** Two seats, no contact, identical measurement — stop re-deriving |
| **F2**: the `\bdocument\b` guard fired live on the packet-ordered reword; root cause is `:6`'s delta-read discharging by `wc -l`; remedy = "read the file IN FULL at CLAIM" | **P2 + P4** | **Convergence**, and the author has the stronger evidence: they paid for it. COMMON §10.67 already carries their remedy; my packet applies it |
| **F5**: `CMD-C6`'s two S02 arms are vacuous in this lane | my `CMD-C6` row | **Convergence**, third and fourth report |
| **§5's `run_c9` PROPERTY note**: `--scrim` is mode-independent and declared once; `'=== consent-ui S02 ==='` can never be 2 because the close marker reads `=== end consent-ui S02 ===` | **N3**, derived independently from `globals.css:65` and `:7617`/`:8036` | **Convergence — so N3 is NOT a new finding.** I downgrade it to a confirmed duplicate of the author's note, on `t_4f97ca86`. Recording it because two independent derivations of the same cause is the strongest signal this harness produces |
| **F1**: BASELINE names no consent-bar case title, so the conditional edit resolved to "none" | my BASELINE grep | **Convergence.** BASELINE untouched, correctly |

### Where I found what the author did not

* **N1 (ADR-0022 claims four pinning cases; three pin it).** The author's own M1 table names **three**
  failures — the same three I measured — and the ADR they wrote in the same commit says **four**. The
  gap is only visible by holding M1's red list against the ADR's sentence, and neither of us was
  charged to do that. It is the author's own measurement refuting the author's own prose.
* **N2 (pass 2's `!container.isConnected` disjunct is unreachable).** No mutant in the author's
  battery covers it; mine (M6) survives all 33 cases. Not a behaviour defect — a guard that cannot
  fail, in the ONE shared helper.

### Where the author found what I did not

* **F6** (`t_457c9898` still `ready` on a dead premise) and **F8**
  (`consent-cross-slice.test.tsx` is in no cluster command — *"the only test that would have caught
  B1"*) are board-state findings outside my probe surface; I did not read either ticket and I second
  both as stated. **F7** (no `CLAIMED — UNVERIFIED` row for `4ef2f7d3`) was true at their handoff and
  is now **discharged**: `BASELINE.md:51` carries it.
* **The old-title sweep.** The author swept `docs + .hermes` and found **six** hits; my packet sent me
  to `docs/missions/consent-ui/` and `<lane>/tests/` and I found **one**. Re-run their way, I confirm
  **six** — two packets, two `.at-dispatch` snapshots, two review-package diffs and two verdicts.
  Their test is the right one ("none is in BASELINE.md and none is in any PLAN.md, so the rename
  gates nothing"). **And the sixth hit is now MY OWN verdict file**, because P5 has to quote the old
  title to report the charge — which is TOOLING-TRAPS `:1409` exactly: *writing the correction makes
  the raw count go up.* P5 stands, strengthened.

### The author's `SKILLS LOADED` line, checked against the worker floor (`heartbeat-reviewer` §5)

Declared: `superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker,
superpowers:receiving-code-review, superpowers:test-driven-development,
superpowers:verification-before-completion, superpowers:systematic-debugging` — *"All seven loaded in
that order, in THIS session"*. The `heartbeat-protocol` §1 worker floor (TDD ·
verification-before-completion · systematic-debugging · receiving-code-review) is **met**, and COMMON
§10.39's extra requirement is satisfied and named. **No shortfall.**

I cannot grep another seat's transcript, so I check the line against the behaviour it should produce,
and it is consistent throughout: RED frames captured verbatim *before* the helper changed (TDD);
mutants classified with a positive control on the one survivor and restores proved by `diff -q`
(verification-before-completion); the `\bdocument\b` failure traced to `CODE-CROSS-03.md:6` rather
than patched blindly (systematic-debugging); every inherited finding verified rather than transcribed,
including N4's GX3 reproduced from a read-only in-memory string because `globals.css` was forbidden
(receiving-code-review). **Recorded as consistent, not as verified** — the transcript grep is the
orchestrator's.

### One honest note against my own predictions

My predictions paragraph says I expect a lens to rule the reflexive question from an **argument**
rather than a measurement. That is already confirmed once, on the author's side and lawfully: F4
reasons the mechanism out correctly and says *"deliberately unpinned"*, having never run the shape.
The author had a reason I did not — no granted test case — so this is not a charge against them. It
is evidence that the shape needed somebody whose contract let them run it, which is what a blind lens
with a scratchpad runner is for.

---

`comments read through: 2` on `t_5d7078fe` (the ORCHESTRATOR dispatch at 06:47 and my own CLAIM);
`5` on `t_ed4c5e73` at the appendix step.
