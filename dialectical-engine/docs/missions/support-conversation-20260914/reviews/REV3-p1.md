# REV3 pass 1 — bilingual product truth and working preview

**Verdict: REWORK.** The integrated product at `6e5ab5fc41acebbff4264efc7d481df3db8dce44` is mechanically exact and substantially improved, but it does not satisfy the complete product-truth lens. One required actual English creation question still becomes a generic safety refusal with no sources or action, its pointer path is consequently unverified, and the owner-confirmed Forgot-password destination remains independently UNVERIFIED and checkpoint-blocking.

## Finding

### REV3-P1-F1 — P1 — Required English creation guidance becomes a false refusal

LIVE4 sent `How do I create a debate?` once through the compiled full UI, actual anonymous Support API, and unchanged preview relay. The response was HTTP 200 with outcome `REFUSE_SAFETY`, the server-authored human fallback, and zero sources/actions. The isolated request window contains exactly one valid, unique diagnostic: `SUPPORT_DRAFT_TEXT_INTERNAL_IDENTIFIER` / `NARRATIVE_INTERNAL_IDENTIFIER`. No raw rejected completion was retained, so the exact identifier that triggered the predicate is unknown and must not be inferred.

The runtime path is visible in the committed source:

- `apps/api/src/support/response-policy.ts:183-219` applies the closed narrative-identifier screen and returns `TEXT_INTERNAL_IDENTIFIER`.
- `apps/api/src/support/answer.ts:285-317` diagnoses and parses the completion, substitutes the `REFUSE_SAFETY` template when the draft is rejected, and removes sources/actions.
- `apps/api/src/support/answer.ts:319-333` writes that canonical replacement and returns the stored text.

The receipt proves exact API/DOM equality, so the UI faithfully displays the failed server outcome. This directly fails `SPEC-v2.md:64` (`CP1-A09`): every named benign EN/RO question must return current prerequisites/limitations with reviewed sources/actions. Because the English response contains no action, its required pointer activation is **UNVERIFIED**.

Required rework evidence after the review union selects an architecture: replay the same seven prompts once, without retry, at one exact integrated revision. English creation must return useful current guidance, reviewed sources, and a canonical context-appropriate action; API and DOM must match; activate that rendered English action by pointer. Preserve all six currently useful answers and the existing compact Romanian keyboard result. Do not substitute a prompt-only tuning/sample cycle for the architecture decision required by `CP1-REVIEW-AT-FAILURE.md`.

## Final actual matrix

| # | Surface | Question | Result | Product-truth disposition |
|---:|---|---|---|---|
| 1 | Full EN | Creation | `REFUSE_SAFETY`, 0 sources, 0 actions | **FAIL — REV3-P1-F1** |
| 2 | Full EN | Settings | Grounded, 2 sources | Useful and accurate in this finite oracle |
| 3 | Full EN | JSON export | Grounded, 2 sources | Useful and accurate in this finite oracle |
| 4 | Full RO | Creation | Grounded, 3 sources, 1 action | Useful; canonical guest destination `/login?next=%2Fnew` |
| 5 | Full RO | Settings | Grounded, 2 sources | Useful and accurate in this finite oracle |
| 6 | Full RO | JSON export | Grounded, 1 source | Useful and accurate in this finite oracle |
| 7 | Compact RO | Creation | Grounded, 3 sources, 1 action | Useful; keyboard Enter reached `/login?next=%2Fnew` |

All seven response texts, source labels, and action projections match between API and DOM. The six grounded answers state the reviewed current prerequisites and limitations without visible internal identifiers. No request was retried. The English pointer was not skipped arbitrarily: the failed response rendered no action. No credential or recovery operation occurred.

The full EN, full RO, and compact RO screenshots were inspected at receipt hashes `36b0e983...`, `c71f6c56...`, and `2bf64f91...`. Full EN visibly contains the refusal. Full RO and compact RO retain the approved visual direction, readable bilingual content, sources/actions, and immediate human access without an observed layout break. The actual receipt remains authoritative for transcript text outside the static viewport.

The console classifier records 11 `HTTP_401` entries and zero `HTTP_404`, `JS_OR_HYDRATION`, or `OTHER`. Because raw origins were not retained, the evidence does not establish that every 401 was expected or harmless.

## Prior finding dispositions

