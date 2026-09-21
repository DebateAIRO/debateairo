# FEEDBACK_REV2 — owner-correction security review

Verdict: **REWORK**  
Reviewer: Sol session `/root/forgot_destination`  
Ticket: `t_bce33c23`  
Reviewed product: `1b23c0b732679fdb665a19e03104b800f9d2ef38`  
Prior verified product: `475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9`  
Evidence freeze: `4f7a899c809f2a57d64d4cb66d2677874d5117f5`

The exact product-identity examples, actionless public overview, unresolved recovery action, credential redaction, and prohibited password-validation output controls pass. The named correction still has three reproducible boundary defects.

## Blocking findings

### S1 — generic capability words admit irrelevant authority for unsupported branded claims

The branded scoring path at `packages/support-kb/src/context.ts:153-217` retains any capability with a positive catalog overlap. At `:171-176`, a capability whose reviewed articles have zero query relevance still receives its positive `catalogScore`; at `:200-216`, that capability score then authorizes every linked article. This lets generic words such as `support` and `help` select reviewed but irrelevant Support articles for unsupported product claims.

Three transformed real-corpus controls reproduced the admission:

```text
Does Dialectical Engine support investment advice?
Can DebateAIRO help diagnose medical conditions?
Can Dialectical-Engine support insider trading questions?
```

Each selected `support-status-limits` and/or `support-cases`, with Help/Support-status actions at the context boundary. More seriously, the actual final answer-service sink accepted, persisted, and returned the inert model completions `Dialectical Engine provides investment advice.` and `DebateAIRO can diagnose medical conditions.` as `ANSWER_GROUNDED`, citing the irrelevant source. The sources are reviewed; the defect is their lack of authority for these claims. The observation proves the admission and sink boundary with synthetic completions, not that a live provider would emit either sentence.

The nearby negative control `Does Dialectical Engine provide medical advice?` correctly returned no source. Identity questions remained bound to `product-identity` with no actions, so this finding is narrower than an identity-record provenance or private-action bypass.

### S2 — encoded generic recovery nouns bypass the recovery-navigation route

These transformed neighbors were not classified as security navigation:

```text
Show the p%61ssword recovery link.
Arată pagina pentru recuperarea p%61rolei.
```

Both `classifySecurityNavigation` and the final `classifySupportMessage` result were null. The recovery expressions at `apps/api/src/support/security-guidance.ts:9-12` expect the decoded word. The ordinary views produced by `apps/api/src/support/classify.ts:306-329` normalize Unicode and control characters but do not decode the percent form before the security-navigation call at `:355-366`.

Six plain English/Romanian link, page, button, and opener controls correctly produced `FORGOT_PASSWORD`, `REFUSE_ZONE`, and no link. The finding therefore establishes these two encoded members only; it is not an arbitrary-encoding completeness claim. No URL, action, credential, or reset operation was emitted.

### S3 — navigation nouns override reset-token validation intent

The following cross-intent controls were classified as `FORGOT_PASSWORD`:

```text
Where is the page to validate my password reset token?
Unde este pagina pentru validarea tokenului de resetare a parolei?
```

The broad proximity expressions at `security-guidance.ts:11-12` match the page/reset wording. Security navigation is evaluated before zone and sensitive intent at `classify.ts:359-374`, so the requested token-validation operation is replaced by deterministic Forgot-password guidance. The negative control `Validate my password reset token.` stayed outside security navigation and routed to Settings.

This is a cross-intent policy defect, but the measured path emitted no action or URL and did not validate a token, submit a reset, or send a credential. The severity is bounded to incorrect classification/guidance and the loss of the intended prohibition. The unavailable recovery destination remains a separate owner dependency.

## Passing evidence and limits

- The strict admitted snapshot contained 38 entries at KB version `23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e`. Both bilingual identity records bind their separately reviewed hashes/session; owner-ratification fields remain blank.
- Four identity contexts selected only `product-identity` with no actions. Signed-in identity also remained actionless. Branded export/publish controls retained feature sources, while signed-out Settings exposed no private actions.
- Six plain recovery-navigation controls passed in English and Romanian. The unresolved `forgot-password` action remained absent for signed-out and signed-in catalogs, and guidance contained no route or substitute destination.
- A labeled password was redacted before observation. The actual synthetic password-validation control rejected the unsafe completion and returned the reviewed `account-access` fallback; no supplied password or validation claim survived.
- The immutable-input verifier passed 36/36 inputs and 110/110 product files. The bounded probe observed 14 contexts, 14 recovery classification cases, and four answer-service paths; its nine failed assertions map to the three findings above.
- Prior unaffected kernel/security evidence is retained. This review did not rerun the final-25 suite or claim arbitrary natural-language, encoded-input, identity-ranking, or model-output completeness.

No real model, provider, HTTP, browser, database, authentication, reset, preview, or account request was made. All five temporary dependency links were removed; the detached review lane ended clean at exact `1b23c0b732679fdb665a19e03104b800f9d2ef38`. The heavy lease was released before packaging. User acceptance remains pending. Usage is **UNAVAILABLE**.
