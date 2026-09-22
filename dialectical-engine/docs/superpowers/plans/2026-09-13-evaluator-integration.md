# Evaluator Integration Implementation Plan

> **For agentic workers:** Use the Superpowers development and verification workflows. Steps use checkboxes for tracking.

**Goal:** Automatically turn terminal debate metrics into useful, honest model rankings visible in settings.

**Architecture:** Reuse the evaluator harvest and profile repositories in a separate numeric worker. Publish a completed-snapshot receipt and expose only that snapshot through a session-authenticated aggregate endpoint.

**Tech Stack:** TypeScript, PostgreSQL, Fastify, React, Vitest, existing pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-13-evaluator-integration-design.md`

## Global constraints

- Preserve unrelated working-tree edits and explicit version-1 profile replay.
- Keep numerical evaluation provider-free; use the evaluator database role.
- Keep dispatch unbound and private run/content identifiers out of the rankings API.
- Null domain means unclassified, not an invented global aggregate.

## 1. Numeric refresh worker

- [ ] Add a failing database test that inserts a terminal run and recorded judgement, invokes `runEvaluatorRefreshCycle({pool, strategy, asOf})`, and verifies observations, profiles and a completed receipt; repeat and expect `CURRENT` with no extra cells.
- [ ] Add `includeReviewReasons: false` harvest mode; retain the run content lease but omit key preparation and review text reads.
- [ ] Add migration `0062_evaluator_profile_refresh.sql`: append-only receipt and evaluator-worker execution grant for `core.run_private_content_is_live(uuid)`.
- [ ] Implement a bounded cycle using a session advisory lock, existing reconciliation, `PostgresEvaluatorProfileRepository.deriveAndPersist`, and a receipt appended after success.
- [ ] Add standalone CLI with `--once`, validated connection/configuration, readiness IPC, retrying non-overlapping polling, and signal-driven drain.
- [ ] Test with `pnpm exec vitest run tests/integration/evaluator-refresh-database.test.ts` against temporary PostgreSQL.

## 2. Honest version-2 scores

- [ ] Write tests showing raw high tau, automatic agreement, and event truth do not confer higher capability ranks.
- [ ] Preserve explicit v1 semantics; use v2 diagnostics for propensity and independent evidence for quality.
- [ ] Verify scoring/profile persistence regression suites.

## 3. Completed rankings surface

- [ ] Add repository tests for exact snapshot joins, all model rows, and absence of stale retired metrics.
- [ ] Implement `GET /v1/evaluator/rankings` using server-session authentication and numeric aggregate DTOs.
- [ ] Render `ModelRankings` in the active account settings component with empty/loading/error states, refresh, capabilities, model versions, sample counts and intervals.
- [ ] Verify HTTP permissions, frontend transport and render tests.

## 4. Development lifecycle

- [ ] Add the evaluator database principal while supporting existing credential-file upgrade shapes.
- [ ] Enable the numeric read surface in development environment generation and validation.
- [ ] Start, supervise and drain the evaluator child alongside the runner; pass only its own DB credential and required process configuration.
- [ ] Enable the active settings rankings panel in the supervised development UI.
- [ ] Verify credential/environment and lifecycle tests.

## 5. Review and delivery

- [ ] Run combined evaluator, API/UI and lifecycle tests, comparing typecheck diagnostics with baseline.
- [ ] Independently review the final patch, resolve reportable issues and rerun affected tests.
- [ ] Update evaluator README with startup, dimensions, missing evidence and deployment limitations.
