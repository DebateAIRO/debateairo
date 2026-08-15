# ARCH-02 — Grok independent architecture review (round 1)

Reviewer: Grok (independent architecture seat; elected peer for Hermes ARCH-01)  
Artifact under review: `docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md`  
Mission graph under review: `.hermes/reports/2026-08-14-model-evaluator/mission-graph.svg`  
Approved requirements: `docs/missions/2026-08-14-model-evaluator/requirements/Requirements.md`  
Carried notes: REQ-02a round 3 residual non-blocking notes  
Scope: five axes from goal packet ARCH-02. Fresh seat — judgments use only the documents and foundation code cited below, not prior REQ-01 authoring context.

**Verdict: PASS.**

---

## Inputs confirmed

| Input | Path | Status |
|---|---|---|
| Architecture | `architecture/Architecture.md` (1026 lines; status: proposed for peer review; migrations design-only) | Read in full |
| Mission graph | `.hermes/reports/2026-08-14-model-evaluator/mission-graph.svg` | Read; structure cross-checked against §7 lane table |
| Requirements (APPROVED) | `requirements/Requirements.md` (606 lines) | FR inventory checked end-to-end |
| REQ-02a round 3 | `requirements/reviews/REQ-02a-opus-review-3.md` | Four residual notes mapped to Architecture §8 closure |

No other architecture reviews exist under `architecture/reviews/` at filing time; this is `ARCH-02-grok-review-1`.

---

## Axis 1 — Requirements fidelity

Every FR cluster in the approved Requirements.md is architecturally satisfied or explicitly deferred with reason. Mapping:

| FR cluster | Architectural satisfaction | Citation |
|---|---|---|
| **FR-0.1** dark-launch | Two independent controls: collection policy (may run collect-only) vs sealed `evaluatorDispatchBinding` register (absent/malformed → `UNBOUND`). No metric/API/UI can author BOUND. Product API/runner have **no live selector call site**. `shadow_decision.binding_state` CHECK is structurally `'UNBOUND'` only. Dev menu shows state, offers no bind control. | Arch §6.1–6.2, §1.4, §1.7, §3.5 `shadow_decision` |
| **FR-0.2** separate module | `packages/evaluator` + `apps/evaluator-worker`; settlement keeps `answer_outcome` / scorecard cells; Option E only for domain/step. | Arch §0.1–0.2, §1.1–1.5, §2.4 |
| **FR-0.3** writers vs reader | One catalog-selected local consumer; numeric cells code-owned; consumer cannot rewrite ranks; `SELF_ROUTING_FORBIDDEN`. | Arch §2.3, §5.4, §3.7 |
| **FR-0.4** built in this effort | PROGRAMMING lanes 02–11 all in-scope; no deferral to next-mission seed. | Arch §7 |
| **FR-0.5** DR-179 / no fabricated meters | No auth header/keys on evaluator family; usage observed or `UNMETERED`; no estimates. | Arch §2.4, §4.1, §3.6 |
| **FR-0.6** vLLM + **AC5 panel isolation** | Purpose-separated `evaluatorProviderFamily` register row; pinned `provider:evaluator-vllm` / `maker:evaluator-local-vllm`; collision refusal vs `configuredProviderSet`; health only to `evaluator.vllm_*` (never `core.provider_probe`); not passed into `resolveDiscoveredPanel`; mandatory healthy-vs-absent differential QA. | Arch §4.1–4.3, §0.6, §8 map |
| **FR-0.7** profile identity | Exact `(provider, model_id, model_version)` on observations/profiles; maker only for lineage guards. Incomplete model version → loud skip, not maker-merge. | Arch §3.4, §3.5 |
| **FR-1** domain registry | `evaluator.domain` + admission audit + HITL seed as separate 0024 after V approval; post-hoc merge out of scope. | Arch §3.2, §3.9, §1.7 |
| **FR-1.3** domain landing | Dedicated `evaluator.question_domain` only; bans writes to `memory.question_key.question_type` / `declared_field`. | Arch §0.3, §2.4, §3.2, §5.1 |
| **FR-2** tagger | Async `evaluator.tag-question` after ask commit; best-effort; never gates serve; backfill = insert missing `question_domain` only. | Arch §1.3, §5.1 |
| **FR-3.0–3.5** harvest / observations | Evaluator-owned `observation` with Option E columns; zero model calls; consensus full weight via `truth_basis`; settlement FK only when `truth_basis='SETTLEMENT'`; supersession CONSENSUS→SETTLEMENT append-only. | Arch §0.4–0.5, §3.4, §5.2 |
| **FR-4** add-on | Sampled one blind pass; allowlist DTO; `reject_same_maker_addon` on evaluator insert (independent of 0019). | Arch §3.4, §5.3 |
| **FR-5** bias/prowess | Deterministic profile cells + ranks; bias first; isolated unbound judge selector. | Arch §3.5, §5.4, §6.3 |
| **FR-6** metering | `model_call_usage` + `relative_cost_cell`; cross-unit normalization `relative-external-spend/v1`; unmetered explicit. | Arch §3.6 |
| **FR-7** consumer | Versioned `consumer_output`; on-demand + post-aggregate refresh; no numeric write authority. | Arch §2.3, §3.7, §5.4 |
| **FR-8.0–8.2** seat-share | Allocator coded dark with M=1/2/3 algorithm; live integration **explicitly blocked** on panel-shape redesign + V bind; numeric vectors bind-time. | Arch §6.4, §9, graph LIVE BLOCKED node |
| **FR-9** dev menu | Dev-only settings section; enumerated-model picker FK; unavailable/unbound status; no bind control. | Arch §1.7, §4.3, lane 11 |
| **FR-10.1** skeleton/boundary | Full read/write contract, roles, triggers/grants, FR-0.6 hooks, UNBOUND default. | Arch §1–3, §6 |

