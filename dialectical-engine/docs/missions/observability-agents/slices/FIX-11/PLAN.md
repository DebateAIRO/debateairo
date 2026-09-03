# FIX-11 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-11 — Root traced, ticket filed: a real error gets a deterministic root verdict and ONE ticket a human can act on, with no raw text
**Gate:** G2 listener · **SPEC:** `slices/FIX-11/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 10 (`FIX-11-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor tickets: **S19 `t_f4439c53`** (mechanical, LLM-free tracer) · the **board-write** mechanics of **S28 `t_28c5c2e2`** (fixed template, board-id read-back before and after) — RE-OWNED under C1/V-1: in phase 1 the FixAgent files the ticket itself at trace time (D9, V-1 row text: "the agent files a ticket naming the root"), which CHANGES OBS-R127's "the listener SHALL NOT create 

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (10 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-11-R01 | The tracer runs inside the daemon for every incident entering `NEW`, is LLM-free, and terminates in exactly on… |  |  |  |
| FIX-11-R02 | The cause walk follows `parent_occurrence_ref`/`cause_relation` and the chain codes with a visited set; a zone… |  |  |  |
| FIX-11-R03 | `CODE_ROOT` names a repo-relative file and symbol from the normalized frames of the deepest first-party occurr… |  |  |  |
| FIX-11-R04 | Every trace persists to `obs.trace` (verdict, evidence ids, visited path, query count, manifest versions) BEFO… |  |  |  |
| FIX-11-R05 | Lineage joins are indexed and bounded; cross-run, future-sequence or build-mismatch joins yield `CORRUPT_LINEA… |  |  |  |
| FIX-11-R06 | ONE ticket per incident: when an incident first reaches a verdict, the daemon creates exactly one Kanban ticke… |  |  |  |
| FIX-11-R07 | Ticket title and body are rendered exclusively from the fixed template over: incident id, fingerprint prefix (… |  |  |  |
| FIX-11-R08 | The daemon never writes `.hermes/**`, never any other board, never changes ticket status (the orchestrator/V d… |  |  |  |
| FIX-11-R09 | `ui_client` incidents are ticketed as report-and-count only, labelled `FIX_INELIGIBLE` (§K row 12).… |  |  |  |
| FIX-11-R10 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-11-C1 |  | `(architecture seat fills)` |  |
| FIX-11-C2 |  | `(architecture seat fills)` |  |
| FIX-11-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-11-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-11-C2: (architecture seat fills)
FIX-11-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
