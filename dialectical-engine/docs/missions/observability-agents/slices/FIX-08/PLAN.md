# FIX-08 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-08 — It cannot leak and it does not drop: the adversarial corpus and the nine chaos cases through the LIVE pipeline, proven on raw bytes
**Gate:** G1 capture · **SPEC:** `slices/FIX-08/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 11 (`FIX-08-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor ticket: **S16 `t_aab2d3d2`** (acceptance + chaos harness, G1 families G1-acc-1..9 as restated in FinalPlan §G G1 ACCEPTANCE) — with G1-acc-1 (runner mis-wiring fixture) REPLACED: `apps/runner/src/main.ts:97` now wires `judgementPolicy`, so the 2026-08-21 mis-wiring is UNVERIFIED-as-fixed and the fixture becomes FIX-03's real failed run.

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (11 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-08-R01 | An acceptance family under `acceptance/obs/**`, registered by one line in `acceptance/run-acceptance.ts` (TP-8… |  |  |  |
| FIX-08-R02 | Adversarial corpus: the six token classes planted in message, cause (depth 3), own properties, and stack-frame… |  |  |  |
| FIX-08-R03 | Identity-shaped canaries (values shaped like `asker_id`/`session_id`) never land in any correlation column (R-… |  |  |  |
| FIX-08-R04 | Schema manifest: a test enumerates every `obs.*` column from `information_schema` and asserts no column named … |  |  |  |
| FIX-08-R05 | Nine chaos cases, each with the product probe's exit code EQUAL to its no-capture control and any loss explici… |  |  |  |
| FIX-08-R06 | Grant tests run against the REAL connection strings: `debateai_obs_listener` is denied on `obs.occurrence_deta… |  |  |  |
| FIX-08-R07 | Installer import-graph: module-eval-reachable imports of `install/*.ts` are Node built-ins only; the `@debatea… |  |  |  |
| FIX-08-R08 | Zone timing: response-time distributions of the zone routes with capture on vs off show no statistically resol… |  |  |  |
| FIX-08-R09 | Overhead calibration: measured p99 `emit()` cost and queue behaviour are printed and recorded as register-row … |  |  |  |
| FIX-08-R10 | The harness fabricates no evidence: every row it asserts on was written by the real pipeline in a real process… |  |  |  |
| FIX-08-R11 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-08-C1 |  | `(architecture seat fills)` |  |
| FIX-08-C2 |  | `(architecture seat fills)` |  |
| FIX-08-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-08-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-08-C2: (architecture seat fills)
FIX-08-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
