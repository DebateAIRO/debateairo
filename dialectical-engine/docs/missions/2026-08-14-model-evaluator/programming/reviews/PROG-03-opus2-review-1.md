# PROG-03 — SECOND INDEPENDENT REVIEW (Opus 5, fresh seat) — rev 1

**Verdict: PASS** (with 6 named non-blocking defects; #1 must close before PROG-04 wires the tagger)

**Seat:** second independent reviewer, substituting the Grok seat per V's outage ruling.
No other PROG-03 review file was read; every conclusion below is reproduced from the
diff, the binding docs, and my own runs.
**Subject:** `git diff dev...codex/eval-03-domains` — commits `a3aa2d8`, `d2d72a0`
(5 files, +705/-2).
**Binding law read:** `architecture/Architecture.md` §3.2, §3.8, §3.9, §5.1, §7 (lane row 1A),
§8; `requirements/Requirements.md` FR-0.1/0.4/0.5/0.6/0.7, FR-1.1, FR-1.2, FR-1.3,
FR-2.2; `decisions-ledger.md` DR-179.
**Context relied on:** `programming/eval-03-starter-list-proposal.md` — V approved the
26-domain list as written (2026-08-15).
**Discipline:** read-only against the lane worktree; the only writes are this file and
my agent report; no commits; scratch verification scripts live outside the repo.

---

## 1. What I ran (all output reproduced from this seat)

| Gate | Command | Result |
|---|---|---|
| Unit | `npx vitest run tests/unit/evaluator-domains.test.ts` | 5 passed |
| Integration | `npx vitest run tests/integration/evaluator-database.test.ts` | 8 passed (4 new + 4 pre-existing) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Architecture audit | `tsx tools/orphan-audit/src/cli.ts architecture` | `{"edgeRowsChecked":27,"violations":[]}` |
| Source audit | `tsx tools/orphan-audit/src/cli.ts source` | `{"blocking":[]}` |
| Text-byte audit | `tsx tools/check-text-control-bytes.ts` | `REPOSITORY_TEXT_CONTROL_BYTES=0` |
| Independent list check | own script, parses the 26 names out of the migration | see §2 |
| Independent DB probe | own script, embedded PG + `migrate()` | see §4.1, §4.2 |

No test file was weakened: the only deletion anywhere under `tests/` is one import line
(`EVALUATOR_PROVIDER_REF`) that moved inside a widened import list.

---

## 2. V's 26 names are admissible AND matchable in the shipped code (verified independently)

The shipped integration test proves *matchability* only. I wrote my own checker that
parses the canonical names straight out of `migrations/pending/0024_evaluator_domain_seed.sql`
(no hardcoded copy) and drives `evaluateDomainProposal`/`normalizeDomainName` directly:

```
parsed names: 26
leave-one-out failures: 0        <- each name is ADMITTED_NEW against the other 25
match failures: 0                <- each name is MATCHED_EXISTING against all 26, to its own id
variant failures: 0              <- UPPERCASE + padded + " & " respaced still MATCHED_EXISTING
worst near-dup pair (>=0.8): none
unique normalized: 26
```

So the V-approved list is not merely storable: every entry could lawfully have been
produced by the growth path, no two entries collide at the 0.8 threshold, and each is
recoverable through the admission API under case/whitespace/Unicode noise. This is the
strongest form of the "admissible and matchable" obligation and it holds.

This mattered. Commit `a3aa2d8` shipped
`/^[\p{L}\p{N}]+(?:[ &'’-][\p{L}\p{N}]+)*$/u`, which rejects `agriculture & food` —
i.e. **19 of V's 26 approved names would have been REJECTED_INVALID by the code that
was supposed to seed them**. `d2d72a0` widened the separator alternation to
`(?: +| *& *| *- *|['’])` and added the round-trip test. The lane caught and closed its
own defect; I re-derived the failure from `a3aa2d8` and confirm the fix is correct and
covered.

---

## 3. Binding-law compliance

**§3.9 / FR-1.2 — HITL seed, unwired.** Confirmed structurally, not just by assertion.
`packages/db/src/index.ts:124-125` does a *non-recursive* `readdir` of `migrations/` and
filters `/^\d+.*\.sql$/`; the entry `pending` is a directory name that cannot match, so
`migrate()` can never reach `pending/0024_...sql`. The unit test asserts the same fact
from the other side (0024 absent from the runner's top-level scan). The file carries the
`-- V-APPROVED LIST — PENDING INTEGRATION; DO NOT MOVE INTO migrations/ HERE.` banner and
`provenance_ref='mission:model-evaluator:V-approved-starter-list'`. FR-1.1 AC1 is proved
on a genuinely separate scratch database: 26 rows, all `origin='STARTER'`, zero grown.

**FR-1.1 AC2 — admission-time, not housekeeping.** `evaluateDomainProposal` is a pure
function over `(proposal, registry)`; the repository re-reads the registry *inside* the
write transaction after taking both advisory locks, then decides. Nothing merges or
rewrites existing rows. Correct.

**FR-1.1 AC4 / append-only.** 0023 (already on `dev`, unchanged by this lane) installs
`reject_mutation` BEFORE UPDATE OR DELETE plus `REVOKE UPDATE, DELETE` on
`evaluator.domain`, `domain_admission`, `question_domain`. The lane adds no UPDATE or
DELETE statement anywhere; the single `UPDATE` in the diff is a test asserting rejection
(`/append-only or immutable table question_domain rejects UPDATE/`). Compliant.

**FR-1.3 / §2.4 — one landing, no memory writes.** `question_domain` is the only write
target; `run_id UNIQUE` and `domain_admission_id UNIQUE` make it singular; the second
insert for a run is rejected. No `memory.*` identifier appears anywhere in the diff, so
`question_type`/`declared_field` are untouched and DR-080 task-class resolution and
memory `requiredSame` matching cannot move. FR-2.2's backfill semantics hold: backfill is
a first insert (`basis='BACKFILL'`), never an update, and `readQuestionDomain` returns
`null` for an untagged run.

**§7 lane row 1A — scope.** The diff is exactly the row's deliverable: registry
repository, deterministic admission, approved starter list, pending 0024, question-domain
landing. It does not touch the 0023 migration number or `schema.ts` (PROG-02's property),
and it does not stack sibling lanes.

**No product behavior change.** The diff is 5 files: `packages/evaluator/src/index.ts`
(purely additive after line 281), its README, two test files, and the unwired migration.
`DomainRegistryRepository` is referenced only from tests — no `apps/*`, no runner, no API,
no composition root. Zero migration applies. Nothing product-visible moves.

**No BOUND state.** `grep -n "BOUND"` over the full diff: no matches. No binding
resolver, dispatch, seat-share, or panel path is touched.

**DR-179 / FR-0.5.** No key, token, bearer, or authorization material in the diff. The
lane makes no model call at all; admission is pure deterministic code.

---

## 4. Defects (non-blocking, ordered by severity)

### 4.1 (must fix before PROG-04) Blank proposals escape as raw `DatabaseError`, and leave no receipt

`admitProposal` runs `requireNonblank` over `runId`, `provider`, `modelId`,
`modelVersion`, `provenanceRef` — but **not** over `proposedName`. A blank or
whitespace-only label is correctly classified `REJECTED_INVALID` by the guardrail, and
then the receipt insert dies on the DB CHECK. Reproduced on embedded PG from this seat:

```
THROW ""    -> DatabaseError | new row for relation "domain_admission" violates check
                              constraint "domain_admission_normalized_name_check"
THROW "   " -> DatabaseError | (same)
OK    "!!!"                 -> REJECTED_INVALID
OK    "xxxxxxxx...(90)"     -> REJECTED_INVALID
receipts: [{"decision":"REJECTED_INVALID","count":"2"}]   <- only 2 of the 4 recorded
```

Two consequences: an untyped `pg` error crosses the repository boundary (repo law is
`TypedDomainError`), and the README's "Candidate evidence is … persisted on every
admission receipt" is not true for this input class. PROG-04 hands this method raw model
output, where `""` is an ordinary failure mode. One-line fix: `requireNonblank(input.proposedName,
"EVALUATOR_DOMAIN_PROPOSED_NAME_INVALID")` (or fall back to a sentinel `proposed_name`).
Not blocking *this* lane because no production caller exists yet and the pure-function
contract is honestly tested.

### 4.2 Four typed guards ship with zero coverage

`EVALUATOR_GROWN_DOMAIN_PROVENANCE_REQUIRED`, `EVALUATOR_DOMAIN_PROPOSAL_ARTIFACT_MISMATCH`,
`EVALUATOR_TAGGER_ARTIFACT_REQUIRED`, and `EVALUATOR_DOMAIN_ASSIGNMENT_ADMISSION_MISMATCH`
are never exercised. The happy paths are covered and FR-1.1 AC3 is satisfied transitively
(the DB CHECK would have refused a provenance-less GROWN row, so the passing ADMITTED_NEW
test does prove provenance is non-null) — but the refusals themselves are unproven. Each
is a 5-line test.

### 4.3 The seed round-trip cannot catch an internally inconsistent future list

The shipped test asserts every seeded name comes back `MATCHED_EXISTING`. Exact-match is
checked *before* near-duplicate, so that assertion passes even if two seeded names are
mutual near-duplicates that the growth path could never have admitted. Today's list is
clean (§2, leave-one-out = 0 failures), but the README's promise that a list swap "changes
only canonical values in `seed_data`" is only safe if the test also asserts leave-one-out
admissibility. Recommend folding my check into the shipped test.

### 4.4 `toHaveLength(26)` hardcodes the list size

Same README claim, narrower: a swap to a 24- or 30-name list edits test code as well as
`seed_data`. Derive the count from the parsed `seed_data` block instead.

### 4.5 BACKFILL assignments carry an unchecked artifact ref

`assignQuestionDomain` cross-checks `tagger_raw_artifact_ref` against the admission only
when `basis === 'TAGGER'`, yet inserts `input.rawArtifactRef` regardless. A BACKFILL may
therefore persist an arbitrary, unrelated artifact ref. Either null it for BACKFILL or
apply the same equality check.

### 4.6 Short ampersand names can slip the near-duplicate net

Because `a&b` and `a & b` normalize differently, the pair is caught only by edit
similarity, which is length-sensitive. For the 26 approved names the margin is
comfortable (`law&justice` vs `law & justice` = 0.846 ≥ 0.8), but a short grown label
such as `AI&ML` vs `AI & ML` scores 0.714 and would admit twice. Ampersand names dominate
the starter list, so consider folding separator spacing into normalization. Minor and
speculative; no approved name is affected.

---

## 5. Test honesty

Honest overall. Specifically checked, and cleared:

- **The concurrency test is not vacuous.** I probed whether the *registry-wide* advisory
  lock is load-bearing: two transactions holding only the per-normalized-name locks
  (`evaluator-domain:alpha science` / `…sciences`) both read a 0-row registry, i.e. both
  would compute `ADMITTED_NEW`, and the test's `count = 1` assertion would fail. Pool
  `max` is 10, so `Promise.all` genuinely interleaves. The lock is necessary and the test
  exercises it.
- **The near-duplicate rejection is real arithmetic, not a stub.** `software engineer` vs
  `software engineering` scores 0.85 by edit similarity (token Jaccard is only 0.33), so
  the threshold, not a special case, does the work. Covered at both the unit and DB layer.
- **Determinism is proved by reordering**, not asserted: the same registry reversed yields
  a byte-equal evaluation.
- **The scratch-schema test really is a separate database** (`startTestDatabase()` inside
  the test, stopped in `finally`), so the 26 seeded rows cannot leak into the other cases.

Two honesty nits, both cosmetic: the test titled "keeps domain identity append-only"
actually exercises `question_domain`, not `evaluator.domain` (the trigger does cover both,
so the claim is true, just not what that test proves); and one `rejects.toThrow()` has no
matcher, so it would pass on an unrelated error — the neighbouring UPDATE assertion is
correctly matcher-pinned and should be the model.

---

## 6. Note for integration (not a defect)

`normalized_name` is derived twice by different pipelines: SQL
(`lower(btrim(regexp_replace(normalize(…,NFKC),'\s+',' ','g')))`, under the database
collation) and TypeScript (`NFKC → trim → fold → toLocaleLowerCase("en-US")`). They agree
for all 26 ASCII names — the integration test asserts this row-by-row, which is the right
guard and would catch a divergence introduced by a future non-ASCII list. Worth keeping
that assertion whenever the list changes.

---

## 7. Verdict

**PASS.** The lane delivers exactly its §7 row-1A scope; V's approved 26 names are
independently verified admissible, mutually non-colliding, and matchable end-to-end
against a seeded scratch schema; the near-duplicate and determinism guardrails are
genuinely tested and their locks are load-bearing; append-only law is enforced by 0023 and
respected here; the seed is structurally unwired from the runner rather than merely
labelled so; a list swap touches only `seed_data` (modulo §4.4); there is no product
behavior change, no BOUND state, and no DR-179 exposure. §4.1 is a real hole in the
admission entry point and must close before PROG-04 feeds it live model output, but it is
unreachable today and does not warrant blocking the merge.
