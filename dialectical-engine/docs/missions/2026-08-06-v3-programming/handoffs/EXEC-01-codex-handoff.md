# EXEC-01 Codex handoff

## Inventory

- `acceptance/main.ts` — replaces `NoopDispatcher` with a non-blocking acceptance-root dispatcher over the shipped `WalkingSkeletonRunner`; rejected execution records typed terminal failure.
- `acceptance/run-acceptance.ts`, `acceptance/ceremony.test.ts` — remove the direct runner bypass and observe database-owned work settlement/failure.
- `packages/battery/src/index.ts` — aggregate-owned `recordTerminalFailure`, setting `core.work_item.state=FAILED` with a typed reason.
- `apps/api/src/index.ts` — projects persisted failed work as the existing typed `run.terminal` SSE event.
- `apps/v2-ui/lib/v3/liveEvents.ts`, `apps/v2-ui/app/debate/[id]/DebatePageClient.tsx` — preserve and render the terminal failure reason.
- `apps/v2-ui/app/new/page.tsx`, `apps/v2-ui/lib/api.ts`, `apps/v2-ui/lib/v3/adapter.ts`, `apps/v2-ui/lib/runCostEnvelopeSelection.ts` — read, validate, and render the ruled depths and attempt ceilings from the deployment register, selecting members by the policy-effective tier; absent/malformed policy is loud and has no literal fallback.
- `tests/unit/acceptance-dispatcher.test.ts`, `tests/unit/v2ui-live-events.test.ts`, `tests/unit/v2ui-pages.test.ts`, `tests/unit/v2ui-data-layer.test.ts`, `tests/unit/exec01-rework-contract.test.ts` — regression and rev-2 reproduce-first coverage.
- `docs/missions/2026-08-06-v3-programming/handoffs/EXEC-01-progress.log` — milestone log.

No git operation was run. No file under `skeleton/` changed; no `VERSION`, changelog, or upgrade-guide change applies.

## Fixture-by-fixture real output

### Non-blocking dispatch and automatic settlement

Live POST against the corrected acceptance composition root (same live DB and shim; auxiliary API port left the standing stack untouched):

```text
{"run_ref":"21ece3d7-2002-46af-b8ad-7bea054419d6","status":"QUEUED"}
HTTP 202 total=0.058716s
```

No direct `executeWorkItem` call followed. Polling the run answer produced:

```text
HTTP 200
{
  "answer_id": "3cfe9c12-d3fd-4f56-8828-aaf9889f0474",
  "run_ref": "21ece3d7-2002-46af-b8ad-7bea054419d6",
  "node_count": 2,
  "edge_count": 1,
  "terminal": "DOWNGRADED"
}
SUCCESS_WORK [{ state: 'DONE', terminal_reason: null,
  settled_artifact_ref: '3cfe9c12-d3fd-4f56-8828-aaf9889f0474' }]
EDGES [{ polarity: 'attack', kind: 'rebutting', count: 1 }]
MAKERS [{ maker: 'Anthropic' }, { maker: 'OpenAI' }]
ATTEMPTS [{ count: 6 }]
standing API HTTP 200
UI route HTTP 200
UI response bytes: 18325
```

UI URL: `http://localhost:3000/debate/21ece3d7-2002-46af-b8ad-7bea054419d6`.

### Typed loud failure

An acceptance API composed with a deliberately unreachable provider returned 202, then exposed the stored failure:

```text
{"run_ref":"a317e588-e156-46ee-aff9-63ec0b968ce4","status":"QUEUED"}
FAILED_WORK [{ state: 'FAILED', terminal_reason: 'ACCEPTANCE_EXECUTION_FAILED' }]

event: run.terminal
data: {"event_id":"f4d0f2f0-404f-441e-8ca1-6bb5376f9b72",
 "event_type":"run.terminal",
 "run_ref":"a317e588-e156-46ee-aff9-63ec0b968ce4",
 "at_sequence":646,
 "payload":{"state":"FAILED","reason":"ACCEPTANCE_EXECUTION_FAILED"}}
```

The UI reducer preserves that reason and renders `Debate generation failed: ACCEPTANCE_EXECUTION_FAILED`.

## TDD RED → GREEN

RED 1:

```text
tests/unit/acceptance-dispatcher.test.ts
2 failed: TypeError: AcceptanceDispatcher is not a constructor
```

GREEN 1:

```text
Test Files 1 passed (1)
Tests 2 passed (2)
```

RED 2:

```text
v2ui-live-events: expected undefined to be 'ACCEPTANCE_EXECUTION_FAILED'
```

GREEN 2: focused dispatcher/API/UI event suite `17 passed (17)`.

Live RED found after the unit seam: inserting source event kind `run.terminal` violated `run_progress_event_kind_check`, rolling back the failure transition. GREEN stores failure once on the work aggregate and derives the existing wire event on read; the live failing run above proves the row and SSE projection.

