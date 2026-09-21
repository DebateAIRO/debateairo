REWORK READY FOR REVIEW — T0 r5 · comments read through: t00-codex-r2-2026-09-01
report sha256: 86dc0736feea279a66b2399de4bfe929d16daa18464456251b4fb249032d6245  (sha256 of this file with the marker line, this sha line, and the blank line after them removed)

# T0 BASELINE r5

> **Reading order.** `## PINS (POST-PROVISIONING — baseline of record)` and
> `## PRE-EXISTING FAILURES (POST-PROVISIONING)` are the **baseline of record** (pins 1–2,
> accepted at r2). `## CEREMONY RECORD (POST-TREL, D17)` and `## CEREMONY BLOCKER (r3)`
> carry pin 3. Everything below them, from `# T0 BASELINE r1` onward, is the
> **pre-provisioning trap record** — retained deliberately under D9 as evidence of what an
> unprovisioned checkout measures. Do not read the r1 pins as the current state of the tree.
> One sentence inside that trap record has been corrected in place and is marked
> **r3 CORRECTION (F11)**.
>
> **r4 (codex T0-r1 / D19) changed three things:** the five unstable tests are relabelled
> **UNSTABLE — cause CANNOT-ASSESS**, with the earlier "contention / not defects / 23
> genuine" causal wording withdrawn (**r4 CORRECTION** in the solo-isolation section); pin 3
> now carries a **capture-disciplined run 2** whose every recovery query and result is logged,
> with run 1 demoted to **testimony-grade**; and the condition-mark multiplicity is corrected
> from 21 to 20 (**r4 CORRECTION (codex B3)**). The **23 stable-red set is unchanged**, so the
> b123 set-equality verdict built on it stands.
>
> **r5 (codex T0-r2) changed one thing:** the D.1 heading dropped the withdrawn causal
> adjective it still carried, and the banned-token scan is now published, runnable and
> refutation-tested in **§ D.0**. No pin, count, id, or set changed.

---

## PINS (POST-PROVISIONING — baseline of record)

Environment change since r1: the orchestrator ran `pnpm run generate:contract` in the primary
checkout under mission DECISIONS **D9**. Verified by this seat before re-pinning:
`packages/contract/generated/client.ts` present (130 bytes, alongside
`field-inventory.json`), `git rev-parse --short HEAD` still **1c9578a**, and this seat again
made **zero** edits to the primary checkout.

| # | Command | Exit | Counts / ids | Log |
|---|---|---|---|---|
| 1 | `pnpm run typecheck` | **0** | **0 errors** (2/2 runs) | `logs/t0/typecheck-post1.log`, `typecheck-post2.log` |
| 2 | `pnpm test` | **1** | **worst run 26 failed / 1750 passed (1776 tests)**; **20 failed / 197 passed (217 files)**. 3 runs: 26 / 26 / 23. Reconciled: **23 stable-red + 5 unstable (cause CANNOT-ASSESS)** | `logs/t0/test-post1.log`, `test-post2.log`, `test-post3.log` |
| 3 | `./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential <43>` | **1** | RECORD-GRADE (run 2): **run id `29b2d42d-9fc0-41cb-aca2-94599b6dc076` · answer id `4c7c5d38-351e-4fa9-b3fa-6b9144530469`** · discovered panel **M=1** (codex only) · 4 probe rows · 24 condition-mark rows · gate refused `FAIR_DEBATE_NODE_COUNT_UNSATISFIED` | `logs/t0/ceremony2.log`, `ceremony2-recovery.log`, `relay-handshake-repro.log` |

Pin 3 ran under D17 from the `lane-trel` worktree; see `## CEREMONY RECORD (POST-TREL, D17)`.
The run **settled** (answer sealed) and only the FAIR-01 gate refused, because the panel was
M=1 rather than the expected M=2. The ids above are from the **capture-disciplined run 2**
(D19b), whose every recovery query and result is in `ceremony2-recovery.log`; the r3 run's
ids are retained separately as testimony-grade. Pins 1–2 below are unchanged from r2 and
remain the accepted baseline of record.

### What provisioning changed

| Measure | Pre-provisioning (r1) | Post-provisioning (r2) |
|---|---|---|
| `pnpm run typecheck` | exit 1, **157 errors**, 39 files | **exit 0, 0 errors** |
| `@debateai/contract` error occurrences in the suite log | 77 | **0** |
| Test FILES failing at collection | 73 | **0** |
| Test FILES failing (total) | 83 of 217 | 20 of 217 |
| **Tests actually collected** | **1021** | **1776** |
| Tests failing | 15 | 26 (worst run) → 23 reconciled |

**The load-bearing number is the denominator: 1021 → 1776.** Provisioning did not repair 755
tests; it revealed that 755 tests were never being executed. The r1 pin was measuring **57%
of the suite**. The rise from 15 to 23 stable-red failures is therefore **not a regression** —
it is previously-masked failures becoming visible, in files that could not even be imported
before. All 157 typecheck errors and all 73 collection failures traced to the single missing
generated artifact, exactly as r1's root cause stated.

### Three-run verification (worker contract §3 — worst run wins)

**Cluster A — typecheck.** 2 runs, both **exit 0 / 0 errors**, identical. Worst run =
**GREEN**. Durations 4s and 2s. Two runs suffice: counts and (empty) failure sets both match.

**Cluster B — vitest.** 3 runs required. Worst run = **RED, 26 failures**.

| Run | Exit | Tests | Files | Duration |
|---|---|---|---|---|
| post1 | 1 | 26 failed / 1750 passed (1776) | 20 failed / 197 (217) | 2769.99s |
| post2 | 1 | 26 failed / 1750 passed (1776) | 20 failed / 197 (217) | 3014.31s |
| post3 | 1 | **23** failed / 1753 passed (1776) | **18** failed / 199 (217) | 2615.29s |

**A third run was mandatory and the reason matters.** post1 and post2 report the *same count*
(26) but **not the same set**: `mono-panel` and the T9 cadence test failed only in post1;
both `grok-relay` tests failed only in post2. Two left, two entered, the total held at 26.
This is the second time in this ticket that a coincidence has held a failure count steady
while the underlying set moved (r1 did the same at 15). **A matching count is not evidence of
a matching set** — the stopping rule must be set-equality, not count-equality.

Denominators were perfectly stable across all three runs (1776 tests, 217 files), so
collection is now deterministic; only the failure set moves.

**Host-load caveat, measured.** Host load averaged **17 → 27 → 31** during these runs, with
five sibling lane worktrees running suites concurrently, and wall-clock inflated ~5x versus
the pre-provisioning run (515s → 2615–3014s). Embedded PostgreSQL uses ephemeral ports, so
port isolation held. These are measurements of the environment the runs executed in; this
report does **not** claim they caused any particular failure (see the r4 correction below).

### Solo isolation of the unstable five

Every test that was unstable across the three runs was re-run **solo** (its own `vitest run
<spec>` invocation, nothing else of mine running; foreign load average 15, 3 sibling vitest
processes still present — not a clean room, and reported as such).

