# CODE-REV-CROSS-01 — round 1 — blind review of `bd314084` (mission `consent-ui`, ticket `t_c1068d6f`)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging, superpowers:receiving-code-review`

**Verdict: PASS** — with 3 non-blocking findings (N1–N3) and 9 packet findings (P1–P9, one of them —
P6 — a REFUTATION of a charge my own packet made). No blocking finding.

- **Seat:** CODE-REV-CROSS-01, round 1 of max 3, Claude Opus 5, fresh blind session.
- **Work under review:** seat CODE-CROSS-01, ONE commit `bd314084` on `2127c4ad`, branch `slice/consent-s02`. 7 files, 302 insertions / 38 deletions.
- **Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-cross-01/dialectical-engine`, detached at `bd314084`, `git status --porcelain` = **0** at CLAIM and **0** at handoff. `pnpm run generate:contract` exit 0.
- **comments read through: 4** on `t_3315d8b1` — 0 at CLAIM; the ORCHESTRATOR DISPATCH landed in the same minute and was read after the FULLY DONE marker (CURSOR CORRECTION posted; it restates the packet's constants and changes no finding). The work ticket `t_c1068d6f` was not opened until the appendix step (§13).

---

## 1. What the change actually is (measured, not read)

Comment-stripped structural diff of the helper, base → HEAD
(`scratchpad/code-rev-cross-01-r1/m1b-export-diff.txt`):

```
   containerRef: React.RefObject<HTMLElement | null>;
   initialFocusRef: React.RefObject<HTMLElement | null>;
   onClose: () => void;
+  returnFocusRef?: React.RefObject<HTMLElement | null>;
 }>;
