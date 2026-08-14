# /goal packet — RESIL-01 (Codex seat) — run resilience: cooldown, hidden frame, death policy (DR-174/174-A/176)

**Board:** `debateai-v3` · **Assignee:** codex · dual diamond on handoff.
**Lane (DR-168):** prev = BUG-04 (t_187a3bea, done) · next = none.
Standing law: `CODING-LOOP-PROTOCOL.md` (v2 amendments) + ledger through
DR-176.

## The spec is the AUTHORIZED PLAN — read all three, in order, in full

1. `reviews/dr174-architecture-plan.md` — the plan INCLUDING its binding
   "## Revision after V's rulings (DR-174-A)" (revision wins on conflict).
2. `reviews/dr174-plan-grok-verdict.md` — AUTHORIZATION: GRANTED; its
   binding conditions are contract. The sharpest: the PRIMARY
   maker-position authoring call (callSiteKey "JUDGE", ~:607-615) BYPASSES
   the authorPosition funnel — the cooldown/final-retry wrap MUST cover it
   too, or maker positions die bare.
3. Ledger rows DR-174, DR-174-A, DR-176 — V's rulings verbatim.

## DELIVERS (as planned and authorized; highlights, not a re-spec)

1. **Cooldown + final retry** at the runner lifecycle seam (funnel AND
   primary path): transport exhaustion → visible 10-min hold (HOLDING
   projection state, self-expiring on hold_until; the planned progress
   events — no new event vocabulary beyond the plan's two CHECK members) →
   one final retry via the wrapper's remaining-attempts arithmetic (zero
   packages/providers control-flow change) → cap TWO holds per run,
   counter recovered from the event stream, never process memory.
2. **Register rows:** runDeathPolicy { cooldown_ms: 600_000,
   final_retry_attempts: 1, max_cooldown_holds_per_run: 2 } and
   hiddenNodeScoreThreshold: 0.35 — every value V-ruled
   (sourceRef acceptance:DR-174:V-approved / acceptance:DR-176:V-approved).
   No other new number anywhere.
3. **The hidden frame:** classes H (authored, review dead) and L
   (authored, strength ≤ 0.35) hide — excluded from the evaluated snapshot
   AS WHOLE SUBTREES, never re-parented (snapshotWithoutNode's
   re-parenting is for sensitivity only), presentation-fed through the
   EXISTING "Show set-aside paths" affordance via the adapter; revealed
   material presents as DISCLOSED-as-unjudged, never served-as-opinion
   (DR-165(3), plan T27 is the breach test). Class N (never authored)
   cannot hide or reveal — the mark discloses expansion halted.
4. **Marks (kernel mint, authorized by the consult):** HIDDEN-UNJUDGEABLE,
   HIDDEN-LOW-SCORE, UNAUTHORED-BRANCH-HALTED (V chose Grok's N-name) with
   REQUIRED_CONDITION_MARK_RECORDS entries and the plan's typed record
   fields; the planned migration (CHECK members + condition_mark columns)
   is the lawful exception this consult authorizes.
5. **Retire** the NODE_REVIEW_UNAVAILABLE loud stop (~:955-958) in favour
   of class-H hiding; envelope/budget refusals untouched. Dead maker
   position after the FULL courtesy = die-loud (DR-176(3)).
6. **The two latent defects:** sparse authoredNodes (XREV loop TypeError on
   any skipped leg) and the pre-flight that terminal-fails a work item for
   one call site's exhaustion (which would also kill a successful
   post-cooldown retry on re-claim).
7. **UI literal retired:** debateTreeUtils.ts 0.35 → register-sourced
   required argument; the null-guard (`strength == null → false`) survives
   VERBATIM (a missing score is never a low score, plan T30).

## DONE WHEN

The plan's mutation obligations (T10, T13, T25–T33 as applicable) named
and red in the ledger (P1); `vitest list` proof (P2); ALL gates green with
REAL pasted output (typecheck, architecture, integration on embedded PG —
including the migration on real PG, full vitest, lint, generate:contract
zero-drift if the contract moves); handoff
`handoffs/RESIL-01-codex-handoff.md`; progress log
`handoffs/RESIL-01-progress.log`; `review` +
`READY FOR PEER REVIEW — RESIL-01`.

## FORBIDDEN

Nothing beyond the authorized plan + Grok's binding conditions — scope
creep past them is a blocking finding; NO standing-stack control (PG 55432
/ API 8790 / UI 3000 stay up; register-hash reseed is the orchestrator's
post-close job); no SERVE-SURVIVING smuggling (mono-maker stays V's open
question); if any step genuinely needs something the plan forbids, STOP
and hand back.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable.
