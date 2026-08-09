> **RATIFIED — `DR-109`, 2026-08-07 (VG-02 sitting).** V ruled: *"**THE EIGHT
> CITATION ROUTES ARE RATIFIED WHOLESALE, INCLUDING THE LADDER ORDER** (currency
> before exactness): NO_SOURCE_FOUND · CITATION_UNBACKED · SOURCE_UNREACHABLE ·
> PREVIEW_DEPTH_ONLY · SOURCE_SUPERSEDED · EXACT_COMPARE_UNAVAILABLE ·
> SPAN_NOT_FOUND · SPAN_MISMATCH, with the truth-table closure proof and
> five-reason R6."* This document is **ruled architecture**, not a proposal. It
> was authored under **DR-084** (*architecture proposes the closed enum and V
> ratifies*) and the proposal banner is discharged by DR-109.
>
> **What the wholesale yes covers:** the **eight names**, the **eight-route
> count**, the **rung ORDER** (§3 — ratified as a load-bearing property, SP-6),
> the **closure proof** (§5), and **R6's five-reason split** (§4 · R6 — the
> five-member reason domain of rev 3, so SP-4's merge is ruled and rider **R6-a**
> is **not** taken).
>
> **`SP-1` is ruled with it:** *"VERIFIED is **NOT** a ninth member — success
> lives in the separate two-member outcome column; the enum stays **exactly
> eight**."* The seat's position is upheld and the count DR-020 knob 7 fixes is
> preserved.
>
> **STILL NOT MINTED — `DR-110(1)`, same day.** §7's §12.3 amendment is
> **ratified as a draft and not applied**: *"**Marks 23–24 NOT YET minted** — the
> ratified routes ship, but `UNVERIFIED-CITATION` and `CITATION-RECHECK-FAILED`
> may not surface to readers until V authorizes the §12.3 application; their
> serve surfaces stay **dormant-by-absence** (the draft stands ready)."* **§12.3
> remains V's to apply** under S-13; nothing in §7 has landed in the founding
> spec, and §7.4's consequential count edits (Home 2: 22 → 24) are **not**
> triggered yet. Status folded by ticket **PRE-14**, 2026-08-07.

# The eight typed citation-failure routes — the DR-084 ratification package

Mission **PROG-V3-R1** · ticket **PRE-07** (`t_ddb54539`) · 2026-08-06 · seat:
Claude worker (Opus 5), authorized under **DR-102** epoch 1, wave 2.

**Authority.** **DR-084** (Q-16) — the closed enum, *loud failure, no generic
"other"*, reader-facing members placed in spec §12.3 by amendment ·
**DR-088** (Q-19) — the hard-kill **gate** is **not** shipped and is **written**
only when the quote matcher validates · **DR-020 knob 7** — the eight routes ship
**from day one** · **DR-051 / S-11…S-13** — closed-enum discipline, no residue,
single minting place.

**Source material.** `requirements-spec.md` **§7.3** (E-7, E-8, E-9), §7.1–§7.2,
§7.5 (E-13), **§3.4 Q16**, §3.8 Q40, §3.10 Q51, §8.1 (A-2, A-3), **§12.3**
(S-11…S-14), §12.1c (S-9e); `02-data-model.md` **§11A.1** (`citation_route_record`
and its siblings) and §13 (the closed-enum inventory); `quality-charter.md` §5.2;
the founding and ARCH-V3-R1 decisions ledgers.

**Reviewers on handoff:** **Codex** + **Grok** (DR-101's maker-diversity diamond
for a Claude-authored ticket).

> **REV 2 — 2026-08-06, DR-101 fix cycle round 1.** Codex returned **CHANGES
> REQUESTED** with four findings; Grok returned **APPROVED** after six adversarial
> traces, recording soft residual **SR-1**. **All four findings are repaired, none
> is argued away** — and SR-1 and Codex finding 4 are the *same seam* found by two
> independent lenses, which is why the consequence was downgraded rather than
> defended. **The eight-route count is unchanged.** What changed: rung 1 is
> restated over three explicit predicates (§3.1); rung 2 is now **attempt-scoped**
> and reads an already-obliged ledger action (§3.2); R6's recorded-reason domain is
> total over the ruled execution vocabulary by **reference** (§4 · R6); and R5, R7
> and R8 now claim **only** consequences the pack already rules, with the
> behavioural extensions exposed as **named riders for V** (§9.1) instead of
> asserted. The `CITATION-WITHDRAWN` draft was renamed and rewritten for the same
> reason (§7.2). A rev-1 → rev-2 change log is at **§9.2**.

> **REV 3 — 2026-08-06, DR-101 fix cycle round 2.** Grok approved rev 2; Codex
> narrowed to **two residual escapes on the two seams rev 2 had repaired**, and
> **both are valid**.
>
> **(i)** Rev 2 called the attempt's access depth a **derivation** from the ledger
> entry. It is not one: `02-data-model.md` **§6.1's declared `ledger_entry` columns
> carry no typed action-result payload** — action kind, actor, the two AC-46
> stamps, typed outcome, timings, fingerprints, register refs, digest text — so an
> **`OK`** outcome does not select `OPENED_FULL` from `PREVIEW_ONLY`. Rung 2 is
> therefore restated over a value that is **recorded, not derived** (**§3.2**); the
> three cases where **ruled** fields already fix it are named exactly; and the one
> case they do not — an **`OK` reopen at a changed depth** — is filed as **carrier
> rider CARRIER-1** (§9.1) as a **placement** repair: **E-7's obligation is
> per-*opening*, and §11A.1's placement of it on `source_record` is per-*source*.**
>
> **(ii)** R6's reason split gains a **fifth member, `COMPARE_RESULT_MISSING`** —
> an execution row with outcome `OK` whose comparison result did not persist. The
> impossibility argument was **considered and rejected** as unsupported (§4 · R6).
>
> **No route was added and none removed: the enum is still eight**, the names are
> unchanged, and every other section is frozen. Rev-3 change log at **§9.2**.

> **REV 4 — 2026-08-06, DR-101 fix cycle round 3 (the cap).** Grok approved rev 3;
> Codex raised **two final findings, both applied as directed**. **(i)** Rev 3's
> `attempt_access_depth NOT NULL` was **unpopulatable for R1 and R2** — those
> routes fire at **rung 1, where no opening ever occurs**, so no honest E-7 value
> exists and `ACCESS_BLOCKED` would falsely claim a blocked opening. The column is
> now **scoped**: `NULL` **exactly** on the two rung-1 terminals, **required on
> every row that descends to rung 2**, bound by **four `CHECK`s** — including one
> tying depth-presence to an **opening-kind action** (`ledger_entry.action_kind`,
> a declared column) — and **rung 1 is restated as deciding before any depth is
> read** (§3.1, §3.2, §6). **The no-silent-inheritance property is preserved for
> every attempt that opens.** **(ii)** Two stale statements swept: **SP-8 is
> withdrawn as RESOLVED** — `02-data-model.md` §13 now carries the `access depth`
> row and §11A.1 names the column, re-read and confirmed, so only **CARRIER-1's
> placement limb** remains — and **R6's merge prose now reads ①–⑤**, covering
> `COMPARE_RESULT_MISSING` under the same merge argument. **Still eight routes.**
> Rev-4 change log at **§9.2**.

---

## 0. How to read this, knowing nothing

When the engine says *"this is true, and here is where I got it"*, it is making a
**citation**: it points at a specific source, at a specific address inside that
source, and often at a specific sentence it claims is written there.

Citations fail. The link rots. The paywall closes. The engine saw a search-result
snippet and never opened the page. The sentence it quotes is *almost* what the
page says. The page has been edited since. Or — worst — there is no page at all
and the citation was written by a model that had never read anything.

**Every one of those is a different failure, and they deserve different answers.**
A dead link is not a misquote. A misquote is not a fabrication. Serving all of
them as one grey *"source unavailable"* is the exact behaviour this pack exists to
eliminate, because a reader cannot tell an honest gap from a lie.

So **V3 types them**. A citation attempt that does not end in a verified,
character-exact reading of a source it actually opened takes **exactly one of
eight named routes**, and the route is **written down and shown**. There is no
ninth route, and — this is the load-bearing part — **there is no "other"**. A
failure nobody anticipated cannot quietly become an unlabelled ninth kind, because
the eight are derived as a **complete case-split over facts the engine is already
required to record**, and the case-split's residue has a name of its own.

**This document proposes those eight names and proves that they cover everything.**
It decides nothing about *when the engine kills a claim* for citing badly — that
gate is deferred by **DR-088** and is not written yet.

---

## 1. What this document is, and what it is not

**What it is.** The proposal **DR-084** ordered: the closed membership of the
citation-failure enum that **DR-020 knob 7** and **spec §7.3 E-8** require *"from
day one"*, carried by `evidence.citation_route_record` (`02-data-model.md` §11A.1),
living in `packages/kernel` as a **closed evidence-subsystem enum — not a
condition mark** (`02-data-model.md` §13). For each member: **name · triggering
condition · what is recorded · what serves · loud-failure semantics**. Plus the
closure proof (§5) and the spec §12.3 amendment draft (§7).

**What it is not.**

- **It is not a mint.** Two members surface to a reader as typed states. §7 drafts
  their §12.3 rows **as text for V to paste**. Applying it is V's act, under S-13.
  Until V applies it, those two marks **do not exist**, and the enum's eight
  members remain internal evidence-subsystem states.
- **It is not the hard-kill gate.** Every serve consequence named in §4 is one the
  pack **already rules** for that failure mode. The **additional global kill** that
  DR-020 knob 7 defers is **not proposed, not designed and not written here**
  (§8) — writing it would be the *"code that cannot fire"* charter §5.2 forbids and
  **DR-088** re-confirmed.
- **It invents no behaviour.** Every route's consequence is quoted or cited to a
  ruled requirement. Where the derivation had to reach past the pack's own words,
  the reach is **flagged in §9**, not settled here.
- **It invents no numbers** (AC-76 · DR-039). The only count minted is **eight**,
  which is DR-020 knob 7's own count.
- **It writes no code and touches no other file.** The carrier fields §6 needs are
  a **proposal to `02-data-model.md` §11A.1**, to be folded in by a separate
  ticket after ratification.

---

## 2. The domain — what a citation attempt is, and what counts as a failure

An enum cannot be closed until the set it partitions is stated. Three definitions
do that work, and **§5's proof depends on all three**.

**D1 — the unit.** A **citation attempt** is one act of binding **one served or
load-bearing assertion** to **one source**, optionally at **one span** inside it.
`02-data-model.md` §11A.1 already fixes the granularity: *"one row per citation
attempt carrying its typed route."* The battery rows that perform attempts are the
pack's own: **Q16** (extract spans, archive locator/version/time, exact-compare
where available), **Q40** (reopen the locators, exact-check the preserved spans,
rerun the sums) and **Q51** (the provenance join and locator gate at serve).

