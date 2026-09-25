# Model scorecard and per-role model picker: design (public part)

- **Date:** 2026-09-26
- **Status:** design approved in conversation, section by section, by the owner (V). This written spec is awaiting the owner's review.
- **Base:** `dev` at `bf4e3dde`.
- **Scope:** pieces 1 and 2 of the model-choice programme: the scorecard format, and the engine changes that read it.
- **Companion:** how scorecards are *produced* (the evaluator method) is described in a private companion document. It is deliberately not in this repository.

## In plain words

The engine has no rule today for choosing the best model for a job. Which models take part depends only on the Free or Premium plan: a fixed list of model names in the code. Every model on the list does every job.

This design changes that in three ways:

- A **scorecard file** says, for each debate role, how good each candidate is, how sure we are, what it costs per call and what its known weaknesses are. A candidate is a model version at a specific thinking level.
- The engine's **picker** reads the scorecard when a debate starts and fills every seat. It takes into account:
  - what is reachable right now;
  - the new **model-strength** setting chosen by the user (Economy / Balanced / Best);
  - the plan;
  - the money limit.
- Every model call records what is needed to judge it later: its role, the exact candidate, the actual prompt, the thinking tokens and the real cost.

Two command-line tools let the private evaluator freeze a debate moment and replay it, identically, on any candidate.

The scorecard is a set of results. How those results are produced is private, and nothing in this repository depends on it.

## Why: the situation on `dev` today

| Fact | Where |
|---|---|
| Debaters come from a hard-coded plan roster (Free: `gpt-5.6-luna`, `claude-sonnet-5`; Premium: `gpt-5.6-sol`, `claude-opus-5`, `grok-4.6-build`). Every roster model writes positions, writes support/attack legs, cross-exchanges, sits on the judging panel and reviews. | `packages/contract/src/plan-tiers.ts` (`PLAN_TIER_ROSTERS`); ask admission in `apps/api/src/index.ts` (`ASK_PLAN_TIER_MODEL_UNAVAILABLE`) |
| Only the answer writer (synthesizer) and answer checker (evaluator role) have their own model setting: sealed register rows, which default to the first provider of the first two maker families. | `packages/register/src/algorithm-policy.ts` (`SYNTHESIS_ROLE_CONTROLS`); `apps/runner/src/dev-deployment-register.ts` (`deriveSynthesisRoleRefs`) |
| Prices only stop spending (hosted per-run and daily envelopes); they never choose a model. There is no cost estimate before a run. | `packages/budget/src/cost-envelope.ts` (`assertCallAllowed`); `packages/register/src/cost-envelope-policy.ts` |
| The verdict label is arithmetic over the judges' scores, not a model output. | `packages/serve/src/index.ts` (`deriveHonestVerdict`) |
| Each reply is stored word for word with its model id and a step label, but the prompt is stored only as a hash. The step's role is not a clean field: authoring, panel judging and reviewing all go out as `JUDGE`. Reasoning tokens are not kept. `ledger.model_spend` rows are not linked to calls. | `migrations/0000_s00.sql` (`ledger.raw_artifact`, `ledger.ledger_entry.call_site_key`); `packages/providers/src/index.ts`; `migrations/0066_model_spend_ledger.sql` |
| The gateway sends only the model id, a token ceiling and messages. It has no thinking or effort parameter. | `packages/providers/src/index.ts`; the relays under `acceptance/` |
| The dormant Model Evaluator (mission 2026-08-14) is built but not wired, is locked to `UNBOUND`, and was designed to share out panel seats, not to pick per role. | `packages/evaluator/`, `apps/evaluator-worker/` |

## Owner decisions this design rests on (2026-09-25/26)

1. **A candidate is a model version plus a thinking level.** "Opus 5.5 low" and "Opus 5.5 max" are separate candidates, measured, graded and priced separately. The thinking level is recorded on every call.
2. **A new model-strength control, separate from depth.** It has three settings:
   - **Economy:** the best candidate under a cost cap.
   - **Balanced:** the cheapest candidate that is not clearly worse than the best.
   - **Best:** the top-ranked candidate.

   On the website "cost" means money. On personal subscriptions it means time and usage. Depth keeps its meaning (rounds and seats). Free/Premium stays a hosted pricing rule; for example, Free is capped at Balanced.
3. **Two modes.** On the hosted site, cost matters. In local mode on personal subscriptions, money does not, and the picker chooses the best candidate among the vendors the person has. The open-source engine does the choosing in both modes.
4. **Distribution (option B).**
   - The public repository carries an older scorecard, one version behind the website.
   - The website uses the newest scorecard, and only after the owners approve it.
   - Later, dezbatere.ro will serve the newest scorecard to local installs. That is piece 5, not in scope here.
