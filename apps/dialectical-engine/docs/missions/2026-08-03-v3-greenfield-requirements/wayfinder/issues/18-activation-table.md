# 18 — Authoritative activation table

Type: research
Status: resolved
Blocked by: none

## Question

Derived from a SINGLE definition of "active": for each of the 62 battery
questions, under exactly which conditions does it fire (always / trigger /
policy-gated), reconciling the source plan's 43 `·A·` always-run markers with
the reports' type-cost estimates — the two currently contradict and no
artifact resolves them.

## Why

Coverage-matrix discrepancy D-8: the reports' own next-step #3 demands "one
authoritative activation graph derived from a single definition, replacing the
contradictory always-run markers and type estimates" — and no ticket owned it.
The spec's per-row dispositions (tickets 07/08) say WHAT each row is; this
table says WHEN it runs. Both are needed for the coverage proof.

## Inputs (read-only)

- ../../research/05-battery-coverage-matrix.md (the verified matrix)
- docs/missions/2026-08-02-battery-llm-vs-machine/reports/report-for-llm-agents.md
  (tri-state activation, cache/trigger tables)
- docs/missions/2026-08-02-battery-llm-vs-machine/upstream/human-plan.md
  (the `·A·` markers at source)

## Deliverable

`../../research/18-activation-table.md` — the single activation definition, the
per-question table (fire condition, trigger source, wait/inactive semantics),
and a reconciliation register listing every place the sources contradicted and
which reading won and why; marker `RESEARCH HANDOFF COMPLETE` at top.
Contradictions that require a V policy choice are flagged `V-DECISION` and
routed to the owning grilling ticket, never silently resolved.

## Answer

Resolved by Opus research seat — table at
[../../research/18-activation-table.md](../../research/18-activation-table.md).

Gist: single activation definition derived; per-row result — 3 always, 53
trigger (7 named sub-shapes; Q61 is the battery's only cross-run trigger), 6
policy-gated. 28 contradictions reconciled with reasons; 17 V-DECISION flags,
ALL routed to owning tickets (5→12, 3→11, 2→09, 2→14, 2→10, 2→15, rest→theme
tickets). Load-bearing: the 43 `·A·` markers are RETIRED as an activation
concept (the set is byte-identical to the plan's own "fires always" prose —
zero information; kept as provenance); the marker/estimate contradiction is
category error, not arithmetic (boolean vs per-type count vs 0..N loops); the
"13-question lookup" figure is irreproducible — minimal lookup activates ~35
rows; the tri-state has NO legal value for a policy-gated row → fourth state
POLICY_BLOCKED forced by the report's own "unresolved never means false";
NEW unregistered parameter found (Q8/R7 visible-fallback approval — halts the
whole run when blocked) → 19th knob, added to ticket
[12](12-human-rules-and-knobs.md); coverage proof needs TWO columns —
disposition (07/08 sittings) and runnability (this table).

## Comments
