CODEX REVIEW T0 r2 — CHANGES · comments read through: t00-r2-2026-09-01

# T0 rework verification

VERDICT: **REWORK** (handoff marker: **CHANGES**) · review round **r2 of max 3** ·
findings **2 total: 1 blocking, 1 non-blocking**. Round **r3 is the last lawful rework
round**.

The ticket exists at `rework_round: 1` and `status: changes_requested`. Per mission D1,
this marker is the file-board comment for the orchestrator to mirror; this seat did not
edit the board. The review remained STATIC: no test, build, git mutation, provider call,
database start, or ceremony was run.

## Findings

### B1 — The causal-label withdrawal still leaves the authoritative 23 named `Genuine`

**Ticket:** `F-T0-CODEX-R2-B1` · owner: T0 report worker · blocking because it is the
incomplete cure of r1 B1 and the 23-row table is the fleet's classification authority.

**File/line:** `agent-reports/t00-baseline.md:136`.

**Failure scenario:** input = D19a's ruling that the evidence establishes `23 STABLE-RED +
5 UNSTABLE, cause CANNOT-ASSESS`, and the r2 packet's instruction to grep for surviving
causal wording outside the withdrawal block. The twelve intended `UNSTABLE` label sites are
corrected, but the current authoritative table still begins:

```text
136:### D.1 — Genuine, stable-red in all three runs (23)
```

`Genuine` is the same unsupported causal half of the withdrawn `23 genuine` label. It sits
outside the quoted correction block and recreates a `genuine` versus `unstable` dichotomy
that D19 did not authorize; D19 says only that the 23-member **STABLE-RED** set is untouched.

**Required fix:** change the heading to exactly `### D.1 — Stable-red in all three runs
(23)` and re-run the banned-causal-word scan outside the explicit withdrawal quotation.
Because this verdict opens r3, no fourth rework round is authorized.

### N1 — The orchestrator's packet-path defect repeats and expands in r2

**Ticket:** `F-T0-CODEX-R2-N1` · owner: orchestrator packet · non-blocking but mandatory;
this is the uncured r1 N1 / D19c packet-lint finding.

**File/line:** `packets/t00-codex-r2.md:4,8-9`.

**Failure scenario:** input = every upstream path exactly as dispatched from the seat cwd.
`board/T00-baseline.md` remains relative, while the r1 report and both new capture logs use
literal `.../` prefixes. All four exact strings fail to resolve despite the packet claiming
the upstream artifacts were existence-checked. The inferred absolute artifacts do exist,
so the review could proceed, but the packet itself is still not followable literally.

Verbatim static output:

```text
R2_RELATIVE_BOARD_EXIT=1
.../agent-reports/T0-codex-r1.md EXIT=1
.../logs/t0/ceremony2.log EXIT=1
.../logs/t0/ceremony2-recovery.log EXIT=1
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T0-codex-r1.md EXIT=0
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t0/ceremony2.log EXIT=0
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t0/ceremony2-recovery.log EXIT=0
```

**Required fix:** replace the board and three ellipsis paths with absolute paths and apply
the D19c packet-lint cure to the actual serialized packet strings, not only the inferred
targets.

## r1 finding disposition

- **B1 — PARTIAL / still blocking.** Twelve intended labels now state unstable and
  CANNOT-ASSESS, and the causal withdrawal is explicit, but line 136 preserves `Genuine`.
- **B2 — VERIFIED FIXED.** The capture-disciplined second ceremony has Q1–Q8 with query
  text, row counts, verbatim rows, and a final deletion sentinel. Run 1's uncaptured facts
  are explicitly testimony-grade.
- **B3 — VERIFIED FIXED.** Q7 records 20+2+1+1 and Q8 independently records 24.
- **N1 — NOT FIXED.** The r2 packet repeats the relative board path and adds three literal
  ellipsis paths.
- **N2 — VERIFIED FIXED.** D.1 now contains the full `P1 / FX-ORPH-01 / FX-HR-H1 /
  FX-HR-H3 — structural law` suite name; normalized report/log sets are byte-equal.

## Evidence verified

### Capture order and record-grade ceremony facts

The recovery transcript contains eight query sections in order and ends after deletion:

```text
Q_HEADER_COUNT=8
FINAL_SENTINEL=PGDATA_AFTER_DELETE=ABSENT
```

Independent parsing of Q1–Q8 produced, verbatim:

```text
Q3_RUN=29b2d42d-9fc0-41cb-aca2-94599b6dc076
Q4_RUN=29b2d42d-9fc0-41cb-aca2-94599b6dc076
Q4_ANSWER=4c7c5d38-351e-4fa9-b3fa-6b9144530469
UNIQUE_HEALTHY_PROVIDERS=1
PROBE_ROWS=4
Q7_SUM=24
Q8_TOTAL=24
MARK_CLASS_SET_DIFF_EXIT=0
```

Q1 has two absent makers (`CLAUDE_CLI_FAILED`, `GROK_CLI_FAILED`) and two healthy rows for
the same codex provider/model, so the discovered healthy panel shape is M=1. Q4 and Q7 have
the same four mark classes. Q5/Q6 record one depth-0 node. The answer is
`DOWNGRADED`/`COMPOSED`/`SUPPORTED`/`CAPPED`.

`ceremony2.log` independently records the one-node gate and exit:

```text
83:TypedDomainError: DR-140(b): the answer graph carries 1 node(s); a fair debate requires more than one
90:  code: 'FAIR_DEBATE_NODE_COUNT_UNSATISFIED'
94:CEREMONY_EXIT=1
```

The first and second ceremony logs contain the same gate text/code/exit. Run 1's panel,
marks, and ids remain testimony rather than primary evidence; the report labels them that
way and does not promote their specific ids back to record-grade.

### Failure-set and report integrity

N2's set-equality cure is exact:

```text
REPORT_D1
      23
434e33fe94126393209cbd9e544aaa986f7e9d425b83f23643e50f244183f2b1  -
LOG_INTERSECTION
      23
434e33fe94126393209cbd9e544aaa986f7e9d425b83f23643e50f244183f2b1  -
SET_EQUALITY_DIFF_EXIT=0
```

The revised report marker matches the packet and its self-hash re-derives exactly:

```text
REWORK READY FOR REVIEW — T0 r4 · comments read through: t00-codex-r1-2026-09-01
report sha256: debc8ae4d9958a7a4e4ed3c47c69459278978e5a17649025b24d72afc61c28c9  (sha256 of this file with the marker line, this sha line, and the blank line after them removed)
debc8ae4d9958a7a4e4ed3c47c69459278978e5a17649025b24d72afc61c28c9  -
```

## Not verified

- No dynamic command was authorized or run. All evidence above came from static parsing,
  hashing, exact path checks, and read-only artifact inspection.
- Run 1's panel, marks, and ids cannot be independently reconstructed because its recovery
  was not captured. Only its gate refusal is independently log-backed; the revised report's
  testimony-grade label accurately preserves that boundary.
- No other lens was contacted. This mission's roster authorizes this codex reviewer plus
  the judge.

## Predictions

I predict the judge is most likely to count the twelve corrected label sites, see the clean
Q1–Q8 record, and miss the thirteenth causal word in the D.1 heading. I also predict the
packet author will treat literal `.../` paths as harmless display shorthand despite the
reviewer contract requiring paths that resolve from the seat cwd. The first checks should
therefore be the banned-token grep outside the withdrawal block and exact-string path
existence; both currently refute approval.