5. **Tailored prompts are prepared ahead of time**, never generated per debate. They are piece 4, not in scope here. This design only reserves the field.
6. **Architecture (approach 1).** The public engine *runs steps*; the private evaluator *decides what to test*.
7. **Failover.** Each role gets a main model and a backup. The backup takes over if the main model fails or hits a subscription cap, and the answer is marked. This relaxes the earlier "probe, refuse, never substitute" rule for the synthesis roles; the owner approved the relaxation on 2026-09-26.

## Out of scope

- The evaluator method: test questions, traps, grading, scoring. It is private.
- Prompt tailoring (piece 4).
- The dezbatere.ro advisor service and scorecard signatures (piece 5).
- Using real users' debates. That needs the privacy work first: purpose, recipients, opt-in, vendor data agreements.
- Retiring the dormant Model Evaluator. That is a separate later decision.

## Vocabulary

| Term | Meaning |
|---|---|
| **Role** | One of seven debate jobs: `POSITION` (opening answer), `SUPPORT_ATTACK` (supporting and attacking follow-ups), `CROSS_EXCHANGE`, `JUDGE` (panel scoring), `REVIEWER`, `ANSWER_WRITER` (today's synthesizer), `ANSWER_CHECKER` (today's in-debate "evaluator" role, renamed in this vocabulary to avoid confusion with the private evaluator). |
| **Candidate** | An exact, pinned model version, plus a thinking level, plus the access routes it can be reached by (API, and/or a named subscription tool). |
| **Tier** | `TOP` (cannot be told apart from the best), `GOOD_VALUE` (close to the best and much cheaper), `AVOID` (clearly worse), `UNTESTED`. |
| **Model strength** | The user's Economy / Balanced / Best choice. |
| **Scorecard** | The results file described below. |

## Part 1: the scorecard format

The scorecard is a single JSON document. Its schema is published in the public repository, in `packages/contract` or a small new `packages/scorecard`; the plan decides which. The engine validates every scorecard against the schema before using it.

**Header**

| Field | Contents |
|---|---|
| `scorecardVersion` | An integer that only ever increases. |
| `createdAt` | Date of creation. |
| `testSetVersion` | The frozen test set it was measured on. An opaque label; the test set itself is private. |
| `engineCompatibility` | The range of engine versions this scorecard fits. |
| `languages` | For example `ro`, `en`. |

**Candidates**

| Field | Contents |
|---|---|
| `candidateId` | Identifier. |
| `vendor` | The vendor. |
| `modelId` | The exact, pinned model id. Never a "latest" alias. |
| `thinkingLevel` | The vendor's own level name, or `DEFAULT_ONLY` when the level cannot be set. |
| `accessRoutes` | API and/or named subscription tools. |
| `apiPrice` | Input and output price per million tokens, with the date and source. This is informational, for local users; see "Prices" below. |

**Per role, per candidate**

| Field | Contents |
|---|---|
| `tier` | `TOP`, `GOOD_VALUE`, `AVOID` or `UNTESTED`. |
| `quality` | A score from 0 to 100 with a range (low, high). |
| `qualityByLanguage` | Present only when the languages differ. |
| `typicalCall` | Input tokens, output tokens, thinking tokens and seconds. |
| `tags` | Each tag has a `code`, an evidence strength (`STRONG` or `WEAK`) and a one-line plain description. |
| `promptVersion` | `standard` until piece 4 exists. |
| `itemsMeasured` | Number of test items behind the score. |
| `measuredAt` | Date of measurement. |

**Picker settings**, kept in the file so they can be tuned without a code change:

| Setting | Purpose |
|---|---|
| `balancedMargin` | How many points below the best still counts as "not clearly worse". |
| `economyCap` | Per role, a money cost per call (hosted) and seconds per call (local). |
| `planStrengthCaps` | For example `free → BALANCED`. |

**Rules for the file**

- An unknown future field is ignored.
- A missing required field, an incompatible `engineCompatibility`, or a candidate that references an unknown role makes the whole file invalid.
- An invalid file is **refused**. The engine then keeps its current scorecard, or falls back to today's behaviour if it has none, and logs a clear reason. It never crashes and never half-applies a file.

**Where it lives**

- **Public repository:** the one-version-behind file, at a fixed path such as `dialectical-engine/scorecards/current.json`. The plan decides the exact path.
- **Hosted:** the approved scorecard is published as a new version of a sealed register row family, `modelScorecard`, following ADR-0011. It is never an edit. Going back means pointing `REGISTER_VERSION` at the previous version. See `docs/architecture/01-decisions/ADR-0011-register-mechanism-and-resolution-chains.md` and `packages/register/src/register-publication.ts` (`importHistorical`).

