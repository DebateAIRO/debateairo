ACCEPTED — DR-067 (2026-08-05) — mission REQ-V3-GREENFIELD-R1

# UI boundary contract — what V3 serves, and what the kept interface must rebuild to read it

Spec-pack artifact 3 of 4 (DR-001) · Mission REQ-V3-GREENFIELD-R1
Authoring ticket: [`../wayfinder/issues/16-ui-flex-negotiation.md`](../wayfinder/issues/16-ui-flex-negotiation.md)
Authority: [`../wayfinder/decisions-ledger.md`](../wayfinder/decisions-ledger.md) — governing ruling **DR-048**
Factual substrate (read-only): [`../research/01-ui-boundary-contract.md`](../research/01-ui-boundary-contract.md)
Vocabulary: [`../wayfinder/GLOSSARY.md`](../wayfinder/GLOSSARY.md)
Status: draft, post-register-review. Three lens rounds and two orchestrator merges are folded in;
what remains is the orchestrator's grep-level final audit (DR-006). **The 30 presentation decisions
in this contract no longer block this mission**: DR-064 delegates them to mockup review during the UI
build phase. Architecture consumes their *consequences*, which are written out here; V rules their
*shapes* against real mockups later.

---

## 0. How to read this document

**What this document is.** V3 is a new reasoning engine in a new repository. Its
web interface is *not* new: V ruled that the existing interface survives
(D-KEEP-V2-UI). But V also ruled how it survives, and the how is the whole
subject of this document.

**The governing ruling, in one paragraph.** DR-048: **no adapter.** Nothing
translates V3's output back into the old engine's shapes. The interface keeps its
*components and its user experience* — the pages, the canvas, the drawer, the
badges, the way a person moves through an answer — and **rebuilds its data layer**
against V3's own way of speaking, from the first day. The ten backend surfaces the
interface never called, and the split front door it was served through, **die**.
And all nine **honesty surfaces** — the places where the engine admits what it does
not know, where a number came from, and what it skipped — **flex**: the old
contract genuinely cannot express them, so the shapes are drawn fresh here.

**Words a stranger needs**, one line each:

- **Surface** — one address the interface can call, plus the shape that comes back.
  "`GET /api/debates/{id}` returns a debate" is a surface.
- **Data layer** — the code between the network and the screen: the fetching, the
  types, the joining, the state machines. This is what is rebuilt. The screens are
  not.
- **Serve-composition** — V3's way of producing served words (DR-044): the machine
  assembles **every computed fact** into one structured bundle; **one** model writes
  the text a person reads, honoring those facts; a **second** model judges whether
  the text matches the facts; the machine enforces that judgment.
- **Projection** — what the browser actually receives (DR-054). Not the bundle: a
  **typed summary** of it — the badges, the marks, the provenance summaries, the
  per-node restatements. The complete fact bundle and the conformance judge's full
  record are **fetchable on demand through an authorized inspection/replay handle**,
  and internal prompt material is excluded from the default view.
- **Honesty surface** — a place where the answer tells on itself: "I abstained, and
  this is which kind of abstention"; "this number is reasoning, not measurement";
  "this branch was skipped because the budget ran out". Nine of them are named by
  DR-048 and each gets a row in section 4. Every one of the nine is a projection.
- **Condition mark** — a typed state an answer or node *wears* alongside its verdict:
  SKIPPED-BY-BUDGET, DEGRADED-DIVERSITY, UNINSTRUMENTED, ENVELOPE_EXHAUSTED, and the
  rest of DR-051's closed enum. Distinct from an **abstention**, which is a refusal to
  answer at all: one answer may wear one abstention kind **and** several condition
  marks (DR-051).
- **Components-only serve** — DR-049's floor. If the conformance judge rejects the
  composed text twice, the answer is served as **verified facts, badges and the node
  graph, with a visible DEFECT badge** — never blank, never unchecked prose.
- **Flex** — a shape the interface must gain because the old one cannot carry the
  meaning. Ticket 16's standing guard is that flex is for outputs the old contract
  **genuinely** cannot express; DR-048 found that all nine honesty surfaces are such
  outputs (see contradiction C2).
- **Death list** — surfaces that do not enter V3's interface contract at all.
- **DRAFT—V RULES** — a stamp on any cell of this document where a real choice about
  what a person sees is still open. Those are V's, not this document's. Every stamped
  cell is counted in the register (section 5, W2).
