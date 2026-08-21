# S8 responsive UI closure evidence

Mission: `responsive-ui-20260724`  
Ticket: `t_3ac92e37`  
Lane: `S8`, branch `lane/resp-s8`, worktree `.worktrees/resp-s8`  
Integrated commit under test: `c49b3a6533f6f263f58b107ec284dbb72b2614e2`  
Evidence date: 2026-07-26/27 EEST  
Done authority: Hermes only

## Verdict summary

**FINAL mission verdict: AUTOMATED MATRIX PASS; BLOCKED-ESCALATED for mandatory real-device and real-browser product-truth rows.**

- Reconciled automated acceptance result after the F-05 ultimate targeted rerun: **199 passed / 199 applicable cells; 0 failed**.
- Configured total: 224 tests. The remaining 25 are intentional `320/375` mid-word-detector skips outside those widths and are not counted in the 199-cell denominator.
- F-01 through F-05 are green on the integrated tree. The full automated width/browser/state matrix passes, including all Chromium, Firefox, and WebKit 568×320 view/zoom and overlay/collision cells.
- All real-device pinch rows are **BLOCKED-ESCALATED**. No emulation, button test, or synthetic event is counted as pinch product truth.
- Real desktop Safari, real iOS Safari, real Android Chrome, and the installed-browser agent-browser acquisition row are **BLOCKED-ESCALATED**.
- Structural safe-area wiring passed 32/32 automated projects. Computed non-zero insets and iOS dynamic-toolbar behavior remain **BLOCKED-ESCALATED** pending notched hardware.
- No product code was edited. Findings are routed to their owning slices below. S8 does not self-transition the ticket to Done.

## RE-RUN RECONCILIATION — 2026-07-27

The pre-created `lane/resp-s8` worktree fast-forwarded cleanly from `646d6562ff33366100b51b927a4b95319619b4e3` to the supplied integrated fix tip `7d49384c416694179bcac6b0870b9d23c77b1aae`. Product code remained read-only to S8. Each batch used the existing S8 targeted Playwright configuration, ran serially under the mission `heavy.lock`, and released the lock in `finally`.

Exact rerun totals:

- F-01 320 px library/protected-shell cells: **8/8 passed**.
- F-02/F-04 568×320 debate-view and overlay/collision cells: **0/6 passed**.
- F-03 Firefox 844×390 debate-view/zoom-to-card cell: **1/1 passed**.
- Combined: **9/15 newly passing; 6/15 still failing**.

