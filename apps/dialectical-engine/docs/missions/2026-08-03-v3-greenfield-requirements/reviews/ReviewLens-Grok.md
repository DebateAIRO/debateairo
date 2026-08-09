REVIEW LENS HANDOFF COMPLETE
Lens: red-team (Grok)
Verdict: LENS CHANGES REQUESTED

Reviewed (read-only): `00-intake-H0.md`, `wayfinder/map.md`, all 17 tickets under `wayfinder/issues/`, plus upstream `docs/missions/2026-08-02-battery-llm-vs-machine/reports/report-for-humans.md` and `report-for-llm-agents.md`. Research seats not in scope; charting only.

---

## Findings

### 1. Blocker — Battery process vs preserved V2 organs has no composition decision

**Where:** `wayfinder/map.md` §Destination + §Notes (preservation steer, carryover); `00-intake-H0.md` §Inherited context; tickets `02-scoring-behavior-extraction.md`, `04-node-graph-data-model.md`, `05-battery-coverage-matrix.md` (no ticket joins them).

**Evidence:** Destination requires a buildable requirements pack such that ARCHITECTURE starts with **no new V questions**. Intake and map inherit both (a) whole battery law (all 62+9 dispositions) and (b) V's preservation steer: keep QBAF/DF-QuAD, per-node judging, trusted-run reconstruction, qbaf_debug — clean-room as behaviors. Ticket 02 extracts scoring organs; ticket 04 inventories graph shapes for SPLIT/WEIGH/COMPOSE; tickets 05/07/08 disposition battery rows. **No charting ticket asks how the 11-stage battery composes with those organs.** Is QBAF the COMPOSE engine for Q45–Q50? Is the debate tree the same object as Stage 6 children/defeaters? Does SERVE consume qbaf_debug or a new battery serve ledger? Upstream reports describe a battery answering process, not a drop-in of V2's dialectical scorer.

**Bite at ARCHITECTURE:** Architects invent the product topology (battery-as-wrapper vs organs-as-stages vs dual pipelines). That is a product/requirements choice, not a stack choice. Re-grilling V mid-ARCHITECTURE violates destination.

**Fix:** Add a grilling ticket (and map Notes line) — **battery↔carryover composition**: for each preserved organ, name owning battery stage(s) or “not in battery path”; for each battery stage, name whether it reuses a carryover organ, is greenfield, or is adapter-only. Close before tickets 07/08 stamp dispositions as “spec law” for a system whose skeleton is undefined.

---

### 2. Blocker — Authoritative activation graph never lands on the map

**Where:** `wayfinder/map.md` §Not yet specified (absent); all 17 tickets (none owns activation); contrast `report-for-humans.md` §What happens next item 3; `report-for-llm-agents.md` §4 Authoritative activation semantics, ARCH-D3, UNRESOLVED-D1.

**Evidence:** Both upstream reports treat the plan's “always-run” markers vs type-cost table as an **internal contradiction** that must be replaced by one authoritative activation graph before honest cost/race claims. Map coverage law forces dispositions for all 62+9 rows but never forces an activation/trigger graph, tri-state predicates, or V ratification of the LLM-agents candidate table. Ticket 12 mentions “stage ordering and per-question quota” (Grok seat questions) — partial and under-specified; not the activation graph. Ticket 15 race measures include “activated rows” without a frozen activation definition.

**Bite at ARCHITECTURE / race:** MACHINE rows “make zero LLM calls” (VAL-MACHINE-001) and matched-cost race (VAL-COST-001 / ticket 15) are non-comparable if activation is still architecture folk law. Implementers will smuggle defaults — violating the mission's “no silent defaults” principle (ticket 12).

**Fix:** Add research or grilling ticket: **authoritative activation graph** — either adopt the report-for-llm-agents candidate predicates as provisional spec law, or grill V row-trigger by row-trigger / by stage. Wire ticket 15 `Blocked by:` to include it. Promote fog out of “Not yet specified” into a named ticket, not hope that 05's matrix absorbs it.

---

### 3. Blocker — Spec-pack assembly is unowned; destination artifacts 1–2 have no authoring tickets

