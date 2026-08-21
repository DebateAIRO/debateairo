# Plan review — independent Opus lens (ARCH-V3-R1 / G3)

Reviewer seat: `g3-reviewer`, Opus 5, independent. Artifact reviewed:
`docs/missions/2026-08-05-v3-architecture/architecture/Plan.md` (1107 lines).
Lens: red-team / pack-coherence. Sources spot-checked: the three research
digests and `docs/founding/{requirements-spec,carryover-manifest,ui-boundary-contract,quality-charter,decisions-ledger,GLOSSARY}.md`.
The parallel Codex review was **not** read.

```
LENS VERDICT: CHANGES REQUESTED
REWORK ROUND: 1 of 3
```

**Finding count:** 22 — **2 BLOCKER**, **14 MAJOR**, **6 MINOR**.

A note on what this review is not attacking. The constraint-base method (§1),
the ledger-wins ordering, FLAG-1/FLAG-2's dispositions, the polymorphic edge
table, Seam A's materialise→compute→persist answer to AM-11, Seam D's
frozen-facts/read-time-projections split, and the labeled-number/number-slot
types are all sound and survived every attack I constructed against them. The
findings below are where the plan breaks.

---

## BLOCKER findings

### O-1 · BLOCKER · The replay ceremony as designed cannot be independent

**Location:** §2.5 row "Replay ceremony"; §2.6 `apps/replay/`; §8 slice S1 gate
("replay ceremony passes **exactly** … (S1, VR-3)"); §7 doc 7.

**Breaking scenario / citation.** §2.5 claims `apps/replay` satisfies
"DR-063 VR-3 option (ii): a separate execution sharing no code path with the
serving run beyond the published arithmetic", and in the same row states
"It depends on `packages/propagation` and a read-only database reader — nothing
else." Those two sentences are mutually exclusive under the plan's own module
map. `packages/propagation` is defined in §2.6 as "the pure scoring engine
(AC-09/AC-14)" and is loaded, per §3.1 context 6 and §6.4 A-5, with V3-specific
structural rules that are *not* published arithmetic: M1's unjudged-interior
lifting and both-ends markers (AC-21), M2's per-parent operator selection and
resolution-level recording (AC-22), M3's provenance-cluster collapse — which
§6.4 A-5 explicitly places "**inside the pure core**" — and the graph
fingerprint. The published arithmetic is manifest §4.2(a)–(b): `agg` and `σ`.
Everything else in `propagation` is V3's own re-specification.

Failing sequence: a defect in the cluster-collapse absorption rule (or in the
lift-target predicate, or in the fold's arrow-order consumption) is present in
the single shared `propagation` package. The serving run computes a wrong
number; `apps/replay` recomputes the identically wrong number; the ceremony
reports byte-identical agreement and passes. Charter **S1** (`RATIFIED(DR-034,
DR-060b, DR-063 · VR-3)`) and spec §22.1's "Replay ceremony" launch gate are
both satisfied on paper and defeated in fact. VR-3 explicitly rejected option
(i), "the same code in a fresh process, which proves little"; the plan has
re-adopted option (i) while labelling it option (ii).

**Required modification.** Either (a) narrow `apps/replay`'s shared surface to
the published arithmetic only — a self-contained `agg`/`σ`/product
implementation inside `apps/replay`, with every V3-specific structural outcome
(lift targets and markers, cluster-collapse records per §6.4 A-5, the effective
operator and its resolution level, the recorded arrow order) read from the
frozen `propagation_run` / `node_strength_record` rows rather than recomputed —
and state that explicitly; or (b) escalate to V as a V-QUESTION whether
"the published arithmetic" in VR-3 means manifest §4.2(a)–(b) or the whole
re-specified engine, and record the ceremony's independence claim as
**unproven** until answered. Do not leave §2.5's two sentences standing
together. The C4 test-strategy document (§7 doc 7) owes an explicit
*isolation proof* artifact naming every symbol `apps/replay` shares with
`apps/api`/`apps/runner`.

---

### O-2 · BLOCKER · The citation hard-kill gate is planned to ship as code, against a RATIFIED row — and the plan contradicts itself about it

**Location:** §6.7 row "spec **D-4** citation hard-kill activation · **D-5**
coverage-as-gate"; §3.3 bullet 4; versus §8 slice S6 gate list.

**Breaking scenario / citation.** §6.7 disposes D-4 and D-5 as "staged
activation as **register-gated branches with named conditions**, each
exercisable in both states (charter G4) so nothing ships dark (AC-78)" — i.e.
the gate's code ships, dormant behind a register row. Charter §5.2's deferred
table is **RATIFIED(DR-020 knob 7)** and says the opposite in terms:
"The hard-kill gate does **not** ship until V3's character-level quote matcher
ships and validates; **it must not exist as code that cannot fire**." Charter
A4.4 is **BLOCKING(DR-063)**: deferred rows "carry a NOT-SHIPPED attestation
instead" of a firing fixture. Spec §22.1's "Deferred gates are not shipped
dark" row says the same. §8's own S6 slice then plans the opposite of §6.7:
"citation hard-kill **not shipped** with its NOT-SHIPPED attestation (charter
§5.2 deferred table)."