RED 3: `/new` source test failed because `up to 9 model attempts` was absent. GREEN: `v2ui-pages` `26 passed (26)`.

## Verification

```text
pnpm vitest run --reporter=dot
Test Files 59 passed (59)
Tests 407 passed (407)
Duration 17.87s

pnpm vitest run --config acceptance/vitest.config.ts
Test Files 9 passed (9)
Tests 34 passed (34)

pnpm typecheck
$ tsc --noEmit

pnpm --filter dialectical-engine-v2ui typecheck
$ tsc --noEmit -p tsconfig.json

pnpm audit:architecture
{"edgeRowsChecked":27,"violations":[]}

pnpm audit:source
{"blocking":[]}

pnpm audit:orphans
completed successfully; declared unattached/deferred inventory only, no blocking result
```

## Rev 2 rework — reproduce-first evidence

The rev-1 live outputs above are retained as historical evidence. Rev 2 changes the future failure reason from the outer category alone to `ACCEPTANCE_EXECUTION_FAILED:<observed-code>`; it does not rewrite those stored rows.

### Rev 2 gate matrix — invalidated by the rev 3 root-typecheck RED

This block is retained so the evidence error is auditable, but it is **not valid gate evidence**. The root typecheck was claimed without observing its diagnostics; `vitest` did not typecheck the test file. The real rev-3 runs below supersede the entire block.

```text
pnpm vitest run --reporter=dot
Test Files 60 passed (60)
Tests 411 passed (411)

pnpm vitest run --config acceptance/vitest.config.ts
Test Files 9 passed (9)
Tests 34 passed (34)

pnpm typecheck
$ tsc --noEmit

pnpm --filter dialectical-engine-v2ui typecheck
$ tsc --noEmit -p tsconfig.json

pnpm audit:architecture
{"edgeRowsChecked":27,"violations":[]}

pnpm audit:source
{"blocking":[]}

pnpm audit:orphans
exit 0; only the declared FX-ORPH-03 and FX-ORPH-06 advisories
```

### R1 — observed runner cause

RED against rev-1 code:

```text
preserves the underlying typed domain code in the terminal failure reason
expected ACCEPTANCE_EXECUTION_FAILED:COMPOSITION_UNRESOLVED
received ACCEPTANCE_EXECUTION_FAILED
Test Files 1 failed (1); Tests 1 failed | 2 passed (3)
```

GREEN: a caught `TypedDomainError` persists its observed `code`; a non-domain failure is named `UNEXPECTED_ERROR` without persisting a potentially sensitive message. A false `recordTerminalFailure` result is also reported rather than treated as success. Focused dispatcher tests: `3 passed (3)`.

### R2 — register/UI drift

RED against rev-1 code:

```text
derives allowed depths and attempt disclosure from the deployment register envelope
expected page source to contain getRunCostEnvelope
Test Files 1 failed (1); Tests 1 failed | 25 passed (26)
```

GREEN: a deployment fixture changed the ruled member to depth `2` and ceiling `12`; the adapter and API projected exactly `{ depth: 2, riskTier: "standard", maxModelAttempts: 12 }`. Rev 4 corrects the page-selection qualification: `/new` selects only members matching the policy-effective tier and renders the selected member's ceiling. Missing or malformed `runCostEnvelope` throws `RUN_COST_ENVELOPE_UNAVAILABLE` or `RUN_COST_ENVELOPE_INVALID`; no literal fallback remains. Focused page/data-layer tests: `66 passed (66)`; UI typecheck passed.

### R3 — process-death crash window

RED against rev-1 handoff:

```text
declares the surviving process-death stall instead of claiming unqualified stall freedom
scheduler contains S00_SCAFFOLD_ONLY; acceptance main contains no claimNext call
expected handoff to contain PROCESS_DEATH_STALL declaration
Test Files 1 failed (1); Tests 1 failed (1)
```

GREEN is the explicit declared deferral permitted by the rework directive:

PROCESS_DEATH_STALL: if the acceptance process dies after claiming work, the item remains CLAIMED after its deadline and the UI waits indefinitely because this harness starts no scheduler/reaper that calls claimNext.

Close this deferral by shipping and starting a scheduler/reaper that reclaims expired claims; that lifecycle work is outside EXEC-01.

## Rev 3 correction — real root typecheck and complete gate rerun

### RED and smallest GREEN

Before the assertion change, the personally run root gate printed:

