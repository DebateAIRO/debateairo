# 01-decisions — the ADR set

ARCH-V3-R1 / C4 lane 2 · 2026-08-05 · rework round 1 applied
(`reviews/merge-verdict-c4.md`: H-C-3, H-O-15).
**Post-ruling fold-in applied 2026-08-06** by PROG-V3-R1 ticket **PRE-04**
(board `debateai-v3`, `t_c3538824`), under **DR-100**'s follow-through.
**Stack sitting applied 2026-08-07 (rev 2)** by PROG-V3-R1 ticket **PRE-10**
(`t_d467ee8a`), under **DR-117** and **DR-118**. The **TypeScript instantiation is
the ruled text**; the Python/FastAPI episode of DR-105 is **superseded and
preserved as a record**; **two new ADRs are minted** (0017 durable execution,
0018 deployment topology); **`DR-115`**'s no-scaffolded-data law is carried in
ADR-0009 and ADR-0012. **§5 is the rev-2 record, and §5.6 is the superseded
episode's index.**

**Eighteen ADRs.** Fourteen are the **planned set** of Plan.md rev 3 §7 row 2,
taken in that row's stated order. Four were minted after the architecture
closed, by V's own instruction:

- **ADR-0015** — minted by **DR-099 amendment A-02** (one of the four
  amendments ruled *individually* in that sitting), and named again in
  **DR-100**'s follow-through list.
- **ADR-0016** — the record **DR-068** and **DR-069** call for in their
  affected-rows columns (see §2 for the numbering resolution).
- **ADR-0017** — **minted by DR-118**: durable execution, the one sub-decision
  DR-117's stack sitting left open.
- **ADR-0018** — **minted by DR-117**: deployment topology, the first subject the
  C4 plan did not anticipate at all.

## Decision status across the set

| Set | Status | Authority |
|---|---|---|
| **ADR-0001, 0002, 0003, 0009, 0012** — *the five stack ADRs* | **RULED at the DR-117 stack sitting (V + all the humans in the loop, FINAL).** TypeScript on Node · Fastify + SSE · PostgreSQL + Drizzle · Vitest/fast-check/Testcontainers. **The original C4 text is the ruled text**; the DR-105 Python instantiation is **SUPERSEDED** and preserved in each file's *"superseded episode"* section. **GPG-2 is discharged** — itemized, at a human sitting. | **DR-117**; DR-116 (the sitting's mandate); DR-105 superseded |
| **ADR-0017** | **RULED — DR-118.** Hatchet, self-hosted, Postgres-first, **dispatcher only**. Evaluation record: `ratification/hatchet-vs-inngest-grok.md`. | DR-118; acceptance bar = ADR-0009 |
| **ADR-0018** | **RULED — DR-117.** Docker Compose + Hetzner + Cloudflare; one-transport law holds through the proxy; vLLM as one provider adapter. | DR-117 |
| **ADR-0004 … 0008, 0010, 0011, 0013, 0014** — *the nine survivors* | **ACCEPTED wholesale via DR-098 (VS-1)**, and **untouched by DR-105 and by DR-117 alike** — Plan.md §9's bounded-replacement law puts the context map, the data model and the API direction outside the blast radius, **in both directions**. | DR-098; closure at DR-100; **Plan.md §9** |
| **ADR-0015** | **ACCEPTED — individually minted** at DR-099/A-02. Untouched. Its two predicates are what ADR-0018 clause 3(c) attributes a locally-served model into — **the inventory's design is unchanged and unrestated**. | DR-099 (A-02) |
| **ADR-0016** | **ACCEPTED — records a V ruling** (DR-068 + DR-069, both FINAL). Untouched, and **restored to full force by DR-117**: with one language again, the single type graph the no-fence ruling bought is real rather than replaced. | DR-068, DR-069 |

**Eleven ADRs carry no edit from PRE-10 in either revision.** That is not an
omission: it is Plan.md §9's bound, executed **and then executed again in
reverse**. A reviewer who expects a stack change to ripple across the set should
read §9 first — *"if V rules a different language, §3's context map, §4's data
model and §5's API direction survive unchanged; only §2.2–§2.7 are
re-instantiated."* A language was ruled in and ruled out inside twenty-four
hours, and `02-data-model.md` was never opened.

The old set-wide status — *PROPOSED — V ratifies (DR-005/DR-024)* — is **spent**
and carried by no ADR; it survives only in this README's change record below.
So is the **conditional-authorship
banner**: the four-line note every file carried while the C2 plan gate was
frozen at the rework cap. **DR-098** discharged both review-loop freezes, and
**DR-100** ordered the banners off. A grep for that banner's marker word returns
**zero hits** in this directory, by design.

