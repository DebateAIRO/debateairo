CODEX REVIEW S07 r4 — CHANGES · comments read through: s07-r4-2026-09-02

# S07 T9 synthesis serve chain — Codex review r4

VERDICT: CHANGES — 2 blocking findings require V DECISIONS PACKET rows; the worker has spent rework 3/3 and no further worker round is authorized.

Finding count: 2 blocking, 1 non-blocking. Packet defects: 1.

## Review basis

Static review only, as ordered. I read the r4 packet in full first, then the controlling rulings (J29 + ADDENDUM, J24, J25, D24 + ADDENDA, D41, D42, D43), heartbeat protocol and reviewer contract, r3 verdict, ticket, complete worker filing, self-report, the three-commit `1a74eb33..HEAD` delta, the relevant full-lane paths, tests, and supplied evidence. I did not run tests, builds, migrations, mutation commands or provider calls.

Packet constants reconcile: HEAD is `9a3a5f6074fd42da56b74674e1e2f45406ff436d`, tree `5698df1e09e69af168cbd68687775f44ee32b95b`, 12 commits after `e040b1ee`, clean, with zero mode changes. The report's line-2-excluded digest reproduced exactly:

```text
2e3d3e497a4f63cc84888f51accd82a8078ec7c674233f764d2eeb6a35a64254  -
```

I ran the mission's single D41 comparator, not an ad-hoc substitute. Its output was:

```text
TIP=9a3a5f6074fd42da56b74674e1e2f45406ff436d  (resolved with git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07)
records compared: 9 · failures: 0
OK: every record stamps the filed tip
```

The supplied final records report cluster `63/63` three times, zone `13 failed | 1334 passed (1347)` with a byte-equal failure-name set, database `1 failed | 81 passed (82)` with the pre-existing lifecycle failure, crypto `48/48`, root typecheck with no compiler error, and only the known `layout.tsx:3 TS2882` on each surface check. Those are authenticated supplied artifacts, not fresh execution by this static seat.

## Blocking findings — each is a V DECISIONS PACKET row

### S07-r4-B1 → V-S07-CODEX-r4-1 — A real wrong-role producer pair still commits

**File/line:** `dialectical-engine/packages/serve/src/index.ts:1783-1809`; the normal oracle is `dialectical-engine/tests/integration/database.test.ts:4107-4128`.

**Input → wrong outcome:** Take a legitimate round-1 synthesizer artifact `A` with its real ledger entry at `COMPOSER:SYNTHESIZER:INITIAL:1`. Submit one round with both pairs set to that same real producer:

```text
candidateRef=A
candidateCallSiteKey=COMPOSER:SYNTHESIZER:INITIAL:1
verdictRef=A
verdictCallSiteKey=COMPOSER:SYNTHESIZER:INITIAL:1
round=1, synthesizerStage=INITIAL
```

Both suffix checks pass. Both ledger queries return the same one valid row because `bound.role` is used only in error text, never as a predicate. The answer and round commit with a synthesizer response recorded as the evaluator verdict. Swapping the two real role pairs likewise passes. This violates J29's requirement that each reference belong to the expected round producer and contradicts the filing's claim that all four producers are enforced.

The negative arm at `database.test.ts:4970-5001` does not refute this. It stores the artifact's actual entry under `JUDGE`, then supplies nonexistent synthesizer/evaluator keys; it proves that an invented pairing is rejected, not that a real pairing for the wrong role is rejected. The normal four-row oracle labels role from which destination field matched, so it would label a swapped pair as if it were correct rather than validate the call-site role.

**Required V decision:** AUTHORIZE a post-cap correction or HOLD S07 unmerged. Recommendation: authorize. The cheapest safe correction is to derive the exact expected keys in persistence from typed role, `synthesizerRequest.stage`, and `round` (preferably through one shared builder used by runner and serve), require equality, and only then resolve the ledger entry. No stored round column is needed. Add real-pair negative arms for evaluator-as-candidate, synthesizer-as-verdict, and one artifact/key used for both roles. This also makes a future format change fail closed until the shared expectation changes. The worker's draft `V-S07-1` default to accept the suffix check is unsafe and load-bearing; it is superseded by this row.

### S07-r4-B2 → V-S07-CODEX-r4-2 — R5M1/R5M2 are wrong-cause deaths, so the claimed producer/round pins are absent

**File/line:** `dialectical-engine/tests/integration/database.test.ts:4997-5044` and `dialectical-engine/tests/support/settledRun.ts:39-96`; evidence `logs/s07/mut-R5M1.run.log:111-112,237-253`, `logs/s07/mut-R5M2.run.log:188-192,236-252`, and `logs/s07/r5-MUTANT-CAMPAIGN.log:1-72`.

**Input → wrong outcome:** Remove the round guard exactly as R5M2 does and run the current wrong-round arm. The ledger pairing now resolves and `ServeRepository.persist` proceeds, but `persistTerminalRun` next settles the reused queued work item. The raw output says:

```text
ERROR: WAIT_DRAIN_REQUIRED: run … still has a waiting activation
Received: DatabaseError { "code": "23514" }
```

