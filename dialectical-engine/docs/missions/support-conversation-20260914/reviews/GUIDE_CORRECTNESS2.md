# GUIDE_CORRECTNESS2 — six-path guard correction recheck

## Verdict

**REWORK at `2ccb57fa061f74a81c8f2ef42bd33c768f00d4e0`.** The correction passes its three changed unit files (`562/562`), and the recovery-token and comma-locality repairs pass the independent controls. Two account-operation boundary defects remain in the six-path delta: a Romanian operation recognized by the new boundary guard is not consumed by the deterministic classifier, while non-operational EN/RO Support explanations are refused because actor proximity is mistaken for predicate ownership.

The prior finite PASS at `c34c64d4e643e404cefe96dfaf167536ae364a94` is retained for unchanged files and contracts. This verdict is limited to the six-path guard correction.

## Blocking findings

### B1 — Romanian `elimin*` Support account operation reaches the ordinary answer path

`apps/api/src/support/public-guide-boundary.ts:11-13` added Romanian `elimin*` forms to `ACCOUNT_LOCATION_TARGET` and `ACCOUNT_OPERATION`. The new boundary correctly classifies `Unde ar putea asistentul elimina contul meu?` as **not** a public account-location guide.

The immediate consumer is inconsistent. `apps/api/src/support/classify.ts:31` defines `ACCOUNT_ERASURE_PATTERN` with English `delete|erase|remove` and Romanian `șterg|sterg`, but no `elimin*` form. That pattern is the account-erasure zone rule at lines 64-67. The independent probe therefore observed:

```text
isPublicAccountLocationGuide(...) = false
classifySupportMessage(...) = { outcome: null, language: "ro", link: null }
```

The API computes both decisions and only terminates deterministic account/security outcomes when classification refuses. With `outcome:null` and `classifyPublicGuideBoundary(...)` returning `PUBLIC_GUIDE`, the unchanged handler proceeds to `application.answer.respond` (`apps/api/src/support/index.ts:601-613`). The correction consequently does not keep this explicit Support account operation off the answer path.

The smallest correction contract is to make the deterministic account-erasure consumer recognize the same bounded Romanian operation family admitted by the new guard, then prove the exact classifier and no-answer route behavior for those forms. This report does not prescribe the implementation.

### B2 — actor proximity rejects non-operational Support explanations

`hasAffirmativeSupportAccountOperation` searches up to 64 characters before the account-operation token and returns true if any Support actor appears there (`apps/api/src/support/public-guide-boundary.ts:28-31`). It does not establish which predicate the actor governs.

Two direct bilingual controls fail:

```text
Where can Support explain how I delete my account?
Unde poate Asistența să explice cum îmi șterg contul?
```

Both ask Support to **explain** a user action. They are public guidance under the owner’s free-text guide contract and the correction’s own stated requirement that non-operational Support explanations remain public. The current code associates `Support`/`Asistența` with the later `delete`/`șterg` token, makes `isPublicAccountLocationGuide` false, and causes `classifySupportMessage` to return `REFUSE_ZONE` with `/settings`.

The correction must distinguish the actor of the account operation from an actor governing an explanatory predicate. A bounded regression needs both languages, with paired true Support-execution requests, user navigation, negated operations, and nominal and verbal explanation forms. This report does not prescribe the parser or patch.

## Passing dispositions

- **Reset-token/code subject:** PASS. English and Romanian reset-token/code operations produce affirmative credential-operation semantics and deterministic actionless refusal.
- **Comma predicate locality:** PASS for the assigned transforms. A negated first operation followed by an affirmative operation remains affirmative overall; two negated operations remain negated.
- **Benign recovery text:** PASS. Reset-token expiry statements, including an unrelated Help location after a comma, remain ordinary.
- **Known account controls:** PASS. Explicit English Support operations, tested Romanian `șterg*` operations, user navigation, negated operations, private-record refusal, and nominal Support explanations retain their intended outcomes.
- **Unchanged composed contracts:** retained from the exact prior correctness PASS because the GATE inventory proves only six changed paths. No broad re-audit was performed.

## Verification and custody

- Freeze receipt SHA-256 `5a8923f9a876d6216b761ce8302ce2f01621862954e4647e464d4a11c06cd0a0` binds administrative freeze `b9901446b0d4e6a9e000156bb181bc4d7fe4b087`.
- All `45/45` indexed inputs matched SHA-256 and byte counts.
- All `143/143` GATE product files matched in both the detached reviewer lane and frozen primary lane.
- The `c34c64d4...2ccb57fa` delta contains exactly the six declared paths.
- Authored changed-unit frame: three files, `562/562`, rc `0`.
- Independent discriminator: 20 bilingual rows, 44 comparisons, 39 passed and five failed, rc `1`. Three rows expose B1/B2; B2 contributes two comparisons per language.
- Retained author evidence at this exact composition: 33 files, 1,535 passed, one todo, rc `0`; typecheck rc `1` with 76 diagnostics byte-identical to the attributed baseline and zero mission-added diagnostics; deterministic evaluator `3 × 60/60`, rc `1` because the independent quality rubric remains `PENDING`.
- All five temporary dependency links are absent. Detached and primary lanes remain clean and exact at `2ccb57fa061f74a81c8f2ef42bd33c768f00d4e0`. The heavy lease was released before packaging.

## Limits

No product, source, Git, index, KB, owner, harness, live model, browser, real HTTP, private-data, credential/reset, or acceptance action occurred. B1’s answer-port reachability is a static source-to-sink conclusion from the observed classifier result and unchanged handler; no route request was made. The unresolved Forgot-password destination remains actionless and outside this recheck. User acceptance and preview verification remain separate.

## Evidence

- Input/product custody: `.hermes/reports/support-conversation-20260914/logs/GUIDE_CORRECTNESS2-input-custody.log`
- Dependency cleanup: `.hermes/reports/support-conversation-20260914/logs/GUIDE_CORRECTNESS2-dependency-custody.log`
- Authored changed-unit frame: `.hermes/reports/support-conversation-20260914/logs/GUIDE_CORRECTNESS2-changed-units.log`
- Independent discriminator: `.hermes/reports/support-conversation-20260914/probes/GUIDE_CORRECTNESS2/guard-discriminator.mts` and `.hermes/reports/support-conversation-20260914/logs/GUIDE_CORRECTNESS2-guard-discriminator.log`

