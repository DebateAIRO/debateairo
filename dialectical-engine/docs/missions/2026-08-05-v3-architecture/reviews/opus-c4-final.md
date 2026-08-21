# H4 final verification — independent Opus lens, C4 artifact set

Mission ARCH-V3-R1, stage H4 · 2026-08-05 · seat: **`h4-reviewer`** (same
independent Opus seat across all three rounds; never an author of any reviewed
file). Lens unchanged: **RED-TEAM / PACK-COHERENCE**.

**Independence law honoured.** `reviews/codex-c4-review.md` and
`logs/codex-c4-review.log` exist at the current file state and were **not
opened**, in this round or either earlier one. The only cross-lens input consumed
across the whole stage is `reviews/merge-verdict-c4.md` and its addendum — the
coordinator's routing.

**Scope of this round, as directed:** verification only — H-O-21; the two
PARTIALs (H-O-2, H-O-4) on their `04` side; H-O-20 / H-O-22 / H-O-23 / H-O-24 at
their owning-lane repairs; and one regression glance at H-O-1's design.

---

## LENS VERDICT: **PASS** (with residual risks) — REWORK ROUND: 3 of 3

**Tally across the stage: 24 findings raised (2 BLOCKER · 13 MAJOR · 9 MINOR) — 24 repaired, 0 outstanding.**
Round 1: H-O-1…H-O-19 (2 BLOCKER · 10 MAJOR · 7 MINOR).
Round 2: 17 repaired, 2 partial, +5 new (H-O-20…H-O-24: 3 MAJOR · 2 MINOR).
Round 3: **all 7 verified items repaired; the 2 PARTIALs closed; no new findings.**

**Nothing remaining enables a realistic failure against a pack obligation.** The
one genuine break I carried into round 3 — `04` §10's four-member terminal-route
enum against the kernel's five — is repaired at the level the finding asked for
and one level beyond it: `04` now carries a dedicated §10.1 that states the
authority chain, names the failure mode it was avoiding, and gives depth-zero an
explicit wire representation against spec F-4.

---

## 1. H-O-21 — the terminal-route wire enum

**REPAIRED.** Verified at three points, all of which had to be right for the
break to close:

| Check | Current file state |
|---|---|
| **Five members on the wire** | `04` §10, line 701: *"**terminal routes** \| **5 — imported by citation, never restated**: inert stop (Q1) · false-presupposition non-answer (Q3) · value→human (Q7, pure value acts only per DR-053) · `NOT_EMPIRICALLY_DECIDABLE` (Q9) · **depth-zero, no-justification-no-split (Q10)**"* — single source **DR-037**, with *"`spec §12.3` Home 3 is known-incomplete at four … the ledger wins, spec §2 item 1"* |
| **Depth-zero servable per spec F-4** | `04` **§10.1** (new): *"**Depth-zero has a wire representation, because a route with none would be a silence.** `spec` **F-4** requires each terminal route to be 'a **recorded, servable outcome**, never a silence' … a depth-zero run … serves as an Answer whose terminal route is that member, carrying its provenance like any other served outcome (AC-63), rather than as an empty graph, a missing field or an error"* |
| **`run.terminal` event repointed** | `04` §12.3, line 837: source column now reads **"DR-037's five-member list (§10, §10.1)"** — no longer `spec §12.3` Home 3 |

