# S3d final-gate rescue — independent Claude Opus diagnosis

Ticket `t_cc197ed2`, board `accounts-phase1`. This is a read-only rescue seat,
not a peer-review verdict and not an implementation seat. Do not edit any file,
run a mutation, commit, push, or mutate Kanban. Inspect the current code and
existing logs/tests, trace both failures below to mechanism, and write the
result to:

`docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-final-gate-rescue-opus.md`

The owning Codex session may continue while you read. Hash every inspected
candidate file at the start and end and state any drift. Mechanism-level advice
is still useful if the snapshot moves, but do not present a stale snapshot as a
verdict on later code.

## Read first

- `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-rework3-packet.md`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-progress.log`
- `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-r2-opus-verdict.md`
- `docs/missions/2026-08-17-accounts-privacy-security/reviews/S3d-live-mail-rescue-opus.md`
- current `apps/api/src/registration.ts`
- current `packages/register/src/auth-policy.ts`
- the D1, rework-2 B1, rework-3 B1/B3, deadline, availability, and RSS tests in
  `tests/integration/registration-database.test.ts`

## Current snapshot at packet creation

- `registration.ts` `815e1bb309ca74c0dc56b370befcc69044530dff987414e80823678e82372524`
- `auth-policy.ts` `83c83c19364df95c1004910c835f322c04052d22d2786fc2f83a9448a4501deb`
- registration integration test `bf420a934863ff91fd1c691b2228560886dbf4123ad5d2dff211dc0ab271113f`
- registration unit test `eab6cd811886ea4c22b51725c43675bf2fea84306be9864757f0fcf0aa34d045`

Frozen exact gold still matches:

- mail channel `2a0fe03910bdbb4629138722b136164d5f1a156181bd0d7b90e460e8dc0131c8`
- identity implementation `c57266d3bb8314ca63d5635db88057ec0d5aa20dc319546c49735725572e9c5b`
- migration 0033 `34fadf7cd618c165d82d71536001628f7dff9165648c10c03f51beb6c4d94e2f`
- identity integration test `05ebf0c907ceb6efe532c7eef367dcc731d4ee33138c53e495153a44590e9432`

## Exact failures to diagnose

### A. Real shallow registration channel remains

The worker isolated compensating control traffic on a separate mail sender and
reran the old rework-2 B1 harness at real PostgreSQL / production policy / real
5,000 ms transport. It is still decisively RED:

- register existing median 5,256.0 ms;
- register missing median 5,385.8 ms;
- AUC 1.0000 > q99 0.7539;
- accuracy 1.0000 > q99 0.7500;
- honest combined in-window sends 32/32;
- resend is green at medians 5,701.8/5,701.8, AUC 0.5039.

The current rework-3 depth-32 proof is green, as is the two-step next-window
probe. Trace one register target -> marker chain in the old harness and explain
the ~129.8 ms arm-dependent interval. Determine whether it is a genuine second
operating point, why rework-3 B1/B3 miss it, and the smallest correction inside
the authorized registration/auth-policy/integration/unit scope. Do not propose
retiring or weakening a still-real gate.

### B. D1 memory proof remains RED

The D1 mini-wave originally used an ambient null factor. The worker replaced it
with the same fixed `12 * 64 KiB = 0.750 MiB` ceiling used by the required
8,000-refusal plateau. The exact focused rerun observed 1.0 MiB sustained growth
and failed. The 8,000-refusal plateau remains green at 0.141 MiB spread with one
aggregate totaling exactly 8,512.

Determine whether D1's 1.0 MiB is a product retention issue, heap/RSS phase
effect, or a mismatched mini-wave statistic. Give a non-vacuous correction or a
derived proof design. Do not recommend an arbitrary larger constant, an ambient
null multiplier, or weakening the fixed plateau/count proof. Explain whether
the named 12-quanta factor itself is justified by a threat/proof quantity.

## Additional scrutiny

The candidate uses route-specific policy: registration 45 ms cadence / 5,100
ms reservation after durable provisioning, resend 60 ms / 5,700 ms. Frozen S3b
N=1/4/8 is green at AUC 0.500/0.570/0.627 and gaps 0.0/10.7/57.0 ms. Deep B1/B3,
deadline, and RSS/count are green. Availability is 100/100 with zero request
margin, about 103/128 and 103-104/160, accepted p99 about 30.5 s at 100 and
35.2 s above it. Treat 45 ms as empirically tuned and call out any missing
derivation or repeatability requirement.

## Required report

Lead with `DIAGNOSIS`, `BLOCK`, or `NO IN-SCOPE FIX`. For each failure provide:

1. the causal chain with file/function/line references;
2. whether it is product or evidence;
3. the smallest authorized fix shape;
4. the focused verification order that avoids another premature full suite;
5. snapshot hashes at start/end and any drift.

No commit. No push. No board mutation.
