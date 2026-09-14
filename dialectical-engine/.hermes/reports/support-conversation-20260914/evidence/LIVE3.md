# LIVE3 evidence

- Ticket/session: `t_8a5cf2e8` / `/root/preview`
- Exact revision: `43cf9386ea3c9e7c79523ec38debe63271d19292`
- Status: FUNCTIONAL BLOCKER. This node does not claim CP1 readiness, owner acceptance, checkpoint acceptance, or ticket completion.
- Product/Git/index changes: none

## Exact final integration

The one required argv from `LIVE3-required-suites.json` ran once on the clean exact revision. Result: 20/20 test files passed; 776 tests passed and one Forgot-password test remained TODO (777 total); rc 0; duration 78.83 seconds. The command included every one of the 20 declared members. No whole-repository typecheck was repeated because FIX3 already supplied the consumed exact inherited-diagnostic comparison and UI bytes did not change.

## Supported reload and custody

Preflight found prior supervisor PID/PGID `12958`, PPID `1`, healthy with ordinary TLS `/help` status 200, all preview listeners present, and all original listeners present. Its recorded loaded revision was `82f57f1ebaaf59a9ee0ea81d3084c4d57f7557b0`. The owned process group stopped cleanly; preview ports closed and original 8790–8796 listeners remained.

The first detached final-byte launch, PID/PGID `37935`, exited before readiness. A fixed-pattern inspection found exactly one lifecycle category, `DEV_AUTH_STACK_SUPPORT_MODEL_FAILED`; its inner cause is UNKNOWN. No Support matrix request had begun, no preview listener survived, and the private mode-600 runtime log was not copied into evidence or inspected as arbitrary text.

A second unchanged supported launch reached `DEV_AUTH_STACK_READY=https://localhost:3100:RUNNER_REGISTERED`. The live supervisor PID/PGID is `40443`, PPID `1`. Ordinary system TLS `/help` returned 200, preview listeners 3100, 3101 and 8890–8896 were present, and original listeners 8790–8796 remained present. After the browser process exited and a ten-second idle boundary elapsed, the same PID/revision/TLS/listener state remained. The private ongoing runtime log is excluded from immutable hashes because it can grow. The fresh Playwright profile was removed.

## Finite actual matrix

The existing headless Playwright harness used a fresh profile and ordinary TLS against the compiled UI, actual Support API, and unchanged support-preview relay. There were exactly seven prompts, each sent once with no retry:

| # | Surface | Language/topic | Outcome | Sources/actions | Manual result |
|---|---|---|---|---|---|
| 1 | Full | EN creation | `REFUSE_SAFETY` | 0 / 0 | FAIL: no creation guidance |
| 2 | Full | EN Settings | `REFUSE_SAFETY` | 0 / 0 | FAIL: no Settings guidance |
| 3 | Full | EN export | `ANSWER_GROUNDED` | 1 / 0 | PASS |
| 4 | Full | RO creation | `ANSWER_GROUNDED` | 3 / 1 | PASS; accurate prerequisites/limits and visitor creation action |
| 5 | Full | RO Settings | `REFUSE_SAFETY` | 0 / 0 | FAIL: no Settings guidance |
| 6 | Full | RO export | `ANSWER_GROUNDED` | 1 / 0 | PASS |
| 7 | Compact | RO creation | `ANSWER_GROUNDED` | 3 / 1 | FAIL: text exposes internal identifier `start-debate` |

All seven HTTP responses were 200 and all API text/source/action projections exactly matched the rendered DOM. Four were protocol-grounded; three were clean manual passes. The two successful creation answers correctly rendered the guest action label `Pornește o dezbatere` with `/login?next=%2Fnew`; keyboard activation from the compact answer reached `https://localhost:3100/login?next=%2Fnew`. The English pointer action was absent because its answer refused, so pointer activation was not performed. No credentials or recovery operation were submitted.

The visible refusal guidance tells the visitor to choose a human escalation control, but it does not answer CP1-A09 product questions and is not counted as success. The compact Romanian answer's direct mention of `start-debate` violates the explicit no-internal-identifiers content requirement even though its rendered action itself is valid.

The three screenshots show the actual full EN, full RO, and compact RO surfaces without an observed layout break. The receipt, rather than the static screenshot viewport, is the source of truth for exact per-answer text and API/DOM equality.

## Fixed diagnostics and browser console

The runtime-log window was fixed before any matrix request at byte 722 and closed after the seventh request at byte 890. It contains exactly three fixed-enum events: `TEXT_LINK_OR_MARKUP` x1 and `TEXT_CREDENTIAL_OR_SECURITY_ACTION` x2. The count matches the three refusal outcomes. Because the reporter emits no request identifier, exact category-to-prompt attribution is not claimed. No raw rejected completion or arbitrary runtime log line was retained.

The browser reported eleven console errors. The evidence-only classifier counted `HTTP_401` x11, `HTTP_404` x0, `JS_OR_HYDRATION` x0, and `OTHER` x0. A synthetic hostile-string control proved that only the four fixed keys and integer counts serialize; no raw text, URL, header, or value is stored.

## Limitations

The exact Forgot-password destination remains UNKNOWN and was not searched. This is an anonymous benign CP1 demonstration, not a credential test, reset flow, CP3 quality evaluation, owner acceptance, or independent review. Actual token usage is UNAVAILABLE. Earlier LIVE1, separate one-off diagnostic, and LIVE2 outcomes remain distinct historical evidence.
