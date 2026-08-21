LENS VERDICT: CHANGES REQUESTED

REWORK ROUND: 2 of 3

# Codex C4 re-review — machine executability / spec precision

Mission: ARCH-V3-R1 · stage H4 · reviewed set: `docs/architecture/`

The arithmetic, pre-S0, question-addressing, toolchain-key, ordering-owner and
open-question repairs are substantively sound. The set still cannot be frozen as
executable architecture, however, because the canonical fixture namespace, the
consolidated gap index, and several owner/carrier views describe mutually
different current systems. A fourth defect leaves newly required configuration
values outside the register inventory and would require an implementer to invent
keys. These are current normative contradictions, not documentation polish.

## Per-finding verification

| Prior finding | Verification | Current-state evidence |
|---|---|---|
| **H-C-1** — five terminal routes | **REPAIRED** | `00-overview.md` §4.1, `02-data-model.md` §§7.7/13, and `06-test-strategy.md` §6.2 / `FX-LG-04` all use the same five-member DR-037 list, including depth-zero, and explicitly forbid counting against the known-incomplete spec §12.3 table. The directed founding-pack correction is retained in `09-traceability.md` §8.1 as `TRACE-7 ≡ H-C-1`. |
| **H-C-2** — global pre-S0 gate and conditional Q-02 | **REPAIRED** | `07-build-order.md` §3.1 makes GPG-1…GPG-4 global S0 entry criteria: VS-1 steering, stack/ADR acceptance or replacement, accepted bootstrap mechanism and values, and identified contract/register versions. §3.2 and the S0 entry table make Q-02 live only when Q-01=yes and require a replacement UI-rebuild repository/layout decision when Q-01=no. |
| **H-C-3** — Q-nn addressing | **REPAIRED** | All fourteen ADRs and lanes 3–6 carry `Q-nn`; their mapping/“does not decide” sections retain Plan ids as provenance. `08-open-questions-for-V.md` contains exactly 28 `Q-nn` entry headings and no SI dossier. One non-blocking textual residue remains at `06-test-strategy.md` `FX-HR-H5`, where A-7 is not repeated as Q-18, but `06` §16 supplies the Q-18 mapping, so no behaviour is unaddressable. |
| **H-C-4** — canonical FX namespace joined to overview/build/traceability | **NOT REPAIRED** | Lane 6 now canonically splits `FX-LG-01a`/`01b` and mints `FX-REG-01`/`02` (`06` §§6, 9.9, 12, 15), but only `06` uses those exact ids. `00` §7.2, `07` §§4–5, and `09` §§1.2/7 still cite the retired `FX-LG-01`; neither `07` nor `09` contains either `FX-REG-*` id. This reopens the exact-address defect and leaves S0/S15 gates dark in the build-order authority. See H-C-11. |
| **H-C-5** — four toolchain keys, bootstrap path, bundle/register edge | **REPAIRED in the owning documents** | `05-register-skeleton.md` §§5.4/5.4a names four stable keys, `register.bootstrap.json`, one loader, equality enforcement, and the lockfile distinction; §5.6 updates the count to 51. `03-module-design.md` §3.1 row 27 chooses the read-only `register` edge, and `06` §9.9 provides `FX-REG-01/02`. The stale consolidated-index/build references are H-C-11/H-C-12, not an absence of the mechanism itself. |
| **H-C-6** — choose `answer_index` form | **PARTIALLY REPAIRED** | `02-data-model.md` §7.9 genuinely chooses a read-time view over authoritative rows and §16 places the keyset index on `serve.answer`. But `09-traceability.md` §5 still says its kind “view vs maintained table” remains lane 3's choice instead of recording the choice. The production owner is clear in `02`; the required traceability sync is not complete. See H-C-12. |
| **H-C-7** — first arrow-order derivation owner | **REPAIRED** | `03-module-design.md` §5.1 assigns the sole first production derivation to `graph.materialiseSnapshot`; `propagation` consumes and rejects malformed/non-total order, and only the property fixture independently derives it. `09` §8.2 closes `MOD-3` with the same citation. |
| **H-C-8** — A5.2 over nonnumeric ordering | **REPAIRED** | `05-register-skeleton.md` §§3.2a/5.6 treats extension to `orderingPolicy` as an explicit SEAT-PROPOSAL, excludes it from the A5.2-mandated count, and reports six governed numeric rows. `09` §8.2 closes `REG-4` on charter A5.2's word “number.” |
| **H-C-9** — SI-1/SI-2 scope expansion | **REPAIRED** | `08-open-questions-for-V.md` declares and contains exactly Q-01…Q-28; SI-1/SI-2 and the standing-items section are absent. |
| **H-C-10** — global gap ids and consolidated index | **NOT REPAIRED** | Global ids exist and every Codex-adjudicated row is represented, but `09` §8 is not a current, once-only 38-gap register: it omits `G2-5`, repeats `TRACE-8/9/10` in §§8.1 and 8.1a, and preserves pre-sync “no carrier” states contradicted by current `02`. Excluding the non-gap directed item `ADR-0015`, §8 contains 37 unique gap ids, not 38. See H-C-12. |

