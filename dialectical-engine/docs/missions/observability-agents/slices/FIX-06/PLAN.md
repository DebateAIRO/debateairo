# FIX-06 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-06 — Browser client surface: a client-side fault reaches the store without free text ever leaving the browser
**Gate:** G1 capture · **SPEC:** `slices/FIX-06/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 8 (`FIX-06-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor tickets: **S09 `t_3c54fdeb`** (client seam + hardened `POST /v1/obs/client-report`) · **S15** (D20 — `apps/ui/lib/observability/README.md` amendment, OBS-R136). §K row 12 stands: `ui_client` occurrences are report-and-count only, structurally ineligible for every fix path.

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (8 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-06-R01 | `apps/ui/app/global-error.tsx` and `apps/ui/app/error.tsx` exist and report through one reporter in `apps/ui/l… |  |  |  |
| FIX-06-R02 | The reporter sends `{ code, component, route_template, kind, build_ref? }` where each field is a member of a s… |  |  |  |
| FIX-06-R03 | `POST /v1/obs/client-report` accepts only members of the server-side enumerations (unrecognized ⇒ rejected, … |  |  |  |
| FIX-06-R04 | The mount is inserted STRICTLY AFTER the closing brace of the `if (options.registration !== undefined)` block;… |  |  |  |
| FIX-06-R05 | Rate limiting is keyed on a transient network-origin hash (in-memory salt rotated on restart, never persisted)… |  |  |  |
| FIX-06-R06 | `ui_client` rows are excluded by construction from fingerprint maturity, tier eligibility, and every fix path … |  |  |  |
| FIX-06-R07 | `apps/ui/lib/observability/README.md` gains one paragraph: the developer JSONL diagnostics stay file-only and … |  |  |  |
| FIX-06-R08 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-06-C1 |  | `(architecture seat fills)` |  |
| FIX-06-C2 |  | `(architecture seat fills)` |  |
| FIX-06-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-06-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-06-C2: (architecture seat fills)
FIX-06-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
