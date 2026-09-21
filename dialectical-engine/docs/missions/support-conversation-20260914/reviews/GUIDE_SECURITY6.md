# GUIDE_SECURITY6 — declared source coverage security review

## Verdict

**REWORK** for the finite implementation at `5731eb6faac25f9712f04aea029a021f6eee9352` (base `f3be0af81f1691db6c23494f9e286bb6b10f13bf`). One transformed Romanian public-navigation request reaches the model path without the required compound source policy. No tested credential, injection, or private-record request reached the model path, and no private-data or account-operation capability was demonstrated.

## Finding GS6-1 — Romanian `deschide` bypasses the compound source declaration

The catalog declares `Dezbaterile mele` as a `your-debates` label that requires navigation intent at `packages/support-kb/src/catalog.ts:151`. `ACTION_INTENT` at `packages/support-kb/src/context.ts:155` includes Romanian `deschid` but does not match the ordinary imperative `deschide`. The context builder therefore discards that guide match at lines 301–310; because policy activation at lines 311–320 requires both `your-debates` and `public-catalog`, the compound policy remains null.

The independently generated case:

> Deschide Dezbaterile mele și Biblioteca de dezbateri publice.

was classified as ordinary public guidance and reached the model path, but the actual context contained only action `public-catalog`, no `your-and-public-debates` policy, and sources `browse-public-debates`, `app-navigation`, and unrelated `getting-started-debate`. With a null policy, the answer sink at `apps/api/src/support/answer.ts:339-343` checks the completion against the null policy and can accept any selected context source. This breaks the declared required/allowed source invariant for an explicit request for both destinations. The probe demonstrates model reachability and context/source admission; it does not demonstrate a live model completion, private-data access, or capability execution.

The smallest correction boundary is the reviewed navigation-intent/label matching path in `packages/support-kb/src/context.ts`, plus focused context and answer-sink tests for this Romanian imperative. The invariant should be: an affirmative request containing both closed destination labels activates the same compound policy independent of English/Romanian navigation verb inflection and label order. Keep the existing negation handling and classifier/private-boundary precedence unchanged.

## Independent results

- Preserved matrix `ae7ff3ce8754a15e0ad2d7b33c45a9e70ce738263c9d8577288551b7add0d0ad`: **18/18**, rc 0. Existing negation/source behavior remained stable.
- New matrix `789f058af86d3a3302c40e6c3c35dd86f559431c6d7f487fb6afcf6c3be12f9d`: **16/18 expectation matches**, rc 1. GS6-1 is the contract-relevant failure. The other mismatch is a safe oracle-specificity mismatch: `Please validate my password secret-phrase` returned `REFUSE_ZONE` with `/settings`, rather than the probe's narrower `SECURITY_RECOVERY` subtype, and did not build model context. No product change is warranted from that mismatch alone.
- All eight declared-source set controls passed: required-only and required-plus-optional sets passed in either order; optional-only, unrelated, arbitrary, empty, and missing-required sets failed closed.
- The frozen declaration was exact and immutable; recovery selected `app-navigation` independent of entry order; optional-only and structurally invalid policies had no recovery; nonempty history was rejected. All built contexts contained only corpus IDs and excluded all 79 private source/revision markers.
- Injection and private-record compound controls were refused before context construction. The tested credential phrase was also refused before context construction. Four valid English/Romanian compound cases reached the model path; three activated the policy and one is GS6-1.
- Changed authored controls: **4 files, 201/201 tests passed**, rc 0.

## Custody and retained evidence

Pre- and post-custody checks passed: 87/87 indexed inputs, 143/143 manifest product files, three declared deletions absent, exact nine-path delta, and detached plus primary lanes clean at the exact revision. Five temporary dependency links were verified against the frozen primary lane and removed. Cross-lane dependency/corpus objects matched. The public-boundary, classifier, recovery-intent, response-policy, security-guidance, navigation, package/lock, database-role migrations, test database, and DB package objects were byte-identical to the retained `f3be0af8` evidence, so the earlier restricted-role and guard evidence remains applicable only to those unchanged definitions.

## Limits

This was a bounded inert direct-import and authored-test review. It did not use HTTP, a browser, a model provider, a database, private production records, account operations, or a recovery flow. It does not establish arbitrary-language completeness, actual future model behavior, or the cause/content of the lost earlier response. The owner-confirmed Forgot destination remains unknown and separate from this technical verdict.