| Finding | Exact project / cell group | Before | After | Rerun evidence |
|---|---|---|---|---|
| F-01 | `chromium-w320` / library | FAIL — 339 px document overflow | **PASS** | `s8-rerun-f01-attempt2/playwright-matrix.json` |
| F-01 | `chromium-w320` / protected shells + AuthGate | FAIL — 339 px document overflow | **PASS** | `s8-rerun-f01-attempt2/playwright-matrix.json` |
| F-01 | `firefox-w320` / library | FAIL — 339 px document overflow | **PASS** | `s8-rerun-f01-attempt2/playwright-matrix.json` |
| F-01 | `firefox-w320` / protected shells + AuthGate | FAIL — 339 px document overflow | **PASS** | `s8-rerun-f01-attempt2/playwright-matrix.json` |
| F-01 | `webkit-w320` / library | FAIL — 339 px document overflow | **PASS** | `s8-rerun-f01-attempt2/playwright-matrix.json` |
| F-01 | `webkit-w320` / protected shells + AuthGate | FAIL — 339 px document overflow | **PASS** | `s8-rerun-f01-attempt2/playwright-matrix.json` |
| F-01 | `profile-custom-320x568-chromium` / library | FAIL — 339 px document overflow | **PASS** | `s8-rerun-f01-attempt2/playwright-matrix.json` |
| F-01 | `profile-custom-320x568-chromium` / protected shells + AuthGate | FAIL — 339 px document overflow | **PASS** | `s8-rerun-f01-attempt2/playwright-matrix.json` |
| F-02 | `chromium-short-568x320` / debate views + zoom | FAIL — selected view/scoring interaction blocked | **FAIL** — F-02 view/scoring checks now proceed, but `[data-synth-tab]` intercepts `Reset zoom to 1:1`; test times out at 120 s | `s8-rerun-f02-f04/playwright-matrix.json` + trace |
| F-02 | `chromium-short-568x320` / overlays + collision union | FAIL — short-height interaction blocked | **FAIL** — `[data-synth-tab]` intercepts `Reset zoom to 1:1` within the 5 s actionable check | `s8-rerun-f02-f04/playwright-matrix.json` + trace |
| F-02 | `firefox-short-568x320` / debate views + zoom | FAIL — selected view/scoring interaction blocked | **FAIL** — F-02 view/scoring checks now proceed, but `[data-synth-tab]` intercepts `Reset zoom to 1:1`; test times out at 120 s | `s8-rerun-f02-f04/playwright-matrix.json` + trace |
| F-02 | `firefox-short-568x320` / overlays + collision union | FAIL — short-height interaction blocked | **FAIL** — `[data-synth-tab]` intercepts `Reset zoom to 1:1` within the 5 s actionable check | `s8-rerun-f02-f04/playwright-matrix.json` + trace |
| F-02 | `webkit-short-568x320` / debate views + zoom | FAIL — selected Thread surface hidden | **FAIL** — F-02 view/scoring checks now proceed, but `[data-synth-tab]` intercepts `Reset zoom to 1:1`; test times out at 120 s | `s8-rerun-f02-f04/playwright-matrix.json` + trace |
| F-04 | `webkit-short-568x320` / overlays + collision union | FAIL — synthesis tab intercepts zoom | **FAIL** — the same `[data-synth-tab]` interception remains within the 5 s actionable check | `s8-rerun-f02-f04/playwright-matrix.json` + trace |
| F-03 | `firefox-short-844x390` / debate views + zoom-to-card | FAIL — zoom cluster intercepts overview-card tap | **PASS** | `s8-rerun-f03/playwright-matrix.json` |

Batch statistics from the JSON reporters were F-01 **8 expected / 0 unexpected**, F-02/F-04 **0 expected / 6 unexpected**, and F-03 **1 expected / 0 unexpected**. Failure contexts and traces are under `.hermes/reports/responsive-ui-20260724/s8-rerun-f02-f04/playwright-artifacts/`. The existing screenshot bundle remains `.hermes/reports/responsive-ui-20260724/s8-final-run/screenshots/`; the rerun fails before the overlay test's new screenshot capture.

**Round-1 mission verdict: BLOCKED-ESCALATED — automated matrix was 193/199 applicable cells with six 568×320 failures, and the mandatory real-device pinch, real Safari/mobile, non-zero safe-area/dynamic-toolbar, and installed-browser agent product-truth gates remained blocked.**

### F-04 round-2 final targeted rerun

The S8 lane then fast-forwarded from `7d49384c416694179bcac6b0870b9d23c77b1aae` to the gated round-2 integration tip `3ef49c82f766fc1dfa119458838384fd7ae31d23`. The existing targeted configuration reran only the six 568×320 view/zoom and overlay/collision cells across Chromium, Firefox, and WebKit under `heavy.lock`.

| Exact project / cell group | Before round 2 | After round 2 | Evidence |
|---|---|---|---|
| `chromium-short-568x320` / debate views + zoom | FAIL — synthesis tab intercepted `Reset zoom to 1:1` | **FAIL** — Reset now succeeds, but `.debateTopBar` intercepts `Fit whole tree (overview)` until the 120 s test timeout | `s8-final-rerun-round2/playwright-matrix.json` + trace |
| `chromium-short-568x320` / overlays + collision union | FAIL — synthesis tab intercepted Reset | **PASS** | `s8-final-rerun-round2/playwright-matrix.json` + screenshot |
| `firefox-short-568x320` / debate views + zoom | FAIL — synthesis tab intercepted `Reset zoom to 1:1` | **FAIL** — Reset now succeeds, but `.debateTopBar` intercepts `Fit whole tree (overview)` until the 120 s test timeout | `s8-final-rerun-round2/playwright-matrix.json` + trace |
| `firefox-short-568x320` / overlays + collision union | FAIL — synthesis tab intercepted Reset | **PASS** | `s8-final-rerun-round2/playwright-matrix.json` + screenshot |
| `webkit-short-568x320` / debate views + zoom | FAIL — synthesis tab intercepted `Reset zoom to 1:1` | **FAIL** — Reset now succeeds, but `.debateTopBar` intercepts `Fit whole tree (overview)` until the 120 s test timeout | `s8-final-rerun-round2/playwright-matrix.json` + trace |
| `webkit-short-568x320` / overlays + collision union | FAIL — synthesis tab intercepted Reset | **PASS** | `s8-final-rerun-round2/playwright-matrix.json` + screenshot |