The test is RED because a later work-item constraint disagrees with the expected error, not because the round-binding assertion killed the mutant. The final arm therefore still fails D43's specificity rule. R5M1 has the same defect earlier: its mutant leaves `$2 IS NOT NULL` and `$3 IS NOT NULL` without type context, so PostgreSQL returns:

```text
ERROR: could not determine data type of parameter $2
Received: DatabaseError { "code": "42P18" }
```

That is not evidence that the producer binding rejected a same-run wrong producer. The aggregate campaign records only a failed test name and exit 1, masking both causes. It was not emitted by `tools/mutate.sh` and lacks that D42 emitter's mandatory commit/tree header, literal OLD marker, and explicit hash-match line; the raw `.run.log` files contain command output but not the mutation custody fields. The four R5 records are therefore inadmissible under D42, and R5M1/R5M2 independently cannot be credited under D43. The report's “nineteen mutants across five campaigns” claim is not established; the 15 previously accepted mutants remain, but this four-mutant campaign cannot be added.

**Required V decision:** AUTHORIZE a post-cap evidence/test correction or HOLD S07 unmerged. Recommendation: authorize and bundle execution with the B1 correction while retaining two V rows. Drive the production writer only through `ServeRepository.persist` (before unrelated `work.settle`), make guard removal resolve successfully rather than die later, use a type-valid run-only producer mutant, and emit each transcript through `tools/mutate.sh` with the exact targeted assertion named. This is not another worker rework round; rework 3/3 is spent.

## Non-blocking finding

### S07-r4-N1-PACKET — The packet states the string guard's failure direction and negative fixture inaccurately

**File/line:** mission packet `packets/s07-codex-r4.md:29-39`.

**Input → wrong outcome:** Follow packet lines 32-36 and assume any call-site format change makes `!callSiteKey.endsWith(":<round>")` “degrade to always-true.” A new format that does not end in that suffix actually makes `endsWith` false and the negated guard throw for every round: fail-closed, not always-accept. The present accepting hole is a wrong role's real key that still ends in the same round. Likewise, line 30 calls the negative artifact a JUDGE artifact “under a synthesis call site,” while the ledger entry at `database.test.ts:4970-4976` is under `JUDGE`; only the forged round fields claim synthesis keys.

**Required ticket:** Route to the packet author/orchestrator's same-day packet-defect ledger. Correct the failure direction and distinguish “artifact stored under JUDGE with a nonexistent claimed synthesis key” from “real artifact/key pairing for the wrong role.” This defect did not prevent the review because the packet separately asked for a wrong-producer counterexample.

## r3 disposition and V-row draft audit

- **r3 B1: closed.** Migration 0057 has no request/body column, ciphertext, attestation, trigger or carrier branch; `CONTENT_CARRIERS` and both encryption test arrays contain 14 entries. The table retains only structural fields and artifact/call-site references. I found no body reintroduced under another name. The ownership predicate and lease wrapper remain.
- **r3 B2: not closed**, for B1 above. Run, work item, `MODEL_CALL`, `OK`, artifact and caller-supplied call-site pairing are checked before commit, and a wrong round suffix is rejected in the shipped code. The missing invariant is that the stored pair belongs to the expected role/stage.
- **J24/J25:** no reopened finding. The claim-time sealed-role refusal remains no-substitution and persists its disclosure/terminal state; this round does not change those paths.
- **Draft V-S07-1:** not safe; replaced by blocking V-S07-CODEX-r4-1.
- **Draft V-S07-2:** truthfully stated and non-load-bearing. Returning `[]` for a non-owner is consistent with `readAnswerProjection` returning absence after the same ownership predicate. Keeping the default is safe; a typed refusal should change sibling readers together.
- **Draft V-S07-3:** the repository evidence supports “unmerged/unshipped”: only `lane/s07` contains 0057, and the mission integration branch does not. Whether an external database ever applied an earlier draft is CANNOT-ASSESS statically. On the repository evidence, accepting the final unshipped 0057 in place is the cheaper safe default.
- **Draft V-S07-4:** truthfully records the D27 process deviation. All nine acceptance gate records were re-run and stamped at the filed tip, so accepting the multiple commits is non-load-bearing for stale-gate provenance. It does not cure B2's inadmissible mutation evidence.

## Limits

Fresh runtime behavior, migration execution, rollback, mutation execution and provider behavior remain CANNOT-ASSESS because this seat was explicitly static-only. I verified the supplied records' stamps, counts and relevant raw failure causes; I do not promote their aggregate summaries over the raw outputs. No tests, builds, live provider calls, product edits, git mutations, board edits or decision-ledger edits were performed.

## PREDICTIONS

Another lens will likely accept the four-row oracle as proof of four producers, missing that its `CASE` names the destination field rather than validating the call-site role. It may also accept R5M2 from the aggregate RED line without reading the raw `WAIT_DRAIN_REQUIRED`, and treat the packet's “format change → always true” sentence as established. The first checks should be one valid synthesizer pair used for both roles and the exact received error in each mutant's raw output.
