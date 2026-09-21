# GUIDE_SECURITY4 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Result

Node `GUIDE_SECURITY4`, ticket `t_ab6a6b83`, session `/root/forgot_destination`, model `gpt-5.6-sol`, revision `c8784902f78ed4ba1d637d122e1f32f598415f4e`. Verdict: **REWORK**.

The action filter fixed broad positive over-admission, but it treats a destination phrase as affirmative wherever it appears. Seven bounded controls exposed explicitly negated unrelated destinations as allowed action references. An eighth control lost supported Romanian Pricing guidance after adding a negated Method distractor. Positive, prose-only, external-URL, operator-path, safe-href, and public-marker boundaries otherwise held.

## What repeatedly cost work

1. The prior correction optimized exact destination words without carrying clause polarity into action selection. This repeated the earlier recovery-guard pattern: a lexicon closed the observed phrase but did not encode the semantic relation that made it safe.
2. Authored tests asserted the 40 frozen public-guide rows and positive service examples but lacked contrastive pairs where the same destination appears in a negated unrelated clause. Both changed test files passed 149/149 despite the seven link-admission failures.
3. Source selection and action selection are computed independently and reconciled late. The output contract can contain an action candidate merely because a matched capability and destination words coexist, leaving the model to choose among references wider than the affirmative request.
4. Security impact requires careful phrasing: an admitted closed link is not arbitrary navigation, private-data access, or execution. Time is lost when review artifacts do not separately capture candidate admission, model selection, rendered link, and click/capability effects.

## Upgrades

- Reuse a bounded clause/polarity representation for navigation actions. Each action term should produce evidence only from an affirmative clause; `not`, `do not`, `ignore`, Romanian `nu`, and contrastive boundaries need paired positive/negative tests.
- Generate contrastive rows from every action term: positive request, prose mention, negated request, positive A plus negated B, and negated A plus positive B in EN/RO. Assert exact action IDs and source retention.
- Bind action references to the cited source/capability before constructing the output contract, then enforce the same binding again on accepted model output. This reduces the trusted surface between retrieval and resolution.
- Extend structured diagnostics with candidate action IDs and the evidence clause class, while keeping user text and private markers out of logs. A reviewer can then distinguish selection defects from resolver or rendering defects without another probe.

## A stronger one-prompt machine

The prompt should provide the reviewed action catalog, source/action binding invariant, polarity grammar, frozen EN/RO contrastive matrix, immutable revision/manifest, explicit runner identity, and sink-specific assertions. One command should verify custody, run context and actual-service matrices, run changed tests, clean links, and emit a receipt that separates candidate admission, model allowance, resolved link, and capability execution. The reviewer then reports only semantic boundary failures and measured limits.

## Evidence and limits

Context matrix: 10/18, `rc=1`; changed units: 149/149, `rc=0`; 79 exact private custody markers absent from all contexts. No real model, browser, socket, private data, account action, credential, or recovery traffic occurred. The Forgot destination remains a separate unresolved owner input. Usage was unavailable.

## Skills loaded

`superpowers:using-superpowers`; `heartbeat-protocol`; `heartbeat-reviewer`; `superpowers:verification-before-completion`; `superpowers:systematic-debugging`; `superpowers:test-driven-development`; `codex-security:attack-path-analysis`.
