# Grok UI-01 review (rev 1) — CODE/LAW gate (DR-140)

**Verdict: CHANGES REQUESTED**

Ticket `t_5f35d086` · mission PROG-V3-R1 · DR-145 (restore V2 UI whole; data layer only) · DR-140 (Claude codes, Grok reviews). This is the peer code/law gate only; orchestrator browser proof and V’s eye remain separate DONE WHEN legs.

---

## Dimension judgments (shipped tree)

### (1) DR-115 — no fabricated value/label/placeholder — **PARTIAL FAIL**

**Three worker-reported fixes: verified**

| Defect | Fix location | Evidence |
|---|---|---|
| Scoring absence labeled “Scoring check failed” | `apps/v2-ui/lib/v3/adapter.ts:307-308` (`v3ScoringStatusLabel` → `"Scoring unavailable"`); `apps/v2-ui/lib/scoringStatusCopy.ts:34-37` consults it before failure copy | Suite: `tests/unit/v2ui-data-layer.test.ts` + `tests/unit/v2ui-pages.test.ts` (source-order of V3 branch before `"Scoring check failed"`) |
| `/admin/workers` printed 0/0/0/0 + “No workers registered.” beside `NO_TYPED_FLEET_SOURCE` | `apps/v2-ui/app/admin/workers/page.tsx:48-55,89,95` (`fleetKnown` gates tallies/`— total`/empty copy) | Suite: `v2ui-pages` “gates every fleet tally…”; `workersFromDeployment` still throws on UNAVAILABLE (`adapter.ts:336-337`) |
| Proxy `body: undefined` under `exactOptionalPropertyTypes` | `apps/v2-ui/app/api/[...path]/route.ts:46-48` (omit body for bodyless methods) | Root typecheck PASS; proxy suite PASS |

**Same-class hunt — residual**

- **BLOCKING-adjacent residual (ADVISORY under acceptance path):** when fleet is `AVAILABLE`, adapter hardcodes `capabilities: []`, `last_seen: ""`, `current_job_id: null` (`adapter.ts:342-345`) though the contract worker shape only types `worker_ref` / `ONLINE|OFFLINE` / `source_ref`. The workers page then reports a numeric **Capabilities** count of `0` (`page.tsx:43-55`) and can render **Idle** for a job field V3 never supplies (`page.tsx:108`). That is the same class of “stating a count/state we do not have,” narrowed to fields outside the deployment contract. Acceptance currently hits `NO_TYPED_FLEET_SOURCE` (where the refusal path is correct), so this is not the live acceptance defect, but it will fire the moment a typed fleet is seeded.

### (2) No honesty regression vs S14 — **FAIL (export gate)**

S14 inventory home: `web/app/debate/[id]/DebatePageClient.tsx`.

| S14 surface | Restored where | Status |
|---|---|---|
| All 23 condition marks incl. `OWED-CHECK-UNEXECUTED`, `UNRESOLVED-TYPE-FALLBACK` | `apps/v2-ui/lib/v3/labels.ts:10-35` exhaustive over `CONDITION_MARKS` (kernel length 23, zero missing); chips + named records in `AnswerHonestyDrawer.tsx:123-152` | **PASS** (labels match S14 `web/lib/v3Presentation.ts` byte-for-byte on marks + abstention kinds) |
| Abstention kinds | `labels.ts:38-45`; drawer + `NodeDetailDrawer` | **PASS** |
| Per-item freshness | `AnswerHonestyDrawer.tsx:173-193` via `summarizeFreshness` | **PASS** |
| Cost envelope | `AnswerHonestyDrawer.tsx:195-204` | **PASS** |
| Numbers + replay handles | `AnswerHonestyDrawer.tsx:234-259`; node drawer base/final + replay | **PASS** |
| Authorized inspection | `DebatePageClient.tsx:668-677` → drawer `356-371` | **PASS** |
| Execution-ledger digest | `DebatePageClient.tsx:648-666` → drawer `374-411` | **PASS** (loads + renders) |
| Export answer + honesty + ledger | `DebatePageClient.tsx:713-726` | **FAIL** — see BLOCKING #1 |
| COMPONENTS_ONLY / verdict / memory / value hinges / graph edges / cycle / investigate-deeper | Honesty drawer sections + V2 canvas/synthesis | **PASS** (present in source; conditional sections correctly gated) |

### (3) Design authority (`apps/v2-ui`) — **PASS**

- Claimed-untouched components + `globals.css` (3301 lines) + `layout.tsx` retain V-copy mtime cluster `12:31`; worker writes (`AnswerHonestyDrawer`, `NodeDetailDrawer` additive section, data layer, pages) are later and inventory-justified.
- Survival table matches the tree: no dropped canvas/thread/split/tree/map/outline/focus/synthesis/challenge/investigation/workspace/guide/toasts.
- `NodeDetailDrawer.tsx:364` additive `<section aria-label="V3 node honesty">` only; V2 drawer markup retained.
- `CanvasViewport` is **absent from V’s design-authority snapshot** (also absent under `apps/dialectical-engine/web` in this tree) — not a worker redesign drop.

### (4) AC-59 — no hand-maintained wire mirror — **PASS**

- `apps/v2-ui/lib/v3/adapter.ts:1-7` imports `Answer` / `AnswerIndex` / `Deployment` / `Edge` / `Node` from `@debateai/contract` (generated package surface via `packages/contract/generated/client.ts` re-export).
- View models stay in V2 `lib/types.ts` (consumer shapes), not a re-authored V3 wire schema. No revived death-list wire mirror.

### (5) S05 ownership through the real route — **PASS**

`tests/unit/v2ui-ownership.test.ts` exercises browser client → same-origin rewrite → **compiled** `apps/v2-ui/app/api/[...path]/route` → real HTTP socket → token-scoped stub upstream:

- owner-200 (`getDebateBundle` + owner token) — PASS
- foreign-404 (`NOT_FOUND`) — PASS
- anon-401 (`SESSION_REQUIRED` via `readAnswer` through proxy) — PASS

Re-run this review: all three green.

### (6) Proxy port + same-origin guard + enforced suite — **PASS**

- Port faithful vs `web/app/api/[...path]/route.ts` (diff is only the body-omit fix for EOPT). Method/path/query/body/token forward, host/expect stripped, SSE non-buffering, upstream failure passthrough, loud missing base — covered in `tests/unit/v2ui-proxy.test.ts` (4 tests, all ran).
- Same-origin guard rejects backslash forms (`/\\evil.test`, `\\\\evil.test`, `/api\\evil.test`) plus `//`, absolute URLs, `..` — `apps/v2-ui/lib/api.ts:38-62`; `tests/unit/v2ui-data-layer.test.ts:60-74` (executed).
- Suites live under root vitest `include: ["tests/**/*.test.ts"]` — **not** a silent-zero `node --test` `[...]` glob. UI-01 five-file re-run: **52/52**.

### (7) TDD RED→GREEN + gates re-run — **PASS**

- Handoff pastes real RED (settings projection; `/new` field binding) and GREEN (52 UI-01). Progress log matches.
- This review re-ran:

```
ROOT TYPECHECK: PASS
v2-ui TYPECHECK: PASS
FULL VITEST: Test Files 57 passed (57) · Tests 376 passed (376)
AUDIT architecture: { "edgeRowsChecked": 27, "violations": [] }
AUDIT source: { "blocking": [] }
v2-ui next build: 7/7 routes
root pnpm build (web): PASS
```

### (8) Scope — **PASS (for UI-01 intent)**

- `web/` **present** and still builds; not deleted.
- UI-01 intentional surface: `apps/v2-ui/**` (untracked restore + data layer), `tests/unit/v2ui-*.test.ts`, `tests/support/v2uiFixtures.ts`, root `tsconfig.json` exclude of `apps/v2-ui`, `.claude/launch.json` → `apps/v2-ui`.
- Dirty `packages/*`, `apps/runner/*`, `acceptance/` in the worktree are **prior mission ticket residue** (TERM/FAIR/ACC class), not UI-01 writes claimed by the handoff. No evidence UI-01 edited engine packages/API/runner/migrations/acceptance for this ticket.
- Board not mutated by this review. Git remains V-gated.

---

## QUESTIONS FOR V — parking judgment (not product rulings)

| # | Parked question | Parking correct? |
|---|---|---|
| **Q1** CanvasViewport absent from V’s snapshot; newer V2 has hard-pinch viewport | **YES.** Worker correctly refused to import files outside the design-authority tree. DR-145 named “canvas + viewport” among surfaces that must survive; whether V’s copy *is* that authority or an older snapshot is V’s call, not the worker’s to unilaterally upgrade. |
| **Q2** Title crush at 1280px after Honesty button | **YES.** Measuring and parking without redesigning `.debateTopActions` / inventing overflow CSS absent from V’s `globals.css` respects design authority. Fix options require V. |

(Q3 empty model ledger / Q4 refuse-vs-hide V2 affordances are also correctly deferred; not gate-blocking.)

---

## Findings

### BLOCKING

1. **Export honesty regression vs S14 (ledger not required; copy/toast overclaim)**  
   - `apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:713-726` — `exportHref` is non-null whenever `answer !== null`, even if `ledgerDigest === null`. S14 gates export on **both** (`web/app/debate/[id]/DebatePageClient.tsx:109`: `answer === null \|\| ledgerDigest === null ? null : …`).  
   - `DebatePageClient.tsx:1166` toast always says `"Exported answer + honesty + ledger"` while `execution_ledger_digest` may be `null` in the payload.  
   - `apps/v2-ui/components/AnswerHonestyDrawer.tsx:476` claims `"Export becomes available once the ledger digest loads."` but `exportHref` does not wait for the digest (`:467` only checks `exportHref !== null`).  
   - **Required fix:** restore S14’s dual gate (or equivalent: no export affordance + no “+ ledger” claim until digest is present); align toast and drawer copy with the actual payload.

### ADVISORY

2. **Fleet field fabrication when `AVAILABLE`** — `apps/v2-ui/lib/v3/adapter.ts:342-345` + `apps/v2-ui/app/admin/workers/page.tsx:43-55,108`. Once a typed fleet exists, Capabilities tallies `0` and job line can show Idle without a V3 source. Prefer per-field typed absence (`—` / “not recorded”) for contract-absent worker fields even when roster read succeeds; surface `source_ref` which *is* typed.

3. **V2-only mutations still visible and loudly refused** (regenerate, scoring feedback, settings write, adaptive-depth approval) — correct per DR-115 (no fake success). Hiding vs refusing is Q4 for V, not a defect.

4. **Root `pnpm run build` still ships `web`, not `apps/v2-ui`** — intentional per handoff; launch.json serves v2-ui on :3000. Shipping cutover is V’s call.

5. **Dormant `apps/v2-ui` `node --test` fixtures / missing `scripts/run-node-tests.mjs`** — UI-01 assertions correctly live in enforced root vitest; leave dormant or delete later so nobody trusts the package `test` script.

---

## Summary

Data-layer swap, design-authority survival, AC-59, S05, proxy/same-origin, TDD evidence, and gate re-runs are solid. The three live DR-115 fixes hold under test. The single **blocking** honesty regression is the export surface: it no longer waits for the execution-ledger digest and overclaims “+ ledger” in UI copy/toast, which violates the S14 non-regression inventory for export.

GROK REVIEW: CHANGES REQUESTED — UI-01
