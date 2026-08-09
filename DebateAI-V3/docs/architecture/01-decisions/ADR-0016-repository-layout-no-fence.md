# ADR-0016 — Repository layout: kept UI as a plain in-repo package, no fence

| Field | Value |
|---|---|
| **Status** | **ACCEPTED — this ADR records a V ruling, it does not propose one.** The decision is **DR-068** (Q-01) + **DR-069** (Q-02), both **FINAL**, taken 2026-08-05 in the ARCH-V3-R1 question sitting. Accepted architecture under **DR-098 (VS-1)**; closure at **DR-100**. |
| **Date** | ruled 2026-08-05; recorded 2026-08-06 |
| **Authored by** | PROG-V3-R1 / ticket **PRE-04** (board `debateai-v3`, `t_c3538824`), under **DR-100**'s follow-through instruction (fold DR-068..DR-097 into the C4 documents). |
| **Source of record** | `docs/missions/2026-08-05-v3-architecture/decisions-ledger.md` — **DR-068**, **DR-069** (Theme A/B). Questions: `08-open-questions-for-V.md` **Q-01**, **Q-02**; Plan.md rev 3 §6.10 **AQ-2 / AQ-3**, **FLAG-4(a) / FLAG-4(b)**. |
| **Supersedes** | the plan's **SEAT-PROPOSAL** for Q-02 — *option (2), a separate workspace, separately checked out* (DR-069's own supersedes column). |

> **Numbering note.** **DR-068**'s affected-rows column reads *"ADR-0015 scope"*
> and **DR-069**'s reads *"ADR on the repo-layout decision"*. Both citations
> resolve **here, to ADR-0016**. The number **ADR-0015** was minted by
> **DR-099 amendment A-02** for a different subject — the deployment maker
> inventory — and that mint is the specific, individually-ruled one, so it keeps
> the number ([ADR-0015](ADR-0015-deployment-maker-inventory.md)). The
> resolution is recorded at
> [README §2](README.md#2-the-adr-0015-and-adr-0016-numbering-resolution).

## Context

Two questions blocked slice **S0**, and the second existed only under a "yes" to
the first:

- **Q-01 (AQ-2 · FLAG-4(a))** — *may kept UI component source be carried into
  `DebateAI-V3` at all?* The plan offered **no SEAT-PROPOSAL**: it recorded only
  that the permissive reading was available and was V's to confirm — **DR-048**
  keeps the components and UX, while **manifest §14**'s clean-room prohibition
  binds organ implementers and V2 **engine** code.
- **Q-02 (AQ-3 · FLAG-4(b))** — *what structural barrier keeps the organ
  implementers clean?* Smallest form: **(1) a separate repository, or (2) a
  separate workspace, separately checked out.** The plan's SEAT-PROPOSAL was
  **(2)**, and it named a third shape **only to exclude it**: an import-fenced
  package inside the repository fails FLAG-4(b)'s own test, because such a
  package sits in every implementer's working tree, editor index and agent
  context — *"a barrier that depends on an implementer not searching their own
  working tree is not a barrier"*.

The pack priced both branches for V before the sitting:

- **With a fence (1 or 2):** the **single-type-graph** orphan audit is **split**,
  and **AC-61**'s consumer direction then depends on the fenced interface
  emitting a **consumer manifest** that the engine's release build requires
  (Plan.md §2.6, §2.7) — a real mechanism, but one more moving part.
- **With no fence:** **DR-003 has no enforcement mechanism.** V2-derived source
  sits beside the organ packages, manifest §14 voids DR-003 *"regardless of
  intent"*, and clean-room compliance becomes an **honour system** — *which
  manifest §14 explicitly refuses*.

One further ruled fact bounds what DR-003 is still protecting. **DR-033**'s
nothing-must-match steer already killed the obligation to reproduce V2's
outputs: *"kept organs remain kept as DESIGNS (DR-003's clean-room
re-specification stands — what dies is only the obligation to reproduce V2's
outputs)"*. So what the fence would have protected is **design independence**,
not output equivalence.

## Options considered

