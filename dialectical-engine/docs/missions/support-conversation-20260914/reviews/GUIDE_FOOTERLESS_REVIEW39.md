# GUIDE_FOOTERLESS_REVIEW39 — footerless screenshot helper review

- Ticket: `t_f0af1892`
- Product revision: `0d34f82f4a2188d0ce1db04655b693798ffd2169`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Date: `2026-09-21`
- Verdict: `PASS_FOOTERLESS_HELPER_CALL_CONTRACT`

## Call contract and identity

The helper accepts footer absence only through an explicit layout object derived from the already validated API and visible projections. `expectedLayoutFromValidatedProjection` first requires API and visible source/action arrays, then requires the visible labels and action label/href pairs to equal the API projection. It returns exact source IDs, action IDs and `footerExpected`. The screenshot helper independently recomputes the same source IDs, action IDs and footer predicate from the API and rejects any mismatch as `GUIDE_CAPTURE_EXPECTED_LAYOUT_INVALID`.

This keeps the two cases closed. If sources or actions are expected but the current article has no footer, capture fails as `GUIDE_CAPTURE_EXPECTED_FOOTER_MISSING`. If the validated projection is empty but a footer is present, capture fails as `GUIDE_CAPTURE_UNEXPECTED_FOOTER_PRESENT`. Empty sources/actions therefore do not turn an unrelated selector error into footerless success.

The existing current-answer boundary is retained before geometry: exactly one selected article, exactly one newly added assistant article, assistant role, exact API/DOM text, source labels and action label/href pairs. The stale-target control selects the previous article and fails with `GUIDE_CAPTURE_SCREENSHOT_TARGET_MISMATCH` before any image. The helper remains unbound; this verdict does not approve incomplete BIND40 or a live invocation.

## Geometry and restoration

Footerless evidence uses `BODY_END`, never `SOURCE_ACTION_FOOTER`. The helper locates the first and last painted text characters inside the current message body. It requires the body start and selected end to be strictly inside the normal pane and painted through hit testing. The footer branch continues to use the retained FIX38 footer reveal and painted-containment rules.

For a contained short answer, the helper preserves scroll position. For the long fixture it moves only forward by the measured below-pane overflow, clamps to the pane's maximum scroll and then requires the body-end character to be contained and painted. The control moved from scrollTop 114 to 949 against a maximum 993; the body-end rectangle y419–433 is wholly inside the pane y154–434. The `finally` block restores the pre-capture pane position and viewport after success or failure. Complete expanded evidence separately releases each real ancestor from clipping, captures the selected article, and restores exact inline styles, ancestor scroll offsets, page scroll and viewport.

## Saved image inspection

I inspected the final2 images at actual size.

- Full and compact Romanian short images paint the whole refusal beginning `Asistența nu poate primi credențiale...` through `...un cod de recuperare.` The start and end images are byte-identical in each contained case. Their expanded images show the same complete text and no footer.
- Full and compact English short images paint the whole refusal beginning `Support cannot receive credentials...` through `...recovery code.` The start and end images are likewise byte-identical, and expanded images contain the whole text.
- The long normal-pane start visibly begins with line 1. Its normal-pane end visibly contains lines 46–60 and the final line 60. The distinct 368×1143 expanded image visibly contains every line 1 through 60.
- The missing-footer negative's start image shows the current grounded body but no required source footer; no end or expanded image is accepted.

All nine controls pass: the old FIX38 footer-only failure is reproduced; four short surface/language positives pass; the long forward reveal passes; missing expected footer fails with safe diagnostic/restoration; stale target fails before capture; and a mismatched source projection is rejected by the call contract. Traffic counters are zero.

## Preserved failed attempts and limits

Both fixture-only failures are retained. The first was an assertion-fixture mistake: Node appended comparison detail to the supplied error message even though the negative correctly rejected. The second was caught by visual QA: the synthetic fixture's `!important` height override prevented expanded evidence from releasing the ancestor, producing a clipped expanded image. The final2 fixture removes that artificial override and the final expanded image visibly contains all 60 lines. Neither failure is relabeled as a product issue.

This is a static review of an offline production-markup/CSS fixture and saved images. It proves the helper and call contract, not a LIVE31 recovery, a BIND40 integration, remaining-case output, current capacity, Forgot destination, CP1 completion or CP2 readiness. Actual row47 remains sufficiently evidenced by its existing complete short image and must not be recaptured.
