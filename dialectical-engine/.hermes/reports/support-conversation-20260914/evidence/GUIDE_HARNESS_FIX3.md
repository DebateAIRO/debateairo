# GUIDE_HARNESS_FIX3 evidence

- Node: `GUIDE_HARNESS_FIX3`
- Ticket: `t_51f2f2f4`
- Session: `/root/preview`
- Product revision: `f3be0af81f1691db6c23494f9e286bb6b10f13bf`
- KB version: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`
- Verdict: `PASS_INERT_TWO_ROW_ORACLE_CORRECTION_SEPARATE_REVIEW_REQUIRED`

## Reviewed oracle correction

The consumed `GUIDE_NEGATED_ORACLE` disposition requires exactly two matrix changes. Canonical row 53 keeps its prompt, `MODEL` branch, `app-navigation` source and `NEGATED_OR_UNRELATED` class, while requiring closed `help` navigation by pointer on full English Help. Row 54 keeps the corresponding Romanian prompt and the same branch, source and class, while requiring closed `help` navigation by keyboard on compact Romanian Help. All other 52 canonical rows are unchanged.

The copied harness changes only `README.md`, `capture-public-guide.mjs`, `matrix.mjs`, and `verify-guide-harness.mjs`. Six executable or contract files are byte-identical to FIX2. The copied adapter changes only its documentation, FIX3 paths, ordered-eight digest pins, node identity, and mutation-fixture namespace. Exact old/new file hashes are in `GUIDE_HARNESS_FIX3-delta.json`.

## Verification

The supported inert harness command ran once against the clean product revision and passed 65/65 controls. This retains all 62 predecessor controls and adds exactly three: the row 53 pointer Help outcome, the row 54 keyboard Help outcome, and rejection of an injected Help action on an actual deterministic recovery request.

- Schema-2 proof: `GUIDE_HARNESS_FIX3-control-proof.json`
- Executable harness digest: `77b47d705133486ad4d7f520b117c191524cebaaf4131431df512c470177e314`
- Copied adapter digest: `b0d68ed0a8a27b3b9c67ba96b70a64e6051387d5a46bf75e886f75ea0643ad58`
- Replay adapter SHA-256: `2ee693b8736b3b0a16798b96d811044ed93aeb0b11f88307d5d33bad139758a5`
- Adapter mutation negative: 3/3 PASS, `importerCalls=0`, `successfulRows=0`, zero traffic
- Replay adapter syntax: PASS

The five session sizes remain 1/14/13/12/14, request spacing remains 31 seconds, the model ceiling remains 42, capacity freshness remains 120 seconds, and the current-message/session lifecycle contracts are unchanged. The full ordered-eight digest is checked before dynamic import, and the constructor proof digest must equal it before row projection.

## Limits

No valid runtime gate was fabricated and the adapter was not run across all 54 actual product proofs. No browser, HTTP, database, Support, model, provider, lifecycle, counter, limit, credential, private-record, product, or Git action occurred. The fixed future capture receipt, screenshots, and browser profile remain absent. The running GUIDE_LIVE2 stack log was not copied. Separate baseline review is required before LIVE3; this node makes no readiness, acceptance, or live-behavior claim.

## Commands

```text
LOG=.../GUIDE_HARNESS_FIX3-controls-final.log run-capture.sh node --import tsx .../GUIDE_HARNESS_FIX3/verify-guide-harness.mjs .../support-conversation-cp1/dialectical-engine f3be0af81f1691db6c23494f9e286bb6b10f13bf
LOG=.../GUIDE_HARNESS_FIX3-adapter-negative.log run-capture.sh node .../GUIDE_ROW_PROOF_FIX3/verify-negative-fixture.mjs
LOG=.../GUIDE_HARNESS_FIX3-adapter-syntax.log run-capture.sh node --check .../GUIDE_ROW_PROOF_FIX3/replay-row-proofs.mjs
```
