# CODE-CROSS-01 — self-report (murder case)

Seat `CODE-CROSS-01`, Claude Opus 5, mission `consent-ui`, ticket `t_c1068d6f`, board `consent-ui`.
Lane `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/consent-s02/dialectical-engine`,
branch `slice/consent-s02`, base `2127c4ad` (verified at CLAIM, porcelain 0).
Charge: the ONE cross-slice change — focus returns to the banner's opener (V-22, S01-R18's bar direction).

**Status of this file:** written incrementally from the moment the first product change landed
(COMMON §4b) and completed before the handoff. Commit `bd314084`; handoff is comment 6 on
`t_c1068d6f`, `comments read through: 5`.

---

## 1. The cause, and the one thing that mattered

The defect two reviewers measured is real and its mechanism is exactly as recorded
(CODE-REV-S01-C6 r1 B2): opening the card unmounts the bar in the same commit, the platform moves
focus to `document.body` before any hook tier runs, so `useModalSurface`'s captured opener is
`body` and the bar that returns is a fresh node. Nothing about that needed re-deriving; the r1
reviewer's fixture measurement (`useLayoutEffect` also sees `body`; a parent-owned ref is attached
and connected at passive-cleanup time) held under my own runs and saved me a probe.

**What the record did NOT contain, and what this seat's whole cost was, is the PRECEDENCE.**

V-22's default, the r1 reviewer's remedy sentence, and my packet all state the rule the same way:

> on close the helper focuses that control if it is on the page, else the original opener, else nothing.
> (`docs/missions/consent-ui/V-DECISIONS-PACKET.md`, row V-22, "Default taken")

Implemented literally, that **breaks the other direction of the same requirement**, and it does so
in a case every one of those three documents believed was safe. My packet even asserts the safety
as a fact:

> For the Settings entry the ref is null/disconnected → the captured opener path returns focus to
> `Cookie preferences` exactly as today.
> (`.hermes/planning/consent-ui/packets/CODE-CROSS-01.md` §2.2)

That sentence is FALSE for the Settings entry with **nothing stored**. S01-R14 makes the returning
bar a function of the STORED DECISION and not of the entry point (that is REQ-REV-01 B1's whole
point), so dismissing the card opened from Settings with no valid decision brings the bar back —
which re-attaches the very ref the bar direction needs, connected and fresh, while
`Cookie preferences` is also still on the page. Named-ref-first then hands the Settings entry's
focus to the bar's control.

**Measured, not reasoned:** the pre-existing case
`consent-policy-link.test.tsx:308 "returns focus to the Settings opener when the card closes"`
went RED the first time I ran the packet's literal mechanism —
`expected <button …>Choose what to store</button> to be <button …>Cookie preferences</button>`.
The packet's own §2.4 orders "Keep the Settings direction green", so **the packet contradicts
itself**: its mechanism cannot satisfy its gate.

**The fix is a re-ordering, not a different remedy.** The helper asks which candidate SURVIVED the
opening commit: the captured opener wins whenever it is a real element still in the document, and
the named control serves only when it is not. `document.body` counts as "did not survive", because
`body` is the degenerate value `document.activeElement` takes when nothing holds focus — and it is
exactly what the capture becomes for the class this member exists for. Both directions of S01-R18
are then met by one rule, and V-22's own worked EXAMPLE — which states both outcomes in consecutive
sentences — is satisfied in full for the first time.

This stays inside V-22 option (a): one optional member, the helper still the sole owner of focus,
no focus call in any consumer. Only the precedence differs, and the difference is measured.

## 2. What we must upgrade

1. **A V-row default is a DESIGN, and nobody runs a design.** V-22's default, the r1 reviewer's
   BINDING remedy and my packet all carry the same precedence sentence, and all three are wrong in
   the same way — three mutually-confirming documents, one unexamined assumption, zero
   measurements. The r1 reviewer measured the thing that was easy to measure (is the ref attached
   and connected at cleanup? yes) and stated the precedence as if it followed. It does not.
   **Upgrade:** when a row's default names an ORDER of preference, the row states the case
   analysis that order implies — one line per reachable combination — or it is marked
   `ORDER UNMEASURED`. Here that would have been four lines (bar/Settings × stored/not stored) and
   the third line is the defect.
2. **The interaction that broke it is a documented requirement of the OTHER slice.** S01-R14's
   "the discriminator is the stored decision, never the entry point" is the reason the bar comes
   back from the Settings entry. A cross-slice packet should carry the requirements of both slices
   that the change can COLLIDE with, not only the ones it implements. Mine carried R18 and R14 by
   name but never crossed them.
3. **`heartbeat-worker` §2's refutation duty caught this for free, and only because the suite it
   ran was the WHOLE file.** Had the packet's gate been "run the new case", the regression would
   have shipped green. Keep whole-file cluster commands; never narrow a gate to the case under
   construction.

