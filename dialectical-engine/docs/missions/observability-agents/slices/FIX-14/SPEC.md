# FIX-14 — The QUICK arm behind V's switch: unattended merge into `dev` of very small fixes, OFF by default, flipped only by V, with deferred canary and exactly one revert

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G5 QUICK** — **DISPATCH GATED ON V FLIPPING `quick_arm`** (C1: "Initially I want to be in charge of everything"; V-1). This SPEC freezes the switch, its default, and what must be true before V may flip it; the slice is not dispatched in phase 1.
Absorbs predecessor ticket: **S30 `t_af2a1c41`** (QUICK + deferred-canary arm) · R-E1/R-E2 (QUICK shape), Batch-3 row 13 (deferred canary), E6-01/03/12/14, OBS-R095/R096/R108/R110/R115/R116/R118/R119/R120/R121, RT-17/R24/R25/R30/R31/R32/R37/R42.
D-criteria evidenced: **D11** (fully, when ON); the OFF half (a QUICK-sized fix still waits) is V-runnable after FIX-13.
Seam obligations: none.

## 1. Intent
The predecessor's D11 ("a QUICK fix merges into `dev` unattended") is preserved as a LATER PHASE, not deleted: the machinery is specified, the switch is OFF, and the conditions under which V may turn it on are written down so nobody re-derives them.

## 2. Requirements
- **FIX-14-R01 (the switch)** `quick_arm` is a policy-bundle slot with values `OFF | ON`, default `OFF`, changed only by a bundle re-pin under the single custodian's token (E6-02 amended), audited to `obs.agent_action` (`action_kind = 'QUICK_ARM_CHANGED'`), visible in `obsctl status`; `obsctl arm`, `obsctl arm --mutation`, and any restart never change it.
- **FIX-14-R02 (preconditions V checks before flipping — all must hold, each V-observable)** (a) FIX-13 vetoed Done; (b) at least `obs.quickPreconditionMergedFixes` approval-first fixes (seed 10; number V's) have been merged by V with V's agreement on the root verdict at or above `obs.quickPreconditionAgreementRate` (seed 0.9); (c) register rows ratified with numbers, not tildes: `obs.quickProductionLineCap` (seed 20), `obs.quickTotalLineCap` (seed 50), `obs.blastRadiusMaxReachable`, `obs.fingerprintMaturityN` (seed 3, FATAL→1), `obs.canaryWindowMs`, `obs.lineageDepthMax`, `obs.fixCooldownMs`; (d) the QUICK allowlist is non-empty by V's re-pin with an evidence packet per entry; (e) the auto-disable + re-arm drill passed; (f) in the remote form, branch protection verified and hash pinned; (g) `build_ref` is real on every runtime (post-ROW-GIT — true since `dev` tracks the tree).
- **FIX-14-R03 (QUICK shape, when ON)** ≤ 1 production file + 1 test file; ≤ `quickProductionLineCap` production lines and ≤ `quickTotalLineCap` total; production file within the allowlist globs and outside every deny glob; RED derived from a human-owned invariant; fingerprint maturity ≥ `fingerprintMaturityN`; computed blast radius ≤ `blastRadiusMaxReachable`; no active mutation on the same root (root-keyed cooldown); anything failing any criterion is PR_FIX (approval-first), never QUICK — the BOUND is the criterion.
- **FIX-14-R04 (landing)** a QUICK fix lands as a per-fix PR/branch auto-merged into `dev` — never `main` — only while head, base and policy hashes match the approved values and all checks are fresh; merge deploys nothing; one revertible commit; a human-visible notification on every landing (no approval removes the wait, never the visibility).
- **FIX-14-R05 (deferred canary)** at merge the landing is `UNVALIDATED` and the incident `FIXED_UNVALIDATED`; the root is frozen (no further fixes on that root or its lineage) until a real subsequent deploy — detected by a `build_ref` whose commit contains the merge — opens the `canaryWindowMs` window; a clean window ⇒ `FIXED_VALIDATED`; recurrence on a fix-bearing build ⇒ exactly ONE automatic revert PR (merge-only, into `dev`) + the E6-14 trip (mutation OFF); a second recurrence escalates, never a second revert; no deploy ever ⇒ frozen forever, visible.
- **FIX-14-R06 (auto-disable OR-list)** forbidden-path touch · audit-chain break · auto-revert fired · rejected-verdict-rate breach · open capture gap / stale proof · budget/rate breach · policy-hash mismatch · store/audit outage · branch-protection hash mismatch · watchdog anomaly ⇒ `quick_arm` behaviour suspended and mutation OFF; re-arm is the custodian's act.
- **FIX-14-R07** While `quick_arm = OFF` the entire slice's code path is unreachable: a QUICK-labelled incident follows FIX-13 exactly, and `obsctl status` shows `quick_arm: OFF`.
- **FIX-14-R08** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Switch: `OFF` (default) → `ON` (custodian re-pin) → `OFF` (re-pin or auto-disable). Landing: `QUICK_LANDED(UNVALIDATED) → CANARY_OPEN → CANARY_VALIDATED | CANARY_REVERTED(+trip)`.

## 4. Copy and vocabulary
"quick_arm" · "QUICK" (a bound, not a judgement) · "UNVALIDATED" · "deferred canary" · "exactly one revert". Never "small fix" without the numbers.

## 5. Acceptance — V runs this personally
OFF half (after FIX-13): 1. `obsctl status` → `quick_arm: OFF`. 2. An approved proposal labelled `QUICK` follows FIX-13 §5 steps 3–5 (branch presented, nothing merged) — a QUICK label buys nothing while OFF.
ON half (after V's re-pin, only when R02(a)–(g) hold): 3. `obsctl quick-arm on --custodian-token …` → `quick_arm: ON`, `obs.agent_action` gains `QUICK_ARM_CHANGED`. 4. A QUICK-eligible incident: within the cycle `git log dev -1` shows a new merge commit authored by the bot identity, `obsctl status` shows the landing `UNVALIDATED`, a macOS notification names it; `git log main -1` unchanged. 5. An above-bound change (V seeds one over the line cap in the drill) → `obsctl status` shows `REFUSED_QUICK: line_cap` and the incident is presented approval-first (FIX-13). 6. Canary drill (`pnpm exec vitest run tests/integration/fix14-canary.test.ts`): seeded recurrence on a fix-bearing build ⇒ exactly one revert + trip; second recurrence ⇒ `ESCALATED`, revert count still 1. 7. `obsctl status` → `mutation: OFF` after the trip; `obsctl arm --mutation` requires the custodian token.
V vetoes Done only after the applicable half's steps match.

## 6. Out of scope
Everything approval-first (FIX-13) · deploys (merge-only; deployment authority is separate) · the ObservationAgent.

## 7. File surface (single-writer) and parallel safety
Allowed: `tools/obs-listener/src/{worker-fix,landing}/**` QUICK/canary regions (additive to FIX-13) · `tools/obs-listener/policy/**` slot `quick_arm` (the slot itself is born in FIX-09 as OFF; this slice adds its consumers) · tests `tests/integration/fix14-*.test.ts`.
Read-only: the ratified register rows (fail-closed when absent, RT-31) · the allowlist (grows only via custodian re-pin).
Forbidden: the OBS-R104 set · editing register values · `main`.
Parallel-safe with: none needed — dispatched alone, after FIX-13, after V's flip.
