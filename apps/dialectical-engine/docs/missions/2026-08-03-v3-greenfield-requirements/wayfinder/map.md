# Wayfinder Map — V3 Greenfield Core Requirements

Label: wayfinder:map
Mission: REQ-V3-GREENFIELD-R1 (`docs/missions/2026-08-03-v3-greenfield-requirements/`)
Tracker: local-markdown — tickets in `./issues/`, research assets in `../research/`, review assets in `../reviews/`
Stranger entry point: [GLOSSARY.md](GLOSSARY.md) (terms, defect register D1–D4, reading guide)
Decision authority trail: [decisions-ledger.md](decisions-ledger.md) (DR records; tickets are containers, DRs are law)

## Destination

The V3 founding charter — a buildable spec pack of four artifacts: (1) the
requirements spec for the new algorithmic core, (2) the carryover manifest as
clean-room behavioral specs of the kept V2 organs, (3) the V2-UI boundary
contract with negotiated flex points, (4) the V3 QUALITY CHARTER (DR-047 — the
race was retired 2026-08-04; V2 is reference, not competitor). Arrived when
the ARCHITECTURE loop could start without asking V anything new.

## Notes

- Method: `/grilling` one question at a time, orchestrator recommendation
  attached to every question; the decisions are V's alone. `/domain-modeling`
  where data shapes need pinning.
- Pace (V ruling): BLITZ SITTINGS — grilling tickets run back-to-back while V's
  attention holds; V says when to stop; the map records the halt point. Research
  tickets are exempt and run in parallel.
- Coverage law (V ruling): ALL 62 battery questions and ALL 9 rules receive
  concrete dispositions in the spec. No row is left contested-silent. The
  three-seat contested provenance is preserved as annotation under each ruling.
- Experiments (V ruling): deferred until after a working prototype; they never
  gate the spec.
- Requirements constrain BEHAVIOR only; the stack is the ARCHITECTURE loop's to
  propose and V's to ratify there.
- Carryover is CLEAN-ROOM: no V2 code is copied; kept organs are re-specified
  from behavior and reimplemented in V3. Equivalence is protected by golden
  vectors (ticket 03); the four indicted semantics (unjudged-node fallback,
  hardcoded aggregation choice, exact-string dedup, provenance-blind serving)
  are excluded by name and must NOT be reproduced.
- Review gates: three lenses — Codex: machine-executability/spec-precision,
  Grok: red-team, Hermes: human-readability/stranger-test — all read-only. THE
  ORCHESTRATOR (Fable) merges verdicts and adjudicates lens disagreements
  (V ruling 2026-08-03: at every multi-agent convergence point the orchestrator
  merges, never one of the workers; mission-scoped extension of spine H3).
- Execution override (wayfinder "Plan, don't do"): this effort CARRIES the
  authoring of the spec-pack artifacts once decision tickets resolve — the
  destination is the documents themselves.
- Inherited standing law: whole-graph stranger test (every node and the verdict
  restatable by a stranger; coverage knob is ticket 12); preservation steer
  (node-by-node reasoning and scoring machinery kept — as behaviors, not code);
  merged partition 10 MACHINE / 27 HYBRID / 1 LLM / 24 CONTESTED.
- Ruling ownership law (anti-drift): `00-intake-H0.md` §Charting rulings OWNS
  the charting rulings' full wording; the ledger indexes them as DR-001..007;
  this map only orients. On any conflict, intake wins, then the ledger's later
  DRs supersede per their `supersedes` field.
- Status vocabulary: `open` + all blockers resolved = FRONTIER (routable);
  `open` + any unresolved blocker = BLOCKED (not routable); `resolved` =
  closed with an Answer. A themed/batch grilling ticket may close ONLY when
  every row it settles has a DR in the ledger.
- Sequencing law (blitz order for sittings): policy cluster first — 09, 10,
  11, 13, 14, 12 (12 rules R6–R9 terminally BEFORE 07/20 stamp any rule row),
  then 26, 28; then ratification/themes — 07, 20, 19, 22, 23, 21, 25, then 24
  (after 10), 15 (after 12), 16 (after 10, 13); authoring 29/30 + 17; gate 31.
  Blitz-ineligible (own sitting, explicit quality-halt check): 10, 15, 28.
