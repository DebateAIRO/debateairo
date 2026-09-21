# GUIDE_CORRECTNESS4 — navigation-admission correctness review

**Reviewer:** Sol (`/root/plan_review`)  
**Ticket:** `t_fd9b3fd1`  
**Revision:** `c8784902f78ed4ba1d637d122e1f32f598415f4e`  
**Delta base:** `91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69`  
**Verdict:** **REWORK for the finite three-path correction**

## Dispositions

- **The sealed Pricing defect is resolved.** EN `How does Pricing work?` and RO `Cum funcționează Prețuri?` both retain useful reviewed sources and return no action. All 12 prose-only controls remain actionless, so shared article relevance no longer attaches the unrelated `help`, `support-status`, or `home` links seen in the sealed first LIVE failure.
- **B1 — blocking: exact closed-catalog navigation labels are not reliable action evidence.** `ACTION_QUERY_TERMS` at `packages/support-kb/src/context.ts:65-86` is a second manual vocabulary that omits several action and frozen-menu labels. Lines `275-313` evaluate action evidence only inside already matched capabilities, and lines `316-321` admit only candidates with a positive manual phrase score. Consequently, exact reviewed labels are dropped or misdirected:
  - `New debate` / `Dezbatere nouă` produce no source and no `start-debate` action.
  - `Account` / `Cont` produce reviewed sources but no `settings` action.
  - `Your debates` / `Dezbaterile tale` produce no source and no `your-debates` action even though those exact terms exist in `ACTION_QUERY_TERMS`; the containing capability never reaches action scoring.
  - EN `Public debates` produces no `public-catalog` action while the RO exact label passes, exposing language-asymmetric admission.
  - `Privacy` / `Confidențialitate` returns the broader `settings` action instead of the requested `privacy-preferences` anchor.
  - The closed action labels `How it works` and `Sample debate` and their Romanian labels return no corresponding action.
- **B2 — blocking, pre-existing source-ranking gap exposed by the assigned positive neighbor:** RO `Ce arată vizualizarea Fir?` remains actionless as required but returns no reviewed source. The source-ranking code is unchanged by this delta, so this was not introduced by ACTION_COMPOSE. It still violates the frozen item-level contract that each included menu item has useful natural free-text guidance. The broader authored multi-label query passes because several aliases jointly cross the manual evidence threshold; the single exact menu label does not.
- **Prior GUIDE_CORRECTNESS3 guard PASS is retained.** None of its seven guarded paths changed in this three-path delta; no guard matrix was rerun or relabeled.

## Independent 28-row discriminator

The probe used the exact reviewed production corpus and production `resolveSupportActions` availability. It checked 16 supported-navigation rows and 12 prose-only rows in EN/RO. Result: rc `1`; 14/28 rows failed at least one requirement, producing 18 assertion failures. Thirteen of sixteen action rows missed or misdirected the expected action; four of those also lacked a source. All twelve prose rows were actionless, while one lacked useful facts.

| # | Family | Lang | Query | Expected action | Observed source/action | Result |
|---:|---|:---:|---|---|---|:---:|
| 1 | Home | EN | Where is Home? | `home` | sources present / `home` | PASS |
| 2 | Home | RO | Unde este Acasă? | `home` | sources present / `home` | PASS |
| 3 | New debate | EN | Where is New debate? | `start-debate` | no source / no action | FAIL |
| 4 | New debate | RO | Unde este Dezbatere nouă? | `start-debate` | no source / no action | FAIL |
| 5 | Account | EN | Open the Account page. | `settings` | sources present / no action | FAIL |
| 6 | Account | RO | Deschide pagina Cont. | `settings` | sources present / no action | FAIL |
| 7 | Method action label | EN | Where is How it works? | `method` | sources present / no action | FAIL |
| 8 | Method action label | RO | Unde este Cum funcționează? | `method` | sources present / no action | FAIL |
| 9 | Transcript action label | EN | Which link opens the Sample debate? | `sample-transcript` | sources present / no action | FAIL |
| 10 | Transcript action label | RO | Ce link deschide Exemplu de dezbatere? | `sample-transcript` | sources present / no action | FAIL |
| 11 | Public debates | EN | Where is the Public debates tab? | `public-catalog` | sources present / no action | FAIL |
| 12 | Public debates | RO | Unde este fila Dezbateri publice? | `public-catalog` | sources present / `public-catalog` | PASS |
| 13 | Your debates | EN | Where can I find Your debates? | `your-debates` | no source / no action | FAIL |
| 14 | Your debates | RO | Unde găsesc Dezbaterile tale? | `your-debates` | no source / no action | FAIL |
| 15 | Privacy | EN | Where is Privacy in Settings? | `privacy-preferences` | sources present / `settings` | FAIL |
| 16 | Privacy | RO | Unde este Confidențialitate în Setări? | `privacy-preferences` | sources present / `settings` | FAIL |
| 17–18 | Pricing placeholder | EN/RO | Pricing operation questions | none | sources present / none | PASS |
| 19–20 | Theme local control | EN/RO | Theme operation questions | none | sources present / none | PASS |
| 21 | Thread local control | EN | What does the Thread view show? | none | sources present / none | PASS |
| 22 | Thread local control | RO | Ce arată vizualizarea Fir? | none | no source / none | FAIL |
| 23–24 | Replay private context | EN/RO | Replay operation questions | none | sources present / none | PASS |
| 25–26 | Export private context | EN/RO | Export operation questions | none | sources present / none | PASS |
| 27–28 | Human-case distinction | EN/RO | Public guide versus human case | none | sources present / none | PASS |

## Smallest correction contract

Use the frozen action catalog and menu inventory as the closed source of action-label evidence instead of maintaining a partial `ACTION_QUERY_TERMS` table. Query-specific action evidence must be able to admit its containing capability, then intersect with the production availability resolver. When a query names a specific safe anchor such as Privacy, the specific anchor must outrank its broader Settings parent. This remains a closed-catalog correction; it does not authorize guessed synonyms or routes.

For source selection, bind every included frozen menu label to its reviewed article before lexical ranking. A single exact included label must retrieve useful facts without needing a second alias. Preserve the current actionless result for prose-only, private-context, existing-workflow, unresolved, and excluded items.

## Verification and custody

- Input custody passed: `51/51` indexed inputs, `143/143` product files in each lane, and exactly the three declared delta paths. Detached and frozen primary lanes were clean and exact at the reviewed revision.
- Changed units passed: `2/2` files, `149/149` tests, rc `0`.
- ACTION_COMPOSE author evidence at this exact revision reports the 33-file union at `1,633` passed plus one TODO, typecheck rc `1` with the exact 76-diagnostic baseline and zero mission-added diagnostics, and frozen inert harness `62/62`. Structural `3 × 60/60` is retained from the prior code revision with rubric `PENDING`; it is not relabeled as a current independent measurement.
- All five temporary links are absent; both product lanes remain clean and exact. The heavy lease was released before packaging.

## Limits

No full 33-file union, typecheck, harness, structural rubric, actual HTTP/model/provider traffic, browser/DOM, or preview lifecycle was run here. The Forgot-password destination remains unresolved and actionless. This verdict does not claim readiness, live answer quality, checkpoint acceptance, or owner acceptance.