### FR-0.1 mechanism assessment — **PASS**

Concrete, verifiable mechanisms (not slogans):

1. **Separate collection vs dispatch binding** (§6.1): collection may run while dispatch is `UNBOUND`.
2. **Default/absent → UNBOUND** for `evaluatorDispatchBinding`; BOUND requires V provenance, formula versions, panel-shape version, rollback target.
3. **No live call site**: runner seam (§1.4) keeps product runner free of evaluator repositories; judge selector and seat-share are isolated functions only (§6.3–6.4).
4. **Structural DB belt**: `shadow_decision.binding_state` CHECK forbids any non-`UNBOUND` row until a future migration deliberately widens it.
5. **Role belt**: evaluator roles have no INSERT on `scorecard.routing_decision` / session-assignment / product core mutation paths (§2.2, §3.8).
6. **UI belt**: no bind action on dev menu (§1.7, §6.2).

QA can force collect-only pipelines and still observe that `resolveDiscoveredPanel` / runner dispatch ignore evaluator rank and cost.

### FR-0.6 AC5 panel-isolation mechanism assessment — **PASS**

Concrete, verifiable mechanisms:

1. **Purpose-separated config**: evaluator family is **not** an entry in the flat `configuredProviderSet` list (`{providerRef, adapterKind, maker}` only — no purpose field). Verified against `packages/critique/src/index.ts` `readDeploymentMakerCapability` (accepts exactly those three entry fields).
2. **Pinned identities + collision refusal** at startup if provider/maker appears in configured set (§4.1–4.2).
3. **Probe isolation**: evaluator health writes `evaluator.vllm_probe` / `vllm_catalog_model` only; never `ProviderProbeRepository.record` / `core.provider_probe` (§4.2).
4. **Composition isolation**: `apps/api/src/main.ts` `resolveDiscoveredPanel` maps only `deploymentMakers.configuredProviders` → `probes.readLatest` — evaluator config is not injected (§4.2; foundation confirmed).
5. **Downstream choke point**: runner claim path builds `configuredMakers` from `run.discoveredPanel` (`apps/runner/src/index.ts` ~833–887), so a maker absent from the panel cannot author or review (`selectDifferentMakerReviewer` only sees panel-filtered makers).
6. **Mandatory differential QA** (§4.2): healthy-vs-absent evaluator path → identical `discovered_panel`, `agent_count`, structural `envelopeBasis`, author/review maker populations.

Configuration-shaped influence (the C1 leak closed at requirements) is closed in architecture, not only “evaluator-derived data.”

Deferred with explicit reason (allowed): **live seat-share / multi-seat panel integration** (FR-8.0) — blocked on separate panel-shape design + V bind; allocator still coded and tested in isolation. Starter domain text (FR-1.2), bind-time numeric seat-share vectors (FR-8.2), and post-hoc domain merge remain correctly out of scope or HITL-gated.

---

## Axis 2 — Law compliance

| Law / constraint | Assessment | Evidence |
|---|---|---|
| **Append-only triggers** on every new evaluator table | **Pass** | §3.8 loops all 14 evaluator tables through `core.reject_mutation()` BEFORE UPDATE OR DELETE; REVOKE UPDATE/DELETE from PUBLIC and evaluator roles |
| **Named grants** | **Pass** | Worker INSERT enumerated table-by-table; API INSERT only `consumer_selection`; SELECT lists for source schemas; DDL REFERENCES grants for cross-schema FKs (§3.1, §3.8) |
| **DR-179 no API keys** | **Pass** | Register row forbids `authorizationHeader`/key/token/cloud fallback (§4.1); `source: LOCAL_CONTAINER_NO_AUTH`; forbidden paths §2.4; no key material in architecture SQL or config sketches |
| **No board / review-state mutation** | **Pass** | No write path to ticket/board state; evaluator cannot write `scorecard.routing_decision` or session-assignment; shadow rows have no FK to routing (§2.2, §6.2) |
| **Migrations specified, not applied** | **Pass** | Header and §3: design only; provisional `0023_evaluator_foundation.sql` / `0024_…_seed.sql`; latest applied migration on disk is `0022_dr181_discovery.sql` — no `0023` file exists; `packages/evaluator` and `apps/evaluator-worker` absent (as expected pre-programming) |

