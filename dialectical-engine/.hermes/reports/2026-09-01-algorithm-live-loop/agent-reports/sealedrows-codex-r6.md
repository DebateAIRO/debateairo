CODEX REVIEW SEALEDROWS r6 — CHANGES · comments read through: sealedrows-postcap2-2026-09-05

Finding counts: **2 BLOCKING (→ V) · 4 FOLLOW-UP (→ ticket; F22 and F-SEALEDROWS-I already exist and must not be re-filed) · 4 packet-audit corrections**. The new test reaches the real HTTP wire and catches a changed leading system prompt on each attempt it produces, but it produces only two of the three attempts the sealed deployment permits and adds repair-packet shape constraints AMENDMENT 6 expressly excluded.

Exact artifact: commit range `7dda3cc0d3305c96e62dadb77f1eb941165d633a..8a08f5e1aae1e462720cef5e06c06dcd51eb5c67`; patch SHA-256 `22d242c90b8182dedc33758c424c60ee0222743eafaf76cdf8ed09843c261834`. The r6 delta is one test file, +55 −2, with no production-file change. Patch-risk recommendation: **revise**; workflow label: **revise**; impact moderate, regression likelihood high, protection partial, recovery easy, confidence high.

## Findings

### B1 · The fixture exercises one repair, but both sealed deployments permit two — **BLOCKING (→ V)**

**File/line ·** `dialectical-engine/tests/integration/database.test.ts:4140-4147,4182-4194`; attempt loop at `dialectical-engine/packages/providers/src/index.ts:323,332-350,405-439`; evaluator callback at `dialectical-engine/apps/runner/src/index.ts:4146-4169`; sealed bounds at `dialectical-engine/acceptance/seed-register.ts:246-256` and `dialectical-engine/apps/runner/src/dev-deployment-register.ts:35-41`.

**Input → wrong outcome ·** Use the shipped `CONFORMANCE.maxAttempts: 3`, return schema-invalid evaluator content twice and valid content third, and make a repair callback preserve `EVALUATOR_CONTRACT_TEXT` on its first invocation but return an unrelated leading system contract on its second. The r6 test overrides the bound to 2 and supplies only invalid→valid evaluator replies, so the second repair callback and third wire attempt do not exist in the fixture; the test passes while the production-allowed third attempt sends hashed A / prompt B. This is the requested system message that escapes: it is placed on the unproduced third attempt, not hidden from the role filter.

The filter at `database.test.ts:4173-4180` is independent of system-prompt content for the attempts it sees, and exact equality at lines 4192-4193 leaves no alternative leading system string for those attempts. The gap is coverage cardinality. The current helper is correct because it always appends to the captured base packet, but the purpose of this lane is to enforce that behavior against later drift.

**Required fix ·** Under a third V decision, keep the change test-only, use `maxAttempts: 3`, script invalid→invalid→valid evaluator replies, require three evaluator wire bodies, and apply the existing loop assertion to all three. A repair-only counterexample must change only the second repair and die at `attempt 2`. Do not restore a source-text predicate.

### B2 · The `+1 message` and first-user assumptions pin repair shape, not the durable invariant — **BLOCKING (→ V)**

**File/line ·** `dialectical-engine/tests/integration/database.test.ts:4173-4187`; governing constraint at `packets/sealedrows-worker.md:698-705`; contradictory packet claim at `packets/sealedrows-codex-r6.md:25-32`.

**Input → wrong outcome ·** A legitimate repair packet can keep `EVALUATOR_CONTRACT_TEXT` first while appending two context messages, replacing one later message, or placing a repair user message before the serialized evaluator envelope. The system contract still leads, yet line 4187 fails unless the total grows by exactly one; in the reordered-user case line 4176 parses only the first user message and drops the evaluator body from `attempts`. AMENDMENT 6 explicitly says not to add more exact-shape constraints. `expect(attempts).toHaveLength(2)` already prevents a single-attempt vacuous pass, so the message delta is redundant as well as over-constraining.

**Required fix ·** Delete the message-count delta. Let the scenario's expected attempt count prove that repair ran, assert only the first message's role and exact content on every retained attempt, and identify the evaluator envelope by scanning all user messages for serialized `role: "EVALUATOR"` rather than assuming it is the first user message.

### F1 · The mutant log is outcome-only and inadmissible under D24/D42 — **FOLLOW-UP (→ ticket)**

**File/line ·** `logs/sealedrows/r7-b1-every-attempt-on-the-wire.log:1-26`; `DECISIONS.md:769-773,1684-1693`.

**Input → wrong outcome ·** Ask a reviewer to reproduce either claimed mutant from the retained artifact. The log invokes an unretained `/tmp/r7gate.py` and reports summaries, but carries no applied mutation or exact mutation command, no applied/restored token gates, no restore command, and no before/after target hashes. D24 calls such a record testimony-grade; D42 requires `tools/mutate.sh`. Thus “both mutants caught” is statically plausible and the failure snippets name the intended assertions, but the runtime mutation custody cannot be verified from the artifact.

**Required fix ·** Re-capture each claimed mutant with `tools/mutate.sh` and the D24 fields, or narrow the report and packet to static counterexamples and mark the runtime mutant claims CANNOT-ASSESS. This evidence defect does not replace B1/B2.

### F2 · F22's disposition is right, but its `5/5 solo` fact has no retained artifact — **FOLLOW-UP (→ existing F22; do not re-file)**

**File/line ·** `agent-reports/sealedrows.md:90-108,140-145,164-167`; `board/F22-registration-s3b-flake.md:24-44`; retained artifacts under `logs/sealedrows/r7-*`; D19a at `DECISIONS.md:461-468`; D60 at `DECISIONS.md:3252-3271`.