## 3. Where the packet was unclear or wrong (findings against the orchestrator)

- **`.hermes/planning/consent-ui/packets/CODE-CROSS-01.md` §2.1 + §2.2 + §2.4 — self-contradictory,
  and §2.2 states a false fact.** Detailed above. This is COMMON §10.6's self-contradiction charge
  arriving on a coding packet: the packet's mechanism sentence and its gate sentence cannot both be
  obeyed. Price: one wasted GREEN attempt (~4 min) plus the root-cause work; cheap only because the
  existing Settings case existed to fail.
- **`.hermes/planning/consent-ui/packets/CODE-CROSS-01.md` §2 line citing `CookieBar.tsx:61`** — `:61`
  is the button's LABEL text; the element opens at `apps/ui/components/consent/CookieBar.tsx:56`
  (base `2127c4ad`). COMMON §10.24 requires the citation be produced by `grep -n` at packet-write
  time. Cost: nil (I read the file), but it is the same class §10.24 was written for.
- **`.hermes/planning/consent-ui/packets/CODE-CROSS-01.md` §2.3 predicts TWO new cases in
  `consent-modal-semantics.test.tsx`.** Four shipped, because the corrected precedence has more
  clauses than the packet's does and each one needs a pin. COMMON §10.42's rule ("counting claims
  about a seat's tests are the seat's to measure, never the packet's to predict") applies to the
  packet's own case count as much as to a `Tests N` figure.
- **`CMD-C6`'s S02-file arms are DEGENERATE in this lane, and the packet predicted the opposite.**
  §2.4 says the `n_s02c` arm "will now legitimately count THIS commit". Measured **0**, six runs.
  `CMD-C6` re-derives `s02tip=$(git rev-parse --verify -q slice/consent-s02)` and this lane IS that
  branch, so `s02tip` resolves to HEAD and `HEAD..HEAD` is empty; the working-tree arm is empty once
  committed. An S01-lane command run in the S02 lane passes without ever exercising its property.
  Second face of `CODE-REV-S01-C6 r1` N1's moving-ref defect (docs residue `t_38c6bbf2`).
- **`.hermes/planning/consent-ui/packets/CODE-CROSS-01.md` §2.3's mutant list** names
  "`isConnected` guard removed → the disconnected case RED". Under the corrected precedence there
  are TWO `isConnected` guards (one per candidate) and they need different fixtures; the guard on
  the NAMED control is not discriminable by `document.activeElement` at all, because focusing a
  detached node and focusing nothing leave it identical. See §5.

## 4. Dead ends, so nobody re-derives them

- **Making the disconnected-named-ref case RED at base is impossible, and it is not a test defect.**
  The base helper reads no such member, so any "the member behaves thus" case passes there
  vacuously. The lawful RED for such a case is the MUTANT, and it must be declared as such rather
  than folded into a base-RED claim.
- **`useLayoutEffect` does not rescue the capture** — already measured by CODE-REV-S01-C6 r1 and
  re-confirmed here by the shape of the base RED (`activeElement` is `body` at cleanup). Do not
  spend another probe on hook tiers.
- **Discriminating the named control's `isConnected` guard behaviourally is impossible in jsdom.**
  `focusElement(detached)` is a no-op and leaves `document.activeElement` exactly where focusing
  nothing leaves it. The only honest pin is a spy on that node's `focus`, and the case says so in
  its own comment so a reviewer does not read the spy as an accidental mock assertion.
- **Entry-point state in `CookieConsent` (pass the ref only for the bar entry) is the wrong fix**
  even though it works: it re-introduces the discriminator REQ-REV-01 B1 removed, and it fixes one
  consumer instead of the class the r1 reviewer's ruling names. Rejected before implementation.

## 5. Refutation evidence, gates, prices

Commit `bd314084` on `slice/consent-s02`, parent `2127c4ad`, 7 files, porcelain 0.

**Eight mutants, each applied by `cp`-snapshot + python substitution and restored by `cp` + `diff -q`
(never `git checkout --`; TOOLING-TRAPS `:2111`), `git status --porcelain` printed after every restore
and clean every time.**

| # | mutant | caught by | verdict |
|---|---|---|---|
| M1 | the whole preference removed (cleanup back to `focusElement(opener)`) | 3 cases (2 helper, 1 S01) | CAUGHT |
| M2 | `opener !== document.body` dropped from the survival test | 2 cases (1 helper, 1 S01) | CAUGHT |
| M3 | `opener.isConnected` dropped from the survival test | 1 case (capture-left-the-page) | CAUGHT |
| M4 | `named.isConnected` dropped | 1 case, and ONLY by its `focus` spy | CAUGHT |
| M5 | `ref={chooseRef}` dropped from the bar's control | the S01 bar case | CAUGHT |
| M6 | `returnFocusRef={manageRef}` dropped from the card | the S01 bar case | CAUGHT |
| M8 | **the packet's / V-22's literal precedence (named control first)** | the ordering case + the PRE-EXISTING Settings case | CAUGHT |
| M7 | NEIGHBOUR: the same rule rewritten as one ternary `focusElement(survived ? opener : fallback)` | — | SURVIVED (correct: 38 passed) |

M8 is the finding's own proof: it is not a synthetic mutation, it is the mechanism three documents
specify, and it takes an earlier seat's green case RED.

**Three-run tables — every figure identical across 3 runs from a `.sh` under `/bin/bash` AND 3 runs
inline in the tool shell (COMMON §10.16), six runs total, worst = best.**

| command | commit | verdict | summary |
|---|---|---|---|
| `run S02-C1 1 consent-modal-semantics` | `bd314084` | **0** | `Tests 24 passed (24)` · `Test Files 1 passed (1)` |
| `CMD-C6` | `bd314084` | **0** | `Tests 14 passed (14)` · `Test Files 1 passed (1)` · n_s02c 0 · working-tree diff none · tsc outside pin 0 |
| `CMD-C7` | `bd314084` | **0** | `Tests 76 passed (76)` · `Test Files 6 passed (6)` · hit-list 1 (pinned 1) · t9 failures 2 · S01 css blocks 1 |
| `run_c9 10 …` (vitest half) | `bd314084` | **0** | `Tests 109 passed (109)` · `Test Files 10 passed (10)` |
| `run_c9` as written (merge arms) | `bd314084` | **1** | `--scrim:=1 (expect 2)` `S02markers=1 (expect 2)` — the KNOWN PLAN defect `t_4f97ca86`, inherited; this commit changes no stylesheet (`git diff --stat 2127c4ad..bd314084 -- apps/ui/app/globals.css` = 0 lines) |
| the 16 consent-related suites together | `bd314084` | 0 | `Tests 185 passed (185)` · `Test Files 16 passed (16)` |
| `apps/ui` project tsc | `bd314084` | 0 | exit 0 |
| root `pnpm typecheck` | `bd314084` | pin | 8 diagnostics, **0 outside** `tests/unit/s14-ui.test.ts` |

**Deltas against the pinned figures:** `consent-modal-semantics` 20 → **24** (four new `it`s);
`consent-policy-link` 14 → **14** (one case REPLACED, so no count moves — COMMON §10.42); the ten-file
`run_c9` set 105 → **109**; the sixteen-file set 181 → **185**; `CMD-C7` 76 → **76** and `Test Files 6`
unchanged; typecheck, t9 hit list, and the three RED-at-base stylesheet suites unchanged (no CSS in the
diff). `run_c9`'s PROPERTY, re-measured rather than quoted: `--scrim:` 1 (`globals.css:65`), S01
open/end 1/1 (`:7244`/`:7615`), S02 open/end 1/1 (`:7617`/`:8036`), S01's end before S02's open, 0 lines
after S02's end (file is 8036 lines) — the property holds; only the PLAN's constants are wrong.

**Positive assertion of lane containment (BASELINE rule 4), in its strongest form:** editing the LANE's
`modalSemantics.ts` flipped the suite RED and restoring it flipped it GREEN, in the same session —
the lane's copy is demonstrably the module under test, not a matching count.

**Export diff, base vs HEAD**, produced by `tsc --declaration --emitDeclarationOnly` on both revisions
and diffed with comments stripped — exactly one line, and it is the optional member:

```
5a6
>     returnFocusRef?: React.RefObject<HTMLElement | null>;
```

**Prices.**
- The precedence defect: ~12 min (one wrong GREEN attempt, root cause, redesign of two of the four
  cases, re-RED, re-GREEN). Cheap only because an earlier seat had written the Settings case.
- The `\bdocument\b` guard trip: ~2 min plus one 10.6s sixteen-file run. Entirely avoidable by
  sweeping the banned tokens BEFORE writing a comment, which is now a trap entry.
- Everything else ran first time. No dead-end probe was built: the r1 reviewer's fixture measurements
  were reusable as stated, which is the single biggest saving in this seat's run and an argument for
  reviewers pasting mechanism tables.

## 6. How this becomes more of a one-prompt machine

1. **Ship the case analysis with the row, not the mechanism.** See §2.1. The single highest-value
   change visible from this seat: a V row whose default encodes an ORDER carries its truth table.
2. **A cross-slice packet lists the collisions, not just the deliverable.** A one-line "requirements
   of the other slice this change can collide with: S01-R14 (the bar returns on stored-decision, from
   EITHER entry)" would have made this seat's whole detour a five-minute read.
3. **Keep the pre-existing case in the gate.** The thing that turned a shipped regression into a
   four-minute correction was a whole-file command and a case written by an earlier seat. Every
   argument for narrowing a gate to "the file you touched" is an argument for shipping this class.
