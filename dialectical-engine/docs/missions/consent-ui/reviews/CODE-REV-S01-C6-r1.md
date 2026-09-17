# CODE-REV-S01-C6 — round 1 verdict (mission `consent-ui`, slice S01, cluster C6)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging, superpowers:receiving-code-review`

**Verdict: REWORK** — one blocking finding (**B1**), one blocking finding that is **not
C6's to fix** (**B2** = the author's C6-F1, remedy class ruled below), six non-blocking.
Round 1 of max 3.

**Work under review:** ticket `t_f46592b6`, seat CODE-S01-C6. Commits `abcc388d` (C5
follow-up) and `ab449cba` (S01-C6), HEAD `ab449cba`, base `92828aa5`.
**My worktree:** `/Users/…/.worktrees/rev-s01-c6/dialectical-engine`, detached at
`ab449cba`. `git status --porcelain` = **0 entries** at CLAIM and at handoff.
`pnpm run generate:contract` exit 0, tree stayed clean.
**Probe kit promoted BEFORE this verdict:** `.hermes/reports/consent-ui/probes/code-rev-s01-c6-r1-*`
(7 files; grepped for `\.worktrees/` → 0 hits, lane-agnostic per COMMON §10.35).

---

## 1. Packet review (`heartbeat-reviewer` §1) — the packet is reviewed FIRST

The dispatching packet is `.hermes/planning/consent-ui/packets/CODE-S01-C6.md`; I diffed it
against `snapshots/packets/CODE-S01-C6.md.at-dispatch` — **byte-identical**, so the seat read
these words.

**Every quoted constant checked against the artifact it claims to quote.** Six of seven
`path:line` citations resolve EXACTLY at the commit they name (`grep -n`, in my worktree):

| Packet citation | Measured | |
|---|---|---|
| `CookieConsent.tsx:182-183` — the modal element after the card | `:182 {policyOpen && (` / `:183 <PrivacyPolicyModal …/>` | OK |
| `CookiePreferencesCard.tsx:97-101` — `useModalSurface` | `:97-101`, exactly the five lines | OK |
| `CookiePreferencesCard.tsx:125` — `backdropCloseHandler` | `:125` | OK |
| `modalSemantics.ts:165-168` — `activeElement` captured in `useEffect` | `:165 React.useEffect(() => {`, `:168 const opener = document.activeElement` | OK |
| `CookieBar.tsx:61` — `Choose what to store` | `:61` | OK |
| `CookieConsent.tsx:87,:130` — the two decision points at commit 1 | `git show abcc388d:…` → `:87`, `:130` | OK |
| `PrivacyPolicyModal.tsx` `addEventListener` at **`:114,:118`** | measured **`:118`** (`scroll`) and **`:122`** (`resize`); the file is byte-identical to `44744d8d` | **P5 — drift** |

**The `allowed` list vs the deliverables:** the four files actually changed are exactly the
four the packet grants — `git diff --name-only 92828aa5..ab449cba` returns
`CookieConsent.tsx`, `CookiePreferencesCard.tsx`, `consent-mount.test.tsx`,
`consent-policy-link.test.tsx` and nothing else. `globals.css`,
`packages/contract/src/client.ts` and `SignUpFlow.tsx` are untouched (empty diff-stats);
the diff contains **0** added/removed lines matching `register\(|adult_affirmed`.

**Packet findings (P1–P5). All four the author reported are CONFIRMED; P5 is new.**

- **P1 (= author F2, CONFIRMED, blocking on the COMMAND not the code) — `CMD-C6`'s
  `n_s02c` arm pins a MOVING ref.** See B-list N1 below for the measurement. This is
  `ARCH-REV-S01 N6`'s class verbatim (repaired in `CMD-C5`, not in `CMD-C6`) and it is a
  **PLAN defect**, not the seat's: a coding seat may not edit `PLAN.md` to unblock itself, so
  running the command verbatim and reporting verdict 1 was the correct act.
- **P2 (= author F3, CONFIRMED) — the §2(8) ripple contradiction.** §2(8) orders
  "`consent-mount` stays 11/11" while the `allowed` list confines that file to the FIRST
  commit; the two cannot both hold once the card consumes the helper. **I verified the edit
  in `ab449cba` is exactly the one case and nothing else:** `git show ab449cba --
  tests/render/consent-mount.test.tsx` is a single hunk at `@@ -358,22 +358,28 @@` changing
  one `it()` title, its comment block, and two assertions. **Charged to the packet, not the
  seat** (`COMMON` §10.27: the ripple a class forces is DECLARED, not forbidden — the author
  declared it).
