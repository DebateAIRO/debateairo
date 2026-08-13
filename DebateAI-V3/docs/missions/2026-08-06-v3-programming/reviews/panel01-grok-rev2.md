# PANEL-01 dual-diamond review — Grok lens (rev2)

**Ticket:** `t_eeea2f6e` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-12  
**Rework contract:** `docs/missions/2026-08-06-v3-programming/reviews/PANEL-01-rework-directive.md`  
**Prior Grok verdict:** `docs/missions/2026-08-06-v3-programming/reviews/panel01-grok-rev1.md` (**CHANGES REQUESTED** — BLOCKING-1 honesty mark, BLOCKING-2 silent serve primary)  
**Prior Opus verdict (read as rework input only, not peer rev2):** `panel01-opus-rev1.md`  
**Ruling:** DR-161 in `docs/missions/2026-08-06-v3-programming/decisions-ledger.md`  
**Worker claim inventory (not authority):** `handoffs/PANEL-01-codex-handoff.md`  
**Mode:** read-only. Product / runtime sources not edited. Judged from shipped source and tests against the **rework directive + DR-161**, not the original packet alone. Did **not** re-open engine topology already PASS in rev1. Did **not** read any peer (Opus) PANEL-01 rev2 verdict.

**Corroboration run (focused units, saved under reviewer scratch):**  
`pnpm vitest run tests/unit/pro01-runner-tree.test.ts tests/unit/serve-s05.test.ts tests/unit/s14-ui.test.ts` → **3 files / 40 tests passed**. Full integration/ceremony/architecture suites not re-run; judged from committed source + unit GREEN.

## Verdict

**APPROVED**

Rev2 closes the honesty layer both lenses blocked on. The multi-maker graph was already real in rev1; the serve face now says so in closed vocabulary, with a required typed record that names both makers and both roots, a carried served-root rule identity, and mutation teeth that fail when the disclosure or the M-guard is deleted. `UNCOVERED-SCOPE` is no longer overloaded. The orphaned mono planner is gone; the live multi-maker planner refuses its FAIR-illegal M=1 branch.

---

## Must-check answers (OBJECTIVE)

| Question | Answer | Evidence |
|---|---|---|
| Is `UNSERVED-MAKER-POSITION` **REQUIRED** at the serve gate required-record list, or only optional in practice? | **REQUIRED** — not optional. | `packages/serve/src/index.ts:782–788` lists `"UNSERVED-MAKER-POSITION"` in `REQUIRED_CONDITION_MARK_RECORDS`. `assertRequiredConditionMarkRecords` is invoked at `ServeRepository.persist` (`:910`). Missing record with mark present → `CONDITION_MARK_RECORD_REQUIRED`; record without mark → `CONDITION_MARK_RECORD_WITHOUT_MARK` (`:791–807`). Unit: `tests/unit/serve-s05.test.ts:269–285`. |
| Does the record's **reason text** actually name both makers and the served root? | **Yes.** | Runner mint (`apps/runner/src/index.ts:914`): `` `${servedRootSelection.rule} served ${servedRoot.maker} root ${servedRoot.nodeId}; ${unservedRoot.maker} root ${unservedRoot.nodeId} remains graph-visible but unserved` ``. Ceremony asserts reason contains `"OpenAI"`, `"Anthropic"`, primary root id, and secondary root id (`acceptance/ceremony.test.ts:388–390`). |
| Is rule identity **carried** and **pinned** by a test comparing recorded rule to served reality? | **Yes.** | Carried: typed field `servedRootRule` / `served_root_rule: "first-configured-provider"` on the record (runner `:916`, contract `:337`, migration `0018_panel01_rework.sql:5–6`, serve persist `:1013–1024`, read projection `:1227–1286`). Rule named: `SERVED_ROOT_RULE` + `selectServedRoot` (`apps/runner/src/index.ts:219–228`), used for fact/node/number/serve set (`:805–806`, `:893`, `:980–988`, `:1014`, `:1128`, `:1193`). Pin: ceremony expects `served_root_rule: "first-configured-provider"`, `subject_ref === positionNode.node_id` (first authored / OpenAI root), and present number value equals that root's final strength (`ceremony.test.ts:383–393`, `:412–416`). |
| Does **deleting the M-guard** now fail the suite? | **Yes.** | Integration: `tests/integration/database.test.ts:754–776` — `agent_count: 3` → `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE`; `agent_count: 2` against critique-less runner → `RUN_MAKER_CONFIGURATION_MISMATCH`; both assert `provider.calls() === 0` and zero `MODEL_CALL` ledger rows. Deleting `assertRatifiedMakerCount(run.agentCount)` at runner `:451` makes the M=3 case throw the wrong code (or proceed); deleting the mismatch branch at `:452–458` greens M=3 still but fails the M=2 mismatch case and allows model work. |

