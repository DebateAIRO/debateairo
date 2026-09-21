# FEEDBACK_REV1 — owner-correction correctness review

Verdict: **REWORK**  
Reviewer: Sol session `/root/plan_review`  
Ticket: `t_3ce30b3f`  
Reviewed product: `1b23c0b732679fdb665a19e03104b800f9d2ef38`  
Prior verified product: `475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9`  
Evidence freeze: `4f7a899c809f2a57d64d4cb66d2677874d5117f5`

The exact owner wording now works and the bilingual identity records are correctly admitted, but the correction remains incomplete in four bounded caller-level cases.

## Blocking findings

### B1 — reviewed identity facts still miss or acquire unrelated capabilities

`Is Dialectical Engine a reasoning instrument?` is a direct question about a sentence in the admitted identity projection. The real-corpus context returns no source; the actual synthetic answer service makes zero model calls and returns `NO_SOURCE`. `Este Dialectical Engine un instrument de raționament?` fails the same source-selection oracle.

`Is DebateAIRO an AI debate tool?` instead selects `guide-how-it-works`, `export-json`, and `getting-started-debate` plus home/public-library actions. The actual answer service makes one call and canonically grounds its answer in `guide-how-it-works`, not `product-identity`.

The source is the closed overview-word decision at `packages/support-kb/src/context.ts:41-76`. A branded question is identity-only only when every remaining word appears in that list; otherwise the generic capability and article scores at `:153-217` can produce no source or unrelated feature authority. This violates the admitted identity facts and the requirement that a product alias remain context rather than capability authority.

### B2 — natural recovery-link requests fall through to the forbidden Settings substitute

These current caller inputs do not produce `securityNavigation: FORGOT_PASSWORD`:

```text
Where can I find the link to recover my password?
Can you show me the recovery page for my password?
Unde găsesc linkul pentru a-mi recupera parola?
```

The nominal adjacency patterns at `apps/api/src/support/security-guidance.ts:9-12` miss the ordinary English/Romanian verb and word-order forms. `classifySupportMessage` then falls through at `apps/api/src/support/classify.ts:355-374` to the broad password zone rule at `:34-37`; all three observations return `REFUSE_ZONE` with `link: "/settings"`. That is the exact substitute the owner correction must avoid while the verified recovery destination remains unknown.

### B3 — reset execution and token-validation questions are captured as navigation

These inputs are classified as `FORGOT_PASSWORD`:

```text
Can the password reset page validate my reset token?
Use the password reset button to submit a reset for me
Poate pagina de resetare a parolei să valideze tokenul meu de resetare?
```

The broad proximity expressions at `security-guidance.ts:11-12` match `page` or `button` before considering the requested reset-token validation or reset execution. Security navigation precedes the sensitive-intent path at `classify.ts:359-374`, so the route would return deterministic Forgot-password guidance through `apps/api/src/support/index.ts:403-424`. This contradicts the correction’s stated separation of navigation from reset execution and token validation.

### B4 — Romanian branded publish intent is lost against the admitted corpus

Both `Cum public o dezbatere în DebateAIRO?` and the spaced alias `Cum public o dezbatere în Debate AIRO?` rank `view-public-debate` first, followed by browsing/disclosure sources, with home/public-library actions. The author’s simplified fixture selected `publish-a-debate`, but the real 38-entry corpus does not. The branded article weighting at `context.ts:158-217` therefore fails the named-feature preservation requirement on the production-shaped snapshot.

## Passing evidence and limits

- Strict real-manifest admission succeeded with 38 entries, 19 bilingual pairs, and `kbVersion` `23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e`.
- Both identity recovery records bind the separately reviewed hashes/session and retain blank owner-ratification fields (`packages/support-kb/reviews/manifest.json:509-533`).
- The exact owner identity wording, ordinary overview aliases, English branded export/publish, Romanian branded export, three unsupported branded topics, unresolved Forgot action, and no-route guidance controls passed.
- Stable unbranded English ledger-export and creation controls passed. One Romanian export expectation selected `guide-how-it-works`; this review did not establish a delta regression for that pre-existing path and does not count it as a separate finding.
- Retained author verification is stated honestly: the initial exact 25-file run had 23 passing files, 1,166 passing tests, three stale fixed-count failures, and one TODO; the two affected-file recheck passed 226/226, composing 1,169 passes and one TODO. No single all-green union is claimed.
- The 36 immutable GATE inputs, 110 product files, and 17 changed paths matched their frozen hashes. Prior unaffected correctness evidence remains retained.
- The verified Forgot-password destination remains unresolved. No URL is invented, and the absence of that destination is a separate owner dependency.

No real model, provider, HTTP, browser, authentication, reset, preview, or credential request was made. Temporary dependency links were removed; the detached and primary product lanes ended clean at exact `1b23c0b732679fdb665a19e03104b800f9d2ef38`. The heavy lease was released before packaging. User acceptance remains pending. Usage is **UNAVAILABLE**.