- **P3 (= author F4, CONFIRMED) — wrong relative path in §Orchestrator addition.**
  `.hermes/reports/consent-ui/reviews/` **does not exist**; the file is
  `docs/missions/consent-ui/reviews/CODE-REV-S01-C5-r1.md`. A same-basename decoy DOES exist
  at `.hermes/reports/consent-ui/agent-reports/CODE-REV-S01-C5-r1.md` (198 lines, so the
  quoted `:230-273` is past its end and returns nothing **silently**). Already codified as
  `COMMON` §10.45; recorded here because the correction had not reached this packet.
- **P4 (= author F5, CONFIRMED) — §2(4)'s guard wording is broader than the PLAN's.**
  Measured: `PrivacyPolicyModal.tsx` contains `addEventListener` twice; `S01-S42`/`S01-S45`
  exclude S02's two files **by name**, the packet's wording does not. `COMMON` §10.43 now
  requires verbatim transcription of PLAN guards. Binding on **C7's** packet.
- **P5 (NEW, non-blocking) — the `:114,:118` citation above.** `COMMON` §10.24's class,
  inherited from the author's handoff into the review packet without re-measurement. The
  substance of F5 is unaffected (the file does contain the token; only the line numbers are
  wrong).

**Author's `SKILLS LOADED` vs the worker floor** (`heartbeat-protocol` §1 + `COMMON` §10.39):
seven declared — `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`,
`test-driven-development`, `verification-before-completion`, `receiving-code-review`,
`systematic-debugging`. That is the full floor plus §10.39's `receiving-code-review` (their
first commit discharged another lens's numbered finding). **No shortfall.** I cannot grep
another session's transcript; the orchestrator's body grep found all seven (packet
§Boundaries) and I cite that rather than claim it.

---

## 2. Findings

### B1 — BLOCKING. The deleted `setPolicyOpen(false)` guards a REACHABLE transition; the card can be closed while the policy is open, and the next open shows the policy unbidden.

**File:line.** `apps/ui/components/consent/CookieConsent.tsx:89` (the flag),
`:114-119` (`openCard`, from which the reset was deleted), `:180` (`onRequestPolicy`),
`:182-183` (the conditional element). The justification is at **`:80-87`**, and its
load-bearing clause is `:84-85`:

> `…while the policy is open it is the topmost surface, it owns the keystroke, and its scrim covers every control of the card.`

**Concrete inputs → wrong outcome** (three routes, all measured):

1. Mount `<CookieConsent/>` with nothing stored → click `Choose what to store` → click
   `Privacy notice` → **dispatch a click on the card's own `.consentScrim`** → the card is
   dismissed through `backdropCloseHandler` and the policy unmounts with it, but `policyOpen`
   is still `true` in the still-mounted `CookieConsent`. Click `Choose what to store` again →
   **the card opens WITH the policy modal over it**, `document.querySelectorAll('[role="dialog"]').length === 2`,
   on a card the visitor opened fresh.
2. Same through Settings with a valid decision stored, closing the card via `Save choices`
   instead of the scrim → identical stranding.
3. **CONTROL:** close the policy the normal way first (`Close`), then dismiss the card, then
   reopen → clean, one dialog. So the defect is exactly the stranded flag, not the reopen path.

**Evidence.** `probes/code-rev-s01-c6-r1-policy-flag.test.tsx`, 4 cases, `Tests 4 passed (4)`
at HEAD `ab449cba` — the cases ASSERT the stranding, so green means the defect is present.

**Why the author's mutant M8 missed it.** M8 (delete the line) left the suite at
`11 passed (11)` because **no case in `consent-policy-link.test.tsx` ever closes the CARD while
the policy is open**. A surviving mutant is evidence about the SUITE's coverage, not about
the line. The reopen case (`does not bring the policy back with a reopened card`) closes the
policy FIRST — it walks the clean path, which is my control case 3.

