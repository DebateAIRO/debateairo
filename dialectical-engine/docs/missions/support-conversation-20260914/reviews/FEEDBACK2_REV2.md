# FEEDBACK2_REV2 — bounded owner-correction security recheck

Verdict: **REWORK**  
Reviewer: Sol session `/root/forgot_destination`  
Ticket: `t_7ced3540`  
Reviewed product: `9e87fe5859b44fbd62dd485e03045e5bcde96bed`  
Previous product: `1b23c0b732679fdb665a19e03104b800f9d2ef38`  
Evidence freeze: `b89d0bf11e01f39dbd7b53cc84ddaa05bde92055`

The correction closes the original unsupported-authority sink, encoded recovery misses, exact reset-token/page collisions, identity-fact questions, and Romanian publishing selection. Three bounded adjacent defects remain.

## Finding dispositions

- **FEEDBACK_REV2 S1 — fixed for the demonstrated family.** Seven unsupported branded medical, investment, diagnosis, insider-trading, portfolio, illness, and market-manipulation queries produced no sources or actions. The two actual in-memory answer-service controls made zero model calls and returned `NO_SOURCE`; the prior unsupported completions could not reach storage or return.
- **FEEDBACK_REV2 S2 — fixed for the demonstrated family.** The original `%61` English/Romanian password forms and two additional ASCII-percent recovery neighbors produced `FORGOT_PASSWORD`, `REFUSE_ZONE`, and no link.
- **FEEDBACK_REV2 S3 / union B3 — exact demonstrated members fixed.** The original English/Romanian reset-token validation, reset submission, and percent-transformed operation cases stayed outside recovery navigation and fell to the existing password-zone refusal.
- **Union B1 — identity fact members fixed, overview member regressed.** English and Romanian reasoning-instrument facts selected only `product-identity`, but a previously passing concatenated-alias overview now has no source.
- **Union B2 — original word-order members fixed.** Three natural English/Romanian link/page formulations route to unresolved Forgot guidance rather than Settings.
- **Union B4 — fixed for the demonstrated family.** Both Romanian brand spellings rank `publish-a-debate` first; the English public-view neighbor ranks `view-public-debate` first.

## Blocking findings

### S1 — a previously passing identity overview now returns no source

```text
Give me an overview of dialecticalengine.
```

The real 38-entry corpus returned no source or action. The brand alias is recognized, but `give` remains substantive because it is absent from the overview/generic sets at `packages/support-kb/src/context.ts:41-55`. The identity fact gate at `:173-180` also does not admit a `give` overview request, leaving no matching capability at `:181-205`.

Five nearby controls pass: the exact owner question, ordinary English/Romanian overview wording, and English/Romanian identity facts. This finding is one demonstrated regression, not a claim that all overview paraphrases fail.

### S2 — operation words suppress legitimate recovery navigation

Four navigation requests returned no `securityNavigation` and fell through to `/settings`:

```text
Can you check where the password reset page is?
Verifică unde este pagina de resetare a parolei.
I do not want to validate a reset token; show me the password recovery page.
Nu vreau să validez tokenul de resetare; arată pagina de recuperare a parolei.
```

The operation expressions at `apps/api/src/support/security-guidance.ts:15-16` match `check`/`verific` without distinguishing “check where” from checking a credential, and match explicitly negated validation. The unconditional early return at `:45-48` therefore suppresses the valid navigation subject/noun match at `:49-53`. The caller then uses the generic password zone at `apps/api/src/support/classify.ts:359-370`, producing the forbidden Settings substitute.

Thirteen other English/Romanian navigation phrases, including both natural word orders and four ASCII-percent forms, passed. The finding is limited to the measured operation-word scope and negation cases; it does not establish general natural-language negation coverage.

### S3 — Romanian recovery-code validation remains classified as navigation

```text
Unde este pagina pentru validarea codului de recuperare a parolei?
```

This returned `FORGOT_PASSWORD` and `REFUSE_ZONE` with no link. The Romanian operation guard at `security-guidance.ts:16` recognizes nearby `token` or `reset`, but not the credential noun `cod`; the recovery subject and page noun then win at `:49-50`. The corresponding English `password recovery token` control stayed outside navigation.

No action, URL, credential submission, validation, or reset was emitted. This is a mixed credential/navigation classification defect and loss of the intended operation refusal, not evidence of an unsafe destination or executed account operation.

## Evidence and limits

- Input custody passed for 37/37 immutable inputs and 110/110 product files. Git comparison confirmed the reviewed content, recovery components, review manifest, catalog, and loader are byte-unchanged from the previous revision.
- The admitted snapshot remains 38 entries at KB version `23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e`. Identity review hashes/session are unchanged and owner-ratification fields remain blank.
- The bounded probe observed 20 real-corpus contexts, 29 recovery classifications, and five actual in-memory answer-service paths. Ten failed assertions map to the three findings above.
- Identity remained actionless signed out and signed in. Signed-out Settings exposed no private actions; signed-in Settings exposed only Settings/privacy actions. Labeled-password redaction and the rejected password-validation completion remain passing.
- No final-25 rerun, broad audit, arbitrary-language/encoding claim, live-model semantic claim, or current-preview claim is made.

No real model, provider, HTTP, browser, database, authentication, reset, preview, or account request was made. All five temporary dependency links were removed; the detached lane ended clean at exact `9e87fe5859b44fbd62dd485e03045e5bcde96bed`. The heavy lease was released before packaging. The Forgot-password destination remains separately unresolved. User acceptance remains pending. Usage is **UNAVAILABLE**.
