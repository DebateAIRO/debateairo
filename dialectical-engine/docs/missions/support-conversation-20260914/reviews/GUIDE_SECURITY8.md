# GUIDE_SECURITY8 — restricted-role correction security review

## Verdict

**REWORK** for the exact nine-path correction at `78988fc2e5e24595bd9cd6ec0a3965c6039dc718` (base `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`). The restricted-role failure is removed without widening database privileges, but the replacement representation of a locked session is not consumed consistently. Two downstream classes can treat a session with an immutable `LOCK` event as open.

## Findings

### GS8-1 — event-locked sessions can still open a human case

The before/after matters. Immutable `INJECTION` and threshold `LOCK` insertion already occurred inside serialized admission at the base and remains unchanged in `packages/db/src/support.ts:325-415`. The correction removes the later `finalizeInjectionLock` call and its forbidden `UPDATE support.session SET state='LOCKED'`; it does not newly move the lock decision into admission. The final restricted-role regression explicitly demonstrates the resulting representation: after three injections, one `LOCK` event exists, the physical session row is still `OPEN`, a threshold-aware GET returns derived `LOCKED`, and a fourth message is rejected (`tests/integration/support-routes.test.ts:1641-1703`).

Two case-opening paths do not use that derived state:

- Manual escalation reads the session without `lockAfterInjections` and immediately opens E1 (`apps/api/src/support/index.ts:675-708`).
- A `human` rating also reads without the threshold, records the rating without a state/LOCK predicate, and opens E1 (`apps/api/src/support/index.ts:631-671`; `packages/db/src/support.ts:499-520`).

Both case repository entry points authorize creation using only `parent.state === "OPEN"` (`packages/db/src/support.ts:657-671` and `749-766`). At the base, the removed finalizer made that physical guard fail after threshold lock. At the final revision, the same event-locked session satisfies it. A holder of the session capability can therefore create a human-support case after the abuse lock. This proves a human-case boundary bypass; it does not prove private-data access, account action, or model execution.

Required RED regression: create a session, record injections through the configured threshold, prove one immutable `LOCK` event and physical `OPEN`, then assert both `POST /v1/support/sessions/:id/escalate` and a `human` rating on an eligible prior answer cannot create a case. The invariant belongs at the case producer boundary as well as the routes: neither `createCaseOnce` nor `createCase` may accept a parent with an existing `LOCK` event. This keeps direct adapters and future routes safe without restoring the forbidden mutable update.

### GS8-2 — a later threshold increase reopens an immutable lock

`read` derives `LOCKED` only when the current injection count meets the caller's current `lockAfterInjections` (`packages/db/src/support.ts:284-303`). `admitMessage` likewise rejects only a non-`OPEN` physical state or a current count at least equal to the current threshold (`packages/db/src/support.ts:334-358`). Neither consumes an existing `LOCK` event.

Counterexample: a session reaches threshold 3 and records its immutable `LOCK`; configuration later increases the threshold to 4. The physical state is still `OPEN`, so threshold-aware read reports `OPEN` and admission accepts another request. A benign accepted request can proceed to the public model path. At the same time, status excludes the session because it checks any `LOCK` event (`packages/db/src/support.ts:1983-1987`), and IP cooldown continues to consume recent `LOCK` events (`packages/db/src/support.ts:428-455`). The consumers therefore disagree about whether the same immutable event remains effective.

Required RED regression: lock at one configured threshold, increase the threshold, and assert read remains `LOCKED`, message admission remains denied before model transit, status excludes the session, both case-opening surfaces remain denied, and cooldown behavior remains unchanged. The minimum invariant is: threshold controls creation of the first immutable `LOCK`; once present, that event is terminal for session read, admission, and case creation regardless of later configuration.

## Minimum correction boundary