- **DELEGATED — DR-064** — the disposition of all 30 counted cells. V ruled that
  presentation choices are decided **against actual mockups during the UI build phase**,
  one review per flex surface (DR-048's *"each V-approved"*), not on paper now. So each
  cell stays counted and consequence-annotated here, and the requirements mission closes
  without it. What a builder needs from this document is the *consequence* attached to
  each option — that is settled; the pick is not.

**Authority tags.** Per the pack merge (2026-08-04, cross-lens core A), every binding
clause in section 1 carries one of three tags, so a builder can tell law from proposal:

- **`RULED(DR-n)`** — entailed by the exact normative text of a FINAL decision record.
- **`CARRIED-DESIGN`** — carried from a verified fact about the current system or from
  a sibling spec-pack artifact; not a V ruling, but not this seat's invention either.
- **`CANDIDATE`** — this document's proposal. Not authority. A builder may not treat a
  CANDIDATE clause as blocking until V adopts it.

**What this document is not.** It is not endpoint design. It names the *resources*,
the *fields they must carry*, and the *events the interface must be able to hear* —
in requirements language. Whether that is REST, GraphQL, one document or twelve, is
the ARCHITECTURE loop's to propose and V's to ratify there (DR-005, as narrowed by
DR-024).

**How to check a claim here.** Sentences describing today's interface carry a
citation into [`../research/01-ui-boundary-contract.md`](../research/01-ui-boundary-contract.md)
(cited as `research/01 §X`), which itself carries `file:line` citations into the
frozen V2 engine. Sentences stating what V3 **must** do carry a decision record
(`DR-NNN`). A normative sentence with neither is a defect in this document; raise it
at review.

---

## 1. The native contract, at requirements level

### 1.1 The wire shape

Two rulings set it. **DR-044** settled how served words are made: machine facts in,
one composed text out, a second model judging text against facts, the machine
enforcing that judgment — pure render rejected. **DR-054** then settled what crosses
the wire, which is *not* the same question:

1. **The browser receives typed projections, not the bundle.** `RULED(DR-054)` All
   nine honesty surfaces — badges, condition marks, provenance summaries, per-node
   restatements — arrive as typed fields. The complete fact bundle and the conformance
   record are fetchable on demand through an **authorized inspection/replay handle**
   (the DR-034 handle). Internal prompt material is excluded from the default view.
   *(An earlier draft of this document inferred that the interface reads the whole
   bundle. DR-054 supersedes that inference.)*
2. **The interface never parses prose to learn a fact.** `RULED(DR-054)` Every badge,
   marker and label in section 4 is driven by a typed projection field; the composed
   text is display, never data.
3. **The serve outcome is always visible.** `RULED(DR-049, DR-057)` Composition is
   bounded: `max_recompose = 2`, and after the second conformance failure — or when the
   composed verdict fails its own post-composition R9 pass — the answer serves
   **components-only**: verified facts, badges, node graph, wearing a visible **DEFECT**
   badge. Never blank, never unchecked prose, and no new loop. The interface therefore
   has two answer-surface states to render, not one (section 4.0).
4. **Every number arrives with its origin and its replay handle, or it does not arrive.**
   `RULED(DR-034, DR-027, DR-059)` D4 — serving scores without their origin labels — is
   an indicted defect, and the replay law forbids serving a number V3 cannot recompute
   from frozen records with no model in the replay. When a single component number fails
   replay it is **evicted** and its place carries a typed missing-number mark; the rest
   of the answer serves with the DEFECT badge. One number is lost, never the answer.
5. **Gate order is fixed and it constrains what can be shown.** `RULED(DR-049, DR-057)`
   R9 on node text (pre-composition) → Q53 (objection visibility) → conformance → Q51
   (provenance), and then a **second R9 pass on the composed verdict** after composition.
   The conformance judge may never demand an edit that violates R9, and Q53's residual
   objection is a **fact-bundle field** — so the strongest objection reaches the reader as
   data even when the prose fails.
6. **Long answers are composed in passes, and the honesty fields are not the model's to
   drop.** `RULED(DR-058)` An oversized fact bundle is composed multi-pass by
   load-bearing priority; residual objections, badges and condition marks are
   **machine-injected** into the output structure, outside model discretion, so silent
   truncation is impossible. Past the declared hard budget the answer goes
   components-only. For the interface this means the honesty projections are never
   downstream of a composition decision — they are placed by the machine either way.

### 1.2 The resources

Requirements-level. Each entry names what the resource **must be able to carry**;
field names are illustrative, not normative.

**The six read on every answer:**

| Resource | Must carry |
|---|---|
| **Answer** | question line as asked; the **verdict** per the pack's canonical verdict model — served states **SUPPORTED / CONTESTED / UNSUPPORTED**, thresholds set **per question class × risk tier**, a typed abstention being a separate thing entirely and never a band `RULED(DR-063 VR-2 — names and per-cell principle adopted; every threshold **number** deferred to V's flag-register ratification under DR-023, so the interface renders bands whose cut points are not yet set)`. This artifact renders that model and does not define it; one question inside it stays open (C10); the **typed abstention** if any, with its price cell `RULED(DR-012)`; **condition marks** `RULED(DR-051)`; **staleness state** `RULED(DR-015, DR-016)`; **value hinges** `RULED(DR-017)`; **memory disclosure** `RULED(DR-044)`; the **cost envelope** and its state `RULED(DR-052)`; the **serve state** — composed, or components-only + DEFECT `RULED(DR-049)`; Q53's **residual objection** as a fact field `RULED(DR-049)`; for mixed questions, **two labeled sections** — "what is true" / "what follows given your values" `RULED(DR-053)`; composed text when there is one; a handle to the run's execution-ledger digest `RULED(DR-027)`; the authorized inspection/replay handle `RULED(DR-054)`; the graph's root pointer |
| **Node** | claim text; **way of knowing** ∈ LOOKED_UP / RAN / REASONING `RULED(DR-040 Q22 — irreproducible output auto-relabels REASONING)`; base score and final strength, each with a provenance reference `RULED(DR-028)`; **defeater state** `RULED(DR-041)`; **exploration state** `RULED(DR-016)`; node-scoped abstention and condition marks `RULED(DR-051)`; and the canonical **`stranger_restatement`** payload `RULED(DR-061 — OD-S-06 ratified: nodes carry claim, certainty and what-would-change-it; **`action_consequence` is verdict-only**, because no artifact defines a deterministic projection of an action onto a single node)`. The field list lives once in the requirements spec and is cited, never restated, here. Coverage is partial by ruling: load-bearing nodes always, others at the run's frozen sample rate `RULED(DR-019 knob 1, DR-052)` — so a restatement carries `check_status ∈ PASS / FAIL / NOT_SAMPLED`, and `NOT_SAMPLED` is a fact about the run that the interface shows as such, never as a blank |
| **Edge** | `from` node, `to` node, **relation** (supports / attacks / defeats / shared-crux), **strength**, provenance reference. Edges are first-class citizens of the payload, not implied by nesting `RULED(DR-022 as narrowed by DR-035; DR-030 J2 "ONE GRAPH")`. Cycles cannot appear: refused at construction, typed error at compute, rejected at write `RULED(DR-056)` |
| **Honesty projections** | the typed client-facing view of the fact bundle: every badge, condition mark, provenance summary and per-node restatement the nine surfaces need — sufficient on its own to render every honesty surface without fetching the bundle `RULED(DR-054)`. Two of the nine are sentence-shaped and get **structured projection fields that render without composed prose** — the value **reversal point** and the **builds-on-previous disclosure** — so degraded mode serves them as data `RULED(DR-059)` |
| **Serve record** | serve state (composed / recomposed-once / components-only + DEFECT) and the conformance **outcome** `RULED(DR-049, DR-054, DR-057)`, including which R9 pass failed when one did. Also **which sentences were conformance-judged**: load-bearing text is always judged, non-load-bearing text is sampled at the frozen stranger rate, and the protected core forbids skipping the judge *role*, not exhaustive sampling `RULED(DR-060a)` — so "judged" and "not sampled" are different served facts, and the interface can say which. The judge's *full* record sits behind the authorized handle; the *outcome* is always on the answer |
| **Provenance record** | per number and per claim: who or what produced it, from which inputs, with a locator `RULED(DR-044 Q51 — the locator gate is blocking)`, the method, and a **replay handle** `RULED(DR-034)`. Where a number was evicted for failing replay, its place carries the typed missing-number mark instead `RULED(DR-059)`. The replay ceremony itself is deterministic: numbers replay exactly, and the serve decision replays as **stored data** — the conformance verdict is an input artifact, never re-generated `RULED(DR-060b)` |

**The rest of the contract:**

| Resource | Must carry |
|---|---|
| **Ask** | the question; run parameters that are the asker's dial (depth, agent count — DR-019); **risk tier** ∈ casual / standard / high-stakes (DR-011); decision/action owner, caller scope, `as_of` (DR-021 per-run ownership); steering pre-sets |
| **Typed abstention** | which kind — the battery's five (not searched / searched and found nothing / measured and inconclusive / not runnable / a value choice), a **closed** vocabulary that applies **only to ignorance-ledger unknowns** `RULED(DR-051 — amends DR-044's exactly-one clause to that scope)`; the price cell (question class × risk tier) `RULED(DR-011, DR-012)`; the unlock condition |
| **Condition marks** | the closed enum of typed states an answer or node wears *alongside* its verdict, servable in parallel with an abstention and with each other `RULED(DR-051)`. **Membership is imported, not restated here**: the requirements spec's mapping table is the enum's closure, it places every typed state exactly once, and an unplaced state is a specification defect there rather than a judgement call here. Each mark carries scope (answer or node), subject, reason, and a lift path where one exists `RULED(DR-014)`. What this interface owes is a *rendering* for every member of that table, including the marks it raised during review — the unresolved-type fallback label `RULED(DR-021 knob 10)`, critique-unavailable `RULED(DR-014)`, off-subject downgrade `RULED(DR-009)`, amended search terms `RULED(DR-008)`. *(This resource replaces the "execution mark" family an earlier draft proposed.)* |
| **Cost envelope** | the run's visible call/cost envelope, derived from asker depth × risk tier, with its state — running, enrichment-skipped, or exhausted-and-stopped carrying ENVELOPE_EXHAUSTED. Never a silent timeout `RULED(DR-052)`. The **protected core** is never budget-skippable: provenance, abstention typing, standard-and-above blind verification, citation routes, and serve-conformance `RULED(DR-052)` |
| **Authorized inspection / replay** | on demand and behind authorization: the complete fact bundle, the conformance judge's full record, and the recomputation trail for any served number; internal prompt material excluded from the default view `RULED(DR-054, DR-034)` |
| **Value hinge** | criteria and their sources; option vectors; the Pareto set; `weight_source` ∈ owner_elicited / org_policy / none — **with no `default` member** (DR-017); owner; the **reversal point**; the band on each side of it; visibly-served rejected criteria (DR-043) |
| **Memory disclosure** | whether a prior run was matched, the tier and relation, the prior run's own staleness state, the agreed/disagreed fields (the *difference statement*), what payload was pulled, **candidates found but not linked**, and an unlink control (DR-044 Q61; shape from `research/34-cross-run-memory.md` §1.8) |
| **Investigation** | the gap; its typed verdict (including UNINSTRUMENTED, which **blocks** the fairness claim); the remediation layer — why the gap exists, the effort grade, and the machine-constructed prompt for the next model — **openly marked model-authored and biased**, never replacing the verdict; whether user input is accepted (DR-045) |
| **Steering record** | menu selections plus **verbatim** free-text annotations, typed as human-steer input and disclosed in the served trail (DR-019) |
| **Execution-ledger digest** | everything executed — attempts, failures, could-not-dos — visible to the asker, with algorithm behavior consistent with the record (DR-027) |
| **Replay trail** | for any served number: the frozen records and the recomputation, with no model in the replay (DR-034) |
| **Model scorecard read** | per-model capability and bias facts derived from measured outcomes, and the model ledger's session record (DR-039, DR-046) |
| **Deployment register** | V3's own flag/config set, drawn fresh and V-ratified (DR-023) — not V2's |

### 1.3 The event stream

V3 emits a progress stream. Requirements on it, not its encoding:

**Event families.** Run lifecycle (accepted, planning, running, terminal-with-typed-
kind); node lifecycle (spawned, generating, text delta, complete, failed with a typed
reason, retrying with the attempt count against DR-020's cap of 2 regeneration
rounds); **graph** events (edge added with its relation; cycle refused and redirected
to a shared-crux node — DR-042 makes "circular dependency found" *served information*);
**serve-composition** events (fact bundle frozen, composition started, composition
delta, conformance verdict returned, recompose or defect flag — DR-044); **honesty**
events (abstention typed, budget skip marked, fallback labeled, investigation gap
opened, memory link decided, staleness trigger fired, branch marked UNDER-EXPLORED);
and **ledger** events (each executed attempt, failure, and could-not-do, per DR-027).

**Four laws on the stream**, each written against a named V2 failure:

- **E1 — No emitted event without a declared consumer.** `RULED(DR-047 clause 4)` V2
  emits 18+ event names the interface never listens to and listens for 12
  (`research/01 §C`). Nothing shipped is unreachable — that applies to the event
  vocabulary too.
- **E2 — One name per meaning, declared once.** `CARRIED-DESIGN` V2 emits
  `synthesis_completed` on the v2 path while the interface listens for
  `synthesis_complete`, which only the v1 path emits; the consequence is that **v2
  debates never stream prose to the browser at all** (`research/01 §C`). Names are
  contract.
- **E3 — Whether an event's payload must be used or not sent.** `CANDIDATE` — no DR
  reaches inside a consumed event's payload, so this is a proposal, stated as one: *under
  this option, an event would carry only fields a consumer reads, and a payload nothing
  reads would not be sent.* The behaviour it is aimed at: V2's `tree_ready` carries the
  whole serialized debate, the interface throws it away, and then refetches
  (`research/01 §C`). A builder is not obliged by this line.
- **E4 — The freshness invariant (transport-neutral).** `RULED(DR-015)` +
  `CARRIED-DESIGN` **Every read of, or subscription to, an answer that occurs after a
  wake-up must expose that answer's current staleness state.** This is a statement
  about correctness, not about plumbing: it does not say the stream stays open, and it
  does not say the interface polls. **Push and pull are both conforming architectures**
  and remain candidates until V rules flex row 4's first cell. What *is* settled is
  that V2's behavior — closing the stream permanently at terminality (`debateTerminal`,
  `research/01 §7`) and never re-reading — satisfies neither, because DR-015's wake-ups
  and DR-016's revivals act precisely in that window.
  *(An earlier draft stated this as "the stream survives terminality", which chose push
  before V had ruled. Corrected per the pack review.)*

### 1.4 Contract-wide laws

These bind every resource above. Each carries an authority tag (§0) and replaces a
specific V2 behavior the substrate recorded.

