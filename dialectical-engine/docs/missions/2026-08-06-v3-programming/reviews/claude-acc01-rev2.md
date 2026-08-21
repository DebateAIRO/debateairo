# CLAUDE review — ACC-01 (DR-126 acceptance harness), rev 2

Seat: CLAUDE (Opus 5 lens), dual-diamond seat 1 of 2. Independent review; the
grok seat's files were not read. My own rev-1 (`claude-acc01-rev1.md`) was
re-read as the baseline for the delta.
Ticket: `t_0dc09131`. Workspace: `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3`, branch `dev`.

## VERDICT

**APPROVED.** All three rev-1 blocking findings are genuinely fixed, and fixed
by the right route — escalation to V (DR-137, DR-138) followed by narrow,
disclosed implementation, not by local reconciliation. I verified each fix twice:
once in the source and tests, and once against the **persisted state of the live
ceremony-2 database**, which independently proves the shipped rules ran on the
real run. No new blocking finding. Two new advisories, one of which materially
affects what the remaining DONE gate can produce and should be read before
TERM-01 is scheduled.

## What I verified myself (not taken from the handoff or the ticket comments)

| Check | Method | Result |
|---|---|---|
| Acceptance suite | `vitest run --config acceptance/vitest.config.ts` | **6 files / 13 tests passed**, 2.38 s |
| Unit + architecture | `vitest run tests/unit tests/architecture` | **44 files / 257 tests passed**, 6.22 s |
| Typechecks | `tsc --noEmit -p acceptance/tsconfig.json`; `-p tsconfig.json` | both exit 0 |
| Audits | `pnpm run lint` | `edgeRowsChecked: 27, violations: []`; source `blocking: []` |
| Dry-run ceremony | `acceptance/ceremony.test.ts` **ran on real embedded Postgres inside my sandbox** — no skip guard, no degraded path | seeds idempotently, POST 202, `executeWorkItem` COMPLETED, owner 200 / foreign 404 |
| Product scope | `git diff --stat -- apps web migrations packages tests` | only `packages/critique/src/index.ts`, `packages/judgement/src/index.ts` and their two test files. `apps/`, `web/`, `migrations/` **untouched** |
| No product→acceptance import | `grep -rn acceptance packages apps web tests migrations tools` | only pre-existing `tools/acceptance-bundle` (S15, unrelated). Clean |
| DR-115 seams | `model-shim.ts:116-117`, `main.ts:97-98` | both `NODE_ENV=test` guards intact after the rework |
| **Live ceremony-2 database** | started the standing DB on `acceptance/.pgdata` read-only and queried `ledger.raw_artifact`, `ledger.ledger_entry`, `core.run`, `core.run_row_activation_event`, `register.register_row` | see below — this is the strongest evidence in the packet and it is all genuine |

Disclosure: to verify item 7 at the data layer I started the standing database
on the existing `acceptance/.pgdata` and ran `SELECT`s only. No row was written,
no seed re-run, nothing else was touched.

---

## Per-delta-item result

### 1 — Judge prompt declares the ruled schema · **VERIFIED FIXED**
`packages/judgement/src/index.ts:71-86`

I checked the prompt field-by-field against the s04 zod contract rather than
against the handoff's summary:

| Prompt line | Contract | Match |
|---|---|---|
| `statement` … `value_laden` | `judgeArtifactSchema` (`index.ts:19-24`) | exact, incl. `locator` nullable |
| `claim_type` closed vocabulary | `CLAIM_TYPES` (`packages/kernel/src/index.ts:22-25`) | all 8 members, exact order |
| `steelman` / `critic` / `evidence` / `context` | `judgeAssessmentSchema` (`s04.ts:89-98`) | exact, incl. `basis` enum and every `[0,1]` bound |
| `fallacy.fatalFlags[]` = `{type, severity, description}` | `fatalFlagSchema` (`s04.ts:85-87`) | exact — this is the field that failed live |
| "Arrays may be empty, but every string must be non-empty" | `z.array(z.string().trim().min(1))` | correctly disambiguates `ambiguityFlags` |

**Parser untouched**: the diff on this file is the prompt string and nothing
else — `classifyContent`, both `parseStructuredArtifact` calls, the two
`TypedDomainError` throws and `s04.ts` are byte-identical. No coercion, no
repair, no schema-feedback retry smuggled in.

