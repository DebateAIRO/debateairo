# REV3 pass 3 — product truth and working preview

**Verdict: BLOCKED.** The independently reviewable product-truth portion of exact revision `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d` passes the finite final oracle, but the named scope includes the still-unknown existing Forgot-password destination. CP1-A05 therefore remains unverified and CP1 cannot be accepted or presented as ready. This is not a request for a fourth implementation/review loop.

## Product-truth result

The final actual run used the compiled UI, actual anonymous Support API, and unchanged support-preview relay at runtime revision `606b2eabea1dc9212159e53c193cf69655424e77`. It sent the seven canonical questions once. Runtime/config/content are byte-identical between that revision and the review revision; `5cbfc6d4` changes only the degraded test fixture.

| # | Surface | Question | Origin | Product disposition |
|---:|---|---|---|---|
| 1 | Full EN | Create a debate | accepted model draft | **PASS:** sign-in, topic length, Free/Premium controls, immutable submitted selections, three reviewed sources, canonical guest action |
| 2 | Full EN | Settings | exact reviewed fallback | **PASS:** sessions, consent, legacy claim and erasure are present; email/password/MFA/routing controls are correctly excluded; one reviewed source |
| 3 | Full EN | JSON export | accepted model draft | **PASS:** conditional owner/public JSON, served-answer/ledger prerequisites, private-data and Markdown limits, two reviewed sources |
| 4 | Full RO | Create a debate | accepted model draft | **PASS:** Romanian prerequisites and limits, three reviewed sources, canonical guest action |
| 5 | Full RO | Settings | accepted model draft | **PASS with N1:** current controls and exclusions are accurate; one visible spelling error does not change meaning |
| 6 | Full RO | JSON export | accepted model draft | **PASS:** Romanian conditional JSON guidance and limitations, two reviewed sources |
| 7 | Compact RO | Create a debate | accepted model draft | **PASS:** same useful Romanian contract in compact mode, three sources and canonical guest action |

All seven responses were HTTP 200 `ANSWER_GROUNDED`. The API text, source labels, and actions equal the rendered DOM for 7/7 rows. None of the narrative answers contains a canonical source/action/capability ID, catalog route, repository path, or invented control. API source objects retain reviewed IDs as the contract permits; the interface renders visitor labels only. Six rows are accepted drafts. The English Settings row is the exact admitted fallback selected after one rejected completion. That row proves deterministic server recovery and does not prove model-quality improvement.

English pointer activation and compact Romanian keyboard focus plus Enter both reached `https://localhost:3100/login?next=%2Fnew`. The action was server-resolved and first party; no credential, reset, account, or external operation occurred. This disposes the previous English-pointer gap.

## Rendered evidence

The full English and Romanian captures retain the approved help-desk shell, disclosure, language control, source/action affordances, human escalation, details and shortcuts. The compact Romanian capture retains the approved overlaid assistant and readable conversation on the narrow surface. The PNGs do not independently show every overflowed conversation row: the structured receipt supplies the exact per-message DOM/API comparison, and the navigation receipt supplies focus/activation results.

The prior signed-in UI evidence remains synthetic conditioning evidence only. The final correction did not change `Assistant.tsx`, navigation, or catalog bytes, and the fresh synthetic check exercised both signed-in context values in both languages and both UI modes. It does not prove real ownership or private-data authorization.

The saved console classifier records HTTP 401 ×15, HTTP 404 ×0, JavaScript/hydration ×0, and other ×0. It does not identify every 401 origin or establish harmlessness. Ordinary TLS was used without bypass; the post-browser receipt records TLS 200, exact runtime revision, a clean product tree, expected preview/original listeners, browser exit, profile removal, and a ten-second idle boundary.

## Fresh reviewer check

After a single heavy-lease grant, the reviewer ran the named synthetic render selection through `run-capture.sh` in the detached exact-revision checkout:

```text
Test Files  1 passed (1)
Tests  6 passed | 48 skipped (54)
```

The six selected cases covered EN/RO source/action rendering in full and compact modes, literal text rendering, and forged session-storage decorations as a discriminating negative control. The run used two temporary dependency symlinks to the clean primary lane at the same exact revision. Before and after, that lane was clean at `5cbfc6d4`; `Assistant.tsx`, `navigation.ts`, and `catalog.ts` remained at SHA-256 `80a26625…`, `d55c80d9…`, and `be0c28d2…`. The symlinks were removed. This was a synthetic component substrate, not an actual browser, HTTP, Support, preview, or model request.

## Numbered findings

### B1 — exact Forgot-password destination remains unavailable