The JSON reporter recorded **3 expected / 3 unexpected / 0 skipped / 0 flaky** in 399,200 ms. Three failure traces and three passing overlay screenshots are retained under `.hermes/reports/responsive-ui-20260724/s8-final-rerun-round2/`.

**Round-2 automated disposition: 196/199 applicable cells pass; three 568×320 view/zoom cells remain failing. The automated matrix is not final-green, so no `FINAL mission verdict` or final `READY FOR PEER REVIEW` is claimed. The standing real-device pinch, real Safari/mobile, non-zero safe-area/dynamic-toolbar, and installed-browser agent rows remain BLOCKED-ESCALATED.**

### F-05 ultimate targeted rerun

The S8 lane fast-forwarded cleanly from `3ef49c82f766fc1dfa119458838384fd7ae31d23` to the gated F-05 integration tip `c49b3a6533f6f263f58b107ec284dbb72b2614e2`. The existing targeted configuration then reran only the three 568×320 debate views/zoom cells across Chromium, Firefox, and WebKit under `heavy.lock`.

| Exact project / cell group | Before F-05 | After F-05 | Evidence |
|---|---|---|---|
| `chromium-short-568x320` / debate views + zoom | FAIL — `.debateTopBar` intercepted `Fit whole tree (overview)` | **PASS** | `s8-ultimate-rerun-f05/playwright-matrix.json` |
| `firefox-short-568x320` / debate views + zoom | FAIL — `.debateTopBar` intercepted `Fit whole tree (overview)` | **PASS** | `s8-ultimate-rerun-f05/playwright-matrix.json` |
| `webkit-short-568x320` / debate views + zoom | FAIL — `.debateTopBar` intercepted `Fit whole tree (overview)` | **PASS** | `s8-ultimate-rerun-f05/playwright-matrix.json` |

The JSON reporter recorded **3 expected / 0 unexpected / 0 skipped / 0 flaky** in 41,240 ms. The exact console log and JSON report are retained under `.hermes/reports/responsive-ui-20260724/s8-ultimate-rerun-f05/`.

**FINAL mission verdict: the full automated matrix is GREEN at 199/199 applicable cells, with 25 intentional N/A cells outside the denominator. Mission closure remains BLOCKED-ESCALATED only for the standing real iOS/Android pinch, Windows precision-touchpad, macOS Safari trackpad, real Safari/mobile rendering, non-zero safe-area/iOS dynamic-toolbar, and installed-browser agent product-truth rows.**

## Evidence inventory

