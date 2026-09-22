# REV1 preparation — frozen server/interface trace

Status: **PREPARATION COMPLETE; FINAL VERDICT DEFERRED**

Reviewer: Sol session `/root/plan_review`  
Ticket: `t_2d2d5043`  
Frozen pre-UI revision: `58fbaa7d5535dad89b479b98776cf2b8e88b978e`  
Base revision: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`  
Date: 2026-09-14

This is the bounded CORPREP trace requested before UI/GATE. It is not a final correctness verdict. It reuses the accepted planning and editorial review and does not re-audit article content.

## Frozen composition trace

1. `apps/api/src/main.ts` loads the reviewed corpus, creates one in-memory snapshot lookup, gives that lookup to the answer service, and exposes a lookup closure to the HTTP application.
2. Session creation stores the knowledge status version. On each message, `apps/api/src/support/index.ts` asks the application knowledge port for the stored version before persistent admission. A miss returns exactly HTTP 409 `{ error: "SUPPORT_KB_SNAPSHOT_UNAVAILABLE", restart_session: true }` before admission, model work or message writes.
3. `apps/api/src/support/answer.ts` selects entries from its snapshot lookup, builds the compact policy/catalog plus whole lexical article sections, requires strict structured JSON, validates cited sources and requested action IDs, screens text, and replaces a rejected completion with server-authored `REFUSE_SAFETY`.
4. Accepted and replaced model replies use the assistant `SupportMessageCipherPort.write` return record as the HTTP text. Sources come from selected reviewed entries; action IDs are resolved through the closed server catalog with signed-in state. Forgot-password guidance likewise returns the assistant write record's text and currently resolves no action.
5. The route evaluates post-answer escalation using the canonical outcome. The metrics and rating paths exclude model-output `REFUSE_SAFETY` from grounded resolution and rating eligibility; successful screened relay transport keeps recorded usage and available relay health.

## Candidate C1 — composed context cap contradicts CP1-R11

Severity for final disposition: **blocker candidate**.

CP1-R11 and `PLAN.md` step 7 specify the approved initial **24,000-code-point system cap**. At the frozen revision, `apps/api/src/support/answer.ts:23` defines `MAX_SYSTEM_CODE_POINTS = 12_000`; the structured branch at line 191 passes only `MAX_SYSTEM_CODE_POINTS - 800` (11,200) to `buildSupportKnowledgeContext`, and `boundedStructuredSystem` then slices the whole prompt back to 12,000.

This is not protected by the existing context helper tests. `tests/unit/support-context.test.ts` supplies 24,000 directly, while no inspected answer-service oracle asserts the cap used in the actual model request. A long but valid reviewed section can therefore be omitted around 11,200 code points even though the frozen requirement sets the initial composed ceiling at 24,000.

Required final probe: at the integrated revision, drive `createSupportAnswerService` with enough matching whole sections to cross 12,000 but remain below the approved 24,000 ceiling; capture the model `system` request and prove the composed value uses the approved ceiling without clipping a section. If the implementation changes the constant, retain a regression oracle through the answer service rather than only the context helper.

## Candidate C2 — route snapshot object is resolved, then discarded

Severity for final disposition: **contract-gap candidate; production behavior currently coherent**.

CP1-R10 says message handling resolves the stored version and passes the matching immutable snapshot to the answer service. The route resolves `knowledgeSnapshot` at `apps/api/src/support/index.ts:360-367`, but uses it only as a presence guard. It passes `kbVersion` at lines 759-768; `apps/api/src/support/answer.ts:180-183` performs a second lookup through its separately configured `snapshots` port.

At the frozen production composition both closures share the same immutable map, so the inspected `main.ts` does not expose a live mismatch. The interface nevertheless permits the route lookup and answer lookup to disagree, and the resolved object is not the value conveyed across the boundary described by R10.

Required final probe: inspect any changed composition after UI/GATE. Prefer passing the already-resolved immutable snapshot into `respond` and asserting object/version identity. If the dual lookup is retained, add an interface-level oracle that deliberately supplies divergent lookups and defines the required fail-closed result before admission or persistence.

## Candidate C3 — trusted dynamic debate actions have no answer adapter

Severity for final disposition: **expectation/probe need; safe current behavior**.

`packages/support-kb/src/navigation.ts` correctly requires `ownerDebateId` or `publicDebateRef` for the dynamic owner/public actions, and its unit tests prove signed-in state alone cannot resolve them. The catalog/context can request those two action IDs, but `SupportAnswerPort.respond` accepts only `signedIn`; the route passes no trusted debate projection, and the answer service calls the resolver with only signed-in state and language. Dynamic actions are consequently always dropped from grounded answers.

That fail-closed behavior satisfies the negative security property. The frozen evidence does not say whether CP1 intends those two actions to remain unavailable in generic support replies or expects a trusted projection adapter. Final REV1 should classify the behavior using the integrated request/UI design. If reachability is intended, add a server-side projection input and an end-to-end oracle proving a valid trusted ID resolves while a guessed/user/model value cannot.

## Oracle coverage retained for final REV1

- Snapshot ordering: route integration asserts the exact 409 body and zero calls to admission, answer and message write. NAV mutation evidence says disabling the guard fails one targeted test.
- Canonical storage/HTTP equality: route integration reads decrypted assistant storage for accepted and replaced drafts and compares it to HTTP; Forgot guidance uses an adversarial write port that changes assistant text. NAV mutation evidence says bypassing the canonical return fails two targeted tests.
- Response policy: unit cases cover raw/malformed/oversized JSON, unknown keys, URLs/paths, Markdown, HTML, EN/RO credential requests, grouped/control-obfuscated codes, secret echo, false reset claims, forged sources/actions, missing sources and duplicate sources.
- Canonical effects: integration/unit evidence covers rejected-content absence, one model attempt, retained usage, available relay state, no rating, no grounded-resolution contribution, no E2/E6 contribution and preserved immediate E1.
- Navigation: resolver unit cases cover signed-out/public behavior, trusted dynamic UUIDs, signed-in-without-owner proof, unknown/unresolved actions, malformed/external/token-like identifiers, deduplication and immutability.
- Knowledge projection: helper tests cover the complete policy/catalog, lexical reachability without `INTENT_SIGNALS`, language isolation, whole-section skip and three-source/action maxima. They do not cover the answer-service cap drift in C1.

## Final-review boundary

REV1 should resume from these notes and inspect only post-`58fbaa7d5535dad89b479b98776cf2b8e88b978e` dependency changes, UI response/state handling, final GATE evidence, and the three candidates above. Full source, KB article and preview-stack re-audits are unnecessary unless changed evidence invalidates their receipts.

The Forgot password destination and click path remain **UNVERIFIED**. CORPREP ran no tests, builds, services, browsers, providers or databases and issues no PASS claim.
