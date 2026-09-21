CODEX REVIEW SEALEDROWS r7 — APPROVE · comments read through: sealedrows-postcap3-2026-09-05

Finding counts: **0 BLOCKING (→ V) · 3 FOLLOW-UP (→ ticket)**. Codex r6 B1 and B2 are closed, the three mutation records are admissible under D24/D42, and AMENDMENT 6's date is corrected. The remaining findings are record and packet precision defects; none changes the shipped code, the current three-attempt proof, or the merge decision.

Exact scope: `7dda3cc0d3305c96e62dadb77f1eb941165d633a..a694843995e2f538d067de2ca1f2e1c728abfcc5`. The final-round delta `8a08f5e1..a6948439` changes only `dialectical-engine/tests/integration/database.test.ts` (+35 −16); the worktree is clean, and the one-path precommit manifest matches the committed blob.

## Findings

### F1 · The retry commentary describes a topology the gateway does not implement — **FOLLOW-UP (→ ticket)**

**File/line ·** `dialectical-engine/tests/integration/database.test.ts:4145-4152,4166-4174`; `dialectical-engine/packages/providers/src/index.ts:323,432-438`; `dialectical-engine/apps/runner/src/index.ts:4146-4169`; `packets/sealedrows-worker.md:733-744`; `v-packets/V-SEALEDROWS-3-third-attempt-and-shape-pins.md:22-27`; `agent-reports/sealedrows.md:17-25`; `agent-reports/sealedrows-self.md:810-813`.

**Input → wrong outcome ·** Let the first two evaluator responses be schema-invalid. The provider invokes the same `request.buildRepairPacket` callback twice, but that callback closes over the original `packet`; its signature does not receive `attemptPacket`. Each invocation therefore rebuilds from the original packet rather than applying a repair to an already-repaired packet. The cited records repeatedly say the opposite. The integration-test comment also still says the wire carries two evaluator attempts although this fixture now carries three. A future maintainer following those comments gets a false model of retry accumulation even though the test result remains correct.

**Required fix ·** In the mutable comments and an append-only record correction, replace “applied to an already-repaired packet” with “the second invocation of the repair callback, producing the third attempt from the captured base packet,” and change the stale measured count from two to three. Preserve the stateful second-invocation mutant: it is still the right discriminator.

### F2-PACKET · “Nothing else about shape” overstates what remains in the test — **FOLLOW-UP (→ ticket)**

**File/line ·** `dialectical-engine/tests/integration/database.test.ts:4217-4225`; AMENDMENT 6 at `packets/sealedrows-worker.md:698-705`; AMENDMENT 7 at `packets/sealedrows-worker.md:755-758`; reviewer packet `packets/sealedrows-codex-r7.md:29-36`.

**Input → wrong outcome ·** Give the initial evaluator packet the required leading system contract plus a later system context message. The durable leading-contract invariant is satisfied and every wire-loop assertion passes, but `expect(system).toHaveLength(1)` rejects the packet. The final packet says only first-role/first-content assertions remain and that nothing else about shape is pinned. That is not literally true: the pre-existing sole-system assertion, the outer-call cardinality check, and the contract-hash forwarding assertion remain. AMENDMENT 6 explicitly classified the sole-system constraint as non-blocking and told the seat not to weaken it in that round, so this is not a reopened B2 or a reason to hold.

**Required fix ·** Correct the handoff to say that r6's two new B2 pins—the `+1 message` delta and first-user position—were deleted, while the previously accepted initial-call sole-system assertion remains. Ticket any later decision to relax that older assertion; do not describe the current test as wholly shape-neutral.

### F3-RECORD · The self-accounting names a finding inside rework 2 as a non-proxy round and omits r2 — **FOLLOW-UP (→ ticket)**

**File/line ·** `agent-reports/sealedrows-self.md:776-793`.

**Input → wrong outcome ·** Classify the eight rows using the report's own table. R1 is the orchestrator-premise/contract block, r2 is “the real work” with no proxy defect, and rework 1 through post-cap 3 are the six rounds containing the proxy-for-property failure. Rework 2 also contained the independent E1 shared-tool defect, but that finding does not turn the whole rework-2 round into one of “the two rounds that were not” proxy rounds. The concluding sentence therefore contradicts both the table and the correct six-of-eight diagnosis.