| Evidence | Path / exact result |
|---|---|
| Primary 32-project run | `.hermes/reports/responsive-ui-20260724/s8-final-run/playwright-matrix.json` — 174 pass, 25 fail, 25 skip before targeted harness reconciliation |
| Primary console log | `.hermes/reports/responsive-ui-20260724/s8-final-run/playwright-matrix.log` |
| Primary traces | `.hermes/reports/responsive-ui-20260724/s8-final-run/playwright-artifacts/` |
| Screenshots | `.hermes/reports/responsive-ui-20260724/s8-final-run/screenshots/` — 31 PNGs |
| Targeted lifecycle reconciliation | `.hermes/reports/responsive-ui-20260724/s8-targeted-lifecycle/playwright-matrix.json` — **32/32 pass** |
| Targeted short-height confirmation | `.hermes/reports/responsive-ui-20260724/s8-targeted-short/playwright-matrix.json` — **5/12 pass, 7/12 fail** |
| WebKit 568×320 collision confirmation | `.hermes/reports/responsive-ui-20260724/s8-targeted-webkit-short/playwright-matrix.json` — **0/1 pass**, synthesis tab intercepts zoom control |
| F-01 targeted rerun | `.hermes/reports/responsive-ui-20260724/s8-rerun-f01-attempt2/playwright-matrix.json` — **8/8 pass** |
| F-02/F-04 targeted rerun | `.hermes/reports/responsive-ui-20260724/s8-rerun-f02-f04/playwright-matrix.json` — **0/6 pass**, traces retained |
| F-03 targeted rerun | `.hermes/reports/responsive-ui-20260724/s8-rerun-f03/playwright-matrix.json` — **1/1 pass** |
| F-04 round-2 final targeted rerun | `.hermes/reports/responsive-ui-20260724/s8-final-rerun-round2/playwright-matrix.json` — **3/6 pass**; three traces and three screenshots retained |
| F-05 ultimate targeted rerun | `.hermes/reports/responsive-ui-20260724/s8-ultimate-rerun-f05/playwright-matrix.json` — **3/3 pass**; Chromium, Firefox, and WebKit 568×320 views/zoom |
| Short-height screenshots | `.hermes/reports/responsive-ui-20260724/s8-targeted-short/screenshots/` — 5 PNGs |
| Synthetic handler contracts | `.hermes/reports/responsive-ui-20260724/s8-handler-contracts/` — Vitest **27/27**, Playwright **7/7** |
| Agent-browser attempt | `.hermes/reports/responsive-ui-20260724/s8-agent-browser/attempt.md` — exact response `No browser is available` |
| Exact `pnpm test:e2e:full` attempt | `.hermes/reports/responsive-ui-20260724/s8-final-run/pnpm-test-e2e-full.log` |

The exact `pnpm test:e2e:full` command did not start Playwright because machine-global pnpm dependency-status enforcement exited 1 with `ERR_PNPM_IGNORED_BUILDS` for `sharp@0.34.5`. The generated untracked `pnpm-workspace.yaml` placeholder was removed. The S8 runner then invoked the installed Playwright binary directly and completed all 224 configured tests. This tooling failure is reported separately from the 199 applicable acceptance cells.

## Count reconciliation

The primary full run recorded 174 pass and 25 fail among 199 applicable cells. Ten failures were a test-only responsive-selector error: at widths above 920 px, synthesis is a visible side panel rather than a visible “Open synthesis” button. The corrected lifecycle test passed all 32 projects in the targeted rerun, replacing those ten false negatives. The short-height targeted rerun reproduced the same five passes and seven product failures for its twelve cells.

Therefore:

`174 primary passes + 10 reconciled lifecycle passes = 184 passes before owning-slice fixes`

`25 primary failures - 10 disproven harness failures = 15 product failures before owning-slice fixes`

The 2026-07-27 targeted rerun then reconciles those 15 cells as:

`184 previous passes + 9 newly passing cells = 193 passes`

`15 previous failures - 9 newly passing cells = 6 failures`

The F-04 round-2 rerun then reconciles the six remaining cells as:

`193 previous passes + 3 newly passing overlay/collision cells = 196 passes`

`6 previous failures - 3 newly passing overlay/collision cells = 3 failures`

The F-05 ultimate rerun reconciles the final three cells as:

`196 previous passes + 3 newly passing view/zoom cells = 199 passes`

`3 previous failures - 3 newly passing view/zoom cells = 0 failures`

### Acceptance group totals

