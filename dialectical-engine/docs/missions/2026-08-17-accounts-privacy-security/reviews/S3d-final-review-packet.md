# S3d final formal review — V-ratified candidate

Ticket `t_cc197ed2`, board `accounts-phase1`. The candidate is intentionally
uncommitted. Author lineage is the original `codex@gpt-5.6-sol` xHigh session
`01a019e7-e36f-7131-b509-5dcb8d52b8b6`.

This is a serialized, blind two-lens review. Refute the candidate; do not
rubber-stamp it. Work as a reviewer, not an implementer. Do not commit, push,
change Kanban state, or make a product fix. Temporary one-at-a-time mutations
are permitted only when restored byte-identically and hash-verified before the
next check.

Write exactly one verdict for your assigned lens:

- Grok: `reviews/S3d-final-grok-verdict.md`
- fresh Claude Opus: `reviews/S3d-final-opus-verdict.md`

The first line must be `GREENLIGHT` or `BLOCK`. Include numbered findings,
file:line evidence, commands, measured results, entry/exit hashes, and a concise
self-report. Do not read, search for, or cite the sibling final verdict.

## Final V authority — policy choices are settled

V ruled on 2026-08-21:

1. Accept the named platform-dependent successor-provisioning residual. The
   deployment/storage-class change trigger remains mandatory.
2. Phase 1 keeps 100/100 committed registrations on the healthy-mail reference
   burst as an internal regression target, not a public SLA. Practical capacity
   may stop around 103 for now; larger margin and Argon2/threading changes are
   deferred.
3. Keep registration cadence 45 ms at N-star=2. The evidence disclosure must
   say 30 ms is noisy 2-of-3 RED, 60 ms is one GREEN observation, and require
   recalibration on target-host/storage-class change or the first unchanged-code
   45 ms RED.
4. Unauthenticated resend does not revoke prior mailed links. Each link expires
   after 24 hours or is consumed on activation. Authenticated recovery is out of
   Phase 1.

Do not block merely because you prefer a different policy choice. Do block for
implementation/proof defects, a false disclosure, regression below the ruled
100/100 reference target, a reproduced privacy/security failure outside the
accepted residual, or evidence that fails its own positive control.

## Required reading

Read in full before testing:

- `logs/S3d-progress.log`
- `logs/S3d-rework4-adjudication-packet.md`
- `reviews/S3d-successor-refutation-opus.md`
- `reviews/S3d-v-decision-advisor-opus.md`
- `reviews/S3d-v-cadence-addendum-opus.md`
- `logs/S3d-cadence-disclosure-recut-packet.md`
- the current ticket comments through `READY FOR PEER REVIEW — CADENCE DISCLOSURE RECUT`

Older S3d verdicts are historical defect evidence, not current verdicts. Read
them only when needed to trace a claim. Never read the sibling final verdict.

## Gold and single-heavy protocol

No other heavy test or mutation campaign may run concurrently. Establish the
true change set from file hashes and mtimes; Git is not the sole change-set
oracle because this repository contains untracked mission files. The candidate
gold is:

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

Stop with `REVIEW BLOCKED — FOREIGN DIVERGENCE` if entry gold differs. Before
and after every mutation, verify all eight hashes. End with all eight paths
exactly at gold. Do not normalize or overwrite a foreign change.

## Primary 1 — final disclosure truth and load bearing

Independently inspect the schema, frozen policy row, derivation prose, and unit
assertion. Confirm all of the following:

- 30 ms has observation/red/green counts 3/2/1, N=8 gap range 59.6–115.8 ms,
  AUC range .620–.774, and is explicitly not a deterministic lower bound;
- 60 ms is one GREEN observation at gap 12.1 ms/AUC .529 and not a stable
  boundary;
- central tendency is described as safer with rising cadence while noise is
  comparable to the effect; 45 ms is current but not uniquely load-bearing;
- the recalibration trigger is target-host/storage-class change or the first
  unchanged-code RED at 45 ms;