**Why the premise fails.** The clause "its scrim covers every control of the card" is a CSS
claim, and **that CSS does not exist in this lane**: `apps/ui/app/globals.css` at HEAD
contains one delimited block (`=== consent-ui S01 ===` at `:7244`), **no `=== consent-ui S02 ===`
block, and no `.policyScrim` / `.policyBezel` / `.policyCard` rule at all** — measured by a
line-scan for `^\s*\.policy[A-Za-z]*\s*[,{]` returning `[]`, and confirmed against
`slice/consent-s02`'s own tip `9cc81351` (0 hits) and `44744d8d` (0 hits). The z-index tokens
S01-C1 declared for that stylesheet (`--z-policy-scrim: 77`, `--z-policy-card: 78`,
`globals.css:94`) are **declared and unconsumed**. So today `.policyScrim` is a static-flow
`div` with no stacking context, while `.consentScrim` is `position: fixed; inset: 0;
z-index: var(--z-consent-scrim)` (`globals.css:7384-7393`) — the card's scrim is on top and
takes the click. The safety argument terminates in another slice's unwritten file.

**CLASS.** *A defensive reset deleted because no mutant is observable, where the mutant
requires driving a state transition no existing case drives — and whose safety argument rests
on an unverified cross-slice fact.*
**Sweep of every member of the class in `CookieConsent.tsx`** (per §2.2, so it is checkable
mechanically, not re-derived): the machine holds five pieces of per-open state.
`initial` — recomputed from storage in `openCard:116`, **not affected**. `opens` —
monotonic, used as the card's `key`, **not affected**. `openerRef` — assigned in
`openCard:115` on every open, **not affected**. `surface` — the transition itself, **not
affected**. **`policyOpen` — the only member never reset at open: AFFECTED, and it is the
sole member of the class.**

**REMEDY — `BINDING (measured: probes/code-rev-s01-c6-r1-policy-flag.test.tsx, 4 cases, run
against HEAD ab449cba; the cases assert the stranding and are GREEN, and the CONTROL case
proves the clean path is unaffected)`:** restore `setPolicyOpen(false)` as the first statement
of `openCard` **and ship the pin that makes it observable** — a case in
`consent-policy-link.test.tsx` that opens the card, opens the policy, closes the CARD by the
scrim, reopens, and asserts `.policyBezel` is null and `[role="dialog"]` count is 1. Watch it
RED with the line absent and GREEN with it restored; that is the mutant M8 could not find.
Both files are inside C6's `allowed` surface, so this is dischargeable in the rework round.
**Do not** instead argue the CSS will land later: a component whose correctness depends on an
unwritten stylesheet in the other lane is not verifiable by this slice's gate, and V's
acceptance runs in the dev stack **today**.

### B2 — BLOCKING for S01-R18 as written, and NOT dischargeable inside C6. (= author's C6-F1, CONFIRMED; the remedy class is ruled here.)

**File:line.** `apps/ui/components/consent/modalSemantics.ts:165-176` (the effect captures
`document.activeElement` at `:168` and restores it at `:176`); `CookieConsent.tsx:151-153`
(the bar/card mutual exclusion); `CookieBar.tsx:61` (the opener). `SPEC.md` S01-R18: "Focus
returns to the control that opened it — `Choose what to store` on the bar, or
`Cookie preferences` in Settings."

**Concrete inputs → wrong outcome.** Focus `Choose what to store`, click it, press Escape:
the card closes, the bar returns, and `document.activeElement === document.body`. The Settings
direction is MET (measured green). The author reported this honestly as a MEASUREMENT case
rather than claiming R18 satisfied — that is the correct discharge of §2.7 and I am not
charging it as a concealment.

**Mechanism — MEASURED, and it is NOT the effect timing.** `probes/code-rev-s01-c6-r1-focus-mechanism.test.tsx`,
a synthetic fixture importing no consent component, instruments one commit that swaps a
focused opener for a modal:

| Observation point | Measured |
|---|---|
| modal's RENDER phase | `activeElement` is **not** body — the opener still holds focus |
| modal's `useLayoutEffect` | `activeElement.tagName === "BODY"` |
| modal's `useEffect` | `activeElement === document.body` |
| the opener node | `isConnected === false` |

**So `useLayoutEffect` would NOT see the opener.** The layout phase runs after the mutation
phase, the bar is already detached, and the platform has already moved focus to `body`. **The
cause is the UNMOUNT, not the hook tier** — every hook-based capture is too late, and only a
capture taken at EVENT time (inside the click handler, before `setSurface`) could see it.

