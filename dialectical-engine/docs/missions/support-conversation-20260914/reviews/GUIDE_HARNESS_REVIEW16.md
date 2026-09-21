# GUIDE_HARNESS_REVIEW16 — full/compact selector and stage review

- Ticket: `t_4f5a40ff`; run `203`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Reviewed on: `2026-09-20T16:42:55.786407Z`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Freeze: `0312f36640dfbb8ae0cf24e7312e64c73d35dcd7`
- Verdict: **PASS_BOUNDED_SELECTOR_AND_STAGE_CORRECTION**

## Historical boundary and actual producer

PROBE5 proves two completed full transitions and a compact/RO `READY` checkpoint followed by an unclassified outer failure. The exact exception was not retained. `READY` is persisted before language selection and before return to the caller's private-control assertion, so entry into that assertion remains unproved. This review does not claim the static selector flaw was the historical exception.

The flaw itself is source-proved. Both BIND15 consumers selected `.supportDesk .supportLanguage` after compact `READY`, while current `Assistant.tsx` renders the full controls beneath `.supportDesk` and the compact controls beneath `.supportAssistantCompact`. BIND16 replaces that shared post-READY operation in capture and probe with the imported `selectGuideSupportLanguage` adapter. Its root mapping matches the actual JSX hierarchy.

## Shared selector correction

The adapter accepts only `full` or `compact`, requires exactly two locale buttons and exactly one active button, accepts only active `EN`/`RO`, and requires exactly one requested button. If the requested locale is already active it returns without clicking. Otherwise it issues one click, waits on the surface-specific active selector, and re-reads the active control before returning. The five producer-bound fixtures cover full/EN unchanged, full/RO change, compact/RO unchanged, full/EN remount change, and compact/EN unchanged. A compact fixture proves the old full-only selector sees zero controls while the imported adapter reaches and changes the compact control. Absent, duplicate, and invalid-active fixtures fail closed.

The capture and zero-request probe both import this exact helper. Their full readiness interaction remains full-specific and retains handler hydration, public mode transition, transition-idle restore and same-locale state preservation. Compact still performs one widget activation after handler hydration. The capture's five session boundaries and explicit storage resets are unchanged; no new silent transcript reset was added. The probe retains its all-route Support abort guard and both consumers retain post-open private-control checks.

## Post-READY failure attribution and persistence

Both consumers record `ENTERED` and `PASSED` for `COOKIE_SETTLING`, `LOCALE_SELECTION`, `PRIVATE_CONTROL_CHECK`, and `TRANSITION_COMPLETION`. Each record contains only surface, language, stage and state. Failures are reduced to the four closed `GUIDE_HARNESS_POST_READY_*_FAILED` codes; raw DOM and arbitrary exception text are not persisted. In capture, the entered stage remains in `currentPostReadyStage` and drives the final fixed failure code. In the probe, an unclaimed post-READY error is projected with its current surface, language and stage.

The relocated probe imports `createGuideProbeCheckpoint` from its adjacent module; the previous missing `EVIDENCE_ROOT` closure is absent from the production writer. The writer creates the output with `wx`/`0600`, updates the same file, and the retained regression checks initial exclusivity, updates and fixed failure persistence. Once browser setup reaches the guarded transition body, `finally` closes the context and removes the unique temporary profile on success or failure. Launch/setup before that body remains outside the cleanup guard, an unchanged operational limit rather than evidence of live success.

## Composition and bindings

All 124 REVIEW16 indexed inputs and all 86 BIND16 author inputs matched their recorded hashes and sizes. The 35 receipt artifacts matched. The clean product worktree remained at `152eed4da1cd3e66b74d8301159ba76427552409`.

The sealed proof contains the prior 130 names as an exact prefix plus six focused additions, for 136/136. Those cases bind the current JSX roots, old compact miss, five locale branches, malformed-control negatives, fixed stage codes and both actual consumers. Matrix54 remains byte-identical at `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`; adapter negatives remain 3/3 with zero importer calls and zero successful rows. FINAL9, strict44, suite34, API/DOM, source/action/outcome, privacy/credential, pacing, capacity, navigation and session dispositions are retained.

The ordered-eight digest independently recomputes to `fa91eede37beb7ac5f51366a9d4c7e89d62dc72c1033810d868bd5d2bf0c354c`. The first final frame is retained and failed only because its copied regression expected a different historical stderr; the corrected frame binds the reviewed `ReferenceError: EVIDENCE_ROOT is not defined` fact and passes.

## PROBE6 contract

The README, probe contract, run-control consumer and author receipt agree on:

```sh
node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND16/probe-zero-request-ui.mjs 152eed4da1cd3e66b74d8301159ba76427552409 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE6.json > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_UI_TRANSITION_PROBE6-LIVE8.log 2>&1
```

The bound cwd is the clean product worktree. Static guard evaluation accepted that exact revision/output pair and rejected the stale PROBE2 basename, wrong root, extra argument and malformed revision: 5/5. The script hash is `666a54b1d9cd547951e609e79dd06ab88eb517bcc21f48a76ae385a921f053d6`; the pinned executable exists. All 58 checked future paths—probe output/log/profile, GUIDE16 receipt and 54 screenshots—are absent.

## Limits

This is a static bounded PASS for the selector/stage correction, not a browser result. PROBE6 has not run; it must independently prove all five actual transitions before fresh-capacity full54 work. No browser, runtime, HTTP, DB, Support/model, status, capacity, product, KB, Git or harness action ran. No synthetic response or private data was used. The PROBE5 exception and compact private-control entry remain unknown. Forgot remains unresolved and actionless; CP1 is incomplete and CP2 gated. No testability, readiness or acceptance is claimed.