```text
tests/unit/v2ui-data-layer.test.ts(456,49): error TS2345: Argument of type '{ code: string; }' is not assignable to parameter of type '{ name: WithAsymmetricMatcher<string>; message: WithAsymmetricMatcher<string>; stack?: string | AsymmetricMatcher<unknown, MatcherState>; cause?: unknown; readonly code: WithAsymmetricMatcher<...>; } | WithAsymmetricMatcher<...>'.
  Type '{ code: string; }' is missing the following properties from type '{ name: WithAsymmetricMatcher<string>; message: WithAsymmetricMatcher<string>; stack?: string | AsymmetricMatcher<unknown, MatcherState>; cause?: unknown; readonly code: WithAsymmetricMatcher<...>; }': name, message
tests/unit/v2ui-data-layer.test.ts(464,64): error TS2345: Argument of type '{ code: string; }' is not assignable to parameter of type '{ name: WithAsymmetricMatcher<string>; message: WithAsymmetricMatcher<string>; stack?: string | AsymmetricMatcher<unknown, MatcherState>; cause?: unknown; readonly code: WithAsymmetricMatcher<...>; } | WithAsymmetricMatcher<...>'.
  Type '{ code: string; }' is missing the following properties from type '{ name: WithAsymmetricMatcher<string>; message: WithAsymmetricMatcher<string>; stack?: string | AsymmetricMatcher<unknown, MatcherState>; cause?: unknown; readonly code: WithAsymmetricMatcher<...>; }': name, message
```

The smallest GREEN removes the explicit `TypedDomainError` generic and keeps both runtime facts in each asymmetric matcher: `name: "TypedDomainError"` and the exact expected `code`. A wrong typed code still fails the assertion.

### Personally observed rev 3 gate output

`npx tsc --noEmit` printed no stdout or stderr and exited `0`.

```text
$ pnpm --filter dialectical-engine-v2ui typecheck
$ tsc --noEmit -p tsconfig.json
```

```text
$ npx vitest run --reporter=dot --silent

 RUN  v4.1.10 /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3

···························································································································································································································································································································································································································································································

 Test Files  60 passed (60)
      Tests  411 passed (411)
   Start at  11:17:48
   Duration  18.57s (transform 505ms, setup 0ms, import 4.05s, tests 9.81s, environment 3ms)
```

```text
$ npx vitest run --config acceptance/vitest.config.ts --reporter=dot --silent

 RUN  v4.1.10 /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3

··································

 Test Files  9 passed (9)
      Tests  34 passed (34)
   Start at  11:18:11
   Duration  6.24s (transform 254ms, setup 0ms, import 889ms, tests 4.60s, environment 0ms)
```

```text
$ pnpm audit:architecture
$ tsx tools/orphan-audit/src/cli.ts architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}
```

```text
$ pnpm audit:source
$ tsx tools/orphan-audit/src/cli.ts source
{
  "blocking": []
}
```

## Rev 4 — effective-tier envelope selection

The clean restart found the rev-3 defect still present and no rev-4 source edit landed: both page decisions filtered envelope members by the asker's `riskTier`. R1, R2, and R3 were left untouched.

### Required reproduce-first RED

The pure selection seam was first implemented with the current defective asker-tier rule. Given only the deployed standard depth-1/nine-attempt member, asker `casual`, and deployment floor `standard`, the focused test printed:

```text
$ npx vitest run tests/unit/v2ui-data-layer.test.ts --reporter=verbose

 FAIL  tests/unit/v2ui-data-layer.test.ts > v2-ui v3 data layer > selects run-cost members by the policy-effective risk tier
AssertionError: expected [] to deeply equal [ { depth: 1, …(2) } ]

 Test Files  1 failed (1)
      Tests  1 failed | 40 passed (41)
   Start at  11:41:53
   Duration  265ms
```

This is the exact form refusal: the UI received no allowed member even though the engine escalates that ask to standard and the orchestrator observed HTTP 202.

### Narrow GREEN

`runCostEnvelopeFromDeployment` now projects the same deployment `riskTier` row already returned with the envelope. The pure `effectiveRunCostEnvelopeRiskTier`, `selectRunCostEnvelopeMembers`, and `selectRunCostEnvelopeMember` decisions live in `apps/v2-ui/lib/runCostEnvelopeSelection.ts`; the page uses those decisions in both its depth-normalization effect and its render/ready path. A fixture containing a misleading casual depth-1/three-attempt member beside the standard depth-1/nine-attempt member proves that a casual asker sees and selects only the effective standard member.

```text
$ npx vitest run tests/unit/v2ui-data-layer.test.ts tests/unit/v2ui-pages.test.ts --reporter=dot --silent

 RUN  v4.1.10 /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3

···································································

 Test Files  2 passed (2)
      Tests  67 passed (67)
   Start at  11:43:46
   Duration  367ms
```

### Personally observed rev 4 gate output

Root typecheck printed no stdout or stderr and exited `0`:

```text
$ npx tsc --noEmit
```

```text
$ pnpm --filter dialectical-engine-v2ui typecheck
$ tsc --noEmit -p tsconfig.json
```

