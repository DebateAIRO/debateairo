# S3d REWORK 2 — r2 re-review packet (real-timeout oracle, derived gate, availability row)

Ticket `t_cc197ed2`, board `accounts-phase1`. HEAD `b2324d6`; working tree is
intentionally uncommitted. This is one of two blind lenses in the S3d r2
diamond. **Refute; do not rubber-stamp.** Read-only product review except for
temporary, one-at-a-time mutation tests that are restored byte-identically.
Run the live tests. Do not commit, push, move the board, or read the sibling
verdict.

Write exactly one verdict:

- Grok lens: `reviews/S3d-r2-grok-verdict.md`
- resumed Opus finder lens: `reviews/S3d-r2-opus-verdict.md`

Use `GREENLIGHT` or `BLOCK`, with numbered findings, file:line evidence,
commands, and measured numbers. If blocking, state the exact proof that lifts
the block. The Opus lens is the original P8 finder and must resume its existing
review session, not start a substitute lens.

## Mandatory single-heavy and gold-hash protocol

The two heavy reviews are serialized. Do not start if another heavy test or
mutation campaign is active. Each lens remains blind to the other's verdict.

1. Before review, establish the true change set with `stat`/mtimes and record a
   SHA-256 gold baseline for every file you could mutate. **Do not use `git diff`
   as the change-set oracle**; migration `0033` is untracked and git is blind to
   it.
2. Cross-check the handoff baseline below. If any hash differs before your own
   work, stop and report `REVIEW BLOCKED — FOREIGN DIVERGENCE`; do not normalize
   or overwrite it.
3. Apply at most one mutation at a time. Restore it immediately, then verify its
   hash against gold before continuing. A mutation result without a verified
   restore is inadmissible.
4. If foreign divergence appears during review, discard dependent measurements,
   re-establish verified gold, and rerun them. State exactly what happened.
5. End with all reviewed source/test files byte-identical to gold and include
   the final hash check in the verdict.

Handoff hashes at 2026-08-20 14:56 EEST:

| file | SHA-256 |
|---|---|
| `apps/api/src/registration.ts` | `bf40c92d95881d7011eb0720e812711fdafe38c8eeb9b6733947c34e50c31b8a` |
| `apps/api/src/mail-channel.ts` | `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8` |
| `packages/db/src/identity.ts` | `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b` |
| `packages/register/src/auth-policy.ts` | `268172de02cbf249c904155c905144e7e935d77876251f5854cb0d798748555f` |
| `migrations/0033_verification_token_credentials.sql` | `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f` |
| `tests/integration/registration-database.test.ts` | `ed544b11c74fb6d677a9b1563d59e71ea25aba38893fa6ba3d317d7a8b23cddc` |
| `tests/integration/identity-database.test.ts` | `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432f` |
| `tests/unit/registration.test.ts` | `2d440752685f85d62f00eb2c709d24d78ec1a423bf15c3391c4b68fae222f7fa` |

The worker reports rework-2 mtimes only in `registration.ts`, `auth-policy.ts`,
the registration integration/unit tests, and `logs/S3d-progress.log`. Verify
that claim independently. The frozen hashes above for mail-channel, identity,
migration 0033, and identity integration must remain exact.

## Scope: D1 rework 2 only

The r1 lenses already confirmed the heap positive control, truthful queued-frame
retention and cleanup, wave-size-independent RSS isolation, FIFO/no-barging,
arm-neutral 18-second expiry, D2/D3/D4, the S3c creation-transaction cooldown,
the additive identity ledger, and the honest CRLF correction. Confirm frozen
gold and narrowly rerun guards needed to detect collateral damage; do not
re-litigate or redesign them.

Out of scope and frozen: S3a/S3b/S3c product behavior, T9 `t_6ff49601`, T4,
VR-3, crypto, mail-channel implementation, identity schema/implementation beyond
the already accepted additive ledger, and all unrelated mission/user changes.
If a lift appears to require widening into frozen scope, return `BLOCK` with the
smallest exact reason. Do not widen.

Read in full before testing:

- `logs/S3d-rework2-packet.md`
- `reviews/S3d-r1-grok-verdict.md`
- `reviews/S3d-r1-opus-verdict.md`
- `logs/S3d-progress.log`, especially the rework-2 RED, FINAL GATES, and HANDOFF
- the current ticket's final `REWORK READY FOR PEER REVIEW` comment

## Claim under attack

The worker rejected the dispatch-anchored experiment after it separated under
load and chose a fixed reservation deadline of **5,600 ms from activation**,
derived exactly as the ruled 600 ms enumeration clamp plus the real 5,000 ms
transport timeout. Delivery-result audit work now occurs after reservation
handoff. The claimed security result is arm-neutral next admission for register
and resend at the real timeout, not merely equal HTTP status.

