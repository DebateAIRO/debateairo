# PLAN — SUP-04 The assistant on product routes (widget), never on zone routes

> **For agentic workers:** the Architecture seat fills the steps, clusters and boundaries.
> REQ-SUP (2026-09-01) authored ONLY this SPEC-trace skeleton, the quantifiability law and
> the cluster table headers. No step below is authored yet. At programming time load
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** the SUP-01 assistant appears as a collapsed widget on `/`, `/new`, `/debate/[id]`
and `/public/debate/[id]`, shares one conversation per tab with `/help`, and is provably
absent from every zone route.

**Spec:** `docs/missions/observability-agents/slices/SUP-04/SPEC.md` (FROZEN 2026-09-01)

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
| SUP-04-R01 | "imported and rendered by exactly these files: `apps/ui/app/page.tsx`, `apps/ui/app/new/page.tsx`, `apps/ui/app/debate/[id]/…`, `apps/ui/app/public/debate/[id]/…`" | | |
| SUP-04-R02 | "not imported by `apps/ui/app/layout.tsx` nor by any file under … zone routes … architecture test lists the four permitted importers" | | |
| SUP-04-R03 | "share one support session per browser tab … continues the same messages on `/help`" | | |
| SUP-04-R04 | "collapsed as a button labelled WIDGET_BUTTON … `aria-label` … keyboard … bounding box does not intersect the page's primary control … at 1280×800 and at 390×844" | | |
| SUP-04-R05 | "Every behaviour of SUP-01 … applies unchanged … pre-selects the current debate … `/public/debate/[id]` no debate context is ever passed" | | |
| SUP-04-R06 | "edits `apps/ui/app/page.tsx` (one import line, one JSX line) … resolved at merge time" | | |

Trace rows: 6. SPEC requirements: 6.

## Cluster table (headers reserved; Architecture fills)

| Cluster id | Suggested scope | PLAN steps | Verification command (capture-first, three runs) | File surface |
|---|---|---|---|---|
| SUP-04-C1 | Widget component, collapsed/expanded states, accessibility, layout bounds (R04) | | | |
| SUP-04-C2 | Four mounts, importer allow-list test, layout/zone absence (R01, R02, R06) | | | |
| SUP-04-C3 | Shared per-tab session with `/help`, context pre-selection rules (R03, R05) | | | |

## Module boundaries, DDD impact, ADRs

_Architecture authors this section._ Fixed by the SPEC: no root-layout mount; page-file
edits limited to one import and one JSX line each.
