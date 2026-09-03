# PLAN — SUP-06 Abuse controls, spend caps, queueing and degraded mode

> **For agentic workers:** the Architecture seat fills the steps, clusters and boundaries.
> REQ-SUP (2026-09-01) authored ONLY this SPEC-trace skeleton, the quantifiability law and
> the cluster table headers. No step below is authored yet. At programming time load
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** every bound is a register row V can set with one command; the assistant queues,
caps and degrades instead of inventing; spend is visible in one command.

**Spec:** `docs/missions/observability-agents/slices/SUP-06/SPEC.md` (FROZEN 2026-09-01)

**Status:** SCAFFOLD — steps not authored. **Depends on:** SUP-01.

## Quantifiability law (binding on Architecture)

- Every step is markable done / not-done by a stranger with no judgement call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test (runnable, capture-first) · file surface.
- Every PLAN step traces to a SPEC sentence; every SPEC requirement has ≥1 step.
- Three-run law: worst of three runs is the verdict. UNVERIFIED is respected.
- Commands in labelled fenced blocks, never in table cells.

## SPEC-trace skeleton (one row per requirement; Architecture fills the step cells)

| Requirement | SPEC sentence (anchor) | Step ids | Cluster |
|---|---|---|---|
| SUP-06-R01 | "Rows and defaults: `support_limit_anon_msgs_10m` 20 … `pnpm support:limits set <row> <value>` … within 5 s without an API restart" | | |
| SUP-06-R02 | "When the support session is bound to an `identity_owner_ref`, the account limits apply in addition" | | |
| SUP-06-R03 | "At most `support_relay_concurrency` model calls are in flight … FIFO queue … QUEUED text with its position … DEGRADED text immediately" | | |
| SUP-06-R04 | "After `support_daily_call_cap` model calls in a UTC day, model-backed replies return DEGRADED until 00:00 UTC" | | |
| SUP-06-R05 | "After two `LOCKED` sessions from one client IP within 24 h, new sessions from that IP are refused … for `support_ip_cooldown_minutes`" | | |
| SUP-06-R06 | "`support.abuse_event.class` ∈ {…}; columns: `session_id`, `class`, `message_sha256`, `ip_sha256`, `at`. No message text, no raw IP" | | |
| SUP-06-R07 | "A relay 502/504 or connection failure switches the assistant to degraded mode … `relay: unavailable since <time>`; the next successful call clears it" | | |
| SUP-06-R08 | "prints, for today and the last 7 days: model calls, typed token counts … sum of reported cost in USD — printed as `UNKNOWN` (never `0`)" | | |

Trace rows: 8. SPEC requirements: 8.

## Cluster table (headers reserved; Architecture fills)

| Cluster id | Suggested scope | PLAN steps | Verification command (capture-first, three runs) | File surface |
|---|---|---|---|---|
| SUP-06-C1 | Register rows, `support:limits`, status printing incl. spend (R01, R08) | | | |
| SUP-06-C2 | Per-account limits, locks, IP cooldown, abuse-event shape (R02, R05, R06) | | | |
| SUP-06-C3 | Concurrency semaphore, FIFO queue, QUEUED text, daily cap (R03, R04) | | | |
| SUP-06-C4 | Degraded mode detection and recovery (R07) | | | |

## Module boundaries, DDD impact, ADRs

_Architecture authors this section._ Fixed by the SPEC: no reuse of zone limiters; no env
reads; the semaphore lives in the support module, not in the relay.
