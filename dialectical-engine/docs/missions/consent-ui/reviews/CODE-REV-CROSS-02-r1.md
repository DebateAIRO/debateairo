# CODE-REV-CROSS-02 r1 — blind code review of CROSS-02 (`t_cde7254d`, commit `c334136d`)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging`

`superpowers:receiving-code-review` — **not loaded this session, not needed: no finding of mine was
contested** (COMMON §10.9's honest form). COMMON §10.39 binds a seat "whose packet carries a prior
verdict's numbered findings as requirements"; my packet carries CODE-REV-S02-C9 r1 **B1** as the thing
to RULE ON, not to discharge — I wrote no code and discharged nothing. If the orchestrator reads §10.39
as covering a seat that RULES on a prior finding, this line is the shortfall declaration.

- **Seat:** CODE-REV-CROSS-02 · role reviewer · Opus 5, fresh blind session · **round 1 of max 3**
- **Work under review:** seat CODE-CROSS-02, ticket `t_cde7254d`, ONE commit `c334136d` on base `bd314084`
- **My worktree (detached, never the author's lane):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-cross-02/dialectical-engine` @ `c334136d`, `git status --porcelain` = **0 entries** at CLAIM and at handoff
- **`pnpm run generate:contract`** exit 0, `packages/contract/generated/{client.ts,openapi.json,field-inventory.json}` present, porcelain still 0

---

## Verdict: **PASS**

**B1 is DISCHARGED** (see `C9 round 2 — B1`). No blocking finding. Six non-blocking findings (N1–N6)
and twelve packet findings (P1–P12), each with a ticketable remedy.

I record plainly what a PASS here does and does not mean: the mechanism the commit ships is correct for
every arrangement a visitor can reach today, and I could not refute it after six mutants and a rival
implementation. It also ships a behaviour inversion for a shape no product surface has (N2), which is a
consequence of the RULING the packet made binding, not of the author's execution.

---

## What I measured, and how

Everything below is my own run in my own worktree. Where I quote a figure it is from a log in
`.hermes/reports/consent-ui/probes/code-rev-cross-02-r1-*`.

### The rule at HEAD, in one sentence

`apps/ui/components/consent/modalSemantics.ts:143-150` — **`topmostSurface()` walks `surfaceStack`
backwards from the last registered entry and returns the first entry whose `containerRef.current` is
either `null` or still connected to the document; `undefined` if the walk finds none.** No
`compareDocumentPosition`, no containment arm, no arrangement constraint. That is V-20 option (b) as the
packet states it.

### The three rankings it had to beat (packet §4, charge 2)

Every mutant snapshotted with `cp`, restored with `cp`, verified with `diff -q`; **never**
`git checkout --` (COMMON §10.44). `git status --porcelain` = 0 after each. Control first:

| | author's 3 suites | my probe (7 cases) |
|---|---|---|
| **HEAD c334136d (control)** | `Tests 46 passed (46)` / `Test Files 3 passed (3)` | `Tests 7 passed (7)` |

| mutant | what it plants | author's suites | my probe | discriminates? |
|---|---|---|---|---|
| **M1 `BASE-DOCORDER`** | `bd314084`'s whole helper (document order) | `6 failed \| 40 passed (46)` — P4, P7, `by OPEN order…`, `exactly one of three…`, `LAST-REGISTERED…`, `traps Tab…` | `3 failed \| 4 passed (7)` — **R1**, R7, R4 | **YES** — the cross-slice case is RED, as charged |
| **M2 `FIFO`** | first registered entry wins | `11 failed \| 35 passed (46)` — incl. `consent-policy-link > moves the visitor exactly ONE surface per Escape` (the S01-C6 case) | `6 failed \| 1 passed (7)` — **R1 and R3** | **YES** — S01-C6's Esc case AND the cross-slice case RED, as charged |
| **M3 `NOCONN`** | the `isConnected` skip removed | `2 failed \| 44 passed (46)` — both detached cases | `1 failed \| 6 passed (7)` — R5 | **YES** — the detached-incumbent outcome is RED, as charged |
| **M4 `STOPWALK`** (mine) | a detached entry aborts the walk instead of being skipped | `2 failed \| 44 passed (46)` — both detached cases | R5 RED | **YES** — the "keeps walking" half is genuinely pinned |
| **M5 `NONULL`** (mine) | a `null` container is SKIPPED instead of returned | **`46 passed (46)` — SURVIVES** | R6 RED | **NO** → finding **N1** |
| **M6 `NEIGHBOUR`** (the one my pins must NOT catch) | `lastIndexOf` → `indexOf` in the cleanup (entries are unique objects, so behaviourally identical) | `46 passed (46)` | `7 passed (7)` | correctly **not** caught |

Verbatim, M1, my binding case:

```
 FAIL  revcross.probe.test.tsx > … > R1 · /sign-up: card open, then the sign-up policy, ONE Escape closes the POLICY (B1)
AssertionError: (iii) the policy — opened last — is the one that closed: expected <div class="policyBezel" …(3)>…(1)</div> to be null
- Expected: null
+ Received: <div aria-labelledby="policy-modal-title" aria-modal="true" class="policyBezel" role="dialog">
```

### RED-first replay (packet §4, charge 5) — HEAD's test file against `bd314084`'s helper

```
 × tests/render/consent-cross-slice.test.tsx > … > P4 · one Escape closes the sign-up policy, not the cookie card underneath it 17ms
   → (ii) the cookie card the visitor was filling in is STILL open: expected null not to be null
 × tests/render/consent-cross-slice.test.tsx > … > P7 · the closed policy returns focus to its own opener and leaves the card's state alone 17ms
   → the policy closed: expected <div class="policyBezel" …(3)>…(1)</div> to be null

 FAIL  tests/render/consent-cross-slice.test.tsx > … > P4 · …
AssertionError: (ii) the cookie card the visitor was filling in is STILL open: expected null not to be null
 ❯ tests/render/consent-cross-slice.test.tsx:199:89
```

The frame is real and it is at the right line. `P5` and `P6` stay green under the base helper — see P1/P2
in the packet review for why that matters.

### The inversion (packet §4, charge 3) — probed, then settled by experiment

My own synthetic pair, built on the real helper (`revcross.probe.test.tsx` R4): a parent surface
containing a child surface, **both open at mount**, one commit.

```
R4 single-commit nested pair: outer=1 inner=0        (HEAD c334136d)
R4 single-commit nested pair: outer=0 inner=1        (base helper, and the containment variant)
```

**The claim is confirmed: at HEAD the OUTER surface answers `Escape` for a pair mounted in one commit.**
React runs effects child-first, so registration order is `[inner, outer]` and "last registered" names the
surface underneath.

**The product has no such pair — my own sweep, not the author's word.** Exactly two `useModalSurface`
consumers exist: `apps/ui/components/consent/CookiePreferencesCard.tsx:110` and
`apps/ui/components/consent/PrivacyPolicyModal.tsx:101`. Every mount of them in the repository:

| mount | shape |
|---|---|
| `apps/ui/components/consent/CookieConsent.tsx:209` | the card, when `surface === "card"` |
| `apps/ui/components/consent/CookieConsent.tsx:220-222` | the read-mode policy, conditional on `policyOpen`, a **sibling** of the card in one fragment — never nested |
| `apps/ui/components/SignUpFlow.tsx:339-347` | the consent-mode policy, conditional on `policyOpen`, a **sibling** inside `AuthShell` — never nested |
| `apps/ui/app/settings/page.tsx:79` | `<ConsentSettingsPanel />`, which mounts **neither** surface (it only raises a request through a callback) |

So no pair mounts in one commit, and nothing nests. The disclosure is accurate.

**Ruling on the pin — settled by running the rival, not by arguing it.** See **N2**.

### Every gate, ×3 from a `.sh` under `/bin/bash`, worst wins

`gates.sh` transcribed verbatim from the PLANs' fenced blocks — `CMD-C6` from `S01/PLAN.md:789-806`,
`CMD-C7` from `S01/PLAN.md:810-833`, `run()`/`run_c9` from `S02/PLAN.md:1377-1418`. Script header printed
`grep (BSD grep, GNU compatible) 2.6.0-FreeBSD` on all three passes, so the ASCII-anchor law was actually
exercised.

| gate | pass 1 | pass 2 | pass 3 | commit | pin | delta |
|---|---|---|---|---|---|---|
| `CMD-C6` | `verdict=0`, `Tests 14 passed (14)`, `Test Files 1 passed (1)` | identical | identical | c334136d | `1 passed (1)` | **meets it** |
| `CMD-C7` | `verdict=0`, `Tests 76 passed (76)`, `Test Files 6 passed (6)`, hit-list 1 (pinned 1), t9 failures 2, S01 css blocks 1 | identical | identical | c334136d | `6 passed (6)` | **meets it** |
| `run_c9` vitest half | `vt=0 guard=0 VERDICT=0`, `Tests 110 passed (110)`, `Test Files 10 passed (10)` | identical | identical | c334136d | `10 passed (10)` | **meets it** |
| `run_c9` merge arms | `--scrim:=1 (expect 2)  S02markers=1 (expect 2)` → PROPERTY verdict 1 | identical | identical | c334136d | the known PLAN defect `t_4f97ca86` | **the arms fail; the PROPERTY holds** — see below |
| the consent **SET** | `exit=0`, `Test Files 17 passed (17)`, `Tests 193 passed (193)` | identical | identical | c334136d | 15 glob matches + the 2 named = **17** | **+1 file, +8 tests vs `bd314084`'s 16/185** |
| root `pnpm typecheck` | `exit=1 total=8 outside-the-pin=0` | identical | identical | c334136d | 8, all `tests/unit/s14-ui.test.ts` | **no diagnostic outside the pin** |
| `apps/ui` `npx tsc --noEmit -p tsconfig.json` | `exit=0` | identical | identical | c334136d | exit 0 | **meets it** |
| `t9-mode-tokens` | `Tests 2 failed \| 7 passed (9)`, hit list exactly one element | identical | identical | c334136d | `2 failed \| 7 passed (9)`, one hit at `globals.css:6116` | **meets it** |

The t9 hit list, verbatim and complete (one element, at the pinned line):

```
+   "/…/.worktrees/rev-cross-02/dialectical-engine/apps/ui/app/globals.css:6116:background: color-mix(in srgb, #0a0806 32%, transparent);",
```

and the two pre-existing failures by name — `renders one accessible toggle that reads the document mode,
flips it, and persists it` and `leaves no mode-inert colour literal in the four Wave-0 product files`.
Both are `ui-overhaul`'s; neither is this commit's.

**The `run_c9` merge arms — the PROPERTY evaluated, not the arm.** The arms are the known PLAN defect
`t_4f97ca86` and my packet told me to evaluate the property instead. Measured:

- `grep -c -- '--scrim:' apps/ui/app/globals.css` = **1**, at `globals.css:65`, inside `:root`. The PLAN
  derives `2` from "declared once in each of the two token blocks S01 owns", but `--scrim` is a
  **mode-independent** token — it is registered in `tests/unit/t9-mode-tokens.test.ts:308`'s
  `MODE_INDEPENDENT` map, and COMMON §7 defines it that way. A mode-independent token is declared once.
  **The arm's derivation is false; the property "S01's token block survived the merge" HOLDS.**
- `grep -c -- '=== consent-ui S02 ===' apps/ui/app/globals.css` = **1**, at `globals.css:7617`. The
  closing marker is spelled `=== end consent-ui S02 ===` (`globals.css:8036`), which does not contain the
  opening marker's literal, so the count can never be 2. **The arm is unsatisfiable as written; the
  property "S02's block survived, exactly once" HOLDS** (open 7617, close 8036). S01's block is likewise
  intact (`7244` / `7615`).

Both halves of `t_4f97ca86` are confirmed from a second, independent seat.

**Honest limitation of `CMD-C6` in a review worktree.** Its two S02 arms are **vacuous here**:
`git rev-parse --verify -q slice/consent-s02` resolves to `c334136d`, which is also my HEAD, so
`git log c334136d..HEAD -- <the four S02 paths>` is necessarily empty and `git diff --stat HEAD` on a
clean tree is necessarily empty. The arms pass by construction, not by evidence. They are meaningful only
in the S01 lane. Recorded as **P12** rather than reported as a green gate.

### Boundaries

`git diff --name-only bd314084 c334136d` — exactly five paths, every one inside the work packet's
`allowed` list:

```
apps/ui/components/consent/modalSemantics.ts
docs/architecture/01-decisions/ADR-0022-shared-modal-semantics.md
tests/render/consent-cross-slice.test.tsx        (new, 308 lines)
tests/render/consent-modal-semantics.test.tsx
tests/render/consent-policy-link.test.tsx
507 insertions(+), 158 deletions(-)
```

- **Nothing outside the allowed surface.** `PROGRESS.md`, `PLAN.md`, `SPEC.md`, `globals.css`,
  `CookieConsent.tsx`, `CookiePreferencesCard.tsx`, `CookieBar.tsx`, `PrivacyPolicyModal.tsx`,
  `SignUpFlow.tsx`, `layout.tsx` — all untouched. The sixth allowed file, `S02/DECISIONS.md`, is written
  but untracked in git (this mission's `docs/missions/consent-ui/**` is not in the index), which is why
  it is absent from the commit and from every lane.
- **`globals.css` block discipline:** trivially satisfied — the file is not in the commit at all. The
  S01 and S02 delimited blocks are both intact (measured above).
- **Registration request shape unchanged:** no product file other than `modalSemantics.ts` is touched,
  and `git diff bd314084 c334136d | grep -nE '^[-+].*(register\(|adult_affirmed)'` prints **nothing**.
- **Exported shape — proved structurally, NOT with `grep '^[-+]export'`.** That grep is blind to a member
  added inside a `type X = Readonly<{ … }>` body (TOOLING-TRAPS `:2565-2578`). I emitted declarations for
  both revisions instead — `npx tsc --ignoreConfig --declaration --emitDeclarationOnly --removeComments`
  on `bd314084`'s and `c334136d`'s copies of the file — and `diff`ed them: **byte-identical.** Both print

  ```
  export type ModalSurface = Readonly<{
      containerRef: React.RefObject<HTMLElement | null>;
      initialFocusRef: React.RefObject<HTMLElement | null>;
      onClose: () => void;
      returnFocusRef?: React.RefObject<HTMLElement | null>;
  }>;
  export declare function useModalSurface(open: boolean, surface: ModalSurface): void;
  export declare function backdropCloseHandler(scrim: HTMLElement | null, onClose: () => void): (event: { target: EventTarget | null; }) => void;
  export declare function prefersReducedMotion(): boolean;
  export declare function openSurfaceCount(): number;
  ```

  The type BODIES are printed above, as the trap entry demands. `handleDocumentKeydown`, `trapTab`,
  `useModalSurface`'s focus capture/return and `openSurfaceCount` are unchanged in the diff.

### The flip list (packet §4, charge 4)

`consent-modal-semantics.test.tsx`: 24 cases at base → **25** at HEAD. Nineteen are byte-identical.

| # | base title → HEAD title | class | ruling |
|---|---|---|---|
| 1 | `…to the nested inner surface, not to the outer one it mounted with` → `…to the LAST-REGISTERED surface of a pair mounted in ONE commit` | **OUTCOME changed** (`innerClose 1` → `outerClose 1`) | the outcome was NOT the defect → a finding by my packet's own rule, filed as **N2**, non-blocking because the packet makes the ruling binding and my ruling on the pin "a finding, not a veto" |
| 2 | *(new)* `…to a nested inner surface that opened in a LATER commit` | **case ADDED** | correct and load-bearing: it pins the only nested shape a visitor can reach. Good work |
| 3 | `…to the innermost of three nested surfaces` → `…to exactly one of three surfaces, and it is the last registered` | **OUTCOME changed** (`["c"]` → `["a"]`) | same class as #1; the `toEqual` on the whole array still pins REQ-REV-01 B3 ("exactly one acts") |
| 4 | `…by document position when two surfaces opened out of DOM order` → `…by OPEN order when two surfaces opened out of DOM order` | **OUTCOME changed** (`secondDom` → `firstDom`) | **the outcome WAS the defect** — this is B1's abstract form. Not a finding |
| 5 | `never lets a DETACHED INCUMBENT stand, under a conformant compareDocumentPosition` → `never lets a DETACHED entry receive Escape, however many have detached` | **MECHANISM rewritten**, shim + both helpers deleted | **the outcome is still pinned, shim-free, and at least as strong** — measured: M3 `NOCONN` and M4 `STOPWALK` both RED it. It needs no `Node.prototype` patch and it covers a two-deep detached walk the old case could not reach |
| 6 | `traps Tab inside the nested inner surface, not inside the outer one` → `traps Tab in the same surface Escape reaches, for the same nested pair` | **OUTCOME changed** (`close-inner` → `outer-2`) | forced by #1; the case's real property (Tab and Escape read the SAME entry) is preserved and is now stated in the title |
| — | `never lets a surface whose container has detached consume Escape` | comment-only | assertions byte-identical; the corrected sentence ("the `null` branch, which RETURNS the entry rather than skipping it") is accurate for the new code |

**No assertion was weakened, and no title fails to describe its assertion.** I checked all six renamed
cases against their bodies: registration order `[inner, outer]` really does make `outer` last-registered
(#1); `[c, b, a]` really does make `a` last (#3); the Tab case really does land on `outer-2` (#6).

`consent-policy-link.test.tsx`: `it()` titles **identical**, assertions **identical**. Two changes:
the mechanism comment (`:204-211`) and one assertion MESSAGE string (`:222`,
`"the helper's own topmost rule"` → `"V-20's recorded arrangement"`). The `compareDocumentPosition`
assertion itself is untouched, so V-20's recorded arrangement pin stands. **Changing that message was
required, not optional** — the old message asserted the very claim the commit falsifies. The work
packet's "comment-only" label for that range is the packet's error, not the author's (**P4**).

### The promoted fixture vs the reviewer's original probe (packet §4, charge 4)

Original probe (`probes/code-rev-s02-c9-r1-crossslice.probe.test.tsx`, md5 `e72961de573a19f74b87cc112448d776`,
which I ran **byte-untouched** through my own scratchpad `--config`):

- **Every one of the seven cases has a promoted counterpart** — P1, P2, P3, P4, P5, P6, P7 → all present.
- **Layout order:** `<div className="appShell"><SignUpFlow client={client} /><CookieConsent /></div>` —
  `TopBar`-less, page-first, `CookieConsent` last. That is `apps/ui/app/layout.tsx:46-49` minus `TopBar`
  (`:47`), which is the right simplification: `TopBar` registers no modal surface.
- **P7's outcome is now the correct one, and I measured where focus lands.** At HEAD the original probe
  logs `P7 after the wrong close: policyOpen=false cookieBarBack=false activeElement=consentBox`; at the
  base helper the same line reads `policyOpen=true cookieBarBack=true activeElement=consentGhost
  consentGhostStrong`. My own R7 asserts it: **focus returns to `input[name="privacy-accepted"]`, the
  `.consentBox` checkbox that opened the policy** — CROSS-01's surviving-capture-first branch, because the
  opener is still on the page. The card's unsaved category toggles are unchanged across the close.
- **P5 still holds at the merged head:** green in every one of my runs, including under all six mutants
  (it does not read the helper).
- **No `LANE` env dependency remains:** the only occurrence of the string in the promoted file is inside
  the header comment that declares the substitution; the code uses `process.cwd()`
  (`consent-cross-slice.test.tsx:234`), the same idiom as `consent-policy-link.test.tsx`.
- **The oracle, per case, as it actually behaves** (this is where the work packet went wrong — **P1**):

  | case | at `bd314084` | at `c334136d` | discriminates? |
  |---|---|---|---|
  | P4 (original) | passes — its only assertion is `dialogs().length === 1`, true in both directions; the outcome is only `console.log`ged | passes | **NO** |
  | P6 (original) | passes | passes — under document order the card wins; under open order the card is the one opened last, so the card wins again | **NO alone** |
  | P7 (original) | passes | **FAILS** — `the policy the visitor is looking at is still open: expected null not to be null` | **YES — and that RED is the discharge** |

  Whole kit: `7 passed (7)` at base, `1 failed | 6 passed (7)` at HEAD.

---

## C9 round 2 — B1

**CODE-REV-S02-C9 r1 §B1 is DISCHARGED at `c334136d`. C9 (`t_d36df457`) can close.**

Measured by my own fixture, not by the author's, in the arrangement the finding names: mount `SignUpFlow`
then `CookieConsent` in one document in `layout.tsx`'s order (page content first, `<CookieConsent />`
last); nothing in storage; open the card with `Choose what to store`; open the sign-up policy from the
privacy checkbox row (`input[name="privacy-accepted"]` inside `.consentRow`, `SignUpFlow.tsx:287-291`);
press `Escape` **once**.

| assertion | required by B1 | measured at `c334136d` | measured with `bd314084`'s helper planted back |
|---|---|---|---|
| `openSurfaceCount()` goes 2 → 1 | yes | **1** ✓ | 1 (one surface closed either way — this alone never discriminated) |
| the policy closes | yes | `.policyBezel` is **null** ✓ | still present ✗ |
| the cookie card survives | yes | `.consentCard` **not null** ✓ | null ✗ |
| the bar has NOT come back | yes | `[role="region"][aria-label="Cookie consent"]` is **null** ✓ | present ✗ |
| the visitor's unsaved category choices survive | B1's harm | `aria-checked` array unchanged ✓ | lost ✗ |
| focus is not trapped in a surface that refused the key | B1's harm | focus is on `input[name="privacy-accepted"]` ✓ | on `.consentGhost.consentGhostStrong`, a **bar** control, while the policy stayed open ✗ |

Three independent confirmations, all mine: my `R1`/`R7`; the author's `P4`/`P7` red-then-green against the
planted base helper; and the original C9 probe's `P7` flipping from green to red, which is the discharge
in the inverted direction. A second `Escape` then closes the card (`openSurfaceCount()` → 0), so the
"exactly one surface per `Escape`" property (REQ-REV-01 **B3**) holds across both presses.

**The fix is not accidental.** M2 (`FIFO`) reds both the cross-slice case and S01-C6's own Esc case;
M1 (document order) reds the cross-slice case while leaving S01-C6 green — which is precisely why nine
clusters of single-slice suites never saw B1, and why COMMON §10.53 was written.

---

## Findings

Every remedy is marked `BINDING (measured: …)` or `ADVISORY` per COMMON §10.22. Every finding names its
CLASS and the sweep over that class.

### N1 — a property the shipped comment asserts is pinned by nothing

**`apps/ui/components/consent/modalSemantics.ts:129-130`** (the doc comment) states: *"An entry whose
container is `null` — a surface that renders no container of its own — still receives `Escape`, exactly
as before."* `:147` implements it (`container === null || container.isConnected`).

**Concrete inputs → wrong outcome.** Mutant **M5 `NONULL`**: change `:147` to
`if (container !== null && container.isConnected) return entry;` — a `null`-container surface is now
SKIPPED instead of answering. Two surfaces open, the later-registered one rendering no container: at
HEAD it answers `Escape`; under the mutant the surface UNDERNEATH answers and the container-less surface
can never be dismissed by keyboard.

**Evidence.** The mutant survives all three of the author's suites — `Tests 46 passed (46) / Test Files
3 passed (3)`, no failure of any kind. My `R6` catches it:
`the null-container entry, registered last, answered: expected "vi.fn()" to be called 1 times, but got 0 times`.

**CLASS and sweep.** The class is *branches of `topmostSurface()` that the shipped comment states as
properties*. There are exactly three: (a) last-registered wins — pinned, M1/M2 red it; (b) a detached
entry is skipped and the walk continues — pinned, M3/M4 red it; (c) a `null` container still wins — **not
pinned**. (c) is the only unpinned member.

**Severity: non-blocking.** No product surface has a `null` container: both consumers attach their ref
before `useEffect` registers them, so the branch is unreachable today (my sweep above). The cost is
future: the next consumer to rely on the documented behaviour regresses it silently.

**Remedy: `ADVISORY`** — add one case to `consent-modal-semantics.test.tsx` mounting two `TestSurface`s
where the later one renders no container, asserting the later one's `onClose` runs. I did not measure the
exact idiom against the author's existing `TestSurface` helper (my `R6` uses my own), so I will not call
it BINDING. **The CLASS binds:** the unpinned documented branch must be pinned or the sentence removed.
Ticket it.

### N2 — the ruling as executed re-creates B1's failure mode for any future nested pair, and a narrower rule was available

**`apps/ui/components/consent/modalSemantics.ts:143-150`**; pinned by
`consent-modal-semantics.test.tsx:154`, `:215`, `:421`.

**Concrete inputs → wrong outcome.** A future overlay that renders a nested surface open at mount — a
confirm dialog inside a drawer, a lightbox inside a modal — registers child-first, so `Escape` closes the
OUTER surface while the INNER one stays open with focus trapped inside it, and whatever the visitor was
doing in the outer surface is discarded. **That is B1's exact harm, in a different shape.** Measured:
`R4 single-commit nested pair: outer=1 inner=0`.

**Evidence that it was avoidable.** I implemented the rival and ran it rather than arguing it — open order
**plus a containment-only tiebreak** (walk backwards; keep the last connected entry; let a lower entry win
only when the incumbent's container `CONTAINED_BY` it — never the `FOLLOWING` arm that caused B1):

```
--- author suites under the containment variant ---
 FAIL … > delivers one Escape to the LAST-REGISTERED surface of a pair mounted in ONE commit
 FAIL … > delivers one Escape to exactly one of three surfaces, and it is the last registered
 FAIL … > traps Tab in the same surface Escape reaches, for the same nested pair
  Test Files  1 failed | 2 passed (3)
       Tests  3 failed | 43 passed (46)
--- the FULL consent SET under the containment variant ---
  Test Files  1 failed | 16 passed (17)
       Tests  3 failed | 190 passed (193)
```

**Every cross-slice case stays green** (`consent-cross-slice.test.tsx` passes entirely, so B1 stays
discharged), `consent-policy-link.test.tsx` stays green, and 190 of 193 tests in the whole consent SET
pass. **The only three failures are the three cases that exist to pin the inversion itself.** And because
no product surface nests (my sweep), the containment arm is a **no-op for every shape that ships today** —
it changes nothing a visitor can reach and removes the trap for the shape they cannot.

**Severity: non-blocking, and explicitly not a veto.** The packet states V-20 (b) — "no
`compareDocumentPosition`, no containment arm" — as the binding ruling, and the author implemented it
exactly, disclosed the consequence in three places (`modalSemantics.ts:134-141`, the ADR addendum, the
DECISIONS row), and pinned it. **The author did the right thing with the wrong rule.** The finding is
against the ruling.

**Remedy: `BINDING (measured: the containment variant above — 190/193 of the consent SET green, all seven
cross-slice cases green, only the three inversion pins red)`** — route to V as a row under V-20: *"(b) as
ruled ships an inversion for nested pairs mounted in one commit; (b′) = (b) plus a containment-only
tiebreak removes it at the cost of one `compareDocumentPosition` call, changes no reachable behaviour, and
keeps B1 discharged."* Not the author's to implement under this packet. **The CLASS binds:** any rule for
"which surface is on top" must be checked against the nested shape as well as the sibling shape, because
this mission has now been bitten by one of the two.

**STRONGEST COUNTER, stated fairly:** the ADR's own argument is that a z-rank or a DOM rank "would restate
the ladder in TypeScript", and a containment arm is a partial DOM rank — the very thing whose partiality
produced B1. There is real value in a rule with one input. The counter loses on the measurement: the
`FOLLOWING` arm is what mixed unrelated surfaces up, `CONTAINED_BY` alone cannot, and the experiment shows
the narrower rule costs three synthetic pins and nothing else. But it is a genuine design position and
V — not I — should close it.

### N3 — the promoted integration suite is in no cluster command

`tests/render/consent-cross-slice.test.tsx` exists to close the structural gap COMMON §10.53 names, yet
`run_c9`'s file list (`S02/PLAN.md:1477`, ten files) does not include it, and neither does `CMD-C7`
(`S01/PLAN.md:812`, six files). **The cluster gate written to catch cross-slice regressions still does not
run the only cross-slice test.** It is caught today only by the `tests/render/consent-*.test.tsx` glob in
the BASELINE SET command, which is not a cluster gate and has no `Test Files <n>` arm tied to a PLAN.

**Concrete inputs → wrong outcome.** A later commit breaks the Esc stack across the slice boundary; a seat
runs `run_c9` (its cluster's gate) and sees `Test Files 10 passed (10)`; the regression ships.

**CLASS and sweep:** *test files added after their cluster's command was frozen*. `consent-cross-slice` is
the only member — every other file in the SET appears in `run_c9` or `CMD-C7`. (I verified by name against
both lists.)

**Severity: non-blocking; not the author's fault** — `PLAN.md` is in the work packet's `forbidden` list.
**Remedy: `BINDING (measured: run_c9's list has 10 named files and consent-cross-slice.test.tsx is not
among them; the SET has 17)`** — a PLAN edit raising `run_c9` to `11` and adding the path, per COMMON
§10.31 (line-count-preserving, or re-pin the citations). Orchestrator's, same day.

### N4 — `S02/DECISIONS.md:207` cites a probe that cannot prove what it is cited for

The row's evidence for "the exported surface is byte-identical" is
`git diff bd314084 -- …/modalSemantics.ts | grep '^[-+]export'` **prints nothing**. TOOLING-TRAPS
`:2565-2578` (written 2026-09-07 05:30, **one minute before this commit**) records that the same empty
output means both "no signature changed" and "a member was added to an exported type", so the command
cannot tell a pass from its own blind spot.

**The conclusion is TRUE** — I proved it independently by declaration emit — but a permanent decision
record now carries a refuted probe as its warrant, and the next seat will copy it.

This is sharper than the packet's own defect (**P5**), because the author **identified the class while it
was happening**: their handoff's N-E reports that TOOLING-TRAPS grew under them and that "one of the
entries added mid-run (`:2566`) invalidated a guard MY packet mandates". Naming the class and then writing
the refuted instance into an append-only decision record is the gap. COMMON §10.60's second half —
*"a guard refuted by a newer entry is reported, not obeyed"* — was reported and then obeyed anyway.

**CLASS and sweep:** *refuted guards transcribed into permanent artifacts*. Members: `DECISIONS.md:207`
(this one) and the work packet's own `:19`, which MANDATED the guard (filed as **P5**). The ADR addendum
does **not** cite it — I checked. Two members, both named.

**Severity: non-blocking. Remedy: `BINDING (measured: TOOLING-TRAPS :2565-2578, and my own
`tsc --declaration --emitDeclarationOnly` diff, which is byte-identical for both revisions)`** — replace
the parenthetical in `DECISIONS.md:207` with the declaration-emit evidence, or delete the warrant and keep
the claim. Append-only file: a dated correction line, not an edit in place.

### N5 — `CookieConsent.tsx:191-198` still states the false mechanism, and no packet has allowed anyone to fix it

The JSDoc at `apps/ui/components/consent/CookieConsent.tsx:191-206` opens **"DOM ORDER IS LOAD-BEARING,
and this is the whole of it. The shared helper resolves which of two unrelated open surfaces is topmost by
DOCUMENT POSITION — `CONTAINED_BY || FOLLOWING` — and not by the order they opened in"**, and continues
*"with the two swapped, one press of the dismiss key closes the CARD and leaves the policy standing over
nothing."*

At `c334136d` every sentence of that is **false**: there is no `compareDocumentPosition` in the module, and
with the two elements swapped the policy would still win, because it is opened last. I verified the text
is unchanged by this commit (`CookieConsent.tsx` is not in the diff) and that it is currently false (my R1
plus the emitted declarations).

**CLASS and sweep — the false-mechanism class, swept past the files and onto the BOARD.** Members and
their state at `c334136d`:

| member | state |
|---|---|
| `modalSemantics.ts:51-60` (the stack comment) | **fixed** by this commit |
| `modalSemantics.ts` `topmostSurface()` doc comment | **fixed** by this commit |
| `consent-policy-link.test.tsx:204-211` + the `:222` assertion message | **fixed** by this commit |
| `CookieConsent.tsx:191-206` | **STILL FALSE** — the file is in the work packet's `forbidden` list. Already ticketed: the orchestrator's 05:40 addendum on **`t_51101c72`** carries it |
| **`t_457c9898` (board), status `ready`** | **STILL OPEN WITH A DEAD PREMISE** — see below |
| `S02/DECISIONS.md` earlier rows (2026-09-07, CODE-REV-S02-C5C6 r1 N2) | superseded in place by the new row at `:207`, which quotes and overrides them — acceptable for an append-only file |
| ADR-0022's **Decision** paragraph | explicitly superseded by name in the addendum — acceptable |

The file member is my packet's charge (v) and is confirmed — and it is already routed, so I do not open a
second ticket for it.

**The member nobody swept is on the board.** Ticket `t_457c9898`
(*"CONSENT-ESC-STACK-DOM-ORDER — S01-C6 must render `<PrivacyPolicyModal>` AFTER the preferences card in
DOM order and pin it … BINDING, measured"*) is still `ready`, and its body opens
*"modalSemantics.ts:121-125 resolves unrelated siblings by document order (`CONTAINED_BY || FOLLOWING`)"*
— false at `c334136d` — while ordering a **BINDING** constraint that no longer exists. Its own body even
names what shipped: *"Alternative under V-20 option (b): drop the FOLLOWING arm (open order), which removes
the constraint."* An open ticket carrying a binding order whose premise is dead is worse than a stale
comment: a seat is dispatched from it. `CookieConsent.tsx:191-198` cites this very ticket id as its
authority, so the two members hold each other up.

**Severity: non-blocking (no comment or ticket ships a defect), but both are live falsehoods a future seat
will read as law** — the same sentence that produced B1's arrangement reasoning in the first place.
**Remedy: `BINDING (measured: `CookieConsent.tsx:191-206` is unchanged at c334136d; `t_457c9898` is
`ready` with 0 comments; and `compareDocumentPosition` no longer occurs anywhere under
`apps/ui/components/consent/`)`** — (a) the file member rides `t_51101c72` as routed; (b) **close or
supersede `t_457c9898`** with a comment recording that V-20 (b) dissolved its constraint and that the
arrangement survives only as V-20's recorded shape, pinned at `consent-policy-link.test.tsx:220-223`.
(b) is new and is the orchestrator's, same day. **The CLASS binds: sweeping a false-mechanism claim means
sweeping the board too, not only the source tree** — `heartbeat-protocol` §2.2, one surface out.

### N6 — the commit message's `Co-Authored-By` trailer names a different model from the mission roster

`git show --no-patch c334136d` ends `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, while
COMMON §0 routes coding to **Opus 5**.

I record this as a finding **only to close it**: the trailer is a harness constant emitted by the Claude
Code CLI, not a model self-declaration, and my own session — an Opus 5 seat — is instructed to emit the
identical string. **It is therefore not evidence of a roster violation and must not be read as one.**
Filed so the next reviewer does not spend the ten minutes I spent. **Remedy: `ADVISORY`** — if the fleet
wants model provenance in git, it needs a seat-supplied trailer; the CLI's cannot carry it.

---

## Packet review

Both packets are in scope: the work packet that dispatched CROSS-02 and my own. A wrong constant in either
is a finding against the orchestrator, never against the author who obeyed it.

### Against `CODE-CROSS-02.md` (snapshot `snapshots/packets/CODE-CROSS-02.md.at-dispatch`)

**P1 — charge (i) CONFIRMED. `:23` names a non-oracle as the oracle.** *"P4 RED at BASE, and GREEN after
your change, is the oracle (COMMON §10.10)."* Measured against the probe itself: the original P4's only
assertion is `expect(dialogs().length, "exactly ONE surface consumed the Escape").toBe(1)`
(`code-rev-s02-c9-r1-crossslice.probe.test.tsx:149`); the discriminating observation is a `console.log`
at `:138`. One surface closes under BOTH rankings, so the count is 1 either way and **P4 is GREEN at
`bd314084`**, which I ran: the whole kit is `7 passed (7)` there. A packet cannot name "RED at base" for a
case that is green at base. The case that discriminates is **P7**, which goes RED against the fix. This is
COMMON §10.59's own rule (*"a probe cited as an oracle is READ to its assertions first"*) — written into
COMMON from this very defect, and the packet still shipped with it.

**P2 — charge (ii) CONFIRMED. `:9` is false.** *"Under the ruling, the reviewer's control case P6 FLIPS by
design."* P6 opens the policy first and the card second. Under document order the card wins (it is later in
the document); under open order the card wins (it was opened last). **Same answer, so P6's assertions are
unchanged and it passes in both directions** — I ran it both ways: `P6 after ONE Escape (policy opened
FIRST): card=false policyBezel=true` at base AND at HEAD. P4 and P6 are a **discriminating PAIR** and
neither pins open order alone, exactly as COMMON §10.62 now records.

**P3 — charge (iii) CONFIRMED. `:6` cites `modalSemantics.ts:129-150`; the function is `:129-152` at
`bd314084`.** `:150` is the loop's closing brace; `:151` is `return top;` and `:152` is the function's own
brace. The cited range cuts the return statement off. COMMON §10.24's class.

**P4 — charge (iv) CONFIRMED. `:19` calls `consent-policy-link.test.tsx:203-218` "comment-only".**
Measured at `bd314084`: `:203-207` is comment; **`:208-218` is executable** — `mountBar();` at `:208`
through the assertion message at `:218`. COMMON §10.61's class, and the entry names this exact instance.
Consequence for the author: none — changing the `:218` message was *required* by the charge, since the
message asserted the falsified mechanism.

**P5 — new. `:19` mandates a guard that TOOLING-TRAPS refuted before the commit.**
*"NO exported shape changes: `git diff bd314084 -- …/modalSemantics.ts | grep '^[-+]export'` must print
nothing."* TOOLING-TRAPS `:2565-2578` (05:30) records that this command is blind to a member added inside a
type body. The packet was dispatched with it, the author obeyed it, and the refuted warrant is now in
`DECISIONS.md:207` (**N4**). COMMON §10.60 says a guard refuted by a newer entry is *reported, not obeyed* —
and it also says **packets record the TRAPS line count at dispatch**, which this packet does not do, so the
seat had no way to know which entries were new.

**P6 — charge (v) CONFIRMED. The allowed list left a member of the false-claim class in a forbidden file.**
`CookieConsent.tsx:191-206` — see **N5**. The packet identified the class ("**The helper's own comment is
false for this product** … Both are yours to correct — comments only, in the files this packet allows") and
then scoped `allowed` so that one member could not be corrected. `heartbeat-protocol` §2.2: fix the CLASS,
not the instance.

**P7 — the packet's own dry-run duty (COMMON §10.55) was not discharged for the flipping cases.** §10.55
requires the orchestrator to list every existing case the new rule touches and say per case whether it stays
green. Three cases flipped (`consent-modal-semantics.test.tsx` #1, #3, #6 in my flip list) and the packet
mentions none of them; it predicted a flip only for P6, which did not flip. A correct dry-run would have
produced the true list and would have surfaced N2 at dispatch instead of at review.

### Against my own packet, `CODE-REV-CROSS-02-R1.md`

**P8 — a mandatory deliverable is outside the `allowed` list.** §4 orders, twice, *"Post that ruling as ONE
comment on `t_d36df457`"*, and the dispatch comment repeats it; §1's `allowed` names only `t_b29567cd` and
`t_cde7254d`. `heartbeat-reviewer` §1 makes that a defect by name, and COMMON §10.41 requires ONE exhaustive
allowed list. **I posted to `t_d36df457`** — two sections and the dispatch order it explicitly, and the
enumeration is the stale artefact — and I am declaring it rather than hiding it.

**P9 — COMMON §10.54 is violated by construction, again, and it anchored me.** §10.54 exists because a
required read handed the CROSS-01 reviewer the author's unverified figures. My packet's read-FIRST list
(`:5`) orders `BASELINE.md` read **in full**; the instruction to skip its `CLAIMED — UNVERIFIED` section
appears only in the **Appendix** (`:36`), which by construction is opened LAST. So I read
`BASELINE.md:50` — "claimed `Test Files 17 passed (17) / Tests 193 passed (193)`; `run_c9` vitest half
claimed 110/110" — **before** measuring anything. My figures match, which is the good outcome; the bad
outcome is that no one can now tell whether they match because they are right or because I was anchored.
The exclusion must sit **in the read-FIRST list**, at the point of reading.

**P10 — the same leak has a second, larger channel nobody has closed: TOOLING-TRAPS.** COMMON §8 and §10.60
make it a mandatory read; the author appended two entries about THIS commit at `:2600-2614` before I
started, including its own analysis of the P4/P7 oracle and the phrase *"the assertion the verdict quotes as
RED-at-base … is not in the promoted file at all"*. **The author's conclusions therefore reached me through
a mandatory read, before the appendix.** §10.52's blindness cannot survive a shared append-only file that
every seat must read and the author under review has just written to. This one is structural and it will
recur on every mission until it is designed away.

**P11 — no TRAPS line count at dispatch.** COMMON §10.60 makes it an orchestrator duty; my packet omits it,
so "re-read everything past that line" had no line. I read `:2440-2614` by inspection instead.

**P12 — two scratch locations, and a gate whose discriminating arms cannot fire here.** §1 grants
`.review-scratch/` inside my worktree *and* points at COMMON §10.11's scratchpad; §10.11 wins and I used
it, leaving `.review-scratch/` unused and the worktree clean. Separately, §4 orders `CMD-C6` as a gate, but
in a detached review worktree `slice/consent-s02` resolves to my own HEAD, so both of its S02 arms are
vacuously true (measured: `commits in c334136d..HEAD touching them: 0`, `working-tree diff: 'none'` — on a
tree where no other value is reachable). Reported as evidence-free rather than as a green gate.

**Refuted charge, recorded.** My packet's constants that I checked and found **correct**: the commit stat
(507 insertions / 158 deletions, five files, `consent-cross-slice.test.tsx` 308 lines,
`consent-modal-semantics.test.tsx` 227 changed); the review package at 1016 lines; `SignUpFlow.tsx:339-347`
and `CookieConsent.tsx:221`; `layout.tsx:46-49`; `CookieConsent.tsx:191-198`; `CODE-CROSS-02.md`'s `:6`,
`:9`, `:19`, `:23`; the t9 pin `2 failed | 7 passed (9)` with one hit at `globals.css:6116`; the typecheck
pin; and — notably — its description of `consent-policy-link.test.tsx` as **"comment-only + one assertion
MESSAGE"**, which is precise where the work packet's "comment-only" was wrong.

---

## Appendix — the author's claims, opened after everything above was on disk

Order of work, so the blindness is auditable: I posted `CLAIM`, measured everything, wrote this file
through the end of the packet review, posted a `HEARTBEAT` naming the logs, and only then read the
`READY FOR PEER REVIEW` comment on `t_cde7254d` and the board tickets. The two places the blind was
already broken before I could act are **P9** and **P10** — declared there, not hidden here.

**The author's `SKILLS LOADED` against the worker floor — complete, no shortfall.**

```
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker,
superpowers:receiving-code-review, superpowers:test-driven-development,
superpowers:verification-before-completion, superpowers:systematic-debugging
```

`heartbeat-protocol` §1's worker row requires `test-driven-development`,
`verification-before-completion`, `systematic-debugging` and `receiving-code-review` (on rework — and
this seat was discharging a reviewer's blocking finding, so COMMON §10.39 required it anyway). All four
are present, plus the router and `using-superpowers`, in the order the packet's §13 lists them. Nothing
named that the floor does not need; nothing needed that is missing.

**Every figure, mine against theirs.** I measured before reading these.

| figure | author claims | I measured | agree? |
|---|---|---|---|
| `run_c9` vitest half | `110 passed (110)`, `Test Files 10 passed (10)`, ×3 | identical, ×3 | ✓ |
| the consent SET | `193 passed (193)`, `Test Files 17 passed (17)`, ×3 | identical, ×3 | ✓ |
| SET at `bd314084` | `185 passed (185)`, `16 passed (16)` | (BASELINE's pin; I did not re-run the base set) | consistent |
| `CMD-C6` | `verdict=0`, `14 passed (14)`, `1 passed (1)` | identical | ✓ |
| `CMD-C7` | `verdict=0`, `76 passed (76)`, `6 passed (6)`, hit-list 1, t9 failures 2, blocks 1 | identical | ✓ |
| root typecheck / `apps/ui` tsc / t9 | 8 in the pin, 0 outside / exit 0 / `2 failed \| 7 passed (9)` | identical | ✓ |
| the original probe at base / at HEAD | `7 passed (7)` / `1 failed \| 6 passed (7)`, P7 the discharge | identical | ✓ |

No divergence in any number. The author also **disclosed** that `CMD-C6` read `verdict=1` before the
commit (its working-tree arm is non-empty while the work is uncommitted) — that is honest and correct, and
it is the same arm I record as vacuous in my own worktree (**P12**).

**Where we converge independently** — the author charged, and I separately measured, all four of the work
packet's defects (my P1–P4 = their defects 1–3, my P6/N5 = their defect 4), the inversion (their N-A = my
N2), the TRAPS-freshness class (their N-E = my P5/P11), and the SET rising to seventeen (their N-D). Two
blind seats arriving at the same four packet defects is evidence the defects are real, not that either of
us is clever.

**Where I add something they did not have.**

- **N1** — the unpinned `null`-container branch. The word "null" in that sense appears nowhere in their
  handoff; the mutant that exposes it (**M5**) is mine. This is the one place their suites are green for a
  reason nothing holds.
- **N3** — `consent-cross-slice.test.tsx` is in no cluster command. Their N-D notices the SET grew to 17
  but not that `run_c9` still names ten files and none of them is the new one.
- **N2, upgraded from an assertion to a measurement.** Their N-A says the inversion "is the price of
  dropping the containment arm, and it is one function to undo". They did not run the version with the arm
  kept. I did: 190/193 of the consent SET green, every cross-slice case green, only the three inversion
  pins red. V now has a costed option instead of a claim. **This is the finding I predicted a second lens
  would miss, and the author missed it too** — recorded because a prediction that only ever confirms me is
  worth nothing.
- **N4** — they identified the export-grep guard as invalidated mid-run (N-E) and nevertheless left it
  standing as the warrant in `DECISIONS.md:207`. Naming the class and then transcribing the refuted
  instance into a permanent record is the sharper half of the finding, and it is theirs, not the packet's.
- **P7** — nobody charged the §10.55 dry-run duty; three cases flipped and the packet predicted none of
  them.
- **The board sweep in N5.** Their defect 4 stops at the file. `t_457c9898` is still `ready` with a dead
  binding premise, and `CookieConsent.tsx:191-198` cites it as its authority.

**Routing already done, which I am not duplicating:** the orchestrator's 05:40 addendum on `t_51101c72`
carries the `CookieConsent.tsx` member. My new tickets are N1, N2 (a V-20 row), N3, N4, and N5(b)
(`t_457c9898`).

**One claim of theirs I checked and could not fault:** their handoff routes N-B to `t_51101c72`, which by
its title is CROSS-01's residue ticket and not obviously the right home. It is the right home — the
orchestrator put the addendum there deliberately, and that ticket is scoped "comment/doc edits only …
next lawful seat on the S02 lane after CROSS-02". I spent time refuting this and failed; recording it as a
dead end so the next reviewer does not.

---

## What I did NOT verify

- **The dev stack.** Nothing here was exercised in `https://localhost:3000`, in either mode. QA is V
  personally and the visual/both-mode acceptance is V's; every figure above is jsdom.
- **`prefers-reduced-motion`, the scrim, backdrop close, and the focus TRAP itself** beyond the cases the
  three suites already carry — unchanged by this commit and out of my charge.
- **The other 14 files of the consent SET case-by-case.** I ran the set (17/17, 193/193) and read the
  three files the commit touches; I did not audit the rest.
- **Whether jsdom's `Escape` dispatch matches a real browser's** for the nested-pair shape. The inversion is
  a React effect-ordering property, not a DOM one, so I expect it to hold in a browser — but I did not
  measure it in one, and N2's remedy should be re-measured there before it is closed.
- **The S01 lane's own `CMD-C6` S02 arms** (P12) — they cannot be evaluated from here.
- **Token values, copy fidelity, contrast** — S01/S02 cluster reviews own those; this commit adds no token
  and changes no string a visitor sees.

## Predictions

I expect the other lens on this commit — if one runs — to confirm B1's discharge (it is unambiguous and
three separate probes agree) and to reproduce the `run_c9` merge-arm property, since the arms fail loudly.
I predict it will **not** run the containment-tiebreak rival (N2), because the packet frames the ruling as
binding and the natural reviewer move is to record the inversion rather than to implement the alternative
and measure it — that is the finding I would check first if I were auditing me. I predict it will **miss
N1**, the unpinned `null`-container branch, because the branch reads as obviously correct in the source and
only a mutant exposes that nothing holds it; and I predict it will miss **N3**, because `run_c9` is green
and nobody diffs a green command's file list against the SET. I expect it to find P1–P4 (the packet's own
charges point straight at them) and to miss **P9/P10**, the anchoring leaks, because a seat that was
anchored has no way to notice it was — I only caught them because the figures I had been shown happened to
be the ones I later measured. If a second lens contradicts me anywhere, the place to look first is my
containment variant: I ran it once per suite, not three times, and it is the only measurement here that
supports a recommendation rather than a verdict.

---

`comments read through: 3` (`t_b29567cd`) — measured with `k show` immediately before posting.
