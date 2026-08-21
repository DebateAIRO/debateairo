> **ACCEPTED ARCHITECTURE.** VS-1 is ratified (**DR-098**), amendments
> A-01…A-13 are accepted (**DR-099**), and **ARCHITECTURE SATISFIED** is emitted
> under V's authority (**DR-100**) — the ARCH-V3-R1 architecture loop is CLOSED.
> The provisional-status banner that headed this file is removed under DR-100's
> follow-through, which also directs this fold-in. **All 28 questions of
> `08-open-questions-for-V.md` are RULED (DR-068…DR-097).** Where this document
> once named an open `Q-nn`
> it now names the ruling that closed it; where a ruling left a *value* to V,
> the row says so and points at the register-ratification sitting (ticket
> **VG-02**, DR-023) rather than inventing one (AC-76, DR-039).

# 07 — Build order

ARCH-V3-R1 / C4 · 2026-08-05, folded to post-ruling state 2026-08-06 under
PROG-V3-R1 ticket **PRE-01** (DR-100 follow-through; DR-102) · **pre-S0 gate and
S0 scaffold ruled 2026-08-07 under ticket PRE-10 rev 2** (**DR-104**, **DR-115**,
**DR-117**, **DR-118**) · authored from
`Plan.md` rev 3 §8 (the slice preview) and §6 (the open-item dispositions).

> **`RULED — DR-117` / `DR-118` / `DR-104` / `DR-115` — what the 2026-08-07 pass
> settled.** **§3.1**: **GPG-2 is DISCHARGED** — all the humans in the loop ruled
> the coding stack at the sitting DR-116 mandated (**TypeScript on Node ·
> Fastify + SSE · PostgreSQL + Drizzle · Hatchet · vLLM over HTTP · Docker
> Compose on Hetzner behind Cloudflare**); **GPG-3**'s five pins fill at S00 under
> DR-104's resolve-on-machine rule; **GPG-4** is ruled at DR-104(3). **§4 S0**: the
> scaffold list is written out, with a **`hatchet-lite` dev-compose row**, and
> **DR-115's no-scaffolded-data law** binds S0 from its first line. **Nothing else
> moved** — no slice order, no gate force, no fixture id, no value.
>
> *An earlier ruling (**DR-105**) replaced the engine language with Python and
> PRE-10 rev 1 re-instantiated §3.1, §3.4 and S0 for it; **DR-117 superseded
> that** and rev 2 restored the TypeScript text — including §3.4's
> single-type-graph mechanism, which the language split had briefly cost.* The
> episode is recorded at `01-decisions/README.md` §5.6.
Scope is §7 row 8: §8's slices expanded into **per-slice entry criteria**, the
**charter gates each slice must show firing**, the **launch-readiness matrix**,
the **deferred-gate activation conditions**, and the **two explicit
launch-readiness dependencies**.

**What the fold-in changed, so a reader can check it.** Every `Q-nn` entry
criterion now cites its ruling (§3.2); every carriers-only zone that existed
*because* a question was open is **struck with the ruling that struck it** (§4);
the ruling-created work is assigned to owning slices (§3.3); AC-61's consumer
direction is re-routed after DR-069 (§3.4); and the fixture-slice tie-break
between this document and `06-test-strategy.md` §12 is resolved on the record
(§5.1). This document still **rules nothing** — it consumes DR-068…DR-101.

**There are no time estimates in this document, in any unit** (§7 row 8's
out-of-scope column). Ordering here is dependency ordering only.

---

## 0. What this document is, for a reader with no project history

V3 is built as sixteen **vertical slices**, `S0` … `S15`. A vertical slice is
not a layer and not a component: it either **serves something end to end** or
**proves something end to end**. `S0` is a walking skeleton that produces one
legally served answer through the whole pipeline; every later slice hardens or
widens that path. Slice order encodes **dependency, not priority**; `S0`–`S3`
are the spine and nothing else starts before `S0` is green (Plan §8 preamble).

**One gate precedes all sixteen.** Before S0 can be started at all there is a
**global pre-S0 gate** (§3.1): the C2 plan gate's steering must be recorded, the
proposed stack must be accepted or replaced, the bootstrap/toolchain pins must
have accepted values, and the resulting contract and register versions must be
identified. **All four are now discharged.** Steering is recorded
(DR-098/DR-100); the stack was taken at the **human sitting DR-116 mandated** and
ruled itemized — **`RULED — DR-117`: TypeScript on Node · Fastify + SSE ·
PostgreSQL + Drizzle · Hatchet (DR-118) · workers TypeScript · vLLM over HTTP ·
Docker Compose on Hetzner behind Cloudflare** — with ticket **PRE-10** executing
the ADR alignment before any S0 code exists; the **five** bootstrap pins fill at
S00 under **DR-104**'s resolve-on-machine rule; and GPG-4's two version
identifiers are ruled at **DR-104(3)**. **No agent invents a numeral** (AC-76,
DR-039) — the machine resolves and the S00 worker records.

**The pre-Codex stop stands** (DR-117): pre-flight completes, the orchestrator
reports, and **V re-prompts** before S00 is launched.

Three things then gate each slice, and this document is the place all three are
written down together:

1. **Entry criteria** — what must be true before the slice starts. These are of
   three kinds: the global pre-S0 gate (§3.1), predecessor slices being green,
   and **the rulings the slice consumes**. Plan §6.8 assigned every open
   question the earliest slice it blocked and §8's sequencing rule (iv) made
   that assignment an entry criterion; **since DR-068…DR-097 every one of those
   questions is ruled**, so each row now names the ruling the slice must build
   to rather than an answer it must wait for. **The pre-S0 gates are all four
   discharged** (§3.1): GPG-1/GPG-2 by DR-098 and the DR-116 human stack sitting
   (`RULED — DR-117` + `DR-118`), GPG-3's five pins by **DR-104**'s
   resolve-and-record-at-S00 rule, GPG-4's identifiers by **DR-104(3)**. The only
   residual waits are the *values* DR-023 routes to V's register-ratification
   sitting (**VG-02**), and the **explicit V re-prompt** DR-117 puts before Codex
   launches on S00 — a procedural hold, not an open architecture gate.
2. **Gates the slice must show firing** — the charter's un-fireable-path test
   (charter §5.1 G3): a gate that has never been observed to fire is an
   untested claim, not evidence of health (spec §22 Z-1, AC-79). Where the pack
   requires both directions, both are owed.
3. **Done conditions** — the slice's own exit checks, including the standing
   orphan review at every slice boundary (AC-77).

The open questions were **not answered here** and are not answered here now.
They live, with their recommendations and consequences, in
`08-open-questions-for-V.md`, which was the single place V answered; **V's
answers live in the decisions ledger**
(`docs/missions/2026-08-05-v3-architecture/decisions-ledger.md`, DR-068…DR-101),
which is authoritative over any doc text it post-dates. This document refers to
a question by its `Q-nn` id **only** as the address of the ruling that closed
it, and never restates a recommendation as a rule.

---

## 1. How to read a slice entry

Each slice below carries five fields, in this order:

| Field | What it holds |
|---|---|
| **Delivers end to end** | The vertical outcome — what is served or proven. From Plan §8's "What it delivers end to end" column. |
| **Entry criteria** | Predecessor slices, plus the **rulings the slice consumes** (formerly the `Q-nn` questions that had to be answered first, Plan §6.8), plus any criterion §8 states inline. |
| **Gates it must show firing** | The charter/spec gates whose firing fixture this slice owes (charter §5.1 G3, §5.2; spec §22.1; AC-79). |
| **Done when** | The slice's exit checks. |
| **Carriers-only zone** | *Historically:* where a question was unanswered but the slice still ran — what may be built (carriers, provenance, shape) and what may not (the behaviour the question governs). Plan §8 rule (iv). **After DR-068…DR-097 no slice has a question-driven carriers-only zone left**; each one below is struck with the ruling that struck it. The rule survives only for **values** V ratifies at VG-02 (DR-023/AC-76), which is a value-pending state, not an unruled behaviour. |
| **Full fixture set** | A pointer to `06-test-strategy.md` §12's row for the slice, which is exhaustive against that document's §15 roster. |

**Fixture addressing.** `FX-*` is **the only fixture address in the C4 set**, and
every gate and done-condition below carries its exact id from
`06-test-strategy.md` §15's roster — never a prose name. Charter **A4.4**
requires each charter §5.2 row to carry *"a recorded firing fixture in the
acceptance bundle, **named by fixture id**"*, and an id is also what lets
`09-traceability.md`'s test leg and lane 6's slice map join to this document
without a human lookup. **A gate with no fixture id is either a bundle artifact
rather than a fixture, or a gap** — both are called out where they occur (S15;
§9).

---

## 2. The four standing sequencing rules

These bind every slice and are not restated per slice (Plan §8, "Four
sequencing rules").

**(i) No dark gates.** No slice ships a gate it has not shown firing, in both
directions where the pack requires both (AC-79). A slice with a dark gate is
not done.

**(ii) No orphan modules, from day one.** No slice adds a module that no other
slice calls; a module without a caller is an orphan on the day it lands
(AC-77). `tools/orphan-audit` therefore runs **from S0 onward** and its
never-called list is reviewed **at every slice boundary**, not only at S15
(charter §5.1 G1/G2, A4.2).

**(iii) Which slices may produce a served answer: S0 onward, and only because
S0 contains the composition + conformance pair.** Until a conformance judge
exists in the tree **no run is servable** — AC-49 puts serve-conformance in the
protected core and AC-51 forbids pure render — so **no slice may ship an
"interim" render**. Components-only may be **entered at compose time** only by
AC-53's three ruled routes; a **post-serve** replay eviction transitions an
already-served answer to the same surface (Plan §4.4 clause 3), which is a
degradation of a served answer rather than a fourth compose-time route. Plan §8
prices this for V explicitly: evicting a single component number withdraws the
whole composed text; DR-059's "one number is lost, never the answer" is
satisfied, and this is the only reading consistent with ui §4.0's two states,
but **the pack never ruled it** and the reading-experience cost is a
consequence V may want to see. **It is priced here, in the sequencing rule
itself, and is not a question** — Plan §8 rule (iii) states it as a consequence
of a ruled reading, not as an open item (recorded independently as residual risk
R-2 in `reviews/opus-plan-rereview-2.md`).

**(iv) A slice does not start before its blocking questions are answered —
and all of them now are.** Plan §6.8's table was the entry-criteria list;
§3.2 below is its post-ruling form, every row citing DR-068…DR-097. The rule's
carriers-only limb (*may build carriers and provenance but not the behaviour the
question governs*) **no longer applies to any question**, because none is open.
It still binds one residual class: a behaviour whose **register value** V
ratifies at VG-02 ships with its carrier, its typed loud failure on an
unratified read, and no invented value (AC-74, AC-76, DR-039). **A ruling is
not a value and a value is not a ruling** — conflating them is how an invented
constant gets in.

---

## 3. Entry criteria — the global pre-S0 gate, and every question against the slice it gates

### 3.1 The global pre-S0 gate — GPG-1 … GPG-4

**Four things must be recorded before S0 starts. None of them is an open
question in `08-open-questions-for-V.md`; all four are acceptance and bootstrap
acts that sit above the question set.** **ALL FOUR ARE NOW DISCHARGED** —
GPG-1 (DR-098/DR-100), GPG-2 (`RULED — DR-117` + `DR-118` at the human stack
sitting DR-116 mandated), GPG-3 (**DR-104**: the five pins resolve on the build
machine and are recorded at S00), GPG-4 (**DR-104(3)**) — and the status column
below says so with each authority. **The remaining hold before S00 is the
explicit V re-prompt DR-117 requires, not an architecture gate.**

| # | Gate | Status | Why S0 cannot start without it | Where it is recorded |
|---|---|---|---|---|
| **GPG-1** | **VS-1 steering is recorded.** | **SATISFIED — DR-098.** V ratified the C2 frozen-gate repairs (13-item annex, both receipts clean) and the then-conditional C4 artifact set as the working architecture; both review-loop freezes are discharged. **DR-100** then emitted ARCHITECTURE SATISFIED and closed the loop. The provisional-status banners come off with this fold-in — that is DR-098's own stated condition. | Building S0 against an unsteered plan spends the build on an artifact that may be re-opened. | Decisions ledger **DR-098**, **DR-100**; packet row **VS-1**. |
| **GPG-2** | **The ADR / stack set is accepted or replaced.** | **DISCHARGED — ITEMIZED, `RULED — DR-117`.** DR-098 accepted the conditional C4 artifact set *as a set*, wholesale, with **no per-technology ratification row**. That gap is now closed at a **human sitting**: **DR-116** ruled that the backend stack belongs to **all the humans in the loop**, taken after pre-flight and before any backend code; **DR-117** is that sitting, and it names the language, the API framework and realtime transport, the database and its tooling, durable execution, the worker language, the local model and the deployment target **one by one**. **DR-118** closes its single open sub-decision. *The interval matters and is recorded: DR-105 had replaced the language with Python/FastAPI and PRE-10 rev 1 fully worked that instantiation; DR-116 made it CONDITIONAL so the sitting could choose between **two fully-worked options**; DR-117 superseded it and restored the TypeScript text.* All of it **before a line of S0 exists**, which is the condition the next column states. | Plan §9 records that if V rules a different language, **§3's context map, §4's data model and §5's API direction survive unchanged; only §2.2–§2.7 are re-instantiated** — a bounded replacement, but one that must happen **before** a line of S0 exists. **That is now proven rather than hypothetical, in both directions**: a language was ruled in and ruled out inside a day, and eleven ADRs plus `02-data-model.md` were never opened. | **DR-098**, **DR-116**, **DR-117**, **DR-118**; `docs/architecture/01-decisions/` (README §5, PRE-10 rev 2); Plan §2, §9. |
| **GPG-3** | **The bootstrap / toolchain pin mechanism and its values are accepted.** *(Mechanism fixtured by `FX-REG-01` from S0 — equality, never a value.)* | **MECHANISM SETTLED · VALUES FILL AT S00, `RULED — DR-104`.** The **mechanism** is settled and accepted (**five** bootstrap-class keys read through one loader from `register.bootstrap.json`; gap `REG-7`, adopted wholesale at **DR-099** A-09): `nodeRuntimeVersion`, `pnpmVersion`, `postgresMajorVersion`, `typescriptVersion`, and **`vllmImageDigest`** (`RULED — DR-117`/`DR-118`; `05` §5.4c — the serving-runtime build is verdict-bearing, the dispatcher build is not). The **values** are supplied by **DR-104**'s rule rather than by a sitting: each pin takes the **current LTS/stable that resolves on the build machine at S00 scaffold time**, and the S00 worker records the exact numerals in `register.bootstrap.json` and in a ledger follow-up row. **No agent may invent one, and no numeral appears in any C4 document.** *(The stack replacement and its reversal moved this class 4 → 6 → 4 without touching the mechanism — `05-register-skeleton.md` §5.4-ii.)* | The runtime, package manager, Postgres major and language-version pins are **register rows** (AC-74: constants never live as source literals), and the register ships as **keys with no values** (AC-76). A builder cannot select a runtime, install dependencies, migrate Postgres or compile without values, and inventing them is barred by DR-039/AC-76 — **DR-104 is what unblocks this without inventing anything: the machine resolves, the worker records.** | `05-register-skeleton.md` §5.4a, §5.4-ii; AC-74, AC-76, DR-023; **DR-104**, **DR-117**. |
| **GPG-4** | **The resulting contract and register versions are identified.** | **RULED — DR-104(3).** `packages/contract` starts at **0.1.0** and the first ratified register row-set is **register_version 1**. Its *mechanism* changed once and once only: under **DR-069** the fenced interface and its consumer manifest are gone, so the release-failure limb is carried by the **intra-repo static type-graph pass** of §3.4 rather than by a manifest. **`RULED — DR-117` restores the property that pass depends on** — one language, therefore one program graph. | `run` pins `register_version` and the build pins a `packages/contract` version. A run whose pinned versions are not identified at the start is not replayable against them at the end. | Plan §4.1a (`register_version` on the frozen head); **DR-069**, **DR-104(3)**, **DR-117**; §3.4 below; AC-61, AC-74. |

**Force.** GPG-1…GPG-4 are **entry criteria for S0 and therefore for the whole
build** (Plan §8 sequencing rule (iv)). They are **not** V-QUESTIONs: GPG-1 was a
steering act (done), GPG-2 the ratification DR-005/DR-024 assigned to V — **taken
at the human sitting DR-116 mandated and answered itemized (DR-117 + DR-118),
which is why PRE-10 precedes S00** — and GPG-3/GPG-4 are acceptance of values and
versions the pack routes to DR-023 and to the register (**ruled at DR-104**:
GPG-4's two identifiers are recorded, GPG-3's five pins resolve on the machine at
S00). **This document rules none of them and supplies a value for no pin.**

**All four gates are now discharged, and S0's entry is clear.** The sentence this
section carried for two revisions — *"a builder still cannot select a runtime,
install dependencies, migrate Postgres or compile S0"* — is **spent**: DR-104
supplies the filling rule and DR-117 supplies the stack those pins pin. **What
still gates S00 is procedural, not architectural**: PRE-10's review diamond, and
then **V's own re-prompt** (DR-117's pre-Codex stop).

### 3.2 Every ruling against the slice it gates

Reproduced from Plan §6.8's "Blocks from" table and §6.9/§6.10, renumbered to
`08-open-questions-for-V.md`'s `Q-nn` ids. **28 distinct questions — all 28
RULED (DR-068…DR-097, 30 rows: Q-08 and Q-14 each yielded two).** This table was
the checklist a slice lead ran before starting; it is now **the checklist of
rulings the slice must build to**. No cell says "answered first" any more,
because none is waiting.