**Required fix ·** Correct the sentence to identify r1 and r2 as the two non-proxy rounds, then state separately that rework 2 also carried an independent E1 tool defect.

## Review answers

1. **Attempt coverage.** With the current sealed bound, there is no evaluator attempt the deployment can produce that this fixture does not observe: invalid → invalid → valid drives attempts 0, 1 and 2, `toHaveLength(3)` prevents a short-set pass, and the same first-role/first-content assertion runs on all three. If either sealed bound rose to 4 tomorrow, this locally mirrored fixture would not notice automatically. That is not a finding under the packet's rule. The provenance comment naming both sealed rows is the right tie for this test-specific mirror; changing the deployment bound requires deliberately revisiting the fixture and scripted response cardinality.

2. **Role-scan selection.** The current runner cannot escape selection with a second user message carrying another role or with a non-JSON repair message. `.some(...)` scans every user message; a different or unparsable message is ignored while the original `JSON.stringify(request)` envelope still parses as `role: "EVALUATOR"`. `buildSchemaRepairPacket` rebuilds from the captured original packet, so that valid envelope remains on both repairs. If a future change dropped it from one attempt, the retained evaluator set would have fewer than three members and the count assertion would fail. No current packet can substitute an unrelated fourth selected body to mask that loss.

3. **Mutation custody.** All three transcripts are admissible. Each identifies commit `a694843995e2f538d067de2ca1f2e1c728abfcc5`, tree `c5850f732e93760cc109429a22f941c6e2d34eba`, the runner target, literal OLD and NEW text, `pre/applied/restored = 0/1/0`, the scoped Vitest command, exit 1, the failing assertion, the explicit restore command, equal before/after SHA-256 `111654363eaa…`, `HASHES MATCH`, and empty closing porcelain. The failures are credited to the intended assertion at attempts 0, 1 and 2. M3's derived frame column is cosmetically wrong because its injected `=>` line wins the regex, but the raw transcript contains the attempt-2 `AssertionError` at `database.test.ts:4214`. Running retained `tools/mutant-index.py` v4 against `r8-mut-` and `r8-mut-EXPECTED.manifest` exited 0 and reproduced `r8-mut-INDEX-DERIVED.txt` byte-for-byte (SHA-256 `f3eda30878001103beeecf00c80ed21d517a9efb9bb95ca186d676fe9815caca`).

4. **Suites and arithmetic.** Each exact-head cluster record reports `13 failed + 1529 passed = 1542`; base reports `13 failed + 1505 passed = 1518`, so the lane adds 24 passing tests and no failing name. Sorting the full failure names and hashing reproduces md5 `9c28c8f4a3d1c891b78141b73e0aad76` for base and all three r8 runs. The 13 exact failures are:

   1. `tests/architecture/s04-contract.test.ts` · `DR-128 mints only the claim-type composition structure and wires a loud register read`
   2. `tests/architecture/s10-carrier-erasure-red.test.ts` · `filters completed private tombstones before any external key load`
   3. `tests/architecture/s13-contract.test.ts` · `lands append-only memory carriers without a closure job or embedding dependency`
   4. `tests/architecture/s7-authorization-contract.test.ts` · `hardens every immutable memory scope carrier and derives it from run ownership`
   5. `tests/architecture/scaffold.test.ts` · `matches all 28 dependency-edge rows and structural rules 1–5`
   6. `tests/architecture/scaffold.test.ts` · `enforces purity, one provider gateway, source-constant, exhaustive-switch and labeled-number gates`
   7. `tests/unit/load01-run-projection.test.ts` · `reads the state only through the owning asker and prioritizes terminal failure`
   8. `tests/unit/obs-l2-s04-zone.test.ts` · `calls the resolver over the real mount-list source and runs ZI-1..ZI-4`
   9. `tests/unit/obs-l2-s04-zone.test.ts` · `passes all 15 required falsification mutants`
   10. `tests/unit/pro01-runner-tree.test.ts` · `stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path`
   11. `tests/unit/s6-content-encryption.test.ts` · `defaults content encryption off, retires the v1 blind-index path, and requires wrapping-key paths`
   12. `tests/unit/v2ui-node-runner.test.ts` · `keeps every active .test.mjs file in the explicit runner manifest`
   13. `tests/unit/xrev01-node-review.test.ts` · `stops a review loudly when the ratified model-call envelope is exhausted`

   The integration file reports `1 failed + 84 passed = 85`; the changed evaluator test passes and the sole failure is the established F-SEALEDROWS-H lifecycle expectation. Typecheck exits 0. The one-file manifest is 1/1 MATCH against the committed blob.

