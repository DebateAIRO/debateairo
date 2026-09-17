CODEX REVIEW T0 r1 — CHANGES · comments read through: t00-r1-2026-09-01

# T0 whole-record evidence review

VERDICT: **REWORK** (handoff marker: **CHANGES**) · review round **r1 of max 3** ·
findings **5 total: 3 blocking, 2 non-blocking**.

The ticket is present and `waiting_review`. Per mission D1, seats do not edit file-board
tickets; this marker is the ticket comment for the orchestrator to mirror. The review stayed
inside the packet's two-file writable surface. No test, build, provider call, or ceremony was
run.

## Findings

### B1 — The five D.2 exclusions are not causally classified by the recorded probe

**Ticket:** `F-T0-CODEX-R1-B1` · owner: T0 report worker · blocking because this count is the
fleet's failure-classification authority.

**File/line:** `agent-reports/t00-baseline.md:142-167`.

**Failure scenario:** input = three full-run masks `.X.`, `.X.`, `X..`, `XX.`, `X..`, plus
one subsequent solo invocation per spec. The report maps that input to "contention
artifacts, NOT counted as failures", "Not defects", and a **23 genuine** authority. That
probe does not discriminate contention from ordinary intermittent failure: four targets
already pass in two of the three full runs, and POL-03 already passes in one. One additional
solo pass is therefore an outcome already admitted by the observed flakiness. The solo runs
also retained foreign load and three sibling vitest processes by the report's own account.

The evidence supports **23 stable-red + 5 unstable**. It does not establish the stronger
causal labels **contention**, **not defects**, or **23 genuine**. Per packet law, the cause is
**CANNOT-ASSESS**, not guessed.

Static failure-set output, verbatim:

```text
.X. acceptance/grok-relay.test.ts > GROK-01 Grok Build CLI relay > refuses boot on a dead or unauthenticated CLI and never fabricates lineage
.X. acceptance/grok-relay.test.ts > GROK-01 Grok Build CLI relay > uses the shared SIGKILL escalation when the Grok child ignores SIGTERM
X.. acceptance/mono-panel.test.ts > DR-182 live mono-panel composition > boots and serves high-stakes depth 4 with the ruled cap and disclosures
X.. tests/integration/registration-database.test.ts > T9 resend lock-order race through the real HTTP boundary > T9 counterbalances six resend windows with cadence-blocked family-wise equivalence
XX. tests/integration/pol03-pool-resilience.test.ts > POL-03 real PostgreSQL backend reset > survives an idle backend termination and reports in-flight and subsequent failures typed
```

The four solo logs exist. Their summaries establish `9/9 passed, exit 0`; `1/1 passed,
exit 0`; `3/3 passed, exit 0`; and `68/69 passed, exit 1`. In the last
log the sole failure header is S3d, so the unstable T9 test did pass. Existence and outcomes
are verified; causation is not.

**Required fix:** either label the authority exactly as `23 stable-red + 5 unstable` and
remove the no-defect/contention overclaim, or supply a discriminating controlled record
(for example repeated serialized full-suite agreement or a paired load/no-load probe). A
single already-common PASS outcome is insufficient.

### B2 — The review packet names recovery logs that do not exist; the recovered ceremony facts are unreviewable

**Ticket:** `F-T0-CODEX-R1-B2` · owner: orchestrator packet · blocking because pin 3's ids,
panel, probes, and marks are mandatory evidence.

**File/line:** `packets/t00-codex-r1.md:16,22-24`; consequence visible at
`agent-reports/t00-baseline.md:257-267`.

**Failure scenario:** input = the packet's claimed `ceremony + recovery logs`. The ceremony
log says the FAIR gate threw before the reporting block; the report agrees that stdout has
no panel, run id, answer id, probe count, or marks. The report then says those facts were
read from PostgreSQL and that the data directory was deleted. No recovery log or query
transcript exists anywhere in `logs/t0/`. The packet therefore dispatches a reviewer to a
nonexistent upstream artifact, and the central DB-derived facts cannot be independently
checked.

Static outputs, verbatim:

```text
80:TypedDomainError: DR-140(b): the answer graph carries 1 node(s); a fair debate requires more than one
87:  code: 'FAIR_DEBATE_NODE_COUNT_UNSATISFIED'
91:CEREMONY_EXIT=1
RECOVERY_LOGS=0
```

`relay-handshake-repro.log` does preserve the raw "Not logged in" envelope, and code review
confirms that a nonzero Claude child exit maps to `CLAUDE_CLI_FAILED`; it does **not** prove
the persisted provider-probe row or any of the other recovered DB values. Repetition of the
ids in DECISIONS.md is downstream transcription, not independent evidence.

**Required fix:** correct the packet's artifact claim and attach a preserved, hashed recovery
query transcript if one exists. If it does not, revise the DB-derived facts to
CANNOT-ASSESS and route the evidence gap to V; this review does not authorize a second
provider-spending ceremony.

### B3 — The ceremony condition-mark record is internally inconsistent

**Ticket:** `F-T0-CODEX-R1-B3` · owner: T0 report worker · blocking because the packet
explicitly requires the recovered marks to be internally consistent.

**File/line:** `agent-reports/t00-baseline.md:237-238`.

**Failure scenario:** input = the stated row breakdown: one `SINGLE-LINEAGE`, one
`CRITIQUE-UNAVAILABLE`, 21 `OWED-CHECK-UNEXECUTED`, and two
`UNRESOLVED-TYPE-FALLBACK`. That totals **25**, but the same row reports **24**. With the
database deleted and B2's recovery transcript absent, the reviewer cannot determine which
number or multiplicity is true.