**Remedy (a)'s feasibility — MEASURED, and it WORKS.** The same fixture reads a
parent-owned ref at the modal's **passive-cleanup** moment, which is where the helper calls
`focusElement(opener)`: `tagName === "BUTTON"`, `isConnected === true`, and it is the **FRESH**
node, not the detached one. React attaches refs in the layout phase of the same commit that
remounts the bar, and passive cleanup runs after it — so an optional fourth `ModalSurface`
member (`returnFocusRef`) that the helper **prefers on cleanup when it is connected** would
land focus on the returning bar's real button.

**RULING on the remedy CLASS for the V row (two sentences, as charged).** Take **(a)** — an
OPTIONAL fourth `ModalSurface` member the helper prefers on cleanup when
`returnFocusRef.current?.isConnected`, falling back to the captured opener — because it is the
only remedy that fixes the CLASS (*any* surface whose opener is unmounted by the same commit
that opens it, which is every mutually-exclusive surface pair this codebase will ever build,
including the seven overlays of `A11Y-OVERLAYS`) rather than this one instance, and because
the measurement above shows the ref is attached and connected exactly when the helper needs
it. Reject **(b)** — the returning bar focusing itself in `CookieBar.tsx` — because it moves
focus from OUTSIDE the one helper that `SPEC §Out of scope` and `S01-S45` make the sole owner
of focus, buying one surface at the cost of the invariant; and reject **(c)** — accept `body`
— because R18 states the requirement in both directions and a silent half is a SPEC change,
not an implementation choice.

**REMEDY — `ADVISORY` for C6 (it is out of this cluster's surface: `modalSemantics.ts` is
S02's and the interface is cross-slice), `BINDING (measured: probes/code-rev-s01-c6-r1-focus-mechanism.test.tsx,
2 cases, GREEN at ab449cba)` on the routing:** file a V row for the optional `returnFocusRef`
member and a ticket against one seat AFTER the C9 merge; **do not attempt it in C6's rework
round**, and do not accept a fix written in `CookieBar.tsx`. Until it lands, R18's bar
direction is UNMET and must be visible to V as such, not silently green.

### N1 — `CMD-C6`'s `n_s02c` arm is un-passable through no act of S01's (= author F2). Confirmed by measurement.

`PLAN.md`'s `CMD-C6` block re-derives `s02tip=$(git rev-parse --verify -q slice/consent-s02)`
— a **live branch ref**. Measured in my worktree, from a `.sh` under `/bin/bash` with literal
paths (`probes/code-rev-s01-c6-r1-s02arm.sh`):

| `A` in `git log --oneline A..HEAD -- <4 S02 paths>` | `n_s02c` | ancestor of HEAD? |
|---|---|---|
| `44744d8d` — the SHA actually merged | **0** | yes |
| `e0666a79` / `511d30b6` / `9cc81351` (later S02 tips) | **1** | no |

The one commit counted is **`92828aa5`, the merge itself**, and
`git diff --stat 44744d8d..ab449cba -- <the four paths>` is **EMPTY** — it changed none of
them. Mechanism: with path filtering, git's default history simplification prunes a merge
that is TREESAME to a parent and follows that parent; when the range EXCLUDES that parent the
merge surfaces against the other one, where the files are new.

**The one sentence for the docs residue (`t_38c6bbf2`) to transcribe:**
`CMD-C6's RED is the COMMAND's defect and not the code's: its n_s02c arm re-derives the live branch ref slice/consent-s02, and the instant that branch commits past the merged SHA the arm counts the merge commit 92828aa5 itself — measured 1 against every later tip and 0 against 44744d8d, the SHA actually merged, whose diff for the four S02 paths is empty.`

**REMEDY — `BINDING (measured: the table above, run ×5 boundaries under /bin/bash)`:** in
`PLAN.md`'s `CMD-C6` block replace the ref derivation with the merged SHA — `s02tip=44744d8d`
(or `s02tip=$(git rev-parse --verify -q HEAD^2)`, which resolves the merge's own S02 parent
and cannot move). Keep the `st` exit-code arm so a bad SHA cannot pass vacuously. **This is
the PLAN's fix, routed to architecture/the orchestrator — NOT the coding seat's**, and the
rework round must not be gated on `CMD-C6` reading 0 until it lands.

### N2 — §2(8)'s ripple contradiction (= author F3). Charged to the packet.
Verified above (P2): the `consent-mount.test.tsx` edit in `ab449cba` is exactly the one case's
title, comment and two assertions, and nothing else. **REMEDY — `ADVISORY`:** the C7 packet
states the ripple axis it has actually measured (`COMMON` §10.27) and puts every file a
commit may touch in ONE exhaustive `allowed` list tagged per commit (`COMMON` §10.41).

