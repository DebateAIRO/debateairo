# LIVE_P1 author self-report

- Ticket/session: `t_6dda2423` / `/root/preview`
- Exact revision: `e0dcfe77f49655bea774bdfacf988b911be4ff06`
- Product/Git/index edits: none
- Usage: UNAVAILABLE
- Skills loaded in this author session: `using-superpowers`, repository `heartbeat-protocol`, repository `heartbeat-worker`, `verification-before-completion`, and `systematic-debugging`.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Verdict

LIVE_P1 does not establish CP1 functional readiness. The exact 23-file integration passed 935 tests with one existing Forgot-password TODO, but the unchanged seven-question actual-relay matrix produced only three grounded, manually useful answers. Four benign canonical questions refused: full English creation, full English Settings, full Romanian creation, and full Romanian Settings. All seven requests were made exactly once and preserved; no answer was retried or combined with an earlier attempt.

The strict-seven diagnostic consumer was proven before actual traffic. It uniquely attributes the three creation/English-Settings refusals to `SUPPORT_DRAFT_TEXT_LINK_OR_MARKUP` with predicate `PATH_OR_ROUTE`, and the Romanian Settings refusal to `SUPPORT_DRAFT_TEXT_CREDENTIAL_OR_SECURITY_ACTION` with predicate `CREDENTIAL_OPERATION`. This identifies the rejecting predicates and does not reveal or prove the discarded completion text, matched token, or a semantic false positive.

## Exact finite result

| # | Surface | Question | Outcome | Sources/actions | Diagnostic | Manual result |
|---|---|---|---|---|---|---|
| 1 | Full EN | Creation | `REFUSE_SAFETY` | 0 / 0 | link-or-markup / path-or-route | FAIL; pointer action UNVERIFIED |
| 2 | Full EN | Settings | `REFUSE_SAFETY` | 0 / 0 | link-or-markup / path-or-route | FAIL |
| 3 | Full EN | Export | `ANSWER_GROUNDED` | 1 / 0 | no event | PASS |
| 4 | Full RO | Creation | `REFUSE_SAFETY` | 0 / 0 | link-or-markup / path-or-route | FAIL |
| 5 | Full RO | Settings | `REFUSE_SAFETY` | 0 / 0 | credential-or-security-action / credential-operation | FAIL |
| 6 | Full RO | Export | `ANSWER_GROUNDED` | 2 / 0 | no event | PASS |
| 7 | Compact RO | Creation | `ANSWER_GROUNDED` | 3 / 1 | no event | PASS |

All responses were HTTP 200. API text, source labels, and actions matched the rendered DOM for all seven. The three accepted answers were useful and accurate on manual inspection, and their narrative text did not expose their selected internal source or action IDs. The compact Romanian action was keyboard-activated and reached `/login?next=%2Fnew`. The English pointer activation remains UNVERIFIED because its response supplied no action.

## Evidence and verification

The exact required suite argv ran once: 23/23 files passed, 935 tests passed and one Forgot-password test remained TODO (936 total), rc 0, duration 79.78 seconds. No whole typecheck was repeated because FIX_P1 supplied the consumed exact 76-diagnostic baseline comparison and no product bytes changed in LIVE_P1.

Before the seven requests, the current consumer passed twelve controls. It emits only `attemptId`, `code`, `predicate`, `hasSources`, `hasActions`, `sourceCount`, and `actionCount`; accepts one unique valid v4 UUID event; provides a fixed zero-event outcome; drops hostile extras; and marks invalid UUID, unknown enum, malformed, multiple, duplicate, unmatched, and missing/delayed rejection records ambiguous. Actual traffic yielded four uniquely attributed windows, three zero-event accepted windows, and no ambiguous window. No raw runtime line, rejected draft, URL, header, capability, content identifier, or arbitrary string was retained.

The installed Playwright 1.61.1 headless Chromium used a fresh profile and ordinary TLS with no bypass. Screenshot inspection found the full English, full Romanian, and compact Romanian layouts rendered without an observed clipping or hydration failure. The console classifier retained only fixed counts: HTTP 401 x11, HTTP 404 x0, JavaScript/hydration x0, other x0. The evidence does not establish the 401 origins or harmlessness.

## What repeatedly cost tokens and time

Deterministic suites continue to pass while real model output trips a different closed response-policy predicate. This makes another prompt-adjustment and seven-request sampling loop an expensive way to seek stability: LIVE_P1 alone spent 79.78 seconds on the integrated suite, then seven real calls to discover four refusals. The fixed diagnostic projection reduced the investigation surface without retaining sensitive content, but it cannot tell which exact generated token caused each rejection.

The process was more efficient when it used one exact suite union, one pre-request consumer proof, one finite real matrix, and a machine-readable receipt. Future packets should keep this shape. A deterministic generation or post-generation contract should prevent unsafe path-like, credential-like, or identifier-like narrative material while retaining legitimate first-party actions in their dedicated arrays. That architecture decision must preserve the hard policy and should be verified with deterministic boundary fixtures before another finite real matrix.

## Custody and limits

The prior supervisor PID/PGID `91461`, serving revision `6e5ab5fc41acebbff4264efc7d481df3db8dce44`, was measured and stopped through the supported owned lifecycle. The first final launch succeeded. The current detached supervisor is PID/PGID `45639`, PPID `1`, serving exact revision `e0dcfe77f49655bea774bdfacf988b911be4ff06`. Ordinary TLS `/help` returns 200 after browser exit and a ten-second idle boundary; preview listeners 3100, 3101 and 8890–8896 and original listeners 8790–8796 remain present. The fresh browser profile was removed, and the mode-600 live log is excluded from immutable hashing because it may grow.

The exact Forgot-password destination remains UNKNOWN and was not searched. The source-custody gap from prior review remains unresolved. This is not CP3 evaluation, owner acceptance, checkpoint readiness, or final independent pass-2 review.