---

## B-1 — DR-161 mark + required typed record + chip + `[]`-mutation teeth

### What the rework required

Mint `UNSERVED-MAKER-POSITION` in kernel vocabulary; typed `ConditionMarkRecord` **required** at the serve gate; reason names both makers and which root was served; plain chip label; stop using `UNCOVERED-SCOPE` for this; test fails if mark or record is missing on multi-root serve (the `[]` mutant that survived rev1).

### Shipped

| Piece | Location | Status |
|---|---|---|
| Kernel vocabulary | `packages/kernel/src/index.ts:87–89` (`CONDITION_MARKS` length 24; DR-161 comment) | **Present** |
| Required-record list | `packages/serve/src/index.ts:782–788` includes `"UNSERVED-MAKER-POSITION"` | **REQUIRED at gate** |
| Two-way enforcement | `assertRequiredConditionMarkRecords` (`:791–807`); called from `persist` (`:910`) | **Both directions** |
| Runner stamp (M=2) | `apps/runner/src/index.ts:896` mark list; `:908–918` typed record | **Present** |
| Chip (v2-ui) | `apps/v2-ui/lib/v3/labels.ts:29` → `"Another maker's position was not served"` | **Plain** |
| Chip (web S14) | `web/lib/v3Presentation.ts:135` same string | **Plain** |
| Label completeness unit | `tests/unit/s14-ui.test.ts:113–118` — length 24, contains mark, non-empty labels | **Present** |
| Gate unit (two-way) | `tests/unit/serve-s05.test.ts:269–285` | **Present** |
| Ceremony teeth | `acceptance/ceremony.test.ts:305–306, 380–390` — mark present, `UNCOVERED-SCOPE` **absent**, record with both makers + both root ids | **Present** |

### Is the record optional in practice?

**No.** Emitting the mark without its record is a typed persist refusal (`CONDITION_MARK_RECORD_REQUIRED`). Emitting the record without the mark is also refused (`CONDITION_MARK_RECORD_WITHOUT_MARK`). The serve gate does not auto-mint the mark for multi-root serves — the runner must emit both halves — but once either half appears, the other is mandatory. Ceremony further requires the mark on the live dual-maker path, so the `conditionMarks: []` mutant that greened rev1 now fails ceremony (`:305`).

### Reason text

Shipped template names:

1. The rule id (`first-configured-provider`)  
2. Served maker + served root node id  
3. Unserved maker + unserved root node id  
4. Explicit "graph-visible but unserved"

That meets DR-161 and the directive example (both makers + which root was served). `subjectRef` is the served root; `affectedNodeIds` holds both roots; `servedRootRule` carries the rule constant.

### Judgment

**PASS — closed.**

---

## B-2 — explicit, provenance-carried served-root rule + recorded-rule vs served-reality pin

### What the rework required

Stop silent `providers[0]` / `authoredNodes[0]` with no declaration. Named rule (first-configured-provider acceptable **as a rule if stated**); outcome recorded on answer provenance; rule identity carried (e.g. `served_root_rule: "first-configured-provider"`); test pins recorded rule against what actually served.

### Shipped rule (explicit)

```ts
// apps/runner/src/index.ts:219–228
export const SERVED_ROOT_RULE = "first-configured-provider" as const;
export function selectServedRoot<T>(configuredProviderRoots: readonly T[]) {
  const root = configuredProviderRoots[0];
  // … SERVED_ROOT_UNRESOLVED if empty
  return Object.freeze({ rule: SERVED_ROOT_RULE, root });
}
```

