# REQ-03 — Hermes REQUIREMENTS stage verdict

Mission: `model-evaluator`  
Artifact: `docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md`  
Seat: Hermes-Verifier, independent REQUIREMENTS stage verification  
Date: 2026-08-14

## Verdict

**APPROVED.** The requirements artifact is a sufficient, foundation-accurate input to the ARCHITECTURE loop. No unresolved issue blocks architecture from designing module seams, evaluator-owned migrations, the harvest flow, vLLM purpose separation, or the off-by-default bind switch. Items that require later policy or HITL decisions are explicitly bounded and routed in Open questions rather than left as hidden implementation choices.

## 1. Process integrity — PASS

- H0 and the REQ-01 packet elect Grok as sole requirements author. `Requirements.md` document control records that author seat, and the Grok report records the same role.
- Two Claude Opus reviewer instances used the bounded read-only REQ-02 seat. Their reports state independent formation and scope discipline; reviewer B discloses one incidental grep line from A's artifact and verifies the underlying fact directly, which does not undermine its independent judgment.
- Round 1 produced two REWORK verdicts. Grok rework was resumed under the same session id in the rework launch scripts, satisfying same-session rework custody.
- Reviewer B passed at round 2. Reviewer A found one new blocker, C1, at round 2: evaluator vLLM configuration could leak into panel discovery.
- Grok's second same-session rework added FR-0.6 AC5 and Open question 12. Reviewer A round 3 verified the fix, checked the narrow change set and issued PASS.
- Final peer state is therefore dual PASS. Every blocking finding is resolved; residual notes are either non-blocking architecture inputs or explicitly routed by the requirements.

## 2. Foundation spot-checks — PASS

Five requirement claims were checked against live repository sources rather than accepted from peer-review summaries:

1. **Settlement table is not a process-observation store.** FR-0.2/FR-3.0/FR-3.2 correctly describe `scorecard.answer_outcome`: `migrations/0015_s12.sql:23-59` requires a served answer FK, unit-interval prior/posterior, settlement fields, and a TRUE-only `resolver_is_external`; `packages/settlement/src/index.ts:426-451` independently throws `EXTERNAL_RESOLVER_REQUIRED` for non-external resolution. `packages/db/src/schema.ts:562-590` mirrors the settlement-shaped columns. Evaluator-owned consensus/process tables are therefore the correct required landing.
2. **Scorecard lacks native domain/step axes.** `migrations/0015_s12.sql:61-90` and `packages/db/src/schema.ts:592-617` key cells with model identity, task class, metric, time, and derivation version, with no domain or step columns. FR-3.5's single evaluator-owned `(domain_id, step)` landing default is foundation-compatible.
3. **Question-key backfill cannot use mutation.** `migrations/0016_s13.sql:1-16,100-110` gives `memory.question_key` one unique row per run and installs `reject_mutation`; `packages/db/src/schema.ts:645-661` confirms the nullable `question_type`/`declared_field` shape. FR-1.3/FR-2.2 correctly require a dedicated append-only evaluator link for safe tagging/backfill.
4. **Different-maker precedent is table-specific.** `migrations/0019_xrev01_node_review.sql:14-39` compares raw-artifact makers and attaches `PRODUCER_GRADING_FORBIDDEN` only to inserts on `ledger.node_review`. FR-4.1 correctly requires an equivalent guard on evaluator-owned add-on writes instead of claiming migration 0019 covers them.
5. **Panel identity and the FR-0.6 C1 fix are real.** `migrations/0022_dr181_discovery.sql:21-31` constrains new runs to `agent_count = jsonb_array_length(discovered_panel)`; `packages/db/src/schema.ts:11-31` exposes both fields. `packages/critique/src/index.ts:243-292` reads the flat `configuredProviderSet`, and `apps/api/src/main.ts:43-57` probes exactly those provider refs into discovery. The runner filters configured makers through `run.discoveredPanel` before reviewer selection (`apps/runner/src/index.ts:833-887,1351-1360`). FR-0.6 AC5's purpose separation and differential panel test close the C1 dispatch-composition leak.

## 3. Mission fitness for ARCHITECTURE — PASS

- **Module seams:** FR-10.1 names the intended module home and requires explicit seams to DB, runner, serve, settlement, vLLM, and the dev UI, plus a boundary contract with tables, triggers, grants, and allowed reads/writes.
- **Migrations/storage:** FR-1.3, FR-3.0, and FR-3.5 force evaluator-owned append-only storage for domain links, observations, aggregates, and versioned reader output while preserving settlement write authority.
- **Harvest flow:** FR-3.1–FR-3.4 identify source artifact families, deterministic zero-model-call harvesting, truth basis, blinding boundaries, day-one steps, and write ownership. Architecture can choose timing without inventing semantics.
- **vLLM path:** FR-0.6 owns selection, health degradation, enumeration, and purpose separation; Open question 12 routes ticket ownership without allowing the work or AC5 to disappear.
- **Dark bind:** FR-0.1, FR-8.2, FR-9.2, and FR-10.1 require collect-only behavior and an off-by-default dispatch-influence switch. Formula and panel-shape decisions do not block designing or testing the allocator in isolation.
- **Open decisions:** starter-list approval, harvest timing, add-on sampling, UI placement, bind ritual, Option T, Q59 changes, and live panel redesign are explicitly scoped and routed. None prevents architecture from defining current module seams and coded-dark flows.

## 4. Hard-invariant checks — PASS

- The dark-launch invariant is normative and falsifiable at FR-0.1: evaluator rank/cost cannot steer live dispatch before V's explicit bind; no metric threshold can auto-bind; the dev surface cannot bypass the order process.
- FR-0.6 AC5 extends that protection to configuration-shaped influence by forbidding evaluator vLLM enrollment in discovery, authoring, reviewing, `agent_count`, or `envelopeBasis`.
- DR-179 is a hard requirement at FR-0.5, reinforced in FR-0.6, Boundaries, and subsystem ACs: local vLLM only, no API-key cloud substitute, and no key material in artifacts/config/reports.
- A credential-shaped scan of all 24 readable text files in the mission directory found zero hits. This scan checks material, not harmless prose that names the prohibition.
- Unmetered paths are required to remain null/absent rather than fabricated, with explicit unmetered-call accounting.

## Non-blocking architecture carry-forward

1. Pin a collision-resistant evaluator-local maker identity even though FR-0.6 AC5 keeps it outside product panel guards.
2. Reconcile the ticket matrix's provisional ticket-02 placement with Open question 12 when architecture packages execution lanes.
3. Name evaluator DB roles/grants explicitly in the boundary contract, including any cross-schema settlement-link reference permission.
4. Treat the `0022` panel-count CHECK as enforced for new writes but remember it was added `NOT VALID` for historical-row validation.
5. Preserve FR-0.6 AC5 as the specific executable guard even if architecture also broadens the wording of the general dark-launch invariant.

HERMES STAGE VERDICT: REQUIREMENTS APPROVED