| Suite re-run solo | Behaviour in full runs | Solo result | Classification |
|---|---|---|---|
| `acceptance/grok-relay.test.ts` (2 tests) | fail in post2 only | **9/9 passed**, exit 0 | UNSTABLE — cause CANNOT-ASSESS |
| `acceptance/mono-panel.test.ts` | fails in post1 only | **1/1 passed**, exit 0 | UNSTABLE — cause CANNOT-ASSESS |
| `tests/integration/pol03-pool-resilience.test.ts` | fails post1 + post2 | **3/3 passed**, exit 0 | UNSTABLE — cause CANNOT-ASSESS |
| `tests/integration/registration-database.test.ts` | T9 fails post1 only | **68/69 passed**; T9 **passed**, S3d still failed | T9 = UNSTABLE (CANNOT-ASSESS); S3d = STABLE-RED |

Logs: `logs/t0/solo-*.log`.

> **r4 CORRECTION (codex B1, adopted by D19a).** An earlier version of this section labelled
> these five **"contention artifacts"**, called them **"not defects"**, and reported the
> stable set as **"23 genuine"**. **Those causal labels were not supported by the probe and
> are withdrawn.** One solo PASS does not discriminate contention from ordinary intermittent
> failure: four of these five already passed in **2 of the 3** full runs and POL-03 passed in
> 1, so a single additional pass is an outcome the observed flakiness already predicts. The
> solo runs also carried residual foreign load (average 15, 3 sibling vitest processes) and
> so were never a true no-load condition. **The cause of the five is CANNOT-ASSESS.**
> Discriminating it would need a controlled record this seat did not produce — repeated
> serialized full-suite agreement, or a paired load/no-load probe.

What the evidence *does* establish, and all it establishes: the solo outcomes are real, and
the probe is **selective rather than blanket** — `registration-database` solo still fails on
the S3d RSS tripwire (`❯ tests/integration/registration-database.test.ts:4237`) while its T9
sibling *in the same file* passes. Selectivity shows the solo run is not simply laundering
the suite green; it does **not** establish why the five are unstable.

**Reconciled: 23 STABLE-RED (failed in all three runs) + 5 UNSTABLE (cause CANNOT-ASSESS).**
The 23 stable-red set is unchanged by this correction, so the b123 set-equality verdict
built on it stands.

---

## PRE-EXISTING FAILURES (POST-PROVISIONING)

All failures below predate this seat; this seat made zero edits to the primary checkout.
`X` = failed in that run. Union across the three runs = **28** = 23 stable-red + 5 unstable (cause CANNOT-ASSESS).

### D.0 — Banned-causal-word scan (r5, codex B1 cure)

The r4 cure corrected twelve label sites but left the withdrawn causal adjective standing in
the D.1 heading below. Cause of the miss: my r4 check grepped fixed lowercase **phrases**
rather than **tokens**, so the same word capitalised in a heading passed straight through.
The check is therefore now a token scan, published here so a reviewer re-runs my check rather
than inventing one.

**Scan rule.** A line is *live* unless it is a withdrawal quotation (blockquote, `^>`) or
sits inside a fenced code block. Both exclusions are principled: blockquotes are the retracted
wording, quoted and immediately negated; fenced blocks are verbatim command and log
transcripts, which are evidence rather than assertions — and one of them is necessarily the
scan pattern itself.

