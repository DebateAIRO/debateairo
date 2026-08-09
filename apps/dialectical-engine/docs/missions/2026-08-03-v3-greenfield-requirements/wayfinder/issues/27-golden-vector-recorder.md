# 27 — V2 golden-vector recorder (harness)

Type: task
Status: resolved
Blocked by: 26

## Answer

CLOSED OUT OF SCOPE by **DR-033** (2026-08-04): V ruled nothing from V3 must
match V2 — V2 is reference only, divergence is sanctioned, so the recorder's
premise (protect equivalence with V2) is void. V3's test base = literature
vectors + spec-derived property tests; the race measures V2 end-to-end as-is.

## Question

Build the deterministic vector recorder the golden-vector plan
([03](03-golden-vector-plan.md)) specifies: fake-judge providers through the
existing `FakeProvider`/`ProviderRegistry` seam, temp-DB boot per the
`conftest.py` recipe, `scripts/benchmark/runner.py` as the starting point, nine
numbered MUST requirements (four observation points — reducer / graph /
protocol run / served payload; OP4 is the only place indictment (d) is
observable), node-id alias normalization, run-twice determinism self-check,
version stamping.

## Gates before work starts

- Blocked by [26](26-carryover-scope-confirmations.md): the flag baseline V
  picks DEFINES what the recorder records; and if V holds a production-DB
  backup, the harness scope shrinks substantially.
- EXECUTION GATE: this ticket writes code (new test scaffolding beside V2 —
  it changes no V2 engine behavior, but it is coding work). This mission's
  loop election has NO programming loop; building it requires either V's
  explicit task authorization under this mission or assignment to the coding
  roster in a later loop. The plan is approved requirements-side; the build
  waits for that authorization.
- OBSERVE-ONLY LAW (Grok lens F6, accepted): the recorder is EXTERNAL
  observe-only — it runs existing binaries/tests and parses existing
  artifacts. If a vector proves unobtainable without editing V2, that is a
  V-escalation (charting decision), never a silently authorized "tiny patch":
  one edit contaminates the frozen control arm and voids the race
  epistemology.

## Comments
