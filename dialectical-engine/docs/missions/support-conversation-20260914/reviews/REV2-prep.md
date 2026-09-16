# REV2 security preparation — frozen server, KB, and preview boundaries

Status: **PREPARATION COMPLETE; THREE BOUNDARIES CONFIRMED; NO VERDICT**

Reviewer seat: Sol session `/root/forgot_destination`  
Ticket: `t_d1aa2fa8`  
Frozen pre-UI revision: `58fbaa7d5535dad89b479b98776cf2b8e88b978e`  
Base revision: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`  
Date: 2026-09-14

This is the bounded SECPREP trace for the later same-session integrated security review. It is not a CP1 verdict or acceptance claim. It inspected immutable committed server, knowledge, persistence, and preview bytes; UI integration and final GATE evidence remain outside this preparation.

## Evidence identity

The worktree HEAD matched the frozen revision, and `git merge-base --is-ancestor b7ca2c413bf3242ce18e29a397dc9a3aa9228893 58fbaa7d5535dad89b479b98776cf2b8e88b978e` returned success. Frozen source was read with explicit `git show 58fbaa7d...:<path>` so concurrent UI edits were not used as security evidence.

Named-input SHA256 values:

| Input | SHA256 |
|---|---|
| `INSTRUCTIONS.md` | `4582bc82bdcdef28ac4e06b4a4eb1a413fee84e8e07bc4374049a9c0ca451bf9` |
| `CP1/SPEC-v2.md` | `a692cc55515a2a581330aaaf8a5549e844f64e848c1d620234aff2d5c362d029` |
| `CP1-REVIEW-SCOPE.md` | `764ddf20a85f1ee898d5cc357862997035f8d6da6e8dc63d4cbdc9b406662903` |
| `GATE-pre-UI-inventory.json` | `9ca1c19df9fb17a962c69d9032ad37d6d4f0797e17157e41a00c281439725923` |
| `NAV.md` | `16b7c2062761269c32aef4911e3eb04dc7df2577f2ffe313170da21648640356` |
| `NAV-manifest.json` | `1e2e58a374fcbe7c6043ad9767366a684b8ea487b7ad7c9fcca76f5cc89b54f4` |
| `PREVIEW-BUILD.md` | `0c254b2f723d3b51fe9a5d8a06e153526a1ea0351c36e817ec2f7873c2036807` |
| `ATTEST.md` | `b5375c030c40c7b66ce4569e7986d0724057c6d9e97840cd2e5f31b8c559b1ad` |

The pre-UI inventory covers 87 committed paths but is intentionally not the final integrated GATE. NAV reports a latest 8-file/549-test aggregate and targeted mutation receipts. PREVIEW-BUILD reports an isolated live stack and completed cleanup; these are author receipts reused as tested evidence, not rerun by this seat.

## Source-to-sink trace

### User input, persistence, and escalation

1. `apps/api/src/support/index.ts:314-367` checks the session capability and exact owner binding, refuses shredded sessions, reads current configuration, classifies the request, and resolves the stored KB version. If that version is unavailable, lines 362-366 return the exact 409 before persistent admission, message writes, or answer work.
2. `apps/api/src/support/index.ts:368-402` applies session-age, character, in-process, IP, account, injection, and persistent admission gates before any response path persists the turn.
3. `packages/kernel/src/index.ts:290-296` is the canonical Support redactor. `apps/api/src/support/session.ts:224-282` redacts, encrypts, persists metadata/ciphertext, returns the redacted canonical text, and zeroes temporary buffers. `writeAndTransit` at lines 286-303 sends only the stored/redacted value to its caller.
4. Deterministic Forgot handling at `apps/api/src/support/index.ts:403-424` performs message writes and closed action resolution only. It invokes neither the answer model nor an auth/recovery/reset capability. The unresolved action remains absent.
5. Ordinary password wording matches the password zone at `apps/api/src/support/classify.ts:25-37,355-370`. The route writes the user turn and deterministic refusal at `apps/api/src/support/index.ts:463-480`. `apps/api/src/support/escalation.ts:39-41` opens E3 after a prior `REFUSE_ZONE` outcome.
6. Case preparation at `apps/api/src/support/session.ts:448-479` decrypts the full session, serializes message text into a case snapshot, and later encrypts it with a distinct case key. Lines 482-489 also concatenate the same text for advisory model summarization. Direct case replies use the same redactor at `apps/api/src/support/cases.ts:390-426`.
7. Session and case shredding use key destruction, parent/session locks, destroyed-key checks, and startup coverage assertions. `packages/db/src/support.ts:2194-2298` fails startup on missing, live-zeroed, or incoherent session/case key relationships and audits.

### Answer-model output and navigation

1. `apps/api/src/support/context.ts:10-116` constructs the model policy, trusted action catalog, lexical whole-article sections, and bounded source/action sets from the selected immutable snapshot.
2. `apps/api/src/support/response-policy.ts:4-72` requires exact structured JSON, bounds raw and text code points, normalizes NFKC and removes control/format code points, screens link/markup/credential/code/secret/redaction-echo classes, requires at least one supplied source, and rejects duplicate, forged, or unrequested source/action IDs.
3. `apps/api/src/support/answer.ts:263-305` converts a rejected answer draft to the server-authored `REFUSE_SAFETY`, resolves actions from server context, writes the assistant value through the cipher, and returns `stored.text`. Rejected completion bytes are not used as the persistence or HTTP value on this path.
4. `packages/support-kb/src/navigation.ts:16-90` resolves a closed catalog only. It rejects non-relative, protocol-relative, backslash, control, unapproved query/fragment, unresolved, unavailable, and unproved dynamic actions, then rechecks the selected href.
5. React escaping and integrated UI response parsing were not inspected here because the UI author owns those changing files. They must be reviewed from final GATE bytes and real browser evidence.

### Case-summary model output

1. `apps/api/src/support/cases.ts:74-114` sends the transcript to a second Support model completion and reduces successful output only with `boundedSummary`, which collapses whitespace and enforces an 80-word sentence boundary.
2. `apps/api/src/support/cases.ts:126-145` seals and persists that summary without calling the structured draft parser or any credential/link/secret screen.
3. `apps/api/src/support/cases.ts:337-353` decrypts the summary into the readable case view. `apps/api/src/support/index.ts:910-961` returns it in `case.summary` to any holder of the case capability.

### Outcome and operational accounting

- `apps/api/src/support/escalation.ts:30-64` uses the user classification for E2; a model-output replacement does not independently trigger E2. E6 counts only repeated `NO_SOURCE` outcomes.
- `packages/db/src/support.ts:669-699` permits ratings only on assistant `ANSWER_GROUNDED` or `NO_SOURCE`, excluding `REFUSE_SAFETY`.
- `packages/db/src/support.ts:2081-2190` counts spend from all assistant rows with `model_called`, treats model-called `REFUSE_SAFETY` as a successful relay observation, excludes it from grounded deflection, and calculates rating resolution only over grounded answers. A standalone refusal-rate metric is not exposed by this status repository.
- `apps/api/src/support/index.ts:1004-1031` exposes the composed configuration and aggregate status. Authorization requirements for this operational endpoint are inherited from its route-policy mapping and should be rechecked only if the final integrated diff changes policy composition.

### Knowledge custody and snapshot behavior

- `packages/support-kb/src/index.ts:118-270` uses strict UTF-8/front matter, exact keys, EN/RO/status/ratification validation, and visitor-text linting. Lines 369-497 admit only complete shipped pairs that are owner-ratified or whose bytes and catalog match the peer-review manifest, and bind selected review provenance into `kbVersion`.
- `packages/support-kb/src/index.ts:500-511` exposes immutable snapshots by exact hash. `apps/api/src/main.ts:78-84` constructs one process-resident current lookup; after a process restart that does not retain an older version, old sessions receive the intended 409 rather than current content.
- The loader uses a trusted deployment directory. Its `readdirSync`/`Dirent.isFile` followed by `readFileSync(join(...))` is not a remote-user surface; filesystem replacement between those calls was not probed and is outside CP1’s stated attacker model.

### Preview and production constraints

- `apps/runner/src/dev-auth-stack-profile.ts:17-54` has an exact `default|support-preview` selector. Default remains ports 3000/3001/8790-8796/55432/7077/8888 and Compose project `debateai-v3`; preview uses 3100/3101/8890-8896/55433/7177/8988 and `debateai-v3-support-preview`.
- `apps/runner/src/dev-support-model.ts:19-63` binds the target to the selected profile’s exact loopback port and canonical JSON, adding the preview marker only for the preview profile. `apps/api/src/support/model.ts:47-95` accepts only the named provider/model, loopback HTTP, `/v1`, fixed 8794 or marker-selected 8894, no URL credentials/query/fragment, and a bounded bearer shape.
- `acceptance/hermes-relay.ts:33-85` checks owner, link count, mode, type, and size before reading the Hermes credential and accepts exactly one non-exhausted Z.AI entry. The child receives a minimal scratch HOME/HERMES_HOME plus GLM key; target JSON contains only the ephemeral local relay authorization value and marker where selected.
- `apps/runner/src/dev-api-environment.ts` and `dev-api-process.ts` use owner/mode/no-follow checks and exact environment/profile parsing. PREVIEW-BUILD’s live receipt records readiness at `https://localhost:3100`, all 12 expected loopback listeners, default ports untouched, supervisor `SIGTERM` exit `rc=0`, and all selected listeners absent afterward. Production deployment and a browser trust run remain unverified by that infrastructure receipt.

