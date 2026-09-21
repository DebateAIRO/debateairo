# FEEDBACK3_REV1 — bounded correctness recheck

Verdict: **REWORK**  
Reviewer: Sol session `/root/plan_review`  
Ticket: `t_72d28710`  
Reviewed product: `479763da1f586a217f36204cc81138aaa81c6f81`  
Prior product: `9e87fe5859b44fbd62dd485e03045e5bcde96bed`  
Evidence freeze: `751fb20f5dbe95bc8b0c85cdf82e511ad7b79815`

## Finding dispositions

1. **FEEDBACK2-C1 exact examples — RESOLVED.** The English `Support cannot perform` and Romanian `Asistența nu poate efectua` recovery-page requests now produce unresolved `FORGOT_PASSWORD` navigation. The location-check and negated token-validation cases added by the correction also pass.
2. **Identity overview — RESOLVED.** `Give me an overview of dialecticalengine.` selects only `product-identity` with no action. The actual in-memory answer service makes one model call and returns a grounded answer from that canonical source.
3. **Romanian recovery-code validation — RESOLVED.** The reviewed `codului de recuperare a parolei` validation request stays outside Forgot navigation and reaches the existing `/settings` refusal.
4. **Retained neighbors — PASS within the finite frame.** Existing English/Romanian recovery wording and percent-normalized forms still navigate without a guessed destination. Tested affirmative reset/token operations, including a mixed negated-plus-positive reset request, remain excluded from Forgot navigation. Branded feature selection, unbranded feature selection, unsupported branded authority, identity facts, blank owner fields and the 38-entry corpus remain intact.

## Blocking adjacent finding

### FEEDBACK3-C1 — common explicit-negation forms still suppress valid recovery navigation

Four direct bilingual neighbors ask where the recovery page is and explicitly prohibit Support from performing the reset:

```text
Where is the password reset page? Support must not perform the reset.
Where is the password reset page? Support is unable to perform the reset.
Unde este pagina de resetare a parolei? Asistența nu trebuie să efectueze resetarea.
Unde este pagina de resetare a parolei? Asistența nu are voie să efectueze resetarea.
```

All four return `null` from `classifySecurityNavigation`; `classifySupportMessage` then returns `REFUSE_ZONE` with `link: "/settings"`. The English and Romanian negation patterns at `apps/api/src/support/security-guidance.ts:19-20` enumerate `cannot`/`can't`/`do not` and `nu poate`/`nu vreau`, but do not recognize these equally explicit prohibition or inability forms. Their `perform`/`efectua` tokens therefore survive removal, match the affirmative execution patterns at `:16` and `:18`, and trigger the pre-navigation veto at `:42-61`. The generic password rule at `apps/api/src/support/classify.ts:34-37` supplies `/settings` after the missed navigation (`:355-370`).

This recreates the prohibited Settings substitution for supported recovery-page intent. The correction boundary must classify explicit negation/prohibition as non-affirmative across the supported English and Romanian forms while preserving the existing positive-operation veto, including a later affirmative operation in the same request. This is a behavior requirement; this review does not prescribe an implementation.

## Evidence and limits

- Frozen-input verification passed: 33 immutable inputs, 110 product files and 7 changed paths, with zero mismatches.
- The fresh detector covered 7 identity cases, 5 branded features, 3 unbranded features, 5 unsupported branded topics, 18 recovery-navigation positives, 10 operation/private negatives and 2 identity manifest records. It failed only the four unique adjacent negation cases above; each produced one detector mismatch and one caller mismatch.
- Caller observations covered 8 real-corpus contexts, 16 classifier outcomes and 6 actual synthetic answer-service paths. The four adjacent failures reached the `/settings` classifier sink. Identity/overview service controls were grounded with one model call each; unsupported branded controls returned `NO_SOURCE` with zero model calls.
- One additional mixed reset-token control without a password noun established only that it did not become Forgot navigation; its full classifier result was `outcome:null`. It was not exercised through route or answer sinks, so this report makes no broader disposition for that wording.
- The admitted corpus remains 38 entries at `kbVersion` `23f8131ced441159be735d779ff4d863c9b0b77cf79a7eb513df49e7711f9f3e`. The seven-path correction changes no reviewed article, component, catalog or manifest bytes and adds no owner ratification.
- Author evidence retains 612/612 affected tests. This pass did not repeat broad suites or prior live/model traffic. The exact Forgot-password destination remains unresolved and no URL was invented.

Temporary dependency links were removed. The detached review lane and product lane ended clean at exact `479763da1f586a217f36204cc81138aaa81c6f81`; the heavy lease was released before packaging. User acceptance remains pending. Usage is **UNAVAILABLE**.

## Skills loaded

Retained same-session actual-body reads: `using-superpowers`, `heartbeat-protocol`, `receiving-code-review`, `heartbeat-worker`, `test-driven-development`, `systematic-debugging`, and `verification-before-completion`. No new skill-body read is claimed for this bounded continuation.
