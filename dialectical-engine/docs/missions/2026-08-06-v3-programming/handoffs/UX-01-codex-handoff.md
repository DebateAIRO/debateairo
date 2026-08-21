# UX-01 Codex handoff

Ticket `t_b2f82786` · worker session `019ff9a3-86e1-7912-9afb-8ba10ad44736` · first pass · DR-166 / DR-153.

## Rev3 — DR-166-A identity guard (supersedes rev2 test inventory/counts)

Rev3 is deliberately test-only. Production already derives both owner defaults from `session.asker_id`; no production code changed. The sole session fixture is now neutral (`token:test-user-alpha` / `asker:test-user-alpha`), and the render harness passes the current mock token through the real `AuthGate` child into the real `NewDebatePage`.

The new named guard mounts the real page twice from fresh hook state:

```text
token:test-user-alpha -> decisionOwner/actionOwner = asker:test-user-alpha
token:test-user-beta  -> decisionOwner/actionOwner = asker:test-user-beta
```

It asserts both tokens reached `readSession`, both rendered owner controls follow their asking user's session, and neither page contains the other identity.

### Rev3 collection and focused GREEN

```text
$ pnpm exec vitest list tests/render/ux01-new-debate-form.test.tsx
... DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
(13 default-collected cases printed; the conditional live case is separately collected/executed when UX01_LIVE_STACK=1)

$ pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx
Test Files  1 passed (1)
     Tests  13 passed | 1 skipped (14)
```

### Rev3 MUT-I RED and restoration

Temporarily replaced both production derivations with the neutral fixture person-constant:

```diff
- decisionOwner: session.asker_id,
- actionOwner: session.asker_id,
+ decisionOwner: "asker:test-user-alpha",
+ actionOwner: "asker:test-user-alpha",
```

The named real-page test failed on the beta mount:

```text
FAIL DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page
expected beta decisionOwner to match value="asker:test-user-beta"
received decisionOwner/actionOwner value="asker:test-user-alpha"
Test Files  1 failed (1)
     Tests  1 failed | 13 skipped (14)
```

The mutation was immediately restored to `session.asker_id`. Post-restore:

```text
Test Files  1 passed (1)
     Tests  1 passed | 13 skipped (14)
```

No `asker:v-session`, `session:v-session`, `token:v`, or `v-session` identity fixture remains in the UX-01 test or production form sources.

### Rev3 final gates

```text
pnpm typecheck
$ tsc --noEmit
exit 0

pnpm --filter dialectical-engine-v2ui typecheck
$ tsc --noEmit -p tsconfig.json
exit 0

pnpm lint
{ "edgeRowsChecked": 27, "violations": [] }
{ "blocking": [] }

pnpm exec vitest run
Test Files  73 passed (73)
     Tests  512 passed | 1 skipped (513)
Duration  23.47s

pnpm exec vitest run --config acceptance/vitest.config.ts
Test Files  9 passed (9)
     Tests  35 passed (35)

pnpm --filter dialectical-engine-v2ui test
V2_UI_NODE_TESTS_DISCOVERED=1
# tests 27
# pass 27
# fail 0

UX01_LIVE_STACK=1 UX01_LIVE_BASE_URL=http://127.0.0.1:8790 pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx -t 'LIVE READ-ONLY'
Test Files  1 passed (1)
     Tests  1 passed | 13 skipped (14)

bash tests/render-templates.sh && bash tests/lint-templates.sh
Rendered templates into /var/folders/.../tmp.QmpwbuUCFg
exit 0
```

The rev2 A2 provenance advisory is explicitly routed to another ticket and was not changed here. The unreachable sticky in-form identity-transition advisory was likewise outside the narrow rev3 order.

## Rev2 — supersedes the first-pass outcome and evidence below

Rev2 fixes Opus findings B1-B6 in the original worker session. Agent count now comes from the distinct `maker` values in the `configuredProviderSet` register row on the same `readDeployment` response used by the run-cost envelope. It mirrors the engine's `readDeploymentMakerCapability` vocabulary and ignores `model_ledger`, which is a per-run routing-outcome carrier. The provider-set, deployment-risk-floor, and run-envelope derivations have separate try/catch domains, so one invalid row cannot suppress the others.

