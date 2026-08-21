# POST-SYNTHESIS RULINGS — V, 2026-08-21 (in-session, wayfinder batches 1+2)

Binding overlay on SYNTHESIS-requirements.md. Where this file and the
synthesis spec differ, this file wins. ARCH consumes both.

## Ruled

- **R-E1 (QUICK-FIX line):** codex shape ratified — ≤1 production file +
  1 test file, **~20 production-line cap "for the moment"** (~50 with tests),
  subsystem allowlist, RED→GREEN proof mandatory. Lands as **auto-merged PR
  into `dev`, never `main`**.
- **R-E2 (landing):** confirmed within R-E1 — per-fix auto-merged PR into
  `dev`.
- **R-BIGGER (new tier shape, V verbatim intent):** anything above QUICK is
  **approval-FIRST**: the agent submits diagnosis + proposed fix scope to V;
  only after approval is the fix coded and pushed to `dev`. The approval
  object is the PROPOSAL, not a finished PR.
- **R-E3 (runtime):** daemon + spawned **Codex CLI** worker per incident
  (never a standing session); cap unit = calls/day + wall-clock per
  diagnosis; numbers ratified at activation. V's machine now, dezbatere.ro
  later.
- **R-E4 (retention) — PARKED AS MOOT + SCOPE SHARPENING:** "We do not take
  the Users part of the application into our observability just yet." →
  **No user-linked identifiers in error events at all for now** (supersedes
  the E6-07 keyed-pseudonym default: OMIT `asker_id`/`session_id` entirely;
  correlation via run/debate/node ids only). DR-188 classification of error
  rows returns only if the Users part ever enters scope. Unanimous floor
  stands: no automated deletion absent an explicit V law; aggregates + audit
  forever.
- **R-E6-09 (severe-error workflow, V verbatim shape):** severe error →
  recorded → listener **researches the fix** → **notification to V with the
  proposed changes for approval** → on approval → **Kanban tickets are
  created** (board `observability-loop`, port 9119) → the loop starts
  fixing. Notification channel chosen at ARCH.
- **R-E6-13 (capture limit):** qualification ACCEPTED — product fails open,
  counted `CAPTURE_GAP` marker on storage return, fix-agent write authority
  auto-trips off while capture is compromised.
- **R-E6-10 (live UI):** **`apps/ui` is live**; `web/` is the leftover —
  its removal rides the parked tree-move commit (V-gated, one cleanup);
  build pipeline currently builds only `web/` → repoint recorded for ARCH.
  Client capture specs against `apps/ui` only.
- **R-E5 (zone residue):** **anonymous daily counter only** for
  zone-origin errors (no codes, no payloads, no traces); the
  producing-module classification default stands (shared infra errors, e.g.
  `packages/db` pool failures on auth routes, stay fully captured).

## Adopted defaults — V veto window open (unanimous/high-confidence rows)

E6-01 merge-only (a QUICK merge never deploys/restarts anything) ·
E6-02 kill switch: V + one named delegate, dual control on expansion only ·
E6-03 initial QUICK allowlist EMPTY (fails closed, grows by evidence) ·
E6-04 loop-agent PRs reviewed by a human + independent non-author-family
reviewer (delegate nameable) · E6-05 evaluator-worker captured at exported
boundary, no process host specified · E6-08 listener never reads debate
content (ids/codes/structure only) · E6-11 QUICK may touch UI copy/CSS if
floor-clear ("scoring semantics" = arithmetic + served-number writers only) ·
E6-12 fingerprint maturity gates FIXING never capture (N ratified later) ·
E6-14 QUICK authority auto-disables on (forbidden-touch OR auto-revert OR
rejected-verdict-rate) — numbers later · E6-16 cross-source dedup: evidenced
merge, both records retained, ours authoritative for
taxonomy/severity/fingerprint.

## Explicitly deferred to ARCH (must be addressed in Plan.md)

- E6-15 event vocabulary (29 declared vs 7 producible; `node.failed` etc.
  unproducible) — Plan.md recommends widen-vs-prune with evidence; V ratifies
  at plan review.
- E6-06 nothing schedules the scheduler jobs — ops recommendation due with
  the plan.
- Notification channel for R-E6-09.
- Build-pipeline repoint to `apps/ui` (R-E6-10).
- ARCH-tagged UNVERIFIED rows: U-01 (Hatchet read-back), U-06 (host
  behavior), U-07 (pooler vs LISTEN), U-09 (zone classifier mechanism),
  U-11 (run_progress_event timestamps), U-18 (cross-source clock skew).