**Required fix:** reconcile the total and multiplicities from primary evidence. If primary
evidence cannot be restored, mark the row CANNOT-ASSESS rather than choosing 24 or 25.

### N1 — The packet's board path does not resolve from the dispatched working directory

**Ticket:** `F-T0-CODEX-R1-N1` · owner: orchestrator packet · non-blocking but mandatory.

**File/line:** `packets/t00-codex-r1.md:4`.

**Failure scenario:** input = `board/T00-baseline.md` from the seat working directory
`agent-reports/`; outcome = missing path. The board exists only relative to the mission root.

Static output, verbatim:

```text
RELATIVE_BOARD_PATH_EXIT=1
MISSION_BOARD_PATH_EXIT=0
```

**Required fix:** use the absolute mission-board path, as the packet already does for its
other upstream artifacts.

### N2 — One D.1 failure name is abbreviated, breaking literal set-equality

**Ticket:** `F-T0-CODEX-R1-N2` · owner: T0 report worker · non-blocking but mandatory.

**File/line:** `agent-reports/t00-baseline.md:123`.

**Failure scenario:** input = normalized D.1 rows versus the three-log intersection. Both
sets contain 23 rows, but literal comparison returns one mismatch because the report uses
`P1 / … — structural law` where the logs use the full suite name. The row is identifiable,
so the count remains checkable, but the fleet's set-equality rule and the requirement to
name every failure are not met literally.

Verbatim diff:

```diff
-tests/architecture/scaffold.test.ts > P1 / … — structural law > matches all 28 dependency-edge rows and structural rules 1–5
+tests/architecture/scaffold.test.ts > P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law > matches all 28 dependency-edge rows and structural rules 1–5
```

**Required fix:** replace the ellipsis with the full logged suite name.

## Evidence verified

- Board typed state: ticket T0, status `waiting_review`, worker `rework_round: 0`; the current
  codex review is r1. D1 reconciles the reviewer handoff with the no-board-write contract.
- Packet writable surface covers both demanded reviewer artifacts. The original worker
  packet's report, self-report, and log deliverables are inside its allowed list; D9 and D17
  provide followable provisioning and ceremony-tree continuations.
- Typecheck post logs, verbatim:

```text
FILE=typecheck-post1.log
$ tsc --noEmit
TYPECHECK_EXIT=0
FILE=typecheck-post2.log
$ tsc --noEmit
TYPECHECK_EXIT=0
```

- Full-suite summaries, verbatim:

```text
FILE=test-post1.log
 Test Files  20 failed | 197 passed (217)
      Tests  26 failed | 1750 passed (1776)
   Duration  2769.99s (transform 8.04s, setup 0ms, import 144.14s, tests 2562.43s, environment 23.74s)
TEST_EXIT=1
FILE=test-post2.log
 Test Files  20 failed | 197 passed (217)
      Tests  26 failed | 1750 passed (1776)
   Duration  3014.31s (transform 11.80s, setup 0ms, import 182.56s, tests 2756.96s, environment 22.18s)
TEST_EXIT=1
FILE=test-post3.log
 Test Files  18 failed | 199 passed (217)
      Tests  23 failed | 1753 passed (1776)
   Duration  2615.29s (transform 5.21s, setup 0ms, import 107.01s, tests 2458.17s, environment 15.06s)
TEST_EXIT=1
```

- Independent set extraction produced `INTERSECTION=23` and `UNION=28`. All 23 stable-red
  members occur in all three logs. The report contains the same semantic members except for
  N2's one abbreviated suite prefix. The five unstable run masks match D.2, and every D.2
  spec has a solo log.
- D17 tree: `lane-trel` is at `4aa9832`; `git status --porcelain` and the diff outside
  `acceptance/` are empty; the acceptance-only diff contains the reported eight files;
  `packages/contract/generated/client.ts` exists.
- F11 is correct. `acceptance/main.ts:85-89` projects only schema keys before the strict
  parse, so extra source keys never reach `.strict()`. The false original sentence appears
  only inside the explicitly labeled quotation at report lines 699-700.
- Both aborted test attempts are attributed to the orchestrator janitor, not to suite
  instability, in report D.5 and the accepted T0 decision record. Their overwritten stubs
  are not independently inspectable.
- Report hash self-consistency, verbatim:

```text
report sha256: 9179a7d94308bc6e798932361f5f478c5421072ac3897a0cbcb39a8f063f4d20  (sha256 of this file with the marker line, this sha line, and the blank line after them removed)
9179a7d94308bc6e798932361f5f478c5421072ac3897a0cbcb39a8f063f4d20  -
```

## Not verified

- No runtime suite, build, provider call, DB start, or ceremony was run; the packet forbids
  them. All probes were static reads, parsing, hashing, or read-only git inspection.
- The recovered run id, answer id, panel, provider-probe rows, answer fields, and mark rows
  are CANNOT-ASSESS because their claimed source was deleted without a preserved transcript.
- The five D.2 failures' intermittent behavior and solo outcomes are verified; their cause
  and no-defect classification are not.
- No other lens was contacted. This lane's roster authorizes one codex reviewer plus judge.

## Predictions

I predict the next judge is most likely to accept `23` because the intersection arithmetic
is exact while missing that one solo PASS does not discriminate contention from the already
observed pass/fail pattern. I also predict the ids repeated in DECISIONS.md will be mistaken
for corroboration even though they descend from this same unlogged recovery. The first two
checks should be recovery-log existence and the `24` versus `1+1+21+2=25` mark arithmetic;
either result falsifies an unqualified approval before any broader reading.
