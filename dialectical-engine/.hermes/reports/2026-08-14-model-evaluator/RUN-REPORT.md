# RUN REPORT — model-evaluator mission

**Window:** 2026-08-14 20:16 → 2026-08-15 20:12 EEST (~24 h wall clock)
**Outcome:** PROGRAMMING COMPLETE. All ten lanes merged, 104 files / 730 tests green,
dark-launch law proven. **QA loop not run; bind order not given.** Everything shipped is
collect-only.
**Filed under reporting law #6** (spine `heartbeat-protocol/SKILL.md:144-149`): per-agent
token usage with a named accounting basis per row, plus a cross-run ledger pointer.

---

## Part 1 — Per-agent token usage

Every row names its accounting basis. Where a basis is unavailable locally, the row says
so rather than estimating (DR-115 / TOKEN-LEDGER 2026-08-13-14 practice).

### 1.1 OpenAI / Codex — all product coding
**Basis: codex session footers, exact.** Each `tokens used` line in a lane log is that
session's *cumulative* footer. Rework logs are resumed sessions, so the last log per lane
carries the lane's final cumulative figure; both columns are shown so the rework cost is
visible.

| Lane | What it built | First session | Final cumulative | Log naming the final figure |
|---|---|---:|---:|---|
| PROG-02 | eval-02 foundation — evaluator package + worker scaffold, migration 0023 (14 tables, triggers, grants), UNBOUND binding resolver | 267,861 | **479,429** | `PROG-02-codex-rework1.log` |
| PROG-03 | eval-03 domains — domain registry, near-duplicate admission guardrails, 26-name starter list | 198,264 | **702,683** | `PROG-03-codex-rework1.log` |
| PROG-04 | eval-04 tagger — ask-time vLLM classifier, non-gating, null-run scoped; migration 0025 | 365,548 | **799,306** | `PROG-04-codex-rework1.log` |
| PROG-05 | eval-05 harvest — terminal-run reconciler + artifact projector, supersession, poison isolation, 3-strike parking | 270,090 | **823,791** | `PROG-05-codex-rework3.log` |
| PROG-06 | eval-06 add-on — blind different-lineage grading pass, same-maker refusal, bounded retries; migration 0026 | 275,099 | **564,688** | `PROG-06-codex-rework2.log` |
| PROG-07 | eval-07 profiles — bias + prowess cells, intervals, versioned rank snapshots; migration 0027 | 274,360 | **651,862** | `PROG-07-codex-rework2.log` |
| PROG-08 | eval-08 metering — shared usage-capture hook, METERED/UNMETERED projection, `relative-external-spend/v1` | 161,560 | **435,144** | `PROG-08-codex-rework1.log` |
| PROG-09 | eval-09 consumer — the single reader, typed `SELF_ROUTING_FORBIDDEN` refusal, persisted interpretations | 289,974 | **579,037** | `PROG-09-codex-rework1.log` |
| PROG-10 | eval-10 seat-share — deterministic allocator coded dark, shadow decisions, grant-level darkness proof | 248,316 | **480,035** | `PROG-10-codex-rework1.log` |
| PROG-11 | eval-11 dev menu — dev-only Settings surface, read-only UNBOUND display, no bind control | 296,279 | **573,721** | `PROG-11-codex-rework1.log` |
| INT-0024 | integration micro-task — wire the V-approved 0024 domain seed out of `migrations/pending/` | — | **111,909** | `INT-0024-codex.log` |
| | | | **6,201,605** | |

Logs live in `/Users/vladmihaimiron/Documents/DebateAIRO/.hermes/planning/2026-08-14-model-evaluator/logs/`.
Billed to V's OpenAI account; invisible on any Anthropic surface.

**One disclosed discrepancy.** `agent-reports/codex-PROG-02.md:20` self-reports *"Codex
goal meter reported 453,076 tokens at continuation report refresh"*, against the log
footer's 479,429. The self-report was taken mid-session at the continuation refresh; the
footer is the final flush. The footer is authoritative for this ledger. No other lane
self-reported a codex figure.

### 1.2 Anthropic / Claude Opus — review, architecture-review and research seats only
**Basis: harness task-notification usage fields, exact; one figure per review round.**
Each review round is an independently spawned read-only subagent, so rounds are additive,
not cumulative. Round counts were cross-checked against the review-file inventory in
`docs/missions/2026-08-14-model-evaluator/programming/reviews/` and **matched exactly** —
43 programming rounds + 5 requirements rounds + 1 research seat = 49 figures, 49 files.
**No product code was written on any Anthropic seat.**

