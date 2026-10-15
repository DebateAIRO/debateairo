# Debate Shape Phase 2b (the runner shape) Implementation Plan

> **Renumbered 2026-10-14:** the migrations this plan calls 0116 (the debate shape map) and 0117 (the language check's site cost) are now 0117 and 0118: the merge of `origin/dev` 221d784db brought dev's own 0116 (`0116_mail_locale.sql`) first. The numbers below are historical.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a run's receipt carries a debate shape (P2a's `envelope_basis.shape`), the runner argues the new shape: the
angle map (Stage 1), P assigned positions, round-1 chosen points, J graders plus the close-call extension, one cross-reply
per position, breadth-first deeper rounds (adaptive or fixed) with δ/ε at every round boundary, scrutiny, and the answer
length. Every fallback ends with an answer. A run without a shape is today's run, byte for byte.

**Architecture:** The map runs inside `execute()` before root 0, through a `MapCaller` adapter
(`apps/runner/src/map-stage.ts`) over the same per-maker gateway stack the debate uses (lane, sit-out book, keep-alive,
counting gateway). The rest of the shape is expressed in the runner's EXISTING plan vocabulary: P roots and one
breadth-first leg list (`apps/runner/src/shape-plan.ts`) whose legs carry their own kind, ordinal, consideration and
key, so the ordered recorders, review batches, `closeGlobalRound`, `subtreeIndices` and `selectPreventableBranches` keep
working unchanged. Pure helpers decide seats (`shape-seats.ts`), adaptive chains and scrutiny needs (`shape-select.ts`).
The map is stored in three new append-only tables (`core.map_item`, `core.map_choice`, `core.map_position`, migration
0116) through `MapChoiceRepository` in `@debateai/map` (never in `@debateai/db`, whose `index.ts` is hash-pinned).

**Tech Stack:** TypeScript (strict, ESM), zod, vitest, embedded PostgreSQL (integration), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-12-debate-shape-design.md` §1.2, §3.3–§3.5 and the invariants list; binding
names `docs/superpowers/plans/2026-10-12-debate-shape-phase2-INTERFACE.md` §3–§4; Project 1
`docs/superpowers/specs/2026-10-12-parallel-calls-design.md`; sibling plans P2a/P2c/P2d (same folder).

All paths are relative to `dialectical-engine/` on branch `feat/2026-10-13-debate-shape-phase2` (worktree
`.claude/worktrees/debate-shape-p2/dialectical-engine`). P2a is built first (its names are used below as written in
`2026-10-12-debate-shape-phase2a.md`, including the Cross-plan changes this plan asks of it).

## Amendments 2026-10-13

Applied after P2a's final review (`.superpowers/sdd/2026-10-12-debate-shape-phase2a/final-review.md`, "Names vs
P2b/P2c/P2d" and "Notes for P2b", plus the ledger NOTES) and for P2L (`2026-10-13-debate-shape-phase2-language.md`,
"Cross-plan amendments" P2b-1..5, adjusted for its controller ruling CR-3). Every code fact below was checked on
`feat/2026-10-13-debate-shape-phase2` at 803f58128.

- Cross-plan changes: the P2a items are marked as built; item 2's price type is `MAP_MERGE` / `MAP_CHOOSE` (as built), not `MAP_LONG`; item 5 lists every guard site (final review, M10).
- Cross-plan P2c-3: P2b ADDS the `@debateai/map` import line to apps/runner/src/index.ts; none exists today (final review).
- Cross-plan P2d-2: ruling X3 is made (yes): the practice register carries the code's judge, composer and map hashes (ledger ruling X3).
- New cross-plan block "P2L (question language)": what P2L needs from this plan; P2L's amendment 2 (a ninth mark) is dropped by its ruling CR-3 (P2L).
- Task 2: keep the branch's `mapWrongLanguage(text, expected: ReplyLanguageExpectation)` (fix R-5) instead of the `detectArgumentLanguage` version; the multilingual test passes an expectation object (P2L amendment 1).
- Task 3: the mark count stays 46; P2L adds no condition mark (P2L CR-3).
- Task 6: removes the Phase-2a guard at ALL six sites (runner boot, practice runner, hosted readiness, API boot step `debate-shape-runner-pending`, practice ask, the runner's per-run `refuseDebateShapeReceiptInPhase2a`) with their imports, comments and the tests that pin them (final review I2, ledger NOTE for P2b Task 6). Pre-flight PF-B24a: Task 6 removes the five boot sites; the per-run refusal goes in Task 13.
- Task 6: the hosted readiness check resolves the shape settings exactly as the runner's boot does, and the dry run's `debate_shape=present` line loses its RUNNER_PENDING text (final review, row P2b:150; M3).
- Task 6: the v1 kit (`publish-register.ts`, kept unchanged since v2) filters out `mapContractHash` so its 66/65 counts hold (final review, row "v1 kit").
- Task 6: the preview native operator wires `debateShape` (exactKeys + the sixth argument of `buildPreviewSourceRowsV2`) (ledger NOTE; final review).
- Task 6: the preview's "no shape" rollback, DECIDED: an optional `enabled` member on the row (absent = on) and `debateShapeInForce(policy)`; the plan choice `debateShape: "off"` republishes the row disabled, like `roleRotation: "off"` (R19 keeps a sealed row forever) (controller decision).
- Task 6: Free answer-job boot eligibility checks the LARGEST bounds the row allows (writer and map), at the API boot and at the hosted publish (ledger NOTE; final review note 2). Pre-flight PF-B22: the answer writer only; map and POSITION are a known limit.
- Task 6: map step bounds are 8192..32768 (X1); the window note for merge/choose inputs (final review note 2c).
- Task 6 / Owner steps: do not publish the preview's `mapContractHash` before P2L Task 15 lands (P2L amendment 3).
- Task 10: the adaptive choice is capped at the points that exist (a test row) (final review note 5).
- Task 11: the preview estimate charges each gate the largest share its members can take of the panel steps, not an even split (final review note 1); fallback seats are not window-checked: recorded as a known limit (final review note 3).
- Task 12: `mapConditionRecords` converts every mark the map returns, never a fixed list; map NOTES never become records (P2L amendment 4, CR-3).
- Task 15: the harness passes the run's language to `startRun` (the scripted `MAP:angles` reply gains `question_language` only in P2L, because today's reader is strict); one measured check that the run made no more nodes and map sites than the receipt priced (P2L amendment 5; final review note 6).
- Task 17: README rows for the new boot refusals replace RUNNER_PENDING; the runbook line for a malformed shaped unfinished receipt (final review notes 4, 7).
- Owner steps: the rollback, the P2L publish order, and the open owner questions (Free depth ceiling as a row member) (final review note 8).

**Pre-flight corrections 2026-10-13.** Applied from the pre-flight scan
(`.superpowers/sdd/2026-10-12-debate-shape-phase2b/preflight.md`, 5 BLOCKER, 40 FIX, 13 NOTE, at 2d4f35e64) and the
controller rulings on it (`progress.md`, last section). Every task carries its own "(pre-flight PF-Bn)" marks;
NOTEs are "Implementer note (pre-flight PF-Bn)" lines in their task.

- Controller rulings: PF-B24a the per-run refusal goes in Task 13, not Task 6; PF-B36 authored sites charged in full to every gate; PF-B22 Free boot check = answer writer only; PF-B9 mark labels without grading words, 3 phrasings each (Owner steps 2); PF-B13 owner step added; Task 17 never runs the full suite; every `tsc -p <dir>` → `pnpm run typecheck`.
- PF-B1 → Task 1: `MAP_NOTES` pin in `tests/unit/map-package.test.ts` gains `"MAP_STOPPED"`; file added to the run list and `git add`.
- PF-B2 → Task 1: the reassigned-list script line uses `request.callSiteKey.startsWith("MAP:list:2")`.
- PF-B3 → Task 1: the weak filter is replaced by a 4-segment-key check; the `practice-openings-log.ts` edit is dropped (note).
- PF-B4 → Tasks 1, 3, 4, 5, 11, 12, 13, 14, 17: `pnpm run typecheck` (alone); `pnpm exec tsc -p apps/ui --noEmit` only where apps/ui is edited (Tasks 3, 17).
- PF-B5 → Task 2: `tests/unit/map-items.test.ts` added to the run list (note).
- PF-B6 → Task 3: `acceptance/grok-relay.test.ts` 38 → 46, run with `-t "names the degradation"`.
- PF-B7 → Task 3: locale keys are flat `"debateChrome.condition.<key>"` in all 35 locales.
- PF-B8 → Task 3: the real i18n check `node --import tsx --test lib/i18n/debateChrome.test.mjs` from `apps/ui`.
- PF-B9 → Task 3 + Owner steps 2: option-1 labels in code, no grade/score/judge/threshold/panel words; the label test refuses them; 8×3 phrasings offered.
- PF-B10 → Task 4: `answer-writer-v3-register-12.test.ts` judge side (`JUDGE_P2B`, `live11Base` judge row, `changedKeys` and refusal text).
- PF-B11 → Task 4: `a13-model-role.test.ts` gains an `assigned-root` LEG as well as its role.
- PF-B12 → Task 4: `acceptance/moment-tools.ts` strict leg schema, `consideration`, rebuild and excerpts; line drift fixed.
- PF-B13 → Tasks 4, 5 notes + Owner steps 1: the branch cannot boot on the preview's register 12 until a new version (judge, composer, map hashes) is published after P2L Task 15.
- PF-B14 → Task 5 (BLOCKER): every composer-hash derivation (runner `codePromptContractHashes`, dev builder, `acceptance/seed-register.ts`, `PRACTICE_CONTRACT_HASHES`, moment-tools) switches to `SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT`; grep step added.
- PF-B15 → Task 5 + deviation 3: today's writer contract is `serve.synthesizer.v3`.
- PF-B16 → Task 5: every composer pin listed; `tests/support/synthesisRequestFixture.ts` always created; the SYNTHESIS_WRITER replay accepts the length contract (here, not Task 14).
- PF-B17 → Task 6: `WalkingSkeletonSettings.debateShape` is an addition; final grep covers `RUNNER_PENDING`; Task 6 writes the README rows (Step 3f), Task 17 only checks them (note).
- PF-B18 → Task 6: `register-support-publication.test.ts` dev-row counts +1.
- PF-B19 → Task 6: every preview-v2 pin listed (incl. :138, found by the corrections pass), the operator regex, integration `rowCount` 69 → 70.
- PF-B20 → Task 6: `validateDebateShapeChoice` checks the shape only; strict parse in `buildPreviewSourceRowsV2`; `--debate-shape` in `release-artifacts.mjs`; `"off"` = start values with `enabled: false`.
- PF-B21 → Task 6: the hosted Free check lives in `planHostedRegisterPublication`, reading the file member.
- PF-B22 → Task 6 (ruling): POSITION dropped; answer writer only, at the row's largest writer bound; known limit recorded.
- PF-B23 → Tasks 6, 8: `pnpm install --lockfile-only --offline` and `pnpm-lock.yaml` committed; Task 8 adds no `pg`.
- PF-B24 → Tasks 2, 6, 7, 8, 9, 10, 12: shipped-corpus manifest regenerated, checked, committed (Task 7 too: it adds a shipped loader).
- PF-B24a → Tasks 6, 13 (ruling): Task 6 keeps `refuseDebateShapeReceiptInPhase2a` and its describe block; Task 13 deletes them with a no-hit grep.
- PF-B25 → Task 7 (BLOCKER) + P2L Task 19: the owned-function check is a `CREATE … FUNCTION` regex, never a bare substring.
- PF-B26 → Task 7: `core.map_position` gets the erasure barrier (contract test + postcondition evidence; self-check stays 8).
- PF-B27 → Task 7: maker-check limit recorded (not relaxed); five extra pin runs listed (note).
- PF-B28 → Task 8: read order by `item_id`, the real story fixtures, s10 list and orphan-audit `"db"` rows.
- PF-B28a → Task 8: items and choice written in one transaction inside the lease, choice first (note).
- PF-B29 → Task 9: `shapeRunnableNodeCount` counts `plan.legs`; fixed-mode equality and `round ≤ depth` asserted.
- PF-B30 → Task 9: `strongestRival: "gone"`.
- PF-B31 → Tasks 9, 12, 13: positions = `Math.max(2, Math.min(P, shapeDistinctMakers(…)))`, also `writeMapRun`'s answer count.
- PF-B32 → Tasks 11, 15 (BLOCKER): the close-call extension handles a spend stop like the base panel (`shapeCloseCallFold`); unit row in Task 11, runner-level row in Task 15.
- PF-B33 → Task 11: `nodeId: childNodeId`.
- PF-B34 → Task 11: `onPanelMakers` includes every called seat's maker (note).
- PF-B35 → Task 11 (BLOCKER): grading share per gate = `min(1, g/(J+E))` (`previewShapedGradingShare`), with its one-line proof.
- PF-B36 → Task 11 (ruling): authored sites charged in full to every gate; seat enumeration dropped; per-gate totals asserted.
- PF-B37 → Task 12: the three new codes go into the runner and API `KNOWN_DOMAIN_CODES` and `EXPECTED_DOMAIN_CODES`; both test files run.
- PF-B38 → Task 12: `default: return exhaustive(input.opening);`; `exhaustiveOpening` and its code dropped.
- PF-B39 → Task 12: the spec context gains `replyLanguage`.
- PF-B40 → Task 12: map seats fall back to `configuredByProviderRef`; `shapeDistinctMakers` signature; `shape-seats.ts` in Files; doc comment reworded (note).
- PF-B41 → Task 13: `dropSatOutRoot(rootIndex, beforeCall)`; hand-over only before the first call.
- PF-B42 → Task 13: `positionAnswerers` keyed by root index in a shaped run; restore in `rootSeats` order.
- PF-B43 → Task 13: the cross-reply keeps the ledger's recorded slot.
- PF-B44 → Task 13: review-batch ends pushed in order (planned end, scrutiny ends, total).
- PF-B45 → Task 13: the writer rule uses the maker that answered (`answeredMakers`).
- PF-B46 → Task 13: imports and current code locations (note).
- PF-B47 → Global Constraints, Tasks 3, 12, 14 (BLOCKER): map records carry the served root's node id; `mapConditionRecords(result, runId, servedRootNodeId)`.
- PF-B48 → Task 14: scrutiny legs skip the δ-stop check; frozen nodes are not scrutiny candidates.
- PF-B49 → Task 14: test filter widened (also "money stop"); writer bound from `synthesisRolePolicy.synthesizerBound`.
- PF-B50 → Task 15: `readFramedMaterial`/`wirePacket` from `framed-packet.ts`; bodies read through `stubChatBody`.
- PF-B51 → Task 15: invariant SQL uses real columns (served root from `UNSERVED-MAKER-POSITION`, makers via `ledger.raw_artifact`, `target_kind='NODE'`).
- PF-B52 → Task 15: `against` is empty when one answer is named.
- PF-B53 → Task 15 + P2L Task 17: `runShapeDebate(harness, options)` exported from the harness; P2L calls it with the harness.
- PF-B54 → Tasks 15, 16: `scripted-answers.ts` in Files; copies follow `savedAcrossVariants` and are dropped (note).
- PF-B55 → Task 17: `test:ci-gate` dropped; targeted runs one at a time.
- PF-B56 → Task 17 + Owner steps 1: README locations; no double edit of the key count; the PF-B13 owner step (note).

- 2026-10-14 (controller ruling T7-PRIV, commits 4ca79b191 + 0677d3717): every id in a readable column is code-minted. The map package renames angles `g1..gN` (plan order, fallback angles too) and chosen answers `a1..aN` (choice order, filled answers too; `filled-N` is gone); merged key points/answers keep the code-minted `kp01`/`an01`. 0116's CHECKs are `^g[1-7]$` (angle_id) and `^a[1-4]$` (answer_id); `map_position`'s root key is `FOREIGN KEY (run_id, root_node_id) REFERENCES core.node(run_id, node_id)`. Task 7's text below shows the pre-ruling CHECKs; the code is the source of truth. Tasks 8, 12–15 use the code ids (never an AI-written id in a readable column, a log line or a mark record).

## Global Constraints

- **Row absent = today, byte for byte.** A run whose `parseCostEnvelopeBasis(run.envelopeBasis).shape` is `undefined`
  takes today's code path in every function this plan touches. Every new branch is guarded by `shapeRun !== null`.
  Today's prompts (contract ids, instruction text, material fields) are unchanged; only the sealed fingerprints grow.
- **The receipt is the source of truth.** The runner reads sizes only from `envelopeBasis.shape`
  (`DebateShapeCeilingInput`, P2a) and settings from `debateShapeSettingsOf(run.depthParams)` (P2a). It never resolves
  the plan again. Sit-outs may only LOWER a size. The runner never makes more calls than `debateShapeSiteCounts`
  (P2a) priced: Task 9 has an enumerator test.
- **P2a money rules kept (binding).** Fixed mode = one exchange (reply + defence) per chosen point per deeper round, a
  linear chain. Adaptive = `deeperTopPoints` chains per position. Map-unavailable fallback opens at most P positions
  (the first P seats) with at most K round-1 children each. Map repairs (patch, full re-ask) are attempts inside each
  call's own allowance. A reassigned list has its own key `MAP:list:<i>:2` (P2a's `2A + G + 3` map sites already count it).
- **Stops (Project 1, O6).** A money/attempt/usage/daily/allowance refusal (`expansionPhaseStop(error) !== null`) or a
  lane stop during the map ends the map cleanly: nothing new starts, answers already paid for are kept, the map
  finishes with the code fallbacks (no call), and the run goes on to root 0 and its answer with `runBodyBudgetStop`
  set. A keep-alive refusal (claim lost, time limit) abandons the run exactly as today (`keepAliveStop`).
- **One key, one task.** Every call-site key is asked by one task at a time and its retries run inside it. Shape keys:
  `MAP:angles`, `MAP:list:<i>`, `MAP:list:<i>:2`, `MAP:merge`, `MAP:gap:<k>`, `MAP:choose`; roots keep
  `JUDGE` / `JUDGE:root:secondary` / `JUDGE:root:<i>`; every other shape leg is
  `JUDGE:<defender|critic>:root<r>:r<k>:p<n>` where **`n` is the leg's own plan position** (unique), and cross-replies
  keep `JUDGE:cross-root:<i>-><j>`. All of these pass migration 0069's progress-value regex; map calls never go through
  `cooldownAttempt` (no hold records for `MAP:` keys).
- **Sealed values are superseded, never edited.** `register.bootstrap.json`, every existing `migrations/*.sql`,
  `packages/db/src/index.ts` (its `NATIVE_MIGRATE_MODULE_SHA256` pin) and `tests/support/fixtures/register-development-v4.json`
  are not touched. The judge and composer contract hashes CHANGE (new contracts are appended to their fingerprints);
  dev registers re-seal automatically; preview and hosted need a republish (owner step, listed at the end).
- **Marks.** New marks are inserted into `CONDITION_MARKS` right after `"PANEL-DEGRADED-SINGLE-VOICE"`, never at the
  tail (the DR-176 tail is read by `slice(-4)`). Every new mark is in `REQUIRED_CONDITION_MARK_RECORDS` and always has
  a typed record. Map marks are answer-scope with `affectedNodeIds: [<the served root's node id>]` and `call_site_key`
  NULL (pre-flight PF-B47: `ServeRepository.persist` refuses an empty node list with
  `CONDITION_MARK_AFFECTED_NODES_REQUIRED`); the two extension marks are node-scope on the node they extended.
- **No internals in user text.** Mark labels, the opposite-answer template and the length sentence say nothing about
  scores, thresholds, graders or ids.
- **Source rules** (`tests/architecture/scaffold.test.ts`): no `process` + `.env` text; every `switch (` has `default:`
  and `exhaustive(`; no exported ALL_CAPS constant equal to a bare number; no `test`/`fixture` import in shipped code;
  no `/Users/<name>/` path. Depth-literal oracle (`tests/support/depthOracle.ts`): a shipped line mentioning "depth"
  must not contain a bare `5`, nor a `6` after `<`, `>`, `<=`, `>=`. Every new shipped `.ts` goes into
  `tests/support/shipped-corpus.manifest.txt` (regenerate with
  `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`).
- **Test runs (owner's Mac, 16 GB).** Before any `vitest run`: `pgrep -fl 'vitest[ ]run'` shows at most one other run
  and `memory_pressure | tail -1` shows at least 40% free. Integration suites (embedded Postgres) run ONE AT A TIME,
  never beside a typecheck or another integration file. Never the full suite; CI is the judge for the gate.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or the implementing model's own line,
  per the Phase 1 ruling). No push, no PR inside this plan.

## Review Focus

Five failure modes most likely to ship untested, and where they are caught:

1. **A stop during the map leaves the run with no answer** (map throws, orchestrator swallows, or the runner treats the
   stop as a map failure and keeps calling). Caught by Task 1 (`STOPPED` outcome stops every later step, no call made)
   and Task 15 "a money stop mid-map ends with an answer" + "a lost claim during the map abandons".
2. **Two shape legs share one call-site key** (round-1 points under one root with one polarity), silently sharing an
   attempt allowance and a panel rotation. Caught by Task 9 "every leg key is unique and matches the 0069 regex".
3. **Breadth-first order breaks the recorders** (a child planned before its parent, or a cross-reply recorded after a
   deeper round so boundary 1 never sees it). Caught by Task 9 "parents precede children; round 1 holds points and
   cross-replies; `deriveGlobalRoundCompletions` gives one boundary per round" and Task 15 finish-order independence.
4. **The close-call extension lowers a grade** (re-reduction drops the author or re-weights an earlier voice). Caught by
   Task 11 "extension only raises the selected score or widens the dispersion" over every member order.
5. **A row-absent run changes** (a guard reads `shapeRun` wrongly, a prompt byte moves, the panel cap changes). Caught
   by Task 4 "today's five legs frame byte-identically", Task 5 "today's writer prompt is unchanged", Task 16's
   same-saved-debate test across a runner booted with and without the shape rows, and the existing suites run one at a time.

## Contract deviations

1. **Map contract hash is its own OPTIONAL register row `mapContractHash`** (a 64-hex string), not a member of a
   "policy hashes row": there is no such row — each hash is its own row folded into `policy.hashes` by the strict
   `readDevelopmentRunnerPolicy`. Making it required there would break every older register version
   (`DEV_RUNNER_POLICY_UNRESOLVED`). The runner reads it with `readMapContractHash(pool, version)`; a register with a
   `debateShapePolicy` row and no (or a stale) `mapContractHash` refuses the runner's boot
   (`DEBATE_SHAPE_MAP_HASH_UNSEALED` / `MAP_CONTRACT_HASH_MISMATCH`). The dev builder always emits it; the preview kit
   lists it in `PREVIEW_SOURCE_ROW_KEYS_V2`.
2. **Consideration is a contract variant, not an optional field.** The closed material table demands exact fields, and
   today's prompts must stay byte-identical, so support/attack with a consideration use new contract ids
   `judge.<support|attack>.consideration.<claim>.v1` and a second closed table
   `JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS`. `assigned-root` is a new leg kind (`judge.assigned-root.<claim>.v1`).
   `JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT` = the frozen V1 text (today's five legs, review, panel) +
   `"\n---\n"` + the six new contracts.
3. **The length sentence is a synthesizer contract variant** `serve.synthesizer.length.v1` (today's
   `serve.synthesizer.v3` instruction + one sentence; pre-flight PF-B15: today's writer contract is v3, not v2) with one
   extra material field `answer_length` ("about N words"). It is sealed by `composerContractHash`, whose fingerprint
   (`SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT`) becomes v3 + `"\n---\n"` + the length variant; EVERY composer-hash
   derivation switches to it (pre-flight PF-B14, Task 5). The request object and
   `assertFreshContextRequest` are unchanged (the field is added at framing time).
4. **Storage columns.** `core.map_item` keeps INTERFACE's columns except `claim`/`why`, which live in the encrypted
   `content` (`{claim, why}` or `{answer}`) beside `content_ciphertext`/`content_attestation`; `step` also allows `SNOWBALL`.
   `core.map_choice` is `(run_id, opening, marks, content, content_ciphertext, content_attestation)`: `content` holds the
   whole map result except items (answers, also-raised with claims and makers, key points, angles, notes); `marks` is a
   plain array of mark codes. A third table **`core.map_position(run_id, answer_id, root_index, root_node_id, maker)`**
   records which root argued which answer, appended when the root is saved (map_choice is append-only and is written
   before the roots exist). P2c's `rootNodeId` comes from it.
5. **Reader home and forms.** `MapChoiceRepository` and the free functions `readMapChoiceForRun(pool, runId)` /
   `readMapItemsForRun(pool, runId)` live in `@debateai/map` (`packages/map/src/repository.ts`), not `@debateai/db`:
   a new `@debateai/db` export edits `packages/db/src/index.ts` and re-pins `NATIVE_MIGRATE_MODULE_SHA256`.
6. **Adaptive selection is made once, at the round-1 boundary.** The `deeperTopPoints` chains per position with the
   highest root leverage of their round-1 point are chosen there; every later round extends the same chains (a linear
   chain each, so P2a's `(d−1)·2·P·X` holds), and later boundaries apply ε/δ to them. Re-choosing chains later would
   need a node whose parent is decided at run time, which the plan-ordered recorders cannot hold.
7. **Map calls carry no `modelRole`** (the scorecard grades the seven jobs; map calls are none of them), contract hash
   = the sealed `mapContractHash`, role `JUDGE`, lane `served`, BODY spend phase, priority `OTHER` (unchanged
   `callPriorityOf`). Thinking step stays `"opening"` (already mapped by `previewThinkingStepOf` for `MAP:`): the map IS
   the opening (ruling S1), and a new step would change the thinking-table shape the owners just sealed. A separate
   `map` step can be added later without touching the runner.
8. **Scrutiny runs every planned round of its budget** (`roundsPerPoint` exchanges on each of at most `pointsPerDebate`
   nodes chosen once after the planned rounds); "up to" is honoured by stops, freezes and the node count, not by a
   per-round re-check. One `SCRUTINY-EXTENDED` record per scrutinised node (its exchange nodes in `affectedNodeIds`).

## Cross-plan changes

**P2a (settings and money) — items 1–4 are BUILT (P2a, 2026-10-13); item 5 is this plan's Task 6:**

1. `DebateShapePolicy` gains a top-level member `mapStepBounds: { merge: int 8192..32768, choose: int 8192..32768 }`
   (start values `{ merge: 32768, choose: 32768 }`, ruling R-2; range per controller ruling X1, as P2a built it), parsed
   strictly in `parseDebateShapePolicy` (`DEBATE_SHAPE_POLICY_INVALID:mapStepBounds.merge` / `:mapStepBounds.choose`,
   no `$.`). The member is optional: an absent member reads the defaults `{ merge: 32768, choose: 32768 }`. `DebateShapeCeilingInput` gains `mapMergeBound: number` and
   `mapChooseBound: number` (copied by `resolveDebateShape`); `debateShapeReceiptSchema` gains `map_merge_bound` and
   `map_choose_bound` (ints ≥ 1); `debateShapeReceipt` / `debateShapeOfReceipt` carry them.
2. The preview estimate (`apps/api/src/preview-budget-estimate.ts`) prices the two sites `MAP:merge` and `MAP:choose`
   at `max(output.debate, map_merge_bound | map_choose_bound)` output tokens (as built: two `PreviewCallType`s,
   `"MAP_MERGE"` and `"MAP_CHOOSE"`, apps/api/src/preview-budget-estimate.ts; the other map sites stay `DEBATE`). The
   attempt ceiling is unchanged; the per-member split of the panel steps is fixed by this plan's Task 11 Step 3b.
3. Deviation 4's text: a failed list is handed to another seat under **its own key `MAP:list:<i>:2`** (P2b Task 1);
   the `2A + G + 3` formula is unchanged and now exact.
4. P2a's `PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2` is unchanged; P2b adds `mapContractHash` to the REQUIRED preview list
   `PREVIEW_SOURCE_ROW_KEYS_V2` (P2b Task 6 updates the pins).
5. P2b deletes `assertDebateShapeRunnerReady` and the Phase-2a guard at EVERY site P2a put it (six: runner boot,
   practice runner, hosted readiness, API boot step `debate-shape-runner-pending`, practice ask, and the runner's per-run
   `refuseDebateShapeReceiptInPhase2a`), with their imports, comments and pinning tests, and rewrites the README rows.
   Task 6 Step 3b removes the five boot sites; the per-run refusal is removed in Task 13, where the runner starts
   arguing the shape (pre-flight PF-B24a), so no commit in between argues a shaped receipt as today's shape.

**P2c (what people see) must change:**

1. Task 5 Step 6 / L1667, L1681: `MapChoiceRepository` is imported from **`@debateai/map`**, not `@debateai/db`;
   `apps/api/package.json` gains `"@debateai/map": "workspace:*"`; `tools/orphan-audit/src/index.ts` apps/api row gains
   `"map"`. The gate grep (L35) finds `readMapChoiceForRun` in `packages/map/src/repository.ts`.
2. `readMapChoiceForRun(runId)` returns `MapChoiceRecord` (Task 8): `answers[]` has `statement` and
   `rootNodeId: string | null` (plus `answerId`, `rootIndex`, `maker`, `filled`); `alsoRaised[]` has `claim` and
   `makers` (plus `keyPointId`), most-raised first. P2c's `MapChoiceRecord` port is satisfied structurally.
3. Task 3 (L758–L941): the variable is **`debateShapeMap: MapResult | null`**, in scope at the story hook
   (`buildStoryRunSnapshot({`), null when the run has no shape or the map was unavailable. P2b ADDS an
   `@debateai/map` import line to `apps/runner/src/index.ts` (none exists today). P2c's `storyAlsoRaisedFrom` lives in
   `apps/runner/src/story-snapshot.ts`, so P2c imports it from `./story-snapshot.js`, not on P2b's map line.
4. Labels for the eight new marks (`apps/ui/lib/v3/labels.ts`, `debateChrome.condition.*` in every locale) and the
   `reportModel` `pointNote` cases are P2b's (Task 3); P2c adds none. The opposite-answer template in every site
   language and the synthesizer length sentence are P2b's (Tasks 2, 5).

**P2d (practice and proof) must change:**

1. Deviation 6 and Task 0 (L129–L134, L178–L196, L1076, L1141–L1148): the readers are exported from
   **`@debateai/map`** (`packages/map/src/repository.ts`), both as free functions `(pool, runId)` and as
   `MapChoiceRepository` methods; the gate grep path is `packages/map/src`.
2. Deviation 7 and the Task 0 gate "no `hashes.map` read" (L136, L195) are reversed by P2b: the runner (and
   `tools/preview-practice/practice-runner-composition.ts`, which P2b mirrors) reads the optional row `mapContractHash`
   and refuses to boot when a `debateShapePolicy` row is present without it. The practice throwaway register version
   must therefore ALSO supersede `judgeContractHash` and `composerContractHash` with the code's values and add
   `mapContractHash = mapPromptContractHash()` (throwaway database only; the copies come from
   `buildDevelopmentRunnerRegisterRows()`). Ruled YES (controller ruling X3, 2026-10-13); P2d's plan carries it.
3. The report counts: `SCRUTINY-EXTENDED` is one row per scrutinised node (L1216, L1786: "scrutinised points", not
   "extra exchanges"); `PANEL-CLOSE-CALL-EXTENDED` one row per extended node.
4. Task 6 (L1547, L1601): P2b's Task 15 already teaches `classifyGateRequest` a `"MAP"` kind (by `MAP_CONTRACT_IDS`)
   and the new judge contracts still classify as `"JUDGE"`; P2d reuses it instead of adding its own.
5. Reassigned lists use `MAP:list:<i>:2`; `practiceMapStepOf` reads the second segment, so it still counts as `list`.
6. The migration is `0116_debate_shape_map.sql` (renumbered at merge if the preview applied another 0116).

**P2L (question language) runs after this whole plan and needs from it** (P2L "Cross-plan amendments" P2b-1..5):

1. Task 2 keeps the branch's reply-side `mapWrongLanguage(text, expected: ReplyLanguageExpectation)` (Task 2 below).
2. P2L adds NO condition mark (its ruling CR-3: the planner's language disagreement is an operator-only map NOTE,
   `MAP_NOTES` += `"LANGUAGE_PLANNER_DISAGREES"`). `CONDITION_MARKS` stays at this plan's 46, and `DEBATE_SHAPE_MARKS` at
   eight. P2L's old amendment 2 (a ninth shape mark) is dropped.
3. The preview's `mapContractHash` is not published before P2L Task 15 lands: P2L changes the angle planner's instruction
   and answer form, so `mapPromptContractHash()` moves once more (Owner steps 1). Dev registers re-seal by themselves.
4. `mapConditionRecords(result, runId, servedRootNodeId)` (Task 12; the third argument is pre-flight PF-B47) converts
   every `MapMarkRecord` the result holds, never a fixed list; map notes (`result.notes`) never become condition records.
5. The shape harness (Task 15) passes `argumentLanguageTag` / `argumentLanguageName` to `startRun` explicitly (default
   `"en"` / `"English"`). The scripted `MAP:angles` reply does NOT carry `question_language` in this plan: today's
   `mapAnglesReplySchema` is strict and would refuse it. P2L Task 15 makes the member optional and P2L Task 17 adds it
   to the scripted reply. The harness exports `runShapeDebate(harness, options)` (options include `language?` and
   `question?`; pre-flight PF-B53); P2L Task 17 calls it and adds only `prompts` to its result.

## File Structure

New files:

| File | Responsibility |
|---|---|
| `packages/map/src/opposite-templates.ts` | The code-owned opposite-answer template in every site language (Task 2) |
| `packages/map/src/repository.ts` | `MapChoiceRepository` + free readers: write/read `core.map_item`, `core.map_choice`, `core.map_position` (Task 8) |
| `migrations/0116_debate_shape_map.sql` | The three append-only map tables with encryption, attestation, erasure, TRUNCATE and mutation guards (Task 7) |
| `migrations/lineage/debate-shape-map-forward0116.json` | The forward-chain manifest (Task 7) |
| `packages/db/src/migration-forward0116.ts` | The forward-chain loader with its postcondition evidence (Task 7) |
| `packages/register/src/map-contract-hash.ts` | Optional row `mapContractHash`: reader and row builder (Task 6) |
| `apps/runner/src/debate-shape-boot.ts` | Boot resolution of the runner's shape settings (map hash check) (Task 6) |
| `apps/runner/src/map-stage.ts` | The runner's `MapCaller` adapter, per-step bounds, stop mapping, map mark records (Task 12) |
| `apps/runner/src/shape-plan.ts` | Pure: positions from the map (or today's opening), round-1 points, rivals, the breadth-first leg list, scrutiny slots (Task 9) |
| `apps/runner/src/shape-seats.ts` | Pure: distinct-maker seat order, root hand-over, writer choice (Task 9) |
| `apps/runner/src/shape-select.ts` | Pure: adaptive chain choice by root leverage, scrutiny need ranking, close-call extra seats (Tasks 10, 11) |
| `tests/support/debate-shape-harness.ts` | Shaped admission + scripted map answers + `runShapeDebate` for integration suites (Task 15) |
| `tests/support/scripted-answers.ts`, `tests/support/saved-debate.ts` | Moved out of `parallel-calls-debate.test.ts`: scripted answers, the saved-debate snapshot and the database copy helpers (Task 15; pre-flight PF-B54) |
| `tests/support/synthesisRequestFixture.ts` | A synthesis request fixture for the length tests (Task 5; pre-flight PF-B16; P2L reuses it) |
| `tests/unit/map-orchestrator-stops.test.ts`, `tests/unit/map-multilingual.test.ts`, `tests/unit/debate-shape-marks.test.ts`, `tests/unit/judge-shape-legs.test.ts`, `tests/unit/synthesizer-length.test.ts`, `tests/unit/debate-shape-boot.test.ts`, `tests/unit/shape-plan.test.ts`, `tests/unit/shape-select.test.ts`, `tests/unit/shape-close-call.test.ts`, `tests/unit/map-stage.test.ts`, `tests/architecture/debate-shape-map-0116-contract.test.ts` | Unit / architecture tests |
| `tests/integration/map-choice-repository.test.ts`, `tests/integration/debate-shape-run.test.ts`, `tests/integration/debate-shape-row-absent.test.ts` | Integration tests (embedded Postgres, one at a time) |

Modified files (main ones): `packages/map/src/{orchestrator,types,text,replies,keypoints,choose,index}.ts`,
`packages/map/package.json`, `packages/kernel/src/index.ts`, `packages/serve/src/{index,synthesis}.ts`,
`packages/judgement/src/{prompts,index}.ts`, `packages/crypto/src/index.ts` (`CONTENT_CARRIERS`),
`packages/db/src/{schema,migration-forward-chain}.ts`, `packages/register/src/index.ts`, `packages/register/src/debate-shape-policy.ts`
(delete the P2a guard), `apps/runner/src/{index,main,dev-deployment-register}.ts`, `apps/runner/package.json`,
`apps/ui/lib/v3/labels.ts`, `apps/ui/lib/report/reportModel.ts`, `apps/ui/messages/*/debateChrome.json`,
`acceptance/moment-tools.ts`, `deploy/preview-auth-dev/v1/publish-register-v2.ts`,
`tools/preview-practice/practice-runner-composition.ts`, `tools/orphan-audit/src/index.ts`,
`tests/support/{preview-gate-stubs,preview-debate-harness,shipped-corpus.manifest}.ts|txt`, `pnpm-lock.yaml` (Tasks 6, 8),
`apps/api/src/{index,main}.ts`, `acceptance/seed-register.ts`, `tools/preview-practice/practice-lanes.ts`,
`deploy/preview-release/v1/release-artifacts.mjs`, `deploy/preview-auth-dev/v1/native-operator.mjs`, the deploy READMEs,
and the pinned tests named in each task.

---

### Task 1: The map package answers the runner: STOPPED, abandon, codes kept, reassigned keys

**Files:**
- Modify: `packages/map/src/types.ts`, `packages/map/src/orchestrator.ts`
- Modify: `tests/unit/map-orchestrator.test.ts` (two reassigned-key filters and one script line, pre-flight PF-B2)
- Modify: `tests/unit/map-package.test.ts` (its exact `MAP_NOTES` list gains `"MAP_STOPPED"`, pre-flight PF-B1)
- Create: `tests/unit/map-orchestrator-stops.test.ts`

Implementer note (pre-flight PF-B3): `tools/preview-practice/practice-openings-log.ts` has no `switch` over
`MapCallRecord["outcome"]` (it only stores `Omit<MapResult, "calls">`), so it needs no edit; the root typecheck in
Step 4 confirms it.

**Interfaces:**

```ts
// types.ts
export const MAP_NOTES = Object.freeze(["LIST_REASSIGNED", "LIST_DROPPED", "MERGE_ITEMS_KEPT", "GAP_SKIPPED", "GAP_STOPPED", "MAP_STOPPED"] as const);
export type MapCallRecord = Readonly<{ /* as today */ outcome: "OK" | "FAILED" | "BUSY" | "STOPPED"; code: string | null }>;
export type MapResult = Readonly<{ /* as today */ stoppedBy: string | null }>;
// orchestrator.ts
export type MapCallOutcome<T> =
  | Readonly<{ kind: "OK"; value: T }> | Readonly<{ kind: "FAILED"; code: string }>
  | Readonly<{ kind: "BUSY"; code: string }> | Readonly<{ kind: "STOPPED"; code: string }>;
export type MapRunInput = Readonly<{ /* as today */ abandon?: (error: unknown) => boolean }>;
export function mapListCallSiteKey(listIndex: number, wave: 1 | 2): string;
export function mapErrorCodeOf(error: unknown): string;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/map-orchestrator-stops.test.ts
import { describe, expect, it } from "vitest";
import {
  mapErrorCodeOf, mapListCallSiteKey, mapRunAngleMap,
  type MapCallOutcome, type MapCallRequest, type MapCaller, type MapRunInput, type MapSeat
} from "@debateai/map";
import { TypedDomainError } from "@debateai/kernel";

const STOP = { finishReason: "stop" };
const why = "It matters for the riders.";
const SEATS = [0, 1, 2, 3].map((index): MapSeat => ({ aiRef: `ai-${String(index)}`, maker: `m${String(index)}` }));
const ANGLES = JSON.stringify({ angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the asker fears." },
  { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do first." },
  { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays." }] });
const LIST = (order: number) => JSON.stringify({ points: [
  { claim: `Point one, ${String(order)}.`, why_it_matters: why, leans: "against_some_answer" },
  { claim: `Point two, ${String(order)}.`, why_it_matters: why, leans: "for_some_answer" },
  { claim: `Point three, ${String(order)}.`, why_it_matters: why, leans: "context" }],
  candidate_answers: [order % 2 === 0 ? "Yes, with conditions." : "No, keep it as it is."] });

type Reply = string | MapCallOutcome<never> | Error;
function caller(script: (request: MapCallRequest<unknown>) => Reply): { caller: MapCaller; asked: string[] } {
  const asked: string[] = [];
  return { asked, caller: { async call<T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> {
    asked.push(request.callSiteKey);
    const reply = script(request as MapCallRequest<unknown>);
    if (reply instanceof Error) throw reply;
    if (typeof reply !== "string") return reply;
    return { kind: "OK", value: request.spec.read(reply, STOP) };
  } } };
}
const input = (c: MapCaller, extra: Partial<MapRunInput> = {}): MapRunInput => ({
  questionLine: "Should a city make its buses free?", languageName: "English", languageTag: "en", seats: SEATS,
  caller: c, seed: "s|C", gapRoundsMax: 2, maxAnswers: 3, pointsPerAnswer: 3, ...extra });

describe("map stops (Phase 2 runner contract)", () => {
  it("a STOPPED call stops the map: no later call is made, the code fallbacks finish it, the stop is recorded", async () => {
    const run = caller((request) => request.step === "ANGLES" ? ANGLES
      : request.step === "LIST" ? LIST(request.order)
      : request.step === "MERGE" ? { kind: "STOPPED", code: "RUN_COST_ENVELOPE_MONEY_REACHED" } : new Error("never asked"));
    const result = await mapRunAngleMap(input(run.caller));
    expect(run.asked).toEqual(["MAP:angles", "MAP:list:0", "MAP:list:1", "MAP:list:2", "MAP:list:3", "MAP:merge"]);
    expect(result.kind).toBe("MAP");
    expect(result.stoppedBy).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(result.marks.map((mark) => mark.mark)).toEqual(expect.arrayContaining(["MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK"]));
    expect(result.notes.map((note) => note.note)).toContain("MAP_STOPPED");
    expect(result.calls.at(-1)).toMatchObject({ callSiteKey: "MAP:merge", outcome: "STOPPED", code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(result.choice!.answers.length).toBeGreaterThanOrEqual(2);
  });

  it("a stop while lists run keeps the lists already paid for and reassigns nothing", async () => {
    const run = caller((request) => request.step === "ANGLES" ? ANGLES
      : request.callSiteKey === "MAP:list:1" ? { kind: "STOPPED", code: "CALL_LANE_STOPPED" }
      : request.step === "LIST" ? LIST(request.order) : new Error("never asked"));
    const result = await mapRunAngleMap(input(run.caller));
    // No second-wave list key (MAP:list:<i>:2) was asked: a stop reassigns nothing (pre-flight PF-B3).
    expect(run.asked.filter((key) => key.split(":").length === 4)).toEqual([]);
    expect(run.asked).not.toContain("MAP:merge");
    expect(result.items.filter((item) => item.kind === "POINT")).toHaveLength(9);
    expect(result.stoppedBy).toBe("CALL_LANE_STOPPED");
  });

  it("a stop before two lists arrived ends in today's opening", async () => {
    const run = caller((request) => request.step === "ANGLES" ? { kind: "STOPPED", code: "PERSON_ALLOWANCE_REACHED" } : new Error("never"));
    const result = await mapRunAngleMap(input(run.caller));
    expect(run.asked).toEqual(["MAP:angles"]);
    expect(result.kind).toBe("UNAVAILABLE");
    expect(result.marks.map((mark) => mark.mark)).toEqual(["MAP_ANGLES_FALLBACK", "MAP_UNAVAILABLE_TODAYS_OPENING"]);
  });

  it("an error the caller marks as abandon is rethrown, never turned into a fallback", async () => {
    const lost = new TypedDomainError("RUNNER_CLAIM_LOST", "claim lost");
    const run = caller((request) => request.step === "ANGLES" ? ANGLES : lost);
    await expect(mapRunAngleMap(input(run.caller, { abandon: (error) => error === lost }))).rejects.toBe(lost);
  });

  it("a thrown typed error keeps its code; an untyped one is MAP_CALLER_THREW", async () => {
    expect(mapErrorCodeOf(new TypedDomainError("CALL_BUDGET_EXHAUSTED", "x"))).toBe("CALL_BUDGET_EXHAUSTED");
    expect(mapErrorCodeOf(new Error("boom"))).toBe("MAP_CALLER_THREW");
    expect(mapErrorCodeOf({ code: "lower case" })).toBe("MAP_CALLER_THREW");
  });

  it("a reassigned list is asked under its own key, after the first wave", async () => {
    expect(mapListCallSiteKey(2, 1)).toBe("MAP:list:2");
    expect(mapListCallSiteKey(2, 2)).toBe("MAP:list:2:2");
    const run = caller((request) => request.step === "ANGLES" ? ANGLES
      : request.callSiteKey === "MAP:list:2" ? { kind: "FAILED", code: "TEST_FAILED" }
      : request.step === "LIST" ? LIST(request.order) : { kind: "FAILED", code: "TEST_FAILED" });
    const result = await mapRunAngleMap(input(run.caller, { gapRoundsMax: 0 }));
    const lists = result.calls.filter((call) => call.step === "LIST").map((call) => `${call.callSiteKey}@${call.aiRef}`);
    expect(lists).toEqual(["MAP:list:0@ai-0", "MAP:list:1@ai-1", "MAP:list:2@ai-2", "MAP:list:3@ai-3", "MAP:list:2:2@ai-0"]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/map-orchestrator-stops.test.ts`
Expected: FAIL (`mapErrorCodeOf`/`mapListCallSiteKey` are not exported; `stoppedBy` undefined).

- [ ] **Step 3: Implement**

In `packages/map/src/types.ts`: add `"MAP_STOPPED"` at the end of `MAP_NOTES`; widen `MapCallRecord.outcome` to
`"OK" | "FAILED" | "BUSY" | "STOPPED"`; add `stoppedBy: string | null;` as the last member of `MapResult` with the doc
comment `/** The code of the stop (money, attempts, lane) that ended the map early; null when it ran to its end. */`.

In `packages/map/src/orchestrator.ts`:

```ts
/** The spec's list key; a list handed to another seat (spec §1.2) is asked under its own key, so each key is one task. */
export function mapListCallSiteKey(listIndex: number, wave: 1 | 2): string {
  return wave === 1 ? `MAP:list:${String(listIndex)}` : `MAP:list:${String(listIndex)}:2`;
}

/** The code a thrown caller error carries (a typed domain code), else MAP_CALLER_THREW. Never the error's message. */
export function mapErrorCodeOf(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,95}$/u.test(code) ? code : "MAP_CALLER_THREW";
}
```

Extend `MapCallOutcome<T>` with `| Readonly<{ kind: "STOPPED"; code: string }>` and `MapRunInput` with
`/** True for an error that ends the run (claim lost, time limit): rethrown, never a fallback. */ abandon?: (error: unknown) => boolean;`.

In `class MapRun` add `stoppedBy: string | null = null;` and replace `mapAsk` with:

```ts
  async mapAsk<T>(step: MapStep, callSiteKey: string, seat: MapSeat, shown: "BLIND" | readonly string[], spec: MapStepSpec<T>): Promise<T | null> {
    // A stop ends the map: nothing new is asked; what already arrived is kept, and the code's fallbacks finish it.
    if (this.stoppedBy !== null) return null;
    const order = this.#next;
    this.#next += 1;
    let outcome: MapCallOutcome<T>;
    try {
      outcome = await this.input.caller.call({ step, callSiteKey, seat, order, shown, spec });
    } catch (error) {
      if (this.input.abandon?.(error) === true) throw error;
      outcome = { kind: "FAILED", code: mapErrorCodeOf(error) };
    }
    this.calls.push(Object.freeze({ step, callSiteKey, aiRef: seat.aiRef, maker: seat.maker, order,
      shown: shown === "BLIND" ? "BLIND" : Object.freeze([...shown]), outcome: outcome.kind, code: outcome.kind === "OK" ? null : outcome.code }));
    if (outcome.kind === "BUSY") this.out.add(seat.aiRef);
    if (outcome.kind === "STOPPED" && this.stoppedBy === null) {
      this.stoppedBy = outcome.code;
      this.mapNote("MAP_STOPPED", step, outcome.code);
    }
    return outcome.kind === "OK" ? outcome.value : null;
  }
```

In `mapResult(parts)` add `stoppedBy: this.stoppedBy,` after `...parts,`. In `mapRunLists` take a wave:

```ts
function mapRunLists(run: MapRun, assignments: readonly MapListAssignment[], wave: 1 | 2): Promise<readonly MapListOutcome[]> {
  return Promise.all(assignments.map(async (assignment): Promise<MapListOutcome> => Object.freeze({
    assignment,
    reply: await run.mapAsk("LIST", mapListCallSiteKey(assignment.listIndex, wave), assignment.seat, "BLIND", mapListSpec(run.ctx, assignment.angle))
  })));
}
```

Call sites: `mapRunAngleMap` → `mapRunLists(run, mapListAssignments(...), 1)` and `mapRunLists(run, reassigned, 2)`;
`mapRunBlindLists` → `mapRunLists(run, assignments, 1)`. In `mapRunAngleMap`, skip the reassignment notes when the
map stopped: `const reassigned = run.stoppedBy === null ? mapReassignLists(failed, finished, run.out) : [];`.
The snowball keeps `MAP:list:<index>` (one wave). In `tests/unit/map-orchestrator.test.ts` (find each line by its
text; the reassigned call is now `MAP:list:2:2`):

- the two expectations that filter `call.callSiteKey === "MAP:list:2"` (the busy-reassignment test, ~141, and the
  "a list that fails again after its reassignment" test, ~239) become `call.callSiteKey.startsWith("MAP:list:2")`;
- (pre-flight PF-B2) the script line of that second test, ~238,
  `request.callSiteKey === "MAP:list:2" ? "FAIL" : normal(request)`, becomes
  `request.callSiteKey.startsWith("MAP:list:2") ? "FAIL" : normal(request)`. Without it the reassigned call
  `MAP:list:2:2` would succeed, and the expected `["ai-2:FAILED", "ai-0:FAILED"]` and `LIST_DROPPED` would break.

The "caller that throws" test (~179) stays green: a plain `Error` still reads `MAP_CALLER_THREW`.

(pre-flight PF-B1) In `tests/unit/map-package.test.ts`, the test "lists exactly the spec's marks, the notes and the
steps" pins `MAP_NOTES` exactly: change its expectation to
`expect([...MAP_NOTES]).toEqual(["LIST_REASSIGNED", "LIST_DROPPED", "MERGE_ITEMS_KEPT", "GAP_SKIPPED", "GAP_STOPPED", "MAP_STOPPED"]);`.

- [ ] **Step 4: Run — expect PASS**

Run each file alone, one after another:

```bash
pnpm exec vitest run tests/unit/map-orchestrator-stops.test.ts
pnpm exec vitest run tests/unit/map-orchestrator.test.ts
pnpm exec vitest run tests/unit/map-package.test.ts
pnpm exec vitest run tests/unit/practice-openings.test.ts
```

Expected: PASS. Then the typecheck (pre-flight PF-B4: no package except `apps/ui` has its own tsconfig, so the root
one is the only valid check; run it alone, no other heavy command at the same time):

```bash
pnpm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/map/src/types.ts packages/map/src/orchestrator.ts tests/unit/map-orchestrator-stops.test.ts tests/unit/map-orchestrator.test.ts tests/unit/map-package.test.ts
git commit -m "map: STOPPED outcome, abandon rethrow, typed codes kept, reassigned lists under MAP:list:<i>:2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The map in every language: primary subtags, non-Latin text, the gap guard, the opposite template

**Files:**
- Modify: `packages/map/src/text.ts`, `packages/map/src/replies.ts`, `packages/map/src/keypoints.ts`, `packages/map/src/choose.ts`, `packages/map/src/index.ts`
- Create: `packages/map/src/opposite-templates.ts`, `tests/unit/map-multilingual.test.ts`
- Modify (regenerated, pre-flight PF-B24): `tests/support/shipped-corpus.manifest.txt` (the new shipped file
  `packages/map/src/opposite-templates.ts` must be listed, or `tests/unit/s1-1-depth-contract.test.ts` goes red)

**Interfaces:**

```ts
export function mapPrimarySubtag(tag: string): string;                       // "ro-RO" → "ro", "und" → "und"
export function mapNormaliseText(text: string): string;                       // marks stripped only after Latin letters
export const MAP_OPPOSITE_TEMPLATES: Readonly<Record<string, Readonly<{ lead: string; empty: string }>>>;
export function mapOppositeTemplate(statement: string, languageTag: string): string; // unknown language → English
// keypoints.ts: mapAddGapPoints throws TypedDomainError("MAP_GAP_ITEM_UNKNOWN") for a gap item not in `items` or not GAP
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/map-multilingual.test.ts
import { describe, expect, it } from "vitest";
import {
  MAP_OPPOSITE_TEMPLATES, mapAddGapPoints, mapNormaliseText, mapOppositeTemplate, mapPrimarySubtag, mapWrongLanguage,
  type MapPointItem
} from "@debateai/map";
import { readdirSync } from "node:fs";

const SITE_LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

describe("the map in every language", () => {
  it("reads primary subtags, and Romanian text passes a Romanian expectation", () => {
    expect(mapPrimarySubtag("ro-RO")).toBe("ro");
    expect(mapPrimarySubtag("und")).toBe("und");
    // The branch's reply-side check (fix R-5) takes an expectation, never a tag: the question guesser stays out of the map.
    expect(mapWrongLanguage("Autobuzele gratuite ar costa orașul foarte mult în fiecare an.", { tag: "ro", script: "Latin" })).toBe(false);
  });

  it("keeps the vowel signs of non-Latin scripts and still folds Romanian diacritics", () => {
    expect(mapNormaliseText("Ș ș Ţ ţ")).toBe(mapNormaliseText("S s T t"));
    expect(mapNormaliseText("कि")).not.toBe(mapNormaliseText("क"));
    expect(mapNormaliseText("が")).not.toBe(mapNormaliseText("か"));
  });

  it("refuses a gap item that is not a GAP item of the map", () => {
    const item: MapPointItem = { itemId: "pt09", seat: { aiRef: "a", maker: "m" }, origin: "BLIND", angleId: null, angleKind: null,
      listIndex: 0, kind: "POINT", claim: "x", whyItMatters: "y", leans: "context" };
    expect(() => mapAddGapPoints({ keyPoints: [], mergedAnswers: [] }, [], [item])).toThrow(/MAP_GAP_ITEM_UNKNOWN/u);
    expect(() => mapAddGapPoints({ keyPoints: [], mergedAnswers: [] }, [item], [item])).toThrow(/MAP_GAP_ITEM_UNKNOWN/u);
  });

  it("has the opposite template in every site language, and English for anything else", () => {
    expect(Object.keys(MAP_OPPOSITE_TEMPLATES).sort()).toEqual(SITE_LOCALES);
    for (const [tag, { lead, empty }] of Object.entries(MAP_OPPOSITE_TEMPLATES)) {
      expect(lead.trim(), tag).not.toBe("");
      expect(empty.trim(), tag).not.toBe("");
      expect(`${lead} ${empty}`, tag).not.toMatch(/\d|score|grader|threshold|node/iu);
    }
    expect(mapOppositeTemplate("Da", "ro-RO")).toBe(`${MAP_OPPOSITE_TEMPLATES.ro!.lead}: Da`);
    expect(mapOppositeTemplate("", "xx")).toBe(MAP_OPPOSITE_TEMPLATES.en!.empty);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/map-multilingual.test.ts` — Expected: FAIL (`mapPrimarySubtag`, `MAP_OPPOSITE_TEMPLATES` missing).

- [ ] **Step 3: Implement**

`packages/map/src/text.ts`:

```ts
/** The primary language subtag ("ro-RO" → "ro"), lower case; "und" stays "und". */
export function mapPrimarySubtag(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/u)[0] ?? "und";
}

/**
 * The text a merge-by-rule compares: letters and digits only, lower case, single spaces. Combining marks are dropped
 * only after a LATIN letter (Romanian ș/ş and ț/ţ read alike); in other scripts a mark is part of the letter (Hindi
 * vowel signs, Japanese dakuten) and is kept. Used only to group identical claims; never shown to anyone.
 */
export function mapNormaliseText(text: string): string {
  return text.normalize("NFKD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC")
    .toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}
```

**Do NOT change `mapWrongLanguage`** (amendment 2026-10-13, P2L amendment 1). The branch already has
`mapWrongLanguage(text: string, expected: ReplyLanguageExpectation): boolean`, which asks the kernel's reply-side
`replyTextLanguageVerdict` and refuses only on `"OTHER"` (fix R-5), and every map check joins a field's texts before
checking (fix R-3, `mapLanguageIssues` in replies.ts). An earlier draft of this step replaced it with a
`detectArgumentLanguage` version: that would bring the question guesser back into the map. Keep its body and signature;
`mapPrimarySubtag` is still added, because the opposite template below uses it. `text.ts` keeps its kernel import line
as it is (no `detectArgumentLanguage` import).

`packages/map/src/replies.ts` and `keypoints.ts`: wherever two texts are compared by `mapNormaliseText` (the
`MAP_ANSWER_DUPLICATE` check in `mapChooseCheck`, `mapCodeMerge`'s grouping, `mapAddGapPoints`' match), treat an EMPTY
normalised text as matching nothing (`const key = mapNormaliseText(x); if (key === "") /* its own group / no duplicate */`).

`mapAddGapPoints` (keypoints.ts): right after its existing first line `const byId = mapItemsById(items);` (keep that
line; do not declare `byId` twice), add:

```ts
  for (const item of gapItems) {
    const known = byId.get(item.itemId);
    if (known === undefined || known.kind !== "POINT" || known.origin !== "GAP") {
      throw new TypedDomainError("MAP_GAP_ITEM_UNKNOWN", `MAP_GAP_ITEM_UNKNOWN: ${item.itemId}`);
    }
  }
```

(import `TypedDomainError` from `@debateai/kernel`; the orchestrator already passes `allItems` holding the gap items).

`packages/map/src/opposite-templates.ts` — one entry per directory in `apps/ui/messages/` (the site locales; list them
with `ls apps/ui/messages`). The `en` and `ro` texts are Phase 1's, unchanged:

```ts
/**
 * The last way to name a second answer when the map offers no different one (ANSWERS_FILLED, source TEMPLATE): code-owned
 * user-facing text, one entry per site locale (apps/ui/messages/<locale>). `lead` precedes the first answer's statement;
 * `empty` stands alone when that statement is empty. No numbers, no engine words. Owner wording: option 1 of 3 (plan
 * "Owner steps").
 */
export const MAP_OPPOSITE_TEMPLATES: Readonly<Record<string, Readonly<{ lead: string; empty: string }>>> = Object.freeze({
  en: Object.freeze({ lead: "The opposite of this answer", empty: "An answer different from the one above" }),
  ro: Object.freeze({ lead: "Opusul acestui răspuns", empty: "Un răspuns diferit de cel de mai sus" })
  // …one entry for EVERY other directory in apps/ui/messages, translated in Step 3b.
});
```

**Step 3b (translations):** dispatch parallel Haiku translators (model `haiku`, effort `xhigh`) by language group, as
spec §3.2 does for UI strings: each gets the two English phrases, the meaning ("the opposite of the answer just named";
"an answer different from the one above"), the rule "plain words, no numbers", and returns `{ locale: { lead, empty } }`
for its group. Then one Opus (effort `high`) spot-check of the risky locales (ar, he, hi, ja, ko, zh, vi, mt; the
site has no `th` and one `zh` folder): meaning, script, right-to-left text untouched. Paste the results into the table
(keys sorted). The 35 site locales today are: ar bg cs da de el en es et fi fr ga he hi hr hu id it ja ko lt lv mt nl
pl pt ro ru sk sl sv tr uk vi zh.

`packages/map/src/choose.ts`:

```ts
import { MAP_OPPOSITE_TEMPLATES } from "./opposite-templates.js";
import { mapPrimarySubtag } from "./text.js";

export function mapOppositeTemplate(statement: string, languageTag: string): string {
  const template = MAP_OPPOSITE_TEMPLATES[mapPrimarySubtag(languageTag)] ?? MAP_OPPOSITE_TEMPLATES.en!;
  return (statement.trim() === "" ? template.empty : `${template.lead}: ${statement.trim()}`).slice(0, MAP_LIMITS.claimMaxChars);
}
```

`packages/map/src/index.ts`: add `export * from "./opposite-templates.js";`.

(pre-flight PF-B24, ruling SC1) Regenerate the shipped-corpus manifest so it lists the new shipped file, then run the
same test file without the variable to prove the manifest is now current:

```bash
SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
```

Expected: both PASS, and `git diff tests/support/shipped-corpus.manifest.txt` shows exactly one added line,
`packages/map/src/opposite-templates.ts`.

- [ ] **Step 4: Run — expect PASS**

Run each file alone, one after another (pre-flight PF-B5 adds `map-items.test.ts`, which pins `mapNormaliseText`):

```bash
pnpm exec vitest run tests/unit/map-multilingual.test.ts
pnpm exec vitest run tests/unit/map-items.test.ts
pnpm exec vitest run tests/unit/map-choose.test.ts
pnpm exec vitest run tests/unit/map-keypoints.test.ts
pnpm exec vitest run tests/unit/map-replies.test.ts
pnpm exec vitest run tests/unit/map-orchestrator.test.ts
```

Expected: PASS (existing `en`/`ro` template expectations are unchanged; the Romanian folding pins in
`map-items.test.ts` still hold, because ș/ț marks sit after Latin letters).

- [ ] **Step 5: Commit**

```bash
git add packages/map tests/unit/map-multilingual.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "map: primary subtags, non-Latin normalisation, gap guard, opposite template in every site language

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Eight new condition marks with typed records, labels in every locale

**Files:**
- Modify: `packages/kernel/src/index.ts` (`CONDITION_MARKS`), `packages/serve/src/index.ts` (`ConditionMarkRecord["mark"]`, `REQUIRED_CONDITION_MARK_RECORDS`)
- Modify: `apps/ui/lib/v3/labels.ts`, `apps/ui/lib/report/reportModel.ts` (`pointNote`), `apps/ui/messages/*/debateChrome.json`
- Modify pins: `tests/unit/a16-backup-model-used-mark.test.ts:31`, `tests/unit/s14-live-projections.test.ts:43`, `tests/unit/dr174-resilience.test.ts:402`, `tests/unit/obs-l2-s02-registry.test.ts:425` (`Object.keys(CONDITION_MARK_SEVERITY)` length 46; the severity map is derived from `CONDITION_MARKS`, only the count is by hand), `acceptance/grok-relay.ts:126` (comment "46 members"), `acceptance/grok-relay.test.ts:699` (`expect(kernel.CONDITION_MARKS).toHaveLength(38)` → 46, pre-flight PF-B6)
- Create: `tests/unit/debate-shape-marks.test.ts`

**Interfaces:**

```ts
export const DEBATE_SHAPE_MARKS = Object.freeze(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
  "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED", "PANEL-CLOSE-CALL-EXTENDED", "SCRUTINY-EXTENDED"] as const);
// packages/kernel/src/index.ts — the same eight strings inserted in CONDITION_MARKS right after "PANEL-DEGRADED-SINGLE-VOICE"
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/debate-shape-marks.test.ts
import { describe, expect, it } from "vitest";
import { CONDITION_MARKS, DEBATE_SHAPE_MARKS } from "@debateai/kernel";
import { MAP_MARKS } from "@debateai/map";
import { assertRequiredConditionMarkRecords, type ConditionMarkRecord } from "@debateai/serve";
import { conditionMarkLabel } from "../../apps/ui/lib/v3/labels.js";

// Pre-flight PF-B47: every record names a node, because `ServeRepository.persist` refuses an empty list
// (CONDITION_MARK_AFFECTED_NODES_REQUIRED). An answer-scope map record carries the SERVED ROOT's node id (as the runner's
// `mapConditionRecords(result, runId, servedRootNodeId)` writes it, Task 12); a node-scope extension record names its node.
const record = (mark: ConditionMarkRecord["mark"], scope: "answer" | "node"): ConditionMarkRecord => Object.freeze({
  mark, scope, subjectRef: scope === "node" ? "node-0" : "run-1", reason: `${mark}:TEST`, liftPath: null, servedRootRule: null,
  affectedNodeIds: ["node-0"] });

describe("the debate shape's condition marks", () => {
  it("sit in the kernel list right after the panel marks, never in the DR-176 tail", () => {
    const at = CONDITION_MARKS.indexOf("PANEL-DEGRADED-SINGLE-VOICE");
    expect(CONDITION_MARKS.slice(at + 1, at + 1 + DEBATE_SHAPE_MARKS.length)).toEqual([...DEBATE_SHAPE_MARKS]);
    expect(CONDITION_MARKS.slice(-4)).toEqual(["HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"]);
    expect(CONDITION_MARKS).toHaveLength(46);
  });

  it("names every map mark the map package mints", () => {
    for (const mark of MAP_MARKS) expect(DEBATE_SHAPE_MARKS).toContain(mark);
  });

  it("each requires its typed record, both ways", () => {
    for (const mark of DEBATE_SHAPE_MARKS) {
      expect(() => assertRequiredConditionMarkRecords([mark], [])).toThrow(/CONDITION_MARK_RECORD_REQUIRED/u);
      expect(() => assertRequiredConditionMarkRecords([], [record(mark, "answer")])).toThrow(/CONDITION_MARK_RECORD_WITHOUT_MARK/u);
      expect(() => assertRequiredConditionMarkRecords([mark], [record(mark, mark.includes("EXTENDED") ? "node" : "answer")])).not.toThrow();
    }
  });

  it("has a distinct plain label with no internals and no grading or judging words", () => {
    const labels = DEBATE_SHAPE_MARKS.map((mark) => conditionMarkLabel(mark));
    expect(new Set(labels).size).toBe(labels.length);
    // Ruling PF-B9: user-facing mark labels never speak of grading, scores, judges, thresholds or panels.
    for (const label of labels) expect(label).not.toMatch(/\d|grade|score|judg|threshold|panel|dispersion|leverage|node|MAP_/iu);
    // Distinct from every other mark's label too, so the page never names two marks alike.
    for (const mark of DEBATE_SHAPE_MARKS) {
      expect(CONDITION_MARKS.filter((other) => conditionMarkLabel(other) === conditionMarkLabel(mark))).toEqual([mark]);
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-marks.test.ts` — Expected: FAIL (`DEBATE_SHAPE_MARKS` not exported).

- [ ] **Step 3: Implement**

`packages/kernel/src/index.ts`, after the line `"PANEL-DEGRADED-SINGLE-VOICE",`:

```ts
  // Debate shape (spec 2026-10-12 §3.3): the map's fallbacks and fills (answer scope) and the two extensions (node
  // scope: a close call that gained graders, a point that got scrutiny). Placed HERE, mid-list, never at the DR-176 tail.
  "MAP_ANGLES_FALLBACK",
  "MAP_MERGE_FALLBACK",
  "MAP_CHOOSE_FALLBACK",
  "MAP_UNAVAILABLE_TODAYS_OPENING",
  "ANSWERS_FILLED",
  "CHOOSE_QUOTA_FILLED",
  "PANEL-CLOSE-CALL-EXTENDED",
  "SCRUTINY-EXTENDED",
```

and after the `ConditionMark` type:

```ts
/** The debate shape's marks, in their CONDITION_MARKS order. */
export const DEBATE_SHAPE_MARKS = Object.freeze(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
  "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED", "PANEL-CLOSE-CALL-EXTENDED", "SCRUTINY-EXTENDED"] as const satisfies readonly ConditionMark[]);
export type DebateShapeMark = typeof DEBATE_SHAPE_MARKS[number];
```

`packages/serve/src/index.ts`: append `| DebateShapeMark` to `ConditionMarkRecord["mark"]` (import the type from
`@debateai/kernel`), and append the eight strings to `REQUIRED_CONDITION_MARK_RECORDS` with the comment
`// Debate shape: every map fallback/fill and every extension carries its typed record (answer scope for the map, naming the served root's node in affectedNodeIds; node scope for the extensions, naming their node).`
(pre-flight PF-B47: no debate-shape record ever has an empty `affectedNodeIds`; `persist` refuses one.)

`apps/ui/lib/v3/labels.ts`, in `conditionMarkLabel`, after the `"PANEL-DEGRADED-SINGLE-VOICE"` case:

```ts
    case "MAP_ANGLES_FALLBACK": return t(catalog, "debateChrome.condition.mapAnglesFallback");
    case "MAP_MERGE_FALLBACK": return t(catalog, "debateChrome.condition.mapMergeFallback");
    case "MAP_CHOOSE_FALLBACK": return t(catalog, "debateChrome.condition.mapChooseFallback");
    case "MAP_UNAVAILABLE_TODAYS_OPENING": return t(catalog, "debateChrome.condition.mapUnavailable");
    case "ANSWERS_FILLED": return t(catalog, "debateChrome.condition.answersFilled");
    case "CHOOSE_QUOTA_FILLED": return t(catalog, "debateChrome.condition.chooseQuotaFilled");
    case "PANEL-CLOSE-CALL-EXTENDED": return t(catalog, "debateChrome.condition.closeCallExtended");
    case "SCRUTINY-EXTENDED": return t(catalog, "debateChrome.condition.scrutinyExtended");
```

`apps/ui/messages/en/debateChrome.json`: eight FLAT, fully qualified keys (pre-flight PF-B7: the catalog has no
nested `condition` object; every key is written out, e.g. `"debateChrome.condition.panelDegradedSingleVoice"`), placed
right after the `"debateChrome.condition.panelDegradedSingleVoice"` line. Owner wording: option 1 of 3 (ruling PF-B9:
no grading, scoring, judging, threshold or panel words, no ids or codes; options 2 and 3 are in the "Owner steps" list
at the end of this plan):

```json
"debateChrome.condition.mapAnglesFallback": "The question was explored from a standard set of angles",
"debateChrome.condition.mapMergeFallback": "Similar points were grouped together by a simple rule",
"debateChrome.condition.mapChooseFallback": "The answers to debate were picked by a simple rule",
"debateChrome.condition.mapUnavailable": "Each AI started with its own answer",
"debateChrome.condition.answersFilled": "A second answer was added so two answers could be compared",
"debateChrome.condition.chooseQuotaFilled": "A point was added so every side was heard",
"debateChrome.condition.closeCallExtended": "This point was close, so more AIs looked at it",
"debateChrome.condition.scrutinyExtended": "The AIs examined this point more closely"
```

Every other `apps/ui/messages/<locale>/debateChrome.json` (the other 34 locales): the same eight flat keys, each
translating option 1 above, by parallel Haiku translators by language group + one Opus spot-check of the risky locales
(as in Task 2 Step 3b). Tell the translators the rule: plain words, no numbers, and no word for grading, scoring,
judging, thresholds or panels. The parity check below refuses a locale that misses a key or leaves one empty.

`apps/ui/lib/report/reportModel.ts`, in the exhaustive `pointNote` switch: the eight new marks return `null`, added
beside the other `return null` cases (next to `"BACKUP-MODEL-USED"`). The six map marks are said once for the whole
answer, not about one point (their record names the served root's node, pre-flight PF-B47); the two extensions are
engine detail the page shows through the label only.

Pins: bump the CONDITION_MARKS length pins from 38 to 46 in the four unit tests named above, in
`acceptance/grok-relay.test.ts` (the case "names the degradation with the acceptance-harness code…", pre-flight
PF-B6; add a comment `// Debate shape (Phase 2b) minted eight marks mid-list: 38 -> 46.`), and the comment in
`acceptance/grok-relay.ts`. Do not touch any `slice(-4)` expectation. 46 is final for Phase 2: P2L adds no condition
mark (its ruling CR-3 keeps the planner's language disagreement operator-only, as a map note).

- [ ] **Step 4: Run — expect PASS**

Run each file alone, one after another:

```bash
pnpm exec vitest run tests/unit/debate-shape-marks.test.ts
pnpm exec vitest run tests/unit/a16-backup-model-used-mark.test.ts
pnpm exec vitest run tests/unit/s14-live-projections.test.ts
pnpm exec vitest run tests/unit/dr174-resilience.test.ts
pnpm exec vitest run tests/unit/obs-l2-s02-registry.test.ts
pnpm exec vitest run tests/unit/v2ui-data-layer.test.ts
pnpm exec vitest run tests/unit/story-i18n.test.ts
pnpm exec vitest run acceptance/grok-relay.test.ts -t "names the degradation"
```

Expected: PASS. Then the real i18n parity check (pre-flight PF-B8): it is a node:test file in `apps/ui`, whose
`assertLocalizedCatalog` demands the exact key set of the English catalog in every locale. Run it from `apps/ui`:

```bash
cd apps/ui && node --import tsx --test lib/i18n/debateChrome.test.mjs
```

Expected: every test passes (all 35 locales carry the eight new keys, none empty). Then the UI typecheck, alone
(`apps/ui` has its own tsconfig; the root typecheck excludes it):

```bash
pnpm exec tsc -p apps/ui --noEmit
```

Then the root typecheck, alone (the kernel and serve unions moved):

```bash
pnpm run typecheck
```

Expected: no errors in either.

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/index.ts packages/serve/src/index.ts apps/ui acceptance/grok-relay.ts acceptance/grok-relay.test.ts tests/unit
git commit -m "kernel: eight debate-shape condition marks mid-list, required typed records, labels in every locale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The judge learns `assigned-root` and the `consideration` variant; the judge hash grows

**Files:**
- Modify: `packages/judgement/src/prompts.ts`, `packages/judgement/src/index.ts`
- Modify: `acceptance/moment-tools.ts` (the `judgeLegSchema`, the JUDGE_JUDGE contract-id parse ~234, and the
  JUDGE_JUDGE excerpts in `graderContextOf` ~315; pre-flight PF-B12), `tests/unit/prompt-text-pins.test.ts`,
  `tests/unit/a13-model-role.test.ts` (a `LEGS` entry AND an `EXPECTED_LEG_ROLE` row; pre-flight PF-B11)
- Modify hash pins: `tests/unit/hs-s01-seal.test.ts` (the `judgeContractHash` row, ~:53), `tests/unit/f-sealedrows-a-conformance-extractor.test.ts` (`acceptance.judgeContractHash` pin, ~:101-102), `acceptance/seed-register.test.ts` (~:45)
- Modify (judge side only, pre-flight PF-B10): `tests/unit/answer-writer-v3-register-12.test.ts` — the exact lines are
  listed in Step 3; Task 5 later changes only that file's composer lines, never these
- Create: `tests/unit/judge-shape-legs.test.ts`

Implementer note (pre-flight PF-B13): from this task on, the judge fingerprint the code sends differs from the one
the preview's register 12 seals (`e7f7e4b0…`). `assertRegisterPromptContractHashes` runs at the runner's boot
(`apps/runner/src/main.ts`) and in `tools/preview-practice/practice-runner-composition.ts`, so this branch can NOT boot
or practise on the preview's live register 12, with or without a debate-shape row. It runs on the development
register (the dev builder seals the code's own hashes) and on a practice `--register-next` version composed from it.
On the preview it boots only after the owner publishes a NEW register version carrying the new judge and composer
hashes and `mapContractHash`, after P2L Task 15 (Owner steps). Do not try to make it boot by editing a sealed value.

**Interfaces:**

```ts
export const JUDGE_LEG_KINDS = ["primary-root", "independent-root", "support", "attack", "cross-root", "assigned-root"] as const;
export const JUDGE_LEG_KINDS_V1 = ["primary-root", "independent-root", "support", "attack", "cross-root"] as const;
export const JUDGE_CONSIDERATION_SENTENCE = "Build your reply on the consideration named in consideration.";
export const JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS: Readonly<Record<"support" | "attack", readonly string[]>>;
export function judgeConsiderationPromptContract(leg: "support" | "attack", claimType: keyof typeof JUDGE_CLAIM_TYPE_INSTRUCTIONS): PromptContract;
export const JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1: string;   // today's text, frozen
export const JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT: string;      // V1 + "\n---\n" + the six new contracts
export type JudgeLeg =
  | { readonly kind: "primary-root" } | { readonly kind: "independent-root" }
  | { readonly kind: "assigned-root"; readonly assignedAnswer: string; readonly mapPoints: string }
  | { readonly kind: "support" | "attack"; readonly positionUnderDebate: string; readonly consideration?: string | undefined }
  | { readonly kind: "cross-root"; readonly ownPosition: string; readonly otherMakersPosition: string };
// `consideration?: string | undefined`, not `?: string`: the repo compiles with `exactOptionalPropertyTypes`, and the
// moment replay's zod schema (`text.optional()`) reads an optional field as `string | undefined`. Every reader tests
// `leg.consideration !== undefined`, so both spellings behave the same.
export const framedJudgePromptForTest: typeof framedJudgePrompt;     // test seam, the same function
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/judge-shape-legs.test.ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readPromptFrame, promptContractFingerprintText } from "@debateai/providers";
import {
  JUDGE_CONSIDERATION_SENTENCE, JUDGE_LEG_KINDS, JUDGE_LEG_MATERIAL_FIELDS, JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT,
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1, judgeConsiderationPromptContract, judgeLegModelRole, judgePromptContract,
  framedJudgePromptForTest, type JudgeLeg
} from "@debateai/judgement";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
/** Today's sealed judge hash (register v11+): the V1 text must still produce it, byte for byte. */
const TODAY_JUDGE_HASH = "e7f7e4b0e7066fb2b873c4435b2bd593a0a399f8de506604c35b92222fdb1365";

describe("judge legs for the debate shape", () => {
  it("today's five legs, review and panel are byte-identical: the V1 fingerprint is today's sealed hash", () => {
    expect(sha(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1)).toBe(TODAY_JUDGE_HASH);
    expect(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT.startsWith(`${JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1}\n---\n`)).toBe(true);
  });

  it("appends exactly the six new contracts to the fingerprint", () => {
    const tail = JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT.slice(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1.length + 5);
    expect(tail).toBe([
      promptContractFingerprintText(judgePromptContract("assigned-root", "unknown")),
      promptContractFingerprintText(judgePromptContract("assigned-root", "resolved")),
      promptContractFingerprintText(judgeConsiderationPromptContract("support", "unknown")),
      promptContractFingerprintText(judgeConsiderationPromptContract("support", "resolved")),
      promptContractFingerprintText(judgeConsiderationPromptContract("attack", "unknown")),
      promptContractFingerprintText(judgeConsiderationPromptContract("attack", "resolved"))
    ].join("\n---\n"));
  });

  it("assigned-root sends question_line, assigned_answer, map_points, and is a POSITION job", () => {
    expect(JUDGE_LEG_KINDS).toContain("assigned-root");
    expect(JUDGE_LEG_MATERIAL_FIELDS["assigned-root"]).toEqual(["question_line", "assigned_answer", "map_points"]);
    const leg: JudgeLeg = { kind: "assigned-root", assignedAnswer: "Yes, with conditions.", mapPoints: "{\"for\":[],\"against\":[]}" };
    const frame = readPromptFrame(framedJudgePromptForTest(leg, "Q?", "English", "unknown").packet);
    expect(frame.contractId).toBe("judge.assigned-root.unknown.v1");
    expect(frame.fields.map((field) => field.name)).toEqual(["question_line", "assigned_answer", "map_points"]);
    expect(judgeLegModelRole(leg)).toBe("POSITION");
  });

  it("a support leg WITHOUT a consideration frames exactly as today; WITH one it uses the variant", () => {
    const plain = readPromptFrame(framedJudgePromptForTest({ kind: "support", positionUnderDebate: "P" }, "Q?", "English", "unknown").packet);
    expect(plain.contractId).toBe("judge.support.unknown.v1");
    expect(plain.fields.map((field) => field.name)).toEqual(["question_line", "position_under_debate"]);
    const withPoint = readPromptFrame(framedJudgePromptForTest({ kind: "attack", positionUnderDebate: "P", consideration: "Cost" }, "Q?", "English", "unknown").packet);
    expect(withPoint.contractId).toBe("judge.attack.consideration.unknown.v1");
    expect(withPoint.fields.map((field) => [field.name, field.content])).toEqual([["question_line", "Q?"], ["position_under_debate", "P"], ["consideration", "Cost"]]);
    expect(judgeConsiderationPromptContract("attack", "unknown").instruction).toContain(JUDGE_CONSIDERATION_SENTENCE);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/judge-shape-legs.test.ts` — Expected: FAIL (new exports missing).

- [ ] **Step 3: Implement**

`packages/judgement/src/prompts.ts` (replace lines ~96–123 and ~192–199):

```ts
/** Today's five legs, frozen: the V1 fingerprint is built from them only, so today's sealed hash is reproducible. */
export const JUDGE_LEG_KINDS_V1 = ["primary-root", "independent-root", "support", "attack", "cross-root"] as const;
export const JUDGE_LEG_KINDS = [...JUDGE_LEG_KINDS_V1, "assigned-root"] as const;
export type JudgeLegKind = typeof JUDGE_LEG_KINDS[number];

export const JUDGE_LEG_DIRECTIVES: Readonly<Record<JudgeLegKind, string>> = Object.freeze({
  /* the five existing entries, byte for byte */
  "assigned-root": "Author the strongest case for the answer named in assigned_answer."
});

export const JUDGE_LEG_MATERIAL_FIELDS: Readonly<Record<JudgeLegKind, readonly string[]>> = Object.freeze({
  /* the five existing entries, byte for byte */
  "assigned-root": Object.freeze(["question_line", "assigned_answer", "map_points"])
});

/** Debate shape (spec §3.3 step 3): a reply built on one chosen map point. A variant contract, so today's legs keep their bytes. */
export const JUDGE_CONSIDERATION_SENTENCE = "Build your reply on the consideration named in consideration.";
export const JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS: Readonly<Record<"support" | "attack", readonly string[]>> = Object.freeze({
  support: Object.freeze(["question_line", "position_under_debate", "consideration"]),
  attack: Object.freeze(["question_line", "position_under_debate", "consideration"])
});

export function judgeConsiderationPromptContract(
  leg: "support" | "attack",
  claimType: keyof typeof JUDGE_CLAIM_TYPE_INSTRUCTIONS
): PromptContract {
  return Object.freeze({
    contractId: `judge.${leg}.consideration.${claimType}.v1`,
    instruction: [`${JUDGE_LEG_DIRECTIVES[leg]} ${JUDGE_CONSIDERATION_SENTENCE}`, JUDGE_INSTRUCTIONS, JUDGE_CLAIM_TYPE_INSTRUCTIONS[claimType]].join(" "),
    answerForm: JUDGE_ANSWER_FORM
  });
}

/** Today's sealed text (register judgeContractHash e7f7e4b0…), frozen: never edited. */
export const JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1: string = [
  ...JUDGE_LEG_KINDS_V1.flatMap((leg) => ([
    promptContractFingerprintText(judgePromptContract(leg, "unknown")),
    promptContractFingerprintText(judgePromptContract(leg, "resolved"))
  ])),
  promptContractFingerprintText(reviewPromptContract(0)),
  promptContractFingerprintText(PANEL_PROMPT_CONTRACT)
].join("\n---\n");

/** What the register seals now: V1, then the debate shape's six contracts. A change is a new register version. */
export const JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT: string = [
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1,
  ...(["unknown", "resolved"] as const).map((claim) => promptContractFingerprintText(judgePromptContract("assigned-root", claim))),
  ...(["support", "attack"] as const).flatMap((leg) => (["unknown", "resolved"] as const)
    .map((claim) => promptContractFingerprintText(judgeConsiderationPromptContract(leg, claim))))
].join("\n---\n");
```

`packages/judgement/src/index.ts`: widen `JudgeLeg` as in Interfaces; in `judgeLegMaterial` add the two branches and
pick the declared table:

```ts
  const fields = leg.kind === "cross-root"
    ? [ /* unchanged */ ]
    : leg.kind === "assigned-root"
      ? [
          { name: "question_line", content: questionLine },
          { name: "assigned_answer", content: leg.assignedAnswer },
          { name: "map_points", content: leg.mapPoints }
        ]
      : leg.kind === "support" || leg.kind === "attack"
        ? [
            { name: "question_line", content: questionLine },
            { name: "position_under_debate", content: leg.positionUnderDebate },
            ...(leg.consideration === undefined ? [] : [{ name: "consideration", content: leg.consideration }])
          ]
        : [{ name: "question_line", content: questionLine }];
  const declared = (leg.kind === "support" || leg.kind === "attack") && leg.consideration !== undefined
    ? JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS[leg.kind]
    : JUDGE_LEG_MATERIAL_FIELDS[leg.kind as JudgeLegKind];
```

In `framedJudgePrompt` choose the contract:

```ts
  const contract = (leg.kind === "support" || leg.kind === "attack") && leg.consideration !== undefined
    ? judgeConsiderationPromptContract(leg.kind, claim)
    : judgePromptContract(leg.kind, claim);
  return buildFramedPrompt({
    contract: promptContractInArgumentLanguage(contract, argumentLanguageName),
    material: judgeLegMaterial(leg, questionLine)
  });
```

and export a test seam `export const framedJudgePromptForTest = framedJudgePrompt;` (the name says what it is for; it is
the same function the gateway call frames). `judgeLegModelRole`: add `case "assigned-root":` under the
`"independent-root"` case (POSITION). `firstPositionCallProjections` is unchanged: in a shaped run the first billed
call is `MAP:angles`, whose request is smaller than a primary-root request at the same question size, and root 0's own
call stays the one `firstCallCeilingFailure` guards.

`acceptance/moment-tools.ts` (pre-flight PF-B12; three places, found by name):

1. `judgeLegSchema` is a `.strict()` discriminated union of today's five kinds. Give `support` and `attack` an optional
   consideration and add the new kind:

```ts
const judgeLegSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("primary-root") }).strict(),
  z.object({ kind: z.literal("independent-root") }).strict(),
  z.object({ kind: z.literal("support"), positionUnderDebate: text, consideration: text.optional() }).strict(),
  z.object({ kind: z.literal("attack"), positionUnderDebate: text, consideration: text.optional() }).strict(),
  z.object({ kind: z.literal("cross-root"), ownPosition: text, otherMakersPosition: text }).strict(),
  z.object({ kind: z.literal("assigned-root"), assignedAnswer: text, mapPoints: text }).strict()
]);
```

2. In `builderFromRecordedPacket`, `case "JUDGE_JUDGE"`, replace the contract-id parse and the leg rebuild:

```ts
      const parsed = /^judge\.([a-z-]+)(\.consideration)?\.(?:unknown|resolved)\.v1$/u.exec(frame.contractId);
      const kind = parsed?.[1];
      const withConsideration = parsed?.[2] !== undefined;
      // The variant contract and the `consideration` field travel together, and only on a support or attack leg.
      if (withConsideration !== has("consideration")) mismatch();
      if (withConsideration && kind !== "support" && kind !== "attack") mismatch();
      const leg: JudgeLeg = kind === "support" || kind === "attack"
        ? { kind, positionUnderDebate: field("position_under_debate"),
            ...(withConsideration ? { consideration: field("consideration") } : {}) }
        : kind === "assigned-root"
          ? { kind, assignedAnswer: field("assigned_answer"), mapPoints: field("map_points") }
          : kind === "cross-root"
            ? { kind, ownPosition: field("own_position"), otherMakersPosition: field("other_makers_position") }
            : kind === "primary-root" || kind === "independent-root"
              ? { kind }
              : mismatch();
```

   (the `judgeLegModelRole(leg) !== role` check after it stays: an `assigned-root` call is recorded under POSITION).

3. In `graderContextOf`, `case "JUDGE_JUDGE"`, give the grader the new material:

```ts
      if (leg.kind === "support" || leg.kind === "attack") {
        excerpts.push({ label: "position_under_debate", text: leg.positionUnderDebate });
        if (leg.consideration !== undefined) excerpts.push({ label: "consideration", text: leg.consideration });
      } else if (leg.kind === "assigned-root") {
        excerpts.push({ label: "assigned_answer", text: leg.assignedAnswer }, { label: "map_points", text: leg.mapPoints });
      } else if (leg.kind === "cross-root") {
```

   (the cross-root branch below it is unchanged).

`tests/unit/prompt-text-pins.test.ts`: add `"assigned-root": "Author the strongest case for the answer named in
assigned_answer."` to `LEG_DIRECTIVES` (its "covers every declared leg" test compares the key set to
`JUDGE_LEG_KINDS`), and a test pinning `JUDGE_CONSIDERATION_SENTENCE` to
`"Build your reply on the consideration named in consideration."`.

`tests/unit/a13-model-role.test.ts` (pre-flight PF-B11): `it.each(JUDGE_LEG_KINDS)` reads `LEGS[kind]`, so add BOTH
`"assigned-root": { kind: "assigned-root", assignedAnswer: STATEMENT, mapPoints: "{\"for\":[],\"against\":[]}" }` to
`LEGS` and `"assigned-root": "POSITION"` to `EXPECTED_LEG_ROLE`.

Hash pins: print the new judge hash with

```bash
pnpm exec tsx -e 'Promise.all([import("node:crypto"), import("@debateai/judgement")]).then(([c, j]) => console.log(c.createHash("sha256").update(j.JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT).digest("hex")))'
```

and use the printed value (written `<JUDGE_P2B>` below; it is never `e7f7e4b0…`):

- `tests/unit/hs-s01-seal.test.ts`, the R7-a `"judgeContractHash"` row (~:53): keep `base = "3c9c32a6…"` and
  `after = "e7f7e4b0…"`, but compute `now` from `JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V1` (import it); add a row
  `["judgeContractHash (debate shape)", () => sha256(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT), "e7f7e4b0e7066fb2b873c4435b2bd593a0a399f8de506604c35b92222fdb1365", "<JUDGE_P2B>"]`.
- `tests/unit/f-sealedrows-a-conformance-extractor.test.ts`, `expect(acceptance.judgeContractHash).toBe("e7f7e4b0…")`
  (~:101-102) and `acceptance/seed-register.test.ts`, `judgeContractHash: "e7f7e4b0…"` (~:45): replace by
  `<JUDGE_P2B>` (both read the CURRENT sealed value of a freshly built register).
- `tests/unit/answer-writer-v3-register-12.test.ts` (pre-flight PF-B10; judge lines ONLY — Task 5 owns the composer
  lines of this file):
  - under `LIVE_11`, add `/** The judge seal this code sends after the debate shape (Task 4): V1 + six contracts. */`
    `const JUDGE_P2B = "<JUDGE_P2B>";`. `LIVE_11` stays as it is (sealed history);
  - `live11Base` (~:55): add `judgeContractHash: canonical(LIVE_11.judge),` as the first entry of `replaced`, so the
    base is version-11-shaped for the judge row too;
  - the test "the code's prompt fingerprints are the v3/v2 seals, and the judge's is unchanged from version 11" (~:72-73):
    rename it "the code's prompt fingerprints are the current seals" and change `judge: LIVE_11.judge` to
    `judge: JUDGE_P2B` (leave `composer: V3_COMPOSER` to Task 5);
  - ~:80: `expect(rows.judgeContractHash).toBe(LIVE_11.judge)` → `.toBe(JUDGE_P2B)`;
  - ~:89: `expect(plan.changedKeys).toEqual(["composerContractHash", "conformanceContractHash"]);` becomes the first
    line below, and after the conformance entry check (~:94) add the second:

```ts
    expect([...plan.changedKeys].sort()).toEqual(["composerContractHash", "conformanceContractHash", "judgeContractHash"]);
    expect([entry("judgeContractHash").oldValueJsonText, entry("judgeContractHash").newValueJsonText])
      .toEqual([`"${LIVE_11.judge}"`, `"${JUDGE_P2B}"`]);
```

  - ~:106 test title "naming both synthesis rows and both values" → "naming all three rows and their values"; ~:114
    `expect(message).not.toContain("judgeContractHash");` becomes (the refusal joins one
    `<row> is <register's>, the code's is <code's>` part per differing row):

```ts
    expect(message).toContain(`judgeContractHash is ${LIVE_11.judge}, the code's is ${JUDGE_P2B}`);
```

  - ~:149-150: take `changedKeys` out of the `toMatchObject({...})` and add
    `expect([...next.changedKeys].sort()).toEqual(["composerContractHash", "conformanceContractHash", "judgeContractHash"]);`;
  - ~:175 (the "unchanged" base): add `judgeContractHash: canonical(JUDGE_P2B),` to its overrides, so it still changes
    no row and is still refused with `PRACTICE_REGISTER_NEXT_UNSUPPORTED`.

- [ ] **Step 4: Run — expect PASS**

Run each file alone, one after another:

```bash
pnpm exec vitest run tests/unit/judge-shape-legs.test.ts
pnpm exec vitest run tests/unit/prompt-text-pins.test.ts
pnpm exec vitest run tests/unit/a13-model-role.test.ts
pnpm exec vitest run tests/unit/hs-s01-seal.test.ts
pnpm exec vitest run tests/unit/f-sealedrows-a-conformance-extractor.test.ts
pnpm exec vitest run tests/unit/answer-writer-v3-register-12.test.ts
pnpm exec vitest run tests/unit/prompt-injection-corpus.test.ts
pnpm exec vitest run tests/unit/a18-moment-tools.test.ts
pnpm exec vitest run acceptance/seed-register.test.ts
```

Expected: PASS. Then the root typecheck, alone:

```bash
pnpm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/judgement acceptance tests/unit
git commit -m "judgement: assigned-root leg and consideration variant; judge fingerprint = frozen V1 + six shape contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The answer length: the synthesizer's length variant and the writer bound

**Files:**
- Modify: `packages/serve/src/synthesis.ts` (new contract + fingerprint text), `apps/runner/src/index.ts`
  (`buildSynthesisRolePrompt`, `shapeWriterBound`, and `codePromptContractHashes`)
- Modify, every composer-hash derivation (pre-flight PF-B14; each found by name and verified at `2d4f35e64`), all
  switched from `promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT)` to `SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT`:
  - `apps/runner/src/index.ts`, `codePromptContractHashes()` (`composer:`; the boot check
    `assertRegisterPromptContractHashes` compares the register to it);
  - `apps/runner/src/dev-deployment-register.ts`, `composerContractHash:` in the development register's values;
  - `acceptance/seed-register.ts`, `composerContractHash:` (else f-sealedrows' "both deployments seal the same
    values" check fails);
  - `tools/preview-practice/practice-lanes.ts`, `PRACTICE_CONTRACT_HASHES.composer`;
  - `acceptance/moment-tools.ts`, `currentContractHash("SYNTHESIS_WRITER")`.
- Modify `acceptance/moment-tools.ts` also for the replay of a lengthed writer call (pre-flight PF-B16 NOTE, done here,
  not in Task 14): `SynthesisWriterInputsSchema`, `builderFromRecordedPacket`'s `case "SYNTHESIS_WRITER"`, and the two
  `buildSynthesisRolePrompt(...)` calls (`invokeMomentBuilder`, `captureMomentPacket`)
- Modify hash pins (pre-flight PF-B16 lists them all; the old plan's grep missed two because the hex sits on its own
  line):
  - `tests/unit/f-sealedrows-a-conformance-extractor.test.ts`: the `acceptance.composerContractHash` hex (~:107-108) and
    the derivation in "keeps the writer's prompt in its own slot" (~:120-121);
  - `acceptance/seed-register.test.ts`: `composerContractHash:` hex (~:48);
  - `tests/unit/a18-moment-tools.test.ts`: `currentContractHash("SYNTHESIS_WRITER")` expectation (~:173);
  - `tests/unit/hs-s01-seal.test.ts`: one new R7-a row (today's v3 row, ~:82-93, stays exactly as it is);
  - `tests/unit/answer-writer-v3-register-12.test.ts` (composer lines ONLY — Task 4 already changed this file's judge
    lines; the exact lines are in Step 3).
- Create: `tests/support/synthesisRequestFixture.ts` (ALWAYS, pre-flight PF-B16: it does not exist today, and P2L's
  question-language test imports the same path), `tests/unit/synthesizer-length.test.ts`

No new shipped `.ts` file (the fixture is under `tests/`, which the shipped-corpus manifest does not list).

Implementer note (pre-flight PF-B13): from this task on, the composer fingerprint the code sends differs from the one
the preview's register 12 seals (`4b141d3a…f90f`), as the judge's already does after Task 4. The runner's boot and the
practice composition refuse register 12 (`REGISTER_PROMPT_CONTRACT_HASH_MISMATCH`); the branch runs on the development
register and on a practice `--register-next` version only, until the owner publishes a new register version (judge +
composer hashes + `mapContractHash`) after P2L Task 15 (Owner steps).

**Interfaces:**

```ts
// packages/serve/src/synthesis.ts
export const SYNTHESIZER_LENGTH_CONTRACT_ID = "serve.synthesizer.length.v1" as const;
export const SYNTHESIZER_LENGTH_SENTENCE: string;
export const SYNTHESIZER_LENGTH_PROMPT_CONTRACT: PromptContract;
export const SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT: string;      // fp(serve.synthesizer.v3) + "\n---\n" + fp(length.v1)
export function synthesizerAnswerLengthField(words: number): Readonly<{ name: "answer_length"; content: string }>;
// apps/runner/src/index.ts
export function buildSynthesisRolePrompt(request: SynthesizerRequest | EvaluatorRequest, argumentLanguageName: string,
  randomBytes?: (size: number) => Buffer, answerWords?: number | null): FramedPrompt;
export function shapeWriterBound(bound: CallBound, writerBound: number | null): CallBound;
// tests/support/synthesisRequestFixture.ts
export function synthesisRequestFixture(): SynthesizerRequest;
```

(pre-flight PF-B15: today's writer contract is `serve.synthesizer.v3` — `SYNTHESIZER_CONTRACT_ID` in
`packages/serve/src/synthesis.ts`, composer seal `4b141d3ab287366c4969f89e04649c5f1cc951d433206ffa0295527eba4df90f` in
register 12. The length variant is a variant of v3.)

- [ ] **Step 1: Write the failing test**

First the fixture, which the new test (and P2L's question-language test) imports. It builds the smallest writer request
`tests/unit/a17-synthesis-role-prompt.test.ts` already uses:

```ts
// tests/support/synthesisRequestFixture.ts
import { buildSynthesisDigest, buildSynthesizerRequest, type SynthesizerRequest } from "@debateai/serve";

/** The smallest answer-writer request (one position node, round 1, no prior objection), as the A17 tests build it. */
export function synthesisRequestFixture(): SynthesizerRequest {
  const outcome = buildSynthesisDigest({
    nodes: [{
      nodeId: "position:a", statement: "The proposal holds on cost.", finalStrength: 0.61,
      wayOfKnowing: "REASONING", marks: [], polarityRelations: [], isPosition: true, isSurvivingObjection: false
    }],
    servedRootNodeId: "position:a",
    budgetBound: 8_192
  });
  if (outcome.kind !== "DIGEST") throw new Error("the synthesis request fixture's digest must exist");
  return buildSynthesizerRequest({
    controls: { synthesizerRoleRef: "provider:w", evaluatorRoleRef: "provider:c", evaluatorLoopMaxRounds: 3 },
    round: 1,
    digest: outcome.digest,
    codeLabel: { verdictLabel: "CONTESTED", servedNodeId: "position:a", servedStrength: 0.61, margin: 0.12, registerVersion: 5 },
    prior: null
  });
}
```

```ts
// tests/unit/synthesizer-length.test.ts
import { describe, expect, it } from "vitest";
import { promptContractFingerprintText, readPromptFrame } from "@debateai/providers";
import {
  SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT, SYNTHESIZER_LENGTH_PROMPT_CONTRACT, SYNTHESIZER_LENGTH_SENTENCE, SYNTHESIZER_PROMPT_CONTRACT
} from "@debateai/serve";
import { buildSynthesisRolePrompt, shapeWriterBound } from "../../apps/runner/src/index.js";
import { builderFromRecordedPacket, captureMomentPacket } from "../../acceptance/moment-tools.js";
import { synthesisRequestFixture } from "../support/synthesisRequestFixture.js";

describe("the answer length (spec §3.3 step 8)", () => {
  it("without a length the writer's prompt is today's, byte for byte", () => {
    const request = synthesisRequestFixture();
    const fixed = (size: number) => Buffer.alloc(size, 7);
    const today = buildSynthesisRolePrompt(request, "English", fixed);
    expect(buildSynthesisRolePrompt(request, "English", fixed, null).packet).toEqual(today.packet);
    expect(readPromptFrame(today.packet).contractId).toBe("serve.synthesizer.v3");
  });

  it("with a length it uses the length variant and adds answer_length last", () => {
    const frame = readPromptFrame(buildSynthesisRolePrompt(synthesisRequestFixture(), "English", undefined, 700).packet);
    expect(frame.contractId).toBe("serve.synthesizer.length.v1");
    expect(frame.fields.at(-1)).toEqual({ name: "answer_length", content: "about 700 words" });
    expect(SYNTHESIZER_LENGTH_PROMPT_CONTRACT.instruction).toBe(`${SYNTHESIZER_PROMPT_CONTRACT.instruction} ${SYNTHESIZER_LENGTH_SENTENCE}`);
    expect(SYNTHESIZER_LENGTH_SENTENCE).not.toMatch(/\d/u);
  });

  it("the composer fingerprint is v3 then the length variant", () => {
    expect(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).toBe([
      promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
      promptContractFingerprintText(SYNTHESIZER_LENGTH_PROMPT_CONTRACT)].join("\n---\n"));
  });

  it("the writer bound is the larger of the sealed bound and the length's bound", () => {
    const sealed = { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 };
    expect(shapeWriterBound(sealed, null)).toBe(sealed);
    expect(shapeWriterBound(sealed, 12_288)).toEqual({ ...sealed, tokenCeiling: 12_288 });
    expect(shapeWriterBound({ ...sealed, tokenCeiling: 20_000 }, 8_192).tokenCeiling).toBe(20_000);
  });

  it("a recorded lengthed writer call replays as the length variant (pre-flight PF-B16)", async () => {
    const recorded = buildSynthesisRolePrompt(synthesisRequestFixture(), "the same language as the question", undefined, 700);
    const builder = builderFromRecordedPacket("ANSWER_WRITER", "COMPOSER:SYNTHESIZER:INITIAL:1", recorded.packet);
    expect(builder).toMatchObject({ family: "SYNTHESIS_WRITER", inputs: { answerWords: 700 } });
    const replayed = readPromptFrame(await captureMomentPacket(builder));
    expect(replayed.contractId).toBe("serve.synthesizer.length.v1");
    expect(replayed.fields.at(-1)).toEqual({ name: "answer_length", content: "about 700 words" });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/synthesizer-length.test.ts` — Expected: FAIL (exports missing).

- [ ] **Step 3: Implement**

`packages/serve/src/synthesis.ts`, after `SYNTHESIZER_PROMPT_CONTRACT` (change the existing
`import type { PromptContract } from "@debateai/providers";` to
`import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";` — `@debateai/providers` is
already a dependency of `@debateai/serve`):

```ts
/**
 * Debate shape (spec §3.3 step 8): the answer length. A VARIANT of serve.synthesizer.v3 — v3's instruction, then one
 * sentence; the target arrives as the material field `answer_length` ("about N words"). A run without a shape never
 * sends it, so its writer prompt is v3's to the byte. Sealed with v3 by `composerContractHash`
 * (SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).
 */
export const SYNTHESIZER_LENGTH_CONTRACT_ID = "serve.synthesizer.length.v1" as const;
export const SYNTHESIZER_LENGTH_SENTENCE = "Write the answer in about the number of words named in answer_length; "
  + "it is a target, never a reason to leave out a point the answer needs.";
export const SYNTHESIZER_LENGTH_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: SYNTHESIZER_LENGTH_CONTRACT_ID,
  instruction: `${SYNTHESIZER_INSTRUCTIONS} ${SYNTHESIZER_LENGTH_SENTENCE}`,
  answerForm: SYNTHESIZER_ANSWER_FORM
});
/** What `composerContractHash` seals from the debate shape on: v3, then the length variant. */
export const SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT: string = [
  promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT),
  promptContractFingerprintText(SYNTHESIZER_LENGTH_PROMPT_CONTRACT)
].join("\n---\n");
export function synthesizerAnswerLengthField(words: number): Readonly<{ name: "answer_length"; content: string }> {
  if (!Number.isSafeInteger(words) || words < 1) throw new TypeError("SYNTHESIZER_ANSWER_LENGTH_INVALID");
  return Object.freeze({ name: "answer_length", content: `about ${String(words)} words` });
}
```

`apps/runner/src/index.ts` (add `SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT`, `SYNTHESIZER_LENGTH_PROMPT_CONTRACT` and
`synthesizerAnswerLengthField` to the existing `@debateai/serve` import, beside `SYNTHESIZER_PROMPT_CONTRACT`; `CallBound`
is already imported from `@debateai/providers`):

```ts
export function buildSynthesisRolePrompt(
  request: SynthesizerRequest | EvaluatorRequest,
  argumentLanguageName: string,
  randomBytes?: (size: number) => Buffer,
  answerWords: number | null = null
): FramedPrompt {
  const lengthed = request.role === "SYNTHESIZER" && answerWords !== null;
  return buildFramedPrompt({
    contract: promptContractInArgumentLanguage(
      request.role === "SYNTHESIZER" ? (lengthed ? SYNTHESIZER_LENGTH_PROMPT_CONTRACT : SYNTHESIZER_PROMPT_CONTRACT) : EVALUATOR_PROMPT_CONTRACT,
      argumentLanguageName
    ),
    material: lengthed ? [...toSynthesisPromptMaterial(request), synthesizerAnswerLengthField(answerWords)] : toSynthesisPromptMaterial(request),
    ...(randomBytes === undefined ? {} : { randomBytes })
  });
}

/** Spec §3.3 step 8: the writer's call bound is max(sealed bound, the answer length's writerBound). Null: the sealed bound itself. */
export function shapeWriterBound(bound: CallBound, writerBound: number | null): CallBound {
  if (writerBound === null || writerBound <= bound.tokenCeiling) return bound;
  return Object.freeze({ ...bound, tokenCeiling: writerBound });
}
```

and in `codePromptContractHashes()` (pre-flight PF-B14, the BLOCKER: without it the runner refuses its own development
register at boot with `REGISTER_PROMPT_CONTRACT_HASH_MISMATCH`):

```ts
    composer: digest(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT),
```

The other composer-hash derivations, each switched the same way (pre-flight PF-B14). In each of the first three files
`SYNTHESIZER_PROMPT_CONTRACT` has no other use, so replace that name in the file's `@debateai/serve` import by
`SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT`:

- `apps/runner/src/dev-deployment-register.ts`: `composerContractHash: digest(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT),`
- `acceptance/seed-register.ts`: `composerContractHash: digest(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT),`
- `tools/preview-practice/practice-lanes.ts`, `PRACTICE_CONTRACT_HASHES`: `composer: digestHex(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT),`
- `acceptance/moment-tools.ts`, `currentContractHash`: the `SYNTHESIS_WRITER` branch becomes
  `? sha256(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT)` (keep the `SYNTHESIZER_PROMPT_CONTRACT` import there: the replay
  below still uses it).

Then prove no derivation was missed (pre-flight PF-B14):

```bash
command grep -rn 'promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT)' apps tools acceptance packages
```

Expected: exactly ONE hit, in `packages/serve/src/synthesis.ts`: the first line of `SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT`
itself. Any other hit is a composer-hash derivation still on the old text: switch it. Then the tests:

```bash
command grep -rn 'promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT)' tests
```

Expected, and each justified: `tests/unit/hs-s01-seal.test.ts` (today's v3 row, history, stays),
`tests/unit/synthesizer-number-ref-guidance.test.ts` (~:52, pins v3's own seal, stays),
`tests/unit/f-sealedrows-a-conformance-extractor.test.ts` (~:124, only inside the "conformance is not composer +
evaluator joined" check, stays) and `tests/unit/synthesizer-length.test.ts` (the new test). The f-sealedrows ~:121
expectation and the a18 ~:173 expectation must no longer appear (switched below).

`acceptance/moment-tools.ts`, the replay of a lengthed writer call (pre-flight PF-B16 NOTE; today the SYNTHESIS_WRITER
replay refuses any contract id but `SYNTHESIZER_PROMPT_CONTRACT.contractId`). Add `SYNTHESIZER_LENGTH_CONTRACT_ID` and
`SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT` to its `@debateai/serve` import, then:

1. `SynthesisWriterInputsSchema` gains one optional member (absent on every moment recorded before the shape, so their
   ids are unchanged):

```ts
  answerWords: z.number().int().positive().optional(),
```

2. `builderFromRecordedPacket`, `case "SYNTHESIS_WRITER"`: replace the contract check
   `if (frame.contractId !== SYNTHESIZER_PROMPT_CONTRACT.contractId) mismatch();` by

```ts
      const lengthed = frame.contractId === SYNTHESIZER_LENGTH_CONTRACT_ID;
      if (!lengthed && frame.contractId !== SYNTHESIZER_PROMPT_CONTRACT.contractId) mismatch();
      // The length variant and its `answer_length` field travel together.
      if (lengthed !== has("answer_length")) {
        throw new TypedDomainError("MOMENT_FIELD_UNEXPECTED", `${callSiteKey}: answer_length does not match the contract`);
      }
      const words = lengthed ? /^about ([1-9][0-9]*) words$/u.exec(field("answer_length"))?.[1] : undefined;
      if (lengthed && words === undefined) {
        throw new TypedDomainError("MOMENT_RECORDED_PROMPT_UNREADABLE", `${callSiteKey}: answer_length`);
      }
```

   and in the `inputs` object it returns, after `priorObjection: …,` add
   `...(words === undefined ? {} : { answerWords: Number(words) }),`.

3. Add, next to `momentArgumentLanguageName`:

```ts
/** The answer length a recorded writer call carried (debate shape), or null: a writer call without one, or a checker call. */
function momentAnswerWords(builder: TypedMomentBuilder): number | null {
  return builder.family === "SYNTHESIS_WRITER" ? builder.inputs.answerWords ?? null : null;
}
```

   and pass it as the fourth argument at both `buildSynthesisRolePrompt` calls: in `invokeMomentBuilder`,
   `buildSynthesisRolePrompt(request, momentArgumentLanguageName(builder), undefined, momentAnswerWords(builder))`, and in
   `captureMomentPacket`, `buildSynthesisRolePrompt(synthesisRequestOf(builder), momentArgumentLanguageName(builder), undefined, momentAnswerWords(builder)).packet`.

Wiring the length into the live writer call is Task 14.

Print the new composer hash:

```bash
pnpm exec tsx -e 'Promise.all([import("node:crypto"), import("@debateai/serve")]).then(([c, s]) => console.log(c.createHash("sha256").update(s.SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).digest("hex")))'
```

and use the printed value (written `<COMPOSER_P2B>` below; it is never `4b141d3a…`) in the pins:

- `tests/unit/hs-s01-seal.test.ts`: import `SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT` beside `SYNTHESIZER_PROMPT_CONTRACT`
  (from `@debateai/serve`) and add one row to the R7-a `it.each` table (pre-flight PF-B15: its base is v3's seal):
  `["composerContractHash serve.synthesizer.v3 + length.v1", () => sha256(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT), "4b141d3ab287366c4969f89e04649c5f1cc951d433206ffa0295527eba4df90f", "<COMPOSER_P2B>"]`.
  The test "seals the current serve.synthesizer.v3 and serve.evaluator.v2…" (~:81-93) stays exactly as it is.
- `tests/unit/f-sealedrows-a-conformance-extractor.test.ts`: ~:107-108 `.toBe("4b141d3a…")` → `.toBe("<COMPOSER_P2B>")`
  (add to the comment above it: "the debate shape's length variant (2026-10-13) joined v3 in this seal; v3's
  4b141d3a…f90f is history"); ~:120-121 `.toBe(sha256(promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT)))` →
  `.toBe(sha256(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT))` (import it from `@debateai/serve`). The ~:124 check stays.
- `acceptance/seed-register.test.ts` ~:48: `composerContractHash: "<COMPOSER_P2B>",` (comment: v3's 4b141d3a…f90f is
  history).
- `tests/unit/a18-moment-tools.test.ts` ~:173:
  `expect(currentContractHash("SYNTHESIS_WRITER")).toBe(sha(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT));` (import it from
  `@debateai/serve`).
- `tests/unit/answer-writer-v3-register-12.test.ts` (pre-flight PF-B16; composer lines ONLY — the judge lines are
  Task 4's and already read `JUDGE_P2B`):
  - beside `V3_COMPOSER` (keep it: v3 alone is register 12's seal, history) add
    `/** The composer seal this code sends after the debate shape (Task 5): v3 + the length variant. */`
    `const COMPOSER_P2B = "<COMPOSER_P2B>";`;
  - replace `V3_COMPOSER` by `COMPOSER_P2B` at exactly these six places, each "the code's" value: the
    `codePromptContractHashes()` expectation (~:73), `expect(rows.composerContractHash)` (~:78), the NEW value in the
    composer delta entry (~:92, `"${V3_COMPOSER}"` → `"${COMPOSER_P2B}"`; the old value stays `LIVE_11.composer`), the
    refusal message's "the code's is" part (~:112), the composed version's composer value (~:157), and the "unchanged"
    base's override (~:175, `composerContractHash: canonical(COMPOSER_P2B)`, so that base still changes no row);
  - no other line of the file changes in this task (the `changedKeys` lists already sorted and carrying
    `judgeContractHash` after Task 4 stay as they are: the composer row changes in both versions of the code).

- [ ] **Step 4: Run — expect PASS**

Run each file alone, one after another:

```bash
pnpm exec vitest run tests/unit/synthesizer-length.test.ts
pnpm exec vitest run tests/unit/hs-s01-seal.test.ts
pnpm exec vitest run tests/unit/f-sealedrows-a-conformance-extractor.test.ts
pnpm exec vitest run tests/unit/f-sealedrows-a-dataflow.test.ts
pnpm exec vitest run tests/unit/a17-synthesis-role-prompt.test.ts
pnpm exec vitest run tests/unit/a18-moment-tools.test.ts
pnpm exec vitest run tests/unit/answer-writer-v3-register-12.test.ts
pnpm exec vitest run tests/unit/synthesizer-number-ref-guidance.test.ts
pnpm exec vitest run tests/unit/practice-openings.test.ts
pnpm exec vitest run acceptance/seed-register.test.ts
```

Expected: PASS. Then the root typecheck, alone:

```bash
pnpm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/serve/src/synthesis.ts apps/runner/src/index.ts apps/runner/src/dev-deployment-register.ts acceptance/seed-register.ts acceptance/seed-register.test.ts acceptance/moment-tools.ts tools/preview-practice/practice-lanes.ts tests/support/synthesisRequestFixture.ts tests/unit
git commit -m "serve: answer-length variant of the writer contract, sealed with v3; every composer-hash derivation follows; shapeWriterBound

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The register and the boot: `mapContractHash`, the shape settings, the P2a boot guard removed

**Files:**
- Create: `packages/register/src/map-contract-hash.ts`, `apps/runner/src/debate-shape-boot.ts`, `tests/unit/debate-shape-boot.test.ts`
- Modify: `packages/register/src/index.ts` (exports), `packages/register/src/debate-shape-policy.ts` (delete `assertDebateShapeRunnerReady`; add the optional `enabled` member, `debateShapeInForce` and `debateShapeLargestBounds`)
- Modify: `apps/runner/src/dev-deployment-register.ts` (`computeDevelopmentContractRows` emits `mapContractHash`), `apps/runner/package.json` (`"@debateai/map": "workspace:*"`), `pnpm-lock.yaml` (regenerated, pre-flight PF-B23), `tools/orphan-audit/src/index.ts` (the `["apps/runner", "apps/runner", [...]]` row gains `"map"`), `tests/support/shipped-corpus.manifest.txt` (regenerated for the two new shipped files, pre-flight PF-B24)
- Modify, the FIVE Phase-2a BOOT guard sites, all removed in this task (amendment 2026-10-13, final review I2; corrected by pre-flight PF-B24a — the sixth, per-run site stays until Task 13):
  1. `apps/runner/src/main.ts` (the `assertDebateShapeRunnerReady(await readDebateShapePolicy(…))` line, its import, its comment block);
  2. `tools/preview-practice/practice-runner-composition.ts` (same line, import and comment);
  3. `apps/runner/src/hosted-register-publish.ts` (`verifyHostedRegisterBootReadiness`: the guard line, its import and comment; and the dry run's `debate_shape=present (… RUNNER_PENDING)` line in `renderHostedRegisterPlan`);
  4. `apps/api/src/main.ts` (the boot step `boot.runSync("debate-shape-runner-pending", …)`, its import and comment);
  5. `tools/preview-practice/practice-ask-composition.ts` (`assertDebateShapeRunnerReady(debateShapePolicy);`, import, comment).
- KEEP, unchanged (pre-flight PF-B24a, controller ruling — removed in Task 13, when the runner argues the shape): the runner's PER-RUN refusal in `apps/runner/src/index.ts` — the exported `refuseDebateShapeReceiptInPhase2a` (its definition and its doc comment "I2(b), Phase 2a (P2a final review): …") and its one call right after `envelopeBasis = parseCostEnvelopeBasis(run.envelopeBasis);` in the claim path (with its comment line "I2(b), Phase 2a: … P2b replaces this line."). Between this task and Task 13 a run admitted with a shape is refused for good (`RUN_ENVELOPE_BASIS_INVALID`), never argued as today's shape.
- Modify: `apps/runner/src/index.ts` — an ADDITION only (pre-flight PF-B17a): `WalkingSkeletonSettings` gains the optional `debateShape` member.
- Modify: `apps/api/src/ask-model-picker.ts` (`askModelPickerSettings` and `composeAskModelPicker` gain the optional in-force `debateShapePolicy`), `apps/api/src/main.ts` / `tools/preview-practice/practice-ask-composition.ts` (they pass it; the API's settings hold only the in-force policy), `apps/runner/src/hosted-register-publish.ts` (`planHostedRegisterPublication`'s Free answer-job check, pre-flight PF-B21) — Free answer-job eligibility at the row's largest WRITER bound (pre-flight PF-B22). `packages/scorecard` is NOT edited: `freeAnswerJobsFollowPaidSiteRule` keeps its signature.
- Modify: `deploy/preview-auth-dev/v1/publish-register-v2.ts` (`PREVIEW_SOURCE_ROW_KEYS_V2` += `"mapContractHash"` and its doc comment 67→68; the `debateShape` sixth argument may be `"off"`), `deploy/preview-auth-dev/v1/publish-register.ts` (v1 filters out `mapContractHash`), `deploy/preview-auth-dev/v1/native-operator.mjs` (the plan's optional `debateShape` key, `validateDebateShapeChoice`, and the sixth argument), `deploy/preview-auth-dev/v1/README.md` (Task 6 owns this file's edits: ":26" "67 keys" → "68 keys" with `mapContractHash` named; the `debateShape` plan key and its rollback paragraph), `deploy/preview-release/v1/release-artifacts.mjs` (`--debate-shape off|'<JSON>'`, pre-flight PF-B20), `deploy/preview-release/v1/README.md` (the `native-plan` row ~:72 names `--debate-shape`)
- Modify the README rows (pre-flight PF-B17c; Task 6 WRITES them, Task 17 only checks them): `deploy/vps/README.md` (the refusal-table row `DEBATE_SHAPE_POLICY_RUNNER_PENDING`, ~:1897, is replaced by two rows, Step 3f), `deploy/vps/register/README.md` (the `debateShapePolicy` row, ~:54, rewritten, Step 3f). The `DEBATE_SHAPE_RUNNER_UNCONFIGURED` row and the malformed-receipt runbook line stay Task 17's.
- Modify pins and the tests that pin the Phase-2a guard:
  - `tests/unit/preview-register-publish-v2.test.ts` — every pin listed in Step 3d (pre-flight PF-B19: :64, :66-67, :95-97, :113-114, :138, :147-148, :230-231, :238, :335, :375, :413);
  - `tests/integration/preview-register-publish-v2.test.ts` (:34, :38 comment, :47: `rowCount: 69` → 70, pre-flight PF-B19);
  - `tests/architecture/register-support-publication.test.ts` (~:466-480: the development-row counts, pre-flight PF-B18, Step 3b item 6);
  - `tests/unit/debate-shape-runner-boot.test.ts` (its FIRST describe rewritten; its SECOND describe, "I2(b), Phase 2a: the runner refuses a claimed run's debate-shape receipt, whatever its own register says", kept byte for byte — Task 13 deletes it);
  - `tests/unit/debate-shape-policy.test.ts` (delete the P2a guard case ~:170; add the `enabled` cases);
  - `tests/unit/debate-shape-submit.test.ts` (the "I2(a)" text-pin case ~:351–365 and the case ~:380–389 that expects `DEBATE_SHAPE_POLICY_RUNNER_PENDING` from the practice runner composition: rewritten; its `rowPool` throws on any read other than the shape row, so the rewritten case answers the `mapContractHash` read too);
  - `tests/integration/hosted-register-publish.test.ts` (~:555–567: the sealed-row case expecting `HOSTED_REGISTER_BOOT_CHECK_FAILED:DEBATE_SHAPE_POLICY_RUNNER_PENDING`);
  - `tests/unit/hosted-register-publish.test.ts` (~:404: the M3 dry-run pin `/^debate_shape=present .*RUNNER_PENDING\)$/mu`; plus the new Free-check case of Step 3e);
  - `tests/unit/model-picker-boot-stages.test.ts` (the new Free-check cases of Step 3e);
  - `tests/unit/preview-release-artifacts.test.ts` (the `--debate-shape` cases of Step 3d);
  - `tests/integration/obs-l3-s06-runner-binding.test.ts` (~:543: the `@debateai/register` stand-in drops `assertDebateShapeRunnerReady` and gains `readMapContractHash`; update its comment line ~:542).
- No edit (pre-flight notes): `tests/integration/dev-deployment-register.test.ts:749,881` are runner-settings objects, not key lists; the file is still run in Step 4.
- Modify, v1 kit users that must stay green unchanged: `tests/unit/preview-auth-dev-snapshot.test.ts` (expects 66 rows), `tests/integration/preview-auth-dev-fallback.test.ts` (~:77, ~:126), `tests/integration/preview-auth-dev-native-verify.test.ts`, `deploy/preview-auth-dev/v1/stage-fixture.ts` — no edit; they prove the v1 filter

Implementer note (pre-flight PF-B24a): this task leaves `refuseDebateShapeReceiptInPhase2a` exactly where it is (definition, doc comment, its one call, and the second describe of `tests/unit/debate-shape-runner-boot.test.ts`). Do not delete or rename any of them; Task 13 does. Every "the Phase 2a guard is gone" check in this task covers the five boot sites only.

Implementer note (pre-flight PF-B17c): the README text written here describes the branch's finished state (the runner argues the shape from Task 13). No intermediate commit between Task 6 and Task 13 is ever deployed with a `debateShapePolicy` row; in such a commit a shaped run would be refused per run (`RUN_ENVELOPE_BASIS_INVALID`), never argued as today's shape.

**Interfaces:**

```ts
// packages/register/src/map-contract-hash.ts
export const MAP_CONTRACT_HASH_ROW_KEY = "mapContractHash" as const;
export function parseMapContractHash(value: unknown): string;                      // TypeError("MAP_CONTRACT_HASH_INVALID")
export async function readMapContractHash(pool: Pick<Pool, "query">, registerVersion: number): Promise<string | null>;
// apps/runner/src/debate-shape-boot.ts
export type DebateShapeRunnerSettings = Readonly<{ mapContractHash: string }>;
export function resolveDebateShapeRunnerSettings(input: Readonly<{
  policy: DebateShapePolicy | null; mapContractHash: string | null; codeMapContractHash: string;
}>): DebateShapeRunnerSettings | null;
// apps/runner/src/index.ts, WalkingSkeletonSettings
readonly debateShape?: DebateShapeRunnerSettings | null;
// packages/register/src/debate-shape-policy.ts (amendment 2026-10-13)
//   DebateShapePolicy gains `enabled?: boolean` (optional; absent = on; never written by the start values)
export function debateShapeInForce(policy: DebateShapePolicy | null): DebateShapePolicy | null;   // null when absent or enabled === false
export function debateShapeLargestBounds(policy: DebateShapePolicy): Readonly<{ writer: number; map: number }>;
// apps/api/src/ask-model-picker.ts: askModelPickerSettings's and composeAskModelPicker's inputs gain
//   `debateShapePolicy?: DebateShapePolicy | null` (the IN-FORCE one); only the Free answer-job check reads it.
// deploy/preview-auth-dev/v1/native-operator.mjs (pre-flight PF-B20): shape-only, synchronous, no register import
export function validateDebateShapeChoice(value);   // returns 'off' or the plain object; else refuses PREVIEW_NATIVE_PLAN_REFUSED
// deploy/preview-auth-dev/v1/publish-register-v2.ts: buildPreviewSourceRowsV2's sixth parameter
//   debateShape: DebateShapePolicy | "off" | null = null
```

**What "the row" means after this task (amendment 2026-10-13, the preview rollback).** R19 carries a sealed optional
row forward forever, so a published `debateShapePolicy` can never be dropped by a later preview publish. The rollback is
the role-rotation precedent: the row gains an optional `enabled` member (absent = on, so every sealed value keeps its
meaning and its bytes), and `{ …, "enabled": false }` means "no shape" for the ASK side:
- the API (and the practice ask composition) hands `debateShapeInForce(row)` to its settings, the picker and the room
  read: a disabled row is exactly an absent row there (today's asks, today's receipts, byte for byte);
- the runner and the hosted readiness check read the row RAW: a disabled row still requires the sealed map hash, so a
  runner on that version can finish the shaped runs admitted before the switch (no in-flight run fails);
- the preview plan's `debateShape` choice may be the word `"off"`: the source then carries the START VALUES with
  `enabled: false` (`{ ...debateShapePolicyStartValues(), enabled: false }`; `buildPreviewSourceRowsV2` never sees the
  base, so a base row with other values shows those values changing too — pre-flight PF-B20), the delta shows that one
  row changed, and the base-row-dropped refusal is never hit. A hosted file switches it off with the member's
  `"enabled": false` (Step 3f's README row).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/debate-shape-boot.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapPromptContractHash } from "@debateai/map";
import {
  debateShapeInForce, debateShapeLargestBounds, debateShapePolicyRow, debateShapePolicyStartValues, parseDebateShapePolicy,
  parseMapContractHash
} from "@debateai/register";
import { resolveDebateShapeRunnerSettings } from "../../apps/runner/src/debate-shape-boot.js";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";

const code = mapPromptContractHash();
const policy = debateShapePolicyStartValues();

describe("the runner's boot with the debate shape", () => {
  it("no row: today's runner, whatever the map hash row says", () => {
    expect(resolveDebateShapeRunnerSettings({ policy: null, mapContractHash: null, codeMapContractHash: code })).toBeNull();
    expect(resolveDebateShapeRunnerSettings({ policy: null, mapContractHash: "0".repeat(64), codeMapContractHash: code })).toBeNull();
  });

  it("a row needs the sealed map hash, equal to the code's", () => {
    expect(resolveDebateShapeRunnerSettings({ policy, mapContractHash: code, codeMapContractHash: code })).toEqual({ mapContractHash: code });
    expect(() => resolveDebateShapeRunnerSettings({ policy, mapContractHash: null, codeMapContractHash: code })).toThrow(/DEBATE_SHAPE_MAP_HASH_UNSEALED/u);
    expect(() => resolveDebateShapeRunnerSettings({ policy, mapContractHash: "f".repeat(64), codeMapContractHash: code })).toThrow(/MAP_CONTRACT_HASH_MISMATCH/u);
  });

  it("the row value is a 64-hex string", () => {
    expect(parseMapContractHash(code)).toBe(code);
    expect(() => parseMapContractHash("not-a-hash")).toThrow(/MAP_CONTRACT_HASH_INVALID/u);
  });

  it("the dev register seals the code's map hash", async () => {
    const rows = await buildDevelopmentRunnerRegisterRows();
    expect(rows.find((row) => row.rowKey === "mapContractHash")?.value).toBe(code);
  });

  it("main.ts and the practice runner read both rows and no longer carry the Phase 2a guard", () => {
    for (const file of ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts"]) {
      const text = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(text, file).toContain("readDebateShapePolicy(pool, environment.REGISTER_VERSION)");
      expect(text, file).toContain("readMapContractHash(pool, environment.REGISTER_VERSION)");
      expect(text, file).not.toContain("assertDebateShapeRunnerReady");
    }
  });

  it("the Phase 2a BOOT guard is gone from its five sites and the register, and the hosted readiness check resolves the shape like the runner", () => {
    // Pre-flight PF-B24a: the runner's PER-RUN refusal (refuseDebateShapeReceiptInPhase2a in apps/runner/src/index.ts)
    // stays until Task 13; tests/unit/debate-shape-runner-boot.test.ts's second describe pins it, and Task 13 deletes both.
    const sites = ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts",
      "apps/runner/src/hosted-register-publish.ts", "apps/api/src/main.ts", "tools/preview-practice/practice-ask-composition.ts",
      "packages/register/src/debate-shape-policy.ts", "packages/register/src/index.ts"];
    for (const file of sites) {
      const text = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      for (const gone of ["assertDebateShapeRunnerReady", "debate-shape-runner-pending", "DEBATE_SHAPE_POLICY_RUNNER_PENDING"]) {
        expect(text, `${file}: ${gone}`).not.toContain(gone);
      }
    }
    const hosted = readFileSync(new URL("../../apps/runner/src/hosted-register-publish.ts", import.meta.url), "utf8");
    expect(hosted).toContain("resolveDebateShapeRunnerSettings({");
    expect(hosted).toContain("readMapContractHash(pool, version)");
  });

  it("a disabled row is no row for the ask side, and still a row for the runner (the preview's rollback)", () => {
    const off = { ...policy, enabled: false };
    expect(debateShapeInForce(null)).toBeNull();
    expect(debateShapeInForce(off)).toBeNull();
    expect(debateShapeInForce(policy)).toBe(policy);
    expect(debateShapeInForce({ ...policy, enabled: true })).toEqual({ ...policy, enabled: true });
    expect(() => resolveDebateShapeRunnerSettings({ policy: off, mapContractHash: null, codeMapContractHash: code })).toThrow(/DEBATE_SHAPE_MAP_HASH_UNSEALED/u);
    expect(resolveDebateShapeRunnerSettings({ policy: off, mapContractHash: code, codeMapContractHash: code })).toEqual({ mapContractHash: code });
    expect(Object.hasOwn(debateShapePolicyStartValues(), "enabled")).toBe(false);
    expect(parseDebateShapePolicy(JSON.parse(debateShapePolicyRow(off, "t").valueJsonText))).toEqual(off);
    expect(() => parseDebateShapePolicy({ ...policy, enabled: "no" })).toThrow("DEBATE_SHAPE_POLICY_INVALID:enabled");
  });

  it("the largest bounds the row allows: the detailed writer bound and the larger map step bound", () => {
    expect(debateShapeLargestBounds(policy)).toEqual({
      writer: policy.answerLength.detailed.writerBound,
      map: Math.max(policy.mapStepBounds.merge, policy.mapStepBounds.choose)
    });
  });
});
```

(Each `gone` string is checked only in these files; the test files that pinned them are rewritten in Step 3b.
`refuseDebateShapeReceiptInPhase2a` is deliberately NOT a `gone` string here — pre-flight PF-B24a.)

(If `practice-runner-composition.ts` names its pool or environment differently, the assertion uses its own names — read
the file's existing `readCallConcurrencyPolicy(` line and mirror its argument names.)

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/debate-shape-boot.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`packages/register/src/map-contract-hash.ts`:

```ts
import type { Pool } from "pg";

/**
 * Debate shape (spec §4): the map's prompt contracts, sealed. ONE optional row in its own family: never a
 * register.required_row, so every older version keeps parsing and reads ABSENT. The runner requires it only when the
 * register also seals a debateShapePolicy row, and refuses to boot when it differs from the code's fingerprint.
 */
export const MAP_CONTRACT_HASH_ROW_KEY = "mapContractHash" as const;

export function parseMapContractHash(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw new TypeError("MAP_CONTRACT_HASH_INVALID");
  return value;
}

export async function readMapContractHash(pool: Pick<Pool, "query">, registerVersion: number): Promise<string | null> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, MAP_CONTRACT_HASH_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : parseMapContractHash(row.value_json);
}
```

Export it from `packages/register/src/index.ts`. Delete `assertDebateShapeRunnerReady` from
`packages/register/src/debate-shape-policy.ts` and its export line in `packages/register/src/index.ts`.

`packages/register/src/debate-shape-policy.ts` (amendment 2026-10-13, the rollback and the largest bounds):
- `policySchema` gains `enabled: z.boolean().optional()` (NO `.default`: a row written without it keeps its exact bytes
  and reads as on; `debateShapePolicyStartValues()` never writes it). The `DebateShapePolicy` type gains
  `readonly enabled?: boolean`. A wrong type refuses with `DEBATE_SHAPE_POLICY_INVALID:enabled` (the parser's own path rule).
- Add, below `readDebateShapePolicy`:

```ts
/**
 * The row as the ASK side must read it (amendment 2026-10-13, the preview's rollback): absent, or written with
 * `enabled: false`, is no row — today's asks and today's receipts. The runner and the hosted readiness check read the
 * row raw, so a disabled row still needs its sealed map hash and shaped runs admitted before the switch still finish.
 */
export function debateShapeInForce(policy: DebateShapePolicy | null): DebateShapePolicy | null {
  return policy === null || policy.enabled === false ? null : policy;
}

/** The largest output bounds a run under this row may ask for: the writer (detailed is never below the others, the
 * parser checks it) and the larger map step. The Free boot eligibility check asks the WRITER bound (never only the
 * sealed one); the map bound is not checked at boot (POSITION can fall back; a recorded known limit, pre-flight PF-B22). */
export function debateShapeLargestBounds(policy: DebateShapePolicy): Readonly<{ writer: number; map: number }> {
  return Object.freeze({ writer: policy.answerLength.detailed.writerBound, map: Math.max(policy.mapStepBounds.merge, policy.mapStepBounds.choose) });
}
```

Export both from `packages/register/src/index.ts` next to the other debate-shape names. The hosted publisher's member
and the preview kit pass `enabled` through the same parser, so nothing else in the register changes.

`apps/runner/src/debate-shape-boot.ts`:

```ts
import { TypedDomainError } from "@debateai/kernel";
import type { DebateShapePolicy } from "@debateai/register";

/** What a runner needs to argue the debate shape, resolved once at boot. */
export type DebateShapeRunnerSettings = Readonly<{ mapContractHash: string }>;

/**
 * Spec §3.1 / §4: no debateShapePolicy row — today's runner (null). A row — the sealed mapContractHash must be present
 * and equal the code's fingerprint, or the boot refuses: a map call must never be stamped with a hash that does not
 * describe what it sends.
 */
export function resolveDebateShapeRunnerSettings(input: Readonly<{
  policy: DebateShapePolicy | null; mapContractHash: string | null; codeMapContractHash: string;
}>): DebateShapeRunnerSettings | null {
  if (input.policy === null) return null;
  if (input.mapContractHash === null) {
    throw new TypedDomainError("DEBATE_SHAPE_MAP_HASH_UNSEALED", "The register seals a debateShapePolicy row without its mapContractHash row");
  }
  if (input.mapContractHash !== input.codeMapContractHash) {
    throw new TypedDomainError("MAP_CONTRACT_HASH_MISMATCH", "The register's mapContractHash is not this runner's map contracts");
  }
  return Object.freeze({ mapContractHash: input.mapContractHash });
}
```

`apps/runner/src/dev-deployment-register.ts`, in `computeDevelopmentContractRows`'s `values`:
`mapContractHash: mapPromptContractHash(),` (import from `@debateai/map`).

`apps/runner/src/main.ts`: replace P2a's line `assertDebateShapeRunnerReady(await readDebateShapePolicy(pool, environment.REGISTER_VERSION));`
AND the comment block above it ("Phase 2a: a valid row refuses it too …"), and drop `assertDebateShapeRunnerReady`
from the `@debateai/register` import (add `readMapContractHash` there; import `mapPromptContractHash` from
`@debateai/map` and `resolveDebateShapeRunnerSettings` from `./debate-shape-boot.js`), with

```ts
/**
 * Debate shape (spec 2026-10-12 §3.1, §4): the optional row (absent = today's shape, byte for byte; malformed = boot
 * refused, DEBATE_SHAPE_POLICY_INVALID) and, with it, the sealed map contracts (DEBATE_SHAPE_MAP_HASH_UNSEALED /
 * MAP_CONTRACT_HASH_MISMATCH). A run's sizes are read from its own receipt, never from this row.
 */
const debateShape = resolveDebateShapeRunnerSettings({
  policy: await readDebateShapePolicy(pool, environment.REGISTER_VERSION),
  mapContractHash: await readMapContractHash(pool, environment.REGISTER_VERSION),
  codeMapContractHash: mapPromptContractHash()
});
```

and pass `debateShape,` in the `WalkingSkeletonRunner` settings object (beside `callScheduler`). Mirror the same
three reads and the setting in `tools/preview-practice/practice-runner-composition.ts` (the wiring-drift rule).
`WalkingSkeletonSettings` gains:

```ts
  /**
   * Debate shape (spec 2026-10-12 §3): set at boot when the register seals debateShapePolicy (with its map hash).
   * A run whose receipt carries a shape needs it (DEBATE_SHAPE_RUNNER_UNCONFIGURED otherwise, Task 12); a run without
   * one never reads it. Absent: today's runner. Until Task 13 a shaped receipt is still refused per run
   * (refuseDebateShapeReceiptInPhase2a, below), so nothing reads this member yet.
   */
  readonly debateShape?: DebateShapeRunnerSettings | null;
```

`tests/unit/debate-shape-runner-boot.test.ts` (pre-flight PF-B24a): rewrite ONLY its FIRST describe ("the runner reads the
debate shape row at its register version …"), which pins P2a's main.ts guard line today. Its SECOND describe ("I2(b),
Phase 2a: the runner refuses a claimed run's debate-shape receipt, whatever its own register says") and the imports it
uses (`parseCostEnvelopeBasis`, `computeStructuralCeilingBasis`, `debateShapePolicyStartValues`, `resolveDebateShape`,
`refuseDebateShapeReceiptInPhase2a`) stay byte for byte: Task 13 deletes that describe and the imports only it uses.
The rewritten first describe:

```ts
describe("the runner resolves the debate shape at its register version, at boot (spec 2026-10-12 §3.1, §4)", () => {
  it("reads the row and the map hash once, before the runner is built, and carries no Phase 2a boot guard", async () => {
    const main = await readFile("apps/runner/src/main.ts", "utf8");
    const resolve = "const debateShape = resolveDebateShapeRunnerSettings({";
    expect(main.split(resolve)).toHaveLength(2);
    // Before the runner is built, so a refused boot claims no debate.
    expect(main.indexOf(resolve)).toBeLessThan(main.indexOf("new WalkingSkeletonRunner("));
    expect(main).not.toContain("assertDebateShapeRunnerReady");
  });
});
```

- [ ] **Step 3b: Remove the boot guard at the other three boot sites, and fix what pinned them** (amendment 2026-10-13; main.ts and the practice runner were Step 3; pre-flight PF-B24a)

Find each by name (`command grep -rnE "assertDebateShapeRunnerReady|debate-shape-runner-pending|RUNNER_PENDING" apps tools packages tests deploy acceptance`); the line numbers below are as of 2d4f35e64.

1. **The runner's per-run refusal** (`apps/runner/src/index.ts`): NOT removed in this task (pre-flight PF-B24a, controller
   ruling). `refuseDebateShapeReceiptInPhase2a` (~:243–256, with its doc comment), and its one call right after
   `envelopeBasis = parseCostEnvelopeBasis(run.envelopeBasis);` (~:5080, with the comment "P2b replaces this line"), stay
   exactly as they are. Task 13 removes them when `shapeRun` takes over; Task 12's shape gate is added after the call.
2. **The API boot** (`apps/api/src/main.ts`): delete the step
   `boot.runSync("debate-shape-runner-pending", () => assertDebateShapeRunnerReady(debateShapePolicy));` (~:968), its
   comment block ("I2(a), Phase 2a: …") and the import (~:94). The read line
   `const debateShapePolicy = await boot.run("debate-shape-policy", () => readDebateShapePolicy(pool, environment.REGISTER_VERSION));`
   stays exactly as it is (tests/unit/debate-shape-submit.test.ts pins its text). Right after it add
   `const debateShapeInForcePolicy = debateShapeInForce(debateShapePolicy);`, and the two spreads that hand the row to the
   ask application's settings (~:992) and to the room read's options (~:1536) become
   `...(debateShapeInForcePolicy === null ? {} : { debateShapePolicy: debateShapeInForcePolicy }),`.
3. **The practice ask** (`tools/preview-practice/practice-ask-composition.ts`): delete
   `assertDebateShapeRunnerReady(debateShapePolicy);` (~:138), its comment and import; hand
   `debateShapeInForce(debateShapePolicy)` to `runSettings` exactly as main.ts does (the wiring-drift test compares the two).
4. **The hosted readiness check** (`apps/runner/src/hosted-register-publish.ts`, `verifyHostedRegisterBootReadiness`,
   ~:1352–1355): replace the comment and `assertDebateShapeRunnerReady(await readDebateShapePolicy(pool, version));` with

```ts
  // Debate shape (spec 2026-10-12 §3.1, §4): the runner's own boot resolution (apps/runner/src/main.ts), so a version
  // the runner would refuse (DEBATE_SHAPE_MAP_HASH_UNSEALED / MAP_CONTRACT_HASH_MISMATCH) is never reported ready. The
  // row is read raw, as the runner reads it: a disabled row (enabled: false) still needs its sealed map hash.
  resolveDebateShapeRunnerSettings({
    policy: await readDebateShapePolicy(pool, version),
    mapContractHash: await readMapContractHash(pool, version),
    codeMapContractHash: mapPromptContractHash()
  });
```

   (imports: `readMapContractHash` from `@debateai/register`, `mapPromptContractHash` from `@debateai/map`,
   `resolveDebateShapeRunnerSettings` from `./debate-shape-boot.js`; drop `assertDebateShapeRunnerReady`). The hosted
   plan seeds its contract rows from `buildDevelopmentDeploymentRegisterPublicationRows` (which reaches
   `computeDevelopmentContractRows`), so it seals the code's `mapContractHash` with no other edit; any row-count pin in
   `tests/unit/hosted-register-publish.test.ts` / `tests/integration/hosted-register-publish.test.ts` that moves by one
   is bumped, never worked around.
   In `renderHostedRegisterPlan` (~:1219–1224), the line becomes
   `"debate_shape=present (the runner argues the debate shape; this version also seals mapContractHash)"`, still printed
   only when the plan carries the row; its comment drops "Phase-2a runner refuses this version".
5. **The tests that pin the guard**, rewritten (never deleted without a replacement):
   - `tests/unit/debate-shape-policy.test.ts` (~:170): delete the `assertDebateShapeRunnerReady` case and its import;
     add the `enabled` cases of Step 1 there if you prefer them beside the parser cases (one place only).
   - `tests/unit/debate-shape-submit.test.ts`, three cases in the describe "the boot reads the optional row …":
     (a) the main.ts pin (~:342–349) keeps its `read` assertions; its spread assertion becomes
     `expect(main.split("...(debateShapeInForcePolicy === null ? {} : { debateShapePolicy: debateShapeInForcePolicy }),")).toHaveLength(3);`
     plus `expect(main).toContain("const debateShapeInForcePolicy = debateShapeInForce(debateShapePolicy);")`;
     (b) the "I2(a) … refuse a present row right after reading it" pin (~:351–365) becomes "the API boot and the practice
     ask hand the IN-FORCE row on and carry no Phase-2a guard": neither file contains `assertDebateShapeRunnerReady`,
     and practice-ask-composition.ts contains `debateShapeInForce(debateShapePolicy)` after its read line and before
     `new PostgresAskApplication(`;
     (c) the case "a valid row refuses the practice runner before anything else is read; …" (~:380–389, it drives
     `composePracticeRunner` and expects `DEBATE_SHAPE_POLICY_RUNNER_PENDING`) becomes: a valid row with no
     `mapContractHash` row refuses `DEBATE_SHAPE_MAP_HASH_UNSEALED` after exactly the two reads
     `[[7, "debateShapePolicy"], [7, "mapContractHash"]]`; a valid row with the code's hash (`mapPromptContractHash()`)
     passes on to the next read (`PRACTICE_TEST_NEXT_READ`); a malformed row still refuses `DEBATE_SHAPE_POLICY_INVALID:`;
     no row passes on. Extend `rowPool` to answer `values[1] === "mapContractHash"` from a second optional argument and
     keep it throwing on every other read. Rename the describe's title ("… and the practice runner resolves the shape").
   - `tests/integration/hosted-register-publish.test.ts` (~:555–567): the case that seals the row and expects
     `HOSTED_REGISTER_BOOT_CHECK_FAILED:DEBATE_SHAPE_POLICY_RUNNER_PENDING` now expects the version to be boot-ready
     (the plan seals the code's `mapContractHash`), and a second case seals a register whose `mapContractHash` row is
     removed by hand and expects `HOSTED_REGISTER_BOOT_CHECK_FAILED:DEBATE_SHAPE_MAP_HASH_UNSEALED`.
   - `tests/unit/hosted-register-publish.test.ts` (~:404, M3): the pin becomes `/^debate_shape=present \(the runner argues the debate shape; this version also seals mapContractHash\)$/mu`; the "no line without the member" half stays.
   - `tests/integration/obs-l3-s06-runner-binding.test.ts` (~:543): in the `@debateai/register` stand-in, replace
     `export function assertDebateShapeRunnerReady() {}` with `export function readMapContractHash() {}` and update
     the comment line above it ("Phase 2b replaced the guard with `readMapContractHash`"). `@debateai/map` and
     `./debate-shape-boot.js` load for real (neither touches a database at import); if the case then fails at link time
     on another new named import, add that name to its stand-in, as the comment there explains.
   - `tests/unit/debate-shape-runner-boot.test.ts`: the first describe only, as written in Step 3 above; the second
     describe stays (pre-flight PF-B24a).
6. **The development-row counts** (pre-flight PF-B18): `tests/architecture/register-support-publication.test.ts`
   (~:466–480) counts `buildDevelopmentDeploymentRegisterPublicationRows`'s rows, which now include `mapContractHash`
   (a contract row, not a bootstrap row: `historicalRows` stays 14 and the legacy hash is untouched). Add one dated
   comment line above the counts, in the style of the ones there:
   `// Debate shape (P2b Task 6, 2026-10-13): +1. The runner seals \`mapContractHash\` (computeDevelopmentContractRows). A contract row, so \`historicalRows\` stays 14 and the legacy hash is untouched.`
   and bump every count by one: `toHaveLength(63)` → `64`; the STORY_ROW_KEYS filter `57` → `58`; each of the six
   single-key filters (`admissionPolicy`, `costEnvelopePolicy`, `countryPolicy`, `taxAuthorities`,
   `publicationCheckPolicy`, `consumerRecoveryPolicy`) `62` → `63`; the billing two-key filter `61` → `62`. The
   `consumerRecoveryPolicy` "toHaveLength(1)" and `readLegacyDevelopmentV4Rows()` "32" stay.

- [ ] **Step 3c: The v1 kit keeps its closure** (final review, row "v1 kit")

`deploy/preview-auth-dev/v1/publish-register.ts` (the v1 composer, kept unchanged since v2 replaced it) refuses any
source but 66 rows (`if(rows.length!==66)fail();`) and `composePreviewSnapshot` refuses `source.length!==66||base.length!==65`.
Its builder calls `buildDevelopmentDeploymentRegisterPublicationRows`, which now also emits `mapContractHash`. Do not
bump the counts (the v1 fixtures build a historical v4 base from it): filter the new row out where the rows are built,

```ts
  const rows=[...(await buildDevelopmentDeploymentRegisterPublicationRows(projected,panel,{synthesizerRoleRef:PREVIEW_GLM_PROVIDER_REFS[0],evaluatorRoleRef:PREVIEW_GLM_PROVIDER_REFS[1]},'local'))
    // P2b: the v1 kit predates the debate shape; its reviewed closure stays the 66 keys it was written for.
    .filter(row=>row.rowKey!==MAP_CONTRACT_HASH_ROW_KEY),
```

(import `MAP_CONTRACT_HASH_ROW_KEY` from the register module the file already imports from). Then
`tests/unit/preview-auth-dev-snapshot.test.ts` (66 rows), `tests/integration/preview-auth-dev-fallback.test.ts`,
`tests/integration/preview-auth-dev-native-verify.test.ts` and `deploy/preview-auth-dev/v1/stage-fixture.ts` stay
unchanged and green; that is the check.

- [ ] **Step 3d: The preview kit can publish the row, and switch it off** (ledger NOTE; the rollback decision; pre-flight PF-B19, PF-B20)

`deploy/preview-auth-dev/v1/native-operator.mjs` (pre-flight PF-B20: `validateNativePlan` is synchronous and runs BEFORE
`tsImport(register)`, and the release tool calls it without tsx, so the plan check is SHAPE ONLY; the register's own
parser runs later, in `buildPreviewSourceRowsV2`, before any row is built):

```js
/**
 * The operator's optional debate shape choice (publish-register-v2.ts buildPreviewSourceRowsV2's sixth argument,
 * spec 2026-10-12 §3.1): the exact word 'off' (the row published disabled: the start values with enabled false, the
 * preview's rollback) or one plain JSON object (the policy, with its kind). Shape only: the register's own parser
 * checks the object in buildPreviewSourceRowsV2 (DEBATE_SHAPE_POLICY_INVALID:<path>) before any row is built.
 * Like the checker choice, only plan and publish may carry it.
 */
export const DEBATE_SHAPE_OFF='off';
export function validateDebateShapeChoice(value) {
 if(value===DEBATE_SHAPE_OFF)return value;
 if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)refuse('PREVIEW_NATIVE_PLAN_REFUSED');
 return value;
}
```

- `validateNativePlan`: add `const shape=plan!==null&&typeof plan==='object'&&Object.hasOwn(plan,'debateShape');`, append
  `...(shape?['debateShape']:[])` to the `exactKeys` list, and after the `concurrency` block:
  `if(shape){ validateDebateShapeChoice(plan.debateShape); if(!['plan','publish'].includes(plan.operation))refuse('PREVIEW_NATIVE_PLAN_REFUSED'); }`.
- `runNativeOperator`: pass it as the SIXTH argument of `buildPreviewSourceRowsV2`:
  `…,plan.checkerChoice,plan.roleRotation,plan.callConcurrency??null,plan.debateShape??null);`.

`deploy/preview-auth-dev/v1/publish-register-v2.ts`, `buildPreviewSourceRowsV2`: the sixth parameter becomes
`debateShape:DebateShapePolicy|'off'|null=null`, and the shape row line becomes
`const shapeRows=debateShape===null?[]:[debateShapePolicyRow(debateShape==='off'?{...debateShapePolicyStartValues(),enabled:false}:debateShape,'docs/superpowers/specs/2026-10-12-debate-shape-design.md; owner 2026-10-12')];`
(add `debateShapePolicyStartValues` to the file's `@debateai/register` import). `"off"` = the START VALUES with
`enabled: false`, never the base's row (this function never sees the base); the row stays present, disabled; the
delta shows that one row changed, so the base-row-dropped refusal is never hit, exactly like `roleRotation: "off"`. A
later plan with a policy object switches it back on; a plan with neither keeps the base's row unchanged (R19). Also
add `"mapContractHash"` to `PREVIEW_SOURCE_ROW_KEYS_V2` in its sorted place (between `'livenessPolicy'` and
`'mfaPolicy'`) and change that constant's doc comment "67 at dev 5109a5501 plus role rotation" to say 68, with
`mapContractHash` (P2b Task 6).

`deploy/preview-release/v1/release-artifacts.mjs` (pre-flight PF-B20; the release tool writes the native plan, so
without this the documented rollback could not be produced and a publish would drop the choice):
- the usage comment (~:20–24) gains `[--debate-shape off|'<JSON object>']` and "(--debate-shape only with --operation
  plan; publish carries the plan's choice; default: the base's debate shape row kept as it is, or none; --debate-shape
  off publishes the row disabled: the preview's rollback)";
- the `native-plan` entry's `optional` list (~:92) gains `'--debate-shape'`;
- next to the `--call-concurrency` parsing (~:425–428):

```js
  // Debate shape (P2b Task 6): changes only when the operator gives it for a new `plan`, as the word off or one JSON
  // object (native-operator.mjs validateDebateShapeChoice below; publish-register-v2.ts runs the register's parser);
  // without it the kit keeps the base version's row unchanged, or builds none if the base has none (R19).
  const shapeText = options['--debate-shape'];
  if (shapeText !== undefined && operation !== 'plan') refuse('ARGUMENTS_REFUSED', ['--debate-shape']);
  let shapeValue;
  if (shapeText === 'off') shapeValue = 'off';
  else if (shapeText !== undefined) try { shapeValue = strictJson(Buffer.from(shapeText, 'utf8')); } catch { refuse('ARGUMENTS_REFUSED', ['--debate-shape']); }
```

- next to the `concurrencyChoice` check (~:434–437):

```js
  let shapeChoice;
  if (shapeText !== undefined) {
    const check = deps.validateDebateShapeChoice ?? (await nativeOperator()).validateDebateShapeChoice;
    try { shapeChoice = check(shapeValue); } catch { refuse('ARGUMENTS_REFUSED', ['--debate-shape']); }
  }
```

- next to `const callConcurrency = …` (~:489–490):
  `const debateShape = operation === 'plan' ? shapeChoice : operation === 'publish' ? from.value.debateShape : undefined;`
  and the plan object gains `...(debateShape === undefined ? {} : { debateShape })` after the `callConcurrency` spread.

`deploy/preview-release/v1/README.md`, the `native-plan --operation plan` row (~:72): the command column gains
`[--debate-shape off\|'<JSON object>']`, and its text gains: "`--debate-shape` sets the debate shape row: `off`
publishes it disabled (the start values with `enabled: false`: the API asks today's shape, and a runner on that
version still finishes the debates admitted with the shape); a JSON object (the whole policy, with its kind)
publishes that policy, which the register's own parser checks on the server before any row is built; without it the
current row is kept, or there is none."

Tests, `tests/unit/preview-register-publish-v2.test.ts`.
(1) Pins that move by the new source row (pre-flight PF-B19; the v1 fixtures `v1Source`/`v8`/`v9` are built by v1,
which filters `mapContractHash` out, while the v2 `source` carries it):
- :64 `expect(rows).toHaveLength(67)` → `68`;
- :66–67 (the `differing` list against v1): `expect([...differing].sort()).toEqual([...MULTI_MODEL_KEYS, 'answerRoleRotationPolicy', 'mapContractHash'].sort());`
- :95 (v2 rows = v1 rows + rotation): `[...v1.rows.map(row => row.rowKey), ROTATION_KEY, 'mapContractHash'].sort((a, b) => a.localeCompare(b, 'en'))`;
- :96 (the equality loop): skip `'mapContractHash'` too (`&& row.rowKey !== 'mapContractHash'`);
- :97 `expect(v2.addedKeys).toEqual([ROTATION_KEY, 'consumerRecoveryPolicy', 'mapContractHash', 'publicationCheckPolicy', 'taxAuthorities']);`
- :113 `toHaveLength(69)` → `70`; :114 `expect(plan.addedKeys).toEqual([ROTATION_KEY, 'mapContractHash']);`
- :138 (every other row is the base row): skip `'mapContractHash'` too (it is not in `f.v9`);
- :147 `toHaveLength(69)` → `70`; :148 `expect(plan.addedKeys).toEqual([ROTATION_KEY, 'mapContractHash', 'taxAuthorities']);`
- :230–231 (DeepSeek `differing`): `expect([...differing].sort()).toEqual([...DEEPSEEK_CHECKER_KEYS, ROTATION_KEY, 'mapContractHash'].sort());`
- :238 `expect(plan.addedKeys).toEqual([ROTATION_KEY, 'mapContractHash']);`
- :335 `[ROTATION_KEY, CALL_CONCURRENCY_POLICY_ROW_KEY, 'mapContractHash'].sort((a, b) => a.localeCompare(b, 'en'))`;
- :375 the operator-call regex ends `plan\.callConcurrency\?\?null,plan\.debateShape\?\?null\);/` (and that case's title
  says "fifth and sixth arguments");
- :413 `[ROTATION_KEY, DEBATE_SHAPE_POLICY_ROW_KEY, 'mapContractHash'].sort((a, b) => a.localeCompare(b, 'en'))`;
- the test-file comment "the 68-row result (live v9)" (above `fixture()`) stays: v9 is v1's shape.
`tests/integration/preview-register-publish-v2.test.ts` :34 and :47 `rowCount: 69` → `70`, and the :38 comment
"69-row result" → "70-row result" (its base is built from the v2 source, so `first.addedKeys` keeps its four keys).

(2) New cases, in the describe "publish kit v2: the optional debateShapePolicy row …" (its `build` and `policy` are in
scope; `id` is the file's module-level publication id):

```ts
  it('"off" publishes the start values disabled, as one changed row; a policy object switches it back on (P2b Task 6)', async () => {
    const off = await build('off');
    expect(JSON.parse(off.find(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY)!.valueJsonText))
      .toEqual({ ...JSON.parse(JSON.stringify(policy)), enabled: false });
    const f = await fixture();
    const on = compose(await build(policy), f.v9);
    const switched = compose(off, [...on.rows] as Row[], '10');
    expect(switched.changedKeys).toEqual([DEBATE_SHAPE_POLICY_ROW_KEY]);
    expect(switched.addedKeys).toEqual([]);
    const back = compose(await build(policy), [...switched.rows] as Row[], '11');
    expect(back.changedKeys).toEqual([DEBATE_SHAPE_POLICY_ROW_KEY]);
    expect(back.snapshotSha256).toBe(on.snapshotSha256);
  });
  it('the native plan check takes the word off or a plain object, on plan and publish only; the parser refuses a bad policy when the rows are built', async () => {
    const operator = await import('../../deploy/' + 'preview-auth-dev/v1/native-operator.mjs');
    const value = JSON.parse(JSON.stringify(policy));
    expect(operator.validateDebateShapeChoice('off')).toBe('off');
    expect(operator.validateDebateShapeChoice(value)).toBe(value);
    for (const bad of ['on', 'OFF', null, [], 7, true]) expect(() => operator.validateDebateShapeChoice(bad)).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    const plan = { schema: 'preview-auth-dev-native-plan-v1', operation: 'plan', sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-api',
      sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceManifest: {}, operatorManifestSha256: 'c'.repeat(64), selectedBaseRegisterVersion: '9',
      selectedBaseSnapshotSha256: 'd'.repeat(64), publicationId: id, approval: null };
    for (const operation of ['plan', 'publish']) for (const debateShape of ['off', value]) expect(operator.validateNativePlan({ ...plan, operation, debateShape })).toBeTruthy();
    for (const operation of ['verify', 'apply-and-plan']) expect(() => operator.validateNativePlan({ ...plan, operation, debateShape: 'off' })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    const bad = JSON.parse(JSON.stringify(policy));
    bad.plans.free.mapAIs = 10;
    expect(operator.validateNativePlan({ ...plan, debateShape: bad })).toBeTruthy(); // shape only (pre-flight PF-B20)
    await expect(build(bad)).rejects.toThrow('DEBATE_SHAPE_POLICY_INVALID:plans.free.mapAIs');
  });
```

`tests/unit/preview-release-artifacts.test.ts`, inside the describe "native-plan: publish kit v2 (plan -> owner review
-> publish -> verify)" next to the `--call-concurrency` cases (its `staged`, `run`, `read`, `deps`, `operator` and
`registerModule` are in scope):

```ts
  /** Debate shape (P2b Task 6): the owners' start values, with their kind, as the operator would type them. */
  const SHAPE = JSON.parse(JSON.stringify(registerModule.debateShapePolicyStartValues()));

  it('plan --debate-shape: the plan carries the policy or the word off, publish carries it on, and none is the default', async () => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-shape.json');
    const plan = read(await run(t.nativePlan('plan', ['--debate-shape', JSON.stringify(SHAPE)]).with(-1, out), t.s.layout));
    expect(plan).toEqual({ ...t.plan, debateShape: SHAPE });
    expect(operator.validateNativePlan(plan)).toEqual(plan);
    const proposal = t.writeProposal(t.proposalOf());
    const publish = read(await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], out), t.s.layout, deps));
    expect(publish.debateShape).toEqual(SHAPE);
    const off = read(await run(t.nativePlan('plan', ['--debate-shape', 'off']).with(-1, join(t.s.art, 'native-plan-shape-off.json')), t.s.layout));
    expect(off).toEqual({ ...t.plan, debateShape: 'off' });
    expect(Object.hasOwn(t.plan, 'debateShape')).toBe(false);
  });

  it.each([
    ['text that is neither off nor JSON', 'plan', ['--debate-shape', 'OFF']],
    ['a JSON array', 'plan', ['--debate-shape', '[1]']],
    ['JSON null', 'plan', ['--debate-shape', 'null']],
    ['a JSON string other than off', 'plan', ['--debate-shape', '"on"']],
    ['the option on verify', 'verify', ['--debate-shape', 'off']],
    ['the option on apply-and-plan', 'apply-and-plan', ['--debate-shape', 'off']]
  ])('refuses --debate-shape with %s and writes nothing', async (_name, operation, extra) => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan(operation, extra).with(-1, out), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--debate-shape'] });
    expect(existsSync(out)).toBe(false);
  });
```

`deploy/preview-auth-dev/v1/README.md` (Task 6 owns this file's edits): line ~26 "(67 keys, with the role rotation
row)" becomes "(68 keys, with the role rotation row and `mapContractHash`, the debate shape's sealed map prompts)";
and next to the role-rotation rollback paragraph (~:33), add: "**Debate shape on the preview: on = republish with a
policy (`debateShape`: the whole policy object, release tool `--debate-shape '<JSON>'`); rollback = republish with
`debateShape: "off"` (`--debate-shape off`).** The row stays, disabled (the start values with `enabled: false`): the
API then asks today's shape, and a runner on that version still finishes the debates admitted with the shape. The plan
check only checks the shape of the value; the register's own parser refuses a bad policy on the server, before any row
is built (`DEBATE_SHAPE_POLICY_INVALID:<path>`). Publish it only after P2L Task 15 has landed (the map hash moves once
more there)."

- [ ] **Step 3e: Free answer-job eligibility checks the row's largest WRITER bound** (ledger NOTE; final review note 2; pre-flight PF-B21, PF-B22)

Today `freeAnswerJobsFollowPaidSiteRule` (packages/scorecard/src/plan-caps.ts) is asked with the SEALED bounds only, at
the API boot (`askModelPickerSettings` in `apps/api/src/ask-model-picker.ts`) and at the hosted publish
(`planHostedRegisterPublication` in `apps/runner/src/hosted-register-publish.ts`, the pool-free plan — NOT
`verifyHostedRegisterBootReadiness`, which has no scorecard or targets; pre-flight PF-B21). With a shape row in force a
Free `detailed` answer asks the writer for up to 16,384 tokens, and Free ANSWER_WRITER has no fallback: boot would pass
and those asks would be refused `ASK_MODEL_CANDIDATE_UNAVAILABLE`.
- `freeAnswerJobsFollowPaidSiteRule` is NOT changed (signature and roles as today; controller ruling PF-B22: POSITION is
  dropped, it can take FALLBACK seats — `roleMayFallBack` in packages/scorecard/src/picker.ts — so checking it would refuse
  boots that no ask refuses).
- `apps/api/src/ask-model-picker.ts`: `askModelPickerSettings`'s input gains
  `debateShapePolicy?: DebateShapePolicy | null` (the IN-FORCE policy; import `debateShapeLargestBounds` and
  `type DebateShapePolicy` from `@debateai/register`), and the Free answer-job check is asked with:

```ts
  // Debate shape (P2b Task 6, pre-flight PF-B22): with a row in force a Free `detailed` answer asks the writer for up to
  // the row's largest writer bound, and Free's writer has no fallback. Only this check reads it: `answerTokenCeilings`
  // (the settings the picker seats with) keep the sealed bounds; a run's own writer bound comes from its receipt.
  const freeAnswerCeilings = Object.freeze({
    ANSWER_WRITER: input.debateShapePolicy === undefined || input.debateShapePolicy === null
      ? answerTokenCeilings.ANSWER_WRITER
      : Math.max(answerTokenCeilings.ANSWER_WRITER, debateShapeLargestBounds(input.debateShapePolicy).writer),
    ANSWER_CHECKER: answerTokenCeilings.ANSWER_CHECKER
  });
```

  in place of `answerTokenCeilingByRole: answerTokenCeilings` in the `freeAnswerJobsFollowPaidSiteRule({ … })` call.
  `composeAskModelPicker`'s input gains the same optional member and hands it on:
  `...(input.debateShapePolicy === undefined ? {} : { debateShapePolicy: input.debateShapePolicy }),`.
- `apps/api/src/main.ts` and `tools/preview-practice/practice-ask-composition.ts` pass it. In both files the shape read
  comes AFTER the picker step today (main.ts: picker ~:629, read ~:962; practice-ask-composition.ts: picker ~:120, read
  ~:135): move each read line, text unchanged, with its one-line comment, to just above its
  `const modelPicker = await composeAskModelPicker({` line, followed by
  `const debateShapeInForcePolicy = debateShapeInForce(debateShapePolicy);`, and add
  `debateShapePolicy: debateShapeInForcePolicy,` to the `composeAskModelPicker({ … })` input. (Step 3b item 2/3's
  spreads use the same `debateShapeInForcePolicy`; there is one in-force line per file.)
- `apps/runner/src/hosted-register-publish.ts`, `planHostedRegisterPublication` (pre-flight PF-B21: from the FILE
  member, no pool read). Right after `const debateShapeRow = …` (~:858) add

```ts
  // Debate shape (P2b Task 6, pre-flight PF-B21): the member in force (absent, or `enabled: false`, = none), for the
  // Free answer-job check below. debateShapeRowOf above already refused a malformed member, so this parse cannot refuse.
  const debateShapeInForcePolicy = file.debateShapePolicy === undefined ? null
    : debateShapeInForce(parseDebateShapePolicy({ kind: "DEBATE_SHAPE_POLICY", ...(file.debateShapePolicy as Record<string, unknown>) }));
```

  and in the `freeAnswerJobsFollowPaidSiteRule({ … })` call (~:1098–1103):
  `answerTokenCeilingByRole: { ANSWER_WRITER: debateShapeInForcePolicy === null ? ceilings.synthesizer : Math.max(ceilings.synthesizer, debateShapeLargestBounds(debateShapeInForcePolicy).writer), ANSWER_CHECKER: ceilings.evaluator }`
  (import `debateShapeInForce` and `debateShapeLargestBounds` from `@debateai/register`; `parseDebateShapePolicy` is
  already imported). `verifyHostedRegisterBootReadiness` gets no Free check.
- Tests, written first (the window rule: typical input tokens × 4 + the bound ≤ the target's `contextWindowTokens`;
  the example scorecard's Free answer-writer entries have 9,000 input tokens, the checker's 7,000):
  - `tests/unit/model-picker-boot-stages.test.ts`, in the describe "paid plans P4-E · with billing on, a scorecard must
    seat Free's answer jobs": the local `compose` helper gains `debateShapePolicy?: DebateShapePolicy | null` and hands
    it to `composeAskModelPicker` (spread when defined). New case:

```ts
    it("with a debate shape row in force, asks the row's largest writer bound; a disabled row asks the sealed one (P2b Task 6)", async () => {
      const policy = debateShapePolicyStartValues();
      // CALL_TOKEN_CEILINGS.synthesizer (4096) fits; the row's detailed writer bound (16,384) does not.
      const targets = FREE_ROSTER_TARGETS.map((target) => ({ ...target, contextWindowTokens: 9_000 * 4 + CALL_TOKEN_CEILINGS.synthesizer }));
      const scored = () => poolWithRow({ value_json: followingTheCapRules(freeRosterScored(scorecardJson(5))), source_ref: HOSTED_SOURCE_REF });
      const run = (debateShapePolicy: DebateShapePolicy | null | undefined) => compose({
        pool: scored(), deploymentMode: "hosted", perRunCeilingMicros: 1_000_000, ...sellingPlans, targets,
        ...(debateShapePolicy === undefined ? {} : { debateShapePolicy })
      }).settled;
      expect((await run(undefined)).plansSold).toBe(true);
      await expect(run(policy)).rejects.toThrowError("SCORECARD_FREE_ANSWER_UNSCORED");
      expect((await run(debateShapeInForce({ ...policy, enabled: false }))).plansSold).toBe(true);
      const roomy = FREE_ROSTER_TARGETS.map((target) => ({ ...target, contextWindowTokens: 9_000 * 4 + policy.answerLength.detailed.writerBound }));
      expect((await compose({ pool: scored(), deploymentMode: "hosted", perRunCeilingMicros: 1_000_000, ...sellingPlans, targets: roomy,
        debateShapePolicy: policy }).settled).plansSold).toBe(true);
    });
```

    (import `debateShapeInForce`, `debateShapePolicyStartValues` and `type DebateShapePolicy` from `@debateai/register`).
  - `tests/unit/hosted-register-publish.test.ts`, in the describe "Paid plans P4-E · a scorecard published with billing
    on can seat Free's answer jobs", next to "reads the version's own sealed answer bound against the window":

```ts
  it("with a debateShapePolicy member in force, reads the member's largest writer bound; enabled false reads the sealed one (P2b Task 6)", async () => {
    const { kind: _kind, ...member } = JSON.parse(JSON.stringify(debateShapePolicyStartValues())) as Record<string, unknown>;
    const rows = (await planHostedRegisterPublication(parseHostedRegisterFile(bytesOf(serveFreeRoster(validFile()))))).rows;
    const bound = (JSON.parse(rows.find((row) => row.rowKey === "synthesizerCallBound")!.valueJsonText) as { tokenCeiling: number }).tokenCeiling;
    const shaped = debateShapePolicyStartValues().answerLength.detailed.writerBound;
    expect(shaped).toBeGreaterThan(bound);
    const windowOf = (tokens: number) => (example: Record<string, unknown>) =>
      withFreeCandidates(freeRosterScored(example), { contextWindowTokens: tokens });
    const withShape = (shape: Record<string, unknown>) => sellingPlans(serveFreeRoster({ ...validFile(), debateShapePolicy: shape }));
    expect(await planCodeOf(withShape(member), windowOf(9_000 * 4 + shaped - 1))).toBe("SCORECARD_FREE_ANSWER_UNSCORED");
    expect(await planCodeOf(withShape(member), windowOf(9_000 * 4 + shaped))).toBe("NO_REFUSAL");
    expect(await planCodeOf(withShape({ ...member, enabled: false }), windowOf(9_000 * 4 + bound))).toBe("NO_REFUSAL");
  });
```

- Known limit, recorded, not built (final review note 2c; controller ruling PF-B22): the boot eligibility check covers
  the ANSWER_WRITER only. POSITION is not checked (it can take FALLBACK seats, so a check would refuse boots that no
  ask refuses), so a Free map merge or choose call at the row's map step bound is not proven seatable at boot; and the
  picker's window check sizes POSITION's input at its typical call × 4, while a merge reads every list and the checker
  reads a detailed answer. A too-small window ends in a format failure and the map's code fallback (always an
  answer); measure it in P2d's practice before changing it. A POSITION boot check is an owner ruling if wanted.

- [ ] **Step 3f: The runbook rows** (pre-flight PF-B17c; Task 17 only checks these)

`deploy/vps/README.md`, the refusal table (~:1897): replace the `DEBATE_SHAPE_POLICY_RUNNER_PENDING` row with these
two rows (same position, after `HOSTED_REGISTER_DEBATE_SHAPE_INVALID`):

```markdown
| `DEBATE_SHAPE_MAP_HASH_UNSEALED` | the version seals a `debateShapePolicy` row without its `mapContractHash` row (a hand-made version, or one sealed by an older publisher): the runner refuses to start on it, and the publish's boot check refuses it as `HOSTED_REGISTER_BOOT_CHECK_FAILED:DEBATE_SHAPE_MAP_HASH_UNSEALED` after sealing (`HOSTED_REGISTER_NOT_BOOT_READY`): pin nothing; publish again from this code, whose plan seals `mapContractHash`. |
| `MAP_CONTRACT_HASH_MISMATCH` / `MAP_CONTRACT_HASH_INVALID` | the version's sealed `mapContractHash` is not this runner's map prompts (a version published from other code), or is not a 64-character hex hash: the runner refuses to start, and the publish's boot check says so as `HOSTED_REGISTER_BOOT_CHECK_FAILED:<code>`: pin nothing; deploy the runner that matches the version, or publish again from the deployed code. |
```

`deploy/vps/register/README.md`, the `debateShapePolicy` row (~:54), whole row:

```markdown
| `debateShapePolicy` | optional, and NOT in the example: the debate shape's per-plan sizes and answer lengths (spec 2026-10-12 §3.1), the policy without its `kind`. Absent: today's debate shape. The runner argues the shape; a version that seals this member also seals `mapContractHash` (with `judgeContractHash` and `composerContractHash`, from the same code: the plan builds them from the code it runs), and the runner refuses a version whose `mapContractHash` is missing (`DEBATE_SHAPE_MAP_HASH_UNSEALED`) or is not its own (`MAP_CONTRACT_HASH_MISMATCH`). When the member is present the plan prints `debate_shape=present`, and the publish's own start-up check asks the runner's question (`HOSTED_REGISTER_NOT_BOOT_READY`, `HOSTED_REGISTER_BOOT_CHECK_FAILED:<code>`). To switch the shape off without dropping the row, add `"enabled": false` to the member: the API then asks today's shape, and a runner on that version still finishes the debates admitted with the shape | the command's own check — `HOSTED_REGISTER_DEBATE_SHAPE_INVALID` (a member that is not an object or carries `kind`, a `null` member, or a value the register's own parser refuses) |
```

Keep the README pins of `tests/unit/hosted-register-publish.test.ts:410-414`: the text "the plan prints
`debate_shape=present`" stays in the register README, and no line containing `` `debateShapePolicy` `` in either
README contains `"kind"` with double quotes (both rows above write the word kind in backticks only). The
`DEBATE_SHAPE_RUNNER_UNCONFIGURED` row and the malformed-receipt runbook line are Task 17's (that code comes with Task 12).

- [ ] **Step 3g: The lockfile and the shipped-corpus manifest** (pre-flight PF-B23, PF-B24)

`apps/runner/package.json` gained a workspace dependency; CI installs with `--frozen-lockfile`
(`.github/workflows/security.yml`, `registration-integration.yml`), and locally the root `node_modules` hides a stale
lockfile. Two new shipped files (`packages/register/src/map-contract-hash.ts`, `apps/runner/src/debate-shape-boot.ts`)
must be in the shipped-corpus manifest (`tests/unit/s1-1-depth-contract.test.ts` goes red without them). Run, one at a
time:

```bash
pnpm install --lockfile-only --offline
SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
```

Expected: the lockfile's `apps/runner` importer gains `'@debateai/map'` (`specifier: workspace:*`, `version: link:../../packages/map`); the manifest gains the
two paths in sorted place; the last run passes without the variable.

- [ ] **Step 4: Run — expect PASS**

Run, ONE FILE PER COMMAND, each as `pnpm exec vitest run <file>`: `tests/unit/debate-shape-boot.test.ts`,
`tests/unit/debate-shape-runner-boot.test.ts`, `tests/unit/debate-shape-policy.test.ts`,
`tests/unit/debate-shape-submit.test.ts`, `tests/unit/preview-register-publish-v2.test.ts`,
`tests/unit/preview-release-artifacts.test.ts`, `tests/unit/preview-auth-dev-snapshot.test.ts`,
`tests/unit/hosted-register-publish.test.ts`, `tests/unit/model-picker-boot-stages.test.ts`,
`tests/unit/ask-model-picker.test.ts`, `tests/unit/p4e-free-answer-jobs-rule.test.ts`,
`tests/unit/preview-practice-wiring-drift.test.ts`, `tests/unit/map-package.test.ts`,
`tests/unit/s1-1-depth-contract.test.ts`, `tests/architecture/register-support-publication.test.ts`,
`tests/architecture/scaffold.test.ts`; then, each ALONE: `tests/integration/dev-deployment-register.test.ts`,
`tests/integration/hosted-register-publish.test.ts`, `tests/integration/preview-register-publish-v2.test.ts`,
`tests/integration/preview-auth-dev-fallback.test.ts`, `tests/integration/preview-auth-dev-native-verify.test.ts`,
`tests/integration/obs-l3-s06-runner-binding.test.ts`; then `pnpm run typecheck` (alone). Expected: PASS.

Finally (pre-flight PF-B17b, PF-B24a), these two searches:

```bash
command grep -rnE "assertDebateShapeRunnerReady|debate-shape-runner-pending|RUNNER_PENDING" apps tools packages tests deploy acceptance
command grep -rn "refuseDebateShapeReceiptInPhase2a" apps tools packages tests deploy acceptance
```

Expected: the first prints nothing. The second prints exactly six lines, all of them removed in Task 13: two in
`apps/runner/src/index.ts` (the `export function refuseDebateShapeReceiptInPhase2a(` definition and its one call
`refuseDebateShapeReceiptInPhase2a(envelopeBasis);`) and four in `tests/unit/debate-shape-runner-boot.test.ts` (the
import and the three uses inside its second describe).

- [ ] **Step 5: Commit**

```bash
git add packages/register apps/runner apps/api tools deploy tests pnpm-lock.yaml
git commit -m "register/runner/API: optional mapContractHash row, boot resolves the shape settings, the Phase 2a boot guard removed at its five sites (the per-run refusal stays until Task 13), the preview's off switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Migration 0116: `core.map_item`, `core.map_choice`, `core.map_position`

**Files:**
- Create: `migrations/0116_debate_shape_map.sql`, `migrations/lineage/debate-shape-map-forward0116.json`, `packages/db/src/migration-forward0116.ts`, `tests/architecture/debate-shape-map-0116-contract.test.ts`
- Modify: `packages/db/src/migration-forward-chain.ts` (append `loadForward0116`), `packages/db/src/schema.ts` (Drizzle mirrors), `packages/crypto/src/index.ts` (`CONTENT_CARRIERS` += `"core.map_item"`, `"core.map_choice"`), `migrations/lineage/README.md` (section "## The debate shape map (0116)" + the "fifth" sentence becomes "sixth")
- Modify pins (each names the chain's last step): `tests/architecture/migration-forward-chain.test.ts` (61, 107, 147 + a new "chains 0116 after 0115" test, README test, refusal case), `tests/architecture/migration-forward-auth-db-batch.test.ts:55`, `tests/architecture/security-migration-0065.test.ts:624-630`, `tests/integration/billing-netopia-migration.test.ts:25-26,671,680`, `tests/integration/billing-price-currencies-migration.test.ts:141`, `tests/integration/forward-chain-replay-verifiers.test.ts:60`, `tests/integration/preview-auth-dev-fallback.test.ts:163-170`, `tests/integration/preview-auth-preservation.test.ts:259`, `tests/integration/role-rotation-0114.test.ts:215`, `tests/integration/dx-forward115.test.ts:30`, `tests/unit/preview-auth-dev-pending-forward.test.ts:20,57-98`, `tests/support/shipped-corpus.manifest.txt` (the new loader `packages/db/src/migration-forward0116.ts`, regenerated in Step 3, pre-flight PF-B24 / ruling SC1)

Implementer note (pre-flight PF-B27, the maker check — limit RECORDED, the check is not relaxed): `core.map_item.maker`
and `core.map_position.maker` keep `core.jsonb_is_code_token(to_jsonb(maker))` (0069's rule: one token, no whitespace,
`^[][A-Za-z0-9_.:@/+>=#-]+$`, at most 256 characters), while the register accepts any trimmed maker text
(`packages/register/src/configured-provider-set.ts`, `namedText`). Every maker sealed or configured today passes
(`Z.AI`, `DeepSeek`, `Xiaomi`, `Alibaba`, `Anthropic`, `OpenAI`, `Google`, `xAI`). A future maker with a space (for
example "Mistral AI") would make every map write of a run that seats it fail with a CHECK violation. Known limit: before
such a maker joins any provider set, a later migration relaxes these two checks (an owner decision). Not relaxed here
because a readable column on an encrypted run must hold a token, never free text (0069), and a relaxed pattern is not a
one-line change that keeps that guarantee.

Implementer note (pre-flight PF-B27, the run list): Step 4 runs EVERY edited pin, one file per command, including the
five the first draft left out: `tests/integration/billing-netopia-migration.test.ts`,
`tests/integration/billing-price-currencies-migration.test.ts`, `tests/integration/preview-auth-dev-fallback.test.ts`,
`tests/integration/preview-auth-preservation.test.ts`, and `tests/architecture/scaffold.test.ts` (its source audit
replays every migration through `auditMigrationReplaySafety`).

**Interfaces:** SQL tables (below); `export const loadForward0116: StepLoader` in `migration-forward0116.ts` (same shape as `migration-forward115.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/architecture/debate-shape-map-0116-contract.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "@debateai/crypto";

const sql = readFileSync(new URL("../../migrations/0116_debate_shape_map.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../packages/db/src/schema.ts", import.meta.url), "utf8");
/** tests/support has no shared helper; the same one as tests/architecture/tiers-s02-rosters.test.ts. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("0116: the debate shape's map tables", () => {
  it.each(["core.map_item", "core.map_choice", "core.map_position"])("%s is append-only, TRUNCATE-guarded and granted like a carrier", (table) => {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    expect(sql).toContain(`SELECT core.install_truncate_guard('${table}');`);
    expect(sql).toMatch(new RegExp(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table.replace(".", "\\.")}`, "u"));
    expect(sql).toContain(`GRANT SELECT, INSERT ON ${table} TO debateai_runtime;`);
    expect(sql).toContain(`GRANT SELECT ON ${table} TO debateai_replay;`);
    expect(sql).not.toMatch(new RegExp(`GRANT[^;]*(UPDATE|DELETE|TRUNCATE)[^;]*ON ${table.replace(".", "\\.")}`, "u"));
  });

  it.each(["core.map_item", "core.map_choice"])("%s carries encrypted content with its own guards and the erasure barrier", (table) => {
    const suffix = table.split(".")[1];
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_${suffix}()`);
    expect(sql).toContain(`CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_${suffix}()`);
    expect(sql).toContain(`CREATE TRIGGER enforce_erasure_barrier\nBEFORE INSERT ON ${table}`);
    expect(CONTENT_CARRIERS).toContain(table);
  });

  it("core.map_position is erasure-barred too: an erased run refuses new rows before the root's foreign key is checked", () => {
    // Pre-flight PF-B26: map_position holds no debate text, but Task 8's writeMapPosition must answer RUN_ERASED on an
    // erased run (not the root_node_id foreign key's 23503), so 0040's barrier runs BEFORE INSERT here as well.
    expect(sql).toContain("DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.map_position;");
    expect(sql).toContain("CREATE TRIGGER enforce_erasure_barrier\nBEFORE INSERT ON core.map_position\nFOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();");
    expect(CONTENT_CARRIERS).not.toContain("core.map_position");
  });

  it("never redefines a function an earlier migration owns", () => {
    // Pre-flight PF-B25: anchored on CREATE, because this file must still EXECUTE FUNCTION core.enforce_erasure_barrier()
    // and core.reject_mutation() in its triggers (the 0090 pattern).
    for (const owned of ["core.progress_value_is_code_shaped", "core.enforce_erasure_barrier()", "core.reject_mutation()", "core.install_truncate_guard"]) {
      expect(sql).not.toMatch(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+` + escapeRegExp(owned.replace(/\(\)$/u, "")), "u"));
    }
  });

  it("mirrors the tables in the Drizzle schema", () => {
    for (const name of ["mapItem", "mapChoice", "mapPosition"]) expect(schema).toContain(`export const ${name} = core.table(`);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/architecture/debate-shape-map-0116-contract.test.ts` — Expected: FAIL (file missing).

- [ ] **Step 3: Implement**

`migrations/0116_debate_shape_map.sql`:

```sql
-- 0116 · The debate shape's map (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md §3.4).
--
-- The map is MATERIAL, not graded claims (ruling DR-062): it never enters core.node. Three append-only tables:
--   * core.map_item      one row per point or candidate answer an AI wrote (blind, shown or in a gap round);
--   * core.map_choice    one row per run: the opening used, the map's marks, and (encrypted) the chosen answers,
--                        the also-raised points with their makers, the key points, angles and notes;
--   * core.map_position  one row per chosen answer once its root is saved: which root argued it.
-- Debate text (claims, answers) is encrypted like every other carrier on an encrypted run (0063/0074/0090 pattern);
-- codes (steps, makers, refs, ids, marks) stay readable under code-shape CHECKs. Erasure is inherited: shredding the
-- run key leaves ciphertext, and 0040's barrier refuses new rows once private content is gone.

-- 1. core.map_item -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.map_item (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  item_id text NOT NULL,
  step text NOT NULL,
  ai_ref text NOT NULL,
  maker text NOT NULL,
  origin text NOT NULL,
  angle_id text,
  angle_kind text,
  kind text NOT NULL,
  leans text,
  list_index integer,
  position integer NOT NULL,
  content jsonb NOT NULL,
  content_ciphertext jsonb,
  content_attestation bytea,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, item_id),
  CONSTRAINT map_item_id_shape CHECK (item_id ~ '^[a-z]{2}[0-9]{2,4}$'),
  CONSTRAINT map_item_step_closed CHECK (step IN ('LIST', 'SNOWBALL', 'GAP')),
  CONSTRAINT map_item_origin_closed CHECK (origin IN ('BLIND', 'GAP', 'SHOWN')),
  CONSTRAINT map_item_kind_closed CHECK (kind IN ('POINT', 'ANSWER')),
  CONSTRAINT map_item_leans_closed CHECK (leans IS NULL OR leans IN ('for_some_answer', 'against_some_answer', 'context')),
  CONSTRAINT map_item_angle_kind_closed CHECK (angle_kind IS NULL OR angle_kind IN ('OPPOSITE_CASE', 'ASKER_WORRY', 'PRACTICAL', 'SPECIFIC', 'GENERAL')),
  CONSTRAINT map_item_codes_shape CHECK (core.jsonb_is_code_token(to_jsonb(ai_ref)) AND core.jsonb_is_code_token(to_jsonb(maker))
    AND (angle_id IS NULL OR angle_id ~ '^[a-z0-9][a-z0-9-]{0,23}$')),
  CONSTRAINT map_item_numbers CHECK (position >= 0 AND (list_index IS NULL OR list_index >= 0))
);

-- 2. core.map_choice -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.map_choice (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  opening text NOT NULL,
  marks jsonb NOT NULL,
  content jsonb NOT NULL,
  content_ciphertext jsonb,
  content_attestation bytea,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT map_choice_opening_closed CHECK (opening IN ('MAP', 'TODAYS_OPENING')),
  CONSTRAINT map_choice_marks_codes CHECK (jsonb_typeof(marks) = 'array'
    AND NOT jsonb_path_exists(marks, '$[*] ? (!(@.type() == "string" && @ like_regex "^[A-Z][A-Z0-9_-]{0,63}$"))'))
);

-- 3. core.map_position ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.map_position (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  answer_id text NOT NULL,
  root_index integer NOT NULL,
  root_node_id uuid NOT NULL REFERENCES core.node(node_id),
  maker text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, answer_id),
  CONSTRAINT map_position_root_unique UNIQUE (run_id, root_index),
  CONSTRAINT map_position_answer_shape CHECK (answer_id ~ '^[a-z0-9][a-z0-9-]{0,23}$'),
  CONSTRAINT map_position_codes CHECK (root_index >= 0 AND core.jsonb_is_code_token(to_jsonb(maker)))
);
```

Then, for `map_item` and `map_choice` each, the two guard functions copied from 0090's `ledger.call_prompt` block
(`migrations/0090_model_scorecard.sql` lines ~126–203) with these exact substitutions:

| 0090 | `core.map_item` | `core.map_choice` |
|---|---|---|
| function suffix `_call_prompt` | `_map_item` | `_map_choice` |
| message `ledger.call_prompt` | `core.map_item` | `core.map_choice` |
| plaintext test `NEW.prompt_text = sentinel` / `<> sentinel` | `NEW.content = '{"ciphertext":true,"v":1}'::jsonb` / `<>` | same |
| `OR NEW.prompt_fingerprint IS NULL` (legacy) and `OR NEW.prompt_fingerprint IS NOT NULL` (encrypted) | removed | removed |
| scope check `NEW.attempt_id IS NULL` | `NEW.item_id IS NULL` | (run_id only) |
| attested key `NEW.attempt_id::text` | `NEW.item_id` | `NEW.run_id::text` |

then the five statements per table exactly as 0090 orders them (`aaa_enforce_content_attestation_v2`,
`enforce_content_ciphertext`, `enforce_erasure_barrier`, `core.install_truncate_guard(...)`, `reject_mutation`), the
grants `GRANT SELECT, INSERT ON <table> TO debateai_runtime; GRANT SELECT ON <table> TO debateai_replay;`, and the
function ACLs (`REVOKE ALL … FROM PUBLIC; GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_<suffix>() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_<suffix>() FROM PUBLIC;`). `core.map_position` (ids and
codes, no debate text, so no content guards and not a carrier) gets 0040's erasure barrier (pre-flight PF-B26: without it
`writeMapPosition` on an erased run fails the `root_node_id` foreign key, 23503, instead of answering `RUN_ERASED`),
`install_truncate_guard`, `reject_mutation` and the two grants, in this order:

```sql
-- 0040's erasure barrier, unchanged (its generic branch reads run_id from the row): an erased encrypted run takes no
-- new position, and the refusal comes before the root's foreign key is checked.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.map_position;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON core.map_position
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

SELECT core.install_truncate_guard('core.map_position');
DROP TRIGGER IF EXISTS reject_mutation ON core.map_position;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.map_position
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

GRANT SELECT, INSERT ON core.map_position TO debateai_runtime;
GRANT SELECT ON core.map_position TO debateai_replay;
```

End with 0074's self-check pattern. Its count stays 8 (pre-flight PF-B26): it counts the four content guards
(`aaa_enforce_content_attestation_v2`, `enforce_content_ciphertext`, `enforce_erasure_barrier`, `reject_mutation`) on the
two CARRIERS only (map_item and map_choice, 2 × 4); map_position's two triggers are pinned by the contract test (Step 1)
and digested in the postcondition evidence below:

```sql
DO $map_guard_contract$
BEGIN
  IF (SELECT count(*) FROM pg_trigger AS trigger_row JOIN pg_class AS class_row ON class_row.oid = trigger_row.tgrelid
      JOIN pg_namespace AS ns ON ns.oid = class_row.relnamespace
      WHERE ns.nspname = 'core' AND class_row.relname IN ('map_item', 'map_choice') AND NOT trigger_row.tgisinternal
        AND trigger_row.tgname IN ('aaa_enforce_content_attestation_v2', 'enforce_content_ciphertext', 'enforce_erasure_barrier', 'reject_mutation')) <> 8 THEN
    RAISE EXCEPTION 'MAP_GUARD_CONTRACT_INCOMPLETE';
  END IF;
END
$map_guard_contract$;
```

Manifest `migrations/lineage/debate-shape-map-forward0116.json` (copy `data-export-forward115.json`'s shape):

```json
{"version":"debate-shape-map-forward0116-v1","baseRecipeSha256":"<copy from data-export-forward115.json>",
 "previous":{"name":"0115_data_export.sql","manifestSha256":"<sha256 of data-export-forward115.json>","verifierSha256":"aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a"},
 "migration":{"name":"0116_debate_shape_map.sql","sha256":"<sha256 of 0116_debate_shape_map.sql>"},
 "verifier":{"path":"lineage/verify-effective-capabilities-111.sql","sha256":"aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a"}}
```

Each `<…>` is computed, not invented: `node -e 'console.log(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(process.argv[1])).digest("hex"))' <file>`
(and `baseRecipeSha256` is copied verbatim from the 0115 manifest).

`packages/db/src/migration-forward0116.ts`: copy `migration-forward115.ts` (78 lines) with `NAME = "0116_debate_shape_map.sql"`,
`VERSION = "debate-shape-map-forward0116-v1"`, `MANIFEST_PATH = "lineage/debate-shape-map-forward0116.json"`,
`PREVIOUS = "0115_data_export.sql"`, refusal prefix `MIGRATION_FORWARD0116_`, export `loadForward0116`, and a
`postconditionEvidence(client)` digesting the three tables (columns, constraints, indexes, triggers, ACL, as 0115's
`table` query; the trigger list of `core.map_position` therefore carries `enforce_erasure_barrier` and `reject_mutation`,
pre-flight PF-B26) and the four new functions (definition sha256 and ACL, as 0115's `FUNCTIONS`). Append `loadForward0116`
last in `STEPS` of `migration-forward-chain.ts`.

`packages/db/src/schema.ts`, after `runRoleRotation`: `mapItem`, `mapChoice`, `mapPosition` mirrors (`core.table("map_item", {...})`
with `contentCiphertext: jsonb("content_ciphertext"), contentAttestation: bytea("content_attestation"),` — the same
column helpers `runRoleRotation`/the story mirror use). `packages/crypto/src/index.ts`: append `"core.map_item"`,
`"core.map_choice"` to `CONTENT_CARRIERS`.

Update every pin listed in **Files** the way commit 4cbdfd716 did for 0114 (the chain gains one step; "last step" pins
name 0116).

Then regenerate the shipped-corpus manifest for the new loader (pre-flight PF-B24, ruling SC1), one command at a time:

```bash
SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
```

- [ ] **Step 4: Run — expect PASS**

Run each file ALONE, one command per file, as `pnpm exec vitest run <file>` (pre-flight PF-B27):
`tests/architecture/debate-shape-map-0116-contract.test.ts`, `tests/architecture/migration-forward-chain.test.ts`,
`tests/architecture/migration-forward-auth-db-batch.test.ts`, `tests/architecture/security-migration-0065.test.ts`,
`tests/architecture/scaffold.test.ts`, `tests/unit/preview-auth-dev-pending-forward.test.ts`,
`tests/unit/s1-1-depth-contract.test.ts`; then the integration files, each alone:
`tests/integration/dx-forward115.test.ts`, `tests/integration/forward-chain-replay-verifiers.test.ts`,
`tests/integration/role-rotation-0114.test.ts`, `tests/integration/billing-netopia-migration.test.ts`,
`tests/integration/billing-price-currencies-migration.test.ts`, `tests/integration/preview-auth-dev-fallback.test.ts`,
`tests/integration/preview-auth-preservation.test.ts`; then `pnpm run typecheck` (alone). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add migrations packages/db packages/crypto tests
git commit -m "db: migration 0116 — core.map_item, core.map_choice, core.map_position (append-only, encrypted, erasure-barred)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `MapChoiceRepository` and the readers

**Files:**
- Create: `packages/map/src/repository.ts`, `tests/integration/map-choice-repository.test.ts`
- Modify: `packages/map/src/index.ts`, `packages/map/package.json` (`"@debateai/db": "workspace:*"` ONLY — no `pg`: `Pool` comes from `@debateai/db`, as in `packages/story`; pre-flight PF-B23), `pnpm-lock.yaml` (regenerated, pre-flight PF-B23), `tools/orphan-audit/src/index.ts:28` (the map row becomes `["map", "packages/map", ["kernel", "providers", "db"]]`), `tests/unit/map-package.test.ts` (~:31–36: the dependency pin becomes `["db", "kernel", "providers"]` and the case title "… that depends on kernel, providers and db only"; the edge-row count 37 stays), `tests/architecture/s10-carrier-erasure-red.test.ts` (~:192–216: add `"packages/map/src/repository.ts"` to the sorted `primitiveFiles` list, between `"packages/liveness/src/index.ts"` and `"packages/memory/src/index.ts"`, with a one-line comment "Debate shape (0116): the map repository seals and reads core.map_item / core.map_choice inside withRunContentLease."), `tests/support/shipped-corpus.manifest.txt` (regenerated, pre-flight PF-B24)

Implementer note (pre-flight PF-B28a): `writeMapRun` writes the items and the choice in ONE client transaction
(`withWriteTransaction` from `@debateai/db`) inside the run's content lease, the choice row FIRST: a re-claimed run that
finds the choice writes nothing, and a crash between the two leaves neither (so "items present, no choice" cannot
happen). Every seal is made BEFORE the transaction opens (each seal reads the run's key; nothing is sealed while a write
transaction is open). The repository code below already has this shape.

**Interfaces:**

```ts
export type MapChoiceAnswerRecord = Readonly<{ answerId: string; statement: string; rootIndex: number;
  rootNodeId: string | null; maker: string | null; filled: boolean }>;
export type MapAlsoRaisedRecord = Readonly<{ keyPointId: string; claim: string; makers: readonly string[] }>;
export type MapChoiceRecord = Readonly<{ opening: "MAP" | "TODAYS_OPENING"; answers: readonly MapChoiceAnswerRecord[];
  alsoRaised: readonly MapAlsoRaisedRecord[]; marks: readonly MapMark[] }>;
export type MapWriteOutcome = "INSERTED" | "ALREADY_PRESENT" | "RUN_ERASED";
export class MapChoiceRepository {
  constructor(pool: Pool);
  writeMapRun(input: Readonly<{ runId: string; result: MapResult; answerCount: number }>): Promise<MapWriteOutcome>;
  writeMapPosition(input: Readonly<{ runId: string; answerId: string; rootIndex: number; rootNodeId: string; maker: string }>): Promise<MapWriteOutcome>;
  readMapChoiceForRun(runId: string): Promise<MapChoiceRecord | null>;
  readMapItemsForRun(runId: string): Promise<readonly MapItem[]>;
  readMapResultForRun(runId: string): Promise<MapResult | null>;
}
export function readMapChoiceForRun(pool: Pool, runId: string): Promise<MapChoiceRecord | null>;
export function readMapItemsForRun(pool: Pool, runId: string): Promise<readonly MapItem[]>;
```

`answerCount` is P (the answers the run will argue: `min(choice.answers.length, shape.answers)`): only those are stored
as answers; any extra chosen answer is not argued and is not shown.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/map-choice-repository.test.ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { MapChoiceRepository, readMapChoiceForRun, readMapItemsForRun, type MapResult } from "@debateai/map";
import {
  createEncryptedStoryRun,
  createLegacyStoryRun,
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const seat = (n: number) => ({ aiRef: `preview:ref-${String(n)}`, maker: `maker-${String(n)}` });
const RESULT: MapResult = Object.freeze({
  arm: "C", kind: "MAP", stoppedBy: null,
  angles: [{ angleId: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." }],
  items: [
    { itemId: "pt01", seat: seat(0), origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE", listIndex: 0, kind: "POINT", claim: "It costs a lot.", whyItMatters: "Money.", leans: "against_some_answer" },
    { itemId: "pt02", seat: seat(1), origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, kind: "POINT", claim: "It helps riders.", whyItMatters: "People.", leans: "for_some_answer" },
    { itemId: "pt03", seat: seat(1), origin: "GAP", angleId: null, angleKind: null, listIndex: 101, kind: "POINT", claim: "Night buses.", whyItMatters: "Shifts.", leans: "context" },
    { itemId: "ca01", seat: seat(0), origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE", listIndex: 0, kind: "ANSWER", answer: "No." }
  ],
  keyPoints: [
    { keyPointId: "k1", claim: "It costs a lot.", memberItemIds: ["pt01"], blindMakers: ["maker-0"], gapMakers: [], makers: ["maker-0"], fixedAngleKinds: ["OPPOSITE_CASE"], leansAgainst: true },
    { keyPointId: "k2", claim: "It helps riders.", memberItemIds: ["pt02"], blindMakers: ["maker-1"], gapMakers: [], makers: ["maker-1"], fixedAngleKinds: [], leansAgainst: false },
    { keyPointId: "k3", claim: "Night buses.", memberItemIds: ["pt03"], blindMakers: [], gapMakers: ["maker-1"], makers: ["maker-1"], fixedAngleKinds: [], leansAgainst: false }
  ],
  mergedAnswers: [{ answerId: "a1", answer: "No.", memberItemIds: ["ca01"], blindMakers: ["maker-0"], makers: ["maker-0"], fromOppositeCase: true }],
  framingChallenges: [],
  choice: { answers: [
    { answerId: "a1", statement: "Yes, with conditions.", forKeyPointIds: ["k2"], againstKeyPointIds: ["k1"], strongestRival: "a2", filled: false },
    { answerId: "a2", statement: "No.", forKeyPointIds: ["k1"], againstKeyPointIds: [], strongestRival: "a1", filled: true }
  ], alsoRaised: ["k3"] },
  marks: [{ mark: "ANSWERS_FILLED", step: "CHOOSE", detail: "map" }],
  notes: [], calls: []
}) as MapResult;

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;

// Pre-flight PF-B28b: the story suite's own fixtures (tests/integration/story-repository.test.ts) — ONE encrypted owner
// provisioned once (it configures the pool's content cipher), runs made by createEncryptedStoryRun / createLegacyStoryRun.
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 180_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

function theOwner(): StoryEncryptedOwner {
  if (owner === undefined) throw new Error("MAP_TEST_OWNER_UNPROVISIONED");
  return owner;
}

const marker = (): string => `MAPMARK${randomUUID().replaceAll("-", "")}`;

function newRun(mode: "legacy" | "encrypted"): Promise<string> {
  return mode === "encrypted"
    ? createEncryptedStoryRun(database.pool, theOwner(), `map repository ${marker()}`)
    : createLegacyStoryRun(database.pool, `map repository ${marker()}`, `asker:${marker()}`);
}

/** Copied from story-repository.test.ts: the run's key cleanup intent makes core.run_private_content_is_live false. */
async function eraseRun(runId: string): Promise<void> {
  await database.pool.query(
    `INSERT INTO serve.private_run_key_cleanup_intent (
       request_ref,user_id,run_id,requested_at,cleanup_publication_refs
     ) VALUES ($1,$2,$3,now(),'{}')`,
    [randomUUID(), theOwner().userId, runId]
  );
}

/** A real root node on a LEGACY run (claim text in the clear), inserted as tests/integration/graph-database.test.ts does. */
async function legacyRoot(runId: string): Promise<string> {
  const result = await database.pool.query<{ node_id: string }>(`
    INSERT INTO core.node (
      run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
      materialized_path, generation_status, path_status, exploration_decision,
      way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
    ) VALUES ($1,'map position root','unknown',NULL,NULL,0,0,'0','complete','active','continue','REASONING',NULL,NULL,false,ledger.allocate_sequence())
    RETURNING node_id
  `, [runId]);
  return result.rows[0]!.node_id;
}

describe("MapChoiceRepository (0116)", () => {
  it.each(["legacy", "encrypted"] as const)("writes and reads back a %s run's map", async (mode) => {
    const pool = database.pool;
    const runId = await newRun(mode);
    const repository = new MapChoiceRepository(pool);
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("INSERTED");
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("ALREADY_PRESENT");
    const items = await readMapItemsForRun(pool, runId);
    expect(items.map((item) => item.itemId)).toEqual(["ca01", "pt01", "pt02", "pt03"]);
    expect(items.find((item) => item.itemId === "pt01")).toEqual(RESULT.items[0]);
    const choice = await readMapChoiceForRun(pool, runId);
    expect(choice).toEqual({ opening: "MAP", marks: ["ANSWERS_FILLED"],
      answers: [
        { answerId: "a1", statement: "Yes, with conditions.", rootIndex: 0, rootNodeId: null, maker: null, filled: false },
        { answerId: "a2", statement: "No.", rootIndex: 1, rootNodeId: null, maker: null, filled: true }],
      alsoRaised: [{ keyPointId: "k3", claim: "Night buses.", makers: ["maker-1"] }] });
    // Pre-flight PF-B28a: the reader orders items by item_id (ca01 first); the orchestrator returned them in plan order.
    expect(await repository.readMapResultForRun(runId))
      .toEqual({ ...RESULT, items: [RESULT.items[3], ...RESULT.items.slice(0, 3)], calls: [] });
    const raw = await pool.query<{ content: unknown; has_envelope: boolean }>(
      `SELECT content, content_ciphertext IS NOT NULL AS has_envelope FROM core.map_item WHERE run_id = $1 AND item_id = 'pt01'`, [runId]);
    if (mode === "encrypted") {
      expect(raw.rows[0]).toEqual({ content: { ciphertext: true, v: 1 }, has_envelope: true });
    } else {
      expect(raw.rows[0]).toEqual({ content: { claim: "It costs a lot.", why: "Money." }, has_envelope: false });
    }
  });

  it("a second map for the same run changes nothing: the first map's items and choice stay together (pre-flight PF-B28a)", async () => {
    const runId = await newRun("encrypted");
    const repository = new MapChoiceRepository(database.pool);
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("INSERTED");
    const other = { ...RESULT, items: RESULT.items.map((item) => item.kind === "POINT" ? { ...item, claim: `${item.claim} (other)` } : item) } as MapResult;
    expect(await repository.writeMapRun({ runId, result: other, answerCount: 2 })).toBe("ALREADY_PRESENT");
    expect(await repository.readMapResultForRun(runId))
      .toEqual({ ...RESULT, items: [RESULT.items[3], ...RESULT.items.slice(0, 3)], calls: [] });
  });

  it("joins the root that argued each answer once it is saved", async () => {
    const runId = await newRun("legacy");
    const rootNodeId = await legacyRoot(runId);
    const repository = new MapChoiceRepository(database.pool);
    await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 });
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId, maker: "maker-0" })).toBe("INSERTED");
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId, maker: "maker-0" })).toBe("ALREADY_PRESENT");
    const choice = await readMapChoiceForRun(database.pool, runId);
    expect(choice!.answers[0]).toMatchObject({ rootNodeId, maker: "maker-0" });
    expect(choice!.answers[1]).toMatchObject({ rootNodeId: null, maker: null });
  });

  it("refuses a plaintext write on an encrypted run and any update", async () => {
    const runId = await newRun("encrypted");
    await expect(database.pool.query(`INSERT INTO core.map_choice (run_id, opening, marks, content) VALUES ($1, 'MAP', '[]', '{"answers":[]}')`, [runId]))
      .rejects.toThrow(/CONTENT_PLAINTEXT_WRITE_FORBIDDEN/u);
    await expect(database.pool.query(`UPDATE core.map_item SET maker = 'x'`)).rejects.toThrow();
    await expect(database.pool.query(`TRUNCATE core.map_position`)).rejects.toThrow();
  });

  it("an erased run's map reads as absent and refuses new rows", async () => {
    const runId = await newRun("encrypted");
    const repository = new MapChoiceRepository(database.pool);
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("INSERTED");
    await eraseRun(runId);
    expect(await readMapChoiceForRun(database.pool, runId)).toBeNull();
    expect(await readMapItemsForRun(database.pool, runId)).toEqual([]);
    // No real root: 0116's erasure barrier on core.map_position (pre-flight PF-B26) refuses BEFORE the root_node_id
    // foreign key is checked, so this answers RUN_ERASED, never a 23503.
    expect(await repository.writeMapPosition({ runId, answerId: "a2", rootIndex: 1,
      rootNodeId: "00000000-0000-4000-8000-000000000001", maker: "maker-1" })).toBe("RUN_ERASED");
  });
});
```

(Pre-flight PF-B28b: `provisionStoryEncryptedOwner(pool)` returns `{ userId, ownerRef, sessionId, secretRoot }` and
configures the pool's content cipher; runs come from `createEncryptedStoryRun(pool, owner, line)` /
`createLegacyStoryRun(pool, line, legacyAskerId)`, both returning the run id; the map tables reference `core.run` only,
so no settled answer (`persistTerminalRun`) is needed; the erasure helper is copied from
`tests/integration/story-repository.test.ts`, where it is private. The position join uses a LEGACY run so its root can
be inserted with its claim in the clear.)

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/integration/map-choice-repository.test.ts` (alone) — Expected: FAIL (`MapChoiceRepository` missing).

- [ ] **Step 3: Implement**

`packages/map/src/repository.ts`:

```ts
import { z } from "zod";
import {
  CONTENT_JSON_SENTINEL, decryptContentForRun, encryptAttestedContentForRun, withRunContentLease, withWriteTransaction,
  type CryptoEnvelope, type Pool
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { mapRankKeyPoints } from "./items.js";
import { MAP_MARKS, type MapItem, type MapKeyPoint, type MapMark, type MapResult } from "./types.js";

/**
 * Debate shape (spec §3.4): the map's storage. Items, the run's choice and the roots that argued each answer, in the
 * three append-only tables of migration 0116. Debate text is sealed per row (carriers core.map_item / core.map_choice)
 * on an encrypted run and kept in the clear on a legacy run, exactly as the story's repository does.
 */
export type MapChoiceAnswerRecord = Readonly<{ answerId: string; statement: string; rootIndex: number;
  rootNodeId: string | null; maker: string | null; filled: boolean }>;
export type MapAlsoRaisedRecord = Readonly<{ keyPointId: string; claim: string; makers: readonly string[] }>;
export type MapChoiceRecord = Readonly<{ opening: "MAP" | "TODAYS_OPENING"; answers: readonly MapChoiceAnswerRecord[];
  alsoRaised: readonly MapAlsoRaisedRecord[]; marks: readonly MapMark[] }>;
export type MapWriteOutcome = "INSERTED" | "ALREADY_PRESENT" | "RUN_ERASED";

const SENTINEL = JSON.stringify(CONTENT_JSON_SENTINEL);
const itemContent = z.union([z.object({ claim: z.string(), why: z.string() }).strict(), z.object({ answer: z.string() }).strict()]);
/** The run's map without its items (they are rows of core.map_item) and without its call records (they are ledger rows). */
const choiceContent = z.object({
  answers: z.array(z.object({ answerId: z.string(), statement: z.string(), rootIndex: z.number().int().min(0), filled: z.boolean() }).strict()),
  alsoRaised: z.array(z.object({ keyPointId: z.string(), claim: z.string(), makers: z.array(z.string()) }).strict()),
  result: z.unknown()
}).strict();

function isErased(error: unknown): boolean {
  if (error instanceof TypedDomainError) return error.code === "PRIVATE_CONTENT_ERASED";
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "55000"
    && (error as { message?: unknown }).message === "PRIVATE_CONTENT_ERASED";
}
const invalid = (detail: string): TypedDomainError => new TypedDomainError("MAP_ROW_INVALID", `MAP_ROW_INVALID: ${detail}`);

export class MapChoiceRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * The map's items and its choice, once per run (a re-run of the same run finds them: ALREADY_PRESENT). Pre-flight
   * PF-B28a: every seal is made first (each reads the run's key), then ONE write transaction inserts the choice FIRST and
   * then the items, so a crash leaves neither, and a second writer of the same run (a re-claim) finds the choice and
   * writes no item: the stored items always belong to the stored choice.
   */
  async writeMapRun(input: Readonly<{ runId: string; result: MapResult; answerCount: number }>): Promise<MapWriteOutcome> {
    const { runId, result } = input;
    const answers = (result.choice?.answers ?? []).slice(0, Math.max(0, input.answerCount))
      .map((answer, rootIndex) => Object.freeze({ answerId: answer.answerId, statement: answer.statement, rootIndex, filled: answer.filled }));
    const byId = new Map(result.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint] as const));
    const alsoRaised = mapRankKeyPoints((result.choice?.alsoRaised ?? []).flatMap((id) => byId.get(id) ?? []))
      .map((keyPoint) => Object.freeze({ keyPointId: keyPoint.keyPointId, claim: keyPoint.claim, makers: [...keyPoint.makers] }));
    const { items: _items, calls: _calls, ...rest } = result;
    const content = choiceContent.parse({ answers, alsoRaised, result: rest });
    const opening = result.kind === "MAP" ? "MAP" : "TODAYS_OPENING";
    const marks = result.marks.map((record) => record.mark);
    try {
      return await withRunContentLease(this.pool, [runId], async () => {
        const present = await this.pool.query(`SELECT 1 FROM core.map_choice WHERE run_id = $1`, [runId]);
        if (present.rowCount === 1) return "ALREADY_PRESENT" as const;
        const sealedItems: { item: MapItem; value: unknown; sealed: Awaited<ReturnType<typeof encryptAttestedContentForRun>> }[] = [];
        for (const item of [...result.items].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
          const value = item.kind === "POINT" ? { claim: item.claim, why: item.whyItMatters } : { answer: item.answer };
          sealedItems.push({ item, value, sealed: await encryptAttestedContentForRun(this.pool, runId, "core.map_item", item.itemId, value) });
        }
        const sealedChoice = await encryptAttestedContentForRun(this.pool, runId, "core.map_choice", runId, content);
        return await withWriteTransaction(this.pool, async (client) => {
          const inserted = await client.query(
            `INSERT INTO core.map_choice (run_id, opening, marks, content, content_ciphertext, content_attestation)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (run_id) DO NOTHING`,
            [runId, opening, JSON.stringify(marks), sealedChoice === null ? JSON.stringify(content) : SENTINEL,
              sealedChoice === null ? null : JSON.stringify(sealedChoice.envelope), sealedChoice?.attestation ?? null]
          );
          // Another writer's choice committed first: its items are already there, so this one writes none.
          if (inserted.rowCount !== 1) return "ALREADY_PRESENT" as const;
          for (const { item, value, sealed } of sealedItems) {
            // No ON CONFLICT: this transaction owns the run's choice row, so a duplicate item would be a real defect.
            await client.query(
              `INSERT INTO core.map_item (run_id, item_id, step, ai_ref, maker, origin, angle_id, angle_kind, kind, leans, list_index, position,
                 content, content_ciphertext, content_attestation)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
              [runId, item.itemId, item.origin === "GAP" ? "GAP" : item.origin === "SHOWN" ? "SNOWBALL" : "LIST", item.seat.aiRef, item.seat.maker,
                item.origin, item.angleId, item.angleKind, item.kind, item.kind === "POINT" ? item.leans : null, item.listIndex,
                Number(item.itemId.slice(2)),
                sealed === null ? JSON.stringify(value) : SENTINEL, sealed === null ? null : JSON.stringify(sealed.envelope), sealed?.attestation ?? null]
            );
          }
          return "INSERTED" as const;
        });
      });
    } catch (error) {
      if (isErased(error)) return "RUN_ERASED";
      throw error;
    }
  }

  async writeMapPosition(input: Readonly<{ runId: string; answerId: string; rootIndex: number; rootNodeId: string; maker: string }>): Promise<MapWriteOutcome> {
    try {
      const inserted = await this.pool.query(
        `INSERT INTO core.map_position (run_id, answer_id, root_index, root_node_id, maker) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (run_id, answer_id) DO NOTHING`,
        [input.runId, input.answerId, input.rootIndex, input.rootNodeId, input.maker]
      );
      return inserted.rowCount === 1 ? "INSERTED" : "ALREADY_PRESENT";
    } catch (error) {
      if (isErased(error)) return "RUN_ERASED";
      throw error;
    }
  }

  async readMapChoiceForRun(runId: string): Promise<MapChoiceRecord | null> {
    const read = await this.#readChoice(runId);
    if (read === null) return null;
    const positions = await this.pool.query<{ answer_id: string; root_node_id: string; maker: string }>(
      `SELECT answer_id, root_node_id::text AS root_node_id, maker FROM core.map_position WHERE run_id = $1`, [runId]);
    const byAnswer = new Map(positions.rows.map((row) => [row.answer_id, row] as const));
    return Object.freeze({
      opening: read.opening,
      marks: Object.freeze(read.marks),
      answers: Object.freeze(read.content.answers.map((answer) => Object.freeze({ ...answer,
        rootNodeId: byAnswer.get(answer.answerId)?.root_node_id ?? null, maker: byAnswer.get(answer.answerId)?.maker ?? null }))),
      alsoRaised: Object.freeze(read.content.alsoRaised.map((entry) => Object.freeze({ ...entry, makers: Object.freeze([...entry.makers]) })))
    });
  }

  async readMapItemsForRun(runId: string): Promise<readonly MapItem[]> {
    try {
      return await withRunContentLease(this.pool, [runId], async () => {
        const rows = await this.pool.query<{ item_id: string; ai_ref: string; maker: string; origin: MapItem["origin"]; angle_id: string | null;
          angle_kind: MapItem["angleKind"]; kind: "POINT" | "ANSWER"; leans: string | null; list_index: number; content: unknown;
          content_ciphertext: CryptoEnvelope | null }>(
          `SELECT item_id, ai_ref, maker, origin, angle_id, angle_kind, kind, leans, list_index, content, content_ciphertext
             FROM core.map_item WHERE run_id = $1 ORDER BY item_id`, [runId]);
        const items: MapItem[] = [];
        for (const row of rows.rows) {
          const value = itemContent.parse(await decryptContentForRun<unknown>(this.pool, runId, "core.map_item", row.item_id, row.content_ciphertext, row.content));
          const base = { itemId: row.item_id, seat: Object.freeze({ aiRef: row.ai_ref, maker: row.maker }), origin: row.origin,
            angleId: row.angle_id, angleKind: row.angle_kind, listIndex: row.list_index };
          if (row.kind === "POINT" && "claim" in value) {
            items.push(Object.freeze({ ...base, kind: "POINT" as const, claim: value.claim, whyItMatters: value.why, leans: row.leans as never }));
          } else if (row.kind === "ANSWER" && "answer" in value) {
            items.push(Object.freeze({ ...base, kind: "ANSWER" as const, answer: value.answer }));
          } else {
            throw invalid(`core.map_item ${row.item_id}`);
          }
        }
        return Object.freeze(items);
      });
    } catch (error) {
      if (isErased(error)) return Object.freeze([]);
      throw error;
    }
  }

  /** The whole map, as the orchestrator returned it (minus its call records): a re-claimed run reuses it, calling nothing. */
  async readMapResultForRun(runId: string): Promise<MapResult | null> {
    const read = await this.#readChoice(runId);
    if (read === null) return null;
    const items = await this.readMapItemsForRun(runId);
    return Object.freeze({ ...(read.content.result as Omit<MapResult, "items" | "calls">), items, calls: Object.freeze([]) }) as MapResult;
  }

  async #readChoice(runId: string): Promise<{ opening: "MAP" | "TODAYS_OPENING"; marks: MapMark[]; content: z.infer<typeof choiceContent> } | null> {
    try {
      return await withRunContentLease(this.pool, [runId], async () => {
        const row = (await this.pool.query<{ opening: "MAP" | "TODAYS_OPENING"; marks: unknown; content: unknown; content_ciphertext: CryptoEnvelope | null }>(
          `SELECT opening, marks, content, content_ciphertext FROM core.map_choice WHERE run_id = $1`, [runId])).rows[0];
        if (row === undefined) return null;
        const marks = z.array(z.enum(MAP_MARKS)).parse(row.marks);
        const content = choiceContent.parse(await decryptContentForRun<unknown>(this.pool, runId, "core.map_choice", runId, row.content_ciphertext, row.content));
        return { opening: row.opening, marks, content };
      });
    } catch (error) {
      if (isErased(error)) return null;
      throw error;
    }
  }
}

export function readMapChoiceForRun(pool: Pool, runId: string): Promise<MapChoiceRecord | null> {
  return new MapChoiceRepository(pool).readMapChoiceForRun(runId);
}
export function readMapItemsForRun(pool: Pool, runId: string): Promise<readonly MapItem[]> {
  return new MapChoiceRepository(pool).readMapItemsForRun(runId);
}
```

(`position` is the item's number in its id, which `mapAssignItemIds` derives from plan order; `MapKeyPoint` is imported
for the ranking's types.) Export from `packages/map/src/index.ts`: `export * from "./repository.js";`. Update the
dependency pins listed in **Files**.

Then the lockfile (`packages/map/package.json` gained `@debateai/db`; CI installs with `--frozen-lockfile`, pre-flight
PF-B23) and the shipped-corpus manifest (the new shipped file `packages/map/src/repository.ts`, pre-flight PF-B24), one
command at a time:

```bash
pnpm install --lockfile-only --offline
SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
```

Expected: the lockfile's `packages/map` importer gains `'@debateai/db'` (`specifier: workspace:*`, `version: link:../db`) and nothing named `pg`; the
manifest gains `packages/map/src/repository.ts` in sorted place; the last run passes without the variable.

- [ ] **Step 4: Run — expect PASS**

Run each file ALONE, one command per file: `pnpm exec vitest run tests/integration/map-choice-repository.test.ts`, then
`pnpm exec vitest run tests/unit/map-package.test.ts`, `pnpm exec vitest run tests/architecture/s10-carrier-erasure-red.test.ts`,
`pnpm exec vitest run tests/architecture/scaffold.test.ts`, `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`;
then `pnpm run typecheck` (alone). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/map tools/orphan-audit tests pnpm-lock.yaml
git commit -m "map: MapChoiceRepository — items, choice and positions over 0116, encrypted per run, erasure-safe readers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The shape plan and its seats (pure)

**Files:**
- Create: `apps/runner/src/shape-plan.ts`, `apps/runner/src/shape-seats.ts`, `tests/unit/shape-plan.test.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt` (regenerated in Step 4, pre-flight PF-B24)

Implementer note (pre-flight PF-B31): `buildShapePlan` refuses fewer than two positions (`SHAPE_PLAN_INPUT_INVALID`). Its
callers (Tasks 12 and 13) therefore never pass fewer than two: the position count is
`Math.max(2, Math.min(P, shapeDistinctMakers(rootSeats, seatSitsOut)))` (P = the receipt's `answers`, always ≥ 2), so a
sit-out during the map can never make the plan throw and leave the run without an answer; the hand-over or drop of the
missing position, then `tooFewLeftToArgue`, ends the debate with root 0 (Task 13).

**Interfaces:**

```ts
// apps/runner/src/shape-plan.ts
export type ShapeLegKind = "POINT" | "CROSS" | "REPLY" | "DEFENCE";
export interface ShapeLeg {
  readonly kind: ShapeLegKind;
  readonly round: number;                 // 1: points and cross-replies; k ≥ 2: deeper exchanges; depth + s: scrutiny round s
  readonly rootIndex: number;
  readonly parentIndex: number;
  readonly childIndex: number;            // its plan position
  readonly polarity: "support" | "attack";
  readonly authorIndex: number;           // = rootIndex in the plan; the writer is chosen at call time (shape-seats.ts)
  readonly siblingOrdinal: number;
  readonly chain: number | null;          // the round-1 point (plan position) this leg extends; null for a cross-reply
  readonly consideration: string | null;
  readonly keyPointId: string | null;
  readonly targetRootIndex: number | null;
  readonly callSiteKey: string;
}
export type ShapePointSpec = Readonly<{ polarity: "support" | "attack"; consideration: string | null; keyPointId: string | null }>;
export type ShapePositionPlan = Readonly<{ answerId: string | null; statement: string | null; mapPoints: string | null;
  points: readonly ShapePointSpec[]; rivalIndex: number }>;
export type ShapeScrutinySlots = Readonly<{ start: number; nodesPerDebate: number; roundsPerNode: number; count: number }>;
export type ShapePlan = Readonly<{ rootCount: number; legs: readonly ShapeLeg[]; scrutiny: ShapeScrutinySlots; totalPlannedNodes: number }>;
export function shapeRoundOnePoints(forIds: readonly string[], againstIds: readonly string[], k: number): readonly Readonly<{ polarity: "support" | "attack"; keyPointId: string }>[];
export function shapePositionsFromMap(input: Readonly<{ choice: MapChoice; keyPoints: readonly MapKeyPoint[]; answers: number; pointsPerAnswer: number }>): readonly ShapePositionPlan[];
export function shapePositionsForTodaysOpening(input: Readonly<{ answers: number; pointsPerAnswer: number }>): readonly ShapePositionPlan[];
export function buildShapePlan(input: Readonly<{ positions: readonly ShapePositionPlan[]; depth: number;
  scrutiny: Readonly<{ roundsPerPoint: number; pointsPerDebate: number }> }>): ShapePlan;
export function buildScrutinyLegs(input: Readonly<{ plan: ShapePlan; depth: number; selected: readonly Readonly<{ position: number; rootIndex: number }>[] }>): readonly ShapeLeg[];
export function shapeRunnableNodeCount(plan: ShapePlan, depth: number, depthMode: "fixed" | "adaptive", deeperTopPoints: number): number;
// apps/runner/src/shape-seats.ts
export function shapeSeatOrder<T extends Readonly<{ main: Readonly<{ maker: string }> }>>(seats: readonly T[]): readonly T[];
export type ShapeHandOver = Readonly<{ kind: "SWAP" | "SHARE"; withIndex: number }> | Readonly<{ kind: "NONE" }>;
export function shapeHandOverRoot(input: Readonly<{ makers: readonly string[]; rootCount: number; rootIndex: number; sitsOut: (index: number) => boolean }>): ShapeHandOver;
export function shapeWriterSeat(input: Readonly<{ seatMakers: readonly string[]; avoidMakers: readonly string[];
  preferMaker: string | null; offset: number; sitsOut: (index: number) => boolean }>): number | null;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shape-plan.test.ts
import { describe, expect, it } from "vitest";
import { debateShapeSiteCounts, type DebateShapeCeilingInput } from "@debateai/register";
import { deriveGlobalRoundCompletions, selectPreventableBranches } from "../../apps/runner/src/index.js";
import {
  buildScrutinyLegs, buildShapePlan, shapePositionsForTodaysOpening, shapePositionsFromMap, shapeRoundOnePoints,
  shapeRunnableNodeCount
} from "../../apps/runner/src/shape-plan.js";
import { shapeHandOverRoot, shapeSeatOrder, shapeWriterSeat } from "../../apps/runner/src/shape-seats.js";

const KEY_0069 = /^JUDGE(:root:(secondary|[0-9]{1,4})|:(defender|critic):root[0-9]{1,4}:r[0-9]{1,4}:p[0-9]{1,4}|:cross-root:[0-9]{1,4}->[0-9]{1,4})?$/u;
const kp = (id: string) => ({ keyPointId: id, claim: `Claim ${id}.`, memberItemIds: [], blindMakers: [], gapMakers: [], makers: [], fixedAngleKinds: [], leansAgainst: false });
const CHOICE = { alsoRaised: [], answers: [
  { answerId: "a1", statement: "Yes.", forKeyPointIds: ["k1", "k2"], againstKeyPointIds: ["k3", "k4"], strongestRival: "a2", filled: false },
  // Pre-flight PF-B30: `MapChosenAnswer.strongestRival` is a string, never null; an id not among the answers takes the
  // same "next position" fallback (rivalIndex 2 below).
  { answerId: "a2", statement: "No.", forKeyPointIds: ["k3"], againstKeyPointIds: ["k1"], strongestRival: "gone", filled: false },
  { answerId: "a3", statement: "Only at night.", forKeyPointIds: [], againstKeyPointIds: ["k2"], strongestRival: "a1", filled: true }] };
const KEY_POINTS = ["k1", "k2", "k3", "k4"].map(kp);

describe("round-1 points (spec §3.3 step 3)", () => {
  it("takes against first, then for, at least one of each when both exist", () => {
    expect(shapeRoundOnePoints(["f1", "f2"], ["a1", "a2", "a3"], 3)).toEqual([
      { polarity: "attack", keyPointId: "a1" }, { polarity: "attack", keyPointId: "a2" }, { polarity: "support", keyPointId: "f1" }]);
    expect(shapeRoundOnePoints(["f1"], ["a1"], 1)).toEqual([{ polarity: "attack", keyPointId: "a1" }]);
    expect(shapeRoundOnePoints(["f1", "f2"], [], 4)).toEqual([{ polarity: "support", keyPointId: "f1" }, { polarity: "support", keyPointId: "f2" }]);
  });
});

describe("positions", () => {
  it("from the map: P answers, considerations as claims, the rival by id or the next position", () => {
    const positions = shapePositionsFromMap({ choice: CHOICE, keyPoints: KEY_POINTS, answers: 3, pointsPerAnswer: 3 });
    expect(positions.map((position) => [position.answerId, position.rivalIndex])).toEqual([["a1", 1], ["a2", 2], ["a3", 0]]);
    expect(positions[0]!.points.map((point) => point.consideration)).toEqual(["Claim k3.", "Claim k4.", "Claim k1."]);
    expect(JSON.parse(positions[0]!.mapPoints!)).toEqual({ for: ["Claim k1.", "Claim k2."], against: ["Claim k3.", "Claim k4."] });
    expect(shapePositionsFromMap({ choice: CHOICE, keyPoints: KEY_POINTS, answers: 2, pointsPerAnswer: 3 })).toHaveLength(2);
  });

  it("today's opening fallback: at most P positions, at most K points each, no consideration", () => {
    const positions = shapePositionsForTodaysOpening({ answers: 3, pointsPerAnswer: 2 });
    expect(positions).toHaveLength(3);
    expect(positions[0]!.points).toEqual([{ polarity: "attack", consideration: null, keyPointId: null }, { polarity: "support", consideration: null, keyPointId: null }]);
    expect(positions.map((position) => position.rivalIndex)).toEqual([1, 2, 0]);
  });
});

describe("the breadth-first plan (spec §3.3 steps 3–5, INTERFACE §3 round order)", () => {
  const positions = shapePositionsFromMap({ choice: CHOICE, keyPoints: KEY_POINTS, answers: 3, pointsPerAnswer: 3 });
  const plan = buildShapePlan({ positions, depth: 3, scrutiny: { roundsPerPoint: 2, pointsPerDebate: 6 } });

  it("round 1 holds every point then every cross-reply; parents always precede children", () => {
    const roundOne = plan.legs.filter((leg) => leg.round === 1);
    expect(roundOne.map((leg) => leg.kind)).toEqual([...positions.flatMap((position) => position.points.map(() => "POINT")), "CROSS", "CROSS", "CROSS"]);
    for (const leg of plan.legs) expect(leg.parentIndex).toBeLessThan(leg.childIndex);
    expect(plan.legs.map((leg) => leg.childIndex)).toEqual(plan.legs.map((_leg, index) => plan.rootCount + index));
  });

  it("one boundary per round, after the last leg of that round across all positions", () => {
    const completions = deriveGlobalRoundCompletions(plan.legs);
    expect([...completions.values()]).toEqual([1, 2, 3]);
    for (const [legIndex, round] of completions) {
      expect(plan.legs.slice(0, legIndex + 1).every((leg) => leg.round <= round)).toBe(true);
      expect(plan.legs.slice(legIndex + 1).every((leg) => leg.round > round)).toBe(true);
    }
    const boundaryOne = [...completions.keys()][0]!;
    const points = plan.legs.filter((leg) => leg.kind === "POINT").map((leg) => leg.childIndex);
    expect(selectPreventableBranches({ plan: plan.legs, boundaryLegIndex: boundaryOne, carryingChildIndices: points })).toEqual(points);
  });

  it("a deeper round is one reply and one defence per chain, a linear chain", () => {
    for (const leg of plan.legs.filter((entry) => entry.kind === "REPLY")) {
      const defence = plan.legs.find((entry) => entry.parentIndex === leg.childIndex)!;
      expect(defence).toMatchObject({ kind: "DEFENCE", round: leg.round, chain: leg.chain, polarity: "attack", siblingOrdinal: 1 });
      expect(plan.legs.filter((entry) => entry.parentIndex === leg.parentIndex && entry.round === leg.round)).toHaveLength(1);
    }
  });

  it("every key is unique, no sibling ordinal repeats under one parent, every key passes 0069's code-shape rule", () => {
    expect(new Set(plan.legs.map((leg) => leg.callSiteKey)).size).toBe(plan.legs.length);
    const slots = plan.legs.map((leg) => `${String(leg.parentIndex)}/${String(leg.siblingOrdinal)}`);
    expect(new Set(slots).size).toBe(slots.length);
    for (const leg of plan.legs) expect(leg.callSiteKey).toMatch(KEY_0069);
  });

  it("reserves 2·R·Q scrutiny slots after the plan and builds their legs on demand", () => {
    expect(plan.scrutiny).toEqual({ start: plan.rootCount + plan.legs.length, nodesPerDebate: 6, roundsPerNode: 2, count: 24 });
    expect(plan.totalPlannedNodes).toBe(plan.scrutiny.start + 24);
    const legs = buildScrutinyLegs({ plan, depth: 3, selected: [{ position: 0, rootIndex: 0 }, { position: plan.rootCount, rootIndex: 0 }] });
    expect(legs.map((leg) => [leg.kind, leg.round, leg.childIndex - plan.scrutiny.start])).toEqual([
      ["REPLY", 4, 0], ["DEFENCE", 4, 1], ["REPLY", 4, 2], ["DEFENCE", 4, 3],
      ["REPLY", 5, 12], ["DEFENCE", 5, 13], ["REPLY", 5, 14], ["DEFENCE", 5, 15]]);
    expect(legs[0]!.siblingOrdinal).toBe(plan.legs.filter((leg) => leg.parentIndex === 0).length + 1);
    for (const leg of legs) expect(leg.callSiteKey).toMatch(KEY_0069);
  });

  it("never runs more nodes than P2a priced (enumerator against debateShapeSiteCounts): equal when every answer has K points", () => {
    const fullPoints = shapePositionsForTodaysOpening({ answers: 3, pointsPerAnswer: 3 });
    for (const depthMode of ["fixed", "adaptive"] as const) {
      for (const depth of [1, 2, 3]) {
        const shape = { answers: 3, pointsPerAnswer: 3, deeperTopPoints: 2, depthMode, scrutinyRoundsPerPoint: 2, scrutinyPointsPerDebate: 6,
          mapAIs: 4, gapRounds: 2, graders: 3, closeCallExtraGraders: 1 } as unknown as DebateShapeCeilingInput;
        const priced = debateShapeSiteCounts(shape, depth).nodes;
        const full = buildShapePlan({ positions: fullPoints, depth, scrutiny: { roundsPerPoint: 2, pointsPerDebate: 6 } });
        expect(shapeRunnableNodeCount(full, depth, depthMode, 2), `${depthMode} d${String(depth)}`).toBe(priced);
        // Pre-flight PF-B29: the plan's own legs, counted raw, never a formula. In fixed mode every leg runs, so the plan
        // holds exactly what P2a priced; and no leg is deeper than the depth the ceiling was minted for.
        if (depthMode === "fixed") expect(full.rootCount + full.legs.length + full.scrutiny.count, `fixed d${String(depth)} raw`).toBe(priced);
        for (const leg of full.legs) expect(leg.round).toBeLessThanOrEqual(depth);
        const fewer = buildShapePlan({ positions, depth, scrutiny: { roundsPerPoint: 2, pointsPerDebate: 6 } });
        expect(shapeRunnableNodeCount(fewer, depth, depthMode, 2)).toBeLessThanOrEqual(priced);
      }
    }
  });
});

describe("seats", () => {
  const seat = (maker: string) => ({ main: { maker } });
  it("puts distinct makers first, keeping the opener first", () => {
    expect(shapeSeatOrder([seat("glm"), seat("glm"), seat("ds"), seat("qw")]).map((entry) => entry.main.maker)).toEqual(["glm", "ds", "qw", "glm"]);
  });
  it("hands a sitting-out position to a maker without one, else shares", () => {
    expect(shapeHandOverRoot({ makers: ["a", "b", "c", "d"], rootCount: 2, rootIndex: 1, sitsOut: (index) => index === 1 })).toEqual({ kind: "SWAP", withIndex: 2 });
    expect(shapeHandOverRoot({ makers: ["a", "b", "c"], rootCount: 3, rootIndex: 1, sitsOut: (index) => index === 1 })).toEqual({ kind: "SHARE", withIndex: 2 });
    expect(shapeHandOverRoot({ makers: ["a", "b"], rootCount: 2, rootIndex: 1, sitsOut: () => true })).toEqual({ kind: "NONE" });
  });
  it("writes with a different maker, rotating, preferring one when asked", () => {
    const makers = ["a", "b", "c", "d"];
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["a"], preferMaker: null, offset: 0, sitsOut: () => false })).toBe(1);
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["a"], preferMaker: null, offset: 3, sitsOut: () => false })).toBe(3);
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["b"], preferMaker: "c", offset: 0, sitsOut: () => false })).toBe(2);
    expect(shapeWriterSeat({ seatMakers: makers, avoidMakers: ["a", "b", "c", "d"], preferMaker: null, offset: 0, sitsOut: () => false })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/shape-plan.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

```ts
// apps/runner/src/shape-plan.ts
import type { MapChoice, MapKeyPoint } from "@debateai/map";

/**
 * Debate shape (spec 2026-10-12 §3.3) — THE PLAN, in the runner's own vocabulary: P roots (plan positions 0..P−1) and
 * one breadth-first leg list whose plan positions follow the roots. Round 1 holds every position's chosen points, then
 * one cross-reply per position; each deeper round holds one reply and one defence per chosen point, extending that
 * point's linear chain (fixed: every chain; adaptive: the chains `shape-select.ts` keeps at the round-1 boundary).
 * Parents always precede children, so the ordered recorders, review batches and round boundaries work unchanged; the
 * scrutiny slots are reserved after the plan and filled once scrutiny has chosen its nodes.
 */
export type ShapeLegKind = "POINT" | "CROSS" | "REPLY" | "DEFENCE";
export interface ShapeLeg {
  readonly kind: ShapeLegKind;
  readonly round: number;
  readonly rootIndex: number;
  readonly parentIndex: number;
  readonly childIndex: number;
  readonly polarity: "support" | "attack";
  readonly authorIndex: number;
  readonly siblingOrdinal: number;
  readonly chain: number | null;
  readonly consideration: string | null;
  readonly keyPointId: string | null;
  readonly targetRootIndex: number | null;
  readonly callSiteKey: string;
}
export type ShapePointSpec = Readonly<{ polarity: "support" | "attack"; consideration: string | null; keyPointId: string | null }>;
export type ShapePositionPlan = Readonly<{ answerId: string | null; statement: string | null; mapPoints: string | null;
  points: readonly ShapePointSpec[]; rivalIndex: number }>;
export type ShapeScrutinySlots = Readonly<{ start: number; nodesPerDebate: number; roundsPerNode: number; count: number }>;
export type ShapePlan = Readonly<{ rootCount: number; legs: readonly ShapeLeg[]; scrutiny: ShapeScrutinySlots; totalPlannedNodes: number }>;

const role = (polarity: "support" | "attack"): string => (polarity === "support" ? "defender" : "critic");
/** Every shape leg's key names its OWN plan position (`p<n>`): unique per node, and inside 0069's code shape. */
const legKey = (polarity: "support" | "attack", rootIndex: number, round: number, position: number): string =>
  `JUDGE:${role(polarity)}:root${String(rootIndex)}:r${String(round)}:p${String(position)}`;

/** Spec §3.3 step 3: against first, then for; at least one of each when both exist and K allows two. */
export function shapeRoundOnePoints(forIds: readonly string[], againstIds: readonly string[], k: number):
  readonly Readonly<{ polarity: "support" | "attack"; keyPointId: string }>[] {
  const keepOneFor = forIds.length > 0 && againstIds.length > 0 && k >= 2 ? 1 : 0;
  const against = againstIds.slice(0, Math.max(0, k - keepOneFor));
  const supporting = forIds.slice(0, Math.max(0, k - against.length));
  return Object.freeze([
    ...against.map((keyPointId) => Object.freeze({ polarity: "attack" as const, keyPointId })),
    ...supporting.map((keyPointId) => Object.freeze({ polarity: "support" as const, keyPointId }))
  ]);
}

const nextRival = (index: number, count: number): number => (index + 1) % count;

export function shapePositionsFromMap(input: Readonly<{ choice: MapChoice; keyPoints: readonly MapKeyPoint[]; answers: number; pointsPerAnswer: number }>): readonly ShapePositionPlan[] {
  const claimOf = new Map(input.keyPoints.map((keyPoint) => [keyPoint.keyPointId, keyPoint.claim] as const));
  const answers = input.choice.answers.slice(0, input.answers);
  return Object.freeze(answers.map((answer, index): ShapePositionPlan => {
    const rival = answer.strongestRival === null ? -1 : answers.findIndex((other) => other.answerId === answer.strongestRival);
    const claims = (ids: readonly string[]) => ids.flatMap((id) => claimOf.get(id) ?? []);
    return Object.freeze({
      answerId: answer.answerId,
      statement: answer.statement,
      mapPoints: JSON.stringify({ for: claims(answer.forKeyPointIds), against: claims(answer.againstKeyPointIds) }),
      points: Object.freeze(shapeRoundOnePoints(answer.forKeyPointIds, answer.againstKeyPointIds, input.pointsPerAnswer)
        .flatMap((point) => { const claim = claimOf.get(point.keyPointId); return claim === undefined ? [] : [Object.freeze({ ...point, consideration: claim })]; })),
      rivalIndex: rival < 0 || rival === index ? nextRival(index, answers.length) : rival
    });
  }));
}

/** Spec §1.2 + P2a deviation 5: the map was unavailable — today's opening for the first P seats, at most K points each. */
export function shapePositionsForTodaysOpening(input: Readonly<{ answers: number; pointsPerAnswer: number }>): readonly ShapePositionPlan[] {
  return Object.freeze(Array.from({ length: input.answers }, (_unused, index): ShapePositionPlan => Object.freeze({
    answerId: null, statement: null, mapPoints: null,
    points: Object.freeze(Array.from({ length: input.pointsPerAnswer }, (_point, at): ShapePointSpec =>
      Object.freeze({ polarity: at % 2 === 0 ? "attack" : "support", consideration: null, keyPointId: null }))),
    rivalIndex: nextRival(index, input.answers)
  })));
}

export function buildShapePlan(input: Readonly<{ positions: readonly ShapePositionPlan[]; depth: number;
  scrutiny: Readonly<{ roundsPerPoint: number; pointsPerDebate: number }> }>): ShapePlan {
  const rootCount = input.positions.length;
  if (rootCount < 2 || !Number.isSafeInteger(input.depth) || input.depth < 1) throw new TypeError("SHAPE_PLAN_INPUT_INVALID");
  const legs: ShapeLeg[] = [];
  const children = new Map<number, number>();
  const ordinal = (parent: number): number => { const next = (children.get(parent) ?? 0) + 1; children.set(parent, next); return next; };
  let next = rootCount;
  const push = (leg: Omit<ShapeLeg, "childIndex" | "siblingOrdinal" | "authorIndex" | "callSiteKey">, key: (position: number) => string): ShapeLeg => {
    const childIndex = next;
    next += 1;
    const made: ShapeLeg = Object.freeze({ ...leg, childIndex, authorIndex: leg.rootIndex, siblingOrdinal: ordinal(leg.parentIndex), callSiteKey: key(childIndex) });
    legs.push(made);
    return made;
  };
  input.positions.forEach((position, rootIndex) => {
    for (const point of position.points) {
      push({ kind: "POINT", round: 1, rootIndex, parentIndex: rootIndex, polarity: point.polarity, chain: null,
        consideration: point.consideration, keyPointId: point.keyPointId, targetRootIndex: null },
      (childIndex) => legKey(point.polarity, rootIndex, 1, childIndex));
    }
  });
  // A POINT's chain is itself: set after the push (its position is only known then).
  for (const [index, leg] of legs.entries()) legs[index] = Object.freeze({ ...leg, chain: leg.childIndex });
  input.positions.forEach((position, rootIndex) => {
    push({ kind: "CROSS", round: 1, rootIndex, parentIndex: rootIndex, polarity: "attack", chain: null, consideration: null,
      keyPointId: null, targetRootIndex: position.rivalIndex },
    () => `JUDGE:cross-root:${String(rootIndex)}->${String(position.rivalIndex)}`);
  });
  const chains = legs.filter((leg) => leg.kind === "POINT");
  const tips = new Map(chains.map((leg) => [leg.childIndex, leg.childIndex] as const));
  for (let round = 2; round <= input.depth; round += 1) {
    for (const chain of chains) {
      const reply = push({ kind: "REPLY", round, rootIndex: chain.rootIndex, parentIndex: tips.get(chain.childIndex)!, polarity: "attack",
        chain: chain.childIndex, consideration: null, keyPointId: chain.keyPointId, targetRootIndex: null },
      (childIndex) => legKey("attack", chain.rootIndex, round, childIndex));
      const defence = push({ kind: "DEFENCE", round, rootIndex: chain.rootIndex, parentIndex: reply.childIndex, polarity: "attack",
        chain: chain.childIndex, consideration: null, keyPointId: chain.keyPointId, targetRootIndex: null },
      (childIndex) => legKey("attack", chain.rootIndex, round, childIndex));
      tips.set(chain.childIndex, defence.childIndex);
    }
  }
  const start = rootCount + legs.length;
  const count = 2 * input.scrutiny.roundsPerPoint * input.scrutiny.pointsPerDebate;
  return Object.freeze({
    rootCount, legs: Object.freeze(legs),
    scrutiny: Object.freeze({ start, nodesPerDebate: input.scrutiny.pointsPerDebate, roundsPerNode: input.scrutiny.roundsPerPoint, count }),
    totalPlannedNodes: start + count
  });
}

/**
 * Spec §3.3 step 7: the scrutiny legs for the nodes scrutiny chose (in its rank order). Slot of rank q in scrutiny
 * round s: reply at start + ((s−1)·Qmax + q)·2, its defence right after; a node's first reply takes the next sibling
 * ordinal under it (after every leg the plan put there), each later one extends the node's own scrutiny chain.
 */
export function buildScrutinyLegs(input: Readonly<{ plan: ShapePlan; depth: number; selected: readonly Readonly<{ position: number; rootIndex: number }>[] }>): readonly ShapeLeg[] {
  const { plan } = input;
  const selected = input.selected.slice(0, plan.scrutiny.nodesPerDebate);
  const legs: ShapeLeg[] = [];
  const tips = new Map(selected.map((node) => [node.position, node.position] as const));
  for (let round = 1; round <= plan.scrutiny.roundsPerNode; round += 1) {
    selected.forEach((node, rank) => {
      const replyAt = plan.scrutiny.start + ((round - 1) * plan.scrutiny.nodesPerDebate + rank) * 2;
      const parent = tips.get(node.position)!;
      const firstOrdinal = plan.legs.filter((leg) => leg.parentIndex === parent).length + 1;
      const common = { rootIndex: node.rootIndex, authorIndex: node.rootIndex, polarity: "attack" as const, chain: node.position,
        consideration: null, keyPointId: null, targetRootIndex: null, round: input.depth + round };
      legs.push(Object.freeze({ ...common, kind: "REPLY" as const, parentIndex: parent, childIndex: replyAt,
        siblingOrdinal: parent === node.position ? firstOrdinal : 1, callSiteKey: legKey("attack", node.rootIndex, input.depth + round, replyAt) }));
      legs.push(Object.freeze({ ...common, kind: "DEFENCE" as const, parentIndex: replyAt, childIndex: replyAt + 1,
        siblingOrdinal: 1, callSiteKey: legKey("attack", node.rootIndex, input.depth + round, replyAt + 1) }));
      tips.set(node.position, replyAt + 1);
    });
  }
  return Object.freeze(legs);
}

/**
 * How many nodes the plan can make at most — what P2a's `debateShapeSiteCounts(shape, depth).nodes` priced — COUNTED
 * FROM THE PLAN'S OWN LEGS, never re-derived from a formula (pre-flight PF-B29): the roots, every round-1 leg, the
 * deeper legs of every chain (fixed) or of the first `deeperTopPoints` chains of each position (adaptive: the most chains
 * `shapeSelectChains` keeps, and every chain has as many deeper legs as any other), and the scrutiny slots. A plan with a
 * leg deeper than `depth` is refused: the ceiling was never minted for it.
 */
export function shapeRunnableNodeCount(plan: ShapePlan, depth: number, depthMode: "fixed" | "adaptive", deeperTopPoints: number): number {
  if (plan.legs.some((leg) => leg.round > depth)) throw new TypeError("SHAPE_PLAN_DEEPER_THAN_PRICED");
  const kept = new Set<number>();
  for (let rootIndex = 0; rootIndex < plan.rootCount; rootIndex += 1) {
    const chains = plan.legs.filter((leg) => leg.kind === "POINT" && leg.rootIndex === rootIndex).map((leg) => leg.childIndex);
    for (const chain of depthMode === "fixed" ? chains : chains.slice(0, deeperTopPoints)) kept.add(chain);
  }
  const runnable = plan.legs.filter((leg) => leg.round === 1 || (leg.chain !== null && kept.has(leg.chain)));
  return plan.rootCount + runnable.length + plan.scrutiny.count;
}
```

```ts
// apps/runner/src/shape-seats.ts
/**
 * Debate shape (spec §3.3 steps 2–3) — who writes what. Positions go to DIFFERENT makers, the opener-rotation seat
 * first; a position whose maker sits out goes to a maker without one, else to one that already argues one. A point,
 * reply or defence is written by a maker other than the one it answers, rotating.
 */
export function shapeSeatOrder<T extends Readonly<{ main: Readonly<{ maker: string }> }>>(seats: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const first: T[] = [];
  const rest: T[] = [];
  for (const seat of seats) {
    if (seen.has(seat.main.maker)) rest.push(seat); else { seen.add(seat.main.maker); first.push(seat); }
  }
  return Object.freeze([...first, ...rest]);
}

export type ShapeHandOver = Readonly<{ kind: "SWAP" | "SHARE"; withIndex: number }> | Readonly<{ kind: "NONE" }>;

export function shapeHandOverRoot(input: Readonly<{ makers: readonly string[]; rootCount: number; rootIndex: number; sitsOut: (index: number) => boolean }>): ShapeHandOver {
  const arguing = new Set(input.makers.slice(0, input.rootCount).filter((_maker, index) => index !== input.rootIndex && !input.sitsOut(index)));
  for (let index = input.rootCount; index < input.makers.length; index += 1) {
    if (!input.sitsOut(index) && !arguing.has(input.makers[index]!)) return Object.freeze({ kind: "SWAP", withIndex: index });
  }
  for (let step = 1; step < input.rootCount; step += 1) {
    const index = (input.rootIndex + step) % input.rootCount;
    if (!input.sitsOut(index)) return Object.freeze({ kind: "SHARE", withIndex: index });
  }
  return Object.freeze({ kind: "NONE" });
}

export function shapeWriterSeat(input: Readonly<{ seatMakers: readonly string[]; avoidMakers: readonly string[];
  preferMaker: string | null; offset: number; sitsOut: (index: number) => boolean }>): number | null {
  const count = input.seatMakers.length;
  const open = (index: number): boolean => !input.sitsOut(index) && !input.avoidMakers.includes(input.seatMakers[index]!);
  if (input.preferMaker !== null) {
    for (let step = 0; step < count; step += 1) {
      const index = (input.offset + step) % count;
      if (open(index) && input.seatMakers[index] === input.preferMaker) return index;
    }
  }
  for (let step = 0; step < count; step += 1) {
    const index = (((input.offset + step) % count) + count) % count;
    if (open(index)) return index;
  }
  return null;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/unit/shape-plan.test.ts` — Expected: PASS.

Then regenerate the shipped-corpus manifest for the two new shipped files (pre-flight PF-B24, ruling SC1), and run the
same test file again without the variable (Expected: PASS, the manifest now lists `apps/runner/src/shape-plan.ts` and
`apps/runner/src/shape-seats.ts`):

```bash
SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/shape-plan.ts apps/runner/src/shape-seats.ts tests/unit/shape-plan.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "runner: the debate shape's breadth-first plan, scrutiny slots and seat rules (pure), checked against P2a's count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Adaptive chains and scrutiny needs (pure)

**Files:**
- Create: `apps/runner/src/shape-select.ts`, `tests/unit/shape-select.test.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt` (regenerated in Step 4, pre-flight PF-B24)

**Interfaces:**

```ts
export function shapeSelectChains(input: Readonly<{ chainsByRoot: ReadonlyMap<number, readonly number[]>;
  leverageOf: (position: number) => number | null; frozen: ReadonlySet<number>; perRoot: number }>): ReadonlySet<number>;
export type ScrutinyCandidate = Readonly<{ position: number; rootIndex: number; dispersion: number | null; disputed: boolean;
  rootLeverage: number | null; baseTau: number }>;
export function shapeRankScrutiny(input: Readonly<{ candidates: readonly ScrutinyCandidate[]; disagreementThreshold: number;
  leverageMin: number; weakBelow: number; pointsPerDebate: number }>): readonly ScrutinyCandidate[];
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shape-select.test.ts
import { describe, expect, it } from "vitest";
import { shapeRankScrutiny, shapeSelectChains, type ScrutinyCandidate } from "../../apps/runner/src/shape-select.js";

describe("adaptive chains (spec §3.3 step 5)", () => {
  it("keeps the X chains per position with the highest root leverage; frozen and unscored chains never", () => {
    const leverage = new Map([[10, 0.2], [11, 0.4], [12, 0.1], [13, null], [20, 0.05], [21, 0.3]]);
    const selected = shapeSelectChains({ chainsByRoot: new Map([[0, [10, 11, 12, 13]], [1, [20, 21]]]),
      leverageOf: (position) => leverage.get(position) ?? null, frozen: new Set([11]), perRoot: 2 });
    expect([...selected].sort()).toEqual([10, 12, 20, 21]);
  });
  it("breaks leverage ties by plan order", () => {
    const selected = shapeSelectChains({ chainsByRoot: new Map([[0, [12, 10, 11]]]), leverageOf: () => 0.3, frozen: new Set(), perRoot: 1 });
    expect([...selected]).toEqual([10]);
  });
  // Amendment 2026-10-13 (final review note 5): the row allows deeperTopPoints (X) above the points a position has (K);
  // the choice is capped at the chains that exist, never padded (the ceiling then over-counts, the safe side).
  it("keeps at most the chains that exist when X is larger than K", () => {
    const selected = shapeSelectChains({ chainsByRoot: new Map([[0, [10, 11]], [1, [20]]]), leverageOf: () => 0.2, frozen: new Set(), perRoot: 6 });
    expect([...selected].sort()).toEqual([10, 11, 20]);
  });
});

describe("scrutiny needs (spec §3.3 step 7)", () => {
  const node = (position: number, extra: Partial<ScrutinyCandidate>): ScrutinyCandidate =>
    ({ position, rootIndex: 0, dispersion: 0.1, disputed: false, rootLeverage: 0.01, baseTau: 0.8, ...extra });
  it("ranks by number of needs, then leverage, then plan order; drops the needless; caps at the budget", () => {
    const ranked = shapeRankScrutiny({ disagreementThreshold: 0.25, leverageMin: 0.05, weakBelow: 0.5, pointsPerDebate: 3, candidates: [
      node(5, {}),                                                         // no need
      node(6, { dispersion: 0.3 }),                                         // 1 need
      node(7, { disputed: true, dispersion: 0.4 }),                         // 2 needs
      node(8, { rootLeverage: 0.2, baseTau: 0.3 }),                         // 1 need (weak and carrying), leverage 0.2
      node(9, { disputed: true }),                                          // 1 need, leverage 0.01
      node(10, { dispersion: 0.25, disputed: true, rootLeverage: 0.06, baseTau: 0.1 }) // 3 needs
    ] });
    expect(ranked.map((entry) => entry.position)).toEqual([10, 7, 8]);
  });
  it("a node without leverage can still be needy by spread or dispute", () => {
    const ranked = shapeRankScrutiny({ disagreementThreshold: 0.25, leverageMin: 0.05, weakBelow: 0.5, pointsPerDebate: 6,
      candidates: [node(3, { rootLeverage: null, dispersion: 0.5 }), node(4, { rootLeverage: null, baseTau: 0.1 })] });
    expect(ranked.map((entry) => entry.position)).toEqual([3]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/shape-select.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// apps/runner/src/shape-select.ts
/**
 * Debate shape — the two choices the propagated numbers make (pure code; no model is asked):
 *  · adaptive deeper rounds (spec §3.3 step 5): at the round-1 boundary, per position, the `deeperTopPoints` chosen
 *    points with the highest ROOT leverage (resolveLeverage: the largest change in any root when the point is
 *    removed) keep their chains; a frozen (ε) or unscored point never does. Later rounds extend the same chains.
 *  · scrutiny (step 7): after the planned rounds, nodes ranked by need — a spread at or above the disagreement
 *    threshold, a reviewer dispute, or root leverage ≥ leverageMin with base strength < weakBelow — then leverage,
 *    then plan order; at most `pointsPerDebate`.
 */
export function shapeSelectChains(input: Readonly<{ chainsByRoot: ReadonlyMap<number, readonly number[]>;
  leverageOf: (position: number) => number | null; frozen: ReadonlySet<number>; perRoot: number }>): ReadonlySet<number> {
  const selected = new Set<number>();
  for (const chains of input.chainsByRoot.values()) {
    const scored = chains.flatMap((position) => {
      if (input.frozen.has(position)) return [];
      const leverage = input.leverageOf(position);
      return leverage === null ? [] : [{ position, leverage }];
    });
    scored.sort((left, right) => right.leverage - left.leverage || left.position - right.position);
    for (const entry of scored.slice(0, input.perRoot)) selected.add(entry.position);
  }
  return selected;
}

export type ScrutinyCandidate = Readonly<{ position: number; rootIndex: number; dispersion: number | null; disputed: boolean;
  rootLeverage: number | null; baseTau: number }>;

export function shapeRankScrutiny(input: Readonly<{ candidates: readonly ScrutinyCandidate[]; disagreementThreshold: number;
  leverageMin: number; weakBelow: number; pointsPerDebate: number }>): readonly ScrutinyCandidate[] {
  const needs = (node: ScrutinyCandidate): number =>
    (node.dispersion !== null && node.dispersion >= input.disagreementThreshold ? 1 : 0)
    + (node.disputed ? 1 : 0)
    + (node.rootLeverage !== null && node.rootLeverage >= input.leverageMin && node.baseTau < input.weakBelow ? 1 : 0);
  return Object.freeze(input.candidates
    .map((node) => ({ node, needs: needs(node) }))
    .filter((entry) => entry.needs > 0)
    .sort((left, right) => right.needs - left.needs
      || (right.node.rootLeverage ?? -1) - (left.node.rootLeverage ?? -1)
      || left.node.position - right.node.position)
    .slice(0, input.pointsPerDebate)
    .map((entry) => entry.node));
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/unit/shape-select.test.ts` — Expected: PASS.

Then regenerate the shipped-corpus manifest for the new shipped file (pre-flight PF-B24, ruling SC1), and run the same
test file again without the variable (Expected: PASS, the manifest now lists `apps/runner/src/shape-select.ts`):

```bash
SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/shape-select.ts tests/unit/shape-select.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "runner: adaptive chain choice by root leverage and scrutiny need ranking (pure)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Panels of J graders and the close-call extension

**Files:**
- Modify: `apps/runner/src/shape-select.ts` (add `shapeCloseCallFires`, `shapeCloseCallExtraSeats`, `shapeCloseCallFold`), `apps/runner/src/index.ts` (`runNodePanel`, `saveAuthored`)
- Modify (Step 3b): `apps/api/src/preview-budget-estimate.ts` (`debateSitesByRole`, `previewCallShares`, new `previewShapedGradingShare`), `tests/unit/debate-shape-preview-estimate.test.ts`
- Create: `tests/unit/shape-close-call.test.ts`

No new shipped file (shape-select.ts exists since Task 10), so the shipped-corpus manifest does not change here.

**Interfaces:**

```ts
// apps/runner/src/shape-select.ts
export function shapeCloseCallFires(dispersion: number | null, threshold: number, extra: number): boolean;
export function shapeCloseCallExtraSeats(input: Readonly<{ seatMakers: readonly (string | null)[]; called: readonly boolean[];
  authorMaker: string; onPanelMakers: readonly string[]; extra: number; offset: number }>): readonly number[];
// Pre-flight PF-B32: the extension's outcome, folded exactly as the base panel's (generic: no import of ./index.js).
export function shapeCloseCallFold<J, N, S>(input: Readonly<{ heard: readonly J[]; notes: readonly N[];
  extension: Readonly<{ judgements: readonly J[]; notes: readonly N[]; stoppedBy?: unknown }>;
  stopOf: (error: unknown) => S | null }>): Readonly<{ heard: readonly J[]; notes: readonly N[]; added: number; spendStop: S | null }>;
// apps/runner/src/index.ts — runNodePanel's result gains:
readonly closeCallAdded: number;   // members the close-call extension called (0: none)
// apps/api/src/preview-budget-estimate.ts (Step 3b, pre-flight PF-B35)
export function previewShapedGradingShare(input: Readonly<{ gateMembers: number; graders: number; closeCallExtraGraders: number }>):
  Readonly<{ numerator: bigint; denominator: bigint }>;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/shape-close-call.test.ts
import { describe, expect, it } from "vitest";
import {
  applyCorrelatedErrorDiscount, measureDispersion, runJudgePanel, selectReducedJudgement, type JudgementSelectionRule
} from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import { panelSpendStop } from "../../apps/runner/src/index.js";
import { shapeCloseCallExtraSeats, shapeCloseCallFires, shapeCloseCallFold } from "../../apps/runner/src/shape-select.js";

const ROW = { rowKey: "test", registerVersion: 1, sourceRef: "test" };
const RULE = { kind: "MAXIMIZE_WEIGHTED_TAU", ...ROW } as JudgementSelectionRule;
type Voice = { ref: string; tau: number; family: string | null };
const reduce = (voices: readonly Voice[]) => {
  const weighted = applyCorrelatedErrorDiscount(voices.map((voice) => ({ memberRole: voice.ref, earnedWeight: 1,
    family: voice.family === null ? { kind: "UNKNOWN" as const, reason: "test" } : { kind: "KNOWN" as const, familyRef: voice.family } })),
  { repeatedFamilyMultiplier: 0.5, ...ROW });
  const selected = selectReducedJudgement(voices.map((voice, index) => ({ judgementRef: voice.ref, tau: voice.tau, effectiveWeight: weighted[index]!.effectiveWeight })), RULE);
  const spread = measureDispersion(voices.map((voice) => ({ judgementRef: voice.ref, tau: voice.tau })), { scale: 1, ...ROW });
  if (selected.kind !== "SELECTED") throw new Error("test");
  return { score: selected.selectionScore, spread: spread.kind === "MEASURED" ? spread.value : 0 };
};

describe("the close-call extension (spec §3.3 step 6; §6: the highest-voice rule is unchanged)", () => {
  it("fires only on a measured spread at or above the threshold, with extras allowed", () => {
    expect(shapeCloseCallFires(0.25, 0.25, 2)).toBe(true);
    expect(shapeCloseCallFires(0.24, 0.25, 2)).toBe(false);
    expect(shapeCloseCallFires(null, 0.25, 2)).toBe(false);
    expect(shapeCloseCallFires(0.9, 0.25, 0)).toBe(false);
  });

  it("calls up to E seats not yet called, of makers not on the panel and not the author's, rotating", () => {
    expect(shapeCloseCallExtraSeats({ seatMakers: ["a", "b", "c", "d", "e", "c"], called: [false, true, true, false, false, false],
      authorMaker: "a", onPanelMakers: ["b", "c"], extra: 2, offset: 4 })).toEqual([4, 3]);
    expect(shapeCloseCallExtraSeats({ seatMakers: ["a", "b"], called: [false, true], authorMaker: "a", onPanelMakers: ["b"], extra: 2, offset: 0 })).toEqual([]);
  });

  it("extra voices only RAISE the selected score or WIDEN the spread, never lower either (every order, every family mix)", () => {
    const taus = [0.1, 0.35, 0.6, 0.9];
    const families = [null, "f1", "f2"];
    for (let seed = 0; seed < 500; seed += 1) {
      const pick = <T,>(list: readonly T[], at: number): T => list[(seed * 7 + at * 13) % list.length]!;
      const base: Voice[] = [0, 1, 2].map((at) => ({ ref: `j${String(at)}`, tau: pick(taus, at), family: pick(families, at + seed) }));
      const extras: Voice[] = [3, 4].map((at) => ({ ref: `j${String(at)}`, tau: pick(taus, at + seed), family: pick(families, at) }));
      const before = reduce(base);
      const after = reduce([...base, ...extras]);
      expect(after.score, `seed ${String(seed)}`).toBeGreaterThanOrEqual(before.score);
      expect(after.spread, `seed ${String(seed)}`).toBeGreaterThanOrEqual(before.spread);
    }
  });

  // Pre-flight PF-B32 (law: always an answer). The extension is a SECOND panel run on the same node; on root 0 it must
  // treat a run-level spend stop exactly as root 0's base panel does (M2): keep every voice heard, hand the stop back,
  // so `rootZeroChain` records it and SAVES root 0. The runner-level proof (root 0 saved, the run answered) needs a
  // shaped run, which the runner refuses until Task 13; it is Task 15's case (Step 4 names it). Here: the extension's
  // outcome through the real panel, folded with the same helper and the same stop rule `runNodePanel` uses.
  it("a money stop on root 0's extension still saves root 0: the stop comes back with every voice already heard", async () => {
    const author = { judgementRef: "j0", assessment: {} as never, memberRole: "author" };
    const base = await runJudgePanel({ artifactProducerRef: "actor:author", primary: author, members: [
      { memberRole: "maker-b", actorRef: "actor:b", contractHash: "cb", judge: async () => ({ judgementRef: "j1", assessment: {} as never }) }] });
    const refused = { memberRole: "maker-c", actorRef: "actor:c", contractHash: "cc",
      judge: async (): Promise<never> => { throw new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "test: refused before sending"); } };
    // Root 0's panel (onSpendStop AUTHOR_ONLY) asks its extension to RETURN what it heard, as its base panel does.
    const extension = await runJudgePanel({ artifactProducerRef: "actor:author", primary: author, members: [refused],
      onRunLevelSpendStop: "RETURN_HEARD" });
    const folded = shapeCloseCallFold({ heard: base.judgements, notes: base.notes, extension,
      stopOf: (error) => panelSpendStop(error, "AUTHOR_ONLY") });
    expect(folded.spendStop).toBe("MONEY");
    expect(folded.added).toBe(0);
    expect(folded.heard.map((entry) => entry.judgementRef)).toEqual(["j0", "j1"]);
    // Every other node's panel (TRAVEL): the stop travels to the phase catch, exactly as the base panel's does.
    expect(() => shapeCloseCallFold({ heard: base.judgements, notes: base.notes, extension,
      stopOf: (error) => panelSpendStop(error, "TRAVEL") })).toThrow(TypedDomainError);
  });

  it("an extension that answered adds its voices AFTER every voice already heard, the author kept once", () => {
    const voice = (judgementRef: string) => ({ judgementRef });
    const folded = shapeCloseCallFold({ heard: [voice("j0"), voice("j1")], notes: ["n1"],
      extension: { judgements: [voice("j0"), voice("j2"), voice("j3")], notes: ["n2"] }, stopOf: () => "MONEY" as const });
    expect(folded).toEqual({ heard: [voice("j0"), voice("j1"), voice("j2"), voice("j3")], notes: ["n1", "n2"], added: 2, spendStop: null });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/shape-close-call.test.ts` — Expected: FAIL (helpers missing).

- [ ] **Step 3: Implement**

`apps/runner/src/shape-select.ts`:

```ts
/** Spec §3.3 step 6: a close call (measured spread ≥ the disagreement threshold) gains up to E graders. */
export function shapeCloseCallFires(dispersion: number | null, threshold: number, extra: number): boolean {
  return extra > 0 && dispersion !== null && dispersion >= threshold;
}

/**
 * The extra seats: not called yet, with a maker that is neither the author's nor already on the panel, at most one
 * per maker, in rotation from `offset`. Appended AFTER the panel's members, so the repeated-family discount never
 * re-weights a voice already heard: under the unchanged highest-voice rule an extra can only raise the selected score
 * or widen the spread (spec §6).
 */
export function shapeCloseCallExtraSeats(input: Readonly<{ seatMakers: readonly (string | null)[]; called: readonly boolean[];
  authorMaker: string; onPanelMakers: readonly string[]; extra: number; offset: number }>): readonly number[] {
  const count = input.seatMakers.length;
  const taken = new Set([input.authorMaker, ...input.onPanelMakers]);
  const chosen: number[] = [];
  for (let step = 0; step < count && chosen.length < input.extra; step += 1) {
    const index = (input.offset + step) % count;
    const maker = input.seatMakers[index];
    if (maker === null || maker === undefined || input.called[index] === true || taken.has(maker)) continue;
    taken.add(maker);
    chosen.push(index);
  }
  return Object.freeze(chosen);
}

/**
 * Pre-flight PF-B32 (law: always an answer) — the extension's outcome, folded EXACTLY as the base panel's. The
 * extension's author is judgements[0], as in the base run: kept once; its other voices come AFTER every voice already
 * heard. A run-level spend stop it handed back (root 0's panel asks `RETURN_HEARD`, as its base panel does) is kept
 * with the voices it heard when `stopOf` (the runner's `panelSpendStop(·, input.onSpendStop)`) classifies it, and
 * rethrown otherwise, as the base panel rethrows an unclassified one. Generic, so this file never imports ./index.js.
 */
export function shapeCloseCallFold<J, N, S>(input: Readonly<{ heard: readonly J[]; notes: readonly N[];
  extension: Readonly<{ judgements: readonly J[]; notes: readonly N[]; stoppedBy?: unknown }>;
  stopOf: (error: unknown) => S | null }>): Readonly<{ heard: readonly J[]; notes: readonly N[]; added: number; spendStop: S | null }> {
  let spendStop: S | null = null;
  if (Object.hasOwn(input.extension, "stoppedBy")) {
    spendStop = input.stopOf(input.extension.stoppedBy);
    if (spendStop === null) throw input.extension.stoppedBy;
  }
  const extras = input.extension.judgements.slice(1);
  return Object.freeze({
    heard: Object.freeze([...input.heard, ...extras]),
    notes: Object.freeze([...input.notes, ...input.extension.notes]),
    added: extras.length,
    spendStop
  });
}
```

`apps/runner/src/index.ts`, in `runNodePanel` (all changes guarded by `shapeRun !== null`; `shapeRun` is the
execute-scope constant Task 12 introduces — declare it in this task, right after `envelopeBasis` is parsed (~4952), as
`const shapeShape = envelopeBasis.shape ?? null;` and let Task 12 wrap it). The Phase-2a per-run refusal
`refuseDebateShapeReceiptInPhase2a(envelopeBasis);` stays right above it until Task 13 (controller ruling PF-B24a), so
until then a shaped receipt is refused there and `shapeShape` is `null` in every run that reaches this code:

1. The cap: `const panelCallCap = shapeShape === null ? Math.max(effectiveMakerCount, envelopeBasis.panelSize) - 1 : Math.min(shapeShape.graders, effectiveMakerCount - 1);`
2. Build each member through one function `memberFor(seat, panelOptions, planned)` (the body of today's
   `panelMembers.flatMap` callback for a called seat), so the extension reuses it.
3. Move today's reduction (from `const reducedMembers =` to the `selection` check, ~lines 6014–6074) into a local
   `const reduceHeard = (heard: typeof panel.judgements) => { … return { reducedMembers, dispersion, weighted, selection }; }`
   without changing a statement in it, and call it once as today: `let reduced = reduceHeard(panel.judgements);`.
4. Then the extension:

```ts
      let heard = panel.judgements;
      let notes = panel.notes;
      let closeCallAdded = 0;
      let closeCallStop: EnvelopeStopKind | null = null;
      const firstDispersion = reduced.dispersion.kind === "MEASURED" ? reduced.dispersion.value : null;
      if (shapeShape !== null && spendStop === null
        && shapeCloseCallFires(firstDispersion, panelPolicy.disagreementThreshold, shapeShape.closeCallExtraGraders)) {
        const extraSeats = shapeCloseCallExtraSeats({
          seatMakers: plannedSeats.map((entry) => entry.planned?.maker ?? null),
          called: calledSeats,
          authorMaker: input.authorMaker,
          // Pre-flight PF-B34: every maker already CALLED at this node — the ones heard and the ones that failed — so no
          // panel key (`PANEL:<node>:<providerRef>`, `panelKeyFor`) is ever asked twice.
          onPanelMakers: [
            ...heard.map((entry) => entry.memberRole),
            ...plannedSeats.flatMap((entry, index) => calledSeats[index] === true && entry.planned !== null ? [entry.planned.maker] : [])
          ],
          extra: shapeShape.closeCallExtraGraders,
          offset: seatRotationOffset({ runId: run.runId, role: "JUDGE", callSiteKey: `${input.callSiteKey}:close-call` })
        });
        if (extraSeats.length > 0) {
          const extension = await runJudgePanel({
            artifactProducerRef: input.authorProviderRef,
            primary: { judgementRef: input.authorJudgementRef, assessment: input.authorAssessment, memberRole: input.authorMaker },
            members: extraSeats.map((index) => memberFor(plannedSeats[index]!.seat, plannedSeats[index]!.panelOptions, plannedSeats[index]!.planned!)),
            askTogether: callsRunTogether,
            // Pre-flight PF-B32 (law: always an answer): the SAME rule as the base panel — root 0's panel (AUTHOR_ONLY)
            // keeps what its extension heard and gets the stop back; every other panel lets it travel. Written "TRAVEL"
            // first on purpose: tests/architecture/v28-serve-decision-wiring.test.ts pins the base panel's own mapping
            // text exactly ONCE in this file (PANEL_STOP_MAPPING).
            onRunLevelSpendStop: input.onSpendStop === "TRAVEL" ? "RETHROW" : "RETURN_HEARD",
            leaveOutMoneyRefusedSeats: this.settings.bodyCostFallback === true
          });
          // The author is judgements[0] of both runs: kept once. The extras come AFTER every voice already heard. A stop
          // the extension handed back is classified by the base panel's own rule, or rethrown (shapeCloseCallFold).
          const folded = shapeCloseCallFold({ heard, notes, extension, stopOf: (error) => panelSpendStop(error, input.onSpendStop) });
          heard = folded.heard;
          notes = folded.notes;
          closeCallAdded = folded.added;
          closeCallStop = folded.spendStop;
          if (closeCallAdded > 0) reduced = reduceHeard(heard);
        }
      }
      // Pre-flight PF-B32: the stop that cut this panel short — the base panel's, else its extension's.
      const panelStop = spendStop ?? closeCallStop;
```

and use `reduced.*`, `heard`, `notes` where today's code reads `reducedMembers`, `dispersion`, `weighted`, `selection`,
`panel.notes` after that point (degradation marks, declared disagreement, the receipt), and `panelStop` where it reads
`spendStop` after that point: `panelDegradationOf(nonAuthorVoices, notes, panelStop)`, the receipt's
`...(panelStop === null ? {} : { spendStop: ENVELOPE_STOP_REASONS[panelStop] })` and the result's `spendStop: panelStop`.
Return `closeCallAdded` as a new member of the result object. Leave the base panel's three pinned statements
(`onRunLevelSpendStop: input.onSpendStop === "AUTHOR_ONLY" ? "RETURN_HEARD" : "RETHROW"`,
`? panelSpendStop(panel.stoppedBy, input.onSpendStop)` and its `throw panel.stoppedBy;` guard) exactly as they are.

Pre-flight PF-B32 (BLOCKER, law: always an answer) — why the extension mirrors the base panel. `rootZeroChain` has no
catch around `runNodePanel`; root 0 is saved only AFTER its panel returns (`nodeRecorder.commit(0, … saveAuthored …)`).
An extension that rethrew a spend stop on root 0 would reach `runChain`'s catch, set `bodyFailed`, and root 0 would never
be saved: no answer. With the rule above, a stop on root 0's extension comes back as `selection.spendStop`, so
`rootZeroChain` records it (`runBodyBudgetStop`, `noteSpendStop`), saves root 0 on the voices already heard, and the run
goes on to its answer, exactly as a stop on root 0's base panel does (Task M2). On every other node's panel the
extension's stop travels (`RETHROW` → the caller's `expansionPhaseStop`), exactly as the base panel's does.

Implementer note (pre-flight PF-B34): `onPanelMakers` must name every maker already CALLED at this node, not only those
heard: a failed member's maker left out could be picked as a close-call extra and its panel key
`PANEL:<node>:<providerRef>` asked a second time. The code above passes both lists.

5. In `saveAuthored`, after the `panelDegradations.push(...)` block, record the extension on the node it extended:

```ts
        if (childSelection.closeCallAdded > 0) {
          closeCallExtensions.push(Object.freeze({ nodeId: childNodeId, added: childSelection.closeCallAdded }));
        }
```

(Pre-flight PF-B33: outside the `withGraphWrite` callback the new node's id is `childNodeId`, as the
`panelDegradations.push` block above uses; `created` exists only inside that callback.) `saveAuthored` saves root 0 too
(`saveAuthored(0, …)` with root 0's panel result as `selection`), so root 0's extension is recorded here as well.

with `const closeCallExtensions: { readonly nodeId: string; readonly added: number }[] = [];` declared beside
`panelDegradations` (find `const panelDegradations: PanelDegradationRecord[] = [];`). Task 14 turns them into
`PANEL-CLOSE-CALL-EXTENDED` records.

Imports to add in `index.ts`: `shapeCloseCallExtraSeats, shapeCloseCallFires, shapeCloseCallFold` from `./shape-select.js`
(`panelSpendStop`, `seatRotationOffset`, `runJudgePanel` and `EnvelopeStopKind` are already in the file).

With `shapeShape === null` every line above is today's (cap, one `runJudgePanel`, one reduction, `closeCallAdded: 0`).

**Known limit, recorded (final review note 3; amendment 2026-10-13):** the scorecard picker turns a seat whose model's
window is too small into a ROLE_FALLBACK seat, and fallback seats are not window-checked (packages/scorecard/src/picker.ts,
the window-skip branch and the fallback branch). A shaped writer bound or map bound is therefore a PREFERENCE there,
not a guarantee. This plan does not add a hard window refusal for shaped roles: an oversized call that a fallback model
cannot hold fails its format check and ends in the step's fallback (always an answer). If P2d's practice shows it, the
owners decide whether shaped roles refuse instead.

- [ ] **Step 3b: The preview estimate charges each gate the largest share its members can take** (final review note 1; amendment 2026-10-13; pre-flight PF-B35 and PF-B36)

`apps/api/src/preview-budget-estimate.ts`, in `previewCallShares` (find `for (const model of panelModels) addDebate(model, (BigInt(sites.panel - sites.reviewer) - mapLongSites) * debate);`)
splits every non-review panel site EVENLY over all members. Its comment ("each member states one position … judges
every node another maker authored") is false for a shaped run: with A answers, J graders, E close-call extras and A map
AIs fewer than the M makers, one member can author a whole position's tree and, with sit-outs and shared positions,
almost every node, and the writer and judge seats rotate by a per-site hash, so an even split under-counts a gate (the
owner's never-under-count rule). Example: a 4-maker panel with 3 answers, where Haiku authors about 1/3 of the nodes or
more but is charged 1/4.

For a SHAPED receipt only (`shaped === true`); today's receipt keeps today's line and its comment unchanged (only
re-indented into the `else` branch below):

1. `debateSitesByRole` also returns the two parts of the non-review panel sites, from the `byRole` it already reads
   (`expectedCallsByRoleFromBasis(basis)`): `authored: byRole.POSITION + byRole.SUPPORT_ATTACK + byRole.CROSS_EXCHANGE`
   (for a shaped receipt POSITION already holds every map site: `answers + mapSites`) and `judge: byRole.JUDGE` (for a
   shaped receipt `(J + E) × nodes`, `packages/register/src/index.ts`). So `sites.panel − sites.reviewer` is
   `authored + judge`, as before.
2. AUTHORED sites, controller ruling PF-B36 (cost if wrong: a higher preview estimate for shaped runs): the authored
   sites minus the two map long sites (the merge and the choose stay priced as `MAP_MERGE` / `MAP_CHOOSE`) are charged
   IN FULL to every gate, at its dearest panel member (`dearestPanelMemberPerGate`), the review leg's rule. No seat
   enumeration: the writer rule that would bound one member's authoring is Task 13's, and with sit-outs and shared
   positions one maker can author almost every node.
3. GRADING sites, pre-flight PF-B35 (BLOCKER, bound re-derived by the controller): a gate with g panel members carries
   `min(1, g / (J + E))` of them, J = the receipt's `graders`, E = its `closeCallExtraGraders` (never the old
   `min(1, g·(J+E)/(M−1))`, which under-counts whenever (J+E)² < M−1, e.g. J=1, E=0, M=4 gave 1/3 for a true 1).
   Proof: the receipt prices (J+E)·N grading sites over N nodes; each member grades a node at most once (after PF-B34 no
   panel key is asked twice), so a gate whose g members can sit in at most min(g, J+E) of a node's J+E seats makes at
   most N·min(g, J+E) grading calls, a share of min(1, g/(J+E)); seat rotation by a per-site hash can put them on every
   node, so this is the true worst case for every row value the parser allows (graders 1..5, extras 0..4, so J+E ≥ 1).
   This assumes each route holds at most one judge seat per node (a node's judge seats are distinct seats of distinct
   makers, and the close-call extras are of makers not already called there).
4. The comment above each branch says what that split assumes.

The code (the shaped branch replaces the one even-split line; the review leg, the map leg and the roles below it are
unchanged):

```ts
/**
 * Pre-flight PF-B35 (never under-count): the share of a shaped run's grading sites one GATE can make. A gate with g
 * panel members carries min(1, g / (J + E)), J the receipt's graders and E its close-call extras.
 * Proof: the receipt prices (J+E)·N grading sites over N nodes; each member grades a node at most once (no panel key is
 * asked twice), so a gate whose g members can sit in at most min(g, J+E) of a node's J+E seats makes at most
 * N·min(g, J+E) grading calls, a share of min(1, g/(J+E)); seat rotation by a per-site hash can put them on every node,
 * so this is the true worst case for every row value the parser allows (graders 1..5, extras 0..4, so J+E ≥ 1).
 * It assumes each route holds at most one judge seat per node.
 */
export function previewShapedGradingShare(input: Readonly<{ gateMembers: number; graders: number; closeCallExtraGraders: number }>):
  Readonly<{ numerator: bigint; denominator: bigint }> {
  const seats = input.graders + input.closeCallExtraGraders;
  if (!Number.isSafeInteger(input.gateMembers) || input.gateMembers < 1 || !Number.isSafeInteger(seats) || seats < 1) {
    throw new TypeError("PREVIEW_SHAPED_GRADING_SHARE_INVALID");
  }
  return Object.freeze({ numerator: BigInt(Math.min(input.gateMembers, seats)), denominator: BigInt(seats) });
}
```

In `debateSitesByRole`, the return type gains `authored: number; judge: number` and the returned object gains
`authored: byRole.POSITION + byRole.SUPPORT_ATTACK + byRole.CROSS_EXCHANGE, judge: byRole.JUDGE`.

In `previewCallShares`, the one even-split line becomes:

```ts
      if (shaped) {
        // Debate shape (pre-flight PF-B35, PF-B36; the owner's never-under-count rule): A answers, J graders and E
        // close-call extras can be fewer than the M members, and the writer and judge seats rotate, so one member can
        // author or grade far more than 1/M. Each gate, at its dearest panel member: the authored sites (positions,
        // points, replies, cross-replies, every map site but the merge and the choose, priced below) IN FULL, the review
        // leg's rule; and min(1, g / (J + E)) of the grading sites (`previewShapedGradingShare`), rounded up.
        const shape = previewShapeOf(input.basis)!;
        for (const { model, gateMembers } of dearestPanelMemberPerGate(panelModels)) {
          addDebate(model, (BigInt(sites.authored) - mapLongSites) * debate * members);
          const grading = previewShapedGradingShare({ gateMembers, graders: shape.graders, closeCallExtraGraders: shape.closeCallExtraGraders });
          addDebate(model, (BigInt(sites.judge) * debate * members * grading.numerator + grading.denominator - 1n) / grading.denominator);
        }
      } else {
        // (today's comment, unchanged: "Every panel step but the reviews is shared evenly: …")
        for (const model of panelModels) addDebate(model, (BigInt(sites.panel - sites.reviewer) - mapLongSites) * debate);
      }
```

Test first, in `tests/unit/debate-shape-preview-estimate.test.ts` (P2a's file; its `sharesOf` helper already passes
`dearestFor`; it has `GLM`, `MIMO`, `DEEPSEEK` and `HAIKU` constants and no Qwen one). Add `previewShapedGradingShare` to
its import from `../../apps/api/src/preview-budget-estimate.js`, add
`import { expectedCallsByRoleFromBasis } from "../../apps/api/src/ask-model-picker.js";`, and append:

```ts
describe("pre-flight PF-B35 / PF-B36: a shaped run's gate is never charged less than its own members can make", () => {
  it("PF-B35: a gate of g members carries min(1, g / (J + E)) of the grading sites, whatever the panel size", () => {
    const share = (gateMembers: number, graders: number, closeCallExtraGraders: number) =>
      previewShapedGradingShare({ gateMembers, graders, closeCallExtraGraders });
    // J=1, E=0 on a 4-maker panel: one member can grade every node. The old bound min(1, g·(J+E)/(M−1)) gave 1/3.
    expect(share(1, 1, 0)).toEqual({ numerator: 1n, denominator: 1n });
    // The Plus start values on 4 makers (J=3, E=0): a one-member gate grades at most a third.
    expect(share(1, 3, 0)).toEqual({ numerator: 1n, denominator: 3n });
    expect(share(3, 3, 0)).toEqual({ numerator: 3n, denominator: 3n });
    // The premium start values with makers to spare (J=3, E=2) and the free ones (J=2, E=2).
    expect(share(1, 3, 2)).toEqual({ numerator: 1n, denominator: 5n });
    expect(share(3, 3, 2)).toEqual({ numerator: 3n, denominator: 5n });
    expect(share(6, 3, 2)).toEqual({ numerator: 5n, denominator: 5n });
    expect(share(1, 2, 2)).toEqual({ numerator: 1n, denominator: 4n });
    expect(share(2, 2, 2)).toEqual({ numerator: 2n, denominator: 4n });
  });

  it("PF-B36: every gate carries the authored sites in full; each gate's total is what its own members can make", () => {
    const plus = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "plus", makers: 4,
      settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } })!;
    expect(plus).toMatchObject({ answers: 3, graders: 3, closeCallExtraGraders: 0 });
    const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: 4, depth: 2, shape: plus });
    const panel = [GLM, MIMO, DEEPSEEK, HAIKU].map((model_id, index) => ({ provider_ref: `preview:m${index}`, model_id }));
    const { denominator, shares } = sharesOf(basis, panel);
    const roles = expectedCallsByRoleFromBasis(basis);
    const members = 4n;
    const debate = denominator / members; // PER_STEP (the active mode): one call per site
    const authored = BigInt(roles.POSITION + roles.SUPPORT_ATTACK + roles.CROSS_EXCHANGE) - 2n; // merge and choose priced apart
    const judge = BigInt(roles.JUDGE);
    const reviewer = BigInt(roles.REVIEWER);
    const debateOf = (models: readonly string[]) => shares.filter((entry) => models.includes(entry.model) && entry.type === "DEBATE")
      .reduce((sum, entry) => sum + entry.numerator, 0n);
    // The Anthropic gate (Haiku alone, g=1, J+E=3): every authored site, a third of the grading, the others' reviews.
    // The old even split charged it a quarter of the authored and grading sites together.
    expect(debateOf([HAIKU])).toBe(authored * debate * members + judge * debate * members / 3n + reviewer * debate * (members - 1n));
    // The DeepInfra gate (three members, min(1, 3/3) = 1): every authored, grading and review site; GLM also holds the
    // answer checker's sites (a role, not a panel share).
    expect(debateOf([GLM, MIMO, DEEPSEEK]) - BigInt(roles.ANSWER_CHECKER) * debate * members)
      .toBe((authored + judge + reviewer) * debate * members);
  });
});
```

The existing expectations in this file stay untouched and still pass: on the two-maker Free receipt (J+E = 1, both
members on one gate) the shaped total is still one call per site (`44n * denominator`), and the PF6 cases compare two
pricings of the same shares. Run, one file at a time:

```bash
pnpm exec vitest run tests/unit/debate-shape-preview-estimate.test.ts
pnpm exec vitest run tests/unit/preview-budget-estimate.test.ts
```

(The second proves today's shares did not move.)

- [ ] **Step 4: Run — expect PASS**

Run each file alone, then the typecheck alone (pre-flight PF-B4: there is no `apps/runner` tsconfig; the root
typecheck covers apps, packages, tools and tests):

```bash
pnpm exec vitest run tests/unit/shape-close-call.test.ts
pnpm exec vitest run tests/unit/t03-judge-panel.test.ts
pnpm exec vitest run tests/unit/m2-body-stop-serves.test.ts
pnpm exec vitest run tests/architecture/v28-serve-decision-wiring.test.ts
pnpm run typecheck
```

Expected: PASS. The architecture file pins the base panel's spend-stop statements once each (`PANEL_STOP_MAPPING`,
`PANEL_STOP_DECISION`, `PANEL_STOP_GUARD`, `ROOT_PANEL_RULE`); the extension's own statements are written so they do
not repeat them.

The runner path is proved end to end in Task 15, which a shaped run can only reach after Task 13 lifts the Phase-2a
refusal. Pre-flight PF-B32's runner-level row belongs there, in `tests/integration/debate-shape-run.test.ts`: "a money
stop on root 0's close-call extension still saves root 0 and the run answers" (a shaped run whose root 0 panel's spread
fires the extension, whose extra member's call is refused with `RUN_COST_ENVELOPE_MONEY_REACHED`; expected: the run
COMPLETED, an answer served, root 0 saved with `disagreement.panel.spendStop` = `RUN_COST_ENVELOPE_MONEY_REACHED`,
`ENVELOPE_EXHAUSTED` on the answer).

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/shape-select.ts apps/runner/src/index.ts tests/unit/shape-close-call.test.ts apps/api/src/preview-budget-estimate.ts tests/unit/debate-shape-preview-estimate.test.ts
git commit -m "runner: J graders per node and the close-call extension (re-reduced, highest-voice rule unchanged)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The map stage in the runner

**Files:**
- Create: `apps/runner/src/map-stage.ts`, `tests/unit/map-stage.test.ts`
- Modify: `apps/runner/src/index.ts` (execute: shape gate, the map before root 0, map storage, `debateShapeMap`; constructor: `#mapChoices`; `KNOWN_DOMAIN_CODES` += `DEBATE_SHAPE_RUNNER_UNCONFIGURED`, `MAP_ROW_INVALID`, `MAP_GAP_ITEM_UNKNOWN`), `WalkingSkeletonSettings` (`mapChoices?: { store: Pick<MapChoiceRepository, "writeMapRun" | "writeMapPosition" | "readMapResultForRun"> }`)
- Modify (pre-flight PF-B37: the domain-code list is pinned three ways): `apps/api/src/index.ts` (its own `KNOWN_DOMAIN_CODES`, inside the `// ─── BEGIN OPERATIONAL DIAGNOSTIC ALPHABET` block) and `tests/unit/api-operational-error.test.ts` (`EXPECTED_DOMAIN_CODES`) each gain the same three codes; `tests/unit/dev-runner-reconciliation.test.ts` demands the runner's list equal `EXPECTED_DOMAIN_CODES`, and `api-operational-error.test.ts` demands the API's list equal it too
- Modify (pre-flight PF-B40): `apps/runner/src/shape-seats.ts` (add `shapeDistinctMakers`), `tests/unit/shape-plan.test.ts` (its unit case)
- Modify: `tests/support/shipped-corpus.manifest.txt` (regenerated in Step 4 for the new `map-stage.ts`, pre-flight PF-B24)

Implementer note (controller ruling PF-B24a): the runner's Phase-2a per-run refusal (`refuseDebateShapeReceiptInPhase2a`
and its call right after the strict parse of `envelopeBasis`) STAYS in the code until Task 13. Put this task's shape gate
right after that call. Until Task 13 a shaped receipt is refused there, so the map block below is reached by no run;
every check of it in this task is a unit test of `map-stage.ts`.

**Interfaces:**

```ts
// apps/runner/src/map-stage.ts
export type MapStageMember = Readonly<{ provider: ProviderGateway; providerRef: string }>;
export type MapStageDeps = Readonly<{
  runId: string; subjectItemId: string; mapContractHash: string; judgeBound: CallBound;
  longBounds: Readonly<{ merge: number; choose: number }>;
  memberOf: (aiRef: string) => MapStageMember | null;
  sitsOut: (aiRef: string) => boolean;
  satOutBy: (error: unknown) => boolean;
  spendStopOf: (error: unknown) => EnvelopeStopKind | null;
  laneStopped: (error: unknown) => boolean;
  abandon: (error: unknown) => boolean;
  serial: boolean;
}>;
export type RunnerMapCaller = MapCaller & Readonly<{ spendStop: () => EnvelopeStopKind | null; stopped: () => boolean }>;
export function mapStageBound(bound: CallBound, step: MapStep, longBounds: Readonly<{ merge: number; choose: number }>): CallBound;
export function createRunnerMapCaller(deps: MapStageDeps): RunnerMapCaller;
export function mapStageSeats(seats: readonly Readonly<{ main: Readonly<{ providerRef: string; maker: string }> }>[], mapAIs: number): readonly MapSeat[];
export function runMapStage(input: Readonly<{ opening: DebateShapeOpening; map: MapRunInput }>): Promise<MapResult>;
// Pre-flight PF-B47: every record names the served root, the node the answer rests on (Task 14 passes it).
export function mapConditionRecords(result: MapResult, runId: string, servedRootNodeId: string): readonly ConditionMarkRecord[];
// apps/runner/src/shape-seats.ts (pre-flight PF-B40: a stated signature)
export function shapeDistinctMakers<T extends Readonly<{ main: Readonly<{ maker: string }> }>>(seats: readonly T[], sitsOut: (seat: T) => boolean): number;
```

`EnvelopeStopKind` is imported as a type from `./index.js` (type-only import: no cycle at run time).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/map-stage.test.ts
import { describe, expect, it } from "vitest";
import { replyLanguageExpectation, TypedDomainError } from "@debateai/kernel";
import { mapAnglesSpec, mapPromptContractHash, type MapCallRequest } from "@debateai/map";
import type { ProviderCallRequest, ProviderGateway } from "@debateai/providers";
import { createRunnerMapCaller, mapConditionRecords, mapStageBound, mapStageSeats, type MapStageDeps } from "../../apps/runner/src/map-stage.js";

const BOUND = { maxAttempts: 3, tokenCeiling: 8_192, deadlineMs: 1_260_000 };
const ANGLES = JSON.stringify({ angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the asker fears." },
  { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do first." },
  { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays." }] });
const request = (callSiteKey = "MAP:angles"): MapCallRequest<unknown> => ({ step: "ANGLES", callSiteKey, seat: { aiRef: "ref-a", maker: "a" }, order: 0, shown: "BLIND",
  // Pre-flight PF-B39: `MapSpecContext` requires `replyLanguage` (P2a ruling R-5), built once per question.
  spec: mapAnglesSpec({ questionLine: "Should buses be free?", languageName: "English", languageTag: "en",
    replyLanguage: replyLanguageExpectation("Should buses be free?") }) as never });
const deps = (provider: ProviderGateway, extra: Partial<MapStageDeps> = {}): MapStageDeps => ({
  runId: "run-1", subjectItemId: "wi-1", mapContractHash: mapPromptContractHash(), judgeBound: BOUND, longBounds: { merge: 32_768, choose: 32_768 },
  memberOf: () => ({ provider, providerRef: "ref-a" }), sitsOut: () => false, satOutBy: () => false,
  spendStopOf: (error) => error instanceof TypedDomainError && error.code === "RUN_COST_ENVELOPE_MONEY_REACHED" ? "MONEY" : null,
  laneStopped: (error) => error instanceof TypedDomainError && (error.code === "CALL_LANE_STOPPED" || error.code === "CALL_LANE_HELD_BACK"),
  abandon: (error) => error instanceof TypedDomainError && error.code === "RUNNER_CLAIM_LOST", serial: false, ...extra });
const answering = (content: string, seen: ProviderCallRequest[] = []): ProviderGateway => ({
  call: async (call: ProviderCallRequest) => { seen.push(call); return { content } as never; } } as ProviderGateway);
const throwing = (error: unknown): ProviderGateway => ({ call: async () => { throw error; } } as unknown as ProviderGateway);

describe("the runner's map caller", () => {
  it("sends a JUDGE/served call under the map hash, no model role, the step's bound", async () => {
    const seen: ProviderCallRequest[] = [];
    const outcome = await createRunnerMapCaller(deps(answering(ANGLES, seen))).call(request());
    expect(outcome.kind).toBe("OK");
    expect(seen[0]).toMatchObject({ callSiteKey: "MAP:angles", role: "JUDGE", lane: "served", contractHash: mapPromptContractHash(),
      providerRef: "ref-a", subjectItemId: "wi-1", bound: BOUND });
    expect(seen[0]).not.toHaveProperty("modelRole");
    expect(mapStageBound(BOUND, "MERGE", { merge: 32_768, choose: 16_384 }).tokenCeiling).toBe(32_768);
    expect(mapStageBound(BOUND, "CHOOSE", { merge: 32_768, choose: 16_384 }).tokenCeiling).toBe(16_384);
    expect(mapStageBound(BOUND, "LIST", { merge: 32_768, choose: 16_384 })).toBe(BOUND);
  });

  it("a money refusal is STOPPED and remembered; a lane stop is STOPPED; a busy member is BUSY; a format failure is FAILED", async () => {
    const money = createRunnerMapCaller(deps(throwing(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x"))));
    expect(await money.call(request())).toEqual({ kind: "STOPPED", code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
    expect(money.spendStop()).toBe("MONEY");
    expect(money.stopped()).toBe(true);
    expect(await createRunnerMapCaller(deps(throwing(new TypedDomainError("CALL_LANE_HELD_BACK", "x")))).call(request()))
      .toEqual({ kind: "STOPPED", code: "CALL_LANE_HELD_BACK" });
    const busy = new Error("busy");
    expect(await createRunnerMapCaller(deps(throwing(busy), { satOutBy: (error) => error === busy })).call(request()))
      .toEqual({ kind: "BUSY", code: "MAKER_SAT_OUT" });
    expect(await createRunnerMapCaller(deps(answering("not json"))).call(request())).toMatchObject({ kind: "FAILED" });
    expect(await createRunnerMapCaller(deps(answering(ANGLES), { sitsOut: () => true })).call(request()))
      .toEqual({ kind: "BUSY", code: "MAKER_SAT_OUT" });
  });

  it("a lost claim is rethrown (the orchestrator then rethrows it: the run is abandoned)", async () => {
    const lost = new TypedDomainError("RUNNER_CLAIM_LOST", "x");
    await expect(createRunnerMapCaller(deps(throwing(lost))).call(request())).rejects.toBe(lost);
  });

  it("serial mode sends one call at a time, in the order asked", async () => {
    let inFlight = 0;
    let most = 0;
    const order: string[] = [];
    const slow: ProviderGateway = { call: async (call: ProviderCallRequest) => {
      inFlight += 1; most = Math.max(most, inFlight); order.push(call.callSiteKey);
      await new Promise((resolve) => setTimeout(resolve, 5)); inFlight -= 1; return { content: ANGLES } as never; } } as ProviderGateway;
    const caller = createRunnerMapCaller(deps(slow, { serial: true }));
    await Promise.all(["MAP:angles", "MAP:list:0", "MAP:list:1"].map((key) => caller.call(request(key))));
    expect(most).toBe(1);
    expect(order).toEqual(["MAP:angles", "MAP:list:0", "MAP:list:1"]);
  });

  it("map seats: the first A seats of the distinct-maker order", () => {
    const seat = (providerRef: string, maker: string) => ({ main: { providerRef, maker } });
    expect(mapStageSeats([seat("g1", "glm"), seat("g2", "glm"), seat("d", "ds"), seat("q", "qw")], 3))
      .toEqual([{ aiRef: "g1", maker: "glm" }, { aiRef: "d", maker: "ds" }, { aiRef: "q", maker: "qw" }]);
  });

  // Pre-flight PF-B47: saving the answer refuses a record with an empty node list
  // (CONDITION_MARK_AFFECTED_NODES_REQUIRED), so every map record names the served root, as runBodyStopDisclosure does.
  it("each map mark becomes an answer-scope record on the served root, with no detail text", () => {
    const records = mapConditionRecords({ marks: [{ mark: "MAP_MERGE_FALLBACK", step: "MERGE", detail: "merge reply missing" },
      { mark: "CHOOSE_QUOTA_FILLED", step: "CHOOSE", detail: "pt07" }] } as never, "run-1", "node-0");
    expect(records).toEqual([
      { mark: "MAP_MERGE_FALLBACK", scope: "answer", subjectRef: "run-1", reason: "MAP_MERGE_FALLBACK:MERGE", liftPath: null, servedRootRule: null, affectedNodeIds: ["node-0"] },
      { mark: "CHOOSE_QUOTA_FILLED", scope: "answer", subjectRef: "run-1", reason: "CHOOSE_QUOTA_FILLED:CHOOSE", liftPath: null, servedRootRule: null, affectedNodeIds: ["node-0"] }]);
  });

  // Amendment 2026-10-13 (P2L amendment 4, CR-3): every MARK the map returns becomes a record, never a fixed list of
  // them; the map's NOTES (operator facts such as LIST_REASSIGNED, and P2L's LANGUAGE_PLANNER_DISAGREES) never do.
  it("converts every mark the result holds, and never a note", () => {
    const records = mapConditionRecords({
      marks: ["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK", "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED"]
        .map((mark) => ({ mark, step: "MAP", detail: "x" })),
      notes: [{ note: "LIST_REASSIGNED", step: "LIST", detail: "2" }]
    } as never, "run-1", "node-0");
    expect(records.map((record) => record.mark)).toEqual(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
      "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED"]);
    expect(records.every((record) => record.affectedNodeIds.length === 1 && record.affectedNodeIds[0] === "node-0")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm exec vitest run tests/unit/map-stage.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// apps/runner/src/map-stage.ts
import { exhaustive } from "@debateai/kernel";
import {
  mapErrorCodeOf, mapProviderPieces, mapRunAngleMap, mapRunBlindLists, mapRunSnowball,
  type MapCallOutcome, type MapCallRequest, type MapCaller, type MapResult, type MapRunInput, type MapSeat, type MapStep
} from "@debateai/map";
import type { CallBound, ProviderGateway } from "@debateai/providers";
import type { DebateShapeOpening } from "@debateai/register";
import type { ConditionMarkRecord } from "@debateai/serve";
import type { EnvelopeStopKind } from "./index.js";
import { shapeSeatOrder } from "./shape-seats.js";

/**
 * Debate shape (spec 2026-10-12 §3.3 step 1, §3.5) — THE MAP IN THE RUNNER. Each map call goes through the member's
 * own gateway stack (lane, sit-out book, keep-alive, counting gateway), so it waits for a slot, writes its MODEL_CALL
 * and spend rows under its MAP: key, and its repairs (patch, full re-ask) are attempts inside that key's allowance.
 * It never goes through the cooldown hold (no progress records for MAP: keys). A stop (money, attempts, lane) is
 * STOPPED: the orchestrator asks nothing more and finishes with its code fallbacks; a keep-alive refusal is rethrown.
 */
export type MapStageMember = Readonly<{ provider: ProviderGateway; providerRef: string }>;
export type MapStageDeps = Readonly<{
  runId: string; subjectItemId: string; mapContractHash: string; judgeBound: CallBound;
  longBounds: Readonly<{ merge: number; choose: number }>;
  memberOf: (aiRef: string) => MapStageMember | null;
  sitsOut: (aiRef: string) => boolean;
  satOutBy: (error: unknown) => boolean;
  spendStopOf: (error: unknown) => EnvelopeStopKind | null;
  laneStopped: (error: unknown) => boolean;
  abandon: (error: unknown) => boolean;
  serial: boolean;
}>;
export type RunnerMapCaller = MapCaller & Readonly<{ spendStop: () => EnvelopeStopKind | null; stopped: () => boolean }>;

/** Ruling R-2: merge and choose are long structured lists with thinking inside the room — the sealed map bounds; the rest the judge bound. */
export function mapStageBound(bound: CallBound, step: MapStep, longBounds: Readonly<{ merge: number; choose: number }>): CallBound {
  const ceiling = step === "MERGE" ? longBounds.merge : step === "CHOOSE" ? longBounds.choose : null;
  return ceiling === null || ceiling <= bound.tokenCeiling ? bound : Object.freeze({ ...bound, tokenCeiling: ceiling });
}

const MAKER_SAT_OUT = "MAKER_SAT_OUT";

export function createRunnerMapCaller(deps: MapStageDeps): RunnerMapCaller {
  let spendStop: EnvelopeStopKind | null = null;
  let stopped = false;
  let tail: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(send: () => Promise<T>): Promise<T> => {
    if (!deps.serial) return send();
    const turn = tail.then(send, send);
    tail = turn.then(() => undefined, () => undefined);
    return turn;
  };
  const call = async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
    const member = deps.memberOf(request.seat.aiRef);
    if (member === null || deps.sitsOut(request.seat.aiRef)) return { kind: "BUSY", code: MAKER_SAT_OUT };
    try {
      const pieces = mapProviderPieces(request.spec);
      const response = await inTurn(() => member.provider.call({
        runId: deps.runId, subjectItemId: deps.subjectItemId, callSiteKey: request.callSiteKey, role: "JUDGE", lane: "served",
        bound: mapStageBound(deps.judgeBound, request.step, deps.longBounds), contractHash: deps.mapContractHash,
        providerRef: member.providerRef, packet: pieces.framed.packet,
        classifyContent: pieces.classifyContent, buildRepairPacket: pieces.buildRepairPacket
      }));
      return { kind: "OK", value: pieces.readAccepted(response.content) };
    } catch (error) {
      if (deps.abandon(error)) throw error;
      if (deps.laneStopped(error)) { stopped = true; return { kind: "STOPPED", code: mapErrorCodeOf(error) }; }
      const stop = deps.spendStopOf(error);
      if (stop !== null) { spendStop ??= stop; stopped = true; return { kind: "STOPPED", code: mapErrorCodeOf(error) }; }
      if (deps.satOutBy(error)) return { kind: "BUSY", code: MAKER_SAT_OUT };
      return { kind: "FAILED", code: mapErrorCodeOf(error) };
    }
  };
  return Object.freeze({ call, spendStop: () => spendStop, stopped: () => stopped });
}

/** The map AIs: the first `mapAIs` seats of the distinct-maker order (the opener-rotation seat plans). */
export function mapStageSeats(seats: readonly Readonly<{ main: Readonly<{ providerRef: string; maker: string }> }>[], mapAIs: number): readonly MapSeat[] {
  return Object.freeze(shapeSeatOrder(seats).slice(0, mapAIs).map((seat) => Object.freeze({ aiRef: seat.main.providerRef, maker: seat.main.maker })));
}

/** The opening the receipt names (ANGLE_MAP by ruling S1; the two comparison arms stay runnable). */
export function runMapStage(input: Readonly<{ opening: DebateShapeOpening; map: MapRunInput }>): Promise<MapResult> {
  switch (input.opening) {
    case "ANGLE_MAP": return mapRunAngleMap(input.map);
    case "BLIND_LISTS": return mapRunBlindLists(input.map);
    case "SNOWBALL": return mapRunSnowball(input.map);
    // Pre-flight PF-B38: `audit:source` requires `exhaustive(` in any file with a `switch (`.
    default: return exhaustive(input.opening);
  }
}

/**
 * Spec §3.3: every map mark rides the answer with its typed record — the step as a code, never the detail text. It maps
 * every mark the result holds, never a fixed list (P2L adds no mark, but any later map mark needs no edit here). The
 * map's notes are operator facts, stored with the map choice; they never become condition records. Pre-flight PF-B47:
 * each record names the served root (`servedRootNodeId`), the node the answer rests on, as `runBodyStopDisclosure` does;
 * saving the answer refuses a record with an empty node list.
 */
export function mapConditionRecords(result: MapResult, runId: string, servedRootNodeId: string): readonly ConditionMarkRecord[] {
  return Object.freeze(result.marks.map((record): ConditionMarkRecord => Object.freeze({
    mark: record.mark, scope: "answer" as const, subjectRef: runId, reason: `${record.mark}:${record.step}`,
    liftPath: null, servedRootRule: null, affectedNodeIds: Object.freeze([servedRootNodeId])
  } satisfies ConditionMarkRecord)));
}
```

(Pre-flight PF-B38: `exhaustive` from `@debateai/kernel` is the only default; this file declares no closing helper of its
own and mints no domain code for an unknown opening. `TypedDomainError` is no longer imported here: nothing in the file
throws one. Pre-flight PF-B40: the doc comment above names the map's notes in words, never by the property path, because
P2L Task 15 greps the runner for that path.)

`apps/runner/src/index.ts` — constructor: `readonly #mapChoices: Pick<MapChoiceRepository, "writeMapRun" | "writeMapPosition" | "readMapResultForRun">;`
and `this.#mapChoices = settings.mapChoices?.store ?? new MapChoiceRepository(pool);`.

`execute`, right after `envelopeBasis` is parsed (replace Task 11's `shapeShape` line):

```ts
    /**
     * Debate shape (spec 2026-10-12 §3): the sizes this run was admitted with (P2a: its receipt's `shape`), or null —
     * today's run, byte for byte. A shaped run needs the runner's shape settings (the sealed map hash) and a call
     * scheduler (its chains run through the lane; with no concurrency row the lane holds one call at a time).
     */
    const shapeShape = envelopeBasis.shape ?? null;
    if (shapeShape !== null && (this.settings.debateShape == null || callScheduler === undefined)) {
      throw new TypedDomainError("DEBATE_SHAPE_RUNNER_UNCONFIGURED",
        "This run was admitted with the debate shape, and this runner has no sealed map contracts or no call scheduler");
    }
    const shapeSettings = shapeShape === null ? null : debateShapeSettingsOf(run.depthParams);
```

After `effectiveMakerCount` is known (~5498): `const shapeRun = shapeShape !== null && effectiveMakerCount >= 2 ? Object.freeze({ shape: shapeShape, settings: shapeSettings!, mapContractHash: this.settings.debateShape!.mapContractHash }) : null;`
(a run left with one maker at claim keeps today's single-position path, spec §3.3 step 1), and every Task 11 use of
`shapeShape` inside `runNodePanel` reads `shapeRun?.shape ?? null` instead.

The map, inserted right after `let runBodyBudgetStop: EnvelopeStopKind | null = null;` (~6374) and the
JUDGEMENT_SCHEDULED append, BEFORE the plan is built (the plan needs the map's answers):

```ts
    /**
     * Debate shape, Stage 1 (spec §1, §3.3 step 1, §3.5): the map, before root 0. A re-claimed run finds its stored map
     * and asks nothing again. A stop during the map (money, attempts, lane) ends it with the code's fallbacks; the
     * arguing then stops after root 0 and the answer is written (O6). A keep-alive refusal abandons the run, as today.
     */
    let debateShapeMap: MapResult | null = null;
    let shapeMapResult: MapResult | null = null;
    let mapSpendStop: EnvelopeStopKind | null = null;
    if (shapeRun !== null) {
      shapeMapResult = await this.#mapChoices.readMapResultForRun(run.runId);
      if (shapeMapResult === null) {
        /** PF-B40: map seats outside the claim-eligible list, wrapped once each. */
        const mapOnlyMembers = new Map<string, ConfiguredSeatMaker>();
        const mapCaller = createRunnerMapCaller({
          runId: run.runId, subjectItemId: claimed.workItemId, mapContractHash: shapeRun.mapContractHash,
          judgeBound: this.settings.judgeBound,
          longBounds: { merge: shapeRun.shape.mapMergeBound, choose: shapeRun.shape.mapChooseBound },
          // Pre-flight PF-B40: an assigned (scorecard) seat book is built from `configuredByProviderRef` and can name a
          // route outside the claim-eligible `configuredMakers`; such a map seat calls through the same wrappers
          // (`sitOutMaker`: the sit-out book, `throughCallLane`, the failure observer), never as BUSY for good.
          memberOf: (aiRef) => {
            const eligible = configuredMakers.find((maker) => maker.providerRef === aiRef);
            if (eligible !== undefined) return eligible;
            const configured = configuredByProviderRef.get(aiRef);
            if (configured === undefined) return null;
            const wrapped = mapOnlyMembers.get(aiRef) ?? sitOutMaker(configured);
            mapOnlyMembers.set(aiRef, wrapped);
            return wrapped;
          },
          sitsOut: (aiRef) => sitOut !== null && sitOut.sitsOut(aiRef),
          satOutBy: (error) => sitOut !== null && sitOut.haltsAtOnce(error),
          spendStopOf: expansionPhaseStop,
          laneStopped: (error) => callHeldBack(error) || (error instanceof TypedDomainError && error.code === CALL_LANE_STOPPED),
          abandon: keepAliveStop,
          serial: !callsRunTogether
        });
        // Spec §2.3 (O6), the map's own guard: once the map has stopped, no queued map call starts.
        callLane?.guardStarts(() => !mapCaller.stopped());
        try {
          shapeMapResult = await runMapStage({ opening: shapeRun.shape.opening, map: {
            questionLine: run.questionLine, languageName: run.argumentLanguageName, languageTag: run.argumentLanguageTag,
            seats: mapStageSeats(rootSeats, shapeRun.shape.mapAIs), caller: mapCaller, abandon: keepAliveStop, seed: run.runId,
            gapRoundsMax: shapeRun.shape.gapRounds, maxAnswers: shapeRun.shape.answers, pointsPerAnswer: shapeRun.shape.pointsPerAnswer
          } });
        } catch (error) {
          callLane?.stop();
          throw error;
        } finally {
          callLane?.guardStarts(null);
        }
        mapSpendStop = mapCaller.spendStop();
        // Pre-flight PF-B31: never fewer than two positions (buildShapePlan refuses fewer; the receipt's answers is ≥ 2).
        await this.#mapChoices.writeMapRun({ runId: run.runId, result: shapeMapResult,
          answerCount: Math.max(2, Math.min(shapeRun.shape.answers, shapeDistinctMakers(rootSeats, seatSitsOut))) });
      }
      if (shapeMapResult.kind === "MAP" && shapeMapResult.choice !== null) debateShapeMap = shapeMapResult;
    }
```

`rootSeats` must exist before this block: move the map block to just AFTER `const rootSeats: RunSeat[] = [...seatBook.position];`
(~6395) and, in a shaped run, reorder it there first:
`if (shapeRun !== null) rootSeats.splice(0, rootSeats.length, ...shapeSeatOrder(rootSeats));` (the opener stays first).
`shapeDistinctMakers` is a small helper in `shape-seats.ts` (pre-flight PF-B40: stated signature; `RunSeat` satisfies its
type parameter and `seatSitsOut` is its `sitsOut`):

```ts
/** The distinct makers among the seats that do not sit out: the most positions the shape can argue (spec §3.3 step 2). */
export function shapeDistinctMakers<T extends Readonly<{ main: Readonly<{ maker: string }> }>>(seats: readonly T[], sitsOut: (seat: T) => boolean): number {
  return new Set(seats.filter((seat) => !sitsOut(seat)).map((seat) => seat.main.maker)).size;
}
```

and its unit case in `tests/unit/shape-plan.test.ts` (add `shapeDistinctMakers` to that file's `shape-seats.js` import),
inside `describe("seats", …)`:

```ts
  it("counts the distinct makers among the seats that do not sit out", () => {
    expect(shapeDistinctMakers([seat("glm"), seat("glm"), seat("ds")], () => false)).toBe(2);
    expect(shapeDistinctMakers([seat("glm"), seat("ds"), seat("qw")], (entry) => entry.main.maker === "ds")).toBe(2);
    expect(shapeDistinctMakers([seat("glm"), seat("ds")], () => true)).toBe(0);
  });
```

Implementer note (pre-flight PF-B31): wherever the position count is computed (here and in Task 13), it is
`Math.max(2, Math.min(P, shapeDistinctMakers(rootSeats, seatSitsOut)))`, never the bare `Math.min`: one maker left after
a sit-out during the map would make `buildShapePlan` throw and the run end with no answer; with two positions the
hand-over or drop of the missing one, then `tooFewLeftToArgue`, ends the debate with root 0.

Right after `const noteSpendStop = …` is declared (~6497):

```ts
    // Spec §3.3 / O6: a stop during the map is a stop before everything in today's order.
    if (mapSpendStop !== null) { runBodyBudgetStop ??= mapSpendStop; noteSpendStop([]); }
```

Imports to add in `index.ts`: `MapChoiceRepository, type MapResult` from `@debateai/map`; `debateShapeSettingsOf` from
`@debateai/contract`; `createRunnerMapCaller, mapStageSeats, runMapStage, mapConditionRecords` from `./map-stage.js`;
`shapeSeatOrder, shapeDistinctMakers` from `./shape-seats.js`. (`ConfiguredSeatMaker` is already imported from
`./run-seats.js`.)

Pre-flight PF-B37: add `"DEBATE_SHAPE_RUNNER_UNCONFIGURED"`, `"MAP_ROW_INVALID"` and `"MAP_GAP_ITEM_UNKNOWN"` to all three
lists: the runner's `KNOWN_DOMAIN_CODES` (`apps/runner/src/index.ts`), the API's `KNOWN_DOMAIN_CODES`
(`apps/api/src/index.ts`) and `EXPECTED_DOMAIN_CODES` (`tests/unit/api-operational-error.test.ts`).

- [ ] **Step 4: Run — expect PASS**

Run each file alone (pre-flight PF-B4: one file at a time; the root typecheck replaces the scoped one, which has no
tsconfig), then regenerate the shipped-corpus manifest for the new `apps/runner/src/map-stage.ts` (pre-flight PF-B24) and
check it without the variable, then the typecheck alone:

```bash
pnpm exec vitest run tests/unit/map-stage.test.ts
pnpm exec vitest run tests/unit/shape-plan.test.ts
pnpm exec vitest run tests/unit/dev-runner-reconciliation.test.ts
pnpm exec vitest run tests/unit/api-operational-error.test.ts
pnpm exec vitest run tests/architecture/v28-serve-decision-wiring.test.ts
SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
pnpm run typecheck
```

Expected: PASS (the map in a real run is proved in Task 15).

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/map-stage.ts apps/runner/src/shape-seats.ts apps/runner/src/index.ts apps/api/src/index.ts tests/unit/map-stage.test.ts tests/unit/shape-plan.test.ts tests/unit/api-operational-error.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "runner: the map stage before root 0 — MapCaller over the member gateways, stops, storage, re-claim reuse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Arguing the shape: assigned roots, round-1 points, sparse cross-replies, breadth-first rounds

**Files:**
- Modify: `apps/runner/src/index.ts` (execute: the plan, roots, `legChain`, review batches, `closeGlobalRound`, map
  positions; and the removal of the Phase 2a per-run refusal, below)
- Modify (or delete): `tests/unit/debate-shape-runner-boot.test.ts` (the per-run refusal's describe block goes; pre-flight PF-B24a)
- Create (Task 15's files, written now as Step 1 says): `tests/support/debate-shape-harness.ts`, `tests/support/scripted-answers.ts`,
  `tests/support/saved-debate.ts`, `tests/integration/debate-shape-run.test.ts`

**Removal of the Phase 2a per-run refusal (controller ruling on pre-flight PF-B24a).** Task 6 kept it, so that no
commit between Task 6 and this one argues a shaped receipt as today's shape. This task is where `shapeRun` takes over,
so it deletes, in this commit:
- in `apps/runner/src/index.ts`: the exported function `refuseDebateShapeReceiptInPhase2a` with its doc comment
  ("I2(b), Phase 2a (P2a final review): …", at 2d4f35e64 ~:243–256), and its one call in the claim path right after
  `envelopeBasis = parseCostEnvelopeBasis(run.envelopeBasis);` (with the comment "I2(b), Phase 2a: a debate-shape receipt
  is never argued as today's shape. P2b replaces this line."). Task 12's shape gate (`DEBATE_SHAPE_RUNNER_UNCONFIGURED`)
  sits there already and stays;
- in `tests/unit/debate-shape-runner-boot.test.ts`: the describe block "I2(b), Phase 2a: the runner refuses a claimed
  run's debate-shape receipt, whatever its own register says" (its two cases and the imports only it uses) — delete the
  block, or the file if it is the only content left. Do not put the name back into any test's "gone" list: the grep in
  Step 5 is the check (if a test still names it only to say it is absent, take the name off that list).

Implementer note (pre-flight PF-B46): imports to add in `index.ts`: `resolveLeverage` from `@debateai/propagation`
(`PropagationOutcome` is already imported there); `buildShapePlan, buildScrutinyLegs, shapePositionsFromMap,
shapePositionsForTodaysOpening, type ShapeLeg, type ShapePlan, type ShapePositionPlan` from `./shape-plan.js`;
`shapeHandOverRoot, shapeWriterSeat` from `./shape-seats.js` (Task 12 already imports `shapeSeatOrder,
shapeDistinctMakers` from it); `shapeSelectChains` from `./shape-select.js` (Task 14 adds `shapeRankScrutiny`). Line
numbers below drift; find each site by name. At 2d4f35e64 the sites are: the plan block ~:6557, `openFirstPosition`
~:6675, `dropSatOutRoot` ~:7075, the review batch ends ~:7291–7300, `rootZeroChain` ~:7437, `rootChain` ~:7467, the
serial root loop ~:7514, `closeGlobalRound` ~:7540, `crossExchangeSeatFor` ~:7626, `legChain` ~:7713, the chain loop
over roots in `argueTogether` ~:7845, `authoredMakerPositions` ~:8048, `decideMakerPositionServe`'s input ~:8105.

**Interfaces (execute-local; no export changes):**

```ts
const shapePositions: readonly ShapePositionPlan[] | null;
const shapePlan: ShapePlan | null;
const rootCount: number;                         // shapePlan?.rootCount ?? effectiveMakerCount
const chainsRun: boolean;                        // callsRunTogether || shapePlan !== null
const deselectedIndices: Set<number>;            // adaptive: legs of chains not kept at the round-1 boundary
const shapeLegAt: (position: number) => ShapeLeg | null;
const answeredMakers: (string | undefined)[];    // per plan position: the maker that really wrote it (PF-B45)
```

- [ ] **Step 1: Write the failing test**

The behaviour is a whole debate; its failing test is Task 15's `tests/integration/debate-shape-run.test.ts` first case
("a shaped debate at depth 2 argues P assigned positions, K points each, one cross-reply each, adaptive exchanges, and
serves an answer"). Write Task 15 Step 1's support files (`tests/support/scripted-answers.ts`, `tests/support/saved-debate.ts`,
`tests/support/debate-shape-harness.ts` with `runShapeDebate`, and the two harness options in
`tests/support/preview-debate-harness.ts` / `tests/support/preview-gate-stubs.ts`) and that first case NOW, run it, and
see it fail: until this task deletes the Phase 2a per-run refusal, the shaped run is refused `RUN_ENVELOPE_BASIS_INVALID`
("This runner cannot run a debate-shape receipt yet (Phase 2a)…") and `completedRun` throws with that error.

Run (alone): `pnpm exec vitest run tests/integration/debate-shape-run.test.ts -t "argues P assigned positions"`
Expected: FAIL (the run is refused by the Phase 2a refusal; no answer).

- [ ] **Step 2: Implement the plan and the roots**

First delete the Phase 2a per-run refusal and its test block, as "Removal of the Phase 2a per-run refusal" above says.

Replace the plan block (at 2d4f35e64 ~6557–6561, from `const expansionPlan = effectiveMakerCount > 1` through
`const totalPlannedNodes = …`). The answer count is at least 2 (pre-flight PF-B31): `buildShapePlan` refuses fewer than
two positions, and a sit-out during the map can leave one distinct maker; `max(2, …)` stays at or below the receipt's
`answers` (the schema requires ≥ 2), and the hand-over or the drop, then `tooFewLeftToArgue`, end the arguing with root 0:

```ts
    const shapeAnswerCount = shapeRun === null ? 0
      : Math.max(2, Math.min(shapeRun.shape.answers, shapeDistinctMakers(rootSeats, seatSitsOut)));
    const shapePositions = shapeRun === null ? null
      : debateShapeMap !== null
        ? shapePositionsFromMap({ choice: debateShapeMap.choice!, keyPoints: debateShapeMap.keyPoints,
          answers: shapeAnswerCount, pointsPerAnswer: shapeRun.shape.pointsPerAnswer })
        : shapePositionsForTodaysOpening({ answers: shapeAnswerCount, pointsPerAnswer: shapeRun.shape.pointsPerAnswer });
    const shapePlan = shapePositions === null ? null : buildShapePlan({ positions: shapePositions, depth: expansionDepth,
      scrutiny: { roundsPerPoint: shapeRun!.shape.scrutinyRoundsPerPoint, pointsPerDebate: shapeRun!.shape.scrutinyPointsPerDebate } });
    const rootCount = shapePlan?.rootCount ?? effectiveMakerCount;
    const expansionPlan: readonly MultiMakerExpansionLeg[] = shapePlan !== null ? shapePlan.legs
      : effectiveMakerCount > 1 ? buildMultiMakerExpansionPlan(expansionDepth, effectiveMakerCount) : [];
    const crossExchangePlan = shapePlan !== null ? [] : buildCrossRootExchangePlan(effectiveMakerCount);
    const totalPlannedNodes = shapePlan?.totalPlannedNodes ?? effectiveMakerCount + expansionPlan.length + crossExchangePlan.length;
    const shapeLegAt = (position: number): ShapeLeg | null => shapePlan === null ? null
      : (shapePlan.legs[position - shapePlan.rootCount] ?? scrutinyLegs.get(position) ?? null);
    const scrutinyLegs = new Map<number, ShapeLeg>();
    const deselectedIndices = new Set<number>();
    const chainsRun = callsRunTogether || shapePlan !== null;
```

`rootCount` replaces `effectiveMakerCount` as THE NUMBER OF ROOTS at exactly these sites (keep every other use, which
counts makers): the review batch ends (`reviewBatchEnds`, below), the serial root loop
(`for (let rootIndex = 0; rootIndex < effectiveMakerCount; …)` under `if (!callsRunTogether)`), `selectAuthoritativeRootScope`'s
`effectiveMakerCount` input and the `Array.from({ length: effectiveMakerCount }, …)` root map in `closeGlobalRound`, the
boundary end (`const boundaryEnd = effectiveMakerCount + boundaryLegIndex + 1;`), the chain loop over roots in
`argueTogether` (`for (let rootIndex = 1; rootIndex < effectiveMakerCount; …)`), the digest's `authoredMakerPositions`
(`Array.from({ length: effectiveMakerCount }, …)`) and `decideMakerPositionServe`'s `effectiveMakerCount` input (it
counts the servable roots; a shaped run always has P ≥ 2, so the footing is never MONO_MAKER). The cross-exchange
position formulas (`effectiveMakerCount + expansionPlan.length + exchangeIndex`, three sites) are unchanged (the shape's
`crossExchangePlan` is empty).

The review batch ends gain the scrutiny rounds (pre-flight PF-B44, high: the ends must never decrease, or the last
planned round's positions land in a scrutiny batch that waits on the scrutiny chooser, which waits on them — a
deadlock). Today's single line `ends.push(effectiveMakerCount + expansionPlan.length, totalPlannedNodes);` is SPLIT, and
the scrutiny ends go between its two values. The whole block becomes:

```ts
    const reviewBatchEnds: readonly number[] = (() => {
      const ends = [rootCount];
      let round = expansionPlan[0]?.round ?? null;
      expansionPlan.forEach((leg, legIndex) => {
        if (round !== null && leg.round !== round) {
          ends.push(rootCount + legIndex);
          round = leg.round;
        }
        if (globalRoundCompletions.has(legIndex)) ends.push(rootCount + legIndex + 1);
      });
      // 1. the end of the planned legs (today's first value of the split line);
      ends.push(rootCount + expansionPlan.length);
      // 2. Debate shape, spec §3.3 step 7: one batch per scrutiny round (each 2·Q reserved slots), in slot order;
      if (shapePlan !== null) {
        for (let round = 1; round <= shapePlan.scrutiny.roundsPerNode; round += 1) {
          ends.push(shapePlan.scrutiny.start + round * 2 * shapePlan.scrutiny.nodesPerDebate);
        }
      }
      // 3. the end of the plan (today's second value).
      ends.push(totalPlannedNodes);
      // Never decreasing, so the distinct ends are in order (an empty batch has no positions to place).
      return Object.freeze([...new Set(ends)]);
    })();
```

(`shapePlan.scrutiny.start` is `rootCount + expansionPlan.length` and the last scrutiny end is `totalPlannedNodes`, so the
list never decreases; with no row `shapePlan` is null and the list is today's, value for value.)

Root legs. `openFirstPosition` takes the leg: `const openFirstPosition = async (primarySeat: RunSeat, leg: JudgeLeg = { kind: "primary-root" }) => …`
and passes `leg` to `member.judge.judge({ … leg, … })`. Add:

```ts
    /** Spec §3.3 step 2: root i argues answer i (assigned-root); without a map, today's legs. */
    const rootLegOf = (rootIndex: number): JudgeLeg => {
      const position = shapePositions?.[rootIndex];
      if (position === undefined || position.statement === null || position.mapPoints === null) {
        return rootIndex === 0 ? { kind: "primary-root" } : { kind: "independent-root" };
      }
      return { kind: "assigned-root", assignedAnswer: position.statement, mapPoints: position.mapPoints };
    };
```

`openFirstPosition(rootSeats[0]!, rootLegOf(0))` at both call sites (the swap loop too), and in `rootChain`
`leg: rootLegOf(rootIndex)`. Root 0 keeps today's rule (it must exist; MAKER_POSITION_UNAVAILABLE otherwise).

Hand-over (spec §3.3 step 2). Replace `dropSatOutRoot` (pre-flight PF-B41, high: a hand-over happens only BEFORE the
root's first call; `rootChain` also calls this helper in its post-call HALTED branch, and there a hand-over would
return false and the chain would throw `MAKER_POSITION_UNAVAILABLE`, ending the whole debate):

```ts
    /**
     * Fix (d): root `rootIndex` is dropped (`satOutDuringRun`) when its member sits out; false otherwise. Debate shape
     * (spec §3.3 step 2, INTERFACE §7): before the root's first call (`beforeCall`), a shaped run hands the root over
     * to a working seat instead (SWAP with a seat no root uses, or SHARE one), and it is not dropped. After a call was
     * made under the old seat it is never handed over: the root is dropped as today.
     */
    const dropSatOutRoot = (rootIndex: number, beforeCall: boolean): boolean => {
      if (!rootSitsOut(rootIndex)) return false;
      if (shapePlan !== null && beforeCall) {
        const handOver = shapeHandOverRoot({ makers: rootSeats.map((seat) => seat.main.maker), rootCount, rootIndex, sitsOut: rootSitsOut });
        if (handOver.kind === "SWAP") { [rootSeats[rootIndex], rootSeats[handOver.withIndex]] = [rootSeats[handOver.withIndex]!, rootSeats[rootIndex]!]; return false; }
        if (handOver.kind === "SHARE") { rootSeats[rootIndex] = rootSeats[handOver.withIndex]!; return false; }
      }
      satOutDuringRun.add(rootIndex);
      return true;
    };
```

Its two call sites in `rootChain`: the pre-call one (right after `if (arguingStopped()) return;`) becomes
`if (dropSatOutRoot(rootIndex, true)) return;`; the one in the `authoredRoot.kind === "HALTED"` branch becomes
`if (dropSatOutRoot(rootIndex, false)) return;` (today's drop, then today's `MAKER_POSITION_UNAVAILABLE` throw when the
member does not sit out). With no row `shapePlan` is null and both behave as today.

(`rootSitsOut` reads `rootSeats`, so after a swap the root's seat is a working one; with `SHARE` two roots share a seat
and its maker argues two answers. `rootChain` builds its `input.seat` from `rootSeats[rootIndex]` AFTER the pre-call
check, so the call goes to the handed-over seat.)

Who answered which root (pre-flight PF-B42). A shaped root's seat index is no longer its root index (`shapeSeatOrder`,
SWAP and SHARE), so `positionAnswerers` is keyed by ROOT INDEX in a shaped run:
- in `authorAndPanel`, the line `if (input.seat.role === "POSITION") positionAnswerers.set(input.seat.seatIndex, selectedMaker);`
  becomes `if (input.seat.role === "POSITION") positionAnswerers.set(shapePlan === null ? input.seat.seatIndex : input.authorIndex, selectedMaker);`
  (a root's `authorIndex` is its root index; with no row the key is today's);
- the resume restore (`seatBook.position.forEach((seat, rootIndex) => { … positionAnswerers.set(rootIndex, restored); })`
  inside `if (seatBook.assigned)`) is keyed by seat index. Hoist its map out of that block — declare
  `const answeredSlotBySite = new Map<string, SeatSlot>();` right before `if (seatBook.assigned) {` (next to
  `recordedSlotBySite`) and delete the inner declaration (it stays empty without an assigned seat book, so nothing is
  restored, as today) — and, in a shaped run, redo the restore in `rootSeats` order right after Task 12's
  `rootSeats.splice(0, rootSeats.length, ...shapeSeatOrder(rootSeats));`:

```ts
    if (shapeRun !== null) {
      // Pre-flight PF-B42: a shaped run's root i is rootSeats[i] (shapeSeatOrder), not position seat i.
      positionAnswerers.clear();
      rootSeats.forEach((seat, rootIndex) => {
        const siteKey = rootIndex === 0 ? "JUDGE" : rootIndex === 1 ? "JUDGE:root:secondary" : `JUDGE:root:${String(rootIndex)}`;
        const slot = answeredSlotBySite.get(siteKey);
        const restored = [seat.main, seat.runnerUp].find((member): member is SeatMember => member !== null
          && member.pinnedAs === slot && spentSeatSlots.get(siteKey) !== slot);
        if (restored !== undefined) positionAnswerers.set(rootIndex, restored);
      });
    }
```

The maker that really wrote each position (pre-flight PF-B45: the writer rule must read the maker that ANSWERED — the
runner-up, or a cheaper maker a refused call moved to — never the planned one). Declare, next to `authoredNodes`,
`const answeredMakers: (string | undefined)[] = [];`. Root 0: right after
`const rootAuthor = actualAuthor(FIRST_POSITION_CALL_SITE_KEY, primaryMaker);` add `answeredMakers[0] = rootAuthor.maker;`.
Every other node: `authorAndPanel`'s callback becomes `authoredStatement?: (statement: string, maker: string) => void`,
and its call becomes `authoredStatement?.(childJudged.statement, author.maker);` (`author` is the
`actualAuthor(input.callSiteKey, selectedMaker)` just above it). The callers that pass it in `rootChain`, `argueLeg`
and `argueShapeCross` (below) record the maker BEFORE telling the statement, so a child that awaits the statement
always finds its parent's maker:
`(statement, maker) => { answeredMakers[position] = maker; statements[position]!.resolve(statement); }` (in `rootChain`
`position` is `rootIndex`). Callers that pass a one-argument function still typecheck and are left as they are.

P2a's ceiling binds three things here (ruling B1; final review note 6, amendment 2026-10-13): at most ONE cross-reply per
position, also in `MAP_UNAVAILABLE_TODAYS_OPENING` (the plan builds exactly one `CROSS` leg per position, and nothing
else may add one); a hand-over happens BEFORE the position's first call, never after a call was made under the old
seat; and every repair (patch, full re-ask) stays inside its own site's attempt allowance. Task 15's measured case checks
the run against `debateShapeSiteCounts`.

Map positions: in `rootZeroChain` and `rootChain`, inside the `nodeRecorder.commit(...)` closure right after
`saveAuthored(...)` returns the node, when `shapePositions?.[i]?.answerId` is a string:
`await this.#mapChoices.writeMapPosition({ runId: run.runId, answerId, rootIndex: i, rootNodeId: saved.nodeId, maker: saved.maker });`.

`chainsRun` replaces `callsRunTogether` at the four arguing switches only: the two `if (saved === null || !callsRunTogether) return;`
lines (rootZeroChain, rootChain), `if (!callsRunTogether) { …serial root loop… }` and
`if (callsRunTogether) { …argueTogether… } else { …serial legs… }`. A shaped run therefore always argues through the
chains; with no concurrency row its lane holds one call at a time (one debate call after another, as today's serial
engine, but recorded through the same ordered recorders). `askTogether` and the guard comment keep `callsRunTogether`.

- [ ] **Step 3: Implement the legs**

Refactor `legChain(legIndex, stage)` into `legChain(legIndex, stage)` → `argueLeg(leg, decision, stage)`, where the
body after `const leg = expansionPlan[legIndex]!; const decision = decisionBefore(legIndex);` moves unchanged into
`argueLeg` and `legChain` becomes `(legIndex, stage) => argueLeg(expansionPlan[legIndex]!, decisionBefore(legIndex), stage)`.
Inside `argueLeg`, after the existing early returns, add the shape's own rules (row absent: `shapeLegAt` is null and every
line below is skipped):

```ts
        const shapeLeg = shapeLegAt(leg.childIndex);
        if (deselectedIndices.has(leg.childIndex)) return;
        if (shapeLeg?.kind === "CROSS") return argueShapeCross(shapeLeg, stage);
        const writerIndex = shapeLeg === null ? null : shapeWriterSeat({
          seatMakers: seatBook.supportAttack.map((seat) => seat.main.maker),
          // A point answers its position; a reply answers the node it attacks; a defence prefers the point's own maker.
          // Pre-flight PF-B45: the makers that ANSWERED (`answeredMakers`), never the planned ones.
          avoidMakers: [answeredMakers[leg.parentIndex] ?? ""],
          preferMaker: shapeLeg.kind === "DEFENCE" && shapeLeg.chain !== null ? answeredMakers[shapeLeg.chain] ?? null : null,
          offset: leg.rootIndex + leg.round + shapeLeg.siblingOrdinal,
          sitsOut: (index) => seatSitsOut(seatBook.supportAttack[index]!)
        });
        if (shapeLeg !== null && writerIndex === null) return;
        const seat = shapeLeg === null
          ? seatBook.supportAttack[(leg.rootIndex + leg.round) % seatBook.supportAttack.length]!
          : seatBook.supportAttack[writerIndex!]!;
```

(The parent's statement was awaited above, and the parent's maker is recorded before its statement is told, so
`answeredMakers[leg.parentIndex]` is set for every parent that has a statement.) The `authorAndPanel` call in `argueLeg`
passes `(statement, maker) => { answeredMakers[position] = maker; statements[position]!.resolve(statement); }`.

and in the `call` object use:

```ts
          authorIndex: shapeLeg === null ? leg.authorIndex : seat.seatIndex,
          seat,
          leg: shapeLeg?.consideration != null
            ? { kind: leg.polarity === "support" ? "support" as const : "attack" as const, positionUnderDebate: parentStatement, consideration: shapeLeg.consideration }
            : { kind: leg.polarity === "support" ? "support" as const : "attack" as const, positionUnderDebate: parentStatement },
          callSiteKey: shapeLeg?.callSiteKey ?? `JUDGE:${role}:root${leg.rootIndex}:r${leg.round}:p${leg.parentIndex}`,
          siblingOrdinal: shapeLeg?.siblingOrdinal ?? (leg.polarity === "support" ? 1 : 2),
```

(`answeredMakers` is declared in Step 2, pre-flight PF-B45; there is no separate list of planned makers.) The cross-reply
for the shape:

```ts
      /** Spec §3.3 step 4: ONE cross-reply per position, to its strongest rival, by the member that wrote the position. */
      const argueShapeCross = async (shapeLeg: ShapeLeg, stage: { rank: ChainRank }): Promise<void> => {
        const position = shapeLeg.childIndex;
        const target = shapeLeg.targetRootIndex!;
        const [ownPosition, otherMakersPosition] = await Promise.all([statements[shapeLeg.rootIndex]!.promise, statements[target]!.promise]);
        if (ownPosition === null || otherMakersPosition === null || arguingStopped()) return;
        // Pre-flight PF-B42: keyed by root index in a shaped run (Step 2).
        const writer = positionAnswerers.get(shapeLeg.rootIndex);
        if (writer === undefined) return;
        // Pre-flight PF-B43, as `crossExchangeSeatFor`: a site an earlier pass already recorded keeps its slot (the
        // attempt ceiling is exact only under that precondition, packages/register/src/index.ts).
        const recorded = recordedSlotBySite.get(shapeLeg.callSiteKey);
        const call = {
          authorIndex: shapeLeg.rootIndex,
          seat: Object.freeze({ role: "CROSS_EXCHANGE" as const, seatIndex: shapeLeg.rootIndex, pinnedSeatIndex: rootSeats[shapeLeg.rootIndex]!.pinnedSeatIndex,
            main: recorded === undefined || recorded === writer.pinnedAs ? writer : Object.freeze({ ...writer, pinnedAs: recorded }),
            runnerUp: null, diversityShare: 0, pinned: null }),
          leg: { kind: "cross-root" as const, ownPosition, otherMakersPosition },
          callSiteKey: shapeLeg.callSiteKey,
          role: "cross-root response",
          childKind: "support" as const,
          siblingOrdinal: shapeLeg.siblingOrdinal,
          plannedLegCount: 1,
          explorationDecision: "challenge" as const
        };
        let authored: Awaited<ReturnType<typeof authorAndPanel>>;
        try {
          authored = await authorAndPanel({ ...call, parentNodeId: laterParentAt(shapeLeg.rootIndex), edges: [] },
            (statement, maker) => { answeredMakers[position] = maker; statements[position]!.resolve(statement); });
        } catch (error) {
          const stop = expansionPhaseStop(error);
          if (stop === null) throw error;
          runBodyBudgetStop = stop;
          noteSpendStop(stage.rank);
          return;
        }
        if (authored.kind === "HALTED") {
          const halted = authored.record;
          await nodeRecorder.commit(position, async () => { if (!bodyFailed) haltedExpansionRecords.push(halted); });
          return;
        }
        const authoredValue = authored.value;
        const saved = await nodeRecorder.commit(position, async () => {
          const authorRoot = authoredNodes.get(shapeLeg.rootIndex);
          const targetRoot = authoredNodes.get(target);
          if (bodyFailed || authorRoot === undefined || targetRoot === undefined) return null;
          return saveAuthored(position, { ...call, parentNodeId: authorRoot.nodeId, edges: [
            { targetNodeId: authorRoot.nodeId, targetStatement: authorRoot.statement, polarity: "support" },
            { targetNodeId: targetRoot.nodeId, targetStatement: targetRoot.statement, polarity: "attack" }] }, authoredValue);
        });
        savedNodes[position]!.resolve(saved);
        if (saved === null) return;
        stage.rank = reviewRank(position);
        await reviewInChain(reviewSlot(position), saved);
      };
```

(The shape's cross-reply sits in round 1, before the round-1 boundary, so it does NOT await `everyBoundaryDecided` as
today's cross-exchanges do; it is a child of its own root, so `subtreeIndices` and the recorders treat it as any leg.)

- [ ] **Step 4: Implement the adaptive choice at the round-1 boundary**

In `closeGlobalRound`, keep a copy of the propagation for scrutiny and choose the chains:

```ts
      lastBoundary = { propagation: boundary.propagation, rootNodeIds: rootScope.rootNodeIds, scoredNodeIds };
      if (shapePlan !== null && shapeRun!.settings.depthMode === "adaptive" && completedRounds === 1 && expansionDepth > 1) {
        keepAdaptiveChains((position) => {
          const node = authoredNodes.get(position);
          if (node === undefined || !scoredNodeIds.has(node.nodeId)) return null;
          return resolveLeverage({ completedRounds, carryingNodeId: node.nodeId, sensitivityRecords: boundary.propagation.sensitivityRecords,
            rootNodeIds: rootScope.rootNodeIds }).leverage;
        });
      }
```

placed right before `return boundary.continuation.kind === "STOP";`, with, declared before `closeGlobalRound`:

```ts
    let lastBoundary: { propagation: PropagationOutcome; rootNodeIds: readonly string[]; scoredNodeIds: ReadonlySet<string> } | null = null;
    let adaptiveChosen = false;
    /** Spec §3.3 step 5 (adaptive; contract deviation 6): the X chains per position kept at the round-1 boundary. */
    const keepAdaptiveChains = (leverageOf: (position: number) => number | null): void => {
      if (adaptiveChosen || shapePlan === null) return;
      adaptiveChosen = true;
      const chainsByRoot = new Map<number, number[]>();
      for (const leg of shapePlan.legs) if (leg.kind === "POINT") chainsByRoot.set(leg.rootIndex, [...(chainsByRoot.get(leg.rootIndex) ?? []), leg.childIndex]);
      const kept = shapeSelectChains({ chainsByRoot, leverageOf, frozen: frozenIndices, perRoot: shapeRun!.shape.deeperTopPoints });
      for (const leg of shapePlan.legs) {
        if (leg.kind !== "REPLY" && leg.kind !== "DEFENCE") continue;
        if (leg.chain !== null && !kept.has(leg.chain)) deselectedIndices.add(leg.childIndex);
      }
    };
```

`closeGlobalRound` returns `false` early when there is no stopping policy or no root scope; in both cases, for an
adaptive shaped run at round 1, call `keepAdaptiveChains(() => null)` first — with no leverage no chain is kept, and the
deeper rounds are skipped rather than run in full (never more than P2a priced). Import `resolveLeverage` from
`@debateai/propagation`; `PropagationOutcome` is already imported there (pre-flight PF-B46).

- [ ] **Step 5: Run — expect PASS**

Run each command alone, one after another (pre-flight PF-B4: no package but `apps/ui` has its own tsconfig; the root
typecheck covers apps, packages, tools and tests):

```bash
pnpm run typecheck
```

```bash
pnpm exec vitest run tests/unit/debate-shape-runner-boot.test.ts
```

(Skip that second command if Step 2 deleted the file.)

```bash
pnpm exec vitest run tests/integration/debate-shape-run.test.ts -t "argues P assigned positions"
```

Expected: PASS for each.

Then the check that the Phase 2a refusal is gone everywhere (pre-flight PF-B24a):

```bash
command grep -rn 'refuseDebateShapeReceiptInPhase2a' apps packages tools tests acceptance deploy
```

Expected: no output at all (grep exits 1). Any hit is a leftover: remove it.

- [ ] **Step 6: Commit**

```bash
git add apps/runner/src/index.ts tests/integration/debate-shape-run.test.ts tests/support tests/unit/debate-shape-runner-boot.test.ts
git commit -m "runner: argue the shape — assigned roots with hand-over, round-1 points, one cross-reply each, breadth-first adaptive/fixed rounds; the Phase 2a per-run refusal is gone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Scrutiny, the answer length, and the shape's records on the answer

**Files:**
- Modify: `apps/runner/src/index.ts` (scrutiny chains inside `argueTogether`; `argueLeg`'s adaptive-stop check; the
  writer's prompt and bound; condition marks and records; `AuthoredDebateNode.baseTau`)
- Modify: `tests/integration/debate-shape-run.test.ts` (the cases below, code in Task 15 Step 1)

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/debate-shape-run.test.ts` (Task 15 file) the cases "Premium deep scrutiny adds exchanges to the
needy nodes and marks each one SCRUTINY-EXTENDED", "the answer writer is asked for about N words under max(sealed,
writerBound)", the `it.each` fallback cases ("…: the run still ends with an answer, and the mark rides it with its
record"), "a money stop mid-map ends with an answer…" and "a close call gains graders…" (code in Task 15 Step 1). Run
them alone (pre-flight PF-B49: the filter must match each case's real title):

```bash
pnpm exec vitest run tests/integration/debate-shape-run.test.ts -t "scrutiny|about N words|rides it|close call|money stop"
```

Expected: FAIL (no scrutiny nodes; the writer prompt is v2; no shape marks on the answer).

- [ ] **Step 2: Implement scrutiny**

`AuthoredDebateNode` gains `readonly baseTau: number;` set in `saveAuthored` from `authored.selection.tau` (the node's
panel-selected base score).

Inside `argueTogether`, after `const everyBoundaryDecided = earlierDecisions;`:

```ts
      /**
       * Spec §3.3 step 7 — SCRUTINY (Premium only: a zero budget plans no slot). Once every planned round is decided and
       * reviewed, the needy nodes are chosen once (shape-select.ts) and get `roundsPerPoint` exchanges each, in the
       * reserved slots, breadth-first; an unused slot is given up. Never after a stop.
       */
      const scrutinyChains: Promise<void>[] = [];
      if (shapePlan !== null && shapePlan.scrutiny.count > 0) {
        const plannedEnd = shapePlan.scrutiny.start;
        scrutinyChains.push(runChain(async () => {
          await everyBoundaryDecided;
          await reviewRecorder.through(plannedEnd);
          await Promise.all(reviewBatches.filter((_batch, index) => reviewBatchEnds[index]! <= plannedEnd).map((batch) => batch.done));
          if (arguingStopped()) { scrutinyChosen.resolve([]); return; }
          const disputed = new Set(await this.#judgements.readDisputedNodeIds(run.runId));
          const candidates = [...authoredNodes.entries()].flatMap(([position, node]) => {
            // Pre-flight PF-B48: a node the stopping rule froze is never scrutinised (its legs would be skipped silently).
            if (position >= plannedEnd || shapeLegAt(position)?.kind === "CROSS" || frozenIndices.has(position)) return [];
            const leverage = lastBoundary === null || !lastBoundary.scoredNodeIds.has(node.nodeId) ? null
              : resolveLeverage({ completedRounds: expansionDepth, carryingNodeId: node.nodeId,
                sensitivityRecords: lastBoundary.propagation.sensitivityRecords, rootNodeIds: lastBoundary.rootNodeIds }).leverage;
            return [{ position, rootIndex: position < rootCount ? position : shapeLegAt(position)!.rootIndex,
              dispersion: node.panelDispersion, disputed: disputed.has(node.nodeId), rootLeverage: leverage, baseTau: node.baseTau }];
          });
          const chosen = shapeRankScrutiny({ candidates, disagreementThreshold: panelPolicy!.disagreementThreshold,
            leverageMin: shapeRun!.shape.scrutinyLeverageMin, weakBelow: shapeRun!.shape.scrutinyWeakBelow,
            pointsPerDebate: shapePlan.scrutiny.nodesPerDebate });
          for (const leg of buildScrutinyLegs({ plan: shapePlan, depth: expansionDepth, selected: chosen })) scrutinyLegs.set(leg.childIndex, leg);
          scrutinyChosen.resolve(chosen.map((entry) => ({ position: entry.position, nodeId: authoredNodes.get(entry.position)!.nodeId })));
        }, [reviewBatchOf(plannedEnd - 1), 3, 1], () => scrutinyChosen.resolve([])));
        for (let slot = shapePlan.scrutiny.start; slot < totalPlannedNodes; slot += 1) {
          scrutinyChains.push(runChain(async (stage) => {
            await scrutinyChosen.promise;
            const leg = scrutinyLegs.get(slot);
            if (leg === undefined) return;
            await argueLeg(leg, undefined, stage);
          }, authorRank(slot), releaseAt(slot)));
        }
      }
```

Declare, at execute scope before `argueTogether` (so the answer can read it after the arguing):
`const scrutinyChosen = settable<readonly { readonly position: number; readonly nodeId: string }[]>();` and resolve it
with `[]` whenever no scrutiny chain is planned (`shapePlan === null || shapePlan.scrutiny.count === 0`, right after the
plan is built). A δ stop does not skip scrutiny (it judges the planned rounds converged, not the needy nodes); a spend
stop, too few members or a failure does. That needs one change in `argueLeg` (pre-flight PF-B48): its early return
`if (parentStatement === null || stoppedByAdaptiveRule) return;` becomes

```ts
        // Pre-flight PF-B48: the adaptive (δ) stop ends the PLANNED rounds only; a scrutiny leg (round > depth) still runs.
        if (parentStatement === null || (stoppedByAdaptiveRule && leg.round <= expansionDepth)) return;
```

(a row-absent leg always has `round ≤ expansionDepth`, so it is today's check). Add `...scrutinyChains`
to the `chains` awaited by `allSettled`. Scrutiny legs are `REPLY`/`DEFENCE` legs, so `argueLeg` treats them as deeper
exchanges (a reply's writer is a maker other than the attacked node's, a defence prefers the node's own maker).

The records (pre-flight PF-B47, BLOCKER: `ServeRepository.persist` refuses any record whose `affectedNodeIds` is empty
with `CONDITION_MARK_AFFECTED_NODES_REQUIRED`, so a map record names the served root, as `runBodyStopDisclosure` does).
Build them where the served root is known: right after `const servedRoot = makerPositionServe.servedRoot;` (at
2d4f35e64 ~:8129; it comes before `hiddenConditionMarks` and `conditionMarkRecords`, which read `shapeRecords`), with
Task 12's `mapConditionRecords(result, runId, servedRootNodeId)`:

```ts
    /** Spec §3.3 step 7: one SCRUTINY-EXTENDED record per scrutinised node, naming the exchanges it got. */
    const scrutinyRecords: ConditionMarkRecord[] = [];
    for (const { position, nodeId } of await scrutinyChosen.promise) {
      const added = [...scrutinyLegs.values()].filter((leg) => leg.chain === position).flatMap((leg) => authoredNodes.get(leg.childIndex)?.nodeId ?? []);
      if (added.length === 0) continue;
      scrutinyRecords.push(Object.freeze({ mark: "SCRUTINY-EXTENDED" as const, scope: "node" as const, subjectRef: nodeId,
        reason: `SCRUTINY_EXTENDED:${String(added.length)}`, liftPath: null, servedRootRule: null, affectedNodeIds: Object.freeze([nodeId, ...added]) }));
    }
    const closeCallRecords: ConditionMarkRecord[] = closeCallExtensions.map((entry) => Object.freeze({
      mark: "PANEL-CLOSE-CALL-EXTENDED" as const, scope: "node" as const, subjectRef: entry.nodeId,
      reason: `PANEL_CLOSE_CALL_EXTENDED:${String(entry.added)}`, liftPath: null, servedRootRule: null, affectedNodeIds: Object.freeze([entry.nodeId]) }));
    // Answer-scope map records name the served root (affectedNodeIds: [servedRoot.nodeId]), never an empty list.
    const mapRecords = shapeMapResult === null ? [] : mapConditionRecords(shapeMapResult, run.runId, servedRoot.nodeId);
    const shapeRecords = [...mapRecords, ...closeCallRecords, ...scrutinyRecords];
```

Then:
- in `hiddenConditionMarks` add, after the panel degradations (`...new Set(panelDegradations.map((record) => record.mark))`):
  `...new Set(shapeRecords.map((record) => record.mark))`;
- in the first `conditionMarkRecords = Object.freeze([...])` (the one that starts from
  `makerPositionServe.disclosure.records`) add `...shapeRecords,` after `...branchFrozenRecords,`.
A row-absent run has `shapeRecords = []`: both lists are today's. No shape record has an empty `affectedNodeIds`:
scrutiny and close-call records name their node, map records the served root.

- [ ] **Step 3: Implement the answer length**

In the `synthesize: async (request: SynthesizerRequest) => { … }` closure (at 2d4f35e64 ~:8881): the framed prompt
`const framed = buildSynthesisRolePrompt(request, run.argumentLanguageName);` (~:8900) becomes
`const framed = buildSynthesisRolePrompt(request, run.argumentLanguageName, undefined, shapeRun === null ? null : shapeRun.shape.answerWords);`
(only the WRITER's site; the checker's, in `evaluate: async (request: EvaluatorRequest) => …` ~:9075, is unchanged), and
the writer call's `bound: this.settings.synthesisRolePolicy.synthesizerBound,` (~:9013) becomes
`bound: shapeWriterBound(this.settings.synthesisRolePolicy.synthesizerBound, shapeRun === null ? null : shapeRun.shape.writerBound),`
(pre-flight PF-B49: there is no local `synthesizerBound`; the sealed bound is read off `this.settings`). The cheaper-maker
fallback reuses the same request, so it inherits both.

- [ ] **Step 4: Run — expect PASS**

Run each command alone, one after another (pre-flight PF-B4):

```bash
pnpm run typecheck
```

```bash
pnpm exec vitest run tests/integration/debate-shape-run.test.ts -t "scrutiny|about N words|rides it|close call|money stop"
```

Expected: PASS for each.

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/index.ts tests/integration/debate-shape-run.test.ts
git commit -m "runner: scrutiny in reserved slots, answer length for the writer, shape marks with records on the answer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The whole shape, end to end (embedded Postgres, scripted gates)

**Files:**
- Create: `tests/support/debate-shape-harness.ts`, `tests/support/scripted-answers.ts`, `tests/support/saved-debate.ts`,
  `tests/integration/debate-shape-run.test.ts` (pre-flight PF-B54: `scripted-answers.ts` is created here and imported by
  the harness and by Task 16)
- Modify: `tests/support/preview-gate-stubs.ts` (`GateRequestKind` += `"MAP"`; `classifyGateRequest` reads `MAP_CONTRACT_IDS`), `tests/support/preview-debate-harness.ts` (`admittedRun` options `shape`, `settings`, `language`; `previewRunner` option `debateShape`), `tests/integration/parallel-calls-debate.test.ts` (imports `scriptedAnswers` from `../support/scripted-answers.js` and `savedDebate`, `SavedDebate`, `copyDatabase`, `untilUnused` from `../support/saved-debate.js` instead of defining them: a move, no behaviour change)

(Task 13 Step 1 already wrote these files and the first case; this task completes them.)

**Interfaces:**

```ts
// tests/support/debate-shape-harness.ts
export function shapeForTest(input: Readonly<{ plan: DebateShapePlanKey; makers: number; settings: DebateShapeSettings }>): DebateShapeCeilingInput;
export function scriptedShapeAnswers(question: string, options?: Readonly<{
  fail?: ReadonlySet<"ANGLES" | "MERGE" | "CHOOSE" | "LISTS_BUT_ONE" | "CHOOSE_ONE_ANSWER">;
  stopAt?: "MERGE"; stopCloseCallAfter?: number; reviews?: "agree" | "dispute"; panelSpread?: boolean }>): (request: GateRequest, chat: string) => GateOverride | null;
// Pre-flight PF-B53 (P2L Task 17 calls runShapeDebate): one shaped debate, admitted, argued and completed.
export type ShapeDebateHarness = ReturnType<typeof previewDebateHarness>;
export type ShapeDebateOptions = Readonly<{ label?: string; plan?: "free" | "pro"; settings?: DebateShapeSettings; depth?: number;
  script?: Parameters<typeof scriptedShapeAnswers>[1]; concurrency?: boolean; language?: Readonly<{ tag: string; name: string }>; question?: string }>;
export type ShapeDebateRun = Readonly<{ debate: AdmittedRun; gates: PreviewGates; shape: DebateShapeCeilingInput;
  result: Readonly<{ kind: "COMPLETED"; answerId: string }>; calls: Awaited<ReturnType<ShapeDebateHarness["modelCalls"]>> }>;
export async function runShapeDebate(harness: ShapeDebateHarness, options?: ShapeDebateOptions): Promise<ShapeDebateRun>;
// tests/support/scripted-answers.ts — moved verbatim from parallel-calls-debate.test.ts
export function scriptedAnswers(question: string, bearings?: Readonly<{ support: number; attack: number }>): (request: GateRequest, chat: string) => GateOverride | null;
// tests/support/saved-debate.ts — moved verbatim from parallel-calls-debate.test.ts (the admin pool now a first argument), plus the map rows
export type SavedDebate; export function savedDebate(pool: Pool, runId: string, answerId: string): Promise<SavedDebate>;
export function untilUnused(admin: Pool, name: string, deadlineMs: number): Promise<void>;
export function copyDatabase(admin: Pool, from: string, to: string): Promise<void>;
export function dropDatabase(admin: Pool, name: string): Promise<void>;   // untilUnused(admin, name, 60_000), then DROP DATABASE
```

- [ ] **Step 1: Write the failing test**

`tests/support/preview-gate-stubs.ts`, in `classifyGateRequest`, after the story checks:
`if ((Object.values(MAP_CONTRACT_IDS) as string[]).includes(contractId)) return "MAP";` (import `MAP_CONTRACT_IDS` from
`@debateai/map`; add `"MAP"` to `GateRequestKind`). The new judge contracts keep classifying as `"JUDGE"` (their
instruction still names `restatement_text`).

`tests/support/preview-debate-harness.ts`: `admittedRun(label, admission)` accepts `shape?: DebateShapeCeilingInput` and
`settings?: DebateShapeSettings`; with them `depthParams` is `{ depth, ...settings }` and `envelopeBasis` is
`computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize: panel.length, depth, shape })`. `previewRunner(gates, claim, options)`
accepts `debateShape?: DebateShapeRunnerSettings` and passes it into the runner settings (as main.ts does).
`admittedRun` also accepts `language?: Readonly<{ tag: string; name: string }>` (default `{ tag: "en", name: "English" }`)
and passes `argumentLanguageTag` / `argumentLanguageName` to `startRun` EXPLICITLY for a shaped run, never through the
question guesser (amendment 2026-10-13, P2L amendment 5: P2L locks the language before `startRun`, and its tests set it
here). The scripted `MAP:angles` reply below carries no `question_language` member: today's `mapAnglesReplySchema` is
strict; P2L Task 15 makes the member optional and P2L Task 17 adds it here. (The repo's tsconfig has
`exactOptionalPropertyTypes`: pass each optional member with a conditional spread, never as `undefined`.)

`tests/support/debate-shape-harness.ts` (pre-flight PF-B50: `readFramedMaterial` and `wirePacket` come from
`./framed-packet.js`, not from `@debateai/providers` or `./preview-gate-stubs.js`; the `chat` the gate stub hands an
override is already `stubChatBody(provider, body)`, so `wirePacket(chat)` reads Haiku's body too):

```ts
import { createHash } from "node:crypto";
import type { DebateShapeSettings } from "@debateai/contract";
import { MAP_CONTRACT_IDS, mapPromptContractHash } from "@debateai/map";
import { debateShapePolicyStartValues, resolveDebateShape, type DebateShapeCeilingInput, type DebateShapePlanKey } from "@debateai/register";
import { readFramedMaterial, wirePacket } from "./framed-packet.js";
import { OWNER_CALL_CONCURRENCY, PANEL_REFS, type AdmittedRun, type PreviewGates, type previewDebateHarness } from "./preview-debate-harness.js";
import type { GateOverride, GateRequest } from "./preview-gate-stubs.js";
import { scriptedAnswers } from "./scripted-answers.js";

/** P2a's own resolution, at the start values: the sizes a real admission would freeze on the receipt. */
export function shapeForTest(input: Readonly<{ plan: DebateShapePlanKey; makers: number; settings: DebateShapeSettings }>): DebateShapeCeilingInput {
  const shape = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: input.plan, makers: input.makers, settings: input.settings });
  if (shape === null) throw new Error("test: the shape needs two makers");
  return shape;
}

const field = (chat: string, name: string): string =>
  readFramedMaterial(wirePacket(chat)).fields.find((entry) => entry.name === name)?.content ?? "";
const digestOf = (text: string) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
const why = "It could change the answer for the people affected.";

/**
 * Map replies that depend only on what was asked (the material), never on arrival order — so a debate argued twice
 * from one admitted run gets the same map. Every other request goes to `scriptedAnswers` (the parallel-calls suite's).
 */
export function scriptedShapeAnswers(question: string, options: Readonly<{
  fail?: ReadonlySet<"ANGLES" | "MERGE" | "CHOOSE" | "LISTS_BUT_ONE" | "CHOOSE_ONE_ANSWER">;
  stopAt?: "MERGE"; stopCloseCallAfter?: number; reviews?: "agree" | "dispute"; panelSpread?: boolean }> = {}) {
  const others = scriptedAnswers(question);
  const fail = options.fail ?? new Set();
  // Pre-flight PF-B32 (runner-level row): grading requests seen per node, keyed by the framed material (the same for
  // every member of one node's panel). With `stopCloseCallAfter: n`, the (n+1)-th and later grading request of a node
  // (the close-call extension's extra members) is refused as the run's money ceiling.
  const gradingSeen = new Map<string, number>();
  return (request: GateRequest, chat: string): GateOverride | null => {
    if (request.kind === "MAP") {
      const contractId = readFramedMaterial(wirePacket(chat)).contractId;
      if (contractId === MAP_CONTRACT_IDS.angles) {
        return fail.has("ANGLES") ? { content: "not json" } : { content: JSON.stringify({ angles: [
          { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The strongest case against." },
          { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the asker fears." },
          { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do first." },
          { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays." }] }) };
      }
      if (contractId === MAP_CONTRACT_IDS.listAngle || contractId === MAP_CONTRACT_IDS.listOpen) {
        const label = field(chat, "angle_label") || "open";
        if (fail.has("LISTS_BUT_ONE") && label !== "The other side") return { content: "not json" };
        const tag = digestOf(label);
        return { content: JSON.stringify({ points: [
          { claim: `A point against, from ${label} ${tag}.`, why_it_matters: why, leans: "against_some_answer" },
          { claim: `A point for, from ${label} ${tag}.`, why_it_matters: why, leans: "for_some_answer" },
          { claim: `A shared point about cost.`, why_it_matters: why, leans: "context" }],
          candidate_answers: [label === "The other side" ? "No, keep it as it is." : `Yes, ${label.toLowerCase()} first.`] }) };
      }
      if (contractId === MAP_CONTRACT_IDS.merge) {
        if (options.stopAt === "MERGE") return { gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" };
        if (fail.has("MERGE")) return { content: "not json" };
        const points = JSON.parse(field(chat, "points")) as { item_id: string; claim: string }[];
        const answers = JSON.parse(field(chat, "candidate_answers")) as { item_id: string; answer: string }[];
        const group = <T,>(rows: T[], key: (row: T) => string) => [...new Set(rows.map(key))].map((text) => [text, rows.filter((row) => key(row) === text)] as const);
        return { content: JSON.stringify({
          key_points: group(points, (row) => row.claim).map(([claim, rows], index) => ({ key_point_id: `k${String(index + 1)}`, claim, member_item_ids: rows.map((row) => row.item_id) })),
          answers: group(answers, (row) => row.answer).map(([answer, rows], index) => ({ answer_id: `a${String(index + 1)}`, answer, member_item_ids: rows.map((row) => row.item_id) })) }) };
      }
      if (contractId === MAP_CONTRACT_IDS.gap) {
        return { content: JSON.stringify({ new_points: [{ claim: `A missing point ${digestOf(field(chat, "key_points"))}.`, why_it_matters: why, leans: "context" }], framing_challenges: [] }) };
      }
      if (contractId === MAP_CONTRACT_IDS.choose) {
        if (fail.has("CHOOSE")) return { content: "not json" };
        const keyPoints = (JSON.parse(field(chat, "key_points")) as { key_point_id: string }[]).map((row) => row.key_point_id);
        const answers = JSON.parse(field(chat, "answers")) as { answer_id: string; answer: string }[];
        const named = (fail.has("CHOOSE_ONE_ANSWER") ? answers.slice(0, 1) : answers.slice(0, 3)).map((answer, index, all) => ({
          answer_id: answer.answer_id, statement: answer.answer,
          for: keyPoints.filter((_id, at) => at % all.length === index).slice(0, 2),
          // Pre-flight PF-B52: with one answer, `for` and `against` would name the same key points, which the choose
          // check refuses (MAP_KEY_POINT_REPEATED) — the case would fall back instead of reaching ANSWERS_FILLED.
          against: all.length > 1 ? keyPoints.filter((_id, at) => at % all.length === (index + 1) % all.length).slice(0, 2) : [],
          strongest_rival: all.length > 1 ? all[(index + 1) % all.length]!.answer_id : null }));
        return { content: JSON.stringify({ answers: named }) };
      }
      return null;
    }
    if (request.kind === "PANEL" && options.stopCloseCallAfter !== undefined) {
      const material = readFramedMaterial(wirePacket(chat));
      const node = digestOf(JSON.stringify(material.fields));
      const seen = (gradingSeen.get(node) ?? 0) + 1;
      gradingSeen.set(node, seen);
      if (seen > options.stopCloseCallAfter) return { gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" };
    }
    const answer = others(request, chat);
    if (answer === null || !("content" in answer)) return answer;
    if (request.kind === "REVIEW" && options.reviews !== undefined) {
      const parsed = JSON.parse(answer.content) as { outcome: string };
      return { content: JSON.stringify({ ...parsed, outcome: options.reviews }) };
    }
    if (request.kind === "PANEL" && options.panelSpread === true) {
      const parsed = JSON.parse(answer.content) as { steelman: { fidelity: number } };
      return { content: JSON.stringify({ ...parsed, steelman: { ...parsed.steelman, fidelity: request.model.includes("Qwen") ? 0.05 : 0.95 } }) };
    }
    return answer;
  };
}

/** Pre-flight PF-B53: the harness a shaped debate runs on (this suite's, and P2L Task 17's). */
export type ShapeDebateHarness = ReturnType<typeof previewDebateHarness>;
export type ShapeDebateOptions = Readonly<{
  label?: string; plan?: "free" | "pro"; settings?: DebateShapeSettings; depth?: number;
  script?: Parameters<typeof scriptedShapeAnswers>[1]; concurrency?: boolean;
  language?: Readonly<{ tag: string; name: string }>; question?: string;
}>;
export type ShapeDebateRun = Readonly<{
  debate: AdmittedRun; gates: PreviewGates; shape: DebateShapeCeilingInput;
  result: Readonly<{ kind: "COMPLETED"; answerId: string }>;
  calls: Awaited<ReturnType<ShapeDebateHarness["modelCalls"]>>;
}>;

/**
 * One shaped debate, end to end: admitted with the sizes P2a would freeze on its receipt (`shapeForTest`, the four-member
 * panel), argued against the scripted gates (`scriptedShapeAnswers`) by a runner booted with the shape settings (the
 * map hash of this code), to a completed answer. Defaults: label "shape", plan "free", the standard settings, depth 1,
 * the owner's concurrency row (`concurrency: false` is the one-call-at-a-time lane).
 */
export async function runShapeDebate(harness: ShapeDebateHarness, options: ShapeDebateOptions = {}): Promise<ShapeDebateRun> {
  const settings: DebateShapeSettings = options.settings ?? { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" };
  const depth = options.depth ?? 1;
  const shape = shapeForTest({ plan: options.plan ?? "free", makers: PANEL_REFS.length, settings });
  const debate = await harness.admittedRun(options.label ?? "shape", {
    panelRefs: PANEL_REFS, depth, shape, settings,
    ...(options.language === undefined ? {} : { language: options.language }),
    ...(options.question === undefined ? {} : { question: options.question })
  });
  const gates = await harness.startGates({}, undefined, scriptedShapeAnswers(debate.question, options.script ?? {}));
  const composed = await harness.previewRunner(gates, "resend", {
    ...((options.concurrency ?? true) ? { callConcurrency: OWNER_CALL_CONCURRENCY } : {}),
    debateShape: { mapContractHash: mapPromptContractHash() }
  });
  const result = await harness.completedRun(composed, debate, gates);
  return { debate, gates, shape, result, calls: await harness.modelCalls(debate.runId) };
}
```

`tests/support/scripted-answers.ts` and `tests/support/saved-debate.ts`: move `scriptedAnswers` (with `framedTokensOf`,
`share`, `digestOf`, `UUID`, and the imports it needs, e.g. `withRequestDerivedBearings`/`reviewArtifact` from
`./reviewBearings.js`) into `scripted-answers.ts`, and `SavedDebate`, `savedDebate` (with `VOLATILE_KEYS` and what it
needs), `untilUnused`, `copyDatabase` into `saved-debate.ts`, out of `parallel-calls-debate.test.ts` unchanged, except:
`untilUnused(admin, name, deadlineMs)` and `copyDatabase(admin, from, to)` take the `admin` pool as a first argument
(the test passes its own `admin`); `saved-debate.ts` adds
`export async function dropDatabase(admin: Pool, name: string): Promise<void> { await untilUnused(admin, name, 60_000); await admin.query(`DROP DATABASE "${name}"`); }`;
and `savedDebate` also captures `core.map_item` (minus `recorded_at`, content as stored), `core.map_choice` (minus
`recorded_at`) and `core.map_position` (minus `recorded_at`, `root_node_id` renamed through the same `node#k` map) for
the run, as three new members of `SavedDebate` (`mapItems`, `mapChoice`, `mapPositions`, each `readonly unknown[]`).
`parallel-calls-debate.test.ts` keeps `savedAcrossVariants` and its own `MIGRATED_COPY`, and calls the moved helpers with
`admin`.

`tests/integration/debate-shape-run.test.ts` (pre-flight PF-B50: `readFramedMaterial`/`wirePacket` from
`../support/framed-packet.js`, and a request body is read through `stubChatBody(request.provider, request.body)`, which
puts Haiku's system text back in front of its turns; PF-B51: the invariant queries use real columns; PF-B53: `argue`
is a thin wrapper over `runShapeDebate`; PF-B54: the finish-order copies follow `savedAcrossVariants`):

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DebateShapeSettings } from "@debateai/contract";
import { createPool, migrate, type Pool } from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import { debateShapeSiteCounts } from "@debateai/register";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { OWNER_CALL_CONCURRENCY, PANEL_REFS, previewDebateHarness, type AdmittedRun } from "../support/preview-debate-harness.js";
import { stubChatBody } from "../support/preview-gate-stubs.js";
import { runShapeDebate, scriptedShapeAnswers, shapeForTest } from "../support/debate-shape-harness.js";
import { copyDatabase, dropDatabase, savedDebate, type SavedDebate } from "../support/saved-debate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
/** A connection to the cluster's maintenance database, for making and dropping the per-run copies. */
let admin: Pool;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });
const SHAPE_SETTINGS = { debateShape: { mapContractHash: mapPromptContractHash() } } as const;
const STANDARD = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const;
/** The migrated database every per-run copy is made from (nothing but the migrations in it). */
const MIGRATED_COPY = "debate_shape_migrated";
const databaseUrl = (name: string): string => database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, `/${name}`);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  admin = createPool(databaseUrl("postgres"), { max: 1 });
  // As parallel-calls-debate.test.ts: the template is copied before any case admits a run into debateai_s00.
  await copyDatabase(admin, "debateai_s00", MIGRATED_COPY);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await admin?.end(); await database?.stop(); });

const q = (pool: Pool, sql: string, id: string) => pool.query(sql, [id]).then((result) => result.rows);
const argue = (label: string, plan: "free" | "pro", settings: DebateShapeSettings, depth: number,
  script: Parameters<typeof scriptedShapeAnswers>[1] = {}, concurrency = true) =>
  runShapeDebate(harness, { label, plan, settings, depth, script, concurrency });

describe("the debate shape in the runner (spec §3.3)", () => {
  it("argues P assigned positions, K points each, one cross-reply each, adaptive exchanges, and serves an answer", async () => {
    const { debate, gates, shape, result, calls } = await argue("assigned", "free", STANDARD, 2);
    const okKeys = calls.filter((call) => call.outcome === "OK").map((call) => call.call_site_key);
    expect(okKeys.filter((key) => key.startsWith("MAP:"))).toEqual(expect.arrayContaining(["MAP:angles", "MAP:merge", "MAP:choose"]));
    const assigned = gates.requests.filter((request) => request.kind === "JUDGE"
      && readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body))).contractId.startsWith("judge.assigned-root."));
    expect(assigned).toHaveLength(shape.answers);
    expect(okKeys.filter((key) => key.startsWith("JUDGE:cross-root:"))).toHaveLength(shape.answers);
    const pointKeys = okKeys.filter((key) => /^JUDGE:(defender|critic):root[0-9]+:r1:/u.test(key));
    expect(pointKeys.length).toBeLessThanOrEqual(shape.answers * shape.pointsPerAnswer);
    expect(pointKeys.length).toBeGreaterThanOrEqual(shape.answers);
    const deeper = okKeys.filter((key) => /^JUDGE:critic:root[0-9]+:r2:/u.test(key));
    expect(deeper.length).toBeLessThanOrEqual(2 * shape.answers * shape.deeperTopPoints);
    const { answer } = await harness.servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    const positions = await q(database.pool, `SELECT answer_id, root_index FROM core.map_position WHERE run_id=$1 ORDER BY root_index`, debate.runId);
    expect(positions.map((row) => row.root_index)).toEqual(Array.from({ length: shape.answers }, (_unused, index) => index));
  }, 600_000);

  // Amendment 2026-10-13 (final review note 6): the measured, independent check of P2a's ceiling — what the run really
  // made, against what the receipt priced (`debateShapeSiteCounts`), at depth 2 with fixed rounds (every chain runs).
  it("never makes more nodes or map sites than the receipt priced (measured on the ledger)", async () => {
    const fixed = { depthMode: "fixed", scrutiny: "standard", answerLength: "standard" } as const;
    const { debate, shape, calls } = await argue("measured", "pro", fixed, 2);
    const priced = debateShapeSiteCounts(shape, 2);
    const nodes = await q(database.pool, `SELECT count(*)::int AS n FROM core.node WHERE run_id=$1`, debate.runId);
    expect(nodes[0]!.n).toBeLessThanOrEqual(priced.nodes);
    const mapKeys = new Set(calls.filter((call) => call.call_site_key.startsWith("MAP:")).map((call) => call.call_site_key));
    expect(mapKeys.size).toBeLessThanOrEqual(priced.mapSites);
    const crossKeys = new Set(calls.filter((call) => call.call_site_key.startsWith("JUDGE:cross-root:")).map((call) => call.call_site_key));
    expect(crossKeys.size).toBeLessThanOrEqual(priced.crossNodes);
  }, 600_000);

  it("keeps every invariant: roots alone servable, every counting node judged, reviewed by another maker and restated, an acyclic graph", async () => {
    const { debate, result } = await argue("invariants", "free", STANDARD, 2);
    const pool = database.pool;
    const roots = await q(pool, `SELECT node_id::text AS id FROM core.node WHERE run_id=$1 AND parent_node_id IS NULL`, debate.runId);
    // Pre-flight PF-B51: serve.answer has no served-node column; the served root is the UNSERVED-MAKER-POSITION
    // record's subject (buildUnservedMakerPositionRecord), on the answer's latest version.
    const served = await q(pool, `SELECT subject_ref AS id FROM serve.condition_mark WHERE answer_id=$1
      AND mark='UNSERVED-MAKER-POSITION' ORDER BY answer_version DESC LIMIT 1`, result.answerId);
    expect(served).toHaveLength(1);
    expect(roots.map((row) => row.id)).toContain(served[0]!.id);
    const unjudged = await q(pool, `SELECT node.node_id FROM core.node AS node WHERE node.run_id=$1
      AND (NOT EXISTS (SELECT 1 FROM ledger.reduced_judgement AS judgement WHERE judgement.node_id = node.node_id)
        OR NOT EXISTS (SELECT 1 FROM core.stranger_restatement AS restatement WHERE restatement.subject_kind='node' AND restatement.subject_id = node.node_id))`, debate.runId);
    expect(unjudged).toEqual([]);
    // Pre-flight PF-B51: the makers are on the two raw artifacts a review names (as database.test.ts reads them).
    const sameMakerReviews = await q(pool, `SELECT review.node_id FROM ledger.node_review AS review
      JOIN ledger.raw_artifact AS author ON author.raw_artifact_id = review.author_raw_artifact_ref
      JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
      WHERE review.run_id=$1 AND author.maker = reviewer.maker`, debate.runId);
    expect(sameMakerReviews).toEqual([]);
    const edges = await q(pool, `SELECT source_node_id::text AS source, target_node_id::text AS target FROM core.edge
      WHERE run_id=$1 AND target_kind='NODE'`, debate.runId);
    const next = new Map<string, string[]>();
    for (const edge of edges) next.set(edge.source, [...(next.get(edge.source) ?? []), edge.target]);
    const visiting = new Set<string>(); const done = new Set<string>();
    const cyclic = (node: string): boolean => {
      if (done.has(node)) return false; if (visiting.has(node)) return true;
      visiting.add(node); const found = (next.get(node) ?? []).some(cyclic); visiting.delete(node); done.add(node); return found;
    };
    expect([...next.keys()].some(cyclic)).toBe(false);
  }, 600_000);

  it.each([
    ["the angle planner fails", new Set(["ANGLES"] as const), "MAP_ANGLES_FALLBACK"],
    ["the merge fails", new Set(["MERGE"] as const), "MAP_MERGE_FALLBACK"],
    ["the choose fails", new Set(["CHOOSE"] as const), "MAP_CHOOSE_FALLBACK"],
    ["the choose names one answer", new Set(["CHOOSE_ONE_ANSWER"] as const), "ANSWERS_FILLED"],
    ["only one list arrives", new Set(["LISTS_BUT_ONE"] as const), "MAP_UNAVAILABLE_TODAYS_OPENING"]
  ])("%s: the run still ends with an answer, and the mark rides it with its record", async (_label, fail, mark) => {
    const { debate, result } = await argue(`fallback-${mark}`, "free", STANDARD, 1, { fail });
    expect(result.kind).toBe("COMPLETED");
    const rows = await q(database.pool, `SELECT mark, scope, call_site_key FROM serve.condition_mark WHERE answer_id=$1`, result.answerId);
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ mark, scope: "answer", call_site_key: null })]));
    if (mark === "MAP_UNAVAILABLE_TODAYS_OPENING") {
      const roots = await q(database.pool, `SELECT count(*)::int AS n FROM core.node WHERE run_id=$1 AND parent_node_id IS NULL`, debate.runId);
      expect(roots[0]!.n).toBeLessThanOrEqual(shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD }).answers);
    }
  }, 600_000);

  it("a money stop mid-map ends with an answer: root 0 is argued, the stop is disclosed, nothing else is asked", async () => {
    const { result, calls } = await argue("money-stop", "free", STANDARD, 2, { stopAt: "MERGE" });
    expect(result.kind).toBe("COMPLETED");
    expect(calls.some((call) => call.call_site_key === "MAP:choose")).toBe(false);
    expect(calls.filter((call) => call.call_site_key.startsWith("JUDGE:root:"))).toEqual([]);
    const rows = await q(database.pool, `SELECT mark FROM serve.condition_mark WHERE answer_id=$1`, result.answerId);
    expect(rows.map((row) => row.mark)).toEqual(expect.arrayContaining(["ENVELOPE_EXHAUSTED", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK"]));
  }, 600_000);

  it("a close call gains graders: PANEL-CLOSE-CALL-EXTENDED on the node, with more voices than J", async () => {
    const { debate, result } = await argue("close-call", "free", STANDARD, 1, { panelSpread: true });
    const records = await q(database.pool, `SELECT subject_ref FROM serve.condition_mark WHERE answer_id=$1 AND mark='PANEL-CLOSE-CALL-EXTENDED'`, result.answerId);
    expect(records.length).toBeGreaterThan(0);
    const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
    const voices = await q(database.pool, `SELECT (disagreement->'panel'->>'voiceCount')::int AS n FROM ledger.reduced_judgement WHERE node_id = $1::uuid`, records[0]!.subject_ref);
    expect(voices[0]!.n).toBeGreaterThan(1 + shape.graders);
    expect(debate.runId).toBeTruthy();
  }, 600_000);

  // Pre-flight PF-B32 (BLOCKER, law: always an answer): Task 11's unit row proves the fold; this is the runner-level row.
  // One call at a time (no concurrency), so root 0's panel is the first one graded and its extension meets the stop.
  it("a money stop on root 0's close-call extension still saves root 0 and the run answers", async () => {
    const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
    const { debate, result } = await argue("close-call-stop", "free", STANDARD, 1,
      { panelSpread: true, stopCloseCallAfter: shape.graders }, false);
    expect(result.kind).toBe("COMPLETED");
    const marks = await q(database.pool, `SELECT mark FROM serve.condition_mark WHERE answer_id=$1`, result.answerId);
    expect(marks.map((row) => row.mark)).toContain("ENVELOPE_EXHAUSTED");
    const rootZero = await q(database.pool, `SELECT root_node_id::text AS id FROM core.map_position WHERE run_id=$1 AND root_index=0`, debate.runId);
    expect(rootZero).toHaveLength(1);
    const stop = await q(database.pool, `SELECT disagreement->'panel'->>'spendStop' AS stop FROM ledger.reduced_judgement WHERE node_id = $1::uuid`, rootZero[0]!.id);
    expect(stop[0]!.stop).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
  }, 600_000);

  it("Premium deep scrutiny adds exchanges to the needy nodes and marks each one SCRUTINY-EXTENDED", async () => {
    const deep = { depthMode: "adaptive", scrutiny: "deep", answerLength: "standard" } as const;
    const { result, shape, calls } = await argue("scrutiny", "pro", deep, 1, { reviews: "dispute" });
    const records = await q(database.pool, `SELECT subject_ref FROM serve.condition_mark WHERE answer_id=$1 AND mark='SCRUTINY-EXTENDED'`, result.answerId);
    expect(records.length).toBeGreaterThan(0);
    expect(records.length).toBeLessThanOrEqual(shape.scrutinyPointsPerDebate);
    const scrutinyKeys = calls.filter((call) => call.outcome === "OK" && /^JUDGE:critic:root[0-9]+:r(2|3):/u.test(call.call_site_key));
    expect(scrutinyKeys.length).toBeLessThanOrEqual(2 * shape.scrutinyRoundsPerPoint * shape.scrutinyPointsPerDebate);
  }, 600_000);

  it("the answer writer is asked for about N words under max(sealed, writerBound)", async () => {
    const detailed = { depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } as const;
    const { gates, shape } = await argue("length", "free", detailed, 1);
    const writer = gates.requests.find((request) => request.kind === "COMPOSE")!;
    const frame = readFramedMaterial(wirePacket(stubChatBody(writer.provider, writer.body)));
    expect(frame.contractId).toBe("serve.synthesizer.length.v1");
    expect(frame.fields.at(-1)).toEqual({ name: "answer_length", content: `about ${String(shape.answerWords)} words` });
    expect(Number(writer.body.max_tokens)).toBeGreaterThanOrEqual(shape.writerBound);
  }, 600_000);

  it("same answers, any finish order, and the one-call-at-a-time lane: the same debate and the same map", async () => {
    const shape = shapeForTest({ plan: "free", makers: PANEL_REFS.length, settings: STANDARD });
    // Pre-flight PF-B54, as `savedAcrossVariants` in parallel-calls-debate.test.ts: admit ONCE into a seed copy of the
    // migrated template (the reviewer turn is hashed off the run id, so every copy must share it), copy the seed per
    // variant, and drop every copy and the seed.
    const seedName = "debate_shape_finish_seed";
    await copyDatabase(admin, MIGRATED_COPY, seedName);
    const seedPool = createPool(databaseUrl(seedName));
    let seed: AdmittedRun;
    try {
      seed = await previewDebateHarness({ pool: () => seedPool, stubClosers })
        .admittedRun("finish-order", { panelRefs: PANEL_REFS, depth: 2, shape, settings: STANDARD });
    } finally {
      await seedPool.end();
    }
    const saved: SavedDebate[] = [];
    for (const [name, concurrency, holdSeed] of [["p1", true, 11], ["p2", true, 22], ["serial", false, 33]] as const) {
      const copy = `debate_shape_finish_${name}`;
      await copyDatabase(admin, seedName, copy);
      const pool = createPool(databaseUrl(copy));
      try {
        const variant = previewDebateHarness({ pool: () => pool, stubClosers });
        let state = holdSeed;
        const random = () => { state = (state * 48271) % 2147483647; return state / 2147483647; };
        const gates = await variant.startGates({}, undefined, scriptedShapeAnswers(seed.question), (request) => request.kind === "PROBE" ? 0 : 5 + Math.floor(random() * 195));
        const composed = await variant.previewRunner(gates, "resend", { ...(concurrency ? { callConcurrency: OWNER_CALL_CONCURRENCY } : {}), ...SHAPE_SETTINGS });
        const result = await variant.completedRun(composed, seed, gates);
        saved.push(await savedDebate(pool, seed.runId, result.answerId));
      } finally {
        await pool.end();
      }
      await dropDatabase(admin, copy);
    }
    await dropDatabase(admin, seedName);
    expect(saved[1]).toEqual(saved[0]);
    expect(saved[2]).toEqual(saved[0]);
  }, 900_000);
});
```

(Every column the queries read was checked against the migrations by the pre-flight (PF-B51): `core.node.parent_node_id`
(0002), `core.edge.source_node_id`/`target_node_id`/`target_kind` (0002), `ledger.node_review.author_raw_artifact_ref`/
`review_raw_artifact_ref` (0019), `ledger.raw_artifact.maker`, `core.stranger_restatement.subject_kind`/`subject_id`
(0000), `serve.condition_mark.subject_ref`/`answer_version` (0006) and `call_site_key` (0021). There is no
`serve.answer.served_node_id`, `ledger.node_review.reviewer_maker` or `core.node.author_maker`.)

- [ ] **Step 2: Run it — expect FAIL before Tasks 12–14, PASS after**

Task 13 Step 1 and Task 14 Step 1 run the named cases first and see them fail. After Task 14, run (ALONE, nothing
else running; about 10–20 minutes, one heavy run):

```bash
pnpm exec vitest run tests/integration/debate-shape-run.test.ts
```

Expected: PASS. Then, alone, the suite the move touched (a move, no behaviour change):

```bash
pnpm exec vitest run tests/integration/parallel-calls-debate.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/support tests/integration/debate-shape-run.test.ts tests/integration/parallel-calls-debate.test.ts
git commit -m "test: the debate shape end to end — positions, invariants, every fallback, money stop, close call, scrutiny, length, finish order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Row absent = today, byte for byte

**Files:**
- Create: `tests/integration/debate-shape-row-absent.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/integration/debate-shape-row-absent.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import { OWNER_CALL_CONCURRENCY, PANEL_REFS, previewDebateHarness, type AdmittedRun } from "../support/preview-debate-harness.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { copyDatabase, dropDatabase, savedDebate } from "../support/saved-debate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let admin: Pool;
const stubClosers: (() => Promise<void>)[] = [];
/** The migrated database every per-run copy is made from (pre-flight PF-B54, as parallel-calls-debate.test.ts). */
const MIGRATED_COPY = "debate_shape_absent_migrated";
const databaseUrl = (name: string): string => database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, `/${name}`);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  admin = createPool(databaseUrl("postgres"), { max: 1 });
  await copyDatabase(admin, "debateai_s00", MIGRATED_COPY);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await admin?.end(); await database?.stop(); });

describe("a run admitted without a shape is today's run (spec §3.1)", () => {
  it.each([["parallel", true], ["serial", false]] as const)("%s: a runner booted WITH the shape saves the same debate, asks no MAP: call, writes no map row", async (_name, concurrency) => {
    // Pre-flight PF-B54: admit once into a seed copy of the migrated template, copy the seed per variant, drop each copy.
    const seedName = `absent_seed_${_name}`;
    await copyDatabase(admin, MIGRATED_COPY, seedName);
    const seedPool = createPool(databaseUrl(seedName));
    let debate: AdmittedRun;
    try {
      debate = await previewDebateHarness({ pool: () => seedPool, stubClosers }).admittedRun(`absent-${_name}`, { panelRefs: PANEL_REFS, depth: 2 });
    } finally {
      await seedPool.end();
    }
    const saved = [];
    for (const variant of ["without", "with"] as const) {
      const copy = `absent_${_name}_${variant}`;
      await copyDatabase(admin, seedName, copy);
      const pool = createPool(databaseUrl(copy));
      try {
        const harness = previewDebateHarness({ pool: () => pool, stubClosers });
        const gates = await harness.startGates({}, undefined, scriptedAnswers(debate.question));
        const composed = await harness.previewRunner(gates, "resend", {
          ...(concurrency ? { callConcurrency: OWNER_CALL_CONCURRENCY } : {}),
          ...(variant === "with" ? { debateShape: { mapContractHash: mapPromptContractHash() } } : {})
        });
        const result = await harness.completedRun(composed, debate, gates);
        const calls = await harness.modelCalls(debate.runId);
        expect(calls.filter((call) => call.call_site_key.startsWith("MAP:"))).toEqual([]);
        expect(gates.requests.filter((request) => request.kind === "MAP" || request.kind === "UNKNOWN")).toEqual([]);
        const mapRows = await pool.query(`SELECT (SELECT count(*) FROM core.map_item WHERE run_id=$1) + (SELECT count(*) FROM core.map_choice WHERE run_id=$1)
          + (SELECT count(*) FROM core.map_position WHERE run_id=$1) AS n`, [debate.runId]);
        expect(Number(mapRows.rows[0]!.n)).toBe(0);
        saved.push({ debate: await savedDebate(pool, debate.runId, result.answerId), keys: calls.map((call) => call.call_site_key) });
      } finally {
        await pool.end();
      }
      await dropDatabase(admin, copy);
    }
    await dropDatabase(admin, seedName);
    expect(saved[1]).toEqual(saved[0]);
  }, 900_000);
});
```

This proves the runner's own switch (a runner that CAN argue the shape does not, for a run without one). The proof
that nothing moved against TODAY'S code is the existing suites, unchanged and green (Step 2), plus the unit proofs that
today's judge and writer prompts are byte-identical (Tasks 4, 5).

- [ ] **Step 2: Run, ONE AT A TIME, nothing else running (each 5–25 minutes)**

1. `pnpm exec vitest run tests/integration/debate-shape-row-absent.test.ts` — Expected: PASS
2. `pnpm exec vitest run tests/integration/parallel-calls-debate.test.ts` — Expected: PASS (today's parallel and serial engines, finish-order proof)
3. `pnpm exec vitest run tests/integration/preview-busy-model-run.test.ts` — Expected: PASS (sit-outs, resilience, byte-for-byte reasons)
4. `pnpm exec vitest run tests/integration/story-end-to-end.test.ts` — Expected: PASS
5. `pnpm exec vitest run tests/integration/t17-envelope-ledger.test.ts` — Expected: PASS (ledger and envelope rows)
6. `pnpm exec vitest run tests/integration/database.test.ts` — Expected: PASS (largest; run last, alone)

Any red: stop, read it with superpowers:systematic-debugging; a row-absent difference is a defect in a guard of this
plan, never an expectation to bend.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/debate-shape-row-absent.test.ts
git commit -m "test: a run without a shape is today's run on a runner that can argue the shape

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Whole-branch verification and the owner's documents

**Files:**
- Modify: `deploy/vps/README.md` (amendment 2026-10-13, final review; controller decision on pre-flight PF-B17(c) and
  PF-B56): in the refusal table under "### Publishing the settings register on this host", ADD one row for
  `DEBATE_SHAPE_RUNNER_UNCONFIGURED` (Task 12's code) right after Task 6's `MAP_CONTRACT_HASH_MISMATCH` row:
  "| `DEBATE_SHAPE_RUNNER_UNCONFIGURED` | a run admitted with the debate shape was claimed by a runner without the shape
  settings (no sealed map hash, or no call scheduler): the run is refused. Restart the runner on the register version
  that seals the `debateShapePolicy` row (with `mapContractHash`), then ask again. |"; and, right below the table (before
  "### Upgrading to role rotation"), one runbook line (final review note 7): "**A malformed shaped unfinished receipt** —
  every preview ask is refused and the API logs `preview.estimate.refused` with \"malformed debate shape\": fail that
  run's job (its work item), which drops it from `PREVIEW_UNFINISHED_RUNS_SQL`; nothing else is needed."
- Check only (Task 6 writes them; no second edit here): the `DEBATE_SHAPE_MAP_HASH_UNSEALED` and
  `MAP_CONTRACT_HASH_MISMATCH` rows in `deploy/vps/README.md` (they replace the old `DEBATE_SHAPE_POLICY_RUNNER_PENDING`
  row, at 2d4f35e64 ~:1897), the `debateShapePolicy` row in `deploy/vps/register/README.md` (~:54), and the key count in
  `deploy/preview-auth-dev/v1/README.md` — Step 1 item 4 greps them.

Implementer note (pre-flight PF-B56): the owner step this branch needs (it boots on the preview only after a new
register version that seals the judge, composer and map hashes, published after P2L Task 15) is in the Owner steps
section below this task; nothing in this task publishes or pins a register version.

- [ ] **Step 1: Light checks — ONE command at a time, nothing else running**

Pre-flight PF-B4 and PF-B55 (controller decision): no `tsc -p <dir>` other than `apps/ui` (no other package has its own
tsconfig), and NOT the CI gate (`pnpm run test:ci-gate` runs every unit, architecture and render test at once, which
the owner's one-heavy-run rule forbids on this Mac; CI is the judge of the whole suite). Never the whole suite, never
a glob of unit tests.

1. The whole typecheck (root `tsc --noEmit`: apps, packages, tools, tests):

```bash
pnpm run typecheck
```

2. The UI's own typecheck:

```bash
pnpm exec tsc -p apps/ui --noEmit
```

3. The shipped-corpus manifest, regenerated then checked (ruling SC1):

```bash
SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
```

```bash
pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
```

Expected: PASS, and `git diff --stat tests/support/shipped-corpus.manifest.txt` shows no change (every task that added a
shipped file already regenerated it; a change here means one did not — commit it with this task).

4. The owner's documents: the old refusal is gone, the new rows are there.

```bash
command grep -rn 'RUNNER_PENDING' deploy
```

Expected: no output (grep exits 1).

```bash
command grep -n 'DEBATE_SHAPE_MAP_HASH_UNSEALED\|MAP_CONTRACT_HASH_MISMATCH\|DEBATE_SHAPE_RUNNER_UNCONFIGURED' deploy/vps/README.md
```

Expected: at least one table row for each of the three codes. If Task 6's two rows are missing, stop and report it
(they are Task 6's to write), do not write them twice.

5. Every unit file this plan creates or touches, each in its OWN command, one after another (the list gathered from
every task's run lists; skip a file a task deleted, e.g. `tests/unit/debate-shape-runner-boot.test.ts` if Task 13
deleted it). Expected: PASS for each.

```bash
pnpm exec vitest run tests/unit/map-orchestrator-stops.test.ts
```

```bash
pnpm exec vitest run tests/unit/map-orchestrator.test.ts
```

```bash
pnpm exec vitest run tests/unit/practice-openings.test.ts
```

```bash
pnpm exec vitest run tests/unit/map-multilingual.test.ts
```

```bash
pnpm exec vitest run tests/unit/map-choose.test.ts
```

```bash
pnpm exec vitest run tests/unit/map-keypoints.test.ts
```

```bash
pnpm exec vitest run tests/unit/map-replies.test.ts
```

```bash
pnpm exec vitest run tests/unit/map-items.test.ts
```

```bash
pnpm exec vitest run tests/unit/map-package.test.ts
```

```bash
pnpm exec vitest run tests/unit/debate-shape-marks.test.ts
```

```bash
pnpm exec vitest run tests/unit/a16-backup-model-used-mark.test.ts
```

```bash
pnpm exec vitest run tests/unit/s14-live-projections.test.ts
```

```bash
pnpm exec vitest run tests/unit/dr174-resilience.test.ts
```

```bash
pnpm exec vitest run tests/unit/obs-l2-s02-registry.test.ts
```

```bash
pnpm exec vitest run tests/unit/v2ui-data-layer.test.ts
```

```bash
pnpm exec vitest run tests/unit/story-i18n.test.ts
```

```bash
pnpm exec vitest run tests/unit/judge-shape-legs.test.ts
```

```bash
pnpm exec vitest run tests/unit/prompt-text-pins.test.ts
```

```bash
pnpm exec vitest run tests/unit/a13-model-role.test.ts
```

```bash
pnpm exec vitest run tests/unit/hs-s01-seal.test.ts
```

```bash
pnpm exec vitest run tests/unit/f-sealedrows-a-conformance-extractor.test.ts
```

```bash
pnpm exec vitest run tests/unit/prompt-injection-corpus.test.ts
```

```bash
pnpm exec vitest run tests/unit/a18-moment-tools.test.ts
```

```bash
pnpm exec vitest run tests/unit/synthesizer-length.test.ts
```

```bash
pnpm exec vitest run tests/unit/answer-writer-v3-register-12.test.ts
```

```bash
pnpm exec vitest run tests/unit/debate-shape-boot.test.ts
```

```bash
pnpm exec vitest run tests/unit/debate-shape-runner-boot.test.ts
```

```bash
pnpm exec vitest run tests/unit/debate-shape-policy.test.ts
```

```bash
pnpm exec vitest run tests/unit/debate-shape-submit.test.ts
```

```bash
pnpm exec vitest run tests/unit/preview-register-publish-v2.test.ts
```

```bash
pnpm exec vitest run tests/unit/preview-auth-dev-snapshot.test.ts
```

```bash
pnpm exec vitest run tests/unit/preview-release-artifacts.test.ts
```

```bash
pnpm exec vitest run tests/unit/hosted-register-publish.test.ts
```

```bash
pnpm exec vitest run tests/unit/ask-model-picker.test.ts
```

```bash
pnpm exec vitest run tests/unit/preview-practice-wiring-drift.test.ts
```

```bash
pnpm exec vitest run tests/unit/preview-auth-dev-pending-forward.test.ts
```

```bash
pnpm exec vitest run tests/unit/shape-plan.test.ts
```

```bash
pnpm exec vitest run tests/unit/shape-select.test.ts
```

```bash
pnpm exec vitest run tests/unit/shape-close-call.test.ts
```

```bash
pnpm exec vitest run tests/unit/t03-judge-panel.test.ts
```

```bash
pnpm exec vitest run tests/unit/debate-shape-preview-estimate.test.ts
```

```bash
pnpm exec vitest run tests/unit/preview-budget-estimate.test.ts
```

```bash
pnpm exec vitest run tests/unit/map-stage.test.ts
```

```bash
pnpm exec vitest run tests/unit/dev-runner-reconciliation.test.ts
```

```bash
pnpm exec vitest run tests/unit/api-operational-error.test.ts
```

6. The architecture tests (one directory, as the repo runs them: scaffold source rules, orphan audit edges, carrier
lists, forward chain):

```bash
pnpm exec vitest run tests/architecture
```

Expected: PASS.

7. The repo's lint (`pnpm run audit:architecture && pnpm run audit:source`):

```bash
pnpm run lint
```

Expected: PASS. A red in any step: stop and read it (superpowers:systematic-debugging); a new red is fixed, never added
to the known-red list.

- [ ] **Step 2: Commit**

```bash
git add deploy tests/support/shipped-corpus.manifest.txt
git commit -m "docs: the runner argues the debate shape; the runner-unconfigured refusal and the malformed shaped receipt in the runbook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Owner steps (things that are "off" until the owner acts)

1. **Sealed hashes change.** `judgeContractHash` (six new judge contracts) and `composerContractHash` (the length
   variant) get new values, and the optional row `mapContractHash` is new. Dev registers re-seal on their own; the
   preview and hosted registers need a republish (a new register version) before a runner built from this branch is
   deployed — the same republish that would carry `debateShapePolicy`. Runs in flight should drain first (resume reads
   ledger rows by contract hash). **Preview order (amendment 2026-10-13, P2L amendment 3):** publish the preview's
   `mapContractHash` (and the `debateShapePolicy` row) only after P2L Task 15 has landed, because P2L changes the angle
   planner's instruction and answer form and so moves `mapPromptContractHash()` once more; one republish then carries
   P2b's and P2L's hashes together. Migration 0116 (this plan) and 0117 (P2L Task 19) may need renumbering at merge.
1a. **This branch boots on the preview only after that new register version (pre-flight PF-B13, ruled 2026-10-13).**
   From Task 4 on, the runner's boot check (`assertRegisterPromptContractHashes`, also in the practice runner) refuses
   any register whose judge or composer hash differs from the code's, so a runner built from this branch refuses the
   preview's register 12 with or without the shape row. It runs on dev registers (they re-seal by themselves) and on a
   practice throwaway version. On the preview it waits for the new version that seals the code's `judgeContractHash`,
   `composerContractHash` and `mapContractHash`, published after P2L Task 15 has landed.
1b. **Switching the shape off (the rollback, amendment 2026-10-13).** Preview: republish with the plan choice
   `debateShape: "off"` (the row stays, `enabled: false`). Hosted: publish a version whose `debateShapePolicy` member
   carries `"enabled": false`. Either way the API asks today's shape again, and a runner on that version still finishes
   the debates admitted with the shape. Switching back on is a republish with a policy file.
2. **Wording, option 1 shipped, 3 phrasings offered** (no internals in any):
   - Opposite-answer template (all site languages): (1) "The opposite of this answer: …" / "An answer different from the one above";
     (2) "The other side of this answer: …" / "Another answer to the same question"; (3) "Not this answer: …" / "A different answer".
   - Writer length sentence: (1) "Write the answer in about the number of words named in answer_length; it is a target, never a reason to leave out a point the answer needs.";
     (2) "Aim for about the number of words in answer_length, but never drop a point the answer needs."; (3) "Keep the answer near the length in answer_length; completeness comes first."
   - The eight mark labels (Task 3; pre-flight PF-B9, ruled 2026-10-13: no grading, scoring, judging, threshold or
     panel words). Option 1 is in code (English; the other 34 locales translate option 1):
     - Map angles fallback: (1) "The question was explored from a standard set of angles"; (2) "A standard list of viewpoints was used to explore the question"; (3) "The angles to explore were set by a simple rule, not chosen by an AI".
     - Map merge fallback: (1) "Similar points were grouped together by a simple rule"; (2) "Points that said the same thing were combined automatically"; (3) "Matching points were merged by a set rule, not by an AI".
     - Map choose fallback: (1) "The answers to debate were picked by a simple rule"; (2) "The answers that were argued were chosen automatically"; (3) "A set rule, not an AI, chose which answers to argue".
     - Map unavailable (today's opening): (1) "Each AI started with its own answer"; (2) "The AIs began by each giving their own answer"; (3) "There was no shared overview first; each AI opened with its own answer".
     - Answers filled: (1) "A second answer was added so two answers could be compared"; (2) "Only one answer came up, so an opposing one was added"; (3) "An alternative answer was added so there were two sides to argue".
     - Points filled for a side: (1) "A point was added so every side was heard"; (2) "Extra points were added so each answer had its say"; (3) "Some points were added to keep the sides even".
     - Close call extended: (1) "This point was close, so more AIs looked at it"; (2) "Opinions on this point were split, so more AIs weighed in"; (3) "This was a near tie, so extra AIs checked it".
     - Scrutiny extended: (1) "The AIs examined this point more closely"; (2) "This point got extra discussion"; (3) "The AIs argued this point further".
3. **Thinking for the map** stays the "opening" step; a separate "map" step in the thinking table is an owner choice for later.
4. **Migration 0116** must be renumbered at merge if the preview has applied another 0116 (lineage README rule).
5. **Open owner questions carried from P2a's final review (amendment 2026-10-13):** (a) whether Free's depth ceiling 2
   (code today) becomes an optional row member with a default, like `mapStepBounds`; (b) the window sizing of map merge,
   map choose and the answer checker (Task 6 Step 3e's known limit) once P2d's practice has measured it, and whether
   the Free boot check should also cover POSITION (pre-flight PF-B22: dropped, because POSITION may take a fallback
   seat, so the check would refuse boots that no ask refuses); (c) whether
   shaped roles should refuse a fallback seat whose window is too small (Task 11's known limit). Already settled:
   the public answer body strips `cost_envelope.basis.shape` (P2a ruling M8), and a shape setting chosen on /new is no
   longer dropped silently when the row is absent (P2c's room flag `shape_settings`).

## Self-review: spec items → tasks

| Spec item | Task(s) |
|---|---|
| §1 map steps in the runner over the scheduler lane, ledger rows, keys, bounds (R-2) | 1, 12 (P2a cross-plan 1–2 for `mapStepBounds`) |
| §1.1 who-raised-what kept, quotas/fills, also-raised stored | 8 (stored from Phase 1's result), 15 |
| §1.2 every fallback ends with an answer | 1 (STOPPED), 9 (today's-opening positions), 12, 15 (five fallbacks + money stop) |
| §3.1 row absent = today; invalid row refuses boot; P2a guard removed | 6, 16 |
| §3.3 step 1 one-maker run keeps today's path | 12 (`effectiveMakerCount >= 2`) |
| §3.3 step 2 assigned roots, round-robin different makers, opener first, hand-over, root 0 mandatory | 4, 9, 13 |
| §3.3 step 3 round-1 points, against first, consideration, writer ≠ position's maker | 4, 9, 13 |
| §3.3 step 4 one cross-reply per position to its strongest rival | 9, 13 |
| §3.3 step 5 breadth-first rounds, δ/ε at each boundary, adaptive vs fixed | 9 (boundaries), 10, 13 |
| §3.3 step 6 J graders, close-call extension, highest-voice rule unchanged | 11, 15 |
| §3.3 step 7 scrutiny ranking, budgets, SCRUTINY-EXTENDED | 9 (slots), 10, 14, 15 |
| §3.3 step 8 answer length (target sentence, writer bound) | 5, 14, 15 |
| §3.3 marks in CONDITION_MARKS mid-list with typed records | 3, 12, 14 |
| §3.3 invariants: roots only servable; root 0 mandatory; every node panelled/reviewed/restated; label before synthesis; acyclic; marks with records; story ≤ 8 positions; money stop writes the answer | 15 (servable, judged/reviewed/restated, acyclic, marks), 13 (root 0 rule kept), 3 (records two-way), P2a caps P ≤ 5 (story ≤ 8), 15 (money stop); label-before-synthesis unchanged code path, covered by the existing suites in 16 |
| §3.4 storage, encryption, erasure, TRUNCATE guard, grants, reader | 7, 8 |
| §3.5 scheduling: lists parallel, merge/gap/choose sequential, positions parallel, points start when their position is written, plan-order saves, serial path | 1, 12, 13, 15 (finish order + one-call lane) |
| §3.6 money: never more than priced | 9 (enumerator), cross-plan P2a 1–3 |
| §4 prompts sealed (map hash, judge legs, length sentence) | 4, 5, 6 |
| §5 unit tests listed (schemas, counting, quotas, fallbacks, caps, panels, rounds, scrutiny, length) | 1, 2, 9, 10, 11, 5 (Phase 1 tests keep the schema/counting cases) |
| §5 integration: full debate, row-absent byte identity, each fallback, money stop mid-map, finish order | 15, 16 |
| Phase-2 notes: STOPPED/abandon/codes; reassigned keys; primary subtags; non-Latin normalisation; gap guard; choose "reuse answer_id" (already in) | 1, 2 |
| P2a final review (amendments 2026-10-13): the guard gone at all six sites (five in Task 6, the per-run refusal in Task 13: pre-flight PF-B24a), hosted readiness = runner boot, v1 kit closure, native operator's sixth argument, the preview rollback (`enabled`), Free eligibility at the largest writer bound | 6, 13 |
| P2a final review notes 1, 3, 5, 6, 7 (panel shares, fallback windows, X > K, measured ceiling, runbook line) | 11, 10, 13, 15, 17 |
| P2L amendments P2b-1..5 (map language check kept, no new mark, publish order, `mapConditionRecords` generic, harness language) | 2, 3, 12, 15, Owner steps |
