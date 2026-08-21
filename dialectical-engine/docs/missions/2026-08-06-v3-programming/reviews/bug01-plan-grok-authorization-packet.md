# Grok authorization packet — BUG-01 architecture plan (DR-171)

You are the AUTHORIZING LENS under DR-171: an Opus architect has produced a
plan; nothing binds until YOU authorize it. Your job is adversarial: try to
refute the plan's claims against the actual tree. You are READ-ONLY — you
mutate NOTHING; you write exactly ONE file, your verdict (path below).
Do not restart, kill, or bind over any process (a live stack is standing:
PG 55432, API 8790, UI 3000).

Repo root: /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3

## The incident (ledger-proven)
Run 50802f65 (2026-08-13) terminal-failed ACCEPTANCE_EXECUTION_FAILED:
JUDGE_SCHEMA_FAILURE and tore the standing stack down. Failing call:
JUDGE:critic:root0:r1:p0, claude-opus-5, HTTP 200, attempt 1, parse_error
unrecognized_keys ["notes_absent"] at path ["evidence"]. The run's DR-159
envelope (max_model_attempts 42 at depth 1, ceilings budgeting failed
attempts) was barely consumed: no retry exists on the schema-failure path
(packages/judgement/src/index.ts:134-136 throws immediately).

## The plan to authorize
docs/missions/2026-08-06-v3-programming/reviews/bug01-architecture-plan.md

## Verify — by reading the actual sources, not by trusting the plan
1. The decisive citation: docs/architecture/03-module-design.md §7.1
   ("Every attempt, including schema-failure retries, is a ledger row").
   Does it say what the plan claims, in context?
2. The chosen seam: packages/providers/src/index.ts:156-263 — is the
   attempt loop + classifyContent really there, and is a caller-declared
   retry predicate genuinely additive (absent predicate ⇒ byte-identical
   behaviour)?
3. N-genericity (DR-162-A): the plan claims six call sites / eight
   call-site families share the defect, including the composer path
   (apps/runner/src/index.ts:199-205). Spot-check at least three.
4. No new numbers (AC-76/DR-039): CallBound.maxAttempts register-sourced
   (acceptanceOrganCostBounds, seeded 3) and DR-159 clause 3 ("3 attempts
   per call site") — confirm in acceptance/seed-register.ts and the
   decisions ledger; confirm the plan invents no literal.
5. Envelope accounting: are the four counters the plan names
   (countRunModelAttempts, assertModelAttemptAllowed, countModelAttempts,
   findExhaustedModelAttempt) truly outcome-blind so failed attempts are
   charged with zero new code?
6. Typed loudness preserved (DR-115): after exhaustion the run still fails
   with JUDGE_SCHEMA_FAILURE carrying the LAST parse_error; the repair turn
   interpolates only the machine parse error, never a suggested value;
   contract_hash stays constant. Check the plan's design for holes that
   could fabricate or silently accept malformed judgements.
7. Strictness recommendation (.strict() + bounded repair retry; tolerate-
   and-strip rejected; schema widening left to V): is the reasoning sound
   and is every value question flagged as a V row rather than decided?
8. The plan's two bonus findings: ledger outcome='OK' while the artifact
   says SCHEMA_FAILED (records disagree; battery/terminal.ts counts them as
   executed checks), and composer artifacts recording PARSED on organ-
   contract violations. Confirm both are real defects and in the same seam.

## Verdict
Write EXACTLY ONE file:
docs/missions/2026-08-06-v3-programming/reviews/bug01-plan-grok-verdict.md
containing: what you checked with file:line evidence, any refuted or
unverifiable claims, findings the coder ticket must carry, and a final line
either "AUTHORIZATION: GRANTED" (optionally with binding conditions) or
"AUTHORIZATION: REFUSED" with the exact reasons.

Return rule: finish by writing the verdict; if genuinely blocked, write the
verdict file with what you could and could not verify and say so honestly.
