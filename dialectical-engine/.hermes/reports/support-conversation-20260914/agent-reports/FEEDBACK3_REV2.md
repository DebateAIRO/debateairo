# FEEDBACK3_REV2 case file

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Node `FEEDBACK3_REV2`, ticket `t_e3556e0a`, reviewer `/root/forgot_destination`, exact product `479763da1f586a217f36204cc81138aaa81c6f81`.

## Verdict and cause

The bounded verdict is **REWORK**. Every exact prior failure now passes. The identity overview is grounded through the actual service; check-where navigation, the author’s English/Romanian negations, Romanian recovery-code validation, unsupported branded authority, encoding, feature ranking, and mixed affirmative operations all retain their required behavior.

The remaining gap is the boundary around negation syntax. The implementation removes operation verbs only when a fixed negation expression matches. A typographic apostrophe, `am not asking`, and Romanian `nu doresc` miss that expression. Their validation clause is then treated as affirmative and suppresses a later valid recovery-page request, causing `/settings` fallback.

## What repeatedly cost tokens

Successive patches continue to extend phrase lists after each counterexample. This spends separate author/reviewer rounds on lexical variants that share one semantic relation: a prohibited operation is mentioned but explicitly rejected, while navigation is affirmatively requested.

A stronger one-prompt contract should specify clause-level intent instead of a growing negation prefix list:

1. Normalize supported apostrophe forms before intent matching.
2. Identify navigation and operation clauses independently.
3. Record whether each operation clause is affirmative or negated, using bounded English/Romanian negation families.
4. Let an affirmative operation veto navigation; let a negated operation coexist with a separate affirmative navigation clause.
5. Require mixed controls where a negated operation is followed by an affirmative operation, so negation removal cannot erase the real prohibition.

The real-corpus and actual-sink matrix should remain the single author handoff gate. Keeping every previously failing sentence in that matrix avoids reopening fixed families while a new semantic neighbor is added.

## Measurements and limits

- Custody: 33/33 immutable inputs and 110/110 product files; reviewed corpus/components/manifest/catalog/loader unchanged.
- Fresh observations: 20 contexts, 34 recovery cases, and six in-memory service paths.
- Six failed assertions map to three equivalent negation members; 31/34 recovery cases and all context/service cases pass.
- No real provider/model, HTTP, browser, database, preview, authentication, reset, or account traffic occurred.
- No arbitrary-negation, language, encoding, model-semantic, guide-scope, or live-preview guarantee is claimed.
- Five dependency links are absent; the detached lane is clean at exact `479763da…`; heavy lease released before packaging.
- The Forgot destination remains unknown and separate. Root manages state; the user alone accepts CP1. Usage is **UNAVAILABLE**.

## Skills loaded

- `superpowers:using-superpowers` — retained same-session BODY read
- `.claude/skills/heartbeat-protocol/SKILL.md` — retained same-session BODY read
- `.claude/skills/heartbeat-reviewer/SKILL.md` — retained same-session BODY read
- `superpowers:verification-before-completion` — retained same-session BODY read
- `superpowers:systematic-debugging` — retained same-session BODY read
- `superpowers:test-driven-development` — retained same-session BODY read
