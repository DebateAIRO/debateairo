# GUIDE_CORRECTNESS — composed public guide correctness review

## Verdict

**PASS for the finite implemented scope at `c34c64d4e643e404cefe96dfaf167536ae364a94`.** No implementation blocker or same-class regression was found in the composed caller, public/private boundary, reviewed-corpus, navigation, recovery, human-case, or six-path type-correction contracts assigned by the packet.

This is a technical product verdict. It does not certify the separate harness correction, live-model answer quality, browser/DOM behavior, the unresolved Forgot-password destination, or owner acceptance.

## Finding dispositions

### C1 — PASS: strict caller and session-language contract

The browser creates a Support session with the selected language and sends message bodies as exactly `{ text }` (`apps/ui/components/support/Assistant.tsx:270-290`). Changing language invalidates the active session before the next request. The API requires exactly one body key with a string `text`, uses the stored session language, and supplies the session's exact KB version and snapshot to the answer port (`apps/api/src/support/index.ts:298-319`, `601-613`). The selected UI/route frame passed the Romanian override, session invalidation, stored-language, text-only, and exact-snapshot controls.

### C2 — PASS: public-only Support boundary and human-case compatibility

Private-record requests terminate before the answer port with a deterministic refusal and empty source/action arrays (`apps/api/src/support/index.ts:355-375`). The obsolete private own-context module, consent route/port, private projection, and ownership-query composition are absent; the retained architecture and integration controls passed. Human escalation remains available through the existing case path and uses the session language (`apps/api/src/support/index.ts:479-513`, `645-720`). No private record adapter or private-state result is composed into Support.

### C3 — PASS: reviewed corpus, relevance, unsupported topics, and snapshot identity

The exact frozen manifest and recovery components load 44 records at KB version `fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278`; owner recovery fields remain blank. Context selection requires meaningful article/capability evidence, ranks direct evidence, caps actions at three, and emits opaque source/action references (`packages/support-kb/src/context.ts:186-319`). Focused controls retained the immutable 26-case answerable/unsupported matrix, public-menu neighbors, unsupported medical/investment/trading topics, source/action strictness, and missing-snapshot `409` restart contract.

### C4 — PASS: closed navigation and account-menu behavior

Navigation accepts only same-origin closed paths, allowlisted queries/fragments, and trusted UUIDs for owner/public debate routes; unknown, external, token-bearing, malformed, and unresolved actions are dropped (`packages/support-kb/src/navigation.ts:19-98`). Active sessions, legacy claim, and account deletion are signed-in Settings actions. Both English and Romanian account-operation routes retain the intended deterministic operation behavior. The Forgot-password action remains `null` and therefore actionless until the owner supplies its exact destination.

### C5 — PASS: recovery producer/consumer semantics

Recovery intent is parsed by clause and records affirmative, negated, or absent navigation and credential-operation predicates (`apps/api/src/support/recovery-intent.ts:45-60`, `121-193`). The API consumes positive Forgot-password or credential-operation classification before model invocation and stores/returns deterministic security guidance with no action (`apps/api/src/support/index.ts:377-403`). Reviewed recovery projections and fallbacks are admitted only after the closed safety checks in `packages/support-kb/src/recovery.ts:51-106`. The bounded controls passed bilingual affirmative navigation, positive operation, same-clause/ordered negation, benign vocabulary, reviewed fallback, redaction, answer, summary, and route sink behavior already represented in the selected suites.

### C6 — PASS: six-path type correction

The exact `8fb8e407...c34c64d4` diff changes six paths and does not weaken runtime or test expectations. It supplies a safe unreachable indexed-word fallback, gives `Promise.all` reads explicit tuple inference, widens only a catalog-test map key, corrects a route fixture's `canEscalate` literal to the production result, copies a readonly expected-source array for the matcher, and annotates recovery-test callback parameters. The retained author evidence reports 33 files with 1,496 passed and one todo. The typecheck still exits `1`, but its 76 diagnostics are byte-identical to baseline with zero mission-added diagnostics; this review does not call the overall typecheck green.

## Independent verification

- Input custody: all 158 indexed review inputs and all 143 GATE product entries matched recorded SHA-256 and byte counts (`301/301`, zero mismatches).
- Dependency/corpus custody: detached reviewer and frozen primary copies matched for the inspected runtime, UI, catalog, loader, navigation, recovery, manifest, component, and test bytes before execution.
- Focused static/unit frame: 10 files, `302/302` passed, rc `0`.
- Selected route/UI frame: the sandbox attempt passed its two UI controls but could not bind `127.0.0.1` (`EPERM`); the approved rerun passed `46/46`, skipped 152 unrelated tests, rc `0`, and shut the disposable database down cleanly.
- Cleanup: all five temporary dependency links are absent. Detached and primary product lanes remain clean and exact at `c34c64d4e643e404cefe96dfaf167536ae364a94`.

The selected render test emitted a React warning because its fixture reused the key `answer`; the asserted session-language and text-body behavior passed, and this run did not demonstrate a production-key defect.

## Retained evidence and limits

The exact GUIDE_TYPEFIX evidence is retained rather than rerun: 1,496 passed plus one todo in the final 33-file frame; typecheck rc `1` with 76 baseline and 76 current byte-identical diagnostics and zero mission-added diagnostics; three structural evaluator runs at `60/60`, each with rc `1` because the independent quality rubric is `PENDING`. These nonzero gates are preserved and are not relabeled as successful quality verification.

No product, source, Git, index, KB, owner, model, browser, real HTTP, private-data, credential/reset, or acceptance action occurred. The selected tests are discriminating changed-path controls and meaningful neighbors; they are not a fresh whole-application audit. User acceptance remains separate.

## Evidence

- Input custody: `.hermes/reports/support-conversation-20260914/logs/GUIDE_CORRECTNESS-input-custody.log`
- Dependency/corpus custody and cleanup: `.hermes/reports/support-conversation-20260914/logs/GUIDE_CORRECTNESS-dependency-custody.log`
- Focused static/unit frame: `.hermes/reports/support-conversation-20260914/logs/GUIDE_CORRECTNESS-static-focused.log`
- Sandboxed route/UI attempt: `.hermes/reports/support-conversation-20260914/logs/GUIDE_CORRECTNESS-route-ui.log`
- Approved route/UI rerun: `.hermes/reports/support-conversation-20260914/logs/GUIDE_CORRECTNESS-route-ui-escalated.log`
