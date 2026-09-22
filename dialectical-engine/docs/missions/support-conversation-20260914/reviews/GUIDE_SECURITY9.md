# GUIDE_SECURITY9 — terminal immutable-lock security recheck

## Verdict

**PASS** for the finite GS8-1/GS8-2 correction at `152eed4da1cd3e66b74d8301159ba76427552409` (base `78988fc2e5e24595bd9cd6ec0a3965c6039dc718`). Each previously unsafe member now treats an existing immutable `LOCK` event as authoritative while the admitted threshold refusal still reaches encrypted storage. No new security finding was found in this exact four-path delta.

## GS8-1 disposition — resolved

- **Manual escalation:** default `read` now returns derived `LOCKED` from the event, and the route returns the existing typed 429 before opening a case (`apps/api/src/support/index.ts:683-699`).
- **Human rating:** default `read` produces the same derived state and the route returns 429 before inserting a rating or evaluating E1 (`apps/api/src/support/index.ts:646-669`).
- **Direct rating adapter:** `rateMessage` holds the session-row lock and inserts only when physical state is `OPEN` and no `LOCK` event exists (`packages/db/src/support.ts:509-529`). This closes the direct-call and read/rate race.
- **Direct case adapters:** both `createCaseOnce` and `createCase` hold the parent-session lock and reject an existing `LOCK` event before preparing key material, snapshots, or case rows (`packages/db/src/support.ts:672-690` and `768-789`). This closes the direct-call and route/read race.

The focused actual-repository GREEN covers both case producers and proves zero case rows. The route GREEN locks at threshold 3, raises the threshold to 4, then observes typed 429 for rating, manual escalation, and a later message with unchanged rating/case counts. Those are author-captured results. The preserved RED is meaningful: before producer edits, direct `createCaseOnce` opened; the corrected route RED observed read `OPEN`, statuses `200/201/200`, one new rating, and two new cases. The initial combined RED also contained a test-only configuration-name `ReferenceError`; that failure is retained separately and is not used as security proof.

## GS8-2 disposition — resolved

- **Read with a threshold:** `read` checks `EXISTS LOCK` before its legacy current-count/current-threshold fallback (`packages/db/src/support.ts:284-308`). A later threshold increase cannot reopen the event-locked session.
- **Default read:** the event check is independent of the optional threshold argument, so rating and manual-escalation reads also return `LOCKED`.
- **Admission:** after the existing owner/IP and session serialization, `admitMessage` selects the event-lock bit and rejects it before quota mutation or route/model work (`packages/db/src/support.ts:330-368`). The current injection count remains a fallback for older/no-event threshold conditions.
- **Status and cooldown:** unchanged event consumers remain consistent. Status excludes any event-locked session from `openSessions`; IP cooldown continues to use recent `LOCK` events.

The threshold injection itself remains admitted: the unchanged transaction writes admission evidence, `INJECTION`, then `LOCK`, and returns `ADMITTED` (`packages/db/src/support.ts:404-425`). The route can therefore persist the user and deterministic assistant refusal after the transaction. The retained actual restricted-role control proves three refusals produce six encrypted message rows, one `LOCK`, zero model transit, physical `OPEN`, derived `LOCKED`, and a rejected fourth message. Leaving message ciphertext storage keyed to physical `OPEN` is intentional for this already-admitted threshold response; subsequent public requests stop at admission.

## Retained boundaries

- The delta is exactly `apps/api/src/support/index.ts`, `packages/db/src/support.ts`, `tests/integration/support-routes.test.ts`, and `tests/integration/support-cases.test.ts`. It contains no migration, grant, revoke, role, security-definer helper, mutable state update, or new authority.
- Serialized/concurrent threshold admission, hashed abuse evidence, encrypted refusal storage, no-model injection refusal, rate limits, cooldown, status accounting, ordinary open-session feedback, and normal human handoff remain intact. Existing concurrent third/fourth admission still shares the same transaction and session lock.
- The migrations tree, support port, main composition, classifier, response policy, escalation policy, answer sink, public context, development-principal declaration, architecture assertion, principal tests, metrics test, and evaluator are byte-identical to the reviewed base. The declared principal count remains 11 and the prior source-derived cardinality correction is retained.
- Prior privacy, source, action, credential/injection no-model, and public-only dispositions are retained only for those exact unchanged defining objects.

## Evidence and limits

Static custody matched 67/67 indexed inputs, all four author-manifest product files, the exact four-path delta, and 13 selected unchanged defining objects. The clean detached revision was verified; no dependency links or fixtures were created.

The author reports focused 2/2, affected five-file 225/225, final 34-file 1,701 passing tests plus one TODO, and a fresh controlled structural evaluation of 60/60 in each of three runs with the independent quality rubric still `PENDING`. I did not reacquire the heavy lease or rerun those checks because the final source, meaningful RED/GREEN repository coverage, and sealed logs establish the required facts. These counts remain attributed to the author.

This review used no HTTP server, database, browser, model provider, account/recovery operation, private record, or private runtime log. It does not attribute LIVE6's unobserved first exception, complete actual54, prove arbitrary future callers, assert readiness, or accept the checkpoint. The owner-confirmed Forgot destination remains unresolved and actionless.
