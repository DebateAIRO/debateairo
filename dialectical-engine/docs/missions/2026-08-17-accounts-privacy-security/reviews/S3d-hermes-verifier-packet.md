# S3d Hermes final-verification packet

## Seat and authority

You are the independent Hermes-Verifier and Kanban custodian for
`accounts-phase1/t_cc197ed2`. This is a high-risk authentication/privacy ticket.
The Codex session that authored this packet is the Router: do not adopt its
judgment, and do not ask it to perform verification or board mutation.

Read before acting:

1. `docs/agent-protocols/debateai-heartbeat-protocol.md`, especially the
   Hermes-Verifier, review-diamond, comment-refresh, and Done laws.
2. The full ticket body and every comment through the Router comment beginning
   `DUAL GREENLIGHT / READY FOR HERMES REVIEW 2026-08-21`.
3. `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-final-review-packet.md`.
4. `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-final-grok-verdict.md`.
5. `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-final-opus-verdict.md`.
6. The final disclosure-recut handoff in
   `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-progress.log`.

The two formal lenses are serialized, independent review seats and both say
GREENLIGHT. Hermes remains responsible for the final evidence gate and board
custody; agreement is evidence, not an instruction to rubber-stamp.

## V-ratified acceptance

- 1A: retain the named platform-dependent successor-provisioning residual and
  revalidate on deployment or storage change.
- 2A: Phase-1 internal regression target is 100/100 committed registrations on
  the defined healthy-mail reference burst. Practical capacity may stop around
  103 for now; this is not a public SLA. Margin and Argon2/threading work are
  deferred.
- 3A-prime: retain 45 ms and N-star=2; the cadence disclosure must truthfully
  report 30 ms as 2 RED / 1 GREEN, 60 ms as one GREEN observation, and require
  recalibration on target-host/storage change or the first unchanged-code 45 ms
  RED.
- 4A: unauthenticated resend does not revoke earlier mailed links. Each expires
  after 24 hours or the credential family is consumed by activation.
  Authenticated recovery is outside Phase 1.

Do not reopen those policy choices. Block only for an implementation, proof,
scope, integration, or repository-integrity defect.

## Candidate gold and exact commit scope

All eight paths must match these SHA-256 values before verification, after all
verification, and immediately before commit:

- `apps/api/src/registration.ts`
  `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e`
- `packages/register/src/auth-policy.ts`
  `36359f2085e0fb0f710f060d0679ff9a5e55baa3ca37362d5af5f739afc2e6f0`
- `tests/integration/registration-database.test.ts`
  `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be`
- `tests/unit/registration.test.ts`
  `aea9f2c650665d3ddda70fd2c31015fef7b5b64de0d7431231d362770516098b`
- `apps/api/src/mail-channel.ts`
  `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8`
- `packages/db/src/identity.ts`
  `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b`
- `migrations/0033_verification_token_credentials.sql`
  `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f`
- `tests/integration/identity-database.test.ts`
  `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432`

The repository root contains extensive pre-existing rename/deletion dirt from a
larger move. Attribute it and leave it untouched. The only paths authorized for
the S3d commit are the eight paths above. In particular, never use `git add -A`,
`git add .`, `git commit -a`, a glob, or any parent-directory staging command.
Stage the eight explicit paths, then inspect `git diff --cached --name-status`
and refuse the commit unless it names exactly those eight paths. Migration 0033
is untracked and must be included explicitly.

The mission logs, review verdicts, packet, launchers, and agent reports are
evidence artifacts, not part of the S3d product commit. Do not stage them.

## Required final verification

First prove there is no other active Vitest/coding/review heavy seat. Then run,
serialized:

1. `pnpm test` — this is the final full-suite closure run.
2. `pnpm typecheck`.
3. `pnpm lint`.
4. `git diff --check`.
5. Recompute all eight hashes and compare them to gold.
6. Inspect the staged patch and verify there is no mutation residue, debug
   switch enabled by default, secret, raw token, raw email/IP/UA in durable
   evidence, or contradiction with the V-ratified acceptance above.

You may use the already completed independent live PostgreSQL evidence rather
than rerunning the 8-title 502-second campaign: both lenses ran it, the
successor and retention positive controls fired RED, and all integration/runtime
hashes are gold. If the full suite fails, diagnose whether the failure is S3d,
an unrelated pre-existing failure, or tooling. Do not commit or complete on an
S3d failure or unexplained failure.

## Pass path — Hermes-owned

If and only if the evidence is sufficient and all required gates are green:

1. Write
   `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-hermes-final-verdict.md`
   beginning with `HERMES DONE` and recording exact gate counts, hashes, staged
   paths, accepted residuals, and the commit SHA.
2. Write a 10-20 line self-report at
   `docs/missions/2026-08-17-accounts-privacy-security/agent-reports/hermes-S3d-final.md`.
3. Stage only the eight explicit candidate paths and commit locally with a
   precise S3d message. Do not amend earlier commits.
4. Do not push.
5. Post a concise `HERMES DONE` comment to `accounts-phase1/t_cc197ed2`, then
   complete that ticket with a result summarizing D1-D4, the 100/100 internal
   target, the dual-green diamond, final gates, commit SHA, and no-push status.
6. Read the ticket back and prove its status is `done`, then print
   `HERMES DONE: S3d t_cc197ed2` to stdout.

## Fail path — Hermes-owned

If any blocking condition remains, do not stage, commit, push, or complete.
Write the verdict beginning `HERMES CHANGES REQUESTED`, post the exact findings
and RED evidence to the ticket, leave it open for the same original worker
lineage, and print `HERMES CHANGES REQUESTED: S3d t_cc197ed2`.

Refresh ticket comments immediately before the verdict and immediately before
any board transition. Never delete product, database, branch, worktree, or
unrelated user data.