Call site (`:805–807`): `selectServedRoot(authoredNodes.slice(0, effectiveMakerCount))` — not a bare `authoredNodes[0]` at the serve site. Outcome drives facts, serve-gate nodes, composer `availableNodes`, terminal `servedNodeIds`, envelope subject, and served-number `sourceRef` (`:893`, `:980–988`, `:1014`, `:1128`, `:1193`).

### Provenance carry

| Layer | Field / path |
|---|---|
| Runner record | `servedRootRule: servedRootSelection.rule` (`:916`) |
| DB | `serve.condition_mark.served_root_rule` CHECK (`migrations/0018_panel01_rework.sql`) |
| Persist INSERT | `packages/serve/src/index.ts:1013–1024` |
| Contract Answer | `served_root_rule: z.literal("first-configured-provider").nullable()` (`packages/contract/src/index.ts:337`) |
| API read | SELECT + map (`packages/serve/src/index.ts:1227–1286`) |

The choice is no longer recoverable only by forensic node-id matching; the honesty record carries rule id + subject root + reason.

### Pin test (recorded rule vs served reality)

`acceptance/ceremony.test.ts:380–393, 412–416`:

- Finds the `UNSERVED-MAKER-POSITION` record  
- Asserts `served_root_rule === "first-configured-provider"`  
- Asserts `subject_ref === positionNode.node_id` (nodes[0] / OpenAI primary root in the dual-maker ceremony order)  
- Asserts reason names both makers and both root ids  
- Asserts the present served number's value equals that same root's `final_strength`

If `selectServedRoot` returned the secondary root while still stamping the first-configured-provider rule id, `subject_ref` would leave `positionNode.node_id` and ceremony would fail. If the rule string were dropped or nulled, the objectContaining pin fails.

No separate pure unit of `selectServedRoot` exists; the end-to-end ACC-01 pin is the directive's load-bearing tooth and is sufficient.

### Judgment

**PASS — closed.** The constant still favours the first configured provider (OpenAI in acceptance) — that is the **ruled** policy under DR-161, now visible and recorded, not silent.

---

## B-3 — M-guard integration test (deletion fails the suite)

### What the rework required

Integration case: `agent_count: 3` → typed refusal with DR-159 / mismatch codes **before any model call**; assert the mismatch code somewhere. (~10 lines into `database.test.ts`.)

### Shipped

`tests/integration/database.test.ts:754–776`:

```ts
it.each([
  [3, "RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE"],
  [2, "RUN_MAKER_CONFIGURATION_MISMATCH"]
])("refuses agent_count %i with %s before any model call", async (agentCount, code) => {
  // createRun(..., agentCount) → executeWorkItem → rejects with { code }
  // provider.calls() === 0; MODEL_CALL count === "0"
});
```

Production wiring still (`apps/runner/src/index.ts:451–458`):

1. `assertRatifiedMakerCount(run.agentCount)` — M=3 → `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE` (DR-159 in message)  
2. `run.agentCount !== effectiveMakerCount` — M=2 ask against critique-less runner (`effectiveMakerCount === 1`) → `RUN_MAKER_CONFIGURATION_MISMATCH`

Both fire **after claim / frozen head, before** first model call (`:503+` path). Pure unit still pins the ratified-count helper (`tests/unit/pro01-runner-tree.test.ts:13–17`).

### Mutation: delete the guard

| Mutant | Suite reaction |
|---|---|
| Delete `assertRatifiedMakerCount(run.agentCount)` only | M=3 case expects `EXCEEDS`; would hit mismatch (`3 !== 1`) → **wrong code → red** |
| Delete mismatch branch only | M=2 case no longer throws before model work → **calls / MODEL_CALL > 0 → red** |
| Delete both | Both table rows fail to refuse → **red** |

Rev1 residual ADVISORY-3 (M-guard unpinned at runner attachment) is closed.

### Judgment

**PASS — closed.**

---

## UNCOVERED-SCOPE restored to Q27 / DR-020 knob-8 only

