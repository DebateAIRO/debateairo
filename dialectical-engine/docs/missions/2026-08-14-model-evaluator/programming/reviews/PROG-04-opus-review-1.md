# PROG-04 — Opus reviewer A, review 1 (codex/eval-04-tagger @ c15690f)

Reviewer: Opus (reviewer A), 2026-08-15. Read-only review of
`git diff dev...codex/eval-04-tagger` in
`/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-04-tagger`.
Binding docs: Architecture §4/§5/§7 (tier-2 row)/§8, Requirements §2 + FR-0.x,
goal packet `PROG-04-codex-tagger.md`.

## VERDICT: REWORK

Two blockers, both from one root cause: evaluator tagger calls are bound to the
**product run's model-attempt budget bucket**, so a successful tag consumes the
serve envelope and a failed tag can permanently exhaust the tag retry budget.
Everything else in the lane is solid — the three carry-forwards are genuinely
closed, memory-no-op holds, FR-0.6 AC5 is green, and the test claims are honest.

---

## 1. Blockers

### B1 (blocking) — a tag call consumes the product run's pinned cost envelope; tagging can gate serving

`runEvaluatorQuestionTagger` calls the gateway with the **product run id**
(`packages/evaluator/src/index.ts:885`, `runId: input.runId`), and the gateway
appends an `action_kind='MODEL_CALL'` ledger entry per attempt bound to that
run (`packages/providers/src/index.ts:321-341`, and one per failed attempt in
its catch at ~348-366).

The product envelope guard counts **every** `MODEL_CALL` entry for the run,
with no call-site or provider exclusion:

```
// packages/budget/src/index.ts:237-244
SELECT count(*)::text AS count FROM ledger.ledger_entry
WHERE run_id = $1 AND action_kind = 'MODEL_CALL'
```

`assertModelAttemptAllowed` refuses at `>= basis.maxModelAttempts`
(`packages/budget/src/index.ts:256-263`), and the runner calls it before every
product provider call (`apps/runner/src/index.ts:2009`). `max_model_attempts`
is derived by the DR-181-v1 structural-ceiling formula from panel size, depth,
organs and retries only (`packages/register/src/index.ts:183-186`) — it budgets
nothing for evaluator calls.

Consequence: once the tagger runs live on a run, that run reaches
`RUN_COST_ENVELOPE_EXHAUSTED` one (or more) attempts earlier. Tagging then
degrades or blocks serving. This contradicts:

- packet deliverable: "tagging is enrichment, never a gate on serving";
- FR-2.2 AC2 ("No hard dependency from serve success on tagger success" — here
  the dependency is the reverse direction and worse: a *successful* tag harms
  the serve path);
- packet constraint "do not alter non-evaluator behavior".

Note the failure mode is not the classic non-gating one the lane tested; the
lane's container-down/refusal tests are about the tagger's own result, and both
integration and unit tests inject stub gateways with no budget wrapper, so no
test can see this.

Same root cause, second-order consequences worth ruling on at the same time:

- `packages/liveness/src/index.ts:305-322` partitions `ledger.raw_artifact` by
  `(run_id, provider_ref)` and creates a product `core.revision_trigger` for
  ANSWER/NODE subjects on a `model_version` change. Ask-time tag + later
  reconciliation on the same run with a different local vLLM version fires a
  **product revision trigger**.
- `packages/serve/src/index.ts:1520-1527` returns every ledger entry for the run
  (including `actor_ref='provider:evaluator-vllm'`) in the asker-visible
  execution-ledger digest. Architecture §4.2 permits "explicitly evaluator
  call-site artifacts" in product artifacts, so this may be intended — but it
  changes a product response payload and should be ruled explicitly, not
  arrived at silently.