| Cell group | Pass | Fail | N/A | Applicable total | Verdict |
|---|---:|---:|---:|---:|---|
| Library: empty, populated, error, composer focus/submit | 32 | 0 | 0 | 32 | PASS after F-01 rerun |
| Protected shells: `/new`, `/settings`, `/admin/workers`, AuthGate states, route lifecycle | 32 | 0 | 0 | 32 | PASS after F-01 rerun |
| Debate lifecycle: loading, generating, completed, error, no-tree, single-shot | 32 | 0 | 0 | 32 | PASS after 32/32 targeted reconciliation |
| Debate views, scoring open/closed, zoom bands and zoom-to-card | 32 | 0 | 0 | 32 | PASS after F-05 ultimate rerun |
| Overlay/collision union, including expanded dock | 32 | 0 | 0 | 32 | PASS after F-04 round-2 rerun |
| Safe-area structural wiring | 32 | 0 | 0 | 32 | PASS structurally; real inset gate remains escalated |
| Mid-word-break detector at 320/375-class widths | 7 | 0 | 25 | 7 | PASS for every applicable project |
| **Total** | **199** | **0** | **25** | **199** | **PASS — automated matrix** |

### Project × viewport totals

`P/F/N` means pass/fail/intentionally not applicable.

| Project | P/F/N | Project verdict |
|---|---:|---|
| Chromium 320×900 | 7/0/0 | PASS |
| Chromium 375×900 | 7/0/0 | PASS |
| Chromium 768×900 | 6/0/1 | PASS |
| Chromium 1024×900 | 6/0/1 | PASS |
| Chromium 1440×900 | 6/0/1 | PASS |
| Chromium 2560×900 | 6/0/1 | PASS |
| Chromium 844×390 | 6/0/1 | PASS |
| Chromium 568×320 | 6/0/1 | PASS |
| Chromium 507×1024 | 6/0/1 | PASS |
| Firefox 320×900 | 7/0/0 | PASS |
| Firefox 375×900 | 7/0/0 | PASS |
| Firefox 768×900 | 6/0/1 | PASS |
| Firefox 1024×900 | 6/0/1 | PASS |
| Firefox 1440×900 | 6/0/1 | PASS |
| Firefox 2560×900 | 6/0/1 | PASS |
| Firefox 844×390 | 6/0/1 | PASS |
| Firefox 568×320 | 6/0/1 | PASS |
| Firefox 507×1024 | 6/0/1 | PASS |
| WebKit 320×900 | 7/0/0 | PASS |
| WebKit 375×900 | 7/0/0 | PASS |
| WebKit 768×900 | 6/0/1 | PASS |
| WebKit 1024×900 | 6/0/1 | PASS |
| WebKit 1440×900 | 6/0/1 | PASS |
| WebKit 2560×900 | 6/0/1 | PASS |
| WebKit 844×390 | 6/0/1 | PASS |
| WebKit 568×320 | 6/0/1 | PASS |
| WebKit 507×1024 | 6/0/1 | PASS |
| Custom Chromium 320×568 | 7/0/0 | PASS |
| Emulated iPhone 12 / WebKit | 6/0/1 | PASS approximation only |
| Emulated Pixel 7 / Chromium | 6/0/1 | PASS approximation only |
| Emulated iPad Pro 11 / WebKit | 6/0/1 | PASS approximation only |
| Desktop HiDPI / Chromium 1920×1080 | 6/0/1 | PASS |

Browser-family subtotals are Chromium **56/56**, Firefox **56/56**, WebKit **56/56**, and device profiles **31/31**, for **199/199** overall.

## Route and state coverage

| Route/state row | Automated evidence | Result |
|---|---|---|
| `/` | Empty, populated, coordinator error, composer focus, submit navigation | 32/32 after the F-01 rerun |
| `/new` | AuthGate plus default, options open, JSON validation error, submitting | Included in protected group |
| `/settings` | AuthGate plus model rows, cap edit, toggle, invalid routing error | Included in protected group |
| `/admin/workers` | AuthGate plus metrics, worker list, empty, error | Included in protected group |
| Shared AuthGate | Checking, locked, invalid token, submitting; exercised through all three shells | 32/32 after the F-01 rerun |
| `/debate/[id]` lifecycle | Connecting/loading, generating/streaming tree, completed/synthesis, event error banner, no-tree, single-shot | 32/32 |
| Debate views | Thread, Split, Tree, Map | 32/32 after the F-05 ultimate rerun |
| Tree zoom | Column fit, overview fit, 100%, 0.1 minimum, 2.0 maximum, overview band, zoom-to-card | 32/32; Reset and overview Fit are actionable in all three 568×320 engines |
| Scoring | Insights closed/open and diagnostics overlay | Covered where the views/overlay cell proceeds |
| Overlays | Argument detail, ChallengePopover, Investigation, Workspace, scoring diagnostics, guide modal, synthesis, toast, token unlock form | 32/32 after F-04 round 2 |