## Codex gap-table verification

| Set from the prior Codex review, as modified by the merge adjudication | Result in `09-traceability.md` §8 |
|---|---|
| **REAL:** `DM-1`, `DM-2`, `DM-3`, `DM-4` | **CARRIED** in §8.1. Lane 3 now proposes carriers in `02` §11A/§9.1, but §8 has not synced their current state. |
| **REAL:** `MOD-2 ≡ REG-5`, `API-1`, `BUILD-1`, `BUILD-2`, `TRACE-5`, `TRACE-7 ≡ H-C-1` | **CARRIED** in §8.1. Their owning-lane repairs exist; several rows still describe the pre-repair defect rather than “C4-resolved, FinalPlan amendment pending.” |
| Codex `TRACE-1` / `TRACE-2`, overturned by merge adjudication 1 | **CLOSED AS MISREAD** in §8.2 with exact `FX-SRV-10` / `FX-SRV-11` citations, as the merge addendum requires. |
| **MISREAD:** `DM-5`, `DM-6`, `MOD-1`, `MOD-3`, `API-2`, `API-3`, `REG-4`, `REG-6`, `TEST-1`, `BUILD-3`, `BUILD-4`, `TRACE-3`, `TRACE-4`, `TRACE-6` | **ALL PRESENT AND CITATION-CLOSED** in §8.2. `DM-5`'s cited lane authority is correct, although §5 fails to record the view that lane 3 actually chose. |

Thus the prior Codex REAL/MISREAD adjudication is not lost. The failure is the
consolidated index's completeness and current-state fidelity, not omission of a
Codex-adjudicated row.

## Named round-two content scan

| Reworked content | Result |
|---|---|
| `09` §§8/8.1a consolidated index | **FAIL** — 37 unique gap ids plus the separate `ADR-0015` directed item, not 38 gap ids; `G2-5` is absent; three rows are duplicated; lane-3 repair state is stale. |
| Five-terminal-route unification | **PASS** — one count, one membership list, correct higher-authority source, and a directed founding-table correction. |
| GPG-1…GPG-4 | **PASS** — global force and the Q-01/Q-02 branch are explicit. |
| Q-nn addressing | **PASS with one non-blocking residue** — stable addresses are present across the set; `06`'s `FX-HR-H5` should spell A-7 as Q-18 for consistency. |
| `07` FX sweep (106 literal ids) | **FAIL against the current roster** — the sweep freezes the retired unsplit replay id and does not consume `FX-REG-01/02`; exact S0/S1/S15 joins therefore disagree with `06`. |
| `apps/scheduler` and `FX-LG-01a/b` | **FAIL cross-sync** — `03` and `06` define the unit/limbs, while `00`, `07`, and `09` still describe the old deployment/fixture. |
| `FX-REG-01/02` | **PASS in `06`; FAIL as an architecture-set join** — neither build order nor traceability assigns the new ids. |
| Four toolchain keys + bootstrap | **PASS** — keys, bootstrap file, loader, equality rule, value authority, and lockfile boundary are explicit. |
| Fleet/session owners (`04` §4.3 vs `03` §4.4) | **PASS for those two surfaces** — fleet is `battery`'s projection and session is `apps/api`'s, with identity pending Q-03. Adjacent API reachability prose is stale; see H-C-13. |
| Lane-3 carriers (`02` §11A, §3.8, §5.6, §7.10, §7.11) | **PASS as FinalPlan-bound proposals in `02`; FAIL cross-sync** — the proposed homes are precise enough to carry the gaps, but `03`, `04`, and `09` repeatedly claim they do not exist. |

## New findings

### H-C-11 — MAJOR — the fixture namespace has forked after the replay split and register fixtures

- **File + location:** `00-overview.md` §7.2; `03-module-design.md` §5.5.0;
  `06-test-strategy.md` §§6, 9.9, 12, 15; `07-build-order.md` §§4–5;
  `09-traceability.md` §§1.2, 7.
- **Evidence:** `06` makes `FX-LG-01a` the scheduler-owned continuous limb and
  `FX-LG-01b` the independent launch ceremony, then adds `FX-REG-01/02`. `00`,
  `07`, and `09` still use only `FX-LG-01`; `03` §5.5.0 still says the split “is
  owed” after it has already happened. Neither `07` nor `09` contains either
  `FX-REG-*` id, although `06` assigns them to S0/S15 and declares an unassigned
  fixture a dark-gate defect. Automation cannot join the canonical roster to the
  build/trace rows, and S15 can be declared done without its register-read
  fixture.
