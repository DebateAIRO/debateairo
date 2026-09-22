# GUIDE_INJECTION_FIX — immutable lock correction

Base `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`; final clean commit `78988fc2e5e24595bd9cd6ec0a3965c6039dc718`.

## Result

The supported restricted Support principal can now return deterministic injection refusals without a forbidden session-state update. The API no longer exposes or invokes `finalizeInjectionLock`; `PostgresSupportSessionRepository` no longer implements the mutable finalizer. Admission still serializes and records immutable `INJECTION` and threshold `LOCK` events. Public session read and later admission remain derived from the injection count, IP cooldown remains derived from `LOCK`, encrypted refusal storage still precedes the response, and `openSessions` now excludes immutable `LOCK` events.

No migration or privilege changed. `UPDATE(state)` remains forbidden and startup attestation remains strict. The model, classifier, KB, UI, case repositories, physical message lifecycle guard, quotas, threshold, and private-data boundaries are unchanged.

## RED and focused proof

- The first sandbox invocation failed before tests with local-listener `EPERM`; it is retained separately and is not product evidence.
- The escalated isolated restricted-role RED ran the exact Romanian LIVE6 injection through a provisioned `SUPPORT_DATABASE_URL`. It failed the intended HTTP 200 assertion with actual HTTP 500 and body `{"error":"INTERNAL_ERROR","message":"INTERNAL_ERROR"}`: 1 failed, 162 skipped.
- After removing the forbidden finalizer, that same test passed: 1 passed, 162 skipped. It also proves zero model transit, two encrypted messages and one `INJECTION` after the first refusal, three `INJECTION` plus one `LOCK` at threshold, stored physical state `OPEN`, public derived state `LOCKED`, and a subsequent 429 with no additional messages.
- The first four-file frame passed 186 tests and failed five stale principal-count tests. The unchanged declared principal source had SHA-256 `7d68dd8a2e826ea1da9d8d2fa2555a3458e088710426b8cba3e6cd4f6bb690e8` at both base and final and exports 11 entries. Assertions still embedded 12. The source-derived correction changes no provisioning or privilege byte.
- After the first cardinality edit, the principal file had 15 passing tests and one remaining password-cardinality literal. Its single corrected test then passed with 15 skipped. The exact mechanical assertion/title locations in the final file are `:88`, `:120`, `:125-126`, `:549`, `:569-570`, `:584`, `:592-595`, `:598`, `:708-711`, and `:715-716`; each now derives from `DEVELOPMENT_DATABASE_PRINCIPALS.length`.

## Final verification

- Final revision exact 34-file suite: 34/34 files, 1,699 passed, 1 TODO, 0 failed.
- Typecheck: exit 1 with 76 inherited diagnostics; final log is byte-identical to the indexed baseline, SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`.
- The first post-implementation typecheck is retained: 81 diagnostics, with five new TS7006 diagnostics in the new test wrapper. Explicit parameter types only fixed them. Because those bytes were added after the first passing 34-file frame at `f21ffd69`, the one justified final-revision 34-file rerun was captured at `78988fc2`.
- Controlled structural evaluation: all three runs passed 60/60; A 20/20, B 6/6, C 10/10, D 12/12, E 6/6, F 3/3, G 3/3. Exit remains 1 only because the independent quality rubric is `PENDING`; no live model was used.
- Strict reviewed corpus snapshot: `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`, 44 entries, immutable exact-version lookup passed. Owner ratification was not changed.
- Cumulative FINAL7 inventory: 144 present product files and 3 deleted product paths from the original baseline. The scoped delta is exactly the nine authorized paths.

## Preserved failures and limits

All failed frames are retained: sandbox listener denial, actual restricted-role HTTP 500 RED, the 186-pass/five-stale-count frame, the 15-pass/one-stale-count frame, the 81-diagnostic typecheck, and the sandbox-only tsx snapshot IPC denial. No runtime, browser, preview, Support, status, capacity, or model request was made. LIVE6's original first exception remains unpersisted; this correction proves and removes the guaranteed defect without relabeling that missing observation.

Separate correctness and security reviews plus a fresh actual 54-row capture remain required. Thirty-nine LIVE6 rows remain unattempted and forty unfinished including its failed row. Forgot remains unresolved/actionless; CP2 remains gated. No readiness or checkpoint acceptance is claimed.