## Confirmed candidate P1 — labelled credentials survive every Support redactor

**Class:** supplied credential values that are not token-shaped.

**Concrete input and consequence.** `My password is hunter2` and `Parola mea este hunter2` match the password zone, but `packages/kernel/src/index.ts:290-296` does not redact `hunter2`. `apps/api/src/support/session.ts:224-271` therefore encrypts and persists the unchanged value with `redacted: false`. `apps/api/src/support/cases.ts:404-417` has the same issue for direct case replies. On a second zone refusal, `apps/api/src/support/session.ts:448-489` copies the value into the case snapshot and sends it to the summary model through `apps/api/src/main.ts:423-429`.

This conflicts with CP1-R13’s prohibition on receiving or relaying credentials and CP1-R17’s redactor/cipher boundary. Existing integration coverage at `tests/integration/support-routes.test.ts:890-949` proves only `sk-*` and six-digit-code redaction; the two-turn E3 fixture at lines 2555-2571 does not contain a credential value.

**Executed synthetic proof.** A direct frozen-module harness used the actual redactor, classifier, escalation evaluator, message cipher, and case service with fake encryption/persistence ports and a stub summary sink. Its single output was:

```text
{"classifications":["REFUSE_ZONE","REFUSE_ZONE"],"escalation":"E3","redaction":{"text":"My password is secp_pw_7g","redacted":false},"persistedUserRows":2,"caseSnapshotContainsSentinel":true,"summaryTransitContainsSentinel":true}
```