```console
$ R=.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t00-baseline.md
$ cat > /tmp/t0scan.awk <<'AWK'
/^[[:space:]]*```/ { infence = !infence; next }
infence           { next }
/^[[:space:]]*>/   { next }
{ print FNR ": " $0 }
AWK
$ awk -f /tmp/t0scan.awk "$R" | grep -inE 'genuine|contention|non-defect|not defects|not a defect'
$ awk -f /tmp/t0scan.awk "$R" | grep -icE 'genuine|contention|non-defect|not defects|not a defect'
0
```

**LIVE_MATCHES=0** — no live line in this report asserts any of the withdrawn causal words.

For auditability the tokens do still appear on exactly five blockquote lines (16, 17, 109,
110, 111): the explicit withdrawal quotations recording what was retracted.

```console
$ grep -cE '^[[:space:]]*>.*(genuine|contention|non-defect|not defects)' "$R"
5
```

Four live occurrences were cleared in r5: the D.1 heading; a disclaimer that named the
retracted cause in order to deny it; a sentence saying the five had *not* been shown to be
free of defect; and one unrelated sense of the adjective applied to TREL's fix. Only the
first was a live causal label — the other three carried no claim at all, but a token scan
cannot distinguish assertion from negation, so the wording was changed rather than the scan
weakened to accommodate it.

### D.1 — Stable-red in all three runs (23)

| P1 | P2 | P3 | Suite / file > test | vs r1 |
|---|---|---|---|---|
| X | X | X | `acceptance/adversarial-corpus.test.ts` > P4-13 approved adversarial relay corpus > executes DB-01 with no database locator or capability call | carried |
| X | X | X | `acceptance/dual-maker-proof.test.ts` > FAIR-02 dual-maker proof > round-trips one live call through BOTH makers and persists honest, never-blended lineage rows | **new (was masked)** — F8-dependent |
| X | X | X | `tests/architecture/s04-contract.test.ts` > S04 DDL and runtime attachment contract > DR-128 mints only the claim-type composition structure and wires a loud register read | carried |
| X | X | X | `tests/architecture/s10-carrier-erasure-red.test.ts` > S10 carrier erasure — RED acceptance contracts > filters completed private tombstones before any external key load | carried |
| X | X | X | `tests/architecture/s13-contract.test.ts` > S13 / cross-run memory architecture > lands append-only memory carriers without a closure job or embedding dependency | **new (was masked)** |
| X | X | X | `tests/architecture/s7-authorization-contract.test.ts` > Accounts S7 ownership architecture > hardens every immutable memory scope carrier and derives it from run ownership | carried |
| X | X | X | `tests/architecture/scaffold.test.ts` > P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law > enforces purity, one provider gateway, source-constant, exhaustive-switch and labeled-number gates | **new (was masked)** |
| X | X | X | `tests/architecture/scaffold.test.ts` > P1 / FX-ORPH-01 / FX-HR-H1 / FX-HR-H3 — structural law > matches all 28 dependency-edge rows and structural rules 1–5 | **new (was masked)** |
| X | X | X | `tests/integration/database.test.ts` > apps/runner — legal command lifecycle > claims, judges through the HTTP gateway, propagates, serves, and settles | **new (was masked)** |
| X | X | X | `tests/integration/memory-database.test.ts` > S13 / FX-S22-04 / FX-PT-MEM — real PostgreSQL memory path > does not link a legacy candidate after an ownership claim changes its effective scope | **new (was masked)** |
| X | X | X | `tests/integration/obs-l3-s06-runner-binding.test.ts` > S06 deployment linkage > evaluates the runner installer before the DB dependency in the real production entrypoint | **new (was masked)** |
| X | X | X | `tests/integration/obs-l3-s06-runner-binding.test.ts` > S06 provider gateway binding > captures one provider occurrence after the real gateway exhausts all attempts | **new (was masked)** |
| X | X | X | `tests/integration/obs-l3-s06-runner-binding.test.ts` > S06 runner task binding > captures the real task failure before terminal recording with declared context and Hatchet attempt index | **new (was masked)** |
| X | X | X | `tests/integration/obs-l3-s06-runner-binding.test.ts` > S06 runner task binding > preserves the original task failure when terminal recording fails and captures the recording alarm | **new (was masked)** |
| X | X | X | `tests/integration/registration-database.test.ts` > S3 registration and verification on real PostgreSQL > S3d post-hash main-process secondary RSS tripwire stays flat and counts every refusal | **new (was masked)** — confirmed solo |
| X | X | X | `tests/integration/s7-authorization-database.test.ts` > S7 real PostgreSQL ownership and IDOR boundary > locks every matching run before allocation while a rejected transfer is queued | **new (was masked)** |
| X | X | X | `tests/unit/load01-run-projection.test.ts` > LOAD-01 persisted run projection > reads the state only through the owning asker and prioritizes terminal failure | carried |
| X | X | X | `tests/unit/obs-l2-s04-zone.test.ts` > S04 semantic zone boundary > calls the resolver over the real mount-list source and runs ZI-1..ZI-4 | carried |
| X | X | X | `tests/unit/obs-l2-s04-zone.test.ts` > S04 semantic zone boundary > passes all 15 required falsification mutants | carried |
| X | X | X | `tests/unit/pro01-runner-tree.test.ts` > PRO-01 depth-driven pro/con expansion > stops a defender call loudly on the pinned RUN_COST_ENVELOPE_EXHAUSTED path | **new (was masked)** |
| X | X | X | `tests/unit/s6-content-encryption.test.ts` > S6 per-run private content encryption > defaults content encryption off, retires the v1 blind-index path, and requires wrapping-key paths | carried |
| X | X | X | `tests/unit/v2ui-node-runner.test.ts` > HYG-01 v2-ui Node test gate > keeps every active .test.mjs file in the explicit runner manifest | carried |
| X | X | X | `tests/unit/xrev01-node-review.test.ts` > XREV-01 cross-maker node review > stops a review loudly when the ratified model-call envelope is exhausted | **new (was masked)** |

9 carried from r1 · 14 newly visible once their files could be imported.

### D.2 — 5 UNSTABLE — cause CANNOT-ASSESS

Each failed in only some of the three runs and passed when re-run solo. **Their cause is
CANNOT-ASSESS** (r4 correction, D19a): a single solo pass does not discriminate between the
competing explanations for intermittency, and the solo runs carried residual host load. They are
excluded from the stable-red authority count because they are not stable-red — not because
their cause has been established either way. All five are timing- or signal-shaped assertions,
which is an observation about their shape, not a demonstrated cause.

| P1 | P2 | P3 | Suite / file > test | Solo |
|---|---|---|---|---|
| · | X | · | `acceptance/grok-relay.test.ts` > GROK-01 Grok Build CLI relay > refuses boot on a dead or unauthenticated CLI and never fabricates lineage | PASS |
| · | X | · | `acceptance/grok-relay.test.ts` > GROK-01 Grok Build CLI relay > uses the shared SIGKILL escalation when the Grok child ignores SIGTERM | PASS |
| X | · | · | `acceptance/mono-panel.test.ts` > DR-182 live mono-panel composition > boots and serves high-stakes depth 4 with the ruled cap and disclosures | PASS |
| X | X | · | `tests/integration/pol03-pool-resilience.test.ts` > POL-03 real PostgreSQL backend reset > survives an idle backend termination and reports in-flight and subsequent failures typed | PASS |
| X | · | · | `tests/integration/registration-database.test.ts` > T9 resend lock-order race through the real HTTP boundary > T9 counterbalances six resend windows with cadence-blocked family-wise equivalence | PASS |

### D.3 — Reconciliation against the r1 16-test union

| r1 status | Count | r2 disposition (r4 labels) |
|---|---|---|
| stable-red in r1, still stable-red | 9 | stable-red; in D.1 |
| stable-red in r1, **now passing** — all 5 `tests/render/ux01-new-debate-form.test.tsx` tests | 5 | **VANISHED.** These are render tests whose module graph reaches `@debateai/contract`; they were failing *because of* the missing artifact, and provisioning fixed them outright |
| r1 flaky — `tests/architecture/s9-dev-token-retirement-contract.test.ts` | 1 | **VANISHED.** Absent from all three post runs |
| r1 flaky — `tests/integration/pol03-pool-resilience.test.ts` | 1 | **RECLASSIFIED** as UNSTABLE (D.2), cause CANNOT-ASSESS |
| **r1 union** | **16** | 9 stable-red · 6 vanished · 1 reclassified UNSTABLE |

Newly visible in r2 that r1 could not see at all: **14** (their files failed collection).

**23 stable-red = 9 carried + 14 newly visible.**

### D.4 — Note for lane TREL / F8

`acceptance/dual-maker-proof.test.ts > FAIR-02 … round-trips one live call through BOTH
makers` is stable-red in all three post runs and structurally requires **both** relay
binaries, which F8 shows are hardcoded to an absent user's home. `acceptance/mono-panel.test.ts`
likewise needs a relay to boot and currently only passes solo. Expect both to move when TREL
lands; treat them as TREL acceptance signals rather than independent defects.

### D.5 — Aborted run, orchestrator-caused (not suite instability)

The first `test-post1`/`test-post2` double-run was terminated by an orchestrator janitor
sweep that misread the detached task's empty stdout (output was redirected to the log files
by design). A second attempt at `test-post2` was likewise killed mid-flight — `TEST_EXIT=143`
(SIGTERM), ~40 minutes in, embedded PostgreSQL logging `received fast shutdown request`, no
summary block produced. **Neither abort is evidence about the suite** and neither is counted
anywhere above. Both aborted stubs were overwritten by clean re-runs; the surviving
`test-post1/2/3` logs each contain a complete summary block. Mitigation adopted for the
re-runs: `nohup` + `disown` + a `.done` sentinel file, so completion is judged from an
artifact on disk rather than from a supervisor's view of stdout.

### D.6 — Post-provisioning REPRO

```bash
cd /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine
git rev-parse --short HEAD                       # 1c9578a
test -f packages/contract/generated/client.ts    # MUST exist (D9 provisioning)
L=.hermes/reports/2026-09-01-algorithm-live-loop/logs/t0
{ pnpm run typecheck; echo "TYPECHECK_EXIT=$?"; } > "$L/typecheck-post1.log" 2>&1   # exit 0, no output
{ pnpm test;          echo "TEST_EXIT=$?";      } > "$L/test-post1.log"      2>&1   # exit 1
# stopping rule: compare failure SETS, not counts
grep -E '^ *FAIL .* > ' "$L/test-post1.log" | sed 's/^ *FAIL  *//' | sort -u
# isolate any unstable member
./node_modules/.bin/vitest run <spec>
```

Run the suite at least three times unless the failure **sets** match, and re-run any unstable
member solo before recording it as a failure. Under concurrent lane load expect ~2600–3000s
per run versus ~515s idle.

---

## CEREMONY RECORD (POST-TREL, D17)

**Verdict: the run SETTLED; the FAIR-01 gate correctly REFUSED it.** Discovered panel was
**M=1**, not the M=2 D17 expected — twice, on two independent runs. Status:
`waiting_resource` — a second, independent blocker behind F8, named in
`## CEREMONY BLOCKER (r3)` below.

**Two ceremony runs exist and they are not equal in evidentiary weight.** Run 2 (D19b,
capture-disciplined) is the **record**; run 1 (r3) is retained as **testimony** because its
recovery was never captured. Both are reported below, labelled.

Tree, verified by this seat before each attempt: `lane/trel @ 4aa9832` =
`1c9578a` + acceptance-only relay fix. `git diff --stat 1c9578a -- . ':(exclude)acceptance'`
is **empty** — every product package byte-identical to baseline, exactly as D17 states. The
acceptance-only diff is 8 files (claude-relay, grok-relay, model-shim, relay-core + tests).
`packages/contract/generated/client.ts` present. Env unchanged from D17 between the two runs;
only ports and the generated credential differ.

