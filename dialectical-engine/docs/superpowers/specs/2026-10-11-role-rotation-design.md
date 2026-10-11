# Per-debate rotation of the four fixed roles: design

- **Date:** 2026-10-11
- **Status:** design approved by the owner (V) in chat on 2026-10-10, together with this spec and its plan ("write the spec, then build the plan and implement the plan; no need to come back for approval at each step"). Anything here that goes beyond the approved design, or needs a product decision, is listed in "Questions for the owner" at the end, with the default this spec builds.
- **Base:** `dev` at `5109a5501`.
- **Scope:** the four roles one debate gives to single models: the answer writer (today's synthesizer), the answer checker (today's in-debate evaluator), the story writer (storyteller) and the story checker. How they are picked per debate, pinned, recorded, priced and shown.
- **Plan:** `docs/superpowers/plans/2026-10-11-role-rotation.md`.

## In plain words

Today four jobs in every debate always go to the same models, fixed in the settings: on the preview, GLM writes the answer and the story, and one model checks both. Nobody else ever gets those jobs, so we learn nothing about how the other models would do them.

After this change, when a debate has models from two or more companies, each of the four jobs goes, for that debate, to the model on that debate's own panel that has done that job least often so far. Ties are broken by a fixed shuffle drawn from the question, so the same question with the same history always gets the same roles. A checker always comes from a different company than the writer it checks, for the answer and for the story. The story's two jobs are picked separately from the answer's two jobs.

The choice is made once, when the debate is accepted, and written down for that debate in a new record that is never changed. Retries, resumes and restarts read that record, so a debate never changes roles half-way. The record also keeps, for later learning, which model did which job, and the story keeps whether its writer needed a second "please fix your format" try.

It is switched on by one new setting. Without that setting everything works exactly as today. A debate whose panel has only one company keeps today's fixed roles.

The money check before a debate starts prices each job at the dearest model that could get it, so rotation can never make a debate need more than its day's pot. Measured with the preview's numbers, every combination still fits (see "Money").

## Why: the situation on `dev` today

| Fact | Where (at `5109a5501`) |
|---|---|
| The answer writer and checker are two sealed register rows, `synthesizerRoleRef` and `evaluatorRoleRef`, in the `SYNTHESIS_ROLE_CONTROLS` family. Every key of the family is required: a missing key refuses the version. Equal refs only print a warning. | `packages/register/src/algorithm-policy.ts:53-64` (keys), `:286-295` (built), `:404-413` (schema), `:480-520` (`readFamily`), `:601-637` (`readSynthesisRoleControls`, warning `:611-618`) |
| The story's two roles are register rows copied from the writer and checker refs when the register is built. A wholly absent story family means "no story"; a partial one is refused. | `packages/register/src/story-policy.ts:40-48`, `:108-117`, `:157-171`, `:272-273` |
| The runner reads the role rows once at boot, not per claim; a register change needs a restart. | `apps/runner/src/main.ts:98`, `:450`; `apps/runner/src/index.ts:7087` |
| A role provider absent when a debate is claimed refuses the debate for good (J24); a role ref never names an unconfigured provider (checked before the claim). | `apps/runner/src/index.ts:4300-4314`, `:4816-4848` |
| Off-panel role refs are health-checked at every claim. | `apps/runner/src/index.ts:4755-4806` |
| The story takes its roles from the scorecard assignment's answer seats when one is pinned, else from its register refs. | `apps/runner/src/index.ts:8116-8135`; `apps/runner/src/story-snapshot.ts:127-149`; `packages/story/src/writer.ts:454-459` |
| The cheaper-model fallback for the answer roles picks among the debate's claim-eligible members only; the checker avoids the writer's provider ref (not its maker) but may still land on it last. The story checker likewise avoids the storyteller's ref. | `apps/runner/src/index.ts:2410-2441`, `:2486-2516`; `packages/story/src/writer.ts:519-563` |
| The served answer's "different checker" honesty mark compares provider refs, not makers. | `packages/serve/src/index.ts:653-661` |
| The scorecard picker (hosted only; the preview refuses a scorecard) pins a whole `RoleAssignment` in `core.run_role_assignment`; doing that sets `seatBook.assigned` and changes the judge, review and 80-20 paths. | `packages/scorecard/src/picker.ts:173-215`; `migrations/0090_model_scorecard.sql:259-286`; `apps/api/src/index.ts:4194`; `apps/runner/src/main.ts:177-179` |
| The start-of-debate estimate prices the four roles at the boot register's models, adds health checks for role refs not on the panel, and holds unfinished debates at the boot roles. | `apps/api/src/preview-budget-estimate.ts:399-401`, `:544-558`, `:629-632`, `:650-655`, `:1010-1054` |
| Only GLM-5.3-Flash answers in JSON mode on the preview; the storyteller asks for JSON mode as a preference and gets one repair try on the preview. Whether the repair was used is visible today only as a FAILED ledger row. | `packages/providers/src/preview-models.ts:130-145`; `packages/providers/src/index.ts:1598`, `:2050-2096`; `packages/providers/src/preview-test.ts:227-242`; `packages/story/src/writer.ts:262-268` |
| No per-run record of "who did which role" exists outside scorecard runs. The ledger has per-call rows, but they count retries and loop rounds and are erased with an account. | `migrations/0090_model_scorecard.sql`; `apps/runner/src/index.ts:7408-7415`, `:9361-9374` |

