# S3b dual-diamond review packet — registration durability

Ticket t_3f2a4c64. Author: Codex, session 01a019e7. You are ONE of two blind lenses.
**Refute, don't rubber-stamp.** READ-ONLY on source; running tests REQUIRED. You may
stand up your own isolated Postgres. Packet: `logs/S3b-packet.md`.

## What it had to fix
Registration returned **202 with nothing persisted** — accounts existed only in an
unbounded in-process Set holding plaintext email/recovery-email/IP/UA; ~12-13 lost per
100 concurrent; failures logged with no identifier. Root cause was an orchestrator
packet offering "off the response path OR equal work"; the packet now **PROHIBITS**
closing the enumeration oracle by making registration non-durable.

Claimed: 8/8 mutants killed, 5 S3b real-Postgres tests green, full registration file
26/26, suite 792, lint 28 edges 0 violations.

## Claims to verify
1. **Durability.** A 2xx is returned ONLY after a durable commit. Verify under a ≥100
   concurrent burst that successes == committed accounts, zero lost. Prove the
   in-process Set is GONE and no plaintext email/recovery-email/IP/UA lives in any
   process-local structure.
2. **Oracle closed by EQUAL WORK, not deferral.** Verify the clamp is enforced in
   PRODUCT code against the ruled tolerance (a previous version's tolerance was read
   only by tests). Measure existing vs non-existent at N=1/4/8 against real Postgres.
   **The assertion must require genuine distribution OVERLAP** — a prior test asserted
   "gap <= 100ms", which permits a zero-error classifier. Report measured numbers.
3. **Failures are honest.** Inject a provisioning failure: caller gets a typed error
   (never a 202), an audit event with a correlation id exists, and NO account exists.
4. **Repository-boundary normalisation (structural).** Prove a writer that BYPASSES
   `sourceContext` cannot reintroduce audit evasion — hashing still runs inside the
   transaction (`identity.ts:89-92`), so this must be structural, not discipline.
5. **No regression:** S3a's request-time timestamps hold; VR-3 erasure holds
   (claimed 426 audit rows, 0 forbidden matches); S3c/S3d surfaces untouched.
6. **VR-10 — VERIFY THE MUTATION EVIDENCE YOURSELF.** Break the implementation and
   confirm each test goes RED: (a) return before commit → durability RED; (b) remove
   the clamp → timing RED; (c) bypass sourceContext in a writer → normalisation RED.
   **If any test passes against broken code, BLOCK** regardless of the fix's quality.
   This is the failure mode that let three regressions ship past two-lens review.

## Verdict
`reviews/S3b-<lens>-verdict.md`: GREENLIGHT or BLOCK + numbered findings with
file:line evidence. If BLOCK, state exactly what proof lifts it. No commit/push.
