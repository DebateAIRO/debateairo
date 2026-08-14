# ASK-01 Codex handoff

Ticket: `t_2eb80121`  
Worker session: `01a00017-b58a-70f2-b373-363486aa38aa`  
Branch/worktree: `dev` / `/Users/vladmihaimiron/Documents/DebateAIRO`  
Comments read through: `2026-08-14 14:55` (`CODEX HEARTBEAT`)

## Inventory

- `apps/v2-ui/app/new/defaults.tsx`
  - derives the ratified maker maximum from the existing `runCostEnvelope` Set-A arithmetic and provenance;
  - submits `min(configured maker count, ratified maximum)`;
  - removes the retired machine-field renderer.
- `apps/v2-ui/app/new/page.tsx`
  - removes the Advanced disclosure and all five machine controls;
  - continues computing agent count, ask time, user-relative owners, and scope for submission;
  - preserves risk/budget/depth on the DR-166-C surface.
- `tests/render/ux01-new-debate-form.test.tsx`
  - pins configured=3/ratified=2 bare-Start acceptance;
  - pins fixture-ratified=3 without ASK code changes;
  - pins the rendered absence of Advanced and all five machine controls;
  - preserves PROV-01 and DR-166-A assertions.
- `tests/unit/v2ui-pages.test.ts`
  - replaces the superseded editable-machine-control source contract with DR-180's machine-derived/no-disclosure contract.
- `docs/missions/2026-08-06-v3-programming/handoffs/ASK-01-progress.log`
  - major-step progress receipts.

Pre-existing, not owned or modified by this worker: `decisions-ledger.md` was already dirty and `goal-packets/ASK-01-codex-goal.md` was already untracked at claim.

## Fixture-by-fixture status and acceptance evidence

| Fixture / acceptance row | Result | Evidence |
|---|---|---|
| configured=3, ratified=2 | GREEN | bare form submits `agent_count: 2`; acceptance stub returns `run:accepted`; router receives `/debate/run%3Aaccepted` |
| configured=3, fixture-ratified=3 | GREEN | the same `deriveAgentCountDefault` returns `3` when the fixture envelope carries the M=3 Set-A depth-2 ceiling `174` |
| no Advanced disclosure | GREEN | rendered HTML contains no `Advanced`, `machineOwnedAskFields`, or machine-field control IDs |
| machine values persisted | GREEN | collapsed/bare submit still carries `agent_count`, `as_of`, `decision_owner`, `action_owner`, and `decision_scope` |
| PROV-01 | GREEN | untouched risk sends `MACHINE_DEFAULT`; edited risk sends `ASKER` and never `MACHINE_DEFAULT` |
| DR-166-A | GREEN | two session tokens still derive distinct asker-relative owner values while neither value renders as a control |
| forbidden guard/seed/contract work | GREEN | `git diff --exit-code -- apps/runner/src/index.ts packages/kernel/src/index.ts`; no migrations, register seed, contract vocabulary, or standing-stack control changed |

## TDD RED -> GREEN -> REFACTOR

RED command:

```text
pnpm vitest run tests/render/ux01-new-debate-form.test.tsx --reporter=verbose

Test Files  1 failed (1)
Tests       5 failed | 11 passed | 1 skipped (17)

expected '3' to be '2'
Received: "3"

expected rendered HTML not to contain 'Advanced'

ASK-01 live regression:
Expected agent_count: 2
Received agent_count: 3
```

GREEN focused command:

```text
UX01_LIVE_STACK=1 UX01_LIVE_BASE_URL=http://127.0.0.1:8790 \
  pnpm vitest run tests/render/ux01-new-debate-form.test.tsx --reporter=verbose

Test Files  1 passed (1)
Tests       17 passed (17)
Duration    350ms
```

REFACTOR under green:

- removed dead Advanced-only component/state/provenance rendering;
- restored the existing M-guard byte-for-byte after confirming the packet forbids guard changes;
- derived the maximum from the already-ratified `runCostEnvelope` source rather than adding a register row or fixed panel-size literal;
- updated stale source-level assertions to DR-180.

## Mutation ledger (P1)

| Load-bearing assertion | Named mutation killed | Confirming test |
|---|---|---|
| lawful count is `min(configured, ratified)` | derive from configured count alone | `ASK-01 RED + mutations...` expects 2 for configured=3/M=2 |
| derivation is not hardcoded to today's 2 | hardcode `agent_count = 2` | the same test expects 3 for the fixture-ratified M=3 envelope |
| Advanced is gone in every render state | re-add the disclosure/button/component | `DR-180 + MUTATION disclosure...` plus the source contract test |
| machine values remain submitted | remove hidden derivation or omit a machine field | `DR-166-B + MUTATION collapsed-submit...` |
| provenance semantics are untouched | force `tier_source = MACHINE_DEFAULT` after user edit | `PROV-01 mutation-proof...` |
| owners remain asker-relative | derive owners from token/session constants | decision/action owner mutations and the two-session DR-166-A fixture |

## Verification with real output

Vitest collection proof:

```text
pnpm vitest list tests/render/ux01-new-debate-form.test.tsx

tests/render/ux01-new-debate-form.test.tsx > ... > ASK-01 RED + mutations: caps configured makers at the ratified guard source without hardcoding two
tests/render/ux01-new-debate-form.test.tsx > ... > DR-180 + MUTATION disclosure: renders only the DR-166-C ask surface and never renders machine controls
tests/render/ux01-new-debate-form.test.tsx > ... > ASK-01 live regression: configured=3 and ratified=2 makes bare Start submit two and receive acceptance
tests/render/ux01-new-debate-form.test.tsx > ... > PROV-01 mutation-proof: a user-edited risk tier is sent as ASKER, never MACHINE_DEFAULT
```

Typechecks:

```text
pnpm run typecheck
$ tsc --noEmit

pnpm --filter dialectical-engine-v2ui typecheck
$ tsc --noEmit -p tsconfig.json
```

Architecture/source audits:

```json
{"edgeRowsChecked":27,"violations":[]}
{"blocking":[]}
```

Full suite (JSON reporter, untruncated receipt):

```json
{
  "numTotalTestSuites": 228,
  "numPassedTestSuites": 228,
  "numFailedTestSuites": 0,
  "numTotalTests": 588,
  "numPassedTests": 587,
  "numFailedTests": 0,
  "numPendingTests": 1,
  "success": true
}
```

The pending test is the explicit read-only live-stack gate; rerunning with `UX01_LIVE_STACK=1` produced `17 passed (17)` as pasted above.

## Live verification (P3)

- Performed: read-only `/v1/deployment` and `/v1/session` against the already-running stack through the opt-in render test; local updated `/new` rendered ready and all 17 tests passed.
- Not performed: a real live ask submission. That would write product data and cross an IMPORTANT OPERATION; the packet also forbids standing-stack control. The exact configured=3/ratified=2 acceptance path is covered by the reproduce-first acceptance stub and must be included in product/human verification after integration/restart authorization.

## Deferrals and questions for V

- No implementation deferrals.
- No questions for V.
- Peer reviewers should independently rerun the mutation ledger and inspect the Set-A inverse derivation against DR-172/GROK-01 arithmetic.
