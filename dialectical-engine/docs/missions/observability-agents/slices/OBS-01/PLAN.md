# PLAN — OBS-01 Agent skeleton, infrastructure liveness, Mac notification, kill/mute

> **For agentic workers:** the Architecture seat fills the steps. The Requirements seat (REQ-OBS) authored only the SPEC-trace skeleton, the quantifiability law and the cluster table headers. Programming-time skills: `superpowers:subagent-driven-development` or `superpowers:executing-plans`; every coder: `superpowers:test-driven-development`, `superpowers:verification-before-completion`.

**Goal:** a standalone, read-only, launchd-supervised agent that watches Postgres, Hatchet and the Docker engine, journals every signal, and puts a template-only banner on V's screen within 15 s of a fault.

**Spec:** `docs/missions/observability-agents/slices/OBS-01/SPEC.md` (FROZEN 2026-09-01)

**Status:** SCAFFOLD — steps not yet authored (ARCH seat fills).

## Quantifiability law (binding on Architecture)

- Every step is markable done / not-done by a stranger with no judgement call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test · file surface.
- Every PLAN step traces to a SPEC requirement; every SPEC requirement has ≥ 1 step.
- Three-run law: each cluster's verification command runs THREE times; the worst run is the verdict (green-green-red = RED).
- Acceptance commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); every command is RUN by its author in a hostile configuration (vacuous filter, missing file, polluted title) before it is written down; capture-first idiom, anchored summary guard, nonzero pass count.
- UNVERIFIED is a valid, respected answer on any claim.

## SPEC-trace table (one row per requirement; Architecture fills the step cells)

| Requirement | SPEC sentence (short) | Steps (OBS-01-Cx-y) | Cluster | Acceptance test | File surface |
|---|---|---|---|---|---|
| OBS-01-R01 | own package, module discovery by directory, exit 2 on bad config | | | | |
| OBS-01-R02 | env only via `loadObservationAgentEnvironment()`; zero `process.env` under the agent | | | | |
| OBS-01-R03 | migration `observation_foundation`: schema, role, tables, views, grants, triggers | | | | |
| OBS-01-R04 | four probes from validated targets (postgres, hatchet live/ready, docker, self) | | | | |
| OBS-01-R05 | 5 s / 2 s / 2-fail open / 2-ok clear, all from thresholds | | | | |
| OBS-01-R06 | typed signal, closed enums, allow-listed evidence, impact from code | | | | |
| OBS-01-R07 | journal-first with fsync; mirror lag ≤ 5 s; catch-up ≤ 10 s | | | | |
| OBS-01-R08 | osascript for ≥ SEVERE and CLEARED; delivery rows; 10-min rate limit | | | | |
| OBS-01-R09 | digest line format; atomic `status.json` | | | | |
| OBS-01-R10 | launchd plist + `launch.sh` custody check; three external liveness witnesses | | | | |
| OBS-01-R11 | `oactl` verbs and exit codes | | | | |
| OBS-01-R12 | docker argv allow-list test; import-graph test; grants test | | | | |
| OBS-01-R13 | CPU ≤ 2 %, RSS ≤ 150 MB, ≤ 2 sessions, statement_timeout 2000 | | | | |
| OBS-01-R14 | thresholds table, `apply` diff+insert, fail-closed, reload, defaults merge | | | | |
| OBS-01-R15 | self-signals start/stop/journal-failure; heartbeat 5 s | | | | |

## Clusters (Architecture fills the cells; headers fixed)

| Cluster | PLAN steps | ONE verification command (fenced block below) | File surface | Three-run verdict |
|---|---|---|---|---|
| OBS-01-C1 | | | | |
| OBS-01-C2 | | | | |
| OBS-01-C3 | | | | |
| OBS-01-C4 | | | | |

### Verification commands (labelled fenced blocks; one per cluster; capture-first idiom)

```text
OBS-01-C1: <architecture fills>
```

```text
OBS-01-C2: <architecture fills>
```

```text
OBS-01-C3: <architecture fills>
```

```text
OBS-01-C4: <architecture fills>
```

## Boundaries Architecture must state before any step is dispatched

- Standing tests that READ the files this slice WRITES (TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"): at minimum `pnpm audit:source` over `apps/**` and `packages/register/**`, and any architecture test that walks `migrations/` or `apps/`.
- The one shared file (`packages/register/src/runtime-environment.ts`) and its merge sequencing against FIX slices.
- The migration NUMBER, allocated by the orchestrator at slice-ticket creation (Q8 D13), and the exact `oactl status` state-dir path (SPEC acceptance step 4 leaves it to ARCH).
- The exact `Module` interface every later slice implements (name, cadence, probe(), samples(), signals()).