- **Invalid Help shortcuts — resolved.** The literal former `/settings#privacy` and `/settings#cookies` links are absent. The final unchanged UI scope uses the canonical privacy action for signed-in state, omits it for guests, and calls the existing cookie-preferences opener.
- **Signed-in visual evidence — resolved for synthetic conditioning only.** Full/compact EN/RO captures cover identity presentation, consent, picker, source/action labels, `/new`, containment, and keyboard behavior. Synthetic identity, debate data, and API responses do not prove real ownership or private authorization.
- **LIVE3 false refusals/internal prose — partially resolved.** Six of seven LIVE4 answers are useful and no accepted answer exposes an internal identifier. The remaining English creation refusal is the current blocker in REV3-P1-F1.
- **FIX4 deterministic boundary evidence — consumed, not promoted to live acceptance.** GATE binds the 11 FIX4 kernel/server/test paths. The author suite reports 21/21 files, 831 passing tests, one Forgot TODO, and a typecheck exactly matching the attributed 76-diagnostic baseline. This evidence supports the shared redaction, output-policy, diagnostic, and canonical-sink paths; it does not negate the actual failed answer.

## V-1 — Forgot-password destination remains UNVERIFIED

The owner confirms that a Forgot-password flow exists, but the mission still has no exact verified URL or existing opener. Therefore `CP1-R05`, `CP1-R06`, and `CP1-A05` cannot be satisfied: the resolver destination, deterministic EN/RO action, pointer and keyboard activation, and zero Support-originated reset/credential submissions remain unverified. No Settings route, MFA recovery path, human escalation, or invented replacement may substitute for that destination. This is a missing external input and an explicit checkpoint blocker, separate from REV3-P1-F1.

When the exact destination arrives, independently review only the changed catalog/server/UI bytes and exercise the required EN/RO phrases plus pointer/keyboard activation with zero Support-originated security operations. Until then, CP1 cannot be presented as ready for owner verification, and CP2/CP3 remain gated.

## Product and evidence custody

- Reviewed base/revision: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893..6e5ab5fc41acebbff4264efc7d481df3db8dce44`.
- GATE manifest SHA-256: `ab6221c1e5e1a4fa3050854005a646242bbc7472522d2745077eea77a2da48f0`; immutable patch SHA-256: `dc4b6087e944d96fc5ed9f9d4a7451c548fa39c70f7824d9770a33fd830e09ae`.
- FIX4 consumption SHA-256: `281a0a333e5faa83f3d672848fe30bd04f27f9e6ea56e5561d67079273cd2c71`; LIVE4 consumption SHA-256: `dbf5c7bd12dc20dbb96dda8b604c66906454541d5d24ea90bd8032a734b882c5`.
- LIVE4 actual receipt SHA-256: `d0b121350586d3b1b7835a48f7fbf2f20dbbb611fb140065451678333e66f41b`; corrected diagnostic projection SHA-256: `71accbb829995b787e4aaa6a3bb66a52eeea0ee0c5c373dcc5197e36d6998377`.
- GATE verifies all 99 reviewed product paths against committed and working bytes at a clean product revision. The 11 final FIX4 paths match their exact manifest SHA-256 values.
- The supported preview state is a consumed worker custody receipt, not a fresh reviewer measurement: PID/PGID `91461`, PPID `1`, ordinary TLS 200, exact revision, and expected preview/original listeners after browser exit plus ten seconds.

## Original-source provenance limitation

The retained intake and BASE evidence records source HEAD `446c685e...`, an empty index, 56 tracked unstaged paths, and serialized `git diff --binary` SHA-256 `606ad70f...`. The last matching receipt is FREEZE-LIVE2 at `2026-09-14T14:04:30Z`; the first `dc9f0caa...` receipt is FREEZE-FIX3 at `2026-09-14T14:30:38Z`. Current HEAD, empty index, and 56-path count remain intact.

Only the serialized diff fingerprint is known to have changed. Intake retained neither the full diff bytes nor a `--full-index` hash, so this does not prove original file bytes changed. A bounded current rerender across common object-ID abbreviation lengths and `--full-index` did not reproduce the intake hash, but it cannot rule out a historical Git configuration, object-count, abbreviation, or other representation difference. Changed underlying bytes, cause, actor, and exact time remain **UNVERIFIED**; intake-wide source preservation must not be claimed.

This limitation does not alter the exact product review basis. All 12 BASE-selected source file hashes still match `baseline-manifest.json`, and GATE independently proves the isolated product's 99/99 committed/current-byte inventory.

## Boundaries and limitations

Peer-reviewed knowledge is still not owner-ratified; the 24 new language records keep blank ratification fields. Signed-in screenshots remain synthetic. The rejected LIVE4 completion is unavailable by design, so only its safe predicate class is known. The fixed seven-request matrix is finite actual behavior, not a general model-quality guarantee. Status-label truth and the one-working-day versus 48-hour SLA presentation alignment remain CP3 work and do not alter this CP1 verdict.

No test, build, browser, provider/model request, service action, product write, Git/index/ref mutation, credential/recovery action, or raw private-log read occurred in this review. Actual model-token usage is **UNAVAILABLE**. This report is an independent product-truth verdict, not owner acceptance or checkpoint approval.
