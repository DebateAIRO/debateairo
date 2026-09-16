# REV2_P3 — final CP1 security and data-safety review, pass 3 of 3

**Verdict: REWORK for the named security scope.** This is the final permitted review pass. B1–B3 remain owner-decision rows; this verdict does not authorize a fourth patch/review loop and does not accept CP1. The exact Forgot-password destination remains unresolved and checkpoint-blocking.

Reviewed product revision: `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d` in the dedicated detached security worktree. Both that worktree and the exact dependency lane were clean at this revision before and after the probe. Mechanical custody read and matched 80/80 lens inputs, 180/180 frozen GATE inputs, 108/108 product files, and 2/2 patches.

The independent substrate was one bounded direct import of the final TypeScript modules with synthetic in-memory model and message ports plus the frozen diagnostic consumer. It opened no HTTP socket, database, browser, preview, provider, relay, auth/reset, or account connection. Two preserved launcher failures happened before fixture import: the `tsx` CLI attempted a sandbox-forbidden Unix IPC listener, then the first `node --import tsx` run lacked the packet-allowed nested workspace dependency links. Attempt 3 used temporary packet-allowed links to the same clean exact-revision dependency lane, disabled the TSX cache, returned rc 0, removed the links in `finally`, and rechecked both lanes.

## Findings

### B1 — A coordinator can leave a declared credential-value tail in every input sink

`packages/kernel/src/support-credentials.ts:91-92,161-184` treats a coordinator as the end of every unquoted labelled value. For the transformed synthetic input `My reset token is quartz and ember; keep it private.`, the declared value is rewritten as `[REDACTED_SECRET_LIKE] and ember`; `ember` survives. `packages/kernel/src/index.ts:301-315` then seals that partial result. The actual answer-service fixture recorded and passed the same residual through its user-message storage and model-transit ports.

The final correction demonstrably fixes the retained unmatched-quote, nine-word over-bound, and punctuation-bearing value cases. It does not establish the required invariant that once a label and connector identify a supplied value, no possible value suffix survives. Increasing another word bound would not address this member; the owner decision must preserve a bounded benign-prose delimiter while failing closed on an ambiguous value tail.

Disposition: **SEC_P1 `t_4bccb334` remains open (partial fix demonstrated).** This is a confidentiality boundary failure in the synthetic actual-module sinks, not evidence of real user data, a real provider call, or a production disclosure.

### B2 — Additive `plus` groups inherit an earlier negation and allow positive credential operations

`packages/kernel/src/support-credentials.ts:83` has no `plus` scope boundary. Lines 230–244 mark every later operation in that scope negated when any earlier negation is present, and lines 274–287 therefore treat the positive operation as safe. Three transformed members were accepted by both answer and summary screens:

- `Support never asks for OTP codes, plus it accepts them.`
- `Support does not request passwords, plus it could receive them.`
- `Asistența nu cere parole, plus le poate primi.`

The actual answer-service fixture persisted and returned the second sentence as `ANSWER_GROUNDED`, with one model call and no rejection diagnostic. Safe negative guidance and explicit display/profile-name objects were accepted, while a positive password-change object was rejected. All 52 current EN/RO action and capability labels passed neutral framing. This isolates the remaining defect to an additive operation-group member rather than a global label or display-object exemption.

Dispositions: **SEC_CREDENTIAL_POLICY `t_db79b682` remains open** and **SEC_P2 `t_18646f0a` remains open on the shared summary sink**. The accepted synthetic prose violates the prohibition on soliciting/receiving credentials; it does not prove any auth/reset effect or explain an individual discarded LIVE completion.

### B3 — Decoded backslash, drive, and UNC paths pass when attached after `=`

`packages/kernel/src/support-text-views.ts:39-44` recognizes path forms only at start or after whitespace, parenthesis, or quote/backtick. `apps/api/src/support/response-policy.ts:146-177` evaluates every canonical view, but its path predicate still misses decoded structural paths attached to another delimiter. These transformed members were accepted by both answer and summary screens:

- `Open=%5Csettings to continue.`
- `Path=C:%5Csettings to continue.`
- `Network=%5C%5Cserver%5Cshare to continue.`

The actual answer-service fixture persisted and returned the decoded-UNC-bearing source text as `ANSWER_GROUNDED`. The spaced `%5Csettings` control rejected, and the bounded decode-exhaustion control rejected. This is a confirmed text-admission/persistence boundary only; no clickability, navigation, filesystem access, or execution was exercised or inferred.

Dispositions: **SEC_P3 `t_55cc12ff` remains open** and **SEC_P2 `t_18646f0a` remains open on the shared summary sink**.

### N1 — The legacy one-token fallback redacts a benign excluded state word

