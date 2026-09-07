# CODE-REV-S02-C8 — blind per-cluster review, round 1 (mission `consent-ui`, slice S02, cluster C8)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging`

(`superpowers:receiving-code-review` — not loaded this session, not needed: no finding of mine is
contested yet and no prior verdict's findings were handed to me as requirements. COMMON §10.9's
honest form. This is the reviewer floor plus `systematic-debugging`, which I used to root-cause B1.)

**Verdict: REWORK**

Seat CODE-REV-S02-C8 · Opus 5 · fresh blind session · round 1 of max 3 · review ticket
`t_e2bdcddb` · work under review `t_ee948194`, commit `a035f814` on `slice/consent-s02-css`,
base `511d30b6` · worktree `.worktrees/rev-s02-c8/dialectical-engine`, detached at `a035f814`,
`git status --porcelain` 0 entries at CLAIM and at handoff · `pnpm run generate:contract` exit 0,
tree unchanged · `comments read through: all (5 on t_ee948194)`.

**One blocking finding (B1, three sites of one class) and two non-blocking (N1, N2).** The
stylesheet as shipped is design-faithful, token-clean, mode-correct and fully gated: 188 of the
two artboards' declarations match byte-exact, 34 of 34 class names are styled with no orphan in
either direction, ten mutants of mine are all caught, and every standing gate reads its baseline
value. **B1 is not about the CSS. It is about a measured number that is false in a shipped file
and that the author has filed upward as a request to make two correct mission documents wrong.**

---

## 1. Packet review (`heartbeat-reviewer` §1) — the packet that dispatched the work

`.hermes/planning/consent-ui/packets/CODE-S02-C8.md`, snapshot
`snapshots/packets/CODE-S02-C8.md.at-dispatch`. Constants checked against the artifacts they
quote. **The author's five packet defects, answered one line each:**

| # | The author's claim | My measurement | Verdict |
|---|---|---|---|
| 1 | packet §2(8) orders an 8th case; `PLAN.md:1270` pins `Tests 7 passed (7)` | `PLAN.md:1270` does say 7; the packet is later and more specific; the guard requires `Tests [1-9][0-9]* passed` with no `failed`, so no command depends on the literal | **UPHELD — docs residue.** The orchestrator's own addition; PLAN text to be corrected, no worker defect |
| 2 | `--muted-bg`, `--muted-border`, `--shadow-knob` listed as tokens S02 references; S02 references none | `token-audit.mjs`: `referenced in block = false` for all three; the block's 23 distinct references are all accounted for | **UPHELD — harmless over-listing** |
| 3 | the PLAN's `.70 → 5.54` "does not reproduce"; re-measured 5.61 | **REFUTED.** See B1: the author's own test prints **5.54** | **THE PACKET AND THE PLAN WERE RIGHT** |
| 4 | `globals.css:885-902` `.authCheck` is dead CSS above the block | confirmed above the block, outside C8's surface, correctly not touched | **UPHELD — orchestrator's ticket** |
| 5 | `TOOLING-TRAPS`'s BROKEN arm misclassifies the lawful `No test files found` RED | the traps file already carries the correct rule at `:280-286` ("`no test files found` is BROKEN only when the missing path is **not declared anywhere in the PLAN**"); the author's `test -f` companion is the mechanical form of that same rule and is a strict improvement | **UPHELD — a sharpening, not a new trap** |

**Packet defects I found that the author did not:**

- **P1 — mixed citation origins in one packet.** §4 charge 6 cites the two `animation:`
  declarations as "block `:105`" and "`:124`" (block-relative) while every other citation in the
  packet is a file line. Measured with `grep -n` at HEAD: they are `globals.css:7328` and
  `globals.css:7347`. COMMON §10.24's class — a citation whose origin is ambiguous is a citation
  the seat must re-derive. **Remedy: `BINDING (measured: grep -n 'animation:' apps/ui/app/globals.css → 7328, 7347)` — packets state file lines, or say "block-relative" in the same sentence.**
- **P2 — the granted scratch directory cannot host a render probe.** §1 grants scratch under
  `.review-scratch/`; `vitest.config.ts`'s `include` is `tests/**` + `acceptance/**`, so a
  `.test.tsx` there is unreachable and the obvious workaround (writing into `tests/`) dirties the
  work under review, which the same packet forbids. Solved here with a scratch-local
  `--config` (nine lines, now at
  `.hermes/reports/consent-ui/probes/code-rev-s02-c8-r1-vitest.review.config.ts`).
  **Remedy: ADVISORY — name that harness in every review packet that charges a render probe.**
