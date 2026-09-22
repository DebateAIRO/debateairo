# FixAgent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task also binds the DebateAI heartbeat contracts (`heartbeat-protocol` → `heartbeat-worker` / `heartbeat-reviewer`): RED before GREEN, three-run clusters, refutation duty, `SKILLS LOADED` handoff, self-report before handoff.

**Written:** 2026-09-02 by the Fable 5.1 orchestrator from the frozen requirements (`requirements/fixagent.md`, dev @ 8d38185c), the sixteen frozen slice SPECs (committed at `3503dcf8`), the landed-state audit (`requirements/fixagent-state-audit.md`, measured at `4f764037`), and a read-only re-verification on `dev @ 2b670d30` that the obs-surface diff `4f764037..2b670d30` is EMPTY (every audit claim still holds).
**Plan owner:** the orchestrator (sole writer). **Done on any slice:** V personally runs its SPEC §5 steps and vetoes it done.

**Goal:** Turn the predecessor's capture package into a working loop — every thrown error on every product surface becomes one queryable row with its root cause and real ids, a daemon folds rows into incidents, traces each to a root, files one ticket per incident, and (after V's approval, never before) presents a RED→GREEN fix branch that waits for V to merge. Nothing merges by itself until V flips `quick_arm`.

**Architecture:** Capture (G1) = the landed `packages/obs-capture` plus a new `src/runtime/**` (queue, flusher, spool drain, exit sink) bound into the scheduler, runner, API, provider gateway and browser surfaces, writing as `debateai_obs_writer` into the LIVE `obs.*` schema (migration 0034). Listener (G2) = a new `tools/obs-listener/**` tree: a policy bundle with a single custodian, a deterministic LLM-free daemon (`debateai_obs_listener`) with a watchdog (`debateai_obs_watchdog`), both under launchd, `obsctl` as the one switch. Dispatch (G3/G4) = a Codex CLI diagnosis worker (fresh session per incident, relay-only) producing a hashed FixProposal that WAITS for `obsctl approve`; then a sandboxed fix worker produces a patch, the daemon proves RED→GREEN in an isolated worktree and presents a local branch `fixagent/<hash>`. QUICK auto-merge (G5) exists only behind the bundle slot `quick_arm = OFF`. Hatchet failed-run ingest is gated on SPIKE-D1. The FixAgent consumes error-shaped input only; stalls, blind periods and infrastructure belong to the ObservationAgent.

**Tech Stack:** TypeScript (ESM), node v22.23.1, pnpm 11, vitest; `pg` driver (never `@debateai/db` from the runtime); PostgreSQL 16 in `debateai-v3-postgres-1` (127.0.0.1:55432), roles `debateai_obs_{writer,listener,watchdog,human,view_owner}` (LIVE); launchd; Hermes Kanban CLI (`~/.local/bin/hermes kanban --board <slug> …`); Codex CLI relay (`acceptance/relay-core.ts` precedent); `psql` only via `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "…"` (not on PATH).

**Spec (the plan argues from these; executors read both):**
- Requirements: `docs/missions/observability-agents/requirements/fixagent.md` (Q1 STANDS/CHANGES table, Q2 IF-1..IF-10, Q5 gates G1–G6, Q6 custodian acts, Q7 F-1..F-15, ranked recommendations)
- Compass: `docs/missions/observability-agents/requirements/fixagent-compass-block.md`
- Per-slice FROZEN specs: `docs/missions/observability-agents/slices/FIX-{01..16}/SPEC.md` (with unfilled `PLAN.md` scaffolds — this plan fills them; `DECISIONS.md`, `PROGRESS.md`)
- Landed-state audit: `docs/missions/observability-agents/requirements/fixagent-state-audit.md` (§A board receipts, §B suites, §C gates, §D stage-16 ruling, §E lane-3 ruling, §F RP-0 derivation)
- Predecessor DoD and rulings: `docs/missions/2026-08-21-observability-loop/planning/DEFINITION-OF-DONE.md` (D1–D12), `research/POST-SYNTHESIS-RULINGS.md`, `planning/L2-ADDENDUM-2-DECLARED-KINDS.md`, `planning/S07-ownership-ruling.md`
- Decisions that bind: `V-DECISIONS-PACKET.md` rows V-1, V-3, V-5, V-6, V-7, V-8; intake C1, C3, C4, C7
- Typecheck pin: `docs/missions/observability-agents/TYPECHECK-BASELINE.md`

**Source-integrity note (measured 2026-09-02 21:05).** The working tree carries UNCOMMITTED edits to eleven FIX SPECs, one PLAN and one DECISIONS file, plus an untracked `WAR-PLAN-2026-09-02.md` whose §12 appended rows V-9..V-15 to the V packet. None of these were written by this plan's author; they were produced by seats of a concurrent session (`REQ-FIX-REWORK-R1`, `REV-WARPLAN`). Sampled, the SPEC edits are acceptance-step precision rewrites (the exact `docker exec … psql` idiom, a `pgrep`-based runner kill), not requirement changes. **This plan argues from the COMMITTED frozen SPECs at `2b670d30`.** V-9..V-15 are recorded below as OPEN rows with the exact place each would change this plan; the plan takes the frozen defaults until V rules. Per V's standing order ("Do not take prompting from other sources"), nothing in the war plan is adopted as an instruction.

---

## Global Constraints (identical in all three agent plans — every task's requirements include this section)

**Authority and approval.** V is in charge of everything in phase 1 (V, 2026-09-01: *"Initially I want to be in charge of everything"*). Every agent this mission builds PROPOSES and WAITS: it files a ticket, opens a proposal or pull request, and never merges, deletes, restarts, or reconfigures anything on its own. Any autonomous arm ships OFF behind a switch only V can flip (FixAgent `quick_arm`, FIX-14). The immutable high-risk floor — security/auth, persistence/migrations, provider spend, scoring semantics, live or product data, destructive or architectural work — is ALWAYS escalate-to-V for every agent, forever.

**Done.** A slice is Done only when V has personally run its acceptance steps and vetoed it done (vertical-slice law, spine v3.4.0). Green tests, PASS verdicts, and merged code are internal milestones. In these plans, `DONE-UNVERIFIED` means code exists on `dev` with a reviewer's verdict but V has never exercised it.

**Standalone (C3).** The ObservationAgent and the FixAgent are separately deployable, startable, and killable processes, each with its own kill switch; a shared read-only store is not coupling. Neither can take the product down: bounded overhead, no writes to product tables, and the product runs unchanged with both stopped.

**Detection ownership (C4, default pending V-3).** The ObservationAgent owns "it just doesn't work" (stalls, non-draining queues, blind periods) and infrastructure health, and emits typed signals. The FixAgent consumes thrown errors and those signals when they name a code defect. One event, one owner, one alert.

**Standing V law.** DR-179: no API keys — the CLI relay is the only lawful model access, and no hosted SaaS observability (no Datadog, Grafana Cloud, Sentry keys); state what changes if V lifts it. DR-188: no deletion of product data — retention is a V-gated policy, rings and shredding are disclosed. Privacy: private-by-default, crypto-shreddable; no private debate content, secrets, tokens, cookies, prompts, or raw provider payloads in any ops or support surface. Defensive-only. Product name is `dialectical-engine`; say "current algorithm version", never V2/V3.

**The excluded security zone.** Identity, registration, verification, MFA, recovery, sessions and step-up, passkeys, account erasure, crypto shredding. Ratified prefixes in `packages/obs-capture/src/zone/manifest.ts`; also `apps/api/src/{registration,mfa,recovery,mail-channel,sessions,account-erasure,legacy-claim}.ts`, `packages/crypto/**`, `packages/db/src/identity.ts`, migrations `0030–0033` and `0038–0049`, and the sign-in/sign-up/MFA/verify-email/settings flows in `apps/ui`. No agent instruments, reads, stats, imports, or proposes changes inside it. The SupportAgent is structurally incapable of reaching it. When in doubt, it is in the zone.

**Verification law (every task).** RED before GREEN, on every rework round. Every cluster verification command runs THREE times and the WORST run is the verdict (green-green-red is RED). A command that crashes is BROKEN, not RED. Refutation duty: for every assertion, build the mutant it exists to catch, show RED, revert, show GREEN, and one neighbouring mutant it must NOT catch. Suites are reported as `passed/total` with every failure named and dated as pre-existing or new. `pnpm audit:source` runs for any change under `packages/**` and its `blocking` array is quoted verbatim.

**The typecheck baseline is RED and it is not ours.** Pinned in `docs/missions/observability-agents/TYPECHECK-BASELINE.md` (measured 2026-09-02 in a clean worktree at `3503dcf8`): `pnpm generate:contract` exit 0; `pnpm typecheck` exit 1 with **8** diagnostics, all in `tests/unit/s14-ui.test.ts`, **0** in observability paths, caused by `web/` being removed while that test still imports it (owner: ui-overhaul, ticket `t_1acc97c0`, V row V-8). **Every gate asserts the DELTA — no diagnostic outside the pin — never "typecheck is green."** Nobody repairs a pinned diagnostic. Six other tests are pre-existing red on `dev` (S06 runner-binding ×4, S04 zone ×2; suites 133/139 ×3); the FixAgent tasks that own them say so.

**Worktrees and merges.** One git worktree per slice (`logs/prep-slice-worktree.sh <SLICE>` — never symlink `node_modules`); fleets work inside it; multiple slices run at once. Merge into `dev` only on V's veto; conflicts are managed at merge time, never a reason to serialize. Push only after V tests the whole local merge. Mechanical guard after every lane merge: `git diff <merge>^2 <merge> -- <lane-owned files>` must be empty (the S06 half-merge, finding B1, is what happens without it).

**Write as you go.** Artifacts to disk the moment they are ready; self-reports early; a handoff that exists only in a seat's final message does not exist (six seats were killed by provider session limits in this mission; the three that wrote incrementally lost nothing).

**Status legend used in every task:** `NOT STARTED` · `PARTIAL` (some surface exists, named) · `DONE-UNVERIFIED` (on `dev` with a verdict; V has not run it) · `GATED` (waits on a named V row or custodian act) · `RED ON DEV` (exists and fails, with the test markers).

**FixAgent-specific constraints (verbatim from the 13 DECISIONS seeds present in all 16 slices):** approval-first everywhere (C1) · standalone = process-level (C3) · error-shaped input only (C4) · fresh slice tickets on board `observability-agents`, citing absorbed S-tickets (C7) · Done = V personally runs SPEC §5 and vetoes; a green suite is only a worker milestone · no user-linked identifiers ever (R-E4) · no free text anywhere in `obs.*` (Batch-3 row 6) · ONE custodian, V (E6-02 amended) · no filesystem metadata on zone files (Batch-8) · CLI relay only for any model (DR-179 + OBS-R090) · no deletion/pruning of obs data (DR-188) · the `fix<NN>-*` test partition · banned words in any step or criterion: improve, better, robust, handle, appropriate.

---

## What already exists — measured, not remembered (`dev @ 2b670d30`)

