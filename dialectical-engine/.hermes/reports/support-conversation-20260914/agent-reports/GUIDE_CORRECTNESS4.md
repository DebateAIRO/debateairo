# GUIDE_CORRECTNESS4 self-report

## Assignment and result

- Node/ticket/session: `GUIDE_CORRECTNESS4` / `t_fd9b3fd1` / `/root/plan_review`
- Revision: clean detached reviewer and frozen primary `c8784902f78ed4ba1d637d122e1f32f598415f4e`
- Delta base: retained correctness PASS `91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69`
- Verdict: **REWORK for navigation and single-label fact admission**
- Product work: none
- Heavy lease: released immediately after the two approved commands and cleanup

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Murder-case reconstruction

The correction successfully removes actions inherited only from a shared article. Pricing, Theme, workspace controls, Export, and the human-case distinction all remain actionless. The remaining defect comes from replacing an overly broad coupling with another manually maintained vocabulary.

The product already has two closed authorities: the action catalog and the 52-item menu inventory. The new code introduces a third list, `ACTION_QUERY_TERMS`. Several real labels are absent from that list, and action evidence is evaluated only after the capability has already survived separate lexical ranking. This causes exact labels such as New debate, Account, Your debates, and Privacy to lose their intended action or receive a broader parent link. The Romanian single-label `Fir` control also shows that a reviewed prose item can still fail to retrieve any facts unless multiple aliases appear together.

The authored tests pass because their 40-row action matrix largely repeats the new phrase table. The independent controls instead use frozen UI and action labels, which is the actual product boundary the owner asked Support to explain.

## What to upgrade

Generate action evidence from the catalog and frozen menu inventory. Each safe action-bearing label should map to its action and reviewed article in both languages. Treat that evidence as an input to capability admission, then intersect it with the production resolver so unresolved, context-bound, or unavailable actions still cannot escape. Prefer a named child anchor over its parent when both match.

Generate the positive and negative matrices from the same inventory. For every included item, check its exact EN/RO label plus one bounded natural wrapper such as “Where is …?”. Safe-static rows require their specific action; prose-only rows require useful facts and no action; unresolved and excluded rows require no action. This would have made the current correction fail before composition and would reduce repeated hand-written test tables.

The one-prompt workflow should provide a machine-readable inventory-derived oracle to the author and reviewer. The reviewer should only add a small set of relation or ambiguity controls, rather than reconstructing which labels are authoritative across three files.

## Evidence and limits

- Custody: `51/51` indexed inputs and `143/143` product files per lane matched; exact three-path delta; both lanes clean.
- Changed units: `2/2` files, `149/149`, rc `0`.
- Independent discriminator: 28 rows, 14 row failures and 18 assertion failures, rc `1`. Thirteen of sixteen supported-action rows miss or misdirect the action; four of those also lack sources. All twelve prose-only rows are actionless; one lacks useful facts.
- Retained author evidence: exact33 `1,633` passed plus one TODO; 76-diagnostic typecheck baseline byte-identical with zero mission additions; frozen inert harness `62/62`; structural `3 × 60/60` retained with rubric `PENDING`.
- Prior GUIDE_CORRECTNESS3 guard PASS is retained because none of its seven paths changed.
- Five temporary links absent; heavy released before packaging.
- No full33/typecheck/harness/eval rerun, real HTTP/model/browser/DOM/preview traffic, Forgot resolution, readiness, or acceptance claim.
- Usage: **UNAVAILABLE**. User alone accepts CP1.

## Skills loaded

Retained same-session actual-body reads: `using-superpowers`, `heartbeat-protocol`, `receiving-code-review`, `heartbeat-worker`, `test-driven-development`, `systematic-debugging`, and `verification-before-completion`. No new skill body was read for this continuation.
