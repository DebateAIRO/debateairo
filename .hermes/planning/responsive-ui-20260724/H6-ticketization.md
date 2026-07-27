# H6 Ticketization — responsive-ui-20260724

Verdict: **HERMES STEP 6 SELF-AUDIT PASS**

## Board

- Board slug: `debateai-responsive-ui`
- Tenant: `responsive-ui-20260724`
- Board custody: Hermes-Verifier
- Ticket count: 9
- Queue truth after fresh board read: 1 Ready (`S1a`), 8 Todo behind accepted parent links, 0 Running, 0 Blocked, 0 Done
- Codex launch: not performed
- Worktrees/branches: not created; V lane-plan approval remains the activation gate
- Authority epoch: 1

## Ticket map and binding risk classification

| Slice | Ticket | Binding risk_tier | Recorded reason |
|---|---|---|---|
| S1a | `t_242b42cc` | low | Strictly mechanical CSS partition; behavior/product TSX edits are forbidden and byte identity, the 43-file floor, and build equivalence bound the change. |
| S2 | `t_7e4eff60` | low | Additive green test tooling only; product code and cross-slice RED assertions are forbidden. Playwright bootstrap is schedule risk, not product risk. |
| S1b | `t_4f837665` | medium | Reversible frontend foundation change across every route with dvh, safe-area, collision-token, typography, and form-geometry sensitivity; no immutable-floor surface. |
| S3 | `t_befaed4f` | medium | Reversible production UI change in a tightly named region, but it rewrites a pinned test contract in the most test-entangled source file. |
| S4 | `t_df57cd49` | high | Immutable high-risk floor: mission-level hard-pinch architecture, three gesture delivery paths, ownership/state-machine and measurement-loop invariants, plus mandatory product-truth/V gates. |
| S5 | `t_0f877f41` | medium | Reversible capability-parity and collision work; the stop-and-reslice rule bounds the file surface and no immutable-floor surface is authorized. |
| S6 | `t_e6d36779` | medium | Reversible frontend work across four routes and protected-route shells; AuthGate semantics remain read-only, but multi-route geometry warrants independent review. |
| S7 | `t_2007a124` | medium | Reversible fixed-position chrome work with cross-slice collision and safe-area guarantees; no immutable-floor surface is authorized. |
| S8 | `t_3ac92e37` | high | Mission closure/product-truth gate inherits the S4 high-risk path: real-device pinch has no residual, can block the mission, and requires the full ladder plus V acceptance. |

## Accepted dependency DAG

```text
S1a t_242b42cc
  → S2 t_7e4eff60
    → S1b t_4f837665
      → S3 t_befaed4f ┐
      → S4 t_df57cd49 ├→ S8 t_3ac92e37
      → S5 t_0f877f41 ┤
      → S6 t_e6d36779 ┤
      → S7 t_2007a124 ┘
```

The graph contains only approved logical dependencies. No fake resource-semaphore edge was added. Actual ticket IDs and direct parents/children are recorded in board comments. S3–S7 remain a file-disjoint parallel block after S1b.

## HERMES STEP 6 SELF-AUDIT

