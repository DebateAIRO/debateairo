# PROG-03 peer review 2 — Claude Opus

Lane: `codex/eval-03-domains` (PROGRAMMING, tier 1A)
Commit reviewed: `d2d72a0` ("fix(evaluator): accept approved domain names"), rework over `a3aa2d8`
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-03-domains` (clean, nothing uncommitted)
Context: V approved the 26-name starter list **as written** on 2026-08-15, so the guardrail must accept exactly those names.
Prior round: `PROG-03-opus-review-1.md` (REWORK, four blockers)
Reviewer: Claude Opus, read-only outside this file and the self-report.

## Verdict

**PASS.**

All four round-1 blockers are genuinely resolved, verified by my own end-to-end
probe against a freshly seeded database rather than by reading the author's
tests. The rework is small, surgical, and confined to exactly the surface that
was broken — the fix does not perturb the parts of the lane I already passed.

## Round-2 change surface

```
DebateAI-V3/migrations/pending/0024_evaluator_domain_seed.sql   | 64 +++++-----
DebateAI-V3/packages/evaluator/README.md                        | 17 ++--
DebateAI-V3/packages/evaluator/src/index.ts                     |  2 +-
DebateAI-V3/tests/integration/evaluator-database.test.ts        | 58 ++++++++-
DebateAI-V3/tests/unit/evaluator-domains.test.ts                | 15 ++-
```

The production-code delta is a **single line** — the validity regex. Everything
else is seed data, tests, and docs. That is the right shape for this fix.

## Gates I ran myself

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| `pnpm audit:architecture` | 27 edge rows, `violations: []` |
| `pnpm audit:source` | `blocking: []` |
| Lane unit + integration | 13/13 pass |
| Full suite `npx vitest run` | 84 files / **605** tests pass, exit 0 — matches the author's claim (604 → 605, the one new test) |
| `git status --porcelain` in worktree | empty |

---

## Blocker-by-blocker verification

### B1 — Guardrail rejected 18 of 26 approved names → **RESOLVED**

`packages/evaluator/src/index.ts`, `isValidDomainName`:

```ts
- return /^[\p{L}\p{N}]+(?:[ &'’-][\p{L}\p{N}]+)*$/u.test(normalizedName);
+ return /^[\p{L}\p{N}]+(?:(?: +| *& *| *- *|['’])[\p{L}\p{N}]+)*$/u.test(normalizedName);
```

The separator is now an alternation of *runs* — whitespace, or an ampersand or
hyphen with optional surrounding whitespace, or a bare apostrophe — instead of a
single character. `" & "` matches via ` *& *`.

I re-ran my own round-1 probe against the newly seeded registry (fresh embedded
Postgres, `migrate()`, then apply `pending/0024`):

```
SEED ROWS: 26 ORIGINS: [ 'STARTER' ]
PURE RE-PROPOSE:  { MATCHED_EXISTING: 26 }
DB RE-PROPOSE:    { MATCHED_EXISTING: 26 }   CORRECT DOMAIN_ID LINKS: 26 / 26
```

Round 1 read `{ REJECTED_INVALID: 18, MATCHED_EXISTING: 8 }`. All 26 V-approved
names now match, and — the assertion that actually matters — each resolves to the
**correct** `domain_id`, not merely to some non-null one.

I also checked the fix did not simply widen the gate into uselessness:

```
"Health && Medicine" -> REJECTED_INVALID
"Health &"           -> REJECTED_INVALID
"& Medicine"         -> REJECTED_INVALID
"Health - - Law"     -> REJECTED_INVALID
"Arts--Culture"      -> REJECTED_INVALID
"a&b"                -> ADMITTED_NEW      (ampersand without spaces — intended)
```

Doubled separators, leading separators, trailing separators, and separator runs
with interior gaps all still reject. The regex admits the shapes the approved
list needs and nothing structurally malformed. `"Health && Medicine"` is now
pinned as an invalid case in the unit test, which is the right regression guard
for the specific way this could be over-loosened later.

### B2 — 18 starter domains permanently unmatchable (FR-1.1 AC2 / FR-1.3 AC1) → **RESOLVED**

Matching was necessary but not sufficient; I checked that a question can now
actually *land* on an ampersand-bearing starter domain end to end — admission,
`question_domain` insert, and readback through the one documented path:

```
AMPERSAND LANDING: Agriculture & Food -> LINKED OK
```

`readQuestionDomain(runId).domainId` equals the seeded domain's id. FR-1.3 AC1
("QA can read back its domain via one documented path") now holds for the full
registry rather than for 8 of 26.

The separate architectural gap I flagged alongside this — no
select-existing-`domain_id` entry point and no `REFUSED` decision path
(Architecture §3.2 enum, §5.1 step 4) — remains open and remains a **lane-04
handoff note**, not a 1A blocker. See N1.

### B3 — Test suite avoided the failing shape and never applied the seed → **RESOLVED**

Both halves are now covered, and covered in the shape I asked for:

- **Unit** (`tests/unit/evaluator-domains.test.ts`): `"Health & Medicine"` is
  proposed and asserted `MATCHED_EXISTING` against the fixture that previously
  sat unused. Apostrophe and hyphen separators gained positive cases
  (`Children's Health`, `Pre-trial Law`), and `"Health && Medicine"` was added to
  the invalid set.
- **Integration**: a new test applies `pending/0024`, asserts 26 rows all
  `origin='STARTER'`, then loops **every seeded name** through the real
  `DomainRegistryRepository.admitProposal` and asserts the full array equals
  `MATCHED_EXISTING` per name. The assertion compares name-and-decision pairs, so
  a silent count-only pass is not possible. This is precisely the standing guard
  against B1 recurring when a future list is swapped in.

The suite grew 604 → 605 and I reproduced the whole thing green.

### B4 — Hand-typed `normalized_name` in the seed → **RESOLVED**

The `seed_data` CTE now carries **canonical names only**; the insertion contract
derives the normalized form in SQL:

```sql
lower(btrim(regexp_replace(normalize(canonical_name, NFKC), '\s+', ' ', 'g')))
```

This mirrors the TS normalizer's NFKC → whitespace-fold → trim → lowercase
pipeline. Rather than trust the mirror by inspection, I compared every seeded row
against `normalizeDomainName(canonical_name)`:

```
NORMALIZER MISMATCHES: 0 []
```

The author's integration test asserts the same equivalence row by row, so the
two normalizers cannot silently drift apart under a future list swap. `ORDER BY`
correctly moved to `canonical_name` now that the normalized column is computed.

With this, the claim "replacing the starter list touches only seed data" is
finally **true and tested** — a swap now edits only canonical name literals, and
the round-trip test proves the swapped names remain admissible.

---

## Axes re-checked (round-1 findings that must not have regressed)

- **Seed still unwired.** The file remains under `migrations/pending/`, which the
  runner's non-recursive `readdir` + `/^\d+.*\.sql$/` filter
  (`packages/db/src/index.ts:124-125`) structurally cannot reach. The banner is
  updated honestly to `-- V-APPROVED LIST — PENDING INTEGRATION; DO NOT MOVE INTO
  migrations/ HERE.`, and the unit test now pins that new header plus the
  `WITH seed_data(canonical_name) AS` shape. Approval status changed; wiring did
  not. Correct.
- **No product behavior change.** The round-2 delta touches one line of evaluator
  source, seed data, two test files, and the README. No product package, no
  runner/API wiring, no `schema.ts`, no lockfile, no edit to 0023.
- **No BOUND state, DR-179 clean.** Unchanged from round 1; no keys, no provider
  calls, no dispatch binding anywhere in the lane.
- **Append-only / backfill, determinism, concurrency.** Untouched by the rework
  and still green; my round-1 analysis stands.
- **Test honesty.** The author's reported numbers again reproduce exactly
  (605/605, both audits, typecheck). The round-1 honesty defect was fixture
  selection, and the new tests close it at the specific point of failure rather
  than papering over it.
- **HITL state recorded.** The proposal packet now reads `Status: **V APPROVED AS
  WRITTEN — 2026-08-15**`, so the gate that held this lane is documented in the
  mission record.

## Non-blocking notes

Carried from round 1 (none blocking, none newly worsened):

- **N1 — Missing admission paths.** `REFUSED` is still never emitted, and there
  is no entry point for "the vLLM returned an existing `domain_id`"
  (Architecture §3.2 enum, §5.1 step 4). Lane 04 must add this surface; name it
  explicitly in the 03→04 handoff so it is not discovered cold.
- **N3 — "Registered" bounds.** `80` / `6` / `0.8` remain TS module constants
  rather than `register.register_row` values. They are versioned via
  `DOMAIN_GUARDRAIL_VERSION` and persisted on every admission receipt, which
  serves the auditability intent. For Hermes to settle if §3.2 meant otherwise.
- **N4 — Redundant per-name advisory lock**, given the registry-wide lock already
  serializes all admissions.
- **N5 — Loose assertions.** Bare `.rejects.toThrow()` on the duplicate-assignment
  test; no test asserts `readQuestionDomain` returns `null` for an untagged run
  (FR-1.3 AC4); `candidate_similarities` is still never read back out of the DB.
- **N6 — Role fidelity.** Integration tests run as the pool superuser rather than
  `debateai_evaluator_worker`, so 0023 grants are not in force on these paths.
  Consistent with lane 02.

New in round 2:

- **N7 — The 0024 test boots a second full embedded Postgres**, not a scratch
  schema within the shared instance. Isolation is if anything better, and the
  cost is ~1.2s, so I am not asking for a change — but the mechanism is worth
  describing accurately in handoff notes.
- **N8 — The word budget counts `&` as a word.** `Government & Public Policy`
  spends 4 of the 6-word allowance. Harmless for the approved list (longest is
  4), but a future six-word list swap could hit the ceiling unexpectedly.
- **N9 — Cosmetic.** The self-report's closing line reads
  `READY FOR PEER REVIEW: codex/eval-eval-03-domains` (doubled `eval-`).

## Merge-gate status (lane row 1A)

| Gate | State |
|---|---|
| Append-only / backfill tests for the registry | Met |
| Admission determinism tests | Met |
| Repository typecheck | Met |
| Architecture + source audits | Met |
| HITL seed approval | Met — V approved as written 2026-08-15; 0024 authored and deliberately unwired |
| Dual peer review | This is my PASS; second reviewer's verdict still required |

Nothing from my seat blocks merge. Integration should wire 0024 into the
top-level migration directory as a separate, explicit step — not as part of this
lane's merge — and lane 04 should pick up N1 before it starts.
