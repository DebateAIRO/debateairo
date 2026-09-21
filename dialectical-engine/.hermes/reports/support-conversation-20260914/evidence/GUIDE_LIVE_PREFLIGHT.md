# GUIDE_LIVE_PREFLIGHT — static admission and capacity review

## Scope and verdict

- Ticket: `t_f02d880d`
- Worker: `/root/preview`
- Immutable source revision: `141f04726e12e40c85fccfb75473cfd684bcf230`
- Verdict: `STATIC_BLOCKED_PENDING_HARNESS_CORRECTION_AND_RUNTIME_CAPACITY_PROOF`
- Review method: committed Git objects plus the indexed sealed GUIDE_HARNESS inputs. The active working tree, runtime, database, browser, network, model, lifecycle, and secret environment were not read.

The 54-row design fits the committed Support limits only after the capture reuses sessions and spaces requests. The sealed capture currently creates 54 anonymous sessions, while the committed default is five per IP in a rolling hour. It would be rate-limited on the sixth session in an otherwise empty default database.

The sealed branch forecast is also inconsistent with the frozen classifier. Rows 43 and 44 contain explicit injection grammar but are labelled `MODEL`; the classifier returns `REFUSE_INJECTION` before any model call. The certain minimum correction changes the forecast from 44 model plus 10 deterministic rows to 42 model plus 12 deterministic rows. The final branch count still needs a mechanical rebind because the frozen revision also returns zone refusals for both active-session rows, the Romanian account-deletion row, and both negative recovery rows, while recovery and guide changes are still in progress.

## Committed limits and their practical effect

The immutable defaults are 20 anonymous messages per rolling 10 minutes, 100 per rolling 24 hours, five anonymous sessions per rolling hour, 40 messages per session, 2,000 code points per message, relay concurrency two, queue depth ten, and a daily provider-call cap of 500. Injection lock defaults to three and IP cooldown to 60 minutes.

These are defaults, not observed runtime values. `initializeDevelopmentSupportConfiguration` publishes all keys only into an empty Support publication. When a publication already exists, it corrects only `support_enabled` and `support_model_ref`; numeric values persist. The final gate must read the selected runtime publication and must not infer allowance from these defaults.

The current capture's page and language transition algorithm creates 54 sessions. A bounded replacement uses five sessions with 1, 14, 13, 14, and 12 messages. `PRICING_EN_BEFORE_SWITCH` remains first and the Account selector switch creates the full Romanian session. Navigation rows and injection rows execute last within their respective session group. Every canonical row still executes once; the receipt records a distinct execution order. The largest session contains 14 messages, below the default 40.

Request starts must be at least 30,001 ms apart; 31 seconds is the recommended fixed interval. This admits no more than 20 new requests in any rolling ten-minute window. Across 54 rows, the first-to-last start span is 1,643 seconds (27m23s), before response time. The conservative sum of all 42 maximum 180-second relay waits and all pacing intervals is 9,203 seconds (153m23s), plus UI and API overhead.

The five-session plan requires five free session slots at start, zero recent anonymous messages for the conservative ten-minute proof, 54 free anonymous message slots in the rolling 24-hour budget, at least 14 messages per session, an 84-code-point message allowance, and an injection-lock threshold of at least two. It also requires no active IP cooldown. The threshold requirement prevents either one-per-session injection control from locking a reused session or creating a second IP lock while later session work remains.

## Request, model, token, and cost bounds

With the branch correction and final branch rebind, the planned capture makes five session-create requests and 54 message requests: 59 Support API POSTs. It performs no credential or recovery operation and no favorable retry.

The conditional provider-attempt ceiling is 42. Those rows contain 1,693 prompt code points in total, with a per-row maximum of 74. The committed answer path accepts at most 24,000 system code points and 16,000 completion code points per attempt; across 42 attempts those envelopes are 1,008,000 system code points, 1,009,693 system-plus-exact-prompt code points, 672,000 completion code points, and 11,010,048 relay response bytes. The maximum sequential relay timeout envelope is 7,560,000 ms.

These are code-point and transport envelopes, not token or dollar ceilings. The provider request has no committed token ceiling, no tokenizer or price is bound, and preview relay usage can be absent. A truthful token-cost upper bound is therefore `UNAVAILABLE`; actual token or cost fields must be reported only if the supported status path supplies them.

## Exact runtime proof required before the first row

The supported `support:status` path can supply the register and Support snapshot binding, every configured limit, calls today, open sessions, KB version, and relay state. It does not supply rolling per-IP admission counts, an active cooldown boolean, or the live durable waiter count.

The smallest missing preflight is a read-only counts-only projection. It must output fixed numeric or boolean fields and no IP hash, session ID, credential, message, header, or raw row:

`maxAnonSessionEvents1hByIp`, `maxAnonMessageEvents10mByIp`, `maxAnonMessageEvents24hByIp`, `anyIpCooldownActive`, `callsToday`, `liveRelayWaiters`, `relayState`, and `measuredAtUtc`.

Using maximum grouped anonymous counts avoids needing to expose the capture IP hash and is conservative for the local preview. The gate then proves:

1. the final commit, admitted snapshot, register versions, KB version, model binding, and normal TLS profile match;
2. configured session capacity minus the observed maximum rolling one-hour count is at least five;
3. the maximum rolling ten-minute message count is zero and 31-second pacing is armed;
4. configured rolling 24-hour message capacity minus the observed maximum is at least 54;
5. per-session and message-size limits are at least 14 and 84;
6. injection lock is at least two and no active IP cooldown exists;
7. daily-call capacity minus `callsToday` is at least the final mechanically derived model-row count; and
8. relay concurrency is at least one, live waiters are zero, and relay state is `AVAILABLE`.

All values must be obtained immediately before traffic from the final supported preview. Current remaining capacity is `UNVERIFIED`.

## Smallest harness correction

No product or limit change is required for this preflight. A separate inert harness correction should be limited to:

- `GUIDE_HARNESS/matrix.mjs`: classify the two injection rows as deterministic refusals and rebind all branch declarations to the final product revision;
- `GUIDE_HARNESS/capture-public-guide.mjs`: execute the five-session grouped schedule, record canonical and execution orders, and enforce monotonic 31-second request-start pacing;
- `GUIDE_HARNESS/pre-request-verifier.ts` and `GUIDE_HARNESS/controls.mjs`: reject any declared branch that differs from the final classifier/route contract and validate the five-session and capacity predicates;
- `GUIDE_HARNESS/verify-guide-harness.mjs`: inert controls for session count, rolling-window spacing, branch mismatch, no retry, and one execution per row; and
- `GUIDE_HARNESS/README.md` plus a new immutable receipt for the corrected bytes.

The final live gate must bind the final revision and admitted snapshot after recovery work, run the counts-only preflight, and stop before the first Support request on any failed predicate.

## Evidence bindings and limitations

Static arithmetic is in `GUIDE_LIVE_PREFLIGHT-arithmetic.log`. Every inspected source Git blob and the sealed matrix/capture SHA-256 are in `GUIDE_LIVE_PREFLIGHT-source-bindings.log`. Structured capacity facts are in `GUIDE_LIVE_PREFLIGHT-capacity.json`.

No live capacity, readiness, product correctness, preview liveness, checkpoint result, owner ratification, or acceptance is claimed.

