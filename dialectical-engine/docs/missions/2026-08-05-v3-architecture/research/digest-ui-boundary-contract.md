# Digest — `ui-boundary-contract.md` (architecture-facing)

Mission: ARCHITECTURE (2026-08-05). Source: `/Users/vladmihaimiron/Documents/DebateAI-V3/docs/founding/ui-boundary-contract.md`
(1251 lines, stamped `ACCEPTED — DR-067 (2026-08-05)`, spec-pack artifact 3 of 4 per DR-001).
Cross-checked against `/Users/vladmihaimiron/Documents/DebateAI-V3/docs/founding/decisions-ledger.md`
and `/Users/vladmihaimiron/Documents/DebateAI-V3/docs/founding/GLOSSARY.md`.

Scope note the architecture team must internalize first: **this document is explicitly not endpoint design**
(§0, "What this document is not"). It names *resources*, *the fields they must carry*, and *the events the
interface must be able to hear*, in requirements language. "Whether that is REST, GraphQL, one document or
twelve, is the ARCHITECTURE loop's to propose and V's to ratify there (`DR-005`, as narrowed by `DR-024`)."
Field names throughout §1.2 are marked "illustrative, not normative."

Authority tags used inside the contract (§0, "Authority tags"): `RULED(DR-n)` = entailed by FINAL decision
text; `CARRIED-DESIGN` = carried from a verified fact about V2 or a sibling artifact; `CANDIDATE` = this
document's proposal, **not authority**, and "a builder may not treat a CANDIDATE clause as blocking until V
adopts it." Exactly four clauses are CANDIDATE: `E3`, and the second halves of `L3`, `L4`, `L8` (§7 item 5).

---

## 1. Document map

| Section | What it governs |
|---|---|
| §0 How to read this document | Defines the vocabulary (surface, data layer, serve-composition, projection, honesty surface, condition mark, components-only serve, flex, death list, `DRAFT—V RULES`, `DELEGATED — DR-064`), the three authority tags, the citation discipline, and the explicit exclusion of endpoint design. |
| §1.1 The wire shape | Six numbered clauses fixing what crosses the wire: projections not the bundle; no prose parsing; serve outcome always visible; every number carries origin + replay handle; the fixed serve gate order; multi-pass composition with machine-injected honesty fields. |
| §1.2 The resources | Nineteen requirements-level resources — six read on every answer (Answer, Node, Edge, Honesty projections, Serve record, Provenance record) plus thirteen more (Ask, Typed abstention, Condition marks, Cost envelope, Authorized inspection/replay, Value hinge, Memory disclosure, Investigation, Steering record, Execution-ledger digest, Replay trail, Model scorecard read, Deployment register). |
| §1.3 The event stream | Six event families (run lifecycle, node lifecycle, graph, serve-composition, honesty, ledger) plus four laws on the stream: E1 no emitted event without a declared consumer; E2 one name per meaning; E3 (CANDIDATE) payload-must-be-used; E4 the transport-neutral freshness invariant. |
| §1.4 Contract-wide laws | L1–L11: labeled numbers, replay handles, closed vocabularies, typed state on the wire, one transport, bidirectional no-orphan rule, serve outcome never hidden, typed degradation, named abstention cell, the disclosure boundary, the never-budget-skippable protected core. |
| §2 Surface-by-surface | Maps all 14 V2-consumed surfaces to their V3 replacement resource(s) and the data-layer rebuild each implies. 14 of 14 mapped: one dissolves, one splits in two, eleven repoint. |
| §3 The death list | The 10 never-called V2 surfaces + the dual-transport seam that do not enter V3's interface contract, each with a disposition (DEAD / ABSORBED / NOT-UI-PLANE), plus register row D-1 on how far "die" reaches. |
| §4 The flex ledger | §4.0 (the two answer-surface states every row renders inside) plus one row per honesty surface — nine rows: what the reader sees, the mandating rulings, the current-UI gap, the proposed minimal shape, and the delegated presentation cells. |
| §5 UI work items | 21 items (W1–W21) across Phase 0–3, dependency-ordered, with which items wait on mockup review for *shape* only. |
| §6 Contradictions surfaced | C1–C15 with disposition states; six recorded open (C2, C5, C6, C8, C10, C14) as of the document's own 2026-08-05 re-verification. |
| §7 Acceptance criteria | Six questions a builder must be able to answer without asking V; also the authoritative count of CANDIDATE clauses and of the 30 delegated cells. |

---

## 2. The native wire contract

### 2.1 The wire shape — six ruled clauses (§1.1)

1. **The browser receives typed projections, not the bundle.** `RULED(DR-054)` All nine honesty surfaces —
   badges, condition marks, provenance summaries, per-node restatements — arrive as **typed fields**. The
   complete fact bundle and the conformance record are fetchable on demand through an **authorized
   inspection/replay handle** (the DR-034 handle). Internal prompt material is excluded from the default
   view. §1.1 explicitly retracts an earlier draft inference that the interface reads the whole bundle.
2. **The interface never parses prose to learn a fact.** `RULED(DR-054)` Every badge, marker and label in
   §4 is driven by a typed projection field; composed text is display, never data.
3. **The serve outcome is always visible.** `RULED(DR-049, DR-057)` `max_recompose = 2`. Two answer-surface
   states to render, not one (§4.0).
4. **Every number arrives with its origin and its replay handle, or it does not arrive.**
   `RULED(DR-034, DR-027, DR-059)` A single component number that fails replay is **evicted**; its place
   carries a **typed missing-number mark**; the rest of the answer serves with the DEFECT badge. "One number
   is lost, never the answer."
5. **Gate order is fixed and constrains what can be shown.** `RULED(DR-049, DR-057)`
   R9 on node text (pre-composition) → Q53 (objection visibility) → conformance → Q51 (provenance) →
   **second R9 pass on the composed verdict** (post-composition). The conformance judge may never demand an
   edit that violates R9. Q53's residual objection is a **fact-bundle field**, so the strongest objection
   reaches the reader as data even when the prose fails.
6. **Long answers compose in passes; honesty fields are not the model's to drop.** `RULED(DR-058)`
   Multi-pass composition by load-bearing priority; residual objections, badges and condition marks are
   **machine-injected into the output structure, outside model discretion**. Past the declared hard budget →
   components-only. Consequence for architecture: the honesty projections are never downstream of a
   composition decision.

### 2.2 Serve-composition shapes (§0 definition, DR-044)

Serve-composition (`DR-044`) is: the machine assembles **every computed fact** into one structured bundle;
**one** model writes the text a person reads honoring those facts; a **second** model judges text↔facts
conformance; the machine **enforces** that judgment. Pure render was rejected. The wire consequence is the
projection/bundle split of clause 1.

The composition pipeline produces three distinguishable artifact classes the API must be able to address:

- **Fact bundle** — every computed fact, frozen before composition (a `fact bundle frozen` event exists in
  §1.3). Behind the authorized handle (L10).
- **Composed text** — carried on the Answer ("composed text when there is one", §1.2 Answer). Display only.
- **Conformance record** — the judge's *full* record sits behind the authorized handle; the judge's
  **outcome** is always on the Answer via the Serve record (§1.2 Serve record, `RULED(DR-049, DR-054, DR-057)`).

### 2.3 The nineteen resources (§1.2), with wire-bearing content

**Six read on every answer:**

