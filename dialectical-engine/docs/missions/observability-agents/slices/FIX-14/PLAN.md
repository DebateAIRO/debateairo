# FIX-14 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-14 — The QUICK arm behind V's switch: unattended merge into `dev` of very small fixes, OFF by default, flipped only by V, with deferred canary and exactly one revert
**Gate:** G5 QUICK · **SPEC:** `slices/FIX-14/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 8 (`FIX-14-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor ticket: **S30 `t_af2a1c41`** (QUICK + deferred-canary arm) · R-E1/R-E2 (QUICK shape), Batch-3 row 13 (deferred canary), E6-01/03/12/14, OBS-R095/R096/R108/R110/R115/R116/R118/R119/R120/R121, RT-17/R24/R25/R30/R31/R32/R37/R42.

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (8 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-14-R01 | `quick_arm` is a policy-bundle slot with values `OFF / ON`, default `OFF`, changed only by a bundle re-pin und… |  |  |  |
| FIX-14-R02 | (a) FIX-13 vetoed Done; (b) at least `obs.quickPreconditionMergedFixes` approval-first fixes (seed 10; number … |  |  |  |
| FIX-14-R03 | ≤ 1 production file + 1 test file; ≤ `quickProductionLineCap` production lines and ≤ `quickTotalLineCap`… |  |  |  |
| FIX-14-R04 | a QUICK fix lands as a per-fix PR/branch auto-merged into `dev` — never `main` — only while head, base and… |  |  |  |
| FIX-14-R05 | at merge the landing is `UNVALIDATED` and the incident `FIXED_UNVALIDATED`; the root is frozen (no further fix… |  |  |  |
| FIX-14-R06 | forbidden-path touch · audit-chain break · auto-revert fired · rejected-verdict-rate breach · open capture… |  |  |  |
| FIX-14-R07 | While `quick_arm = OFF` the entire slice's code path is unreachable: a QUICK-labelled incident follows FIX-13 … |  |  |  |
| FIX-14-R08 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-14-C1 |  | `(architecture seat fills)` |  |
| FIX-14-C2 |  | `(architecture seat fills)` |  |
| FIX-14-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-14-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-14-C2: (architecture seat fills)
FIX-14-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
