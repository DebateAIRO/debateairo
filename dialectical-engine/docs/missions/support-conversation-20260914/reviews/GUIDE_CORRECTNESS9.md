# GUIDE_CORRECTNESS9 — terminal event-lock consumer review

**Reviewer:** Sol (`/root/plan_review`)  
**Ticket:** `t_5a730bc3`  
**Revision:** `152eed4da1cd3e66b74d8301159ba76427552409`  
**Delta base:** `78988fc2e5e24595bd9cd6ec0a3965c6039dc718`  
**Verdict:** **PASS for the finite four-file correction**

## Dispositions

- **GS8-1 manual and human-rating case bypass — RESOLVED.** Default session read now derives `LOCKED` from any recorded `LOCK`, independent of a caller-supplied threshold (`packages/db/src/support.ts:284-308`). The rating and manual-escalation routes return the existing typed 429 before rating or case work (`apps/api/src/support/index.ts:631-690`). `rateMessage` independently requires physical `OPEN` and no `LOCK` (`packages/db/src/support.ts:502-535`), while both `createCaseOnce` and `createCase` reject a physical-`OPEN` parent carrying `LOCK` under the session advisory lock (`:672-743,768-820`).
- **GS8-1 route and direct-producer evidence — PASS.** The corrected route regression creates an eligible answer, reaches the actual threshold, then proves a human rating and manual escalation both return 429 with `RATE_LIMITED`, with rating and case counts unchanged (`tests/integration/support-routes.test.ts:1795-1853`). The case suite inserts `LOCK` beside physical `OPEN`, invokes both repositories directly, observes `SUPPORT_CASE_PARENT_INVALID`, and verifies zero case rows (`tests/integration/support-cases.test.ts:69-99`). Existing open-session rating, manual escalation, and concurrent case controls passed in the same five-suite frame.
- **GS8-2 threshold increase reopening — RESOLVED.** `admitMessage` now reads an event-lock boolean inside its serialized transaction and returns `LOCKED` before quota/admission mutation regardless of the current threshold (`packages/db/src/support.ts:330-368`). The route regression locks at three, raises configuration to four, then observes derived `LOCKED` and 429 from rating, manual escalation, and a benign message, with no rating/case side effects (`tests/integration/support-routes.test.ts:1795-1853`).
- **Independent terminal-consumer control — PASS.** A direct repository probe first proves an ordinary open-session rating succeeds. After inserting one immutable `LOCK`, default read and read with threshold 99 both return `LOCKED`; admission with threshold 99 returns `LOCKED`; direct human `rateMessage` returns null and leaves the single positive-control rating unchanged. This closes the direct-rating oracle gap left by route short-circuiting.
- **Threshold refusal and established lock behavior — RETAINED PASS.** The threshold admission still records immutable `INJECTION`/`LOCK` and returns `ADMITTED`, allowing the already-admitted deterministic refusal messages to be encrypted and stored. The prior restricted-role path, zero-model refusal, concurrent threshold serialization, accounting, IP cooldown, status exclusion, and later 429 controls all passed in the affected frame. No privilege, migration, principal, classifier, escalation-policy, or message-write change occurred.
- **Prior contradicted disposition — SUPERSEDED.** GUIDE_CORRECTNESS8's statement that unchanged physical case guards preserved the intended handoff boundary was disproved by GUIDE_SECURITY8. It is not retained. The new event-aware guards and route checks provide the replacement evidence above. GUIDE_SECURITY8's concrete 200/201/200 plus two-case side-effect counterexample and the author's meaningful REDs remain preserved artifacts.
- **Principal and unrelated guide behavior — RETAINED PASS.** The principal declaration and source-derived assertions are byte-identical to GUIDE_CORRECTNESS8; the declaration remains 11 entries with SHA-256 `7d68dd8a2e826ea1da9d8d2fa2555a3458e088710426b8cba3e6cd4f6bb690e8`. Navigation, public knowledge, recovery, source policy, articles, and their defining code are unchanged across this four-file delta.

## Verification

- Custody: rc `0`; 67/67 indexed inputs matched; all four changed product files matched the author manifest in both lanes; exact four-path delta matched; both lanes were clean and exact.
- Scoped database/architecture frame: rc `0`; 5/5 files and 225/225 tests passed under `TSX_DISABLE_CACHE=1` and `--maxWorkers=1`.
- Independent repository discriminator: rc `0`; 4/4 observations passed, including a positive open-rating control and terminal default-read, raised-threshold read/admission, and direct-rating controls.
- Retained author evidence: final 34-file frame 1,701 passed plus one TODO; 76 inherited typecheck diagnostics remained byte-identical with zero mission additions; strict 44-entry snapshot passed. The original claim that evaluation could be retained was rejected and preserved; the author then ran a fresh final-revision structural evaluation that passed 60/60 in each of three runs, with the separate rubric still `PENDING`.

## Custody and cleanup

- Freeze `916016c5f5f7f35c95abc1972677251238c94d16`; packet SHA-256 `fa4910fea129821baa43beef4af1b63a3afd38fe9099284372103784258ff7dc`.
- Detached reviewer and frozen primary remained clean and exact at `152eed4da1cd3e66b74d8301159ba76427552409`.
- All five temporary dependency links are absent. The heavy lease was released before report packaging.

## Limits

This review covers the explicit sequential GS8-1/GS8-2 counterexamples and direct producer guards; it is not an unbounded concurrency audit. LIVE6's HTTP 500 remains a failed retained observation whose first exception was not captured or retrospectively attributed. No full 34-file suite, typecheck, evaluation, browser, preview, actual Support/model/status/capacity request, or broad corpus/language audit was run by this reviewer. Full actual 54-row verification remains required. Forgot-password remains unresolved and actionless; CP2 remains gated. This PASS is not runtime readiness, checkpoint acceptance, or owner acceptance.