Failing sequence at S15: the acceptance bundle must contain, for the hard-kill
row, either a firing fixture (impossible — the quote matcher has not validated)
or a NOT-SHIPPED attestation (dishonest — §6.7's code is in the tree). A4.4 is
BLOCKING, so the release does not go out, and the attestation that would unblock
it would be false. Coverage-as-gate (D-5) has the same defect with a sharper
edge: charter §5.2 says it "ships as the diagnostic UNCOVERED-SCOPE note only",
and spec D-7 makes `coverage_passed` a *forbidden claim* until outcome data
exists — so a register-gated coverage **gate** in the tree is a claim-capable
branch that cannot legitimately fire.

Separately and independently: charter §9 contradiction 6 records this exact
question — "'Not shipped' versus 'auto-activating' … Whether auto-activation
counts as shipped-dark is **unruled**" — and the plan resolves it silently, in
one direction, in a DEFERRED-BY-DESIGN confirmation table whose stated purpose
is "confirmation only".

**Required modification.** Change §6.7's D-4/D-5 disposition to match §8 S6 and
charter §5.2: the eight typed citation failure **routes** ship (spec E-8, knob
13); the hard-kill **gate** does not ship and carries a NOT-SHIPPED attestation;
`UNCOVERED-SCOPE` ships as a diagnostic note and the coverage **gate** does not
ship. Then raise charter §9 item 6 as an explicit V-QUESTION in
`08-open-questions-for-V.md` ("does auto-activation count as shipped-dark?"),
because DR-020 knob 7's own auto-activation clause and charter §5.2's
not-shipped clause cannot both be honoured and only V can pick. §3.3's
"either … or" phrasing must be tightened so it cannot license the wrong branch.

---

## MAJOR findings

### O-3 · MAJOR · AC-11's completeness gate and AC-21's M1 cannot both hold, and "required node" is never defined

**Location:** §1.2 AC-11 and AC-21; §8 slice S1 gate ("completeness gate refuses
a partial aggregated run (AC-11)"); §7 doc 7.

**Breaking scenario.** AC-11: "before an aggregated run is persisted, **every
required node** must have ≥1 raw artifact; missing any ⇒ the job fails and no
aggregated run is written" (manifest §8.2f path D). AC-21/M1: an unjudged node
"emits no arrow and carries a typed record", and the run serves — that is
P-D1's whole premise and D1's repair. The plan places both in its ground-truth
table and never reconciles them, because "required" is undefined anywhere in the
pack or the plan. Take the S1 fixture and a real run in which one leaf's judge
call returned unparseable output three times and the node ends unjudged with a
typed abstention. Under the broad reading of "required" the completeness gate
fails the job and **no answer is written** — M1's served-with-a-typed-record
outcome becomes unreachable and P-D1's assertion ("each parent's value equals
the value computed from its judged children alone") has no run to assert
against. Under the narrow reading the gate never fires on any realistic run and
S1's fixture is unconstructible. Both readings break a named obligation.

**Required modification.** Define "required node" as an architecture term with
its predicate written out (recommended: a node for which a judgement was
*scheduled* under the running job and for which no raw artifact exists in any
state, parseable or not — which is exactly distinguishable from AC-13's
unconditionally-persisted unparseable artifact), state it in §1.2 alongside
AC-11, and state the M1 interaction: an unjudged node with ≥1 persisted raw
artifact satisfies the completeness gate and takes M1's path. Carry the
definition into `02-data-model.md` and `06-test-strategy.md`, and give S1 both
fixtures (gate fires on a genuinely missing artifact; gate does **not** fire on
an unparseable-but-persisted one) per AC-79.

### O-4 · MAJOR · The three-tier disclosure split puts raw judge tapes in the asker's tier by omission

**Location:** §5.2 "Three payload classes"; §5.3 `GET /v1/answers/{id}/inspection`
and `GET /v1/numbers/{provenanceRef}/replay`.

**Breaking scenario / citation.** §5.2's tier 2 (Authorized record, readable by
"the asker, in their own session's scope") is defined as "the complete fact
bundle, the conformance judge's full record, **the recomputation trail for any
served number**". Tier 3 (operator-only) is defined as "internal prompt
material" — and nothing else. AC-44 (plan's own text, from DR-027 / manifest
§8.3) says "**Two tiers: raw tapes internal, digest user-visible** … Raw judge
text never reaches a served item"; manifest §5.3 and §9.2b add "strip raw judge
output" and "scrub every served reason string for secret markers". The
recomputation trail for a served τ *is* the chain
`raw_artifact → reduced_judgement → node_strength_record`; §4.3 puts the raw
judge text and its provider metadata in `raw_artifact`. So under §5.2 as
written, an asker calling `/v1/numbers/{ref}/replay` is served raw judge tapes.
That is a straight violation of a RULED clause, and it is a *disclosure*
violation, which is the class that cannot be repaired after shipping.

**Required modification.** Add raw judge output (`raw_artifact.raw_text`,
provider metadata, request metadata) to tier 3 explicitly, and state what the
asker's replay trail contains instead: the frozen typed inputs, hashes,
reducer/contract/engine versions, the recorded arrow order, the cluster records
and the arithmetic — sufficient to recompute, containing no raw model text.
Carry organ 6's §9.2b sanitizing obligations into §3.1 context 7's invariant
column and into `04-api-contract.md`'s authorization tiers.

