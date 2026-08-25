# T1 Claude Opus N=3 attribution report correction

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router
Kanban: `accounts-phase1` / `t_b225b2f2`
Scope: evidence-report correction only

## Authority and custody

Edit only:

`docs/missions/2026-08-17-accounts-privacy-security/logs/T1-n3-attribution-progress.log`

Do not edit product code, policy, tests, raw repeat receipts/status files,
`T1-n3-attribution-claude-result.json`, prior packets, or any quarantined path.
Do not run tests, stage, commit, push, launch agents/models, or move Kanban.
Keep the terminal verdict `N3 ATTRIBUTION MIXED OR INCONCLUSIVE` and every raw
measurement unchanged. The wrapper has made a verified backup of the one
editable report. If custody or scope is not exact, stop nonzero.

## Binding Sol xHigh corrections

The raw experiment and custody are accepted; no rerun is needed. Correct only
the report's interpretation and clerical statements:

1. In section 12.4, preserve the descriptive observation that the named
   un-drained waves were 15--55 ms hotter, but remove the claim that the
   preceding existing wave's duplicate-postwork KDFs remained in the pool
   during the following missing wave. The timelines show the existing
   postwork begins roughly 5.6 seconds after its origin, whereas the following
   missing wave begins roughly 0.69 seconds after that origin and finishes
   roughly 0.69 seconds later. State that the difference is descriptive only
   and no post-response contention cause is established.
2. Remove the secondary audit-sublane prediction derived from that invalid
   contention claim in section 12.6, the summary near section 15, and the final
   verdict. A third worker remains only the separately unauthorized,
   falsifiable test of the ordinary credential enqueue-to-settle hypothesis.
3. Correct the instrumentation description: post-response work is logged under
   the `request` ALS phase and classified as non-critical from span names and
   timing; it is not explicitly phase-tagged `postresponse`. The test asserts
   that post-response spans are nonempty, not every exact reported
   post-response count. Raw reported metrics must remain untouched.
4. Correct clerical facts wherever the report states them:
   - the preserved patch has 777 added lines, not 778;
   - the preflight timestamp is `2026-08-22T02:00:30Z`, not `02:00:06Z`;
   - do not publish a self-stale progress-log line count. If a line count is
     necessary, compute it only after the final edit; otherwise omit it.
5. Add a short final `SOL XHIGH EVIDENCE CORRECTION` note documenting that the
   experiment/custody remain accepted, the report-only overclaim was removed,
   no rerun occurred, and no third-worker experiment or production change is
   authorized.

## Verification and handoff

Before exit:

- inspect the final diff of the one editable report;
- prove no governed product/policy/test file changed and the Git index is
  empty;
- do not alter the raw receipt statuses or metrics;
- write no additional artifact; return a concise correction summary.

