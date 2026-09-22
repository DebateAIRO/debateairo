# FEEDBACK3_REV2 — bounded owner-correction security recheck

Verdict: **REWORK**  
Reviewer: Sol session `/root/forgot_destination`  
Ticket: `t_e3556e0a`  
Reviewed product: `479763da1f586a217f36204cc81138aaa81c6f81`  
Previous product: `9e87fe5859b44fbd62dd485e03045e5bcde96bed`

Every exact FEEDBACK2_REV2 failure is fixed, including the identity overview at the actual answer-service sink, English/Romanian location-check navigation, the supplied English/Romanian negations, and Romanian recovery-code validation. One bounded adjacent negation family remains incomplete.

## Finding dispositions

- **FEEDBACK2_REV2 S1 — fixed.** `Give me an overview of dialecticalengine.` selects only `product-identity`, with no actions, in the real corpus and actual in-memory answer service. The other five identity controls remain passing.
- **FEEDBACK2_REV2 S2 demonstrated members — fixed.** `check where`/`Verifică unde`, ASCII-apostrophe `do not want`, and Romanian `nu vreau` navigation all produce unresolved Forgot guidance with no link.
- **FEEDBACK2_REV2 S3 — fixed.** Romanian recovery-code validation stays outside navigation and falls to the password-zone refusal.
- **Earlier retained families — passing.** Seven unsupported branded contexts remain source/action-free; two actual service cases make zero model calls and return `NO_SOURCE`. Four named feature cases, four percent-normalized recovery cases, the prior natural word orders, and exact mixed reset/token operations remain passing.

## Blocking finding

### S1 — equivalent negation forms still suppress valid recovery navigation

These three requests returned no `securityNavigation` and fell through to `/settings`:

```text
I don’t want to validate a reset token; show me the password recovery page.
I am not asking you to verify a recovery code; show me the password recovery page.
Nu doresc să validez tokenul de resetare; arată pagina de recuperare a parolei.
```

The negation expressions at `apps/api/src/support/security-guidance.ts:19-20` recognize ASCII `don't`, a fixed English auxiliary list, and Romanian `vreau/dorim` or ability forms. They do not recognize the typographic apostrophe, `am not asking`, or `nu doresc`. Those operation clauses therefore remain in the text inspected by `hasAffirmativeRecoveryOperation` at `:42-49`; the early return at `:59-62` suppresses the valid recovery-navigation match and the caller falls to the Settings zone.

The measured failure is availability/policy routing. It did not emit a credential, URL, action, validation, or reset operation. Seventeen other positive navigation cases pass, including the author’s two negation forms; all fourteen prohibited-operation cases pass, including two controls that combine a negated validation clause with an affirmative reset request. This finding establishes three adjacent negation members, not general negation or arbitrary-language completeness.

## Evidence and limits

- Input custody passed for 33/33 immutable inputs and 110/110 product files. Git comparison confirms the reviewed corpus, recovery components, review manifest, catalog, and loader are byte-unchanged.
- The admitted snapshot remains 38 entries at KB version `23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e`. Identity review hashes/session remain unchanged and owner-ratification fields remain blank.
- The bounded probe observed 20 real-corpus contexts, 34 recovery cases, and six actual in-memory answer-service paths. Six failed assertions map to the three negation members above; 31 recovery cases passed.
- Identity remains actionless, signed-out Settings exposes no private action, signed-in Settings exposes only Settings/privacy actions, labeled-password redaction passes, and an unsafe password-validation completion does not survive.
- No final-25 rerun, broad audit, public-guide assessment, arbitrary-language/encoding claim, live-model semantic claim, or current-preview claim is made. The separate GUIDE_GAP owner-steering assessment is outside this recheck.

No real model, provider, HTTP, browser, database, authentication, reset, preview, or account request was made. All five temporary dependency links were removed; the detached lane ended clean at exact `479763da1f586a217f36204cc81138aaa81c6f81`. The heavy lease was released before packaging. The Forgot-password destination remains separately unresolved. User acceptance remains pending. Usage is **UNAVAILABLE**.