### RECORD-GRADE evidence — run 2 (capture-disciplined, D19b)

Every field below is re-derivable from `logs/t0/ceremony2.log` (full stdout+stderr) and
`logs/t0/ceremony2-recovery.log` (every recovery query **and** its verbatim result, captured
**before** the data directory was deleted). Query ids `Q1`–`Q8` refer to that transcript.

| Field | Value | Source |
|---|---|---|
| Command | `./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential <43>` | `ceremony2.log:5` |
| Exit | **1** — `TypedDomainError` `FAIR_DEBATE_NODE_COUNT_UNSATISFIED` | `ceremony2.log:83,90,94` |
| Wall-clock | `2026-09-01T10:34:52Z` → `10:36:04Z` (72s) | `ceremony2.log:1,95` |
| **Discovered panel** | **M=1** — `acceptance:codex-cli` (OpenAI) only | Q1 |
| Makers HEALTHY | `OpenAI` / `gpt-5.6-sol` — 2 rows (boot `10:35:12.638Z`, claim-time `10:35:18.391Z`) | Q1 |
| Makers ABSENT | `Anthropic` `CLAUDE_CLI_FAILED` · `xAI` `GROK_CLI_FAILED` | Q1 |
| Depth | default `{"depth":1}` | CLI default, `run-acceptance.ts` |
| **Run id** | **`29b2d42d-9fc0-41cb-aca2-94599b6dc076`** | Q3 |
| **Answer id** | **`4c7c5d38-351e-4fa9-b3fa-6b9144530469`** | Q4 |
| Answer state | terminal `DOWNGRADED` · serve `COMPOSED` · verdict `SUPPORTED` | Q4 |
| Confidence | band `CAPPED` | Q4 |
| **Probe-evidence rows** (`core.provider_probe`) | **4** | Q2 |
| Answer graph nodes | **1** (`node_id b42e0b11-…`, depth 0) — the fact FAIR-01 rejected | Q5, Q6 |
| **Condition marks on the answer** | `SINGLE-LINEAGE` · `CRITIQUE-UNAVAILABLE` · `OWED-CHECK-UNEXECUTED` · `UNRESOLVED-TYPE-FALLBACK` | Q4 |
| Condition-mark rows total | **24** = **20**× `OWED-CHECK-UNEXECUTED` + **2**× `UNRESOLVED-TYPE-FALLBACK` + **1**× `CRITIQUE-UNAVAILABLE` + **1**× `SINGLE-LINEAGE` | Q7, Q8 |
| Provider spend | one codex boot handshake + one codex claim-time probe + the depth-1 debate calls | Q1 |

> **r4 CORRECTION (codex B3).** The r3 version of this row read
> "24 (…, **21**× `OWED-CHECK-UNEXECUTED`, …)", whose parts summed to **25** against a stated
> total of **24** — an internally inconsistent row, correctly caught. Settled from primary
> evidence: the multiplicity is **20**, and 20+2+1+1 = **24**, matching the independent
> `count(*)` in Q8. The **total was right; the multiplicity was the transcription error.**

Gate error, verbatim (`ceremony2.log:83,90`):

```
TypedDomainError: DR-140(b): the answer graph carries 1 node(s); a fair debate requires more than one
  code: 'FAIR_DEBATE_NODE_COUNT_UNSATISFIED'
  at evaluateFairDebate (acceptance/fair-debate.ts:53:11)
```

### TESTIMONY-GRADE — run 1 (uncaptured recovery, retained per D19b)

The first attempt (`logs/t0/ceremony-post-trel.log`, exit 1, wall-clock
`10:06:48Z`→`10:08:01Z`) produced **run id `67a294c8-3534-4763-bab9-7bc71e984706`** and
**answer id `fed8007d-a838-4148-b049-da2ec9fd200d`**, with `HYPOTHESIS_WITH_RESEARCH_PLAN`
answer form and ceiling `REASONING_CEILING` (basis REASONING=1, RAN=0, LOOKED_UP=0,
lift `gather-evidence-to-lift`). **Those values are testimony-grade only**: the recovery
queries behind them were never captured to a log, so no reviewer can re-derive them. Codex
B2 was right to refuse them as evidence, and they are retained here as testimony, not as
record.

**Run 2 independently reproduces every structural fact of run 1** — M=1 panel with the same
three probe outcomes, 4 probe rows, a 1-node depth-0 graph, the same four answer marks, the
same `DOWNGRADED`/`COMPOSED`/`SUPPORTED`/`CAPPED` states, and the same gate refusal — with
fresh ids. The r3 testimony is therefore corroborated in substance while remaining
unverifiable in its specific ids.

**Read this correctly: three separate things are true.** (1) The engine behaved exactly as
DR-182 rules for a one-maker panel — it composed and sealed an answer with honest
`SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE` disclosures and a capped band. (2) The FAIR-01 gate
was right to refuse it: with M=1 there is one root and no cross-maker attack edge, so a
1-node graph is the *correct* output, and a fair debate needs more. (3) The environment is
wrong. `CEREMONY_EXIT=1` flattens all three into "the ceremony failed" — it did not; the run
settled and only the gate refused.

### How the record was captured (D19b capture order)

The ceremony throws at the gate **before** its reporting block, so stdout carries only the
typed error — no panel, run id, answer id, probe count or marks. Verified again on run 2:
grepping `ceremony2.log` for run/answer/panel returns **0** matches. The facts live only in
the database.

Run 2 therefore followed the mandatory D19b order, and the logs prove each step:

1. **Ceremony** — full stdout+stderr teed to `logs/t0/ceremony2.log`.
2. **Recovery BEFORE deletion** — the embedded PostgreSQL is shut down by the ceremony but
   `acceptance/.pgdata` is not removed, so it was restarted on the same port and every query
   **and its verbatim result** teed to `logs/t0/ceremony2-recovery.log` (Q1–Q8 over
   `core.provider_probe`, `core.run`, `core.node`, `serve.answer`, `serve.condition_mark`),
   then stopped. Zero additional provider cost.
3. **Deletion last** — the caller-owned directory was removed only after capture; the log
   records `PGDATA_AFTER_DELETE=ABSENT` as proof of ordering.

Leaving a `.pgdata` standing is the documented `ACCEPTANCE_REGISTER_VERSION_CONFLICT` trap
for the next ceremony, and the packet permits this seat to destroy exactly the temp DB its
own run created. Post-run state verified: `lane-trel` unmodified (`git status --porcelain`
empty, HEAD `4aa9832`), ports 52256–52259 clear.

**The r3 failure this fixes:** run 1's recovery was performed with the same queries but the
results were only read in the terminal, never written to a log — so the facts were
unreviewable and codex B2 correctly refused them. *Running the query is not the evidence;
capturing it is.* An uncaptured read is indistinguishable from an assertion.

## CEREMONY BLOCKER (r3)

**TREL's fix worked. A second blocker was hiding behind it.**

`ACCEPTANCE_CLAUDE_BINARY` resolved correctly — the relay spawned
`/Users/stefan.nour/.local/bin/claude` and received a real JSON envelope from it. F8 is
fixed. The relay nevertheless failed to authenticate. Reproduced with the relay's
**exact** argument vector and child environment
(`logs/t0/relay-handshake-repro.log`, exit 1):

```
"is_error": true, "terminal_reason": "api_error", "modelUsage": {},
"result": "Not logged in · Please run /login"
```

