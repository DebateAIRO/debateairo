# 08 — Open questions for V

ARCH-V3-R1 / C4 · 2026-08-05 · authored from `Plan.md` rev 3 §6 (all V-QUESTION
rows, §6.8's blocks-from table, §6.9, §6.10), per §7 row 9 · **annotated with V's
rulings 2026-08-06 under PROG-V3-R1 ticket PRE-03** (DR-100 follow-through).

> ## ALL 28 QUESTIONS ARE RULED — DR-068 … DR-097
>
> **V ruled every question in this register on 2026-08-05**, and the ARCH-V3-R1
> architecture loop closed at **DR-100** (*ARCHITECTURE SATISFIED*). The
> authoritative, machine-consumable record is
> `docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` — **30 rulings
> for 28 questions**, because **Q-08** and **Q-14** each yielded two rows
> (DR-075 + DR-076; DR-082 + DR-086).
>
> **How to read this file now.** Each entry carries a **`RULED — DR-nnn`**
> annotation directly under its heading, stating what V decided and any condition
> the ruling attached. **The question text below each annotation is unchanged and
> is preserved as history** — the smallest form, the long form, the
> SEAT-PROPOSAL, and the priced consequence of each alternative all stay exactly
> as they were put to V. That preservation is deliberate: a register that
> overwrites the question with the answer loses the record of *what was asked and
> at what price*, which is the thing that makes a ruling auditable.
>
> **Where a SEAT-PROPOSAL was adopted, the annotation says so; where V ruled
> against it or ruled something the seat did not offer, the annotation says that
> too** — and DR-076 is the clearest case, a custom ruling that was not among the
> listed options at all.
>
> **This file is still not where behaviour is defined.** The rulings are folded
> into the C4 documents that own each subject (`00`, `02`…`07`, `09`), each
> citing its DR. **The provisional-status banner this file carried is
> discharged** by DR-098/DR-100.

**This was the single place V answered.** No architecture document ruled any of
these; each named its carrier, marked the behaviour "pending V — Q-nn" and
pointed here. Those markers are now replaced by `RULED — DR-nnn` citations in
the documents that carry them.

**Nothing in this document is a ruling *of this seat's*.** Every recommendation
below is labelled **SEAT-PROPOSAL** and was the architecture seat's proposal only
(DR-005 as narrowed by DR-024); the `RULED` annotations are **V's**, transcribed
from the ledger, and are not the seat's to move. Where the plan itself marks a
recommendation *"not adopted here"*, that label is carried through verbatim.

**Scope: exactly 28 entries, `Q-01` … `Q-28`, and nothing else.** This file is a
question register, not a briefing. It carries **no** steering record, **no**
review dossier and **no** residual-risk list: the VS-1 steering decision lives in
the ledger (DR-098) and in the mission's V-decisions packet, and the plan-review
residual risks live in `reviews/`. The `RULED` annotations added at the PRE-03
fold-in are **citations into the ledger, not a second copy of it** — where an
annotation and the ledger differ, **the ledger wins** (spec §2 item 1). Two
things a reader may expect to find here
and will not, because they are **not** V-QUESTIONs: the **global pre-S0 gate**
(steering recorded · stack accepted or replaced · toolchain pins accepted ·
contract and register versions identified) and, under Q-01 = no, the
**replacement UI-rebuild repository and layout decision**. Both are entry
criteria carried in `07-build-order.md` §3.1 and §4 S0.

---

## 0. How to read an entry

Each question carries seven fields:

| Field | What it holds |
|---|---|
| **Q-nn** | The id used by `07-build-order.md`'s entry-criteria index and by every other C4 document. |
| **Blocks from** | The earliest slice that cannot proceed without the answer (Plan §6.8). *Blocking is per question, not a single launch flag: a question can be harmless at launch and fatal at slice 3.* |
| **Plan source** | The disposition row this comes from. |
| **Smallest form** | The question reduced as far as it goes — yes/no or pick-one wherever that is achievable without losing the decision. |
| **Long form** | The question as Plan §6 states it, where the smallest form compresses something load-bearing. |
| **SEAT-PROPOSAL** | This seat's recommendation. Never a ruling. |
| **Consequence of each alternative** | What follows from each answer, so the choice is priced rather than guessed. |

**Counting.** 23 distinct questions come from §6's 24 V-QUESTION rows — **A-6
restates U-4 and is asked once** (Plan §6.4 A-6: *"Same question as U-4, asked
once"*) — plus 2 from §6.9 and 3 from §6.10. **28 distinct questions.**

---

## 1. Index — blocking-soonest first · **all 28 RULED**

The `Ruling` column is the one-line answer; the full text with its conditions is
in the ledger, and the per-entry annotation below carries the working summary.

| Q | In one line | Blocks from | Plan source | **Ruling** |
|---|---|---|---|---|
| **Q-01** | May kept UI component source be carried into this repository at all? | **S0** | §6.10 AQ-2 | **DR-068** — yes, it MAY be carried |
| **Q-02** | Separate repository or separate workspace as the clean-room fence? *(asked only if Q-01 = yes)* | **S0** *(cond.)* | §6.10 AQ-3 | **DR-069** — **NO FENCE**; honour system, cost priced |
| **Q-03** | What is an "asker" — principal, caller identity, or session? | **S0** | §6.2 AM-12 | **DR-070** — the requesting user/person; auth out of scope |
| **Q-04** | Does an undercut reduce its target support edge's transmitted contribution, and where does that live? | **S2** | §6.4 A-1 | **DR-071** — **`transmission-reduction`**, pure core, per edge |
| **Q-05** | In what order do the two lifting predicates compose, and do folder lifts emit both-ends markers? | **S3** | §6.4 A-3 | **DR-072** — folder-lift first, then `OD-02`; markers both |
| **Q-06** | Does provenance-cluster collapse apply to attack arrows, and how does a non-evidence sibling get a key? | **S3** | §6.4 A-4 | **DR-073** — **both polarities**; no key ⇒ clusters alone |
| **Q-07** | Is the deployment operator declaration optional and unset by default? | **S3** | §6.4 A-8 | **DR-074** — **MANDATORY, never blank**; withhold path dropped |
| **Q-08** | Is a `pending` node an unjudged interior node, and are placeholder arrows live endpoints? | **S3** | §6.4 A-9 | **DR-075** — yes and yes · **DR-076** — plus live lifecycle observability |
| **Q-09** | What does a judge's earned weight multiply? | **S4** | §6.3 U-4 ≡ §6.4 A-6 | **DR-077** — the **served arithmetic**, via selection, never averaging |
| **Q-10** | What declares the hard composition-bundle budget? | **S5** | §6.1 OQ-G3 | **DR-078** — an **independent row**, asker-facing tiers |
| **Q-11** | Do the non-node senses of "load-bearing" project from the node definition, and by what rule? | **S5** *(S0 only if narrower than exhaustive)* | §6.2 AM-1 | **DR-079** — yes, by the seat's written rule |
| **Q-12** | Are the three closed sets of six one axis, and what is `design` in Q50's trigger? | **S5** | §6.2 AM-3 | **DR-080** — **separate vocabularies** + two mapping tables |
| **Q-13** | What condition activates `OD-11`'s layer-2 per-side provenance detail? | **S5** | §6.3 U-1 | **DR-081** — a **register row V flips**; layer 1 default |
| **Q-14** | Is the band rule a second obligation, and what does the way-of-knowing ceiling say? | **S5** | §6.10 AQ-1 | **DR-082** — a **second, independent gate** · **DR-086** — it **caps**, never blocks |
| **Q-15** | Is the activation table re-derived here, or does an authoritative copy exist to import? | **S6** | §6.1 OQ-G9 | **DR-083** — **re-derived and ratified in-repo**; no import |
| **Q-16** | Who names the eight typed citation failure routes, and where does the enum live? | **S6** | §6.1 OQ-G10 | **DR-084** — architecture proposes, **V ratifies**; §12.3 by amendment |
| **Q-17** | What is the tier × claim-type eligibility map for the evidence gate? | **S6** | §6.3 U-2 | **DR-085** — an **empty register table**; shadow mode meanwhile |
| **Q-18** | Which side of the evidence-gate complement do `mixed` and `unknown` fall on? | **S6** | §6.4 A-7 | **DR-087** — **gated, fail-closed**; `value-laden` is a flag |
| **Q-19** | Does an auto-activating hard-kill gate count as "shipped dark"? | **S6** | §6.9 item 6 | **DR-088** — **yes**; the charter's not-shipped rule wins |
| **Q-20** | Is a WAIT row a suspension, a job, or a predicate — and may a run terminate with rows in WAIT? | **S7** | §6.2 AM-10 | **DR-089** — **WAIT drain law**; Q61 is a post-completion watch |
| **Q-21** | What measured quantity licenses "measured behavioural difference"? | **S7** | §6.2 AM-14 | **DR-090** — none yet; **recorded unavailable, not approximated** |
| **Q-22** | On a casual run, how does a Stage-8 rule read a Stage-9 quantity? | **S8** | §6.2 AM-2 | **DR-091** — the **CROSS-entry leverage snapshot**, recorded as basis |
| **Q-23** | Over which action population does the Q34 symmetry diff run? | **S8** | §6.2 AM-4 | **DR-092** — **item-scoped only**, excluded by kind not value |
| **Q-24** | Who supplies the per-row correctness/enrichment classification, and when? | **S9** | §6.1 OQ-G2 | **DR-093** — architecture proposes **71 rows**, V ratifies **once** |
| **Q-25** | Who sets the risk tier? | **S9** | §6.2 AM-5 | **DR-094** — asker declares; policy may **RAISE, never lower** |
| **Q-26** | Does "kept component" mean kept source, or kept surface with rebuilt insides? | **S14** | §6.5 C5 | **DR-095** — **kept SURFACE, rebuilt insides** |
| **Q-27** | Does V3 carry a verdict-first presentation flag at all, and at what default? | **S14** | §6.5 C8 | **DR-096** — **no such flag**; the register carries no row |
| **Q-28** | Is a register row with no executable unit inside charter clause 4's reach? | **S15** | §6.9 item 7 | **DR-097** — **outside** the reach; plus an **advisory** unread-key audit |

---

## Theme A — Repository shape and the clean-room fence · blocks from S0

*A repository decision precedes the first commit (Plan §6.8, S0 row).*

### Q-01 · May kept UI component source be carried into `DebateAI-V3` at all?

> **RULED — DR-068** *(2026-08-05, V-RULING, FINAL)*
> **Yes — kept UI component source MAY be carried into `DebateAI-V3`.** The seat
> offered no recommendation here and V supplied the answer directly. Q-02, the
> fence question, was left live by this ruling and is answered below.
> **Affected:** ADR-0015's scope; `07-build-order.md` §3.2/§4 S0;
> `02-data-model.md` / ADR-0005's reachability to the kept UI.

- **Blocks from:** **S0**
- **Plan source:** §6.10 **AQ-2** (FLAG-4(a))
- **Smallest form:** **Yes / no.**
- **SEAT-PROPOSAL:** **None offered.** The plan records only that *the permissive
  reading is available but is V's to confirm*: DR-048 keeps the components and
  UX, while manifest §14's clean-room prohibition binds organ implementers and
  V2 **engine** code. This seat does not convert an available reading into a
  recommendation.
- **If yes:** the kept-UI plan proceeds and **Q-02 becomes live** — the fence
  question exists **only** under this answer.
- **If no:** the UI is **rebuilt from the contract rather than kept**, ui §5's
  W-item plan changes shape, and **Q-02 is not asked at all**. What must be
  recorded before S0 in its place is the **replacement UI-rebuild repository and
  layout decision** — a layout consequence of this answer, not a further
  V-QUESTION; it is carried as an S0 entry criterion in `07-build-order.md`
  §3.2 and §4 S0, not as a Q-nn here.
- **Citations:** DR-048; manifest §14; ui §5; Plan §6.10 AQ-2, FLAG-4(a).

### Q-02 · What structural barrier keeps the organ implementers clean?

> **RULED — DR-069** *(2026-08-05, V-RULING, FINAL)* — **the SEAT-PROPOSAL below
> is SUPERSEDED.**
> **NO FENCE.** The kept UI package sits in `DebateAI-V3` as a **plain,
> always-visible package beside the engine packages** — not a separately
> checked-out workspace, not a separate repository. V chose this **after the cost
> was priced**, and the price is recorded as part of the ruling:
> **DR-003's clean-room mandate has no enforcement mechanism under this ruling —
> compliance is an honour system, not a checked barrier.** The
> **consumer-manifest mechanism (§2.6/§2.7's fence-cost) is not required.**
> **Condition attached by V:** this is an **accepted trade-off, not a gap — do
> not re-raise it as an open question.**
> **Affected:** `02-data-model.md` §2.6 layout; `03-module-design.md` dependency
> edges; `09-traceability.md` FLAG-4 cells; the repo-layout ADR;
> `06-test-strategy.md` §1 P2, §11 `FX-ORPH-01` and §13 (the manifest is replaced
> by an intra-repo static type-graph pass, `07-build-order.md` §3.4).

- **Asked only if Q-01 = yes.** Under Q-01 = no there is no V2-derived source in
  the tree to fence, and this question is **inapplicable rather than
  unanswered**; `07-build-order.md` §4 S0 names what stands in its place.
- **Blocks from:** **S0** *(conditional on Q-01 = yes)*
- **Plan source:** §6.10 **AQ-3** (FLAG-4(b))
- **Smallest form:** **Pick one — (1) a separate repository, or (2) a separate
  workspace, separately checked out.**
- **A third option is named only to be excluded.** An import-fenced package
  inside this repository **does not satisfy FLAG-4(b)'s own test**: such a
  package sits in every implementer's working tree, editor index and agent
  context, and FLAG-4(b) holds that *"a barrier that depends on an implementer
  not searching their own working tree is not a barrier"*. It is listed so that
  offering it does not invite an answer the plan's own analysis rules out.
- **SEAT-PROPOSAL:** **option (2)** — a separate workspace, separately checked
  out.
- **If (1) or (2):** the fence exists. **Its cost, so V can price it:** the
  single-type-graph orphan audit is **split**, and AC-61 then depends on the
  fenced interface emitting a **consumer manifest** the engine's release build
  requires (Plan §2.6, §2.7) — a real mechanism, but one more moving part than a
  single checkout.
- **If neither (no fence):** **DR-003 has no enforcement mechanism.** V2-derived
  source sits beside the five organ packages, and manifest §14 voids DR-003
  *"regardless of intent"*; clean-room compliance becomes an honour system,
  which manifest §14 explicitly refuses.
- **Citations:** manifest §14; DR-003; AC-61; Plan §2.6, §2.7, §6.10 AQ-3,
  FLAG-4(b).

---

## Theme B — Identity and authorization · blocks from S0

### Q-03 · What is an "asker"?

> **RULED — DR-070** *(2026-08-05, V-RULING, FINAL — provisional simplification)*
> — **the SEAT-PROPOSAL below is NARROWED, not adopted whole.**
> **The asker is the requesting user/person.** No separate
> authenticated-principal / session-scope model for now: **authorization and user
> credentials are explicitly OUT OF SCOPE for this stage**, and V2's existing
> `user_dev_token` vertical slice is adopted as sufficient.
> **Condition attached by V:** authorization is **deferred, not designed away**.
> The simplified model is **provisional** and may need real principal/session
> separation before a multi-tenant or credentialed launch; flag it for
> **charter A5.2-style revisit language when built**.
> **Affected:** DR-066(1)'s session-scope authorization; the `EXACT_QUESTION`
> tier; the per-asker memory partition; the tier-2 inspection handle;
> `06-test-strategy.md` `FX-WIRE-03`.

- **Blocks from:** **S0** — the tier-2 inspection handle's authorization needs a
  principal.
- **Plan source:** §6.2 **AM-12**
- **Smallest form:** **Pick one** — for the per-asker memory partition and for
  DR-066's session scope, is an "asker" **(a) an authenticated principal**,
  **(b) a deployment-scoped caller identity**, or **(c) a session**?
- **SEAT-PROPOSAL:** a first-class **`asker_id`** (a stable principal) **distinct
  from `session_id`**, with **`caller_scope`** a separate declared field on the
  Ask; DR-066's authorization resolves **session → asker → answer ownership**.
- **Consequence of conflating caller scope with asker identity:** the
  `EXACT_QUESTION` tier compares canonical question text **and caller scope** —
  so either the tier **silently becomes per-asker**, or **a question-level pull
  crosses an asker boundary**. The second is **a confidentiality failure, not a
  modelling nicety.**
- **Citations:** DR-066(1); DR-021 knob 11; spec §23.B `OD-M-20`, §17.2 M-4;
  Plan §6.2 AM-12.

---

## Theme C — Graph arithmetic: the edge table and the scored graph · blocks from S2–S3

*Every question in this theme moves served numbers, which is why each is V's.*

### Q-04 · The undercut's arithmetic — does it reduce the targeted support edge, and where does the reduction live?

> **RULED — DR-071** *(2026-08-05, V-RULING, FINAL)*
> **The undercut's shape is `transmission-reduction`**: a reduction of the
> targeted support edge's transmitted contribution, **computed inside the pure
> core** and **recorded per edge** — a **third ruled producer of arrow strength**.
> **Condition:** this grants DR-062 `OD-06`'s producer-set extension from **two
> to three**, and **`strength_source`'s `UNDERCUT_TRANSMISSION` member becomes
> writable** — the schema fence of Plan §4.2(4) is discharged.
> **Affected:** `02-data-model.md` §4.2(4) edge table; ADR-0005;
> `07-build-order.md` S2 entry criterion; `06-test-strategy.md` §9.4.

- **Blocks from:** **S2** — Plan §8 states it as S2's inline entry criterion: the
  edge table **cannot be frozen** while this is open, because
  `strength_source`'s third member `UNDERCUT_TRANSMISSION` either becomes live
  or must be **removed rather than left unreachable** (AC-77).
- **Plan source:** §6.4 **A-1**
- **What is already settled and is not asked here:** the **carrier**. DR-066(2)
  rules that the undercut targets the support **edge**, and the manifest §6.3
  text it contradicts loses (AC-19). The polymorphic-target edge table ships
  regardless.
- **The answer options are named shapes, never letters. This entry is the
  canonical label set for the whole C4 artifact set** (`02-data-model.md`,
  `ADR-0005` and `07-build-order.md` use these three names and no others). The
  letters used in Plan §4.2(4) and §6.4 collide — "(a)" names two different
  answers there — so they are retired here rather than propagated.

  | Shape | What it means | `OD-06` amendment needed? |
  |---|---|---|
  | **`transmission-reduction`** | The undercut **reduces the transmitted contribution of the targeted support edge**, recorded per edge, as a **third ruled producer of arrow strength** under `DR-062 OD-06`. | **Yes** — the producer set is closed at two today. |
  | **`inert`** | The relation is **visible but changes no number**, on `OD-04`'s typed-unknown-magnitude pattern. | No |
  | **`recorded-on-propagation_run`** | The reduction is carried **outside `edge.strength`** as a per-edge quantity on `propagation_run`. | **No** |

- **Smallest form — two halves, both needed for a buildable answer:**
  1. **Yes / no:** does an undercut **reduce the transmitted contribution** of
     the support edge it targets? *(If yes: by what rule?)*
  2. **Pick one shape:** if yes, is the reduction **`transmission-reduction`**
     or **`recorded-on-propagation_run`**? *(A "no" to half (i) selects
     **`inert`**.)*
- **Half (ii) is not optional.** A "yes" to half (i) alone leaves S2's entry
  criterion satisfied and **the edge table still unfreezable**, because
  `OD-06`'s closure would still forbid writing the column. The member is
  declared in the schema but **NOT WRITABLE until V grants the amendment**
  (Plan §4.2(4)).
- **SEAT-PROPOSAL:** **`transmission-reduction`** — model it as a reduction of
  the targeted edge's transmitted contribution **inside the pure core, recorded
  per edge** — the graph stays node-shaped for evaluation, so σ and the
  aggregation keep their published definitions (manifest §4.2a–c) and the
  fingerprint, topological order and cycle law are unchanged.
- **Consequence of each alternative:**
  - **`transmission-reduction`** requires V to grant the `OD-06` producer-set
    extension; without that grant the column stays unwritable and S2 cannot
    freeze the edge table.
  - **`inert`** is the **DR-039-safe** option but **ships a first-class relation
    that changes nothing** — charter clause 4's dead-weight shape.
  - **`recorded-on-propagation_run`** **needs no `OD-06` amendment at all**,
    which may make it **the answer that reopens least**.
  - **Not on the menu:** treating the undercut as **a plain attack on the target
    node** is **forbidden by DR-066(2)**, which is why the carrier half is
    settled and only the arithmetic is asked.
- **What each answer does to the schema:** under `transmission-reduction`,
  `strength_source`'s `UNDERCUT_TRANSMISSION` member **becomes writable**; under
  `inert` and `recorded-on-propagation_run` it is **removed rather than left
  unreachable** (AC-77), and removal is S2's exit condition.
- **Citations:** DR-066(2); `DR-062 OD-06`; `OD-04`; DR-039; AC-19, AC-27,
  AC-77; manifest §4.2a–c, §6.3; Plan §4.2(4), §6.4 A-1, §8 S2.

### Q-05 · How do the two lifting predicates compose?

> **RULED — DR-072** *(2026-08-05, V-RULING, FINAL)*
> **Lifting composition order: folder-lift first, then `OD-02`'s judged-ancestor
> lift — and both-ends markers are emitted in both cases.**
> **Affected:** the scoring/arithmetic module. Verdict-affecting: D2's measured
> `0.97 → 0.5` shift is why the order is ruled rather than left to
> implementation.

- **Blocks from:** **S3**
- **Plan source:** §6.4 **A-3**
- **Smallest form:** **Yes / no + order.** When a perspective node's children
  lift to *"the nearest real claim above"* and that claim is itself unjudged,
  does `OD-02`'s **nearest-judged-ancestor** rule then apply — and do **folder
  lifts** emit `OD-02`'s **both-ends markers**?
- **SEAT-PROPOSAL:** compose them in that order — **folder-lifting first** (a
  structural rule about grouping devices), **then `OD-02`'s judged-ancestor
  lifting** (an arithmetic rule about unjudged nodes) — with `OD-02`'s markers
  emitted at **both ends in both cases**, since **only that order terminates**.
- **Consequence:** D2's own evidence shows this exact re-attachment rule moving
  a root **from 0.96875 to 0.5** (manifest §10.2). The composition is therefore
  **verdict-affecting and cannot be left to implementer choice** — either
  ordering is buildable, and they do not agree.
- **Citations:** `OD-02`; manifest §10.2; Plan §6.4 A-3.

### Q-06 · Does provenance-cluster collapse apply to attack arrows, and how does a non-evidence sibling acquire a cluster key?

> **RULED — DR-073** *(2026-08-05, V-RULING, FINAL)*
> **Provenance-cluster collapse applies to BOTH polarities — support and
> attack.** A claim node's cluster key derives from **the provenance of its
> evidence and the producing run/model family**; **a node with no resolvable key
> clusters alone.**
> **Affected:** the scoring module's cluster-collapse logic;
> `06-test-strategy.md` `FX-PT-D3`'s generator, which must now include attack
> siblings and the no-key case.

- **Blocks from:** **S3**
- **Plan source:** §6.4 **A-4**
- **Smallest form:** **Yes / no + a rule.** Does collapse apply to **attack**
  arrows as well as support — and how does a **non-evidence sibling claim node**
  get a cluster key?
- **Not reopened:** the key's **fields** are already ruled at `OD-09`.
- **SEAT-PROPOSAL:** apply collapse **within one parent and one polarity, on
  both polarities** (`OD-08`'s *"within one polarity"* caveat implies both
  exist), and derive a claim node's key from the provenance of the evidence and
  the producing-run / model-family behind it, with **a node carrying no
  resolvable key clustering alone — never merged with another**.
- **Consequence of each alternative:** **clustering attacks changes served
  numbers**; **not clustering them** leaves D3's measured inflation
  (**0.40 → 0.784**) reachable on the attack side.
- **Citations:** `OD-08`, `OD-09`; manifest P-D3 figures; Plan §6.4 A-4.

### Q-07 · Is the deployment-level operator declaration optional and unset by default?

> **RULED — DR-074** *(2026-08-05, V-RULING, FINAL)* — **the SEAT-PROPOSAL below
> is SUPERSEDED (simplified).**
> **The deployment-level scoring operator (accumulate vs strict-and) is
> MANDATORY, never blank** — a required register row, with **no undeclared and no
> withhold state at the deployment level**. Parent- and run-level overrides remain
> optional on top of it. **The declare-once / withhold runtime machinery is
> dropped from the design** (nothing is left to trigger it). **The anti-defect
> property is preserved by a different mechanism:** the operator is a **recorded
> config value, never a hardcoded literal**, carried by the mandatory register row
> rather than by the runtime fallback.
> **Condition attached by V:** `06-test-strategy.md`'s **P-D2 fixture is
> rescoped** — from *"exercises the withhold path"* to *"the operator resolves
> from parent/run/deployment register rows, never a source literal"*.
> **Affected:** `05-register-skeleton.md` §2.3 and §5.4 (the operator becomes a
> **required key**, minted as `scoringOperator`); `03-module-design.md`'s scoring
> module; `06-test-strategy.md` `FX-PT-D2`, `FX-HR-H4`.

- **Blocks from:** **S3** — **S3's stated P-D2 gate is unconstructible if no
  parent can be undeclared** (Plan §6.8, S3 row).
- **Plan source:** §6.4 **A-8**
- **Smallest form:** **Yes / no.** Is the deployment-level operator declaration
  optional and unset by default, so an **undeclared parent can exist** and
  DR-040's **withheld-parent path can fire**?
- **SEAT-PROPOSAL:** **yes — optional and unset by default**, so the chain reads
  parent → run → deployment → (still undeclared ⇒ one bounded declaration call ⇒
  still undeclared ⇒ **withhold and serve components**), because P-D2 explicitly
  tests that an undeclared parent takes DR-040's path, and charter **G4** forbids
  a configuration branch no production caller can produce.
- **Consequence of "no":** a deployment default that always exists makes **both
  the declaration call and the withheld-parent terminal structurally
  unreachable** — **the exact D5 shape** (a branch that can never execute).
- **Citations:** DR-040; `OD-22`; charter §5.1 G4; P-D2; Plan §6.4 A-8, §6.8.

### Q-08 · What does a `pending` node do in the scored graph?

> **RULED — DR-075** *(2026-08-05, V-RULING, FINAL)*
> **A `pending` node IS an unjudged interior node under `OD-02`** — no scoring
> arrow contributed to its parent yet, children lift to the nearest judged
> ancestor, skip-markers at both ends. **Placeholder arrows ARE live, real arrow
> endpoints**: the *"endpoint absent from the node set"* error is reserved for
> **genuinely foreign or deleted endpoints only**, never a legitimate placeholder.
> **Condition:** serving a placeholder as a claim stays **forbidden regardless**
> (manifest §6.2 item 10, AC-86).
>
> **RULED — DR-076** *(2026-08-05, V-RULING, FINAL — a CUSTOM ruling, not one of
> the options listed below)*
> **Amendment to Q-08, surfaced during grilling and not present in Plan.md rev 3.**
> A pending node must be **structurally connected to its parent from the moment it
> spawns**, via the now-confirmed-live placeholder arrow, and its **lifecycle —
> generating → being judged → scored — must be observable LIVE in the UI**, not
> only after settling.
> **Condition / scope limit:** this is an **observability and streaming
> requirement, not an arithmetic one** — it **does not change what contributes to
> a served score**. It requires a node-lifecycle event addition to the API's event
> vocabulary; the **exact event names were deferred to the C4 revision rather than
> invented in the ruling** (`04-api-contract.md`).
> **Affected:** `04-api-contract.md`'s event vocabulary; the S14 UI data-layer
> rebuild; `02-data-model.md`'s placeholder-arrow-as-connectivity read;
> `06-test-strategy.md` `FX-LG-17`.

- **Blocks from:** **S3**
- **Plan source:** §6.4 **A-9**
- **What is already ruled:** every non-`stale` node enters the scored graph
  (`OD-18`). What a `pending` node *does* there is not ruled, and **both open
  sub-questions are arithmetic-visible.**
- **Smallest form — two yes/no:**
  1. Does a `pending` node count as an **unjudged interior node** for `OD-02`'s
     transparency-and-markers rule?
  2. Are **placeholder arrows live arrow endpoints**?
- **SEAT-PROPOSAL (not adopted here):** **yes to both** — a pending node has no
  judgement, so `OD-02` governs it (emits no arrow, children lift to the nearest
  judged ancestor, markers at both ends), and its placeholder arrows are real
  rows with real endpoints, so manifest §4.4's *"endpoint absent from the node
  set"* error is about **foreign or deleted endpoints only**.
- **Consequence:** under the recommendation a mid-flight run **emits skip markers
  on every in-progress branch** — visible machinery the reader may not want —
  and **the chosen lifting rule *is* the arithmetic** (D2's evidence: the same
  re-attachment rule moves a root from 0.96875 to 0.5). **C4 must not freeze
  either behaviour before V answers.**
- **Invariant under every answer:** serving a placeholder as a claim stays
  **forbidden** (manifest §6.2 item 10, AC-86).
- **Citations:** `OD-18`, `OD-02`; manifest §4.4, §6.2 item 10, §10.2; AC-86;
  Plan §6.4 A-9.

---

## Theme D — Judge weight · blocks from S4

### Q-09 · What does a judge's earned weight multiply?

> **RULED — DR-077** *(2026-08-05, V-RULING, FINAL)*
> **A judge's earned weight MULTIPLIES the served arithmetic** — consumed in the
> **selection** of which judgement becomes the reduced score, **under a declared
> rule, never by averaging**. **Dispersion is measured and served separately,
> never blended away.**
> **Affected:** the scoring/reduction module; `06-test-strategy.md` `FX-PT-D5`,
> which now has a real assertion target — closing U-4 ≡ A-6 and repairing the
> second half of D5.

*Asked once. Plan §6.3 **U-4** and §6.4 **A-6** are the same question; A-6 is
listed in the plan so the manifest's item carries its own disposition, and its
question, recommendation and consequence are U-4's.*

- **Blocks from:** **S4**
- **Plan source:** §6.3 **U-4** ≡ §6.4 **A-6**. Plan §6.3 marks it **the
  highest-priority question in its set.**
- **Smallest form:** **Pick one.** In the reduction from N judgements to one τ,
  does a judge's earned weight **(a) multiply something in the served
  arithmetic** — and if so what — or is it **(b) consumed only by routing and
  the dispersion surfaces**?
- **SEAT-PROPOSAL:** consume weight in the **selection** of the reduced τ under a
  **declared, recorded rule** rather than by averaging — DR-032 forbids
  replacing the score object with a weighted mean and manifest §5.2h forbids
  averaging dispersion away — with dispersion measured and served separately.
  **But the rule itself must be V's, because any arithmetic here is
  measurement-shaped (DR-039).**
- **Consequence of (b):** if weight touches **no** served arithmetic, **P-D5's
  "at least one judge's weight moves" has nothing to assert against** and D5 is
  only half repaired — **the exact shape charter clause 4 indicts.**
- **Already settled and not asked:** whether weight is frozen into the replay
  record. Plan §6.3 **U-5** is RESOLVED-BY-PACK by entailment — DR-034 plus
  DR-060(b) require every served number to recompute byte-identically from
  frozen records, so **any input that moved a served number, including the judge
  weight in force and its version, is a frozen replay input.**
- **Citations:** DR-032, DR-034, DR-039, DR-060(b); manifest §5.2h; P-D5;
  charter clause 4; Plan §4.3, §6.3 U-4/U-5, §6.4 A-6.

---

## Theme E — Serve: budget, bands and vocabularies · blocks from S5

### Q-10 · What declares the hard composition-bundle budget?

> **RULED — DR-078** *(2026-08-05, V-RULING, FINAL)* — **the SEAT-PROPOSAL below
> is AMENDED, not rejected.**
> **The hard composition-bundle budget is an INDEPENDENT register row**, distinct
> from the DR-052 cost envelope — which is what keeps **`DEFECT` and
> `ENVELOPE_EXHAUSTED` distinguishable**. **V's amendment:** the cap is
> **user-facing as a tier list — `low` / `medium` / `high` — that the asker
> selects per run**, mirroring the existing asker-depth dial. **The register
> carries the per-tier values; the asker's tier choice resolves which applies.**
> **Condition:** the tier values are **pending register ratification (DR-023)** —
> **no number is invented by the ruling**.
> **Affected:** `05-register-skeleton.md` §5.4 (the independent row plus three
> per-tier rows); `04-api-contract.md` `POST /v1/asks` (the tier input); serve
> composition; `06-test-strategy.md` §9.6's third compose-time route.

- **Blocks from:** **S5**
- **Plan source:** §6.1 **OQ-G3**
- **Smallest form:** **Pick one** — **(a) an independent register row V sets**,
  or **(b) a derivation from the DR-052 cost envelope**.
- **SEAT-PROPOSAL:** **(a)** — an **independent register row in a declared
  unit**, not a sub-budget of the envelope, because the two gates carry
  **different marks** (`DEFECT` vs `ENVELOPE_EXHAUSTED`) and **different
  owners**.
- **Consequence of (b):** if it is a sub-budget, **one answer can hit both
  terminals** and the reader **cannot tell a truncated answer from an
  unconformable one**.
- **What is not asked:** the **value**. Inventing a number here is barred by
  DR-039; the two-gate shape holds under either answer (Plan §6.6 UI-7).
- **Citations:** spec §12.1b S-9c; DR-058, DR-052, DR-039; Plan §6.1 OQ-G3,
  §6.6 UI-7.

### Q-11 · Do the non-node senses of "load-bearing" project from the charter's node definition?

> **RULED — DR-079** *(2026-08-05, V-RULING, FINAL)* — **the SEAT-PROPOSAL below
> is ADOPTED.**
> **The non-node senses of "load-bearing" PROJECT from the charter's node
> definition**, per the seat's rule: *a **sentence** is load-bearing iff it
> asserts a fact drawn from a load-bearing node or states a served number; a
> **claim** iff its node is; an **unknown** iff removing it would change the
> verdict or the band.*
> **Affected:** conformance-sampling coverage (S5); memory-locator
> re-verification; the ignorance ledger; `06-test-strategy.md` `FX-LG-06`'s
> sampling limb, now constructible.

- **Blocks from:** **S5 for conformance *sampling*; S0 for anything narrower
  than exhaustive.** S0 runs conformance **exhaustively** and does **not** need
  the answer.
- **Plan source:** §6.2 **AM-1**
- **What is a fixed input and not in question:** the charter defines exactly one
  sense — *"a **load-bearing node** … drop it and the verdict or its band
  changes. Which nodes those are is **computed, not asserted** (removal-based
  leverage and fragility, Q46/Q49)"* (charter §1).
- **The remaining uses are not nodes:** *sentences* (DR-060a conformance
  sampling), *claims* (memory locator re-verification, M-16), *unknowns* (the
  ignorance ledger), *presuppositions* (Q3), *sources* (Q35's
  `source_is_load_bearing`) and *composition priority* (DR-058).
- **Smallest form:** **Yes / no + a rule.** Do the non-node uses **project** from
  the charter's node definition — and if so, **by what rule**?
- **SEAT-PROPOSAL (not adopted here):** a **sentence** is load-bearing iff it
  asserts a fact drawn from a load-bearing node **or** states a served number; a
  **claim** iff its node is; an **unknown** iff removing it would change the
  verdict or band.
- **Consequence:** these projections decide **conformance-judging coverage** and
  **serving behaviour**, and **AC-85 only says a rule lives in one place — it
  does not supply the rule**, so adopting this seat's would be **inventing one
  without facts behind it (DR-039)**.
- **Until ruled:** C4 may define **carriers and provenance for the non-node
  senses only** — not conformance-sampling or serving behaviour derived from
  them.
- **How S0 proceeds without the answer:** charter **A2.5** is explicit that the
  protected core *"forbids skipping the conformance **role**, it never mandates
  exhaustive sampling"* — so **judging every segment is always legal**. S0 runs
  conformance exhaustively, with no sampling and **no consumption of
  `run.stranger_sample_rate` for coverage**; sampling arrives at S5 with this
  answer.
- **Citations:** charter §1, A2.5; DR-060(a), DR-058, DR-039; AC-85, AC-50;
  spec Q3, Q35, M-16; Plan §6.2 AM-1, §6.8, §8 S0.

### Q-12 · Are the three closed sets of six one axis, and what is `design`?

> **RULED — DR-080** *(2026-08-05, V-RULING, FINAL)*
> **The three closed sets of six are SEPARATE VOCABULARIES** — modelled as three
> declared vocabularies **plus two explicit register-row mapping tables**:
> **`Q8 type → abstention class`** and **`(Q7 act, Q8 type) → scorecard task
> class`**.
> **Condition:** the **mapping-table contents are V's at register ratification**
> — the ruling mints the tables, not their entries (inventing the mapping is
> barred by DR-039).
> **Affected:** the abstention price cell; the scorecard cells;
> `05-register-skeleton.md` §5.4.

- **Blocks from:** **S5**
- **Plan source:** §6.2 **AM-3**
- **Smallest form:** **Yes / no + a definition.** Is the abstention matrix's
  **question-class axis** the same closed six as **Q8's question types** — and
  what is **`design`** in **Q50's trigger**?
- **SEAT-PROPOSAL:** model **three declared vocabularies** plus **two explicit
  mapping tables as register rows** — `Q8 type → abstention class` and
  `(Q7 act, Q8 type) → scorecard task class` — because both the abstention cell
  (DR-012) and the scorecard cell (K-3) need a **single resolved key** and
  **neither can be derived**.
- **Consequence of no mapping:** **every served answer's price cell and every
  scorecard cell are keyed on an undefined axis.** Inventing the mapping is
  barred by DR-039.
- **Citations:** spec §3.2, §21 N-3, §16.2 K-3, §17.1 M-1, §3.9 Q50; DR-012,
  DR-039; Plan §6.2 AM-3.

### Q-13 · What activates `OD-11`'s layer-2 per-side provenance detail?

> **RULED — DR-081** *(2026-08-05, V-RULING, FINAL)*
> **`OD-11`'s layer-2 per-side provenance detail activates behind a register row
> V flips.** **Layer 1 is the default**, **both states are testable before the
> flip**, and **nothing ships dark** — the register-gated-branch shape of charter
> VR-4 class 1 / G4, not the not-written one.
> **Affected:** serve projections; `05-register-skeleton.md` §5.4. This also
> supplies **DR-066(2)'s required named condition**, closing U-1.

- **Blocks from:** **S5**
- **Plan source:** §6.3 **U-1**
- **Why it must be asked:** DR-066(2) says a successor with **no named condition
  requires a fresh ruling**.
- **Smallest form:** **What condition activates it?** — with the narrowest
  buildable answer being **pick one:** a **register row V flips**, or a **named
  runtime condition** (which V must state).
- **SEAT-PROPOSAL:** make projection depth a **register-gated branch** — layer 1
  by default, layer 2 behind a register row V flips — so the successor is
  reachable by **a configuration a production caller can produce** (charter VR-4
  class 1, G4) and **nothing ships dark**.
- **Consequence:** **without a trigger the successor cannot be scheduled at
  all**; with a register row it is **testable in both states before V decides**.
- **Citations:** `OD-11`; DR-066(2); charter VR-4, §5.1 G4; Plan §6.3 U-1.

### Q-14 · Is "the band rule" a second obligation, and what does the way-of-knowing ceiling say?

> **RULED — DR-082** *(2026-08-05, V-RULING, FINAL — half (i))*
> **The band rule is a SECOND, INDEPENDENT GATE** beside DR-044(Q51)'s three
> blocking gates — **not a restatement of them**. `band_ceiling {label, basis}`
> ships on the Answer, **computed from the load-bearing nodes' way-of-knowing
> distribution**.
> **Condition:** the **label vocabulary and the cut points remain register rows V
> ratifies at DR-023**.
>
> **RULED — DR-086** *(2026-08-05, V-RULING, FINAL — half (ii); completes DR-082)*
> **When the way-of-knowing ceiling gate fires it CAPS THE CONFIDENCE BAND** —
> the answer **serves**, **cannot reach the top band**, and **wears its ceiling
> label visibly**. It mirrors **DR-014's cap + label + recorded lift-path
> pattern** and **never silently blocks**.
> **Affected:** the serve gate order — now **four gates plus this cap**;
> charter VR-2's band display; `04-api-contract.md`'s Answer shape;
> `05-register-skeleton.md` §5.4; `06-test-strategy.md` `FX-SRV-13`, `FX-LG-03`.

- **Blocks from:** **S5**
- **Plan source:** §6.10 **AQ-1**
- **Smallest form — two halves:**
  1. **Pick one:** is *"the band rule"* **(a) a second obligation beside
     DR-044(Q51)'s three blocking gates**, or **(b) manifest §4.2(h) merely
     restating that same "band half"**?
  2. **Pick one:** what does **charter VR-2's way-of-knowing ceiling** *say* —
     **a label derived from the load-bearing nodes' way-of-knowing
     distribution**, or **a register-supplied cut**?
- **Why half (i) matters on its own:** if the band rule is DR-044's restatement,
  **`band_ceiling` is a charter-VR-2 display obligation rather than a gate, and
  S5's gate text changes accordingly.**
- **SEAT-PROPOSAL:** **ship the carrier now** — `band_ceiling {label, basis}` on
  the Answer (Plan §5.4), computed from the load-bearing nodes' `way_of_knowing`
  distribution and the Q51 downgrade state — and **let V set the label
  vocabulary and any cut as register rows**.
- **Consequence of each alternative:** **with no rule at all**, AC-24 is a
  constraint with **no design element carrying it**, which Plan §1's own law
  calls a gap; **with an invented mapping**, it is an **invented rule** — the
  manifest names the same bar (*"DR-039 sets a high bar for inventing three
  constants"*).
- **Citations:** charter VR-2; manifest §4.2h; DR-044 (Q51), DR-039; AC-24;
  Plan §5.4, §6.10 AQ-1.

---

## Theme F — Evidence, activation and the deferred gate · blocks from S6

### Q-15 · Is the activation table re-derived here, or imported?

> **RULED — DR-083** *(2026-08-05, V-RULING, FINAL)*
> **The activation table is RE-DERIVED AND RATIFIED IN-REPO** as a first-class
> per-row contract field — `ACTIVE / INACTIVE / WAIT / POLICY_BLOCKED`, **a
> written predicate per row**, populated from spec §3's row contracts. **A row
> whose predicate the spec only summarizes files as `POLICY_BLOCKED` — loud,
> never a silent skip.** **No import of the old research artifact.**
> **Affected:** the C4 row-contract document (board ticket **PRE-05**: 71 row
> contracts with written predicates); the battery module.

- **Blocks from:** **S6**
- **Plan source:** §6.1 **OQ-G9** — *the activation table is a normative
  dependency absent from the pack.*
- **Smallest form:** **Pick one** — is the activation table's content **(a)
  re-derived and ratified inside V3's repo as a row-contract artifact**, or
  **(b) does an authoritative copy exist to be imported**?
- **SEAT-PROPOSAL:** architecture models activation as a **first-class per-row
  contract field** (`ACTIVE / INACTIVE / WAIT / POLICY_BLOCKED` with a written
  predicate), populates it from spec §3's row contracts, and files **any row
  whose predicate spec §3 only summarises as `POLICY_BLOCKED`** — which spec §1
  **forbids filing as INACTIVE**, so **the gap is loud and never a silent skip**.
- **Consequence:** **without the table, those rows cannot fire**; with the
  fail-closed default, **the run is honest about why**.
- **Where the answer lands:** the C4 row-contract document, one written
  predicate per row.
- **Citations:** spec §1, §3, §24; Plan §6.1 OQ-G9.

### Q-16 · Who names the eight typed citation failure routes, and where does the enum live?

> **RULED — DR-084** *(2026-08-05, V-RULING, FINAL)*
> **The eight typed citation failure routes: ARCHITECTURE PROPOSES THE CLOSED
> ENUM, V RATIFIES.** **Loud failure, no generic "other".** **Any member that
> surfaces to a reader is placed in spec §12.3 by amendment**, so S-13's
> single-minting-place law stays intact.
> **Condition:** **ratification of the proposed eight is pending** — the sitting
> is **VG-02**, fed by board ticket **PRE-07**.
> **Affected:** the evidence subsystem (S6); `02-data-model.md`'s closed-enum
> inventory; `06-test-strategy.md` `FX-HR-H5`, `FX-DEF-01`.

- **Blocks from:** **S6** — *"an unnamed enum blocks the evidence subsystem."*
- **Plan source:** §6.1 **OQ-G10**
- **The constraint that makes this a question:** **S-13** says spec §12.3's table
  is **the only place a typed state may be minted**.
- **Smallest form:** **Pick one** — does **(a) architecture propose the eight and
  V ratify**, or **(b) V name them**? Plus: **any member that surfaces to the
  reader must be placed in spec §12.3 by amendment — confirm.**
- **SEAT-PROPOSAL:** architecture proposes the eight in the C4 data-model
  document as a **closed evidence-subsystem enum (not condition marks)** with
  **loud failure and no generic "other"**; V ratifies; and any member surfacing
  to the reader is placed in spec §12.3 **by amendment**.
- **Consequence of each alternative:** **DR-020 knob 7 requires the eight "from
  day one"**, so an unnamed enum **blocks the evidence subsystem**; **minting
  them unilaterally** risks an **unplaced typed state**, which **S-13 calls a
  specification defect**.
- **Citations:** DR-020 knob 7; spec §7.3 E-8, §12.3, S-13; AC-65; Plan §6.1
  OQ-G10.

### Q-17 · What is the tier × claim-type eligibility map for the evidence gate?

> **RULED — DR-085** *(2026-08-05, V-RULING, FINAL)*
> **The `OD-20` evidence gate ships TIER-INVARIANT WITH SHADOW MODE.**
> Eligibility is **the exact complement of spec §5.2(f)'s evidence-free list**;
> the **tier × claim-type map is an EMPTY register table V fills**; and until it
> is filled the gate **publishes what it would have suppressed beside the
> unsuppressed result**.
> **Condition:** the **map contents are V's, later** — the ruling mints an empty
> table, not entries.
> **Affected:** the evidence gate (S6); `05-register-skeleton.md` §5.4; the
> `shadow_suppression` carrier (`02` §7.10); `06-test-strategy.md` `FX-SRV-12`.

- **Blocks from:** **S6**
- **Plan source:** §6.3 **U-2** (`OD-20`)
- **Smallest form — two parts:** **What is the tier × claim-type eligibility
  map**, and **what activates risk-tiering**?
- **SEAT-PROPOSAL:** ship the gate **tier-invariant at first**, with eligibility
  = **the exact complement of §5.2(f)'s evidence-free list** (manifest §9.2f),
  and the tiering map as an **empty register table V fills**; the gate runs in
  **shadow mode**, publishing what it would have suppressed beside the
  unsuppressed band, **so its behaviour is observable before it binds**.
- **Consequence of each alternative:** **inventing per-cell eligibility is barred
  by DR-039**; **leaving the gate out entirely** loses the **causal /
  comparative / predictive coverage `OD-20` exists to add**.
- **Citations:** `OD-20`; manifest §9.2f, §5.2(f); DR-039; AC-91; Plan §6.3 U-2.

### Q-18 · Which side of the evidence-gate complement do `mixed` and `unknown` fall on?

> **RULED — DR-087** *(2026-08-05, V-RULING, FINAL)*
> **`mixed` and `unknown` are evidence-GATED (fail-closed)** — gate **unless
> proven evidence-free**. **`value-laden` is a CROSS-CUTTING FLAG, not a claim
> type**, so `OD-16`'s vocabulary **stays closed**.
> **Affected:** evidence-gate eligibility; the claim-type vocabulary;
> `06-test-strategy.md` `FX-HR-H5`, `FX-SRV-12`.

- **Blocks from:** **S6**
- **Plan source:** §6.4 **A-7**
- **Smallest form — two parts:** **Pick a side** for `mixed` and for `unknown`
  (gated / evidence-free); and **pick one** for `value-laden` — **a claim type**,
  **a cross-cutting flag**, or **a member yet to be added**.
- **SEAT-PROPOSAL:** `unknown` and `mixed` are **evidence-gated** (**fail-closed:
  gate unless proven evidence-free**), and `value-laden` is a **cross-cutting
  flag rather than a type**, because `OD-16`'s vocabulary is **closed** and
  adding a member is a **type-vocabulary revision** — precisely `OD-17`'s named
  condition.
- **Consequence of failing open on `unknown`:** an **ungated claim serves as if
  verified** — **the H5 floor breached**.
- **Citations:** `OD-16`, `OD-17`, `OD-20`; H5; Plan §6.4 A-7.

### Q-19 · Does an auto-activating hard-kill gate count as "shipped dark"?

> **RULED — DR-088** *(2026-08-05, V-RULING, FINAL)*
> **Auto-activation COUNTS AS SHIPPED DARK — the charter's not-shipped rule
> wins.** *"Auto-activates"* describes **the activation event only**: the citation
> hard-kill gate is **WRITTEN when the quote matcher validates**, **never shipped
> inert**. A **NOT-SHIPPED attestation** stands in the acceptance bundle until
> then.
> **Affected:** charter §9 contradiction 6 — **resolved**; `07-build-order.md`'s
> deferred-gate rows; the acceptance bundle; `06-test-strategy.md` `FX-DEF-01`,
> and `05-register-skeleton.md`'s coverage-gate threshold row.

- **Blocks from:** **S6**
- **Plan source:** §6.9 **item 6** (a quality-charter §9 standing contradiction,
  re-verified 2026-08-05)
- **Why the two clauses cannot both be honoured:** DR-020 **knob 7**'s
  auto-activation implies **code present and inert until the quote matcher
  validates**; charter **§5.2** says the gate *"must not exist as code that
  cannot fire"*.
- **Smallest form:** **Yes / no.** Does DR-020 knob 7's auto-activating
  hard-kill gate count as **"shipped dark"** under charter §5.2's not-shipped
  rule?
- **SEAT-PROPOSAL:** **honour the charter's not-shipped rule** — the later,
  **BLOCKING** acceptance authority — and treat *"auto-activates"* as describing
  the **activation event** rather than **licensing dormant code**: i.e. **the
  gate is written when the matcher validates**.
- **Consequence of the other ruling:** **Plan §6.7's D-4/D-5 row and §8 S6 both
  change**, and the acceptance bundle carries **a firing fixture rather than a
  NOT-SHIPPED attestation**.
- **On the record:** *"This plan does not resolve it — the earlier round did,
  silently, inside a confirmation table."*
- **Citations:** DR-020 knobs 7–8; charter §5.2 deferred table (BLOCKING,
  DR-063), A4.4; Plan §6.7, §6.9 item 6, §8 S6.

---

## Theme G — Run lifecycle and stage semantics · blocks from S7–S8

### Q-20 · What is a WAIT row, and may a run terminate with rows still in WAIT?

> **RULED — DR-089** *(2026-08-05, V-RULING, FINAL)* — **supersedes-in-part the
> literal Q61 WAIT reading.**
> **The WAIT drain law:** at debate (run) completion **NOTHING remains in a
> waiting state** — every node is fulfilled and user-visible, and a waiting node
> completes as soon as its dependencies complete.
> **Q61's direction, in V's words:** Q61 **fires AFTER the debate is completed**,
> its outcome saved to the execution ledger (DR-027); **if the debate is not
> completed or cannot complete, it never fires for that debate.** Q61 is therefore
> **not an intra-run WAIT row but a post-completion settlement event**: the run
> records a **typed terminal state at completion**, the **standing watch lives
> outside the run lifecycle** (Stage-11 / settlement) and fires when the resolver
> outcome arrives, and **calibration updates version from the ledger record**.
> **Condition:** this amends the literal reading of spec §3 Q61's *"may sit in
> WAIT indefinitely"* — **the indefinite watch persists ACROSS runs, outside any
> run, and no completed run displays a dangling WAIT.**
> **Affected:** run-termination semantics; `run_row_activation` evaluation policy;
> the Stage-11 / settlement job; `02-data-model.md` §4.1a;
> `06-test-strategy.md` `FX-LG-18`.

- **Blocks from:** **S7**
- **Plan source:** §6.2 **AM-10**
- **Why it is not settled by the pack:** suspended computation, queued job and
  re-evaluated predicate are **behaviourally distinct** — most sharply in
  **whether a run may terminate with rows still in WAIT** — and **no founding
  clause picks one**.
- **Smallest form — pick one plus a yes/no:** is a WAIT row **(a) a suspended
  computation**, **(b) a queued job**, or **(c) a re-evaluated predicate** — and
  **may a run reach a terminal state with rows still in WAIT (yes / no)**?
- **SEAT-PROPOSAL (not adopted here):** **(c) a re-evaluated predicate**,
  re-tested whenever a recorded event names one of its inputs, with
  **terminal-with-WAIT permitted** — Q61 (*"may sit in WAIT indefinitely without
  that being a defect"*, spec §3.11) is **at least one row where it must be**.
- **Consequence:** the choice **decides run termination semantics and therefore
  what a completed run means**.
- **Carrier that fits all three:** `run_row_activation` (Plan §4.1a) is an
  **immutable row** holding `{predicate_ref}`, with `{state, predicate_inputs,
  skip_evidence}` on the append-only **`run_row_activation_event`** stream, the
  current state **derived from the latest event** (mandatory initial event at
  run creation), and `last_evaluated_at_seq` **derived** as that latest event's
  `at_seq`. **Only the runner's evaluation policy differs between the three
  answers.** The wake and terminality decision is recorded in the C4
  row-contract document **after** V rules, not before.
- **Invariant under every answer:** `POLICY_BLOCKED` is **never filed as
  INACTIVE** (spec §1).
- **Citations:** spec §1, §3.11 Q61; Plan §4.1a, §6.2 AM-10.

### Q-21 · What measured quantity licenses "measured behavioural difference"?

> **RULED — DR-090** *(2026-08-05, V-RULING, FINAL)*
> **Rival-carver selection runs on the MAKER-DIVERSITY FLOOR ALONE (DR-013)**, and
> *"measured behavioural difference"* is **recorded as UNAVAILABLE, not
> approximated**. **A future real metric lands as a register/scorecard upgrade —
> no re-architecture.**
> **Affected:** SPLIT rival-carver selection (S7); the scorecard successor list;
> `05-register-skeleton.md` §5.5, where it stays a **never-a-row** entry.

- **Blocks from:** **S7**
- **Plan source:** §6.2 **AM-14**
- **Smallest form:** **Name the quantity, or rule that none exists yet.** What
  measured quantity licenses *"measured behavioural difference"* for
  **rival-carver selection**, given Tier-1's process facts contain **no pairwise
  difference metric**?
- **SEAT-PROPOSAL:** until a metric exists **with facts behind it**,
  rival-carver selection runs on the **maker-diversity floor alone (DR-013)**
  and the *"measured difference"* criterion is **recorded as unavailable, not
  approximated**.
- **Consequence of each alternative:** **approximating it mints a measurement
  (DR-039)**; **implementing a selection rule keyed on a metric nobody
  produces** ships **a branch that cannot fire** (charter **G3/G4**).
- **Not asked — already ruled:** the paired half, the **provenance key width**,
  is ruled at **DR-062 `OD-09`** and needs no question.
- **Citations:** spec §9.4 D-10, §16.1 K-1, §7.4 E-11; DR-013, DR-039,
  DR-062 `OD-09`; charter §5.1 G3, G4; Plan §6.2 AM-14.

### Q-22 · On a casual run, how does the Stage-8 rule read a Stage-9 quantity?

> **RULED — DR-091** *(2026-08-05, V-RULING, FINAL)*
> **The CASUAL-tier blind-verification trigger is the CROSS-entry leverage
> snapshot** — computed from the then-current graph **by the pure core, with no
> model calls** — and it is **recorded as the trigger's basis**. **The
> COMPOSE-time recomputation is authoritative.** **V explicitly authorizes the
> proxy the plan refused to select silently.**
> **Condition:** **standard and high-stakes coverage is unchanged** — CROSS always
> verifies at those tiers (DR-019 knob 3).
> **Affected:** the CROSS row contract (S8); `06-test-strategy.md` §12's S8 row.

- **Blocks from:** **S8**
- **Plan source:** §6.2 **AM-2**
- **What narrows it and does not close it:** DR-019 **knob 3** requires blind
  verification **always** for **STANDARD** and **HIGH-STAKES** and for
  **contested verdicts** — so the flip-sensitive trigger only decides coverage on
  **CASUAL** runs. But on those runs **it decides whether blind verification
  executes at all**, which **changes calls and can change the served result**.
- **Smallest form:** **Pick one** — **(a) a CROSS-entry proxy**, **(b) a
  re-entry after COMPOSE**, or **(c) verify-all**.
- **SEAT-PROPOSAL (not adopted here):** **(a)** — a **CROSS-entry leverage
  snapshot** computed from the then-current graph (the propagation core is pure
  and cheap, AC-09, so removal-based leverage is computable at any stage boundary
  **with no model call**), **recorded as the coverage trigger's basis**, with the
  **COMPOSE-time recomputation authoritative**.
- **Consequence:** the three options produce **different call counts and
  potentially different served answers**, and **no DR authorizes a proxy** — so
  selecting one here would be an architecture seat ruling a coverage question.
- **Until ruled:** **the C4 row contract must not select a proxy silently**; it
  records the trigger as **unresolved on casual runs**, and the shape supports
  all three.
- **Citations:** DR-019 knob 3; AC-09; Plan §6.2 AM-2.

### Q-23 · Over which action population does the Q34 symmetry diff run?

> **RULED — DR-092** *(2026-08-05, V-RULING, FINAL)*
> **The Q34 symmetry diff runs over ITEM-SCOPED ACTIONS ONLY** — the
> subject-carrying members of the closed action vocabulary. **Pre-item actions are
> excluded BY KIND, never by value, so `UNASSIGNED` stays a real signal.**
> **Consequence V accepted with the ruling:** the **fairness launch fixture
> becomes passable as designed** — the literal reading under which nearly every
> run came out `UNINSTRUMENTED` is superseded.
> **Affected:** the Q34 symmetry machinery (S8); the A-12 launch fixture;
> `06-test-strategy.md` `FX-S22-02`, `FX-LED-04`.

- **Blocks from:** **S8**
- **Plan source:** §6.2 **AM-4**
- **The defect being asked about:** `UNASSIGNED` is **both a legal member and an
  automatic `UNINSTRUMENTED` trigger**, and the diff population is unscoped.
- **Smallest form:** **Pick one** — **(a) only actions carrying a
  `subject_item_id`**, or **(b) every recorded action**.
- **SEAT-PROPOSAL:** **(a)** — scope the diff to the **item-scoped members of the
  closed action vocabulary**; pre-item actions (Q15 query runs, Q17 absence
  rows) are recorded with a null subject **by type**, **excluded from the diff
  population by kind rather than by value**, so **`UNASSIGNED` stays a real
  signal**.
- **Consequence of (b) — the literal reading:** **nearly every run is
  `UNINSTRUMENTED`**, the **fairness claim is permanently withheld**, and
  **A-12's deliberate-asymmetry fixture — a launch gate — cannot pass.**
- **Citations:** spec §8.1 A-1, A-2, A-6, A-12; spec §22.1 symmetry row;
  Plan §6.2 AM-4.

---

## Theme H — Budget authority and risk tier · blocks from S9

### Q-24 · Who supplies the per-row correctness/enrichment classification, and when?

> **RULED — DR-093** *(2026-08-05, V-RULING, FINAL)* — **the SEAT-PROPOSAL below
> is AMENDED**, from *UNCLASSIFIED-until-filled* to *propose-and-ratify-once*.
> **The per-row correctness/enrichment classification is produced by ARCHITECTURE
> PROPOSING THE FULL 71-ROW SPLIT and V RATIFYING ONCE** — one sitting, alongside
> the register, in the wholesale-register pattern of DR-061/DR-062.
> **Clarified on the record by V:** this is **one-time design-time config, fully
> automatic at runtime, with no human in any user's loop.**
> **Condition:** **until ratified, rows behave as correctness and are never
> skipped.** The proposal drafts with the register-ratification package
> (board ticket **PRE-06**; sitting **VG-02**), at which point **LRD-1** —
> charter §5.2 row 6's fixture — becomes constructible.
> **Affected:** the budget/envelope subsystem (S9); `05-register-skeleton.md`
> §5.4; the acceptance bundle; `06-test-strategy.md` `FX-C52-06`.

- **Blocks from:** **S9** — and it is one of the **two explicit launch-readiness
  dependencies** recorded in `07-build-order.md` §7 (**LRD-1**).
- **Plan source:** §6.1 **OQ-G2**
- **Smallest form:** **Pick one** — does the per-row correctness/enrichment
  classification come from **(a) V at flag ratification**, or **(b) the
  architecture mission**?
- **SEAT-PROPOSAL:** model the classification as a **per-row contract field whose
  unset value is a distinct typed `UNCLASSIFIED` state** — aligned with OQ-G9's
  `POLICY_BLOCKED` idiom rather than a silent default. `UNCLASSIFIED` **(a) is
  treated as correctness at runtime**, so **no row is ever silently skipped**,
  and **(b) is reported by the acceptance bundle as an outstanding item**, so
  **the gap is loud rather than absorbed**. V fills the enrichment side at
  DR-023.
- **Consequence:** **until at least one row is classified enrichment, the
  envelope's enrichment-skip terminal cannot fire and charter §5.2 row 6's
  fixture is unconstructible — a BLOCKING row.** This is why it is recorded as
  an **explicit launch-readiness dependency** in `07-build-order.md` rather than
  left as a discovered surprise. **A silent `CORRECTNESS` default would have
  disabled a blocking gate while looking healthy.**
- **Citations:** spec §21.2 N-14, N-11; `OD-A-04`; charter §5.2 row 6, A4.4;
  DR-023, DR-052; Plan §6.1 OQ-G2, §7 doc 8, §8 S9/S15.

### Q-25 · Who sets the risk tier?

> **RULED — DR-094** *(2026-08-05, V-RULING, FINAL)*
> **The asker DECLARES the risk tier; deployment policy may RAISE it but NEVER
> LOWER it.** `tier_source` provenance is **recorded and printed as designed**.
> **Consistent with** DR-078's user-facing tier dials and DR-070's asker ruling.
> **Affected:** `POST /v1/asks`; the abstention price cell; the cost envelope;
> CROSS coverage; DR-055's launch gate; `06-test-strategy.md` `FX-DB-07`, which
> gains the raise-never-lower direction.

- **Blocks from:** **S9**
- **Plan source:** §6.2 **AM-5**
- **What the pack settles, and what it does not:** it settles **presence**, not
  **authority**. ui §1.2 says the Ask carries a risk tier and §2 surface 3 calls
  it a required input — **neither assigns ownership** — and DR-021 knob 11
  enumerates the asker's per-run properties (decision/action owner, caller
  scope, `as_of`) **without naming the tier**.
- **Smallest form:** **Pick one** — **(a) the asker**, **(b) deployment policy**,
  or **(c) derivation from the question**.
- **SEAT-PROPOSAL (not adopted here):** **asker-declared, with a deployment
  policy able to raise but never lower it.**
- **Consequence:** the tier drives **four ruled behaviours** keyed on an unowned
  input — the abstention price cell (DR-011/DR-012), the cost envelope (DR-052),
  CROSS blind-verification coverage (DR-019 knob 3) and the **DR-055 launch
  gate**.
- **Design that fits every answer:** the field is **non-nullable** on
  `POST /v1/asks` and carries **`tier_source ∈ {ASKER, DEPLOYMENT_POLICY,
  DERIVED}`** with its provenance recorded — so **whichever way V rules, the
  supplier is modelled and printed rather than assumed** (Plan §5.3).
- **Citations:** ui §1.2, §2 surface 3; DR-021 knob 11, DR-011, DR-012, DR-052,
  DR-019 knob 3, DR-055; Plan §5.3, §6.2 AM-5.

---

## Theme I — The kept interface · blocks from S14

### Q-26 · What does "kept component" mean?

> **RULED — DR-095** *(2026-08-05, V-RULING, FINAL)*
> **"Kept component" means KEPT SURFACE, REBUILT INSIDES.** The **pages, canvas,
> drawers, badges and navigation stay**; **components are rebuilt inside as the
> flex rows require**; and **each altered component is approved at its mockup
> review** (DR-064).
> **Affected:** the UI data-layer rebuild (S14); W8/W10 buildability.

- **Blocks from:** **S14**
- **Plan source:** §6.5 **C5**
- **Smallest form:** **Pick one** — does "kept component" mean **(a) the
  component's source is preserved**, or **(b) the page, canvas, drawer, badges
  and navigation a person moves through are preserved while the component is
  rebuilt inside**?
- **SEAT-PROPOSAL:** **(b)** — DR-048's own re-scoping is *"keep the surface,
  rebuild the plumbing"*, and the flex rows already require **new slots inside
  existing components** (a long-form text slot on the canvas card; an edge list
  or drawn arrows under a node).
- **Consequence of (a) — the source-preserving reading:** **W8 (node envelope)
  and W10 (edges, XL) cannot be built at all**, because `NodeScores` is a
  **closed 8-key float record pinned on both sides** and **the tree carries no
  edges**.
- **Consequence of (b):** each **altered component is approved at its mockup
  review** (DR-064).
- **Citations:** DR-048, DR-064; ui §5 W8, W10; Plan §6.5 C5.

### Q-27 · Does V3 carry a verdict-first presentation flag at all?

> **RULED — DR-096** *(2026-08-05, V-RULING, FINAL)*
> **NO verdict-first presentation flag.** **The verdict banner renders
> unconditionally**; **honesty surfaces 1 and 4 always have their landing place**;
> **the register carries no such row.**
> **Affected:** the UI (S14); `05-register-skeleton.md` — the row is
> **deliberately absent**, recorded as a deletion at §5.4-i and as a
> **never-a-row** entry at §5.5, so re-adding it contradicts a ruling rather than
> filling a gap.

- **Blocks from:** **S14**
- **Plan source:** §6.5 **C8** (`NEXT_PUBLIC_VERDICT_FIRST_UI`)
- **What DR-023 does and does not settle:** it settles **who ratifies the
  register** and that V3's set need not reflect V2's; it does **not** settle this
  row's value **or whether the row exists at all**, and ui §6 C8 records the
  disposition as **a V choice**.
- **Smallest form:** **Yes / no + a default.** Does V3 carry a verdict-first
  presentation flag at all — and if so, what is its default?
- **SEAT-PROPOSAL (not adopted here):** **carry no such flag**; render the
  verdict banner **unconditionally**, since flex rows 1 and 4 put content **in
  and beside** that banner and a flag that can dark it makes **two honesty
  surfaces conditional**.
- **Consequence of each alternative:** if the flag **exists and defaults off**,
  the verdict banner *"may be dark in the current deployment"* (ui §6 C8) and
  **surfaces 1 and 4 lose their landing place**; if it **exists and defaults
  on**, it is a **G4 subject needing both branches exercised**.
- **Design that fits either answer:** **every honesty surface renders
  independently of any presentation flag, and no such flag ships until V rules**
  — so the architecture is not waiting on the answer, **only the interface's
  banner treatment is**.
- **Citations:** DR-023; ui §6 C8; charter §5.1 G4; Plan §6.5 C8, §6.7.

---

## Theme J — Orphan reach over the register · blocks from S15

### Q-28 · Is a register row with no executable unit inside charter clause 4's reach?

> **RULED — DR-097** *(2026-08-05, V-RULING, FINAL)* — **the SEAT-PROPOSAL below
> is ADOPTED, with V's amendment on top.**
> **An unratified register row is OUTSIDE charter clause 4's orphan reach.**
> Register rows are **data, not code**; the never-called list **stays about
> executable units**; and **AC-74's ratify-before-production gate governs the
> register.**
> **V's amendment:** an **advisory (non-blocking) audit reports any key no code
> ever reads after full build**, so **stale rows are noticed without exemption
> paperwork**.
> **Consequence NOT incurred:** the S15 never-called list is **not** non-empty by
> construction, and **no unratified key needs a dated A4.3 exemption**.
> **Affected:** the S15 launch bundle; the never-called list's scope; the
> orphan-audit tooling's advisory lane (`06-test-strategy.md` `FX-ORPH-07`).
> Closes charter §9 item 7, resolves charter §9 contradiction 7, and **satisfies
> LRD-2**.

- **Blocks from:** **S15** — and it is the second of the **two explicit
  launch-readiness dependencies** in `07-build-order.md` §7 (**LRD-2**).
  **Must be answered before S15.**
- **Plan source:** §6.9 **item 7** (a quality-charter §9 standing contradiction)
- **Why it is not abstract:** `packages/register` ships **a skeleton of keys with
  no values** (Plan §4.6, §7 doc 6; AC-76 bars invented values). **Under one
  reading every unfilled key is an entry on the BLOCKING never-called list at
  S15; under the other, none is.**
- **Smallest form:** **Yes / no.** Is class (3) — *a register row with no
  executable unit* — inside charter clause 4's reach; i.e. **is an unratified
  register key an orphan**?
- **SEAT-PROPOSAL:** **class (3) is outside clause 4's reach** — **VR-4 itself
  distinguishes it from code-behind-a-flag**, and the register's own discipline
  (**AC-74**: V ratifies before production) is the mechanism that governs it.
- **Consequence of "inside":** the **S15 never-called list is non-empty by
  construction until the whole register is ratified**, and **every unratified key
  needs a dated V exemption** (charter **A4.3**).
- **Citations:** charter §5, §5.1 G2, §5.3 A4.2/A4.3, VR-4; AC-74, AC-76, AC-77;
  Plan §4.6, §6.9 item 7, §7 doc 6, §8 S15.

---

*End of `08-open-questions-for-V.md` — ARCH-V3-R1 / C4 lane 7, 2026-08-05;
annotated with V's rulings 2026-08-06 under PROG-V3-R1 ticket **PRE-03**.
**Exactly 28 entries, Q-01 … Q-28, and nothing else** — this document is the
28-entry question register and carries no review record, steering record or
residual-risk dossier (those live in the mission's V-decisions packet and in
`reviews/`). **None of the 28 was ruled by this seat; all 28 were ruled by V at
DR-068 … DR-097** and are annotated above, with the question text preserved
verbatim as history. The provisional-status banner is discharged by
DR-098/DR-100.
**The ledger, not this file, is the authority for any ruling's exact terms.***