| Seat | Rounds | Per-round figures | Total |
|---|---:|---|---:|
| REQ-02a reviewer A | 3 | 113,097 + 152,271 + 185,064 | 450,432 |
| REQ-02b reviewer B | 2 | 102,977 + 143,030 | 246,007 |
| PROG-02 reviewer A | 2 | 151,799 + 192,064 | 343,863 |
| PROG-03 reviewer A | 2 | 101,496 + 127,470 | 228,966 |
| PROG-03 seat 2 (opus2) | 1 | 124,237 | 124,237 |
| PROG-04 reviewer A | 2 | 121,582 + 165,475 | 287,057 |
| PROG-04 reviewer B | 2 | 158,324 + 208,318 | 366,642 |
| PROG-05 reviewer A | 4 | 143,367 + 196,446 + 233,188 + 257,058 | 830,059 |
| PROG-05 reviewer B | 4 | 175,922 + 229,123 + 273,402 + 301,982 | 980,429 |
| PROG-06 reviewer A | 3 | 144,584 + 185,543 + 215,156 | 545,283 |
| PROG-06 reviewer B | 3 | 167,556 + 211,877 + 243,523 | 622,956 |
| PROG-07 reviewer A | 3 | 171,402 + 231,780 + 246,783 | 649,965 |
| PROG-07 reviewer B | 2 | 180,413 + 275,075 | 455,488 |
| PROG-08 reviewer A | 2 | 126,083 + 161,558 | 287,641 |
| PROG-08 seat 2 (opus2) | 1 | 145,290 | 145,290 |
| PROG-09 reviewer A | 2 | 126,429 + 171,971 | 298,400 |
| PROG-09 reviewer B | 2 | 174,680 + 226,800 | 401,480 |
| PROG-10 reviewer A | 2 | 126,919 + 150,907 | 277,826 |
| PROG-10 reviewer B | 2 | 151,869 + 182,639 | 334,508 |
| PROG-11 reviewer A | 2 | 140,873 + 176,697 | 317,570 |
| PROG-11 reviewer B | 2 | 182,589 + 220,509 | 403,098 |
| wayfinder research agent (charting) | 1 | 78,232 | 78,232 |
| **Subtotal** | **49** | | **8,675,429** |
| close-out reporting: bind-readiness miner | 1 | 87,441 | 87,441 |
| close-out reporting: timeline miner | 1 | 148,397 | 148,397 |
| **Total** | **51** | | **8,911,267** |

The Opus reviewer seats self-report their own usage as **unmetered, not estimated** — e.g.
`agent-reports/opus-REQ-02a.md:60-72` records inputs read, outputs written and tool-call
counts, and explicitly defers to the orchestrator's task-notification fields as the
authoritative surface. That deferral is what this table supplies.

### 1.3 xAI / Grok — requirements authorship and peer-review lenses
**Basis: grok session `updates.jsonl` usage events, exact** — the maximum
`params.update.usage.totalTokens` per session (a cumulative running total). Sessions were
identified by `summary.json.session_summary`, not guessed from timestamps. `totalTokens`
includes cached reads, which dominate: the REQ-01 root session read 962,048 cached tokens
against 1,111,557 input.

