# REV2 pass 1 — CP1 integrated security and privacy review

**Verdict: REWORK**

Reviewer: Sol session `/root/forgot_destination`  
Ticket: `t_5a88b1e1`  
Reviewed revision: `6e5ab5fc41acebbff4264efc7d481df3db8dce44`  
Diff base: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`  
Pass: 1 of 3

The final FIX4 revision closes the exact SECDELTA examples, preserves the stable security architecture, and emits a closed diagnostic record. It does not close the underlying input-redaction, output-relation, encoded-link, or narrative-ID classes. A single bounded direct-import probe confirmed five actionable blockers that reach canonical Support sinks. No product fix is made or proposed here beyond the required verification shape.

## Evidence identity and scope

- Frozen HEAD and review target both equal `6e5ab5fc41acebbff4264efc7d481df3db8dce44`; the reviewed worktree is clean and `git diff --check` returns 0.
- `b7ca2c41..6e5ab5fc` contains exactly 99 changed paths. The 11 FIX4 paths all match the SHA256 values in `GATE-manifest.json`; mismatches: 0.
- `GATE-manifest.json` SHA256 is `ab6221c1e5e1a4fa3050854005a646242bbc7472522d2745077eea77a2da48f0`. The immutable patch SHA256 is `dc4b6087e944d96fc5ed9f9d4a7451c548fa39c70f7824d9770a33fd830e09ae`.
- FIX4 changes 11 files: five product files and six focused test files. The prior server, database, authorization, consent, encryption/shred, queue/spend/rating/degraded, knowledge, navigation, UI, and preview traces are reused from SECPREP/SECDELTA and the final GATE because their relevant product bytes did not change.
- LIVE4 is author evidence at the same revision: 21/21 test files, 831 passed plus one Forgot TODO; six useful grounded results from seven actual one-shot prompts; one English creation `REFUSE_SAFETY`; API/DOM equality 7/7; reported auth/recovery operations 0. This reviewer did not repeat the suite, relay, browser, HTTP, stack, or account operations.

## Blocking findings

### B1 · P1 — a labelled multiword credential is only partly redacted

**Location.** `packages/kernel/src/support-credentials.ts:83,171-179`; canonical application at `packages/kernel/src/index.ts:299-314`; unchanged persistence/model/case sinks at `apps/api/src/support/session.ts:224-303,448-489`.

**Concrete failure.** The value grammar captures one non-whitespace token. The invented input `My password is "inert horse battery"` becomes `My password is [REDACTED_SECRET_LIKE] horse battery"`. The returned redaction flag is true while most of the supplied value remains.

**Consequence.** The message cipher uses that result as the plaintext passed to sealing and persistence; `writeAndTransit` forwards it, and E3 case preparation reuses it for the case snapshot and advisory-summary transcript. At-rest encryption does not remove the prohibited residual value before those boundaries.

**Required verification.** Extend the supplied-value grammar to bounded quoted and multiword forms in EN/RO without consuming following prose. Prove the entire invented value is absent at canonical seal/persistence/transit, legacy reads, E3 snapshot/summary transit, and case replies. Keep `I forgot my password` and `Am uitat parola` unchanged.

### B2 · P1 — coordinated negation remains a credential-solicitation bypass

**Location.** `packages/kernel/src/support-credentials.ts:79-81,118-137,181-203`; relation decision at `apps/api/src/support/response-policy.ts:150-161,195-207`; sink at `apps/api/src/support/answer.ts:285-332`.

**Concrete failure.** The new coordinator expression splits `and you should`, but does not split `and also` or `, so`. Any earlier negation in the surviving scope marks all later operations negated. Both `Support does not receive passwords and also asks you to send them here.` and `Support does not receive passwords, so send them here.` return `ACCEPTED`. The first was persisted and returned by the actual answer service as `ANSWER_GROUNDED`; its summary form is also accepted.

**Consequence.** A model completion can instruct a visitor to send credentials despite the owner prohibition. The confirmed effect is unsafe text in canonical assistant persistence and the service/HTTP projection. No credential was supplied and no auth/reset capability executed.

**Required verification.** Bind each negation to its governed operation group rather than a prior-token existence test. Cover coordinated subject/modal variants and causal coordinators in EN/RO, plus safe negative limitations. Verify answer and advisory-summary replacement before persistence and projection.