Root cause: `claudeAdapter.buildArguments` passes **`--setting-sources ""`**
(`acceptance/claude-relay.ts:130`), which severs the CLI's own settings/keychain login, while
`buildCliChildEnvironment` admits only two credential carriers —
`ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN`. In a correctly sanitized ceremony
environment **neither exists on this host**, so the relay has no credential path at all. Each
mechanism is individually defensible; together they forbid every way this host can
authenticate. `modelUsage: {}` (zero models) would independently trip
`CLAUDE_CLI_MODEL_UNRESOLVED` had the nonzero exit not fired first.

**This is not a TREL regression** — it is the next blocker in the stack, invisible until the
binary resolved. Passing this seat's own `ANTHROPIC_API_KEY` would "fix" it dishonestly: that
key is an agent-session gateway credential whose `ANTHROPIC_BASE_URL` is *not* on the relay
allowlist, so it would be used against the wrong endpoint and would contaminate the
measurement (r1 finding 5). Not done, and not recommended.

**Decision owed above this seat**, one of: (a) drop `--setting-sources ""` from the claude
adapter so the CLI's keychain login is reachable; (b) add a third credential path to the
allowlist; or (c) provision `CLAUDE_CODE_OAUTH_TOKEN` on this host — a credential operation
this seat must not perform.

### Preflight divergence — third instance in this ticket

The packet's prescribed preflight **passed** (`claude -p 'ping' --output-format json`, exit 0)
minutes before the relay's handshake failed on the same binary and the same sanitized env.
The only difference is the argument vector. Across this ticket the preflight has now diverged
from the code it gates three times:

| Round | Preflight | Relay | Divergence |
|---|---|---|---|
| r1 | `claude` via **PATH** → OK | spawned a **hardcoded absolute path** | resolution mechanism |
| r1 | (untested) | child env is an **allowlist**, not the parent env | environment |
| r3 | **bare** `-p ping --output-format json` → OK | adds **`--setting-sources ""`** → not logged in | argument vector |

**Recommendation (F-PREFLIGHT-PARITY):** export the adapter's own `buildArguments` and
`buildCliChildEnvironment` and have the preflight call them, so a preflight cannot drift from
the relay because it *is* the relay.

### Additional finding — F-CEREMONY-REPORT-ORDER

`run-acceptance.ts` establishes the discovered panel, run id, answer id and probe count long
before it asserts FAIR-01, but prints them only in a final block **after** the gate. A gate
failure therefore destroys the operator's visibility into a run that *did* settle. Emit those
facts when established. Non-blocking; named per worker contract §5.

### Ceremony REPRO (post-TREL, D17)

```bash
cd /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-trel/dialectical-engine
git rev-parse --short HEAD                        # 4aa9832 (lane/trel)
test -f packages/contract/generated/client.ts
CRED=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
printf '%s' "$CRED" | grep -qE '^[A-Za-z0-9_-]{43}$' || exit 1
read DB API SHIM GROK <<<"$(node -e '
const net=require("net");const g=[];(async()=>{while(g.length<4){
const p=await new Promise(r=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const q=s.address().port;s.close(()=>r(q));});});
if(!g.includes(p))g.push(p);}console.log(g.join(" "));})();')"
env -i HOME="$HOME" PATH="$PATH" USER="$USER" SHELL="$SHELL" TMPDIR="$TMPDIR" LANG="${LANG:-en_US.UTF-8}" \
  ACCEPTANCE_DB_PORT="$DB" ACCEPTANCE_API_HOST=127.0.0.1 ACCEPTANCE_API_PORT="$API" \
  ACCEPTANCE_SHIM_PORT="$SHIM" ACCEPTANCE_GROK_RELAY_PORT="$GROK" \
  ACCEPTANCE_STRANGER_SAMPLE_RATE=1 ACCEPTANCE_BATTERY_VERSION=acceptance-v1 \
  ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:t0-baseline \
  ACCEPTANCE_CLAUDE_BINARY=/Users/stefan.nour/.local/bin/claude \
  ./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential "$CRED" < /dev/null
```

The ninth variable (`ACCEPTANCE_CLAUDE_BINARY`) is safe precisely because of the F11
correction above. Expect `FAIR_DEBATE_NODE_COUNT_UNSATISFIED` until the credential blocker is
ruled. To recover the record after a gate failure, follow the D19b capture order: restart
`acceptance/.pgdata` on the same port, **tee every query and its result to a log**, query
`core.provider_probe` / `core.run` / `core.node` / `serve.answer` / `serve.condition_mark`
(the mark multiplicity needs `group by mark` **and** a separate `count(*)`, or the row is
not self-checking — see codex B3), stop the server, and only then remove the directory.

---

# T0 BASELINE r1 (pre-provisioning trap record — retained under D9)

Seat: Opus 5, session `opus-t00-w0`. Working directory
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine`.
Checkout verified at `dev@1c9578a` (`1c9578a24d5aedd0302fbda5593f66277cd87b98`) before and
after all work. Zero edits to the primary checkout: `git status --porcelain` at close shows
only the pre-existing ` M dialectical-engine/.hermes/TOOLING-TRAPS.md` (already modified at
session start, not by this seat) and the two untracked `.hermes/reports/` mission
directories.

**Status: `waiting_resource`.** Pins 1 and 2 (typecheck, vitest) are complete and
reviewable. Pin 3 (ceremony) cannot produce its DoD deliverable — the settled run id /
answer id — because this checkout is missing a generated build artifact that no seat with
my contract may create. Details in `## CEREMONY RECORD` and `## BLOCKER`.

---

## PINS

| # | Command | Exit | Counts / ids | Log |
|---|---|---|---|---|
| 1 | `pnpm run typecheck` | **1** | 157 tsc errors across 39 files (3/3 runs identical) | `logs/t0/typecheck.log`, `typecheck-run2.log`, `typecheck-run3.log` |
| 2 | `pnpm test` | **1** | **15 failed / 1006 passed (1021 tests)**; **83 failed / 134 passed (217 test files)** — identical counts in 3/3 runs | `logs/t0/test.log`, `test-run2.log`, `test-run3.log` |
| 3 | `./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential <43>` | **1** | **no run id · no answer id** — `ERR_MODULE_NOT_FOUND` at import, 1s in | `logs/t0/ceremony.log` |

Every number above is re-derivable from the named log by the greps in `## REPRO §4`.

### Three-run cluster verification (worker contract §3 — worst run wins)

**Cluster A — typecheck.** Worst run = **RED (exit 1)**.

| Run | Exit | Errors | Error set |
|---|---|---|---|
| 1 | 1 | 157 | baseline |
| 2 | 1 | 157 | byte-identical to run 1 |
| 3 | 1 | 157 | byte-identical to run 1 |

Run 1 wall-clock 59s, of which **42.7s was a cold `pnpm install`** (388 packages) that pnpm
performed inside the script; runs 2 and 3 took 6s and 2s. The install is a one-time
node_modules materialisation on this OneDrive-backed checkout, **not** part of the
steady-state command — do not attribute it to `tsc`.

**Cluster B — vitest.** Worst run = **RED (exit 1)**. Durations 515.22s / 573.17s / 522.33s.

| Run | Exit | Tests | Test Files |
|---|---|---|---|
| 1 | 1 | 15 failed / 1006 passed (1021) | 83 failed / 134 passed (217) |
| 2 | 1 | 15 failed / 1006 passed (1021) | 83 failed / 134 passed (217) |
| 3 | 1 | 15 failed / 1006 passed (1021) | 83 failed / 134 passed (217) |

