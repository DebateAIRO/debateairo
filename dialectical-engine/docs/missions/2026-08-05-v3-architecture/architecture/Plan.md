> **Rev 4 — the ratified amendment set, 2026-08-05.**
> **Rev 4 = rev 3 + the thirteen directed amendments A-01…A-13, ratified
> wholesale by V under DR-099** (2026-08-05), accepted *"into Plan.md as a rev-4
> amendment set"* per `architecture/FinalPlan-consolidation.md` §4 conjunct 2.
> The C2 gate is **unfrozen** — VS-1 is ratified (**DR-098**) — and the
> ARCHITECTURE loop is **CLOSED** under **DR-100**, which emits ARCHITECTURE
> SATISFIED on V's authority.
>
> **This block is a RECORD of ratification, not a re-derivation.** Each
> amendment's substance, source gap id, authority and resolved design stay where
> they were authored — `FinalPlan-consolidation.md` §2 and the C4 document named
> as its carrier below. Nothing is restated here and no rev-3 prose is
> re-authored to absorb them. The single text change rev 4 makes in this file is
> **A-01's Plan-side half** — the terminal-route count at §1.6 **AC-65** and the
> kernel test's assertion source at §3.1 **module row 13** — both marked
> *rev 4 · A-01* in place. DR-100's remaining follow-through (folding
> DR-068…DR-097 into the C4 set, minting ADR-0015, removing the CONDITIONAL
> banners, applying A-01's founding-table correction) is C4 and founding-pack
> work, not a Plan.md rewrite, and does not reopen the loop.

| Amendment (`FinalPlan-consolidation.md` §2) | Plan section it amends | Carried by — the C4 document that holds the resolved design |
|---|---|---|
| **A-01** · the terminal-route count is FIVE, and the founding table needs a correction | **AC-65** (§1.6) and **§3.1 module row 13** (`kernel`) | `02-data-model.md` §7.7/§13; `06-test-strategy.md` §6.2 and `FX-LG-04`; `00-overview.md` §4.1; `09` §8.1. Authority **DR-037** + spec §5.2 F-4. **Applied as text in this file.** Its **founding-pack half** — placing the depth-zero no-split route in `requirements-spec.md` §12.3's Home 3, or stating why it is not a member — remains **V's alone**: S-13 reserves that minting authority and architecture cannot make the correction. |
| **A-02** · mint **ADR-0015**, *"The deployment maker inventory: two predicates, not one"* | **§7 row 2** (the fixed fourteen-ADR set) | `01-decisions/README.md` §2 (interim record); specified at `03-module-design.md` §7.3; fixtured by `FX-PRV-01a` / `FX-PRV-01b` |
| **A-03** · `tools/acceptance-bundle` gets a read-only `register` edge | **§2.6** dependency table | `03-module-design.md` §3.1 **edge row 27**; `05-register-skeleton.md` §1.4 (the two rejected alternatives); `06-test-strategy.md` `FX-REG-02` |
| **A-04** · name `apps/scheduler`, and split charter S1's replay obligation into two limbs | **§2.6** and **§2.7** | `03-module-design.md` §1.2, §3.1, §5.5.0; `06-test-strategy.md` `FX-LG-01a` (continuous limb) and `FX-LG-01b` (launch-ceremony limb) |
| **A-05** · the `work_item` table | **§4** | `02-data-model.md` §3.8; `03-module-design.md` §4.4/§9.2/§13 |
| **A-06** · the `evidence`, `critique` and `valuation` schemas, and the composition map's home | **§4**, and **§4.4/§9**'s silence on the claim-type → composition map | `02-data-model.md` §11A.1, §11A.2, §11A.3, and §9.1 (the map's canonical home is `register.register_row`); contents remain V's at DR-023 |
| **A-07** · `JUDGEMENT_SCHEDULED` as a ledger action member | **§4.3**'s closed action-kind vocabulary | `02-data-model.md` §11A.4 (a ledger action kind, not a served typed state — S-13's minting authority is not engaged) |
| **A-08** · ownership for `GET /v1/fleet` and `GET /v1/session` | **§3.1** context map and **§4** | `03-module-design.md` §4.4 (fleet → `battery` read-time projection, no new edge; session → `apps/api`); `04-api-contract.md` §4.3 |
| **A-09** · the bootstrap register read path | **§2.7**'s four toolchain pins | `05-register-skeleton.md` §5.4a (four stable keys, `resolution_scope: bootstrap`, read from `register.bootstrap.json` through the same loader); `06-test-strategy.md` `FX-REG-01`. **Values remain V's at DR-023**, accepted at `07-build-order.md` gate **GPG-3**. |
| **A-10** · data carriers for AC-25, AC-91 and AC-90 | **§4** | `02-data-model.md` §5.6 `semantic_restatement_flag`; §7.10 `shadow_suppression`; §7.11 `answer.verdict_unavailable` (a typed field, **not** a fourth `verdict_state` member) |
| **A-11** · pagination on the execution read | **§5.3** | `04-api-contract.md` §7.5/§7.6 and §4's read table — keyset, ordered by the ledger `sequence`, **no value stated** (AC-74/AC-76) |
| **A-12** · charter A5.2 extended over a provisional *ordering* — **SEAT-PROPOSAL** | nothing by right; an **offered** extension | `05-register-skeleton.md` §3.2a — labelled SEAT-PROPOSAL, the owner/trigger/sign-off triple optional on that row, the row removed from the A5.2-mandated count (7 → 6) |
| **A-13** · six fixture ids the plan's test scope did not name | **§7 doc 7**'s named-additions list | `06-test-strategy.md`: `FX-PT-FLG`, `FX-PT-POS`, `FX-LG-01a`, `FX-LG-01b`, `FX-REG-01`, `FX-REG-02` |

> §2's own tally, carried: **13 amendments** — two structural additions to the
> plan's inventories (A-02, A-04); five vocabulary or data carriers (A-05, A-06,
> A-07, A-10, and A-09's keys); two repairs of a contradiction inside the plan
> (A-01 the count, A-03 the edge); two contract-surface extensions (A-08, A-11);
> one offered discipline (A-12, declinable); one test scope (A-13).

> **Rev 3 — frozen-loop repair annex applied 2026-08-05 (13 directed repairs,
> list in `reviews/merge-verdict-plan-round3.md`); C2 gate FROZEN at rework cap
> pending V steering (morning packet row VS-1).** — **superseded by the rev 4
> block above**: the freeze is discharged and VS-1 is ratified (DR-098); kept as
> the rev-3 record.

# V3 Architecture Plan — ARCH-V3-R1 / C2

Mission ARCH-V3-R1, step C2 · 2026-08-05 · seat: Opus 5 architecture author
(session c2-author). Upstream: the three research digests, `docs/founding/`.

**Rework rounds 1 and 2** (2026-08-05) — revised against
`reviews/merge-verdict-plan.md` (32 findings) and
`reviews/merge-verdict-plan-round2.md` (25 findings), from the Codex and Opus
lenses' reviews and re-reviews. Round 1's largest changes: six dispositions
moved to V-QUESTION where a seat design stood in for a V ruling (C-4…C-9); the
replay ceremony's independence made structural (O-1); a `run` entity added
(O-7); the edge table's undercut and strength-source invariants repaired (C-1,
C-2, O-12); five uncarried obligations given owners (O-8, O-9, O-11, O-14,
O-16). Round 2's: the published arithmetic extracted to one shared module so
the ceremony is independent **without** a second scoring path (O-24, VR-3);
VR-3's operator-independence limb restored (O-23); `run` split into an
immutable frozen head and an append-only progress record (O-26); every graph FK
made graph-scoped (C-11); the eviction rule rebuilt so the conformance record
stays byte-frozen and no third answer-surface state is minted (C-12 ≡ O-27);
organ 4 given the purity fence organ 1 has (O-31); and AQ-4 withdrawn as a
double-disposition (C-15).

> **Status — re-recorded at rev 4, 2026-08-05.** The rev-3 status paragraph
> below is kept verbatim as the rev-3 record and is no longer this file's live
> status. Re-recorded against the rulings, clause by clause, in the same style
> as the rev-4 header — **a record, not a re-derivation**:
>
> - **"SEAT-PROPOSAL throughout" is superseded.** **DR-098** ratifies VS-1: the
>   C2 frozen-gate repairs and the conditional C4 artifact set are *"accepted as
>   the working architecture"*. **DR-100** closes the ARCHITECTURE loop
>   (ARCHITECTURE SATISFIED, emitted on V's authority). This plan is the
>   accepted architecture at **rev 4** — rev 3 + A-01…A-13 per **DR-099**, header
>   block above.
> - **"Nothing in this document is a ruling" still holds**, and is now
>   load-bearing rather than provisional: the rulings live in the ledger and this
>   file records and cites them. Rev 4's header is a record of ratification, not
>   a ruling; §6's dispositions remain dispositions.
> - **"every V-QUESTION in §6" — discharged.** All **28** are ruled at
>   **DR-068…DR-097** (DR-100 conjunct 3). Folding those answers into the C4
>   documents is DR-100's mechanical follow-through and is **not** applied to
>   this file, so §6's rows still read as authored — the ledger is where the
>   answers are.
> - **"V ratifies the stack (DR-005 as narrowed by DR-024)" — STILL OPEN.** That
>   is the pre-S0 gate **GPG-2** (`07-build-order.md` §3.1), and
>   `FinalPlan-consolidation.md` §4 states it is explicitly **not** part of the
>   closure condition: GPG-2/3/4 gate **S0**, the first build slice, not the
>   architecture loop. Nothing in DR-098…DR-100 accepts or replaces the stack,
>   and §9's replacement bound still governs if V replaces it.
> - **The citation discipline in the paragraph's last sentence is unchanged and
>   still binding** (DR-039; AC-76).

**Status: SEAT-PROPOSAL throughout.** Nothing in this document is a ruling.
V ratifies the stack (DR-005 as narrowed by DR-024) and every V-QUESTION in §6.
Where this plan states an obligation, it cites the DR or founding-doc section
that imposes it; an uncited normative sentence in this file is a defect.
— **superseded by the status block above** (rev 4 · DR-098/DR-099/DR-100); kept
as the rev-3 record.

**Reading contract.**
- `spec` = `docs/founding/requirements-spec.md`; `manifest` =
  `docs/founding/carryover-manifest.md`; `ui` =
  `docs/founding/ui-boundary-contract.md`; `charter` =
  `docs/founding/quality-charter.md`; `ledger` =
  `docs/founding/decisions-ledger.md` (DR-001…DR-067).
- Order of authority (spec §2 item 1; manifest §2.2 item 1): **the ledger wins
  over a founding doc; a founding doc wins over a digest.** Both kinds of
  disagreement encountered while writing this plan are recorded in §1.4.
- Vocabulary is `docs/founding/GLOSSARY.md`. Terms coined here are marked
  *(architecture term)* and defined at first use.
- No invented numbers, metrics, thresholds or rules (DR-039). Every constant in
  this plan is either quoted from the pack with its citation or named as a
  register row whose value is V's at DR-023.

---

## 1. Consolidated constraint base

The union of the three digests' hard constraints, deduplicated across
`spec §3` (C-01…C-33), `manifest §6` (C-1…C-30) and `ui §5` — each with its
citation. **This table is the plan's ground truth.** Every later section
references these AC ids; a design element that traces to none of them is
unjustified, and a constraint with no design element carrying it is a gap.

### 1.1 Persistence and store

| id | Constraint | Citation |
|---|---|---|
| AC-01 | **Postgres is the persistence layer, including the product observability layer** — score provenance, the execution-ledger artifact store, the debug views. **There is no second store for observability.** | DR-024; spec §20 W-1; manifest §13.1 C-1 |
| AC-02 | **One store, multiple indexes**: the settlement store, the model ledger and the cross-run memory index are one store, never parallel stores. | spec §20 W-3; §16.5 K-22 (DR-046); §17.7 M-26 |
| AC-03 | **Start from scratch.** V2's production database is gone; nothing in V3 depends on recovering it. | spec §20 W-2 (DR-024) |
| AC-04 | **Keep the property, drop the SQLite accident**: never hold a write lock across a model call; isolate per-member failures; a crash mid-batch leaves completed work durable and resumable; **no storage-engine-specific ordering tiebreak**. | spec §20 W-4; manifest §13.1 C-3 |
| AC-05 | **Nothing is ever deleted.** Retirement is archival: the full graph is kept and auto-revived by the next query through staleness review. | spec §13.2 T-7 (DR-016) |

### 1.2 Replay, determinism, purity

| id | Constraint | Citation |
|---|---|---|
| AC-06 | **Replay law**: V3 permanently refuses to serve a number it cannot recompute from its own frozen records; **no model in the replay path**; continuously self-tested. | DR-034; spec §12.5 S-17; manifest §8.3 |
| AC-07 | **Numbers replay byte-identically; the serve decision replays as stored data** — the conformance verdict is an input artifact, never regenerated. Ceremony independence = a separate execution sharing no code path beyond the published arithmetic. | DR-060(b), DR-063 VR-3; charter S1 |
| AC-08 | **Total, deterministic ordering** of the ledger, and a **deterministic, recorded arrow order** — the left fold is not bit-identical under reordering in IEEE-754. | spec §12.5 S-21; manifest §4.2a, §8.2g |
| AC-09 | **H3 pure propagation**: the graph-scoring math contains no model calls, no file or network I/O, no clock, no randomness and no database access. It is DR-034's structural precondition. | DR-029 H3; spec §19 H3; manifest §11 |
| AC-10 | **Contract-hash discipline**: the contract hash freezes identity/rubric/prompt/schema/reducer versions and invalidates every cached result; it is **excluded from the input hash** and **included in cache identity**; history is never overwritten. | manifest §8.2c–e |
| AC-11 | **Completeness gate**: before an aggregated run is persisted, **every required node** must have ≥1 raw artifact; missing any ⇒ the job fails and no aggregated run is written. **"Required node" is undefined in the pack and is defined here as an architecture term** *(architecture term: **required node** — a node for which a judgement was **scheduled under the running job**)*. **The gate's failure condition is separate from the definition**: the gate fails when a required node has **no raw artifact in any state**, parseable or not. (Folding the failure condition into the definition made the predicate read *"every node with no raw artifact must have ≥1 raw artifact"* — vacuous or contradictory; the two clauses are now kept apart, and it is the predicate C4 carries forward.) The failure condition is exactly distinguishable from AC-13's unconditionally-persisted unparseable artifact, and it is what reconciles the gate with AC-21: **an unjudged node that has ≥1 persisted raw artifact satisfies the completeness gate and takes M1's path** — it emits no arrow, carries a typed record, and the answer serves. Without the distinction the broad reading makes M1's served-with-a-typed-record outcome unreachable and P-D1 unassertable, and the narrow reading makes the gate unfireable. | manifest §8.2f path D; reconciled against AC-21 (DR-028) and AC-13 |
| AC-12 | **Replay eviction**: a component number failing replay is evicted with a typed `MISSING-NUMBER` mark; the rest of the answer serves with a `DEFECT` badge. | DR-059; spec §12.1c S-9e |
| AC-13 | **The raw artifact is persisted unconditionally, parseable or not**, with provider metadata allow-listed before storage and recursively scrubbed. | manifest §8.2a |

### 1.3 Graph and scoring arithmetic

| id | Constraint | Citation |
|---|---|---|
| AC-14 | **One scoring engine** for WEIGH and COMPOSE; no second scoring path anywhere in V3. | DR-030 J1; spec §18 O-1 |
| AC-15 | **One graph, no conversion layer**: SPLIT's children and defeaters **are** the debate graph's nodes and typed edges. | DR-030 J2; spec §18 O-2 |
| AC-16 | **One serving truth**: SERVE reads a new battery serve layer built on the execution ledger; the debug view is that layer's internal facet, not a second answer. | DR-030 J3; spec §18 O-3 |
| AC-17 | **The organ↔stage table is FINAL, no longer vetoable**: scorer → WEIGH+COMPOSE; judge contract → WEIGH; graph shapes → SPLIT object and substrate; spawn plumbing → SPLIT mechanics; ledger → all stages, SERVE reads. LOCK, ROUTE, AIM, HARVEST, RUN, CROSS, SETTLE are greenfield. | DR-056(a); spec §18 O-7; manifest §3 |
| AC-18 | **Edges are stored first-class objects, never derived at read time**, and an edge may target a node that is **not** the source's structural parent. | DR-022 as narrowed by DR-035; DR-030 J2; manifest §6.3; ui §1.2 Edge |
| AC-19 | **The undercut is a typed attack targeting the support EDGE, never the claim node** — architecture inherits it as a requirement. | DR-066(2) |
| AC-20 | **Cycle law at three layers**: construction refuses the cycle-closing edge and redirects to a typed shared-crux sub-claim or an ancestor attack; write rejects it; compute raises a typed error — never a partial result, never a fixed-point approximation. "Circular dependency found" is served information. | DR-056(b), DR-042; manifest §4.2d; charter §5.2 row 10 |
| AC-21 | **M1 — no default τ at any layer.** An unjudged node emits no arrow and carries a typed record. An **unjudged interior node is transparent**: its children's arrows attach to the nearest judged ancestor, with a marker at both ends. Deriving an interior base score from children is forbidden. | DR-028; manifest §4.2e; DR-062 OD-02 |
| AC-22 | **M2 — the operator is declared per parent** on a resolution chain (parent → run → deployment), the supplying level recorded on the number; policy/human declaration costs zero model calls; undeclared ⇒ one bounded declaration call; no declaration ⇒ **the parent number is withheld and components are served**. Both operators computable on demand; the identifier is a recorded run input, never a source literal. | DR-040 Q45; DR-062 OD-22; DR-029 H4; DR-031 Q47; P-D2 |
| AC-23 | **M3 — counting is by provenance.** Sibling support is partitioned by a provenance key; each cluster contributes once, at its strongest member — a gate, not a bonus. Key = underlying study/dataset identity + producing model family; source domain and publisher are fallbacks; producing-run identity always applies; the key is a recorded run input **printed wherever a cluster changed a number**. Counting is otherwise uncapped. | manifest §4.2g; DR-062 OD-09, OD-01 |
| AC-24 | **M4 — way of knowing.** There is **no numeric ceiling on τ** (DR-062 OD-12). Two carriers: (i) **Q51's blocking machine gates** — locator gate, provenance join, reasoning-only downgrade to hypothesis-plus-research-plan — which manifest §4.2h itself labels "the band half" (`RULED — DR-044(Q51)`); and (ii) **a band label naming the way of knowing, resting on charter VR-2 alone**: *"Every band names its abstention-price cell, **its way-of-knowing ceiling**, and whether the rival operator would have flipped it."* **Note on a reading this plan does not assert:** manifest §4.2h's *"The band rule alone carries the consequence"* most naturally refers back to that same band half rather than to a second obligation, so it is **supporting context here, not the authority** — charter VR-2 is sufficient on its own, and whether (ii) is a distinct gate or a display obligation is part of **AQ-1** (§6.10). Labels are `LOOKED_UP \| RAN \| REASONING`. **Owner: context 7 (`serve`), §3.1; carrier in §5.4 and §4.4.** | **charter VR-2** (authority for (ii)); manifest §4.2h (DR-044 Q51 for (i); DR-062 OD-12 for no τ ceiling); spec §18 O-4 → manifest; see **FLAG-1** |
| AC-25 | **F1 — the semantic-restatement flag is non-gating**: it changes no number. | manifest §4.2i; DR-062 OD-08 |
| AC-26 | **Strict-and has no identity element**: every declared conjunct must be judged; any unjudged or abstained conjunct withholds the parent number and its components are served. | DR-062 OD-05 |
| AC-27 | **Arrow strength is closed** — only ever the evidence verifier's grounded score or provenance cluster collapse. No author, policy, model or configuration row may set it freely. | DR-062 OD-06; manifest §4.2c |
| AC-28 | **A contradicting verdict yields an attack arrow with a typed unknown magnitude** — visible, contributing nothing. Unverifiable/pending/absent/malformed yields **no arrow**. | DR-062 OD-04; manifest §6.3 |
| AC-29 | **No sensitivity feedback**: fragility and leverage may never feed back into base scores or arrow strengths — that loop has no declared fixed point. | spec §10.2 C-7; manifest §4.2k |
| AC-30 | **The value overlay never mutates the evidence-scored graph**, enforced by recomputing every strength with the overlay detached and asserting **byte-identity**. | DR-017; spec §15.3 V-6; charter §7 |
| AC-31 | **Position and corroboration are already in the arithmetic** — no factor may re-encode graph position into a base score or arrow strength; what is owed is a per-node position label travelling with the number. Independence failure is a dependence discount, never an independence bonus. | spec §18 O-5, O-6 |
| AC-32 | **Write-time enforcement**: node type, lifecycle vocabularies, non-blank claim, path/depth consistency and acyclicity are enforced at write time, not by convention. | manifest §6.2, §6.4; charter A3.2 |
| AC-33 | **A materialized path is a required capability** — the cheap subtree operator that makes ancestor-triggered invalidation possible. | manifest §6.2 |
| AC-34 | **Per-node record, never a flat `node_id → float` map** — the number is joined to its origin, and the debug facet uses the same record. | manifest §4.3 (D4 clause §10.4), §9.3 |
| AC-35 | **Loud failure on unknown members**: closed declared enums for node types, child kinds, arrow kinds, lifecycle vocabularies, abstention kinds and condition marks. Duplicate identical arrows collapse; one identity carrying two different strengths is a loud typed integrity error, never a silent pick. | manifest §4.4, §6.3, §6.4 |

### 1.4 Providers, models, routing

| id | Constraint | Citation |
|---|---|---|
| AC-36 | **H1 — one provider interface.** All scoring, debate, evidence, metareasoning and orchestration code calls it; never a model SDK or CLI directly. Provider identity is a **first-class configured value, not an import**. | DR-029 H1; spec §19 H1, §14.1 L-3 |
| AC-37 | **H2 — a second provider is addable through configuration alone**, without changing agent, scorer, evidence or semantics code. | DR-029 H2; spec §19 H2 |
| AC-38 | **Multi-maker critique is a launch gate at the DEPLOYMENT level**: standard-and-above tiers execute real different-maker critique from day one; *"a deployment that cannot execute multi-maker at standard+ **does not pass launch**"*; degraded single-maker mode is **transient provider-unavailability handling only** (the DR-014 cap+label path), never a standing standard+ configuration. **Two distinct obligations: a per-run one (S8) and a deployment-level one. Owner of the deployment half: context 16 (`providers`) — the maker-inventory assertion of §3.2 Seam C, refusing standard+ asks and attested in the S15 bundle.** | DR-055; charter S4; spec §14.4 L-12/L-13, §22.1 |
| AC-39 | **Context isolation is checkable**: research and criticism never share a context; the agent that produced an artifact never grades it; agent identity is stripped before another role reads prior turns (H6). | spec §3.8 stage law, §19 H6 |
| AC-40 | **Eight routing guards G1–G8** are mandatory for any routing touching the served lane: separate served/panel lanes, non-zero exploration floor with propensity recorded per decision, version-pinned identity, minimum-n with interval-overlap fallback, multiplicity control, critic lane exempt, no self-routing, route on the class never on the expected answer. | spec §16.5 K-25 (DR-046) |
| AC-41 | **A scorecard is a pure function of the ledger** — no unrecorded smoothing window, no model in the loop, no unfrozen training set. The model ledger is Postgres, in the same store. | spec §16 preamble K-15, §16.5 K-22 (DR-046) |
| AC-42 | **Cell shape and honest reporting**: model id + `model_version` + provider + task class + metric + `as_of` are required keys; `basis ∈ {MEASURED_OUTCOME, MEASURED_PROCESS, EXTERNAL_BENCHMARK, NONE}` with **no ASSUMED, no DEFAULT**; a leaderboard of point estimates is prohibited; a provider's silent model update wakes the cell. | spec §16.2 K-3…K-11 |
| AC-43 | **Cold-start exit must demonstrably execute**, and at t=0 the router must behave exactly as it would with no scorecard at all. | DR-046; spec §16.4 K-20/K-21; charter A5.4 |

### 1.5 Execution ledger, recording, decisions, budget

| id | Constraint | Citation |
|---|---|---|
| AC-44 | **Everything executed is recorded** — attempts, retries, failures, could-not-dos, abstentions, condition marks, typed skips. Two tiers: raw tapes internal, digest user-visible. **No served sentence may imply a check the ledger says did not run.** Raw judge text never reaches a served item. | DR-027; manifest §8.3; charter S3 |
| AC-45 | **Append-only with a total order**: runs carry a monotonic sequence assigned under a write lock; nothing is ever rewritten; the random-identifier fall-through does not carry. | manifest §8.2g |
| AC-46 | **Two stamps on every action row**: `subject_item_id` and `stance_at_action ∈ {SUPPORTS, ATTACKS, NEUTRAL, UNASSIGNED}`, plus typed outcome, actor, timings, input fingerprint. | DR-045; spec §8.1 A-1 |
| AC-47 | **Four reconstruction paths** (rebuild-from-artifacts, stored-result verbatim, resume-partial, completeness gate), each refusing to fabricate a score where nothing was persisted. | manifest §8.2f |
| AC-48 | **Decision→spawn is a pure function** over typed signal bundles with fixed precedence, and **only categorically-grounded decisions may spawn real work; unclassified fails closed to scalar.** The replay identity hash excludes the idempotency key, spawn count and classification fields. | manifest §7.2a–f |
| AC-49 | **Protected core is never budget-skippable**: provenance, abstention typing, standard-and-above blind verification, citation routes, serve-conformance. Every skip carries a visible `SKIPPED-BY-BUDGET`; envelope exhaustion hard-stops with `ENVELOPE_EXHAUSTED` — never a silent timeout. A budget may never deactivate a correctness or safety row. | DR-021 knob 9 + DR-052; spec §19 H8, §21.2 N-11; charter S5 |
| AC-50 | **The stranger sample rate freezes at run start**; the ratchet applies to the next run; conformance coverage derives from it. | DR-052; DR-019 knob 1 |

### 1.6 Serve, wire, interface

| id | Constraint | Citation |
|---|---|---|
| AC-51 | **Serve composition, four steps in order**: machine assembles all computed facts into one structured bundle → one composition model writes the text → a second model judges text↔facts conformance → the machine enforces the verdict. **Pure render was rejected.** The composition model may not introduce a claim, number, hedge or softener with no fact behind it. | DR-044; spec §12.1 S-1…S-3 |
| AC-52 | **Gate order is law**: R9 (node text, pre-compose) → Q53 objection visibility → conformance → Q51 provenance, then the **composed verdict's own post-composition R9 pass**. The conformance judge may never demand an edit that violates R9. | DR-049, DR-057; spec §12.1a S-4…S-5 |
| AC-53 | **`max_recompose = 2`**; the second conformance failure, a failed verdict-R9 pass, or a bundle past the declared hard composition budget each terminate in **components-only + visible `DEFECT`** — never blank, never unchecked prose, no new loop. One fixture per terminal. | DR-049, DR-057, DR-058; spec §12.1a S-7…S-9 |
| AC-54 | **Compose size law**: oversized bundles compose in multiple passes ordered by load-bearing priority, with **honesty fields machine-injected into the output structure outside the composition model's discretion** — silent truncation of an honesty surface is impossible by construction. | DR-058; spec §12.1b S-9a–c |
| AC-55 | **Degraded mode still owes the reader** the reversal point and the builds-on-previous disclosure as **structured projection fields that render without composed prose**. | DR-059; spec §12.1c S-9d |
| AC-56 | **Wire boundary**: the browser receives typed honesty **projections**; the complete fact bundle and the conformance record are fetchable on demand through an **authorized inspection/replay endpoint** — the same handle the replay law needs; internal prompt material is excluded from the default view. | DR-054; spec §12.6 S-22…S-24 |
| AC-57 | **Authorization is asker-scoped**: the asker may replay their own answer's full record on demand (authorization = their session's scope); internal prompt material stays operator-only. | DR-066(1) |
| AC-58 | **The nine honesty surfaces are canonical** and each has exactly one requirement, one UI row and one charter acceptance hook. | DR-048; spec §12.6; charter A2.7 |
| AC-59 | **The kept UI's data layer is rebuilt against V3's native shapes with NO adapter**; the ten never-called V2 surfaces and the dual-transport seam do not survive. | DR-048; spec §12.6 |
| AC-60 | **L5 — one transport**: SSR and the browser read the same contract through the same front door. No second proxy, no hook that fires on some paths only. | ui §1.4 L5 (DR-048) |
| AC-61 | **L6 / E1 — bidirectional no-orphan**: no served field without a consumer, no consumer without a served field; no emitted event without a declared consumer. Both directions of drift are defects. | DR-047 clause 4; ui §1.4 L6, §1.3 E1 |
| AC-62 | **Real pagination**; **reads carry no write side effects**; polling is event-driven or a declared poll with a stated interval. | ui §2 surfaces 1 and 14 |
| AC-63 | **Every number arrives with its origin and its replay handle, or it does not arrive**; the interface never parses prose to learn a fact; typed state travels as typed projection fields. | ui §1.1 clauses 2 and 4 (DR-034, DR-027, DR-054, DR-059) |
| AC-64 | **E4 freshness invariant**: every read of, or subscription to, an answer that occurs after a wake-up must expose that answer's current staleness state. Push and pull are both conforming. | ui §1.3 E4 (DR-015) |
| AC-65 | **The condition-marks enum is closed and centrally owned** — 5 abstention kinds (ignorance-ledger unknowns only) + 22 condition marks + **5 terminal routes** *(rev 4 · A-01)*; spec §12.3's table is the only place a typed state may be minted; sibling artifacts cite, never extend. | DR-051; spec §12.3 S-11…S-13; **DR-037 and spec §5.2 F-4** for the five terminal routes (rev 4 · A-01, ratified DR-099) — the ledger wins over a founding-doc table (§1's order of authority; spec §2 item 1) |
| AC-66 | **Verdict model, two axes**: verdict state ∈ SUPPORTED / CONTESTED / UNSUPPORTED; confidence band separate, and it is the confidence band that DR-014, `UNINSTRUMENTED` and the disagreement flag cap. An abstention is neither. All band numbers deferred to DR-023. | DR-066(3); GLOSSARY "Verdict model"; charter VR-2; spec §12.8 S-27 |
| AC-67 | **One canonical `stranger_restatement` schema**, cited by name and never restated: `{subject_ref, claim, certainty, what_would_change_it, action_consequence, generated_at, check_status}`; `action_consequence` is **verdict-only** (nodes set `NOT_APPLICABLE`); restatements are minted with the node, not at serve time; `check_status ∈ {PASS, FAIL, NOT_SAMPLED}` and blocks serving on FAIL. | DR-061 · OD-S-06; spec §12.7 S-26, S-26a |
| AC-86 | **Serve preconditions — five distinct typed refusals.** Before anything is served: the stored output must have been produced by the ledger, or refused; the items must be a list, or refused; **every** item must validate, or refused; the status string must be known, or refused; no item may reference a node outside the current set, or refused. **Each refusal is a distinct typed reason.** The **replay precondition is per number, not per payload**: an unreplayable number is evicted and the rest serves. | manifest §9.2a (`CARRIED-DESIGN`; `RULED — DR-034 · DR-059`) |
| AC-87 | **Sanitizing on the way out**: re-validate every item; **strip raw judge output**; reduce debug detail to declared version fields or drop entirely; scrub every served reason string for secret markers and **drop rather than serve damaged**; copy optional scalars **only when well-typed**. | manifest §9.2b |
| AC-88 | **Coverage reconciliation**: drop items for non-current nodes; for current nodes with no entry add **typed pending** entries where work is active and **typed error** entries otherwise; then recompute. **Status is derived, never asserted.** | manifest §9.2c |
| AC-89 | **Stale work expires on read**: active jobs past their deadline transition to failed with a typed reason **on every read**, so a stuck job cannot masquerade as work-in-progress. **This sits in direct tension with AC-62 ("reads carry no write side effects").** Disposed in §6.6 UI-13: the *state transition* is performed by a scheduled reaper; the *read* **derives** the failed status from the deadline without writing — satisfying "status is derived, never asserted" (AC-88) and AC-62 simultaneously. | manifest §9.2d × ui §2 surface 14 |
| AC-90 | **Honest-degradation vocabulary**: a missing or malformed input proves nothing and is read at its **honest zero-information value, never guessed**; a verdict with no usable basis degrades to a typed `unavailable`, **never to a number**; a lean with no live supporting or attacking node returns **nothing**, never a fabricated even split. | manifest §9.2e |
| AC-91 | **Suppression carries its unlock, and shadow mode is the precedent**: when a verdict is withheld the reader is told **why in prose** *and* **what would unlock it**; the evidence gate runs in **shadow mode**, publishing what it would have suppressed beside the unsuppressed band; the value overlay reuses this shape. Eligibility = every claim type for which external evidence is possible (the exact complement of §5.2(f)'s evidence-free list), **tiered by risk** (`OD-20`; see §6.3 U-2). | manifest §9.2f (`RULED — DR-062 · OD-20`) |
| AC-92 | **Organ 2's judge contract, in full** (the clauses §3.1 context 4 carries): code-first claim typing with a bounded model call only on `unknown`, recording `substance:`/`enforcement:` per DR-037; direct supporting/attacking children only in child context, stable order, excerpts truncated at word boundaries and marked, non-truncated excerpts byte-identical; prompt honesty constraints (never invent evidence, citations or sources; relevance scored against the question actually asked; counterargument strength against the strongest **real** attack or against plausible counters **while saying so**); five required output sub-objects with all declared numbers validated to `[0,1]` and typed fatal flags; parsing strategies in strict order with **parse failure and schema failure kept distinguishable**; a deterministic reducer with the branch **emitted**, ordered score caps each recording what/to-what/why/by-what, an enumerable uncertainty ladder, drivers in a fixed never-reordered order, typed holes, and a two-directional rationale naming the weakest link; the **claim-type → composition map held as data, never a source literal**; opt-in panels where each member has its own judge role and contract hash; dispersion across ≥2 distinct judgements with a **prepended** driver and **no measurement below two**; correlated-error grouping by family in first-appearance order, non-compounding, unknown families never discounted against each other, raw provider/model strings never embedded in a served weight record; "independence unknown" with a typed reason, never a default of "independent". | manifest §5.2a–m (DR-037, DR-062 OD-16/OD-17, DR-032, DR-013/DR-014/DR-055, DR-028) |

### 1.7 Memory, liveness, settlement

| id | Constraint | Citation |
|---|---|---|
| AC-68 | **No embedding pipeline in the memory path for v1**; the four match tiers (`EXACT_QUESTION → SAME_BINDING → PARTIAL_BINDING → TERM_OVERLAP`) are computable as database predicates over already-frozen fields; `NULL` is never agreement. | spec §17.1 M-1, §17.2 M-4…M-7 (DR-061 · OD-M-04) |
| AC-69 | **Link, never merge**: a typed directed edge with tier, agreed/disagreed fields, decider, timestamp, key version and alias rows used. Identity stays per-run; **there is no transitive closure**; every ambiguous default resolves to "do not link, and say a candidate was found". | spec §17.3 M-9, M-10, M-11 |
| AC-70 | **Pulls are pinned** `{artifact_id, version, content_hash, as_of, staleness_state_at_pull}`; an unpinned pull makes the new answer unreplayable. The prior verdict is **not** evidence; the prior served prose is never fed to any model. | spec §17.4 M-16, §17.5 M-17, M-13 |
| AC-71 | **Scope split**: class-level track-record facts are shared across the deployment; **question-level pulls are per-asker**. | DR-061 · OD-M-20 |
| AC-72 | **Snapshot + wake + propagate**: every node and answer stamped relevant-as-of at spawn; wake-ups fire on watched revision triggers and class-based TTL review clocks; a woken change re-assesses ancestors with a model re-judging **only the affected nodes**; a fired trigger serves with a visible `STALE`/`UNDER-REVIEW` badge, never silently. Staleness is a ceiling and a refusal rule, never a silent multiplier. | DR-015; spec §13.1 T-1…T-4, T-10 |
| AC-73 | **Answers persist `{answer, prior, posterior, basis, resolver, date, provenance}` with read-back verification**; scoring keys on `(answer_id, answer_version, as_of)`; value choices are `PERMANENTLY_UNSCOREABLE` by design and the excluded share is served beside every cell. | spec §3.11 Q60, §16.3 K-13, K-14 |

### 1.8 Configuration, acceptance, process

| id | Constraint | Citation |
|---|---|---|
| AC-74 | **The flag/configuration register is drawn fresh and V-ratified before production**; every inherited numeric constant is source material for a register row and nothing more; constants never live as source literals. | DR-023; spec §20 W-5; charter A3.5 |
| AC-75 | **Naked constants are printed where they are used**, in the served trail — the abstention cell, the provenance key width, a cap, an exploration share, a minimum-n gate. | spec §4 closing; N-4; M-16 |
| AC-76 | **No invented measurements.** A metric, label, threshold or rule enters only with hard facts behind it. | DR-039; manifest §2.2 item 9 |
| AC-77 | **No orphaned modules.** A shipped unit — module, function, endpoint, table, migration, config flag, prompt — is live only if reachable from a **named** entry point and actually called on a real run. The never-called list ships with every release and **blocks** it; exemptions are configuration-class only, granted by V alone, dated. Dead cost is an orphan even when reachable and called. | DR-047 clause 4; charter §5, G1/G2/G5, A4.2, VR-4 |
| AC-78 | **Deferred gates are not shipped dark**: the citation hard-kill gate and coverage-as-gate do not exist as code that cannot fire. | DR-020 knobs 7–8; charter §5.2; spec §22.1 |
| AC-79 | **Every gate is shown to fire both ways before it counts as adopted**; the charter's §5.2 firing-fixture table and the never-called list block the release. | DR-063 VR-1/VR-5; spec §22 Z-1 |
| AC-80 | **Ground truth = two published literature vectors + property tests of V3's own rules.** No conformance test against V2 at any level. | DR-033; spec §22 Z-2; manifest §12 |
| AC-81 | **The clean-room role split is binding**: whoever implements V3's organs may read only the manifest, never V2 source; a missing fact is obtained by amending the manifest, not by looking at V2. The literature vectors are exempt. | DR-003, DR-033; manifest §14 |
| AC-82 | **Greenfield, new repo**: `engineRelationship = GREENFIELD_NEW_REPO`; repo `DebateAI-V3`, no shared git history. | DR-031 knob 1; DR-065 |
| AC-83 | **13 MACHINE rows make zero model calls, proven by the test suite**; the `·A·` always-run marker is retired; a cache hit never sets a row INACTIVE; `POLICY_BLOCKED` must never be filed as INACTIVE. | DR-037; spec §5.1 F-1, §1, §3.13 |
| AC-84 | **Research-upgradeability**: validated findings land as register rows, scorecards or a strategy implementation — **not** as changes to the graph shape, the ledger schema or the serve contract; the expected cost of adoption is a register change plus a re-run. | charter §6, A5.3, A5.5 |
| AC-85 | **One behaviour lives in exactly one place**; two implementations of one behaviour is a defect; every caught failure is typed **and written to the ledger** — a swallowed exception is a defect. | charter A3.1, A3.3, A3.6 |

### 1.9 Flags raised while consolidating

Recorded per the authoring law: where a digest disagrees with a founding doc,
the founding doc wins; where a founding doc disagrees with the ledger, the DR
wins. Both cases occurred.

- **FLAG-1 — M4's content: founding doc vs ledger.** Spec §18 O-4 states M4 as a
  "**way-of-knowing ceiling on the base score** — a cap, never a multiplier",
  and in the same requirement says the M-rules are "specified in the manifest
  §4.2(e)–(i) and not restated here". Manifest §4.2(h) as ratified by
  **DR-062 · OD-12** states **"there is no numeric ceiling on τ"**, and carries
  the way-of-knowing obligation as DR-044(Q51)'s three blocking machine gates
  plus the serving-band rule. **The DR wins**: architecture builds **no numeric
  τ ceiling** (AC-24). The digest's related claim (manifest digest §8 A-11) that
  "any downstream reference to M4 is an invention" is **wrong against the
  founding doc** — spec §18 O-4 names M4 explicitly; M4 is the spec's label for
  manifest §4.2(h). Both halves of this flag are carried into the C4
  open-questions document for V's confirmation; neither blocks this plan.
- **FLAG-2 — verdict-state membership: founding body text vs ledger.** Spec
  §12.8's table says candidate verdict-state members "include supported /
  contested / unsupported / value-conditional / non-answer". **DR-066(3)**
  ratifies the GLOSSARY's canonical entry — verdict state is **SUPPORTED,
  CONTESTED, UNSUPPORTED**; an abstention is neither — and charter VR-2 says
  the same ("Three served states"). The DR wins (AC-66). `value-conditional` is
  Flow A's conditional answer served in DR-053's two labelled sections;
  `non-answer` is a Home-3 terminal route (spec §12.3). This closes spec OQ-G4.
- **FLAG-3 — stale body text against a ratified register.** Spec §4 row 16,
  §3.8, §3.11, §3.13, §8.1, §8.4, §16.5 and §17.7 still read as open on rows
  §23 closed; the UI contract's §6 still lists C10 and C14 as open. DR-061,
  DR-062, DR-063 and DR-066 rule otherwise and the DR wins. Dispositions in §6
  follow the ledger; the un-back-annotated text is recorded here so a later
  reader is not misled.
- **FLAG-4 — clean-room scope over the kept UI. Two questions, not one; both
  queued as AQ-2 and AQ-3 in §6.10.** Manifest §14 binds the clean-room split to
  "whoever implements V3's **organs**" (the six organs of §3), and it is binding
  rather than advisory: *"The two roles must be held by different people or
  different agent seats. A single participant who reads V2 source and then
  writes V3's implementation has voided DR-003 regardless of intent."*
  - **(a) The carry question.** May kept UI component source be carried into
    `DebateAI-V3` at all? DR-048 keeps the V2 UI's components and UX while
    rebuilding its data layer, and manifest §14's prohibition is about the
    organs and about copying V2 **engine** code (DR-003, DR-033), so the reading
    that permits it is available — but it is V's to confirm, not this seat's.
  - **(b) The barrier question.** *If yes*, what structural barrier keeps the
    organ implementers clean? **Consequence, stated plainly: under a single
    workspace in which `apps/web` (V2-derived source) sits beside
    `packages/{propagation,graph,ledger,serve,judgement}` (five organ packages),
    DR-003 has no enforcement mechanism.** An implementer working the `serve`
    slice has V2's serve-adjacent client code in their working tree, their
    editor's search index and every agent's context window; the role split
    becomes an honour system, which manifest §14 explicitly refuses. This seat's
    recommendation is in §2.6: `apps/web` lands in a **separate workspace or
    repository**, import-fenced and separately checked out, with
    `packages/contract` as the only shared artifact — which is what AC-59's
    "no adapter" actually requires (one contract *declaration*, not one
    *checkout*).
  Both are additional to §6.1–§6.6's 56-item disposition set and are counted in
  §6.10, not there.

---
## 2. Stack proposal

Every row is a **SEAT-PROPOSAL**. The stack is architecture's to propose and V's
to ratify (DR-005 as narrowed by DR-024); the only stack constraint already
imposed is Postgres (AC-01). Nothing below is final.

### 2.0 The fixed points this stack must clear

Postgres-only store (AC-01/AC-02) · pure propagation core (AC-09) ·
byte-identical replay with deterministic ordering (AC-06…AC-08) ·
provider-agnostic with a config-only second provider (AC-36/AC-37) · swappable
semantics with both operators computable on demand (AC-22) · the kept UI's data
layer rebuilt against the native API with no adapter (AC-59) · one transport
front door (AC-60) · bidirectional no-orphan enforcement (AC-61/AC-77) ·
closed enums with loud failure (AC-35/AC-65) · constants as register rows, never
source literals (AC-74).

### 2.1 The kept UI's framework — a read, not a proposal

**FACT (from the ui digest, not proposed here).** The kept interface is a
**Next.js (App Router) + React + TypeScript** application: the digest's death
list names `web/app/api/[...path]/route.ts` (App Router catch-all),
`next.config.mjs`, `web/package.json`, `NEXT_PUBLIC_VERDICT_FIRST_UI`,
`web/lib/types.ts`, and `.tsx` components (`DebateTree.tsx`,
`ArgumentFocusView.tsx`, `DebateOutline.tsx`, `SynthesisPanel`,
`VerdictBanner`) (ui digest §3.2, §4.1). **No kept component is proposed for
rewrite** (DR-048 keeps the components and the UX). What changes is the data
layer beneath them (AC-59), the transport (AC-60), and new slots inside
existing components for the nine flex surfaces (ui §4).

### 2.2 Language and runtime

**SEAT-PROPOSAL: TypeScript on Node.js (LTS, version pinned as a register row),
one language across engine, API and interface.**

Rationale, constraint by constraint:
- **AC-59 "no adapter" becomes structural, not aspirational.** The wire types
  the API serves and the types the kept UI consumes are the *same declarations*
  in one package. A cross-language boundary would need a generated mirror, and
  a mirror that drifts is exactly D4's shape ("the defect is the join", manifest
  §10.4) — the disease the pack indicts. V2's own `web/lib/types.ts`
  `DebateDetail` mirror is on the death list for this reason (ui digest §3.2).
