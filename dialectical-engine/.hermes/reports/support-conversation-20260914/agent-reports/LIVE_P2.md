# LIVE_P2 author self-report

SKILLS LOADED: `using-superpowers`, repository `heartbeat-protocol`, repository `heartbeat-worker`, `verification-before-completion`, `systematic-debugging`, and `test-driven-development`.

- Ticket/session: `t_f60b27a3` / `/root/preview`
- Exact product revision: `606b2eabea1dc9212159e53c193cf69655424e77`
- Product/Git/index edits: none
- Usage: UNAVAILABLE

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Verdict

LIVE_P2 does not establish CP1 readiness. The final 25-file integration run has one deterministic failure: 24 files passed, one failed; 977 tests passed, one failed, and one Forgot-password test remained TODO. The failing `support-degraded` case expected `REFUSE_SAFETY` with relay usage but received `NO_SOURCE`. This is preserved as a final-suite blocker and does not prove the production cause of the mismatch.

The actual seven-question browser matrix nevertheless completed once on the exact revision with no retry. All seven responses were HTTP 200 `ANSWER_GROUNDED`, rendered text/sources/actions exactly matched the API, and each answer was manually useful and consistent with the cited product guidance. Six were accepted model drafts. English Settings was uniquely attributed to the reviewed fallback after `SUPPORT_DRAFT_TEXT_CREDENTIAL_OR_SECURITY_ACTION` / `CREDENTIAL_OPERATION`. This attribution identifies the fixed rejection predicate and does not expose or prove the discarded completion text, a matched token, or a semantic false positive.

## Exact finite result

| # | Surface | Question | Public result | Sources/actions | Origin | Manual result |
|---|---|---|---|---|---|---|
| 1 | Full EN | Creation | `ANSWER_GROUNDED` | 3 / 1 | accepted draft | PASS; pointer action reached `/login?next=%2Fnew` |
| 2 | Full EN | Settings | `ANSWER_GROUNDED` | 1 / 0 | reviewed fallback; credential-operation predicate | PASS |
| 3 | Full EN | Export | `ANSWER_GROUNDED` | 2 / 0 | accepted draft | PASS |
| 4 | Full RO | Creation | `ANSWER_GROUNDED` | 3 / 1 | accepted draft | PASS |
| 5 | Full RO | Settings | `ANSWER_GROUNDED` | 1 / 0 | accepted draft | PASS; one minor Romanian typo (`lucruuri`) remains a quality note |
| 6 | Full RO | Export | `ANSWER_GROUNDED` | 2 / 0 | accepted draft | PASS |
| 7 | Compact RO | Creation | `ANSWER_GROUNDED` | 3 / 1 | accepted draft | PASS; keyboard focus and Enter reached `/login?next=%2Fnew` |

The answer narratives did not contain any returned internal source or action ID. The full English and Romanian captures are 1440×1000; the compact Romanian capture is 390×5732. Inspection found readable controls and responses with no observed clipping, broken layout, or hydration failure. The compact full-page image is long because it includes the landing page behind the open assistant. Static screenshots do not replace the seven-row API/DOM receipt.

## Controls and capture correction

The final pre-request adapter passed 54 inert controls at `2026-09-15T20:32:12+0300` (`LIVE_P2-adapter-green3.log`, SHA-256 `a5638ebcbe5a2cc5edcb7ef3c2212eba2cf65b33341de3b6df86e0d2a8f94691`). It verified all six attested snapshot/ranking inputs, exact version binding, deterministic pins and reviewed-fallback hashes for all seven questions, strict seven-field diagnostic projection, failure on stale/wrong hashes and versions, malformed responses, wrong text/source/set/shape, and the no-event accepted-draft contract.

The first browser harness reached no Support request and stopped before a prompt because it looked for a top-level `kb_version` before the UI lazily created a session. The supported create-session contract instead exposes `session.kb_version`. The retained failure is `LIVE_P2-pretraffic-session-gate-failure.json`; its corresponding log reports only `LIVE_P2_RUNTIME_SESSION_VERSION_UNAVAILABLE`.

The bounded evidence-only correction observes `session.kb_version` from the actual create-session response and gates the following message request until it exactly equals the attested version. It does not derive the version from response text/source IDs, inject a session, or override the API response. Ten fresh inert shape/version/timeout controls passed at `2026-09-15T20:45:51+0300` (`LIVE_P2-session-gate-green.log`, SHA-256 `1e717a4f5a8f6e45936a7864d9b2dd5e75dfcf8014dac9136bd754aa41b85227`) before the first actual prompt. Both actual sessions then reported exact KB version `d674533e89d145bf9203248e2e324b451e57a2f1d3f257614d31678b7ac379df`.

The first wrapper command also failed before launching because the obsolete packet-era skill path was absent; the installed repository wrapper at `.claude/skills/heartbeat-orchestrator/scripts/run-capture.sh` was then used. No browser or Support request ran during that command. The first idle-custody probe passed all assertions and wrote its receipt, then exited nonzero because the evidence probe shadowed Node's `process` binding while printing. The preserved first receipt and log disclose that probe-only error. Renaming the local binding produced the final rc-0 custody receipt; no product or lifecycle behavior changed.

## What cost time and how to improve it

The largest avoidable cost was interface drift in the capture harness: it assumed the version lived at the top level and that a session existed on initial page hydration, while the compiled client creates one only on the first send. A small, frozen contract fixture for the public create-session shape would have made the pre-traffic gate correct before opening Chromium. The same issue appeared in the adapter work when the first fixture applied a 64-character file-hash rule to the 40-character Git revision and when a guessed export source disagreed with production ranking. Both became deterministic once the adapter imported the actual ranking contract and separated revision/hash validators.

The one-prompt workflow should assemble the exact suite union, attested snapshot receipt, adapter fixtures, public-session contract fixture, browser wrapper path, lifecycle PID, and immutable-receipt schema into one machine-checked packet. It should fail before browser startup on any missing path or response-shape mismatch. After that preflight, one suite invocation, one finite seven-request matrix, one screenshot set, and one custody probe are sufficient. Model semantics and independent review still require human judgment; command construction, hashing, version binding, and evidence packaging should be deterministic.

## Custody and limits

The current detached supervisor is PID/PGID `86341`, PPID `1`, serving exact revision `606b2eabea1dc9212159e53c193cf69655424e77`. After browser exit and a ten-second idle boundary, ordinary system TLS returned 200 for `/help`; preview listeners 3100, 3101 and 8890–8896 and original listeners 8790–8796 remained present. The fresh browser profile was removed. The active mode-0600 stack log remains mutable and is excluded from immutable hashing.

The fixed console projection retained HTTP 401 ×15, HTTP 404 ×0, JavaScript/hydration ×0, and other ×0. It retained no raw console strings, URLs, headers, or arbitrary values; their origin and harmlessness are not established. The exact Forgot-password destination remains UNKNOWN and was not searched. The historical source-custody gap remains unresolved. This is not CP3 evaluation, owner acceptance, checkpoint readiness, ticket completion, or final independent pass-2 review.