## Batch 3 — V rulings on the C2 plan-review DECIDE-V rows (2026-08-21, in-session)

Answered from the V DECISIONS PACKET flushed at plan-review. Binding; C4
FinalPlan folds these in.

- **§K row 13 (canary × merge-only, RT-25) → DEFERRED CANARY (option a).**
  A QUICK fix is marked `UNVALIDATED` at merge; the canary window opens at the
  **next natural deploy**; the agent may not make further fixes to that same
  code until a deploy confirms the first worked; if it then proves bad, exactly
  ONE automatic revert PR lands (still merge-only). E6-01 merge-only stands
  unamended. G5 may now certify canary behaviour on this basis.
- **§K row 11 (QUICK review scoping, FID-07) → CONFIRM THE READING (option a).**
  E6-04's human + independent review governs the PR-FIX and approval-first
  tiers. For QUICK, "independent review" is satisfied by the automated policy
  gate (floor + allowlist) + post-landing human visibility (OBS-R115/R121).
  QUICK keeps its no-approval property.
- **§K row 6 (scrubbed free-text error remnant, FID-08) → DROP IT ENTIRELY
  (option a).** `obs.occurrence_detail` stores NO free-text message remnant.
  Structured allowlist fields + cause-chain codes + enumerated template
  parameters only. Nothing machine-side depended on it; strongest privacy,
  matches V's "secure application" posture. The OBS-R048 exception is removed,
  not merely bounded.
- **§K row 14 (dual-source fallback, RT-39) → HATCHET-READABLE IS A NEW MISSION
  (option b).** If SPIKE-D1 hits a kill criterion (retention < poll floor /
  unboundable pagination / no read-scope token), the second source is **NOT**
  silently narrowed to first-party-only. Wiring Hatchet read-back becomes its
  own **scoped new mission**; the dual-source capability (OBS-R137/R138) waits
  until that mission lands. The listener ships first-party-only in the interim
  as an EXPLICIT DEFERRAL, and the uncovered class (worker-crash-before-flush,
  RT-02) is tracked as the new mission's motivating gap — never accepted as a
  permanent hole. C4 states this posture; SPIKE-D1 exit triggers the new
  mission, not a quiet fallback.

## Also fold at C4 (from the round-1 re-review, both lenses PASS)

- Lens A REG-01 (MINOR): restore OBS-R046/R047 citations (redaction-before-sink;
  never-store list) and argue the RT-08 equal-work deviation that relocated zone
  redaction off the capture path — substance verified preserved, citations must
  return.
- Lens B PROG hardening (4, non-blocking, carry into slices/tickets): (1)
  installer import-light so the install-first capture layer isn't defeated by a
  transitive `@debateai/db` import; (2) enqueue holds a reference, not on-path
  serialization; (3) tighten fix-worker "no read access" to "no access" + add
  credential-forge attempts to the G4 entry fixture; (4) HMAC/anchor the hash
  chain to justify the independent-of-superuser claim.

## Batch 4 — V rulings at the planning-graph IMAGE GATE (2026-08-21)

- **LANE PLAN APPROVED at `authority_epoch: 1`.** V's single yes authorizes every
  worktree create and use inside the approved plan (18 lanes, L1..L18, one
  isolated worktree each), per the spine's per-mission LANE PLAN APPROVAL gate.
  Destructive git operations remain individually gated and are NOT covered.
  V's words: "Approve — open programming."
- **PROGRAMMING is open**, subject to the one remaining structural precondition:
  the P0 ROW-GIT reconciliation commit must land before lane L1 is dispatched,
  and the orchestrator verifies HEAD ancestry first.
- **G5-V1 RULED: OUT OF SCOPE for this mission.** `apps/evaluator-worker/**`
  gets no capture instrumentation here. Rationale accepted: the worker is
  structurally undispatchable today (`EvaluatorDispatchBinding.state` is the
  literal `"UNBOUND"`, verified), so it can throw nothing; instrumenting it
  belongs to whichever mission makes it runnable. Zero lane-surface change, no
  epoch-2 re-approval, no dead code. E6-05's "capture at the exported-function
  boundary" stands as the DESIGN answer for that future mission, recorded here
  so the gap is carried, not forgotten. The DECIDE-V roster for this mission is
  now EMPTY.
