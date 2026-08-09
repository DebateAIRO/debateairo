LENS VERDICT: CHANGES REQUESTED

REWORK ROUND: 3 of 3

# Codex C4 final verification — machine executability / spec precision

Mission: ARCH-V3-R1 · stage H4 · reviewed set: `docs/architecture/`

The round-2 repairs are substantially present, but the pack cannot be frozen
under the stated final-round law. The H-C-14 repair creates a new global gap,
`REG-8`, which is absent from the H-C-12 consolidated index, and the underlying
typed carrier still leaves its member shape to a later owner. That is a current
once-only-index violation and an implementation choice that would require
guessing, not a residual editorial risk.

## Per-finding verification

| Finding | Verification | Current-state evidence |
|---|---|---|
| **H-C-11** — fixture namespace | **REPAIRED** | Across `00-overview.md`, `03-module-design.md`, `06-test-strategy.md`, `07-build-order.md`, and `09-traceability.md`, the only bare `FX-LG-01` is `06` §15's explicit split-definition sentence; all normative uses select `FX-LG-01a` or `FX-LG-01b`. `FX-REG-01` is joined at S0 and S15 and `FX-REG-02` at S15 with its edge present from S0 in both `07` and `09`. `03` §5.5.0 describes the split in present/past-established terms and no longer says it is owed. |
| **H-C-12** — consolidated gap index and carrier state | **NOT REPAIRED** | The directed round-2 items landed: `G2-5` is present; the displayed §8 tables contain 38 rows; the prose correctly explains 37 unique gaps plus the separate `ADR-0015` directed item; the previously stale carrier entries now distinguish C4 proposals from FinalPlan acceptance; and `answer_index` is recorded as a read-time view. However, `05-register-skeleton.md` §§5.4b/7 now explicitly mint **`REG-8` as a REAL global gap** and say it is for lane 1's consolidated index, while `09` §8 still enumerates only `REG-4…REG-7` and contains no `REG-8` row. Therefore “every gap id occurs exactly once” and the stated 38-row completeness claim are false at the current state. |
| **H-C-13** — executable/dependency/carrier views | **REPAIRED** | `00` §3 names four executables and includes `apps/scheduler` with its two named jobs. `04` §4.3 marks settlement, feedback, and investigation endpoints reachable and cites `03` §3.1 row 21 for the `apps/api → settlement, critique` edges. `03`, `04`, and `09` consistently identify `core.work_item` as the C4-proposed carrier with FinalPlan acceptance pending; they do not present it as absent. |
| **H-C-14** — register-dependent controls | **NOT FULLY REPAIRED** | `05` §5.4 contains the five requested stable keys — `declaredPollInterval`, `paginationLimitMax`, `paginationLimitDefault`, `convergenceEpsilon`, and `convergenceStopDefaults` — and §5.6 updates §5.4 from 18 to 23 rows and the total from 51 to 56. `04` §§4.2/7.3 cite `05` §5.4, and `09` §5.1 records the polling/pagination and convergence control rows. The fifth row nevertheless says its members are not enumerated and §5.4b leaves whether it is one typed row or N keys open as REAL gap `REG-8`. The pack consequently supplies neither a closed declared type for that row nor the required consolidated-gap join; an implementer must wait for or guess the member shape. |
| **H-C-6 residue** — `answer_index` traceability | **REPAIRED** | `09` §5 records `serve.answer_index` as a read-time view, explicitly not a base table or materialized cache, and §8.2 closes `DM-5` as lane 3's chosen kind. This now agrees with `02` §7.9. |

## Required final correction

Resolve `REG-8` without invention: either freeze a declared type/member contract
for `convergenceStopDefaults` under the appropriate authority, or preserve the
choice as pending. In either case, add `REG-8` exactly once to `09` §8 and update
the index's identifier range, unique-gap arithmetic, and row total. If the
choice is resolved rather than carried, the row may be citation-closed; it may
not disappear from the global adjudication record.

## Residual risks

- The C4-proposed carriers remain subject to FinalPlan acceptance; their status
  is now accurately represented and is not itself a defect.
- Bootstrap and new control values remain V-owned at DR-023 and correctly ship
  as `— none stated`; implementation must not invent them.
- Once `REG-8` is joined and its carrier contract is made non-guessing, no other
  issue found in this directed verification would prevent a PASS.

CODEX LENS COMPLETE
