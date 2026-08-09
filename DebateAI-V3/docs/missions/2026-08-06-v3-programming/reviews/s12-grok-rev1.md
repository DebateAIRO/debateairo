GROK REVIEW: APPROVED

Gates:
1. vitest unit+integration+architecture: 273/273 GREEN (real embedded PostgreSQL; rework-2 vocabulary fix landed)
2. typecheck (`tsc --noEmit`): PASS
3. lint architecture: edgeRowsChecked=27, violations=[]
4. lint source: blocking=[]
5. S12 law surface: first-settled-wins+superseded loser (ADR-0017 case F) · scorecard INSERT-only derivation (P5/P6) · DR-089 third job+credential+TERMINAL gate · kernel/DDL action-kind parity (P12/P17) · attempt-ledger budget untouched · walker-derived s12Surface ATTACHED

Findings:
1. NON-BLOCKING — `deriveScorecardCell` always stamps population.{unsettled,permanentlyUnscoreable,abstained}=0 and only folds SCOREABLE accepted outcomes; PERMANENTLY_UNSCOREABLE accepted settlements write no scorecard_cell, so AC-42's population carrier is incomplete until a later fold includes non-scoreable accepted outcomes.
2. NON-BLOCKING — Scorecard `derivation_version` allocation is not serialized across answer identities (advisory lock is answer-scoped only). Concurrent multi-answer settles for the same model cell can unique-fail and roll back a legitimate accepted outcome; single sequential watch is safe.
3. NON-BLOCKING — `debateai_settlement_watch` lacks SELECT on `core.run`, `serve.answer`, and `ledger.ledger_entry` (schema `serve` USAGE absent). Production INSERT+TERMINAL path succeeds under SET ROLE (FK checks as table owner); inventory is incomplete for diagnostics/replay under that principal.
4. NON-BLOCKING — Scorecard→judge `effectiveWeight`→served selection is not composition-wired end-to-end; FX-S22-03 proves cell basis/value movement and FX-PT-D5 proves selection-target movement separately (DR-077 pieces, not one composed path).
5. NON-BLOCKING — `runSettlementWatch` is a push/envelope consumer (default `outcomes=[]` no-ops); resolver ingress adapter is an explicit seam, not a poller. DR-089 limbs (published job, separate credential, TERMINAL refuse, ledger append, derivation version) are otherwise met.
6. NON-BLOCKING — Routing guard trail always records G2/G3/G7/G8 as PASS; G7 is throw-before-trail, G8 is structural (no expected-answer input). Functional enforcement holds; trail is not a full per-guard outcome ledger for every member.