Acceptable fixes (any one, with a test): exclude evaluator call-site keys /
evaluator provider refs from `countRunModelAttempts` (matches Architecture line
95's "call-site prefixes for tagger/add-on/consumer are excluded" principle);
or give the evaluator worker a composition whose ledger writes are excluded
from the product envelope; or an explicit architecture escalation + note if the
mission decides evaluator calls legitimately draw on the product ceiling.

### B2 (blocking, conditional on composition) — "reconcile later" cannot succeed under the production gateway

The tagger uses a per-run constant `subjectItemId` (`evaluator:tag:${runId}`),
a constant `contractHash` (sha256 of `evaluator-domain-tagger/v1`) and a
constant `callSiteKey` (`evaluator.tag-question.v1`)
(`packages/evaluator/src/index.ts:886-891`). `createPostgresProviderGateway`
computes remaining attempts from exactly that tuple:

```
// packages/ledger/src/index.ts:517-531 (countModelAttempts)
WHERE run_id=$1 AND subject_item_id=$2 AND action_kind='MODEL_CALL'
  AND contract_hash=$3 AND call_site_key=$4
// apps/runner/src/index.ts:2010-2019
remaining = request.bound.maxAttempts - consumed; if (remaining <= 0) throw CALL_BUDGET_EXHAUSTED
```

A container-down ask-time attempt still appends a FAILED `MODEL_CALL` entry, so
`consumed >= 1` forever. With the registered `bound.maxAttempts` (1 in every
fixture in this lane) the reconciliation pass throws `CALL_BUDGET_EXHAUSTED`
before reaching the container — the run stays untagged permanently. The lane's
integration test "keeps a container-down ask untagged and reconciles it later"
(`tests/integration/evaluator-database.test.ts`) passes only because it injects
a bare stub gateway; it does not exercise the attempt accounting it depends on.

This is conditional on which gateway the worker composition supplies (the lane
deliberately defers composition, and `apps/evaluator-worker` cannot build a
persisting gateway today — it depends on db/evaluator/providers/pg only). But
the *only* persisting gateway in the repo is the one that breaks it, and the
reconciliation entry point is a lane deliverable. Fix: vary the tag attempt
identity per reconciliation pass (e.g. attempt-scoped `subjectItemId`), or
scope the evaluator's attempt accounting outside the product bucket as in B1.

---

## 2. Axis findings (non-blocking)

### Axis 1 — deliverables vs the tier-2 lane row: substantially met

- Ask-time classifier reads raw question + seeded registry and prompts with
  `{domain_id, canonical_name}` pairs; strict discriminated-union JSON contract
  (`SELECT_EXISTING` / `PROPOSE_NEW` / `REFUSED`) with `classifyContent`
  hooked into the gateway so schema failures are typed at the artifact.
- Existing-domain match lands through `admitExistingDomainSelection` with its
  own `MATCHED_EXISTING` receipt; new proposals go through the unchanged
  deterministic `evaluateDomainProposal` guardrails (the model still cannot
  insert a registry row directly, per Architecture §3.2).
- Question-domain landing is the evaluator-owned singular link only; the
  reconciliation path reuses the same classifier with `assignment_basis`
  `BACKFILL` — matching Architecture §3.2 "backfill is a first insert".
- Non-gating failure: isolation refusal, provider failure, model refusal,
  admission refusal and post-call execution failure all return typed
  `UNTAGGED` and write a typed pipeline receipt. Good.

Gaps:

1. **Timeout has no dedicated test and no distinct receipt.** The packet's merge
   gate names container-down / refusal / **timeout**. The gateway distinguishes
   `TIMED_OUT` from `FAILED` (`ProviderCallFailedError.lastOutcome`), but the
   tagger's bare `catch {}` (`packages/evaluator/src/index.ts:967`) discards it
   and collapses everything into `TAGGER_PROVIDER_FAILED`. Architecture §4.3
   asks for typed timeout outcomes on the vLLM path. Add a timeout case and
   carry `TIMED_OUT` into the receipt reason.
2. **Invalid model output is reported as `TAGGER_EXECUTION_FAILED`.** The README
   claims "invalid content ... produce typed pipeline receipts", but a
   schema-failed response (a `ProviderContentUnacceptedError`, or a
   `parseTaggerDecision` throw) lands in the generic execution bucket because
   `stage` flips to `EXECUTION` immediately after `provider.call` returns. The
   distinction is worth keeping in the receipt reason.
3. **Re-tag of an already tagged run has no typed path.** `question_domain.run_id`
   is UNIQUE and `evaluator_pipeline_one_success` is a partial unique index on
   `(run_id, pipeline, pipeline_version) WHERE state='SUCCEEDED'`; a second
   successful pass therefore surfaces as `UNTAGGED / TAGGER_EXECUTION_FAILED`
   rather than a typed `ALREADY_TAGGED` skip. Non-gating, but noisy and
   untested.
4. `runEvaluatorQuestionTagger` throws (not returns UNTAGGED) for blank
   runId/question/provenance and if the initial STARTED receipt insert fails.
   Acceptable for a worker task, but worth stating: the non-gating guarantee is
   "the caller must be a worker", not "this function never throws".
5. Carry-forward for lane 05: harvest must exclude call-site prefix
   `evaluator.` from author/reviewer populations (Architecture line 95). The
   prefix chosen here (`evaluator.tag-question.v1`) is sensible but is not yet
   registered anywhere as an excluded prefix.

### Axis 2 — the three MANDATORY carry-forwards: all genuinely closed

1. **Blank-proposal guard.** `admitProposal` now canonicalizes first and, when
   the canonical name is empty, writes a `REFUSED` receipt with reason
   `EVALUATOR_DOMAIN_PROPOSAL_BLANK` and returns a typed result instead of
   escaping as a raw DatabaseError. Artifact-identity assertion still runs on
   that path. Proven by a persisted integration assertion that reads back
   `proposed_name='   '`, `normalized_name=''`, `decision='REFUSED'`. Real.
2. **REFUSED and select-existing paths.** `recordRefusal` and
   `admitExistingDomainSelection` both exist, both validate identity, both write
   receipts; the selection path resolves the id against `evaluator.domain` and
   throws `EVALUATOR_DOMAIN_SELECTION_UNRESOLVED` on a hallucinated id (so
   "Never invent an existing domain id" is enforced in code, not only in the
   prompt). Covered by unit + integration tests.
3. **Isolation assert on the tagger path.** `assertEvaluatorProviderIsolation`
   runs before the provider call, its failure produces a FAILED receipt and
   `TAGGER_PROVIDER_ISOLATION_FAILED`, and the unit test asserts
   `gateway.call` was **not** called — a genuine observed-boundary test, not a
   return-value assertion. Also a real maker cross-check on the response
   (`EVALUATOR_TAGGER_MAKER_MISMATCH`).

Note on 1: the receipt is only insertable because migration
`0025_evaluator_domain_refusal_receipts.sql` **relaxes the Architecture §3.2
DDL** (`proposed_name`/`normalized_name` nonblank become
`decision='REFUSED' OR ...`). The change is minimal, replay-safe
(`DROP CONSTRAINT IF EXISTS` with the correct auto-generated constraint names
from `0023`), and disclosed in the self-report — but it is a divergence from a
binding architecture DDL, made without an architecture note or Open-question
escalation. A sentinel `proposed_name` would have avoided it. Hermes/architect
should ratify the relaxation or require the sentinel; not a blocker on its own.

### Axis 3 — memory-no-op: verified

`grep` over `packages/evaluator/src` and `apps/evaluator-worker/src` finds no
occurrence of `question_key`, `question_type`, or `declared_field`. The
integration test seeds a `memory.question_key` row, snapshots `SELECT *` before
and after a successful tag, and asserts row equality — a byte-for-byte no-op
proof, not a spot check. Landing is `evaluator.question_domain` only. FR-1.3
ACs 1/3/4 hold.

### Axis 4 — FR-0.6 AC5 differential: green and untouched

`tests/integration/evaluator-database.test.ts` "FR-0.6 AC5 persisted
panel-isolation differential" is unmodified by this lane and passes in my own
run. Panel membership, `agent_count` and structural `envelopeBasis` inputs are
untouched by tagging — with the caveat in B1 that envelope *consumption*, not
the pinned basis, is affected.

### Axis 5 — BOUND / DR-179 / product behavior

- No `BOUND` state anywhere in the diff; the only occurrence of the string is a
  README sentence reasserting `UNBOUND`.
- DR-179 clean: no api key, token, authorization header, or cloud endpoint
  introduced; the tagger routes through the pinned local family providerRef.
- Committed paths are evaluator-only (evaluator package/worker, migration 0025,
  evaluator README, evaluator tests, lockfile). No `apps/api`, runner, critique,
  memory or serve source touched.
- **However** — see B1 — "no product behavior change" is not fully true at the
  persisted-effects level: evaluator MODEL_CALL entries on a product run_id are
  read by the budget envelope, liveness version-trigger detector, and the
  asker-visible serve execution-ledger digest.

### Axis 6 — test honesty: confirmed, all claims reproduce

Everything below was run by me in the worktree, not taken from the self-report:

| Check | Result |
|---|---|
| `pnpm typecheck` (`tsc --noEmit`) | PASS, clean |
| `npx vitest run tests/unit/evaluator-tagger.test.ts` | 5/5 PASS |
| `npx vitest run tests/integration/evaluator-database.test.ts` | 13/13 PASS (incl. FR-0.6 AC5 differential) |
| `npx vitest run tests/unit tests/architecture` | 69 files / 491 PASS |
| `npx vitest run` (full) | 85 files / 619 PASS |
| `pnpm lint` (`audit:architecture` + `audit:source`) | PASS — 27 edge rows, `violations: []`, `blocking: []` |

The self-report's numbers (619 tests / 85 files, audits clean) match exactly.
No skipped, `.only`, or tautological assertions found in the new tests; the
isolation test asserts a non-call, and the blank-receipt test reads persisted
columns back. The one honesty gap is not in the numbers but in scope: the
"reconciles it later" integration test asserts a flow that the production
gateway would refuse (B2), and no test exercises the tagger against a
budget-wrapped gateway.

---

## 3. What a passing rework needs

1. Break the tag call's coupling to the product run's model-attempt budget, or
   land an explicit architecture ruling that it is intended — with a test that
   shows a tagged run's remaining product attempts are unchanged (B1).
2. Make the reconciliation pass survivable under `createPostgresProviderGateway`
   attempt accounting, with a test that uses that accounting rather than a bare
   stub (B2).
3. Nice-to-have in the same pass: a timeout case with a `TIMED_OUT`-distinct
   receipt reason, and stop swallowing the typed error in the bare `catch {}`.
4. Flag migration 0025's DDL relaxation to Hermes/architect for ratification.
