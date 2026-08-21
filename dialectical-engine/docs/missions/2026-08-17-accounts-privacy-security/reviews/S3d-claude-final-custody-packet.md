# S3d — Claude Opus final-custody takeover

## Authority and seat

V explicitly cancelled the already-running Hermes-Verifier on 2026-08-21 and
ordered that its partial work be preserved, Hermes be removed from the mission,
and this exact unfinished final-custody assignment be transferred to a **fresh,
visible Claude Opus subagent**. This packet is that authority.

You are a new `claude-opus-5` final-custody seat. The S3d implementation author
was `codex@gpt-5.6-sol`, so you are independent of the author. You may:

- read and verify the candidate and its durable evidence;
- run the final gates below;
- write only the verdict/report artifacts named below;
- stage exactly the eight candidate paths below and make one local commit when
  and only when every gate is green and every post-gate hash is exact;
- post the final custody receipt and complete kanban ticket `t_cc197ed2` when and
  only when the commit succeeds.

You may **not** change product code or tests, repair failures, widen scope, stage
any other path, or push. A gate failure, hash divergence, scope ambiguity, or
unexpected staged path is `CLAUDE CUSTODY CHANGES REQUESTED`: write the failure
verdict/report, post the ticket comment, do not stage/commit/complete, and return.

Hermes is retired. Do not launch or resume a Hermes model/agent. The
`~/.local/bin/hermes kanban` executable may be used only as the board client.
No Fable. No push.

## What Hermes completed before cancellation

Hermes's redacted partial transcript is preserved at:

`docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-final-hermes-partial-session.jsonl`

SHA-256:

`b0e57a2815e0620b0d044ca6009797a3a084aed4005b9bb9ca1b7b7980432fe9`

Hermes completed only read/analysis work:

- read the final verifier packet and both final reviewer verdicts;
- classified the serialized Grok and Claude reviews as genuine independent
  GREENLIGHTs backed by live PostgreSQL evidence and RED-firing controls;
- read the verifier/diamond/Done laws;
- read the live ticket and the final authority comments, including the dual
  GREENLIGHT and V's no-future-Hermes ruling.

Hermes ran no final test, made no code/test edit, staged nothing, committed
nothing, and did not change the board. Both the Hermes process and its local
model were stopped. Therefore inherit its reads, but begin execution at the
pre-hash and independently perform every gate in this packet.

## Required reads

Read these in full before running a gate:

1. this packet;
2. `reviews/S3d-final-review-packet.md`;
3. `reviews/S3d-final-grok-verdict.md`;
4. `reviews/S3d-final-opus-verdict.md`;
5. `logs/S3d-progress.log`;
6. the final four comments on `t_cc197ed2`, using
   `~/.local/bin/hermes kanban --board accounts-phase1 show t_cc197ed2`;
7. the Hermes partial transcript above, at least its final protocol, ticket, and
   authority events, to confirm the exact handoff boundary.

The final review packet SHA-256 must be:

`2f3150a3565bec375edec2e5561b4baca8e1c09ec1a5b2c1c89f168f8aef0cd5`

## Repository and frozen candidate

Repository:

`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`

Expected pre-commit HEAD:

`5b2471d559f1ed5705dc3b9d55525497c5882478`

The shared worktree contains thousands of unrelated pre-existing status paths.
Never use `git add -A`, `git add .`, `git commit -a`, a glob, or a broad status
operation as a staging source. Stage only the literal paths listed here.

Exact candidate paths and required pre/post-gate SHA-256 values:

| Path | SHA-256 |
|---|---|
| `apps/api/src/registration.ts` | `c5846a86b64b1941d917be6dd9f2d27b06fab400f6ca9fdfd036b8d72ec2b27e` |
| `packages/register/src/auth-policy.ts` | `36359f2085e0fb0f710f060d0679ff9a5e55baa3ca37362d5af5f739afc2e6f0` |
| `tests/integration/registration-database.test.ts` | `d51af60a81e80326bdb806ab74ebcb3cd51ca1eb7eaac95f31f1f179779e59be` |
| `tests/unit/registration.test.ts` | `aea9f2c650665d3ddda70fd2c31015fef7b5b64de0d7431231d362770516098b` |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432` |

At entry, the seven tracked files must be modified and migration 0033 must be
untracked. Inspect every tracked diff. `git diff` is blind to the untracked
migration, so inspect that file independently as well.

## Final-custody sequence

Perform this sequence in order and record command, exit status, and salient
counts in the verdict/report.

1. Prove no competing heavy mission seat or test process is active.
2. Refresh the ticket comments and confirm the latest routing instruction still
   delegates this takeover, status is `running`, and there is no newer V change.
3. Verify expected HEAD, final-review-packet hash, Hermes-transcript hash, exact
   candidate status shape, and all eight candidate hashes.
4. Inspect the exact eight-path candidate, including the untracked migration.
   Confirm the two final GREENLIGHTs actually cover this exact byte set and that
   neither reports a blocker.
5. Run `pnpm test` from the repository root. This is the final full-suite gate;
   capture file/test counts and wall time. Any failure stops custody.
6. Run, separately, `pnpm typecheck`, `pnpm lint`, and `git diff --check`.
7. Recompute all eight hashes. They must exactly equal the table above.
8. Write:
   - `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-claude-final-custody-verdict.md`
   - `docs/missions/2026-08-17-accounts-privacy-security/agent-reports/claude-opus-S3d-final-custody.md`

   The verdict must be either `CLAUDE CUSTODY GREENLIGHT` or
   `CLAUDE CUSTODY CHANGES REQUESTED`, name all gates and hashes, carry the
   accepted V rulings (1A, 2A, 3A-prime, 4A), and state the residuals honestly.
9. Only on GREENLIGHT, stage these literal paths in one exact command:

   ```text
   git add -- apps/api/src/registration.ts packages/register/src/auth-policy.ts tests/integration/registration-database.test.ts tests/unit/registration.test.ts apps/api/src/mail-channel.ts packages/db/src/identity.ts migrations/0033_verification_token_credentials.sql tests/integration/identity-database.test.ts
   ```

10. Inspect `git diff --cached --name-only` and fail closed unless it contains
    exactly those eight paths and nothing else. Inspect the staged diff and run
    `git diff --cached --check`.
11. Commit locally with message:

    `feat(auth): harden verification mail flow`

    Do not push. Capture the commit SHA. Verify the commit's name-only path set is
    exactly the eight-path set above.
12. Post one durable ticket receipt with author `Claude-Opus` and marker
    `CLAUDE OPUS FINAL CUSTODY DONE`, containing the commit SHA, final-suite
    counts, typecheck/lint/diff results, post-gate hash result, reviewer evidence
    paths, verdict/report paths, no-push statement, and the accepted residuals.
13. Complete `t_cc197ed2` with `hermes kanban --board accounts-phase1 complete`,
    supplying a concise `--result`, `--summary`, and JSON `--metadata` containing
    the commit SHA, eight changed paths, and gate counts.
14. Read the ticket back and prove status `done`. Return with the exact marker:

    `CLAUDE OPUS FINAL CUSTODY DONE`

If any step fails, do not perform later mutation steps. Post the exact failure
and return:

`CLAUDE CUSTODY CHANGES REQUESTED`

## Accepted product rulings to carry

- **1A:** platform-dependent successor timing residual is accepted; revalidate
  on deployment/storage change.
- **2A:** 100/100 committed registrations is the Phase-1 internal healthy-mail
  reference-burst regression target, not a public SLA. Practical capacity may
  stop around 103 for now; margin and Argon2/threading work are deferred.
- **3A-prime:** retain 45 ms with N*=2; disclosure is noisy rather than a false
  deterministic boundary; recalibrate on target-host/storage-class change or
  the first unchanged-code 45 ms RED.
- **4A:** unauthenticated resend does not revoke previously mailed links; they
  expire at 24 h or are consumed on activation; authenticated recovery is out
  of Phase 1.