**Prices, one source of truth.** On the hosted site, money checks keep using the operator-configured prices (`PROVIDER_DISCOVERY_TARGETS_JSON`, as today). The estimate multiplies the scorecard's *typical call sizes* by those configured prices. The `apiPrice` field is used only in local mode, when no price configuration exists.

## Part 2: engine changes

### 2.1 A clean role on every call

Add a role field, from the vocabulary above, to every model call record. Today the role has to be parsed out of `call_site_key`: `JUDGE`, `JUDGE:defender|critic:…`, `JUDGE:cross-root:…`, `PANEL:…`, `JUDGE:review:…`, `COMPOSER:SYNTHESIZER:…` and `POST_COMPOSE_R9:EVALUATOR:…`. The runner sets the role explicitly. A migration adds the column; the plan decides where it goes, either `ledger.ledger_entry` or the plaintext `metadata_json` of `ledger.raw_artifact`.

### 2.2 Thinking level

- `packages/providers` accepts a per-call `thinkingLevel`.
- Each connection translates it: the vendor's API parameter, or the relay's command-line flag for subscription tools.
- A connection that cannot set it reports `DEFAULT_ONLY`.
- The level actually used is recorded on the call.
- The plan must list, per connection, which levels are settable. It must also check that each relay keeps the tools-off flags it has today.

### 2.3 Per-call records

Every call additionally records:

- the role (2.1);
- the `candidateId`;
- the `scorecardVersion` used;
- the thinking tokens, as a separate counter (today `metadata_json` keeps only four usage counters);
- the call's cost, with `ledger.model_spend` gaining a link to the call's attempt;
- the **actual prompt text**.

The prompt text is debate content. It follows the content-encryption and erasure rules exactly (migrations `0038_content_encryption.sql`, `0040_account_erasure.sql`, `0069_remaining_content_carriers.sql`): encrypted at rest when encryption is on, and destroyed with the debate.

### 2.4 The picker, at ask admission

This replaces the `PLAN_TIER_ROSTERS` filter in ask admission (`apps/api/src/index.ts`).