`packages/kernel/src/support-credentials.ts:93-98,181-184,208-217` excludes `unavailable` from a credential value, but the later legacy `SUPPORT_LABELLED_SECRET_PATTERN` at `packages/kernel/src/index.ts:297-314` overrides that decision. `My password is unavailable; show ordinary recovery guidance.` becomes `My password is [REDACTED_SECRET_LIKE]; show ordinary recovery guidance.` This is security-conservative and did not leak data, but it discards benign intent semantics contrary to the negative-control goal. It is a non-blocking compatibility finding for the owner-decision packet.

The malformed literal `%5G` control was also rejected. I do not report that as a finding: the current rule intentionally treats an incomplete structural `%5` escape as unsafe, while the required benign percentage control (`84%`) passed.

## Assigned finding dispositions and retained controls

| Assigned finding | Final pass-3 disposition | Demonstrated boundary |
|---|---|---|
| SEC_P1 `t_4bccb334` | **Open / B1** | Unmatched quote, over-bound, and punctuation members fixed; coordinator-bearing value tail still reaches actual in-memory storage/model transit. |
| SEC_P2 `t_18646f0a` | **Open / B2+B3** | Exact four-key empty-array summary parser rejects retained safe controls but accepts additive positive credential groups and `=`-prefixed decoded path forms. Reviewed answer fallback does not apply to summaries. |
| SEC_P3 `t_55cc12ff` | **Open / B3** | Spaced structural path and decode exhaustion reject; delimiter-prefixed decoded backslash/drive/UNC members accept. No clickability claim. |
| SEC_CREDENTIAL_POLICY `t_db79b682` | **Open / B2** | Positive finite/modal EN and positive Romanian additive groups after `plus` accept; safe negative/display-object/52-label controls pass. |
| SEC_ENCODED_CREDENTIAL `t_f2ecb7e7` | **Fixed for demonstrated bounded members** | Single and deeper encoded credential nouns reject at answer and summary screens. No formal arbitrary-encoding guarantee. |
| LIVE2_ACTION_ID `t_67a569fe` | **Fixed for demonstrated bounded members** | All 35 exact hyphenated IDs plus uppercase, encoded-hyphen, and control-obfuscated transforms reject; valid current alias maps, stale/cross-request/unknown/duplicate aliases and alias/canonical-ID prose reject. All 52 labels remain usable. |
| OBS_CORRELATION `t_f9e289db` | **Fixed for the reviewed bounded interface, with retained limits** | Producer emits the fixed diagnostic projection with opaque attempt ID; strict consumer emits exactly seven record keys, attributes one isolated recovery/refusal event, and returns ambiguous for duplicate/extra evidence. It is cursor attribution, not an API-event join or proof of discarded bytes. |

The reviewed fallback branch behaved as specified for the bounded fixture: an exact safe fallback after a rejected draft returned `ANSWER_GROUNDED` with the deterministic source and source-appropriate action; missing or unsafe fallback returned `REFUSE_SAFETY`; rejected model text and rejected source/action aliases were absent from returned/stored data; and every case made exactly one model call. No auth/reset port exists on the exercised answer-service interface, and no auth/reset or retry traffic was performed. The current test does not prove arbitrary-language completeness, production data-plane behavior, database encryption/shredding, or actual provider behavior.

## Evidence and limits

- Input verification: `REV2_P3-input-verification.log`, rc 0, 80 lens + 180 GATE + 108 product + 2 patch rows, zero mismatches.
- Product probe: `REV2_P3-final-security-boundary-attempt3.log`, rc 0, six redaction cases, sixteen answer-policy cases mirrored through the summary parser, twelve actual answer-service cases, 35 exact IDs, 52 labels, transformed aliases, and four diagnostic-consumer controls.
- Preserved environment evidence: `REV2_P3-final-security-boundary.log` (tsx IPC EPERM before import) and `REV2_P3-final-security-boundary-attempt2.log` (missing nested workspace link before fixture import).
- Runtime evidence remains the separate one-shot LIVE_P2 sample at `606b2eab`; this review made no new real Support/model/preview request and does not relabel that sample to `5cbfc6d4`.
- Forgot-password destination remains UNKNOWN and was neither searched nor guessed.

## PREDICTIONS

The correctness lens will likely accept the narrow degraded-fixture projection at `5cbfc6d4` while retaining the original failed 25-suite frame at `606b2eab`; the product lens will likely preserve the unresolved Forgot-password dependency and may focus on wording rather than these parser classes. If either lens claims whole-CP1 readiness, that claim will conflict with the frozen destination blocker. Neither lens should independently reproduce the three security failures above unless it also uses transformed coordinator and delimiter-prefixed inputs; that is a falsifiable consequence of review blindness.