| Seat | Session id | Session root | Total tokens | Cost (USD) |
|---|---|---|---:|---:|
| REQ-01 requirements author (root) | `01a00146-0e5a-…c76baa` | DebateAI-V3 | 1,623,221 | 110.00 |
| REQ-01 delivery report | `01a0014d-f685-…7d306` | DebateAI-V3 | 31,091 | 3.21 |
| REQ-01 rework 1 (post-peer-review) | `01a0015a-073a-…3f48b` | DebateAI-V3 | 19,649 | 2.68 |
| REQ-01 rework 2 (FR-0.6 panel-discovery fix) | `01a0015f-5a9e-…27792` | DebateAI-V3 | 40,284 | 4.71 |
| ARCH-02 architecture review (root) | `01a0017b-2b17-…72b557` | DebateAI-V3 | 1,700,546 | 51.92 |
| ARCH-02 review summary | `01a00181-ebc0-…1e614e` | DebateAI-V3 | 20,183 | 0.96 |
| PROG-02 peer review (lane worktree) | `01a0019a-55b5-…470a2d` | worktree `eval-02-foundation` | 1,422,899 | 40.87 |
| PROG-02 peer review (main checkout) | `01a001a1-f110-…9e4826` | DebateAI-V3 | 41,997 | 1.55 |
| PROG-02 peer review round 2 | `01a001cd-4beb-…2c89e` | DebateAI-V3 | 40,181 | 1.57 |
| PROG-03 peer review (cut short — non-binding) | `01a001dc-c752-…dd67ed` | worktree `eval-03-domains` | 802,557 | 25.50 |
| PROG-08 peer review (stale tip — non-binding) | `01a001dc-c845-…1e294c` | worktree `eval-08-metering` | 496,821 | 15.69 |
| **Total** | | | **6,239,429** | **458.66** |

Session roots: `~/.grok/sessions/<url-encoded-cwd>/`. Three lane reviews ran inside their
lane worktrees, which is why a search of the `DebateAI-V3` root alone under-reports Grok
by ~2.7 M tokens — worth knowing for the next ledger.

Grok's participation stops after PROG-08. See §2.4.

### 1.4 Hermes — architecture authorship, board custody, all stage verdicts
**Basis: partially available; mission-attributable figure UNAVAILABLE.**

- `hermes insights --days 2` reports, for 2026-08-14→15: 18 sessions, 1,618 messages,
  input 2,591,913 / output 200,297, **total 42,697,874** (the total includes cache reads),
  model `gpt-5.6-sol`, split cli 15 / subagent 3.
- That figure is a **machine-wide 2-day window across all Hermes work**, not mission-scoped.
  `hermes insights` offers only `--days` and `--source` — no per-session, per-mission or
  date-range filter — so the mission's share cannot be separated from this surface.
- Every Hermes self-report independently marks its own usage unmetered and refuses to
  estimate: `hermes-ARCH-01.md:18`, `hermes-PROG-02.md:18`, `hermes-PROG-04.md:19`,
  `hermes-PROG-05.md:14`, `hermes-TIER1.md:19`, `hermes-TIER6.md:23`.

Hermes seats run in the window: ARCH-01 + recovery, board crafting, 2 board fixups,
11 stage verdicts (PROG-02…11 plus the PROG-05 re-verdict), REQ-03, TIER1 and TIER6.

### 1.5 Anthropic / Fable — orchestrator
**Basis: NOT self-measurable from inside the session; the Anthropic console is
authoritative.** Qualitatively the largest single Anthropic line: a ~24 h continuously
running orchestration context (routing, goal packets, gates, ten lane launches, ten
hang recoveries, V dialogue). No product code.

### 1.6 Anthropic / claude relay — product spend
**Basis: `ledger.ledger_entry` rows per run (exact per run in DB).** Not mission work —
debates ran concurrently on the same machine throughout the window. Not counted here.

### 1.7 Mission total (receipted seats only)

| House | Basis | Tokens |
|---|---|---:|
| OpenAI / Codex | session footers | 6,201,605 |
| Anthropic / Opus | harness task-notification | 8,911,267 |
| xAI / Grok | session `updates.jsonl` | 6,239,429 |
| Hermes | unavailable (not mission-scoped) | — |
| Fable orchestrator | unavailable (console authoritative) | — |
| **Receipted total** | | **21,352,301** |

**The structural read is unchanged from the prior arc, and sharper.** Verification
outweighs coding by design. Separating review seats from authorship seats: Grok's four
REQ-01 seats (1,714,245) are *authorship*, not review; the remaining Grok seats
(4,525,184 — ARCH-02 plus the three lane reviews) are review, as is all 8,911,267 of Opus.
So **6,201,605 coding tokens bought 13,436,451 tokens of review** across two independent
lenses plus a Hermes verdict layer — a **2.17 : 1 review-to-code ratio**. §2.3 shows what
that ratio bought.

---

## Part 2 — Narrative

### 2.1 What was built and why