...
-      focusElement(opener);
+      const survived = opener !== null && opener !== document.body && opener.isConnected;
+      const named = surfaceRef.current.returnFocusRef?.current ?? null;
+      if (survived) {
+        focusElement(opener);
+        return;
+      }
+      if (named !== null && named.isConnected) focusElement(named);
```

`git diff 2127c4ad bd314084 -- apps/ui/components/consent/modalSemantics.ts | grep '^[-+]export'` prints
**nothing** — but that probe is weak on its own (a member added inside a type body carries no
`export` prefix), so the ruling rests on the stripped diff above and on the two type bodies printed
side by side. **Ruled: the ONLY signature change is the one optional member V-22 remedy (a)
authorises.** The five exported names (`ModalSurface`, `useModalSurface`, `backdropCloseHandler`,
`prefersReducedMotion`, `openSurfaceCount`) and the three original members are byte-identical.
Every other change in the commit is a comment, a wiring line, a test, or the ADR addendum.

## 2. The precedence, in one sentence, and the ruling on it

**What the helper does at HEAD (`modalSemantics.ts:213-219`):** on close it focuses the opener it
captured at open **iff** that opener is a non-null element other than `document.body` and is still
`isConnected` **at close**; otherwise it focuses `returnFocusRef.current` iff that is non-null and
`isConnected`; otherwise it focuses nothing.

**The work packet `CODE-CROSS-01.md` §2.1 words V-22's rule the other way round** — "focus
`returnFocusRef.current` if it is set AND `isConnected`, else the captured opener if connected, else
nothing" (named-first). **I planted that literal wording as a mutant (M4) and measured it**
(`scratchpad/code-rev-cross-01-r1/m6-mutants.log`):

```
############ MUTANT M4 ############
FAIL  tests/render/consent-modal-semantics.test.tsx > ... > keeps the captured opener ahead of the named control while the opener is on the page
FAIL  tests/render/consent-policy-link.test.tsx > ... > returns focus to the Settings opener when the card closes
Tests  2 failed | 36 passed (38)
restore OK (tree: 0 entries)
```

**Ruling — surviving-capture-first is the only ordering that satisfies V-22 TOGETHER with S01-R14.**
The mechanism, measured end to end in my own jsdom probe against the real `CookieConsent`
(`probes/cross01-focus-route.test.tsx`, 7 cases, all green):

- S01-R14 makes the returning bar a function of the STORED decision, not of the entry point. So a
  visitor who opens the card from **Settings with nothing stored** has the bar come back
  *underneath* the card on close, and `manageRef` is re-attached to the bar's fresh
  `Choose what to store` in the layout phase of that very commit.
- Under named-first, that bar control is set and connected at the cleanup, so it takes a focus that
  belongs to the still-mounted `Cookie preferences` opener — V-22's own worked example, second
  sentence, fails. Measured above: that is precisely the case M4 turns RED.
- Under surviving-first, both sentences hold: `Cookie preferences` survived → it wins; the bar's
  opener did not survive (the capture is `document.body`) → the named control wins.

**Therefore `CODE-CROSS-01.md` §2.1's literal precedence is unsatisfiable in this product, and so is
V-22's default as worded.** That is a packet finding, not an author finding — see **P4**. The seat
shipped the corrected mechanism and said so in the ADR; that is the right call.

## 3. `document.body`, detached nodes, and where I disagree

`survived` excludes `document.body` by identity. **Ruled correct and necessary**: the class this
member exists for is exactly the class whose capture *is* `body` (the opener is unmounted by the
opening commit and the platform moves focus to the body before any hook tier runs). Treating `body`
as a live opener would make the member unreachable. Pinned by a test: mutant M1 (the member never
consulted) turns three cases RED; mutant M3 (the capture skipped) turns the two opener-direction
cases RED.

A **disconnected** named control is refused (`named.isConnected`), and that guard is pinned:
mutant M2 (guard removed) turns `never hands focus to a named control that is not in the document`
RED — the author's own case is honest that it is green at base for the wrong reason and that the
discriminating assertion is the `focus` spy, not the active element. I confirmed that by mutation
rather than by reading it.

**Where the rule is thinner than it reads — N2 below:** `survived` asks "is it connected?", never
"did it take the focus?".

## 4. Findings

### N1 — the Settings entry WITH a valid decision stored is not focus-pinned

- **File:** `tests/render/consent-policy-link.test.tsx:249`
  (`stays silent on Escape from the Settings entry when a valid decision is stored`).
- **Inputs → outcome:** a valid `v: 1` decision in `localStorage`; open the card from
  `Cookie preferences`; press Escape. The case asserts the surface state (no bar, no card) and stops.
  Focus is never asserted. This is the one branch of S01-R18's Settings direction where **no bar
  returns at all**, so it exercises a different state of `returnFocusRef` (`null`, because the bar
  never mounted) from the sibling case at `:315`.
- **Evidence it is a gap and not a defect:** my own probe pins the behaviour and it is correct —
  `probes/cross01-focus-route.test.tsx > SETTINGS direction, a VALID decision stored: opener keeps
  the focus, no bar returns` is green at HEAD. The product is right; the suite does not say so.
- **CLASS:** an S01-R18 direction whose *storage precondition* changes which helper branch runs, but
  whose focus landing is asserted for only one precondition. Members: the Settings direction
  (nothing stored — pinned at `:315`), the Settings direction (valid decision stored — **unpinned**),
  the bar direction (pinned at `:359`). One member of three is unpinned.
- **Remedy — ADVISORY:** add one assertion to the existing `it()` at `:249`
  (`expect(document.activeElement).toBe(labelled("Cookie preferences"))` after the `press("Escape")`).
  No new `it()`, so no count moves (COMMON §10.42). I did not measure the remedy inside the lane's
  own file, because editing the work under review is forbidden to me; I measured the *property* it
  would assert, in my probe, and it holds.
- **VERDICT / CONFIDENCE / STRONGEST COUNTER:** N, non-blocking, ticket the same day /
  **high** that the assertion is absent and the property holds; **medium** that it is worth a line /
  **counter:** mutants M3 and M4 both turn the *sibling* Settings case RED, so the precedence is
  already guarded; a mutant that reached only the no-bar-returns branch would have to be quite
  contrived. The counter is why this is N and not B.

### N2 — "survived" means *connected*, never *took the focus*; a connected-but-unfocusable opener swallows the return

- **File:** `apps/ui/components/consent/modalSemantics.ts:213-219`.
- **Inputs → wrong outcome (measured, `probes/cross01-refute.test.tsx` EDGE A):** a consumer lends a
  `returnFocusRef` to a connected control; the captured opener is still in the document at close but
  is `disabled`. `survived` is `true`, the helper returns early, `focusElement(opener)` is a no-op —
  **focus lands on `document.body` and the lent control is never asked.** Probe output:
  `EDGE A landing: BODY`.
- **Second member of the same CLASS (EDGE B):** `document.activeElement` can be
  `document.documentElement`, which the guard does not exclude. Measured: `EDGE B activeElement
  before open: HTML` → `EDGE B named.focus called: 0 activeElement: HTML`. The named control is
  never asked and focus stays on `<html>`.
- **CLASS:** the cleanup's liveness test is *identity against `document.body`* plus `isConnected`,
  where the property it stands for is *"this node will actually receive focus"*. Every node that is
  connected and non-`body` but unfocusable is a member: `disabled`, `inert`, `display:none`,
  `visibility:hidden`, `tabindex` removed while the surface was open, and `documentElement`.
- **Reachability in THIS product:** I could not reach it. The two openers are the bar's
  `Choose what to store` and the Settings `Cookie preferences`, and neither is ever disabled or
  hidden while the card is open (`CookieBar.tsx:66-73`, `ConsentSettingsPanel.tsx`). **So this is a
  finding against the shared helper's contract, not against the cookie surfaces** — and the helper is
  advertised in `ADR-0022`'s addendum as serving "every mutually-exclusive surface pair", with ticket
  `A11Y-OVERLAYS` (`t_8962842f`) queued to put seven more overlays on it.
- **Remedy — ADVISORY:** in the cleanup, after `focusElement(opener)`, fall through when the focus
  did not land: `if (survived) { focusElement(opener); if (document.activeElement === opener) return; }`.
  Marked ADVISORY and not BINDING because I did **not** measure it inside the lane: it changes the
  file under review, which my contract forbids me to edit beyond a reverted mutant, and the
  fall-through interacts with the `body` term in a way that deserves the author's own RED-first
  case rather than my sketch. The CLASS binds; the wording does not.
- **VERDICT / CONFIDENCE / STRONGEST COUNTER:** N, non-blocking / **high** on the mechanism (measured
  twice), **medium** on the priority / **counter:** at base the same input also landed nowhere, so
  this is an inherited gap the commit did not widen — the commit merely created the first consumer
  that had somewhere better to send the focus. A reviewer who wants it out of this ticket can route
  it to `A11Y-OVERLAYS`; it must not be dropped.

### N3 — the ADR addendum and the member's JSDoc describe a narrower rule than the code ships

- **Files:** `docs/architecture/01-decisions/ADR-0022-shared-modal-semantics.md:106` ("the control
  focus returns to when the opener captured at open **did not survive the opening commit**") and
  `apps/ui/components/consent/modalSemantics.ts:22-23` (the same phrase, upper-cased) —
  **versus** `modalSemantics.ts:213`, where `opener.isConnected` is evaluated in the **cleanup**.
- **Inputs → wrong outcome for a READER:** an opener that was on the page at open and is removed
  *while* the surface is open. The shipped rule sends focus to the named control; the ADR sentence
  says the named control serves only when the opener did not survive *the opening commit*, i.e. it
  describes a strictly narrower rule than the code. The author's own case
  `consent-modal-semantics.test.tsx:559` (`returns focus to the named control when the captured
  opener has since left the page`) pins the broader behaviour, so the code, the test and the prose
  do not agree.
- **CLASS:** a prose contract that names the *cause* of a state (an unmounting commit) where the code
  tests the *state* (connectedness at close). Members: the ADR addendum sentence, the `ModalSurface`
  member's JSDoc, and the `CookiePreferencesCard.tsx:189-199` prop doc ("when the opener it captured
  did not survive the commit that opened this card").
- **Remedy — ADVISORY:** one clause in each of the three places: "…when the captured opener is not a
  usable element at close — because the opening commit removed it, or because it left the document
  while the surface was open".
- **VERDICT / CONFIDENCE / STRONGEST COUNTER:** N, non-blocking / **high** (the divergence is
  mechanical, and the test that proves it is in the same commit) / **counter:** the ADR's *decision*
  is right and its precedence sentence ("surviving-capture-first, not named-control-first") is exactly
  what shipped; only the trigger clause is narrow. Nobody is misled about the precedence, which is
  the thing V is being asked to rule on.

### Refuted while hunting (dead ends, recorded as evidence)

1. **"An omitting consumer's behaviour changed."** `ADR-0022`'s addendum and the helper's JSDoc both
   claim a surface that omits the member "behaves exactly as before". The new
   `opener !== document.body` term fires for every surface, so I built `probes/cross01-omitting-consumer.test.tsx`
   to catch a divergence: a surface with no `returnFocusRef`, opened with focus on the body, closed
   while focus sits on a control *outside* it. Base rule = `focusElement(document.body)`, HEAD = do
   nothing. **Measured on both products: identical (`PROBE C landing: elsewhere`, green on HEAD and
   green on the reverted `modalSemantics.ts`).** jsdom's `body.focus()` is a no-op. The claim stands
   in jsdom; see §7 for what this does NOT prove in a real browser.
2. **"A mouse user now gets a focus ring on `Choose what to store`."** On Safari/Firefox-macOS a
   button is not focused by a click, so the capture is `body` and the named control now takes focus
   for a visitor who never used the keyboard. Checked the stylesheet:
   `apps/ui/app/globals.css:7363` is `.consentGhost:focus-visible`, not `:focus`, and the S01 block
   contains no bare `:focus` rule. Programmatic focus after a pointer interaction does not match
   `:focus-visible`. **No spurious ring. Refuted.**
3. **"The second open re-uses a stale ref."** `probes/cross01-refute.test.tsx` EDGE C and EDGE E:
   two consecutive open/close cycles through the same `manageRef`, and an explicit assertion that the
   focused node is the live one and not the detached first button. Both green.
4. **"The Esc stack and the focus return fight each other."** EDGE D: policy over card, one Esc →
   focus on `Privacy notice` (logged verbatim: `EDGE D after first Esc: Privacy notice`), second Esc →
   focus on the fresh bar control. Green.

## 5. The timing chain, measured by me and not read

The claim under test: *at the card's passive cleanup the new bar button's ref is already attached and
connected.* I instrumented the ref callback and wrapped the fresh node's `focus` to record call order
(`probes/cross01-focus-route.test.tsx`, the `TIMING CHAIN` describe). Verbatim:

```
TIMING afterOpen:  ["1:ref-DETACH"]
TIMING afterClose: ["1:ref-ATTACH","2:focus-CALLED-on-named","3:surface-passive-cleanup-of-consumer"]
```

`ATTACH` strictly precedes the helper's `focus` call, which precedes the consumer's own passive
cleanup. **The chain the C6 reviewers asserted is confirmed by an independent fixture.** On open the
only event is `ref-DETACH` — i.e. `manageRef.current` is `null` for the whole time the card is open,
which is also why the packet's §2.2 premise about the Settings entry is wrong (P4).

## 6. RED-first — replayed, not accepted

HEAD's **tests** against the base's **product** (four product files reverted with
`git show 2127c4ad:./<path>`, restored with `cp` + `diff -q`, never `git checkout --`;
`scratchpad/code-rev-cross-01-r1/m5-red-first.log`):

```
tests/render/consent-modal-semantics.test.tsx      Tests  2 failed | 22 passed (24)
  FAIL ... returns focus to the named control when the opener was unmounted by the same commit
  FAIL ... returns focus to the named control when the captured opener has since left the page