**RED used the observed wrong shape**: `tests/unit/judgement.test.ts:80-82` — the
double returns `{detected, type, explanation}` (the exact live-ceremony-1 shape)
unless all twelve schema fragments are present in the system prompt. That is a
real red-before-green, not a string-presence assertion dressed up as one.

**Live proof, read off the database, not the log**: the single persisted
artifact for run `3f6a0f6e` carries `parse_status: PARSED`, and its content is a
schema-perfect ruled artifact — including `"fallacy": {"severity": 0,
"fatalFlags": []}`, the precise shape that failed before. Zero
`JUDGE_SCHEMA_FAILURE` is confirmed at the data layer.

### 2 — B1, shipped readers restored · **VERIFIED FIXED**
`acceptance/main.ts:101, 107-114`; `acceptance/runtime-policy.ts:118`

`readDeploymentMakerCapability` is called at the boot prerequisite and as
`resolveDeploymentMakerAvailability`; `resolveRunCostEnvelopeBasis` is called on
the row read by the shipped `readRunCostEnvelopePolicy`. Both acceptance-local
look-alikes are gone. The `NoopDispatcher` (`main.ts:49-53`) is once again the
**only** substitution at the composition root, which is exactly what the ticket
authorized.

Verified live rather than structurally: `core.run.envelope_basis` for run
`3f6a0f6e` is

```json
{"max_model_attempts":9,"register_row_key":"runCostEnvelope","register_version":1,
 "source_ref":"acceptance:DR-138:V-approved",
 "derived_from":{"depth_params":{"depth":1},"risk_tier":"standard"}}
```

The `derived_from` key is emitted only by the shipped
`resolveRunCostEnvelopeBasis` (`packages/register/src/index.ts:224-233`). The
live pass therefore demonstrably went through the shipped budget rule. The
run was admitted at standard tier against a register row of
`requiredDistinctMakers: 1`, which likewise can only happen through the shipped
capability reader plus the DR-137 admission edit.

The structural guard in `runtime-policy.test.ts:28-40` is string-matching and so
a little brittle, but it is aimed precisely at the two regressions I raised and
it does its job.

### 3 — B2 / DR-137, tier-aware maker floor · **VERIFIED FIXED**
`packages/critique/src/index.ts:267, 297-298, 324-338`

The implementation matches DR-137's text, which I read in the ledger
(`decisions-ledger.md:528-538`) rather than taking the packet's paraphrase:

- capability is derived, never asserted — `deploymentMakerCapability =
  configuredMakers.length >= requiredDistinctMakers` (`:285`) reading the honest
  seeded row. `grep` confirms no `deploymentMakerCapability: true` literal
  survives anywhere.
- the `>= 2` anti-monoculture floor now lives at admission and applies to
  high-stakes only (`:330-332`), computed from the actual distinct
  `configuredMakers` rather than from the declared requirement — which is the
  stricter and more honest of the two available readings.
- casual/standard admit a capable single-maker deployment.

**Both RED directions existed.** Before the edit, `critique-s08.test.ts:127`
threw `CONFIGURED_PROVIDER_SET_INVALID` at the reader (row rejected outright),
and `:138` did **not** throw at all (old `assertMakerAdmission` checked only
`deploymentMakerCapability`). Both new tests were therefore genuinely red, and
both post-fix behaviours are asserted.

Blast-radius check I ran because a shipped floor was relaxed:
`evaluateMakerAvailability`, `applyCriticUnavailableCap`,
`computeIndependenceReceipt`, `buildBlindedCritiquePacket` and
`planBlindVerification` have **no production callers** — the S08 surface is
library-only today. `assertMakerAdmission` (`apps/api/src/index.ts:255`) is the
single live consumer, so the change cannot leak into unreviewed behaviour. The
DB integration fixture (`tests/integration/critique-database.test.ts:56`) seeds
`requiredDistinctMakers: 2` and is unaffected. DR-137 also anticipated the
disclosure question directly ("a mono-model answer is visibly mono-model"), so
the dormant `SINGLE-LINEAGE` mark is a ruled matter, not an omission.

### 4 — B3 / DR-138, ruled run-level budget · **VERIFIED FIXED**
`acceptance/seed-register.ts:9, 101-112`; `acceptance/runtime-policy.ts:38-45, 108-112`

