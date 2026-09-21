# GUIDE_CAPTURE_REVIEW38 — footer correction and final capture binding

- Ticket: `t_06b937dc`
- Product revision: `0d34f82f4a2188d0ce1db04655b693798ffd2169`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Date: `2026-09-21`
- Verdict: `PASS_FINAL_FOOTER_CAPTURE_BINDING`

## Footer correction

FIX38 resolves the exact DIAG38 defect without changing product code or CSS.

The old helper control truthfully reproduces its backward movement: an already-contained footer moves from `scrollTop` 480 to 437. The corrected helper first measures the current footer. If it is already contained, it assigns delta zero and preserves the position. Otherwise it computes only positive bottom overflow, adds a one-pixel inside margin, clamps to the available forward range, waits two animation frames and then remeasures.

The corrected four-turn Romanian row23 fixture reports `PRESERVED_ALREADY_CONTAINED`, with prior/assigned `scrollTop` 480, requested delta zero, `footerPainted: true`, and equal top/footer image hashes. Visual inspection confirms that both original-pane images show the current export answer and its exact source labels, `Exportă o dezbatere ca JSON` and `Cum citești o dezbatere`, fully painted. The separate expanded image contains the complete current answer and the same footer without clipping.

The positive reveal control starts with a genuinely below-pane footer and moves forward from 104 to 352 by a requested 248 pixels. Its final footer is inside the pane with roughly one pixel of bottom margin, passes the paint hit-test, and is visibly present with both source labels in the saved image. The helper preserves strict rectangular containment and also requires a nonzero visible, non-hidden, nontransparent footer whose center resolves to the footer or a descendant. It does not add a permissive clipping tolerance.

The impossible control deliberately places the footer partly outside the pane horizontally. It rejects with `GUIDE_CAPTURE_ORIGINAL_PANE_FOOTER_UNREACHABLE`. Its exclusive-created failure record contains full floating-point before/top/pre-footer/post-footer geometry, pane sizes, scroll assignment, current identity and artifact-creation state. It observes pane and viewport restoration after the exception. A previous-target control and a source-label mutation both reject in `PRE_CAPTURE_IDENTITY` before geometry or screenshot creation.

The current helper writes failure records with `wx` and mode `0600`, normalizes only the closed `GUIDE_CAPTURE_*` token from browser-wrapped errors, and preserves the original exception. The capture call supplies a unique per-row failure path. Its `finally` restores the original pane position, waits for settled layout and records the observed pane and viewport result. Expanded capture keeps its separate ancestor-style, scroll and viewport restoration mechanism.

## Saved fixture and attempts

The fixture uses the exact saved API text, source IDs/labels and actions for Romanian rows2,15,19,23. Its DOM structure matches the relevant production `Assistant.tsx` message, shell, core, paragraph, citation list and action navigation structure, while the stylesheet bytes come from the exact product `globals.css` prefix containing those rules. The product `Assistant.tsx`, CSS and saved receipt hashes are recorded. All requests are aborted and the final proof records zero forwarded Support, external, status, capacity, database or model traffic.

Four fixture-only failed attempts remain disclosed:

1. the first fixture did not actually place the footer below the pane;
2. the second reached the unchanged fractional top-edge guard before the footer discriminator;
3. the third exposed only Playwright error wrapping and led to closed-token normalization;
4. the fourth completed all six controls but its console summary referenced a removed local name.

The final proof is a separate six-of-six result under fresh `final4` artifact names. These failures do not describe product behavior and have not been hidden or relabeled as first-pass success.

## Final binding

The final command contract SHA is `ff16afdb6f2a5bbc227818df0629c6817213d42595b8fa8814c1670bd2edf659`. All seven phase argv arrays name that exact contract. The reusable operator SHA is `6687c835aa82f204838132e14921aeb528f6759c8091bf19ed564def1e84df84`; it embeds the command digest once. The operator contract SHA is `677854cec802e1587374fecfa89b8a7aee713d43d6deeabaa4a9b177a1682217`.

The capture phase imports the corrected helper SHA `ae2dd69f15486cdd4cc0e31eb3321227a79b02c340d34d930ece6cea5589f771` through capture implementation SHA `e8f317572c8f528fe7410e6fd7c2337508e0ed53a1e987aa1af180df1e28b30c`. Preflight covers every complete/top/footer/failure output for the exact 31 sequences. The operator enumerates 154 unique future paths, including row-proof result, owner paths, profile, phase outputs/logs, operator outputs/logs, actual receipt and all screenshot/failure artifacts; all 154 are absent. Stale and current embedded-digest controls exercise the real non-inert boundary.

The fresh namespaces are `LIVE31` and `GUIDE23`. Fixed31, five sessions, 14 EN / 17 RO, maximum 27 model calls, 31-second pacing and the fresh58 gate dependency remain unchanged. The inherited exact cwd, `node --import tsx` operator invocation, `require_escalated` context, log ownership, PROCESS_BIND37 readiness/idle/process validator, RECOVER34 schema/owner contract and Support-principal parser remain byte-bound; their behavior was not reaudited here.

## Limits and retained evidence

The missing LIVE30 post-scroll geometry remains unavailable and is not reconstructed. LIVE30's five partial rows remain failed-attempt evidence and do not carry into a fresh31. `2026-09-21T09:51:12.590Z` is planning input, not capacity proof. Runtime9 postfailure custody, actual31, current capacity and owner availability remain unproved.

Completed product, logical58, process, schema, operator and unaffected FIX30 screenshot dispositions are retained where unchanged. Forgot remains unresolved; this is not CP1 readiness, completion or acceptance, and it makes no CP2 claim. No heavy, runtime, browser, HTTP, status, capacity, database, Support, model, private-log, product, KB or Git action occurred in this review.
