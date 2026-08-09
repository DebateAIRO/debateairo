# Ticket manifest — PROG-V3-R1 (board `debateai-v3`)

Cut 2026-08-06 from the full docs corpus + DR-068..DR-101.
Latch: all heads are children of BOARD-00; completing BOARD-00 (V's word) releases them.

| ID | Agent | Kanban id | Status | Parents | Title |
|---|---|---|---|---|---|
| BOARD-00 | Claude | `t_fb245fa5` | ready | — | Mission charter & board protocol (latch) |
| PRE-01 | Claude | `t_e7632c8f` | todo | BOARD-00 | Fold-in A: 07-build-order.md + 09-traceability.md against DR-068..DR-101 |
| PRE-02 | Claude | `t_427c1757` | todo | BOARD-00 | Fold-in B: 02-data-model.md + 03-module-design.md + 04-api-contract.md |
| PRE-03 | Claude | `t_a888ab35` | todo | BOARD-00 | Fold-in C: 05-register-skeleton.md + 06-test-strategy.md + 00-overview.md + 08 annotations |
| PRE-04 | Claude | `t_c3538824` | todo | BOARD-00 | ADRs: mint ADR-0015 + ADR-0016, resolve the numbering conflict, fold rulings into 01-decis |
| PRE-05 | Claude | `t_1a358442` | todo | BOARD-00 | DR-083 activation-table artifact: 71 row contracts with written predicates |
| PRE-06 | Claude | `t_f6e8547d` | todo | BOARD-00 | DR-093 ratification package: the 71-row correctness/enrichment split proposal |
| PRE-07 | Claude | `t_ddb54539` | todo | BOARD-00 | DR-084 ratification package: the eight typed citation-failure routes |
| PRE-08 | Claude | `t_7d9e70ad` | todo | BOARD-00 | A-01 founding-table correction: five terminal routes in requirements-spec §12.3 |
| VG-01 | V | `t_8e0c82e0` | todo | BOARD-00 | V SITTING: GPG-2 confirmation + GPG-3 bootstrap pin values + GPG-4 versions |
| VG-02 | V | `t_8d250d8d` | todo | BOARD-00, PRE-05, PRE-06, PRE-07 | V SITTING: register + ratification package sitting (DR-093 split, DR-084 routes, DR-083 ta |
| S00 | Codex | `t_b74d081c` | todo | PRE-01, PRE-02, PRE-03, PRE-04, VG-01 | Walking skeleton: a legal serve path, end to end |
| S01 | Codex | `t_24c030d2` | todo | S00 | Ledger and replay hardening |
| S02 | Codex | `t_f2f404cb` | todo | S01 | Graph and the cycle law |
| S03 | Codex | `t_626f46aa` | todo | S02 | Scoring engine (DF-QuAD, both operators, ruled lifting + collapse + pending arithmetic) |
| S04 | Codex | `t_25fb27f0` | todo | S03 | Judge contract and panel |
| S05 | Codex | `t_aa8c2d11` | todo | S04 | Serve pipeline hardened (full gate order + terminals + ruled band-cap) |
| S06 | Codex | `t_d68493d7` | todo | S05, PRE-05, VG-02 | Evidence subsystem (ruled gates + ratified routes + row contracts) |
| S07 | Codex | `t_4e7228af` | todo | S06 | SPLIT loop and defeaters (+ WAIT drain + spawn-time lifecycle) |
| S08 | Codex | `t_62b4e00a` | todo | S07 | CROSS (ruled trigger + item-scoped symmetry + critique schema) |
| S09 | Codex | `t_c5e8ec5a` | todo | S08, VG-02 | Budget and envelope (ratified split + ruled tier authority) |
| S10 | Codex | `t_5920e52d` | todo | S09 | Value overlay |
| S11 | Codex | `t_0413fb85` | todo | S10 | Staleness and liveness |
| S12 | Codex | `t_53f024c1` | todo | S11 | Settlement and scorecards (+ the DR-089 standing watch) |
| S13 | Codex | `t_e4081556` | todo | S12 | Cross-run memory |
| S14 | Codex | `t_2bf7c338` | todo | S13 | UI data-layer rebuild (kept surface, rebuilt insides, live lifecycle) |
| S15 | Codex | `t_d02b97cb` | todo | S14, VG-02 | Launch bundle (+ the DR-097 advisory audit) |

Total: 27 tickets. V-gated: VG-01, VG-02 (the board refuses `block` on todo-with-open-parents tickets, so each carries a pinned "V GATE" comment instead; they are V sittings, not agent work).
Full bodies live on the board (`hermes kanban show <id>`).
Every `[Codex]` ticket body ends with a "DESIGN PATTERNS — how to code it"
section extracted from [design-patterns.md](design-patterns.md) (P1..P18 + the
anti-pattern register); BOARD-00's read order includes the register.

Agent labels ride BOTH the assignee field and the ticket title prefix
(`[Claude]` / `[Codex]` / `[V]` — the spine's title convention, applied
2026-08-06 by direct board-store rename under Claude's board custody). Review
diamonds: Codex tickets (S00..S15) are reviewed by Claude + Grok (DR-101);
Claude-authored PRE tickets are reviewed by Codex + Grok (no self-approval;
maker diversity per DR-013). VG tickets are V's sittings. Completing any ticket
still requires both reviewer APPROVED markers; Claude holds board custody.