The worker reports three production-policy repetitions (clean, sustained-load,
and definitive), direct grant-to-grant intervals, 32/32 target-control transport
attempts inside every scored arm/route window, cross-arm AUC 0.5117–0.6250, and
best-threshold accuracy 0.5938–0.6875. Each is below an empirical q99 obtained
from 512 deterministic same-arm relabelings; the reported tolerance is q99 minus
the null median, with no hand-picked additive constant.

These are claims to falsify, not accepted evidence.

## Primary 1 — independently reproduce the real-timeout oracle test

Build or reuse **your own sensitive black-box grant-to-grant instrument**. The
resumed Opus finder must use and, if needed, strengthen the instrument that found
r1 B1. At production policy, for both **register** and **resend**:

1. Set `channel.transportTimeoutMs` to the actual ruled **5,000 ms**. A shorter
   convenient delay is disqualifying.
2. Measure the next caller's grant as a function of the previous caller's
   existing/missing address arm at the saturation boundary. Do not dilute the
   signal with whole-request clamp/hash/provisioning latency.
3. Report per-arm sample size, raw/summary intervals, medians, cross-arm AUC,
   best-single-threshold accuracy, same-arm null distribution, q99 ceiling, and
   the derived spread/tolerance.
4. Repeat clean and under controlled sustained CPU load. Explain any materially
   different result; a gate that changes verdict with ambient load is a `BLOCK`.
5. Count transport attempts **inside each scored target-marker interval**. Show
   exactly which sends belong to the scored window. Post-window compensation or
   padding is a `BLOCK`, even if round totals match.
6. Inspect whether moving delivery audit after handoff preserves durable operator
   truth and cannot race, disappear, or contaminate the next grant. Do not reopen
   D4 semantics unless this new ordering actually breaks them.

If either route separates beyond its independently derived ceiling, or the
instrument cannot distinguish a deliberately broken state, return `BLOCK`.

## Primary 2 — VR-10: prove the replacement assertion can fail

At minimum, temporarily reintroduce the real r1 failure mechanism while keeping
the **actual 5,000 ms** transport harness. A 5,100 ms activation deadline (or an
equivalent faithful r1 asymmetry) must make the same register and resend security
assertions RED, not merely change a log line. Preserve and report in-window send
counts during the mutant.

Also attack the derived gate itself. Identify at least one wrong state that could
make it pass for the wrong reason—examples include biased relabeling, correlated
samples, a null distribution that includes the target labels, too-small sample
instability, timer quantization, or load-induced common-mode noise. Demonstrate
that the chosen construction does not admit that state. Mutation findings must
be restored and hash-verified.

## Primary 3 — availability evidence for V, not a reviewer policy choice

On a healthy **5 ms MTA with no attacker**, independently measure bursts 100,
128, and 160: success vs `AUTH_MAIL_BUSY`/503, accepted p50/p99 latency, maximum
queue wait/deadline margin, and effective repeatable burst tolerance. Run enough
repetitions to show the observed 121–126 variation is or is not stable.

Re-run the frozen S3b 100-concurrent durability guard and report successes and
durably committed-at-response count. A regression below the accepted 100/100 is
a code `BLOCK`. If it remains 100/100 but the production-equivalent request-count
margin is zero, record that fact as `V DECISION REQUIRED — availability trade`,
not as your own policy ruling. Report whether accepted p99 still approaches
30.9 seconds above burst 100.

## Secondary fold-ins

- Capacity aggregation: drive the counted refusal path and verify exactly one
  bounded measured aggregate with the exact expected count (the handoff says
  8,512) and no contamination from unrelated services. Mutate the count to a
  constant and require RED.
- RSS: confirm the 8,000-refusal/512-source isolation exercises D1 rather than
  excluding it, avoids exhausting S3c's source budget, and reaches a real
  post-GC plateau. Re-derive the fixed 0.500 MiB ceiling; do not accept a ceiling
  scaled from the measured wave.
- Deadline channel: independently compare existing/missing arms at the 18-second
  queue deadline. Report AUC, threshold accuracy, derived null ceiling, and the
  actual maximum reservation time. A one-arm characterization is insufficient.
- Verify fixed reservation arithmetic is derived from the ruled clamp and
  transport policy, not duplicated magic that can drift. Change the ruled input
  in a controlled mutation and ensure the derived deadline follows or the guard
  fails.
- Confirm the chosen fix did not silently restore dispatch anchoring, equal-work
  pretense, unbounded queue state, or post-window send padding.

## Gates and return

Run the focused live PostgreSQL proofs, then reproduce the full handoff gates:
`pnpm test` (expected 110 files / 816 tests), `pnpm typecheck`, and `pnpm lint`
(expected 28 architecture edges, 0 violations, 0 blockers). A review that did
not exercise the live world cannot greenlight.

Before the verdict, append a concise 10–20 line `SELF-REPORT` to the verdict:
lens/model, resumed/fresh session identifier, start/end times, commands run,
test totals, mutations and restores, hash result, token/usage data available from
the CLI, and whether any user/foreign change was observed.

Return only after the verdict file exists, the tree is gold, and stdout clearly
says `GREENLIGHT` or `BLOCK`. No commit, no push, no board-state mutation.
