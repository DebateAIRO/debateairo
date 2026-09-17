# The owner's rulings of 2026-09-18 (D77) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the three code changes V ruled on 2026-09-18 (mission `DECISIONS.md` D77): the adaptive-stopping thresholds refitted from the real run (δ 0.02 → 0.01, ε 0.01 → 0.005), the service credential taken off the command line, and the site's verdict vocabulary renamed to the engine's own three words.

**Architecture:** Three independent tasks on disjoint files, run by three seats AT THE SAME TIME in one worktree. Task 1 changes two sealed register rows and the ruling they cite. Task 2 moves the ceremony's credential from argv to the environment and refuses it on argv. Task 3 renames the UI's label mapping and makes the banner's copy true for the state it shows.

**Tech Stack:** TypeScript (ESM, strict), vitest, React (server-side render in tests), bash (the run tool), embedded PostgreSQL in the integration tests.

## Global Constraints

- Repository: worktree `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16`, engine root `dialectical-engine/` (run every command from there). Base commit `6e8c2c8f`, branch `mission/2026-09-16-algorithm-live-loop-continuation`. Never `cd` to the main checkout; never touch another worktree; plain, separate git commands (no `git -C`, no compound git lines, no `source`, no `bash -x`).
- **Two other seats are editing OTHER files in this same worktree while you work.** Stage by explicit path only (`git add <path> <path>`), never `git add .`, never `git add -A`, never `git commit -a`. Before every commit run `git status --short` and check that ONLY your files are staged. If `git` reports the index is locked, wait ten seconds and retry; never delete a lock file. A typecheck or test failure in a file outside your task's allowed list is another seat's work in progress: report it, never fix it, and re-run once before you conclude anything.
- Allowed writes are listed per task. A change outside your list is BLOCKED — report it, do not make it.
- Never run a real `claude`/`codex`/`grok`/`hermes` binary; never Docker; never the full test suite; never push; never read, print or log a credential; never start the acceptance ceremony.
- **V's rule (2026-09-17), verbatim:** "we should never put named paths in the code, only relative paths, since this code is run on multiple computers, so if we have something particular to a computer, it would break on the others. If it needs to be set to something local, it needs to be deduced first, never set in stones."
- Three-run law: every suite you cite is run three times at your final tip, passed/total per run. RED before GREEN, failing frames quoted. Both typechecks: `pnpm run typecheck` (blind to `acceptance/`) AND `pnpm exec tsc -p acceptance/tsconfig.json --noEmit`. A command that may exceed ten minutes is detached to a log.
- Pre-existing reds on this host (Node 26.5.0), never yours, never to be "fixed": `tests/architecture/s7-authorization-contract.test.ts:98` (5/6) and five cases of `tests/unit/v2ui-pages.test.ts`; the full list is `.hermes/reports/2026-09-01-algorithm-live-loop/closing-runs/four-count-4f83405f-failures.txt`.
- Per-assertion refutation: one mutant per new assertion, red at the site, restored; the matrix (property · mutant · suite · result · restored) in your report.
- Commit messages: conventional prefix; sign as the model you are (`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`).

---

### Task 1: The two adaptive-stopping thresholds, refitted (δ 0.01, ε 0.005)

**Files:**
- Modify: `packages/register/src/algorithm-policy.ts:14-27` (header comment), `:81-82` (ruling refs), `:246-247` (the two rows)
- Modify: whatever carries the sealed rows into a database that ALREADY holds them — measure first (`apps/runner/src/dev-deployment-register.ts:63` `DEVELOPMENT_REGISTER_VERSION = 5`, `:726` `seedDevelopmentDeploymentRegister`; `acceptance/main.ts:503,598` `ACCEPTANCE_REGISTER_VERSION`)
- Test: `tests/integration/t16-algorithm-register.test.ts:52` (`RULING_GOAL`), `:76-77` (the two expected rows), `:352` (`toMatchObject({ delta: 0.02, epsilon: 0.01 })`)
- Allowed writes: `packages/register/src/**`, `apps/runner/src/dev-deployment-register.ts`, `acceptance/main.ts` and `acceptance/runtime-policy.ts` ONLY if the version question below requires it, `tests/integration/t16-algorithm-register.test.ts`, and any other test that pins the SEALED DEFAULTS `0.02`/`0.01` (not the many tests that pass `epsilon: 0.01` as their own fixture input — those stay).