| # | Law | Authority | Replaces |
|---|---|---|---|
| **L1** | **No unlabeled number.** Every served number carries its origin. No judgment and no magnitude ⇒ no number, ever — a typed visible record instead | `RULED(DR-028)` — plus defect D4 | D4; V2's four fallback variants |
| **L2** | **Every number carries a replay handle** and is recomputable from frozen records with no model in the replay | `RULED(DR-034, DR-027)` | trusted-run reconstruction that reached no pixel |
| **L3** | **Closed vocabularies; and a proposal about renderers.** The serving vocabularies **are closed** — five abstention kinds, one condition-marks enum whose membership the requirements spec's mapping table fixes. On top of that, one proposal: *under this option, a renderer meeting a value it does not recognize — a version skew, a later enum extension — would show that value's raw label rather than nothing.* V2 has both patterns: `VerdictBanner` falls back to the raw band string; `caveats` is a hardcoded two-branch `if` where an unknown code renders **nothing** (`research/01 §4`) | closure: `RULED(DR-051)`; renderer robustness: `CANDIDATE` | hardcoded label tables that silently drop unknowns |
| **L4** | **State arrives typed; and a proposal about prose.** Machine-readable state **does** travel as a typed projection field — that is the wire boundary, and it means the interface never *has* to read prose to learn a fact. Beyond that, one proposal: *under this option, parsing served free text for machine state would be treated as nonconforming, leaving free text display-only.* V2 sniffs free-text `reason` for "provider"/"model"/"token"/"credential"/"auth"/"api key" and compares against one exact lowercase sentence (`research/01 §Abstentions`) | typed state: `RULED(DR-054, DR-051)`; the never-parse prohibition: `CANDIDATE` | `looksProviderOrTokenRequired`, `isMissingJudgeOutputReason`, and the 401/403 substring match |
| **L5** | **One transport.** Server-side rendering and the browser read the same contract through the same front door. V2 has two mutually exclusive proxies plus a third path where SSR bypasses both (`research/01 §D`) | `RULED(DR-048 — the dual-transport seam dies)` | the dual-transport seam (section 3) |
| **L6** | **No served field without a consumer; no consumer without a served field.** Both directions of drift are defects | `RULED(DR-047 clause 4)` | V2's served-and-unread (`evidencePresence`, `argument_claim`, `score_provenance`, `judge_disagreements`, `score_caps`) and declared-but-never-served (`lens`, `score`, `scoring`) |
| **L7** | **The serve outcome is never hidden.** The answer surface always carries its serve state and conformance outcome — including components-only + DEFECT after two failed compositions. A defect-flagged composition is never served as if it were clean; a components-only answer never pretends to be a composed one | `RULED(DR-049, DR-054)` | — (new) |
| **L8** | **Run degradation is typed; and a proposal about transport failures.** Envelope exhaustion and the hard stop **are** typed states served with their marks, never a silent stop. Separately, one proposal: *under this option, transport-level failures — rate limiting, timeouts, partial results — would also arrive as typed states rather than as thrown strings.* Every public interface surface in V2 is IP-rate-limited and the interface has **no** 429 handling — `apiFetch` throws the body text as a generic `Error` (`research/01 §D`) | envelope/stop states: `RULED(DR-052)`; transport-error typing: `CANDIDATE` | untyped failure |
| **L9** | **Every answer names its abstention cell**, and every value-decided segment names whose weights decided it | `RULED(DR-012, DR-017)` | silence |
| **L10** | **The disclosure boundary.** Projections by default; the complete fact bundle, the conformance record and the recomputation trail behind an authorized inspection/replay handle; internal prompt material excluded from the default view | `RULED(DR-054)` | — (new; supersedes this document's earlier full-bundle inference) |
| **L11** | **The protected core is never budget-skippable.** Provenance, abstention typing, standard-and-above blind verification, citation routes, and serve-conformance survive any envelope exhaustion; only enrichment is skippable, and every skip is marked | `RULED(DR-052, DR-021 knob 9)` | — (new) |

---

## 2. Surface-by-surface: what replaces each of the 14

All fourteen consumed surfaces from `research/01 §A`. "Replacement" is the V3
resource(s) from §1.2 that carry the same job. "Rebuild" is the interface-side data-
layer work — the component keeps its shape unless a flex row (section 4) says
otherwise.

| # | V2 surface consumed today | What replaces it in the native contract | Data-layer rebuild implied |
|---|---|---|---|
| **1** | `GET /api/debates` — list, SSR, `items` only, no query params sent | **Answer index**: per entry the question line, the verdict per the canonical verdict model, **staleness state**, **abstention kind + cell**, serve state (a components-only answer is labeled in the list, not only on open), and whether the run **builds on a previous one** | New list client and card model. Pagination becomes real: today the interface sends neither `limit` nor `offset` and reads neither, so a library past 50 entries is silently truncated (`research/01 §Gaps 6`). Card gains four honesty fields (rows 1, 4, 9 + serve state) |
| **2** | `GET /api/debates/{id}` — `DebateDetail`, the load-bearing shape | **Answer** + **Node** graph + **Edge** set + **honesty projections** + **serve record**. One coherent read, edges first-class. The complete fact bundle and the conformance judge's record are **not** in this read — they sit behind the authorized inspection/replay handle (L10) | The largest single item. `web/lib/types.ts`'s `DebateDetail` mirror is deleted, not migrated: its dead slots (`scoring`, per-node `lens`, per-node `score`) and its served-but-unread fields (`evidencePresence`, `argument_claim`, `derivation.source`, `provenance_records`, `branch_lineage`, `analyzer_findings`) do not survive L6. Nesting stops being the only relation. Payload size stays bounded because projections, not the bundle, cross the wire |
| **3** | `POST /api/debates` — `{topic, config: Record<string,unknown>}` | **Ask**: question, run parameters (DR-019 depth/agent dials), **risk tier** (DR-011), decision owner + scope + `as_of` (DR-021), steering pre-sets | The opaque `config` blob becomes a typed run-parameter panel. Risk tier is a *new required input* — DR-012 says every served answer names its cell, and the cell has no value without it |
| **4** | `GET .../events` (SSE) — 12 listened, reconnect backoff, **not opened when terminal** | **The event stream** (§1.3) under laws E1–E3, serving the E4 freshness invariant | Listener rebuilt against a declared vocabulary with zero ignored names; token streaming binds to the one real name (E2). Whether the stream itself carries post-terminal freshness, or a revalidating read does, is flex row 4's open cell — the rebuild must satisfy the invariant either way, so the `debateTerminal` gate cannot survive **as-is** in either architecture |
| **5** | `GET .../export.md` — `<a href>`, plain text attachment | **Served-answer export**: composed text (or the components-only rendering and its DEFECT badge), serve state, the honesty projections, and the **execution-ledger digest** (DR-027) | The link stays a link. Its content contract changes: an export that omits the honesty surfaces is not a faithful export of the answer. Whether an export may embed authorized-handle material (L10) is an access-control question, not a formatting one |
| **6** | `GET .../scoring` — separate call, **fetched exactly once per debate id**, joined client-side by `node_id` | **Dies as a separate surface.** Scores are node fields; provenance travels with each number (L1) | Delete the client-side join (`indexScoringResponse`), the 6-bucket visibility fold (`formatScoringVisibilityState`), the free-text sniffing (L4), and `ScoringRefreshState` — a state variable that is declared, threaded through copy, and **never leaves `idle`** (`research/01 §7`). Also removes the permanent-"Scoring in progress" trap, where a payload seen mid-job stays that way for the whole page view |
| **7** | `GET .../scoring/adaptive-depth/dry-run` — candidate/expansion plan with `pressure`, `expansion_hint` | **Investigation** listing (DR-045): typed gaps, their verdicts, remediation with constructed prompts and effort grades | Panel repointed and re-labeled; "expansion candidacy" and "attention starvation" separate (flex row 7 — they are different facts and V2 conflates them) |
| **8** | `POST .../scoring/adaptive-depth/approvals` — three honest shapes on a flag | **Investigation execution request** + **steering record** (DR-019) | The three-shape switch (`recorded` / `queued`–`partial` / `unavailable`) is replaced by typed job states with replay handles. `outcomes[].reason_human` — served today and absent from the front-end type — becomes a first-class field |
| **9** | `POST .../scoring/nodes/{id}/feedback` — `{vote}`, merged into the in-memory scoring payload | **Outcome signal** into the model ledger and scorecards (DR-039, DR-046); node-scoped | Control kept. The merge target moves: the response updates the node, because there is no separate scoring payload to merge into |
| **10** | `POST /api/nodes/{id}/regenerate` — returns `{job_id, status}`, both values unused | **Node re-run request**, bounded by DR-020's cap of 2 regeneration rounds and DR-041's model rotation; returns a typed job with a replay handle | Repointed, and the response starts mattering: at cap exhaustion the answer is a **typed "not runnable" abstention with rejection evidence** (DR-020) — flex row 1's data, arriving here |
| **11** | `GET /api/nodes/{id}/generations` — attempt list, silently `[]` on error | **Execution-ledger read** scoped to the node: attempts, failures, could-not-dos (DR-027) | Repointed and promoted. Swallowing errors into an empty list is no longer acceptable: this surface now feeds an honesty surface, and an empty list must mean "nothing happened", not "the read failed" |
| **12** | `GET /api/settings` — also abused as the **token-validation probe** | **Deployment register** read (DR-023) + a real **identity/session** surface | Two jobs split into two surfaces. The settings page rebuilds against V3's own register — V2's key set is not inherited (DR-023). Today's local type declares 6 of 9 served keys and ignores two pricing tables (`research/01 §6`) |
| **13** | `PUT /api/settings` | **Deployment register** write, keys V-ratified (DR-023) | Form rebuilt against the new register |
| **14** | `GET /api/backends/status` — 5 s `setInterval`, the only timer poll; `v2_generation_readiness` discarded before any component sees it | **Fleet status** + **model scorecard / model ledger** read (DR-046, Postgres per DR-024) | Repointed. `v2_generation_readiness` dies with V2. The 5 s poll should become event-driven or be a *declared* poll with a stated interval — and the surface's write side effect (marking stale workers offline and requeuing their jobs) must not ride on a read the interface performs every five seconds |

**Count: 14 of 14 mapped.** One surface (#6) dissolves into the node; two (#12) split
in two; the other eleven are repointed with the rebuild noted.

---

## 3. The death list

DR-048: the ten never-called V2 surfaces and the dual-transport seam **die**. Charter
clause 4 (DR-047) is the reason: everything shipped must be reachable and called; dead
code eating tokens and processing is indicted at code level.

**Register row D-1 (`DRAFT—V RULES`) — how far "die" reaches.**
**`DELEGATED — DR-064 (ruled against mockups at build)`** · *Counted decision 1 of 30.*

- **Behavior in plain words.** DR-048 says ten never-called surfaces and the split front
  door "die". Ten of the eleven entries are not one kind of thing: some are features
  nobody wired, some are plumbing the browser was never meant to touch (worker
  heartbeats, health checks), and some name a job V3 still has to do under a different
  name.
- **Consequence.** This decides what a builder must delete versus what they must keep
  and re-justify. Read literally, V3 ships without a health check and without a worker
  registration path — the system cannot run. Read as scoped, three entries survive
  outside the interface, and the charter's no-orphans rule (clause 4) must be enforced
  against them by some *other* caller, or they are orphans after all.
- **Options.**
  1. **Scoped (this document's reading, shown in the table).** "Die" = *does not enter
     V3's interface boundary contract*. Three entries are **ABSORBED** (the capability
     returns inside a flexed surface with a real caller), three are **NOT-UI-PLANE**
     (they must earn a named non-UI caller under clause 4, or they die there too), the
     rest are **DEAD**. Trade-off: the system runs; the no-orphans rule needs a second
     enforcement point outside the interface, which someone must own.
  2. **Literal.** Every one of the eleven is removed from V3 entirely and any successor
     must be re-proposed from scratch. Trade-off: maximally clean; requires V3 to
     re-invent health and worker-plane surfaces before it can operate, and re-opens
     three capabilities the flex rows already depend on.
  3. **Deferred.** Mark the eleven "not in the interface contract" and let ARCHITECTURE
     rule each one's fate. Trade-off: no decision is lost, but the orphan audit cannot
     be written until ARCHITECTURE closes, so charter clause 4 has no test at spec time.
- **Recommendation (never authority).** Option 1, with the enforcement gap named
  explicitly: the orphan sweep (W19) covers the interface, and the charter carries the
  non-interface half.

| # | Surface | One line of evidence (`research/01 §B`, `§D`) | Disposition |
|---|---|---|---|
| 1 | `DELETE /api/debates/{id}` (archive) | "no UI affordance at all" | **DEAD** — DR-016 replaces deletion entirely: retirement is archival, the full graph is kept, nothing is deleted, and the next query auto-revives through staleness review |
| 2 | `POST .../scoring/jobs` | "the *only* way to force a fresh judge pass; UI has dead state (`scoringRefreshState`) but no call" | **ABSORBED** — re-reading after a staleness wake-up is flex row 4's job, not a user-pressed refresh button |
| 3 | `GET .../scoring/jobs/{job_id}` | "job-status polling exists server-side; UI never polls it" | **ABSORBED** — job state becomes typed events on the stream (§1.3) |
| 4 | `GET .../scoring?force_refresh=true` | "query param never sent by the UI" | **DEAD** — with scoring dissolved into the node (surface 6), there is no second read to force |
| 5 | `POST .../scoring/manual-investigations` | "fully implemented server-side; UI hard-disables the button via `manualInvestigationActionState(action, {runFlowWired: false})`" | **ABSORBED** — this is the un-wired ancestor of investigate-deeper; DR-045 supersedes it with a specified flow (flex row 6) |
| 6 | `POST /api/qbaf/runs`, `GET /api/qbaf/runs/{id}` | "the QBAF attack/support engine is never surfaced to the UI" | **DEAD as a surface** — under DR-030 J2 there is only ONE GRAPH; the attack/support relations are edges on the answer (flex row 3), not a separate engine behind its own address |
| 7 | `GET /api/ops/jobs`, `/verdict-shadow`, `/expansion` | "operator telemetry only" | **NOT-UI-PLANE** — but note DR-027's digest obligation makes *some* of this content asker-visible through surface 5/11, on the interface contract, not the ops one |
| 8 | `POST /api/workers/register`, `/{id}/heartbeat`, `/{id}/poll` | "worker-plane" | **NOT-UI-PLANE** |
| 9 | `POST /api/jobs/{id}/stream`, `/complete`, `/fail` | "worker-plane" | **NOT-UI-PLANE** |
| 10 | `GET /healthz` | "not consumed by UI" | **NOT-UI-PLANE** |
| 11 | **The dual-transport seam** | Two mutually exclusive front doors for `/api/*`: the Next catch-all (`web/app/api/[...path]/route.ts`, which alone runs the `recordSuspiciousScoringProxyResponse` hook) and `scripts/web_proxy.py` (the launchd front door, which routes `/api/*` **straight to the coordinator, bypassing that hook entirely**) — plus SSR, which calls the coordinator directly and uses neither. `research/01 §Gaps 1`: which one is live on V's machine could not be determined without running it | **DEAD** — replaced by law L5, one transport. A safety hook that only fires on one of three paths is not a safety hook |

**Death list count: 11 entries** (10 surfaces + 1 seam).

**Adjacent dead weight the substrate found**, not on DR-048's list and therefore not
ruled here, but inside charter clause 4's aim — recorded so the orphan sweep (work
item W19) has a starting inventory: the dormant components `DebateTree.tsx`,
`ArgumentFocusView.tsx`, `DebateOutline.tsx` (imported by nothing, still containing
live calls, `research/01 §Gaps 3`); the consumer-less `lib/api.ts::listDebates`
(`§Gaps 4`); the front-end type slots `DebateDetail.scoring`, `DebateNode.lens`,
`DebateNode.score` that the backend never emits (`§Shapes 1–2`); and
`ScoringRefreshState`, which never leaves `idle` (`§7`).

---

## 4. The flex ledger

One row per honesty surface named in DR-048. Nine rows. Each gives: what the person
sees, the ruling that mandates it, the gap in today's interface (from the substrate's
battery-output landing map), and a proposed minimal shape. `DRAFT—V RULES` marks every
cell where a choice about what a person sees remains open — those are V's.

