# T1 Claude Opus N=3 report correction 2 — evidence-source classification

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router
Kanban: `accounts-phase1` / `t_b225b2f2`
Scope: one report-only wording correction

Edit only
`docs/missions/2026-08-17-accounts-privacy-security/logs/T1-n3-attribution-progress.log`.
Run no tests. Do not edit raw receipts, metrics, product, policy, tests, prior
packets/results, or quarantined paths. Do not stage, commit, push, launch an
agent/model, or move Kanban.

Binding Sol xHigh correction: near current lines 595--597, replace the blanket
claim that every non-vacuity-ledger row (except exact post-response counts) is
an in-test `expect`. State the exact evidence-source classification:

- functional, critical count, drain, captured-secret, dangerous-marker, and
  unhandled-error rows are enforced by in-test assertions;
- exact post-response counts are reported metrics, while the test asserts only
  that post-response spans are nonempty;
- raw-receipt marker rows (`40P01`, PostgreSQL `ERROR/FATAL`, `ELIFECYCLE`,
  `NOWAIT`, `Failed Tests`) and leaked-process checks are external receipt/host
  scans, not in-test assertions.

All other report text and every raw measurement must remain unchanged. Keep the
terminal marker `N3 ATTRIBUTION MIXED OR INCONCLUSIVE` and the section 18
correction. Before exit, diff against the wrapper backup, verify only this
classification paragraph changed, verify HEAD/index and the frozen test hash,
and return a concise summary.

