# FEEDBACK2_REV2 case file

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Node `FEEDBACK2_REV2`, ticket `t_7ced3540`, reviewer `/root/forgot_destination`, exact product `9e87fe5859b44fbd62dd485e03045e5bcde96bed`, freeze `b89d0bf11e01f39dbd7b53cc84ddaa05bde92055`.

## Verdict and cause

The bounded verdict is **REWORK**. The original unsupported-source sink is closed: all seven unsupported authority controls have no sources/actions, and both actual service cases stop before a model call with `NO_SOURCE`. The exact encoded-password, natural word-order, reset-token, identity-fact, and Romanian publishing members also pass.

Three adjacent defects remain. `Give me an overview of dialecticalengine.` regressed from `product-identity` to no source because `give` falls outside both overview and fact-question gates. The new recovery operation guard treats benign `check where` and explicitly negated validation as prohibited operations, so valid navigation falls to `/settings`. Conversely, Romanian recovery-code validation is not recognized as an operation because the guard expects `token` or `reset`, so it is captured as Forgot navigation.

## What repeatedly cost tokens

The correction still encodes intent by adding positive and negative words to independent regex/list gates. Each rework closes the supplied sentence while moving the boundary for a nearby compositional sentence. Tests then prove examples, not the rule that navigation intent, operation intent, and negation must be resolved together.

A more efficient one-prompt contract should define an intent table with explicit composition:

1. Parse recovery subject, navigation request, credential/operation target, and negation as separate bounded signals.
2. Treat operation terms as blocking only when they govern the requested action; do not let a negated or “check where” clause erase a later navigation request.
3. Cover both `token` and `code/cod` credential nouns in the same bilingual family.
4. Define identity-overview verbs in one shared semantic family and retain every previously passing owner/alias sentence as a regression control.
5. Run the real admitted corpus and actual in-memory sink once before author handoff, with source, action, model-call, persisted-output, and returned-output assertions in the same matrix.

That structure would reduce word-list oscillation and make the author’s first run discriminate the same boundary the separate reviewers currently rediscover.

## Measurements and limits

- Custody: 37/37 immutable inputs and 110/110 product files; unchanged reviewed corpus/components/manifest/catalog/loader comparison passed.
- Fresh observations: 20 real-corpus contexts, 29 recovery cases, five in-memory service paths.
- Ten failed assertions map to three findings: one identity-source regression, eight assertions for four suppressed navigation cases, and one Romanian code-validation capture.
- No real provider/model, HTTP, browser, database, preview, authentication, reset, or account traffic occurred.
- No arbitrary-language, arbitrary-encoding, model-semantic, live-preview, or complete-class guarantee is claimed.
- Five dependency links are absent; the detached lane is clean at exact `9e87fe58…`; heavy lease released before packaging.
- The Forgot destination remains unknown and separate. Root manages state; the user alone accepts CP1. Usage is **UNAVAILABLE**.

## Skills loaded

- `superpowers:using-superpowers` — retained same-session BODY read
- `.claude/skills/heartbeat-protocol/SKILL.md` — retained same-session BODY read
- `.claude/skills/heartbeat-reviewer/SKILL.md` — retained same-session BODY read
- `superpowers:verification-before-completion` — retained same-session BODY read
- `superpowers:systematic-debugging` — retained same-session BODY read
- `superpowers:test-driven-development` — retained same-session BODY read
