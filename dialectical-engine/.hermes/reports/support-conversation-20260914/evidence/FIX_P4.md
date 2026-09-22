# FIX_P4 author evidence

## Result

Base `ee06cd875956b76548ffb04d9dff29e4af8bbb74` admitted the reviewed Romanian completion `Asistența nu cere coduri de autentificare; de asemenea le poate valida.` in answer and case-summary parsing and persisted/returned it from the synthetic answer service after one model call. Commit `475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9` closes that family without changing operation, negation, model, navigation, content, recovery, usage, health, or snapshot behavior.

## Cause and family derivation

The shared term patterns recognized Romanian `cod`, `codul`, and `codurile`, but omitted ordinary plural `coduri` and genitive/dative `codului` and `codurilor`. The additive `de asemenea` separator and positive `valid...` operation were already recognized. Without a credential-term fact, the positive operation had no credential object and every output sink admitted the completion.

The correction defines one noun family, `cod(?:ul|ului|uri|urile|urilor)?`, and reuses it for all shipped Romanian code-credential categories: recovery, verification, security, authentication, TOTP, MFA, and OTP. The generated lexical matrix covers six noun forms across the four named `de …` categories, plus representative acronym combinations. This family was derived from shipped catalog/content terms and existing classifier forms rather than from the single witness.

## RED and GREEN

- `FIX_P4-correctness-red.log`: rc 1. The exact reviewer probe reported two policy admissions and one actual service persistence/return failure; the English neighbor and encoded-path control remained rejected.
- `FIX_P4-focused-unit-red.log`: rc 1, 22 expected failures and 327 passes across five files. Failures were limited to missing lexical facts, redaction, answer/summary policy, and answer-service storage for the added Romanian family.
- `FIX_P4-support-cases-red.log`: rc 1, 2 expected failures and 30 passes in the advisory-summary persistence surface.
- `FIX_P4-focused-unit-green.log`: rc 0, 5 files and 349 tests passed.
- `FIX_P4-correctness-green.log`: rc 0. The exact reviewer probe reports PASS; the completion is rejected with fixed predicate `CREDENTIAL_OPERATION`, absent from sealed/persisted/returned sinks, and the one model call, grounded fallback, usage, healthy relay state, corpus version, and 36-entry corpus remain intact.
- `FIX_P4-support-cases-green.log`: rc 0, 32 tests passed. Unsafe Romanian summaries are replaced before seal and persistence.
- `FIX_P4-final25.log`: rc 0, exact 25-file union, 25 files passed, 1126 tests passed and 1 todo.
- `FIX_P4-typecheck-final.log`: expected rc 1 and byte-identical to the attributed 76-diagnostic baseline `ATTEST_P2-typecheck-final2.log`; both SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`. No diagnostic was introduced.

Paired controls preserve English and Romanian independently negated credential guidance, noncredential display/profile prose, benign code wording, and ordinary Forgot-password classification distinctions. Input tests prove plural/inflected values are redacted before cipher, persistence, and transit. Output tests prove answer, summary, answer-service, and case-summary sinks reject positive credential operations.

## Scope and custody

The product commit contains exactly seven packet-allowed files: the shared kernel matcher and six focused unit/integration test files. The product lane is clean at `475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9`. The source checkout remains at `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`; its unrelated inherited dirty state was observed and not modified by FIX_P4. No preview, provider, real model, HTTP, content, authentication, reset, or navigation action occurred.

## Skills loaded

- `using-superpowers` — `30f2ab78e20ddc27ee7158ae8d4a2abe161c360981c7cc3548070913142d3dc3`
- `heartbeat-protocol` — `9f5c803cbdfb92a98bb749601b96d5fa1f2bdcba3805e7cff5be200fd98f3bb3`
- `heartbeat-worker` — `2cc1cb1676e582648002989f75259127421a223bbea1e47814f52366a9ca94c1`
- `receiving-code-review` — `091df1629510af1b92fc4abd6f96732ebedb4cb2c0f3457e8f2740b0504a2438`
- `systematic-debugging` — `808fc5717aa88ad65efff312b11c186294d3e6ee301afb584e2f86599b137787`
- `test-driven-development` — `bf1b8216e523851a411e91d429a7c1c2a173e79d88957bc78e348218d50edd54`
- `verification-before-completion` — `2befe7fc55bcadaa3d97dd9e8efeb633d2561c0ebe74c5a8b17c4d9e7e4520b3`

Usage: UNAVAILABLE.
