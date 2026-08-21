# BIND-READINESS — model-evaluator go-live pack (V)

**Mission:** model-evaluator (2026-08-14 → 2026-08-15)
**Status of the module:** `CODED DARK / UNBOUND`. All ten programming lanes merged
(commit `04837f4`), 104 files / 730 tests green. Nothing dispatches models.
**Status of this document:** a go-live review packet, not authority to bind.

---

## How to read this

Charting ruling 11 (V, 2026-08-14) is the whole gate:

> **No automatic go-live threshold** — V says when collected data starts dispatching
> models; until then, collect-only, modules ready to bind.
> — `DebateAI-V3/docs/missions/2026-08-14-model-evaluator/wayfinder/map.md:64`

Restated as a requirement with teeth (FR-0.1 AC2): *no automatic threshold, sample-size
gate, or metric band MAY flip the bind switch without V's explicit order*
(`.../requirements/Requirements.md:23`, enclosing requirement `:18`; ruling map `:581`).
Architecture §6.1 makes it structural: no metric threshold, sample count, scheduled job,
API endpoint, or UI control can author a `BOUND` row
(`.../architecture/Architecture.md:874-886`). "Automatic go-live when metrics cross a
threshold" is an explicit non-goal (`Requirements.md:522`).

So there is nothing to wait for and no number to watch. **The gate is V's signature.**
Everything below is what V should have in hand before signing.

The canonical lane-10 checklist lives at
`DebateAI-V3/packages/evaluator/BIND-READINESS-seat-share.md` (92 lines). This document
is that checklist **plus** every item other lanes' reviewers carried to bind-readiness,
deduplicated into one actionable list. Where an item is *not* on the lane-10 checklist,
it is marked **[NOT ON CHECKLIST]** — those are the ones most likely to be missed.

---

## GROUP A — Hard blockers (nothing binds until these close)

| # | Item | Source |
|---|---|---|
| **A1** | **Resolve the FR-8.0 panel-shape blocker with an approved panel-shape version.** Today `agent_count` is the discovered-panel length and identity is one healthy provider/maker per member. PANEL-01's live proof requires `rootLineage.length === discoveredPanelSize` with distinct root makers equal to panel size. Repeated model/maker seats, distinct root-authorship proof, different-lineage reviewer rotation, producer-grading guards, and M=1 / M≥3 product behaviour all still need live evidence. **This is the blocker most likely to change the shipped shape.** | `packages/evaluator/BIND-READINESS-seat-share.md:3-8,38-41`; `.../requirements/Requirements.md:404-422` (FR-8.0), `:558` (Open question 9 — architecture authors options, orchestrator packs for V); `.../architecture/Architecture.md:17,1018` |
| **A2** | **V issues an explicit bind order** carrying all five mandatory `evaluatorDispatchBinding` fields: provenance, formula/derivation versions, rollback target, panel-shape version, register-source receipt. This is the only path to a `BOUND` row. | `BIND-READINESS-seat-share.md:42-44`; `.../architecture/Architecture.md:874-886`; ruling 11 (`wayfinder/map.md:64`) |
| **A3** | **Source the evaluator isolation set from the register at the composition root (PROG-04 F-3).** `assertEvaluatorProviderIsolation(family, deployment)` trusts a caller-supplied `deployment`; both worker entry points forward it verbatim and both integration tests pass `{configuredProviders: []}`, *which makes the assert vacuous in those runs*. Hermes made it a binding board comment: do not accept a vacuous or caller-invented `deployment.configuredProviders` set as the structural isolation proof. | `.../reviews/PROG-04-opus2-review-1.md:109-111`; unchanged at r2 `PROG-04-opus2-review-2.md:48`; binding handoff `PROG-04-hermes-stage-verdict.md:61`; `BIND-READINESS-seat-share.md:45-47` |
| **A4** | **Add and bind a validated register reader for `evaluatorSeatSharePolicy`.** The row key, `registerVersion` and `sourceRef` are validated, but nothing reads `register.register_row` — the policy is entirely caller-supplied. Architecture §6.4 lists register-sourced policy shares and formula version among the allocator's inputs. | `.../reviews/PROG-10-opus2-review-1.md:201-206`; `BIND-READINESS-seat-share.md:48-49` |
| **A5** | **Close PROG-04 F-1 before the tagger acquires a production call site.** Evaluator tag artifacts under a product `run_id` could fire a `PROVIDER_MODEL_VERSION` revision trigger feeding `has_open_trigger` → retirement decisions. Fixed by null-run scoping, but flagged as must-close "before the wiring lane gives the tagger a call site **and before any bind-readiness claim**." | `agent-reports/opus2-PROG-04-review.md:37`; `.../reviews/PROG-04-opus2-review-1.md:103` |

