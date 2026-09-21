# GUIDE_HARNESS_BIND15 — full-view hydration boundary correction

## Result

- Ticket/session: `t_c4eec212` / `/root/preview`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Verdict: `PASS_BOUNDED_HYDRATION_GATE`
- Controls: 130/130, retaining all 127 reviewed BIND14 purposes and adding three bounded regressions
- Ordered-eight digest: `b6162d665b60a1a35d882e41fa5b0da3259e9cb86bae32ca5d5056d320ad99d4`
- Matrix: unchanged 54 rows; adapter negatives 3/3, importer calls 0, successful rows 0

## Observed step and established cause

The single authorized fresh full-English opening preserved the exact first failure. The mode toggle was visible, enabled, and the hit-test target, but its React click handler was not hydrated. Playwright dispatched the click, public mode remained TERRACOTTA and transition state remained IDLE, then the first expected-state wait timed out. At the later failure checkpoint the handler existed. The cookie hypothesis was unsupported and no optional discriminator action ran.

The full adapter called `proveGuideFullReadiness` without the compact adapter's click-handler hydration wait. This is the harness cause. The producer also ignores clicks while a document mode transition is active, so waiting only for changed `aria-pressed` could dispatch the restore too early.

## Correction

Both capture and zero-request probe now wait for the exact full mode toggle handler before the first public click. Their mode wait requires both the expected public `aria-pressed` state and an idle producer transition before the restore click. The readiness helper reports distinct closed failures for first activation, first expected-state wait, restore activation, restore wait, language activation, language wait, and final verification.

Support conversation state remains untouched by same-locale readiness. Language changes still occur only at planned locale boundaries. The five capture groups, session reset plan, compact one-click contract, pacing, capacity, privacy, source/action/outcome/API-DOM rules, matrix54, FINAL9, and exact34 suite binding are unchanged.

The exact PROBE4 argv passes the extracted executable guard. Old PROBE2 basename, wrong output root, extra argument, and malformed revision all reject without a browser. Future GUIDE15 receipt/screens and PROBE4 output/log are absent.

## Verification history

The first three control frames were preserved. Each exposed copied BIND14 bookkeeping assumptions in the new final-control wrapper: previous proof count 120 instead of 127, old base-proof name slicing, then old static-bound base count 123 instead of 126. No behavior assertion failed. The corrected fourth frame passed 130/130 and 3/3 adapter negatives.

The diagnostic guard blocked one status attempt and one page-case-list read; every Support request was aborted before runtime. Create-session, send-message, other-Support, and forwarded Support counts were zero. Postdiagnostic runtime custody and ordinary TLS remained healthy. No product, Git, service, capacity, database, chat, or model change occurred.

## Next gate

Separate REVIEW15 must assess this correction. Only then may a separately authorized PROBE4 run the documented five-transition zero-request argv. This node makes no operational probe success, testability, readiness, acceptance, or checkpoint claim.
