# REV2_P4 — CP1 security and data-safety review, pass 4

**Verdict: PASS for the named technical security lens at `ee06cd875956b76548ffb04d9dff29e4af8bbb74`.** The corrected revision refutes the bounded B1/B2/B3 members that caused the pass-3 rework and preserves the paired compatibility controls. I found no new blocking or nonblocking security finding in the packet scope. Root remains the only finding closer and checkpoint acceptor.

This verdict is separate from the owner-confirmed Forgot-password destination. That destination remains unresolved after `FIND_CURRENT`, was not searched or guessed in this pass, and remains a distinct checkpoint requirement. No current-preview or live-runtime behavior was exercised at this revision.

## Review binding and method

The reviewed product and packet-authorized dependency lane were both clean and exactly at `ee06cd875956b76548ffb04d9dff29e4af8bbb74` before execution and after cleanup. The GATE manifest mechanically matched 24/24 immutable inputs and 108/108 product files. The correction from parent `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d` changes only the ten manifest-listed parser and test paths.

I ran one bounded direct-import detector against the final TypeScript modules. It used synthetic in-memory model/message ports and the frozen diagnostic consumer. It opened no socket, HTTP, database, browser, preview, provider, relay, auth/reset, or account connection. The runner temporarily created the five packet-authorized dependency symlinks, disabled the TSX cache, removed every link in `finally`, and rechecked both lanes clean. The detector returned rc 0 with zero expectation failures.

The independent matrix covered:

- 12 coordinated, quoted, unmatched, over-bound, punctuation, benign-state, and subject-led redaction cases; no declared credential fragment remained.
- 29 answer-policy and 29 exact case-summary cases; both matrices had zero mismatches. These include finite/modal/reference operations across `plus`, `in addition`, `additionally`, `moreover`, `furthermore`, Romanian `în plus`/`de asemenea`, independently negated groups, credential and noncredential objects, encoded credentials, canonical slash/drive/UNC paths after `=`, `:`, `,`, `;`, parenthesis, and quote boundaries, and percentage/ratio/time/version controls.
- 15 actual answer-service cases with one synthetic model call each. Rejected B2/B3 completions did not enter returned or persisted sinks and used the same-version reviewed fallback. Missing or unsafe fallback refused. English and Romanian coordinated input values were redacted before both storage and model transit.
- 35/35 exact closed hyphenated internal IDs plus uppercase, encoded-hyphen, and control-obfuscated transforms rejected in visitor prose. Valid current aliases mapped; stale, cross-request, unknown, duplicate, alias-in-prose, and canonical-ID-in-prose controls rejected. All 52 current human labels remained usable.
- The fixed diagnostic producer projection and strict consumer controls retained exact attribution for one event and ambiguity for duplicate or extra evidence. This is bounded cursor attribution, not an API-event join or proof about arbitrary discarded text.

## Boundary analysis

### B1 — coordinated supplied credential values

`packages/kernel/src/support-credentials.ts:162-185` now owns an unquoted value through a hard delimiter or a bounded subject-led benign follow-up. Bare coordinators remain within the uncertain value. `packages/kernel/src/index.ts:289-306` consumes only analyzer spans; the competing legacy one-token redactor is gone. The final service path redacts at `apps/api/src/support/answer.ts:199,267-273` and again at `apps/api/src/support/session.ts:176-180,227-245,291-300` before storage/transit.

The transformed English and Romanian coordinator cases removed every fragment, including `quartz, and ember`, `juniper or cedar`, and `ienupăr și cedru`. `and I need help` / `și am nevoie de ajutor` remained visible after the secret span, while `unavailable` / `indisponibilă` remained unchanged.

Disposition: **SEC_P1 `t_4bccb334` is fixed for the demonstrated B1 class members. COMPAT_P3_STATE/N1 is fixed for the demonstrated English/Romanian state and follow-up controls.** The finite matrix does not prove recognition of arbitrary credential labels or all natural-language clause forms.

### B2 — additive operation groups and negation scope

