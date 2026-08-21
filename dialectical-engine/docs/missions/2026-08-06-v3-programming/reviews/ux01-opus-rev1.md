# UX-01 rev1 — Opus 5 lens (dual diamond, DR-153)

**Ticket:** `t_b2f82786` · **Ruling under review:** DR-166 · **Worker:** Codex GPT-5.6 Sol
**Date:** 2026-08-13 · **Verdict: BLOCKING**

**Method (DR-163):** every probe and mutation ran in an APFS clone of the PARENT git root
`/Users/vladmihaimiron/Documents/DebateAIRO` (with `.git` and the parent `.gitignore`), at
`…/9d9a0a17…/scratchpad/clone/DebateAIRO`. Clone verified byte-identical on all six relevant files
before any work (`page.tsx e588e7b2…`, `defaults.tsx 4e811125…`, `ux01-new-debate-form.test.tsx
f56e6620…`, `load01-debate-page.test.tsx 57dffe73…`, `v2ui-pages.test.ts 7b16e75e…`,
`vitest.config.ts ef6a592f…`). Every mutation restored and md5-confirmed; the clone diffs clean
against the shared tree at close. The real tree carries only this verdict file. The standing stack
was **not** restarted — it was queried read-only (SELECT-only DB probes, GET-only HTTP, browser
render with no submit).

---

## BLOCKING

### B1 — The agent_count default never fires on the deployment V will use. Wrong carrier.

`apps/v2-ui/app/new/defaults.tsx:34-42` derives the maker count from
`deployment.model_ledger` identity cardinality. That field is projected in
`apps/api/src/index.ts:463-465` from

```sql
SELECT task_class, model_id, model_version, provider, routing_decision_id
  FROM scorecard.session_assignment WHERE session_id=$1 ORDER BY at_seq
```

— a **per-session routing-outcome** table, not deployment configuration. Its only writer is
`SettlementRepository.recordRoutingDecision` (`packages/settlement/src/index.ts:760-800`), and that
method has **zero callers anywhere in production code**. The table is therefore empty today and
structurally empty for every fresh asker session even if a caller were added.

Live evidence, standing stack, read-only:

```
$ SELECT count(*) FROM scorecard.session_assignment;   ->  0

$ curl -H "x-user-dev-token: v-dev" http://127.0.0.1:8790/v1/deployment
register_version 1
model_ledger len 0
```

Rendered `http://localhost:3000/new` on the live stack (token unlocked, real
`NewDebatePage`, no mutation):

```
Agent count                          value ""      (no "Machine default:" hint at all)
Risk tier                            value ""      ("Choose…")
Composition budget tier              value ""      ("Choose…")
Tree depth                           null
Start debate                         disabled: true
error banner: "The deployment model ledger names no configured debate agents;
               Agent count awaits input."
```

DELIVERS #1 and #6 are **not delivered where V meets them**. V still cannot type a question and
press Start; V still faces the exact field V could not know. The lane's whole purpose is unmet on
the live deployment.

**The right carrier is on the same `readDeployment` the depth control already uses.** The live
register carries, at `configuredProviderSet` (`source_ref acceptance:DR-140:V-approved`):

```json
{"kind":"CONFIGURED_PROVIDER_SET",
 "providers":[{"maker":"OpenAI","providerRef":"acceptance:codex-cli", …},
              {"maker":"Anthropic","providerRef":"acceptance:claude-cli", …}],
 "requiredDistinctMakers":1}
```

This is the engine's own configured-maker vocabulary — `readDeploymentMakerCapability`
(`packages/critique/src/index.ts:242-289`) derives `configuredMakers` as the distinct `maker`
values of exactly this row. It is register-carried CONFIGURATION (DR-162-A's first lawful home for
"how many"), N-generic, present in `/v1/deployment`'s `register.rows` today, and its cardinality
(2) is exactly the runner's `effectiveMakerCount` (`apps/runner/src/index.ts:517`).

### B2 — One throw takes risk_tier and composition_budget_tier down with it

