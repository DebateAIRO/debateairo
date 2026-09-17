# [claude@opus-5] F-CEREMONY-REPORT-DOD-FACTS · the ceremony's phase report prints none of the six flagship facts the algorithm computes

```yaml
state:
  ticket: F-CEREMONY-REPORT-DOD-FACTS
  risk_tier: medium
  status: done
  owner: { agent: claude, session: 2026-09-17-orchestrator }
  contract:
    allowed:
      - acceptance/** (a new reader module and its tests; run-acceptance.ts's report interface and print block; README.md's report paragraph)
    readonly: [packages/contract/src/index.ts, packages/serve/src/index.ts, packages/serve/src/synthesis.ts, apps/runner/src/index.ts, migrations/0057_t09_synthesis_round.sql, packages/db/src/schema.ts]
    forbidden: all_others
    human_review: no
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-17 by the orchestrator from the W12 closure audit
(`agent-reports/w12-closure-audit-2026-09-16.md` §2.3 and §6 step 1), on V's word the same day
("let's fix it as you suggested").

**The defect.** The Global definition of done's flagship bullet (`slices/S12-closure/SPEC.md:33-45`)
names nine facts a full multi-maker run must complete with. `LiveAcceptanceCeremony`
(`acceptance/run-acceptance.ts:97-133`) and the print block that follows it (`:364-385`) carry the
run id, answer id, the FAIR-01 graph counts and makers, the PRO-01 call count, the DISC-01 panel /
ceiling / probe triple, the T17 envelope state and the two lineages — sub-clauses 4 and 9, and half
of 2. Sub-clauses 1 (panel-reduced τ, non-self-graded), 3 (a root's final strength ≠ τ), 5 (the
synthesizer's statement acknowledging the strongest surviving objection), 6 (the evaluator loop
record ≤ 3 rounds), 7 (the code-derived three-state label) and 8 (the band counted over cited
nodes) are computed and persisted by the runner and the serve gate — `ledger.reduced_judgement`
with its `disagreement.panel` record, `ledger.node_strength_record`, `serve.synthesis_round`,
`serve.answer.verdict_state` / `confidence_band` / `band_ceiling`, the `SYNTHESIS-OBJECTION-STANDING`
mark — and never printed. The 2026-09-08 closing run therefore exited 0 with a log the judge
cannot issue the whole-goal verdict from, and a re-run against the unchanged report would buy the
same six absences for a credential and ~23 minutes. STRENGTH: entailed (the audit read every
closing artifact; the orchestrator read the interface and the print block on 2026-09-17).

**Charge.** Extend the ceremony so the report carries a typed block with the facts and prints one
stable line per absent sub-clause (plus the measured-edge count of sub-clause 2), read from the
same settled run the existing lines are read from; no debate content in any line (V-SEC-1's content
law reaches the ceremony log); a SHAPE violation refuses by a typed code, a DoD OUTCOME is reported
and never thrown — the judge decides. Plan: `docs/superpowers/plans/2026-09-17-ceremony-report-six-facts.md`.
Related: F27 (the report prints only after the FAIR-01 gate — the ORDER is untouched by this ticket;
F27 stays V's).

**Also found while filing (fixed in the records, 2026-09-17).** `packets/readiness-ask-2026-09-16.md`
carried no `--depth-params`, so its command would have settled at the ceremony's default depth 1
against the bullet's `depth≥2`; both command forms now carry `--depth-params '{"depth":2}'`.

**Outcome (2026-09-17, done at `9540cb9b`).** `acceptance/dod-facts.ts` derives, reads and renders the
facts; `LiveAcceptanceCeremony.definitionOfDone` carries them typed and frozen; the ceremony prints
seven fixed lines `DOD-1 panel-reduced-tau`, `DOD-2 measured-edges`, `DOD-3 root-final-vs-tau`,
`DOD-5 surviving-objection`, `DOD-6 evaluator-loop`, `DOD-7 verdict-label`, `DOD-8 confidence-band`
BELOW the last established line, so a refusal inside the reader costs its own lines and nothing else
(the blind review's one Critical, fixed in round 1). Documented in `acceptance/README.md`; 35 unit
cases; the dry-run ceremony proves the reader against independent SQL; six mutants die. Review:
spec PASS · quality APPROVED after one fix round. Gate: D74 ADDENDUM 1 (e). Eight commits
`9e57ae51..9540cb9b`. The live `M≥2, depth≥2` run is what witnesses sub-clauses 2 and 3 — the
fixture cannot — and it is the operator's (packet `readiness-ask-2026-09-16.md`).