- **Required modification:** Replace every normative unsplit replay-fixture
  reference with `01a` or `01b` according to its owner; add `FX-REG-01` to S0 and
  S15 and `FX-REG-02` to S15 (with its edge present from S0) in `07` and `09`;
  update `00`'s AC-06/07 spine; remove the stale future-tense instruction from
  `03`; then re-run the roster↔slice↔AC equality check.
- **OWNING LANES:** 1, 4, 7.

### H-C-12 — MAJOR — the consolidated gap index substitutes a directed item for a missing gap and reports stale carrier states

- **File + location:** `09-traceability.md` §§1, 2, 5, 8.1, 8.1a, 8.2; compare
  `01-decisions/README.md` §3 and `02-data-model.md` §§3.8, 5.6, 7.9–7.11,
  9.1, 11A, 19.
- **Evidence:** The lane-2 register contains `G2-1…G2-5`, but §8 carries only
  G2-1…G2-4; `G2-5` (withdrawn MISREAD) is missing. The resulting index has 37
  unique gap ids; `ADR-0015` is a directed item, not the missing 38th gap.
  `TRACE-8/9/10` then appear twice. More seriously, §1/§2/§8 still say there is
  no restatement, shadow, unavailable, composition-map or work-claim carrier,
  while current `02` names `semantic_restatement_flag`, `shadow_suppression`,
  `answer.verdict_unavailable`, `register.register_row`, and `work_item` as
  FinalPlan-bound proposals. §5 likewise leaves `answer_index` at “view vs
  maintained table” after `02` §7.9 chose the view.
- **Required modification:** Add `G2-5` to §8.2 with its closing citation; keep
  `ADR-0015` separately labelled as a directed item; make every gap id occur once;
  and update all master/reverse/gap rows to distinguish **carrier proposed in C4,
  FinalPlan acceptance pending** from **no carrier exists**. Record
  `answer_index` as the chosen read-time view.
- **OWNING LANE:** 1.

### H-C-13 — MAJOR — deployment and API dependency views contradict the current module/data-model authorities

- **File + location:** `00-overview.md` §3; `02-data-model.md` §3.8;
  `03-module-design.md` §§1.2, 3.1 row 21, 4.4, 13; `04-api-contract.md` §4.3
  and §18; `09-traceability.md` §8.1a.
- **Evidence:** `00` calls three executables “the whole deployment” and omits the
  new `apps/scheduler`, leaving an implementer to choose whether its two jobs are
  a fourth deployment or hidden inside another process. `04` says scorecards,
  feedback, and investigation execution are unreachable because
  `apps/api → settlement/critique` edges do not exist, while current `03` row 21
  contains both edges. `03`, `04`, and `09` also say MOD-4 has no table/addressable
  target after current `02` §3.8 proposed `core.work_item`. The fleet/session
  owner assignment itself agrees; the surrounding executable, edge, and carrier
  contracts do not.
- **Required modification:** Put `apps/scheduler` and its deployment/entry-point
  relation into `00`; sync `04`'s endpoint reachability to `03` row 21; and make
  `03`/`04`/`09` describe `work_item` as the current C4 proposed carrier whose
  FinalPlan acceptance is pending, not as an absent table. Preserve the one owner:
  `battery` owns the queue state, runner executes, scheduler reaps, fleet reads.
- **OWNING LANES:** 1, 4, 5.

### H-C-14 — MAJOR — new register-dependent controls have no rows in the canonical register inventory

- **File + location:** `04-api-contract.md` §0 lines 59–60, §4.2, §7.3;
  `06-test-strategy.md` `FX-HR-H8`; `05-register-skeleton.md` §§5.4–5.6.
- **Evidence:** `04` says the canonical key inventory is in `05`, then requires a
  polling interval plus maximum and default pagination limits as register rows.
  `06` additionally says the convergence epsilon and defaults are register rows.
  None appears in `05`'s exhaustive 51-key skeleton. The values may correctly
  remain `— none stated`, but the keys, types, scopes and consumers cannot remain
  unnamed: a builder must either invent them or put literals where AC-74 forbids
  them.
- **Required modification:** Add stable inventory rows for each required control
  (or explicitly consolidate them into named typed rows), with scope, consumer,
  `— none stated`, and updated counts; alternatively remove a row claim only if
  the behavior can be implemented without such a value. Carry any unresolved
  cross-lane choice into §8 under a unique gap id.
- **OWNING LANES:** 1, 4, 5, 6.

Four material findings remain. The final-round repair is mechanical once the
current owners are treated as authoritative: one fixture vocabulary, one current
gap index, one deployment/dependency view, and one exhaustive register inventory.

CODEX LENS COMPLETE
