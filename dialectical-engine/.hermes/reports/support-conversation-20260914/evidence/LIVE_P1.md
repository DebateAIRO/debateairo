# LIVE_P1 evidence

- Ticket/session: `t_6dda2423` / `/root/preview`
- Exact revision: `e0dcfe77f49655bea774bdfacf988b911be4ff06`
- Status: FUNCTIONAL BLOCKER. This node does not claim CP1 PASS, checkpoint readiness, owner acceptance, independent review, or ticket completion.
- Product/Git/index changes: none

## Exact final integration

The one required argv from `LIVE_P1-required-suites.json` ran once on the exact revision. Result: 23/23 test files passed; 935 tests passed and one existing Forgot-password test remained TODO (936 total); rc 0; duration 79.78 seconds. No whole typecheck was repeated because FIX_P1 supplied the consumed exact 76-diagnostic baseline comparison and no product bytes changed in this node.

## Diagnostic consumer before traffic

Before any actual Support request, the current consumer passed twelve controls and emitted exactly seven producer keys: `attemptId`, `code`, `predicate`, `hasSources`, `hasActions`, `sourceCount`, and `actionCount`. It accepts one unique valid known-enum record with a v4 UUID, provides a fixed no-event result, drops hostile extra fields and arbitrary values, and marks invalid UUIDs, unknown codes, unknown predicates, malformed records, multiple records, duplicate identities, unmatched events, and missing/delayed rejection events `AMBIGUOUS`. No model call was used for these controls.

Every actual request was sequential and awaited, with an immediate before/after runtime-log byte cursor. Four response windows contained exactly one unique valid event each; three accepted response windows contained no rejection event; no window was ambiguous. The retained records contain only the seven permitted fields. They support exact predicate attribution, but do not identify a discarded token, disclose a rejected draft, or prove a semantic false positive.

## Supported reload and custody

Preflight measured the prior detached supervisor PID/PGID `91461`, PPID `1`, serving revision `6e5ab5fc41acebbff4264efc7d481df3db8dce44` with ordinary TLS 200 and all preview/original listeners. The exact owned process group stopped through the supported lifecycle; preview ports closed and original listeners remained.

The first final launch reached readiness. The active supervisor is PID/PGID `45639`, PPID `1`, bound to revision `e0dcfe77f49655bea774bdfacf988b911be4ff06`. Ordinary TLS `/help` returned 200. After browser exit and a ten-second idle boundary, the same supervisor, preview ports 3100, 3101 and 8890–8896, and original ports 8790–8796 remained present. The fresh browser profile was removed. The mode-600 active runtime log is excluded from immutable hashes because it may grow.

## Finite actual matrix

The actual compiled UI, Support API, and unchanged support-preview relay received exactly seven canonical prompts once each, with no retry:

| # | Surface | Language/topic | Outcome | Sources/actions | Diagnostic | Manual result |
|---|---|---|---|---|---|---|
| 1 | Full | EN creation | `REFUSE_SAFETY` | 0 / 0 | `SUPPORT_DRAFT_TEXT_LINK_OR_MARKUP` / `PATH_OR_ROUTE`, uniquely attributed | FAIL: no useful creation guidance; pointer UNVERIFIED |
| 2 | Full | EN Settings | `REFUSE_SAFETY` | 0 / 0 | `SUPPORT_DRAFT_TEXT_LINK_OR_MARKUP` / `PATH_OR_ROUTE`, uniquely attributed | FAIL: no useful Settings guidance |
| 3 | Full | EN export | `ANSWER_GROUNDED` | 1 / 0 | no event | PASS |
| 4 | Full | RO creation | `REFUSE_SAFETY` | 0 / 0 | `SUPPORT_DRAFT_TEXT_LINK_OR_MARKUP` / `PATH_OR_ROUTE`, uniquely attributed | FAIL: no useful creation guidance |
| 5 | Full | RO Settings | `REFUSE_SAFETY` | 0 / 0 | `SUPPORT_DRAFT_TEXT_CREDENTIAL_OR_SECURITY_ACTION` / `CREDENTIAL_OPERATION`, uniquely attributed | FAIL: no useful Settings guidance |
| 6 | Full | RO export | `ANSWER_GROUNDED` | 2 / 0 | no event | PASS |
| 7 | Compact | RO creation | `ANSWER_GROUNDED` | 3 / 1 | no event | PASS |

All seven responses were HTTP 200. API text, source labels, and actions exactly matched the DOM. Three answers were accepted grounded outcomes and three were manually useful and accurate. Their narratives did not expose selected internal source/action IDs. Four refusals keep CP1 blocked.

The compact Romanian creation answer rendered `Pornește o dezbatere` at `/login?next=%2Fnew`; keyboard focus and Enter reached `https://localhost:3100/login?next=%2Fnew`. English pointer activation is UNVERIFIED because its refusal rendered no action. No credential or recovery operation occurred.

The installed Playwright 1.61.1 headless Chromium used a fresh profile and no TLS bypass. Inspection of `LIVE_P1-full-en.png`, `LIVE_P1-full-ro.png`, and `LIVE_P1-compact-ro.png` found no observed clipping, broken layout, or hydration failure. The full English capture visibly records both refusals and the working export answer; the Romanian captures record the corresponding full state and accepted compact state. Static screenshots are not a substitute for the complete seven-response receipt.

## Console and manual verification

The browser emitted eleven console errors: fixed in-memory counts are HTTP 401 x11, HTTP 404 x0, JavaScript/hydration x0, and other x0. No raw console text, URL, header, or arbitrary value was retained. Their origin and harmlessness are not established.

Later manual verification can use the still-running supported preview:

1. Open `https://localhost:3100/help` with ordinary system trust; do not use a TLS bypass.
2. Use a fresh anonymous session and switch the Help language control between English and Romanian.
3. Ask each canonical question once: English creation, Settings, export; Romanian creation, Settings, export; then Romanian creation in compact mode.
4. Treat creation and Settings as currently blocked where the assistant returns the human-escalation refusal. Do not retry them to obtain favorable output.
5. Check that accepted export/compact answers show the same text, source labels, and actions as the API receipt.
6. On the compact Romanian creation answer, keyboard-focus `Pornește o dezbatere` and press Enter; the expected guest destination is `/login?next=%2Fnew`. Do not enter credentials.

The exact Forgot-password destination remains UNKNOWN and was not searched. The source-custody gap remains unresolved. This is an anonymous benign CP1 check, not CP3 quality evaluation, owner acceptance, checkpoint readiness, or final pass-2 review. Historical LIVE through LIVE4 evidence remains separate and is not combined with this run.