tests/render/consent-policy-link.test.tsx          Tests  1 failed | 13 passed (14)
  FAIL ... returns focus to the RETURNED bar's opener when the card closes
restored-identical: (all four files)      tree after restore: 0 entries
```

**Exactly three base-RED frames, and they are the three the change exists for.** The other two new
cases are green at base — `keeps the captured opener ahead of the named control` (the base always
takes the opener) and `never hands focus to a named control that is not in the document` (the base
reads no such member). The author's comment on the second one says so in the file; I confirmed it by
mutation instead of trusting the comment.

## 7. Mutants — the author's re-run, plus my own

All five applied to HEAD, run against the two owned suites, restored with `cp` + `diff -q`
(`m6-mutants.log`). Control at the end: `Tests 38 passed (38)`, `tree: 0 entries`.

| # | Mutant | Cases that went RED | Verdict |
|---|---|---|---|
| **M1** | the cleanup never consults `returnFocusRef` (member dead) | `…named control when the opener was unmounted by the same commit`; `…named control when the captured opener has since left the page`; `returns focus to the RETURNED bar's opener when the card closes` — **3 failed / 35 passed (38)** | the member is load-bearing, and the new S01 case is the one my packet demanded RED |
| **M2** | `named.isConnected` guard removed (a disconnected name is focused) | `never hands focus to a named control that is not in the document` — **1 failed / 37 (38)** | the guard is pinned |
| **M3** | the capture is skipped (`const opener = null`) | `returns focus to the element that was focused when the surface opened`; `keeps the captured opener ahead of the named control…`; `returns focus to the Settings opener when the card closes` — **3 failed / 35 (38)** | the Settings case REDs, as demanded |
| **M4** | **the work packet's literal precedence** (named-first) | `keeps the captured opener ahead of the named control…`; `returns focus to the Settings opener when the card closes` — **2 failed / 36 (38)** | the packet's wording is measurably unsatisfiable — **P4** |
| **M5** | `chooseRef={manageRef}` removed from `CookieConsent` | `returns focus to the RETURNED bar's opener when the card closes` — **1 failed / 37 (38)** | the wiring is pinned |