> **Naming trap:** the finding is written `F-3` (hyphenated) in the review files and
> cited as "F3" in lane-10 docs. Grepping `F3` returns nothing.

---

## GROUP B — Formula receipt V must ratify (lane-10 checklist §1)

The implementation fixes the *algorithm*; every numeric value below is a bind-time
decision that only V can make. All at `packages/evaluator/BIND-READINESS-seat-share.md:10-34`.

| # | Ratification | Notes |
|---|---|---|
| **B1** | Approve a register-owned `formulaVersion` and the exact **premium**, **normal**, and **cheaper-best** share vectors. | `:11-14` |
| **B2** | Confirm the premium predicate: effective risk tier `high-stakes` **and** the register-owned minimum depth. | `:15-16` |
| **B3** | Confirm **M=1** assigns every requested seat to the sole eligible identity. | `:17` |
| **B4** | Confirm **M=2** uses deterministic largest-remainder rounding over best and runner-up, preserving one runner-up seat when its share is positive and at least two seats exist. In particular a two-seat premium request with a positive runner-up share is **forced to 1/1, even when its raw rounded allocation would be 2/0**. | `:18-22` |
| **B5** | Confirm **M≥3** divides residual share among ranks 3+ by descending reciprocal-rank weights and deterministic largest-remainder rounding. | `:23-24` |
| **B6** | **Require every approved share vector to be monotonic by rank** (`best >= runnerUp >= residual`). A residual share above runner-up can starve rank 2. Reviewer B reproduced **14 cases where rank 2 receives zero seats while rank 3 is seated** (M=3, 2 seats → `[1,0,1]` under a `.5/.2/.3` vector), and an inverted PREMIUM `.2/.8` silently inverting FR-8.1 AC2. | `:25-27`; evidence `.../reviews/PROG-10-opus2-review-1.md:181-189` |
| **B7** | Explicitly approve **M=2 residual handling**: with no residual candidates the residual share is **silently reabsorbed by normalization** into best and runner-up rather than retained or refused. Verified: `.6/.3/.1` at M=2, 10 seats → **7/3, not 6/3**. | `:28-30`; `.../reviews/PROG-10-opus2-review-1.md:191-195` |
| **B8** | Confirm a better-ranked model that is comparably cheaper selects the **cheaper-best** vector for both normal and premium requests. | `:31-32` |
| **B9** | Confirm ties resolve by prowess ordinal, then comparable lower relative cost, then exact provider/model/version code-unit identity. **There is no random draw.** | `:33-34` |

---

## GROUP C — Architecture and safety gates (lane-10 checklist §2)

