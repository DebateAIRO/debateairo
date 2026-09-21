# GUIDE_SECURITY7 — declared source coverage security recheck

## Verdict

**PASS** for the finite changed scope at `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13` (base `5731eb6faac25f9712f04aea029a021f6eee9352`). GS6-1 is resolved, and the bounded neighboring guard/source controls found no new security defect.

## GS6-1 disposition

`packages/support-kb/src/context.ts:155` now recognizes the reviewed Romanian `deschide` family while leaving the separate negation and clause rules unchanged. The exact prior counterexample:

> Deschide Dezbaterile mele și Biblioteca de dezbateri publice.

reached the public model path with both closed actions (`public-catalog`, `your-debates`), policy `your-and-public-debates`, and only the two allowed reviewed sources (`browse-public-debates`, `app-navigation`). The previously admitted unrelated `getting-started-debate` source was absent. The same authored source-binding property passed for reversed label order and the forms `deschizi`, `deschidem`, and `deschideți`. Rejected completions for the exact transformed case recovered from required source `app-navigation` in the answer-sink test.

## Guard and policy results

- Preserved source/negation matrix `ae7ff3ce8754a15e0ad2d7b33c45a9e70ce738263c9d8577288551b7add0d0ad`: **18/18**, rc 0.
- New copy of the narrow policy/route matrix `6b5d71d4d871be16530272fa8d6b668502df6d7e3f0ab7964391c9f574b56479`: **18/18**, rc 0. Its only oracle change from the preserved failed SECURITY6 matrix is the already observed safe password result `SECURITY_RECOVERY` → `REFUSE_ZONE`; the product classifier and security-guidance bytes are unchanged. The old failed log remains preserved.
- All eight declared-source set controls passed. Declaration immutability, recovery selection, invalid-policy fail-closed behavior, and nonempty-history rejection passed. All model contexts used closed corpus IDs and contained none of 79 private source/revision markers.
- Injection, credential, and English/Romanian private-record compound cases did not build model context. Both negated-half navigation cases remained ordinary public navigation without activating the two-action policy.
- Exactly three changed authored test files passed: **247/247 tests**, rc 0.

The source policy remains product-owned in the frozen catalog. The catalog, answer validator/sink, recovery helpers, classifier, public/private boundary, response policy, and security guidance are byte-identical to the reviewed SECURITY6 revision. The accepted-answer sink still checks translated sources against the context policy before grounding or selecting the declared reviewed recovery.

## Custody and limits

Pre- and post-custody passed: 84/84 indexed inputs, 143/143 manifest product files, three expected deletions absent, exact four-path delta, and clean detached/primary lanes at the exact revision. Cross-lane dependencies and corpus matched; 19 retained defining objects matched the prior revision. Five temporary dependency links were verified and removed.

This was a finite inert direct-import and unit-test review. It did not use HTTP, a browser, a model provider, a database, private records, account operations, or a recovery flow. It does not prove arbitrary-language completeness or future live-model behavior, and it does not explain the lost earlier response. The owner-confirmed Forgot destination remains unknown and separate from this verdict. No checkpoint acceptance is asserted.