The production form renders typed field-local absence and never seeds a fallback from a failure branch. The render suite now mounts the real `NewDebatePage`, runs its deployment/session effects, and proves deleting the state-seeding call goes RED. The `as_of` test pins `process.env.TZ = "UTC"` and also passes when the parent process starts under `TZ=America/Los_Angeles`.

Risk tier uses the deployment `riskTier` row only as a disclosed deployment-floor machine fact. Composition budget is no longer selected by a made-up “least registered budget” algorithm. Rev2 carries `low` as an explicitly provisional, editable product value pending the V question below.

### Rev2 inventory

- `apps/v2-ui/app/new/defaults.tsx` — independent provider-set maker count and risk-floor projections, typed error formatting, session defaults, config builder, and production-rendered editable controls.
- `apps/v2-ui/app/new/page.tsx` — independent envelope/provider/risk failure domains, honest absence, live state seeding, and explicit provisional budget copy.
- `tests/render/ux01-new-debate-form.test.tsx` — 13 listed cases: 12 hermetic real-page/pure tests plus one opt-in live-stack render.
- `docs/missions/2026-08-06-v3-programming/handoffs/UX-01-progress.log` — rev2 step receipts.
- This handoff — rev2 proof and the explicit V question.

### Rev2 RED / GREEN and list evidence

The revised suite first ran against rev1 production code:

```text
Test Files  1 failed (1)
     Tests  6 failed | 4 passed (10)
```

After splitting and implementing the projections, the final list was:

```text
tests/render/ux01-new-debate-form.test.tsx > ... > B1/B3 + MUTATION agent_count: derives the two configured makers and ignores routing task classes
tests/render/ux01-new-debate-form.test.tsx > ... > B2: an absent provider set does not suppress the independent deployment risk floor
tests/render/ux01-new-debate-form.test.tsx > ... > B2/B5: an absent risk floor leaves provider and envelope derivations intact without fabricating risk
tests/render/ux01-new-debate-form.test.tsx > ... > B2/B5: an absent run envelope leaves provider and risk derivations intact without fabricating depth
tests/render/ux01-new-debate-form.test.tsx > ... > MUTATION decision_owner: uses asker identity, not token/session id
tests/render/ux01-new-debate-form.test.tsx > ... > MUTATION action_owner: does not leave the former empty field
tests/render/ux01-new-debate-form.test.tsx > ... > MUTATION decision_scope: keeps V's ruled personal value
tests/render/ux01-new-debate-form.test.tsx > ... > MUTATION as_of: refreshes untouched machine time at submit
tests/render/ux01-new-debate-form.test.tsx > ... > B4: renders the real NewDebatePage with all seed calls applied and Start enabled
tests/render/ux01-new-debate-form.test.tsx > ... > LIVE READ-ONLY: standing deployment derives two makers and enables Start
tests/render/ux01-new-debate-form.test.tsx > ... > B5: renders honest field-local absence and stays disabled; fabricated fallback values die
tests/render/ux01-new-debate-form.test.tsx > ... > keeps all five machine-owned controls editable in the real rendered form
tests/render/ux01-new-debate-form.test.tsx > ... > B6: pins UTC while preserving an edited as_of instead of overwriting user intent
```

Hermetic focused result (live case is opt-in):

```text
Test Files  1 passed (1)
     Tests  12 passed | 1 skipped (13)
```

### Rev2 required mutation kills

Deleting the production `setAgentCount(...defaults.agentCount)` call:

```text
FAIL B4: renders the real NewDebatePage with all seed calls applied and Start enabled
expected rendered HTML to contain value="2"
received agentCount value="" and <button ... class="startBtn" disabled="">
Test Files 1 failed (1) · Tests 1 failed | 11 skipped (12)
```

Fabricating `setAgentCount("2")` in the provider-derivation catch:

```text
FAIL B5: renders honest field-local absence and stays disabled; fabricated fallback values die
expected agentCount value=""; received value="2" and <button ... class="startBtn ready">
Test Files 1 failed (1) · Tests 1 failed | 11 skipped (12)
```

The N-generic test also expands the provider set to three makers and expects `agentCount === "3"`, killing a production literal `"2"`. All mutations were restored before final gates.

### Rev2 live read-only proof

The standing endpoint returned register v1 with `configuredProviderSet.providers = [OpenAI, Anthropic]`, `riskTier = standard`, and `model_ledger_count = 0`. The opt-in test supplied those real `/v1/deployment` and `/v1/session` responses to the real page:

