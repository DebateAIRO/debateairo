# GUIDE_CAPTURE_REVIEW29 self-report

- Node: `GUIDE_CAPTURE_REVIEW29`
- Ticket: `t_91c29a7f`
- Native reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Date: `2026-09-21`
- Revision: `456cafb9e56a737de550570b5736ec52d79ddf48`
- Verdict: `REWORK_BOUNDED_COMPLETE_FULL_CAPTURE`
- Heavy lease: not held

SKILLS LOADED: retained `superpowers:executing-plans`, `superpowers:systematic-debugging`, and `superpowers:verification-before-completion` BODY instructions from the existing native reviewer session; no floor reload for this node, as directed.

The LIVE28 mismatch is a harness identity error, not a product defect. The API returned source id `app-navigation` with label `Navigate Dialectical Engine`; the public component renders the label. FIX29 correctly compares visible labels with API labels and retains the count, index, role, text, action and current-projection guards. Four cases plus twelve stale/previous/wrong-index negatives support that correction. The short-footer equal-scroll change is also safe because it waives forward movement only when the footer was already contained.

One bounded evidence defect remains. The sealed `full-ro-long-complete.png` (SHA `488f827b…`, 779x416) visibly clips at the full-root boundary. Its lower region is blank and its source/action footer is absent, despite `completeAnswerExpandedCapture:true`. The separate footer-pane image proves the footer exists. The helper expands only `.supportChatScroll`, while real `.supportDesk` is fixed-height with `overflow:hidden`; the fixture reproduces the same ancestor clipping class. PNG existence does not prove full content paint.

The minimum correction is to save, remove and restore the required full-mode ancestor clipping state, then add an old-fails control proving the complete image itself paints both the target top and source/action footer. Keep the source-label correction, stale/current guards, contained-short rule, separate pane evidence and all successor namespaces unchanged. No product change is justified.

Fresh binding otherwise passes: seven exact phase self paths, command SHA `6d1d5a7d…`, operator SHA `b8e1069f…`, 31 fixed rows, 93 GUIDE22 screenshot paths and 123 unique future paths. The natural `NOT_BEFORE` is a valid upper-bound-plus-3605-second calculation and remains planning-only.

Custody passes: manifest 30/30, receipt 31/31 and indexed inputs 182/182. The product checkout is clean. No runtime, new browser run, HTTP, status, capacity, database, Support, model, product, Git or KB action occurred.

Self-report question verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

The repeated cost came from treating “PNG was written” as equivalent to “the evidence is complete.” A one-prompt evidence generator should pair every semantic claim with a machine-checkable invariant: target identity must bind the rendered label, and complete capture must prove both ends survive every clipping ancestor. Representative images should be inspected across each distinct layout class, not only the cases most likely to pass.

Usage: unavailable; no token budget exposed.