- **P3 — a quoted claim without its command.** §4 quotes "164,567 == 164,567 bytes". No command is
  given, and no `head -n` cut of the file yields 164,567 (`7218→164464, 7219→164538, 7220→164581,
  7221→164621, 7222→164623, 7223→164624`). See B1c. **Remedy: ADVISORY — a claim enters a packet as `<command> → <output>` or not at all.**

**Boundaries (packet §Boundaries) — all clean.**
`git diff --name-status 511d30b6..a035f814` = `M apps/ui/app/globals.css` + `A tests/unit/consent-s02-style-contract.test.ts`; 2 files, 813 insertions, 0 deletions, 1 commit. Both in the `allowed` list; no component touched; no token block touched; nothing outside the surface.
**Author's `SKILLS LOADED`:** six — `using-superpowers, heartbeat-protocol, heartbeat-worker, test-driven-development, verification-before-completion, systematic-debugging` — the worker floor plus `systematic-debugging`, with `receiving-code-review` declared absent in COMMON §10.9's honest form at round 0. **Compliant.**
**Self-report bar:** `agent-reports/CODE-S02-C8.md` is a case file, not a diary — four named causes with prices, three near-misses, three dead ends, five upgrades, five residuals. It meets the bar. Its §2.2 and §7 F1 are the source of B1.

---

## 2. Blocking findings

### B1 — a false measured figure is shipped in `globals.css`, mirrored in the test, and filed upward as a request to corrupt `PLAN.md:1250` and `DECISIONS.md:109`

**File:line.** `apps/ui/app/globals.css:7575` · `tests/unit/consent-s02-style-contract.test.ts:297` · handoff §7 F1 / self-report §2.2 and §7 F1.

**Concrete inputs → wrong outcome.** Set `.policyPrimary:disabled { opacity: .70 }` and run the
author's own suite. The comment three lines above that declaration says the result is
**Terracotta 5.61**. The suite computes **5.54** — the figure the PLAN pins and the author's F1
asks to have replaced.

**Evidence — the author's own two-file mutant, re-run by me** (stylesheet α and the matching
`expectDecl` moved together; the `4.5` threshold changed to `99` so the assertion PRINTS its
received array; both files restored with `cp` and proved identical with `diff -q`):

```
### alpha=.60 css=opacity:.60;
   → expected [ 'Terracotta 4.13', 'Chamber 6.29' ] to deeply equal []
### alpha=.65 css=opacity:.65;
   → expected [ 'Terracotta 4.79', 'Chamber 7.17' ] to deeply equal []
### alpha=.70 css=opacity:.70;
   → expected [ 'Terracotta 5.54', 'Chamber 8.09' ] to deeply equal []
### alpha=.75 css=opacity:.75;
   → expected [ 'Terracotta 6.50', 'Chamber 9.19' ] to deeply equal []
RESTORED-OK
```

**Independent confirmation** (`probes/code-rev-s02-c8-r1-contrast-ladder.mjs` — WCAG 2.x relative
luminance implemented from the spec, tokens read out of the shipped stylesheet, eight compositing
models):

```
A round-channel, label & face over --shell (author/test model)
    T@0.60=4.13  C@0.60=6.29  T@0.65=4.79  C@0.65=7.17  T@0.70=5.54  C@0.70=8.09
B float-channel, label & face over --shell
    T@0.60=4.12  C@0.60=6.30  T@0.65=4.78  C@0.65=7.18  T@0.70=5.57  C@0.70=8.14
Models printing Terracotta 5.54 (±0.005) at alpha .70:
  A round-channel, label & face over --shell (author/test model) -> 5.5450
```

**Root cause, isolated to one channel** (`probes/code-rev-s02-c8-r1-find-561.mjs`). At α = .70 the
Terracotta face green channel is `0.7·38 + 0.3·233 = 96.5`. `Math.round(96.5) = 97`;
`Math.floor(96.5) = 96`. That is the entire difference:

```
alpha=0.70 round  -> 5.5450   face=100,97,89
alpha=0.70 floor  -> 5.6077   face=100,96,88
alpha=0.70 trunc  -> 5.6077
alpha=0.70 raw    -> 5.5714
```