```text
UX01_LIVE_STACK=1 UX01_LIVE_BASE_URL=http://127.0.0.1:8790 pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx -t 'LIVE READ-ONLY'

✓ LIVE READ-ONLY: standing deployment derives two makers and enables Start
Test Files  1 passed (1)
     Tests  1 passed | 12 skipped (13)
```

Assertions prove the rendered input has `agentCount value="2"`, provenance names `(Anthropic, OpenAI)`, the Start button has `class="startBtn ready"` without `disabled`, and no `ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE` banner exists. The in-app browser runtime exposed no browser instance, so this live proof uses the real production component renderer rather than claiming an unavailable visual-browser observation.

### Rev2 final gates

```text
pnpm typecheck
$ tsc --noEmit
exit 0

pnpm lint
{ "edgeRowsChecked": 27, "violations": [] }
{ "blocking": [] }

pnpm exec vitest run
Test Files  73 passed (73)
     Tests  511 passed | 1 skipped (512)
Duration  22.77s

pnpm --filter dialectical-engine-v2ui typecheck
$ tsc --noEmit -p tsconfig.json
exit 0

pnpm --filter dialectical-engine-v2ui test
V2_UI_NODE_TESTS_DISCOVERED=1
# tests 27
# pass 27
# fail 0

TZ=America/Los_Angeles pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx -t 'B6: pins UTC'
Test Files 1 passed (1) · Tests 1 passed | 12 skipped (13)

bash tests/render-templates.sh && bash tests/lint-templates.sh
Rendered templates into /var/folders/.../tmp.y5tt833Zip
exit 0
```

### QUESTION FOR V — composition budget value

Should UX-01 ratify editable `low` as the ordinary-path composition-budget product default, or require the asker to make an explicit budget selection? Rev2 deliberately implements no deployment-derived selection rule. Until V rules, the UI labels `low` “Provisional default pending V ruling; editable user-owned value.”

Everything below this point is retained as the historical first-pass record; its ledger-derived maker count and least-budget statements are superseded by rev2.

## Outcome

`/new` now derives and visibly discloses editable ask defaults. Agent count is the number of distinct configured model identities in the deployment model ledger (model id + version + provider, so repeated task assignments do not inflate it); risk tier comes from the deployment register; composition budget defaults to the unique least registered tier. `decision_owner` and `action_owner` use the authenticated session `asker_id`; decision scope uses DR-166's single `personal` constant; untouched `as_of` refreshes from the submit clock while a user-edited value is preserved.

Deployment/session derivation failure leaves the affected controls awaiting input and renders a typed absence/error. No fallback maker count, owner, date, or budget is fabricated. Depth/envelope selection and the runner's M-guard are unchanged.

The deployment risk and least-budget derivations are necessary to satisfy the packet's explicit “question + Start; nothing else mandatory” path without hiding or inventing values. Both controls remain visible and editable with their own register provenance.

## Inventory

- `apps/v2-ui/app/new/page.tsx` — one deployment read now feeds the existing envelope projection and machine defaults; session read fills owner defaults; submit refreshes untouched ask time; form shows provenance and typed absence.
- `apps/v2-ui/app/new/defaults.tsx` — pure UX-01 derivation/configuration seam plus the production-rendered five-field component.
- `tests/render/ux01-new-debate-form.test.tsx` — ten collected render/behaviour tests, five named mutation kills, happy path, edit preservation, and typed absence.
- `tests/unit/v2ui-pages.test.ts` — only UX-01 hunks: page-source guard follows the direct deployment read and the extracted production field renderer. All other changes in this pre-dirty file belong to earlier lanes.
- `docs/missions/2026-08-06-v3-programming/handoffs/UX-01-progress.log` — required append-only progress receipts.
- `docs/missions/2026-08-06-v3-programming/handoffs/UX-01-codex-handoff.md` — this handoff.

No commit, branch, push, merge, reset, Docker-family command, or destructive operation was performed.

## TDD evidence

### Initial RED

Command:

```text
pnpm exec vitest list tests/render/ux01-new-debate-form.test.tsx
pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx
```

Real result:

```text
Test Files  1 failed (1)
     Tests  10 failed (10)
TypeError: deriveDeploymentAskDefaults is not a function
TypeError: deriveSessionAskDefaults is not a function
```

