# S4 final review — Grok 4.6 independent security lens

You are the sole independent Grok 4.6 reviewer for Accounts Phase 1 S4
`t_7c5c91a2`. You did not author or route the candidate.

Read-only review: do not edit, stage, commit, merge, push, mutate Kanban,
launch subagents, or search the web. You may run inspection/tests/builds.

## Custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-s4/dialectical-engine`
- Branch: `codex/accounts-s4`
- Base: `db54fec9cc39b2bc2c833626669f94edf664d4e1`
- Candidate: `00d8f88bfc7315e885837515937da4e1fe19f311`
- Worktree must remain clean before/after.

## Binding scope and properties

- S4 is TOTP plus recovery codes only. Passkeys/WebAuthn are Phase 2 and must
  not appear.
- TOTP is exactly SHA-1, 6 digits, 30 seconds, 160-bit secret, stock-app
  compatible, local QR plus copyable Base32, enrollment confirmed by a valid
  code before activation, bounded drift and atomic replay rejection.
- TOTP seed is encrypted under the user's DEK at rest and never logged or
  persisted plaintext. QR/secret/code UI state stays local/in memory and no
  third-party QR or telemetry sees it.
- Exactly 10 single-use recovery codes are shown once and only Argon2id hashes
  persist. Generation/regeneration/type-back/activation/consumption are atomic;
  old sets are revoked and concurrent reuse cannot win twice.
- Brute-force/capacity policy fails closed. Lockout boundaries and recovery/TOTP
  attempt accounting are correct; refused retries do not create an Argon/audit
  DoS or attacker-chosen immutable attribution.
- Enrollment authorization before S5 sessions is not hand-waved: scrutinize the
  S3 consumed verification credential reused as the enrollment bearer, its
  expiry/state/replay/theft semantics, browser/API exposure, cross-account
  binding and whether it can be used after activation.
- Migration/model/repository state is additive and aligned. Factor activation,
  last accepted TOTP step, code slots, user state, audit writes and locks are
  transactionally ordered without deadlocks or secret leakage.
- All Argon2 work obeys accepted T1 worker-pool capacity/lifecycle constraints;
  no new synchronous main-thread KDF path.
- Existing registration enumeration, rate-limit, audit-chain, shutdown and T9
  guarantees remain intact.

Adversarially review the complete 18-file diff and adjacent code. Attack:
parallel verify/recovery reuse, time-step rollback/overflow, clock drift edges,
malformed Base32/URI labels, secret/error serialization, DEK file loss, DB
rollback between factor/code/user/audit changes, regeneration after partial
activation, lockout reset, direct-route CSRF/origin assumptions, UI refresh/
back navigation, QR correctness/capacity, accessibility, and register-policy
boot/seed behavior. Inspect every test for vacuity and every mutant claim.

Author evidence claims: affected unit/architecture 66/66; real-PG S4 1/1;
inherited PG verification/races 5/5; root/UI typecheck; lint; Next build;
diff-check; three mutants killed; QR independently decoded. Re-run or validate
proportionately.

Return findings first with severity, exact file/line, mechanism, and smallest
correction. End with exactly one marker:

`GROK S4 APPROVED`

or

`GROK S4 CHANGES REQUESTED`

Do not approve merely because tests are green.
