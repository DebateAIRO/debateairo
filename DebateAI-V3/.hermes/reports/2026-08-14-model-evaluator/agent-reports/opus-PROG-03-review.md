# Claude Opus agent report — PROG-03 peer review 1

Status: REVIEW VERDICT: REWORK
Reviewer: Claude Opus (peer reviewer seat, Codex lane eval-03-domains)
Lane / branch: `codex/eval-03-domains`, commit `a3aa2d8`
Worktree reviewed: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-03-domains`
Review written to:
`docs/missions/2026-08-14-model-evaluator/programming/reviews/PROG-03-opus-review-1.md`
Date: 2026-08-14

## Scope

Reviewed `git diff dev...codex/eval-03-domains` against Architecture §3.2 / §3.9
/ §5.1 / §7 row 1A / §8 and Requirements FR-1.1, FR-1.2, FR-1.3, FR-0.x, on the
six axes given in the review packet. Read-only outside this file and the review
file. No commits, no pushes, no board mutation, no changes in the lane worktree.

## Gates executed independently

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `pnpm audit:architecture` | 27 edge rows, `violations: []` |
| `pnpm audit:source` | `blocking: []` |
| `npx vitest run tests/unit/evaluator-domains.test.ts` | 5/5 pass |
| `npx vitest run tests/integration/evaluator-database.test.ts` | 7/7 pass |
| `npx vitest run` (full) | 84 files / 604 tests pass |
| Own probe: apply `pending/0024` to migrated embedded PG | 26 rows, all `STARTER`, SQL valid |
| Own probe: re-propose each seeded name through the guardrail | `{ REJECTED_INVALID: 18, MATCHED_EXISTING: 8 }` |

The author's self-report numbers reproduce exactly. No fabricated results found.

## Verdict rationale

REWORK on two blockers, both tracing to one root cause.

- **B1.** `isValidDomainName`'s regex
  `^[\p{L}\p{N}]+(?:[ &'’-][\p{L}\p{N}]+)*$` allows only a single separator
  character between alphanumeric runs, so `" & "` fails. 18 of the 26 names in
  the lane's own V proposal packet and in migration 0024 are therefore
  `REJECTED_INVALID` by the lane's own admission function. Because the validity
  check runs before the exact-name match, and because `admitProposal(name)` is
  the only landing path in the repository, those 18 starter domains would be
  permanently unmatchable once V approves — breaking FR-1.1 AC2 and FR-1.3 AC1
  for most of the registry. V is currently being asked to approve names the
  shipped code rejects.
- **B2.** Every name exercised in the suite is ampersand-free, though the unit
  fixture registry contains `health & medicine` as an unused bystander; and no
  test applies migration 0024 (assertions stop at filename absence plus a header
  string). The coverage shape is what hid B1, and it leaves the "swapping the
  list touches only seed data" claim untested and, in the ampersand case, false.

## Axis results

1. **Completeness vs row 1A** — repository, question-domain landing, V packet,
   and gated seed all present; admission present but defective for the shipped
   list, and missing the `REFUSED` / select-existing-`domain_id` paths named by
   Architecture §3.2 and §5.1 (non-blocking note for lane 04).
2. **Determinism + guardrails** — genuinely deterministic and genuinely tested:
   pure evaluator, locale-pinned normalization and ordering, 1e-6 similarity
   rounding, order-independence asserted, and a real two-connection race proving
   the advisory-lock + re-read-under-lock serialization. Limited only by B2's
   fixture selection.
3. **Append-only / backfill** — compliant. `run_id UNIQUE` singularity, second
   insert rejected, `UPDATE` refused with the pinned trigger message, backfill
   modelled as first insert not update, readback through the one documented path.
4. **Seed unwired** — verified structurally, not just by assertion: the runner
   does a non-recursive `readdir(migrations/)` filtered by `/^\d+.*\.sql$/`
   (`packages/db/src/index.ts:124-125`), so a file under `pending/` cannot be
   reached. Swap-only-the-data holds for the insertion contract, but
   `normalized_name` is hand-typed per row, which is a silent-unmatchability trap
   of the same class as B1.
5. **No product behavior change / no BOUND / DR-179** — clean. Diff confined to
   `packages/evaluator/{src,README}`, two test files, and `migrations/pending/`.
   No BOUND state, no dispatch binding, no API key or provider call, no lockfile
   or `schema.ts` change, full suite green.
6. **Test honesty** — reported numbers accurate and reproduced; the defect is
   fixture selection and an untested seed, plus one self-report claim
   ("replacing V's final names changes only the `seed_data` values") stated as
   settled while being untested and false for ampersand names.

## Recommendation to the orchestrator

Do not route the starter-list packet to V until B1 is resolved — the packet and
the guardrail must agree first, otherwise V approves a list the code refuses.
Re-review needs: B1 fixed (widen the separator handling, or drop `&` from the
list), B2 covered by a test that runs the actual proposed list to
`MATCHED_EXISTING`, N2 (derive `normalized_name`) applied or justified, and the
gates re-run. The rest of the lane is sound; I expect no further findings once
the list and the guardrail agree.