`packages/kernel/src/support-credentials.ts:80-83,129-147,221-247,275-286` gives the named additive markers their own scopes and attaches negation to the operation's local scope. `apps/api/src/support/response-policy.ts:171-185` applies the shared relation to every canonical answer and summary view.

Generated positive finite, modal, and reference groups rejected in both envelopes. New groups with their own negation accepted. Noncredential display/profile-name operations remained usable, positive credential changes rejected, and all 52 labels remained neutral. The actual answer service discarded the transformed positive completion and returned the exact reviewed fallback without persisting rejected completion text.

Disposition: **SEC_CREDENTIAL_POLICY `t_db79b682` is fixed for the demonstrated B2 relation-class members. SEC_P2 `t_18646f0a` is fixed for the demonstrated B2 members at the shared case-summary sink.** This does not claim arbitrary natural-language completeness.

### B3 — canonical path roots after assignment syntax

`packages/kernel/src/support-text-views.ts:6-36` bounds canonical decoding; `packages/kernel/src/support-text-views.ts:39-49` recognizes slash, backslash, drive, and UNC roots after the declared assignment separators in an already-canonical view. `apps/api/src/support/response-policy.ts:146-177` screens each view without recanonicalizing it, retaining `ENCODED_LINK_OR_PATH` attribution for decoded members.

All generated assignment-delimiter × root cases rejected in answer and summary envelopes, including the retained `=` cases plus `:`, `,`, and `;` neighbors. Parenthesis and quote neighbors rejected. `84%`, `3/4`, `14:30`, `1.2.3`, and ordinary Settings prose remained accepted. Actual-service transformed UNC and drive completions were absent from sinks and recovered only through the reviewed fallback.

Disposition: **SEC_P3 `t_55cc12ff` is fixed for the demonstrated B3 path-boundary members. SEC_P2 `t_18646f0a` is fixed for the demonstrated B3 members at the shared case-summary sink.** This proves text admission and sink behavior only; it does not infer clickability, navigation, filesystem access, or arbitrary encoding completeness.

## Retained evidence and limits

The immutable author evidence remains: final 25-file frame rc 0 with 25/25 files, 1080 passed and 1 todo; targeted B1 matrix 98/98; integration 30/30; and the inherited typecheck rc 1 with 76 diagnostics, byte-identical to the prior baseline at SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`. I verified the indexed bytes but did not relabel those author runs as independent execution.

The synthetic run does not establish current preview behavior, real-provider behavior, arbitrary prose/encoding completeness, or the exact Forgot-password destination. The reviewer and author are separate native sessions using the same Sol model family; this is not independent model-family evidence.

## Exact evidence

- `REV2_P4-input-verification.log`: rc 0; 24/24 immutable inputs and 108/108 product files matched.
- `REV2_P4-final-security-boundary.log`: rc 0; 12 redaction rows, 29/29 answer-policy expectations, 29/29 summary expectations, 15 answer-service cases, 35/35 exact internal IDs rejected, 3/3 transformed IDs rejected, 52/52 labels accepted, zero expectation failures.
- Probe SHA-256: `23acbb535ceb627be35ee2db7fa61b32c3a1ed2f6fe9e3bb08b7c3f3701f3c97`.
- Runner SHA-256: `475ca88f9080067abdd4e46fe9d537ed04fa1de7321af683a0b6b13a6925f83e`.
- Input verifier SHA-256: `b68ec4e7b1f52c9784b685982c2523ed1080768374dca33a15b3e3927d2b973c`.
- Final log SHA-256: `0b8a3485bb36c35e535bda72d25aabd3c98b0e619eda25196c6da6ae0b6cdb51`.
- Input-verification log SHA-256: `0cceabc3f5f37bf07b67cf0ae9eaf556e8e2209e0a7b9448ad0ff771c5a80f2b`.

SKILLS LOADED: `superpowers:using-superpowers`; repository `heartbeat-protocol`; repository `heartbeat-reviewer`; `superpowers:verification-before-completion`; `superpowers:systematic-debugging`; `superpowers:test-driven-development`. These were retained actual BODY reads in the same native reviewer session. Ticket `t_9040a66d`; native session `/root/forgot_destination`; usage UNAVAILABLE.
