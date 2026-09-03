# PLAN — SUP-05 Known-incident awareness from a V-published source

> **For agentic workers:** the Architecture seat fills the steps, clusters and boundaries.
> REQ-SUP (2026-09-01) authored ONLY this SPEC-trace skeleton, the quantifiability law and
> the cluster table headers. No step below is authored yet. At programming time load
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** the assistant reports known incidents only from `support.public_incident`, which
only V writes; without a row it says it has no record.

**Spec:** `docs/missions/observability-agents/slices/SUP-05/SPEC.md` (FROZEN 2026-09-01)

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
| SUP-05-R01 | "`support.public_incident` {`incident_id` … `source_ref`} … the ONLY incident source the assistant reads … never reads `obs.*`" | | |
| SUP-05-R02 | "`pnpm support:incident publish …` inserts a row with `published_by = V`; `pnpm support:incident resolve` sets `ended_at`. Rows are never deleted" | | |
| SUP-05-R03 | "Messages classified `INCIDENT` … answered without a model call: INCIDENT_ACTIVE … built from the row's own summary text (never paraphrased) … otherwise NO_INCIDENT" | | |
| SUP-05-R04 | "NO_INCIDENT is the fixed text … never asserts that nothing is wrong" | | |
| SUP-05-R05 | "every `ANSWER_GROUNDED` or `ANSWER_OWN_STATE` reply whose intent touches the affected surface is prefixed with INCIDENT_NOTICE" | | |
| SUP-05-R06 | "Three cases: active incident → INCIDENT_ACTIVE … none → NO_INCIDENT … resolved → NO_INCIDENT with no mention" | | |

Trace rows: 6. SPEC requirements: 6.

## Cluster table (headers reserved; Architecture fills)

| Cluster id | Suggested scope | PLAN steps | Verification command (capture-first, three runs) | File surface |
|---|---|---|---|---|
| SUP-05-C1 | Interface table, publish/resolve CLI, no-delete (R01, R02) | | | |
| SUP-05-C2 | INCIDENT intent class, deterministic replies, notice prefix (R03, R04, R05) | | | |
| SUP-05-C3 | Eval class F (R06) | | | |

## Module boundaries, DDD impact, ADRs

_Architecture authors this section._ Fixed by the SPEC: no read of `obs.*`; no model call on
the incident path; the table is the cross-product interface REQ-SYNTH diffs.
