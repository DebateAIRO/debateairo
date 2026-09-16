# LIVE_P2 evidence

- Ticket/session: `t_f60b27a3` / `/root/preview`
- Exact revision: `606b2eabea1dc9212159e53c193cf69655424e77`
- Status: BLOCKED BY FINAL INTEGRATION. This node does not claim CP1 PASS, checkpoint readiness, owner acceptance, independent review, or ticket completion.
- Product/Git/index changes: none

## Attested adapter boundary

All sixteen indexed LIVE_P2 inputs matched their expected SHA-256 bytes before work. The final adapter loaded the attested 36-entry Support snapshot with KB version `d674533e89d145bf9203248e2e324b451e57a2f1d3f257614d31678b7ac379df`, component SHA-256 `5ee8d592c3f1b3550c1f2af74c030fbbc12e80e258dc71b57aa28de045f99e8a`, selecting-review SHA-256 `867d7a75d1918b1d3c7d796bda9d7a83d03028d367f5a3c04c30a018bd75b77f`, and ATTEST receipt SHA-256 `cfdaf33e1fc4e5e303d00764be509829e6631e36a60aece79813b6fb42163de2`.

The adapter's final inert run completed before traffic at `2026-09-15T20:32:12+0300`. It passed the 27 frozen HARNESS_P2 consumer controls plus 27 LIVE_P2 snapshot/pin controls. The exact log is `LIVE_P2-adapter-green3.log`, SHA-256 `a5638ebcbe5a2cc5edcb7ef3c2212eba2cf65b33341de3b6df86e0d2a8f94691`.

The deterministic pre-request pins were:

| # | Language/topic | Source | Reviewed-fallback SHA-256 |
|---|---|---|---|
| 1 | EN creation | `getting-started-debate` | `c844161c3430edcfb0a195df7ffff6bcf82c0826ab454bf817631933649bed48` |
| 2 | EN Settings | `account-settings` | `6d99d7eeb445525b3bf3cf55f4283ee24fec536ff4f9ccc3a3b1f928904091bf` |
| 3 | EN export | `guide-how-it-works` | `c1ed3a89b00d46ac7f1710280ef768f9d66adec20d20aaa18815596e6a5c2265` |
| 4 | RO creation | `getting-started-debate` | `ef982f6420391eeaaf23c475afb230fcee91afc2183c4b945403283802d09e8a` |
| 5 | RO Settings | `account-settings` | `1b7be7bebd1932a4630bea3df60d016218ecedca1ef538ac14510ef66d5f2aad` |
| 6 | RO export | `guide-how-it-works` | `cb344a791adc4616c177c993b4f186595725f6ea3de8b1f95fcd8a6f0ff07ed8` |
| 7 | Compact RO creation | `getting-started-debate` | `ef982f6420391eeaaf23c475afb230fcee91afc2183c4b945403283802d09e8a` |

Preserved adapter attempts distinguish evidence from correction: the sandbox RED stopped at `tsx` IPC `EPERM`; the normal RED reached the intended missing-module failure; the first GREEN exposed an incorrect 64-character validator applied to the 40-character Git revision; and the second GREEN exposed a guessed export source that disagreed with production deterministic ranking. The final adapter imports the actual ranking interface and passes all 54 controls. These are harness corrections only.

## Exact final integration

The exact argv in `LIVE_P2-required-suites.json` ran once on the exact product revision. Result: one of 25 files failed; 24 passed. One of 979 tests failed; 977 passed and one Forgot-password test remained TODO. Duration was 79.82 seconds.

The sole failure was:

- `tests/integration/support-degraded.test.ts > SUP-06 automatic degraded state > treats a screened model draft as successful relay transport`
- Expected: `REFUSE_SAFETY` with usage `{ input_tokens: 3, output_tokens: 4, cost_usd: 0.001 }`
- Received: `NO_SOURCE`