### N3 — the packet's wrong relative path (= author F4). Charged to the packet. `COMMON` §10.45 already codifies the class; **REMEDY — `ADVISORY`:** apply §10.45 to the C7 packet before dispatch.

### N4 — §2(4)'s over-broad guard wording (= author F5). Charged to the packet, binding on **C7**.
**Confirmed both halves.** The two shipped C6 files carry **0** occurrences of
`addEventListener`, `.focus()` and `Escape`, comments included:

```
CookieConsent.tsx:          addEventListener 0   .focus() 0   Escape 0
CookiePreferencesCard.tsx:  addEventListener 0   .focus() 0   Escape 0
```

and `PrivacyPolicyModal.tsx` (S02's, excluded BY NAME by S01-S42/S01-S45) carries
`addEventListener` at `:118` and `:122`. **REMEDY — `BINDING (measured: the grep above, at
HEAD ab449cba)`:** C7's packet quotes S01-S45's selector list and its named exclusions
verbatim (`COMMON` §10.43); the wording "any file under `apps/ui/components/consent/` other
than the helper" would make C7 unpassable.

### N5 — the line-citation drift `PrivacyPolicyModal.tsx:114,:118`. Measured `:118,:122`. `COMMON` §10.24's class, inherited from the handoff into the review packet. **REMEDY — `ADVISORY`:** re-measure inherited citations before transcribing them.

### N6 — "re-expressed rather than copied" understates the seed table.
The packet charges me to say whether the author copied the promoted r1 kit or re-expressed
it. **Measured:** the author's `INVALID_SEEDS` block is **not** present verbatim in
`probes/code-rev-s01-c5-r1-rev-state-machine.test.tsx`, but **9 of its 12 lines are
byte-identical** to that kit's `INVALID` array — the three that differ are the `const`
declaration and two reworded labels (`a sixth key`→`a sixth member`, `a missing key`→`a
missing member`). The surrounding harness IS the file's own idiom (`mountConsent` /
`mountSettings` / `dismissCard`, not the kit's `button[data-rev="dismiss"]`). **The honest
description is HYBRID: the data table copied, the property re-expressed** — which is the right
engineering (the ten shapes ARE V-19's class) but not what "re-expressed … rather than
copied" says. **REMEDY — `ADVISORY`:** one corrected sentence in the record; no code change.

---

## 3. What I verified, and HOW (verbatim)

**Three-run tables, in MY worktree, from a `.sh` under `/bin/bash` AND inline in the tool
shell (zsh), commands extracted programmatically from `PLAN.md`'s fenced blocks (0 non-ASCII
bytes in either).**

**`CMD-C6` — worst = verdict 1, all six runs identical:**
```
S01-C6 verdict=1   summary:      Tests  11 passed (11)  files: Test Files  1 passed (1)   S02-files: ref resolved 0, commits in 9cc81351318cdb10acb655dbb34eef4f87e19676..HEAD touching them: 1, working-tree diff: 'none'   tsc ran: 1 exit 1, outside the pin: 0
```
Every arm passes except `n_s02c` (N1). Sub-commands proved genuine, not vacuous:
`Test Files 1 passed (1)` with all 11 case names printed, and `pnpm typecheck` exit 1 with
**exactly the 8 pinned diagnostics, all in `tests/unit/s14-ui.test.ts`** (2×TS2307, 2×TS18046,
2×TS2339, 2×TS7006 — the BASELINE pin), **0 outside the pin**.

**`CMD-C5` — worst = verdict 0, all six runs identical:**
```
S01-C5 verdict=0   summary:      Tests  4 failed | 58 passed (62)  files: Test Files  1 failed | 2 passed (3)   failures: 4 (unpinned: 0)  guarded-green: 2  consent-mount lines: 31 (failing: 0)  hit-list: 1   tsc ran: 1 exit 1, outside the pin: 0
```
The four failures are exactly the pinned set, by name:
```
 FAIL  tests/render/t3-library.test.tsx > lists > renders recased native selectors and a live count for the four Your debates rows
 FAIL  tests/render/t3-library.test.tsx > lists > renders a live count for the three Public debates rows
 FAIL  tests/render/t3-library.test.tsx > lists > renders every library row as a shell/core bezel
 FAIL  tests/render/t3-library.test.tsx > lists > renders the public search-indexing disclosure once under the list and never on Yours
```
Pre-existing, BASELINE 2026-09-06 20:15, another mission's.

**The C5 follow-up (`abcc388d`) — RM2/RM3 planted BY ME** (`cp` snapshot before, `cp` restore
after, `diff -q` clean, porcelain 0 after each), at the two decision points:

| mutant | `consent-mount.test.tsx` | first failure named |
|---|---|---|
| RM2 at the MOUNT point | `Tests 20 failed \| 11 passed (31)` | `shows the bar at mount with a future version stored — present is not valid` |
| RM3 at the DISMISS point | `Tests 10 failed \| 21 passed (31)` | `returns the bar when the card is dismissed from the SETTINGS entry with a future version stored` |
| HEAD, unmutated | `Tests 31 passed (31)` | — |

**Exactly the author's claimed figures (20/10/31).** The follow-up commit does what it says.

**My OWN Esc-stack fixture** (`probes/code-rev-s01-c6-r1-esc-stack.test.tsx`, 3 cases,
`Tests 3 passed (3)`), built from `SPEC` S01-R18/R20 and `PLAN` S01-S40 and deliberately
different from the author's: it drives **both** entry points, flips **both** operable toggles
before capturing the triple, and **counts** the keydown deliveries with a capture-phase
document spy so "ONE Escape" is measured, not assumed. Result: with the card open and the
policy over it, one `keydown{key:"Escape"}` (delivered exactly 1) leaves **(a)** `.policyBezel`
null, **(b)** `.consentCard` present with `aria-checked` = `["true","false","true"]`,
byte-identical to the pre-Escape capture, **(c)** the bar absent, `openSurfaceCount()` 2 → 1,
storage still null. Same from Settings with a valid decision stored. A second Escape then
closes the card and empties the stack.

**The DOM-order inversion, planted by me** (`probes/code-rev-s01-c6-r1-mutate.py MR1`, the two
JSX elements swapped): author suite `Tests 2 failed | 9 passed (11)`, **my independent kit
`Tests 3 failed | 6 passed (9)`**. The pin is real and it discriminates in a fixture the
author did not write. **The DOM-order requirement is MET and correctly pinned.**

**My own mutants beyond the author's nine** (each restored by `cp`, `diff -q` clean,
`git status --porcelain -- apps/ui` = 0 after every one):

