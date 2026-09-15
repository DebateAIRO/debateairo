CODEX REVIEW LIVEPROOF r1 — CHANGES · comments read through: liveproof-r1-2026-09-01

# D20 live-proof evidence review

## VERDICT

**REWORK** (handoff marker: **CHANGES**) — **0 blocking, 1 non-blocking finding**.

The D20 proof itself passes every substantive check in the packet. The captured ceremony is
one green M=2 attempt: its ids, panel, FAIR-01 lines, and exit are exact; Q13 joined to the
captured ceremony lineage gives 4/4 cross-maker attack edges; marks reconcile as 28+2+1=31;
artifacts reconcile as 8+12=20 attempts within the ceiling of 88; Q14 is exactly the
disclosed malformed and unused query; and the deletion sentinel is the final recovery line.

The sole finding is against the orchestrator packet's evidence-source attribution, not the
worker report or live proof. Non-blocking findings remain mandatory, so this cannot be a
“pass with concerns.”

This was a STATIC review. I ran no test, build, typecheck, provider call, ceremony, database,
or git command.

## FINDINGS

### N1 — The packet attributes the valid lineage operand to the recovery log that lacks it

**Ticket:** `F-LIVEPROOF-CODEX-R1-N1` · owner: orchestrator packet · non-blocking but
mandatory.

**File/line:** `packets/liveproof-codex-r1.md:19-23`; contradicted by
`logs/t0/ceremony3-recovery.log:108-271`, `logs/t0/ceremony3.log:73`, and the accurate
disclosure at `agent-reports/t00-trel2-liveproof.md:168-173`.

**Failure scenario:** input = a reviewer obeying packet lines 20-21 literally and deriving
`Q13 edges × lineage` from `ceremony3-recovery.log` alone. The recovery log's only attempted
node→maker operand is Q14. Because its join key is only `run_id`, every node is paired with
all 20 artifacts and both makers. It cannot identify any node's author, so it cannot produce
the claimed 4/4 cross-maker classification. The valid lineage operand is instead the
`PRO-01 per-node maker lineage` JSON at `ceremony3.log:73`.

Verbatim static cardinality probe:

```text
Q14_ROWCOUNT=160
Q14_NODE_COUNT=8
Q14_ROWS_PER_NODE_MIN=20
Q14_ROWS_PER_NODE_MAX=20
Q14_DISTINCT_MAKERS_PER_NODE_MIN=2
Q14_DISTINCT_MAKERS_PER_NODE_MAX=2
Q14_VALID_NODE_MAKER_MAP=NO
```

The report itself gets this boundary right and §3.2 does not use Q14. **Required fix:** amend
packet item 2 to say `Q13@ceremony3-recovery.log × PRO-01 lineage@ceremony3.log → 4/4`.
No ceremony or worker-report change is required.

## PACKET AND REPORT INTEGRITY

The packet's absolute board, report, capture, and D20 paths all resolve. Its board context is
accurate: T00 is `done` at `rework_round: 2`, and DECISIONS lines 520-529 authorize one
captured M≥2 smoke ceremony. D20 RESULT lines 531-543 name the same run, answer, panel,
counts, Q14 disclosure, and sentinel chain.

The report marker and body hash rederive exactly, and the capture sizes equal its table:

```text
REPORT_MARKER=READY FOR PEER REVIEW — LIVEPROOF r1 · comments read through: D20-2026-09-01
STATED_SHA=0f9e46ee2a1d5dc952bf2acfd7c7f72c341dc04db58fdbefc8b0b250b229cd97
REDERIVED_SHA=0f9e46ee2a1d5dc952bf2acfd7c7f72c341dc04db58fdbefc8b0b250b229cd97
SELF_SHA_MATCH=YES
    8218 ../logs/t0/ceremony3.log
   24005 ../logs/t0/ceremony3-recovery.log
   32223 total
```

## FAIR-01, PANEL, IDS, AND EXIT

The requested ceremony lines are verbatim:

```text
ACC-01 run id: 31591934-33fb-48db-9dc6-77fb21148f0c
ACC-01 answer id: 197b8602-a9f1-4120-8950-2a04c6211c08
FAIR-01 graph: 8 nodes · 4 attack edge(s)
FAIR-01 makers: Anthropic, OpenAI · independent attack edges: 4
PRO-01 model calls (all outcomes): 20
DISC-01 panel/ceiling/probe evidence: 2 / 88 / 5
CEREMONY_EXIT=0
```