The exact immutable log is `LIVE_P2-integrated-suite.log`, SHA-256 `b8901466de0fc1059b420565a2082c31e6b1bb818c08ce6854a6e74745aa39e7`. It was not rerun and no product or test repair was attempted. The mismatch is a final-suite blocker; this evidence does not establish its production cause. No whole typecheck was run.

## Pre-traffic session-version correction

The first browser harness sent zero Support requests and stopped before the first prompt with `LIVE_P2_RUNTIME_SESSION_VERSION_UNAVAILABLE`. It incorrectly expected a top-level `kb_version` during initial hydration. The compiled client creates a session lazily on the first send, and the public create-session contract returns the version at `session.kb_version`. The original receipt remains at `LIVE_P2-pretraffic-session-gate-failure.json`; the original error log remains at `LIVE_P2-actual-relay-browser.log`.

The corrected evidence-only gate observes `session.kb_version` from the actual create-session response. It lets the unchanged compiled client create its own session, then holds the following message request until the observed version exactly equals the adapter's attested version. It does not seed session storage, derive a version from returned answer/source content, alter a request, or override an API response.

Ten inert correct-shape, nested-shape, malformed-shape, mismatch, and timeout controls passed at `2026-09-15T20:45:51+0300`, before the first prompt. `LIVE_P2-session-gate-green.log` has SHA-256 `1e717a4f5a8f6e45936a7864d9b2dd5e75dfcf8014dac9136bd754aa41b85227`. Both actual browser sessions later reported the exact attested KB version.

An earlier command used an obsolete browser-wrapper path and exited before launching a browser. The installed repository wrapper `.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh` was then used. This missing-path command and the pre-traffic session-gate failure did not consume any of the seven prompts.

## Finite actual matrix

The actual compiled UI, Support API, and unchanged support-preview relay received each canonical question exactly once after the controls passed:

| # | Surface | Language/topic | Outcome | Sources/actions | Diagnostic origin | API/DOM | Manual result |
|---|---|---|---|---|---|---|---|
| 1 | Full | EN creation | `ANSWER_GROUNDED` | 3 / 1 | accepted draft; zero rejection event | exact | PASS |
| 2 | Full | EN Settings | `ANSWER_GROUNDED` | 1 / 0 | reviewed fallback; `SUPPORT_DRAFT_TEXT_CREDENTIAL_OR_SECURITY_ACTION` / `CREDENTIAL_OPERATION` | exact | PASS |
| 3 | Full | EN export | `ANSWER_GROUNDED` | 2 / 0 | accepted draft; zero rejection event | exact | PASS |
| 4 | Full | RO creation | `ANSWER_GROUNDED` | 3 / 1 | accepted draft; zero rejection event | exact | PASS |
| 5 | Full | RO Settings | `ANSWER_GROUNDED` | 1 / 0 | accepted draft; zero rejection event | exact | PASS; minor typo `lucruuri` |
| 6 | Full | RO export | `ANSWER_GROUNDED` | 2 / 0 | accepted draft; zero rejection event | exact | PASS |
| 7 | Compact | RO creation | `ANSWER_GROUNDED` | 3 / 1 | accepted draft; zero rejection event | exact | PASS |

All seven responses were HTTP 200. Six were accepted drafts; one was an exactly attributed reviewed recovery. No diagnostic window was ambiguous. The retained producer record contains only `attemptId`, `code`, `predicate`, `hasSources`, `hasActions`, `sourceCount`, and `actionCount`. The evidence identifies a fixed predicate and cannot establish the discarded text, the exact matched token, or a semantic false positive.

Each reply was useful and consistent with its cited guidance on manual inspection. None of the narrative texts contained a returned internal source or action ID. The full English creation action was activated by pointer and reached `https://localhost:3100/login?next=%2Fnew`. The compact Romanian creation action received keyboard focus, was activated by Enter, and reached the same canonical guest destination. No credentials, recovery flow, or external operation occurred.

The immutable browser log is `LIVE_P2-actual-relay-browser2.log`, SHA-256 `9c0289420534065f14349919161d47e23e3fb4c1d0726744a05d4d79feb05fa9`. The complete structured receipt is `LIVE_P2-actual-relay-receipt.json`, SHA-256 `329ffbc286471e8b0cfe960c935e2099e40b6164d9bf3e950f55b579e039fbc1`.

