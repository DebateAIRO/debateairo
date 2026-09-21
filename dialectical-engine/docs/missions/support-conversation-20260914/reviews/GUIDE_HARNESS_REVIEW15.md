# GUIDE_HARNESS_REVIEW15 — full-mode hydration boundary review

- Ticket: `t_27166180`; run `197`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Reviewed on: `2026-09-20T15:58:19.160845Z`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Freeze: `352f6df621e301edc6d2c8098dfc1e51cbd129fc`
- Verdict: **PASS_BOUNDED_HYDRATION_GATE**

## Observed failure and cause

The single diagnostic supports a harness pre-hydration cause for PROBE3's first full-EN transition. Before the click, the actual mode toggle was visible, enabled and the center hit target, public mode was TERRACOTTA, producer transition state was IDLE, and the React click handler was absent. Playwright's click returned; the immediate observation still showed TERRACOTTA/IDLE with the handler absent. The first expected-state wait then timed out. At the later failure checkpoint the same control's handler was present.

This sequence distinguishes an early browser click from a working producer interaction. The BIND14 full path called its public readiness interaction without the compact path's handler-hydration precondition. No second favorable sample was taken. The optional cookie discriminator did not run because the click itself returned and the toggle was a valid hit target; cookie obstruction is unsupported. The diagnostic's own `DIAGNOSIS_INCONCLUSIVE` label concerns that cookie hypothesis. Its fixed observations plus the reviewed BIND14 call order establish the narrower harness cause.

The evidence does not establish a general product defect or explain historical LIVE7. It establishes why this exact PROBE3 full-mode handshake did not change public state.

## Minimal correction against the producer

Both actual consumers now resolve `.supportDesk [data-mode-toggle]`, wait for that exact element's React click handler, and only then call the shared `proveGuideFullReadiness`. Handler presence is an internal precondition; the proof still requires the public `aria-pressed` mode change, a stable restore, the requested active language, one visible composer and unchanged `/help` surface state.

The restore wait is tied to actual producer semantics. Current `modeTransition.ts` ignores clicks while its document is in `activeTransitions`. Its view-transition path sets `data-theme-transition="active"` until `transition.finished`; its fallback path holds `theme-transition-fallback` for the producer timer. BIND15 requires both the expected public `aria-pressed` state and absence of both active markers before issuing the restore click. Reduced-motion synchronous commits also satisfy the same predicate. No forced click, retry, arbitrary delay or timeout extension was added.

The capture and probe use byte-equivalent hydration and mode-idle logic. The capture delta otherwise changes only the BIND15 output namespace. Its five session groups, explicit storage resets, compact one-click path and language boundaries are unchanged. Same-locale full readiness performs no language action and retains the reviewed nonempty-session/seven-message state; actual language changes remain at planned group boundaries.

## Failure attribution and controls

The shared helper now distinguishes seven post-hydration stages:

1. first mode activation;
2. first expected-state wait;
3. restore activation;
4. restore stable-state wait;
5. language activation;
6. language expected-state wait;
7. final public verification.

Each stage has a closed `GUIDE_HARNESS_*` code, and the new phase control injects a failure at each boundary. Failure of the handler precondition remains the existing fixed `GUIDE_HARNESS_FULL_HYDRATION_TIMEOUT` from `openGuideSupportSurface`; it cannot collapse into a language or restore error.

The integration control is meaningful for the observed omission: it requires the exact hydration call to precede `proveGuideFullReadiness` in both actual consumers, requires both producer-idle markers in each mode wait, and binds the reviewed product source that ignores active-transition clicks. The retained compact-hydration controls continue to validate the helper itself. Removing the full call, moving it after proof, or omitting either idle marker fails the new control.

The first three final-control attempts are preserved. They failed copied BIND14 bookkeeping assumptions: retained count 120 instead of 127, old proof-name slicing, then static-bound count 123 instead of 126. They did not fail behavior assertions. The corrected fourth frame produced 130/130 with the prior 127 names as an exact prefix and these three additions:

- `full readiness reports the exact failed interaction phase`;
- `full adapters gate the first click on hydration and each restore on transition idle`;
- `documented PROBE4 argv passes the extracted guard and stale forms reject`.

The independently recomputed ordered-eight digest is `b6162d665b60a1a35d882e41fa5b0da3259e9cb86bae32ca5d5056d320ad99d4`. Matrix54 remains `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`; the pre-request verifier remains `d5d6656431f93e3089c9c6751ae767b401d21f23bb90d398fa99a051af0ead39`. Adapter negatives remain 3/3 with zero importer calls and zero successful rows. FINAL9, suite34, source/outcome/action/API-DOM, privacy/credential, pacing, capacity, navigation and exact blocked Support-route dispositions are retained.

## PROBE4 execution contract

Exact command from the product checkout:

```sh
node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND15/probe-zero-request-ui.mjs 152eed4da1cd3e66b74d8301159ba76427552409 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE4.json > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_UI_TRANSITION_PROBE4-LIVE8.log 2>&1
```

The probe consumes the shared exported argument guard. Independent inert extraction accepted the exact revision/output pair and rejected the old PROBE2 name, wrong root, extra argument and malformed revision: 5/5. The README, probe contract and output-absence record agree on script, cwd, output and direct log. The pinned browser executable exists. The unique output and log are absent.

All 106 REVIEW15 indexed inputs matched their frozen hashes and byte counts. The BIND15 author receipt contains 39 artifacts and its author input list contains 82 files. All 57 future GUIDE15/probe/profile paths were absent.

## Limits

BIND15's diagnostic is not an independent five-transition proof. PROBE4 remains unexecuted and must pass before any full 54-row operation. No new browser, runtime, HTTP, DB, Support/model, status, capacity, product, KB, Git or harness action ran in this review. No synthetic response or private data was used. Forgot remains unresolved and actionless; CP1 is incomplete and CP2 remains gated. No testability, readiness or acceptance is claimed.
