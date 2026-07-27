G3 PASS

Independent re-review (REWORK ROUND 1) of revised Plan.md for mission responsive-ui-20260724.
Round-1 artifact retained append-only: `.hermes/planning/responsive-ui-20260724/PlanReview.md` (not overwritten).
Upstream: revised Plan.md (REWORK ROUND 1 header + §g disposition). Product spot-checks under `apps/dialectical-engine/web`. H2-verdict*, H2-verdict-r2*, H3-merge, and other Hermes review outputs were **not** read (independence law).

---

## Per-finding disposition (G3 #1–#13)

### 1. [blocker → resolved] S1 partition vs `readFileSync("app/globals.css")` consumers

**Plan claims:** §a.6 inventories 5 CSS-reading tests; §e S1a mandates `tests/loadCss.mjs` concat loader, in-slice migration of those 5, hub-not-superset rule, 43-file green gate + loader byte-identity.

**Product spot-check:** Exactly five `.mjs` files reference `globals.css`:
`app/debate/headerToolbarResilience.source-test.mjs:6`,
`app/debate/scoringTreePrimary.source-test.mjs:6`,
`components/DebateCanvas.responsive.test.mjs:6`,
`components/RecommendedInvestigations.source-test.mjs:8,53`,
`lib/scoreBandTokens.test.mjs:6`.
Node test file count under `web/` = **43** (matches §a.6).

**Disposition: resolved.** Contract matches the real consumer set and states the loader—not the hub file—as the source of truth.

---

### 2. [blocker → resolved] S1 pure-move fiction

**Plan claims:** Ordering law §e:258 `S1a → S2 → S1b → {S3–S7} → S8`; S1a partition-only (zero selector/value/order changes); S1b foundation behavior after S2 RED vehicles exist (§d.2, §e items 1–3).

**Disposition: resolved.** The impure S1 is structurally split; Risk 1 (§f) no longer pretends behavior is a pure move.

---

### 3. [major → resolved] Pinch overclaim / PE floor support

**Plan claims:** §a.5:69 multi-touch delivery on iOS not assumed; §b.2 contract hierarchy: buttons = floor, pinch = evidence-gated, no silent per-UA disable; state machine + `pointercancel` commit policy; `touch-action: none` forbidden on shell; ctrl+wheel retained; PE unit tests labeled “handler contract” (§d.3).

**Disposition: resolved.** The “fully supported across the floor” claim is gone; residual path is formal S8/H9 evidence (§d.5), which is what G3 required.

---

### 4. [major → resolved] `viewportFit: "cover"` + safe-area

**Plan claims:** §b.1:91 explicit `viewportFit: "cover"`; safe-area rules comment-dependent on it; §b.4 `--safe-b` / dock/zoom offsets; S1b + S8 notch check or residual.

**Product:** `layout.tsx` still has only `metadata` (no viewport) — plan correctly targets S1b to add it; zero `env(`/`safe-area` in CSS today.