| # | Gate | Source |
|---|---|---|
| **C1** | **Gateway pooling (the pool-deadlock fix).** Any future provider gateway uses a separate pool or the lock-owning client; it never checks out from the evaluator repository pool while a per-run client is held. Deadlock measured at **14 concurrent distinct-run calls on a max-10 pool**. A concurrency cap is mitigation, *not* the preferred fix. | `BIND-READINESS-seat-share.md:50-52`; `wayfinder/issues/10-seat-share-allocator-dark.md:18-23`; `.../reviews/PROG-06-hermes-stage-verdict.md:56` |
| **C2** | **FR-0.6 AC5 isolation holds.** Evaluator vLLM stays outside `configuredProviderSet` and cannot change panel membership, `agent_count`, or structural-ceiling `envelopeBasis`. | `BIND-READINESS-seat-share.md:45-47`; `.../requirements/Requirements.md:92` |
| **C3** | **Self-routing and existing maker/lineage guards remain preconditions.** | `:53` |
| **C4** | **Live-source audit finds only the explicitly approved bound adapter.** Until then `apps/`, `packages/`, `web/`, `tools/`, `acceptance/` contain zero callers of `allocateEvaluatorSeatShare` / `computeAndPersistShadowDecision` outside the evaluator definition. Hermes independently confirmed `WHOLE_REPO_LIVE_CALL_SITES []`. | `:54-57`; `.../reviews/PROG-10-hermes-stage-verdict.md:30-32` |
| **C5** | **Shadow receipts remain `UNBOUND`, append-only, idempotent, inspectable, and structurally unable to write** `scorecard.routing_decision` or `scorecard.session_assignment` — proven by `has_table_privilege` for `debateai_evaluator_worker`. | `:58-60`; `.../reviews/PROG-10-hermes-stage-verdict.md:36` |
| **C6** | **Rollback restores baseline** `resolveDiscoveredPanel`, allocation, and reviewer selection without reading evaluator ranks or relative cost. | `:61-62` |

---

## GROUP D — Disclosures V must see before signing

### D1. The nine PROG-07 profiling disclosures (on checklist §3)

`BIND-READINESS-seat-share.md:64-86`; mirrored `wayfinder/issues/10-seat-share-allocator-dark.md:27-52`; origin `.../reviews/PROG-07-opus-review-3.md:104-142`.

1. Judge composite scores average a **variable-length penalty vector**; missing add-on evidence and wholly absent bias evidence affect rank differently, and an empty add-on cell is not emitted.
2. Bias context attaches only to JUDGING/REVIEWING prowess and cites the profiled model's ordinal; **AUTHORING has no judge-bias link**. (PROG-07's guard walked only `apps/**`; PROG-10 widened it to all workspace source roots.)
3. Profile strategy receipts remain **caller-supplied** — no register reader, AGGREGATE pipeline event, or judge-selector shadow receipt.
4. Some profile database assertions remain **cosmetic/vacuous** (`expect.any(Number)`, literal phase order, `toHaveLength(9)`).
5. A formerly boundary-named database fixture now honestly produces null contradiction cells under identity linkage; **its names remain stale**.
6. Rank-conflict lookup uses `LIMIT 1` without `ORDER BY` — refusal is correct, but the **reported conflicting row is nondeterministic**.
7. `itemKey` and `subjectMaker` are carried but **unused** by derivation.
8. The rank-movement regression **relies on declaration order** because its query is not scoped by model id.
9. **Leniency is a disclosed run-level rather than item-matched comparison**, because the runner emits one reduced judgement per node.

### D2. Seat-B contradiction sparsity (on checklist, `:88-91`)

Settlement contradiction links to the exact model identity credited with settlement.
Panel peers without identity-linked settlement receive `NONE`; for many judges this cell
is sparse and contributes nothing to composite rank.

### D3. **[NOT ON CHECKLIST]** Sequence-burn disclosure

`computeAndPersistShadowDecision` evaluates `await allocateSequence(client)` as an INSERT
argument, so an **idempotent no-op recomputation still consumes a `ledger.sequence_allocator`
value** even though `ON CONFLICT DO NOTHING` inserts no row. A later admission's
`created_at_seq` shifts (re-measured 32 vs 34). Semantically inert and it does not affect
dispatch — but reviewer B explicitly noted it *"did not reach the checklist"*, and Hermes
made it a **required pre-go-live disclosure**. Confirmed by direct read: no "sequence" line
exists in the checklist. **This item is genuinely open.**

