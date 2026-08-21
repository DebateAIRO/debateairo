HERMES STAGE REVIEW CHANGES REQUESTED — FinalPlan passes H4 consolidation fidelity; VerticalSlices fails H5 ticket-deck correctness. The combined artifacts do not advance to H6 ticketization.

## Evidence inspected

- Approved baseline: `.hermes/planning/responsive-ui-20260724/Plan.md` (403 lines).
- C4 consolidation: `.hermes/planning/responsive-ui-20260724/FinalPlan.md` (448 lines), including its Consolidation notes appendix.
- G5 deck: `.hermes/planning/responsive-ui-20260724/VerticalSlices.md` (621 lines), including all nine slice contracts, the ownership matrix, merge-order section, and slicing notes.
- Protocol law: `apps/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md` and the Hermes node contract.
- Repository checks under `apps/dialectical-engine/web`: `package.json`, `pnpm-lock.yaml`, installed Next binary, the 43-file legacy `node:test` inventory (14 `*.test.mjs` + 29 `*.source-test.mjs`), and the five current `globals.css`-reading `.mjs` files.
- Command probes: `pnpm --version` succeeded (`11.5.2`); `pnpm exec next --version` succeeded (`Next.js v15.5.18`); literal `next --version` failed with `next: command not found`; current package scripts contain `build: next build` but do not yet contain the S2 test scripts.
- Arithmetic independently recomputed: cap-derived clearance = `18 + 96 = 114px`; at 320px, tab `14…122` and dock `134…302` leave 12px; at 568px, tab `14…370` and dock `382…550` leave 12px; zoom offset starts 126px from bottom.

## A. CONSOLIDATION FIDELITY (H4 lens)

Disposition: PASS.

- PASS — Hard-pinch ruling preserved, including the verbatim V sentence `"Pinch is a hard requirement."`, the voided earlier misclick, required iOS Safari / Android Chrome / desktop-trackpad coverage, buttons-not-sufficient rule, and BLOCKER escalation with no pinch residual or waiver.
- PASS — iOS/macOS WebKit contract preserved: GestureEvent scale, concurrent TouchEvent centroid, viewport-center fallback for trackpads, atomic `gestureOwner = "webkit"` handover, released captures, one mutator per frame, native listeners with `{ passive: false }`, cleanup, and synthetic-handler prohibition.
- PASS — Pointer-intent matrix preserved: interactive `closest()` exclusions, sub-8px tap, ≥8px pan, capture-phase `didPan` click suppression, pan-to-pinch promotion, and overview zoom-to-card before open.
- PASS — Overview layout stability preserved: size-preserving hiding only; `display: none` and other used-size-changing properties forbidden on height-contributing children; Playwright must assert per-card `offsetHeight` stability across zoom-band toggles.
- PASS — Reserved-rectangle contract preserved: 320px tab `14…122` versus dock `134…302`, 568px arithmetic, 12px gaps, expanded-dock mutual exclusion through `.debateView:has(.tokenForm)`, horizontal short-height zoom arrangement, and owning-slice collision gates.
- PASS — `fitPolicy` preserves all three modes: `column-auto`, `overview-auto`, `user-owned`, with same-mode resize recomputation and the 32px threshold.
- PASS — The 43-file `node:test` regression floor, five CSS-reader migration, S3’s 18-consumer warning, and RED-first header-contract rewrite remain load-bearing gates.
- PASS — AuthGate checking / locked / invalid-token / submitting states remain required through all three protected route shells, including the short-height matrix cells.
- PASS — S1a remains a pure partition: zero selector/value/order or product-TSX changes, shared `tests/loadCss.mjs`, all five CSS-reader migrations, loader byte identity, 43-test green gate, and build-output equivalence.
- PASS — Consolidation readings are sane. In particular, selecting `--token-dock-clearance: calc(18px + var(--dock-max-h))` = 114px over the stale 58px prose preserves the later reviewer-verified cap/rectangle design. The breakpoint-table granularity and reviewer-tag removal notes do not weaken requirements.
- FinalPlan findings: none. No return to the C4 session is required.

## B. SLICE DECK CORRECTNESS (H5 lens)

Disposition: CHANGES REQUESTED.

- PASS — Scope traces to FinalPlan. No invented product behavior, backend work, persistence work, or design substitution found.
- PASS — DAG and per-slice dependency lines match: `S1a → S2 → S1b → {S3, S4, S5, S6, S7 parallel} → S8`.
- CHANGES REQUESTED — Parallel ownership is fully disjoint for the named product/style/legacy-test rows, but not for new tests. Every S3–S7 contract allows generic `own test files`; the appendix merely asks lanes to choose slice-distinct names under the shared test namespace. That convention is not an enforceable file contract and does not prove pairwise disjointness. Assign a unique path/prefix or enumerate named new test files for each parallel slice, then reflect them in the ownership matrix and slice contracts.
- CHANGES REQUESTED — Verification is not wholly runnable as written. S1a specifies literal `next build`, which fails in the repository shell because the project-local Next binary is not on PATH. Use the existing runnable `pnpm build` script or `pnpm exec next build`. Also replace “`node --test` over `*.test.mjs` / `*.source-test.mjs`” with one exact pre-S2 command that deterministically runs all 43 files; `pnpm test:src` is unavailable until S2 creates it.
- PASS — Every slice has an explicit RED-first disposition and concrete acceptance checks. The `None` entries for S1a (strictly non-behavioral), S2 (green harness bootstrap), and S8 (read-only evidence closure) faithfully preserve FinalPlan’s intentional exceptions; S1b and S3–S7 carry targeted in-slice RED obligations.
- PASS — Risk-tier suggestions are reasoned and remain non-binding for H6. S4 is appropriately high; the remaining low/medium suggestions match their bounded change/evidence surfaces.
- PASS — No slice authorizes worker self-Done, ticket splitting, push/merge execution, DB access, database deletion, or product/live-data writes. The integration-order prose is sequencing only, not merge authorization.
- CHANGES REQUESTED — The fan-in sequence is coherent, but the section titled “Merge order into the closure target” never names the closure target branch/worktree. It only lists lane branches pointing to slice labels. Name one closure target and state that S1a, S2, S1b, all five approved parallel lanes, and finally S8 integrate into that target in the listed order; preserve the rule that this is a plan for H6/V approval, not worker merge authority.

## Findings

1. **HIGH — VerticalSlices / parallel file-contract gap (route to G5 session).** New-test ownership for S3–S7 is generic and convention-based, so the deck’s claim of fully verified parallel disjointness is stronger than its contracts. Bind unique per-slice test paths/prefixes or named files.
2. **MEDIUM — VerticalSlices / non-runnable verification commands (route to G5 session).** Literal `next build` fails in the repo shell, and S1a’s all-43 legacy command is descriptive rather than executable. Replace both with exact runnable commands.
3. **HIGH — VerticalSlices / unnamed closure target (route to G5 session).** Merge order is listed, but the closure target required for the H6 lane plan is absent. Name the target branch/worktree and make the fan-in explicit without granting merge authority.

ROUND: 1 (stagnation 0 of 3)

comments read through: not ticketed (pre-board stage)