| Audit line | Result | Evidence |
|---|---|---|
| Slice-to-ticket coverage | PASS | Exactly 9 approved slices map one-to-one to exactly 9 tickets: S1a, S2, S1b, S3, S4, S5, S6, S7, S8. No invented implementation ticket. |
| Dependencies match the approved deck | PASS | Live parent/child IDs match `S1a → S2 → S1b → {S3,S4,S5,S6,S7} → S8`; S8 has all five parallel parents. |
| Codex-only implementation ownership | PASS | Every title begins `[Codex]`; every typed state block says `Assigned agent: Codex`; no Claude/Grok coding ticket exists. |
| Verbatim slice contract preservation | PASS | Every body embeds exactly one bounded `VerticalSlices.md` slice section verbatim, including title, Goal, File contract with Allowed/Read-only/Forbidden/Verification, Dependencies, RED-first obligations, Acceptance checks, Worktree lane/Branch, risk suggestion, and Codex-readiness note. |
| Exact runnable verification commands preserved | PASS | Commands are preserved inside each verbatim File contract, including S1a's exact quoted dual-glob command/build forms, S2's three pnpm gates, per-slice gates, and S8's full-matrix command. |
| Comment-scan and same-worker/subagent rework laws | PASS | Every ticket requires full body/comment scans and contains exactly: “Rework returns to the SAME worker session; when your subagents' work gets changes requested, THE SAME subagent makes the changes.” Actual-ID dependency comments were added to all 9 tickets. |
| Review and human gates match tier | PASS | Low: direct Hermes diff review/same-cycle Done; medium: one independent reviewer + Hermes; high: full review ladder + product-truth gate + V. User-facing slices carry human acceptance; S4/S8 require V. Hermes alone has Done authority. |
| Ready queue deliberately small | PASS | Fresh live-board read: only S1a `t_242b42cc` is Ready. The other 8 tickets are Todo behind actual dependencies. |
| No unauthorized DB deletion | PASS | Every ticket forbids database deletion unless V specifically approves that exact deletion; no ticket authorizes product/live-data writes. |
| No self-Done, adjacent bundling, or activation side effects | PASS | Every ticket forbids Codex self-Done, adjacent-ticket bundling/splitting, worktree/branch creation before V approval, commit/push/merge/release, destructive Git/filesystem operations, and fake/reconstructed evidence. |
| `risk_tier` set and reason recorded | PASS | All 9 typed state blocks persist one of low/medium/high and a ticket-specific reason; the table above mirrors the binding values. |
| Routed path matches `risk_tier` | PASS | S1a/S2 use low path; S1b/S3/S5/S6/S7 use medium path; S4/S8 use high path. |
| Immutable high-risk floor holds | PASS | S4's architectural hard-pinch/gesture system is high. S8's inherited high-risk product-truth closure is high. No ticket touches persistence/migrations, provider spend, security/auth semantics, scoring semantics, live/product data, or destructive actions. |
| File contracts do not contradict tier | PASS | Low tickets exclude product behavior; medium tickets are reversible bounded frontend production changes; high tickets own the architectural pinch system or its mandatory product-truth closure. S6 is conservatively raised from the deck suggestion because it spans four routes. |
| STOP and scope-expansion rules preserved | PASS | S5 has the binding stop-and-reslice rule; S6 keeps AuthGate read-only absent a Hermes amendment; S3/S4/S7 preserve named forbidden regions/files. |
| Worktree/merge/human approval gates | PASS | Bodies record lanes/branches but do not create them. Board comments prohibit activation before V approval. No worker has merge authority; closure target and merge order are only a lane plan. |

No failing line. Self-audit verdict: **HERMES STEP 6 SELF-AUDIT PASS**.

## Complete LANE PLAN — V DECISIONS PACKET row