**The FixAgent exists as a capture library with nowhere to write and no reader.** `obs.*` has 15 tables, 5 roles, 0 rows in every table (LIVE on the dev Postgres per REQ-FIX's read-only probe; the audit did not probe SQL — recorded UNVERIFIED-by-audit). Not one product process persists an error today.

| Predecessor slice | Where on dev | Status | Absorbed by | Verified by |
|---|---|---|---|---|
| S01 foundation (migration 0034, `packages/db/src/obs-schema.ts`) | `68295991` via merge `3e91cf42`; V-ACCEPTED 2026-08-22 | **DONE** (the only V-accepted slice) | — | `tests/integration/obs-l1-s01-foundation.test.ts` green ×3 |
| S02 registry + exhaustive-1 | `7a3ff398`, `5f0bd546` (**merged unreviewed — V-7**) | **DONE-UNVERIFIED** (no review verdict) | no FIX slice may edit `src/registry/**`; V-7 (c) attaches it to the S02 addendum | `tests/unit/obs-l2-s02-registry.test.ts` green ×3 |
| S03a/S03b core (emit, queue, flusher, redactor, spool, health, context) | `7a3ff398` + `7afdbe5d` | **DONE** as a library; the production queue is `{ offer: () => false }` (drop-everything) until FIX-01 | FIX-01 | `tests/unit/obs-l2-s03b-core.test.ts` green ×3 |
| S04 zone manifest + classifier | `7a3ff398` | **DONE**; its ZI-2 pin is **RED ON DEV** (finding B2: `BASE_REF = 29f370e…` frozen while `0cec59ef` rewrote the mount lines; shape intact, no breach) | FIX-04 / FIX-06 depend on `resolveZoneRouteMountRegion()` | `tests/unit/obs-l2-s04-zone.test.ts` 2 red ×3 |
| S05 installers (`install/{api,runner,scheduler,ui-client,evaluator-lib}.ts`) | `7a3ff398` + fixes `14965fc1`, `caac4d94`, `01422e29`, `367591e` | **DONE**; the three product installers are the 3 `audit:source` blocking rows (V-6); `install/runner.ts:192-197` already `import("@debateai/obs-capture/runtime")` and swallows the failure | FIX-01 creates the target | `tests/architecture/obs-l2-s05-*.test.ts` green ×3 |
| S05b runtime wiring (`src/runtime/**`) | ABSENT | **NOT STARTED** — "the mission's central defect: the product stores nothing" | **FIX-01** (then FIX-07) | — |
| S06 runner binding | **half-merged** at `1c9578a2`: `apps/runner/src/main.ts:1` imports the installer (the only product file referencing obs-capture); the `task-catch`/`gateway-seam` hunks of `apps/runner/src/index.ts` were DROPPED at merge; the 432-line test merged verbatim | **PARTIAL + RED ON DEV** (B1: `obs-l3-s06-runner-binding.test.ts` 4 failed / 1 passed ×3); the lane carried a three-lens BLOCK never reworked | **FIX-03** re-cuts, never merges `e8d99d33` | `tests/integration/obs-l3-s06-runner-binding.test.ts` |
| S07 cause chain | ABSENT (`TypedDomainError` still 2-arg at `packages/kernel/src/index.ts:283-288`; `typedPoolFailure` still interpolates) | **NOT STARTED** | **FIX-02** (+ FIX-03 for `buildSchemaRepairPacket`) | — |
| S08 API binding | ABSENT (`apps/api/src/main.ts` has no installer import; `setErrorHandler` at `:439-491` returns a code on 500 but records nothing, no correlation id) | **NOT STARTED** (OBS-R053 partial) | **FIX-04** | — |
| S09 client seam, S15 README | ABSENT (`error.tsx`, `global-error.tsx`, `apps/ui/lib/obs/`, `obs-client-report.ts` all absent; `ScoringErrorBoundary.tsx` exists to rewire) | **NOT STARTED**, dispatch HELD (F-7) | **FIX-06** | — |
| S10 scheduler binding | ABSENT (`apps/scheduler/src/cli.ts` 24 lines, no obs import) | **NOT STARTED** | **FIX-01** | — |
| S11 provider binding | ABSENT (`packages/providers/src/index.ts` uninstrumented; throws at `:485`, `:493`) | **NOT STARTED**; Done waits on **RP-0** | **FIX-05** | — |
| S12 CI inventory gate | ABSENT (`tools/obs-inventory/`) | **NOT STARTED** | **FIX-16** | — |
| S13 build repoint | root `build` repoints; `web/` deleted by `3e7d83e9` | **DONE** (no work); side effect: the red typecheck (V-8) | — | — |
| S16 acceptance harness | ABSENT (`acceptance/obs/`) | **NOT STARTED** | **FIX-08** | — |
| S17/S18/S21/S25 listener, S19 tracer, S22 obsctl, S23 notify, S24 hatchet, S27/S18b/S28/S29/S30 | ABSENT (`tools/obs-listener/` in its entirety) | **NOT STARTED** | FIX-09..15 | — |
| D12 demo `demo/observability-demo.sh` | `2d1f86b8`; runs **6 PASSED / 1 FAILED / 21 SKIPPED, exit 1** (regressed from 7/0/21) | **RED ON DEV**; the FAIL is stage 16, ruled a demo-rule defect (N4); no FIX slice edits it | custodian act (t_40c2cc1b) | `logs/d12-demo-2026-09-01.log` |

**Gates on dev (pinned):** `pnpm generate:contract` exit 0 · `pnpm typecheck` exit 1, 8 diagnostics all in `tests/unit/s14-ui.test.ts`, **0 in obs paths** (every slice asserts a DELTA) · `pnpm audit:source` exit 1, `blocking` length 3 (the three installers; V-6) · `pnpm lint`/`pnpm build` red for those two reasons · collected obs suite 133/139 on three identical runs (6 red = S06 ×4 + S04 ×2).

**Custodian acts still open (none is engineering; each shapes a slice):** RP-0 `t_4deda7ab` — V posts the `declared_gap` hash over the nine names (AUDIT-STATE's derivation: `51bbfb0ac34432bad573bcd13d0d02ef3033e177cc8a302ba149d6d88191f078`, count 9; if V's differs, STOP) · V-6 `t_d821f99e` (`audit:source` exemption, recommendation A) · stage-16 demo rule (`observability-demo.sh:779` exempts the manifest — `t_40c2cc1b`) · B2 architecture ruling (what `baseRef` means after a lane merges) · RP-1 (manifest re-pin), RP-2 `t_fbefa222` (hatchet_ingest), RP-3 (an untracked controller candidate exists: schema/version `debateai.fixagent-rp3-injection-corpus.v1`, 24 cases, SHA-256 `8f2733e2ee202b7f1533cfd068063d1b5bf3ca52feb566def000e3a6987d113e`; it is not landed or V-pinned) · SPIKE-D1 (half-day read-only) · G4 entry acts (branch protection, bot identity, ruleset hash — remote form only) · ticket ids for S27, S18b, S23, S24 (U-F2).

## Validation readiness (probed 2026-09-02)

Postgres `debateai-v3-postgres-1` UP (healthy) · Hatchet `debateai-v3-hatchet-lite-1` UP (8888 → 200) · the https dev stack on `:3000` is **DOWN** → FIX-03/04/05/06 acceptance begins with `pnpm dev:auth:up`; FIX-01/02/07/08/09/10/11/16 acceptance runs with the stack DOWN (by design: F-3) · `psql` is not on PATH (every step uses `docker exec`) · `launchctl list` shows no product jobs (FIX-09's plists are the first) · the D12 demo needs `OBS_DEMO_DATABASE_URL` set to turn stage 02 PASSED with no code (ranked recommendation 10) · the QA identity in `.local/dev-auth/qa-account-*.json` is V's file · the writer role password is a **one-time V act** (`ALTER ROLE debateai_obs_writer PASSWORD 'dev-only-writer'`, FIX-01 step 2; no seat does this).

## Decisions this plan takes as defaults (each revisable by V; each task names its row)

| Row | Default taken | Where it bites |
|---|---|---|
| V-1 approval-first | CONFIRMED default: trace → ticket → propose → WAIT | FIX-09 (size labels only), FIX-12, FIX-13 |
| V-3 stall ownership | ObservationAgent owns stalls/blind periods; FixAgent consumes thrown errors + detector rows naming a code location | FIX-09 (no detectors), IF-2 |
| V-5 RP-0 | UNRATIFIED; unregistered codes land as `OBS_CAPTURE_SELF`, `fallback_minimized=true`, recorded per step | FIX-01..04 honesty; **FIX-05 Done blocked** |
| V-6 audit:source | option (A) recommended; until ruled `pnpm lint` is not a Done criterion; each handoff pastes `blocking` verbatim | FIX-01 (+2 rows), FIX-09..15 |
| V-7 unreviewed `5f0bd546` | option (c): attaches to the S02 addendum (gated on RP-0); no FIX slice edits the registry | none directly |
| V-8 typecheck red | option (a): coders start; assert DELTA vs the 8-diagnostic pin | every task |
| F-1 detector transport | (a) `obs.occurrence` rows with `capture_point='detector'` — **contradicted by the ObservationAgent's frozen D1 (view, never writes obs.occurrence)**; see V-13 | FIX-09 intake filter |
| F-2 board | dedicated board `fixagent`, one ticket per incident | FIX-11 |
| F-3 first surface | scheduler one-shot CLI | FIX-01 |
| F-4 QUICK switch | bundle slot `quick_arm`, re-pinned by V alone | FIX-09 (born OFF), FIX-14 |
| F-5 tiers | keep three as SIZE LABELS; all non-ESCALATE approval-first | FIX-09 |
| F-6 fix worker model | Codex CLI relay now; adapter seam | FIX-12, FIX-13 |
| F-7 FIX-06 dispatch | (a) hold — **premise changed**: the 111 uncommitted entries were committed as `3e7d83e9`; ui-overhaul remains active on `apps/ui/**`; still V's to rule | FIX-06 |
| F-8 liveness | own watchdog + ObservationAgent observes it as a process | FIX-09 |
| F-9 demo custody | a non-implementer seat revises the demo per gate | G1/G2 gate tasks |
| F-10 Hatchet | run failures → FIX-15; infra health → ObservationAgent | FIX-15 |
| F-11 seeds | every number a labelled seed ratified at the slice's acceptance | every numeric seed below |
| F-12 zone root | terminal `ZONE_BOUNDARY`, no root named | FIX-11 |
| F-13 notification | osascript + ticket comment; sendmail optional | FIX-12 |
| F-14 "pull request" | (a) LOCAL branch `fixagent/<hash>` + template on the ticket; no push | FIX-13 — **V-9 proposes (b)** |
| F-15 event kinds | prune to the 7 producible | FIX-01 lifecycle wrapper |
| **V-9 (observed, unruled)** push authority for `refs/heads/fixagent/*` | NOT adopted; frozen (a) stands | would add a push step + ruleset drill to FIX-13 C4 and make the G4 entry acts mandatory |
| **V-10 (observed, unruled)** merge PR #8 first | NOT adopted; noted as a rebase risk for FIX-03/04 anchors | if merged, FIX-03/04 re-measure their anchors before dispatch |
| **V-11 (observed, unruled)** code-first, PR as the approval object | NOT adopted; frozen approve-first stands (V-1 CONFIRM) | would collapse FIX-12's wait into FIX-13 and remove `obsctl approve` from the path |
| **V-12 (observed, unruled)** Foundry per-worktree embedded-postgres | NOT adopted; FIX-13 R05 already requires an isolated worktree at a pinned base, and the repo's `tests/support/testDatabase.ts` (34 callers) is the existing embedded-postgres seam | would become a new slice (FIX-17) — not planned here |
| **V-13 (observed, unruled)** IF-2 transport | (c) is consistent with this plan: FIX-09 consumes thrown errors in this campaign; the detector-row filter is coded but has no producer until V rules | FIX-09 C2 |
| **V-14 (observed, unruled)** `.fixagent/ALERTS.md` | NOT adopted; F-13's channels stand | would add a channel to FIX-12 R05 |
| **V-15 (observed, unruled)** first fault | (a) = FIX-01's scheduler job — identical to F-3 | none |

## Milestones, gates and parallelism

```
Task 0  Custodian acts + ARCH questions (V, orchestrator, research seats) — most run in parallel with FIX-01
G1 CAPTURE   FIX-04 waits on `VNOW-02` and its admitted immutable base · FIX-08 C3/C4 waits on `VNOW-03`, reviewed successor authority, and recorded composition prerequisites
             FIX-06 waits on FIX-04 MERGE and a V ruling on F-7
             G1 gate: V's steps per slice; demo stages 02..17 turn PASSED; stage 16 PASSED after the custodian's demo edit
G2 LISTENER  FIX-10 waits on `VNOW-04` and `VNOW-05` plus reviewed successor C0 authority · FIX-11 remains successor/V-board gated · FIX-15 only if SPIKE-D1 passes and RP-2 is set
G3 DISPATCH  FIX-12 after FIX-09 and FIX-10 MERGE (it edits their reserved regions); acceptance step 7 PENDING RP-3
G4 FIXES     FIX-13 after FIX-12 merges + G4 entry acts (local form needs none)
G5 QUICK     FIX-14 — NOT DISPATCHED in phase 1; frozen; dispatched alone after V flips quick_arm and (a)–(g) hold
G6 steady    quarterly drills
```

**Hard serialization (single-writer file collisions, not fear):** FIX-01 ⊥ FIX-07 (`src/runtime/**`) · FIX-04 ⊥ FIX-06 (`apps/api/src/index.ts`) · FIX-09 ⊥ FIX-12 (daemon `dispatch-arm` region) · FIX-10 ⊥ FIX-12 (`obsctl` approve/deny/reveal-drift regions) · FIX-12 → FIX-13 → FIX-14 strictly sequential · FIX-09 declares the tracer hook interface FIX-11 implements (ARCH freezes the interface in FIX-09 C1 before FIX-11 C2 starts).

## File structure — ownership map (locked; a slice touching another's region is a finding)

```
packages/obs-capture/src/runtime/{index,sink,drain,config}.ts        FIX-01, then FIX-07 (single writer, sequential)
packages/obs-capture/src/kinds.ts · src/redactor.ts[declared-kind-projection]   FIX-03 only
packages/obs-capture/src/health.ts (DISABLED class only)             FIX-07
packages/obs-capture/src/{index,emit,queue,flusher,spool,context}.ts · install/*.ts · src/registry/** · src/zone/**   READ-ONLY to every slice
packages/kernel/src/index.ts[error-class] · packages/db/src/index.ts[wrapper]   FIX-02 (obs-reexport + identity block forbidden)
apps/scheduler/src/cli.ts (whole file)                               FIX-01
apps/runner/src/index.ts[task-catch, gateway-seam, buildSchemaRepairPacket] · apps/runner/src/main.ts (context seeding only)   FIX-03
apps/api/src/index.ts[error-boundary, obs-context-hook] · apps/api/src/main.ts first import   FIX-04
apps/api/src/index.ts[obs-client-report-mount] · apps/api/src/obs-client-report.ts · apps/ui/app/{error,global-error}.tsx · apps/ui/lib/obs/** · apps/ui/components/ScoringErrorBoundary.tsx · apps/ui/lib/observability/README.md   FIX-06
apps/api/src/index.ts  zone-route-mount region `if (options.registration !== undefined) {…}`   NOBODY — byte-frozen
packages/providers/src/index.ts (whole file)                         FIX-05
acceptance/obs/** · acceptance/run-acceptance.ts (one line)          FIX-08
tools/obs-listener/policy/** · src/daemon/** (minus dispatch-arm) · src/watchdog/** · launchd/** · README.md   FIX-09
tools/obs-listener/src/obsctl/**[status, kill, arm]                  FIX-10
tools/obs-listener/src/trace/** · src/board/** · escalations/README.md   FIX-11
tools/obs-listener/src/worker-diagnosis/** · src/notify/** · src/daemon/**[dispatch-arm] · src/obsctl/**[approve, deny, reveal-drift]   FIX-12
tools/obs-listener/src/worker-fix/** · src/landing/** · sandbox/** · catalog/** (V authors entries)   FIX-13 (+ FIX-14 additive QUICK/canary regions; policy slot quick_arm consumers)
tools/obs-listener/src/ingest-hatchet/**                             FIX-15
tools/obs-inventory/** · root package.json[lint-wiring + audit:obs-inventory script]   FIX-16 (build line forbidden)
tests/{unit,integration,architecture,render}/fix<NN>-*.test.ts(x)    per slice; the landed obs-l* files keep their names; only FIX-03 may amend obs-l3-s06-runner-binding.test.ts
tests/support/zone-boundary.ts                                       READ-ONLY shared fixture
docs/missions/2026-08-21-observability-loop/demo/**                  NO FIX slice (custodian t_40c2cc1b)
tools/orphan-audit/** · migrations/** (0034 live; 0035 reserved, NOT claimed)   floor-deny / forbidden
```

---

### Task 0: Custodian acts, open ARCH questions, and the board — nothing here is code

**Status: PARTIAL; V acts remain open.** The RP-0, writer-grant, OFF-switch, tracer, B2, RP-3, and board packets are written and have passed fresh Sol review after rework. No board or production state was changed. RP-0/RP-3 pinning, the board acts, and every concrete V attestation still require V.

**Definition of done (VAL assertions):**

```
# VAL-FIX-00-001: RP-0 is ratified by V's own hand, or every code-reading step says UNVERIFIED
Surface: artifact
Needs: none
Behavior: V posts the declared_gap hash + count (9) as a comment on t_4deda7ab computed by `printf '%s\n' <nine names> | LC_ALL=C sort -u | shasum -a 256`; it equals 51bbfb0ac34432bad573bcd13d0d02ef3033e177cc8a302ba149d6d88191f078 or the mission STOPS on the disagreement; until posted, every FIX-01..05 acceptance step that reads `code` records the observed value and the literal `UNVERIFIED — RP-0 unratified`
Evidence: the ticket comment (author V) and the hash; or the marker in each slice's PROGRESS.md

# VAL-FIX-00-002: The four architecture questions are answered in the slice DECISIONS before the slice is architected
Surface: artifact
Needs: none
Behavior: (i) the 0-byte dead-pid spool-file rule (FIX-01) is stated as one sentence plus the test that asserts it; (ii) the capture OFF switch location — file or register row — with its exact path (FIX-07); (iii) whether debateai_obs_writer holds UPDATE on obs.component_health, measured from migration 0034's grant block and `information_schema.role_table_grants`, or the append-only alternative (FIX-07 R01); (iv) how the tracer reaches chain codes while debateai_obs_listener is denied occurrence_detail — parent_occurrence_ref walk or a listener-readable projection — grants unchanged (FIX-09/11, IF-1's last clause)
Evidence: four DECISIONS.md lines with source path:line each

# VAL-FIX-00-003: The two cross-mission reds have an owner and a ruling, not a workaround
Surface: artifact
Needs: none
Behavior: B2 — an architecture ruling on what `BASE_REF` in tests/unit/obs-l2-s04-zone.test.ts:33 means once a lane is merged (ticket t_d1e18a14), so FIX-04-R05 and FIX-06-R04 can assert ZI-2 green; N4 — the demo custodian (t_40c2cc1b) applies audit §D's `case` exemption before observability-demo.sh:779 and re-runs the demo; stage 16 PASS is measured, not predicted
Evidence: the ruling text; the demo log showing stage 16 PASSED

# VAL-FIX-00-004: Board shape matches the vertical-slice law and the audit's reconciliation
Surface: artifact
Needs: none
Behavior: one slice ticket per FIX-01..16 on `observability-agents` citing absorbed S-tickets (C7); the §A recommended moves applied (t_489ecbcc, t_9b5ca941, t_6e99d607 → done; others as listed); ticket ids minted for S27, S18b, S23, S24 before FIX-12/15 tickets exist; the `fixagent` board created by V (F-2)
Evidence: `hermes kanban --board observability-agents list` output; `hermes kanban --board fixagent stats`

# VAL-FIX-00-005: Custodian slots that are unset stay explicitly UNSET, never guessed
Surface: artifact
Needs: none
Behavior: RP-1 (manifest hash — recompute from packages/obs-capture/src/zone/manifest.ts, compare to S04 #12's 18d53b6c…), RP-2 (t_fbefa222), RP-3 (an untracked controller candidate exists with schema/version `debateai.fixagent-rp3-injection-corpus.v1`, 24 cases, and SHA-256 `8f2733e2ee202b7f1533cfd068063d1b5bf3ca52feb566def000e3a6987d113e`; it is not landed or V-pinned, so acceptance remains `PENDING RP-3` under `VLATER-RP3`), SPIKE-D1 (not run), G4 entry acts (not performed); each carries its gate id in FIX-09's bundle and in the affected slice's PROGRESS.md
Evidence: the bundle's slot values; PROGRESS.md lines
```

**Acceptance criteria for V:** open `t_4deda7ab` and see V's own comment with the hash; open `slices/FIX-01/DECISIONS.md`, `FIX-07/DECISIONS.md`, `FIX-09/DECISIONS.md` and find the four answers with sources; run the demo and read `16 PASSED`.

- [ ] 0.1 (V) run the RP-0 one-liner and post hash + count on `t_4deda7ab`
- [ ] 0.2 (research seat, read-only) measure (iii): `sed -n '340,362p' migrations/0034_obs_foundation.sql` and `docker exec … psql -c "SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='debateai_obs_writer' AND table_name='component_health'"`; record in `FIX-07/DECISIONS.md`
- [ ] 0.3 (ARCH, Fable 5.1) rule (i), (ii), (iv) in the three DECISIONS files, each with the test name that will assert it
- [ ] 0.4 (orchestrator) B2 ruling request to ARCH; N4 edit request to the demo custodian; re-run `bash docs/missions/2026-08-21-observability-loop/demo/observability-demo.sh` with `OBS_DEMO_DATABASE_URL` set → record stage 02 and 16
- [ ] 0.5 (orchestrator) mint the sixteen slice tickets citing absorbed S-tickets; resolve U-F2 ids; apply the §A board moves; ask V to create board `fixagent`
- [ ] 0.6 (V) independently verify the existing untracked controller candidate under `tools/obs-listener/corpus/` (schema/version `debateai.fixagent-rp3-injection-corpus.v1`, 24 cases, SHA-256 `8f2733e2ee202b7f1533cfd068063d1b5bf3ca52feb566def000e3a6987d113e`) and pin its exact bytes under `VLATER-RP3`; until it is landed and V-pinned, acceptance remains `PENDING RP-3`

---

### Task 1: FIX-01 — First row: a real scheduler-job fault becomes a row V can query

**Status: C1-C5 PASS; V acceptance pending.** The runtime and release-admission chain passes fresh Sol review through `bd3efffa8343041926703c1d8c59754b8d4271e2`. Migration `0061` was allocated in `4b18f71c`; the reviewed FIX-03 projection was integrated in `6649fd7d`; C5 landed in `3d51e5b3`; its zone-veto fix passed final Sol review at `bd0cd92e`. The test-only in-flight start/stop guard at `24d0b3e5` also passed fresh independent SPEC and code-quality review with product bytes unchanged. Focused C5 is 55/55 ×3, the final readiness proof is 12/12 ×3, broad is 261/261, and database/spool is 61/61. Gate G1 remains open until V runs the real-surface checks. `scheduled(next_due)` remains OPEN / `NO SCHEDULE RULED` and is indexed for a later V/ops owner-and-cadence ruling.

**Files:**
- Existing C1-C4 surfaces stay governed by their reviewed commits and SPEC-v4..v8.
- C5 modifies: `apps/scheduler/src/{cli,index}.ts`, `packages/obs-capture/install/scheduler.ts` only for the narrow cancel API, `packages/obs-capture/src/runtime/{index,drain}.ts`, `packages/obs-capture/src/{redactor,kinds}.ts`, `packages/obs-capture/src/registry/index.ts`, and migration `0061_obs_job_lifecycle_taxonomy.sql` after its decision row.
- C5 tests are exactly the scheduler lifecycle/readiness, registry, runtime-shape, import-graph, scheduler-row, and spool-drain files named by `SPEC-v3.md` section 7.
- API and runner installers remain byte-frozen. No C5 edit is allowed in `emit.ts`, `flusher.ts`, `runtime/sink.ts`, migration `0034`, the package root barrel, zone code, register environment code, schema grants, or product databases outside the stated taxonomy constraint.
- `@debateai/db` remains forbidden at any depth from the runtime. No DELETE, UPDATE, or TRUNCATE is allowed on obs tables.

**Interfaces:**
- Consumes: the frozen `RuntimeCaptureModule` declaration in `packages/obs-capture/install/*.ts` (fields `runtime`, `spoolFd`, `installExitSink`); the landed queue/flusher/redactor/spool modules; `obs.occurrence`, `obs.capture_gap`, `obs.spool_receipt` (0034)
- Produces (FIX-03/04/05/07 rely on these): the reviewed runtime API; a generation-safe installed waiter; the narrow scheduler-start cancel API; and `runJobWithLifecycle(name, fn)`. A throwing job emits exactly `STARTED` then `FAILED`. A successful job emits `STARTED` then exactly one of `SUCCEEDED` or `NOOP{count}`. Lifecycle rows use `runtime='scheduler'`, `capture_point='job'`, `capture_status ∈ {PERSISTED, SPOOLED}`, the registry bindings in SPEC-v3 R09, and all five FIX-03 correlation fields as `NOT_APPLICABLE`.

**Definition of done (VAL assertions):**

```
# VAL-FIX-01-001: The runtime subpath exists and matches the frozen installer contract at compile time (R01)
Surface: artifact
Needs: none
Behavior: `import("@debateai/obs-capture/runtime")` resolves; startCaptureRuntime/stopCaptureRuntime satisfy RuntimeCaptureModule; renaming a function, renaming any of the three argument fields, changing the arity, or making the signature positional raises a `pnpm typecheck` diagnostic
Evidence: `pnpm typecheck` delta = 0 vs the 8-diagnostic pin; four mutants (rename fn, rename `spoolFd`, drop an arg, positional) each add ≥ 1 diagnostic — recorded as path:line

# VAL-FIX-01-002: Pre-arm and overflow losses are COUNTED rows, never silence (R02)
Surface: data
Needs: migration 0034 live
Behavior: a bounded reference queue replaces the installer's drop-everything default at arm; an emit() before arming is counted; after the first flush one obs.capture_gap row with gap_class='QUEUE_FULL' and lost_count ≥ 1 exists
Evidence: `pnpm vitest run tests/unit/fix01-queue-gap.test.ts` ×3; the SQL from the integration test

# VAL-FIX-01-003: The runtime writes through `pg` as debateai_obs_writer and imports nothing of the product (R03, R09, R14)
Surface: artifact + data
Needs: none
Behavior: a resolve-hook trace of import("@debateai/obs-capture/runtime") shows `pg`, ZERO `@debateai/db`, ZERO `apps/**`, ZERO zone-manifest paths; import("@debateai/obs-capture") (root barrel) shows ZERO `pg`; the sink succeeds as debateai_obs_writer; `SELECT 1 FROM core.run LIMIT 1` and `UPDATE obs.occurrence SET code='x'` as that role are DENIED; a sink pointed at debateai_obs_human fails closed (spools, never throws into the product); nothing imports, reads, stats, lists or names a zone path
Evidence: `pnpm vitest run tests/architecture/fix01-import-graph.test.ts` ×3 (resolve-hook trace printed); acceptance step 9; a mutant adding `import "@debateai/db"` to runtime/index.ts → RED

# VAL-FIX-01-004: Spool → drain → receipt, idempotent, pid-aware, with the 0-byte rule stated and asserted (R04, R11)
Surface: data + cli
Needs: VAL-FIX-00-002 (i)
Behavior: only post-redaction envelopes are written through the pre-opened fd; on the next arm of any instrumented process spooled records land with capture_status='SPOOLED' and one obs.spool_receipt row each; re-ingesting the same file changes neither count (UNIQUE (source, source_event_ref)); files whose owning pid is alive are skipped; the 0-byte dead-pid rule from DECISIONS is asserted by a named test; with Postgres down the job's exit code is unchanged and the envelope is spooled; after Postgres returns the next instrumented process drains it and renames the file `*.ingested`
Evidence: `pnpm vitest run tests/integration/fix01-spool-drain.test.ts` ×3; acceptance steps 10–11

# VAL-FIX-01-005: The Tier-1 exit sink honours O-1..O-4 (R05)
Surface: artifact
Needs: none
Behavior: at most one record per process death (never Tier-1 plus Tier-0 fallback); the write completes synchronously; no uncaughtException/unhandledRejection listener of its own; never writes through the raw fd outside the sink; never calls process.exit
Evidence: `pnpm vitest run tests/unit/fix01-exit-sink.test.ts` ×3 using a spawned child that dies by throw, by SIGTERM, and by exit(1) — one record each; grep of runtime/** for `process.exit(` and `process.on("uncaughtException"` = 0

# VAL-FIX-01-006: A real scheduler fault is STARTED then FAILED within one shared deadline, and the product is unaffected (R06, R07, R10, R12, R15)
Surface: cli + data
Needs: the one-time writer password (V), OBS_* env
Behavior: apps/scheduler/src/cli.ts imports the scheduler installer first, shares one monotonic 5000 ms budget across the caught runtime import and generation-safe installed waiter, and emits lifecycle rows only after readiness returns `installed`. A throwing job yields exactly two ordered lifecycle rows, `STARTED` then `FAILED`, with one failure row and the same re-thrown error object. Import failure, start failure, stop, or timeout is silent and fail-open for product behavior. Teardown is cancel pending scheduler start → stop runtime within the remaining deadline → pool.end. Exit code, stderr bytes, and job report stay unchanged. `scheduled(next_due)` is not claimed.
Evidence: `SPEC-v3.md` section 8 C5 cases; focused scheduler lifecycle/readiness tests ×3; real scheduler-row test; exact lifecycle-code filtering excludes the independent C3 fatal-self row.

# VAL-FIX-01-007: No planted secret survives, and no message text is stored (R08)
Surface: data
Needs: VAL-FIX-01-006
Behavior: a database URL carrying `PLANTED-SECRET-7731`, passed to the failing job, is absent from every text/jsonb column of every obs.* table and from the raw bytes of every spool file; no `message` text is stored anywhere in obs.*
Evidence: acceptance step 7 (both queries → 0; grep-exit=1)

# VAL-FIX-01-008: audit:source rows are recorded verbatim, not gated (R13, V-6)
Surface: cli
Needs: none
Behavior: the handoff lists the `blocking` array verbatim — expected the three frozen installers plus runtime/config.ts and runtime/sink.ts; `pnpm lint` is NOT a Done criterion
Evidence: acceptance step 12 output pasted in PROGRESS.md
```

**Acceptance criteria:** `SPEC-v3.md` section 8 is binding for C5. In short: query only the four lifecycle codes after a saved `occ_seq`; a thrown job must yield ordered `STARTED, FAILED`, exactly one failure row, and one failure fingerprint across repeats. Each successful job yields `STARTED` then exactly one of `SUCCEEDED` or `NOOP`, with the authoritative count from its report. Database-down proof expects two lifecycle spool rows plus the independent C3 fatal-self row. Readiness races, shared-budget splits, cancellation, safe parameters, secret absence, `NOT_APPLICABLE` correlations, and migration `0061` are all tested. V's real-surface password, database, and release-admission acts remain V-only. No result may claim `scheduled(next_due)`.

**Implementation — clusters (each = one verification command ×3, worst run wins):**

**C1 — runtime shape, config seeds, import graph** (R01, R03 graph half, R13, R14). Verify: `pnpm vitest run tests/unit/fix01-runtime-shape.test.ts tests/architecture/fix01-import-graph.test.ts`
- [ ] 1.1 Rebase the worktree: `git -C .worktrees/oa-fix-01 rebase dev` → HEAD `2b670d30`; `git status --porcelain` empty
- [ ] 1.2 Write `tests/unit/fix01-runtime-shape.test.ts` RED: a type-level test that assigns `{ startCaptureRuntime, stopCaptureRuntime }` to `RuntimeCaptureModule` (imported from `install/scheduler.ts`'s exported type) and `expectTypeOf` the three named fields; and `tests/architecture/fix01-import-graph.test.ts` RED: register a `node --import` resolve hook (or `--experimental-loader` trace via `NODE_OPTIONS`) around `import("@debateai/obs-capture/runtime")` and assert the resolved set contains `pg` and no `@debateai/db`, no `apps/`, no `src/zone/`; and that `import("@debateai/obs-capture")` contains no `pg`
- [ ] 1.3 Run → FAIL (module not found); write `runtime/config.ts` (`readObsBounds()` reading `OBS_FLUSH_DEADLINE_MS` seed 5000, `OBS_QUEUE_CAPACITY`, `OBS_SPOOL_DIR`, `OBS_WRITER_DATABASE_URL`; every seed labelled `// seed — V ratifies at FIX-01 acceptance`) and `runtime/index.ts` (exports with the frozen signature; body wires queue → flusher → sink in C2/C3)
- [ ] 1.4 Run → GREEN; refute: rename `spoolFd` → `pnpm typecheck` shows a new diagnostic (record path:line); revert
- [ ] 1.5 Commit: `git add packages/obs-capture/src/runtime tests/unit/fix01-runtime-shape.test.ts tests/architecture/fix01-import-graph.test.ts && git commit -m "feat(obs): FIX-01 C1 — runtime subpath, config seeds, import graph"`

**C2 — bounded queue, gap counting, pg sink as writer, least privilege** (R02, R03 sink half, R09, R12). Verify: `pnpm vitest run tests/unit/fix01-queue-gap.test.ts tests/integration/fix01-scheduler-row.test.ts`
- [ ] 1.6 Write `tests/unit/fix01-queue-gap.test.ts` RED: emit before arm → counted; after first flush a `QUEUE_FULL` gap row with `lost_count ≥ 1`; queue at capacity drops the newest and counts it; and the integration test RED (embedded Postgres with 0034 applied via `tests/support/testDatabase.ts`): the sink inserts as `debateai_obs_writer`; the same connection `SELECT 1 FROM core.run` → permission denied; `UPDATE obs.occurrence` → denied; a sink configured with the `debateai_obs_human` URL spools instead of throwing; two identical envelopes → two rows, one fingerprint
- [ ] 1.7 Run → FAIL; implement the reference queue swap at arm, the `pg`-only sink in `runtime/index.ts`, the gap flush; run → GREEN; refute: remove the pre-arm counter → RED; revert
- [ ] 1.8 Commit: `git commit -m "feat(obs): FIX-01 C2 — bounded queue, gap rows, writer sink, least privilege"`

**C3 — Tier-1 exit sink (O-1..O-4)** (R05). Verify: `pnpm vitest run tests/unit/fix01-exit-sink.test.ts`
- [ ] 1.9 Write the test RED: spawn a child script that arms the runtime with `installExitSink`, then (a) throws, (b) receives SIGTERM, (c) calls `process.exit(1)`; each child's spool has exactly ONE record; the sink module source contains no `process.exit(`, no `process.on("uncaughtException"`, no `process.on("unhandledRejection"`; a synchronous-write assertion: the record is present in the file before the child's exit code is observed
- [ ] 1.10 Run → FAIL; write `runtime/sink.ts` (synchronous `fs.writeSync` on the pre-opened fd of ONE post-redaction envelope; installed through the installer's hook, never by registering listeners); run → GREEN; refute: add a Tier-0 fallback write → two records → RED; revert
- [ ] 1.11 Commit: `git commit -m "feat(obs): FIX-01 C3 — Tier-1 exit sink under O-1..O-4"`

**C4 — spool drain, receipts, idempotence, pid rule, 0-byte rule** (R04, R11). Verify: `pnpm vitest run tests/integration/fix01-spool-drain.test.ts`
- [ ] 1.12 Write the test RED: seed a spool dir with (a) a one-line file from a dead pid, (b) a file from the test's own live pid, (c) a 0-byte file from a dead pid (expected per the DECISIONS rule from Task 0 — assert exactly that rule), (d) the same file as (a) copied under another name; arm → (a) lands `SPOOLED` + one `spool_receipt`, renamed `*.ingested`; (b) skipped; (c) per rule; (d) does not add rows (UNIQUE `(source, source_event_ref)`)
- [ ] 1.13 Run → FAIL; write `runtime/drain.ts`; run → GREEN; refute: drop the pid liveness check → (b) ingested → RED; revert
- [ ] 1.14 Commit: `git commit -m "feat(obs): FIX-01 C4 — spool drain, receipts, idempotence"`

**C5 — scheduler lifecycle, readiness, and taxonomy; product unaffected** (SPEC-v3 R09-R15). Verify with the exact unit, architecture, integration, and migration commands in `SPEC-v3.md` sections 7-8.
- [ ] 1.15 Record the completed collision audit and allocate migration `0061` in `DECISIONS.md` before creating the migration. Integrate the already-approved FIX-03 declared-kind projection, then prove its focused tests still pass.
- [ ] 1.16 Write RED tests for all four lifecycle templates and bindings; strict parameter validation; authoritative NOOP counts; ordered two-row failure; the generation-safe installed waiter; the shared monotonic 5000 ms dynamic-import/wait budget; both scheduler cancellation checks; teardown order; `NOT_APPLICABLE` correlations; the one-class migration; and product-output identity on every non-installed path.
- [ ] 1.17 Implement the minimum C5 surface from `SPEC-v3.md` section 7. The scheduler installer gains only `cancelScheduledCaptureRuntimeStart()`. API/runner installers stay byte-identical. Runtime readiness settles once per generation. The CLI emits only after `installed`, then cancels, stops within the remaining deadline, and closes the pool. No scheduling host or cadence is added.
- [ ] 1.18 Run every C5 mutant from `SPEC-v3.md`, restore exact bytes after each, then run focused clusters ×3, C1-C4/S05 regressions, migration tests, contract generation, typecheck delta, source/text/architecture audits, frozen-file checks, and exact scope checks. Commit only after all required evidence is green.

**Handoff gates, validate lanes, gate G1(FIX-01):** cluster commands ×3 (`passed/total`); typecheck delta; audit:source rows pasted; refutation table (every VAL names its mutants); `SKILLS LOADED`; self-report. Scrutiny lane (the house that did not code): re-run everything, re-apply mutants, `git diff --stat` confined to the Allowed list, grep the diff for `DELETE|UPDATE|TRUNCATE` on obs tables = 0, for `@debateai/db` under `src/runtime` = 0. Real-surface lane = the current SPEC-v3 C5 acceptance plus the still-applicable V-only database and release-admission checks. **Done = V's veto.** After the veto: merge into dev; **only then** dispatch FIX-07; re-run the D12 demo (stages 02 and 08 expected PASSED).

---

### Task 2: FIX-02 — Root survives the wrapper

**Status: C1-C3 PASS; V acceptance pending.** `TypedDomainError` cause support and its shape proof are in `2f472e17` + `98ca1829`. Fixed pool-failure capture is in `93fa0240`; fresh Sol review is PASS/PASS. Controller commits `c60c18fc` and `9c7b8b2c` authorize the bounded cause-chain envelope, normalized serialized boundary, and atomic `occurrence_detail` storage. C3 is committed at `e7b9f681` with the exact required subject; fresh Sol review is PASS/PASS. Focused real-PostgreSQL and unit tests are 130/130 ×3, adjacent tests are 138/138, and the hostile-envelope, duplicate-order, rollback, and writer-role probes pass. R04/R05 and any second wrapper remain deferred. Gate G1 stays open until V runs the real-surface checks.

**Files:**
- Modify: `packages/kernel/src/index.ts` region `error-class` (`TypedDomainError` to EOF); `packages/db/src/index.ts` region `wrapper` (`typedPoolFailure`; `createPool` `pool.on("error")`)
- Create: `tests/unit/fix02-cause-chain.test.ts`, `tests/unit/fix02-pool-failure.test.ts`, `tests/integration/fix02-chain-codes.test.ts`
- Read-only: `packages/obs-capture/src/registry/**`, `packages/obs-capture/src/health.ts`
- Forbidden: `packages/db/src/index.ts` `obs-reexport` region and the identity re-export block; `apps/runner/src/index.ts` (all regions — FIX-03); `packages/db/src/identity.ts`; `migrations/**`

**Interfaces:**
- Consumes: FIX-01's pipeline for the integration assertion (after merge); the registry codes for the wrapper and the pg layer
- Produces: `class TypedDomainError extends Error { constructor(readonly code: string, message: string, options?: { cause?: unknown }) }` — existing 2-arg callers compile unchanged; `typedPoolFailure(pgError)` builds from a FIXED template and passes `{ cause: pgError }`; the pool error path reports through the capture layer's fixed-code DB-failure channel (`health.ts`'s non-recursive channel); stored rows carry `obs.occurrence.cause_relation` non-null on the wrapper's row and `obs.occurrence_detail.cause_chain_codes` = `[wrapperCode, causeCode, …]`

**Definition of done (VAL assertions):**

```
# VAL-FIX-02-001: TypedDomainError carries `cause` without breaking any caller (R01, R07)
Surface: artifact
Needs: none
Behavior: `new TypedDomainError("X","m",{cause: inner}).cause === inner`; two-argument callers compile unchanged; `pnpm typecheck` diagnostics under packages/kernel/** and packages/db/** stay at 0/0
Evidence: `pnpm vitest run tests/unit/fix02-cause-chain.test.ts` ×3; typecheck output filtered to the two globs; acceptance steps 1 and 6

# VAL-FIX-02-002: The pg error is preserved by identity through two real wrap levels; the pool error path never prints raw text (R02, R03, R04, R05)
Surface: artifact + data
Needs: none
Behavior: typedPoolFailure's message is a fixed template (upstream text never interpolated); walking .cause from the outermost product error reaches the original pg error object (`outer.cause.cause === inner`) at real call sites; pool.on("error") reports through the capture channel that cannot recurse into the failed pool, and console.error is gone from the createPool region; async joins in the touched regions preserve every rejection (AggregateError or equivalent)
Evidence: `pnpm vitest run tests/unit/fix02-pool-failure.test.ts` ×3; acceptance step 5 (`grep -c 'console.error'` = 0 in the region); a mutant re-adding `${detail}` → RED

# VAL-FIX-02-003: The stored record carries the chain as codes, never text (R06)
Surface: data
Needs: FIX-01 merged
Behavior: after a wrapped fault is captured, cause_relation is non-null on the wrapper's row and occurrence_detail.cause_chain_codes lists ≥ 2 codes (wrapper first); no `no_such_database` and no planted secret appear in occurrence_detail
Evidence: acceptance steps 2–4; `pnpm vitest run tests/integration/fix02-chain-codes.test.ts` ×3
```

**Acceptance criteria — V's 6 steps (verbatim from the frozen SPEC §5):**
1. `grep -n 'class TypedDomainError' -A 6 packages/kernel/src/index.ts` → the constructor accepts an options object with `cause` and passes it to `super`.
2. Run FIX-01 step 4's failing job (bad database name, planted password) → `exit=1`.
3. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT o.code, o.cause_relation, d.cause_chain_codes FROM obs.occurrence o JOIN obs.occurrence_detail d ON d.occurrence_id = o.occurrence_id ORDER BY o.occ_seq DESC LIMIT 1"` → the wrapper's code first, then at least one further code from the pg layer in `cause_chain_codes` (a JSON array of ≥ 2 codes); `cause_relation` non-null.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM (SELECT d::text t FROM obs.occurrence_detail d) s WHERE t LIKE '%no_such_database%' OR t LIKE '%PLANTED-SECRET-7731%'"` → `0` (codes, not text).
5. `grep -c 'console.error' packages/db/src/index.ts` → `0` in the `createPool` region (V opens the file at the `pool.on("error")` line and sees the capture channel call instead).
6. `pnpm typecheck; echo "exit=$?"` → the same exit code and the same count of diagnostics under `packages/kernel/**` and `packages/db/**` as the slice's recorded base (the handoff states both numbers).

"V vetoes Done only after steps 1–6 match."

**Implementation — clusters:**

**C1 — TypedDomainError options + cause; caller compatibility** (R01, R07). Verify: `pnpm vitest run tests/unit/fix02-cause-chain.test.ts`
- [ ] 2.1 Record the base: `pnpm typecheck 2>&1 | grep -c 'packages/kernel/\|packages/db/'` → `0`; write it in PROGRESS.md
- [ ] 2.2 Write the test RED: `.cause` identity; a 2-arg construction still type-checks (`expectTypeOf`); `AggregateError` from `Promise.allSettled`-style joins in the wrapper region carries all rejections (fixture with two rejections)
- [ ] 2.3 Run → FAIL; edit the `error-class` region only (`constructor(readonly code: string, message: string, options?: { cause?: unknown }) { super(message, options); this.name = "TypedDomainError"; }`); run → GREEN; commit `git commit -m "feat(kernel): FIX-02 C1 — TypedDomainError carries cause"`

**C2 — typedPoolFailure fixed template; pool error via the capture channel** (R02, R03, R04, R05). Verify: `pnpm vitest run tests/unit/fix02-pool-failure.test.ts`
- [ ] 2.4 Write the test RED: `typedPoolFailure(new Error("secret host text"))` → message equals the fixed template exactly and does not contain "secret host text"; `.cause` is the same object; a two-level wrap at a real call site (`createPool` → `typedPoolFailure`) yields `outer.cause.cause === inner`; the pool `error` event with a pg error calls the capture health channel spy once and `console.error` zero times; the channel call happens with no query on the failed pool (spy `pool.query` = 0)
- [ ] 2.5 Run → FAIL; edit the `wrapper` region only; run → GREEN; refute: restore `${detail}` → RED; revert; refute: call `pool.query` inside the error handler → the recursion assertion RED; revert
- [ ] 2.6 `pnpm typecheck` → kernel/db diagnostics still 0/0; commit `git commit -m "feat(db): FIX-02 C2 — fixed-template pool failure with cause, capture-channel error path"`

**C3 — stored chain codes (needs FIX-01 merged)** (R06). Verify: `pnpm vitest run tests/integration/fix02-chain-codes.test.ts`
- [ ] 2.7 After FIX-01 merges into the slice branch (`git merge dev`), write the test RED: drive the scheduler failure through the real pipeline against the embedded Postgres; assert `cause_relation IS NOT NULL` on the newest row and `cause_chain_codes` length ≥ 2 with the wrapper code first; assert `occurrence_detail::text` contains neither `no_such_database` nor the planted token
- [ ] 2.8 Run → FAIL if the redactor does not project chain codes (then the projection belongs to the landed `redactor.ts` read-only surface — file a finding for ARCH, do NOT edit `redactor.ts`, which is FIX-03's region); when GREEN, commit `git commit -m "test(obs): FIX-02 C3 — chain codes stored, never text"`

**Handoff gates, validate lanes, gate G1(FIX-02):** as Task 1. Scrutiny lane: `git diff --stat` touches exactly `packages/kernel/src/index.ts`, `packages/db/src/index.ts` and the three tests; the diff to `packages/db/src/index.ts` contains no line from the `obs-reexport` region or the identity block (check by symbol, not line). Real-surface lane = V's 6 steps. **Done = V's veto.**

---

### Task 3: FIX-03 — Runner job surface + real identity (the half-merged slice, re-cut)

**Status: C1-C3 PASS as artifacts; persisted-row and V checks pending.** The safe declared-kind projection is complete through `877ce119`; runner task capture and review fixes are complete through `4880f19d`; the gateway/repair packet is in `322b1886`. Fresh Sol review is PASS/PASS for all three clusters. The prompt-only provider literals remain owned by RP-0/S02/FIX-05 for registry admission. Gate G1 still needs FIX-01 integration, stored-row proof, and V's real run.

**Files:**
- Modify: `apps/runner/src/index.ts` regions `task-catch`, `gateway-seam`, `buildSchemaRepairPacket` (anchored by symbol, never by line); `apps/runner/src/main.ts` (context seeding only); `packages/obs-capture/src/redactor.ts` region `declared-kind-projection`; `tests/integration/obs-l3-s06-runner-binding.test.ts` (the ONE landed test a FIX slice may amend — this slice only)
- Create: `packages/obs-capture/src/kinds.ts`; `tests/unit/fix03-kinds.test.ts`, `tests/unit/fix03-projection.test.ts`, `tests/unit/fix03-repair-packet.test.ts`, `tests/integration/fix03-runner-row.test.ts`, `tests/architecture/fix03-import-graph.test.ts`
- Read-only: `packages/obs-capture/src/{context,emit,index}.ts`, `install/runner.ts`, `packages/kernel/src/index.ts` (FIX-02), `packages/providers/src/index.ts` (FIX-05)
- Forbidden: `packages/obs-capture/src/runtime/**` (FIX-01); `packages/kernel/**`, `packages/db/**` (FIX-02); `apps/api/**`; the zone

**Interfaces:**
- Consumes: FIX-01's runtime (rows persist); the ambient context API in `packages/obs-capture/src/context.ts`; `L2-ADDENDUM-2-DECLARED-KINDS.md` §2.1 (the six kinds, transcribed by hand into the test)
- Produces: `packages/obs-capture/src/kinds.ts` exporting `DECLARED_KINDS = ["run","work_item","node","attempt","ledger_entry","at_seq"] as const` (type-only import of `ObsContext`; zero runtime imports); the projection in `redactor.ts`: a value reaches `run_ref` only when DECLARED as kind `run`, else `UNKNOWN:DECLARED_KIND_REQUIRED`; wrong-field kinds rejected; zone-context occurrences carry no correlation ref; `attempt_index` written on runner rows (FIX-09 counts work units from it); the gateway seam seeds `run` into ambient context for provider calls (FIX-05 inherits it); rows `{runtime:'runner', capture_point:'job', run_ref=<uuid>, work_item_ref=<uuid>, attempt_index, capture_status:'PERSISTED'}` joinable to `obs.run_correlation_v`

**Definition of done (VAL assertions):**

```
# VAL-FIX-03-001: Capture fires before recordTerminalFailure, inside a seeded context, and the ORIGINAL error is re-thrown (R01, R02, R11)
Surface: artifact + data
Needs: FIX-01 merged for the data half
Behavior: in declareHatchetWalkingSkeletonTask's catch the emit precedes recordTerminalFailure with run=dispatch.runId, work_item=dispatch.workItemId and the Hatchet attempt index in context; when recordTerminalFailure returns false the caught error is re-thrown unchanged and RUNNER_FAILURE_STATE_NOT_RECORDED is its own occurrence with the original as cause; exit code, Hatchet result payload and the terminal-failure write are unchanged when capture is off
Evidence: `pnpm vitest run tests/integration/obs-l3-s06-runner-binding.test.ts tests/integration/fix03-runner-row.test.ts` ×3 (the re-cut fixtures: order `['capture','terminal']`, `chainContainsFailure: true`, `replacementCode: "CHAIN_PRESERVED"`); acceptance step 5

# VAL-FIX-03-002: The six-kind list is frozen and the projection is a veto (R04, R05, R06, R10)
Surface: artifact
Needs: none
Behavior: kinds.ts holds exactly run, work_item, node, attempt, ledger_entry, at_seq (the test's expected list is transcribed from L2-ADDENDUM-2 §2.1, never read from kinds.ts); a shape-valid UUID with no declaration lands as UNKNOWN:DECLARED_KIND_REQUIRED; a lawful kind in the wrong field is rejected; zone-context occurrences carry no correlation ref; asker_id and session_id are inexpressible (declaring them is rejected); kinds.ts has zero runtime imports and the barrel's resolve-hook trace = pre-slice set + src/kinds.ts, still ZERO pg/@debateai/db/apps/zone
Evidence: `pnpm vitest run tests/unit/fix03-kinds.test.ts tests/unit/fix03-projection.test.ts tests/architecture/fix03-import-graph.test.ts` ×3; mutant: add a seventh kind → RED; mutant: let a bare UUID through → RED

# VAL-FIX-03-003: A failed runner job is one row per attempt with real ids, joinable to the run (R03, R08, R09)
Surface: data
Needs: FIX-01 merged; dev stack up
Behavior: exactly one obs.occurrence row per attempt {runtime='runner', capture_point='job', run_ref = the run uuid, work_item_ref = the work-item uuid, attempt_index, capture_status='PERSISTED'}; the row joins obs.run_correlation_v; retries fold by work item (asserted at FIX-09; the column is written here); the gateway seam seeds `run` for provider calls
Evidence: acceptance steps 3, 4, 7; the integration test's join assertion

# VAL-FIX-03-004: The raw zod parse text never enters a prompt, row or spool (R07)
Surface: artifact + data
Needs: none
Behavior: buildSchemaRepairPacket emits a stable code + safe-template id + enumerated parameters; `grep -n 'parseError' apps/runner/src/index.ts | grep -c '\${'` = 0; a planted distinctive token in a parse error is absent from the provider message, every obs.* column and the spool
Evidence: `pnpm vitest run tests/unit/fix03-repair-packet.test.ts` ×3; acceptance step 6; acceptance step 8 (no asker-shaped uuid rows)
```

**Acceptance criteria — V's 8 steps (verbatim from the frozen SPEC §5):**
1. `pnpm dev:auth:up` in one terminal → the stack reports api/runner/ui up on :3000; Hatchet dashboard `http://localhost:8888` shows the runner worker registered.
2. Cause a real failed run through the product: from the UI at `https://localhost:3000`, start a debate whose configured provider endpoint is unreachable (V points the dev provider at a closed port in the register before step 1, or stops the vLLM/relay the runner uses) → the debate shows a failed state in the UI.
3. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT runtime, capture_point, code, run_ref, work_item_ref, attempt_index, capture_status FROM obs.occurrence WHERE runtime='runner' ORDER BY occ_seq DESC LIMIT 3"` → rows with `runner|job|<code>|<uuid>|<uuid>|<n>|PERSISTED`; `run_ref` is a uuid, NOT `UNKNOWN:…`.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM obs.run_correlation_v v JOIN obs.occurrence o ON o.run_ref = v.run_id::text WHERE o.runtime='runner'"` → ≥ 1 (the row joins to the real run without guessing).
5. `grep -n 'RUNNER_FAILURE_STATE_NOT_RECORDED' -B 6 -A 3 apps/runner/src/index.ts` → the catch captures before `recordTerminalFailure` and the final statement re-throws the ORIGINAL error.
6. `grep -n 'parseError' apps/runner/src/index.ts | grep -c '\${'` → `0` (no interpolation of parse text).
7. Retry fold: with `engineRetries` ≥ 1 in the dev register, one failed work item shows ≥ 2 occurrence rows with the same `work_item_ref` and increasing `attempt_index`, and (after FIX-09) one incident.
8. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM (SELECT o::text t FROM obs.occurrence o) s WHERE t ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' AND t LIKE '%asker%'"` → `0`.

"V vetoes Done only after steps 1–8 match; step 7 may be recorded as `PENDING FIX-09` for the incident half."

**Implementation — clusters:**

**C1 — kinds.ts, projection veto, import graph** (R04, R05, R06, R10). Verify: `pnpm vitest run tests/unit/fix03-kinds.test.ts tests/unit/fix03-projection.test.ts tests/architecture/fix03-import-graph.test.ts`
- [ ] 3.1 Write `fix03-kinds.test.ts` RED with the list typed by hand from `L2-ADDENDUM-2-DECLARED-KINDS.md` §2.1; `fix03-projection.test.ts` RED: `project({run_ref: "<uuid>"})` without a declaration → `UNKNOWN:DECLARED_KIND_REQUIRED`; `declare("work_item", uuid)` placed in `run_ref` → rejected; `declare("asker_id", …)` → type error and runtime rejection; a zone-context envelope → no `run_ref`/`work_item_ref` at all; `fix03-import-graph.test.ts` RED: the barrel's resolve trace = the pre-slice set (recorded in the test from the current trace) + `src/kinds.ts`
- [ ] 3.2 Run → FAIL; write `kinds.ts` (`import type { ObsContext } from "./context.js"` only) and the `declared-kind-projection` region in `redactor.ts` (a new object built from the declared map; no spread of the source); run → GREEN; refute: add `"asker_id"` to the list → RED; revert
- [ ] 3.3 Commit: `git commit -m "feat(obs): FIX-03 C1 — frozen declared kinds, projection veto"`

**C2 — task-catch re-cut; the original error survives; attempt_index** (R01, R02, R03, R11). Verify: `pnpm vitest run tests/integration/obs-l3-s06-runner-binding.test.ts tests/integration/fix03-runner-row.test.ts`
- [ ] 3.4 Re-cut the landed test's fixtures to today's `dev` (advisory-lock gateway, current `@debateai/db` exports) — this is the one lawful amendment; assert order `['capture','terminal']`, `chainContainsFailure: true`, `replacementCode: "CHAIN_PRESERVED"`, the re-thrown error `===` the original, and an `attempt_index` equal to the Hatchet attempt; run → RED (4 failures remain until the code lands)
- [ ] 3.5 Edit the `task-catch` region of `declareHatchetWalkingSkeletonTask` (`apps/runner/src/index.ts:2569`, find by symbol): `withObsContext({run: dispatch.runId, work_item: dispatch.workItemId, attempt: attemptIndex}, () => emit(...))` BEFORE `recordTerminalFailure`; on `false`, emit `RUNNER_FAILURE_STATE_NOT_RECORDED` with `{cause: original}` and `throw original`; run → GREEN ×3; refute: swap the order → RED; revert
- [ ] 3.6 Write `fix03-runner-row.test.ts` RED: with capture OFF (installer absent) the exit code, Hatchet result payload and terminal-failure write are byte-identical to capture ON (run the task twice under a stub dispatcher); with capture ON one row per attempt with the real ids; run → GREEN
- [ ] 3.7 Commit: `git commit -m "feat(runner): FIX-03 C2 — capture before terminal failure, original re-thrown, attempt index"`

**C3 — gateway seam seeds run; buildSchemaRepairPacket without raw text** (R07, R08). Verify: `pnpm vitest run tests/unit/fix03-repair-packet.test.ts`
- [ ] 3.8 Write the test RED: a zod failure whose message contains `CANARY-PARSE-8812` → the packet's provider message contains a code + template id + enumerated params and no `CANARY-PARSE-8812`; the gateway seam (`createPostgresProviderGateway`, `:2603`) invokes the provider inside a context carrying `run`
- [ ] 3.9 Run → FAIL; edit the two regions; run → GREEN; `grep -n 'parseError' apps/runner/src/index.ts | grep -c '\${'` → 0; `pnpm typecheck` delta 0; `pnpm audit:source` unchanged (3 rows + FIX-01's if merged)
- [ ] 3.10 Commit: `git commit -m "feat(runner): FIX-03 C3 — gateway seeds run; repair packet emits codes not text"`

**Handoff gates, validate lanes, gate G1(FIX-03):** as Task 1; scrutiny lane additionally confirms `git diff --stat apps/runner/src/index.ts` touches only the three named regions (diff hunks contain the three symbols and nothing else) and that `apps/runner/src/main.ts` changed only by a context-seeding line. Real-surface lane = V's 8 steps with the stack up and a provider pointed at a closed port. **Done = V's veto.** Post-merge: the D12 demo's stages 06 and 11 expected PASSED; FIX-16's baseline may be snapshotted only after this and FIX-02/04/05 merge.

---

### Task 4: FIX-04 — API request surface

**Status: NOT STARTED.** `apps/api/src/main.ts` has no installer import (first statement is the Hatchet SDK import); `setErrorHandler` (`apps/api/src/index.ts:439-491`) returns `errorCode` on 500-class responses (OBS-R053 partial) but records nothing, returns no correlation id, and its stream-abort branch records nothing. `packages/obs-capture/install/api.ts` landed and is one of the three `audit:source` rows. **Blocked on `VNOW-02`: V must supply the B2 ruling and the admitted immutable FIX-04 base SHA before engineering may dispatch; no FIX-04 implementation code exists** (`tests/support/zone-boundary.ts`'s ZI-2 pin is stale since `0cec59ef`; shape intact). Accept only after FIX-01 merges, with the stack up. Gate G1. Absorbs S08 + the `obs-context-hook` contract extension (L2-ADDENDUM-2 §4A; V-5(c) 2026-08-26). ZI-1..ZI-4 and Batch-8 bind every test.

**Files:**
- Modify: `apps/api/src/index.ts` regions `error-boundary` (`setErrorHandler`) and `obs-context-hook` (a module-level route-template table + one `onRequest` hook registration, anchored by symbol); `apps/api/src/main.ts` first-import line
- Create: `tests/integration/fix04-error-boundary.test.ts`, `tests/integration/fix04-context-hook.test.ts`, `tests/architecture/fix04-zone-region.test.ts`
- Read-only: `tests/support/zone-boundary.ts` (never edited), `packages/obs-capture/src/{context,kinds,index}.ts`, `install/api.ts`
- Forbidden: the zone-route-mount region (one byte); every zone file; `apps/api/src/obs-client-report.ts` and the client-report mount line (FIX-06); `apps/runner/**`, `apps/scheduler/**`, `packages/**` except read-only

**Interfaces:**
- Consumes: FIX-01's runtime; FIX-03's `kinds.ts` (declares `run` on three route templates); `resolveZoneRouteMountRegion()` from `tests/support/zone-boundary.ts`
- Produces: 500-class bodies `{ error: <code>, correlation_id: <id> }` where `<id>` = the occurrence's `source_event_ref`, `message` absent for ≥ 500, 4xx unchanged; rows `{runtime:'api', capture_point:'http', component.route_template, capture_status}`; a request-scoped context entered at `onRequest` declaring kind `run` ONLY on the three run-scoped templates of L2-ADDENDUM-2 §4A.3 (`/v1/runs/:id/events`, `/v1/runs/:id`, `/v1/runs/:id/answer` — ARCH re-transcribes from the addendum), nothing on every other route; the stream-abort branch emits then destroys the connection exactly as today

**Definition of done (VAL assertions):**

```
# VAL-FIX-04-001: Every error-boundary branch emits before any byte is written, and 500 bodies carry the correlation id (R01, R02, R03, R07)
Surface: api + data
Needs: FIX-01 merged; dev stack up
Behavior: apps/api/src/main.ts imports install/api first; every branch of setErrorHandler emits before writing, including the headers-already-sent branch (emit then destroy as today); a failing request → status 500|503, body {error, correlation_id}, no message; exactly one row {runtime='api', capture_point='http', component.route_template set (never the concrete URL), capture_status PERSISTED|SPOOLED} within obs.flushDeadlineMs
Evidence: `pnpm vitest run tests/integration/fix04-error-boundary.test.ts` ×3 (Fastify inject: DB stopped → 500 + body shape; a 400 body unchanged; stream abort → emit spy = 1, connection destroyed); acceptance steps 2–4

# VAL-FIX-04-002: Request-scoped context declares `run` on exactly three templates and nothing on the zone (R04, R08, R09)
Surface: api + data
Needs: FIX-03's kinds.ts
Behavior: onRequest enters a context for every request; kind run declared only on the three run-scoped templates; a client-asserted run id is declared only where the template makes it server-verifiable; /v1/auth/* and every zone route declare nothing; resolveSession and every auth flow untouched; AuthFlowError bodies byte-identical; no occurrence row ever carries a zone route template
Evidence: `pnpm vitest run tests/integration/fix04-context-hook.test.ts` ×3; acceptance step 5 (`count(*) … LIKE '/v1/auth/%'` = 0 and the login body/status identical to the pre-slice recording in the handoff)

# VAL-FIX-04-003: The zone-route-mount region is byte-identical and the diff is confined (R05, R06)
Surface: artifact
Needs: VAL-FIX-00-003 (B2 ruling)
Behavior: the single top-level `if (options.registration !== undefined) {…}` block with exactly the three auth mounts in order is byte-identical before and after, resolved by resolveZoneRouteMountRegion() on both sides; the slice's diff is confined to the error-boundary and obs-context-hook regions; no test reads, stats, lists, imports or hashes a zone file (mount reality proven from the text of index.ts only)
Evidence: `pnpm vitest run tests/architecture/fix04-zone-region.test.ts` ×3; acceptance step 6 (`git diff … | grep -c 'options.registration !== undefined'` = 0); a grep of the three test files for `readFileSync|statSync|readdirSync` applied to any zone path = 0
```

**Acceptance criteria — V's 6 steps (verbatim from the frozen SPEC §5):**
1. `pnpm dev:auth:up` → https API answering on :3000 (`curl -sk https://localhost:3000/v1/session -o /dev/null -w '%{http_code}\n'` → `401`).
2. Cause a real 500 in unmodified product code: stop the product database the API uses (`docker stop debateai-v3-postgres-1`) and request an authenticated, DB-backed route V is signed in to (or `curl -sk https://localhost:3000/v1/asks -X POST -H 'content-type: application/json' -d '{}' -w '\n%{http_code}\n'`) → status `500` or `503`, body `{"error":"<CODE>","correlation_id":"<id>"}`, no `message` key.
3. `docker start debateai-v3-postgres-1`; wait for healthy; run any instrumented process to drain (FIX-01 step 4's command) → `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT runtime, capture_point, code, capture_status, component->>'route_template' FROM obs.occurrence WHERE source_event_ref = '<id from step 2>'"` → `api|http|<CODE>|SPOOLED|/v1/asks` (spooled, because Postgres was down at capture time — that is the point).
4. Stream abort: `curl -sk -N https://localhost:3000/v1/runs/<any run id>/events & sleep 1; kill %1` → the API process stays up; `SELECT count(*) FROM obs.occurrence WHERE runtime='api' AND capture_point='http' AND component->>'route_template' = '/v1/runs/:id/events'` increases by 1 within 5 s, with `run_ref` equal to the run id.
5. `curl -sk https://localhost:3000/v1/auth/login -X POST -d '{}' -H 'content-type: application/json' -w '\n%{http_code}\n'` → the same status and body as before the slice (V compares against the pre-slice recording in the handoff) and NO occurrence row with a zone route template exists: `SELECT count(*) FROM obs.occurrence WHERE component->>'route_template' LIKE '/v1/auth/%'` → `0`.
6. `node -e "import('./tests/support/zone-boundary.ts')"` is NOT how V checks the zone; instead: `git diff <base>..<tip> -- apps/api/src/index.ts | grep -c 'options.registration !== undefined'` → `0` (the block is not in the diff).

"V vetoes Done only after steps 1–6 match."

**Implementation — clusters:**

**C1 — zone-region byte-identity test first (the guard precedes every edit)** (R05, R06). Verify: `pnpm vitest run tests/architecture/fix04-zone-region.test.ts`
- [ ] 4.1 Record the pre-slice login response: `curl -sk https://localhost:3000/v1/auth/login -X POST -d '{}' -H 'content-type: application/json' -w '\n%{http_code}\n'` → paste into PROGRESS.md
- [ ] 4.2 Write `fix04-zone-region.test.ts`: `resolveZoneRouteMountRegion(readFileSync("apps/api/src/index.ts"))` at the slice base (via `git show <base>:apps/api/src/index.ts` into memory) equals the same resolution on the working file, byte-for-byte; the working file's diff hunks against base contain only lines inside the `setErrorHandler` callback and the `obs-context-hook` region (identified by the symbols `setErrorHandler` and `OBS_RUN_SCOPED_ROUTE_TEMPLATES`); the test never touches a zone path (assert by scanning its own source for `registration|mfa|recovery|sessions|account-erasure|legacy-claim|mail-channel` = 0 outside the symbol string above). Run → GREEN on the untouched tree (a positive control), then it guards every later step
- [ ] 4.3 Commit: `git commit -m "test(api): FIX-04 C1 — zone-region byte-identity guard"`

**C2 — installer import; error boundary emits first; correlation id** (R01, R02, R03, R07). Verify: `pnpm vitest run tests/integration/fix04-error-boundary.test.ts tests/architecture/fix04-zone-region.test.ts`
- [ ] 4.4 Write the integration test RED (Fastify `inject` with the embedded Postgres stopped or a failing pool stub): 500 body `{error, correlation_id}` and no `message`; `correlation_id === row.source_event_ref`; a 400 route body unchanged vs a recorded fixture; a route that starts streaming then throws → the emit spy fires before `reply.raw.destroy()`; `apps/api/src/main.ts`'s first statement is the installer import (source assertion)
- [ ] 4.5 Run → FAIL; edit `main.ts` line 1 and the `error-boundary` region only; run → GREEN; refute: move the emit after `reply.send` → the ordering assertion RED; revert
- [ ] 4.6 Commit: `git commit -m "feat(api): FIX-04 C2 — installer import, emit-before-write, correlation id"`

**C3 — obs-context-hook; three templates; zone declares nothing** (R04, R08, R09). Verify: `pnpm vitest run tests/integration/fix04-context-hook.test.ts`
- [ ] 4.7 Write the test RED: `inject` on each of the three run-scoped templates → the context spy shows `run` declared with the server-verified id; on `/v1/session`, `/v1/asks`, `/v1/auth/login`, `/v1/account/erasure` → context entered, nothing declared; `AuthFlowError` status/body identical to the pre-slice fixture; the hook does no classification (spy on the classifier = 0 calls on the request path)
- [ ] 4.8 Run → FAIL; add the module-level `OBS_RUN_SCOPED_ROUTE_TEMPLATES` table (three strings transcribed from L2-ADDENDUM-2 §4A.3) and one `api.addHook("onRequest", …)` in the `obs-context-hook` region; run → GREEN; refute: add `/v1/auth/login` to the table → RED; revert
- [ ] 4.9 `pnpm generate:contract && pnpm typecheck` delta 0; `pnpm audit:source` unchanged; commit `git commit -m "feat(api): FIX-04 C3 — request-scoped context, run declared on three templates"`

**Handoff gates, validate lanes, gate G1(FIX-04):** as Task 1; scrutiny lane re-runs the byte-identity test and greps the three tests for zone-file metadata calls (Batch-8). Real-surface lane = V's 6 steps. **Done = V's veto.** Post-merge: FIX-06 may dispatch (subject to F-7); the demo's stage 05 expected PASSED.

---

### Task 5: FIX-05 — Provider call surface

**Status: C1 PASS; C2/Done GATED on RP-0 and V acceptance.** C1 behavior landed at `7459c3fc`. Successor `SPEC-v2.md` / `PLAN-v2.md` corrected its missing direct package edge, and the reviewed correction is complete at `ecbad9d` with SPEC PASS / CODE QUALITY PASS. The isolated production-style provider deployment now resolves `@debateai/obs-capture`; the manifest, lock importer, and orphan-audit edge agree; provider runtime source is unchanged. Focused architecture passed 4/4 ×3, the corrected cluster passed 8/8, original behavior passed 5/5, adjacent tests passed 65/65, broader provider tests passed 26/26, and the manifest/lock/audit/deployed-edge mutants were killed. The loaded provider graph contains no `pg` or `@debateai/db`. Until V ratifies the `declared_gap` hash and the S02 addendum transcribes it, the honest durable output remains `self|CAPTURE_SELF|OBS_CAPTURE_SELF|true`; no Done claim is made. Accept after the integrated FIX-01/FIX-03 base and RP-0. Gate G1. Absorbs S11 (whole-file contract, H5-02) + the Tier-B `attempt` seam + Tier-A `ledger_entry`.

**Files:**
- Modify: `packages/providers/src/index.ts` (whole file; working region `call()` incl. the post-loop throws)
- Create: `tests/unit/fix05-provider-exhaustion.test.ts`, `tests/architecture/fix05-import-graph.test.ts`
- Read-only: `packages/obs-capture/src/{index,context,kinds}.ts`, `apps/runner/src/index.ts` (FIX-03)
- Forbidden: `apps/runner/**`, `apps/scheduler/**`, `packages/obs-capture/**` (no writes), the zone

**Interfaces:**
- Consumes: FIX-03's declared kinds (`attempt`, `ledger_entry`) and the ambient `run`/`work_item` seeded by the gateway seam; FIX-01's runtime
- Produces: exactly one occurrence per exhausted call at the post-loop throws: `{capture_point:'provider', taxonomy_class:'PROVIDER_EXHAUSTED', code: PROVIDER_CALL_FAILED|PROVIDER_CONTENT_UNACCEPTED (post RP-0), ledger_ref from lastLedgerEntryRef (kind ledger_entry), attempt_ref from a hoisted lastAttemptId (kind attempt), run_ref/work_item_ref inherited, template_parameters.attempt_count}`; a call that succeeds on retry emits nothing at `capture_point='provider'`

**Definition of done (VAL assertions):**

```
# VAL-FIX-05-001: One row per exhausted call, none on retry success; ids declared, never re-derived (R01, R02, R05)
Surface: artifact + data
Needs: FIX-01, FIX-03 merged
Behavior: the emit sits at the post-loop exhaustion throws; a call succeeding on attempt 2 emits nothing at capture_point='provider'; the row declares ledger_entry from lastLedgerEntryRef and attempt from the hoisted lastAttemptId and inherits run/work_item from context; attempt count in template_parameters; the ledger ref referenced, never copied
Evidence: `pnpm vitest run tests/unit/fix05-provider-exhaustion.test.ts` ×3 (stub gateway: 3 failures → 1 row; 1 failure + success → 0 rows; hoisted attempt id equals the last attempt's); acceptance step 4 (count = 1 for the run)

# VAL-FIX-05-002: The registered code lands once RP-0 is ratified; before that the row is honest and Done waits (R03)
Surface: data
Needs: VAL-FIX-00-001
Behavior: taxonomy_class='PROVIDER_EXHAUSTED'; code = PROVIDER_CALL_FAILED or PROVIDER_CONTENT_UNACCEPTED with fallback_minimized=f after RP-0 + S02 addendum; before that OBS_CAPTURE_SELF with fallback_minimized=t, recorded in the handoff
Evidence: acceptance step 3 (the observed state recorded verbatim)

# VAL-FIX-05-003: No prompt, payload, or parse text reaches obs.* or the spool; the gateway is unchanged with capture off (R04, R06)
Surface: data + artifact
Needs: none
Behavior: a planted question line (CANARY-QUESTION-4419) is absent from every text/jsonb column and every spool byte; return values, thrown classes, retry count and timing are unchanged with capture off; the resolve-hook trace of @debateai/providers shows ZERO pg, ZERO @debateai/db
Evidence: acceptance step 5; `pnpm vitest run tests/architecture/fix05-import-graph.test.ts` ×3; the unit test's with/without-capture equivalence assertions
```

**Acceptance criteria — V's 5 steps (verbatim from the frozen SPEC §5):**
1. Point the dev provider at a closed port (V edits the dev register value the runner reads, restarts the stack) and start a debate whose question line contains the token `CANARY-QUESTION-4419`.
2. The debate fails in the UI after the configured retries.
3. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT capture_point, taxonomy_class, code, fallback_minimized, run_ref, attempt_ref, ledger_ref FROM obs.occurrence WHERE capture_point='provider' ORDER BY occ_seq DESC LIMIT 1"` → `provider|PROVIDER_EXHAUSTED|PROVIDER_CALL_FAILED|f|<uuid>|<uuid>|<uuid>` (or `OBS_CAPTURE_SELF|t` if RP-0 is still unratified — record it; Done waits).
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM obs.occurrence WHERE capture_point='provider' AND run_ref = '<run_ref from step 3>'"` → `1` (one exhausted call, one row, however many attempts).
5. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM (SELECT o::text t FROM obs.occurrence o UNION ALL SELECT d::text FROM obs.occurrence_detail d) s WHERE t LIKE '%CANARY-QUESTION-4419%'"` → `0`; `grep -rc 'CANARY-QUESTION-4419' .obs-spool/ ; echo $?` → `1` (no match).

"V vetoes Done only after steps 1–5 match with the registered code in step 3."

**Implementation — clusters:**

**C1 — hoist `lastAttemptId`; emit at the two exhaustion throws; equivalence with capture off** (R01, R02, R05, R06). Verify: `pnpm vitest run tests/unit/fix05-provider-exhaustion.test.ts tests/architecture/fix05-import-graph.test.ts`
- [ ] 5.1 Write the unit test RED with a stubbed transport: (a) three failures → exactly one emit with `{capture_point:'provider', taxonomy_class:'PROVIDER_EXHAUSTED', ledger_ref, attempt_ref, template_parameters.attempt_count: 3}`; (b) failure then success → zero emits; (c) content rejection path → one emit with the rejection's ledger ref; (d) with the emitter absent, the thrown class, the retry count and the resolved value are identical to (a)/(b); (e) a prompt containing `CANARY-QUESTION-4419` never appears in any emitted envelope field; and the import-graph test RED: resolve trace of `@debateai/providers` has no `pg`, no `@debateai/db`
- [ ] 5.2 Run → FAIL; edit `call()`: hoist `let lastAttemptId` above the loop; at `:485`/`:493` (find by class name) call `emit(...)` inside `declare({attempt: lastAttemptId, ledger_entry: lastLedgerEntryRef})`; run → GREEN; refute: emit inside the loop → (b) RED; revert
- [ ] 5.3 `pnpm typecheck` delta 0; commit `git commit -m "feat(providers): FIX-05 C1 — one occurrence per exhausted call with declared attempt and ledger refs"`

**C2 — RP-0 state and handoff** (R03). Verify: acceptance step 3 on the live stack
- [ ] 5.4 Record in PROGRESS.md the observed `code|fallback_minimized` from step 3; if `OBS_CAPTURE_SELF|t`, write `Done: GATED — RP-0 unratified (t_4deda7ab)`; when RP-0 lands and the S02 addendum transcribes the two codes, re-run steps 1–5 and update

**Handoff gates, validate lanes, gate G1(FIX-05):** as Task 1; scrutiny lane confirms `git diff --stat` = one product file + two tests, no `packages/obs-capture` write. Real-surface lane = V's 5 steps. **Done = V's veto, only with the registered code.** Post-merge: demo stage 07 expected PASSED.

---

### Task 6: FIX-06 — Browser client surface (DISPATCH HELD)

**Status: NOT STARTED; DISPATCH HELD** on (a) FIX-04 merged (same file `apps/api/src/index.ts`) and (b) V's F-7 ruling. **F-7's premise has changed:** the 111 uncommitted `apps/ui` entries were committed as `3e7d83e9` (2026-09-01 23:30); ui-overhaul remains active on `apps/ui/**`; the hold is now a cross-mission working-set question, not an uncommitted-tree one — re-stated to V, still V's to rule. `error.tsx`, `global-error.tsx`, `apps/ui/lib/obs/`, `apps/api/src/obs-client-report.ts` all ABSENT; `ScoringErrorBoundary.tsx` and `apps/ui/lib/observability/README.md` exist. `install/ui-client.ts` landed (not an audit:source row). §K row 12: `ui_client` rows are report-and-count only, structurally fix-ineligible. Gate G1. Absorbs S09, S15 (D20).

**Files:**
- Create: `apps/ui/app/global-error.tsx`, `apps/ui/app/error.tsx`, `apps/ui/lib/obs/reporter.ts` (+ `enums.ts` fetched from the server), `apps/api/src/obs-client-report.ts`; `tests/integration/fix06-client-report.test.ts`, `tests/render/fix06-error-boundaries.test.tsx`, `tests/architecture/fix06-zone-region.test.ts`
- Modify: `apps/ui/components/ScoringErrorBoundary.tsx` (rewire to the reporter); `apps/api/src/index.ts` region `obs-client-report-mount` (ONE mount line STRICTLY AFTER the closing brace of the `if (options.registration !== undefined)` block); `apps/ui/lib/observability/README.md` (one paragraph)
- Read-only: `packages/obs-capture/src/registry/**` (served enumerations), `install/ui-client.ts`, `tests/support/zone-boundary.ts`
- Forbidden: the zone-route-mount region; the `error-boundary` and `obs-context-hook` regions (FIX-04); every zone file; **any other `apps/ui` file** (ui-overhaul's surface)

**Interfaces:**
- Consumes: FIX-04's merged `index.ts`; the registry's enumerations; FIX-01's runtime (rows persist)
- Produces: reporter payload `{ code, component, route_template, kind, build_ref? }` — every field a member of a server-served closed enumeration, never message/stack/URL/user id; `POST /v1/obs/client-report` (policy row `public`) accepting only enumeration members (else 400, nothing stored), assigning `build_ref` from the served bundle, storing `source='ui_client'`, `runtime='ui-client'`, `capture_point='client'`; rate limit keyed on a transient network-origin hash (in-memory salt rotated on restart) whose rejections count as a client-drop class in `obs.capture_gap`; `ui_client` rows excluded by construction from fingerprint maturity, tier eligibility and every fix path (FIX-09/12 assert against `source`)

**Definition of done (VAL assertions):**

```
# VAL-FIX-06-001: Two error boundaries and the scoring boundary report through one reporter that sends enumerations only (R01, R02)
Surface: browser + artifact
Needs: dev stack up; V's F-7 ruling
Behavior: global-error.tsx and error.tsx exist and use apps/ui/lib/obs; ScoringErrorBoundary is rewired; the request body has exactly the enumerated keys, no message, no stack, no URL text, no user identifier
Evidence: `pnpm vitest run tests/render/fix06-error-boundaries.test.tsx` ×3 (a thrown child → one reporter call with the closed key set; a payload containing `message` is impossible by type and rejected at runtime); acceptance step 3 (devtools body)

# VAL-FIX-06-002: The endpoint rejects non-members, assigns build_ref server-side, and stores ui_client rows (R03)
Surface: api + data
Needs: FIX-01 merged
Behavior: an unrecognized member → 400 and no row; a valid body → 202/204 and one row {runtime='ui-client', capture_point='client', source='ui_client', build_ref = the served bundle's, client value ignored}
Evidence: `pnpm vitest run tests/integration/fix06-client-report.test.ts` ×3; acceptance steps 4–5

# VAL-FIX-06-003: The mount sits after the zone block, which stays byte-identical; no zone-file metadata in any test (R04)
Surface: artifact
Needs: VAL-FIX-00-003 (B2)
Behavior: the mount line is inserted STRICTLY AFTER the closing brace of the registration block; resolveZoneRouteMountRegion() resolves identically before/after; the diff to index.ts contains no line of that block; no test reads/stats/lists/hashes a zone file
Evidence: `pnpm vitest run tests/architecture/fix06-zone-region.test.ts` ×3; acceptance step 7

# VAL-FIX-06-004: Rate-limited rejections are counted, never silent; ui_client is fix-ineligible; README amended (R05, R06, R07)
Surface: api + data + artifact
Needs: VAL-FIX-06-002
Behavior: 200 rapid posts → later 429s; obs.capture_gap gains a client-drop row with lost_count ≥ 1; the salt is in-memory and rotates on restart (no persisted salt file, no DB row); FIX-09's fold flags source='ui_client' incidents FIX_INELIGIBLE and FIX-12 never dispatches them; README gains the one paragraph (JSONL diagnostics file-only; obs is a separate class; no shared transport)
Evidence: acceptance step 6; a grep of apps/api/src/obs-client-report.ts for `writeFile|INSERT INTO obs.*salt` = 0; the README diff (+1 paragraph, nothing else)
```

**Acceptance criteria — V's 7 steps (verbatim from the frozen SPEC §5):**
1. Open `https://localhost:3000` in a browser, signed in; open the browser devtools Network panel.
2. Cause a real client fault in unmodified product code — the ARCH seat names the site with `path:line` evidence in PLAN.md (candidate, **UNVERIFIED by REQ-FIX**: a debate page whose run is erased while the page is open); V performs it → the error boundary renders; one `POST /v1/obs/client-report` appears in the Network panel with status `202`/`204`.
3. Inspect that request's body in devtools → only the enumerated keys, no `message`, no stack text, no URL text.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT runtime, capture_point, source, code, build_ref FROM obs.occurrence WHERE source='ui_client' ORDER BY occ_seq DESC LIMIT 1"` → `ui-client|client|ui_client|<enumerated code>|<server build ref>`.
5. `curl -sk https://localhost:3000/v1/obs/client-report -X POST -H 'content-type: application/json' -d '{"code":"NOT_A_MEMBER","component":"x","route_template":"/y","kind":"z"}' -w '\n%{http_code}\n'` → `400`; the occurrence count is unchanged.
6. `for i in $(seq 1 200); do curl -sk -o /dev/null https://localhost:3000/v1/obs/client-report -X POST -H 'content-type: application/json' -d '<a valid body from step 3>'; done` → later requests return `429`; `SELECT gap_class, lost_count FROM obs.capture_gap ORDER BY opened_at DESC LIMIT 1` → a client-drop class with `lost_count ≥ 1`.
7. `git diff <base>..<tip> -- apps/api/src/index.ts | grep -c 'options.registration !== undefined'` → `0`.

"V vetoes Done only after steps 1–7 match."

**Implementation — clusters:**

**C0 — the real client fault (ARCH names it before any code)** (acceptance step 2, U-F5)
- [ ] 6.1 (ARCH) name one client fault reachable in unmodified `apps/ui` with path:line evidence — candidate: `apps/ui/app/debate/[id]/page.tsx` rendering after the run is deleted via `DELETE /v1/debates/{id}` from a second tab; verify it throws inside a boundary today (reproduce with the stack up, record the console error); write it in `FIX-06/PLAN.md`

**C1 — endpoint with enumeration validation, server build_ref, transient-hash rate limit, counted drops** (R03, R05). Verify: `pnpm vitest run tests/integration/fix06-client-report.test.ts`
- [ ] 6.2 Write the test RED: non-member → 400, row count unchanged; valid → 202 and the row with `build_ref` = server's even when the body sends another; 200 posts from one origin → ≥ 1 `429` and one `capture_gap` row of a client-drop class with `lost_count ≥ 1`; restarting the module rotates the salt (two module instances hash the same origin differently)
- [ ] 6.3 Run → FAIL; write `apps/api/src/obs-client-report.ts` (zod enums built from the registry's served lists; policy row `public`; the limiter is its own — never `registration.ts`'s); add the ONE mount line after the registration block; run → GREEN
- [ ] 6.4 Commit: `git commit -m "feat(api): FIX-06 C1 — hardened client-report endpoint, counted drops"`

**C2 — zone-region guard** (R04). Verify: `pnpm vitest run tests/architecture/fix06-zone-region.test.ts`
- [ ] 6.5 Copy FIX-04's byte-identity test shape (base vs working via `git show`), add the assertion that the mount line's offset is greater than the block's closing-brace offset; run → GREEN; refute: move the mount inside the block → RED; revert; commit `git commit -m "test(api): FIX-06 C2 — client-report mount after the frozen zone block"`

**C3 — boundaries, reporter, scoring rewire, README** (R01, R02, R06, R07). Verify: `pnpm vitest run tests/render/fix06-error-boundaries.test.tsx`
- [ ] 6.6 Write the render test RED: `error.tsx` and `global-error.tsx` render a fallback and call `report()` once with exactly `{code, component, route_template, kind, build_ref?}`; `ScoringErrorBoundary` calls the same reporter; the reporter's TypeScript type has no `message`/`stack`/`url` field and a runtime guard drops unknown keys
- [ ] 6.7 Run → FAIL; write the three files under the Allowed list (Next.js app-router error boundaries; the reporter fetches the enumerations once from the server and never sends free text); append the README paragraph; run → GREEN; run the UI suites from `apps/ui/` and the mode-token gate (no new failures vs the pin); `pnpm typecheck` delta 0
- [ ] 6.8 Commit: `git commit -m "feat(ui): FIX-06 C3 — error boundaries, enumeration-only reporter, README paragraph"`

**Handoff gates, validate lanes, gate G1(FIX-06):** as Task 1; scrutiny lane confirms `git diff --stat apps/ui` touches exactly the five named files. Real-surface lane = V's 7 steps. **Done = V's veto.** Post-merge: demo stage 09 expected PASSED; FIX-09's fold and FIX-12's filter assert `ui_client` ineligibility.

---

### Task 7: FIX-07 — Blind-period visibility + capture OFF

**Status: C1-C5 PASS; V production acceptance pending.** Reviewed implementation head `02792604` received SPEC PASS / CODE QUALITY PASS with no open P0-P3. Focused FIX-07 passed 36/36 ×3, FIX-01/S01 194/194, adjacent 52/52, the 77-case loader matrix and hostile OFF-read matrix passed, and all required mutants were killed. No V production acceptance act is claimed. Gate G1 (D4 fully, D7 capture half).

**Supersession — authoritative pointer; non-executable here:** The former Task 7 `Files`, `Interfaces`, VAL assertions, six-step acceptance text, C1-C3 implementation body, and handoff are superseded in full and must not be executed. Use only `docs/missions/observability-agents/slices/FIX-07/SPEC-v7.md` and `docs/missions/observability-agents/slices/FIX-07/PLAN-v8.md` at controller `b5ae558bdff12011dbf6f74f2a3655cbae5c724c`, applied to reviewed implementation `02792604ad72233908d5461924d23edf5ea70925`. This live plan does not restate those successor semantics. The reviewed worker milestone is not acceptance: the production marker, production-facing query, veto, and acceptance remain V-only and unperformed.

---

### Task 8: FIX-08 — Secrets never stored + nine chaos cases (G1 exit criterion)

**Status: C1-C2 PASS; C3-C4 BLOCKED and non-executable.** The family runner and adversarial cases landed through `f9573394`. Controller correction `31e89d37` and code/test fix `c524612f` move row authority to the parent and reject child-output forgery. Replay hardening at `8e9442ff` makes verdict, receipt, and row-proof authority case-local and one-use. Fresh Sol review is PASS/PASS; focused tests are 34/34 ×3. C3-C4 may not dispatch until `VNOW-03`, reviewed successor authority, and the complete composed prerequisites named below exist. Gate: **G1 exit**.

**Files:**
- Create: `acceptance/obs/index.ts` (family `obs-g1`), `acceptance/obs/cases/{corpus,identity-canary,schema-manifest,chaos-*,grants,installer-graph,zone-timing,overhead}.ts`, `tests/integration/fix08-harness.test.ts`
- Modify: `acceptance/run-acceptance.ts` (one registration line)
- Read-only: every product and capture surface under test; `acceptance/README.md`, `acceptance/relay-core.ts` (spawn precedent)
- Forbidden: any product source; `tests/support/**`; listener sources; the zone (no metadata of any kind); the D12 demo

**Interfaces:**
- Consumes: FIX-01's runtime and installers (real processes spawned); the real role connection strings from env; FIX-02..05 surfaces as they merge
- Produces: `OBS_WRITER_DATABASE_URL=… OBS_SPOOL_DIR=… pnpm exec tsx acceptance/run-acceptance.ts --family obs-g1` printing one `PASS|FAIL|SKIP(missing: <path>)` line per case with measured counts; exit 0 only when no case is FAIL; the planted-token search command printed for V; calibration numbers for `obs.emitP99CeilingMs` (seed) and the zone-timing statistic (seed 200 requests/arm)

**Definition of done (VAL assertions):**

```
# VAL-FIX-08-001: One command, one line per case, SKIP names the missing path, FAIL exits 1, nothing fabricated (R01, R10, R11)
Surface: cli
Needs: FIX-01 merged
Behavior: the family is registered by one line; every case reports PASS/FAIL/SKIP(missing: <path>) with counts; a case whose subject is absent reports SKIP, never PASS; every asserted row was written by the real pipeline in a real spawned process
Evidence: acceptance step 1 output; a mutant that deletes runtime/index.ts → the surface cases print SKIP(missing: packages/obs-capture/src/runtime/index.ts), never PASS

# VAL-FIX-08-002: The adversarial corpus never lands, in rows or spool bytes; identity canaries never reach correlation columns; the schema has no free-text or user-linked column (R02, R03, R04)
Surface: data
Needs: FIX-01 merged (FIX-03 for the identity half)
Behavior: six token classes planted in message, cause (depth 3), own properties and stack-frame text of an error thrown inside a real instrumented process are absent from every obs.* text/jsonb column of the resulting rows AND from the raw bytes of every spool file (byte search); asker_id/session_id-shaped values never land in a correlation column; information_schema shows no obs.* column named/typed as free-text message and no user-linked column
Evidence: acceptance steps 2 and 4; the harness prints the exact search command V pastes

# VAL-FIX-08-003: Nine chaos cases keep the product's exit code equal to control and make every loss a counted row (R05, R07)
Surface: cli + data
Needs: FIX-01 merged
Behavior: DB unavailable · disk full + read-only fs · queue full · malformed/cyclic error object · 10× burst · redactor failure · recursive writer failure · crash during flush (batch fully present or fully absent, re-run recovers) · recovery + idempotent re-ingest — each with control_exit == capture_exit and loss explicit in capture_gap; installer import-graph: module-eval-reachable imports of install/*.ts are Node built-ins only; the `@debateai/db`-throws-at-import fixture still spools the boot throw
Evidence: acceptance step 3 (`control_exit == capture_exit`, `spooled ≥ 1, lost = 0`, `partial_batches = 0`); per-case lines

# VAL-FIX-08-004: Grants are proven on the REAL connection strings, by name for identity (R06)
Surface: data
Needs: env with the four role URLs
Behavior: debateai_obs_listener denied on obs.occurrence_detail, identity.* (asserted from information_schema.role_table_grants by name — no query against identity), core.run; no obs URL equals the product's; no role holds DELETE
Evidence: the grants case output listing each assertion

# VAL-FIX-08-005: Zone timing and emit overhead are measured through HTTP and printed as calibration evidence (R08, R09)
Surface: cli
Needs: dev stack up
Behavior: response-time distributions of the zone routes with capture on vs off show no statistically resolvable delta at n = 200 per arm (seed; V ratifies) — measured only through HTTP; p99 emit() cost and queue behaviour printed and recorded against obs.emitP99CeilingMs (seed)
Evidence: acceptance step 5; the printed distributions and statistic
```

**Acceptance criteria — V's 5 steps (verbatim from the frozen SPEC §5):**
1. `OBS_WRITER_DATABASE_URL=… OBS_SPOOL_DIR=$PWD/.obs-spool pnpm exec tsx acceptance/run-acceptance.ts --family obs-g1; echo "exit=$?"` → one line per case; every case `PASS` except surface families whose slice is not yet merged, which print `SKIP(missing: <path>)`; `exit=0` only when no case is `FAIL`.
2. The harness prints the planted tokens' search command; V pastes it: `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM (SELECT o::text t FROM obs.occurrence o UNION ALL SELECT d::text FROM obs.occurrence_detail d UNION ALL SELECT g::text FROM obs.capture_gap g) s WHERE t LIKE '%<token1>%' OR … "` → `0`; `grep -rc '<token1>\|<token2>\|…' .obs-spool/ ; echo $?` → `1`.
3. Chaos DB-down case output shows `control_exit == capture_exit` and `spooled ≥ 1, lost = 0`; crash-during-flush shows `partial_batches = 0`.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT count(*) FROM information_schema.columns WHERE table_schema='obs' AND (column_name ILIKE '%message%' OR column_name ILIKE '%asker%' OR column_name ILIKE '%session%')"` → `0`.
5. The zone-timing case prints both distributions and the test statistic; V reads "no resolvable delta at n=<ratified>".

"V vetoes Done only after steps 1–5 match."

**Implementation — clusters:**

**C1 — family skeleton, registration, SKIP semantics, no fabrication** (R01, R10). Verify: `pnpm vitest run tests/integration/fix08-harness.test.ts`
- [ ] 8.1 Write the test RED: `runFamily("obs-g1", {cases: [caseWithMissingSubject]})` prints `SKIP(missing: <path>)` and exit 0; a FAIL case → exit 1; a case cannot report PASS without a `rowsWrittenByPid` receipt from a spawned process (the runner refuses `PASS` when the evidence object lacks a real pid + occ_seq)
- [ ] 8.2 Run → FAIL; write `acceptance/obs/index.ts` (spawn helper modelled on `acceptance/relay-core.ts:122`, case contract `{name, subjectPaths[], run(): Promise<Verdict>}`), add the one registration line to `run-acceptance.ts`; run → GREEN; commit `git commit -m "feat(acceptance): FIX-08 C1 — obs-g1 family skeleton"`

**C2 — corpus, identity canaries, schema manifest** (R02, R03, R04). Verify: `pnpm exec tsx acceptance/run-acceptance.ts --family obs-g1 --only corpus,identity-canary,schema-manifest`
- [ ] 8.3 Write `cases/corpus.ts`: spawn a child that imports the real scheduler installer, arms, throws an error carrying six token classes (bearer/API-key shape, password in URL, email, JWT shape, private-key PEM header, a 6-digit code after "code") at message/cause depth 3/own property/stack frame; after flush + drain, byte-search every obs.* text/jsonb column of rows with that pid's `source_event_ref` prefix and every spool file; print the search command with the literal tokens; `cases/identity-canary.ts`: declare asker/session-shaped uuids → assert they never reach `run_ref|work_item_ref|attempt_ref|ledger_ref`; `cases/schema-manifest.ts`: the information_schema query = 0
- [ ] 8.4 Run → each prints PASS (or SKIP naming `packages/obs-capture/src/runtime/index.ts` before FIX-01 merges); refute: plant a token in a spool line manually → corpus FAIL; clean up; commit `git commit -m "feat(acceptance): FIX-08 C2 — adversarial corpus, identity canaries, schema manifest"`

**C3/C4 execution gate — non-executable legacy detail:** Steps 8.5-8.8 and the G1 EXIT handoff below are historical and do not authorize implementation. They become executable only after `VNOW-03` is ruled, reviewed successor authority exists, and the prerequisites in `fix08-c3-c4-preflight.md` are composed and recorded: the current reviewed FIX-01/FIX-02/FIX-03/FIX-05/FIX-07 endpoints plus FIX-08 C1/C2 (future composition must use reviewed FIX-05 `ecbad9d60987a28d479dd13062fa763048aed4d8`, not `7459c3fc`), completed FIX-04 for the real zone, an authority-approved installed-runtime fault port and clarified installer graph, parent-owned one-use exit/row/detail/gap/spool/timing proofs, and live bindings for the three C2 placeholders. The exact composed commit must retain C1/C2 at 34/34 ×3 before any C3 byte. Missing V credentials, HTTPS, statistical inputs, or real-surface acts remain V-only gates and cannot produce PASS.

**C3 — nine chaos cases + installer import graph** (R05, R07). Verify: `… --only chaos-*,installer-graph`
- [ ] 8.5 Write nine `cases/chaos-*.ts`, each spawning the control (no installer) and the capture run of the same failing job and comparing exit codes, then asserting the loss row: `db-down` (stop the embedded Postgres), `disk-full-ro` (a tmpfs of 1 MB / `chmod 555` spool dir → SPOOL_FAILURE counted), `queue-full` (capacity 1, 10 emits → QUEUE_FULL lost_count 9), `cyclic-error` (an error whose `cause` is itself), `burst-10x`, `redactor-failure` (inject a throwing redactor via the test seam), `recursive-writer` (a sink that throws on write → authority-proof gap), `crash-during-flush` (SIGKILL mid-batch → count batch rows: all or none; re-run recovers), `recovery-reingest` (drain twice → counts unchanged); `cases/installer-graph.ts`: resolve trace of each `install/*.ts` at module-eval = Node built-ins only; the `@debateai/db`-throws fixture still spools
- [ ] 8.6 Run → PASS/SKIP lines; commit `git commit -m "feat(acceptance): FIX-08 C3 — nine chaos cases, installer graph"`

**C4 — grants on real URLs, zone timing over HTTP, emit overhead** (R06, R08, R09). Verify: `… --only grants,zone-timing,overhead`
- [ ] 8.7 Write `cases/grants.ts` (four role URLs from env; `role_table_grants` by name for `identity.*`; `has_table_privilege` for `occurrence_detail`/`core.run`; no role has DELETE; URL inequality), `cases/zone-timing.ts` (200 requests per arm to `/v1/auth/login` with a `{}` body via HTTPS only; Mann–Whitney U printed; seed recorded), `cases/overhead.ts` (p99 of 10 000 `emit()` calls; queue depth trace; printed against `obs.emitP99CeilingMs`)
- [ ] 8.8 Run → lines; `pnpm typecheck` delta 0; commit `git commit -m "feat(acceptance): FIX-08 C4 — grants, zone timing, overhead calibration"`

**Handoff gates, validate lanes, gate G1 EXIT:** as Task 1; scrutiny lane confirms no product file in the diff and no zone metadata call in `acceptance/obs/**`. Real-surface lane = V's 5 steps once FIX-01..05, 07 have merged (before that, V reads the SKIP lines and the partial PASSes). **G1 closes when: every FIX-01..08 (and 16) slice is vetoed, the family prints no FAIL, and the demo (custodian-revised) shows stages 02–17 PASSED including 16.**

---

### Task 9: FIX-09 — Listener alive (policy bundle, daemon, watchdog, launchd)

**Status: C1-C3 PASS; C4 BLOCKED on V crypto/custody ruling and successor chain authority.** C1 is complete through `daa8908d`; fresh independent Sol review returned SPEC PASS / CODE QUALITY PASS with no P0-P3 findings. The focused C1 suite passed 79/79 ×3, exact authority attacks passed 3/3 ×3, and the canonical hash remains `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`. C2 authority was reconciled in successor SPEC/PLAN packets, including the listener-safe occurrence advisory lock, and the implementation plus review fixes are complete through `4d598fd9`; the final fresh Sol review returned SPEC PASS / CODE QUALITY PASS. The focused C2 unit + real-PostgreSQL suite passed 20/20 ×3, adjacent S01+C1 passed 91/91, and the ordering, fingerprint-version, leader/cap-one, exact-grant, and terminal-receipt mutants were killed. C3 is complete at `8619b9ab`; fresh Sol review returned SPEC PASS / CODE QUALITY PASS with no P0-P3 findings, focused tests passed 8/8 ×3, adjacent C1/C2 passed 99/99, and deterministic-payload, atomic rollback/replay, zero-budget, and no-model/import boundaries passed. C4 preflight stopped before edits: real occurrence/action writers do not populate chains, `agent_action` cannot represent the frozen partition, canonical bytes and key lifecycle are undefined, and HMAC verification would give the read-only watchdog forge authority. A V crypto/custody ruling, FIX-09/FIX-10 successor authority, and a freshly audited `0064` chain migration/library/writer slice must precede C4. Runtime/V acceptance remains pending; no production acceptance is claimed.

**Files:**
- Create: `tools/obs-listener/policy/{bundle.json, loader.ts, canonical.ts, custodian.ts}`, `tools/obs-listener/src/daemon/{main.ts, intake.ts, fold.ts, tier-gate.ts, cursor.ts, poison.ts, tracer-hook.ts}` (the `dispatch-arm` region RESERVED for FIX-12 — a named, empty export), `tools/obs-listener/src/watchdog/{main.ts, chain.ts, witness-log.ts}`, `tools/obs-listener/launchd/{com.dialectical-engine.fixagent-daemon.plist, com.dialectical-engine.fixagent-watchdog.plist}`, `tools/obs-listener/README.md`; `tests/unit/fix09-bundle.test.ts`, `tests/unit/fix09-fold.test.ts`, `tests/unit/fix09-tier-gate.test.ts`, `tests/integration/fix09-daemon.test.ts`, `tests/integration/fix09-watchdog-chain.test.ts`, `tests/architecture/fix09-no-model.test.ts`
- Read-only: `obs.*` via the listener/watchdog roles; `packages/obs-capture/src/registry/**`; `compose.dev.yaml`
- Forbidden: any product source; `tools/obs-listener/src/{obsctl,trace,board,notify,worker-diagnosis,worker-fix,landing,ingest-hatchet}/**`; `occurrence_detail`, `identity.*`, raw `core.run`; populating any deferred slot

**Interfaces:**
- Consumes: `obs.occurrence` (as `debateai_obs_listener` over `OBS_LISTENER_DATABASE_URL`, session-mode connection, no pooler), `obs.consumer_cursor('fixagent-daemon')`, `obs.incident`, `obs.policy_decision`, `obs.component_health`, `obs.agent_action.prev_link`
- Produces: the bundle format + loader (floor deny list as path globs; allowlist EMPTY; taxonomy pin; severity ladder `INFO < DEGRADED < SEVERE < FATAL`; routing table; register seeds; slots `zone_manifest_hash`/`hatchet_ingest`/`injection_corpus_hash` = UNSET with gate ids; `quick_arm = OFF`; ONE custodian); `bundleHash(canonicalProjection)` reproducible by a party who never saw the loader; the incident fold (one `obs.incident` per `(fingerprint, fingerprint_version)`; `distinct_work_unit_count` over distinct `(run_ref, work_item_ref)` pairs; the state machine `NEW → RESEARCHING(trace) → TICKETED → RESEARCHING(worker) → PROPOSED → APPROVED → FIXING → FIXED_UNVALIDATED → FIXED_VALIDATED | REGRESSED`, plus `ESCALATED`, `PARKED`; denial → PARKED; invalid proposal → TICKETED; `source_set`; `ui_client` folded but `FIX_INELIGIBLE`); the deterministic input-hashed tier gate → `{sizeLabel: QUICK|PR_FIX|ESCALATE, floorVerdict}` persisted in `obs.policy_decision`; `TracerHook` interface `{ onIncidentNew(incident): Promise<TraceVerdict> }` that FIX-11 implements; `DispatchArm` interface (empty in this slice) that FIX-12 fills; watchdog as `debateai_obs_watchdog` verifying heartbeat, cursor lag, keyed chain; launchd plists; `component_health` rows `fixagent-daemon`, `fixagent-watchdog`; config seam (URLs per role, spool/proof/key paths, CLI binary path, worktree path)

**Definition of done (VAL assertions):**

```
# VAL-FIX-09-001: The bundle is complete, reproducible, single-custodian, with slots explicitly UNSET and quick_arm OFF (R01, R02, R12)
Surface: artifact
Needs: none
Behavior: floor deny globs cover security-zone manifest paths, migrations/**, packages/crypto/**, scoring arithmetic/served-number writers, spend config, dependency manifests, register seeds, compose/env/CI/deploy files, tools/**, protocol docs, board state, obs' own code; allowlist EMPTY; taxonomy pin; severity ladder; routing; seeds; the three slots UNSET with gate ids RP-1/RP-2/RP-3; quick_arm=OFF; exactly ONE custodian; the hash is reproducible from the canonical projection by an independent script; a re-pin without the custodian token fails in drill
Evidence: `pnpm vitest run tests/unit/fix09-bundle.test.ts` ×3 (a second, loader-free script recomputes the hash; a re-pin attempt without the token → REFUSED); the bundle file

# VAL-FIX-09-002: The daemon consumes as the listener role with LISTEN + cursor reconcile, folds deterministically, and never calls a model (R03, R04, R06, R07, R11)
Surface: data + artifact
Needs: FIX-01 merged
Behavior: startup and every reconnect do LISTEN → reconcile cursor → process; NOTIFY carries occ_seq only as a hint; the cursor advances only after the fold; one incident per (fingerprint, fingerprint_version); work units counted as distinct (run_ref, work_item_ref) pairs; backlog severity-then-age; concurrency capped; a poison occurrence cannot block the cursor (dead-letter + component_health state='POISON' until FIX-12's channel exists); obs.budget_usage receives no rows; the resolve-hook trace shows no CLI spawn module and no @debateai/db; config is a seam (no product credential)
Evidence: `pnpm vitest run tests/unit/fix09-fold.test.ts tests/integration/fix09-daemon.test.ts tests/architecture/fix09-no-model.test.ts` ×3; acceptance steps 2–5

# VAL-FIX-09-003: The tier gate is deterministic, non-LLM, input-hashed, and in phase 1 only labels (R05)
Surface: artifact + data
Needs: none
Behavior: obs.policy_decision rows re-evaluate bit-identically from the same inputs; output = size label {QUICK, PR_FIX, ESCALATE} + floor verdict; ESCALATE (floor path, zone, unknown class, external root) never enters any fix path; QUICK and PR_FIX both route approval-first while quick_arm=OFF
Evidence: `pnpm vitest run tests/unit/fix09-tier-gate.test.ts` ×3 (1 000 random inputs evaluated twice → identical); acceptance step 5

# VAL-FIX-09-004: The watchdog is a separate process that FAILS LOUDLY on a forged link and can trip but never modify code (R08, R10)
Surface: cli + data
Needs: migration 0034 live
Behavior: as debateai_obs_watchdog it verifies the daemon heartbeat, cursor lag, and the keyed hash chain of obs.occurrence.prev_link / obs.agent_action.prev_link; passes on real histories; prints CHAIN_BREAK on a seeded forgery; appends chain heads to an append-only witness log; both processes upsert component_health rows each cycle
Evidence: acceptance steps 7–8; `pnpm vitest run tests/integration/fix09-watchdog-chain.test.ts` ×3

# VAL-FIX-09-005: launchd keeps both alive; kill -9 recovers within the seed (R09)
Surface: cli
Needs: V installs the plists (acceptance step 1)
Behavior: two distinct plists validated by plutil -lint; after kill -9 of either process it is running again within obs.daemonRestartMs (seed 10 000 ms; V ratifies); the cursor still follows faults afterwards
Evidence: acceptance steps 1, 6; `plutil -lint` output in the handoff
```

**Acceptance criteria — V's 8 steps (verbatim from the frozen SPEC §5):**
1. Install per the slice README (`launchctl bootstrap gui/$(id -u) tools/obs-listener/launchd/<daemon>.plist`, same for watchdog) → `launchctl list | grep -i obs` → two entries with PIDs.
2. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT last_occ_seq FROM obs.consumer_cursor WHERE consumer='fixagent-daemon'"` → an integer C.
3. Run FIX-01 step 4's failing job → within 5 s the same query → `> C` and equal to `SELECT max(occ_seq) FROM obs.occurrence`.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT state, distinct_work_unit_count, max_severity, source_set FROM obs.incident WHERE fingerprint = (SELECT fingerprint FROM obs.occurrence ORDER BY occ_seq DESC LIMIT 1)"` → `NEW|1|SEVERE or FATAL|["first_party"]`; run the job again → `distinct_work_unit_count` stays `1`? NO — the scheduler has no run/work item, so each run is its own work unit: it becomes `2`; the row count in `obs.incident` for that fingerprint stays `1`.
5. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT decision FROM obs.policy_decision ORDER BY evaluated_at DESC LIMIT 1"` → a size label and floor verdict (e.g. `PR_FIX|FLOOR_CLEAR`); `SELECT count(*) FROM obs.budget_usage` → `0`.
6. `kill -9 $(launchctl list | awk '/obs-daemon/ {print $1}')` → within 10 s `launchctl list | grep obs-daemon` shows a NEW pid; step 3 still works afterwards.
7. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT component, state, observed_at FROM obs.component_health WHERE component LIKE 'fixagent-%'"` → two rows, `observed_at` within the last cycle.
8. Forged link (test drill run by V): `pnpm exec vitest run tests/integration/fix09-watchdog-chain.test.ts` → the seeded-forgery case prints `CHAIN_BREAK` and the suite passes because the break was DETECTED.

"V vetoes Done only after steps 1–8 match."

**Implementation — clusters:**

**C1 — bundle format, loader, canonical hash, custodian token, interfaces frozen** (R01, R02, R11, R12). Verify: `pnpm vitest run tests/unit/fix09-bundle.test.ts`
- [ ] 9.1 Write the test RED: `loadBundle(path)` validates the zod schema (every section above present; `allowlist` length 0; slots `{value: null, gate: "RP-1"|"RP-2"|"RP-3"}`; `quick_arm: "OFF"`; `custodians.length === 1`); `bundleHash(b)` equals a hash computed by `tests/unit/fixtures/fix09-independent-hash.mjs` (a 20-line script using only `node:crypto` and JSON key-sorting); `repin(b, {token: wrong})` → `REPIN_REFUSED`; the floor deny list, applied to `packages/obs-capture/src/zone/manifest.ts`, `migrations/0000_s00.sql`, `packages/crypto/src/index.ts`, `package.json`, `compose.dev.yaml`, `tools/obs-listener/policy/bundle.json`, `.hermes/x` → every path DENIED
- [ ] 9.2 Run → FAIL; write `policy/**` and the two frozen interfaces (`TracerHook`, `DispatchArm`) in `src/daemon/tracer-hook.ts` and a named empty `dispatch-arm` export; run → GREEN; refute: add one allowlist entry → RED; revert
- [ ] 9.3 Commit: `git commit -m "feat(listener): FIX-09 C1 — policy bundle, canonical hash, custodian, frozen hook interfaces"`

**C2 — intake, cursor, LISTEN, fold, state machine, poison, backlog order** (R03, R04, R06). Verify: `pnpm vitest run tests/unit/fix09-fold.test.ts tests/integration/fix09-daemon.test.ts`
- [ ] 9.4 Write `fix09-fold.test.ts` RED: 5 occurrences (3 same fingerprint over 2 work units, 1 `ui_client`, 1 other) → 3 incidents; `distinct_work_unit_count = 2`; the `ui_client` incident flagged `FIX_INELIGIBLE`; every legal transition accepted and every illegal one rejected with a typed error (table-driven over the state machine); `PARKED` on denial; `TICKETED` on invalid proposal; the intake filter admits `capture_point='detector'` rows only when `component` names a code location (rows with `component = {}` are skipped and counted) — coded now, producer pending V-13
- [ ] 9.5 Write `fix09-daemon.test.ts` RED (embedded Postgres + 0034 + listener role): start → `LISTEN` issued → cursor reconciled to `max(occ_seq)` after folding; insert a row → cursor advances only after `obs.incident` reflects it; a poison row (corrupt frames JSON) → dead-lettered, `component_health` `state='POISON'`, cursor keeps advancing; backlog of mixed severities processed severity-then-age; concurrency cap honoured (spy on in-flight count ≤ cap)
- [ ] 9.6 Run → FAIL; write the daemon modules; run → GREEN ×3; refute: advance the cursor before the fold → RED; revert; commit `git commit -m "feat(listener): FIX-09 C2 — intake, cursor, fold, state machine, poison isolation"`

**C3 — tier gate; zero model** (R05, R07). Verify: `pnpm vitest run tests/unit/fix09-tier-gate.test.ts tests/architecture/fix09-no-model.test.ts`
- [ ] 9.7 Write the tests RED: 1 000 seeded random inputs evaluated twice → byte-identical `obs.policy_decision` payloads; floor-path root → `ESCALATE`; zone frame → `ESCALATE`; unknown class → `ESCALATE`; external root → `ESCALATE`; a small first-party root → `QUICK` label but `route: APPROVAL_FIRST` while `quick_arm=OFF`; the resolve trace of `src/daemon/main.ts` contains no `child_process` spawn of a CLI path, no `@debateai/db`, no `providers`; `obs.budget_usage` count stays 0 across a daemon run
- [ ] 9.8 Run → FAIL; write `tier-gate.ts` (pure function; input hash = sha256 of the canonical incident + bundle hash); run → GREEN; commit `git commit -m "feat(listener): FIX-09 C3 — deterministic tier gate, no model"`

**C4 — watchdog, chain verification, witness log, launchd, heartbeats** (R08, R09, R10). Verify: `pnpm vitest run tests/integration/fix09-watchdog-chain.test.ts`
- [ ] 9.9 Write the test RED: a real history of 50 rows verifies; one row's `prev_link` replaced by a forged value → `CHAIN_BREAK` printed and returned; the witness log gains one appended head per cycle and is never truncated (size monotone); the watchdog cannot open a write connection to any product table (its role grant check); both processes write their `component_health` rows each cycle
- [ ] 9.10 Run → FAIL; write `watchdog/**`, the two plists (`KeepAlive true`, `ThrottleInterval 10`, distinct labels/log paths), `README.md` (install/uninstall commands); `plutil -lint tools/obs-listener/launchd/*.plist` → OK; run → GREEN
- [ ] 9.11 `pnpm typecheck` delta 0; `pnpm audit:source` rows pasted (listener env reads noted under V-6); commit `git commit -m "feat(listener): FIX-09 C4 — watchdog chain verification, witness log, launchd"`

**Handoff gates, validate lanes, gate G2(FIX-09):** as Task 1; scrutiny lane greps the daemon tree for `occurrence_detail` (= 0) and confirms the `dispatch-arm` export is empty. Real-surface lane = V's 8 steps (V installs the plists). **Done = V's veto.** Post-merge: FIX-12 may dispatch (after FIX-10 merges too); demo stage 19 expected PASSED.

---

### Task 10: FIX-10 — One switch (`obsctl status/kill/arm`)

**Status: NOT STARTED; BLOCKED.** `tools/obs-listener/src/obsctl/**` ABSENT; no FIX-10 code exists. Single custodian = V. Do not dispatch: both `VNOW-04` and `VNOW-05` must be ruled and reviewed successor FIX-10 C0 authority must exist first. Gate G2 (D7 fully, with FIX-07). OBS-R106's DB-free requirement and the remaining contract require successor reconciliation before implementation.

**Legacy-detail supersession — non-executable:** The old `Files`, `Interfaces`, VAL assertions, six-step acceptance text, C1/C2 implementation checklist, and handoff below are historical and must not be executed or used to infer authority until the `VNOW-04`/`VNOW-05` rulings and reviewed successor C0 authority replace them. No option is selected here; all V production, key/custody, acceptance, merge, and push acts remain V-only.

**Files:**
- Create: `tools/obs-listener/src/obsctl/{main.ts, status.ts, kill.ts, arm.ts, markers.ts, witness.ts}` (regions `approve`/`deny`/`reveal-drift` RESERVED for FIX-12); `tests/integration/fix10-obsctl.test.ts`, `tests/architecture/fix10-no-model.test.ts`
- Read-only: `KILL`/`ARMED`/proof paths (written as the custodian act); daemon status surfaces; FIX-07's switch path
- Forbidden: `approve`/`deny`/`reveal-drift`/board-write regions (FIX-12); any model call; any product source; daemon/watchdog subtrees (FIX-09)

**Interfaces:**
- Consumes: FIX-07's capture OFF switch path (from `FIX-07/DECISIONS.md`); FIX-09's daemon status surface, `component_health`, cursor, bundle hash + custodian; `OBS_SPOOL_DIR`
- Produces: `obsctl kill` (writes the `KILL` marker on the filesystem, flips capture OFF; within `obs.killLatencyMs` seed 5000 the daemon stops processing, any worker lease is revoked and its process group killed, every armed runtime records `state='OFF'`); `obsctl arm` (custodian token + positive `ARMED` token; clears `KILL`, re-enables capture and daemon intake; MUTATION stays OFF; `quick_arm` untouched); `obsctl status` (per-runtime capture state + heartbeat age, daemon/watchdog liveness, cursor lag, open gaps, spool depth, mutation state, `quick_arm` state, bundle hash + custodian; DB unreachable → filesystem rows + `UNAVAILABLE`); every invocation appends `obs.agent_action {actor:'obsctl:<os user>', action_kind ∈ KILL|ARM|STATUS}` when reachable and a witness-log line always; the `arm --mutation` flag is FIX-13's (parsed as `NOT_IMPLEMENTED` here)

**Definition of done (VAL assertions):**

```
# VAL-FIX-10-001: kill stops everything within the seed, arm needs the custodian, mutation never comes on (R01, R02)
Surface: cli + data
Needs: FIX-07, FIX-09 merged
Behavior: kill writes KILL and flips capture OFF; within obs.killLatencyMs the daemon stops, leases are revoked, process groups killed, runtimes record OFF; arm requires the custodian token and a positive ARMED token, clears KILL, re-enables capture + intake; mutation stays OFF after any arm and any supervisor restart; quick_arm untouched by arm
Evidence: acceptance steps 2, 4, 5, 6; `pnpm vitest run tests/integration/fix10-obsctl.test.ts` ×3 (arm without token → REFUSED; after arm, status shows mutation OFF; a fake ARMED file without the keyed token → REFUSED)

# VAL-FIX-10-002: status is complete without a model, and degrades to filesystem rows when the DB is down; kill/arm never touch the DB (R03, R04, R07)
Surface: cli
Needs: none
Behavior: status prints every field in the Interfaces list; with the DB unreachable it prints filesystem-derived rows and marks the rest UNAVAILABLE, exit 0; kill and arm attempt no DB connection; the resolve-hook trace of obsctl shows no CLI spawn module and no @debateai/db
Evidence: acceptance steps 1, 4; `pnpm vitest run tests/architecture/fix10-no-model.test.ts` ×3; a socket spy during kill/arm = 0 connections

# VAL-FIX-10-003: The product is unaffected; every invocation is audited (R05, R06)
Surface: cli + data
Needs: FIX-01 merged
Behavior: a scheduler job before/during/after kill has identical exit codes and stderr bytes; the API answers the same status codes; each obsctl call appends an agent_action row when reachable and a witness line always
Evidence: acceptance steps 3, 5; the integration test's byte comparison and witness-log line count
```

**Acceptance criteria — V's 6 steps (verbatim from the frozen SPEC §5):**
1. `obsctl status` → a table with rows for `capture:scheduler`, `fixagent-daemon`, `fixagent-watchdog`, `mutation: OFF`, `quick_arm: OFF`, bundle hash, custodian `V`.
2. `obsctl kill` → prints `KILLED` within 5 s; `obsctl status` shows daemon `STOPPED`, capture `OFF` for every runtime; `launchctl list | grep obs-daemon` still shows the service (supervised but idle).
3. Run FIX-01 step 4's failing job → `exit=1`, same stderr as before; `SELECT count(*) FROM obs.occurrence` unchanged; `SELECT gap_class FROM obs.capture_gap ORDER BY opened_at DESC LIMIT 1` → `DISABLED`.
4. `docker stop debateai-v3-postgres-1`; `obsctl status` → filesystem rows present, database rows `UNAVAILABLE`, exit 0; `obsctl arm` → prompts for the custodian token, then `ARMED`; `docker start debateai-v3-postgres-1`.
5. Run the failing job again → the occurrence count increases by 1 within 5 s; `SELECT action_kind FROM obs.agent_action ORDER BY occurred_at DESC LIMIT 3` includes `KILL` and `ARM`.
6. `obsctl status` → `mutation: OFF` (it never came on).

"V vetoes Done only after steps 1–6 match."

**Implementation — clusters:**

**C1 — markers, kill, arm, custodian token, witness line** (R01, R02, R04, R06). Verify: `pnpm vitest run tests/integration/fix10-obsctl.test.ts`
- [ ] 10.1 Write the test RED: `kill` creates `KILL`, touches FIX-07's switch path, signals the daemon's process group (spy), prints `KILLED` within 5 000 ms, opens no socket; `arm` without the token → `REFUSED`; with the token → removes `KILL`, writes a keyed `ARMED` token (HMAC over time + custodian id), clears the switch; a planted `ARMED` file without a valid key → `REFUSED`; `mutation` remains `OFF` in the marker set after arm and after a simulated restart; a witness line is appended on every verb
- [ ] 10.2 Run → FAIL; write `markers.ts`, `kill.ts`, `arm.ts`, `witness.ts`, `main.ts` (verb table with `approve|deny|reveal-drift` reserved → `NOT_IMPLEMENTED_FIX12`); run → GREEN; refute: let `arm` set mutation ON → RED; revert
- [ ] 10.3 Commit: `git commit -m "feat(listener): FIX-10 C1 — obsctl kill/arm markers, custodian token, witness log"`

**C2 — status (DB and filesystem halves), agent_action rows, no model** (R03, R05, R06, R07). Verify: `pnpm vitest run tests/integration/fix10-obsctl.test.ts tests/architecture/fix10-no-model.test.ts`
- [ ] 10.4 Extend the test RED: `status` with the embedded DB up prints every listed field; with the DB stopped prints the filesystem rows (markers, spool depth from `OBS_SPOOL_DIR`, bundle hash) and `UNAVAILABLE` for the rest, exit 0; each verb inserts one `agent_action` row with `actor='obsctl:<os user>'` when reachable; the scheduler job spawned before/during/after `kill` → identical exit codes and stderr bytes; the resolve trace has no CLI spawn module and no `@debateai/db`
- [ ] 10.5 Run → FAIL; write `status.ts`; run → GREEN; `pnpm typecheck` delta 0; `pnpm audit:source` rows pasted; commit `git commit -m "feat(listener): FIX-10 C2 — obsctl status with filesystem fallback, audited invocations"`

**Handoff gates, validate lanes, gate G2(FIX-10):** as Task 1; scrutiny lane confirms the reserved regions are stubs. Real-surface lane = V's 6 steps (needs FIX-07 and FIX-09 merged). **Done = V's veto.** Post-merge: demo stage 18 expected PASSED; FIX-12 may dispatch (with FIX-09).

---

### Task 11: FIX-11 — Root traced, ticket filed

**Status: C1 BLOCKED on successor trace authority; C2 NOT STARTED and V-board gated.** A fresh preflight against the completed FIX-02/FIX-03/FIX-05/FIX-09 surfaces stopped before edits: inner cause codes live only in listener-denied `obs.occurrence_detail`, captured frames are empty, the FIX-09 daemon does not call `TracerHook` while this slice forbids daemon edits, opaque zone elision conflicts with the raw zone-frame fixture, two verdicts lack distinct predicates, and trace idempotency is unspecified. A successor must authorize an occurrence-level U-F4 projection, frame/opaque-zone producer contract, daemon hook call/transaction ordering, closed ten-verdict table, boundary/query accounting, and trace uniqueness before C1 dispatch. `tools/obs-listener/src/trace/**` and `src/board/**` remain absent. C2 still depends on V creating the `fixagent` board and is not dispatched under the no-Hermes execution constraint. Gate G2 (D9 fully).

**Files:**
- Create: `tools/obs-listener/src/trace/{walk.ts, verdict.ts, lineage.ts}`, `tools/obs-listener/src/board/{template.ts, writer.ts}`, `tools/obs-listener/escalations/README.md`; `tests/unit/fix11-trace.test.ts`, `tests/unit/fix11-template.test.ts`, `tests/integration/fix11-ticket.test.ts`
- Read-only: `obs.occurrence`, `obs.incident`, `obs.trace`; `tools/obs-listener/src/daemon/**` (FIX-09; the daemon calls the tracer through `TracerHook`)
- Forbidden: daemon internals; `obsctl`; `apps/replay`; any product source; `.hermes/**`; any board other than the F-2 board

**Interfaces:**
- Consumes: FIX-09's `TracerHook` interface and incident rows; `obs.occurrence.parent_occurrence_ref`/`cause_relation` (+ chain codes per the U-F4 ruling); the Hermes CLI `~/.local/bin/hermes kanban --board <slug> create|show|comment|list` (flags verified from `--help` at packet-write time: `create` takes `--body`; `comment` takes the body positionally, `--author`)
- Produces: `trace(incident) → TraceVerdict ∈ {CODE_ROOT, EXTERNAL_ROOT, ZONE_BOUNDARY, INSUFFICIENT_EVIDENCE, CAUSE_CYCLE, CAUSE_GAP, CAUSE_DEPTH_EXCEEDED, CORRUPT_LINEAGE, REPLAY_UNSUPPORTED, CAPABILITY_GAP}` within `obs.causeDepthMax` hops (seed 64) and a bounded query count; `CODE_ROOT` = repo-relative file + symbol from normalized frames; `EXTERNAL_ROOT` = boundary ∈ {provider_http, postgres_host, hatchet_engine, cli_subprocess} with evidence ids; every trace persisted to `obs.trace` BEFORE the incident leaves RESEARCHING; ONE ticket per incident via a fixed template whose input type has no free string field; later occurrences → ONE comment with the new count; ESCALATE verdicts → a structured intake candidate under `tools/obs-listener/escalations/`; `ui_client` incidents labelled `FIX_INELIGIBLE`

**Definition of done (VAL assertions):**

```
# VAL-FIX-11-001: The tracer is LLM-free, bounded, closed-vocabulary, and a zone frame terminates it (R01, R02, R05)
Surface: artifact + data
Needs: FIX-09 merged (hook); FIX-02/03 merged (chains)
Behavior: every trace ends in exactly one vocabulary member within causeDepthMax hops and a bounded query count; the walk uses a visited set (a seeded cycle → CAUSE_CYCLE); a zone-classified frame anywhere → ZONE_BOUNDARY with no root named; cross-run, future-sequence or build-mismatch joins → CORRUPT_LINEAGE; apps/replay is never invoked; no model adapter linked
Evidence: `pnpm vitest run tests/unit/fix11-trace.test.ts` ×3 (table-driven over the ten verdicts with fixture chains); a mutant removing the visited set → the cycle fixture hangs/RED under a step cap

# VAL-FIX-11-002: CODE_ROOT names path:symbol, never a message or absolute path; EXTERNAL_ROOT names a boundary and is never a fix target; every trace persists first (R03, R04)
Surface: data
Needs: VAL-FIX-11-001
Behavior: obs.trace carries verdict, evidence ids, visited path, query count, manifest versions before the incident leaves RESEARCHING; CODE_ROOT roots are repo-relative with a symbol; EXTERNAL_ROOT carries evidence ids and the tier gate marks it not a fix target
Evidence: acceptance steps 4–5; the integration test's ordering assertion (trace row exists when the state transition is observed)

# VAL-FIX-11-003: ONE ticket per incident on the F-2 board, rendered from a template with no free text, board-id read back, never .hermes, never a status change (R06, R07, R08, R09)
Surface: cli + artifact
Needs: board `fixagent` created by V
Behavior: first verdict → exactly one ticket via `hermes kanban --board fixagent create` with board-id read-back before and after (mismatch → refuse); recurrence → ONE comment with `count: N`, never a second ticket; the renderer's input type has no string field that is not an enumeration or an id; the body carries verdict, root, incident, fingerprint prefix, severity, size label, work-unit count, first/last seen, evidence ids, the paste-able V query; no absolute path, no message text; ESCALATE → a structured intake candidate file; ui_client → FIX_INELIGIBLE label; `.hermes/**` never written; no other board; no status change
Evidence: acceptance steps 1–3, 6; `pnpm vitest run tests/unit/fix11-template.test.ts tests/integration/fix11-ticket.test.ts` ×3 (a stub `hermes` binary on PATH recording argv; a mutant that passes a frame's raw text to the template → compile error)
```

**Acceptance criteria — V's 6 steps (verbatim from the frozen SPEC §5):**
1. Run FIX-01 step 4's failing job → within 10 s `hermes kanban --board fixagent list` (board name per F-2) shows one NEW ticket.
2. `hermes kanban --board fixagent show <ticket> --json | jq -r '.task.body'` → contains `verdict:`, `root:` with a repo-relative `path:symbol` or an `EXTERNAL_ROOT` boundary (for a bad database URL: `EXTERNAL_ROOT postgres_host` is the expected verdict), `incident:`, `fingerprint:`, the paste-able V query; contains NO `no_such_database`, NO `PLANTED-`, NO absolute path (`grep -c '/Users/'` → 0).
3. Run the failing job again → the same ticket has ONE new comment with `count: 2`; `hermes kanban --board fixagent list` shows no second ticket for that fingerprint.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT verdict, evidence->>'query_count' FROM obs.trace ORDER BY recorded_at DESC LIMIT 1"` → `EXTERNAL_ROOT|<n ≤ bound>`.
5. Code root: cause FIX-03's real failed run (unreachable provider) → its ticket's `root:` is `packages/providers/src/index.ts:<symbol>` or an `EXTERNAL_ROOT provider_http` — whichever the deterministic procedure yields; V reads the evidence ids and confirms they resolve: `SELECT code FROM obs.occurrence WHERE occurrence_id IN (<ids>)`.
6. `ls .hermes/ | wc -l` unchanged before/after; `hermes kanban --board observability-agents list` shows no ticket authored by the daemon.

"V vetoes Done only after steps 1–6 match."

**Implementation — clusters:**

**C1 — cause walk, verdict vocabulary, lineage bounds, persistence** (R01–R05). Verify: `pnpm vitest run tests/unit/fix11-trace.test.ts`
- [ ] 11.1 Write the test RED: fixture chains for each verdict (a first-party root with frames → `CODE_ROOT {path:'apps/scheduler/src/index.ts', symbol:'runLivenessSweep'}`; a pg connection error chain → `EXTERNAL_ROOT postgres_host`; a chain containing a frame under a `zone_path_prefixes` entry → `ZONE_BOUNDARY` and `root === null`; a self-referential parent → `CAUSE_CYCLE`; a missing parent → `CAUSE_GAP`; 65 hops → `CAUSE_DEPTH_EXCEEDED` with seed 64; a parent from another run / a future `occ_seq` / another `build_ref` → `CORRUPT_LINEAGE`; no frames and no chain → `INSUFFICIENT_EVIDENCE`); the query counter never exceeds the bound; `apps/replay` never imported (source scan)
- [ ] 11.2 Run → FAIL; write `walk.ts` (visited set, hop cap, query cap), `verdict.ts`, `lineage.ts` (per the U-F4 ruling: chain codes via `parent_occurrence_ref` on `obs.occurrence`; never `occurrence_detail`); run → GREEN; refute: remove the zone check → the ZONE_BOUNDARY fixture returns CODE_ROOT → RED; revert
- [ ] 11.3 Integration: persist to `obs.trace` inside the `TracerHook` before returning; assert in `fix11-ticket.test.ts` that the trace row exists before the incident's RESEARCHING → TICKETED event; commit `git commit -m "feat(listener): FIX-11 C1 — LLM-free tracer, closed verdicts, lineage bounds"`

**C2 — template renderer with a closed input type; board writer with read-back; escalations** (R06–R09). Verify: `pnpm vitest run tests/unit/fix11-template.test.ts tests/integration/fix11-ticket.test.ts`
- [ ] 11.4 Write the template test RED: `renderTicket(input)` where `input`'s type is `{incidentId: uuid, fingerprintPrefix: Hex8, severity: Severity, sizeLabel, verdict: Verdict, root: {path: RepoRelative, symbol: Identifier} | {boundary: Boundary}, workUnits: number, firstSeen, lastSeen, evidenceIds: uuid[], query: FixedQueryTemplate}` — a type-level test that assigning a raw `string` to any field fails to compile; the rendered body contains the required labels and no `/Users/`; the integration test RED with a stub `hermes` on PATH: first verdict → one `create` call with `--board fixagent`, preceded and followed by a board-id read (`show`/`list --json`) that must match; recurrence → one `comment` with `count: 2`; ESCALATE → a file under `tools/obs-listener/escalations/<incident>.json` with the intake shape; `ui_client` → title prefixed `FIX_INELIGIBLE`; no write under `.hermes/` (fs spy); board mismatch → refuse and record
- [ ] 11.5 Run → FAIL; write `board/template.ts`, `board/writer.ts`, `escalations/README.md`; run → GREEN; refute: skip the post-write read-back → RED; revert
- [ ] 11.6 `pnpm typecheck` delta 0; `pnpm audit:source` rows pasted; commit `git commit -m "feat(listener): FIX-11 C2 — one ticket per incident, closed template, board read-back, escalations"`

**Handoff gates, validate lanes, gate G2(FIX-11):** as Task 1; scrutiny lane greps the two subtrees for `.hermes`, `occurrence_detail`, `replay` = 0 and confirms the template input type has no bare `string` field. Real-surface lane = V's 6 steps with the real Hermes board. **Done = V's veto.** Post-merge: demo stage 20 expected PASSED. **G2 closes** when FIX-09, FIX-10, FIX-11 are vetoed (FIX-15 only if SPIKE-D1 passed).

---

### Task 12: FIX-12 — Diagnosis proposal, notify, approve/deny (it proposes and WAITS)

**Status: NOT STARTED.** `tools/obs-listener/src/{worker-diagnosis,notify}/**` ABSENT. An untracked controller RP-3 candidate exists with schema/version `debateai.fixagent-rp3-injection-corpus.v1`, 24 cases, and SHA-256 `8f2733e2ee202b7f1533cfd068063d1b5bf3ca52feb566def000e3a6987d113e`; it is not landed or V-pinned, so acceptance step 7 remains `PENDING RP-3` under `VLATER-RP3` (Task 0 step 0.6). Three absorbed tickets (S27, S18b, S23) have no ids (U-F2) — resolved in Task 0 before this ticket is minted. `sendmail` configuration on this Mac UNVERIFIED (U-F9) → optional. Dispatch **after FIX-09 and FIX-10 MERGE** (this slice fills their reserved regions). Gate G3 (D10 first half). R-E3 (Codex CLI per incident), R-E6-09, DR-179, OBS-R087/R088/R089/R102/R103 bind. **V-11 (observed) would replace this slice's wait with code-first; NOT adopted.**

**Files:**
- Create: `tools/obs-listener/src/worker-diagnosis/{spawn.ts, packet.ts, schema.ts, validate.ts, injection-drill.ts}`, `tools/obs-listener/src/notify/{osascript.ts, ticket-comment.ts, sendmail.ts}`; `tests/unit/fix12-packet.test.ts`, `tests/unit/fix12-proposal-schema.test.ts`, `tests/integration/fix12-dispatch.test.ts`, `tests/integration/fix12-tamper.test.ts`, `tests/integration/fix12-nothing-lands.test.ts`
- Modify: `tools/obs-listener/src/daemon/**` region `dispatch-arm` ONLY; `tools/obs-listener/src/obsctl/**` regions `approve`, `deny`, `reveal-drift`
- Read-only: `acceptance/relay-core.ts` (spawn precedent), the RP-3 corpus (`tools/obs-listener/corpus/**`; the current controller candidate is untracked and unpinned), `obs.budget_usage`, `obs.agent_action`
- Forbidden: every FIX-09 daemon region; FIX-10's `status/kill/arm` regions; `worker-fix`, `landing` (FIX-13); authoring the corpus; any write/credential/network beyond the CLI relay; any product source

**Interfaces:**
- Consumes: FIX-09's `DispatchArm` interface, incidents with `CODE_ROOT` + `FLOOR_CLEAR`, the tier gate's size label; FIX-10's marker set and custodian token; FIX-11's ticket id per incident; the Codex CLI at `/Applications/ChatGPT.app/Contents/Resources/codex` (`codex exec … </dev/null`, never `resume`)
- Produces: dispatch arm states `OFF | REPORT_ONLY_PROPOSAL` (default OFF after every restart; `obsctl arm --dispatch` needs the custodian token); per eligible incident ONE fresh Codex session with a read-only profile, no network beyond the CLI's own relay, no credentials, no subagents, fixed tool/query allowlist, bounded paths, deadline-killed; the validated incident packet (ids, codes, normalized frames, chain codes, the root — no free text exists to include); `FixProposal` schema `{incidentId, root, diagnosis: {defectClass: enum, params}, changeScope: RepoRelative[] within allowlist globs, sizeLabel, redTestPlan: {invariantRef}, blastRadius (daemon-computed from the module graph), spendUnits}` persisted as `obs.agent_action {action_kind:'PROPOSAL', action_ref: sha256(content)}`; any non-derivable field / disallowed tool call / out-of-bounds path = `VIOLATION` recorded and the proposal discarded; notification on every proposal (osascript + ticket comment; sendmail optional; failure = an occurrence `runtime='listener', capture_point='self'`); `obsctl approve <id>` → `APPROVED(hash)`; `obsctl deny <id> [reason]` → `DENIED`, incident PARKED; hash mismatch at any later read → `PROPOSAL_TAMPERED`, discarded, incident TICKETED; `obsctl reveal-drift` compares the live manifest hash to the bundle slot; caps as register rows `obs.listener.callsPerDay` 20 / `wallClockPerDiagnosisMs` 600 000 / `maxConcurrentDiagnoses` 1 (seeds); missing usage telemetry → `TELEMETRY_MISSING`, dispatch suspended until re-arm; **nothing lands** (no branch, no push, no file under `apps/**`/`packages/**`)

**Definition of done (VAL assertions):**

```
# VAL-FIX-12-001: Dispatch is OFF by default, armed only by the custodian, and spawns one fresh sandboxed Codex session per eligible incident with zero idle calls (R01, R02, R07, R10)
Surface: cli + data
Needs: FIX-09, FIX-10 merged
Behavior: after any supervisor restart the arm is OFF; `obsctl arm --dispatch` (token) → REPORT_ONLY_PROPOSAL, no other value; eligible = CODE_ROOT + FLOOR_CLEAR + not ui_client + not zone; one `codex exec` child per incident with stdin closed, scrubbed env (no credentials), read-only profile, deadline-killed; caps enforced as register rows; missing usage data → TELEMETRY_MISSING and suspension; the model adapter is a seam (lifting DR-179 changes only the adapter)
Evidence: `pnpm vitest run tests/integration/fix12-dispatch.test.ts` ×3 with a stub `codex` binary on PATH recording argv/env/stdin (argv contains `exec`, never `resume`; env lacks every key not in the allow-list); acceptance steps 1, 3 (budget_usage = 1 per dispatch)

# VAL-FIX-12-002: The packet carries no free text; the proposal is schema-validated and hashed; violations are recorded and discarded (R03, R04)
Surface: artifact + data
Needs: none
Behavior: the packet type has no free-string field; any field of the model's output not derivable from the input set, any tool call outside the allowlist, any path outside bounds → VIOLATION in agent_action and the proposal discarded; a valid proposal → agent_action PROPOSAL with action_ref = sha256(content); blast radius computed by the daemon, never taken from the model
Evidence: `pnpm vitest run tests/unit/fix12-packet.test.ts tests/unit/fix12-proposal-schema.test.ts` ×3 (fixtures: an output naming a file outside the allowlist → VIOLATION; an output with a `blast_radius` claim → ignored and recomputed)

# VAL-FIX-12-003: V is notified on every proposal; approve binds the hash; deny parks; tamper is refused (R05, R06)
Surface: cli + data + browser(macOS)
Needs: VAL-FIX-12-001
Behavior: osascript notification naming incident + proposal ids; a ticket comment beginning `PROPOSAL <id>`; sendmail optional; a notification failure is its own occurrence and never blocks; approve records APPROVED(hash) and comments APPROVED; deny records DENIED and moves the incident to PARKED; a later read with a mismatched hash → PROPOSAL_TAMPERED, discard, incident → TICKETED; reveal-drift compares manifest hash vs the bundle slot
Evidence: acceptance steps 2, 5, 6; `pnpm vitest run tests/integration/fix12-tamper.test.ts` ×3 (append-only table refuses in-place UPDATE — trigger error — so the drill seeds a mismatched stored hash through the test seam and asserts PROPOSAL_TAMPERED)

# VAL-FIX-12-004: Nothing lands, ever, in this slice (R09)
Surface: cli
Needs: VAL-FIX-12-003
Behavior: after N proposals and approvals, `git status --porcelain` and `git branch --list 'fixagent/*'` are unchanged; no push; no file under apps/** or packages/** modified
Evidence: acceptance steps 4–5; `pnpm vitest run tests/integration/fix12-nothing-lands.test.ts` ×3 (an fs spy on the repo root during a full dispatch+approve cycle = 0 writes outside tools/obs-listener state dirs)

# VAL-FIX-12-005: The pinned injection corpus yields zero violations across prompt, ticket text and notification text (R08)
Surface: cli
Needs: RP-3 pinned (Task 0 step 0.6)
Behavior: `injection-drill.ts` runs every corpus case through the worker path and the two renderers → `violations: 0 / <n>`
Evidence: acceptance step 7; until RP-3 is pinned the step is recorded `PENDING RP-3`
```

**Acceptance criteria — V's 7 steps (verbatim from the frozen SPEC §5):**
1. `obsctl arm --dispatch` → `DISPATCH: REPORT_ONLY_PROPOSAL`.
2. Cause FIX-03's real failed run (unreachable provider) → within `wallClockPerDiagnosisMs` a macOS notification appears naming `incident <id>` and `proposal <id>`; the incident's ticket on the F-2 board gains a comment beginning `PROPOSAL <id>`.
3. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT action_kind, action_ref, action_payload->>'size_label', action_payload->>'root' FROM obs.agent_action WHERE action_kind='PROPOSAL' ORDER BY occurred_at DESC LIMIT 1"` → `PROPOSAL|<sha256>|QUICK or PR_FIX|<repo-relative path:symbol>`; `SELECT count(*) FROM obs.budget_usage WHERE component='diagnosis-worker'` → `1`.
4. `git status --porcelain | wc -l` → the same number as before step 1; `git branch --list 'fixagent/*'` → empty.
5. `obsctl approve <id>` → `APPROVED <id> <hash>`; the ticket gains a comment `APPROVED`; still nothing in `git status`/branches (approval alone lands nothing — FIX-13 is not merged, or is unarmed).
6. `docker exec … -c "UPDATE obs.agent_action SET action_payload = action_payload || '{\"root\":\"x\"}' WHERE …"` → `ERROR: permission denied` or trigger refusal (append-only: tampering is impossible in place); instead V runs the slice's tamper drill `pnpm exec vitest run tests/integration/fix12-tamper.test.ts` → prints `PROPOSAL_TAMPERED` for the seeded mismatch.
7. `pnpm exec tsx tools/obs-listener/src/worker-diagnosis/injection-drill.ts` (reads the pinned corpus) → `violations: 0 / <n> cases`.

"V vetoes Done only after steps 1–7 match."

**Implementation — clusters:**

**C1 — packet type, proposal schema, validation, hash** (R03, R04). Verify: `pnpm vitest run tests/unit/fix12-packet.test.ts tests/unit/fix12-proposal-schema.test.ts`
- [ ] 12.1 Write the tests RED: `buildPacket(incident, trace)` returns an object whose zod schema forbids any string longer than an identifier except enum members (type-level test: no `z.string()` without `.regex`/enum in `schema.ts`); `validateProposal(output, packet, bundle)` → VIOLATION on: a file outside allowlist globs, a file in a deny glob, a `diagnosis.defectClass` not in the enum, a field absent from the derivable set, a tool call outside the allowlist, a path outside bounds; a valid output → `{ok, hash: sha256(canonical)}`; `blastRadius` always recomputed from the module graph (the model's value ignored)
- [ ] 12.2 Run → FAIL; write `packet.ts`, `schema.ts`, `validate.ts`; run → GREEN; refute: accept the model's `blast_radius` → RED; revert; commit `git commit -m "feat(listener): FIX-12 C1 — free-text-free packet, FixProposal schema, validation, hash"`

**C2 — dispatch arm, Codex spawn, caps, telemetry fail-closed, nothing lands** (R01, R02, R07, R09, R10). Verify: `pnpm vitest run tests/integration/fix12-dispatch.test.ts tests/integration/fix12-nothing-lands.test.ts`
- [ ] 12.3 Write the tests RED with a stub `codex` on PATH: arm OFF after a simulated restart; `arm --dispatch` without token → REFUSED; with token → REPORT_ONLY_PROPOSAL; an eligible incident → exactly one child `codex exec …` with `stdin` closed, env ⊆ allow-list, cwd = a scratch dir, killed at the deadline (fake timers); an ineligible incident (EXTERNAL_ROOT, ui_client, zone) → no child; caps: 21st call in a day → refused, recorded; a stub returning no usage → `TELEMETRY_MISSING` + arm suspended; an fs spy on the repo root during dispatch + approve = 0 writes outside the listener state dir; `git status --porcelain` and `git branch --list 'fixagent/*'` unchanged
- [ ] 12.4 Run → FAIL; fill the `dispatch-arm` region and write `spawn.ts` (modelled on `acceptance/relay-core.ts:69,122,131` env scrub and stdin close; adapter interface `DiagnosisModelPort` with the Codex CLI adapter); run → GREEN; refute: pass `resume` → the argv assertion RED; revert; commit `git commit -m "feat(listener): FIX-12 C2 — dispatch arm, fresh sandboxed Codex session per incident, caps, nothing lands"`

**C3 — notifications; obsctl approve/deny/reveal-drift; tamper refusal** (R05, R06). Verify: `pnpm vitest run tests/integration/fix12-tamper.test.ts tests/integration/fix12-dispatch.test.ts`
- [ ] 12.5 Write the tests RED: on PROPOSAL → one `osascript` argv (stub) naming both ids + one `hermes kanban … comment` beginning `PROPOSAL <id>`; `sendmail` only when configured; an osascript failure → an occurrence `{runtime:'listener', capture_point:'self'}` and the proposal still stored; `obsctl approve <id>` → agent_action `APPROVED` with the hash + ticket comment `APPROVED`; `obsctl deny <id> reason` → `DENIED` + incident PARKED; a stored hash seeded to mismatch → `PROPOSAL_TAMPERED`, proposal discarded, incident TICKETED; `reveal-drift` → prints the live manifest hash vs the slot (UNSET → `SLOT_UNSET RP-1`)
- [ ] 12.6 Run → FAIL; write `notify/**` and the three obsctl regions; run → GREEN; `pnpm typecheck` delta 0; `pnpm audit:source` rows pasted; commit `git commit -m "feat(listener): FIX-12 C3 — notify V on every proposal, approve/deny/reveal-drift, tamper refusal"`

**C4 — injection drill (PENDING RP-3 / `VLATER-RP3`)** (R08). Verify: `pnpm exec tsx tools/obs-listener/src/worker-diagnosis/injection-drill.ts`
- [ ] 12.7 Write `injection-drill.ts` reading `tools/obs-listener/corpus/**` and requiring its landed, V-pinned hash (refuses to run on a hash mismatch); runs every case through `buildPacket → validateProposal` with a stub model that echoes the payload, and through the ticket and notification renderers; prints `violations: k / n`; while the existing 24-case controller candidate is unlanded or not V-pinned it prints `PENDING RP-3` and exits 2; commit `git commit -m "feat(listener): FIX-12 C4 — injection drill over the pinned corpus"`

**Handoff gates, validate lanes, gate G3:** as Task 1; scrutiny lane greps the diff for any path under `apps/`/`packages/` (must be empty), for `resume`, for provider hostnames and API-key env names (= 0). Real-surface lane = V's 7 steps (step 7 PENDING RP-3). **Done = V's veto. G3 closes on it.** Demo stage 21 first half expected PASSED.

---

### Task 13: FIX-13 — Approval-first fix; it waits

**Status: NOT STARTED.** `tools/obs-listener/src/{worker-fix,landing}/**`, `sandbox/**`, `catalog/**` ABSENT. The G4 entry acts have not been performed (branch protection, bot identity, ruleset hash, IC-3 forge fixture) — the **default local form (F-14 a) needs none of them**. **F-14 is still open; rows V-9/V-11 (observed) propose the remote form and code-first — NOT adopted; the frozen local-branch, approve-first default stands.** `dev`'s "86 commits ahead of origin" figure (2026-09-01) is UNVERIFIED at today's HEAD. Dispatch after FIX-12 merges. Gate G4 (D10 fully). OBS-R095, R099–R101, R104, R110, R112–R114, R117, R118, IC-3, RT-22, RT-26, RT-30 bind. **Never `main`; never a direct write to `dev`.**

**Files:**
- Create: `tools/obs-listener/src/worker-fix/{spawn.ts, profile.ts}`, `tools/obs-listener/src/landing/{validate-patch.ts, worktree.ts, prove.ts, present.ts, lease.ts}`, `tools/obs-listener/sandbox/{fix-worker.sb, README.md}` (macOS `sandbox-exec` profile denying read/write/create/traverse/stat on the OBS-R104 set and all git credentials, no network), `tools/obs-listener/catalog/{README.md, catalog.json}` (format only; **V authors entries**); `tests/integration/fix13-arm.test.ts`, `tests/unit/fix13-validate-patch.test.ts`, `tests/integration/fix13-prove.test.ts`, `tests/integration/fix13-present.test.ts`, `tests/integration/fix13-kill.test.ts`, `tests/integration/fix13-forge-fixture.test.ts`
- Modify: `tools/obs-listener/src/obsctl/arm.ts` (the `--mutation` flag, custodian token)
- Read-only: the pinned base SHA; the catalog; the branch-protection ruleset hash (remote form only)
- Forbidden: the OBS-R104 set; custodian tokens; the diagnosis-worker subtree; `main`; any direct write to `dev`

**Interfaces:**
- Consumes: FIX-12's `APPROVED(hash)` proposals and `obsctl` marker set; FIX-09's bundle (allowlist EMPTY today — so **no proposal can pass R04 until V re-pins a non-empty allowlist with an evidence packet per entry**; record this as the first thing V does at G4 entry), floor deny globs, `quick_arm`; FIX-10's `kill`
- Produces: `obsctl arm --mutation` (custodian token; OFF after any restart; `quick_arm` untouched); the fix worker (fresh Codex session, separate OS user, sandbox profile, no network) returning ONLY a patch file from the approved proposal + a pinned base SHA; patch validation (allowlist globs ∧ ¬deny; exactly one root; no dependency/manifest/register/compose/CI/`tools/**`/zone/obs-own-code path; test changes weaken no assertion/snapshot/lint/gate; the RED test derives from a human-owned invariant (RT-30) and its command comes from the catalog (OBS-R101)); the proof in an isolated worktree at the pinned base (dirty tree aborts, OBS-R112): RED on base MUST FAIL, GREEN after MUST PASS, plus catalog gates, in the sandbox, outputs captured verbatim; presentation = branch `fixagent/<incident-hash>` with exactly one revertible commit + the OBS-R114 template as a ticket comment + `obs.agent_action PR_PRESENTED`; the daemon holds no merge permission; incident moves only on V's merge (a commit on `dev` containing the branch tip) or `obsctl deny`; kill mid-flight revokes the lease, kills the group, creates no branch; one active mutation per repository and per fingerprint; every worker read/tool call/file/diff/test/branch/spend/denial/kill appended to `agent_action`

**Definition of done (VAL assertions):**

```
# VAL-FIX-13-001: Mutation is armed only by the custodian, defaults OFF, and only an unmodified APPROVED proposal is coded, one at a time (R01, R02)
Surface: cli + data
Needs: FIX-12 merged
Behavior: `obsctl arm --mutation` requires the token; OFF after any restart; quick_arm stays OFF; a proposal whose stored hash no longer matches → PROPOSAL_TAMPERED and no worker spawned; a second mutation on the same fingerprint or repository while one is active → refused (OBS-R110); an EXTERNAL_ROOT incident → NOT_A_FIX_TARGET
Evidence: acceptance steps 1–2; `pnpm vitest run tests/integration/fix13-arm.test.ts` ×3

# VAL-FIX-13-002: The worker is contained (separate OS user, sandbox, no network, no credentials) and returns only a patch; the IC-3 forge fixture is provably contained (R03, R09)
Surface: cli
Needs: sandbox profile installed; a second OS user provisioned by V
Behavior: the worker cannot read tokens/KILL/ARMED/proof/bundle/keys, cannot mint a fake ARMED, plant a proof, plant git credentials, mint a fake bundle, or open a network socket; any planted artifact fails keyed verification; the worker's only output is a patch file
Evidence: acceptance step 7 (`fix13-forge-fixture.test.ts`: every attempt CONTAINED, artifacts INVALID); `sandbox-exec -f fix-worker.sb` denial log lines

# VAL-FIX-13-003: The patch is validated against the bundle and the catalog before any proof (R04)
Surface: artifact
Needs: a non-empty allowlist (V's re-pin)
Behavior: every touched path ∈ allowlist ∧ ∉ deny; exactly one root addressed; no manifest/register/compose/CI/tools/zone/obs-own path; test changes weaken no assertion, snapshot, lint or gate (diff parser: removed `expect`/`assert` lines, `.skip`, `--passWithNoTests`, snapshot deletions → REFUSED); the RED test names a catalog invariant id and the test command is the catalog's
Evidence: `pnpm vitest run tests/unit/fix13-validate-patch.test.ts` ×3 with fixture patches for each refusal class

# VAL-FIX-13-004: RED on base fails, GREEN after passes, in an isolated worktree at the pinned SHA, outputs verbatim; a dirty tree aborts (R05)
Surface: cli + data
Needs: VAL-FIX-13-003
Behavior: a worktree is created at the pinned base; a dirty baseline aborts with OBS_R112_DIRTY_BASE; the catalog command runs on base (must FAIL) and after the patch (must PASS) plus the catalog's gates, inside the sandbox; raw outputs attached to the presentation; a patch whose RED passes on base → REFUSED (no failing evidence)
Evidence: `pnpm vitest run tests/integration/fix13-prove.test.ts` ×3 (fixture repo with a seeded defect and its catalog entry); acceptance step 4's RED/GREEN summaries

# VAL-FIX-13-005: Presentation waits: one branch, one commit, the OBS-R114 template on the ticket, PR_PRESENTED in agent_action, nothing merged, no push; kill mid-flight leaves no branch (R06, R07, R08, R10)
Surface: cli + data
Needs: VAL-FIX-13-004
Behavior: `git branch --list 'fixagent/*'` = exactly one; `git log dev..fixagent/<hash> --oneline | wc -l` = 1; diff confined to the declared scope; the newest ticket comment begins PR_PRESENTED with every template field (incident/fingerprint · root + evidence ids · causal path · RED command + result on base · diff scope · GREEN gates · privacy/forbidden-surface attestations · blast radius · size label · what was not changed · spend · revert command), no raw error text; `git status --porcelain` and `git log dev -1` unchanged; `obsctl kill` during FIXING → lease revoked, group killed, branch count unchanged, ticket shows LEASE_REVOKED; every worker action appended to agent_action; the incident moves to FIXED_UNVALIDATED within one cycle after V's local merge
Evidence: acceptance steps 3–6, 8; `pnpm vitest run tests/integration/fix13-present.test.ts tests/integration/fix13-kill.test.ts` ×3
```

**Acceptance criteria — V's 8 steps (verbatim from the frozen SPEC §5):**
1. `obsctl arm --mutation` → `MUTATION: ON`; `obsctl status` → `quick_arm: OFF`.
2. With an `APPROVED` proposal from FIX-12 step 5 whose root is a real, small code defect (V chooses one; the bad-URL incident is `EXTERNAL_ROOT` and will be REFUSED with `NOT_A_FIX_TARGET` — V checks that refusal first: `obsctl status` shows `incident <id>: EXTERNAL_ROOT — no fix path`).
3. Within the wall-clock cap: `git branch --list 'fixagent/*'` → exactly one branch; `git log dev..fixagent/<hash> --oneline | wc -l` → `1`; `git diff dev..fixagent/<hash> --stat` → only allowlisted paths, ≤ the proposal's declared scope.
4. The ticket's newest comment begins `PR_PRESENTED` and carries every template field; `RED on base:` shows a failing test summary; `GREEN:` shows the passing summary; `revert:` shows a command.
5. `git status --porcelain | wc -l` → unchanged from before step 1 (the daemon's worktree is elsewhere); `git log dev -1 --format=%h` → unchanged (nothing merged).
6. Kill drill: approve a second proposal, run `obsctl kill` within 5 s of `FIXING` appearing in `obsctl status` → `git branch --list 'fixagent/*' | wc -l` unchanged; the ticket shows `LEASE_REVOKED`.
7. `pnpm exec vitest run tests/integration/fix13-forge-fixture.test.ts` → every forge attempt reported `CONTAINED`, planted artifacts `INVALID`.
8. V merges the branch locally (`git merge --no-ff fixagent/<hash>`), tests personally, and observes the incident move to `FIXED_UNVALIDATED` within one daemon cycle.

"V vetoes Done only after steps 1–8 match."

**Implementation — clusters:**

**C1 — `arm --mutation`, single-active-mutation lease, hash re-check, NOT_A_FIX_TARGET** (R01, R02). Verify: `pnpm vitest run tests/integration/fix13-arm.test.ts`
- [ ] 13.1 Write the test RED: token gating; OFF after restart; `quick_arm` untouched; tamper → refuse; EXTERNAL_ROOT → NOT_A_FIX_TARGET; a second lease on the same fingerprint → refused; a lease is a file under the listener state dir with pid + fingerprint + expiry
- [ ] 13.2 Run → FAIL; extend `obsctl/arm.ts`, write `landing/lease.ts`; run → GREEN; commit `git commit -m "feat(listener): FIX-13 C1 — mutation arm, single lease, approved-hash re-check"`

**C2 — sandbox profile, worker spawn as a separate OS user, IC-3 forge fixture** (R03, R09). Verify: `pnpm vitest run tests/integration/fix13-forge-fixture.test.ts`
- [ ] 13.3 Write `sandbox/fix-worker.sb` (deny default; allow read of the worktree only; deny read/stat of the OBS-R104 set — tokens, `KILL`, `ARMED`, proof, bundle, keys, `~/.gitconfig`, `~/.config/gh`, `~/.ssh`; deny network); write the forge fixture test RED: a script run under the profile as the worker attempts each forbidden act → every attempt errors (CONTAINED); a planted `ARMED`/proof/bundle file lacks the HMAC → INVALID under FIX-10's `markers.ts` verification
- [ ] 13.4 Run → FAIL (no profile); land the profile and `worker-fix/spawn.ts` (`sudo -u <fixworker> sandbox-exec -f … codex exec … </dev/null`, the user provisioned by V and recorded in DECISIONS.md); run → GREEN; commit `git commit -m "feat(listener): FIX-13 C2 — sandboxed fix worker, IC-3 forge fixture"`

**C3 — patch validation against bundle + catalog** (R04). Verify: `pnpm vitest run tests/unit/fix13-validate-patch.test.ts`
- [ ] 13.5 Write the test RED with fixture patches: outside allowlist → REFUSED; deny glob → REFUSED; two roots → REFUSED; `package.json` → REFUSED; a removed `expect(` line → REFUSED_WEAKENS_TEST; `.skip(` added → REFUSED; a RED test without a catalog invariant id → REFUSED; a valid one → OK with the catalog command
- [ ] 13.6 Run → FAIL; write `landing/validate-patch.ts` and `catalog/README.md` + `catalog.json` format (`{invariants: [{id, description, command, ownedBy: "V"}]}`, empty by default — V authors); run → GREEN; commit `git commit -m "feat(listener): FIX-13 C3 — patch validation against bundle and human-owned catalog"`

**C4 — worktree proof RED→GREEN; presentation; wait; kill; merge detection** (R05–R08, R10). Verify: `pnpm vitest run tests/integration/fix13-prove.test.ts tests/integration/fix13-present.test.ts tests/integration/fix13-kill.test.ts`
- [ ] 13.7 Write the tests RED against a fixture git repo (seeded defect + catalog entry): dirty base → abort; RED passes on base → REFUSED; RED fails then GREEN passes → a branch `fixagent/<hash>` with one commit whose diff = the patch; the template comment (stub hermes) has every field and no raw error text; `agent_action PR_PRESENTED`; `git log dev -1` unchanged; a kill during the proof → no branch, LEASE_REVOKED comment; after a `git merge --no-ff` on the fixture's `dev`, the next daemon cycle moves the incident to FIXED_UNVALIDATED; every worker step appended to `agent_action`
- [ ] 13.8 Run → FAIL; write `landing/{worktree,prove,present}.ts`; run → GREEN ×3; `pnpm typecheck` delta 0; `pnpm audit:source` rows pasted; commit `git commit -m "feat(listener): FIX-13 C4 — worktree proof, presentation that waits, kill, merge detection"`

**Handoff gates, validate lanes, gate G4:** as Task 1; scrutiny lane confirms no `git push` string anywhere in the slice (`grep -rn "push" tools/obs-listener/src/landing` = 0 outside comments), no write to `dev`/`main` refs, and that the catalog ships empty. Real-surface lane = V's 8 steps (V provisions the worker OS user, re-pins a non-empty allowlist with an evidence packet per entry, and authors ≥ 1 catalog invariant first — three G4-entry acts for the local form). **Done = V's veto. G4 closes on it.** Demo stage 21 fully PASSED.

---

### Task 14: FIX-14 — QUICK arm behind V's switch (FROZEN; NOT DISPATCHED in phase 1)

**Status: NOT STARTED; DISPATCH GATED on V flipping `quick_arm`.** Nothing exists (the slot is born in FIX-09). Precondition (b) needs ≥ 10 V-merged approval-first fixes (seed) with ≥ 0.9 agreement — **zero exist**. This task exists in the plan so the switch, its default and the seven preconditions are frozen now; the OFF half is V-runnable after FIX-13.

**Files (when dispatched):** `tools/obs-listener/src/{worker-fix,landing}/**` QUICK/canary regions (additive), `tools/obs-listener/policy/**` slot `quick_arm` consumers, `tests/integration/fix14-*.test.ts`. Forbidden: the OBS-R104 set; editing register values; `main`.

**Definition of done (VAL assertions):**

```
# VAL-FIX-14-001 (OFF half, runnable after FIX-13): quick_arm is a bundle slot, default OFF, changed only by the custodian's re-pin, audited, visible; while OFF the whole slice is unreachable (R01, R07)
Surface: cli + data
Needs: FIX-13 vetoed
Behavior: obsctl status shows quick_arm: OFF; obsctl arm, arm --mutation and any restart never change it; a QUICK-labelled approved proposal follows FIX-13 §5 steps 3–5 exactly (branch presented, nothing merged); a re-pin records agent_action QUICK_ARM_CHANGED
Evidence: acceptance steps 1–2

# VAL-FIX-14-002 (gate on the flip): the seven preconditions (a)–(g) are each V-observable and all hold before the re-pin (R02)
Surface: artifact
Needs: VAL-FIX-14-001
Behavior: (a) FIX-13 vetoed; (b) ≥ obs.quickPreconditionMergedFixes (seed 10) V-merged fixes with root-verdict agreement ≥ obs.quickPreconditionAgreementRate (seed 0.9); (c) register rows ratified as NUMBERS: quickProductionLineCap 20, quickTotalLineCap 50, blastRadiusMaxReachable, fingerprintMaturityN 3 (FATAL→1), canaryWindowMs, lineageDepthMax, fixCooldownMs; (d) allowlist non-empty by V's re-pin with an evidence packet per entry; (e) auto-disable + re-arm drill passed; (f) remote form only: branch protection verified + hash pinned; (g) build_ref real on every runtime (installers currently seed UNTRACKED-DEV — ARCH defines the real identity)
Evidence: a G5-entry checklist in FIX-14/PROGRESS.md with one measured line per precondition

# VAL-FIX-14-003 (ON half): QUICK shape is a BOUND; landing is auto-merge into dev only under matching hashes; the deferred canary yields exactly one revert; the auto-disable OR-list trips mutation OFF (R03, R04, R05, R06)
Surface: cli + data
Needs: V's re-pin
Behavior: ≤ 1 production file + 1 test file, ≤ 20/50 lines, allowlisted, RED from a human-owned invariant, maturity ≥ N, blast radius ≤ bound, no active mutation on the same root — anything failing is PR_FIX; landing = per-fix branch auto-merged into dev (never main) only while head/base/policy hashes match and checks are fresh; one revertible commit; a notification on every landing; at merge the landing is UNVALIDATED and the root frozen until a real deploy (build_ref containing the merge) opens canaryWindowMs; clean window → FIXED_VALIDATED; recurrence on a fix-bearing build → exactly ONE revert PR + trip; second recurrence → ESCALATED, revert count still 1; no deploy ever → frozen forever, visible; the OR-list (forbidden-path touch · chain break · auto-revert fired · rejected-verdict-rate breach · open gap/stale proof · budget/rate breach · policy-hash mismatch · store/audit outage · branch-protection mismatch · watchdog anomaly) suspends quick_arm behaviour and sets mutation OFF; re-arm is the custodian's
Evidence: acceptance steps 3–7; `pnpm vitest run tests/integration/fix14-canary.test.ts` ×3
```

**Acceptance criteria — V's steps (verbatim from the frozen SPEC §5; two halves):**
OFF half (after FIX-13):
1. `obsctl status` → `quick_arm: OFF`.
2. An approved proposal labelled `QUICK` follows FIX-13 §5 steps 3–5 (branch presented, nothing merged) — a QUICK label buys nothing while OFF.
ON half (after V's re-pin, only when R02(a)–(g) hold):
3. `obsctl quick-arm on --custodian-token …` → `quick_arm: ON`, `obs.agent_action` gains `QUICK_ARM_CHANGED`.
4. A QUICK-eligible incident: within the cycle `git log dev -1` shows a new merge commit authored by the bot identity, `obsctl status` shows the landing `UNVALIDATED`, a macOS notification names it; `git log main -1` unchanged.
5. An above-bound change (V seeds one over the line cap in the drill) → `obsctl status` shows `REFUSED_QUICK: line_cap` and the incident is presented approval-first (FIX-13).
6. Canary drill (`pnpm exec vitest run tests/integration/fix14-canary.test.ts`): seeded recurrence on a fix-bearing build ⇒ exactly one revert + trip; second recurrence ⇒ `ESCALATED`, revert count still 1.
7. `obsctl status` → `mutation: OFF` after the trip; `obsctl arm --mutation` requires the custodian token.

"V vetoes Done only after the applicable half's steps match."

**Implementation (when V dispatches it, alone):**
- [ ] 14.1 OFF-half proof first: run acceptance steps 1–2 on merged FIX-13 and record them in PROGRESS.md (no code)
- [ ] 14.2 G5-entry checklist (a)–(g) measured line by line; the `~20` in R-E1 becomes the register NUMBER `quickProductionLineCap` before the flip
- [ ] 14.3 C1 — QUICK shape bound (`tests/integration/fix14-shape.test.ts` RED: 2 production files → PR_FIX; 21 production lines → PR_FIX; maturity 2 with N=3 → PR_FIX; blast radius over bound → PR_FIX; an active mutation on the root → PR_FIX) → implement in `landing/` additive region → GREEN
- [ ] 14.4 C2 — landing under matching hashes into `dev` only (`fix14-landing.test.ts` RED on a fixture repo: head/base/policy mismatch → refused; match → one merge commit on `dev`, `main` untouched, notification argv recorded) → GREEN
- [ ] 14.5 C3 — deferred canary + auto-disable (`fix14-canary.test.ts` RED: UNVALIDATED at merge; root frozen; a build_ref containing the merge opens the window; clean → FIXED_VALIDATED; recurrence → exactly one revert + mutation OFF; second → ESCALATED; each OR-list member → suspended + OFF) → GREEN
- [ ] 14.6 `pnpm typecheck` delta 0; commit per cluster; V's ON-half steps 3–7

**Gate G5:** V-flipped; **Done = V's veto** on the applicable half.

---

### Task 15: FIX-15 — Hatchet failed-run ingest (DISPATCH GATED on SPIKE-D1 + RP-2)

**Status: NOT STARTED; DISPATCH GATED.** `tools/obs-listener/src/ingest-hatchet/**` ABSENT. **SPIKE-D1 has not been run; RP-2 `t_fbefa222` is unset.** S24 has no ticket id (U-F2). The Hatchet dev container is `debateai-v3-hatchet-lite-1` (REST 8888, gRPC 7077; compose provisions only a worker token). Gate G2 entry. C4 boundary: Hatchet RUN FAILURES → here; Hatchet INFRASTRUCTURE health → ObservationAgent (F-10). **Kill posture (frozen, Batch-3 row 14 b):** on a SPIKE-D1 kill criterion (retention < poll floor, unboundable pagination, no read token) the bundle slot `hatchet_ingest = DEFERRED_TO_MISSION`, a structured intake candidate is written at `docs/missions/2026-08-21-observability-loop/research/SPIKE-D1-exit.md`, every acceptance statement quantifies first-party-only, and **this slice is NOT dispatched by this mission**.

**Files (when dispatched):** `tools/obs-listener/src/ingest-hatchet/{poll.ts, map.ts, link.ts, skew.ts}`, `tests/integration/fix15-*.test.ts`. Read-only: Hatchet REST 8888 with a read-scope token (from SPIKE-D1), `apps/runner/src/main.ts` (join keys). Forbidden: storing any Hatchet log text; Hatchet on the capture path; product source; the daemon's regions (the fold hook is FIX-09's interface).

**Definition of done (VAL assertions):**

```
# VAL-FIX-15-000: SPIKE-D1 answers its five questions read-only in half a day, and its kill criteria are applied honestly (R01)
Surface: artifact
Needs: none
Behavior: retention window · runs.list pagination bounds · read-scope token obtainability · backlog/heartbeat semantics · attempt-identity stability — each answered with evidence; kill criteria evaluated; on kill: slot DEFERRED_TO_MISSION, SPIKE-D1-exit.md written, this slice not dispatched
Evidence: the SPIKE-D1 report; the bundle slot value; RP-2 set or the exit file

# VAL-FIX-15-001: Structured-fields-only ingest, idempotent, retention gaps counted (R02, R03)
Surface: data
Needs: SPIKE-D1 passed; RP-2 set; FIX-09 merged
Behavior: poll runs.list (FAILED/CANCELLED, cursor window minus overlap) on obs.hatchet.pollIntervalMs as consumer hatchet-ingest; only status, kind, attempt, counts, additionalMetadata.v3RunId/v3WorkItemId cross; log text never stored; rows source='hatchet', runtime='ingest', source_event_ref='hatchet:<runId>:<attempt>' under UNIQUE (source, source_event_ref); a shorter Hatchet retention → a bounded capture_gap on source hatchet
Evidence: acceptance steps 3, 5; an integration test against a recorded REST fixture (re-ingest twice → same count)

# VAL-FIX-15-002: Cross-source merge keeps ours authoritative; clocks stamped; skew measured; Hatchet never on the capture path (R04, R05, R06)
Surface: data
Needs: VAL-FIX-15-001
Behavior: a match on v3RunId/v3WorkItemId within obs.skewToleranceMs with compatible classes → one obs.source_link row and source_set gains hatchet; unmatched → two incidents; taxonomy/severity/fingerprint from ours; both clocks stamped; skewToleranceMs ratified only from a split-clock measurement; drift beyond tolerance trip-eligible; a Hatchet outage degrades this source and is an occurrence (capture_point='self'), never a capture failure
Evidence: acceptance steps 4, 6
```

**Acceptance criteria — V's 6 steps (verbatim from the frozen SPEC §5):**
1. Start a debate; while its runner task executes, `kill -9 <runner pid>` (the process, not the container).
2. Hatchet dashboard `http://localhost:8888` shows the run FAILED.
3. Within `pollIntervalMs` + 5 s: `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT source, runtime, code, run_ref, work_item_ref FROM obs.occurrence WHERE source='hatchet' ORDER BY occ_seq DESC LIMIT 1"` → `hatchet|ingest|<code>|<uuid>|<uuid>`.
4. `SELECT count(*) FROM obs.source_link` → increases by 1 only if a first-party twin exists (a spool-drained row from the killed runner); `SELECT source_set FROM obs.incident WHERE fingerprint = …` → includes `hatchet`.
5. `SELECT count(*) FROM (SELECT o::text t FROM obs.occurrence o) s WHERE t ILIKE '%traceback%' OR t ILIKE '%stack%' AND source='hatchet'` → `0` (no log text).
6. `docker stop debateai-v3-hatchet-lite-1`; run FIX-01's failing job → its row lands normally (capture path unaffected); `SELECT code FROM obs.occurrence WHERE runtime='ingest' AND capture_point='self' ORDER BY occ_seq DESC LIMIT 1` → a Hatchet-unreachable code; `docker start debateai-v3-hatchet-lite-1`.

"V vetoes Done only after steps 1–6 match. **If SPIKE-D1 killed: this section is replaced by the exit report's deferral statement.**"

**Implementation (only after SPIKE-D1 passes and RP-2 is set):**
- [ ] 15.0 SPIKE-D1 (orchestrator/custodian, read-only, ≤ half a day): `GET /api/v1/tenants/{tenant}/workflows/runs?statuses=FAILED,CANCELLED&limit=…` pagination probe; retention probe over an old run; `hatchet-admin token create --name obs-ingest` read-scope feasibility (recipe at `apps/runner/src/dev-hatchet-token.ts:21-24`); attempt-id stability across two polls; write the report; set RP-2 or the DEFERRED slot
- [ ] 15.1 C1 — poll + map (`fix15-ingest.test.ts` RED against a recorded REST fixture: structured fields only; UNIQUE idempotence; retention gap row) → GREEN
- [ ] 15.2 C2 — link + skew + self-occurrence (`fix15-link.test.ts` RED: matched pair → one source_link, ours authoritative; unmatched → two incidents; skew stamp + tolerance; Hatchet unreachable → `capture_point='self'` occurrence and the first-party path unaffected) → GREEN
- [ ] 15.3 `pnpm typecheck` delta 0; commits per cluster; V's 6 steps

**Gate:** part of G2 only when dispatched; **Done = V's veto.**

---

### Task 16: FIX-16 — CI inventory gate + D6 machine check

**Status: C1 PASS; C2 deferred until the binding wave.** The AST scanner and zone-import check are complete through `08eff965`; fresh Sol review returned SPEC PASS / CODE QUALITY PASS. The focused suite passed 57/57 ×3, the exact regression set passed 9/9 ×3, and full production scans returned the stable 379-row inventory ×3 in 22.72–22.91 s. C1 still has no baseline or root package wiring. C2 can snapshot only after FIX-02 through FIX-05 are integrated. Gate G1 tail.

**Files:**
- Create: `tools/obs-inventory/{src/index.ts, src/scan.ts, src/zone-check.ts, baseline.json, README.md}`, `tests/architecture/fix16-gate.test.ts`
- Modify: root `package.json` line `lint-wiring` (+ the gate) and one new `audit:obs-inventory` script line
- Read-only: the tree it scans (never a zone file)
- Forbidden: root `package.json` `build` line; every non-root `package.json`; `tools/orphan-audit/**` (floor-deny; V-6); any product source

**Interfaces:**
- Produces: `pnpm audit:obs-inventory` → `PASS baseline=<n> new=0` exit 0 or `FAIL <path>:<line> <class>` exit 1, classes ∈ {`throw_without_code`, `bare_catch`, `void_promise`, `wrapper_without_cause`, `zone_import`}; a checked-in `baseline.json` grandfathering every pre-existing entry (snapshot commit recorded in `FIX-16/DECISIONS.md`; re-baselining is a V-approved act); the zone check over `packages/obs-capture/**`, `tools/obs-listener/**`, `acceptance/obs/**` for any `import`/`require`/dynamic import of a zone manifest prefix, exempting string literals in `packages/obs-capture/src/zone/manifest.ts` by construction; runtime under `obs.inventoryGateMs` (seed 30 000 ms); wired into root `lint` by one edit, independent of `audit:source`

**Definition of done (VAL assertions):**

```
# VAL-FIX-16-001: The scanner finds the four wrapper classes and emits a machine-readable inventory (R01)
Surface: cli
Needs: none
Behavior: scans apps/ packages/ tools/ acceptance/ for throw sites without a registry code, bare `catch {`, `void <promise>` at production async boundaries, and TypedDomainError constructions without cause when a caught error is in scope; emits JSON {path, line, class}
Evidence: `pnpm vitest run tests/architecture/fix16-gate.test.ts` ×3 with fixture files for each class (positive and negative)

# VAL-FIX-16-002: The baseline grandfathers; new entries FAIL with path:line; the baseline itself PASSES (R02, R03)
Surface: cli
Needs: FIX-02..05 merged (snapshot timing)
Behavior: baseline.json snapshotted after the binding wave, commit recorded; a scratch file with a bare catch → FAIL <path>:1 bare_catch exit 1; removing it → PASS exit 0
Evidence: acceptance steps 1, 2, 4

# VAL-FIX-16-003: The zone check fails on any obs artifact importing a zone prefix, exempts the manifest's literals, and never touches a zone file (R04)
Surface: cli
Needs: none
Behavior: `import "../../../apps/api/src/registration.js"` under packages/obs-capture/ → FAIL zone_import naming the importing file only; manifest.ts's string literals never flagged; the gate reads only the non-zone files it scans (no read/stat/list of a zone path)
Evidence: acceptance step 3; an fs spy during a run over the real tree records no zone path

# VAL-FIX-16-004: Wired into lint by one line, independent of audit:source, under the time seed (R05, R06)
Surface: cli
Needs: none
Behavior: `grep -n 'audit:obs-inventory' package.json` shows the lint-wiring line and the script; the gate's exit code is independent of audit:source's; runtime < obs.inventoryGateMs (seed 30 000) on this tree
Evidence: acceptance step 5; `time pnpm audit:obs-inventory` printed in the handoff
```

**Acceptance criteria — V's 5 steps (verbatim from the frozen SPEC §5):**
1. `pnpm audit:obs-inventory; echo "exit=$?"` → `PASS baseline=<n> new=0`, `exit=0`.
2. `printf 'export function f(){ try { return 1; } catch {} }\n' > apps/scheduler/src/zz-scratch.ts; pnpm audit:obs-inventory; echo "exit=$?"; rm apps/scheduler/src/zz-scratch.ts` → `FAIL apps/scheduler/src/zz-scratch.ts:1 bare_catch`, `exit=1`.
3. `printf 'import "../../../apps/api/src/registration.js";\n' > packages/obs-capture/src/zz-scratch.ts; pnpm audit:obs-inventory; echo "exit=$?"; rm packages/obs-capture/src/zz-scratch.ts` → `FAIL packages/obs-capture/src/zz-scratch.ts:1 zone_import`, `exit=1` (the gate names the importing file only; it never touched the imported path).
4. `pnpm audit:obs-inventory` again → `PASS`, `exit=0`; `git status --porcelain | grep -c zz-scratch` → `0`.
5. `grep -n 'audit:obs-inventory' package.json` → present on the `lint` line and as its own script.

"V vetoes Done only after steps 1–5 match."

**Implementation — clusters:**

**C1 — scanner over the four classes; zone check with the manifest exemption** (R01, R04). Verify: `pnpm vitest run tests/architecture/fix16-gate.test.ts`
- [ ] 16.1 Write the test RED: fixtures under `tests/fixtures/fix16/` — one file per class (positive) and one clean file; `scan(dir)` returns exactly the expected `{path, line, class}` set; a fixture importing a zone prefix from a `packages/obs-capture`-shaped path → `zone_import`; the real `manifest.ts` scanned → zero findings; an fs spy asserts no path under `zone_path_prefixes` is opened/stat'ed during the scan (the check is textual on the importer)
- [ ] 16.2 Run → FAIL; write `src/scan.ts` (TypeScript AST via the `typescript` package already in the tree — never regex for `throw`/`catch`), `src/zone-check.ts` (prefix list transcribed from `manifest.ts` exports at build time — read as a module import of the classification list, which is lawful data); run → GREEN; refute: treat the manifest's string literals as imports → RED; revert
- [ ] 16.3 Commit: `git commit -m "feat(tools): FIX-16 C1 — obs inventory scanner, zone import check"`

**C2 — baseline, gate semantics, timing, lint wiring** (R02, R03, R05, R06). Verify: `pnpm audit:obs-inventory; echo $?`
- [ ] 16.4 `src/index.ts`: load `baseline.json`; new entries → `FAIL <path>:<line> <class>` exit 1; none → `PASS baseline=<n> new=0` exit 0; `--snapshot` writes the baseline (used once, after FIX-02..05 merge); print elapsed ms and fail if > `OBS_INVENTORY_GATE_MS` (seed 30 000)
- [ ] 16.5 Add the `audit:obs-inventory` script and the one `lint-wiring` edit to root `package.json` (the `build` line untouched — assert with `git diff -U0 package.json | grep -c '"build"'` = 0)
- [ ] 16.6 **After FIX-02, 03, 04, 05 merge** (merge dev into the slice branch first): `pnpm audit:obs-inventory --snapshot` → commit `baseline.json` and record the commit in `FIX-16/DECISIONS.md`; run steps 1–5; `pnpm typecheck` delta 0
- [ ] 16.7 Commit: `git commit -m "feat(tools): FIX-16 C2 — checked-in baseline, gate wired into lint"`

**Handoff gates, validate lanes, gate G1 tail:** as Task 1; scrutiny lane confirms `package.json`'s diff is exactly two lines and no non-root manifest changed. Real-surface lane = V's 5 steps. **Done = V's veto.**

---

### Task 17: Phase-gate tasks — what the orchestrator does between slices (no code)

- [ ] **G1 gate (after FIX-01..05, 07, 08, 16 vetoed; 06 when released):** merge each vetoed slice into dev in veto order (FIX-01 first; FIX-07 only after FIX-01; FIX-06 only after FIX-04); after EVERY lane merge run the audit's mechanical guard `git diff <merge>^2 <merge> -- <lane-owned files>` = empty (B1's lesson); re-run the collected obs suite ×3 and record `passed/total` (expected: the 6 historical reds resolved by FIX-03 and the B2 ruling, no new reds); `pnpm typecheck` delta 0 vs the pin; `pnpm audit:source` rows pasted; the demo custodian re-runs the D12 demo with `OBS_DEMO_DATABASE_URL` set → stages 02–17 PASSED (16 after the custodian's edit); `pnpm exec tsx acceptance/run-acceptance.ts --family obs-g1` prints no FAIL; V's whole-G1 test point (the vertical-slice law's post-merge developer test): V runs FIX-01 steps 3–8 again on merged dev
- [ ] **G2 gate (after FIX-09, 10, 11 vetoed; 15 if dispatched):** merges + guard; `launchctl list` shows both services; the D12 demo stages 18–20 PASSED; V's whole-G2 test: FIX-11 steps 1–3 on merged dev
- [ ] **G3 gate (FIX-12 vetoed):** demo stage 21 first half; the ledger row; V's test = FIX-12 steps 1–5
- [ ] **G4 gate (FIX-13 vetoed):** demo stage 21 fully; V's test = FIX-13 steps 3–8; the count of V-merged approval-first fixes starts here toward precondition (b)
- [ ] **G5 gate:** V-flipped only
- [ ] **Push:** never by an agent; V pushes after each whole-gate test point
- [ ] **Ledger + self-reports:** at every seat exit (`.hermes/reports/observability-agents/LEDGER.md`); the murder-case closure report before G6

```
# VAL-FIX-CROSS-001: One real fault travels the whole loop on merged dev and stops where V's approval is required
Surface: cli + data + browser(macOS)
Needs: G1..G4 vetoed
Behavior: FIX-01 step 4's job → one row (≤ 5 s) → cursor advances → one incident → one trace (EXTERNAL_ROOT postgres_host) → one ticket on `fixagent` → no proposal (not a fix target); FIX-03's real failed run → row with real ids → incident → trace → ticket → (dispatch armed) one proposal + notification → `obsctl approve` → (mutation armed, allowlist re-pinned, catalog entry) one branch fixagent/<hash> with RED→GREEN evidence → WAITS; `git log dev -1` unchanged until V merges; `obsctl kill` stops everything within 5 s and the product does not notice
Evidence: the per-step outputs of FIX-01/03/09/11/12/13 acceptance re-run in sequence on merged dev, pasted into the G4 gate report
```

---

## Open V decisions that this plan cannot settle

| Row | Question | Default in this plan | When V's ruling changes the plan |
|---|---|---|---|
| V-1 | approval-first for landing | CONFIRMED | (b)/(c) would move FIX-14's auto-merge earlier — not planned |
| V-3 | who detects "it just doesn't work" | ObservationAgent | (b) would add detector modules to FIX-09 — not planned |
| V-5 | RP-0 hash | unratified; codes minimized and recorded | ratification unblocks FIX-05 Done and the S02 addendum |
| V-6 | audit:source exemption | (A) recommended; lint not a Done criterion | (B)/(C)/(D) change only which rows the handoffs paste |
| V-7 | unreviewed `5f0bd546` | (c) attach to the S02 addendum | (a) adds a standalone Fable review seat |
| V-8 | typecheck red | (a)+(c): coders start; delta rule | none for this plan |
| F-7 | FIX-06 dispatch vs ui-overhaul | hold, premise re-stated | (b) releases Task 6 after FIX-04 merges |
| F-14 / **V-9** | local branch vs remote push for fix branches | (a) local, no push | (b) makes the G4 entry acts mandatory and adds a push step + a refused-push drill to FIX-13 C4 |
| **V-10** | merge PR #8 before the campaign | not adopted; rebase risk noted | if merged first, FIX-03/04 re-measure anchors before dispatch |
| **V-11** | code-first vs approve-first | approve-first (frozen) | (a) collapses FIX-12's wait into FIX-13 and removes `obsctl approve` from the path — a SPEC v2 for both slices |
| **V-12** | Foundry per-worktree database | not adopted | a new slice FIX-17 (not in this plan); FIX-13 R05's isolated worktree already exists |
| **V-13** | IF-2 transport | (c) thrown errors only in this campaign; the detector filter coded, no producer | (a) needs the ObservationAgent to write `obs.occurrence` — contradicts its frozen G12; (b) adds a poll of `observation.defect_signal_v` to FIX-09 intake |
| **V-14** | alert file | not adopted | a fourth channel in FIX-12 R05 |
| **V-15** | first fault | (a) = FIX-01 | none |
| U-F3/U-F4/U-F6/OFF-switch | the four ARCH questions | defaults stated in Tasks 1, 7, 9, 11 | ARCH's DECISIONS lines supersede the defaults |
| F-11 seeds | every number | seeds as labelled | V ratifies each at the slice's acceptance |

## Self-review (writing-plans checklist, run 2026-09-02)

**1. Spec coverage.** Every FIX-nn requirement maps to a VAL assertion and a cluster: FIX-01 R01–R15 → VAL-FIX-01-001..008 / C1–C5 · FIX-02 R01–R08 → 001..003 / C1–C3 · FIX-03 R01–R12 → 001..004 / C1–C3 · FIX-04 R01–R10 → 001..003 / C1–C3 · FIX-05 R01–R07 → 001..003 / C1–C2 · FIX-06 R01–R08 → 001..004 / C0–C3 · FIX-07 R01–R07 → 001..003 / C1–C3 · FIX-08 R01–R11 → 001..005 / C1–C4 · FIX-09 R01–R13 → 001..005 / C1–C4 · FIX-10 R01–R08 → 001..003 / C1–C2 · FIX-11 R01–R10 → 001..003 / C1–C2 · FIX-12 R01–R11 → 001..005 / C1–C4 · FIX-13 R01–R11 → 001..005 / C1–C4 · FIX-14 R01–R08 → 001..003 / 14.1–14.6 · FIX-15 R01–R07 → 000..002 / 15.0–15.3 · FIX-16 R01–R07 → 001..004 / C1–C2. The "Done is V's veto" requirement of every slice is the plan's global rule. Q2's IF-1..IF-10 are covered by FIX-01 (IF-1 producer), FIX-09 (IF-2 filter, IF-3/IF-4 authority, IF-5), FIX-10 (IF-9), FIX-11 (IF-10), FIX-12/13 (IF-6), FIX-15 (IF-7); IF-8 is OUT by design. The Q6 custodian acts are Task 0. **Deliberate gaps:** FIX-14 and FIX-15 are frozen/gated, not built; the war plan's FIX-17/18 are not slices of this plan.

**2. Placeholder scan.** No TBD/TODO/later/appropriate/"similar to Task N"; every ARCH-owned unknown is named with its default and its DECISIONS line; every seed carries its number and "V ratifies".

**3. Type consistency.** `startCaptureRuntime/stopCaptureRuntime` (Task 1) are what Tasks 3, 4, 5, 7 arm; `readObsBounds()` (Task 1) is read by Task 7; `DECLARED_KINDS` and the projection veto (Task 3) are what Tasks 4, 5 declare against; `TracerHook` and `DispatchArm` (Task 9) are implemented by Tasks 11 and 12; `markers.ts`'s keyed `ARMED`/`KILL` (Task 10) are what Tasks 12, 13 read; `APPROVED(hash)` (Task 12) is what Task 13 re-checks; the incident state machine names are one list across Tasks 9, 12, 13, 14; the `obs.agent_action.action_kind` vocabulary (`KILL, ARM, STATUS, PROPOSAL, APPROVED, DENIED, PR_PRESENTED, QUICK_ARM_CHANGED`) is one list; every psql idiom is the `docker exec` form.

**What this plan does not claim (current reconciliation; original self-review date 2026-09-02).** Reviewed worker milestones now exist for FIX-01, FIX-02 C1-C3, FIX-03, FIX-05, FIX-07, FIX-08 C1/C2, FIX-09 C1-C3, and FIX-16 C1, but no slice is V-accepted or merged into `dev`. The zero-row store and unanswered-architecture statements above are historical 2026-09-02 baseline observations unless a later status paragraph supersedes them. RP-0/RP-1/RP-2/RP-3 remain unpinned; RP-3 has only the untracked 24-case controller candidate at SHA-256 `8f2733e2ee202b7f1533cfd068063d1b5bf3ca52feb566def000e3a6987d113e`, not a landed or V-pinned corpus. SPIKE-D1 has not run, and no V option, production act, acceptance, merge, or push is claimed.