**D2 — success.** An attempt **succeeds** when it ends in a **verified** binding:
the source was **opened at full depth**, at the **archived locator**, at the
**version the citation names**, and the cited span was compared
**character-for-character** and matched. This is **E-8's own success condition**
(*"spans are extracted with locator, version and retrieval time archived, and
character-level exact comparison runs wherever the source supports it"*) read
together with **E-7** (*"a preview-only source may never supply a number or a
quote"*) and **Q40**'s typed `verified`.

**D3 — failure.** A **citation failure** is any citation attempt that does not
succeed under **D2**. **The eight routes partition exactly this set.**

**Three consequences of D3, stated so they are not re-litigated.**

1. **`VERIFIED` is not a member.** E-8 says *"citation **failures** take the eight
   typed routes"*. Adding a success member would make the enum nine. The attempt's
   outcome is therefore carried by a **two-member outcome column** on the same row
   (`VERIFIED` / `ROUTED`), with `route` non-null **iff** `ROUTED` (§6). A
   ninth-member reading is offered to V as a scrutiny point (§9 · SP-1) and **not
   adopted here**.
2. **"Not verified" is not "invalid".** Only **three of the eight ever block or
   refuse** — R2 (Q51's block), R4's breach limb (refused at write) and R5's
   E-13 fast-moving limb (§4 roll-up). The other five **serve, labelled**. The
   enum types the **shortfall**, and the shortfall is what the reader is owed.
3. **A claim with no citation attempt at all is out of domain, and has a home.**
   A ledger unknown that was never looked for wears abstention kind 1 (*not
   searched*); a claim resting on reasoning alone is Q51's **reasoning-only
   downgrade**; neither writes a `citation_route_record` row, because no source was
   ever bound. §5.4 discharges the boundary explicitly.

---

## 3. The derivation — a six-rung ladder over facts the pack already records

The eight are not a brainstormed list. They are the **leaves of a decision ladder**
whose every rung tests **a field some ruled requirement already obliges the engine
to write**. That is what makes the enum closed rather than merely long.

**First-failure semantics.** The rungs are evaluated in a **fixed total order**.
The route is the **first** rung the attempt fails. A later rung is unreachable once
an earlier one has fired — which is where §5's disjointness comes from, and it is
the same ordering device **A-4** uses for `stance_at_action` (*"the side an item was
on at the moment each check ran"*): **when you test matters, so the order is
written down rather than left to the implementation.**

| Rung | The recorded fact it tests | Required by | Branches |
|---:|---|---|---|
| **1** | What does the citation resolve to in the evidence store? **Three predicates — §3.1** | E-8 (locator/version/time archived) · AC-44 · S-19 | **R1** · **R2** · descend, per §3.1's table |
| **2** | The **three-valued access depth in force for *this attempt*** — §3.2 | **E-7** (*required record*, exactly three values) · **A-2** (*"locator resolution, access depth"* and *"rechecks (Q40)"* are named action kinds) · AC-44 | `ACCESS_BLOCKED` → **R3** · `PREVIEW_ONLY` → **R4** · `OPENED_FULL` → rung 3 |
| **3** | Does the artifact read now match the archived `{version, retrieval_time}`, inside the run's `as_of` freshness envelope? | E-8 · **E-13** (age against `as_of`, **never cached**) · `OD-M-11` | no → **R5** · yes → rung 4 |
| **4** | Does a character-level comparison **result** exist for this span? | **E-8** (*"wherever the source supports it"*) · S-19 (*everything executed is recorded*) | no → **R6** · yes → rung 5 |
| **5** | Does the comparison say the span is **present**? | **Q40** typed `not-found` | no → **R7** · yes → rung 6 |
| **6** | Does the comparison say the span matches **exactly**? | **Q40** typed `deviates` · **AC-92** (non-truncated excerpts byte-identical; truncation marked at word boundaries) | no → **R8** · yes → **VERIFIED** (D2; not a member) |

**Why rung 3 sits before rungs 4–6, and not after.** If the source has been edited
since retrieval, a character comparison against the *current* artifact fails — and
without rung 3 that failure would be recorded as **R8 `SPAN_MISMATCH`**, which is
an accusation that *the engine misquoted*. Rung 3 makes the engine check whether
**the world moved** before it accuses **itself**. The two are different findings
and the pack keeps such pairs apart on principle (A-3's `blocked_not_lazy` served
*beside* the asymmetry, never inside it).

**Rungs 4–6 are Q40's own vocabulary, completed.** Q40 emits `verified` /
`deviates` / `not-found` **per checked item** — three outcomes that presuppose a
check ran. Rung 4 is the case Q40's vocabulary does not name: **no check ran at
all**. Naming it is the whole anti-theater point; without it, *"exact compare where
available"* reads as a silent pass on every source where it was not available.

### 3.1 Rung 1, in predicates — the total case-split

*Rev 2, repairing Codex finding 1. Rev 1 stated rung 1 as three prose cases whose
leaf triggers left **one constructible combination homeless**: an **incomplete**
source record **plus** a covering absence row — R1's trigger rejected it because a
record existed, R2's trigger rejected it because an absence row existed. The
combination is real, and the repair is to state the rung over predicates and cover
all of them.*

Three predicates, each decidable from records the pack already obliges:

| | Predicate | Obliged by |
|---|---|---|
| **P_ref** | the citation **names a source** — it has a referent at all | Q51's provenance join (*kind, producer, locator*) |
| **P_rec** | the store carries a **complete retrieval record** for that referent: a `source_record` **and** its archived `{locator, version, retrieval_time}` | **E-8** (*"spans are extracted with locator, version and retrieval time archived"*) |
| **P_abs** | a typed **`absence_row` covers this claim's support** | **E-9** |

| P_ref | P_rec | P_abs | Route | Why |
|:---:|:---:|:---:|---|---|
| **F** | *n/a* | **T** | **R1** | nothing is cited, and the honest negative is on the record — *absence is a servable finding* |
| **F** | *n/a* | **F** | **R2** | nothing is cited **and** no honest negative either |
| **T** | **T** | T **or** F | **descend** | the citation resolves to a complete record; **P_abs is not consulted** |
| **T** | **F** | T **or** F | **R2** | the record does not back what **is** cited |

**Rung 1 is decided from the record alone, before any access depth is read.** All
three predicates are facts about **what the evidence store carries**; none of them
consults an opening. So the two rung-1 terminals — **R1** and **R2** — are reached
**without a depth ever being tested**, and an attempt that stops here **has no
access depth to record** (§3.2, §6). Depth enters the ladder only at rung 2, and
only for attempts that descend to it.

**The rule that closes the hole: `P_abs` is consulted only when `P_ref` is false.**
Once a citation names a source, an absence row elsewhere in the store is a
**separate ledger fact about a different query** and cannot attach to this attempt.
Grok's traces reached the same cells independently — **ADV-3 Setup A** (*"the
absence for S₁ is irrelevant to this resolution"*) and **ADV-5**'s hostile variant
(*"residual absence is a separate ledger fact, not a second route on the same
attempt"*) — but rev 1's **leaf trigger text** contradicted its own closure table,
and the leaf text is what an implementer reads. Rev 2 makes them one statement.

**And the substantive reading is the honest one.** An incomplete record for a source
the citation names is **R2**, not R1: the run evidently *did* retrieve something, so
*"we searched and found nothing"* would be false. What is true is that **the record
does not back the citation** — R2's positive definition, unchanged.

### 3.2 Rung 2 is attempt-scoped, and reads an action the ledger already owes

*Rev 2, repairing Codex finding 2. Rev 1 tested E-7's **source-scoped harvest**
access depth, read through `source_ref`. A source `OPENED_FULL` at harvest that
404s on Q40's reopen therefore **passed rung 2 on a historical value** and fell
through to rung 4, where it would have been recorded as "nothing was compared"
rather than "the source is gone". That is an escape, and Grok's **ADV-4** assumed
the reopen state was carried without testing **which field carries it**.*

*Rev 3, repairing Codex's residual finding 1. Rev 2 called the attempt's depth a
**derivation** from the ledger entry. **It is not one, and the claim was checked
and withdrawn.** `02-data-model.md` **§6.1 declares `ledger_entry`'s columns** — run
ref, stage, row id, **action kind**, actor, `subject_item_id`, `stance_at_action`,
**typed outcome**, timings, `input_fingerprint`, `contract_hash`, register refs,
digest text — and **no typed action-result payload among them**. `raw_artifact`
(§6.2) carries a model call's raw text and parse status, not an E-7 depth. So
**action kind + outcome `OK` cannot select `OPENED_FULL` from `PREVIEW_ONLY`**, and
Codex's case is real: a reopen that resolves the locator but returns only a teaser
is `OK` at `PREVIEW_ONLY`, while `source_record` still says `OPENED_FULL`.*

**Rung 2 therefore tests a value that is *recorded*, not inferred — and the value
exists only for attempts that actually opened something:**

```
citation_route_record.attempt_access_depth
  ∈ { OPENED_FULL, PREVIEW_ONLY, ACCESS_BLOCKED }     -- E-7's own three values
  NULL exactly when the attempt performed no opening  -- i.e. the rung-1 terminals
```

**No new vocabulary is minted** — the domain is E-7's, exactly, and
`02-data-model.md` §13 already inventories it. What is new is **where one
*opening's* value is written**, and §9.1's **CARRIER-1** files that.

**Scoping — rev 4, repairing Codex's rev-3 finding 1.** Rev 3 wrote the column
`NOT NULL` for *every* attempt. That is unpopulatable for **R1** and **R2**, which
fire at rung 1 where **no opening ever occurred**: R1 names no source at all, and
R2's record is missing or unresolvable. Forcing a value there would mean writing
`ACCESS_BLOCKED` for an opening that was never tried — **a false claim, and exactly
the kind of typed lie this enum exists to prevent** (the other two members would be
worse). The route rows' own recorded-field clauses never listed a depth, so the
universal constraint contradicted them. **The requirement is now scoped by whether
the attempt opened anything**, with four `CHECK`s:

| # | `CHECK` | What it enforces |
|---:|---|---|
| **1** | `(attempt_access_depth IS NULL) = (route IN ('NO_SOURCE_FOUND','CITATION_UNBACKED'))` | **Absent on the rung-1 terminals, present on every row that descends to rung 2.** R3…R8 are reachable only through rung 2, so every one of them carries a depth |
| **2** | `attempt_access_depth IS NOT NULL ⇒ opening_action_ref IS NOT NULL` | **Depth-presence is bound to an opening-kind action** — A-2's `locator resolution`, `access depth` and `rechecks (Q40)`. **Action kind is a declared `ledger_entry` column** (§6.1), so "was this an opening?" is decidable from a ruled field. A depth may never be recorded for an attempt that opened nothing |
| **3** | harvest attempt (`row_id = Q16`) ⇒ `attempt_access_depth = source_record.access_depth` | **One fact, one writer, two readers** — no divergent second home (AC-85) |
| **4** | the opening action's typed outcome is non-`OK` ⇒ `attempt_access_depth = ACCESS_BLOCKED` | The loud case is settled by ruled fields and never depends on a second write |

**The no-silent-inheritance property is preserved exactly where it matters.** For
**any attempt that performs an opening**, the depth is **required at write time**:
a reopen that establishes a depth and fails to record it **fails the write**, and
**never** falls back to `source_record`'s historical `OPENED_FULL`. What rev 4
changes is only that an attempt which **never opened anything** is no longer forced
to invent a depth for an opening that did not happen.

**Why R2 records no depth even when an opening did occur.** An attempt can fail
rung 1 — an incomplete or unarchived retrieval record — after the run physically
fetched something. `CHECK` 1 still forces `NULL`, and that is correct: **R2's whole
finding is that the record does not back the citation**, so asserting a depth as
part of that record would assert the very thing just found missing. The opening's
own ledger row survives under `ledger_entry_ref`, so **the fact is preserved
without being claimed** as this citation's depth.

**Three cases fix the value; ruled fields settle two of them outright.**

| Case | `attempt_access_depth` | Settled by |
|---|---|---|
| The attempt's access / locator-resolution / recheck action has a **non-`OK`** typed outcome (`FAILED`, `BLOCKED`, `TIMED_OUT`, `REFUSED`) | **`ACCESS_BLOCKED`** | **Ruled today.** AC-44 / DR-027 oblige the typed outcome; **A-2** names `locator resolution`, `access depth` and `rechecks (Q40)` as action kinds; *"could not be opened"* is what E-7's third value **means**. A `CHECK` asserts the agreement, so the loud case never depends on a second write. `SKIPPED_BY_BUDGET` is **unreachable** — protected core (§5.5) |
| **`OK`**, and the attempt is the **harvest attempt** (`row_id = Q16`) | the E-7 value on **`source_record`** | **Ruled today.** §11A.1 gives `source_record` the three-valued depth, and Q16's own enforcement (*"record opened / preview-only / blocked"*) is the act that writes it. A `CHECK` asserts **equality**, so this is **one fact with one writer and two readers — not a second home** (AC-85) |
| **`OK`**, and the attempt is a **reopen** (`row_id = Q40` / `Q51`) at a depth the harvest value does not describe | the E-7 value **that reopen established** | **CARRIER-1 (§9.1).** No ruled field carries it. **E-7 already obliges the record** — it is a *required record* of an **opening**, and Q40 *"reopens the locators"* — so this is a **carrier-level placement gap**, not a new obligation |

**Why the gap is a placement error rather than a missing rule, in the pack's own
voice.** `02-data-model.md` §6.1 decides `action_scope`'s home with exactly this
test, in the opposite direction: *"It is a property of the **kind**, not of the row.
Stored per row, two rows of one kind could disagree — a second authority for one
fact (AC-85)."* **Access depth is the mirror image**: it is a property of the
**opening**, not of the source. Held only per source, **two openings of one source
cannot disagree** — and a source that was readable in March and is a teaser in
August is precisely two openings that *must* be allowed to disagree. **§11A.1's
placement contemplated harvest only**; Q40's reopen is the second opening E-7's
required record was always owed for.

**And it never guesses.** The write is **required for every attempt that opens** so that an unrecorded reopen
depth is a **write-time failure, not a silent inheritance of `OPENED_FULL`**. That
is Q18's discipline applied to a different missing classification — *"un-waited by
exactly one classification call, **never by an unconditional assumption in either
direction**"* — and AC-90's *"never guessed"*. Inheriting the harvest value would be
the exact silent pass this enum exists to abolish.

**The harvest-success / reopen-failure sequence, re-run.** Attempt **A1** (`row_id
= Q16`): depth `OPENED_FULL`, current, compared, matched → **`VERIFIED`**, not a
member. Attempt **A2** (`row_id = Q40`, reopen 404s): the reopen's action entry is
`FAILED` ⇒ attempt depth `ACCESS_BLOCKED` ⇒ **rung 2 fires → R3**. **Two attempts,
two rows, two outcomes — and that is not a double-land**: D1's unit is **one
attempt**, and `02-data-model.md` §11A.1 says *"one row per citation attempt"*. The
partition is **per attempt**, never per `(claim, source)` pair.

**The harvest-success / reopen-*degraded* sequence — Codex's rev-2 case, re-run.**
Attempt **A1** (`row_id = Q16`): `OPENED_FULL`, current, compared, matched →
**`VERIFIED`**. Attempt **A2** (`row_id = Q40`): the reopen **succeeds** — outcome
`OK` — but returns a teaser. **A2 records `attempt_access_depth = PREVIEW_ONLY`**
(CARRIER-1), so **rung 2 fires → R4 `PREVIEW_DEPTH_ONLY`**, and if the citation
carries a number or a quote it is R4's **breach limb**, refused at write by E-7's
`CHECK`. Under rev 2 this attempt would have read `OPENED_FULL` off the harvest row
and **descended** — the escape Codex constructed. Under rev 3 the value it tests is
the one **this opening recorded**, so it cannot.

**Which attempt's route serves is derived, never stored** — the attempt in force at
serve time — on AC-88's *"status is derived, never asserted"* and **P5**. No
`current_route` column exists, for the same reason `serve_state`'s current value is
derived from `served_number_event` rather than rewritten (`02-data-model.md` §13).

---

## 4. The eight routes

Fields cited as *recorded* are specified once, in §6. Every route writes a
`citation_route_record` row — **that is the universal loud-failure floor: no
citation attempt reaches a reader without a row saying what happened to it.**

### R1 · `NO_SOURCE_FOUND`

| | |
|---|---|
| **Triggering condition** | **`¬P_ref ∧ P_abs`** (§3.1) — the citation **names no source**, and the store carries a **typed `absence_row`** covering this claim's support: the search was issued, ran, and returned zero. |
| **What is recorded** | `route`, `absence_row_ref` (**non-null on this route and no other**), `assertion_ref`, `row_id` (the battery row that made the attempt), `at_seq`, `engine_version`. `source_ref` and `evidence_item_ref` are **null**. |
| **What serves** | The **absence row itself** — *"absence is a servable finding"* (**E-9**), rendered as its typed `{query, scope, date}`. The dependent ledger unknown wears abstention kind **2** (*searched and found nothing*, §12.3 Home 1). |
| **Loud-failure semantics** | **Serves as a finding, never as silence.** The claim is read at **AC-90's honest zero-information value — never guessed**. No new reader-facing state is minted (§7.3). |
| **Authority** | **E-9**; AC-90; AC-44 (*"could-not-dos"* are recorded); §12.3 Home 1 kind 2. |

### R2 · `CITATION_UNBACKED`

| | |
|---|---|
| **Triggering condition** | **`(P_ref ∧ ¬P_rec) ∨ (¬P_ref ∧ ¬P_abs)`** (§3.1) — the citation names support the **evidence store does not carry**: a named source with **no `source_record`**, **or** a `source_record` with **no archived `{locator, version, retrieval_time}`**, **or** nothing named and no honest negative either. This is the **fabricated / unrecorded citation**. **Rev 2**: when the citation names a source, an absence row elsewhere in the store is **not consulted** — the incomplete-record-plus-absence combination lands **here**, not nowhere (Codex finding 1). |
| **What is recorded** | `route`, `assertion_ref`, `claimed_source_text` (the unresolvable reference, stored verbatim as evidence of the defect), the missing limb (`NO_SOURCE_RECORD` / `NO_LOCATOR_TRIPLE`), `row_id`, `at_seq`, `engine_version`. |
| **What serves** | **Nothing citing it.** **Q51's locator gate blocks serving** (*"a missing locator blocks serving"*). A load-bearing claim left with no admissible support takes Q51's **reasoning-only downgrade** — *verdict → hypothesis plus a research plan*. Where the gate itself fails, **S-7's state machine is explicit**: `PROVENANCE` fail → `COMPONENTS_ONLY` → `SERVE_DEGRADED` — verified facts, badges and node graph with a visible **`DEFECT`** badge. **S-8**: there is no blocked-and-silent terminal. |
| **Loud-failure semantics** | **Hardest. Serve-blocking.** **S-19**: *"no served sentence may imply a check the ledger says did not run."* **AC-92**: the judge contract forbids inventing evidence, citations or sources — this route is the machine-side detection of that violation. |
| **Authority** | **Q51** (§3.10; **§12.2 gate 4** — provenance join · locator gate · reasoning-only downgrade) · **S-7/S-8/S-10** · **S-19** · **AC-92** · AC-44 · DR-049. |

### R3 · `SOURCE_UNREACHABLE`

| | |
|---|---|
| **Triggering condition** | The record is complete, and the **attempt's** access depth (§3.2) is **`ACCESS_BLOCKED`** — it could not be opened at its archived locator, whether at harvest **or on Q40's reopen** (the locator no longer resolves; the wall did not open). |
| **What is recorded** | `route`, **`attempt_access_depth = ACCESS_BLOCKED`**, `source_ref`, `ledger_entry_ref` → **this attempt's** access / locator-resolution / recheck action row, whose **typed outcome carries the reason** (`FAILED` / `BLOCKED` / `TIMED_OUT` / `REFUSED`), `row_id`, `at_seq`. **This is the limb ruled fields settle outright** (§3.2): A-2 obliges the action (*"locator resolution, access depth"*, *"rechecks (Q40)"*), AC-44 / DR-027 oblige its typed outcome, and a `CHECK` binds any non-`OK` outcome to `ACCESS_BLOCKED`. **A source `OPENED_FULL` at harvest that later 404s reaches this route through *this attempt's* record, never through the harvest value** — so **no depth is inherited and none is inferred**. *(Rev 3 corrects rev 2's wording here: the value is **recorded and `CHECK`-bound**, not derived — §6.1 declares no typed action-result payload to derive it from.)* |
| **What serves** | The citation, **carrying its blocked depth** — the reader sees a source the engine named and could not open. It supplies **no number and no quote** (it supplied nothing). The attempt counts as **`blocked_not_lazy`** in Q34's symmetry census, **served beside the asymmetry, never inside it** (**A-3**). |
| **Loud-failure semantics** | **Visible, non-blocking, and never re-read as laziness.** A blocked source that vanished from the record would make the engine look more thorough than it was. |
| **Authority** | **E-7** (`ACCESS_BLOCKED`) · **Q16** enforcement · **Q40** · **A-3** · `OD-M-11` (DR-061: re-verify load-bearing locators). |

### R4 · `PREVIEW_DEPTH_ONLY`

| | |
|---|---|
| **Triggering condition** | The **attempt's** access depth (§3.2) is **`PREVIEW_ONLY`** — a snippet, an abstract, a search-result card. Reached **at harvest**, and **rev 3: on a reopen that succeeds at preview depth** (Codex's rev-2 case). Two limbs, both on this route: **(a) compliant** — the citation supplies neither a number nor a quote; **(b) breach** — a number or a quote was taken from it. |
| **What is recorded** | `route`, **`attempt_access_depth = PREVIEW_ONLY`**, `source_ref`, `preview_limb` (`COMPLIANT` / `PROHIBITED_EXTRACTION`), and on limb (b) the **refused** value and the write-time rejection. At harvest, the quote and number reference columns are **null at preview depth — enforced by the `source_record` `CHECK`** (`02-data-model.md` §11A.1). **On a reopen the harvest `CHECK` is not the enforcement site** — it guards the harvest write, and the source row may legitimately still read `OPENED_FULL` from the earlier opening. What E-7 forbids is a **preview-only source supplying** a number or quote, so **this attempt supplies and confirms nothing**: any number or quote continues to rest on the attempt that actually opened the source, and this row records that the re-look could not reach it. |
| **What serves** | Limb (a): the citation, **at preview depth, visibly** — Q16's three-valued record *"is not an adjective"*, so the depth is data the reader sees. Limb (b): **nothing** — the number or quote never reaches the fact bundle, because it never reaches the database. |
| **Loud-failure semantics** | **Absolute prohibition, refused at write.** **E-7**: *"a preview-only source may **never** supply a number or a quote."* The DDL owns it (**P17**, AC-32): a `CHECK`, not an application courtesy, so a bug in the evidence pipeline cannot talk its way past it. Limb (b) is a **typed integrity error, never a coercion** (**P12**). |
| **Authority** | **E-7** · **Q16** enforcement · `02-data-model.md` §11A.1's `CHECK` · P12/P17. |

### R5 · `SOURCE_SUPERSEDED`

| | |
|---|---|
| **Triggering condition** | The source **opened at full depth** presents a **different version** than the one the citation archives, **or** the archived `retrieval_time` falls **outside the run's freshness envelope computed against `as_of`**. The citation binds to a state of the source that is no longer the one being cited into. |
| **What is recorded** | `route`, `source_ref`, `observed_version` (**the only version fact this row owns**; the archived version stays on `evidence_item` — AC-85), `observed_at`, and which limb fired (`VERSION_DRIFT` / `OUTSIDE_FRESHNESS_ENVELOPE`). The age itself is **recomputed against `as_of` and never cached** (**E-13**). |
| **What serves** | **Rev 2 — the two limbs have different authority and no longer share a consequence** (Codex finding 4; Grok **SR-1**, the same seam found twice). **`OUTSIDE_FRESHNESS_ENVELOPE`: E-13 applies directly and its rule is served unchanged** — this limb *is* newest-source age against `as_of`: a **fast-moving** question with a stale newest source **refuses**; a **slow or static** one **serves with an explicit staleness statement**; with no registry volatility class the row **`WAIT`s**, un-waited by exactly one classification call, *"never by an unconditional assumption in either direction."* **`VERSION_DRIFT`: disclosure only.** The pack obliges the **version to be archived** (E-8) and forbids a served sentence implying a check the ledger does not carry (**S-19**); it rules **no refusal, cap or badge for per-source version identity**. So the archived version and the observed version are **both on the record and both served with the citation**, and **nothing further is claimed**. |
| **Loud-failure semantics** | **Refusal on E-13's fast-moving branch; an explicit statement on its slow/static branch; disclosure of both versions on drift.** Never a silently-current citation — but also **never a refusal the pack has not ruled**. Whether drift should carry a consequence beyond disclosure is **rider R5-a for V** (§9.1), not asserted here. |
| **Authority** | `OUTSIDE_FRESHNESS_ENVELOPE`: **E-13** (§7.5) · DR-015. `VERSION_DRIFT`: **E-8** (version and retrieval time archived) · **S-19** · `OD-M-11` (DR-061 — re-verify load-bearing locators). **E-13 is *not* cited for the drift limb**, because E-13's ruled trigger is newest-source age, not per-source version identity. |

### R6 · `EXACT_COMPARE_UNAVAILABLE`

| | |
|---|---|
| **Triggering condition** | The source was opened at full depth and is current, and **no character-level comparison result exists** for this citation. |
| **What is recorded** | `route`, `source_ref`, `evidence_item_ref` where a span exists, `ledger_entry_ref`, and **`compare_unavailable_reason`** — **rev 3: a five-member domain, total because it is the leaf set of a chain of four booleans.** **① `NO_SPAN_CITED`** — *was a comparison **owed**?* No span was cited, so none was. **② `MEDIUM_UNSUPPORTED`** — owed, but **E-8's own qualifier fails**: the source does not support character-level comparison for this span (a scan, an image, a stream, a query result with no stable text). **③ `COMPARE_NOT_EXECUTED`** — owed and supportable, and **no execution record exists at all**; loud on its own terms, because **S-19** says everything executed is recorded and **A-2** names *"exact quote comparison (Q16)"* an obliged action kind, so a missing entry is itself the finding (A-2's `UNCLASSIFIED_ACTION` precedent: an unmapped execution is **typed, never dropped**). **④ `COMPARE_EXECUTION_NOT_OK`** — an execution record exists and its **typed outcome is not `OK`**. **⑤ `COMPARE_RESULT_MISSING`** *(new in rev 3)* — an execution record exists, its outcome **is `OK`**, and **the comparison result did not persist**. |
| **Why the five are total** | They are the **leaves of four ordered yes/no questions**, not a list: *owed?* → *supportable?* → *executed?* → *outcome `OK`?* Each answer is a fact about records the pack already obliges, and ⑤ is **the last leaf** — the exact conjunction `owed ∧ supportable ∧ executed ∧ OK ∧ ¬result`. It is reached **only** when all four prior tests pass and rung 4's own precondition (*no comparison result exists*) still holds, so it is a **positive definition, not a residue bucket** — the same test §5.4 applies to R2. |
| **Why ④ does not restate the ledger enum** | The outcome itself is **read through `ledger_entry_ref`, never copied** (AC-85), so ④'s domain **is** the ledger's own non-`OK` membership — `FAILED`, `BLOCKED`, `TIMED_OUT`, `REFUSED` (and `SKIPPED_BY_BUDGET`, **unreachable** on protected core, §5.5). Rev 1 named only `FAILED`/`TIMED_OUT`; referencing rather than restating makes the field **immune to any later growth of the ledger vocabulary**. |
| **Why ⑤ was not argued impossible** | The tempting move is to say an `OK` execution with no persisted result **violates DR-027's record-before-math** and therefore cannot exist. **The seat checked and rejected that argument.** DR-027 / **S-19** rule that *raw judgements are stored before the math* — a rule about **model judgements**, and a character-level comparison is a **machine** action. Nothing cited anywhere in the pack makes the ledger append and the result write **atomic**; **P4** points the other way for the one case it does address (*"writes the ledger row **outside** any open write transaction"*). Claiming an invariant the pack does not state would be exactly the invention this ticket is disciplined against — so the case gets a **member**, which costs nothing: **reasons are fields, not routes, and the enum is still eight** (Codex's own note). ⑤'s occurrence **is** a ledger-completeness defect, and it is loud twice over: the citation takes the honest route (nothing was character-verified) **and** the row stands as evidence against S-19's *everything executed is recorded*, where the completeness audit — not this enum — is the place it gets chased. |
| **What serves** | The citation and its excerpt, **labelled not character-verified** — the reader is told the quote is *shown*, not *checked*. The label is what **DR-084** itself requires of a route that surfaces to a reader; §7.1 drafts **`UNVERIFIED-CITATION`** for V. **S-19** independently makes the attempt **digest-visible**. |
| **Loud-failure semantics** | **The anti-theater route.** Q36's law at the smallest scale: *"a confidence with no measurement behind it is typed as unmeasured and may not be presented as measured."* Without R6, *"exact compare where available"* is a **silent pass** wherever it was unavailable, and the pack's most-repeated defect — a check that looks done and was not — returns through the citation surface. **Budget can never produce this route**: citation routes are **protected core, never budget-skippable** (DR-021 knob 9 + **DR-052**), so `SKIPPED-BY-BUDGET` is not a reachable cause. |
| **The merge stays V's to rule** | Reasons **①–⑤** share **one route and one reader mark**. Grok pressed this (**SP-4**) and accepted it: the mark states the **shared observable** — no successful character check — and is accurate under **all five**, ⑤ included, since an `OK` execution whose result did not persist is likewise a citation nothing character-verified. Withdrawing the span on **④ or ⑤** would **over-claim** (neither a failed execution nor a lost result is a mismatch), and blocking would over-punish scans and source-level cites. Codex required that the merge **not be papered over**. It is not: **SP-4 remains open for V**, and §9.1's **rider R6-a** states the split option and its cost — splitting **④ and/or ⑤** out makes the enum **nine**, which is DR-084's count to change, not the seat's. |
| **Authority** | **E-8** · **S-19** · **A-2** (obliged action kinds; `UNCLASSIFIED_ACTION`'s typed-never-dropped precedent) · Q36 (§3.7) · AC-85 · DR-052. |

### R7 · `SPAN_NOT_FOUND`

| | |
|---|---|
| **Triggering condition** | The comparison ran against a current, fully-opened artifact and the cited span **is not present in it**. **Q40's typed `not-found`.** |
| **What is recorded** | `route`, `source_ref`, `evidence_item_ref`, the searched span's identity, and the comparison's ledger entry. |
| **What serves** | **Rev 2 — only what is ruled** (Codex finding 4). **① Q40's typed outcome `not-found` is recorded and served per checked item** — that is Q40's own requirement, not an extension. **② The span is read at its honest zero-information value — AC-90**: *"a missing or malformed input proves nothing and is read at its honest zero-information value, never guessed."* The span therefore **supports nothing**; it is not silently re-read as weaker support. **③ S-19** makes the failed check **digest-visible**. **④** The reader-facing typed state is §7.2's **`CITATION-RECHECK-FAILED`**, drafted for V under DR-084. |
| **What is *not* claimed** | That the quote is **struck from the served text** and that **the rest of the answer stands**. Rev 1 asserted that by reading **S-9e** (*replay eviction of an unreplayable component **number*** — *"one number lost, never the answer"*) across to a quote. **S-9e rules numbers, and Q40 rules an outcome, not a text-surface remedy.** The extension is real and may well be what V wants; it is therefore **rider R7/R8-a** (§9.1), not authority. |
| **Loud-failure semantics** | **Typed, recorded, digest-visible, and worth zero.** Nothing silently degrades: AC-90 fixes the evidential value at the honest zero, which is the ruled floor. |
| **Authority** | **Q40** (§3.8, §14) · **E-8** · **AC-90** · **S-19** · DR-084 (the reader-facing placement). **S-9e is cited as the nearest ruled analogue in rider R7/R8-a, never as this route's authority.** |

### R8 · `SPAN_MISMATCH`

| | |
|---|---|
| **Triggering condition** | The span **is present** and the **character-level comparison fails**: characters differ, whitespace or punctuation was normalized, an excerpt that AC-92 requires to be **byte-identical** is not, or a truncation is unmarked or not at a word boundary. **Q40's typed `deviates`.** |
| **What is recorded** | `route`, `source_ref`, `evidence_item_ref`, and **`mismatch_locus`** — the first differing offset with the two spans, **bounded**. **No similarity scalar, ever**: a match percentage would be an invented measurement (**DR-039**), and the pack has already refused exactly this shape once — **A-3a**, *"the row emits no fairness score."* |
| **What serves** | **Rev 2 — R7's four ruled limbs exactly**, with Q40's typed outcome being **`deviates`** rather than `not-found`, the **`mismatch_locus` on the record**, and the same **`CITATION-RECHECK-FAILED`** mark (§7.2). **The same extension is withheld**: striking the quote from the served text and asserting partial-answer survival is **rider R7/R8-a** (§9.1), not a ruled consequence. |
| **Loud-failure semantics** | **The strongest allegation the enum can make against the engine itself** — the engine said a source contains words it does not contain. Distinct from R7 by the pack's own hand: **Q40 types `deviates` and `not-found` separately**, and *"we could not find it"* and *"it says something else"* are different things to tell a reader. **This is the primary kill candidate when the hard-kill gate is eventually written** (§8) — and it is **not** a kill today. |
| **Authority** | **Q40** · **E-8** (character-level exact comparison) · **AC-92** (byte-identity and marked truncation) · **AC-90** · **S-19** · A-3a / DR-039 (no invented scalar). |

### Roll-up — the eight, their loudness class, and their reader surface

| # | Route | Rung | Loudness class | Reader surface | New §12.3 state? |
|---:|---|---:|---|---|---|
| 1 | `NO_SOURCE_FOUND` | 1 | serves as a **finding** | the absence row; abstention kind 2 | **no** |
| 2 | `CITATION_UNBACKED` | 1 | **blocks serving** (Q51) | reasoning-only downgrade; `DEFECT` if unconformable | **no** |
| 3 | `SOURCE_UNREACHABLE` | 2 | serves **labelled** | blocked access depth; `blocked_not_lazy` | **no** |
| 4 | `PREVIEW_DEPTH_ONLY` | 2 | **refused at write** (breach limb) | preview depth on the citation | **no** |
| 5 | `SOURCE_SUPERSEDED` | 3 | **refuses / states** on E-13's limb · **discloses** on the drift limb | E-13's staleness statement · both versions on the citation | **no** |
| 6 | `EXACT_COMPARE_UNAVAILABLE` | 4 | serves **labelled** | **`UNVERIFIED-CITATION`** | **yes — §7.1** |
| 7 | `SPAN_NOT_FOUND` | 5 | typed, recorded, digest-visible, **worth zero** (AC-90) | **`CITATION-RECHECK-FAILED`** | **yes — §7.2** |
| 8 | `SPAN_MISMATCH` | 6 | as R7, **plus the diff on the record** | **`CITATION-RECHECK-FAILED`** | shares §7.2 |

**Two block or refuse outright** (R2's Q51 block; R4's breach limb refused at
write), **one refuses on E-13's ruled fast-moving branch** (R5), **five serve
labelled**. **Eight write a row. Zero are silent.**

*Rev 2 restates this roll-up: rev 1 counted R7 and R8 as **withdrawals**, which was
precisely the unruled extension Codex finding 4 named. Their ruled loudness is
**typed, recorded, digest-visible and evidentially zero** — the withdrawal-and-
survival behaviour is rider **R7/R8-a** (§9.1).*

---

## 5. The closure proof — every citation failure lands in exactly one route

**DR-051's discipline** is that a closed enum's membership plus its mapping is
*"exhaustive … residue impossible by construction"*. Four properties are owed:
**totality**, **disjointness**, **reachability**, and **no disguised "other"**.

### 5.1 Totality — no residue

**Claim.** Every citation failure (D3) reaches a leaf of §3's ladder.

**Proof.** The ladder is a chain of six case-splits. A case-split leaves residue
only if its branch set does not cover its tested field's domain. Rung by rung:

| Rung | Tested field's domain | Cover |
|---:|---|---|
| **1** | the **three predicates** `P_ref`, `P_rec`, `P_abs` | **§3.1's truth table covers every combination**, with `P_rec` vacuous and `P_abs` decisive when `P_ref` is false, and `P_abs` **not consulted** when `P_ref` is true. **Rev 2**: rev 1's prose split left *incomplete record + covering absence row* homeless (Codex finding 1); the predicate table has no such cell. |
| **2** | **`attempt_access_depth`** — the E-7 value **this attempt recorded** (§3.2) | **E-7 makes it a three-valued *required* record** — three values, three branches, no fourth, and **required on every attempt that reaches this rung**. **Rev 4**: the field is `NULL` **only** on the rung-1 terminals, which never reach rung 2, so **every attempt evaluated here has a value** — the rung is total over rows that get here, and R1/R2 are no longer forced to invent one (Codex rev-3 finding 1). **Rev 3**: the tested value is **recorded, not inferred** — ruled fields fix it on a **non-`OK`** outcome (⇒ `ACCESS_BLOCKED`) and on the **harvest** attempt (⇒ `source_record`'s value, `CHECK`-equal); an **`OK` reopen at a changed depth** is **CARRIER-1**. Rev 2 called it a derivation, which `02-data-model.md` §6.1's column list does not support (Codex rev-2 finding 1); rev 1 read the **harvest** value and let a later access loss pass the rung (Codex finding 2). |
| **3** | version/freshness agreement | **Boolean.** Both branches present. |
| **4** | existence of a comparison result | **Boolean.** Both branches present. The `false` branch's **five recorded reasons** are the **leaf set of four ordered booleans** — owed? → supportable? → executed? → outcome `OK`? (§4 · R6) — and they are **reasons on one route, not further branches**. **Rev 3** adds ⑤ `COMPARE_RESULT_MISSING` for an `OK` execution whose result did not persist (Codex rev-2 finding 2); **rev 2** had already replaced rev 1's three-member list, which could represent neither a `BLOCKED`/`REFUSED` comparison nor one never executed (Codex finding 3). |
| **5** | comparison says *present* | **Boolean** (Q40 `not-found` vs the rest). |
| **6** | comparison says *exact* | **Boolean** (Q40 `deviates` vs `verified`). |

Each rung is total; a chain of total case-splits is total. The single rung that
could have carried an open-ended residue is **rung 1**, and its residue branch is
**R2 `CITATION_UNBACKED`** — which is why R2 is defined **positively** (§5.4) rather
than left as a catch-all. ∎

**The corollary that matters operationally:** an attempt that reaches rung 6 and
passes is **`VERIFIED`** — outside D3, and therefore outside the enum. The enum
partitions failures, and success is not one.

**The unit the proof quantifies over is the *attempt*, not the claim** (D1;
`02-data-model.md` §11A.1's *"one row per citation attempt"*). A citation verified
at harvest and re-checked later produces **two rows with two outcomes**, which is
the design, not a double-land — §3.2 walks that exact sequence. **Which row's route
serves is derived** (the attempt in force at serve time), never stored (AC-88).

### 5.2 Disjointness — no overlap

**Claim.** No citation failure satisfies two routes.

**Proof.** Two mechanisms, both required.

1. **Within a rung**, the branches are pairwise exclusive: R1/R2 because **§3.1's
   truth table assigns each predicate combination exactly one outcome**; R3/R4
   because **E-7 admits exactly one access-depth value**, and §3.2's derivation
   yields exactly one value **per attempt**; rungs 3–6 are booleans.
2. **Across rungs**, the rung order is **total and fixed**, and the route is the
   **first** rung that fails. Every later rung has an **earlier rung's pass as its
   precondition** — R5 through R8 are unreachable unless the source is
   `OPENED_FULL` (rung 2 passed), R6 through R8 unless the artifact is current
   (rung 3 passed), R7 and R8 unless a comparison result exists (rung 4 passed),
   R8 unless the span is present (rung 5 passed). So a second failing condition
   **cannot re-route an attempt that already has a route**.

Because the order is load-bearing, it is a **ratified property of the enum, not an
implementation choice** — the same status `02-data-model.md` gives
`snapshot_at_seq`'s ordering (*"the ordering is the point"*). ∎

### 5.3 Reachability — no dead member

**Claim.** Each of the eight has at least one producer that can actually fire.

**Why it is owed.** `02-data-model.md` §13 applies AC-77 / charter VR-4 to
`tier_source`'s `DERIVED`: *"a member with no producer must be removed rather than
left unreachable."* **AC-78** says the same of gates. An enum member that cannot
fire is shipped-dark vocabulary.

**Producers, one per member** *(rev 2: R3's and R6's restated against the repaired
rungs)*: **R1** — Q17's zero-result projection (E-9). **R2** — Q51's provenance join
finding no locator; the AC-92 honesty violation; a named source with no
`source_record`. **R3** — the attempt recording
`ACCESS_BLOCKED` at harvest, **or** its access / recheck action returning a non-`OK`
typed outcome (§3.2). **R4** — Q16 recording `PREVIEW_ONLY`, **or a Q40 reopen that
succeeds at preview depth** (rev 3). **R5** — Q40's reopen observing a different
version; E-13's age computation against `as_of`. **R6** — **all five** recorded
reasons have producers: a source-level citation (`NO_SPAN_CITED`), Q16 finding the
medium uncomparable (`MEDIUM_UNSUPPORTED`), a comparison owed with no entry
(`COMPARE_NOT_EXECUTED`), a comparison entry with any non-`OK` outcome
(`COMPARE_EXECUTION_NOT_OK`), and an `OK` entry whose result did not persist
(`COMPARE_RESULT_MISSING`). **R7** — Q40's `not-found`. **R8** — Q40's `deviates`.

**Fixture obligation.** One **firing demonstration per route**, riding on
**`FX-HR-H5`** at **S6** — spec **§22**'s acceptance table states the discipline:
*"a blocking gate with no firing demonstration is an untested claim"*
(`CARRIED-DESIGN`, Grok F5). **Fixture ids are not minted here**; assigning them
belongs to `06-test-strategy.md`.

### 5.4 No disguised "other" — the R2 test

**DR-084 forbids a generic "other".** R2 is the member a reviewer must test, because
it occupies the position an "other" would occupy. Three properties distinguish them:

| | a generic `OTHER` | **R2 `CITATION_UNBACKED`** |
|---|---|---|
| **Definition** | negative — *"none of the other seven"* | **positive** — *the evidence store does not carry the retrieval this citation names* |
| **Decidability** | only **after** the other seven have been evaluated and failed | **before any of them** — it is their shared **precondition failure** |
| **Consequence** | none of its own; it inherits a default | **its own**: Q51's serve block and the reasoning-only downgrade |

R2 is evaluated **first**, and the six routes below rung 1 are **unreachable** when
it fires, because every one of them requires the complete retrieval record (`P_rec`)
that R2 says is absent. **R1 shares rung 1 with it and is separated by a single
predicate** — `P_abs`, whether the store carries the honest negative — not by
elimination. An "other" is a bucket at the end of a list; **R2 is the root of the
ladder**. Adding a hypothetical ninth failure mode would not enlarge R2: it would
have to attach to a rung, and **every rung is total** (§5.1). ∎

### 5.5 The boundary — five cases that are *not* citation failures, with their homes

Residue can also hide **outside** the enum, by quietly excluding cases. Each
exclusion is named and re-homed:

| Case | Why it is out of domain | Its typed home |
|---|---|---|
| The unknown was **never searched for** | no citation attempt was made | abstention kind **1** (*not searched*), §12.3 Home 1 |
| A claim resting on **reasoning alone** | no source was bound | **Q51's reasoning-only downgrade** + AC-24's way-of-knowing band ceiling |
| Evidence **off-subject** or **partly relevant** | admissibility, not citation | **E-5**'s reject / admit-downgraded; `OFF-SUBJECT-DOWNGRADE` (§12.3 #20) |
| The **same source counted twice** | provenance clustering, not citation | **E-10**'s cluster gate; `evidence_item`'s cluster key |
| A **served number** that fails replay | replay, not citation | **S-9e**'s eviction; `MISSING-NUMBER` (§12.3 #22); `served_number_event.status = EVICTED` |

**And one case that could have become residue and does not:** an attempt whose
comparison was **skipped for cost**. It cannot arise — **citation routes are
protected core and are never budget-skippable** (**DR-021 knob 9**, extended by
**DR-052**; spec §4's budget-override row and §21.2). `SKIPPED-BY-BUDGET` is
therefore **not** a reachable cause of any route, and any implementation that
produces one is a **protected-core violation**, caught by `FX-C52-06`.

---

## 6. The carrier — what `citation_route_record` must hold

`02-data-model.md` §11A.1 declares the table and *"still mints no member"*. The
**membership** is §4's. The **fields the membership needs** are below —
**a proposal for a fold-in ticket**, not an edit made here.

**Two disciplines constrain the list.** **AC-85** — one authoritative home per
fact; anything already on `source_record`, `evidence_item` or `ledger_entry` is
**referenced, never copied**. **AC-88 / `02-data-model.md` §14** — *status is
derived, never asserted*; nothing derivable is stored.

| Field | Holds | Why it cannot live elsewhere |
|---|---|---|
| `run_id`, `node_id` | graph scope | every graph FK is graph-scoped (C-11) |
| `assertion_ref` | the served or load-bearing claim being cited | Q51 joins provenance **per claim** |
| `row_id` | the battery row that made the attempt — **`Q16` / `Q40` / `Q51`** | reuses the existing row vocabulary; **mints no new enum** |
| `at_seq` | position in the run's total order | S-21 — ledger order is total and deterministic |
| `outcome` | **`VERIFIED` / `ROUTED`** | D2's success is not an enum member (§2) |
| `route` | the eight-member enum; **non-null iff `outcome = ROUTED`** (`CHECK`) | the ratified membership |
| `source_ref` | → `evidence.source_record`; null on R1 and R2 | the source's own facts (access depth, locator, archived version) are read **through** this ref |
| `evidence_item_ref` | → the span; null where no span was cited | AC-85 |
| `absence_row_ref` | → `evidence.absence_row`; **non-null iff `route = NO_SOURCE_FOUND`** (`CHECK`) | E-9's servable finding |
| **`ledger_entry_ref`** | → **this attempt's** obliged action rows and their typed outcomes: the **access-depth / locator-resolution / recheck** entry (rung 2) and the **exact-quote-comparison** entry (rung 4) | **A-2** names all of these action kinds · AC-44 · DR-027. **Load-bearing, not incidental**: it settles rung 2's non-`OK` case and R6's reasons ③④⑤ without restating the ledger enum. **Rev 3 correction**: it does **not** settle rung 2's `OK` case — `02-data-model.md` §6.1 declares no typed action-result payload, so an `OK` outcome carries no depth |
| **`attempt_access_depth`** *(rev 3; scoped in rev 4)* | `OPENED_FULL` / `PREVIEW_ONLY` / `ACCESS_BLOCKED` — **E-7's own three values, no new vocabulary** (§13 inventories them). Rung 2's tested field. **`NULL` exactly when the attempt performed no opening** — i.e. exactly on the rung-1 terminals **R1** and **R2**; **required on every row that descends to rung 2**, so R3…R8 always carry it | **E-7** obliges the depth as a *required record* of an **opening**; §11A.1 places it on `source_record`, which is **per source**. **Four `CHECK`s** (§3.2): null-ness matches the rung-1 terminals · a depth may exist only where an **opening-kind action** does (`ledger_entry.action_kind`, §6.1) · equality with `source_record` on a harvest attempt · `ACCESS_BLOCKED` on a non-`OK` opening outcome. The **reopen-at-a-changed-depth** write is the carrier addition **CARRIER-1** (§9.1) |
| `opening_action_ref` *(rev 4)* | the limb of `ledger_entry_ref` pointing at this attempt's **opening-kind action**, or null where the attempt opened nothing | Makes `CHECK` 2 expressible. **Action kind is already a declared `ledger_entry` column** (§6.1), so this references a ruled field and adds no vocabulary |
| `claimed_source_text` | the unresolvable reference, verbatim; **R2 only** | the defect's only evidence — it exists nowhere else by definition |
| `preview_limb` | `COMPLIANT` / `PROHIBITED_EXTRACTION`; **R4 only** | E-7's prohibition needs its breach recorded, not merely refused |
| `compare_unavailable_reason` | **`NO_SPAN_CITED` / `MEDIUM_UNSUPPORTED` / `COMPARE_NOT_EXECUTED` / `COMPARE_EXECUTION_NOT_OK` / `COMPARE_RESULT_MISSING`** *(five — rev 3)*; **R6 only**; total as the leaf set of the four ordered booleans at §4 · R6 | E-8's *"wherever the source supports it"* is otherwise unfalsifiable. The **non-`OK` outcome itself is never copied** — it is read through `ledger_entry_ref` (AC-85). **Reasons are fields, not routes: five reasons, still eight routes** |
| `observed_version`, `observed_at` | what this attempt saw; **R5's evidence** | the **archived** version stays on `evidence_item` — this is the *other* side of the comparison |
| `mismatch_locus` | first differing offset + the two bounded spans; **R8 only** | **no similarity scalar** (DR-039; A-3a's precedent) |
| `engine_version` | replay identity | S-17 / S-20 |

**Deliberately absent — and every absence is a derivation, not an omission.**
**No copy of the *harvest* access depth**: `source_record`'s value is read through
`source_ref`, and `attempt_access_depth` is **`CHECK`-equal to it on the harvest
attempt** — one fact, one writer, two readers, so AC-85 is not engaged. *(Rev 3
corrects rev 2 here: rev 2 claimed the attempt value was **derived** and stored
nothing, which §6.1's column list does not support. A reopen's depth is a
**different fact about a different opening**, and recording it is E-7's own
requirement — see §3.2 and CARRIER-1.)* **No `current_route`**: which
attempt's route serves is derived from the attempt in force at serve time (§5.1).
**No `blocks_serve` flag** — derived from `route` and the claim's load-bearing
status. **No `severity` and no score of any kind** — loudness is a **property of
the route**, not a number. And **no `is_hard_killed` column** — the gate is not
written (§8), and its carrier would be the gate shipped dark.

**Immutability.** One row per attempt, append-only, in `evidence` on the same
migration lineage (§11A.1) — the discipline **P10** already applies to receipts.

---

## 7. The spec §12.3 amendment — drafted for V, applied by V (S-13)

**Two of the eight surface to a reader as a typed state** and therefore need a
§12.3 placement under **DR-084** and **S-13**. Both are **condition marks**
(Home 2) — *"servable in parallel"*, an answer may wear several — because neither
is an ignorance-ledger unknown (Home 1) and neither ends a run (Home 3).

**The eight routes themselves are NOT placed in §12.3.** They are an internal
**evidence-subsystem** enum in `packages/kernel` (`02-data-model.md` §13's own
words: *"as a closed evidence-subsystem enum (not a condition mark)"*). Only the
two reader-facing marks below are §12.3's business.

### 7.1 · Draft row — `UNVERIFIED-CITATION`

```
| 23 | `UNVERIFIED-CITATION` | Q16 · Q40 · §7.3 | a cited source was opened, but nothing in it was compared character-for-character to what the answer says it says |
```

**Raised by:** route **R6 `EXACT_COMPARE_UNAVAILABLE`**. **Why a reader needs it:**
without it a shown quote reads as a checked quote, and E-8's *"wherever the source
supports it"* becomes a silent pass — Q36's anti-theater law at citation scale.
**Scope:** `node` or `answer` (`condition_mark.scope`, `02-data-model.md` §13).

### 7.2 · Draft row — `CITATION-RECHECK-FAILED` *(rev 2: renamed and rewritten)*

```
| 24 | `CITATION-RECHECK-FAILED` | Q40 · §7.3 | a cited span was re-checked against its source and failed — absent, or deviating character-for-character; the span supports nothing |
```


**Raised by:** routes **R7 `SPAN_NOT_FOUND`** and **R8 `SPAN_MISMATCH`** (one mark,
two routes: marks are coarser than routes, exactly as `MISSING-NUMBER` covers any
replay failure). **Which of the two fired is on the record**, so the mark never has
to carry the accusation.

**Why it was renamed.** Rev 1 drafted `CITATION-WITHDRAWN`, whose *Says* text —
*"was withdrawn; the rest of the answer stands"* — **asserted a remedy the pack does
not rule** (Codex finding 4). S-9e rules eviction of an unreplayable component
**number**; Q40 rules a typed **outcome**. The rev-2 text states **only** what is
ruled: **Q40's failed re-check** and **AC-90's honest zero-information value**
(*"proves nothing … never guessed"*). A mark whose own definition contains an
unratified behaviour would smuggle that behaviour into §12.3 under S-13 — the exact
failure mode this ticket exists to avoid.

**If V wants the withdrawal behaviour**, it is rider **R7/R8-a** (§9.1); the mark's
text needs no change to accommodate it, because a withdrawn span is still a span
that failed re-check.

**Scope:** `node` or `answer` (`condition_mark.scope`, `02-data-model.md` §13).

### 7.3 · What is deliberately **not** minted, and why

| Route | Why no new state | The existing home |
|---|---|---|
| R1 `NO_SOURCE_FOUND` | absence already has a servable form and an abstention kind | `absence_row` (E-9) + Home 1 kind **2** |
| R2 `CITATION_UNBACKED` | the consequence already has typed states | Q51 downgrade; the `COMPONENTS_ONLY` terminal's **`DEFECT`** badge (S-7); AC-91's prose *why* + *what would unlock it*. **See SP-10** |
| R3 `SOURCE_UNREACHABLE` | access depth is **already a required served record**, not an adjective | E-7's three-valued record; `blocked_not_lazy` |
| R4 `PREVIEW_DEPTH_ONLY` | same — the depth **is** the disclosure | E-7's three-valued record |
| R5 `SOURCE_SUPERSEDED` | **freshness limb**: E-13 already prescribes the surface — refuse, or serve with an **explicit staleness statement**. **Drift limb (rev 2)**: the surface is **the two versions on the citation**, which E-8 already obliges to be archived — **no mark is proposed, because no consequence beyond disclosure is ruled** | E-13's statement; E-8's archived version; `STALE`/`UNDER-REVIEW` (#10/#11) remain **answer-scoped, raised by DR-015's watched trigger — not extended here**. Rider **R5-a** if V wants more |

**Minimum minting is the point.** S-13 makes every mint a founding-spec edit; five
of the eight need none.

### 7.4 · Consequential edits V's ratification triggers (flagged, not made)

Applying §7.1 and §7.2 takes Home 2 from **22** to **24** condition marks. Three
artifacts assert that count and would need the mechanical follow-through:

1. **`AC-65`** (Plan.md §1.6) — *"5 abstention kinds + **22** condition marks + 5
   terminal routes"* → **24**.
2. **`FX-LG-04`** (`06-test-strategy.md` §6.2) — the kernel membership-and-count
   gate asserts the same triple; it fails until updated. **This is the gate working
   as designed** — it is exactly the test that catches an unplaced state.
3. **`02-data-model.md` §13** — the closed-enum inventory row *"condition marks |
   **22**, not restated here"* → **24**.

`04-api-contract.md` §10 imports the membership by citation and needs no edit.

### 7.5 · Draft edit note for §12.3, in the pack's own convention

```
**Edit note — <date>** `RULED(DR-084; DR-020 knob 7)` · **Rows 23
(`UNVERIFIED-CITATION`) and 24 (`CITATION-RECHECK-FAILED`) were
added on this date.** They are the two members of the eight typed
citation-failure routes that surface to a reader, placed here because S-13
makes this table the only place a typed state may be minted. The routes
themselves are a closed evidence-subsystem enum in `packages/kernel` and are
not members of this table. Authority: DR-084 (architecture proposes, V
ratifies) over DR-020 knob 7's "eight typed failure routes from day one";
proposal at `docs/missions/2026-08-06-v3-programming/ratification/
citation-routes.md`. AC-65's count becomes 5 + 24 + 5.
```

---

## 8. The routes ship; the gate does not (DR-088 · AC-78 · P16)

**DR-020 knob 7 has two clauses and they ship at different times.** The **eight
typed failure routes** ship *"from day one"* — this document's subject. The
**hard-kill gate** *"auto-activates when V3's character-level quote matcher ships
and validates"* — and **DR-088** rules that auto-activation **counts as shipped
dark**: the gate is **written when the matcher validates, never shipped inert**,
with a **NOT-SHIPPED attestation** (`FX-DEF-01`, **P18**) standing in the
acceptance bundle until then.

**What that forbids in this proposal, and what it permits.**

- **Forbidden — and absent here:** any global kill predicate over the eight; any
  register key that would enable one; any column (`is_hard_killed`, `kill_reason`)
  whose only consumer is the unwritten gate. None appears in §4 or §6.
- **Permitted — and used here:** the consequences the pack **already rules** for
  each failure mode. R2's serve block is **Q51's**, ruled and always-on (S-10: the
  sole never-disabled serving invariant). R4's write refusal is **E-7's `CHECK`**,
  already accepted at DR-099 A-06. R5's refusal is **E-13's**. None of these is the
  citation hard-kill gate; each predates it and each fires today.

**What the gate will consume when it is written.** Recording the routes now is
precisely what makes the gate **writable later without shipping it now** — the
same shape **P16** gives shadow mode. The kill set is **V's to name at that
sitting**; the seat notes only that **R8 `SPAN_MISMATCH`** and **R2
`CITATION_UNBACKED`** are its natural subjects, and **records no predicate**.

---

## 9. Scrutiny points — what a reviewer must check, and what V must rule

| # | The point | The seat's position |
|---:|---|---|
| **SP-1** | **Should `VERIFIED` be a ninth member** instead of a separate `outcome` column? | **No.** E-8 says *failures* take the eight; a ninth member makes the enum nine and breaks DR-020 knob 7's count. **V's call.** |
| **SP-2** | **Is R1 `NO_SOURCE_FOUND` a citation failure at all**, or an abstention wearing a route? | It is **both-facing by design**: the attempt was made (query issued, retrieval ran, zero returned) and the honest nothing must be a **named** route, or it becomes the enum's blind spot. Dropping it re-opens residue at rung 1. |
| **SP-3** | **R2 merges two conditions** — a phantom source and a real source with no archived locator. Should they be two routes? | **No**, on the individuation rule §4 applies throughout: identical serve consequence (Q51 blocks) and identical loudness ⇒ one route, with the limb recorded. Splitting them costs a slot the eight cannot spare. |
| **SP-4** | **R6 merges five causes** *(rev 1: three · rev 2: four · rev 3: five)*, **three of which are engine-side** rather than source-side. Should an engine-side compare failure be its own route? | **Still open, and the pressure on it has only grown** — each review round widened the merge. The seat's position remains **no**: the serve consequence is identical (shown, not claimed verified), the cause is recorded, and the ledger entry is loud internally (S-19, digest-visible). **Grok pressed it and accepted** (the mark states the shared observable; withdrawing on an execution failure would over-claim). **Codex required it not be papered over** — so each round made the reason domain **provably total** rather than quietly widening one member. **Splitting makes the enum nine, which is DR-084's count to change. V's call, not the seat's** — rider **R6-a**. |
| **SP-5** | **A source-level citation with no span cited** lands in R6 and is therefore *not verified*. Is that too harsh? | It is **honest**: nothing was checked character-for-character. E-8 obliges span extraction, so this is the exception, not the norm — and only **two** routes block or refuse outright. **Grok pressed this and judged it honest**, naming the real risk as **badge dilution** — a product question for V at ratification, whose fix is *extract spans as the norm*, not drop the label so unchecked cites look checked. |
| **SP-6** | **Rung order is load-bearing** (currency before exactness). Is the order part of the ratification? | **Yes.** Without it, a source edited after retrieval is recorded as an engine misquote. The order should be ratified with the membership. **Rev 2 adds a second load-bearing ordering**: rung 1's rule that **`P_abs` is consulted only when `P_ref` is false** (§3.1), and rung 2's rule that the depth is **the attempt's, not the source's** (§3.2). Both are ratifiable properties, not implementation latitude. |
| **SP-7** | **The two new marks take Home 2 from 22 to 24**, breaking `FX-LG-04` and `AC-65` until the follow-through lands (§7.4). | Flagged, not applied. The break is the count gate **doing its job**. |
| **SP-8** | ~~Access depth has no row in `02-data-model.md` §13's closed-enum inventory.~~ **RESOLVED — withdrawn in rev 4.** | **The inventory limb is closed and this scrutiny point is retired.** `02-data-model.md` **§13 now carries an `access depth` row** — all three E-7 members, *"three-valued and REQUIRED, not an adjective"*, `kernel` home, `evidence.source_record` `CHECK` as its enforcement site — and **§11A.1 now names the `access_depth` column explicitly and points at §13**. Rev 1 raised this against the then-current text; a fold-in has since landed and the seat **re-read §13 and §11A.1 to confirm it** rather than carrying the claim forward. **What remains is a different limb, and it is not this one:** **CARRIER-1** (§9.1) is a **placement** gap — the record is held **per source** where E-7 obliges it **per opening** — and the §13 row's own enforcement site (`evidence.source_record`) is the evidence that the placement is per-source. **Only CARRIER-1 goes to the fold-in ticket.** |
| **SP-9** | The **`citation_route_record` field list (§6)** is a proposal against `02-data-model.md` §11A.1, which currently declares the table with no columns. | Fold-in belongs to a separate ticket **after** ratification; nothing was edited in `02-data-model.md`. |
| **SP-10** | **`DEFECT`'s definition may not cover the branch R2 lands on.** §12.3 mark **#14** says `DEFECT` means *"composition could not be conformed in two attempts, or the verdict failed its stranger check"* — **two causes**. But **S-7's state machine** gives the `DEFECT` badge to `COMPONENTS_ONLY` reached by *"a blocking gate that prose cannot repair"*, which includes a **Q51 provenance failure** (S-9 names that terminal's fixture explicitly). | Found in passing, **outside this file contract and outside DR-084's scope**. Raised, not resolved: it is either a harmless summary in #14's *Says* column or an uncovered branch, and only V can touch §12.3. **This proposal does not depend on the answer** — R2's serve consequence is S-7's, whatever #14's text is amended to say. |
| **SP-11** | **Do `ran` claims write citation routes at all?** The ladder is **harvest-document native** — its producers are Q16/Q40, its carrier is `source_ref → source_record`, and its founding home is E-8's *"citation failures"*. A probe-backed claim living only in `probe_capture` / `instrument_certification` has **no `source_record`** and would read as **R2** under a literal reading, which is harsh for a real measurement. | Raised by **Grok (SR-2)** and carried. Where a probe **is** projected into a `source_record`, a dead instrument locator reaches **R3** correctly. Where it is not, the claim already has **Q51's locator gate** and the probe tables, and writes no `citation_route_record` row (D3's boundary, §5.5). **The fold-in ticket must say which**, and the seat recommends stating it in `02-data-model.md` §11A.1 rather than widening the enum — **it is a documentation question, not a residue hole in E-8's domain**. |

---

### 9.1 Riders — behaviour V may want, and one carrier the data model owes

*New in rev 2, and the direct product of Codex finding 4. Each rider is a
consequence a reasonable reader might expect, which **no ruled requirement
supplies**. They are written here so V can adopt them **explicitly**, and so that
nothing in §4 has to pretend the pack already says them.*

| Rider | What it would add | Why it is not asserted | Nearest ruled analogue |
|---|---|---|---|
| **R5-a** | A consequence for **`VERSION_DRIFT`** beyond disclosure — a cap, a badge, or a refusal | **E-13's ruled trigger is newest-source age against `as_of`**, not per-source version identity. Extending E-13 to any edited source is an extension both reviewers named (Codex finding 4; Grok **SR-1**) | E-13's fast/slow branch; `STALE` (#10), which is **answer-scoped** and fires on DR-015's watched trigger |
| **R6-a** | **Splitting the two engine-side reasons — `COMPARE_EXECUTION_NOT_OK` and `COMPARE_RESULT_MISSING` — out of R6** into their own route, so an engine-side failure is never labelled with a source-side limit. Either reason alone, or both together | Moving **either or both** into one engine-side route makes the enum **nine**, and **DR-020 knob 7's count is V's**. The seat holds the merge (SP-4) and records the option rather than taking it | R6's reason field already separates the causes on the record |
| **R7/R8-a** | **Striking the failed span from the served text** and asserting **partial-answer survival** — *"one quote lost, never the answer"* | **S-9e rules eviction of an unreplayable component *number***; **Q40 rules a typed outcome**, not a text-surface remedy. Rev 1 asserted the extension; rev 2 does not | **S-9e** (§12.1c) and `MISSING-NUMBER` (#22) — the same shape, ruled for numbers |

**None of the three is needed for closure.** The partition, the disjointness and the
loudness floor all hold without them; they change **what a reader sees after** a
route fires, never **which** route fires.

**CARRIER-1 — a carrier, not a behaviour** *(new in rev 3; the one rider closure
does depend on)*

| | |
|---|---|
| **What it adds** | `evidence.citation_route_record.attempt_access_depth` — E-7's **existing** three values, written by **each attempt that opens something**, plus `opening_action_ref` and the **four `CHECK`s** at §3.2. **Rev 4 scoping:** the value is **`NULL` exactly on the rung-1 terminals R1 and R2**, where no opening occurred and no honest E-7 value exists, and **required on every row that descends to rung 2** |
| **Why it is owed** | **E-7 obliges the depth as a *required record* of an opening**, and **Q40 reopens the locators** — a second opening. `02-data-model.md` §11A.1 places the record on **`source_record`**, which is **per source**, so **two openings of one source cannot disagree**. That is the mirror of §6.1's own `action_scope` reasoning (*"a property of the **kind**, not of the row … two rows of one kind could disagree — a second authority for one fact"*), applied in the opposite direction |
| **Why it is not a mint** | **No new vocabulary and no new obligation** — E-7's three values, E-7's requirement, and `02-data-model.md` **§13 already inventories the vocabulary** with its `kernel` home and its `evidence.source_record` enforcement site. What moves is **where one opening's value is written**: a **placement** repair, not a rule V must make |
| **Who applies it** | The **`02-data-model.md` §11A.1 fold-in ticket**, with SP-9. **Not this ticket** — §11A.1 is V-accepted text |
| **What depends on it** | **Rung 2's totality for `OK` reopen attempts.** The other two cases (non-`OK` outcome; harvest attempt) are settled by ruled fields today. Without CARRIER-1 a reopen that succeeds at a **changed** depth has no representable value — and because the write is **required for any attempt that opens** (§3.2 `CHECK` 1), that is a **write-time failure, never a silent inheritance of `OPENED_FULL`** |

### 9.2 Rev 1 → rev 2 change log

| Finding | Verdict | Repair |
|---|---|---|
| **Codex 1** — rung 1 non-total | **Valid.** Rev 1's closure table and its leaf triggers disagreed, and the leaf triggers left *incomplete record + covering absence row* homeless | Rung 1 restated over **`P_ref` / `P_rec` / `P_abs`** with a full truth table (**§3.1**); R1 and R2's triggers rewritten to match it; §5.1 rung-1 row rewritten |
| **Codex 2** — later access loss escapes the obliged fields | **Valid, and the sharpest of the four.** Rev 1 tested a **historical** source-scoped depth; Grok's ADV-4 assumed the reopen state was carried without asking which field carries it | Rung 2 made **attempt-scoped** and bound to the access-depth / recheck action **A-2 already obliges**, with any non-`OK` typed outcome ⇒ `ACCESS_BLOCKED` (**§3.2**). **No new column** (AC-85/AC-88) and **no new route**. The harvest-success / reopen-failure sequence is re-run in §3.2 and §5.1 |
| **Codex 3** — R6's reason enum incomplete | **Valid.** `BLOCKED`, `REFUSED` and *never-executed* were unrepresentable | Reason domain rebuilt as a **four-member ordered split** whose fourth member **references** the ledger outcome instead of restating it — total by construction and immune to ledger-vocabulary growth (**§4 · R6**). SP-4 kept open; the split written out as rider **R6-a** |
| **Codex 4** — R5/R7/R8 invent serve consequences | **Valid, and independently corroborated by Grok SR-1** on the R5 half | R5 split into a **ruled E-13 limb** and a **disclosure-only drift limb**; R7/R8 reduced to **Q40's typed outcome + AC-90's honest zero-information value + S-19 digest visibility**; the `CITATION-WITHDRAWN` draft **renamed `CITATION-RECHECK-FAILED` and rewritten** so the mark's own text asserts no unratified remedy (**§7.2**); extensions exposed as riders **R5-a** and **R7/R8-a** |
| **Grok SR-2** — ran/probe claims | Carried as **SP-11** | Documentation question for the fold-in ticket; not a residue hole in E-8's domain |

**Unchanged by rev 2:** the eight names, the eight-route count, the rung order, the
no-generic-`OTHER` argument (§5.4), the boundary re-homes (§5.5), DR-088's hold
(§8), and the discipline that §12.3 remains V's to mint.

**Rev 2 → rev 3** — Codex's two residual findings, both on seams rev 2 had touched:

| Finding | Verdict | Repair |
|---|---|---|
| **Codex rev-2 · 1** — attempt-scoped `OK` access has no typed depth carrier | **Valid, and the claim was checked rather than defended.** `02-data-model.md` §6.1 declares `ledger_entry`'s columns and **none is a typed action result**; §6.2's `raw_artifact` is model-call shaped. So rev 2's *"the E-7 value that entry recorded"* had **no field behind it**, and Codex's teaser-reopen case (`OK` at `PREVIEW_ONLY`) would have descended instead of firing R4 | Rung 2 restated over **`attempt_access_depth`** — **recorded, E-7's own three values** (**§3.2**; scoped in rev 4). Two of its three cases are settled by **ruled** fields (non-`OK` outcome ⇒ `ACCESS_BLOCKED`; harvest attempt ⇒ `source_record`, `CHECK`-equal); the third — an **`OK` reopen at a changed depth** — is **CARRIER-1** (§9.1), argued as a **placement gap** using §6.1's own `action_scope` reasoning in mirror. Codex's case is traced in §3.2 and now lands in **R4**. §6's *"deliberately absent"* claim corrected |
| **Codex rev-2 · 2** — R6 omits `OK` execution with a missing result | **Valid.** The impossibility route was **considered and rejected**: DR-027 / S-19's record-before-math governs **model judgements**, a character comparison is a **machine** action, and nothing in the pack makes the ledger append and the result write atomic (**P4** points the other way for the case it does address) | **Fifth reason member `COMPARE_RESULT_MISSING`**, argued total as the **last leaf of four ordered booleans** and positively defined (§4 · R6). Its occurrence is **also** an S-19 completeness defect, chased by the completeness audit rather than by this enum. **Reasons are fields, not routes — the enum is still eight** |

**Unchanged by rev 3:** the eight names and the eight-route count, every serve
consequence and its authority, the §12.3 drafts, the rung order, §5.4, §5.5, §7,
§8, §10, and riders R5-a / R6-a / R7/R8-a.

**Rev 3 → rev 4** — Codex's final two, applied as directed:

| Finding | Verdict | Repair |
|---|---|---|
| **Codex rev-3 · 1** — `attempt_access_depth NOT NULL` cannot represent R1 or R2 | **Valid.** Both routes fire at **rung 1**, before any depth is read: R1 names no source, R2's record is missing or unresolvable. No E-7 member is honest there — `ACCESS_BLOCKED` would claim an opening was blocked when none was attempted — and the route rows' own recorded-field clauses never listed a depth, so the universal constraint contradicted them | Column **scoped, not dropped** (§3.2): `NULL` **exactly** on the rung-1 terminals, **required on every row that descends to rung 2**, under **four `CHECK`s** — null-ness matches the rung-1 terminals · depth may exist **only where an opening-kind action does** (A-2's kinds via `ledger_entry.action_kind`, a declared §6.1 column) · harvest equality with `source_record` · non-`OK` opening ⇒ `ACCESS_BLOCKED`. **Rung 1 restated as deciding before any depth read** (§3.1). **No-silent-inheritance preserved for every opening attempt**: an unrecorded reopen depth **fails the write** and never falls back to `OPENED_FULL`. §6 gains `opening_action_ref` so `CHECK` 2 is expressible; R2's `NULL`-even-after-a-physical-fetch case is argued explicitly |
| **Codex rev-3 · 2** — SP-8 and R6's merge text stale | **Valid, both.** The seat **re-read `02-data-model.md` §13 and §11A.1** rather than taking the correction on trust | **SP-8 withdrawn as RESOLVED**: §13 now carries the `access depth` row (three E-7 members, `kernel` home, `evidence.source_record` enforcement) and §11A.1 names the `access_depth` column and points at §13. The **inventory limb is closed**; only **CARRIER-1's placement limb** survives, and every SP-8 cross-link in §§3.2, 9.1, 9.2 and the rev-3 banner is retired to plain *placement* language. **R6's merge row now reads ①–⑤**, with ⑤ covered by the same shared-observable argument and rider **R6-a** priced over ④ and/or ⑤ |

**Unchanged by rev 4:** the eight names and the eight-route count, the five R6
reasons, every serve consequence and its authority, the §12.3 drafts, the rung
order, §5.4, §5.5, §7, §8, §10, and riders R5-a / R6-a / R7/R8-a.

---

## 10. What this document does not decide

- **Whether the eight are ratified.** DR-084 gives that to V, at **VG-02**.
- **Whether the two marks enter §12.3.** S-13 reserves the mint to V.
- **When a citation failure kills a claim.** The hard-kill gate is deferred by
  DR-020 knob 7 and confirmed unwritten by **DR-088**; its kill set is a later
  sitting's.
- **Fixture ids** for the eight firing demonstrations — `06-test-strategy.md`'s.
- **The DDL** for `citation_route_record` — S6's, per `09-traceability.md`'s
  `DM-1` slice-gating.
- **Register values.** None are proposed; the enum is a vocabulary, not a knob.
