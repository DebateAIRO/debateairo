# FIX_P3 author evidence

## Design recorded before product implementation

- **B1 — declared-value ownership:** the lexical analyzer currently treats every bare coordinator as the end of an unquoted credential value. That is unsafe because a coordinated value such as `quartz and ember` is split and leaves a value tail at storage/model-transit sinks. The correction will stop only at an independently recognizable subject-led clause; otherwise the entire uncertain tail remains part of the credential value until the existing hard delimiter/end. This preserves the paired benign `and I need help` control while failing closed on bare coordinated value tails.
- **B2 — operation-group scope:** `plus`/additive clause markers are absent from `SCOPE_BOUNDARY`, so a positive operation inherits a negation from an earlier group. The correction will establish an independent scope for additive English/Romanian operation groups. A new group must carry its own negation; no global credential-operation exemption is introduced.
- **B3 — structural paths after assignment syntax:** `UNSAFE_PATH` recognizes path roots only at start or after whitespace/quotes/parenthesis. Canonical decoding therefore exposes `=\\`, `=C:\\`, or `=\\\\host` without a recognized boundary. The correction will treat syntactic assignment separators as path boundaries across every bounded canonical view while retaining percentage, time, ratio, and ordinary assignment controls.
- **N1 — benign unavailable state:** the analyzer intentionally excludes `unavailable` as a value, but a legacy one-token regex redacts it afterward. The correction will remove that competing fallback and use the analyzer as the sole labelled-value owner; token-shaped secrets retain the independent secret-like screen.

The RED matrix will exercise analyzer facts, canonical redaction, encrypted-message storage/transit, answer and exact case-summary screening, actual answer-service fallback sinks, and advisory-summary persistence. Product implementation will begin only after the new class-transform tests fail for the expected B1/B2/B3/N1 reasons.

## Implemented boundary

Final product revision: `ee06cd875956b76548ffb04d9dff29e4af8bbb74`, parent `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`.

- B1 now treats only a bounded, independently recognizable benign follow-up as the end of an unquoted supplied value. Bare `and`/`but` groups, including comma-coordinated forms, remain inside the redacted span. English and Romanian subject-led help controls remain visible.
- B2 gives `plus`, `in addition`, `additionally`, `moreover`, `furthermore`, `în plus`, and `de asemenea` independent operation scopes. Generated positive groups reject; generated groups carrying their own negation remain accepted. Existing `and also`/modal/object/reference behavior and all 52 current human labels remain covered.
- B3 recognizes forward/backslash, drive, and UNC roots after `=`, `:`, `,`, and `;` in each already-canonical view. Response-policy classification now tests the current view directly, preserving `ENCODED_LINK_OR_PATH` for decoded forms instead of accidentally recanonicalizing an earlier view. Percentage, ratio, time, version, and ordinary prose controls remain accepted.
- N1 removes the competing one-token labelled-password fallback. The shared analyzer is the sole labelled-value owner, including Romanian colon connectors and `indisponibil` variants; the independent token-shaped secret redactor remains active.

## RED → GREEN and refutation matrix

| Property | Base/mutant evidence | Corrected evidence | Neighbouring control |
|---|---|---|---|
| B1 owns every ambiguous coordinated supplied-value fragment | `FIX_P3-class-red-expanded.log`: coordinator EN/RO failures; `FIX_P3-b1-coordinator-red.log`: comma coordinator 2 failures | `FIX_P3-b1-coordinator-green.log`: 98/98; final25 includes both files | `and I need help`, `și am nevoie`, comma privacy follow-up retained |
| B2 negation is local to one operation group | expanded RED rejects none of the generated additive positives | `FIX_P3-class-green-attempt2.log`: 337/337; final probe has 0 policy/summary mismatches | six EN/RO additive groups with an explicit new negation remain accepted; display/profile controls and 52/52 labels pass |
| B3 canonical structural roots are caught after syntactic delimiters | expanded RED accepts the generated delimiter × root matrix | class GREEN 337/337; final probe exact `=` seeds pass; final25 passes | `84%`, `3/4`, `14:30`, `1.2.3` assignment controls remain accepted |
| N1 benign unavailable state is not a value | base RED shows legacy fallback changes EN/RO state prose | class GREEN 337/337 and final probe exact EN state preserved | ordinary labelled secrets, transformed terms, token-shaped secrets, and cipher sinks remain redacted |
| Actual sinks never receive rejected completion bytes | RED answer-context/service and summary rows accept B2/B3 strings; integration RED 3 failed/27 passed | answer-context in class GREEN; `support-cases` GREEN 30/30; final25 passes | reviewed fallback remains `ANSWER_GROUNDED`, one model call, no runtime-model or effect change |

The first GREEN attempt intentionally remains preserved: 335/337 passed and exposed two compatibility defects in the initial implementation (Romanian `parola mea:` connector spacing and double-canonical link-predicate classification). Both were corrected before the stable frame.

## Verification

- `FIX_P3-class-red.log`: rc1, 52 failed / 259 passed across the first five-file matrix.
- `FIX_P3-class-red-expanded.log`: rc1, 66 failed / 271 passed after adding additive variants and paired controls.
- `FIX_P3-probe-red.log`: rc1 with explicit B1/B2/B3/N1 expectation failures; `%5G` was corrected in the probe to the existing intentional malformed-structural rejection and was not treated as a product finding.
- `FIX_P3-integration-red.log`: rc1, 3 failed / 27 passed.
- `FIX_P3-class-green-attempt1.log`: rc1, 2 failed / 335 passed; preserved as the compatibility discovery above.
- `FIX_P3-class-green-attempt2.log`: rc0, 337/337.
- `FIX_P3-b1-coordinator-red.log` → `FIX_P3-b1-coordinator-green.log`: rc1, 2 failed / 96 passed → rc0, 98/98.
- `FIX_P3-integration-green.log`: rc0, 30/30.
- `FIX_P3-probe-final.log`: rc0; 6 redaction cases with zero residual fragments, 16/16 answer-policy and 16/16 summary expectations, 52/52 labels, 12 answer-service cases, rejected B2/B3 completion bytes absent from sinks.
- `FIX_P3-final25.log`: rc0, 25/25 files, 1080 passed, 1 todo, 1081 total.
- `FIX_P3-typecheck.log`: expected rc1; 76 inherited diagnostics and byte-identical to `ATTEST_P2-typecheck-final2.log`, both SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`; no FIX_P3-path diagnostic.
- `FIX_P3-custody.log`: source HEAD remains `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`; all ten corresponding source-tree paths are clean; product tree is clean and base-to-final diff contains exactly ten packet-authorized paths.

No preview, browser, provider, real model, auth/reset service, production database, external HTTP, push, deployment, or owner-acceptance action occurred. Separate pass-4 review and the existing Forgot-password destination remain unverified.