### O-5 · MAJOR · The plan states two mutually exclusive rules for the ordering key AC-08 depends on

**Location:** §3.2 Seam A; §4.1 standing rule 5; §6.2 AM-11.

**Breaking scenario / citation.** §3.2 Seam A: "The snapshot's arrow order is a
**total order over stable opaque identities**, recorded on the propagation run
so the left fold is reproducible bit-for-bit (AC-08…)". §6.2 AM-11 repeats it.
§4.1 standing rule: "Identity columns are opaque and never reused; **ordering
never depends on them.** | manifest §6.2, AC-08". These cannot both be true, and
AC-08 is DR-034's structural precondition ("the left fold is not bit-identical
under reordering in IEEE-754", manifest §4.2a). A stranger reading §4 will build
an ordering over `created_at_seq`; a stranger reading §3.2 will build one over
`edge_id`; the two produce different folds on the same graph, and manifest §8.2g
independently forbids carrying V2's "random-identifier fall-through" as an
ordering device — which an opaque-UUID sort is a direct instance of.

A second, related hole: AC-30's overlay-detachment byte-identity check requires
the detached recomputation to **reuse the overlay run's recorded arrow order**,
not derive a fresh one. Nothing in §3.2, §4.3 or §6 says so, and if the order is
re-derived the invariant can fail for a reason that is not overlay mutation.

**Required modification.** Pick one ordering rule, state it once, and delete the
other. Recommended: the order is a deterministic function of stable non-identity
content (e.g. `(target_kind, polarity, kind, source path, sibling ordinal)`),
with `created_at_seq` as the final tiebreak, **and** it is recorded on
`propagation_run` so replay never re-derives it. Then state explicitly that
every recomputation of an already-computed run (detachment check, replay
ceremony, leverage/fragility removal recomputations) consumes the recorded
order.

### O-6 · MAJOR · Organ 4 (decision→spawn) has no owning context, and its module home contradicts AC-17

**Location:** §3.1 context map (all 17 rows); §2.6 `battery/`; §4.3
`decision_record`.

**Breaking scenario / citation.** AC-17 is the FINAL organ↔stage table:
"spawn plumbing → **SPLIT mechanics**". §3.1 assigns SPLIT to context 3
(**Argumentation**, package `graph`), whose invariant column lists node
identity, lifecycles, materialized path, write-time enforcement, the arrow, the
cycle law and defeater completeness — and *not* AC-48. §2.6 instead homes
"decision->spawn plumbing" inside `battery`, whose declared context in §3.1 is
context 1 (**Framing**, stage ownership "LOCK, ROUTE — greenfield"). The result:
AC-48's invariants (pure function over typed signal bundles, fixed precedence,
categorical-only steering, the decision audit invariants, the replay identity
hash excluding idempotency key / spawn count / classification) appear in **no**
context's invariant column. §3.1 is the document that answers charter A3.6's
maintenance test ("name the single place where a behaviour is decided"), and for
one of the six FINAL organs it cannot.

The same table has a second, smaller ownership smear: §2.6 gives `battery` "the
71 row contracts … stage runners" spanning all eleven stages, while §3.1 scopes
`battery` to LOCK/ROUTE rows. A reader cannot tell whether an AIM row's contract
lives in `battery` or `evidence`.