### B3 · P1 — percent-encoded credential terms bypass the relation screen

**Location.** URI normalization at `apps/api/src/support/response-policy.ts:138-147`; raw-only credential analysis at `:150-161,201-206`.

**Concrete failure.** `normalizedForScreening` creates decoded views for link, token, and identifier checks, but `containsCredentialOrSecurityAction` analyzes the original raw value. `Send your p%61ssword to Support.` therefore returns `ACCEPTED`, is persisted and returned by the answer service as `ANSWER_GROUNDED`, and is accepted by the summary parser.

**Consequence.** A trivial encoded credential noun restores the forbidden solicitation class. This is text acceptance and projection, not proof that the rendered text is clickable or that a credential operation occurred.

**Required verification.** Run credential-fact analysis over every canonical screening view with original-span handling kept separate for input redaction. Cover single/double encoded credential terms and control/compatibility normalization, with benign percent-text controls.

### B4 · P2 — a third encoding layer bypasses the link screen

**Location.** `apps/api/src/support/response-policy.ts:138-147,172-180`.

**Concrete failure.** Screening decodes at most twice. The double-encoded HTTPS control is rejected as `ENCODED_LINK_OR_PATH`; `Open https%25253A%25252F%25252Fexample.test/reset` remains encoded after the second pass and returns `ACCEPTED`. The actual answer service persisted and returned it as `ANSWER_GROUNDED`; the summary parser also accepts it.

**Consequence.** The server accepts a forbidden encoded link instruction that a visitor can copy or decode. React clickability and browser URL interpretation were not exercised and are not claimed.

**Required verification.** Canonicalize to a fixed point under a strict total size/pass bound, or reject remaining percent-encoded structural delimiters after the supported passes. Test termination, malformed encodings, triple/deeper encodings, and benign percentages at answer and summary sinks.

### B5 · P2 — four exact internal IDs are deliberately accepted as visitor prose

**Location.** `apps/api/src/support/response-policy.ts:129-136,183-192,217-219`.

**Concrete failure.** `forgot-password`, `privacy-preferences`, `sign-in`, and `support-status` are removed from the closed narrative-ID deny set as “ambiguous human IDs.” Each hyphenated exact ID returns `ACCEPTED`. `Select forgot-password to continue.` was persisted and returned by the answer service as `ANSWER_GROUNDED`; the summary parser also accepts it. The safe human label `Select Forgot password to continue.` passes without requiring this exception, while `start-debate` correctly rejects.

**Consequence.** The exception confuses a human label with its exact machine identifier and violates the strict text/action separation. The result is plain text, not a rendered action or executed navigation. It is especially material while the owner-confirmed Forgot destination is still unverified.

**Required verification.** Reject every exact catalog action/capability/source ID in hyphenated prose. Preserve ordinary labels with spaces and localized labels as explicit negative controls. Verify structured actions still render and navigate only through the server resolver.

## Prior-finding dispositions

| Prior item | Current disposition |
|---|---|
| SECPREP P1 / SECDELTA B1, supplied credentials | Exact U+200B, OTP, Romanian inflection, passcode/reset-token examples are fixed. The input class remains open as B1 because quoted/multiword values retain residual bytes. |
| SECPREP P2, advisory summary | Exact envelope, safe replacement, and legacy screening remain. The shared screen still accepts B2-B5 members, so the secondary completion sink is not closed. |
| SECPREP P3, encoded links | Raw, protocol-relative, single- and double-encoded tested forms reject. The canonicalization class remains open as B4 at the explicit two-pass edge. |
| SECDELTA B2, plural and coordinated negation | Plural EN/RO and exact `and you should`/`și trebuie` members now reject. Coordinator variants remain open as B2; encoded credential nouns are a separate B3 path. |
| SECDELTA B3, benign cross-sentence limitation | Fixed for the tested EN/RO singular controls; both return `ACCEPTED`. |
| SECDELTA N1, narrative internal IDs | `start-debate`, `owner-debate`, selected sources and control-obfuscated forms now reject. The class remains open as B5 because four exact IDs are explicitly excluded. |
| Safe diagnostics | Product projection is a closed 12-field record with a fresh UUID and no arbitrary completion/source/action bytes. The direct negative control stored/returned only the server refusal. |

