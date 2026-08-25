# T1 Rework9 — Grok 4.6 statistics/tests/evidence/custody review

## Ticket state

- Ticket: `t_b225b2f2`, risk tier high, status `running`.
- Reviewer: a different fresh Grok 4.6 CLI session, read-only and independent.
- Author: Codex GPT-5.6 Sol xHigh subagent; author work is complete and inactive.
- Comments read through: Kanban context snapshot ending with the 2026-08-22 18:15 EEST roster/author-launch comment. The Router's stable-handoff and review-launch receipt may be newer routing metadata; do not use it as a content verdict.
- HEAD must remain `7918f4f8bff33909792afc01dc38d402972b4ccd`; staged index must remain empty.

## Immediate upstream artifacts

Read only these ticket artifacts and the directly referenced test/evidence paths:

- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-claude-rework9-draft-packet.md` (governing design; SHA-256 `ea5062492cfcadb2d3da13b407c827473fe261520a2ca67254a9594dd58da858`)
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-authorization-receipt.json`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-author-review-roster-amendment.json`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-progress.log`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-author-self-report.json`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-final-manifest.json`
- All `T1-rework9-red1-*`, `T1-rework9-focused1.*`, `T1-rework9-mutant*`, `T1-rework9-m16b-*`, `T1-rework9-final-focused.*`, `T1-rework9-final-static-*`, and `T1-rework9-final-custody.*` receipts named in the progress log.
- Candidate test `tests/integration/registration-database.test.ts` at SHA-256 `58342fe2ce49b9835fc47af04114cb0219442721305fca2adcd6611ef5407191`; prior Rework8 SHA-256 `fec8beaf47843e61d0674e7879be7172181facf26666794baa0c9fa58762078d`.
- Frozen product `apps/api/src/registration.ts` at SHA-256 `1021340613a3839b2379f8b1af2fe139112d1bb029c6bfddf54caa7425f4da03` for M5/M16b restoration checks.
- The static supervisor contract/checker and all seven supervisor components, only as needed to audit receipt/exclusivity semantics; do not execute them.

Adversarial lens: independently re-derive the cadence-blocked randomization family, the 4095 seeded masks plus identity, six endpoints, Westfall–Young single-step FWER calculation, within-pair Holm rule, AB/BA direction replication, terminal classification mapping, exact cardinalities and hard conjunction gates. Check that deterministic controls and M1–M5 plus clearing-only M16b fail for the intended non-vacuous reasons; distinguish invalid infrastructure attempts from evidence; verify final raw statuses, selection counts, custody hashes, no overlap claim, and that no old unchanged-rerun/threshold widening was smuggled in. You may perform small read-only arithmetic/recomputations, but do not run project tests or mutate files.

## Handoff marker

End with exactly one of:

- `GROK REWORK9 EVIDENCE REVIEW APPROVED`
- `GROK REWORK9 EVIDENCE REVIEW CHANGES REQUESTED`

Before the marker, give concrete findings ordered by severity with file:line/receipt evidence, independently recomputed values, residual risks, your Grok session ID if visible, and a concise 10–20 line self-report. Approval means you tried and failed to falsify this lens; uncertainty is CHANGES REQUESTED.

## Stop conditions

- Read-only review. Do not edit or create repository files, do not stage/commit/push, and do not change Kanban.
- Do not run Vitest, PostgreSQL, the gate launcher/controller/worker/viewer, launchctl, mutations, or any heavy command.
- Do not use subagents, web search, Claude, Codex, Hermes-model, or another Grok session.
- Do not read the code/lifecycle/security review packet, its terminal, log, status, or verdict.
- Stop with CHANGES REQUESTED if a required artifact/hash is missing or if review independence/custody cannot be established.