The shipped test composites with `Math.round`. The author's self-report §2.2 tabulates
"rounded, floored, unrounded → **5.61** / 5.61 / 5.57"; the *rounded* entry is the floored value.
At α = .65 every model agrees (4.79), which is why the pinned rung reproduced and the error
survived: **only the unpinned rungs of the ladder disagree, and nothing executes them.**

**Is the pin affected?** No. `.65` is confirmed the smallest 0.05 step clearing 4.5:1 in both
modes (`.60` → Terracotta 4.13 FAIL; `.65` → 4.79 / 7.17 PASS), the block declares
`opacity: .65` on `:disabled`, and `PrivacyPolicyModal.tsx:261-264` renders
`disabled={!gateOpen} aria-disabled="true"` — a real `disabled` is always present, so the block's
`:disabled`-only selector matches the markup exactly. **The CSS is right; the number about it is wrong.**

**CLASS: a number stated as measured that the seat's own command contradicts.** Swept over every
figure in the handoff, the self-report and the two files — three members:

- **B1a** `globals.css:7575` and `consent-s02-style-contract.test.ts:297` — `.70 → 5.61` is
  **5.54**.
- **B1b** handoff §1 and self-report §6.4 — "bytes above the S02 opening marker identical to HEAD
  (164567 vs 164567)". The **property is TRUE** and I verified it independently
  (`head -n 7222` of the shipped file vs `git show 511d30b6:…apps/ui/app/globals.css`, `diff -q`
  → identical), but the **figure is 164,623 == 164,623**; no `head -n` cut of the file yields
  164,567. A true property with a fabricated number attached invites a reader to trust the number
  and stop.