## 8. Gates as deltas — transcribed from the PLAN's fenced blocks, ×3 from a `.sh` under `/bin/bash` AND inline

`CMD-C6` and `CMD-C7` are transcribed verbatim from `slices/S01/PLAN.md:790-808` and `:814-836`;
`run`/`run_c9` from `slices/S02/PLAN.md:1377-1392` and `:1410-1417`. Script:
`scratchpad/code-rev-cross-01-r1/gates.sh` (lane from `argv`), log `gates-bash.log`; inline arm
`m3-inline-arm.log`.

| Command | run 1 (bash) | run 2 (bash) | run 3 (bash) | inline (zsh) | commit | Verdict |
|---|---|---|---|---|---|---|
| `CMD-C6` | `verdict=0`, `Tests 14 passed (14)`, `Test Files 1 passed (1)` | identical | identical | identical | `bd314084` | **PASS** |
| `CMD-C7` | `verdict=0`, `Tests 76 passed (76)`, `Test Files 6 passed (6)` | identical | identical | identical | `bd314084` | **PASS** |
| `run_c9` — vitest half | `vt=0 guard=0 VERDICT=0`, `Tests 109 passed (109)`, `Test Files 10 passed (10)` | identical | identical | identical | `bd314084` | **PASS** |
| `run_c9` — merge arms | `--scrim:=1 (expect 2)  S02markers=1 (expect 2)` → `COMBINED verdict=1` | identical | identical | identical | `bd314084` | **known PLAN defect `t_4f97ca86` — see P8** |
| sixteen-file set | `Tests 185 passed (185)`, `Test Files 16 passed (16)` | identical | identical | identical | `bd314084` | **PASS**, matches `BASELINE.md` addendum 05:10 |
| root `pnpm typecheck` | exit 1, **0 diagnostics outside the `tests/unit/s14-ui.test.ts` pin** (`n_tcran=1`) | identical | identical | identical | `bd314084` | **PASS** (delta, never "green") |
| `apps/ui` project tsc (COMMON §10.30) | `exit=0 errors=0` | identical | identical | identical | `bd314084` | **PASS** |
| `t9-mode-tokens` | `Tests 2 failed | 7 passed (9)`, hit list **exactly 1**, pinned literal 1 | identical | identical | identical | `bd314084` | **PASS** — hit list verbatim below |

