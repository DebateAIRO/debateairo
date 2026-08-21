# 26 — Carryover scope confirmations (from behavior extraction)

Type: grilling
Status: resolved
Blocked by: none

## Answer

V ruled (sitting #1, 2026-08-04), DR-022..029: Model B kept as behavior
source; V3 flags drawn fresh + V-ratified; POSTGRES imposed as stack
constraint incl. observability (supersedes DR-005 in part); no DB backup —
scratch start, recorder is sole vector source; V2 baseline = as-shipped
production; D1 = ALL FOUR fallback variants die; D5 INDICTED (constant judge
weights); trusted-run ratified WITH V's execution-ledger extension; all eight
house rules carried. Full text in
[../decisions-ledger.md](../decisions-ledger.md). Ticket 27 unblocks
(execution gate still applies).

## Question

Three V-confirmations the behavior extraction
([02](02-scoring-behavior-extraction.md)) surfaced, none owned by an existing
ticket:

1. **Trusted-run mapping (U1):** "trusted-run reconstruction" is not a named
   V2 artifact — the seat mapped the phrase to the mechanism "every served
   score re-derivable from durable raw judge artifacts keyed by input hash +
   contract hash, with an artifact-completeness gate". Does V confirm that
   mapping as what the preservation steer meant?
2. **Model B fate (U3):** V2 contains a SECOND, edge-weighted DF-QuAD
   implementation on the in-memory-only `/api/qbaf` path (RT-04's "Model B" —
   real weighted edges, never persisted, never served to the UI). Is it part
   of the kept scoring machinery the V3 spec re-specifies, or is it out?
   (Note: it is the only V2 model with first-class edges — the shape the
   battery's defeater graph wants.)
3. **Flag baseline (U5/U4):** six scoring-relevant flags default OFF in
   production (including a disagreement gate the repo itself records as
   mathematically un-fireable), and the debug view excludes failed nodes while
   production includes them. Which configuration DEFINES "V2's behavior" for
   (a) the clean-room behavioral spec, (b) the golden vectors
   ([03](03-golden-vector-plan.md)), and (c) the race's control arm?

Three more added when the golden-vector plan ([03](03-golden-vector-plan.md))
landed:

4. **Production DB fate:** `~/.dialectical/db.sqlite3` no longer exists
   anywhere the seat could search — do you hold the DB or a backup? If yes,
   the vector-recorder harness ([27](27-golden-vector-recorder.md)) shrinks
   substantially; if no, ~40% of scoring surface has no surviving source of
   truth and the recorder is the only way back.
5. **Scope of indictment (a):** the unjudged-node fallback is at least FOUR
   distinct defects — `DEFAULT_TAU=0.5` (adapter), `or 0.0` fallbacks
   (lean.py, dialectical_v2.py), `0.0` (branch_summary.py), and
   `CONTRADICTED_EVIDENCE_TAU=0.7` (a fabricated magnitude for a verdict that
   carries none). Are ALL variants indicted, or only the adapter default? The
   vector families' MUST-DIFFER marking inherits your answer.
6. **Possible FIFTH indictment (not yet ruled):** `service.py:1403` calls
   `judge_weight(..., config=None)` unconditionally, making calibration's
   override branch unreachable — every judge weight is a constant 1.0
   ("cold_start"), self-documented as `modelWeight=constant-1.0(P8)`. Does V
   indict constant judge weights as defect five, or accept them as V2
   behavior?

One more from the lens merge (Grok F12):

7. **Proposal B invariants:** V2's standing product law (`AGENTS.md` Proposal
   B: provider-agnostic LLMProvider, evidence-gated leaves, skeptic
   certification, anonymized debate, pure propagation, etc.) — per invariant:
   carried into V3 as behavior, greenfield-replaced, or explicit non-goal?
   Un-ruled, ARCHITECTURE silently imports or drops them.

## Why it matters

The carryover manifest cannot say "keep the scoring machinery" precisely until
these three boundaries are V-ruled; the golden vectors and race criteria
inherit whichever baseline V picks.

## Agenda

`research/02-scoring-behavior-spec.md` — Uncertainties register (U1–U9; U1, U3,
U4, U5 are the load-bearing ones).

## Comments
