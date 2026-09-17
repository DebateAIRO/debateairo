CODEX REVIEW SEALEDROWS r5 — CHANGES · comments read through: sealedrows-postcap-2026-09-04

# SEALEDROWS CODEX r5 — reviewer self-case

Finding counts: **1 BLOCKING (→ V) · 0 FOLLOW-UP (→ ticket) · 1 new packet defect**.

## Outcome

`CHANGES`, high confidence. The post-cap change genuinely deletes the comment-defeatable whitelist and observes the real initial evaluator request through the gateway injected into `WalkingSkeletonRunner`. The remaining failure is narrower and one layer lower: the HTTP gateway manufactures the content-repair packet after the recorder delegates, while the new fixture permits only one successful attempt. The test therefore cannot see a repair prompt that diverges from the fingerprinted constant.

## Finding

### B1 · Repair-attempt prompt identity remains unenforced — **BLOCKING (→ V)**

**File/line ·** `dialectical-engine/tests/integration/database.test.ts:105-113,604-618,4121-4153`; `dialectical-engine/apps/runner/src/index.ts:1287-1293,4153-4169`; `dialectical-engine/packages/providers/src/index.ts:323-350,405-439`.

**Input → wrong outcome ·** Make the evaluator `buildRepairPacket` return a different system contract. The test's evaluator answers correctly on attempt 1 and `maxAttempts` is 1, so the callback is never invoked. The recorder retains only the outer request's original packet. On a real schema rejection, the inner gateway invokes the callback and sends its result as the next HTTP body's `messages`, producing hashed A / sent B while every retained B1 assertion stays green.

**Required fix ·** Force an evaluator schema rejection and inspect both actual HTTP request bodies, asserting the exported contract leads every attempt. Alternatively assert the captured callback's output and compose that with a provider-level wire test. Preserve the behavioral approach and do not restore source matching.

## Why this classification is not a moving target

Codex r4 asked for the request at the provider boundary because source form was not the property. The new wrapper is the correct seam for the first packet. But `ProviderCallRequest` deliberately contains `buildRepairPacket`, and the provider implementation deliberately sends the callback's returned `PromptPacket`, not `request.packet`, after content rejection. The repository already has this second packet path; it is not a speculative future refactor. B1 says the evaluator prompt fingerprinted is the prompt actually sent, so leaving that extant path outside the behavioral assertion is material.

The current implementation itself is sound: `buildSchemaRepairPacket` appends a user message to the captured base packet. Static correctness is not enough for this lane because the authorized deliverable was the enforcement test that prevents the quiet mismatch from returning.

## What I checked

- `ProviderGateway` is a one-method interface, and the wrapper is the configured primary gateway stored in `#configuredMakers`.
- The fixture's evaluator role ref resolves to the wrapper; `WalkingSkeletonRunner` constructs no provider internally.
- There is one runner evaluator call site. Later synthesis rounds reuse it.
- Transport retries reuse the existing packet; content rejections alone replace `attemptPacket` with `buildRepairPacket(...)` output.
- The current repair helper preserves the constant by appending a user message.
- The new test uses one allowed conformance attempt and a first-response success, so repair is unreachable.
- The present tree has one evaluator prompt literal/definition, one evaluator call site, and both seeders digest the import. The deleted textual predicates carried some of those shape checks, but were not sound enough to restore and do not change the repair verdict.
- All three r5 cluster artifacts are complete and identical at `13 failed | 1529 passed (1542)`. Independent extraction gives 13 names and md5 `9c28c8f4a3d1c891b78141b73e0aad76`, equal to the base artifact.
- The +24 cluster delta is exact: r4's 1546 total loses four deleted unit predicates; the replacement is in integration.
- `a8b99532` is clean, both requested diff ranges pass `git diff --check`, the runner-index r4..r5 diff is empty, and both precommit-manifest hashes equal the committed blobs.
- The integration lifecycle failure is `X | X | X` at `t00-baseline.md:196` and now has `F-SEALEDROWS-H`; it is not charged to this lane.

## What I nearly got wrong

- I initially treated the wrapper as if it observed the external wire. Reading `OpenAICompatibleProviderGateway.call` showed the distinction: the wrapper sees one request object, while the inner gateway can send multiple `attemptPacket` values.
- I nearly made the lack of a source-level “one literal” assertion a second blocker. The old checks were form whitelists, the present structure is correct, and a dormant duplicate alone is not a provider mismatch. The material lost behavior is the extant repair send, already captured by B1.
- I considered “exactly one system message” itself blocking. AMENDMENT 5 allowed sole or first, and the current initial packet legitimately has one. The durable contract should still be phrased as the exported value leading every attempt so an approved later repair instruction is not rejected accidentally.
- I nearly accepted the packet's phrase “sealed hash” literally. The integration fixture asserts forwarding of `contract:conformance:test-layer`; the actual sha256 relationship is proven elsewhere.

## Packet audit

AMENDMENT 5 was clear and sound: it narrowed authority, named closed work, prohibited another lexical proxy, and offered an honest stop. The recovery was also sound. `database.test.ts` was already allowed, there was no existing unit entry to the private runner closure, and the provider double's server callback was a real per-HTTP-request observation point. Giving the measured route and cost was useful coordination, not an expansion of scope.

The one new packet defect is evidentiary wording: `database.test.ts:4153` does not prove the transmitted hash is the production sealed sha256; it proves that the evaluator request carries the fixture's configured conformance hash. Seeder/value tests supply the separate sealed-digest proof. No other uncharged packet defect survived the artifact check.

## Not verified

- No fresh test or database run; retained artifacts and static control flow were used as required.
- The repair mutant was not applied or executed.
- Full-suite state, other integration files, deployed rows, and the end-to-end production register reader.
- The original recovery message outside the packet/report record; its substance was audited from the r5 packet and the seat's retained self-report.

## PREDICTIONS

1. The phrase “exact provider boundary” will hide the outer-request/inner-attempt distinction for at least one reviewer.
2. A two-attempt evaluator fixture will make the correct assertion shape obvious: the constant must lead both wire bodies, while the repair message may follow it.
3. Restoring a no-literal regex would reintroduce the same false-positive/false-negative class and still would not prove callback output reaches the wire correctly.
4. V will have to choose between accepting static repair correctness and requiring the behavioral guarantee it authorized; under the packet's stated central claim, the latter is the consistent choice.

MERGEABLE: no — the post-cap test closes the initial-call bypass but not the existing content-repair send path.