**Disposition: resolved** at design level. (See NEW #14 for a **minor** CI-emulation clarity nit that does not re-open this major.)

---

### 5. [major → resolved] False “zero test infrastructure”

**Plan claims:** §a.6 full correction; §d.1 dual baseline; §e S2 `test:src` forever; S3 RED-first rewrite of `headerToolbarResilience` + sweep of 18 `DebatePageClient` readers.

**Product spot-check:** 43 node:test files; 18 readers of `DebatePageClient` (grep inventory matches §a.6 list family); `package.json` still has no vitest/playwright (additive harness claim correct).

**Disposition: resolved.**

---

### 6. [major → resolved] S3–S7 collisions / SynthesisPanel exclusive file fiction

**Plan claims:** §b.4 single-source collision variables; S4/S7 consume only; §e S5 binding constraint: synthesis sheet **only** in `SynthesisPanel.tsx` + `styles/synth.css`, stop-and-reslice if parent edit required; tokenDock comment fix assigned to S3.

**Product:** `SynthesisPanel` always mounted at `DebatePageClient.tsx:1178-1192`; tokenDock CSS `right: 18px; bottom: 18px` (`globals.css:2540-2547`) while comment says bottom-left (`:1273`) — plan acknowledges both.

**Disposition: resolved.**

---

### 7. [major → resolved] Fit-width first-layout-only

**Plan claims:** §b.2 `fitPolicy` with `auto` vs `user-owned`; re-fit on resize/orientation/ResizeObserver >32px while auto; Fit returns to auto; unit-tested in `lib/canvasViewport.ts`.

**Disposition: resolved.**

---

### 8. [major → resolved] Shell model beyond vh→dvh

**Plan claims:** §b.1 explicit `.debateView` min-height/height dvh, flex column, `padding-bottom: calc(var(--token-dock-clearance) + env(safe-area-inset-bottom, 0px))`; `.debateMain` flex:1 min-height:0 retained (`globals.css:1257-1261`); iOS residual on S8 checklist.

**Disposition: resolved.**

---

### 9. [major → resolved] Flex-squeeze acceptance / residual anywhere

**Plan claims:** §b.1 card wrap at **≤768**; §d.4 mid-word-break + ≥12ch metric on fixture English; §a.2/§f residual for pathological tokens kept.

**Disposition: resolved.** Metric is implementable in Playwright; residual honesty matches G3 ask.

---

### 10. [major → resolved] Test strategy realism

**Plan claims:** §d.6 tiered S2 smoke (chromium × 320/375/1440) / per-slice / S8 full matrix; Playwright bootstrap scheduled in S2; goldens GREEN-only; PE tests = handler contract; §d.3 component-geometry (not bare document scrollWidth).

**Disposition: resolved.**

---

### 11. [minor → recorded sanely] Mechanism choice (media queries)

**Plan §g / §b.1:** endorsement recorded, unchanged. **OK.**

---

### 12. [minor → recorded sanely] Sticky outside transform + a11y

**Plan §b.2:** sticky sibling-before-sizer invariant; DOM test; aria-live % readout; `role="group"` on zoom cluster.

**Product:** sticky label is sibling before `.canvasInner` (`DebateCanvas.tsx:122-148`) — structural claim holds.

**OK.**

---

### 13. [minor → recorded sanely] Intake scope honesty

**Plan §f Non-goals:** print + forced-colors out of scope; landscape/split-view in scope via width + re-fit. **OK.**

---

## Fresh adversarial pass (restructured material)

### Ordering law `S1a → S2 → S1b → {S3–S7} → S8`

Sound: only non-behavioral work precedes the harness; behavioral foundation waits for RED vehicles. Parallel S3–S7 after S1b with file-disjointness + SynthesisPanel constraint is coherent. No new blocker/major.

**Note (not a defect):** S1b may touch several `styles/*.css` section files before parallel slices own them — acceptable because S1b is serial and “enumerated at ticket time” (§e S1b).

### §b.4 Chrome collision variables

Single-source offsets and z-index ladder address the bottom-right tokenDock vs zoom conflict. Variables are defined in S1b and consumed read-only by S4/S7 — correct ownership.

Residual polish only: expanded token unlock form height is not modeled (NEW #15 minor).

### fitPolicy re-fit

Auto/user-owned split + 32px threshold + Fit return path is complete enough for phones, rotation, and split-view width changes. Unit-test ownership in `lib/canvasViewport.ts` is the right place.

### §d.5 Floor-browser evidence gates

Named acquisition paths + formal BLOCKED residual (never silent) is the correct honesty posture for a Windows-only fleet without guaranteed macOS/iOS hardware. Emulation is not sold as product truth. No defect.

### §d.7 Route × state × width matrix

Large but intentional definition of “ALL screens” for H9. Automated-where-fixtures-allow + agent-browser remainder is realistic. Schedule risk already in §f R7/R3 — not a plan correctness failure.

---

## NEW findings (rework-introduced or residual)

### 14. [minor] S1b / d.2 safe-area GREEN may be unsatisfiable under plain Playwright device profiles

**Evidence:** §d.2 lists a RED vehicle: at an iPhone-notch profile, `.tokenDock` computed bottom offset includes a **non-zero** safe-area inset. §b.4/S8 correctly allows a notch-emulation residual, but S1b’s “named acceptance check from §d.3” can be read as requiring CI GREEN for non-zero `env(safe-area-inset-*)`. Many Playwright Chromium/WebKit device descriptors still yield `env(safe-area-inset-*) = 0` even with `viewport-fit=cover`.

**Exact modification required (optional polish, not blocking PASS):** State explicitly that S1b GREEN is (1) `viewportFit: "cover"` exported, (2) CSS uses `env(safe-area-inset-*, 0px)` in the clearance calc, (3) source/CSS structural asserts; **computed non-zero inset** is an S8 real-device (or residual) gate, not a mandatory S1b CI geometry pass.

### 15. [minor] S3 file contract under-states scoring-status relocation surface

**Evidence:** §b.1 moves scoring status text into the scoring insights strip on phones; §e S3 files list `DebatePageClient.tsx` as “header region + tokenDock comment” only. Insights markup lives later in the same file (e.g. `scoringInsightsPanel` around `DebatePageClient.tsx:1037+`), so a JSX relocation (not pure CSS hide/show) needs a wider edit surface than “header region.”

**Exact modification required:** Widen S3’s `DebatePageClient` contract to “header + scoring status presentation (top bar and/or insights summary)” or require the relocation to be pure CSS against existing DOM (and say so).

### 16. [minor] Zoom cluster offset assumes constant dock height

**Evidence:** §b.4 `--zoom-cluster-offset-b: calc(var(--dock-offset-b) + 52px)` while token unlock form (`DebatePageClient.tsx:1279-1295`, `.tokenForm` flex wrap) can grow taller than a single button when open — risk of overlap at ≤640.

**Exact modification required:** Either measure dock height into a CSS variable via a tiny resize observer in S4/S7, or reserve clearance for the open-form max height (e.g. use a larger constant / `max()` with form-open class on `body`/`debateView`).

These three minors do **not** re-open blockers 1–2 or majors 3–10; they are implementation-ticket polish.

---

## Verdict rationale

Round-1 blockers and majors are **genuinely resolved** in the revised plan text, with product facts re-checked (43 tests, 5 CSS readers, 18 DPC readers, sticky sibling structure, tokenDock CSS, no existing safe-area usage). Minors 11–13 are recorded sanely. Fresh pass on ordering, collision map, fitPolicy, d.5, and d.7 finds no new blocker or major defects—only minor polish items 14–16.

Therefore: **G3 PASS** (plan is ready for H3 merge / downstream slicing from a G3 lens). Round-1 `PlanReview.md` remains the historical record; this file is the rework-round verdict.

---

## Disposition summary table

| ID | R1 severity | R2 disposition |
|----|-------------|----------------|
| 1 | blocker | **resolved** |
| 2 | blocker | **resolved** |
| 3 | major | **resolved** |
| 4 | major | **resolved** |
| 5 | major | **resolved** |
| 6 | major | **resolved** |
| 7 | major | **resolved** |
| 8 | major | **resolved** |
| 9 | major | **resolved** |
| 10 | major | **resolved** |
| 11 | minor | recorded sanely (no change) |
| 12 | minor | recorded sanely (accepted) |
| 13 | minor | recorded sanely (accepted) |
| NEW 14 | minor | open polish |
| NEW 15 | minor | open polish |
| NEW 16 | minor | open polish |

---

mission/step: responsive-ui-20260724 / G3-r2  
artifact reviewed: `.hermes/planning/responsive-ui-20260724/Plan.md` (REWORK ROUND 1)  
prior review retained: `.hermes/planning/responsive-ui-20260724/PlanReview.md`  
REWORK ROUND: 1 of 3  
comments read through: not ticketed (pre-board stage)