| mutant | author suite | my kit | reading |
|---|---|---|---|
| **MR1** DOM order swapped | 2 failed / 9 | 3 failed / 6 | caught by both |
| **MR2** `initialFocusRef` → the card container | 2 failed / 9 | 9 passed | caught by the author's initial-focus pin |
| **MR4** `useModalSurface(true,…)` → `(false,…)` | **8 failed** / 3 | 3 failed / 6 | strongly caught |
| **MR5** `containerRef: cardRef` → `scrimRef` | 11 passed | 9 passed | **EQUIVALENT mutant, not a gap** — the scrim is the card's ancestor, `focusableWithin` returns the identical six nodes, and the scrim still PRECEDES the policy element, so `topmostSurface()` is unchanged. Recorded so nobody "strengthens" a test to catch it. |

**Boundaries.** `git diff --name-only 92828aa5..ab449cba` = the four allowed files, nothing
else. S02's four files byte-identical to `44744d8d` (empty diff-stat) and the working-tree
`s02=` term empty in all six `CMD-C6` runs. `globals.css` untouched. Registration request
shape untouched (0 diff lines matching `register\(|adult_affirmed`).

**Standing gates (reported, not folded in — `COMMON` §10.20).** `pnpm typecheck` exit 1, 8
diagnostics, **all** in `tests/unit/s14-ui.test.ts`, **delta 0**. `t9-mode-tokens`
`Tests 2 failed | 7 passed (9)`, the two pre-existing failures by name, hit list **exactly one
element** — the pinned `.drawerScrim` line at `globals.css:6116`. `auth-flow-integration`
`Tests 18 passed (18)`. All ten `consent-*` suites together `Test Files 10 passed (10)` ·
`Tests 119 passed (119)`. `v2ui-node-runner` `Tests 2 passed (2)`. `cd apps/ui && npx tsc
--noEmit -p tsconfig.json` → **exit 0**. Every figure the author reported reproduces.