| Slice | Rulings the slice consumes (was: questions to answer first) | Source id (Plan) |
|---|---|---|
| **S0** | **GPG-1…GPG-4 ALL DISCHARGED** (§3.1) — GPG-1 DR-098/DR-100; **GPG-2 itemized at the human stack sitting, `RULED — DR-117` + `DR-118`**; **GPG-3** five pins fill at S00 under **DR-104**'s resolve-on-machine rule; **GPG-4** identifiers accepted at **DR-104(3)** · **Q-01 = RULED, DR-068** (kept UI source may be carried) · **Q-02 = RULED, DR-069** (**NO FENCE** — plain in-repo package) · **Q-03 = RULED, DR-070** (asker = the requesting user; V2's `user_dev_token` slice adopted, provisional) | AQ-2, AQ-3 (§6.10); AM-12 (§6.2) |
| **S1** | *(none)* | — |
| **S2** | **Q-04 = RULED, DR-071** — undercut = `transmission-reduction`; `UNDERCUT_TRANSMISSION` is **writable** | A-1 (§6.4) |
| **S3** | **Q-05 = RULED, DR-072** · **Q-06 = RULED, DR-073** · **Q-07 = RULED, DR-074** · **Q-08 = RULED, DR-075** (+ the **DR-076** observability amendment, which lands at S7/S14) | A-3, A-4, A-8, A-9 (§6.4) |
| **S4** | **Q-09 = RULED, DR-077** — earned weight multiplies the served arithmetic, consumed in *selection* under a declared rule | U-4 ≡ A-6 (§6.3, §6.4) |
| **S5** | **Q-10 = RULED, DR-078** · **Q-11 = RULED, DR-079** · **Q-12 = RULED, DR-080** · **Q-13 = RULED, DR-081** · **Q-14 = RULED, DR-082 (half i) + DR-086 (half ii)** — *values* for the tier list, mapping tables, flip row, band labels and cut points ride **VG-02** | OQ-G3 (§6.1); AM-1, AM-3 (§6.2); U-1 (§6.3); AQ-1 (§6.10) |
| **S6** | **Q-15 = RULED, DR-083** · **Q-16 = RULED, DR-084** · **Q-17 = RULED, DR-085** · **Q-18 = RULED, DR-087** · **Q-19 = RULED, DR-088** — the DR-083 row-contract table and the DR-084 route enum are *drafted* by PRE-05/PRE-07 and **ratified at VG-02** | OQ-G9, OQ-G10 (§6.1); U-2 (§6.3); A-7 (§6.4); charter §9 item 6 (§6.9) |
| **S7** | **Q-20 = RULED, DR-089** (WAIT drain law) · **Q-21 = RULED, DR-090** (maker-diversity floor alone) | AM-10, AM-14 (§6.2) |
| **S8** | **Q-22 = RULED, DR-091** (CROSS-entry leverage snapshot — the proxy is **authorized**) · **Q-23 = RULED, DR-092** (item-scoped actions only) | AM-2, AM-4 (§6.2) |
| **S9** | **Q-24 = RULED, DR-093** (propose-and-ratify-once; the 71-row split rides **VG-02**) · **Q-25 = RULED, DR-094** (asker declares, policy may raise, never lower) | OQ-G2 (§6.1); AM-5 (§6.2) |
| **S10** | *(none)* | — |
| **S11** | *(none)* | — |
| **S12** | *(none)* — but S12 **gains** DR-089's post-completion settlement watch (§3.3) | — |
| **S13** | *(none)* | — |
| **S14** | **Q-26 = RULED, DR-095** (kept **surface**, rebuilt insides) · **Q-27 = RULED, DR-096** (**no** verdict-first flag) | C5, C8 (§6.5) |
| **S15** | **Q-28 = RULED, DR-097** (register rows are outside clause 4's orphan reach; **plus** a new advisory unread-key audit lane) | charter §9 item 7 (§6.9) |

**The one split entry criterion — now discharged.** **Q-11** (Plan §6.2 AM-1,
the non-node senses of "load-bearing") blocked from **S5 for conformance
*sampling***, and from **S0 only if S0 wanted conformance narrower than
exhaustive**. S0 did not: charter A2.5 is explicit that the protected core
*"forbids skipping the conformance **role**, it never mandates exhaustive
sampling"*, so **judging every segment is always legal**, and S0 runs
conformance **exhaustively**, with no sampling and **no consumption of
`run.stranger_sample_rate` for coverage** (Plan §6.2 AM-1, §8 S0). **DR-079**
now supplies the projection rule — *a sentence is load-bearing iff it asserts a
fact drawn from a load-bearing node or states a served number; a claim iff its
node is; an unknown iff removing it would change the verdict or band* — so
**sampling is legal from S5** and `FX-LG-06`'s sampling limb is constructible.
S0's exhaustive limb is unchanged.

**The one conditional entry criterion — now moot.** Q-02 existed only under
Q-01 = yes. **DR-068 answered Q-01 = yes** (kept UI component source MAY be
carried into DebateAI-V3), so the Q-01 = no branch — the replacement
UI-rebuild repository and layout decision — **never arose and is struck from
this document**. **DR-069 then answered Q-02: NO FENCE.** The kept UI package
sits in DebateAI-V3 as a plain, always-visible package beside the engine
packages — not a separately-checked-out workspace, not a separate repository.
V priced the cost on the record and accepted it: **DR-003's clean-room mandate
has no enforcement mechanism under this ruling — compliance is an honour
system, not a checked barrier.** DR-069 records this as an *accepted trade-off,
not a gap*, and directs that it **not be re-raised as an open question**. Its
consequence for AC-61 is §3.4.

### 3.3 Work the rulings created, and the slice that owes it

A ruling that only closes a question changes an entry criterion. **Seven of
DR-068…DR-099 created work that no slice previously owed**, and Plan §8 could
not have assigned it because it did not exist when §8 was written. Assigning it
here is the same act as `BUILD-1`/`BUILD-2`'s repairs in §9: **a gate or unit
with no owning slice is a dark gate under sequencing rule (i)**. Each row below
is mirrored in the owning slice's entry in §4 and in that slice's board ticket.

| Ruling | Work it created | Owning slice(s) | Note |
|---|---|---|---|
| **DR-076** *(Q-08 amendment)* | A pending node is **structurally connected to its parent from the moment it spawns** via the now-confirmed-live placeholder arrow, and its **lifecycle — generating → being judged → scored — is observable live**, not only after settling. Requires an addition to the API's **event vocabulary**. | **S7** (spawn half) · **S14** (UI half) · vocabulary minted in `04-api-contract.md` | Observability, **not arithmetic**: it changes nothing about what contributes to a served score. Event **names** were deliberately not invented at ruling time; they are minted at the C4 revision (PRE-02) under E1 (a declared consumer per name) and E2 (one name per meaning). `generating` stays **derived-only, never persisted** (`02` §13/§14) — the live surface is the stream. |
| **DR-089** *(Q-20)* | The Q61 **standing settlement watch**: a post-completion event **outside any run's lifecycle**, firing when the resolver outcome arrives, its outcome saved to the execution ledger (DR-027), calibration updating from the ledger record. A **third `apps/scheduler` job** beside `job:replay-self-test` and `job:reaper`. | **S12** (the watch) · **S7** (the intra-run WAIT drain half) | The new job **must be published on the G1 entry-point list** (charter A4.5, `FX-ORPH-01`) — an unlisted job is an orphan the day it lands — and it needs its **own named credential scope** (the jobs share a process; H-O-24's residue). |
| **DR-097** *(Q-28)* | An **advisory, non-blocking audit lane** in `tools/orphan-audit` reporting **any register key no code ever reads after full build**. | **S15** | V's amendment on top of the ruling. Advisory by construction: register rows are data, so the **blocking** never-called list stays about executable units. The lane needs a fixture id, minted by PRE-03 in `06`'s roster (**not minted here** — `06` §15 is the roster's home). |
| **DR-078** *(Q-10)* | The hard composition-bundle budget as an **independent register row**, **plus V's amendment**: the cap is **user-facing as a tier list (low / medium / high) the asker selects per run**. | **S5** (behaviour + the `POST /v1/asks` input) · **S0** (the frozen-head tier column as carrier) | Per-tier **values** are register rows V ratifies at **VG-02**; none is invented here (DR-023, AC-76). The row is **distinct from DR-052's cost envelope** so `DEFECT` and `ENVELOPE_EXHAUSTED` stay distinguishable. |
| **DR-087** *(Q-18)* | `value-laden` becomes a **cross-cutting flag, not a claim type** — a new field on the claim record; `OD-16`'s claim-type vocabulary stays closed. | **S6** | The other half of the ruling (`mixed` and `unknown` are evidence-**gated**, fail-closed) is behaviour S6 already owed. |
| **DR-099 A-05** | **`core.work_item`** — the Postgres-backed work-claim queue's table (gap `MOD-4`), the one mutable operational table, its history the ledger. | **S0** | Adopted wholesale by DR-099; **its DDL gates land with the table** (ADR-0003/0005: invariants owned by the creating migration, fixtures inserted through the raw connection). The claim **commits before any model call**. |
| **DR-099 A-06** | The **evidence**, **critique** and **valuation** schemas (gaps `DM-1`, `DM-2`) and the claim-type → composition map's home at `register.register_row` (gap `DM-3`). | **S6** (evidence, 8 tables) · **S8** (critique, 4 tables) · **S10** (valuation, 4 tables) · **S4** (the composition map as data) | These carriers were *"proposed in C4, FinalPlan acceptance pending"* in `09` §8. **DR-098 accepted the C4 set and DR-099 adopted A-05…A-13 wholesale**, so they are accepted carriers that now need an **owning slice and a DDL gate** — which is what this row assigns. Map **contents** are V's at VG-02. |

### 3.4 AC-61's consumer direction after DR-069 — the intra-repo static type-graph pass

**The conflict, stated plainly.** **DR-069** rules the consumer-manifest
mechanism (Plan §2.6/§2.7's fence-cost) **"not required"**. But **AC-61**,
**GPG-4**, **`FX-ORPH-04`** and the **S15 bundle** all treat
`consumer-manifest.json` as a **required build input whose absence fails the
release** — AC-61's *"no consumer without a served field"* direction is
discharged by nothing else in the pack. Left alone, that is a blocking release
gate whose only mechanism was deleted by ruling.

**The resolution, recorded here.** AC-61's consumer direction runs through an
**intra-repo static type-graph pass**, not through a manifest. The manifest
existed **only** because the interface lived behind a fence — a separately
checked-out workspace or a separate repository could not be walked by the
engine's build, so it had to *declare* what it consumed. **DR-069 removed the
fence**, which restores ADR-0001's own property: **one repository, one pnpm
workspace, one TypeScript program, therefore one type graph**. The consumers of
every served field and every emitted event are now **statically visible to the
same walk `FX-ORPH-01` already performs** — the walk simply no longer stops at
a fence.

**`RULED — DR-117` is what keeps that sentence true**, and it is worth naming
because it briefly was not. **DR-069 gives one checkout; DR-117 gives one
language; the type graph needs both.** Under the superseded DR-105 stack this
mechanism had to be re-expressed as a generated field inventory joining two
program graphs — the property was not lost, but it stopped being free
(`01-decisions/README.md` §5.6). The restoration returns it to one walk.

Both directions of AC-61 are decided by one artifact:

- **served field → consumer**, and **event name → declared consumer** (E1):
  the static walk over the contract field inventory, the event registry and
  the in-repo importers of `packages/contract`.
- **consumer → served field**: the same walk, read the other way — a consumer
  referencing a field or event the contract does not declare is a **type
  error**, which is stronger than a manifest entry, because a manifest can go
  stale while a type graph cannot.

**No optional manifest is kept.** An "optional" manifest would be a build input
nothing requires and no run reads — a **G5 dead-cost** finding on the day it
lands (`FX-ORPH-03`), and a **dead check** for `FX-ORPH-06`. Keeping it to
preserve a sentence in AC-61 would create the exact orphan class AC-61 exists
to forbid. It is therefore **removed, not demoted**.

**What this changes, by location.** **GPG-4** keeps only its version-identifier
limb (§3.1). **S14**'s `FX-ORPH-04` asserts the bidirectional check over the
type graph — *"no served field without a consumer, no consumer without a served
field, no emitted event without a declared consumer"* is unchanged as an
obligation and **still fails the build** (AC-61, AC-77; ui §5 W19). **S15**'s
bundle carries **the pass's report against the pinned contract version** in the
place the manifest occupied, as an acceptance-bundle **artifact without a
fixture id** (like the `UNCLASSIFIED` report), evidenced by `FX-ORPH-01` /
`FX-ORPH-04`. `09-traceability.md` §1's AC-59 and AC-61 cells and §6.3 carry the
same replacement. **`06-test-strategy.md` §11's `FX-ORPH-01` mechanism text
still names the manifest as a required build input** — a directed repair owed
by **PRE-03**, recorded here because this document is where the choice was made.

**Authority and its limit.** DR-069 rules the manifest not required; **it does
not name a replacement**, and AC-61 is not repealed. Choosing the type-graph
pass is the minimal mechanism that keeps AC-61 satisfiable inside DR-069's
world, and it is recorded as a **choice made here, on the record**, rather than
smuggled in as an obvious consequence. It mints no fixture, no register key and
no typed state.

---

## 4. The slices

### S0 — Walking skeleton: a *legal* serve path

**Delivers end to end.** `POST /v1/asks` → `run` frozen head +
`run_row_activation` written → one-node graph → one judge call through the
provider interface → pure propagation → ledger rows → **fact bundle (carrying
Q53's residual-objection field) → one composition call → one conformance call,
run exhaustively (every segment judged, no sampling) → machine enforcement →
served answer**. Per-node provenance, a `stranger_restatement`, one replayable
number. One transport, one contract package, one Postgres.

**S0 also births the repository shape, and the rulings fix it.** One pnpm
workspace with the **kept UI package carried in plain and unfenced** (DR-068,
DR-069); the namespaced schemas and **one migration lineage** (AC-01/AC-02),
**`core.work_item`** among them (DR-099 A-05) while the **evidence** schema's
DDL waits for S6 (§3.3); the **asker mechanism** as V2's adopted
`user_dev_token` slice with its provisional-revisit note (DR-070); and the
**frozen head's asker-selected composition-tier column** as a carrier for
DR-078's S5 behaviour. No other slice owns these.

**The S0 scaffold list, as `RULED — DR-117` and `DR-118` fix it.** Named here
because a scaffold nobody wrote down is a scaffold each builder invents
differently. **No version numeral appears in any of it** (AC-74/AC-76); every pin
is read from `register.bootstrap.json` and filled at scaffold time under
**DR-104**.

| # | What S0 scaffolds | Authority |
|---:|---|---|
| 1 | The **one pnpm workspace** and its **one lockfile**, holding the engine packages, `apps/*`, `tools/*` **and the kept `web` package unfenced**; and `register.bootstrap.json` seeded with **all five bootstrap keys** recorded from what the machine resolves — `nodeRuntimeVersion`, `pnpmVersion`, `typescriptVersion` here, `postgresMajorVersion` with row 6's lineage, and **`vllmImageDigest`** with the `vllm` service's pinned image (`05` §5.4c: the serving-runtime build is verdict-bearing). **`FX-REG-01` asserts equality over all five from the first build** | **DR-117**, **DR-118**, **DR-068/069/095**, **DR-104**; `05` §5.4a, §5.4-iii |
| 2 | `apps/api` as a **Fastify** service on `/v1`, with `packages/contract`'s schemas as the **only** wire declaration, **and the SSE route on the same front door** | **DR-117**; ADR-0002 |
| 3 | The **contract codegen** — client types, runtime validators, the OpenAPI document and the AC-61 field inventory, all from that one declaration | **DR-117**; ADR-0002; ADR-0010 |
| 4 | `tools/orphan-audit` wired over **one TypeScript program including `web`** (`FX-ORPH-01`/`FX-ORPH-02` reporting from S0) | **DR-069**, **DR-117**; AC-61, AC-77 |
| 5 | The **dependency-graph assertion** over `03-module-design.md` §3.1's edge table and structural rules 1–5, plus the four house-rule lints — `no-impure-import`, `no-source-literal-constant`, `require-exhaustive-switch` (**both clauses**), `no-unlabeled-number` | **DR-117**; `03-module-design.md` §6.3, §12; AC-09, AC-48 |
| 6 | The **`drizzle-kit` lineage** over one database with the **seven** namespaced schemas (`core`, `ledger`, `memory`, `scorecard`, `register`, `serve`, `evidence` — the seventh accepted at **DR-099/A-06**, its eight tables landing at **S6** per §3.3), migrations carrying **hand-authored SQL** for every invariant; `postgresMajorVersion` recorded | **DR-024**, **DR-117**, **DR-099/A-06**; ADR-0003 rules 1–4 |
| 7 | The **test scaffolding**: Vitest, fast-check **on a pinned seed**, Testcontainers reading the Postgres pin through the loader, and the **fixture-confinement fence** from production packages to fixture packages | **DR-117**, **`DR-115`**; ADR-0012 §5 and clause 7 |
| 8 | `apps/replay`'s package with the **exported-surface pin** on `published-arithmetic`'s three symbols and the isolation-proof tooling — **which reads the names `apps/replay` actually imports**, not the surface offered | **DR-063 VR-3**; ADR-0012 clause 3 |
| 9 | **A `hatchet-lite` dev-compose row** — the single-image, Postgres-only form of the durable-execution engine, for local development and CI. **`SERVER_MSGQUEUE_KIND=postgres`; no RabbitMQ service**; the engine's schema in its own database on the same instance. S0 needs the **dispatch path present**, not the full production control plane | **DR-118**; [ADR-0017](01-decisions/ADR-0017-durable-execution-hatchet.md) clauses 1 and 6; [ADR-0018](01-decisions/ADR-0018-deployment-topology.md) |
| 10 | **The claim discipline, from the first work item**: the worker's first act inside any task is to claim `core.work_item` in **our** database and **COMMIT**, before any model call; engine retries **bounded by register values**, never engine defaults | **DR-118**; ADR-0009 clause 7(d); [ADR-0017](01-decisions/ADR-0017-durable-execution-hatchet.md) clauses 3 and 5 |

**Row 9 is a scaffold row, not a slice deliverable, and the distinction matters.**
S0 must show that the dispatcher **dispatches** and that the claim commits in our
database first; it does not owe the production topology of
[ADR-0018](01-decisions/ADR-0018-deployment-topology.md), whose Cloudflare and
Hetzner limbs are deployment work. **What S0 does owe is that the claim law is
built the right way from the first work item** — retrofitting clause 3's ordering
after a slice of code assumes engine assignment *is* the claim is exactly the kind
of rework the build order exists to prevent.

**`RULED — DR-115` binds S0 from its first line: NO SCAFFOLDED DATA.** S0's serve
trace below runs **one real judge call, one real composition call and one real
conformance call** through the provider gateway. A stubbed judge response, a
hardcoded sample debate or a seeded artifact standing in for generation is a
**BLOCKING** review finding — and S0 is where the temptation is greatest, because
S0 is the slice whose whole purpose is to get *something* end to end. Test
fixtures stay legal and confined to the test layer, labeled, never seeded into a
served run (ADR-0012 clause 7; ADR-0009 clause 1).

**The composition pair is in S0 and is not deferred to S5.** AC-51 is
categorical that composition is four steps in order and *"pure render was
rejected"*, and AC-49 / charter S5 put serve-conformance in the protected core
no budget may skip — so a slice that serves without a conformance judge ships a
serve path the pack forbids. **S5 hardens this pipeline; S0 makes it legal.**

**The full ordered S0 serve trace.** Published because a slice that claims a
legal serve path owes the build team the whole ordered chain, not three of its
four gates. Every state is AC-52's or AC-53's; none is invented (Plan §8).

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

**S0's default served form is the downgraded one.** S0's one node has no
evidence subsystem behind it (that is S6), so its basis must be stated rather
than assumed: S0's single node is `way_of_knowing = REASONING` unless a fixture
pins it otherwise, and Q51's limb (c) is `RULED — DR-044(Q51)` as a **blocking**
gate, not an annotation (AC-24 carrier (i); spec §3.10 Q51). S0 therefore serves
**a hypothesis plus a research plan, not a verdict**, by default, and owes
**two** Q51 fixtures: one where a `LOOKED_UP` basis with a resolving locator
serves as a verdict, and one where the reasoning-only basis is **downgraded**.

**Entry criteria.**

| # | Criterion | Status and why it gates S0 |
|---|---|---|
| 0 | **GPG-1 … GPG-4 recorded** (§3.1) | **ALL FOUR DISCHARGED.** GPG-1 satisfied (DR-098/DR-100). **GPG-2 discharged ITEMIZED at the human stack sitting — `RULED — DR-117`** (TypeScript on Node · Fastify + SSE · PostgreSQL + Drizzle · Hatchet per **DR-118** · workers TS · vLLM over HTTP · Compose/Hetzner/Cloudflare), with ticket **PRE-10** aligning the ADRs before any S0 code exists. **GPG-3**: the mechanism is settled and the **five** pins fill at scaffold time under **DR-104**'s resolve-on-machine rule — nothing is invented (AC-76, DR-039). **GPG-4**: ruled at **DR-104(3)** — `packages/contract` starts at 0.1.0, the first ratified register row-set is `register_version` 1. **S0's architectural block is released; the remaining gate is V's own re-prompt** (DR-117's pre-Codex stop). |
| 1 | **Q-01 = RULED — DR-068** | Kept UI component source **MAY** be carried into DebateAI-V3. The repository decision that precedes the first commit is made (Plan §6.8 S0 row; FLAG-4(a)). |
| 2 | **Q-02 = RULED — DR-069** | **NO FENCE.** The kept UI package is a plain, always-visible package beside the engine packages — not a separate workspace, not a separate repository. S0 scaffolds that layout. The clean-room mandate survives as an **honour system with no enforcement mechanism**, priced and accepted by V (FLAG-4(b)). The Q-01 = no branch never arose (§3.2). |
| 3 | **Q-03 = RULED — DR-070** | **Asker = the requesting user/person.** No separate authenticated-principal/session-scope model; authorization and user credentials are **explicitly out of scope for this stage**; V2's existing `user_dev_token` vertical slice is adopted as sufficient. S0 builds that, **with the charter A5.2-style revisit note on the record** — DR-070 is a *provisional simplification*, not a closed design: real principal/session separation may be needed before a multi-tenant or credentialed launch. `GET /v1/session` lands here as the principal surface. |
| — | *Not an entry criterion:* **Q-11** (now DR-079) | S0 runs conformance exhaustively and never needed it (§3.2 above). |

**Gates it must show firing.**

- **`FX-LG-01a`** (wired) — the **continuous** replay self-test: every servable
  number recomputes from frozen records with no model in the path (charter S1;
  DR-034). Owner `apps/scheduler` · `job:replay-self-test`; **S1 hardens it**.
  *The launch ceremony is the other limb, `FX-LG-01b`, and is S1's.*
- **`FX-LG-02`** — the ledger tells the truth (charter S3).
- **`FX-SRV-17`** — **all four AC-52 gates present in order**, each fixture
  naming the position it occupies. Within it: **`FX-C52-03`** — R9 **fires** in
  gate position (charter §5.2 row 3); Q53 **passes through** — vacuous on a
  one-node graph — with its residual-objection field populated, its *firing*
  fixture being S5's **`FX-C52-02`** while S0 demonstrates the position;
  conformance runs; and **Q51 fires after conformance has passed, all three
  limbs — provenance join, locator gate (charter §5.2 row 1), and the
  reasoning-only downgrade to hypothesis-plus-research-plan, which blocks rather
  than annotates**.
- **`FX-SRV-01a`** / **`FX-SRV-01b`** — the two Q51 fixtures that charter §5.2
  row 1 (**`FX-C52-01`**) is discharged by at S0: a `LOOKED_UP` basis with a
  resolving locator **serves as a verdict**; a reasoning-only basis is
  **downgraded**.
- **`FX-SRV-18`** — **the components-only + `DEFECT` terminal is reachable and
  fixtured** rather than being the path. **The named terminal cause S0 must
  fixture** is AC-53's **first** route: *two conformance failures* — compose,
  fail, recompose once, fail again ⇒ components-only + visible `DEFECT`, no new
  loop. The other two routes (a failed post-composition verdict-R9 pass; a
  bundle past the declared hard composition budget) belong to S5's
  **`FX-SRV-19b`** and to S5's hard composition-budget terminal respectively —
  the latter constructible under **DR-078** (Q-10), which makes the budget an
  independent register row with an asker-selected tier.
- **`FX-LG-06`** (exhaustive limb) — stranger coverage runs **exhaustively, with
  no sampling and no consumption of `run.stranger_sample_rate` for coverage**
  (§5 matrix A, S0 row; Plan §6.2 AM-1).
- **`FX-S22-05`** (first limb) — **every MACHINE row S0 executes is proven to
  make zero model calls** (AC-83; DR-037; spec §5.1 F-1, §22.1). S0 owns the
  limb because S0 is the first slice with MACHINE rows in the tree; **S6 owns
  the complete 13-row proof** and **S15 carries the finished proof as bundle
  evidence** (§5, matrix A).
- **`FX-REG-01`** — **bootstrap equality**: the build **fails if
  `register.bootstrap.json` and the ratified register disagree on any bootstrap
  key**. The **five** bootstrap-class keys (`nodeRuntimeVersion`, `pnpmVersion`,
  `postgresMajorVersion`, `typescriptVersion`, **`vllmImageDigest`**) must be
  readable **before the
  database-backed register exists** — you cannot run a migration to learn which
  Postgres major to install — so they are read from a version-controlled file
  **through the same loader**, giving two read *locations* and **one** source of
  truth. Without it the file and the database drift and a run pins a register it
  did not use, which is AC-06 broken with no trace. **The fixture asserts
  equality, never a value**: the five rows ship valueless, and
  **`RULED — DR-104`** is what fills them — the S00 worker records what the build
  machine resolves, into the file and into a ledger follow-up row. **GPG-3**
  (§3.1) carries the rule.
- **`FX-ORPH-01`** / **`FX-ORPH-02`** — G1 / G2 audits **wired and reporting**
  (charter §5.1). **`FX-REG-02`'s `tools/acceptance-bundle → register` edge is
  present from S0** so `FX-ORPH-01`'s walk sees it; the fixture that exercises
  the edge is **S15's**. **`FX-ORPH-03`** and **`FX-ORPH-06`** — the two
  **ADVISORY** reviewed audits (G5 dead cost; the dead-check detector) — are
  **wired from S0 onward** and reviewed at every slice boundary with the
  blocking pair, their findings landing in the S15 bundle (§5.1; `06` §12's
  standing row).
- **`FX-HR-H1`** — **every model call crosses the one provider interface**, from
  the first judge call: no scoring, debate, evidence, metareasoning or
  orchestration code imports or invokes a model SDK directly; provider identity
  is a configured value, not an import (AC-36; Seam C). Asserted over the
  dependency graph, not by review (§5.1).
- **`FX-HR-H3`** — the **purity gate live with `propagation`**: the
  `no-impure-import` lint plus structural rule 1, landing **before** feature
  code (AC-09). Also a standing CI gate on every later build (`06` §12's
  standing row).
- **`FX-LG-04`** (kernel limb) — the **partition law**: membership and count
  against the **five-member terminal-route list**, transcribed once into
  `kernel` and never extended locally (AC-65 as corrected; **DR-037**). The
  founding-table correction that makes the five agree end to end is **A-01**,
  ratified at **DR-099** and applied to `requirements-spec.md` §12.3 by ticket
  **PRE-08** — which discharges gap **TRACE-7 ≡ H-C-1**.
- **`FX-LED-04`** (S0 limb) — the **two stamps on every action row**
  (`subject_item_id`, `stance_at_action`) exist from the first ledger write, so
  the S8 symmetry diff has a population to read (AC-46; DR-045). S1 hardens it;
  S8 consumes it.
- **`FX-DB-07`** (carrier limb) — the **`tier_source` round-trip carrier**
  (`ASKER`, `DEPLOYMENT_POLICY`, `DERIVED` with `tier_provenance_ref`) exists
  from S0; the **behaviour** limb is S9's, where **DR-094** fixes the authority
  (asker declares; deployment policy may **raise, never lower**).
- **`core.work_item`'s DDL gates** — the queue table's invariants are owned by
  its creating migration and asserted through the raw connection (DR-099 A-05;
  ADR-0003/0005; §3.3). The claim **commits before any model call**.

**Done when.** All of the above fire; **every S0 gate fixture names which of the
four AC-52 positions it occupies** (`FX-SRV-17`), so a later slice's "in
position" claim is checkable rather than asserted; **`FX-ORPH-02`**'s
never-called list is reviewed and empty or itemized (rule (ii)).

**Full fixture set for this slice:** `06-test-strategy.md` §12, S0 row.

**Carriers-only zone.** **None**, and now none by ruling as well as by design:
S0's three entry questions are **RULED** (DR-068, DR-069, DR-070), and GPG-3 /
GPG-4 are **discharged** — GPG-3's pins resolve and are recorded at S00 under
**DR-104**, GPG-4's identifiers are ruled at **DR-104(3)** — so neither is a
carriers-only case and neither is a wait. *DR-070 is a provisional
simplification — the revisit note is a done-condition, not a carriers-only zone.*

---

### S1 — Ledger and replay hardening

**Delivers end to end.** Input / contract / content hashes; append-only total
order under the sequence allocator; the four reconstruction paths; the
completeness gate; and `apps/replay` running the ceremony against recorded runs
— **importing only `packages/published-arithmetic` and no other workspace
package** (Plan §2.5a), never a local copy of `agg` / `σ` / product, reading
every structural outcome from frozen rows (Plan §2.5).

**Entry criteria.** S0 green. No open question gates S1.

**Gates it must show firing.**

- **`FX-LG-01b`** — the **launch ceremony** passes **exactly**:
  byte-identical numbers, no model in the path (charter S1, VR-3; spec §22.1
  replay row; DR-034).
- **All three independence limbs evidenced** — **`FX-IND-01`**: the isolation
  proof lists `published-arithmetic` **and nothing else**, pinned at **symbol**
  granularity to exactly `agg`, `σ` and `product` and failing if `apps/replay`
  declares any local arithmetic symbol; **`FX-IND-02`**: the CI assertion
  pinning `packages/published-arithmetic`'s **exported surface** to the same
  three; **`FX-IND-03`**: the **operator attestation** naming the executing
  principal, its read-only credential scope and the run ids it did not produce
  (charter §7 S1, VR-3). *The reader being frozen-records-only is `FX-LG-01b`'s
  no-model-in-the-path assertion.*
- **`FX-LED-01a`** / **`FX-LED-01b`** — the completeness gate **fires** on a
  genuinely missing artifact **and does not fire** on an
  unparseable-but-persisted one, per AC-11's "required node" predicate and
  AC-79.
- **`FX-DB-01a`** / **`FX-DB-01b`** / **`FX-DB-02`** — run immutability and
  totality: `UPDATE` and `DELETE` against the frozen head both raise, and
  current phase / envelope / activation state are total from run creation onward
  with **no empty-stream window** (Plan §4.1a).
- **`FX-LED-02`** — the four reconstruction paths, each refusing to fabricate a
  score where nothing was persisted. The completeness gate's *"scheduled"* input
  is the **`JUDGEMENT_SCHEDULED`** ledger action kind — a ledger action, **not**
  a served typed state (gap `DM-4`, adopted wholesale at **DR-099** A-06/A-07;
  §3.3), so `FX-LED-01a`/`01b` have a member to assert against.
- **`FX-LED-05`** — the hash triple (input / contract / content).
- **`FX-LED-03`** (S1 limb) — the **ledger action vocabulary**: an executed check
  mapping to **no member** of the closed action vocabulary is filed as
  **`UNCLASSIFIED_ACTION`**. The **`UNINSTRUMENTED`-trigger limb is S8's**, where
  the symmetry diff reads it (spec §8.1 A-2; §5.1).
- **`FX-LED-04`** (hardened) — the two stamps, carried from S0 and hardened here
  against the full action vocabulary (AC-46).

**Done when.** `FX-LG-01b`'s ceremony passes on runs S1 did not produce
(`FX-IND-03`'s run-ids limb), **`FX-IND-01`** and **`FX-IND-03`** both exist
with falsifiable expected content, and both completeness-gate directions
(**`FX-LED-01a`**, **`FX-LED-01b`**) are fixtured.

**Full fixture set for this slice:** `06-test-strategy.md` §12, S1 row.

---

### S2 — Graph and the cycle law

**Delivers end to end.** First-class edges with polymorphic targets, three
lifecycles, materialized path, write-time enforcement, construction refusal +
shared-crux redirect.

**Entry criteria.**

| # | Criterion | Why it gates S2 |
|---|---|---|
| 1 | S1 green | Spine order. |
| 2 | **Q-04 = RULED — DR-071** (both halves) | The undercut's shape is **`transmission-reduction`**: a reduction of the targeted support edge's transmitted contribution, **computed inside the pure core and recorded per edge** — a **third ruled producer of arrow strength**. DR-071 grants the `DR-062 OD-06` producer-set extension (two → three), so `strength_source`'s third member **`UNDERCUT_TRANSMISSION` becomes writable**. The old *"either live or removed"* disjunction is **discharged: the member is live**, and S2 builds it. The two rejected shapes (`inert`, `recorded-on-propagation_run`) are closed. |

**Gates it must show firing.**

- **`FX-C52-10`** — the cycle law fires at **all three layers** (charter §5.2
  row 10; DR-056).
- **`FX-DB-08`** — the remaining write-time invariants reject (charter A3.2):
  `target_kind` matches exactly one populated target column; the
  strength / `magnitude_status` binding; no self-edge.
- **`FX-DB-04a`** / **`FX-DB-04b`** — **undercut invariant**: accepted against a
  support edge, **refused against an attack edge**.
- **`FX-DB-05a`** / **`FX-DB-05b`** — **arrow upsert**: an identical duplicate
  collapses; the same identity with a differing payload raises the typed
  integrity error (AC-35, both behaviours).
- **`FX-DB-03a`** / **`FX-DB-03b`** — **non-blank claim** rejects null, empty and
  whitespace-only and accepts content — exercised against the migrated database,
  not an application validator (Plan §2.4).
- **`FX-DB-06a`** / **`FX-DB-06b`** — **cross-run integrity**: every cross-run
  source/target combination is refused, including an otherwise-valid undercut of
  a support edge in another run (AC-69), with the accepting complement inside
  one run so the rejection is scoping and not a general refusal.
- **`FX-PT-ORD`** — **arrow-order stability** across two independent derivations
  of one snapshot (AC-08).

**Done when.** All of the above fire, and `strength_source`'s third member is
**live** — written by a real transmission reduction, demonstrated end to end on
a real undercut. A member declared and unreachable at S2 exit would still be an
AC-77 orphan, and **`FX-ORPH-02`**'s never-called list is where that shows.

**Full fixture set for this slice:** `06-test-strategy.md` §12, S2 row.

**Carriers-only zone — STRUCK (DR-071).** This slice formerly carried one:
*"until Q-04 is answered the schema may declare `UNDERCUT_TRANSMISSION` but it
is **NOT WRITABLE** (Plan §4.2(4)), enforced **by convention, with no
mechanism**"*. **DR-071 makes the member writable and the reduction buildable**,
so the zone is dead text and is removed rather than left to be read as live law.
With it goes the residual risk it carried — R-3's *"if that entry criterion is
ever relaxed, this becomes a live gap"* (`reviews/opus-plan-rereview-2.md`) —
because there is no longer an unenforced non-writability to relax: the `CHECK`
fences stay, the member is written.

---

### S3 — Scoring engine

**Delivers end to end.** DF-QuAD with both operators, the operator resolution
chain, cluster collapse records, leverage and fragility outputs, the rival
reading, the graph fingerprint.

**Entry criteria.**

| # | Criterion | Why it gates S3 |
|---|---|---|
| 1 | S2 green | The arithmetic runs over the frozen edge table. |
| 2 | **Q-05 = RULED — DR-072** | **Folder-lift first, then `OD-02`'s judged-ancestor lift**, with **both-ends markers emitted in both cases**. Verdict-affecting, as the manifest's own evidence shows (a root moving 0.96875 → 0.5, manifest §10.2) — so the order is built, not chosen at implementation time. |
| 3 | **Q-06 = RULED — DR-073** | Provenance-cluster collapse applies to **both polarities**, support **and** attack. A claim node's cluster key derives from the provenance of its evidence and the producing run/model-family; **a node with no resolvable key clusters alone**. |
| 4 | **Q-07 = RULED — DR-074** | The deployment-level scoring operator is **MANDATORY, never blank** — a required register row, with **no undeclared/withhold state at the deployment level**; parent- and run-level overrides stay optional on top. **The declare-once/withhold runtime machinery is dropped from the design** (nothing is left to trigger it). The anti-defect property — the operator is a **recorded config value, never a hardcoded literal** — is preserved by the mandatory register row, not by a runtime fallback. See the P-D2 rescope below. |
| 5 | **Q-08 = RULED — DR-075** | A `pending` node **is** an unjudged interior node under `OD-02`: no scoring arrow contributed to its parent yet, children lift to the nearest judged ancestor, skip-markers at **both** ends. **Placeholder arrows are live, real arrow endpoints** — the *"endpoint absent from the node set"* error is reserved for genuinely foreign or deleted endpoints, **never** a legitimate placeholder. Serving a placeholder **as a claim** stays forbidden regardless (manifest §6.2 item 10, AC-86). DR-076's observability amendment rides the same question but lands at **S7/S14** (§3.3), not here — it changes nothing about what contributes to a served score. |

**Gates it must show firing.**

- **`FX-LV-01`** / **`FX-LV-02`** — both literature vectors reproduce (AC-80;
  spec §22 Z-2), with **`FX-LV-03…FX-LV-09`** carrying the four non-strict
  properties, the two strict properties and the tie boundary.
- **`FX-PT-D1`** / **`FX-PT-D2`** / **`FX-PT-D3`** — P-D1, P-D2, P-D3 green
  (charter §7 S2).
- **`FX-PT-FLG`** — AC-25: the semantic-restatement flag **changes no number**.
- **`FX-PT-POS`** — AC-31: **no position re-encoding**; the position label
  travels.
- **`FX-C52-09`** — the leverage bound serves `LEVERAGE_UNRESOLVED`, naming the
  carrying piece (charter §5.2 row 9; DR-050).
- **`FX-HR-H4`** — **swappable semantics**: the default gradual semantics sits
  behind a strategy interface and **both combination operators are computable on
  demand**, so the rival reading serves beside the deciding one; **selection is
  never by source literal** (AC-22; DR-040, DR-031 Q47). It overlaps `FX-PT-D2`
  by design — the house rule is the floor, the property the ceiling (§5.1).

**The P-D2 gate, rescoped by DR-074 — and the machinery deleted with it.**
S3's stated P-D2 gate was *"`FX-PT-D2` (undeclared-parent limb) — an **undeclared
parent takes DR-040's path**, not a default"*. **That limb is unconstructible
under DR-074 and is deleted**: with the deployment row mandatory and never
blank, **no parent can be undeclared**, so there is no undeclared-parent path
left to exercise. DR-074 states the replacement in its own words, and this is
what `FX-PT-D2` now asserts:

> **the operator resolves from parent / run / deployment register rows, never a
> source literal.**

**What is deleted, recorded so the deletion is checkable rather than quiet:**
the **declare-once / withhold runtime machinery** — the undeclared state, the
withhold path, and the runtime fallback that made the operator's provenance
visible only when something went wrong. **What replaces it:** the mandatory
register row, plus the **supplying level recorded on the produced number**
(ADR-0011), so the operator's provenance is visible on every number rather than
on the exceptional one. **The trap this creates for the builder, named here:**
the `WITHHELD`-for-undeclared-operator branch that AC-22 and `FX-SRV-06` carried
becomes **unreachable code** — it must be removed at S3/S5, or it is an AC-77
orphan and an **`FX-ORPH-02` BLOCKING** entry on the day it lands. The
`served_number` `WITHHELD` member survives for **other** reasons (an unjudged
conjunct under strict-and, AC-26) — **do not conflate the two**.

**Carriers-only zone — STRUCK (DR-072, DR-073, DR-075).** This slice formerly
carried one: *"with Q-05 / Q-06 / Q-08 open, S3 may build the collapse record
shape, the marker vocabulary and the propagation-run provenance, but not the
lifting composition, the attack-side collapse decision or the `pending`
arithmetic."* **All three questions are ruled, so S3 builds the behaviour, not
the carriers.** What survives from that text is not a fence but a **replay
obligation**: every ruled structural outcome — the transmission reduction
(DR-071), the folder-then-ancestor lift markers (DR-072), the both-polarity
cluster records (DR-073), the effective operator **and its supplying level**
(DR-074), the selection rule and dispersion (DR-077) — **lands as recorded
columns on `propagation_run` / `node_strength_record`, or the replay ceremony
proves nothing about them** (ADR-0004/0012).

**Full fixture set for this slice:** `06-test-strategy.md` §12, S3 row.

---

### S4 — Judge contract and panel

**Delivers end to end.** Claim typing, the deterministic reducer, panels with
per-member failure isolation, dispersion, correlated-error grouping, the
disagreement flag, typed non-answers.

**Entry criteria.**

| # | Criterion | Why it gates S4 |
|---|---|---|
| 1 | S3 green | The reducer's output feeds the scored graph. |
| 2 | **Q-09 = RULED — DR-077** | A judge's earned weight **multiplies the served arithmetic** — consumed in the **selection** of which judgement becomes the reduced score, under a **declared rule**, and **never by averaging**. **Dispersion is measured and served separately, never blended away.** S4 builds that consumption; P-D5's *"at least one judge's weight moves"* now has a real assertion target at S12. |

**Gates it must show firing.**

- **`FX-S22-01`** — the **disagreement flag fires both ways** (charter VR-1;
  spec §22.1): fires at least once as the launch-day minimum, and is shown to
  fire both ways as the adoption bar.
- **`FX-PT-D1`** (no-default-τ limb) — **no default τ from an unusable judge**.
- **`FX-LG-15`** — a panel member failure **isolates**, and dispersion is
  measured across ≥2 distinct judgements (AC-04).
- **`FX-LG-16`** — the judge contract's **claim-type → composition map is held
  as data, never a source literal**, and parse failure stays distinguishable
  from schema failure. Its **canonical home is `register.register_row`** (gap
  `DM-3`, accepted wholesale at **DR-099** A-06); the **structure** is asserted
  here, the **contents** are V's at **VG-02** (DR-023) — S4 asserts the shape and
  invents no cell.
- **`FX-HR-H6`** (produced-never-grades limb) — **the agent that produced an
  artifact never grades it** (AC-39). S4 owes this limb because the panel is
  where a producer could grade its own output; **the blinding /
  identity-stripping limb is S8's** (§5.1).

**Carriers-only zone — STRUCK (DR-077).** This slice formerly carried one:
*"until Q-09 is answered, S4 may record weight, its version and its provenance
as frozen replay inputs but may not consume weight in any served arithmetic."*
**DR-077 rules what weight multiplies, so S4 consumes it.** The frozen-replay-
input half was never the fence and still holds by entailment (U-5,
RESOLVED-BY-PACK: any input that moved a served number is a frozen replay
input) — `judge_weight_version` stays frozen on `reduced_judgement`.

**Full fixture set for this slice:** `06-test-strategy.md` §12, S4 row.

---

### S5 — Serve pipeline hardened

**Delivers end to end.** The full gate order and terminals; segment-addressed
text **with its segment→number reference set**; machine-injected honesty fields;
projections; the components-only rendering; organ 6's preconditions, sanitizing,
reconciliation and honest-degradation vocabulary (AC-86…AC-91); **AC-24's
band-ceiling projection, now a firing gate that caps** (DR-082 + DR-086); the
**asker-selected composition-budget tier input** on `POST /v1/asks`, resolving
against the independent budget row (DR-078, §3.3); and the debug facet **at its
operator-scoped address** (Plan §5.3).

**Entry criteria.**

| # | Criterion | Why it gates S5 |
|---|---|---|
| 1 | S0 green (the legal serve path exists); S3, S4 green | S5 hardens what S0 made legal. |
| 2 | **Q-10 = RULED — DR-078** | The hard composition-bundle budget is an **independent register row**, distinct from DR-052's cost envelope so **`DEFECT` and `ENVELOPE_EXHAUSTED` stay distinguishable** — **with V's amendment: the cap is user-facing as a tier list (low / medium / high) the asker selects per run**, mirroring the existing asker-depth dial. The register carries the per-tier values; the asker's choice resolves which applies. AC-53's **third terminal route** becomes buildable here. **No number is invented**: the per-tier values are V's at **VG-02** (DR-023, AC-76). |
| 3 | **Q-11 = RULED — DR-079** | The non-node senses of "load-bearing" **project from the charter's node definition**: *a sentence is load-bearing iff it asserts a fact drawn from a load-bearing node or states a served number; a claim iff its node is; an unknown iff removing it would change the verdict or band.* Conformance **sampling** is therefore constructible here (`FX-LG-06`'s sampling limb), as are memory-locator re-verification and the ignorance ledger. S0 ran exhaustively and needed none of it. |
| 4 | **Q-12 = RULED — DR-080** | The three closed sets of six are **separate vocabularies** — three declared vocabularies **plus two explicit register-row mapping tables** (`Q8 type → abstention class`; `(Q7 act, Q8 type) → scorecard task class`). The price cell's key is defined by the first table; the second keys S12's scorecard cells. **Mapping-table contents are V's at VG-02.** |
| 5 | **Q-13 = RULED — DR-081** | `OD-11`'s layer-2 per-side provenance detail activates **behind a register row V flips** — **layer 1 is the default**, **both states are testable before the flip**, and **nothing ships dark**. That named condition is what DR-066(2) required of a successor. G4 configuration-reachability binds both branches (`FX-ORPH-05`). |
| 6 | **Q-14 = RULED — DR-082 (half i) + DR-086 (half ii)** | **Half (i), DR-082:** the band rule is a **second, independent gate** beside DR-044(Q51)'s three blocking gates — **not a restatement**. `band_ceiling {label, basis}` ships on the Answer, computed from the load-bearing nodes' way-of-knowing distribution. **Half (ii), DR-086:** when the gate **fires it caps the confidence band** — the answer **serves**, cannot reach the top band, and **wears its ceiling label visibly**, with a **recorded lift path**, mirroring DR-014's cap + label + lift-path pattern. **It never silently blocks.** Label vocabulary and cut points remain register rows V ratifies at **VG-02** (DR-023). |

**Gates it must show firing.**

- **`FX-C52-08`** — serve termination to components-only + `DEFECT` (charter
  §5.2 row 8).
- **`FX-C52-02`** — Q53 objection visibility (charter §5.2 row 2). This is Q53's
  **firing** fixture; S0's `FX-SRV-17` demonstrated only the position.
- **`FX-C52-11`** — verdict-R9 post-composition (charter §5.2 row 11; DR-057).
- **`FX-C52-12`** — **degraded-mode projections + replay eviction** (charter
  §5.2 row 12), discharged by four assertions: **`FX-SRV-02`** — the frozen
  conformance record is **byte-identical before and after**; **`FX-SRV-04`** —
  the sealed answer version still **replays historically**; **`FX-SRV-05`** —
  the current projection reads **components-only + `DEFECT`** with the status
  change written as a `served_number_event`; and **`FX-SRV-03`** — the segment
  reciting the evicted number is suppressed via an append-only
  `segment_suppression` row. **`FX-SRV-15`** carries the reversal point and the
  builds-on-previous disclosure as structured projection fields with no composed
  prose.
- **`FX-SRV-19a…FX-SRV-19f`** — the six terminal fixtures (spec §12.1a S-9).
- **`FX-SRV-07`** — five distinct typed refusals each demonstrated (AC-86).
- **`FX-SRV-08`** / **`FX-SRV-09`** / **`FX-SRV-11`** — organ 6's sanitizing,
  coverage reconciliation and honest-degradation vocabulary (AC-87, AC-88,
  AC-90).
- **`FX-SRV-16`** — condition marks reach the nodes they describe: the affected
  set stored **once** in `condition_mark_node` and projected per node at read
  time (AC-85; Plan §6.6 UI-9).
- **`FX-LG-03`** — the full gate order and `max_recompose = 2` (DR-049).
- **`FX-LG-06`** (sampling limb) — conformance **sampling** derived from the
  asker's run parameters, arriving here rather than at S0 (§5 matrix A, S5 row).
  **Constructible under DR-079** (Q-11), which supplies the load-bearing
  projection rule the sampling predicate needs.
- **`FX-WIRE-01`** — no `raw_text` anywhere in a tier-2 payload.
- **`FX-PT-D4`** (serve limb) — *every weight-bearing number in a served payload
  carries its own kind, source and producer; no payload-level label may be
  contradicted by a per-item fact* (AC-63, AC-34; manifest §12.2; charter §7 S2
  makes P-D1…P-D5 mandatory). The **wire limb is S14's**; both limbs are owed
  because the property holds **by type** through the labeled number and the test
  proves the type is not bypassed at assembly.
- **`FX-SRV-13`** — **`band_ceiling` as a settled second gate that caps, never
  blocks (DR-082 + DR-086). The hedge is removed.** The fixture asserts one
  behaviour, not two: every band **names** its way-of-knowing ceiling
  (`band_ceiling {label, basis}` on the Answer, computed from the load-bearing
  nodes' `way_of_knowing` distribution and the Q51 downgrade state, printed
  beside the band and printing its register row — charter VR-2, AC-24); and when
  the gate **fires**, the answer **serves with its band capped**, cannot reach
  the top band, carries the ceiling label **visibly**, and **records the lift
  path**. **A firing that blocks the serve is a defect**, and so is a silent
  one. **The struck hedge, in full:** *"`band_ceiling`, **carried conditionally,
  not as a settled gate**. **Under Q-14 half (i) answer 'a second obligation': a
  blocking gate** — every band must **name** its way-of-knowing ceiling before
  serving (charter VR-2, AC-24). **Under the answer 'a restatement of
  DR-044(Q51)'s band half': not a gate at all**, but a **projection assertion** —
  the field is present, typed and correctly derived on every served answer, with
  the blocking force staying with Q51's three limbs. **This document does not
  choose between them**; `FX-SRV-13` hedges the same way."* **DR-082 chose: a
  second, independent gate, not a restatement — so the first branch's *gate*
  reading wins and the second branch is dead. DR-086 then chose what firing
  does, which neither branch offered: it caps rather than blocks**, so the
  surviving branch's *"before serving"* blocking force is itself replaced by the
  cap. The naming obligation and the typed, correctly-derived projection field
  survive from both branches; the hedge does not.
- **`FX-SRV-06`** — the **number slot's three states**:
  `PRESENT | EVICTED(MISSING-NUMBER) | WITHHELD(reason)` are three distinct
  served states, **all distinct from *absent*, which the schema does not admit**
  (AC-12, AC-22, AC-26, AC-63). **Rescoped by DR-074**: its
  `WITHHELD`-for-undeclared-operator limb is gone with the withhold machinery
  (see S3); the surviving `WITHHELD` reasons are the real ones, strict-and's
  unjudged conjunct first among them.
- **`FX-SRV-14`** — **machine-injected honesty fields**: residual objections,
  badges and condition marks are injected into the output structure **by the
  machine, outside the composition model's discretion**, so **silent truncation
  of an honesty surface is impossible by construction**; and honesty projections
  are **non-optional fields**, so a serializer cannot do what the composition
  model is forbidden to do (AC-54).
- **`FX-SRV-16`** (serve limb) — **condition marks reach the nodes they
  describe**: the affected set stored **once** in `condition_mark_node` and
  **projected per node at read time** (AC-85; Plan §6.6 UI-9). **The owning slice
  is S9** — see §5.1's reconciliation — because the mark whose affected set the
  fixture must inspect is the budget skip; S5 owes the read-time projection half.
- **`FX-LG-04`** (serve limb) — **one abstention kind and several condition
  marks per answer** on a served answer (DR-051's partition law). The kernel
  membership-and-count limb is S0's.
- **`FX-HR-H7`** (serve limb) — **Q53 objection visibility runs ahead of
  conformance** in the gate order, and the **residual objection is a fact-bundle
  field** — it cannot be satisfied by the composition model happening to mention
  it (spec S-6; DR-049). **The skeptic-certification limb is S7's** (§5.1).

**The serve order after DR-082 + DR-086: four gates and the cap.** S0's
published trace stands unchanged as the ordered chain — **R9 → Q53 →
conformance → Q51** — and the band rule sits beside it as a **second,
independent gate whose firing caps the band rather than terminating the serve**.
It is not a fifth blocking gate and not a restatement of Q51's band half.
`FX-LG-03` continues to assert the four-gate order and `max_recompose = 2`;
`FX-SRV-13` asserts the cap.

**Carriers-only zone — STRUCK (DR-078, DR-079, DR-080, DR-081, DR-082+DR-086).**
This slice formerly carried one: *"with Q-14 open, S5 ships the `band_ceiling`
carrier … and the gate/projection question above is not decided by building the
carrier."* **The question is decided** — second independent gate, capping
semantics — **so S5 ships the behaviour, not a hedged carrier.** What survives
is a **value-pending** state, not a carriers-only zone: the **label vocabulary
and cut points**, the **per-tier composition-budget values**, DR-080's **two
mapping tables** and DR-081's **flip row** ship as register rows with **no
invented values** (AC-74, AC-76, DR-039), ratified at **VG-02**, and an
unratified read fails **loud and typed** rather than defaulting.

**Full fixture set for this slice:** `06-test-strategy.md` §12, S5 row.

---

### S6 — Evidence subsystem

**Delivers end to end.** Frozen queries and typed amendments, admissibility,
access depth, absence rows, provenance clusters and their key, freshness, probe
capture and instrument certification, the eight citation routes.

**Entry criteria.**

| # | Criterion | Why it gates S6 |
|---|---|---|
| 1 | S5 green | Evidence feeds the hardened serve path. |
| 2 | **Q-15 = RULED — DR-083** | The activation table is **re-derived and ratified in-repo** as a **first-class per-row contract field** (`ACTIVE / INACTIVE / WAIT / POLICY_BLOCKED`, **a written predicate per row**, populated from spec §3's row contracts). **A row whose predicate the spec only summarizes files as `POLICY_BLOCKED` — loud, never a silent skip.** **No import of the old research artifact.** The 71-row artifact is drafted by **PRE-05** and ratified at **VG-02**. |
| 3 | **Q-16 = RULED — DR-084** | The eight typed citation failure routes: **architecture proposes the closed enum, V ratifies.** **Loud failure, no generic "other."** Any member that surfaces to a reader is placed in spec §12.3 **by amendment** — S-13's single-minting-place law is intact. The proposal is **PRE-07**'s; ratification is **VG-02**'s. |
| 4 | **Q-17 = RULED — DR-085** | The `OD-20` evidence gate ships **tier-invariant with shadow mode**: eligibility is **the exact complement of §5.2(f)'s evidence-free list**; the tier × claim-type map is an **empty register table V fills**; until then the gate **publishes what it would have suppressed beside the unsuppressed result**. Inventing per-cell eligibility stays barred (DR-039). |
| 5 | **Q-18 = RULED — DR-087** | `mixed` and `unknown` are **evidence-GATED, fail-closed** — gate unless proven evidence-free, so the H5 floor is never breached by failing open. **`value-laden` is a cross-cutting flag, not a claim type**: `OD-16`'s vocabulary stays closed and the flag lands as a new field on the claim record (§3.3). |
| 6 | **Q-19 = RULED — DR-088** | **Auto-activation counts as shipped dark — the charter's not-shipped rule wins.** *"Auto-activates"* describes the **activation event only**: the citation hard-kill gate is **written when the quote matcher validates, never shipped inert**. The acceptance bundle therefore carries the **NOT-SHIPPED attestation**, not a firing fixture — `FX-DEF-01`'s shape stands as designed, and charter §9 contradiction 6 is resolved. |

**Gates it must show firing.**

- **`FX-HR-H5`** — every leaf is gated by the evidence subsystem: evidence
  leaves that cite sources receive base scores **from the evidence pipeline, not
  from a model assertion**.
- **`FX-LG-08`** — off-subject downgrade visible (DR-009).
- **`FX-PT-D3`** — P-D3 against real clusters.
- **`FX-SRV-12`** — suppression carries its unlock, and the evidence gate runs in
  **shadow mode** (AC-91).
- **`FX-DEF-01`** — **citation hard-kill NOT shipped**, carried as its
  NOT-SHIPPED attestation rather than as a fixture (charter §5.2 deferred table,
  A4.4). **Settled by DR-088**: auto-activation counts as shipped dark, so the
  gate is **not written** and the attestation stands. **The struck conditional,
  in full:** *"— **subject to Q-19**: if V rules the other way, Plan §6.7's
  D-4/D-5 row and this slice both change, and the bundle carries a firing fixture
  instead."* **V ruled the other way was wrong**: Plan §6.7's D-4/D-5 row does
  **not** change, this slice does **not** change, and the bundle carries the
  attestation, not a fixture.
- **`FX-DEF-02`** — **coverage-as-gate NOT shipped**: `UNCOVERED-SCOPE` ships as
  a diagnostic note, the gate does not ship, and the attestation lands in the
  S15 bundle (§8; charter §5.2 deferred table).
- **`FX-S22-05`** (complete) — **each of the 13 MACHINE rows is
  proven to make zero model calls**, the `·A·` always-run marker is retired, **a
  cache hit never sets a row INACTIVE**, and **`POLICY_BLOCKED` is never filed as
  INACTIVE** (AC-83; DR-037; spec §5.1 F-1, §1, §3.13, §22.1). S6 owns the
  complete proof because its two activation limbs are row-contract behaviour,
  which is this slice's subject; **S0 owns the first limb** and **S15 carries the
  finished proof as bundle evidence**. *The activation limbs were stated as
  invariants that hold under every answer to Q-15 — `POLICY_BLOCKED` is never
  filed as INACTIVE regardless (spec §1) — so the fixture never waited on it;
  **DR-083** now supplies the predicates themselves, and files a spec-summarised
  predicate as `POLICY_BLOCKED` by ruling rather than by fallback.*

**Carriers-only zone — STRUCK (DR-083, DR-084, DR-085, DR-087, DR-088).** This
slice formerly carried one. **The struck text, in full:**

> *"**Carriers-only zone.** Until Q-17 is answered, the evidence gate runs in
> **shadow mode** — publishing what it would have suppressed beside the
> unsuppressed band — so its behaviour is observable before it binds (AC-91). The
> tiering map ships as an **empty register table** with no invented cells
> (AC-76). Until Q-15 is answered, any row whose predicate the spec only
> summarises is filed **`POLICY_BLOCKED`**, which spec §1 forbids filing as
> INACTIVE, so the gap is loud and never a silent skip."*

**Struck clause by clause, each against the ruling that struck it.** The
**Q-17 clause** (*"until Q-17 is answered, the evidence gate runs in shadow
mode … so its behaviour is observable before it binds"*) is struck by
**DR-085**: shadow mode is not a posture that ends when V answers — it **is**
the ruling, tier-invariant, publishing what it would have suppressed beside the
unsuppressed result. The **map clause** (*"the tiering map ships as an empty
register table with no invented cells"*) is **not** struck: DR-085 keeps it
verbatim, but it is now a **value-pending** state V fills at VG-02, not a
carriers-only fence. The **Q-15 clause** (*"until Q-15 is answered, any row
whose predicate the spec only summarises is filed `POLICY_BLOCKED` … so the gap
is loud and never a silent skip"*) is struck by **DR-083**: the filing is the
ruling's own requirement, loud by construction and never INACTIVE (spec §1), not
an interim gap-marker. **DR-084**, **DR-087** and **DR-088** appear in the strike
heading because they close the slice's three remaining questions (Q-16, Q-18,
Q-19) and so remove any ground on which a new zone could be written here; they
strike no clause of the text above, which never mentioned them.

**Also landing here, from the rulings** (§3.3): the **`value-laden`
cross-cutting flag** field on the claim record (DR-087; `OD-16`'s vocabulary
stays closed), and the **`evidence` schema's eight tables** with their DDL gates
and raw-connection migration fixtures (gap `DM-1`, accepted at DR-099 A-06) —
S6 is the slice that owns them, and until it lands there is no evidence schema
in the migration lineage.

**Full fixture set for this slice:** `06-test-strategy.md` §12, S6 row.

---

### S7 — SPLIT loop and defeaters

**Delivers end to end.** Children + defeaters in one act, the cold-reader test,
falsifier rotation, the rival carver, caps, and the pure decision→spawn
function.

**Entry criteria.** S6 green. Both blocking questions are **RULED**:

- **Q-20 = RULED — DR-089. The WAIT drain law.** At debate (run) completion
  **NOTHING remains in a waiting state** — every node is fulfilled and
  user-visible, and a waiting node completes as soon as its dependencies
  complete. **The run records a typed terminal state at completion.** V's own
  words on Q61's direction: it fires **AFTER** the debate is completed, its
  outcome saved to the execution ledger (DR-027); if the debate is not completed
  or cannot complete, **it never fires for that debate**. Q61 is therefore **not
  an intra-run WAIT row** but a **post-completion settlement event** whose
  standing watch lives **outside the run lifecycle** — that half is **S12's**
  (§3.3). This amends the literal reading of spec §3 Q61's *"may sit in WAIT
  indefinitely"*: the indefinite watch persists **across** runs, outside any
  run, and **no completed run displays a dangling WAIT**.
- **Q-21 = RULED — DR-090.** Rival-carver selection runs on the
  **maker-diversity floor alone (DR-013)**; *"measured behavioural difference"*
  is **recorded as unavailable, not approximated** (DR-039). A future real
  metric lands as a register/scorecard upgrade, **no re-architecture**.

**Also landing here, from the rulings** (§3.3): **DR-076's spawn half** — a
pending node is structurally connected to its parent **from the moment it
spawns** via the live placeholder arrow, and its lifecycle (generating → being
judged → scored) is emitted on the stream through the event vocabulary
`04-api-contract.md` mints, every name with a declared consumer (E1) and
projection-grade payloads. **`generating` stays derived-only and is never
persisted** (`02` §13/§14): the live surface is the event stream, not a column.

**Gates it must show firing.**

- **`FX-LED-06`** — only categorically-grounded decisions spawn work (AC-48),
  and `decision_record`'s replay identity hash excludes the idempotency key,
  spawn count and classification fields.
- **`FX-HR-H3D`** — organ 4's purity fence: `battery/decision` may import
  nothing but `kernel` (AC-48).
- **`FX-LG-14`** — the three SPLIT obligations: **defeater completeness**
  (non-empty or exhaustion-marked); **`UNFALSIFIED-AFTER-ROTATION` serves**; and
  the **regeneration cap** yielding the typed "not runnable" abstention.
- **`FX-HR-H7`** (skeptic-certification limb) — the skeptic certifies that no
  unaddressed attack remains; a node is not converged until the skeptic hook
  passes. **The Q53-ahead-of-conformance limb is S5's** (§5.1).

**Carriers-only zone — STRUCK (DR-089, DR-090).** This slice formerly carried
one. **The struck text, in full — both halves:**

> *"**Carriers-only zone.** With Q-20 open, `run_row_activation` ships as the
> immutable row plus its append-only event stream — a state machine that can
> implement any of the three readings — but the **runner's evaluation policy**
> and the terminality decision are recorded only after V rules (Plan §6.2
> AM-10). With Q-21 open, rival-carver selection runs on the **maker-diversity
> floor alone** (DR-013) and the "measured difference" criterion is **recorded
> as unavailable**, not approximated (DR-039; charter G3/G4)."*

**The Q-20 half is struck by DR-089.** *"A state machine that can implement any
of the three readings"* and *"the runner's evaluation policy and the terminality
decision are recorded only after V rules"* are both dead: the policy **is**
ruled, so it is built rather than deferred — run completion is a **fold over the
activation event stream proving no row remains in WAIT**, and the run records
its **typed terminal state**.

**The Q-21 half is struck by DR-090, but for the opposite reason, and the
distinction matters for the audit.** Its words — *"rival-carver selection runs on
the maker-diversity floor alone (DR-013) and the 'measured difference' criterion
is recorded as unavailable, not approximated (DR-039; charter G3/G4)"* — describe
**exactly what DR-090 then ruled**. What is struck is therefore not the
behaviour but its **status**: it was written as a stopgap holding until V
answered, and it is now the **ruled, permanent design**, with a future real
metric landing as a register/scorecard upgrade and **no re-architecture**. The
sentence survives as law; the *"with Q-21 open"* framing around it does not.

**Full fixture set for this slice:** `06-test-strategy.md` §12, S7 row.

---

### S8 — CROSS

**Delivers end to end.** Lineage rules, blinding, the independence receipt, the
symmetry diff with its two stamps, `UNINSTRUMENTED` and the remediation layer,
the objection ledger.

**Entry criteria.** S7 green. Both blocking questions are **RULED**:

- **Q-22 = RULED — DR-091.** The CASUAL-tier blind-verification trigger is the
  **CROSS-entry leverage snapshot** — computed from the then-current graph **by
  the pure core, with no model calls** — recorded as the trigger's **basis**;
  the **COMPOSE-time recomputation is authoritative**. **V explicitly authorizes
  the proxy the plan refused to select silently**, so the objection that *"no DR
  authorizes a proxy"* is discharged by name. Standard and high-stakes coverage
  is unchanged (always verify, DR-019 knob 3). *The snapshot is pure-core
  computation inside the MACHINE-row region `FX-S22-05` polices — zero model
  calls — and the recorded basis is a **trigger basis, never a score input**
  (AC-29).*
- **Q-23 = RULED — DR-092.** The Q34 symmetry diff runs over **item-scoped
  actions only** — the subject-carrying members of the closed action vocabulary
  — and **pre-item actions are excluded by kind, never by value**, so
  **`UNASSIGNED` stays a real signal**. A-12's deliberate-asymmetry fixture, a
  launch gate, **becomes passable as designed**.

**Also landing here, from the rulings** (§3.3): the **`critique` schema's four
tables** with their DDL gates and raw-connection migration fixtures (the
`critique` half of gap `DM-2`, accepted at DR-099 A-06).

**Gates it must show firing.**

- **`FX-S22-02`** — **symmetry fires both ways** (spec §22.1): the
  deliberate-asymmetry fixture emits `ASYMMETRIC` with exact remediation
  targets; the stripped-telemetry fixture emits `UNINSTRUMENTED` and never
  `SYMMETRIC`.
- **`FX-LED-04`** — the two stamps (`subject_item_id`, `stance_at_action`) on
  every action row that the diff reads.
- **`FX-C52-04`** — the DR-014 cap path (charter §5.2 row 4).
- **`FX-PRV-01a`** / **`FX-PRV-01b`** / **`FX-PRV-02`** — **multi-maker critique
  at standard+, both halves**: the per-run one, **and the two deployment
  predicates of Plan §3.2 Seam C, fixtured separately so the DR-055 standing
  gate and the DR-014 transient path are distinguishable** —
  `deployment_maker_capability` **FAILS** on a standing one-maker deployment
  (standard+ asks refused, no S15 attestation, `FX-PRV-01a`) and **PASSES** on a
  two-maker deployment even while `run_maker_reachability` is false for one
  provider mid-run, in which case that run takes DR-014's cap-and-label path and
  the counter classifies it transient (`FX-PRV-01b`, `FX-PRV-02`; AC-38, charter
  §7 S4).
- **`FX-HR-H2a`** — the config-only switch, **a launch prerequisite** under
  AC-38/DR-055 and evidenced again in the S15 bundle; **`FX-HR-H2b`** — the
  plugin boundary.
- **`FX-HR-H6`** (blinding limb) — blinding and identity-stripping: agent
  identity is stripped before another debate role reads prior turns.
  **The produced-never-grades limb is S4's** (§5.1).
- **`FX-LED-03`** (`UNINSTRUMENTED`-trigger limb) — an `UNCLASSIFIED_ACTION` row
  **is itself an `UNINSTRUMENTED` trigger**, which is what makes the fairness
  claim withholdable rather than quietly true (spec §8.1 A-2; DR-045). The
  vocabulary limb is S1's.

**Carriers-only zone — STRUCK (DR-091).** This slice formerly carried one:
*"with Q-22 open, the coverage trigger is **recorded as unresolved on casual
runs** and the shape supports all three options; the C4 row contract must not
select a proxy silently."* **DR-091 selects the proxy explicitly and on the
record**, which is exactly the act the zone existed to prevent happening
silently — so the shape stops supporting three options and **builds the
authorized one**, recording the leverage snapshot as the trigger's basis.

**Full fixture set for this slice:** `06-test-strategy.md` §12, S8 row.

---

### S9 — Budget and envelope

**Delivers end to end.** The visible cost envelope, typed enrichment skips, the
protected core's refusal, the hard stop.

**Entry criteria.** S8 green. Both blocking questions are **RULED**:

- **Q-24 = RULED — DR-093.** The per-row correctness/enrichment classification
  is produced by **architecture proposing the full 71-row split and V ratifying
  once** — one sitting, alongside the register, on the wholesale-register
  pattern of DR-061/DR-062. **Clarified on the record: this is one-time
  design-time config, fully automatic at runtime, with no human in any user's
  loop.** **Until ratified, rows behave as correctness and are never skipped.**
  The proposal is **PRE-06**'s; ratification is **VG-02**'s, and at ratification
  **LRD-1 becomes constructible** (§7).
- **Q-25 = RULED — DR-094.** Risk tier: **the asker declares; deployment policy
  may RAISE but never lower.** `tier_source` provenance is recorded and printed
  as designed. Consistent with DR-078's user-facing tier dials and DR-070's
  asker ruling. *The raise-never-lower enforcement is its own fixture direction,
  and the `DERIVED` supplier must be audited for reachability: if no production
  path produces it, the member is removed and `FX-DB-07` is rescoped to the
  reachable set, or it is an AC-77 orphan and an `FX-ORPH-02` **BLOCKING**
  entry.*

**Also gating S9, and it is a value not a ruling:** `FX-HR-H8`'s remaining
stop-condition constants ride gap **`REG-8`** — *"one consolidated typed row vs
N stable keys"* — which is **the one gap-register row with no ruling**, still
**pending V/FinalPlan at VG-02**. No value is at stake either way; the question
is which document names the members, and enumerating invented members would
breach AC-76/DR-039.

**Gates it must show firing.**

- **`FX-C52-06`** — the **budget-skip marker and the protected core's refusal**
  (charter §5.2 row 6) — **see launch-readiness dependency LRD-1 in §7 below:
  the mechanism that resolves it is ruled (DR-093), and the fixture becomes
  constructible at VG-02's ratification, which must name the enrichment row(s)
  the fixture uses.** The fixture **must inspect a node**, not only the answer:
  an answer-scoped mark with an empty affected set would pass silently
  (`FX-SRV-16`).
- **`FX-C52-07`** — **envelope exhaustion** (charter §5.2 row 7; DR-052):
  hard-stops and serves already-verified components with `ENVELOPE_EXHAUSTED`,
  never a silent timeout.
- **`FX-LG-05`** — the visible envelope, enrichment skipped before any hard
  stop, the protected core never skipped, and the **rate frozen at run start**
  (AC-50); **`FX-LG-06`** (frozen-rate limb) carries the ratchet-on-the-next-run
  half (§5 matrix A, S9 row).
- **`FX-HR-H8`** — protected-core rows refuse the skip, enrichment is skipped
  before any hard stop, and the convergence comparison carries its typed
  non-comparison reason.
- **`FX-DB-07`** (behaviour limb) — the `tier_source` round-trip **over the
  reachable supplier set**, with `tier_provenance_ref` travelling with it, plus
  the **raise-never-lower** enforcement direction (DR-094). The **carrier limb
  is S0's**. *If the `DERIVED` supplier turns out to have no producing path
  under DR-094, it is removed and this fixture is rescoped — a declared,
  unreachable member is an AC-77 orphan.*
- **`FX-SRV-16`** (owning slice) — **condition marks reach the nodes they
  describe**: the `SKIPPED-BY-BUDGET` mark's affected set stored **once** in
  `condition_mark_node` and projected per node at read time. **S9 is the owning
  slice** per §5.1's reconciliation; S5 owes the read-time projection limb.

**Carriers-only zone — STRUCK (DR-093, DR-094).** This slice formerly carried
one. **The struck text, in full — both halves:**

> *"**Carriers-only zone.** With Q-24 open, the classification ships as a per-row
> contract field whose unset value is the distinct typed `UNCLASSIFIED` state,
> which is treated as correctness at runtime (so no row is ever silently
> skipped) and **reported by the acceptance bundle as an outstanding item**
> (Plan §6.1 OQ-G2). With Q-25 open, `risk_tier` is non-nullable on
> `POST /v1/asks` and carries `tier_source ∈ {ASKER, DEPLOYMENT_POLICY, DERIVED}`
> with its provenance recorded, so whichever way V rules the supplier is
> modelled and printed rather than assumed (Plan §5.3, §6.2 AM-5)."*

**The Q-24 half is struck by DR-093, in part.** *"Whose unset value is the
distinct typed `UNCLASSIFIED` state"* is struck as a standing posture:
`UNCLASSIFIED`-until-filled is replaced by **propose-and-ratify-once**, so the
unset state has a **scheduled end at VG-02** rather than being the design.
**Two clauses survive the strike verbatim and are restated here so the deletion
cannot be read wider than it is**: rows are still *"treated as correctness at
runtime (so no row is ever silently skipped)"* — DR-093's own *"until ratified,
rows behave as correctness"* — and the residue is still *"reported by the
acceptance bundle as an outstanding item"*, because `FX-C52-06` would otherwise
be a disabled blocking gate that looks healthy (§7, LRD-1).

**The Q-25 half is struck by DR-094.** *"So whichever way V rules the supplier is
modelled and printed rather than assumed"* is dead: V has ruled — **the asker
declares, deployment policy may RAISE but never lower** — so the slice builds and
fixtures the enforcement instead of modelling every possibility. **The carrier
clause survives**: `risk_tier` stays non-nullable on `POST /v1/asks` and carries
`tier_source` with `tier_provenance_ref`. **One consequence of the strike is a
new obligation, not a deletion:** with the authority fixed, `DERIVED` may have no
producing path, and a declared member no production caller can reach is an AC-77
orphan and an `FX-ORPH-02` **BLOCKING** entry — so the member is audited and
either kept or removed, and `FX-DB-07` is rescoped to the reachable set.

**Full fixture set for this slice:** `06-test-strategy.md` §12, S9 row.

---

### S10 — Value overlay

**Delivers end to end.** The Pareto trigger, Flows A/B/C, the reversal point,
rejected criteria served, DR-053's two labelled sections.

**Entry criteria.** S9 green. No question gated S10, and none does now.

**Also landing here, from the rulings** (§3.3): the **`valuation` schema's four
tables** — `value_hinge`, `overlay_run`, `reversal_point`, `sensitivity_record`
— with their DDL gates and raw-connection migration fixtures (the `valuation`
half of gap `DM-2`, accepted at DR-099 A-06). These are AC-29's and AC-55's
carriers; without this slice they have no migration.

**Gates it must show firing.**

- **`FX-LG-07`** — **overlay detachment byte-identity** (spec §22.1; DR-017):
  recompute every strength with the value overlay detached and assert
  byte-identity, as an enforced invariant rather than a convention.
- **`FX-LG-11`** — a recommendation with an empty overlay owner **is a defect**
  (V-10).

**Full fixture set for this slice:** `06-test-strategy.md` §12, S10 row.

---

### S11 — Staleness and liveness

**Delivers end to end.** Snapshot, watched triggers, TTL clocks,
propagate-to-affected-nodes, badges, archival and revival.

**Entry criteria.** S10 green. No open question gates S11.

**Gates it must show firing.**

- **`FX-C52-05`** — the **DR-015 STALE badge path** (charter §5.2 row 5): a
  fired revision trigger puts a visible STALE / UNDER-REVIEW badge on a served
  answer, never silently.
- **`FX-LG-12`** — **E4 freshness on every read** (AC-64), and, where a stream
  exists, the mandatory `staleness trigger fired` event with a declared
  consumer, because AC-64 binds *"every read of, **or subscription to**"* (Plan
  §6.5 C6).

**Full fixture set for this slice:** `06-test-strategy.md` §12, S11 row.

---

### S12 — Settlement and scorecards

**Delivers end to end.** Resolution events, read-back verification, the
registered proper score, scorecard cells as ledger functions, the eight routing
guards, the model ledger.

**Entry criteria.** S11 green. No question gated S12, and none does now — Q-20's
ruling (**DR-089**) is **consumed** here, not open.

**The DR-089 settlement watch lands here** (§3.3). Q61 fires **after** a debate
completes, its outcome saved to the execution ledger (DR-027), and **calibration
updates version from the ledger record**; it **never fires for a debate that did
not complete**. The standing watch persists **across** runs, outside any run
lifecycle, as a **third `apps/scheduler` job** beside `job:replay-self-test` and
`job:reaper`. Two obligations ride with it, both checkable: the new job **must
appear on the published G1 entry-point list** (charter A4.5; `FX-ORPH-01`) —
*an unnamed entry point is how orphans hide*, and `apps/scheduler` declares only
two entry points today — and it needs its **own named credential scope**, since
the jobs share a process and must not share a credential (`03` §1.2's H-O-24
residue). **DR-080's second mapping table** — `(Q7 act, Q8 type) → scorecard
task class` — keys this slice's scorecard cells; its contents are V's at VG-02.

**Gates it must show firing.**

- **`FX-S22-03`** — **cold-start exit demonstrably executes** (spec §22.1;
  charter A5.4): one synthetic settled outcome moves a judge weight off its cold
  value, end to end and replayable, and at t=0 the router behaves exactly as it
  would with no scorecard at all.
- **`FX-PT-D5`** — P-D5 green.
- **`FX-ORPH-05`** — **G4 configuration-reachability on the learned path**
  (charter §5.1 G4; DR-026): every branch exercised by a configuration a
  **production caller can actually produce**.
- **`FX-LG-09`** — the eight routing guards; **`FX-LG-10`** — scorecard honesty
  (a scorecard is a pure function of the ledger).

**Full fixture set for this slice:** `06-test-strategy.md` §12, S12 row.

---

### S13 — Cross-run memory

**Delivers end to end.** The four-tier ladder as DB predicates, links, aliases,
pinned pulls, the disclosure block and its three blocking gates, the unlink
control.

**Entry criteria.** S12 green. No question gated S13, and none does now.
*(Note: the `EXACT_QUESTION` tier's comparison of canonical question text **and
caller scope** rests on Q-03, **RULED at DR-070** — asker = the requesting
user/person, with authorization and credentials explicitly out of scope for this
stage. It was already an S0 entry criterion and is a frozen prerequisite here,
not a re-gate — Plan §6.2 AM-12; gap `BUILD-4` closed on exactly that ground.
DR-070's provisional-simplification caveat travels with it: the per-asker memory
partition is one of the surfaces a later principal/session separation would
touch.)*

**Gates it must show firing.**

- **`FX-S22-04`** — **memory inertness and firing** (spec §22.1; M-25): an empty
  store is byte-identical to mechanism-disabled; one injected prior settlement
  produces a visible link, fully replayable; and **no memory sentence without a
  match fact** (Plan §8 S13).
- **`FX-PT-MEM`** — **no transitive closure**: memory links never close
  transitively (AC-69).

**Full fixture set for this slice:** `06-test-strategy.md` §12, S13 row.

---

### S14 — UI data-layer rebuild

**Delivers end to end.** ui §5's W1–W21 in its phase order, starting with the
two items that carry no mockup dependency (W6's freshness invariant, W20's
answer-surface states), then W8/W10 and the honesty surfaces.

**Entry criteria.** S13 green. Both blocking questions are **RULED**:

- **Q-26 = RULED — DR-095.** "Kept component" means **kept SURFACE, rebuilt
  insides** — the pages, canvas, drawers, badges and navigation stay; components
  are **rebuilt inside as the flex rows require**; **each altered component is
  approved at its mockup review** (DR-064). The source-preserving reading, under
  which **W8 and W10 could not be built at all**, is closed — both are buildable.
- **Q-27 = RULED — DR-096.** **No verdict-first presentation flag.** The verdict
  banner **renders unconditionally**; honesty surfaces 1 and 4 always have their
  landing place; **the register carries no such row** — its absence is
  deliberate and recorded, so a later ticket adding one is a defect, not a
  feature.

**Also landing here, from the rulings** (§3.3): **DR-076's UI half** — the
pending-node lifecycle (generating → being judged → scored) **renders live from
the stream's minted events**, and placeholder-arrow connectivity to the parent is
**visible from spawn**, not only after settling. And **DR-069's consequence for
AC-61**: the consumer direction is discharged by the **intra-repo static
type-graph pass** of §3.4, not by a consumer manifest.

**Gates it must show firing.**

- **`FX-LG-13`** — **L5 one transport**: SSR and the browser read the same
  contract through the same front door, and SSR is a caller, never a privileged
  one.
- **`FX-ORPH-04`** — **L6 bidirectional no-orphan** (AC-61) and **W19's
  reachability check fails the build on an orphan** (AC-61, AC-77): no served
  field without a consumer, no consumer without a served field, no emitted event
  without a declared consumer. **Both directions are decided by the intra-repo
  static type-graph pass** (§3.4) now that DR-069 has removed the fence and its
  consumer manifest — the obligation is unchanged and **still fails the build**;
  only the mechanism moved. **DR-076's lifecycle event names are inside this
  check**: an event with no declared consumer is an orphan on the day it lands
  (E1).
- **`FX-WIRE-01`** — no `raw_text` in any tier-2 payload, asserted at the wire.
- **`FX-SRV-10`** — stale work expires **on read without a write**: the read
  derives the failed status while the transition is the scheduled reaper's
  (AC-89 × AC-62; Plan §6.6 UI-13).
- **`FX-PT-D4`** (wire limb) — a **mixed-freshness payload reports freshness per
  item**, and **payload assembly is fuzzed** for aggregate labels that contradict
  item facts (AC-63, AC-34; manifest §12.2). The **serve limb is S5's**; S14 owes
  the wire limb because this is where payload assembly lands.

**Carriers-only zone — STRUCK (DR-096).** This slice formerly carried one:
*"until Q-27 is answered, every honesty surface renders independently of any
presentation flag and no such flag ships."* **DR-096 rules that no such flag
exists at all** — the verdict banner renders unconditionally and the register
carries no such row — so there is nothing left to be *"until"*. The zone's
substance survives as **permanent design**, not as a holding pattern: every
honesty surface renders independently, because there is no flag for it to depend
on.

**Full fixture set for this slice:** `06-test-strategy.md` §12, S14 row.

---

### S15 — Launch bundle

**Delivers end to end.** The acceptance bundle: the never-called list
(**`FX-ORPH-02`**); one firing fixture per charter §5.2 row
(**`FX-C52-01…FX-C52-12`**); **NOT-SHIPPED attestations for the citation
hard-kill gate and coverage-as-gate** (**`FX-DEF-01`**, **`FX-DEF-02`**); the
**replay-ceremony isolation proof** (**`FX-IND-01`**, **`FX-IND-02`**) and
**operator attestation** (**`FX-IND-03`**) — both VR-3 limbs; the
**`deployment_maker_capability` attestation** (AC-38, evidenced by
**`FX-PRV-01a`** and **`FX-HR-H2a`**); **the intra-repo static type-graph pass's
report against the pinned contract version** — AC-61's consumer direction after
DR-069 removed the fence and its manifest (§3.4); the **`UNCLASSIFIED`
battery-row report** (Q-24 / DR-093 — **empty if VG-02's ratification landed**;
non-empty means LRD-1's logic still applies); the **finished zero-call proof**
(**`FX-S22-05`**, built at S0 and completed at S6); the entry-point list G1
walked (**`FX-ORPH-01`**); and the register presented for V's ratification, read
through the bundle's declared read-only `register` edge (**`FX-REG-02`**) and
re-asserted against the ratified `register_version` (**`FX-REG-01`**).

**Entry criteria.**

| # | Criterion | Why it gates S15 |
|---|---|---|
| 1 | S0–S14 green | The bundle is evidence about what was built. |
| 2 | **Q-28 = RULED — DR-097** | An unratified register row is **OUTSIDE charter clause 4's orphan reach**: register rows are **data, not code**, the never-called list stays about **executable units**, and **AC-74's ratify-before-production gate governs the register**. The never-called list's contents are therefore **defined**, and **LRD-2 is discharged** (§7). **Plus V's amendment**, which is new work this slice owes: an **advisory, non-blocking audit reporting any key no code ever reads after full build**, so stale rows are noticed without exemption paperwork (§3.3). |
| 3 | **The register ratified before production (AC-74)** | Not a question — V's act, at **VG-02**. S15 presents the register either way; production waits on the ratification. |

**Gates it must show firing.**

- **`FX-ORPH-02`** — **A4.2 never-called list BLOCKS**: ships with every
  release, empty or itemized; a release with an unexplained entry does not go
  out.
- **`FX-C52-01…FX-C52-12`** plus **`FX-DEF-01`** / **`FX-DEF-02`** — **A4.4
  every fixture present or attested BLOCKS**: every path in charter §5.2 has a
  recorded firing fixture **named by fixture id**; the deferred rows carry a
  NOT-SHIPPED attestation instead.
- **`FX-LG-01b`** + **`FX-IND-01`** / **`FX-IND-02`** / **`FX-IND-03`** — the
  **VR-3 ceremony passes** with all three independence limbs evidenced.
- **`FX-PRV-01a`** + **`FX-HR-H2a`** — charter S4's **multi-maker deployment
  attestation present** (AC-38).
- **`FX-S22-05`** — the complete 13-row zero-call attestation.
- **`FX-ORPH-01`** — the entry-point list G1 walked (A4.5, ADVISORY). **The list
  must now name three `apps/scheduler` jobs**, not two: `job:replay-self-test`,
  `job:reaper` and **DR-089's settlement watch** (§3.3) — an unlisted job is an
  orphan the day it lands.
- **`FX-ORPH-03`** / **`FX-ORPH-06`** — the two **ADVISORY** reviewed audits
  (G5 dead cost with its `measurement_lane` exemption; the dead-check detector),
  wired from S0 and **reviewed with their output in this bundle** (§5.1;
  charter A4.1).
- **The DR-097 advisory register-key audit** — any register key **no code ever
  reads after full build** is reported. **Non-blocking by ruling**: register
  rows are data, so this lane informs, it does not gate (contrast
  `FX-ORPH-02`, which blocks). Its fixture id is minted in `06`'s roster by
  **PRE-03** — **no id is invented here** (§15 of `06` is the roster's home).
- **`FX-REG-02`** — **the acceptance bundle can actually read the register**:
  `tools/acceptance-bundle` reads it **through its declared read-only `register`
  dependency**, not through an API call and not through a separate export
  artifact, and the fixture asserts **the edge is exercised on a real bundle
  run** — a `tools/*` edge no run traverses is an **`FX-ORPH-02`** entry on the
  day it lands (AC-74, AC-77; charter A4.2/A4.4). The edge itself is present
  from **S0**.
- **`FX-REG-01`** — **bootstrap equality re-asserted against the ratified
  `register_version`**: the **five** bootstrap-class keys in
  `register.bootstrap.json` and the ratified rows still agree at release, so the
  pins a run recorded are the pins it used (AC-06). Equality only — **never a
  value** (AC-76).
- **AC-74: the register is ratified before production.** **The ratification act
  itself has no fixture id and is not a fixture** — it is V's, carried in the
  bundle's contents list (`06-test-strategy.md` §13) rather than in §15's
  roster. *What is now fixtured is the bundle's ability to read and re-assert
  the register (`FX-REG-02`, `FX-REG-01`); the ratification remains V's act.*
  Still without an id, and still bundle **artifacts** rather than fixtures: the
  **static type-graph pass's consumer-direction report** for the pinned contract
  version (AC-61 after DR-069 — §3.4, evidenced by `FX-ORPH-01` /
  `FX-ORPH-04`) and the **`UNCLASSIFIED` battery-row report** (Q-24 / DR-093,
  evidenced by `FX-C52-06`'s constructibility).

**Full fixture set for this slice:** `06-test-strategy.md` §12, S15 row, and §13
for the bundle's contents list.

---

## 5. Launch-readiness matrix A — spec §22.1's checkable launch gates

Each gate, the slice that first shows it firing, and where it lands in the
acceptance bundle. Slice assignments are Plan §8's gate columns; where §8 names
no slice, the row says so rather than inventing one.

| Spec §22.1 gate | Authority | First shown firing at | Bundle artifact at S15 |
|---|---|---|---|
| **Replay ceremony** (one independent replay passes exactly, no model in path) — `FX-LG-01b` | DR-034; charter S1, VR-3 | **S1** | Ceremony result (`FX-LG-01b`) + isolation proof (`FX-IND-01`, `FX-IND-02`) + operator attestation (`FX-IND-03`) |
| **Continuous replay self-test** — `FX-LG-01a` | DR-034; charter S1 | **S0** (wired), hardened **S1** | Continuous-test evidence (`FX-LG-01a`); owner `apps/scheduler` · `job:replay-self-test` |
| **Ledger completeness** — `FX-LG-02`, `FX-LED-01a`/`FX-LED-01b` | DR-027; charter S3 | **S0** (`FX-LG-02`, ledger tells the truth), **S1** (`FX-LED-01a`/`01b`, fires and does not fire) | Completeness-gate fixture pair (`FX-LED-01a`, `FX-LED-01b`) |
| **Disagreement flag fires** — `FX-S22-01` | DR-032, DR-047; charter VR-1 | **S4** (both ways) | `FX-S22-01`, fire-both-ways pair |
| **Symmetry fires both ways** — `FX-S22-02` | spec §8, A-12 | **S8** | `FX-S22-02` (`ASYMMETRIC` + `UNINSTRUMENTED` limbs) |
| **Cold-start exit executes** — `FX-S22-03` | DR-046; spec §16.4; charter A5.4 | **S12** | `FX-S22-03`, paired with `FX-PT-D5` |
| **Memory inertness + firing** — `FX-S22-04` | spec §17.6, M-25 | **S13** | `FX-S22-04` (byte-identity + injected-settlement limbs) |
| **Multi-maker critique** — `FX-PRV-01a`/`FX-PRV-01b`/`FX-PRV-02`, `FX-HR-H2a` | **DR-055**; charter S4; AC-38 | **S8** (both halves, fixtured separately) | `deployment_maker_capability` attestation, evidenced by `FX-PRV-01a` + `FX-HR-H2a` |
| **SERVE terminates** — `FX-LG-03`, `FX-SRV-18`, `FX-SRV-19a…f` | **DR-049**; AC-53 | **S0** (`FX-SRV-18`, AC-53 route 1), **S5** (`FX-SRV-19a…f`) | Six terminal fixtures `FX-SRV-19a…FX-SRV-19f` (spec §12.1a S-9) |
| **Envelope terminates** — `FX-C52-07`, `FX-LG-05` | **DR-052** | **S9** | `FX-C52-07` (`ENVELOPE_EXHAUSTED`) |
| **Leverage bound holds** — `FX-C52-09` | **DR-050** | **S3** | `FX-C52-09` (`LEVERAGE_UNRESOLVED`) |
| **Cycle law fires at all three layers** — `FX-C52-10` | **DR-056** | **S2** | `FX-C52-10`, three-layer set |
| **Hard serve blocks fire** — `FX-C52-01` (Q51 locator) · `FX-C52-02` (Q53) · `FX-C52-03` (R9) · `FX-C52-04` (DR-014 cap) · `FX-C52-05` (DR-015 STALE) · `FX-C52-06` (budget-skip) | `CARRIED-DESIGN` (Grok F5); charter §5.2 | **S0** (`FX-C52-03`, `FX-C52-01` via `FX-SRV-01a`/`01b`; Q53 in position via `FX-SRV-17`) · **S5** (`FX-C52-02` firing) · **S8** (`FX-C52-04`) · **S11** (`FX-C52-05`) · **S9** (`FX-C52-06`) | One firing fixture per path, named by id (charter A4.4) |
| **Deferred gates are not shipped dark** — `FX-DEF-01`, `FX-DEF-02` | DR-020 knobs 7–8; DR-047 clause 4 | **S6** (`FX-DEF-01` citation hard-kill not shipped; `FX-DEF-02` coverage-as-gate ships as the diagnostic note only, **no gate slice**) | Two NOT-SHIPPED attestations (`FX-DEF-01`, `FX-DEF-02`) |
| **Stranger coverage** (exhaustive on load-bearing nodes; sampling from asker parameters; rate frozen at run start, ratcheting on the **next** run) — `FX-LG-06`, `FX-LG-05` | DR-018, DR-019, DR-052; AC-50; **DR-079** | **S0** (`FX-LG-06` exhaustive limb, no sampling) · **S5** (`FX-LG-06` sampling limb — constructible under **DR-079**'s load-bearing projection rule) · **S9** (`FX-LG-05` / `FX-LG-06` frozen-rate limb) | `FX-LG-06` coverage + `FX-LG-05` frozen-rate |
| **Overlay detachment** — `FX-LG-07` | DR-017; spec §15.3 | **S10** | `FX-LG-07` byte-identity assertion |
| **Zero-call proof** (each of the 13 MACHINE rows proven to make zero model calls; `·A·` retired; a cache hit never sets a row INACTIVE; `POLICY_BLOCKED` never filed as INACTIVE) — `FX-S22-05` | AC-83; DR-037; spec §5.1 F-1, §1, §3.13, §22.1 | **S0** (first limb — the MACHINE rows S0 executes) · **S6** (complete 13-row proof incl. both activation limbs) | The finished zero-call proof (**BUILD-1**, assigned this round; Plan §8 named no slice) |
| **P-D1…P-D5 green** — the five defect prohibitions as property tests | charter §7 **S2**; manifest §12.2; spec §22 Z-2 | **S3** (`FX-PT-D1`/`D2`/`D3`) · **S4** (`FX-PT-D1`'s no-default-τ limb) · **S5** + **S14** (`FX-PT-D4`, serve and wire limbs) · **S6** (`FX-PT-D3` against real clusters) · **S12** (`FX-PT-D5`) | All five property-test results (**BUILD-2**: `FX-PT-D4` assigned this round; Plan §8 named D1–D3 and D5 only) |

**Standing discipline over the whole matrix.** Spec §22 **Z-1**
`RULED(DR-063)`: *a check is not accepted until it has been made to fail on
purpose*; a gate never observed to fire both ways is an untested claim, not
evidence of health. Spec §22 **Z-2** `RULED(DR-033)`: ground truth is the two
published literature vectors plus property tests of V3's own rules, and **no
conformance test against V2 exists at any level** (AC-80).

### 5.1 Fixture-slice reconciliation: the tie-break, resolved, and the roster ids this document had never placed

**The ambiguity.** `06-test-strategy.md` §12 declares itself *"reconciled
against `07-build-order.md` §5 matrix A on every gate the two documents share"*
and then states the tie-break in one sentence:

> *"where the two disagree, **matrix A's slice assignment is the one to
> repair**."*

**That sentence has two readings and they point opposite ways.** Read as *"the
one to repair"* = **the artifact that gets repaired**, matrix A yields and `06`
§12 governs. Read as *"the one to repair **to**"* = **the target of the
repair**, matrix A governs and `06` §12 yields. `06` §12's own preamble pushes
the second way (*"entry criteria and the launch-readiness matrix are
`07-build-order.md`'s"*), which is precisely why the sentence could not settle
itself. A tie-break rule that needs a tie-break is not a rule, and three known
divergences were left standing on it.

**RESOLVED, here, on the record — `07` §5.1 is the operative tie-break, this
document owns fixture-slice assignment, and `06` §12 is the table repaired when
the two disagree.** The ambiguous sentence is **superseded**, not
re-interpreted: nothing in its wording decides the question, so the decision is
made here on the merits and stated once. Three grounds:

1. **A slice assignment is a scheduling statement, and scheduling is this
   document's subject.** `06` §12 delegates in its own preamble — *"entry
   criteria and the launch-readiness matrix are `07-build-order.md`'s"* — and
   *when* a fixture must first fire is inseparable from the entry criteria and
   predecessor ordering that only §3 and §4 carry. Splitting *when* from
   *why-then* across two documents is what produced the divergences in the first
   place.
2. **The exhaustiveness law is preserved, and it is an obligation rather than an
   authority.** `06` §12 remains **exhaustive against `06` §15's roster** —
   *"every id in the roster appears in at least one row below or in the standing
   row, and no row names an id the roster does not carry"*, and *"an unassigned
   id is a defect, not a deferral."* That law binds `06`'s **table** to carry
   every id; it does not make `06` the author of the slice each id lands in.
   Under this resolution both duties hold at once: **`07` must place every roster
   id** (which §5.1's table below now does) and **`06` must carry every id it
   places**.
3. **The split is clean and neither document is subordinate.** **`06` owns the
   roster** — whether a fixture exists, its id, and what it asserts (§15 and
   §§3–11). **`07` owns the schedule** — slice placement, entry criteria, gate
   force, launch-readiness judgement and the LRDs. Each side is absolute inside
   its own half, which is why this document **mints no fixture id** (§10) and
   `06` records rather than chooses a slice.

**This is single-voiced with the landed `06` §12**, which now states the same
rule from its side: *"exactly one document must own the tie-break, and `07` owns
slice assignment. Where this table and `07` §5.1 ever disagree again, `07` §5.1
is the one to read and this table is the one to repair."* **The two documents
name the same owner.**

> **One directed repair owed to `06`, recorded because this document cannot make
> it.** The **original ambiguous sentence still stands in landed `06` §12**
> (*"where the two disagree, matrix A's slice assignment is the one to repair"*)
> **beside** the new paragraph that assigns ownership to `07`. On its plain
> reading the old sentence says the opposite of the new one, so `06` currently
> contradicts itself and a reader who stops at the preamble gets the wrong owner.
> **PRE-03 owns the fix**: strike that sentence, or rewrite it to point at `07`
> §5.1. Until it is struck, **this section and `06` §12's cross-lane-
> reconciliation paragraph are the operative rule**, and the superseded sentence
> has no force.

**Corollary, so the rule is usable next time:** where matrix A or §4 and `06`
§12 disagree on a **slice**, **`06` is edited**. Where they disagree on **gate
force or entry criteria**, `06` is edited — same owner, same reason. Where they
disagree on a **fixture's existence, its id, or what it asserts**, **`06` governs
absolutely** and this document is edited; `07` mints no fixture id (§10).

**The three known divergences, reconciled.**

| Divergence | State before | Reconciled |
|---|---|---|
| **`FX-SRV-16`** — condition marks reach the nodes they describe | `07` §4 named it **only at S5**; `06` §12 and `06` §9.5 carry it at **S5 / S9** with an explicit S9 row; `09` §7 carries it in S5's `FX-SRV-02…16` range **and** explicitly at S9 | **Two limbs, S9 owning.** The **S9 limb** is the fixture's own subject — an answer-scoped `SKIPPED-BY-BUDGET` mark whose affected set is stored once in `condition_mark_node`, *"which would silently fail `FX-C52-06` if the fixture inspects a node"* — so **S9 is the owning slice** and `FX-C52-06` must inspect a node. The **S5 limb** is the read-time per-node projection (AC-85). Both are now named in §4 at S5 and S9. **This document rules the two-limb assignment and `06` records it** — landed `06` §12's S9 row reads *"owning slice — reconciled per `07` §5.1 (PRE-01)"*, which is the ownership rule above working as intended. `06` §9.5's "S5 / S9" already agrees and needs no repair. |
| **`FX-LG-06`** — stranger coverage, three limbs | `07` and `06` **agree** (S0 exhaustive · S5 sampling · S9 frozen-rate); **`09` §7's slice map names the id in no row at all** | **Not a disagreement at all: `09`'s omission.** `07` and `06` already agree on all three limbs, so the ownership rule above is never invoked — `09` §7's S0, S5 and S9 rows simply now carry the limb each owes, matching the agreed assignment. |
| **`FX-S22-05`** — the zero-call proof, three limbs | `07` and `06` **agree** (S0 first limb · S6 complete 13-row proof · S15 bundle evidence, gap `BUILD-1`'s repair); **`09` §7's slice map names the id in no row at all**, although `09` §1's AC-83 cell does | Same shape, same fix, and again **no ownership question arises**: `07` and `06` agree, and `09` §7's S0, S6 and S15 rows now carry the limbs. **`BUILD-1`'s repair is thereby visible in all three documents**, which is what the gap asked for. |

**The roster ids this document had never placed in a slice.** Owning slice
assignment (ground 3 above) carries a duty with it: **`07` must place every
roster id**, because `06` §12's law — *"an unassigned id is a defect, not a
deferral"* — is empty if the owner of assignment leaves ids unassigned. §4 was
not exhaustive against the roster, and **thirteen roster ids had no slice
placement in §4**: seven appeared **nowhere** in this document (`FX-HR-H1`,
`FX-HR-H3`, `FX-HR-H4`, `FX-LED-03`, `FX-LG-04`, `FX-SRV-06`, `FX-SRV-14`), two
appeared **only in §6's gate table** and in no slice (`FX-ORPH-03`,
`FX-ORPH-06`), and four appeared at **one slice while `06` §12 gives them two**
(`FX-LED-04`, `FX-DB-07`, `FX-HR-H6`, `FX-HR-H7`). All thirteen are now placed,
at **seventeen slice placements**. **None is a disagreement, so none is an
exercise of the tie-break**: `07` and `06` did not conflict here — `07` was
silent — so this document **adopts `06` §12's placement** rather than overriding
it, and the Source column names where each came from. **No id and no slice is
invented here**:

| Fixture | Slice placement(s) now in §4 | Source |
|---|---|---|
| **`FX-HR-H1`** | **S0** — every model call crosses the one provider interface, from the first judge call | `06` §12 S0 |
| **`FX-HR-H3`** | **S0** (purity gate live with `propagation`) · **standing** (lint gate on every build) | `06` §12 S0 + standing row |
| **`FX-HR-H4`** | **S3** — both operators computable on demand | `06` §12 S3 |
| **`FX-LED-03`** | **S1** (`UNCLASSIFIED_ACTION`) · **S8** (`UNINSTRUMENTED`-trigger limb) | `06` §12 S1, S8 |
| **`FX-LG-04`** | **S0** (kernel membership + count, five terminal routes) · **S5** (one abstention kind + several condition marks per answer) | `06` §12 S0, S5 |
| **`FX-SRV-06`** | **S5** — the number slot's three states, rescoped by DR-074 | `06` §12 S5 (`FX-SRV-02…16`), `06` §9.5 |
| **`FX-SRV-14`** | **S5** — machine-injected honesty fields | `06` §12 S5, `06` §9.5 |
| **`FX-LED-04`** | **S0** (two stamps present from the first ledger write) · **S1** (hardened) — `07` had named only S8's *consumption* | `06` §12 S0, S1 |
| **`FX-DB-07`** | **S0** (carrier) — `07` had named only S9's behaviour | `06` §12 S0; `06` §9.4 (*"S0 (carrier) / S9 (behaviour)"*) |
| **`FX-HR-H6`** | **S4** (produced-never-grades limb) — `07` had named only S8's blinding limb | `06` §12 S4 |
| **`FX-HR-H7`** | **S5** (Q53 ahead of conformance) — `07` had named only S7's skeptic certification | `06` §12 S5 |
| **`FX-ORPH-03`** / **`FX-ORPH-06`** | **standing, advisory, from S0 onward**, reviewed at every slice boundary with the blocking pair; **findings carried in the S15 bundle** | `06` §12 standing row; `06` §14 (ADVISORY) |

*A note the reviewer should check rather than take on trust:* PRE-01's ticket
body says **sixteen** unassigned roster fixtures and then enumerates **thirteen
ids** across twelve list entries. The enumeration is what this section
implements, id by id; the count is not restated as a claim anywhere in this
document, because a count that does not reconcile to its own list is exactly the
kind of number AC-76/DR-039 forbid carrying forward. The verified figures are
**13 ids / 17 placements**, and the table above is the whole of it.

---

## 6. Launch-readiness matrix B — charter §5.2's blocking paths and the acceptance items

Charter §5.2 is **BLOCKING(DR-063)**: each row needs one recorded firing fixture
in the acceptance bundle, named by fixture id, and **a missing fixture blocks
the release** (charter A4.4).

| Row | Blocking path | Slice that owes the firing fixture | Note |
|---:|---|---|---|
| 1 | **Q51 locator gate** — `FX-C52-01` | **S0** (`FX-SRV-01a` / `FX-SRV-01b`) | Two fixtures: a `LOOKED_UP` basis with a resolving locator serves as a verdict; a reasoning-only basis is **downgraded**. |
| 2 | **Q53 objection visibility** — `FX-C52-02` | **S5** (firing) · **S0** (position, via `FX-SRV-17`) | |
| 3 | **R9 stranger block** — `FX-C52-03` | **S0** | Fires in gate position, **before** conformance runs. |
| 4 | **DR-014 cap** — `FX-C52-04` | **S8** | Serves, cannot reach the top band, carries the label with its reason, records the lift condition. |
| 5 | **DR-015 STALE** — `FX-C52-05` | **S11** | Never silently. |
| 6 | **Budget-skip marker** — `FX-C52-06` | **S9** | **LRD-1 applies — see §7.** Its resolution mechanism is **ruled (DR-093: propose-and-ratify-once)**; the fixture becomes constructible when **VG-02** ratifies the 71-row split and at least one row is classified enrichment. **The fixture must inspect a node** (`FX-SRV-16`) or an empty affected set passes silently. |
| 7 | **Envelope exhaustion** — `FX-C52-07` | **S9** | Never a silent timeout. |
| 8 | **Serve termination** — `FX-C52-08` | **S5** · **S0** fixtures AC-53's first route (`FX-SRV-18`) | |
| 9 | **Leverage bound** — `FX-C52-09` | **S3** | After the K=1 deepening round (DR-050). |
| 10 | **Cycle law, three layers** — `FX-C52-10` | **S2** | |
| 11 | **Verdict-R9, post-composition** — `FX-C52-11` | **S5** (`FX-SRV-19b` carries the failure terminal) · in S0's published trace | A verdict-R9 failure goes straight to components-only + `DEFECT`, no new loop. |
| 12 | **Degraded-mode projections and replay eviction** — `FX-C52-12` | **S5** (`FX-SRV-02` / `FX-SRV-03` / `FX-SRV-04` / `FX-SRV-05`, `FX-SRV-15`) | Three assertions: frozen conformance record byte-identical; sealed version still replays; current projection reads components-only + `DEFECT`. |

**The five gates and their force** (charter §5.1, §5.3):

| Gate | Obligation / mechanism force | Runs from | Blocks? |
|---|---|---|---|
| **G1 — reachability audit** — `FX-ORPH-01` | CLAUSE(DR-047) / mechanism ADVISORY(DR-063) | **S0** | Reports (A4.1); the published entry-point list is A4.5 |
| **G2 — call-coverage audit** — `FX-ORPH-02` | CLAUSE(DR-047); the **never-called list** is **BLOCKING(DR-063)** | **S0** | **Yes** — A4.2, at every slice boundary and at release |
| **G3 — un-fireable-path test** — `FX-S22-01` (the ratified subject) + `FX-C52-01…12` (the blocking table) | RATIFIED(DR-032) for the disagreement flag; the §5.2 fixture table **BLOCKING(DR-063)**; the generalization ADVISORY | every slice | **Yes**, for the §5.2 table (A4.4) |
| **G4 — configuration-reachability** — `FX-ORPH-05` | RATIFIED(DR-026) for the learned path; ADVISORY as generalized | **S12** (learned path), **S6** (register-gated shadow mode, DR-085), **S5** (**DR-081**'s `OD-11` layer-2 flip row — *both states testable before the flip, nothing ships dark*), **S14** | Reports (A4.1) |
| **G5 — dead-cost indictment** — `FX-ORPH-03`, `FX-ORPH-06` | CLAUSE(DR-047); exemption class `measurement_lane` ADVISORY(DR-063) | **S0** onward | Advisory; feeds A4.2's list |

**A4.3** `RATIFIED(DR-063 · VR-4)`: orphan exemptions are **configuration-class
only**, granted by **V alone**, and **dated**. An undated or non-V exemption is
not an exemption.

**The register-read fixtures the acceptance items depend on.** A4.2 and A4.4 are
assembled by `tools/acceptance-bundle`, which must be able to **read the
register** and to show that the pins a run recorded are the pins it used:
**`FX-REG-02`** asserts the bundle's declared read-only `register` edge is
**exercised on a real run** (its edge is present from **S0** so `FX-ORPH-01`'s
walk sees it, and the fixture lands at **S15**), and **`FX-REG-01`** asserts
**bootstrap equality** — `register.bootstrap.json` ≡ the ratified rows, or the
build fails — at **S0** and again at **S15**. Neither asserts a value (AC-76);
the values arrive at **GPG-3** (§3.1) and are V's at DR-023.

---

## 7. The two explicit launch-readiness dependencies

Plan §7 row 8 names these two by name, and Plan §6.1 OQ-G2 requires the first to
be *"recorded as an explicit launch-readiness dependency in `07-build-order.md`,
not left as a discovered surprise."* Both are recorded here.

### LRD-1 — Charter §5.2 row 6's fixture is unconstructible until at least one battery row is classified enrichment · **MECHANISM RULED (DR-093) · CONSTRUCTIBLE AT VG-02**

**The dependency.** Charter §5.2 row 6 requires a fixture demonstrating that *an
enrichment row skipped under the envelope serves with a visible
SKIPPED-BY-BUDGET mark, and a protected-core row refuses the skip*. The
enrichment-skip half needs a row that **is** enrichment. Plan §6.1 OQ-G2 records
that the per-row correctness/enrichment classification was never supplied by the
pack, and states the consequence in terms: **until at least one row is
classified enrichment, the envelope's enrichment-skip terminal cannot fire and
charter §5.2 row 6's fixture is unconstructible — a BLOCKING row.**

**What it blocks.** S9's charter §5.2 row 6 gate, and through A4.4 the release
itself (a missing fixture blocks; charter A4.4 is **BLOCKING(DR-063)**).

**What resolves it — ruled at DR-093.** The classification is produced by
**architecture proposing the full 71-row split and V ratifying once**, in a
single sitting alongside the register (the wholesale pattern of DR-061/DR-062).
DR-093 records the clarification that removes the usual objection to a
human-in-the-loop classification: **this is one-time design-time config, fully
automatic at runtime, with no human in any user's loop.** The proposal is
ticket **PRE-06**'s; the ratification is ticket **VG-02**'s, and DR-093 states
the consequence in its own conditions column: *"LRD-1 (charter §5.2 row 6
fixture) becomes constructible at ratification."*

**The state until then, unchanged in force.** Rows behave as **correctness and
are never skipped**, and the acceptance bundle **reports any residual
`UNCLASSIFIED` rows as an outstanding item** — so the gap stays visible rather
than absorbed. **A silent `CORRECTNESS` default would have disabled a blocking
gate while looking healthy** (Plan §6.1 OQ-G2), which is why the loud shape
survives the ruling rather than being retired by it.

**Recorded so it is checkable.** S15's bundle carries the **`UNCLASSIFIED`
battery-row report** (Plan §8 S15). **If VG-02's ratification has landed the
report should be empty**; if it is non-empty *and* no row is classified
enrichment, charter §5.2 row 6 has no fixture and A4.4 blocks — the same test
as before, now with a scheduled resolution rather than an open question.

### LRD-2 — Charter §9 item 7 must be answered before S15 or the BLOCKING never-called list's contents are undefined · **DISCHARGED (DR-097)**

**The dependency.** `packages/register` ships **a skeleton of keys with no
values** (Plan §4.6, §7 doc 6; AC-76 forbids inventing values). Charter clause 4
forbids orphaned units, and charter §9 item 7 records the standing contradiction:
is class (3) — *a register row with no executable unit* — inside clause 4's
reach? **Under one reading every unfilled key was an entry on the BLOCKING
never-called list at S15; under the other, none was** (Plan §6.9 item 7).

**What it blocked.** S15 outright. Plan §8 stated it as S15's inline entry
criterion: *until it is answered, whether every unfilled register key is an entry
on the BLOCKING never-called list is undefined.* A4.2 blocks a release with an
unexplained entry, so an undefined list membership was an undefined release gate.

**What resolved it — DR-097.** V ruled class (3) **OUTSIDE** clause 4's reach:
**register rows are data, not code**; the never-called list stays about
**executable units**; and **AC-74's ratify-before-production gate governs the
register**. The S15 never-called list is therefore **not** non-empty by
construction, and **no unratified key needs a dated V exemption** (charter A4.3
keeps its scope: configuration-class exemptions for *code* behind a flag no
production configuration can set). Charter §9 contradiction 7 is resolved and
**LRD-2 is discharged**.

**V's amendment, which is new work rather than a residue.** *An advisory
(non-blocking) audit reports any key no code ever reads after full build*, so
stale rows are noticed without exemption paperwork. That lane is S15's to build
(§3.3), it is **advisory by ruling** — an unread key is a report, never a
release block — and its fixture id is minted in `06`'s roster by PRE-03.

**Recorded so it is checkable.** S15's entry-criteria table (§4 above) carries
DR-097 as criterion 2 and the register's ratification (AC-74, VG-02) as
criterion 3; the bundle presents the register for V's ratification in the same
slice and now also carries the advisory unread-key report.

---

## 8. Deferred-gate activation conditions

Charter §5.2's deferred table is **NOT SHIPPED until fireable, never
shipped-dark**. Plan §6.7 corrects an earlier reading and states that these do
**not** ship as register-gated branches. The activation condition for each is
recorded here so a later slice can tell when the gate becomes owed.

| Deferred gate | Status at launch | Activation condition | Where it becomes owed | Authority |
|---|---|---|---|---|
| **Citation hard-kill** — `FX-DEF-01` | **Does not ship — confirmed by DR-088.** The **eight typed citation failure routes** ship (spec §7.3 E-8, DR-020 knob 13, "from day one"), their **closed membership proposed by architecture and ratified by V** (**DR-084**, at VG-02, loud failure with no generic "other"); the hard-kill **gate** does not ship, and **must not exist as code that cannot fire**. A **NOT-SHIPPED attestation** rides in the acceptance bundle instead (charter A4.4, BLOCKING). | **V3's character-level quote matcher ships and validates.** DR-088: the gate is **written when the matcher validates, never shipped inert**. | A slice after the matcher validates; **not** S6, which ships the routes and the attestation. | RATIFIED(DR-020 knob 7); **DR-088**; **DR-084** (route membership); charter §5.2 deferred table |
| **Coverage-as-gate** — `FX-DEF-02` | **Ships as the diagnostic `UNCOVERED-SCOPE` note only.** The **gate** does not ship. Spec **D-7** additionally makes `coverage_passed` a **forbidden claim** until outcome data exists, so a dormant coverage gate would be a claim-capable branch that cannot legitimately fire. | **Outcome data sets the threshold** — and not before. | A slice after the threshold is set; spec **D-15** (Q27's label question) becomes live only at coverage-gate activation. | RATIFIED(DR-020 knob 8); spec D-7, D-15 |

**Why a register-gated branch is not the shape here.** Plan §6.7 records the
argument: a register-gated branch would make charter A4.4 unsatisfiable — **no
firing fixture is possible** (the quote matcher has not validated) and **the
attestation would be false** (the code is in the tree).

**This disposition is no longer pending V — it is RULED, and it stands
(DR-088).** **The struck paragraph, in full:**

> *"**This disposition is itself pending V.** The underlying "auto-activating vs
> not shipped" conflict is charter §9 item 6, carried as **Q-19** and blocking
> from S6. If V rules that auto-activation does not count as shipped-dark, Plan
> §6.7's D-4/D-5 row and S6 both change, and the acceptance bundle carries **a
> firing fixture rather than a NOT-SHIPPED attestation** (Plan §6.9 item 6).
> Nothing in this section rules that question."*

**Struck by DR-088, and struck in the direction that changes nothing.** V ruled
that **auto-activation counts as shipped dark — the charter's not-shipped rule
wins**; *"auto-activates"* describes the **activation event only**, and the
citation hard-kill gate is **written when the quote matcher validates, never
shipped inert**. The struck paragraph's conditional therefore **never fires**:
Plan §6.7's D-4/D-5 row does **not** change, S6 does **not** change, and the
acceptance bundle carries the **NOT-SHIPPED attestation, not a firing fixture**.
Only the paragraph's final sentence survives, and it survives as fact rather than
as a caveat — **nothing in this section rules anything; DR-088 did.**

**Other deferred items with named landing places** (Plan §6.7, confirmation
only — no design element depends on the deferred value or shape): verdict and
confidence-band numeric thresholds (spec D-1) as register rows read at serve
time (AC-66, AC-74); the 30 UI presentation cells (spec D-2, manifest O-13) at
build-phase mockup review (DR-064); the whole flag/configuration register (spec
D-3) as `packages/register` keys without values (AC-76); phased Stage-11 rollout
(spec D-6) with recording limbs day one, ingestion in WAIT, capability cells
`basis: NONE`; and every numeric constant (manifest O-1, O-2) as a DR-023
register row, never a source literal (AC-74, AC-75).

---

## 9. Gaps this lane raised, and their round-1 dispositions

Gap ids are **globally unique across the C4 set** (prefix convention fixed by
the C4 round-1 merge verdict); `09-traceability.md`'s consolidated gap index is
the single register of them. This table is this lane's four rows and what
happened to each. The two REAL rows are **repaired in this document this round**;
the two MISREAD rows **close with their adjudicating citation and are not
preserved as open architecture questions**.

| Gap id | Gap as raised | Verdict | Disposition in this round |
|---|---|---|---|
| **BUILD-1** *(was `07` §9 G-1)* | Spec §22.1's **zero-call proof** gate (each MACHINE row proven to make zero model calls) is named in Plan §1's constraint base but **no slice in Plan §8 lists it as a gate it must show firing**. | **REAL** — spec §22.1 / DR-037 make it a launch gate; Plan §8 assigns no owning slice. | **REPAIRED.** Assigned to **S0** (first limb) and **S6** (complete 13-row proof), with **S15** carrying the finished proof as bundle evidence, under lane 6's existing fixture id **`FX-S22-05`**. Matrix A row updated. |
| **BUILD-2** *(was `07` §9 G-2)* | **P-D4** is assigned to no slice; Plan §8 names P-D1/D2/D3 at S3 and P-D5 at S12, while charter §7 **S2** and manifest §12.2 require **P-D1 … P-D5**. | **REAL** — charter §7 S2 and manifest §12.2 require all five. | **REPAIRED.** **`FX-PT-D4`** assigned to **S5** (serve limb) and **S14** (wire limb), matching lane 6's own slice column. Matrix A gains a P-D1…P-D5 row. |
| **BUILD-3** *(was `07` §9 G-3)* | The Opus plan-lens's residual risk **R-6** says *"12 blocking a slice at or before S6"*; counting Plan §6.8's rows gives **19**. | **MISREAD** — this is a **review-artifact arithmetic error, not a Plan gap**; Plan §6.8's enumerated rows and the 28-question index are authoritative. | **CLOSED** with that citation. §3.2's entry-criteria index (derived from §6.8's rows) stands unchanged; the review figure is not carried into any C4 artifact. |
| **BUILD-4** *(was `07` §9 G-4)* | Plan §6.8's S13 row lists no question although the `EXACT_QUESTION` tier's caller-scope comparison rests on **Q-03**. | **MISREAD** — Q-03 is a **hard S0 entry criterion** and S13 follows S0; once answered, the identity definition remains a frozen prerequisite **without being re-gated at S13**. | **CLOSED** with that citation. S13's entry-criteria note is kept as a pointer only, not as a gap. *Q-03 is now **RULED at DR-070**, so the prerequisite is not merely frozen but supplied.* |

**Post-ruling state of this lane's four rows.** `BUILD-1` and `BUILD-2`'s
repairs stand and are now **visible in all three documents** — `06` §12, this
document's §5 and §4, and `09` §7 — which §5.1's reconciliation completed;
before it, `09`'s slice map named neither `FX-S22-05` nor `FX-LG-06`, so
`BUILD-1`'s repair was invisible in the traceability index that exists to make
such things visible. `BUILD-3` and `BUILD-4` remain **MISREAD and closed**; no
ruling reopens either. **This lane raised no new gap in the fold-in**: the two
things it found — the tie-break's ambiguity and this document's thirteen
unplaced roster ids — are **repaired in place at §5.1** rather than carried as
gap ids, because both were `07`-internal defects with an existing owner, and
minting a gap id for a defect you are fixing in the same pass is how a register
of gaps stops being a register of open things.

---

## 10. What this document deliberately does not contain

- **No time estimates, in any unit** (§7 row 8's out-of-scope column). Slice
  order is dependency order.
- **No answer to any question, and no ruling.** All 28 are ruled in the
  decisions ledger (DR-068…DR-097); this document **cites** those rulings and
  builds entry criteria from them. Where a behaviour still waits on a **value**,
  the row says so and points at **VG-02** — it does not supply one.
- **No new gate, terminal, mark or enum.** Every gate in §5 and §6 is quoted
  from spec §22.1 or charter §5.2 with its authority; spec §12.3's table is the
  only place a typed state may be minted (AC-65, S-13) — including the
  DR-084 citation routes that surface to a reader, and the A-01 five-route
  correction PRE-08 applies there.
- **No fixture id.** `06-test-strategy.md` §15's roster is the only place a
  fixture id is minted; §5.1 places existing ids into slices and mints none —
  including DR-097's advisory audit lane, whose id is PRE-03's to mint.
- **No invented constant.** `max_recompose = 2` (AC-53) and the K=1 deepening
  bound (DR-050) are the pack's; every other constant is a register key whose
  value is V's at DR-023 (AC-74, AC-76). **No count is asserted that its own
  list does not support** (§5.1's closing note).

---

*End of `07-build-order.md` — ARCH-V3-R1 / C4 lane 7, authored 2026-08-05 from
Plan.md rev 3 §8 and §6; folded to post-ruling state 2026-08-06 under PROG-V3-R1
ticket PRE-01. The architecture is **accepted** — VS-1 ratified (DR-098),
A-01…A-13 accepted (DR-099), ARCHITECTURE SATISFIED emitted (DR-100). All 28
questions are ruled (DR-068…DR-097). **The stack is ruled and all four pre-S0
gates are discharged** — `RULED — DR-117` / `DR-118` at the DR-116 human sitting;
GPG-3's pins resolve and are recorded at S00 under **DR-104**; GPG-4's
identifiers at **DR-104(3)**. What remains open is not architecture but **the
values V supplies at VG-02 (the register and the three ratification packages)**,
and the **explicit V re-prompt before Codex launches on S00** (DR-117).*