**Interfaces:**
- Consumes: `T16_GOAL_RULING_REF = "goal-v4-2026-09-01:80-96"` (`algorithm-policy.ts:81`), the row shape `{ rowKey, value: { kind: "GLOBAL_STOP_DELTA", delta }, sourceRef: ref(<ruling>) }` (`:246`), `readAdaptiveStoppingControls(pool, version)`.
- Produces: `export const T16_REFIT_RULING_REF = "algorithm-live-loop-DECISIONS.md#D77" as const;` and the two rows reading `delta: 0.01` / `epsilon: 0.005` with `sourceRef: ref(T16_REFIT_RULING_REF)`. Every other row keeps its value and its ruling ref.

**Outcomes:**

- O1. `globalStopDelta` = 0.01 and `branchFreezeEpsilon` = 0.005, each citing `T16_REFIT_RULING_REF` — a sealed row must name the ruling that actually chose its value (mission ruling J8: "a false ref is audit poison"). The header comment says the goal SEEDED 0.02/0.01 and D77 REFITTED them from the first real M≥2 run, and keeps the other values' provenance unchanged. No code constant for δ or ε appears anywhere outside the register rows (`grep -rn "0\.005\b" packages apps acceptance --include='*.ts' | grep -v '\.test\.'` shows only the row).
- O2. **The new values must reach the next real run on this host.** `acceptance/.pgdata` is a persistent embedded PostgreSQL directory that already holds tonight's sealed rows (δ 0.02, ε 0.01). Measure how sealed rows get there: what `seedDevelopmentDeploymentRegister` does when the version's rows already exist (insert-if-absent? refuse? overwrite?), whether the ceremony reads `ACCEPTANCE_REGISTER_VERSION` or `DEVELOPMENT_REGISTER_VERSION`, and whether sealed means immutable-per-version. Then do what the register's own design demands — if a sealed version is immutable, the refit is a NEW version (bump the constant(s), and prove the readers and the ceremony pick the new one); if the seed overwrites, prove that with a test. State in your report, in one paragraph, exactly what an operator with tonight's `acceptance/.pgdata` will get on the next run and why. Do NOT delete or modify `acceptance/.pgdata`, and do not start a PostgreSQL server on it.
- O3. Tests, RED first: the t16 expected rows carry the new values and the new ruling ref for exactly these two rows (the other rows' refs unchanged); `readAdaptiveStoppingControls` resolves `{ delta: 0.01, epsilon: 0.005 }`; if O2 needed a version bump, a test that seeds the OLD version's rows first and proves the new version's readers return the new values. Quote the RED frames.
- O4. Sweep: `grep -rn "0\.02\b" tests packages apps acceptance --include='*.ts'` and the same for `0\.01\b` — classify every hit as "sealed default pin" (update) or "a test's own fixture input" (leave), and list the classification in your report.
- O5. Gate at your final tip, three runs each: `tests/integration/t16-algorithm-register.test.ts`, `tests/unit/t07-adaptive-stopping.test.ts`, `acceptance/runtime-policy.test.ts`, `tests/integration/t17-envelope-ledger.test.ts`, `tests/unit/deployment-register-family-wiring.test.ts`; both typechecks.

- [ ] **Step 1: Read** `algorithm-policy.ts:1-110,236-260,354-420`, the t16 test's expected-rows block and its seeding test, `dev-deployment-register.ts:55-70,720-800`, `acceptance/main.ts:495-510,590-600`, `acceptance/runtime-policy.ts` (how the ceremony reads the rows).
- [ ] **Step 2: RED** — the O3 expectations against today's code; quote the failing frames.
- [ ] **Step 3: GREEN** — the two rows, the ref, the comment, and whatever O2 demands.
- [ ] **Step 4: Mutants** — value back to 0.02; value back to 0.01; ref back to the goal ref; (if bumped) version back — each red at its assertion, restored.
- [ ] **Step 5: Gate** — O5 and both typechecks.
- [ ] **Step 6: Commit** by explicit path in small conventional commits; report status, commits, a one-line test summary and concerns; the full account in the report file the dispatch names.

### Task 2: The service credential leaves the command line

**Files:**
- Modify: `acceptance/run-acceptance.ts:26-36` (the argument set), `:64-99` (`parseAcceptanceArguments`), and its caller in the same file (`:241` region)
- Modify: `acceptance/pro01-depth2-proof.ts`, `acceptance/panel01-depth1-proof.ts`, `acceptance/xrev01-depth1-proof.ts`, `acceptance/main.ts` — ONLY where they pass or document the credential on argv (measure with `grep -n "service-credential\|parseAcceptanceArguments" acceptance/*.ts`)
- Modify: `acceptance/README.md:229-234` (the run command) and any other README line that shows `--service-credential`
- Modify: `.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh:3,100,107`
- Test: `acceptance/run-acceptance.test.ts:7-56`
- Allowed writes: exactly the files above. `tests/architecture/s7-authorization-contract.test.ts` and `acceptance/ceremony.test.ts` are READ-ONLY (they must still pass; `ceremony.test.ts:369` hands `serviceCredential` to the ceremony as an object field, which is fine — that is not argv).

**Interfaces:**
- Consumes: today's `export function parseAcceptanceArguments(arguments_: readonly string[], now: Date = new Date()): AcceptanceArguments`, the codes `ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED` and `ACCEPTANCE_SERVICE_CREDENTIAL_INVALID`, the pattern `/^[A-Za-z0-9_-]{43}$/`, the environment key `ACCEPTANCE_SERVICE_CREDENTIAL` (already required by `tools/closing-run.sh:89` and already read by `acceptance/main.ts:766-767`).
- Produces: `export function parseAcceptanceArguments(arguments_: readonly string[], now: Date = new Date(), environment: NodeJS.ProcessEnv = process.env): AcceptanceArguments` — same return shape (`serviceCredential`, `ask`, `serve`); new typed refusal `ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED`.

**Outcomes:**

- O1. The credential is read from `environment.ACCEPTANCE_SERVICE_CREDENTIAL` and from nowhere else. Absent or blank → `ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED`; not 43 characters of `[A-Za-z0-9_-]` → `ACCEPTANCE_SERVICE_CREDENTIAL_INVALID` (both codes unchanged, so their readers keep working).
- O2. `--service-credential` anywhere on argv — with or without a value, first or last — is refused with `ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED`, checked BEFORE the unknown-argument and missing-value checks so the operator reads the specific reason, and the error message never contains the value that was offered. The old shape must not survive by habit.
- O3. `tools/closing-run.sh` no longer passes the credential as an argument; the child inherits the variable the operator exported. Its header line 3 and the echoed command line at `:100` show the new shape; the "credential: present in the environment (length N); never logged" line stays; `PREFLIGHT_ONLY=1` still exits 0 without reading the credential; `bash -n` passes. The script prints the Unicode arrow → only, never an ASCII `->`, and nothing in it is a measurement dressed as a command.
- O4. `acceptance/README.md` shows the new command (the variable exported in the operator's own shell, then the command with no credential argument) and says in one plain sentence why: a process's arguments are visible to every user of the machine through the process list for the whole run; its environment is not.
- O5. Tests, RED first: env credential accepted and returned; argv credential refused with the new code in all four positions (alone, with a value, before other arguments, after `--serve`); the refusal message does not contain the offered value; blank env → REQUIRED; 42 characters → INVALID; every existing case (defaults, unknown argument, retired ownership arguments, `--serve` anywhere, duplicated `--serve`) re-expressed with the environment as the third parameter and still asserting what it asserted. Quote the RED frames.
- O6. Sweep: `grep -rn "service-credential" . --include='*.ts' --include='*.sh' --include='*.md' | grep -v node_modules | grep -v '\.hermes/reports/.*/\(DECISIONS\|PROGRESS\|LEDGER\|RESUME\|V-DECISIONS-PACKET\|PLAIN-STATUS\)' | grep -v 'closing-runs/' | grep -v 'agent-reports/' | grep -v 'packets/'` — every remaining hit is the refusal itself, its test, or a sentence explaining the refusal. (Dated mission records and run logs are history and stay as written; `packets/readiness-ask-2026-09-16.md` is the orchestrator's to update.)
- O7. Gate at your final tip, three runs each: `acceptance/run-acceptance.test.ts`, `acceptance/dod-facts.test.ts`, `acceptance/ceremony.test.ts`, `tests/architecture/s7-authorization-contract.test.ts` (5/6 expected), `tests/unit/t15-eval-harness.test.ts`; both typechecks; `bash -n` on the tool; `PREFLIGHT_ONLY=1 bash .hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh` from the engine root, exit code quoted (it runs no model and reads no credential).

- [ ] **Step 1: Read** `run-acceptance.ts:20-100,230-250`, the test file's first describe block, the three proof files' argument handling, `closing-run.sh` whole, the README section.
- [ ] **Step 2: RED** — the O5 tests against today's parser; quote the failing frames.
- [ ] **Step 3: GREEN** — the parser, its callers, the tool, the README.
- [ ] **Step 4: Mutants** — argv refusal removed; refusal moved after the unknown-argument check; env read replaced by an argv read; the value interpolated into the message — each red at its assertion, restored.
- [ ] **Step 5: Gate** — O7.
- [ ] **Step 6: Commit** by explicit path in small conventional commits; report status, commits, a one-line test summary and concerns; the full account in the report file the dispatch names.

### Task 3: The site says what the code decided — supported, contested, unsupported

**Files:**
- Modify: `apps/ui/lib/v3/labels.ts:62-78` (`liveVerdictState` and its doc comment)
- Modify: `apps/ui/lib/types.ts:613` (`VerdictSummary.verdictState`) — NOT `:434` (`Synthesis.verdict_gate.state` is the older evidence gate, a different concept; it keeps `"endorsed" | "endorsed_with_caveat" | "suppressed_no_evidence"`, and `apps/ui/components/SynthesisPanel.tsx:27` keeps reading it)
- Modify: `apps/ui/components/VerdictBanner.tsx:35-60` (the branch keyed on `"suppressed_no_evidence"`)
- Test: `tests/unit/t11-verdict-label.test.ts:359-367`, `tests/render/t11-verdict-banner.test.tsx` (whole file)
- Allowed writes: exactly the files above, plus `apps/ui/app/globals.css` or the banner's stylesheet ONLY if a new line needs an existing class name (prefer reusing `verdictCaveat`).

**Interfaces:**
- Consumes: `Answer["verdict_state"]` = `"SUPPORTED" | "CONTESTED" | "UNSUPPORTED" | null`; the label ladder `deriveVerdictLabel` (`packages/serve/src/index.ts:1319-1381`), quoted here so your copy can be true: rung 0 → CONTESTED + mark `LABEL-BASIS-INCOMPLETE` when the margin or the disagreement is ABSENT; rung 1 → UNSUPPORTED when the winning strength < the low cut; rung 2 → CONTESTED when the margin ≤ γ or the panel disagreement ≥ its threshold; rung 3 → SUPPORTED when the winning strength ≥ the high cut (with a clear margin and low disagreement, since rung 2 did not fire); rung 4 → CONTESTED in the mid band. The cuts are sealed register rows; the UI never prints their numbers.
- Produces: `export type LiveVerdictState = "supported" | "contested" | "unsupported";` and `export function liveVerdictState(label: NonNullable<Answer["verdict_state"]>): LiveVerdictState` mapping SUPPORTED→`"supported"`, CONTESTED→`"contested"`, UNSUPPORTED→`"unsupported"`; `VerdictSummary.verdictState?: LiveVerdictState`.

**Outcomes:**

- O1. The mapping returns the engine's own three words, lower-cased, exhaustive over the label union (a fourth label still fails typecheck at the switch). The doc comment says the vocabulary was renamed on V's ruling D77 of 2026-09-18 (confirm-item 4: "rename now"), and drops the sentence that called renaming another lane's work.
- O2. **The false copy goes.** Today UNSUPPORTED renders "No evidence was available in this run, so no endorsed verdict is shown for this empirical claim…" plus "To unlock an endorsed verdict…". That sentence describes the older evidence gate, not the label: UNSUPPORTED means the winning position's propagated strength is below the low cut, whether or not evidence was looked up. The banner must not say it for `"unsupported"`. For each state the banner shows the claim language as it does today, sets a `data-verdict-state` attribute on the section, and — for `"contested"` and `"unsupported"` — one short plain sentence that is TRUE FOR EVERY RUNG that can produce that state (contested: rungs 0, 2 and 4; unsupported: rung 1). No number, no register key, no code name in the sentence. If `verdictState` is absent the banner renders exactly as it does today for a state-less summary.
- O3. `VerdictSummary.suppressionReason` and the `evidencePresence` field stay in the type (older data shapes carry them); only the banner's use of the retired state value goes. `SynthesisPanel.tsx` is untouched and its `"suppressed_no_evidence"` check still typechecks against `Synthesis["verdict_gate"]`.
- O4. Tests, RED first: the unit mapping asserts the three new words; the render test renders the REAL banner for each label and asserts (a) the claim language is shown for all three, (b) the retired sentences ("no endorsed verdict is shown", "To unlock an endorsed verdict") appear for none of them, (c) `data-verdict-state` carries the mapped word, (d) the contested and unsupported sentences are present for their state and absent for the other two, (e) three distinct states. Quote the RED frames.
- O5. Sweep: `grep -rn "endorsed_with_caveat\|suppressed_no_evidence\|\"endorsed\"" apps tests packages acceptance --include='*.ts' --include='*.tsx'` — every remaining hit belongs to the older evidence gate (`Synthesis.verdict_gate`, `SynthesisPanel`), and your report lists each with that classification.
- O6. Gate at your final tip, three runs each: `tests/unit/t11-verdict-label.test.ts`, `tests/render/t11-verdict-banner.test.tsx`, `tests/unit/v2ui-pages.test.ts` (five pre-existing reds, by name — the same five before and after), `tests/unit/v2ui-data-layer.test.ts`; both typechecks.

- [ ] **Step 1: Read** `labels.ts:1-80`, `types.ts:425-440,595-630`, `VerdictBanner.tsx` whole, `SynthesisPanel.tsx:1-40`, both test files, and `packages/serve/src/index.ts:1282-1381` (the ladder).
- [ ] **Step 2: RED** — the O4 tests against today's mapping and banner; quote the failing frames.
- [ ] **Step 3: GREEN** — the type, the mapping, the banner.
- [ ] **Step 4: Mutants** — UNSUPPORTED mapped back to the retired word; the retired sentence restored for unsupported; the contested sentence shown for supported; `data-verdict-state` removed — each red at its assertion, restored.
- [ ] **Step 5: Gate** — O6.
- [ ] **Step 6: Commit** by explicit path in small conventional commits; report status, commits, a one-line test summary and concerns; the full account in the report file the dispatch names.