## Owner decisions this design rests on (2026-10-10)

1. Four roles, picked separately per debate, from that debate's own discovered panel, for every debate whose panel has two or more makers (free GLM + DeepSeek, premium, the five-AI panel). A checker is always from a different maker than its writer, for the answer and for the story. A one-maker panel keeps today's fixed roles. Story roles rotate independently of the answer roles.
2. "Balanced over time": each role goes to the eligible model that has done that role least often so far on this deployment, counted from the new per-run record. Ties are broken by a fixed, repeatable shuffle seeded from the ask. Picked at admission, before the start-of-debate estimate, then pinned once for the debate (append-only, never changed).
3. A new append-only per-run record (writer, checker, storyteller, story checker: refs and makers; rule version; created time), in one migration. The story records whether its writer needed the repair pass, countable per storyteller model.
4. One new additive register row turns rotation on. The four existing role rows stay as the fallback; sealed versions keep parsing; without the row, behaviour is exactly today's. The preview publish kit and the hosted publish checks gain the row.
5. The estimate prices each role at the dearest model that could get it (per gate). The boot and admission checks require every model a rotation can pick to be switched on in its gate. The debate page keeps showing who wrote and checked, with the actual rotated models; end-user text shows no internals. The depth 1-3 room table is re-pinned.
6. Out of scope: the strength choice, the scorecard/evaluator matrix (rotation must hand over cleanly to the scorecard picker later), reviewers (PR #131).

## Vocabulary

| Term | Meaning |
|---|---|
| **Role** | One of `ANSWER_WRITER`, `ANSWER_CHECKER`, `STORYTELLER`, `STORY_CHECKER`. The first two are the scorecard vocabulary's names (spec 2026-09-26); the story names are new. |
| **Maker** | The company that makes a model: `DiscoveredPanelMember.maker` (`packages/db/src/index.ts:1482-1488`), the same value as the preview row's `maker` (`packages/providers/src/preview-models.ts:32`). On the preview: Z.AI (GLM), DeepSeek, Xiaomi (MiMo), Alibaba (Qwen), Anthropic (Haiku). |
| **Eligible member** | A member of the debate's discovered panel. The panel is deduplicated by maker, first member in panel order wins, so two refs of one model (`preview:fixture-a`, `preview:fixture-b`) can never both be eligible. |
| **Rotated debate** | A debate admitted while rotation is on, with two or more makers on its panel and no scorecard assignment pinned. It has exactly one rotation pin. |
| **Rotation pin** | The debate's row in `core.run_role_rotation`. |

## Part 1: the setting

A new code-owned register row, **`answerRoleRotationPolicy`**, alone in its own family (it is **not** added to `SYNTHESIS_ROLE_CONTROLS`, whose reader refuses any version missing a key, so every sealed version would stop parsing).

```json
{ "kind": "ANSWER_ROLE_ROTATION_POLICY", "enabled": true, "rule": "LEAST_SHARE_SEEDED_TIE_V1" }
```

- Strict schema: exactly these three keys; `enabled` a boolean; `rule` the one known rule name. A future rule is a new name and a new register version, never an edit.
- The reader answers `ABSENT`, `ON` (with the rule) or `OFF` (`enabled: false`). An absent row is today's engine. A row that does not parse refuses the API's boot with `ANSWER_ROLE_ROTATION_POLICY_INVALID` (a malformed setting is loud, as a malformed story family is).
- It is **not** a `register.required_row`, needs no migration, and is **not** added to `developmentRows` in `apps/runner/src/dev-deployment-register.ts` (that would shift every count pin and the byte-for-byte v1 preview kit, which hard-fails on 66 rows). Local development without the row is today's engine; tests publish the row where they need it.
- At run time only the API reads it (admission decides); the hosted publish's boot-readiness check also reads it, to refuse a malformed row before a restart. The runner's debate code never reads it: a pin present means a rotated debate, whatever the register says later.

**Preview.** The v2 publish kit (`deploy/preview-auth-dev/v1/publish-register-v2.ts`) builds the row with `enabled: true` and adds `answerRoleRotationPolicy` to `PREVIEW_SOURCE_ROW_KEYS_V2` (66 to 67 keys). The v1 kit is untouched. It reaches the live preview only when the operator republishes the register.

**Hosted.** The hosted register file (`apps/runner/src/hosted-register-publish.ts`) gains an optional operator member, `answerRoleRotation: { "enabled": true | false }`, published as the row under the file's sourceRef; absent publishes no row. `verifyHostedRegisterBootReadiness` reads the row (absent is fine; malformed refuses). `pnpm hosted:publish-provider-set` copies its base version's rows, so the row survives a provider-set republish. Rotation names no provider ref of its own, so `assertHostedRoleProvidersKept` (`apps/runner/src/hosted-provider-set.ts:174-183`) needs no change: the four register refs stay required as the fallback.

## Part 2: the rule (rule `LEAST_SHARE_SEEDED_TIE_V1`)

A pure function, in a new module `packages/scorecard/src/role-rotation.ts` beside the scorecard picker (both pick models for roles; the picker can later read the same counts):

```ts
pickRotatedRoles({ panel, counts, seed }) -> RotatedRoles | null
```

1. **Eligible members:** the panel, deduplicated by maker (first in panel order). Fewer than two makers: return `null` (today's fixed roles).
2. **Shares (settled Q1):** for each role and model id, `picked` = earlier rotation pins naming it in that role, and `eligible` = earlier rotation pins whose `eligible_model_ids` contain it (all time, this database). Its share is `picked / eligible`; a model never eligible before has share 0. Ordering uses the share first, then `picked`, then the tie key, compared EXACTLY (cross-multiplied integers, never floating point). A newcomer is therefore picked once early, then rejoins the rotation in proportion to its chances instead of taking every debate until its total catches up.
3. **Tie shuffle:** each candidate's tie key is `sha256("ROLE_ROTATION_V1" ␀ seed ␀ role ␀ model_id)` (hex), compared as text. Per-role salting means a tie does not always fall to the same model.
4. **Order:** for each role, candidates by (share ascending, picked ascending, tie key ascending).
5. **Picks:**
   - writer = first candidate for `ANSWER_WRITER`;
   - checker = first candidate for `ANSWER_CHECKER` whose maker differs from the writer's;
   - storyteller = first candidate for `STORYTELLER` (independent of the answer picks);
   - story checker = first candidate for `STORY_CHECKER` whose maker differs from the storyteller's.
   With two or more makers each pick always exists.
6. **Seed (ask-derived, stable before the run id exists):** `seed = sha256(JSON.stringify([ask.as_of, ask.question_line]))`. `as_of` is the client-sent instant the ask is "as of" and `question_line` the question; both are required fields of `AskRequestSchema` (`packages/contract/src/index.ts:176-189`). The same ask resent with the same `as_of` gets the same seed. There is no ask id or idempotency key in the contract, and the run id is minted later inside `startRun`. The seed and the question are used only in memory: never stored, logged or sent (a stored digest of a short question would be reversible).

The counts are read at admission with one query over the pin table (`per role and model: picks and eligible appearances, two aggregates`), before the estimate and so before the preview's admission lock is taken. Two debates admitted at the same instant may therefore read the same counts and pick the same model; the next debate evens it out (the rule is "balanced over time", not "exact").

## Part 3: the per-run record and the story's repair count (migration 0114)

One migration, `migrations/0114_role_rotation.sql`, the fourth forward step of the chain after 0113 (`migrations/lineage/README.md`: SQL, manifest `lineage/role-rotation-forward0114.json`, loader `packages/db/src/migration-forward0114.ts`, appended last to `STEPS` in `packages/db/src/migration-forward-chain.ts`). It adds no billing relation or function, so its manifest names `lineage/verify-effective-capabilities-111.sql` as the verifier in force. If another branch takes 0114 first, this step is renumbered at merge time (check the newest migration on `origin/dev` then).

**`core.run_role_rotation`**, insert-once then immutable, mirroring `core.run_role_assignment`:

| Column | Type | Rule |
|---|---|---|
| `run_id` | uuid | primary key, references `core.run(run_id)` |
| `rule` | text | `= 'LEAST_SHARE_SEEDED_TIE_V1'` |
| `writer_provider_ref`, `writer_model_id`, `writer_maker` | text | non-blank, at most 256 characters each |
| `checker_provider_ref`, `checker_model_id`, `checker_maker` | text | same; `checker_maker <> writer_maker` |
| `storyteller_provider_ref`, `storyteller_model_id`, `storyteller_maker` | text | same |
| `story_checker_provider_ref`, `story_checker_model_id`, `story_checker_maker` | text | same; `story_checker_maker <> storyteller_maker` |
| `eligible_model_ids` | text[] | the deduplicated eligible members' model ids at admission (2 to 16 entries, each non-blank, at most 256 characters); must contain all four picked model ids |
| `created_at` | timestamptz | default `clock_timestamp()` |

- **`serve.serve_disclosure` gains a fallback reason per role** (Task 11, see Part 6 "Absent at claim"): nullable `writer_fallback_reason` and `checker_fallback_reason`, each `MONEY` or `ROLE_UNAVAILABLE`. A row names a per-role reason for every fallback or for none (none: every row before 0114 and every run that is not rotated, whose fallbacks are money); 0076's one reason rule is replaced by the per-role one, under which `fallback_reason` (still only `MONEY`) is set exactly when some role fell back for money. 0076 itself is not edited.
- Guards: `core.install_truncate_guard`, the `reject_mutation` trigger on UPDATE or DELETE, `GRANT SELECT, INSERT ... TO debateai_runtime`, `GRANT SELECT ... TO debateai_replay` (the 0090 pattern).
- It holds engine identifiers only, never debate text, so it is not a content carrier and is not encrypted or erased (like `core.run_role_assignment`).
- No backfill: counting starts at zero for every model.
- One row per rotated debate. A one-maker debate, a debate with rotation off and a scorecard debate get no row.

**`serve.answer_story.storyteller_repairs`**, a new nullable `integer` column, `CHECK (storyteller_repairs IS NULL OR storyteller_repairs BETWEEN 0 AND 32)`: how many of the story's rounds had a storyteller reply that was accepted only after the repair try (the "please return valid JSON" packet). `NULL` = a story written before 0114, or a story that failed before any storyteller reply. Per storyteller model it is countable by joining the story's `storyteller_lineage`. A repair that also failed is not here: it stays visible as FAILED `STORY:STORYTELLER:<round>` ledger rows. To feed it, `ProviderCallResult` gains `repairAttempts` (the number of repair packets sent before the accepted reply), and the story writer counts the rounds where it is above zero.

## Part 4: admission

In `evaluateAskAdmission` (`apps/api/src/index.ts:4187-4300`), after `assertMakerAdmission` and before `resolveEnvelopeBasis` and the preview estimate:

1. If the row is `ON`, no scorecard assignment is being pinned for this ask, and the panel has two or more makers: read the counts, compute the seed, `pickRotatedRoles(...)`.
2. The estimate is told whether the debate is rotated (Part 5).
3. The picks travel with the admission result to `submit` and to `#submitWithRoom` (START and WAIT). Both insert the pin with a new setup step `ROLE_ROTATION`, after `startRun` and next to `MODEL_ASSIGNMENT`, before the work item is queued. A failed insert records `RUN_SETUP_FAILED:ROLE_ROTATION`, like the other setup steps. A WAIT debate keeps its pin; the waker never re-picks.

**Hand-over to the scorecard.** When a scorecard assignment is pinned (hosted, scorecard VALID), the scorecard owns the answer seats and the story follows them as today; rotation does not run and writes no row. When the scorecard picker later learns the four roles, it can read `core.run_role_rotation` counts as its tie-break; nothing in this design blocks that.

## Part 5: money (the start-of-debate estimate)

For a rotated debate, `apps/api/src/preview-budget-estimate.ts`:

- puts the writer's and checker's sites, the storyteller's two attempts per round and the story checker's call per round **on every gate that has a panel member, each at that gate's dearest panel member for that kind of call** (dearest by the active pricer: `DEBATE` for the answer roles; `STORYTELLER` + `STORYTELLER_RETRY` for the storyteller; `STORY_CHECKER` for the story checker). This is the careful side: a role is counted on both gates of a two-gate panel, and the writer and checker may both be counted on the same dearest model even though one debate can never give them the same maker;
- leaves out the register's four role models and refs: no health checks of off-panel role refs (the pinned roles are panel members, already health-checked), and the register's role models are not added to the gate's model list;
- a non-rotated debate is priced exactly as today.

At boot, the preview configuration already refuses a free or premium model list naming a model whose gate has no socket (`tests/unit/preview-anthropic-gate.test.ts`, "the four rows refuse without the Anthropic socket"), so every model a rotation can pick has a gate; the plan pins that with rotation on. At admission, the refusal "gate does not serve X" already covers "every model a rotation can pick must be switched on": every eligible member is a panel member, and every panel model is in its gate's model list. Unfinished debates are held the same way: `PREVIEW_UNFINISHED_RUNS_SQL` gains `EXISTS (SELECT 1 FROM core.run_role_rotation ...) AS rotated`; a rotated unfinished debate is held with the rotated pricing, any other at the boot roles as today.

Pricing the dearest member rather than the actual pick also means the decision "fits / does not fit" never depends on whose turn it is: the same ask on the same day gets the same answer.

**The re-pinned room table** (preview, depth 1-3, largest story size, realistic worst case, × 1.15, plus each gate's in-flight hold; pots DeepInfra $10.00 / 2,000 calls, Anthropic $2.00 / 600 calls). Computed on 2026-10-11 by running the shipped estimate functions with the roles placed at each gate's dearest member, as above (a scratch run; the same scratch, with today's roles, reproduced the currently pinned table exactly):

| Depth | Free (GLM + DeepSeek) | Premium (4 on DeepInfra) | All five: DeepInfra share | All five: Anthropic share |
|---|---|---|---|---|
| 1 | $1.98, 106 calls (today $1.97, 112) | $3.56, 338 (today $3.34, 344) | $4.27, 465 (today $4.05, 470) | $1.07, 177 (today $0.92, 154) |
| 2 | $2.22, 161 (today $2.21, 167) | $4.59, 522 (today $4.38, 528) | $5.56, 695 (today $5.35, 700) | $1.33, 260 (today $1.18, 237) |
| 3 | $2.71, 272 (today $2.69, 277) | $6.66, 890 (today $6.45, 896) | $8.15, 1,155 (today $7.93, 1,160) | $1.85, 426 (today $1.71, 403) |

Every combination still fits. The tightest is the five-AI debate at depth 3 on the Anthropic gate: $1.85 of $2.00. Call counts drop slightly because the off-panel `preview:fixture-b` health checks disappear. As today, while one five-AI depth-3 debate is unfinished, a second one the same day does not fit on DeepInfra; it fits again when the first is done. The roles were placed on MiMo (DeepInfra), DeepSeek (free) and Haiku (Anthropic).

## Part 6: the runner

When a claimed run has a rotation pin (read with `readRunRoleRotation(pool, runId)`, a twin of `readRunRoleAssignment`):

- **Answer roles.** The run uses the pin's writer and checker refs wherever it uses the sealed `synthesizerRoleRef` / `evaluatorRoleRef` today: the per-claim role policy is the boot policy with those two refs replaced (loop bound and call bounds unchanged). Everything downstream is today's code: the legacy seat book (no `assigned` flag, so the judge, review and 80-20 paths are untouched), `resolveSynthesisRoleMaker`, the planned refs in `synthesisRoleControls`, the disclosure's planned-versus-served record. Because the planned refs are the pinned ones, a rotated debate's disclosure records no false fallback.
- **Absent at claim** (changed by the orchestrator on 2026-10-11 under the owner's delegation, "always an answer"). A pinned answer role (writer or checker) whose member is not claim-eligible hands that role to the SEALED register ref for it (`synthesizerRoleRef` / `evaluatorRoleRef`): exactly today's unpinned role, with today's maker rules and today's claim-eligibility rules. Only when the sealed ref is itself one of the debate's panel refs (Task 12): a ref whose model is on the panel through another ref (on the preview, `preview:fixture-b` beside `preview:fixture-a`, both GLM) does not qualify, so a stand-in was always priced, switched on and health-checked with the panel and never needs an off-panel health check the estimate did not count. And only when the debate's start-of-debate estimate covers it: on the preview, the ref is a panel ref recorded with its reviewed model (its gate has that panel member, priced at that gate's dearest member, and admission found the model switched on in that gate's model list); off the preview the estimate prices the sealed roles as for any debate. The disclosure keeps the pin as planned and the sealed ref as served, a fallback whose reason is `ROLE_UNAVAILABLE` for that role (migration 0114 gives `serve.serve_disclosure` a reason per role, `writer_fallback_reason` / `checker_fallback_reason`; the run-level `fallback_reason` still means "money was used", and a fallback with no per-role reason is the money fallback, as on every run that is not rotated). The asker's "lower-cost" sentence and the owner report's "yes, for money" appear only for a role whose reason is `MONEY`; `ROLE_UNAVAILABLE` adds no user-facing text (the page already names who served). A checker stand-in that lands on the writer's maker follows today's rules (allowed, disclosed). Today's J24 refusal (terminal, `SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM`, same event) applies only when the sealed ref is also not claim-eligible (the event names the sealed ref), or is not a panel ref or not covered by the estimate (the event names the pinned ref). A pin naming a route that is not on the debate's panel at all is still `RUN_ROLE_ROTATION_INVALID`. The pinned refs are panel members, so they are never probed twice.
- **The pre-claim check** (`index.ts:4300-4314`) keeps checking the sealed refs: they remain the fallback for one-maker debates and must stay configured.
- **Story roles.** The story's `roleMakers` come from the pin's storyteller and story checker refs, looked up among the claim-eligible members (the place `index.ts:8128-8135` sets them today for scorecard runs). No change in `packages/story`'s role logic. A pinned story member that is not claim-eligible hands its role to another claim-eligible member of the debate's stored panel, in that panel's order (Task 12, "always an answer"; `storyRotationRoleMakers` in `apps/runner/src/story-snapshot.ts`): the storyteller goes to the first member of another maker than the pinned story checker when that checker can serve, else to the first member; the story checker goes to the pinned one if it can serve and its maker differs from the storyteller actually serving (checked again when the storyteller fell back), else to the first member of another maker than that storyteller. Only when there is no such member is the role handed over as null; the story package then uses the register's story ref, as it does for a scorecard FALLBACK seat (`packages/story/src/writer.ts:463-465`), and on a rotated debate that ref serves only when it is one of the debate's panel refs and claim-eligible (as a last resort it may share the storyteller's maker, as on today's two-GLM preview); otherwise today's `STORY_ROLE_UNAVAILABLE`. The served lineage names whoever actually wrote and checked.
- **Cheaper-model fallback (money).** Unchanged. Within a rotated debate the eligible members have one maker each, so the existing "avoid the writer's ref" ordering is the same as "avoid the writer's maker" (see Question 2).
- **No pin:** byte-for-byte today's path.

## Part 7: what people see

- The debate page's "who wrote / who checked" for the answer and the story already shows the models that actually served (the served lineage and the disclosure record); for a rotated debate these are the rotated models. No new user-facing text is added, and no score, count, rule name or price is shown.
- The rotation pin is operator data: readable by SQL, not shown to end users.

## Error handling summary

| Situation | Behaviour |
|---|---|
| Row absent, or `enabled: false` | Today's engine; no pin. |
| Row malformed | API boot refuses (`ANSWER_ROLE_ROTATION_POLICY_INVALID`). |
| Panel with one maker | Today's fixed roles; no pin. |
| Scorecard assignment pinned | The scorecard owns the roles; no pin. |
| Count query fails at admission | The ask is refused with the existing "a model this debate needs cannot be reached right now" code (`ASK_MODEL_CANDIDATE_UNAVAILABLE`, one-minute retry), never admitted with unpinned roles. |
| Pin insert fails in `submit` | `RUN_SETUP_FAILED:ROLE_ROTATION`, nothing queued (the setup-step rule). |
| Pin present but unreadable at claim | Terminal `RUN_ROLE_ROTATION_INVALID`, like `RUN_ROLE_ASSIGNMENT_INVALID`. |
| Pinned answer role absent at claim | The sealed register ref for that role serves (today's claim rules), disclosed as a fallback for `ROLE_UNAVAILABLE` (no "lower-cost" text), when it is one of the debate's panel refs and the estimate covers it (orchestrator, 2026-10-11, "always an answer"; panel ref: Task 12). |
| Pinned answer role absent and the sealed ref absent too, not a panel ref (even if its model is on the panel), or not covered by the estimate | Today's J24 terminal refusal (`SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM`, today's event). No off-panel health check is made for it. |
| Pin names a route that is not on the debate's panel | Terminal `RUN_ROLE_ROTATION_INVALID` (data corruption, never a temporary absence). |
| Pinned story role not claim-eligible | Another claim-eligible panel member takes it, in panel order (the story checker always of another maker than the storyteller serving); if none, the register's story ref when it is a claim-eligible panel ref; else today's `STORY_ROLE_UNAVAILABLE` (Task 12). |
| Estimate does not fit | Today's refusal and waiting line, unchanged. |

## Testing

All tests use stand-in providers; no paid calls.

- **Rule (unit).** Table cases: two makers; five makers; counts deciding; ties deciding (seeded, repeatable); per-role salt; deduplication of two refs of one model; one maker returns null; a property test over random panels and counts that the checker's maker always differs from the writer's and the story checker's from the storyteller's, and that the pick never leaves the panel.
- **Setting (unit).** ABSENT, ON, OFF, malformed, unknown rule; an older sealed register without the row parses as ABSENT.
- **Migration (integration).** Insert once; second insert, UPDATE, DELETE, TRUNCATE refused; the two maker CHECKs; unknown run refused; grants; the new story column and its CHECK; the forward chain and its replay.
- **Admission (unit, with stubs).** Rotation on and two makers: picks made before the estimate and pinned on both submit paths before the work is queued; off, absent, one maker or scorecard: no pick, no pin, estimate unchanged.
- **Estimate (unit).** Rotated shares on each gate's dearest member; no off-panel probes; held unfinished rotated debates; the re-pinned room table above.
- **Runner (integration).** A pinned run serves its writer and checker from the pinned refs, records them as planned, and its story is written and checked by the pinned story pair; a pinned storyteller or story checker not claim-eligible is replaced by the next claim-eligible panel member (the checker of another maker), else by the register's story ref when it is a panel ref, else `STORY_ROLE_UNAVAILABLE`; a pinned writer or checker absent at claim is served by the sealed role and disclosed as `ROLE_UNAVAILABLE` when the sealed ref is a panel ref (no off-panel probe); the pinned and the sealed ref both absent, a sealed ref off the panel (even with its model on the panel), or a sealed ref not covered by the estimate, refuses with J24; a run without a pin is unchanged.
- **Story repair count (unit + integration).** A storyteller reply accepted after a repair counts 1; a clean round 0; the column is written.
- **Publish (unit + integration).** The v2 preview kit builds 67 keys including the row; the hosted file's optional member publishes the row; boot readiness reads it.
- **Regression.** `tests/architecture` (whole folder), the estimate, admission and story suites, and the integration suites for the migration, story repository and the runner's synthesis paths, before merging.

## Delivery order (refined in the plan)

1. The rule (pure).
2. The setting (register row, readers, preview kit, hosted member).
3. Migration 0114 and the database access.
4. The estimate.
5. Admission and pinning.
6. The runner.
7. The story repair count.
8. Final guards.

## Deploying

- Preview: apply migration 0114 only through the native operator's `apply-and-plan`, with the owner's yes (the preview refuses to start while a chain step is pending); then republish the register with the v2 kit (adds the row, `enabled: true`); then restart the API and the runner. Billing stays off; local mode stays.
- Hosted: the operator adds `answerRoleRotation` to the hosted register file when wanted, publishes, repins `REGISTER_VERSION`, restarts.
- Rollback: republish without the row (a new register version) and restart; pinned debates keep their pins.

## Questions for the owner

> **Settled by the orchestrator on 2026-10-11 under the owner's delegation** ("write the spec, then build the plan and implement the plan; no need to come back to me at each step"): Q1 → the SHARE rule below replaces the all-time count (it serves the owner's stated purpose, comparable data per AI per role, and stops a newcomer taking every debate); Q2 → unchanged (never cut a debate off); Q3 → unchanged; Q4, Q5 → information. The owner was told in chat and may overrule.

> **Also settled by the orchestrator on 2026-10-11 under the owner's delegation** (guiding rules "a debate is (almost) never cut off" and "user-facing text must stay true"): a pinned answer member that is not claim-eligible no longer fails the debate when the sealed register role can serve it and the debate's estimate covers that role's model; the disclosure records the stand-in per role as `ROLE_UNAVAILABLE`, never as money, and no new user-facing text is added (Part 6, "Absent at claim"). The owner may overrule.

Each has a default that this spec builds; none blocks the build.

1. **A newly added model catches up in a burst.** "Least often so far" counts all time. A model added later (for example a sixth AI) starts at zero and takes the role in every debate it is on until it reaches the others' totals. Built: the approved rule. Alternative: count each model's share of the debates it was eligible for, so a newcomer joins the rotation at once. That would be a new rule version, not an edit.
2. **Fallback may still land the checker on the writer's company.** When the planned checker is refused for money or fails mid-debate, today's cheaper-model fallback tries the other companies first and the writer's company last, and discloses it. Built: unchanged (a debate is never cut off for this). Alternative: never let the checker fall back to the writer's company, and fail the check instead.
3. **The "different checker" honesty mark compares provider names, not companies.** For rotated debates the two are the same thing (one model per company on a panel). For non-rotated debates it can miss a same-company pair (two names for GLM). Built: unchanged, so that without the setting nothing changes. Alternative: compare companies everywhere, which may newly mark some of today's debates.
4. **The five-AI depth-3 room on Anthropic is thinner.** It sets aside $1.85 of the $2.00 pot (was $1.71). It fits; nothing to decide unless the Anthropic pot changes.
5. **Claude Haiku as storyteller has no JSON mode.** It may need the format-repair try more often than GLM. Built: it is eligible like every panel member; the new repair count measures it.
