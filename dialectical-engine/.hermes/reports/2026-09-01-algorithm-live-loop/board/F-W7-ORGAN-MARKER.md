# [unassigned] F-W7-ORGAN-MARKER · dispatch on an ORGAN MARKER, not on prompt text

```yaml
state:
  ticket: F-W7-ORGAN-MARKER
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T11)'s F3 and U1 (SDD ledger :107, :112; the draft
is `task-11-report.md` §"F3 (Minor, deferred, no code) — ticket draft").

**Why now.** W7 changed ONE clause of two system prompts and broke **27 assertions across four provider
doubles — one of them silently.** The blast radius of a correct, reviewed, in-package prompt edit is six
files outside the package, and nothing in the judgement package can see them:
`tests/integration/database.test.ts` (PANEL + REVIEW dispatch) · `tests/integration/t17-envelope-ledger.test.ts`
(`classify`) · `acceptance/ceremony.test.ts` · `acceptance/panel-multi-maker.test.ts` ·
`tests/unit/t03-judge-panel.test.ts` · `tests/unit/judgement.test.ts`.

Fix round 1 moved the four dispatchers from prose to STRUCTURE, which removed the silence but not the
coupling: **they now key on schema keys that a schema change can move.**

**The remedy already exists in this repo and could not be reused.**
`acceptance/test-fixtures/evaluator-double.ts` imports `EVALUATOR_CONTRACT_TEXT` — the SHIPPED prompt
constant — and asserts at import that it survives JSON encoding unchanged, so its discriminator cannot go
stale silently. The judgement prompts are inline template literals, not exported constants, so no double
could do the same. **That is the root cause: a solved problem one package could not reuse.**

**Remedy, strongest first.** (a) Put an explicit `organ` marker in the
`debateai.untrusted-prompt-fields.v1` envelope (or a role key on `ProviderCallRequest`), export its
vocabulary, and dispatch every double on it — prose AND schema become editable at zero blast radius.
(b) Failing that, export the three system prompts as named constants with the evaluator double's
import-time escape-safety assertion, and have the doubles import them.

**Travelling with it:** `t17-envelope-ledger`'s `classify` still ends in a terminal `return "JUDGE"`, so
an unrecognised organ is silently called a judge. The observability row added in fix round 1 is the
interim guard, not the fix. STRENGTH: entailed.