**Input → wrong outcome ·** Run the three-run classifier. Run 1 has the extra registration timeout; runs 2 and 3 have the same normalized 13-name failure set as base. Worst-run-wins therefore yields a RED cluster verdict. Because the changed integration file is not loaded by this cluster and the timeout's cause is not discriminated, lane attribution is **CANNOT-ASSESS**—not CLEAN, and not proven DIRTY. Recording one observation on F22 while leaving D.2 unchanged is correct; widening D.2 after one sighting would teach the D60 classifier to hide a new failure. However, no `r7-*` solo log exists, so `5/5 solo` is testimony rather than artifact evidence.

**Required fix ·** Keep the F22 observation and CANNOT-ASSESS classification, do not add the name to D.2, and either attach the five scoped solo records or mark `5/5 solo` unverified in both the seat report and F22. Promotion remains governed by F22's second-independent-observation rule.

### F3 · The seat report dates AMENDMENT 6 one day early — **FOLLOW-UP (→ ticket)**

**File/line ·** `agent-reports/sealedrows.md:170-175`; authoritative inline heading at `packets/sealedrows-worker.md:661`.

**Input → wrong outcome ·** Follow the report's comments-read cursor. It identifies AMENDMENT 6 as `2026-09-04`, while the amendment and V ruling are dated `2026-09-05`, leaving a false provenance date in the final handoff.

**Required fix ·** Correct only the date to `2026-09-05`; preserve the r5 reviewer cursor dated `2026-09-04`.

### F-SEALEDROWS-I · SYNTHESIZER repair attempts remain unenforced — **FOLLOW-UP (→ existing ticket; do not re-file)**

**File/line ·** `dialectical-engine/apps/runner/src/index.ts:4068-4097`; shared repair helper at `dialectical-engine/apps/runner/src/index.ts:1287-1293`.

**Input → wrong outcome ·** A schema-invalid synthesizer reply invokes the same repair construction, but no wire-level test protects the composer contract on that repair. This is unenforced-not-wrong today.

**Required fix ·** Keep it as the already filed follow-up. V-SEALEDROWS-2 was explicitly evaluator-only and did not authorize adding synthesizer work to this round.

## Review answers and suites

1. The HTTP bodies are genuine wire observations, and a mutated leading system string cannot evade the role filter on an attempt the fixture produces. It can pass only on the production-allowed third attempt that the fixture never produces (B1).
2. `maxAttempts: 2` is the minimum for one repair but not sufficient for the deployed maximum of 3. Two consecutive content failures are a distinct reachable shape and require the second repair callback.
3. The `+1 message` assertion is unsound as a durable pin. It tests the current helper's implementation shape, contradicts AMENDMENT 6, and is unnecessary for anti-vacuity (B2).
4. Independent normalization gives run 2 = run 3 = base at 13 names; run 1 has exactly one extra name. The cluster verdict is RED and the round's causal classification is **CANNOT-ASSESS**, not CLEAN and not proven patch-attributable DIRTY. F22's observation-only disposition is correct.
5. The fixture-hash correction is correctly accepted: line 4206 proves forwarding of synthetic `contract:conformance:test-layer`, not equality to the sealed digest.

Retained validation: the precommit integration file recorded `1 failed | 84 passed (85)`, with the changed evaluator test passing and the established `F-SEALEDROWS-H` failing; precommit typecheck exited 0. Exact-head cluster runs were `14 failed | 1528 passed`, `13 failed | 1529 passed`, `13 failed | 1529 passed`. The r6 test-only delta has easy rollback and no persisted-state effect, but regression protection remains partial.

## Packet audit

AMENDMENT 6's scope, no-production constraint, behavioral observation point, source-predicate prohibition, and fixture-hash correction are sound. Four uncharged record issues remain:

- The reviewer packet says the repair assertion checks only that the contract leads, but `database.test.ts:4187` also fixes the message-count delta (B2).
- The two mutation claims cite a D24/D42-inadmissible outcome summary (F1).
- The packet, seat report, and F22 present `5/5 solo` without a retained solo artifact (F2).
- The seat report misdates AMENDMENT 6 as 2026-09-04 (F3).

The packet's diff counts, zero-production claim, outer-call versus wire-attempt distinction, system-independent attempt selection, and the narrowing from fixture hash to settings-field forwarding match the immutable tree and retained artifacts. I found no other uncharged packet defect.

## Not verified

- A fresh exact-head scoped run was attempted, but the sandbox rejected `listen(127.0.0.1)` with `EPERM`; Vitest skipped all 85 tests. Per packet law it has no passed/total and supplies no validation.
- No mutation was applied to the subject worktree. The retained mutant record lacks D24/D42 custody, so its runtime claims are CANNOT-ASSESS from the artifact alone.
- No retained record proves the claimed five solo registration runs.
- The cause of the run-1 registration timeout remains CANNOT-ASSESS.
- `F-SEALEDROWS-H`, attempts beyond the second in the current fixture, the full `pnpm test`, other integration/acceptance DB suites, deployed register contents, and the end-to-end production seed→read chain were not freshly executed.

## PREDICTIONS

1. A second-repair-only mutant will survive the current fixture because production permits attempt 3 while the fixture stops at attempt 2.
2. Replacing the `+1 message` pin with a three-attempt scenario plus leading-contract assertions will close both blockers without production changes.
3. A future legitimate repair that carries assistant context or reorders later user messages will be rejected by the current test even though the contract still leads.
4. The F22 timeout will be mistaken for known instability if its one observation is added to D.2; leaving it observation-only prevents that classifier blind spot.
5. Outcome-only mutant summaries will continue to be over-credited until the D42 emitter is used or the claims are explicitly downgraded.

MERGEABLE: no — the evaluator test omits the production-allowed second repair and pins repair-packet shape beyond the V-authorized leading-contract invariant.