t9 hit list, verbatim (one element, at the line the packet pins):

```
+   "/…/.worktrees/rev-cross-01/dialectical-engine/apps/ui/app/globals.css:6116:background: color-mix(in srgb, #0a0806 32%, transparent);",
```

Worst of three = best of three on every command; no flake in 3 bash rounds + 1 inline round.
`git status --porcelain` = 0 after every round.

**Boundaries.** `git show --name-only bd314084` = exactly the seven paths in `CODE-CROSS-01.md`'s
`allowed` list, no more:
`CookieBar.tsx`, `CookieConsent.tsx`, `CookiePreferencesCard.tsx`, `modalSemantics.ts`,
`ADR-0022-shared-modal-semantics.md`, `consent-modal-semantics.test.tsx`, `consent-policy-link.test.tsx`.
`globals.css` = 0 hits; `PROGRESS.md`/`PLAN.md`/`SPEC.md`/`BASELINE.md` = 0 hits; the whole commit
contains **no** `register(` / `adult_affirmed` / `privacy_accepted` — the registration request shape
is untouched. The ADR diff deletes **0** lines above the addendum heading.

**Sole owner of focus (S01-S45).** `grep -n '\.focus(' apps/ui/components/consent/*.tsx *.ts` →
one hit, `modalSemantics.ts:97`. No consumer moves focus; the consumers lend a node. `CMD-C7`
(which runs `consent-guards.test.tsx`) is green, so the slice-wide guard agrees.

**The bar's prop name.** The packet dictated `manageRef` for the owner's variable and `returnFocusRef`
for the card's prop; both are exactly what shipped (`CookieConsent.tsx:134`, `:218`;
`CookiePreferencesCard.tsx:200`). The bar's prop name was **not** dictated, so `chooseRef`
(`CookieBar.tsx:54`) is the author's free and disclosed choice. Ruled: the name is right — it names
the control it attaches to — and the disclosure is complete. See **P7** for the cost of the three
names.

## 9. Packet review — findings against the orchestrator

Each verified true or false by measurement.

**P1 — BLINDNESS LEAK, and it is structural (COMMON §10.52 violated by construction).**
This review packet's §4 orders me to read `BASELINE.md`'s "addendum 05:10" for the sixteen-file set.
That addendum's last bullet reads `bd314084 185/185 (CODE-CROSS-01, review pending)` — the author's
claimed figure, in a document the packet puts on my *read-FIRST* list. `V-DECISIONS-PACKET.md:180`
does the same for the *conclusion*: an addendum dated 05:15 states that the shipped precedence is the
reverse of V-22's wording and why. I therefore knew the author's headline number and headline ruling
before I measured either. My measurements were run anyway and are independent (three RED frames found
by replay, precedence ruled by mutant M4), but a blind lens that is handed the answers first is
anchored by construction — which is the exact defect COMMON §10.52 was written for.
**Remedy — BINDING (measured: the two files, at those two lines, are on this packet's own reading
list):** author-claimed figures and rulings go in the review packet's appendix; `BASELINE.md` records
a seat's figure only after its review closes, or records it as `CLAIMED, UNVERIFIED` in a section the
review packet excludes by name. **VERDICT / CONFIDENCE / STRONGEST COUNTER:** packet defect, blocking
for the *process* not for this commit / **high** / **counter:** `BASELINE.md` must move forward so the
next seat has a pin; the counter is answered by tagging the row rather than by withholding it.

**P2 — the snapshot pointer does not resolve.** `CODE-REV-CROSS-01-R1.md:10` cites
`snapshots/packets/CODE-CROSS-01.md.at-dispatch` as a relative path. It resolves from neither the lane
nor the mission root; the file is at
`/Users/…/.hermes/reports/consent-ui/snapshots/packets/CODE-CROSS-01.md.at-dispatch`. COMMON §10.45
(and §10.36/§10.38) require the absolute main-tree path. Cost: one wrong `find` before I guessed the
right tree. *(For the record: I diffed both packets against their `.at-dispatch` snapshots — both
**IDENTICAL**, so no post-dispatch correction is hiding.)*