## Collision and text assertions

- The dock/zoom/synthesis/toast rectangle union and expanded token dock pass all 32 overlay/collision cells after F-04 round 2.
- Chromium, Firefox, and WebKit at 568×320 now pass the separate view/zoom group: Reset and `Fit whole tree (overview)` are both actionable after F-05.
- Firefox at 844×390 now passes the complete view/zoom-to-card cell.
- The ordinary-English mid-word detector passed all seven applicable 320/375-class projects, and the F-01 rerun cleared the separate 320 px document-overflow cells.
- Safe-area source/runtime structure passed all 32 projects: `viewport-fit=cover`, bottom safe-area consumption, and four-sided drawer inset declarations were present.

## Defect routing

S8 made no product-code fixes.

| Finding | Reproduction/evidence | Owning slice |
|---|---|---|
| **F-01 — RESOLVED in integrated S8 rerun** | All eight prior 320 px library/protected-shell failures pass across Chromium, Firefox, WebKit, and custom Chromium 320×568. | **S6**, ticket `t_e6d36779` |
| **F-02 — RESOLVED in integrated S8 rerun** | Thread, Split, Tree, Map and scoring open/close proceed at 568×320 in all three engines. | **S3**, ticket `t_befaed4f` |
| **F-03 — RESOLVED in integrated S8 rerun** | Firefox 844×390 completes the full debate-view, zoom-band, and zoom-to-card group: 1/1 pass. | **S4**, ticket `t_df57cd49` |
| **F-04 — RESOLVED in integrated round-2 rerun** | Reset is actionable and the complete overlay/collision union passes in Chromium, Firefox, and WebKit at 568×320: 3/3 overlay cells pass. | **S5**, ticket `t_0f877f41` |
| **F-05 — RESOLVED in integrated ultimate rerun** | Chromium, Firefox, and WebKit all complete the full 568×320 view/zoom cell, including actionable Reset and `Fit whole tree (overview)`: 3/3 pass. | **S3**, ticket `t_befaed4f`, with prior S4 coordination |

## Browser-floor rendering table

Playwright browser engines and device profiles are compatibility evidence, not real installed-browser or hardware product truth.

| Rendering row | Verdict | Evidence / acquisition blocker |
|---|---|---|
| Windows Chrome, Edge, Firefox | **BLOCKED-ESCALATED** | Playwright Chromium and Firefox completed the matrix, but the required installed-browser agent run could not start: `No browser is available`. Edge was not directly acquired. |
| Desktop Safari latest | **BLOCKED-ESCALATED** | No macOS/Safari hardware and no V-approved cloud-browser spend. Playwright WebKit results are attached only as an approximation. |
| iOS Safari real | **BLOCKED-ESCALATED** | No iPhone hardware/session and no V-approved cloud device. Emulated iPhone 12/WebKit is approximation only. |
| Android Chrome real | **BLOCKED-ESCALATED** | No Android handset/remote-debug session and no V-approved cloud device. Emulated Pixel 7/Chromium is approximation only. |

## Pinch hard-gate table

There is deliberately no residual or waiver column.

| Pinch platform | Verdict | Reason |
|---|---|---|
| iOS Safari on a real iPhone | **BLOCKED-ESCALATED** | No physical iPhone/session; GestureEvent path lacks product-truth video and focal/page-scale evidence |
| Android Chrome on a real handset | **BLOCKED-ESCALATED** | No physical Android/session; two-pointer PE path lacks product-truth video and focal/page-scale evidence |
| Windows precision touchpad on Chrome | **BLOCKED-ESCALATED** | No controlled physical precision-touchpad gesture capture |
| Windows precision touchpad on Edge | **BLOCKED-ESCALATED** | No controlled physical precision-touchpad gesture capture |
| Windows precision touchpad on Firefox | **BLOCKED-ESCALATED** | No controlled physical precision-touchpad gesture capture |
| macOS Safari trackpad | **BLOCKED-ESCALATED** | No macOS Safari hardware/cloud session |

