# REV1 case file — CP1 correctness review, pass 4

Question investigated:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Recorded 2026-09-17. Node `REV1_P4`, ticket `t_1600c03e`, reviewer session `/root/plan_review`, exact product revision `ee06cd875956b76548ffb04d9dff29e4af8bbb74`, prior review base `5cbfc6d483aae0f56eabfdee00a6829e09e76c3d`, evidence freeze `667494a414bcaf1de30d1730f054893c9275b74d`.

## Cause and verdict

The scoped verdict is **REWORK**. The pass-4 correction succeeds for the assigned English additive-operation, supplied-value, benign-state and structural-path cases, but the shared lexical analyzer omits the ordinary Romanian plural `coduri` from its credential labels. Therefore this claim is admitted by both answer and case-summary policy:

```text
Asistența nu cere coduri de autentificare; de asemenea le poate valida.
```

The actual service then seals, persists and returns it after one model attempt. This is not a scope-boundary failure: `de asemenea` already creates a new operation scope, Romanian `valid…` is already an operation stem, and the equivalent construction with recognized `parole` passes its rejection oracle. The missing credential-term fact prevents the shared credential-operation screen from joining the term and positive operation.

The correction boundary is finite: every shipped Romanian singular/plural code label must produce the shared credential fact, and the positive-operation invariant must hold at answer, case-summary and actual service sinks. I am deliberately not prescribing a patch. The exact Forgot-password destination remains a separate unresolved owner gate.

## Evidence and cost of the loop

Fresh affected tests passed 375/375 across six files: 345 unit tests and 30 integration tests. The first combined capture recorded 345 passes and 30 skipped because the restricted sandbox denied the integration listener with `EPERM`; the exact integration file passed 30/30 in the authorized inert environment. The retained author final25 is 25/25 files, 1,080 passed and one TODO. The project typecheck still has the same inherited 76 diagnostics and is not claimed as passing.

The first direct fixture stopped on the product counterexample. I changed only the reviewer-owned fixture to collect the full bounded matrix. Its second attempt exposed an incorrect fixture expectation that every result would carry the fallback action; an admitted hostile draft correctly reflected its empty model action list. The third capture completed and retained the product failure. These captures are all preserved so the distinction between product behavior, fixture error and environment restriction remains reviewable.

The completed control also proved that supplied values were removed from analysis, model ingress, sealed bytes and persisted bytes; benign unavailable states remained exact; subject-led benign prose survived; English additive-positive and encoded-path drafts recovered to the exact fallback; safe independently negated and benign assignment controls remained usable; usage, source/action resolution and relay health stayed coherent; and the exact 36-entry reviewed corpus loaded unchanged.

## What repeatedly cost tokens and how to improve it

The recurrent cost is a hand-maintained multilingual regex matrix tested with representative phrases rather than the Cartesian product of credential kind, grammatical number, language, conjunction/scope form and operation. The existing tests covered `parole` with `de asemenea` and several singular/definite `cod…` labels, yet missed indefinite plural `coduri`. Each correction therefore invites another lexical edge after broad suites are already green.

The efficient upgrade is a single declarative credential lexicon that enumerates admitted surface forms by language and kind, with generated contract fixtures across every form and every policy sink. The first implementation packet should require those generated cases, one direct-service persistence control, and the exact affected-suite command. That makes the one-prompt target realistic: the author receives a closed data table and finite invariant instead of reconstructing Romanian morphology from scattered examples.

## Measurements and limits

- Mechanical custody: 24 immutable inputs, 108 product files and 10 changed paths matched GATE_P4 hashes.
- Fresh execution: five unit files, 345/345; one integration file, 30/30; one completed direct-import matrix with the single blocker above.
- Retained evidence: author final25 25/25 files, 1,080 passed, one TODO; unchanged pass-3 correctness dispositions except `COMPAT_P3_STATE`, freshly closed here.
- No external model/provider, HTTP, browser, account, credential, reset or preview traffic occurred. Synthetic in-memory ports were used.
- Product primary and detached worktrees ended clean at exact `ee06cd875956b76548ffb04d9dff29e4af8bbb74`; temporary dependency links were removed. Source was no-touch and no source working-byte exactness is claimed.
- Heavy lease release was recorded on `t_1600c03e`. Root retains ticket/finding state and acceptance authority.
- Actual reviewer token/cost usage is **UNAVAILABLE**.

## Skills actually loaded in this reviewer session

- `superpowers:using-superpowers`
- `.claude/skills/heartbeat-protocol/SKILL.md`
- `.claude/skills/heartbeat-reviewer/SKILL.md`
- `superpowers:verification-before-completion`
- `superpowers:systematic-debugging`
- `superpowers:test-driven-development`