**Required modification.** Add an explicit context for organ 4 — either as its
own supporting context or as a named sub-ownership under context 3 with AC-48
and AC-17 in its invariant column — and state the `battery`-vs-domain-package
layering rule in one sentence ("`battery` owns row contracts, activation state
and stage sequencing; the named domain package owns the row's substance"), then
correct §3.1 context 1's package cell accordingly.

### O-7 · MAJOR · §4 declares no run-scoped table, so six run-frozen obligations have no carrier

**Location:** §4 in full (schemas `core`, `ledger`, `serve`, `scorecard`,
`register`, `memory`); §6.2 AM-8, AM-9, AM-10; §6.7 D-14.

**Breaking scenario.** Every table in §4 references a run (`run_id`, "run ref",
"run/answer ref") and no table defines one. The following obligations are
therefore stated in §6's dispositions and stored nowhere:

- AC-50 / spec N-13 — the stranger sample rate **frozen at run start** (§6.2
  AM-8 asserts "Run-scoped frozen values (stranger sample rate, envelope basis)
  are pinned at run start"; no column exists).
- AC-49 — the run cost envelope, its basis (asker depth × risk tier) and its
  state `WITHIN | ENRICHMENT_SKIPPED | EXHAUSTED`. §4.4 puts "envelope state" on
  `answer`, but the envelope is a *run* object that must exist and be visible
  "before and during the run" (spec N-9), i.e. before any answer row exists.
- AC-74 — "every run pins one [`register_version`]" (§4.6); no column.
- AM-9 — `run.phase ∈ {EMPIRICAL, VALUE}` with a machine-enforced monotone
  transition (DR-053). §4.4 puts "phase for dual-act runs" on `answer`, which is
  the wrong grain: F-12's enforcement gate reads phase *during* the run.
- AM-10 / OQ-G9 — "Activation is persisted per `(run, row)` with a typed
  predicate", including `POLICY_BLOCKED`, which spec §1 forbids filing as
  INACTIVE. No table.
- §6.7 D-13/D-14 — "`battery_version` pinned per run". No column.
- AM-5 — risk tier, asker/caller scope, `as_of` from `POST /v1/asks`. No column.

Failing sequence for the sharpest one: a run enters AIM with Q18 in WAIT; the
runner restarts; on resume nothing in the database says which rows were WAIT
with which predicate, so the resumed run either re-fires rows the ledger already
recorded or files WAIT rows as INACTIVE — which spec §1 explicitly forbids and
which AC-04's "resumable" property requires be impossible.

**Required modification.** Add a `run` table and a `run_row_activation` table to
§4 with the columns above, and move `phase`, `envelope_*` and
`battery_version` off `answer` onto `run`, leaving `answer` to carry the
serve-time projection of them. State that both are written before the first
stage executes.

### O-8 · MAJOR · AC-24's surviving obligation — the serving-band rule — has no carrier anywhere in the plan

**Location:** §1.2 AC-24 and §1.4 FLAG-1; §3.1 context 7; §4.4 `answer`; §6.4
A-11.

**Breaking scenario / citation.** The plan correctly rules (FLAG-1, AC-24, A-11)
that OD-12 removes the numeric τ ceiling, and states that M4's obligation is
carried by "Q51's blocking machine gates — locator gate, provenance join,
reasoning-only downgrade … **plus the serving-band rule**" (manifest §4.2h,
`RULED — DR-044(Q51)`). The three Q51 gates are homed (context 7, "Q51 is the
sole never-disabled serving invariant"). The serving-band rule — the clause that
makes a way of knowing constrain the *served band* now that it may not constrain
τ — appears exactly twice in the plan, both times inside AC-24/A-11's own text,
and in no context's invariant column, no table, no endpoint, no slice and no C4
document. Charter VR-2's ruled design independently requires that "every band
names … **its way-of-knowing ceiling**".

Failing sequence: an answer whose load-bearing nodes are all
`way_of_knowing = REASONING` passes Q51's reasoning-only downgrade (it is served
as hypothesis-plus-research-plan), and then — with no serving-band rule
implemented — the band is computed purely from the register cut-point matrix and
can read SUPPORTED at the top confidence band. That is precisely the outcome
OD-12 removed the τ ceiling *on the understanding that the band rule would
carry*. By the plan's own §1 rule ("a constraint with no design element carrying
it is a gap"), AC-24 is a gap.

**Required modification.** Name the owner (context 7 `serve`), state the rule's
input (the per-node `way_of_knowing` distribution over load-bearing nodes) and
its output (a band ceiling label, register-supplied cut points, printed beside
the band per charter VR-2), give it a row in `04-api-contract.md` and
`05-register-skeleton.md`, and add it to S5's gate list. If the rule's *content*
is not in the pack at the precision needed, raise it as an eighteenth
V-QUESTION rather than leaving AC-24 uncarried.

### O-9 · MAJOR · The constraint base omits organ 6's serve preconditions, sanitizing, reconciliation and honest-degradation clauses — and with them an undisposed cross-artifact contradiction

**Location:** §1 in full (AC-51…AC-58 are the serve block); §3.1 context 7.

**Breaking scenario / citation.** §1 declares itself "the union of the three
digests' hard constraints" and "the plan's ground truth", with the rule that
"a design element that traces to none of them is unjustified". Manifest §9.2a–f
— the *ruled* behaviour of a FINAL kept organ — is absent from it in its
entirety:

- **§9.2a serve preconditions**: five distinct typed refusals (output not
  produced by the ledger; items not a list; any item failing validation; unknown
  status string; an item referencing a node outside the current set), each "a
  distinct typed reason".
- **§9.2b sanitizing**: re-validate, strip raw judge output, scrub secret
  markers, "drop rather than serve damaged", copy optional scalars only when
  well-typed. (This is the clause whose absence produces **O-4**.)
- **§9.2c coverage reconciliation**: drop non-current items, add typed pending /
  typed error entries, recompute — "**status is derived, never asserted**".
- **§9.2d stale-job expiry**: "Stale active jobs past deadline transition to
  failed with a typed reason **on every read**."
- **§9.2e honest-degradation vocabulary**: a missing input is read at its honest
  zero-information value; a verdict with no usable basis degrades to typed
  `unavailable`, never to a number; a lean with no live supporting or attacking
  node returns **nothing**, never a fabricated even split.
- **§9.2f suppression and shadow mode** (the plan touches this only obliquely at
  §6.3 U-2).

§9.2d additionally sits in direct contradiction with **AC-62** ("reads carry no
write side effects", ui §2 surface 14). The plan disposes the *fleet-status*
instance of that contradiction ("the stale-worker reaping side effect moves to a
scheduled job", §5.3) and never notices that the manifest imposes the same
write-on-read obligation on the serve layer itself. That is an undisposed
manifest-vs-UI-contract contradiction sitting on the serve path.

**Required modification.** Add AC rows for manifest §9.2a–f to §1.6, put them in
context 7's invariant column, and dispose the §9.2d × AC-62 contradiction
explicitly (recommended: the transition is performed by a scheduled reaper and
the read *derives* the failed status from the deadline without writing — which
satisfies "status is derived, never asserted" and AC-62 simultaneously; record
it as the ruling and cite it). Re-check §1's completeness against manifest §5.2
(organ 2's judge-contract clauses), several of which §3.1 context 4 carries with
no AC id — which by §1's own rule makes them unjustified design elements.

### O-10 · MAJOR · Slice S0 serves an answer with no composition and no conformance judge, and claims two gates of an ordered four-gate chain whose middle is missing

**Location:** §8 slice S0 (deliverable and gate list); §8 slice S5; §1.6 AC-51,
AC-52, AC-53; §1.5 AC-49.

**Breaking scenario / citation.** S0 delivers "…pure propagation → ledger rows →
**served answer** with per-node provenance, a `stranger_restatement`, and one
replayable number", and the serve pipeline (fact bundle → composition →
conformance → gate order → terminals) does not arrive until **S5**. AC-51 is
categorical: composition is four steps in order and "**Pure render was
rejected**" (DR-044). AC-49/charter S5 put serve-conformance in the protected
core that no budget may skip. So S0–S4 ship a serve path the pack forbids —
either an unchecked render or a components-only render, and components-only is a
*terminal* reachable by exactly three routes (AC-53, ui §4.0), none of which is
"the composition step is not built yet".

Worse for the gates: S0's gate list contains "Q51 locator gate blocks (§5.2 row
1)" and "R9 stranger block (row 3)". AC-52 makes the order law:
**R9 → Q53 → conformance → Q51**. A fixture demonstrating that Q51 blocks is not
a demonstration of charter §5.2 row 1 unless it blocks *in that position* — i.e.
after conformance has run and passed. With no conformance judge in the tree, the
S0 fixture demonstrates a gate in a chain that does not exist, and §8's own
sequencing rule (i) — "No slice ships a gate it has not shown firing in both
directions where the pack requires both" — is unsatisfiable as claimed.

**Required modification.** Either move the minimal composition+conformance pair
(one composition call, one conformance call, machine enforcement, the
components-only terminal) into S0 so the walking skeleton is a *legal* serve
path, or restate S0's deliverable as an explicitly non-serving harness (ledger +
replay + provenance, no served answer) and move all four serve-gate fixtures to
S5. State in §8 which slices may produce a served answer at all, and note that
until conformance exists no run is servable under AC-49.

### O-11 · MAJOR · AC-38's deployment-level multi-maker launch gate has no named component, no state and no acceptance-bundle item

**Location:** §1.4 AC-38; §3.2 Seam C; §3.1 context 16 `providers`; §6.6 UI-12;
§8 slices S8 and S15.

**Breaking scenario / citation.** DR-055 / charter S4 / spec §22.1 make
multi-maker a **launch gate at the deployment level**: "a deployment that cannot
execute multi-maker at standard+ **does not pass launch**", and degraded
single-maker mode is "**transient** provider-unavailability handling only …
never a legal standing configuration". §6.6 UI-12 restates this correctly and
then assigns the deployment half to nobody. `providers` owns "the one provider
interface … plus lane assignment and context isolation" — no capability
assertion. S8's gate is the per-run one ("multi-maker critique at standard+").
S15's launch bundle lists the never-called list, firing fixtures, NOT-SHIPPED
attestations, the replay ceremony and the register — no multi-maker deployment
attestation.

Failing sequence: a deployment is configured with a single provider. Every
standard-tier run finds no second lineage, takes DR-014's cap-and-label path,
and serves — legally, per UI-12's own reasoning — wearing `SINGLE-LINEAGE` /
`CRITIQUE-UNAVAILABLE`. Nothing anywhere counts these, distinguishes them from
transient outages, or refuses. The launch gate DR-055 exists to enforce is dead
code wearing a gate's clothes — charter G3's exact indictment — and the plan has
no mechanism that could ever fire it.

**Required modification.** Give the deployment gate a home: a
`providers`-owned, register-backed *maker inventory* assertion evaluated at
startup and recorded, plus a ledger-derived counter distinguishing transient
per-run unavailability (a provider error recorded on the attempt) from a
standing configuration (fewer than two distinct makers configured). Refuse to
accept a standard+ `POST /v1/asks` on a deployment that fails the assertion, and
add the attestation to S15's acceptance bundle. Add both fixtures to S8 (fires
on a one-maker deployment; does not fire on a two-maker deployment with one
transient outage).