**P3 — CONFIRMED: `CookieBar.tsx:61` is the label, not the control.** `CODE-CROSS-01.md` §2.2 says the
ref is attached "to the `Choose what to store` button — `CookieBar.tsx:61` today". Measured against the
file the seat actually read (`git show 2127c4ad:./apps/ui/components/consent/CookieBar.tsx`): the
`<button>` opens at **`:56`**; `:61` is the label text node. COMMON §10.24's class exactly. No harm
done here — the author attached the ref to the element — but the citation is wrong.

**P4 — CONFIRMED and MEASURED: §2.1, §2.2 and §2.4 of `CODE-CROSS-01.md` are mutually unsatisfiable.**
§2.1 orders named-first. §2.2 asserts "For the Settings entry the ref is null/disconnected → the
captured opener path returns focus to `Cookie preferences` exactly as today". §2.4 orders `CMD-C6`
green, and `CMD-C6` runs the case `returns focus to the Settings opener when the card closes`.
§2.2's premise is **false whenever no valid decision is stored**: S01-R14 brings the bar back on
dismissal *from either entry point*, so `manageRef` is re-attached to a live, connected control
before the cleanup reads it (proved by the TIMING log in §5). Mutant M4 measures the consequence: with
§2.1 obeyed literally, `returns focus to the Settings opener when the card closes` goes RED. The same
defect is in **V-22's default wording**, which §2.1 transcribes faithfully. **RED FRAME: an
instruction the seat could not obey and pass its own gate.** The seat's resolution — ship
surviving-first, record the divergence in the ADR — is the correct one, and the orchestrator has
already appended the correction to V-22.
**Remedy — BINDING (measured: mutant M4, `m6-mutants.log`):** V-22's row and any future transcription
of it read "the captured opener wins whenever it is still a usable element on the page; the named
control serves only when it is not".

**P5 — CONFIRMED: `CMD-C6`'s two S02-file arms are degenerate in this lane, and the packet says the
opposite.** `CODE-CROSS-01.md` §2.4 tells the seat "its `n_s02c` arm will now legitimately count THIS
commit — the S02-owned helper changed BY AUTHORISATION; say so and paste the arm". Measured, four
times: `slice/consent-s02` resolves to `bd314084`, which **is** `HEAD`, so
`git log <tip>..HEAD -- <four S02 paths>` is empty and `n_s02c` = **0**; the working-tree arm
`git diff --stat HEAD` is empty for the same reason. The arm cannot count this commit — it could only
ever count a commit made on a *different* branch than the one being measured. The seat's guard passed
with `n_s02c=0` in every run, which is the *correct* value and the *opposite* of what the packet
predicted.
**Remedy — BINDING (measured: `m3-inline-arm.log`, `gates-bash.log`):** when the cluster's own commit
lands on `slice/consent-s02`, the arm's baseline must be a RECORDED sha (`2127c4ad`), not the moving
branch ref; with `2127c4ad..HEAD` the arm counts **1**, which is the number the packet describes.

**P6 — REFUTED as worded.** My packet charges that `CODE-CROSS-01.md` "predicted two new cases where
the suite gained four (COMMON §10.42 forbids count predictions)". Measured: §2.3(a) *enumerates two
required cases*; §2.4 says "`run S02-C1 1 …` ×3 (**the count rises — state it**)", which is exactly
§10.42's prescribed form and is not a prediction. `it()` count in
`consent-modal-semantics.test.tsx`: base **20** → HEAD **24** (delta 4);
`consent-policy-link.test.tsx`: 14 → 14 (one case rewritten in place, no count moved). **No §10.42
violation.** The real, smaller defect: the packet's enumeration was necessarily *incomplete*, because
the case that pins the precedence (`keeps the captured opener ahead of the named control…`) only
exists because the packet's own precedence was wrong. A packet cannot enumerate the test that
falsifies it — which is an argument for enumerating a PROPERTY rather than a list of cases.

**P7 — one node, three names, none of them the control's label.** `manageRef` (owner variable,
dictated by the packet), `chooseRef` (bar prop), `returnFocusRef` (card prop and helper member) all
denote the bar's `Choose what to store` button. `manageRef` is the odd one: nothing in this slice is
called "manage". Non-blocking, and the author was bound by the packet's constant.
**Remedy — ADVISORY:** the owner's variable becomes `chooseRef`, matching the prop and the control.

**P8 — `run_c9`'s two merge arms are structurally unsatisfiable at this head; the PROPERTY holds.**
Reported per COMMON §10.49, against the known PLAN defect `t_4f97ca86`, with the constants measured
rather than repeated:
- `grep -c -- '--scrim:' apps/ui/app/globals.css` = **1**, not 2. The PLAN derives 2 from "declared
  once in each of the two token blocks", but `--scrim` is the mission's **mode-independent** token
  (COMMON §7, "one wash for both modes"), declared once at `globals.css:65` and never redeclared in
  `html[data-mode="chamber"]`.
- `grep -c -- '=== consent-ui S02 ===' apps/ui/app/globals.css` = **1**, not 2. The closing marker is
  `/* === end consent-ui S02 === */` (`:8036`), which does not contain the substring the arm greps.
