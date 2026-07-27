# Architecture conformance — responsive-ui-20260724

**Scope:** sample-verify INTEGRATED product vs approved design FinalPlan.md §3 (load-bearing items only).  
**Code under test (read-only):** `.worktrees/integrate` @ `c49b3a6533f6f263f58b107ec284dbb72b2614e2` (`integrate/responsive-ui-20260724`).  
**Design:** `.hermes/planning/responsive-ui-20260724/FinalPlan.md` §3.1–§3.4 + S1a import hub.  
**Context only (not a substitute for code inspection):** `.hermes/reports/responsive-ui-20260724/s8-evidence.md` — FINAL automated matrix GREEN 199/199; real-device pinch rows remain BLOCKED-ESCALATED (product-truth, not architecture drift).  
**Method:** static source sample-verify + greps. Product code not modified.

## Verdict

**ARCH CONFORMANCE: SATISFIED**

All named load-bearing architecture items land as designed. No undesigned architecture smuggled in.

## Per-item conformance table

| # | Item (FinalPlan §3) | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | **CanvasViewport sizer×scale** — outer sizer `width/height = layout × zoom`; inner `transform: scale(zoom); transform-origin: 0 0`; sticky set-aside sibling *before* sizer (not inside transform) | **SATISFIED** | `components/CanvasViewport.tsx:575–595` — `.canvasSizer` sized `layoutWidth * zoom` / `layoutHeight * zoom`; `.canvasInner` `transform: \`scale(${zoom})\``, `transformOrigin: "0px 0px"`. Sticky slot `{stickyControl}` is sibling before sizer (`:575`). `DebateCanvas.tsx:123–136` passes sticky as `label.canvasStickyToggle`. `styles/canvas.css:27–31` sticky; `:44–52` sizer/inner; no transform on sticky. |
| 2 | **gestureOwner + ownership handover** — WebKit gesture atomically suspends PE path; single owner mutates zoom/scroll | **SATISFIED** | `CanvasViewport.tsx:28–33` `GestureOwner` union (`none` \| `pointer-pan` \| `pointer-pinch` \| `webkit-gesture` \| `touch-pinch`); `gestureOwnerRef` `:97`; `setGestureOwner` writes ref + `dataset.gestureOwner` `:133–134`. `handleGestureStart` clears PE pan/pointers and sets `"webkit-gesture"` `:389–396`; PE handlers no-op while webkit owns (`:311`, `:391+`). |
| 3 | **Native `{passive:false}` registration** for zoom-critical streams (not React-synthetic-only) | **SATISFIED** | `CanvasViewport.tsx:25` `PASSIVE_FALSE = { passive: false }`; native `surface.addEventListener` for pointer\*, gesture\*, touch\*, wheel with `PASSIVE_FALSE` `:513–524`; capture-phase click `:525`; matching `removeEventListener` cleanup `:527–540`. |
| 4 | **Pointer-intent matrix** — interactive hit-test skip pan; 8px threshold; `didPan` click suppression; overview zoom-to-card | **SATISFIED** | Interactive skip: `isInteractiveTarget` via `closest('button, a, input, …')` `:64–72`; `handlePointerDown` returns early `:313`. Threshold: `DRAG_THRESHOLD = 8` in `lib/canvasViewport.ts:7`; pan only after `Math.hypot < DRAG_THRESHOLD` skip `:357–359`. `didPanRef` + capture-phase `handleClick` suppress synthesized click after pan `:481–487`. Overview: when `zoom < READABLE_ZOOM`, card `.nodeWrap` click → `applyUserZoom(1, …)` focal zoom-to-card `:489–510`. Band: `data-zoom-band` overview/normal `:552–553`, `:585`. |
| 5 | **Three-mode fitPolicy** — `column-auto` \| `overview-auto` \| `user-owned`; mode-preserving resize (≥32px threshold) | **SATISFIED** | `lib/canvasViewport.ts:10` `FitPolicyMode`; `fitPolicyAfterResize` `:59–99` preserves mode, recomputes overview vs column only in matching auto modes; `RESIZE_THRESHOLD = 32` `:6`. Consumer: default `column-auto` (`CanvasViewport.tsx:91–95`); Fit → `overview-auto` (`:555–563`); pinch/wheel/±/1:1 → `user-owned` via `applyUserZoom` (`:180–183`); resize path calls `fitPolicyAfterResize` (`:253+`). Bounds `ZOOM_MIN=0.1`, `ZOOM_MAX=2`, `READABLE_ZOOM=0.5` (`canvasViewport.ts:3–5`). |
| 6 | **Collision-map variables once in `styles/base.css`**, elsewhere `var(...)` only | **SATISFIED** | Definitions only in `styles/base.css:88–98` (`--safe-b`, `--dock-*`, `--zoom-cluster-*`, `--token-dock-clearance`, z-index stack). Grep for `--safe-b:` / `--dock-w:` / etc. under `web/` product CSS shows **sole definition site** `base.css` (test files assert strings; consumers use `var(...)` in `canvas.css`, `overlays.css`, `synth.css`, `debate-chrome.css`). |
| 7 | **Import-only `globals.css` hub** (S1a) | **SATISFIED** | `app/globals.css` is 18 lines, each `@import "../styles/….css";` — no selector/rule bodies. |
| 8 | **Foundation viewport export with `viewportFit: "cover"`** — no `maximumScale` / `userScalable: false` | **SATISFIED** | `app/layout.tsx:33–37` `export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" }`. No `maximumScale` / `userScalable` in file. |
| 9 | **No undesigned architecture** — no rogue transform on sticky ancestors; no portals for this chrome; no new global state libs | **SATISFIED** | Sticky `.canvasStickyToggle` has no `transform` (canvas.css); zoom transform confined to `.canvasInner` inside sizer; sticky is DOM sibling before sizer. Grep `createPortal` / `Portal` under `web/` product sources: **0 hits**. Grep `zustand|redux|jotai|recoil|mobx` in `package.json` and product imports: **0 hits**. Residual CSS `transform`s elsewhere (popover, toast, animations, split meter) are pre-existing chrome/animation, not sticky-ancestor zoom smuggling. |

## Drift findings

**None** on the named load-bearing architecture checklist.

### Non-drift notes (design-compatible implementation detail)

- Gesture owner token is multi-value (`webkit-gesture`, `pointer-pinch`, …) rather than only `"webkit"` — stronger than the design sketch; still single-owner mutation.
- Pure transition helper is named `fitPolicyAfterResize` (resize edge); mode transitions for Fit / user gestures live in the component using the same three mode strings.
- Interactive hit-test uses a broad focusable/control selector set rather than enumerating `.nodeCtrl` / `.scoreBadgeButton` by class — still blocks pan on interactive targets including sticky label/input and zoom buttons.

## S8 context (not architecture gate)

S8 final automated matrix is GREEN (199/199 applicable cells). Remaining BLOCKED-ESCALATED rows are real-device / real-browser product-truth (iOS/Android pinch video, non-zero safe-area, installed browsers) — outside this static architecture pass.

## Verdict line

ARCH CONFORMANCE: SATISFIED