- 45 ms, N-star=2, 480 + 2*45 = 570 < 600, and 30 ms headroom remain unchanged;
- no stale unqualified RED/GREEN result or NON_MONOTONIC/V_ROUTER wording
  contradicts the final disclosure, and no runtime consumer depends on the
  changed disclosure shape.

Temporarily corrupt one count or the recalibration trigger. The exact S3d D1
unit assertion must go RED for the intended mismatch. Restore and hash-check.

## Primary 2 — V-ratified runtime evidence

Run live evidence; source inspection alone is insufficient.

1. Run the exact S3d D1 functional test. Confirm the dispatcher remains bounded
   at 32 active + 96 queued, commits no account it cannot notify, retains no raw
   token outside active send, and the observed accepted/committed result is at
   least the ruled 100 reference target. A practical stop near 103 is accepted.
2. Run the S3d retained-object N-independence test. Confirm the exact 97-object
   bound at N=500 and N=4000 and that its scaling positive control can fail.
3. Run the successor-labelled shallow test. Audit event capture and distinct
   existing-row setup, confirm clean behavior, and confirm the test-owned +25 ms
   create-only control is detected. Treat deployment/storage sensitivity as the
   accepted residual, not a structural guarantee.
4. Run the healthy-MTA burst measurement and frozen S3b durability assertion.
   Confirm 100/100 committed at response. Report the actual practical stop and
   queue-deadline margin; do not convert them into a public SLA.
5. Run the D2/D3/D4 focused tests needed to confirm prior mailed credentials
   survive unauthenticated resend, expire/prune at the ruled lifetime, activation
   consumes the credential family, and delivery failure remains opaquely audited.

Use these exact titles from `tests/integration/registration-database.test.ts` as
the starting set; you may combine them with one anchored regular expression:

- `S3d D1 bounds hanging verification dispatches without committing accounts it cannot notify`
- `S3d rework4 proves capacity-refusal retention is N-independent by heap shape`
- `S3d rework4 labels the shallow register handoff by the successor address arm`
- `S3d rework2 B4 measures healthy-MTA burst cost and the frozen S3b margin`
- `S3d D2 preserves the owner's first verification credential across the full resend allowance`
- `S3d D2 prunes expired hashes while preserving each mailed credential for its own lifetime`
- `S3d D3 keeps the registration link live when resend is requested immediately`
- `S3d D4 keeps cooldown after a delivery-record failure and durably audits only opaque correlation`

If a test contains its positive control internally, report both the control and
clean result. If it does not, do not edit production code to invent one; report
the evidence limitation precisely.

## Primary 3 — scope, invariants, and regressions

Confirm the final recut touched only `auth-policy.ts`, `registration.test.ts`,
and the append-only progress log relative to the pre-recut hashes. Confirm the
runtime registration implementation, integration workload, mail channel,
identity implementation/migration/test, availability target, 45 ms cadence,
N-star, token lifecycle, and audit semantics did not drift.

Inspect for security regressions around:

- enumeration/timing observability at grant and successor handoff;
- plaintext or raw verification-token retention outside active send;
- queue boundedness, cleanup, FIFO/no-barging, and deadline behavior;
- credential replay, cross-family activation, expiry/pruning, and deletion;
- raw email/IP/user-agent leakage in durable operator evidence;
- contradictions between executable policy, implementation, and tests.

## Final gates and return

At minimum run:

- `pnpm exec vitest run tests/unit/registration.test.ts`
- the focused live PostgreSQL tests above;
- `pnpm typecheck`
- `pnpm lint`
- `git diff --check`
- a scoped search for stale cadence wording and runtime consumers.

The earlier definitive full suite was GREEN at 110 files / 818 tests before the
disclosure-only recut. A new full suite is optional for this review because the
runtime and integration hashes are frozen; state whether you ran it. Any newly
observed unrelated failure must be separated from candidate-caused failure.

End with all eight hashes exact. Write the assigned verdict and print exactly
`GREENLIGHT` or `BLOCK` prominently to stdout. Do not commit, push, repair code,
launch another reviewer, or change Kanban state.