- **B1c** `consent-s02-style-contract.test.ts:51-52` — "Measured in this file: the only at-rules
  present are `@keyframes` (7) and `@media` (18)". As shipped they are **9 and 19**; 7 and 18 are
  the counts at base, made stale by this block's own two `@keyframes` and one `@media`
  (COMMON §10.28's class: an artifact stating a count over a file its own change moves).

**Remedy — `BINDING (measured: the four-run α ladder above, plus `find-561.mjs`, plus the six `head -n` byte cuts)`:**

1. `globals.css:7575` and `consent-s02-style-contract.test.ts:297`: `.70 -> 5.61 / 8.09` →
   `.70 -> 5.54 / 8.09`.
2. **RETRACT F1.** `PLAN.md:1250` and `DECISIONS.md:109` are CORRECT and must not be edited.
   Say so on the ticket so the orchestrator does not action the original.
3. `consent-s02-style-contract.test.ts:51-52`: `9` and `19`, or delete the parenthetical counts
   (COMMON §10.28 prefers deleting a self-describing count over maintaining it).
4. Restate the byte figure from the command that compares, or drop it and keep the `diff -q`.
5. **The class fix, and the reason this is worth a round:** make the ladder EXECUTE. Add to
   `S02-S64` an assertion over the whole measured range, not only the pinned rung — e.g. a helper
   `ratioAt(α)` and `expect(ratioAt(0.60)[0]).toBeCloseTo(4.13, 2)` … `ratioAt(0.70)` →
   `5.54 / 8.09`. Four lines. **A derivation written as prose beside an executable assertion is
   unexecuted prose, and B1 is what that costs.** Discharge by re-running
   `probes/code-rev-s02-c8-r1-contrast-ladder.mjs <lane>` and pasting its output (COMMON §10.10).

---

## 3. Non-blocking findings — each demands a fix; the tier sets WHEN, never WHETHER

### N1 — four of the block's six focusable controls have no focus treatment, against `SPEC.md:612` and `:637`

**File:line** (all measured with `grep -n '^\.<selector> {' apps/ui/app/globals.css` at
`a035f814`). Rules present, no `:focus-visible` companion: `.consentPolicyLink:7304` ·
`.policyClose:7409` · `.policyPill:7448` · `.policyPrimary:7560`. Contrast with the two the block
DOES treat: `.consentBox:focus-visible:7287` and `.policyBody:focus-visible:7436`, both
`outline: 2px solid var(--focus); outline-offset: …`.

**Concrete inputs → wrong outcome.** Tab to “Privacy Policy” in the sign-up card, or to `×` / a
jump pill / “I have read it” in the modal. The control receives focus and is painted with the
BROWSER's default ring, not the house `2px solid var(--focus)`. The UA ring is chrome-coloured,
so it is the only paint on either S02 surface that does **not** follow the Terracotta/Chamber
toggle — which falsifies R23's claim as stated in the block's own header comment ("Every colour
is a `var(--token)` reference … which is WHY both surfaces follow the mode toggle live").
`SPEC.md:612` maps focus rings to `--focus`; `SPEC.md:637` requires them "visible on every
control, in both modes".

**Evidence** (`probes/code-rev-s02-c8-r1-focus-coverage.mjs` — 21 `:focus` rules in the whole
stylesheet, matched against each control's class AND its element type):

```
:focus rules in globals.css: 21
.consentBox          input[type=checkbox]   class-rule=.consentBox:focus-visible   element-rule=.btn:focus-visible, … input:focus-visible, … a:focus-visible
.consentPolicyLink   button                 class-rule=NONE   element-rule=NONE
.policyClose         button                 class-rule=NONE   element-rule=NONE
.policyPill          button                 class-rule=NONE   element-rule=NONE
.policyPrimary       button                 class-rule=NONE   element-rule=NONE
.policyBody          div[tabindex=0]        class-rule=.policyBody:focus-visible   element-rule=NONE
```

The repo's shared rule at `globals.css:488-495` covers `.btn, .iconBtn, .modeToggle, .input,
input, textarea, select, a` — a bare `<button>` is in none of those. **Why this is N and not B:**
nothing in the stylesheet sets `outline: none` (checked `globals.css:160-200` and the whole
block: the only `outline` declarations inside the block are the two that ADD a ring), so a ring
IS painted and SPEC:637's visibility clause survives. It is the token clause and the both-modes
clause that break.

**CLASS: an interactive control in a new block that inherits no focus treatment because the
repo's shared focus rule is class-keyed, not element-keyed.** Swept: the six controls above are
the complete set in this block (the block styles no other focusable element; `.policyDot`,
`.policyTab` etc. are non-interactive). **Remedy: ADVISORY** as to grouping — the fix must live
INSIDE S02's block (extending `globals.css:488-495` is above the marker and outside C8's
contract), e.g. `.consentPolicyLink:focus-visible, .policyClose:focus-visible,
.policyPill:focus-visible, .policyPrimary:focus-visible { outline: 2px solid var(--focus);
outline-offset: 2px; }`. **BINDING (measured: `focus-coverage.mjs`, class-rule=NONE and
element-rule=NONE for all four): the four controls must gain a `--focus` treatment or the seat
must state, with a measurement, why the UA ring satisfies SPEC:612.**

### N2 — a five-line comment block is shipped twice, the second copy orphaned

**File:line.** `apps/ui/app/globals.css:7583-7587` (correct placement, immediately above
`.policyGateHint` at `:7588`) and `:7600-7604` (duplicate, sitting after the rule it documents and
immediately before the `--- Motion, and switching it off ---` section header).

**Concrete inputs → wrong outcome.** A reader arriving at the Motion section is handed the
gate-hint rationale, which documents nothing near it. **Evidence:** a comment-frequency count over
the block returns exactly one duplicated comment, ×2:

```
duplicated comments: [('/* The reason the button is disabled reaches assistive technology thro', 2)]
```

**Root cause, and the author's own self-report §1 D4 supplies it:** they had written
`.policyGateHint` one step early, removed **the rule** to obtain a genuine RED frame, then
re-inserted rule **and** comment above the original comment, which was never removed. **Why no
test caught it:** the contract's parser calls `stripComments()` before every assertion — correct
for CSS semantics, blind to comment duplication. **CLASS: TDD-removal residue in a file whose
contract strips the removed text's neighbourhood.** Swept: this is the only duplicate in the
block. **Remedy: BINDING (measured: the count above) — delete `globals.css:7600-7604`.
ADVISORY addition: `expect(new Set(comments).size).toBe(comments.length)` in the contract would
have caught it inside the cycle that created it.**

---

## 4. What I verified, and how — the packet's §4 charges, each with its measurement

### 4.1 The cluster command ×3, from a `.sh` under `/bin/bash` AND inline (COMMON §10.16, §10.30, §10.34)

`run()` transcribed verbatim from `PLAN.md:1377-1387`; lane from `argv`
(`probes/code-rev-s02-c8-r1-rev-c8-cluster.sh`).

| run | commit | script arm (`/bin/bash`) | inline arm (tool zsh) |
|---|---|---|---|
| 1 | `a035f814` | `vt=0 guard=0 VERDICT=0` · `Tests 8 passed (8)` · `Test Files 1 passed (1)` | identical |
| 2 | `a035f814` | identical | identical |
| 3 | `a035f814` | identical | identical |

**Worst of six runs: `VERDICT=0 · Tests 8 passed (8) · Test Files 1 passed (1)`.** The author's
claim reproduces exactly. RED-at-base frame not re-derived here (the file exists at `a035f814`);
its lawfulness is settled by `TOOLING-TRAPS:280-286` — see packet defect 5 above.

### 4.2 Standing gates, measured in MY worktree (`probes/…-rev-c8-gates.sh`, full capture in `…-gates-with-block.txt`)

| gate | baseline pin | measured at `a035f814` | delta |
|---|---|---|---|
| `pnpm typecheck` | exit 1, 8 diagnostics, all `tests/unit/s14-ui.test.ts` | exit 1, **8**, **0 outside the pin** (all eight printed verbatim in the capture) | none |
| `cd apps/ui && npx tsc --noEmit -p tsconfig.json` (COMMON §10.30) | exit 0 | **exit 0**, no output | none |
| `t9-mode-tokens` | `2 failed \| 6 passed (8)`, hit list = one `.drawerScrim` line | `2 failed \| 6 passed (8)`; **hit-list count 1**, the element being `…/apps/ui/app/globals.css:6096:background: color-mix(in srgb, #0a0806 32%, transparent);` — line number unmoved, because the block is appended | none |
| `pda-s03-keyboard-accessibility` | `2 failed \| 3 passed (5)` | identical, same two names | none |
| `v2ui-pages` | `5 failed \| 36 passed (41)` | identical, same five names | none |
| `role-token-map` | `3 failed \| 46 passed (49)` | identical, same three names | none |
| `auth-flow-integration` | 17 base / 18 on this lane | **`18 passed (18)`** | none |
| `v2ui-node-runner` | `2 passed (2)` | **`2 passed (2)`** | none |

**With and without the block, measured by me** — `cp` snapshot, `head -n 7222` (which `diff -q`
proves byte-identical to `git show 511d30b6:…`), the three suites re-run, restore by `cp`, verify
by `diff -q`, `git status --porcelain` empty after:

```
NOBLOCK tests/unit/pda-s03-keyboard-accessibility.test.ts        Tests  2 failed | 3 passed (5)   [same 2 names]
NOBLOCK tests/unit/v2ui-pages.test.ts                            Tests  5 failed | 36 passed (41) [same 5 names]
NOBLOCK tests/architecture/role-token-map.test.ts                Tests  3 failed | 46 passed (49) [same 3 names]
NOBLOCK tests/unit/t9-mode-tokens.test.ts                        Tests  2 failed | 6 passed (8)   hitlist=1
RESTORED-OK
```

**Failure-name sets IDENTICAL with and without the block, in all four.** The block adds no hit and
no new failure name anywhere.

### 4.3 Block discipline (S02-S59 / S02-S60), re-measured

- 7,222 → **7,627** lines. Markers at **`:7224`** and **`:7627`**; the closing marker is the last
  line; **0 lines after it**.
- **Everything above the opening marker is byte-identical to base:** `head -n 7222` = **164,623
  bytes** and `git show 511d30b6:…apps/ui/app/globals.css` = **164,623 bytes**, `diff -q`
  identical. (Line 7223 is the separator newline the append introduces; `head -n 7223` is 164,624.)
  **See B1b for the author's unreproducible 164,567.**
- Inside the block, over the RAW text including comments:
  `/oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/gi` → **0 matches**; `/^\s*--[a-z0-9-]+\s*:/gim` → **0
  matches**. The t9 hit list is unchanged, as above.
- **Token references audited** (`probes/…-token-audit.mjs`): 23 distinct, 54 total. **None
  undeclared anywhere.** Exactly four arrive from S01 — `--ok-edge`, `--scrim`, `--z-policy-card`,
  `--z-policy-scrim` (present in the S01 lane at `globals.css:33/140`, `:65`, `:94`); the other 19
  exist at base, including `--r-dot: 50%` (`:72`), `--focus` (`:46`, `:135`) and `--accent`
  (`:46`, `:135`). Radii are declared once and mode-independent (no `--r-*` in the chamber block),
  so `var(--r-panel)` = the artboard's 16px and `var(--r-tab)` = its `0 0 5px 5px` in both modes.
  **`--muted-bg`, `--muted-border`, `--shadow-knob`: referenced = false, all three** (packet
  defect 2 upheld).
- **One top-level rule per selector: 43 top-level rules, 0 duplicate selectors** — the invariant
  the author's D1 nearly lost, holds.

### 4.4 Design fidelity — the point of the cluster (`probes/…-design-fidelity.mjs`, full capture in `…-design-fidelity.txt`)

I did not spot-check. I parsed both artboards' inline `style="…"`, applied COMMON §7's token map
(`tA.hair→--line`, `tA.hint→--text-2`, `okBorder→--ok-edge`, `s.c→--accent`, `Fraunces,serif→
--font-display`, `999px→--r-pill`, `0 0 5px 5px→--r-tab`, `50%→--r-dot`, …), paired each artboard
element with a block selector by the component's own DOM order, and diffed property by property.

**Result: 188 design declarations checked, 2 flagged, both correct-by-construction — zero design
defects.**

- **Every S02-S61 geometry value byte-exact:** `width: min(680px, calc(100vw - 32px))`,
  `max-height: 92vh`, `z-index: var(--z-policy-scrim)` / `var(--z-policy-card)`,
  `background: var(--scrim)`, head `padding: 22px 24px 14px`, body `flex: 1` / `min-height: 0` /
  `overflow: auto` / `padding: 16px 24px 8px`, foot `padding: 14px 24px`, tab
  `top: 0 · left: 24px · width: 52px · height: 4px · border-radius: var(--r-tab) · z-index: 2`.
- **Every S02-S62 checkbox value byte-exact:** container `1px solid var(--line)` / `11px` /
  `var(--shell)` / `2px 13px`; row `flex` / `flex-start` / `10px` / `11px 0` / `pointer`; square
  `appearance: none` / `17px` / `17px` / `5px` / `1.5px solid var(--ok-edge)` / `grid` /
  `place-items: center`; checked `var(--ok-dot)`; glyph `"✓"` / `var(--core)` / `10px` / `800`;
  label `11.5px` / `1.5`.
- **The 29 `.policy*` + 5 `.consent*` beyond the PLAN's named values, spot-checks all byte-exact:**
  eyebrow (`--font-mono` 9px/700/.16em/`--gold`), title (`--font-display` 21px/600/-.018em,
  `margin-top: 9px`), lede (11.5px/1.55/`--text-2`, `margin-top: 5px`), pills
  (`4px 10px`/`--r-pill`/`1px solid var(--line-strong)`/`--shell`/mono 8.5px/700/.08em/`--muted`)
  and the jump row (`flex`/`8px`/`wrap`/`margin-bottom: 16px`), section head
  (`flex`/`baseline`/`12px`), number (`flex: 0 0 26px`/mono 10.5px/700/`--accent`), dot
  (`0 0 auto`/`margin-top: 5px`/`5px`/`5px`/`var(--r-dot)`/`--accent`), close control
  (`0 0 auto`/`grid`/`place-items: center`/`28px`/`28px`/`--r-pill`/`1px solid var(--line-strong)`/
  `--muted`/14px/pointer), primary (`10px 18px`/`--r-pill`/`--ink`/`--bg`/12px/700/pointer).
- **Class-name coverage, both directions:** 34 `policy*`/`consent*` class names used by
  `PrivacyPolicyModal.tsx` + `SignUpFlow.tsx`, 34 styled in the block, **`USED but NOT STYLED:
  (none)` · `STYLED but NOT USED: (none)`**.
- **Adaptations, each judged and each correct:** scrim `absolute → fixed` (artboard frame vs real
  viewport); bezel `absolute/left/right/top/bottom → relative` + the flex-centred clamp;
  core `height: 100%; box-sizing` dropped (it is a flex child of a `max-height: 92vh` column, so
  it sizes and shrinks correctly without them — `min-height: 0` is present); `.consentBox`
  unchecked has `background: none` because the artboard draws only the CHECKED state, which the
  block places on `:checked` and `::after`; the head's band and its inner flex row merged into one
  `.policyHead`, which matches the component's DOM exactly (`PrivacyPolicyModal.tsx:172-173`).
- **`box-shadow: var(--shadow-pop)` for the artboard's literal `0 30px 70px -25px rgba(0,0,0,.55)`
  — I judge the mapping CORRECT.** S02-S60 forbids a literal; COMMON §7 maps the design's own
  `shadowBig` to `--shadow-pop`; the artboard hard-codes a value where its own token map has an
  entry, and the token is the mode-aware form of it. Recorded because the next lens will have the
  same reflex.
- **“Download PDF” (`turn-10-cookie-consent.html`, footer) is deliberately absent** — it is not
  among the 29 class names and the product ships no PDF. COMMON §3's honesty law
  ("no fake downloads"). **Correct omission, not a fidelity gap.**

### 4.5 Motion and reduced motion (S02-S63, R24) — asserted mechanically, then mutated

`probes/…-css-structure.mjs`, an analysis independent of the author's parser:

```
== S02-S63 animated selectors  : [".policyScrim",".policyBezel"]
== S02-S63 neutralised selectors: [".policyScrim",".policyBezel"]
== S02-S63 UNCOVERED           : []
== S02-S63 selectors with `transition:` (not covered by the rule): []
```

The two `animation:` declarations are at `globals.css:7328` (`consentPolicyScrimIn 140ms`) and
`:7347` (`consentPolicyCardIn 180ms`); the query at `:7620-7624` names both. No `transition:`
anywhere in the block, so `animation: none` neutralises the block's entire motion surface. The
author's F4 duplicate-rule defect is gone: **0 duplicate top-level selectors across 43 rules.**

### 4.6 `.policyGateHint` (ticket `t_f2a9994f` N3) — RENDERED, not read

`probes/…-gatehint.test.tsx` under `probes/…-vitest.review.config.ts`: the modal is mounted in
jsdom with the **shipped stylesheet attached**, with `scrollTop/clientHeight/scrollHeight` stubbed
on `HTMLElement.prototype` so the scroll gate stays CLOSED (without that stub jsdom's 0/0/0
metrics open it at mount and the disabled branch never renders — the probe would pass vacuously).

```
REV-PROBE computed .policyGateHint = {"display":"inline","visibility":"visible","position":"absolute",
"width":"1px","height":"1px","overflow":"hidden","clip":"rect(0px, 0px, 0px, 0px)","whiteSpace":"nowrap"}
 ✓ renders the hint, resolves aria-describedby, and computes to a clipped (not hidden) box
```

`aria-describedby="policy-modal-gate-hint"` resolves to a node whose text is
`"Scroll to the end of the policy to continue."`; the button carries `aria-disabled="true"` and a
real `disabled`. **Negative control** (the probe must be able to fail): planting
`display: none` on `.policyGateHint` gives
`REV-PROBE … "display":"none"` → `AssertionError: expected 'none' not to be 'none'`, restored,
`diff -q` clean. **The element stays in the accessibility tree and off the visible footer.**
The block's nine declarations equal `.srOnly`'s (`globals.css:684-694`) as a set.

### 4.7 S02-S65 standing guard, and ten mutants of mine (`probes/…-rev-c8-mutants.sh`, capture `…-mutants.txt`)

Baseline `Tests 8 passed (8)`. Each mutant: `cp` snapshot → apply with a uniqueness-checked
anchor → assert it landed → run → restore by `cp` → `diff -q`.

| # | mutant | result |
|---|---|---|
| M1 | drop `.policyBezel` from the reduced-motion list | **CAUGHT** `1 failed \| 7 passed` |
| M2 | drop `.policyScrim` from it instead | **CAUGHT** |
| M3 | add a THIRD animated selector with no reduced-motion entry | **CAUGHT** |
| M4 | **`transform: translateZ(0)` on `.authCard`** (the S02-S65 charge) | **CAUGHT** |
| M5 | width clamp `680px → 720px` | **CAUGHT** |
| M6 | `.consentBox` `17px → 16px` | **CAUGHT** |
| M7 | hairline moved from the first row to every `.consentRow` | **CAUGHT** |
| M8 | `display: none` on `.policyGateHint` | **CAUGHT** |
| M9 | disabled `opacity .65 → .60` (fails 4.5:1 in Terracotta) | **CAUGHT** |
| M10 | a `#hex` literal inside the block | **CAUGHT** |

**10 applied, 10 caught, 10 restored, `git status --porcelain` empty after the battery.** The
suite discriminates on every property the PLAN's S02-S59…S02-S65 name.

### 4.8 S01/S02 selector overlap for the C9 merge

Measured against `.worktrees/consent-s01/dialectical-engine/apps/ui/app/globals.css` (read only):

```
== S01 block: 372 lines, 50 rules, 33 class tokens
== S02 block: 404 lines, 44 rules, 34 class tokens
== SHARED class tokens  : []
== SHARED full selectors: []
== SHARED @keyframes names: []
== S01 @keyframes: (none)   S02 @keyframes: consentPolicyScrimIn, consentPolicyCardIn
```

**The shared-selector set is EMPTY.** S01 owns `consentActions consentBar consentBarBezel
consentBarCore consentBody consentCard consentCardCore consentCardFooter consentCardTitle
consentCatDesc consentCatDetail consentCatHead consentCatList consentCatMain consentCatName
consentCatRow consentCopy consentEyebrow consentFooterGap consentGhost consentGhostStrong
consentKnob consentLede consentLink consentPrimary consentScrim consentSwitch consentTab
consentTag consentTag-analytics consentTag-essential consentTag-quality consentTitle`; S02 owns
the 29 `policy*` plus `consentGroup consentRow consentBox consentText consentPolicyLink`. The two
share the `consent` PREFIX and not one token. **`@keyframes` names checked too** — they are
document-global and a collision would cross-bind silently at the merge; there is none.
The four tokens S02 references and does not declare are all present in the S01 lane. **No cascade
consequence at the C9 merge beyond the expected end-of-file textual conflict.**

---

## 5. What I did NOT verify

- **Rendered geometry and both-mode appearance.** jsdom computes no layout. Every geometry claim
  above is about stylesheet TEXT plus one `getComputedStyle` on one element. Whether the modal
  looks right at 680px / 92vh, and whether both surfaces repaint live on the mode toggle, are V's
  acceptance steps 1-2, 5, 13, 14.
- **A real browser with `prefers-reduced-motion: reduce`.** I proved the rule's coverage and that
  dropping either half fails; I did not run the OS setting.
- **The C9 merge.** Measured as disjoint; not performed or simulated.
- **Whether S01's four tokens survive to merge time.** They exist in the S01 lane's working tree
  today; S01 is not merged.
- **`.policyGateHint`'s announcement by a real screen reader.** Verified it is in the a11y tree
  and that the description resolves; not that any AT reads it.
- **The author's 20-mutant table.** I built my own ten rather than re-running theirs.

---

## 6. Predictions (falsifiable evidence that blindness held)

A parallel lens reading the same diff will, I expect, confirm the block discipline, the token
audit and the three-run figure — those are easy and mechanical — and **will most likely accept
the `.70 → 5.61` figure**, because the pinned rung reproduces, the author states it as a measured
correction with a plausible three-model table, and the number appears only in comments. Catching
it requires *executing an unpinned rung*, which nothing in the packet asks for; I only got there
because I re-ran the two-file mutant across the whole ladder instead of at `.65`. If another lens
did catch it, I predict they reported it as non-blocking documentation drift and did **not** trace
it to `Math.round(96.5) = 97` vs `Math.floor(96.5) = 96`, and therefore did not notice that the
author's *rounded* row is the floored value — which is what makes F1 a retraction rather than a
correction. I also expect **N2 (the duplicated comment) to be missed by any lens that reads the
diff rather than counting**, since the two copies are 17 lines apart and both read as correct
prose, and **N1 (the focus rings) to be missed entirely**, because it is an ABSENCE — no line of
the diff is wrong; the finding only exists if you enumerate the block's focusable controls and
ask which `:focus-visible` rule in the *whole* stylesheet matches each one. Conversely, if a lens
filed the `box-shadow: var(--shadow-pop)` substitution or the `absolute → fixed` scrim as design
deviations, I believe that is wrong and I have given the measurement above for both.

**Round 1 of 3. This REWORK does not approach the cap.** Everything under B1 and N2 is a text
edit plus one retraction; N1 is one CSS rule. The stylesheet itself is sound and I expect a
single round to close all three.

`comments read through: all (5 comments on t_ee948194, 1 on t_e2bdcddb — my own CLAIM)`
