# ASK-01 Codex handoff

Ticket: `t_2eb80121`  
Worker session: `01a00017-b58a-70f2-b373-363486aa38aa`  
Branch/worktree: `dev` / `/Users/vladmihaimiron/Documents/DebateAIRO`  
Comments read through: `2026-08-14 15:29` (`REWORK ACKNOWLEDGED`, after the `2026-08-14 15:27` diamond finding)

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
  - drives two bare-Start submissions through the real page under alpha and beta auth tokens, then proves each `createDebate` config carries its own asker's distinct `decision_owner` and `action_owner` while all five machine-control IDs remain absent;
  - pins refusal of a non-exact Set-A envelope ceiling;
  - pins the surviving Options disclosure's closed/open `aria-expanded`, `aria-controls`, and `additionalRunOptions` relationship;
  - preserves PROV-01 assertions.
- `tests/unit/v2ui-pages.test.ts`
  - replaces the superseded editable-machine-control source contract with DR-180's machine-derived/no-disclosure contract.
- `docs/missions/2026-08-06-v3-programming/handoffs/ASK-01-progress.log`
  - major-step progress receipts.

Pre-existing, not owned or modified by this worker: `decisions-ledger.md` was already dirty and `goal-packets/ASK-01-codex-goal.md` was already untracked at claim.

Rev2 is tests-only. Its sole tracked diff is `tests/render/ux01-new-debate-form.test.tsx`; no product file changed during rework. Byte comparison against the pre-rework clone returned `defaults=0 page=0`, with product hashes `30f3d540cf3575fc83a053e1c7124672e647c97d37c3443c8a0cbb5428510417` and `dc66e8e7a16e089393e2d8bc5b009ce327b19f6c94ec78dab10f0e6175314af2`, matching the rev1 review receipts.

## Fixture-by-fixture status and acceptance evidence

| Fixture / acceptance row | Result | Evidence |
|---|---|---|
| configured=3, ratified=2 | GREEN | bare form submits `agent_count: 2`; acceptance stub returns `run:accepted`; router receives `/debate/run%3Aaccepted` |
| configured=3, fixture-ratified=3 | GREEN | the same `deriveAgentCountDefault` returns `3` when the fixture envelope carries the M=3 Set-A depth-2 ceiling `174` |
| no Advanced disclosure | GREEN | rendered HTML contains no `Advanced`, `machineOwnedAskFields`, or machine-field control IDs |
| machine values persisted | GREEN | collapsed/bare submit still carries `agent_count`, `as_of`, `decision_owner`, `action_owner`, and `decision_scope` |
| PROV-01 | GREEN | untouched risk sends `MACHINE_DEFAULT`; edited risk sends `ASKER` and never `MACHINE_DEFAULT` |
| DR-166-A | GREEN | two bare-Start submits through the real page call `createDebate` twice: alpha carries alpha `decision_owner`/`action_owner`, beta carries beta values, the two tokens' values differ, and all five machine-control IDs are absent from both renders |
| envelope exactness (M7) | GREEN | depth-2 ceiling `109` is not an exact Set-A value and throws `ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE` with the exactness-refusal message |
| surviving Options a11y | GREEN | closed button has `aria-expanded=false` with no `aria-controls` and no panel; open button has `aria-expanded=true`, `aria-controls=additionalRunOptions`, and a matching panel ID |
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

### Rev2 reproduce-first correction

Exact M6 reproduction in an isolated clone, before changing the test:

```json
{
  "mutation": "decisionOwner/actionOwner fixed to asker:test-user-alpha",
  "numTotalTestSuites": 228,
  "numPassedTestSuites": 228,
  "numTotalTests": 588,
  "numPassedTests": 587,
  "numFailedTests": 0,
  "numPendingTests": 1,
  "success": true
}
```

After the tests-only correction, the same M6 mutation is RED:

```text
FAIL  DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
Expected beta decision_owner/action_owner: asker:test-user-beta
Received: asker:test-user-alpha
Test Files  1 failed (1)
Tests       1 failed | 17 passed | 1 skipped (19)
```

M7 exactness-removal replay is also RED:

