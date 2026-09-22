# GUIDE_CONTENT_FIX author evidence

- Node/ticket/session: `GUIDE_CONTENT_FIX` / `t_9fc28b70` / `/root/requirements`
- Base: `5a8d10099178e2913f5e58b4f5e73f1eda13c30a`
- Product commit: `af02290219c734d2ad2fe7df878356fec9043b15`
- Actual product/test scope: six packet-authorized files.
- Admission: none. All eight records remain unadmitted; owner ratification fields remain blank.

## Finding disposition

| Finding | EN | RO | Current author disposition |
|---|---|---|---|
| E1 visible landing label | `Transcripts (the sample debate transcript)` in body and projection | `Transcripts (exemplul de dezbatere și transcriere)` in body and projection | corrected; requires separate recheck |
| E2 Report a bug workflow | explicitly primes ordinary public-guide composer text and does not create a human case; escalation and email remain distinct | equivalent Romanian claim with the same workflow separation | corrected; requires separate recheck |

Producer verification used the current committed UI: `LandingChrome.tsx` renders `Transcripts`; `Assistant.tsx` handles Report a bug with `primeComposer`, describes the shortcut as opening a public product-guide conversation, and implements human escalation/email separately.

## Member-by-member hash disposition

| Record | Changed fields from prior author index | Prior editorial disposition |
|---|---|---|
| `app-navigation.en` | article, body, projection | REWORK; passing fallback retained exactly |
| `app-navigation.ro` | article, body, projection | REWORK; passing fallback retained exactly |
| `settings-help-menus.en` | article, body, projection, fallback | REWORK |
| `settings-help-menus.ro` | article, body, projection, fallback | REWORK |
| `debate-workspace-menus.en` | none | PASS retained byte-for-byte |
| `debate-workspace-menus.ro` | none | PASS retained byte-for-byte |
| `support-status-limits.en` | none | PASS retained byte-for-byte |
| `support-status-limits.ro` | none | PASS retained byte-for-byte |

The complete old/new SHA-256 values and prior review proof are in `GUIDE_CONTENT_FIX-editorial-inputs.json`.

## Verification

- RED: `GUIDE_CONTENT_FIX-red.log`, rc 1, two intended claim failures and 40 passes across the two affected tests.
- GREEN: `GUIDE_CONTENT_FIX-green.log`, rc 0, 42/42 tests across the same two files.
- Recovery-text safety check: all four changed components have safe projections and fallbacks.
- `git diff --check`: rc 0 before commit.
- Commit scope: exactly four articles, `components.json`, and the focused recovery-component test.

## Limits

- No catalog, navigation, selector, manifest, review, runtime model, preview, browser, HTTP or private-data work occurred.
- No passing workspace/status bytes or app-navigation fallback bytes changed.
- No editorial PASS, attestation, owner acceptance or checkpoint readiness is claimed.