- ~~Race layering~~ — SUPERSEDED: DR-033 killed V2-conformance testing and
  DR-047 retired the race itself. V2 = reference only; V3 answers to the
  Quality Charter (ticket 15's Answer).
- Review cadence: per-artifact three-lens review at 29/30/15/16; ONE
  additional pack-level lens gate at 31. Orchestrator merges every gate
  (DR-006).

## Decisions so far

Pre-map rulings recorded at intake ([00-intake-H0.md](../00-intake-H0.md)):

- [D-GREENFIELD](../00-intake-H0.md) — V3 lives in a NEW repository; closes the
  reports' human decision #4 (replace/wrap/repair: none — a new home). V2 =
  prototype reference only; the race was RETIRED (DR-047) and artifact #4 is
  the Quality Charter.
- [D-KEEP-V2-UI](../00-intake-H0.md) — the V2 UI survives; binding mode ruled below.
- Destination = BUILDABLE SPEC PACK (charting Q1) — the four artifacts above.
- UI binding = MAY FLEX (charting Q2) — small UI changes allowed where the old
  contract genuinely can't express battery outputs; negotiated in ticket
  [16 — UI flex negotiation](issues/16-ui-flex-negotiation.md).
- Carryover = CLEAN-ROOM FROM SPEC (charting Q3) — nothing is copied.
- Coverage = ALL 62+9 HANDLED; experiments post-prototype (charting Q4, V custom
  ruling).
- Stack = ARCHITECTURE DECIDES (charting Q5) — behavior-only requirements.
- Review gate = THREE LENSES, ORCHESTRATOR MERGES (charting Q6, V amendment).
- Pace = BLITZ SITTINGS (charting Q7).

<!-- closed tickets append below: - [title](issues/NN-slug.md) — one-line gist -->

- [01 — V2-UI boundary contract map](issues/01-ui-boundary-contract-map.md) —
  14 consumed surfaces over two mutually exclusive transport seams; abstentions,
  defeaters, and value-weights have NO landing place today; `score_provenance`
  is already on the wire but unread. Ticket 16 is now unblocked.
- [04 — Node-graph & reasoning data-model inventory](issues/04-node-graph-data-model.md) —
  three disjoint graph models (persisted tree with zero edge rows; in-memory
  QBAF with real weighted edges; flat DF-QuAD kernel); COMPOSE is unanswerable
  in principle on the persisted model; judge panel already computes-and-discards
  a ready-made stranger field.
- [05 — Battery→spec coverage matrix](issues/05-battery-coverage-matrix.md) —
  split verified (10/27/1/24; rules 5/4), 28 contested rows in 7 dispute
  clusters; SIX orphaned V-parameters found and re-homed into ticket 12;
  R9/Q27/Q28 carry pre-ruling text and are named exceptions in ticket 07
  (Q26's constraint travels with theme ticket 21 — it is contested);
  missing activation-table owner fixed by new ticket
  [18](issues/18-activation-table.md). Tickets 07 and 15 are now unblocked.
- [06 — Contested-row decision briefs](issues/06-contested-decision-briefs.md) —
  7 themes over exactly 28 rows (checksum PASS); only TWO dispute generators
  (labeling convention vs does-typed-state-finish); most rulings token-neutral —
  the label decides what the spec forbids; theme 5 largely self-resolves from
  the merged contract's own triggers.
- [08 — Contested-cluster rulings](issues/08-contested-cluster-rulings.md) —
  SPLIT into theme tickets [19](issues/19-theme1-framing-labels.md)–[25](issues/25-theme7-recomposition.md)
  per the briefs; 24 (theme 6) is blocked by abstention ticket 10, the rest
  join the frontier.
- [02 — Scoring-machinery behavioral spec extraction](issues/02-scoring-behavior-extraction.md) —
  clean-room specs for all four organs with literature golden vectors
  reproduced; all four indicted semantics pinned to file:line and reproduced
  numerically (root 0.96875 from four unjudged children; v1 0.96875 vs v2 0.5
  on the identical tree; dedup inflation 0.40→0.784). Three V-confirmations
  surfaced (trusted-run mapping, Model B fate, flag baseline) → new grilling
  ticket [26](issues/26-carryover-scope-confirmations.md).
- [18 — Authoritative activation table](issues/18-activation-table.md) —
  3 always / 53 trigger / 6 policy-gated; the 43 `·A·` markers RETIRED as an
  activation concept; the "13-question lookup" savings figure irreproducible
  (minimal lookup ≈ 35 rows); fourth state POLICY_BLOCKED forced; 17
  V-DECISION flags all routed; 19th knob (visible-fallback approval) and a
  budget-override policy added to ticket 12; the coverage proof gains a
  runnability column beside disposition.
- [03 — Golden-vector harvest plan](issues/03-golden-vector-plan.md) —
  fixtures INSUFFICIENT and the production DB is GONE (backup question to V in
  ticket 26); narrow fake-judge recorder harness needed → task ticket
  [27](issues/27-golden-vector-recorder.md) (blocked by 26 + an execution
  gate); 10 vector families, three-way marking with zero-UNPINNED as a
  spec-readiness gate; indictment (a) is really four defects and a possible
  FIFTH indictment (constant judge weights) awaits V's ruling in 26.

## Ticket index (complete board; frontier = FRONTIER rows in sequencing-law order)

| # | Ticket | Type | Status | Blocked by |
|---|---|---|---|---|
| [01](issues/01-ui-boundary-contract-map.md) | UI boundary contract map | research | resolved | — |
| [02](issues/02-scoring-behavior-extraction.md) | Scoring behavior extraction | research | resolved | — |
| [03](issues/03-golden-vector-plan.md) | Golden-vector plan | research | resolved | — |
| [04](issues/04-node-graph-data-model.md) | Node-graph data model | research | resolved | — |
| [05](issues/05-battery-coverage-matrix.md) | Coverage matrix | research | resolved | — |
| [06](issues/06-contested-decision-briefs.md) | Contested decision briefs | research | resolved | — |
| [07](issues/07-ratify-unanimous-batch.md) | Ratify unanimous batch (exceptions R9/Q27/Q28) | grilling | FRONTIER (after 12 per sequencing law) | 05 ✓ |
| [08](issues/08-contested-cluster-rulings.md) | Contested umbrella | grilling | resolved (split → 19–25) | 06 ✓ |
| [09](issues/09-evidence-policy.md) | Evidence policy | grilling | FRONTIER (1st) | — |
| [10](issues/10-abstention-semantics.md) | Abstention semantics (blitz-ineligible) | grilling | FRONTIER (2nd) | — |
| [11](issues/11-lineage-policy.md) | Lineage policy | grilling | FRONTIER (3rd) | — |
| [12](issues/12-human-rules-and-knobs.md) | Human rules (terminal R6–R9) + 19-knob register | grilling | FRONTIER (6th) | — |
| [13](issues/13-value-weight-ownership.md) | Value/weight ownership | grilling | FRONTIER (4th) | — |
| [14](issues/14-staleness-expiry-policy.md) | Staleness/expiry + liveness | grilling | FRONTIER (5th) | — |
| [15](issues/15-race-victory-criteria.md) | ~~Race criteria~~ → Quality Charter per DR-047 | grilling | resolved | 05 ✓, 12 ✓ |
| [16](issues/16-ui-flex-negotiation.md) | UI flex + binding mode | grilling | BLOCKED | 01 ✓, 10, 13 |
| [17](issues/17-v3-repo-bootstrap.md) | V3 repo bootstrap plan | task | BLOCKED | 29, 30 |
| [18](issues/18-activation-table.md) | Activation table | research | resolved | — |
| [19](issues/19-theme1-framing-labels.md) | Theme 1: framing labels | grilling | FRONTIER | — |
| [20](issues/20-theme2-presearch-rules.md) | Theme 2: pre-search + rules R3/R4/R6/R8 | grilling | FRONTIER (after 12) | — |
| [21](issues/21-theme3-decomposition-loop.md) | Theme 3: decomposition loop | grilling | FRONTIER (after 11, 12, 28) | — |
| [22](issues/22-theme4-evidence-appraisal.md) | Theme 4: evidence appraisal | grilling | FRONTIER | — |
| [23](issues/23-theme5-row-boundaries.md) | Theme 5: row boundaries (fast-clear) | grilling | FRONTIER | — |
| [24](issues/24-theme6-readable-output.md) | Theme 6: readable output | grilling | BLOCKED | 10 |
| [25](issues/25-theme7-recomposition.md) | Theme 7: recomposition | grilling | FRONTIER (after 28) | — |
| [26](issues/26-carryover-scope-confirmations.md) | Carryover scope confirmations (7 items) | grilling | FRONTIER (7th) | — |
| [27](issues/27-golden-vector-recorder.md) | Golden-vector recorder (observe-only) | task | BLOCKED | 26 + execution gate |
| [28](issues/28-battery-carryover-composition.md) | Battery↔carryover composition (blitz-ineligible) | grilling | FRONTIER (8th) | — |
| [29](issues/29-author-requirements-spec.md) | Author requirements spec | task | BLOCKED | 07, 09–14, 19–26, 28 |
| [30](issues/30-author-carryover-manifest.md) | Author carryover manifest | task | BLOCKED | 26, 28 |
| [31](issues/31-spec-pack-assembly-gate.md) | Spec-pack assembly + acceptance gate | task | BLOCKED | 15, 16, 29, 30 |

Inventory: 7 research (all resolved) · 17 grilling (1 resolved-by-split) · 5 task.

## Not yet specified

- Spec-pack chapter structure — graduates once the coverage matrix
  ([05](issues/05-battery-coverage-matrix.md)) and first rulings land.
- Which battery-output families flex the UI vs adapt vs drop — sharpens after
  [01](issues/01-ui-boundary-contract-map.md); the decision lives in
  [16](issues/16-ui-flex-negotiation.md).
- ~~Whether golden-vector capture needs a harness~~ — RESOLVED: harness
  needed, graduated into task ticket
  [27](issues/27-golden-vector-recorder.md) (blocked by 26; execution-gated).
- Reviewer-gate cadence for spec chapters (per-chapter vs per-milestone).
- V3 repo founding layout (docs-first skeleton) — sharpens in
  [17](issues/17-v3-repo-bootstrap.md).
- Race harness ownership and where it lives (old repo / new repo / third
  place) — architecture-adjacent fog; only its REQUIREMENTS belong here, via
  [15](issues/15-race-victory-criteria.md).
- How the five typed abstentions map to UI affordances (depends on
  [01](issues/01-ui-boundary-contract-map.md) +
  [10](issues/10-abstention-semantics.md)).
- ~~Whether contested-cluster ticket 08 splits~~ — RESOLVED: split into theme
  tickets 19–25 when the briefs landed; clusterings of 05 and 06 aligned.

## Out of scope

- Stack/framework choice and module decomposition — ARCHITECTURE loop (V,
  charting Q5).
- Implementing the adapter, the UI changes, or any V3 code — later loops.
- Running the three experiments — post-prototype (V, charting Q4).
- Building the race harness — post-spec.
- Any change to V2 code — V2 is the frozen control arm. (The observe-only
  boundary gates sketched in the prior mission are a separate effort if V
  revives them.)

## Comments

<!-- append-only -->

- **2026-08-05 — MISSION CLOSED.** Destination reached: the spec pack was
  accepted (DR-067) and landed as DebateAI-V3's founding commit `e32de26`.
  67 V rulings. All research resolved; all registers closed or delegated
  (DR-064); UI shapes resolve at build-phase mockup reviews. The ARCHITECTURE
  mission opens next in the new repository. Ticket statuses in the index may
  lag this comment — the ledger and intake header are authoritative.