### O-12 · MAJOR · The edge table's closed `strength_source` forecloses every non-inert answer to the plan's own A-1 question

**Location:** §4.2 `edge` shape and its constraints; §1.3 AC-19 and AC-27;
§6.4 A-1.

**Breaking scenario / citation.** §4.2 constrains
`strength_source ∈ {EVIDENCE_VERIFIER, CLUSTER_COLLAPSE}` and cites AC-27
(DR-062 OD-06: arrow strength "is **only ever** the output of a ruled
mechanism … No author, policy, model or configuration row may set it freely").
The same table requires `CHECK` that an `undercutting` edge has
`target_kind = EDGE` — DR-066(2) made structural. Now take the plan's own
recommended answer to A-1: "model it as a **reduction of the targeted edge's
transmitted contribution** inside the pure core, **recorded per edge**". A
recorded per-edge reduction is a magnitude, and it originates from neither the
evidence verifier nor cluster collapse — so it has no legal `strength_source`
value and the write fails under the plan's own loud-failure discipline. The only
representable undercut is `magnitude_status = UNKNOWN`, i.e. option (ii), which
the plan itself indicts as "a first-class relation that changes nothing —
charter clause 4's dead-weight shape".

So the schema ships in a state where DR-066(2)'s inherited requirement can be
satisfied structurally and can *only* be satisfied inertly — a ruled relation
that is dead by construction on day one, whichever way V rules A-1.

**Required modification.** Do not freeze `strength_source` to two members while
A-1 is open. Either add a third declared member reserved for the undercut
transmission rule (with a `CHECK` binding it to `kind = undercutting` and
`target_kind = EDGE`, so AC-27's closure is preserved for every other edge), or
carry the undercut's effect as a distinct recorded quantity on
`propagation_run` rather than as an edge `strength`, and say so. Either way,
state in §4.2 what the column will hold under each of A-1's answers, and add
A-1's blocking status to S2's entry criteria — the graph slice cannot freeze the
edge table before A-1 is answered.

### O-13 · MAJOR · The quality charter's own live contradiction list is never dispositioned

**Location:** §6 in full (§6.1–§6.8); §1.4 FLAG-1…FLAG-4.

**Breaking scenario / citation.** §6 claims that "Every GENUINELY-UNANSWERED
item and every ambiguity in the three digests carries **exactly one**
disposition" and §6.8 counts 56 items across the spec, manifest and UI digests.
The charter is a founding artifact of the same pack and carries **§9 —
"Contradictions (live list, never resolved here)"** with seven standing entries,
each re-verified 2026-08-05. Three are directly architecture-facing and none is
dispositioned:

- **§9 item 3** — clause 4's evidence base (dead checks) is excluded from the
  D1–D5 register by V's steer yet indicted by DR-047 clause 4 at code level.
  This decides whether `tools/orphan-audit` owes a dead-check detector at all,
  and whether P-D1…P-D5 or the charter is the acceptance authority for it.
- **§9 item 6** — "not shipped" versus "auto-activating". Silently resolved by
  §6.7's D-4 row (see **O-2**).
- **§9 item 7** — whether class (3), "a register row with no executable unit",
  is inside clause 4's reach at all. `packages/register` ships a skeleton of
  *keys with no values* (§4.6, §7 doc 6) — i.e. a table full of class-3 units.
  Under one reading every unfilled register key is an orphan entry on the
  BLOCKING never-called list at S15; under the other none is. The plan ships the
  skeleton without picking.

**Required modification.** Add §6.9, "Quality charter §9 — recorded
contradictions", disposing all seven on the same three-way scheme, and route
items 6 and 7 into `08-open-questions-for-V.md` as V-QUESTIONs. Item 7 in
particular must be answered before S15, because it determines whether the
never-called list — a BLOCKING artifact — is empty or contains every unratified
register key.

### O-14 · MAJOR · Replay eviction is modelled on the number and not on the composed text that recites it

**Location:** §1.2 AC-12; §4.4 `served_number` and `composed_text`; §8 slice S5
gate ("degraded-mode projections + replay eviction (row 12)").

**Breaking scenario / citation.** §4.4 gives `served_number` a status
discriminant `PRESENT | EVICTED(MISSING-NUMBER) | WITHHELD(reason)` and declares
`composed_text` "an ordered list of typed segments with stable ids … It is
display only (AC-63)." The composed text was written by the composition model
*from a bundle in which that number was present*, and it passed conformance
against that bundle (AC-51, AC-07 — the conformance verdict is a frozen input
artifact and is never regenerated). When the continuous replay self-test later
evicts that number (DR-059), the answer still serves with a DEFECT badge — and
the segment reciting the evicted figure still serves, because nothing links a
segment to the numbers it asserts.

The reader is then shown a number in prose with no origin and no replay handle,
which AC-63 states as an absolute ("**or it does not arrive**"); and the
conformance record still attests that segment as JUDGED against a fact that no
longer exists, which is AC-44's "no served sentence may imply a check the ledger
says did not run" read from the other end. Charter §5.2 row 12 is BLOCKING and
its fixture is unpassable as specified, because the row demands "the rest serves"
and the plan has no definition of what "the rest" excludes.

**Required modification.** Add a `segment → served_number` reference set to
§4.4's `composed_text` (the segment model already exists for DR-060a and DR-058;
this is one more edge on it), and state the eviction rule: on eviction, every
segment referencing the evicted number is suppressed and replaced by its
components-only projection, the answer wears DEFECT, and the conformance record's
per-segment state for suppressed segments is recorded as superseded rather than
silently retained. Add the fixture to S5 alongside charter §5.2 row 12.

### O-15 · MAJOR · The single-workspace layout makes manifest §14's binding clean-room split unenforceable, and FLAG-4 asks the wrong question

**Location:** §1.4 FLAG-4; §2.1; §2.6 repository layout (`apps/web`); §1.8
AC-81.

**Breaking scenario / citation.** AC-81 / manifest §14 is binding, not advisory:
"whoever implements V3's **organs** may read only the manifest, never V2 source
… The two roles must be held by different people or different agent seats. **A
single participant who reads V2 source and then writes V3's implementation has
voided DR-003 regardless of intent.**" §2.6 proposes one pnpm workspace in which
`apps/web` is "the kept Next.js UI; components/UX kept" — i.e. V2-derived source
— sitting beside `packages/propagation`, `packages/graph`, `packages/ledger`,
`packages/serve` and `packages/judgement`, the five organ packages. FLAG-4 asks
only whether *carrying* the kept UI source into V3 is inside the prohibition; it
never asks how the role split survives co-location.

Failing sequence, and it is the normal one: an implementer working slice S5
(`serve`) opens the repository, and V2's serve-adjacent client code — the
components that consumed V2's scoring payloads, plus whatever of `types.ts`'s
shape survives in the kept components — is in their working tree, in their
editor's search index, and in every automated agent's context window. DR-003 is
voided by the layout, not by anyone's intent. Note also that the pack's own
death list (ui §3.2) is an inventory of V2 source facts, which is why the
question is not academic.

**Required modification.** Restate FLAG-4 as two questions for V: (a) may kept UI
component source be carried into `DebateAI-V3` at all (the current FLAG-4), and
(b) **if yes, what structural barrier keeps the organ implementers clean** —
recommended: `apps/web` lands in a separate workspace/repository (or an
import-fenced, separately-checked-out package) with the wire contract as the
only shared artifact, which is what AC-59's "no adapter" actually requires (one
contract declaration, not one checkout). Record the consequence: under the
current §2.6 layout, DR-003 has no enforcement mechanism and clean-room
compliance becomes an honour system, which manifest §14 explicitly refuses.