The model-evaluator is a new module inside DebateAI-V3 that makes the debate system
measure itself. It tags every incoming question with a subject domain using a local vLLM
model; harvests the artifacts runs already produce into per-model **bias and prowess
profiles** across authoring, judging and reviewing; meters tokens to derive a relative-cost
signal; and contains a **seat-share allocator** that would decide which model gets how many
panel seats. The point is to stop guessing which model is good at what — a judge that is
systematically lenient, or that contradicts settled outcomes, gets ranked down.

The whole module was built **dark**. Two hard laws governed every lane:

- **FR-0.1 (dark launch)** — no evaluator number may steer a live run until V issues an
  explicit bind order. Charting ruling 11: *"No automatic go-live threshold — V says when
  collected data starts dispatching models."*
- **FR-0.6 AC5 (panel isolation)** — the evaluator's own vLLM model must never enter the
  debate panel.

V's fleet election (H0, ruling R7) set the roster: **Grok** sole requirements author,
**Hermes** architecture owner + all stage verdicts + board custody, **Codex (GPT-5.6 Sol)**
sole coder, **Claude Opus** read-only reviewers who never issue verdicts.

### 2.2 Timeline

**Charting (2026-08-14, earlier).** Grilling with V across three rounds produced the
wayfinder map: 11 ratified rulings, 11 tickets, glossary. Ticket 01 (relay token/cost
exposure) was researched and closed during charting.

**Requirements — 20:16 → 20:44 (28 min).** Grok authored `Requirements.md` alone. Two
independent Opus reviewers returned **dual REWORK** at round 1. Rework in the same session.
Round 2: reviewer B PASS, reviewer A found a *new* blocker — evaluator vLLM config could
leak into panel discovery. Rework 2 added FR-0.6 AC5 and Open question 12; reviewer A
passed at round 3. Hermes stage review at 20:43: **REQUIREMENTS APPROVED**, having
spot-checked five requirement claims against live migrations rather than trusting the
reviews.

**Architecture — 20:48 → ~21:2x.** Hermes authored `Architecture.md` (1,034 lines) plus
the mission-graph SVG. A recovery session at 21:11 handled a patch that had failed to apply
from a wrong relative path — the prior session had already re-applied it, so recovery
confirmed rather than re-edited. Grok's ARCH-02 review returned **PASS round 1**, four
non-blocking notes. V approved the planning-graph gate: *"Approved — release programming."*

**Programming — 21:32 (08-14) → 20:12 (08-15), ten lanes in eight tiers.**

| Merged | Commit | Lane |
|---|---|---|
| 08-14 22:48 | `81944bc` | PROG-02 foundation |
| 08-15 10:32 | `3eb47b8` | PROG-03 domains |
| 08-15 10:37 | `26f6834` | PROG-08 metering (union merge with domains) |
| 08-15 10:42 | `f065e7c` | INT-0024 seed integration |
| 08-15 12:05 | `22a7140` | PROG-04 tagger |
| 08-15 14:03 | `2ea4fbc` | PROG-05 harvest |
| 08-15 15:47 | `8999a85` | PROG-06 add-on |
| 08-15 17:30 | `6f67b51` | PROG-07 profiles |
| 08-15 18:53 | `9d9bab1` / `4c5bbd1` | PROG-09 consumer + PROG-10 seat-share (parallel) |
| 08-15 20:12 | `90bb6c1` | PROG-11 dev menu — **all ten lanes complete** |

Tests grew 565 → **730** across the loop.

**Snapshot pushes.** `origin/dev` is a separate squashed published history (diverged
2026-08-09 at `f59aaf5`). Two snapshots cover this mission:

- **`9c6a760`** (08-15 10:20) — mid-mission: requirements + architecture ratified,
  foundation merged, domains + metering dual-PASS. 117 files, +153,214 lines (mostly tee'd
  terminal logs; `PROG-02-codex.log` alone is 70,463 lines).
- **`04837f4`** (08-15 22:26) — end of programming: all ten lanes, 104 files / 730 tests
  green, *"QA + bind pending V."* 267 files, +570,736 / −315.

**QA — not run.** PROG-11's verdict is explicit: programming closes pending V's HITL
dev-menu reaction round and the QA loop, and *"this verdict does not self-approve either
downstream gate."*

### 2.3 Review rounds and the five defects that justified them

47 programming review rounds across ten lanes (43 Opus, 4 Grok), plus 11 Hermes verdict
documents. Per-lane rounds: PROG-02 4, PROG-03 4, PROG-04 4, PROG-05 **8**, PROG-06 6,
PROG-07 5, PROG-08 4, PROG-09 4, PROG-10 4, PROG-11 4.