Receipt: `.hermes/reports/support-conversation-20260914/logs/SECPREP-P1-input-case.log`, SHA256 `5924d79a4b110d418c06f980035cca5133b1d833d78270f238ec3eb51bc49c2b`.

This confirms the short labelled-secret dataflow through fake persistence, case snapshot, and summary transit. It does not prove a real PostgreSQL ciphertext read or network relay. The final integrated regression should add an EN/RO table to the existing real PostgreSQL route fixture. For each value, send two zone-classified turns, capture the summary-model input, decrypt every session message and the case snapshot, and assert the supplied value is absent, redaction metadata is true where applicable, auth/recovery/reset spies remain zero, and the HTTP response is deterministic. Add the same labelled-value table to `replyByToken` and decrypt the resulting case message. Pair it with safe negative controls such as “I forgot my password” and “Am uitat parola” so credential-value redaction does not destroy ordinary help intent. Run:

```sh
pnpm exec vitest run tests/integration/support-routes.test.ts tests/integration/support-cases.test.ts -t 'redacts supplied credentials across session case and summary boundaries'
```

A parser-only reproducer is:

```sh
pnpm exec tsx -e 'import {redactSupportText} from "./packages/kernel/src/index.ts"; for (const text of ["My password is hunter2","Parola mea este hunter2"]) console.log(JSON.stringify(redactSupportText(text)))'
```