The list command printed all ten UX-01 cases before the run, proving the new file is collected by root Vitest.

### GREEN after implementation/refactor

```text
$ tsc --noEmit -p tsconfig.json

Test Files  2 passed (2)
     Tests  53 passed (53)
```

The focused cross-surface run was:

```text
pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx tests/render/load01-debate-page.test.tsx tests/unit/v2ui-pages.test.ts tests/unit/v2ui-data-layer.test.ts

Test Files  4 passed (4)
     Tests  107 passed (107)
```

Final UX-01-only proof after restoring every mutation:

```text
Test Files  1 passed (1)
     Tests  10 passed (10)
```

## Named mutation kills (real injected REDs)

Each mutation was applied alone to `defaults.tsx`, the named test was executed, and the production implementation was immediately restored.

1. `agent_count`: replaced deployment cardinality with literal `"2"`.

```text
expected agentCount "2" to be "3"
Test Files 1 failed (1) · Tests 1 failed | 9 skipped (10)
```

2. `decision_owner`: used `session.session_id` instead of `session.asker_id`.

```text
expected "session:v-session" to be "asker:v-session"
Test Files 1 failed (1) · Tests 1 failed | 9 skipped (10)
```

3. `action_owner`: restored the former empty value.

```text
expected '' to be 'asker:v-session'
Test Files 1 failed (1) · Tests 1 failed | 9 skipped (10)
```

4. `decision_scope`: changed DR-166's constant from `personal` to `shared`.

```text
expected 'shared' to be 'personal'
Test Files 1 failed (1) · Tests 1 failed | 9 skipped (10)
```

5. `as_of`: froze the render-time value instead of using submit time while untouched.

```text
expected '2026-08-13T05:00:00.000Z' to be '2026-08-13T05:02:03.456Z'
Test Files 1 failed (1) · Tests 1 failed | 9 skipped (10)
```

## Final gates

```text
pnpm run typecheck
$ tsc --noEmit
exit 0

pnpm run lint
{ "edgeRowsChecked": 27, "violations": [] }
{ "blocking": [] }

pnpm exec vitest run
Test Files  73 passed (73)
     Tests  509 passed (509)
Duration  22.92s

bash tests/render-templates.sh && bash tests/lint-templates.sh
Rendered templates into /var/folders/.../tmp.J0H0cqSqgr
exit 0
```

Template checks were run from `/Users/vladmihaimiron/Documents/DebateAIRO`, the actual Git/skeleton root. An initial invocation from the `DebateAI-V3` mission subdirectory reported `tests/render-templates.sh: No such file or directory`; this was a working-directory correction, not a test failure.

## AC / law evidence

- DR-166: all five named values prefill, stay controlled/editable, and render a `Machine default:` provenance hint.
- DR-162-A / AC-76: agent count is cardinality derived from deployment identities; no literal `2` exists in the production default path.
- DR-115: empty/malformed sources throw typed `ASK_*_DEFAULT_UNAVAILABLE` / `AMBIGUOUS` errors and leave input possible; no fallback value is manufactured.
- TDD: initial 10/10 RED, smallest GREEN, refactor under green, five independently injected mutation REDs, final 509/509 suite GREEN.
- DDD/SOLID: deployment derivation and session derivation are pure, separate domain decisions; rendering consumes their typed results; submit configuration is a separate pure builder.
- Pattern register: one deployment read is shared with the existing envelope projection; derivation logic is not duplicated in event handlers.

## Pre-existing dirt / allowed-scope evidence

The shared tree was heavily dirty before claim across API, runner, UI, packages, acceptance, migrations, and tests. UX-01 touched only the inventory above. In particular, `tests/unit/v2ui-pages.test.ts` already contained other lanes' UI-01/UI-02/XREV changes; UX-01 changed only its `/new` control-source/envelope assertions and did not claim or revert adjacent work.

## Deferrals and questions

No functional deferrals. No question for V is required for first-pass review. Reviewers should specifically falsify whether deployment `model_ledger` identity cardinality is the correct configured-agent carrier for the live acceptance session and whether a missing/empty ledger produces the required typed absence rather than an accidental mandatory wall.

Comments read through: Codex `WORKER CLAIM` comment at `2026-08-13 08:43`; no later comments existed at the pre-handoff scan.
