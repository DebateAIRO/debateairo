# S10 VR-10 destructive mutation matrix

This is the required campaign definition for current S10 security assertions. A row is complete only when the destructive change produces the listed **Expected RED**, the original bytes are restored, and the **Restoration gate** is green on the restored hash. A normal green regression alone is not mutation evidence. Historical receipts are not reused after a protected file changes.

| Invariant | Destructive mutant | Expected RED | Restoration gate |
| --- | --- | --- | --- |
| Exact elapsed grace | Restore calendar `7 days` arithmetic | Europe/Bucharest spring/fall witness observes 601200/608400 instead of 604800, or early execution | S6 ambiguous-COMMIT/exact-grace title |
| Notification fan-out is non-vacuous | Remove the live-channel row-count/precondition and allow vacuous notification fan-out | zero-channel/all-revoked case consumes grant or creates request/outbox/audit | S6 required-channel title + HTTP typed conflict |
| User-wide completion readiness | Scope readiness to current erasure ID instead of user-wide rows | old cancelled A's held/unacked row no longer blocks later B | S6 notification lifecycle title |
| No post-ACK plaintext race | remove the notification custody lease or release before ACK response/finally | B destroys the DEK while sender still holds recipient/message plaintext | notification ACK-response hold and backend-crash titles |
| Exact discriminated grant | Accept account target plus run target, or omit a run target | HTTP parser or DB CHECK accepts crossed shape | S10 HTTP crossed-shape + S6 constraint witnesses |
| Schedule is idempotent | Stop binding the request to the one-use grant | lost-COMMIT retry returns null/second request or surprise due deletion | S6 ambiguous-COMMIT title |
| Schedule receipt is truthful | Commit schedule, then derive the response from a second active-session read | post-COMMIT session revoke turns a successful destructive request into NOT_FOUND | S6 ambiguous-COMMIT/session-revoke title |
| Cancel is generation-bound | Remove the opaque cancellation reference and select the latest session request | delayed replay of cancel A cancels later request B | S6 cross-generation cancellation receipt |
| Due work is retry-fair | Order only by original due time and reset a fixed lease | expired oldest poison page starves request 101/later attempt-zero row | S6 saturated due-work title |
| Least privilege | Grant direct table DML/helper execution, LOGIN to the capability role, or an elevated predefined role | startup attestation accepts drift or actual forbidden LOGIN succeeds | S6 actual erasure/content-provision role titles + session DML matrix |
| Provision attestation cannot be self-minted | Let ordinary runtime prepare/create with a runtime chosen attestation secret | runtime chosen attestation secret creates a durable forged run/carrier | S6 actual LOGIN chosen-secret saga |
| Envelope/content derivations reveal no oracle | Restore unkeyed/copyable digest or label v1 QBI as v2 | low-entropy dictionary/cross-run/cross-carrier equality survives | fourteen-carrier S6 title + carrier architecture tests |
| v1 has no grandfather path | Remove the v1 QBI/digest preflight | seeded v1 QBI migration applies and later qualifies for CLEANED | S6 preflight refusal witnesses |
| Parse diagnostics do not echo content | Persist plaintext parse error detail | malformed provider output leaves email/question bytes in row/data directory | carrier architecture + fourteen-carrier receipt |
| Private readers cannot outlive shred | Remove run session advisory lease/revalidation | paused reader returns plaintext after PREPARE/key destruction | S6 reader-win/erasure-win/crash titles |
| Reentrant lease cannot self-deadlock | Allow nested lease scope expansion | runner/Serve nested prior-run request hangs or locks in inverse order | expansion-forbidden, UUID-order, and callgraph receipts |
| Nested key exposure is bounded | Load the outer lease's whole set for a nested single | key-store count becomes O(N²) or unrelated missing/tombstoned run poisons read | S6 nested-subset/O(N) title |
| Owner private-history lookup and ask admission are bounded | Remove the `LIMIT 129`/saturation gate, restore constructor alias defaults, bypass the owner admission lease, alias an executable composition pool, or make `startRun` check out a different client | row 129 reaches a lease/key/decrypt/write seam; a maxed waiter pool starves its holder; an executable boots the shared-pool topology; or backend loss no longer fences the liveness-to-durable-run boundary | S6 N=128/N=129, maxed same-owner admission, exact server/legacy backend PID, scope-isolation, backend-kill, ambiguous-commit, constructor alias negative, production/acceptance callsite architecture, and API 422/no-preprovision receipts |
| Public evaluator never uses private gateway | Inject the unrestricted private provider gateway or allow private samples | post-account-delete evaluator fails private liveness or persists prompt/raw artifact | S8 real production-factory public evaluator receipts |
| Publication cleanup is linearized | Remove publication advisory lease or permit tokenless completion | cleanup destroys key during provider use or forged completion hides live key | S8 evaluator-vs-cleanup/crash and claim-token receipts |
| Publication severance is event-local only | Restore a stable publication source digest/request ID or a stable user audit ref | retained public event joins another same-user event/person after deletion | S8/S6 relational source/ref attack queries |
| No public-to-legacy plaintext expansion | Remove either legacy/public owner forward guard | legacy/public owner graph becomes constructible in either order | migration preflight + publish/legacy-claim order guards |
| Private status is not an IDOR | Restore unbound status/resume or classify before auth | foreign PREPARED/CLEANED/legacy/published run reveals state or triggers destroy | private auth-first/status relational receipts |
| Private lock contention is not an oracle | Acquire the run `NOWAIT` lock before the nonlocking authenticated ownership preflight | locked foreign returns CONTENDED while absent/unlocked foreign is opaque | S6 real-coordinator two-pool classification receipt + HTTP opacity test |
| Audit chain is canonical | Trust caller `prev_hash`/`this_hash` or allow a second root | forged/forked/disconnected row commits or chain verification fails | session/publication/private/account canonical append tests |
| T9 order is real | Restore a session-before-user, execution-before-run, binding-after-intent, or other tuple-first lock | NOWAIT order probe reverses or forced schedule records 40P01 | 50 T9 schedules + 4 order probes + 6 provision-cleanup schedules |
| Route preconditions have zero side effects | Remove cookie/CSRF/origin/exact phrase or parse after application I/O | malformed/foreign/pre-auth request reaches schedule/delete implementation | S10 HTTP boundary titles |
| UI cannot mint the wrong grant | Reuse generic step-up or render private delete while PUBLISHED | source/render contract loses targetless/run-targeted authorization or warning | S10 duplicate UI test |
| UI does not retain shredded plaintext | Keep parent debate state mounted after private PENDING/CLEANED | distinctive question/prose/node/inspection sentinel remains visible beside processing/tombstone copy | duplicate rendered UI PENDING/CLEANED tests |
| Processing state is observable only narrowly | Reuse ordinary auth for a suspended user, hide PREPARED as NONE, or stop polling | ordinary route reopens or exact scheduling session cannot observe irreversible processing | S6 status-capability ACL/auth title + HTTP and duplicate polling UI tests |
| Evidence wording stays bounded | Delete a named residual or add a blanket compliance/anonymity phrase | evidence architecture test fails | `tests/architecture/s10-erasure-evidence.test.ts` |

## Execution record rules

For an actual campaign, record per row: original SHA-256, exact one-change patch, focused command, failing assertion/SQLSTATE, restored SHA-256, restored command/status, and all process/PTY cleanup. Equivalent mutants must be rejected and replaced with a stronger mutation. Do not batch mutations that make the cause of RED ambiguous.

The matrix deliberately includes database, external-store, role, concurrency, route, UI, and evidence-language assertions. It does not turn the evidence artifact into a legal or anonymity claim.