**The author's three TOOLING-TRAPS appends (`:2111`, `:2125`, `:2138`) — one sentence each,
all TRUE, all measured by me in a throwaway repo / a two-shell script:**
1. `git checkout -- <path>` restored to HEAD and **WIPED** the uncommitted work, leaving
   `git status --porcelain` **empty** — TRUE, and it is why `COMMON` §10.44 exists.
2. zsh does not word-split an unquoted `$VAR`: `zsh` printed `[one two]`, `/bin/bash` printed
   `[one][two]` — TRUE, **and I hit this exact trap myself in this review** (§Predictions).
3. `git log <tip>..HEAD -- <paths>` counts the merge commit once the other branch moves —
   TRUE, measured across five range boundaries (N1's table).

**Post-wipe reconstruction gap? NO.** Against `PLAN.md`'s six steps: S01-S36 (four provenance
observations reported, corrected, plus the re-read signatures) ✓ · S01-S37 (required RED
pasted, `Tests 10 failed (10)`) ✓ · S01-S38 (`{ open, mode:"read", onClose }`, no
`onAcknowledge`, source-text asserted) ✓ · S01-S39 (nothing changes behind the closing policy)
✓ · S01-S40 (the Esc-stack pin, independently reproduced above) ✓ · S01-S41 (helper-sourced
trap/initial focus/focus return, six focusables, Tab and Shift+Tab both directions) ✓ except
R18's bar direction (**B2**, declared not hidden). The one deletion in the wiring — B1's
`setPolicyOpen(false)` — carries a twelve-line JSDoc arguing for it at `:80-87`, so it is a
deliberate decision (a wrong one) and **not** a reconstruction artifact.

## 4. What I did NOT verify

- **Nothing in a browser.** Every measurement is jsdom + source. B1's *pointer* reachability
  in the real dev stack rests on the CSS facts I measured (no `.policyScrim` rule exists), not
  on hit-testing; jsdom performs no layout. **V's acceptance is the authority.**
- **S02's two files' internals** beyond the surface S01 calls — they are S02's and have their
  own suites (verified green, 119/119, not audited).
- **The author's transcript.** I cannot grep another session; the `SKILLS LOADED` check cites
  the orchestrator's body grep.
- **`prefersReducedMotion()`** — C7's, not C6's.
- **The three `globals.css`-reading suites** of BASELINE's 00:20 addendum: not re-run, because
  `globals.css` is untouched by both commits (empty diff-stat), which makes them out of this
  cluster's blast radius by construction.

## 5. Predictions (falsifiable evidence that blindness held)

I read no other lens's verdict on this work. My predictions:

**What I expect another lens got wrong.** First, **`n_s02c`**: any lens that measures it from
the tool shell with the four paths in a variable gets `0` and writes up "the author's RED does
not reproduce — the handoff overstates it". That is a false finding against the author, and it
is the single most likely error in this round; **I made it myself** at 02:05 and caught it
only by re-running under `/bin/bash` with literal paths. Second, **`useLayoutEffect`**: I
expect a lens to propose it as C6-F1's cheap fix without measuring; the layout phase is after
the mutation phase and sees `BODY`, so it fixes nothing. Third, **MR5**: a lens hunting for
coverage gaps may file `containerRef → scrimRef` as an unpinned mutant; it is equivalent, and
filing it would push the author to write a test asserting an implementation detail that
carries no behaviour.

**What I expect another lens found that I did not.** The design-fidelity half — I probed
behaviour and boundaries, not the 10b/10c markup against
`design/turn-10-cookie-consent.html`, and a lens that read the design extracts may have copy
or token findings I have none of.

**What I would check first if I had another hour.** Whether `openSurfaceCount()`'s module-level
`surfaceStack` leaks across test FILES under `fileParallelism:false` when a suite fails
mid-case (the author's `afterEach` asserts 0, which is a measurement of the clean path only) —
and whether B1's stranded flag has a sibling in S02's own modal state now that I know the
class exists.

---

`comments read through: 5` (ticket `t_f46592b6`).
Self-report filed at `.hermes/reports/consent-ui/agent-reports/CODE-REV-S01-C6-r1.md` BEFORE
this verdict was posted. Probe kit at `.hermes/reports/consent-ui/probes/code-rev-s01-c6-r1-*`.
Nothing pushed, merged, marked Done or edited in the work under review; no subagent dispatched.