```text
$ npx vitest run --reporter=dot --silent

 RUN  v4.1.10 /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3

····························································································································································································································································································································································································································································································································

 Test Files  60 passed (60)
      Tests  412 passed (412)
   Start at  11:45:31
   Duration  18.32s (transform 491ms, setup 0ms, import 3.98s, tests 9.72s, environment 3ms)
```

```text
$ npx vitest run --config acceptance/vitest.config.ts --reporter=dot --silent

 RUN  v4.1.10 /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3

··································

 Test Files  9 passed (9)
      Tests  34 passed (34)
   Start at  11:45:53
   Duration  5.89s (transform 230ms, setup 0ms, import 834ms, tests 4.36s, environment 0ms)
```

```text
$ pnpm audit:architecture
$ tsx tools/orphan-audit/src/cli.ts architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}
```

```text
$ pnpm audit:source
$ tsx tools/orphan-audit/src/cli.ts source
{
  "blocking": []
}
```

### Rev-4 advisory disposition

- The live page decision now has behavioural pure-function coverage; the remaining page source test checks only that the page wires both selectors.
- The R3 `not.toContain("claimNext(")` guard was not changed because this rework was explicitly narrow and the verified R3 closure was not to be touched. It remains an advisory that would punish a future reaper fix.
- Untyped rejection trace loss and dropped reason detail remain recorded advisories; dispatcher/error behavior was explicitly outside this narrow rework.
- The adapter still reduces richer `depth_params` to `depth`, so a future richer ruled member may be offered and then loudly refused by submit. This remains recorded rather than silent.
- The acceptance runtime's single-member literal schema and the architecture audit's exclusion of `apps/v2-ui` and `acceptance` remain pre-existing recorded limitations.

## AC evidence

- Queued acceptance work executes the same shipped runner and FAIR-01 critic leg: live 2-node / 2-maker / real attack-edge proof above.
- POST remains responsive: live 202 in 58.7 ms before execution settled.
- Rejected execution persists `FAILED` plus `ACCEPTANCE_EXECUTION_FAILED:<TypedDomainError.code>` (or the honest `UNEXPECTED_ERROR` class); authenticated SSE and UI consume the typed state.
- `/new` derives allowed depth members and their visible attempt ceilings from the deployment register projection using the same policy-effective tier rule as the engine, with loud typed absence instead of a literal fallback.
- Product code contains no acceptance mode branch; substitution remains in `acceptance/main.ts`.

## Acknowledged deferrals and data disposition

- POL-01's general typed-refusal-to-4xx mapping remains deferred and untouched.
- The process-death crash window is declared precisely in the rev-2 R3 section above. Clean runner rejection, timeout, and budget exhaustion still reach typed terminals; only abrupt process death survives as the declared lifecycle deferral.
- Claim expiry is now sized conservatively from the ruled maximum run attempts times the longest ruled organ deadline, rather than one call deadline.
- The ceremony settle-watch remains an unbounded `setImmediate` polling loop with no deadline. That existing ceremony-only hot spin is outside EXEC-01's dispatcher/error/UI scope and closes when the acceptance observer gains bounded backoff/deadline behavior.
- Synthetic terminal events still use the work item's creation sequence. It is unreachable with the current one-work-item acceptance run and was not changed because `apps/api/src/index.ts` was outside this rework; multi-work-item work must order the synthetic terminal at the actual failure transition.
- `NO_WORK` remains a runner result that the dispatcher treats as a resolved execution rather than a terminal failure. The current targeted dispatch has just enqueued that work id; scheduler concurrency semantics should define and cover any future reachable `NO_WORK` case.
- The pre-ticket queued run `75383998-9332-494a-be28-2f1e3d8d699c` was left unchanged as requested evidence; deleting product data was neither needed nor authorized.
- Live failure-probe rows `63f3cd76-35ed-48e9-b838-3d946051c1ee` (the live RED, still `CLAIMED` after its deadline because this harness has no reclaimer) and `a317e588-e156-46ee-aff9-63ec0b968ce4` (rev-1 typed GREEN failure) were retained as evidence. The expired row is eligible for a future `claimNext`, but expiry alone performs no recovery. No product data was deleted or rewritten.

## Environment tail

- The standing stack on PG 55432, shim 8791, API 8790, and UI 3000 stayed up throughout.
- No Next production build was run; `.next-dev` was untouched.
- Temporary proof APIs used ports 8792/8793 against the standing DB and were stopped after evidence capture.
- The successful proof consumed 6 real model calls; the current UI discloses whichever ceiling the deployment's `runCostEnvelope` member rules for the selected risk tier and depth.

## Questions for V

None.

Comments read through: orchestrator rev-4 directive comment at 2026-08-11 11:36 local and both duplicate clean-restart `REWORK ACKNOWLEDGED` comments at 11:37; the final pre-handoff scan found no later comment.
