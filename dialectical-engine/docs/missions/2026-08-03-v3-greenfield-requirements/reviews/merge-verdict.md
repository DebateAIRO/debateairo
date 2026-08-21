# Orchestrator merge verdict — charting review (2026-08-03)

Merged by: Claude Fable 5 (orchestrator merge authority per V ruling, charting Q6).
Inputs: ReviewLens-Codex.md, ReviewLens-Grok.md, ReviewLens-Hermes.md — all three
LENS CHANGES REQUESTED.

Context the lenses could not see: they reviewed the charting snapshot (17
tickets, before research landed). Several findings were fixed by the map's
evolution during their run; those are marked FIXED-BY-EVOLUTION with evidence.

## Merged verdict: CHANGES REQUESTED — upheld. Repairs applied same-session by the charting owner (the orchestrator). Disposition of every finding below.

### Cross-lens agreements (all three lenses; strongest findings)

| Finding | Lenses | Disposition |
|---|---|---|
| Destination artifacts 1–2 (requirements spec, carryover manifest) have no authoring tickets; assembly unowned | Codex F1 / Grok F3 / Hermes F2+F3 | ACCEPTED-FIXED: new tickets 29 (author spec), 30 (author manifest), 31 (assembly + final gate); 15/16 remain owners of artifacts 4/3 and now name outputs |
| Packet fails its own stranger test (jargon, no glossary, unenumerated objects) | Hermes F1 (blocker), echoed by Codex F7 | ACCEPTED-FIXED: `wayfinder/GLOSSARY.md` created (plain-language terms, five abstention types enumerated, numbered defect register); map links it |
| No canonical decision ledger / closure gate for the 62+9 coverage law | Codex F2 / Hermes F8 | ADJUDICATED-ALTERNATIVE: decision-RECORD granularity instead of ticket-splitting — `wayfinder/decisions-ledger.md` (schema + DR rows); every sitting sub-decision gets a DR; ticket 29's deliverable includes the row-closure table seeded from the RT-05 matrix. Rationale: tickets are sitting containers, decisions are ledger rows; exactly-once closure enforced at ledger level |

### Grok findings

| # | Disposition |
|---|---|
| F1 composition unowned (blocker) | ACCEPTED-FIXED: new grilling ticket 28 — battery↔carryover composition; sequenced before authoring and theme tickets 21/25 |
| F2 activation graph (blocker) | FIXED-BY-EVOLUTION: ticket 18 + `research/18-activation-table.md` (3/53/6 split, POLICY_BLOCKED state, 17 V-DECISION flags routed); ticket 15 inputs now cite it |
| F3 assembly unowned (blocker) | ACCEPTED-FIXED (see agreements) |
| F4 organ-equivalence vs race layering | ACCEPTED-FIXED: two-layer separation written into ticket 15 |
| F5 race parity / cost observability | ACCEPTED-FIXED: parity-contract requirements added to ticket 15 |
| F6 harness = latent V2 mutation | ACCEPTED-FIXED: ticket 27 hardened to external observe-only with V escalation |
| F7 HumanPolicyState orphans | FIXED-BY-EVOLUTION + AMENDED: RT-05 re-homed 6 orphans into ticket 12; RT-18 added the 19th knob + budget-override; `graphMeasurementQuota`/`orderingPolicy` now named verbatim |
| F8 sequencing (policies before dependent sittings) | ACCEPTED-FIXED: sequencing law + frontier order in map Notes; 15 gains Blocked by 12 |
| F9 UI binding mode unasked | ACCEPTED-FIXED: binding-mode question added to ticket 16 |
| F10 process fog dodging | ACCEPTED-PARTIAL: 08-split rule already executed (19–25); chapter review cadence set (Notes: per-artifact lens review at 29/30/15/16 + one pack-level gate at 31) |
| F11 blitz-ineligible tickets | ACCEPTED-FIXED: 10, 15, 28 named blitz-ineligible |
| F12 Proposal B invariants unowned | ACCEPTED-FIXED: added to ticket 26 agenda |
| F13 control-arm identity | ACCEPTED-FIXED: added to ticket 15 (V names configuration in one sentence, frozen) |

### Codex findings

| # | Disposition |
|---|---|
| F1 producers missing (blocker) | ACCEPTED-FIXED (see agreements) |
| F2 coverage ledger + 08←05 edge (blocker) | ADJUDICATED (ledger, above); the 08←05 edge is MOOT — 08 split into 19–25 after both 05 and 06 resolved, bodies bind to both artifacts |
| F3 parameter orphans | FIXED-BY-EVOLUTION + AMENDED (see Grok F7) |
| F4 grilling not single-decision / no split protocol | ADJUDICATED-ALTERNATIVE: DR granularity + mandatory theme fanout already executed for 08; bundles 09–14 remain sitting containers whose sub-decisions each get DR rows. REJECTED-IN-PART: full ticket-per-subdecision explosion — cost without closure gain given the ledger |
| F5 R6–R9 conflicting paths | ACCEPTED-FIXED: ticket 12 now rules R6–R9 with terminal ACCEPT/AMEND/REJECT before 07/20 stamp rule rows (sequencing law) |
| F6 UI ledger/deps/option set | ACCEPTED-FIXED: 16 Blocked by 01,10,13; AS_IS/ADAPT/FLEX/DROP vocabulary (+V-only DROP, NOT_UI_EXPOSED); exhaustive ledger derived from 71 rows |
| F7 no durable decision contract | ACCEPTED-FIXED: decisions ledger schema is that contract |
| F8 prose scheduling edges | FIXED-BY-EVOLUTION (27 exists, wired 26) + FIXED (17 now Blocked by 29,30) |

### Hermes findings

| # | Disposition |
|---|---|
| F1 stranger test (blocker) | ACCEPTED-FIXED (glossary; see agreements) |
| F2 no route/index (blocker) | ACCEPTED-FIXED: full ticket index + frontier order added to map |
| F3 authoring unowned (blocker) | ACCEPTED-FIXED (see agreements) |
| F4 duplication/drift | ACCEPTED-PARTIAL: ownership law added (intake owns charting rulings; map indexes; on conflict intake wins); control-arm qualifier drift repaired. Full de-duplication deferred — recorded as accepted debt |
| F5 inventory arithmetic | ACCEPTED-FIXED: intake corrected (10 grilling, not 9) |
| F6 "four defects" contradiction (ticket 14) | ACCEPTED-FIXED: numbered defect register (GLOSSARY); ticket 14 re-worded — outcome-memory is an audit finding, not one of D1–D4 |
| F7 status/frontier semantics | ACCEPTED-FIXED: status vocabulary defined; 17 given real blockers; frontier published |
| F8 untraceable objects | ACCEPTED-FIXED: register numbers D1–D4; five abstention types enumerated in glossary; knobs named verbatim; 15 requires measurable definitions from the matrix's dimensions section |
| F9 FACT/RULING/PROPOSAL labels | ACCEPTED-FIXED: typed labels in ledger + index |

## Re-review disposition

Repairs are structural (no verdicts touched, no V decision pre-empted). Options
for V: (a) re-run all three lenses on the repaired charting now, or (b) fold
re-review into the already-scheduled lens gates on the spec-pack artifacts
(29/30/15/16 + pack gate 31), where every repaired structure gets exercised for
real. Orchestrator recommendation: (b) — the charting repairs are inputs to
those gates anyway. V's call.