`deriveDeploymentAskDefaults` throws `ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE` at
`defaults.tsx:38-42`, before the riskTier derivation at `:45-51` and the budget derivation at
`:53-71`. `page.tsx:87-90` then sets `deploymentDefaultsProvenance = null`, so **none** of the
three deployment-side defaults land. The live register does carry a valid `riskTier` ("standard")
and a complete `compositionBundleBudget` — both derivable, both lost to an unrelated absence.
Live proof above: three empty controls, not one. Derivations that can succeed independently must
fail independently.

### B3 — Even when populated, the carrier counts the wrong things

`model_ledger` rows are recorded per `task_class` across the whole session — judge, composer,
conformance, critic, makers alike (`recordRoutingDecision(input.decision.taskClass, …)`). Distinct
identity cardinality across those classes is not the maker count. A deployment routing judge,
composer and critic to three distinct models yields `agentCount: "3"`, and the M-guard
(`apps/runner/src/index.ts:216-225`, `DR159_RATIFIED_MAKER_COUNT = 2`) refuses it — the machine
default would then **manufacture V's original failure**.

This is not hypothetical shape-guessing; it is the shape the lane's own fixture encodes.
`tests/render/ux01-new-debate-form.test.tsx:32-37` builds `ROOT_A / ROOT_B / ROOT_C / CRITIC` and
asserts `agentCount: "3"` — a value today's engine refuses before any model call
(`tests/integration/database.test.ts:837`). The N-genericity guard and the ratified envelope are
being proved against each other.

### B4 — The happy path is not exercised as a rendered flow; the page wiring is unguarded

No test in the repo renders `NewDebatePage` or `NewDebateForm`. `tests/render/ux01-new-debate-form.test.tsx:88-101`
renders only `MachineOwnedAskFields` — a presentational component fed hand-built props.
`tests/unit/v2ui-pages.test.ts:55` reads `app/new/page.tsx` as a **source string**. The seam that
actually delivers DR-166 (deployment/session read → state seeding → `ready` gate → submit) is
covered by nothing behavioural.

Named mutation, applied alone in the clone:

**MUT-G (page seeding removed):** deleted all seven default-seeding calls in
`apps/v2-ui/app/new/page.tsx:83-85` and `:102-105` (`setAgentCount((current) => …)`,
`setRiskTier`, `setBudgetTier`, `setDecisionOwner`, `setActionOwner`, `setDecisionScope`,
`setAsOf`). Reads, provenance hints and error handling left intact. Result:

```
$ pnpm exec tsc --noEmit -p tsconfig.json          exit 0
$ pnpm --dir apps/v2-ui exec tsc --noEmit          exit 0
$ pnpm exec vitest run
 Test Files  73 passed (73)
      Tests  509 passed (509)
```

A compiling variant in which **not one field is prefilled** — DR-166 entirely undone — passes the
whole enforced suite. The packet's "the whole-form happy path exercised behaviourally under the
NEW render-layer config" is not satisfied. LOAD-01 set the precedent on the same render layer one
ticket earlier: `tests/render/load01-debate-page.test.tsx:5,93` imports and renders the real
`DebatePageClient` and `app/debate/[id]/page.js`. UX-01 did not follow it.

### B5 — The DR-115 failure path is unguarded, and it is the live path

Typed absence is asserted only against the pure function
(`ux01-new-debate-form.test.tsx:133-139` — `deriveDeploymentAskDefaults` throws). What the FORM
does with the throw is untested.

**MUT-H (fabricate on failure):** in `page.tsx:87-90`, replaced the error assignment with a
fabricated fallback — `setAgentCount(… "2")`, `setRiskTier(… "standard")`,
`setBudgetTier(… "low")`, `setDeploymentDefaultsError(null)`. Result:

```
 Test Files  73 passed (73)
      Tests  509 passed (509)
```

Scaffolded values silently substituted for an unavailable derivation, error banner suppressed,
suite fully green. Because of B1 this is not a corner: the failure branch is the **only** branch
that executes on the live deployment, so it is precisely where a fabricated `agent_count` would
reach V undetected.

