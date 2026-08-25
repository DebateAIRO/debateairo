# S4 rework1 final review — Grok 4.6 independent security lens

You are the sole independent Grok 4.6 reviewer for Accounts Phase 1 S4
`t_7c5c91a2`. You did not author or route this candidate.

Read-only review: do not edit, stage, commit, merge, push, mutate Kanban,
launch subagents, or search the web. You may run inspection/tests/builds.

## Custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-s4/dialectical-engine`
- Branch: `codex/accounts-s4`
- Current integrated dev parent: `6c38382`
- Original S4 candidate: `00d8f88bfc7315e885837515937da4e1fe19f311`
- Rework commit: `18b6ccc6ad3576fd4f84b30df8ac072416943f08`
- Final integrated candidate: `6eedfa9890081647b3264641ee77d929580b6acc`
- Worktree must remain clean before and after.
- Review `dev...6eedfa9890081647b3264641ee77d929580b6acc` as the complete final S4 delta and
  `00d8f88bfc7315e885837515937da4e1fe19f311..6eedfa9890081647b3264641ee77d929580b6acc`
  for the requested remediation/integration changes.

## Prior findings that must be independently closed

Your first review ended `GROK S4 CHANGES REQUESTED`. Re-establish each result
from final bytes; do not trust the author summary.

1. A consumed sibling verification credential could become an MFA enrollment
   bearer. Require only the actually presented verification hash to be the
   channel-bound bearer, exact bearer equality in every MFA path, denial of a
   non-presented sibling across begin/verify/generate/activate, and capability
   clearing on activation.
2. MFA locks inverted S3's channel -> user -> credential order. Require
   explicit sequential channel -> user -> credential -> factor/code locking,
   re-read eligibility on locked rows, and a non-vacuous real-PostgreSQL
   overlapping verify/enroll barrier with a real waiter, zero `40P01`, and no
   HTTP 500.
3. Recovery generation enqueued ten shared credential-lane jobs at once.
   Require sequential or <=2 bounded hashing and non-vacuous coexistence with
   a registration password hash on the real pool contract.
4. The UI did not consume the mailed bearer or remove it from the URL. Require
   one-shot query-token extraction, `replaceState` before any verify await,
   same-origin verification, automatic enrollment continuation, and no token
   persistence or third-party disclosure.

## Complete S4 security contract

- TOTP exactly SHA-1, 6 digits, 30 seconds, 160-bit secret, stock-app
  compatible, local QR plus copyable Base32, enrollment confirmed before
  activation, bounded drift, and atomic replay rejection.
- Seed encrypted under the user's DEK at rest and never logged or persisted
  plaintext. QR/secret/code UI state remains local and in memory.
- Exactly ten single-use recovery codes shown once; only Argon2id hashes persist.
  Generation, regeneration, type-back, activation, and consumption are atomic.
- Brute-force/capacity controls fail closed without attacker-chosen immutable
  attribution or an Argon/audit denial-of-service path.
- Passkeys/WebAuthn remain excluded. Migration, model, repository, API, UI,
  policy, audit, and lock ordering stay aligned.
- T2 trusted-source normalization must cover the new auth routes; T3 graceful
  shutdown and all accepted T1 worker-pool/enumeration/T9 properties must remain
  intact on the integrated candidate.

Author evidence on final integrated bytes: S4 focused 16/16; affected T1/T2/T3
91/91; real-PostgreSQL S4/T3 4/4; registration/Argon worker 150/150; root and UI
typechecks; lint/architecture/source audits; Next production build. Re-run or
validate proportionately, especially the four prior findings and merge-conflict
resolutions in `apps/api/src/index.ts`, the registration DB test, and T2 fake.

Return findings first with severity, exact file/line, mechanism, and smallest
correction. End with exactly one marker:

`GROK S4 REWORK1 APPROVED`

or

`GROK S4 REWORK1 CHANGES REQUESTED`

Do not approve merely because tests are green.