- **AC-61's bidirectional no-orphan audit stays statically decidable.** "No
  served field without a consumer" is a reachability question over field
  references, and one type system on both sides of the wire makes it a static
  query — charter G1's "publish the entry-point list it walked" becomes a build
  artifact rather than a manual inventory. **Stated precisely, because the
  clean-room fence (§2.6) splits the checkout:** the producer side is decided in
  the engine's type graph; the consumer side is decided in the fenced
  interface's type graph and **exported as a consumer manifest** the engine's
  audit consumes as a build input. One language keeps both halves machine-decided
  and field-for-field reconcilable; two languages would put a hand-maintained
  schema mirror between them.
- **AC-35/AC-65 closed enums with loud failure** map onto discriminated unions
  plus compile-time exhaustiveness (`never`-check), with runtime closure from
  the same schema declaration. An unknown member fails loudly at both ends.
- **AC-09 purity is a mechanically enforced module boundary**: a package with
  zero runtime dependencies and a lint rule banning `fs`/`net`/`Date`/
  `Math.random`/db imports. Charter A3.4 wants each house rule expressed as a
  gate; this makes H3 a build-time gate rather than a review convention.
- **AC-07 byte-identical numbers** are achievable: JavaScript numbers are
  IEEE-754 doubles and `Number.prototype.toString` is shortest-round-trip, so a
  served number's decimal form is a pure function of the double. Determinism
  comes from the recorded evaluation order (AC-08), not from the language.
- **AC-60 one front door** is simplest when SSR and the browser share one client
  implementation.

**Rejected alternative — Python (FastAPI + SQLAlchemy/Alembic + Hypothesis).**
Strongest property-testing library in any ecosystem and the richest model
ecosystem — but AC-36 already forbids calling model SDKs outside the provider
interface, which flattens most of that advantage, and it reintroduces the
cross-language wire boundary AC-59 exists to delete: two type systems, a
generated schema pipeline, and an orphan audit (AC-61) that cannot be answered
in one pass. Recorded as the strongest alternative; if V prefers Python, the
module map in §3 and the data model in §4 survive unchanged and only §2.3–§2.7
are re-instantiated.

**Rejected alternative — a compiled core (Rust/Go) behind a TypeScript shell.**
Best determinism and performance story, but it splits AC-09's purity gate and
AC-85's "one behaviour, one place" across an FFI boundary, doubles the build and
test toolchain, and raises the cost of charter A5.3's "register change plus a
re-run" for every upgrade that touches the arithmetic.

### 2.3 Web / API framework and encoding

**SEAT-PROPOSAL: Fastify (TypeScript) as the single API service, with the wire
contract declared once as schemas in `packages/contract` and published as
OpenAPI. Encoding: resource-shaped JSON over HTTP.**

- **One front door (AC-60).** `apps/api` is the only implementation of the
  contract. The Next.js app never proxies `/api/*` and never talks to a second
  address; SSR calls the same API through the same typed client, forwarding the
  asker's session scope (AC-57). This kills V2's three-path seam by construction
  (ui digest §3.2) — there is one code path, so a hook cannot fire on two of
  three.
- **Schema-first is what makes the contract auditable.** W1 (ui §5) freezes the
  resource vocabulary; the same declarations generate the client types, the
  runtime validators, the OpenAPI document and the field inventory the AC-61
  audit walks.

**Rejected — GraphQL.** Genuine appeal: per-field selection makes "no served
field without a consumer" nearly free. Rejected because the disclosure boundary
is the harder constraint: AC-56 splits the payload into *default projections*
and *authorized bundle*, and a resolver graph turns one authorization gate into
a per-field decision over an unbounded query space. Worse, AC-54 requires
honesty fields to be machine-injected and non-droppable — a query language whose
premise is that the client chooses which fields to receive is structurally at
odds with "the reader is never shipped an answer missing its badges". Resource
shapes also make AC-62's real pagination and AC-56's bounded payload ordinary.

**Rejected — tRPC / RPC-only.** End-to-end types without a declared contract
artifact; the pack requires a nameable, freezable resource vocabulary (ui §5 W1)
and an auditable field inventory (AC-61), neither of which a procedure surface
yields.

**Rejected — NestJS.** Decorator/DI indirection works against charter A3.6's
maintenance test ("name the single place where a behaviour is decided").

### 2.4 Postgres access and migration tooling

**SEAT-PROPOSAL: Drizzle ORM for schema declaration and typed queries +
`drizzle-kit` for migrations, with hand-authored SQL in migrations for every
invariant that belongs in the database.**

- **Invariants live in DDL where they can (AC-32, AC-35).** `CHECK` constraints
  for closed enums and the polymorphic edge target; a **null-safe non-blank
  claim check** (below); **graph-scoped composite foreign keys** for every node
  and edge endpoint (§4.2, C-11); a composite foreign key for the undercut's
  support-edge target (§4.2); partial unique indexes for arrow identity; revoked
  `UPDATE`/`DELETE` grants plus triggers for append-only tables (AC-45), and
  column-level `UPDATE` revocation for the run's frozen head (§4.1a). A
  SQL-first tool keeps that DDL readable and reviewable; an ORM that owns the
  schema hides exactly the layer the invariants must occupy.
- **The non-blank claim must be null-safe, and `CHECK` alone is not.** In
  PostgreSQL a `CHECK` passes unless its expression evaluates to **false**, and
  `length(btrim(NULL)) > 0` evaluates to `NULL` — so a bare trimmed-length check
  **accepts the null case it appears to reject**. The canonical DDL is therefore
  **`claim_text text NOT NULL` together with `CHECK (length(btrim(claim_text)) >
  0)`** (equivalently, the single null-safe form `CHECK (coalesce(length(
  btrim(claim_text)), 0) > 0)`; either is acceptable, both are stated so no
  builder reconstructs the unsafe one). This is what manifest §6.4's *"blank
  claim rejected at write time, not merely at serialization"* and charter A3.2
  require.
- **Canonical DDL ownership is single and named.** Every invariant above has
  **one** authoritative definition, in the migration that creates its table,
  inventoried in `02-data-model.md`; application-level checks are restatements
  for error quality and are never the authority (AC-85). **Every fixture for a
  DDL invariant exercises the migrated database directly — inserting through the
  connection, bypassing every application validator** — or it tests the
  restatement rather than the authority. The non-blank fixture must reject
  **null, empty string and whitespace-only** on that path
  (`06-test-strategy.md`, slice S2).
- **Recursive and path queries are first-class.** AC-33's materialized path,
  AC-20's acyclicity check and AC-05's subtree revival want `WITH RECURSIVE`
  and `ltree`/text-path indexes; Drizzle's raw-SQL escape hatch keeps these
  written, not generated.
- **One migration timeline for one store (AC-02).** A single migration lineage
  over one database with namespaced schemas (`core`, `ledger`, `memory`,
  `scorecard`, `register`, `serve`) — schemas, not databases, so "one store,
  multiple indexes" is enforced by the deployment, not by discipline.