Two things the DR-098 status was **not**, stated so nobody reads more into it
than V gave at the time: it was **not** a per-ADR ruling, and it was **not** an
itemized ratification of the stack's individual technology choices. GPG-2 was
satisfied *wholesale*. **That gap is now closed.** DR-104(2) recorded a
*"keep the same Backend Stack"* reading; **DR-105** replaced the language;
**DR-116** ruled that the backend stack belongs to **all the humans in the loop**
and made DR-105 CONDITIONAL pending a sitting; **DR-117** is that sitting, and it
names the language, the API framework and realtime transport, the database
tooling, durable execution, the worker language, the local model and the
deployment target **one by one**. **GPG-2 is discharged, itemized.** Values remain
V's separately at **DR-023** (register) and **VG-02** (the ratification packages);
the **five** bootstrap pins fill at **S00** under **DR-104**'s resolve-on-machine
rule.

| ADR | Decision | Planned-set entry (Plan.md §7 row 2) |
|---|---|---|
| [0001](ADR-0001-language-and-runtime.md) | Language and runtime — **RULED, DR-117** (TypeScript on Node; workers TS initially) | language + runtime |
| [0002](ADR-0002-api-encoding-and-front-door.md) | API encoding and the single front door — **RULED, DR-117** (Fastify + SSE) | API encoding and front door |
| [0003](ADR-0003-postgres-access-and-migration-tooling.md) | Postgres access and migration tooling — **RULED, DR-117** (PostgreSQL + Drizzle) | Postgres access + migration tooling |
| [0004](ADR-0004-evaluation-snapshot-purity-seam.md) | The evaluation-snapshot purity seam, and the recorded arrow order | the evaluation-snapshot purity seam |
| [0005](ADR-0005-polymorphic-edge-and-undercut-carrier.md) | The polymorphic edge and the undercut carrier | the polymorphic edge and the undercut carrier |
| [0006](ADR-0006-ledger-ordering-and-hash-triple.md) | Ledger ordering and the hash triple | ledger ordering and the hash triple |
| [0007](ADR-0007-projections-computed-at-read-time.md) | Frozen artifacts versus projections computed at read time | projections computed at read time |
| [0008](ADR-0008-event-payload-grade.md) | Event payload grade, and the stream's E4 obligation | the event payload grade |
| [0009](ADR-0009-job-execution-in-postgres.md) | Job execution inside Postgres — **RULED, DR-117**; its seven laws are **ADR-0017's acceptance bar** | job execution in Postgres |
| [0010](ADR-0010-orphan-audit-mechanism.md) | The orphan-audit mechanism, and how AC-61's consumer direction is decided | the orphan-audit mechanism |
| [0011](ADR-0011-register-mechanism-and-resolution-chains.md) | The register mechanism and resolution chains | the register mechanism and resolution chains |
| [0012](ADR-0012-test-stack-and-replay-ceremony-isolation.md) | The test stack, and the replay ceremony's isolation — **RULED, DR-117**; clause 7 carries **DR-115** | the test stack and the replay-ceremony isolation |
| [0013](ADR-0013-authorization-tiers.md) | Three authorization tiers on one handle | authorization tiers |
| [0014](ADR-0014-segment-addressed-composed-text.md) | Segment-addressed composed text, and the eviction carrier | segment-addressed composed text |
| [**0015**](ADR-0015-deployment-maker-inventory.md) | **The deployment maker inventory: two predicates, not one** | *not in the planned set* — minted by **DR-099/A-02** |
| [**0016**](ADR-0016-repository-layout-no-fence.md) | **Repository layout: kept UI as a plain in-repo package, no fence** | *not in the planned set* — records **DR-068 + DR-069** |
| [**0017**](ADR-0017-durable-execution-hatchet.md) | **Durable execution: Hatchet as dispatcher** — self-hosted, Postgres-first, dispatcher only | *not in the planned set* — minted by **DR-118** |
| [**0018**](ADR-0018-deployment-topology.md) | **Deployment topology: Docker Compose on Hetzner behind Cloudflare, with vLLM as a provider adapter** | *not in the planned set* — minted by **DR-117** |

---

## 1. Question addressing — the Q-nn ↔ Plan-id ↔ ruling mapping

**`Q-nn` is the primary C4 address.** The Plan.md id follows in parentheses as
**provenance only**. The register of all 28 questions is
`08-open-questions-for-V.md`; this table is the subset the ADR set cites, with
the blocks-from-slice field as 08 carries it.

**All 28 are RULED** — DR-068 .. DR-097, 30 rulings (Q-08 and Q-14 each yielded
two rows), register complete 2026-08-05, closure emitted at **DR-100**. The
behaviour marker that every ADR used to carry — `pending V — Q-nn (Plan-id)` —
is spent and **appears in no ADR** (it survives only in this README's own
change record). Each ADR now carries `RULED — Q-nn (DR-0nn)` in its place.

