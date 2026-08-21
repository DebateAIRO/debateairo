# UX-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_b2f82786` · **Board:** `debateai-v3`  
**Title:** [Codex] UX-01 · The ask form defaults itself: five machine-owned fields (DR-166)  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-13  
**Inputs:** ticket body, `goal-packets/UX-01-codex-goal.md`, `handoffs/UX-01-codex-handoff.md`, DR-166 (ledger); judged from **shipped source + re-run tests**, not handoff trust alone.  
**Mode:** read-only. Product / runtime sources not edited for this deliverable. No transient hardcode mutation re-injected into the shared tree (DR-163); axis (1) mutation truth proven from test fixture binding + production source + live import of the shipped function. Did **not** read any peer (Opus) UX-01 verdict.

## Verdict

**APPROVED**

All five V/OBJECTIVE axes **PASS**. The shipped `/new` surface machine-defaults the five DR-166 fields from `readDeployment` / `readSession`, discloses provenance, keeps controls editable, fails into typed absence rather than fabricated values, and leaves the PANEL-01 M-guard untouched. New render tests are collected by the root Vitest include and are green under this review.

Advisories below are non-gating. None substitutes for a failed axis.

---

## Decision table (five axes)

| # | Axis | Result | Source / test proof |
|---|---|---|---|
| **1** | `agent_count` genuinely from DEPLOYMENT / `readDeployment`; N-generic; hardcode-`2` would go red when fixture ≠ 2 | **PASS** | `defaults.tsx:34–75` `String(configuredModels.size)` over model-ledger identities; no production literal `"2"` on the agent_count path; page wires via `contractClient.readDeployment` (`page.tsx:71–83`); render test fixture has **3** unique identities and asserts `agentCount: "3"` (`ux01-new-debate-form.test.tsx:50–55`); live import of shipped fn: n=2→`"2"`, n=3→`"3"`, n=5→`"5"` |
| **2** | FAILED default derivation → typed absence awaiting input; never fabricated; never unexplained blocked form (DR-115) | **PASS** | Empty ledger / missing risk / missing budget throw `ASK_*_DEFAULT_UNAVAILABLE` (`defaults.tsx:38–63`); page catch sets `deploymentDefaultsError` / `sessionDefaultsError` and leaves provenance null without inventing counts (`page.tsx:87–96`, `107–110`, `285–286`); unit-style cases in render suite `it.each` (`ux01-…:133–139`) |
| **3** | Happy path (question + Start) as **rendered** flow under enforced render layer; new files **collected** (`vitest list`) | **PASS** | File `tests/render/ux01-new-debate-form.test.tsx`; root `vitest.config.ts` include `tests/**/*.test.tsx`; this review: `vitest list` → **10** named cases; `vitest run` → **10/10** green; happy-path case renders `MachineOwnedAskFields` + builds Start config (`ux01-…:83–116`) |
| **4** | M-guard untouched (`RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` / PANEL-01 envelope) | **PASS** | Guard still `assertRatifiedMakerCount` with `DR159_RATIFIED_MAKER_COUNT = 2` (`apps/runner/src/index.ts:213–226`); UX-01 inventory (`page.tsx`, `defaults.tsx`, render test) contains **no** M-guard references; `tests/unit/pro01-runner-tree.test.ts:14–18` still expects M=3 to throw the typed envelope code |
| **5** | Fields remain editable; provenance hints name real sources | **PASS** | Five controlled `<input>`s with `value` + `onChange`, none `disabled`/`readOnly` (`defaults.tsx:148–214`); `MachineDefaultHint` renders `Machine default: …` with deployment ledger / session asker / DR-166 / submit-clock provenance strings (`defaults.tsx:15–25`, `74–80`, `117–118`) |

**Overall:** **APPROVED** (consistent with five PASS axes).

---

## Grounding (V ruling / packet)

DR-166 (ledger, 2026-08-13): five fields are machine-defaulted so the user types as little as possible after V’s own Agent Count 3 → lawful `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` collision. Defaults:

