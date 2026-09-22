# GUIDE_CORRECTNESS8 — restricted-role lock correction review

**Reviewer:** Sol (`/root/plan_review`)  
**Ticket:** `t_769ab051`  
**Revision:** `78988fc2e5e24595bd9cd6ec0a3965c6039dc718`  
**Delta base:** `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`  
**Verdict:** **PASS for the finite nine-path correction**

## Dispositions

- **Restricted-role refusal path — PASS.** The route now performs the only lock transition inside the serialized `admitMessage` transaction: it records `INJECTION`, inserts one threshold `LOCK`, then returns `ADMITTED` (`packages/db/src/support.ts:306-417`). The refusal branch writes both encrypted messages and replies without a second database mutation (`apps/api/src/support/index.ts:328-353,441-470`). `finalizeInjectionLock` is absent from the port, route, production composition, repository, and eval composition.
- **Real supported principal regression — PASS.** The new test provisions the declared principals, opens `SUPPORT_DATABASE_URL`, and binds the real session, message, and status repositories to that restricted pool (`tests/integration/support-routes.test.ts:1614-1652`). Its synthetic wrapper only counts model transit while forwarding every message operation to the real cipher/repository. It proves the first Romanian injection returns HTTP 200, stores two messages plus one `INJECTION`, reaches three refusals without model transit, stores one `LOCK` while physical state remains `OPEN`, exposes derived `LOCKED`, and refuses the fourth request with 429 without another message (`:1653-1703`). The indexed RED at the base failed the same HTTP-200 assertion with actual HTTP 500, so this regression distinguishes the removed forbidden update.
- **Immutable lock/read/admission semantics — PASS.** Public read derives `LOCKED` from the immutable injection count (`packages/db/src/support.ts:284-304`); later admission rejects at the same configured count under the session lock (`:325-357`); the threshold transaction writes `INJECTION` and `LOCK` atomically (`:394-415`). Existing tests also pass the three-then-fourth sequence, concurrent third/fourth serialization, configured threshold, two-lock IP cooldown, and safe later-429 evidence paths (`tests/integration/support-routes.test.ts:1760-1856,1914-2009`).
- **Status and physical lifecycle — PASS.** `openSessions` excludes event-locked sessions (`packages/db/src/support.ts:1983-1987`), and the metric control observes five open sessions from six physical `OPEN` rows when one has `LOCK` (`tests/integration/support-metrics.test.ts:13-108`). Message writes and both case constructors still gate on the unchanged physical lifecycle row, so the threshold refusal can be stored and case/handoff semantics did not acquire event-lock behavior (`packages/db/src/support.ts:542-581,657-724,749-799`). Case sources and migrations are byte-unchanged across the correction.
- **Privilege boundary — PASS.** The architecture control rejects any `UPDATE support.session SET state='LOCKED'` and any remaining finalizer (`tests/architecture/sup-01-boundary.test.ts:176-190`). The principal suite still proves that granting `UPDATE(state)` makes startup attestation fail (`tests/integration/dev-database-principals.test.ts:243-275`). No migration or privilege/provisioning source changed.
- **Stale principal-count assertions — PASS.** `apps/runner/src/dev-database-principals.ts` is byte-identical at base and final (SHA-256 `7d68dd8a2e826ea1da9d8d2fa2555a3458e088710426b8cba3e6cd4f6bb690e8`) and declares 11 principals. The changed assertions derive role, password, file, upgrade, and CLI cardinalities from `DEVELOPMENT_DATABASE_PRINCIPALS.length`; the exact membership equality remains source-derived (`tests/integration/dev-database-principals.test.ts:88-180`). This corrects stale fixture literals without lowering or changing membership.
- **Prior guide correctness — RETAINED PASS.** Catalog, navigation, source/fallback, recovery, answer, article, migration, and case-source defining bytes are unchanged from GUIDE_CORRECTNESS7. Its finite navigation/source dispositions therefore remain applicable; no broad language or corpus claim is added.

## Verification

- Custody: rc `0`; 53/53 indexed inputs and 144/144 frozen product files matched in each lane; exact nine declared delta paths matched.
- Scoped database frame: rc `0`; 4/4 files and 191/191 tests passed under `TSX_DISABLE_CACHE=1` and `--maxWorkers=1`.
- Independent discriminator: not run. The authored frame already executes the implicated real restricted pool and separately covers first refusal, threshold, concurrency, configured limit, later 429, metric, privilege, and cardinality boundaries.
- Retained author evidence: final 34-file frame 1,699 passed plus one TODO; typecheck retained 76 byte-identical inherited diagnostics with zero mission additions; structural evaluation 3×60/60 with rubric `PENDING`; strict 44-entry reviewed snapshot retained.

## Custody and cleanup

- Freeze `fba5c54c8e0e70d75f957518273fb19d984357e9`; packet SHA-256 `74949d0d19a4f5c874404779a55094a5c65339535bddde1961d683211ddff7ee`.
- Detached reviewer and frozen primary both remained clean and exact at `78988fc2e5e24595bd9cd6ec0a3965c6039dc718`.
- All five temporary dependency links are absent. The heavy lease was released before report packaging.

## Limits

LIVE6's HTTP 500 remains a failed retained observation whose first exception was not captured; this review does not retrospectively attribute it. No full 34-file suite, typecheck, evaluation, browser, preview, actual Support/model/status/capacity request, or broad corpus/language audit was run. Full actual 54-row verification remains required. Forgot-password remains unresolved and actionless; CP2 remains gated. This PASS is not runtime readiness, checkpoint acceptance, owner acceptance, or a claim that prior partial captures succeeded.