| Resource | Must carry (architecture-relevant) |
|---|---|
| **Answer** | question line as asked; **verdict** per the canonical model — served states SUPPORTED / CONTESTED / UNSUPPORTED, thresholds per **question class × risk tier**, abstention never a band `RULED(DR-063 VR-2)` with every threshold *number* deferred to the flag register `RULED(DR-023)`; typed abstention + its price cell `RULED(DR-012)`; condition marks `RULED(DR-051)`; staleness state `RULED(DR-015, DR-016)`; value hinges `RULED(DR-017)`; memory disclosure `RULED(DR-044)`; cost envelope + state `RULED(DR-052)`; serve state (composed / components-only + DEFECT) `RULED(DR-049)`; Q53 residual objection as a fact field `RULED(DR-049)`; for mixed questions **two labeled sections** — "what is true" / "what follows given your values" `RULED(DR-053)`; composed text when there is one; handle to the run's execution-ledger digest `RULED(DR-027)`; the authorized inspection/replay handle `RULED(DR-054)`; the graph's **root pointer**. |
| **Node** | claim text; **way of knowing** ∈ LOOKED_UP / RAN / REASONING `RULED(DR-040 Q22 — irreproducible output auto-relabels REASONING)`; base score and final strength, **each with a provenance reference** `RULED(DR-028)`; defeater state `RULED(DR-041)`; exploration state `RULED(DR-016)`; node-scoped abstention and condition marks `RULED(DR-051)`; canonical **`stranger_restatement`** payload `RULED(DR-061, OD-S-06)` — nodes carry claim, certainty, what-would-change-it; **`action_consequence` is verdict-only**; restatement coverage is partial by ruling (load-bearing nodes always, others at the run's frozen sample rate — `DR-019 knob 1`, `DR-052`) so each restatement carries **`check_status ∈ PASS / FAIL / NOT_SAMPLED`**, and `NOT_SAMPLED` is served as a fact, never a blank. The field list "lives once in the requirements spec and is cited, never restated" here. |
| **Edge** | `from` node, `to` node, **relation** (supports / attacks / defeats / shared-crux), **strength**, provenance reference. **Edges are first-class citizens of the payload, not implied by nesting** `RULED(DR-022 as narrowed by DR-035; DR-030 J2 "ONE GRAPH")`. **Cycles cannot appear**: refused at construction, typed error at compute, rejected at write `RULED(DR-056)`. |
| **Honesty projections** | The typed client-facing view of the fact bundle: every badge, condition mark, provenance summary and per-node restatement the nine surfaces need — **sufficient on its own to render every honesty surface without fetching the bundle** `RULED(DR-054)`. Two of the nine are sentence-shaped and get **structured projection fields that render without composed prose** — the value **reversal point** and the **builds-on-previous disclosure** `RULED(DR-059)`. |
| **Serve record** | serve state (composed / recomposed-once / components-only + DEFECT), the conformance **outcome**, **which R9 pass failed** when one did `RULED(DR-049, DR-054, DR-057)`; and **which sentences were conformance-judged** — load-bearing always judged, non-load-bearing sampled at the frozen stranger rate `RULED(DR-060a)`, so "judged" and "not sampled" are two different served facts. Full judge record behind the authorized handle; outcome always on the answer. |
| **Provenance record** | Per number and per claim: who or what produced it, from which inputs, **with a locator** `RULED(DR-044 Q51 — the locator gate is blocking)`, the method, and a **replay handle** `RULED(DR-034)`. Evicted numbers carry the typed missing-number mark `RULED(DR-059)`. Replay ceremony is deterministic: **numbers replay exactly; the serve decision replays as stored data — the conformance verdict is an input artifact, never re-generated** `RULED(DR-060b)`. |

**The other thirteen:**

| Resource | Must carry |
|---|---|
| **Ask** | the question; run parameters that are the asker's dial (depth, agent count — `DR-019`); **risk tier** ∈ casual / standard / high-stakes (`DR-011`); decision/action owner, caller scope, `as_of` (`DR-021` per-run ownership); steering pre-sets. |
| **Typed abstention** | which kind — the battery's five (not searched / searched and found nothing / measured and inconclusive / not runnable / a value choice), a **closed** vocabulary applying **only to ignorance-ledger unknowns** `RULED(DR-051 — amends DR-044's exactly-one clause to that scope)`; the price cell (question class × risk tier) `RULED(DR-011, DR-012)`; the unlock condition. |
| **Condition marks** | The closed enum of typed states an answer or node wears *alongside* its verdict, servable in parallel with an abstention and with each other `RULED(DR-051)`. **Membership is imported, not restated**: the requirements spec's mapping table **is the enum's closure**; an unplaced state is a specification defect there. Each mark carries **scope (answer or node), subject, reason, and a lift path where one exists** `RULED(DR-014)`. The interface owes a rendering for every member, including the unresolved-type fallback label (`DR-021 knob 10`), critique-unavailable (`DR-014`), off-subject downgrade (`DR-009`), amended search terms (`DR-008`). |
| **Cost envelope** | the run's visible call/cost envelope, derived from **asker depth × risk tier**, with its state — running, enrichment-skipped, or exhausted-and-stopped carrying ENVELOPE_EXHAUSTED. Never a silent timeout `RULED(DR-052)`. Protected core never budget-skippable: provenance, abstention typing, standard-and-above blind verification, citation routes, serve-conformance. |
| **Authorized inspection / replay** | On demand and behind authorization: the complete fact bundle, the conformance judge's full record, and the recomputation trail for any served number; internal prompt material excluded from the default view `RULED(DR-054, DR-034)`. |
| **Value hinge** | criteria and their sources; option vectors; the Pareto set; `weight_source ∈ owner_elicited / org_policy / none` — **with no `default` member** (`DR-017`); owner; the **reversal point**; the band on each side of it; visibly-served **rejected criteria** (`DR-043`). |
| **Memory disclosure** | whether a prior run was matched, tier and relation, the prior run's own staleness state, agreed/disagreed fields (the *difference statement*), what payload was pulled, **candidates found but not linked**, and an unlink control (`DR-044 Q61`). |
| **Investigation** | the gap; its typed verdict (including **UNINSTRUMENTED, which blocks the fairness claim**); the remediation layer — why the gap exists, the effort grade, the machine-constructed prompt for the next model — **openly marked model-authored and biased**, never replacing the verdict; whether user input is accepted (`DR-045`). |
| **Steering record** | menu selections plus **verbatim** free-text annotations, typed as human-steer input, disclosed in the served trail (`DR-019`). |
| **Execution-ledger digest** | everything executed — attempts, failures, could-not-dos — visible to the asker, with algorithm behavior consistent with the record (`DR-027`). |
| **Replay trail** | for any served number: the frozen records and the recomputation, **with no model in the replay** (`DR-034`). |
| **Model scorecard read** | per-model capability and bias facts derived from measured outcomes, and the model ledger's session record (`DR-039, DR-046`). |
| **Deployment register** | V3's own flag/config set, drawn fresh and V-ratified (`DR-023`) — not V2's. |

### 2.4 Typed honesty projections — all nine surfaces

Each of the nine is a **projection** (§0: "Every one of the nine is a projection"). Proposed minimal shapes
are the contract's own (§4 rows), and field names are illustrative.

| # | Surface | Minimal projected shape (§4 row) | Mandating rulings |
|---|---|---|---|
| 1 | **Typed abstention badges** | `abstention { kind (closed, five; ignorance-ledger scope; exactly one within that scope), reason_text (display only, never parsed — L4), cell { question_class, risk_tier, price }, unlock[], evidence_ref? }` — carried on the **Answer** and on any **Node**, alongside but never merged with condition marks | Battery Stage 10; `DR-010` (price strictly 0<p<1), `DR-011` (class × risk-tier matrix), `DR-012` ("every served answer names its cell"), `DR-051` (partition law), `DR-044 Q55` as amended, `DR-020`, `DR-037` (five terminal routes) |
| 2 | **Per-node provenance + ways-of-knowing** | `node.knowing ∈ LOOKED_UP \| RAN \| REASONING` (closed); `node.provenance { produced_by, from_inputs[], locator, method, replay_handle }`; `<every served number>.provenance_ref` | GLOSSARY; defect D4; `DR-027`, `DR-034` (REPLAY LAW), `DR-040 Q22`, `DR-044 Q51` (three blocking gates), `DR-021 knob 10` |
| 3 | **Defeaters as first-class attacks** | `answer.edges[] { from_node_id, to_node_id, relation ∈ SUPPORTS \| ATTACKS \| DEFEATS \| SHARED_CRUX (closed; exact vocabulary is the manifest's OD-19, not this seat's), strength, provenance_ref }`; `node.defeater_state ∈ OPEN \| SATISFIED \| EXHAUSTION_MARKED \| UNFALSIFIED_AFTER_ROTATION`; `node.disagreement?` (DR-032's flag + the certainty downgrade it caused) | `DR-022` as narrowed by `DR-035`, `DR-030 J2`, `DR-041 Q26/Q29`, `DR-042`, `DR-056`, `DR-032` |
| 4 | **STALE / UNDER-REVIEW badges** | `answer.staleness { state, as_of, review_due_at, trigger?, affected_node_ids[] }`; `node.staleness { state, as_of }`; `state ∈ FRESH \| UNDER_REVIEW \| STALE \| ARCHIVED_REVIVED` (closed). Plus law **E4** | `DR-015` (snapshot + wake + propagate; "never silently"), `DR-016` (retired = archived, full graph kept, auto-revived) |
| 5 | **Value markers + reversal points** | `value_hinge { hinge_node_id, criteria[], option_vectors, pareto_set[], weight_source (no "default"), weight_vector \| null (null is first-class and serviceable), owner \| null, scope, as_of, reversal, band_under_weight, band_under_alternative, rejected_criteria[], elicitation_trace }` — rendered inside DR-053's second section | `DR-017` (Pareto trigger, FLOW A always — conditional + reversal = a FULL answer; FLOW B one optional swing question; FLOW C opt-in profiles), `DR-043`, `DR-042 Q30`, `DR-030 J1` |
| 6 | **Investigate-deeper** | `investigation { gap_id, subject_ref, verdict (UNINSTRUMENTED is a condition mark), blocks_claim: bool, remediation { authored_by: MODEL, marked_biased: true (never optional), why_text, effort_grade, proposed_prompt }, accepts_user_input: bool }`; execute → typed job + `replay_handle`; user input → steering record | `DR-045`, `DR-019` |
| 7 | **UNDER-EXPLORED** | `node.exploration { state ∈ EXPLORED \| UNDER_EXPLORED (closed), basis }` — held **separately** from `defeater_state` and from stop/abandon status ("three different facts that must not share a badge") | `DR-016` ("never a retirement cause alone") |
| 8 | **SKIPPED-BY-BUDGET + fallback labels (condition marks)** | `condition_marks[] { mark, scope (answer \| node_id), subject, reason, lift_path? }`; `answer.envelope { budget_basis, consumed, state ∈ WITHIN \| ENRICHMENT_SKIPPED \| EXHAUSTED }`. Answer-level list **echoed into each affected node's provenance** — knob 10's "travels" is literal: **two places, not one** | `DR-021 knobs 9 & 10`, `DR-052`, `DR-051`, `DR-050` (LEVERAGE_UNRESOLVED), `DR-041` (DEGRADED DIVERSITY), `DR-014`, `DR-055` (multi-maker critique = launch gate at standard+), `DR-009`, `DR-008` |
| 9 | **Builds-on-previous disclosure** | `memory_disclosure { matched, tier, relation, decided_by, prior { run_id, question_line, answered_at, verdict, confidence_band, staleness_state }, agreed_fields[], disagreed_fields[], payload_pulled[], candidates_found_not_linked[], unlink_control: true }` + three blocking checks on the composed sentence (no memory sentence without `matched: true`; tier **and** difference must survive into served text when relation ≠ identity; the staleness badge travels **inside** the sentence) + a structured projection field `RULED(DR-059)` | `DR-044 Q61`, `DR-027`, `DR-015` |

### 2.5 The inspection / replay handle (DR-054, DR-034)

One handle, uniform, is what makes "show me why" a property of the contract rather than a per-screen feature
(§4 row 2: "That is what makes it uniformly available rather than a per-screen feature — and it is why
**authorization, not layout, is the first question about it**").

**What the browser receives by default:** typed projections for all nine surfaces; composed text (or the
components-only rendering); serve state + conformance outcome; every served number with its origin label and
a provenance reference carrying a replay handle; the node graph with first-class edges.

**What is fetchable on demand behind the authorized handle (L10, `RULED(DR-054)`):** the complete fact
bundle; the conformance judge's **full** record; the recomputation trail for any served number.

**What is excluded from the default view:** internal prompt material.

**Authorization scope — resolved outside this document.** The contract records C14 as **open** ("authorized"
per DR-054 vs "digest-visible to the user" per DR-027; §6, C14 at lines 1205–1211). The ledger closes it:
`DR-066` (2026-08-05, gate 31) — *"'SHOW ME WHY' IS ASKER-SCOPED — the asker may replay their own answer's
full record on demand (authorization = their session's scope; internal prompt material stays operator-only)"*,
ledger row explicitly noting *"resolves UI C14"*. **The contract body was not updated to reflect this.**

### 2.6 The event stream (§1.3)

**Six families.** Run lifecycle (accepted, planning, running, terminal-with-typed-kind); node lifecycle
(spawned, generating, text delta, complete, failed-with-typed-reason, retrying with attempt count against
`DR-020`'s cap of **2 regeneration rounds**); **graph** (edge added with its relation; cycle refused and
redirected to a shared-crux node — `DR-042` makes "circular dependency found" *served information*);
**serve-composition** (fact bundle frozen, composition started, composition delta, conformance verdict
returned, recompose or defect flag — `DR-044`); **honesty** (abstention typed, budget skip marked, fallback
labeled, investigation gap opened, memory link decided, staleness trigger fired, branch marked
UNDER-EXPLORED); **ledger** (each executed attempt, failure, could-not-do — `DR-027`).

**Four laws.** E1 no emitted event without a declared consumer `RULED(DR-047 clause 4)`; E2 one name per
meaning, declared once `CARRIED-DESIGN`; E3 payload-must-be-used-or-not-sent — **`CANDIDATE`, explicitly
non-binding**; E4 the freshness invariant `RULED(DR-015)` + `CARRIED-DESIGN`: **every read of, or
subscription to, an answer that occurs after a wake-up must expose that answer's current staleness state.**
E4 is transport-neutral by construction — "**Push and pull are both conforming architectures**" and remain
candidates until V rules flex row 4's first cell.

---

## 3. Kept-UI rebuild scope

### 3.1 What survives

`DR-048`: the interface keeps its **components and its user experience** — "the pages, the canvas, the
drawer, the badges, the way a person moves through an answer" (§0). D-KEEP-V2-UI is re-scoped in the ledger
as *"keep the surface, rebuild the plumbing"*. Specific kept mechanisms the contract names as already working
and reusable:

- The cross-node click-through-and-focus mechanism, proven by `recommended_investigations[].target_node_id`
  — "the mechanism for 'click through to the node this points at' already exists and works" (§4 row 3).
- `VerdictBanner`'s raw-band fallback — "the one place a new kind degrades gracefully" (§4 row 1) — though
  it is debate-scoped, not per-node, and flag-gated (C8).
- The export affordance: "The link stays a link" (§2 surface 5).
- Controls kept and repointed: node feedback vote (§2 surface 9), node regenerate (§2 surface 10).

### 3.2 What dies

**The ten never-called surfaces + the dual-transport seam (§3, `DR-048`, reason = charter clause 4 /
`DR-047`).** Dispositions under register row D-1's option 1 (this document's reading, not yet V-ruled):

| # | Surface | Disposition |
|---|---|---|
| 1 | `DELETE /api/debates/{id}` (archive) | **DEAD** — `DR-016` replaces deletion: retirement is archival, full graph kept, nothing deleted, auto-revive via staleness review |
| 2 | `POST .../scoring/jobs` | **ABSORBED** — re-reading after a staleness wake-up is flex row 4's job, not a user-pressed refresh |
| 3 | `GET .../scoring/jobs/{job_id}` | **ABSORBED** — job state becomes typed events on the stream |
| 4 | `GET .../scoring?force_refresh=true` | **DEAD** — scoring dissolved into the node; no second read to force |
| 5 | `POST .../scoring/manual-investigations` | **ABSORBED** — superseded by `DR-045`'s specified flow (flex row 6) |
| 6 | `POST /api/qbaf/runs`, `GET /api/qbaf/runs/{id}` | **DEAD as a surface** — under `DR-030 J2` there is ONE GRAPH; attack/support relations are edges on the answer, not a separate engine behind its own address |
| 7 | `GET /api/ops/jobs`, `/verdict-shadow`, `/expansion` | **NOT-UI-PLANE** — but `DR-027`'s digest obligation makes *some* of this content asker-visible through surfaces 5/11, on the interface contract |
| 8 | `POST /api/workers/register`, `/{id}/heartbeat`, `/{id}/poll` | **NOT-UI-PLANE** |
| 9 | `POST /api/jobs/{id}/stream`, `/complete`, `/fail` | **NOT-UI-PLANE** |
| 10 | `GET /healthz` | **NOT-UI-PLANE** |
| 11 | **The dual-transport seam** | **DEAD** — replaced by law L5, one transport. "A safety hook that only fires on one of three paths is not a safety hook" |

The seam concretely: two mutually exclusive front doors for `/api/*` (the Next catch-all
`web/app/api/[...path]/route.ts`, which alone runs the `recordSuspiciousScoringProxyResponse` hook, and
`scripts/web_proxy.py`, the launchd front door, which routes `/api/*` straight to the coordinator bypassing
that hook) **plus SSR, which calls the coordinator directly and uses neither** — three paths, two of which
skip the safety hook.

**Also dying by construction (L6, §2, §3 "adjacent dead weight"):** the `web/lib/types.ts` `DebateDetail`
mirror ("deleted, not migrated"); dead type slots `DebateDetail.scoring`, `DebateNode.lens`,
`DebateNode.score`; served-but-unread fields `evidencePresence`, `argument_claim`, `derivation.source`,
`provenance_records`, `branch_lineage`, `analyzer_findings`, `judge_disagreements`, `score_caps`,
`max_nodes`; the client-side scoring join `indexScoringResponse`; `formatScoringVisibilityState`'s 6-bucket
fold; the free-text sniffers `looksProviderOrTokenRequired` / `isMissingJudgeOutputReason` and the 401/403
substring match; `ScoringRefreshState` (declared, threaded through copy, **never leaves `idle`**); the
dormant components `DebateTree.tsx`, `ArgumentFocusView.tsx`, `DebateOutline.tsx`; the consumer-less
`lib/api.ts::listDebates`; `v2_generation_readiness`; the `debateTerminal` gate (cannot survive as-is under
either E4 architecture).

### 3.3 What the rebuilt data layer must do (§2 + §5 Phase 1)

The 14→V3 mapping (§2) with the rebuild each implies:

| V2 surface | Replacement | Rebuild |
|---|---|---|
| 1 `GET /api/debates` | **Answer index** — per entry: question line, verdict, staleness state, abstention kind + cell, serve state (components-only labeled **in the list**), builds-on-previous flag | New list client + card model. **Pagination becomes real** — today neither `limit` nor `offset` is sent or read, so a library past 50 entries is silently truncated. Card gains four honesty fields |
| 2 `GET /api/debates/{id}` | **Answer + Node graph + Edge set + honesty projections + serve record** — one coherent read, edges first-class; the fact bundle and conformance record are **not** in this read (L10) | The largest single item. Wire mirror deleted, not migrated. Nesting stops being the only relation. Payload bounded because projections, not the bundle, cross the wire |
| 3 `POST /api/debates` | **Ask** | Opaque `config: Record<string,unknown>` becomes a typed run-parameter panel. **Risk tier is a new required input** — DR-012's cell has no value without it |
| 4 `GET .../events` (SSE) | **The event stream** under E1–E3, serving E4 | Listener rebuilt against a declared vocabulary, zero ignored names; token streaming binds to the one real name (E2). `debateTerminal` cannot survive as-is under either push or pull |
| 5 `GET .../export.md` | **Served-answer export** — composed text (or components-only rendering + DEFECT badge), serve state, honesty projections, execution-ledger digest | Link stays a link; content contract changes. "An export that omits the honesty surfaces is not a faithful export." Whether an export may embed authorized-handle material is an **access-control** question, not formatting |
| 6 `GET .../scoring` | **Dies as a separate surface** — scores are node fields; provenance travels with each number (L1) | Delete the client-side join, the 6-bucket fold, the sniffing, `ScoringRefreshState`; removes the permanent-"Scoring in progress" trap |
| 7 `.../adaptive-depth/dry-run` | **Investigation** listing (`DR-045`) | Panel repointed; **"expansion candidacy" and "attention starvation" separated** — V2 conflates them (flex row 7) |
| 8 `.../adaptive-depth/approvals` | **Investigation execution request + steering record** | Three-shape switch (`recorded` / `queued`–`partial` / `unavailable`) → typed job states with replay handles. `outcomes[].reason_human` (served today, absent from the front-end type) becomes first-class |
| 9 `.../nodes/{id}/feedback` | **Outcome signal** into model ledger/scorecards (`DR-039, DR-046`), node-scoped | Control kept; merge target moves to the node |
| 10 `POST /api/nodes/{id}/regenerate` | **Node re-run request**, bounded by `DR-020`'s cap of 2 rounds and `DR-041`'s model rotation; returns a typed job + replay handle | Response starts mattering: at cap exhaustion → typed "not runnable" abstention with rejection evidence |
| 11 `GET /api/nodes/{id}/generations` | **Execution-ledger read** scoped to the node | Promoted. Swallowing errors into `[]` no longer acceptable — an empty list must mean "nothing happened", not "the read failed" |
| 12 `GET /api/settings` | **Deployment register read** (`DR-023`) **+ a real identity/session surface** | Two jobs split into two surfaces; the settings-as-token-probe hack dies |
| 13 `PUT /api/settings` | **Deployment register write**, keys V-ratified | Form rebuilt |
| 14 `GET /api/backends/status` | **Fleet status + model scorecard / model ledger read** (`DR-046`, Postgres per `DR-024`) | 5 s `setInterval` → event-driven or a *declared* poll with stated interval; **the surface's write side effect (marking stale workers offline and requeuing their jobs) must not ride on a read the interface performs every five seconds** |

**Work-item skeleton (§5).** Phase 0: W1 (freeze the resource vocabulary + encoding), W2 (mockup review —
build-phase gate, not a closure blocker). Phase 1: W3 types authored from the native contract, W4 one-transport
fetch layer with a typed error taxonomy (incl. 429 and typed auth failure), W5 scoring join dissolved, W6
event-stream client + E4 invariant, W7 contract-test re-authoring (**35 of 50 `.mjs` test files assert against
interface source text**; "any flex of the UI contract will trip a substantial subset", and their assertions
were inventoried by filename only). Phase 2: W20 (answer-surface states — **fully ruled, no mockup
dependency**, comes first because everything renders inside both states), W8 node envelope (incl. the
authorization gate), W9 abstentions, W10 edges (**XL**, "the largest component change in the program"), W11
staleness + UNDER-EXPLORED, W12 condition marks, W21 cost envelope, W13 value hinge, W14 investigate-deeper,
W15 builds-on-previous. Phase 3: W16 ask/compose, W17 settings + fleet, W18 export + digest, W19 orphan sweep
ending in "a reachability check that fails the build on an orphan."

Two items carry **no** mockup dependency and can start first: **W6**'s freshness invariant and **W20**'s serve
states (§5, "What blocks what, after DR-064").

---

## 4. Flex surfaces

### 4.1 The nine (DR-048, §4)

Flex means "a shape the interface must gain because the old one cannot carry the meaning" (§0). Ticket 16's
standing guard limits flex to outputs the old contract *genuinely* cannot express; `DR-048` found all nine
honesty surfaces are such outputs (§0, and contradiction C2). The nine, with the reason each cannot land in
V2's contract:

1. **Typed abstention badges** — "No landing place for a five-member typed abstention." Absence today is
   three incompatible closed vocabularies (`errors[].status` 2 members, `pending[].status` 1 member;
   debate-level `status ∈ {available, partial, unavailable}` + a **string-sniffed** free-text `reason`;
   `verdictBand` 3 abstention-shaped members), all funnelling into `ScoringVisibilityKind`, a 6-member closed
   union. **Nothing on the wire carries a price, a class, or a risk tier.**
2. **Per-node provenance + ways-of-knowing** — "Per-node in the tree there is no provenance slot at all."
   `DebateNode` carries only `active_generation.{model_id, worker_id, worker_name}` — who generated the
   prose, not where the warrant came from. `items[].score_provenance` is **the single open-schema field on
   the wire** (`extra="allow"`), ships on every scored node, absent from `types.ts`, read by nothing.
3. **Defeaters as visible first-class attacks** — "No place to land as a first-class relation." The tree
   carries only `parent_id` / `children[]` / `materialized_path`; **"attack" is expressed structurally as a
   `CON` child, not as a labeled defeat edge.** The coordinator's actual attack/support graph
   (`coordinator/app/qbaf/`) is never served; `debate_to_dict` emits no edges.
4. **STALE / UNDER-REVIEW badges** — no staleness concept on any served shape, and the interface is
   *architecturally incapable of receiving one late*: `debateTerminal` gates the entire SSE effect, scoring is
   fetched exactly once per debate id with no poll/timer/SSE invalidation. The wire's `archived` status "is
   never observed by the UI (all debate reads 404 on it)" — the opposite of `DR-016`.
5. **Value markers + reversal points** — "No place to land." `NodeScores` is a **closed 8-key float record**
   pinned identically in `models.py` and `types.ts` with no companion structure naming *which value* a weight
   expresses. `SynthesisPanel` renders exactly four `provenance` sections **by hardcoded key**; any other key
   is silently dropped.
6. **Investigate-deeper** — the ancestor endpoint is fully implemented server-side and **hard-disabled** via
   `manualInvestigationActionState(action, {runFlowWired: false})`. Nothing carries a constructed prompt, a
   user input field, an effort grade, or a model-authored marker.
7. **UNDER-EXPLORED** — no attention/exploration measure exists. The nearest field, `pressure` +
   `expansion_hint`, is **expansion candidacy** ("should we grow here?"), a different fact from attention
   starvation ("did we ever look here?"). Routing it through `renderStateOf`'s 7 render states would read as
   "Stopped path" — "the opposite of what DR-016 means."
8. **SKIPPED-BY-BUDGET + fallback labels** — no budget, cost, skip or fallback vocabulary anywhere on the
   wire; **no envelope concept at all**. No per-node channel exists for a label to travel in, which is
   precisely what knob 10 requires.
9. **Builds-on-previous disclosure** — nothing on the wire refers to another run. No sentence slot, no unlink
   control, **no negative-disclosure concept**.

### 4.2 The two answer-surface states the nine render inside (§4.0)

Not a tenth surface — the frame. **Composed, or components-only + DEFECT** `RULED(DR-049, DR-057)`, entered by
exactly three routes, **none of which opens a new loop**: (a) a second conformance failure; (b) the composed
verdict failing its own post-composition R9 pass (`DR-057`); (c) a fact bundle past the declared hard
composition budget (`DR-058`). In that state the two sentence-shaped surfaces still appear **as data**
(`DR-059`), replay-evicted numbers carry a typed missing-number mark, honesty fields are machine-injected
(`DR-058`), and a mixed question serves as **one answer with two labeled sections in machine-enforced order**
(`DR-053`) — "the sections' order is not a presentation choice."

### 4.3 The 30 delegated presentation cells (DR-064) — what architecture consumes

`DR-064` (ledger, 2026-08-05, register review): the cells "stay counted and consequence-annotated in the
contract; V rules each against actual mockups during the UI build phase (one review per flex surface, per
DR-048's 'each V-approved'). The requirements mission closes without them — **architecture consumes their
consequences, not their shapes**." Count = **29 `DRAFT—V RULES` cells across the nine rows + register row D-1
(§3) = 30** (§5 W2, §7 item 6).

**Consequences architecture must carry (the settled half):**

| Cell | Question deferred | Consequence architecture consumes |
|---|---|---|
| **D-1** (§3) | How far "die" reaches — scoped vs literal vs deferred | Under the scoped reading the system runs, but **charter clause 4's no-orphans rule needs a second enforcement point outside the interface**, which someone must own. Three entries (2, 3, 5) are ABSORBED and the flex rows already depend on those capabilities; three (7–10 group) must earn a named non-UI caller or they are orphans. W19's scope is D-1's to set |
| **1(a)** | Price cell: number (`0.55`) or words | — (shape only) |
| **1(b)** | Node abstention badges on canvas card or drawer-only | — (shape only) |
| **1(c)** | Answer-level cell in the verdict banner; is `NEXT_PUBLIC_VERDICT_FIRST_UI` on in V3 or gone | Ties to C8 — the flag's default is undiscoverable; rows 1 and 4 put content in/beside that banner |
| **2(a)** | Knowing-label card badge or drawer-only | — (shape only) |
| **2(b)** | "Show me why" → side panel, dedicated route, or downloadable trail | Three different resource shapes for the same handle; only one input is needed either way (the handle) |
| **2(c)** | Diagnostics drawer survives as power-user view or is absorbed | — (shape only) |
| **2(d)** | **Who is authorized** to open the inspection/replay handle | **Not shape** — "if the asker is not authorized for their own answer's trail, 'show me why' is a different feature for a different audience (contradiction C14)." **Resolved by `DR-066`: asker-scoped** |
| **3(a)** | Canvas **draws** edges vs **lists** them under each node | Sizes W10 (XL). Drawing = "a canvas that draws typed arrows is not the canvas that exists"; listing reuses the existing click-through mechanism |
| **3(b)** | UNFALSIFIED-AFTER-ROTATION as node badge or answer honesty-strip line | — (shape only) |
| **3(c)** | Prominence of the refused-cycle notice | It is information but also "machinery talk" |
| **4(a)** | **Push or pull** | **Load-bearing for architecture.** Push = subscription survives terminality, badge can appear mid-read, **connection cost scales with open tabs**, and the answer can change under the reader's eyes. Pull = revalidate on read, correct at open, never moves after; cheapest on the kept components; a tab left open shows a stale badge with no signal. Pull + liveness ping = two mechanisms, bounded staleness window, read stays stable. Seat recommendation (never authority): option 3. **E4 is satisfiable by any of the three** |
| **4(b)** | STALE badge changes the verdict's presentation or sits beside it | Changing presentation makes the same answer "look like a weaker answer without any evidence having changed" |
| **5(a)** | FLOW B swing question: modal / inline / steering menu | Modal interrupts and gets answered; inline is ignorable and keeps the conditional intact, which DR-017 says is already a full answer |
| **5(b)** | Live weight toggle vs two static bands | **Load-bearing for architecture.** "Every position they drag to is a served number that L1 and L2 then owe provenance and replay for; two static bands owe two." A live toggle multiplies the replayable-number population without bound |
| **5(c)** | Rejected criteria visible by default or on demand | DR-043 requires them *served*; on-demand risks served-but-unseen — "the exact D4-shaped failure this pack keeps finding" |
| **5(d)** | Who writes the reversal sentence — composed, templated, or projection-line + gloss | **Load-bearing.** **Replay:** a templated sentence is recomputable from frozen records with no model in it; a composed one is replayable only as stored composition data (`DR-060b`). **Conformance:** a composed sentence is judged if load-bearing, sampled if not (`DR-060a`), spending judge attention on a sentence whose facts are already exact; a templated one has nothing to judge. **Readability:** templates read stiffly, and DR-044 rejected pure render for that reason. `DR-059` already guarantees the fact form survives degraded mode, so this cell "is about the *reading experience* on top of a guaranteed fact, not about whether the fact survives" |
| **6(a)** | Constructed prompt shown verbatim / summarized / hidden | "'Verbatim' here means *this* prompt, not the composition prompt behind it" — L10 excludes internal prompt material from the default view, so a verbatim preview is a distinct, narrower disclosure |
| **6(b)** | Where reader free-text lives in the investigate-deeper flow | DR-019 already settled *authority* (menu **and** verbatim-logged free text, typed as human-steer, disclosed in the trail) — not reopened. Consequence: free text becomes untyped input reaching a model **and** is disclosed verbatim, so "a reader who writes carelessly has published it"; the disclosure obligation must be visible **at the box** |
| **6(c)** | How "model-authored and biased" is rendered | "DR-045's entire safety property is that the remediation never substitutes for the verdict; if the two render alike, the ruling is satisfied on the wire and defeated on the screen" |
| **7(a)** | Warning tone vs neutral note | — (shape only) |
| **7(b)** | Marker on branch root only or every node under it | Determines whether `exploration` is a node-level or subtree-level projection |
| **7(c)** | Marker shows the basis ("3 of 40 attention units") or only the state | Determines whether `basis` must be a served field; DR-016's `N` values are provisional by design |
| **8(a)** | Honesty strip / footer / per-node badges | "A footer is missable, which for ENVELOPE_EXHAUSTED means a reader can mistake a truncated answer for a complete one" |
| **8(b)** | Never-skippable guarantee stated always or only on skip | Always-on becomes wallpaper; on-demand is "absent exactly when nothing went wrong, which is when trust is built" |
| **8(c)** | Confidence-bearing marks (DEGRADED-DIVERSITY, critique-unavailable) share the strip or sit beside the verdict | **They cap the confidence band under `DR-014`** — placing them with budget skips "puts a confidence-capping fact in the housekeeping area." Architecture consequence: these marks are semantically coupled to the verdict axis, not to housekeeping |
| **8(d)** | Cost envelope: live meter / number / only on exhaustion | A live meter "makes cost a thing the reader watches and may optimize against" — and implies a live-run telemetry channel; exhaustion-only implies none |
| **9(a)** | Negative disclosure always or on demand | "Always-shown is the only way a reader can tell 'no history' from 'history judged too weak'... on-demand means a Type-II miss stays invisible and uncorrectable." Seat argues always; recorded as explicitly unruled |
| **9(b)** | What the unlink control actually does | **Load-bearing — "a correctness question wearing a UI control's clothes."** Facts from the prior run may already be inside the graph. Detaching only the sentence "converts an honest answer into an undisclosed one, the exact D4 shape" — forbidden under DR-027 and L1 **unless the machine can prove no pulled payload entered the graph**. Options: immediate re-run (costs a full run against the DR-052 envelope) / mark-for-re-run + badge / detach-disclosure-only (safe *only* when `payload_pulled[]` is empty). Recommendation: option 2 with option 3 as an automatic fast path when `payload_pulled[]` is empty |
| **9(c)** | Disclosure above or below the answer | — (shape only) |

---

## 5. Hard architecture constraints

### 5.1 API-style implications

| Constraint | Source | Implication |
|---|---|---|
| Stack and encoding are **architecture's to propose, V's to ratify** — REST/GraphQL/one-document-or-twelve is not decided here | §0 "What this document is not"; `DR-005` as narrowed by `DR-024` | The resource vocabulary (§1.2–§1.4) can freeze now (W1); the encoding cannot be inferred from this doc |
| **Postgres is a V-imposed stack constraint**, including the observability layer | `DR-024` (ledger: "supersedes DR-005 IN PART... first entry: Postgres"); referenced at §2 surface 14 | Score provenance / trusted-run artifact store / debug views are Postgres-backed |
| **L5 — one transport.** SSR and the browser read the same contract through the same front door | §1.4 L5, `RULED(DR-048)` | No SSR-only path, no second proxy, no hook that fires on some paths only. Kills the three-path seam |
| **L6 — no served field without a consumer; no consumer without a served field.** Both directions of drift are defects | §1.4 L6, `RULED(DR-047 clause 4)` | The contract must be machine-checkable in both directions; W19 ends in "a reachability check that fails the build on an orphan" |
| **E1 — no emitted event without a declared consumer** | §1.3, `RULED(DR-047 clause 4)` | The event vocabulary is part of the orphan audit, not exempt from it |
| **E2 — one name per meaning, declared once** | §1.3, `CARRIED-DESIGN` | Event names are contract. (V2's `synthesis_completed` vs `synthesis_complete` mismatch means v2 debates never stream prose at all) |
| **Edges are first-class payload citizens, not implied by nesting** | §1.2 Edge, `RULED(DR-022/DR-035, DR-030 J2)` | The graph is a node set + an edge set, not a tree. The exact arrow vocabulary is the manifest's **OD-19**, not this document's |
| **Cycle law closed at three layers** | §1.2 Edge, `RULED(DR-056)` | Construction refuses the cycle-closing edge; compute raises a typed error; the write is rejected. **All three must exist** — "a cycle can never reach the interface" |
| **Projections bound payload size** | §2 surface 2 | "Payload size stays bounded because projections, not the bundle, cross the wire" |
| **Pagination must be real** | §2 surface 1 | `limit`/`offset` (or equivalent) must be sent and honored |
| **Reads must not carry write side effects** | §2 surface 14 | "The surface's write side effect (marking stale workers offline and requeuing their jobs) must not ride on a read the interface performs every five seconds" |
| **Polling must be event-driven or a declared poll with a stated interval** | §2 surface 14 | No undeclared timers |
| **Typed error taxonomy is required** (429 included), typed auth failure | §5 W4; L8 (envelope/stop states `RULED(DR-052)`; **transport-error typing is `CANDIDATE`**) | The *ruled* part is run-degradation typing; transport-error typing is a proposal, not binding |
| **Risk tier is a new required input on Ask** | §2 surface 3; `DR-011`, `DR-012` | Without it the abstention cell has no value; every served answer must name its cell (L9) |
| **Verdict band thresholds are per question class × risk tier and their numbers are deferred** | §1.2 Answer, `RULED(DR-063 VR-2)` + `DR-023` | The threshold table is a configuration surface in the deployment register, ratified at flag ratification — architecture must design for a config-supplied cut-point matrix, not constants |
| **Closed vocabularies** — five abstention kinds; one condition-marks enum whose closure is the requirements spec's mapping table | §1.4 L3 (closure `RULED(DR-051)`); §1.2 Condition marks | Membership is **imported** from the requirements spec, never restated. The renderer-robustness half of L3 (raw-label fallback for unknown values) is **`CANDIDATE`** |
| **Typed state on the wire is the boundary; never-parse-prose is CANDIDATE** | §1.4 L4 | The ruled half: machine-readable state travels as typed projection fields. The prohibition on parsing served free text is a proposal |

### 5.2 Authorization / authz for replay and inspection

- **L10 — the disclosure boundary.** `RULED(DR-054)` "Projections by default; the complete fact bundle, the
  conformance record and the recomputation trail behind an authorized inspection/replay handle; internal
  prompt material excluded from the default view."
- **The handle is the only input "show me why" needs** (§4 row 2) — one uniform authorization gate, not a
  per-screen feature. §5 W8 names "the **authorization gate** on the inspection/replay handle (L10)" as part
  of the node-envelope work item.
- **`DR-066` resolves the scope the contract left open:** *"'SHOW ME WHY' IS ASKER-SCOPED — the asker may
  replay their own answer's full record on demand (authorization = their session's scope; internal prompt
  material stays operator-only)"* (decisions-ledger.md line 29; the row's own note reads "resolves UI C14").
  Architecture therefore designs **two authorization tiers on one handle**: asker-session scope grants the
  full record for their own answer; operator scope is required for internal prompt material. The UI contract
  body (§6 C14, lines 1205–1211) still records this as unreconciled and **was not updated**.
- **Export interacts with authz:** "Whether an export may embed authorized-handle material (L10) is an
  access-control question, not a formatting one" (§2 surface 5).
- **`GET /api/settings` was abused as the token-validation probe**; V3 splits it into a deployment-register
  read plus "a real **identity/session** surface" (§2 surface 12, §5 W17). The session surface is what
  DR-066's "their session's scope" is evaluated against.
- **Replay determinism is an authz-adjacent invariant:** numbers replay **exactly**; the serve decision
  replays as **stored data** — the conformance verdict is an input artifact, never re-generated
  `RULED(DR-060b)`. No model in the replay `RULED(DR-034)`.

### 5.3 Degraded / components-only mode

- **Three entry routes, no new loop** `RULED(DR-049, DR-057, DR-058)`: second conformance failure; composed
  verdict failing post-composition R9; fact bundle past the declared hard composition budget (§4.0).
- **What components-only renders:** verified facts, badges, and the node graph, wearing a visible **DEFECT**
  badge — "never blank, never unchecked prose" (§0, §1.1 clause 3).
- **`DR-059` obligations architecture must satisfy:** the value **reversal point** and the
  **builds-on-previous disclosure** each carry a **structured projection field that renders without composed
  prose** (§1.2 Honesty projections, §4.0, §4 rows 5 and 9). These two fields must be populated on every
  answer regardless of composition outcome.
- **Replay eviction** `RULED(DR-059)`: a component number that fails replay is dropped from the component set
  and marked with a typed missing-number mark; the rest of the answer serves with DEFECT. The API must model
  a per-number "missing/evicted" state distinct from absent.
- **Machine injection** `RULED(DR-058)`: residual objections, badges and condition marks are written into the
  output structure by the machine, outside model discretion — so the projection layer must be assembled
  independently of, and merged after, composition.
- **Serve record must distinguish which R9 pass failed** and must distinguish **judged** from **not sampled**
  `RULED(DR-060a)` — three states, not two.
- **W20 is fully ruled and has no mockup dependency** — it can be built first, and every later Phase-2 item
  must render inside both states (§5).
- **Protected core is never budget-skippable** `RULED(DR-052, DR-021 knob 9)` — provenance, abstention typing,
  standard-and-above blind verification, citation routes, serve-conformance survive any envelope exhaustion;
  only enrichment is skippable, and **every skip is marked** (L11).
- **Stranger-sample rate freezes at run start** (`DR-052`, cited via §1.2 Node and Serve record) — conformance
  coverage derives from stranger coverage, both frozen within a run.

---

## 6. OPEN QUESTIONS the contract itself defers

### 6.1 DEFERRED-BY-DESIGN

| Item | Location | Deferred to | Note |
|---|---|---|---|
| **The 29 `DRAFT—V RULES` presentation cells** (rows 1a–c, 2a–d, 3a–c, 4a–b, 5a–d, 6a–c, 7a–c, 8a–d, 9a–c) | §4 rows 1–9 (lines 440, 489, 548, 593, 671, 758, 820, 882, 944) | **Mockup review during the UI build phase** `RULED(DR-064)`; §5 W2; §7 item 6 | Consequences are settled and written out; only shapes are open. None blocks this mission |
| **Register row D-1** — how far "die" reaches (scoped / literal / deferred) | §3, lines 281–310 | Mockup review `RULED(DR-064)`; counted decision 1 of 30 | Sets W19's scope. Seat recommendation: option 1 (scoped) with the enforcement gap named |
| **All verdict-band threshold numbers** | §1.2 Answer; C10 | **V's flag-register ratification** `RULED(DR-023)` | "Numbers inside a ruled shape" — the shape is ruled by DR-063 VR-2. The interface "renders bands whose cut points are not yet set" |
| **`NEXT_PUBLIC_VERDICT_FIRST_UI` — keep, default on, or delete** | §6 C8, lines 1142–1148; §4 row 1(c) | Explicitly "unruled" | The flag's default could not be found in `deploy/`, `web/package.json`, `next.config.mjs`, or any launchd plist — "the verdict banner may be dark in the current deployment" |
| **E4's transport (push / pull / pull+ping)** | §1.3 E4, lines 213–223; §4 row 4(a); §5 W6 | Flex row 4(a)'s mockup review | The **invariant** is binding and buildable now; only the plumbing is open. "Push and pull are both conforming architectures" |
| **Edge relation vocabulary's exact membership** | §4 row 3 minimal shape | The carryover manifest's **OD-19**, "not this seat's" | The UI contract names four relations illustratively |
| **Condition-marks enum membership** | §1.2 Condition marks | The requirements spec's mapping table, "which IS the enum's closure" | Imported, not restated. An unplaced state is a specification defect *there* |
| **`stranger_restatement` field list** | §1.2 Node | The requirements spec (`DR-061`, `OD-S-06`) | "The field list lives once in the requirements spec and is cited, never restated, here" |
| **Off-subject downgrade (DR-009) and amended-search notice (DR-008) placement in the mapping table** | §6 C12, lines 1190–1193 | The pack merge's enum-consolidation item | "A spec-side placement task with an owner, not a contradiction" |
| **35 of 50 `.mjs` contract tests** — assertions inventoried by filename only | §5 W7 | W7 itself ("the first task is reading them") | Genuine unknown scope, but owned |

### 6.2 GENUINELY-UNANSWERED (open findings, §6)

The contract records **six open** as of its own 2026-08-05 re-verification: C2, C5, C6, C8, C10, C14. Two are
resolved by the ledger after the fact.

| ID | Location | State | Substance |
|---|---|---|---|
| **C2** | lines 1082–1091 | **OPEN** | Ticket 16's standing Guard ("flex is for outputs the old contract GENUINELY can't express — the default is adapt, not redesign") and its Codex F6 amendment requiring an **exhaustive per-output outcome vocabulary** (`AS_IS \| ADAPT \| FLEX \| DROP \| NOT_UI_EXPOSED`, "derived from the 71-row matrix (05) × the surface inventory (01)") are still live in the ticket. `DR-048` instead flexes all nine, rebuilds wholesale, and names **no per-row outcome ledger**; its `supersedes` field does not address the guard text or the F6 exhaustiveness requirement. The artifact follows DR-048 |
| **C5** | lines 1114–1121 | **OPEN** | "Components and UX are kept" (`DR-048`) vs nine surfaces the components demonstrably cannot render: "the canvas card itself has no long-form text slot"; `NodeScores` is a closed 8-key float record pinned on both sides; the tree carries no edges; `SynthesisPanel` renders four provenance sections by hardcoded key and silently drops the rest. **No ruling draws the line between "the kept component" and "the flexed surface."** W8 and W10 sit exactly on that line |
| **C6** | lines 1123–1129 | **OPEN** | The kept interface satisfies **neither** push nor pull: it closes its stream permanently at terminality and fetches scoring exactly once per debate id with no invalidation. `DR-015` mandates the badge, `DR-048` says the components are kept, "and no architecture that leaves `debateTerminal` as-is can honor both." Named work inside W6 |
| **C8** | lines 1142–1148 | **OPEN** | The verdict-first flag's default is undiscoverable; rows 1 and 4 put content in/beside that banner. Named work inside W9 (also listed above as deferred-by-design because the *disposition* is a V choice) |
| **C10** | lines 1155–1167 | **OPEN in the contract; substantively closed in the ledger** | Contract text: "whether **'confidence band' is a second axis, an alias, or a derived presentation** of the verdict band. `DR-014` caps one of them and no artifact says which — so this interface can render the band and cannot yet say what a cap does to it." **`DR-066` item (3)** ratifies the GLOSSARY's canonical verdict-model entry as written — *"two axes; DR-014 caps the confidence band; numbers at DR-023"* — and the GLOSSARY entry states the top confidence band is what DR-014's no-independent-critique cap denies, and that any verdict state may combine with any band. **The contract body was not updated** |
| **C14** | lines 1205–1211 | **OPEN in the contract; closed in the ledger** | Contract text: "If the asker is authorized for their own answer, the two agree; if 'authorized' means an operator role, then 'show me why' (row 2) is an operator feature and the asker gets a summary — a materially different product. No ruling says which." **`DR-066` item (1)** rules asker-scoped, and the ledger row's `resolves` field names UI C14. **The contract body was not updated** |

Also open-shaped but **not** counted in the six: row 9(a)'s negative-disclosure question, which §4 row 9
records as "an explicitly unruled question" over and above being a delegated presentation cell; and E3, L3's
second half, L4's second half, L8's second half — four `CANDIDATE` clauses that are **not law** and that
nobody has ruled on (§7 item 5). A builder is explicitly not obliged by them.

---

## 7. Ambiguities noticed (architect-facing, strict)

1. **The contract's §6 contradiction table is stale relative to the ledger.** The document is stamped
   `ACCEPTED — DR-067 (2026-08-05)` yet still lists **C14** and **C10** as open, both of which `DR-066`
   (same date, gate 31, FINAL) resolves — C14 explicitly by the ledger row's own `resolves` field, C10
   substantively via item (3)'s ratification of the GLOSSARY verdict-model entry. An architect reading only
   the contract will design the inspection handle for an unresolved authorization audience and the verdict
   surface for an undecided band axis. **Needs confirmation that the ledger governs and the contract text is
   simply not back-annotated.**

2. **`DR-066`'s UNDERCUT CARRIER requirement has no home in this contract's Edge shape.** The ledger
   (line 29) states: *"an undercut is a typed attack targeting the support EDGE, never the claim node —
   architecture inherits it as a requirement."* The UI contract's Edge resource (§1.2) and row 3's proposed
   shape both define edges as `from_node_id → to_node_id` with a node-to-node relation enum. **An edge whose
   target is another edge cannot be expressed in the shape as written.** The carryover manifest records the
   same gap at §16.2 item 2 ("the ratified undercut shape has no home in the graph organ... an arrow whose
   target is another arrow... neither exists in this manifest, the requirements spec... or the UI contract").
   This is a live graph-model decision for ARCHITECTURE, not a presentation cell.

3. **"Projection" is defined by contents, never by cardinality or lifecycle.** §1.2 Honesty projections must
   be "sufficient on its own to render every honesty surface without fetching the bundle," but nothing states
   whether projections are (a) one composite document alongside the Answer, (b) fields inlined on Answer/Node,
   or (c) a separately addressable resource — and §2 surface 2 describes them as part of "one coherent read."
   Nothing states whether a projection is regenerated per read or frozen with the serve. **The freshness
   invariant (E4) makes this material**: if projections are frozen at serve, a staleness state cannot change
   without a re-projection step nobody has specified.

4. **The Serve record must express three conformance states but only two are named as a pair.** `DR-060a`
   yields judged / sampled-and-passed / **not sampled**, and §1.2 says "'judged' and 'not sampled' are
   different served facts." But the record is scoped to *sentences* ("which sentences were conformance-judged")
   while the composed text is served as a single blob. **No shape is specified for addressing a sentence** —
   there is no sentence identifier, span, or segment model anywhere in §1.2. Same problem for the Node's
   restatement `check_status`, which at least attaches to a node.

5. **"One transport" (L5) and "authorized inspection/replay" (L10) are not obviously compatible as stated.**
   L5 says SSR and the browser read the same contract through the same front door. L10 puts a class of
   material behind authorization. If SSR runs with a service identity and the browser with an asker session,
   the *same front door* returns different content for the same address. Nothing in §1.4 says whether SSR
   inherits the asker's scope. Under `DR-066`'s session-scoped authorization this becomes a concrete design
   constraint on the SSR path.

6. **The event stream's relationship to the projection boundary is unstated.** §1.3 names
   serve-composition events including "fact bundle frozen" and "composition delta," and honesty events
   including "abstention typed" and "budget skip marked." But L10 puts the fact bundle behind authorization
   and clause 2 says composed text is display-only. **Whether stream events carry projection-grade payloads,
   bundle-grade payloads, or bare signals is not specified** — and E3, the only clause that reaches inside an
   event's payload, is `CANDIDATE` and explicitly non-binding. Architecture has no ruled guidance on event
   payload contents.

7. **Two "budget" concepts share vocabulary and must not share a mechanism.** `DR-052`'s **cost envelope**
   (derived from asker depth × risk tier; states WITHIN / ENRICHMENT_SKIPPED / EXHAUSTED) and `DR-058`'s
   **declared hard composition budget** (past which the answer goes components-only) are distinct gates with
   distinct marks (ENVELOPE_EXHAUSTED vs DEFECT). §4.0 lists the composition-budget route into components-only
   alongside the conformance routes, and §1.2 Cost envelope lists only the envelope states. **Whether the
   composition budget is a sub-budget of the envelope or an independent limit is not stated.**

8. **`weight_vector | null` is called "a first-class, serviceable state" but `weight_source` has no `default`
   member.** §1.2 Value hinge and §4 row 5 both stress that `DR-017` removed `default` from `weight_source`.
   The pairing of `weight_source: none` with `weight_vector: null` is presumably the "nobody decided" case,
   but the contract never states the validity constraints between the two fields, nor whether
   `owner_elicited` with a null vector is representable.

9. **Row 8's "travels in two places, not one" duplicates state without a stated reconciliation rule.**
   `DR-021 knob 10`'s fallback label must appear on the answer **and** in every node's provenance, and §4
   row 8 says the answer-level `condition_marks[]` list is "echoed into each affected node's provenance."
   Two copies of the same fact on one payload; nothing says which is authoritative, or what a consumer does
   if they disagree. L6's bidirectional no-orphan rule does not resolve it.

10. **The "answer index" (§2 surface 1) carries verdict, staleness, abstention kind + cell and serve state
    per entry, but the list is described only as a card model.** Nothing says whether the index entries are
    projections subject to L1 (no unlabeled number) and L2 (every number carries a replay handle). If the
    card shows a verdict band derived from numbers, it inherits both laws; if it shows only names, it does
    not. **The contract does not say.**

11. **Register row D-1's own recommendation names an unowned obligation.** Option 1 leaves charter clause 4's
    no-orphans rule needing "a second enforcement point outside the interface, which someone must own," and
    the recommendation is to proceed with "the enforcement gap named explicitly." W19's build-failing
    reachability check covers the interface only. **The non-interface half has no named owner, no mechanism,
    and no acceptance test** — and D-1 is itself a delegated cell, so this remains unassigned through the
    ARCHITECTURE mission unless architecture claims it.

12. **`DR-055` is cited in row 8 as making multi-maker critique a launch gate for standard-and-above tiers,
    which changes what DEGRADED-DIVERSITY *means*** ("labeled degraded operation, not normal operation") —
    but nothing in §1.2 or §1.4 states whether a launch-gate failure is servable at all, or whether a
    standard-tier run may proceed while wearing that mark. Row 8(c) treats it as a presentation question;
    the underlying servability question is not addressed anywhere in the contract.
