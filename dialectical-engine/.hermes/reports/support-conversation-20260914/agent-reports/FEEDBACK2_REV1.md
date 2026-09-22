# FEEDBACK2_REV1 case file

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Node `FEEDBACK2_REV1`, ticket `t_053c1512`, reviewer `/root/plan_review`, exact product `9e87fe5859b44fbd62dd485e03045e5bcde96bed`, freeze `b89d0bf11e01f39dbd7b53cc84ddaa05bde92055`.

## Verdict

The verdict is **REWORK**. All four prior correctness findings are closed in production-shaped controls. One directly adjacent case remains: a valid recovery-page request is routed to `/settings` when the same message explicitly states that Support cannot perform the reset. The new operation guard recognizes operation verbs but not their negation, so safe boundary guidance is treated as positive reset execution.

## Cost and upgrade

The repeated cost comes from adding a stronger lexical veto without pairing it with the same negation semantics already required elsewhere in the Support policy. The author’s positive-operation fixtures passed, yet the safe mirror sentence was absent. Each intent rule should ship with four generated forms: positive operation, negated operation, navigation alone, and navigation plus each operation polarity, in both languages and through the final caller.

That small truth table is the efficient one-prompt contract. It prevents a correction from swapping a false positive for a false negative and makes the expected route explicit before implementation.

## Measurements and limits

- Fresh detector: 6 identity, 5 branded-feature, 3 unbranded, 5 unsupported, 10 recovery-positive, 6 positive-operation negative controls, 2 manifest records, and 2 new negated-operation cases.
- Caller observations: 7 real-corpus contexts, 8 classifier paths, 5 synthetic answer-service paths.
- Corpus/manifest/version and prior four dispositions passed; only the two bilingual negated-operation neighbors failed.
- Author’s 591/591 affected tests are retained. No broad suite, typecheck, actual model, HTTP, browser, preview, credential, or reset traffic was repeated.
- Both product lanes ended clean; temporary links were removed and the lease was released.
- Forgot destination and user acceptance remain separate. Usage is **UNAVAILABLE**.

## Skills loaded

- `superpowers:using-superpowers` — retained same-session BODY read
- `.claude/skills/heartbeat-protocol/SKILL.md` — retained same-session BODY read
- `.claude/skills/heartbeat-reviewer/SKILL.md` — retained same-session BODY read
- `superpowers:verification-before-completion` — retained same-session BODY read
- `superpowers:systematic-debugging` — retained same-session BODY read
- `superpowers:test-driven-development` — retained same-session BODY read
