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

## Batch 5 — V rulings, 2026-08-22

- **Pg0-a G0 pin set: RATIFIED AS DRAFTED** (`planning/Pg0-a-PIN-DRAFT.md`).
  Tier rules, the enumerated floor deny-list, the EMPTY QUICK allowlist, the
  12-member closed taxonomy, the `INFO < DEGRADED < SEVERE < FATAL` ladder, the
  routing table, the code-registry seed procedure+hash, and the register seed
  rows are pinned. The three deferred slots (`zone_manifest_hash` RP-1,
  `hatchet_ingest` RP-2, `injection_corpus_hash` RP-3) remain UNSET by design,
  each carrying its re-pin gate id. Numeric bounds still come to V at G1
  calibration; `obs.blastRadiusMaxReachable` and `obs.canaryWindowMs` remain
  seedless and keep G5 closed until V rates them.

- **E6-02 AMENDED — SINGLE CUSTODIAN.** V verbatim: "One person only should be
  able to approve this, and if we need multiple people to approve of the bot's
  changes we will give them said permissions." The adopted default (V + one
  named delegate, dual control on expansion) is **superseded**: V alone is the
  custodian and sole approver. Additional approvers are a future grant V makes,
  not a precondition.

  **Binding consequence that must not be missed — S17's G0 acceptance drill.**
  The drill as planned asserts *"a re-pin without BOTH custodian tokens fails"*.
  Under single custody that assertion would be a falsehood dressed as a test.
  S17 MUST instead drill the single-custodian property honestly: a re-pin
  without the custodian token fails, and the bundle records exactly one
  custodian. Any later expansion to multiple approvers is a re-pin that changes
  the recorded custodian set. This propagates to: `planning/FinalPlan.md` §G0
  acceptance, the S17 ticket (`t_f6593842`), and the Pg0-a card (`t_192aaea9`).
  Recorded here so the drill asserts what is true rather than what was assumed.

## Batch 6 — V rulings, 2026-08-22 (registry pin + glob hole)

- **`code_seed` = SET A, 276 members**, sha256
  `65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451`
  (= `direct` 234 ∪ `forwarded` 42, via the 7 pinned forwarders). Full coverage
  chosen over the simpler extraction path: all 276 codes are known to the
  registry, so errors record with their real code and typed template instead of
  degrading. Ratified together with the §3.2 recipe, the canonicalization, and
  the enumerated values — not a black box. `known_gap` (7,
  `d1e9b67d…`) and `forwarder_manifest` (7, `e2f70b4b…`) pinned unchanged.
  **Router-verified: all five hashes reproduced independently from the frozen
  tree at `29f370e` before ratification.**

- **§2 "production file" glob WIDENED to `packages/**/src/**`.** The ratified
  `packages/*/src/**` silently missed `packages/battery/decision/src/index.ts`
  — a real workspace package nested one level deeper carrying real error codes
  (Router-confirmed present). Because that same glob decides which files the
  future fix agent may touch autonomously, the file sat **unclassified**:
  neither clearly allowed nor clearly denied. That is a fix-authority hole, not
  a bookkeeping one. The deny list is unchanged and still governs everything on
  the floor; this only corrects which files are recognized as production source
  at all.

- **Pg0-a ask-item 2 ("name the second custodian") is STRUCK** — void under the
  Batch-5 single-custodian amendment.

### Standing rule earned this round (binding, mission-wide)

**A pin whose expected value cannot be computed by a party that has never seen
the implementation is not a pin.** The Router's original §7 ("ratify the
procedure and the resulting hash") failed this and the defect was invisible
because the sentence *sounded* like a pin. Every future acceptance criterion
that names a hash, a baseline, or a target set must state who can compute the
expected value, from what frozen referent, without access to the artifact under
test. Known live application: **S17's bundle-hash criterion fails the same test
one level up** — S17 owns the bundle FORMAT and LOADER, so pre-pinning a hash
of the file is impossible without self-certification. Fix specified: pin
**content, not bytes**, via a canonical format-independent projection
("Pg0-b", a Router act). **S17 must not be dispatched against its bundle-hash
criterion until Pg0-b exists.**

## Batch 7 — V rulings, 2026-08-22 (id policy + roster restart)

- **`id` parameters: DECLARED KINDS, NOT SHAPES.** An `id` template parameter
  must name WHICH id it is — `run_id`, `node_id`, `debate_id` — from a closed
  list of lawful kinds. Provenance, not pattern. A session id or asker id has no
  lawful kind to declare, so it becomes **inexpressible** rather than merely
  rejected by a regex. This settles the residual the security lens proved
  unfixable by shape: a bare UUID is the ordinary form of both a lawful run id
  and an unlawful session id, so no pattern can separate them. Supersedes the
  shape-matching approach for the `id` type; the shape checks remain as a
  secondary sanity filter, never as the guarantee.

- **ROSTER AMENDMENT A5 — the trifecta.** V verbatim: *"restart the
  orchestration mission. Opus. 5 coordinator, Codex coder agent and only Grok on
  the review. I want to see how this trifecta works."*

```yaml
loop_ownership:                       # amended; supersedes A3/A4
  coordination:  [claude-opus-5]      # orchestrator / Claude-Router seat
  programming:   [codex@gpt-5.6-sol]  # sole coder, unchanged
  qa_review:     [grok-4.6]           # SOLE reviewer — Opus is OFF review
  architecture:  [claude-opus-5]      # retained from A4 for plan corrections
```

  Consequences: **A3's Grok decommission is LIFTED** (Router-probed `ALIVE`
  before seating — verified, not assumed). **Claude Opus is removed from the
  review lenses.** The three-blind-lens diamond becomes a **single Grok
  reviewer**, which is a deliberate reduction in review redundancy: V wants to
  observe this configuration. Recorded plainly so the trade is visible — the
  three-lens diamond caught, across L1 and L2 alone, an evidence-integrity
  violation, a triple-confirmed permission blocker, an excluded-zone breach with
  an existence oracle, an undeployable migration, and a validator that admitted
  card numbers. A single reviewer carries none of that redundancy; findings that
  survived only because a second lens disagreed with a first will not recur.
  This is V's call to make and it is made.