**All 29 lettered cells in this section carry
`DELEGATED — DR-064 (ruled against mockups at build)`**, as does register row D-1 in
section 3 — **30 counted decisions, all delegated**. The stamp appears once per row
rather than once per letter; it binds every lettered cell beneath it. What that changes:
none of the thirty blocks this mission's close. Each is decided in the UI build phase,
one review per flex surface, against a real mockup rather than a paragraph. What it does
**not** change: the consequence written under each option is settled work, and
architecture consumes those consequences now.

### 4.0 Two answer-surface states every row renders inside

Rulings from the coexistence and register sittings added two states the nine rows must
survive. They are not a tenth honesty surface; they are the frame the nine are drawn in.

- **Composed, or components-only + DEFECT.** `RULED(DR-049, DR-057)` Composition gets at
  most two attempts. The answer falls to **components-only** — verified facts, badges,
  the node graph, wearing a visible **DEFECT** badge — on any of three routes: a second
  conformance failure; the composed verdict failing its own post-composition R9 pass
  (`RULED(DR-057)`); or a fact bundle past the declared hard composition budget
  (`RULED(DR-058)`). None of the three opens a new loop.
- **In that state the sentence-shaped surfaces still appear — as data.**
  `RULED(DR-059)` The value **reversal point** and the **builds-on-previous disclosure**
  carry structured projection fields that render without composed prose. This is what
  closed the gap the previous draft recorded as C13: a degraded answer does not quietly
  drop its two hardest honesty surfaces, it serves them in fact form. Alongside it, the
  **replay-eviction** rule: a component number that fails replay is dropped from the
  component set and marked with a typed missing-number mark — the rest of the answer
  still serves. One number lost, never the answer.
- **Honesty fields are machine-injected, not composed.** `RULED(DR-058)` Long answers
  compose in passes by load-bearing priority, and the residual objections, badges and
  condition marks are written into the output structure by the machine, outside model
  discretion. For the rows below this is the guarantee that a badge cannot be lost to a
  summarization pass.
- **One answer, two labeled sections.** `RULED(DR-053)` A mixed empirical-and-value
  question is answered in two phases on one graph and served as one answer with two
  labeled sections — *"what is true"* and *"what follows given your values"*. Row 5's
  value markers live in the second section; rows 1–4 and 6–9 span both. The phase order
  is machine-enforced, so the sections' order is not a presentation choice.

---

### Row 1 — Typed abstention badges

**What the user sees.** Where the engine declines to answer — the whole answer or one
node — a badge naming **which kind** of decline it is, in the battery's words: *not
searched / searched and found nothing / measured and inconclusive / not runnable / a
value choice*. Beside it, the answer names its **abstention cell**: the question class,
the risk tier, and the price that governs how readily abstention was permitted. An
abstention badge and one or more **condition marks** (row 8) can appear together, and
mean different things: the abstention says *"I am not answering this"*; a mark says
*"I answered, wearing this."*

