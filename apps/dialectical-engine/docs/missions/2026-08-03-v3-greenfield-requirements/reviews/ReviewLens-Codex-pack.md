REVIEW LENS HANDOFF COMPLETE

# Codex pack-review — machine-executability / spec-precision

## Per-artifact verdicts

- `spec-pack/requirements-spec.md`: **LENS CHANGES REQUESTED**
- `spec-pack/carryover-manifest.md`: **LENS CHANGES REQUESTED**
- `spec-pack/ui-boundary-contract.md`: **LENS CHANGES REQUESTED**
- `spec-pack/quality-charter.md`: **LENS CHANGES REQUESTED**

## Pack verdict

**LENS CHANGES REQUESTED.** ARCHITECTURE cannot start without guessing. The pack repeatedly presents research-seat choices as binding requirements while its own registers still reserve those same choices for V; it also contains an unsatisfiable math property, conflicting stranger-test payloads, an unruled transport choice disguised as a stream law, and charter gates that substantially exceed the cited ruling.

The already-queued stale-race framing, absent `stage11Rollout` DR, Q27-label-vs-knob-8 issue, and choices contained only inside the pack's own `DRAFT — V RULES` registers are not re-reported here.

## Numbered findings

### 1. BLOCKER — the requirements spec decides its own open registers before V does

**Exact location:** `spec-pack/requirements-spec.md` §§16.1–16.6, §§17.1–17.8, and §23.A–B.

**Evidence:** The body uses mandatory `Requirement K-*` and `Requirement M-*` language to select answers which §23 simultaneously calls open V decisions. Non-exhaustive direct collisions:

| Binding body text | Register that says the same choice is open |
|---|---|
| K-1 requires a two-tier wall | OD-A-10 asks whether to adopt the wall |
| K-3 requires `model_version` + `as_of` | OD-A-17 asks whether those keys are required |
| K-11 permits external benchmarks only as displayed/tie-break facts | OD-A-16 asks whether they are displayable, barred, or numeric priors |
| K-25 G1 separates serving and panel lanes | OD-A-13 asks whether to separate those lanes |
| K-25 G2 requires logged propensities | OD-A-12 asks whether they are mandatory |
| K-25 G4 chooses minimum-n/overlap fallback behavior | OD-A-15 asks V to choose that behavior |
| K-25 G6 exempts the critic lane | OD-A-14 asks whether it is exempt |
| M-2 drops `as_of` and `policy_version` from identity | OD-M-01 asks whether to drop them |
| M-3 says a match never reduces work | OD-M-22 asks whether it may reduce work |
| M-6 permits embeddings as candidate generators | OD-M-04 asks permitted-or-barred |
| M-7 says `NULL` is never agreement | OD-M-06 asks whether it can be |
| M-9 requires link-never-merge | OD-M-07 asks link or merge |
| M-10 declares false merge the dominant error | OD-M-08 asks which error is dominant |
| M-11 requires negative disclosure | OD-M-19 asks whether it must be served |
| M-13 bars prior served prose from prompts | OD-M-10 asks whether it is barred |
| M-17 bars a prior verdict as evidence | OD-M-14 asks whether it is ever admissible |
| M-19 makes memory shape AIM | OD-M-16 asks whether it does |
| M-21 makes contradiction wake the prior | OD-M-13 asks whether push exists |
| M-25 requires inertness and firing proofs | OD-M-24 asks whether both, one, or neither are required |

These are not harmless recommendations: they are labeled requirements and are referenced by UI resource shapes. A builder cannot know whether to implement them, wait for rulings, or treat §23 as stale.

**Concrete fix:** For every K/M collision, do exactly one of: (a) add a FINAL DR that selects the body requirement and close/remove the OD row; or (b) demote the body text to an explicitly non-normative candidate and keep the OD row. Generate a mechanical check that no open OD question has a mandatory answer elsewhere in the pack.

### 2. BLOCKER — Q34 contains mutually exclusive normative instructions and over-closes DR-045

**Exact location:** `spec-pack/requirements-spec.md` §3.7 Q34, §8.1 A-3/A-7/A-8/A-9/A-11/A-12, and §23.A OD-A-01/05/06/07/09.

