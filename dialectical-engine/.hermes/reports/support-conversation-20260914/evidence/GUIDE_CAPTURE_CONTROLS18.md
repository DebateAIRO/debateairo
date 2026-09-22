# GUIDE_CAPTURE_CONTROLS18 evidence

Verdict: `PASS_CAPTURE_AND_INVOCATION_CONTROLS` at assigned intermediate revision `6cbe0e7ad18b20eca35876f4a91478cfbba82307`.

The four prepared controls passed 4/4. They proved stale screenshot evidence rejection, visible target acceptance, seven-phase absolute invocation acceptance, and rejection of the relative capacity-helper mistake before the injected spawn. The injected spawn was an inert discriminator; no operational helper ran.

The original long-reply fixture first exposed a real evidence defect. Its exact-article PNG reported `720x798`, but the nested 240px overflow pane rendered the lower image region blank. The footer-only color change therefore produced the same PNG hash; the top-only change produced a different hash. PNG dimensions and article geometry had overstated completeness.

The successor keeps two claims separate:

- Original-pane evidence uses the unchanged 240px scroll pane. It captures the answer top at pane `scrollTop=14` and the source/action footer at `scrollTop=544`, proving both are reachable in the user's actual nested-pane presentation.
- Complete-answer evidence temporarily expands only the synthetic fixture pane and labels the result `evidence_only_expanded_pane`. The resulting `720x798` exact-article PNG includes the top marker, answer body, source list and Help action. Independent top-only and footer-only mutations both change its pixels. This expanded presentation proves capture completeness, not the product's actual layout.

The successful fixture used only local `page.setContent`, installed a Support API abort guard, and recorded `supportAttempts=0`. The fixture awaited browser close. A later read-only process check found neither the known failed child PID nor a matching Playwright Chromium child.

Preserved failures:

1. Attempt 1 stopped before browser launch because the new screenshot parent directory did not exist.
2. Attempt 2 stopped before page creation because macOS denied Chromium launch inside the sandbox.
3. Attempt 3 ran outside the sandbox and failed the footer pixel-influence assertion, establishing ancestor-overflow clipping.
4. Attempt 4 ran the minimal successor and passed.

No runtime lifecycle, app-page navigation, HTTP, status, capacity, database, Support or model traffic occurred. Product and Git bytes were untouched. The final 151-control binding, final product/KB attestation, supported owned reload for the final KB, actual capture, CP1 acceptance, and Forgot destination remain pending.
