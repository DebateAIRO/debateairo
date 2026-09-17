# FIX-12 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-12 — Diagnosis proposal, and it waits: a fresh read-only model worker proposes a fix, V is notified, and nothing moves until V approves
**Gate:** G3 dispatch · **SPEC:** `slices/FIX-12/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 11 (`FIX-12-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor tickets: **S27** (diagnosis-worker harness — ticket id not present in the D12 log; orchestrator resolves) · **S18b** (daemon dispatch arm, promoted per H5-06; id not in the log) · **S23** (notifications osascript + sendmail; id not in the log) · **S28 `t_28c5c2e2`** `approve/deny/reveal-drift` regions. R-E3 (Codex CLI per incident), R-E6-09 (research → notify V → appro

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (11 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-12-R01 | The dispatch arm defaults OFF after every supervisor restart; `obsctl arm --dispatch` (custodian token) turns … |  |  |  |
| FIX-12-R02 | Per eligible incident (verdict `CODE_ROOT`, floor `FLOOR_CLEAR`, not `ui_client`, not zone): the daemon spawns… |  |  |  |
| FIX-12-R03 | The worker's input is the validated incident packet only (ids, codes, normalized frames, chain codes, the root… |  |  |  |
| FIX-12-R04 | FixProposal (fixed template) fields: incident id, root, diagnosis (enumerated defect class + template paramete… |  |  |  |
| FIX-12-R05 | Notification to V on every proposal regardless of severity: macOS `osascript` notification naming incident id … |  |  |  |
| FIX-12-R06 | `obsctl approve <proposal-id>` binds the stored content hash (records `APPROVED(hash)`); `obsctl deny <proposa… |  |  |  |
| FIX-12-R07 | Usage telemetry or fail-closed: if the CLI relay returns no usage data, the daemon records `TELEMETRY_MISSING`… |  |  |  |
| FIX-12-R08 | Injection corpus clean: the pinned corpus (RP-3) run through the worker yields ZERO violations; targets includ… |  |  |  |
| FIX-12-R09 | Nothing lands: after any number of proposals and approvals, `git status --porcelain` and `git branch --list 'f… |  |  |  |
| FIX-12-R10 | If V lifts DR-179, only the adapter behind the CLI seam changes; no authority, cap, or approval rule changes (… |  |  |  |
| FIX-12-R11 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-12-C1 |  | `(architecture seat fills)` |  |
| FIX-12-C2 |  | `(architecture seat fills)` |  |
| FIX-12-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-12-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-12-C2: (architecture seat fills)
FIX-12-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