```yaml
lane_plan:
  mission: responsive-ui-20260724
  board: debateai-responsive-ui
  authority_epoch: 1
  activation_status: awaiting_V_lane_plan_approval
  lanes:
    - lane_id: resp-s1a
      ticket: t_242b42cc
      owner: codex
      risk_tier: low
      worktree.path: .worktrees/resp-s1a
      worktree.branch: lane/resp-s1a
      contract_summary: "Partition app/globals.css into an import-only hub plus styles/*.css; migrate only the five named CSS-reading tests through tests/loadCss.mjs; zero selector/value/order or product-TSX changes; prove 43-file green, byte identity, and build equivalence."
    - lane_id: resp-s2
      ticket: t_7e4eff60
      owner: codex
      risk_tier: low
      worktree.path: .worktrees/resp-s2
      worktree.branch: lane/resp-s2
      contract_summary: "Add package/lockfile, Vitest/Playwright configs, scripts, and green harness scaffolding only; product code and cross-slice RED assertions forbidden; prove test:src, test:unit, and smoke widths 320/375/1440."
    - lane_id: resp-s1b
      ticket: t_4f837665
      owner: codex
      risk_tier: medium
      worktree.path: .worktrees/resp-s1b
      worktree.branch: lane/resp-s1b
      contract_summary: "Foundation-only viewport/shell/dvh/safe-area/collision-token/breakpoint/fluid-type/16px-control work in app/layout.tsx, styles/base.css, enumerated foundation section rules, and tests/s1b-foundation/**; no other component JSX."
    - lane_id: resp-s3
      ticket: t_befaed4f
      owner: codex
      risk_tier: medium
      worktree.path: .worktrees/resp-s3
      worktree.branch: lane/resp-s3
      contract_summary: "Two-row debate chrome and phone overflow/scoring-status relocation inside the named DebatePageClient header/scoring regions, debate-chrome.css, optional OverflowMenu, named legacy regex repairs, and tests/s3-chrome/**; preserve scoring/safety semantics."
    - lane_id: resp-s4
      ticket: t_df57cd49
      owner: codex
      risk_tier: high
      worktree.path: .worktrees/resp-s4
      worktree.branch: lane/resp-s4
      contract_summary: "Implement CanvasViewport, pure zoom/fit/focal math, DebateCanvas integration, layout-stable canvas CSS, and tests/s4-canvas/**; lib/debatePresentation.ts, DebatePageClient.tsx, and collision-variable definitions remain forbidden/read-only; hard pinch cannot be waived."
    - lane_id: resp-s5
      ticket: t_0f877f41
      owner: codex
      risk_tier: medium
      worktree.path: .worktrees/resp-s5
      worktree.branch: lane/resp-s5
      contract_summary: "Responsive Thread/Split/Map plus synthesis sheet solely in the named components/styles and tests/s5-reading/**; DebatePageClient.tsx is forbidden and any need for it triggers stop-and-reslice."
    - lane_id: resp-s6
      ticket: t_e6d36779
      owner: codex
      risk_tier: medium
      worktree.path: .worktrees/resp-s6
      worktree.branch: lane/resp-s6
      contract_summary: "Unsqueeze library/new/settings/admin routes in the seven named product/style files plus tests/s6-library/**; AuthGate.tsx stays read-only unless Hermes explicitly amends the contract."
    - lane_id: resp-s7
      ticket: t_2007a124
      owner: codex
      risk_tier: medium
      worktree.path: .worktrees/resp-s7
      worktree.branch: lane/resp-s7
      contract_summary: "Clamp popover/drawers/toast/tokenDock via the named overlay components/styles and tests/s7-overlays/**; collision variables are consumed only and DebatePageClient.tsx is forbidden."
    - lane_id: resp-s8
      ticket: t_3ac92e37
      owner: codex
      risk_tier: high
      worktree.path: .worktrees/resp-s8
      worktree.branch: lane/resp-s8
      contract_summary: "Evidence-only closure in web/tests/** and .hermes/reports/responsive-ui-20260724/**; all product code read-only; run the full browser/size/state/collision matrix and real-device pinch/safe-area truth gates; route defects to owning slices."
  merge_order:
    - "lane/resp-s1a → integrate/responsive-ui-20260724"
    - "lane/resp-s2 → integrate/responsive-ui-20260724"
    - "lane/resp-s1b → integrate/responsive-ui-20260724"
    - "lane/resp-s3, lane/resp-s4, lane/resp-s5, lane/resp-s6, lane/resp-s7 → integrate/responsive-ui-20260724 in any mutual order after S1b; all five required before S8"
    - "lane/resp-s8 → integrate/responsive-ui-20260724"
  closure_integration_target:
    branch: integrate/responsive-ui-20260724
    parent: "tip of lane/roadmap-p0-p3 at lane-plan approval"
    authority: "Hermes/V gate; no worker gains merge authority"
  destructive_git_ops: none
```

V DECISIONS PACKET decision requested later by Claude-Router: approve or reject this lane/worktree/branch/merge plan as one row. This H6 artifact does not activate lanes and does not create worktrees or branches.
