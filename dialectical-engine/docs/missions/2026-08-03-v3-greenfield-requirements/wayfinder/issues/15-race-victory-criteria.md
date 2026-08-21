# 15 — Race victory criteria + promotion bar

Type: grilling
Status: resolved
Blocked by: 05, 12

## Answer

V ruled (2026-08-04): **DR-047** — the race is RETIRED (V2 is a prototype,
not a competitor). This ticket's deliverable transforms into the V3 QUALITY
CHARTER (five clauses: best-to-date on outputs; stranger-law acceptance;
clean codebase; no orphaned modules — dead code indicted; research-
upgradeable). Verdict bands and the disagreement-flag fire bar become charter
acceptance items at spec authoring (ticket 29/31).

## Question

On which measures, over which question mix, at what matched cost must V3 beat
the frozen V2 engine — and what does victory BUY it (the promotion bar: does V3
serve users only after winning, or serve in parallel while evidence
accumulates)? Criteria are written and FROZEN before the first run — that was
the point of the control-arm design.

## Inputs

Measures inventory from the coverage matrix
([05](05-battery-coverage-matrix.md)): tokens, retrieval bytes, activated rows,
failures, latency, retained substance — plus whatever V adds (e.g.
stranger-test pass rate). Also settles Hermes's production-validation bar and
Grok's "is the full outcome stage required on day one" seat question.

## Additional requirements (orchestrator merge of the three lenses, 2026-08-03)

- **Two-layer separation (Grok F4):** the organ golden-vector suite
  (MUST-MATCH kept behaviors / MUST-DIFFER on D1–D4) and the end-to-end race
  suite are SEPARATE. Layer A never implies end-to-end identity with V2;
  layer B never requires matching indicted or battery-new behavior.
- **Parity contract (Grok F5):** requirements-level comparability — same
  frozen question set; same external tools/cutoffs; cost dimensions V2 can
  emit WITHOUT code change (V2 is never instrumented); the rule when one
  engine lacks a meter the other has; who feeds both engines the shared input
  package.
- **Control-arm identity (Grok F13):** V names the control-arm configuration
  in one sentence (V2 production behavior as-is, per ticket 26's flag-baseline
  ruling), frozen — never shifted after criteria freeze.
- **Measurable definitions (Hermes F8):** every victory measure adopts an
  observable definition from the matrix's §Measurement dimensions (or gets a
  prerequisite defining it) — "retained substance" is not a criterion until it
  is measurable. Stranger-test pass-rate measures inherit ticket 12's
  coverage ruling (hence Blocked by: 12). "Activated rows" uses the
  activation table (`research/18-activation-table.md`).

## Settles

SUPERSEDED BY DR-047: destination artifact #4 is the V3 Quality Charter
(`../../spec-pack/quality-charter.md`). This ticket's original race premise is
retired; see the Answer above.

## Comments