**The stable count hides real flakiness — this is the most important finding in the pin.**
The failure COUNT is 15 in every run, but the failure MEMBERSHIP is not: two tests traded
places between runs, holding the total at 15 by coincidence. The union of tests that failed
at least once is **16**, not 15. A single-run baseline would have named one flaky test as a
pre-existing failure and left the other entirely invisible.

**Cluster C — ceremony.** Run **once only**, as the packet mandates (provider spend, one
attempt after preflight). No three-run verdict is available and none is claimed.

---

## PRE-EXISTING FAILURES

All failures below predate this seat: this seat made **zero** edits to the primary checkout.

### C.1 — vitest, individually-failing tests (union across 3 runs = 16)

`X` = failed in that run. Stable-red in all three runs unless marked FLAKY.

| R1 | R2 | R3 | Suite / file > test |
|---|---|---|---|
| X | X | X | `acceptance/adversarial-corpus.test.ts` > P4-13 approved adversarial relay corpus > executes DB-01 with no database locator or capability call |
| X | X | X | `tests/architecture/s04-contract.test.ts` > S04 DDL and runtime attachment contract > DR-128 mints only the claim-type composition structure and wires a loud register read |
| X | X | X | `tests/architecture/s10-carrier-erasure-red.test.ts` > S10 carrier erasure — RED acceptance contracts > filters completed private tombstones before any external key load |
| X | X | X | `tests/architecture/s7-authorization-contract.test.ts` > Accounts S7 ownership architecture > hardens every immutable memory scope carrier and derives it from run ownership |
| X | X | X | `tests/render/ux01-new-debate-form.test.tsx` > UX-01 DR-181 discovery-owned rendered /new flow > R3 exposes aria-controls exactly while the rendered Options panel exists |
| X | X | X | `tests/render/ux01-new-debate-form.test.tsx` > UX-01 … > does not emit caller-supplied owner or privilege claims for any authenticated token |
| X | X | X | `tests/render/ux01-new-debate-form.test.tsx` > UX-01 … > keeps the visible risk choice asker-owned through the real page |
| X | X | X | `tests/render/ux01-new-debate-form.test.tsx` > UX-01 … > renders depth 1..5 while keeping retired apparatus and all machine-owned fields out of the DOM |
| X | X | X | `tests/render/ux01-new-debate-form.test.tsx` > UX-01 … > submits the complete discovery-owned ask without an agent-count field |
| X | X | X | `tests/unit/load01-run-projection.test.ts` > LOAD-01 persisted run projection > reads the state only through the owning asker and prioritizes terminal failure |
| X | X | X | `tests/unit/obs-l2-s04-zone.test.ts` > S04 semantic zone boundary > calls the resolver over the real mount-list source and runs ZI-1..ZI-4 |
| X | X | X | `tests/unit/obs-l2-s04-zone.test.ts` > S04 semantic zone boundary > passes all 15 required falsification mutants |
| X | X | X | `tests/unit/s6-content-encryption.test.ts` > S6 per-run private content encryption > defaults content encryption off, retires the v1 blind-index path, and requires wrapping-key paths |
| X | X | X | `tests/unit/v2ui-node-runner.test.ts` > HYG-01 v2-ui Node test gate > keeps every active .test.mjs file in the explicit runner manifest |
| X | X | · | **FLAKY** — `tests/architecture/s9-dev-token-retirement-contract.test.ts` > S9 dev-token retirement architecture contract > removes the header and resolver from every non-historical source |
| · | · | X | **FLAKY** — `tests/integration/pol03-pool-resilience.test.ts` > POL-03 real PostgreSQL backend reset > survives an idle backend termination and reports in-flight and subsequent failures typed |

14 stable-red · 2 flaky · union 16.

### C.2 — vitest, whole-FILE collection failures (73 files never loaded)

`Test Files 83 failed` = the ~10 files holding the C.1 test failures, plus **73 files that
failed at COLLECTION and whose tests therefore never entered the 1021 denominator**. The
1021 total understates the suite: the real test population is larger by whatever those 73
files contain.

Cause breakdown over the 66 reported error blocks in `test.log`:

| Occurrences | Error |
|---|---|
| 50 | `Failed to resolve entry for package "@debateai/contract". The package may have incorrect main/module/exports specified in its package.json.` |
| 6 | `Failed to resolve import "@debateai/contract" from …` (`web/lib/api.ts`, `apps/ui/lib/api.ts`, `apps/ui/components/LegacyRunClaimControls.tsx`, `tests/support/v2uiFixtures.ts`, `tests/render/auth-flow-integration.test.tsx`) |
| 3 | `Error: ZONE_REGION_MODIFIED` |
| 1 | `[vitest] There was an error when mocking a module` (vi.mock hoisting) |
| 1 | `Test timed out in 120000ms.` |

**56 of the 66 error blocks are the single missing `@debateai/contract` entry point.**

### C.3 — typecheck, 157 errors across 39 files

By TypeScript code:

| Count | Code | Meaning |
|---|---|---|
| 58 | TS7006 | Parameter implicitly has an `any` type |
| 40 | TS2307 | **Cannot find module `@debateai/contract`** (all 40) |
| 23 | TS18046 | Value is of type `unknown` |
| 12 | TS2339 | Property does not exist on type `{}` |
| 10 | TS2366 | Function lacks ending return statement |
| 10 | TS18047 | Value is possibly `null` |
| 4 | TS2345 | Argument of type `any` not assignable to `never` |

Highest-count files: `apps/api/src/index.ts` (26), `tests/integration/database.test.ts` (21),
`apps/ui/lib/v3/adapter.ts` (20), `apps/runner/src/index.ts` (12),
`tests/unit/v2ui-data-layer.test.ts` (9), `apps/ui/lib/serverApi.ts` (8),
`apps/ui/lib/v3/tokenUnlock.ts` (7). Full list re-derivable per `## REPRO §4`.

The 40 TS2307s are the direct hit; the TS7006/TS18046/TS2339/TS2345 bulk is largely the
downstream inference collapse where `@debateai/contract` types would otherwise flow.

---

## CEREMONY RECORD

The ceremony **never booted**. It exited at ESM module resolution one second after start,
before the standing database, before `seedAcceptanceRegister`, before any relay start, and
before any provider call.

| Field | Value |
|---|---|
| Panel discovered | **NONE** — discovery never executed |
| Makers | **NONE** reached (no handshake attempted by the ceremony) |
| Depth | default `{"depth":1}` would have applied; never reached |
| Run id | **NONE** |
| Answer id | **NONE** |
| Probe-evidence count (`core.provider_probe`) | **0** — no database was provisioned |
| Condition marks printed | **NONE** |
| Provider spend | **ZERO** |
| Wall-clock | `2026-09-01T05:52:10Z` → `05:52:11Z` |

