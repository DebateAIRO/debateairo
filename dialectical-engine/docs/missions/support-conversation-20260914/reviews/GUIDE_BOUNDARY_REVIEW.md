# GUIDE_BOUNDARY_REVIEW — public/private data-boundary security review

## Verdict

**PASS (finite static scope).** I found no reachable source-to-sink path at immutable revision `cd4f6d62c64d0abe8df9061ac5869930425beb5e` by which the public Support guide can retrieve live private debate, run, account, or case data and disclose it through its model or UI response. This verdict is limited to the frozen public/private boundary patch and its immediate trust-boundary consumers. It is not a full-application security result, an independent runtime result, a final composed recovery/security result, or checkpoint acceptance.

## Immutable custody

The packet index contains 32 paths. An independent light verifier read each path with `git show` at the exact reviewed revision: all 29 present blobs matched the packet SHA-256 and byte count, and all three declared deletions were absent. Mismatches: zero. The complete path-level result is in `GUIDE_BOUNDARY_REVIEW-object-custody.log`.

The immediate trust-boundary consumers omitted from the 32-path patch index were also read directly from the same immutable Git revision:

| Path | SHA-256 | Bytes |
|---|---|---:|
| `apps/api/src/support/answer.ts` | `16e1eb66a8f72a0bed59c00ab879bcddd54e191de5046baec8610d859ec77c76` | 22,479 |
| `packages/support-kb/src/context.ts` | `05e004ec5365dbb6d11e89d9204ae7f801203d498cf8127a39818ead5e56c05d` | 12,763 |
| `packages/support-kb/src/navigation.ts` | `26e8840761f92bbfea308f7b3c596962d406e6009c4201defbf1afef2eee3879` | 3,412 |

The old detached lane remained unchanged at `479763da1f586a217f36204cc81138aaa81c6f81`; no checkout or product/Git/index write was performed.

## Source-to-sink review

### Browser input to route

`Assistant.tsx` sends a message body containing only `{ text }`. It obtains a signed-in boolean from `/api/v1/session`, but it neither reads nor attaches a debate, run, account record, case, or page data. `SupportWidget.tsx` passes only language and close callbacks to the assistant. On a private debate page, `DebatePageGate.tsx` renders the private `DebatePageClient` inside `AuthGate`, while `SupportWidget` is a sibling with no debate props. The deleted `ConsentToggle.tsx`, `DebatePicker.tsx`, and `own-context.ts` objects are absent, and exact-name/caller search found no remaining Support caller.

### Route authorization and public-guide gate

The message endpoint requires the session capability hash and verifies session ownership before processing. It rejects every message body except exactly one string `text` field, so message-level `language`, `run_id`, `latest`, and unknown attachment selectors do not enter the path. Response language comes from the stored session; `overrideLanguage` is always null.

Admission, rate, age, length, shred, and injection accounting remain before response generation. A private-record request gets a deterministic refusal with empty sources/actions and no answer-model call. Injection and safety classifications retain precedence over that private-record response. The endpoint gives the answer port only the user text, stored language, diagnostic language, model reference, pinned KB snapshot/version, a signed-in boolean, and timestamps. It does not pass account identifiers, debate/run references, prior message text, or case data.

### Model payload and response sink

`createSupportAnswerService` redacts the current user message before persistence and transit. It calls `buildSupportKnowledgeContext` with the pinned public corpus, public capability catalog, the redacted current query, and `historyText: ""`; the context builder rejects nonempty history. The model receives that bounded public context and one redacted user message. Its composition has no private account/debate/run/case repository port.

Model output is parsed against per-request opaque source/action references, translated back to known canonical IDs, screened by response policy, and recovered only from reviewed corpus fallback when applicable. Actions are resolved from the frozen catalog and checked as first-party paths. The UI independently re-resolves each action ID and requires exact canonical label and href before rendering an anchor. No model-generated href is accepted directly.

### Persistence and human-case separation

The Support data plane uses `SUPPORT_DATABASE_URL` and a Support-specific key. Message plaintext is redacted, encrypted before repository storage, decrypted only through the cipher port, and key/cipher/plaintext buffers are cleared. The architecture evidence pins the Support database role to the Support schema and denies access to representative identity, run, answer, registration, and observation relations.

The human-case subsystem may copy the encrypted Support conversation transcript and create an advisory summary when escalation is triggered. That data is the user’s Support transcript, not live private product records. The case service is a separate operational path: no case snapshot, case summary, or prior Support message text is supplied to the public-guide answer model. The message route does read prior Support messages when case handling is enabled, but reduces them to assistant outcome codes before the answer decision.

Operational boundaries remain in place: capability ownership, encrypted Support storage, shredding state and destroyed keys, rate/admission controls, relay reservation/spend controls, degraded handling, incidents, and human handoff. The exact objects reviewed expose no new path from those operational stores into public-guide grounding.

## Findings

No reportable public/private data-boundary finding was established in the allowed static scope.

The natural-language `PRIVATE_RECORD_REQUEST` classifier is intentionally heuristic. A mixed navigation/read phrase can avoid the deterministic refusal because the classifier excludes location questions. That does not form a private-data leak at this revision: a missed phrase still reaches an answer service with no private product repository or history input, and only public corpus grounding. This is a precision limit of the early refusal, not a demonstrated authorization path.

The browser persists the Support conversation in `sessionStorage`; that consists of Support user input and validated Support replies. The removed UI wiring no longer copies private page/debate/run state into it.

## Evidence classification

**Independently verified statically:** exact immutable object custody; deleted-object/caller absence; request shape and stored-language flow; model-call arguments; empty model history; composition port graph; encryption/case separation; canonical action sink; UI prop/data separation.

**Author-tested evidence consumed, not rerun here:** the final focused run reports 10 files, 269 passed, 1 todo, 0 failed, rc 0. Its route tests include rejection of `language`, `run_id`, `latest`, and unknown message fields; EN/RO private-record refusals with zero answer calls; injection precedence; encrypted refusal persistence; and stored-session-language behavior. The recorded Support eval ran three times at 50/60 each; all six class-E boundary cases passed each run. The ten class-A failures are recorded as unattributed without a comparable baseline and do not establish a boundary failure. The attestation’s separate three-file green run reports 43 passed and its corpus probe reports immutable/pass.

**Unverified here:** actual deployment credentials/role grants, runtime database behavior, real relay/model behavior, browser/preview behavior, and behavior after the concurrent retrieval correction. No tests, build, database, HTTP, model, browser, or preview were run by this reviewer.

## Precise follow-up verification

The final composed review should bind the retrieval correction to this exact boundary baseline, then independently rerun the focused boundary set. At minimum it should retain these assertions:

1. the message route rejects message-level `language`, `run_id`, `latest`, and unknown fields;
2. representative EN/RO private-record requests perform zero guide-model calls and return no sources/actions;
3. mixed injection/private-record text retains injection precedence and abuse accounting;
4. model input contains current redacted Support text plus public KB/capability material, with empty history and no private repository-derived values;
5. public-guide actions remain canonical first-party actions and cannot use owner/public debate identifiers unless a separately authorized caller supplies a validated reference;
6. case escalation may consume the encrypted Support transcript but never becomes an input source for the public-guide answer model;
7. the dedicated Support database role still cannot read private product schemas in the runtime test database.

The owner-confirmed Forgot-password destination remains unresolved and is separate from this technical boundary verdict.
