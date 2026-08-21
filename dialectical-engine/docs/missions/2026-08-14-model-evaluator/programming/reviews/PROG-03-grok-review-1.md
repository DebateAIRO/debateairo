# PROG-03 Grok peer review — `codex/eval-03-domains`

**Reviewer:** Grok (read-only peer)  
**Lane / branch:** `codex/eval-03-domains` vs `dev`  
**Commit under review:** `a3aa2d8` — `feat(evaluator): add deterministic domain registry`  
**Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-03-domains/DebateAI-V3`  
**Binding bar:** Architecture.md §§3 (domain tables), 5 (data flow), 7 row 1A, 8; Requirements.md §1 Domain registry FRs + FR-0.x invariants; goal packet PROG-03.

**Scope:** Registry repository, deterministic admission with near-duplicate guardrails, `evaluator.question_domain` landing, provisional 0024 seed (unwired), starter-list proposal packet. No product/dispatch/BOUND/API-key changes.

---

## Diff surface (`a3aa2d8`)

| Path | Change |
|---|---|
| `packages/evaluator/src/index.ts` | `normalizeDomainName`, `evaluateDomainProposal`, `DomainRegistryRepository` (admit + assign + read) |
| `packages/evaluator/README.md` | Domain registry / question-landing boundary notes |
| `migrations/pending/0024_evaluator_domain_seed.sql` | Provisional 26-row STARTER seed, marked `PENDING V APPROVAL` |
| `tests/unit/evaluator-domains.test.ts` | Guardrail unit tests + pending-seed structural check |
| `tests/integration/evaluator-database.test.ts` | Domain admission, append-only/backfill landing, concurrent near-dup serialization |

No product dispatch / API composition / BOUND / API-key / `memory.question_key` paths in the diff.

**Main-checkout companion (not in lane commit, required by goal packet):**  
`docs/missions/2026-08-14-model-evaluator/programming/eval-03-starter-list-proposal.md` — 26 provisional domains with one-line rationales; names match the pending seed `VALUES` block exactly.

---

## Axis checklist

### (a) Registry repository + question-domain landing — **PASS**

`DomainRegistryRepository` (`packages/evaluator/src/index.ts`):

| Method | Behavior |
|---|---|
| `listDomains` | Reads `evaluator.domain` ordered by normalized name / id |
| `admitProposal` | Advisory locks → artifact identity check → pure evaluation → optional GROWN insert → always inserts `domain_admission` audit row |
| `assignQuestionDomain` | Requires successful `ADMITTED_NEW`/`MATCHED_EXISTING` admission for same run+domain; inserts `evaluator.question_domain` |
| `readQuestionDomain` | Readback by `run_id` |

Landing is **only** `evaluator.question_domain`. Grep of the domain path and the full lane diff shows no write to `memory.question_key` / `question_type` / `declared_field` (FR-1.3 / Architecture §0 decision 3 / §5.1).

Schema foundation for the three tables + `reject_mutation` already lands in `migrations/0023_evaluator_foundation.sql` (PROG-02); this lane owns the repository and admission logic, not a second schema migration.

### (b) Deterministic admission + near-duplicate guardrails — **PASS** (genuinely tested)

Pure decision surface:

- `normalizeDomainName`: NFKC → trim → collapse whitespace → `toLocaleLowerCase("en-US")`
- Bounds: length 2–80, ≤6 words, allowlist `[\p{L}\p{N}]+(?:[ &'’-][\p{L}\p{N}]+)*`
- Exact match on `normalized_name` → `MATCHED_EXISTING`
- Max(edit similarity, token Jaccard) rounded to 1e-6; ≥ `DOMAIN_NEAR_DUPLICATE_THRESHOLD` (0.8) → `REJECTED_NEAR_DUPLICATE` with stable candidate order
- Else → `ADMITTED_NEW`
- Version constant `DOMAIN_GUARDRAIL_VERSION = 1` persisted on domain + admission rows

Repository path is not a pure re-export of a hardcoded decision:

1. Transaction-scoped advisory locks on `evaluator-domain-registry` **and** `evaluator-domain:${normalizedName}`
2. Re-reads `evaluator.domain` under lock before deciding
3. Grown insert requires non-null `rawArtifactRef` matching the proposal’s run/provider/model/version (`EVALUATOR_GROWN_DOMAIN_PROVENANCE_REQUIRED` / `…ARTIFACT_MISMATCH`)
4. Every decision writes `domain_admission` with `candidate_similarities` JSON evidence

**Unit honesty** (`tests/unit/evaluator-domains.test.ts`): imports real `normalizeDomainName` / `evaluateDomainProposal` from `packages/evaluator/src/index.js`. Does **not** re-implement similarity or assert fixture tautologies. Covers:

- Unicode/case/whitespace fold (`ＳＯＦＴＷＡＲＥ` → `software engineering`)
- Exact match vs near-dup (`Software Engineer` → `REJECTED_NEAR_DUPLICATE`)
- New admit + invalid bounds (`""`, 1-char, 7 words, punctuation, 81-char)
- Stable candidate ordering independent of input domain order

**Integration honesty** (`tests/integration/evaluator-database.test.ts` domain suite): drives real `DomainRegistryRepository` against migrated embedded Postgres:

- Exact / near-dup / grown decisions persist; grown origin visible via `listDomains`
- Concurrent `Robotics` + `Robotic` → one `ADMITTED_NEW` + one `REJECTED_NEAR_DUPLICATE`, single grown row
- Would fail if locks/re-read were dropped (both could admit) or threshold logic drifted

### (c) Append-only / backfill compliance — **PASS**

| Check | Evidence |
|---|---|
| DB triggers | 0023 installs `reject_mutation` on `evaluator.domain`, `domain_admission`, `question_domain` (and remaining evaluator tables) |
| Singular link | `question_domain.run_id UNIQUE` + `domain_admission_id UNIQUE` |
| Backfill = first insert | Integration assigns `basis: "BACKFILL"` once; second assign rejects (duplicate `run_id`) |
| No UPDATE path | Integration `UPDATE evaluator.question_domain …` rejected with append-only message from `core.reject_mutation()` |
| Repository | No UPDATE/DELETE SQL on domain/admission/link tables |

### (d) Seed 0024 authored but verifiably **not** wired — **PASS**

| Check | Evidence |
|---|---|
| File exists | `migrations/pending/0024_evaluator_domain_seed.sql` |
| Header | First line: `-- PENDING V APPROVAL — DO NOT APPLY OR MOVE INTO migrations/ UNTIL V APPROVES.` |
| Runner scan | `packages/db/src/index.ts` `migrate()` does `readdir(migrations/)` filtered by `/^\d+.*\.sql$/` — **top-level only**; `pending/` is never scanned |
| Structural unit | Asserts top-level list does not contain `0024_…`, pending file starts with `PENDING V APPROVAL`, and contains approval provenance ref |
| Live migrate surface | Top-level ends at `0023_evaluator_foundation.sql` (confirmed this worktree) |
| List-swap surface | Only `seed_data` VALUES (canonical/normalized pairs); insert contract fixed (`origin='STARTER'`, guardrail 1, fixed provenance ref, `ledger.allocate_sequence()`) |

Starter proposal packet (main checkout) lists the same 26 names in the same order as the seed VALUES — list-swap after V approval touches seed data only.

### (e) Scope hygiene (no product change, no BOUND, no DR-179 keys) — **PASS**

- Diff limited to evaluator package + pending seed + domain-focused tests
- `readEvaluatorDispatchBinding` remains UNBOUND-only (ROW_ABSENT / ROW_INVALID / EXPLICIT_UNBOUND); no BOUND state introduced
- No API-key / secret-bearing config; README restates local no-auth vLLM path
- FR-0.6 panel-isolation integration case remains and still passes (regression guard from PROG-02)
- No edits under `apps/api`, runner live dispatch, settlement, or memory product paths

### (f) Tests honest / can fail on real defects — **PASS**

| Failure mode | How current tests would catch it |
|---|---|
| Broken normalize / NFKC | Unit exact-name assertion fails |
| Threshold too low/high | Near-dup / admit cases fail; concurrent test outcome set fails |
| Skip re-read under lock | Concurrent near-dups can both admit → count ≠ 1 |
| Write `memory.question_key` | Absent from shipped path (structural); landing readback is only `evaluator.question_domain` |
| Wire 0024 early | Unit pending-scan assertion fails; migrate would apply if file were moved top-level without approval |
| Allow domain UPDATE | Integration append-only UPDATE assertion fails |
| Double assign | Unique constraint rejection expected |

Non-blocking gaps (not merge blockers for PROG-03 gate):

1. No dedicated integration assertion for `EVALUATOR_GROWN_DOMAIN_PROVENANCE_REQUIRED` when `rawArtifactRef` is null on a new label (code path exists; grown happy-path uses a real artifact).
2. No TAGGER-basis assign case (BACKFILL is the FR-2.2 hard path and is covered).
3. Architecture §3.9 prose (“not authored until V approves”) is stricter than the goal packet’s provisional-pending requirement; the **lane implements the goal packet** correctly.

---

## Focused test evidence

Command (worktree):

```bash
pnpm exec vitest run \
  tests/unit/evaluator-domains.test.ts \
  tests/unit/evaluator-foundation.test.ts \
  tests/integration/evaluator-database.test.ts
```

Result: **3 files, 20 tests, all pass**, including:

- unit: normalize / exact / near-dup / invalid / stable order / pending 0024 outside runner scan
- integration: domain admission decisions, one-time backfill + append-only refuse, concurrent near-dup serialization
- foundation + FR-0.6 AC5 panel isolation still green

(Log: reviewer scratch `prog-03-tests.log`.)

---

## Binding map (Architecture / Requirements → evidence)

| Obligation | Status | Evidence |
|---|---|---|
| §3.2 domain + admission + question_domain | PASS | 0023 schema + repository writers |
| §3.2 deterministic normalize / exact / near-dup / refuse ambiguous | PASS | `evaluateDomainProposal` + unit/integration |
| §3.2 advisory lock + model cannot direct-insert registry | PASS | dual advisory locks; only repository inserts grown |
| §3.8 append-only on domain tables | PASS | triggers + integration UPDATE refuse |
| §3.9 / FR-1.2 starter seed HITL | PASS | pending 0024 + proposal packet; not production-applied |
| §5.1 landing on `question_domain` only | PASS | `assignQuestionDomain` / README / no memory write |
| §7 row 1A deliverables | PASS | repo + admission + landing + proposal + pending seed |
| FR-1.1 grown provenance | PASS | required artifact + provider/model/version + source run on insert |
| FR-1.3 not `memory.question_key` | PASS | dedicated link only |
| FR-0.1 dark launch / unbound | PASS | no BOUND; no product influence path |
| FR-0.5 / DR-179 no keys | PASS | no key introduction |
| FR-0.6 isolation preserved | PASS | existing differential still green |

---

## Residual notes (non-blocking)

1. Schema CHECK still allows `domain_admission.decision = 'REFUSED'` for future tagger refusal receipts; current pure evaluator only emits the four guardrail decisions — appropriate for this lane (tagger is ticket 04).
2. HITL: V must still approve starter names before 0024 is moved into the top-level migration scan; orchestrator holds that gate.
3. Codex full-suite claim (84 files / 604 tests) was not re-run from this seat; focused domain + foundation + isolation suite is the binding review surface and is green.

---

## Verdict

PROG-03 deliverables for lane 1A are present, binding-aligned, append-only compliant, and covered by honest unit + integration tests that exercise the shipped admission/normalize/repository paths. The starter seed is authored under `migrations/pending/` and is verifiably outside the migration runner scan pending V approval.

REVIEW VERDICT: PASS