The synthesized sum is gone — no `totalAttempts`, no `reduce`, nothing deriving
the cap. `runCostEnvelope` is now the shipped `RUN_COST_ENVELOPE_POLICY` member
shape carrying `max_model_attempts: 9` under its own true provenance
`acceptance:DR-138:V-approved`, and `readAcceptanceRuntimePolicy` *enforces*
that provenance split (`:108-112`) instead of merely writing it. The DR-133
per-organ bounds are preserved byte-faithfully under the acceptance-only
`acceptanceOrganCostBounds` key, which also resolves most of my rev-1 advisory
A1: `runCostEnvelope` and `configuredProviderSet` are now both shipped-reader
compatible.

Confirmed in the live database: `runCostEnvelope` persisted with
`source_ref: acceptance:DR-138:V-approved`, `acceptanceOrganCostBounds` with
`acceptance:DR-133:V-approved`. No provenance is borrowed anywhere.

**Hash freshness** (`seed-register.ts:197-211`): after the
`ON CONFLICT DO NOTHING` insert, every row is read back and compared on both
canonical value and `source_ref`, raising
`ACCEPTANCE_REGISTER_CONFLICT:<row_key>` on drift, with the version row checked
for count and seal. My rev-1 A2(2) is properly closed. The live DB carries the
post-fix judge hash `8e071c51…`, which matches the current shipped prompt text —
the fresh `.pgdata` reset was really performed.

### 5 — Handoff QUESTIONS FOR V corrected · **VERIFIED FIXED**
`ACC-01-codex-handoff.md:360-371` now reads "asked and ruled", records B2→DR-137
and B3→DR-138 explicitly, and does not overstate closure: it keeps the 64-WAIT
product-truth risk open under TERM-01 and states plainly that this is "not
permission to use the test blanket."

### 6 — Scope hygiene · **VERIFIED, with one correction to the packet**
The packet says the production diff is only the two authorized files plus their
tests. The actual working tree also carries `package.json` and `pnpm-lock.yaml`
— a root workspace link to `@debateai/critique`, required because
`acceptance/main.ts` imports it. It is not product code, it is necessary, and
the worker **disclosed it** at `ACC-01-codex-handoff.md:115-116`. Not a defect;
noted so the record is exact. Nothing else drifted.

Suite numbers: I measured acceptance at **13** tests, not the 12 quoted in the
packet and the REWORK READY comment — the count grew with the ceremony test now
running in-sandbox. More coverage than claimed, in the safe direction.

### 7 — Live ceremony-2 evidence · **VERIFIED as stated in the packet**, and see N1/N2
`handoffs/ACC-01-live-ceremony2.log`

Everything the packet asks me to confirm, holds:

- **Fresh `.pgdata`** — the log shows `creating directory …/acceptance/.pgdata`
  and a full `initdb`, so the new hashes were seeded cleanly.
- **A real model call succeeded.** `ledger.raw_artifact` holds one row:
  `provider_ref acceptance:codex-cli`, `provider openai-compatible-http`,
  `model_id gpt-5.6-sol`, **`maker OpenAI`** (never "shim" — DR-115 holds on the
  wire), `parse_status PARSED`. The raw text is a genuine chat-completion
  envelope wrapping a schema-valid judge artifact. Nothing about it is canned.
- **The refusal is the ruled outcome.** The throw is at `main.ts:65`, reached
  from `apps/runner/src/index.ts:622` — and `drainWaitsForCompletion` is called
  *after* the evaluator, so nothing could have been mutated before the throw.
- **All 64 WAIT rows preserved.** The log names exactly 64 distinct ids (56 `Q`,
  8 `R`), and the database confirms 64 rows still in `WAIT` — alongside 3
  `ACTIVE`, 1 `INACTIVE` and 3 `POLICY_BLOCKED` that were honestly evaluated.
  No fabricated transition exists anywhere in the run.

**No fabrication anywhere in the path.** Confirmed at source, seam and data.

---

## NEW findings

### N1 — ADVISORY (act on this before TERM-01) · the default ceremony question cannot produce a composed debate
`acceptance/run-acceptance.ts:65`; `README.md:47`

The live run made **exactly one** model call — the ledger holds one `MODEL_CALL`
and one raw artifact for the whole run. The composer and the conformance organ
never executed. The reason is in the artifact the real model returned:

```json
"statement": "No proposal was supplied, so its strongest supporting case cannot be
              identified without inventing details.",
"restatement_status": "FAIL"
```

The default question is `What is the strongest case for adopting this
proposal?` — it refers to a proposal it never supplies. The model behaved
impeccably (it refused to invent one, which is precisely the law), the judge
parsed clean, and `runServeGateChain` then took its first gate honestly:
`GATE1_R9_BLOCK → COMPONENTS_ONLY_DEFECT` (`packages/serve/src/index.ts:419-421`)
returns before any `compose()` call.