Q3 and Q4 independently carry the same identifiers and panel size:

```text
RUN_ID=31591934-33fb-48db-9dc6-77fb21148f0c
PANEL_SIZE=2
STRUCTURAL_CEILING=88
ANSWER_ID=197b8602-a9f1-4120-8950-2a04c6211c08
```

Q1 identifies the two healthy members as OpenAI / `gpt-5.6-sol` and Anthropic /
`claude-opus-5`; xAI is honestly `ABSENT` with `GROK_CLI_FAILED`.

## INDEPENDENT CROSS-MAKER PROBE

Property: **every persisted attack edge joins nodes authored by different makers**. I parsed
the eight Q13 edge rows, selected `polarity=attack`, and joined source and target ids to the
eight-element lineage JSON at `ceremony3.log:73`. This does not trust the ceremony's own
reported independent-edge count.

Verbatim result:

```text
ATTACK=1c8486b5(Anthropic)->c4191bb5(OpenAI) CROSS_MAKER=YES
ATTACK=83cc9521(OpenAI)->d0fa33f9(Anthropic) CROSS_MAKER=YES
ATTACK=ada4cbfe(OpenAI)->d0fa33f9(Anthropic) CROSS_MAKER=YES
ATTACK=05236c4c(Anthropic)->c4191bb5(OpenAI) CROSS_MAKER=YES
CROSS_MAKER_ATTACK_EDGES=4/4
```

The failure-direction probe changed the author of attack source `1c8486b5` in memory to the
target's maker. The checker went RED at 3/4. A neighbouring mutation changed only support
source `f15e98c7`; the attack property remained GREEN:

```text
PROPERTY=every persisted attack edge joins nodes of different makers
BASELINE=GREEN CROSS=4/4
BAD_MUTANT=RED CROSS=3/4
NEIGHBOR_MUTANT=GREEN CROSS=4/4
```

## CAPTURE ARITHMETIC

Fresh parsing of Q3, Q7-Q9, and Q11 produced:

```text
MARK_PARTS=28+2+1
MARK_SUM=31
MARK_TOTAL=31
MARK_ARITHMETIC=MATCH
ARTIFACT_PARTS=8+12
ARTIFACT_SUM=20
MODEL_ATTEMPTS=20
ATTEMPT_ARITHMETIC=MATCH
WITHIN_CEILING=YES
```

This supports 31 condition-mark rows and 20 model attempts, which is 20 ≤ 88.

## Q14, SENTINEL, AND ATTEMPT COUNT

Q14 is present verbatim at recovery line 108, returns 160 rows, and fails the node→maker
cardinality property as shown in N1. Report §3.2 contains zero Q14 references and instead
uses Q13 plus the ceremony lineage, so “malformed, unedited, unused” is accurate.

The recovery transcript has exactly fourteen query headers and ends in the promised order:

```text
   108  ===== Q14 node->maker map (cross-maker edge check) =====
   272  finished_utc: 2026-09-01T11:29:14.262Z
   274  server stopped
   275  RECOVERY_END 2026-09-01T11:29:14Z
   276  PGDATA_AFTER_DELETE=ABSENT
Q_HEADERS=14
SENTINEL_IS_LAST_LINE=YES
```

The declared captures contain exactly one ceremony envelope and one persisted run/answer:

```text
START_LINES=1
CMD_LINES=1
RUN_ID_LINES=1
ANSWER_ID_LINES=1
CEREMONY_EXIT_LINES=1
END_LINES=1
RETRY_MARKERS=0
Q3_RUN_ROWS=1
Q4_ANSWER_ROWS=1
```

## NOT VERIFIED

- I did not rerun the live proof or query external billing; the packet forbids provider calls
  and dynamic execution. “One attempt” is verified within the complete declared capture,
  not through a provider-side spend ledger.
- I did not inspect implementation code, the preflight capture, or claims outside the six
  evidence checks the packet names.
- I contacted no other review lens.

## PREDICTIONS

I predict a result-focused lens will approve because every D20 substance check is green and
may read “from the recovery log” as harmless shorthand. A capture-integrity lens should find
the same source-boundary defect: recovery Q14 gives every node both makers, so the exact
4/4 join is possible only after importing lineage from ceremony line 73. I would check that
operand attribution first, then retain the live-proof result unchanged.