The executed P1 harness already confirmed the English member. The final fixture should establish the whole EN/RO labelled-credential class and real composed sinks before assigning integrated severity.

## Confirmed candidate P2 — case-summary completions bypass the response policy

**Class:** secondary model-completion sinks without purpose-specific validation.

**Concrete model output and consequence.** If the advisory summary completion returns `Open //evil.example/reset` or `Your password is hunter2`, `apps/api/src/support/cases.ts:64-71,97-145` accepts, encrypts, and persists it because it is under 80 words. `apps/api/src/support/cases.ts:337-353` and `apps/api/src/support/index.ts:954-960` then expose the same text in the case-token response. No `parseSupportDraft`, `safeText`, redactor, or safe replacement participates.

This conflicts with CP1-R14/R15’s “every model completion” boundary and the before-persistence/HTTP requirement. Existing case tests validate length, timeout, sealing, and non-authoritative metadata; they do not inject hostile summary output.

**Executed synthetic proof.** A direct frozen-module harness supplied `Open //invalid.example/reset and use password secp_pw_7g.` from a stub completion, recorded the actual summary service’s seal/persist arguments, and projected the ciphertext through the actual case-access service with fake encryption. Its single output was:

```text
{"hostile":"Open //invalid.example/reset and use password secp_pw_7g.","sealedText":"Open //invalid.example/reset and use password secp_pw_7g.","persistedStatus":"DONE","persistedContainsHostile":true,"projectedSummary":"Open //invalid.example/reset and use password secp_pw_7g.","projectedContainsHostile":true}
```

Receipt: `.hermes/reports/support-conversation-20260914/logs/SECPREP-P2-summary.log`, SHA256 `26729c6f3220d5e886230a05a7e450f88c07661731ee3b6555f9a63cb8983bec`.

This confirms unvalidated summary text passes to sealing, persistence, and the case projection. It does not establish a clickable UI exploit or real relay behavior. Treat summary as its own model-output channel under the owner credential prohibition. Give it a purpose-specific safe result or omit the summary on rejection; do not fabricate a knowledge citation and do not promote the advisory summary to authoritative state. The final regression fixture should cover a hostile EN/RO table with a credential statement, reset-success claim, raw URL, protocol-relative URL, percent-encoded URL, HTML, Markdown, secret-shaped value, and control/format obfuscation. Capture the plaintext passed to `seal` and the case access projection. Pair hostile cases with a benign one-paragraph summary as a negative control. The safe contract must either persist a documented server replacement or persist no summary, and hostile bytes must be absent from both. Run:

```sh
pnpm exec vitest run tests/integration/support-cases.test.ts -t 'screens advisory summary completions before persistence and case access'
```

Then add one route fixture proving `GET /v1/support/cases/:token` cannot return rejected summary bytes. Preserve the existing timeout, background failure, encryption, usage, and relay-health semantics.

## Confirmed candidate P3 — encoded and protocol-relative answer links evade the text screen

**Class:** link instructions whose canonical meaning is not present as a raw `http://`, `https://`, `www.`, Markdown/HTML, or whitespace-prefixed slash path.

