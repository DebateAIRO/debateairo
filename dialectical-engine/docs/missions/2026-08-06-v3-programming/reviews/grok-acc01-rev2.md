# GROK REVIEW: ACC-01 · rev 2 (rework diamond)

**Verdict: APPROVED**

Independent GROK seat review of the ACC-01 **rework delta since rev-1**. Rev-1
approved the acceptance harness before the production judge-prompt, critique
admission, B1/B2/B3, and live-ceremony-2 evidence landed; this seat re-earns the
verdict on those deltas only. Sources: own `reviews/grok-acc01-rev1.md`; rev-2
packet; ticket `t_0dc09131` body + comments (sqlite read-only); ledger
DR-134..DR-138 + DR-121-r; `handoffs/ACC-01-codex-handoff.md` and
`handoffs/ACC-01-live-ceremony2.log`; shipped `packages/judgement/**`,
`packages/critique/**`, s04 zod, `acceptance/**`, unit tests; `git status` /
`git diff`. Claude/other-seat review files were **not** opened. Board was **not**
mutated. Evidence captures live only in private reviewer scratch
(`acc01-rev2-*.log`).

## Per-delta checklist

| # | Delta | Judgment | Evidence |
|---|---|---|---|
| 1 | Judge prompt declares exact s04 zod artifact schema; parser strict/untouched; RED used observed wrong fallacy shape; live-ceremony-2 zero `JUDGE_SCHEMA_FAILURE` | **VERIFIED FIXED** | System prompt at `packages/judgement/src/index.ts:71-86` declares field names/types/enums including `fallacy: { severity, fatalFlags: [{ type, severity, description }] }`, matching `judgeArtifactSchema` (`index.ts:18-27`) composed from `judgeAssessmentSchema` / `fatalFlagSchema` (`packages/judgement/src/s04.ts:85-98`). Parser path still `parseStructuredArtifact` → `safeParse` only (`s04.ts:135-153`; `index.ts:92-102`); **no** coercion/repair; `s04.ts` has **zero** git dirty. Unit test encodes observed wrong shape `{ detected, type, explanation }` when schema undeclared and asserts declared schema + correct fallacy (`tests/unit/judgement.test.ts:48-106`). Live log: **0** `JUDGE_SCHEMA_FAILURE`; run reached terminal evaluator (`ACC-01-live-ceremony2.log`). This seat re-ran `judgement.test.ts` GREEN (4/4). |
| 2 | B1 — shipped `readDeploymentMakerCapability` + `readRunCostEnvelopePolicy` / `resolveRunCostEnvelopeBasis` (no unauthorized acceptance-local substitutes beyond no-op dispatcher) | **VERIFIED FIXED** | `acceptance/main.ts:5-8,101-114` imports and wires `readDeploymentMakerCapability` and `resolveRunCostEnvelopeBasis`; `acceptance/runtime-policy.ts:4-8,116-118` calls shipped `readRunCostEnvelopePolicy`. Structural test forbids local capability literal and synthesized `totalAttempts` (`acceptance/runtime-policy.test.ts:34-39`). Only authorized substitute remains `NoopDispatcher` (`main.ts:49-52`). |
| 3 | B2 / DR-137 — tier-aware maker floor; capability from honest seeded row; both RED directions | **VERIFIED FIXED** | `assertMakerAdmission` (`packages/critique/src/index.ts:324-338`): high-stakes requires `configuredMakers` size ≥ 2; casual/standard admit when `deploymentMakerCapability` holds for non-casual (casual admits without that gate). Reader allows honest `requiredDistinctMakers ≥ 1` (`critique/src/index.ts:267-268,294-296`). Seeded row is one OpenAI maker with `requiredDistinctMakers: 1` (`acceptance/seed-register.ts:140-150`). Dual directions tested: standard one-maker admits (`critique-s08.test.ts:126-135`); high-stakes one-maker refuses `MAKER_INVENTORY_UNSATISFIED` (`:137-143`); standing capability-false still refuses standard (`:145-157`). This seat re-ran critique suite GREEN (15/15). Ledger DR-137 ACTIVE. |
| 4 | B3 / DR-138 — `max_model_attempts=9` ruled seed with true provenance; no synthesized sum; hash-freshness loud-stop | **VERIFIED FIXED** | `runCostEnvelope` members exactly `{ depth_params:{depth:1}, risk_tier:"standard", max_model_attempts:9 }` with `sourceRef` `acceptance:DR-138:V-approved` (`seed-register.ts:9,101-111`; asserted `seed-register.test.ts:79-89`). Runtime schema is `z.literal(9)` and provenance-gated (`runtime-policy.ts:38-45,108-111`). Grep: no `totalAttempts` / synthesized path remains; tests assert absence (`runtime-policy.test.ts:38-39`). Stale/persisted mismatch throws `ACCEPTANCE_REGISTER_CONFLICT:<row_key>` after `ON CONFLICT DO NOTHING` (`seed-register.ts:185-209`) — loud-stop includes judge-hash drift. Ledger DR-138 ACTIVE. |
| 5 | Handoff QUESTIONS-FOR-V corrected (B2/B3 asked-and-ruled) | **VERIFIED FIXED** | `handoffs/ACC-01-codex-handoff.md` section **QUESTIONS FOR V — asked and ruled** records B2→DR-137 and B3→DR-138 as RULED with no open value invention (`:360-368`). Matches ticket rework comment. |
| 6 | Scope hygiene + suite re-runs | **VERIFIED FIXED** | `git diff --stat` on product trees: production **logic** churn is only `packages/judgement/src/index.ts` + `tests/unit/judgement.test.ts` and `packages/critique/src/index.ts` + `tests/unit/critique-s08.test.ts`. Ancillary authorized wiring: root `package.json` / `pnpm-lock.yaml` add workspace `@debateai/critique` for B1 composition (documented in handoff Inventory). Untracked `acceptance/**` is the ticket surface. No `apps/`, `web/`, migrations, or parser (`s04.ts`) drift. Pre-existing `.claude/launch.json` + mission ledger edits are not product code. **This-seat re-runs:** acceptance vitest **6 files / 13 tests GREEN** (includes ceremony dry path); `tests/unit`+`tests/architecture` **44 files / 257 tests GREEN**; `pnpm run audit:architecture` → `edgeRowsChecked: 27`, `violations: []`. |
| 7 | Live-ceremony-2 log — real path success, DR-135 refusal, 64 WAIT preserved, no fabrication | **VERIFIED FIXED** | `handoffs/ACC-01-live-ceremony2.log`: embedded PG boot on acceptance `.pgdata`; terminal failure is **only** `TypedDomainError` / `ACCEPTANCE_TERMINAL_WAIT_ROWS_UNRESOLVED` for run `3f6a0f6e-6e79-42e8-aa7b-f356e84620e8` naming **exactly 64** WAIT rows; **zero** `JUDGE_SCHEMA_FAILURE`; no fabrication language. Reaching `resolveAcceptanceTerminalActivations` after runner execute implies judge/composition/conformance/propagation completed under the new schema prompt (orchestrator ticket comment aligns). Lawful DR-135 stop pending TERM-01; not a harness defect. |

## Findings

None **BLOCKING**.

1. **ADVISORY** — Live-ceremony-2 log is terminal-error sparse (DB bootstrap + DR-135 stack only). It does not print an explicit “judge call OK” line; success is inferred from zero schema failures plus runner progress to the terminal evaluator. Prefer a one-line organ progress marker on future live runs for peer auditability. Not a code defect.

2. **ADVISORY** — Acceptance non-DB count in worker handoff was 5 files/12 tests; this seat’s full acceptance vitest config run is 6/13 (ceremony included, all GREEN). Report the command path with the number; no failure observed.

## Residual honesty (non-blocking)

- Live settle + same-token UI DONE WHEN remains orchestrator/TERM-01 adjacent (DR-135 + DR-121-r). Rev-2 approves the **rework delta** and lawful live stop, not a fabricated full settle.
- DR-136 / DR-138 remain provisional pending later register-version sittings; seeded exactly as ruled.
- Rev-1 advisory items (NODE_ENV fence unit tests; gitignored gate logs) are unchanged and still non-blocking.

GROK REVIEW: APPROVED — ACC-01 (rev 2)
