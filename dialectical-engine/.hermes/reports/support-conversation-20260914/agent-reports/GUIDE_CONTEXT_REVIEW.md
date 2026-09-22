# GUIDE_CONTEXT_REVIEW self-report

## Assignment and result

- Node/ticket/session: `GUIDE_CONTEXT_REVIEW` / `t_5cd7ad0c` / `/root/plan_review`
- Revision: clean immutable `9bf56f95711d19e6405fff5db06c4ad3d606bd68`
- Verdict: **TEST FIXTURE REWORK**; no production regression observed in the bounded static diagnosis
- Scope: exact 14 `support-answer-context.test.ts` failures, their shared selector precondition, and immediate answer/context consumers
- Product work and dynamic checks: none

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Murder-case reconstruction

The 14 apparent victims are one event. A shared synthetic request asks for `crosscap alpha beta gamma`, while each affected article supplies only `crosscap` and one other term. The corrected selector requires stronger coverage: two matches over four direct words are only 0.5, below its 0.6 threshold. Synthetic IDs receive no production capability fallback, so selection returns empty. The answer service exits at `NO_SOURCE` before every property under test.

That explains the exact pattern without inventing fourteen causes: one empty system, five more source-gated outcomes, seven completion spies at zero, and zero of two diagnostic identities. The production selector correction introduced the stricter condition at `141f0472`; the fixture file did not change. No relevant file changed again before the composed `9bf56f95` run.

## What to improve

Change only the fixture helper's default text to the unique exact sentinel `crosscap`. That makes relevance an explicit precondition and lets the existing assertions test cap accounting, snapshot identity, diagnostics, hostile-output rejection, storage safety, and attempt identity. Production selection and unsupported-topic thresholds should not be loosened to rescue a synthetic fixture.

The repeated token cost came from tests hiding two responsibilities in one helper: arranging an answerable context and testing behavior after answerability. A small fixture builder should name the precondition, for example `answerableSyntheticRequest("crosscap")`, and assert that at least one source was selected before evaluating downstream spies. Then a selector change fails with “fixture not answerable” instead of fourteen misleading policy failures.

A stronger one-prompt workflow should run a cheap fixture-precondition inventory before the broad union. It would report which downstream tests never crossed the source-selection boundary, group them by shared helper, and propose the narrow fixture-only repair while retaining the exact product relevance matrix. This diagnosis required no new model or runtime sampling; the immutable source and first failed frame were sufficient.

## Evidence and limits

- Indexed custody: 4/4 code files and 14/14 evidence inputs exact.
- Failed frame: 32/33 files; 1,454 passed, 14 failed, 1 todo; all failures in one test file.
- Root cause: immutable source math and observed `NO_SOURCE`/zero-call/zero-report outputs.
- Proposed effect: static inference only; no dynamic PASS claim.
- Checkout: remained clean and unchanged at `9bf56f95711d19e6405fff5db06c4ad3d606bd68`.
- Usage: **UNAVAILABLE**. User alone accepts CP1.

## Skills loaded

Retained same-session actual-body reads: `using-superpowers`, `heartbeat-protocol`, `receiving-code-review`, `heartbeat-worker`, `test-driven-development`, `systematic-debugging`, and `verification-before-completion`. No new skill body was read for this continuation.