Verbatim typed error (`logs/t0/ceremony.log:10`, quoted exactly):

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/node_modules/@debateai/contract/generated/client.ts' imported from /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/acceptance/run-acceptance.ts
```

with `code: 'ERR_MODULE_NOT_FOUND'` and `url: 'file:///…/node_modules/@debateai/contract/generated/client.ts'`. Node v25.7.0.

### Preflight (all three packet conditions satisfied before the attempt)

1. **Ports probed free** — 61422 (DB), 61423 (API), 61424 (SHIM), 61425 (GROK relay); each
   confirmed free by `lsof -nP -iTCP:<p> -sTCP:LISTEN`, and confirmed clear again after the
   attempt (no leaked listeners, no stray postgres).
2. **Credential format-verified** — 43 chars, matches `/^[A-Za-z0-9_-]{43}$/`, the exact
   regex at `acceptance/run-acceptance.ts:75`. Value withheld from this report and from
   every log.
3. **`claude -p 'ping' --output-format json` handshake — SUCCEEDED**, exit 0, after the one
   sanitized-env retry the packet authorises.
   - First attempt (inherited session env): **hung, killed at 3m**. Emitted only
     `[claude-code:unrecognized_model] {"model":"deepseek-v4-flash-sovereign","query_source":"sdk"}`.
     Cause: this agent session exports `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`, which
     the child CLI inherited. Log: `logs/t0/preflight-claude.log`.
   - Retry with `env -i HOME PATH USER SHELL TMPDIR LANG`: **exit 0**, real JSON envelope,
     `is_error: false`, `subtype: "success"`, `num_turns: 1`, `duration_ms: 1976`, and
     `modelUsage` carrying **exactly one** key — satisfying `resolveClaudeModel`, which
     throws `CLAUDE_CLI_MODEL_UNRESOLVED` on zero or several. Log:
     `logs/t0/preflight-claude-sanitized.log`.

The ceremony was therefore run **once**, under the sanitized env, exactly as the packet
permits. One attempt, spent.

### What the panel would have been (measured, not speculated)

Even with the module resolved, the discovered panel on this host would be **M=1**, not the
M=2 that packet §2 and DECISIONS D6 assert. The relay binaries are hardcoded absolute paths:

| Declared at | Path | On this host |
|---|---|---|
| `acceptance/claude-relay.ts:27` | `/Users/vladmihaimiron/.local/bin/claude` | **MISSING** |
| `acceptance/grok-relay.ts:12` | `/Users/vladmihaimiron/.grok/bin/grok` | **MISSING** |
| `acceptance/model-shim.ts:15` | `/Applications/ChatGPT.app/Contents/Resources/codex` | EXECUTABLE |

This host's users are `Shared`, `administrator`, `stefan.nour` — there is no
`vladmihaimiron`. The relays do **not** resolve via `PATH`, so the working
`/Users/stefan.nour/.local/bin/claude` is unreachable to them, and there is no env override:
the binaries are `as const` literals and `resolveTestGuardedCommand` throws unless
`NODE_ENV === "test"`.

Consequence: `startClaudeRelay` and `startGrokRelay` would both reject; `run-acceptance.ts`
tolerates this (`Promise.allSettled`, then a `core.provider_probe` row with `state: "ABSENT"`
per failed relay) and would proceed with codex alone. **D6's premise is false on this
host** — claude is absent from the relay's point of view too, not just grok. A mono panel is
lawful under DR-182, but M=1 does not satisfy the FAIR-01 fair-debate gate (which requires an
attack edge joining nodes of DIFFERENT makers) nor the M≥2 global DoD.

---

## BLOCKER

**Root cause, single and shared by all three pins:** `packages/contract/package.json`
declares `"exports": "./generated/client.ts"`, and `packages/contract/generated/` **does not
exist** in this checkout. `packages/contract/` contains only `node_modules`, `package.json`,
`src`.

That artifact is produced by `pnpm run generate:contract`
(`tsx packages/contract/src/generate.ts`, source present), which is the **first step of
`pnpm run build`**:

```
build = pnpm run generate:contract && pnpm run typecheck && pnpm --filter dialectical-engine-web build
```

It is **not** a step of `typecheck` or of `test`. So both pinned commands, and the ceremony,
silently presuppose a prior `build` that has never run here.

**Why this seat cannot clear it.** Generating the artifact writes
`packages/contract/generated/client.ts` into the primary checkout. Mission DECISIONS D5 and
my ticket contract make the entire primary checkout readonly — "command execution allowed,
ZERO file edits". The remedy is one command, but it is not mine to run.

**Decision owed above this seat** — either:

- (a) authorise `pnpm run generate:contract` as part of the T0 baseline environment and
  re-run all three pins against a generated checkout (the pins above then become the
  "ungenerated checkout" baseline, which is still worth keeping); or
- (b) re-scope T0's ceremony DoD, acknowledging that on this host the panel is M=1 for the
  independent hardcoded-binary reason above.

Note (a) does not by itself rescue the ceremony's M≥2 expectation; the binary-path defect is
a separate blocker that survives it.

### Deviation from the packet's BLOCKED branch, stated openly

The packet conditions `waiting_resource` on the **claude relay handshake failing**. That is
not what happened: my handshake **succeeded** (exit 0). The ceremony was defeated by a cause
the packet did not contemplate, which is likewise outside my write contract and likewise
prevents the DoD. I applied the packet's prescribed disposition — status `waiting_resource`,
the `BLOCKED` marker line verbatim, and typecheck and vitest delivered in this same report —
because it plainly fits. Flagging the mismatch rather than absorbing it (worker contract §1).

---

## FINDINGS (worker contract §5 — named, not fixed by this seat)

1. **`packages/contract` entry point is a build artifact absent from the checkout.**
   `packages/contract/package.json` `exports: "./generated/client.ts"`. Blocking; see
   `## BLOCKER`.
2. **`pnpm run typecheck` and `pnpm test` are not honest standalone commands.** Their
   dependency on `generate:contract` lives only inside the `build` script's `&&` chain. A
   `pretypecheck` / `pretest` hook would delete this whole failure class.
3. **Relay binaries hardcoded to a foreign user's home** —
   `acceptance/claude-relay.ts:27`, `acceptance/grok-relay.ts:12`. Non-blocking today only
   because finding 1 fires first; blocking for any live ceremony on any host but the author's.
   Suggest runtime resolution with a typed loud `*_CLI_BINARY_UNRESOLVED`.
4. **Two flaky tests**, each of which changes the pre-existing-failure list run to run:
   `tests/architecture/s9-dev-token-retirement-contract.test.ts` (red R1,R2 / green R3) and
   `tests/integration/pol03-pool-resilience.test.ts` (green R1,R2 / red R3).
5. **The claude adapter's env allowlist leaks the caller's API key.**
   `relay-core.ts buildCliChildEnvironment` passes `COMMON = [HOME, PATH, TMPDIR, LANG]` plus
   the adapter's `authEnvironmentKeys`, which for claude include `ANTHROPIC_API_KEY`. An
   agent-hosted run therefore hands its own key to the relay child while
   `ANTHROPIC_BASE_URL` is filtered out — a silently contaminated measurement. The P4-01
   comment says subprocesses "never inherit the API environment"; the allowlist partially
   contradicts it.
6. **Mission `INSTRUCTIONS.md` is absent and `slices/` is empty** (no `SPEC.md`, no
   `PLAN.md`), which worker contract §1 requires be read before writing. Non-blocking for a
   pure-measurement ticket; will block a code lane.
7. **A TOOLING-TRAPS.md append is owed and could not be made** — that file is outside my
   exhaustive `allowed` list, so I did not touch it. Traps paid for this round are recorded
   in my self-report §2/§3/§5: the nested-CLI hang and its sanitized-env fix; the cold
   install hiding inside the first `pnpm run typecheck`; `stderr` being drained at
   `relay-core.ts:157` so relay parse failures are never a stderr artefact.

---

## REPRO

A second worker can replay this record from the four blocks below alone.