### B6 — Timezone-dependent test; red on any machine that is not UTC+03:00

`tests/render/ux01-new-debate-form.test.tsx:119-131` feeds the local-time string
`"2026-08-14T09:30"` and asserts `"2026-08-14T06:30:00.000Z"`. That hardcodes the reviewer's
offset. In the clone:

```
$ TZ=UTC pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx
 × keeps an edited as_of value instead of overwriting user intent
   → expected '2026-08-14T09:30:00.000Z' to be '2026-08-14T06:30:00.000Z'
 Test Files  1 failed (1) · Tests  1 failed | 9 passed (10)

$ TZ=America/Los_Angeles pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx
   → expected '2026-08-14T16:30:00.000Z' to be '2026-08-14T06:30:00.000Z'
 Test Files  1 failed (1) · Tests  1 failed | 9 passed (10)
```

No `TZ` pinning exists in `vitest.config.ts` or `package.json`. Either pin the environment or
assert against a value computed from the same local-parse the production code performs.

---

## ADVISORY

### A1 — "All five stay EDITABLE" (DR-166 clause 5) has no test

**MUT-F:** added `readOnly` to all five inputs in `defaults.tsx` (`#agentCount`, `#asOf`,
`#decisionOwner`, `#actionOwner`, `#decisionScope`). Full suite `73 passed (73) / 509 passed (509)`.
The shipped code is editable — but the guarantee is unguarded, and `tests/unit/v2ui-pages.test.ts:47-52`
only greps for `value={…}` and the `onChange` text, both of which survive `readOnly`.

### A2 — A machine-derived risk tier ships labelled as an asker selection

`apps/v2-ui/lib/api.ts:275-276` hardcodes `tier_source: "ASKER"` and
`tier_provenance_ref: "asker:ui-selection"`, and `packages/contract/src/index.ts:109` admits the
literal `"ASKER"` only. Once B1/B2 are fixed, a value read from the deployment `riskTier` register
row will be posted as something the asker chose. The ask contract has no representation for a
machine-derived tier. At minimum the `tier_provenance_ref` should name the real source
(e.g. `machine:deployment-riskTier-row`); properly, the contract needs a member.

### A3 — Depth quietly becomes machine-chosen, and chooses the shallowest run

The depth control itself is untouched (`git diff HEAD -- app/new/page.tsx` shows no change to
`setDepth`/`members[0]`), but auto-filling `riskTier` arms the pre-existing effect at
`page.tsx:115-120`, which selects `members[0].depth`. In the live standard-tier envelope that is
**depth 1 / 42 model attempts**. DR-164's positive signal came from a depth-3 debate. DR-166 ruled
nothing about depth; UX-01 makes the shallowest ruled run the default V gets. V's call, not the
lane's — worth surfacing.

### A4 — Duplicated identity key

`defaults.tsx:35-37` re-implements the NUL-delimited identity key that already exists as
`modelLedgerIdentityKey` in `apps/v2-ui/lib/v3/adapter.ts:654-657`. Pattern-register duplication
(moot if the carrier changes per B1).

### A5 — Two fields defaulted beyond V's five, on the lane's own initiative

`risk_tier` and `composition_budget_tier` are now machine-defaulted (`defaults.tsx:45-71`), with
budget set to "the unique least registered tier". The handoff discloses this and the packet's
"nothing else mandatory" arguably requires it — but the ledger records no V ruling on either
value, and "cheapest budget" is a product decision. Recommend the orchestrator put both to V
alongside the DR-166 `"personal"` string V already reserved the right to re-rule.

---

## What holds

- **Collection is real (item 4).** `pnpm exec vitest list` in the clone enumerates all ten UX-01
  cases under `tests/render/ux01-new-debate-form.test.tsx` and 509 collected tests total. No dead
  runner; the enforced root config picks the new `.tsx` file up via
  `include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`.