| Check | Result |
|---|---|
| Still in closed vocabulary (Q27 diagnostic) | **Yes** — `packages/kernel/src/index.ts:86`; label still `"Scope not fully covered"` on both UI surfaces |
| Runner multi-maker stamp uses it? | **No** — M=2 stamps only `UNSERVED-MAKER-POSITION` (`apps/runner/src/index.ts:896`) |
| Ceremony forbids it on dual-maker answer? | **Yes** — `expect(...).not.toContain("UNCOVERED-SCOPE")` (`ceremony.test.ts:306`) |
| Production package usage beyond kernel + labels? | **None** in `packages/` apps code paths for multi-maker serve (grep: kernel + label switches only) |
| Orphan-audit still treats coverage gate as NOT_SHIPPED diagnostic | **Yes** — `tools/orphan-audit/src/index.ts:723` |

**PASS.** Collision with battery Q27 is resolved by minting a new mark, as V ruled in DR-161.

---

## Orphaned planner deletion (A-1 fold)

| Check | Result |
|---|---|
| `buildDebateExpansionPlan` still in production source? | **No** — zero hits under `apps/`, `packages/`, `acceptance/`, `tests/` (only historical docs/handoffs) |
| Live planner is sole path? | **Yes** — `buildMultiMakerExpansionPlan` at runner `:741–742` when M=2; M=1 uses `[]` |
| FAIR-illegal M=1 "all primary" branch live? | **No** — planner throws `MULTI_MAKER_PLAN_REQUIRES_TWO_MAKERS` if `effectiveMakerCount !== 2` (`apps/runner/src/index.ts:250–255`); unit pin `pro01-runner-tree.test.ts:29–32` |
| Other production callers orphaned by the deletion? | **None found** — export surface of runner no longer includes `buildDebateExpansionPlan` |

**PASS.** Dead divergent sibling is gone; live multi-maker planner refuses the illegal mono branch rather than leaving it green-path-dead.

---

## Advisory disposition (fold/record — not re-blocking)

| Advisory | Disposition (from handoff + source skim) | Residual? |
|---|---|---|
| A-1 dual planners | **Folded** — orphan deleted; M=1 multi-maker plan refuses | Closed |
| A-2 mono no-expansion | **Recorded** — M=1 remains one-root / no expansion | Open product note (not rev2 bar) |
| A-3 +1 call vs DR-159 basis | **Recorded** in DR-161 ledger note + handoff (depth-5 405 vs 402 ceiling) | Open ceiling ownership = V only |
| A-4 unbounded `/new` agent_count | **Recorded** — UI ticket territory | Open |
| A-5 half cross-root attacks tree-invisible | **Recorded** | Open UI projection |
| A-6 shared materialized path `'0'` | **Recorded** | Open |
| A-7 README call-site names | **Folded** (handoff claim; not re-audited line-by-line) | — |
| A-8 cross-root does not deepen | **Recorded** | Open policy note |

None of these re-open B-1/B-2/B-3.

---

## Engine baseline (rev1 PASS — not re-opened)

Not re-judged in depth; source skim shows topology machinery intact:

- Two roots + per-root B3-B + cross-root exchange still gated on `effectiveMakerCount === 2`  
- `selectServedRoot` selects among authored roots; serve set remains **one** node  
- Dormant `runJudgePanel` not imported by runner (unchanged ownership)  
- Ceremony still locks 8 nodes / dual maker lineage / four independent attacks when exercised  

No honesty rework regression visible in the inspected serve/runner paths.

---

## Packet / directive checklist (rev2)

| # | Item | Judgment |
|---|---|---|
| B-1 | DR-161 mark + required record + chip + `[]` teeth | **PASS** |
| B-2 | Explicit + provenance-carried served-root rule + pin | **PASS** |
| B-3 | M-guard integration; delete → suite red | **PASS** |
| — | `UNCOVERED-SCOPE` Q27-only | **PASS** |
| — | Orphan planner cleanup without new orphans | **PASS** |

---

## Dual-diamond Grok lens: **APPROVED**

Honesty layer matches DR-161 and the rework directive. The soul checks that failed rev1 (plain one-served / two-authored disclosure; recorded serve-primary choice; M-guard teeth) are closed in shipped source and tests.