### Batch 7 correction — A5 was recorded TOO BROADLY (Router error, 2026-08-22)

V clarified: *"i only asked that grok reviews the code by itself. Other things,
Opus reviewers gotta get fired with Grok."*

The Router recorded A5 as removing Claude Opus from **all** review. That is
wrong. The correct split:

```yaml
review_ownership:                     # A5, corrected
  code_review:      [grok-4.6]        # Grok ALONE — implementation diffs / slices
  everything_else:  [grok-4.6, claude-opus-5]   # Grok AND Opus, fired together
```

**CODE REVIEW — Grok solo.** Implementation slices: the diff, its tests, its
RED→GREEN evidence, its file contract.

**ALL OTHER REVIEW — Grok + Opus, dispatched together.** Plan and architecture
reviews (the C2 planning diamond, FinalPlan gates), stage/integrity gates,
ticketization diff-checks (H6A), QA→ARCH corrections, and any pin/criterion
adjudication. These fire as parallel independent seats, blind to each other,
exactly as the earlier diamond did.

Consequence for the redundancy note recorded above: it applies **only to code
review**, which is a deliberate, bounded experiment. The cross-checking that
caught the excluded-zone breach and the criterion defects lives in the non-code
gates, and that redundancy is **retained**.

The in-flight Grok review of S02 (`t_8e040ec2`) is a CODE review and is
therefore correctly solo — it continues unchanged.

## Batch 8 — V rulings, 2026-08-26 (zone boundary gate)

- **Zone-file existence checks: GROK'S STRICTER RULE ADOPTED — no filesystem
  metadata on zone files at all.** No content reads, no imports, no directory
  listing, and specifically no hash/size/mtime/mode of the zone-internal files;
  no SQL or schema query against `identity.*`. The three route mounts are proven
  by the resolver's TEXT read of `apps/api/src/index.ts`, not by filesystem or
  HTTP. The identity-table deny set is a string list that gets no existence
  check of any kind. Opus's bounded-stat proposal is REJECTED as specification
  (its reasoning — that the manifest already names the paths in plaintext — was
  accepted as direction but not as licence). Accepted cost, stated plainly: a
  rename of a zone file will not be detected by this mission's own gate.

- **`apps/api/src/mfa.ts`: ZONE FOR NOW, revisit at the security mission.**
  Added to the zone manifest provisionally so its errors become the anonymous
  daily counter rather than fully-captured shared-infrastructure frames. Closes
  the merge-borne leak without foreclosing the permanent answer. Must be in the
  manifest **before** the lane merges onto the `dev`-derived integration base.

- **Zone-boundary resolver custody: ORDINARY SHARED FIXTURE.** `tests/support/zone-boundary.ts`
  is protected by the existing rule making `tests/support/**` read-only to every
  lane — which is what defeats the attack (a lane editing the resolver to point
  at a non-existent block, so the safety test passes while guarding nothing).
  It does NOT join the OBS-R104 self-modification set; that set stays scoped to
  artifacts the fix agent could alter at RUNTIME, and this file is never loaded
  by any running process.

## Batch 9 — 2026-08-26

- **ROSTER A6 (V): Claude Opus reviews CODE until Grok's balance is restored.**
  Grok's Build usage balance is exhausted (HTTP 402, confirmed by a second fresh
  probe). Under A5 it was the sole code reviewer, so code review had no seat at
  all. Opus takes code review as a TEMPORARY substitution; the Grok experiment
  resumes the moment credit is added. **The record will state which reviewer
  saw which slice**, so the comparison V is running stays honest instead of
  silently mixed. Non-code gates continue with the seats available.

- **S07 OWNERSHIP — ARCHITECTURE DECIDED (no V ruling required).** Neither
  proposed route was correct; both assumed a boundary had to move. **S06 already
  owns the branch under its existing contract**: at lane base `7a3ff39` the
  `if (!recorded)` branch is at `:2519-2521`, inside S06's allowed
  `task-catch (declareHatchetWalkingSkeletonTask :2494-2526)`, while S06's
  readonly pin is `:2514` only and does not reach it. **No boundary moves; the
  criterion relocates.** OBS-R064 moves from S07's GREEN to S06's, with S07's
  `forbidden:` retaining `task-catch`/`gateway-seam` verbatim — load-bearing.
  S06 is reworked ONE round as a **contract amendment, not a defect return** —
  the worker is charged no defect — and this is the cheapest possible moment
  because S06's review had not yet been performed, so no approved work is
  invalidated.

  Route (b), a carve-out inside an S06-owned file, was rejected on three
  independent grounds: it would have created the mission's first *sub-declaration*
  region (two owners inside one function body — a new region grammar worse than
  the lawful two-regions-one-file split already in use); S06's peer-reviewed
  artifact would not have been the shipped artifact; and it would have routed
  runner task-failure semantics to a reviewer scoped to kernel/db error
  construction.

  **Optional, non-blocking, default NO:** whether the branch should end as an
  OBS-R063-style wrapper carrying `cause` rather than direct propagation. Saying
  yes would flip L3's in-lane order to S07→S06, reversing the epoch-1 dispatch,
  so it is V's call — but the lane is released now and not held on it.

  Residual noted, out of scope: `acceptance/main.ts:105-113` has the same
  defect shape and `acceptance/**` is granted to no slice.
