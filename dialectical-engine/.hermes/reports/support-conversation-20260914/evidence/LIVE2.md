# LIVE2 integrated and actual-relay evidence

- Ticket/session: `t_48f43282` / `/root/preview`
- Frozen revision: `82f57f1ebaaf59a9ee0ea81d3084c4d57f7557b0`
- Status: FUNCTIONAL BLOCKER REMAINS; CP1 acceptance is not claimed.
- Product and Git/index changes: none.

## Exact post-FIX2 regression frame

The single final argv from `LIVE2-required-suites.json` ran once at the exact frozen revision through the repository capture wrapper. All 20 required files passed: **758 tests passed, 1 acknowledged Forgot-password TODO, duration 80.11 seconds**. No member was excluded and the suite was not repeated. The worktree remained clean.

The UIFIX1 TSX pass and FIX2's repository typecheck output are consumed. Root proved the latter byte-identical to the attributed 76-diagnostic inherited baseline. LIVE2 changed no product byte and did not repeat either check.

## Supported correction reload and custody

The earlier diagnostic supervisor's state was measured before action. PID/PGID `95978`, PPID `1` was present and ordinary TLS `/help` returned 200. This corrects the prior unavailable process inspection; it does not explain why the earlier handoff connection failed. That earlier failure cause remains UNKNOWN.

Supervisor `95978` loaded the pre-correction producer, so LIVE2 sent SIGTERM only to that exact owned supervisor. It exited, all preview listeners 3100, 3101 and 8890-8896 became absent, and all original listeners 8790-8796 remained present. LIVE2 then launched the unchanged supported command `DEBATEAI_DEV_AUTH_STACK_PROFILE=support-preview pnpm dev:auth:up` from exact revision `82f57f1e` through the proven detached launcher.

The new supervisor PID/PGID is `12958`, PPID `1`. Its fixed ready marker appeared, ordinary TLS `/help` returned 200, all preview listeners are active, and all original listeners remain active. A post-browser ten-second idle check observed the same PID, revision, TLS result and listener sets. The preview remains active after the capture process exited.

## Actual compiled UI, Support API and relay matrix

Playwright 1.61.1 and installed Chromium headless-shell 1228 used a fresh temporary profile and ordinary TLS. The actual compiled Next UI called the actual Support API and unchanged relay. No route override, synthetic Support response, retry, credential, account, reset or recovery operation occurred. The temporary browser profile was removed after capture.

Support status returned `200`; two session creations returned `201`; all seven message responses returned `200`. API text, sources and actions matched the rendered DOM in every case. Four responses were `ANSWER_GROUNDED`; three were screened `REFUSE_SAFETY` failures.

| # | Surface | Language | Exact input | Outcome | Sources/actions | Manual result |
|---:|---|---|---|---|---|---|
| 1 | Full `/help` | EN | `How do I create a debate?` | `REFUSE_SAFETY` | 0 / 0 | FAIL |
| 2 | Full `/help` | EN | `What can I change in Settings?` | `REFUSE_SAFETY` | 0 / 0 | FAIL |
| 3 | Full `/help` | EN | `How does JSON export work?` | `ANSWER_GROUNDED` | 2 / 0 | PASS |
| 4 | Full `/help` | RO | `Cum creez o dezbatere?` | `ANSWER_GROUNDED` | 3 / 1 | PASS |
| 5 | Full `/help` | RO | `Ce pot schimba în Setări?` | `REFUSE_SAFETY` | 0 / 0 | FAIL |
| 6 | Full `/help` | RO | `Cum funcționează exportul JSON?` | `ANSWER_GROUNDED` | 2 / 0 | Factual core passes; navigation wording concern below |
| 7 | Compact widget | RO | `Cum creez o dezbatere?` | `ANSWER_GROUNDED` | 3 / 1 | PASS |

Both grounded creation answers state sign-in, a topic longer than six characters, Free fixed controls, Premium configurable controls, `Start run`, and that Support cannot start the debate. They cite the reviewed topic, getting-started and risk-tier sources. The compact action was focused and activated with keyboard Enter, reaching exact first-party destination `https://localhost:3100/login?next=%2Fnew`. The planned English pointer activation was not performed because the rejected English creation response rendered no action; that is a failure rather than a navigation pass.

Both grounded export answers state the served-answer and readable-ledger prerequisites; JSON answer/digest/honesty content; published public JSON; and the unfinished, Markdown and private-owner-data limitations. English cites two reviewed sources and is a clean pass. The Romanian response has the same factual core and sources, but tells the anonymous visitor to use `owner-debate` while the server correctly resolves no action without a trusted owner projection. This raw non-rendered action identifier is preserved as a manual navigation concern, not hidden by the grounded protocol outcome.

The three `REFUSE_SAFETY` responses provide no creation or Settings facts and cannot satisfy CP1-A09. The isolated post-baseline runtime log window contains exactly three fixed-enum diagnostic events: `KEY_SET_INVALID` x1 and `TEXT_CREDENTIAL_OR_SECURITY_ACTION` x2. The event count matches the three rejections, but the diagnostic reporter has no request identifier. Exact category-to-prompt attribution is therefore not claimed. No full server line or rejected model completion was copied or retained.

The browser retained 11 console errors as a count only. Raw console strings were not stored because they can contain request or capability context. All explicitly measured Support calls returned the statuses above; the unclassified console count is not claimed harmless.

The three LIVE2 screenshots were visually inspected. They show the actual compiled full and compact layouts, real visitor-visible responses, and no synthetic Support content. The compact Romanian action remains contained and readable.

## Disposition and limits

FIX2 raised grounded protocol outcomes from LIVE's 1/7 to LIVE2's 4/7. CP1-A09 remains blocked by English creation and both Settings failures, and the Romanian export navigation wording needs review. The exact Forgot-password destination and click remain UNKNOWN/UNVERIFIED and were not searched again. No CP3 quality, rate or latency claim is made. Actual model token/cost usage is UNAVAILABLE.
