# FIX-10 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-10 — One action turns it all off: `obsctl kill` stops capture, the daemon and any executor, and the product does not notice
**Gate:** G2 listener · **SPEC:** `slices/FIX-10/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 8 (`FIX-10-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor ticket: **S22 `t_37f2f56f`** (`obsctl status/kill/arm`). Custody: **single custodian = V** (E6-02 amended 2026-08-22); the `approve/deny/reveal-drift` regions are FIX-12's.

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (8 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-10-R01 | `obsctl kill` writes the `KILL` marker (filesystem, no database) and flips FIX-07's capture OFF switch; within… |  |  |  |
| FIX-10-R02 | `obsctl arm` requires the custodian's token (V alone) and a positive `ARMED` token; it clears `KILL`, re-enabl… |  |  |  |
| FIX-10-R03 | `obsctl status` prints, without a model call: per runtime capture state and last heartbeat age (from `obs.comp… |  |  |  |
| FIX-10-R04 | `kill` and `arm` complete with the database down (no connection attempted on that path).… |  |  |  |
| FIX-10-R05 | The product is unaffected by kill or arm: a scheduler job run before, during, and after `kill` has identical e… |  |  |  |
| FIX-10-R06 | Every `obsctl` invocation appends an `obs.agent_action` row (`actor = 'obsctl:<os user>'`, `action_kind ∈ {K… |  |  |  |
| FIX-10-R07 | `obsctl` has no LLM adapter and no product import (resolve-hook trace: no CLI spawn module, no `@debateai/db`)… |  |  |  |
| FIX-10-R08 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-10-C1 |  | `(architecture seat fills)` |  |
| FIX-10-C2 |  | `(architecture seat fills)` |  |
| FIX-10-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-10-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-10-C2: (architecture seat fills)
FIX-10-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