**Evidence:** A-8 faithfully repeats DR-045: on `UNINSTRUMENTED`, a model explains why, **grades the effort**, and suggests closure. A-9 then says model effort grading is “prohibited outright.” Both are mandatory. The same section also selects “never a scalar” (A-3), cap-and-label rather than halt (A-7), stance-blind prevention (A-11), and two mandatory fixtures (A-12), while OD-A-01, OD-A-05, OD-A-07, and OD-A-09 explicitly reserve those choices. DR-045 entails the machine diff, two stamps, blocking `UNINSTRUMENTED`, marked remediation, stricter re-verification, and bias logging; it does not entail all of those selected consequences.

**Concrete fix:** Make §8.1 contain only DR-045's ruled core. Delete A-9's prohibition or obtain a ruling superseding DR-045's effort-grade clause. Move A-3/A-7/A-11/A-12 to clearly non-binding candidates until their OD rows close, then make the §3 Q34 row cite only settled behavior.

### 3. HIGH — §3's row-closure table is not a ledger-entailing closure proof

**Exact location:** `spec-pack/requirements-spec.md` §3 and §24; authority compared to `wayfinder/decisions-ledger.md` DR-031, DR-036–DR-045.

**Evidence:** I spot-checked 24 rows (exceeding the required 15) against the DRs the spec says govern them:

| Rows checked | Governing DR | Result |
|---|---|---|
| Q1, Q3, Q7, Q9, Q10 | DR-037 | terminal routes/labels are supported; Q3's full three-member enum, Q7's “closed six,” and Q10's immutable baseline are not stated by the DR |
| Q12, Q13 | DR-036 | HYBRID/refusal powers are supported; the complete ignorance-ledger mapping and mandatory measurement class are not stated by the DR |
| Q22, Q39, Q45 | DR-040 | aligned with the ruling's explicit row-boundary contracts |
| Q26, Q29, Q31 | DR-041 | the redesign core is aligned; Q26's bidirectional-entailment re-split and Q31's fingerprint/uncertainty details exceed the DR text |
| Q30, Q48 | DR-042 | aligned with the ruling's explicit behavior |
| Q34 | DR-045 | ruled core aligned; §8 adds contradictory/unruled requirements (finding 2) |
| Q35, Q37 | DR-038 | aligned with the ruling's enforced-gate core |
| Q46, Q49, Q53, Q60 | DR-031 | DR-031 ratifies classifications and named stranger riders, but does not contain these rows' halt, feedback-loop, serving-block, or read-back contracts |
| Q50 | DR-043 | aligned with the three guards and human-only weights |
| Q51, Q54, Q55, Q61 | DR-044 | aligned at the ruling level, but Q61's detailed mechanism remains unruled as finding 1 shows |

The table calls each disposition “the final V ruling,” yet numerous substantive obligations are recoverable only by following research/ticket prose that the ledger's own authority model says is not authority. DR-031's phrase “become spec law as classified” cannot make the ledger machine-consumable because it neither embeds nor identifies an immutable version of each full row contract.

**Concrete fix:** Add an explicit DR column to every §3 row and make every requirement clause resolve to exact normative text in a DR (or to a content-addressed attachment incorporated by that DR). Split “classification ratified” from “full contract ratified.” Any clause not entailed by the authority record must be candidate text, not closure text.

### 4. HIGH — the carryover manifest makes open organ choices normative

**Exact location:** `spec-pack/carryover-manifest.md` §4.2(d), §4.2(f), §4.2(h), §4.4, §5.2(a), §6.3–6.4, and §12.4 OD-05/10/12/16/19/23.

**Evidence:** The “Exact behavior” sections already choose answers that the artifact's own open register leaves to V: no operator declaration emits no parent number (§4.2f vs OD-10); a cycle is a typed error and is rejected (§4.2d/§4.4/§6.4 vs OD-23's three choices); τ is capped by a way-of-knowing ceiling (§4.2h vs OD-12's ceiling-or-band choice); claim normalization is deterministic regex-only (§5.2a vs OD-16); and the arrow kind must include rebut/undercut (§6.3 vs OD-19's vocabulary decision). ARCHITECTURE cannot tell which “exact” contract survives the later ruling.

