# CODE-REV-S02-C5C6 — round 1 verdict · mission `consent-ui` · slice S02 clusters C5 + C6 + the C1 follow-up

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging`
`superpowers:receiving-code-review` — **not loaded this session** (COMMON §10.9 form): no finding of mine has been contested; I load it the moment the author refutes one.

**Verdict: PASS**

**Round:** 1 of max 3. **Target:** `t_22f0434b` / CODE-S02-C5C6 — `279d9577` (C1 follow-up, ticket `t_c0a98770`) · `da1e1fa6` (S02-C5) · `3d207a48` (S02-C6). **Base** `68f3ea33` (verified: `git rev-parse --short 279d9577^` → `68f3ea33`). **Branch** `slice/consent-s02-modal`.
**My worktree:** `.worktrees/rev-s02-c5c6/dialectical-engine`, detached at `3d207a48`, `git status --porcelain` = **0 entries at start and at exit**. `pnpm run generate:contract` → exit 0, tree still 0 entries.
**Blocking findings: 0. Non-blocking findings: 7 (N1–N7), each with a ticket line in §5.**
Nothing in the three commits is asked to change. Every N-finding routes to a packet, a plan sentence, a DECISIONS line or another cluster's surface — none to a rework of C5/C6.

---

## 1. Packet review (`heartbeat-reviewer` §1) — the packet that dispatched the work

`CODE-S02-C5C6.md` is **byte-identical to its at-dispatch snapshot** (`diff` → empty), so the words I judge are the words the seat read.

| Packet constant | Measured | Verdict |
|---|---|---|
| base `68f3ea33` | `git rev-parse --short 279d9577^` = `68f3ea33` | correct |
| three commits, order C1-follow-up → C5 → C6 | `git log --oneline 68f3ea33..3d207a48` = `3d207a48`, `da1e1fa6`, `279d9577` | correct |
| review package "1181 lines" | `wc -l` = 1181 | correct |
| `.policyGateHint` at `:255` | `grep -n` → 255 | correct |
| listeners at `PrivacyPolicyModal.tsx:118,122` | `:118` `region.addEventListener("scroll", …)`, `:122` `window.addEventListener("resize", …)` | correct |
| `scrollIntoView` guarded at `:147` | `:147` `section?.scrollIntoView?.({` | correct |
| `modalSemantics.ts:29`'s new comment | diff hunk `@@ -29 +29,9 @@` | correct |
| `.srOnly` at `apps/ui/app/globals.css:684` | `:684` `.srOnly {` with the full clip treatment | correct |
| eyebrow len 45, U+00B7 at 15 and 22 · title 22 ASCII · lede 117, U+2014 at 97 | codepoint dump (probe `…-copy-fidelity.mjs`) reproduces all three exactly | correct |
| `allowed` vs deliverables | verdict path, self-report path, `.review-scratch/`, TOOLING-TRAPS append, `probes/`, comments on both tickets — every mandatory deliverable is inside `allowed` | correct |
| packet path resolves from the seat's cwd | absolute main-tree path; my worktree has no `docs/missions/consent-ui/` | correct |

**One packet-class defect found: N5 (COMMON §10.36's stated reason is false for `.hermes/TOOLING-TRAPS.md`).** Filed against COMMON, not against the seat. The author's own D1–D4 are re-measured in §4 and D1 is upheld as a PLAN defect (N6).

**Author's `SKILLS LOADED` against the worker floor** (`heartbeat-protocol` §1: `test-driven-development` · `verification-before-completion` · `systematic-debugging` · `receiving-code-review` on rework): six declared — `superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:systematic-debugging` — plus `receiving-code-review` declared **not loaded** in §10.9's exact form with the reason "round 0, nothing of mine has been reviewed yet". **Floor met; the honest-shortfall form is correct; no fabrication.** I cannot grep the author's transcript; the orchestrator's exit check on `t_22f0434b` records "all six floor phrases found" — **UNVERIFIED by me**, stated so rather than repeated as mine.
**Self-report bar:** `agent-reports/CODE-S02-C5C6.md`, 243 lines, case-file shape — cause not symptom (§1 "a test that was GREEN for the wrong reason"), prices, dead ends (§4), an errors ledger (§6), and four packet defects raised rather than absorbed. **Meets the bar.**

---

## 2. What I verified, and how — verbatim outputs

Probe kit promoted to `.hermes/reports/consent-ui/probes/code-rev-s02-c5c6-r1-*` (14 files) **before** this verdict. Every file takes the lane from `argv`/`$LANE`; `grep -c '\.worktrees/'` over the kit = **0** in every file (COMMON §10.35).

### 2.1 The three cluster commands — ×3 from a `.sh` under `/bin/bash` AND ×3 inline (COMMON §10.16)

My own transcription of `PLAN.md:1376-1388`'s `run()`, not the author's script.

```
--- script (/bin/bash) run 1 / 2 / 3 — identical all three ---
S02-C1 | vt=0 guard=0 VERDICT=0 |       Tests  19 passed (19) |  Test Files  1 passed (1) | commit 3d207a48
S02-C5 | vt=0 guard=0 VERDICT=0 |       Tests  8 passed (8)   |  Test Files  1 passed (1) | commit 3d207a48
S02-C6 | vt=0 guard=0 VERDICT=0 |       Tests  22 passed (22) |  Test Files  2 passed (2) | commit 3d207a48
--- inline (tool shell, zsh) run 1 / 2 / 3 — identical all three ---
S02-C1 | vt=0 guard=0 VERDICT=0 |       Tests  19 passed (19) |  Test Files  1 passed (1) | commit 3d207a48
S02-C5 | vt=0 guard=0 VERDICT=0 |       Tests  8 passed (8)   |  Test Files  1 passed (1) | commit 3d207a48
S02-C6 | vt=0 guard=0 VERDICT=0 |       Tests  22 passed (22) |  Test Files  2 passed (2) | commit 3d207a48
```

**WORST RUN, both shells, all three clusters: `VERDICT=0`.** Re-stated at the final head `3d207a48` after all scratch was deleted (COMMON §10.34) — same three lines. The author's figures (C1 19/19 with `<n>`=1, C5 8/8, C6 22/22 two-file chain) are **confirmed exactly**.

**Guard satisfiability, known-BAD input** (§10.13's variant 7):
```
SANITY-MISSING | vt=0 guard=1 VERDICT=1 |  Tests  8 passed (8) |  Test Files  1 passed (1)
```
A missing second path yields a green summary and exit 0, and the `Test Files 2 passed (2)` arm is what rejects it. The guard discriminates.

### 2.2 Standing gates — the DELTA against `BASELINE.md`, never "green"

```
(1) pnpm run generate:contract         exit=0; porcelain 0 after it; packages/contract/generated/{client.ts,openapi.json,field-inventory.json} present
(2) pnpm typecheck                     exit=1; ran-arm '^\$ tsc --noEmit$' = 1; 8 diagnostics; OUTSIDE THE PIN = 0
                                       all 8 in tests/unit/s14-ui.test.ts (2×TS2307, 2×TS18046, 2×TS2339, 2×TS7006) — BASELINE's pin, delta zero
(3) pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts   exit=1;  Tests  2 failed | 6 passed (8)
      FAIL … > renders one accessible toggle that reads the document mode, flips it, and persists it
      FAIL … > leaves no mode-inert colour literal in the four Wave-0 product files
    colour-literal HIT LIST counted by §10.18's rule (`^\+ +"/.*:[0-9]+:`) = 1, and it is the pinned element:
      +   ".../apps/ui/app/globals.css:6096:background: color-mix(in srgb, #0a0806 32%, transparent);",
(4) pnpm exec vitest run tests/render/auth-flow-integration.test.tsx   exit=0;  Tests  18 passed (18)   [BASELINE addendum pins 18 on this branch since C4]
    pnpm exec vitest run tests/unit/v2ui-node-runner.test.ts           exit=0;  Tests  2 passed (2)
apps/ui PROJECT typecheck (COMMON §10.30):  cd apps/ui && npx tsc --noEmit -p tsconfig.json  →  exit=0, 0 diagnostics
```

### 2.3 Boundaries — the diff touches nothing outside the five files

```
$ git diff --stat 68f3ea33..3d207a48
 apps/ui/components/consent/PrivacyPolicyModal.tsx        | 280 ++++
 apps/ui/components/consent/modalSemantics.ts             |  24 +-
 tests/render/consent-modal-semantics.test.tsx            |  93 ++
 tests/render/consent-policy-modal-behaviour.test.tsx     | 406 ++++
 tests/render/consent-policy-modal-render.test.tsx        | 244 ++
 5 files changed, 1044 insertions(+), 3 deletions(-)
per commit:  279d9577  M modalSemantics.ts  M consent-modal-semantics.test.tsx
             da1e1fa6  A PrivacyPolicyModal.tsx  A consent-policy-modal-render.test.tsx
             3d207a48  M PrivacyPolicyModal.tsx  A consent-policy-modal-behaviour.test.tsx
forbidden paths in the range (apps/api, packages, migrations, tools, apps/runner, apps/scheduler,
  globals.css, SignUpFlow.tsx, privacyPolicy.ts, tests/integration, tests/unit/registration*): 0
globals.css: UNCHANGED across the range (git diff --quiet → true); S02 block markers at HEAD: 0 (C8 has not run — correct)
registration request shape: `git diff 68f3ea33..3d207a48 | grep -cE 'register\(|adult_affirmed'` = 0
colour literals (`oklch(|#hex|rgba?(`) in all five files: 0, 0, 0, 0, 0
```
**Each commit's surface is exactly its `allowed` list, and the C1 follow-up's extra grant was used for exactly the two files it names.**

### 2.4 Exported surface of `modalSemantics.ts` — byte-identical to `68f3ea33`

```
$ git show 68f3ea33:…/modalSemantics.ts | grep '^export'   vs   git show 3d207a48:…/modalSemantics.ts | grep '^export'
  diff → EMPTY (5 declarations before, 5 after, identical text)
```
Line numbers moved (`143→161`, `164→182`, `175→193`, `182→200`) because comments were added above; the declaration text did not. `git diff -U0` over the file shows **three hunks only**: the `:29` comment block, two sentences in `topmostSurface()`'s docstring, and the two `isConnected` statements inside its loop body. No signature, name or type moved.

### 2.5 Copy fidelity — design extract → component, codepoint-exact, skipping nobody's word for it

Two independent chains, both in the promoted kit:

```
SPEC §Copy → component constants            MATCH eyebrow (45)  MATCH title (22)  MATCH lede (117)  MATCH end (41)
  eyebrow len=45 nonAscii=[U+00B7@15 U+00B7@22]      title len=22 nonAscii=[]
  lede    len=117 nonAscii=[U+2014@97]               end   len=41 nonAscii=[U+00B7@14 U+00B7@35]
  gateHint len=44 nonAscii=[]
design/turn-10-cookie-consent.html → component:  EYEBROW, TITLE, LEDE, END_MARKER, "Questions: ", "privacy@dezbatere.ro"
  all six PRESENT-IN-DESIGN as literal substrings of the design's own bytes
literal \uXXXX escapes shipped in the component: 0        "Download PDF" in the component: false (design has it; V-3 removes it)
policy section bodies/bullets scanned from SPEC: 23 — INLINED into the component: 0
`privacyPolicy.ts` carries none of the header/end-marker/contact copy (grep = 0); the component imports POLICY_JUMP + POLICY_SECTIONS
```
My render probe asserts `textContent` against strings **read out of `SPEC.md` at runtime**, and the accent-token and pill→section tables are **parsed out of `SPEC.md`'s own tables**, so no assertion of mine can be satisfied by the component's own constants.

### 2.6 Behaviour, probed in jsdom with my own fixture and my own numbers

`probes/code-rev-s02-c5c6-r1-modal.probe.test.tsx` — **15 cases, `Tests 15 passed (15)`.** Boundary pair **691/692 against `scrollHeight` 1000 / `clientHeight` 300** (the author's is 291/292 against 500/200), and the metrics are driven by redefining the three accessors on **`Element.prototype`** with the **saved original descriptors** restored afterwards (the author shadows `HTMLElement.prototype` and restores with `delete`).

- `P1` header copy, end marker LAST in the region, contact line, `aria-modal`, `aria-labelledby` resolving to the title, one `aria-label="Close"` control whose text is `×`, zero `Download PDF`.
- `P2` eight pills in `POLICY_JUMP` order, each `data-jump` resolving to exactly one element; eleven sections, each `.policyNo` carrying `data-accent="<token>"` and inline `--accent: var(<token>)` **against R12's table parsed from the SPEC**; bodies equal to the data module's.
- `P3` `mode="read"`: no acknowledgement, exactly one `Close`, `onAcknowledge` never called after clicking **every** button, and **no `.policyGateHint` in the DOM at all**.
- `P4`–`P6` the criterion is `>= scrollHeight - 8` (slack read out of the SPEC's fenced block), latches, and re-evaluates on `resize` with no `scroll`.
- `P7` disabled + `aria-disabled="true"` + `aria-describedby` resolving to the SPEC's exact sentence + **no `title`**; and once the gate opens the hint leaves the DOM and the description with it.
- `P8`/`P9`/`P10` listener census — see below.
- `P11` `×`, `Escape`, scrim → `onClose` only; a click on the CARD closes nothing; `I have read it` → `["ack","close"]` in that order.
- `P12` a pill click with **no `scrollIntoView` stubbed anywhere** neither throws nor errors (precondition asserted: `Element.prototype.scrollIntoView` is `undefined` in jsdom 30.0.1).
- `P13` each pill asks **its** SPEC-mapped section once and every other section zero times, `{block:"start",behavior:"smooth"}`; under `matchMedia → matches:true`, `behavior:"auto"`.
- `P14` region `tabindex="0"` + `aria-label="Privacy Policy text"`.

**The listener census (the packet's "confirm no `keydown` of its own"):**
```
REV-P8 document: ["keydown"] window: ["resize"] element: ["scroll"]
```
Exactly one document-level `keydown` — the helper's — and the component's only own listeners are `scroll` on the region and `resize` on `window`. In `mode="read"` the element and `resize` lists are both **empty** (`P9`), and closing removes both (`P10`).

### 2.7 My own mutants — 20, applied with an anchor-count-checked applier, restored by `git checkout HEAD --` with an md5 equality check and `porcelain=0` printed after every one

| # | Mutant | Cluster cmd | Result |
|---|---|---|---|
| MR1 | `>=` → `>` | C6 | CAUGHT `Tests 2 failed \| 20 passed (22)` |
| MR2 | slack 8 → 7 | C6 | CAUGHT `2 failed \| 20 passed` |
| MR3 | slack 8 → 9 | C6 | CAUGHT `3 failed \| 19 passed` |
| MR4 | `resize` listener removed | C6 | CAUGHT `1 failed \| 21 passed` |
| MR5 | mount `evaluate()` removed | C6 | CAUGHT `3 failed \| 19 passed` |
| MR6 | latch removed (updater stops reading `latched`) | C6 | CAUGHT `1 failed \| 21 passed` |
| MR7 | `onAcknowledge` also fired from `×` | C6 | CAUGHT `1 failed \| 21 passed` |
| MR8 | `scrollIntoView` UNGUARDED (= the author's MC6o) | C6 | **CAUGHT — `vt=1 guard=0 VERDICT=1`** (see §4) |
| MR9 | `behavior:"smooth"` unconditionally | C6 | CAUGHT `1 failed \| 21 passed` |
| MR10 | *(no-op: renamed the shared `TITLE_ID` constant)* | C5 | SURVIVED — **my error**, re-run as MR10b |
| MR10b | `aria-labelledby` → a non-existent id, title keeps its own | C5 | CAUGHT `1 failed \| 7 passed (8)` |
| MR11 | pills sorted into document order | C5 | CAUGHT `1 failed \| 7 passed` |
| MR12 | a `Download PDF` control added | C5 | CAUGHT `1 failed \| 7 passed` |
| MR13 | *(no-op: added a second end marker)* | C5 | SURVIVED — **my error**, re-run as MR13b |
| MR13b | end marker genuinely moved out of last position | C5 | CAUGHT `1 failed \| 7 passed` |
| MR14 | region loses `aria-label` | C5 → SURVIVED; **C6 → CAUGHT** | the chain rule is what catches it |
| MR15 | region loses `tabIndex` | C6 | CAUGHT `1 failed \| 21 passed` |
| MR16 | `I have read it` rendered in `mode="read"` too | C6 | CAUGHT `1 failed \| 21 passed` |
| MR17 | acknowledge order reversed (`close` before `ack`) | C6 | CAUGHT `1 failed \| 21 passed` |
| MN1c | **advance loop REMOVED** (the packet's N5 charge) | C1 | CAUGHT — `FAIL … > advances past a control inside a disabled fieldset, so Tab is not a dead key`; the hidden-input case stays `✓` |
| MN7a | candidate `isConnected` guard removed | C1 | CAUGHT `1 failed \| 18 passed (19)` |
| MN7b | incumbent `isConnected` guard removed | C1 | **SURVIVED** `Tests 19 passed (19)` — see N4 |
| REMEDY-F2 | `className="policyGateHint srOnly"` | C6 | SURVIVED `22 passed (22)` — the remedy costs nothing |

**MR14 is the chain rule earning its place:** dropping the scroll region's accessible name passes C5's command and fails C6's, exactly as `ARCH-REV-S02-r1` N7 predicted.

### 2.8 The prop-type pin — is the COMPONENT-level pin what discriminates? (packet charge)

```
tsc --noEmit --listFiles:
  apps/ui project (672 files):  PrivacyPolicyModal.tsx = 1   consent-policy-modal-render.test.tsx = 0   …behaviour.test.tsx = 0
  root project   (1470 files):  PrivacyPolicyModal.tsx = 0   consent-policy-modal-render.test.tsx = 0   …behaviour.test.tsx = 0

against `cd apps/ui && npx tsc --noEmit -p tsconfig.json`  (unmutated baseline: exit=0 diagnostics=0)
  MT1' fifth REQUIRED member    CAUGHT  exit=2 diagnostics=2
  MT2' fifth OPTIONAL member    CAUGHT  exit=2 diagnostics=1
  MT3' onAcknowledge REQUIRED   CAUGHT  exit=2 diagnostics=1
  MT4' member RENAMED           CAUGHT  exit=2 diagnostics=3

CONTROL — the whole pin block (lines 35–45: `Exact`, `Expect`, `_PropShapeIsExact`, `_PropKeysAreExact`) deleted:
  unmutated                     exit=0 diagnostics=0        (the control's own baseline is clean)
  + MT2' fifth OPTIONAL member  exit=0 diagnostics=0        <-- INVISIBLE without the pin
  + MT4' member RENAMED         exit=2 diagnostics=1        (caught by the destructuring, not by the pin)
```
**Confirmed: the component-level `Exact<keyof …>` arm is exactly what discriminates a closed prop type**, and the author's D1 remedy is measured-effective. See N6 for the PLAN sentence it refutes.

### 2.9 Author D2 — the prototype accessors, restored and non-leaking

```
combined run, ONE invocation: consent-modal-semantics + consent-policy-modal-render + consent-policy-modal-behaviour + my leak probe
  Test Files  4 passed (4)        Tests  42 passed (42)
REV-D2 HTMLElement.prototype own scrollTop / clientHeight / scrollHeight:  none (clean) / none (clean) / none (clean)
REV-D2 a fresh .policyBody reads scrollTop=0 clientHeight=0 scrollHeight=0
REV-D2b shadow/delete round-trip: Element.prototype getters identical (===), no own props left
```
The `shadow HTMLElement.prototype` / `delete` idiom restores jsdom's `Element.prototype` accessors by **getter identity**, not merely by value. *(Honest caveat: vitest isolates per test file by default, so cross-file leakage could not occur anyway; the meaningful check is the within-file round trip above, which I ran directly.)*
**"No case passes only because jsdom's zero metrics satisfy the criterion at mount":** the behaviour file's `beforeEach` sets `{0, 200, 500}` — `0 + 200 = 200 < 492`, i.e. NOT latched — and the boundary case sets `scrollTop: 291` **before** the render. MR1/MR2/MR3/MR5 all going red is the positive proof that the boundary cases are driven by real numbers.

---

## 3. What I did NOT verify — so the next lens knows the gaps

1. **Anything that needs layout or a real browser.** The 680px/92vh geometry (R09), the gold tab's placement, `--r-panel`/`--r-tab` radii, the disabled-button contrast at `opacity:.65`, the actual smooth scroll of a pill click, and both-mode colour rendering. All of it is C8's surface plus V's browser acceptance; jsdom computes no layout. I ran no dev stack.
2. **The author's transcript.** I cannot grep it, so the `SKILLS LOADED` line is verified only for *form* and *floor coverage*, not for *actual loading*. The orchestrator's exit check asserts the body grep passed; that is the orchestrator's measurement, not mine.
3. **Intra-mission attribution of the TOOLING-TRAPS appends.** The file is tracked and **purely additive vs `HEAD`** (`--numstat` = `948 0`, one hunk `@@ -1032,3 +1032,951 @@`, **0 deleted lines**), so no pre-existing line was edited by anyone this mission. But no snapshot of the file exists (COMMON §10.26 does not cover it), so I cannot isolate *this seat's* two appends from the other seats' — the author's "lines `:1602`/`:1611` byte-untouched" claim is **consistent with, but not proven by,** the additive shape.
4. **`mode="read"` opened from S01's card, and every C7 wiring behaviour.** Out of this cluster's surface.
5. **Whether the `disabled` + `aria-describedby` combination announces in real assistive technology.** A natively `disabled` button is not tab-reachable, so the description is only discoverable by virtual-cursor navigation. The component does exactly what SPEC R15 orders, so this is not a defect of the seat; it is flagged here for whoever owns R15.

---

## 4. The packet's §4 charges, answered one by one

**C1 follow-up / N5 (fieldset).** Planted the mutant myself: with the advance loop replaced by a single step, `run S02-C1 1` goes `vt=1 guard=1 VERDICT=1`, `Tests 1 failed | 18 passed (19)`, and the failing name is `advances past a control inside a disabled fieldset, so Tab is not a dead key`. The `skips a hidden input` case stays `✓` under the same mutant. **N5 is discharged, and the fieldset case is the only pin on the loop — exactly as N5 said.**

**C1 follow-up / N6 (the `:29` wording) — ruling.** **ACCEPTED.** A comment must be true of the mechanism, and the shipped mechanism resolves unrelated siblings by DOCUMENT order; a comment saying "most recently opened" would have been false. The author chose correctly. **And yes — the ruling's words and the shipped `CONTAINED_BY || FOLLOWING` mechanism now disagree in a way that needs a V row** (the orchestrator files it; N2 below): I measured an arrangement in which "most recently opened" and "later in document order" give **opposite** answers. Separately, the comment's *justification* clause ("which in this product tracks the order they opened in, because the stacking is the `--z-consent-bar` < `--z-consent-card` < `--z-policy-*` ladder") is **not a reason** — `compareDocumentPosition` does not read `z-index`, and the tracking holds only while the modal is a later sibling.

**C1 follow-up / N7 (`isConnected`) — the F1 claim, measured once.**
```
REV-F1 attached->detached=37  detached->attached=37   (DISCONNECTED=1 PRECEDING=2 FOLLOWING=4 IMPL=32)
       bothFOLLOWING=true   eitherPRECEDING=false
REV-F1 attached siblings: s1->s2=4  s2->s1=2          REV-F1 detached pair: d1->d2=37  d2->d1=37     [jsdom 30.0.1]
```
**The author's F1 is TRUE**: jsdom answers `DISCONNECTED|FOLLOWING|IMPLEMENTATION_SPECIFIC` in both directions for any pair involving a detached node, while attached siblings correctly give `FOLLOWING`/`PRECEDING`. That violates the DOM standard's consistency requirement, and it is why MN7b survives.
**Is shipping the clause unpinned acceptable?** **Yes — shipping it is right, and "unpinnable" is wrong.** The clause is correct in a conformant browser and free in jsdom; but see **N4**: with a 12-line spec-conformant shim of `Node.prototype.compareDocumentPosition` the clause becomes fully pinnable — my probe is GREEN with it and RED without it.

**F3 — the one stack the product will actually build.** Measured on S01's real pair (preferences card open, modal opened from its `Privacy notice` link, both siblings under S01's mount, modal registering second because it opens second):
```
REV-F3 shipped rule, DOM order [card,modal] -> cardClose=0 modalClose=1        <- correct: Esc closes the modal, card untouched
REV-F3 shipped rule, DOM order [modal,card] -> cardClose=1 modalClose=0        <- WRONG: Esc closes the CARD, modal stays open
REV-F3 DOM [card,modal] registration [card,modal] -> shipped topmost=modal ; F3-rule topmost=modal
REV-F3 DOM [modal,card] registration [card,modal] -> shipped topmost=card  ; F3-rule topmost=modal
```
**The measured paragraph the packet asked for.** The shipped rule (`CONTAINED_BY || FOLLOWING`) decides between two unrelated siblings purely by document position, so it needs S01 to render the `<PrivacyPolicyModal>` element **after** the preferences card; in that order it satisfies S02-R14's Esc-stack sentence exactly, and in the reverse order it inverts it — one `Esc` closes the card and leaves the modal standing. F3's rule (drop the `FOLLOWING` arm, keep `CONTAINED_BY`) needs **no DOM order at all**: the incumbent is the last-registered entry, registration happens in `useEffect` when `open` flips true, and the modal opens after the card, so the modal is topmost in both arrangements, while a genuinely nested surface still wins by containment. **The constraint the shipped rule creates is real and currently undeclared anywhere** — carried to S01-C6 as N1. I did not ask for the change, per the packet.

**MC6o / the TOOLING-TRAPS appends.** Reproduced the mutant unedited:
```
 Test Files  2 passed (2)        Tests  22 passed (22)        Errors  1 error       exit 1
 TypeError: section.scrollIntoView is not a function
 S02-C6 | vt=1 guard=0 VERDICT=1 |  Tests  22 passed (22) |  Test Files  2 passed (2)
```
**The case that pins it exists and is the right one** — the first arm of `asks exactly the mapped section to scroll…`, which clicks a pill **before** any stub is installed; every stubbing case passes against the unguarded code. It goes RED with the guard removed, on the exit code alone, `guard=0`. **Both TOOLING-TRAPS corrections the author appended are TRUE:** the `<fieldset disabled>` shape is a genuine second discriminable unfocusable type (MN1c, above), and a real mutant can indeed produce a green summary with a nonzero exit plus an `Errors N error` line, which refutes the previously recorded heuristic. **One sentence of correction to the third append:** its claim that the incumbent half is "not pinnable in this environment" is too strong — it is not pinnable against jsdom's *default* `compareDocumentPosition` (N4).

**F2 — `.policyGateHint`.** Measured with no C8 CSS in the document:
```
REV-F2 footer textContent (gate closed) >>>Questions: privacy@dezbatere.roScroll to the end of the policy to continue.I have read it<<<
REV-F2 hint className >>>policyGateHint<<<  inline style >>>null<<<  computed display >>>inline<<<
REV-F2 footer textContent (gate open)   >>>Questions: privacy@dezbatere.roI have read it<<<
class names in PrivacyPolicyModal.tsx: 29    styled at HEAD: 0    NOT styled (C8's list): 29
```
It prints as stray visible footer text today, between the contact line and the button, in a footer the design shows with no such text. See **N3** for the ruling, and §5 for the verbatim class list.

**Author D1–D4.** D1 upheld as a PLAN defect (**N6**, with a control the author did not run). D2 upheld and independently re-derived — my own first probe failed on the same trap (§2.9). D3 (a step whose acceptance is a test count should say how many `it()` blocks it adds) upheld, non-blocking, folded into N6's ticket. D4 already acknowledged by the orchestrator on the ticket.

---

## 5. Findings

**B — blocking: none.**

### N1 · The Esc stack imposes an undeclared DOM-order constraint on S01-C6
`apps/ui/components/consent/modalSemantics.ts:121-125`.
**Inputs → wrong outcome:** S01 renders `<PrivacyPolicyModal>` **before** the preferences card in the DOM (both siblings under S01's mount, card open first, modal opened from its link) → one `Escape` closes the **card** and leaves the modal open, contradicting S02-R14 ("the topmost open surface consumes Esc and no other surface acts on the same event") and S02's acceptance row "Modal open (topmost) | one Esc | Modal closed and NOTHING else acts on that event".
**Evidence:** `probes/code-rev-s02-c5c6-r1-escstack.probe.test.tsx`, `Tests 3 passed (3)` — `REV-F3` lines in §4.
**CLASS:** *a resolution rule whose correctness depends on an ordering no document states and no test pins.* Sweep: the only two surfaces this mission stacks are S01's preferences card and this modal (the seven legacy overlays are ticket `A11Y-OVERLAYS`, out of surface); both are affected, and no other pair exists.
**Remedy — BINDING (measured: the two-arrangement probe above, GREEN one way and inverted the other):** S01-C6's packet states *"the `<PrivacyPolicyModal>` element is rendered AFTER the preferences card in the DOM"* and carries a pin that renders the pair, presses `Escape` once, and asserts the modal closed and the card intact — **or** the `FOLLOWING` arm is dropped under a ruling (F3), which removes the constraint entirely.
**Ticket:** new, `S02/S01 — Esc stack DOM-order constraint`, blocking on S01-C6's dispatch. **Not a rework of C5/C6.**

### N2 · The `t_eab0c89f` ruling and the shipped mechanism state different rules
`apps/ui/components/consent/modalSemantics.ts:29-37`; `slices/S02/DECISIONS.md:101`.
**Inputs → wrong outcome:** a future seat reading the ruling ("most recently opened among unrelated siblings") and writing a test from it will write the `[modal,card]` arrangement, which the code answers the other way (N1's measurement). The two phrasings agree on the arrangement everyone has tested and disagree on the other one.
**Evidence:** N1's probe. The `:29` comment's mechanism clause is **ACCEPTED as true**; its justification clause ("…because the stacking is the `--z-consent-bar` < `--z-consent-card` < `--z-policy-*` ladder") is refuted — `compareDocumentPosition` reads document position, not `z-index`.
**CLASS:** *a ruling recorded in prose that no artifact re-derives.*
**Remedy — the finding BINDS, the wording is ADVISORY:** the orchestrator files a V row reconciling "most recently opened" with "later in document order" (V chooses which rule the product wants — F3 implements the first in one line), records the outcome in `DECISIONS.md`, and drops or narrows the z-ladder sentence at `:33-36`. **Not a rework of C5/C6** (the mechanism was ruled out of scope for this seat and the seat obeyed).

### N3 · `.policyGateHint` renders as stray visible footer text until C8 styles it
`apps/ui/components/consent/PrivacyPolicyModal.tsx:255-257`.
**Inputs → wrong outcome:** open the modal in `mode="consent"` with the gate closed, in the product as it stands today → the footer reads `Questions: privacy@dezbatere.ro` **`Scroll to the end of the policy to continue.`** `I have read it`, a sentence the design's 10c footer does not contain.
**Evidence:** `REV-F2` lines in §4; `code-rev-s02-c5c6-r1-class-audit.sh` → 29 class names, **0 styled at HEAD**.
**CLASS:** *a new element whose only styling contract lives in another cluster's unwritten packet.* Sweep: of the 29 classes, `.policyGateHint` is the only one whose **absence of CSS changes what the reader is told** (the other 28 degrade to unstyled but correct content); `.policyFootSpacer` degrades to an empty inline span, harmless.
**Remedy — the finding BINDS; the route is ADVISORY (measured: `className="policyGateHint srOnly"` leaves S02-C6 at `Tests 22 passed (22) / Test Files 2 passed (2) / VERDICT=0`, so it costs nothing):** either the component carries the repo's existing `.srOnly` treatment (`globals.css:684`, already used at `LoginFlow.tsx:223`, `enroll-mfa/page.tsx:188,263`, `new/page.tsx:156`) or C8's block gives `.policyGateHint` that treatment. **One constraint is BINDING either way: it must be clipped, never `display:none` or `visibility:hidden`** — both remove the element from the accessibility tree and take R15's required description with it.
**For C8's packet, verbatim, machine-derived from the component:**
`policyBezel policyBody policyClose policyContact policyCore policyDot policyEnd policyEyebrow policyFoot policyFootSpacer policyGateHint policyHead policyHeadText policyItem policyItemText policyItems policyJumps policyLede policyMail policyNo policyPill policyPrimary policyScrim policySection policySectionHead policySectionTitle policyTab policyText policyTitle`
(29; `grep -oE 'className="[^"]+"' … | tr ' ' '\n' | sort -u` — identical member-for-member to the author's F2 list.)
**Ticket:** fold into C8's packet; the orchestrator copies the list above verbatim.

### N4 · MN7b is pinnable; "unpinnable in this environment" is recorded too strongly
`apps/ui/components/consent/modalSemantics.ts:117-120`; `.hermes/TOOLING-TRAPS.md` (the `compareDocumentPosition` entry, consequence 2).
**Inputs → wrong outcome:** a future seat deletes the four-line "a disconnected incumbent never stands" clause → `run S02-C1 1` stays `VERDICT=0`, `Tests 19 passed (19)`. In a spec-conformant browser the detached surface would then swallow `Escape`.
**Evidence:** `probes/code-rev-s02-c5c6-r1-mn7b-conformant-cdp.probe.test.tsx`. With a **consistent** `Node.prototype.compareDocumentPosition` shim (a disconnected node sorts after a connected one; `a->b=37`, `b->a=35`, never both `FOLLOWING`) and the stale surface registered LAST so it is the incumbent: shipped clause → `liveClose=1 staleClose=0`, `Tests 2 passed (2)`; **clause removed → `liveClose=0 staleClose=1`, `Tests 1 failed | 1 passed (2)`**.
**CLASS:** *a defensive clause shipped with no gate because the environment's non-conformance hides it — and an "unpinnable" note in shared memory that will stop the next seat from trying.*
**Remedy — BINDING (measured: the RED/GREEN pair above):** add the shim case to `tests/render/consent-modal-semantics.test.tsx`, routed to whichever seat next lawfully owns that file (this seat's grant on it was "for THIS commit only"), and amend the TOOLING-TRAPS sentence to *"not pinnable against jsdom's default `compareDocumentPosition`; pinnable with a conformant shim of that one method — probe `code-rev-s02-c5c6-r1-mn7b-conformant-cdp.probe.test.tsx`"*.
**Ticket:** new, `S02-C1 — pin the detached-incumbent clause`.

### N5 · COMMON §10.36's stated reason is false for `.hermes/TOOLING-TRAPS.md`, and the failure mode is silent staleness
`.hermes/planning/consent-ui/packets/COMMON.md:132`.
**Inputs → wrong outcome:** a seat in any lane reads `.hermes/TOOLING-TRAPS.md` relatively, expecting §10.36's promised "does not exist" error → it gets a plausible file that is **1034 lines against the main tree's 1982**, missing every trap this mission recorded, including the two the author appended today.
**Evidence:** in this review worktree — `git ls-files .hermes` = **936 tracked entries**, of which **0** are `consent-ui`; `docs/missions/consent-ui/` does **not** exist (§10.36 is right about that half); `wc -l` lane 1034 vs main 1982; `diff <(head -1034 lane) <(head -1034 main)` → identical, i.e. the lane copy is a strict **prefix**.
**CLASS:** *a rule whose stated justification is false in a way that turns a loud failure into a quiet one.* Sweep: `docs/missions/**` — untracked, §10.36 correct. `.hermes/planning/**` and `.hermes/reports/**` for this mission — untracked, §10.36 correct. `.hermes/TOOLING-TRAPS.md` — **tracked, §10.36 wrong.** That is the whole class; it is one file, and it is the one file every packet's reading list opens with.
**Remedy — BINDING (measured: the line counts and the prefix diff above):** §10.36 reads *"…read them from the MAIN tree by absolute path. `docs/missions/**` and this mission's `.hermes/planning|reports` are untracked and do not exist in a lane; `.hermes/TOOLING-TRAPS.md` IS tracked and DOES exist in every lane as the last committed version — currently 948 lines short — so reading it relatively silently returns stale advice."* Packets already quote the absolute path; keep doing that.
**Ticket:** new, `COMMON §10.36 correction`, orchestrator, same day.

### N6 · `PLAN.md` S02-S33's coverage claim is false, and the two ordered type pins are inert
`docs/missions/consent-ui/slices/S02/PLAN.md:758-760`.
**Inputs → wrong outcome:** a seat obeys S02-S33 literally, writes only the two pins in `tests/render/consent-policy-modal-render.test.tsx`, and reports the property as gated → a fifth **optional** prop member ships with `pnpm typecheck` at exactly 8 diagnostics and the `apps/ui` project at exit 0.
**Evidence:** `tsc --noEmit --listFiles` — the render test is in **neither** project (0/0); the component is in the `apps/ui` project only (1/0). Control in §2.8: with the component's pin block deleted, MT2' is invisible (`exit=0, 0 diagnostics`); with it present, `exit=2, 1 diagnostic`. The standing measurement is `TOOLING-TRAPS.md:1485-1499` (ticket `t_94c9010a`), made the day **before** S02-S33 was written.
**CLASS:** *a plan sentence asserting a gate's coverage without the one command that proves the gate sees the file.* Sweep across S02's plan: S02-S33 is the only step whose acceptance rests on a `tests/render/*.tsx` type pin; every other type-level claim in the slice sits in a `.ts` file the root project does include.
**Remedy — BINDING (measured: the `--listFiles` counts and the pin-removal control):** correct S02-S33 to name the `apps/ui` project arm and the component-level pin as the gate (which is what the seat shipped), or move the render test into a project that typechecks it. Fold **D3** in: a step whose acceptance is a test count states how many `it()` blocks it adds (S02-S40's acceptance says `2` while its prose reads as one scenario — the author split it correctly, but had to measure to find out).
**Ticket:** attach to `t_94c9010a`; **not a rework of C5/C6** — the seat reported it and remedied it inside its own file.

### N7 · The scroll-gate latch survives a close/reopen cycle, and nothing says whether it should
`apps/ui/components/consent/PrivacyPolicyModal.tsx:110-118` (`reachedEnd` is never reset).
**Inputs → wrong outcome (or intended outcome — that is the finding):** a persistently mounted `<PrivacyPolicyModal open={…} mode="consent">` — the shape the prop interface implies — is opened, scrolled to the end (gate opens), closed with `Escape`, and reopened with the reader back at the top → `I have read it` is **enabled immediately**.
**Evidence:** `REV-P15 after close+reopen with the reader back at the top, acknowledgement disabled = false` (`…-modal.probe.test.tsx`).
**CLASS:** *state that outlives the `open` prop with no stated contract.* Sweep: `reachedEnd` is the component's only state; there is no other.
**Remedy — ADVISORY:** SPEC R15 says the gate latches and is silent on a reopen. The behaviour is defensible ("the reader has read it") and I am **not** asking for a change. C7 will meet it the moment it mounts the modal, so the orchestrator records the intended semantics in `DECISIONS.md` and C7's packet pins whichever it is — including, if C7 instead mounts conditionally (`{open && <PrivacyPolicyModal …>}`), that the state resets and the behaviour is the opposite.
**Ticket:** attach to C7's dispatch.

---

## 6. Predictions (falsifiable evidence that blindness held)

I had no contact with any other lens and worked in my own detached worktree throughout.

I expect a second lens on this work to **also return PASS**, because the cluster commands, the gates and the boundaries are not close calls — they reproduce to the character. Where I expect divergence is in what gets *found beyond green*. My prediction is that another lens re-measures the author's stated numbers (they all hold), re-runs the author's mutants (they all behave as stated, MN7b included), and stops there — because everything in the packet's §4 reads as a *confirmation* charge, and confirmations terminate. The three things I would check first, and expect to be missed:

1. **The Esc stack against the pair the product will actually build, in BOTH DOM orders.** A lens that renders only the natural order (`card` then `modal`) sees the correct answer and concludes the rule is fine. It takes the *unnatural* order to see that one `Escape` closes the card and leaves the modal — and that is the arrangement S01-C6 could plausibly write.
2. **A conformance shim for `compareDocumentPosition`.** The author declared MN7b unpinnable, TOOLING-TRAPS now records it that way, and the author explicitly wrote "do not spend a round trying to pin it here" — which is precisely the sentence that stops the next reader. A lens that accepts it loses a real pin that costs twelve lines.
3. **A control run for the prop-type pin.** Showing four mutants turn `tsc` red proves *something* discriminates, not that *the pin* does. Without deleting the pin block and re-running, the claim is unproven — and I nearly filed the opposite finding off a badly-constructed control (my self-report §4, dead end 3).

I also expect at least one other lens to drive the scroll metrics per-element and to be bitten by jsdom's `0 + 0 >= 0 - 8` mount latch exactly as I was, and to read the resulting precondition failures as a defect in the component rather than in its own fixture. It is not a defect; it is the author's D2, and it is correct.

**comments read through:** `t_22f0434b` — 5 (4 by CODE-S02-C5C6, 1 by ORCHESTRATOR); `t_05c70636` — 1 (my own CLAIM).
