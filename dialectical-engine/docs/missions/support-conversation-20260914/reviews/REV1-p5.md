# REV1 pass 5 — Romanian code-credential correctness recheck

Verdict: **PASS for REV1-P4-C1**  
Reviewer: Sol session `/root/plan_review`  
Ticket: `t_e9039276`  
Reviewed product: `475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9`  
Prior product: `ee06cd875956b76548ffb04d9dff29e4af8bbb74`  
Evidence freeze: `0354169c1ad59e0a8e65f24e8362e85326869b47`

## Disposition

**REV1-P4-C1 is RESOLVED.** `packages/kernel/src/support-credentials.ts:51-80` now defines one Romanian code-noun family covering `cod`, `codul`, `codului`, `coduri`, `codurile`, and `codurilor`, and applies it to the four named code categories and TOTP/MFA/OTP forms. The positive-operation and scope logic is unchanged. The resulting credential facts reach the shared `CREDENTIAL_OPERATION` screen at `apps/api/src/support/response-policy.ts:171-185`, before rejected model bytes can reach the canonical assistant write and response path at `apps/api/src/support/answer.ts:304-375`.

The original reproducer now fails safely:

```text
Asistența nu cere coduri de autentificare; de asemenea le poate valida.
```

The independent direct control passed once with `TSX_DISABLE_CACHE=1` and `node --import tsx`:

- 9 Romanian singular, plural, definite, genitive/dative, and acronym credential-term cases produced the expected shared facts;
- 3 labelled supplied-value cases were fully redacted through cipher sealing, persistence, and transit;
- 5 positive-operation outputs, including the original witness, transformed inflected forms, TOTP, and an English neighbor, were rejected by both answer and exact case-summary policy;
- 6 independently negated or noncredential English/Romanian controls remained usable;
- 2 actual answer-service controls each made exactly one model attempt, reported `CREDENTIAL_OPERATION`, returned the exact reviewed fallback with canonical source/action and exact usage, restored relay health, and kept hostile and supplied-secret bytes out of sealed, persisted, and returned sinks.

The implementation uses the same bounded noun family for all shipped named code categories; no adjacent family omission was found in this scoped review. The GATE_P5 manifest’s 25 immutable inputs, 108 product files, and 7 changed paths matched their frozen hashes. The author’s focused 349-test, 32-test, and final25 evidence remains retained; this recheck did not repeat the broad suites.

Unrelated pass-4/pass-3 conclusions remain unchanged. The inherited typecheck still has 76 baseline diagnostics and is not claimed as passing. The owner-confirmed Forgot-password destination remains separately unresolved. No live/provider/HTTP/browser claim is made, and this scoped PASS is not checkpoint acceptance; the user alone accepts CP1.

The detached reviewer checkout and primary product lane ended clean at exact `475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9`. Temporary dependency links were removed, and the heavy lease was released before report formatting. Usage is **UNAVAILABLE**.
