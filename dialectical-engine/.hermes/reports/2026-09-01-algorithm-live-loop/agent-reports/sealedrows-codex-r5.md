CODEX REVIEW SEALEDROWS r5 — CHANGES · comments read through: sealedrows-postcap-2026-09-04

Finding counts: **1 BLOCKING (→ V) · 0 FOLLOW-UP (→ ticket) · 1 new packet defect**. The direct evaluator request is now protected at the real runner-injected gateway, but the same gateway creates and sends a distinct content-repair packet internally. The replacement test neither executes nor inspects that path, so the lane's central hashed-A/sent-B mismatch is still possible on a repair attempt with every retained B1 check green.

## Findings

### B1 · The recorder sees the initial gateway request, not the repair packet the gateway later sends — **BLOCKING (→ V)**

**File/line ·** `dialectical-engine/tests/integration/database.test.ts:105-113,604-618,4121-4153`; repair construction at `dialectical-engine/apps/runner/src/index.ts:1287-1293,4153-4169`; actual attempt loop at `dialectical-engine/packages/providers/src/index.ts:323-350,405-439`.

**Input → wrong outcome ·** Change only the evaluator's `buildRepairPacket` callback to return a packet whose first system message is some other contract. The new test still returns valid evaluator JSON on the first attempt and its fixture fixes `conformanceBound.maxAttempts` at 1, so the callback cannot run. `recordingRunner` records the one outer `ProviderCallRequest` and asserts only `request.packet.messages`. In a real call with a schema-invalid first evaluator response, however, `OpenAICompatibleProviderGateway.call` invokes `request.buildRepairPacket(...)` inside the wrapped gateway, assigns that result to `attemptPacket`, and sends `attemptPacket.messages` on the next HTTP request. The original request remains correct in the recorder while the provider receives the wrong repair prompt under the unchanged `contractHash`. The value pin, both seeder dataflow checks, schema/prompt agreement checks, and the new boundary test are all independent of that callback result. This is the same material failure—fingerprinted contract A, evaluator packet B—on an existing execution path.

The shipped code is correct on static inspection: `buildSchemaRepairPacket` appends one user message to the original packet and therefore preserves the leading `EVALUATOR_CONTRACT_TEXT`. The defect is that the post-cap test change does not enforce that existing repair path, even though enforcement of what is sent is the outcome B1 and V authorized.

**Required fix ·** Exercise at least two evaluator attempts through the real runner and HTTP gateway: return schema-invalid evaluator content first and valid content second, retain the inbound `/chat/completions` bodies, and assert that every evaluator attempt begins with `EVALUATOR_CONTRACT_TEXT`. Keep the initial-packet assertion if desired, but do not treat the outer `ProviderCallRequest` as observation of the repair packet created inside the gateway. A narrower acceptable composition is to invoke and assert the captured evaluator `buildRepairPacket` plus retain the provider-level proof that callback output is the next wire body. Do not restore source-text predicates.

## Review answers

