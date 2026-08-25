# T1 Rework9 — Grok 4.6 code/lifecycle/security review

## Ticket state

- Ticket: `t_b225b2f2`, risk tier high, status `running`.
- Reviewer: one fresh Grok 4.6 CLI session, read-only and independent.
- Author: Codex GPT-5.6 Sol xHigh subagent; author work is complete and inactive.
- Comments read through: Kanban context snapshot ending with the 2026-08-22 18:15 EEST roster/author-launch comment. The Router's stable-handoff and review-launch receipt may be newer routing metadata; do not use it as a content verdict.
- HEAD must remain `7918f4f8bff33909792afc01dc38d402972b4ccd`; staged index must remain empty.

## Immediate upstream artifacts

Read only these ticket artifacts and the directly referenced source paths:

- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-claude-rework9-draft-packet.md` (governing design; SHA-256 `ea5062492cfcadb2d3da13b407c827473fe261520a2ca67254a9594dd58da858`)
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-authorization-receipt.json`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-author-review-roster-amendment.json`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-progress.log`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-author-self-report.json`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-final-manifest.json`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-final-focused.log` and `.status`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-final-custody.log` and `.status`
- The Rework9 diff in `tests/integration/registration-database.test.ts`: prior SHA-256 `fec8beaf47843e61d0674e7879be7172181facf26666794baa0c9fa58762078d`, candidate SHA-256 `58342fe2ce49b9835fc47af04114cb0219442721305fca2adcd6611ef5407191`.
- Frozen product/lifecycle paths named by the manifest, especially `apps/api/src/registration.ts` at `1021340613a3839b2379f8b1af2fe139112d1bb029c6bfddf54caa7425f4da03`.
- Static supervisor set: `T1-rework9-gate-launcher.mjs`, `T1-rework9-gate-controller.mjs`, `T1-rework9-gate-worker.mjs`, both `T1-rework9-gate-*.plist.template` files, `T1-rework9-gate-viewer.mjs`, `T1-rework9-gate-contract.md`, and `T1-rework9-static-supervisor-check.sh`.

Adversarial lens: actively try to break lifecycle, security, exclusivity, cleanup, immutable custody, secret handling, process ownership, launchd recovery, and the test implementation's mapping to the public resend behavior. Check for false-green paths, races, fail-open branches, PID reuse, stale-lock behavior, postflight-before-release errors, secret-bearing durable output, or a test seam that does not exercise the real route. Confirm the temporary product mutants were exactly restored. Treat current dirty-tree files outside this ticket as pre-existing and do not touch them.

## Handoff marker

End with exactly one of:

- `GROK REWORK9 CODE REVIEW APPROVED`
- `GROK REWORK9 CODE REVIEW CHANGES REQUESTED`

Before the marker, give concrete findings ordered by severity with file:line evidence, independently checked hashes/receipts, residual risks, your Grok session ID if visible, and a concise 10–20 line self-report. Approval means you tried and failed to falsify this lens; uncertainty is CHANGES REQUESTED.

## Stop conditions

- Read-only review. Do not edit or create repository files, do not stage/commit/push, and do not change Kanban.
- Do not run Vitest, PostgreSQL, the gate launcher/controller/worker/viewer, launchctl, mutations, or any heavy command.
- Do not use subagents, web search, Claude, Codex, Hermes-model, or another Grok session.
- Do not read the statistics/evidence review packet, its terminal, log, status, or verdict.
- Stop with CHANGES REQUESTED if a required artifact/hash is missing or if review independence/custody cannot be established.

