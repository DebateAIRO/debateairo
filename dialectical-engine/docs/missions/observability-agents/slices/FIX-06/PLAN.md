# FIX-06 — Browser client surface implementation plan

**Slice:** FIX-06 — Browser client surface: a client-side fault reaches the store without free text ever leaving the browser
**Gate:** G1 capture · **SPEC:** `slices/FIX-06/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 8 (`FIX-06-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor tickets: **S09 `t_3c54fdeb`** (client seam + hardened `POST /v1/obs/client-report`) · **S15** (D20 — `apps/ui/lib/observability/README.md` amendment, OBS-R136). §K row 12 stands: `ui_client` occurrences are report-and-count only, structurally ineligible for every fix path.

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (8 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-06-R01 | Both Next boundaries and the scoring boundary use one reporter. | 6.6–6.7 | C3 | `fix06-error-boundaries.test.tsx` |
| FIX-06-R02 | The reporter transmits the closed payload and no thrown-value text. | 6.6–6.7 | C3 | `fix06-error-boundaries.test.tsx` |
| FIX-06-R03 | The endpoint rejects non-members, stamps the server build, and writes the ruled source/runtime/capture point. | 6.2–6.3 | C1 | `fix06-client-report.test.ts` |
| FIX-06-R04 | The route mounts after the immutable registration region. | 6.4–6.5 | C2 | `fix06-zone-region.test.ts` |
| FIX-06-R05 | A restart-rotated origin hash limits requests and persists counted drops. | 6.2–6.3 | C1 | `fix06-client-report.test.ts` |
| FIX-06-R06 | The persisted source is `ui_client`; FIX-09 maps a UI-only source set to `FIX_INELIGIBLE`. | 6.8 | C4 | FIX-06 integration test plus FIX-09 fold test at `7a9765ef…` |
| FIX-06-R07 | The existing JSONL README receives one separation paragraph. | 6.7 | C3 | exact scoped diff inspection |
| FIX-06-R08 | Worker evidence stops before V acceptance. | 6.9 | C4 | three-run clusters and handoff |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-06-C1 | 6.2–6.3 | command below | API route module, one policy entry and one route mount |
| FIX-06-C2 | 6.4–6.5 | command below | architecture test only |
| FIX-06-C3 | 6.6–6.7 | command below | five named UI files and README |
| FIX-06-C4 | 6.8–6.9 | command below | verification only |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```sh
FIX06_BASE_REF=b5eda1cbf9b8954ac598c5433931fb8f5aa9142f pnpm vitest run tests/integration/fix06-client-report.test.ts --reporter=verbose
FIX06_BASE_REF=b5eda1cbf9b8954ac598c5433931fb8f5aa9142f pnpm vitest run tests/architecture/fix06-zone-region.test.ts --reporter=verbose
pnpm vitest run tests/render/fix06-error-boundaries.test.tsx --reporter=verbose
pnpm generate:contract
pnpm typecheck
pnpm audit:source
```

## Steps

### C0 — executable browser fault

- [x] **6.1** Use the frozen SPEC §5 fault: in the running application's browser console, schedule `throw new Error("FIX06_V_DRILL")`. This dispatches the platform `error` event without editing product code. `apps/ui/app/error.tsx` and `apps/ui/app/global-error.tsx` are Next boundary entry points; the shared reporter installs one idempotent `window.error` / `unhandledrejection` listener when either boundary module loads. The render test dispatches the same event and proves the planted text is not an argument to the report transport. Live browser execution remains V acceptance.

### C1 — closed endpoint and counted limiter

- [ ] **6.2** Write the endpoint test first. Prove unknown members and unknown keys return 400 without a write; a valid member returns 202 and writes a server-stamped `ui_client` / `ui-client` / `client` envelope; 200 same-origin calls eventually return 429 and persist a `CLIENT_REPORT_RATE_LIMITED` row; two module instances hash the same origin differently.
- [ ] **6.3** Add `apps/api/src/obs-client-report.ts`, the public policy inventory rows, and one `registerClientReportRoutes(api)` line strictly after the registration block. Run the C1 command three times.

### C2 — immutable registration-region guard

- [ ] **6.4** Add the architecture test comparing `resolveZoneRouteMountRegion()` at `FIX06_BASE_REF` with the working file and proving the client-report mount begins after `endOffset`.
- [ ] **6.5** Move the mount inside the captured region and show RED, restore it and show GREEN, then run C2 three times.

### C3 — one browser reporter

- [ ] **6.6** Write the render test first. Prove both Next boundaries and `ScoringErrorBoundary` report once with exact closed keys; an extra `message`, `stack`, or `url` member is rejected before fetch; a real `window.error` event reports only its enumerated kind.
- [ ] **6.7** Add `apps/ui/lib/obs/{enums,reporter}.ts`, both boundary files, the scoring rewire, and one README paragraph. Run C3 three times plus the UI package suite and mode-token gate.

### C4 — eligibility dependency and final evidence

- [ ] **6.8** Run the FIX-09 fold test at immutable tip `7a9765efad4d639ac042179f626573f49efc9784` and record that `fixEligibility(["ui_client"])` returns `FIX_INELIGIBLE`; do not compose unrelated FIX-09 files into this branch.
- [ ] **6.9** Generate the contract, run typecheck and classify only the delta from the repository pin, run source audit, inspect the scoped diff, and hand off without V acceptance claims.

## Standing tests that READ this slice's write surface
- `tests/integration/fix04-context-hook.test.ts` reads every registered API route and therefore covers the new public authorization rows.
- `tests/unit/t9-mode-tokens.test.ts` walks the UI rendering surface and remains a pinned neighbouring gate.
- `apps/ui` package `test` and `typecheck` cover the created App Router boundary modules.

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