**Mandated by.** Battery Stage 10 (five typed abstentions, GLOSSARY); **DR-010** (price
= cost of abstaining ÷ cost of being wrong, strictly between 0 and 1); **DR-011** (the
price varies by class × risk-tier matrix, not flat); **DR-012** (*"Every served answer
names its cell"*); **DR-051** — the **partition law**: the five kinds apply **only to
ignorance-ledger unknowns**, every other typed state is a condition mark, one answer may
wear one abstention kind and several marks, and the mapping table is exhaustive so no
state falls between the two families; **DR-044 Q55** as amended by DR-051 (the model
chooses which of the five, the machine enforces exactly one *within that scope*);
**DR-020** (regeneration exhaustion produces a typed "not runnable" abstention with
rejection evidence); **DR-037** (five terminal routes code must enforce: inert stop,
false-assumption non-answer, value→human, NOT_EMPIRICALLY_DECIDABLE,
no-justification-no-split).

**Current-UI gap.** *"No landing place for a five-member typed abstention."* Absence is
expressed today through three incompatible closed vocabularies, none extensible without
a type change on both sides: per node `errors[].status` (2 members, pinned in both
`models.py` and `types.ts`) and `pending[].status` (1 member); per debate
`status ∈ {available, partial, unavailable}` plus a free-text `reason` the interface
**string-sniffs**; per verdict `verdictBand` (3 abstention-shaped members). Everything
funnels into `ScoringVisibilityKind`, a 6-member closed union. The one place a new kind
degrades gracefully is `VerdictBanner`, which renders an unknown band's raw string
rather than crashing — but it is debate-scoped, not per-node, **and it is gated behind
`NEXT_PUBLIC_VERDICT_FIRST_UI === "true"`, whose default could not be found anywhere in
the deployment** (`research/01 §Gaps 2`). Nothing on the wire carries a price, a class,
or a risk tier.

**Proposed minimal shape.**

```
abstention {
  kind          # CLOSED: the battery's five; scope = ignorance-ledger
                # unknowns only; exactly one within that scope (DR-051)
  reason_text   # display only, never parsed (L4)
  cell { question_class, risk_tier, price }   # DR-011/012
  unlock[]      # what would have to happen for this to become an answer
  evidence_ref? # e.g. DR-020's rejection evidence
}
```
Carried on the **Answer** and on any **Node**, alongside — never merged with — the
condition marks of row 8. Rendering follows L3: an unrecognized value shows its own
label rather than nothing, so a later enum extension degrades instead of disappearing.

**`DRAFT—V RULES`** · **`DELEGATED — DR-064 (ruled against mockups at build)`** — every lettered cell in this row is a counted decision, ruled against mockups in the UI build phase — (a) does the price cell show its number (`0.55`) or only its
words? (b) do node-level abstention badges appear on the canvas card, or only in the
drawer the user must open? (c) does the answer-level cell live in the verdict banner —
and if so, is `NEXT_PUBLIC_VERDICT_FIRST_UI` on in V3, or gone?

---

### Row 2 — Per-node provenance and ways-of-knowing (carrying DR-034's "show me why")

**What the user sees.** On every node: a label saying **how** this is known —
LOOKED_UP (found in a source), RAN (measured or executed), or REASONING (derived) — and
a one-click affordance that opens the recomputation trail behind every number on that
node. Nothing is served that cannot be opened this way.

**Mandated by.** GLOSSARY (ways of knowing, *"not interchangeable"*); defect **D4**
(provenance-blind serving); **DR-027** (execution ledger — raw judgments stored before
math with input and contract fingerprints; every served number replayable; everything
executed recorded and digest-visible); **DR-034** (REPLAY LAW — V3 permanently refuses
to serve a number it cannot recompute from its frozen records, **no model in the
replay**, plus a launch proof ceremony); **DR-040 Q22** (irreproducible output
auto-relabels REASONING); **DR-044 Q51** (locator gate, provenance join, reasoning-only
downgrade — all three **blocking**); **DR-021 knob 10** (the fallback label travels on
the answer *and in every node's provenance*).

**Current-UI gap.** *"Per-node in the tree there is no provenance slot at all"* — a
`DebateNode` carries only `active_generation.{model_id, worker_id, worker_name}`, i.e.
who generated the prose, not where the claim's warrant came from. Partial landing places
exist and none reaches a pixel: `items[].score_provenance` is the **single open-schema
field on the wire** (`extra="allow"`), ships on every scored node, and is absent from
`types.ts` and read by nothing; `items[].debug.judge_outputs` is typed on both sides and
rendered nowhere; `DebateDetail.provenance_records[]` is typed, served, rendered
nowhere. The one existing provenance *display* is the Scoring Diagnostics drawer, whose
rows are a hardcoded 16-entry array that already renders two literal
`"Not exposed by scoring API"` placeholders.

**Proposed minimal shape.**

```
node.knowing      # LOOKED_UP | RAN | REASONING   (closed)
node.provenance { produced_by, from_inputs[], locator, method, replay_handle }
<every served number>.provenance_ref   # L1: no unlabeled number
```
Each of these is a **projection** — a summary sufficient to render the badge and open
the trail. The trail itself, the full conformance record and the fact bundle sit behind
the authorized inspection/replay handle (L10, `RULED(DR-054)`), which is also the only
input the "show me why" affordance needs. That is what makes it uniformly available
rather than a per-screen feature — and it is why authorization, not layout, is the first
question about it.

**`DRAFT—V RULES`** · **`DELEGATED — DR-064 (ruled against mockups at build)`** — every lettered cell in this row is a counted decision, ruled against mockups in the UI build phase — (a) is the knowing-label a card badge or drawer-only? (b) does
"show me why" open a side panel, a dedicated route, or produce a downloadable trail?
(c) does the diagnostics drawer survive as the power-user view, or is it absorbed into
per-node trails? (d) **who is authorized** to open the inspection/replay handle —
DR-054 says "authorized" and DR-027 says the execution record is digest-visible *to the
user*; if the asker is not authorized for their own answer's trail, "show me why" is a
different feature for a different audience (contradiction C14).

---

### Row 3 — Defeaters as visible first-class attacks

**What the user sees.** Attacks drawn as **labeled arrows** into the claim they attack,
carrying a strength — not as a child in a list. Each node shows whether anyone has tried
to sink it: its defeater set is non-empty, or it is exhaustion-marked, or it wears
**UNFALSIFIED-AFTER-ROTATION**. Where the builder refused a cycle, the user is told:
*"circular dependency found"* is served information, with the shared crux it was
redirected to.

**Mandated by.** GLOSSARY (*a defeater is a first-class attack, not a footnote*);
**DR-022** as narrowed by **DR-035** (typed supports/attacks with strengths and per-node
uncertainty shapes — the labeled-arrow idea, and only that idea); **DR-030 J2** (ONE
GRAPH — the debate graph's nodes and typed edges *are* the structure the stages operate
on); **DR-041 Q26** (defeater generation is a system obligation routed to a
differently-categorized model; a node is complete only when its defeater set is
non-empty or exhaustion-marked); **DR-041 Q29** (at exhaustion the piece wears a visible
UNFALSIFIED-AFTER-ROTATION mark, degrading standing — never silent deletion, never
silent full citizenship); **DR-042** (loop-free by construction; the refusal is served);
**DR-056** (the cycle law is closed at *three* layers — construction refuses the
cycle-closing edge, compute raises a typed error, the write is rejected — so a cycle can
never reach the interface, and the redirect notice is the only cycle-shaped thing the
reader ever sees); **DR-032** (a working judge-disagreement flag that must demonstrably
fire).

**Current-UI gap.** *"No place to land as a first-class relation."* The tree carries only
hierarchy — `parent_id`, `children[]`, `materialized_path`; **"attack" is expressed
structurally as a `CON` child, not as a labeled defeat edge**. The coordinator's actual
attack/support graph lives in `coordinator/app/qbaf/` and is **never served**;
`debate_to_dict` emits no edges. The nearest carriers are node-local lists with no target
pointer: `fatal_flags[]` and `holes[]` (rendered), `judge_disagreements[]` and
`score_caps[]` (**served, never rendered**). The **only** cross-node pointer anywhere in
a scoring payload is `recommended_investigations[].target_node_id` — which the interface
does resolve and focus, so the mechanism for "click through to the node this points at"
already exists and works.

**Proposed minimal shape.**

```
answer.edges[] {
  from_node_id, to_node_id,
  relation,        # SUPPORTS | ATTACKS | DEFEATS | SHARED_CRUX  (closed; the exact
                   # arrow vocabulary is the manifest's OD-19, not this seat's)
  strength,
  provenance_ref
}
node.defeater_state   # OPEN | SATISFIED | EXHAUSTION_MARKED | UNFALSIFIED_AFTER_ROTATION
node.disagreement?    # DR-032's flag + the certainty downgrade it caused
```

**`DRAFT—V RULES`** · **`DELEGATED — DR-064 (ruled against mockups at build)`** — every lettered cell in this row is a counted decision, ruled against mockups in the UI build phase — (a) at first ship, does the canvas **draw** edges (a real graph
view, the largest component change in this document) or **list** them under each node
("attacked by: …", reusing the existing click-through)? (b) is
UNFALSIFIED-AFTER-ROTATION a badge on the node or a line in the answer's honesty strip?
(c) how prominent is the refused-cycle notice — it is information, but it is also
machinery talk.

---

### Row 4 — STALE and UNDER-REVIEW badges

**What the user sees.** An answer whose watched revision trigger fired, or whose review
clock has passed, is served **with a visible STALE or UNDER-REVIEW badge — never
silently**. The badge names what woke it and which nodes were re-assessed. An answer
revived from archive says so. When a prior answer is pulled into a new run, its badge
travels **inside** the memory sentence (row 9), not only in a footer.

**Mandated by.** **DR-015** (snapshot + wake + propagate: every node stamped
relevant-as-of spawn; machine wake-ups from watched revision triggers and class-based
TTL clocks; woken changes re-assess ancestors; *"fired-trigger or past-review answers
serve with visible STALE/UNDER-REVIEW badge, never silently"*); **DR-016** (retired =
archived with the full graph kept, auto-revived by the next query through staleness
review, nothing deleted).

**Current-UI gap.** No staleness concept exists on any served shape — no as-of stamp, no
trigger, no review clock. Worse, the interface is **architecturally incapable of
receiving one late**: `debateTerminal = complete || status === "failed"` **gates the
entire SSE effect** — once terminal, no stream is opened and no further refresh ever
happens without a page reload (`research/01 §7`); and scoring is fetched **exactly once
per debate id**, with no poll, no timer, and no SSE invalidation (`§A #6`). Both of those
are precisely the window DR-015 acts in. The debate-level `archived` status exists on the
wire and *"is never observed by the UI (all debate reads 404 on it)"* — which is the
opposite of DR-016's kept-and-revivable archive.

**Proposed minimal shape.**

```
answer.staleness { state, as_of, review_due_at, trigger?, affected_node_ids[] }
node.staleness   { state, as_of }
# state: FRESH | UNDER_REVIEW | STALE | ARCHIVED_REVIVED   (closed)
```
Plus law **E4**, the transport-neutral freshness invariant: **every read of, or
subscription to, an answer after a wake-up exposes that answer's current staleness
state.** The invariant is binding; the plumbing that satisfies it is the open cell below.

**`DRAFT—V RULES`** · **`DELEGATED — DR-064 (ruled against mockups at build)`** — every lettered cell in this row is a counted decision, ruled against mockups in the UI build phase — **(a) push or pull.**

- *Behavior in plain words.* An answer already served can go stale later. Someone has to
  notice: either the page is told (push) or the page asks (pull).
- *Consequence.* This decides whether a badge can appear **while the reader is looking**,
  and it decides where the cost lands — an always-open stream costs a held connection per
  open answer; a revalidating read costs one request per view.
- *Options.* **(1) Push** — the subscription survives terminality and staleness events
  arrive live. Trade-off: the answer can change under the reader's eyes mid-read, which
  is exactly what DR-015 wants for a watched trigger and exactly what makes a printed or
  quoted answer unstable; connection cost scales with open tabs. **(2) Pull** — every
  read revalidates, so the badge is always correct *when the page is opened* and never
  moves afterwards. Trade-off: a reader who leaves a tab open for an hour is looking at a
  stale badge with no signal; cheapest to build on the kept components. **(3) Pull with
  a lightweight liveness ping** — revalidate on view plus a low-frequency check that only
  ever *reveals a notice* ("this answer changed — reload to see it"), never mutating the
  rendered answer. Trade-off: two mechanisms to maintain; keeps the read stable while
  bounding the staleness window.
- *Recommendation (never authority).* Option 3: it satisfies E4 in both directions
  without letting an answer rewrite itself under a reader who is mid-sentence.

**(b)** does a STALE badge change the verdict's presentation (dim it, caveat it), or sit
beside it unchanged? *Consequence:* changing the verdict's presentation makes staleness
impossible to miss and impossible to quote out of context, but it also means the same
answer looks like a weaker answer without any evidence having changed.

---

### Row 5 — Value markers and reversal points

**What the user sees.** Every value-decided segment carries a marker naming **whose
weights** decided it — the owner who was asked, an organizational policy, or **nobody**
— and beside the claim, the **reversal point** in plain words: not *"we weighted speed at
0.6"* but *"A wins for any speed weight above 0.50; you would have to think speed is
worth less than half as much as cost to flip this."* The answer stays a full answer: a
value hinge is served as a conditional with its reversal, never as a value-choice
abstention.

**Mandated by.** **DR-017** (the Pareto trigger computes when values hinge; then FLOW A
**always** — serve the conditional plus the reversal point, *a FULL answer*; FLOW B one
optional swing question per real hinge; FLOW C opt-in standing profiles;
`weight_source ∈ {owner_elicited, org_policy, none}` **with no `default` member**; every
value-decided segment carries a visible marker naming whose weights; *"the machine never
has opinions"*); **DR-043** (model-proposed criteria must link to real evidence,
**rejected candidate criteria are served visibly**, and the asker may add criteria
through the steering menu); **DR-042 Q30**, **DR-030 J1** (one scoring engine, receipts
everywhere).

**Current-UI gap.** *"No place to land."* `NodeScores` is a **closed 8-key float record**
pinned identically in `models.py` (with 0..1 field validators) and `types.ts` — there is
no companion structure naming *which value* a weight expresses or why. `score_caps[]` is
the only field family on the wire that names **why a number moved** — and it is served
and never rendered. `DebateLean {source, pct, label}` is the only debate-level
which-way-and-how-much marker, with a closed 2-member `source` union and a hardcoded
2-entry tooltip table. And `SynthesisPanel` renders exactly four `provenance` sections
**by hardcoded key** — any other key in `synthesis.provenance` is silently dropped, which
is the exact failure mode a new value block would hit if it were smuggled in there.

**Proposed minimal shape.** The hinge overlay, one record per hinge
(`research/32-weight-derivation.md` §"The overlay record"):

```
value_hinge {
  hinge_node_id, criteria[], option_vectors, pareto_set[],
  weight_source,          # owner_elicited | org_policy | none   (no "default")
  weight_vector | null,   # null is a first-class, serviceable state
  owner | null, scope, as_of,
  reversal,               # the boundary, plus its plain-language statement
  band_under_weight, band_under_alternative,
  rejected_criteria[],    # DR-043 guard 2
  elicitation_trace
}
```
The interface renders two things minimally: the marker (*"decided by weights you
supplied"* / *"…by org policy"* / *"…by nobody — here is the conditional"*) and one
reversal sentence beside the claim. Under DR-053 both live in the answer's second
section, *"what follows given your values"*.

**`DRAFT—V RULES`** · **`DELEGATED — DR-064 (ruled against mockups at build)`** — every lettered cell in this row is a counted decision, ruled against mockups in the UI build phase — (a) FLOW B's single swing question: modal, inline prompt under the
claim, or an item in the steering menu? *Consequence:* a modal interrupts and gets
answered; an inline prompt is ignorable and keeps the conditional intact, which DR-017
says is already a full answer. (b) does a **live weight toggle** ship (the reader moves
the weight and watches the band change) or two bands side by side? *Consequence:* a
toggle shows the reader that the conclusion is *theirs*, but every position they drag to
is a served number that L1 and L2 then owe provenance and replay for; two static bands
owe two. (c) are rejected criteria visible by default or on demand? *Consequence:*
DR-043 requires them served; default-visible makes the model's discarded thinking part
of the answer's bulk, on-demand risks them being served-but-unseen, which is the exact
D4-shaped failure this pack keeps finding.

**(d) who writes the reversal sentence.**

- *Behavior in plain words.* The reversal point is a number ("A wins above 0.50"). The
  reader gets a sentence. Either the composition model writes that sentence, or the
  machine fills a fixed template from the boundary.
- *What is already settled, so this cell does not decide it.* `RULED(DR-059)` The
  reversal point has a **structured projection field that renders without composed
  prose**. It cannot go missing in degraded mode. This cell is therefore about the
  *reading experience* on top of a guaranteed fact, not about whether the fact survives.
- *Consequence.* Three things still differ. **Replay:** a templated sentence is
  recomputable from frozen records with no model in it; a composed one is replayable only
  as stored composition data (DR-060b). **Conformance:** a composed sentence is judged if
  it is load-bearing text, and sampled if it is not (DR-060a), spending judge attention on
  a sentence whose underlying facts are already exact; a templated one has nothing to
  judge. **Readability:** a template will read stiffly across the full range of criteria
  shapes, and DR-044 rejected pure render precisely because stiff serving "defeats the
  purpose of our design".
- *Options.* **(1) Composed prose over the projection** — best reading, costs judge
  attention, and in degraded mode the reader falls back to the bare projection field.
  **(2) Templated only** — one rendering everywhere, nothing to judge, reads like a form.
  **(3) Projection fact line always + composed gloss beside it** — the boundary statement
  renders from the field in every mode; the composition model may add one explaining
  sentence, dropped in degraded mode. Trade-off: two renderings to keep consistent, which
  the conformance judge then has to catch when they drift.
- *Recommendation (never authority).* Option 3 — the reversal point is, per the
  weight-derivation research, the only part of the value overlay a stranger can
  independently test, and DR-059 already guarantees its fact form; the gloss is the part
  worth spending prose on.

---

### Row 6 — Investigate-deeper

**What the user sees.** Where a gap blocks a claim — the flagship case being the typed
**UNINSTRUMENTED** verdict, which *blocks the fairness claim* rather than degrading it —
the reader gets the block stated plainly, plus a **"close this gap"** affordance. Behind
it: a machine-constructed prompt aimed at the next model, an optional box for the reader's
own input, and the model's account of **why** the gap exists with a grade of the effort
so far — all served **openly marked as model-authored and biased**, never replacing the
verdict.

**Mandated by.** **DR-045** (the machine diff over already-owed telemetry, two ledger
stamps, and the typed UNINSTRUMENTED verdict that blocks the claim; *plus V's remediation
layer* — a model explains why the gap exists, grades the effort, suggests closure, all
served openly marked; *"the reader gets an investigate-deeper affordance (UI ticket 16
consumes) that closes gaps via constructed prompts (LLM-built prompts for next LLMs) +
optional user input"*); **DR-019** (steering = menu **and** free-text annotations, every
annotation logged verbatim, typed as human-steer input, disclosed in the served trail).

**Current-UI gap.** The nearest ancestor is `POST .../scoring/manual-investigations`,
**fully implemented server-side and hard-disabled in the interface** via
`manualInvestigationActionState(action, {runFlowWired: false})` — a button that exists,
is wired to a real endpoint, and is deliberately switched off. The flow that does run is
the dry-run/approval pair, whose approval response has three honest shapes gated on a
deployment flag, and whose server-side cap is 3 expansions. Nothing anywhere carries a
constructed prompt, a user input field, an effort grade, or a model-authored marker. The
one working ingredient is `recommended_investigations[]` with its `target_node_id`, which
the interface resolves and focuses.

**Proposed minimal shape.**

```
investigation {
  gap_id, subject_ref,
  verdict,              # UNINSTRUMENTED is a condition mark (DR-051)
  blocks_claim: bool,   # DR-045: the block is the point
  remediation {
    authored_by: MODEL, marked_biased: true,      # never optional
    why_text, effort_grade, proposed_prompt
  },
  accepts_user_input: bool
}
# execute → typed job + replay_handle;  user input → steering record (DR-019)
```

**`DRAFT—V RULES`** · **`DELEGATED — DR-064 (ruled against mockups at build)`** — every lettered cell in this row is a counted decision, ruled against mockups in the UI build phase — (a) is the constructed prompt shown **verbatim** before it runs
(honest, but it is machinery on the screen), summarized, or hidden behind a disclosure?
*Consequence:* verbatim lets the reader see what will be asked in their name and edit it;
it also puts internal prompt material on screen, which L10 excludes from the default
view — so "verbatim" here means *this* prompt, not the composition prompt behind it.

**(b) what shape the reader's own input takes.**

- *Behavior in plain words.* DR-019 already settled the *authority* question: steering is
  a menu **and** free-text annotations, every annotation logged verbatim, typed as
  human-steer input, disclosed in the served trail. Nothing about that is reopened here.
  What remains is where that binding pair appears inside the investigate-deeper flow, and
  whether *this* affordance offers both.
- *Consequence.* Free text is the only way a reader can say something the menu did not
  anticipate — which is the whole point of a gap-closing affordance — but a free-text
  string that becomes part of a machine-constructed prompt is untyped input reaching a
  model, and it is disclosed verbatim in the served trail, so a reader who writes
  carelessly has published it.
- *Options.* **(1) Both, inline** — menu suggestions plus a free-text box on the gap
  itself. Trade-off: fullest expression, most exposure; the disclosure obligation must be
  visible *at the box*, not in a footer. **(2) Menu here, free text in the general
  steering panel** — the gap offers structured options; anything else routes to the
  panel that already exists. Trade-off: preserves DR-019 whole while keeping the
  gap-closing flow narrow; costs a context switch at the moment of intent. **(3) Both,
  with the annotation shown back before it is sent.** Trade-off: one extra step; makes
  the verbatim-logging consequence concrete before it is irreversible.
- *Recommendation (never authority).* Option 3 — DR-019's verbatim-logging law is a
  consequence the reader should meet before it binds, not after.

**(c)** how is "model-authored and biased" rendered so it cannot be mistaken for the
verdict — a distinct block, a colour, a prefix? *Consequence:* DR-045's entire safety
property is that the remediation never substitutes for the verdict; if the two render
alike, the ruling is satisfied on the wire and defeated on the screen.

---

### Row 7 — UNDER-EXPLORED

**What the user sees.** A distinct marker on branches that have been starved of attention
— *"we barely looked here"* — visibly different from a branch that was examined and set
aside. It is a signal, never a reason to retire anything on its own.

**Mandated by.** **DR-016** (*"V's isolation signal = distinct UNDER-EXPLORED marker on
attention-starved branches, never a retirement cause alone"*).

**Current-UI gap.** No attention or exploration measure exists on any served shape. The
nearest thing is the dry-run item's `pressure ∈ low|medium|high` with `expansion_hint` —
but that is **expansion candidacy** (should we grow here?), a different fact from
attention starvation (did we ever look here?). The set-aside vocabulary that does exist —
`path_status ∈ active|abandoned`, `stopping_status ∈ active|stop|abandon`,
`stopping_reason_human` — is collapsed by `renderStateOf` into 7 render states and
surfaces as the drawer's "Stopped path". An UNDER-EXPLORED marker rendered through that
path would read as "we decided against this", which is the opposite of what DR-016 means.

**Proposed minimal shape.**

```
node.exploration { state, basis }   # EXPLORED | UNDER_EXPLORED   (closed)
```
Held **separately** from `defeater_state` (row 3) and from stop/abandon status — three
different facts that must not share a badge.

**`DRAFT—V RULES`** · **`DELEGATED — DR-064 (ruled against mockups at build)`** — every lettered cell in this row is a counted decision, ruled against mockups in the UI build phase — (a) does it read as a warning (the reader should distrust this
branch) or as a neutral note (the engine is telling on itself)? (b) does the marker
appear on the branch root only, or on every node under it? (c) the threshold is
machine-derived and DR-016's `N` values are provisional by design — does the marker show
the basis (*"3 of 40 attention units"*) or only the state?

---

### Row 8 — SKIPPED-BY-BUDGET and fallback labels (the condition marks)

**What the user sees.** The run's **cost envelope** and where it stands. Wherever an
enrichment step was dropped because the budget ran out, a visible **SKIPPED-BY-BUDGET**
mark naming what was skipped; where the envelope ran out entirely, the answer stops on
already-verified components wearing **ENVELOPE_EXHAUSTED** — never a silent timeout.
Wherever an unresolved type or field was auto-served under the fallback rule, a **label
travels on the answer and in every node's provenance**. And a guarantee stated where the
reader can see it: the **protected core** — provenance, abstention typing, blind
verification at standard tier and above, citation routes, and serve-conformance — is
**never** budget-skippable.

**Mandated by.** **DR-021 knob 9** (budget override = typed skip **for enrichment only**;
*"every skip carries a visible SKIPPED-BY-BUDGET marker"*); **DR-021 knob 10** (visible
fallback for an unresolved type/field = **auto-serve with label**, no approval step;
*"the label travels on the answer and in every node's provenance"* — V chose this over
asker-approval knowingly); **DR-052** (every run gets a **visible** envelope derived from
asker depth × risk tier; exhaustion goes typed-enrichment-skips first, then a hard stop
serving already-verified components with ENVELOPE_EXHAUSTED; the protected core gains
serve-conformance); **DR-051** (all of these are **condition marks** — a closed enum,
servable in parallel with each other and with an abstention); **DR-050**
(LEVERAGE_UNRESOLVED: after the one permitted halt-and-deepen round per parent, the
answer carries a visible residual naming the carrying piece and its verification
thinness); **DR-041** (DEGRADED DIVERSITY); **DR-014** (*"independent critique
unavailable"*, with its reason and lift path); **DR-055** (multi-maker critique is a
**launch gate** for standard-and-above tiers — so a DEGRADED-DIVERSITY or
critique-unavailable mark at those tiers now signals *labeled degraded operation*, not
normal operation); **DR-009** (off-subject share named, downgrade visible at serving);
**DR-008** (search-term amendments logged with type and reason, visible at serving).

**Current-UI gap.** No budget, cost, skip, or fallback vocabulary exists anywhere on the
wire — and no envelope concept at all, so there is nothing to render a cost meter from.
The nearest fields are on the scoring payload — `truncated?`, `skipped_node_count?`,
`max_nodes?` — and the substrate lists `max_nodes` explicitly among the fields *"served
but never rendered by any mounted component"*; `pending[]` is *"indexed into a map that
nothing consumes"*. There is no per-node channel for a label to travel in at all
(row 2's finding), which is precisely what knob 10 requires.

**Proposed minimal shape.**

```
condition_marks[] {              # the DR-051 enum; replaces this document's
  mark,                          # earlier "execution_marks" proposal
  scope,      # answer | node_id
  subject,    # what was skipped, labeled or degraded
  reason,
  lift_path?  # DR-014's recorded lift condition
}
answer.envelope { budget_basis, consumed, state }
# state: WITHIN | ENRICHMENT_SKIPPED | EXHAUSTED   (DR-052)
```
Answer-level list, echoed into each affected node's provenance (knob 10's "travels" is
literal: two places, not one). Marks and abstentions render as separate families (row 1).

**`DRAFT—V RULES`** · **`DELEGATED — DR-064 (ruled against mockups at build)`** — every lettered cell in this row is a counted decision, ruled against mockups in the UI build phase — (a) answer-level presentation: a persistent honesty strip, a
footer, or per-node badges only? *Consequence:* a strip is unmissable and makes every
answer look caveated; a footer is missable, which for ENVELOPE_EXHAUSTED means a reader
can mistake a truncated answer for a complete one. (b) is the never-skippable guarantee
stated on every answer, or only when a skip occurred? *Consequence:* always-on teaches
the reader what the engine will never trade away — and becomes wallpaper; on-demand is
read, and is absent exactly when nothing went wrong, which is when trust is built.
(c) do the confidence-bearing marks (DEGRADED-DIVERSITY, critique-unavailable —
now signalling **degraded operation** at standard-and-above under DR-055's launch gate)
share this strip, or get their own treatment beside the verdict? *Consequence:* they cap
the confidence band under DR-014, so placing them with budget skips puts a
confidence-capping fact in the housekeeping area. (d) is the cost envelope shown as a
live meter, a number, or only on exhaustion? *Consequence:* a live meter makes cost a
thing the reader watches and may optimize against; showing it only on exhaustion means
the first time cost is visible is the moment the answer got cut short.

---

### Row 9 — Builds-on-previous disclosure

**What the user sees.** When an answer reuses a previous session, a sentence saying so —
carrying **what was reused**, **how this question differs from the earlier one**, and the
earlier answer's own staleness badge **inside that sentence**. A control to sever the
link. And the non-obvious half: when a candidate prior run was found and **not** linked,
that is disclosed too, so the reader can tell *"no history exists"* from *"history exists
and was judged too weak to use"*.

**Mandated by.** **DR-044 Q61** (HYBRID plus V's cross-run memory mechanism: the machine
checks whether keywords or topic were seen before and pulls prior-session data, the model
interprets; mechanism detail from research ticket 34); **DR-027** (everything executed is
recorded and digest-visible — a candidate found and not linked *is* an executed action);
**DR-015** (the staleness badge travels with the pulled answer).

**Current-UI gap.** Nothing on the wire refers to another run at all. The only
cross-run-shaped fields are `branch_lineage[]` and
`synthesis.upstream_agent_output_ids[]` / `upstream_agent_run_ids[]` — all typed, all
served, all **rendered nowhere**. `DebateDetail.derivation {claimType, markers[],
lensSet[], source?}` is a debate-level record of how the answer was derived that is
served and rendered nowhere (and whose `source` field is not even in the front-end type).
There is no sentence slot, no unlink control, and no negative-disclosure concept.

**Proposed minimal shape** (`research/34-cross-run-memory.md` §1.8):

```
memory_disclosure {
  matched, tier, relation, decided_by,
  prior { run_id, question_line, answered_at, verdict, confidence_band,
          staleness_state },
  agreed_fields[], disagreed_fields[],      # the difference statement
  payload_pulled[],
  candidates_found_not_linked[],
  unlink_control: true
}
```
With three blocking checks on the composed sentence: no memory sentence without
`matched: true`; the tier **and the difference** must survive into the served text when
the relation is not identity; the staleness badge travels inside the sentence. And
`RULED(DR-059)`: the disclosure also has a **structured projection field that renders
without composed prose**, so in components-only mode the reader still learns that this
answer leaned on an earlier one, and how the two differ — as data rather than as a
sentence. The three checks govern the prose; the projection is what survives without it.

**`DRAFT—V RULES`** · **`DELEGATED — DR-064 (ruled against mockups at build)`** — every lettered cell in this row is a counted decision, ruled against mockups in the UI build phase — (a) is the negative disclosure (found-but-not-linked) always shown
or on demand? *Consequence:* always-shown is the only way a reader can tell "no history"
from "history judged too weak", which is the whole point of the negative half; on-demand
means a Type-II miss stays invisible and uncorrectable. The research seat argues always;
the packet records it as an explicitly unruled question.

**(b) what the unlink control actually does.**

- *Behavior in plain words.* The answer says it built on an earlier run. The reader
  disagrees — those questions are not the same. They sever the link. The question is what
  happens to the material already pulled in.
- *Consequence.* This is a correctness question wearing a UI control's clothes. Facts
  from the prior run may already be *inside* this answer's graph: pulled payload, reused
  nodes, a verdict that leaned on them. Detaching only the sentence leaves those facts
  in place while removing the disclosure that they are there — which converts an honest
  answer into an undisclosed one, the exact D4 shape. That failure mode is the decision.
- *Options.* **(1) Immediate re-run** — severing invalidates the answer and the run
  restarts without the prior. Trade-off: always correct; costs a full run against the
  envelope (DR-052) and the reader loses the answer they were reading. **(2) Mark for
  re-run** — the link is severed, the answer is immediately badged as depending on a
  severed prior, and the re-run is queued or offered. Trade-off: honest in the interim,
  but the reader is now holding an answer nobody stands behind. **(3) Detach the
  disclosure only** — forbidden under any reading of DR-027 and L1 unless the machine can
  prove no pulled payload entered the graph; where it can prove that, option 3 collapses
  into "there was nothing to sever but a sentence", which is safe and cheap.
- *Recommendation (never authority).* Option 2 as the general case, with option 3 as an
  automatic fast path exactly when `payload_pulled[]` is empty. Option 1 only if V wants
  severing to be a heavyweight, deliberate act.

**(c)** does the disclosure sit above the answer (context first) or below it (result
first)? *Consequence:* above means every reader meets the engine's history before the
answer; below means the disclosure is read by the people who read to the end.

---

## 5. UI work items for the V3 program

Scoped to the interface. Dependency-ordered: an item may start when everything it lists
is done. Sizes are relative, not estimates.

**Phase 0 — before any interface code**

| # | Item | Depends on | Size |
|---|---|---|---|
| **W1** | ARCHITECTURE freezes the native contract's resource vocabulary and encoding from §1.2–§1.4 (endpoints, not requirements). **Its two former cross-artifact blockers are satisfied**: the restatement schema is ratified (DR-061, `OD-S-06`) and the verdict model's names and per-cell principle are ratified (DR-063, `VR-2`/`OD-C-01`) — only the verdict **thresholds** remain, and they are numbers inside a ruled shape, deferred to the flag register (DR-023), so the resource fields can freeze now | this document, accepted | — |
| **W2** | **Mockup review — a build-phase gate, not a closure blocker for this mission** `RULED(DR-064)`. The counted register is **30 decisions**: the 29 `DRAFT—V RULES` cells across the nine flex rows plus **register row D-1** (§3). V rules each against an actual mockup during the UI build, one review per flex surface (DR-048's *"each V-approved"*). Every stamped cell is in that count; none is stamped and uncounted. Items below name it as a dependency for their *shape*, never for their start | the UI build phase | — |

**Phase 1 — the data-layer rebuild (DR-048's core)**

| # | Item | Depends on | Size |
|---|---|---|---|
| **W3** | Author V3's front-end types **from the native contract**; delete the V2 wire mirror rather than migrating it. Kills all dead slots by construction (L6). The two type shapes that were previously unfreezable are now ruled — `stranger_restatement` (DR-061, `OD-S-06`: node fields plus verdict-only `action_consequence`, plus `check_status`) and the verdict states (DR-063, `VR-2`) — so no type in this item waits on another artifact | W1 | L |
| **W4** | Rebuild the fetch layer (browser + SSR) on **one transport** (L5), with a typed error taxonomy — including 429, which today throws body text as a generic `Error` — and typed auth failure, replacing the substring match on `"401"`/`"403"`/`"invalid user token"` (L4, L8) | W3 | M |
| **W5** | Dissolve the scoring join: scores arrive on the node. Deletes `indexScoringResponse`, the 6-bucket visibility fold, the free-text sniffing, and `ScoringRefreshState` | W3, W4 | M |
| **W6** | Rebuild the event-stream client against a declared vocabulary with **zero ignored events** (E1–E3), and implement the **E4 freshness invariant**: after a wake-up, every read or subscription exposes the answer's current staleness state. The invariant is buildable now and waits on nothing; the *transport* that carries it (push, pull, or pull-plus-ping) is specialized once row 4(a)'s mockup review lands. Either way the `debateTerminal` gate cannot survive as-is, because it satisfies neither architecture | W3, W4 (invariant); **mockup review** for row 4(a) to specialize | M |
| **W7** | Retire and re-author the contract tests: 35 of the 50 `.mjs` test files assert against interface **source text**, and the substrate warns that *"any flex of the UI contract will trip a substantial subset"* — their assertions were inventoried by filename only, so the first task is reading them | W3 | M |

**Phase 2 — the nine honesty surfaces.** Item numbers are identifiers; the table order is
the dependency order.

| # | Item | Flex rows | Depends on | Size |
|---|---|---|---|---|
| **W20** | **Answer-surface states** (§4.0): render *composed* versus *components-only + DEFECT* `RULED(DR-049, DR-057, DR-058)` — including the verdict-R9 and budget routes into it — the degraded-mode **projection fields** for the reversal point and the builds-on-previous disclosure, and the typed missing-number mark from replay eviction `RULED(DR-059)`; plus the two labeled sections of a mixed answer `RULED(DR-053)`. Every later Phase-2 item must render inside both states, so this comes first. **Fully ruled — no mockup dependency for its behavior** | frame for all nine | W3, W5 | M |
| **W8** | **Node envelope**: ways-of-knowing label, per-node provenance, per-number provenance references, and the "show me why" affordance — including the **authorization gate** on the inspection/replay handle (L10) | 2 | W3–W5, W20; **mockup review** for row 2's cells | L |
| **W9** | Typed abstention rendering on answer and node, as a family separate from condition marks (DR-051), with raw-label fallback (L3) and the abstention cell line | 1 | W8; **mockup review** for row 1's cells | M |
| **W10** | **Edges become visible**: the graph gains labeled arrows with strengths; defeater state and disagreement flag on the node. The largest component change in the program, and the one most sensitive to W2's draw-vs-list ruling | 3 | W3; **mockup review** for row 3's cells — the draw-vs-list pick sizes this item | XL |
| **W11** | Staleness badges (STALE / UNDER-REVIEW / revived) and the UNDER-EXPLORED marker, kept visually distinct from stop/abandon | 4, 7 | W6; **mockup review** for rows 4 and 7 | M |
| **W12** | **Condition marks** (DR-051's enum): SKIPPED-BY-BUDGET, fallback labels, DEGRADED-DIVERSITY, LEVERAGE_UNRESOLVED and the rest — answer-level and echoed in node provenance | 8 | W8; **mockup review** for row 8 | S |
| **W21** | **Cost envelope display** `RULED(DR-052)`: the run's visible envelope and its state, the ENVELOPE_EXHAUSTED stop, and the protected-core statement. Separate from W12 because it is a *live run* surface, not a post-hoc mark | 8 | W12; **mockup review** for row 8(d) | S |
| **W13** | Value hinge marker and reversal sentence beside value-decided claims; rejected criteria surfaced | 5 | W3; **mockup review** for row 5 | M |
| **W14** | Investigate-deeper: replaces the hard-disabled manual-investigations button and repoints the dry-run/approval panel; constructed-prompt preview, optional user input, model-authored marking | 6 | W8, W9; **mockup review** for row 6 | L |
| **W15** | Builds-on-previous disclosure, with the prior answer's staleness badge inside the sentence and the negative disclosure | 9 | W11; **mockup review** for row 9 | M |

**Phase 3 — the surrounding surfaces**

| # | Item | Depends on | Size |
|---|---|---|---|
| **W16** | Ask/compose surface: typed run parameters, **risk tier** (new required input — DR-012's cell has no value without it), decision owner, scope, `as_of`, and the steering menu with verbatim free-text annotations (DR-019) | W4 | M |
| **W17** | Settings and fleet: rebuild against V3's freshly-drawn register (DR-023); split the settings-as-token-probe hack into a real identity surface; add the model scorecard / model ledger read (DR-046) | W4 | M |
| **W18** | Export and digest: composed text (or the components-only rendering plus its DEFECT badge), serve state, honesty projections, and the execution-ledger digest (DR-027) — an export that drops the honesty surfaces is not the answer | W8, W12, W20 | S |
| **W19** | **Orphan sweep** under charter clause 4 (DR-047): the dormant components, the consumer-less client, the dead type slots, and any surface left without a caller after W3–W18. Ends with a reachability check that fails the build on an orphan. Its **scope** is register row D-1's to set | W3–W18; **mockup review** for D-1 | S |

**Reading the shape of this list.** Three items dominate: **W20** (the answer-surface
states), because everything else must render inside both of them; **W8** (the node
envelope), which four flex rows hang their badges off; and **W10** (edges), which is where
"keep the components" is most strained — a canvas that draws typed arrows is not the
canvas that exists.

**What blocks what, after DR-064.** No item here waits on this mission. The behavior of
every item is ruled; what the mockup review supplies is the *shape* of the nine flex
surfaces — where a badge sits, whether edges are drawn or listed, whether a meter is
live. Two items carry no mockup dependency at all and can start first: **W6**'s freshness
invariant and **W20**'s serve states, both fully ruled. The rest can be built to their
ruled behavior and dressed when their surface's mockup review lands — which is exactly
what DR-064 intends by *"architecture consumes their consequences, not their shapes"*.

---

## 6. Contradictions surfaced (recorded, not resolved)

Per the packet's discipline, this artifact records conflicts and leaves them to V and the
review lenses. IDs are stable across revisions: a withdrawn entry keeps its number and
says why, so a reader who met it in the previous draft can find its disposition. Every
entry below was re-verified against the current ledger, the current sibling artifacts and
the current GLOSSARY on 2026-08-05.

| # | State | One line |
|---|---|---|
| C1 | **withdrawn** 08-04 | The three "missing" DR rows exist; claim was false |
| **C2** | **open** | Ticket 16's guard and its exhaustive-ledger amendment vs the ruling that closed it |
| C3 | **narrowed** 08-04 | GLOSSARY repaired; race-shaped residue survives only in the map's index rows |
| C4 | **deleted** 08-05 | Manifest now attributes knob batch 3 to DR-021 explicitly |
| **C5** | **open** | "Components kept" vs nine surfaces the components cannot render |
| **C6** | **open** | The kept interface satisfies neither push nor pull |
| C7 | **closed** 08-04 | DR-051's partition law |
| **C8** | **open** | The verdict-first flag's default is undiscoverable |
| C9 | **moved** 08-04 | Became register row D-1 |
| **C10** | **open (narrowed)** 08-05 | Verdict model ruled (DR-063); the confidence-band axis question stays open inside it |
| C11 | **closed** 08-05 | DR-061 ratified `OD-S-06` — verdict-only action consequence |
| C12 | **deleted** 08-05 | DR-051's ellipsis is gone; the spec's mapping table is the closure |
| C13 | **closed** 08-05 | DR-059 — degraded-mode projection fields + replay eviction |
| **C14** | **open** | "Authorized" (DR-054) vs "digest-visible to the user" (DR-027) |
| C15 | **closed** 08-05 | DR-060(a) — judged vs sampled are two served facts |

**Six open** (C2, C5, C6, C8, C10, C14), **eight fully disposed** (C1, C4, C7, C9, C11,
C12, C13, C15), and **C3 surviving only as a narrowed note** about `wayfinder/map.md` —
an index file, not a spec-pack artifact. None of the six blocks this artifact's contract:
C2 and C5 are scope tensions a builder can read around, C6 and C8 are named work inside
W6 and W9, and C10 and C14 are single unresolved questions sitting inside otherwise-ruled
shapes.

**C1 — WITHDRAWN (2026-08-04). The claim was false.** The previous draft said DR-021,
DR-044 and DR-047 had no rows in the decisions ledger. **Re-verified against the current
ledger: all three exist as distinct rows** — DR-021 (knob batch 3), DR-044 (serve-
composition), DR-047 (race retired, quality charter, no orphaned modules). The earlier
draft predated the ledger repair and was teaching a wrong lookup path. Every DR citation
in this document has been re-resolved against the current ledger.

**C2 — Ticket 16's guard and amendments versus the ruling that closed it.** The ticket's
standing Guard says *"flex is for outputs the old contract GENUINELY can't express — the
default is adapt, not redesign"*, and its Codex F6 amendment requires a per-output
outcome vocabulary (`AS_IS | ADAPT | FLEX | DROP | NOT_UI_EXPOSED`) that is
*"EXHAUSTIVE: derived from the 71-row matrix (05) × the surface inventory (01)"*. DR-048
instead flexes **all nine** honesty surfaces, rebuilds the data layer wholesale, and
names no per-row outcome ledger. DR-048 states it *"supersedes DR-002's adapter-implied
caution; strengthens it"* — but the ticket's guard text and the F6 exhaustiveness
requirement are still live in the ticket and are not addressed by the ruling's
`supersedes` field. This artifact follows DR-048.

**C3 — NARROWED (2026-08-04). The authority chain is repaired; index residue remains.**
The previous draft said the GLOSSARY still described the race and golden vectors as live.
**Re-verified: it does not** — the GLOSSARY now reads *"The race — RETIRED (DR-047)"* and
*"Golden vectors — SUPERSEDED (DR-033)"*, and the ledger's DR-025 and DR-026 carry
explicit overtaken-clause notes while DR-047's `supersedes` field names DR-033 part 2's
race-arm language. That half of the finding is withdrawn. What is still true, and is not
this seat's file: `wayfinder/map.md` keeps race-shaped index rows — the D-GREENFIELD note
still says *"the race's teeth freeze in ticket 15"*, ticket 15's row is still listed
`BLOCKED` though the ticket is `resolved` under DR-047, and the fog and out-of-scope
sections still carry race-harness items. A stranger reading the map before the GLOSSARY
still meets the retired story as if it were live.

**C4 — DELETED (2026-08-05). Re-verified; the pack half is fixed.** The finding was that
the sibling manifest and a research asset attributed knob batch 3 to DR-030 rather than
DR-021. **The current manifest corrects it explicitly** — its §13.2 states that budget
override, visible fallback, per-run ownership and the measurement quota *"are DR-021's,
not DR-030's; the previous draft misattributed"* — and its knob-9 and knob-10 clauses now
carry `RULED — DR-021`. The remaining hit is in a frozen research asset, which is a
historical input rather than a pack artifact, and the ledger's DR-021 row is the
authority either way. Nothing in the pack disagrees; the entry is withdrawn.

**C5 — "Components and UX are kept" versus nine flexed honesty surfaces.** DR-048 keeps
the interface's components and user experience while mandating nine new honesty surfaces
that, by the substrate's own findings, cannot be rendered by the components as they
stand: *"the canvas card itself has no long-form text slot"*; `NodeScores` is a closed
8-key float record pinned on both sides; the tree carries no edges; `SynthesisPanel`
renders four provenance sections by hardcoded key and silently drops the rest. No ruling
draws the line between "the kept component" and "the flexed surface". Work items W8 and
W10 sit exactly on that line.

**C6 — The kept interface cannot satisfy the freshness invariant unchanged.** Rows 4 and 9
require badges that are correct *after* an answer is finished. The kept interface closes
its stream permanently at terminality and fetches scoring exactly once per debate id with
no invalidation, so it satisfies **neither** push nor pull. E4 is now transport-neutral,
which removes the artifact's own overreach but not the underlying conflict: DR-015
mandates the badge, DR-048 says the components are kept, and no architecture that leaves
`debateTerminal` as-is can honor both.

**C7 — CLOSED by DR-051 (2026-08-04).** The previous draft flagged a collision between
the battery's five abstention kinds and the typed states minted since. The **partition
law** settles it: the five kinds apply only to ignorance-ledger unknowns; every other
typed state — UNINSTRUMENTED, UNFALSIFIED-AFTER-ROTATION, SKIPPED-BY-BUDGET,
DEGRADED-DIVERSITY, AMBIGUOUS_ATTRIBUTION, ENVELOPE_EXHAUSTED, LEVERAGE_UNRESOLVED —
belongs to a closed **condition-marks** enum, servable in parallel, with an exhaustive
mapping table so residue is impossible by construction. One answer may wear one
abstention kind and several marks. This artifact renders the two as separate families
(row 1, row 8). What remains open about the enum's *membership* is a different finding:
see C12.

**C8 — An honesty surface behind an undocumented flag.** The one place in the kept
interface where an unknown typed value degrades gracefully — `VerdictBanner`'s raw-band
fallback — is gated on `NEXT_PUBLIC_VERDICT_FIRST_UI === "true"`, whose default the
substrate could not find in `deploy/`, `web/package.json`, `next.config.mjs`, or any
launchd plist: *"the verdict banner may be dark in the current deployment"*. Rows 1 and 4
put content in or beside that banner. Whether V3 keeps the flag, defaults it on, or
deletes it is unruled.

**C9 — MOVED to the counted register (2026-08-04).** The death list's scope was a V
decision recorded outside the register, which meant it could be lost at handoff. It is
now **register row D-1** in section 3, written to the four-part template and counted in
W2's 30 decisions. It is no longer carried here as a contradiction.

**C10 — NARROWED (2026-08-05). The model is ruled; one axis question inside it is not.**
The previous draft said there was no canonical verdict model and pointed at the GLOSSARY
as its future home. Both halves needed correcting. **The model is now ruled**: DR-063
ratified `VR-2`/`OD-C-01` — served states **SUPPORTED / CONTESTED / UNSUPPORTED**,
thresholds **per question class × risk tier**, a typed abstention kept a separate thing
entirely and never a band — with every threshold **number** deferred to V's flag-register
ratification (DR-023), which is a numbers-inside-a-ruled-shape deferral, not an open
shape. **The pointer was also wrong**: the model lives in the quality charter's `VR-2`,
and the GLOSSARY defines neither term today. What genuinely remains open is the question
that ruling names as open inside itself: **whether "confidence band" is a second axis, an
alias, or a derived presentation of the verdict band.** DR-014 caps one of them and no
artifact says which — so this interface can render the band and cannot yet say what a cap
does to it.

**C11 — CLOSED by DR-061 (2026-08-05).** The finding was that four artifacts carried four
different restatement field lists, with the **action consequence**'s scope undecided.
`OD-S-06` is now ratified with the rest of the spec register: nodes carry claim,
certainty and what-would-change-it; **`action_consequence` is verdict-only**, because no
artifact defines a deterministic projection of an action onto a single node and an
inherited action on a leaf is the meaningless text the stranger law exists to prevent.
The quieter half is settled too: the schema carries `check_status ∈ PASS / FAIL /
NOT_SAMPLED`, so *"every node is restatable"* and *"every node carries a checked
restatement"* are now distinguishable on the wire, and `NOT_SAMPLED` is served as the
fact about the run that it is. This artifact cites that one contract (§1.2, Node) and
restates no field list.

**C12 — DELETED (2026-08-05). The tail was closed while this was being written.** The
finding was that DR-051 named seven marks followed by an ellipsis, with no table to make
"residue impossible by construction" checkable. **Re-verified: the ellipsis is gone.** The
current DR-051 row enumerates the set and states that the full enumeration lives in the
requirements spec's mapping table, *"which IS the enum's closure"*; that table exists, it
places each typed state in exactly one home (abstention kind / condition mark / terminal
route), and it explicitly places the unresolved-type fallback label and the
diversity/critique-unavailable mark that this entry had flagged as missing. The spec also
carries the rule that an unplaced state is a specification defect there. This artifact now
**imports** membership rather than restating it (§1.2, Condition marks). Two of the four
labels this entry raised — the off-subject downgrade (DR-009) and the amended-search
notice (DR-008) — are named in the pack merge's enum-consolidation item and land in that
table with it; they are a spec-side placement task with an owner, not a contradiction.

**C13 — CLOSED by DR-059 (2026-08-05).** The finding was that components-only serving had
no specified rendering for the two sentence-shaped honesty surfaces, so they would vanish
exactly when an answer is least trustworthy. Ruled: the **reversal point** and the
**builds-on-previous disclosure** get structured **projection fields that render without
composed prose** — degraded mode serves them as data. The same ruling closed the adjacent
edge this entry did not reach: a component number that fails replay is **evicted** and
marked with a typed missing-number mark while the rest of the answer serves with DEFECT,
so the replay law can never blank a whole answer. §4.0 and flex rows 5(d) and 9 now carry
both.

**C14 — "Authorized" and "digest-visible to the user" have not been reconciled.**
DR-054 puts the full fact bundle, the conformance record and the replay trail behind an
**authorized** inspection endpoint. DR-027 says everything executed is recorded and
**digest-visible to the user**, and DR-034 makes replayability a permanent serving
condition. If the asker is authorized for their own answer, the two agree; if
"authorized" means an operator role, then "show me why" (row 2) is an operator feature
and the asker gets a summary — a materially different product. No ruling says which.

**C15 — CLOSED by DR-060(a) (2026-08-05).** The finding was that "serve-conformance is in
the never-skippable protected core" and "the conformance sample rate is frozen per run"
pointed opposite ways — all served text judged, or only some. Ruled, and the two are now
compatible: **load-bearing sentences are always judged; non-load-bearing text is sampled
at the frozen stranger rate; the protected core forbids skipping the judge *role*, never
mandates exhaustive sampling.** For this interface that makes "judged" and "not sampled"
two different served facts rather than a contradiction — carried on the serve record
(§1.2) so a reader can tell which sentences were checked.

---

## 7. Acceptance criteria for this artifact

This document is done when a builder can answer all of the following without asking V:

1. For each of the 14 consumed surfaces: what replaces it, and what the interface must
   rebuild. **(Section 2 — 14 of 14.)**
2. Which surfaces do not enter V3's interface contract, and on what evidence.
   **(Section 3 — 11 entries, plus register row D-1 on how far "die" reaches.)**
3. For each of the nine honesty surfaces: what the reader sees, which ruling requires it,
   why today's contract cannot carry it, and the minimal shape that can — and the
   answer-surface states each of them must render inside, including degraded mode.
   **(Section 4 — §4.0 + 9 rows.)**
4. What the interface work is, and in what order. **(Section 5 — 21 items.)**
5. Which clauses are law and which are proposals. **(Authority tags on §1.3's E1–E4 and
   §1.4's L1–L11; §0 defines the three tags. Four clauses are `CANDIDATE` and are written
   in conditional voice so no builder is ordered by them: E3, and the second halves of
   L3, L4 and L8.)**
6. What V still decides, and when. **(The counted register: 29 `DRAFT—V RULES` cells in
   section 4 + register row D-1 = **30 decisions, every one stamped
   `DELEGATED — DR-064`** and ruled against mockups in the UI build phase. None of them
   blocks this mission; each option's *consequence* is written out here, and that is what
   architecture consumes. Plus the six open findings in section 6 — findings, not
   choices.)**

The stranger test applies to this document as it applies to the engine (R9, DR-018): a
reader with no project history should be able to say back what V3 will show a person that
V2 could not, and what has to be built for that to be true.