**1. Fabricated-zero leniency (PROG-07, Opus seat A round 1, BF-1).** Leniency measures how
far a judge's grade sits from the panel median *on the same item*. But the runner writes
exactly one `reduced_judgement` row per node, and harvest never writes an `item_key`, so
the reader fell back to keying items by `node_id` — making every "item group" contain
exactly one grade. The median of one value is that value, so `value − median` was
structurally **0** for every judge, forever. The resulting cell was not empty, which would
have been honest; it was `value=0`, `basis=MEASURED_PROCESS`, `n` = the judge's full
judgement count, with the confidence interval *tightening as n grew*. The evaluator would
have reported, with rising confidence, that every judge on the system is perfectly
unbiased — a measurement never taken. Both existing tests used fixtures the real harvest
projector cannot produce, so neither could catch it.

**2. Pool deadlock (PROG-06, found independently by both seats at round 2).** The add-on
pass took a session-level `pg_advisory_lock` by checking a client out of the shared
Postgres pool and holding it for the whole critical section — but the work inside issued
its queries through `this.pool`, needing a *second* client. The pool sets no `max`, so it
caps at pg's default of 10. With 10 passes in flight, all 10 clients were held by lock
sessions and none remained for any holder's actual work: nothing completed, nothing timed
out. A standalone probe against real embedded Postgres showed 9 concurrent fine, 10 total
hang, 12 total hang — and it still hung with *distinct* lock keys, proving plain pool
exhaustion rather than lock contention. Because the pool is shared, a wedged add-on would
have taken harvest, metering and the tagger down with it. The lane's own new concurrency
test used 6 — four below the cliff. Fixed with `pg_try_advisory_lock` and by threading the
lock-owning client through.

**3. Time-bomb fixtures (PROG-05, opus2 seat round 2).** When a question settles late,
harvest writes a settlement observation superseding the earlier consensus row, and a DB
trigger requires the successor's clock to be ≥ the predecessor's. The lane used the
resolver's real `resolved_at` — routinely *earlier* than harvest time. The regression test
that "proved" the fix hardcoded `resolved_at = 2026-08-15T12:00:00Z` while harvesting with
a live `new Date()`. The reviewer ran it at 10:17 UTC, green, and observed that from 12:00
UTC that same day onward it inverts and must fail with `OBSERVATION_SUPERSESSION_INVALID`.
**The proof of the fix had a shelf life of under two hours.** Fixed by computing the
observation clock as `max(resolvedAt, prior.observed_at)` while preserving true resolver
time in JSON, and pinning fixture clocks in both directions.

**4. Phase-1 strike gap (PROG-05, caught by Hermes at stage review — *after* both peers had
passed).** Harvest parks a run after three failures so one poisoned run cannot burn the
batch forever. But the strike counter only counted *persisted* `FAILED` receipts, and the
code writing those receipts sat inside a `try` that began only after phase 1 (snapshot
reads, projection, hash, durable STARTED insert). A run failing in phase 1 was reported
`FAILED` by the batch on every invocation while adding **zero** counted strikes — it could
never reach three, never park, and would retry forever. The worker held two different
definitions of "failed" and only one fed the retry bound. This is **the only time in the
mission that Hermes withheld approval after a dual-PASS peer round**; the lane went back to
blocked and was re-verdicted after `1859b75`.

**5. Panel-isolation leak — the tautological differential test (PROG-02, Opus round 1).**
FR-0.6 AC5 requires that a run admitted while the evaluator's vLLM is configured and
healthy has the *same* panel membership and `agent_count` as one admitted with it absent —
otherwise the evaluator's own model quietly becomes a debate author on every ask. The lane
shipped a test claiming to prove this, but it injected a frozen constant panel closure and
called the same function twice with the same inputs: `expect(f(x)).toEqual(f(x))`. **It
would still have passed with the evaluator fully enrolled in `configuredProviderSet`.** No
run was ever admitted, so `agent_count` — which exists only as
`jsonb_array_length(discovered_panel)` on the persisted row — was never observed at all,
despite the test's title. Replaced with an integration test that composes discovery from
real register rows the way `main.ts` does and compares **persisted** bytes.