Consequence worth stating plainly: **TERM-01 alone will not deliver the DR-126
"served and rendered" gate.** Even with a real terminal evaluator, this question
yields a components-only defect, not a composed verdict — the composer and
conformance organs would still never be exercised by the live pass. The remedy
is a one-line default: a self-contained question that carries its own subject.
This is not a defect in the code under review, which is why it is advisory, but
it is the difference between the next ceremony passing and repeating.

### N2 — ADVISORY · the ceremony-2 evidence record overstates the traversal
The `LIVE CEREMONY 2 RESULT` ticket comment states the run "traversed
judge/composition/conformance/propagation and reached terminal." The ledger
records `JUDGEMENT_SCHEDULED`, one `MODEL_CALL`, `PROPAGATION` — and one
`reduced_judgement`. Composition and conformance did not run (N1). The worker's
handoff does **not** make this claim (it predates the ceremony), so this is a
correction to the orchestrator's evidence record, not a finding against ACC-01.
Worth fixing before it hardens into the S15 attestation.

## Carried-forward advisories from rev 1 (all still advisory, none blocking)

- **A1 residual**: `livenessPolicy` (`members[]` vs shipped `classes{}`) and
  `convergenceEpsilon` (bare number vs `{kind, epsilon}`) remain
  shipped-reader-incompatible under shipped ruled row keys. Draft-faithful and
  therefore correct, but the README documents the `runCostEnvelope` split only —
  one more sentence would close it.
- **A2(2) partly closed**: the `.pgdata` reset is documented in the handoff
  (`:345`) but not in `acceptance/README.md`, which is where an operator looks.
- **A3**: `main.ts:123` still hardcodes `gpt-5.6-sol` instead of importing
  `ACCEPTANCE_MODEL` from `model-shim.ts`.
- **A4**: the ruled `tokenCeiling: 2048` still constrains nothing on the real
  transport — the shim drops `max_tokens`. Worth one honesty line.
- **A6**: `acceptance/**` remains outside the default `pnpm test` include.
- **A7**: local embedded-PG password literal, `standing-db.ts:8`. Loopback only.

## Dimension-by-dimension result

1. **DR-115 ABSOLUTE — PASS.** Both test-only seams still guarded; the live
   artifact carries `maker: OpenAI` from config; no canned or fallback
   completion on any runtime path; the strict parser was tuned around, never
   loosened.
2. **DR-135 — PASS.** Refusal is the live default, fired correctly, and all 64
   WAIT rows are demonstrably untouched in the database.
3. **AC-76/DR-039 + DR-136/137/138 — PASS.** The rev-1 gap is closed by
   escalation, not derivation. Every enforced value now traces to a ruled row
   with true provenance, and provenance is enforced at read time.
4. **PRODUCTION DIFF (amended dimension) — PASS.** Both edits are within their
   narrow authorizations, both are TDD-covered in both directions, and the
   critique relaxation has exactly one live consumer.
5. **SCOPE BOUNDARY — PASS.** `apps/`, `web/`, `migrations/` untouched; no
   product→acceptance import; the lockfile delta is disclosed.
6. **SOLID/DDD/patterns — PASS.** P1 rule 6 is now satisfied — the two
   re-implemented rules are called across the declared edge. P3, P8, P13, P17
   hold as in rev 1.
7. **TDD — PASS.** Reproduced green myself: 13/13, 257/257, two clean tscs,
   lint 27/0.
8. **Honest reachability + S05 ownership — PASS.** Re-confirmed; the ownership
   200/404 proof ran on real Postgres in my own sandbox.

## Closing note

My rev-1 complaint was that at three points where the ruled value-set collided
with shipped engine law, the harness reconciled the collision itself instead of
stopping and asking. All three were re-routed through V and came back as DR-137
and DR-138, and the implementations are faithful to the ledger text rather than
to a convenient reading of it. The judge-prompt fix is the highlight: a real
model, given the declared contract, returned a byte-valid ruled artifact on the
first attempt — and then honestly refused to invent a proposal that was never
supplied, which the serve gate caught and the DR-135 evaluator refused to paper
over. Three independent honesty mechanisms fired correctly on one live run. That
is the system working.

The one thing I would not want lost: N1. The remaining live gate is blocked by
two things, not one, and only TERM-01 is currently on the board.

CLAUDE REVIEW: APPROVED — ACC-01 (rev 2)
