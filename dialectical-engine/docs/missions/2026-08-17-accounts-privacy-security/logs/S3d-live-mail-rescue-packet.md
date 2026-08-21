# S3d live-mail regression rescue review

You are a fresh, independent Claude Opus rescue reviewer for ticket
`t_cc197ed2` on board `accounts-phase1`.

This is a read-only diagnosis seat. Do not edit product or test files, do not
run the long real-PostgreSQL suites, do not mutate sources, and do not commit,
push, or change Kanban state. The original Codex session
`01a019e7-e36f-7131-b509-5dcb8d52b8b6` retains edit ownership under the
same-session law.

## Current blocker

The S3d rework-3 focused proofs are green, but the definitive full suite made
the frozen S3b test
`S3b keeps live-mail N=1/N=4/N=8 PostgreSQL arms below the separation ceiling`
RED. The frozen ceiling is AUC `0.80` and must not be weakened.

Observed full-run values:

- N=1: AUC 0.750, classifier 0.688, median gap 0.8 ms.
- N=4: AUC 0.84375, classifier 0.875, median gap 86.8 ms.
- N=8: AUC 0.931, classifier 0.938, median gap 209.2 ms.
- Existing N=8 responses clustered around 1.63-1.66 s, while missing responses
  spread roughly 1.64-2.07 s in a cadence-shaped staircase.

The authorized rework-3 candidate added a bounded/cancellable 32-wide
registration hash scheduler and an arm-neutral mail-dispatch activation
cadence. Key current candidate paths are:

- `apps/api/src/registration.ts` SHA-256
  `67224736c88712abf0c1db21f9df042fd30eb9b5c6031811691b49e313731302`
- `packages/register/src/auth-policy.ts` SHA-256
  `19f72bf903aed77aed477f10b6778e81ff7324cec07b9a276694dd387f365f97`
- `tests/integration/registration-database.test.ts` current proof; inspect the
  frozen S3b test near line 2774 and the rework-3 B1/B3 proof near line 1100.

The new deep-queue proof requires real 5000 ms transport, queue depth at least
32, maximum non-transport work <=600 ms, exact-size same-arm q99 nulls, and a
two-step interleaved B3 next-window check. Do not propose weakening any of
those gates.

## Required review

Read the relevant product/policy/test code and report:

1. The most likely causal mechanism for the N=4/N=8 staircase, with exact
   file/line references.
2. Whether the regression is caused by activation cadence, accepted-request
   prehash scheduling, interaction with `drainMailDispatches`, or another
   mechanism.
3. The smallest product-side correction inside the authorized
   `registration.ts`/`auth-policy.ts` scope that can preserve both the frozen
   S3b ceiling and every rework-3 gate.
4. A focused verification order that avoids another full-suite run until the
   frozen S3b test and rework-3 B1/B3 are both green.
5. Any reason the proposed correction would worsen 100/128/160 availability.

Write the verdict to
`docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-live-mail-rescue-opus.md`.
The first non-empty line must be `GREENLIGHT` if you have a concrete compatible
fix recommendation, otherwise `BLOCK`. Include evidence and a precise patch
shape, but do not apply it. End stdout with the same verdict word.
