# V's finishing packet — 2026-08-13

The coding set is complete (pending PROV-01's final diamond, in flight as
this is written). Everything below is yours.

## 1. The visual gate (DR-145) — UI-01

**http://localhost:3000/debate/8e78cfc8-a778-4a32-8ecd-806c3a058def**
(token `v-dev`). Judge: the newer canvas + viewport, the content-aware
collapse (DR-160 — narrow the window), greyed V2-only actions with truthful
tooltips, house · family · exact-model tags on every card, percentage
scores, the `UNSERVED-MAKER-POSITION` honesty chip, and cross-maker review
verdicts per node. `/new` is your ruled surface: question · risk · budget ·
depth dial · Start, machinery collapsed under Advanced.

Pass/fail closes UI-01 either way.

## 2. The review-coverage ceiling table (DR-165(3) needs numbers)

Your law — no opinion unjudged — needs bigger envelope members. Two derived
candidate sets (XREV-01's audited arithmetic; healthy spend ~20/36/68/132/260):

| depth | current | set A (3× headroom regime) | set B (full reservation) |
|---:|---:|---:|---:|
| 1 | 42 | 60 | 69 |
| 2 | 66 | 108 | 117 |
| 3 | 114 | 204 | 213 |
| 4 | 210 | 396 | 405 |
| 5 | 402 | 780 | 789 |

Until you ratify, depth 1–2 debates carry full review coverage; depth 3+
refuses (typed, before spend) rather than serving unjudged opinions.

## 3. The mono-maker ruling (DR-137 vs DR-165(3))

A lone maker has no judge. Current conservative behaviour: mono runs serve
WITH typed disclosure marks (SINGLE-LINEAGE + CRITIQUE-UNAVAILABLE, required
records). Alternatives: ban mono runs, or additionally cap their confidence
band (the shipped `applyCriticUnavailableCap` exists but is uncalled — its
band cap would be a register value, yours to mint).

## 4. Your improvements list

Held at your word until you've seen the whole thing. The board will be clean.

## 5. Protocol-fashion documentation backfill (you flagged it)

Lapsed this run: per-ticket loop reports, per-agent token tables, agent
self-reports, V DECISIONS PACKET assembly. Backfillable from durable
artifacts (verdicts, board comments, session footers). Recommend: orchestrator
writes loop-reports 20..N + the token ledger as a documentation pass, then
the protocol revision you're planning absorbs this run's lessons:
DR-155/156/158/163/163-A/166-B, the self-wake gap, packet-existence guards,
live-verification-required review, and implementer clone isolation (UI-02e
A-4).

## 6. For your next push (commit coupling)

`tests/render/` is untracked while the tracked `vitest.config.ts` depends on
it — they must land in the SAME commit or the suite silently shrinks. The
`.gitignore` covers all runtime state; the cleaned remote flow from last time
applies.

## Board at completion

56 done (pending PROV-01) · UI-01 at your eye · S15 parked by you · zero
ready, zero blocked-on-agents. Every ticket closed by dual greenlight;
every gate run independently by the orchestrator.