- **N-genericity at the derivation level (item 2).** **MUT-A:** replaced
  `agentCount: String(configuredModels.size)` with `agentCount: "2"` →
  `Test Files 1 failed | 1 passed (2) · Tests 2 failed | 51 passed (53)`, killing both the named
  mutation test and the happy-path render (`expected { agentCount: '2' } to match { agentCount: '3' }`,
  `expected … to contain 'value="3"'`). No literal `2` hides in the derivation path.
- **The session-side three are genuine and live-verified (item 5).** On the standing stack
  `/new` renders `decisionOwner = actionOwner = asker:79ab1624…` — byte-matching `GET /v1/session`'s
  `asker_id`, not the `session_id`; `decisionScope = "personal"` from the single
  `DECISION_SCOPE_DEFAULT` constant (`defaults.tsx:8`), referenced in both the derivation and the
  page's initial state; `asOf` prefilled `2026-08-13T09:05` and, when untouched, rebuilt from
  `submitTime` in `buildNewDebateAskConfig` (`defaults.tsx:97`) rather than the page-load value —
  submit-fresh, not stale. Provenance hints render and name real sources
  ("authenticated session asker identity", "ask time (refreshed when Start is clicked)",
  "V ruling DR-166").
- **Nothing else moved (item 6).** Only `apps/v2-ui/app/new/page.tsx`,
  `apps/v2-ui/app/new/defaults.tsx`, `tests/render/ux01-new-debate-form.test.tsx`,
  `tests/unit/v2ui-pages.test.ts` and the UX-01 docs carry mtimes inside the claim window
  (2026-08-13 08:42–08:58). `apps/runner/src/index.ts` 08:01, `lib/runCostEnvelopeSelection.ts`
  2026-08-11, `lib/scrutinyDepth.ts` 2026-08-10, `tests/render/load01-debate-page.test.tsx` 08:16,
  `app/debate/[id]/page.tsx` 08:24, `DebatePageClient.tsx` 08:23, `DebatePageGate.tsx` 01:29 — all
  predate the claim. Depth control, M-guard and LOAD-01's loading states are untouched, and the
  M-guard is not weakened.
- **The V-scenario refusal renders readably (item 3).** V's original run
  `67604ba2-5720-40fa-aaca-6b9c1a495697` (`agent_count 3`, work item `FAILED`,
  `ACCEPTANCE_EXECUTION_FAILED:RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE`) renders at
  `/debate/67604ba2…` as a `FAILED` badge plus
  `"Debate generation failed: ACCEPTANCE_EXECUTION_FAILED:RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE"`
  — no 404, typed code visible. It is a raw machine code rather than user prose, and the ask is
  still accepted at submit time (the guard fires inside the runner, not at `POST /v1/asks`), so an
  edited `agent_count: 3` still costs a created-and-failed run. Both are lawful and out of UX-01's
  scope; noting for the record.
- **Real tree untouched.** Post-review md5s identical to the pre-review baseline on all four UX-01
  files and on `apps/runner/src/index.ts`.

---

## Verdict

**BLOCKING.** The lane's stated purpose — V types a question and presses Start — is not achieved on
the deployment V will use, because `agent_count` is read from a per-session routing-outcome table
that is empty today and has no production writer (B1), and because its throw also suppresses the
two adjacent derivable defaults (B2). The chosen carrier is also semantically wrong: it counts
identities across all task classes, so a populated ledger would default straight into the M-guard
refusal that started DR-166 (B3). The correct carrier — `configuredProviderSet` — is already on the
same `readDeployment` the packet named. Separately, the test layer does not cover the seam that
does the work: the page's default seeding can be deleted entirely (B4) and a DR-115-violating
fabricated fallback can be added (B5) with 73 files / 509 tests still green, and one test is
timezone-locked to the author's machine (B6).

The session-side defaults, the provenance disclosure, the collection discipline and the scope
containment are all sound. Fix the carrier, split the derivations, render the real form in the
render suite (LOAD-01's own precedent), and this lane is close.

*Opus 5 lens · isolated clone · all mutations restored and md5-verified.*
