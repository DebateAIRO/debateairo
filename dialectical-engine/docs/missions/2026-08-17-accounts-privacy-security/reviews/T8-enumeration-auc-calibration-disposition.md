# T8 enumeration AUC calibration disposition

Date: 2026-08-25  
Decision: `SATISFIED_BY_CURRENT_PER_N_CALIBRATION`

## Problem retired

The former fixed `AUC <= 0.80` guard was not a defensible statistical boundary.
A definitionally zero-signal same-arm draw reached 0.891 at N=1, while a real
N=4 asymmetry regression reached only 0.840. The fixed ceiling could therefore
flake on healthy behavior and still leave only a four-point margin on a real
regression.

## Current contract

The live-mail registration test scores concurrency cells N=1, 2, 3, 4, and 8.
For each cell it derives a deterministic empirical null independently from the
two observed same-arm distributions at that cell's exact scored group size.
Each arm contributes 2,048 seeded relabeling draws; the combined per-cell 0.99
quantile is that cell's AUC ceiling. The measured cross-arm AUC must be at or
below its own ceiling. There is no shared 0.80 cutoff.

The wave rule is `max(4, ceil(16/N))`, producing 16, 16, 18, 16, and 32 real
observations per arm for N=1, 2, 3, 4, and 8 respectively. Thus N=1 has sixteen
real observations instead of the original small sample, and every cell checks
finite values, non-degenerate observations, exact cardinality, and a null
ceiling not below its median before making the opacity assertion.

The registration measurement still asserts the independent operational
properties around the statistic: response-floor coverage, median-gap bound,
exact duplicate and post-work audit deltas, and expected mail cardinality.
This calibration is an empirical regression guard for the tested operating
points, not a universal probability guarantee or an availability SLA.

## Mutation sensitivity

The later bounded verification delayed the real existing-address repository
lookup path by 800 ms without modifying the statistical helper or sample
arrays. The same calibrated assertion became non-vacuously RED: overall AUC
was 1.0 against a 0.75390625 per-cell ceiling, including N=4 AUC 1.0 against
approximately 0.752. Exact source restoration returned the title to GREEN.

T8 therefore needs no production change. Its deliverable is the explicit
record that the fragile global ceiling has already been replaced by the
per-cell measured-null contract with larger N=1 evidence.