### 2.4 The Grok outage and V's substitution ruling

On the morning of 2026-08-15, mid-way through Grok's PROG-03 verification pass, the Grok
CLI died with `API error (status 402 Payment Required): Grok Build usage balance
exhausted` — a hard billing cutoff, not a transient error. The log shows Grok had already
emitted `REVIEW VERDICT: PASS` and was adversarially spot-checking that PASS when it was
cut off (`logs/PROG-03-grok-review.log:35-37`).

**V ruled** (recorded at `00-intake-H0.md:60-65`): while Grok is down, the second
independent reviewer seat becomes a **separate Claude Opus instance**, deliberately kept
independent of the first (the "opus2" seat); QA co-ownership falls to the Claude reviewers
plus Hermes verdicts; and **Grok's cut-short PROG-03 PASS is non-binding** — the Opus
REWORK is the binding round-1 input for both tier-1 lanes.

The ruling was applied consistently. Every opus2 review file opens by declaring the
substitute seat and stating it read no other review of that lane. Hermes applied it to
PROG-08 too, recording that Grok's late artifact *"reviewed the stale first-pass tip and
does not replace the binding round-1/rework chain."*

**The honest cost:** from PROG-04 onward the mission lost cross-vendor reviewer diversity.
Both independent seats were the same model family for **8 of 10 lanes**, so a correlated
blind spot would have gone unseen by both. In practice the seats diverged often (PROG-04,
06, 10 and 11 all split A-REWORK/B-PASS) and the Hermes layer still caught PROG-05's escape
— but the diversity guarantee V originally designed for was not in force for most of the
mission.

### 2.5 The codex-resume hang

**Symptom.** After Codex completed and committed a rework, the CLI client would go idle and
never return — hanging *after* the durable work was safe, at the handoff point.

**Occurrences: exactly 10**, one per programming lane, PROG-02 through PROG-11. Two
independent counts agree: ten `pointer-prog<NN>-rework1b.txt` / `run-codex-prog<NN>-rework1b.sh`
continuation pairs with matching "post-hang verification" sections in the codex
self-reports; and, in the logs, **all ten `*-rework1` logs carry a double `=== codex exited
===` marker** (the kill, then the successful resume) where every first-pass log carries
exactly one. `PROG-02-codex-rework1.log` carries three, having hung twice.

**Recovery — kill + resume, same session id, never a fresh session:**

1. Kill the hung client; the commit is already on the lane branch, so nothing is lost.
2. Relaunch `codex exec resume <same-session-uuid>` from the `-rework1b.sh` script — same
   worktree, same model, same session, so custody and the same-session-rework law hold.
3. Feed a continuation pointer naming the commit the previous turn landed, stating plainly
   that the hang is known and the work safe, and asking the agent to report what it
   completed vs the brief, re-run focused tests **and** the repository typecheck, commit
   anything uncommitted, update its self-report, and print the exact
   `READY FOR PEER REVIEW: <branch>` handoff string.

In all ten cases the worktree was clean at the expected commit and **no recovery edits or
extra commits were needed**. The hang was a handoff-loss problem, never a data-loss one —
but every lane needed a human to notice and restart it.

### 2.6 Loops closed

**This mission produced no loop reports.** The loop-report series belongs to the prior arc
(`docs/missions/2026-08-06-v3-programming/loop-reports/`) and stops at **28**
(`loop-report-28-DISC01.md`, closed 08-14 19:29, `d0da17e`) — about 45 minutes before this
mission's requirements loop began. The model-evaluator closed its loops through **Hermes
stage verdicts** instead: 1 requirements verdict, 1 architecture peer PASS plus V's graph
gate, and 10 programming lane verdicts (11 verdict documents, since PROG-05 carries both a
REWORK and a re-verdict). A separate loop, REVCOV-01 (DR-184/184-A/185/186), ran interleaved
on 08-15 morning and closed at 12:18 (`4caf539`); it shares the timeline and worktree
machinery but is not part of this mission.

### 2.7 What went badly

- **Reworks introduced new defects at least three times.** PROG-05's B1 fix "half closed
  [it] and has introduced a worse failure mode"; PROG-06's round-1 fix *introduced* the pool
  deadlock; PROG-07's rework **deleted** the judge-rank-movement and `bias-rank:` receipt
  tests, which is why round 2 was REWORK.
