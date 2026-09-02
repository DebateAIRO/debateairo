# PLAN — OBS-02 Product process liveness, restart witnesses, expected-set

> **For agentic workers:** the Architecture seat fills the steps. The Requirements seat (REQ-OBS) authored only the SPEC-trace skeleton, the quantifiability law and the cluster table headers. Programming-time skills: `superpowers:subagent-driven-development` or `superpowers:executing-plans`; every coder: `superpowers:test-driven-development`, `superpowers:verification-before-completion`.

**Goal:** probe the API, UI, TLS front door, runner process and Kanban; name the dev stack as root when it exits; witness container restarts and never-starts; record scheduler job completions.

**Spec:** `docs/missions/observability-agents/slices/OBS-02/SPEC.md` (FROZEN 2026-09-01)

**Status:** SCAFFOLD — steps not yet authored (ARCH seat fills).

## Quantifiability law (binding on Architecture)

- Every step is markable done / not-done by a stranger with no judgement call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test · file surface.
- Every PLAN step traces to a SPEC requirement; every SPEC requirement has ≥ 1 step.
- Three-run law: each cluster's verification command runs THREE times; the worst run is the verdict (green-green-red = RED).
- Acceptance commands live in labelled fenced blocks, never in table cells; every command is RUN by its author in a hostile configuration before it is written down; capture-first idiom, anchored summary guard, nonzero pass count.
- UNVERIFIED is a valid, respected answer on any claim.

## SPEC-trace table (one row per requirement; Architecture fills the step cells)

| Requirement | SPEC sentence (short) | Steps (OBS-02-Cx-y) | Cluster | Acceptance test | File surface |
|---|---|---|---|---|---|
| OBS-02-R01 | five probes: api exact-401, ui pair, tls system-trust, runner ps, kanban 30 s | | | | |
| OBS-02-R02 | expected-set model; `NOT_RUNNING` INFO once per transition | | | | |
| OBS-02-R03 | dev-stack root attribution: one composite SEVERE, members suppressed | | | | |
| OBS-02-R04 | container restart witness from `docker inspect` | | | | |
| OBS-02-R05 | never-started witness at 60 s | | | | |
| OBS-02-R06 | probe latency samples; p95 thresholds; `IMPACT_SLOW` | | | | |
| OBS-02-R07 | `oactl witness` job completion; `NO SCHEDULE RULED` until D10 | | | | |
| OBS-02-R08 | status/digest additions | | | | |
| OBS-02-R09 | no `process.kill`/`child_process` in probe modules; argv allow-list unchanged | | | | |
| OBS-02-R10 | defaults + routing rows for this slice | | | | |

## Clusters (Architecture fills the cells; headers fixed)

| Cluster | PLAN steps | ONE verification command (fenced block below) | File surface | Three-run verdict |
|---|---|---|---|---|
| OBS-02-C1 | | | | |
| OBS-02-C2 | | | | |
| OBS-02-C3 | | | | |

### Verification commands (labelled fenced blocks; one per cluster; capture-first idiom)

```text
OBS-02-C1: <architecture fills>
```

```text
OBS-02-C2: <architecture fills>
```

```text
OBS-02-C3: <architecture fills>
```

## Boundaries Architecture must state before any step is dispatched

- How a slice adds an `oactl` verb and target entries without editing OBS-01-owned files (verb/target discovery), or the exact append protocol if it cannot.
- Standing tests that READ the files this slice WRITES.
- The two impact codes this SPEC adds to the closed vocabulary (`IMPACT_SLOW`, `IMPACT_RUNNER_GONE`) must be added to the `CHECK` constraint by a migration or the constraint must be defined as a lookup table in OBS-01 — ARCH decides the mechanism and records it in DECISIONS.