**Rejected — Prisma.** Good migrations, but its schema DSL and client hide the
DDL where AC-32's write-time enforcement must live, model polymorphic targets
(AC-19's node-or-edge reference) awkwardly, and generate a type layer that
competes with `packages/kernel` for ownership of the closed vocabularies.

**Rejected — `node-postgres` alone with `node-pg-migrate`.** Nothing wrong with
the migrations; but with no declared schema object there is no field inventory
for AC-61's audit and no compile-time link between a table column and the wire
field it feeds.

### 2.5 Test frameworks

| Layer | SEAT-PROPOSAL | Why this constraint needs it |
|---|---|---|
| Unit / integration | **Vitest** | TypeScript-native, ESM-native, fast watch; the same runner drives every package so charter G2's "called at least once on a real run" instrumentation has one hook. *Rejected: Jest — heavier TS/ESM path for no gain here.* |
| Property tests | **fast-check** | AC-80 and manifest §12.2 require generated graphs with **declared preconditions** (exclude `τ ∈ {0,1}`, zero-strength arrows, pre-saturated aggregates, duplicate identities, cluster-absorbed arrows for the strict properties; generate without them for the non-strict ones — manifest §4.5). Shrinking is what makes a P-D1…P-D5 failure actionable. *Rejected: hand-rolled generators — no shrinking, and the exclusion sets become untestable prose.* |
| Database tests | **Testcontainers + real Postgres** | AC-01 and AC-04 make an in-memory substitute a category error: the constraints, triggers, advisory locks and `SKIP LOCKED` semantics under test are Postgres behaviours. *Rejected: an in-memory or SQLite-shaped test double — it would test a store V3 does not have, and W-4's whole point is that the SQLite-shaped accidents do not carry.* |
| Contract tests | **Schema-driven from `packages/contract`** | Re-authors the 35-of-50 `.mjs` interface tests (ui §5 W7) against the declared contract instead of interface source text. *Rejected: recorded-response snapshot tests — a snapshot asserts what the server happened to send, which is how a served-but-unread field survives an audit (AC-61).* |
| Replay ceremony | **A separate executable, `apps/replay`, sharing exactly one package — `published-arithmetic` — with the serving run, and run by a separate principal** | **Independence has three limbs, all three from charter S1 / DR-063 VR-3's ruled text, and all three are carried here.** **(i) Code independence.** VR-3 option (ii) is *"a separate execution sharing no code path with the serving run **beyond the published arithmetic**"*, and it **rejected** option (i) ("the same code in a fresh process, which proves little") *and* option (iii) ("an independent re-implementation, disproportionate at launch"). The published arithmetic is manifest §4.2(a)–(b) — `agg`, `σ` — plus the product for strict-and; **everything else in `packages/propagation` is V3's own re-specification** (M1's lifting and markers, M2's operator selection and resolution level, M3's cluster collapse, the fingerprint). So the published arithmetic is extracted into **`packages/published-arithmetic`** — zero dependencies, `agg`/`σ`/product and nothing else — imported by **both** `propagation` and `apps/replay`, which is precisely what VR-3's "**beyond** the published arithmetic" licenses and what keeps AC-14/AC-85 intact (**one** implementation of the arithmetic, in one place — see §2.5a). `apps/replay` imports **no other workspace package**, and every V3-specific structural outcome — lift targets and both-ends markers, cluster-collapse records, the effective operator and its resolution level, the recorded arrow order — is **read from the frozen `propagation_run` / `node_strength_record` rows as data, never recomputed**. Otherwise a defect in the shared collapse or lift rule reproduces identically on both sides and the ceremony reports agreement while proving nothing. **(ii) Frozen records only** — a read-only database reader, no other input. **(iii) Operator independence:** charter S1 also requires the ceremony be *"run by a **person or job that did not produce them**"*. The executing principal is a **job with read-only database credentials, scheduled separately from the acceptance run, reading run ids it did not write** — because the obvious CI shape (acceptance job produces runs, then replays them in the same job on the same worker) satisfies limbs (i) and (ii) and defeats the failure limb (iii) guards. **Two attestations, not one:** the *isolation proof* — `06-test-strategy.md` owes an artifact naming every symbol `apps/replay` shares with `apps/api`/`apps/runner`, and **its expected content is pinned at SYMBOL granularity, not package granularity: exactly `agg`, `σ` and `product`**. Package granularity would be satisfied by a `published-arithmetic` that had grown past the published definitions, and VR-3's licence covers sharing nothing *beyond* them. The same artifact **fails if `apps/replay` declares any local arithmetic symbol of its own** — structural rule 3 checks *imports* and the proof lists *shared* symbols, so without this clause a privately duplicated `agg`/`σ`/product inside `apps/replay` is caught by no gate at all, and that duplicate is precisely the AC-14/AC-85 breach §2.5a exists to prevent. A one-line CI assertion pins `packages/published-arithmetic`'s **exported surface** to the same three symbols. **And the operator attestation** (executing principal, credential scope, and the run ids it did not produce). Both are S1 gates and both enter the S15 bundle. |
| Acceptance bundle | **`tools/acceptance-bundle`** | Emits the never-called list (AC-77, charter A4.2), the §5.2 firing-fixture ids (charter A4.4) and the entry-point list G1 walked (A4.5). |

### 2.5a Why the ceremony does not create a second scoring path

Recorded because the alternative reading is a defect, not a nuance. A
self-contained `agg`/`σ`/product **duplicated** inside `apps/replay` would be a
**second implementation of the scoring arithmetic inside V3** — forbidden by
AC-14 (`DR-030 J1`: *"no second scoring path **anywhere in V3**"*) and AC-85
(charter A3.1: *"two implementations of one behaviour is a defect"*), which
§3.3's anti-pattern list already refuses to exempt for the debug facet, the
preview or the UI. It would also be live: a ceremony `σ` written with `>` where
the engine uses `≥` breaks every tie-boundary node (manifest §4.2b makes `≥` the
clause that keeps DF-QuAD discontinuity-free and the tie case exactly `τ`), and
the pack has no rule for adjudicating a ceremony-vs-serving disagreement — so
the BLOCKING launch gate would report a serving defect that does not exist, or
mask a real one when both copies are edited in the same commit.

**No exemption is needed, because VR-3 licenses the sharing in its own ruled
text**: *"sharing no code path with the serving run **beyond the published
arithmetic**"*. `packages/published-arithmetic` is exactly that boundary and
nothing more — `agg`, `σ`, the product, zero dependencies, no V3-specific rule.
One behaviour, one place (AC-85); one scoring path (AC-14); one shared module,
which VR-3 permits by name. **Drift control regardless:** the two literature
vectors (manifest §4.5) and the `va == vs` tie-boundary case run against
`published-arithmetic` in CI, so an arithmetic change is caught as an arithmetic
change.

### 2.6 Repository layout

A pnpm workspace in `DebateAI-V3` (AC-82) for the engine, plus a **clean-room
barrier around the kept UI** (see below and FLAG-4(b)). The full dependency edge
list is declared in `03-module-design.md` and enforced in CI; §2.6's summary
below is normative for the rules it states and is not a substitute for that list.

```
packages/
  kernel/         closed vocabularies, branded identities, the labeled-number
                  type, condition marks imported from spec §12.3. ZERO deps.
  published-arithmetic/
                  agg, sigma, product — manifest §4.2(a)-(b) and nothing else.
                  ZERO deps. The one module VR-3 licenses the ceremony to share
                  (§2.5a). No V3-specific rule may enter it — enforced by a CI
                  assertion pinning its exported surface to exactly those three
                  symbols, since zero-deps alone would not stop a lift-target
                  selector or collapse filter written inline over plain numbers.
  propagation/    the pure scoring engine (AC-09/AC-14). Depends: kernel,
                  published-arithmetic. No I/O, no clock, no randomness, no db —
                  lint-enforced.
  contract/       the wire contract: resources, projections, event vocabulary,
                  typed error taxonomy. Depends: kernel.
  register/       the flag/config register (AC-74/AC-75): rows, versions,
                  resolution chain, naked-constant printing.
  db/             connection, migrations, namespaced schema, transaction and
                  advisory-lock helpers.
  ledger/         execution ledger, hashes, append-only ordering, the four
                  reconstruction paths, the digest projection.
  providers/      the one provider interface (AC-36/AC-37), lanes, context
                  isolation, call bounds.
  graph/          nodes, arrows, lifecycles, materialized path, write-time
                  enforcement, construction rules, cycle refusal + redirect.
  judgement/      per-node judge contract, deterministic reducer, panels,
                  dispersion, disagreement flag, typed non-answers.
  evidence/       frozen queries, admissibility, access depth, absence rows,
                  provenance clusters, freshness, probes, citation routes.
  battery/        the 71 row contracts, activation states, stage runners,
                  row-boundary routes.
  battery/decision/
                  organ 4 (context 3a): the pure decision->spawn function.
                  Depends on kernel ONLY — fenced exactly as propagation is
                  (structural rule 5); its impure caller is the stage runner.
  critique/       lineage, blinding, independence receipt, symmetry diff,
                  objection ledger.
  valuation/      hinges, Pareto trigger, flows A/B/C, reversal points,
                  detachment invariant.
  serve/          fact bundle, composition, conformance, gate order, terminals,
                  projections, degraded mode, debug facet.
  memory/         match ladder, links, aliases, pinned pulls, disclosure block.
  settlement/     resolution events, proper score, scorecards, model ledger,
                  routing guards.
  liveness/       snapshot, wake, propagate, retirement/archival.
  budget/         cost envelope, typed skips, protected core.
apps/
  api/            Fastify — the single front door (AC-60).
  runner/         run execution: Postgres-backed work claim, stage orchestration.
  replay/         the independent replay ceremony (DR-063 VR-3). Imports ONLY
                  packages/published-arithmetic and no other workspace package
                  (§2.5a). It does NOT carry its own agg/sigma/product — a local
                  copy is the second scoring implementation AC-14/AC-85 forbid.
tools/
  orphan-audit/   reachability + never-called list + dead-cost indictment.
  acceptance-bundle/
docs/architecture/   the C4 artifact set (§7).

--- clean-room barrier (FLAG-4(b), manifest §14, AC-81) ---
web/              the kept Next.js UI; components/UX kept, data layer rebuilt.
                  SEAT-PROPOSAL: a SEPARATE workspace/repository, separately
                  checked out and import-fenced, consuming `packages/contract`
                  as a published artifact. It is V2-derived source; co-locating
                  it with the five organ packages leaves DR-003 with no
                  enforcement mechanism. Pending V's answer to AQ-2/AQ-3.
```

**Declared dependency edges** (the summary the CI rule enforces; the authoritative
list is `03-module-design.md`):

| Package | May depend on |
|---|---|
| `kernel` | *(nothing)* |
| `published-arithmetic` | *(nothing)* |
| `propagation` | `kernel`, `published-arithmetic` |
| `battery/decision` *(organ 4, context 3a)* | `kernel` **only** — AC-48's purity, fenced exactly as `propagation` is |
| `contract` | `kernel` |
| `register` | `kernel`, `db` |
| `db` | `kernel` |
| `ledger` | `kernel`, `db`, `register` |
| `providers` | `kernel`, `register`, `ledger` |
| `graph` | `kernel`, `db`, `ledger`, `register` |
| `judgement` | `kernel`, `db`, `ledger`, `providers`, `register` |
| `evidence`, `critique`, `memory`, `liveness`, `settlement` | `kernel`, `db`, `ledger`, `providers`, `register`, `graph` |
| `valuation` | `kernel`, `db`, `ledger`, `register`, `graph`, `propagation` |
| `budget` | `kernel`, `db`, `ledger`, `register` |
| `battery` | `kernel`, `db`, `ledger`, `register`, `budget`, `graph`, and the domain package owning each stage's substance |
| `serve` | `kernel`, `db`, `ledger`, `register`, `graph`, `propagation`, `providers`, `contract`, `valuation`, `memory`, `liveness` |
| `apps/api` | `contract`, `kernel`, `db`, `register`, `serve`, `battery`, `ledger` |
| `apps/runner` | every engine package except `contract` |
| `apps/replay` | `published-arithmetic` **only** — see §2.5, §2.5a |
| `web` (fenced) | `contract` only; **emits a consumer manifest** (below) |
| `tools/*` | `kernel`, `contract` (read-only over the TypeScript program) |

**Rejected — splitting the engine itself across repositories.** Letting
`propagation`, `ledger`, `serve` and the API move independently puts the wire
contract in two places with a publish/consume lag — the mirror AC-59 deletes —
and makes AC-61's bidirectional orphan audit and charter G1's single entry-point
list unanswerable in one pass. DR-065 fixes one repository for the engine.

**Why the UI is nonetheless fenced, and why that does not reintroduce the
adapter.** AC-81/manifest §14 is binding and voids DR-003 *"regardless of
intent"*; a barrier that depends on an implementer not searching their own
working tree is not a barrier. AC-59's "no adapter" requires **one contract
declaration**, not one checkout: `packages/contract` is published as a
versioned artifact and consumed by the fenced UI, so there is still exactly one
declaration of every wire shape. Whether the fence is a separate repository or a
separate workspace is AQ-3 — **V's to answer, and the consequence of no fence is
recorded at FLAG-4(b)**.

**The cross-boundary mechanism the fence requires: the consumer manifest.** The
fence costs the single-type-graph property §2.2 claims, and "reported against
it" is not a mechanism. AC-61 is **bidirectional** and both directions are
defects, so: **the fenced interface's own build emits a `consumer-manifest.json`
— a generated inventory of every contract field and event name it references,
against the pinned `packages/contract` version — and `tools/orphan-audit` in the
engine repository consumes that manifest as a build input**, failing on either
direction of drift. **The engine's release build requires a consumer manifest
for the pinned contract version**, so a missing manifest fails the release
rather than passing vacuously. Without it the failure is silent and D4-shaped: a
field is added to the Answer resource and served, no consumer is ever written,
the engine build passes (it has a producer), the interface build passes (it
consumes what it consumes), and the **BLOCKING** never-called list — assembled
in the engine repository — shows nothing.

**What structural rule 4 does and does not enforce.** It prevents *code*
coupling, and that is all it can do. Manifest §14's violation is a **reading**
violation — *"a single participant who reads V2 source and then writes V3's
implementation has voided DR-003 regardless of intent"* — so the clean-room
split is enforced by **checkout separation** plus manifest §14's role
assignment, and **nothing in CI can substitute for it**.

Five structural rules, all CI-enforced:
1. **`propagation` may not appear in any dependency cycle and may not import
   anything but `kernel` and `published-arithmetic`** — AC-09's purity is a
   graph property, not a habit, and the serving engine must be able to reach the
   one shared arithmetic module (§2.5a).
2. **`contract` is the only package the interface may import types from** —
   AC-59's "no adapter" means no second declaration of a wire shape anywhere.
3. **`apps/replay` imports no workspace package except
   `packages/published-arithmetic`** — AC-07/VR-3's code-independence limb is a
   dependency-graph property, and the CI check that proves it is the isolation
   proof (§2.5, §2.5a, §7 doc 7). The other two limbs are the frozen-records
   reader and the operator attestation.
4. **No engine package may import from the interface, and the fenced interface
   may import nothing but the published contract** — code coupling only; see the
   paragraph above for what this does *not* enforce (AC-81, FLAG-4(b)).
5. **`battery/decision` may import nothing but `kernel`** — AC-48's *"decision→
   spawn is a **pure function**"* is a graph property exactly as AC-09's purity
   is, and organ 4 gets the same fence organ 1 gets. Its impure caller (the
   stage runner) materialises the two typed signal bundles and the path state
   and passes them in — Seam A's materialise → compute → persist, applied to
   organ 4. Without it a decision could read `now()` for freshness or query the
   graph for a blocker it should have received, both of which compile, pass every
   other gate, and silently break `decision_record`'s replay identity hash
   (manifest §7.2f).

### 2.7 Dev / run tooling

| Concern | SEAT-PROPOSAL | Constraint |
|---|---|---|
| Package manager / workspace | pnpm workspaces | one lockfile, enforced dependency graph (AC-85) |
| Local Postgres | Docker Compose, one database, namespaced schemas | AC-01, AC-02 |
| Job execution | **Postgres-backed queue** (`SELECT … FOR UPDATE SKIP LOCKED`) inside the one store; work claimed and committed *before* any model call, results written after | AC-02 (a Redis/broker would be a second durable store for run state), AC-04 (never hold a write lock across a model call), AC-44 (the ledger is the record of what ran) |
| Lint | ESLint + custom rules: **`no-impure-import`, applied to BOTH `propagation` (AC-09) and `battery/decision` (AC-48)** — no `fs`/`net`/`Date`/`Math.random`/db import in either; `no-source-literal-constant` (register), `require-exhaustive-switch` (closed enums), `no-unlabeled-number` (wire) | AC-09, **AC-48**, AC-74, AC-35, AC-63 |
| Orphan detection | `tools/orphan-audit`, **three named mechanisms, not one**: **G1 reachability** — a static walk of the TypeScript program, the contract field inventory and the event registry from a **published entry-point list**, **plus the fenced interface's `consumer-manifest.json` as a required build input** (§2.6), so both directions of AC-61 are decided and a missing manifest fails the release rather than passing vacuously; **G2 call coverage** — a runtime call tape from the acceptance run, yielding the never-called list; **G5 dead cost** — a *reviewed manual audit* under charter A4.1's **advisory** class, because "a unit whose output no served surface, no ledger row and no downstream decision consumes" is not statically decidable, plus the `measurement_lane` exemption (spend whose only consumer is the scorecard, with the consumer named on the lane and its output demonstrably reaching the scorecard). G5's advisory status is charter VR-5's own classification; G2's output is what **blocks**. | AC-61, AC-77; charter G1/G2/G5, A4.1, A4.2, VR-5 |
| CI gates | typecheck · lint · unit · property · db-integration · contract · replay self-test · orphan audit (report) · never-called list (**blocking**) · firing-fixture presence (**blocking**) | charter VR-5, A4.2, A4.4 |
| Config | every constant is a register row read through `packages/register`; no `process.env` read outside the register's loader | AC-74, AC-75 |
| Versions | Node LTS, pnpm, Postgres major, TypeScript — **pinned as register rows**, not asserted here (numbers are V's at DR-023) | AC-74, AC-76 |

---
## 3. Bounded contexts and module map

**DDD impact, stated explicitly.** V3 has **one core domain** — a run that turns
a question into a served, replayable answer — expressed as **nine core
contexts** aligned to the battery's stages (eight stage contexts plus context
3a, organ 4's own), **four supporting contexts**, and **five shared-kernel /
generic modules**. Three rulings constrain the context
map before any modelling choice: one graph (AC-15), one scoring engine (AC-14),
one serving truth (AC-16), with the organ↔stage table FINAL (AC-17). Those
forbid the most common DDD reflex here — giving each stage its own model of the
argument and translating between them. **There is no anti-corruption layer
between contexts, because there is nothing to translate: the graph aggregate is
shared, and contexts differ by which invariants they own, not by which model
they hold.**

Domain terms below are GLOSSARY-conformant. Terms this plan coins are marked
*(architecture term)*.

### 3.1 Context map

| # | Context | Package(s) | Stage ownership (AC-17) | Invariants it **owns** | Domain terms |
|---|---|---|---|---|---|
| 1 | **Framing** | `battery` (row contracts) + the framing state on `run` (§4.1a); LOCK/ROUTE have no separate domain package because their substance **is** the run's framing state | LOCK, ROUTE — greenfield | Q4 answer rule frozen/hashed before the first retrieval; `prior_basis` with no DEFAULT/ASSUMED member and never revised upward; Q2 binding is the sole scope key; the five terminal routes; dual-act phase order machine-enforced (AC-83, spec §5.3 F-6/F-7, §5.5 F-12) | settlement act, question type, prior basis, terminal route, risk tier |
| 2 | **Inquiry** | `evidence` | AIM, HARVEST, RUN — greenfield | frozen query set + typed amendments; the mixed admissibility rule; three-valued access depth (a preview-only source may never supply a number or quote); absence rows; provenance clusters; freshness never cached; probe capture and instrument certification (spec §7.1–§7.5, §3.5 Q22/Q23) | query set, admissibility, access depth, absence row, provenance cluster, way of knowing |
| 3 | **Argumentation** | `graph` | **SPLIT** — owns the graph as an object; substrate for every stage | node identity never reused; three orthogonal lifecycles; materialized path; **write-time enforcement** (AC-32); the arrow as a stored first-class object with a polymorphic target (AC-18/AC-19); cycle refusal + shared-crux redirect (AC-20); defeater completeness (non-empty or exhaustion-marked) | node, arrow/edge, defeater, child kind, arrow kind, shared-crux sub-claim, perspective node |
| **3a** | **Spawn decision** *(organ 4 — its own context, previously homeless)* | `battery/decision` (a named sub-package with its own boundary) | **SPLIT mechanics** (AC-17: "spawn plumbing → SPLIT mechanics") | **AC-48 in full**: the decision is a **pure function** over two typed signal bundles plus path state; fixed precedence `reopen → challenge → seek evidence → deepen → abandon → continue`; the **categorical-only steering law** (only categorically-grounded decisions may spawn real work; **unclassified fails closed to scalar**); blockers recorded for audit but **excluded** from the classification; the eight decision audit invariants (grounded-input definition over all six identity fields, abandoned paths never spawn, a non-spawning decision may not carry a spawn count, availability/freshness cross-validation, normalized non-duplicated reason codes); the **replay identity hash excluding the idempotency key, spawn count and classification fields**; bounded regeneration (2 rounds / 3 attempts) then the typed "not runnable" abstention; typed budget skips | decision, spawn, categorical vs scalar, blocker, grounded input, exploration decision |
| 4 | **Appraisal** | `judgement` | **WEIGH** | one structured grade per node reduced **deterministically**; parse failure and schema failure kept distinguishable; no default τ from a judge that produced nothing (AC-21); dispersion measured across ≥2 judgements and never averaged away; the disagreement flag as flag + certainty downgrade; typed non-answers; **and organ 2's judge contract in full — AC-92** (code-first claim typing with a bounded call only on `unknown`, child-context ordering and marked truncation, the prompt honesty constraints, the five output sub-objects, parse-vs-schema failure distinguishable, the reducer's emitted branch / ordered caps / fixed driver order / typed holes, the claim-type→composition map **held as data, never a source literal**, per-member panel contract hashes, correlated-error grouping, "independence unknown" with a typed reason) | judge contract, reducer, dispersion, uncertainty driver, typed non-answer, composition map |
| 5 | **Adjudication** | `critique` | **CROSS** — greenfield | different maker = different lineage; independence never fabricated; blinded, fingerprinted packets; the Q39 receipt recorded even with no critic; the symmetry set/count diff with **no fairness scalar**; `UNINSTRUMENTED` withholds the fairness claim and caps the confidence band; the residual objection set as a first-class object (spec §14, §8.1) | lineage, blinded packet, independence receipt, remediation layer, residual objection |
| 6 | **Recomposition** | `valuation` + calls into `propagation` | **COMPOSE** — greenfield stage, scorer organ | operator declaration and its resolution chain (AC-22); rival reading served where it flips the band; leverage/fragility as **outputs, never weights** (AC-29); K=1 halt bound; holistic-vs-decomposed diff with averaging forbidden; the overlay detachment invariant (AC-30) | operator, accumulate, strict-and, leverage, fragility table, reversal point, value hinge, weight source |
| 7 | **Serving** | `serve` | **SERVE** | the fact bundle contains only computed facts and typed records; gate order (AC-52); `max_recompose = 2` and the terminals (AC-53); machine-injected honesty fields (AC-54); degraded-mode projection fields (AC-55); the projection/bundle disclosure split (AC-56/AC-57); Q51 is the sole never-disabled serving invariant; **organ 6's serve behaviour in full — AC-86 (five distinct typed refusal preconditions), AC-87 (sanitizing: strip raw judge output, scrub secret markers, drop rather than serve damaged, copy optional scalars only when well-typed), AC-88 (coverage reconciliation — status derived, never asserted), AC-89 (stale-job expiry, disposed against AC-62 at §6.6 UI-13), AC-90 (honest-degradation vocabulary), AC-91 (suppression + shadow mode)**; **and AC-24's band rule — the way-of-knowing ceiling every band must name (charter VR-2), carried as the band-ceiling projection of §5.4** | fact bundle, conformance record, projection, honesty surface, components-only, condition mark, verdict state, confidence band, band ceiling |
| 8 | **Settlement** | `settlement` | **SETTLE** — greenfield | resolution event + external resolver + scoreability; read-back verification; the proper score registered once; scorecards as pure ledger functions (AC-41); cell shape and reporting obligations (AC-42); the eight routing guards (AC-40); demonstrated cold-start exit (AC-43) | resolution event, scoreability, proper score, scorecard cell, basis, exploration share, probation |

**The `battery`-vs-domain-package layering rule, in one sentence.** **`battery`
owns row contracts, activation state and stage sequencing; the named domain
package owns the row's substance** — so an AIM row's *contract and activation*
live in `battery` and its *substance* lives in `evidence`, and a reader asking
charter A3.6's maintenance question ("name the single place where this is
decided") gets one answer for each half. Context 3a is the one exception by
ruling: AC-17 puts spawn plumbing in SPLIT mechanics, so its substance is a
named sub-package of `battery` rather than of `graph`, and `graph` remains the
owner of what a spawn *writes*.

**Supporting contexts.**

| # | Context | Package | Invariants it owns |
|---|---|---|---|
| 9 | **Memory** | `memory` | key is a projection of already-frozen fields and is **not** the cache key; four DB-predicate tiers with no embeddings (AC-68); link-never-merge with no transitive closure (AC-69); pinned pulls (AC-70); a match never reduces the work; three blocking disclosure gates; per-asker scope on question-level pulls (AC-71) |
| 10 | **Liveness** | `liveness` | relevant-as-of at spawn; watched triggers and TTL review clocks; propagate re-judges only affected nodes; badges never silent; composite retirement = archival, nothing deleted (AC-05, AC-72) |
| 11 | **Budget** | `budget` | the visible cost envelope derived from asker depth × risk tier; enrichment skips before any hard stop; the protected core's refusal to be skipped (AC-49); rates frozen at run start (AC-50) |
| 12 | **Register** | `register` | one ratified table of every constant, threshold and flag; the resolution chain per row; provisional rows carry owner, recalibration trigger and sign-off (charter A5.2); naked-constant printing (AC-75) |

**Shared kernel and generic subdomains.**

| # | Module | Kind | Note |
|---|---|---|---|
| 13 | `kernel` | shared kernel | The closed vocabularies every context speaks. Its single source for condition marks / abstention kinds is spec §12.3 (AC-65) — the table is transcribed once, with a test asserting membership and count against the spec's own table, and **never extended locally** (S-13). **Terminal routes are the one exception *(rev 4 · A-01, ratified DR-099)*: the test asserts membership and count against the five-member list sourced to DR-037 (spec §5.2 F-4), not against spec §12.3's Home-3 table, which lists four until A-01's founding-pack half is applied — that correction is V's, S-13 reserving the minting authority.** |
| 14 | `propagation` (+ `published-arithmetic`) | shared kernel (pure) | The one scoring engine (AC-14), used by Appraisal and Recomposition. Pure by construction (AC-09). `published-arithmetic` is the zero-dependency `agg`/`σ`/product module **VR-3 licenses the replay ceremony to share** (§2.5a) — it is a boundary inside this module, not a second engine. |
| 15 | `ledger` | shared kernel (written by all) | Organ 5. Every context writes; SERVE reads (AC-17). Recording is not optional anywhere (AC-44). |
| 16 | `providers` | generic subdomain | The one provider interface (AC-36/AC-37); lane assignment and context isolation (AC-39); typed call bounds; **and AC-38's deployment-level maker-inventory assertion** — the startup capability check, the standard+ ask refusal, and the transient-vs-standing counter (§3.2 Seam C). |
| 17 | `contract` | published language / open-host service | The wire vocabulary. `apps/api` implements it; the fenced interface consumes it as a published artifact (§2.6, FLAG-4(b)); nothing else declares a wire shape (AC-59/AC-60). |

### 3.2 The four seams that carry the hardest constraints

**Seam A — the evaluation snapshot (AC-09 × AC-01).** *(architecture term:
**evaluation snapshot** — an immutable in-memory value carrying the node set,
the arrow set, the per-parent operator resolution, the cluster records and a
recorded total order over arrows.)* The graph lives in Postgres; the math may
not touch a database. The boundary is **materialise → compute → persist**:
`graph` builds the snapshot (impure), `propagation` consumes it and returns a
per-node result record (pure), `ledger` persists the result and the snapshot's
fingerprint. This is the concrete answer to spec AM-11.

**The ordering rule, stated once and only here (AC-08).** The arrow evaluation
order is a **deterministic function of stable non-identity content** —
`(target_kind, polarity, kind, source node's materialized path, sibling ordinal)`
— with `created_at_seq` as the final tiebreak, **`NULLS FIRST` declared
explicitly on `kind`** (support edges carry `kind IS NULL` by §4.2(1), and
leaving NULL placement to the engine default is exactly the
storage-engine-specific ordering behaviour manifest §8.2g refuses to carry), and
it is **recorded on `propagation_run`**. A property test asserts the derived
order is **stable across two independent derivations of the same snapshot**,
because the first computation and the overlay-detachment recomputation both
derive it and an environment difference would otherwise produce two recorded
orders for one graph. It is deliberately **not** an order over opaque identities:
manifest §8.2g forbids carrying V2's random-identifier fall-through as an
ordering device, and an opaque-id sort is an instance of exactly that. Because
the order is recorded, **every recomputation of an already-computed run consumes
the recorded order and never re-derives it** — this binds the
overlay-detachment byte-identity check (AC-30), the replay ceremony (AC-07) and
the removal-based leverage/fragility recomputations (AC-29); without it the
detachment invariant could fail for a reason that is not overlay mutation.

**Seam B — the single writer for graph invariants (AC-32 × AC-20).** All node
and arrow writes go through `graph`'s write API inside one transaction that
takes a per-graph advisory lock, so acyclicity is checked against a stable
predecessor set: DDL carries what DDL can (enum `CHECK`s, non-blank claim,
endpoint foreign keys, self-edge rejection, arrow-identity uniqueness); the
transaction carries the recursive reachability check. That is layer two of the
cycle law; layer one is the builder's refusal-and-redirect in the same package;
layer three is `propagation`'s typed compute-time error (AC-20 — all three must
exist, charter §5.2 row 10).

**Seam C — the provider gateway (AC-36 × AC-04 × AC-44).** Every model call
crosses one interface that takes a typed role, a lane, a call bound and a
contract hash, and returns a raw artifact. The gateway persists the raw artifact
unconditionally (AC-13) and writes the ledger row (AC-44) — *outside any open
write transaction* (AC-04). Provider identity, model id and `model_version` are
configuration values on the way in (AC-36) and recorded keys on the way out
(AC-42).

**H2 as an executable scenario, not a claim (AC-37).** "Addable through
configuration alone, without changing agent, scorer, evidence or semantics code"
is checkable only if it names what changes and what does not. The scenario:
**the launch artifact already contains at least two provider implementations**,
both compiled into `packages/providers` and both registered in its provider table
at build time; adding or switching the second *configured* provider is a
**register-row change only** — no code change anywhere.

**Two separate C4 house-rule tests, because they prove different things.**
**(H2-a) the config-only switch:** flip the named configuration row, re-run a
fixture, and **fail unless every source and build input is byte-identical
between the two runs except that one register row** — including everything
inside `packages/providers` and the rest of `packages/register`. A test that
tolerates differences anywhere in those two packages passes even when provider
*implementation code* changed during the supposed config-only switch, which
proves nothing about H2. **(H2-b) the plugin boundary:** adding a *third,
previously unimplemented* provider is a code change **inside
`packages/providers` only** — asserted by a separate test that permits changes
there and nowhere else. H2-a is the ruled property (DR-029 H2: *"without
changing agent, scorer, evidence or semantics code"*); H2-b names the boundary
so no builder has to guess whether the second adapter is pre-shipped (it is).
Under AC-38/DR-055 H2-a is a **launch prerequisite**, not merely charter A5.1's
advisory drill.

**The deployment-level maker inventory (AC-38) — two predicates, not one.**
DR-055 separates a **standing configuration** from a **transient outage**, so
one predicate cannot carry both: "configured **and reachable**" would make a
two-maker deployment with one provider briefly down *simultaneously* rejecting
(reachability false) and non-rejecting (configuration true). `providers`
therefore owns two machine predicates with different subjects, different
timings and different consequences:

| Predicate | Subject and timing | Reads | Consequence |
|---|---|---|---|
| **`deployment_maker_capability`** | the **deployment's configuration**, evaluated at startup and on every register change; **not** a liveness probe | the register's configured provider set, resolved to distinct **makers** (DR-013's bright line) | **This is the launch/admission gate.** False ⇒ standard-and-above `POST /v1/asks` is **refused** (§5.3) and the S15 attestation is absent, so *"a deployment that cannot execute multi-maker at standard+ does not pass launch"* (DR-055) has a mechanism |
| **`run_maker_reachability`** | **one run**, evaluated per critique attempt | the ledger's recorded provider errors/timeouts for that run | **This invokes the transient path only.** False on a capable deployment ⇒ DR-014's cap-and-label (`SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE`, confidence-band cap, recorded lift condition) — legal, because DR-055 permits exactly this as *"TRANSIENT provider-unavailability handling"* |

A ledger-derived counter classifies every capped run against the two predicates,
so a standing misconfiguration can never accumulate as a run of "transient"
outages. Without this split, every standard-tier run on a one-provider
deployment quietly takes DR-014's cap-and-label path and serves, nothing counts
or refuses, and DR-055's launch gate is dead code wearing a gate's clothes —
charter G3's exact indictment.

**Seam D — the projection boundary (AC-56 × AC-64).** `serve` produces two
distinguishable things: **frozen artifacts** (the fact bundle, the conformance
record, the served numbers and their provenance — persisted, hashed, replay
inputs) and **projections** (badges, marks, provenance summaries, per-node
restatements — *computed at read time from stored typed fields*). Freezing the
facts is what AC-06 requires; computing the projections at read time is what
AC-64 requires, because a staleness state that changed after serving must be
visible on the next read. This is the concrete answer to ui ambiguity 3.

### 3.3 Anti-patterns this map forbids

- **No second graph model.** Every context reads the same node/arrow aggregate
  (AC-15). A context needing a different view builds a *projection* of it, never
  a parallel persisted model.
- **No second scoring path** — including "just for the debug facet", "just for
  the preview" or "just for the UI" (AC-14, AC-16). The debug facet reads the
  identical node set as the scored graph (manifest §9.3, DR-062 OD-18) and can
  never affect real scoring.
- **No behaviour in two places** (AC-85). Where two contexts need one rule, the
  rule lives in `kernel` or in the owning context and is called, not copied.
- **No module shipped unreachable** (AC-77/AC-78), and the two permitted shapes
  are **not interchangeable**. A deferred capability may ship as a
  register-gated branch **only where the pack has not said otherwise** — that
  branch must be exercisable in both states by a configuration a production
  caller can produce (charter VR-4 class 1, G4). **Where the pack says a gate
  does not ship, it is not written**: charter §5.2's deferred table
  (`RATIFIED(DR-020 knob 7)`) says the citation hard-kill gate *"does not ship
  … it must not exist as code that cannot fire"*, and coverage-as-gate *"ships
  as the diagnostic UNCOVERED-SCOPE note only"*. Those two take the
  not-written branch (§6.7, §8 S6); the register-gated branch may not be used
  to license them. Charter §9 item 6 records that DR-020 knob 7's own
  auto-activation clause and this not-shipped clause cannot both be honoured —
  raised as a V-QUESTION at §6.9 item 6.

---

## 4. Data model direction

Shape, not DDL. One Postgres database, namespaced schemas, one migration
lineage (AC-01/AC-02). Every decision below cites the constraint that forces it.

### 4.1 Standing schema-wide rules

| Rule | Constraint |
|---|---|
| Every mutable-looking fact is either **append-only** or **versioned with the old row preserved**; nothing is deleted (AC-05, AC-45). Append-only tables have `UPDATE`/`DELETE` revoked and a trigger that raises. | AC-05, AC-45, manifest §8.2e |
| Every table that can carry a served number carries **provenance by reference, never beside** — the number and its origin are one row, so the D4 join cannot be forgotten. | AC-34, manifest §10.4 |
| Every closed vocabulary is a Postgres `CHECK` against the `kernel` enum plus an application-level exhaustiveness check; unknown members fail loudly at write. | AC-35, AC-65 |
| Every hash column names what it hashes (`input_hash`, `contract_hash`, `content_hash`, `packet_fingerprint`) and is immutable once written. | AC-10 |
| Identity columns are opaque and never reused. **Evaluation ordering is the content-derived rule of §3.2 Seam A, recorded on `propagation_run`** — never a sort over opaque identities (manifest §8.2g), and never re-derived on a recomputation. The **ledger's** total order is its own `sequence` allocator (AC-45), which is a different mechanism for a different purpose. | manifest §6.2, §8.2g; AC-08 |
| Every row that a register value moved records `register_row_key` + `register_version` so the constant can be printed where it was used. | AC-75 |

### 4.1a Run and activation (schema `core`) — the run entity

Every other table in §4 references a run; **the run itself is the carrier for
seven obligations that are otherwise stated and stored nowhere.** Both tables are
written **before the first stage executes**.

**The run is split into a frozen head and a progress record**, because the same
row cannot be both continuously mutable and the carrier of "frozen at run
start". §4.1's standing rule 1 admits only append-only or versioned facts, and
AC-32/charter A3.2 require enforcement *at write time, not by convention* — a
bar the plan applies to nodes and arrows and must apply here too.

- **`run` (immutable frozen head)** — `{run_id, question_line, asker_id,
  session_id, caller_scope, as_of, risk_tier,` **`tier_source ∈ {ASKER,
  DEPLOYMENT_POLICY, DERIVED}`** and **`tier_provenance_ref`** (§6.2 AM-5 — the
  *authority* is V's to rule, so the row records **who set it** without the
  schema assigning ownership to anyone; a round-trip fixture covers all three
  suppliers)`, depth_params, agent_count,` **`stranger_sample_rate`** (AC-50 —
  frozen at run start; the ratchet applies to the *next* run),
  **`envelope_basis`** (AC-49 — the envelope is a **run** object, visible
  "before and during the run" per spec N-9, so it cannot live on `answer`, which
  does not exist yet), **`register_version`** (AC-74 — every run pins one, so a
  register change cannot retroactively move a served number),
  **`battery_version`** (spec §23.D `OD-S-04`), `created_at_seq`.
  **`UPDATE` and `DELETE` are both revoked on this table** (grant revocation plus
  a raising trigger) — and likewise on `run_progress_event`,
  `run_row_activation` and `run_row_activation_event`, per §4.1's standing rule 1
  ("`UPDATE`/`DELETE` revoked and a trigger that raises") and AC-05 ("nothing is
  ever deleted"). Revoking `UPDATE` alone would leave a `DELETE` on `run` free to
  erase the pinned `register_version`, `stranger_sample_rate` and
  `battery_version` of a run whose answer has already been served, making that
  answer unreplayable with no trace — the ledger records what executed, not what
  the run row pinned. Without the revocations, "frozen at run start" is enforced
  by nothing:
  a mid-run `UPDATE run SET stranger_sample_rate = …` moves conformance coverage
  inside a live run, and a mid-run `register_version` change makes replay read a
  register the run did not use — breaking AC-06 with no trace, because the ledger
  records what executed, not what the run row said when it executed.
- **`run_progress_event` (append-only)** — the mutable half as events:
  `{run_id, at_seq, kind ∈ {ENVELOPE_CONSUMED, ENVELOPE_STATE, PHASE}, value}`.
  Current envelope consumption, `envelope_state ∈ {WITHIN, ENRICHMENT_SKIPPED,
  EXHAUSTED}` and `phase ∈ {EMPIRICAL, VALUE}` are **derived from the latest
  event**, never asserted on a mutable column — which is AC-88's *"status is
  derived, never asserted"* applied to the run. The **monotone phase
  transition** (DR-053; F-12's gate reads phase *during* the run, so
  answer-grain is the wrong grain) is enforced as a write-time check against the
  latest `PHASE` event, and `phase_settled_at_seq` is that event's sequence.
  `answer` keeps only the **serve-time projection** of all of this.
- **Initialization is mandatory, so "current state" is total from run creation
  onward.** Execution needs a phase, an envelope state and an activation state
  *before* the first stage runs, and "derived from the latest event" is undefined
  over an empty stream. Therefore, **in the same transaction that writes the
  `run` frozen head**, the runner writes the **initial events**:
  `PHASE = EMPIRICAL`, `ENVELOPE_STATE = WITHIN`, `ENVELOPE_CONSUMED = 0`, and
  one `run_row_activation_event` per battery row carrying its opening state from
  its activation predicate. **An empty stream is not a legal state and is a
  typed error on read, never a default** — a default here would be the silent
  assumption the pack forbids everywhere else. Database fixtures owed (S1,
  `06-test-strategy.md`): (a) `UPDATE` and `DELETE` against the frozen head both
  raise; (b) current phase, envelope state and every row's activation state are
  resolvable at every point from run creation to run end, with no empty-stream
  window.
- **`run_row_activation`** — one **immutable** row per `(run_id,
  battery_row_id)` carrying `{predicate_ref}` only, with everything that belongs
  to a *transition* on the append-only **`run_row_activation_event`** stream:
  `{state ∈ {ACTIVE, INACTIVE, WAIT, POLICY_BLOCKED}, predicate_inputs (as
  evaluated at this transition), skip_evidence, at_seq}`. **One discipline per
  table.** `predicate_inputs` and `skip_evidence` were moved off the row because
  they are written *at* a transition — `skip_evidence` by definition at the
  transition to INACTIVE, which spec §1 requires be "recorded with predicate +
  evidence" — so leaving them on the row would force an `UPDATE` after creation
  and, on R3 (the one row with an explicit re-activation clause), a second skip
  would overwrite the first. `last_evaluated_at_seq` is **not a stored column**:
  it is **derived as the `at_seq` of the latest event for that
  `(run_id, battery_row_id)`**. This is the carrier for AM-10's WAIT
  semantics and OQ-G9's activation predicates, and it is what makes AC-04's
  "resumable" property real: **without it, a runner restart cannot know which
  rows were WAIT under which predicate**, so the resumed run either re-fires rows
  the ledger already recorded or files WAIT rows as INACTIVE — which spec §1
  explicitly forbids, as it forbids filing `POLICY_BLOCKED` as INACTIVE. A cache
  hit never sets a row INACTIVE (spec §1; `OD-M-22`).

### 4.2 Graph store (schema `core`)

- **`node`** — opaque id; run/answer ref; owning question; structural parent
  (lineage only); depth; sibling ordinal **banded by child kind**; materialized
  path (AC-33); node type; `generation_status ∈ pending|complete|failed|stale`;
  `path_status ∈ active|abandoned`; `exploration_decision` from the closed set;
  `relevant_as_of`; `position_label` (AC-31). Write-time checks per AC-32.
- **`node_text_revision`** — append-only body-text history with **exactly one
  live text**, pointed at by the node (manifest §6.2). **The non-blank claim uses
  the null-safe canonical rule of §2.4, restated here identically so the two
  cannot diverge: `claim_text text NOT NULL` together with
  `CHECK (length(btrim(claim_text)) > 0)`** — equivalently the single null-safe
  form `CHECK (coalesce(length(btrim(claim_text)), 0) > 0)`. A **bare**
  trimmed-length `CHECK` is not sufficient and must not be written: in PostgreSQL
  a `CHECK` passes unless its expression is **false**, and `length(btrim(NULL))
  > 0` evaluates to `NULL`, so the bare form accepts the null case it appears to
  reject and leaves manifest §6.4's "blank claim rejected at write time, not
  merely at serialization" and charter A3.2 unmet. Canonical owner: this table's
  creating migration (§2.4). Fixture rejects **null, empty and whitespace-only**,
  **exercised against the migrated database rather than an application
  validator** (S2).
- **`node_epistemic_record`** — the 13-item per-node record (manifest §6.2),
  including the node-level provenance projection *readable at the node, not a
  join away*, the uncovered-scope statement, and structural-drop visibility.
- **`stranger_restatement`** — one row per node and one per verdict, minted with
  its subject (not at serve time), carrying the canonical field list and
  `check_status ∈ {PASS, FAIL, NOT_SAMPLED}` (AC-67). `action_consequence` is
  `NOT_APPLICABLE` on node rows — enforced by a `CHECK` keyed on `subject_kind`.
- **`edge`** — **the mandatory first-class edge table** (AC-18; manifest §6.3
  names V2's absent edge table the largest structural gap). Shape:

  ```
  edge(
    edge_id, run_id, source_node_id,
    target_kind    ∈ {NODE, EDGE},           -- polymorphic target, AC-19
    target_node_id, target_edge_id,          -- exactly one non-null per kind
    target_edge_polarity,                    -- denormalized; see the FK below
    polarity       ∈ {support, attack},
    kind           ∈ {rebutting, undercutting} NULL,   -- closed; attacks only
    strength       numeric NULL,             -- nullable, AC-28 / A-2
    magnitude_status ∈ {MEASURED, UNKNOWN},
    strength_source ∈ {EVIDENCE_VERIFIER, CLUSTER_COLLAPSE,
                       UNDERCUT_TRANSMISSION},         -- see (4) below
    provenance_ref, created_at_seq
  )
  UNIQUE (run_id, edge_id, polarity)         -- the FK target for (2)
  ```

  **(1) The arrow-kind vocabulary is closed at two members, and it types
  attacks.** Manifest §6.3 (DR-062 `OD-19`) reads: *"**Arrow kinds** distinguish
  **rebutting** an attack (denying the claim itself) from **undercutting** it
  (granting the claim while denying that it supports its parent)"* — both members
  are distinctions **within** an attack. The pack declares **no support-side
  member**, and minting one would extend a ratified closed enum, which
  architecture may not do (DR-062 `OD-19`, spec S-13's discipline, DR-039).
  Therefore `kind` is **bound to polarity** by `CHECK`: `polarity = 'attack'`
  requires `kind IN ('rebutting','undercutting')`; `polarity = 'support'`
  requires `kind IS NULL`. A support edge is fully typed by its polarity; the
  kind column is the attack-typing vocabulary and nothing else. Unknown values
  fail loudly at write (AC-35).

  **(2) The undercut targets a SUPPORT edge specifically — enforced, not
  described.** DR-066(2) rules the undercut is *"a typed attack targeting the
  support EDGE, never the claim node"*. `target_kind = EDGE` alone is too weak:
  it would admit an undercut of an attack edge. The invariant is carried by a
  **graph-scoped composite foreign key** — `(run_id, target_edge_id,
  target_edge_polarity) REFERENCES edge (run_id, edge_id, polarity)` — plus
  `CHECK (kind <> 'undercutting' OR (target_kind = 'EDGE' AND
  target_edge_polarity = 'support'))`. The denormalized column cannot drift,
  because the FK makes the database resolve it against the target edge's actual
  polarity, **and carrying `run_id` on both sides means the resolution can only
  land inside the same graph** (C-11). **Single owner: the migration that creates
  `edge`** (§2.4); the `graph` write API restates it only for error quality.
  `06-test-strategy.md` owes a **rejecting fixture** (an undercut written against
  an attack edge is refused) alongside the accepting one, per AC-79.

  **(3) Upsert semantics — collapse and integrity error are different
  outcomes.** AC-35 carries two distinct behaviours from manifest §4.4:
  *"Duplicate identical arrows collapse"* and *"one identity carrying two
  different strengths is a loud typed integrity error"*. A bare unique index
  cannot tell them apart and would reject both, turning a legitimate
  re-derivation into a write failure. The rule: the identity is
  `(source_node_id, target_kind, coalesce(target_node_id, target_edge_id),
  polarity)`; on conflict, **if `(strength, magnitude_status, strength_source,
  kind)` are all equal the write collapses to the existing row (no-op, returns
  the existing `edge_id`)**; **if any differ it raises the typed integrity
  error** — never a silent pick. Both cases get a fixture in S2.

  **(4) `strength_source` is not frozen while A-1 is open (§6.4).** AC-27 /
  DR-062 `OD-06` closes arrow strength to ruled producers, and the two named ones
  are the evidence verifier's grounded score and cluster collapse. But this
  seat's own recommended answer to A-1 — an undercut that **reduces the
  transmitted contribution of the support edge it targets** — is a magnitude from
  neither producer, so a two-member enum would leave the *only* representable
  undercut as `magnitude_status = UNKNOWN`: option (ii), which §6.4 A-1 itself
  indicts as *"a first-class relation that changes nothing"*. **A ruled relation
  must not be dead by construction on day one, whichever way V rules.** So a
  third member, `UNDERCUT_TRANSMISSION`, is declared and **fenced** by
  `CHECK (strength_source <> 'UNDERCUT_TRANSMISSION' OR (kind = 'undercutting'
  AND target_kind = 'EDGE'))` — AC-27's closure is preserved intact for every
  other edge. **What the column holds under each A-1 answer:** if V rules the
  transmission-reduction shape, `UNDERCUT_TRANSMISSION` with a `MEASURED`
  magnitude produced inside the pure core and recorded per edge; if V rules the
  inert shape, `magnitude_status = UNKNOWN` and the third member is never
  written — in which case it must be **removed rather than left unreachable**
  (AC-77, charter VR-4), and that removal is S2's exit condition; if V rules a
  third shape, the effect is carried as a distinct recorded quantity on
  `propagation_run` instead and the member is likewise removed. **A-1 is
  therefore an entry criterion for slice S2, not a question that can wait**
  (§8).

  **The fence is not a ratification, and this plan does not treat it as one.**
  `DR-062 OD-06` closes the set of **producers** of arrow strength — *"only ever
  the evidence verifier's grounded score or provenance cluster collapse"* — not
  the set of edges the closure applies to. Fencing `UNDERCUT_TRANSMISSION` by
  `CHECK` preserves AC-27 for every *other* edge, which is all it does; under
  A-1's answer (a) an undercut edge would carry a `MEASURED` strength from a
  mechanism `OD-06` does not name, and that is a **ratified-closure extension**
  — the very thing §4.2(1) five paragraphs above refuses to do for the arrow-kind
  vocabulary. **Therefore: the member is declared in the schema but is NOT
  WRITABLE until V rules, and A-1's question (§6.4) is extended to ask for the
  ratification explicitly.** A bare "yes" to "does an undercut reduce the
  transmitted contribution?" would leave S2's entry criterion satisfied and the
  table still unfreezable. **The cheaper path, recorded here so V can see it:**
  A-1's answer (c) — carrying the reduction as a per-edge quantity on
  `propagation_run` — needs **no `OD-06` amendment at all**, because the
  quantity never becomes an arrow strength.

  **(5) Graph-scoped integrity, and the remaining constraints.** Every endpoint
  is bound to **the edge's own graph**, not merely to some row somewhere: `node`
  carries `UNIQUE (run_id, node_id)`, and the edge's endpoints are
  `(run_id, source_node_id) REFERENCES node (run_id, node_id)` and
  `(run_id, target_node_id) REFERENCES node (run_id, node_id)`, alongside (2)'s
  graph-scoped target-edge FK. Without `run_id` in those keys an edge in run A
  could take a node or a support edge in run B as an endpoint — contradicting
  "one graph per run" (§4.2 Graph scope) and AC-69's **link-never-merge, no
  transitive closure** rule, under which the *only* legal cross-run relation is
  a typed memory link. **Rejection fixtures are owed for every cross-run
  source/target combination** — cross-run source node, cross-run target node,
  and an **otherwise-valid undercut of a support edge in another run** — added
  to S2 and `06-test-strategy.md`. Remaining: `CHECK` that `target_kind` matches
  exactly one populated target column; `CHECK (strength IS NULL) =
  (magnitude_status = 'UNKNOWN')` (AC-28); no self-edge; "endpoint absent from
  the node set" is therefore a write error rather than a compute surprise
  (manifest §4.4).
- **Graph scope.** One graph per answer/run; cross-run relations are typed
  memory links, never merges (AC-69). Archival keeps the whole graph (AC-05).

### 4.3 Execution ledger (schema `ledger`)

- **`ledger_entry`** — append-only, `sequence bigint` from a dedicated allocator
  taken under a write lock so same-tick rows are orderable; **the total order is
  the sequence, never a timestamp and never a random tiebreak** (AC-08, AC-45).
  Columns: run ref, stage, row id (battery row), action kind (closed vocabulary;
  an executed check mapping to no member is `UNCLASSIFIED_ACTION` and is itself
  an `UNINSTRUMENTED` trigger — spec §8.1 A-2), actor, **`subject_item_id`**,
  **`stance_at_action`** (AC-46), typed outcome
  (`OK|FAILED|BLOCKED|TIMED_OUT|REFUSED|SKIPPED_BY_BUDGET`), timings,
  `input_fingerprint`, `contract_hash`, register refs, digest text (tier 2).
- **`raw_artifact`** — persisted unconditionally, parseable or not: raw text,
  its hash, request metadata, parse status and error, the validated assessment
  or nothing, allow-listed and recursively scrubbed provider metadata, latency,
  checked-at (AC-13). `input_hash` and `contract_hash` are **separate columns**
  (AC-10) so a superseded artifact is recognised as superseded rather than
  colliding; cache identity includes the contract hash and yields a **new row**.
- **`reduced_judgement`** — the deterministic reducer's output: τ, uncertainty
  ladder position, drivers in fixed emission order, ordered score caps with
  what/to-what/why/by-what, typed holes, branch identifier, `reducer_version`,
  **`judge_weight_version`** (see §6, U-5: any input that moved a served number
  is a frozen replay input).
- **`propagation_run`** — the evaluation snapshot's receipt: graph fingerprint
  (input-order-independent; changes when any τ changes; differs between two
  operator selections), the recorded arrow order, the per-parent operator
  identifier **and the resolution level that supplied it** (AC-22), the cluster
  records (AC-23), engine version.
- **`node_strength_record`** — one row per node per propagation run:
  `{strength, tau_source, way_of_knowing, cluster_id, judged_by, abstained,
  supported_by, attacked_by, operator_used, position_label, lift_marker}`
  (manifest §4.3) — **never a flat map** (AC-34).
- **`decision_record`** — the pure decision function's inputs, firing reasons,
  `categorical|scalar` classification, blockers (recorded, excluded from
  classification), spawn count, and a **replay identity hash excluding the
  idempotency key, spawn count and classification fields** (AC-48).
- **Partitioning**: `ledger_entry` and `raw_artifact` partitioned by run range;
  no partition is ever dropped (AC-05).

### 4.4 Serve artifacts (schema `serve`)

- **`fact_bundle`** — persisted, **versioned and content-hashed**, keyed to
  `(answer_id, answer_version)`. Rationale: DR-034 replays from *frozen
  records* and DR-060(b) makes the conformance verdict an **input artifact**, so
  the bundle the verdict was rendered against must be frozen and addressable
  (AC-06/AC-07). Contents are computed facts and typed records only (AC-51),
  including Q53's residual objection **as a field** and the machine-injected
  honesty fields (AC-54).
- **`composed_text`** — an **ordered list of typed segments with stable ids**
  *(architecture term: **segment**)*, each carrying its load-bearing flag **and
  a `segment → served_number` reference set** listing every number the segment
  asserts. This is what lets the conformance record express three states per
  segment — judged / sampled-and-passed / not sampled (DR-060a) — and what
  orders DR-058's multi-pass composition. It is display only (AC-63).
- **The eviction rule (AC-12 × AC-63 × AC-44).** The composed text was written
  from a bundle in which every number was present, and it passed conformance
  against that bundle — and the conformance verdict is a **frozen input
  artifact, never regenerated** (AC-07). So when the continuous replay self-test
  later evicts a number (DR-059), prose that recites it would otherwise keep
  serving: the reader would see a number with no origin and no replay handle,
  which AC-63 states as an absolute (*"or it does not arrive"*), and the
  conformance record would still attest that segment as JUDGED against a fact
  that no longer exists — AC-44's *"no served sentence may imply a check the
  ledger says did not run"*, read from the other end.

  **The rule, in the only shape the pack admits.** *(This supersedes the round-1
  wording, which wrote `SUPERSEDED` into the conformance record and produced a
  part-composed / part-components answer. Both halves were defects: the first
  mutated a frozen replay input, the second minted a third answer-surface
  state.)*
  1. **The conformance record is never written after it is sealed.** AC-07 /
     DR-060(b) make the serve decision replay **as stored data** with the
     conformance verdict an input artifact *never regenerated*; if eviction
     edited its per-segment states, a ceremony run after an eviction would
     replay a different serve decision than the one served, and §4.1's standing
     rule 1 independently forbids the unpreserved mutation. Its per-segment
     vocabulary stays the ruled three — `JUDGED / SAMPLED_PASSED / NOT_SAMPLED`
     (DR-060a) — with **no fourth member minted here**; a new typed state may
     only be minted where spec §12.3's authority allows (AC-65, S-13).
  2. **Suppression is a separate, append-only serve projection**:
     `segment_suppression {answer_id, answer_version, segment_id,
     evicted_number_ref, at_seq}`, written when a `served_number` transitions to
     `EVICTED(MISSING-NUMBER)` and keyed to it. The **served** per-segment state
     is the **derived join** of the frozen conformance record and the
     suppression rows — AC-88's *"status is derived, never asserted"*, applied
     here. **The replay ceremony reads the conformance record without the
     overlay**, because the overlay post-dates the serve decision it is
     replaying. **Its named served consumers, so it is not an orphan** (AC-77,
     §8 rule (ii); the never-called list is BLOCKING): the **tier-2 authorized
     record** (`GET /v1/answers/{id}/inspection`, where the suppression rows say
     *which* segments the eviction withdrew and why) and the
     **execution-ledger digest** (`GET /v1/answers/{id}/ledger-digest`, AC-44 —
     the degradation is a thing that happened and the digest is where the reader
     learns it happened). Under clause 3 there is no served composed text after
     an eviction, so without these two consumers named the rows would be charter
     G5 dead cost on the day they land.
  2a. **The carrier for both transitions, named once** (they are the only two
     state changes eviction causes, and Seam D classes `served_number` as a
     frozen artifact, so neither may be an in-place update — §4.1 standing rule
     1). **One append-only stream carries both: `served_number_event
     {answer_id, answer_version, number_ref, status ∈ {PRESENT, EVICTED,
     WITHHELD}, reason, at_seq}`.** The number's **current status is derived
     from its latest event**; the **answer's current serve state is derived
     too** — an answer with ≥1 `EVICTED` event for its version projects as
     `components-only + DEFECT`, which is clause 3 expressed as a projection
     rather than as a write. **Nothing is overwritten:** the original
     `served_number` rows, the composed text, the fact bundle and the
     conformance record all stay exactly as sealed. **Version selection on
     reads:** `GET /v1/answers/{id}` returns the **latest `answer_version`** with
     its **current** derived projection; `GET /v1/answers/{id}?version=` returns
     that version's artifacts **as sealed**, and the replay ceremony always reads
     the sealed form. So the historical answer replays byte-identically while the
     live read shows the degradation — the two questions eviction raises,
     answered by one carrier.
  3. **Eviction transitions the whole answer to components-only + `DEFECT`.**
     `RULED(DR-049, DR-057)` and ui §4.0 give exactly **two** answer-surface
     states — *"Composed, or components-only + DEFECT"* — and W20 renders those
     two. A part-composed/part-components hybrid would be a third state with no
     ruled rendering, and charter §5.2 row 12's fixture would be written against
     a surface the interface contract does not admit. The two-state reading also
     satisfies DR-059's *"the rest serves"* directly: the verified facts, badges
     and node graph serve, the evicted number carries its typed missing-number
     mark, and **one number is lost, never the answer**.
  4. **The fixture asserts three things**, alongside charter §5.2 row 12's own
     assertions (S5): (a) the **frozen conformance record is byte-identical**
     before and after the eviction; (b) the **historical replay** of the sealed
     answer version still passes, reading the sealed artifacts without the
     overlay; and (c) the **current projection** of that answer reads as
     `components-only + DEFECT` with the evicted number carrying its typed
     missing-number mark.
- **`conformance_record`** — the judge's full record (behind the authorized
  handle), the **outcome** (always on the answer), which R9 pass failed when one
  did, and the per-segment judged/sampled set (ui §1.2 Serve record).
- **`served_number`** — every weight-bearing number that reached a payload, with
  its provenance reference and replay handle, **sealed with its answer version
  and never updated in place**; its **status is derived from `served_number_event`**
  (clause 2a) over the discriminant
  `PRESENT | EVICTED(MISSING-NUMBER) | WITHHELD(reason)`. `EVICTED` is AC-12;
  `WITHHELD` is AC-22/AC-26's withheld parent. All three are distinct from
  *absent*, which is not representable in a payload (AC-63).
- **`answer`** — `(answer_id, answer_version, as_of)` (AC-73), `run_id`, verdict
  state and confidence band as **ordered labels** with the cut-point matrix
  supplied by the register (AC-66, AC-74), **`band_ceiling`** — AC-24's
  way-of-knowing ceiling label that charter VR-2 requires every band to name,
  computed from the `way_of_knowing` distribution over the answer's load-bearing
  nodes and printed beside the band — **serve state as sealed at serve time,
  with the *current* serve state derived from `served_number_event` per §4.4
  clause 2a** (an answer version with ≥1 `EVICTED` event projects as
  components-only + DEFECT), root node, refs to
  bundle/conformance/composed text. **`phase`, `envelope_*`, `register_version`
  and `battery_version` live on `run` (§4.1a), not here**; `answer` carries only
  their **serve-time projection**, because the envelope must be visible before
  any answer exists and the phase gate is read during the run (spec N-9,
  DR-053 F-12).
- **`condition_mark`** — `{mark, scope ∈ {answer, node}, subject_ref, reason,
  lift_path?}`, membership imported from spec §12.3 (AC-65), with
  **`condition_mark_node` as the single authoritative store of the affected
  set** — a join table populated **at write time from the ledger rows that
  caused the mark**. *(No `affected_node_ids` array on the mark row: two storage
  sites for one fact is the same two-copies-no-reconciliation defect UI-9 was
  corrected for, and AC-85's "one behaviour, one place" applies to data. The
  join is the one that supports both write-time population and the read-time
  projection.)* The affected set is
  load-bearing, not decoration: DR-021 knob 10 and ui §4 row 8 require the
  answer-level list to be *"echoed into **each affected node's** provenance"*,
  and an answer-scoped row whose only `subject_ref` is the answer would project
  to the **empty set for every node** — so an enrichment row skipped for a
  subtree would show `SKIPPED-BY-BUDGET` on the answer and on none of the nodes
  it describes. That is a served-but-unreachable honesty surface, the D4 shape,
  and it would silently fail charter §5.2 row 6's BLOCKING fixture if the fixture
  inspects a node. **The fact is stored once, at answer scope, with its affected
  set; the per-node appearance is a read-time projection over that set** (§6.6
  UI-9).
- **`abstention`** — kind (one per ignorance-ledger unknown), the price cell
  `(question_class, risk_tier, price)` naming its register row, unlock
  condition, ledger-unknown ref (AC-65).
- **`answer_index`** — the list surface, keyset-paginated (AC-62), carrying
  names not numbers (see §6, ui ambiguity 10).

### 4.5 Model ledger and scorecards (schema `scorecard`)

- **`model_identity`** — provider, model id, **`model_version`** (a required
  key, AC-42); a silent provider update writes a revision trigger.
- **`session_assignment`** — the model ledger proper: sessions and per-category
  model bests informing the next session's assignment (DR-046; spec §16.5 K-22)
  — **in this same database** (AC-02).
- **`scorecard_cell`** — key `(model_id, model_version, provider, task_class,
  metric, as_of)`; value, `n`, interval, population counts
  `{settled, unsettled, permanently_unscoreable, abstained}`, `basis` with no
  ASSUMED/DEFAULT member (AC-42). Cells are **derived views over the ledger**
  materialised with a recorded derivation version — a scorecard is a pure
  function of the ledger (AC-41), so the materialisation is a cache with a
  replayable definition, never an independent write path.
- **`routing_decision`** — lane (served / uniform panel / critic-exempt), the
  guard trail, and the **propensity recorded per decision** (AC-40 G2).
- **`answer_outcome`** — `{answer, prior, posterior, basis, resolver, date,
  provenance}` with read-back verification recorded as its own ledger action
  (AC-73).

### 4.6 Register (schema `register`)

- **`register_row`** — key, declared type, value, unit, `register_version`,
  ratified-by, ratified-at, `is_provisional`, recalibration owner + trigger +
  sign-off route (charter A5.2), and the **resolution scope** (deployment / run
  / parent) where the row participates in a chain (AC-22's OD-22 chain is one
  instance of the same mechanism).
- **`register_version`** — an immutable set of rows; every run pins one, so a
  register change is visible in replay and cannot retroactively move a served
  number (AC-06, AC-74).
- Rows are **keys with no invented values**: the register skeleton ships with
  every key the pack names and values only where the pack states them (AC-76).

### 4.7 Memory (schema `memory`)

- **`question_key`** — the projection of already-frozen fields (settlement act,
  question type, declared field, normalized binding, hash of the frozen query
  set), with `as_of` and `policy_version` carried as **link attributes, not
  identity** — the memory key is deliberately not the cache key (AC-68; spec
  §17.1 M-2).
- **`memory_link`** — typed directed edge `{REPEATS, REFINES, CONTRADICTS_PRIOR,
  RELATED_ONLY}` with tier, agreed/disagreed fields, decider, timestamp, key
  version, alias rows used (AC-69). No transitive closure — enforced by the
  absence of any closure job and a property test.
- **`alias_row`** — `{surface, canonical, confirmed_by, confirmed_at,
  from_run_pair, key_version}`, written **only when a link is confirmed**,
  dated and reversible, and a replayable input (spec §17.2 M-8).
- **`pull_record`** — pinned `{artifact_id, version, content_hash, as_of,
  staleness_state_at_pull}` (AC-70), with the flat declared pull cap's register
  row printed where used (AC-75).
- **`asker_scope`** — question-level pulls carry the asker partition; class-level
  facts do not (AC-71). The identity behind this partition is a V-QUESTION
  (§6, AM-12); the column exists either way.

### 4.8 Liveness (schema `core`)

`revision_trigger` (watched conditions, including Q58's named ones, a provider
model-version change, and a `CONTRADICTS_PRIOR` link), `review_clock` (class TTL),
`staleness_state` per node and per answer with `{FRESH, UNDER_REVIEW, STALE,
ARCHIVED_REVIVED}` (AC-72, ui §4 row 4). Retirement writes `ARCHIVED`; nothing
is deleted (AC-05).

---
## 5. API direction

The UI contract is explicit that it is **not endpoint design** and that
"whether that is REST, GraphQL, one document or twelve, is the ARCHITECTURE
loop's to propose and V's to ratify" (ui §0). What follows is that proposal.
Field names in the contract are "illustrative, not normative" (ui §1.2), so the
shapes below refine rather than contradict them.

### 5.1 Encoding and front door — SEAT-PROPOSAL

Resource-shaped JSON over HTTP, one versioned namespace (`/v1`), served by
`apps/api` as the single front door (AC-60). SSR and browser use the same
generated client and the same addresses; the asker's session scope is forwarded
on the SSR path and **SSR is never a privileged caller** (AC-57). Rejected
alternatives and their reasons are in §2.3.

### 5.2 Three payload classes, and the boundary between them

| Class | Contents | Who may read | Constraint |
|---|---|---|---|
| **Default projections** | all nine honesty surfaces as typed fields, composed text or the components-only rendering, serve state + conformance outcome, every served number with origin label and provenance reference carrying a replay handle, the node set and the **edge set** | anyone authorized to read the answer | AC-56, AC-58, AC-63 |
| **Authorized record** | the complete fact bundle; **the conformance judge's "full record" — meaning the structured `conformance_record`**: outcome, which R9 pass failed, the per-segment `JUDGED / SAMPLED_PASSED / NOT_SAMPLED` states and the judge's structured findings; and the recomputation trail for any served number — **the trail being the frozen typed inputs, the input/contract/content hashes, the reducer / contract / engine versions, the recorded arrow order, the cluster-collapse records and the arithmetic: sufficient to recompute, containing no raw model text** | the asker, in their own session's scope, for their own answer | AC-56, AC-57, AC-06; DR-066(1) |
| **Operator-only** | internal prompt material; **the `raw_artifact.raw_text`, provider metadata and request metadata of EVERY model call — per-node judges, the composition model, and the conformance judge alike**; plus the internal debug facet | operator scope | AC-56, AC-57, **AC-44** (*"raw tapes internal"*, *"raw judge text never reaches a served item"*), **AC-87** (manifest §9.2b *"strip raw judge output"*), manifest §5.3, §9.3 |

**Why the conformance judge needs saying twice.** The conformance judge is a
model call, so Seam C and AC-13 give it a `raw_artifact` row like any other.
Left implicit, that row is tier 3 by the raw-tapes rule and tier 2 by DR-066(1)'s
*"the asker may replay their own answer's full record"* — and both readings break
something: route it to tier 3 and the asker loses part of a ruled entitlement;
route it to tier 2 and raw tapes reach a served surface through the one endpoint
the asker is guaranteed. §4.4's `conformance_record` is a distinct structured
table, so the line is drawn there: **the asker gets the structured record; the
raw text of every model call, conformance judge included, is operator-only.**
`/v1/answers/{id}/inspection` owes a fixture asserting **no `raw_text` appears
anywhere in the tier-2 payload**.

**One handle, two tiers.** "Show me why" is a property of the contract, not a
per-screen feature (ui §4 row 2): every number's provenance carries the same
handle shape, and authorization is evaluated once per request against
(session → asker → answer ownership) for tier 2, and against operator scope for
tier 3.

### 5.3 Resource surface — SEAT-PROPOSAL

Reads (all **side-effect-free**, AC-62):

| Method + path | Returns | Notes |
|---|---|---|
| `GET /v1/answers` | the answer index: question line, verdict state, staleness state, abstention kind + cell name, serve state, builds-on-previous flag | **keyset pagination** (`limit` + opaque `cursor`), both sent and honoured (AC-62); components-only labelled **in the list** (ui §2 surface 1) |
| `GET /v1/answers/{id}` | Answer + node set + **edge set** + honesty projections + serve record, in **one coherent read**. **Version selection (§4.4 clause 2a):** with no `version` parameter it returns the **latest `answer_version` with its current derived projection** (so a post-serve eviction shows as components-only + DEFECT); `?version=` returns that version's artifacts **as sealed**, which is also what the replay ceremony reads | the fact bundle and conformance record are **not** in this read (AC-56); payload bounded because projections cross the wire, not the bundle |
| `GET /v1/answers/{id}/nodes/{nodeId}` | node envelope: claim, way of knowing, base score and final strength each with a provenance reference, defeater state, exploration state, node-scoped marks, `stranger_restatement` with `check_status` | ui §1.2 Node |
| `GET /v1/answers/{id}/export` | composed text or components-only rendering + serve state + honesty projections + execution-ledger digest | "an export that omits the honesty surfaces is not a faithful export" (ui §2 surface 5); whether it may embed authorized-handle material is an access-control decision, resolved by §5.2's tiers |
| `GET /v1/answers/{id}/ledger-digest` | the user-visible execution digest | AC-44 |
| `GET /v1/answers/{id}/inspection` | **tier 2**: complete fact bundle + conformance record | AC-56/AC-57 |
| `GET /v1/numbers/{provenanceRef}/replay` | **tier 2**: the frozen typed inputs, hashes, versions, recorded arrow order, cluster records and the recomputation — **no raw judge text** (that is tier 3), no model in the path | AC-06, AC-44, AC-87; ui §1.2 Replay trail |
| `GET /v1/answers/{id}/inspection/debug` | **tier 3, operator scope**: the internal debug facet — graph fingerprint, per-node strengths, the full tau-source map **as the per-node provenance record, not a flat float map**, the operator identifier actually used, deduplicated attack/support arrow lists over the **identical node set** as the scored graph. Attached only on the successful path, absent when not requested, **explicitly not part of the stable wire contract**, and reached through the authorized handle. Giving it an address is what stops it being a shipped unit with no entry point — a charter G1 orphan on the BLOCKING never-called list the day S5 lands | manifest §9.3 (DR-062 `OD-18`); AC-34, AC-56, AC-77 |
| `GET /v1/answers/{id}/inspection/prompts` | **tier 3, operator scope**: internal prompt material and raw judge artifacts | AC-56 S-24, AC-44 |
| `GET /v1/nodes/{nodeId}/executions` | execution-ledger read scoped to the node; an empty list means "nothing happened", never "the read failed" | ui §2 surface 11 |
| `GET /v1/register` / `GET /v1/scorecards` / `GET /v1/fleet` | deployment register read; scorecard + model-ledger read; fleet status | ui §2 surfaces 12–14; the stale-worker reaping side effect moves to a scheduled job (AC-62) |
| `GET /v1/session` | identity/session surface — **separate** from the register read | ui §2 surface 12; this is what DR-066's "their session's scope" is evaluated against |

Writes:

| Method + path | Effect |
|---|---|
| `POST /v1/asks` | starts a run; writes `run` and `run_row_activation` (§4.1a) before the first stage executes. Required: question, **risk tier** ∈ casual/standard/high-stakes carried **with its supplier/provenance** (`tier_source`, see §6.2 AM-5 — the *authority* for setting it is a V-QUESTION, so the field records who set it and the API asserts no ownership), depth/agent-count parameters, decision/action owner, caller scope, `as_of` (defaulting to now, DR-021 knob 11), steering pre-sets. **Refuses a standard-or-above ask on a deployment failing the maker-inventory assertion** (AC-38, §3.2 Seam C) with a typed error — DR-055's launch gate has to be able to say no somewhere, and this is where |
| `POST /v1/nodes/{id}/regenerations` | bounded by 2 regeneration rounds / 3 attempts (DR-020 knob 5) with model rotation (DR-041); returns a typed job + replay handle; at cap exhaustion a typed "not runnable" abstention carrying the rejection evidence |
| `POST /v1/investigations/{id}/executions` | DR-045's flow; returns a typed job + replay handle |
| `POST /v1/answers/{id}/steering` | menu selections + **verbatim** free-text annotations, typed as human-steer input and disclosed in the served trail (DR-019 knob 4) |
| `POST /v1/answers/{id}/memory-link/unlink` | the unlink control (spec §17.6 M-22); its semantics are a delegated cell (ui 9(b)) — the endpoint exists, the effect is register/mockup-governed |
| `POST /v1/nodes/{id}/feedback` | node-scoped outcome signal into the model ledger (ui §2 surface 9) |
| `PUT /v1/register/{key}` | deployment register write, keys V-ratified (AC-74) |

### 5.4 Typed shapes that make illegal states unrepresentable

- **The labeled number.** Every weight-bearing number on the wire is
  `{ value, provenance_ref, replay_handle, kind, source, producer }` — never a
  bare scalar. L1/L2 and P-D4 then hold **by type**: a number without provenance
  cannot be serialized (AC-63, AC-34).
- **The number slot.** `PRESENT | EVICTED | WITHHELD` as a discriminated union
  (AC-12, AC-22) — distinct from absent, which the schema does not admit.
- **Honesty projections are non-optional fields** on the Answer resource. DR-058
  machine-injects them; making them optional would let a serializer do what the
  composition model is forbidden to do (AC-54).
- **The value hinge's weight** is a union — `{source: owner_elicited|org_policy,
  owner, vector}` or `{source: none}` **with no vector field at all** — so
  `weight_source` cannot acquire a `default` member and "owner_elicited with a
  null vector" is unrepresentable (DR-017; ui ambiguity 8).
- **Verdict fields are two independent axes** (AC-66): `verdict_state` and
  `confidence_band`, with an abstention carried in its own field, never as a
  band and never as a mid-range number (spec §12.3 S-14).
- **The band names its way-of-knowing ceiling (AC-24, charter VR-2).** The
  Answer carries `band_ceiling { label, basis }`, where `basis` is the
  `way_of_knowing` distribution over the answer's load-bearing nodes and the Q51
  downgrade state. This is M4's surviving carrier once `OD-12` removed the
  numeric τ ceiling: without it, an answer whose load-bearing nodes are all
  `REASONING` passes Q51's downgrade (served as hypothesis-plus-research-plan)
  and can still read at the top band from the register cut-points alone —
  exactly the outcome `OD-12` removed the τ ceiling *on the understanding that
  the band rule would carry*. **The label's content — what it must say, and
  whether any register cut applies — is architecture-raised question AQ-1
  (§6.10); the carrier ships either way, and prints its register row per
  AC-75.**
- **Edges carry a polymorphic target** — `{target_kind: NODE, target_node_id}`
  or `{target_kind: EDGE, target_edge_id}` (AC-19). The UI contract's node-to-node
  Edge shape is illustrative and is refined here, as ui ambiguity 2 requires.

### 5.5 Events

`GET /v1/runs/{id}/events` (SSE) over the same front door (AC-60). Six declared
families (run lifecycle, node lifecycle, graph, serve-composition, honesty,
ledger — ui §1.3). Laws:

- **E1**: the event vocabulary lives in `packages/contract` with a declared
  consumer per name, checked by `tools/orphan-audit` (AC-61/AC-77).
- **E2**: one name per meaning, declared once — V2's
  `synthesis_completed`/`synthesis_complete` mismatch is a contract-level test,
  not a runtime hope (ui §1.4).
- **Payload grade**: events carry **projection-grade payloads or bare signals
  only**; no event carries bundle-grade material, because AC-56's authorization
  gate cannot be re-evaluated per frame on a long-lived subscription. The
  "fact bundle frozen" event carries the bundle's **identity and hash**, not its
  contents (ui ambiguity 6).
- **E4, precisely.** AC-64 binds *"every read of, **or subscription to**, an
  answer that occurs after a wake-up"*. So: E4's **correctness** obligation is
  discharged on the read path — every answer read attaches the answer's current
  staleness state, computed at read time (Seam D) — **and the stream MUST
  additionally carry the `staleness trigger fired` honesty event for every
  subscribed answer**, with a declared consumer per E1. Without that event a
  client holding an open subscription and issuing no further reads — the
  tab-left-open case ui cell 4(a) analyses explicitly — is a **conforming client
  that is never told the answer went STALE**, breaching DR-015's "never
  silently" on a path this plan itself ships. With both halves, push, pull and
  pull+ping all conform, which is what delegated cell 4(a) needs (ui §4 row 4).

### 5.6 Errors, limits, auth

- **Typed error taxonomy** in `packages/contract`: a closed error-code enum with
  a stable machine-readable body, including rate limiting (429) and **typed auth
  failure** distinguished from typed authorization-scope failure (ui §5 W4).
  The *ruled* half of L8 is run-degradation typing; transport-error typing is a
  CANDIDATE clause and is proposed here, not inherited as law (ui §7 item 5).
- **Never string-sniffed.** V2's `looksProviderOrTokenRequired` /
  `isMissingJudgeOutputReason` and the 401/403 substring match die with the
  death list (ui §3.2); the interface never parses prose to learn a fact
  (AC-63).
- **Authorization** per §5.2's three tiers, evaluated against `GET /v1/session`'s
  principal (AC-57).

### 5.7 Contract governance

- **W1 (freeze the resource vocabulary + encoding) is this section's output**;
  the C4 `04-api-contract.md` is where it is frozen.
- **The field inventory is machine-checkable in both directions** (AC-61):
  served fields with no consumer and consumers with no served field both fail
  the audit; `tools/orphan-audit` ends in a check that fails the build on an
  orphan (ui §5 W19).
- **Additive-only within `/v1`**; a shape change that is not additive is a new
  version, because charter A5.5 says research findings land as data, **not** as
  changes to the serve contract (AC-84).

---
## 6. Open-item dispositions

Every GENUINELY-UNANSWERED item and every ambiguity in the three digests carries
**exactly one** disposition:

- **RESOLVED-BY-PACK** — the pack answers it; the citation is given.
- **DESIGN-NEUTRALIZED** — the architecture is shaped so any plausible V answer
  fits; how is stated.
- **V-QUESTION** — queued for V as the smallest possible question, with this
  seat's recommendation **explicitly labelled SEAT-PROPOSAL** and the
  consequence of the alternative. **Never ruled here.** Every V-QUESTION also
  carries a **blocks-from-slice-Sn** field (collected in §6.8), because "is it
  launch-blocking?" was the wrong granularity: a question can be harmless at
  launch and fatal at slice 3.

DEFERRED-BY-DESIGN items are listed once in §6.7, confirming the architecture
leaves each deferral open. Three further disposition sets sit alongside the
digests' 56: **§6.6 UI-13** (a cross-artifact contradiction this seat
identified), **§6.9** (the quality charter's own §9 contradiction list, which the
first round did not reach), and **§6.10** (questions this seat raises rather than
answers). Counts for all four sets are in §6.8.

### 6.1 Requirements-spec §7.2 — GENUINELY-UNANSWERED (OQ-G1…G10)

| ID | Disposition | Basis |
|---|---|---|
| **OQ-G1** `stage11Rollout` reads two ways | **RESOLVED-BY-PACK** | Spec §23.D `OD-S-01` is **RATIFIED (DR-061), adopted: phased**, and §25.1 records the withdrawal; §4 row 16's "OPEN — no DR" is stale body text and the DR wins (FLAG-3). Architecture builds the phased rollout: Q59/Q60/Q62's recording limbs day one, outcome ingestion in WAIT, no operational calibration claim, capability cells `basis: NONE` until settled outcomes exist (spec §16.4 K-21). |
| **OQ-G2** per-row correctness-vs-enrichment classification never supplied | **V-QUESTION** · blocks from **S9** | **Question:** *Who supplies the per-row correctness/enrichment classification the budget subsystem reads, and when — V at flag ratification, or the architecture mission?* **Recommendation:** model the classification as a **per-row contract field whose unset value is a distinct typed `UNCLASSIFIED` state** — aligned with OQ-G9's `POLICY_BLOCKED` idiom rather than a silent default. `UNCLASSIFIED` (a) is **treated as correctness at runtime**, so no row is ever silently skipped, and (b) is **reported by the acceptance bundle as an outstanding item**, so the gap is loud rather than absorbed. V fills the enrichment side at DR-023. **Consequence:** until at least one row is classified enrichment, the envelope's enrichment-skip terminal cannot fire and **charter §5.2 row 6's fixture is unconstructible — a BLOCKING row**, so this is recorded as an explicit launch-readiness dependency in `07-build-order.md`, not left as a discovered surprise. A silent `CORRECTNESS` default would have disabled a blocking gate while looking healthy. (spec §21.2 N-14, N-11; `OD-A-04`; charter §5.2 row 6, A4.4) |
| **OQ-G3** the declared hard bundle budget has no value and no derivation rule | **V-QUESTION** · blocks from **S5** | **Question:** *What declares the hard composition-bundle budget — a register row V sets, or a derivation from the DR-052 cost envelope?* **Recommendation:** an **independent register row** in a declared unit, not a sub-budget of the envelope, because the two gates carry different marks (`DEFECT` vs `ENVELOPE_EXHAUSTED`) and different owners. **Consequence:** if it is a sub-budget, one answer can hit both terminals and the reader cannot tell a truncated answer from an unconformable one. Inventing a number here is barred by DR-039. (spec §12.1b S-9c, DR-058) |
| **OQ-G4** `verdict state` is not a closed enum | **RESOLVED-BY-PACK** | **DR-066(3)** ratifies the GLOSSARY's canonical verdict model — verdict state is **SUPPORTED / CONTESTED / UNSUPPORTED**; charter VR-2 says the same ("three served states"); an abstention is neither, and a terminal route lives in Home 3 (spec §12.3). Spec §12.8's "candidate members include…" is stale body text; the DR wins (FLAG-2). The enum is closed at three, satisfying S-13. |
| **OQ-G5** authorization model for the inspection/replay endpoint | **RESOLVED-BY-PACK** | **DR-066(1)**: asker-scoped — the asker may replay their own answer's full record; authorization = their session's scope; internal prompt material stays operator-only. Built as §5.2's three tiers on one handle. The UI contract's C14 was not back-annotated (FLAG-3). |
| **OQ-G6** Q34's model limb — required or permitted? | **RESOLVED-BY-PACK** | Spec §23.A `OD-A-06` is **RATIFIED (DR-061)**, adopted: **a model limb for item identity and side only**. Q34's verdict limb stays MACHINE (spec §3.13; A-3a's "no fairness scalar"); the model limb is a bounded, ledgered call confined to resolving `subject_item_id` and `stance_at_action`, and its output is an input to the machine diff, never the verdict. |
| **OQ-G7** body text marks six ratified rows as open | **RESOLVED-BY-PACK** | Spec §23 is ratified wholesale by **DR-061**; the DR wins over stale prose (FLAG-3). Architecture builds the adopted options: `OD-S-02` (drop Q43's `alternate_method_required`), `OD-S-01` (phased Stage-11), `OD-A-08` (disparity flag with its limitation printed, never a bias verdict alone), `OD-M-23` (count distinct question-clusters), `OD-M-17` (wide match + deep payload prohibited), `OD-C-02` (the three-part fire bar, = charter VR-1). |
| **OQ-G8** `(candidate)` survives on a RULED requirement | **RESOLVED-BY-PACK** | A-7 is `RULED(DR-045 + DR-061 · OD-A-05)` and spec §26.2's lint reports **0 CANDIDATE** clauses; §12.8's parenthetical is stale. **`UNINSTRUMENTED` caps the confidence band** (never the verdict state, per S-27) and names its remediation targets as the lift condition. |
| **OQ-G9** the activation table is a normative dependency absent from the pack | **V-QUESTION** · blocks from **S6** | **Question:** *Is the activation table's content to be re-derived and ratified inside V3's repo as a row-contract artifact, or does an authoritative copy exist to be imported?* **Recommendation:** architecture models activation as a first-class per-row contract field (`ACTIVE / INACTIVE / WAIT / POLICY_BLOCKED` with a written predicate), populates it from spec §3's row contracts, and files any row whose predicate spec §3 only summarises as **`POLICY_BLOCKED`** — which spec §1 forbids filing as INACTIVE, so the gap is loud and never a silent skip. **Consequence:** without the table, those rows cannot fire; with the fail-closed default, the run is honest about why. The C4 row-contract document is where each predicate lands. (spec §1, §3, §24) |
| **OQ-G10** the eight typed citation failure routes are never enumerated | **V-QUESTION** · blocks from **S6** | **Question:** *Who names the eight typed citation failure routes, and where does that enum live given S-13 says spec §12.3's table is the only place a typed state may be minted?* **Recommendation:** architecture proposes the eight in the C4 data-model document as a closed evidence-subsystem enum (not condition marks) with loud failure and no generic "other"; V ratifies, and any member that surfaces to the reader is placed in spec §12.3 by amendment. **Consequence:** DR-020 knob 7 requires the eight "from day one", so an unnamed enum blocks the evidence subsystem; minting them unilaterally risks an unplaced typed state, which S-13 calls a specification defect. |

### 6.2 Requirements-spec §8 — ambiguities (AM-1…AM-14)

| ID | Disposition | Basis |
|---|---|---|
| **AM-1** "load-bearing" undefined | **V-QUESTION** · blocks from **S5 for conformance *sampling*; S0 for anything narrower than exhaustive** | The charter defines exactly one sense — *"a **load-bearing node** … drop it and the verdict or its band changes. Which nodes those are is **computed, not asserted** (removal-based leverage and fragility, Q46/Q49)"* (charter §1) — and that sense is a **fixed input, not in question**. AM-1's remaining uses are not nodes: *sentences* (DR-060a conformance sampling), *claims* (memory locator re-verification, M-16), *unknowns* (the ignorance ledger), *presuppositions* (Q3), *sources* (Q35's `source_is_load_bearing`) and *composition priority* (DR-058). **Question:** *Do the non-node uses of "load-bearing" project from the charter's node definition, and if so by what rule?* **Recommendation (SEAT-PROPOSAL, not adopted here):** a sentence is load-bearing iff it asserts a fact drawn from a load-bearing node or states a served number; a claim iff its node is; an unknown iff removing it would change the verdict or band. **Consequence:** these projections decide conformance-judging coverage and serving behaviour, and AC-85 only says a rule lives in one place — it does not supply the rule, so adopting mine would be inventing one without facts behind it (DR-039). **Until ruled, C4 may define carriers and provenance for the non-node senses only — not conformance-sampling or serving behaviour derived from them.** **How S0 proceeds without the answer:** DR-060(a) scopes the conformance call by load-bearingness *for sampling*, and charter A2.5 is explicit that the protected core *"forbids skipping the conformance **role**, it never mandates exhaustive sampling"* — so **judging every segment is always legal**. S0 therefore runs conformance **exhaustively**, with no sampling and no consumption of `run.stranger_sample_rate` for coverage, and sampling arrives at S5 with this question's answer. Without that written down, a builder either invents a load-bearing-sentence rule to get S0 moving (a DR-039 violation, exactly what this disposition exists to prevent) or discovers at S0 that an S5-labelled question is really an S0 entry criterion. |
| **AM-2** flip-sensitivity is a Stage-9 quantity read by a Stage-8 rule | **V-QUESTION** · blocks from **S8** | One fact narrows it and does not close it: DR-019 knob 3 requires blind verification **always** for STANDARD and HIGH-STAKES and for contested verdicts, so the flip-sensitive trigger only decides coverage on **CASUAL** runs — but on those runs it decides whether blind verification executes at all, which changes calls and can change the served result. **Question:** *On a casual run, how does the Stage-8 blind-verification rule read a Stage-9 quantity — a CROSS-entry proxy, a re-entry after COMPOSE, or verify-all?* **Recommendation (SEAT-PROPOSAL, not adopted here):** a CROSS-entry leverage snapshot computed from the then-current graph — the propagation core is pure and cheap (AC-09), so removal-based leverage is computable at any stage boundary with no model call — recorded as the coverage trigger's basis, with the COMPOSE-time recomputation authoritative. **Consequence:** the three options produce different call counts and potentially different served answers, and **no DR authorizes a proxy**, so selecting one here would be an architecture seat ruling a coverage question. **The C4 row contract must not select a proxy silently**; until ruled it records the trigger as unresolved on casual runs and the shape supports all three. |
| **AM-3** three closed sets of six never reconciled; `design` appears nowhere | **V-QUESTION** · blocks from **S5** | **Question:** *Is the abstention matrix's question-class axis the same closed six as Q8's question types, and what is `design` in Q50's trigger?* **Recommendation:** model three declared vocabularies plus **two explicit mapping tables as register rows** — `Q8 type → abstention class` and `(Q7 act, Q8 type) → scorecard task class` — because both the abstention cell (DR-012) and the scorecard cell (K-3) need a single resolved key and neither can be derived. **Consequence:** without the mappings, every served answer's price cell and every scorecard cell are keyed on an undefined axis; inventing the mapping is barred by DR-039. (spec §3.2, §21 N-3, §16.2 K-3, §17.1 M-1, §3.9 Q50) |
| **AM-4** `UNASSIGNED` is both a legal member and an automatic `UNINSTRUMENTED` trigger; the diff population is unscoped | **V-QUESTION** · blocks from **S8** | **Question:** *Over which action population does the Q34 symmetry diff run — only actions carrying a `subject_item_id`, or every recorded action?* **Recommendation:** scope the diff to the **item-scoped members** of the closed action vocabulary; pre-item actions (Q15 query runs, Q17 absence rows) are recorded with a null subject **by type**, excluded from the diff population by kind rather than by value, so `UNASSIGNED` stays a real signal. **Consequence:** on the literal reading nearly every run is `UNINSTRUMENTED`, the fairness claim is permanently withheld, and A-12's deliberate-asymmetry fixture — a launch gate — cannot pass. (spec §8.1 A-1, A-2, A-6, A-12) |
| **AM-5** who supplies the risk tier | **V-QUESTION** · blocks from **S9** | What the pack settles is *presence*, not *authority*: ui §1.2 says the Ask carries a risk tier and §2 surface 3 calls it a required input — **neither assigns ownership**, and DR-021 knob 11 enumerates the asker's per-run properties (decision/action owner, caller scope, `as_of`) **without** naming the tier. **Question:** *Who sets the risk tier — the asker, deployment policy, or derivation from the question?* **Recommendation (SEAT-PROPOSAL, not adopted here):** asker-declared with a deployment policy able to raise but never lower it. **Consequence:** the tier drives the abstention price cell (DR-011/DR-012), the cost envelope (DR-052), CROSS blind-verification coverage (DR-019 knob 3) and the DR-055 launch gate — four ruled behaviours keyed on an unowned input. **Design that fits every answer:** the field is non-nullable on `POST /v1/asks` and carries **`tier_source ∈ {ASKER, DEPLOYMENT_POLICY, DERIVED}`** with its provenance recorded, so whichever way V rules, the supplier is modelled and printed rather than assumed (§5.3). |
| **AM-6** no stated mapping from the 22 marks to the 9 surfaces | **DESIGN-NEUTRALIZED** | The wire carries one uniform `condition_marks[]` projection with `{mark, scope, subject, reason, lift_path?}` on Answer and Node (ui §1.2 Condition marks), so **every member has a rendering** regardless of which surface it visually lands on. Which strip or badge a mark appears in is delegated presentation (DR-064, cells 8(a)/8(c)); no data-model or API element depends on the mark→surface map, so any V/mockup answer fits. |
| **AM-7** the fact bundle has no declared schema or version | **DESIGN-NEUTRALIZED** | Architecture persists the bundle as a **versioned, content-hashed artifact** keyed to `(answer_id, answer_version)` (§4.4), because DR-034's "frozen records" plus DR-060(b)'s "the conformance verdict is an input artifact" already entail it. The bundle's *contents* stay defined by the pack (S-1's exclusion rule plus every requirement that names a field); its *schema and version* are architecture's to declare in C4's api-contract, which is exactly what the digest observes is missing. Any V clarification lands as fields, not as a change of kind. |
| **AM-8** Q46's halt implies re-entrant stage execution nothing models | **DESIGN-NEUTRALIZED** | Stage work is modelled as **idempotent scoped work items** — a `(row, node-set)` pair — rather than monolithic stage passes. A halt enqueues a scoped re-execution bounded at K=1 per parent per run (DR-050), recorded in the ledger; DR-015's propagate ("re-judge only the affected nodes") and Q29's regeneration return use the same unit. Run-scoped frozen values (stranger sample rate, envelope basis) are pinned at run start (AC-50), so re-entry cannot move them. Any V ruling on granularity — full stage, single row, subgraph — is expressible as the node-set argument. |
| **AM-9** the two-phase dual act needs a phase marker nothing names | **DESIGN-NEUTRALIZED** | Phase is **run state carried as an append-only event**, not a mutable column: `run_progress_event {kind: PHASE, value ∈ {EMPIRICAL, VALUE}, at_seq}` (§4.1a), with the current phase **derived from the latest `PHASE` event**, a **mandatory initial `PHASE = EMPIRICAL` event written in the same transaction as the `run` frozen head**, and the **monotone transition enforced as a write-time check against that latest event**. "Phase 1 has settled" is a recorded ledger event naming the settled graph version, and `phase_settled_at_seq` is that event's sequence. The value overlay attaches to that settled graph without mutating it, and AC-30's byte-identity recomputation makes the non-mutation checkable. Any V preference for where the marker lives (run, graph, node) is a projection of the same recorded transition. (DR-053; spec §5.5 F-11…F-13) |
| **AM-10** WAIT is durable with no stated wake mechanism inside a run | **V-QUESTION** · blocks from **S7** | Suspended computation, queued job and re-evaluated predicate are **behaviourally distinct** — most sharply in whether a run may terminate with rows still in WAIT — and no founding clause picks one. **Question:** *Is a WAIT row a suspended computation, a queued job, or a re-evaluated predicate — and may a run reach a terminal state with rows still in WAIT?* **Recommendation (SEAT-PROPOSAL, not adopted here):** a re-evaluated predicate, re-tested whenever a recorded event names one of its inputs, with terminal-with-WAIT permitted — Q61 *"may sit in WAIT indefinitely without that being a defect"* (spec §3.11) is at least one row where it must be. **Consequence:** the choice decides run termination semantics and therefore what a completed run means. **Carrier that fits all three:** `run_row_activation` (§4.1a) is an **immutable row** holding `{predicate_ref}`, with `{state, predicate_inputs, skip_evidence}` on the append-only **`run_row_activation_event`** stream, the current state **derived from the latest event** (mandatory initial event at run creation), and `last_evaluated_at_seq` **derived** as that latest event's `at_seq` — a state machine that can implement any of the three; only the runner's evaluation policy differs. The wake and terminality decision is recorded in the C4 row-contract document **after** V rules, not before. `POLICY_BLOCKED` is never filed as INACTIVE regardless (spec §1). |
| **AM-11** purity (H3) versus a Postgres-resident graph | **DESIGN-NEUTRALIZED** | Seam A (§3.2): **materialise → compute → persist**. `graph` builds an immutable *evaluation snapshot*; `propagation` is pure over it; `ledger` persists the result plus the snapshot's fingerprint and its **recorded arrow order**, which is what makes the IEEE-754 left fold reproducible (AC-08). **The ordering rule itself is stated once, in Seam A, and is not restated here.** |
| **AM-12** the memory store's identity dimension is unnamed | **V-QUESTION** · blocks from **S0** | **Question:** *What is an "asker" for the per-asker memory partition and for DR-066's session scope — an authenticated principal, a deployment-scoped caller identity, or a session?* **Recommendation:** a first-class `asker_id` (stable principal) distinct from `session_id`, with `caller_scope` a separate declared field on the Ask; DR-066's authorization resolves session → asker → answer ownership. **Consequence:** the `EXACT_QUESTION` tier compares canonical question text **and caller scope**; if caller scope and asker identity are conflated, either the tier silently becomes per-asker or a question-level pull crosses an asker boundary — a confidentiality failure, not a modelling nicety. (spec §23.B `OD-M-20`, §17.2 M-4, DR-021 knob 11) |
| **AM-13** "one bounded model call" is never given a bound | **DESIGN-NEUTRALIZED** | "Bounded" is modelled as a typed **call bound** on the provider interface — `{max_attempts, token_ceiling, deadline}` — attached per call site and supplied by register rows (values V's at DR-023, AC-74). Every attempt, including schema-failure retries, is a ledger row, and a schema-failed judgement is a recorded silent-drop event (spec §16.1 K-1), so no bound is invisible. Any V answer sets values in an existing shape. |
| **AM-14** "measured behavioural difference" needs a metric the spec does not locate | **V-QUESTION** · blocks from **S7** | **Question:** *What measured quantity licenses "measured behavioural difference" for rival-carver selection, given Tier-1's process facts contain no pairwise difference metric?* **Recommendation:** until a metric exists with facts behind it, rival-carver selection runs on the **maker-diversity floor alone** (DR-013) and the "measured difference" criterion is **recorded as unavailable**, not approximated. **Consequence:** approximating it mints a measurement (DR-039); implementing a selection rule keyed on a metric nobody produces ships a branch that cannot fire (charter G3/G4). The paired half — the provenance key width — is **already ruled** at DR-062 `OD-09` and needs no question. (spec §9.4 D-10, §16.1 K-1, §7.4 E-11) |

---
### 6.3 Carryover-manifest §7.2 — GENUINELY-UNANSWERED (U-1…U-5)

| ID | Disposition | Basis |
|---|---|---|
| **U-1** `OD-11`'s layer-2 layering trigger has no owner | **V-QUESTION** · blocks from **S5** | **Question:** *What condition activates `OD-11`'s layer-2 per-side provenance detail?* (DR-066(2) says successors with no named condition **require a fresh ruling**.) **Recommendation:** make projection depth a **register-gated branch** — layer 1 by default, layer 2 behind a register row V flips — so the successor is reachable by a configuration a production caller can produce (charter VR-4 class 1, G4) and nothing ships dark. **Consequence:** without a trigger the successor cannot be scheduled at all; with a register row it is testable in both states before V decides. |
| **U-2** `OD-20`'s risk-tiering trigger and the tier→claim-type gating map | **V-QUESTION** · blocks from **S6** | **Question:** *What is the tier × claim-type eligibility map for the evidence gate, and what activates risk-tiering?* **Recommendation:** ship the gate **tier-invariant** at first, with eligibility = the exact complement of §5.2(f)'s evidence-free list (manifest §9.2f), and the tiering map as an **empty register table** V fills; the gate runs in **shadow mode**, publishing what it would have suppressed beside the unsuppressed band, so its behaviour is observable before it binds. **Consequence:** inventing per-cell eligibility is barred by DR-039; leaving the gate out entirely loses the causal/comparative/predictive coverage `OD-20` exists to add. |
| **U-3** the acceptance bar for DR-032's "must demonstrably fire" is routed two ways | **RESOLVED-BY-PACK** | The two routes are one route. Charter §8 **VR-1 (`OD-C-02`) is RATIFIED by DR-063** and states the three-part bar — shown-to-fire-both-ways as the adoption bar, fires-at-least-once as the launch-day minimum, rate-consistency as a standing SETTLE-stage monitor — and the charter **is** the acceptance artifact whose §5.2 fixture table is BLOCKING (VR-5). The manifest's "charter acceptance item" and VR-1 name the same obligation. Architecture owes the labelled *should-not-fire* case as part of the fixture (charter VR-1 recorded cost). |
| **U-4** what judge weight actually multiplies | **V-QUESTION** · blocks from **S4** | **Question:** *In the reduction from N judgements to one τ, what does a judge's earned weight multiply — or is weight consumed only by routing and the dispersion surfaces?* **Recommendation:** consume weight in the **selection** of the reduced τ under a declared, recorded rule rather than by averaging (DR-032 forbids replacing the score object with a weighted mean, and §5.2h forbids averaging dispersion away), with dispersion measured and served separately — but the rule itself must be V's, because any arithmetic here is measurement-shaped (DR-039). **Consequence:** if weight touches no served arithmetic, P-D5's "at least one judge's weight moves" has nothing to assert against and D5 is only half repaired — the exact shape charter clause 4 indicts. **Highest-priority question in this set.** |
| **U-5** whether judge weight is frozen into the replay record | **RESOLVED-BY-PACK (by entailment)** | DR-034 plus DR-060(b) require every served number to recompute **byte-identically** from frozen records with no model in the path. An always-evolving weight that moved a served number and is not frozen makes that impossible. Therefore **any input that moved a served number — including the judge weight in force and its version — is a frozen replay input**, pinned on the reduced judgement and on the number's provenance (§4.3). No new ruling is needed; the replay law already decides it. |

### 6.4 Carryover-manifest §8 — ambiguities (A-1…A-11)

| ID | Disposition | Basis |
|---|---|---|
| **A-1** the undercut carrier: schema ruled, arithmetic unruled | **V-QUESTION** · blocks from **S2** | The **carrier** is settled — DR-066(2) rules the undercut targets the support **edge**, and the manifest §6.3 text it contradicts loses (AC-19); §4.2's polymorphic-target edge table ships regardless. What is unruled is what an edge-targeting attack **does to the arithmetic**. **Question (two halves, both needed for a buildable answer):** *(i) Does an undercut reduce the transmitted contribution of the support edge it targets, and by what rule? (ii) If so, is that reduction a **third ruled producer of arrow strength under `DR-062 OD-06`** — which today closes the producer set at the evidence verifier's grounded score and provenance cluster collapse — or is it carried outside `edge.strength` altogether?* Half (ii) is not optional: a "yes" to (i) alone leaves S2's entry criterion satisfied and the edge table still unfreezable, because `OD-06`'s closure would still forbid writing the column. The `UNDERCUT_TRANSMISSION` member is declared but **not writable until V grants the amendment** (§4.2(4)). **Recommendation:** model it as a reduction of the targeted edge's transmitted contribution inside the pure core, recorded per edge — the graph stays node-shaped for evaluation, so σ and the aggregation keep their published definitions (manifest §4.2a–c) and the fingerprint, topological order and cycle law are unchanged. **Consequence of the alternatives:** (a) treating it as a plain attack on the target node is forbidden by DR-066; (b) leaving it visible-but-inert, on `OD-04`'s typed-unknown-magnitude pattern, is the DR-039-safe option but ships a first-class relation that changes nothing — charter clause 4's dead-weight shape; (c) carrying the reduction as a per-edge quantity on `propagation_run` rather than as an arrow strength **needs no `OD-06` amendment at all**, which may make it the answer that reopens least. This moves served numbers, so it is V's. |
| **A-2** arrow strength is typed `[0,1]` but must sometimes be "unknown" | **DESIGN-NEUTRALIZED** | `strength` is **nullable with a companion `magnitude_status ∈ {MEASURED, UNKNOWN}`** and a `CHECK` binding the two (§4.2). The core treats `UNKNOWN` as contributing nothing (`OD-04`). The integrity rule applies to the identity **together with** its magnitude, so two rows disagreeing on either is the loud typed error the manifest requires. `OD-04`'s pre-approved-contingent successor — a verifier-vouched magnitude — lands as a value in the same column with no schema change, which is what DR-066(2) requires of it. |
| **A-3** two different lifting predicates for the same operation | **V-QUESTION** · blocks from **S3** | **Question:** *When a perspective node's children lift to "the nearest real claim above" and that claim is itself unjudged, does `OD-02`'s nearest-**judged**-ancestor rule then apply, and do folder lifts emit `OD-02`'s both-ends markers?* **Recommendation:** compose them in that order — folder-lifting first (a structural rule about grouping devices), then `OD-02`'s judged-ancestor lifting (an arithmetic rule about unjudged nodes) — with `OD-02`'s markers emitted at both ends in **both** cases, since only that order terminates. **Consequence:** D2's own evidence shows this exact re-attachment rule moving a root from 0.96875 to 0.5 (manifest §10.2), so the composition is verdict-affecting and cannot be left to implementer choice. |
| **A-4** the cluster key's fields are evidence-item fields; the partition is over sibling claim nodes; and does collapse apply to attacks? | **V-QUESTION** · blocks from **S3** | **Question:** *Does provenance-cluster collapse apply to attack arrows as well as support, and how does a non-evidence sibling claim acquire a cluster key?* **Recommendation:** apply collapse **within one parent and one polarity** on both polarities (`OD-08`'s "within one polarity" caveat implies both exist), and derive a claim node's key from the provenance of the evidence and producing-run/model-family behind it, with a node carrying no resolvable key **clustering alone** — never merged with another. **Consequence:** clustering attacks changes served numbers; not clustering them leaves D3's measured inflation (0.40 → 0.784) reachable on the attack side. The key's *fields* are already ruled at `OD-09` and are not reopened. |
| **A-5** where cluster collapse acts, and therefore what replay and the fingerprint see | **DESIGN-NEUTRALIZED** | Architecture makes collapse a **compute-time gate inside the pure core, recorded on the propagation run**: stored arrow strengths remain the outputs of their ruled producers (AC-27), and the collapse emits a per-cluster record — `{cluster_id, key, absorbed_edge_ids, surviving_member}` — which is itself a frozen replay input and an input to the graph fingerprint. Both readings' observable requirements then hold: P-D3 asserts against the recorded collapse, the debug facet can list arrows with absorbed markers, and the key is printed wherever a cluster changed a number (manifest §4.2g). Any V clarification changes where the record is written, not whether it exists. |
| **A-6** the judge-weight consumption path is required and forbidden in its only described form | **V-QUESTION** · blocks from **S4** | **Same question as U-4, asked once.** Listed here so the manifest's item carries its own disposition; the question, recommendation and consequence are U-4's. |
| **A-7** `OD-20`'s "exact complement" is not well-defined over `OD-16`'s type set | **V-QUESTION** · blocks from **S6** | **Question:** *Which side of the evidence-gate complement do the claim types `mixed` and `unknown` fall on, and is `value-laden` a claim type, a cross-cutting flag, or a member yet to be added?* **Recommendation:** `unknown` and `mixed` are **evidence-gated** (fail-closed: gate unless proven evidence-free), and `value-laden` is a **cross-cutting flag** rather than a type, because `OD-16`'s vocabulary is closed and adding a member is a type-vocabulary revision — precisely `OD-17`'s named condition. **Consequence:** failing open on `unknown` lets an ungated claim serve as if verified, which is the H5 floor breached. |
| **A-8** DR-040's bounded declaration call may be unreachable under `OD-22`'s chain | **V-QUESTION** · blocks from **S3** | **Question:** *Is the deployment-level operator declaration optional and unset by default, so an undeclared parent can exist and DR-040's withheld-parent path can fire?* **Recommendation:** **yes — optional and unset by default**, so the chain reads parent → run → deployment → (still undeclared ⇒ one bounded declaration call ⇒ still undeclared ⇒ withhold and serve components), because P-D2 explicitly tests that an undeclared parent takes DR-040's path, and charter G4 forbids a configuration branch no production caller can produce. **Consequence:** a deployment default that always exists makes both the declaration call and the withheld-parent terminal structurally unreachable — the exact D5 shape (a branch that can never execute). |
| **A-9** `pending` nodes enter the scored graph but are never defined | **V-QUESTION** · blocks from **S3** | The manifest rules only that every non-`stale` node enters the scored graph (`OD-18`); it does not say what a `pending` node *does* there, and both open sub-questions are **arithmetic-visible**. **Question:** *Does a `pending` node count as an unjudged interior node for `OD-02`'s transparency-and-markers rule, and are placeholder arrows live arrow endpoints?* **Recommendation (SEAT-PROPOSAL, not adopted here):** yes to both — a pending node has no judgement, so `OD-02` governs it (emits no arrow, children lift to the nearest judged ancestor, markers at both ends), and its placeholder arrows are real rows with real endpoints, so manifest §4.4's "endpoint absent from the node set" error is about foreign or deleted endpoints only. **Consequence:** under the recommendation a mid-flight run emits skip markers on every in-progress branch — visible machinery the reader may not want — and the chosen lifting rule *is* the arithmetic, so the earlier claim that a clarification would not affect numbers was wrong (D2's evidence: the same re-attachment rule moves a root from 0.96875 to 0.5). **C4 must not freeze either behaviour before V answers.** Serving a placeholder as a claim stays forbidden regardless (manifest §6.2 item 10, AC-86). |
| **A-10** the manifest's evidence chain is unresolvable in this repository | **RESOLVED-BY-PACK** | Manifest §14 makes the manifest itself the clean-room interface: a fact not in it is obtained by **amending the manifest through review**, never by reading V2 (AC-81). The unresolvable `../research/…`, `../reviews/…` and `../wayfinder/…` paths are therefore not an architecture input. The two literature vectors and P-D3's collapse figures are taken from the manifest text, which §14 consequence 2 exempts. |
| **A-11** labelling residues ("no M4"; stale traceability) | **RESOLVED-BY-PACK (with FLAG-1)** | Spec §18 O-4 names **M4** explicitly and routes its content to manifest §4.2(h), so M4 is the spec's label for the manifest's way-of-knowing clause — the digest's "any M4 reference is an invention" is wrong against the founding doc, and the founding doc wins. The substantive conflict inside M4 (ceiling on the base score vs `OD-12`'s "no numeric ceiling on τ") is resolved by the later DR: **no numeric τ ceiling**; the obligation is Q51's blocking gates plus the serving-band rule (AC-24). The manifest's traceability gap for DR-064…DR-067 is resolved the same way — the ledger is the authority trail (spec §2 item 1). |

### 6.5 UI boundary contract §6.2 — recorded open findings (C2, C5, C6, C8)

*(C10 and C14 are recorded open in the contract body but closed by DR-066(3) and
DR-066(1); they are dispositioned at OQ-G4/OQ-G5 and ui ambiguity 1, and are not
re-counted here.)*

| ID | Disposition | Basis |
|---|---|---|
| **C2** ticket 16's guard + the F6 exhaustive per-output outcome vocabulary vs DR-048's wholesale flex | **RESOLVED-BY-PACK** | **DR-048** is the later FINAL ruling and explicitly supersedes DR-002's adapter-implied caution; a ticket's guard text is not a DR, and the ledger is the authority (spec §2 item 1). Architecture follows DR-048: all nine honesty surfaces flex, the data layer is rebuilt wholesale with no adapter, and **no per-row `AS_IS \| ADAPT \| FLEX \| DROP \| NOT_UI_EXPOSED` ledger is owed**. |
| **C5** "components and UX are kept" vs nine surfaces the components cannot render | **V-QUESTION** · blocks from **S14** | **Question:** *Does "kept component" mean the component's source is preserved, or that the page, canvas, drawer, badges and navigation a person moves through are preserved while the component is rebuilt inside?* **Recommendation:** the latter — DR-048's own re-scoping is *"keep the surface, rebuild the plumbing"*, and the flex rows already require new slots inside existing components (a long-form text slot on the canvas card, an edge list or drawn arrows under a node). **Consequence:** on the source-preserving reading, W8 (node envelope) and W10 (edges, XL) cannot be built at all, because `NodeScores` is a closed 8-key float record pinned on both sides and the tree carries no edges. Under the recommended reading, each altered component is approved at its mockup review (DR-064). |
| **C6** the kept interface satisfies neither push nor pull | **DESIGN-NEUTRALIZED** | **Two limbs, matching §5.5.** (i) **Correctness is discharged on the read path** (Seam D): every answer read attaches the answer's current staleness state, computed at read time, so the *choice* of transport is not load-bearing for correctness. (ii) **Where a stream exists it must carry the mandatory `staleness trigger fired` event** for every subscribed answer, with a declared consumer per E1 — AC-64 binds *"every read of, **or subscription to**"*, so a client holding an open subscription and issuing no further reads would otherwise never be told (DR-015's "never silently", breached on a path this plan ships). With both limbs, push, pull and pull+ping all conform, which is exactly what delegated cell 4(a) needs. `debateTerminal` dies with the death list regardless (ui §3.2). |
| **C8** `NEXT_PUBLIC_VERDICT_FIRST_UI` — keep, default on, or delete | **V-QUESTION** · blocks from **S14** | DR-023 settles *who ratifies the register* and that V3's set need not reflect V2's; it does **not** settle this row's value or whether the row exists at all, and ui §6 C8 records the disposition as **a V choice**. **Question:** *Does V3 carry a verdict-first presentation flag at all — and if so, what is its default?* **Recommendation (SEAT-PROPOSAL, not adopted here):** carry no such flag; render the verdict banner unconditionally, since flex rows 1 and 4 put content in and beside that banner and a flag that can dark it makes two honesty surfaces conditional. **Consequence:** if the flag exists and defaults off, the verdict banner "may be dark in the current deployment" (ui §6 C8) and surfaces 1 and 4 lose their landing place; if it exists and defaults on, it is a G4 subject needing both branches exercised. **Design that fits either answer:** every honesty surface renders independently of any presentation flag, and **no such flag ships until V rules** — so the architecture is not waiting on the answer, only the interface's banner treatment is. **§6.7 no longer carries a second, semantic disposition of this item; the only disposition is here.** |

---
### 6.6 UI boundary contract §7 — ambiguities (UI-1…UI-12)

| ID | Disposition | Basis |
|---|---|---|
| **UI-1** the §6 contradiction table is stale relative to the ledger (C14, C10) | **RESOLVED-BY-PACK** | **DR-066(1)** resolves C14 (asker-scoped, its `resolves` field names UI C14) and **DR-066(3)** resolves C10 (the GLOSSARY's canonical verdict model ratified as written: two axes, DR-014 caps the confidence band, numbers at DR-023). The ledger governs and the contract body was simply not back-annotated (FLAG-3). Architecture designs the handle for an asker audience (§5.2) and the verdict surface for two axes (AC-66). |
| **UI-2** DR-066's undercut carrier has no home in the Edge shape | **RESOLVED-BY-PACK** | DR-066(2) makes the polymorphic target a requirement architecture inherits; the contract's field names are "illustrative, not normative" (ui §1.2), so the node-to-node Edge shape is refined, not contradicted. The wire Edge carries `{target_kind ∈ NODE\|EDGE, target_node_id \| target_edge_id}` (§5.4) and the table carries the matching `CHECK` (§4.2). The *arithmetic* half is A-1's V-QUESTION and does not block the shape. |
| **UI-3** "projection" is defined by contents, never by cardinality or lifecycle | **DESIGN-NEUTRALIZED** | Seam D (§3.2): projections are **computed at read time from stored typed fields** and delivered **inline on the Answer/Node resources in one coherent read**; only facts are frozen (the bundle, the conformance record, the numbers). E4 then holds by construction — a staleness state that changed after serving is visible on the next read without a re-projection step. Whether a mockup later wants them as a composite document or a separate resource is a serialization choice over the same computed values. |
| **UI-4** the Serve record must express three conformance states with no sentence-addressing model | **DESIGN-NEUTRALIZED** | Composed text is served as an **ordered list of typed segments with stable ids** (§4.4), each carrying its load-bearing flag. The conformance record keys `JUDGED / SAMPLED_PASSED / NOT_SAMPLED` per segment id, so DR-060(a)'s three states are expressible and "judged" and "not sampled" are two different served facts. The same segment model orders DR-058's multi-pass composition by load-bearing priority. The Node's restatement `check_status` already attaches to a node and is unaffected. |
| **UI-5** L5 (one transport) and L10 (authorized inspection) are not obviously compatible | **DESIGN-NEUTRALIZED** | One front door, and **SSR is a caller, never a privileged one**: the SSR path forwards the asker's session scope and receives exactly what the browser would (§5.1, §5.2). There is no service-identity read path for asker-scoped material, and operator-scoped material is not reachable from SSR at all. DR-066's session-scoped authorization is therefore evaluated identically on both paths, and the same address never returns different content for the same principal. |
| **UI-6** the event stream's relationship to the projection boundary is unstated | **DESIGN-NEUTRALIZED** | Events carry **projection-grade payloads or bare signals only**; no event carries bundle-grade material, because L10's authorization gate cannot be re-evaluated per frame on a long-lived subscription. The "fact bundle frozen" event carries the bundle's identity and content hash, not its contents (§5.5). E3 is CANDIDATE and non-binding; this design is strictly narrower than E3 would require, so a later ruling can only tighten it. |
| **UI-7** two "budget" concepts share vocabulary and must not share a mechanism | **DESIGN-NEUTRALIZED** | Architecture models them as **two independent gates with two marks and two owners**: DR-052's cost envelope (`WITHIN / ENRICHMENT_SKIPPED / EXHAUSTED`, mark `ENVELOPE_EXHAUSTED`, owned by `budget`) and DR-058's declared hard composition budget (terminal: components-only, mark `DEFECT`, owned by `serve`). Neither reads the other's state. Whether the composition budget is *derived from* the envelope is a register-row question, asked once at **OQ-G3**; the two-gate shape holds under either answer. |
| **UI-8** `weight_vector \| null` vs `weight_source` having no `default` member | **DESIGN-NEUTRALIZED** | The value hinge's weight is a **discriminated union** on the wire and in storage — `{source: owner_elicited\|org_policy, owner, vector}` or `{source: none}` **with no vector field at all** (§5.4). "`owner_elicited` with a null vector" is unrepresentable and `none` cannot smuggle a default, which is what DR-017's removal of the `default` member is protecting. |
| **UI-9** row 8's "travels in two places" duplicates state with no reconciliation rule | **DESIGN-NEUTRALIZED** | **Corrected at rework round 1:** the earlier claim that "no reconciliation rule is needed" did not follow from the shape — an answer-scoped row carries one `subject_ref` (the answer) and no affected-node set, so "filtered by subject" would yield the **empty set for every node** and honesty surface 8 would be served on the answer and absent on exactly the nodes it describes. The correct and weaker claim, which the shape now carries: **the affected set is stored once and projected.** **`condition_mark_node` is the single authoritative store of the affected set** — a join table populated **at write time from the ledger rows that caused the mark** (§4.4) — and there is **no `affected_node_ids` array on the mark row**; two writable representations of one fact would be the very defect this disposition was corrected for (AC-85, charter A3.1). **The API's affected-node list is a read-time projection of `condition_mark_node`.** One authoritative store, two payload appearances, no drift — which is what DR-021 knob 10's "travels" requires. |
| **UI-10** the answer index's entries and L1/L2 | **DESIGN-NEUTRALIZED** | The index carries **names, not numbers** — verdict state, staleness state, abstention kind and its cell *name*, serve state, builds-on-previous flag (§5.3) — so L1 and L2 do not bind it. If a mockup later asks for a number on a card, it uses the same labeled-number type (value + provenance reference + replay handle), so both laws hold **by type** rather than by policy. |
| **UI-11** register row D-1's unowned non-interface half of the no-orphans rule | **RESOLVED-BY-PACK** | The charter already owns it and already names the unit: *"A shipped unit — module, function, endpoint, table, migration, config flag, prompt — is live if (a) it is reachable from a declared entry point and (b) it is actually called on a real run"* (charter §5), with G1/G2/G5 as the audits and A4.2's never-called list **BLOCKING**. The non-interface half is therefore not unowned — it is charter-owned, and **architecture claims the mechanism**: `tools/orphan-audit` plus the CI gates in §2.7. W19's build-failing reachability check is the interface's slice of the same tool. |
| **UI-12** DR-055 and whether a standard-tier run wearing DEGRADED-DIVERSITY is servable | **RESOLVED-BY-PACK** | The ledger's DR-055 precision answers it directly: degraded single-maker mode is *"TRANSIENT provider-unavailability handling only (the DR-014 cap+label path), never a legal standing configuration for standard+ — a deployment that cannot execute multi-maker at standard+ does not pass launch"*, restated at charter S4. So: an individual run **is** servable wearing `SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE` / `DEGRADED-DIVERSITY` with the confidence-band cap, the visible label, its reason and the recorded lift condition (DR-014); a **deployment** that cannot execute multi-maker at standard+ fails the launch gate. Two different objects, two different verdicts. |
| **UI-13** *(added at rework round 1)* **manifest §9.2d × AC-62** — the serve layer must transition stale jobs to failed "**on every read**", and the UI contract forbids reads carrying write side effects | **DESIGN-NEUTRALIZED** | A genuine cross-artifact contradiction on the serve path, not just on fleet status: manifest §9.2d requires the write-on-read transition; ui §2 surface 14 rules that *"the surface's write side effect … must not ride on a read the interface performs"*. **Resolution: split the obligation.** The **state transition** is performed by a **scheduled reaper** (the same mechanism §5.3 already uses for stale-worker reaping); the **read derives** the failed status from the job's deadline **without writing**. That satisfies manifest §9.2c's *"status is derived, never asserted"* (AC-88) and AC-62 simultaneously, and it preserves §9.2d's actual guarantee — that a stuck job can never masquerade as work-in-progress on any read — because the derivation is evaluated on every read even when the reaper has not yet run. Owner: context 7 (`serve`), AC-89. |

### 6.7 DEFERRED-BY-DESIGN — one table, no per-item analysis

Confirmation only: for each, **the architecture leaves the deferral open** — no
design element depends on the deferred value or shape, and each has a named
landing place.

| Source | Items | How the architecture leaves it open |
|---|---|---|
| spec **D-1** verdict/confidence band numeric thresholds | | bands are **ordered labels**; the cut-point matrix (question class × risk tier) is a register table read at serve time (AC-66, AC-74) |
| spec **D-2** the UI's 30 presentation cells | | architecture consumes consequences only (DR-064); §5's resources carry every *fact* the cells might present, in no particular layout |
| spec **D-3** the whole flag/configuration register | | `packages/register` houses rows and versions; the skeleton ships keys, not invented values (AC-76) |
| spec **D-4** citation hard-kill activation · **D-5** coverage-as-gate | | **Corrected at rework round 1 — these do NOT ship as register-gated branches.** Charter §5.2's deferred table is `RATIFIED(DR-020 knob 7)` and says it in terms: the hard-kill gate *"does **not** ship … it must not exist as code that cannot fire"*, and coverage *"ships as the diagnostic UNCOVERED-SCOPE note only"*. So: **the eight typed citation failure routes ship** (spec §7.3 E-8, knob 13, "from day one"); **the hard-kill gate does not ship** and carries a **NOT-SHIPPED attestation** in the acceptance bundle (charter A4.4, BLOCKING); **`UNCOVERED-SCOPE` ships as a diagnostic note** and the coverage **gate** does not ship — spec D-7 additionally makes `coverage_passed` a *forbidden claim* until outcome data exists, so a dormant coverage gate would be a claim-capable branch that cannot legitimately fire. A register-gated branch here would make A4.4 unsatisfiable: no firing fixture is possible (the quote matcher has not validated) and the attestation would be false (the code is in the tree). Matches §8 S6. **The underlying "auto-activating vs not shipped" conflict is charter §9 item 6 — raised as a V-QUESTION at §6.9, not resolved here.** |
| spec **D-6** phased Stage-11 rollout | | recording limbs day one; ingestion in WAIT; capability cells `basis: NONE` (see OQ-G1) |
| spec **D-7** abstention matrix values · **D-8** `livenessThreshold` N · **D-10** exploration share and onboarding thresholds · **D-12** routing reach | | all are register rows carrying owner, recalibration trigger and sign-off route (charter A5.2) |
| spec **D-9** `orderingPolicy` / retrieve-first experiment | | stage order is a declared sequence in `battery`, not hard-wired control flow; experiments are post-prototype (DR-004) |
| spec **D-11** four v1-scoped memory decisions with named later upgrades | | each is a register-gated branch in `memory`; the v1 option is the default value |
| spec **D-13** disposition-rate disparity flag · **D-14** battery version freeze · **D-15** Q27's label question · **D-16** DR-052's unnamed amendment · **D-17** sibling-artifact register rows | | D-13/D-14 are recorded fields (`battery_version` pinned per run); D-15 becomes live only at coverage-gate activation; D-16 is ledger hygiene; D-17's adopted options are read from the manifest, as the spec instructs |
| manifest **O-1** every numeric constant · **O-2** `OD-13` band thresholds | | DR-023 register rows; no constant is a source literal (AC-74) |
| manifest **O-3** `OD-01` supporter-count cap · **O-4** `OD-08` restatement-flag promotion · **O-5** `OD-12` τ ceiling · **O-6** `OD-04` vouched magnitude · **O-7** `OD-17` composition membership · **O-8** `OD-05` incomplete-conjunction state | | each successor is a register-gated branch that changes a **value or a flag**, never a shape: `magnitude_status` already carries O-6; the restatement flag already carries its similarity field; there is no cap constant to remove because counting ships uncapped (AC-23) |
| manifest **O-9** stage order · **O-10** the whole stack apart from Postgres · **O-11** typed-non-answer enum · **O-12** `stranger_restatement` shape | | O-10 is this document's §2, offered for ratification; O-11/O-12 are **imported by citation** from the spec and never restated (AC-65, AC-67) |
| manifest **O-13** UI presentation cells · **O-14** the V2 self-consistency estimator · **O-15** DR-046's provisional routing numbers | | O-13 as spec D-2; O-14 is out by omission and nothing depends on it; O-15 are register rows |
| ui — 29 `DRAFT—V RULES` cells + register row D-1 | | consequences carried in §4/§5; shapes untouched. D-1's enforcement gap is claimed by architecture (UI-11) |
| ui — verdict-band **numbers** · E4's transport · edge relation vocabulary · condition-marks membership · `stranger_restatement` field list · DR-009/DR-008 placement in the mapping table · the 35 `.mjs` contract tests | | band **numbers** are register rows (the *flag* question is **not** deferred here — `NEXT_PUBLIC_VERDICT_FIRST_UI` has exactly one disposition, the V-QUESTION at §6.5 C8, and is deliberately absent from this table); E4 is transport-neutral by Seam D plus the §5.5 stream event; the edge and mark vocabularies are **imported** from the manifest's `OD-19` and spec §12.3 respectively (AC-65); the placement task is spec-side with an owner; the `.mjs` tests are re-authored under W7 against the declared contract (§2.5) |

### 6.8 Disposition counts

**Counts as at rework round 1.** Six items moved to V-QUESTION at review
(AM-1, AM-2, AM-5, AM-10, A-9, C8): in each the pack settled something adjacent
to the question but not the question itself, and the earlier disposition let an
architecture seat's design stand where a V ruling is owed. The designs are
retained in every case, **relabelled SEAT-PROPOSAL inside the question**.

| Disposition | Count | Items |
|---|---:|---|
| **RESOLVED-BY-PACK** | **15** | OQ-G1, OQ-G4, OQ-G5, OQ-G6, OQ-G7, OQ-G8; U-3, U-5; A-10, A-11; C2; UI-1, UI-2, UI-11, UI-12 |
| **DESIGN-NEUTRALIZED** | **17** | AM-6, AM-7, AM-8, AM-9, AM-11, AM-13; A-2, A-5; C6; UI-3, UI-4, UI-5, UI-6, UI-7, UI-8, UI-9, UI-10 |
| **V-QUESTION** | **24** | OQ-G2, OQ-G3, OQ-G9, OQ-G10; AM-1, AM-2, AM-3, AM-4, AM-5, AM-10, AM-12, AM-14; U-1, U-2, U-4; A-1, A-3, A-4, A-6, A-7, A-8, A-9; C5, C8 |
| **Total** | **56** | 10 OQ-G + 14 AM + 5 U + 11 A + 4 C + 12 UI = 56 |

**Adjacent disposition sets, counted separately** (each carries exactly one
disposition on the same three-way scheme):

| Set | Count | Breakdown |
|---|---:|---|
| §6.6 **UI-13** — the manifest §9.2d × AC-62 contradiction, architecture-identified at rework round 1 | 1 | DESIGN-NEUTRALIZED 1 |
| §6.9 — the quality charter's §9 recorded contradictions | 7 | RESOLVED-BY-PACK 5 · V-QUESTION 2 |
| §6.10 — architecture-raised questions outside the digests' item sets | 3 | V-QUESTION 3 *(was 4; AQ-4 withdrawn at round 2 — it was a second semantic disposition of A-11, which §6.4 already resolves RESOLVED-BY-PACK)* |
| **Grand total dispositioned** | **67** | R 20 · D 18 · V 29 |

**Blocking status is per question, not a single flag.** The previous round's
"four are launch-blocking, the rest can be answered while building" was wrong
against three of its own consequence texts. Each question below names the
**earliest slice it blocks**; `08-open-questions-for-V.md` carries the same
field, and `07-build-order.md` treats it as an entry criterion.

| Blocks from | Questions |
|---|---|
| **S0** (walking skeleton) | AM-12 (asker identity — the tier-2 handle's authorization needs a principal); AQ-2, AQ-3 (clean-room layout — a repository decision precedes the first commit); **AM-1 *only* if S0 wants conformance narrower than exhaustive** — S0 runs it exhaustively and does not need the answer (§6.2 AM-1) |
| **S2** (graph) | **A-1** (the undercut's arithmetic — the edge table cannot be frozen before it; §4.2(4)) |
| **S3** (scoring engine) | A-3 (lifting-predicate composition); A-4 (cluster collapse over attacks); **A-8** (whether the deployment operator default is optional — S3's stated P-D2 gate is unconstructible if no parent can be undeclared); A-9 (`pending` in the arithmetic) |
| **S4** (judge panel) | **U-4 / A-6** (what judge weight multiplies) |
| **S5** (serve) | OQ-G3 (hard bundle budget); **AM-1 (non-node "load-bearing" — required here for conformance *sampling*; S0 runs exhaustively without it)**; AM-3 (the three closed sixes → the price cell); U-1 (`OD-11` layering trigger); AQ-1 (band rule: obligation or restatement, and the ceiling label's content) |
| **S6** (evidence) | OQ-G9 (activation predicates); **OQ-G10** (the eight citation routes — "an unnamed enum blocks the evidence subsystem"); U-2 (`OD-20` eligibility map); A-7 (`mixed`/`unknown` gate side); charter §9 item 6 (auto-activation vs not-shipped) |
| **S7** (SPLIT) | AM-10 (WAIT semantics); AM-14 (measured behavioural difference) |
| **S8** (CROSS) | AM-2 (flip-sensitivity on casual runs); **AM-4** (the Q34 diff population) |
| **S9** (budget) | OQ-G2 (per-row correctness/enrichment); AM-5 (risk-tier authority) |
| **S14** (UI) | C5 (kept-component boundary); C8 (verdict-first flag) |
| **S15** (launch bundle) | charter §9 item 7 (are unfilled register keys orphans?) |

**23 distinct questions** across the 24 V-QUESTION rows (A-6 restates U-4), plus
2 from §6.9 and 3 from §6.10 = **28 distinct questions for V**.

### 6.9 Quality charter §9 — the recorded contradictions

The charter is a founding artifact of the same pack and carries seven standing
contradictions, each re-verified 2026-08-05, which §6.1–§6.6 did not reach
because they are not digest items. Same three-way scheme.

| # | Charter §9 item | Disposition | Basis |
|---:|---|---|---|
| 1 | Ticket 15 still names the deleted output (`spec-pack/race-criteria.md`) | **RESOLVED-BY-PACK** | A stale pointer in a ticket outside this repository; DR-047 names artifact 4 as the **Quality Charter**, and `docs/founding/quality-charter.md` is what exists. No architecture consequence. |
| 2 | Clause 1 (V judges on outputs) vs DR-039 (no invented measurements) — "in tension by design" | **RESOLVED-BY-PACK** | Charter A1.3 `RATIFIED(DR-039)` is the reading: *"No proxy metric may stand in for V's judgment … none may be declared 'the bar'."* Architecture consequence, stated so it is checkable: **`tools/acceptance-bundle` emits no aggregate quality score**, and no CI gate computes one. |
| 3 | Clause 4's evidence base (dead checks) is excluded from D1–D5 by V's steer yet indicted by DR-047 clause 4 at code level | **RESOLVED-BY-PACK** | Both authorities apply at different scopes and neither is displaced. Charter §5.1 **G3** is `RATIFIED(DR-032)` for the disagreement flag, its §5.2 fixture table is **BLOCKING(DR-063)**, and *"the generalization to every other branch is **ADVISORY**"*; charter **S2** makes P-D1…P-D5 `RATIFIED` and mandatory. So: `tools/orphan-audit` **does** owe a dead-check detector, at **advisory** force (§2.7's G5 row), while the named G3 subjects and the never-called list **block** (VR-5). The dead check is outside the D1–D5 register and inside charter clause 4 — which is what the charter itself records. |
| 4 | "The canonical verdict model does not exist yet" | **RESOLVED-BY-PACK** | Stale as of **DR-066(3)**, which ratifies the GLOSSARY's canonical verdict-model entry as written (two axes; DR-014 caps the confidence band; numbers at DR-023). Built as AC-66. The charter's §9 text predates DR-066 and was not back-annotated (FLAG-3). |
| 5 | The closure ledger and the charter register disagree on size (2 rows vs 5) | **RESOLVED-BY-PACK** | **DR-063** ratified all five (VR-1…VR-5); the spec's §23.C count only ever covered the two spec-owned rows (`OD-C-01`, `OD-C-02`). All five bind on architecture — VR-3 shapes §2.5's ceremony, VR-4 shapes AC-77's exemptions, VR-5 fixes what blocks. |
| 6 | "Not shipped" vs "auto-activating" — whether auto-activation counts as shipped-dark | **V-QUESTION** · blocks from **S6** | **Question:** *Does DR-020 knob 7's auto-activating hard-kill gate count as "shipped dark" under charter §5.2's not-shipped rule?* The two clauses cannot both be honoured: knob 7's auto-activation implies code present and inert until the quote matcher validates; charter §5.2 says it *"must not exist as code that cannot fire"*. **Recommendation:** honour the charter's not-shipped rule (the later, BLOCKING acceptance authority) and treat "auto-activates" as describing the *activation event* rather than licensing dormant code — i.e. the gate is written when the matcher validates. **Consequence:** if V rules the other way, §6.7's D-4/D-5 row and §8 S6 both change, and the acceptance bundle carries a firing fixture rather than a NOT-SHIPPED attestation. **This plan does not resolve it — the earlier round did, silently, inside a confirmation table.** |
| 7 | Clause 4's scope over pure configuration data — is class (3), "a register row with no executable unit", inside its reach? | **V-QUESTION** · blocks from **S15** | **Question:** *Is a register row with no executable unit inside charter clause 4's reach — i.e. is an unratified register key an orphan?* This is not abstract: `packages/register` ships **a skeleton of keys with no values** (§4.6, §7 doc 6), so under one reading every unfilled key is an entry on the **BLOCKING** never-called list at S15 and under the other none is. **Recommendation:** class (3) is outside clause 4's reach — VR-4 itself distinguishes it from code-behind-a-flag, and the register's own discipline (AC-74: V ratifies before production) is the mechanism that governs it. **Consequence:** if V rules it inside, the S15 never-called list is non-empty by construction until the whole register is ratified, and every unratified key needs a dated V exemption (A4.3). Must be answered **before** S15. |

### 6.10 Architecture-raised questions (outside the digests' item sets)

Three questions this seat raises rather than answers. They are not digest items
and are not counted in §6.8's 56; they go to `08-open-questions-for-V.md` with
the rest.

| ID | Question | Recommendation and consequence |
|---|---|---|
| **AQ-1** · blocks from **S5** | *(i) Is "the band rule" a **second obligation** beside DR-044(Q51)'s three blocking gates, or is manifest §4.2(h) merely restating that same "band half"? (ii) Either way, what does charter VR-2's way-of-knowing ceiling **say** — a label derived from the load-bearing nodes' way-of-knowing distribution, or a register-supplied cut?* Half (i) matters because if the band rule is DR-044's restatement, `band_ceiling` is a **charter-VR-2 display obligation rather than a gate**, and S5's gate text changes accordingly. | Charter VR-2 requires every band to **name** its way-of-knowing ceiling, and manifest §4.2h says *"the band rule alone carries the consequence"* — but neither states the mapping, and DR-039 forbids inventing one (the manifest names the same bar: *"DR-039 sets a high bar for inventing three constants"*). **Recommendation:** ship the carrier now — `band_ceiling {label, basis}` on the Answer (§5.4), computed from the load-bearing nodes' `way_of_knowing` distribution and the Q51 downgrade state — and let V set the label vocabulary and any cut as register rows. **Consequence:** with no rule at all, AC-24 is a constraint with no design element carrying it, which §1's own law calls a gap; with an invented mapping, it is an invented rule. |
| **AQ-2** · blocks from **S0** | *May kept UI component source be carried into `DebateAI-V3` at all?* (FLAG-4(a)) | DR-048 keeps the components and UX; manifest §14's clean-room prohibition binds organ implementers and V2 **engine** code. The permissive reading is available but is V's to confirm. **Consequence:** if no, the UI is rebuilt from the contract rather than kept, and ui §5's W-item plan changes shape. |
| **AQ-3** · blocks from **S0** | *If yes, what structural barrier keeps the organ implementers clean — **(1) a separate repository, or (2) a separate workspace, separately checked out**?* (FLAG-4(b)) *(A third option — an import-fenced package inside this repository — is named only to be excluded: it **does not satisfy FLAG-4(b)'s own test**, since such a package sits in every implementer's working tree, editor index and agent context, and FLAG-4(b) holds that "a barrier that depends on an implementer not searching their own working tree is not a barrier". Offering it would invite an answer this plan's own analysis rules out.)* | **Recommendation:** option (2). **Consequence, recorded plainly:** with no fence, **DR-003 has no enforcement mechanism** — V2-derived source sits beside the five organ packages, and manifest §14 voids DR-003 *"regardless of intent"*; clean-room compliance becomes an honour system, which manifest §14 explicitly refuses. **What the fence costs, so V can price it:** the single-type-graph orphan audit is split, and AC-61 then depends on the fenced interface emitting a **consumer manifest** the engine's release build requires (§2.6, §2.7) — a real mechanism, but one more moving part than a single checkout. |

**Not a question: FLAG-1's M4 reading.** An earlier draft carried a fourth entry
here asking V to confirm that M4 imposes no numeric τ ceiling. **It is
withdrawn.** §6.4 **A-11 already disposes that issue RESOLVED-BY-PACK** — the
later DR governs (DR-062 `OD-12`), and spec §18 O-4 itself routes M4's content
to the manifest — so asking it again was a second semantic disposition of one
item and contradicted FLAG-1's own statement that the confirmation does not
block the plan. **The architecture builds the DR-controlled rule: no numeric τ
ceiling.** FLAG-1 remains in §1.9 as a **non-blocking record of a
founding-doc-vs-ledger divergence**, not as a V-QUESTION and not as a slice
entry criterion.

---
## 7. C4 artifact-set plan

The documents this seat will author at C4 into `docs/architecture/`. This list is
reviewable scope: each entry names what it contains and what it must not. Ten
documents plus one ADR directory.

| # | Path | Scope | Explicitly out of scope |
|---|---|---|---|
| 1 | `00-overview.md` | The system in one read: context map (§3.1), container view (`apps/*`, `packages/*`, one Postgres), the stage↔context table restating AC-17, the four seams (§3.2), and the constraint base as a traceability spine (**AC-01…AC-92** → where each is carried — the spine covers the whole base, including the seven organ-6/organ-2 rows added at rework round 1, and **each of AC-86…AC-92 must resolve to its owner, its data/API carrier and its acceptance fixture in `09-traceability.md`**; a row that does not is the gap §1's own law names). Written to the stranger law: a reader who knows nothing restates what the engine is and how a number gets served. | no schema, no endpoint list, no rationale-by-anecdote |
| 2 | `01-decisions/ADR-NNNN-*.md` | One ADR per irreversible or contested choice, each with context / options / decision / consequences / the constraint it serves. Planned set: language+runtime · API encoding and front door · Postgres access + migration tooling · the evaluation-snapshot purity seam · the polymorphic edge and the undercut carrier · ledger ordering and the hash triple · projections computed at read time · the event payload grade · job execution in Postgres · the orphan-audit mechanism · the register mechanism and resolution chains · the test stack and the replay-ceremony isolation · authorization tiers · segment-addressed composed text. | ADRs never restate requirements; each cites its AC ids |
| 3 | `02-data-model.md` | Per-schema table shapes, keys, constraints, indexes, the append-only mechanics, partitioning, archival and revival, migration policy, and the DDL home of every write-time invariant (AC-32), each with its **named canonical owner**. Named additions from rework rounds 1–3: the **`run` frozen head (UPDATE and DELETE revoked), the append-only `run_progress_event` and `run_row_activation_event` streams, the immutable `run_row_activation` row, the mandatory initial events, the empty-stream-is-a-typed-error rule, and `last_evaluated_at_seq` as a derived value** (§4.1a); the **`segment_suppression` projection and the `served_number_event` / answer-version carrier for eviction** (§4.4); the **"required node" predicate** and its M1 interaction (AC-11); the **undercut's support-edge composite-FK invariant** and its single owner (§4.2(2)); the **arrow upsert semantics** — collapse vs typed integrity error (§4.2(3)); the **`strength_source` fence** and what the column holds under each A-1 answer (§4.2(4)); the **non-blank trimmed-length `CHECK`** (§2.4); `condition_mark`'s **affected-node join**; `composed_text`'s **segment→number reference set**. Includes the closed-enum inventory with its single sources. | no ORM code, no full DDL listings (those live in migrations) |
| 4 | `03-module-design.md` | Package boundaries and the enforced dependency graph, invariant ownership per context, the provider gateway's interface, the graph write API, the pure core's signature and its lint gates, the runner's unit of work, error and failure typing. | no per-function design |
| 5 | `04-api-contract.md` | **W1's deliverable**: the frozen resource vocabulary and encoding — resources, projections, closed enums, the labeled-number and number-slot types, pagination, the typed error taxonomy, the event vocabulary with declared consumers, authorization tiers, versioning policy, and the machine-checkable field inventory that AC-61's audit walks. | presentation cells (DR-064); no layout, no copy |
| 6 | `05-register-skeleton.md` | The register's schema, the resolution-chain mechanism, provisional-row metadata (owner, recalibration trigger, sign-off — charter A5.2), the naked-constant printing rule (AC-75), and **the key inventory drawn from the pack** — every constant the pack names, with a value only where the pack states one. | **no invented values** (AC-76); V ratifies at DR-023 |
| 7 | `06-test-strategy.md` | The four test layers: the two literature vectors with their required outputs; P-D1…P-D5 as property tests **with the manifest's generator preconditions and exclusion sets** (manifest §4.5); the eight house-rule gates; the law gates (replay, ledger completeness, serve termination, partition law, cost envelope, stranger coverage, overlay detachment). Plus: the charter §5.2 firing-fixture table mapped to fixture ids, the **fire-both-ways** discipline including the labelled *should-not-fire* cases (charter VR-1, AC-79), the manifest §12.2 scenario-coverage list, and the orphan audits G1/G2/G5. **Named additions from rework rounds 1–2:** the **replay-ceremony isolation proof** — an artifact listing every symbol `apps/replay` shares with `apps/api`/`apps/runner`, **pinned at symbol granularity to exactly `agg`, `σ` and `product`, failing if `apps/replay` declares any local arithmetic symbol**, plus the CI assertion pinning `published-arithmetic`'s exported surface to the same three — **and the operator attestation** (executing principal, credential scope, run ids it did not produce), the two artifacts VR-3's three independence limbs need (§2.5); the **two H2 tests**, H2-a asserting **byte-identical build inputs everywhere except the one named register row** and H2-b confining a third provider's code change to `packages/providers`; the **purity gates for both `propagation` (AC-09) and `battery/decision` (AC-48)**; the **cross-run rejection set** (cross-run source node, cross-run target node, and an otherwise-valid undercut of a support edge in another run); the **`tier_source` round-trip** for all three suppliers; the **run-immutability pair** — `UPDATE` and `DELETE` against the `run` frozen head both raise, and current phase / envelope state / every row's activation state are resolvable at every point from run creation onward with no empty-stream window; the **`no raw_text` in any tier-2 payload** assertion; the **frozen-conformance-record byte-identity** assertion around an eviction; the **arrow-order stability** property test across two independent derivations of one snapshot; the **completeness-gate pair** (fires on a genuinely missing artifact; does **not** fire on an unparseable-but-persisted one, AC-11); the **undercut rejection fixture** (an undercut written against an *attack* edge is refused); the **arrow upsert pair** (identical duplicate collapses; same identity with a differing payload raises the typed integrity error); the **non-blank claim fixture** rejecting null, empty and whitespace-only; the **maker-inventory pair** (fires on a one-maker deployment; does not fire on a two-maker deployment with one transient outage); and the **eviction fixture** (a segment reciting an evicted number is suppressed). | no test code; no V2 comparison at any level (AC-80) |
| 8 | `07-build-order.md` | §8's slices expanded: per-slice entry criteria **including §6.8's blocks-from-slice questions**, the charter gates each must show firing, the launch-gate readiness matrix (spec §22.1 + charter §5.2), and the deferred-gate activation conditions. **Two explicit launch-readiness dependencies:** charter §5.2 row 6's fixture is **unconstructible until at least one battery row is classified enrichment** (OQ-G2), and charter §9 item 7 must be answered **before S15** or the BLOCKING never-called list's contents are undefined. | no estimates in time units |
| 9 | `08-open-questions-for-V.md` | The **28 distinct questions** — 23 from §6's V-QUESTION rows (A-6 restates U-4), 2 from §6.9, 3 from §6.10 — each as the smallest question with this seat's recommendation labelled **SEAT-PROPOSAL**, the consequence of the alternative, and its **blocks-from-slice-Sn** field. **The single place V answers.** | never rules any of them |
| 10 | `09-traceability.md` | The index no other document can carry: DR → requirement → module → table → endpoint → test. Satisfies AC-61's bidirectional check at the documentation level and spec S-25's "every surface traces to a requirement and every requirement to a surface". | not a summary of anything |

**Honesty note on scope.** Documents 3, 5, 7 and 10 are the large ones; 5 and 10
are mostly generated inventories and will be authored as generated-plus-reviewed
rather than hand-written prose. Nothing in this set duplicates the founding pack:
where the pack states a rule, the C4 document **cites** it (AC-85).

---

## 8. G5 slicing preview — vertical slices for the PROGRAMMING mission

First cut, walking-skeleton first. Each slice is vertical (it serves something or
proves something end to end), and each names the charter gates it must show
**firing** before it is done (AC-79). Slice order encodes dependency, not
priority; S0–S3 are the spine and nothing else starts before S0 is green.

| # | Slice | What it delivers end to end | Charter gates it must show firing |
|---|---|---|---|
| **S0** | **Walking skeleton — a *legal* serve path** | `POST /v1/asks` → `run` frozen head + `run_row_activation` written → one-node graph → one judge call through the provider interface → pure propagation → ledger rows → **fact bundle (carrying Q53's residual-objection field) → one composition call → one conformance call, run EXHAUSTIVELY (every segment judged, no sampling — see §6.2 AM-1) → machine enforcement → served answer**, with the components-only + `DEFECT` terminal **reachable and fixtured** rather than being the path. Per-node provenance, a `stranger_restatement`, one replayable number. The composition pair is **in S0 and not deferred to S5**: AC-51 is categorical that composition is four steps in order and *"pure render was rejected"*, and AC-49/charter S5 put serve-conformance in the protected core no budget may skip — so a slice that serves without a conformance judge ships a serve path the pack forbids. S5 hardens this pipeline; S0 makes it legal. **The full ordered trace is published below the table.** One transport, one contract package, one Postgres. | continuous replay self-test (charter S1) · ledger tells the truth (S3) · **all four AC-52 gates present in order**: R9 **fires** in gate position (§5.2 row 3); Q53 **passes through** (vacuous on a one-node graph) with its residual-objection field populated — its *firing* fixture is S5's, S0 demonstrates the position; conformance runs; **Q51 fires after conformance has passed, all three limbs — provenance join, locator gate (row 1), and the reasoning-only downgrade to hypothesis-plus-research-plan, which blocks rather than annotates** · G1/G2 audits wired and reporting |
| **S1** | **Ledger and replay hardening** | input/contract/content hashes, append-only total order under the sequence allocator, the four reconstruction paths, the completeness gate, and `apps/replay` running the ceremony against recorded runs — **importing only `packages/published-arithmetic` and no other workspace package (§2.5a), never a local copy of `agg`/`σ`/product, reading every structural outcome from frozen rows** (§2.5). | replay ceremony passes **exactly**, byte-identical numbers, no model in the path (charter S1, VR-3) · **all three independence limbs evidenced: the isolation proof lists `published-arithmetic` and nothing else; the reader is frozen-records-only; and the operator attestation names the executing principal, its read-only credential scope and the run ids it did not produce** · **completeness gate fires** on a genuinely missing artifact **and does not fire** on an unparseable-but-persisted one — both fixtures, per AC-11's "required node" predicate and AC-79 · **run immutability: `UPDATE` and `DELETE` against the frozen head both raise, and current phase / envelope / activation state are total from run creation onward** (§4.1a) |
| **S2** | **Graph and the cycle law** · **entry criterion: A-1 answered** — the edge table cannot be frozen while the undercut's arithmetic is open, because `strength_source`'s third member either becomes live or must be **removed rather than left unreachable** (§4.2(4), AC-77) | first-class edges with polymorphic targets, three lifecycles, materialized path, write-time enforcement, construction refusal + shared-crux redirect. | cycle law fires at **all three layers** (§5.2 row 10) · write-time invariants reject (A3.2) · **undercut invariant: accepted against a support edge, refused against an attack edge** (C-1's fixture pair) · **arrow upsert: identical duplicate collapses, differing payload on one identity raises the typed integrity error** (AC-35 both behaviours) · **non-blank claim rejects null, empty and whitespace-only — exercised against the migrated database, not an application validator** · **cross-run integrity: every cross-run source/target combination is refused, including an otherwise-valid undercut of a support edge in another run** (C-11, AC-69) · **arrow-order stability across two independent derivations of one snapshot** (AC-08) |
| **S3** | **Scoring engine** | DF-QuAD with both operators, the operator resolution chain, cluster collapse records, leverage and fragility outputs, the rival reading, the graph fingerprint. | both literature vectors reproduce · P-D1, P-D2, P-D3 green · leverage bound serves `LEVERAGE_UNRESOLVED` (§5.2 row 9) · undeclared parent takes DR-040's path, not a default |
| **S4** | **Judge contract and panel** | claim typing, the deterministic reducer, panels with per-member failure isolation, dispersion, correlated-error grouping, the disagreement flag, typed non-answers. | disagreement flag **fires both ways** (VR-1) · no default τ from an unusable judge (P-D1) · panel member failure isolates (AC-04) |
| **S5** | **Serve pipeline hardened** | the full gate order and terminals; segment-addressed text **with its segment→number reference set**; machine-injected honesty fields; projections; the components-only rendering; organ 6's preconditions, sanitizing, reconciliation and honest-degradation vocabulary (AC-86…AC-91); **AC-24's band-ceiling projection**; the debug facet **at its operator-scoped address** (§5.3). | serve termination to components-only + DEFECT (§5.2 row 8) · Q53 objection visibility (row 2) · verdict-R9 post-composition (row 11) · degraded-mode projections + replay eviction (row 12), **including the eviction fixture's three assertions: the frozen conformance record is BYTE-IDENTICAL before and after; the sealed answer version still replays historically; and the current projection reads components-only + DEFECT — with the suppression written as an append-only `segment_suppression` row and the status change as a `served_number_event`** · six terminal fixtures (spec §12.1a S-9) · **five distinct typed refusals** each demonstrated (AC-86) · **every band names its way-of-knowing ceiling** (charter VR-2, AC-24) |
| **S6** | **Evidence subsystem** | frozen queries and typed amendments, admissibility, access depth, absence rows, provenance clusters and their key, freshness, probe capture and instrument certification, the eight citation routes. | H5 leaf gating · off-subject downgrade visible (DR-009) · P-D3 against real clusters · citation hard-kill **not shipped** with its NOT-SHIPPED attestation (charter §5.2 deferred table) |
| **S7** | **SPLIT loop and defeaters** | children+defeaters in one act, cold-reader test, falsifier rotation, the rival carver, caps, and the pure decision→spawn function. | only categorically-grounded decisions spawn work (AC-48) · defeater completeness · `UNFALSIFIED-AFTER-ROTATION` serves · regeneration cap yields the typed "not runnable" abstention |
| **S8** | **CROSS** | lineage rules, blinding, the independence receipt, the symmetry diff with its two stamps, `UNINSTRUMENTED` and the remediation layer, the objection ledger. | symmetry fires **both ways** (spec §22.1) · DR-014 cap path (§5.2 row 4) · multi-maker critique at standard+, **both halves**: the per-run one, **and the two deployment predicates of §3.2 Seam C, fixtured separately so the DR-055 standing gate and the DR-014 transient path are distinguishable: `deployment_maker_capability` FAILS on a standing one-maker deployment (standard+ asks refused, no S15 attestation) and PASSES on a two-maker deployment even while `run_maker_reachability` is false for one provider mid-run, in which case that run takes DR-014's cap-and-label path and the counter classifies it transient** (AC-38, charter S4) |
| **S9** | **Budget and envelope** | the visible cost envelope, typed enrichment skips, the protected core's refusal, the hard stop. | budget-skip marker and protected-core refusal (§5.2 row 6) · envelope exhaustion (row 7) · rate frozen at run start (AC-50) |
| **S10** | **Value overlay** | Pareto trigger, Flows A/B/C, the reversal point, rejected criteria served, DR-053's two labelled sections. | overlay detachment byte-identity (spec §22.1) · a recommendation with an empty overlay owner is a defect (V-10) |
| **S11** | **Staleness and liveness** | snapshot, watched triggers, TTL clocks, propagate-to-affected-nodes, badges, archival and revival. | DR-015 STALE badge path (§5.2 row 5) · E4 freshness on every read (AC-64) |
| **S12** | **Settlement and scorecards** | resolution events, read-back verification, the registered proper score, scorecard cells as ledger functions, the eight routing guards, the model ledger. | cold-start exit **demonstrably executes** (spec §22.1, charter A5.4) · P-D5 green · G4 configuration-reachability on the learned path |
| **S13** | **Cross-run memory** | the four-tier ladder as DB predicates, links, aliases, pinned pulls, the disclosure block and its three blocking gates, the unlink control. | memory **inertness and firing** (spec §22.1, M-25) · no memory sentence without a match fact |
| **S14** | **UI data-layer rebuild** | ui §5's W1–W21 in its phase order, starting with the two items that carry no mockup dependency (W6's freshness invariant, W20's answer-surface states), then W8/W10 and the honesty surfaces. | L5 one transport · L6 bidirectional no-orphan · W19's reachability check **fails the build on an orphan** (AC-61, AC-77) |
| **S15** | **Launch bundle** · **entry criterion: charter §9 item 7 answered** (§6.9) — until it is, whether every unfilled register key is an entry on the BLOCKING never-called list is undefined | the acceptance bundle: never-called list, one firing fixture per §5.2 row, **NOT-SHIPPED attestations for the citation hard-kill gate and coverage-as-gate**, the **replay-ceremony isolation proof and operator attestation** (both VR-3 limbs), the **`deployment_maker_capability` attestation** (AC-38), the fenced interface's **consumer manifest** for the pinned contract version (AC-61), the **`UNCLASSIFIED` battery-row report** (OQ-G2), the entry-point list G1 walked, and the register presented for V's ratification. | A4.2 never-called list **blocks** · A4.4 every fixture present or attested **blocks** · VR-3 ceremony passes · S4 multi-maker deployment attestation present · AC-74 register ratified before production |

**The S0 serve trace, in full.** Published because a slice that claims a legal
serve path owes the build team the whole ordered chain, not three of its four
gates. Every state is AC-52's or AC-53's; none is invented here.

```
  ask -> run frozen head + activation -> node -> judge call -> propagation
    -> ledger rows -> fact bundle {computed facts, Q53 residual objection field}
    -> GATE 1  R9 on node text            (pre-composition)     PASS | BLOCK
    -> GATE 2  Q53 objection visibility   (vacuous, one node)   PASS | BLOCK
    -> compose (one call)
    -> GATE 3  conformance (exhaustive)   PASS | FAIL -> recompose (max 2)
    -> GATE 4  Q51, all three limbs:
                 (a) provenance join
                 (b) locator gate            missing locator -> BLOCK
                 (c) reasoning-only downgrade:
                     way_of_knowing = REASONING for the load-bearing basis
                     -> verdict DOWNGRADED to hypothesis + research plan
                        (blocks rather than annotates)                PASS | BLOCK | DOWNGRADE
    -> post-composition R9 on the composed verdict (DR-057)     PASS | FAIL
    -> SERVE (composed)
```

**S0's one node has no evidence subsystem behind it (that is S6), so its basis
must be stated rather than assumed.** S0's single node is `way_of_knowing =
REASONING` unless a fixture pins it otherwise, and Q51's limb (c) is
`RULED — DR-044(Q51)` as a **blocking** gate, not an annotation (AC-24 carrier
(i); spec §3.10 Q51). Therefore **S0's default served form is the downgraded
one — a hypothesis plus a research plan, not a verdict** — and S0 owes **two**
Q51 fixtures: one where a `LOOKED_UP` basis with a resolving locator serves as a
verdict, and one where the reasoning-only basis is **downgraded**. Without this
stated, the advertised "legal serve path" would ship a reasoning-only verdict
with the ruled downgrade absent, which is the shape Q51 exists to stop.

**The named terminal cause S0 must fixture** is AC-53's **first** route: *two
conformance failures* — compose, fail, recompose once, fail again ⇒
**components-only + visible `DEFECT`**, no new loop. (The other two routes —
a failed post-composition verdict-R9 pass, and a bundle past the declared hard
composition budget — belong to S5 and S5's OQ-G3 answer respectively.) Every
S0 gate fixture names which of the four positions it occupies, so a later gate's
"in position" claim is checkable rather than asserted.

**Four sequencing rules.** (i) No slice ships a gate it has not shown firing in
both directions where the pack requires both (AC-79) — a slice with a dark gate
is not done. (ii) No slice adds a module that no other slice calls; a module
without a caller is an orphan on the day it lands (AC-77), so
`tools/orphan-audit` runs from S0 onward and its never-called list is reviewed at
every slice boundary, not only at S15. (iii) **Which slices may produce a served
answer: S0 onward, and only because S0 contains the composition+conformance
pair.** Until a conformance judge exists in the tree **no run is servable** —
AC-49 puts serve-conformance in the protected core and AC-51 forbids pure
render — so no slice may ship an "interim" render. **Components-only may be
*entered at compose time* only by AC-53's three ruled routes; a *post-serve*
replay eviction transitions an already-served answer to the same surface
(§4.4 clause 3), which is a degradation of a served answer rather than a fourth
compose-time route.** Without that distinction a builder reading this rule would
conclude eviction must *not* reach components-only and would be left with only
the two shapes clause 3 rejects — a part-composed/part-components hybrid (a third
state ui §4.0 does not admit) or intact prose reciting a number with no origin
and no replay handle (AC-63's absolute). **For V, priced explicitly:** evicting a
single component number therefore withdraws the whole composed text. DR-059's
"one number is lost, never the answer" is satisfied and this is the only reading
consistent with ui §4.0's two states, but the pack never ruled it and the
reading-experience cost is a consequence V may want to see. (iv) **A slice does not start before
its blocking questions are answered** (§6.8's table is the entry-criteria list);
where a question is unanswered the slice may build carriers and provenance but
not the behaviour the question governs.

---

## 9. What this plan does not decide

- **Nothing product-facing.** Every question of what the engine should *do* is
  the pack's or V's; §6's **28 distinct questions** are queued, never ruled
  (DR-005). Where this plan carries a design for a question V has not answered,
  the design is labelled **SEAT-PROPOSAL inside the question** and the C4
  documents may build its carrier but not freeze its behaviour.
- **No numbers.** Every constant referenced here is quoted from the pack with a
  citation or named as a register key whose value is V's at DR-023 (AC-74,
  AC-76).
- **No presentation.** The 30 delegated cells resolve at build-phase mockup
  review; this plan carries their consequences only (DR-064).
- **The stack is a proposal.** §2 is SEAT-PROPOSAL end to end and is offered for
  V's ratification (DR-005 as narrowed by DR-024). If V rules a different
  language, §3's context map, §4's data model and §5's API direction survive
  unchanged; only §2.2–§2.7 are re-instantiated.

---

*End of Plan.md — ARCH-V3-R1 / C2, 2026-08-05. **Rework round 2**, addressing
the round-2 merged packet of 25 findings (Codex C-3, C-6, C-10 reopened plus
C-11…C-16; Opus O-23…O-38) on top of round 1's 32. Human review required: V
ratifies the stack (DR-005 / DR-024) and the 28 questions of §6.8, §6.9 and
§6.10. Nothing here is final.*







