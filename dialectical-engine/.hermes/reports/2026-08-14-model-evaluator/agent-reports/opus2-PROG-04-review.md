# opus2 — PROG-04 peer review self-report

Date: 2026-08-15
Seat: opus2 (second independent reviewer for `codex/eval-04-tagger`, substituting the Grok seat per V's outage ruling)
Subject: `codex/eval-04-tagger` @ `c15690f`, worktree `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-04-tagger`
Review written to: `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-04-opus2-review-1.md`

## Verdict

**REVIEW VERDICT: PASS** — with one mandatory carry-forward (F-1) that must close before the tagger acquires a production call site, plus four non-blocking notes (F-2…F-5).

## Independence

Judgment formed from the diff, the binding docs (Architecture §4/§5/§7/§8, Requirements §2 + FR-0.x, goal packet PROG-04, ticket 04) and my own execution. No `PROG-04-*-review-*.md` file was opened; no other reviewer's output or implementer self-report was read.

## What I executed

- `pnpm typecheck` — exit 0.
- `pnpm lint` (architecture + source audits) — 27 edge rows checked, no violations; no blocking orphans.
- `pnpm vitest run tests/unit/evaluator-tagger.test.ts tests/integration/evaluator-database.test.ts` — 18/18 pass (FR-0.6 AC5 differential included).
- `pnpm vitest run` — full repository suite, 86 files / 636 tests pass.
- My own scratch suite on a seeded embedded-PostgreSQL schema (17 cases): the 26-domain classifier matrix (existing-id select, genuinely-new growth with provenance, case-variant forced onto the existing id, near-duplicate refusal, model refusal), 6 adversarial/prompt-injection families, container-down / timeout / isolation degradation, a real `PostgresAskApplication.submit` serving-not-gated differential, a memory-no-op full-row snapshot, retry/idempotence, and a growth-bound check.
- A separate liveness perturbation probe that reproduced finding F-1.

Both scratch test files were deleted after use; the worktree ended with an empty `git status --porcelain`. No commits, no pushes, no board mutations, no writes outside my two output files.

## Key conclusions

- Deliverable matches the Architecture §7 tier-2 row and §5.1 flow; the model's authority is confined to a strict three-branch JSON decision, deterministic code owns every registry write.
- All three mandatory carry-forwards are closed with tests: blank-proposal typed `REFUSED` receipt (migration 0025 scopes the CHECK relaxation to REFUSED only), `admitExistingDomainSelection` + `recordRefusal`, and the isolation re-assert before the observed provider boundary.
- Non-gating discipline holds structurally (no production caller anywhere outside tests) and behaviourally (`core.run` and `memory.question_key` byte-identical across a failed tag; admission and serve untouched).
- Prompt-injection-shaped inputs cannot spam the registry: ≤1 proposal per run, deterministic name guardrails, 0.8 near-duplicate threshold, UNIQUE `question_domain.run_id`, pinned-maker check, artifact-identity check; hallucinated ids and malformed content write nothing at all.
- Memory no-op, no `BOUND`, DR-179 clean, FR-0.6 AC5 differential green.

## Carry-forward raised (F-1)

Tag artifacts are written with the **product** `run_id` and the evaluator `provider_ref`. `LivenessRepository.detectProviderModelVersionTriggers`, run unconditionally by the production liveness sweep, partitions all artifacts by `(run_id, provider_ref)` and fires a `PROVIDER_MODEL_VERSION` revision trigger when `model_version` changes within a partition. Ask-time tag plus later reconciliation across a local-container upgrade satisfies that condition; I reproduced a FIRED trigger against a product run's NODE subject on a scratch database. A FIRED trigger feeds `has_open_trigger` in `sweep()` and thus the retirement decision — configuration-shaped influence of the class Architecture §4.2 / FR-0.6 AC5 exist to close, uncovered by any test. Latent today because nothing invokes the tagger in production, which is why it is a carry-forward and not a merge blocker; it must close before the wiring lane gives the tagger a call site and before any bind-readiness claim.

---

# Round 2 — rework `670ac9a` ("fix(evaluator): isolate tag attempts from product runs")

Date: 2026-08-15
Review written to: `docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-04-opus2-review-2.md`

## Verdict

**REVIEW VERDICT: PASS.** My round-1 carry-forward F-1 is closed by construction and verified; F-2, F-4 and F-5 are closed; the round-1 PASS surface is intact. F-3 is unchanged and remains a non-blocking recommendation for the composition root before bind. Five new non-blocking observations recorded in the review.

## What I executed

- `pnpm typecheck` — exit 0. `pnpm lint` — 27 edge rows, no violations, no blocking orphans.
- `pnpm run generate:contract` — no tree diff, so the shared role/lane widening does not reach the generated contract.
- `pnpm vitest run` — 85 files / 628 tests pass (+9 over my r1 baseline, matching the 9 new lane tests).
- My own round-2 scratch suite, 13 cases, driven through the **real** production gateway (`createPostgresProviderGateway` with real ledger persistence, only `fetch` stubbed): F-1 closure, a negative control, budget isolation, the full classifier matrix, grown-row provenance, eight adversarial/injection outputs, foreign-maker refusal, artifact-laundering refusal, memory no-op, non-gating degradation, and F-2/F-4/F-5 spot checks. All 13 passed. Scratch file deleted; worktree `git status` empty.

## F-1 closure evidence

`provider.call` now passes `runId: null` with an evaluator-scoped `subjectItemId`, and `assertAdmissionArtifact` expects a null `run_id` for evaluator-ref artifacts. Since `detectProviderModelVersionTriggers` filters `run_id IS NOT NULL`, evaluator artifacts leave the scan's universe. Driving the real gateway through ask-time refusal on `local/evaluator@1` then reconciliation on `local/evaluator@2`, I observed both `raw_artifact` and `ledger_entry` rows with `run_id = NULL`, `detectProviderModelVersionTriggers()` returning 0, and no `revision_trigger` row for the product run — while the identical artifacts carrying a `run_id` still fire one trigger (negative control). The lane added its own in-tree regression test for the same scenario.

Two further influence paths closed as a side effect, both of which I verified: the tag call no longer consumes the product run's model-attempt budget (`createPostgresProviderGateway` skips the budget assertion when `runId` is null — zero `MODEL_CALL` entries against a tagged run), and the lane's new test keeps the asker-visible execution digest byte-identical with tagging off versus on.

No migration changed in the rework range; no `BOUND`; DR-179 clean.