**§1 — Position.**

```bash
cd /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine
git rev-parse HEAD        # expect 1c9578a24d5aedd0302fbda5593f66277cd87b98 (branch dev)
```

Host facts at pin time: macOS (Darwin 25.6.0, arm64), node **v25.7.0** (package.json wants
22.23.1 — pnpm prints `Unsupported engine` on every run), pnpm 11.20.0, `claude` and `codex`
on PATH, `grok` absent.

**§2 — Pins 1 and 2.** No special environment; run from the directory above.

```bash
L=.hermes/reports/2026-09-01-algorithm-live-loop/logs/t0; mkdir -p "$L"
{ pnpm run typecheck; echo "TYPECHECK_EXIT=$?"; } > "$L/typecheck.log" 2>&1
{ pnpm test;          echo "TEST_EXIT=$?";      } > "$L/test.log"      2>&1
```

Expect exit 1 from both. The FIRST `pnpm run typecheck` on a cold checkout also performs a
388-package install (~43s); subsequent runs do not. Run each three times — vitest's failure
membership is not stable (finding 4).

**§3 — Pin 3, the ceremony.** Preflight first, then exactly one attempt.

```bash
# a. credential (43 chars, matches run-acceptance.ts:75). Keep the value out of logs.
CRED=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
printf '%s' "$CRED" | grep -qE '^[A-Za-z0-9_-]{43}$' || { echo BAD_CREDENTIAL; exit 1; }

# b. four free local ports
read DB API SHIM GROK <<<"$(node -e '
const net=require("net");const g=[];(async()=>{while(g.length<4){
const p=await new Promise(r=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const q=s.address().port;s.close(()=>r(q));});});
if(!g.includes(p))g.push(p);}console.log(g.join(" "));})();')"
for p in $DB $API $SHIM $GROK; do lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null && echo "BUSY $p"; done

# c. handshake — MUST use the sanitized env from an agent session, or it hangs (~3 min)
env -i HOME="$HOME" PATH="$PATH" USER="$USER" SHELL="$SHELL" TMPDIR="$TMPDIR" LANG="${LANG:-en_US.UTF-8}" \
  claude -p 'ping' --output-format json < /dev/null

# d. the one attempt — same sanitized env, plus the 8 strict ACCEPTANCE_* keys
env -i HOME="$HOME" PATH="$PATH" USER="$USER" SHELL="$SHELL" TMPDIR="$TMPDIR" LANG="${LANG:-en_US.UTF-8}" \
  ACCEPTANCE_DB_PORT="$DB" ACCEPTANCE_API_HOST=127.0.0.1 ACCEPTANCE_API_PORT="$API" \
  ACCEPTANCE_SHIM_PORT="$SHIM" ACCEPTANCE_GROK_RELAY_PORT="$GROK" \
  ACCEPTANCE_STRANGER_SAMPLE_RATE=1 ACCEPTANCE_BATTERY_VERSION=acceptance-v1 \
  ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:t0-baseline \
  ./node_modules/.bin/tsx acceptance/run-acceptance.ts --service-credential "$CRED" < /dev/null
```

Those 8 keys are exhaustive and mandatory — **but extra environment keys are harmless.**

> **r3 CORRECTION (F11).** The original sentence here read: *"`ceremonyEnvironmentSchema` in
> `acceptance/main.ts:65` is `.strict()`, so an extra key is as fatal as a missing one."*
> **That was FALSE.** `loadAcceptanceCeremonyEnvironment` (`acceptance/main.ts:85-89`)
> **projects** the environment onto the schema's own keys *before* parsing —
> `ceremonyEnvironmentSchema.parse(Object.fromEntries(keys.map((k) => [k, source[k]])))` —
> so an unrecognised variable never reaches `.parse()` and `.strict()` never sees it.
> Verified empirically by this seat: passing `ACCEPTANCE_TOTALLY_BOGUS_EXTRA_KEY=nonsense`
> alongside the eight real keys parses successfully and returns exactly 8 keys. The eight
> keys remain individually **required**; only the "no extras" half of the claim was wrong.
> This correction is load-bearing for D17, which passes `ACCEPTANCE_CLAUDE_BINARY` as a
> ninth variable.

The
sanitized env is required in an agent session for two independent reasons — the inherited
`ANTHROPIC_*` pair hangs the CLI (preflight c), and `ANTHROPIC_API_KEY` is on the relay's
own child allowlist and would otherwise cross into the relay (finding 5).

Expect `ERR_MODULE_NOT_FOUND` in ~1s until `pnpm run generate:contract` has been run.

**§4 — Re-deriving every count in this report.**

```bash
L=.hermes/reports/2026-09-01-algorithm-live-loop/logs/t0
# pin 1
grep -o 'TYPECHECK_EXIT=[0-9]*' "$L/typecheck.log"
grep -cE '\([0-9]+,[0-9]+\): error TS' "$L/typecheck.log"                  # 157
grep -oE '^[A-Za-z0-9_./@-]+\.ts\([0-9]+,' "$L/typecheck.log" | sed 's/(.*//' | sort -u | wc -l   # 39
grep -oE 'error TS[0-9]+' "$L/typecheck.log" | sort | uniq -c | sort -rn   # code table
grep -c "TS2307: Cannot find module '@debateai/contract'" "$L/typecheck.log"  # 40
# pin 2
grep -o 'TEST_EXIT=[0-9]*' "$L/test.log"
grep -E '^ *Test Files|^ *Tests |^ *Duration' "$L/test.log"                # 83/134(217), 15/1006(1021)
grep -E '^ *FAIL .* > ' "$L/test.log" | sed 's/^ *FAIL  *//' | sort -u     # the named tests
grep -E '^ *FAIL .*\[ .* \]$' "$L/test.log" | sed 's/^ *FAIL  *//;s/ \[.*//' | sort -u | wc -l   # 73
grep -c 'Failed to resolve entry for package "@debateai/contract"' "$L/test.log"   # 50
grep -c 'Failed to resolve import "@debateai/contract"' "$L/test.log"              # 6
# pin 3
grep -o 'CEREMONY_EXIT=[0-9]*' "$L/ceremony.log"
grep -ci 'run id\|runId' "$L/ceremony.log"; grep -ci 'answer id\|answerId' "$L/ceremony.log"  # 0 and 0
```

Per the recorded trap, failing tests are read from the `FAIL … > …` headers, never by
grepping assertion text — vitest deduplicates identical assertion errors and the shared code
frame names the wrong arm.

---

## HANDOFF

- **Marker at r1 filing:** `BLOCKED — T0 r1 · waiting_resource · comments read through: packet-t00-2026-09-01` — **superseded**; this marker was consumed and acted on (D9 provisioning + F8/TREL dispatch). Line 1 of this file now carries the r2 marker.
- **Pins 1 and 2:** complete, three-run verified, reviewable now.
- **Pin 3:** one attempt spent, zero provider cost, no run id / answer id obtainable on this
  checkout. Decision owed per `## BLOCKER`.
- **Self-report:** `agent-reports/t00-baseline-self.md` (filed before this marker was set).
- **Logs:** `logs/t0/{typecheck,typecheck-run2,typecheck-run3,test,test-run2,test-run3,ceremony,preflight-claude,preflight-claude-sanitized}.log`
- **Rework round:** 0. Rework returns to session `opus-t00-w0`.
- Not done, by contract: no commit, no push, no merge, no board write, no edit anywhere in
  the primary checkout.