- `.../reviews/PROG-10-opus2-review-2.md:144-149`, `:180-181`; round 1 `PROG-10-opus2-review-1.md:174-179`
- Hermes requirement: `.../reviews/PROG-10-hermes-stage-verdict.md:44`
- Board ticket: `wayfinder/issues/10-seat-share-allocator-dark.md:10-14`
- Tier-6 custody: `agent-reports/hermes-TIER6.md:20`

### D4. **[NOT ON CHECKLIST]** Cheaper-best clause is dormant under thin metering

If either of the top two candidates has `UNKNOWN`/unmetered cost, the cheaper-best clause
**never fires** and the ask falls back to premium/normal. This is correct no-fabrication
behaviour (FR-0.5) — but it means B8 above can be approved and then never take effect.
Not stated next to checklist item 6; V should know.
Compounds with **E5** (metering gaps).

- `.../reviews/PROG-10-opus-review-2.md:158-160`; `PROG-10-opus-review-1.md:207-210`

### D5. **[NOT ON CHECKLIST]** M=1 receipt mislabels the tier branch

A premium high-stakes request against a sole eligible model persists
`selectedVector: "NORMAL"`. The allocation is correct; **the audit trail V reads at bind
is not**. `SOLE_ELIGIBLE` would be honest. Still open at round 2.

- `.../reviews/PROG-10-opus2-review-1.md:197-199`; `PROG-10-opus-review-1.md:196-198`; still open `PROG-10-opus2-review-2.md:150-151`

### D6. Code-point vs code-unit wording inconsistency

The receipt sorts by **code point**; `compareProfileIdentity` (used by the allocator's
identity tiebreak) sorts by **code unit**; checklist item B9 says "code-unit identity".
They diverge only for astral vs U+E000+ characters. Either align the helper or reword the
checklist line.

- `.../reviews/PROG-10-opus2-review-2.md:157-160`

---

## GROUP E — Carried items from other lanes that bear on go-live

| # | Item | Source |
|---|---|---|
| **E1** | **Parked runs have no reset path — deliberately — and must not go unnoticed.** Runs circuit-broken after three consecutive HARVEST failures disappear from batch selection and remain visible only in `evaluator.pipeline_event`. There is deliberately **no automatic reset path today**. Ticket 11 exposes them read-only; reviewer B enumerated the dev-menu DOM and confirmed **no button/input/form descendant — no reset path exists**. Decide before go-live whether operating without one is acceptable. | origin `.../reviews/PROG-05-opus-review-3.md:125-127`; still open `PROG-05-opus2-review-4.md:88-90`; handoff `wayfinder/issues/11-dev-menu.md:23-26`; UI-verified `PROG-11-opus2-review-1.md:126-128`; verdict `PROG-05-hermes-stage-verdict.md:50` |
| **E2** | **Excerpt truncation marker (lanes 06/09).** The shared 4096-byte excerpt cap truncates lane-06 add-on grading material **without a truncation marker**; add one so clipped excerpts are explicit. | `agent-reports/hermes-TIER6.md:19` |
| **E3** | **No stale-claim recovery (lane 09).** Declared intentional and README-documented; reviewer asked it be carried as a **mission-level operational risk**, not left in a lane report. | `.../reviews/PROG-09-opus-review-1.md:206-208`, `PROG-09-opus-review-2.md:177-180`; `agent-reports/opus-PROG-09-review.md:66,79` |
| **E4** | **§6.1 collection-policy register reader still unowned (lane 02).** | `agent-reports/opus-PROG-02-review.md:15` |
| **E5** | **Metering gaps (lane 08).** No production caller / worker composition entry for either metering table; Architecture §3.6 should record the stricter UNKNOWN rule; seven refusal branches untested; idempotency undecided for both repository writes (UNIQUE violations surface raw); the gateway drops observed usage on a schema-failed response (`packages/providers/src/index.ts:272`). **Directly causes D4.** | `agent-reports/opus-PROG-08-review.md:13`; `.../reviews/PROG-08-opus-review-1.md:101` |
| **E6** | **Dev-menu test follow-ups (lane 11).** Add a UI-layer `toContain("UNBOUND")` render assertion for FR-9.2 AC2; add a second DOM-control-enumeration fixture covering unrendered branches (unavailable catalog, populated parked-run data) — **an unrendered branch escapes the darkness guard**. | `agent-reports/hermes-PROG-11.md:29-30`; `wayfinder/issues/11-dev-menu.md:12-16`; `.../reviews/PROG-11-opus2-review-2.md:146,160-163` |
| **E7** | **Architecture §9 standing deferrals that touch go-live:** starter-domain text is ticket-03 HITL with no production seed before V approval; add-on sampling N is register-governed; Codex stdout usage stays unmetered; relative cost covers marginal vendor spend only and the UI must label the normalization basis and unmetered count; blinding must resist indirect identity leaks; and **"the bind ritual remains out of scope"** of this mission. | `.../architecture/Architecture.md:1008-1019` |
| **E8** | **Lane-10 hygiene (cosmetic).** Risk-tier union re-declared inline instead of importing `RiskTier` from `@debateai/kernel`; unreachable dead guard `residualDenominator === 0 ? 0 : …` at `index.ts:2856`; README overstates that the shadow path "may run against a real admitted `core.run`" when the fixture hand-inserts the row; a global `String.prototype.localeCompare` spy is held across awaits in the locale regression test. | `.../reviews/PROG-10-opus2-review-2.md:152-165`; `PROG-10-opus-review-2.md:150-156` |