### O-16 · MAJOR · The `condition_mark` shape cannot produce the per-node projection UI-9 claims it produces

**Location:** §4.4 `condition_mark`; §6.6 UI-9; §1.5 AC-49; §1.6 AC-58.

**Breaking scenario / citation.** §4.4 declares
`condition_mark = {mark, scope ∈ {answer, node}, subject_ref, reason,
lift_path?}`, "**Stored once at answer scope**; the per-node appearance is a
read-time projection filtered by subject". §6.6 UI-9 then claims this satisfies
DR-021 knob 10 "literally — two places on the payload — while there is exactly
one writable copy, so the two can never disagree and **no reconciliation rule is
needed**". The claim does not follow from the shape. Knob 10 and ui §4 row 8
require the answer-level list to be "echoed into **each affected node's**
provenance". An answer-scoped row carries one `subject_ref` — the answer — and
no affected-node set, so "filtered by subject" yields the empty set for every
node.

Failing sequence: an enrichment row is skipped under the envelope for a subtree
of eleven nodes; one `SKIPPED-BY-BUDGET` row is written at answer scope; the
node envelope (`GET /v1/answers/{id}/nodes/{nodeId}`, §5.3, "node-scoped marks")
returns none of them. Honesty surface 8 is served on the answer and absent on
exactly the nodes it describes — a served-but-unreachable honesty surface, which
is the D4 shape the pack exists to prevent, and a silent failure of a BLOCKING
charter §5.2 row 6 fixture if the fixture inspects the node.