Add-on different-maker law uses evaluator-owned `reject_same_maker_addon` comparing `ledger.raw_artifact.maker` — does **not** rely on migration 0019’s `ledger.node_review` trigger (FR-0.2 AC3 / FR-4.1).

Non-blocking implementation note (not a law breach): `debateai_evaluator_api` has no SELECT on `register.register_row`. Product API already reads register for deployment makers; implementers must compose UNBOUND status from the existing product register path (or extend grants deliberately). Architecture’s product-vs-evaluator role split remains lawful if that composition is explicit in ticket 02/11.

---

## Axis 3 — Foundation accuracy

Spot-checks of architecture claims against real code. **No foundation misread that would force REWORK.**

| Claim in Architecture | Foundation check | Result |
|---|---|---|
| Next migration provisionally `0023` after `0022` | `migrations/` ends at `0022_dr181_discovery.sql` | Match |
| `configuredProviderSet` is flat `{providerRef, adapterKind, maker}` with no purpose/role | `packages/critique/src/index.ts` `readDeploymentMakerCapability` validates exactly those three strings | Match |
| `resolveDiscoveredPanel` probes only configured provider refs | `apps/api/src/main.ts:43–56` maps `deploymentMakers.configuredProviders` → `probes.readLatest` | Match |
| `agent_count = jsonb_array_length(discovered_panel)` | `migrations/0022_dr181_discovery.sql:29–30` | Match |
| `envelopeBasis` from structural ceiling / panel size | `apps/api/src/main.ts` `resolveEnvelopeBasis` → `computeStructuralCeilingBasis({ panelSize, ... })` | Match |
| Runner review pool comes from claim-time panel-filtered makers | `apps/runner/src/index.ts` `selectDifferentMakerReviewer` (export ~114) + claim assembly ~833–887 iterating `run.discoveredPanel` | Match |
| `scorecard.answer_outcome.resolver_is_external` TRUE-only CHECK | `migrations/0015_s12.sql:38` `CHECK (resolver_is_external)` | Match |
| Settlement Q59 `EXTERNAL_RESOLVER_REQUIRED` | `packages/settlement/src/index.ts:443` | Match |
| `SELF_ROUTING_FORBIDDEN` in settlement | `packages/settlement/src/index.ts:332` | Match |
| `model_identity` uniqueness includes `observed_as_of` (not triple alone) | `0015_s12.sql` `UNIQUE (provider, model_id, model_version, observed_as_of)`; `packages/db/src/schema.ts` modelIdentity columns | Match — justifies storing exact triple on evaluator rows rather than ambiguous FK |
| `scorecard_cell` has no domain/step columns | `0015` / schema.ts scorecardCell | Match — Option E is required |
| `memory.question_key` append-only + reject_mutation | `migrations/0016_s13.sql` | Match — domain dump site correctly rejected |
| Migration 0019 same-maker guard is on `ledger.node_review` only | `migrations/0019_xrev01_node_review.sql` | Match — evaluator add-on guard correctly independent |
| vLLM adapter exists, not production-selected | `packages/providers/src/index.ts` registers `vllm-openai-compatible-http` / `VllmOpenAICompatibleProviderGateway`; no production configuredProviderSet enrollment for evaluator | Match |
| Append-only / sequence pattern | `core.reject_mutation`, `ledger.allocate_sequence`, settlement_watch grants on sequence_allocator in `0015` — architecture mirrors that pattern for evaluator roles | Match |
| Register tables exist for purpose-specific rows | `migrations/0000_s00.sql` `register.register_row` / `register_version` | Match |

Claims that process observations “are” `answer_outcome` rows are **absent** — architecture explicitly supersedes stale wayfinder wording that proposed process rows in settlement tables (§0 closing paragraph).

---

## Axis 4 — Reviewer-notes closure (REQ-02a round 3)

The four residual non-blocking notes from `REQ-02a-opus-review-3.md` §3:

| # | Note | Architecture resolution | Status |
|---|---|---|---|
| 1 | Pin maker-string for evaluator local family (collision with different-maker guards) | `maker:evaluator-local-vllm` + startup collision refusal vs configured makers (§4.1, §8 note 1) | **Closed** |
| 2 | OQ12 vs ticket matrix (FR-0.6 ownership) | OQ12 resolved: all FR-0.6 work folded into ticket/lane 02; no new ticket number (§0.9, §7, §8 note 2); graph subtitle states “FR-0.6 folded into 02” | **Closed** |
| 3 | FR-0.1 data-scoped wording vs configuration influence | §4.2 isolation + differential panel test cover configuration-shaped influence explicitly (§8 note 3) | **Closed** |
| 4 | FR-1.3 modality nit + cross-schema REFERENCES grant | Architecture selects dedicated link unambiguously; bans question-key domain writes; §3.1 grants DDL `REFERENCES` on `answer_outcome`, `core.run`, ledger artifact/entry ids; runtime roles get SELECT only (§8 notes 4–5) | **Closed** |

No residual REQ-02a note is left dangling as an architecture open question.

---

## Axis 5 — Lane-plan buildability

### Dependencies and merge order

Architecture §7 order:

```text
ARCHITECTURE/V planning-graph gate
  → 02
  → 03 and 08 (parallel after 02)
  → 04 → 05 → 06 → 07
  → 09 and 10 (parallel after their deps)
  → 11
```

Hard dependencies are coherent:

- 02 owns migration number + initial `schema.ts` evaluator mapping (prevents parallel migration races).
- 03 needs schema for registry/question_domain; 08 needs schema for usage tables — both after 02 only.
- 04 tagger needs domains (03) + vLLM path (02).
- 05 harvest needs observation schema (02) and benefits from tag path/domain link; sequential after 04 is conservative and correct for integration tests (nullable domain still allowed).
- 06 add-on after harvest; 07 profiles after harvest + add-on.
- 09 consumer after profiles (+ foundation binding/blinding); 10 seat-share after profiles + metering.
- 11 last: needs stable domain/profile/consumer contracts.

Worktree rules (downstream cut only after prerequisite merges; parallel lanes own disjoint files; no BOUND commit in any lane) are sane for Codex-only coding law.

### Graph fidelity (`mission-graph.svg`)

| Graph element | Matches Architecture §7? |
|---|---|
| V planning-graph gate | Yes |
| Tier 0 / merge 1: Lane 02 foundation + FR-0.6, worktree `codex/eval-02-foundation` | Yes |
| Fan-out A: 03 ∥ 08, worktrees `codex/eval-03-domains` / `codex/eval-08-metering` | Yes |
| HITL starter-domain gate on 03 | Yes |
| Sequential 04 → 05 → 06 → 07 with correct worktree names | Yes |
| Fan-out B: 09 ∥ 10 | Yes |
| LIVE BLOCKED rose node: FR-8.0 panel shape + V bind | Yes — faithful to §6.4 / §9 |
| Lane 11 merge last, depends 03+07+09 | Yes |
| Packet row: `02 → {03 ∥ 08} → 04 → 05 → 06 → 07 → {09 ∥ 10} → 11` | Yes — matches §0.10 and §7 merge sequence |

Graph is legible at 1800×1480: tier bands, numbered merge circles, parallel cyan edges, HITL amber dashed, blocker rose dashed, legend present. Subtitle records FR-0.6 folded into 02.

### Session sizing

Each lane maps to one wayfinder ticket (plus 02 absorbing FR-0.6 by OQ12 design). Lane 02 is the heaviest (scaffold + migration + isolation + binding + blinding DTO) but is intentionally a single foundation session with clear merge gates (module boundary, DB migration tests, panel-isolation differential). Remaining lanes are single-subsystem and fit one CLI session. **Buildable.**

Non-blocking: implementers should treat 02’s panel-isolation differential test as a hard exit gate so FR-0.6 AC5 cannot slip when the lane is large.

---

## Non-blocking notes (do not block PASS)

1. **Lane 02 size** — large but OQ12-intentional; keep AC5 differential test non-optional in the merge gate (already listed in §7).
2. **API register read for UNBOUND display** — clarify in ticket 02/11 whether product register role vs `debateai_evaluator_api` surfaces binding status; not a design contradiction with existing API register use.
3. **Harvest hard-dep on 04** — slightly stronger than the null-domain harvest contract requires; sequential order remains correct and safer for end-to-end tests.
4. **Stale wayfinder ticket text** — Architecture correctly supersedes tickets 05–07 wording that proposed process rows in `answer_outcome` / unqualified `scorecard_cell` writes; programming lanes must follow Architecture, not stale ticket prose.

No blocking findings.

---

## Axis summary

| Axis | Result |
|---|---|
| 1. Requirements fidelity (incl. FR-0.1 + FR-0.6 AC5 mechanisms) | **Pass** |
| 2. Law compliance | **Pass** |
| 3. Foundation accuracy | **Pass** |
| 4. Reviewer-notes closure | **Pass** (all four closed) |
| 5. Lane-plan buildability + graph fidelity | **Pass** |

---

REVIEW VERDICT: PASS