1. **agent_count** ← configured maker count from deployment (N-generic, DR-162-A; 2 today)  
2. **as_of** ← ask time  
3. **decision_owner** / **action_owner** ← asker session identity  
4. **decision_scope** ← `"personal"` (V’s string; re-ruleable)  
5. All prefilled, **editable**, with visible provenance (AC-76 discipline)

User path: **question + Start**. Failed derivation: typed absence, never fabricated, never unexplained block (DR-115). Do not weaken the M-guard.

Shipped shape matches that ruling at the product surface: `deriveDeploymentAskDefaults` / `deriveSessionAskDefaults` / `buildNewDebateAskConfig` + `MachineOwnedAskFields` on `/new`, with risk/budget also defaulted from the same deployment read so Start is not blocked on those pre-existing mandatory fields (handoff-noted extension beyond the five named DR-166 knobs).

---

## Axis (1) — agent_count from deployment, N-generic

### Production path

`apps/v2-ui/app/new/page.tsx` loads the deployment once via the same client the depth/envelope path already uses:

```71:83:apps/v2-ui/app/new/page.tsx
    void contractClient.readDeployment(token).then((deployment) => {
      // ...
        const defaults = deriveDeploymentAskDefaults(deployment);
        setDeploymentDefaultsProvenance(defaults);
        setAgentCount((current) => current.trim().length > 0 ? current : defaults.agentCount);
```

Derivation (`apps/v2-ui/app/new/defaults.tsx:34–75`):

- Builds a `Set` of `model_id \0 model_version \0 provider` over `deployment.model_ledger`.
- `agentCount: String(configuredModels.size)` — cardinality, not a constant.
- Provenance: `deployment model ledger (register v${register_version})`.
- Grep/source audit: **no** `agentCount: "2"` / hardcode on this path.

### Mutation / fixture kill (without shared-tree rewrite)

Named test:

```50:55:tests/render/ux01-new-debate-form.test.tsx
  it("MUTATION agent_count: hardcoding today's 2 dies when the deployment configures 3", () => {
    expect(deriveDeploymentAskDefaults(deployment)).toMatchObject({
      agentCount: "3",
      agentCountProvenance: "deployment model ledger (register v8)"
    });
  });
```

Fixture (`ux01-…:32–37`): four ledger rows, **three** distinct identities (model-a repeated for CRITIC). Expected return is `"3"`, not `"2"` and not `"4"`. A production hardcode of `"2"` fails this assertion (handoff’s injected RED: `expected agentCount "2" to be "3"`). This review did not re-mutate production code; it re-executed the binding test and independently live-imported the shipped function:

| Fixture identities | Shipped `agentCount` |
|---|---|
| 2 | `"2"` |
| 3 | `"3"` |
| 5 | `"5"` |
| 0 | throws `ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE` |

### Advisory A1 — carrier semantics (non-blocking)

DR-166 names **configured maker count**. Server-side maker roster law is `configuredProviderSet` / `readDeploymentMakerCapability` (`packages/critique`). That row is also present on `deployment.register.rows` from the same `readDeployment` response. UX-01 instead counts **distinct model-ledger identities** (session assignment routing, API `model_ledger` from `scorecard.session_assignment`).

Risks (not proven against a live acceptance session in this seat):

- Empty session assignment → typed absence; user must still type a number they may not know.  
- Ledger that includes a distinct non-maker model (e.g. critic with a third identity) → default `3` → Start can still hit the M-guard — the class of failure DR-166 was minted to stop.

**Not a FAIL of axis (1) as written:** derivation is deployment-backed, N-generic, mutation-killed, and uses the required `readDeployment` path. Carrier choice is an advisory for implementer / live acceptance falsification (handoff already flags it).

---

## Axis (2) — failed derivation = typed absence (DR-115)

### Pure seam

`deriveDeploymentAskDefaults` throws `TypedDomainError` with codes:

