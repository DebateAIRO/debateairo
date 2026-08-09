# PRE-02 — Codex review lens

Independent DR-101 review of ticket `t_427c1757`, limited to:

- `docs/architecture/02-data-model.md`
- `docs/architecture/03-module-design.md`
- `docs/architecture/04-api-contract.md`

Evidence boundary: ticket body and comments read through the worker's `READY FOR PEER REVIEW` marker at cursor `1786046466`; no later ticket comment and no Grok verdict or `reviews/pre-02-grok*` artifact was read. The three reviewed files were read directly because they are untracked. `06-test-strategy.md` was read only for the expressly requested FX-WIRE-02/03 consistency check.

## Findings

1. **DR-094 still leaves an unreachable third tier supplier and a live decision residue.** `02-data-model.md` lines 213, 344–346, 1950 and 1978–1986, plus lines 2124–2125 and 2196–2201, retain `tier_source.DERIVED`, the three-supplier fixture, and an owed "producer or removal" decision. `04-api-contract.md` lines 382–405, 837, 1252 and 1288 repeat it. DR-094 supplies exactly the asker declaration and a deployment-policy raise that may never lower; "provenance recorded and printed as designed" preserves the provenance mechanism, not an otherwise producerless authority. This is an AC-77 orphan and violates the ticket's zero-live-pending-residue requirement. Remove `DERIVED` and convert the round-trip fixture to the two ruled suppliers, or cite an applicable pre-handoff ruling that actually names its producer.

2. **The PRE-08 terminal-route correction was not folded in.** The pre-handoff orchestrator note says the stale "Home 3 known-incomplete at four" caveats are now false. The live founding table has five rows (`requirements-spec.md` lines 1396–1415), yet `02-data-model.md` lines 1290–1296, 1920–1933 and 2190 still call it incomplete and the correction still owed; `04-api-contract.md` lines 824 and 877–889 do the same. Restate these sections as resolved-at-five, close TRACE-7, and let membership/count tests assert against the current five-member Home 3 table.

3. **FX-WIRE-02/03 do not agree with the landed test roster.** `04-api-contract.md` lines 1258–1259 assigns FX-WIRE-02 only to S1 and FX-WIRE-03 only to S0. `06-test-strategy.md` lines 752–753 and 984–987 assign FX-WIRE-02 to S1 + S14 and FX-WIRE-03 to S0 + S13. Their asserted subjects also diverge: the roster adds register-default/max and read-side-effect limbs to FX-WIRE-02, and inspection/per-asker-memory ownership-scoping limbs to FX-WIRE-03, while `04` substitutes an authentication-error limb despite the roster's explicit no-authentication-strength scope. Reconcile the contract-side rows with the roster. The cross-lane check also exposes a provenance mismatch that must be routed to PRE-03: `04` and the ledger call executions pagination A-11, while `06` lines 752 and 986 call it A-12.

4. **`band_ceiling.basis` invents coupling to Q51 despite DR-082's independence ruling.** DR-082 says the ceiling is computed from the way-of-knowing distribution and is a second independent gate beside Q51; `02-data-model.md` lines 1243–1255 follows that rule. `04-api-contract.md` lines 761–778 instead adds the Q51 downgrade state to the ceiling basis and says the basis carries both. That is an uncited extra input and makes the two gates no longer structurally independent. Keep `band_ceiling.basis` to the ruled way-of-knowing distribution; record Q51's separate outcome on its own existing carrier.

5. **The settlement-watch credential cannot perform the full DR-089 job as documented.** `03-module-design.md` line 119 says `job:settlement-watch` records the outcome and re-derives calibration, and `02-data-model.md` line 426 requires a new `scorecard_cell` derivation version. But `03-module-design.md` lines 587–599 grants the job append rights only to `scorecard.answer_outcome` and `ledger_entry`. No right or separately owned execution path is named for materializing the new `scorecard_cell` version. Complete the least-privilege mechanism—either include the precise scorecard materialization authority or name the separate definer/owner that performs it—while preserving three-way credential separation.

## Checks that passed

- DR-074's undeclared-operator WITHHELD producer is removed from all three live contracts; AC-26's strict-and reason survives and the number-slot enum remains three members.
- The replay record reaches all five ruled Theme-C outcomes. DR-077's split is defensible: `propagation_run` records rule identity, `reduced_judgement` records selection + dispersion, and `node_strength_record.reduced_judgement_ref` makes the chain replay-walkable without duplicating a value.
- `composition_budget_tier`, `value_laden`, per-member `action_scope`, and `verification_trigger_basis` are placed on the requested carriers without adding a score input.
- DR-089 uses a `TERMINAL` progress-event kind whose value points to the existing `run.terminal` typed kind; it does not mint a new served typed-state vocabulary. The lifecycle surface remains derived-only rather than becoming a persisted column.
- DR-069's consumer-manifest mechanism is absent as an active mechanism, structural rule 4 is re-based on AC-59/AC-60, and row 24's `settlement` edge is argued through rule 6 with an acyclicity check.
- DR-076's lifecycle events have declared consumers, projection-grade payloads, and explicit E2 collision resolutions. The `node.spawned` S→P upgrade is additive and defensible.
- `claim_type` on `core.node` and the valuation schema split (`core` for run/graph objects, `ledger` for propagation-attached receipts) are reasoned, ownership-consistent repairs.
- Exact uppercase `CONDITIONAL` hits across the three reviewed files: zero. No invented numeric value was found.