The synthetic suites passed Vitest 27/27 and Playwright 7/7, including PE, WebKit `GestureEvent`, tier-3 touch, precision-wheel delivery paths, focal math, overview tap, and dock/zoom geometry. These are labeled **handler contract only** and do not change any verdict above.

## Agent-browser product-truth row

**BLOCKED-ESCALATED.** A deterministic fixture and Next.js server were started at `http://127.0.0.1:8120` and `http://127.0.0.1:3120/debate/s8-complete`. The connected in-app browser acquisition call returned exactly `No browser is available`. No interaction, screenshot, or installed-browser result was fabricated. The attempt is recorded at `.hermes/reports/responsive-ui-20260724/s8-agent-browser/attempt.md`. Both started servers were stopped, and ports 3120/8120 were verified closed.

## V MANUAL QA PACKET

### Required V inputs before execution

No deploy URL, seeded real-device test account, or hardware session was supplied. V must fill these fields; examples must not be copied into the result:

```text
QA_BASE=https://________________________________
VALID_TOKEN=____________________________________
TREE_DEBATE_ID=_________________________________
GENERATING_DEBATE_ID=___________________________
ERROR_DEBATE_ID=________________________________
NO_TREE_DEBATE_ID=______________________________
SINGLE_SHOT_DEBATE_ID=__________________________
```

The exact completed-tree URL is then:

```text
${QA_BASE}/debate/${TREE_DEBATE_ID}
```

Record device model, OS build, browser build, exact URL, orientation/viewport, video path, initial/final tree zoom, page-scale before/after, focal drift, safe-area values, and PASS/FAIL for every row.

### V-1 — iPhone / real iOS Safari

1. On a notched iPhone, open the exact completed-tree URL in Safari in portrait.
2. Tap **Tree**, then **Fit**. Record the visible zoom percentage and center a two-finger pinch over a named card.
3. Pinch outward, then inward. Expected: tree zoom percentage changes within the 10%–200% bounds; the content point beneath the finger midpoint remains approximately beneath that midpoint; the header, Safari page scale, and non-canvas chrome do not zoom.
4. End the gesture. Expected: the tree remains usable, one-finger pan works, and the next card tap is not swallowed by stale gesture ownership.
5. Pinch on page content outside the canvas. Expected: native Safari page pinch remains available; the application does not globally disable page zoom.
6. Repeat in landscape and record a video showing the header, view controls, synthesis tab/sheet, zoom cluster, and unlock dock.
7. Collapse and expand Safari’s dynamic address/tool bars ten times by scrolling, in both orientations. Expected: no repeated vertical jump, no bottom control under the home indicator, no synthesis/dock/zoom overlap, and no unreachable internal scroller.
8. In Safari Web Inspector, run the following in portrait and landscape:

```js
const probe = document.createElement("div");
probe.style.cssText =
  "position:fixed;inset:0;padding:" +
  "env(safe-area-inset-top) env(safe-area-inset-right) " +
  "env(safe-area-inset-bottom) env(safe-area-inset-left);";
document.body.append(probe);
const safeArea = {
  top: getComputedStyle(probe).paddingTop,
  right: getComputedStyle(probe).paddingRight,
  bottom: getComputedStyle(probe).paddingBottom,
  left: getComputedStyle(probe).paddingLeft
};
probe.remove();
safeArea;
```

Expected: relevant notch/home-indicator insets are computed non-zero—normally top/bottom in portrait and side insets in landscape—and visible controls clear those regions.

### V-2 — Android handset / real Chrome

