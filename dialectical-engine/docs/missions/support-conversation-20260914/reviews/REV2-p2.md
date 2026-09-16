# REV2 pass 2 — CP1 integrated security and privacy review

**Verdict: REWORK**

Reviewer: Sol session `/root/forgot_destination`  
Ticket: `t_4c7f2bc4`  
Reviewed revision: `e0dcfe77f49655bea774bdfacf988b911be4ff06`  
Correction base: `6e5ab5fc41acebbff4264efc7d481df3db8dce44`  
Pass: 2 of 3

The pass-one correction closes the demonstrated alias-isolation, encoded-credential, deep-HTTPS, and exact hyphenated-ID members. It does not close the full supplied-value, operation-governed-negation, or encoded-path classes. One bounded actual-module probe confirms three safety failures through current canonical sinks and one safe-text compatibility regression. No product or Git files were changed.

## Evidence identity and substrate

- HEAD equals the reviewed revision, the correction base is its ancestor, the product worktree is clean, and `git diff --check` returns 0.
- `GATE_P2-manifest.json` SHA256 is `656c3390c7e65de70f3708eb38ac24e89efcbfaf7a0426e48686abe291b44949`. All 103 current product hashes, all 82 GATE immutable-input hashes, and all 26 compact-lens input hashes match; mismatches: 0. The packet records the 22-file administrative freeze `bb933856a4d8ca6781988a6cc548785da635fcff`.
- The probe imported production TypeScript modules and used inert in-memory model and cipher/message ports. It opened no socket and used no HTTP, database, browser, preview, relay, provider, account, credential, or reset traffic.
- Probe: `.hermes/reports/support-conversation-20260914/probes/REV2_P2/final-security-boundary-probe.ts`, SHA256 `70d446fe9d5f25f36711852c2d58a45c218bd28454da866bfdd6e9323093eded`.
- Capture: `.hermes/reports/support-conversation-20260914/logs/REV2_P2-final-security-boundary.log`, SHA256 `8b4ca80bfab9086c0fedba5e0ac9b10fce6d2b382a84ebf611e233a4ebbc3a11`, `rc=0`, 17,790 bytes.

## Blocking findings

### B1 · P1 · Labelled values can still cross every shared redaction sink

**Location.** `packages/kernel/src/support-credentials.ts:83-96,159-177,200-211`; replacement at `packages/kernel/src/index.ts:295-315`; answer transit at `apps/api/src/support/answer.ts:198-221,256-289`; canonical persistence/read at `apps/api/src/support/session.ts:176-180,209-212,227-250`; case snapshot/reply consumers at `apps/api/src/support/cases.ts:316-351,425-439`.

**Evidence.** A balanced guillemet value is fully replaced, and ordinary EN/RO forgot-password intent stays unchanged. Three transformed supplied values fail:

- `My recovery code is "inert amber fern` has no closing quote, produces no span, and is not redacted at all.
- A seven-word recovery value replaces the first six words and leaves `grove`.
- `My reset token is inert.alpha.beta` replaces only `inert` and leaves `.alpha.beta`.

The unmatched-quote case was then sent through `createSupportAnswerService`. The in-memory canonical user record and the exact model-transit argument both retained the complete inert value. Because the real cipher and case paths call the same redactor immediately before sealing or projection, encryption cannot repair this pre-seal leak.

**Required invariant.** After a supported credential label plus value connector is recognized, no unredacted suffix belonging to that supplied value may reach seal, persistence, transit, legacy read, E3 transcript/summary, or case-reply projection. Unmatched quotes, over-bound values, and punctuation-bearing values must fail closed at a safe delimiter or reject the message before a sink. Increasing the word-count bound alone does not close the class. Retain benign intent-only controls.

### B2 · P1 · New positive operation groups still inherit an earlier negation

**Location.** `packages/kernel/src/support-credentials.ts:67-81,126-145,213-247`; relation screen at `apps/api/src/support/response-policy.ts:135-146,182-209`; answer sink at `apps/api/src/support/answer.ts:293-359`; summary sink at `apps/api/src/support/response-policy.ts:295-304` and `apps/api/src/support/cases.ts:124-144`.

**Evidence.** These transformed outputs return `ACCEPTED`:

- `Support does not ask for passwords and may receive them.`
- `Support does not ask for passwords, plus it may receive them.`
- `Asistența nu cere parole și poate primi acestea.`

The first result was persisted and returned by the actual answer service as `ANSWER_GROUNDED`; the purpose-specific summary parser also accepts it. `may`, `plus`, and Romanian `poate` are not among the enumerated scope starts, so `receive` remains inside the earlier negated scope. The confirmed result is unsafe text acceptance and projection. No credential was supplied and no security operation executed.

**Required invariant.** Negation must govern its own operation group. A later finite verb group or modal/auxiliary after coordination must either receive a new scope or fail closed when its relation is ambiguous. Verification must transform auxiliaries, causal/additive coordinators, subjects, and bounded pronouns in EN/RO at both answer and summary sinks, while retaining negative operation lists and safe limitations.

### B3 · P2 · A decoded backslash path bypasses the encoded-path screen

**Location.** canonical views at `packages/kernel/src/support-text-views.ts:6-36`; link/path grammar at `apps/api/src/support/response-policy.ts:124,157-167`; shared answer/summary screen at `:182-209`.

**Evidence.** `Open %5Csettings to continue.` canonicalizes to a backslash path, reports `unsafeEncoding: false`, and returns `ACCEPTED`. The actual answer service persists and returns the encoded instruction as `ANSWER_GROUNDED`; the summary parser accepts it. Deeper HTTPS, deeper credential encoding, and malformed `%3G` structural encoding reject as controls.