1. **B1 is not closed for every provider attempt.** Repository search finds one runner `role: "EVALUATOR"` call site, and every synthesis round reuses it. The present repair helper preserves the constant, but the replacement test observes only the initial request and leaves the repair-only mismatch above green.
2. **The recorder does observe the real gateway selected by this run.** `WalkingSkeletonRunner` stores the constructor gateway in `#configuredMakers`; `runnerSettings().synthesisRolePolicy.evaluatorRoleRef` selects that same `provider:test-layer`; `resolveSynthesisRoleMaker` returns its injected wrapper. The runner class does not construct another provider. Construction of `OpenAICompatibleProviderGateway` occurs in `createPostgresProviderGateway`, outside the runner, and is the recorder's `inner`. The missing observation is below the wrapper, not beside it.
3. **“Exactly one system message, and it leads” is valid for the current initial packet but stronger than B1 requires.** AMENDMENT 5 explicitly allowed sole *or* first. A future approved repair packet may add instructions after the contract without displacing it; the durable invariant is that the exported contract is the leading system instruction on every attempt. The present exact-one assertion is not a current blocker, but it must not substitute for checking repair attempts.
4. **The deleted predicates did carry source-shape checks that the new test does not:** one named definition, no copied evaluator literal in a system-message spelling, one conformance initializer per seeder, and exact import binding. The current tree satisfies the underlying structure: one prompt literal/definition, one evaluator call site, and both seeders import and digest it. The old predicates did not robustly enforce those semantics and rejected correct forms, so their deletion is sound and a dormant duplicate is not itself a wrong provider outcome. The behavioral replacement must instead cover every path that can send; the repair-path portion is B1 above. No separate follow-up ticket is warranted for restoring a textual uniqueness proxy.
5. **Suite arithmetic and failure identity reconcile.** Base is `13 failed | 1505 passed (1518)`. r4 was `13 failed | 1533 passed (1546)`. r5 is three complete runs of `13 failed | 1529 passed (1542)`: four unit predicates removed, with one integration test added outside the cluster, hence +24 cluster passes versus base. Fresh extraction from all three retained logs gives the same 13 unique names and md5 `9c28c8f4a3d1c891b78141b73e0aad76`; the base artifact has that same name set and hash. `F-SEALEDROWS-H` is also present as `X | X | X` in T0's stable-red authority and is correctly disposed rather than charged again.
6. **The amendment and recovery were sound.** AMENDMENT 5 isolated B1, named the behavioral boundary, prohibited another text proxy, preserved the already-closed work, and told the seat to stop rather than approximate. The recovery supplied the missing measured facts—no existing unit route, an editable integration HTTP seam, and a small measured file cost—without broadening authority; `database.test.ts` was already allowed. The chosen integration route was therefore legitimate even though the final assertion stopped one layer above repair attempts.

## Packet audit

The recovery was proportionate and technically sound. Its referenced server callback at the integration provider double already receives each HTTP body, so it was a valid route to observe both initial and repaired wire packets. The retained full-file artifact later took 21.64 seconds for 85 tests rather than the recovery's earlier 12 seconds for 84, but that variance does not invalidate the routing or cost conclusion.

There is **one packet defect not previously charged**: the packet says the test asserts that “the contract hash travelling with it is the sealed one.” At `database.test.ts:4153` it actually compares against `runnerSettings().conformanceContractHash`, whose fixture value is the synthetic string `contract:conformance:test-layer`, not sha256 `2364b1b5…`. This assertion usefully proves that the runner forwards the conformance-hash settings field; the separate seeder/value tests prove the production digest relationship. Calling the integration assertion itself a check of the sealed hash overstates its artifact. It does not create another worker blocker.

I found no other uncharged packet defect. The packet's r5 diff counts, untouched runner-index claim, counterexample/refactor outcomes, cluster arithmetic, and known-red disposition all match the retained artifacts and tree.

## Not verified

- No fresh Vitest, database, migration, typecheck, or full `pnpm test` run; this was a static review. I inspected the complete retained logs and independently re-extracted their summaries, failure-name sets, and hashes.
- The repair-only mutant was not applied to the worktree. Its survival is derived from the test's `maxAttempts: 1`, its valid first evaluator response, the recorder's outer-call location, and the provider loop's explicit callback/send control flow.
- Other integration files, acceptance database suites, a deployed register value, and the full seed→preflight→serve chain.
- Whether a future second system message would be legitimate product policy; only the distinction between the required leading contract and the test's stricter current shape was assessed.

## PREDICTIONS

1. A lens that equates `ProviderGateway.call(request)` with every downstream HTTP attempt will approve and miss that `buildRepairPacket` creates a new packet inside the wrapped gateway.
2. A repair-only mutant will leave the new test at `1 passed | 84 skipped` because the fixture permits exactly one attempt and returns a valid evaluator response immediately.
3. Extending `startProviderDouble` to retain request bodies and forcing one evaluator schema failure will expose the gap without touching production code.
4. The synthetic fixture hash will continue to be described as the sealed digest unless reports distinguish “settings-field forwarding” from “digest/value identity.”

MERGEABLE: no — the initial evaluator request is protected, but an existing repair attempt can still send a non-constant evaluator system prompt without turning the replacement B1 test red.