**Concrete fix:** In §§4–9, tag each paragraph as `RULED`, `CARRIED DESIGN`, or `CANDIDATE`. For every live OD, remove imperative/exact wording from the candidate branches and state a safe unresolved behavior. Once ruled, close the OD and promote exactly one branch.

### 5. HIGH — the manifest's required monotonicity property is mathematically false

**Exact location:** `spec-pack/carryover-manifest.md` §4.2(a–b), §4.5, and §12.2 layer 1.

**Evidence:** The pack requires property tests asserting that adding an attacker **strictly** lowers a target and adding a supporter **strictly** raises it. Under the published σ in §4.2(b), this is false at boundaries and for zero/saturated contributions: an attacked target with `τ=0` can remain 0; a supported target with `τ=1` can remain 1; an added arrow of strength 0 changes nothing; a duplicate collapsed by §4.4 changes nothing; and an already saturated aggregate may not change. A correct implementation must fail the stated tests or a test author must silently narrow the generator.

**Concrete fix:** Require non-increasing under effective added attack and non-decreasing under effective added support. State the exact preconditions for strictness (interior/non-saturated state, nonzero novel effective contribution, and any necessary branch conditions), and encode those preconditions in the property generators.

### 6. HIGH — the whole-graph stranger payload has different required fields across artifacts

**Exact location:** `spec-pack/requirements-spec.md` §3.12 R9 and §12; `spec-pack/carryover-manifest.md` §6.2 items 1–5; `spec-pack/ui-boundary-contract.md` §1.2 `Node`; `spec-pack/quality-charter.md` §2 A2.1–A2.4.

**Evidence:** Quality A2.4 says a restatement fails unless it contains four things: claim, certainty, what would change it, and **what to do differently**. Manifest §6.2 item 1 requires only claim, certainty, and what would change it; the UI `Node` requires only “a stranger-readable restatement of itself”; R9 says every node and verdict is individually restatable but does not define one canonical payload schema. Q1 owns the answer→action map, yet no cross-artifact rule says how an action is projected onto each node. A builder must guess whether every node carries an action consequence, only the verdict does, or the action is recoverable elsewhere.

**Concrete fix:** Define one canonical `stranger_restatement` contract with required fields and scope rules, cite it from all four artifacts, and state whether `action_consequence` is per-node, verdict-only, inherited, or explicitly not applicable.

### 7. HIGH — the UI contract silently chooses push-after-terminal while registering push-vs-pull as open

**Exact location:** `spec-pack/ui-boundary-contract.md` §1.3 E4, §4 row 4, and §5 W6.

**Evidence:** E4 is a contract-wide law: “The stream survives terminality.” Row 4 correctly says DR-015 mandates a correct badge but not the transport and asks V to choose push or pull. W6 nevertheless tells implementation to remove or re-scope the terminal gate. E4 has already selected push and made pull-only nonconforming before V answers the registered choice.

**Concrete fix:** Replace E4 with a transport-neutral freshness invariant: every answer read/subscribed after a wake must expose current staleness state. Keep push and pull as candidate architectures until ruled; only then specialize W6.

### 8. HIGH — the UI exposes the full composition fact bundle without authority or a disclosure boundary

**Exact location:** `spec-pack/ui-boundary-contract.md` §0 “Serve-composition,” §1.1, §1.2 `Fact bundle`, and §2 surface 2; compare `spec-pack/requirements-spec.md` §12.1–12.2 and DR-044.

**Evidence:** DR-044 requires the machine to assemble computed facts for the composition model, a second model to judge conformance, and machine enforcement. It does not require the browser to receive the complete prompt fact bundle, nor the conformance judge's full record. The UI contract infers that “the interface reads all three” and requires the complete fact bundle to travel in the primary answer read. That is a product/data-exposure decision with payload-size, privacy, prompt-leakage, and authorization consequences; it is outside the UI's `DRAFT—V RULES` cells and lacks spec provenance.