**Required modification.** Give `condition_mark` an explicit `affected_node_ids`
(or an `condition_mark_node` join table populated at write time from the ledger
rows that caused the mark), state that the read-time projection is over that
set, and correct UI-9's disposition text — the reconciliation rule is not
"unnecessary", it is "the affected set is stored once and projected", which is a
different and weaker claim that the shape must actually carry.

---

## MINOR findings

### O-17 · MINOR · §6.8's blocking-status classification contradicts three of its own consequence texts

**Location:** §6.8 closing paragraph, versus §6.1 OQ-G10, §6.2 AM-12, §6.4 A-8.

§6.8 says "**Four** are launch-blocking if unanswered … The rest can be answered
while building." But OQ-G10's own consequence reads "an unnamed enum **blocks the
evidence subsystem**" (S6); AM-12's reads "a **confidentiality failure**, not a
modelling nicety" and is a precondition for AC-57's authorization tiers, AC-71's
per-asker partition and the `EXACT_QUESTION` tier (S13, and the tier-2 handle at
S0); A-8's answer is what makes S3's stated gate ("undeclared parent takes
DR-040's path, not a default", = P-D2) constructible at all. V reading §6.8 will
answer four questions and three slices will stall.

**Required modification.** Reclassify OQ-G10, AM-12 and A-8 as blocking, with
the blocking *slice* named per question in `08-open-questions-for-V.md`, and
replace §6.8's single "launch-blocking" flag with a per-question
"blocks-from-slice-Sn" field.

### O-18 · MINOR · The declared dependency graph is stated as CI-enforced and is 15/18 missing

**Location:** §2.6 ("Dependency direction is enforced in CI; **an edge not
listed here is a build failure**").

Explicit dependency edges are given for exactly three packages — `kernel` (zero
deps), `propagation` (kernel only), `contract` (kernel) — plus the two
structural rules. The other fifteen packages list none. Read literally, the
stated CI rule fails every build; read charitably, the rule has no content and
AC-85's "one behaviour, one place" cannot be audited against a graph that does
not exist.

**Required modification.** Either publish the full edge list in §2.6 or restate
the rule as "the edge list is declared in `03-module-design.md` and enforced in
CI" and remove the "not listed here" clause.

### O-19 · MINOR · The internal debug facet has no named caller, and G5 has no mechanism

**Location:** §2.6 `serve/`; §3.1 context 7 and §3.3; §5.2/§5.3; §2.7 "Orphan
detection"; §8 S5.

The debug facet is listed as a `serve` deliverable (§2.6, §3.1, S5) and appears
in no payload class in §5.2 and at no address in §5.3 — so on the day S5 lands
it is a shipped unit with no named entry point, i.e. a charter G1 orphan and an
entry on the BLOCKING never-called list. Manifest §9.3 says it is reached
"through the authorized inspection handle" and is "explicitly not part of the
stable wire contract", which is compatible with an unlisted address but not with
*no* address. Separately, §2.6 names `tools/orphan-audit` as
"reachability + never-called list + **dead-cost indictment**" and §2.7 describes
only the first two mechanisms; G5's dead-cost detection (a unit whose output no
served surface, no ledger row and no downstream decision consumes) and the
`measurement_lane` exemption are named nowhere.

**Required modification.** Name the debug facet's address (an operator-scoped
sub-resource of `/v1/answers/{id}/inspection`) in §5.2 tier 3 and §5.3, and
either describe G5's mechanism in §2.7 or state explicitly that G5 ships as a
reviewed manual audit under charter A4.1's advisory class.

