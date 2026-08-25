# T1 rework 5 — M8 evidence-classification correction

## Role and scope

You are a visible Claude Opus evidence-correction continuation. Read this packet fully. The product/test candidate is frozen and must remain completely read-only.

Work in `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`.

You may write only:

- `/tmp/t1r5/m8-classification/**`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework5-evidence-correction-progress.log`

Do not modify any source, test, packet, result/session, or other repository file. Do not stage, commit, complete the ticket, or push. Do not run the repository-wide suite. No Grok/Hermes/Fable/other agent.

## Frozen custody

- HEAD `9801f85d97e4263a7c8311304e29d6a03c4a6d15`
- index empty
- product `apps/api/src/registration.ts` SHA-256 `0b75f99df102d9a7915a22f1d5b28e278352dfcb2936ac5bffe7b3f3afc01fd7`, 53648 B
- test `tests/architecture/t1-argon2-worker-contract.test.ts` SHA-256 `3548b93282011be73310efe8a2eec31638133dc69a1d92a0cf4ffbc36f253ca1`, 86450 B
- all other ten T1 paths remain at the manifest in `T1-claude-rework5-packet.md`

The rework5 author seat has exited. Its progress report correctly states that M8 guard-only removal is production-equivalent under the shipped call graph, but `/tmp/t1r5/vr10/receipt.log` still counts M8 as a non-equivalent kill because the defense-in-depth private-seam test directly invokes `finalizeRefusalWindow`. This makes the aggregate count internally inconsistent. Correct evidence, not product code.

## Required raw supplement

Create a fail-closed raw runner and receipt under `/tmp/t1r5/m8-classification/` that tests exactly three frozen-source mutations, restoring source bytes and mtime after every case and proving final hash equality:

1. **Guard-only removal (M8): production-equivalent, defense seam observable.**
   - Remove only `if (coordinator?.active?.windowStartedAt !== windowStartedAt) return;`.
   - Run only the realistic real-timer test `records the successor window after a predecessor deadline is left to fire for real`; require exit 0.
   - Separately run only the direct private-seam test `finalizes nothing and disarms nothing when a superseded window arrives late`; require exit 1 with that exact test and no unexpected failures.
   - Classify `DOCUMENTED-PRODUCTION-EQUIVALENT / DEFENSE-IN-DEPTH-SEAM-OBSERVABLE`, with the static proof: shipped rollover cancels the predecessor timer before successor installation; a callback that has begun cannot interleave inside synchronous finalization.

2. **Cancellation-only removal (M10a): production-equivalent.**
   - Remove only the predecessor `clearTimeout(coordinator.active.timer)` in `scheduleRefusalAuditFlush`.
   - Run the realistic real-timer test; require exit 0.
   - Classify `DOCUMENTED-PRODUCTION-EQUIVALENT`, with proof that the exact-active guard makes the late callback a total no-op.

3. **Combined removal (M10): non-equivalent.**
   - Remove both the guard and predecessor cancellation.
   - Run the realistic real-timer test; require exit 1 by named `AUDIT_SUCCESSOR` and no generic timeout.
   - Classify `NON-EQUIVALENT / KILLED`.

The runner must exit 0 only if all substitution counts, exact commands, expected exits/failure names, named assertion, per-case restoration, final product hash, test hash, HEAD, and empty index are correct. Record UTC/epoch times and source/test SHA-256 + sizes PRE/POST.

The corrected summary must state exactly:

- non-equivalent cases in this supplement: 1, killed: 1, survivors: 0;
- documented production-equivalent cases: 2;
- M8's direct-seam RED is branch/defense coverage, not a production stale-timer trace;
- this supplement supersedes only the M8/M10/M10a classification/counting in the original campaign; all other original mutation results remain unchanged.

## Handoff

Append a concise durable report with raw paths and final custody. End `EVIDENCE CORRECTION READY FOR PEER REVIEW` only if the repository candidate/test bytes were never changed at rest, every temporary mutation was restored exactly, and the supplement exits 0. Otherwise end `CODEX BLOCKED (worker-blocked)`.