1. Connect the handset with `chrome://inspect`, record device/Android/Chrome versions, and open the exact completed-tree URL.
2. Tap **Tree** and **Fit**; record initial zoom.
3. Pinch outward and inward over a named card. Expected: the PE two-pointer path changes only tree zoom, preserves the midpoint focal location, and leaves page chrome scale unchanged.
4. Lift one finger, continue a one-finger pan, then end. Expected: ownership hands over cleanly; no stuck zoom/pan state and no accidental drawer.
5. Tap the previously pinched card. Expected: below readable zoom it zooms to the card; at 100% the next deliberate tap opens detail.
6. Pinch outside the canvas. Expected: native page zoom remains available where Chrome/platform policy permits.
7. Rotate portrait ↔ landscape twice. Expected: column/overview fit re-evaluates without clipped view buttons, synthesis/dock/zoom overlap, or hidden content.
8. Save a remote-inspector screen recording and console capture containing `data-zoom`, `data-fit-policy`, and `data-gesture-owner` before, during, and after the gesture.

### V-3 — Windows precision touchpad / Chrome, Edge, Firefox

Repeat this entire row separately in current stable Chrome, Edge, and Firefox on a machine with a physical Windows Precision Touchpad:

1. Set browser page zoom to 100% and open the exact completed-tree URL.
2. Tap **Tree** and **1:1**; place the pointer over a named card.
3. Perform a physical two-finger trackpad pinch out and in. Expected: the ctrl+wheel delivery stream changes tree zoom, preserves the focal point under the pointer, and does not resize the page header or change browser page zoom.
4. End the pinch, pan the tree, and tap a card. Expected: no stuck owner, no accidental drawer during the gesture, and normal click behavior afterward.
5. Move the pointer outside the canvas and repeat the platform/browser page-zoom gesture. Expected: native browser behavior outside the canvas remains intact.
6. Record browser/version, video, zoom values, page zoom before/after, and PASS/FAIL. Any one-browser failure remains a mission blocker.

### V-4 — macOS Safari trackpad

1. On current macOS with latest Safari and a physical trackpad, open the exact completed-tree URL at browser page zoom 100%.
2. Tap **Tree** and **1:1**; pinch over a named card.
3. Expected: the Safari `GestureEvent` path changes tree zoom exactly once per gesture update, preserves the focal point, and does not zoom the page chrome.
4. End pinch, pan, and tap the same card. Expected: no stale gesture ownership; zoom-to-card/detail behavior remains correct.
5. Pinch outside the canvas. Expected: native Safari page zoom remains available.
6. Repeat at 844×390 and 568×320. Expected: controls remain clickable and the previously failing automated short-height interactions remain resolved in real Safari; any regression is captured on video and routed to its owning slice.

### V-5 — real desktop Safari rendering

1. In latest desktop Safari, record macOS/Safari versions and open each route at the V-provided QA base: `/`, `/new`, `/settings`, `/admin/workers`, and the completed-tree URL.
2. Use Responsive Design Mode/window sizing for 320, 375, 768, 1024, 1440, 2560, 844×390, 568×320, and 507×1024.
3. On `/`, capture empty, populated, coordinator-error, composer-focus, and submit states.
4. Clear `dialectical:userToken`, then on each protected route capture checking, locked, invalid-token, and submitting. Set the valid token and capture the route-specific loaded/error states.
5. On the debate route capture loading, generating, completed, error, no-tree, and single-shot IDs. Exercise Thread, Split, Tree, Map; scoring closed/open; Fit, column fit, 100%, minimum, maximum, and zoom-to-card.
6. Open argument detail, challenge/investigation, Workspace, scoring diagnostics, guide, synthesis, toast, and expanded unlock dock.
7. Expected at every cell: no document overflow, no hidden selected view, all controls clickable, no mid-word ordinary-English break at 320/375, and no intersection among dock/zoom/toast/synthesis rectangles.
8. Attach full-window screenshots and one interaction video for each short-height cell. Any failure returns to its owning slice; it is not waived by Playwright WebKit.

## Final closure statement

The automated matrix, screenshots, traces, handler contracts, and acquisition blockers are fully recorded. F-01 through F-05 are resolved on the integrated tree and the automated matrix is GREEN at 199/199 applicable cells. H9 mission acceptance is still not complete because all mandatory real pinch/hardware, real Safari/mobile rendering, non-zero safe-area/iOS dynamic-toolbar, and installed-browser agent rows remain BLOCKED-ESCALATED for V action.
