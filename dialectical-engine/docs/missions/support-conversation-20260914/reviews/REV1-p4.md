# REV1 pass 4 — CP1 correctness and functional architecture review

Verdict: **REWORK for the named correctness scope**  
Reviewer: Sol session `/root/plan_review`  
Ticket: `t_1600c03e`  
Reviewed product: `ee06cd875956b76548ffb04d9dff29e4af8bbb74`  
Prior review base: `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`  
Evidence freeze: `667494a414bcaf1de30d1730f054893c9275b74d`

The pass-4 correction closes the assigned English additive-operation, supplied-value, benign-state and structural-path cases, but one blocking Romanian credential-category gap remains. This verdict is limited to the correction and affected neighbors. The exact Forgot-password destination remains a separate unresolved owner gate and is not the cause of this technical REWORK.

## Blocking finding

### REV1-P4-C1 — Romanian plural `coduri` is not recognized as a credential term

Reproducer:

```text
Asistența nu cere coduri de autentificare; de asemenea le poate valida.
```

On exact `ee06cd87…`, both `parseSupportDraft` and `parseSupportCaseSummaryDraft` admit this positive credential-operation claim. In the actual answer-service control, the server made one model attempt, emitted no rejection diagnostic, sealed and persisted the completion, and returned it as `ANSWER_GROUNDED`. The supplied user credential in that same request was fully redacted before model ingress and never appeared in canonical sinks, so the observation isolates accepted-output screening rather than input redaction.

The defect is credential recognition, not operation-scope splitting. `packages/kernel/src/support-credentials.ts:54-58` recognizes Romanian `cod`, `codul` and `codurile` forms but omits the ordinary plural `coduri`. The same file already recognizes Romanian `valid…` operations at `:75` and splits `de asemenea` into a new scope at `:83`. The passing affected suite also proves that the same additive construction with a recognized `parole` term is rejected. Because no credential term fact is emitted for `coduri de autentificare`, `apps/api/src/support/response-policy.ts:171-185` does not return `CREDENTIAL_OPERATION`; the admitted answer continues through `apps/api/src/support/answer.ts:304-375` to canonical assistant storage and the returned response.

The bounded correction must make every shipped Romanian singular/plural form of the code credential labels participate in the shared credential-term invariant, then prove the positive-operation rejection across answer, case-summary and actual answer-service sinks. This is a contract requirement; this review does not prescribe a particular regex or implementation.

## Independent verification

The affected unit suites passed 345/345. The integration suite initially could not start because the restricted sandbox denied its localhost listener with `EPERM`; the same exact file then passed 30/30 under the authorized inert test environment. Total freshly passing affected tests: 375/375 across six files.

The independent direct-import control used the exact service and synthetic in-memory ports, with `TSX_DISABLE_CACHE=1` and no external traffic. Its completed run reported:

- two supplied-value cases fully redacted through analysis, sealing, persistence and model transit;
- two benign unavailable-state cases preserved byte-for-byte, closing `COMPAT_P3_STATE`;
- two subject-led follow-up boundaries preserved while the complete credential value was removed;
- English additive positive-operation and double-encoded path drafts rejected to the exact reviewed fallback after one model attempt, with canonical source/action, exact usage and restored relay health;
- four safe negative/benign answer and summary controls admitted;
- the Romanian reproducer admitted on both policy surfaces and stored/returned by the service;
- the exact corpus still loaded 36 frozen reviewed entries at `kbVersion` `d674533e89d145bf9203248e2e324b451e57a2f1d3f257614d31678b7ac379df`.

The author’s broader frozen evidence remains retained rather than rerun: final25 passed 25/25 files with 1,080 tests passed and one TODO; the author’s focused correction evidence passed 337/337, 98/98 and 30/30 in its successive scopes. The inherited typecheck still exits 1 with the same 76 baseline diagnostics; no typecheck-PASS claim is made.

## Assigned dispositions and retained boundaries

- `COMPAT_P3_STATE`: **RESOLVED** by fresh English/Romanian benign-state analysis and exact sink preservation.
- Prior pass-3 correctness dispositions remain retained where the correction did not change their interfaces. The fresh English and encoded-path controls corroborate one-attempt recovery, exact fallback, trusted provenance/action resolution, usage accounting and healthy relay restoration.
- No rejected-text inference or model-quality claim is made. No provider, HTTP, browser, account, credential, reset or preview request was used.
- The owner-confirmed Forgot-password destination remains **UNVERIFIED** and independently blocks full CP1. No route was guessed.
- New preview verification must occur after correction; this review makes no live-behavior claim for `ee06cd87…`.

## Custody and cleanup

The GATE_P4 manifest’s 24 immutable inputs, 108 product files and 10 changed paths matched their frozen hashes. The detached review checkout and primary product lane ended clean at exact `ee06cd875956b76548ffb04d9dff29e4af8bbb74`. All temporary dependency links were removed. Source authority was treated as no-touch current-state evidence only; no source working-byte claim is made. The heavy lease was released and recorded on `t_1600c03e` before report formatting.

Actual reviewer token and cost usage is **UNAVAILABLE**. Root owns correction routing, ticket state and checkpoint acceptance.
