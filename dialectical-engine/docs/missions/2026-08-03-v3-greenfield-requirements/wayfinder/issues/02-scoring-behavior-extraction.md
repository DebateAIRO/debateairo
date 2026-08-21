# 02 — Scoring-machinery behavioral spec extraction

Type: research
Status: resolved
Blocked by: none

## Question

What is the exact observable behavior of the kept scoring organs — precise
enough for a clean-room reimplementation with no access to the V2 code?

Organs (V preservation steer): QBAF/DF-QuAD aggregation semantics (the exact
math), per-node judge scoring contract (inputs, outputs, failure paths),
trusted-run reconstruction, and the qbaf_debug graph view semantics.

## Why

Carryover is CLEAN-ROOM (charting Q3): nothing is copied, so the behavior spec
IS the carryover. The four indicted semantics — unjudged-node fallback
confidence, hardcoded aggregation-variant switch, exact-string dedup,
provenance-blind serving — must be documented AS CURRENT BEHAVIOR and marked
`EXCLUDED-BY-RULING` (V3 must not reproduce them), with file/line evidence.

## Inputs (read-only)

- `apps/dialectical-engine/coordinator/app/scoring/` (incl. `qbaf_debug.py`,
  `service.py`) and whatever else the organs touch — follow the code.

## Deliverable

`../../research/02-scoring-behavior-spec.md` — one behavioral spec section per
organ + an EXCLUDED-BY-RULING register, marker `RESEARCH HANDOFF COMPLETE` at top.

## Answer

Resolved by Opus research seat — behavioral spec at
[../../research/02-scoring-behavior-spec.md](../../research/02-scoring-behavior-spec.md).

Gist: all four organs specified clean-room-precise (DF-QuAD probabilistic-sum +
mediating function with literature golden vectors reproduced in-repo; judge
contract with tolerant-parse and reducer caps; reconstruction via v3 input hash
+ contract hash + artifact-completeness gate; qbaf_debug six-key block with two
failure tiers). ALL FOUR indicted semantics located with file:line evidence and
reproduced numerically: (a) unjudged-node fallback — root **0.96875 from four
unjudged children**, measured by V2's own test; (b) hidden aggregation switch —
v1 root 0.96875 vs v2 root 0.5 on the IDENTICAL tree (supported vs contested
from the same judgments); (c) exact-string dedup — duplicate inflation
0.40→0.64→0.784 reproduced from the formula; (d) provenance-blind serving —
`tauSources` persisted beside strengths and never joined; historical results
served with no contract-hash predicate; no `score_provenance` consumer in the
UI. Nine uncertainties registered; the three load-bearing ones (U1 trusted-run
naming, U3 second edge-weighted DF-QuAD on the in-memory path, U5 six
OFF-by-default flags making "V2's behavior" ambiguous) are V-confirmations →
new grilling ticket [26](26-carryover-scope-confirmations.md).

## Comments