## LIVE4 evidence-scope correction (`t_685b00c5`)

**Disposition: evidence defect disclosed and bounded; no additional product finding.** The preserved original receipt has 12 fixed diagnostic fields. The current retrospective receipt has exactly seven permitted producer keys: `attemptId`, `code`, `predicate`, `hasSources`, `hasActions`, `sourceCount`, and `actionCount`. It preserves seven request windows, declares `new_support_requests: 0` and `attribution_strengthened: false`, and references the superseded receipt. The ten-control log reports exact-seven acceptance, hostile-field dropping, and ambiguous handling for invalid/multiple/duplicate records. Hashes match GATE:

- superseded receipt: `2dc216d117389a10ba8b2f52301709d7642702417e41b34fd0a6c59c080ab37a`
- retrospective receipt: `71accbb829995b787e4aaa6a3bb66a52eeea0ee0c5c373dcc5197e36d6998377`
- strict-seven controls: `6dedeeb8f52f326e7fc58ffb1afc6e8df526fbf62d060f8df7503cdbdce160d6`
- retrospective projection log: `b009738feb7b9cbd825b2a49d7f12541fab216ff8eef54d9c0c8cceab8443a4e`

The correction does not make the original consumer compliant and does not create an API-request join. It also cannot identify the rejected raw completion because none was retained. It is adequate as an honest reduced projection of the fixed safe record and does not strengthen the isolated-window attribution.

## Preserved controls and integrated limits

- The direct probe confirms FIX4 rejects plural EN/RO solicitation, the exact EN/RO coordinator examples, `start-debate`, and double-encoded HTTPS. It accepts the repaired safe EN/RO cross-sentence limitations and the human-facing `Forgot password` label.
- A rejected plural solicitation produced `REFUSE_SAFETY`; canonical assistant storage and service return contained only the server-authored refusal. The projected diagnostic contains only the fixed 12 keys and drops injected arbitrary fields.
- Source/action schema and membership checks, server-resolved action availability, capability ownership, consent gating, encryption/shredding, queue reservation/spend accounting, non-rateable/non-resolution rejection accounting, relay-health treatment, snapshot pin/409 ordering, preview selector and default-port isolation remain supported by unchanged code and retained evidence. They were not independently rerun in this bounded delta.
- LIVE4 still has a checkpoint-blocking English creation refusal. The category is safely attributed to its isolated window, but the discarded raw completion prevents a precise root-cause claim. This review does not recommend weakening narrative-ID enforcement to make that prompt pass.
- The exact owner-confirmed Forgot-password destination remains **UNVERIFIED**. The English pointer was not rendered in LIVE4. No substitute route or reset path is accepted.
- Eleven LIVE4 console events were classified as HTTP 401; their exact origin and expectedness remain **UNVERIFIED**. No raw runtime log was inspected.
- Real PostgreSQL readback, real HTTP transport for the synthetic hostile outputs, real relay production of those outputs, browser clickability, production deployment, cross-request concurrency, and a formal completeness guarantee remain **UNVERIFIED**.

## Independent probe receipt

One captured direct-import run used inert strings and in-memory model/message ports only:

```text
rc=0 log=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/REV2-final-boundary-probe.log cmd=node --import tsx /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/REV2/final-boundary-probe.ts
```

- probe SHA256: `4ca2fc17eaedf992cd1f6ad7bde0e50f1f3992654acaf33e0ad065f06069cbb2`
- log SHA256: `9ffc1b192d32245d5f1221dc5033c7f3d69e20176efc4b17d0782db1f4e5b88d`

The finite matrix contains 6 redaction cases, 17 answer-policy cases, 6 summary-policy cases, 5 actual answer-service sink cases, and one diagnostic projection. It is evidence for the listed members and boundaries, not an absolute guarantee.

## Predictions

The correctness lens will likely focus on the known English creation refusal and may recommend a bounded distinction between selected source IDs and ordinary explanatory prose. The product-truth lens will likely emphasize six useful LIVE4 replies and the missing Forgot destination. The first thing I would check across both is that a proposed usefulness fix does not add more literal-ID exceptions or relax credential/link screening; B5 demonstrates why an exception aimed at human wording can silently admit the exact machine token.
