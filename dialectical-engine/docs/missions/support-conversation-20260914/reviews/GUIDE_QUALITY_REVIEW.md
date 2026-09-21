# GUIDE_QUALITY_REVIEW — intermediate quality correction

## Result

- Ticket: `t_62335359`
- Reviewer: `/root/baseline`
- Native session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Parent thread: `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- Reviewed on: `2026-09-20T18:58:31Z`
- Base: `152eed4da1cd3e66b74d8301159ba76427552409`
- Intermediate revision: `6cbe0e7ad18b20eca35876f4a91478cfbba82307`
- Verdict: **REWORK_CODE_DRAFT_EDITORIAL_PASS**

The four EN/RO scoring and human-case knowledge records pass independent draft editorial review by exact article, model-projection and fallback hashes. The runtime correction does not pass: its navigation validator is detached from the canonical action/source catalog and its case/email predicate rejects ordinary safe separation prose. Mechanical editorial attestation may reuse the four exact reviewed record hashes after the runtime correction; this review does not publish them or validate a final corpus.

## Blocking code findings

### GQR-R1 — canonical action and source bindings

`apps/api/src/support/response-policy.ts:46-54` defines a parallel eight-item destination table. Three IDs do not exist in `SUPPORT_ACTION_IDS`:

| Phrase | Intermediate ID | Canonical ID |
|---|---|---|
| Home / Acasă / library | `home-library` | `home` (or `public-catalog` for an explicitly public catalog) |
| Create account / registration | `register` | `sign-up` |
| Help / Centrul de ajutor | `help-desk` | `help` |

The unit positive at `tests/unit/support-response-policy.test.ts:56-63` passes the invented `home-library` string directly to the helper. The actual structured boundary accepts only canonical action references, so this test cannot prove a usable positive path. A valid actual-service draft that cites `app-navigation` and includes the request-local `home` action is rejected because the validator demands `home-library`.

The same check requires `app-navigation` for every navigation commitment. That is also wrong for canonical actions whose reviewed source is `settings-help-menus`, `account-access`, `support-status-limits`, `guide-how-it-works`, or `view-public-debate`. For example, “Support can guide you to Active sessions” with `settings-help-menus` plus `active-sessions`, and “Support can guide you to Sign in” with `account-access` plus `sign-in`, are valid closed guidance but are rejected.

The complete closed-action census is:

| Canonical action | Reviewed source binding | Intermediate validator |
|---|---|---|
| `home` | `app-navigation` | wrong ID `home-library` |
| `start-debate` | `app-navigation`, `getting-started-debate` | omitted |
| `sign-in` | `account-access` | ID correct, source rule wrong |
| `sign-up` | `account-access` | wrong ID `register` |
| `help` | `app-navigation` | wrong ID `help-desk` |
| `support-status` | `support-status-limits` | omitted |
| `method` | `app-navigation` | omitted |
| `sample-transcript` | `app-navigation` | omitted |
| `settings` | `settings-help-menus` | ID correct, source rule wrong |
| `active-sessions` | `settings-help-menus` | ID correct, source rule wrong |
| `privacy-preferences` | `settings-help-menus` | ID correct, source rule wrong |
| `claim-legacy` | `settings-help-menus` | omitted |
| `delete-account` | `settings-help-menus` | ID correct, source rule wrong |
| `public-catalog` | `app-navigation` | omitted; generic library is misclassified |
| `your-debates` | `app-navigation` | omitted |
| `owner-debate` | `guide-how-it-works` | omitted; trusted context only |
| `public-debate` | `view-public-debate` | omitted; trusted reference only |
| `forgot-password` | `account-access` | intentionally absent; unresolved and must remain actionless |

The correction should derive canonical IDs, labels, source bindings and applicability from `SUPPORT_ACTION_CATALOG` and `SUPPORT_GUIDE_LABELS`, rather than maintain another partial map. Every promised destination must have the exact request-local action and an admitted reviewed source binding. Owner/public debate actions still require validated context; Forgot remains unresolved and actionless.

Required actual-service positives include canonical `home` in EN/RO, `active-sessions` from `settings-help-menus` in EN/RO, and `sign-in` plus `sign-up` from `account-access` in EN/RO. Negatives must reject a missing source, missing requested/draft action, invented IDs, and invalid trusted/unresolved destinations.

### GQR-R2 — safe case/email separation

`conflatesCaseAndEmail` splits on sentence punctuation and semicolon but not comma. These truthful sentences are rejected because each retained clause contains an email term, a case term and a creation verb, without a literal negation:

- EN: `Escalation creates the human case, while support email is a separate mail workflow.`
- RO: `Escaladarea creează cazul uman, iar emailul este un flux separat.`

The current tests use a semicolon, which avoids the predicate rather than proving the semantic boundary. The corrected detector must accept the two safe sentences while rejecting these:

- EN: `Email support creates the human case and receives its private case link.`
- RO: `Emailul de asistență creează cazul uman și primește legătura privată.`

The regression must pass through `createSupportAnswerService`, after opaque-reference translation, in both languages.

## Passing code dispositions

- Opaque model references are translated before the new authority binder.
- The exact old Romanian Account draft gains the already supplied `settings-help-menus` citation; it rejects if that source was absent.
- The exact old unsupported destination sentence and exact old case/email conflation are rejected through the actual answer service and recover from reviewed fallback.
- Existing credential, private-data and injection screens still precede the new binder. The change neither adds actions nor exposes model/internal references.
- The Help pane follows appended messages only when the reader is already near the bottom. A reader who scrolls to older content is not pulled back. Compact Help, keyboard controls and consent code are unchanged.

The product append behavior and screenshot evidence remain separate. This revision improves product following, but a final capture still must bring the exact article into view and prove it is the screenshot’s corresponding answer.

## Draft editorial dispositions

All four changed records pass as draft knowledge:

| Record | Article SHA-256 | Projection SHA-256 | Fallback SHA-256 | Disposition |
|---|---|---|---|---|
| `debate-workspace-menus/en` | `e3f92be13a7d880e259c331e2c5dc3881abd9693e1846b90fcddafeda151170d` | `d4da3f54b348b1c78dad80b67cbe1db12d196f396e6385c2dc0d2fd0ef5d0f34` | `28525e3135cc7b623a00f52d7f9aa520579959f4238bb51117866ad3ba89bcce` | PASS |
| `debate-workspace-menus/ro` | `eb2b85327509e4e9e0e4b29009af11b109e225f70e784b09f447d17ed7aa162a` | `095fe2fae248ca61c4b7e99100ab4bc4343d0ab7e525576bf747baa79d6816c8` | `5e558ff25dda284435df41eca3e9de5f6b1f940f95cb0b8a3126801bba415e97` | PASS |
| `support-cases/en` | `300f6b63a1798ee15ba335538bdc9eb0e1c5dca11c770ce11f5e11edee9cee9e` | `151e25db30e1cf75b5e6a3f0b6efb1137ad005b3e0fa6514ed23eb14bcbbb546` | `df37d0f11029ff345c6f303c425bdeb36435ab0a51e0dbddf22ffd0877ca49a1` | PASS |
| `support-cases/ro` | `4073ca95886bd56063c9f6ff49b959e3affa5c5a0a9000b6ecf6ff2171535977` | `195b0d8634d1a110e239ee8a89d6a4df0d88c8425ad2d97a5a5e94485d6da57a` | `62bbe76506089edca69ffca3d820f7ebd9610f831cf6a3b007efe00125cb971f` | PASS |

The scoring records accurately enumerate public categories and availability limits without claiming access to private values. The case records correctly separate Talk/Escalate case creation from email and preserve the 48-hour server receipt, conflicting one-working-day panel and private link boundary. EN/RO parity and fallbacks pass.

“This API case / acest caz API” is accurate but unnecessarily internal public wording. Prefer “the case in this app / cazul din această aplicație.” This is a nonblocking editorial recommendation for the exact reviewed bytes above. If changed before publication, the new projection hashes require a narrow readback disposition; the articles and fallbacks do not need another review.

The only authorized mechanical publication paths are `packages/support-kb/recovery/components.json` and `packages/support-kb/reviews/manifest.json`, binding these four exact record hashes, this native reviewer session/date/evidence, and blank owner fields. The knowledge-dispositions artifact retains the other 40 recovery components by their exact article/projection/fallback hashes.

## Verification boundary and live applicability

Author evidence records 246/246 focused tests and 1/1 draft-content test. The corpus transition is 34 passed and 2 failed. Both failures are the expected `SUPPORT_KB_RECOVERY_COMPONENT_INVALID` transition: changed articles are not yet admitted by matching component/review metadata. This proves neither a final 44-entry snapshot nor a structural-evaluation pass. Typecheck remains the byte-identical inherited 76 diagnostics with zero introduced diagnostics.

Rows 2, 15, 35 and 39 are invalidated. Rows 19 and 23 consume the changed scoring projection. Rows 27 and 31 execute the new binder. After code correction, exact editorial attestation and final KB digest, these eight rows require fixed actual behavior coverage. Rows 1, 7 and 11 retain unchanged model inputs; deterministic rows 41, 43, 47 and 51 retain unchanged behavior-defining code. They remain useful historical/content and static defining-byte evidence, but no old row is relabeled as executed at the final revision. All 15 screenshots require corrected visual capture.

Final verification must create the 44-entry snapshot and new KB digest, then run the structural evaluation and affected composed suites. The prior 15-retained/39-fresh plan stays suspended until this code rework and attestation are complete.

## Evidence and limits

- Knowledge dispositions: `.hermes/reports/support-conversation-20260914/evidence/GUIDE_QUALITY_REVIEW-knowledge-dispositions.json`
- Code dispositions and full action census: `.hermes/reports/support-conversation-20260914/evidence/GUIDE_QUALITY_REVIEW-code-dispositions.json`
- Static custody: `.hermes/reports/support-conversation-20260914/evidence/GUIDE_QUALITY_REVIEW-custody.json`

All 65 indexed inputs matched exact hashes and byte counts; the intermediate checkout was clean. No new test, browser, runtime, HTTP, Support/model, capacity, DB, Git, product/KB or private-data action occurred. Inherited 76 type errors, the PENDING evaluation rubric, initial source-custody gap, immutable failed runs and lost failure bytes remain qualified. Forgot is unresolved/actionless, CP2 remains gated, and this review makes no readiness or acceptance claim.
