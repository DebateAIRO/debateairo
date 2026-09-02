# FIX-16 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-16 — The CI inventory gate: a new unclassified throw, bare catch, discarded promise or cause-losing wrapper fails the build, and the zone stays machine-checked
**Gate:** G1 capture · **SPEC:** `slices/FIX-16/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 7 (`FIX-16-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor tickets: **S12 `t_a0ce760a`** (CI inventory gate + checked-in baseline) · **S13** (D19 build repoint) is ALREADY TRUE on `dev` — root `package.json` `build` runs `pnpm --filter dialectical-engine-v2ui build` and `web/` was deleted 2026-09-01 — recorded as satisfied, no work. Stage-16 D6 finding (`logs/d12-demo-2026-09-01.log` stage 16): the gate MUST treat `packages/obs-ca

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (7 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-16-R01 | `tools/obs-inventory/**` scans `apps/ packages/ tools/ acceptance/` for: `throw` sites without a registry code… |  |  |  |
| FIX-16-R02 | A checked-in baseline snapshot grandfathers every pre-existing entry; the gate FAILS with `path:line` on any e… |  |  |  |
| FIX-16-R03 | The baseline is snapshotted after FIX-02/03/04/05 merge and its commit is recorded in DECISIONS.md; re-baselin… |  |  |  |
| FIX-16-R04 | Zone check: the gate fails on any `import`/`require`/dynamic import of a zone manifest prefix from any file un… |  |  |  |
| FIX-16-R05 | The gate is wired into root `lint` by one edit on the `lint-wiring` line of `package.json` (TP-6); its own scr… |  |  |  |
| FIX-16-R06 | The gate runs in under `obs.inventoryGateMs` (seed 30 000 ms) on this tree.… |  |  |  |
| FIX-16-R07 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-16-C1 |  | `(architecture seat fills)` |  |
| FIX-16-C2 |  | `(architecture seat fills)` |  |
| FIX-16-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-16-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-16-C2: (architecture seat fills)
FIX-16-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