`SPEC-v3.md:30-31,63` requires the owner-confirmed existing destination before resolver and full/compact pointer/keyboard evidence can pass. The mission still supplies no canonical URL or reviewed opener. Wrong input → wrong outcome remains falsifiable: any Forgot-password phrase must currently produce no action because guessing a route or substituting Settings, MFA, or human escalation is prohibited. **Owner decision/input required:** supply the exact existing URL/path or opener; no product change is authorized from this report alone.

### N1 — one actual Romanian Settings draft has a spelling error

`LIVE_P2-actual-relay-receipt.json:323,334` renders `lucruuri` instead of `lucruri`. The sentence remains understandable and the enumerated Settings controls match the product, so the row still satisfies usefulness and factual accuracy. Route this to later Romanian copy/model-quality work; do not retry the saved sample or weaken the response screen.

### N2 — frozen owner walkthrough has stale unconditional-refusal wording

`DONE.md:27` says every malformed and credential/reset completion must yield `REFUSE_SAFETY`. Governing `SPEC-v3.md:46-47,64-65` and `CP1-REVIEWED-RECOVERY.md:19-23` allow an exact admitted reviewed fallback for ordinary knowledge work after a rejected draft, while absence/invalidity still refuses. The current runtime follows the governing documents. The owner has identified the walkthrough correction; this report does not request a runtime reversion.

## Assigned finding dispositions

- **LIVE_GUIDANCE `t_8596ccbc`: recommend RESOLVED.** The previous 3/7 product failure is replaced by one finite, non-retried 7/7 useful and accurate actual matrix. Six answers are accepted drafts and one is exact reviewed recovery; that mechanism distinction is retained.
- **LIVE2_ACTION_ID `t_67a569fe`: recommend RESOLVED.** All seven visible texts and labels avoid internal action/source/capability IDs. Both creation actions resolve to the canonical guest destination through pointer/keyboard evidence. Prior exact-ID/alias controls remain retained.
- **SOURCE_CUSTODY `t_e582c85f`: retain UNVERIFIED as a disclosed provenance limitation.** Current source HEAD/index/full-index custody and 56 tracked paths are stable in the retained forward window. No current-Git abbreviation width 4–40 reproduces the intake default-diff hash. Because intake lacks raw diff bytes, Git/config inputs, full-index hash, complete per-file hashes and untracked inventory, historical byte state, cause, actor, and exact time remain unproved. This report makes no source restoration or authorship inference.
- **DEST `t_979fe293`: remains BLOCKED.** The existing Forgot-password URL/opener is unknown, was not searched again, and no substitute was invented. It independently blocks CP1-A05 and checkpoint readiness.

Root alone changes finding status. Prior closed product findings remain closed: invalid Help shortcuts were absent, the cookie opener and canonical privacy destination remain the stable reviewed implementation, and the current correction did not modify those UI paths.

## Documentation precedence

The reviewed recovery behavior at `apps/api/src/support/answer.ts:335-358` is consistent with `SPEC-v3`, which supersedes DONE step 9's unconditional-refusal wording. The exact 36-row recovery component file SHA-256 is `5ee8d592c3f1b3550c1f2af74c030fbbc12e80e258dc71b57aa28de045f99e8a`; the manifest binds all 36 rows to separate reviewer session `01a09ef7-e096-7c31-9b35-806840028cf0`, date `2026-09-15`, with blank owner-ratification fields. This is a mechanical integration check of the prior editorial verdict, not a self-approval of that verdict.

## Custody and evidence limits

- Lens inputs: 79/79 exact SHA-256 matches.
- Product inventory: 108/108 exact SHA-256 matches; detached checkout clean at `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`.
- Final correction: 24 paths from `e0dcfe77...`; runtime evidence remains explicitly at `606b2eab...`; only one test fixture changes afterward.
- Actual receipt: `329ffbc286471e8b0cfe960c935e2099e40b6164d9bf3e950f55b579e039fbc1`.
- Fresh synthetic log: `45493a3bbba624ec8be0bbcab38e10b20a29424af153336f814b1ca94d11f3dc` (7,512 bytes).
- Source review was bounded to the supplied provenance artifacts. No new source forensic investigation occurred.
- No new real Support/model/preview request, visible browser, service change, account/reset operation, product/source/Git/index/ref change, dependency install, external message, or other pass-three verdict was performed.
- Actual model-token usage is **UNAVAILABLE**.

## PREDICTIONS

Without reading the other current lens verdicts, I predict the correctness lens will treat the `5cbfc6d4` change as a fixture repair and keep the 606b runtime result separately attributed; a claim of a new whole-suite PASS would be falsified by the preserved 977/1/1 run. I predict the security lens will retain bounded-class limits while finding no new visible alias/action-ID leak in the seven saved replies; a contrary result should point to a concrete current sink input rather than infer from the safe action href. Neither lens can remove the owner-input dependency for Forgot password, and any full-CP1 PASS before that destination is supplied would contradict CP1-A05.