- **The property both arms exist to assert is TRUE:** `grep -cE 'consent-ui S01 ==='` = **2**
  (`:7244`, `:7615`) and `grep -cE 'consent-ui S02 ==='` = **2** (`:7617`, `:8036`) — both slices'
  blocks survived the merge, in order, exactly once each.
- The vitest half of `run_c9` is **VERDICT=0** in all four runs.

**P9 — this review packet orders a route the design forbids.** `CODE-REV-CROSS-01-R1.md` §4 tells me
to close the card "by Escape, by the scrim, and by the dismiss control". There **is** no dismiss
control: S01-R18 gives 10b no close glyph and the footer is exactly
`Privacy notice` / `Essential only` / `Save choices` (measured, `probes/cross01-focus-route.test.tsx`
ROUTE 3). I covered the two real dismissal routes and, in their place, the two *deciding* routes
(ROUTE 4). A packet charge that names a non-existent affordance costs a seat a probe to disprove.

## 10. What I verified, and how

- Contract change: comment-stripped structural diff, both `ModalSurface` bodies printed. §1.
- Precedence: read the cleanup, stated it in one sentence, then **decided by measurement** (mutant M4
  + six product-level probe cases). §2, §7.
- `document.body` / detached nodes: mutants M1–M3 plus EDGE A/B. §3, N2.
- Focus-return route through the **real** `CookieConsent`: Escape, scrim, and the two deciding
  controls; both entry directions; both storage preconditions. 7 cases, mine. §4, §5.
- Timing chain: instrumented ref-attach vs the helper's focus call. §5.
- RED-first: HEAD's tests against base product, `cp`/`diff -q` snapshots. §6.
- Gates: ×3 from `/bin/bash` + inline, worst wins, commit column, deltas not absolutes. §8.
- Boundaries, focus ownership, registration shape, ADR pre-lines. §8.
- Packet review: nine charges, each true/false with the command that settled it. §9.
- Author's `SKILLS LOADED` vs the worker floor: §13 (appendix step) — 7/7, no shortfall.

## 11. What I did NOT verify

- **Real-browser behaviour.** Everything here is jsdom. Two things this cannot settle: (a) whether
  `document.body.focus()` blurs in Chrome (it does; jsdom's is a no-op), which is why dead end 1 above
  is stated as a jsdom result and not as a general one; (b) whether the returned focus is *visible* —
  `:focus-visible` matching after a pointer interaction is a browser policy jsdom does not implement.
  **Both belong to V's acceptance run, steps 15 and 17.**
- **The Grok element gate and V acceptance.** Not mine.
- **The other lens's verdict on this same commit,** and `CODE-CROSS-02` (`t_cde7254d`), which changes
  the Esc stack on the same helper. If it lands, §2's ordering must be re-measured against it —
  nothing I ran here covers a helper with a different topmost rule.
- **`ConsentSettingsPanel.tsx` beyond the one question** "can the Settings opener ever be disabled or
  unmounted while the card is open" (I read it for that; it cannot).
- **Whether `A11Y-OVERLAYS`'s seven overlays will hit N2.** Out of this mission's surface.

## 12. Predictions (falsifiable; blindness evidence)

I expect the other lens on this commit to converge on the precedence ruling — it is forced by mutant
M4 and hard to miss — and to report the same three RED frames. I expect it to **miss N2**, because the
disabled-opener case needs a fixture nobody's packet asks for and the product cannot reach it; and to
**miss P5**, because `n_s02c=0` *looks* like a pass and only a reader who asks "could this arm ever be
non-zero here?" notices the branch ref equals `HEAD`. I expect it to catch P8's arithmetic (it is
printed in every run) but to report it as `1 vs 2` without deriving *why* `--scrim` is declared once —
the mode-independent-token reason is in COMMON §7, two documents away. I predict at least one lens
reports the four-vs-two case count as a §10.42 violation; measured, it is not one (P6), and I would
check `CODE-CROSS-01.md` §2.4's exact wording before filing it. Finally, I predict nobody else notes
P9 — a packet asking for a control the design deleted reads as boilerplate until you go looking for
the button.

## 13. Appendix step — the author's claims, opened LAST (COMMON §10.52)