- **A dual-PASS peer round was not sufficient once.** PROG-05 passed both seats at round 3
  and Hermes still found the phase-1 strike gap — one real escape past the peer layer in
  ten lanes. The third layer earned its cost exactly once, and it was worth it.
- **Reviewer diversity was lost for 8 of 10 lanes** after the Grok billing cutoff, and two
  Grok reviews sit on the record as non-binding.
- **Ten CLI hangs** needed manual kill + resume. No work lost, but no lane completed
  unattended.
- **The architecture author needed a recovery session** after a patch failed to apply from a
  wrong relative path.
- **Wayfinder ticket statuses are stale:** tickets 02, 03, 04, 05 and 08 still read
  `Status: open` in `wayfinder/issues/` though all five lanes are merged and approved.
  Tickets 06, 07, 09, 10 and 11 were updated to `done`.
- **The mission is not finished.** QA loop not run, V's HITL dev-menu reaction round not
  held, and the bind order — the entire point of the dark launch — not given.

Open carry-forwards at close are compiled in **`BIND-READINESS.md`** beside this file:
5 hard blockers, 9 formula ratifications, 6 safety gates, 8 cross-lane carried items, and
**3 reviewer-identified disclosures that never reached the lane-10 checklist** (sequence
burn, cheaper-best dormancy under thin metering, and the M=1 receipt mislabel).

---

## Part 3 — Cross-run ledger pointer

Prior arc: `DebateAI-V3/docs/missions/2026-08-06-v3-programming/TOKEN-LEDGER-2026-08-13-14.md`
(bug/resilience arc, 2026-08-13 → 08-14).

| | Prior arc (bug/resilience) | This arc (model-evaluator) | Trend |
|---|---:|---:|---|
| Codex (coding) | 2,782,749 | 6,201,605 | ×2.2 |
| Opus (review/research) | 1,752,471 | 8,911,267 | ×5.1 |
| Grok | basis declared unavailable | 6,239,429 | now receipted |
| **Receipted total** | **4,535,220** | **21,352,301** | **×4.7** |
| Review : code, Opus-only (like-for-like) | 0.63 : 1 | **1.44 : 1** | ×2.3 |
| Review : code, all review seats | n/a (Grok unrecorded) | **2.17 : 1** | — |

The Opus-only row is the like-for-like comparison, since the prior arc recorded no Grok
figure. The all-seats row adds this arc's Grok review lenses (ARCH-02 + three lane reviews,
4,525,184) and excludes Grok's REQ-01 authorship seats (1,714,245), which are not review.

**Two things this comparison actually shows.**

1. **The prior ledger's Grok row was wrong, and the error was methodological.** It recorded
   *"74 grok sessions in the window (local updates.jsonl carries no parseable token
   totals); the xAI console is the authoritative source."* That is not true — `updates.jsonl`
   **does** carry `params.update.usage` events with exact `totalTokens`, `modelCalls` and
   `costUsdTicks`. Re-running this arc's extraction against the prior arc's window finds
   **224 sessions with parseable usage**. A corrected prior-arc Grok figure is therefore
   recoverable; it is deliberately **not** asserted here, because that raw window mixes
   mission agent seats with concurrent product debate runs and the two cannot be separated
   without per-seat attribution. Recommended for the next close-out: attribute by
   `summary.json.session_summary`, as §1.3 does.
2. **The review-to-code ratio more than doubled** (Opus-only, like-for-like: 0.63 → 1.44),
   and it is roster law, not drift. Two
   independent lenses per writer plus a Hermes verdict layer is the designed shape (H0
   ruling R7). The prior ledger flagged rebalancing — a larger Grok lens share, a GPT review
   seat — as *"a V roster ruling away."* This arc makes the case sharper in both directions:
   the review layer caught five defects that would each have shipped a silently wrong
   evaluator, **and** the outage showed how fragile a two-vendor design is when one vendor's
   balance runs out mid-mission.

**Also worth carrying forward:** three Grok lane reviews ran inside their lane *worktrees*,
so their sessions live under worktree-keyed roots in `~/.grok/sessions/`. Searching only
the main checkout's root under-reports Grok by ~2.7 M tokens.

---

*Filed by the mission-close reporter, 2026-08-15. This report and `BIND-READINESS.md` are
the mission's standing close-out artifacts (P7).*
