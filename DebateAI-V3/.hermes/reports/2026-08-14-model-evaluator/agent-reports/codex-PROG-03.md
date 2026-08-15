# Codex agent report — PROG-03 domain registry

Status: READY FOR PEER REVIEW  
Worker: Codex GPT-5.6 Sol  
Branch: `codex/eval-03-domains`  
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-03-domains`  
Commit: `a3aa2d896182ef8fae895b85f9700800edafe4e2`  
Comments read through: goal packet supplied 2026-08-14; no Kanban mutation or comment channel authorized

## Delivered

- Added `DomainRegistryRepository` with append-only domain reads, audited
  admission writes, and the dedicated `evaluator.question_domain` landing.
- Added versioned deterministic guardrails: Unicode NFKC, fixed-locale case and
  whitespace folding, character/word bounds, exact matching, stable similarity
  evidence, and near-duplicate rejection at threshold `0.8`.
- Serialized admissions with registry-wide plus normalized-name advisory locks,
  including a re-read under lock; concurrent near-duplicate proposals create one
  grown domain only.
- Enforced grown-domain provenance against the actual source run/artifact and
  verified question links against a successful admission for the same run/domain.
- Authored pending migration
  `migrations/pending/0024_evaluator_domain_seed.sql`. It is visibly marked
  `PENDING V APPROVAL` and deliberately outside the top-level migration scan.
- Authored the 26-entry V proposal at
  `docs/missions/2026-08-14-model-evaluator/programming/eval-03-starter-list-proposal.md`
  in the main checkout. Each entry has a one-line rationale.

## Changed lane files

- `packages/evaluator/src/index.ts`
- `packages/evaluator/README.md`
- `migrations/pending/0024_evaluator_domain_seed.sql`
- `tests/unit/evaluator-domains.test.ts`
- `tests/integration/evaluator-database.test.ts`

No non-evaluator behavior, live dispatch binding, API key, runner migration list,
board state, or remote branch was changed.

## RED → GREEN evidence

RED:

```text
pnpm vitest run tests/unit/evaluator-domains.test.ts
Test Files  1 failed (1)
Tests       4 failed (4)
Representative failure: normalizeDomainName is not a function
```

The first invocation before worktree-local dependency linking also recorded the
tooling precondition `Command "vitest" not found`; an offline frozen install used
the existing pnpm content-addressable store and changed no lockfile.

GREEN:

```text
pnpm vitest run tests/unit/evaluator-domains.test.ts \
  tests/unit/evaluator-foundation.test.ts \
  tests/integration/evaluator-database.test.ts
Test Files  3 passed (3)
Tests       20 passed (20)
```

Focused coverage includes exact matching, invalid/new/near-duplicate decisions,
stable candidate ordering, pending-seed runner exclusion, grown provenance,
append-only mutation rejection, one-time backfill, dedicated-link readback, and
concurrent near-duplicate serialization.

## Verification

```text
pnpm generate:contract && pnpm typecheck
PASS (tsc --noEmit)

pnpm audit:architecture
edgeRowsChecked: 27; violations: []

pnpm audit:source
blocking: []

pnpm test
Test Files  84 passed (84)
Tests       604 passed (604)

git diff --check
PASS
```

The skeleton-repo checks named by the outer `AGENTS.md` were inspected but are
not present in this imported application worktree:
`tests/render-templates.sh: N/A` and `tests/lint-templates.sh: N/A`.

## Gate and residual risk

The starter seed remains intentionally unapplied and un-routed. V approval of
the proposed list is still required before integration moves 0024 into the
top-level migration directory. Replacing V's final names changes only the
`seed_data` values. No push was performed.

READY FOR PEER REVIEW: codex/eval-03-domains

---

## Rework round 1 — Opus binding review

Status: READY FOR PEER REVIEW  
Triggering review:
`docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-03-opus-review-1.md`  
Rework commit: `d2d72a0f104b9dc87d8c0dbb45adfd24d1ee9fc6`  
Comments read through: complete Opus review 1, 2026-08-15  
V decision: 26-name starter list approved as written

### Binding findings addressed

- **B1:** widened the structured separator grammar to accept whitespace,
  ampersands and hyphens with optional surrounding whitespace, plus straight and
  curly apostrophes. Malformed repeated ampersands remain invalid.
- **B2:** added an end-to-end regression that provisions a separate scratch
  embedded PostgreSQL instance, migrates through 0023, applies the real
  `migrations/pending/0024_evaluator_domain_seed.sql`, and submits every one of
  the 26 seeded canonical names through `DomainRegistryRepository.admitProposal`.
  Every decision must be `MATCHED_EXISTING`.
- **N2:** reduced `seed_data` to canonical names only. Migration SQL now derives
  `normalized_name` with NFKC, whitespace folding, trimming, and lowercase. The
  scratch test asserts each stored value equals `normalizeDomainName` before it
  exercises admission, so replacing the list changes only canonical seed data.
- Updated the proposal packet to record V approval. Migration 0024 remains
  outside the top-level runner scan pending integration; no migration wiring was
  added in this lane.

The review's non-blocking N1 surface (`REFUSED` and direct existing-domain-id
selection) remains explicitly assigned to downstream lane 04 as the reviewer
noted; this rework did not expand the current lane contract.

### Reproduce-first evidence

Required regression written before production/migration changes:

```text
pnpm vitest run tests/integration/evaluator-database.test.ts \
  -t "applies pending 0024"
Test Files  1 failed (1)
Tests       1 failed | 7 skipped (8)
Received: REJECTED_INVALID for all 18 ampersand-bearing approved names
Expected: MATCHED_EXISTING for all 26 names
```

The first harness attempt correctly exposed a pre-existing fixture collision in
the shared integration schema (`mathematics` unique key). The test was then
isolated in a fresh scratch database without changing production code, producing
the binding 18-invalid/8-matched RED above.

### Rework GREEN evidence

```text
pnpm vitest run tests/unit/evaluator-domains.test.ts \
  tests/unit/evaluator-foundation.test.ts \
  tests/integration/evaluator-database.test.ts
Test Files  3 passed (3)
Tests       21 passed (21)

pnpm generate:contract && pnpm typecheck
PASS (tsc --noEmit)

pnpm audit:architecture
edgeRowsChecked: 27; violations: []

pnpm audit:source
blocking: []

pnpm test
Test Files  84 passed (84)
Tests       605 passed (605)

git diff --check
PASS
```

No API key, BOUND state, product behavior change, migration-runner wiring, board
mutation, push, or merge was introduced.

READY FOR PEER REVIEW: codex/eval-03-domains
