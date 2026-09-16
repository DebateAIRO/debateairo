# Algorithm Live-Loop Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue mission `2026-09-01-algorithm-live-loop` on the reconciled dev tip: make the 2026-09-16 merge honest (every red attributed, merge damage repaired), land the work the mission's own rulings minted but never dispatched, and prepare the W12 closure so the operator can run the final ceremony.

**Architecture:** The V3 engine is a pnpm monorepo under `dialectical-engine/` (apps/{api,runner,ui,observation-agent,…}, packages/{contract,register,judgement,serve,propagation,db,kernel,…}, tests/{unit,integration,architecture,render}, acceptance/). The mission's law and records live in `dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/` (merged into this branch); the frozen goal is `dialectical-engine/.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md`. Each task is a lane: RED evidence → GREEN → covering gates → commit → report. The orchestrator (this session, Fable 5.1) reviews every task; implementers are Opus subagents. Tasks are OUTCOME-specified (the mission's D58: the orchestrator states the outcome, the seat chooses the mechanism) because the code surface is large; every outcome is mechanically checkable.

**Tech Stack:** TypeScript 7.0.2 (`tsc --noEmit`), vitest 4.1.10, pnpm 11.20.0, Node 26.5.0 on this host (repo declares 22.23.1 — carried as a named fact, per the mission's D68 ADDENDUM 2 precedent), embedded PostgreSQL for integration tests (no Docker), `tools/orphan-audit` for the two lint audits.

**Measurement of record (the orchestrator's verifier, 2026-09-16, at `96e3c91c`):** `scratchpad/gates-96e3c91c.md` — typecheck 43 errors / 17 files; `audit:architecture` crashes on ENOENT `web/package.json`; `audit:source` 5 blocking; unit+architecture 36 failed / 3608 passed (20 of 259 files); integration 10 failed / 1010 passed + 1 unhandled error; full suite 170 failed / 5013 passed (45 of 418 files) = 22 merge-caused + 13 pre-existing known red + 3 inherited from the second parent + 111 environment + 21 undetermined. Every task in Phase 1 names its rows from that report; the implementer reads the report's rows for its task before starting.

## Global Constraints

Copied from the frozen goal (`.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md`) and the mission's `DECISIONS.md`; every task's requirements include this section.

- **Scope law (goal 22–26):** "Algorithm only. NO UI redesign (T11's banner mapping is a vocabulary wiring, not a redesign), no retrieval/tool-use, no steering design, no engine provider model choices (S2-1), no changes to published arithmetic σ/agg/clustering. Legacy `web/` is touched ONLY by T2. Every degradation or skip emits a visible condition mark." Consequence for this plan: nothing under `web/` is added, edited or deleted (the single leftover `web/next.config.mjs` stays); `apps/ui` edits restore wiring one parent had, never new design.
- **RED before GREEN (goal 29–31):** "the FIRST test asserts the DESIRED behavior and fails on the baseline. Never write a test that passes today and flip its assertion later. Read-only probes documenting old behavior are allowed but are not the RED evidence."
- **Suites (goal 32):** "Suites reported passed/total; pre-existing failures named, never absorbed."
- **Sealed rows (goal 39–40):** "Every new policy value lives in sealed register rows via T16's mechanism; missing rows fail loudly." New rows land via MIGRATION + the deployment-register seeding path (`apps/runner/src/dev-deployment-register.ts` + `dev-deployment-register-cli.ts`); `register.bootstrap.json` is NOT touched.
- **Pins vs product (verifier §10.5):** when a pinned inventory (role table, corpus list, attachment row, grant matrix) disagrees with the merged product, decide PER ROW whether the pin or the product is wrong, with the evidence in the report; never blanket-update a pin.
- **Known reds (D64 ADDENDUM 8):** a gate line's known-red list is DERIVED from the last attribution on the base (`gates-96e3c91c.md` for this plan; later tasks use the previous task's final gate) — every red name with its owning ticket; the closing sentence reads "no additional failures in the lane's gate set", never "anywhere". A red with no ticket gets one drafted in the report (title, cause with file:line, owner); the orchestrator writes board files (D1).
- **STRENGTH (D67):** every attribution in a report carries `entailed` / `consistent-with` / `undetermined`; an attribution not verified by reading the failing code path is at most `consistent-with`. Counts are derived from an enumeration in the same pass (D67 ADDENDUM 2).
- **Boundaries (D71, scaled):** for every rule an implementation task changes, the report carries one admitted-boundary and one rejected-boundary assertion derived from the ruling's text.
- **Commit first, measure last (D64 ADDENDUM 5):** commit every source/test/docs change of the round, then take the gates at that tip; a hand-written record starts with `commit=<40 hex>`.
- **Records:** implementers write their report file (path given in the dispatch) and append traps to `dialectical-engine/.hermes/TOOLING-TRAPS.md` (D32). Implementers never edit `board/`, `DECISIONS.md`, `PROGRESS.md`, `LEDGER.md`, `RESUME.md`, `V-DECISIONS-PACKET.md` (the orchestrator is sole writer).
- **Never (D18, D70):** push; mint, read, echo or store any credential; start Docker; install a runtime or a version manager; run the acceptance ceremony (`acceptance/run-acceptance.ts`, `tools/closing-run.sh`) or any `dev:auth:*` script; merge into `dev`/`main`.
- **Gate commands** (run from `dialectical-engine/`): `pnpm run generate:contract` (once per worktree; git-ignored output), `pnpm run typecheck`, `pnpm run audit:architecture`, `pnpm run audit:source` (two separate gate records — D15 ADDENDUM), `pnpm exec vitest run <files>`. Suites longer than a few minutes run in the background with output to a log file; `tests/unit tests/architecture` takes ~5 min, `tests/integration` ~41 min, the full `pnpm test` ~46 min, `tests/render` 13 s.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Named facts to carry in every report:** "Node 26.5.0 (declared 22.23.1; unverified there)"; "Docker daemon not running"; the base commit of the task.

---

## Phase 1 — the reconciled dev made honest

### Task 1: Retire the legacy `web/` references that survived V's retirement of `web/`

Attribution (measured): the only tracked file under `web/` is `web/next.config.mjs`, present on BOTH merge parents; the legacy UI's sources (`web/package.json`, `web/components/LoginFlow.tsx`, `web/lib/v3Presentation.ts`) are on neither parent. The mission's record: "web/ absent at new dev (mission web edits dropped at W12b; D16 web gate retires then)" (`PROGRESS.md:32`); `DECISIONS.md:810` rules the `web/` surface retired in favour of `apps/ui`. `tests/unit/s14-ui.test.ts` is a standing known red (suite-load failure "identical to every parent", `LEDGER.md:487`; W5-R1-F1 / F16). Gate-report rows: §6 rows 1, 2, 10, 14, 27, 28 and §10 item 1. These reds are PRE-EXISTING on both parents (STRENGTH: entailed), not merge-caused — but they crash the architecture audit before it reports, so they go first. **Nothing under `web/` is touched.**

**Files:**
- Modify: `tools/orphan-audit/src/index.ts` (`:35` declares the edge row `["web","web",["contract"]]`; `:52` reads `web/package.json` unguarded in `auditArchitecture`)
- Modify: `tests/architecture/auth-front-door-parity.test.ts` (reads `web/package.json` and `web/components/LoginFlow.tsx` — parity between "both Next builds", one of which no longer exists)
- Modify: `tests/architecture/s14-contract.test.ts` (the FX-ORPH-04 arm reads `web/lib/v3Presentation.ts`)
- Retire: `tests/unit/s14-ui.test.ts` (imports `../../web/lib/v3Presentation.js`; 8 typecheck diagnostics; nothing under `apps/ui` is an equivalent of the retired module)
- Unchanged but expected green afterwards: `tests/architecture/scaffold.test.ts` › *matches all 28 dependency-edge rows* (its ENOENT), `tests/unit/s1-1-depth-contract.test.ts` › *(J10)* (its ENOENT)

**Interfaces:**
- Consumes: nothing.
- Produces: `auditArchitecture()` returns a report (expected: the three `packages/obs-capture` edge violations F31 owns become VISIBLE — that is the audit working, not a new break); no test or tool assumes the legacy `web/` sources exist.

- [ ] **Step 1: Confirm with commands, not memory:** `git cat-file -e 5e617776^1:dialectical-engine/web/package.json; echo $?` (expect 1) and the same on `^2`; `git ls-files web` (expect exactly `web/next.config.mjs`). Paste.
- [ ] **Step 2: RED.** `pnpm run audit:architecture` → paste the ENOENT; `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s14-contract.test.ts tests/architecture/scaffold.test.ts tests/unit/s14-ui.test.ts tests/unit/s1-1-depth-contract.test.ts` → paste the failing names (expect the ENOENT rows plus the rows other tasks own — name those as not-yours).
- [ ] **Step 3: Implement.** Remove the `web` edge row and the unguarded manifest read from the orphan audit (the audit's 28-row pin in `scaffold.test.ts:23` will change to 27 — update that literal with the reason in the same commit; if `scaffold.test.ts` also pins the row list elsewhere, update the same way). For each test site decide — and table in the report — whether the assertion's purpose survives without `web/` (repoint at `apps/ui` ONLY where an equivalent artifact exists) or is about the retired legacy UI itself (retire the arm with a one-line comment citing `PROGRESS.md:32` and `DECISIONS.md:810`). For `tests/unit/s14-ui.test.ts` the unit of retirement is the ASSERTION, not the file (amended 2026-09-16 after the review of the first pass): classify every assertion by the module it imports; assertions whose subject is a retired `web/lib/*` module retire; assertions whose subject is a live module (`@debateai/serve`, `@debateai/contract`, `@debateai/kernel`, the shipped `apps/ui/lib/v3/labels.ts` renderer) are re-homed VERBATIM in `tests/unit/s14-live-projections.test.ts` — never ported by analogy, never dropped.
- [ ] **Step 4: GREEN.** Re-run the Step 2 commands: the ENOENT rows pass; `pnpm run typecheck` no longer lists `tests/unit/s14-ui.test.ts` (35 `obs-agent` errors remain — Task 2's); `pnpm run audit:architecture` runs to a verdict and its violation list is pasted verbatim (expected: the 3 obs-capture rows of F31).
- [ ] **Step 5: Commit** as `fix(gates): retire the legacy web/ references; the architecture audit reports again` and write the report with the per-site decision table (site · purpose · repointed/retired · evidence · STRENGTH).

### Task 2: The `repoRoot` typecheck class in the observation-agent tests (35 errors, pre-existing on V's line)

Attribution (verifier §4a, §9 item 3): all 35 are `Property 'repoRoot' is missing in type …` (TS2741 ×34, TS2322 ×1) in 16 test/fixture files under `tests/{acceptance,integration,unit,architecture}/obs-agent-*`; the `apps/observation-agent` tree (97 paths) arrived from the second parent WITH these errors — not merge-caused, but they make every typecheck gate on this line an identity check against noise, so they are cleared here as FIXTURE work only.

**Files:**
- Read: `apps/observation-agent/src/core/types.ts` (the type requiring `repoRoot`), the 16 files listed in `scratchpad/logs/gates/typecheck-errors.txt`
- Modify: the 16 test/fixture files ONLY (supply `repoRoot` the way the product's own callers do — find the production call site with `grep -rn 'repoRoot' apps/observation-agent/src | head`)

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm run typecheck` free of `obs-agent-*` errors without any change to product types.

- [ ] **Step 1: Attribute with commands:** `git show 5e617776^2:dialectical-engine/apps/observation-agent/src/core/types.ts | grep -n repoRoot` (expect present: V's line already required it) and `git show 5e617776^2:dialectical-engine/tests/unit/obs-agent-05-lifecycle.test.ts | grep -c repoRoot` (expect 0). Paste. STRENGTH-tag.
- [ ] **Step 2: RED.** `pnpm run typecheck 2>&1 | grep -c 'obs-agent'` → 35.
- [ ] **Step 3: Implement.** Supply `repoRoot` in every fixture/test context exactly as the production caller does (same source of truth — a `process.cwd()`-derived or `import.meta`-derived path — not a hard-coded absolute path). Product types unchanged (`git diff --stat -- apps/observation-agent/src` must be empty).
- [ ] **Step 4: GREEN.** `pnpm run typecheck` shows zero `obs-agent` lines; `pnpm exec vitest run tests/unit/obs-agent-01-discovery.test.ts tests/unit/obs-agent-01-status-projections.test.ts tests/unit/obs-agent-05-lifecycle.test.ts tests/unit/obs-agent-05-postgres.test.ts tests/architecture/obs-agent-06-copy.test.ts` passed/total; `pnpm exec vitest run tests/integration/obs-agent-01-delivery.test.ts tests/integration/obs-agent-03-fixture.test.ts tests/integration/obs-agent-04-gap-drill.test.ts tests/integration/obs-agent-04-not-wired.test.ts tests/integration/obs-agent-05-connection-drill.test.ts tests/integration/obs-agent-05-docker.test.ts tests/integration/obs-agent-06-status.test.ts tests/integration/obs-agent-06-views.test.ts` passed/total (embedded PostgreSQL; ~minutes).
- [ ] **Step 5: Commit** as `test(obs-agent): fixtures supply repoRoot as the product does (typecheck identity restored)` and report; draft a ticket for V's program noting the class arrived red on `f19c706f`.

### Task 3: UI token roles and the mode-inert colour literals (`apps/ui/app/globals.css` reconcile)

Attribution (verifier §6 rows 3–5, 21–22, 29–30): `role-token-map` ×3 and `pda-s03-keyboard-accessibility` ×2 are merge-caused regressions against the first parent — the tests are identical on both parents and read `apps/ui/app/globals.css`, which the merge resolved toward `^2` (differs from `^1` by 13 878 diff lines, from `^2` by 53). `t9-mode-tokens` ×2 are inherited from the second parent (already red there): three mode-inert colour literals at `globals.css:500`, `:1021`, `:7137`, and `apps/ui/components/ModeToggle.tsx` rendering `☀` where the test expects `☀ Terracotta`.

**Files:**
- Modify: `apps/ui/app/globals.css` (and `apps/ui/components/ModeToggle.tsx` for the label row)
- Read: `tests/architecture/role-token-map.test.ts` (:113 "DebateMap root hub" → role "reasoning accent"; :143 "DebateCanvas agreed review mark" → "agreed review verdict"; :149 "DebateCanvas disputed review mark" → "disputed review verdict"), `tests/unit/pda-s03-keyboard-accessibility.test.ts` (inactive link control weight 600), `tests/unit/t9-mode-tokens.test.ts` (:558 and the colour-literal arm), `scratchpad/logs/gates/globals-p1-head.diff`, `globals-p2-head.diff`

**Interfaces:**
- Consumes: nothing.
- Produces: the seven assertions pass; no new visual design — bindings one parent had are restored (Scope law: vocabulary/token wiring).

- [ ] **Step 1: Attribute per row.** For each of the three roles and the link weight: `git show 5e617776^1:dialectical-engine/apps/ui/app/globals.css | grep -n <token or selector>` vs `^2` vs HEAD — state which parent's binding the merge dropped. For the three colour literals: confirm `^1` has none (`git show 5e617776^1:… | grep -c '<literal>'`). STRENGTH-tag.
- [ ] **Step 2: RED.** `pnpm exec vitest run tests/architecture/role-token-map.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/t9-mode-tokens.test.ts` → paste the seven failures.
- [ ] **Step 3: Implement.** Restore the mission's review-mark and root-hub role bindings and the inactive-link weight into V's stylesheet (both parents' bindings coexist); replace the three colour literals with the mode-aware tokens the file already defines for their neighbours; make `ModeToggle` render the mode name the test pins. If any of the `t9-mode-tokens` rows requires more than a token/label wiring, stop on that row and report it as V-line debt with a drafted ticket.
- [ ] **Step 4: GREEN.** Same command → 0 failed; `pnpm exec vitest run tests/unit/ui-census.test.ts tests/unit/v2ui-data-layer.test.ts tests/unit/t9-landing.test.tsx tests/render/t1-canvas.test.tsx` passed/total (name any render row that fails for the Task 9 `localStorage` reason as not-yours).
- [ ] **Step 5: Commit** as `fix(ui): restore the review-mark and root-hub token roles, the inactive-link weight and mode-aware literals lost in the globals.css merge`.

### Task 4: UI render-site contracts the merge broke (`v2ui-pages` ×5, `s8-publication-contract`, `s14-contract` ×2)

Attribution (verifier §6 rows 9, 11, 13, 32–36; §10 item 6): first-parent contract tests now assert against origin/dev's `apps/ui` modules, a pairing that existed on neither parent (`v2ui-pages`, `s14-contract` row 9) or a first-parent-green assertion the merge resolved toward `^2` (`s8-publication-contract`). These tests pin ALGORITHM OUTPUTS reaching the reader: score badges (`V3ScoreBadges`), the maker meta line, typed review outcome + reviewer house on cards, the eight call sites of tree/thread/outline/split/map/drawer, the public-only reader `PublicAnswerDisclosure`, and the generated contract client as the UI's only wire type (`DebateSummary` from `@debateai/contract`). Row 11 (`localeCompare`) is undetermined.

**Files:**
- Read: `tests/unit/v2ui-pages.test.ts`, `tests/architecture/s8-publication-contract.test.ts`, `tests/architecture/s14-contract.test.ts`, the `apps/ui` pages/components each names; `scratchpad/logs/gates/unit-arch-failures.txt` for the exact expectation strings
- Modify: `apps/ui/**` — ONLY to restore render sites, imports and readers the first parent had (wiring), inside V's page structure

**Scope amendment (2026-09-16, after Task 3's review):** attribution is per ASSERTION — compare the blob hash of the source each failing assertion READS (`git rev-parse 5e617776^1:<path> 5e617776^2:<path> HEAD:<path>`), never the suite's other inputs. A render site that exists on NEITHER parent is not this task's (authoring it is UI work outside the Scope law) — it is ticketed for V's UI program. Measured example: the three `tests/architecture/role-token-map.test.ts` rows for the DebateMap root hub and the DebateCanvas review marks read `apps/ui/components/DebateMap.tsx` and `DebateCanvas.tsx`, whose blobs are identical on both parents and at HEAD; they are red on both parents and excluded here.

**Interfaces:**
- Consumes: Task 3 (tokens).
- Produces: the eight assertions pass; the mission's T6/T11/S08 outputs (review outcomes, marks, badges, verdict banner mapping) are rendered by V's UI.

- [ ] **Step 1: Attribute per row.** For each expectation string: does the first parent's `apps/ui` contain it (`git show 5e617776^1:dialectical-engine/<file> | grep -c '<string>'`), does `^2`, does HEAD? Where V's overhaul moved a render site to a differently named component, say so with the path. STRENGTH-tag; the `localeCompare` row gets a read of the source it flags before any verdict.
- [ ] **Step 2: RED.** `pnpm exec vitest run tests/unit/v2ui-pages.test.ts tests/architecture/s8-publication-contract.test.ts tests/architecture/s14-contract.test.ts` → paste the eight failures.
- [ ] **Step 3: Implement.** Restore each render site / reader / contract import inside V's components; where V's overhaul deliberately replaced a site with an equivalent, update the test's LOCATOR (component path) but never its assertion about what the reader sees; if a row cannot be satisfied without redesign, stop on that row and report it (Scope law) with the two options.
- [ ] **Step 4: GREEN.** Same command → 0 failed (or the reported residue); `pnpm exec vitest run tests/unit/ui-census.test.ts tests/unit/t11-verdict-label.test.ts tests/unit/v2ui-data-layer.test.ts` passed/total; `pnpm run typecheck`.
- [ ] **Step 5: Commit** as `fix(ui): the algorithm's outputs reach the reader again — render sites and the contract client restored in V's UI` and report the per-row table.

### Task 5: Entry-point wiring, inventory drift and the two false environment reds

Attribution (verifier §6 rows 16–19, §7 rows 2–3, 10, §8b, §9 "not mentioned" 1–2, §10 items 2, 5, 8, 10):
- `apps/api/src/main.ts` LOST `installGracefulShutdown` (2× on `^1`, 0× on `^2`, 0× at HEAD; merge-touched) — `t1-argon2-worker-contract.test.ts` `:487` and `:693` pin it AND pin `not.toMatch(/process\.on\(\s*["']SIG/)`; V's `^2` added `apps/api/src/startup-resource-owner.ts` which wraps `installGracefulShutdown`. Merge-caused, entailed.
- database role inventory drift: `obs-l1-s01-foundation.test.ts:725` and `:872` (grant matrix now has one more role), `tint1-upgrade-migration.test.ts` (`DEV_DATABASE_CAPABILITY_ROLES_INVALID` at `apps/runner/src/dev-database-principals.ts:412` — V's wider principal table: `debateai_dev_support*`, `debateai_support*`). Merge-caused, entailed.
- `scaffold.test.ts:213` `s07Surface` row `packages/graph.GraphRepository.readNodeLifecycleEvents` came back `UNATTACHED` (pinned `ATTACHED` on both parents; `tools/orphan-audit/src/index.ts:808` is the merge's own edit). Merge-caused.
- `acceptance/dual-maker-proof.test.ts` › FAIR-02 `REGISTER_REQUIRED_ROW_MISSING:envelope:envelopeFormulaInputs` — the merge's own subject ("enforce required rows in the sealing transaction"); `acceptance/seed-register.ts` is merge-touched. Merge-caused.
- two FALSE environment reds: `tests/architecture/sup-02-console.test.ts:11-12` walks `tools/` recursively without a `node_modules` filter (matches `tools/acceptance-bundle/node_modules/@debateai/register/src/support-config.ts` …); `acceptance/adversarial-corpus.test.ts:455` pins the child environment as exactly `["HOME","LANG","OLDPWD","PATH","PWD","TMPDIR"]` and this shell exports no `LANG`.

**Files:**
- Modify: `apps/api/src/main.ts` (and/or `apps/api/src/startup-resource-owner.ts`), `apps/runner/src/dev-database-principals.ts` or the two role-inventory tests, `tools/orphan-audit/src/index.ts` (the attachment detection at ~:808) or `tests/architecture/scaffold.test.ts:213`, `acceptance/seed-register.ts` or the required-row list it feeds, `tests/architecture/sup-02-console.test.ts`, `acceptance/adversarial-corpus.test.ts`

**Interfaces:**
- Consumes: Task 1 (the audit reports).
- Produces: production shutdown installed through the T3 lifecycle module; role inventories decided per row; the s07 attachment row true; the envelope required row seeded; the two false reds true on any host.

- [ ] **Step 1: RED.** `pnpm exec vitest run tests/architecture/t1-argon2-worker-contract.test.ts tests/architecture/scaffold.test.ts tests/architecture/sup-02-console.test.ts acceptance/dual-maker-proof.test.ts acceptance/adversarial-corpus.test.ts` and, in the background, `pnpm exec vitest run tests/integration/obs-l1-s01-foundation.test.ts tests/integration/tint1-upgrade-migration.test.ts` → paste every failing name.
- [ ] **Step 2: Implement per cluster, deciding pin vs product per row:**
  - shutdown: `main.ts` installs graceful shutdown through the T3 lifecycle module again (directly, or via `startup-resource-owner.ts` if that wrapper provably installs it — then the test's regex is updated to the real invariant with the wrapper cited); the `process.on("SIG…")` prohibition holds.
  - roles: V's support roles are the product now; the grant matrix and the capability-role validator admit them ONLY with their grants verified least-privilege (read `dev-database-principals.ts` and the migration that creates them); update the pins with the evidence per role.
  - attachment: find why the merged `orphan-audit` reads `readNodeLifecycleEvents` as UNATTACHED (the merge's `:808` hunk vs both parents in `scratchpad/logs/gates/orphan-p1-head.diff`); fix the detector, not the pin, unless the product genuinely detached the call — then say where.
  - envelope row: the seeder supplies `envelope:envelopeFormulaInputs` (the T17 row family) or the required-row list is corrected — read `acceptance/seed-register.ts` and the sealing transaction's required-row check; the sealed 106 ceiling inputs must still be the ones `tests/unit/t17-envelope.test.ts` pins.
  - false reds: `sup-02-console` filters `node_modules`; `adversarial-corpus` asserts the child environment as a SET that tolerates an absent `LANG` (or sets `LANG` for the child explicitly — say which and why).
- [ ] **Step 3: GREEN.** The Step 1 commands → 0 failed; `pnpm exec vitest run tests/unit/t17-envelope.test.ts tests/integration/t17-envelope-ledger.test.ts tests/integration/t16-algorithm-register.test.ts tests/architecture/t16-algorithm-register-rows.test.ts acceptance/runtime-policy.test.ts` passed/total; `pnpm run typecheck`; `pnpm run audit:architecture` unchanged from Task 1's verdict.
- [ ] **Step 4: Commit** one commit per cluster (`fix(api): …`, `fix(reconcile): …`, `test(gates): …`) and report with the per-row decision table.

### Task 6: The source audit and the scaffold pins

Attribution (verifier §5b, §6 row 15, §10 item 3): `audit:source` has 5 blocking rows; `scaffold.test.ts:29` pins exactly the three `packages/obs-capture/install/*.ts` env-read rows (V's accepted state, F18/F31 owned). The 4th (`packages/serve/src/synthesis.ts exports a numeric source literal instead of a register/law carrier`) is pre-existing on the first parent; the 5th (`migrations/0061_algorithm_publication_profiles.sql:10 has bare CREATE FUNCTION without OR REPLACE`) is the merge's own new file — absent on both parents.

**Files:**
- Modify: `migrations/0061_algorithm_publication_profiles.sql:10`, `packages/serve/src/synthesis.ts`
- Read: `tools/orphan-audit/src/index.ts` (the source-constant rule's text), `tests/architecture/scaffold.test.ts:21-33`

**Interfaces:**
- Consumes: Task 1.
- Produces: `pnpm run audit:source` blocking == the three pinned obs-capture rows; `tests/architecture/scaffold.test.ts` GREEN (with Task 5's rows).

- [ ] **Step 1: RED.** `pnpm run audit:source` → paste the five; `pnpm exec vitest run tests/architecture/scaffold.test.ts` → paste.
- [ ] **Step 2: Implement.** `0061`: `CREATE OR REPLACE FUNCTION`. `synthesis.ts`: find the literal (`grep -nE '^export const [A-Z_]+ *= *[0-9]' packages/serve/src/synthesis.ts`) and the carrier form the audit accepts; if the value is a POLICY value (a bound, a count, a threshold the algorithm decides with), it belongs in a sealed register row via T16's mechanism (migration + dev deployment seeding + a loud-missing-row test) — say which it is and why; if it is a law constant (a structural fact), use the carrier pattern the audit names. The three obs-capture rows stay (ticketed F31; pinned by V's test).
- [ ] **Step 3: GREEN.** `pnpm run audit:source` blocking == the three pinned lines; `pnpm exec vitest run tests/architecture/scaffold.test.ts` 3/3; `pnpm exec vitest run tests/unit/t09-synthesis.test.ts tests/unit/register-publication.test.ts tests/integration/register-support-publication.test.ts` passed/total.
- [ ] **Step 4: Commit** as `fix(source-audit): the merge's 0061 function is idempotent; synthesis' literal is a carrier`.

### Task 7: The depth single-source law after the merge (`s1-1-depth-contract` ×3 remaining rows)

Attribution (verifier §6 rows 24–26; §10 item 5): the oracle's "parses every shipped file" row reports 153 ADDED shipped files (origin/dev's `apps/api/src/support/*` and all of `apps/observation-agent/src/**`) — the F-ORACLE-CORPUS-COUNT class (pre-existing instrument, amplified by the merge); the two rows the mission CLOSED (`LEDGER.md:422`: "2 disappeared — exactly the two S1-1 rows") are red again — three duplicate definitions of the ruled ceiling and three extra depth-bound sites in shipped code, introduced by the second parent's files. Ruling S1-1 / goal T1: "The 1–5 integer bound is defined ONCE in `packages/contract`".

**Files:**
- Read: `tests/unit/s1-1-depth-contract.test.ts` (the assertion diffs name the three duplicate definitions and the three extra sites), `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator.md` (how the corpus row is derived), `packages/contract/src/index.ts` (`EXPANSION_DEPTH_MAX`)
- Modify: the corpus row (re-derived), the three duplicate-definition sites, the extra depth-bound sites

**Interfaces:**
- Consumes: Task 1 (the J10 arm is green after it).
- Produces: `tests/unit/s1-1-depth-contract.test.ts` GREEN; every depth bound in shipped code reads `EXPANSION_DEPTH_MAX` from `@debateai/contract`.

- [ ] **Step 1: RED.** `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` → paste the three failures INCLUDING the named paths.
- [ ] **Step 2: Attribute per site.** `git log --oneline -1 5e617776^2 -- <file>` for each named site (expect V's debate-tiers / support / observation work). STRENGTH-tag.
- [ ] **Step 3: Implement.** Route each duplicate and extra site to the single source; re-derive the corpus row by the oracle's own procedure over the merged tree (derive, never hand-edit a count); each of the 153 added files gets the oracle's verdict recorded (admitted/withheld) — a file the oracle cannot parse is a finding.
- [ ] **Step 4: GREEN.** The s1-1 file passes; `pnpm run typecheck`; `pnpm exec vitest run tests/unit/t1-*.test.ts tests/unit/register-s09.test.ts` passed/total; boundary assertions (D71): for each re-routed site, one test proving depth 5 admitted and 6 rejected, or a citation to the existing test that already covers that site.
- [ ] **Step 5: Commit** as `fix(s1-1): one depth source survives the merge — <n> sites re-routed, corpus re-derived over <m> files`.

### Task 8: Land `lane/stub-class` and finish the fake-`pg`-client sweep

Attribution (verifier §6 rows 20, 37; §7 row 4; §10 item 4): `load01` (a 120 s hang, not an assertion — ~2 minutes of every full run), `xrev01`, AND a third unswept member `tests/integration/obs-l3-s06-runner-binding.test.ts:290` all dispatch on the retired `pg_advisory_lock` text; the product issues `pg_try_advisory_lock(hashtextextended($1,0)) AS acquired` and `packages/db/src/index.ts:334` reads `acquired !== true` as contention and retries forever. `pro01-runner-tree.test.ts:206` shows the working shape. The lane `origin/lane/stub-class` @ `bf235c9f` (3 files: the two unit tests + `.hermes/TOOLING-TRAPS.md`) was dispatched 2026-09-09 and never reviewed, reported or merged.

**Files:**
- Merge: `origin/lane/stub-class` (TOOLING-TRAPS conflicts trivially — keep both appended blocks, HEAD's first)
- Modify: `tests/integration/obs-l3-s06-runner-binding.test.ts:290` (the third member), plus the packet's outcomes 2 and 3 if not in the lane's commit: `tests/integration/s8-publication-database.test.ts:1678/:1703/:1753` (`as never` → `buildFairShapedAnswer`), `tests/unit/dev-auth-stack.test.ts:482-490` (control naming)
- Read: `.hermes/reports/2026-09-01-algorithm-live-loop/packets/stub-class-worker.md`, the three board tickets it names

**Interfaces:**
- Consumes: nothing.
- Produces: the three fake clients answer the lease query the product issues; every unmodelled query still fails loudly; `load01` finishes in seconds.

- [ ] **Step 1: RED.** `pnpm exec vitest run tests/unit/xrev01-node-review.test.ts` → 1 failed; `timeout 200 pnpm exec vitest run tests/unit/load01-run-projection.test.ts` → the 120 s timeout; `pnpm exec vitest run tests/integration/obs-l3-s06-runner-binding.test.ts` → the `UNEXPECTED_CLIENT_QUERY` row (name the other three rows of that file as Task 9's). Paste all.
- [ ] **Step 2: Merge** `git merge --no-ff origin/lane/stub-class`; resolve TOOLING-TRAPS; commit.
- [ ] **Step 3: Review the lane against its packet** (nobody has): outcome 1 line by line — `pg_try_advisory_lock` answered with `{ rows: [{ acquired: true }] }`, the stale branch REMOVED, unmodelled queries loud, no assertion removed (`git diff e2adf68b bf235c9f -- tests/unit/ | grep -E '^-.*(expect|it\(|test\()'` empty). `git show --stat bf235c9f` shows outcomes 2 and 3 are NOT in the commit: implement them per the packet's text (small, fully specified) and sweep the third member the same way.
- [ ] **Step 4: GREEN.** `pnpm exec vitest run tests/unit/xrev01-node-review.test.ts tests/unit/load01-run-projection.test.ts tests/unit/dev-auth-stack.test.ts tests/unit/pro01-runner-tree.test.ts tests/unit/evaluator-addon.test.ts` passed/total with wall time; `pnpm exec vitest run tests/integration/obs-l3-s06-runner-binding.test.ts tests/integration/s8-publication-database.test.ts` passed/total (the three undetermined obs-l3 rows may stay red — name them); `pnpm run typecheck`.
- [ ] **Step 5: Commit** additions as `test(stub-class): …` and write the lane's report at `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/stub-class.md` (the packet named that path; it never existed): review findings, residue, gates.

### Task 9: The environment block, the undetermined rows, and the final attributed gate

Attribution (verifier §8a, §7 rows 1, 5–7, 9, §6 rows 11, 23, 31, §10 items 7, 9, 11): `tests/render` — 122 rows, 100 of them `TypeError: Cannot read properties of undefined (reading 'clear')` (the bare `localStorage` global undefined under vitest 4.1.10 + Node 26.5.0; jsdom 30.0.1 itself supplies it) and 7 a null React dispatcher in `ux01-new-debate-form.test.tsx` (two React copies: `vitest.config.ts:7-8` aliases react to `apps/ui/node_modules/react`, the stack resolves the root copy); 2 RSS gates (`registration.test.ts` S3c B4, `registration-database.test.ts` S3d) deterministically red on this host under Node 26; `text-control-bytes` inherited from `^2` (two offending files); the 21 undetermined rows; and the accepted known reds with owners (`s04-contract`, `s10-carrier-erasure-red`, `s13-contract`, `s7-authorization-contract` = sealedrows #1–#4; the s7 `ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP` unhandled rejection).

**Files:**
- Read: `scratchpad/gates-96e3c91c.md` §8a and "Still undetermined"; `vitest.config.ts`; each undetermined test's failing path
- Modify: only what the attribution proves merge-caused; a vitest setup change is allowed ONLY if it makes the declared engine's behaviour explicit (never a shim that hides a Node-26 difference)

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: a full-suite gate at the task's final commit with EVERY red name attributed to a ticket or a cause; the `localStorage` question settled by a probe.

- [ ] **Step 1: Settle the `localStorage` question with a probe, not a theory.** `node -e "console.log('localStorage' in globalThis, typeof globalThis.localStorage)"` under Node 26.5.0 (if the key EXISTS with value `undefined`, vitest's jsdom environment will not overwrite an existing global — that is the mechanism; paste the output). Then `pnpm exec vitest run tests/render` (13 s) — 122 expected. If the mechanism is the Node-26 web-storage global, record it as `env:toolchain (Node 26 web storage global shadows jsdom's)` with STRENGTH entailed, and write the one-line recommendation for the operator (run the declared Node 22.23.1). Do not install a runtime.
- [ ] **Step 2: The React dispatcher rows (7):** read the stack; if `SupportWidget` (V's support widget) imports React through a path the alias does not cover, the fix is the alias/dedupe in `vitest.config.ts` (test infrastructure, allowed) — RED → GREEN on `tests/render/ux01-new-debate-form.test.tsx`.
- [ ] **Step 3: The 21 undetermined rows:** read each failing code path; attribute (`merge-caused` → fix; `pre-existing on ^1/^2` → draft ticket; `env` → record); the 15 render assertion rows are attributed only after Step 1.
- [ ] **Step 4: The two RSS gates:** record as `env:host-load (F22 family; Node 26.5.0)` with the measured numbers; do not move a bound.
- [ ] **Step 5: Commit, then the final gate.** Commit everything first; then `pnpm run typecheck`, `pnpm run audit:architecture`, `pnpm run audit:source`, and `pnpm test -- --reporter=default --reporter=json --outputFile=<report dir>/full-<sha8>.json` in the background (~46 min). Report the four-count (test failures / suite-load failures / skips / unhandled errors), passed/total, files — and the KNOWN REDS block: every remaining red name with its ticket (existing or drafted) and cause. Closing sentence: "no additional failures in the gate set".
- [ ] **Step 6: Report** with the attribution table for all rows the plan did not already close.

---

## Phase 2 — the work the mission's rulings minted and never dispatched

### Task 10: V-SEC-1 — encrypt the verdict text at rest in `serve.answer` (fold-lane FL-1)

**Files:**
- Merge: `origin/security/handoff-b21-serve-answer` @ `40d1e3a3` (5 files: `migrations/0057_serve_answer_content_carrier.sql` — MUST be renumbered to the next free number, `0062`, because HEAD already has two `0057_*` files and `packages/db/src/index.ts:769` applies `migrations/*.sql` sorted by name; `packages/crypto/src/index.ts`; `packages/serve/src/index.ts`; `tests/architecture/s6-content-encryption-contract.test.ts`; `tests/integration/serve-answer-content-encryption.test.ts`)
- Read: `.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md` D26 (the fold-lane spec), `V-DECISIONS-PACKET.md:35` (V-SEC-1)

**Interfaces:**
- Consumes: Task 9 (an attributed base).
- Produces: encrypted runs persist no plaintext verdict text in `serve.answer.answer_form`; the projection decrypts for the owner; `tests/integration/serve-answer-content-encryption.test.ts` GREEN on the merged tree.

- [ ] **Step 1: RED.** Take the handoff's TEST file first (`git checkout origin/security/handoff-b21-serve-answer -- dialectical-engine/tests/integration/serve-answer-content-encryption.test.ts`), run `pnpm exec vitest run tests/integration/serve-answer-content-encryption.test.ts` → paste the failures (plaintext observed).
- [ ] **Step 2: Land.** `git merge --no-ff origin/security/handoff-b21-serve-answer` (dry-run showed a clean textual merge); `git mv migrations/0057_serve_answer_content_carrier.sql migrations/0062_serve_answer_content_carrier.sql`; verify `ls migrations | grep -c '^0057_'` is 2 and `0062` is unique.
- [ ] **Step 3: Reconcile semantically.** The patch was written against `b5a6b6eb` (2026-09-01); T9 rewrote `packages/serve/src/index.ts` afterwards. Walk every insert/projection/source site of `answer_form` at HEAD (`grep -n answer_form packages/serve/src/index.ts`) and confirm each is covered by the carrier; add the synthesis loop's served-statement path if the patch predates it.
- [ ] **Step 4: GREEN.** `pnpm exec vitest run tests/integration/serve-answer-content-encryption.test.ts tests/architecture/s6-content-encryption-contract.test.ts tests/unit/s6-content-encryption.test.ts tests/integration/s8-publication-database.test.ts tests/unit/t09-synthesis.test.ts tests/unit/serve.test.ts` passed/total; `pnpm run typecheck`; `pnpm run audit:source` unchanged. Boundary assertions: an encrypted run's stored `answer_form` contains no substring of the served statement (rejected boundary); a non-encrypted run's projection is byte-identical to before (admitted boundary).
- [ ] **Step 5: Commit** as `fix(serve): encrypt verdict text in serve.answer for encrypted runs (V-SEC-1, FL-1) — migration renumbered 0062`.

### Task 11: W7 — the reviewer is not told who authored the node (V-BLIND-CONTEXT)

**Files:**
- Modify: `packages/judgement/src/index.ts` (three sites pairing a system prompt "authored by a different maker / by another maker" with a user payload field `{ name: "author_maker", content: input.authorMaker }` — re-locate with `grep -n author_maker packages/judgement/src/index.ts`)
- Create: `tests/unit/prompt-surface-guard.test.ts` — a guard over the WHOLE prompt surface (Task 12 extends it)
- Read: `.hermes/reports/2026-09-01-algorithm-live-loop/board/W7-blind-review-prompts.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the guard test; `authorMaker` stays on request/record objects (database provenance intact — `runner:121` reviewer selection, `readLatestReviewerMaker`, `evaluator:2576` lineage untouched).

- [ ] **Step 1: RED.** The guard renders every review/judge prompt builder in `packages/judgement/src/index.ts` with a fixture whose `authorMaker` is a sentinel (e.g. `"AUTHOR-SENTINEL-7f3a"`) and asserts the sentinel appears in NO message content sent to the model. `pnpm exec vitest run tests/unit/prompt-surface-guard.test.ts` → FAIL (three sites leak). Paste.
- [ ] **Step 2: Implement.** Keep the foreign-text framing ("authored by another participant"), drop the identity and the `author_maker` payload field; the wording must not assert the reviewer differs from the author (V-S11-GRADER: the same model may review).
- [ ] **Step 3: GREEN.** Guard passes; `pnpm exec vitest run tests/unit/t03-judge-panel.test.ts tests/unit/t05-reviewer-measured-edges.test.ts tests/unit/t06-review-teeth.test.ts tests/unit/xrev01-node-review.test.ts tests/unit/t4-way-of-knowing.test.ts` passed/total; `pnpm run typecheck`. Boundary: framing sentence present (admitted); sentinel absent (rejected).
- [ ] **Step 4: Commit** as `fix(judgement): the reviewer reads the node, not its author (W7, V-BLIND-CONTEXT)`.

### Task 12: W9 — the model reads its task, not the machinery (V-MINIMUM-PAYLOAD)

**Files:**
- Modify: `apps/runner/src/index.ts` (the two synthesis-call sites doing `{ role: "user", content: JSON.stringify(request) }` — re-locate with `grep -n 'JSON.stringify(request)' apps/runner/src/index.ts`), `packages/serve/src/synthesis.ts` (`SYNTHESIZER_INSTRUCTIONS`)
- Modify: `tests/unit/prompt-surface-guard.test.ts` (Task 11's) — the sent payload contains none of `roleRef`, `round`, `stage`, `registerVersion`
- Read: `board/W9-minimum-model-payload.md`; `packages/serve/src/synthesis.ts` frozen key sets (`assertFreshContextRequest`, ~:341-346)

**Interfaces:**
- Consumes: Task 11's guard.
- Produces: the model-facing payload is a projection (`instructions`, `digest`, the code label's numbers, `candidateStatement`, `priorObjection` on retry) while the REQUEST object keeps every field (so `assertFreshContextRequest` and the audit record are unchanged).

- [ ] **Step 1: RED.** Extend the guard: render the synthesizer initial, synthesizer retry and evaluator payloads through the real call path with a fake provider that records `messages`; assert none of the four machinery keys appears in the sent content. Run → FAIL. Paste.
- [ ] **Step 2: Implement.** Projection at the two call sites; add to `SYNTHESIZER_INSTRUCTIONS` the obligation the evaluator already enforces: the statement must agree with the supplied code label and must not claim more confidence than it carries (F-W9-1).
- [ ] **Step 3: GREEN.** Guard passes; `pnpm exec vitest run tests/unit/t09-synthesis.test.ts tests/unit/t11-verdict-label.test.ts tests/unit/t15-eval-harness.test.ts tests/unit/t17-envelope.test.ts` passed/total (a T9 assertion pinning the full-request shape is about the RECORD, not the prompt — keep the record intact); `pnpm run typecheck`.
- [ ] **Step 4: Commit** as `fix(runner): synthesis roles read a task projection, not the request machinery (W9, V-MINIMUM-PAYLOAD)`.

### Task 13: W2 — emit `DEGRADED-DIVERSITY` when synthesizer and evaluator share an identity (F-VS11-1)

**Files:**
- Read: `board/W2-emit-diversity-mark.md`; the mark's declaration (`grep -rn 'DEGRADED-DIVERSITY' packages apps`), the existing detection (`grep -rn SYNTHESIS_ROLE_REFS_IDENTICAL packages apps`), the UI label ("Model diversity degraded")
- Modify: the serve/runner site that assembles the served answer's condition marks
- Create: `tests/unit/w2-degraded-diversity-mark.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a served answer whose synthesizer and evaluator resolve to the same provider identity carries `DEGRADED-DIVERSITY` with `{ roles: ["SYNTHESIZER","EVALUATOR"], identity: <provider identity> }`; different identities → no mark.

- [ ] **Step 1: RED.** Run the synthesis chain with a register whose two role refs resolve to the same identity (reuse `tests/unit/t09-synthesis.test.ts` fixtures) and assert the served answer's marks include the mark with both roles; run → FAIL (no emitter). Paste.
- [ ] **Step 2: Implement.** Emit where the identities are resolved for the run (not from the console.warn); keep the warning.
- [ ] **Step 3: GREEN.** New test passes; boundary: identical refs → mark present (admitted), distinct → absent (rejected); `pnpm exec vitest run tests/unit/t09-synthesis.test.ts tests/unit/t12-t13-band-basis.test.ts tests/unit/serve.test.ts` passed/total; the UI test rendering marks (`grep -rln 'DEGRADED-DIVERSITY' tests apps/ui`) passed/total.
- [ ] **Step 4: Commit** as `feat(serve): the served answer discloses a shared synthesizer/evaluator identity (W2, F-VS11-1)`.

### Task 14: W1 — one FIXED grader for every arm of the eval harness (V-S11-GRADER)

**Files:**
- Read: `board/W1-fixed-grader.md`; the harness (`acceptance/eval-harness-cli.ts` and the module it drives — `grep -rln 'grader' acceptance packages/*/src`), `tests/unit/t15-eval-harness.test.ts`, `DECISIONS.md` V-S11-GRADER (2828-2862)
- Modify: the grader-seating logic (today: excludes candidate identities, exhausts independent ones, repeats one before seating a candidate ref)

**Interfaces:**
- Consumes: nothing.
- Produces: ONE configured grader for every arm; disclosure of the grader identity and whether it shares model/family with the candidate kept; the non-commensurability mark fires ONLY when a deployment cannot supply one grader for all arms. No provider call.

- [ ] **Step 1: RED.** Three candidate configs, one configured grader → every arm graded by that identity, disclosed as fixed; run → FAIL. Paste.
- [ ] **Step 2: Implement** per the ticket; the projection printed before the approval gate reflects the new call count.
- [ ] **Step 3: GREEN.** `pnpm exec vitest run tests/unit/t15-eval-harness.test.ts` passed/total (assertions that pinned the complement ranking are updated citing V-S11-GRADER); boundary: one grader → fixed (admitted); zero graders → mark + refusal to project (rejected); `pnpm run typecheck`.
- [ ] **Step 4: Commit** as `fix(eval-harness): one fixed grader for every arm (W1, V-S11-GRADER)`.

### Task 15: W10 — a length failure says it was a length failure

**Files:**
- Read: `board/W10-call-budget-truthfulness.md`, `.hermes/reports/2026-09-01-algorithm-live-loop/audits/token-budget-reasoning.md`
- Modify: the provider response schema (`grep -rn 'finish_reason\|classifyStructuredContent' packages apps --include='*.ts'` — `finish_reason` appears nowhere today), `apps/runner/src/index.ts` `buildSchemaRepairPacket` (~:1250), the cost-row seeding for SYNTHESIZER and EVALUATOR (new sealed rows via T16's mechanism: migration numbered after the highest existing + `apps/runner/src/dev-deployment-register.ts` seeding; today they borrow COMPOSER/CONFORMANCE rows with `deadlineMs: 60_000`)
- Create: `tests/unit/w10-length-failure.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: (1) `finish_reason: "length"` → `LENGTH_EXCEEDED`, never `PARSE_FAILED`; (2) a truncation is not retried into the identical truncation; (3) sealed `SYNTHESIZER` and `EVALUATOR` cost rows with `deadlineMs ≥ 180_000` (no shorter than the judge's), `tokenCeiling` 2048 unchanged; missing rows fail loudly.

- [ ] **Step 1: RED (three tests).** Fake provider returns `finish_reason: "length"` with truncated content → expect `LENGTH_EXCEEDED`; a repair retry after a length failure must differ from attempt 1 in the bound or the input; a register without the SYNTHESIZER row fails loudly at startup. Run → all FAIL. Paste.
- [ ] **Step 2: Implement** the three charges.
- [ ] **Step 3: GREEN.** New tests pass; `pnpm exec vitest run tests/unit/t17-envelope.test.ts tests/integration/t17-envelope-ledger.test.ts tests/integration/t16-algorithm-register.test.ts tests/architecture/t16-algorithm-register-rows.test.ts tests/unit/t09-synthesis.test.ts` passed/total (the sealed 106 ceiling must still hold — prove it with the t17 tests); boundary assertions per rule; `pnpm run typecheck`.
- [ ] **Step 4: Commit** as `fix(runner): length failures are classified as such, truncation retries change the bound, synthesizer/evaluator get sealed cost rows (W10)`.

### Task 16: W6 — the acceptance fixtures stop serialising the environment (SECURITY)

**Files:**
- Modify: `acceptance/fake-claude-cli.mjs` (~:62) and `acceptance/fake-grok-cli.mjs` (~:12) — both serialise `process.env` in full (re-locate with `grep -n 'process.env' acceptance/fake-*.mjs`)
- Create: a fixture test beside the acceptance tests (follow the neighbours' location)

**Interfaces:**
- Consumes: nothing.
- Produces: fixtures echo ONLY explicitly named variables; a test that FAILS if a fixture serialises an unnamed variable.

- [ ] **Step 1: RED.** Run each fake CLI with an environment containing `W6_CANARY_SECRET=canary-9c1e` plus the variables the tests need; assert the emitted content lacks `canary-9c1e`; run → FAIL. Paste. **Never read, echo or reproduce a real credential value; redact in place and say so if one appears.**
- [ ] **Step 2: Implement** an explicit allow-list per fixture, derived from what the acceptance tests assert on (`grep -rn 'env\.' acceptance/*.test.ts | grep -i fake`).
- [ ] **Step 3: GREEN.** New test passes; `pnpm exec vitest run acceptance/dual-maker-proof.test.ts acceptance/runtime-policy.test.ts acceptance/adversarial-corpus.test.ts` passed/total; `pnpm run typecheck`.
- [ ] **Step 4: Commit** as `fix(acceptance): fixtures echo named variables only, never the environment (W6)`.

### Task 17: F-GROK-SANDBOX-PROFILE — an absent configured maker is LOUD, and the relay's sandbox argument works on this host

**Files:**
- Modify: `acceptance/grok-relay.ts` (`buildArguments` and the handshake failure surface only), `acceptance/run-acceptance.ts` (the ABSENT-probe print to stdout only — today `Promise.allSettled` at ~:173-200 records a rejected relay start as an ABSENT probe and prints nothing)
- Test: `acceptance/grok-relay.test.ts`, `acceptance/run-acceptance.test.ts`
- Read: `board/F-GROK-SANDBOX-PROFILE.md`, `agent-reports/closing-run-report.md:13`

**Interfaces:**
- Consumes: nothing.
- Produces: (1) a relay start rejection prints `MAKER ABSENT <maker> <failureCode>` (exact string asserted) to the ceremony's stdout before the debate starts; (2) the relay applies `--sandbox read-only` only when the host can apply it: a no-op handshake probe first; if the profile cannot be applied, start WITHOUT the flag and record a visible condition mark `SANDBOX-PROFILE-UNAVAILABLE` on the run — never silently drop protections, never silently drop the maker.

- [ ] **Step 1: RED (two tests).** A fake relay whose start rejects → the exact absence line on stdout; a fake grok binary rejecting `--sandbox read-only` with the closing run's error text (`could not apply the 'read-only' sandbox profile`) → the relay retries without the flag and the run records the mark. Run → FAIL. Paste. Do not invoke the real `grok` CLI.
- [ ] **Step 2: Implement** within the ticket's file contract.
- [ ] **Step 3: GREEN.** `pnpm exec vitest run acceptance/grok-relay.test.ts acceptance/run-acceptance.test.ts acceptance/runtime-policy.test.ts` passed/total; `pnpm run typecheck`; boundary: profile applies → flag kept, no mark (admitted); rejected → flag dropped, mark present (rejected boundary).
- [ ] **Step 4: Commit** as `fix(acceptance): an absent maker is printed loudly; the grok sandbox profile degrades with a mark instead of killing the maker (F-GROK-SANDBOX-PROFILE)`.

---

## Phase 3 — closure preparation (no live provider run in this plan)

### Task 18: Port the mission tools to this host and write the re-run readiness table

**Files:**
- Modify: `.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh` (hard-codes `R=/Users/stefan.nour/.../Debate/V5` and `$HOME/.local/bin/{claude,codex,grok}`) and the other 6 of 24 tool files carrying the laptop's absolute root (`grep -l 'stefan.nour' tools/*`)
- Create: `.hermes/reports/2026-09-01-algorithm-live-loop/packets/readiness-ask-2026-09-16.md`

**Interfaces:**
- Consumes: Task 17.
- Produces: every tool resolves the repo root with `git rev-parse --show-toplevel` (or an `R` env override) and binaries with `command -v`; `bash -n` passes on each; a credential-less dry run of `closing-run.sh` exits 2 with the usage line and touches nothing; the readiness table lists the eight `ACCEPTANCE_*` keys, the three binary keys with THIS host's paths (`claude`, `grok` in `~/.local/bin`; `codex` in `/opt/homebrew/bin`), the D18 credential rule (the operator mints and exports it), the Docker/grok sandbox situation after Task 17, and the exact command.

- [ ] **Step 1: RED.** `bash .hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh` without a credential → paste; `grep -c 'stefan.nour' tools/*.sh`.
- [ ] **Step 2: Implement** (shell only; every D60 capture-before-destroy and D18 behaviour byte-for-byte where it is not a path).
- [ ] **Step 3: GREEN.** `grep -c 'stefan.nour' tools/*.sh` → 0; `bash -n` each; the credential-less dry run exits 2; `tools/packet-lint.sh` passes on the new packet.
- [ ] **Step 4: Commit** as `chore(mission-tools): host-independent roots and binary discovery; readiness table for the 2026-09 re-run`.

### Task 19: Records — the continuation on the record, the board reconciled, the W12 audit drafted

**Files:**
- Modify (records-only, strict citation rule): `.hermes/reports/2026-09-01-algorithm-live-loop/{RESUME.md,PROGRESS.md,LEDGER.md,DECISIONS.md,V-DECISIONS-PACKET.md}`, `board/*.md` for tickets whose work demonstrably landed (F33, F34, F37 → done citing `PROGRESS.md:53`; F36 → done, superseded by F-T17T9-3 citing `PROGRESS.md:295`; W5-R1-B1 → done citing `PROGRESS.md:280`; the eleven `waiting_product_proof` rows → done citing the closing gate; plus every ticket Tasks 8–17 close)
- Create: `.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w12-closure-audit-2026-09-16.md`

**Interfaces:**
- Consumes: Tasks 1–18.
- Produces: a D73 entry (machine switch, the reconciled tip, the lockfile finding, Node 26.5.0 named fact, the gate measurement of record, "no push" restated); a PROGRESS log entry per landed task with SHAs; LEDGER rows per seat; the V packet's open rows re-presented with "default if silent" applied and marked as such, plus rows for what this continuation could not settle (the Grok re-run, the mono-maker run, δ/ε refit, T3B, the sandbox-degrade default); the W12 audit stating for each Global-DoD bullet what artifact proves it and what a re-run must still produce (status map §2.1 is the input).

- [ ] **Step 1:** Read the status map's §2 and §4 and every task report under the SDD workspace.
- [ ] **Step 2:** Write the entries; every board state change cites a PROGRESS/LEDGER line or a task report path; no ticket moves to `done` on inference (STRENGTH `entailed` only).
- [ ] **Step 3:** `tools/board-lint.sh` passes; `tools/packet-lint.sh` passes on the new packets.
- [ ] **Step 4: Commit** as `docs(mission): continuation of 2026-09-16 on the record — D73, ledger, board reconciled, W12 audit draft`.

---

## Self-review notes (orchestrator)

- Spec coverage: status map §9 items 1–10 map to: 1 → Task 19 + operator re-run; 2 → Task 19 (what a re-run must produce); 3 → Task 9 (full-suite gate at the new tip) + operator re-run; 4 → Task 17; 5 → Task 10; 6 → Tasks 11–16; 7 → Task 8; 8 → Task 9 (fresh attribution replaces the lost list); 9 → Task 19; 10 → Task 19 (V rows re-presented). The verifier's 22 merge-caused rows map to Tasks 3 (5), 4 (8), 5 (7 incl. dual-maker-proof), 6 (scaffold worsened row), 7 (2 re-regressions).
- Not in this plan by design: the acceptance ceremony re-run, the mono-maker run and the δ/ε refit (they need the operator's credential and go — D18/D72), T14b (unauthorized by T14a-G3), T3B (never authorized; re-presented in the V packet), the 13 `waiting_human` board tickets, the peer security hardening branch (130 commits, reported to the operator), the F31 obs-capture edge violations (V's accepted state, pinned by V's own test).