| Q-nn | Plan id | Blocks from | **Ruled by** | Cited by |
|---|---|---|---|---|
| **Q-01** | §6.10 AQ-2 | S0 | **DR-068** | 0001, 0002, 0010, 0012, **0016** |
| **Q-02** | §6.10 AQ-3 | S0 *(cond. — asked only if Q-01 = yes)* | **DR-069** | 0001, 0002, 0010, 0012, **0016** |
| **Q-03** | §6.2 AM-12 | S0 | **DR-070** | 0008, 0013 |
| **Q-04** | §6.4 A-1 | S2 | **DR-071** | 0003, 0005 |
| **Q-05** | §6.4 A-3 | S3 | **DR-072** | 0004 |
| **Q-06** | §6.4 A-4 | S3 | **DR-073** | 0004, 0005 |
| **Q-07** | §6.4 A-8 | S3 | **DR-074** | 0004, **0011** |
| **Q-08** | §6.4 A-9 | S3 | **DR-075** + **DR-076** *(V's amendment)* | 0004, **0005** |
| **Q-09** | §6.3 U-4 ≡ §6.4 A-6 | S4 | **DR-077** | 0006, 0012 |
| **Q-10** | §6.1 OQ-G3 | S5 | **DR-078** | 0011, 0014 |
| **Q-11** | §6.2 AM-1 | S5 *(S0 only if narrower than exhaustive)* | **DR-079** | 0007, 0012, 0014 |
| **Q-12** | §6.2 AM-3 | S5 | **DR-080** | 0011 |
| **Q-13** | §6.3 U-1 | S5 | **DR-081** | 0007, 0011 |
| **Q-14** | §6.10 AQ-1 | S5 | **DR-082** *(half i)* + **DR-086** *(half ii)* | 0014 |
| **Q-15** | §6.1 OQ-G9 | S6 | **DR-083** | 0009 |
| **Q-19** | §6.9 item 6 | S6 | **DR-088** | 0010, 0011 |
| **Q-20** | §6.2 AM-10 | S7 | **DR-089** | 0006, 0009 |
| **Q-24** | §6.1 OQ-G2 | S9 | **DR-093** | 0009 |
| **Q-25** | §6.2 AM-5 | S9 | **DR-094** | 0013 |
| **Q-26** | §6.5 C5 | S14 | **DR-095** | 0002, 0008, 0013, **0016** |
| **Q-28** | §6.9 item 7 | S15 | **DR-097** | 0010, 0011 |

*The seven questions the ADR set never cited — Q-16 (DR-084), Q-17 (DR-085),
Q-18 (DR-087), Q-21 (DR-090), Q-22 (DR-091), Q-23 (DR-092), Q-27 (DR-096) — are
ruled too; they land in other C4 documents. The full register is the ledger.*

**Plan ids cited in the ADR set that deliberately carry NO Q-nn**, because
Plan.md §6 disposes them and they are not among 08's 28 questions:

| Plan id | Disposition | Cited by |
|---|---|---|
| §6.1 OQ-G5 | RESOLVED-BY-PACK (DR-066(1)) | 0013 |
| §6.2 AM-6 | DESIGN-NEUTRALIZED | 0007 |
| §6.2 AM-8 | DESIGN-NEUTRALIZED | 0009 |
| §6.2 AM-11 | DESIGN-NEUTRALIZED | 0004 |
| §6.3 U-3 | RESOLVED-BY-PACK | 0012 |
| §6.3 U-5 | RESOLVED-BY-PACK (by entailment) | 0006 |
| §6.4 A-2 | DESIGN-NEUTRALIZED | 0005 |
| §6.5 C6 | DESIGN-NEUTRALIZED | 0008 |
| §6.6 UI-2 | RESOLVED-BY-PACK | 0005 |
| §6.6 UI-3, UI-9, UI-13 | DESIGN-NEUTRALIZED | 0007 |
| §6.6 UI-4 | DESIGN-NEUTRALIZED | 0014 |
| §6.6 UI-5 | DESIGN-NEUTRALIZED | 0002, 0013 |
| §6.6 UI-6 | DESIGN-NEUTRALIZED | 0008 |
| §6.6 UI-11 | RESOLVED-BY-PACK | 0010 |
| §6.9 items 2, 3 | RESOLVED-BY-PACK | 0010 |

An ADR reader who finds a Plan id with no Q-nn beside it is looking at a
**settled** item, not a pending one. Each ADR's *Questions this ADR does not
rule* section restates this rule in its **Addressing** lead-in.

---

## 2. The ADR-0015 and ADR-0016 numbering resolution

**Two ledger rows pointed the same number at two different decisions.** The
conflict is resolved here, on the record, rather than silently.

**The conflict.**

| Citation | Text as the ledger carries it | Subject it means |
|---|---|---|
| **DR-099 / A-02** | *"ADR-0015 minted"* — in the sitting that ruled A-01..A-04 **individually** | the **deployment maker inventory** (two predicates), decision text at `03-module-design.md` §7.3 |
| **DR-068** (affected rows) | *"ADR-0015 scope"* | the **repo-layout / kept-UI** decision |
| **DR-069** (affected rows) | *"ADR on the repo-layout decision"* | the **repo-layout / no-fence** decision — no number given |

**The resolution.**

1. **`ADR-0015` = the deployment maker inventory.** DR-099/A-02 is the
   **specific, individually-ruled mint**: it names the number *and* the subject
   in the same breath, and **DR-100**'s follow-through list repeats it
   (*"mint ADR-0015"*). A ruling that names both keeps the number.
2. **`ADR-0016` = the repo-layout / no-fence decision.** DR-069 asks only for
   *"ADR on the repo-layout decision"* — a **document**, not a number. DR-068's
   *"ADR-0015 scope"* was written **before** DR-099 existed, when 0015 was the
   next free number; it is a stale forward-reference, not a competing mint.
3. **Both DR-068's and DR-069's citations resolve to
   [ADR-0016](ADR-0016-repository-layout-no-fence.md).** Each new ADR carries a
   reciprocal *Numbering note* pointing at the other and at this section, so a
   reader arriving from either ledger row lands correctly.
4. **No number is reused, retired or renumbered.** ADR-0001..0014 are untouched;
   cross-references between them keep resolving (see G2-1 below — renumbering is
   not free, and none was done).

**Why this was not settled earlier** *(the historical record, preserved)*.
Review finding **H-O-15** raised that the two-predicate maker inventory meets
Plan.md §7 row 2's *"one ADR per irreversible or contested choice"* test — a
contested rework-round design carrying a **BLOCKING** launch gate
(AC-38 · DR-055; charter S4) and a typed API refusal — yet had no ADR. Lane 2
**accepted the substantive point and declined to mint**, for a scope reason
rather than a merit reason: the planned set is fixed at fourteen by the same row
that states the rule, and extending a C4 document's scope is not a lane's to do.
It was raised as **a directed item for the merge node / FinalPlan**, not
silently fixed. **V granted the extension at DR-099/A-02**, and this file is the
grant executed. The decision was never lost in the interval: its owner is
context 16 (`providers`), its two-predicate table lives at
`03-module-design.md` §7.3, and it was fixtured **both ways** as `FX-PRV-01a`
and `FX-PRV-01b` in `06-test-strategy.md` with the S15 attestation **BLOCKING**,
so AC-79's fire-both-ways discipline was discharged by lane 6 throughout.

**The residual that lane 2 flagged for lane 1 is now owed by PRE-01:**
`09-traceability.md`'s AC-38 cross-reference cell should now point at
**ADR-0015** as well as `03-module-design.md` §7.3 and the two fixtures — the
"noting the absent ADR" half of that cell is spent.

---

## 3. Gaps found while authoring — listed, not silently fixed

Discharging the C4 authoring law for this lane (raised by **H-O-15**: the five
gaps reported at handoff were not in the reviewed artifact set). Re-verified at
rework round 1; re-verified again at the PRE-04 fold-in.

| # | Gap | Status at round 1 | Status after the fold-in (2026-08-06) |
|---:|---|---|---|
| **G2-1** | Plan.md §7 row 2 gives the fourteen ADRs as an **unnumbered prose list with no titles**. The `ADR-0001..0014` numbering and the kebab-case titles are this seat's, taken in the row's stated order; the plan fixes neither. | **STANDS** — a naming decision the contract does not make. Cross-references between ADRs use these numbers, so renumbering is not free. | **STANDS, and is now load-bearing.** §2's resolution turned on it: because renumbering is not free, the conflict was resolved by *assigning the free number* (0016) rather than by moving 0015. Two numbers are now V-minted rather than seat-chosen. |
| **G2-2** | The packet's authoring law 5 asks for `Q-nn` addresses, but **Plan.md never mints a Q-nn sequence** — §7 doc 9 defines the set by its §6 ids. The mapping existed only in `08`. | **RESOLVED at round 1** by H-C-3: `Q-nn` is now the primary address in all fourteen ADRs, with §1's mapping table as the lane's copy. | **CLOSED.** §1 now also carries the ruling column, so every Q-nn address resolves to a DR. |
| **G2-3** | The planned set names **Seam A only**. Seam B (single-writer graph transaction) is carried inside ADR-0005, Seam C's write ordering inside ADR-0009, Seam D inside ADR-0007 — none has an ADR of its own, and **AC-38's deployment half has none at all**. | **STANDS**, and is §2 above. | **HALF DISCHARGED.** AC-38's deployment half now has **ADR-0015**. Seams B/C/D remain decided *as consequences inside other ADRs* — an addressing shape, not a missing decision; no ruling has extended the planned set for them. |
| **G2-4** | Two contested items have **no ADR in the planned fourteen**: AC-11's *"required node"* predicate (assigned to `02-data-model.md` by §7 row 3) and AC-24's band-ceiling carrier (§5.4 → `04-api-contract.md`). Both were rework-round repairs; both are referenced from the ADR set but decided in neither. | **STANDS** — same scope reason as §2: extending the planned set is not a lane's to do. | **BOTH NOW DECIDED, NEITHER GIVEN ITS OWN ADR.** AC-24's band ceiling is ruled by **DR-082** (second independent gate; `band_ceiling {label, basis}` on the Answer) and **DR-086** (it caps the band, never blocks) — folded into **ADR-0014** and carried at `04-api-contract.md` §9.5. AC-11's required-node predicate is carried by **DR-099/A-04**'s `JUDGEMENT_SCHEDULED` action-kind (`02-data-model.md` §11A.4, gap DM-4), which is `02`'s to fold in (PRE-02). Exactly two new ADRs exist — 0015 (minted at DR-099/A-02) and 0016 (the record DR-069 calls for) — and neither of these two items is among them. Both are **decided and carried elsewhere**, which is where the rulings put them; no ruling asked for an ADR. |
| **G2-5** | *"Toolchain-version register keys are owed by `05-register-skeleton.md`."* | **WITHDRAWN — this seat's MISREAD**, per H-O-15's citation, verified. | **WITHDRAWN, unchanged.** The version *values* are still open, gated at **VG-01** (GPG-4). |

**No gap in this table was repaired by inventing scope.** G2-1 and G2-3 stand,
G2-2 is closed, G2-4 is decided-elsewhere, G2-5 is withdrawn.

---

## 4. Fold-in record — what PRE-04 changed, and under which ruling

Reviewer aid. Every edit in this directory traces to a row below; **no edit was
made without one** (standing law: no invented numbers — AC-76 / DR-039).

| Change | Files | Authority |
|---|---|---|
| Conditional-authorship banner removed (4-line block + blank) | all 15 pre-existing files | DR-098 (freezes discharged) + DR-100 (banners off) |
| Status flipped from *PROPOSED — V ratifies* | ADR-0001..0014, README | DR-098 (VS-1) — wholesale; itemized confirmation then *expected* at VG-01. **Historical row: the itemized confirmation was in fact taken at the DR-116 human stack sitting and landed as `DR-117` + `DR-118`, not at VG-01 — §5.1.** |
| **ADR-0015 minted** | new file | DR-099/A-02; DR-100 follow-through |
| **ADR-0016 minted** | new file | DR-068 + DR-069 (their affected-rows columns) |
| Numbering conflict resolved | README §2; both new ADRs | this ticket's resolution, recorded rather than assumed |
| `strength_source = UNDERCUT_TRANSMISSION` becomes **writable**; the CHECK fence stays | ADR-0005 clause 6 | **DR-071** |
| Cluster collapse applies to **both** polarities | ADR-0005 | **DR-073** |
| Placeholder arrows are live endpoints | ADR-0005 | **DR-075** |
| Evaluation policy fixed: **WAIT drain** + post-completion settlement watch | ADR-0009 | **DR-089** |
| Activation table re-derived and ratified **in-repo**, per-row written predicates | ADR-0009 | **DR-083** |
| Correctness/enrichment split = propose-and-ratify-once; correctness until then | ADR-0009 | **DR-093** |
| Consumer manifest **voided**; AC-61's consumer direction runs on the intra-repo static type-graph pass | ADR-0010, ADR-0001, ADR-0016 | **DR-069**; routing resolved at PRE-01 |
| Advisory register-key lane added to the audit | ADR-0010, ADR-0011 | **DR-097** (V's amendment) |
| Unratified register rows are **outside** charter clause 4's orphan reach | ADR-0010, ADR-0011 | **DR-097** |
| Deployment operator row is **mandatory**; declare-once/withhold machinery **dropped** | ADR-0011 | **DR-074** |
| Tiered composition budget; layer-2 provenance flip; the two mapping tables | ADR-0011 | **DR-078**, **DR-081**, **DR-080** |
| Asker = the requesting user/person; provisional, A5.2-style revisit | ADR-0013 | **DR-070** |
| Risk tier: asker declares, policy may raise never lower | ADR-0013 | **DR-094** |
| Band-cap on the Answer: second gate, caps rather than blocks | ADR-0014 | **DR-082**, **DR-086** |
| Load-bearing projection rule populates the segment flag | ADR-0014, ADR-0007, ADR-0012 | **DR-079** |
| Node-lifecycle events join the event vocabulary | ADR-0008 | **DR-076** |
| Every `pending V — Q-nn` marker converted to `RULED — Q-nn (DR-0nn)` | all ADRs | DR-068..DR-097; DR-100 |
| **Rev 2 (rework round 1)** — DR-074's deletion scoped to **one reason, not the member**: `WITHHELD(no operator declaration)` (AC-22 / DR-040 Q45) deleted; **`WITHHELD(strict-and conjunct unjudged or abstained)` (AC-26 / DR-062 `OD-05`) live**. The rev-1 "possibly unreachable / flagged for V" framing is **withdrawn** — it conflated two independent producers and recorded a false open question. | ADR-0011 clause 8, ADR-0014 clause 4 + costs + constraints | DR-074 as scoped by AC-26 / DR-062 `OD-05` (manifest §4.2b); orchestrator adjudication on `t_c3538824`; carrier text `02-data-model.md` §7.4 |

---

## 5. The stack record — PRE-10 rev 1 (DR-105) and rev 2 (DR-117/DR-118)

Reviewer aid, same law as §4: **every edit traces to a row below, and no edit was
made without one** (no invented numbers — AC-76 / DR-039; no git — DR-103).

**One ticket, two revisions, opposite conclusions.** This section records both,
because the second is only legible with the first. **The operative text is
rev 2's.**

### 5.1 The four rulings, in order

| Ruling | What it did | Status |
|---|---|---|
| **DR-105** | V's VG-01 clarification — *"keep FastAPI, but database on PostgreSQL"* — ruled GPG-2 **a replacement, not a confirmation**. Engine = Python/FastAPI. Ordered the bounded re-instantiation of ADR-0001/0002/0003/0009/0012 and named four replacement mechanisms to be designed. | **SUPERSEDED by DR-117** |
| **DR-116** | **The backend stack belongs to all the humans in the loop**, decided at a sitting after pre-flight and before any backend code. DR-105 → **CONDITIONAL**. PRE-10's rev-1 work continued as pre-flight **so the sitting could choose between two fully-worked options** rather than between a worked one and a sketch. | **FINAL — its condition is satisfied** |
| **DR-117** | **The stack sitting.** Frontend Next.js/React/TS (kept UI) · API/realtime **Fastify + TypeScript, SSE** · **PostgreSQL + Drizzle** · durable execution **Hatchet or Inngest** (left open) · **workers TypeScript initially** · local LLM **vLLM, separate, over HTTP** · deploy **Docker Compose + Hetzner + Cloudflare**. **DR-105 SUPERSEDED**; the original TypeScript ADR text is ruled again; PRE-10 re-scoped to rev 2. | **FINAL** |
| **DR-118** | The open sub-decision, after a two-lens debate: **durable execution = Hatchet**, self-hosted, Postgres-first, **dispatcher only**, with the implementation posture ruled alongside it. | **FINAL** |

**What DR-116 bought, and why the rev-1 work was not wasted by its own reversal.**
The sitting did not choose between a proposal and a memory: both stacks existed
as complete, reviewable instantiations, with their mechanisms designed and their
costs written down. The Python instantiation is the reason the sitting could
price a language split rather than imagine one. It is preserved for that reason —
see §5.6.

### 5.2 What rev 2 restored, and what it added

| ADR | Rev-2 action | Substance |
|---|---|---|
| **0001** | **restored** — TypeScript on Node, one language across engine, API and interface | the four obligations are **structural** again: one declaration consumed by both sides (AC-59), **one type graph** walked once in both directions (AC-61), discriminated unions with compile-time exhaustiveness (AC-35/65), a zero-dependency package plus the purity lint (AC-09/48). **New from DR-117**: *workers TypeScript initially*, with the polyglot door left open and **priced** |
| **0002** | **restored** — Fastify, resource JSON, `/v1`, contract-first, additive-only | **new from DR-117**: **SSE** named as the realtime transport, with three clauses keeping it a *route* rather than a second front door, and the **proxy-buffering trap** named — the fix is proxy configuration, never a second path |
| **0003** | **restored** — Drizzle + `drizzle-kit`, hand-authored SQL, rules 1–3 verbatim | **new rule 4** (DR-118): the engine's schema is a **co-tenant, not a co-owner** — not in our lineage, not in `02-data-model.md`, **no query joins across the boundary**, and an argued reason why this is not an AC-02 breach |
| **0009** | **restored** — Postgres queue, `SKIP LOCKED`, TypeScript executor, clauses 1–6 | **clause 1** carries **DR-115**'s real-call law; **clause 7** states the transaction boundary and ends with *"an engine dispatches; it does not claim"*; the seven laws became **ADR-0017's acceptance bar** |
| **0012** | **restored** — Vitest, fast-check, Testcontainers, schema-driven contract tests | **clause 7** (DR-115 fixture confinement) **survived the reversal unchanged**, which is the clearest evidence it was never a language clause; two clauses retained from the superseded pass (§5.6) |
| **0017** | **minted** (DR-118) | Hatchet as **dispatcher only**; the six ruled posture clauses; **the AC-04 claim ↔ engine assignment mapping**, which is the ADR's centre — a **six-case interleaving table**, a three-check first-lines sequence with a **settlement-completion path** (finish, don't redo), the `claim_deadline`-covers-the-call invariant, and case D named as **irreducible**. **One instance is ruled, with no operational escape** |
| **0018** | **minted** (DR-117) | Compose/Hetzner/Cloudflare; **one transport through the proxy**; ceremony independence as a topology property; **vLLM as one provider adapter**, with lineage attributed to the **served model's maker** |

### 5.3 The four documents re-aligned

| Document | Rev-2 change | Authority |
|---|---|---|
| `03-module-design.md` | pnpm workspace and the TypeScript package map **restored**; the signature blocks back to TypeScript; lint-gate names restored **with one correction retained** (§5.6); **new §1.3 service map** — `hatchet-engine`, `postgres`, `vllm` as compose services, with the module map explicitly unchanged; scheduler's three jobs unchanged | DR-117, DR-118 |
| `06-test-strategy.md` | TS test stack **restored** in §2 and §14; `FX-ORPH-01`'s mechanism sentence back to the one-program walk; `FX-REG-01` back to four keys at rev 2, then **five** at rev 2.3. **No fixture id was minted, renamed or retired in either revision** | DR-117 |
| `07-build-order.md` | GPG-2 **discharged at the DR-117 sitting**; GPG-3 back to four pins at rev 2, then **five** at rev 2.3, filling at S00 under DR-104; §3.4 restored to the single-type-graph mechanism; **S0 scaffold list back to TS rows plus a `hatchet-lite` dev-compose row**; DR-115 binds S0 | DR-117, DR-118, DR-104, DR-115 |
| `05-register-skeleton.md` | bootstrap pins **back to the four TS-era keys** (`nodeRuntimeVersion`, `pnpmVersion`, `postgresMajorVersion`, `typescriptVersion`), then **`vllmImageDigest` added as a fifth** at rev 2.3 (§5.4-iii); counts §5.4 28 → 26 → **27**, total 61 → 59 → **60**; **new §5.4c** applies a verdict-bearing test to the Hatchet and vLLM **image identities** | DR-117, DR-118, DR-104 |
| `design-patterns.md` | TS mechanisms **restored** in P1/P2/P3/P12/P17; **P11 re-grounded on Hatchet-as-dispatcher** with its laws; the **DR-115 anti-pattern entry stays** | DR-117, DR-118, DR-115 |

### 5.4 Container image identities — the verdict-bearing test (rev 2.3)

`05-register-skeleton.md` §5.4c states an **executable classification test**:
*with all other recorded inputs held fixed, change only the image digest; if any
produced artifact or served result differs, that digest is verdict-bearing and is
subject to the register discipline.* The two services land on opposite sides:

- **`vllm` — CONVICTED. It is a register row** (`vllmImageDigest`, bootstrap
  class, value V's, resolved and recorded at S00 under DR-104). A serving-runtime
  build can change tokenization, sampling and numeric execution **with the weights
  and recorded `model_version` unchanged**. *An earlier draft argued the opposite
  and is withdrawn.*
- **`hatchet-engine` — ACQUITTED. It stays a compose build input**, pinned to an
  exact digest and named in the acceptance bundle's input list. **The surviving
  rule is that the dispatcher computes no served number.** The sharpest objection —
  a dispatcher build can change which of two overlapping *real* attempts wins — is
  answered rather than avoided: both artifacts are real, replay against the
  recorded winner is deterministic, and race-winner non-determinism among real
  outcomes is a cost property, not a computation of a served number.

**Both require exact digests, never floating tags**, and both build identities are
frozen in the acceptance bundle's provenance.

### 5.5 `RULED — DR-115` — no scaffolded data

V's standing law, ruled live during rev 1 and **carried through the reversal
untouched**: *"every judgement, composition, evidence item, score and served
artifact in any run comes from REAL model calls, real retrieval and real
computation."* Test fixtures stay legal exactly where the pack mandates them,
**confined to the test layer, labeled, never seeded into a served run**. A
scaffolded-data path found in review is a **BLOCKING** finding.

| Where it lives | Clause |
|---|---|
| **[ADR-0009](ADR-0009-job-execution-in-postgres.md) clause 1** | the gateway is the **only** entry point for a model artifact, so it is the only place the law binds: a failed call yields a typed failure and a ledger row, never a substitute; a cache hit replays a recorded **real** artifact; **an engine retry produces another real call, which is a cost question, not a breach** |
| **[ADR-0012](ADR-0012-test-stack-and-replay-ceremony-isolation.md) clause 7** | the named synthetic inventory; a **dependency fence** from production packages to fixture packages; a **typed synthetic marker on the artifact**, not only on the file; **no fixture is ever a fallback**; and the engine-shaped variant DR-118 makes reachable |
| **[ADR-0017](ADR-0017-durable-execution-hatchet.md) clause 4** | replaying a child task's recorded output is legal **iff** a real call's artifact sits behind it in the ledger |
| `design-patterns.md` | the anti-pattern register's first entry |
| `07-build-order.md` §4 S0 | binds the slice most tempted to fake an end-to-end path |

**The one thing worth reading twice**, recorded in ADR-0012 clause 7 rather than
left to be discovered: **the replay ceremony cannot detect this breach.** A run
seeded with a stubbed judgement replays byte-identically and passes, because
replay checks arithmetic against records, not records against reality. The
confinement clauses are the only barrier, and no launch gate substitutes for
them.

### 5.6 The superseded episode — index, and the four findings kept

**The Python/FastAPI instantiation (DR-105 → DR-116 → DR-117) is preserved in
each affected ADR's *"superseded episode"* section.** It is a **record, not an
option**: citable as history, as the provenance of the findings below, and as
V3's only worked measurement of what a language split costs. It may **not** be
cited as a live alternative or as precedent for a second language in the
repository — re-opening it requires a new human sitting under DR-116's rule.

| Where the record lives | What it holds |
|---|---|
| [ADR-0001](ADR-0001-language-and-runtime.md) §"The superseded episode" | the **three-ruling history** in full, and the **four replacement mechanisms** with their costs — the price list for any future language split |
| [ADR-0002](ADR-0002-api-encoding-and-front-door.md) | the clause-by-clause diff: only the framework row moved, exactly as that ADR predicted |
| [ADR-0003](ADR-0003-postgres-access-and-migration-tooling.md) | rules 1–3 came through **verbatim**; `02-data-model.md` was never opened |
| [ADR-0009](ADR-0009-job-execution-in-postgres.md) | the narrowest change of the five — **nothing in the queue was a language property** |
| [ADR-0012](ADR-0012-test-stack-and-replay-ceremony-isolation.md) | the ceremony did not move; the symbol-proof re-expression is where two of the four findings came from |

**Four findings from the episode are carried into the operative text**, because
each was true independently of the language:

1. **`require-exhaustive-switch` needs a second half** — a switch with **no
   default branch at all** is silently non-exhaustive and gives the compiler
   nothing to complain about. The gate must assert the fall-through **exists**.
   *(`03-module-design.md` §6.3.)*
2. **The isolation proof must read imported names, not the exported surface.** An
   export pin and an import list answer different questions, and limb (i) asks
   the second. *(ADR-0012 clause 3.)*
3. **The property suite needs a pinned seed.** AC-79's fire-both-ways evidence is
   worthless if a red build cannot be reproduced. *(ADR-0012 §5.)*
4. **A schema-diffing generator is never the invariant authority** — it cannot
   see the `CHECK`s, triggers, grants and partial-index predicates it did not
   emit. Written against one tool, true of the class. *(ADR-0003 costs.)*

### 5.7 What is claimed, and by whom

- **RULED (V + all the humans in the loop, DR-117/DR-118):** the language, the
  API framework and realtime transport, the database and its tooling, durable
  execution and its posture, the worker language, the local model's shape, and
  the deployment target.
- **Design, not ruling (this seat's, reviewable):** how each ruled element meets
  the pack's constraints — ADR-0017's claim↔assignment mapping, ADR-0018's three
  clauses, ADR-0003 rule 4's co-tenant boundary, ADR-0009 clause 7's transaction
  boundary, and §5.4's image-identity classification. **These are arguments, and a reviewer may
  overturn any of them without re-opening a ruling.**
- **Neither, and said plainly:** the residual risks. Dual bookkeeping between the
  engine and our ledger is **permanent**; the engine's ecosystem maturity at this
  workload is **unproven** and the evaluation record says so; single-host
  concentration is real; and the ceremony **cannot** see a DR-115 breach.

**Review protocol:** DR-101 variant — Claude-authored, reviewers **CODEX +
GROK** (ticket `t_d467ee8a`, board `debateai-v3`). **Rev 1's diamond was
superseded mid-flight by DR-117**; this is rev 2's. PRE-10 **blocks S00**, and
**the pre-Codex stop for V's re-prompt STANDS** (DR-117).
