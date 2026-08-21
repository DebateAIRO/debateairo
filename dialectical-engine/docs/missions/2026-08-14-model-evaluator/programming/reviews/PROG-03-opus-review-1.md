# PROG-03 peer review 1 — Claude Opus

Lane: `codex/eval-03-domains` (PROGRAMMING, tier 1A)
Commit reviewed: `a3aa2d8` ("feat(evaluator): add deterministic domain registry")
Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-03-domains`
Binding docs: Architecture §3.2 / §3.9 / §5.1 / §7 row 1A / §8; Requirements FR-1.1, FR-1.2, FR-1.3, FR-0.x
Reviewer: Claude Opus, read-only outside this file and the self-report.

## Verdict

**REWORK.**

The lane's engineering is otherwise strong — the schema mapping, advisory-lock
serialization, provenance enforcement, and the unwired-seed mechanic are all
correct and independently verified below. But the lane ships two mutually
inconsistent halves of its own deliverable: the admission guardrail rejects 18 of
the 26 domain names in the lane's own V proposal packet and migration 0024 seed.
V is currently being asked to approve a starter list that this lane's code
classifies as `REJECTED_INVALID`. The test suite does not catch this because it
never exercises the name shape that dominates the list.

## Changed surface

```
DebateAI-V3/migrations/pending/0024_evaluator_domain_seed.sql   |  53 ++
DebateAI-V3/packages/evaluator/README.md                        |  31 ++
DebateAI-V3/packages/evaluator/src/index.ts                     | 336 +-
DebateAI-V3/tests/integration/evaluator-database.test.ts        | 157 ++
DebateAI-V3/tests/unit/evaluator-domains.test.ts                |  64 ++
```

Plus the V proposal packet in the main checkout at
`docs/missions/2026-08-14-model-evaluator/programming/eval-03-starter-list-proposal.md`.

## Gates I ran myself (worktree, not the author's transcript)

| Gate | Command | Result |
|---|---|---|
| Repository typecheck | `npx tsc --noEmit` | PASS (exit 0, no output) |
| Architecture audit | `pnpm audit:architecture` | 27 edge rows checked, `violations: []` |
| Source audit | `pnpm audit:source` | `blocking: []` |
| Lane unit tests | `npx vitest run tests/unit/evaluator-domains.test.ts` | 5/5 pass |
| Lane integration tests | `npx vitest run tests/integration/evaluator-database.test.ts` | 7/7 pass |
| Full suite | `npx vitest run` | 84 files / 604 tests pass — matches the author's claim exactly |
| Seed application (my probe) | applied `pending/0024` to a migrated embedded PG | 26 rows, all `origin='STARTER'`, SQL valid |

No red flags on test honesty in the *reported numbers*; the author's self-report
matches reality. The honesty problem is coverage shape, not fabricated results
(B2 below).

---

## Blockers

### B1 — The admission guardrail rejects 18 of the 26 names in this lane's own starter list

`packages/evaluator/src/index.ts`, `isValidDomainName`:

```ts
return /^[\p{L}\p{N}]+(?:[ &'’-][\p{L}\p{N}]+)*$/u.test(normalizedName);
```

The separator group matches exactly **one** character between alphanumeric runs.
The starter list uses `" & "` — space, ampersand, space — which is three
separator characters in a row. The regex therefore fails on every
ampersand-bearing name.

Verified twice, statically and end-to-end. After applying
`migrations/pending/0024_evaluator_domain_seed.sql` to a migrated database and
re-proposing each seeded `canonical_name` through `evaluateDomainProposal`
against the seeded registry:

```
SEED APPLIED ROWS: 26
ORIGINS: [ 'STARTER' ]
RE-PROPOSE OWN STARTER NAME: { REJECTED_INVALID: 18, MATCHED_EXISTING: 8 }
```

The 18: Agriculture & Food, Arts & Culture, Business & Management, Computing &
Software, Environment & Climate, Ethics & Philosophy, Finance & Investing,
Government & Public Policy, Health & Medicine, Law & Justice, Linguistics &
Languages, Media & Communication, Politics & Elections, Religion & Spirituality,
Security & Defense, Society & Demographics, Sports & Recreation, Technology &
Innovation.

Why this is blocking rather than cosmetic:

1. `evaluateDomainProposal` runs the validity check **before** the exact-name
   match, so an ampersand name is rejected as invalid and never reaches
   `MATCHED_EXISTING`.
2. `DomainRegistryRepository` exposes exactly one landing path,
   `admitProposal(proposedName)`. There is no "tagger selected an existing
   `domain_id`" entry point (see N1). Name matching is therefore the *only* way a
   question can land on a starter domain.
3. Consequence: the moment V approves this list and 0024 is wired, 18 of 26
   starter domains become permanently unreachable — no `domain_admission` with a
   `domain_id`, hence no `question_domain` row can ever reference them. That
   breaks **FR-1.1 AC2** (near-duplicate proposal "rejected or forced onto an
   existing domain id" — here a *legitimate exact* proposal is rejected as
   malformed) and **FR-1.3 AC1** (QA can read back a question's domain via the
   link table) for 69% of the registry.
4. It also puts a HITL gate in a bad state: the V packet asks for approval of
   names the shipped guardrail refuses, and the packet's own prose claims the
   guardrails "normalize Unicode/case/space, match exact names" — which is not
   true for those names.

Fix direction (author's call, but the two coherent options are):

- Widen the separator handling so `" & "` and comparable multi-character
  separators are valid — e.g. permit a separator *run* rather than a single
  character, or fold `" & "` to a canonical form during normalization; **or**
- Drop `&` from the proposed starter list and re-issue the V packet with names
  the current guardrail admits.

Either way the fix must land with a test that proposes a seeded name containing
`&` and asserts `MATCHED_EXISTING`, and the V packet and 0024 must be re-checked
against the shipped guardrail before the packet goes to V.

### B2 — The test suite systematically avoids the failing name shape, and never applies the seed

This is the coverage hole that hid B1.

- Every name proposed anywhere in the suite is ampersand-free: `Software
  Engineering`, `Software Engineer`, `Climate Science`, `Mathematics`,
  `Robotics`, `Robotic`. The unit fixture registry *contains* `health & medicine`
  (`tests/unit/evaluator-domains.test.ts`) but no test ever proposes it — the one
  fixture that would have caught the bug is present as a bystander only.
- The only assertions on migration 0024 are (a) that its filename is absent from
  the runner's top-level scan and (b) that the file begins with `-- PENDING V
  APPROVAL` and contains the provenance string. Nothing applies the SQL, so
  neither "the seed is valid SQL against the 0023 schema" nor — far more
  important — "the seeded names are admissible by the shipped guardrails" is
  proven by the lane. I had to write my own probe to establish both.

Required before re-review: a test that seeds (or fixtures) the *actual proposed
list* and asserts every entry round-trips to `MATCHED_EXISTING`. That single
assertion is the standing guard against B1 recurring when V substitutes names.

---

## Axis-by-axis findings

### 1. Deliverable completeness vs lane row 1A

| Row 1A item | State |
|---|---|
| Registry repository | Delivered — `DomainRegistryRepository` with `listDomains` / `admitProposal` / `assignQuestionDomain` / `readQuestionDomain` |
| Deterministic admission with new-domain guardrails | Delivered but defective for the shipped list (B1); also missing the `REFUSED` and select-existing-`domain_id` paths named by Architecture §3.2/§5.1 (N1) |
| Question-domain landing | Delivered on the architecture's chosen mechanism — dedicated `evaluator.question_domain` only; nothing in the diff touches `memory.question_key`, `question_type`, or `declared_field`, satisfying the FR-1.3 ban |
| V proposal packet | Delivered, 26 entries with one-line rationales, labeled `PROVISIONAL — PENDING V APPROVAL` per FR-1.2 — but its contents are contradicted by the code (B1) |
| Gated 0024 seed NOT wired | Delivered and genuinely unwired (axis 4) |

Column mapping against Architecture §3.2 is faithful: the `STARTER`/`GROWN`
provenance CHECK, the `decision`→`domain_id` CHECK, `candidate_similarities` as a
JSON array, `guardrail_version`, and `at_seq` are all populated correctly, and
the `assignment_basis='TAGGER' ⇒ tagger_raw_artifact_ref NOT NULL` rule is
enforced in code as well as in the schema.

### 2. Admission determinism and near-duplicate guardrails

Genuinely deterministic and genuinely tested, within the coverage limits of B2.

- `evaluateDomainProposal` is pure; normalization is NFKC + locale-pinned
  `en-US` lowercase + whitespace fold; ordering uses `localeCompare("en-US")`
  with a `domainId` tiebreak; similarity is rounded to 1e-6 to kill float drift.
- Order-independence is asserted directly (registry reversed → identical result),
  which is the right shape of determinism test.
- Similarity is `max(normalized Levenshtein, token Jaccard)` at threshold `0.8`.
  I spot-checked plausible collisions across the proposed list and found no
  false positives among the 26; `robotics`/`robotic` (0.875) and
  `software engineering`/`software engineer` are correctly caught.
- Concurrency: `admitProposal` takes a registry-wide advisory xact lock, then a
  per-normalized-name lock, then **re-reads the registry under lock** before
  deciding. The integration test races two differently-spelled near duplicates on
  two distinct pool connections (pg default max 10, so this is a real race) and
  asserts exactly one grown row survives. This is the correct mechanism and a
  real test of it.

### 3. Append-only compliance and backfill tests

Compliant. `evaluator.question_domain.run_id UNIQUE` makes assignment singular;
the test inserts a `BACKFILL` link, asserts the second insert rejects, asserts a
direct `UPDATE` is refused by the 0023 `reject_mutation` trigger with the exact
error text, and reads the link back through the documented single path. Backfill
is correctly modelled as a first insert, never an update. `evaluator.domain` and
`evaluator.domain_admission` inherit `reject_mutation` from
`migrations/0023_evaluator_foundation.sql:409-412` and are covered by lane 02's
trigger-count assertion, so the property holds even though this lane's test named
"keeps domain identity append-only" only asserts it on `question_domain` (N5).

### 4. Seed migration verifiably unwired; swapping the list touches only seed data

Unwired: **verified independently.** The runner is
`packages/db/src/index.ts:124-125`:

```ts
const directory = new URL("../../../migrations/", import.meta.url);
const migrations = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
```

`readdir` is non-recursive and returns `pending` as a bare directory entry, which
cannot match `/^\d+.*\.sql$/`. A file under `migrations/pending/` is therefore
structurally unreachable by the runner, not merely omitted from a list — this is
the right mechanic, and it is asserted by test rather than only asserted in prose.
The `PENDING V APPROVAL` banner is prominent and states the move condition.

Swap-only-the-data: **mostly true, with one trap.** The migration body is a
`WITH seed_data(canonical_name, normalized_name) AS (VALUES …)` block feeding a
fixed `INSERT … SELECT`, so the insertion contract is genuinely isolated from the
list. But `normalized_name` is **hand-typed alongside** each canonical name rather
than derived. A hand-typed value that diverges from what `normalizeDomainName`
produces creates a row that is silently unmatchable forever — which is precisely
the failure class of B1, arriving through a second door. See N2.

### 5. No product behavior change, no BOUND state, DR-179

Clean on all three.

- The diff touches only `packages/evaluator/{src,README}`, two test files, and
  `migrations/pending/`. No product package, no runner/API/scheduler wiring, no
  edit to 0023, no `schema.ts` change, no lockfile change.
- No `BOUND` state, no dispatch binding, no seat-share or panel call site.
- DR-179: no API key, token, `Authorization` header, or provider call anywhere in
  the diff — the lane makes zero network calls by construction.
- Full suite green at 604 tests, so no incidental regression elsewhere.

### 6. Test honesty

The author's *reported* numbers are accurate — I reproduced typecheck, both
audits, the lane tests, and the 84-file/604-test full run, and they match the
self-report line for line. The RED→GREEN narrative is plausible and specific.

The honesty defect is selection, not fabrication: the suite's chosen fixtures
exercise only the 8 of 26 starter names that happen to pass, and the 0024
assertions are string/filename assertions that deliberately stop short of
applying the SQL. The self-report's claim that "replacing V's final names changes
only the `seed_data` values" is stated as settled when nothing in the lane tests
it, and it is in fact false in the ampersand case. That claim should be softened
or made true by test.

---

## Non-blocking notes

- **N1 — Missing admission paths.** Architecture §3.2 lists `REFUSED` in the
  `domain_admission.decision` enum and §5.1 step 4 says the vLLM returns "either
  an existing domain id, a proposed label, or refusal". The repository emits only
  four of the five decisions and offers no entry point for the
  select-existing-`domain_id` or refusal cases. Lane 04 will have to add that
  surface. Name the gap explicitly in the lane handoff so 04 does not discover it
  cold.
- **N2 — Derive `normalized_name` in the seed.** Replacing the hand-typed column
  with a derivation (`lower(btrim(regexp_replace(canonical_name, '\s+', ' ',
  'g')))`, or better, normalization asserted by test against
  `normalizeDomainName`) makes "swap only the list" genuinely safe for V's final
  names.
- **N3 — "Registered" bounds.** Architecture §3.2 speaks of the "registered
  length/word/character bounds" and the "registered near-duplicate similarity".
  The lane hardcodes `80` / `6` / `0.8` as TS module constants. They *are*
  versioned via `DOMAIN_GUARDRAIL_VERSION` and persisted on every admission
  receipt, which serves the auditability intent, and §3.9's "registered guardrail
  version" reads as "recorded" rather than "register-row-sourced". Flagging for
  Hermes to settle whether §3.2 intends `register.register_row` here; I do not
  read it as blocking.
- **N4 — Redundant second lock.** The registry-wide advisory lock already
  serializes all admissions, making the per-normalized-name lock dead weight; and
  global serialization is a real (if presently irrelevant) throughput choice.
  Worth one comment in the code explaining that the wide lock is deliberate
  because near-duplicate detection is inherently registry-wide.
- **N5 — Loose assertions and two untested ACs.** The duplicate-assignment test
  uses a bare `.rejects.toThrow()` with no matcher, unlike its sibling which
  pins the trigger message. No test asserts `readQuestionDomain` returns `null`
  for an untagged run (FR-1.3 AC4), and `candidate_similarities` is never read
  back out of the database to confirm the persisted JSON array shape.
- **N6 — Role fidelity.** The integration tests exercise these paths as the pool
  superuser rather than `debateai_evaluator_worker`, so the 0023 grants are not
  in force on the new code paths. Consistent with lane 02 practice; noted only.

## Re-review checklist

1. B1 fixed in one of the two coherent directions, with the V packet and 0024
   seed made consistent with the shipped guardrail.
2. B2: a test that runs the *actual proposed list* through the guardrail and
   asserts every entry reaches `MATCHED_EXISTING`.
3. N2 applied, or an explicit statement of why hand-typed normalization is safe.
4. Typecheck, both audits, and the full suite re-run and re-reported.

Everything else on this lane is sound and I do not expect further findings once
the list and the guardrail agree.
