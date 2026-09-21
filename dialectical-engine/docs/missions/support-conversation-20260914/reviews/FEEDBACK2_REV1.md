# FEEDBACK2_REV1 — bounded correctness recheck

Verdict: **REWORK**  
Reviewer: Sol session `/root/plan_review`  
Ticket: `t_053c1512`  
Reviewed product: `9e87fe5859b44fbd62dd485e03045e5bcde96bed`  
Prior product: `1b23c0b732679fdb665a19e03104b800f9d2ef38`  
Evidence freeze: `b89d0bf11e01f39dbd7b53cc84ddaa05bde92055`

## Prior finding dispositions

The four FEEDBACK_REV1 findings are resolved on the exact admitted 38-entry corpus and current callers:

1. **Identity retrieval — RESOLVED.** English/Romanian reviewed identity facts select only `product-identity`; the actual synthetic answer service makes one call and grounds the English controls in that source. Unsupported medical and insider-trading questions have no sources/actions and return `NO_SOURCE` with zero model calls.
2. **Natural recovery wording — RESOLVED.** English/Romanian verb-order forms and the bounded `%61` neighbors produce unresolved `FORGOT_PASSWORD` navigation rather than the Settings substitute.
3. **Positive reset operations — RESOLVED.** Token validation and reset submission with page/button nouns remain outside navigation and reach the existing password-zone refusal.
4. **Romanian branded publish — RESOLVED.** Both `DebateAIRO` and `Debate AIRO` variants rank `publish-a-debate` first with the owner-debate action; the real corpus no longer loses intent to public-view sources.

## Blocking adjacent finding

### FEEDBACK2-C1 — explicitly negated Support execution suppresses a valid recovery-page request

These bilingual requests ask for the recovery page and explicitly say that Support cannot perform the reset:

```text
Where is the password reset page? Support cannot perform the reset.
Unde este pagina de resetare a parolei? Asistența nu poate efectua resetarea.
```

Both return `null` from `classifySecurityNavigation` and then fall through to `REFUSE_ZONE` with `link: "/settings"`. The operation patterns at `apps/api/src/support/security-guidance.ts:15-16` detect `perform/efectua` near `reset` without considering negation. The unconditional operation veto at `:42-48` runs before the positive subject-plus-navigation test at `:49-54`. The caller then reaches the broad password zone at `apps/api/src/support/classify.ts:355-370`.

This is not reset execution or token validation. The visitor requests the page and states the same prohibition as the reviewed guidance. Treating that prohibition as a positive operation recreates the forbidden Settings substitution for a supported recovery-navigation intent. The correction must preserve true positive-operation exclusions while allowing explicitly negated Support-operation neighbors in both languages.

## Evidence and limits

- Fresh detector covered 6 identity cases, 5 branded features, 3 unbranded controls, 5 unsupported branded topics, 10 recovery-navigation positives, 6 positive-operation negatives, 2 manifest identity records, and the two new negated-operation neighbors. Only the two neighbors failed.
- Caller observations covered 7 real-corpus contexts, 8 full classifier outcomes, and 5 actual synthetic answer-service paths. They confirm the prior repairs and the `/settings` sink for the new finding.
- Strict corpus admission remains 38 entries at unchanged `kbVersion` `23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e`.
- Reviewed articles, components, catalog, manifest, and blank owner-ratification fields are unchanged. GATE_FEEDBACK2 matched 37 immutable inputs, 110 product files, and 7 changed paths with zero mismatches.
- Author evidence retains 591/591 affected tests. The broad final25 and prior unaffected evidence were not repeated.
- The exact Forgot-password destination remains unresolved and no URL was invented. No live model, provider, HTTP, browser, authentication, credential, reset, or preview traffic occurred.

Temporary dependency links were removed; detached and primary product lanes ended clean at exact `9e87fe5859b44fbd62dd485e03045e5bcde96bed`. The heavy lease was released before packaging. User acceptance remains pending. Usage is **UNAVAILABLE**.