**Consequence.** A valid encoded path form crosses answer and advisory-summary text policy even though backslash is treated as structural in the malformed-encoding grammar and rejected by the trusted action resolver. This is text acceptance only; browser clickability, URL interpretation, and navigation execution were not exercised or inferred.

**Required invariant.** Every successfully decoded structural path form, including backslash and bounded drive/UNC variants if supported by the grammar, must be rejected before answer or summary persistence. Keep the fixed-point/exhaustion bound and benign percentage controls.

### B4 · P2 · The repaired relation screen rejects safe pronoun prose and two model-visible labels

**Location.** credential and operation lexicons at `packages/kernel/src/support-credentials.ts:50-81`; prior-scope pronoun binding at `apps/api/src/support/response-policy.ts:135-146`; model-visible capability labels at `packages/support-kb/src/context.ts:72-95`.

**Evidence.** `Support cannot receive passwords. You can change your display name in Settings.` is accepted, while the semantically equivalent `You can change this display name` is rejected because any same-scope reference may bind a security-change verb to a credential in the preceding scope. A generated neutral-label screen accepts 50 of 52 current EN/RO action and capability labels. It rejects `Autentificare și recuperare MFA salvată` and `Starea înscrierii MFA`, both of which the server itself includes in model context.

**Consequence.** Safe grounded text derived from the server-provided vocabulary can become `REFUSE_SAFETY`. This violates the F1/F6 compatibility side of the correction and keeps a deterministic usefulness regression at the shared answer/summary boundary. It is not attributed to any of the four LIVE_P1 refusals because their completion text was discarded.

**Required invariant.** Bind a reference to the nearest governed object rather than any credential term in the previous scope, and verify every server-provided human label as safe in neutral descriptive prose. Preserve rejection of `Send those here` and all positive credential/security operations; do not solve this by weakening the credential screen globally.

## Assigned finding dispositions

| Item | Pass-2 disposition |
|---|---|
| F1 useful navigation / alias trust boundary | **Mapping safety demonstrated; functional boundary still open.** A valid current alias maps to canonical `getting-started-debate`/`start-debate` and the trusted resolver returns `/login?next=%2Fnew`. Stale cross-request, unknown, duplicate, current-alias-in-prose, and canonical-ID-in-prose cases produce only server refusal with empty sources/actions. The 2,286-code-point synthetic context contains none of the checked catalog IDs, routes, repository markers, or fixture provenance. B4 shows two server-provided labels are not accepted by the shared screen. The actual matrix remains 3/7 useful, and the English pointer remains unverified. |
| F2 supplied multiword credentials | **OPEN — B1.** Balanced quoted and six-word forms improved; unmatched quotes, value-bound exhaustion, and internal punctuation retain secret-bearing tails. The shared pre-seal sink makes this a data-safety blocker. |
| F3 coordinated negation | **OPEN — B2 and B4.** Exact pass-one examples are fixed. Unlisted auxiliary/additive variants admit positive operations, while the broad prior-scope pronoun rule rejects safe display-name prose. |
| F4 encoded credential nouns | **FIXED for demonstrated and transformed bounded members.** A five-layer encoded credential term fails closed at exhaustion in direct policy, answer service, and summary parsing. Compatibility/control and shallower forms retain prior evidence. This finite corpus is not a proof of all encodings. |
| F5 deeper encoded links | **OPEN — B3.** Deep HTTPS and malformed/exhausted encodings reject, but a valid encoded backslash path survives canonicalization and every shared text sink. |
| F6 exact internal IDs | **Exact hyphenated-ID property demonstrated; display-label side open under B4.** All 35 current hyphenated action/capability/article IDs reject; uppercase, encoded-hyphen, and control-obfuscated transforms reject. The ordinary `Forgot password` label accepts. Two of 52 generated EN/RO labels reject for an independent credential-relation reason. |

## Preserved controls and limits

- The mapping probe proves only the current in-memory service and a synthetic selected article. It does not prove every future corpus body lacks canonical metadata. The 103-file hash inventory and inherited author/current tests remain separate evidence.
- Rejected mapping, deep-credential, deep-link, and encoded-ID drafts store and return only the server-authored refusal. The local diagnostic projection has the closed 12-field internal shape and drops injected completion/source/action fields.
- LIVE_P1 ran the strict seven-key consumer through 12 controls before actual traffic; its control-log SHA256 is `fb8fc45838fc8f7dcccb00cf54a5abe600c69176c3ec1d9a1cd70206e9404a38`. Seven actual prompts then produced 3 `ANSWER_GROUNDED` and 4 `REFUSE_SAFETY`, with API/DOM equality 7/7. The four isolated windows retained three `PATH_OR_ROUTE` and one `CREDENTIAL_OPERATION` predicate, but native window isolation is not an API request join and the discarded completion text prevents exact-cause attribution.
- The real PostgreSQL repository, HTTP transport, browser rendering/clickability, preview, relay/provider, production account, cross-request concurrency, and credential/reset operations were not exercised. No formal complete-class guarantee is claimed.
- The exact owner-confirmed Forgot-password destination remains **UNVERIFIED** and blocks CP1. It was not searched again and no route was guessed. Eleven LIVE_P1 HTTP401 events still have unverified origin and expectedness.
- Historical source-custody drift remains the recorded serialization/fingerprint limitation; it does not establish changed product bytes or an actor. CP2/CP3 and checkpoint acceptance remain owner-controlled.

## Predictions

The next correction may be tempted to raise the six-word value limit or add `may` and `poate` to the coordinator expression. Those changes would move the same boundaries. The next review should first verify the no-residual supplied-value invariant and operation-group invariant, then rerun generated catalog-label compatibility and the encoded slash/backslash matrix at both canonical sinks. Any effort to improve the 3/7 live result must preserve request-local alias rejection and cannot be justified from the discarded completion text.