**Concrete model output and consequence.** `apps/api/src/support/response-policy.ts:21,28-48` accepts `Open //invalid.example/reset`, `Open https%3A%2F%2Finvalid.example/reset`, and `Open %2Fsettings`. The protocol-relative first slash is followed by `/`, while the second is not preceded by whitespace; percent encoding is never decoded. A draft that cites an allowed source and requests no actions can therefore reach `apps/api/src/support/answer.ts:263-305`, be persisted, and be returned as answer text. The UI may still render plain escaped text, but the server has accepted a forbidden link instruction that a user can copy or act on.

This conflicts with CP1-R15 and CP1-A06’s raw/encoded link class. Existing `tests/unit/support-response-policy.test.ts:33-51` covers a raw URL, raw path, Markdown, and HTML only.

**Executed parser proof.** The exact direct-module probe was:

```sh
pnpm exec tsx -e 'import {parseSupportDraft,validateSupportDraft} from "./apps/api/src/support/response-policy.ts"; for (const value of ["Open //invalid.example/reset","Open https%3A%2F%2Finvalid.example/reset","Open %2Fsettings"]) { const parsed=parseSupportDraft(JSON.stringify({kind:"answer",text:value,sourceIds:["getting-started-debate"],actionIds:[]})); const accepted=parsed!==null && validateSupportDraft(parsed,["getting-started-debate"],[])!==null; console.log(JSON.stringify({value,result:accepted?"ACCEPT":"REJECT"})); }'
```

The actual parser plus validator returned:

```text
{"value":"Open //invalid.example/reset","result":"ACCEPT"}
{"value":"Open https%3A%2F%2Finvalid.example/reset","result":"ACCEPT"}
{"value":"Open %2Fsettings","result":"ACCEPT"}
```

Receipt: `.hermes/reports/support-conversation-20260914/logs/SECPREP-P3-links-r2.log`, SHA256 `c7082264629c9cae358b5f8310f1b777529e6f99ba5d28d7c3b6caed38ee8474`. The initial identical sandbox attempt failed before import with `listen EPERM` and is retained at `SECPREP-P3-links.log`, SHA256 `1410662905e0da035e0a6c902317908f16ad1577e6ca3ee70e00e315d9393b5f`; it is environmental only.

This confirms server text-policy acceptance, not a clickable UI exploit. After any fix, add the class table to the unit policy test and a route-level hostile completion fixture proving replacement text is identical in decrypted storage and HTTP, raw bytes are absent, model usage is retained, relay health remains available, rating is rejected, E2/E6 do not fire, and auth/reset spies remain zero. Retain the existing benign time/date/public-error draft as a negative control.

## Preserved properties and unverified surfaces

- Static trace supports closed source/action validation, exact owner checks, consent-gated own-context, distinct session/case encryption, key shredding, snapshot 409 ordering, deterministic Forgot no-model/no-reset behavior, answer canonical storage/HTTP equality, non-rateable/non-resolution model rejections, and fixed loopback preview ratification.
- NAV and PREVIEW-BUILD provide existing executed receipts for their scoped properties. This seat did not independently rerun them and does not convert receipt reuse into an integrated PASS.
- P1, P2, and P3 are confirmed at the direct imported-module boundaries described above. Real PostgreSQL encryption, full HTTP composition for P1/P2, real relay transport, UI clickability, and final severity remain **UNVERIFIED**.
- Final UI bytes, both UI modes, stale-session retry, React source/action rendering, actual browser evidence, final GATE inventory, final integrated diff, and the owner-confirmed Forgot destination remain **UNVERIFIED**.
- The Forgot password destination remains V-1. No path was guessed, no destination search was repeated, and no credential, reset, account, provider, or service operation was performed.

## Final integrated-review resume point

At final REV2, first compare the final integrated revision against `58fbaa7d5535dad89b479b98776cf2b8e88b978e`. Re-read only changed dependencies and UI integration, then convert the confirmed direct-boundary P1-P3 probes into the narrow composed regression fixtures described above. Inspect final GATE and browser evidence, including compact/full modes and 409 retry. Only then assign numbered finding severity and one whole-slice verdict. Do not repeat the frozen server, KB article, or preview lifecycle trace unless a changed file invalidates it.