**Inputs:**
- the active scorecard;
- the healthy, reachable targets (today's discovery and health probe);
- the ask's model strength and depth;
- the plan tier (hosted only);
- the per-run money ceiling (hosted only).

**Output:** a role assignment, pinned on the run next to `discovered_panel`. For each role it lists the seat(s), each with a main candidate and a backup candidate, plus the scorecard version. The assignment is shown in the answer's honesty drawer and kept for audit.

**Rules:**
- Fill single-seat roles (answer writer, answer checker) and multi-seat roles (positions, judges, reviewers) by the strength rule.
- **Fairness rules are kept unchanged:**
  - debaters come from different makers;
  - no model grades its own node (`PRODUCER_GRADING_FORBIDDEN`);
  - reviewers come from a different maker;
  - same-family votes are discounted.
- **New preference:** judges come from makers that are not debating, where enough makers are reachable.
- **Without a scorecard**, or for a role the scorecard does not cover, the picker falls back to today's behaviour for that role and logs it.

### 2.5 The model-strength control

- The ask contract (`packages/contract`) gains `model_strength: ECONOMY | BALANCED | BEST`. The default is set in the scorecard's picker settings, or is `BALANCED` when there is no scorecard.
- The UI shows it next to depth, not replacing depth, `composition_budget_tier` or `risk_tier`.
- The plan cap (for example Free ≤ Balanced) applies in hosted mode only.

### 2.6 Cost estimate before a run

- **Hosted.** The expected money cost comes from the depth's call structure, the scorecard's typical call sizes and the configured prices, using the same structure the run ceiling already uses (`packages/register/src/index.ts`).
  - If it exceeds the per-run ceiling, the picker steps the strength down one notch and says so.
  - If even Economy does not fit, the ask is refused with a clear reason code.
- **Local.** The picker shows an estimated duration instead.

### 2.7 The runner uses the assignment, with a backup

- The runner fills seats from the pinned assignment instead of "every roster model does every job".
- If a main candidate fails its call attempts, or hits a subscription usage cap, the runner switches that seat to its backup. The served answer carries the mark `BACKUP_MODEL_USED`, next to the existing marks such as `DEGRADED-DIVERSITY`.
- If the backup also fails, today's behaviour applies: panel members are dropped with a record, and the synthesis roles refuse.

### 2.8 Scorecard loading

| Mode | Source |
|---|---|
| Hosted | The sealed `modelScorecard` register row. |
| Local | The bundled public file. |
| Later (piece 5) | Fetched from dezbatere.ro. Not in scope here. |

### 2.9 Step replay tools, local and operator only

Two command-line tools. Their exact location, `tools/` or `acceptance/`, is set in the plan.

- **`export-moment`** reads one recorded model call from a local database and writes a *moment file* containing:
  - the role;
  - the prompt-contract hash;
  - the exact inputs the step's prompt builder consumed (question, parent statements, other fenced material);
  - the recorded prompt fingerprint;
  - the recorded reply, for reference.
- **`replay-moment`** takes a moment file and a candidate. It builds the prompt with **the same prompt-builder code the live runner uses**, inside the same safety frame (`packages/providers/src/prompt-frame.ts`), calls the candidate and returns:
  - the reply;
  - the tokens, including thinking tokens;
  - the seconds taken;
  - the outcome;
  - whether its prompt fingerprint matches the recorded one.

Guardrails:
- Both tools refuse to run in the hosted production runtime environment (checked like the other environment guards in `packages/register/src/runtime-environment.ts`).
- They expose no network endpoint.
- Moment files contain debate text. In v1 they are produced only from the owners' own test debates in local databases. The moment files and their test sets are stored in the private repository, never this one.
- For encrypted runs, `ledger_entry.input_hash` is overwritten with random bytes (`0040_account_erasure.sql`), so the fingerprint check needs a fingerprint recorded before that overwrite. This is covered by the prompt record in 2.3.

### 2.10 New subscription connections

Relays for the **Gemini** command-line tool and for **GLM (Z.ai)**, following the existing relay pattern:
- tools off;
- prompt passed by stdin or file rather than argv;
- the program-header guard;
- deduced binaries.

Local mode needs them anyway ([two deployment modes](../../missions/2026-09-01-security-hardening/V-DECISIONS-PACKET.md), ruling V-9c).

## Error handling summary

| Situation | Behaviour |
|---|---|
| Scorecard missing | Today's behaviour, with a log line. |
| Scorecard invalid or incompatible | Refused. Keep the current one, or fall back to today's behaviour, with the reason logged. |
| Candidate unreachable at admission | Skipped. The next candidate by the strength rule is chosen. |
| No reachable candidate for a role | That role uses today's rule, with a warning. |
| Main candidate fails or hits a cap mid-run | Backup takes over; the answer is marked `BACKUP_MODEL_USED`. |
| Backup fails too | Today's behaviour: drop with a record for panel seats, refuse for the synthesis roles. |
| Estimate over the money ceiling | Step down one strength notch and tell the user; refuse if Economy does not fit either. |
| Replay tool run in hosted production | Refuses. |

## Testing

All engine tests use stand-in providers. No real model calls and no subscription usage.

- **Picker.** Table-driven cases (scorecard × reachable targets × strength × plan × ceiling → expected assignment). A property test: no assignment ever breaks a fairness rule. Fallback cases for missing, invalid and incompatible scorecards.
- **Backup.** The main candidate fails, then the backup is used and the mark is present. Both fail, then today's behaviour.
- **Cost estimate.** Arithmetic cases, the step-down, and refusal.
- **Scorecard schema.** Valid, invalid and future-field files. An invalid file is never half-applied.
- **Thinking level.** It reaches each connection; `DEFAULT_ONLY` is reported where it cannot be set; the level used is recorded.
- **Call records.** Role, candidate, scorecard version, thinking tokens, linked cost and prompt text are all written. The prompt text is encrypted when encryption is on and gone after debate deletion, using the S6/erasure suites' patterns.
- **Same prompt.** `replay-moment` on an exported moment reproduces the recorded prompt fingerprint for every role.
- **Replay guard.** Both tools refuse in the hosted production environment.
- **Regression.**
  - The full suite stays at the gate of record.
  - Any migration runs the database integration suites before merge, because the CI gate skips them.
  - Any new numeric shape runs the depth oracle.
- **End-to-end.** One short real debate on the owners' subscriptions, run by the owner.

## Delivery order (for the plan to refine)

1. Scorecard schema and validation, plus a hand-written example scorecard.
2. Role field, thinking level and the per-call records (includes a migration).
3. Step replay tools and the same-prompt test. The private evaluator can start as soon as this lands.
4. Gemini and GLM relays.
5. Picker, model-strength control, cost estimate, backup, and pinning the assignment on the run.
6. Hosted loading via the sealed `modelScorecard` row, and the bundled public file.

## Open items for the plan

- Whether the schema goes in `packages/contract` or a new package.
- Where the role column lives.
- Migration numbering.
- The exact path of the public scorecard.
- Which thinking levels each connection can set (Claude Code, Codex, Grok, Gemini and GLM tools; each vendor API).
- Whether the engine knows a debate's language. If not, the picker uses the combined quality score.
- **Hosted example hazard.** The hosted example vendors in `deploy/vps/register/hosted-register.example.json` use placeholder model ids that match no roster entry. Once the picker replaces the rosters, the example must list real candidate ids.