- **Production:** `packages/db/src/support.ts` must make an existing `LOCK` event authoritative in `read`, `admitMessage`, `rateMessage`, `createCaseOnce`, and `createCase`. `apps/api/src/support/index.ts` must turn derived/event-locked results from the manual-escalation and human-rating routes into a safe refusal before attempting case creation. No migration, grant, role, security-definer helper, or physical `support.session.state` update is needed.
- **GS8-1 regression:** `tests/integration/support-routes.test.ts` should cover both manual escalation and `human` rating after an actual threshold lock, including zero case rows and a non-500 refusal. `tests/integration/support-cases.test.ts` should cover both repository entry points against a physical-`OPEN` parent carrying a `LOCK` event, so a future adapter cannot bypass the route check.
- **GS8-2 regression:** `tests/integration/support-routes.test.ts` should lock at threshold N, raise the live configuration to N+1, then prove GET remains derived `LOCKED`, a subsequent benign message is refused before model transit, rating/manual escalation cannot create a case, and the physical state remains `OPEN`. `tests/integration/support-metrics.test.ts` needs no production change; its existing event-based exclusion is the retained status control.

## Other dispositions

- **Restricted role / privilege boundary:** no migration, grant, revoke, role, security-definer, or privileged-helper change appears in the nine-path delta. The migrations tree is identical at base/final object `3038f703377f79ca7012e6d5ce72a644f47f6d55`; the development-principal declaration is identical at object `31f1d4e0070d3347447a07bb835d3e52db976be3`. The author-captured RED remains HTTP 500 with its first exception unobserved; no retrospective exception attribution is made. The author-captured restricted-role GREEN proves the fixed refusal path with the actual restricted role, zero model transit, encrypted message storage, hashed injection/LOCK evidence, derived lock, and later message denial. These are author results, not independently re-executed here.
- **Serialized admission and evidence:** the correction does not alter `admitMessage` or `admitIpSession`; serialized owner/IP/session locking, configured threshold event creation, hashed abuse evidence, encrypted refusal storage, no-model deterministic refusal, and IP cooldown remain as implemented at the base. GS8-2 concerns how the recorded event is later consumed.
- **Status:** the new query correctly excludes every session having a `LOCK` event from `openSessions`. Its event-based rule is stronger than read/admission and exposes GS8-2's inconsistency.
- **Principal cardinality:** the declaration contains 11 principals at both revisions. The only production declaration object is unchanged. The test replaces stale literal counts with `DEVELOPMENT_DATABASE_PRINCIPALS.length`; it does not lower membership, password uniqueness, direct-role, output, upgrade, or suffix-append assertions. The author receipt preserves the initial five stale-count failures after 186 passes and the remaining password-cardinality failure after 15 passes.
- **Retained public/privacy boundaries:** classifier object `26a06aa385b8cf3d532775cad49f5fc9cec2e618`, response policy `dfa153786307717d4c7c2c19b8c8ba53ff4c61fe`, escalation policy `e928751b9338f0c0171eda6edb435e88aab7151d`, public context `a1a830ee29b0cef55f4b4f0412d7f460efd4382b`, and answer sink `51cd5d46d5487a58aa37a296d18e082126e1f643` are identical at base and final. Prior public-only, closed-source, action, private-record, redaction, credential/injection no-model, accounting, and recovery dispositions are retained only to that exact byte boundary. The changed route lifecycle receives the REWORK above.

## Evidence and limits

Static custody matched 55/55 indexed inputs, the clean detached revision, and exactly nine changed paths. Seven selected defining Git objects matched base/final; all nine final product files matched the author manifest. No heavy lease was acquired, no tests were executed independently, and no dependency links or fixtures were created. The author reports 34/34 files, 1699 passing tests plus one TODO, and the focused restricted-role GREEN; those counts remain attributed to the author.

This review used no HTTP server, database, browser, model provider, account/recovery operation, private record, or runtime log. It does not attribute LIVE6's unobserved first exception, prove arbitrary-language completeness, complete the required actual54 frame, assert readiness, or accept the checkpoint. The owner-confirmed Forgot destination remains unresolved and actionless.