## Screenshot and console inspection

- `LIVE_P2-full-en.png`: 1440×1000, SHA-256 `dee551e215e935afdc1399b7b91ff3538a56ec032e665b5e2714931a46e8f6b8`
- `LIVE_P2-full-ro.png`: 1440×1000, SHA-256 `a242f6efa77d984dbb7ad74cabcc250e1ef04b6161a1746313f8f3e19c2af136`
- `LIVE_P2-compact-ro.png`: 390×5732, SHA-256 `96ec16b70a466b23b8d80d4324eb5c510ab0fb99bca3f550a19cca64f7212947`

Inspection found readable full and compact responses and controls with no observed clipping, broken layout, or hydration failure. The compact image includes the full landing page behind the open assistant and is correspondingly long. These images establish rendered states, not independent answer-quality evaluation.

The fixed console classifier retained HTTP 401 ×15, HTTP 404 ×0, JavaScript/hydration ×0, and other ×0. It retained no raw console text, URL, header, capability, or arbitrary value. The 401 origins and harmlessness are not established.

## Supported lifecycle and custody

Preflight found the prior supported supervisor PID/PGID `45639`, PPID `1`, still alive on the preceding product revision. Ordinary TLS `/help` returned 200 and all expected preview/original listeners were present. The initial preflight log ended rc 2 only because an `awk` output formatter was invalid after those checks; the separate listener preflight completed rc 0. The exact owned group stopped through the supported lifecycle, preview ports closed, and original services remained present.

The first final launch reached readiness on the exact revision. The active detached supervisor is PID/PGID `86341`, PPID `1`. After browser exit and a ten-second idle boundary, the product worktree remained clean at exact revision `606b2eabea1dc9212159e53c193cf69655424e77`; ordinary system TLS returned 200 for `https://localhost:3100/help` without `-k` or a custom CA; preview listeners 3100, 3101 and 8890–8896 and original listeners 8790–8796 each remained present; and the fresh browser profile was absent.

The first custody verifier passed those assertions and wrote its receipt but exited nonzero while printing because its local variable named `process` shadowed Node's global. The preserved `LIVE_P2-idle-custody-pre-output-fix.json` and `LIVE_P2-idle-custody.log` capture that evidence-only fault. Renaming the binding yielded the final rc-0 `LIVE_P2-idle-custody.json`; its SHA-256 is `ea7b2675a90577609c46444fc24fe20308b07c3b62d48543f76e1ea9945dea33`. The active mode-0600 stack log may grow and is excluded from immutable hashing.

The manifest verifier also exposed one packaging-only self-reference mistake: redirecting verifier output into a log already listed in the manifest truncated that file during verification and correctly failed its hash. That failed log is retained. The final verification wrote only to the command channel and passed all 45 immutable artifacts against exact product custody.

## Manual follow-up

1. Open `https://localhost:3100/help` using ordinary system trust and a fresh anonymous session.
2. Ask the three canonical English questions once: creation, Settings, and JSON export.
3. Switch the Help language control to Romanian and ask creation, Settings, and JSON export once.
4. Open the compact assistant at 390px and ask Romanian creation once.
5. Compare rendered text, source labels, and actions with the API receipt; all seven LIVE_P2 rows matched.
6. Activate the English creation action by pointer and the compact Romanian creation action with keyboard focus and Enter. Both should reach `/login?next=%2Fnew`; do not enter credentials.
7. Treat the deterministic `support-degraded` failure as unresolved even if the finite browser matrix remains green.

The exact Forgot-password destination remains UNKNOWN and was not searched. The historical source-custody gap remains unresolved. Historical LIVE attempts remain separate and are not combined with this run. LIVE_P2 is not CP3 evaluation, owner acceptance, checkpoint readiness, final independent pass-2 review, or a ticket-completion decision.