**Attacked, and it holds.** §10.1 reproduces the exact two-way failure I named —
*"the `require-exhaustive-switch` lint over the wire enum fails against `kernel`'s
fifth member, **or** the fifth member is silently dropped at the boundary"* — and
closes both. It also does the thing that mattered most for AC-65/S-13 discipline:
it **mints no new typed state** (*"the member is DR-037's, and this document
cites it"*) and scopes the Home-3 exception narrowly (*"known-incomplete for
**terminal routes only**; its abstention-kind and condition-mark memberships are
unaffected"*). The founding-table correction stays a **directed FinalPlan / V
item** (`TRACE-7 ≡ H-C-1`) rather than an edit a C4 lane made to the pack —
which is the correct boundary.

**Residual `"4 terminal routes"` strings swept:** three hits remain, at `06` §6.2
lines 347/354 and `02` §7.7 line 987. All three are **quotations of the defect
being corrected** (*"Plan.md AC-65 copies §12.3's '4 terminal routes'"*), not
declarations. Correct to keep.

---

## 2. The two PARTIALs, closed

### H-O-2 (round-1 BLOCKER) — **CLOSED**

`04` §4.3's Status cells are now positive and cite the repair by row number:

- `/v1/scorecards`, `POST /v1/nodes/{id}/feedback` → *"**reachable** — `03` §3.1
  **row 21** carries `apps/api → settlement` (added at C4 rework round 1 under
  H-O-2, with the acyclicity argument supplied)"*
- `POST /v1/investigations/{id}/executions` → *"**reachable** — `03` §3.1 **row
  21** carries `apps/api → critique` (same repair)"*
- `GET /v1/fleet` → *"**reachable**"*, `battery`-owned through the existing edge,
  with the carrier now **proposed** (`core.work_item`) rather than absent

No stale-edge text survives: `04` line 326 explicitly records that the cells
*"that read 'not reachable' in this document's first round are **reachable** as
of"* the repair.

### H-O-4 (round-1 MAJOR) — **CLOSED**

Five terminal routes now hold in **all six** documents that carry the count —
`00` §4.1/§13, `02` §7.7/§13, `03` §4.1, `04` §10/§10.1, `06` §6.2/`FX-LG-04`/§16,
and `09` §8.1 `TRACE-7`. `04` was the last holdout and is repaired. Re-verified
against source once more this round: `decisions-ledger.md` DR-037 (`V-RULING`,
FINAL) enumerates five including *"no-justification-no-split"*.

---

## 3. H-O-20, H-O-22, H-O-23, H-O-24

| # | Verdict | Evidence |
|---|---|---|
| **H-O-20** (MAJOR) | **REPAIRED** | `04` §4.3's three Status cells are positive (above); §18's **API-4** row now reads *"**both halves closed; carrier acceptance pending**"*, with owners resolved by `03` §4.4, edges by `03` §3.1 row 21, and *"§4.3's Status cells are synced"*. The remaining open item is correctly re-characterised as **"the carrier's acceptance, not its absence"** — `core.work_item` proposed at `02` §3.8, FinalPlan-pending (A-05), gap `MOD-4`. That is an honest downgrade, not a quiet close |
| **H-O-22** (MAJOR) | **REPAIRED** | Full-tree grep for `FX-LG-01` not followed by `a`/`b`: **1 hit**, at `06` §15 line 830 — *"`FX-LG-01` **splits into `FX-LG-01a` … and `FX-LG-01b`**"* — which is exactly the definition sentence the directive exempts. Round 2 found **17**. `00` §7.2, `03` §5.5.0, `07` §4/§5, `09` §1.2/§7 all now name the limb they meant; `07` §5's matrix A rows for the ceremony and the continuous self-test are distinguishable by id, which is what the split existed to achieve |
| **H-O-23** (MINOR) | **REPAIRED** | `03` §3.2's closing paragraph is rewritten from *"Recorded as a gap … The edge is **not added here**"* to **"Resolved, not left open"**, naming row 27, `05` §1.4's two rejected alternatives, `FX-REG-02`'s exercise assertion, and the Plan.md §2.6 amendment carried to FinalPlan. The self-contradiction with §3.1 row 27 and §13 MOD-2 is gone |
| **H-O-24** (MINOR) | **REPAIRED, and better than asked** | `03` §5.5.0 adds *"**`apps/scheduler`'s other job has its own scope, and it is not this one (H-O-24)**"*: `job:reaper` is **read-only on every schema except write on the work-claim rows** — `core.work_item`, schema `core`, not `serve`. The paragraph also states the failure I described (*"a deployer granting the one scope written down, under which the reaper cannot write and stale claims are never transitioned"*), preserves AC-89's guarantee (*"the read derives the failed status from `claim_deadline` without writing … so no reader is ever misled"*), and — beyond the finding — **classifies the residue as a dark gate under charter G3**, which is the correct indictment. Closing line: *"The two jobs share a process and **do not share a credential**."* |

---

## 4. Regression glance — H-O-1's design after the round-3 edits

**INTACT.** `03` §5.5.0's two-limb table is byte-for-byte the structure I verified
in round 2, and every load-bearing cell survives:

- **Owners** — continuous limb `apps/scheduler · job:replay-self-test`;
  ceremony `apps/replay`.
- **Recomputes with** — `propagation` for the continuous limb (*"a separate
  implementation here would be the **second scoring path AC-14 forbids**; sharing
  the engine is required, not tolerated"*); `published-arithmetic` only for the
  ceremony.
- **Writes** — continuous limb writes exactly two things **through `serve`'s
  eviction writer** under rule 6; ceremony **never** writes (*"a ceremony failure
  is a **failed launch gate**, not a write"*).
- **Independence** — still correctly scoped: *"not required by any ruling. VR-3's
  three limbs bind **the ceremony**; DR-034's continuous limb requires only no
  model in the path."* `FX-IND-03`'s read-only attestation is untouched.
- **Type home** — the snapshot and per-node record types remain declared in
  `kernel`, so `ledger` (which may not import `propagation`) can still hand a
  reconstructed snapshot to the engine.

The round-3 edits touched only the surrounding prose (the `job:reaper` credential
paragraph inserted after the table, and the §5.4 stale-expiry bullet now naming
`core.work_item` and its A-05 acceptance status). Nothing in the limb split moved.

---

## 5. Residual risks accepted under this PASS

Ordered by how much a human steering this should care. **None is a finding**;
each is a consequence the set states honestly and V should see.

- **R-1 · Five REAL gaps are data-model homes awaiting FinalPlan acceptance, not
  designs.** `DM-1`/`DM-2`/`DM-3`/`DM-4` and `MOD-4` are all *"lane 3 /
  FinalPlan"*. `02` §11A proposes carriers for four; **`MOD-4` (`core.work_item`)
  is the one a shipped fixture already points at** — `FX-SRV-10`'s write half and
  `GET /v1/fleet`'s projection both address it, and its acceptance is marked
  **A-05 pending**. It is the highest-value FinalPlan item in the set. **`DM-3`
  is the one with a ruled obligation and no proposed home at all**: manifest §5.2
  requires the claim-type → composition map *held as data, never a source
  literal*, and no table or register row carries it.
- **R-2 · `apps/scheduler` is an architecture-invented container.** `03` §1.2
  labels it *"a lane-4 SEAT-PROPOSAL — Plan.md names the obligations and names no
  unit"*. It is the right answer to H-O-1, and V should be shown that the unit
  that performs every replay eviction was minted at C4, not in the pack.
- **R-3 · The terminal-route correction is a founding-pack edit nobody has made
  yet.** The set builds five on DR-037's authority; `spec §12.3` Home 3 still
  lists four; S-13 says a typed state must be *placed* in that table. Until V
  places depth-zero (or states why it is not a Home-3 member), the kernel
  transcription is **correct-by-DR and unplaced-by-spec**. `09` §8.1 `TRACE-7`
  routes it; it is a V act, not a lane's.
- **R-4 · Structural rule 6's second half is review-enforced, not CI-enforced.**
  `03` §3.3 says so in terms: the import half is a graph assertion, the *"no
  re-implementation"* half is *"checked at review, not by CI"*. AC-85's strongest
  new guard is therefore a convention — honest, and probably unavoidable.
- **R-5 · 28 questions, 19 blocking at or before S6, plus four GPG gates before
  S0.** Unchanged and correctly recorded. It remains the single largest
  determinant of whether the build order is executable, and it is what a human
  should look at first.
- **R-6 · Two round-1 readings survive as seat readings of ruled text.** DR-066(1)'s
  *"full record"* is read as the **structured** `conformance_record` (`04` §2.2),
  and eviction **withdraws the whole composed text** (`02` §7.5 clause 3). Both
  are the fail-safe direction, both are stated in the open and priced for V, and
  both would be a tier change or a rendering change rather than a design change if
  V reads them differently.

---

*End of `opus-c4-final.md` — ARCH-V3-R1 / H4 round 3, independent Opus lens,
2026-08-05. **LENS VERDICT: PASS with residual risks.** All 24 findings raised
across three rounds are repaired at the current file state; six residual risks
are accepted and recorded above. This file is the lens's only output; no
reviewed file was modified in any round.*