CODEX REVIEW: CHANGES REQUESTED — 5 numbered findings

## Re-review — rev 3

Independent re-review of the rev-2 and rev-3 handoffs against the live PRE-02
artifact. Evidence used: this prior Codex review; ticket `t_427c1757` and the
explicitly named S09 ticket `t_c5e8ec5a` from the live Kanban store; and the
current `02-data-model.md`, `03-module-design.md`, and `04-api-contract.md`.
Comments were refreshed through cursor `82`; the Grok verdict marker at that
cursor was excluded from the evidence and judgment, and no
`reviews/pre-02-grok*` artifact was opened or consulted.

### Finding-by-finding disposition

1. **DERIVED — discharged under the requested owner + blocking-gate standard.**
   S09's live ticket body makes the reachability audit an entry obligation: if
   no production path produces `DERIVED`, the member must be removed or
   `FX-ORPH-02` blocks, and `FX-DB-07` is scoped to the reachable suppliers.
   That supplies the recorded owner, blocking gate, and fixture consequence;
   immediate deletion in PRE-02 is therefore not required. The document-side
   fixture half is also complete: `02` §3.7(c) lines 344–349 and `04` §16 row 2
   line 1290 say **reachable suppliers**, while `02` §13 lines 2017–2041 and
   §19 line 2256 plus `04` §5.1 lines 400–410 record the route to S09 and name
   `FX-ORPH-02` and `FX-DB-07`. No live three-supplier guarantee remains in
   these contract obligations.

2. **Terminal routes — discharged.** Spot checks pass at two independent sites:
   `02` §7.7 lines 1280–1310 sources the five routes to the now-complete spec
   §12.3 Home 3, lifts the fixture prohibition, and discharges TRACE-7; `04`
   §10.1 lines 903–923 gives the same present-tense-five source and retires the
   old order-of-authority workaround. `02` §13 and §19 are consistent with
   those checks.

3. **FX-WIRE-02/03 — discharged.** The canonical read rows and §16 rows 8–9
   carry `S1 + S14` and `S0 + S13`. `FX-WIRE-02` asserts register-default
   resolution, refusal rather than silent clamp above the maximum, and no
   write side effect (lines 1296 and 1312–1315). `FX-WIRE-03` asserts
   session-to-asker-to-answer ownership scoping and its provenance, explicitly
   not authentication strength, matching DR-070's provisional, credentials-
   out-of-scope ruling (lines 1297 and 1316–1322). The contract correctly uses
   A-11 for pagination and routes the erroneous A-12 citations to PRE-03, the
   owner of the affected external files (lines 1324–1330).

4. **`band_ceiling.basis` — discharged.** `02` §7.6 lines 1246–1257 and `04`
   §9.5 lines 768–802 both define the basis from the load-bearing nodes'
   way-of-knowing distribution alone. `04` records the wider Plan proposal as
   superseded and keeps Q51's outcomes on their separate existing carriers;
   there is no live Q51 input to `band_ceiling.basis`.

5. **Settlement-watch credential — discharged.** `03` §5.5.0 lines 587–615
   grants exactly the missing materialization authority: INSERT-only on a new
   `scorecard.scorecard_cell` derivation version, alongside the outcome and
   ledger appends, with no UPDATE or DELETE. The self-test, reaper, and
   settlement watch retain disjoint targets, and rule 6 leaves `settlement` as
   the single derivation definer while the scheduler remains only the execution
   host. `02` §3.9 line 429 matches the same insert/supersede-never-edit rule.

6. **SP-8 — discharged.** `02` §13 line 1988 contains exactly
   `OPENED_FULL`, `PREVIEW_ONLY`, and `ACCESS_BLOCKED`, enforced on
   `evidence.source_record`; the same row explicitly records primary versus
   secondary alongside access depth and forbids folding it into that enum.
   Section 11A.1 line 1672 carries the matching source-record shape and
   preview-only constraint.

Exact uppercase `CONDITIONAL` hits across the three reviewed architecture files:
zero. No architecture file was edited by this reviewer.

CODEX REVIEW (rev 3): APPROVED