| Option | Shape | Disposition |
|---|---|---|
| **A** | **Separate repository** — the kept interface lives outside `DebateAI-V3` | Not chosen. Ruled out by DR-069's "not a separate repository". Carries the full fence cost: split type graph + required consumer manifest. |
| **B** | **Separate workspace, separately checked out** — the plan's **SEAT-PROPOSAL** | **Superseded by DR-069.** Same fence cost as A with a weaker barrier; V declined it on the record. |
| **C** | **Import-fenced package inside the repository** | Excluded *by the plan itself* before the question was put: it does not satisfy FLAG-4(b)'s test (the package is in every working tree, editor index and agent context). Listed so that offering it does not invite an answer the plan's own analysis rules out. |
| **D** | **No fence — a plain, always-visible package beside the engine packages** | **CHOSEN BY V (DR-069).** The cost was priced first and accepted; see the verbatim record below. |

## Decision

### The ruling, verbatim

**DR-068** | 2026-08-05 | V-RULING | Q-01 | *Kept UI component source MAY be
carried into DebateAI-V3. Q-02 (the fence question) is live.* | conditions: —
| affected rows: *ADR-0015 scope; `07-build-order.md` §3.2/§4 S0;
`02-data-model.md`/`ADR-0005`'s reachability to the kept UI* | supersedes: —
| status: **FINAL**