| Condition | Code |
|---|---|
| empty model ledger | `ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE` |
| missing / invalid `riskTier` | `ASK_RISK_TIER_DEFAULT_UNAVAILABLE` |
| incomplete composition budget | `ASK_COMPOSITION_BUDGET_DEFAULT_UNAVAILABLE` |
| non-unique least budget | `ASK_COMPOSITION_BUDGET_DEFAULT_AMBIGUOUS` |

Messages state that the field **awaits input**. No fallback integer/string is returned.

Render suite (`ux01-…:133–139`) asserts throw-by-code for empty ledger, missing risk, missing budget.

### Page behaviour

On catch (`page.tsx:87–96`, `91–96`, `107–110`):

- provenance state → `null`  
- error state → typed message (or `ASK_DEPLOYMENT_DEFAULTS_UNAVAILABLE: …` / `ASK_SESSION_DEFAULTS_UNAVAILABLE: …`)  
- agent/owner fields are **not** filled with invented values; initial `agentCount` / owners remain `""` until a successful derivation or user edit  
- errors render in the form (`page.tsx:285–286`)

Controls stay mounted and editable. Submit stays gated by `ready` until values exist — that is a complete-ask gate, not an unexplained freeze.

### Advisory A2

`as_of` initialises from the local clock and `decision_scope` from `DECISION_SCOPE_DEFAULT` (`"personal"`) before session load. Those are lawful machine values for those fields (ask time; V constant), not fabricated deployment/session data. Owner fields correctly stay empty if session read fails.

---

## Axis (3) — rendered happy path + collection discipline

### Collection (vitest list)

Root config (`vitest.config.ts:14`):

```ts
include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
```

This review:

```text
$ pnpm exec vitest list tests/render/ux01-new-debate-form.test.tsx
# 10 cases listed, including MUTATION agent_count / happy path / typed absence

$ pnpm exec vitest list | grep ux01
# same 10 cases appear in the full list
```

Not a dead runner: file is under `tests/render/`, matches the include, appears in list, executes under root Vitest.

### Run

```text
$ pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx
Test Files  1 passed (1)
     Tests  10 passed (10)
```

Evidence captured under review scratch: `vitest-list.txt`, `vitest-run.txt`, `vitest-list-full-filter.txt`.

### Happy path case

`renders disclosed editable values and builds the question-plus-Start happy path` (`ux01-…:83–116`):

1. **Renders** production `MachineOwnedAskFields` via `renderToStaticMarkup` (enforced render layer; same family as LOAD-01).  
2. Asserts disclosed values in HTML: `value="3"`, owners, `personal`, and `Machine default: deployment model ledger (register v8)`.  
3. **Builds** the Start payload with `buildNewDebateAskConfig` for untouched `as_of` → submit-time ISO, `agent_count: 3`, owners, `decision_scope: "personal"`.

On the page, risk/budget/depth also default from the same deployment read so `ready` can become true after topic + defaults alone (`page.tsx:80–85`, `115–120`, `130–142`).

### Advisory A3

Happy path is **compositional** (extracted field component + pure submit builder), not a full `NewDebateForm` mount with topic textarea + click on “Start debate”. Collection and render-layer discipline are satisfied; whole-page interaction is not. Acceptable for this ticket’s render/mutation standard; full page-client render remains an optional ratchet.

---

## Axis (4) — M-guard untouched

Shipped guard (`apps/runner/src/index.ts:213–226`):

```ts
const DR159_RATIFIED_MAKER_COUNT = 2;
export function assertRatifiedMakerCount(effectiveMakerCount: number): void {
  // ...
  if (effectiveMakerCount > DR159_RATIFIED_MAKER_COUNT) {
    throw new TypedDomainError(
      "RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE",
      `DR-159 ratified the run-cost envelope for M=${DR159_RATIFIED_MAKER_COUNT}; received M=${effectiveMakerCount}`
    );
  }
}
```

Regression still present: `tests/unit/pro01-runner-tree.test.ts` expects M=3 → that code.