```text
FAIL  M7: refuses a run-cost envelope ceiling that is not an exact Set-A maker maximum
AssertionError: expected function to throw an error, but it didn't
Test Files  1 failed (1)
Tests       1 failed | 17 passed | 1 skipped (19)
```

## Mutation ledger (P1)

| Load-bearing assertion | Named mutation killed | Confirming test |
|---|---|---|
| lawful count is `min(configured, ratified)` | derive from configured count alone | `ASK-01 RED + mutations...` expects 2 for configured=3/M=2 |
| derivation is not hardcoded to today's 2 | hardcode `agent_count = 2` | the same test expects 3 for the fixture-ratified M=3 envelope |
| Advanced is gone in every render state | re-add the disclosure/button/component | `DR-180 + MUTATION disclosure...` plus the source contract test |
| machine values remain submitted | remove hidden derivation or omit a machine field | `DR-166-B + MUTATION collapsed-submit...` |
| provenance semantics are untouched | force `tier_source = MACHINE_DEFAULT` after user edit | `PROV-01 mutation-proof...` |
| owners remain asker-relative through the real page | fix both submitted owners to the alpha asker | `DR-166-A + MUT-I...` drives alpha and beta bare-Start submits; beta expects beta owners and differs from alpha; mutation RED 1/17/1 |
| envelope ceilings must encode an exact Set-A maximum | remove the exactness refusal and silently round up | `M7: refuses a run-cost envelope ceiling...`; mutation RED 1/17/1 because ceiling 109 no longer throws |
| Options disclosure keeps a valid a11y relationship | advertise a missing panel while closed, or omit the relationship while open | `R3: the surviving Options disclosure exposes aria-controls only while its panel exists` pins both states and the matching panel ID |

## Verification with real output

Vitest collection proof:

```text
pnpm vitest list tests/render/ux01-new-debate-form.test.tsx

tests/render/ux01-new-debate-form.test.tsx > ... > ASK-01 RED + mutations: caps configured makers at the ratified guard source without hardcoding two
tests/render/ux01-new-debate-form.test.tsx > ... > M7: refuses a run-cost envelope ceiling that is not an exact Set-A maker maximum
tests/render/ux01-new-debate-form.test.tsx > ... > DR-180 + MUTATION disclosure: renders only the DR-166-C ask surface and never renders machine controls
tests/render/ux01-new-debate-form.test.tsx > ... > R3: the surviving Options disclosure exposes aria-controls only while its panel exists
tests/render/ux01-new-debate-form.test.tsx > ... > ASK-01 live regression: configured=3 and ratified=2 makes bare Start submit two and receive acceptance
tests/render/ux01-new-debate-form.test.tsx > ... > PROV-01 mutation-proof: a user-edited risk tier is sent as ASKER, never MACHINE_DEFAULT
tests/render/ux01-new-debate-form.test.tsx > ... > DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
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
  "numTotalTests": 590,
  "numPassedTests": 589,
  "numFailedTests": 0,
  "numPendingTests": 1,
  "success": true
}
```

The pending test is the explicit read-only live-stack gate. Rev2 reran it with `UX01_LIVE_STACK=1 UX01_LIVE_BASE_URL=http://127.0.0.1:8790`:

```text
Test Files  1 passed (1)
Tests       19 passed (19)
Duration    411ms
```

## Live verification (P3)

- Rev2 performed no product-data write and no standing-stack control. It reran read-only `/v1/deployment` and `/v1/session` against the standing stack through the opt-in render test; all 19 focused tests passed.
- Opus rev1 supplies the already-authorized product proof in `reviews/ask01-opus-rev1.md`: the real authenticated one-click Start flow was accepted with `agent_count=2` derived from three configured makers, settled, and served using 20/60 model attempts. That proof establishes product behavior; rev2 corrects only the tests that certify it.

## Deferrals and questions for V

- Next-mission item from both rev1 lenses/orchestrator: the runner M-guard literal and the form's envelope-derived count are independently editable sources; any future M=3 ratification must move them atomically or unify their source. This remains forbidden and deliberately untouched in ASK-01.
- No questions for V.
- Peer reviewers should independently rerun the mutation ledger and inspect the Set-A inverse derivation against DR-172/GROK-01 arithmetic.