Opened only after everything above was on disk: `t_c1068d6f` comment 6 (`READY FOR PEER REVIEW`) and
`.hermes/reports/consent-ui/agent-reports/CODE-CROSS-01.md`. `comments read through: 7` on that
ticket at the moment of reading (6 existed when the handoff was posted; comment 7 is the
orchestrator's `HANDOFF CONSUMED`).

**Author's `SKILLS LOADED` vs the worker floor — checked, and it clears.** Declared:
`superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker, superpowers:receiving-code-review,
superpowers:test-driven-development, superpowers:verification-before-completion,
superpowers:systematic-debugging`. `heartbeat-protocol` §1's worker floor is
`test-driven-development · verification-before-completion · systematic-debugging (any bug) ·
receiving-code-review (on rework)`, raised by COMMON §10.39 for a seat discharging another verdict's
findings — all four present, plus the router and the role contract. No shortfall, nothing named that
the packet's own reading list would have made easy to fake. Seven for seven.

**Every figure I measured independently agrees with the author's, to the digit.**

| quantity | author's handoff | my measurement | agree? |
|---|---|---|---|
| signature delta | one line, `returnFocusRef?` | one line, `returnFocusRef?` | yes (different methods: their `tsc --emitDeclarationOnly`, my comment-stripped diff) |
| base-RED frames | 3 | 3, and the same three by name | yes |
| `run S02-C1` | `24 passed (24)` | 24 (as part of my 38/38 control) | yes |
| `CMD-C6` | `14 passed (14)`, `n_s02c=0` | identical, 4 runs | yes |
| `CMD-C7` | `76 passed (76)`, hit list 1 | identical, 4 runs | yes |
| `run_c9` vitest half | `109 passed (109)` | identical, 4 runs | yes |
| sixteen-file set | `185 passed (185)` | identical, 4 runs | yes |
| merge arms | `1 / 1` against `2 / 2` | identical, and the derivation in **P8** | yes |
| typecheck / apps-ui tsc | 0 outside the pin / exit 0 | identical | yes |
| `it()` delta | semantics 20→24, policy-link 14→14 | identical | yes |
| mutant M1 | `3 failed | 35 passed (38)` | my M1: identical | yes |
| mutant M4 (`named.isConnected`) | `1 failed | 37 passed (38)` | my M2: identical | yes |
| mutant M5 (`chooseRef` dropped) | `1 failed | 37 passed (38)` | my M5: identical | yes |
| mutant M8 (packet's precedence) | `2 failed | 36 passed (38)` | my M4: identical | yes |
| `useModalSurface` call sites | 2 product + 3 test | identical, swept myself | yes |

**Divergences, charged to the side the measurement refutes.**

1. **Author's C3 is REFUTED on its citation, upheld on its substance — charged to the author (N, nil
   cost).** C3 says `CODE-CROSS-01.md` §2.3 "predicts" two cases and cites COMMON §10.42. Measured:
   §2.3 *prescribes* two RED-first cases; §10.42's text bans predicting a COUNT FIGURE and prescribes
   the exact wording the packet used in §2.4 ("the count rises — state it"). The packet obeyed §10.42.
   The substance stands and is worth keeping (see **P6**): the enumeration was incomplete because the
   precedence it was derived from was wrong. Filing it under §10.42 would ticket the wrong rule.
2. **The timing chain: the author's proof is an OUTCOME argument; mine is an ORDERING measurement.**
   The handoff's §4 derives "the ref was attached when the passive cleanup read it" from the fact
   that mutants M5/M6 turn the landing RED. That is sound inference, not observation, and my packet
   ordered the chain measured "with your own probe, not by reading the author's". §5 above supplies
   the direct observation (`ref-ATTACH` → `focus-CALLED-on-named` → consumer cleanup). Same
   conclusion, stronger evidence. Not a finding; recorded so the next lens does not have to redo it.
3. **The author calls C4 a "coverage note, NOT a defect" and the orchestrator routed the tiering to
   me. Tiered: N1, non-blocking, ticket today.** The author's reason for not fixing it is correct and
   I verified it — the packet's allowed list grants one *replacement* case in that file and no
   addition. The remedy I give (an assertion inside the existing `it()`) needs no new case and no new
   allowance, so it fits the next S01 ticket unchanged.
4. **The author's C1 asks that "V should be told the precedence was corrected".** Already done by the
   orchestrator (`V-DECISIONS-PACKET.md:180`), which is also how it leaked into my reading — see
   **P1**. The measurement V needs for that row is mutant M4 in §7 above.

Nothing in the appendix changed a verdict, a finding or a figure above it.

## 14. Round and route

Round 1 of max 3. Verdict **PASS**: N1–N3 are non-blocking and each is ticketable today; P1–P9 are
findings against the orchestrator's packets, not against the seat. Nothing here opens round 4, so no
V DECISIONS PACKET row is required by the round cap — but **V-22's addendum already asks V to rule on
the corrected precedence, and this review supplies the measurement for that row**: named-first is
unsatisfiable, surviving-first satisfies both sentences of V's own worked example.

Probe kit (COMMON §10.26/§10.35, lane from `argv`/`LANE`):
`.hermes/reports/consent-ui/probes/code-rev-cross-01-r1-*`.

**comments read through: 4** on my own ticket `t_3315d8b1` (0 at CLAIM; the ORCHESTRATOR DISPATCH arrived
in the same minute and was read after the FULLY DONE marker, with a CURSOR CORRECTION posted — it
restates the packet constants and changes no finding);
**7** on the work ticket `t_c1068d6f`, every one of them read in the appendix step (§13) and none
before it.