5. **Packet and dispatch.** AMENDMENT 7 correctly limits the persistent delta to the evaluator test, requires the sealed cardinality, deletes the two r6 shape pins, keeps F2 out of scope, folds in D42 mutation custody and the date correction, and stops the lane after this review. The transient runner mutations were expressly required by F1 and restored with matching hashes; they are not production changes. The three uncharged precision issues are F1, F2-PACKET and F3-RECORD above. I found no uncharged path, scope, suite, hash, tip, or finding-routing defect.

6. **Seat accounting.** The central diagnosis is right. Six of the eight listed rounds contained the same category error: the assertion observed a narrower proxy while the prose claimed the property. The one correction is the final sentence's category bookkeeping (F3-RECORD). In this final round the bound is a deliberate, provenance-marked mirror and the role scan is an independent selector, but the enforced property itself is direct: retained HTTP bodies are inspected at attempts 0–2 for the exact leading exported contract. Nothing decision-critical in the final proof is still a proxy. The surviving sole-system assertion is an extra overconstraint, not a proxy for the leading-contract check, and was already ruled non-blocking.

## Packet audit

- The advertised tips, 15-file base range, 1-file final-round range, +35 −16 count, seven commits, clean worktree, and zero production files in `r6..r7` match the immutable tree.
- B1 and B2 are closed at the exact routes codex r6 required. The `+1 message` line is deleted, and evaluator selection scans all user messages.
- F1's three D42 records and derived index are admissible and reproducible. F3's date is corrected; the r5 cursor remains 2026-09-04. F2 is properly qualified as unverified and was not rerun.
- The inline dispatch misstates repair accumulation and the current test count (F1), the reviewer packet overstates shape neutrality (F2-PACKET), and the self-report's last category sentence misidentifies the second non-proxy round (F3-RECORD). These are the only uncharged issues found.

## Not verified

- No fresh product test, build, installation, provider call, full `pnpm test`, or mutation was run in this static review. Runtime outcomes are assessed from retained exact-head artifacts; only the read-only mutation-index derivation was rerun.
- Attempts beyond the third, because neither sealed deployment permits them and the fixture is intentionally fixed to the current sealed maximum.
- The SYNTHESIZER repair leg (existing F-SEALEDROWS-I), other integration and acceptance database suites, and a live deployed-register read.
- The historical `5/5 solo` statement and the cause of its registration timeout; the statement remains unverified testimony and the timeout had no second observation this round.
- Independent diagnosis of F-SEALEDROWS-H; this review only verifies its retained name/count and established routing.

## PREDICTIONS

1. A fourth-attempt mutant will survive this fixture only after a sealed deployment bound changes; the adjacent provenance comment is the intended review tripwire for that change.
2. Reordering repair messages, adding a differently tagged JSON user message, or adding non-JSON repair text will not remove an evaluator attempt from the current `.some(...)` selection.
3. A reader trusting the “already-repaired packet” wording will incorrectly predict cumulative repair messages; the shipped callback currently regenerates from the captured base packet on every invocation.
4. A later cleanup may remove the retained sole-system assertion, but doing so is independent of B1/B2 closure and should not hold this lane.
5. The derived M3 frame will remain cosmetically misleading until the shared regex distinguishes source lines from assertion frames; the raw transcript will continue to carry the correct attempt-2 death.

MERGEABLE: yes — all authorized functional and evidence outcomes are closed at the sealed three-attempt domain, and the remaining record corrections do not justify holding correct shipped code.