**Where:** `wayfinder/map.md` §Destination (four artifacts); §Notes execution override (“CARRIES the authoring”); §Not yet specified (“Spec-pack chapter structure”); tickets 01–17 (15 and 16 partially own artifacts #4 and #3; none owns #1 requirements spec or #2 carryover manifest as deliverables).

**Evidence:** Destination = four documents. Ticket 15 settles race/victory criteria (artifact #4). Ticket 16 produces UI boundary contract (artifact #3). Carryover manifest depends on 02 (+ exclusions); requirements spec depends on 05+07+08+09–14. Map says the effort authors the pack once decisions resolve, but wayfinder has **no task/grilling ticket** whose deliverable is “requirements spec.md” or “carryover-manifest.md”. Chapter structure is fog. Reviewer-gate cadence for chapters is fog.

**Bite:** Decision tickets close; map still has no path from rulings → integrated pack. Orchestrator freelances assembly outside tracker, or ARCHITECTURE is told “start from fragments.” Destination's “ARCHITECTURE could start without asking V anything new” fails if the pack is incomplete or unreviewed as a unit.

**Fix:** Add explicit late-mission task tickets (or one multi-deliverable task with acceptance criteria): draft + three-lens review of (1) requirements spec, (2) clean-room carryover manifest; wire them blocked by the union of decision tickets they consume. Decide chapter structure and chapter review cadence in charting (or a 10-minute grill), not as permanent fog.

---

### 4. Major — Clean-room / golden-vector equivalence vs race “beat V2” are not separated on the map

**Where:** `wayfinder/map.md` §Notes (clean-room + golden vectors + four exclusions); tickets `03-golden-vector-plan.md`, `15-race-victory-criteria.md`; charting Q3 vs destination artifact #4.

**Evidence:** Charting requires clean-room reimplementation, golden vectors that `MUST-MATCH` kept organ behavior and `MUST-DIFFER` on four indicted semantics, **and** a race where V3 must beat frozen V2 on measures at matched cost. Map never states the separation of concerns: organ-level equivalence (03) ≠ end-to-end superiority (15). If architects or later tickets collapse them, you get absurd obligations (“match V2 scorer golden vectors end-to-end” while also “beat V2 on substance after replacing four semantics and installing the whole battery”).

**Bite:** Victory criteria written in 15 without explicit non-goals will import organ-match into the race or drop organ-match entirely. Either way the carryover law and the race law fight.

**Fix:** Map Notes + ticket 15 Inputs: freeze two layers — (A) organ golden suite (match/differ per 03), (B) end-to-end race suite (beat/non-inferior on named measures). State that (A) does not imply end-to-end behavioral identity with V2, and (B) must not require matching indicted or battery-new behavior.

---

### 5. Major — Behavior-only requirements vs matched-cost race without a V2 cost-baseline / parity contract

**Where:** `wayfinder/map.md` charting Q5 (stack = ARCHITECTURE); ticket `15-race-victory-criteria.md`; §Not yet specified race harness ownership; `report-for-llm-agents.md` §8.3–8.4 (matched cost, REFERENCE-FULL / PARTITIONED / DIRECT-MATCHED-COST).

**Evidence:** Ticket 15 asks “at what matched cost must V3 beat V2.” Charting forbids stack decisions in requirements. That split is fine **only if** requirements still define the **comparability contract**: same frozen question set, same external tools/cutoffs, cost dimensions V2 can emit **without code change**, what to do when V2 lacks a meter V3 has (or vice versa), and input parity (who feeds both engines). Map parks harness location as fog and leaves V2 cost observability un-ticketed. Ticket 03 may need a V2 run harness; map Out of scope forbids **any change to V2 code**.

**Bite:** ARCHITECTURE invents “matched cost” = tokens on V3 only, or proposes V2 instrumentation that violates the frozen control-arm law. Race becomes marketing, not a control-arm experiment.

**Fix:** Expand ticket 15 (or add research): **race parity & cost observability** — inventory what V2 already logs; forbid control-arm mutation; define cost proxy if native meters missing; define shared input package. Keep harness *location* architecture-adjacent if needed, but freeze *requirements* for parity in this loop. Explicitly gate any golden-vector harness (03) on observe-only / external runner — never “small V2 patches.”

---

### 6. Major — Ticket 03 + Out-of-scope “no V2 code change” is a latent scope violation

**Where:** `wayfinder/map.md` §Out of scope (“Any change to V2 code”); ticket `03-golden-vector-plan.md` (harness may graduate to task); §Not yet specified lines 77–79.

**Evidence:** 03 correctly says do not build a harness in research, but allows graduating a harness task. Map absolute ban on V2 code change has **no corresponding acceptance gate** on that future task. Harvesting organ vectors often tempts probes, debug dumps, or fixture generators inside the control arm.

**Bite:** A later “tiny logging patch on V2 for goldens” contaminates the frozen arm and voids the race epistemology the mission is built on.

**Fix:** Map Out of scope + ticket 03 Scope: any graduated capture task must be **external observe-only** (run existing binaries/tests, parse existing artifacts). If vectors are unobtainable without V2 edits, escalate to V as a charting decision — do not silently authorize control-arm edits.

---

### 7. Major — HumanPolicyState parameters from upstream are not fully ticketed (silent defaults by omission)

**Where:** `report-for-llm-agents.md` §6.1 `HumanPolicyState` + §6.2 injection table; map tickets 09–15 vs that table; ticket `12-human-rules-and-knobs.md`.

**Evidence:** Map tickets cover most of the nine “Decisions only V can make” and several seat add-ons. Upstream machine report also lists parameters that **block honest production claims** if left unresolved:

| Parameter | Map coverage |
|---|---|
| queryAmendment, subjectRelevance | 09 |
| abstention | 10 |
| lineage + criticUnavailable | 11 |
| newHumanRules + several knobs | 12 |
| comparisonValueOwnership | 13 |
| expiry + liveness | 14 |
| adoptionBar / stage11Rollout (partial) | 15 |
| **citationEnforcement** | **missing** |
| **coverageUpgrade** (diagnostic vs validated gate) | **missing** (Q27 residual only implied) |
| **graphMeasurementQuota** | **missing** (not the same as stranger-test coverage) |
| **splitIterationLimit** (regen/critique rounds) | **missing** (12's topic-cap is follow-up topics, not Stage 6 loop caps) |
| orderingPolicy | only as Grok “stage ordering” under 12 — easy to skip in a blitz knob dump |

**Bite:** ARCHITECTURE or programming supplies citation hard-kill, coverage-as-gate, measurement quotas, or split-loop caps as “obvious engineering.” That reintroduces the defect class the battery was written to kill.

**Fix:** Extend ticket 12 (or add 18) as an **explicit HumanPolicyState close-out checklist** mapped 1:1 to §6.1 fields still open after D-GREENFIELD. Each field: V value or named “explicitly deferred with blocked behavior while unresolved” (per report UNRESOLVED semantics) — never omit.

---

### 8. Major — Blocking graph lets disposition/race tickets run before the policies that give them meaning

**Where:** Ticket blockers: `07←05`, `08←06`, `15←05`, `16←01` only; tickets 09–14 `Blocked by: none`; map §Decisions so far / wiring in intake Round closure.

**Evidence:** Ticket 07 turns unanimous MACHINE/HYBRID/LLM labels into “spec law.” Ticket 10's abstention price is required for Q56 to mean anything (report: missing price → UNPRICED, Q56 disabled). Ticket 09 binds HARVEST/WEIGH. Ticket 11 binds CROSS (must **execute**, not merely specify). Ticket 13 binds COMPOSE/SERVE value rows. Ticket 15 may include stranger-test pass rate before ticket 12 sets coverage. Nothing stops blitz from ratifying 07/08/15 first and treating 09–14 as cleanup.

**Bite:** Spec says “Q56 is MACHINE” and “V3 wins race on over-abstention” while honesty budget is still unset — law without parameters.

**Fix:** Wire blockers (or a map Notes sequencing law): policy cluster 09–14 (at least 09, 10, 11, 13) before or inside 07/08 sittings for dependent rows; 12 before 15 if stranger-test metrics are in the victory bar; 11 before any claim that CROSS is race-in-scope.

---

### 9. Major — Keep-UI + MAY FLEX + greenfield repo leaves runtime binding mode unasked

**Where:** `00-intake-H0.md` D-KEEP-V2-UI (“drop-in API vs adapter vs negotiated contract is a grilling question”); charting Q2 → MAY FLEX; tickets `01`, `16`; map Destination artifact #3.

**Evidence:** Intake explicitly listed binding mode as open. Charting answered **flex policy** (when UI may change), not **integration topology** (V3 as drop-in backend vs adapter process vs dual-run). Ticket 16 negotiates per-output fit/adapt/flex for battery fields — necessary but not sufficient for “who serves production traffic under which promotion bar (15).”

**Bite:** ARCHITECTURE must ask V: one process or two, sync or async adapter, whether V2 UI talks only to V3 after win, etc. That is a requirements/product question the map claims to finish.

**Fix:** Add one grilling question under 16 or a sibling: **UI↔V3 binding mode** (drop-in contract / adapter / dual-write) constrained by 15's promotion bar. Keep flex list as the change surface of that mode.

---

### 10. Major — Fog used as decision-dodging for process choices that need no research

**Where:** `wayfinder/map.md` §Not yet specified — especially “Reviewer-gate cadence for spec chapters”; “Whether 08 splits into per-theme tickets”; race harness ownership (partially fair); chapter structure (partially fair until 05).

**Evidence:** Reviewer-gate cadence (per-chapter vs per-milestone) is a pure process ruling — same class as charting Q6 (three lenses, orchestrator merges). Leaving it fog means mid-mission re-negotiation under blitz pressure. Ticket 08's optional split is acknowledged but not owned: under blitz, an unbounded theme fan-out without re-charting breaks “frontier wired” claims.

**Fix:** Grill or orchestrator-recommend-and-V-stamp now: chapter review cadence; max themes / split rule for 08 when 06 lands. Leave only research-dependent fog (UI affordance mapping, harness need) in §Not yet specified.

---

### 11. Minor — Blitz sittings vs wayfinder one-ticket-per-session law is recorded but under-specified

**Where:** `00-intake-H0.md` (“one per session unless V overrides”); `wayfinder/map.md` pace = BLITZ SITTINGS; ticket `10-abstention-semantics.md` (“Expect a full sitting”).

**Evidence:** Override is legal (map Notes). Failure mode is operational: blitz on ticket 10 (honesty budget) or multi-theme 08 produces shallow stamps that later ARCHITECTURE reopens. Not a logical contradiction, but a quality risk against destination hardness.

**Fix:** Map Notes: name tickets that are **blitz-ineligible** (at least 10; possibly 15 and composition ticket from Finding 1) or require explicit V “halt quality” check after each heavy sitting.

---

### 12. Minor — Carryover organ list may be incomplete relative to standing product law

**Where:** Map Notes preservation steer (four organs); ticket 02 organ list; dialectical-engine `AGENTS.md` Proposal B invariants (provider-agnostic LLMProvider, evidence-gated leaves, skeptic certification, anonymized debate, pure propagation, etc.) — not referenced on the map.

**Evidence:** Clean-room carryover is defined by a short organ list from the battery mission steer. V2 also embodies debate/evidence/provider contracts. If those are in-scope for V3 behavioral carryover, they are un-ticketed; if out of scope, map should say so so ARCHITECTURE does not silently import or drop them.

**Fix:** One short grill or map Out-of-scope line: **Proposal B / debate-orchestration / evidence-subsystem / provider interface** — carry as behavior, greenfield, or explicit non-goal.

---

### 13. Minor — Charting never asked the race baseline identity question in plain terms

**Where:** Destination artifact #4; ticket 15; human report race language vs battery-as-unrun-candidate.

**Evidence:** Ticket 15 freezes victory criteria against “frozen V2 engine.” Upstream still says the battery has never beaten “the older checklist or any matched-cost baseline.” Map does not force V to name whether the control arm is (i) current V2 production behavior as-is, (ii) V2 with checklist, or (iii) a future REFERENCE-FULL battery implementation. Those are different races.

**Fix:** One question in ticket 15: **name the control-arm configuration** in one sentence V owns; forbid shifting it after freeze.

---

## Refutations attempted (could not break)

1. **Coverage arithmetic 38 + 24 = 62 and 5 + 4 = 9:** Holds. Ticket 07/08 union matches map coverage law; three-seat contested provenance annotation requirement is present.
2. **D-GREENFIELD closes human decision #4:** Holds as a product-home ruling (new repo; V2 frozen control arm). Remaining eight human decisions have ticket homes 09–14, 12, 15 (adoption).
3. **Experiments deferred post-prototype:** Explicit V charting Q4; intentional risk, not hidden fog. Did not mark as blocker.
4. **Stack deferred to ARCHITECTURE (Q5):** Internally consistent with “behavior-only requirements,” **except** where race/activation/composition smuggle architecture decisions (Findings 1–2, 5) — those are requirements gaps, not proof that Q5 is wrong.
5. **UI MAY FLEX vs keep UI:** Not a contradiction once read as “keep product surface, allow negotiated small changes.” Failure is missing binding-mode question (Finding 9), not flex itself.
6. **Research tickets 01–04 reading V2 code:** Observe-only inventory is compatible with frozen control arm; not a scope violation by themselves.
7. **Orchestrator merges three lenses (Q6):** Clear mission-scoped spine deviation with V authority; no process hole for this review gate.
8. **Four indicted semantics named and excluded:** Consistently repeated (map Notes, ticket 02 EXCLUDED-BY-RULING). Could not find a ticket that reintroduces them as goals.

---

## What proof would flip this verdict to LENS APPROVED

All of the following on the map (tickets + Notes), not in chat:

1. A **composition** ticket (Finding 1) with V-answer slots and blockers into disposition/spec assembly.
2. An **activation graph** ticket (Finding 2) wired into coverage/race.
3. **Authoring tickets** for destination artifacts #1 and #2 (and review cadence) (Finding 3).
4. Explicit **organ-golden vs E2E-race layering** (Finding 4) and **race parity / no-V2-mutation** gates (Findings 5–6, 13).
5. Full **HumanPolicyState close-out** including citationEnforcement, coverageUpgrade, graphMeasurementQuota, splitIterationLimit (Finding 7).
6. **Blocking/sequence law** so policy tickets inform 07/08/15 (Finding 8).
7. **UI↔V3 binding mode** question (Finding 9).
8. Process fog (chapter cadence, 08 split rule) either decided or ticketed (Finding 10).

Until then, ARCHITECTURE cannot start “without asking V anything new,” so the charted map fails its own destination test.

---

comments read through: goal-packet `grok-mapreview.md` (charting review; no ticket comment stream beyond packet state block).
READY FOR HERMES STAGE REVIEW
)