UX-01 file inventory (page, defaults, `tests/render/ux01-new-debate-form.test.tsx`, UX-01 hunks in `v2ui-pages.test.ts`) does not reference, weaken, or bypass the guard. Form work is prefill/disclosure only; over-envelope counts still refuse at the runner.

---

## Axis (5) — editable + real provenance hints

| Field | Default source (shipped) | Editable | Hint text names |
|---|---|---|---|
| agent_count | deployment model-ledger identity cardinality | number input `value`/`onChange` | `deployment model ledger (register vN)` |
| as_of | session-time clock; refresh at submit if unedited | datetime-local + edit flag | `ask time (refreshed when Start is clicked)` |
| decision_owner | `session.asker_id` | text input | `authenticated session asker identity` |
| action_owner | `session.asker_id` | text input | `authenticated session asker identity` |
| decision_scope | `DECISION_SCOPE_DEFAULT` (`"personal"`) | text input | `V ruling DR-166` |

`MachineDefaultHint` always prefixes `Machine default:`. Edit preservation for `as_of` is tested (`ux01-…:119–131`). Unit source guards in `tests/unit/v2ui-pages.test.ts` bind the five controls on `defaults.tsx` with `value={…}` and onChange writers, and gate `ready` on those state names.

---

## Named mutation suite (re-run green; design intent)

| Mutation name | What it kills | Binding assertion |
|---|---|---|
| agent_count hardcode 2 | literal 2 | expects `"3"` from 3-identity fixture |
| decision_owner session_id | wrong session field | expects `asker:v-session` not `session:v-session` |
| action_owner empty | old empty default | expects asker id |
| decision_scope shared | constant drift | expects `personal` |
| as_of freeze render time | no submit refresh | expects submit ISO when `asOfWasEdited: false` |

All five re-ran green under this review as part of the 10/10 file.

---

## Independence / process

- Did not read Opus (or any peer) UX-01 review file.  
- Did not claim, transition, or comment the kanban ticket.  
- Did not commit, push, or clean the pre-dirty shared tree.  
- Did not edit product/runtime code; only this verdict file.  
- Did not re-inject a production hardcode mutation (shared dirty tree); mutation truth from fixture binding + live import + handoff’s recorded RED.

---

## Advisories (non-blocking)

| ID | Note |
|---|---|
| **A1** | Prefer or cross-check `configuredProviderSet` unique makers as the agent_count carrier if live session_assignment cardinality diverges from ratified M (see axis 1). |
| **A2** | Session-failure path is covered for owners/errors; `as_of` / `decision_scope` still show lawful local/constant defaults (intentional). |
| **A3** | Optional ratchet: render full `NewDebateForm` (or page client) so topic + Start button appear in the same render case. |
| **A4** | risk_tier / budget_tier defaults are extra machine defaults beyond the five DR-166 names; required for literal question+Start readiness — disclosed with provenance; keep them if V accepts the extension. |

---

## Evidence index (this review)

| Artifact | Location |
|---|---|
| Verdict | `docs/missions/2026-08-06-v3-programming/reviews/ux01-grok-rev1.md` |
| `vitest list` (file) | scratch `ux01-grok-rev1/vitest-list.txt` |
| `vitest run` 10/10 | scratch `ux01-grok-rev1/vitest-run.txt` |
| Full-list filter | scratch `ux01-grok-rev1/vitest-list-full-filter.txt` |
| Live import N-generic | scratch `ux01-grok-rev1/agent-count-live-import.txt` |
| M-guard excerpt | scratch `ux01-grok-rev1/m-guard-excerpt.txt` |
| `/new` unit region | scratch `ux01-grok-rev1/v2ui-pages-new.txt` (10 passed for `/new` describe) |

---

## Markers

```text
GROK REVIEW (UX-01 rev1): APPROVED
READY FOR PEER REVIEW coordination by Hermes/orchestrator (Grok lens complete; no board write from this seat)
comments read through: Codex READY FOR PEER REVIEW — UX-01 at 2026-08-13 08:58; no later ticket comments read for peer content
```