### O-20 · MINOR · §5.5 declares E4 unsatisfied on the subscription path, which AC-64 binds

**Location:** §5.5 last bullet; §1.6 AC-64; §6.5 C6.

AC-64 / ui §1.3 E4: "every read of, **or subscription to**, an answer that
occurs after a wake-up must expose that answer's current staleness state." §5.5
answers "E4 is satisfied on the read path, **not the stream** … The stream is an
accelerator." A client holding an open subscription and no further reads — the
tab-left-open case the UI contract's cell 4(a) explicitly analyses — is a
conforming client under the plan's own SSE endpoint and is never told the answer
went STALE. DR-015's "never silently" is breached on a path the plan itself
ships.

**Required modification.** Restate as: E4's *correctness* obligation is
discharged on the read path; the stream additionally **must** carry the
`staleness trigger fired` honesty event for every subscribed answer, with a
declared consumer per E1. That is a one-line change and it closes the only
conforming-client gap.

### O-21 · MINOR · The arrow-identity unique index rejects where manifest §4.4 requires a collapse

**Location:** §4.2 `edge` constraints; §1.3 AC-35.

AC-35 states two distinct behaviours from manifest §4.4: "Duplicate identical
arrows **collapse**; one identity carrying two different strengths is a **loud
typed integrity error**." §4.2's partial unique index on
`(source_node_id, target_kind, coalesce(target_node_id, target_edge_id),
polarity)` cannot distinguish them — it rejects both, turning a legitimate
re-derivation of an identical arrow into a write failure.

**Required modification.** State the upsert semantics in §4.2: conflict on the
identity with an equal `(strength, magnitude_status, strength_source)` collapses
(no-op); conflict with any difference raises the typed integrity error. Both
cases get a fixture in S2.

### O-22 · MINOR · OQ-G2 and OQ-G9 fail closed in inconsistent kinds, and OQ-G2's recommendation knowingly bricks a BLOCKING fixture

**Location:** §6.1 OQ-G2 and OQ-G9.

OQ-G9's recommendation fails closed to `POLICY_BLOCKED` — a state spec §1
forbids filing as INACTIVE, so the gap is loud and cannot be mistaken for a
decision. OQ-G2's recommendation instead fails closed to a *silent default*
(`CORRECTNESS` for every row), and the plan states the consequence itself:
"charter §5.2 row 6's firing fixture is **unpassable**". Charter §5.2 row 6 is
BLOCKING(DR-063). Two analogous gaps, two different fail-closed idioms, one of
which disables a blocking gate.

**Required modification.** Align OQ-G2 with OQ-G9: model the classification as a
per-row contract field whose unset value is a distinct typed `UNCLASSIFIED`
state that (a) is treated as correctness at runtime and (b) is reported by the
acceptance bundle as an outstanding item, so the gap is loud rather than
absorbed — and state that charter §5.2 row 6's fixture is unconstructible until
at least one row is classified, as an explicit launch-readiness dependency in
`07-build-order.md`.

---

## Residual risks accepted under PASS

Not applicable — the verdict is CHANGES REQUESTED.

For the next round, the four findings whose resolution changes the shape of the
plan rather than its wording are **O-1** (ceremony independence), **O-7** (the
missing run entity), **O-12** (the edge table's frozen strength source) and
**O-15** (clean-room enforceability). The remaining eighteen are corrections
within the plan's existing structure.

---

*End of opus-plan-review.md — ARCH-V3-R1 / G3, 2026-08-05. Independent seat;
the parallel Codex lens review was not read. Read-only review: no other file was
edited.*