**Concrete fix:** Require only typed honesty projections and an authorized inspection/replay handle at requirements level. If full-bundle client exposure is intended, obtain a ruling and specify redaction, access control, size/pagination, versioning, and whether internal prompts/judge material are excluded.

### 9. HIGH — the Quality Charter invents binding acceptance machinery outside its V-rule register

**Exact location:** `spec-pack/quality-charter.md` §1 A1.2, §3 A3.2/A3.4–A3.6, §4 G1–G5 and A4.1–A4.5, §5 A5.1–A5.5; compare §7 VR-1–VR-4 and DR-047.

**Evidence:** DR-047 supplies five broad clauses. The charter silently promotes many author choices to acceptance law: a written judging set spanning the abstention matrix; write-time-only invariant enforcement; static reachability plus dynamic call coverage in CI; a never-called list shipped with every release; demonstrations on “real data” for every blocking/downgrading branch; and a three-change upgrade drill with no call-site edits. These may be useful proposals, but they are not entailed by DR-047 and are not in §7's V-rule register. The charter itself admits A1.3 is “this charter's proposal, not a ruling” in §8.8 while presenting it as an acceptance item.

**Concrete fix:** Put every derived gate and threshold into the V-rule register with an authority status, or add a V ruling adopting the full acceptance expansion. Until then, distinguish `CLAUSE`, `PROPOSED TEST`, and `RATIFIED ACCEPTANCE ITEM`; do not call proposals blocking gates.

## Refutations attempted

1. **“The open registers are merely reminders, while the body is the recommendation.”** Refuted by the registers' own words: the decisions “close at V's artifact review,” recommendations are “never authority,” and the body repeatedly says `Requirement`, `must`, `prohibited`, or `blocking`.
2. **“DR-031 ratifies every detailed row contract by reference.”** Not proven. The ledger ratifies row classifications, named riders, and coverage; it does not provide a content-addressed attachment or exact detailed contracts for Q46/Q49/Q53/Q60. Tickets are explicitly non-authoritative containers.
3. **“DR-044 implies the whole fact bundle must reach the browser.”** Refuted by the ruling's boundary: it governs composition input and conformance enforcement, not client disclosure. A replay/inspection handle satisfies honesty without exposing the entire bundle in the answer payload.
4. **“E4 is only one implementation example.”** Refuted by its placement under “Four laws on the stream” and its imperative “survives terminality,” while row 4 says push-vs-pull is a V choice.
5. **“Strict monotonicity is true for ordinary generated cases.”** Only after adding unstated generator restrictions. The current property quantifies without them and includes boundary/extreme scenarios elsewhere in §12.2.
6. **“The stranger test's action field is inferable from Q1.”** Q1 is answer-level and no artifact defines a deterministic per-node projection, so inference does not produce a machine-executable schema.
7. **“The charter may operationalize a broad V clause freely.”** Operationalization can propose tests, but choosing CI/release blocking, real-data evidence, exact audit outputs, and a three-change drill changes acceptance force and cost. The charter's own authority rule requires those choices to be ruled or marked proposals.

## Proof that flips this review

The pack flips to **LENS APPROVED** when all of the following evidence exists:

1. A machine-checkable authority map shows every mandatory K/M/A/organ/charter clause either entailed by exact FINAL DR text or explicitly non-normative; no open OD/VR question has a mandatory answer elsewhere.
2. Q34 has one internally consistent model boundary matching DR-045, and all unruled consequence/test choices remain candidates.
3. A regenerated §3 audit maps every row's full requirement—not only its label—to exact authoritative text; the 24 rows sampled above resolve without ticket/research inference.
4. Manifest “Exact behavior” no longer selects live OD branches, and the monotonicity properties include mathematically valid quantifiers and strictness preconditions.
5. All four artifacts cite one canonical stranger-restatement schema, including an explicit action-consequence scope.
6. The UI's terminal freshness rule is transport-neutral until V rules push/pull, and client-visible composition data has an authoritative disclosure/redaction boundary.
7. Every blocking Quality Charter gate is either explicitly adopted by V or visibly demoted to a proposed acceptance test.

