# Debate Shape Phase 2d (practice and proof) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the practice tool run a whole practice debate in the new debate shape, on the live register's exact settings plus the owners' switch, in the throwaway database only. Make its report and transcript show what the shape did. Prove a whole new-shape debate end to end against the scripted gates. Document the operator procedure for the whole-debate comparison of today's shape and the new shape.

**Architecture:**

- **The switch, in the throwaway database only.** `practice.ts debate` gains four debate-only flags:
  - `--shape-policy FILE` is read and checked by P2a's own parser (`parseDebateShapePolicy`). After the live register is imported as today, the practice publishes ONE more register version in the throwaway database, through the register's own general publication. It is the last exported version's rows with the `debateShapePolicy` row added, or replaced if the export already holds one.
  - The practice then hands this version number to both of its compositions (the ask path and the runner), so both read the row exactly as the live services would.
  - With `--register-next` (the code's next register version, added to the tool after this plan was first written), the row goes into THAT version instead: the policy is handed to the preview publish kit's own source build, and no other version is made (controller ruling D-REGNEXT; pre-flight PF-D1).
  - The export file is only read. The live register is never reachable: the practice has no live database connection.
  - `--depth-mode`, `--scrutiny` and `--answer-length` become the practice ask's `depth_params` fields.
- **The report.** A new module, `tools/preview-practice/practice-shape.ts`, reads after the run, before the throwaway database is deleted:
  - the run's stored `depth_params` and the sizes frozen on its receipt (`envelope_basis.shape`, P2a);
  - the answer's condition marks;
  - the `MAP:*` ledger calls;
  - P2b's map choice.

  It builds an optional `shape` block for `report.json`, a "Debate shape" paragraph for `report.md`, and `structure.map` for `transcript.json`. A shape run whose map fell back to today's opening is NOT_PROVEN, never PASS.
- **Map calls.** They join the practice's own accounting as the call family `MAP`: format re-check, slip rule, per-site rows and transcript family.
- **The proof.** The scripted gate doubles answer map steps with the openings dry script's own replies, plus a two-answer choose. New integration cases in `tests/integration/preview-practice-run.test.ts` run:
  - a whole new-shape debate (PASS, served answer, READY story handed `also_raised`);
  - a row-absent debate with nothing new in it;
  - the two refusals.
- **The comparison procedure.** README step S-8 runs today's shape and the new shape on four fixed questions at depth 1 with all five AIs: two `--out` folders per question, within the daily test budget, after the pass bar. Until the owners republish the register with this code's prompt fingerprints, every practice debate of this branch runs with `--register-next`, so the two arms differ only by the shape row (controller ruling D-BOTHNEXT; pre-flight PF-D2). The results are judged by the owners' private method, outside this repository.
- **The question language (Task 7b, P2L).** A new cheap mode `practice.ts language` runs nine fixed language cases (P2L's seven, plus the P2L final review's Sorani and short-Chinese cases; pre-flight PF-D25, controller ruling D-CASES) through the same gates: eld's reading, the fast check (always asked) and one `MAP:angles` call each, computes each lock exactly as the site's decider does, and writes `language.jsonl` + `report.json` + `report.md`. Debate mode gains `--site-language` and `--language-choice` (the site's one-language pop-up answered for the operator, KEEP_MINE by default; controller ruling D-CHOICE), and its report records the lock, its source and record code, the language the run was stored with (pre-flight PF-D27), whether a rewrite was used, and the planner's own naming (operator-only, CR-3). S-8 adds the language mode first, then one full new-shape debate on `lang-ro-en-mix`, before the preview upload.
- **The review catch-up (Task 7c).** The operator's review catch-up (`job:review-catch-up`) reviews a run's unreviewed nodes after the run. It takes the run's language lock for shaped runs exactly as the runner's own reviews do; today's runs keep today's review, byte for byte (controller ruling D-CATCHUP; P2L final review M15).

**Tech Stack:** TypeScript (ESM, NodeNext, strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), zod 4.4.3 (through `@debateai/contract` and `@debateai/map`), vitest, pnpm 11.20.0, Node >= 26.8.2, embedded PostgreSQL 18 (integration).

**Spec:** docs/superpowers/specs/2026-10-12-debate-shape-design.md: §5 Tests ("Practice"), §3.3 run flow (what the report counts) and ruling S9. The question-language spec (2026-10-13) as P2L carries it: its "Cross-plan amendments" → "P2d" and its controller rulings CR-1..CR-7 (Task 7b). Binding names: docs/superpowers/plans/2026-10-12-debate-shape-phase2-INTERFACE.md, §6 and §1–§5 as consumed. Siblings: docs/superpowers/plans/2026-10-12-debate-shape-phase2a.md, docs/superpowers/plans/2026-10-12-debate-shape-phase2b.md (P2b, written; its "Cross-plan changes" → "P2d" are applied here), docs/superpowers/plans/2026-10-12-debate-shape-phase2c.md and docs/superpowers/plans/2026-10-13-debate-shape-phase2-language.md (P2L). See Task 0 and "Contract deviations".

All paths are relative to the engine folder `dialectical-engine/` of the worktree `.claude/worktrees/debate-shape-p2` (branch `feat/2026-10-13-debate-shape-phase2`). Every command runs from that folder: `cd "$(git rev-parse --show-toplevel)/dialectical-engine"`.

## Amendments 2026-10-13

Applied to this plan before it runs. Each line says what changed and why.

- Header: worktree `.claude/worktrees/debate-shape-p2`, branch `feat/2026-10-13-debate-shape-phase2`; P2b is written, not "being drafted" (controller decision F).
- Order: P2L is a precondition and P2d runs LAST, after P2L Tasks 18–19 (P2L amendment P2d-1, P2L "Execution order" item 7; controller decision A1).
- Task 0 Step 2: the gates "`readDebateShapePolicy` in the practice runner" and "the guard gone from two files" proved nothing (true only because of P2a's guard); they now check P2b's real wiring (`resolveDebateShapeRunnerSettings` and `readMapContractHash` in `apps/runner/src/main.ts` AND `tools/preview-practice/practice-runner-composition.ts`) and that the Phase-2a guard is gone from EVERY site (`assertDebateShapeRunnerReady`, `refuseDebateShapeReceiptInPhase2a`, the API's `debate-shape-runner-pending` boot step) (P2a final review, rows P2d:133/:186/:189; controller decision A2).
- Task 0 Step 2 and Contract deviation 7: the "no `hashes.map` read" gate is reversed; the gate now checks that the dev builder seals `mapContractHash` (P2a final review row P2d:136/:195, ruling X3; P2b cross-plan P2d-2; controller decision A3).
- Contract deviation 6, Task 0, Task 4 and Task 5: the map readers `readMapChoiceForRun(pool, runId)`, `readMapItemsForRun(pool, runId)` and `MapChoiceRepository` (with `readMapResultForRun`) come from `@debateai/map` (`packages/map/src/repository.ts`), not `@debateai/db` (P2b cross-plan P2d-1; final review row "Names vs P2b/P2c/P2d"; controller decision A4).
- Task 0: new checks for the migration `migrations/*_debate_shape_map.sql` (0116 unless renumbered at merge), `debateShapeInForce`, and CR-3 (`LANGUAGE_PLANNER_DISAGREES` is a map NOTE, never a condition mark) (P2b cross-plan P2d-6; controller facts on `enabled` and CR-3).
- Task 1: `shape-policy-start.json` writes `"mapStepBounds": {"merge": 32768, "choose": 32768}` explicitly and never `enabled`; the test checks both; a `--shape-policy` file whose row is not in force (`"enabled": false`) is refused, as it could never run the shape (P2a final review row P2d:335–380; controller decisions C and the `enabled` fact; the refusal is this plan's own decision).
- Task 2: the practice version ALSO supersedes `judgeContractHash` and `composerContractHash` with the code's values and adds `mapContractHash`, all three from `buildDevelopmentRunnerRegisterRows()`, throwaway database only; a new test pins the three rows to the dev builder's; a row with `enabled: false` counts as no row (`debateShapeInForce`) (P2b cross-plan P2d-2, ruling X3; controller decisions B and the `enabled` fact).
- Task 3: a reassigned list's key `MAP:list:<i>:2` counts as `list` (test added) (P2b cross-plan P2d-5).
- Task 4: `SCRUTINY-EXTENDED` is one mark per scrutinised node ("scrutinised points", not "extra exchanges") and `PANEL-CLOSE-CALL-EXTENDED` one per extended node; wording, report line and README follow (P2b cross-plan P2d-3).
- Task 6: the stubs build on P2b Task 15's `"MAP"` kind (by `MAP_CONTRACT_IDS`) instead of adding their own; P2d adds only the default MAP answer (`stubMapContent`, whose angles reply names `question_language` first) and a `"QUESTION_LANGUAGE"` kind whose default answer is the question's own language (so a shape debate run before Task 7b, with no `site_language`, still locks Romanian); the row-absent case checks that no fast check is sent; Task 7b later makes the shape case check the report's `language` block (P2b cross-plan P2d-4; P2L amendment P2b-5; P2L Tasks 11–12).
- Global Constraints and Contract deviations: the practice version's four own rows; the six debate-only flags and the language mode's flags; the report.md exception for the owners' rewrite read; new deviations 8 (the question language) and 9 (a row not in force is no row) (P2L amendments P2d-2..P2d-6; controller facts on `enabled`).
- New Task 7b: practice mode `language` (eld, the fast check always asked, one `MAP:angles` call per case; `language.jsonl` + report), the seven fixed language cases, the pass bar mapped onto the practice verdicts, debate flags `--site-language` and `--language-choice`, the debate report's `language` block (planner facts read through `readMapResultForRun`, operator-only), README and S-8 additions, unit and integration tests (P2L amendments P2d-2..P2d-6, adjusted for CR-3; controller decision E).
- File Structure, Review Focus (new item 6), Task 8 (new test file, the language dry run, the language integration case) and the Self-review updated to match (controller decision G).

## Amendments 2026-10-14 (pre-flight)

Source: `.superpowers/sdd/2026-10-12-debate-shape-phase2d/preflight.md` (6 BLOCKER, 18 FIX, 8 NOTE; code at `362c4c619`) and the controller rulings in that folder's `progress.md` (D-REGNEXT, D-BOTHNEXT, D-NOTARGUED, D-SETTLE, D-CHOICE, D-CASES, D-CATCHUP). Where a ruling and a pre-flight correction differ, the ruling wins. Every changed spot carries a "(pre-flight PF-Dn)" or "(controller ruling D-…)" tag; "(pre-flight check 2026-10-14)" marks an anchor this pass re-read against today's code. The amendments of 2026-10-13 above are history: where they say "four own rows", "three contract hashes" or "seven cases", this section's lines win. Per-finding details: `.superpowers/sdd/2026-10-12-debate-shape-phase2d/preflight-corrections.md`.

Header and constraints:
- Architecture: `--register-next` takes the row with `--shape-policy`; S-8's arms run with `--register-next`; nine language cases, KEEP_MINE by default, the stored language; the review catch-up bullet (controller rulings D-REGNEXT, D-BOTHNEXT, D-CASES, D-CHOICE, D-CATCHUP; pre-flight PF-D1, PF-D2, PF-D25, PF-D26, PF-D27).
- Global Constraints: the practice version holds five own rows (the conformance hash added); with `--register-next` no version of its own is made; `--language-choice` defaults to `keep`; every practice debate of this branch runs with `--register-next` until the owners republish; architecture only as `pnpm exec vitest run tests/architecture --maxWorkers=2`, never `test:ci-gate` or the whole suite (pre-flight PF-D7, PF-D30, PF-D32; controller rulings D-REGNEXT, D-BOTHNEXT, D-CHOICE).
- Review Focus: item 1 names the five rows and the `--register-next` case; item 3 adds the not-argued and no-map cases; item 5 lists every user of the gate doubles; item 6 rewritten (the mix can miss its offer only on the fast check's side on the cases' own sites; eld settling shown on German; nine fast checks, every lock's source pinned); new item 7, the review catch-up (pre-flight PF-D1, PF-D3, PF-D7, PF-D11, PF-D12, PF-D20, PF-D22, PF-D25; controller rulings D-REGNEXT, D-NOTARGUED, D-SETTLE, D-CASES, D-CATCHUP).
- Contract deviations: 1 says what `--register-next` does with the row; 3's `<why>` list gains `MAP_ANSWERS_NOT_ARGUED` and `NO_MAP_STORED`; 6 names the one boot wrapper `readDebateShapeRunnerSettings`; 7 supersedes the conformance hash too (five own rows, moot with `--register-next`); 8 rewritten (the decider's exact lock, nine cases, the boot refusal, the planner as the map stores it, default `keep`, the widened `language` block) (pre-flight PF-D1, PF-D4, PF-D7, PF-D11, PF-D12, PF-D22–PF-D27; controller rulings D-REGNEXT, D-NOTARGUED, D-SETTLE, D-CASES, D-CHOICE).
- File Structure: the practice.ts, practice-register-import, practice-questions, practice-language, shape test and integration rows updated; three rows for Task 7c (pre-flight PF-D7, PF-D15, PF-D22, PF-D24, PF-D25; controller rulings D-REGNEXT, D-CATCHUP).

Task 0:
- Step 2: the boot grep expects `readDebateShapeRunnerSettings` in each boot, and a second grep finds the two inner names in `debate-shape-boot.ts` (pre-flight PF-D4).
- Step 2: the kernel grep expects five lines, `DEBATE_SHAPE_MARKS` included (pre-flight PF-D5).
- Step 3: greps for P2c's `mapAnswersArgued` and `storyAnswersNoteFrom`; Step 4: a baseline run of the practice integration file, alone, STOP if red (pre-flight PF-D6).

Tasks 1–3:
- Task 1 Step 7 expects 12 tests; Task 2 Step 4 16; Task 3 Step 4 18 (pre-flight PF-D9; Task 2 adds the `--register-next` case).
- Task 2 rewritten for `--register-next`: without it, `--shape-policy` publishes the practice's own version as planned; with it, practice.ts hands the policy to `composePracticeNextRegisterVersion` (new optional `debateShape`, passed to `buildPreviewSourceRowsV2`'s existing argument) and nothing more is published; Step 5(c) keeps today's block, the five pinned strings and both progress messages, and only widens the `const settings` expression; old Steps 5(d)/5(e) deleted (done in today's code); `shapeRowChange` names the row's change in either path; a guard refuses a policy the version does not carry; a unit case for the flag combination; `answer-writer-v3-register-12` in Step 6 (pre-flight PF-D1; controller ruling D-REGNEXT).
- Task 2: `PRACTICE_CODE_HASH_ROW_KEYS` holds `conformanceContractHash` too; the expected key order and the hash test follow (pre-flight PF-D7).
- Task 2 Step 5(a): one value import from `@debateai/register` replaces today's type-only line (pre-flight PF-D8).
- Task 2: what a shape debate does from this task on (one Haiku fast check, about $0.00013; site "en" before Task 7b); the red-first message; no `noUnusedLocals` (pre-flight PF-D10).

Task 4 and Task 5:
- Task 4: a shape run whose map answers were not argued (`mapAnswersArgued` false) is NOT_PROVEN `SHAPE_NOT_EXERCISED:MAP_ANSWERS_NOT_ARGUED`, its opening `TODAYS_OPENING`; tests, verdict doc and commit say so (pre-flight PF-D11; controller ruling D-NOTARGUED).
- Tasks 4 and 5: a fallen-back map still stores its choice (opening `TODAYS_OPENING`, 0 answers, 0 also raised); the stored opening also counts as map unavailable; a shape run with no stored choice is `NO_MAP_STORED`; the transcript's null-choice note reads "no map stored (…)" (pre-flight PF-D12).
- Task 4: marks counted on the served answer's latest version only (pre-flight PF-D13).
- Tasks 4 and 5: the verdict's `GATE_PAUSED` line gets its comma; the refused-ask return ends with `parallel: runner.callStats.summary()`; the comment names P2b's `MapChoiceRecord`; the depth literal on its own line; Task 5's fixture uses the real map record forms; anchors quoted from today's code (pre-flight PF-D14; pre-flight check 2026-10-14).
- Task 4 Step 6(c): `row: shapeRowChange`; Step 7 expects 23 tests (controller ruling D-REGNEXT; pre-flight PF-D9).
- Task 4 and the README: "called for extra graders" in place of "brought extra graders" (pre-flight PF-D19).

Task 6:
- The shape case proves the one fast check ran; the top comment's anchor is line 9; `stubMapContent`'s comment names all three choose quotas and its angles fallback is the question's own language; two more troubleshooting lines and the Task 2 pointer fixed (pre-flight PF-D15, PF-D11, PF-D12; controller ruling D-REGNEXT).

Task 7 (README and S-8):
- The README test checks `--register-next` on the new-shape command and both S-8 arms, and leaves S-6's debate line alone; the new-shape command and both S-8 arms carry it; S-8 says why, and that the upload ships with a new register version carrying the code's three hashes (P2b OWNER STEP PF-B13) (pre-flight PF-D2; controller ruling D-BOTHNEXT).
- "The new debate shape" says what `--shape-policy` does with and without `--register-next`; Step 3(d) keeps today's debate bullet word for word (its `--call-concurrency` text and its whole `--register-next` paragraph) and makes three insertions (pre-flight PF-D1, PF-D7; controller ruling D-REGNEXT).
- The pinned sentence sits on one line (pre-flight PF-D16).
- S-8 keeps one working folder in the home folder from day 1, with a dated copy of `$P/compare` each day (pre-flight PF-D17).
- S-8 checks that the story retells the answers note (pre-flight PF-D18).
- Cost about $1.9 to $4.3 (up to about $6 with reruns), plus the fast check's $0.00013 a shape debate; the shape's room read from the first run's admission figures; the time names the call setting, the same for both arms; the exit-30 row names `SHAPE_NOT_EXERCISED` (and the blank line that split the exit table goes); one line lists the owners' separate switch-on steps; the C-TWO clause on `alsoRaised` (pre-flight PF-D19, PF-D10; pre-flight check 2026-10-14).
- The reasons list gains `MAP_ANSWERS_NOT_ARGUED` and `NO_MAP_STORED`; Step 4 expects 26 tests (pre-flight PF-D11, PF-D12, PF-D9).

Task 7b (the question language):
- Every case keeps its real site; ro, en and id are always-ask (ruling L-KEEP), so eld settles no case; the unit tests settle eld on German only, pin `lang-ro-plain` as FAST, and build the "mix settled" FAIL synthetically on German; the STOP notes and the integration comment reworded; the integration case pins every lock's source (pre-flight PF-D20; controller ruling D-SETTLE).
- `EldReading` carries `segments`; a failing eld is no reading, as in the decider (pre-flight PF-D21).
- The lock exactly as the decider: `decideBeforeFast`, the 409 body check (`QuestionLanguageChoiceNeeded.from`), the record code and skip suffix; `rewriteRefusal` and `recordCode` recorded; the FAIL reason carries the record code (pre-flight PF-D22).
- The planner read as the map stores it (`practicePlannerLanguage`, `mapPrimarySubtag`); no cast; an old map's planner reads null (pre-flight PF-D23).
- The API's boot refusal for the policy row runs before anything is sent; the parser's path is the refusal's detail (pre-flight PF-D24).
- Nine cases: `lang-zh-short` (site en, fast check off, locks zh from its script) and `lang-ku-arab` (Sorani on the Arabic site, locks ku); `PracticeLanguageCase.fastCheck?: "OFF"`; table, dry readings, counts and README follow (pre-flight PF-D25; controller ruling D-CASES).
- `--language-choice` defaults to `keep` (KEEP_MINE); S-8's mix debate passes `use` so the rewrite runs once (pre-flight PF-D26; controller ruling D-CHOICE).
- The debate's `language` block gains the record code, the local reason, the fast reading and the language the run was stored with; one new unit test (16 in all) (pre-flight PF-D27).
- Time "about 5 to 20 minutes"; "Four modes" in the README and practice.ts (pre-flight PF-D28).
- The dry planner-FAILED expectation and the moot notes removed; the interrupted-run note; S-8 item 3 runs on day 1; the import cycle named (pre-flight PF-D29).
- Step 7(c) re-anchored on Task 2's refusal block; the mix debate command carries `--register-next` and the README test checks it (pre-flight PF-D1; controller ruling D-BOTHNEXT).
- Step 11's import fallback removed: `@debateai/api` exports both names today (pre-flight check 2026-10-14).

Task 7c (new):
- The operator's review catch-up (`runReviewCatchUp`, `job:review-catch-up`) takes the run's lock for shaped runs exactly as the runner's own reviews do: the job hands it the run's receipt and stored tag, and the catch-up decides with `runQuestionLanguageLock` (ruling L-SHAPED-ONLY); today's runs keep today's review byte for byte; P2L's M15 pin, never added before, is added in its moved form in `tests/unit/runner-question-language.test.ts` (controller ruling D-CATCHUP).

Task 8 and the Self-review:
- Task 8 runs every unit file that reads a module P2d edits or the gate doubles (incl. `answer-writer-v3-register-12`, `mimo-salvage`, `story-format-robustness`, `preview-practice-side-by-side`, Task 7c's three), each alone; architecture once, bounded, with the known F31 row; the practice integration file (33 cases), then the gate-double users and the suites CI skips, one at a time: `preview-busy-model-run`, `parallel-calls-debate`, `debate-shape-run`, `debate-shape-row-absent`, `language-check-spend`, `hosted-register-publish`, `map-choice-repository` (pre-flight PF-D3, PF-D30, PF-D32; controller ruling D-CATCHUP).
- Self-review: rows for PF-D1, PF-D2, PF-D3, PF-D7, PF-D11/12, PF-D18, PF-D20–PF-D27, D-CATCHUP, and P2b's test debts deferred on purpose (pre-flight PF-D31).

New decisions taken in this pass (cost if wrong in brackets):
- `NO_MAP_STORED`: a shape run with no stored map choice is NOT_PROVEN [one chain step, one test line, one README line].
- A stored opening `TODAYS_OPENING` counts as map unavailable even without the mark [none: the map stored it itself].
- `PRACTICE_SHAPE_POLICY_NOT_PUBLISHED`: a `--shape-policy` debate whose version holds no row is refused [none for practice.ts, which always passes the policy].
- `lang-ku-arab` stays under eld's 30-letter floor, so the fast check decides it; whether eld would settle a LONGER Sorani question on the Arabic site as Arabic is not tested [owner/P2L note; the real run shows Haiku's answer].
- Task 7c's two inputs are optional; only the pin, not the type, makes a new caller pass them [12 test calls if made required].

## Global Constraints

**Where and what**

- Work only in this worktree's engine folder. Never touch the main checkout.
- Never read `settings.env`, a register export from a server, or any key file. The tests write their own fixture settings.
- Owner sessions share worktrees: commit only the files the task names, never an edit you did not make.

**Order**

- Run this plan LAST: after P2a, P2b, P2c and P2L (all of P2L's tasks, Tasks 18 and 19 included) are merged into this branch (INTERFACE; P2L "Execution order" item 7). Task 0 checks this and stops on any gap.

**The throwaway register only**

- `--shape-policy` never writes the export file and never connects to anything but the throwaway database.
- The practice's own version is published with `deployment: "local"` and the source ref `PRACTICE_SHAPE_SOURCE_REF`. It holds five rows of its own: the debate-shape row (source ref `PRACTICE_SHAPE_SOURCE_REF`) and the code's four contract-hash rows, which keep the dev builder's own source ref `DEVELOPMENT_RUNNER_SOURCE_REF` because the runner's policy reader refuses those rows from any other source (controller ruling D-SOURCEREF) (`composerContractHash`, `conformanceContractHash`, `judgeContractHash`, `mapContractHash`, from `buildDevelopmentRunnerRegisterRows()`; P2b ruling X3; pre-flight PF-D7: the runner's boot compares judge, composer AND conformance). Every other row keeps its exported bytes and its exported source ref.
- With `--register-next` no practice version of its own is made: the code's next version (already published in the throwaway database by `importPracticeRegister`) carries the row, built by the preview publish kit's own source build with the policy as its `debateShape` (controller ruling D-REGNEXT; pre-flight PF-D1).

**Row absent means today**

- Without `--shape-policy`, on a register without the row (or with a row that is not in force, `debateShapeInForce` false), the debate command, the ask, `report.json`'s keys, `report.md` and `transcript.json`'s keys stay as today.
- There is no `shape` key, no `language` key, no `structure.map` key, no MAP site, and the ask carries no `site_language`.

**Flags**

- The six new debate flags (`--shape-policy`, `--depth-mode`, `--scrutiny`, `--answer-length`, `--site-language`, `--language-choice`) are debate-only. Every other mode refuses them with `PRACTICE_FLAG_VALUE_INVALID: <flag> (debate mode only)`. `--language-choice` defaults to `keep` (KEEP_MINE; controller ruling D-CHOICE).
- `--shape-policy` works with or without the existing `--register-next` switch (controller ruling D-REGNEXT). Until the owners republish the register, every practice debate of this branch is run with `--register-next` (controller ruling D-BOTHNEXT).
- The new mode `language` (Task 7b) reads only `--out`, `--settings`, `--gate-status-deepinfra`, `--gate-status-anthropic`, `--register-export` and `--dry`; any other flag is refused there with `PRACTICE_FLAG_VALUE_INVALID: <flag> (not read by language)`.
- An unknown flag stays `PRACTICE_FLAG_UNKNOWN`, refused before anything starts. A refused value is never repeated in output.
- A policy refusal names only the place in the file (the zod path), never the file's content.

**Source rules** (tools/orphan-audit `auditSourceRules`, pinned by tests/architecture/scaffold.test.ts). Keep them in every new or edited `.ts` under `tools/`:

- no `process` + `.env` text, even in a comment (the practice reads its three environment keys only through `readOperatorCommandEnvironment`);
- no `switch (` in new code (use lookups or `if` chains);
- no exported ALL_CAPS constant equal to a bare number;
- no import specifier containing `test` or `fixture` in `tools/` code.

**Depth-literal oracle.** Keep any bare `5` off a line that mentions "depth" in any case.

**What people see.** `report.md` shows counts and codes only, never reply text. The README says what the procedure does, never how results are judged: "results are judged by the owners' private method, outside this repository".

- One exception, the language mode (Task 7b): for each case that was offered a rewrite, `report.md` shows our own fixed case question and the fast check's rewrite side by side, because the owners judge whether the rewrite keeps the meaning (P2L amendment P2d-4). Nothing else in it is question or reply text.
- `language.jsonl` never holds a case's question text (a SHA-256 of it instead); a rewrite is reply text and goes through `reportableReplyText`, as `openings.jsonl` does with replies.
- The planner's language disagreement (CR-3) is operator-only: it is recorded in the practice's own report and never expected or counted as a condition mark.

**Running tests** (one heavy test run at a time on the owner's 16 GB Mac):

- Before any `vitest run` or typecheck, `pgrep -fl 'vitest[ ]run'` shows at most one other run (count runs, not processes), and `memory_pressure | tail -1` shows free memory of at least 40%.
- Integration suites run ONE AT A TIME, never beside a unit run or the typecheck.
- Commands:
  - unit: `pnpm exec vitest run tests/unit/<file>.test.ts`;
  - integration: `pnpm exec vitest run tests/integration/<file>.test.ts` (embedded PostgreSQL), optionally with `-t "<name part>"`;
  - typecheck: `pnpm run typecheck`;
  - architecture: only as `pnpm exec vitest run tests/architecture --maxWorkers=2`, alone (pre-flight PF-D30, PF-D32; ruling C-GATE).
- Never `pnpm test:ci-gate` and never the whole suite on the Mac. CI judges the full suite. The integration suites CI skips (the database suites) are run by hand, one at a time, in Task 8 (pre-flight PF-D3).

**Commits.** Each commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push and do not open a PR inside this plan.

**Subagents.** Haiku runs with effort `xhigh` for mechanical jobs; Opus runs with effort `high` for hard ones. Every Opus subagent prompt says it may spawn its own haiku/opus subagents and should when useful. Subagents run in the foreground.

## Review Focus

Seven failure modes that ordinary tests would miss. Each one has a named test in the task that owns it.

1. **The override leaks out of the throwaway database, or quietly changes other settings.**
   - Ways it could happen:
     - the export file is rewritten;
     - a copied row gets the practice's source ref or a new byte (other than the five rows the practice writes on purpose; pre-flight PF-D7);
     - with `--register-next`, a second version is published on top of the code's next one and undoes every row it changed (pre-flight PF-D1);
     - the contract-hash rows are not the code's, so the runner refuses to boot or stamps calls with a hash that does not describe them;
     - the debate runs on the export's own version number while the report claims the practice version.
   - Tests:
     - Task 2, `adds the row to the export's LAST version's rows, keeps every other row byte for byte, in key order`;
     - Task 2, `supersedes the judge, composer and conformance hashes and adds the map hash, all four the code's own (the dev builder's)` (pre-flight PF-D7);
     - Task 2, `--register-next with --shape-policy: the code's next version carries the row, from the kit's own source build` (controller ruling D-REGNEXT);
     - Task 6, `--shape-policy … PASS` (the export file's SHA-256 is unchanged; `shape.registerVersion` and the transcript's `run.registerVersion` are both `"6"`).
2. **The ask path and the runner read different register versions.**
   - The ask stores `{ depth }` while the runner argues the new shape, or the other way round. The money estimate then no longer matches the run.
   - Test: Task 6, `--shape-policy … PASS`. It checks that `storedDepthParams` holds all four keys (the ask path saw the row), `sizes` is not null (admission froze a shape), and MAP calls happened (the runner ran it).
3. **A "new shape" practice that never ran the new shape reads as PASS.**
   - Example: the map fell back to today's opening; the map gave fewer than two answers, so today's opening was argued (ruling C-TWO, controller ruling D-NOTARGUED); no map was stored; or admission froze no shape (pre-flight PF-D11, PF-D12).
   - Tests: Task 4, `says when the new shape was not exercised` and `a shape run that did not exercise the shape is NOT_PROVEN, never PASS`.
4. **Map calls fall outside the practice's own accounting.**
   - Today `callFamilyOf("MAP:list:0")` is `UNMAPPED` and its re-check says `UNMAPPED`, so a map slip would be diagnosed wrongly and rows would sort as unknown.
   - Tests:
     - Task 3, `names the map family and step from the call-site key` and `re-checks a map reply by its step's own schema`;
     - Task 6 (a `MAP` row in `byModelAndSite`, MAP attempts in the transcript).
5. **The row-absent practice drifts from today.**
   - Ways it could drift: a `shape: null` key, a changed `ask` block, an `also_raised` field sent to the storyteller, or the stubs' new MAP classification catching a request it used to answer.
   - Tests:
     - Task 6, `no --shape-policy and a register without the row: today's shape, nothing new in the report, no map call`;
     - Task 8, which re-runs the whole practice integration file and the other users of the gate doubles, each alone: the integration suites `preview-busy-model-run`, `parallel-calls-debate`, `debate-shape-run` and `debate-shape-row-absent`, and the unit files `preview-practice`, `preview-practice-slips`, `practice-openings` and `runner-question-language` (pre-flight PF-D3).
6. **The language practice passes when it proved nothing, or counts what it must not.**
   - Ways it could happen:
     - the fast check was down and the lock came from a fallback, yet the case reads PASS;
     - the mixed question is not offered a rewrite and nobody notices. On the cases' own sites this can only come from the fast check's side: its rewrite refused under ruling L-REWRITE, or an offer body the contract refuses. Ro, en and id are always-ask sites (ruling L-KEEP), so eld never settles a case there (pre-flight PF-D20);
     - eld settles a mixed question on a site that is not always-ask, because its clause rule (L-MIX) missed the mix. No practice case can show this (controller ruling D-SETTLE: every case keeps its real site), so a unit test builds it on German;
     - the practice's lock differs from the decider's: no 409 body check, no record code (pre-flight PF-D22);
     - the fast check is skipped when eld settles, or when a case is worked out with the fast check off, so its reading is never recorded;
     - the planner's naming (CR-3, operator-only) changes the verdict, or is expected as a condition mark.
   - Tests:
     - Task 7b, `a fast check that was down makes the case NOT_PROVEN, even with the right lock`, `a wrong lock or a mix that was not offered is FAIL` (a rewrite refused under L-REWRITE on `lang-ro-en-mix`, and eld settling a mix on German) and `the planner's naming is recorded and never counts`;
     - Task 7b, `the lock is computed exactly as the decider does, from recorded readings` (eld settles on German only, never on an always-ask site; an offer body the contract refuses; the fast check off);
     - Task 7b integration, `language mode: … the fast check asked for every case …`: nine fast-check requests, one per case, whatever eld said; every lock's source pinned, with none from eld alone (pre-flight PF-D25, controller ruling D-CASES).
7. **The operator's review catch-up talks to a shaped run in the vague form, or a fix for it changes today's runs** (controller ruling D-CATCHUP).
   - Tests: Task 7c, `a shaped receipt tells the review its locked language…`, `a shaped receipt's review is checked in the lock…`, `no receipt, or a receipt with no shape: today's review input, byte for byte…` and the pin `the operator job passes the run's envelope basis and tag…`.

## Contract deviations

From INTERFACE §6 and Project 1's pattern. Each is deliberate.

1. **A register version, not a value handed to the runner.**
   - Project 1's `--call-concurrency` hands its policy straight to the practice runner and writes no register.
   - The debate-shape row is read by BOTH the ask path (P2a: normalisation, sizes, the estimate) and the runner (P2b). So the practice publishes one more version (export's last + 1) in the throwaway database and runs both compositions on it, as INTERFACE §6 says ("adds a `debateShapePolicy` row to the THROWAWAY database's register only").
   - The settings file's `REGISTER_VERSION` must still equal the export's last version; only the practice's in-memory copy of the settings moves to the new number.
   - With `--register-next` the tool already publishes one more version (the code's next one, composed by the preview publish kit). The row then goes into that version, through the kit's own `debateShape` argument, and the practice publishes nothing more (controller ruling D-REGNEXT). Publishing a second version on top would have undone every row the code's next version changed (pre-flight PF-D1).
2. **More in the report block than INTERFACE §6 lists.** INTERFACE names map marks, chosen answers count, also-raised count, panel extensions and scrutiny extensions. The task also needs the opening used and per-step map call counts. The block also carries `source`, `registerVersion`, `row`, `asked`, `storedDepthParams`, `sizes` and `notExercised`, so each comparison run says exactly what it ran on.
3. **A new verdict reason.** `SHAPE_NOT_EXERCISED:<why>` makes a run NOT_PROVEN (exit 30). `<why>` is `MAP_UNAVAILABLE_TODAYS_OPENING` (the map's mark, or its stored choice's opening `TODAYS_OPENING`; pre-flight PF-D12), `MAP_ANSWERS_NOT_ARGUED` (the map gave fewer than two answers, so today's opening was argued: ruling C-TWO, read with P2c's `mapAnswersArgued`; controller ruling D-NOTARGUED, pre-flight PF-D11), `NO_MAP_STORED` (a shape run with no stored map choice; pre-flight PF-D12), `NO_SHAPE_ON_RECEIPT` or `FACTS_UNREADABLE:<code>`. Map fallbacks other than the whole map failing (`MAP_MERGE_FALLBACK` and the rest) do not change the verdict: a failed call is already FAIL by the format and call rules, and a busy seat follows the busy rules.
4. **`--question` gains the comparison's four fixed ids:** `ro-euro`, `ro-strainatate`, `en-nuclear`, `en-social-media-age`.
   - They are word for word the openings questions of the same id, so the Phase 1 data lines up.
   - The question is now checked before anything starts. A wrong id was a late `TypeError:PRACTICE_QUESTION_UNKNOWN`; it is now `PRACTICE_FLAG_VALUE_INVALID: --question (…)`.
5. **The three ask flags need a row.** Without a debate-shape row, P2a's normalisation would drop them silently. So the practice refuses them (`PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW`) after the import and before any model call.
6. **P2b names this plan uses.** INTERFACE §4 names only `readMapChoiceForRun(runId)`. P2b (Tasks 6 and 8; cross-plan P2d-1) settles the rest; Task 0 checks each one:
   - `@debateai/map` (file `packages/map/src/repository.ts`, NOT `@debateai/db`) exports `readMapChoiceForRun(pool, runId)`, returning `MapChoiceRecord` (`opening`, `answers[]`, `alsoRaised[]`, `marks`) or `null`;
   - `@debateai/map` exports `readMapItemsForRun(pool, runId)`, returning the decrypted items;
   - `@debateai/map` exports the class `MapChoiceRepository`, whose method `readMapResultForRun(runId)` returns the whole stored `MapResult` (with P2L's `plannerLanguage` and its `notes`) or `null`; there is no free-function form of it;
   - the extension and map marks land in `serve.condition_mark` under their INTERFACE codes;
   - `apps/runner/src/main.ts` AND `tools/preview-practice/practice-runner-composition.ts` boot the shape with the one wrapper `readDebateShapeRunnerSettings(pool, version)` (`apps/runner/src/debate-shape-boot.ts`), which reads the row and then calls `resolveDebateShapeRunnerSettings({ policy, mapContractHash: await readMapContractHash(pool, version), codeMapContractHash })`; and the Phase-2a guard is gone from every site (pre-flight PF-D4).

   If P2b's readers have another form, only the adapter `practiceMapReaders` in `practice-shape.ts` (and `readPracticeMapLanguage` in `practice-language.ts`, Task 7b) changes; report that change. If a reader is missing, STOP: this plan never adds code to P2b's encrypted map carriers.
7. **The practice version carries the code's contract hashes** (reversed by P2b; ruling X3, P2b cross-plan P2d-2). P2b's runner (and the practice runner composition, which mirrors it) refuses a `debateShapePolicy` row without a sealed `mapContractHash` equal to the code's (`DEBATE_SHAPE_MAP_HASH_UNSEALED` / `MAP_CONTRACT_HASH_MISMATCH`). The live preview register has no `mapContractHash` until the owners publish one (P2b owner steps; not before P2L Task 15), and its judge and composer hashes describe the LIVE code, not this candidate code. So the practice version supersedes `judgeContractHash`, `composerContractHash` and `conformanceContractHash` with the code's values and adds `mapContractHash`, all four taken from `buildDevelopmentRunnerRegisterRows()` (`apps/runner/src/dev-deployment-register.ts`), in the throwaway database only. The runner's boot check (`assertRegisterPromptContractHashes`, `apps/runner/src/index.ts:694-708`) compares judge, composer AND conformance, so all three must be the code's (pre-flight PF-D7). The export file and the live register are untouched; the practice's version is published with `PRACTICE_SHAPE_SOURCE_REF`, and so is its debate-shape row; the four hash rows keep `DEVELOPMENT_RUNNER_SOURCE_REF`, the source ref `readDevelopmentRunnerPolicy` requires (controller ruling D-SOURCEREF). With `--register-next` this is moot: the code's next version already carries the code's hashes, and the row goes into it (controller ruling D-REGNEXT).
8. **The question language (P2L amendments P2d-2..P2d-6, adjusted for CR-3; Task 7b).**
   - A new mode `language`, with no debate and no database. For each fixed case: eld's reading, the fast check, and one `MAP:angles` call. The fast check is always asked, so its reading is recorded even when eld settles, and even for a case worked out with the fast check off.
   - The lock is computed exactly as the decider computes it (pre-flight PF-D22): `decideBeforeFast`, then `decideAfterFast`; an offer only when the contract's 409 body accepts it (`QuestionLanguageChoiceNeeded.from`), else the main language as `FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED`; and the decider's record code (`decisionRecordCode`, with the rewrite refusal of ruling L-REWRITE).
   - Nine fixed cases (pre-flight PF-D25, controller ruling D-CASES): P2L's table of seven, plus the two cases the P2L final review asked for. `lang-zh-short` is a short Chinese question worked out with the fast check off (I3). `lang-ku-arab` is Sorani Kurdish in Arabic letters on the Arabic site (I1). Every case keeps its real site. Ro, en and id are always-ask sites (ruling L-KEEP), so eld never settles a case there; eld's settling is proved by unit tests on German only (pre-flight PF-D20, controller ruling D-SETTLE).
   - The pass bar is mapped onto this tool's verdicts:
     - a wrong lock, or a real-mix case without an offer, is FAIL (the reason carries the record code);
     - a case whose fast check was DOWN, and whose lock therefore came from a fallback, is NOT_PROVEN;
     - otherwise PASS.
     Whether a rewrite keeps the meaning is the owners' read of `report.md`.
   - The policy row goes through the API's own boot refusal (`assertQuestionLanguagePolicyBootable`) before anything is sent; a row the parser refuses names only its path (pre-flight PF-D24).
   - The planner's naming and any disagreement are recorded only (CR-3: an operator-only map NOTE `LANGUAGE_PLANNER_DISAGREES`, never a condition mark), read the way the map stores them (pre-flight PF-D23), and never count.
   - `language` mode adds `--dry` (scripted answers, nothing spent), as openings has, so the final verification can run it.
   - Debate mode gains `--site-language` and `--language-choice` (default `keep`, that is KEEP_MINE, as the P2L final review asks; controller ruling D-CHOICE). They need a debate-shape row in force, as the three ask settings do (deviation 5), because without the row the ask ignores them. The debate report's `language` block says why the lock was made (its record code, its local reason, the fast reading) and which language the run was stored with (pre-flight PF-D27).
9. **A row that is not in force is no row** (P2b's optional `enabled`, the preview's rollback). The practice reads the register's row through `debateShapeInForce`, as the API does. `shape-policy-start.json` never writes `enabled` (start values = on), and a `--shape-policy` file that switches the row off is refused (`PRACTICE_SHAPE_POLICY_INVALID: enabled`): it could never run the new shape.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `tools/preview-practice/practice-shape.ts` | create | The four flags (`practiceShapeOverrideFromArgs`); the shape facts reader, the report block and its plain lines; the map readers adapter |
| `tools/preview-practice/shape-policy-start.json` | create | The owners' start values (S5–S8) as a policy file for `--shape-policy` |
| `tools/preview-practice/practice-questions.ts` | modify | `PRACTICE_COMPARISON_QUESTION_IDS`, `practiceDebateQuestion`; Task 7b: `PracticeLanguageCase`, `PRACTICE_LANGUAGE_CASES` (the nine fixed language cases; pre-flight PF-D25), language case ids accepted by `practiceDebateQuestion` |
| `tools/preview-practice/practice-language.ts` | create (Task 7b) | Mode `language`: the run (the API's boot refusal for the policy row, eld, fast check, one `MAP:angles` each), the lock as the decider computes it (with its record code), the per-case record, the verdict, `language.jsonl`, the report block and its lines, the `--dry` ports; debate mode's `--site-language` / `--language-choice`, the resubmission after an offer, the debate report's `language` block and the planner facts reader |
| `tools/preview-practice/practice.ts` | modify | Flags known, checked before anything starts, handed to the debate; Task 2: with `--register-next`, the `--shape-policy` policy handed to `composePracticeNextRegisterVersion` (controller ruling D-REGNEXT); Task 7b: mode `language` (real and `--dry`), the two debate language flags |
| `tools/preview-practice/practice-register-import.ts` | modify | `practiceShapeVersionRows` (with the code's four contract-hash rows; pre-flight PF-D7), `practiceCodeContractHashRows`, `PRACTICE_CODE_HASH_ROW_KEYS`, `publishPracticeShapeVersion`, `PRACTICE_SHAPE_SOURCE_REF`; `composePracticeNextRegisterVersion` gains an optional `debateShape` (controller ruling D-REGNEXT) |
| `tools/preview-practice/practice-debate.ts` | modify | Publish the practice version, run both compositions on it, ask fields, shape block, transcript map, `MAP` roster order; Task 7b: `site_language`, the offer answered and resubmitted, `onQuestionLanguage`, the `language` block |
| `tools/preview-practice/practice-lanes.ts` | modify | `MAP` call family, `practiceMapStepOf`, map re-check |
| `tools/preview-practice/practice-openings-dry.ts` | modify (Task 7b) | Export `openingsDryVendorReply` (the language `--dry` ports reuse it) |
| `tools/preview-practice/practice-verdict.ts` | modify | `shapeNotExercised` → NOT_PROVEN |
| `tools/preview-practice/practice-report.ts` | modify | `shape` in report.json, "Debate shape" lines in report.md; Task 7b: `language` in report.json, the language lines in report.md (both modes) |
| `tools/preview-practice/practice-transcript.ts` | modify | Optional `structure.map` |
| `tools/preview-practice/README.md` | modify | "The new debate shape" section, flags, files, S-8 comparison procedure, money and time; Task 7b: "The question language" section, the language mode, the `lang-ro-en-mix` debate before the upload |
| `tests/support/preview-gate-stubs.ts` | modify | Builds on P2b Task 15's `"MAP"` kind: the default MAP answer `stubMapContent`; the `"QUESTION_LANGUAGE"` kind and its default answer `stubQuestionLanguageContent` |
| `tests/unit/preview-practice-shape.test.ts` | create | Tasks 1–4 and 7 unit tests (Task 2 includes the `--register-next` with `--shape-policy` case, controller ruling D-REGNEXT) |
| `tests/unit/preview-practice-language.test.ts` | create (Task 7b) | The case table, the lock over recorded readings, the fast-check record, the verdict mapping, the report lines, the flags, the resubmission, the dry reading, the README's language commands |
| `tests/unit/preview-practice-transcript.test.ts` | modify | `structure.map` present only with a map |
| `tests/integration/preview-practice-run.test.ts` | modify | New describe: the new debate shape (Task 7b adds the shape case's `language` block check; pre-flight PF-D15); Task 7b: new describe: language mode against the scripted gates |
| `apps/runner/src/index.ts` | modify (Task 7c) | `runReviewCatchUp` takes the run's receipt and stored tag and locks a shaped run's catch-up reviews with `runQuestionLanguageLock`, as the runner's own reviews; `ReviewCatchUpReviewer.review` carries `questionLanguage` |
| `acceptance/review-catch-up.ts` | modify (Task 7c) | The operator job hands the catch-up the run's `envelopeBasis` and `argumentLanguageTag` from its frozen head |
| `tests/unit/runner-question-language.test.ts` | modify (Task 7c) | The catch-up's lock: today's review input byte for byte without a shaped receipt; the sentence, the field and the reply check with one; the pins moved (three `runQuestionLanguageLock(` calls; the job's one call passes both fields) |

---

### Task 0: Preconditions: P2a, P2b, P2c and P2L are in this branch

**Files:** none edited.

- [ ] **Step 1: Project 1 and P2a**

Run: `git merge-base --is-ancestor feat/2026-10-12-parallel-calls HEAD && echo P1-IN`
Expected: `P1-IN`.

Run: `grep -n "export function parseDebateShapePolicy\|export function debateShapePolicyStartValues\|export function debateShapePolicyRow\|export async function readDebateShapePolicy" packages/register/src/debate-shape-policy.ts`
Expected: four lines.

Run: `grep -n "readDebateShapePolicy" tools/preview-practice/practice-ask-composition.ts`
Expected: at least one line (P2a Task 8 step 6).

Run: `grep -n "shape?: DebateShapeCeilingInput\|readonly shape?" packages/budget/src/index.ts`
Expected: at least one line (P2a: `CostEnvelopeBasis.shape`).

- [ ] **Step 2: P2b**

Run: `grep -n "export function readMapChoiceForRun\|export function readMapItemsForRun\|export class MapChoiceRepository\|readMapResultForRun(runId" packages/map/src/repository.ts`
Expected: the two free functions taking `(pool, runId)`, the class, and its method `readMapResultForRun(runId: string)` (P2b Task 8; cross-plan P2d-1). They are exported from `@debateai/map` (`packages/map/src/index.ts` has `export * from "./repository.js";`), NOT from `@debateai/db`.

- If a reader has another form, note its exact form. Task 4 then adapts only `practiceMapReaders`, and Task 7b only `readPracticeMapLanguage`.
- If a reader is missing, STOP and report BLOCKED with the output.

Run: `grep -n "readDebateShapeRunnerSettings" apps/runner/src/main.ts tools/preview-practice/practice-runner-composition.ts`
Expected: the import and the call `const debateShape = await readDebateShapeRunnerSettings(pool, environment.REGISTER_VERSION);` in EACH file (main.ts ~56 and ~135; the practice runner composition ~77 and ~130). Both boots call the one wrapper; they never name the two inner functions themselves (pre-flight PF-D4). If the practice runner composition lacks the call, STOP: P2b must mirror main.ts there (the wiring-drift rule). A bare `readDebateShapePolicy` line proves nothing here: it was already there in Phase 2a, feeding the guard.

Run: `grep -n "resolveDebateShapeRunnerSettings\|readMapContractHash" apps/runner/src/debate-shape-boot.ts`
Expected: both names (the wrapper reads the row, then the sealed map hash only when the row is present, and resolves the shape settings: P2b Task 6) (pre-flight PF-D4).

Run: `git grep -n "assertDebateShapeRunnerReady\|refuseDebateShapeReceiptInPhase2a\|debate-shape-runner-pending" -- apps tools packages`
Expected: no output. P2b removed the Phase-2a guard at EVERY site: `apps/runner/src/main.ts`, `tools/preview-practice/practice-runner-composition.ts`, `apps/runner/src/hosted-register-publish.ts` (`verifyHostedRegisterBootReadiness`), `apps/api/src/main.ts` (the boot step `debate-shape-runner-pending`; the step `debate-shape-policy` that READS the row stays), `tools/preview-practice/practice-ask-composition.ts`, the runner's per-run `refuseDebateShapeReceiptInPhase2a` in `apps/runner/src/index.ts`, and the export in `packages/register`. If any line prints, STOP and report it.

Run: `grep -n "mapContractHash" apps/runner/src/dev-deployment-register.ts`
Expected: at least one line (P2b Task 6: `computeDevelopmentContractRows` seals `mapContractHash: mapPromptContractHash()`). Task 2 copies it, with the judge, composer and conformance hashes, into the practice version (Contract deviation 7; pre-flight PF-D7). If nothing prints, STOP and report.

Run: `git grep -n "export function debateShapeInForce" -- packages apps`
Expected: one line (P2b: the optional `enabled` member; `enabled: false` means the API treats the row as absent). Note the package it is exported from; Tasks 1 and 2 import it from there (`@debateai/register` if it lives in `packages/register/src/debate-shape-policy.ts`). If it is missing, STOP and report.

Run: `ls migrations/*_debate_shape_map.sql`
Expected: one file, `migrations/0116_debate_shape_map.sql` unless it was renumbered at merge (P2b cross-plan P2d-6). The throwaway database's `migrate(pool)` applies it like any other.

Run: `grep -n "\"PANEL-CLOSE-CALL-EXTENDED\"\|\"SCRUTINY-EXTENDED\"\|\"MAP_UNAVAILABLE_TODAYS_OPENING\"\|\"ANSWERS_FILLED\"" packages/kernel/src/index.ts`
Expected: five lines: four in `CONDITION_MARKS` (~163, ~164, ~166, ~167), plus `DEBATE_SHAPE_MARKS` (~244), which holds all four codes on one line (pre-flight PF-D5).

- [ ] **Step 3: P2c**

Run: `grep -n "also_raised" packages/story/src/material.ts | head -3`
Expected: at least one line (the storyteller's `also_raised` field).

Run: `grep -n "export function mapAnswersArgued" packages/map/src/choose.ts`
Expected: one line (P2c fix wave M-1, ruling C-TWO: Task 4 reads it; pre-flight PF-D6).

Run: `grep -n "export function storyAnswersNoteFrom" apps/runner/src/story-snapshot.ts`
Expected: one line (P2c, ruling C-STORY: S-8 checks the story retells its note; pre-flight PF-D6).

- [ ] **Step 3b: P2L, all of it (P2d runs last)**

Run: `grep -n "questionLanguageSentence" packages/kernel/src/question-language.ts`
Expected: at least one line (P2L Task 1; P2L amendment P2d-1).

Run: `ls apps/api/src/question-language/decider.ts apps/api/src/question-language/decide.ts apps/api/src/question-language/eld.ts apps/api/src/question-language/eld-tuning.ts apps/api/src/question-language/fast-check.ts apps/api/src/question-language/transport.ts apps/ui/components/QuestionLanguageChoice.tsx`
Expected: all seven files (the decider, P2L Tasks 2, 3, 5, 6, 7 and 10, and the pop-up, P2L Task 18).

Run: `grep -n "onQuestionLanguage" tools/preview-practice/practice-ask-composition.ts`
Expected: at least one line (P2L Task 12: the optional composition argument wired to the decider's `onDecided`).

Run: `grep -n "\"LANGUAGE_PLANNER_DISAGREES\"" packages/map/src/types.ts packages/kernel/src/index.ts`
Expected: exactly one line, in `packages/map/src/types.ts` (in `MAP_NOTES`), and none in the kernel: under controller ruling CR-3 the planner's disagreement is an operator-only map NOTE (`{ note: "LANGUAGE_PLANNER_DISAGREES", step: "ANGLES", detail: "<locked code>:<planner code>" }`), never a condition mark. If it is in `CONDITION_MARKS`, STOP and report.

Run: `grep -n "plannerLanguage" packages/map/src/types.ts`
Expected: one line (`MapResult.plannerLanguage: string | null`, stored in `core.map_choice` content and read back by `readMapResultForRun`).

Run: `grep -n "QuestionLanguageChoiceNeeded\|export const ASK_QUESTION_MAX_BYTES" apps/api/src/index.ts | head -5`
Expected: `ASK_QUESTION_MAX_BYTES` exported and `QuestionLanguageChoiceNeeded` re-exported (P2L Task 11), so `tools/` can import both from `@debateai/api`.

- [ ] **Step 4: The practice tests are green before any edit**

Check memory and runs as the Global Constraints say, then run: `pnpm exec vitest run tests/unit/preview-practice.test.ts`
Expected: PASS. If it is red before any edit, STOP and report: this plan does not repair others' reds.

Then, alone, nothing else running: `pnpm exec vitest run tests/integration/preview-practice-run.test.ts`
Expected: PASS (28 cases). Task 6 extends this file, and it has not been run since P2L Task 17 changed the gate doubles (P2a recorded 4 pre-existing reds here; #157's fix is in the branch). If it is red, STOP and report (pre-flight PF-D6).

---

### Task 1: The four debate flags, the start-values file and the comparison questions

**Files:**
- Create: `tools/preview-practice/practice-shape.ts` (flags part)
- Create: `tools/preview-practice/shape-policy-start.json`
- Modify: `tools/preview-practice/practice-questions.ts`
- Modify: `tools/preview-practice/practice.ts` (`VALUE_FLAGS`, the checks after `--dry`, the `runPracticeDebate` call)
- Test: `tests/unit/preview-practice-shape.test.ts` (create)

**Interfaces:**
- Consumes: `parseDebateShapePolicy`, `DebateShapePolicy` (P2a, `@debateai/register`); `debateShapeInForce` (P2b, from where Task 0 found it; the import line below assumes `@debateai/register`); `DepthModeSchema`, `ScrutinySchema`, `AnswerLengthSchema`, `DepthMode`, `Scrutiny`, `AnswerLength` (P2a, `@debateai/contract`); `OPENINGS_QUESTIONS` (practice-openings-questions.ts); `PracticeRefusal` (practice-settings.ts).
- Produces:
```ts
// tools/preview-practice/practice-shape.ts
export const PRACTICE_SHAPE_FLAGS: readonly ["--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"];
export type PracticeShapeAsk = Readonly<{ depthMode?: DepthMode; scrutiny?: Scrutiny; answerLength?: AnswerLength }>;
export type PracticeShapeOverride = Readonly<{ policy: DebateShapePolicy | null; ask: PracticeShapeAsk }>;
export function parsePracticeShapePolicyText(text: string): DebateShapePolicy;
export function practiceShapeOverrideFromArgs(mode: string, flags: ReadonlyMap<string, string>, read?: (path: string) => string): PracticeShapeOverride | null;
// tools/preview-practice/practice-questions.ts
export const PRACTICE_COMPARISON_QUESTION_IDS: readonly ["ro-euro", "ro-strainatate", "en-nuclear", "en-social-media-age"];
export type PracticeDebateQuestion = Readonly<{ id: string; questionLine: string }>;
export function practiceDebateQuestion(id: string): PracticeDebateQuestion;
```

- [ ] **Step 1: Write the failing test** `tests/unit/preview-practice-shape.test.ts`

```ts
// The preview practice's debate-shape support (spec 2026-10-12 §5 "Practice"; plan 2026-10-12-debate-shape-phase2d):
// the four debate-only flags, the start-values file, the comparison's fixed questions, the throwaway register version,
// the map calls in the practice's accounting, the report's shape block and the README's commands.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { debateShapePolicyStartValues, parseDebateShapePolicy } from "@debateai/register";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import { OPENINGS_QUESTIONS } from "../../tools/preview-practice/practice-openings-questions.js";
import { PRACTICE_COMPARISON_QUESTION_IDS, practiceDebateQuestion } from "../../tools/preview-practice/practice-questions.js";
import { practiceShapeOverrideFromArgs } from "../../tools/preview-practice/practice-shape.js";

const START_TEXT = readFileSync(new URL("../../tools/preview-practice/shape-policy-start.json", import.meta.url), "utf8");
const flags = (entries: Readonly<Record<string, string>>): ReadonlyMap<string, string> => new Map(Object.entries(entries));
const readStart = (): string => START_TEXT;

describe("practice debate shape: the flags", () => {
  it("the start-values file is exactly the owners' start values (rulings S5-S8)", () => {
    expect(parseDebateShapePolicy(JSON.parse(START_TEXT))).toEqual(debateShapePolicyStartValues());
    // Written out in full: the map step bounds too (the parser's default, ruling X1), and never `enabled` (start values = on).
    const start = JSON.parse(START_TEXT) as Record<string, unknown>;
    expect(Object.keys(start)).toEqual(["kind", "version", "plans", "answerLength", "mapStepBounds"]);
    expect(start.mapStepBounds).toEqual({ merge: 32768, choose: 32768 });
    expect("enabled" in start).toBe(false);
  });

  it("no shape flag: nothing (today's debate command is unchanged)", () => {
    expect(practiceShapeOverrideFromArgs("debate", flags({ "--depth": "1", "--question": "ro" }), readStart)).toBeNull();
  });

  it("reads --shape-policy and the three ask settings", () => {
    const override = practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json", "--depth-mode": "fixed",
      "--scrutiny": "deep", "--answer-length": "short" }), readStart);
    expect(override).toEqual({ policy: debateShapePolicyStartValues(), ask: { depthMode: "fixed", scrutiny: "deep", answerLength: "short" } });
  });

  it("the ask settings alone (for a register that holds its own row): no policy of its own", () => {
    expect(practiceShapeOverrideFromArgs("debate", flags({ "--answer-length": "detailed" }), readStart))
      .toEqual({ policy: null, ask: { answerLength: "detailed" } });
  });

  it.each(["formats", "openings", "report"])("refuses every shape flag outside debate mode (%s)", (mode) => {
    for (const flag of ["--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"]) {
      expect(() => practiceShapeOverrideFromArgs(mode, flags({ [flag]: "x" }), readStart))
        .toThrow(`PRACTICE_FLAG_VALUE_INVALID: ${flag} (debate mode only)`);
    }
  });

  it("refuses a value outside each setting's list, naming only the flag", () => {
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--depth-mode": "manual" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --depth-mode \(fixed or adaptive\)$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--scrutiny": "max" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --scrutiny \(standard, deep or exhaustive\)$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--answer-length": "long" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --answer-length \(short, standard or detailed\)$/u);
  });

  it("refuses a policy file that does not pass the register's own check, naming only where in the file", () => {
    const shape = (edit: (value: { version: number; plans: { pro: { answers: number } } }) => void): string => {
      const value = JSON.parse(START_TEXT) as { version: number; plans: { pro: { answers: number } } };
      edit(value);
      return JSON.stringify(value);
    };
    const policyOf = (text: string) => () => practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json" }), () => text);
    expect(policyOf(shape((value) => { value.version = 2; }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: version$/u);
    expect(policyOf(shape((value) => { value.plans.pro.answers = 9; }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: plans\.pro\.answers$/u);
    expect(policyOf("{ not json")).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: \$$/u);
    // A row switched off (P2b's rollback member) could never run the new shape.
    expect(policyOf(JSON.stringify({ ...(JSON.parse(START_TEXT) as object), enabled: false }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: enabled$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json" }), () => { throw new Error("ENOENT"); }))
      .toThrow(/^PRACTICE_SHAPE_POLICY_UNREADABLE$/u);
  });

  it("the command line refuses a mistyped flag and a missing value before anything starts", () => {
    expect(() => parsePracticeArgs(["debate", "--shape-polcy", "x.json"])).toThrow("PRACTICE_FLAG_UNKNOWN");
    expect(() => parsePracticeArgs(["debate", "--shape-policy"])).toThrow("PRACTICE_FLAG_VALUE_MISSING");
    expect(parsePracticeArgs(["debate", "--shape-policy", "x.json", "--depth-mode", "adaptive", "--scrutiny", "standard",
      "--answer-length", "standard"]).flags.size).toBe(4);
  });
});

describe("practice debate questions: the comparison's four fixed questions", () => {
  it("ro and en as before; the four comparison ids word for word from the openings set", () => {
    expect(practiceDebateQuestion("ro").id).toBe("ro");
    expect(practiceDebateQuestion("en").id).toBe("en");
    expect(PRACTICE_COMPARISON_QUESTION_IDS).toEqual(["ro-euro", "ro-strainatate", "en-nuclear", "en-social-media-age"]);
    for (const id of PRACTICE_COMPARISON_QUESTION_IDS) {
      expect(practiceDebateQuestion(id)).toEqual({ id, questionLine: OPENINGS_QUESTIONS.find((question) => question.id === id)!.questionLine });
    }
  });

  it("refuses any other id without repeating it", () => {
    expect(() => practiceDebateQuestion("ro-ciuperci")).toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --question \(/u);
    expect(() => practiceDebateQuestion("my own question?")).toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --question \(ro, en/u);
    try { practiceDebateQuestion("my own question?"); } catch (error) { expect(String(error)).not.toContain("my own question"); }
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: FAIL: `practice-shape.js` and `shape-policy-start.json` do not exist.

- [ ] **Step 3: Create** `tools/preview-practice/shape-policy-start.json`

```json
{
  "kind": "DEBATE_SHAPE_POLICY",
  "version": 1,
  "plans": {
    "free": {
      "mapAIs": 3, "answers": 3, "graders": 2, "pointsPerAnswer": 3, "deeperTopPoints": 1, "gapRoundsMax": 1,
      "closeCallExtraGraders": 2, "fixedDepthAllowed": false,
      "scrutiny": { "deep": null, "exhaustive": null, "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 },
      "opening": "ANGLE_MAP"
    },
    "plus": {
      "mapAIs": 4, "answers": 3, "graders": 3, "pointsPerAnswer": 4, "deeperTopPoints": 2, "gapRoundsMax": 2,
      "closeCallExtraGraders": 2, "fixedDepthAllowed": true,
      "scrutiny": { "deep": { "roundsPerPoint": 2, "pointsPerDebate": 6 }, "exhaustive": { "roundsPerPoint": 3, "pointsPerDebate": 15 },
        "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 },
      "opening": "ANGLE_MAP"
    },
    "pro": {
      "mapAIs": 5, "answers": 4, "graders": 3, "pointsPerAnswer": 4, "deeperTopPoints": 2, "gapRoundsMax": 2,
      "closeCallExtraGraders": 2, "fixedDepthAllowed": true,
      "scrutiny": { "deep": { "roundsPerPoint": 2, "pointsPerDebate": 6 }, "exhaustive": { "roundsPerPoint": 3, "pointsPerDebate": 15 },
        "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 },
      "opening": "ANGLE_MAP"
    },
    "max": {
      "mapAIs": 7, "answers": 4, "graders": 3, "pointsPerAnswer": 4, "deeperTopPoints": 2, "gapRoundsMax": 2,
      "closeCallExtraGraders": 2, "fixedDepthAllowed": true,
      "scrutiny": { "deep": { "roundsPerPoint": 2, "pointsPerDebate": 6 }, "exhaustive": { "roundsPerPoint": 3, "pointsPerDebate": 15 },
        "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 },
      "opening": "ANGLE_MAP"
    },
    "premium": {
      "mapAIs": 5, "answers": 4, "graders": 3, "pointsPerAnswer": 4, "deeperTopPoints": 2, "gapRoundsMax": 2,
      "closeCallExtraGraders": 2, "fixedDepthAllowed": true,
      "scrutiny": { "deep": { "roundsPerPoint": 2, "pointsPerDebate": 6 }, "exhaustive": { "roundsPerPoint": 3, "pointsPerDebate": 15 },
        "scrutinyLeverageMin": 0.05, "scrutinyWeakBelow": 0.5 },
      "opening": "ANGLE_MAP"
    }
  },
  "answerLength": {
    "short": { "words": 300, "writerBound": 8192 },
    "standard": { "words": 700, "writerBound": 12288 },
    "detailed": { "words": 1500, "writerBound": 16384 }
  },
  "mapStepBounds": { "merge": 32768, "choose": 32768 }
}
```

These are exactly `debateShapePolicyStartValues()` in `packages/register/src/debate-shape-policy.ts` (checked against the code on 2026-10-13, `mapStepBounds` included). Do not add `enabled`: absent means on (P2b), and the file must be the start values only.

- [ ] **Step 4: Create** `tools/preview-practice/practice-shape.ts` (flags part; Task 4 appends the report part)

```ts
/**
 * Preview practice, mode "debate": the new debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md
 * §5 "Practice"; plan 2026-10-12-debate-shape-phase2d).
 *
 * Plain words: the shape is switched on by one register row, debateShapePolicy, and the live preview has none. So a
 * practice debate runs today's shape unless it is asked for the new one:
 *  - `--shape-policy FILE`: the row from FILE, checked by the register's own parser, is put into the practice's
 *    THROWAWAY register only (practice-register-import.ts publishPracticeShapeVersion); the export file is only read
 *    and the live register is never reached;
 *  - `--depth-mode`, `--scrutiny`, `--answer-length`: the practice ask's settings, as the /new page sends them.
 * The four flags are debate-only; a refused value is never repeated, a refused file is named only by where it is wrong.
 */
import { readFileSync } from "node:fs";
import {
  AnswerLengthSchema,
  DepthModeSchema,
  ScrutinySchema,
  type AnswerLength,
  type DepthMode,
  type Scrutiny
} from "@debateai/contract";
import { debateShapeInForce, parseDebateShapePolicy, type DebateShapePolicy } from "@debateai/register";
import { PracticeRefusal } from "./practice-settings.js";

export const PRACTICE_SHAPE_FLAGS = Object.freeze(["--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"] as const);

/** The practice ask's settings, as given on the command line (a missing one is the site's default). */
export type PracticeShapeAsk = Readonly<{ depthMode?: DepthMode; scrutiny?: Scrutiny; answerLength?: AnswerLength }>;
/** `policy`: the row --shape-policy puts into the throwaway register (null: none given). */
export type PracticeShapeOverride = Readonly<{ policy: DebateShapePolicy | null; ask: PracticeShapeAsk }>;

const POLICY_INVALID_PREFIX = "DEBATE_SHAPE_POLICY_INVALID:";

/** The file's text, read and checked by the register's own parser. A refusal names only the place that is wrong. */
export function parsePracticeShapePolicyText(text: string): DebateShapePolicy {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_INVALID", "$"); }
  let policy: DebateShapePolicy;
  try {
    policy = parseDebateShapePolicy(value);
  } catch (error) {
    const path = error instanceof TypeError && error.message.startsWith(POLICY_INVALID_PREFIX)
      ? error.message.slice(POLICY_INVALID_PREFIX.length) : "$";
    throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_INVALID", path);
  }
  // P2b's rollback member: a row switched off is read as no row, so it could never run the new shape.
  if (!debateShapeInForce(policy)) throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_INVALID", "enabled");
  return policy;
}

/** One of a setting's fixed values; anything else is refused with the flag and its list, never the value typed. */
function oneOf<T extends string>(options: readonly T[], text: string, flag: string, list: string): T {
  if (!(options as readonly string[]).includes(text)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (${list})`);
  return text as T;
}

/**
 * The debate-shape flags of a command line: null when none is given (today's debate command, unchanged). Any of them
 * outside debate mode is refused. Read before anything starts, so a bad file or value can never start a paid run.
 */
export function practiceShapeOverrideFromArgs(mode: string, flags: ReadonlyMap<string, string>,
  read: (path: string) => string = (path) => readFileSync(path, "utf8")): PracticeShapeOverride | null {
  const given = PRACTICE_SHAPE_FLAGS.filter((flag) => flags.has(flag));
  if (given.length === 0) return null;
  if (mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${given[0]!} (debate mode only)`);
  const path = flags.get("--shape-policy");
  let policy: DebateShapePolicy | null = null;
  if (path !== undefined) {
    let text: string;
    try { text = read(path); } catch { throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_UNREADABLE"); }
    policy = parsePracticeShapePolicyText(text);
  }
  const ask: { depthMode?: DepthMode; scrutiny?: Scrutiny; answerLength?: AnswerLength } = {};
  const depthMode = flags.get("--depth-mode");
  if (depthMode !== undefined) ask.depthMode = oneOf(DepthModeSchema.options, depthMode, "--depth-mode", "fixed or adaptive");
  const scrutiny = flags.get("--scrutiny");
  if (scrutiny !== undefined) ask.scrutiny = oneOf(ScrutinySchema.options, scrutiny, "--scrutiny", "standard, deep or exhaustive");
  const answerLength = flags.get("--answer-length");
  if (answerLength !== undefined) {
    ask.answerLength = oneOf(AnswerLengthSchema.options, answerLength, "--answer-length", "short, standard or detailed");
  }
  return Object.freeze({ policy, ask: Object.freeze(ask) });
}
```

- [ ] **Step 5: The comparison questions** in `tools/preview-practice/practice-questions.ts`

At the top, after the file comment, add:

```ts
import { OPENINGS_QUESTIONS } from "./practice-openings-questions.js";
import { PracticeRefusal } from "./practice-settings.js";
```

At the end of the file, add:

```ts
/**
 * The whole-debate comparison's four fixed questions (README step S-8): two Romanian, two English, a public policy, a
 * personal decision, a contested fact and an ethics question. Each is word for word the openings question of the same
 * id, so the Phase 1 data lines up question by question.
 */
export const PRACTICE_COMPARISON_QUESTION_IDS = Object.freeze(["ro-euro", "ro-strainatate", "en-nuclear", "en-social-media-age"] as const);

/** What a practice DEBATE asks: the id and the question exactly as a person would type it. */
export type PracticeDebateQuestion = Readonly<{ id: string; questionLine: string }>;

/**
 * The question a practice debate asks: `ro` (the default), `en`, or one of the comparison's ids. Anything else is
 * refused before anything starts, and the refusal never repeats what was typed.
 */
export function practiceDebateQuestion(id: string): PracticeDebateQuestion {
  const practice = PRACTICE_QUESTIONS.find((question) => question.id === id);
  if (practice !== undefined) return Object.freeze({ id: practice.id, questionLine: practice.questionLine });
  if ((PRACTICE_COMPARISON_QUESTION_IDS as readonly string[]).includes(id)) {
    const comparison = OPENINGS_QUESTIONS.find((question) => question.id === id);
    if (comparison !== undefined) return Object.freeze({ id: comparison.id, questionLine: comparison.questionLine });
  }
  throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID",
    `--question (ro, en, or a comparison id: ${PRACTICE_COMPARISON_QUESTION_IDS.join(", ")})`);
}
```

- [ ] **Step 6: The command** `tools/preview-practice/practice.ts`

(a) In `VALUE_FLAGS`, add the four flags to the set as it stands (Project 1 added its own; keep them): `"--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"`.

(b) Add the imports:

```ts
import { practiceDebateQuestion } from "./practice-questions.js";
import { practiceShapeOverrideFromArgs } from "./practice-shape.js";
```

(c) Right after the line `if (args.switches.has("--dry") && args.mode !== "openings") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--dry (openings mode only)");`, add:

```ts
    // Debate shape (spec 2026-10-12 §5): the four debate-only flags, read and checked here, before any socket, settings
    // file or gate is touched; a policy file that does not pass the register's own check never starts a paid run.
    const shapeOverride = practiceShapeOverrideFromArgs(args.mode, args.flags);
    // The debate's question, a fixed id only, checked here too (it used to fail only once the database had started).
    const debateQuestionId = args.mode === "debate" ? practiceDebateQuestion(args.flags.get("--question") ?? "ro").id : "ro";
```

(d) In the `runPracticeDebate({ … })` call, replace `questionId: args.flags.get("--question") ?? "ro",` with:

```ts
      questionId: debateQuestionId,
      ...(shapeOverride === null ? {} : { shape: shapeOverride }),
```

`runPracticeDebate` does not accept `shape` until Task 2. The typecheck runs in Task 4, after Task 2 adds it.

(e) In the file's top comment, under ` *  - debate:`, add the line: ` *             --shape-policy FILE runs it in the new debate shape, in the throwaway register only (practice-shape.ts).`

- [ ] **Step 7: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: PASS (12 tests: 9 single cases, the `it.each` over formats, openings and report (3), and the 2 question cases; pre-flight PF-D9).

- [ ] **Step 8: Commit**

```bash
git add tools/preview-practice/practice-shape.ts tools/preview-practice/shape-policy-start.json tools/preview-practice/practice-questions.ts tools/preview-practice/practice.ts tests/unit/preview-practice-shape.test.ts
git commit -m "Practice: debate-only --shape-policy, --depth-mode, --scrutiny, --answer-length and the comparison's four questions, checked before anything starts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The throwaway register version and the ask's settings

The tool gained `--register-next` after this plan was first written: it publishes the code's next register version on top of the export, and the debate runs on it. This task now works with that switch, not against it (controller ruling D-REGNEXT; pre-flight PF-D1):
- without `--register-next`, `--shape-policy` publishes the practice's own version, as planned;
- with `--register-next`, the policy is handed to `composePracticeNextRegisterVersion`, which passes it to the preview publish kit's own source build (`buildPreviewSourceRowsV2`'s existing `debateShape` argument). The code's next version then carries the row, through the server's own publisher path, and nothing more is published. A second version on top would have undone every row the code's next version changed.

What a `--shape-policy` debate does from this task on (pre-flight PF-D10): one fast language check by Haiku through the Anthropic gate during the ask (about $0.00013; not a ledger `MODEL_CALL` row). Before Task 7b the ask carries no `site_language`, so the site is "en", an always-ask site: a Romanian question is locked FAST "ro" (or `FAST_MIX_NO_OFFER:NO_SITE_LANGUAGE` on a mix, ruling L-POPUP-FIRST). A register without a `questionLanguagePolicy` row uses the code's start values.

**Files:**
- Modify: `tools/preview-practice/practice-register-import.ts` (append; `composePracticeNextRegisterVersion` gains an optional `debateShape`)
- Modify: `tools/preview-practice/practice-debate.ts` (input, import block, the version the debate runs on, request, question)
- Modify: `tools/preview-practice/practice.ts` (the `--register-next` call)
- Test: `tests/unit/preview-practice-shape.test.ts` (append a describe)

**Interfaces:**
- Consumes:
  - `debateShapePolicyRow`, `DEBATE_SHAPE_POLICY_ROW_KEY`, `readDebateShapePolicy`, `DebateShapePolicy` (P2a); `debateShapeInForce` (P2b);
  - `canonicalRegisterJson` (`@debateai/register`, existing);
  - `buildDevelopmentRunnerRegisterRows` (`apps/runner/src/dev-deployment-register.ts`, existing; P2b Task 6 adds its `mapContractHash` row; rows are `{ rowKey, value, sourceRef }` and the four hash values are 64-hex strings; pre-flight PF-D7);
  - `practiceVersionRows`, `databaseVersionSnapshotSha256`, `createPostgresRegisterPublicationPort`, `computeRegisterSnapshotSha256`, `parseRegisterVersionText` (existing);
  - `composePracticeNextRegisterVersion`, `importPracticeRegister`'s receipt `codeNext` (`addedKeys`, `changedKeys`) and `buildPreviewSourceRowsV2(bootstrap, runtime, checker, roleRotation, callConcurrency, debateShape, questionLanguage)` (`deploy/preview-auth-dev/v1/publish-register-v2.ts:155`; existing, the `--register-next` path);
  - `PracticeShapeOverride` (Task 1); `practiceDebateQuestion` (Task 1).
- Produces:
```ts
// tools/preview-practice/practice-register-import.ts
export const PRACTICE_SHAPE_SOURCE_REF: "preview practice: --shape-policy, this throwaway register only";
export const PRACTICE_CODE_HASH_ROW_KEYS: readonly ["composerContractHash", "conformanceContractHash", "judgeContractHash", "mapContractHash"];
export async function practiceCodeContractHashRows(): Promise<readonly RegisterPublicationRow[]>;
// existing, gains its third parameter (controller ruling D-REGNEXT):
export async function composePracticeNextRegisterVersion(document: PracticeRegisterExport, bootstrap?: BootstrapRegister,
  debateShape?: DebateShapePolicy | null): Promise<PracticeNextRegisterVersion>;
export type PracticeShapeVersion = Readonly<{ baseRegisterVersion: string; registerVersion: string; row: "ADDED" | "REPLACED"; snapshotSha256: string }>;
export function practiceShapeVersionRows(document: PracticeRegisterExport, policy: DebateShapePolicy, codeHashRows: readonly RegisterPublicationRow[]): Readonly<{ rows: readonly RegisterPublicationRow[]; row: "ADDED" | "REPLACED" }>;
export async function publishPracticeShapeVersion(pool: Pool, document: PracticeRegisterExport, receipt: PracticeRegisterImportReceipt, policy: DebateShapePolicy): Promise<PracticeShapeVersion>;
// tools/preview-practice/practice-debate.ts
runPracticeDebate input gains `shape?: PracticeShapeOverride`.
```

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/preview-practice-shape.test.ts`:

Add to its imports:

```ts
import { beforeAll } from "vitest";
import { mapPromptContractHash } from "@debateai/map";
import {
  canonicalRegisterJson,
  DEBATE_SHAPE_POLICY_ROW_KEY,
  debateShapePolicyRow,
  loadBootstrapRegister,
  type RegisterPublicationRow
} from "@debateai/register";
import { buildPreviewSourceRowsV2 } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";
import { INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW, STAFF_ACCESS_POLICY_REGISTER_ROW } from "../../packages/register/src/staff-access-policy.js";
import {
  composePracticeNextRegisterVersion,
  parsePracticeRegisterExport,
  PRACTICE_CODE_HASH_ROW_KEYS,
  PRACTICE_REGISTER_EXPORT_SCHEMA,
  PRACTICE_SHAPE_SOURCE_REF,
  practiceCodeContractHashRows,
  practiceShapeVersionRows,
  practiceVersionRows
} from "../../tools/preview-practice/practice-register-import.js";
```

(Merge `beforeAll` into the `vitest` import line and `canonicalRegisterJson`, `DEBATE_SHAPE_POLICY_ROW_KEY`, `debateShapePolicyRow`, `loadBootstrapRegister` and `type RegisterPublicationRow` into the existing `@debateai/register` import line. `tests/unit/answer-writer-v3-register-12.test.ts` imports the publish kit and the two staff rows the same way.)

Append:

```ts
/** An export of two versions; the last one's rows are `rows` (live source refs). */
function exportWith(rows: readonly Readonly<{ row_key: string; value_json: string }>[]) {
  const version = (registerVersion: string, rowCount: number, base: string | null, kind: string | null) => ({
    register_version: registerVersion, row_count: rowCount, base_register_version: base, publication_id: null, request_sha256: null,
    snapshot_sha256: null, publication_kind: kind, recorded_at: null });
  return parsePracticeRegisterExport(JSON.stringify({
    schema: "preview-practice-register-export-v1",
    versions: [version("4", 1, null, null), version("5", rows.length, "4", "GENERAL")],
    rows: [{ register_version: "4", row_key: "alpha", value_json: "\"old\"", source_ref: "live" },
      ...rows.map((row) => ({ register_version: "5", row_key: row.row_key, value_json: row.value_json, source_ref: "live" }))]
  }));
}

describe("practice debate shape: the throwaway register version", () => {
  /** The practice's own rows: the debate-shape row and the code's four contract-hash rows (ruling X3; pre-flight PF-D7). */
  const OWN = new Set<string>([DEBATE_SHAPE_POLICY_ROW_KEY, ...PRACTICE_CODE_HASH_ROW_KEYS]);
  let CODE: readonly RegisterPublicationRow[] = [];
  beforeAll(async () => { CODE = await practiceCodeContractHashRows(); });

  it("adds the row to the export's LAST version's rows, keeps every other row byte for byte, in key order", () => {
    const document = exportWith([{ row_key: "zeta", value_json: "\"z\"" }, { row_key: "alpha", value_json: "{\"a\": \"b\"}" }]);
    const { rows, row } = practiceShapeVersionRows(document, debateShapePolicyStartValues(), CODE);
    expect(row).toBe("ADDED");
    expect(rows.map((entry) => entry.rowKey))
      .toEqual(["alpha", "composerContractHash", "conformanceContractHash", DEBATE_SHAPE_POLICY_ROW_KEY, "judgeContractHash", "mapContractHash", "zeta"]);
    expect(rows.filter((entry) => !OWN.has(entry.rowKey))).toEqual(practiceVersionRows(document, "5"));
    expect(rows.find((entry) => entry.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY))
      .toEqual({ ...debateShapePolicyRow(debateShapePolicyStartValues(), PRACTICE_SHAPE_SOURCE_REF) });
  });

  it("replaces an exported row of the same key (REPLACED), never keeping two", () => {
    const live = debateShapePolicyRow(debateShapePolicyStartValues("SNOWBALL"), "live");
    const document = exportWith([{ row_key: DEBATE_SHAPE_POLICY_ROW_KEY, value_json: live.valueJsonText }, { row_key: "alpha", value_json: "1" }]);
    const { rows, row } = practiceShapeVersionRows(document, debateShapePolicyStartValues(), CODE);
    expect(row).toBe("REPLACED");
    const shapeRows = rows.filter((entry) => entry.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY);
    expect(shapeRows).toHaveLength(1);
    expect(shapeRows[0]).toEqual({ ...debateShapePolicyRow(debateShapePolicyStartValues(), PRACTICE_SHAPE_SOURCE_REF) });
  });

  it("supersedes the judge, composer and conformance hashes and adds the map hash, all four the code's own (the dev builder's)", async () => {
    const dev = await buildDevelopmentRunnerRegisterRows();
    expect(CODE.map((entry) => entry.rowKey)).toEqual([...PRACTICE_CODE_HASH_ROW_KEYS]);
    for (const key of PRACTICE_CODE_HASH_ROW_KEYS) {
      const value = dev.find((entry) => entry.rowKey === key)?.value;
      expect(typeof value, key).toBe("string");
      expect(CODE.find((entry) => entry.rowKey === key))
        .toEqual({ rowKey: key, valueJsonText: canonicalRegisterJson(value as string), sourceRef: PRACTICE_SHAPE_SOURCE_REF });
    }
    expect(CODE.find((entry) => entry.rowKey === "mapContractHash")!.valueJsonText).toBe(canonicalRegisterJson(mapPromptContractHash()));
    // The export's own (live) hashes are superseded, never kept beside the code's.
    const stale = JSON.stringify("0".repeat(64));
    const document = exportWith([{ row_key: "judgeContractHash", value_json: stale }, { row_key: "composerContractHash", value_json: stale },
      { row_key: "conformanceContractHash", value_json: stale }, { row_key: "alpha", value_json: "1" }]);
    const { rows } = practiceShapeVersionRows(document, debateShapePolicyStartValues(), CODE);
    for (const own of CODE) expect(rows.filter((entry) => entry.rowKey === own.rowKey)).toEqual([own]);
  });

  it("--register-next with --shape-policy: the code's next version carries the row, from the kit's own source build", async () => {
    // Controller ruling D-REGNEXT: the policy goes into the code's next version (buildPreviewSourceRowsV2's debateShape),
    // so no second version is published on top of it. A base the kit itself would publish from this code (GLM checker,
    // rotation on, a measured runtime), so without the policy the code changes no row.
    const runtime = { nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
      operatorSha256: "c".repeat(64), observedAt: "2026-10-11T10:42:25.561Z" };
    const owned = [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW]
      .map((entry) => ({ rowKey: entry.rowKey, valueJsonText: canonicalRegisterJson(entry.valueAst), sourceRef: entry.sourceRef }));
    const base = [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime), ...owned];
    const document = parsePracticeRegisterExport(JSON.stringify({ schema: PRACTICE_REGISTER_EXPORT_SCHEMA,
      versions: [{ register_version: "11", row_count: base.length, base_register_version: "10", publication_id: null, request_sha256: null,
        snapshot_sha256: null, publication_kind: "GENERAL", recorded_at: null }],
      rows: base.map((entry) => ({ register_version: "11", row_key: entry.rowKey, value_json: entry.valueJsonText, source_ref: entry.sourceRef }))
    }));
    await expect(composePracticeNextRegisterVersion(document)).rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_UNSUPPORTED" });
    const next = await composePracticeNextRegisterVersion(document, undefined, debateShapePolicyStartValues());
    expect([next.addedKeys, next.changedKeys]).toEqual([[DEBATE_SHAPE_POLICY_ROW_KEY], []]);
    expect(next.rows).toHaveLength(base.length + 1);
    expect(JSON.parse(next.rows.find((entry) => entry.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY)!.valueJsonText))
      .toEqual(JSON.parse(debateShapePolicyRow(debateShapePolicyStartValues(), PRACTICE_SHAPE_SOURCE_REF).valueJsonText));
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: FAIL: the new names are not exported. The first message will most likely read "`practiceCodeContractHashRows` is not a function" (the `beforeAll`), which is still the expected FAIL (pre-flight PF-D10).

- [ ] **Step 3: Implement** in `tools/preview-practice/practice-register-import.ts`

Extend the `@debateai/register` import with `canonicalRegisterJson`, `debateShapePolicyRow`, `DEBATE_SHAPE_POLICY_ROW_KEY` and `type DebateShapePolicy`. Add `import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";` (`tools/preview-practice/practice-formats.ts` already imports from that file).

In `composePracticeNextRegisterVersion` (controller ruling D-REGNEXT), replace exactly:

```ts
  document: PracticeRegisterExport,
  bootstrap?: BootstrapRegister
): Promise<PracticeNextRegisterVersion> {
```

with:

```ts
  document: PracticeRegisterExport,
  bootstrap?: BootstrapRegister,
  /**
   * `--shape-policy` with `--register-next` (controller ruling D-REGNEXT): handed to the kit's own source build as its
   * `debateShape`, so the code's next version carries the row exactly as the server's publish would. Null: no row
   * from the code (a base's own row is carried unchanged, R19).
   */
  debateShape: DebateShapePolicy | null = null
): Promise<PracticeNextRegisterVersion> {
```

and replace exactly `  }, checker, roleRotation);` (the end of the `buildPreviewSourceRowsV2(…)` call) with `  }, checker, roleRotation, null, debateShape);`.

Then append:

```ts
/**
 * Debate shape (plan 2026-10-12-debate-shape-phase2d, `--shape-policy`): the source ref of the one row the practice adds.
 * It says where the row came from, so no reader can mistake the practice's version for a live one.
 */
export const PRACTICE_SHAPE_SOURCE_REF = "preview practice: --shape-policy, this throwaway register only" as const;

export type PracticeShapeVersion = Readonly<{
  baseRegisterVersion: string;
  registerVersion: string;
  /** ADDED: the export had no debate-shape row. REPLACED: its own row was superseded in this throwaway copy. */
  row: "ADDED" | "REPLACED";
  snapshotSha256: string;
}>;

/**
 * The contract-hash rows the practice version takes from THIS code (P2b ruling X3, plan 2026-10-12-debate-shape-phase2d
 * Contract deviation 7). The runner refuses a debate-shape row whose map hash is not its own map contracts, and its
 * boot (assertRegisterPromptContractHashes) refuses a register whose judge, composer or conformance hash is not what
 * this candidate code sends (pre-flight PF-D7).
 */
export const PRACTICE_CODE_HASH_ROW_KEYS = Object.freeze(["composerContractHash", "conformanceContractHash", "judgeContractHash",
  "mapContractHash"] as const);

/**
 * The code's own values of those four rows, exactly as the development register builder seals them
 * (apps/runner/src/dev-deployment-register.ts), with the practice's source ref. Throwaway database only.
 */
export async function practiceCodeContractHashRows(): Promise<readonly RegisterPublicationRow[]> {
  const rows = await buildDevelopmentRunnerRegisterRows();
  return Object.freeze(PRACTICE_CODE_HASH_ROW_KEYS.map((rowKey) => {
    const value = rows.find((row) => row.rowKey === rowKey)?.value;
    if (typeof value !== "string") throw new PracticeRegisterError("PRACTICE_CODE_HASH_MISSING", rowKey);
    return Object.freeze({ rowKey, valueJsonText: canonicalRegisterJson(value), sourceRef: PRACTICE_SHAPE_SOURCE_REF });
  }));
}

/**
 * The practice version's rows: the export's LAST version's rows exactly as imported, with the debate-shape row added
 * (or the export's own replaced) and the code's four contract-hash rows put in place of the export's, in key order.
 * Pure.
 */
export function practiceShapeVersionRows(document: PracticeRegisterExport, policy: DebateShapePolicy,
  codeHashRows: readonly RegisterPublicationRow[]): Readonly<{ rows: readonly RegisterPublicationRow[]; row: "ADDED" | "REPLACED" }> {
  const last = document.versions[document.versions.length - 1]!;
  const base = practiceVersionRows(document, last.register_version);
  const shaped = debateShapePolicyRow(policy, PRACTICE_SHAPE_SOURCE_REF);
  const replaced = base.some((row) => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY);
  const own = new Set<string>([DEBATE_SHAPE_POLICY_ROW_KEY, ...codeHashRows.map((row) => row.rowKey)]);
  const rows = [...base.filter((row) => !own.has(row.rowKey)),
    Object.freeze({ rowKey: shaped.rowKey, valueJsonText: shaped.valueJsonText, sourceRef: shaped.sourceRef }), ...codeHashRows]
    .sort((a, b) => (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0));
  return Object.freeze({ rows: Object.freeze(rows), row: replaced ? "REPLACED" : "ADDED" });
}

/**
 * Publishes the practice version in the THROWAWAY database only, through the register's own general publication on
 * the export's last version, and proves it: the number allocated is exactly one above, and its rows hash as built.
 * The export document is only read.
 */
export async function publishPracticeShapeVersion(pool: Pool, document: PracticeRegisterExport, receipt: PracticeRegisterImportReceipt,
  policy: DebateShapePolicy): Promise<PracticeShapeVersion> {
  const { rows, row } = practiceShapeVersionRows(document, policy, await practiceCodeContractHashRows());
  const expected = String(BigInt(receipt.registerVersion) + 1n);
  const published = await createPostgresRegisterPublicationPort(pool).publishGeneral({
    publicationId: randomUUID(),
    baseRegisterVersion: parseRegisterVersionText(receipt.registerVersion),
    rows,
    sourceRef: PRACTICE_SHAPE_SOURCE_REF,
    deployment: "local"
  });
  if (published.registerVersion !== expected) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_VERSION_DRIFT", `expected ${expected}, the publication allocated ${published.registerVersion}`);
  }
  const snapshotSha256 = computeRegisterSnapshotSha256(rows);
  if (await databaseVersionSnapshotSha256(pool, expected) !== snapshotSha256) {
    throw new PracticeRegisterError("PRACTICE_REGISTER_HASH_MISMATCH", `version ${expected} (the practice's debate-shape version)`);
  }
  return Object.freeze({ baseRegisterVersion: receipt.registerVersion, registerVersion: expected, row, snapshotSha256 });
}
```

- [ ] **Step 4: Run the unit test and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: PASS (16 tests: Task 1's 12 and this describe's 4; pre-flight PF-D9, controller ruling D-REGNEXT).

- [ ] **Step 5: Wire it into** `tools/preview-practice/practice-debate.ts`

This step was rewritten on 2026-10-14 against today's file, which already holds `--register-next` (pre-flight PF-D1, controller ruling D-REGNEXT). `tests/unit/answer-writer-v3-register-12.test.ts` pins five strings of this file; every one stays: `await importPracticeRegister(pool, input.register, input.registerNext ?? null)`, `String(input.settings.runner.REGISTER_VERSION) !== liveVersion`, `String(nextVersion) !== receipt.registerVersion`, `REGISTER_VERSION: nextVersion` and `composePracticeRunner({ pool, environment: settings.runner,`.

(a) Imports:
- replace the type-only line `import type { CallConcurrencyPolicy } from "@debateai/register";` with `import { DEBATE_SHAPE_POLICY_ROW_KEY, debateShapeInForce, readDebateShapePolicy, type CallConcurrencyPolicy } from "@debateai/register";` (value imports cannot join a type-only import; pre-flight PF-D8);
- replace `import { practiceQuestion } from "./practice-questions.js";` with `import { practiceDebateQuestion } from "./practice-questions.js";`;
- extend the `./practice-register-import.js` import with `publishPracticeShapeVersion` and `type PracticeShapeVersion`;
- change `import type { PracticeSettings, PracticeSockets } from "./practice-settings.js";` to `import { PracticeRefusal, type PracticeSettings, type PracticeSockets } from "./practice-settings.js";`;
- add `import type { PracticeShapeOverride } from "./practice-shape.js";`.

(b) In the `runPracticeDebate` input type, after `transcriptDirectory?: string | null;`, add:

```ts
  /** Debate shape (`--shape-policy`, the three ask settings): absent: today's debate command. */
  shape?: PracticeShapeOverride;
```

(c) Today's block after the import (practice-debate.ts ~351-366) checks the live version, computes `nextVersion`, builds `const settings` and prints a two-way progress line. Keep all of it; change only the `const settings` expression, and put the shape version in front of it. Replace exactly:

```ts
    const settings: PracticeSettings = receipt.codeNext === undefined ? input.settings
      : Object.freeze({ ...input.settings, runner: Object.freeze({ ...input.settings.runner, REGISTER_VERSION: nextVersion }) });
    progress(receipt.codeNext === undefined ? `register imported up to version ${receipt.registerVersion}`
      : `register imported up to live version ${liveVersion}; practising on this code's next version ${receipt.registerVersion}`
        + ` (changed: ${receipt.codeNext.changedKeys.join(", ") || "none"}; added: ${receipt.codeNext.addedKeys.join(", ") || "none"})`);
```

with:

```ts
    // Debate shape (--shape-policy) WITHOUT --register-next: ONE more version, in this throwaway database only: the
    // export's last version with the debate-shape row added (or its own replaced) and this code's four contract hashes.
    // It is the live version + 1, the number --register-next would take. WITH --register-next the code's next version
    // already carries the row (practice.ts handed the policy to composePracticeNextRegisterVersion, the kit's own
    // source build), so nothing more is published: a second version on top would undo the rows it changed (controller
    // ruling D-REGNEXT). Both compositions below run on the version `settings` names, so the ask path and the runner
    // read the row exactly as the live services would. The export file is only read; the live register is never reached.
    const shapeVersion: PracticeShapeVersion | null = input.shape === undefined || input.shape.policy === null
      || receipt.codeNext !== undefined ? null : await publishPracticeShapeVersion(pool, input.register, receipt, input.shape.policy);
    const settings: PracticeSettings = receipt.codeNext === undefined && shapeVersion === null ? input.settings
      : Object.freeze({ ...input.settings, runner: Object.freeze({ ...input.settings.runner, REGISTER_VERSION: nextVersion }) });
    progress(receipt.codeNext === undefined ? `register imported up to version ${receipt.registerVersion}`
      : `register imported up to live version ${liveVersion}; practising on this code's next version ${receipt.registerVersion}`
        + ` (changed: ${receipt.codeNext.changedKeys.join(", ") || "none"}; added: ${receipt.codeNext.addedKeys.join(", ") || "none"})`);
    if (shapeVersion !== null) {
      progress(`the debate-shape row ${shapeVersion.row === "ADDED" ? "added" : "replaced"} in this throwaway copy as version `
        + `${shapeVersion.registerVersion}, with this code's contract hashes`);
    }
    // The version both compositions read: the live one, the code's next one, or the practice's own.
    const registerVersion = String(settings.runner.REGISTER_VERSION);
    // FLAG only: what the debate-shape row did in that version (with --register-next, as the code's next version's delta).
    const shapeRowChange: "ADDED" | "REPLACED" | null = shapeVersion !== null ? shapeVersion.row
      : input.shape === undefined || input.shape.policy === null || receipt.codeNext === undefined ? null
        : receipt.codeNext.addedKeys.includes(DEBATE_SHAPE_POLICY_ROW_KEY) ? "ADDED" : "REPLACED";
    // The row the debate runs on, read as the ask path and the runner read it (absent: today's shape, byte for byte).
    // A row switched off (P2b's `enabled: false`, the preview's rollback) is no row, as the API reads it.
    const readRow = await readDebateShapePolicy(pool, settings.runner.REGISTER_VERSION);
    const shapeRow = readRow !== null && debateShapeInForce(readRow) ? readRow : null;
    if (input.shape !== undefined && input.shape.policy !== null && shapeRow === null) {
      // Only a caller that composed --register-next without the policy can get here (practice.ts never does).
      throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_NOT_PUBLISHED", "the code's next version was composed without --shape-policy");
    }
    const asked = input.shape?.ask ?? {};
    if (shapeRow === null && Object.keys(asked).length > 0) {
      // Without the row the ask path would drop them silently: refused before any AI is asked.
      throw new PracticeRefusal("PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW",
        "--depth-mode, --scrutiny and --answer-length need a debate-shape row (--shape-policy)");
    }
    const shapeSource = input.shape !== undefined && input.shape.policy !== null ? "FLAG" as const
      : shapeRow !== null ? "REGISTER" as const : null;
```

The old plan's steps (d) and (e) are gone: today's file already hands `settings,` to `composePracticeAsk` (~394) and `environment: settings.runner,` to `composePracticeRunner` (~397) (pre-flight PF-D1).

`shapeSource`, `registerVersion` and `shapeRowChange` are read in Tasks 4 and 5. The root `tsconfig.json` has no `noUnusedLocals`, so the typecheck does not complain meanwhile (pre-flight PF-D10).

(d) Replace `const question = practiceQuestion(input.questionId);` with `const question = practiceDebateQuestion(input.questionId);`.

(e) In the request object, replace `depth_params: { depth: input.depth },` with `depth_params: { depth: input.depth, ...asked },`.

(f) In the transcript's `run` facts, replace `registerVersion: receipt.registerVersion,` with `registerVersion,`. (With `--register-next` alone the two are the same number; with the practice's own version, `registerVersion` names it.)

(g) In `tools/preview-practice/practice.ts` (controller ruling D-REGNEXT), replace exactly:

```ts
    const registerNext = register !== null && args.switches.has("--register-next")
      ? await composePracticeNextRegisterVersion(register) : null;
```

with:

```ts
    // Debate shape with --register-next (controller ruling D-REGNEXT): the --shape-policy policy goes into the code's
    // next version itself, through the kit's own source build, so the practice publishes no second version on top.
    const nextShape = shapeOverride === null ? null : shapeOverride.policy;
    const registerNext = register !== null && args.switches.has("--register-next")
      ? nextShape === null ? await composePracticeNextRegisterVersion(register)
        : await composePracticeNextRegisterVersion(register, undefined, nextShape)
      : null;
```

`tests/unit/answer-writer-v3-register-12.test.ts` pins `await composePracticeNextRegisterVersion(register)` and `"--register-next"` in practice.ts; both stay. `shapeOverride` is Task 1's (read before anything starts).

- [ ] **Step 6: Today's practice unit tests stay green**

Run each separately:
- `pnpm exec vitest run tests/unit/preview-practice.test.ts`
- `pnpm exec vitest run tests/unit/preview-practice-wiring-drift.test.ts`
- `pnpm exec vitest run tests/unit/answer-writer-v3-register-12.test.ts` (pre-flight PF-D1: it pins five strings of practice-debate.ts and two of practice.ts)

Expected: PASS. The drift test compares the compositions with main.ts. This task changes only which settings object `practice-debate.ts` hands them, never the compositions.

- [ ] **Step 7: Commit**

```bash
git add tools/preview-practice/practice-register-import.ts tools/preview-practice/practice-debate.ts tools/preview-practice/practice.ts tests/unit/preview-practice-shape.test.ts
git commit -m "Practice: --shape-policy publishes one debate-shape version in the throwaway register only, with the code's judge, composer, conformance and map contract hashes; with --register-next the row goes into the code's next version instead; both compositions run on it; the ask carries the three settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Map calls in the practice's own accounting

**Files:**
- Modify: `tools/preview-practice/practice-lanes.ts` (`PracticeCallFamily`, `callFamilyOf`, `recheckReply`, new `PRACTICE_MAP_STEPS` and `practiceMapStepOf`)
- Modify: `tools/preview-practice/practice-debate.ts` (`ROSTER_ORDER`)
- Test: `tests/unit/preview-practice-shape.test.ts` (append a describe)

**Interfaces:**
- Consumes: `mapAnglesReplySchema`, `mapListReplySchema`, `mapSnowballReplySchema`, `mapMergeReplySchema`, `mapGapReplySchema`, `mapChooseReplySchema` and `mapClassifyReply` (`@debateai/map`, Phase 1).
- Produces:
```ts
export type PracticeCallFamily = "MAP" | "JUDGE" | "PANEL" | "REVIEW" | "SYNTHESIZER" | "EVALUATOR" | "STORYTELLER" | "STORY_CHECKER" | "UNMAPPED";
export const PRACTICE_MAP_STEPS: readonly ["angles", "list", "merge", "gap", "choose"];
export type PracticeMapStep = "angles" | "list" | "merge" | "gap" | "choose";
export function practiceMapStepOf(callSiteKey: string): PracticeMapStep | null;
```

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/preview-practice-shape.test.ts`:

```ts
import { callFamilyOf, practiceMapStepOf, recheckReply } from "../../tools/preview-practice/practice-lanes.js";

describe("practice: map calls in the practice's own accounting", () => {
  it("names the map family and step from the call-site key (spec §3.4: MAP:angles, MAP:list:<i>, MAP:list:<i>:2, MAP:merge, MAP:gap:<k>, MAP:choose)", () => {
    for (const key of ["MAP:angles", "MAP:list:0", "MAP:list:3", "MAP:list:3:2", "MAP:merge", "MAP:gap:1", "MAP:choose"]) {
      expect(callFamilyOf(key)).toBe("MAP");
    }
    // A failed list handed to another seat has its own key MAP:list:<i>:2 (P2b Task 1) and still counts as a list.
    expect(["MAP:angles", "MAP:list:3", "MAP:list:3:2", "MAP:merge", "MAP:gap:2", "MAP:choose"].map(practiceMapStepOf))
      .toEqual(["angles", "list", "list", "merge", "gap", "choose"]);
    expect(practiceMapStepOf("MAP:other")).toBeNull();
    expect(practiceMapStepOf("JUDGE:attack:root0")).toBeNull();
    expect(callFamilyOf("JUDGE:review:abc")).toBe("REVIEW");
  });

  it("re-checks a map reply by its step's own schema", () => {
    const point = (n: number) => ({ claim: `Point ${String(n)}`, why_it_matters: "It can change the answer.", leans: "context" });
    expect(recheckReply("MAP:list:0", JSON.stringify({ points: [1, 2, 3].map(point), candidate_answers: ["Yes."] })))
      .toEqual({ family: "MAP", issues: [] });
    // A snowball reply (no minimum) under the same list key is accepted too.
    expect(recheckReply("MAP:list:1", JSON.stringify({ points: [], candidate_answers: [] })).issues).toEqual([]);
    expect(recheckReply("MAP:angles", JSON.stringify({ angles: [] })).issues.length).toBeGreaterThan(0);
    expect(recheckReply("MAP:choose", JSON.stringify({ answers: [] })).issues.length).toBeGreaterThan(0);
    expect(recheckReply("MAP:merge", "not json").issues.length).toBeGreaterThan(0);
    expect(recheckReply("MAP:other", "{}")).toEqual({ family: "MAP", issues: ["UNMAPPED"] });
    expect(recheckReply("SOMETHING:ELSE", "{}")).toEqual({ family: "UNMAPPED", issues: ["UNMAPPED"] });
  });
});
```

(Move the new import line up to the file's other imports.)

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: FAIL: `practiceMapStepOf` is not exported, and `callFamilyOf("MAP:angles")` is `UNMAPPED`.

- [ ] **Step 3: Implement** in `tools/preview-practice/practice-lanes.ts`

(a) Add an import:

```ts
import {
  mapAnglesReplySchema,
  mapChooseReplySchema,
  mapClassifyReply,
  mapGapReplySchema,
  mapListReplySchema,
  mapMergeReplySchema,
  mapSnowballReplySchema
} from "@debateai/map";
```

(b) Replace the `PracticeCallFamily` line and the first line of `callFamilyOf`'s body:

```ts
export type PracticeCallFamily = "MAP" | "JUDGE" | "PANEL" | "REVIEW" | "SYNTHESIZER" | "EVALUATOR" | "STORYTELLER" | "STORY_CHECKER" | "UNMAPPED";
```

and add as the FIRST line of `callFamilyOf`:

```ts
  if (callSiteKey.startsWith("MAP:")) return "MAP";
```

(c) After `callFamilyOf`, add:

```ts
/** The map's steps as their call-site keys name them (spec 2026-10-12 §3.4). */
export const PRACTICE_MAP_STEPS = Object.freeze(["angles", "list", "merge", "gap", "choose"] as const);
export type PracticeMapStep = typeof PRACTICE_MAP_STEPS[number];

/**
 * `MAP:angles` → angles, `MAP:list:<i>` → list, `MAP:gap:<k>` → gap, …; null for any other key. Only the second
 * segment is read, so a reassigned list (`MAP:list:<i>:2`, P2b Task 1) is a list too.
 */
export function practiceMapStepOf(callSiteKey: string): PracticeMapStep | null {
  const [family, step] = callSiteKey.split(":");
  if (family !== "MAP" || step === undefined) return null;
  return (PRACTICE_MAP_STEPS as readonly string[]).includes(step) ? step as PracticeMapStep : null;
}

/**
 * The schemas a map step's reply may have. The list key carries both the list and (in a snowball opening) the
 * snowball reply, so either is accepted. The steps' own content checks need the run's ids and are not re-run here:
 * the schema re-check is the diagnosis, the call-time check is the verdict.
 */
const MAP_RECHECK_SCHEMAS: Readonly<Record<PracticeMapStep, readonly Parameters<typeof mapClassifyReply>[2][]>> = Object.freeze({
  angles: [mapAnglesReplySchema],
  list: [mapListReplySchema, mapSnowballReplySchema],
  merge: [mapMergeReplySchema],
  gap: [mapGapReplySchema],
  choose: [mapChooseReplySchema]
});

function recheckMapReply(callSiteKey: string, content: string): readonly string[] {
  const step = practiceMapStepOf(callSiteKey);
  if (step === null) return Object.freeze(["UNMAPPED"]);
  let first: readonly string[] | null = null;
  for (const schema of MAP_RECHECK_SCHEMAS[step]) {
    const issues = fromClassification(mapClassifyReply(content, undefined, schema, () => []).classification);
    if (issues.length === 0) return issues;
    first ??= issues;
  }
  return first ?? Object.freeze(["UNMAPPED"]);
}
```

`fromClassification` is declared below `callFamilyOf` in the file. Function declarations are hoisted, so this is fine.

(d) In `recheckReply`'s `switch (family)`, add before the `default:` case:

```ts
    case "MAP": return { family, issues: recheckMapReply(callSiteKey, content) };
```

(e) In `tools/preview-practice/practice-debate.ts`, replace the `ROSTER_ORDER` line with:

```ts
const ROSTER_ORDER = Object.freeze(["MAP", "JUDGE", "PANEL", "REVIEW", "SYNTHESIZER", "EVALUATOR", "STORYTELLER", "STORY_CHECKER", "UNMAPPED"]);
```

- [ ] **Step 4: Run and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: PASS (18 tests; pre-flight PF-D9).

Then run: `pnpm exec vitest run tests/unit/preview-practice.test.ts`
Expected: PASS (its `recheckReply("SOMETHING:ELSE", "{}")` case is unchanged).

- [ ] **Step 5: Commit**

```bash
git add tools/preview-practice/practice-lanes.ts tools/preview-practice/practice-debate.ts tests/unit/preview-practice-shape.test.ts
git commit -m "Practice: map calls are the MAP family, re-checked by their step's own schema, first in the per-site rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: What the shape did: the facts, the report block and the verdict

**Files:**
- Modify: `tools/preview-practice/practice-shape.ts` (append)
- Modify: `tools/preview-practice/practice-verdict.ts` (`PracticeVerdictInput.shapeNotExercised`, `practiceVerdict`)
- Modify: `tools/preview-practice/practice-report.ts` (`debateReport`, `reportMarkdown`)
- Modify: `tools/preview-practice/practice-debate.ts` (result `shape`, the facts read)
- Test: `tests/unit/preview-practice-shape.test.ts` (append a describe)

**Interfaces:**
- Consumes:
  - `parseCostEnvelopeBasis` (`@debateai/budget`, P2a: `.shape?: DebateShapeCeilingInput`);
  - `DebateShapeCeilingInput` (P2a);
  - `MAP_MARKS` (`@debateai/map`);
  - `mapAnswersArgued` (`@debateai/map`, P2c, `packages/map/src/choose.ts:46`: ruling C-TWO's one rule, "were the map's own answers argued?") (controller ruling D-NOTARGUED, pre-flight PF-D11);
  - `readMapChoiceForRun` and `readMapItemsForRun` (P2b Task 8, `@debateai/map`, file `packages/map/src/repository.ts`; see Task 0);
  - `practiceMapStepOf` and `PRACTICE_MAP_STEPS` (Task 3).
- Produces:
```ts
export type PracticeShapeSource = "FLAG" | "REGISTER";
export type PracticeShapeSizes = Readonly<{ plan: string; depthMode: string; scrutiny: string; answerLength: string; mapAIs: number;
  answers: number; graders: number; pointsPerAnswer: number; deeperTopPoints: number; gapRounds: number; closeCallExtraGraders: number; opening: string }>;
export type PracticeShapeFacts = Readonly<{ storedDepthParams: Readonly<Record<string, unknown>> | null; sizes: PracticeShapeSizes | null;
  marks: Readonly<Record<string, number>>; choice: Readonly<{ opening: string; answers: number; alsoRaised: number }> | null; mapCallSiteKeys: readonly string[] }>;
export type PracticeShapeBlock = Readonly<{ source: PracticeShapeSource; registerVersion: string; row: "ADDED" | "REPLACED" | null;
  asked: Readonly<{ depthMode: string | null; scrutiny: string | null; answerLength: string | null }>;
  storedDepthParams: Readonly<Record<string, unknown>> | null; sizes: PracticeShapeSizes | null; opening: string | null;
  mapMarks: Readonly<Record<string, number>>; chosenAnswers: number | null; alsoRaised: number | null;
  panelCloseCallExtensions: number; scrutinyExtensions: number; mapCallsByStep: Readonly<Record<PracticeMapStep, number>>;
  notExercised: string | null }>;
export type PracticeMapChoice = Readonly<{ opening: string; answers: readonly unknown[]; alsoRaised: readonly unknown[] }>;
export type PracticeMapReaders = Readonly<{ choice(runId: string): Promise<PracticeMapChoice | null>; items(runId: string): Promise<readonly unknown[]> }>;
export function practiceMapReaders(pool: Pool): PracticeMapReaders;
export async function readPracticeShapeFacts(pool: Pick<Pool, "query">, runId: string, answerId: string | null, readers: PracticeMapReaders): Promise<PracticeShapeFacts>;
export function practiceShapeBlock(input: Readonly<{ source: PracticeShapeSource; registerVersion: string; row: "ADDED" | "REPLACED" | null;
  asked: PracticeShapeAsk; facts: PracticeShapeFacts | null; unreadable?: string }>): PracticeShapeBlock;
export function practiceShapeLines(block: PracticeShapeBlock): readonly string[];
// practice-verdict.ts: PracticeVerdictInput.shapeNotExercised?: readonly string[]  →  NOT_PROVEN "SHAPE_NOT_EXERCISED:<why>"
// practice-debate.ts: PracticeDebateResult.shape?: PracticeShapeBlock
```

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/preview-practice-shape.test.ts`:

```ts
import { practiceShapeBlock, practiceShapeLines, type PracticeShapeFacts } from "../../tools/preview-practice/practice-shape.js";
import { practiceVerdict, type PracticeVerdictInput } from "../../tools/preview-practice/practice-verdict.js";
import { reportMarkdown, type PracticeReport } from "../../tools/preview-practice/practice-report.js";

// Pre-flight PF-D14: the map AIs' count sits on its own line (the plan's literal rule for lines that name the depth).
const SIZES = Object.freeze({ plan: "premium", depthMode: "adaptive", scrutiny: "standard", answerLength: "standard",
  mapAIs: 5,
  answers: 4, graders: 3, pointsPerAnswer: 4, deeperTopPoints: 2, gapRounds: 2, closeCallExtraGraders: 1, opening: "ANGLE_MAP" });
const FACTS: PracticeShapeFacts = Object.freeze({
  storedDepthParams: { depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" },
  sizes: SIZES,
  marks: { "CHOOSE_QUOTA_FILLED": 1, "PANEL-CLOSE-CALL-EXTENDED": 3, "SCRUTINY-EXTENDED": 2, "PANEL-PARTIAL": 1 },
  choice: { opening: "MAP", answers: 2, alsoRaised: 7 },
  mapCallSiteKeys: ["MAP:angles", "MAP:list:0", "MAP:list:1", "MAP:list:1:2", "MAP:merge", "MAP:gap:1", "MAP:choose"]
});
const blockOf = (facts: PracticeShapeFacts | null, unreadable?: string) => practiceShapeBlock({ source: "FLAG", registerVersion: "6", row: "ADDED",
  asked: { scrutiny: "deep" }, facts, ...(unreadable === undefined ? {} : { unreadable }) });

describe("practice debate shape: what the run did", () => {
  it("counts what the debate-shape run did", () => {
    expect(blockOf(FACTS)).toEqual({
      source: "FLAG", registerVersion: "6", row: "ADDED", asked: { depthMode: null, scrutiny: "deep", answerLength: null },
      storedDepthParams: FACTS.storedDepthParams, sizes: SIZES, opening: "ANGLE_MAP", mapMarks: { CHOOSE_QUOTA_FILLED: 1 },
      chosenAnswers: 2, alsoRaised: 7, panelCloseCallExtensions: 3, scrutinyExtensions: 2,
      mapCallsByStep: { angles: 1, list: 3, merge: 1, gap: 1, choose: 1 }, notExercised: null
    });
  });

  it("says when the new shape was not exercised", () => {
    // Pre-flight PF-D12: a fallen-back map still stores its choice (opening TODAYS_OPENING, no answers, nothing also raised).
    const fellBack = blockOf({ ...FACTS, marks: { MAP_UNAVAILABLE_TODAYS_OPENING: 1 }, choice: { opening: "TODAYS_OPENING", answers: 0, alsoRaised: 0 },
      mapCallSiteKeys: ["MAP:angles", "MAP:list:0"] });
    expect(fellBack).toMatchObject({ opening: "TODAYS_OPENING", notExercised: "MAP_UNAVAILABLE_TODAYS_OPENING", chosenAnswers: 0,
      alsoRaised: 0, mapMarks: { MAP_UNAVAILABLE_TODAYS_OPENING: 1 } });
    // The stored opening says it alone too: an answer that was never served carries no mark.
    expect(blockOf({ ...FACTS, marks: {}, choice: { opening: "TODAYS_OPENING", answers: 0, alsoRaised: 0 } }))
      .toMatchObject({ opening: "TODAYS_OPENING", notExercised: "MAP_UNAVAILABLE_TODAYS_OPENING" });
    // Ruling C-TWO (controller ruling D-NOTARGUED, pre-flight PF-D11): the map gave one answer, so today's opening was argued.
    expect(blockOf({ ...FACTS, choice: { opening: "MAP", answers: 1, alsoRaised: 4 } })).toMatchObject({ opening: "TODAYS_OPENING",
      notExercised: "MAP_ANSWERS_NOT_ARGUED", chosenAnswers: 1, alsoRaised: 4 });
    // A shape run that stored no map at all (it stopped before the map) is not the shape shown to run (pre-flight PF-D12).
    expect(blockOf({ ...FACTS, choice: null })).toMatchObject({ opening: null, notExercised: "NO_MAP_STORED", chosenAnswers: null,
      alsoRaised: null });
    expect(blockOf({ ...FACTS, sizes: null })).toMatchObject({ opening: null, notExercised: "NO_SHAPE_ON_RECEIPT" });
    expect(blockOf(null, "CONTENT_CIPHER_UNAVAILABLE")).toMatchObject({ notExercised: "FACTS_UNREADABLE:CONTENT_CIPHER_UNAVAILABLE" });
    // Refused at the ask: the verdict already fails the run; the block only says nothing ran.
    expect(blockOf(null)).toEqual({ source: "FLAG", registerVersion: "6", row: "ADDED", asked: { depthMode: null, scrutiny: "deep", answerLength: null },
      storedDepthParams: null, sizes: null, opening: null, mapMarks: {}, chosenAnswers: null, alsoRaised: null, panelCloseCallExtensions: 0,
      scrutinyExtensions: 0, mapCallsByStep: { angles: 0, list: 0, merge: 0, gap: 0, choose: 0 }, notExercised: null });
  });

  it("a shape run that did not exercise the shape is NOT_PROVEN, never PASS", () => {
    const base: PracticeVerdictInput = { harnessError: null, completed: true, servedAnswer: true, storyOutcome: "READY", formatFailures: 0,
      failedCalls: 0, gateHalted: false, gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: {} };
    expect(practiceVerdict(base)).toMatchObject({ verdict: "PASS", exitCode: 0, reasons: [] });
    expect(practiceVerdict({ ...base, shapeNotExercised: [] })).toMatchObject({ verdict: "PASS", reasons: [] });
    expect(practiceVerdict({ ...base, shapeNotExercised: ["MAP_UNAVAILABLE_TODAYS_OPENING"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["SHAPE_NOT_EXERCISED:MAP_UNAVAILABLE_TODAYS_OPENING"] });
    expect(practiceVerdict({ ...base, shapeNotExercised: ["MAP_ANSWERS_NOT_ARGUED"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["SHAPE_NOT_EXERCISED:MAP_ANSWERS_NOT_ARGUED"] });
    expect(practiceVerdict({ ...base, completed: false, shapeNotExercised: ["NO_SHAPE_ON_RECEIPT"] }).verdict).toBe("FAIL");
  });

  it("report.md says it in plain words, counts and codes only", () => {
    const report = { schema: "preview-practice-report-v1", mode: "debate", verdict: "PASS", exitCode: 0, reasons: [],
      startedAt: "2026-10-12T10:00:00.000Z", finishedAt: "2026-10-12T11:00:00.000Z", shape: blockOf(FACTS) } as unknown as PracticeReport;
    const markdown = reportMarkdown(report);
    expect(markdown).toContain("Debate shape (from --shape-policy, in this throwaway register only: version 6, row added):");
    expect(markdown).toContain("- asked: depth mode default, scrutiny deep, answer length default; stored: "
      + "{\"depth\":1,\"depthMode\":\"adaptive\",\"scrutiny\":\"standard\",\"answerLength\":\"standard\"}");
    expect(markdown).toContain("- opening used: ANGLE_MAP");
    expect(markdown).toContain("- map calls (every try, as the ledger recorded them): angles 1, list 3, merge 1, gap 1, choose 1");
    expect(markdown).toContain("- chosen answers: 2; also raised, not debated: 7");
    expect(markdown).toContain("- map marks: CHOOSE_QUOTA_FILLED x1");
    // Pre-flight PF-D19 (T14-P): the close call called for extra graders; one that then failed still leaves the mark.
    expect(markdown).toContain("- points whose close call called for extra graders: 3; points scrutinised further: 2");
    expect(practiceShapeLines(blockOf({ ...FACTS, sizes: null })).join("\n")).toContain("- the new shape was not exercised: NO_SHAPE_ON_RECEIPT");
    expect(practiceShapeLines(blockOf({ ...FACTS, choice: { opening: "MAP", answers: 1, alsoRaised: 4 } })).join("\n"))
      .toContain("- the new shape was not exercised: MAP_ANSWERS_NOT_ARGUED");
  });

  it("a report without the block reads as today", () => {
    const report = { schema: "preview-practice-report-v1", mode: "debate", verdict: "PASS", exitCode: 0, reasons: [],
      startedAt: "2026-10-12T10:00:00.000Z", finishedAt: "2026-10-12T11:00:00.000Z" } as unknown as PracticeReport;
    expect(reportMarkdown(report)).not.toContain("Debate shape");
  });
});
```

(Move the new import lines up to the file's other imports.)

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: FAIL: `practiceShapeBlock` is not exported.

- [ ] **Step 3: Append the report part** to `tools/preview-practice/practice-shape.ts`

Add to its imports:

```ts
import type { Pool } from "pg";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { MAP_MARKS, mapAnswersArgued, readMapChoiceForRun, readMapItemsForRun } from "@debateai/map";
import type { DebateShapeCeilingInput } from "@debateai/register";
import { PRACTICE_MAP_STEPS, practiceMapStepOf, type PracticeMapStep } from "./practice-lanes.js";
```

(Merge `type DebateShapeCeilingInput` into the existing `@debateai/register` import. The map readers come from `@debateai/map`, never `@debateai/db`: P2b Task 8 puts them in `packages/map/src/repository.ts`.) Append:

```ts
/* ------------------------------------------------------------------ what the run did (report.json `shape`) */

/** FLAG: the row came from --shape-policy. REGISTER: the imported register held its own row. */
export type PracticeShapeSource = "FLAG" | "REGISTER";

/** The sizes the run was admitted with, frozen on its money receipt (envelope_basis.shape, P2a). */
export type PracticeShapeSizes = Readonly<{
  plan: string; depthMode: string; scrutiny: string; answerLength: string;
  mapAIs: number; answers: number; graders: number; pointsPerAnswer: number; deeperTopPoints: number; gapRounds: number;
  closeCallExtraGraders: number; opening: string;
}>;

/** What the practice read from the throwaway database after the debate (no model text). */
export type PracticeShapeFacts = Readonly<{
  /** core.run.depth_params as the ask path stored it. */
  storedDepthParams: Readonly<Record<string, unknown>> | null;
  sizes: PracticeShapeSizes | null;
  /**
   * Every condition mark on the served answer's latest version, by code (serve.condition_mark). Pre-flight PF-D13: a new
   * answer version copies its marks, so the marks are counted on one version only.
   */
  marks: Readonly<Record<string, number>>;
  /**
   * The map's stored choice (P2b): its opening (MAP, or TODAYS_OPENING when the map fell back; pre-flight PF-D12), how
   * many answers the run planned to argue and how many points were raised but not debated. Null: no map was stored.
   */
  choice: Readonly<{ opening: string; answers: number; alsoRaised: number }> | null;
  /** The run's map calls in ledger order, every try. */
  mapCallSiteKeys: readonly string[];
}>;

export type PracticeShapeBlock = Readonly<{
  source: PracticeShapeSource;
  /** The throwaway register version the debate ran on. */
  registerVersion: string;
  /** FLAG only: ADDED or REPLACED; null for REGISTER. */
  row: "ADDED" | "REPLACED" | null;
  /** The three settings as given on the command line (null: the site's default). */
  asked: Readonly<{ depthMode: string | null; scrutiny: string | null; answerLength: string | null }>;
  storedDepthParams: Readonly<Record<string, unknown>> | null;
  sizes: PracticeShapeSizes | null;
  /**
   * The opening used: the receipt's; TODAYS_OPENING when the map was unavailable or gave fewer than two answers to argue
   * (ruling C-TWO, controller ruling D-NOTARGUED); null when nothing ran or no map was stored.
   */
  opening: string | null;
  /** The map's marks (spec §1.2) found on the answer, with how often. */
  mapMarks: Readonly<Record<string, number>>;
  chosenAnswers: number | null;
  alsoRaised: number | null;
  /** PANEL-CLOSE-CALL-EXTENDED marks: one per node (point) whose close call called for extra graders (P2b; kept when one then failed). */
  panelCloseCallExtensions: number;
  /** SCRUTINY-EXTENDED marks: one per scrutinised node, i.e. the points scrutiny examined further (P2b), not extra exchanges. */
  scrutinyExtensions: number;
  mapCallsByStep: Readonly<Record<PracticeMapStep, number>>;
  /** Why the new shape did not run (the verdict's SHAPE_NOT_EXERCISED reason); null when it ran or nothing was admitted. */
  notExercised: string | null;
}>;

/** P2b's map choice as the practice counts it (structurally P2b's `MapChoiceRecord`, packages/map/src/repository.ts). */
export type PracticeMapChoice = Readonly<{ opening: string; answers: readonly unknown[]; alsoRaised: readonly unknown[] }>;
export type PracticeMapReaders = Readonly<{
  choice(runId: string): Promise<PracticeMapChoice | null>;
  items(runId: string): Promise<readonly unknown[]>;
}>;

/** The ONE place the practice calls P2b's map readers (decrypted with the run's key, which lives only in this process). */
export function practiceMapReaders(pool: Pool): PracticeMapReaders {
  return Object.freeze({
    choice: (runId: string) => readMapChoiceForRun(pool, runId),
    items: (runId: string) => readMapItemsForRun(pool, runId)
  });
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
}

function sizesOf(shape: DebateShapeCeilingInput): PracticeShapeSizes {
  return Object.freeze({
    plan: shape.plan, depthMode: shape.depthMode, scrutiny: shape.scrutiny, answerLength: shape.answerLength,
    mapAIs: shape.mapAIs, answers: shape.answers, graders: shape.graders, pointsPerAnswer: shape.pointsPerAnswer,
    deeperTopPoints: shape.deeperTopPoints, gapRounds: shape.gapRounds, closeCallExtraGraders: shape.closeCallExtraGraders,
    opening: shape.opening
  });
}

/** Reads what the run did, from the throwaway database, before it is deleted. Codes and counts only. */
export async function readPracticeShapeFacts(pool: Pick<Pool, "query">, runId: string, answerId: string | null,
  readers: PracticeMapReaders): Promise<PracticeShapeFacts> {
  const run = (await pool.query<{ depth_params: unknown; envelope_basis: unknown }>(
    "SELECT depth_params, envelope_basis FROM core.run WHERE run_id=$1", [runId])).rows[0];
  const shape = run === undefined ? undefined : parseCostEnvelopeBasis(run.envelope_basis).shape;
  // Pre-flight PF-D13: serve.condition_mark is keyed by (answer_id, answer_version) (migrations/0006_s05.sql) and a new
  // answer version copies its marks, so only the answer's latest version in serve.answer is counted.
  const marks = answerId === null ? [] : (await pool.query<{ mark: string; n: number }>(
    `SELECT mark, count(*)::int AS n FROM serve.condition_mark
      WHERE answer_id=$1 AND answer_version = (SELECT max(answer_version) FROM serve.answer WHERE answer_id=$1)
      GROUP BY mark ORDER BY mark`, [answerId])).rows;
  const keys = (await pool.query<{ call_site_key: string }>(
    `SELECT call_site_key FROM ledger.ledger_entry
      WHERE run_id=$1 AND action_kind='MODEL_CALL' AND call_site_key LIKE 'MAP:%' ORDER BY sequence`, [runId])).rows;
  const choice = await readers.choice(runId);
  return Object.freeze({
    storedDepthParams: recordOf(run?.depth_params),
    sizes: shape === undefined ? null : sizesOf(shape),
    marks: Object.freeze(Object.fromEntries(marks.map((row) => [row.mark, row.n]))),
    choice: choice === null ? null
      : Object.freeze({ opening: choice.opening, answers: choice.answers.length, alsoRaised: choice.alsoRaised.length }),
    mapCallSiteKeys: Object.freeze(keys.map((row) => row.call_site_key))
  });
}

const MAP_UNAVAILABLE = "MAP_UNAVAILABLE_TODAYS_OPENING";

/** The report's block. `facts` null: nothing was admitted (or, with `unreadable`, the facts could not be read). Pure. */
export function practiceShapeBlock(input: Readonly<{
  source: PracticeShapeSource; registerVersion: string; row: "ADDED" | "REPLACED" | null; asked: PracticeShapeAsk;
  facts: PracticeShapeFacts | null; unreadable?: string;
}>): PracticeShapeBlock {
  const facts = input.facts;
  const marks = facts?.marks ?? {};
  const byStep: Record<PracticeMapStep, number> = { angles: 0, list: 0, merge: 0, gap: 0, choose: 0 };
  for (const key of facts?.mapCallSiteKeys ?? []) {
    const step = practiceMapStepOf(key);
    if (step !== null) byStep[step] += 1;
  }
  // Pre-flight PF-D12: a fallen-back map still stores its choice, with the opening TODAYS_OPENING and no answers; the
  // stored opening says so even when no answer was served to carry the mark.
  const mapUnavailable = (marks[MAP_UNAVAILABLE] ?? 0) > 0 || facts?.choice?.opening === "TODAYS_OPENING";
  // Ruling C-TWO (controller ruling D-NOTARGUED, pre-flight PF-D11): fewer than two of the map's answers, so the run argued
  // today's opening. No mark records it; the stored choice keeps exactly the answers the run planned to argue.
  const notArgued = !mapUnavailable && facts !== null && facts.choice !== null && !mapAnswersArgued(facts.choice.answers);
  const notExercised = input.unreadable !== undefined ? `FACTS_UNREADABLE:${input.unreadable}`
    : facts === null ? null
      : facts.sizes === null ? "NO_SHAPE_ON_RECEIPT"
        : mapUnavailable ? MAP_UNAVAILABLE
          : facts.choice === null ? "NO_MAP_STORED"
            : notArgued ? "MAP_ANSWERS_NOT_ARGUED" : null;
  return Object.freeze({
    source: input.source,
    registerVersion: input.registerVersion,
    row: input.row,
    asked: Object.freeze({ depthMode: input.asked.depthMode ?? null, scrutiny: input.asked.scrutiny ?? null,
      answerLength: input.asked.answerLength ?? null }),
    storedDepthParams: facts?.storedDepthParams ?? null,
    sizes: facts?.sizes ?? null,
    opening: facts === null ? null : mapUnavailable || notArgued ? "TODAYS_OPENING"
      : facts.choice === null ? null : facts.sizes?.opening ?? null,
    mapMarks: Object.freeze(Object.fromEntries(Object.entries(marks).filter(([code]) => (MAP_MARKS as readonly string[]).includes(code)))),
    chosenAnswers: facts?.choice?.answers ?? null,
    alsoRaised: facts?.choice?.alsoRaised ?? null,
    panelCloseCallExtensions: marks["PANEL-CLOSE-CALL-EXTENDED"] ?? 0,
    scrutinyExtensions: marks["SCRUTINY-EXTENDED"] ?? 0,
    mapCallsByStep: Object.freeze(byStep),
    notExercised
  });
}

/** The report.md paragraph: counts and codes, never model text. */
export function practiceShapeLines(block: PracticeShapeBlock): readonly string[] {
  const where = block.source === "FLAG"
    ? `from --shape-policy, in this throwaway register only: version ${block.registerVersion}, row ${block.row === "REPLACED" ? "replaced" : "added"}`
    : `from the imported register's own row, version ${block.registerVersion}`;
  const asked = `depth mode ${block.asked.depthMode ?? "default"}, scrutiny ${block.asked.scrutiny ?? "default"}, `
    + `answer length ${block.asked.answerLength ?? "default"}`;
  const sizes = block.sizes === null ? "none (the run was not admitted with the shape)"
    : `plan ${block.sizes.plan}, ${String(block.sizes.mapAIs)} map AIs, up to ${String(block.sizes.answers)} answers, `
      + `${String(block.sizes.graders)} graders (+${String(block.sizes.closeCallExtraGraders)} on a close call), `
      + `${String(block.sizes.pointsPerAnswer)} points per answer, ${block.sizes.depthMode}, scrutiny ${block.sizes.scrutiny}, `
      + `answer length ${block.sizes.answerLength}`;
  const steps = PRACTICE_MAP_STEPS.map((step) => `${step} ${String(block.mapCallsByStep[step])}`).join(", ");
  const marks = Object.entries(block.mapMarks);
  const counted = (value: number | null) => (value === null ? "none stored" : String(value));
  return [`Debate shape (${where}):`, "",
    `- asked: ${asked}; stored: ${block.storedDepthParams === null ? "nothing" : JSON.stringify(block.storedDepthParams)}`,
    `- sizes on the run's receipt: ${sizes}`,
    `- opening used: ${block.opening ?? "none"}`,
    `- map calls (every try, as the ledger recorded them): ${steps}`,
    `- chosen answers: ${counted(block.chosenAnswers)}; also raised, not debated: ${counted(block.alsoRaised)}`,
    `- map marks: ${marks.length === 0 ? "none" : marks.map(([mark, n]) => `${mark} x${String(n)}`).join(", ")}`,
    `- points whose close call called for extra graders: ${String(block.panelCloseCallExtensions)}; points scrutinised further: ${String(block.scrutinyExtensions)}`,
    ...(block.notExercised === null ? [] : [`- the new shape was not exercised: ${block.notExercised}`]),
    ""];
}
```

- [ ] **Step 4: The verdict** in `tools/preview-practice/practice-verdict.ts`

In `PracticeVerdictInput`, after `busyModels?: readonly string[];`, add:

```ts
  /**
   * Debate shape (plan 2026-10-12-debate-shape-phase2d): why a debate asked for the new shape did not run it (the map
   * was unavailable and the opening fell back to today's; the map gave fewer than two answers, so today's opening was
   * argued, ruling C-TWO; no map was stored; the run was admitted without the shape; its facts could not be read). Not
   * a failure: NOT_PROVEN, as the shape was not shown to work. Optional: none when absent.
   */
  shapeNotExercised?: readonly string[];
```

In `practiceVerdict`, the `notProven` array ends with the `GATE_PAUSED` line, which has no comma after it (pre-flight PF-D14, `practice-verdict.ts:228`). Replace that line:

```ts
    ...[...(input.gatePauses ?? [])].sort().map((pause) => `GATE_PAUSED:${pause}`)
```

with:

```ts
    ...[...(input.gatePauses ?? [])].sort().map((pause) => `GATE_PAUSED:${pause}`),
    ...[...(input.shapeNotExercised ?? [])].sort().map((why) => `SHAPE_NOT_EXERCISED:${why}`)
```

- [ ] **Step 5: The report** in `tools/preview-practice/practice-report.ts`

(a) Add the import: `import { practiceShapeLines, type PracticeShapeBlock } from "./practice-shape.js";`

(b) In `debateReport`, in the `practiceVerdict({ … })` input, after `busyModels: busyDuringRun,`, add:

```ts
    shapeNotExercised: r.shape === undefined || r.shape.notExercised === null ? [] : [r.shape.notExercised],
```

(c) In the returned object, right after `ask: Object.freeze({ questionId: r.questionId, depth: r.depth, planTier: "premium" }),`, add:

```ts
    // Debate shape: only when the debate ran with a debate-shape row; absent otherwise, so today's report keeps its keys.
    ...(r.shape === undefined ? {} : { shape: r.shape }),
```

(d) In `reportMarkdown`, right after the line that pushes the `Totals:` block (`if (totals !== undefined) lines.push("Totals:", "", …);`, `practice-report.ts:451`; pre-flight check 2026-10-14), add:

```ts
  const shape = typeof report.shape === "object" && report.shape !== null ? report.shape as PracticeShapeBlock : undefined;
  if (shape !== undefined) lines.push(...practiceShapeLines(shape));
```

- [ ] **Step 6: Read the facts** in `tools/preview-practice/practice-debate.ts`

(a) Extend the `./practice-shape.js` import: `practiceMapReaders`, `practiceShapeBlock`, `readPracticeShapeFacts`, `type PracticeShapeBlock`, `type PracticeShapeFacts`, `type PracticeShapeOverride`, `type PracticeShapeSource`.

(b) In `PracticeDebateResult`, after the `transcript?:` member, add:

```ts
  /** Debate shape: what the shape run did (practice-shape.ts); absent when the debate ran without a debate-shape row. */
  shape?: PracticeShapeBlock;
```

(c) Right after the `const shapeSource = …` line (Task 2), add the line below. `row` is Task 2's `shapeRowChange`: the throwaway shape version's row change, or with `--register-next` the code-next version's (ADDED when `receipt.codeNext.addedKeys` holds the row, else REPLACED); null for a REGISTER source (controller ruling D-REGNEXT). `registerVersion` and `asked` are Task 2's.

```ts
    const shapeBlockOf = (source: PracticeShapeSource, facts: PracticeShapeFacts | null, unreadable?: string): PracticeShapeBlock =>
      practiceShapeBlock({ source, registerVersion, row: shapeRowChange, asked, facts, ...(unreadable === undefined ? {} : { unreadable }) });
```

(d) In the "ask was refused" early `return Object.freeze({ … })`, the last line is `remaining, seconds: { admission: admissionSeconds, debate: 0 }, parallel: runner.callStats.summary()` (pre-flight PF-D14, `practice-debate.ts:435`). Put a comma after `runner.callStats.summary()` and add, on the next line:

```ts
        ...(shapeSource === null ? {} : { shape: shapeBlockOf(shapeSource, null) })
```

(e) Replace `const collected = await collect(pool, job.runId);` with:

```ts
    const collected = await collect(pool, job.runId);
    // Debate shape: what the shape run did, read before the database goes. A reading that breaks costs only this block
    // (NOT_PROVEN: the shape was not shown to run), never the report.
    let shape: PracticeShapeBlock | undefined;
    if (shapeSource !== null) {
      try {
        shape = shapeBlockOf(shapeSource, await readPracticeShapeFacts(pool, job.runId, answerId, practiceMapReaders(pool)));
      } catch (error) {
        shape = shapeBlockOf(shapeSource, null, codeOf(error));
        progress(`debate shape: what the run did could not be read (${codeOf(error)})`);
      }
    }
```

(f) In the final `return Object.freeze({ … })`, after `...(transcript === undefined ? {} : { transcript })`, add `,\n      ...(shape === undefined ? {} : { shape })`.

- [ ] **Step 7: Run and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: PASS (23 tests: 18 after Task 3, plus this task's 5; pre-flight PF-D9).

Then, one at a time:
- `pnpm exec vitest run tests/unit/preview-practice.test.ts`
- `pnpm exec vitest run tests/unit/preview-practice-slips.test.ts`

Expected: PASS.

- [ ] **Step 8: Typecheck (alone)**

Run: `pnpm run typecheck`
Expected: no error. If `readMapChoiceForRun`'s or `readMapItemsForRun`'s form differs from `(pool, runId)` (Task 0 step 2), adapt only `practiceMapReaders` and say so in the commit message body. If `@debateai/budget` is not resolvable from `tools/`, import `parseCostEnvelopeBasis` the way the practice's other money code does (`../../apps/api/src/…`). STOP and report if neither works.

- [ ] **Step 9: Commit**

```bash
git add tools/preview-practice/practice-shape.ts tools/preview-practice/practice-verdict.ts tools/preview-practice/practice-report.ts tools/preview-practice/practice-debate.ts tests/unit/preview-practice-shape.test.ts
git commit -m "Practice: the report's debate-shape block (opening, map calls by step, chosen and also-raised counts, map marks, close-call and scrutinised points); a shape run that did not run the shape (the map unavailable, its answers not argued, no map stored) is NOT_PROVEN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The transcript holds the map

**Files:**
- Modify: `tools/preview-practice/practice-transcript.ts` (`PracticeTranscript.structure`, `buildPracticeTranscript`, `recordPracticeTranscript`)
- Modify: `tools/preview-practice/practice-debate.ts` (the `recordPracticeTranscript` call)
- Modify: `tests/unit/preview-practice-transcript.test.ts` (one case in "the file")

**Interfaces:**
- Consumes: `practiceMapReaders` (Task 4).
- Produces:
```ts
export function readPracticeMap(readers: PracticeMapReaders, runId: string): Promise<Readonly<{ choice: PracticeMapChoice | null; items: readonly unknown[] }>>; // practice-shape.ts
// buildPracticeTranscript input gains `map?: unknown`; structure gains `map` only when given.
// recordPracticeTranscript input gains `map?: () => Promise<unknown>`.
```

- [ ] **Step 1: Write the failing test.** In `tests/unit/preview-practice-transcript.test.ts`, inside `describe("preview practice transcript: the file", …)`, add:

```ts
  it("holds structure.map only for a debate-shape run (today's file keeps its keys)", () => {
    expect(Object.keys(transcript().structure)).toEqual(["answer", "inspection", "story"]);
    // As P2b's readers return them (pre-flight PF-D14: the real MapChoiceRecord and MapItem forms; HAIKU_REF is this file's).
    const map = {
      choice: { opening: "MAP", marks: [],
        answers: [{ answerId: "a1", statement: "Da.", rootIndex: 0, rootNodeId: null, maker: null, filled: false }],
        alsoRaised: [{ keyPointId: "kp01", claim: "Costul.", makers: ["anthropic"] }] },
      items: [{ itemId: "pt01", seat: { aiRef: HAIKU_REF, maker: "anthropic" }, origin: "BLIND", angleId: "g1", angleKind: "PRACTICAL",
        listIndex: 0, kind: "POINT", claim: "Costul.", whyItMatters: "Banii conteaza.", leans: "context" }]
    };
    const shaped = buildPracticeTranscript({ run: RUN, attempts: attempts(), answer: null, inspection: null, story: null, unavailable: [], map,
      now: new Date("2026-10-12T10:06:00.000Z") });
    expect(Object.keys(shaped.structure)).toEqual(["answer", "inspection", "story", "map"]);
    expect(shaped.structure.map).toEqual(map);
  });
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-transcript.test.ts`
Expected: FAIL: `structure.map` is missing (and `map` is not an accepted input).

- [ ] **Step 3: Implement**

In `tools/preview-practice/practice-shape.ts`, append:

```ts
/** The map as transcript.json holds it (`structure.map`): P2b's choice and every map item, decrypted. */
export async function readPracticeMap(readers: PracticeMapReaders, runId: string): Promise<Readonly<{
  choice: PracticeMapChoice | null; items: readonly unknown[];
}>> {
  return Object.freeze({ choice: await readers.choice(runId), items: await readers.items(runId) });
}
```

In `tools/preview-practice/practice-transcript.ts`:

(a) In `PracticeTranscript.structure`, after the `story: unknown;` member, add:

```ts
    /**
     * Debate shape only (absent otherwise): the map's choice (the answers argued, the points also raised) and every map
     * item (each point and candidate answer with the AI that wrote it), as P2b's readers return them, decrypted.
     */
    map?: unknown;
```

(b) In `buildPracticeTranscript`'s input, after `unavailable: readonly string[];`, add `map?: unknown;`. Replace its `structure:` line with:

```ts
    structure: Object.freeze({ answer: input.answer, inspection: input.inspection, story: input.story,
      ...(input.map === undefined ? {} : { map: input.map }) }),
```

(c) In `recordPracticeTranscript`'s input, after `story: unknown;`, add:

```ts
  /** Debate shape only: reads the map (practice-shape.ts readPracticeMap). Absent: no structure.map, as today. */
  map?: () => Promise<unknown>;
```

Replace its line `  const transcript = buildPracticeTranscript({ run: input.run, attempts, answer: input.answer, inspection, story: input.story, unavailable });` (`practice-transcript.ts:419`; pre-flight check 2026-10-14) with:

```ts
  let map: unknown;
  if (input.map !== undefined) {
    try {
      map = await input.map();
      // Pre-flight PF-D12: a map that fell back still stores its choice (opening TODAYS_OPENING, no answers), so null
      // means no map was stored at all.
      const choice = (map as { choice?: { opening?: unknown } | null }).choice;
      if (choice === null) {
        unavailable.push("structure.map.choice: no map stored (the run never reached the map, or its content was erased)");
      } else if (choice?.opening === "TODAYS_OPENING") {
        unavailable.push("structure.map.choice: the map was unavailable, so it holds no answers and no points also raised");
      }
    } catch (error) {
      map = null;
      unavailable.push(`structure.map: ${error instanceof Error ? error.name : "UNKNOWN"}`);
    }
  }
  const transcript = buildPracticeTranscript({ run: input.run, attempts, answer: input.answer, inspection, story: input.story, unavailable,
    ...(input.map === undefined ? {} : { map }) });
```

In `tools/preview-practice/practice-debate.ts`:
- extend the `./practice-shape.js` import with `readPracticeMap`;
- in the `recordPracticeTranscript({ … })` call, after `pool, directory: input.transcriptDirectory, ownerRef, answer: projection, story: storedStory,`, add:

```ts
          ...(shapeSource === null ? {} : { map: () => readPracticeMap(practiceMapReaders(pool), job.runId) }),
```

- [ ] **Step 4: Run and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-transcript.test.ts`
Expected: PASS (the existing key-order case `["schema", "writtenAt", "run", "totals", "attempts", "structure", "unavailable"]` is unchanged).

- [ ] **Step 5: Commit**

```bash
git add tools/preview-practice/practice-shape.ts tools/preview-practice/practice-transcript.ts tools/preview-practice/practice-debate.ts tests/unit/preview-practice-transcript.test.ts
git commit -m "Practice transcript: structure.map (the map's choice and items) for a debate-shape run only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The proof: a whole new-shape practice debate against the scripted gates

**Files:**
- Modify: `tests/support/preview-gate-stubs.ts` (`GateRequestKind` += `"QUESTION_LANGUAGE"`, `classifyGateRequest`, `answerFor`, new `stubMapContent` and `stubQuestionLanguageContent`). P2b Task 15 already added the `"MAP"` kind and its classification by `MAP_CONTRACT_IDS` (P2b cross-plan P2d-4): reuse it, do not add a second one.
- Modify: `tests/integration/preview-practice-run.test.ts` (imports, one new describe)

**Interfaces:**
- Consumes: `MAP_CONTRACT_IDS` (`@debateai/map`, already imported by P2b Task 15), `openingsDryContent` (`tools/preview-practice/practice-openings-dry.ts`), `QUESTION_LANGUAGE_CHECK_CONTRACT_ID` (P2L Task 5, `apps/api/src/question-language/fast-check.ts`), `readFramedMaterial` / `wirePacket` (tests/support/framed-packet.ts), and Tasks 1–5.
- Produces: `GateRequestKind` gains `"QUESTION_LANGUAGE"` (P2b gave it `"MAP"`); `stubMapContent(chat: string, serial: number): string`; `stubQuestionLanguageContent(chat: string): string`. A MAP request no scenario overrides is now answered (until now P2b's harness answered MAP only through its overrides, and an unanswered one was UNEXPECTED).

- [ ] **Step 1: The doubles answer the map and the fast language check.** In `tests/support/preview-gate-stubs.ts`:

First check P2b's part is there: `grep -n "\"MAP\"\|MAP_CONTRACT_IDS" tests/support/preview-gate-stubs.ts` must print the `GateRequestKind` member, the import and the `classifyGateRequest` line. If not, STOP: P2b Task 15 is missing (Task 0 should have caught it).

(a) Add `detectArgumentLanguage` to the existing `@debateai/kernel` import (it holds `argumentLanguageDirective`), and add these imports (keep P2b's `MAP_CONTRACT_IDS` import as it is):

```ts
import { QUESTION_LANGUAGE_CHECK_CONTRACT_ID } from "../../apps/api/src/question-language/fast-check.js";
import { openingsDryContent } from "../../tools/preview-practice/practice-openings-dry.js";
```

(b) Add `"QUESTION_LANGUAGE"` to the `GateRequestKind` union P2b left, right after `"MAP"`:

```ts
export type GateRequestKind = "PROBE" | "STORYTELLER" | "STORY_CHECKER" | "MAP" | "QUESTION_LANGUAGE" | "PANEL" | "REVIEW" | "JUDGE" | "EVALUATOR" | "COMPOSE";
```

(If P2b's union lists its members in another order, keep that order and only insert `"QUESTION_LANGUAGE"` after `"MAP"`.)

(c) In the "the doubles' answers" section, after `stubStoryFor`, add:

```ts
/**
 * A valid map reply (debate shape, spec 2026-10-12 §1) for the step the request is: the openings dry script's own
 * answer (tools/preview-practice/practice-openings-dry.ts), in the question's language. The angle planner's reply
 * names the locked language first (`question_language`, P2L Task 15; P2L amendment P2b-5): the primary code of the
 * request's own `question_language` field, so a plain debate records no disagreement. The exception is choose: it names
 * TWO distinct answers, the first two merged answers. They get an OPPOSITE_CASE point against the first, a PRACTICAL
 * point for it, an ASKER_WORRY point for the second, and one more point against it (any point not yet used). So a clean
 * debate needs no answer filling, meets the OPPOSITE_CASE and ASKER_WORRY quotas, and leaves points also raised. The
 * third quota, SINGLE_AI (a point raised by exactly one AI), is met only when a chosen point has one maker; otherwise
 * the chooser fills it with a CHOOSE_QUOTA_FILLED map mark, which never changes the verdict (pre-flight PF-D15).
 */
export function stubMapContent(chat: string, serial: number): string {
  const frame = readFramedMaterial(wirePacket(chat));
  if (frame.contractId === MAP_CONTRACT_IDS.angles) {
    const locked = frame.fields.find((entry) => entry.name === "question_language")?.content;
    const code = locked === undefined ? null : (JSON.parse(locked) as { code?: unknown }).code;
    // No lock in the request: the question's own language, as the kernel's guesser reads it (pre-flight PF-D15).
    const question = frame.fields.find((entry) => entry.name === "question_line")?.content ?? "";
    const planner = (typeof code === "string" ? code : detectArgumentLanguage(question).tag).split("-")[0]!.toLowerCase();
    const angles = JSON.parse(openingsDryContent({ contractId: frame.contractId, fields: frame.fields, serial, slip: false })) as object;
    return JSON.stringify({ question_language: planner, ...angles });
  }
  if (frame.contractId === MAP_CONTRACT_IDS.choose) {
    const field = (name: string): string => frame.fields.find((entry) => entry.name === name)?.content ?? "[]";
    const keyPoints = JSON.parse(field("key_points")) as { key_point_id: string; angle_kind: string | null }[];
    const merged = JSON.parse(field("answers")) as { answer_id: string; answer: string }[];
    if (merged.length >= 2 && keyPoints.length >= 4) {
      const used = new Set<string>();
      const take = (kind: string | null): string[] => {
        const found = keyPoints.find((point) => point.angle_kind === kind && !used.has(point.key_point_id))
          ?? keyPoints.find((point) => !used.has(point.key_point_id));
        if (found === undefined) return [];
        used.add(found.key_point_id);
        return [found.key_point_id];
      };
      const againstFirst = take("OPPOSITE_CASE");
      const forFirst = take("PRACTICAL");
      const forSecond = take("ASKER_WORRY");
      const againstSecond = take(null);
      return JSON.stringify({ answers: [
        { answer_id: "a-1", statement: merged[0]!.answer, for: forFirst, against: againstFirst, strongest_rival: "a-2" },
        { answer_id: "a-2", statement: merged[1]!.answer, for: forSecond, against: againstSecond, strongest_rival: "a-1" }
      ] });
    }
  }
  return openingsDryContent({ contractId: frame.contractId, fields: frame.fields, serial, slip: false });
}

/**
 * The fast language check's default answer (P2L Task 5 answer form): one language, no mix, and that language is the
 * question's own as the kernel's guesser reads it (never the site's: an ask without `site_language` checks against
 * English, and a Romanian practice question must still lock Romanian). A scenario that needs another reading answers
 * through its override.
 */
export function stubQuestionLanguageContent(chat: string): string {
  const question = readFramedMaterial(wirePacket(chat)).fields.find((entry) => entry.name === "question_line")?.content ?? "";
  const code = detectArgumentLanguage(question).tag.split("-")[0]!.toLowerCase();
  return JSON.stringify({ main_language: code, languages_seen: [code], is_real_mix: false, proposed_question: null });
}
```

(d) In `classifyGateRequest`, right after P2b's `MAP` line (`if ((Object.values(MAP_CONTRACT_IDS) as string[]).includes(contractId)) return "MAP";`), add:

```ts
  if (contractId === QUESTION_LANGUAGE_CHECK_CONTRACT_ID) return "QUESTION_LANGUAGE";
```

(e) In `answerFor`'s `switch (kind)`, add before `default:`:

```ts
      case "MAP": return stubMapContent(chat, served);
      case "QUESTION_LANGUAGE": return stubQuestionLanguageContent(chat);
```

(f) In the file's top comment, the phrase "every other request is answered by its contract (a valid reply)" breaks after "its" (lines 8-9). Right after "(a valid reply)" on line 9, insert ", a debate-shape map step (stubMapContent) and the fast language check (stubQuestionLanguageContent) included" (pre-flight PF-D15).

- [ ] **Step 2: Write the integration cases.** In `tests/integration/preview-practice-run.test.ts`:

(a) Change `import { randomUUID } from "node:crypto";` to `import { createHash, randomUUID } from "node:crypto";`.

(b) Append at the end of the file:

```ts
describe("preview practice: debate mode, the new debate shape (spec 2026-10-12 §5)", () => {
  const SHAPE_POLICY_START = fileURLToPath(new URL("../../tools/preview-practice/shape-policy-start.json", import.meta.url));
  type ShapeReport = {
    verdict: string; reasons: string[]; ask: unknown; register: { steps: { path: string }[] };
    run: { runId: string; workItemOutcome: string; answer: { served: boolean }; story: { outcome: string } };
    byModelAndSite: { model: string; site: string }[];
    shape?: { source: string; registerVersion: string; row: string | null; storedDepthParams: unknown; sizes: Record<string, unknown> | null;
      opening: string | null; mapMarks: Record<string, number>; chosenAnswers: number | null; alsoRaised: number | null;
      panelCloseCallExtensions: number; scrutinyExtensions: number; mapCallsByStep: Record<string, number>; notExercised: string | null };
  };
  const exportDigest = () => createHash("sha256").update(readFileSync(registerExportPath)).digest("hex");
  /** How many also-raised points the storyteller was handed (its `also_raised` field, P2c), over all its answered calls. */
  const storytellerAlsoRaised = (requests: readonly GateRecord[]): number => requests
    .filter((request) => request.kind === "STORYTELLER" && request.answer === "OK")
    .map((request) => readFramedMaterial(wirePacket(stubChatBody(request.provider, request.body))).fields
      .find((field) => field.name === "also_raised")?.content)
    .reduce((sum, content) => sum + (content === undefined ? 0 : (JSON.parse(content) as unknown[]).length), 0);

  it("--shape-policy (the owners' start values): the map, the chosen answers argued, a served answer and a READY story handed what was also raised: PASS (exit 0)", async () => {
    const before = exportDigest();
    const { stubs, env, common, quiet, out } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1",
      "--shape-policy", SHAPE_POLICY_START, "--transcript"], env, quiet);
    const report = outcome.report as unknown as ShapeReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    // The export is only read; the import itself is today's; the practice's own version is one above it.
    expect(exportDigest()).toBe(before);
    expect(report.register.steps.map((step) => step.path)).toEqual(["HISTORICAL_IMPORT", "GENERAL_PUBLICATION"]);
    expect(report.run).toMatchObject({ workItemOutcome: "COMPLETED", answer: { served: true }, story: { outcome: "READY" } });
    // Both compositions read the row: the ask path stored the four settings, admission froze the sizes, the runner ran the map.
    expect(report.shape).toMatchObject({
      source: "FLAG", registerVersion: "6", row: "ADDED", opening: "ANGLE_MAP", chosenAnswers: 2, notExercised: null,
      storedDepthParams: { depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" },
      sizes: { plan: "premium", depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", mapAIs: 5, graders: 3, opening: "ANGLE_MAP" }
    });
    expect(report.shape!.alsoRaised).toBeGreaterThan(0);
    expect(report.shape!.mapCallsByStep).toMatchObject({ angles: 1, merge: 1, choose: 1 });
    expect(report.shape!.mapCallsByStep.list).toBeGreaterThanOrEqual(2);
    expect(report.shape!.mapCallsByStep.gap).toBeGreaterThanOrEqual(1);
    expect(report.byModelAndSite.some((row) => row.site === "MAP")).toBe(true);
    expect(stubs.requests.filter((request) => request.kind === "UNKNOWN")).toEqual([]);
    // The ask's one fast language check ran (the row-absent case below sends none; pre-flight PF-D15).
    expect(stubs.requests.filter((request) => request.kind === "QUESTION_LANGUAGE").map((request) => request.answer)).toEqual(["OK"]);
    expect(stubs.requests.filter((request) => request.kind === "MAP" && request.answer === "OK").length).toBeGreaterThanOrEqual(5);
    expect(storytellerAlsoRaised(stubs.requests)).toBeGreaterThan(0);
    // The transcript holds the map and ran on the practice's version.
    const transcript = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8")) as {
      run: { registerVersion: string }; attempts: { family: string }[];
      structure: { map?: { choice: { alsoRaised: unknown[] } | null; items: unknown[] } };
    };
    expect(transcript.run.registerVersion).toBe("6");
    expect(transcript.attempts.some((attempt) => attempt.family === "MAP")).toBe(true);
    expect(transcript.structure.map?.choice?.alsoRaised.length ?? 0).toBeGreaterThan(0);
    expect(transcript.structure.map?.items.length ?? 0).toBeGreaterThan(0);
  }, 900_000);

  it("no --shape-policy and a register without the row: today's shape, nothing new in the report, no map call", async () => {
    const { stubs, env, common, quiet, out } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth", "1", "--transcript"], env, quiet);
    const report = outcome.report as unknown as ShapeReport;
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect("shape" in report).toBe(false);
    expect(report.ask).toEqual({ questionId: "ro", depth: 1, planTier: "premium" });
    expect(report.byModelAndSite.some((row) => row.site === "MAP")).toBe(false);
    expect(stubs.requests.some((request) => request.kind === "MAP")).toBe(false);
    // Without the row the ask builds, calls and reads nothing new (P2L): no fast language check either.
    expect(stubs.requests.some((request) => request.kind === "QUESTION_LANGUAGE")).toBe(false);
    expect(storytellerAlsoRaised(stubs.requests)).toBe(0);
    const transcript = JSON.parse(readFileSync(join(out, "transcript.json"), "utf8")) as { run: { registerVersion: string }; structure: object };
    expect(transcript.run.registerVersion).toBe("5");
    expect(Object.keys(transcript.structure)).toEqual(["answer", "inspection", "story"]);
  }, 600_000);

  it("refuses a malformed --shape-policy before anything starts: HARNESS_ERROR (exit 40), no gate touched", async () => {
    const bad = join(folder, `shape-bad-${randomUUID()}.json`);
    await writeFile(bad, JSON.stringify({ ...(JSON.parse(readFileSync(SHAPE_POLICY_START, "utf8")) as object), version: 2 }));
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--shape-policy", bad], env, quiet);
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_SHAPE_POLICY_INVALID"]);
    expect(stubs.requests).toEqual([]);
    expect(stubs.remainingReads).toEqual([]);
  }, 60_000);

  it("--depth-mode without a debate-shape row: refused before any model call (HARNESS_ERROR, exit 40)", async () => {
    const { stubs, env, common, quiet } = await scenario();
    const outcome = await runPractice(["debate", ...common, "--register-export", registerExportPath, "--depth-mode", "fixed"], env, quiet);
    expect(outcome.exitCode).toBe(40);
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW"]);
    expect(stubs.requests).toEqual([]);
  }, 300_000);
});
```

(c) Extend the stubs import: `import { startPreviewGateStubs, stubChatBody, type GateOverride, type GateRecord, type GateRequest } from "../support/preview-gate-stubs.js";`

- [ ] **Step 3: Run the new cases (alone, nothing else running)**

Check memory and runs as the Global Constraints say. Then run:
`pnpm exec vitest run tests/integration/preview-practice-run.test.ts -t "the new debate shape"`
Expected: 4 passed, the rest of the file skipped.

If the shape case fails, read `report.reasons` and `report.shape` in the failure output first:
- `HARNESS_ERROR:DEBATE_SHAPE_MAP_HASH_UNSEALED` or `HARNESS_ERROR:MAP_CONTRACT_HASH_MISMATCH`: the practice runner's boot found no code map hash in the practice version. Check Task 2's code hash rows (`practiceCodeContractHashRows`).
- `SHAPE_NOT_EXERCISED:NO_SHAPE_ON_RECEIPT`: the ask composition did not read the row at the practice version. Check Task 2 Step 5(c): the `settings` both compositions are handed (controller ruling D-REGNEXT).
- `MAP_UNAVAILABLE_TODAYS_OPENING`: the stubs did not answer the map. Look for `UNEXPECTED` requests in `stubs.requests`.
- `SHAPE_NOT_EXERCISED:MAP_ANSWERS_NOT_ARGUED`: the stubs' choose reply chose fewer than two answers (ruling C-TWO). Check `stubMapContent`'s choose answer (pre-flight PF-D11).
- `SHAPE_NOT_EXERCISED:NO_MAP_STORED`: the run stopped before the map. Read `run.failureCode` (pre-flight PF-D12).
- a `STORY_NOT_READY`: check P2c's story pack version against the doubles' storyteller answer.

Fix the root cause. Never weaken an assertion to pass.

- [ ] **Step 4: Commit**

```bash
git add tests/support/preview-gate-stubs.ts tests/integration/preview-practice-run.test.ts
git commit -m "Practice integration: a whole new-shape debate (PASS, served answer, READY story handed also_raised, the map in the transcript), a row-absent debate with nothing new, and the two refusals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The README: the new shape, the flags and the whole-debate comparison (S-8)

**Files:**
- Modify: `tools/preview-practice/README.md`
- Test: `tests/unit/preview-practice-shape.test.ts` (append a describe)

**Interfaces:**
- Consumes: `parsePracticeArgs`, `practiceDebateQuestion`, `PRACTICE_COMPARISON_QUESTION_IDS`, `practiceShapeOverrideFromArgs`.
- Produces: README sections "The new debate shape (debate mode, `--shape-policy`)" and "S-8, Mac: the whole-debate comparison (today's shape and the new shape)".

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/preview-practice-shape.test.ts`:

```ts
describe("README: the debate commands are real commands of this tool", () => {
  const readme = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
  const commands = readme.split("\n").filter((line) => line.includes("tools/preview-practice/practice.ts debate "));
  const argvOf = (line: string): string[] => line.slice(line.indexOf("practice.ts ") + "practice.ts ".length).trim().split(/\s+/u)
    .map((word) => word.replace(/^"(.*)"$/u, "$1"));
  const readFromEngine = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  it("names the pass bar, the new shape and the comparison", () => {
    expect(commands.length).toBeGreaterThanOrEqual(4);
    expect(commands.filter((line) => line.includes("--shape-policy tools/preview-practice/shape-policy-start.json")).length).toBeGreaterThanOrEqual(2);
    expect(commands.filter((line) => line.includes("--question \"$Q\""))).toHaveLength(2);
    // Controller ruling D-BOTHNEXT (pre-flight PF-D2): the new-shape command and both S-8 arms run on this code's next version.
    expect(commands.filter((line) => line.includes(" --register-next ")).length).toBeGreaterThanOrEqual(3);
  });

  it("every one parses with flags the tool reads, fixed questions and a valid policy file", () => {
    for (const line of commands) {
      const args = parsePracticeArgs(argvOf(line));
      expect(args.mode).toBe("debate");
      const asked = args.flags.get("--question") ?? "ro";
      for (const id of asked === "$Q" ? [...PRACTICE_COMPARISON_QUESTION_IDS] : [asked]) expect(practiceDebateQuestion(id).id).toBe(id);
      expect(() => practiceShapeOverrideFromArgs(args.mode, args.flags, readFromEngine)).not.toThrow();
      // Controller ruling D-BOTHNEXT (pre-flight PF-D2): until the owners republish the register with this code's prompt
      // fingerprints, every new-shape and comparison debate needs --register-next. S-6's own debate line keeps none.
      if (asked === "$Q" || args.flags.has("--shape-policy")) expect(args.switches.has("--register-next")).toBe(true);
      if (asked === "$Q") {
        expect(args.flags.get("--depth")).toBe("1");
        expect(args.switches.has("--transcript")).toBe(true);
        expect(args.flags.get("--out")).toMatch(/^\$P\/compare\/\$Q\/(today|shape)$/u);
      }
    }
  });

  it("leaves the judging to the owners, outside the repository", () => {
    expect(readme).toContain("results are judged by the owners' private method, outside this repository");
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: FAIL: "names the pass bar, the new shape and the comparison" (only S-6's debate command exists).

- [ ] **Step 3: Edit the README.** In `tools/preview-practice/README.md`:

(a) In "## What this is, in plain words", at the end of the **debate** bullet, add: ` With \`--shape-policy\` it runs the new debate shape instead (see "The new debate shape").`

(b) Insert this section right before `## Safety rules built in`. Changed on 2026-10-14: `--shape-policy` with and without `--register-next`, the conformance hash, the `--register-next` rule until the owners republish (pre-flight PF-D1, PF-D2, PF-D7; controller rulings D-REGNEXT, D-BOTHNEXT); the new reasons and the C-TWO clause (pre-flight PF-D11, PF-D12, PF-D19; controller ruling D-NOTARGUED); the owners' separate switch-on steps (pre-flight PF-D19). No tag goes into the README text itself:

````markdown
### The new debate shape (debate mode, `--shape-policy`)

The new debate shape (spec 2026-10-12, Phase 2) is switched on by one register row, `debateShapePolicy`. The live
preview has no such row, so a practice debate runs today's shape unless you ask for the new one.

- `--shape-policy FILE` puts the row from FILE into the practice's own throwaway database, and only there:
  - The register is copied as always: every exported version, each proved by its hash.
  - With `--register-next` (see "Optional flags"): the row goes into this code's next version, which the preview
    publish kit composes in the throwaway database anyway. No other version is made. That version already holds this
    code's own contract hashes.
  - Without `--register-next`: ONE more version is published in the throwaway database. It holds the last exported
    version's rows with the debate-shape row added. If the export already holds a debate-shape row, the copy's row is
    replaced instead. That version also holds this code's own judge, composer, conformance and map contract hashes, in
    place of the live ones: the runner refuses the new shape unless the map hash is its own, and the hashes must
    describe what this code sends.
  - The practice asks and argues on that version: both the ask path and the runner read the row from it.
  - The export file is only read. The live register is never reached; the practice has no connection to the live
    database at all.
- Until the owners publish a register version that carries this code's prompt fingerprints (map `25b4c106…`, judge
  `aac53407…`, composer `9a46af29…`), every practice debate of this branch runs with `--register-next`, in either
  shape. Without it, a debate in today's shape is refused before it starts (HARNESS_ERROR
  `REGISTER_PROMPT_CONTRACT_HASH_MISMATCH`: the live register holds the older fingerprints), and the two shapes would
  not run on the same register rows.
- `tools/preview-practice/shape-policy-start.json` holds the owners' start values: rulings S5 to S8, with the angle map
  as the opening. A unit test keeps it equal to the start values in the code.
  - A file that does not pass the register's own check is refused before anything starts, with
    `PRACTICE_SHAPE_POLICY_INVALID`.
  - The refusal names only the place in the file that is wrong.
  - A file that switches the row off (`"enabled": false`, the preview's way back) is refused too: it could never run
    the new shape. The start-values file never holds `enabled` (absent means on).
- `--depth-mode fixed|adaptive`, `--scrutiny standard|deep|exhaustive` and `--answer-length short|standard|detailed`
  ask the practice debate with these settings, as the /new page sends them.
  - The ask path adjusts them for the plan exactly as the site does. The practice asks as a premium person with no plan
    id, so the `premium` sizes apply.
  - Each one left out is the site's default: adaptive, standard, standard.
  - Without a debate-shape row they would be ignored, so they are refused before any AI is asked, with
    `PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW`.
- Only debate reads these four flags. Every other mode refuses them, and a mistyped flag is refused before anything
  starts (`PRACTICE_FLAG_UNKNOWN`).

With the row, `report.json` gains a `shape` block, and `report.md` a "Debate shape" paragraph with no reply text. The
block holds:

- `source`: FLAG for `--shape-policy`, REGISTER for a register that already holds the row;
- `registerVersion`: the throwaway version the debate ran on;
- `row`: ADDED or REPLACED;
- `asked`: the three settings as given;
- `storedDepthParams`: what the ask path stored for the run;
- `sizes`: the sizes frozen on the run's money receipt (plan, map AIs, answers, graders, close-call extra graders,
  points per answer, deeper points, gap rounds, the three settings, the opening);
- `opening`: the opening the debate used. It is `TODAYS_OPENING` when the map was unavailable, or gave fewer than two
  answers to argue, and each AI argued its own position, as today;
- `mapCallsByStep`: the map's calls by step (angles, list, merge, gap, choose), every try as the ledger recorded it;
- `chosenAnswers` and `alsoRaised`: how many different answers the map chose to argue, and how many points came up but
  were not debated. When fewer than two answers were chosen, the points are still counted here, but the story and the
  debate page show none of them (today's opening was argued instead);
- `mapMarks`: the map's fallback marks, with how often each came up (for example `ANSWERS_FILLED`);
- `panelCloseCallExtensions` and `scrutinyExtensions`: how many points had a close call that called for extra graders
  (counted even when an extra grader then failed), and how many points scrutiny examined further (one count per point,
  not per exchange);
- `notExercised`: why the new shape did not run, else null.

Map calls also count everywhere else, like any other call:

- in `byModelAndSite`, as the site `MAP`;
- for the format rule.

With `--transcript`, `transcript.json` gains `structure.map`:

- the map's items: every point and candidate answer, with the AI that wrote it;
- the choice: the answers argued and the points also raised.

A debate asked for the new shape that did not run it is NOT_PROVEN (exit 30), with the reason
`SHAPE_NOT_EXERCISED:<why>`:

- `MAP_UNAVAILABLE_TODAYS_OPENING`: fewer than two map lists came back, so the opening fell back to today's (the map's
  stored choice says so even when no answer was served);
- `MAP_ANSWERS_NOT_ARGUED`: the map gave fewer than two answers to argue, so each AI argued its own opening, as today;
- `NO_MAP_STORED`: the run kept no map at all (it stopped before the map);
- `NO_SHAPE_ON_RECEIPT`: the run was admitted without the shape;
- `FACTS_UNREADABLE:<code>`: what the run did could not be read.

Without `--shape-policy`, on a register without the row, nothing changes: today's shape, and no `shape` block.

Switching the new shape on for the site is a separate set of owner steps, listed in the plans and not done by this
tool: publish a register version with this code's prompt fingerprints; run migration 0117 before the hosted mode;
keep the row out of force until the /new page's language pop-up (P2L Task 18) is deployed (L-POPUP-FIRST); fix the
re-claim bug first (task_205182c8); publish the support article (C-ARTICLE); and let running debates finish first.

To run the new shape, add `--register-next` (see above) and the start values to S-6's debate command (S-3 first, as
always):

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question ro --register-next --shape-policy tools/preview-practice/shape-policy-start.json --out "$P/debate-shape-report"
echo "exit: $?"
```
````

(c) Insert this section right before `### S-7, stop and clean up`. Changed on 2026-10-14: the judging sentence on one line (pre-flight PF-D16); the working folder kept across days (pre-flight PF-D17); the story's answers note checked (pre-flight PF-D18); cost, room, time and the call setting (pre-flight PF-D19); both arms and the release debate with `--register-next` (pre-flight PF-D2, controller ruling D-BOTHNEXT). No tag goes into the README text itself:

````markdown
### S-8, Mac: the whole-debate comparison (today's shape and the new shape)

What it is, in plain words:

- The same four fixed questions are argued twice each, at depth 1 with all five AIs: once in today's shape and once in
  the new shape (the owners' start values). Both run with `--register-next`, so the two differ only by the
  debate-shape row (see "The new debate shape").
- Each run gets its own `--out` folder: `$P/compare/<question>/today` and `$P/compare/<question>/shape`.
- Each folder holds `report.json`, `report.md` and `transcript.json`.
- The tool only runs and records the debates.
  The results are judged by the owners' private method, outside this repository. Nothing in this README or in the
  tool is part of that method.

The four questions are fixed in the code (`practice-questions.ts`). Each one is word for word the openings question of
the same id, so the Phase 1 data lines up:

| Id | Language | Kind |
|---|---|---|
| `ro-euro` | Romanian | public policy |
| `ro-strainatate` | Romanian | personal decision |
| `en-nuclear` | English | contested fact |
| `en-social-media-age` | English | ethics |

**The working folder.** S-8 runs over several days. S-5's folder (`P=$(mktemp -d /tmp/dpr.XXXXXX)`) is a new one each
time and may be emptied when the Mac restarts, so S-8 keeps one folder of its own, in your home folder, outside the
repository. On day 1 only, run these two lines in place of S-5's `P=` line (if `mkdir` says the folder exists, an
earlier comparison is in it: choose another name and use it on every day):

```sh
P="$HOME/debate-shape-s8"
mkdir -m 700 "$P"
```

Every later day, in each terminal, run only the first of those two lines in place of S-5's `P=` line, then the rest of
S-5 as written: its `scp` copies the day's fresh settings and register export into the same folder (the settings hold
no key, see S-2). At the end of each day, keep a dated copy of the results somewhere else too:

```sh
cp -Rp "$P/compare" "$HOME/debate-shape-s8-compare-$(date +%Y-%m-%d)"
```

**The pass bar comes first** (the owner's rule: before any upload, a practice with all real AIs must pass):

1. Day 1: run S-3, then S-6's formats. It must PASS. For exit 10 the owner decides, as in the table above.
2. Then run the first pair on `ro-euro`, today's shape first. Both debates must PASS:
   - today's shape is the release's practice debate, because the upload ships with the row absent, so the site keeps
     today's shape, and with a new register version carrying this code's three prompt fingerprints (P2b OWNER STEP
     PF-B13). That is why this debate runs with `--register-next` too: it practises that very version;
   - the new shape proves the shape.

   If either is FAIL, stop: nothing is uploaded and the comparison waits for a fix. These two runs are also the
   comparison's first pair.

**One pair a day after that:**

| Day | Pair | Order |
|---|---|---|
| 2 | `ro-strainatate` | new shape first |
| 3 | `en-nuclear` | today's shape first |
| 4 | `en-social-media-age` | new shape first |

Money and time, within the owner's test budget of $5 DeepInfra and $1 Haiku a day:

- **Cost per debate.** A depth-1 debate costs roughly $0.15 to $0.70 in today's shape and about $0.30 in the new shape,
  plus one fast language check by Haiku per new-shape debate (about $0.00013, on the Anthropic gate). Formats costs
  $0.10 to $0.30. The whole comparison is about $1.9 to $4.3 (four debates in each shape and day 1's formats),
  spread over at least four days. A pair run again adds about $0.45 to $1, so keep room for reruns (up to about $6 in
  all).
- **Room the estimate needs.** The start-of-debate estimate needs more room left than a debate spends: about $4
  DeepInfra and $0.90 Anthropic for depth 1 in today's shape. So the second debate of a day may be refused at the ask.
  Then the report's first reason starts with `ADMISSION_REFUSED:`, and nothing but the AIs' health checks was spent.
  - The new shape's estimate may need more room (the map's merge and choose steps are each counted in full on both
    gates). Read the first new-shape run's admission figures before you plan the next day: whether it was admitted,
    and each gate's `remainingBefore` in `report.json`.
  - Run that debate first thing the next Bucharest day, into the same folder.
  - Note in your own log that the pair was split over two days.
- **Daily stop.** After every run, read the "spent by the gate's count" on each gate's line in `report.md`. Stop for
  the day once the day's runs add up to $4.50 DeepInfra or $0.90 Anthropic. Haiku is the only AI on the Anthropic gate,
  so its line is Haiku's share.
- **Time.** Both debates of a pair run with the same call setting: the same `--call-concurrency` value on both
  commands, or none on either. The commands below give none, so they use the register's own setting, which on today's
  preview is one call at a time: a debate then takes about 1 to 2 hours, so a pair fits in one relay lifetime (S-4: 8
  hours). With calls at the same time (for example `--call-concurrency 12/3/default=50,deepinfra=150,anthropic=50`
  added to both commands, only after the gate check under "Safety rules built in"), a whole debate in today's shape
  took 53 minutes when it was measured (2026-10-13). If the relay has ended, restart it as described under S-6.

Each run: set the question, repeat S-3 and copy the status files down, then run the two commands in the day's order.
Repeat S-3 and the `scp` line before the second command too.

```sh
Q=ro-euro
```

Today's shape:

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question "$Q" --register-next --transcript --out "$P/compare/$Q/today"
echo "exit: $?"
```

The new shape:

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question "$Q" --register-next --shape-policy tools/preview-practice/shape-policy-start.json --transcript --out "$P/compare/$Q/shape"
echo "exit: $?"
```

What to check after each run:

- **The verdict.** A FAIL or HARNESS_ERROR stops the comparison until it is understood. NOT_PROVEN means some AI sat
  out, or, for the new shape, the shape did not run (`SHAPE_NOT_EXERCISED`). Run that question's pair again on another
  day.
- **The new shape's report.md.** Its "Debate shape" paragraph must say the opening used was `ANGLE_MAP` and must list
  the chosen answers.
- **The story's note on the answers.** When the "Debate shape" paragraph says the new shape was not exercised because
  of `MAP_UNAVAILABLE_TODAYS_OPENING` or `MAP_ANSWERS_NOT_ARGUED`, or its map marks list `ANSWERS_FILLED` or
  `CHOOSE_QUOTA_FILLED`, the story owes the person one plain sentence on how the argued answers came about. Read the
  story in `transcript.json` (`structure.story`). It must say, in the question's language, either "We could not first
  gather every possible answer, so each AI argued the answer it found best." (for the first two codes) or "Some of the
  answers or points argued here were added to make sure enough options were tested." (for the last two). If the story
  leaves it out, note it for the owners with the question's id: it is a finding, not a verdict.

Keep `$P/compare` with the other reports (S-7 deletes only `$D`; `$P` here is the folder in your home folder, made on
day 1). It holds only our own practice questions and the AIs' text about them.
````

(d) In "Optional flags", the **debate** bullet (today `README.md:445-458`) keeps every word it has today, its `--call-concurrency` text and its whole `--register-next` paragraph included (pre-flight PF-D1). Make three insertions in it, nothing else (pre-flight check 2026-10-14):

1. After `` `--question ro|en` `` (first line), insert `` or one of the comparison's ids (`ro-euro`, `ro-strainatate`, `en-nuclear`, `en-social-media-age`, see S-8) ``, before the comma.
2. After `debate, word for word" above)` (fifth line), and before `. The register is copied`, insert `` , `--shape-policy FILE`, `--depth-mode fixed|adaptive`, `--scrutiny standard|deep|exhaustive` and `--answer-length short|standard|detailed` (see "The new debate shape"; debate only) ``.
3. After the bullet's last sentence (`` A checkout that changes no row refuses (`PRACTICE_REGISTER_NEXT_UNSUPPORTED`). ``), add one sentence (controller ruling D-REGNEXT).

The whole bullet then reads, rewrapped only where an insertion lengthened a line:

```markdown
- debate: `--depth 1|2`, `--question ro|en` or one of the comparison's ids (`ro-euro`, `ro-strainatate`, `en-nuclear`,
  `en-social-media-age`, see S-8), `--call-concurrency A/B/default=N,deepinfra=N,anthropic=N` (A: calls at
  once in the debate, 1 to 64; B: calls at once to one model in the debate, 1 to 16; each N: calls at once to one model
  across the runner for that vendor, 1 to 1000, `default` required; for example `12/3/default=50,deepinfra=150,anthropic=50`;
  formats, openings and report refuse it), `--transcript` (also write `transcript.json`: every prompt and every answer, see "The whole
  debate, word for word" above), `--shape-policy FILE`, `--depth-mode fixed|adaptive`, `--scrutiny standard|deep|exhaustive`
  and `--answer-length short|standard|detailed` (see "The new debate shape"; debate only). The register is copied only
  through the register's own publication paths; an export holding a support-configuration version refuses
  (`PRACTICE_REGISTER_PATH_UNSUPPORTED`).
  `--register-next` practises a release that needs a NEW register version (new sealed prompts) before it is uploaded:
  the export is imported as always, then this checkout's next version is composed on its newest version by the
  preview publish kit itself (`buildPreviewSourceRowsV2` and `composePreviewSnapshotV2`, with the newest version's own
  checker choice, rotation switch and measured runtime), published on top in the throwaway database, and the debate
  runs on it. The settings file stays the live one (its `REGISTER_VERSION` must still be the export's newest version).
  The progress line and `report.json` (`register.codeNext`) name every row the next version changes: on the server,
  the publish proposal must show the same rows (plus `nodeRuntimeVersion`'s source reference, which the server
  measures again). A checkout that changes no row refuses (`PRACTICE_REGISTER_NEXT_UNSUPPORTED`).
  With `--shape-policy`, the debate-shape row goes into that next version too (no other version is made), so
  `register.codeNext` also names `debateShapePolicy`, which the release's own publish leaves out.
```

(e) In "## Money and time (rough)", after the **debate** bullet, add:

```markdown
- debate in the new shape (`--shape-policy`), depth 1: about $0.30 (spec 2026-10-12), with fewer calls than today's
  shape, plus one fast language check by Haiku on the Anthropic gate (about $0.00013). Its start-of-debate estimate may
  need more room than today's shape (the map's merge and choose steps are each counted in full on both gates): read
  the first new-shape run's admission figures (S-8, "Room the estimate needs").
- the whole-debate comparison (S-8): eight depth-1 debates over at least four days, about $1.9 to $4.3 in all with
  day 1's formats; a pair run again adds about $0.45 to $1, so allow up to about $6 for reruns.
```

(f) In "## Files", add these two bullets right after the bullet that names `practice-debate.ts` (pre-flight check 2026-10-14: no bullet starts with it; it is the bullet that starts `` - `practice-lanes.ts`, `practice-formats.ts` `` and ends `` `--transcript` file. ``):

```markdown
- `practice-shape.ts`: the debate-shape flags (`--shape-policy`, `--depth-mode`, `--scrutiny`, `--answer-length`), what
  the shape run did (the report's `shape` block, the transcript's `structure.map`).
- `shape-policy-start.json`: the owners' start values for `--shape-policy`.
```

In the tests bullet (`- Tests: …`), add the line `  tests/unit/preview-practice-shape.test.ts,` right before `  tests/unit/preview-practice-side-by-side.test.ts,` (pre-flight check 2026-10-14).

(g) In "## The result", in the exit-code table's row `| 30 | NOT_PROVEN | …` (`README.md:149`), replace "so some model was not tested to the end." with "so some model was not tested to the end, or a debate asked for the new shape did not run it (`SHAPE_NOT_EXERCISED:<why>`, see "The new debate shape")." (pre-flight PF-D19). Then delete the empty line right after that row (`README.md:150`): it ends the table, so the 40 and 50 rows show as plain text (pre-flight check 2026-10-14).

- [ ] **Step 4: Run and expect PASS**

Run: `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts`
Expected: PASS (26 tests: 23 after Task 4, plus this task's 3; pre-flight PF-D9).

- [ ] **Step 5: The README's export SQL is still read by the integration test.** Section (b) and section (c) contain no `-c "SELECT json_build_object(` line, so S-1's single statement stays the only match. Confirm with:

`grep -c "SELECT json_build_object('schema','preview-practice-register-export-v1'" tools/preview-practice/README.md`
Expected: `1`.

- [ ] **Step 6: Commit**

```bash
git add tools/preview-practice/README.md tests/unit/preview-practice-shape.test.ts
git commit -m "Practice README: the new debate shape, its flags and report, and S-8 the whole-debate comparison (pass bar first, four fixed questions, two folders each, within the daily test budget; judged outside the repository)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7b: The question language: the `language` practice mode, the language cases and the debate's language flags

Source: P2L "Cross-plan amendments" → "P2d" items 1–6, adjusted for controller ruling CR-3 (the planner's disagreement is operator-only: a map NOTE stored in `core.map_choice` content, never a condition mark). Runs after Task 7 (its README test reads the commands this task adds). Also the P2L final review's notes for P2d practice (`.superpowers/sdd/2026-10-13-debate-shape-phase2-language/final-review.md`, "P2d practice"): answer an offer with KEEP_MINE, and add the I1 and I3 cases (pre-flight PF-D25, PF-D26).

**Files:**
- Modify: `tools/preview-practice/practice-questions.ts` (`PracticeLanguageCase`, `PRACTICE_LANGUAGE_CASES`; `practiceDebateQuestion` accepts the case ids)
- Create: `tools/preview-practice/practice-language.ts`
- Modify: `tools/preview-practice/practice-openings-dry.ts` (export `openingsDryVendorReply`; nothing else changes)
- Modify: `tools/preview-practice/practice.ts` (mode `language`, real and `--dry`; the two debate flags)
- Modify: `tools/preview-practice/practice-debate.ts` (`site_language`, the offer answered, `onQuestionLanguage`, the `language` block)
- Modify: `tools/preview-practice/practice-report.ts` (`language` in the debate's report.json; the language lines in report.md, both modes)
- Modify: `tools/preview-practice/README.md` ("The question language" section, S-8, flags, files, money)
- Test: `tests/unit/preview-practice-language.test.ts` (create)
- Modify: `tests/integration/preview-practice-run.test.ts` (a new describe for the language mode; the shape case checks the `language` block)

**Interfaces:**
- Consumes:
  - P2L Task 1 (`@debateai/kernel`): `questionLanguageOf(code, questionLine?)`, `lockedReplyLanguageExpectation(language, questionLine)`, `QuestionLanguage`; `detectArgumentLanguage` and `TypedDomainError` (existing);
  - P2L Task 2 (`apps/api/src/question-language/eld.ts`): `loadEldReader`, `EldReader`, `EldReading` (`{ code, reliable, letters, segments }`: `segments` holds one reading per clause, ruling L-MIX; eld.ts:25; pre-flight PF-D21);
  - P2L Task 3 (`apps/api/src/question-language/eld-tuning.ts`): `ELD_TUNING` (its `database` size and `minLetters`), `eldConfident`, `eldSeesMix`;
  - the API's boot check (`apps/api/src/question-language/boot.ts:49`): `assertQuestionLanguagePolicyBootable(policy, route)`, with the route `{ kind: "PREVIEW", fetch }`; it throws a `TypedDomainError` whose code is the refusal (pre-flight PF-D24);
  - P2L Task 4 (`@debateai/register`): `questionLanguagePolicyStartValues`, `parseQuestionLanguagePolicy`, `QUESTION_LANGUAGE_POLICY_ROW_KEY`, `QuestionLanguagePolicy` (its `fastCheck` holds `model` and `timeoutMs`, its `instruction` the owners' text);
  - P2L Task 5 (`apps/api/src/question-language/fast-check.ts`): `createFastCheck({ transport, instruction, timeoutMs })`, `FastCheckReading` (`DOWN` with a reason; `ONE` with `main`; `MIX` with `main`, `seen` and either a `proposed` string, or `proposed: null` with its `rewriteRefusal`, ruling L-REWRITE), `QUESTION_LANGUAGE_CHECK_CONTRACT_ID`, `readQuestionLanguageReply` (test only);
  - P2L Task 6 (`apps/api/src/question-language/transport.ts`): `anthropicFastCheckTransport({ fetch, url, credential, settings })`; `PREVIEW_ANTHROPIC_MESSAGES_URL` and `createPreviewGuardedFetch` (`@debateai/providers`, existing);
  - P2L Task 7 (`apps/api/src/question-language/decide.ts`): `decideBeforeFast(site, eld, questionLine, { fastCheckAvailable, fastCheckAllowed })`, `decideAfterFast(site, eld, fast, questionLine, maxQuestionBytes)`, `decisionRecordCode(decision)`, `LockSource` (pre-flight PF-D22: the practice no longer calls `eldSettles` on its own);
  - P2L Task 9 (`@debateai/contract`): `SITE_LANGUAGE_CODES`; the ask's `site_language` and `question_language_choice` (`{ check_ref, choice: "USE_REWRITE" | "KEEP_MINE", original_question_line? }`);
  - P2L Tasks 10–12: `QuestionLanguageLock` (with `recordCode`, `localReason` and `trace`) and `QuestionLanguageTrace` (`apps/api/src/question-language/decider.ts:31`, `:57`); `QuestionLanguageChoiceNeeded` (its `offer`: `check_ref`, `main_language`, `languages_seen`, `proposed_question`; its `trace`; and `QuestionLanguageChoiceNeeded.from(body, trace)`, null when the contract's 409 body refuses it) and `ASK_QUESTION_MAX_BYTES`, both exported by `@debateai/api` (apps/api/src/index.ts:170 and :1541); `composePracticeAsk`'s optional `onQuestionLanguage` argument (practice-ask-composition.ts:90);
  - P2L Task 15 / P2b Task 8 (`@debateai/map`): `MapChoiceRepository#readMapResultForRun(runId)` → `MapResult` with `plannerLanguage: string | null` and `notes` (a `LANGUAGE_PLANNER_DISAGREES` note: `{ note, step: "ANGLES", detail: "<locked>:<planner>" }`); `mapAnglesSpec` (its context still requires `replyLanguage`, specs.ts:61-68), `mapProviderPieces` (its `readAccepted` returns `MapAnglesReply`, whose `question_language?: string` needs no cast), `mapPrimarySubtag` (the map's own reading of the planner's code, orchestrator.ts:191-198; pre-flight PF-D23), `mapPromptContractHash`, `MAP_CONTRACT_IDS` (existing);
  - existing practice pieces: `practiceJobGateway` (returns `{ gateway, sink, endedBusy }`), `practiceTurnOrder`, `errorCodeOf`, `onePerModel`, `practiceDeclaredTargets`, `practiceRunnerPolicy` (practice-formats.ts); `openingsDryConfig`, `openingsDryTargets`, `openingsDryPacket`, `openingsDryContent` (practice-openings-dry.ts); `PracticeJsonlWriter` (practice-samples-log.ts); `reportableReplyText` (practice-redaction.ts); `PRACTICE_EXIT_CODES`, `PracticeVerdict` (practice-verdict.ts); `PracticeGateObserver`.
- Produces:
```ts
// tools/preview-practice/practice-questions.ts
export type PracticeLanguageCase = Readonly<{ id: string; site: string; questionLine: string; expectedLock: string; offerExpected: boolean;
  fastCheck?: "OFF" }>;
export const PRACTICE_LANGUAGE_CASES: readonly PracticeLanguageCase[];          // the nine cases: P2L's seven, then the final review's I3 and I1
// tools/preview-practice/practice-language.ts: debate mode
export const PRACTICE_LANGUAGE_FLAGS: readonly ["--site-language", "--language-choice"];
export type PracticeLanguageChoice = "use" | "keep";
export type PracticeDebateLanguage = Readonly<{ siteLanguage: string | null; choice: PracticeLanguageChoice }>;
export function practiceDebateLanguageFromArgs(mode: string, flags: ReadonlyMap<string, string>): PracticeDebateLanguage | null;
export function practiceSiteLanguageOfTag(tag: string): string;
export function practiceSiteLanguageFor(questionLine: string): string;
export function practiceLanguageResubmission(request: AskRequest, offer: Readonly<{ check_ref: string; proposed_question: string }>,
  choice: PracticeLanguageChoice): AskRequest;
export type PracticeMapLanguage = Readonly<{ plannerLanguage: string | null; disagrees: boolean; detail: string | null }>;
export async function readPracticeMapLanguage(pool: Pool, runId: string): Promise<PracticeMapLanguage | null>;
export type PracticeDebateLanguageBlock = Readonly<{ siteLanguage: string; offered: boolean; choice: "USE_REWRITE" | "KEEP_MINE" | null;
  lock: Readonly<{ code: string; source: string; recordCode: string; localReason: string | null; fast: QuestionLanguageTrace["fast"] }> | null;
  rewriteUsed: boolean; storedLanguage: string | null; plannerLanguage: string | null; plannerDisagrees: boolean | null }>;
export function practiceDebateLanguageBlock(input: Readonly<{ siteLanguage: string; outcomes: readonly (QuestionLanguageLock | QuestionLanguageChoiceNeeded)[];
  choice: "USE_REWRITE" | "KEEP_MINE" | null; planner: PracticeMapLanguage | null; storedLanguage: string | null }>): PracticeDebateLanguageBlock;
export function practiceDebateLanguageLines(block: PracticeDebateLanguageBlock): readonly string[];
// tools/preview-practice/practice-language.ts: mode "language"
export const PRACTICE_LANGUAGE_SCHEMA: "preview-practice-language-v1";
export const PRACTICE_LANGUAGE_FILE: "language.jsonl";
export type PracticeFastCheckRecord = Readonly<{ outcome: "ONE" | "MIX" | "DOWN"; reason: string | null; mainLanguage: string | null;
  languagesSeen: readonly string[]; isRealMix: boolean; proposedQuestion: string | null; rewriteRefusal: string | null }>;
export function practiceFastCheckRecord(reading: FastCheckReading): PracticeFastCheckRecord;
export type PracticeLanguageOutcome = Readonly<{ lock: string; source: LockSource | "OFFER"; recordCode: string; offered: boolean; fastNeeded: boolean;
  proposedQuestion: string | null }>;
export function practiceLanguageOutcome(site: QuestionLanguage, eld: EldReading, fast: FastCheckReading, questionLine: string, maxQuestionBytes: number,
  fastCheckAvailable?: boolean): PracticeLanguageOutcome;
export type PracticePlannerRecord = Readonly<{ status: "ANSWERED" | "FAILED" | "BUSY" | "NOT_SENT"; code: string | null; model: string | null;
  questionLanguage: string | null; disagrees: boolean | null }>;
export function practicePlannerLanguage(named: string | undefined): string | null;
export function practicePlannerDisagrees(lock: string, named: string | null): boolean | null;
export type PracticeLanguageCaseRecord = Readonly<{ id: string; siteLanguage: string; questionSha256: string;
  eld: Readonly<{ code: string | null; reliable: boolean; letters: number; confident: boolean; seesMix: boolean }>; fastCheck: PracticeFastCheckRecord;
  lock: string; lockSource: LockSource | "OFFER"; recordCode: string; fastNeeded: boolean; offered: boolean;
  expected: Readonly<{ lock: string; offer: boolean }>; planner: PracticePlannerRecord }>;
export function practiceLanguageCaseRecord(input: Readonly<{ entry: PracticeLanguageCase; eld: EldReading; fast: FastCheckReading;
  outcome: PracticeLanguageOutcome; planner: PracticePlannerRecord }>): PracticeLanguageCaseRecord;
export type PracticeLanguageNotRun = Readonly<{ id: string; code: string }>;
export function practiceLanguageCaseVerdict(record: PracticeLanguageCaseRecord): Readonly<{ verdict: "PASS" | "FAIL" | "NOT_PROVEN"; reasons: readonly string[] }>;
export function practiceLanguageVerdict(records: readonly PracticeLanguageCaseRecord[], notRun: readonly PracticeLanguageNotRun[]):
  Readonly<{ verdict: PracticeVerdict; exitCode: number; reasons: readonly string[] }>;
export function practiceLanguageLines(records: readonly PracticeLanguageCaseRecord[], notRun: readonly PracticeLanguageNotRun[]): readonly string[];
export function practiceLanguageReport(input: Readonly<{ dry: boolean; startedAt: Date; finishedAt: Date; policySource: "REGISTER_EXPORT" | "START_VALUES";
  fastCheckModel: string; records: readonly PracticeLanguageCaseRecord[]; notRun: readonly PracticeLanguageNotRun[]; observer: PracticeGateObserver }>): PracticeReport;
export type PracticeLanguagePolicyChoice = Readonly<{ policy: QuestionLanguagePolicy; source: "REGISTER_EXPORT" | "START_VALUES" }>;
export function practiceLanguagePolicy(document: PracticeRegisterExport | null): PracticeLanguagePolicyChoice;
export type PracticeLanguageRunInput = Readonly<{ config: PreviewProviderTestConfig; targets: readonly ProviderDiscoveryTarget[]; ports: PreviewBudgetPorts;
  observer: PracticeGateObserver; policy: QuestionLanguagePolicy; bound: CallBound; cases?: readonly PracticeLanguageCase[]; eld?: EldReader;
  sleep?: (milliseconds: number) => Promise<void>; progress?: (line: string) => void; shouldStop?: () => boolean;
  onCase?: (record: PracticeLanguageCaseRecord) => void; onNotRun?: (entry: PracticeLanguageNotRun) => void }>;
export async function runPracticeLanguage(input: PracticeLanguageRunInput): Promise<Readonly<{ records: readonly PracticeLanguageCaseRecord[]; notRun: readonly PracticeLanguageNotRun[] }>>;
export async function runPracticeLanguageMode(input: PracticeLanguageRunInput & Readonly<{ folder: string; dry: boolean;
  policySource: "REGISTER_EXPORT" | "START_VALUES"; startedAt: Date }>): Promise<PracticeReport>;
export const PRACTICE_LANGUAGE_DRY_REWRITES: Readonly<Record<string, string>>;
export function practiceLanguageDryReading(questionLine: string): string;
export function practiceLanguageDryPorts(): Readonly<{ ports: Readonly<{ deepinfra: PreviewBudgetPort; anthropic: PreviewBudgetPort }> }>;
// tools/preview-practice/practice-openings-dry.ts: `openingsDryVendorReply` becomes exported (same signature).
// practice-debate.ts: runPracticeDebate input gains `language?: PracticeDebateLanguage`; PracticeDebateResult gains `language?: PracticeDebateLanguageBlock`.
```

- [ ] **Step 1: Write the failing test** `tests/unit/preview-practice-language.test.ts`

```ts
// The preview practice's question-language support (question-language spec 2026-10-13; P2L cross-plan amendments
// P2d-2..P2d-6 and controller ruling CR-3; plan 2026-10-12-debate-shape-phase2d Task 7b): the fixed cases, the lock as
// the site's decider computes it, the recorded readings, the verdict, the report lines, debate mode's two flags, the
// resubmission after an offer, the dry reading and the README's commands.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QuestionLanguageChoiceNeeded } from "@debateai/api";
import { SITE_LANGUAGE_CODES, type AskRequest } from "@debateai/contract";
import { questionLanguageOf } from "@debateai/kernel";
import { ELD_TUNING } from "../../apps/api/src/question-language/eld-tuning.js";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import type { EldReading } from "../../apps/api/src/question-language/eld.js";
import { readQuestionLanguageReply, type FastCheckReading } from "../../apps/api/src/question-language/fast-check.js";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import {
  PRACTICE_LANGUAGE_DRY_REWRITES,
  practiceDebateLanguageBlock,
  practiceDebateLanguageFromArgs,
  practiceDebateLanguageLines,
  practiceFastCheckRecord,
  practiceLanguageCaseRecord,
  practiceLanguageDryReading,
  practiceLanguageLines,
  practiceLanguageOutcome,
  practiceLanguageReport,
  practiceLanguageResubmission,
  practiceLanguageVerdict,
  practicePlannerDisagrees,
  practicePlannerLanguage,
  practiceSiteLanguageOfTag,
  type PracticeLanguageCaseRecord,
  type PracticePlannerRecord
} from "../../tools/preview-practice/practice-language.js";
import { PRACTICE_LANGUAGE_CASES, practiceDebateQuestion, type PracticeLanguageCase } from "../../tools/preview-practice/practice-questions.js";
import { PRACTICE_REPORT_SCHEMA, reportMarkdown } from "../../tools/preview-practice/practice-report.js";

const RO = { code: "ro", name: "Romanian" };
const EN = { code: "en", name: "English" };
const ID = { code: "id", name: "Indonesian" };
const SR_LATN = { code: "sr-Latn", name: "Serbian (Latin script)" };
// German: a site that is not always-ask, so eld may settle there. No practice case sits on it (controller ruling
// D-SETTLE: ro, en and id are always-ask by ruling L-KEEP), so eld's settling is shown here only (pre-flight PF-D20).
const DE = { code: "de", name: "German" };
const GERMAN = "Sollte Deutschland die Schuldenbremse lockern?";
// eld's reading carries one reading per clause (ruling L-MIX; pre-flight PF-D21); none here unless a test sets them.
const sure = (code: string): EldReading => ({ code, reliable: true, letters: ELD_TUNING.minLetters + 40, segments: [] });
const unsure: EldReading = { code: "ro", reliable: false, letters: 12, segments: [] };
const NO_READING: EldReading = { code: null, reliable: false, letters: 0, segments: [] };
const MAX = 8192;
const REWRITE = "Ar trebui România să adopte euro sau să aștepte până cresc salariile?";
const caseOf = (id: string): PracticeLanguageCase => PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === id)!;
const MIX = caseOf("lang-ro-en-mix");
/** The lock's own language, as the kernel names it (sr-Latn from the question's letters). */
const lockOf = (entry: PracticeLanguageCase) => questionLanguageOf(entry.expectedLock.split("-")[0]!, entry.questionLine)!;
/** The reading each case expects from the fast check: one language, or the mix with its rewrite. */
const expectedReading = (entry: PracticeLanguageCase): FastCheckReading => entry.offerExpected
  ? { kind: "MIX", main: lockOf(entry), seen: [lockOf(entry), EN], proposed: REWRITE }
  : { kind: "ONE", main: lockOf(entry) };
const answered = (lock: string, named: string | null): PracticePlannerRecord => ({ status: "ANSWERED", code: null,
  model: "zai-org/GLM-5.3-Flash", questionLanguage: named, disagrees: practicePlannerDisagrees(lock, named) });
const recordOf = (entry: PracticeLanguageCase, eld: EldReading, fast: FastCheckReading, named?: string | null): PracticeLanguageCaseRecord => {
  const outcome = practiceLanguageOutcome(questionLanguageOf(entry.site)!, eld, fast, entry.questionLine, MAX, entry.fastCheck !== "OFF");
  return practiceLanguageCaseRecord({ entry, eld, fast, outcome, planner: answered(outcome.lock, named === undefined ? outcome.lock : named) });
};
/** Every case read as expected, eld unsure of each (so the fast reading decides, except where the fast check is off). */
const allRight = (): PracticeLanguageCaseRecord[] => PRACTICE_LANGUAGE_CASES.map((entry) => recordOf(entry, NO_READING, expectedReading(entry)));

describe("practice language: the fixed cases (P2L amendment P2d-3 word for word, then the P2L final review's I3 and I1)", () => {
  it("the nine cases, each with its site, the lock it must reach, whether it must be offered a rewrite and whether the fast check is off", () => {
    expect(PRACTICE_LANGUAGE_CASES.map((entry) => [entry.id, entry.site, entry.questionLine, entry.expectedLock, entry.offerExpected,
      entry.fastCheck ?? "ON"])).toEqual([
      ["lang-ro-plain", "ro", "Ar trebui sa renuntam la leu si sa trecem la euro?", "ro", false, "ON"],
      ["lang-ro-en-mix", "ro", "Ar trebui România să adopte euro, or should it wait until wages catch up?", "ro", true, "ON"],
      ["lang-en-on-ro", "ro", "Should Romania adopt the euro before 2030?", "en", false, "ON"],
      ["lang-short-code", "en", "Is `rm -rf /` ever safe in CI?", "en", false, "ON"],
      ["lang-sr-latn", "ro", "Da li bi Srbija trebalo da uvede evro?", "sr-Latn", false, "ON"],
      ["lang-id", "id", "Apakah Indonesia harus menaikkan pajak karbon?", "id", false, "ON"],
      ["lang-ro-borrowed", "ro", "Merită să lucrez la un startup de AI în loc de o corporație?", "ro", false, "ON"],
      ["lang-zh-short", "en", "人工智能会取代大多数工作吗？", "zh", false, "OFF"],
      ["lang-ku-arab", "ar", "ئایا دەبێت باجی کاربۆن زیاد بکرێت؟", "ku", false, "ON"]
    ]);
  });

  it("every site is a site language, every lock a language the kernel names, every id a practice debate question", () => {
    for (const entry of PRACTICE_LANGUAGE_CASES) {
      expect(SITE_LANGUAGE_CODES as readonly string[]).toContain(entry.site);
      expect(questionLanguageOf(entry.site), entry.id).not.toBeNull();
      expect(questionLanguageOf(entry.expectedLock.split("-")[0]!, entry.questionLine)?.code, entry.id).toBe(entry.expectedLock);
      expect(practiceDebateQuestion(entry.id)).toEqual({ id: entry.id, questionLine: entry.questionLine });
    }
    // The two added cases sit under eld's own floor (ELD_TUNING.minLetters), so eld is never sure of them, and at or
    // above the script reading's floor (12 letters): lang-zh-short's script decides with the fast check off (I3), and
    // lang-ku-arab, on a site that is not always-ask, is read by the fast check on any tuning (I1).
    for (const id of ["lang-zh-short", "lang-ku-arab"]) {
      const letters = caseOf(id).questionLine.match(/\p{L}/gu)?.length ?? 0;
      expect(letters, id).toBeGreaterThanOrEqual(12);
      expect(letters, id).toBeLessThan(ELD_TUNING.minLetters);
    }
  });
});

describe("practice language: the lock, exactly as the decider computes it", () => {
  it("the lock is computed exactly as the decider does, from recorded readings", () => {
    const mixReading: FastCheckReading = { kind: "MIX", main: RO, seen: [RO, EN], proposed: REWRITE };
    const locked = (lock: string, source: string, fastNeeded: boolean) =>
      ({ lock, source, recordCode: source, offered: false, fastNeeded, proposedQuestion: null });
    // eld confident on the site's own language settles it, but only on a site that is not always-ask (German here,
    // controller ruling D-SETTLE); the fast reading (asked anyway in this mode) is not needed.
    expect(practiceLanguageOutcome(DE, sure("de"), { kind: "ONE", main: EN }, GERMAN, MAX)).toEqual(locked("de", "ELD_SITE", false));
    // Ruling L-MIX: two confident clauses in different languages keep eld from settling, even on German.
    const twoClauses: EldReading = { ...sure("de"), segments: [{ code: "de", reliable: true, letters: 20 }, { code: "en", reliable: true, letters: 20 }] };
    expect(practiceLanguageOutcome(DE, twoClauses, { kind: "ONE", main: DE }, GERMAN, MAX)).toEqual(locked("de", "FAST", true));
    // Ruling L-KEEP: ro, en and id are always-ask sites, so eld never settles there: lang-ro-plain on ro is FAST, never ELD_SITE.
    expect(practiceLanguageOutcome(RO, sure("ro"), { kind: "ONE", main: RO }, caseOf("lang-ro-plain").questionLine, MAX))
      .toEqual(locked("ro", "FAST", true));
    // eld reads another language: the fast reading decides (L5: another language than the site's, no offer).
    expect(practiceLanguageOutcome(RO, sure("en"), { kind: "ONE", main: EN }, caseOf("lang-en-on-ro").questionLine, MAX))
      .toEqual(locked("en", "FAST", true));
    // A real mix with a valid rewrite whose 409 body the contract accepts: the offer; either answer locks the main language.
    expect(practiceLanguageOutcome(RO, unsure, mixReading, MIX.questionLine, MAX))
      .toEqual({ lock: "ro", source: "OFFER", recordCode: "OFFER", offered: true, fastNeeded: true, proposedQuestion: REWRITE });
    // An offer whose body the contract refuses (here a language name over 64 bytes) is never made: the main language is
    // locked, exactly as the decider does it (pre-flight PF-D22).
    const longName = { code: "ro", name: "x".repeat(65) };
    expect(practiceLanguageOutcome(RO, unsure, { kind: "MIX", main: longName, seen: [longName, EN], proposed: REWRITE }, MIX.questionLine, MAX))
      .toEqual({ ...locked("ro", "FAST_MIX_NO_OFFER", true), recordCode: "FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED" });
    // The fast check down: a fallback (eld's confident reading, else the question's script, else the site).
    expect(practiceLanguageOutcome(RO, unsure, { kind: "DOWN", reason: "TIMEOUT" }, MIX.questionLine, MAX)).toEqual(locked("ro", "FALLBACK_SITE", true));
    expect(practiceLanguageOutcome(RO, sure("en"), { kind: "DOWN", reason: "TRANSPORT" }, caseOf("lang-en-on-ro").questionLine, MAX))
      .toEqual(locked("en", "FALLBACK_ELD", true));
    // A site language eld lacks is never settled by eld.
    expect(practiceLanguageOutcome(ID, sure("id"), { kind: "ONE", main: ID }, caseOf("lang-id").questionLine, MAX)).toEqual(locked("id", "FAST", true));
    // The fast check off (lang-zh-short, pre-flight PF-D25): its reading, asked anyway, is not used; a short Chinese
    // question is read by its script (P2L final review I3).
    expect(practiceLanguageOutcome(EN, NO_READING, { kind: "ONE", main: EN }, caseOf("lang-zh-short").questionLine, MAX, false))
      .toEqual(locked("zh", "LOCAL_ELD", false));
  });

  it("records the fast check's reading as read: outcome, main language, languages seen, real mix, rewrite", () => {
    const none = { reason: null, isRealMix: false, proposedQuestion: null, rewriteRefusal: null };
    expect(practiceFastCheckRecord({ kind: "ONE", main: EN })).toEqual({ ...none, outcome: "ONE", mainLanguage: "en", languagesSeen: ["en"] });
    expect(practiceFastCheckRecord({ kind: "MIX", main: RO, seen: [RO, EN], proposed: REWRITE }))
      .toEqual({ ...none, outcome: "MIX", mainLanguage: "ro", languagesSeen: ["ro", "en"], isRealMix: true, proposedQuestion: REWRITE });
    // Ruling L-REWRITE: a real mix whose rewrite the reader discarded keeps the reader's code (pre-flight PF-D22).
    expect(practiceFastCheckRecord({ kind: "MIX", main: RO, seen: [RO, EN], proposed: null, rewriteRefusal: "REWRITE_UNUSABLE:UNCHANGED" }))
      .toEqual({ ...none, outcome: "MIX", mainLanguage: "ro", languagesSeen: ["ro", "en"], isRealMix: true, rewriteRefusal: "REWRITE_UNUSABLE:UNCHANGED" });
    expect(practiceFastCheckRecord({ kind: "DOWN", reason: "UNREADABLE" }))
      .toEqual({ ...none, outcome: "DOWN", reason: "UNREADABLE", mainLanguage: null, languagesSeen: [] });
  });
});

describe("practice language: the verdict (P2L amendment P2d-4, on the practice's own verdicts)", () => {
  it("every case locked as expected and the mix offered: PASS, exit 0", () => {
    expect(practiceLanguageVerdict(allRight(), [])).toEqual({ verdict: "PASS", exitCode: 0, reasons: [] });
  });

  it("a wrong lock or a mix that was not offered is FAIL", () => {
    const wrong = recordOf(caseOf("lang-en-on-ro"), unsure, { kind: "ONE", main: RO });
    expect(practiceLanguageVerdict([wrong], [])).toEqual({ verdict: "FAIL", exitCode: 20, reasons: ["LANGUAGE_WRONG_LOCK:lang-en-on-ro"] });
    // On its own site (ro, always-ask: ruling L-KEEP) the mix can miss its offer only on the fast check's side: here the
    // reader discarded its rewrite (ruling L-REWRITE). The reason carries the decider's record code (pre-flight PF-D22).
    const refused = recordOf(MIX, unsure, { kind: "MIX", main: RO, seen: [RO, EN], proposed: null, rewriteRefusal: "REWRITE_UNUSABLE:OTHER_LANGUAGE" });
    expect(refused).toMatchObject({ lock: "ro", lockSource: "FAST_MIX_NO_OFFER", recordCode: "FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:OTHER_LANGUAGE",
      offered: false, fastCheck: { outcome: "MIX", rewriteRefusal: "REWRITE_UNUSABLE:OTHER_LANGUAGE" } });
    expect(practiceLanguageVerdict([refused], [])).toEqual({ verdict: "FAIL", exitCode: 20,
      reasons: ["LANGUAGE_MIX_NOT_OFFERED:lang-ro-en-mix:FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:OTHER_LANGUAGE"] });
    // eld settles a mixed question on a site that is not always-ask (German, built here: no practice case sits there,
    // controller ruling D-SETTLE): the right lock, but the person is never offered the rewrite (pre-flight PF-D20).
    const settled = recordOf({ ...MIX, id: "de-mix-settled", site: "de", expectedLock: "de" }, sure("de"),
      { kind: "MIX", main: DE, seen: [DE, EN], proposed: REWRITE });
    expect(settled).toMatchObject({ lock: "de", lockSource: "ELD_SITE", recordCode: "ELD_SITE", offered: false, fastNeeded: false,
      fastCheck: { outcome: "MIX" } });
    expect(practiceLanguageVerdict([settled], [])).toEqual({ verdict: "FAIL", exitCode: 20, reasons: ["LANGUAGE_MIX_NOT_OFFERED:de-mix-settled:ELD_SITE"] });
  });

  it("a fast check that was down makes the case NOT_PROVEN, even with the right lock", () => {
    const down = recordOf(caseOf("lang-ro-plain"), unsure, { kind: "DOWN", reason: "TIMEOUT" });
    expect(down).toMatchObject({ lock: "ro", lockSource: "FALLBACK_SITE" });
    expect(practiceLanguageVerdict([down], [])).toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["LANGUAGE_FAST_CHECK_DOWN:lang-ro-plain:TIMEOUT"] });
    expect(practiceLanguageVerdict([], [{ id: "lang-id", code: "PREVIEW_TEST_AUTHORITY_STOPPED" }]))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["LANGUAGE_CASE_NOT_RUN:lang-id:PREVIEW_TEST_AUTHORITY_STOPPED"] });
    // FAIL outranks NOT_PROVEN; the FAIL reasons come first.
    const wrong = recordOf(caseOf("lang-en-on-ro"), unsure, { kind: "ONE", main: RO });
    expect(practiceLanguageVerdict([down, wrong], [])).toEqual({ verdict: "FAIL", exitCode: 20,
      reasons: ["LANGUAGE_WRONG_LOCK:lang-en-on-ro", "LANGUAGE_FAST_CHECK_DOWN:lang-ro-plain:TIMEOUT"] });
  });

  it("the planner's naming is recorded and never counts (CR-3: operator-only, never a condition mark)", () => {
    expect(practicePlannerDisagrees("en", "ro")).toBe(true);
    expect(practicePlannerDisagrees("sr-Latn", "sr")).toBe(false);
    expect(practicePlannerDisagrees("ro", null)).toBeNull();
    // Read the way the map stores it (pre-flight PF-D23): the primary subtag of a real ISO 639-1 code, else nothing.
    expect(practicePlannerLanguage("ro_RO")).toBe("ro");
    expect(practicePlannerLanguage("romanian")).toBeNull();
    expect(practicePlannerLanguage(undefined)).toBeNull();
    const records = allRight().map((record) => record.id !== "lang-en-on-ro" ? record
      : recordOf(caseOf("lang-en-on-ro"), unsure, { kind: "ONE", main: EN }, "ro"));
    const failedPlanner = { ...records[0]!, planner: { status: "FAILED", code: "MAP_REPLY_UNREADABLE", model: "x", questionLanguage: null, disagrees: null } } as const;
    expect(records.find((record) => record.id === "lang-en-on-ro")!.planner).toMatchObject({ questionLanguage: "ro", disagrees: true });
    expect(practiceLanguageVerdict([failedPlanner, ...records.slice(1)], [])).toEqual({ verdict: "PASS", exitCode: 0, reasons: [] });
  });
});

describe("practice language: the report", () => {
  it("report.md: a line of codes per case, each rewrite beside the case's own question, the planner as operator-only", () => {
    const records = allRight();
    const report = practiceLanguageReport({ dry: false, startedAt: new Date("2026-10-13T10:00:00.000Z"), finishedAt: new Date("2026-10-13T10:01:00.000Z"),
      policySource: "START_VALUES", fastCheckModel: "claude-haiku-5-5", records, notRun: [], observer: new PracticeGateObserver() });
    expect(report).toMatchObject({ schema: PRACTICE_REPORT_SCHEMA, mode: "language", dry: false, verdict: "PASS", exitCode: 0, reasons: [],
      policy: { source: "START_VALUES", fastCheckModel: "claude-haiku-5-5" } });
    const markdown = reportMarkdown(report);
    expect(markdown).toContain("# Preview practice (language): PASS");
    expect(markdown).toContain("| lang-ro-en-mix | ro | - no no | MIX ro (ro,en) | ro (OFFER) | yes | yes | ro, offer | PASS |");
    expect(markdown).toContain(`- lang-ro-en-mix (offered): original «${MIX.questionLine}»; rewrite «${REWRITE}»`);
    expect(markdown).toContain("The angle planner's own naming (recorded for the operator only; never counted, never a condition mark):");
    // A question that was not offered a rewrite is never shown.
    expect(markdown).not.toContain(caseOf("lang-en-on-ro").questionLine);
  });

  it("names a case that did not run, and why", () => {
    expect(practiceLanguageLines([], [{ id: "lang-id", code: "PREVIEW_TEST_AUTHORITY_STOPPED" }]).join("\n"))
      .toContain("- lang-id: not run (PREVIEW_TEST_AUTHORITY_STOPPED)");
  });
});

describe("practice language: debate mode's two flags, and the offer answered", () => {
  const flags = (entries: Readonly<Record<string, string>>): ReadonlyMap<string, string> => new Map(Object.entries(entries));

  it("reads --site-language and --language-choice in debate mode only, naming only the flag on a bad value", () => {
    expect(practiceDebateLanguageFromArgs("debate", flags({ "--question": "ro" }))).toBeNull();
    // The default answer is KEEP_MINE ("keep"), as the P2L final review asks (controller ruling D-CHOICE).
    expect(practiceDebateLanguageFromArgs("debate", flags({ "--site-language": "ro" }))).toEqual({ siteLanguage: "ro", choice: "keep" });
    expect(practiceDebateLanguageFromArgs("debate", flags({ "--language-choice": "use" }))).toEqual({ siteLanguage: null, choice: "use" });
    for (const mode of ["formats", "openings", "language", "report"]) {
      expect(() => practiceDebateLanguageFromArgs(mode, flags({ "--site-language": "ro" })))
        .toThrow("PRACTICE_FLAG_VALUE_INVALID: --site-language (debate mode only)");
    }
    expect(() => practiceDebateLanguageFromArgs("debate", flags({ "--site-language": "xx" })))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --site-language \(one of the site's 35 languages\)$/u);
    expect(() => practiceDebateLanguageFromArgs("debate", flags({ "--language-choice": "edit" })))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --language-choice \(use or keep\)$/u);
    expect(parsePracticeArgs(["debate", "--site-language", "ro", "--language-choice", "keep"]).flags.size).toBe(2);
    expect(parsePracticeArgs(["language", "--dry", "--out", "/tmp/practice-language"]).mode).toBe("language");
  });

  it("the default site language is the question's own, when it is a site language; else English", () => {
    expect(practiceSiteLanguageOfTag("ro")).toBe("ro");
    expect(practiceSiteLanguageOfTag("ro-RO")).toBe("ro");
    expect(practiceSiteLanguageOfTag("und")).toBe("en");
    expect(practiceSiteLanguageOfTag("xx")).toBe("en");
  });

  it("answers the one-language offer as the site's pop-up does (P2L Task 9's choice)", () => {
    const request = { question_line: MIX.questionLine, site_language: "ro", depth_params: { depth: 1 } } as unknown as AskRequest;
    const offer = { check_ref: "a.b", proposed_question: REWRITE };
    expect(practiceLanguageResubmission(request, offer, "use")).toEqual({ ...request, question_line: REWRITE,
      question_language_choice: { check_ref: "a.b", choice: "USE_REWRITE", original_question_line: MIX.questionLine } });
    expect(practiceLanguageResubmission(request, offer, "keep")).toEqual({ ...request,
      question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE" } });
  });

  it("the debate's language block: why the lock was made, the language the run was stored with, the planner for the operator only", () => {
    const trace = { eld: { code: "ro", reliable: true, confident: false }, fast: { outcome: "MIX" as const, reason: null, main: "ro" }, contractHash: "c" };
    const offer = QuestionLanguageChoiceNeeded.from({ check_ref: "a.b", main_language: RO, languages_seen: [RO, EN], proposed_question: REWRITE }, trace);
    const kept: QuestionLanguageLock = { language: RO, source: "CHOICE", siteLanguage: "ro", rewriteAccepted: false, originalQuestionLine: null,
      trace: { eld: null, fast: null, contractHash: "c" }, recordCode: "CHOICE", localReason: null };
    // Pre-flight PF-D27: the record code, the local reason and the fast reading (a CHOICE lock has none of its own: the
    // offer's), and the language the run was stored with.
    expect(practiceDebateLanguageBlock({ siteLanguage: "ro", outcomes: [offer!, kept], choice: "KEEP_MINE",
      planner: { plannerLanguage: "ro", disagrees: false, detail: null }, storedLanguage: "ro" })).toEqual({ siteLanguage: "ro", offered: true,
      choice: "KEEP_MINE", lock: { code: "ro", source: "CHOICE", recordCode: "CHOICE", localReason: null, fast: { outcome: "MIX", reason: null, main: "ro" } },
      rewriteUsed: false, storedLanguage: "ro", plannerLanguage: "ro", plannerDisagrees: false });
    const local: QuestionLanguageLock = { ...kept, source: "LOCAL_SITE", recordCode: "LOCAL_SITE", localReason: "NO_GATE",
      trace: { eld: { code: null, reliable: false, confident: false }, fast: null, contractHash: null } };
    const lines = practiceDebateLanguageLines(practiceDebateLanguageBlock({ siteLanguage: "ro", outcomes: [local], choice: null, planner: null,
      storedLanguage: "ro" })).join("\n");
    expect(lines).toContain("- site language ro; lock ro (LOCAL_SITE, record LOCAL_SITE, no fast check: NO_GATE); stored on the run as ro");
    expect(lines).toContain("- one-language offer: not made; rewrite used: no");
  });
});

describe("practice language: --dry and the README", () => {
  it("the dry fast check answers each case's expected reading, readable by the real reply reader", () => {
    expect(Object.keys(PRACTICE_LANGUAGE_DRY_REWRITES)).toEqual(PRACTICE_LANGUAGE_CASES.filter((entry) => entry.offerExpected).map((entry) => entry.id));
    expect(readQuestionLanguageReply(practiceLanguageDryReading(MIX.questionLine), MIX.questionLine))
      .toEqual({ kind: "MIX", main: RO, seen: [RO, EN], proposed: REWRITE });
    const serbian = caseOf("lang-sr-latn");
    expect(readQuestionLanguageReply(practiceLanguageDryReading(serbian.questionLine), serbian.questionLine)).toEqual({ kind: "ONE", main: SR_LATN });
    // Sorani in Arabic letters reads as Kurdish, "ku" (never "ckb", which is no ISO 639-1 code: P2L final review I1).
    const sorani = caseOf("lang-ku-arab");
    expect(readQuestionLanguageReply(practiceLanguageDryReading(sorani.questionLine), sorani.questionLine))
      .toEqual({ kind: "ONE", main: questionLanguageOf("ku")! });
    expect(readQuestionLanguageReply(practiceLanguageDryReading("Not a practice case?"), "Not a practice case?"))
      .toEqual({ kind: "DOWN", reason: "UNKNOWN_LANGUAGE" });
  });

  it("the README's language commands are real commands of this tool, and the planner stays operator-only", () => {
    const readme = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
    const argvOf = (line: string): string[] => line.slice(line.indexOf("practice.ts ") + "practice.ts ".length).trim().split(/\s+/u)
      .map((word) => word.replace(/^"(.*)"$/u, "$1"));
    const language = readme.split("\n").filter((line) => line.includes("tools/preview-practice/practice.ts language "));
    expect(language.length).toBeGreaterThanOrEqual(2);
    for (const line of language) {
      const args = parsePracticeArgs(argvOf(line));
      expect(args.mode).toBe("language");
      for (const flag of [...args.flags.keys(), ...args.switches]) {
        expect(["--out", "--settings", "--gate-status-deepinfra", "--gate-status-anthropic", "--register-export", "--dry"]).toContain(flag);
      }
    }
    expect(language.some((line) => line.includes(" --dry "))).toBe(true);
    const mixDebate = readme.split("\n").filter((line) => line.includes("tools/preview-practice/practice.ts debate ") && line.includes("--question lang-ro-en-mix"));
    expect(mixDebate).toHaveLength(1);
    const args = parsePracticeArgs(argvOf(mixDebate[0]!));
    // S-8's one full debate on the mix answers the pop-up with `use` on purpose, so the rewrite path runs once
    // (controller ruling D-CHOICE), and runs on this code's next register version (controller ruling D-BOTHNEXT).
    expect(practiceDebateLanguageFromArgs(args.mode, args.flags)).toEqual({ siteLanguage: "ro", choice: "use" });
    expect(args.switches.has("--register-next")).toBe(true);
    expect(args.flags.get("--shape-policy")).toBe("tools/preview-practice/shape-policy-start.json");
    expect(readme).toContain("The planner's naming is recorded for the operator only");
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/preview-practice-language.test.ts`
Expected: FAIL: `practice-language.js` does not exist and `PRACTICE_LANGUAGE_CASES` is not exported.

- [ ] **Step 3: The cases** in `tools/preview-practice/practice-questions.ts`

At the end of the file, add (P2L's table word for word, then the two cases the P2L final review asked for; pre-flight PF-D25, controller ruling D-CASES). The text of `lang-short-code` contains backticks inside a double-quoted string. `lang-zh-short` is 13 Han letters; `lang-ku-arab` is 28 Arabic-script letters (both counted as `\p{L}`). Both are under eld's 30-letter floor (`ELD_TUNING.minLetters`) and at or above the 12-letter script floor (decide.ts `SCRIPT_READING_MIN_LETTERS`); the unit test checks both bounds.

```ts
/**
 * The question-language practice's fixed cases (question-language spec 2026-10-13; P2L cross-plan amendment P2d-3):
 * P2L's table word for word, then the two cases the P2L final review asked for (I3, I1). Each says the site language
 * it is asked on, the lock the site must reach, and whether the one-language offer must be made. Our own questions,
 * never anyone's; mode `language` asks them all, and a practice debate may ask one of them by its id.
 */
export type PracticeLanguageCase = Readonly<{ id: string; site: string; questionLine: string; expectedLock: string; offerExpected: boolean;
  /**
   * "OFF": the lock is worked out as on a deployment with no fast check (a signed-out person, local mode, no gate). The
   * fast check is still asked, and its reading recorded, but the lock never uses it.
   */
  fastCheck?: "OFF" }>;

export const PRACTICE_LANGUAGE_CASES: readonly PracticeLanguageCase[] = Object.freeze([
  Object.freeze({ id: "lang-ro-plain", site: "ro", questionLine: "Ar trebui sa renuntam la leu si sa trecem la euro?", expectedLock: "ro", offerExpected: false }),
  Object.freeze({ id: "lang-ro-en-mix", site: "ro", questionLine: "Ar trebui România să adopte euro, or should it wait until wages catch up?",
    expectedLock: "ro", offerExpected: true }),
  Object.freeze({ id: "lang-en-on-ro", site: "ro", questionLine: "Should Romania adopt the euro before 2030?", expectedLock: "en", offerExpected: false }),
  Object.freeze({ id: "lang-short-code", site: "en", questionLine: "Is `rm -rf /` ever safe in CI?", expectedLock: "en", offerExpected: false }),
  Object.freeze({ id: "lang-sr-latn", site: "ro", questionLine: "Da li bi Srbija trebalo da uvede evro?", expectedLock: "sr-Latn", offerExpected: false }),
  Object.freeze({ id: "lang-id", site: "id", questionLine: "Apakah Indonesia harus menaikkan pajak karbon?", expectedLock: "id", offerExpected: false }),
  Object.freeze({ id: "lang-ro-borrowed", site: "ro", questionLine: "Merită să lucrez la un startup de AI în loc de o corporație?",
    expectedLock: "ro", offerExpected: false }),
  // P2L final review I3: a short Chinese question (13 Han letters, under eld's floor) with no fast check: its script
  // decides (decide.ts scriptLanguage: Han with no kana → zh), never the English site.
  Object.freeze({ id: "lang-zh-short", site: "en", questionLine: "人工智能会取代大多数工作吗？", expectedLock: "zh", offerExpected: false,
    fastCheck: "OFF" }),
  // P2L final review I1: Sorani Kurdish in Arabic letters, on the Arabic site (not an always-ask site). The lock is "ku"
  // (ISO 639-1), never "ckb"; the kernel then expects Arabic letters from the question's own script.
  Object.freeze({ id: "lang-ku-arab", site: "ar", questionLine: "ئایا دەبێت باجی کاربۆن زیاد بکرێت؟", expectedLock: "ku", offerExpected: false })
]);
```

In `practiceDebateQuestion` (Task 1), replace its `throw …` with:

```ts
  const language = PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === id);
  if (language !== undefined) return Object.freeze({ id: language.id, questionLine: language.questionLine });
  throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `--question (ro, en, a comparison id: ${PRACTICE_COMPARISON_QUESTION_IDS.join(", ")}, `
    + `or a language case id: ${PRACTICE_LANGUAGE_CASES.map((entry) => entry.id).join(", ")})`);
```

Task 1's refusal test (`/^PRACTICE_FLAG_VALUE_INVALID: --question \(ro, en/u`, the value never repeated) stays true.

- [ ] **Step 4: Create** `tools/preview-practice/practice-language.ts`

```ts
/**
 * Preview practice: the question language (question-language spec 2026-10-13; P2L cross-plan amendments P2d-2..P2d-6,
 * adjusted for controller ruling CR-3; plan 2026-10-12-debate-shape-phase2d Task 7b).
 *
 * Plain words: with the new shape on, the site locks each question's language before the debate starts (P2L). This
 * file lets the practice show how it will lock them, before the upload.
 *  - Mode "language" asks no debate and starts no database. For each fixed case (practice-questions.ts
 *    PRACTICE_LANGUAGE_CASES): eld's reading on this computer; the fast check through the Anthropic gate, ALWAYS asked
 *    here, so its reading is recorded even when eld settles the question (or the case is worked out with the fast
 *    check off, `fastCheck: "OFF"`); and one angle-planner call (MAP:angles)
 *    through the gate of the AI whose turn it is. The lock is computed exactly as the site's decider computes it
 *    (apps/api/src/question-language/decider.ts). Every finished case goes to <out>/language.jsonl at once (a SHA-256
 *    of the question, never its text), then report.json and report.md. --dry answers from a script: nothing is spent.
 *  - The pass bar (P2L amendment P2d-4): a wrong lock, or a real-mix case not offered a rewrite, is FAIL; a case whose
 *    fast check was down, so that its lock came from a fallback, is NOT_PROVEN; otherwise PASS. Whether a rewrite keeps
 *    the meaning is the owners' read: report.md shows the case's own question and the rewrite side by side.
 *  - The planner's own naming of the language, and any disagreement with the lock, is RECORDED only (CR-3: operator-
 *    only, never a condition mark) and never counts toward the verdict.
 *  - Debate mode: --site-language and --language-choice (the site's one-language pop-up, answered for the operator),
 *    and what the report says about the run's language.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { ASK_QUESTION_MAX_BYTES, QuestionLanguageChoiceNeeded } from "@debateai/api";
import { SITE_LANGUAGE_CODES, type AskRequest } from "@debateai/contract";
import {
  detectArgumentLanguage, lockedReplyLanguageExpectation, questionLanguageOf, TypedDomainError, type QuestionLanguage
} from "@debateai/kernel";
import { MAP_CONTRACT_IDS, MapChoiceRepository, mapAnglesSpec, mapPrimarySubtag, mapPromptContractHash, mapProviderPieces } from "@debateai/map";
import {
  createPreviewGuardedFetch,
  PREVIEW_ANTHROPIC_MESSAGES_URL,
  readPromptFrame,
  type CallBound,
  type FramedMaterialField,
  type PreviewBudgetPort,
  type PreviewBudgetPorts,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import {
  parseQuestionLanguagePolicy,
  QUESTION_LANGUAGE_POLICY_ROW_KEY,
  questionLanguagePolicyStartValues,
  type QuestionLanguagePolicy
} from "@debateai/register";
import { assertQuestionLanguagePolicyBootable } from "../../apps/api/src/question-language/boot.js";
import { decideAfterFast, decideBeforeFast, decisionRecordCode, type LockSource } from "../../apps/api/src/question-language/decide.js";
import type { QuestionLanguageLock, QuestionLanguageTrace } from "../../apps/api/src/question-language/decider.js";
import { loadEldReader, type EldReader, type EldReading } from "../../apps/api/src/question-language/eld.js";
import { ELD_TUNING, eldConfident, eldSeesMix } from "../../apps/api/src/question-language/eld-tuning.js";
import { createFastCheck, QUESTION_LANGUAGE_CHECK_CONTRACT_ID, type FastCheckReading } from "../../apps/api/src/question-language/fast-check.js";
import { anthropicFastCheckTransport } from "../../apps/api/src/question-language/transport.js";
import { errorCodeOf, practiceJobGateway, practiceTurnOrder } from "./practice-formats.js";
import type { PracticeGateName, PracticeGateObserver } from "./practice-gate-observer.js";
import { openingsDryContent, openingsDryPacket, openingsDryVendorReply } from "./practice-openings-dry.js";
import { PRACTICE_LANGUAGE_CASES, type PracticeLanguageCase } from "./practice-questions.js";
import { reportableReplyText } from "./practice-redaction.js";
import type { PracticeRegisterExport } from "./practice-register-import.js";
import type { PracticeReport } from "./practice-report.js";
import { PracticeJsonlWriter } from "./practice-samples-log.js";
import { PracticeRefusal } from "./practice-settings.js";
import { PRACTICE_EXIT_CODES, type PracticeVerdict } from "./practice-verdict.js";

const primary = (code: string): string => code.split("-")[0]!.toLowerCase();
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const GATE_NAMES: readonly PracticeGateName[] = ["deepinfra", "anthropic"];
/** A failing eld is no reading (never block), exactly as the decider reads it (decider.ts NO_READING; pre-flight PF-D21). */
const NO_ELD_READING: EldReading = Object.freeze({ code: null, reliable: false, letters: 0, segments: Object.freeze([]) });
/**
 * The 409 body's check reference is the server's signature. Here nothing is signed or sent, so any well-formed
 * reference serves the body check (pre-flight PF-D22); the trace plays no part in it.
 */
const PRACTICE_OFFER_REF = "practice.unsigned";
const NO_TRACE: QuestionLanguageTrace = Object.freeze({ eld: null, fast: null, contractHash: null });
/** The register parser's refusal prefix; what follows it is only the place in the row (pre-flight PF-D24). */
const POLICY_INVALID_PREFIX = "QUESTION_LANGUAGE_POLICY_INVALID:";

/* ------------------------------------------------------------------ debate mode: the two flags */

export const PRACTICE_LANGUAGE_FLAGS = Object.freeze(["--site-language", "--language-choice"] as const);
/**
 * How the operator answers the site's one-language pop-up: keep the wording (KEEP_MINE, the default, as the P2L final
 * review asks; controller ruling D-CHOICE) or use the rewrite (USE_REWRITE: the debate argues the rewrite, while the
 * transcript keeps the case's own question line).
 */
export type PracticeLanguageChoice = "use" | "keep";
/** `siteLanguage` null: the question's own language (practiceSiteLanguageFor). */
export type PracticeDebateLanguage = Readonly<{ siteLanguage: string | null; choice: PracticeLanguageChoice }>;

/**
 * Debate mode's language flags: null when neither is given. Outside debate mode either is refused; a value outside its
 * list is refused naming only the flag, never the value. Read before anything starts.
 */
export function practiceDebateLanguageFromArgs(mode: string, flags: ReadonlyMap<string, string>): PracticeDebateLanguage | null {
  const given = PRACTICE_LANGUAGE_FLAGS.filter((flag) => flags.has(flag));
  if (given.length === 0) return null;
  if (mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${given[0]!} (debate mode only)`);
  const site = flags.get("--site-language");
  if (site !== undefined && !(SITE_LANGUAGE_CODES as readonly string[]).includes(site)) {
    throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--site-language (one of the site's 35 languages)");
  }
  const choice = flags.get("--language-choice") ?? "keep";
  if (choice !== "use" && choice !== "keep") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--language-choice (use or keep)");
  return Object.freeze({ siteLanguage: site ?? null, choice });
}

/** A language tag as a site language: its primary code when the site has it, else English. */
export function practiceSiteLanguageOfTag(tag: string): string {
  const code = primary(tag);
  return (SITE_LANGUAGE_CODES as readonly string[]).includes(code) ? code : "en";
}

/** The site language a practice debate is asked on by default: the question's own, as today's guesser reads it. */
export function practiceSiteLanguageFor(questionLine: string): string {
  return practiceSiteLanguageOfTag(detectArgumentLanguage(questionLine).tag);
}

/** The same ask again after the one-language offer, exactly as the site's pop-up sends it (P2L Task 9). */
export function practiceLanguageResubmission(request: AskRequest, offer: Readonly<{ check_ref: string; proposed_question: string }>,
  choice: PracticeLanguageChoice): AskRequest {
  return (choice === "use"
    ? { ...request, question_line: offer.proposed_question,
      question_language_choice: { check_ref: offer.check_ref, choice: "USE_REWRITE", original_question_line: request.question_line } }
    : { ...request, question_language_choice: { check_ref: offer.check_ref, choice: "KEEP_MINE" } }) as AskRequest;
}

/** Operator-only (CR-3): what the angle planner named, as the map stored it (P2L Task 15, inside core.map_choice). */
export type PracticeMapLanguage = Readonly<{ plannerLanguage: string | null; disagrees: boolean; detail: string | null }>;

/** Read through P2b's repository (decrypted with the run's key), before the throwaway database goes. Null: no map stored. */
export async function readPracticeMapLanguage(pool: Pool, runId: string): Promise<PracticeMapLanguage | null> {
  const result = await new MapChoiceRepository(pool).readMapResultForRun(runId);
  if (result === null) return null;
  const note = result.notes.find((entry) => entry.note === "LANGUAGE_PLANNER_DISAGREES");
  // A map stored before P2L Task 15 has no plannerLanguage (ruling L-MAPFORM): it reads as null (pre-flight PF-D23).
  return Object.freeze({ plannerLanguage: result.plannerLanguage ?? null, disagrees: note !== undefined, detail: note?.detail ?? null });
}

/** The debate report's `language` block: present only when the run had a debate-shape row (the decider ran). */
export type PracticeDebateLanguageBlock = Readonly<{
  siteLanguage: string;
  /** The ask answered with the one-language offer (a person would have seen the pop-up). */
  offered: boolean;
  /** How the offer was answered (--language-choice); null when there was none. */
  choice: "USE_REWRITE" | "KEEP_MINE" | null;
  /**
   * The decider's last lock, where it came from and why (pre-flight PF-D27): its record code (the source, with a
   * rewrite refusal or a refused offer body), the reason no fast check ran (LOCAL_* only), and the fast reading (a
   * CHOICE lock carries none of its own: then the offer's). Null when no lock was made (the ask was refused).
   */
  lock: Readonly<{ code: string; source: string; recordCode: string; localReason: string | null; fast: QuestionLanguageTrace["fast"] }> | null;
  rewriteUsed: boolean;
  /**
   * The language the run was stored with (core.run.argument_language_tag): the lock only when admission froze a shape
   * (ruling L-SHAPED-ONLY, apps/api/src/index.ts, `storedLanguageLock`), else today's guess. Null when no run was made.
   */
  storedLanguage: string | null;
  /** Operator-only (CR-3): the planner's naming and whether the map stored a LANGUAGE_PLANNER_DISAGREES note. */
  plannerLanguage: string | null;
  plannerDisagrees: boolean | null;
}>;

export function practiceDebateLanguageBlock(input: Readonly<{
  siteLanguage: string; outcomes: readonly (QuestionLanguageLock | QuestionLanguageChoiceNeeded)[];
  choice: "USE_REWRITE" | "KEEP_MINE" | null; planner: PracticeMapLanguage | null; storedLanguage: string | null;
}>): PracticeDebateLanguageBlock {
  const offers = input.outcomes.filter((outcome): outcome is QuestionLanguageChoiceNeeded => outcome instanceof QuestionLanguageChoiceNeeded);
  const locks = input.outcomes.filter((outcome): outcome is QuestionLanguageLock => !(outcome instanceof QuestionLanguageChoiceNeeded));
  const lock = locks.at(-1) ?? null;
  const offered = offers.length > 0;
  return Object.freeze({
    siteLanguage: input.siteLanguage,
    offered,
    choice: offered ? input.choice : null,
    lock: lock === null ? null : Object.freeze({ code: lock.language.code, source: lock.source, recordCode: lock.recordCode,
      localReason: lock.localReason, fast: lock.trace.fast ?? offers.at(-1)?.trace.fast ?? null }),
    rewriteUsed: lock?.rewriteAccepted ?? false,
    storedLanguage: input.storedLanguage,
    plannerLanguage: input.planner?.plannerLanguage ?? null,
    plannerDisagrees: input.planner === null ? null : input.planner.disagrees
  });
}

/** The debate's report.md paragraph: codes only. */
export function practiceDebateLanguageLines(block: PracticeDebateLanguageBlock): readonly string[] {
  const lock = block.lock === null ? "none" : `${block.lock.code} (${block.lock.source}, record ${block.lock.recordCode}`
    + `${block.lock.localReason === null ? "" : `, no fast check: ${block.lock.localReason}`})`;
  return ["Question language:", "",
    `- site language ${block.siteLanguage}; lock ${lock}; stored on the run as ${block.storedLanguage ?? "-"}`,
    `- one-language offer: ${block.offered ? `made, answered ${block.choice ?? "-"}` : "not made"}; rewrite used: ${block.rewriteUsed ? "yes" : "no"}`,
    `- the angle planner named: ${block.plannerLanguage ?? "nothing stored"}; disagreement note: `
      + `${block.plannerDisagrees === null ? "no map stored" : block.plannerDisagrees ? "yes" : "no"} `
      + "(recorded for the operator only, never a condition mark)",
    ""];
}

/* ------------------------------------------------------------------ mode "language": the pure parts */

export const PRACTICE_LANGUAGE_SCHEMA = "preview-practice-language-v1" as const;
export const PRACTICE_LANGUAGE_FILE = "language.jsonl" as const;

/** What the fast check said, as read by its own reader (P2L Task 5). */
export type PracticeFastCheckRecord = Readonly<{
  outcome: "ONE" | "MIX" | "DOWN"; reason: string | null; mainLanguage: string | null; languagesSeen: readonly string[];
  isRealMix: boolean; proposedQuestion: string | null;
  /** Ruling L-REWRITE: why the reader discarded a real mix's rewrite (codes only); null otherwise (pre-flight PF-D22). */
  rewriteRefusal: string | null;
}>;

export function practiceFastCheckRecord(reading: FastCheckReading): PracticeFastCheckRecord {
  if (reading.kind === "DOWN") {
    return Object.freeze({ outcome: "DOWN", reason: reading.reason, mainLanguage: null, languagesSeen: Object.freeze([]), isRealMix: false,
      proposedQuestion: null, rewriteRefusal: null });
  }
  if (reading.kind === "ONE") {
    return Object.freeze({ outcome: "ONE", reason: null, mainLanguage: reading.main.code, languagesSeen: Object.freeze([reading.main.code]),
      isRealMix: false, proposedQuestion: null, rewriteRefusal: null });
  }
  return Object.freeze({ outcome: "MIX", reason: null, mainLanguage: reading.main.code,
    languagesSeen: Object.freeze(reading.seen.map((language) => language.code)), isRealMix: true, proposedQuestion: reading.proposed,
    rewriteRefusal: reading.proposed === null ? reading.rewriteRefusal : null });
}

/**
 * The lock and what led to it. `OFFER`: the person is offered the rewrite; either answer locks the main language.
 * `recordCode`: the decider's record code (decide.ts decisionRecordCode; "OFFER" for an offer).
 */
export type PracticeLanguageOutcome = Readonly<{
  lock: string; source: LockSource | "OFFER"; recordCode: string; offered: boolean; fastNeeded: boolean; proposedQuestion: string | null;
}>;

/**
 * The lock EXACTLY as the site's decider computes it (apps/api/src/question-language/decider.ts, `decide`; pre-flight
 * PF-D22), from recorded readings:
 *  - decideBeforeFast first: eld settles only off the always-ask sites (ruling L-KEEP), and with no fast check on the
 *    deployment (`fastCheckAvailable` false: a case marked `fastCheck: "OFF"`) eld, the question's script and the
 *    site decide (LOCAL_*);
 *  - else decideAfterFast on the fast reading, with the decider's own record code (and its skip suffix, hosted only);
 *  - an OFFER only when the contract's 409 body accepts it (QuestionLanguageChoiceNeeded.from), else the main
 *    language, FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED.
 * Not modelled, and never met here: the repeat-offer memory (CR-5; every case is a new question) and an ask without a
 * site language (L-POPUP-FIRST; every case has one). `fastNeeded`: whether the fast reading mattered. Pure.
 */
export function practiceLanguageOutcome(site: QuestionLanguage, eld: EldReading, fast: FastCheckReading, questionLine: string,
  maxQuestionBytes: number, fastCheckAvailable = true): PracticeLanguageOutcome {
  const before = decideBeforeFast(site, eld, questionLine, { fastCheckAvailable, fastCheckAllowed: true });
  if (before.kind === "LOCK") {
    return Object.freeze({ lock: before.language.code, source: before.source, recordCode: decisionRecordCode(before), offered: false,
      fastNeeded: false, proposedQuestion: null });
  }
  if (before.kind === "OFFER") {
    // Impossible (decideBeforeFast never offers); the decider's own answer to it.
    return Object.freeze({ lock: site.code, source: "FALLBACK_SITE", recordCode: "DECISION_FALLBACK_SITE", offered: false, fastNeeded: false,
      proposedQuestion: null });
  }
  const decision = decideAfterFast(site, eld, fast, questionLine, maxQuestionBytes);
  if (decision.kind === "LOCK") {
    // As the decider: a check skipped on purpose says so beside the lock's own code (hosted only; never on the preview).
    const skipped = fast.kind !== "DOWN" ? null : fast.reason === "SKIPPED_DAY_POT" ? "FAST_CHECK_SKIPPED_DAY_POT"
      : fast.reason === "SPEND_RECORD_DOWN" ? "FAST_CHECK_SPEND_RECORD_DOWN" : null;
    return Object.freeze({ lock: decision.language.code, source: decision.source,
      recordCode: skipped === null ? decisionRecordCode(decision) : `${decisionRecordCode(decision)}:${skipped}`,
      offered: false, fastNeeded: true, proposedQuestion: null });
  }
  const needed = QuestionLanguageChoiceNeeded.from({ check_ref: PRACTICE_OFFER_REF,
    main_language: { code: decision.main.code, name: decision.main.name },
    languages_seen: decision.seen.map((language) => ({ code: language.code, name: language.name })),
    proposed_question: decision.proposed }, NO_TRACE);
  if (needed === null) {
    // As the decider (L-B64): the lock carries the language's own name, never the refused one.
    const language = questionLanguageOf(primary(decision.main.code), questionLine) ?? site;
    return Object.freeze({ lock: language.code, source: "FAST_MIX_NO_OFFER", recordCode: "FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED", offered: false,
      fastNeeded: true, proposedQuestion: null });
  }
  return Object.freeze({ lock: decision.main.code, source: "OFFER", recordCode: decisionRecordCode(decision), offered: true, fastNeeded: true,
    proposedQuestion: decision.proposed });
}

/** The angle planner's call, recorded only (CR-3). */
export type PracticePlannerRecord = Readonly<{
  status: "ANSWERED" | "FAILED" | "BUSY" | "NOT_SENT"; code: string | null; model: string | null;
  questionLanguage: string | null; disagrees: boolean | null;
}>;

/**
 * The planner's naming as the map stores it (packages/map orchestrator.ts `mapPlannerLanguage`; pre-flight PF-D23): the
 * primary subtag of an ISO 639-1 code ("ro_RO" → "ro"), else null ("romanian" is no code).
 */
export function practicePlannerLanguage(named: string | undefined): string | null {
  const subtag = named === undefined ? null : mapPrimarySubtag(named);
  return subtag !== null && questionLanguageOf(subtag) !== null ? subtag : null;
}

/** Whether the planner's naming differs from the lock, as the map's note compares them (sr-Latn and sr agree); null when it named none. */
export function practicePlannerDisagrees(lock: string, named: string | null): boolean | null {
  return named === null ? null : mapPrimarySubtag(named) !== mapPrimarySubtag(lock);
}

export type PracticeLanguageCaseRecord = Readonly<{
  id: string;
  siteLanguage: string;
  /** Never the question's text. */
  questionSha256: string;
  /** eld's reading; `seesMix`: two confident clauses in different languages (ruling L-MIX), which keep eld from settling. */
  eld: Readonly<{ code: string | null; reliable: boolean; letters: number; confident: boolean; seesMix: boolean }>;
  fastCheck: PracticeFastCheckRecord;
  lock: string;
  lockSource: LockSource | "OFFER";
  /** The decider's record code (pre-flight PF-D22): the source, with why a real mix was not offered. */
  recordCode: string;
  fastNeeded: boolean;
  offered: boolean;
  expected: Readonly<{ lock: string; offer: boolean }>;
  planner: PracticePlannerRecord;
}>;

export function practiceLanguageCaseRecord(input: Readonly<{ entry: PracticeLanguageCase; eld: EldReading; fast: FastCheckReading;
  outcome: PracticeLanguageOutcome; planner: PracticePlannerRecord }>): PracticeLanguageCaseRecord {
  const fastCheck = practiceFastCheckRecord(input.fast);
  return Object.freeze({
    id: input.entry.id,
    siteLanguage: input.entry.site,
    questionSha256: sha256(input.entry.questionLine),
    eld: Object.freeze({ code: input.eld.code, reliable: input.eld.reliable, letters: input.eld.letters, confident: eldConfident(input.eld),
      seesMix: eldSeesMix(input.eld) }),
    // The rewrite is reply text: capped and stripped of key shapes, as every reply the practice keeps.
    fastCheck: fastCheck.proposedQuestion === null ? fastCheck
      : Object.freeze({ ...fastCheck, proposedQuestion: reportableReplyText(fastCheck.proposedQuestion) }),
    lock: input.outcome.lock,
    lockSource: input.outcome.source,
    recordCode: input.outcome.recordCode,
    fastNeeded: input.outcome.fastNeeded,
    offered: input.outcome.offered,
    expected: Object.freeze({ lock: input.entry.expectedLock, offer: input.entry.offerExpected }),
    planner: input.planner
  });
}

export type PracticeLanguageNotRun = Readonly<{ id: string; code: string }>;

/**
 * One case against the pass bar (P2L amendment P2d-4). A lock from a fallback (the fast check down) proves nothing
 * about the check: NOT_PROVEN, whatever the lock. Else a wrong lock, or a real mix with no offer, is FAIL; the
 * no-offer reason carries the decider's record code, which says why (pre-flight PF-D22). The planner never counts.
 */
export function practiceLanguageCaseVerdict(record: PracticeLanguageCaseRecord): Readonly<{ verdict: "PASS" | "FAIL" | "NOT_PROVEN"; reasons: readonly string[] }> {
  if (record.lockSource === "FALLBACK_ELD" || record.lockSource === "FALLBACK_SITE") {
    return Object.freeze({ verdict: "NOT_PROVEN", reasons: Object.freeze([`LANGUAGE_FAST_CHECK_DOWN:${record.id}:${record.fastCheck.reason ?? "UNKNOWN"}`]) });
  }
  const reasons = [
    ...(record.lock === record.expected.lock ? [] : [`LANGUAGE_WRONG_LOCK:${record.id}`]),
    ...(record.expected.offer && !record.offered ? [`LANGUAGE_MIX_NOT_OFFERED:${record.id}:${record.recordCode}`] : [])
  ];
  return Object.freeze({ verdict: reasons.length === 0 ? "PASS" : "FAIL", reasons: Object.freeze(reasons) });
}

/** The run's verdict: any FAIL case fails it; else any case not proven (or not run) leaves it NOT_PROVEN; else PASS. */
export function practiceLanguageVerdict(records: readonly PracticeLanguageCaseRecord[], notRun: readonly PracticeLanguageNotRun[]):
  Readonly<{ verdict: PracticeVerdict; exitCode: number; reasons: readonly string[] }> {
  const each = records.map(practiceLanguageCaseVerdict);
  const failed = each.filter((entry) => entry.verdict === "FAIL").flatMap((entry) => entry.reasons);
  const notProven = [...each.filter((entry) => entry.verdict === "NOT_PROVEN").flatMap((entry) => entry.reasons),
    ...notRun.map((entry) => `LANGUAGE_CASE_NOT_RUN:${entry.id}:${entry.code}`)];
  const verdict: PracticeVerdict = failed.length > 0 ? "FAIL" : notProven.length > 0 ? "NOT_PROVEN" : "PASS";
  return Object.freeze({ verdict, exitCode: PRACTICE_EXIT_CODES[verdict], reasons: Object.freeze([...failed, ...notProven]) });
}

/** The report.md lines: codes per case; each rewrite beside the case's OWN fixed question (the owners' read); the planner. */
export function practiceLanguageLines(records: readonly PracticeLanguageCaseRecord[], notRun: readonly PracticeLanguageNotRun[]): readonly string[] {
  const yes = (value: boolean) => (value ? "yes" : "no");
  const lines = ["Question language cases (each lock computed exactly as the site's decider computes it):", "",
    "| Case | Site | eld (code, reliable, confident) | Fast check | Lock (record code) | Fast reading needed | Offer | Expected | Case verdict |",
    "|---|---|---|---|---|---|---|---|---|"];
  for (const record of records) {
    const fast = record.fastCheck.outcome === "DOWN" ? `DOWN ${record.fastCheck.reason ?? "-"}`
      : `${record.fastCheck.outcome} ${record.fastCheck.mainLanguage ?? "-"} (${record.fastCheck.languagesSeen.join(",")})`;
    lines.push(`| ${record.id} | ${record.siteLanguage} | ${record.eld.code ?? "-"} ${yes(record.eld.reliable)} ${yes(record.eld.confident)} | ${fast} | `
      + `${record.lock} (${record.recordCode}) | ${yes(record.fastNeeded)} | ${yes(record.offered)} | `
      + `${record.expected.lock}${record.expected.offer ? ", offer" : ""} | ${practiceLanguageCaseVerdict(record).verdict} |`);
  }
  lines.push("", ...notRun.map((entry) => `- ${entry.id}: not run (${entry.code})`), ...(notRun.length === 0 ? [] : [""]));
  const rewrites = records.filter((record) => record.fastCheck.proposedQuestion !== null);
  lines.push("Rewrites for the owners' read (does each keep the meaning?):", "",
    ...(rewrites.length === 0 ? ["- none"] : rewrites.map((record) => {
      const original = PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === record.id)?.questionLine ?? "(not a practice case)";
      return `- ${record.id} (${record.offered ? "offered" : "not offered"}): original «${original}»; rewrite «${record.fastCheck.proposedQuestion ?? ""}»`;
    })), "");
  lines.push("The angle planner's own naming (recorded for the operator only; never counted, never a condition mark):", "",
    ...records.map((record) => `- ${record.id}: ${record.planner.status === "ANSWERED"
      ? `named ${record.planner.questionLanguage ?? "nothing"}, lock ${record.lock}, disagrees ${record.planner.disagrees === null ? "-" : yes(record.planner.disagrees)}`
      : `${record.planner.status} (${record.planner.code ?? "-"})`}`), "");
  return lines;
}

/** report.json for mode "language". */
export function practiceLanguageReport(input: Readonly<{ dry: boolean; startedAt: Date; finishedAt: Date;
  policySource: "REGISTER_EXPORT" | "START_VALUES"; fastCheckModel: string; records: readonly PracticeLanguageCaseRecord[];
  notRun: readonly PracticeLanguageNotRun[]; observer: PracticeGateObserver }>): PracticeReport {
  return Object.freeze({
    // practice-report.ts PRACTICE_REPORT_SCHEMA (written out here so the two files do not import each other; a test pins it)
    schema: "preview-practice-report-v1",
    mode: "language",
    dry: input.dry,
    ...practiceLanguageVerdict(input.records, input.notRun),
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    policy: Object.freeze({ source: input.policySource, fastCheckModel: input.fastCheckModel }),
    cases: input.records,
    notRun: input.notRun,
    gates: Object.fromEntries(GATE_NAMES.map((gate) => [gate, input.observer.summary(gate)]))
  });
}

/* ------------------------------------------------------------------ mode "language": the run */

export type PracticeLanguagePolicyChoice = Readonly<{ policy: QuestionLanguagePolicy; source: "REGISTER_EXPORT" | "START_VALUES" }>;

/**
 * The fast check's settings and the owners' instruction: the export's LAST version's questionLanguagePolicy row when it
 * holds one (`--register-export`), else the code's start values. A row with the fast check switched off is refused:
 * this mode exists to record its reading.
 */
export function practiceLanguagePolicy(document: PracticeRegisterExport | null): PracticeLanguagePolicyChoice {
  const last = document?.versions.at(-1);
  const row = document === null || last === undefined ? undefined
    : document.rows.find((entry) => entry.register_version === last.register_version && entry.row_key === QUESTION_LANGUAGE_POLICY_ROW_KEY);
  let choice: PracticeLanguagePolicyChoice;
  if (row === undefined) {
    choice = { policy: questionLanguagePolicyStartValues(), source: "START_VALUES" };
  } else {
    try { choice = { policy: parseQuestionLanguagePolicy(JSON.parse(row.value_json)), source: "REGISTER_EXPORT" }; } catch (error) {
      // Only the place in the row (the parser's zod path, `$.fastCheck.model` for example; `$` for a row that is not
      // JSON), never its content (Global Constraints; pre-flight PF-D24).
      const path = error instanceof TypeError && error.message.startsWith(POLICY_INVALID_PREFIX)
        ? error.message.slice(POLICY_INVALID_PREFIX.length) : "$";
      throw new PracticeRefusal("PRACTICE_LANGUAGE_POLICY_INVALID", `questionLanguagePolicy ${path}`);
    }
  }
  if (choice.policy.fastCheck === null) {
    throw new PracticeRefusal("PRACTICE_LANGUAGE_FAST_CHECK_OFF", "the questionLanguagePolicy row has no fast check");
  }
  return Object.freeze(choice);
}

export type PracticeLanguageRunInput = Readonly<{
  config: PreviewProviderTestConfig;
  targets: readonly ProviderDiscoveryTarget[];
  /** The watched gate ports. */
  ports: PreviewBudgetPorts;
  observer: PracticeGateObserver;
  policy: QuestionLanguagePolicy;
  /** The judge organ's bound (the map's calls use it, as openings does for MAP:angles). */
  bound: CallBound;
  /** Test seam; default: all nine. */
  cases?: readonly PracticeLanguageCase[];
  /** Test seam; default: loadEldReader(ELD_TUNING.database), as the API loads it. */
  eld?: EldReader;
  sleep?: (milliseconds: number) => Promise<void>;
  progress?: (line: string) => void;
  shouldStop?: () => boolean;
  onCase?: (record: PracticeLanguageCaseRecord) => void;
  onNotRun?: (entry: PracticeLanguageNotRun) => void;
}>;

/** Every case in turn: eld, the fast check (always), the lock as the decider computes it, one planner call. */
export async function runPracticeLanguage(input: PracticeLanguageRunInput): Promise<Readonly<{
  records: readonly PracticeLanguageCaseRecord[]; notRun: readonly PracticeLanguageNotRun[];
}>> {
  const settings = input.policy.fastCheck;
  if (settings === null) throw new PracticeRefusal("PRACTICE_LANGUAGE_FAST_CHECK_OFF");
  const seats = practiceTurnOrder(input.targets);
  if (seats.length === 0) throw new PracticeRefusal("PRACTICE_LANGUAGE_NO_AI");
  const guardedFetch = createPreviewGuardedFetch(input.ports);
  // The API's own boot refusal for the row (apps/api/src/question-language/boot.ts; pre-flight PF-D24): an owners' text
  // holding a frame token, or a fast-check model or effort the Anthropic gate has not reviewed, is refused here once, by
  // the API's code and with its code, before anything is sent (never nine DOWN cases read as NOT_PROVEN).
  try { assertQuestionLanguagePolicyBootable(input.policy, { kind: "PREVIEW", fetch: guardedFetch }); } catch (error) {
    if (error instanceof TypedDomainError) throw new PracticeRefusal(error.code);
    throw error;
  }
  // The fast check exactly as the API composes it on the preview (P2L Task 12): the Anthropic gate, no key here.
  const fastCheck = createFastCheck({
    transport: anthropicFastCheckTransport({ fetch: guardedFetch, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: undefined, settings }),
    instruction: input.policy.instruction, timeoutMs: settings.timeoutMs });
  const eld = input.eld ?? await loadEldReader(ELD_TUNING.database);
  const runId = randomUUID();

  /** One angle-planner call on the case's question, in the locked language, through the gateway a formats job uses. */
  const plannerCall = async (entry: PracticeLanguageCase, lock: string, target: ProviderDiscoveryTarget): Promise<PracticePlannerRecord> => {
    const locked = questionLanguageOf(primary(lock), entry.questionLine);
    if (locked === null) {
      return Object.freeze({ status: "NOT_SENT", code: "PRACTICE_LANGUAGE_LOCK_UNNAMED", model: null, questionLanguage: null, disagrees: null });
    }
    const pieces = mapProviderPieces(mapAnglesSpec({ questionLine: entry.questionLine, languageName: locked.name, languageTag: locked.code,
      replyLanguage: lockedReplyLanguageExpectation(locked, entry.questionLine) }));
    const job = practiceJobGateway({ target, config: input.config, guardedFetch, ...(input.sleep === undefined ? {} : { sleep: input.sleep }) });
    try {
      const response = await job.gateway.call({ runId, subjectItemId: randomUUID(), callSiteKey: "MAP:angles", role: "JUDGE", lane: "served",
        bound: input.bound, contractHash: mapPromptContractHash(), providerRef: target.providerRef, packet: pieces.framed.packet,
        classifyContent: pieces.classifyContent, buildRepairPacket: pieces.buildRepairPacket });
      // As the map stores it (pre-flight PF-D23): the primary subtag of a real ISO 639-1 code, else nothing.
      const named = practicePlannerLanguage(pieces.readAccepted(response.content).question_language);
      return Object.freeze({ status: "ANSWERED", code: null, model: target.model, questionLanguage: named, disagrees: practicePlannerDisagrees(lock, named) });
    } catch (error) {
      return Object.freeze({ status: job.endedBusy() ? "BUSY" : "FAILED", code: errorCodeOf(error), model: target.model, questionLanguage: null, disagrees: null });
    }
  };

  const records: PracticeLanguageCaseRecord[] = [];
  const notRun: PracticeLanguageNotRun[] = [];
  for (const [index, entry] of (input.cases ?? PRACTICE_LANGUAGE_CASES).entries()) {
    const stop = GATE_NAMES.map((gate) => input.observer.stopped(gate)).find((gateStop) => gateStop !== null) ?? null;
    if (stop !== null || input.shouldStop?.() === true) {
      const skipped = Object.freeze({ id: entry.id, code: stop?.reason ?? "PRACTICE_INTERRUPTED" });
      notRun.push(skipped);
      input.onNotRun?.(skipped);
      continue;
    }
    const site = questionLanguageOf(entry.site);
    if (site === null) throw new PracticeRefusal("PRACTICE_LANGUAGE_CASE_INVALID", entry.id);
    // eld exactly as the decider reads it: a failing eld is no reading (decider.ts `#read`; pre-flight PF-D21).
    let reading: EldReading;
    try { reading = eld.read(entry.questionLine); } catch { reading = NO_ELD_READING; }
    // ALWAYS asked in this mode (P2L amendment P2d-2), so its reading is recorded even when eld settles the question, and
    // even for a case worked out with the fast check off (`fastCheck: "OFF"`), whose lock never uses it.
    const fast = await fastCheck.read(entry.questionLine, site);
    const outcome = practiceLanguageOutcome(site, reading, fast, entry.questionLine, ASK_QUESTION_MAX_BYTES, entry.fastCheck !== "OFF");
    // The AIs take turns as the planner, one case each, so each AI's naming shows up.
    const planner = await plannerCall(entry, outcome.lock, seats[index % seats.length]!);
    const record = practiceLanguageCaseRecord({ entry, eld: reading, fast, outcome, planner });
    records.push(record);
    input.onCase?.(record);
    input.progress?.(`${entry.id}: lock ${record.lock} (${record.lockSource}), fast check ${record.fastCheck.outcome}, planner ${planner.status}`);
  }
  return Object.freeze({ records: Object.freeze(records), notRun: Object.freeze(notRun) });
}

/** The mode: language.jsonl opened before the first call (a folder that holds one is refused), the run, the report. */
export async function runPracticeLanguageMode(input: PracticeLanguageRunInput & Readonly<{ folder: string; dry: boolean;
  policySource: "REGISTER_EXPORT" | "START_VALUES"; startedAt: Date }>): Promise<PracticeReport> {
  let log: PracticeJsonlWriter;
  try { log = PracticeJsonlWriter.create(input.folder, PRACTICE_LANGUAGE_FILE, "PRACTICE_OUT_ALREADY_HOLDS_LANGUAGE"); } catch (error) {
    if (error instanceof Error && error.message === "PRACTICE_OUT_ALREADY_HOLDS_LANGUAGE") {
      throw new PracticeRefusal("PRACTICE_OUT_ALREADY_HOLDS_LANGUAGE", "use a new --out folder");
    }
    throw error;
  }
  const cases = input.cases ?? PRACTICE_LANGUAGE_CASES;
  const fastCheckModel = input.policy.fastCheck?.model ?? "none";
  try {
    log.append({ kind: "start", schema: PRACTICE_LANGUAGE_SCHEMA, dry: input.dry, startedAt: input.startedAt.toISOString(),
      cases: cases.map((entry) => ({ id: entry.id, site: entry.site, questionSha256: sha256(entry.questionLine) })),
      policySource: input.policySource, fastCheckModel });
    const { records, notRun } = await runPracticeLanguage({ ...input, cases,
      onCase: (record) => log.append({ kind: "case", case: record }),
      onNotRun: (entry) => log.append({ kind: "not-run", ...entry }) });
    const finishedAt = new Date();
    log.append({ kind: "end", finishedAt: finishedAt.toISOString() });
    return practiceLanguageReport({ dry: input.dry, startedAt: input.startedAt, finishedAt, policySource: input.policySource,
      fastCheckModel, records, notRun, observer: input.observer });
  } finally {
    log.close();
  }
}

/* ------------------------------------------------------------------ mode "language" --dry: the script */

/** The rewrite the dry script proposes for each case that expects an offer (P2L's own example rewrite). */
export const PRACTICE_LANGUAGE_DRY_REWRITES: Readonly<Record<string, string>> = Object.freeze({
  "lang-ro-en-mix": "Ar trebui România să adopte euro sau să aștepte până cresc salariile?"
});

/** The dry fast check's reply (P2L Task 5 answer form): the case's expected reading; an unknown question is "unknown". */
export function practiceLanguageDryReading(questionLine: string): string {
  const entry = PRACTICE_LANGUAGE_CASES.find((candidate) => candidate.questionLine === questionLine);
  if (entry === undefined) return JSON.stringify({ main_language: "unknown", languages_seen: [], is_real_mix: false, proposed_question: null });
  const main = primary(entry.expectedLock);
  const rewrite = entry.offerExpected ? PRACTICE_LANGUAGE_DRY_REWRITES[entry.id] ?? null : null;
  return JSON.stringify(rewrite === null
    ? { main_language: main, languages_seen: [main], is_real_mix: false, proposed_question: null }
    : { main_language: main, languages_seen: [main, "en"], is_real_mix: true, proposed_question: rewrite });
}

/** The dry planner: the openings dry script's angles, naming the locked language first (so no disagreement). */
function practiceLanguageDryAngles(fields: readonly FramedMaterialField[], serial: number): string {
  const locked = fields.find((field) => field.name === "question_language")?.content;
  const code = locked === undefined ? null : (JSON.parse(locked) as { code?: unknown }).code;
  const angles = JSON.parse(openingsDryContent({ contractId: MAP_CONTRACT_IDS.angles, fields, serial, slip: false })) as object;
  return JSON.stringify({ question_language: typeof code === "string" ? primary(code) : "en", ...angles });
}

/**
 * The two scripted gate ports for `language --dry`: the fast check answered from the case table, MAP:angles from the
 * openings dry script. No socket is opened and nothing is spent. The angles step has no language check (packages/map
 * replies.ts `mapAnglesCheck` reads only ids and kinds), so the script's Romanian or English angles pass for every case.
 */
export function practiceLanguageDryPorts(): Readonly<{ ports: Readonly<{ deepinfra: PreviewBudgetPort; anthropic: PreviewBudgetPort }> }> {
  let served = 0;
  const port = (provider: "deepinfra" | "anthropic"): PreviewBudgetPort => Object.freeze({
    async execute(request: Parameters<PreviewBudgetPort["execute"]>[0]) {
      served += 1;
      const { model, packet } = openingsDryPacket(request.requestBody);
      const frame = readPromptFrame(packet);
      const content = frame.contractId === QUESTION_LANGUAGE_CHECK_CONTRACT_ID
        ? practiceLanguageDryReading(frame.fields.find((field) => field.name === "question_line")?.content ?? "")
        : practiceLanguageDryAngles(frame.fields, served);
      return { status: 200, body: openingsDryVendorReply(provider, model, content, served) };
    }
  });
  return Object.freeze({ ports: Object.freeze({ deepinfra: port("deepinfra"), anthropic: port("anthropic") }) });
}
```

Notes for the implementer:
- `MapSpecContext` still requires `replyLanguage` (packages/map/src/specs.ts:61-68), and `readAccepted` already returns `MapAnglesReply` with `question_language?: string`, so no cast is needed (pre-flight PF-D23, PF-D29).
- No `switch (`, no `process` + `.env` text, no import specifier containing `test` or `fixture` (the source rules).

- [ ] **Step 5: Export the dry vendor reply** in `tools/preview-practice/practice-openings-dry.ts`

Change `function openingsDryVendorReply(` to `export function openingsDryVendorReply(`. Nothing else changes.

- [ ] **Step 6: The command** `tools/preview-practice/practice.ts`

(a) `Args`'s `mode` gains `"language"`. In `parsePracticeArgs`, accept `mode !== "language"` too, and make the refusal's detail `"formats, debate, openings, language or report"`. In `runPractice`'s first line, the `mode` guess gains `argv[0] === "language" ? "language" :` before the openings test.

(b) `VALUE_FLAGS` gains `"--site-language", "--language-choice"` (keep every flag already there).

(c) Below `OPENINGS_REAL_RUN_ONLY`, add:

```ts
/** The flags language reads (practice-language.ts); every other flag is refused there. A dry run reads no settings, gate status or export. */
const LANGUAGE_FLAGS: ReadonlySet<string> = new Set(["--out", "--settings", "--gate-status-deepinfra", "--gate-status-anthropic", "--register-export", "--dry"]);
const LANGUAGE_REAL_RUN_ONLY: ReadonlySet<string> = new Set(["--settings", "--gate-status-deepinfra", "--gate-status-anthropic", "--register-export"]);
```

(d) Replace the `--dry` refusal line with:

```ts
    if (args.switches.has("--dry") && args.mode !== "openings" && args.mode !== "language") {
      throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", "--dry (openings or language mode only)");
    }
```

(e) Right after the `if (args.mode === "openings") { … }` block that refuses flags openings does not read, add:

```ts
    if (args.mode === "language") {
      // The other way round: a flag only another mode reads is refused here (its value is never repeated).
      const dryRun = args.switches.has("--dry");
      for (const flag of [...args.flags.keys(), ...args.switches]) {
        if (!LANGUAGE_FLAGS.has(flag)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (not read by language)`);
        if (dryRun && LANGUAGE_REAL_RUN_ONLY.has(flag)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (not read by language --dry)`);
      }
    }
```

(f) Right after Task 1's `const debateQuestionId = …` line, add:

```ts
    // Question language (P2L, practice-language.ts): debate mode's two language flags, checked here too.
    const debateLanguage = practiceDebateLanguageFromArgs(args.mode, args.flags);
```

(g) Right before the line `directory = assertOutsideRepository(args.flags.get("--out") ?? defaultReportDirectory(mode, startedAt), repositoryRoot());` that starts the real runs, add the dry language run:

```ts
    if (args.mode === "language" && args.switches.has("--dry")) {
      // --dry: the two gate ports come ONLY from the script (practice-language.ts practiceLanguageDryPorts). No
      // acknowledgement, no socket, no settings, no gate status, no export; nothing can reach a gate, nothing is spent.
      // eld still reads each question on this computer.
      const folder = assertOutsideRepository(args.flags.get("--out") ?? defaultReportDirectory(mode, startedAt), repositoryRoot());
      directory = folder;
      const watched = new PracticeGateObserver();
      observer = watched;
      options.onObserver?.(watched, stop);
      const config = openingsDryConfig();
      const dry = practiceLanguageDryPorts();
      const chosen = practiceLanguagePolicy(null);
      return finish(await runPracticeLanguageMode({ config, targets: openingsDryTargets(config),
        ports: Object.freeze({ deepinfra: watched.wrap("deepinfra", dry.ports.deepinfra), anthropic: watched.wrap("anthropic", dry.ports.anthropic) }),
        observer: watched, policy: chosen.policy, policySource: chosen.source, bound: practiceRunnerPolicy(config).bounds.JUDGE,
        folder, dry: true, startedAt, sleep: async () => undefined, progress: log, shouldStop: () => stopRequested }));
    }
```

(h) The export is read for language too when given: replace `const register = mode === "debate" ? (() => {` with `const register = mode === "debate" || (mode === "language" && args.flags.has("--register-export")) ? (() => {`.

(i) Right after the loop that reads both gates' `before` answers (before `if (args.mode === "openings") {`), add the real language run:

```ts
    if (args.mode === "language") {
      // Question language (P2L): the fast check's model and every preview AI (the planners take turns) must be enabled.
      const chosen = practiceLanguagePolicy(register);
      const models = [...settings.previewConfig.premium_model_ids];
      assertEnabledAtGates([...models, chosen.policy.fastCheck!.model], before);
      return finish(await runPracticeLanguageMode({ config: settings.previewConfig,
        targets: onePerModel(practiceDeclaredTargets(settings.runner.PROVIDER_DISCOVERY_TARGETS_JSON), models),
        ports: budgetPorts, observer, policy: chosen.policy, policySource: chosen.source,
        bound: practiceRunnerPolicy(settings.previewConfig).bounds.JUDGE, folder: directory, dry: false, startedAt,
        ...(options.sleep === undefined ? {} : { sleep: options.sleep }), progress: log, shouldStop: () => stopRequested }));
    }
```

(j) In the `runPracticeDebate({ … })` call, after Task 1's `...(shapeOverride === null ? {} : { shape: shapeOverride }),`, add `...(debateLanguage === null ? {} : { language: debateLanguage }),`.

(k) In the `catch`, extend `if (code === "PRACTICE_REPORT_INSIDE_REPOSITORY" || mode === "report") directory = null;` with `|| code === "PRACTICE_OUT_ALREADY_HOLDS_LANGUAGE"` (another run's folder keeps its report).

(l) Imports: `import { practiceDebateLanguageFromArgs, practiceLanguageDryPorts, practiceLanguagePolicy, runPracticeLanguageMode } from "./practice-language.js";` (`openingsDryConfig`, `openingsDryTargets`, `onePerModel`, `practiceDeclaredTargets`, `practiceRunnerPolicy`, `PracticeGateObserver` are imported already).

(m) In the file's top comment, change "Three modes, and a fourth command:" (practice.ts:10) to "Four modes, and a fifth command:" (pre-flight PF-D28). After the openings bullet, add:

```ts
 *  - language: the question-language practice (P2L, practice-language.ts): nine fixed cases, each read by eld, the
 *             fast check (always asked) and one angle-planner call; the lock computed as the site's decider computes it;
 *             <out>/language.jsonl, report.json and report.md. --dry answers from a script: nothing is spent.
```

and under ` *  - debate:` the line: ` *             --site-language and --language-choice set the site language and answer the one-language offer (default keep).`

- [ ] **Step 7: The debate** `tools/preview-practice/practice-debate.ts`

(a) Imports: `import { QuestionLanguageChoiceNeeded } from "@debateai/api";`, `import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";`, and from `./practice-language.js`: `practiceDebateLanguageBlock`, `practiceLanguageResubmission`, `practiceSiteLanguageFor`, `readPracticeMapLanguage`, `type PracticeDebateLanguage`, `type PracticeDebateLanguageBlock`, `type PracticeMapLanguage`.

(b) In the `runPracticeDebate` input type, after Task 2's `shape?: PracticeShapeOverride;`, add:

```ts
  /** Question language (`--site-language`, `--language-choice`; P2L): absent: the question's own language, an offer answered KEEP_MINE. */
  language?: PracticeDebateLanguage;
```

In `PracticeDebateResult`, after Task 4's `shape?:` member, add:

```ts
  /** Question language: the lock, its source, the offer and the planner's naming (operator-only); absent without a debate-shape row. */
  language?: PracticeDebateLanguageBlock;
```

(c) Right after Task 2's refusal block for the three ask settings (`if (shapeRow === null && Object.keys(asked).length > 0) { … }`, which throws `PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW`; under controller ruling D-REGNEXT it follows `shapeRow` and `asked` and comes before `const shapeSource = …`), add (pre-flight PF-D1):

```ts
    if (shapeRow === null && input.language !== undefined) {
      // Without the row the ask ignores the site language and never offers a rewrite: refused before any AI is asked.
      throw new PracticeRefusal("PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW",
        "--site-language and --language-choice need a debate-shape row (--shape-policy)");
    }
    // Every lock or offer the ask's question-language decider makes (P2L Task 12's onQuestionLanguage).
    const languageOutcomes: (QuestionLanguageLock | QuestionLanguageChoiceNeeded)[] = [];
```

(d) In the `composePracticeAsk({ … })` call, add `onQuestionLanguage: (outcome) => { languageOutcomes.push(outcome); },`.

(e) Right after `const question = practiceDebateQuestion(input.questionId);` (Task 2), add:

```ts
    // The site language goes with the question only when the ask reads it (a debate-shape row); else the ask is today's.
    const siteLanguage = shapeRow === null ? null : input.language?.siteLanguage ?? practiceSiteLanguageFor(question.questionLine);
```

and in the request object, after `question_line: question.questionLine,`, add `...(siteLanguage === null ? {} : { site_language: siteLanguage }),`.

(f) Replace exactly this block:

```ts
    try {
      await ask.application.submit(request, session, { kind: "server", userId, ownerRef });
    } catch (error) {
      refusalCode = codeOf(error);
    }
```

with:

```ts
    let languageChoice: "USE_REWRITE" | "KEEP_MINE" | null = null;
    try {
      try {
        await ask.application.submit(request, session, { kind: "server", userId, ownerRef });
      } catch (error) {
        if (!(error instanceof QuestionLanguageChoiceNeeded)) throw error;
        // The site's one-language pop-up (P2L): answered as the operator asked (--language-choice, default keep:
        // KEEP_MINE, as the P2L final review asks; controller ruling D-CHOICE), by the same ask sent again with the
        // choice, exactly as the page sends it. USE_REWRITE debates the rewrite; the transcript keeps the case's own line.
        const choice = input.language?.choice ?? "keep";
        languageChoice = choice === "use" ? "USE_REWRITE" : "KEEP_MINE";
        progress(`the ask answered with a one-language offer; answering ${languageChoice} as the site's pop-up would`);
        await ask.application.submit(practiceLanguageResubmission(request, error.offer, choice), session, { kind: "server", userId, ownerRef });
      }
    } catch (error) {
      refusalCode = codeOf(error);
    }
```

(g) In the "ask was refused" early `return Object.freeze({ … })`, after Task 4's `shape` member, add (with the comma the object needs):

```ts
        ...(siteLanguage === null ? {} : { language: practiceDebateLanguageBlock({ siteLanguage, outcomes: languageOutcomes, choice: languageChoice,
          planner: null, storedLanguage: null }) })
```

(h) Right after Task 4's `let shape …` block (after the debate, before the database goes), add:

```ts
    // Question language: the lock and the offer (from the decider), the language the run was stored with, and the
    // planner's naming as the map stored it (operator-only, CR-3). A reading that breaks costs only the planner facts,
    // never the report.
    let language: PracticeDebateLanguageBlock | undefined;
    if (siteLanguage !== null) {
      // Ruling L-SHAPED-ONLY: the run stores the lock only when admission froze a shape (apps/api/src/index.ts,
      // `storedLanguageLock`), else today's guess; this says which reached the run (pre-flight PF-D27).
      const storedLanguage = (await pool.query<{ argument_language_tag: string }>(
        "SELECT argument_language_tag FROM core.run WHERE run_id=$1", [job.runId])).rows[0]?.argument_language_tag ?? null;
      let planner: PracticeMapLanguage | null = null;
      try { planner = await readPracticeMapLanguage(pool, job.runId); } catch (error) {
        progress(`question language: the map's planner facts could not be read (${codeOf(error)})`);
      }
      language = practiceDebateLanguageBlock({ siteLanguage, outcomes: languageOutcomes, choice: languageChoice, planner, storedLanguage });
    }
```

(i) In the final `return Object.freeze({ … })`, after Task 4's `...(shape === undefined ? {} : { shape })`, add `,\n      ...(language === undefined ? {} : { language })`.

- [ ] **Step 8: The report** `tools/preview-practice/practice-report.ts`

(a) Imports: `import { practiceDebateLanguageLines, practiceLanguageLines, type PracticeDebateLanguageBlock, type PracticeLanguageCaseRecord, type PracticeLanguageNotRun } from "./practice-language.js";`

(b) In `debateReport`'s returned object, right after Task 4's `...(r.shape === undefined ? {} : { shape: r.shape }),`, add:

```ts
    // Question language: only when the debate ran with a debate-shape row; absent otherwise (today's keys).
    ...(r.language === undefined ? {} : { language: r.language }),
```

(c) In `reportMarkdown`, right after Task 4's two `shape` lines, add:

```ts
  const language = report.mode === "debate" && typeof report.language === "object" && report.language !== null
    ? report.language as PracticeDebateLanguageBlock : undefined;
  if (language !== undefined) lines.push(...practiceDebateLanguageLines(language));
  if (report.mode === "language" && Array.isArray(report.cases)) {
    lines.push(...practiceLanguageLines(report.cases as readonly PracticeLanguageCaseRecord[],
      Array.isArray(report.notRun) ? report.notRun as readonly PracticeLanguageNotRun[] : []));
  }
```

`practice-language.ts` imports only the TYPE `PracticeReport` from `practice-report.ts`, so the two files do not import each other's values directly. There is one indirect cycle (practice-report → practice-language → practice-samples-log → practice-report). It is safe at run time, because no module reads another's values while the modules load (pre-flight PF-D29).

- [ ] **Step 9: The README** `tools/preview-practice/README.md`

(a) In "## What this is, in plain words", change "Three modes:" (README:20) to "Four modes:" (pre-flight PF-D28), and add a bullet after **openings**:

```markdown
- **language**: the question-language practice (no debate, under $0.05). Nine fixed questions are each read the way the
  site will read them before a debate, and the report says which language each would be locked to. See "The question
  language".
```

(b) Insert this section right after the section "The new debate shape (debate mode, `--shape-policy`)" (Task 7), before `## Safety rules built in`:

````markdown
### The question language (language mode, and debate's `--site-language`)

With the new shape on, the site fixes the language of each question before the debate starts (P2L):

- First eld, a small language reader on the server, reads the question. When it is sure the question is in the
  site's language, that is the language. On some sites eld is never trusted alone, because there it mixes up near
  neighbours (Romanian, English and Indonesian are among them): there the fast AI below always reads the question.
- Otherwise one short call to a fast AI (Haiku) reads it. If the question really mixes two languages, the person is
  offered the question written in one language (the pop-up), and can keep their own wording instead.
- With no fast AI (a signed-out person, or no paid AI), eld and the question's alphabet decide, else the site's
  language.

`language` mode checks this on nine fixed questions, with no debate and no database:

- For each question: eld's reading, the fast AI's reading (always asked here, so its reading is written down even when
  eld was sure), and one call to the AI that plans a debate's angles (the AIs take turns).
- The language is worked out exactly as the site does it. One question, `lang-zh-short`, is worked out as if there
  were no fast AI: its language must come from its alphabet. The fast AI is still asked, so its reading is written
  down.
- It writes `language.jsonl` (one line per question, never the question's text), `report.json` and `report.md`.
- It costs under $0.05 and takes about 5 to 20 minutes: the questions go one at a time, and the slower AIs take 30 to
  170 seconds to plan a question's angles.

| Id | Site | Must lock | Offer the rewrite |
|---|---|---|---|
| `lang-ro-plain` | ro | ro | no |
| `lang-ro-en-mix` | ro | ro | yes |
| `lang-en-on-ro` | ro | en | no |
| `lang-short-code` | en | en | no |
| `lang-sr-latn` | ro | sr-Latn | no |
| `lang-id` | id | id | no |
| `lang-ro-borrowed` | ro | ro | no |
| `lang-zh-short` | en | zh | no |
| `lang-ku-arab` | ar | ku | no |

`lang-zh-short` is a short Chinese question, worked out as if there were no fast AI. `lang-ku-arab` is Kurdish
(Sorani) written in Arabic letters, asked on the Arabic site: it must lock Kurdish (`ku`).

The verdict:

- FAIL: a question locked to the wrong language, or the mixed question not offered a rewrite.
- NOT_PROVEN: the fast AI did not answer, so the language came from a fallback. Run it again later.
- PASS otherwise. Then the owners read each rewrite in `report.md`, where it stands beside the question, and decide
  whether it keeps the meaning.
- The planner's naming is recorded for the operator only: it never changes the verdict and never shows up as a mark
  on an answer.

The fast AI's settings come from the export's `questionLanguagePolicy` row when it has one (`--register-export`), else
from the code's start values. A row the site itself would refuse at start-up is refused here too, before anything is
sent: for example a reserved word in the owners' text, or a model or thinking level the Anthropic gate does not allow.

If you interrupt a language run (Ctrl-C), its report is still written. But `report --out` cannot rebuild a language
folder (it refuses with `PRACTICE_SAMPLES_LOG_UNREADABLE`): run the mode again into a new folder instead.

A dry run first (scripted answers, nothing spent, no socket):

```sh
node_modules/.bin/tsx tools/preview-practice/practice.ts language --dry --out "$P/language-dry"
echo "exit: $?"
```

The real run (S-3 first, as always):

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts language --settings "$P/settings.env" --register-export "$P/register-export.json" --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --out "$P/language-report"
echo "exit: $?"
```

Debate mode, with a debate-shape row, also asks with a site language:

- `--site-language <code>`: one of the site's 35 languages. Left out, it is the question's own language as the old
  guesser reads it, if the site has that language; else English.
- `--language-choice use|keep`: how the pop-up is answered when the ask offers a rewrite. The default is `keep`: the
  person keeps their own wording. With `use`, the debate argues the rewritten question, while `transcript.json` still
  names the case's own question.
- Both need a debate-shape row; without one they are refused before any AI is asked
  (`PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW`).
- `report.json` gains a `language` block, and `report.md` a "Question language" paragraph: the site language; the
  language locked, how and why; the language the debate was stored with; whether a rewrite was offered and used; and
  what the planner named (for the operator only).

The full practice debate on the mixed question, before the preview upload (S-8). It answers the pop-up with `use`, so
the rewrite is tried once. Like every practice debate of this release, it runs with `--register-next`: the release
needs a new register version (new prompts), and until the owners publish it the practice runs on this code's next
version (see `--register-next` under "Optional flags").

```sh
scp "$PREVIEW_SSH:/home/ubuntu/practice/*-status.json" "$P/"
PRACTICE_ACK=spends-real-money PRACTICE_DEEPINFRA_SOCKET="$D/deepinfra.sock" PRACTICE_ANTHROPIC_SOCKET="$D/anthropic.sock" node_modules/.bin/tsx tools/preview-practice/practice.ts debate --settings "$P/settings.env" --register-export "$P/register-export.json" --register-next --gate-status-deepinfra "$P/deepinfra-status.json" --gate-status-anthropic "$P/anthropic-status.json" --depth 1 --question lang-ro-en-mix --site-language ro --language-choice use --shape-policy tools/preview-practice/shape-policy-start.json --transcript --out "$P/language-debate"
echo "exit: $?"
```
````

(c) In S-8's "**The pass bar comes first**" list (Task 7), insert after item 1 and renumber the old item 2 to 4:

```markdown
2. Then the language mode (above): first `--dry`, then the real run. It must PASS. A FAIL stops everything: nothing is
   uploaded. NOT_PROVEN: run it again later the same day.
3. Then, the same day, one full practice debate on `lang-ro-en-mix` in the new shape (the command at the end of "The
   question language"). It must PASS, and its "Question language" paragraph must say the offer was made and the
   rewrite used. It costs about $0.30 and takes 1 to 2 hours, like one new-shape debate.
```

Then:
- in item 4 (the old item 2), change "Then run the first pair on `ro-euro`" to "Day 2: run the first pair on `ro-euro`";
- in the "**One pair a day after that:**" table, change the days 2, 3, 4 to 3, 4, 5;
- in S-8's **Cost per debate** bullet, change "spread over at least four days" to "spread over at least five days" and add the sentence "The language mode costs under $0.05 and the `lang-ro-en-mix` debate about $0.30, on day 1 after formats.";
- in "## Money and time (rough)", change Task 7's "eight depth-1 debates over at least four days" to "eight depth-1 debates over at least five days, after day 1's language mode and `lang-ro-en-mix` debate".

(d) In "Optional flags", at the end of the plain `- debate:` bullet (README ~445, after its `--register-next` sentences), add: `` `--site-language <code>`, `--language-choice use|keep` (default `keep`; see "The question language"; debate only, with a debate-shape row). `` Right after that bullet, add:

```markdown
- language: `--dry` (scripted answers, nothing spent); `--register-export` (the fast AI's settings from its
  `questionLanguagePolicy` row, if any). Nothing else.
```

(e) In "## Money and time (rough)", add: `- language: under $0.05, about 5 to 20 minutes.` (pre-flight PF-D28)

(f) In "## Files", add after the `practice-shape.ts` bullet:

```markdown
- `practice-language.ts`: the question language: mode `language` (the nine cases, the lock as the site works it
  out, `language.jsonl`, the report) and debate mode's `--site-language` and `--language-choice`.
```

In the `practice.ts` bullet, change "(the three modes," to "(the four modes," (README ~541; pre-flight PF-D28). In the tests bullet, add `tests/unit/preview-practice-language.test.ts`.

- [ ] **Step 10: Run the unit tests and expect PASS** (one at a time, memory and runs checked as the Global Constraints say)

- `pnpm exec vitest run tests/unit/preview-practice-language.test.ts` — Expected: PASS (16 tests: Step 1's sixteen `it`s, the debate block's one included).
- `pnpm exec vitest run tests/unit/preview-practice-shape.test.ts` — Expected: PASS (26 tests; Task 7b adds no test there, and Task 7's README test parses the new `lang-ro-en-mix` debate command).
- `pnpm exec vitest run tests/unit/preview-practice.test.ts` — Expected: PASS.
- `pnpm exec vitest run tests/unit/practice-openings-cli.test.ts` — Expected: PASS (`--dry`'s refusal text changed only for modes that are neither openings nor language).

If the case-table test fails on `questionLanguageOf("sr", …)` not giving `sr-Latn`, read P2L Task 1's `questionLanguageOf` and fix the TEST's call (P2L's seven rows are fixed by P2L). If any case on ro, en or id comes out `ELD_SITE` (a unit test, or Step 13's pin of every lock's source), ruling L-KEEP no longer holds: `FAST_CHECK_ALWAYS_SITES` changed. STOP and report it; never weaken the assertion (pre-flight PF-D20).

- [ ] **Step 11: Typecheck (alone)**

Run: `pnpm run typecheck`
Expected: no error. (`@debateai/api` exports both `QuestionLanguageChoiceNeeded` and `ASK_QUESTION_MAX_BYTES` today: apps/api/src/index.ts:170 and :1541; pre-flight check 2026-10-14.)

- [ ] **Step 12: The language dry run (nothing spent, no gate)**

Run: `node_modules/.bin/tsx tools/preview-practice/practice.ts language --dry --out "$(mktemp -d)/language-dry"`
Expected: `PRACTICE_VERDICT PASS exit 0`, nine progress lines (`<case>: lock …`, every planner `ANSWERED`: the angles step has no language check, so the script's angles pass for every case), and report.md listing the `lang-ro-en-mix` rewrite beside its question. No lock comes from eld alone (`ELD_SITE`): ro, en and id are always-ask (ruling L-KEEP), and `lang-ku-arab` is under eld's floor. `lang-zh-short` locks `zh (LOCAL_ELD)`. If the verdict is FAIL with `LANGUAGE_MIX_NOT_OFFERED:lang-ro-en-mix:<record code>`, the record code says why the rewrite was not offered: `FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:…` (ruling L-REWRITE) or `FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED`. STOP and report it to the controller: a finding against the dry script's rewrite, or P2L Tasks 5 and 7 (pre-flight PF-D20, PF-D22).

- [ ] **Step 13: The integration cases.** In `tests/integration/preview-practice-run.test.ts`:

(a) Imports: add `PRACTICE_LANGUAGE_CASES` to the `practice-questions.js` import; add `import { PRACTICE_LANGUAGE_DRY_REWRITES, practiceLanguageDryReading } from "../../tools/preview-practice/practice-language.js";`; add `stubMapContent` to the stubs import.

(b) In Task 6's describe, extend `ShapeReport` with:

```ts
    language?: { siteLanguage: string; offered: boolean; choice: string | null;
      lock: { code: string; source: string; recordCode: string; localReason: string | null;
        fast: { outcome: string; reason: string | null; main: string | null } | null } | null;
      rewriteUsed: boolean; storedLanguage: string | null; plannerLanguage: string | null; plannerDisagrees: boolean | null };
```

In the `--shape-policy … PASS` case, after `expect(storytellerAlsoRaised(stubs.requests)).toBeGreaterThan(0);`, add:

```ts
    // The question language (Task 7b): the Romanian question on the Romanian site. Romanian is an always-ask site (ruling
    // L-KEEP), so the fast check read it (the stub's one language: FAST, never ELD_SITE), and the run stored that lock
    // (admission froze a shape: ruling L-SHAPED-ONLY; pre-flight PF-D27). The planner named the same language. Its
    // naming is recorded for the operator only (CR-3): no condition mark is expected for it.
    expect(report.language).toMatchObject({ siteLanguage: "ro", offered: false, choice: null,
      lock: { code: "ro", source: "FAST", recordCode: "FAST", localReason: null, fast: { outcome: "ONE", main: "ro" } },
      rewriteUsed: false, storedLanguage: "ro", plannerLanguage: "ro", plannerDisagrees: false });
```

In the row-absent case, after `expect("shape" in report).toBe(false);`, add `expect("language" in report).toBe(false);`.

(c) Append at the end of the file:

```ts
describe("preview practice: language mode, the question language (P2L)", () => {
  type LanguageReport = { verdict: string; exitCode: number; reasons: string[]; mode: string;
    cases: { id: string; lock: string; lockSource: string; offered: boolean; fastNeeded: boolean;
      fastCheck: { outcome: string; proposedQuestion: string | null };
      planner: { status: string; questionLanguage: string | null; disagrees: boolean | null } }[];
    notRun: unknown[] };
  const EN_ON_RO = PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === "lang-en-on-ro")!;
  const MIX = PRACTICE_LANGUAGE_CASES.find((entry) => entry.id === "lang-ro-en-mix")!;
  /** The fast check answers each case as it expects (the dry script's reading); the planner of lang-en-on-ro names Romanian. */
  const languageScript = (request: GateRequest): GateOverride | null => {
    const chat = stubChatBody(request.provider, request.body);
    const question = readFramedMaterial(wirePacket(chat)).fields.find((field) => field.name === "question_line")?.content ?? "";
    if (request.kind === "QUESTION_LANGUAGE") return { content: practiceLanguageDryReading(question) };
    if (request.kind === "MAP" && question === EN_ON_RO.questionLine) {
      return { content: JSON.stringify({ ...(JSON.parse(stubMapContent(chat, 1)) as object), question_language: "ro" }) };
    }
    return null;
  };

  it("language mode: every case locked as expected, the mix offered, the fast check asked for every case, the planner recorded only: PASS (exit 0)", async () => {
    const { stubs, env, common, quiet, out } = await scenario(languageScript);
    const outcome = await runPractice(["language", ...common], env, quiet);
    const report = outcome.report as unknown as LanguageReport;
    // No case is settled by eld alone (ro, en and id are always-ask, ruling L-KEEP; lang-ku-arab is under eld's floor),
    // so a LANGUAGE_MIX_NOT_OFFERED:lang-ro-en-mix:<record code> can only come from the fast check's side: the rewrite
    // refused (FAST_MIX_NO_OFFER:REWRITE_UNUSABLE:…, ruling L-REWRITE) or an offer body the contract refuses
    // (FAST_MIX_NO_OFFER:OFFER_BODY_REFUSED). STOP and report it; never weaken this (pre-flight PF-D20, PF-D22).
    expect({ verdict: report.verdict, reasons: report.reasons }).toEqual({ verdict: "PASS", reasons: [] });
    expect(outcome.exitCode).toBe(0);
    expect(report.mode).toBe("language");
    expect(report.cases.map((entry) => [entry.id, entry.lock]))
      .toEqual(PRACTICE_LANGUAGE_CASES.map((entry) => [entry.id, entry.expectedLock]));
    // Every lock's source (controller ruling D-SETTLE): eld settles none of them (lang-ro-plain on ro is FAST, never
    // ELD_SITE); lang-zh-short is worked out with the fast check off, so its script decides (LOCAL_ELD).
    expect(report.cases.map((entry) => [entry.id, entry.lockSource])).toEqual([["lang-ro-plain", "FAST"], ["lang-ro-en-mix", "OFFER"],
      ["lang-en-on-ro", "FAST"], ["lang-short-code", "FAST"], ["lang-sr-latn", "FAST"], ["lang-id", "FAST"], ["lang-ro-borrowed", "FAST"],
      ["lang-zh-short", "LOCAL_ELD"], ["lang-ku-arab", "FAST"]]);
    // The fast check is asked for EVERY case, whatever eld said; one planner call (with any repair) per case; nothing else.
    expect(stubs.requests.filter((request) => request.kind === "QUESTION_LANGUAGE" && request.answer === "OK")).toHaveLength(PRACTICE_LANGUAGE_CASES.length);
    expect(report.cases.every((entry) => entry.fastCheck.outcome !== "DOWN")).toBe(true);
    expect(stubs.requests.filter((request) => request.kind === "MAP").length).toBeGreaterThanOrEqual(PRACTICE_LANGUAGE_CASES.length);
    expect(stubs.requests.every((request) => request.kind === "QUESTION_LANGUAGE" || request.kind === "MAP")).toBe(true);
    expect(report.cases.find((entry) => entry.id === "lang-ro-en-mix")).toMatchObject({ offered: true, lockSource: "OFFER",
      fastCheck: { outcome: "MIX", proposedQuestion: PRACTICE_LANGUAGE_DRY_REWRITES["lang-ro-en-mix"] } });
    // CR-3: the planner of lang-en-on-ro named Romanian; it is recorded, and the verdict above is still PASS.
    expect(report.cases.find((entry) => entry.id === "lang-en-on-ro")!.planner).toMatchObject({ status: "ANSWERED", questionLanguage: "ro", disagrees: true });
    // language.jsonl: a start line, one line per case, an end line; never a case's question text.
    const log = readFileSync(join(out, "language.jsonl"), "utf8");
    expect(log.trim().split("\n").map((line) => (JSON.parse(line) as { kind: string }).kind))
      .toEqual(["start", ...PRACTICE_LANGUAGE_CASES.map(() => "case"), "end"]);
    for (const entry of PRACTICE_LANGUAGE_CASES) expect(log).not.toContain(entry.questionLine);
    // report.md: the mixed question beside its rewrite, for the owners' read.
    const markdown = readFileSync(join(out, "report.md"), "utf8");
    expect(markdown).toContain(`original «${MIX.questionLine}»; rewrite «${PRACTICE_LANGUAGE_DRY_REWRITES["lang-ro-en-mix"]!}»`);
  }, 300_000);
});
```

Run (alone, nothing else running): `pnpm exec vitest run tests/integration/preview-practice-run.test.ts -t "language mode"`
Expected: 1 passed, the rest skipped.

Then run: `pnpm exec vitest run tests/integration/preview-practice-run.test.ts -t "the new debate shape"`
Expected: 4 passed (the shape case now checks the `language` block).

- [ ] **Step 14: Commit**

```bash
git add tools/preview-practice/practice-questions.ts tools/preview-practice/practice-language.ts tools/preview-practice/practice-openings-dry.ts tools/preview-practice/practice.ts tools/preview-practice/practice-debate.ts tools/preview-practice/practice-report.ts tools/preview-practice/README.md tests/unit/preview-practice-language.test.ts tests/integration/preview-practice-run.test.ts
git commit -m "Practice: the question language: mode language (nine fixed cases, eld, the fast check always asked, one angle-planner call each, the lock as the site's decider works it out, language.jsonl and the report; --dry), debate --site-language and --language-choice (default keep), the report's language block (why the lock was made, the stored language; planner naming operator-only)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7c: the review catch-up takes the lock

The operator's review catch-up (`job:review-catch-up`, `acceptance/review-catch-up.ts`) reviews the nodes a run left unreviewed, after the run. Today it never takes the run's language lock. On a shaped run it would tell the reviewer the vague form and check the reply against a re-guess of the question: the one-language mismatch P2L's final review found (M15, LATER-NOTE). This task gives it the lock exactly as the runner's own reviews get it (controller ruling D-CATCHUP): the run's receipt decides, through the same helper `runQuestionLanguageLock` (ruling L-SHAPED-ONLY). Today's runs keep today's review, byte for byte.

**Why this form.** The runner reads two facts off the run, its receipt (`envelope_basis`, parsed by `parseCostEnvelopeBasis`) and its stored language pair, and decides the lock once with `runQuestionLanguageLock(receiptShape, run)`. The job already reads the same facts (`RunRepository.readFrozenHead`). So the job hands the catch-up the raw receipt and the stored tag, and the catch-up decides the lock in the runner's own code, with the same parser and the same helper. The rule then lives in one place and a unit test can prove it on `runReviewCatchUp` itself. Two other forms were weighed and dropped:
- the job computes the lock and passes it in: the rule would sit in an operator script that no test runs (a text pin only), and the job would need `@debateai/budget`;
- a new dependency that reads `core.run`: a second read of the run inside the content lease, plus a change to the Postgres factory and its test doubles.

The two new inputs are optional. No receipt means no lock: today's review. So the 12 existing test calls (`tests/unit/dr184-catch-up.test.ts` ×11, `tests/unit/reviewer-turn-order.test.ts` ×1) compile and behave as today. A pin proves that the one real caller passes both, and that the runner itself never calls the catch-up.

**Files:**
- Modify: `apps/runner/src/index.ts`:
  - `ReviewCatchUpReviewer.review`'s input (~1605): gains `questionLanguage?`;
  - `runReviewCatchUp`'s input (~1774): gains `argumentLanguageTag?` and `envelopeBasis?`;
  - the lock, right after `readPinnedMaximumAttempts` (~1791);
  - the review call (~1844): carries the lock.
- Modify: `acceptance/review-catch-up.ts` (the one `runReviewCatchUp` call, ~139–172).
- Test: `tests/unit/runner-question-language.test.ts` (its imports; the last case of `describe("runQuestionLanguageLock: the receipt's shape decides the lock", …)`; two new describes).

**Interfaces:**
- Consumes:
  - `runQuestionLanguageLock(receiptShape, run)` (P2L Task 17, ruling L-SHAPED-ONLY; `apps/runner/src/index.ts` ~2677);
  - `parseCostEnvelopeBasis` (`@debateai/budget`, already imported by the runner; the receipt's ONE reader, PF7);
  - `RunRepository.readFrozenHead(runId)` (`packages/db/src/index.ts` ~2506): `argumentLanguageTag`, `argumentLanguageName`, `envelopeBasis`;
  - `Judge.review`'s `questionLanguage` (`packages/judgement/src/index.ts` ~331, ~740): the one named sentence, the `question_language` field last, and the reply check in the lock.
- Produces:
```ts
// apps/runner/src/index.ts — runReviewCatchUp's input gains (both optional; absent = today's review):
readonly argumentLanguageTag?: string;
readonly envelopeBasis?: unknown;
// ReviewCatchUpReviewer.review's input gains the field the runner's own review already sends:
readonly questionLanguage?: QuestionLanguage;
```

- [ ] **Step 1: Write the failing test** in `tests/unit/runner-question-language.test.ts`

(a) Replace the file's four import lines:

```ts
import { describe, expect, it } from "vitest";
import { argumentLanguageDirective, questionLanguageSentence } from "@debateai/kernel";
import { stripLanguageDirectiveForTest } from "../support/preview-gate-stubs.js";
import { runQuestionLanguageLock } from "../../apps/runner/src/index.js";
```

with:

```ts
import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { Judge } from "@debateai/judgement";
import { TEXT_NOT_IN_QUESTION_LANGUAGE, argumentLanguageDirective, questionLanguageSentence } from "@debateai/kernel";
import { readPromptFrame, type ProviderCallRequest, type ProviderGateway } from "@debateai/providers";
import { computeStructuralCeilingBasis, debateShapePolicyStartValues, resolveDebateShape } from "@debateai/register";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { stripLanguageDirectiveForTest } from "../support/preview-gate-stubs.js";
import { runQuestionLanguageLock, runReviewCatchUp, type ReviewCatchUpDependencies } from "../../apps/runner/src/index.js";
```

(b) In `describe("runQuestionLanguageLock: the receipt's shape decides the lock", …)`, replace its last case:

```ts
  it("the call site reads the receipt's shape, not the claim's shape context", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(source.match(/runQuestionLanguageLock\(/gu)).toHaveLength(2);
    expect(source).toContain("const shapeLanguage: QuestionLanguage | null = runQuestionLanguageLock(shapeShape, run);");
    expect(source).not.toContain("shapeRun === null ? null\n      : questionLanguageFromRun(");
  });
```

with:

```ts
  it("the call sites read the receipt's shape, not the claim's shape context", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    // P2d Task 7c (controller ruling D-CATCHUP): the definition, the run's own call, and the review catch-up's.
    expect(source.match(/runQuestionLanguageLock\(/gu)).toHaveLength(3);
    expect(source).toContain("const shapeLanguage: QuestionLanguage | null = runQuestionLanguageLock(shapeShape, run);");
    expect(source).toContain("runQuestionLanguageLock(parseCostEnvelopeBasis(input.envelopeBasis).shape ?? null, {");
    expect(source).not.toContain("shapeRun === null ? null\n      : questionLanguageFromRun(");
  });
```

(c) Append at the end of the file:

```ts
/**
 * P2d Task 7c (controller ruling D-CATCHUP; P2L final review M15) — THE REVIEW CATCH-UP TAKES THE RUN'S LOCK. The
 * operator's catch-up (`job:review-catch-up`) reviews the nodes a run left unreviewed. It reads the lock off the run's
 * receipt exactly as the runner's own reviews do (`runQuestionLanguageLock`, ruling L-SHAPED-ONLY): a shaped receipt
 * locks the review to the stored pair; a receipt with no shape, a shaped one whose stored pair cannot be a lock, or no
 * receipt at all keeps today's review input, byte for byte.
 */
describe("the review catch-up takes the run's lock exactly as the runner's own reviews do", () => {
  const RO = Object.freeze({ code: "ro", name: "Romanian" });
  const FALLBACK_NAME = "the same language as the question";
  // A question today's guesser cannot name ("und", as review I8's case), so only the lock can refuse a French reply.
  const QUESTION = "Ar trebui sa renuntam la leu si sa trecem la euro cat mai repede?";
  // The receipt test's own terms and shape (tests/unit/debate-shape-receipt.test.ts): a receipt admission really mints.
  const TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
    maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
    reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
  const PANEL = 5;
  const CAP = 5;
  const SHAPE = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "pro", makers: PANEL,
    settings: { depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" } })!;
  const SHAPED: unknown = JSON.parse(JSON.stringify(computeStructuralCeilingBasis({ ...TERMS, maxDepth: CAP, panelSize: PANEL,
    depth: 3, backupSequencesProvisioned: 0, shape: SHAPE })));
  const LEGACY: unknown = JSON.parse(JSON.stringify(fixtureStructuralCeiling(20)));
  const STOP = Object.freeze({ finishReason: "stop" });
  const FRENCH_REVIEW = JSON.stringify({ outcome: "dispute", reasons: [
    "Le gouvernement doit maintenir la monnaie nationale pour les citoyens et les entreprises du pays.",
    "Les entreprises du pays perdraient leur protection si la banque centrale abandonnait la monnaie nationale."
  ], edge_bearings: [] });
  const systemOf = (packet: { messages: readonly { role: string; content: string }[] }) =>
    packet.messages.find((message) => message.role === "system")!.content;

  type CatchUpLanguage = Readonly<{ argumentLanguageName?: string; argumentLanguageTag?: string; envelopeBasis?: unknown }>;

  /** Runs the catch-up over one unreviewed node and returns the input its one review call was given. */
  async function catchUpReviewInput(language: CatchUpLanguage): Promise<Readonly<Record<string, unknown>>> {
    const seen: unknown[] = [];
    const node = Object.freeze({ nodeId: "node:1", statement: "A claim", authorMaker: "maker:a",
      authorRawArtifactRef: "artifact:author", sourcedEdges: Object.freeze([]) });
    const dependencies: ReviewCatchUpDependencies = {
      withContentLease: async (_runId, use) => use(),
      readPinnedReviewers: async () => null,
      probePinnedPanel: async () => [{
        maker: "maker:b", providerRef: "provider:b",
        review: async (input) => {
          seen.push(input);
          return { outcome: "agree", reasons: ["reviewed"], provenanceRef: "artifact:review", edgeMeasurements: [] };
        }
      }],
      readUnreviewedNodes: async () => [node],
      readDisclosedNodeIds: async () => [node.nodeId],
      readLatestReviewerMaker: async () => null,
      recordReviewWithMeasurements: async () => "review:1",
      countRunModelAttempts: async () => 0,
      readPinnedMaximumAttempts: async () => 10,
      prepareVersion: async () => ({
        terminalBefore: "SERVED", terminalAfter: "SERVED", numberBefore: 0.7, numberAfter: 0.7,
        floorBefore: null, floorAfter: null, nowVisible: 1, stillSetAside: 0,
        persist: async () => ({ answerVersion: 2 })
      })
    };
    await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1, workItemId: "work:original", questionLine: QUESTION,
      ...language,
      invocationId: "catch:1", pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 }, judgeContractHash: "contract:judge",
      runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 2, record: async () => undefined, wait: async () => undefined },
      dependencies
    });
    expect(seen).toHaveLength(1);
    return seen[0] as Readonly<Record<string, unknown>>;
  }

  /** The request a real reviewer (`Judge.review`) hands its gateway for that input: the packet and its reply check. */
  async function requestOf(input: Readonly<Record<string, unknown>>): Promise<ProviderCallRequest> {
    let captured: ProviderCallRequest | undefined;
    const gateway = { call: async (request: ProviderCallRequest) => { captured = request; throw new Error("captured"); } } as unknown as ProviderGateway;
    await new Judge(gateway).review(input as never).catch(() => undefined);
    return captured!;
  }

  it("no receipt, or a receipt with no shape: today's review input, byte for byte, whatever pair it stored", async () => {
    expect(parseCostEnvelopeBasis(LEGACY).shape).toBeUndefined();   // control: this receipt really has no shape
    // The job's call before Task 7c: the stored name only.
    const today = await catchUpReviewInput({ argumentLanguageName: "Romanian" });
    expect(Object.keys(today).sort()).toEqual(["argumentLanguageName", "authorMaker", "bound", "callSiteKey", "contractHash",
      "edges", "providerRef", "questionLine", "runId", "statement", "subjectItemId"]);
    const variants: readonly CatchUpLanguage[] = [
      { argumentLanguageName: "Romanian", argumentLanguageTag: "ro", envelopeBasis: LEGACY },
      { argumentLanguageName: "Romanian", argumentLanguageTag: "ro" }
    ];
    for (const variant of variants) {
      const input = await catchUpReviewInput(variant);
      expect(JSON.stringify(input)).toBe(JSON.stringify(today));
      expect("questionLanguage" in input).toBe(false);
    }
    // And the reviewer frames it as today: today's directive, today's three fields.
    const packet = (await requestOf(today)).packet;
    expect(systemOf(packet)).toContain(argumentLanguageDirective("Romanian"));
    expect(readPromptFrame(packet).fields.map((field) => field.name))
      .toEqual(["question_line", "statement", "edges_sourced_by_this_node"]);
  });

  it("a shaped receipt whose stored pair cannot be a lock (\"und\", the fallback name) keeps today's review input", async () => {
    const today = await catchUpReviewInput({ argumentLanguageName: FALLBACK_NAME });
    for (const tag of ["und", "ro"]) {
      const input = await catchUpReviewInput({ argumentLanguageName: FALLBACK_NAME, argumentLanguageTag: tag, envelopeBasis: SHAPED });
      expect(JSON.stringify(input)).toBe(JSON.stringify(today));
    }
  });

  it("a shaped receipt tells the review its locked language: the one sentence and the field last, never the vague form", async () => {
    expect(parseCostEnvelopeBasis(SHAPED).shape).toEqual(SHAPE);   // control: this receipt really has a shape
    const input = await catchUpReviewInput({ argumentLanguageName: "Romanian", argumentLanguageTag: "ro", envelopeBasis: SHAPED });
    expect(input.questionLanguage).toEqual(RO);
    // The same lock the runner's own reviews get for this receipt and pair: one helper, one rule.
    expect(input.questionLanguage).toEqual(runQuestionLanguageLock(parseCostEnvelopeBasis(SHAPED).shape,
      { argumentLanguageTag: "ro", argumentLanguageName: "Romanian" }));
    const packet = (await requestOf(input)).packet;
    expect(systemOf(packet)).toContain(questionLanguageSentence(RO));
    expect(systemOf(packet)).not.toContain(argumentLanguageDirective("Romanian"));
    expect(systemOf(packet)).not.toContain("the language of the question");
    expect(readPromptFrame(packet).fields.map((field) => field.name))
      .toEqual(["question_line", "statement", "edges_sourced_by_this_node", "question_language"]);
    expect(readPromptFrame(packet).fields.at(-1)!.content).toBe('{"code":"ro","name":"Romanian"}');
  });

  it("a shaped receipt's review is checked in the lock: a French reply is refused, and today's review lets it through", async () => {
    const locked = (await requestOf(await catchUpReviewInput(
      { argumentLanguageName: "Romanian", argumentLanguageTag: "ro", envelopeBasis: SHAPED }))).classifyContent!(FRENCH_REVIEW, STOP);
    expect(locked.parseStatus).toBe("SCHEMA_FAILED");
    const issues = JSON.parse(locked.parseError!) as { code: string }[];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.code === TEXT_NOT_IN_QUESTION_LANGUAGE)).toBe(true);
    const today = (await requestOf(await catchUpReviewInput(
      { argumentLanguageName: "Romanian", argumentLanguageTag: "ro", envelopeBasis: LEGACY }))).classifyContent!(FRENCH_REVIEW, STOP);
    expect(today.parseStatus).toBe("PARSED");
  });
});

/**
 * P2L final review M15, moved by P2d Task 7c (controller ruling D-CATCHUP): the review catch-up has ONE caller, the
 * operator job, and it hands the catch-up the run's receipt and stored tag from the run's frozen head, so a shaped run's
 * catch-up reviews in its lock. The runner itself never calls it. A new caller must pass the same two fields, and this
 * pin moves with it.
 */
describe("the review catch-up's one caller hands it the receipt and the stored tag", () => {
  it("the operator job passes the run's envelope basis and tag; the runner only defines the catch-up", async () => {
    const { readFile } = await import("node:fs/promises");
    const runner = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    const job = await readFile(new URL("../../acceptance/review-catch-up.ts", import.meta.url), "utf8");
    expect(runner.match(/runReviewCatchUp\(/gu)).toHaveLength(1);
    expect(runner).toContain("export async function runReviewCatchUp(input: {");
    expect(job.match(/runReviewCatchUp\(/gu)).toHaveLength(1);
    expect(job).toContain("new RunRepository(pool).readFrozenHead(runId)");
    const start = job.indexOf("await runReviewCatchUp({");
    const end = job.indexOf("dependencies\n    });", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const call = job.slice(start, end);
    expect(call).toContain("argumentLanguageName: run.argumentLanguageName,");
    expect(call).toContain("argumentLanguageTag: run.argumentLanguageTag,");
    expect(call).toContain("envelopeBasis: run.envelopeBasis,");
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/runner-question-language.test.ts`
Expected: FAIL, 4 failed and 9 passed:
- `a shaped receipt tells the review its locked language…`: `input.questionLanguage` is undefined (today's catch-up takes no lock);
- `a shaped receipt's review is checked in the lock…`: the French reply is `PARSED`, not `SCHEMA_FAILED`;
- `the call sites read the receipt's shape…`: `runQuestionLanguageLock(` is found 2 times, not 3;
- `the operator job passes the run's envelope basis and tag…`: the job's call has no `argumentLanguageTag`.

The two "today's review input" cases already pass: they guard today's bytes and must stay green through Step 3.

- [ ] **Step 3: Implement**

In `apps/runner/src/index.ts`:

(a) In `ReviewCatchUpReviewer` (~1605), the `review` input. Replace exactly:

```ts
    readonly questionLine: string;
    readonly argumentLanguageName?: string;
    readonly statement: string;
```

with:

```ts
    readonly questionLine: string;
    readonly argumentLanguageName?: string;
    /** P2d Task 7c: the run's lock, exactly as the runner's own review sends it (`JudgeSubjectInput.questionLanguage`). */
    readonly questionLanguage?: QuestionLanguage;
    readonly statement: string;
```

(b) In `runReviewCatchUp`'s input (~1779). Replace exactly:

```ts
  readonly questionLine: string;
  readonly argumentLanguageName?: string;
  readonly invocationId: string;
```

with:

```ts
  readonly questionLine: string;
  readonly argumentLanguageName?: string;
  /**
   * P2d Task 7c (controller ruling D-CATCHUP; ruling L-SHAPED-ONLY): the run's stored tag and its frozen receipt
   * (`core.run.envelope_basis`), both as `RunRepository.readFrozenHead` returns them. The receipt decides the lock
   * exactly as the runner decides it for its own reviews (`runQuestionLanguageLock`): a receipt with a shape locks every
   * catch-up review to the stored pair; a receipt with no shape, or none given, keeps today's review.
   */
  readonly argumentLanguageTag?: string;
  readonly envelopeBasis?: unknown;
  readonly invocationId: string;
```

(c) Right after the line `  const maximumAttempts = await input.dependencies.readPinnedMaximumAttempts(input.runId);` (~1791), add:

```ts
  // P2d Task 7c (controller ruling D-CATCHUP): THE RUN'S LOCK, read off its receipt as the runner reads it. The Postgres
  // reader above has already parsed this same receipt, so one that does not parse is refused there, as today.
  const catchUpLanguage: QuestionLanguage | null = input.envelopeBasis === undefined ? null
    : runQuestionLanguageLock(parseCostEnvelopeBasis(input.envelopeBasis).shape ?? null, {
      argumentLanguageTag: input.argumentLanguageTag ?? "und",
      argumentLanguageName: input.argumentLanguageName ?? "the same language as the question"
    });
  const catchUpLanguageInput = catchUpLanguage === null ? {} : { questionLanguage: catchUpLanguage };
```

(d) In the review call (~1844). Replace exactly:

```ts
        argumentLanguageName: input.argumentLanguageName ?? "the same language as the question",
        statement: node.statement,
```

with:

```ts
        argumentLanguageName: input.argumentLanguageName ?? "the same language as the question",
        ...catchUpLanguageInput,
        statement: node.statement,
```

Keep every new comment free of the text `runQuestionLanguageLock(` and `runReviewCatchUp(` (with the bracket): the pins count those.

In `acceptance/review-catch-up.ts`, in the `runReviewCatchUp({ … })` call (~145). Replace exactly:

```ts
      argumentLanguageName: run.argumentLanguageName,
      invocationId: randomUUID(),
```

with:

```ts
      argumentLanguageName: run.argumentLanguageName,
      // P2d Task 7c (controller ruling D-CATCHUP): the stored tag and the frozen receipt, so a shaped run's catch-up
      // reviews in its locked language as the runner's own reviews do; a run with no shape keeps today's review.
      argumentLanguageTag: run.argumentLanguageTag,
      envelopeBasis: run.envelopeBasis,
      invocationId: randomUUID(),
```

Nothing else changes: `Judge.review` already frames and checks the lock (P2L Task 17), the Postgres factory forwards the whole input (`review: judge.review.bind(judge)`), and the judge fingerprint does not move (the sentence is added at call time, never sealed).

- [ ] **Step 4: Run and expect PASS** (one at a time, memory and runs checked as the Global Constraints say)

- `pnpm exec vitest run tests/unit/runner-question-language.test.ts` — Expected: PASS (13 tests).
- `pnpm exec vitest run tests/unit/dr184-catch-up.test.ts` — Expected: PASS (18 tests; its calls pass no receipt, so they keep today's review).
- `pnpm exec vitest run tests/unit/reviewer-turn-order.test.ts` — Expected: PASS (10 tests).
- `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` — Expected: PASS (the runner file is in the depth oracle's corpus; the edit adds no bare `5` and no file).

No integration suite is needed: the job has no suite of its own, and `tests/integration/database.test.ts` uses only `createPostgresReviewCatchUpDependencies`, which this task does not change.

- [ ] **Step 5: Typecheck (alone)**

Run: `pnpm run typecheck`
Expected: no error. The two new inputs are optional, so today's callers compile unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/runner/src/index.ts acceptance/review-catch-up.ts tests/unit/runner-question-language.test.ts
git commit -m "Review catch-up: a shaped run's catch-up reviews are told and checked in its locked language, read off its receipt as the runner's own reviews are; today's runs keep today's review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Final verification

**Files:** none new. Only fix a root cause a run exposes; commit any such fix separately, saying why.

- [ ] **Step 1: Unit files, one at a time** (check memory and runs before each). The list holds every unit file that reads a module P2d edits or the gate doubles (pre-flight PF-D3):
  1. `tests/unit/preview-practice-shape.test.ts` (26 tests)
  2. `tests/unit/preview-practice-language.test.ts` (Task 7b; 16 tests)
  3. `tests/unit/preview-practice.test.ts` (also a user of the gate doubles)
  4. `tests/unit/preview-practice-transcript.test.ts`
  5. `tests/unit/preview-practice-slips.test.ts` (also a user of the gate doubles)
  6. `tests/unit/preview-practice-wiring-drift.test.ts`
  7. `tests/unit/preview-practice-side-by-side.test.ts` (it runs `runPractice`)
  8. `tests/unit/answer-writer-v3-register-12.test.ts` (it pins five strings of practice-debate.ts and two of practice.ts; pre-flight PF-D1)
  9. `tests/unit/mimo-salvage.test.ts` (it imports practice-lanes)
  10. `tests/unit/story-format-robustness.test.ts` (it imports practice-lanes and practice-questions)
  11. every `tests/unit/practice-openings*.test.ts` file, each alone (`ls tests/unit/practice-openings*.test.ts` lists three: `practice-openings`, `practice-openings-cli`, `practice-openings-log`). They share `practice-openings-dry.ts` with the doubles and the language `--dry` script; `practice-openings` also uses the doubles.
  12. `tests/unit/debate-shape-boot.test.ts` (P2b's: main.ts and the practice runner composition read both rows and carry no Phase-2a guard)
  13. `tests/unit/runner-question-language.test.ts` (Task 7c: the review catch-up takes the lock; 13 tests; also a user of the gate doubles)
  14. `tests/unit/dr184-catch-up.test.ts`, then `tests/unit/reviewer-turn-order.test.ts`, each alone (Task 7c: the catch-up's other callers keep today's review)
  15. `tests/unit/s1-1-depth-contract.test.ts` (Task 7c: the runner file is in the depth oracle's corpus)

Expected: all PASS.

- [ ] **Step 1b: Architecture (alone, nothing else running)** (pre-flight PF-D30, PF-D32; ruling C-GATE)

Run: `pnpm exec vitest run tests/architecture --maxWorkers=2`
Expected: all PASS except the one known F31 test in `tests/architecture/scaffold.test.ts` ("matches all 37 dependency-edge rows and structural rules 1–5, dev's three F31 edges apart", ~101), which was red before P2d (P2c: 974/975). It covers the source rules too. Any other red is P2d's: fix its root cause. Never `pnpm test:ci-gate` and never the whole suite on the Mac; CI judges the full suite.

- [ ] **Step 2: Typecheck (alone)**

Run: `pnpm run typecheck`
Expected: no error.

- [ ] **Step 2b: The language dry run (no gate, nothing spent)**

Run: `node_modules/.bin/tsx tools/preview-practice/practice.ts language --dry --out "$(mktemp -d)/language-dry"`
Expected: `PRACTICE_VERDICT PASS exit 0`. Read its report.md: nine case rows (none locked by eld alone, `ELD_SITE`; `lang-zh-short` locked `zh (LOCAL_ELD)`), the `lang-ro-en-mix` rewrite beside its question, the planner lines marked operator-only. A FAIL on `LANGUAGE_MIX_NOT_OFFERED:lang-ro-en-mix:<record code>` is a finding against the fast check's rewrite (ruling L-REWRITE) or the dry script's: STOP and report it (pre-flight PF-D20, PF-D22, PF-D25).

- [ ] **Step 3: The whole practice integration file (alone)**

Run: `pnpm exec vitest run tests/integration/preview-practice-run.test.ts`
Expected: PASS, every case (33: today's 28, Task 6's 4 and Task 7b's language-mode case). Today's formats and debate cases are unchanged, so the default MAP and QUESTION_LANGUAGE answers touched nothing they send.

- [ ] **Step 4: The other integration suites, one at a time** (each alone, after the one before has finished; pre-flight PF-D3)

These are the other users of the gate doubles, and the suites the P2L and P2c ledgers list to run by hand before merge (CI skips the database suites). Run each, in this order:
- `pnpm exec vitest run tests/integration/preview-busy-model-run.test.ts`
- `pnpm exec vitest run tests/integration/parallel-calls-debate.test.ts` (17 cases)
- `pnpm exec vitest run tests/integration/debate-shape-run.test.ts` (28 cases)
- `pnpm exec vitest run tests/integration/debate-shape-row-absent.test.ts` (4 cases)
- `pnpm exec vitest run tests/integration/language-check-spend.test.ts` (10 cases)
- `pnpm exec vitest run tests/integration/hosted-register-publish.test.ts` (35 cases)
- `pnpm exec vitest run tests/integration/map-choice-repository.test.ts` (20 cases)

Expected: every one PASS. A red one is reported with its file and case; fix only a root cause P2d made, in its own commit.

- [ ] **Step 5: Report to the controller.** Do not push or open a PR. Report:
  - the commit list;
  - the passing test files with their counts;
  - any adaptation Task 0 or Task 4 Step 8 required (P2b reader forms, where `debateShapeInForce` lives, the `@debateai/budget` import);
  - the language dry run's verdict and its nine locks with their record codes;
  - the architecture run's result (only the known F31 row red) and each integration suite's count;
  - a reminder that S-8's real runs (the language mode, the `lang-ro-en-mix` debate, the comparison) are the operator's, spend real money and are not part of this plan's build.

---

## Self-review against the spec and the task

| Requirement | Where |
|---|---|
| `--shape-policy <file>` adds `debateShapePolicy` to the THROWAWAY register only, validated by the P2a parser | Task 1 (P2a `parseDebateShapePolicy`, refusals); Task 2 (`publishPracticeShapeVersion` in the throwaway database; rows byte for byte); Task 6 (export digest unchanged; version 6) |
| `--depth-mode`, `--scrutiny`, `--answer-length` ask fields | Task 1 (contract enums); Task 2 (`depth_params`; refused without a row); Task 6 (stored as normalised) |
| Refuses unknown flags | Task 1 (`PRACTICE_FLAG_UNKNOWN` for a typo; debate-only refusal in every other mode); Task 7 (every README debate command parses) |
| README section, plain words, real safe commands only | Task 7 (the sections; every command parsed by a test; only real commands in fenced blocks) |
| Report: map marks, opening used, chosen answers, also-raised count, panel close-call extensions, scrutiny extensions, per-step map call counts | Task 4 (`shape` block and report.md lines; the two extension counts are per point, P2b cross-plan P2d-3; a reassigned list counts as a list, P2d-5) |
| transcript.json includes the map items and choice | Task 5 (`structure.map`); Task 6 (asserted end to end) |
| Integration: whole new-shape practice debate: PASS, served answer, READY story with also-raised | Task 6 (case 1, including the storyteller's `also_raised` field) |
| Integration: a row-absent run identical to today | Task 6 (case 2: no shape key, ask as today, no MAP call, no `also_raised`, transcript keys as today); Task 8 (today's cases re-run). The runner's own byte identity is P2b's test |
| Whole-debate comparison: today's shape vs new shape, same 4 fixed questions, depth 1, all five AIs, two `--out` folders per question, within $5 DeepInfra + $1 Haiku a day, pass bar first | Task 1 (the four fixed ids); Task 7 (S-8 with the procedure, the money rules and the pass bar) |
| The owners' scoring method never in the repository | Task 7 (the README only says "results are judged by the owners' private method, outside this repository"; a test pins that sentence; no scoring code anywhere) |
| Spec §5 "a real practice debate with all AIs on the new shape before any preview upload" | Task 7 (S-8's pass bar, and the shape command in "The new debate shape"); Task 7b (the `lang-ro-en-mix` debate on day 1) |
| The practice version carries the code's judge, composer, conformance and map contract hashes (ruling X3, P2b cross-plan P2d-2; pre-flight PF-D7) | Task 2 (`practiceCodeContractHashRows`, `practiceShapeVersionRows`; a test pins the four rows to `buildDevelopmentRunnerRegisterRows()`); Task 0 (the dev builder seals `mapContractHash`) |
| `--shape-policy` with `--register-next`: no second version on top of the code's next one (pre-flight PF-D1, controller ruling D-REGNEXT) | Task 2 (the policy goes to `composePracticeNextRegisterVersion` → `buildPreviewSourceRowsV2`'s `debateShape`; the unit case; the five pinned strings of practice-debate.ts and the two of practice.ts kept; `answer-writer-v3-register-12` run in Step 6 and Task 8); Task 7 (the README keeps the `--register-next` paragraph word for word) |
| Gates on P2b's real wiring; the Phase-2a guard gone from every site (final review) | Task 0 Step 2 (`readDebateShapeRunnerSettings` in both boots, `resolveDebateShapeRunnerSettings` and `readMapContractHash` inside `debate-shape-boot.ts`, pre-flight PF-D4; `git grep` over apps, tools, packages) |
| The start-values file is exactly the start values (`mapStepBounds` written, no `enabled`) | Task 1 (the file and its test) |
| A row switched off (`enabled: false`) is no row | Task 1 (refused in a `--shape-policy` file); Task 2 (`debateShapeInForce` on the register's row) |
| P2L as a precondition; P2d runs last | Global Constraints ("Order"); Task 0 Step 3b |
| Language mode: eld, the fast check always asked, one `MAP:angles` per case, the lock as the decider computes it, `language.jsonl` + report in the outside-the-repository folder, under $0.05 | Task 7b (`runPracticeLanguage`, `practiceLanguageOutcome`, `runPracticeLanguageMode`; unit tests; the integration case counts nine fast checks and pins every lock's source) |
| The nine language cases: P2L's table word for word, then the P2L final review's I3 (`lang-zh-short`, the fast check off) and I1 (`lang-ku-arab`, Sorani on the Arabic site) (pre-flight PF-D25, controller ruling D-CASES) | Task 7b (`PRACTICE_LANGUAGE_CASES`; a test pins every field, and the two added questions' letter counts) |
| Pass bar: no wrong lock, every real mix offered; rewrites judged by the owners from report.md; planner never counted | Task 7b (`practiceLanguageVerdict` on FAIL / NOT_PROVEN / PASS; report.md shows question and rewrite side by side; the planner test) |
| CR-3: the planner's disagreement is operator-only, never a condition mark | Task 0 Step 3b (not in `CONDITION_MARKS`); Task 7b (read through `readMapResultForRun` into the practice report only; no mark expected or counted) |
| Debate `--site-language` and `--language-choice`; report records lock, source, rewrite used | Task 7b (flags, `practiceLanguageResubmission`, the `language` block; the shape integration case checks it) |
| README and S-8: the language mode first, then one full `lang-ro-en-mix` debate with `--shape-policy`, within the owner's budget | Task 7b Step 9 (README; a test parses its commands) |
| Every practice debate of this branch runs on the code's next register version until the owners republish (map `25b4c106…`, judge `aac53407…`, composer `9a46af29…`) (pre-flight PF-D2, controller ruling D-BOTHNEXT) | Task 7 ("The new debate shape" and S-8: the new-shape command, both S-8 arms and so the pass bar's release debate carry `--register-next`; the README test checks it on every new-shape and comparison command, and leaves S-6's own debate line alone); Task 7b (the `lang-ro-en-mix` debate) |
| A shape run whose map answers were not argued is NOT_PROVEN `MAP_ANSWERS_NOT_ARGUED`, never PASS (ruling C-TWO; pre-flight PF-D11, controller ruling D-NOTARGUED); a fallen-back map's stored choice and a run with no stored map count too (pre-flight PF-D12) | Task 4 (`mapAnswersArgued` in `practiceShapeBlock`; cases in "says when the new shape was not exercised", the verdict case and the report.md case); Task 7 (README reasons list) |
| The story retells the answers note when the map fell back, was not argued, or answers or points were filled in (pre-flight PF-D18; P2c ledger) | Task 7 (S-8 "What to check": the story's note, read in `transcript.json`, for `MAP_UNAVAILABLE_TODAYS_OPENING`, `MAP_ANSWERS_NOT_ARGUED`, `ANSWERS_FILLED`, `CHOOSE_QUOTA_FILLED`); a check of the real runs, not an automatic test: the wording is the storyteller's |
| Pre-flight PF-D20, controller ruling D-SETTLE: every case keeps its real site; ro, en and id are always-ask (L-KEEP), so eld settles no case; eld's settling is proved on German in unit tests only | Task 7b (unit `the lock is computed exactly…` and `a wrong lock or a mix…`; the integration case pins every lock's source) |
| Pre-flight PF-D21: eld's reading carries its clause readings; a failing eld is no reading | Task 7b (`runPracticeLanguage` reads eld as the decider does; every unit reading carries `segments`) |
| Pre-flight PF-D22: the lock exactly as the decider: `decideBeforeFast`, the 409 body check, the record code, the rewrite refusal | Task 7b (`practiceLanguageOutcome`, `practiceFastCheckRecord`; unit cases for an offer body the contract refuses and an L-REWRITE refusal; the FAIL reason carries the record code) |
| Pre-flight PF-D23, PF-D24: the planner read as the map stores it; the policy row through the API's own boot refusal | Task 7b (`practicePlannerLanguage`; `assertQuestionLanguagePolicyBootable` in `runPracticeLanguage`; the parser's path as the refusal's detail) |
| Pre-flight PF-D26, controller ruling D-CHOICE: the pop-up answered KEEP_MINE by default; S-8's mix debate passes `use` | Task 7b (flag default; unit flag test; the README test pins the mix command's `use` and `--register-next`) |
| Pre-flight PF-D27: the debate's `language` block says why the lock was made and what the run stored | Task 7b (`practiceDebateLanguageBlock`; its unit test; the shape integration case) |
| Every user of the gate doubles and every suite CI skips is re-run by hand, one at a time; architecture only bounded, with the known F31 row (pre-flight PF-D3, PF-D30, PF-D32) | Task 0 Step 4 (the practice integration file's baseline); Task 8 Steps 1, 1b, 3 and 4 |
| P2b's test debts handed to P2d (P2b final review `final-review.md:253`: items 3, 14, 23, 25, 27 and 28, I-3 step 3, and the row-absent golden digest) (pre-flight PF-D31) | Not taken up in P2d, on purpose: they test P2b's runner, not the practice tool. This row keeps them visible; the controller schedules them in their own task |
| One heavy test run at a time | Global Constraints; every run step names one file; integration runs alone |
| The review catch-up takes the run's lock for shaped runs exactly as the runner's own reviews do; today's runs unchanged (controller ruling D-CATCHUP, P2L final review M15) | Task 7c (`runReviewCatchUp` reads the lock with `runQuestionLanguageLock` off the receipt the job hands it; four behaviour cases and the moved pins in `tests/unit/runner-question-language.test.ts`) |

**Placeholder scan:** none. Every code step holds the full code.

**Assumptions with a Task 0 gate:** P2b's readers' form and package (`@debateai/map`), the marks' codes, both boots resolving the shape settings with the sealed map hash (through `readDebateShapeRunnerSettings`), the guard gone everywhere, the dev builder sealing `mapContractHash`, `debateShapeInForce`, the migration, P2c's `mapAnswersArgued` and `storyAnswersNoteFrom` (pre-flight PF-D6), the practice integration file green before any edit (pre-flight PF-D6), and P2L's pieces (Contract deviations 6–9).

**Not covered by an automatic test (by choice):** the debate's offer-and-resubmit path runs only in a real `lang-ro-en-mix` practice debate (S-8); its request is built by `practiceLanguageResubmission`, which the unit test pins. A second whole scripted debate in the integration file would cost about 15 minutes of the one-heavy-run budget for a path the unit test and the real debate already cover.

**Type consistency:**
- `PracticeShapeOverride`, `PracticeShapeAsk`, `PracticeShapeBlock`, `PracticeShapeFacts`, `PracticeShapeSource` and `PracticeMapReaders` are defined in Task 1 or Task 4 and used with the same names in Tasks 2–6.
- `practiceMapStepOf` and `PRACTICE_MAP_STEPS` are defined in Task 3 and used in Task 4.
- `PRACTICE_SHAPE_SOURCE_REF` and `practiceShapeVersionRows` are defined and tested in Task 2.
- `stubMapContent`, `stubQuestionLanguageContent` and the `GateRequestKind` `"QUESTION_LANGUAGE"` are defined in Task 6 (the `"MAP"` kind is P2b Task 15's) and used in Tasks 6 and 7b.
- `PRACTICE_CODE_HASH_ROW_KEYS` and `practiceCodeContractHashRows` are defined and tested in Task 2.
- `shapeRowChange`, `registerVersion`, `asked` and `shapeSource` are defined in Task 2 Step 5(c) and used with the same names in Tasks 4, 5 and 7b; `shapeRow` is used in Task 7b (controller ruling D-REGNEXT).
- Task 7c's two new optional inputs (`argumentLanguageTag`, `envelopeBasis`) and `ReviewCatchUpReviewer.review`'s `questionLanguage` are defined and used in Task 7c only.
- `PRACTICE_LANGUAGE_CASES` (Task 7b, practice-questions.ts) is used by `practiceDebateQuestion`, practice-language.ts and the tests; every name in Task 7b's Produces block is defined in Task 7b Step 4 and used with the same name in Steps 6–8 and 13.