**DR-069** | 2026-08-05 | V-RULING | Q-02 | ***NO FENCE.** The kept UI package
sits in DebateAI-V3 as a plain, always-visible package beside the engine
packages — not a separately-checked-out workspace, not a separate repository.
Chosen explicitly after the cost was priced: **DR-003's clean-room mandate has
no enforcement mechanism under this ruling** — compliance is an honour system,
not a checked barrier. The consumer-manifest mechanism (§2.6/§2.7's fence-cost)
is **not required**.* | conditions: ***Accepted trade-off, not a gap — do not
re-raise as an open question*** | affected rows: *`02-data-model.md` §2.6
layout, `03-module-design.md` dependency edges, `09-traceability.md` FLAG-4
cells, ADR on the repo-layout decision* | supersedes: *the plan's SEAT-PROPOSAL
(separate workspace)* | status: **FINAL**

### What the ruling fixes, clause by clause

**1. Kept UI component source is carried into `DebateAI-V3`.** Q-01 = **yes**
(DR-068). The kept-UI plan proceeds; the replacement UI-rebuild layout decision
that a "no" would have required is not triggered.

**2. The kept UI is a plain, always-visible package beside the engine
packages.** Not a separately-checked-out workspace. Not a separate repository.
Not an import-fenced package — there is **no fence of any kind**, so option C's
excluded shape is not reachable by another name either.

**3. DR-003's clean-room mandate has no enforcement mechanism under this
ruling.** Compliance is an **honour system, not a checked barrier**. Manifest
§14's role assignment — the reading rule, *"a single participant who reads V2
source and then writes V3's implementation has voided DR-003 regardless of
intent"* — remains the whole of the mandate, and it is now carried by discipline
alone. **This is stated here as a plain fact, not as a residual risk item.**

**4. The consumer-manifest mechanism is not required.** Plan.md §2.6/§2.7's
fence-cost mechanism is **voided**, and it is voided rather than made optional:
an optional manifest would be a generated artifact no build requires, which is
exactly charter **G5** dead cost — an orphan on the day it lands (ADR-0010;
AC-77).

**5. The single type graph is restored, and it is what decides AC-61.** With one
repository and one checkout there is **one type graph**, which is the property
**ADR-0001** relies on and which the fence would have split. **AC-61**'s
consumer direction is therefore decided by an **intra-repo static type-graph
pass** inside `tools/orphan-audit`'s G1 mechanism — no artifact crosses any
boundary, because there is no boundary (ADR-0010, as amended; routing resolved
at ticket **PRE-01**, board `debateai-v3` `t_e7632c8f`).

**6. Do not re-raise.** DR-069's conditions column is part of the ruling:
***accepted trade-off, not a gap — do not re-raise as an open question.*** A
reviewer who finds the missing clean-room barrier and files it as a defect is
re-opening a FINAL V ruling, not finding a gap. The place to record a *change of
mind* is a new V sitting, not a review finding.

## Consequences

**Accepted:**

- **One repository, one workspace, one checkout, one type graph.** ADR-0001's
  single-type-graph property is not merely un-split — it is the mechanism AC-61
  now runs on, and ADR-0001's "the property is not free" cost bullet is
  **discharged**.
- **One fewer moving part.** No generated cross-boundary manifest, no
  required-input clause on the release build, no drift between a pinned contract
  version and a manifest emitted against it.
- **The kept UI is always visible.** DR-095's *kept SURFACE, rebuilt insides*
  work (S14) happens in the same tree as the engine, with the same tooling, the
  same CI and the same orphan audit walking both sides.
- **The reachability edges to the kept UI are ordinary edges.** `03-module-design.md`'s
  dependency-edge table governs them exactly as it governs engine edges (`apps/*`
  are sinks; an absent edge is a prohibition), with no special-cased boundary.

**Costs, accepted on the record by V:**

- **DR-003 is unenforced.** There is no checked barrier between V2-derived source
  and the organ implementers. Manifest §14 *explicitly refuses* an honour system,
  and V overrode that refusal knowingly after the cost was priced. The exposure
  is real and is not mitigated by anything in this repository.
- **What is still protected is design independence, not output equivalence** —
  DR-033 already retired the must-match obligation, so the failure mode this
  trade-off admits is *V3 reproducing V2's design mistakes*, which is precisely
  what the D1–D5 defect map and the V3 rebuild exist to prevent by other means.
- **Structural rule 4's fence clause is void, not weakened.** Any CI rule, lint
  or review checklist that still asserts an engine/interface import fence is
  asserting a barrier the architecture does not have; it must be removed rather
  than left as a partial fence (a partial fence is the "reported against it"
  shape ADR-0010 rejects).

## Constraints served

| Constraint | Pack citation | Carried in this decision by |
|---|---|---|
| **DR-068 / Q-01** — may kept UI source be carried in | ledger DR-068; Plan.md §6.10 AQ-2, FLAG-4(a) | clause 1 — yes, verbatim |
| **DR-069 / Q-02** — what structural barrier | ledger DR-069; Plan.md §6.10 AQ-3, FLAG-4(b) | clauses 2–4 — none, verbatim, with the trade-off named |
| **DR-003 / AC-81** — clean-room carryover; the role split is binding | founding DR-003, DR-033; manifest §14 | clause 3 — the mandate stands, its enforcement does not |
| **AC-61** — bidirectional no-orphan | DR-047 clause 4; ui §1.4 L6, §1.3 E1 | clause 5 — the intra-repo static type-graph pass (ADR-0010) |
| **AC-59** — no adapter under the kept interface | DR-048; spec §12.6 | one `packages/contract` declaration consumed in one workspace |
| **AC-77 / charter G5** — no orphaned modules, no dead cost | DR-047 clause 4; charter §5, A4.2, VR-4 | clause 4 — the manifest is voided, not made optional |
| **AC-82** — greenfield, new repo | DR-031 knob 1; DR-065 | one greenfield repository holding engine and kept UI alike |
| **DR-095 / Q-26** — kept SURFACE, rebuilt insides | ledger DR-095 | the S14 rebuild happens in-tree |

## Documents that carry this ruling elsewhere

Listed so a reader can check the fold-in; **none of them is this ADR's to
write** (file contracts belong to the sibling PRE tickets).

| Document | What it carries | Ticket |
|---|---|---|
| `02-data-model.md` §2.6 | the package layout | PRE-02 |
| `03-module-design.md` | the dependency edges to the kept UI | PRE-02 |
| `07-build-order.md` §3.2 / §4 S0 | the S0 entry criterion, GPG-4, S14/S15 text | PRE-01 |
| `09-traceability.md` | the FLAG-4 cells | PRE-01 |
| `ADR-0001` | the discharged single-type-graph cost | this ticket |
| `ADR-0010` | the voided consumer manifest, replaced by the intra-repo pass | this ticket |
| `ADR-0005` | reachability to the kept UI (DR-068's affected row) | this ticket |

## Questions this ADR does not rule

**All 28 questions of `08-open-questions-for-V.md` are ruled** (DR-068..DR-097;
closure at **DR-100**). Q-01 and Q-02 are the two this ADR *records*, and both
are **FINAL**. Nothing here is pending.

- **What "kept component" means** is **Q-26**, ruled at **DR-095** — kept
  SURFACE, rebuilt insides, each altered component approved at its mockup review
  (DR-064). It decides what is rebuilt inside the package; this ADR decides
  where the package sits.