---

## Bottom line

- **5 hard blockers** (A1–A5) — A1 (FR-8.0 panel shape) is the one that can still change the shipped shape.
- **9 formula ratifications** (B1–B9) — B6 and B7 encode real, reproduced starvation and reabsorption behaviour, not hypotheticals.
- **6 safety gates** (C1–C6) — all currently verified holding, and all are *standing* conditions, not one-time checks.
- **3 reviewer-identified disclosures that never reached the lane-10 checklist** — **D3** (sequence burn, explicitly required by Hermes before go-live), **D4** (cheaper-best dormant under thin metering), **D5** (M=1 receipt mislabel). These are the most likely to be missed at signing, because the checklist V is handed does not contain them.
- **8 carried cross-lane items** (E1–E8) — E1 (parked-run reset absence) and E5 (metering gaps) are operational decisions, not code defects.

---

## Notes on sources

- The canonical checklist is `DebateAI-V3/packages/evaluator/BIND-READINESS-seat-share.md`.
  There is **no `eval-10`/`seatshare` source directory** — `eval-10-seatshare` is the lane
  and branch name; the allocator lives in the shared
  `DebateAI-V3/packages/evaluator/src/index.ts` (~`:2298-2870`), documented at
  `packages/evaluator/README.md:169`.
- There is **no single go-live runbook**, and no literal "go-live gate" document. The gate
  is assembled from FR-0.1, Architecture §6.1, and the lane-10 checklist. The bind ritual
  itself is explicitly out of scope of this mission (`Architecture.md:1017`).
- There is **no mission-local decisions ledger**. The 11 charting rulings live only in
  `wayfinder/map.md:39-65`. DR-179 / DR-181 / DR-182 are cited throughout but their text
  lives in `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` and
  `docs/founding/decisions-ledger.md`.
- Lanes **PROG-04 and PROG-10 have no Grok review** (the Grok outage — see RUN-REPORT.md);
  both were reviewed by two independent Opus seats plus the Hermes verdict.

Paths are relative to `/Users/vladmihaimiron/Documents/DebateAIRO/` unless absolute;
`.../` abbreviates `DebateAI-V3/docs/missions/2026-08-14-model-evaluator/`, and
`agent-reports/` abbreviates
`DebateAI-V3/.hermes/reports/2026-08-14-model-evaluator/agent-reports/`.
