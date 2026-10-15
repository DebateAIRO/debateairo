# Debate Shape Phase 2c (what people see) Implementation Plan

> **Renumbered 2026-10-14:** the migrations this plan calls 0116 (the debate shape map) and 0117 (the language check's site cost) are now 0117 and 0118: the merge of `origin/dev` 221d784db brought dev's own 0116 (`0116_mail_locale.sql`) first. The numbers below are historical.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show people the new debate shape: the story mentions what was raised but not debated, the debate page lists it and titles every position "The case for …, argued by …", and the /new page's Depth mode, Depth of scrutiny and Answer length become real choices sent with the ask.

**Architecture:** Three independent strands that share one contract piece.
- **Story.** The story material gains an optional `also_raised` field. It is filled from the runner's in-memory map result, and it only ever uses the bytes the debate's own material leaves free under the story budget. The owner-editable pack (`story-shapes/common.md`, `checker.md`, `pack.json`) explains it, and the pack gets a new version. When the answers argued came from a map fallback (map unavailable, or answers or points filled in), the material also carries `answers_note`, one plain sentence the story retells once (owner ruling C-STORY). The story writer passes both fields on (pre-flight PF-C4, PF-C6).
- **Debate page.** A new contract shape, `DebateMapView` (`{ positions[{node_id, answer}], also_raised[] }`), comes from P2b's `readMapChoiceForRun`.
  - The owner reads it through a new route, `GET /v1/answers/{id}/map`.
  - Published snapshots carry a copy in `map_view`. That copy is checked by the publication content check.
  - The UI reads it beside the answer, the way it reads the floor. It renders an "Also raised, not debated" section, and it titles each opening position through a React context, in the question's language.
- **/new page.** After Project 1 and P2a land, the three controls are wired through `buildNewDebateAskConfig` and `createDebate` into `depth_params`. They are shown and sent only when the room read says the deployment's shape row is in force (`shape_settings: true`, Contract deviation 7). The legacy notice, the Max tokens slider and `lib/scrutinyDepth.ts` go away.
- **Locales.** All 35 locales get every new string, and the reworded merge-fallback label, through grouped Haiku translators, one Opus spot-check of the risky locales and one Opus second check of all the others.
- **Honesty.** The honesty drawer and the node drawer show the eight shape marks as words only, in a neutral tone, with no codes or ids (owner rulings C-DRAWER, C-TONE).

**Tech Stack:** TypeScript (strict), zod 4, Fastify (apps/api), Next.js/React 19 (apps/ui), vitest (jsdom render tests), node:test (apps/ui i18n catalog tests), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-12-debate-shape-design.md`. The plan covers:
- rulings S2, S6, S7 and S8;
- §3.2, the three user controls and the /new page;
- §3.3 step 8: answer length, "also raised" and the debate page;
- §3.4 read model;
- §5 render tests.

Binding names come from `docs/superpowers/plans/2026-10-12-debate-shape-phase2-INTERFACE.md`, §2 and §5.

---

## Amendments 2026-10-13

Every code fact below was checked against the branch's code on 2026-10-13.

1. Project 1 gate: `grep -q "RETIRED_FORM_KEYS" … && echo IN` instead of `grep -c` = `1`; the name appears 3 times today, so the old gate was a false BLOCKED. Checked before Tasks 8 and 9 only, because Task 9 removes the name. Source: P2a final review, row "P2c:33".
2. Where to work: names the worktree `.claude/worktrees/debate-shape-p2` and branch `feat/2026-10-13-debate-shape-phase2`. No stale path or branch was present. Source: controller item 7.
3. P2b gate: greps `packages/map/src`; the reader is in `@debateai/map`, never `@debateai/db`. Source: P2b cross-plan change 1.
4. New "P2b in-force gate" (`debateShapeInForce` in `@debateai/register`, used by `apps/api/src/main.ts`) before Task 8 Step 5b. Source: controller decision (room flag).
5. Global Constraints: the public answer body carries no `cost_envelope.basis.shape`; no P2c task read it, so nothing else changed. Source: P2a final review M8 (done in the fix wave).
6. Global Constraints: the eight new mark labels, `debateChrome.condition.*`, the `reportModel` cases, the opposite-answer template and the length sentence are P2b's; P2c adds none. Source: P2b cross-plan change 4. (Superseded in part by pre-flight PF-C33: P2c rewords the VALUE of `debateChrome.condition.mapMergeFallback` in all 35 locales; no key is added.)
7. Architecture "/new page" bullet and Review Focus item 6 ("a choice shown but silently dropped"). Source: controller decision; P2a final review row "P2c:85".
8. Contract deviation 4: P2b's settled home (`packages/map/src/repository.ts`) and its `MapChoiceRecord` fields; P2c's port reads a structural subset. Source: P2b cross-plan changes 1–2 (P2b Task 8).
9. Contract deviation 7 rewritten: one optional room-response member `shape_settings: z.literal(true).optional()` on both room schemas, written by the API only with the row in force; /new offers and sends the three settings only after a room has said so; Fixed stays UI-derived. Source: controller decision; P2a final review row "P2c:85" and owner question 8.
10. Contract deviation 9 rewritten: P2a already added the three fields to `AskRoomQuerySchema` and to `getAskRoom` (M4); P2c passes them from `useAskRoom` and the ALREADY_WAITING `readAskRoom`, and the phone draft compares them. Source: P2a final review M4 and row "P2c:87".
11. File Structure: rows for the room flag (contract, API, new test), apps/api's `@debateai/map` dependency, the six P2L keys and the draft's room query. Source: follows items 8–10, 13, 18.
12. Task 3 gate: the variable is fixed as `debateShapeMap: MapResult | null` (P2b Task 12); P2b ADDS the `@debateai/map` import to `apps/runner/src/index.ts` (none exists today); the story hook is at about line 9441 now, not 8545. Source: P2b cross-plan change 3; P2a final review ("say adds"); code check.
13. Task 3 Step 4a: `storyAlsoRaisedFrom` joins the `./story-snapshot.js` import (line ~203 today), not P2b's `@debateai/map` line, because P2c exports it from `story-snapshot.ts`. Source: my reading of P2b cross-plan change 3 against the code (see the report).
14. Task 5: `MapChoiceRepository` is imported from `@debateai/map`; `apps/api/package.json` gains `"@debateai/map": "workspace:*"`; `pnpm install --offline` updates `pnpm-lock.yaml`; the `tools/orphan-audit/src/index.ts` apps/api row gains `"map"`; `pnpm run audit:architecture`; commit list updated. Source: P2b cross-plan change 1.
15. Task 5 Interfaces: P2b's record fields named. Source: P2b cross-plan change 2.
16. Task 5 Step 6d: the anchor is `disclosures: ownerDisclosures,` (the old `new RepositoryAnswerDisclosureApplication(…)` line no longer exists). Source: code check.
17. Task 8: Step 1b (new `tests/unit/debate-shape-room-flag.test.ts`: contract and API), Step 5b (`shape_settings` in `packages/contract/src/index.ts` and the room handler in `apps/api/src/index.ts`, then `generate:contract`), Step 6c-2/6e/6f (the `shapeSettings` latch, room query with the three choices, controls and ask only with the flag), render-test additions (mock `getAskRoom`, 3 new cases), Steps 3, 10 and 11. Source: controller decision; P2a final review rows "P2c:85" and "P2c:87".
18. Task 8 Step 8: the six `newDebate.languageCheck.*` keys with P2L Task 18's English texts. Source: P2L amendment P2c-1.
19. Task 8 Step 9h: `tier01-new-plan-tier.test.tsx` mocks a room with `shape_settings: true` so the controls it counts render; `b10-room-notice.test.tsx` stays unchanged. Source: follows item 17.
20. Task 9: `SubmittedPhoneDraft.query` may carry the three choices; `validSubmitted` compares them with the config's, refuses them on one side only, and keeps an older draft valid; the test goes from 6 cases to 8 (corrected by pre-flight PF-C35; it had said 7 → 8). Source: P2a final review M4 / row "P2c:87"; controller item 2.
21. Task 10: the six keys join the batch (13 + 6 = 19 per locale; 13 for `ro`); `ro` gets P2L's Romanian texts as given through the merge script; a translator rule for `{languages}` / `{language}`; the Opus spot-check covers them and leaves `ro`'s six alone; order note (P2L Task 18 runs after Task 10 and edits the same /new files later). Source: P2L amendments P2c-2 and P2c-3; P2L controller ruling CR-7.
22. Task 11: Step 1 adds the `@debateai/map` catch and `audit:architecture`; Step 2 lists the new and touched test files; new Step 6 (room flag, M8 and six-key checks). Source: controller item 8.
23. Self-review: rows for the room flag, the room query, P2L's six keys, the map reader's home and M8; the placeholders list names P2b's settled names. Source: controller item 8.

## Pre-flight corrections 2026-10-14

Source: `.superpowers/sdd/2026-10-12-debate-shape-phase2c/preflight.md` (11 BLOCKER, 23 FIX, 12 NOTE; code at `1d90998b9`, names re-checked at `d0fe4896a`) and the controller rulings at the end of that folder's `progress.md` (C-STORY, C-ARTICLE, C-TONE, C-NAMES, C-DRAWER, C-GATE). Every changed step carries a "(pre-flight PF-Cn)" tag; every note is an "Implementer note (pre-flight PF-Cn)" in its task.

- PF-C1 (BLOCKER) → Tasks 4, 5, 6, 7 and 8 each regenerate `tests/support/shipped-corpus.manifest.txt` before the commit (`SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`, then again without the variable → PASS) and commit it; Task 11 Step 2 runs s1-1; Task 9 touches no shipped file (note).
- PF-C2 (FIX) → `pnpm --dir apps/ui exec tsc --noEmit -p tsconfig.json` (alone, after the memory check) in Tasks 6, 7, 8, 9 and 11 Step 1; Global Constraints line.
- PF-C3 (FIX) → the four P2b notes are handled in place: PF-C6 (Tasks 1–3), PF-C21 and PF-C22 (Task 7), PF-C33 (Tasks 7 and 10); Self-review rows.
- PF-C4 (BLOCKER) → Task 1 Step 1b (red-first case in `tests/unit/story-writer.test.ts`) and Step 3l (`writer.ts` `#compose` spreads `alsoRaised` and `answersNote`); Files, run list and commit updated.
- PF-C5 (NOTE) → implementer notes in Tasks 1 and 3 (`raised_by` owner choice, `kp`-style ids, new engine tokens, practice harness for P2d); Review Focus 1 now says "material bytes".
- PF-C6 (FIX) + ruling C-STORY → Task 1: `StoryAnswersNoteKind`, `STORY_ANSWERS_NOTE_MAP_UNAVAILABLE` / `STORY_ANSWERS_NOTE_ANSWERS_FILLED` (option-1 sentences), material field `answers_note` after `also_raised`, part of the core budget; Task 2: one material line and one paragraph in `common.md`, one sentence in `checker.md`, inside the same pack bump; Task 3: `storyAnswersNoteFrom(shapeMapResult, arguedTodaysOpening)` from the map's marks (never `debateShapeMap`); Wording picks block "Story: how the answers were chosen".
- PF-C7 (BLOCKER) → Task 2 Step 5: list every pack version used (`git log --all -p`), bump `2026-10-12.1` → `2026-10-14.1` (or the next unused `2026-10-14.N`); commit subject and Self-review match.
- PF-C8 (BLOCKER) → Task 2 Step 6b re-pins the six story seals in `tests/unit/hs-s01-seal.test.ts` (incl. three `not.toBe` guards the finding missed) with a dated comment; the false "fingerprinted, not pinned" line is gone; file committed.
- PF-C9 (NOTE) → Task 2 note and size text (19,883 bytes, +~1.5 KB, 24 KB file limit).
- PF-C10 (FIX) → Task 3 Step 3c anchors on the real last two lines (`roleMakers` with its comma, then P2L's `languageLocked`); the pinned `roleMakers` text is kept.
- PF-C11 (NOTE) → applied: `alsoRaised` is sent only when `shapeMapPositions !== null && shapeMapPositions.length >= 2`; hook line hint ~10281; pinned by the wiring test.
- PF-C12 (FIX) → Task 4 Step 8: s7-authorization expected red until Task 5 Step 7; no push in between.
- PF-C13 (NOTE) → Task 4 implementer note.
- PF-C14 (BLOCKER) → Task 5 Step 7b: s7 route count 166 → 167 with its comment.
- PF-C15 (FIX) → every 404 case records reader calls and asserts `[]`; `/map` rows in s7's denied-owned and malformed tables with a recording `mapViews` (`mapReads` stays `[]`).
- PF-C16 (FIX, preferred form) → `readMapView({ runId, nodeIds, ownership })`; `RunOwnerCheck` / `runOwnerCheckFrom` (`SELECT core.run_is_owned_by($1,$2,$3) AS owned`, migration 0037); null before the map read when not owned; the published copy is read as the publisher (`authenticated.ownerRef`); Contract deviation 5.
- PF-C17 (FIX) → Task 5 Step 4a: `DebateMapViewSchema,` after `DataExportDownloadRequestSchema,` in `apps/api/src/index.ts`'s contract import.
- PF-C18 (FIX) → Tasks 5 and 11: `audit:architecture` (and, in Task 11, `audit:source`) expect exactly the 3 known F31 obs-capture lines, none naming `apps/api -> map`.
- PF-C19 (NOTE) → Task 5 notes; the port's record renamed `MapViewSource` (applied); the corrupt-row 500 stays (no `readOwnerMapView`); the data export without the map view is an owner item.
- PF-C20 (BLOCKER) → Task 6 test uses `ENGLISH_TITLE` instead of `publicEnglish`; PASS (6) after the C-NAMES cases.
- PF-C21 (BLOCKER) + ruling C-DRAWER → Task 7 Step 5c: `AnswerHonestyDrawer.tsx` shows only the label for the eight shape marks, no `title`; new `tests/render/debate-shape-mark-labels.test.tsx`.
- PF-C22 (FIX) + ruling C-TONE → Task 7 Step 5d: all eight shape marks neutral, no `title`, in `NodeDetailDrawer.tsx` (served root node included); Step 9d `.drawerConditionPill.neutral`; render assertion.
- PF-C23 (FIX) + ruling C-NAMES → `positionAiName`: `modelMeta` family name for a known non-local family, else `PREVIEW_MODEL_MAKERS` maker, else a plain recorded maker, else no title (never a raw id; `makerIdentityLabel` keeps the raw id, so it is not used); tests for GLM, Qwen and unknown ids.
- PF-C24 (FIX) + ruling C-NAMES → the answer is trimmed and its closing `[\s.!?。！？؟]+` stripped; empty → no title; "Move now." test.
- PF-C25 (FIX) → File Structure: `PositionTitlesContext` moves to the `PositionTitle.tsx` row.
- PF-C26 (NOTE) → Task 6 note: the 404 path logs nothing.
- PF-C27 (BLOCKER) → Task 7 refresh test without `emit`/`streamEvents`; `readAnswerMapView` mocked (rejects with `ContractHttpError`); new success-path case; PASS (7).
- PF-C28 (FIX) → Task 7 6f/6g gate the owner view on `storyLocaleReady`.
- PF-C29 (NOTE) → Task 7 notes (titles in Tree and Thread only, on purpose; `<p>`; no axe test); `useId()` applied; "empty" sentence option in Wording picks.
- PF-C30 (FIX) → Task 8 Step 4d old text with the file's real indentation.
- PF-C31 (FIX) + ruling C-ARTICLE → Task 8 Step 12: a local owner packet drafts the next `unsupported-capabilities` version (en drafts and 3 phrasings in the plan; ro written by the implementer); no support-kb file, review record or pin changes; owner step below. Drafts say "paid plans" (the sold plans are Free, Plus, Pro, Max).
- PF-C32 (FIX) → P2L Task 18 Step 4 also runs `tests/render/debate-shape-new-controls.test.tsx` and `tests/unit/debate-shape-new-ask-wire.test.ts` (edited in the P2L plan); Task 8 note.
- PF-C33 (BLOCKER) → Global Constraints and Amendment 6; Wording picks row; Task 7 Step 9e sets the English value "Points that said the same thing were combined"; Task 10 adds the 34 `debateChrome.json` files with an explicit replace list (throws on a missing key), 20 keys per locale (14 for ro), 136 files, `debateChrome.test.mjs`, a per-locale change check; Task 11 Step 6 counts 35 changed.
- PF-C34 (NOTE) → Task 8 notes (legacy look and the "V2 knobs" comment fixed, no-row page, Free-only mirror, extra room reads); Answer length aria assertions added; Step 3 expected text and Step 5b-1 anchor fixed; Contract deviations 7 and 9 sentences; owner questions below.
- PF-C35 (NOTE) → Amendment 20 says 6 → 8; Task 9 note.
- PF-C36 (NOTE) → applied: packets in `.superpowers/sdd/2026-10-12-debate-shape-phase2c/translations` at the worktree root, Step 1 checks it is git-ignored.
- PF-C37 (BLOCKER) → Task 10 Step 3b: one Opus second check (effort high, foreground) of the 22 non-risky locales with 7 checks; the same checks in Step 3 and as translator rule 9; commit message updated.
- PF-C38 (FIX) → Task 10 diff checks run from the engine folder.
- PF-C39 (FIX) → Task 10 stages only the four catalogue globs of the 34 locales (`en` excluded) and checks the staged count (136).
- PF-C40 (FIX) → translator rule 1 and both Opus checks: no case ending or agreement on `{ai}` / `{answer}` (colon or dash construction).
- PF-C41 (NOTE) → Global Constraints (compose parity red from Task 8); Task 10 notes and a key-gap check in Step 1; P2L Task 18 Step 0 `|| true` (edited in the P2L plan).
- PF-C42 (BLOCKER) + ruling C-GATE → Task 11 Step 3: `pnpm exec vitest run tests/architecture --maxWorkers=2` after the memory check, only scaffold's F31 row red; never `test:ci-gate`; CI judges.
- PF-C43 (FIX) → Task 11 Step 2 runs the full added list, one file at a time (plus the new mark-labels test).
- PF-C44 (FIX) → Global Constraints: `P2C_BASE` recorded in `progress.md` before Task 1; Task 11 Step 5 reads it; no `<base>` placeholder left.
- PF-C45 (NOTE) → Task 11 Step 3b: the four database suites, one at a time.
- PF-C46 (FIX) → Self-review rows added and corrected; "Placeholders: none" is now true.

New decisions taken while correcting (cost if wrong in brackets):
- `answers_note` is core material, never dropped, long version only, start of the paths section [a fallback run at its budget edge may fit one ladder step later; short texts do not repeat it].
- Only `MAP_UNAVAILABLE_TODAYS_OPENING`, `ANSWERS_FILLED` and `CHOOSE_QUOTA_FILLED` (or today's opening argued) trigger the note; the other map fallbacks change how the map was made, not which answers were argued [none].
- Preview models are titled by their maker's display name ("Z.AI", "Alibaba"), per C-NAMES [~3 test lines and `positionAiName` if the owner prefers family names].
- The map view's owner check SQL lives in `map-views.ts` (`runOwnerCheckFrom`) and normalizes the ownership first [a malformed ownership gives 404, not 500].
- The support-article draft is a local, uncommitted owner packet [none: the owner's publication commit is separate].
- Task 10 Step 1's key-gap check stops the task if any earlier task added an unplanned UI key [a false BLOCKED].

### Owner steps (current)

1. **Story answers note (C-STORY):** pick phrasing 1, 2 or 3 for each kind, and for the pack paragraph and the checker sentence (Wording picks). Option 1 ships.
2. **Support article (C-ARTICLE):** review the `unsupported-capabilities` draft (en and ro, recovery rows; Task 8 Step 12 packet), pick phrasing 1, 2 or 3, and publish the signed version BEFORE the shape is switched on.
3. **Wording picks:** every table below (debate page, /new, story pack, answers note, mapMergeFallback); also the `public.alsoRaised.empty` alternative and, on the debate page, whether "{ai} argues: {answer}" reads better with full-sentence answers.
4. **Native-speaker checks:** the new strings and the mapMergeFallback reword in mt, hi, vi, id, et, fi, ko first (as for the earlier maker labels), then the rest.
5. **Owner questions from the pre-flight:** the Free hint on the locked Depth mode and Depth of scrutiny (3 phrasings in Wording picks); a restyle of the OPTIONS panel's dashed "legacy" box; titles in the Split, Map and node-drawer views too; whether the owner's data export should include the map view; `raised_by` (keep the count, or send the order only).
6. **Before any upload:** P2d's practice run must show also_raised and the answers note in a real story (the practice harness sets neither today).

## Global Constraints

- **Where to work.** Work only in this worktree's engine folder: worktree `.claude/worktrees/debate-shape-p2`, branch `feat/2026-10-13-debate-shape-phase2`, engine folder `.claude/worktrees/debate-shape-p2/dialectical-engine`. Every command below starts with `cd "$(git rev-parse --show-toplevel)/dialectical-engine"`. The git toplevel is the worktree; the engine is its `dialectical-engine/` folder. Never touch the main checkout. Never read `settings.env` or key files.
- **Record the base before Task 1** (pre-flight PF-C44). Once, before Task 1's first edit, from the engine folder: `printf 'P2C_BASE=%s\n' "$(git rev-parse HEAD)" >> "$(git rev-parse --show-toplevel)/.superpowers/sdd/2026-10-12-debate-shape-phase2c/progress.md"`. The line must read exactly `P2C_BASE=<hex>`; Task 11 Step 5 reads it back. Record whatever HEAD is when Task 1 starts (the pre-flight saw `1d90998b9`; later commits may have landed).
- **Order and gates.** Run the tasks in order. Each gate is a check command that must pass before the task's first edit. When a gate fails, stop and report BLOCKED with the command output; do not work around it.
  - **Project 1 gate** (Tasks 8–9): `grep -c 'id="concurrency"' apps/ui/app/new/NewDebatePageClient.tsx` prints `0`, and `grep -q "RETIRED_FORM_KEYS" apps/ui/lib/phoneCompletionDraft.ts && echo IN` prints `IN` (the name appears 3 times in Project 1's file, so do not compare a count). This means Project 1, branch `feat/2026-10-12-parallel-calls`, has been merged into this branch. Task 9 replaces `RETIRED_FORM_KEYS` by design, so this gate is checked before Task 8 and before Task 9, never after Task 9.
  - **P2a gate** (Tasks 8–9): `pnpm exec tsx -e 'import("@debateai/contract").then((m) => console.log(Object.keys(m.DepthParamsSchema.shape).join(",")))'` prints `depth,depthMode,scrutiny,answerLength`.
  - **P2b gate** (Task 3, and Task 5 step "wire main.ts"): `grep -rn "readMapChoiceForRun" packages/map/src --include='*.ts'` shows P2b's reader in `packages/map/src/repository.ts` (the `MapChoiceRepository` method and the free function `readMapChoiceForRun(pool, runId)`, P2b Task 8). The reader lives in `@debateai/map`, never in `@debateai/db`.
  - **P2b in-force gate** (Task 8, the room flag steps): `grep -rn "export function debateShapeInForce" packages/register/src` prints one line, and `grep -c "debateShapeInForce" apps/api/src/main.ts` prints at least `1`. This means P2b Task 6 has landed: `apps/api/src/main.ts` hands the API (`ApiOptions.debateShapePolicy` and the ask application's settings) only a row that is in force (present, and its optional `enabled` member is not `false`).
- **The public answer body carries no `cost_envelope.basis.shape`** (P2a final review M8, done: `publicCostEnvelopeBasis` in `packages/serve/src/index.ts` strips it). P2c never reads it. A run's settings, where a task needs them, come from the run's `depth_params`.
- **Mark labels are P2b's.** The labels of the eight new condition marks (`apps/ui/lib/v3/labels.ts`, `debateChrome.condition.*` in every locale), the `reportModel` `pointNote` cases, the opposite-answer template and the synthesizer's length sentence are P2b's (P2b Tasks 2, 3, 5). P2c adds no mark label and no `debateChrome` key. It does reword the VALUE of `debateChrome.condition.mapMergeFallback` (no key added): the code combines only points that are identical after normalising (`packages/map/src/keypoints.ts`), so "Similar points were grouped together by a simple rule" overclaims. English in Task 7 Step 9e, the 34 other locales in Task 10 (pre-flight PF-C33).
- **Shape marks show words only** (rulings C-DRAWER, C-TONE). In the honesty drawer and the node drawer, the eight `DEBATE_SHAPE_MARKS` show only their localized label, in a neutral tone, with no raw mark code as a tooltip and no reason code, run id or node id (Task 7).
- **Shipped-file list (SC1)** (pre-flight PF-C1). Every task that adds or deletes a file under `packages`, `apps` or `web` regenerates `tests/support/shipped-corpus.manifest.txt` before its commit: `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`, then the same without the variable → PASS, and the manifest joins the commit.
- **The UI has its own compiler** (pre-flight PF-C2). The root `tsconfig.json` excludes `apps/ui`, so `pnpm run typecheck` never sees it. Every task that edits apps/ui runs `pnpm --dir apps/ui exec tsc --noEmit -p tsconfig.json` (exit 0), alone, after the memory check.
- **Heavy commands.** Run one at a time on the owner's Mac (16 GB):
  - Before any `vitest run` or `tsc`, check `memory_pressure | tail -1`. Free memory must be at least 40%.
  - At most one other `vitest run` may be going (count runs, not processes): `ps -A -o command | grep -c 'vitest[ ]run'` prints `0` or `1`.
  - No two heavy commands in parallel. Never run the whole suite, and never `pnpm test:ci-gate` on the Mac: a targeted list, one file at a time, plus `pnpm exec vitest run tests/architecture --maxWorkers=2` in Task 11. CI judges the full suite (ruling C-GATE, pre-flight PF-C42).
- **Running tests.** Unit and render tests run one file at a time: `pnpm exec vitest run <file>`. The apps/ui i18n tests run one file at a time: `cd apps/ui && node --import tsx --test lib/i18n/<file>.test.mjs`.
- **What people see.** User-facing text never shows scores, thresholds, P-numbers, citation markers, judge, checker or reviewer mechanics, internal ids, or how many AIs raised a point. Debate-page labels use the question's language (`storyCatalog` / `storyLocale`).
- **Wording.** Every new user-facing sentence ships with option 1 from "Wording picks"; the owner may swap in option 2 or 3 later.
- **Owner-editable prompt text.** `story-shapes/common.md` and `story-shapes/checker.md` are fingerprinted owner text. Any change bumps `story-shapes/pack.json` `version`, which makes it a new sealed version (Task 2).
- **Locales.** Every new string, and the reworded `mapMergeFallback` value, goes to all 35 locales in Task 10.
  - Between Task 7 (first new English key) and Task 10, the i18n parity tests (`public.test.mjs`, `catalog.test.mjs`, and from Task 8 also `compose.test.mjs`) are expected to be red. Do not push before Task 10 is green (pre-flight PF-C41).
  - Task 10's key list is fixed. If a correction ever adds a UI key in Tasks 1–9, Task 10 must carry every key a locale lacks after Tasks 1–9 (`misc` included); its Step 1 key-gap check stops the task otherwise (pre-flight PF-C41).
- **Commits.** Commit messages end with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only the files the task names. Never commit an edit you did not make: owner sessions share worktrees.
- **Subagents.** Haiku runs with effort `xhigh` for mechanical jobs; Opus runs with effort `high` for hard ones. Every Opus subagent prompt says it may spawn its own haiku/opus subagents. Subagents run in the foreground.

## Review Focus

Seven failure modes that could slip past ordinary tests. Each one has a named test in the task that owns it.

1. **Today's story prompt changes when there is no map.** An empty `also_raised` field, an absent-but-sent `answers_note`, or a reordered field list, would change the material bytes of every story on a run without the new shape (pre-flight PF-C5: the material bytes, not the contract hash, which covers the instruction and answer form only). Test: Task 1, `keeps the material byte for byte when nothing was also raised`.
2. **The also-raised points push the debate's own material down the shrink ladder.** That would cut judge texts and claims to make room for points nobody argued. Test: Task 1, `never moves the ladder: also-raised points only use the bytes the debate leaves free`.
3. **New public text bypasses the publication content check.** `map_view.positions[].answer` and `map_view.also_raised[]` would be published without the hate-speech judge seeing them. Test: Task 4, the updated `hs-s02-check` R2 property ("28 checked paths, 33 excluded") and `checks the map view's public text with the arguments`.
4. **The three choices are dropped between the page and the wire.** `buildNewDebateAskConfig` could set them while `createDebate`, which builds `AskRequest` field by field, drops them, so the server never sees them. Test: Task 8, `puts depth mode, scrutiny and answer length into depth_params on the wire`.
5. **Position titles are wrong, leak, or vanish.** Possible ways:
   - a title in the interface's language instead of the question's;
   - a title for a node the published answer does not hold;
   - a title lost on the page's own refresh, when the map read fails.

   Tests: Task 5, `drops positions whose root node is not in the answer`; Task 7, `titles each position in the question's language` and `keeps the titles when a refresh cannot read the map`.
6. **A choice is shown but silently dropped.** With no `debateShapePolicy` row in force, the API's normalisation drops `depth_mode`, `scrutiny` and `answer_length` without a word, so a person who picked "Detailed" or "Fixed" would get today's debate. The page therefore shows the three controls only when the room read says `shape_settings: true`, and otherwise sends none of them. Tests: Task 8, `keeps today's room body when no shape row is in force` (API), `shows none of the three controls and sends none of them when the room does not say they are in force` (render).

7. **Engine internals reach the person through the drawers.** The honesty drawer prints a record's scope, subject (a run or node id) and reason code, and both drawers put the raw mark in a tooltip; for the eight shape marks that is engine talk. Test: Task 7, `tests/render/debate-shape-mark-labels.test.tsx` (pre-flight PF-C21, PF-C22).

## Contract deviations

From `2026-10-12-debate-shape-phase2-INTERFACE.md`:

1. **Message keys namespace (§5).** The keys are `public.alsoRaised.title`, `public.alsoRaised.empty` and `public.positionTitle`, not `debate.*`.
   - No `debate` namespace exists. Adding one means a new namespace type, 35 loader entries, 35 files and a new parity test.
   - The `public` catalogue is already loaded in the question's language on both the owner and the public debate page (`storyCatalog`). That makes it the right home for labels that must use the question's language.
2. **Story material item keys (§5).** The interface names `alsoRaised: { claim, raisedBy }[]`. That name is kept for the TypeScript snapshot input (`StorySnapshotAlsoRaised`).
   - The model-facing JSON is `also_raised: [{ claim, raised_by }]`, snake case like every key the storyteller reads (`known_by`, `judge_spread`).
   - Because they hold underscores, `also_raised` and `raised_by` join `STORY_ENGINE_TOKENS` automatically, so the deterministic check refuses them in a story.
3. **"Bounded by the story budget" is defined as lowest priority.** The also-raised list never changes `compressionStep`.
   - The list fills only the bytes left after the debate's material fits at its ladder step: most-raised first, at most 12 items, each claim cut to `min(240, that step's claim cut)`.
   - With no room left, the field is not sent.
4. **What `readMapChoiceForRun` must return (P2b, §4).** The interface leaves the `core.map_choice` jsonb shape open. P2c needs, per run:
   - `answers[]` with `statement` and `rootNodeId`, the opening position (root node) that argued it, or null;
   - `alsoRaised[]` with `claim` and `makers`.

   P2c consumes this through one structural port, `MapChoiceReader` (`apps/api/src/map-views.ts`). If P2b's row differs, only that module and the one `main.ts` line change. Without `rootNodeId`, no position title can be shown.

   P2b settled it (P2b Contract deviations 4–5, Task 8): `MapChoiceRepository` (constructor `(pool)`, method `readMapChoiceForRun(runId)`) and the free function `readMapChoiceForRun(pool, runId)` live in **`@debateai/map`** (`packages/map/src/repository.ts`), not `@debateai/db`. The method returns P2b's `MapChoiceRecord | null`:
   - `opening: "MAP" | "TODAYS_OPENING"`;
   - `answers[]`: `answerId`, `statement`, `rootIndex`, `rootNodeId: string | null` (from `core.map_position`), `maker: string | null`, `filled`;
   - `alsoRaised[]`: `keyPointId`, `claim`, `makers[]`, most-raised first;
   - `marks[]`.

   P2c's port reads only `answers[].statement`, `answers[].rootNodeId`, `alsoRaised[].claim` and `alsoRaised[].makers`, so P2b's record satisfies it structurally. The port's own record type is named `MapViewSource` (not `MapChoiceRecord`), so it never clashes with P2b's type (pre-flight PF-C19). `maker`, `answerId`, `keyPointId` and `marks` never leave `map-views.ts`.
5. **The read model is a new owner route plus a snapshot field.** These are `GET /v1/answers/{id}/map` → `DebateMapViewSchema` and an optional `PublicDebateSchema.map_view`. §3.3 says only "read model + adapter field".
   - The route mirrors `GET /v1/answers/{id}/disclosure`: the answer read is the first ownership check, and "not yours", "no map" and "malformed" all return one closed 404.
   - Because P2b's reader takes a bare run id, the map view application checks again with `core.run_is_owned_by` before it reads the map (`RunOwnerCheck`, Task 5), and the published copy is read as the publisher (`authenticated.ownerRef`) (pre-flight PF-C16).
6. **Position titles go through a React context** (`PositionTitlesContext`), not a field on `DebateNode`. Built with the question's catalogue, they reach the canvas and thread views without threading a catalogue through four views.
7. **One deployment-level flag on the room read; Fixed is still derived from the tier on the UI.**
   - **The flag.** With no `debateShapePolicy` row in force, the API's normalisation (P2a) silently drops `depth_mode`, `scrutiny` and `answer_length` (final review row "P2c:85"). So the room RESPONSE gains one optional member, `shape_settings: z.literal(true).optional()`, on BOTH `CustomerAskRoomResponseSchema` and `InternalAskRoomResponseSchema` (`packages/contract/src/index.ts`). The API's room read (`GET /v1/asks/room` in `apps/api/src/index.ts`, the handler that calls `roomDepthParams`) writes `shape_settings: true` only when `options.debateShapePolicy !== undefined`. That is the same value the handler's normalisation already reads, and after P2b `apps/api/src/main.ts` hands it only a row that `debateShapeInForce` (`@debateai/register`, P2b Task 6) says is in force. With no row in force, the member is never written, so today's room body is byte for byte the same.
   - **The page.** /new shows Depth mode, Depth of scrutiny and Answer length ONLY once a room read has said `shape_settings === true`. Otherwise (no row, the room read failed or was refused, an older API) none of the three controls is shown, and `buildNewDebateAskConfig` gets none of them, so the ask carries none and nothing can be dropped silently. Once seen, the flag is kept for the page's life, like the decided plan, so a later failed or ALREADY_WAITING re-read does not hide the controls mid-edit.
   - **Fixed per tier** stays UI-derived (`fixedDepthAllowedFor(planTier)`: Free → no). With today's start values, only Free disallows it. The API's normalisation (P2a) remains the authority for the values.
   - Controller decision 2026-10-13. It replaces the earlier "no server capability field is added".
   - **With no row in force the page is not literally today's.** The "not sent" notice, Max tokens and both selects go in every case, so with no row the OPTIONS panel keeps only the role-overrides line (pre-flight PF-C34).
   - **The page mirrors only Free's limits.** `fixedDepthAllowedFor` and the disabled selects follow Free's limits; a sealed row that restricted a paid plan would still be normalised by the API without a word on the page. With the start values no paid plan is restricted (pre-flight PF-C34).
8. **The UI config uses snake-case keys.** `buildNewDebateAskConfig` emits `depth_mode`, `scrutiny` and `answer_length`, matching its other keys. `createDebate` maps them into `depth_params.{depthMode, scrutiny, answerLength}` (§2).
9. **The waiting-room query already carries the three fields (P2a).** P2a added `depth_mode`, `scrutiny` and `answer_length` (each optional) to the server's `AskRoomQuerySchema`, and its fix wave (final review M4) added them to the typed client `getAskRoom` (`packages/contract/src/client.ts`), which appends each only when present. P2c changes neither. P2c's job is to pass them: the /new page reads the room through `useAskRoom` (`apps/ui/lib/billing/room.ts`) and, after an ALREADY_WAITING refusal, `readAskRoom`. Both get the three fields whenever the controls are shown, and only then (Task 8). The phone hand-off draft's room-query check compares them too (Task 9). Each change of the three settings, and the flag turning on, makes one more `GET /v1/asks/room` read, which counts against the person's `askRoomReads` budget when one is sealed; a 429 only hides the room notice, and the ask stays authoritative (pre-flight PF-C34).
10. **The phone hand-off draft stays `version: 1`.** It reads the two older shapes and upgrades them (Max tokens → Answer length `standard`; depth mode `manual`/`recommended` → `adaptive`), following Project 1's `RETIRED_FORM_KEYS` precedent.

## Wording picks

Option 1 of each item ships in code. The owner may pick 2 or 3; changing a pick means editing the English catalogue and re-running Task 10's merge for that key only.

**Debate page (`public` catalogue, the question's language)**

| Key | Option 1 (in code) | Option 2 | Option 3 |
|---|---|---|---|
| `public.alsoRaised.title` | Also raised, not debated | Also came up, not argued here | Other points raised, not debated |
| `public.alsoRaised.empty` | Every point that came up was debated. | Nothing that was raised was left out of the debate. | All the points raised were argued in the debate. |
| `public.positionTitle` | The case for {answer}, argued by {ai} | {ai} argues: {answer} | Arguing for {answer}: {ai} |

Notes for the owner (pre-flight PF-C24, PF-C29, ruling C-NAMES):
- `{answer}` is a full sentence with its closing punctuation removed ("The case for Move now, argued by GPT"). Option 2 reads most naturally with full sentences.
- `{ai}` is never a raw model id: a known family name ("GPT", "Claude"), else the maker's display name ("Z.AI", "Alibaba", "DeepSeek", "Xiaomi" on the preview), else no title.
- `public.alsoRaised.empty` option 1 slightly overclaims (points beyond the chosen ones, and positions cut by money stops, were not argued). A fourth option: "Nothing else came up beyond the points above."

**Honesty drawer (`debateChrome` catalogue; a value change, no key added; no final full stop)** (pre-flight PF-C33)

| Key | Option 1 (in code) | Option 2 | Option 3 |
|---|---|---|---|
| `debateChrome.condition.mapMergeFallback` | Points that said the same thing were combined | Only points worded the same way were combined | Points were combined only when they said the same thing |

Meaning for translators: only points that said exactly the same thing were combined. Today's value ("Similar points were grouped together by a simple rule") is replaced in all 35 locales.

**/new page (`newDebate` catalogue, the interface's language)**

| Key | Option 1 (in code) | Option 2 | Option 3 |
|---|---|---|---|
| `newDebate.depthModeAdaptiveHelp` | Goes deeper only where a point could change the answer. | Digs further only into the points that matter for the answer. | Spends extra rounds only where the answer could still move. |
| `newDebate.depthModeFixedHelp` | Goes deeper under every point, whether or not it could change the answer. | Digs into every point to the same depth. | Gives every point the same number of rounds. |
| `newDebate.scrutinyStandardHelp` | The usual checks on every point. | Normal scrutiny for every point. | Every point gets the standard checks. |
| `newDebate.scrutinyDeepHelp` | Extra rounds on the points most in doubt. | A second look at the weakest and most disputed points. | More follow-up on points that are shaky or contested. |
| `newDebate.scrutinyExhaustiveHelp` | The most extra rounds, on more of the points in doubt. | Keeps testing doubtful points for longer, and more of them. | The deepest checks on the points still in doubt. |
| `newDebate.answerLength` | Answer length | Length of the answer | How long the answer is |
| `newDebate.answerLengthHint` | About 300, 700 or 1,500 words: a target, not a hard limit. | Roughly 300, 700 or 1,500 words; the answer may run a little shorter or longer. | How long the written answer should be: about 300, 700 or 1,500 words. |

Owner question (pre-flight PF-C34): on Free, should the locked Depth mode and Depth of scrutiny hints say they are fixed, like the neighbouring rows? 1. Add "· fixed by the Free plan" to the current help (e.g. "Goes deeper only where a point could change the answer · fixed by the Free plan"). 2. A short Free-only hint ("Adaptive on the Free plan" / "Standard on the Free plan"). 3. Keep the per-value help with no suffix (what ships now).

Fixed by ruling S8, so there is no pick: `newDebate.answerLengthShort` "Short", `newDebate.answerLengthStandard` "Standard", `newDebate.answerLengthDetailed` "Detailed". The labels Fixed, Adaptive, Standard, Deep and Exhaustive already exist and are kept.

**Owner-editable story text (model-facing; the owner picks as for user text)**

`story-shapes/common.md`, new section "## Also raised, not debated":

1. *(in the pack)* When also_raised is present, end the section about the paths with one short paragraph on what else came up: name in plain words the points that matter most to the person, most-raised first, and say that the debate did not argue them, so it neither supports nor rejects them. You need not name them all. They are not findings: never present one as shown or refuted, never say who raised it or how many did, and leave node_refs empty for what rests only on them, because they have no reference. Keep them out of the headline, the summary, the confidence sentence and the path lines.
2. Points in also_raised came up but were not debated. Mention the ones that matter to the person in one short paragraph near the end of the long story, as questions still open rather than findings. They have no reference, so do not cite them in node_refs, and never say who raised them or how many did.
3. Close the section about the paths with what else came up: the points in also_raised that matter most to the person, said plainly as points the debate did not argue, with a word on how the person could weigh them. They are not findings, they carry no reference in node_refs, and the story never says who raised them or how many did.

`story-shapes/checker.md`, a sentence appended to the material description:

1. *(in the pack)* also_raised, when present, lists points that came up but were never debated, each with raised_by, how many models raised it; the story may mention them in plain words without citing a point, but never as findings, and never says who raised them or how many did.
2. also_raised holds points raised but not debated; a mention of one needs no citation, as long as the story does not treat it as tested or say who raised it.
3. Points in also_raised were never argued: the story may name them without node_refs, but presenting one as a finding, or saying who or how many raised it, is a fault.

**Story: how the answers were chosen (owner ruling C-STORY, pre-flight PF-C6)**

The sentence the material's `answers_note` carries when the answers argued came from a map fallback. It is model-facing material held as constants in `packages/story/src/material.ts` (`STORY_ANSWERS_NOTE_MAP_UNAVAILABLE`, `STORY_ANSWERS_NOTE_ANSWERS_FILLED`); the storyteller retells it once, in the question's language. No engine words.

| Kind | Option 1 (in code) | Option 2 | Option 3 |
|---|---|---|---|
| Map unavailable (`MAP_UNAVAILABLE`) | We could not first gather every possible answer, so each AI argued the answer it found best. | The step that lists the possible answers did not finish, so each AI put forward its own answer. | Each AI argued its own answer, because the list of possible answers could not be completed. |
| Answers or points filled in (`ANSWERS_FILLED`) | Some of the answers or points argued here were added to make sure enough options were tested. | To test enough options, a few answers or points were added to the ones first picked. | Not every option argued here was picked first; some were added so the debate covered enough ground. |

`story-shapes/common.md`, a paragraph in "## The paths" about `answers_note`:

1. *(in the pack)* the Task 2 Step 3a-bis text ("When answers_note is present, not every answer argued here was picked the usual way, …").
2. If answers_note is present, open the section about the paths by telling the person, once and in plain words of the question's language, what it says about how the answers came to be argued. It cites no point; say nothing more about how the debate was run, and leave it out of the short version.
3. answers_note, when present, explains in one English sentence why some answers argued were not picked the usual way. Put its meaning, in your own words and the question's language, in the first paragraph of the section about the paths, once only, with no citation; it does not belong in the headline, the summary, the confidence sentence or the path lines.

`story-shapes/checker.md`, a sentence about `answers_note`:

1. *(in the pack)* the Task 2 Step 4 text ("answers_note, when present, is one plain sentence on why not every answer argued was picked the usual way; …").
2. answers_note, when present, says in one sentence why not every answer argued was picked the usual way; the story may say this once, near the start of the section about the paths, without a citation, and that alone does not break speaks_to_the_person.
3. answers_note, when present, is a sentence the story should retell once, in its own words, near the start of the section about the paths; it needs no citation and is not talking about the machinery, but any further detail about how the debate was run is.

**Help bot article (owner ruling C-ARTICLE, pre-flight PF-C31):** the three phrasings of the changed sentence of `unsupported-capabilities` are in Task 8 Step 12; the owner picks one when signing the new version.

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `packages/story/src/material.ts` | 1 | `also_raised` material field: types, ranking, budget fill, engine tokens and figures; `answers_note` core field and the `STORY_ANSWERS_NOTE_*` sentences (C-STORY) |
| `packages/story/src/index.ts` | 1 | exports `STORY_ALSO_RAISED_MAX`, `STORY_ANSWERS_NOTE_MAP_UNAVAILABLE`, `STORY_ANSWERS_NOTE_ANSWERS_FILLED`, `StoryAnswersNoteKind`, `StoryMaterialAlsoRaised`, `StorySnapshotAlsoRaised` |
| `packages/story/src/writer.ts` | 1 | `#compose` passes the snapshot's `alsoRaised` and `answersNote` on to the material (PF-C4) |
| `tests/unit/story-writer.test.ts` | 1 | the writer hands both fields to both prompts, and neither without them (PF-C4) |
| `tests/unit/debate-shape-story-also-raised.test.ts` (new) | 1 | material and validate tests, answers note included |
| `story-shapes/common.md`, `story-shapes/checker.md`, `story-shapes/pack.json` | 2 | owner text for `also_raised` and `answers_note`; pack version `2026-10-14.1` (PF-C7) |
| `tests/unit/hs-s01-seal.test.ts` | 2 | story contract seals re-pinned for the new pack (PF-C8) |
| `tests/unit/story-pack.test.ts` | 2 | the pack explains `also_raised` / `raised_by` / `answers_note` |
| `apps/runner/src/story-snapshot.ts` | 3 | `storyAlsoRaisedFrom(map)`, `storyAnswersNoteFrom(map, arguedTodaysOpening)`, `StoryMapOutcome`; `alsoRaised` and `answersNote` in `StorySnapshotSource` |
| `apps/runner/src/index.ts` | 3 | passes the also-raised points (only when the map's own answers were argued) and the answers note (from `shapeMapResult`) to the snapshot |
| `tests/unit/debate-shape-story-snapshot.test.ts` (new) | 3 | snapshot wiring tests, answers note included |
| `packages/contract/src/map-view.ts` (new) | 4 | `DebateMapViewSchema`, `DEBATE_MAP_VIEW_LIMITS` |
| `packages/contract/src/index.ts` | 4 | re-export; `PublicDebateSchema.map_view`; route + resource inventory |
| `packages/contract/src/client.ts` | 4 | `readAnswerMapView` |
| `apps/api/src/publication-check/material.ts` | 4 | checks `map_view` text as ARGUMENTS |
| `tests/unit/hs-s02-check.test.ts` | 4 | path table and counts |
| `tests/unit/debate-shape-map-view-contract.test.ts` (new) | 4 | contract tests |
| `apps/api/src/map-views.ts` (new) | 5 | `MapChoiceReader` port, `MapViewSource`, `RunOwnerCheck` + `runOwnerCheckFrom` (`core.run_is_owned_by`), `debateMapViewFrom`, `RepositoryAnswerMapViewApplication` (PF-C16, PF-C19) |
| `apps/api/src/index.ts` | 5 | route `GET /v1/answers/{id}/map`, policy row, `mapViews` option |
| `apps/api/src/publications.ts` | 5 | `readPublishableMapView` (read as the publisher), snapshot `map_view` |
| `apps/api/src/main.ts` | 5 | wiring with P2b's reader (`MapChoiceRepository` from `@debateai/map`) |
| `apps/api/package.json`, `pnpm-lock.yaml`, `tools/orphan-audit/src/index.ts` | 5 | apps/api depends on `@debateai/map` (P2b cross-plan change 1) |
| `tests/unit/s7-authorization.test.ts` | 5 | policy row, route count 166 → 167, `/map` rows in the denied-owned and malformed 404 tables (PF-C14, PF-C15) |
| `tests/unit/debate-shape-map-view-api.test.ts` (new) | 5 | API tests |
| `apps/ui/lib/v3/mapView.ts` (new) | 6 | `readAnswerMapView`, `positionTitlesFrom`, `positionAiName`, `AnswerMapViewRead`, `PositionTitleNode` (PF-C23, PF-C25) |
| `apps/ui/lib/api.ts`, `apps/ui/lib/serverApi.ts` | 6 | read the map view beside the answer |
| `tests/unit/debate-shape-map-view-ui.test.ts` (new) | 6 | UI data tests |
| `apps/ui/components/AlsoRaisedList.tsx`, `apps/ui/components/PositionTitle.tsx` (new) | 7 | the section and the title; `PositionTitlesContext` lives in `PositionTitle.tsx` (PF-C25) |
| `apps/ui/components/AnswerHonestyDrawer.tsx` | 7 | the eight shape marks show only their label, no tooltip code (C-DRAWER, PF-C21) |
| `apps/ui/components/NodeDetailDrawer.tsx` | 7 | the eight shape marks: neutral tone, no tooltip code (C-TONE, PF-C22) |
| `apps/ui/messages/en/debateChrome.json` | 7 | `debateChrome.condition.mapMergeFallback` reworded; no key added (PF-C33) |
| `tests/render/debate-shape-mark-labels.test.tsx` (new) | 7 | drawer labels only, neutral pills, the reworded English value |
| `apps/ui/components/DebateCanvas.tsx`, `apps/ui/components/DebateThread.tsx` | 7 | render `<PositionTitle>` |
| `apps/ui/app/debate/[id]/DebatePageClient.tsx`, `DebatePageGate.tsx`, `page.tsx` | 7 | map view state, provider, owner section |
| `apps/ui/components/PublicDebateOverview.tsx`, `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` | 7 | public section and titles |
| `apps/ui/messages/en/public.json`, `apps/ui/lib/i18n/public.test.mjs`, `apps/ui/app/globals.css` | 7 | English keys, source list, styles (incl. `.drawerConditionPill.neutral`) |
| `tests/render/debate-shape-also-raised.test.tsx` (new) | 7 | render tests |
| `packages/contract/src/index.ts` | 8 | `shape_settings` on both room responses (Contract deviation 7) |
| `apps/api/src/index.ts` | 8 | the room read writes `shape_settings: true` only with the row in force |
| `tests/unit/debate-shape-room-flag.test.ts` (new) | 8 | contract and API tests of the room flag |
| `apps/ui/app/new/NewDebatePageClient.tsx`, `apps/ui/app/new/defaults.tsx`, `apps/ui/lib/api.ts` | 8 | real controls behind the room flag, room query, ask config, wire |
| `apps/ui/lib/scrutinyDepth.ts` (deleted), `apps/ui/lib/i18n/compose.test.mjs`, `apps/ui/lib/i18n/catalog.test.mjs` | 8 | dead code and its guards |
| `apps/ui/messages/en/newDebate.json`, `apps/ui/messages/en/compose.json`, `apps/ui/app/globals.css` | 8 | English keys (incl. P2L's six `newDebate.languageCheck.*`); retired keys; notice style |
| `tests/render/tier01-new-plan-tier.test.tsx`, `tests/render/debate-shape-new-controls.test.tsx` (new), `tests/unit/debate-shape-new-ask-wire.test.ts` (new) | 8 | tests |
| `apps/ui/lib/phoneCompletionDraft.ts`, `tests/unit/phone-completion-draft-legacy.test.ts` | 9 | draft shape, legacy upgrade, room-query choices |
| `tests/support/shipped-corpus.manifest.txt` | 4, 5, 6, 7, 8 | regenerated whenever a task adds or deletes a shipped file (PF-C1) |
| `.superpowers/sdd/2026-10-12-debate-shape-phase2c/support-article-draft.md` (local, never committed) | 8 | owner packet: the next `unsupported-capabilities` version (C-ARTICLE, PF-C31); no `packages/support-kb` file changes in P2c |
| `apps/ui/messages/<34 locales>/{newDebate,public,compose,debateChrome}.json` | 10 | translations (incl. P2L's six keys; `ro`'s six as given), removals, and the reworded `mapMergeFallback` (PF-C33) |

---

## Task 1: Story material carries "also raised, not debated"

**Files:**
- Modify: `packages/story/src/material.ts`
- Modify: `packages/story/src/index.ts`
- Modify: `packages/story/src/writer.ts` (pre-flight PF-C4)
- Test: `tests/unit/debate-shape-story-also-raised.test.ts` (new)
- Test: `tests/unit/story-writer.test.ts` (one new case, pre-flight PF-C4)

**Interfaces:**
- `StoryRunSnapshot.alsoRaised?: readonly StorySnapshotAlsoRaised[]`, where `StorySnapshotAlsoRaised = { claim: string; raisedBy: number }`. This is the INTERFACE §5 name.
- `StoryMaterial.alsoRaised?: readonly StoryMaterialAlsoRaised[]`, where `StoryMaterialAlsoRaised = { claim: string; raised_by: number }`.
- Fenced field `also_raised`, sent only when non-empty.
- `STORY_ALSO_RAISED_MAX = 12`.
- Owner ruling C-STORY (pre-flight PF-C6): `StoryRunSnapshot.answersNote?: StoryAnswersNoteKind`, where `StoryAnswersNoteKind = "MAP_UNAVAILABLE" | "ANSWERS_FILLED"`; `StoryMaterial.answersNote?: string`, the option-1 English sentence of that kind; exported constants `STORY_ANSWERS_NOTE_MAP_UNAVAILABLE` and `STORY_ANSWERS_NOTE_ANSWERS_FILLED` (one name per kind).
- Fenced field `answers_note`, sent only when present, right after `also_raised` (and so before P2L's `question_language`, which the writer appends after every core field). It is part of the debate's own material (the core): it is never dropped, and it counts toward the budget like any core field. A run without it is byte for byte today's, and its ladder never moves. (pre-flight PF-C6)
- `StoryWriter` (`writer.ts` `#compose`) passes both optional members on to the material; before this task it rebuilt the snapshot field by field and dropped any other member (pre-flight PF-C4).

Implementer note (pre-flight PF-C5): `raised_by` hands the storyteller how many AIs raised each point, which user text must never say. Only the pack sentence (Task 2) stops it from being repeated; no code check would catch "three of the AIs said…". The interface binds the field, so it stays; the owner may later rule to send the order only.

Implementer note (pre-flight PF-C5): `also_raised`, `raised_by` and `answers_note` join `STORY_ENGINE_TOKENS` for every story, so a story on a run without the shape that writes one of them is refused too. This is harmless.

Implementer note (pre-flight PF-C5): every other name this task uses is real (`STORY_SHRINK_LADDER`, `storyClip`, `storyCoreFields`, `storyFieldBytes`, `compressionStep`, `StoryMaterialCore`, `materialAt`). P2L's `question_language` is added by the writer after the core fields (`withQuestionLanguageField`), so `also_raised` and `answers_note` sit before it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debate-shape-story-also-raised.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { StoryBody, StoryVerdictBasis } from "@debateai/contract";
import {
  STORY_ALSO_RAISED_MAX,
  STORY_ANSWERS_NOTE_ANSWERS_FILLED,
  STORY_ANSWERS_NOTE_MAP_UNAVAILABLE,
  STORY_ENGINE_TOKENS,
  buildStoryMaterial,
  classifyStoryContent,
  toCheckerPromptMaterial,
  toStoryPromptMaterial,
  type StoryMaterialAlsoRaised,
  type StoryMaterialResult,
  type StoryRunSnapshot,
  type StorySnapshotAlsoRaised,
  type StorySnapshotNode
} from "@debateai/story";

/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map's points that were raised but not debated
 * reach the storyteller as `also_raised`, in whatever the story budget leaves once the debate fits.
 */

const SHAPES: ReadonlySet<string> = new Set(["general"]);
const LOW_BUDGET = 40_000;
const CORE_FIELDS = ["question", "verdict", "served_statement", "positions", "points", "hinges", "set_aside", "omitted"];
/** The claim cut of each ladder step (material.ts STORY_SHRINK_LADDER); null cuts nothing. */
const STEP_CLAIM_CHARS: readonly (number | null)[] = [null, null, null, 480, 240, 120, 120, 120];

const BASIS: StoryVerdictBasis = {
  label: "CONTESTED",
  rung: 4,
  trigger: "MID_BAND",
  winner_node_id: "position:a",
  winner_strength: 0.612345,
  runner_up_node_id: "position:b",
  runner_up_strength: 0.4,
  margin: 0.212345,
  disagreement: 0.08,
  thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
  confidence_band: "MEDIUM",
  marks: []
};

function node(overrides: Partial<StorySnapshotNode> & { readonly nodeId: string }): StorySnapshotNode {
  return {
    claim: `The claim of ${overrides.nodeId}.`,
    isPosition: false,
    wayOfKnowing: "REASONING",
    baseScore: 0.5,
    finalStrength: 0.45,
    excludedReason: null,
    authorModel: "model:alpha",
    panelDispersion: 0.1,
    criticSummary: null,
    ...overrides
  };
}

function snapshot(overrides: Partial<StoryRunSnapshot> = {}): StoryRunSnapshot {
  return {
    runId: "run:shape",
    workItemId: "work:shape",
    answerId: "answer:shape",
    answerVersion: 1,
    questionLine: "Should the city fund the tram extension?",
    argumentLanguage: { tag: "en", name: "English" },
    compositionBudgetTier: "low",
    verdictBasis: BASIS,
    servedStatement: ["The debate leans towards funding the extension."],
    nodes: [
      node({ nodeId: "position:a", isPosition: true, claim: "The city should fund it.", finalStrength: 0.612345 }),
      node({ nodeId: "position:b", isPosition: true, claim: "The city should not fund it.", finalStrength: 0.4, authorModel: "model:beta" }),
      node({ nodeId: "point:c", claim: "Fares cover running costs by year nine." }),
      node({ nodeId: "point:d", claim: "Construction overruns are common." })
    ],
    arrows: [
      { sourceNodeId: "point:c", targetNodeId: "position:a", polarity: "support" },
      { sourceNodeId: "point:d", targetNodeId: "position:a", polarity: "attack" }
    ],
    sensitivity: [{ removedNodeId: "point:c", leverage: 0.3 }, { removedNodeId: "point:d", leverage: 0.2 }],
    setAside: [],
    ...overrides
  };
}

const ALSO_RAISED: readonly StorySnapshotAlsoRaised[] = [
  { claim: "The tram would change property prices along the line.", raisedBy: 1 },
  { claim: "Bus routes could be cut once the tram runs.", raisedBy: 3 },
  { claim: "Construction would close the main bridge for a year.", raisedBy: 3 },
  { claim: "Cycle lanes are a cheaper alternative.", raisedBy: 2 }
];

type Built = Extract<StoryMaterialResult, { kind: "OK" }>;

function built(result: StoryMaterialResult): Built {
  if (result.kind !== "OK") throw new Error(`expected the material to fit, got ${result.kind}`);
  return result;
}

function build(overrides: Partial<StoryRunSnapshot>, budgetBytes = LOW_BUDGET): StoryMaterialResult {
  return buildStoryMaterial({ snapshot: snapshot(overrides), enrichment: new Map(), budgetBytes, shapeIds: SHAPES });
}

function fieldOf(result: Built, name: string): unknown {
  const found = toStoryPromptMaterial(result.material, null).find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no ${name} field`);
  return JSON.parse(found.content) as unknown;
}

function text(seed: string, length: number): string {
  const base = `${seed} argues that the proposal changes the outcome for the people it affects most, because `;
  return base.repeat(Math.ceil(length / base.length)).slice(0, length);
}

/** A well-formed story covering both positions; its long paragraphs cite nothing. */
function story(): StoryBody {
  return {
    shape_id: "general",
    short: {
      headline: "The debate leans one way.",
      summary: "Our reading of your question.",
      confidence: "Fairly sure, if the count holds.",
      paths: ["P1", "P2"].map((ref) => ({ position_ref: ref, fate: "PARTLY_HELD" as const, line: "This position partly held.", node_refs: [ref] })),
      change: { text: "A count would change it.", node_refs: [] }
    },
    why: { reasons: [{ text: "One reason decided it.", node_refs: [] }] },
    long: {
      sections: [1, 2, 3].map((index) => ({ title: `Section ${String(index)}`, paragraphs: [{ text: "A paragraph.", node_refs: [] }] }))
    },
    reviewer_note: null
  };
}

describe("debate shape P2c — also raised, not debated, in the story material", () => {
  it("keeps the material byte for byte when nothing was also raised", () => {
    const plain = built(build({}));
    const empty = built(build({ alsoRaised: [] }));
    expect(empty).toEqual(plain);
    expect("alsoRaised" in empty.material).toBe(false);
    // No answers note either (pre-flight PF-C6): a run without one keeps today's fields.
    expect("answersNote" in plain.material).toBe(false);
    expect(toStoryPromptMaterial(empty.material, null).map((entry) => entry.name)).toEqual(CORE_FIELDS);
    expect(JSON.stringify(toStoryPromptMaterial(empty.material, null)))
      .toBe(JSON.stringify(toStoryPromptMaterial(plain.material, null)));
  });

  it("sends also_raised after omitted, most-raised first, with only a claim and how many raised it", () => {
    const result = built(build({ alsoRaised: ALSO_RAISED }));
    expect(toStoryPromptMaterial(result.material, null).map((entry) => entry.name)).toEqual([...CORE_FIELDS, "also_raised"]);
    expect(fieldOf(result, "also_raised") as StoryMaterialAlsoRaised[]).toEqual([
      { claim: "Bus routes could be cut once the tram runs.", raised_by: 3 },
      { claim: "Construction would close the main bridge for a year.", raised_by: 3 },
      { claim: "Cycle lanes are a cheaper alternative.", raised_by: 2 },
      { claim: "The tram would change property prices along the line.", raised_by: 1 }
    ]);
    // The checker reads the same material.
    const checker = toCheckerPromptMaterial(result.material, story()).map((entry) => entry.name);
    expect(checker).toContain("also_raised");
    expect(checker.indexOf("also_raised")).toBeLessThan(checker.indexOf("candidate_story"));
  });

  it(`keeps at most ${String(STORY_ALSO_RAISED_MAX)} points, drops blank claims and counts a bad count as one`, () => {
    expect(STORY_ALSO_RAISED_MAX).toBe(12);
    const many = Array.from({ length: 20 }, (_, index) => ({ claim: `Point number ${String(index)}.`, raisedBy: 1 }));
    const result = built(build({ alsoRaised: [{ claim: "   ", raisedBy: 5 }, { claim: "Odd count.", raisedBy: Number.NaN }, ...many] }));
    const items = fieldOf(result, "also_raised") as StoryMaterialAlsoRaised[];
    expect(items).toHaveLength(12);
    expect(items.every((item) => item.claim.trim() !== "" && item.raised_by >= 1)).toBe(true);
    expect(items[0]).toEqual({ claim: "Odd count.", raised_by: 1 });
  });

  it("never moves the ladder: also-raised points only use the bytes the debate leaves free", () => {
    const plain = built(build({}, 10_000_000));
    expect(plain.compressionStep).toBe(0);
    // Exactly the debate's own size: no room, so no field, and still step 0.
    const tight = built(build({ alsoRaised: ALSO_RAISED }, plain.material.bytes));
    expect(tight.compressionStep).toBe(0);
    expect("alsoRaised" in tight.material).toBe(false);
    expect(tight.material.bytes).toBe(plain.material.bytes);
    // 100 spare bytes: room for the most-raised point only (71 bytes of JSON), never for the second.
    const roomy = built(build({ alsoRaised: ALSO_RAISED }, plain.material.bytes + 100));
    expect(roomy.compressionStep).toBe(0);
    expect(roomy.material.alsoRaised).toEqual([{ claim: "Bus routes could be cut once the tram runs.", raised_by: 3 }]);
    expect(roomy.material.bytes).toBeLessThanOrEqual(plain.material.bytes + 100);
  });

  it("cuts each also-raised claim to 240 characters, or to the ladder step's shorter claim cut", () => {
    const longNodes = snapshot().nodes.map((entry) => ({ ...entry, claim: text(entry.nodeId, 600) }));
    const longRaised = Array.from({ length: 12 }, (_, index) => ({ claim: text(`raised ${String(index)}`, 300), raisedBy: 1 }));
    const seenSteps = new Set<number>();
    let budget = 10_000_000;
    for (let guard = 0; guard < 400; guard += 1) {
      const result = build({ nodes: longNodes, alsoRaised: longRaised }, budget);
      if (result.kind !== "OK") break;
      seenSteps.add(result.compressionStep);
      const limit = Math.min(240, STEP_CLAIM_CHARS[result.compressionStep] ?? 240);
      for (const item of result.material.alsoRaised ?? []) {
        expect(Array.from(item.claim).length).toBeLessThanOrEqual(limit);
      }
      expect(result.material.bytes).toBeLessThanOrEqual(budget);
      budget = result.material.bytes - 1;
    }
    expect(seenSteps.has(0)).toBe(true);
    expect(seenSteps.has(5)).toBe(true);
  });

  it("refuses the field's own keys in a story, as every underscore key of the material", () => {
    expect(STORY_ENGINE_TOKENS).toContain("also_raised");
    expect(STORY_ENGINE_TOKENS).toContain("raised_by");
    const result = built(build({ alsoRaised: ALSO_RAISED }));
    const body = story();
    body.long.sections[2]!.paragraphs[0]!.text = "Two models gave it a raised_by of three.";
    const refused = classifyStoryContent(JSON.stringify(body), result.index);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain("STORY_TEXT_ENGINE_TOKEN");
  });

  it("lets a story name an also-raised point in plain words, citing nothing", () => {
    const result = built(build({ alsoRaised: ALSO_RAISED }));
    const body = story();
    body.long.sections[2]!.paragraphs.push({
      text: "Other points came up but were not debated, such as whether bus routes could be cut once the tram runs.",
      node_refs: []
    });
    expect(classifyStoryContent(JSON.stringify(body), result.index)).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("treats an also-raised claim's figures and words as the person's side, like any claim", () => {
    // The high cut is 0.7, so 0,70 is a score text, until a raised point itself states 0,70 lei.
    const body = story();
    body.short.summary = "Night power costs 0,70 lei per kWh, which matters here.";
    const without = built(build({}));
    expect(classifyStoryContent(JSON.stringify(body), without.index).parseError).toContain("STORY_TEXT_SCORE_VALUE");
    const priced = built(build({ alsoRaised: [{ claim: "Night power costs 0,70 lei per kWh at the depot.", raisedBy: 1 }] }));
    expect(classifyStoryContent(JSON.stringify(body), priced.index)).toEqual({ parseStatus: "PARSED", parseError: null });
    // A raised point that says "Open RAN" frees RAN for the story, as a claim would.
    const ran = built(build({ alsoRaised: [{ claim: "The depot could move to Open RAN radios.", raisedBy: 2 }] }));
    expect(ran.index.engineTokens.has("RAN")).toBe(false);
    expect(without.index.engineTokens.has("RAN")).toBe(true);
  });

  // Owner ruling C-STORY (pre-flight PF-C6): one plain sentence when the answers came from a fallback.
  it("sends answers_note after also_raised, as the owner's option-1 sentence, to the storyteller and the checker", () => {
    expect(STORY_ANSWERS_NOTE_MAP_UNAVAILABLE)
      .toBe("We could not first gather every possible answer, so each AI argued the answer it found best.");
    expect(STORY_ANSWERS_NOTE_ANSWERS_FILLED)
      .toBe("Some of the answers or points argued here were added to make sure enough options were tested.");
    const both = built(build({ alsoRaised: ALSO_RAISED, answersNote: "ANSWERS_FILLED" }));
    expect(toStoryPromptMaterial(both.material, null).map((entry) => entry.name))
      .toEqual([...CORE_FIELDS, "also_raised", "answers_note"]);
    expect(fieldOf(both, "answers_note")).toBe(STORY_ANSWERS_NOTE_ANSWERS_FILLED);
    const alone = built(build({ answersNote: "MAP_UNAVAILABLE" }));
    expect(toStoryPromptMaterial(alone.material, null).map((entry) => entry.name)).toEqual([...CORE_FIELDS, "answers_note"]);
    expect(fieldOf(alone, "answers_note")).toBe(STORY_ANSWERS_NOTE_MAP_UNAVAILABLE);
    // The checker reads the same material.
    const checker = toCheckerPromptMaterial(both.material, story()).map((entry) => entry.name);
    expect(checker.indexOf("answers_note")).toBe(checker.indexOf("also_raised") + 1);
    expect(checker.indexOf("answers_note")).toBeLessThan(checker.indexOf("candidate_story"));
    // The field name is code's word; the sentences hold none of the material's codes, and a story may say them.
    expect(STORY_ENGINE_TOKENS).toContain("answers_note");
    for (const sentence of [STORY_ANSWERS_NOTE_MAP_UNAVAILABLE, STORY_ANSWERS_NOTE_ANSWERS_FILLED]) {
      expect(STORY_ENGINE_TOKENS.filter((token) => sentence.includes(token))).toEqual([]);
      expect(sentence).not.toMatch(/[0-9]/u);
      const body = story();
      body.long.sections[1]!.paragraphs[0]!.text = sentence;
      expect(classifyStoryContent(JSON.stringify(body), alone.index)).toEqual({ parseStatus: "PARSED", parseError: null });
    }
  });

  it("keeps answers_note in the debate's own material: never dropped, its bytes counted, also_raised fills what is left", () => {
    const plain = built(build({}, 10_000_000));
    const noted = built(build({ answersNote: "ANSWERS_FILLED" }, 10_000_000));
    expect(noted.compressionStep).toBe(plain.compressionStep);
    expect(noted.material.bytes)
      .toBe(plain.material.bytes + Buffer.byteLength(JSON.stringify(STORY_ANSWERS_NOTE_ANSWERS_FILLED), "utf8"));
    // Exactly the noted debate's size: the note stays, the also-raised points find no room.
    const tight = built(build({ answersNote: "ANSWERS_FILLED", alsoRaised: ALSO_RAISED }, noted.material.bytes));
    expect(tight.compressionStep).toBe(0);
    expect(tight.material.answersNote).toBe(STORY_ANSWERS_NOTE_ANSWERS_FILLED);
    expect("alsoRaised" in tight.material).toBe(false);
    // The recorded size is always the sum of the fields the models read.
    const both = built(build({ alsoRaised: ALSO_RAISED, answersNote: "MAP_UNAVAILABLE" }));
    expect(both.material.bytes).toBe(toStoryPromptMaterial(both.material, null)
      .reduce((total, entry) => total + Buffer.byteLength(entry.content, "utf8"), 0));
  });
});
```

- [ ] **Step 1b: Write the writer's failing case (pre-flight PF-C4)**

`StoryWriter` rebuilds the snapshot field by field (`writer.ts` `#compose`, `const snapshot: StoryRunSnapshot = { runId: input.runId, …, setAside: input.setAside };`), so without Step 3l no real story would ever get `also_raised` or `answers_note`, while every material test passes.

In `tests/unit/story-writer.test.ts`, add `STORY_ANSWERS_NOTE_ANSWERS_FILLED,` as the first name of the `@debateai/story` import block (before `STORY_CHECKER_CONTRACT_ID,`). Then append this block at the end of the file. It uses the file's own `scripted`, `byContract`, `harness`, `providing`, `SNAPSHOT` and `readPromptFrame` (all defined or imported at the top of that file):

```ts
describe("StoryWriter — the debate shape's map fields (debate shape P2c)", () => {
  it("hands the snapshot's also-raised points and answers note to both prompts, and none without them", async () => {
    const { provider, calls } = scripted(byContract);
    const { writer, inserted } = harness(providing(provider));
    await writer.writeAfterSettle({
      ...SNAPSHOT,
      alsoRaised: [{ claim: "Ask the school about a mid-year move.", raisedBy: 2 }],
      answersNote: "ANSWERS_FILLED"
    });
    expect(inserted[0]?.outcome).toBe("READY");
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const fields = readPromptFrame(call.packet).fields;
      expect(fields.find((field) => field.name === "also_raised")?.content)
        .toBe(JSON.stringify([{ claim: "Ask the school about a mid-year move.", raised_by: 2 }]));
      expect(fields.find((field) => field.name === "answers_note")?.content)
        .toBe(JSON.stringify(STORY_ANSWERS_NOTE_ANSWERS_FILLED));
      const names = fields.map((field) => field.name);
      expect(names.indexOf("answers_note")).toBe(names.indexOf("also_raised") + 1);
    }
    const plain = scripted(byContract);
    await harness(providing(plain.provider)).writer.writeAfterSettle(SNAPSHOT);
    expect(plain.calls).toHaveLength(2);
    for (const call of plain.calls) {
      const names = readPromptFrame(call.packet).fields.map((field) => field.name);
      expect(names).not.toContain("also_raised");
      expect(names).not.toContain("answers_note");
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-story-also-raised.test.ts`
Expected: FAIL. `STORY_ALSO_RAISED_MAX` and the two `STORY_ANSWERS_NOTE_*` sentences are not exported (undefined), and the also_raised and answers_note fields are missing.
Then run: `pnpm exec vitest run tests/unit/story-writer.test.ts -t "map fields"`
Expected: FAIL on the new case only: the `also_raised` field is missing from both prompts (received `undefined`). (pre-flight PF-C4)

- [ ] **Step 3: Implement in `packages/story/src/material.ts`** (3l is in `writer.ts`)

3a. After the `StorySnapshotArrow` interface, add:

```ts
/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8): one map point that was raised but not
 * debated. `raisedBy` is how many different makers raised it. The claim is model text:
 * evidence, like every claim.
 */
export interface StorySnapshotAlsoRaised {
  readonly claim: string;
  readonly raisedBy: number;
}

/**
 * Debate shape P2c, owner ruling C-STORY: why not every answer argued was picked the usual
 * way. MAP_UNAVAILABLE: the map could not list the possible answers, so each AI argued its
 * own (today's opening). ANSWERS_FILLED: code added an answer or a point so that enough
 * options were tested. The runner reads it from the map's marks (story-snapshot.ts).
 */
export type StoryAnswersNoteKind = "MAP_UNAVAILABLE" | "ANSWERS_FILLED";
/**
 * The owner's option 1 of three phrasings for each kind (plan "Wording picks"), in plain
 * English; the storyteller says its meaning once, in the question's language.
 */
export const STORY_ANSWERS_NOTE_MAP_UNAVAILABLE =
  "We could not first gather every possible answer, so each AI argued the answer it found best.";
export const STORY_ANSWERS_NOTE_ANSWERS_FILLED =
  "Some of the answers or points argued here were added to make sure enough options were tested.";
const STORY_ANSWERS_NOTE_TEXT: Readonly<Record<StoryAnswersNoteKind, string>> = Object.freeze({
  MAP_UNAVAILABLE: STORY_ANSWERS_NOTE_MAP_UNAVAILABLE,
  ANSWERS_FILLED: STORY_ANSWERS_NOTE_ANSWERS_FILLED
});
```

(The answers-note block above is pre-flight PF-C6.)

3b. In `StoryRunSnapshot`, after `readonly setAside: …;`, add:

```ts
  /**
   * Debate shape P2c: the map's points that were raised but not debated, most-raised
   * first. Absent on every run without the new shape, whose material stays byte for byte
   * what it was.
   */
  readonly alsoRaised?: readonly StorySnapshotAlsoRaised[];
  /**
   * Debate shape P2c, owner ruling C-STORY: present only when the answers argued came
   * from a map fallback. Absent on every other run, whose material stays byte for byte.
   */
  readonly answersNote?: StoryAnswersNoteKind;
```

(`answersNote` is pre-flight PF-C6.)

3c. After the `StoryMaterialOmitted` interface, add:

```ts
/** Debate shape P2c: a raised-but-not-debated point as the models read it. It has no reference. */
export interface StoryMaterialAlsoRaised {
  readonly claim: string;
  readonly raised_by: number;
}
```

3d. In `StoryMaterial`, after `readonly omitted: readonly StoryMaterialOmitted[];`, add:

```ts
  /** Debate shape P2c: present only when at least one also-raised point fitted the budget. */
  readonly alsoRaised?: readonly StoryMaterialAlsoRaised[];
  /**
   * Debate shape P2c, owner ruling C-STORY: the sentence of the snapshot's `answersNote`.
   * Part of the debate's own material at every ladder step: never dropped, and counted
   * in `bytes` like every core field.
   */
  readonly answersNote?: string;
```

In the same interface, change the comment above `readonly bytes: number;` from `/** UTF-8 bytes of every field's content (question through omitted). */` to `/** UTF-8 bytes of every field's content (question through answers_note). */`. (pre-flight PF-C6)

3e. Replace the block from `const STORY_SET_ASIDE_KEYS` through the end of `STORY_MATERIAL_KEYS` with:

```ts
const STORY_SET_ASIDE_KEYS: StoryKeyList<StoryMaterial["setAside"][number]> = { id: true, reason: true };
const STORY_ALSO_RAISED_KEYS: StoryKeyList<StoryMaterialAlsoRaised> = { claim: true, raised_by: true };
/** The fenced field names (`storyCoreFields`, plus the second draft's `prior_objection`). */
const STORY_MATERIAL_FIELD_NAMES = Object.freeze([
  "question", "verdict", "served_statement", "positions", "points", "hinges", "set_aside", "omitted", "also_raised",
  "answers_note", "prior_objection"
]);

/** Every key and field name of the material, each once. */
export const STORY_MATERIAL_KEYS: readonly string[] = Object.freeze([...new Set([
  ...Object.keys(STORY_POINT_KEYS), ...Object.keys(STORY_POSITION_KEYS), ...Object.keys(STORY_VERDICT_KEYS),
  ...Object.keys(STORY_THRESHOLD_KEYS), ...Object.keys(STORY_OMITTED_KEYS), ...Object.keys(STORY_SET_ASIDE_KEYS),
  ...Object.keys(STORY_ALSO_RAISED_KEYS), ...STORY_MATERIAL_FIELD_NAMES
])]);
```

3f. After `const STORY_KEPT_LEVERAGE = 20;`, add:

```ts
/** Debate shape P2c: at most this many also-raised points reach the material, most-raised first. */
export const STORY_ALSO_RAISED_MAX = 12;
/** An also-raised claim is cut to this many characters, or to the ladder step's claim cut when that is shorter. */
const STORY_ALSO_RAISED_CLAIM_CHARS = 240;
```

3g. In `storyEngineTokens`, replace the `own` array with:

```ts
  const own = [
    material.question,
    ...material.positions.map((position) => position.claim),
    ...material.points.map((point) => point.claim),
    // Debate shape P2c: a raised point is the person's side of the debate, as a claim is.
    ...(material.alsoRaised ?? []).map((item) => item.claim)
  ].join("\n");
```

3h. In `storyScoreTexts`, replace the `storyStatedFigures([...])` argument with:

```ts
  const stated = storyStatedFigures([
    material.question,
    ...material.positions.map((position) => position.claim),
    ...material.points.flatMap((point) => [
      point.claim, point.best_case ?? "", point.objection ?? "", ...(point.review_reasons ?? [])
    ]),
    ...(material.alsoRaised ?? []).map((item) => item.claim)
  ]);
```

3i. Replace `storyCoreFields` with:

```ts
function storyCoreFields(core: StoryMaterialCore): FramedMaterialField[] {
  return [
    { name: "question", content: JSON.stringify(core.question) },
    { name: "verdict", content: JSON.stringify(core.verdict) },
    { name: "served_statement", content: JSON.stringify(core.servedStatement) },
    { name: "positions", content: JSON.stringify(core.positions) },
    { name: "points", content: JSON.stringify(core.points) },
    { name: "hinges", content: JSON.stringify(core.hinges) },
    { name: "set_aside", content: JSON.stringify(core.setAside) },
    { name: "omitted", content: JSON.stringify(core.omitted) },
    // Debate shape P2c: only when there is something to send, so a run without the new
    // shape keeps today's fields byte for byte.
    ...(core.alsoRaised === undefined || core.alsoRaised.length === 0
      ? []
      : [{ name: "also_raised", content: JSON.stringify(core.alsoRaised) }]),
    // Owner ruling C-STORY: only on a run whose answers came from a map fallback.
    ...(core.answersNote === undefined ? [] : [{ name: "answers_note", content: JSON.stringify(core.answersNote) }])
  ];
}
```

(`STORY_MATERIAL_FIELD_NAMES` in 3e and the `answers_note` entry here are pre-flight PF-C6; `answers_note` has an underscore, so it joins `STORY_ENGINE_TOKENS` by derivation.)

3i-bis. In `buildStoryMaterial`'s `materialAt`, in the `const core: StoryMaterialCore = { … }` literal, replace the last member `omitted: Object.freeze(omitted)` with:

```ts
      omitted: Object.freeze(omitted),
      // Owner ruling C-STORY: the answers note is the debate's own material at every ladder step, so it is never
      // dropped and its bytes count like any core field's. Absent on every other run: today's bytes.
      ...(snapshot.answersNote === undefined ? {} : { answersNote: STORY_ANSWERS_NOTE_TEXT[snapshot.answersNote] })
```

(pre-flight PF-C6: decided with the code. The note is a fixed ~100-byte sentence. Riding in the leftover budget like `also_raised` could drop it silently, which the ruling forbids; so it is core. A run without it computes exactly today's `bytes` and ladder step. A run with it may, at the very edge of its budget, fit one ladder step later than it would without the note: that cost falls only on fallback runs.)

3j. After `storyFieldBytes`, add:

```ts
/** Debate shape P2c: non-blank points, most-raised first (ties keep the map's order), at most STORY_ALSO_RAISED_MAX. */
function storyAlsoRaisedRanked(items: readonly StorySnapshotAlsoRaised[]): readonly StorySnapshotAlsoRaised[] {
  return items
    .map((item, order) => ({
      item: { claim: item.claim.trim(), raisedBy: Number.isFinite(item.raisedBy) ? Math.max(1, Math.trunc(item.raisedBy)) : 1 },
      order
    }))
    .filter(({ item }) => item.claim !== "")
    .sort((left, right) => right.item.raisedBy - left.item.raisedBy || left.order - right.order)
    .slice(0, STORY_ALSO_RAISED_MAX)
    .map(({ item }) => item);
}

/**
 * Debate shape P2c: the also-raised points ride in whatever the budget leaves once the
 * debate's own material fits. They never push the debate down the ladder. The most-raised
 * points that still fit are kept and the rest are left out; with no room at all, the field
 * is not sent.
 */
function storyWithAlsoRaised(
  material: StoryMaterial,
  ranked: readonly StorySnapshotAlsoRaised[],
  claimChars: number | null,
  budgetBytes: number
): StoryMaterial {
  if (ranked.length === 0) return material;
  const limit = claimChars === null ? STORY_ALSO_RAISED_CLAIM_CHARS : Math.min(claimChars, STORY_ALSO_RAISED_CLAIM_CHARS);
  const items = ranked.map((item): StoryMaterialAlsoRaised => Object.freeze({
    claim: storyClip(item.claim, limit),
    raised_by: item.raisedBy
  }));
  for (let count = items.length; count > 0; count -= 1) {
    const kept = Object.freeze(items.slice(0, count));
    const bytes = material.bytes + Buffer.byteLength(JSON.stringify(kept), "utf8");
    if (bytes <= budgetBytes) return Object.freeze({ ...material, alsoRaised: kept, bytes });
  }
  return material;
}
```

3k. In `buildStoryMaterial`, replace the final ladder loop (from `let lastBytes = 0;` to the closing `return Object.freeze({ kind: "TOO_LARGE", … });`) with:

```ts
  const alsoRaised = storyAlsoRaisedRanked(snapshot.alsoRaised ?? []);
  let lastBytes = 0;
  for (const [step, shrink] of STORY_SHRINK_LADDER.entries()) {
    const fitted = materialAt(shrink);
    if (fitted.material.bytes <= budgetBytes) {
      const material = storyWithAlsoRaised(fitted.material, alsoRaised, shrink.claimChars, budgetBytes);
      const visible = fitted.visible;
      return Object.freeze({
        kind: "OK",
        material,
        index: Object.freeze({
          nodeIds: new Set([...visible].map(ref)),
          positionIds: new Set(positionOrder),
          positionOrder,
          shapeIds: input.shapeIds,
          // The site shows at most this many path lines (spec §5.3); one cap, shared with the schema.
          pathCap: STORY_BODY_LIMITS.maxPaths,
          scoreTexts: storyScoreTexts(material),
          engineTokens: storyEngineTokens(material)
        }),
        refMap,
        compressionStep: step
      });
    }
    lastBytes = fitted.material.bytes;
  }
  return Object.freeze({ kind: "TOO_LARGE", bytes: lastBytes, budgetBytes });
```

3l. In `packages/story/src/writer.ts`, in `#compose`, the snapshot is rebuilt field by field and ends:

```ts
      sensitivity: input.sensitivity,
      setAside: input.setAside
    };
```

Replace those three lines with:

```ts
      sensitivity: input.sensitivity,
      setAside: input.setAside,
      // Debate shape P2c: the snapshot's optional map fields reach the material; absent on every other run, whose
      // material stays byte for byte. The spread form keeps exactOptionalPropertyTypes satisfied.
      ...(input.alsoRaised === undefined ? {} : { alsoRaised: input.alsoRaised }),
      ...(input.answersNote === undefined ? {} : { answersNote: input.answersNote })
    };
```

(pre-flight PF-C4; `answersNote` is pre-flight PF-C6.) Nothing else in `writer.ts` changes: `toStoryPromptMaterial` and `toCheckerPromptMaterial` already read every core field, and `withQuestionLanguageField` still appends `question_language` last.

- [ ] **Step 4: Export the new names from `packages/story/src/index.ts`**

In the `./material.js` export block, add `STORY_ALSO_RAISED_MAX,`, `STORY_ANSWERS_NOTE_ANSWERS_FILLED,` and `STORY_ANSWERS_NOTE_MAP_UNAVAILABLE,` (in that order) before `STORY_ENGINE_TOKENS,`. Add `type StoryAnswersNoteKind,` before `type StoryMaterial,`, `type StoryMaterialAlsoRaised,` after `type StoryMaterial,`, and `type StorySnapshotAlsoRaised,` after `type StorySnapshotArrow,`. (The answers-note names are pre-flight PF-C6; Task 3 imports `StoryAnswersNoteKind` in `apps/runner/src/story-snapshot.ts`.)

- [ ] **Step 5: Run the new tests and the existing material and writer tests**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-story-also-raised.test.ts`
Expected: PASS (10 tests).
Then run: `pnpm exec vitest run tests/unit/story-material.test.ts`
Expected: PASS, unchanged. A run without `alsoRaised` or `answersNote` is identical.
Then run: `pnpm exec vitest run tests/unit/story-writer.test.ts`
Expected: PASS, the new map-fields case included; every earlier case unchanged. (pre-flight PF-C4, PF-C43)

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add packages/story/src/material.ts packages/story/src/index.ts packages/story/src/writer.ts tests/unit/debate-shape-story-also-raised.test.ts tests/unit/story-writer.test.ts
git commit -m "$(cat <<'EOF'
Story material: also raised, not debated, and the answers note (debate shape P2c)

The map's unchosen points reach the storyteller as also_raised, most-raised
first, in the bytes the debate leaves free under the story budget; they never
move the shrink ladder. A run whose answers came from a map fallback carries
answers_note, the owner's option-1 sentence, as part of the debate's own
material. The writer now passes both on (it rebuilt the snapshot and dropped
them). A run without either is byte for byte unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The story pack explains `also_raised` and `answers_note` (owner text, new pack version)

**Files:**
- Modify: `story-shapes/common.md`
- Modify: `story-shapes/checker.md`
- Modify: `story-shapes/pack.json`
- Test: `tests/unit/story-pack.test.ts`
- Test: `tests/unit/hs-s01-seal.test.ts` (re-pinned story contract hashes, pre-flight PF-C8)

**Interfaces:** None in code. The pack fingerprint changes, and every story row records it. Bumping the `version` to a value never used before (`2026-10-14.1`) makes the change a new sealed pack version (pre-flight PF-C7). A story contract's hash covers its instruction, which IS the pack, so the story hashes pinned in `tests/unit/hs-s01-seal.test.ts` move in this same commit, as they did for the pack edit of 2026-10-12 (pre-flight PF-C8).

Implementer note (pre-flight PF-C9): `common.md` is 19,883 bytes today, not 17 KB. This task adds about 1.5 KB; the file limit is 24 KB, and the assembled instruction is about 32 of its 48 KB limit. Every edit anchor below exists today.

- [ ] **Step 1: Make the pack test require the new fields**

In `tests/unit/story-pack.test.ts`, in the test `explains to the storyteller every material field it reads and every story field it writes`, make two changes.

Add `alsoRaised` and `answersNote` to the snapshot. Replace `arrows: [], sensitivity: [], setAside: []` with:

```ts
        arrows: [], sensitivity: [], setAside: [],
        alsoRaised: [{ claim: "Ask the school about a mid-year move.", raisedBy: 2 }],
        answersNote: "MAP_UNAVAILABLE"
```

(`answersNote` is pre-flight PF-C6: the material then carries `answers_note`, and the loop below requires `common.md` to name it.)

Add `"raised_by"` to the list of names. Replace `...StoryFateSchema.options, "high_cut", "low_cut", "confidence_band"` with:

```ts
      ...StoryFateSchema.options, "high_cut", "low_cut", "confidence_band", "raised_by"
```

Then add one more test after `tells the checker every criterion its verdict carries`:

```ts
  it("tells the checker about the points raised but not debated, and the answers note (debate shape P2c)", () => {
    expect(pack.checker).toContain("also_raised");
    expect(pack.checker).toContain("raised_by");
    // Owner ruling C-STORY (pre-flight PF-C6).
    expect(pack.checker).toContain("answers_note");
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/story-pack.test.ts`
Expected: FAIL on `["also_raised", false]`, `["raised_by", false]` and `["answers_note", false]`, and on the checker test.

- [ ] **Step 3: Edit `story-shapes/common.md`**

3a. In "## What the material holds", after the line that begins `- omitted: in a very large debate,`, insert:

```markdown
- also_raised: present only when points came up that the debate did not argue: each with its claim and raised_by, how many of the AI models raised it, most-raised first. They have no reference and were never weighed or checked; see "Also raised, not debated".
- answers_note: present only when not every answer argued was picked the usual way: one plain English sentence saying why, which you say once, in your own words; see "The paths".
```

(The `answers_note` line is pre-flight PF-C6, owner ruling C-STORY. Both lines go directly before `- prior_objection: present only on a second draft; see "A second draft".`)

3a-bis. In "## The paths", after its first paragraph (the one that begins `A path is one opening position with the points for and against it.`) and before the paragraph that begins `Each path also carries a fate,`, insert this paragraph (owner ruling C-STORY, pre-flight PF-C6):

```markdown
When answers_note is present, not every answer argued here was picked the usual way, and answers_note says why in one plain English sentence. Say its meaning once, at the start of the section about the paths, before the first position: plainly, in your own words and in the language of the question. It rests on no point, so it needs no node_refs of its own. Add nothing to it about how the debate was run, and keep it out of the headline, the summary, the confidence sentence and the path lines.
```

Implementer note (pre-flight PF-C6): this is the one sentence about how the debate was run that the story may hold. It goes in the long version only, because the site's short version already discloses the fallback through the honesty drawer's mark label, and the short texts are kept for the answer itself.

3b. After the whole "## The paths" section, before "## The short version", insert the owner's option 1:

```markdown
## Also raised, not debated

When also_raised is present, end the section about the paths with one short paragraph on what else came up: name in plain words the points that matter most to the person, most-raised first, and say that the debate did not argue them, so it neither supports nor rejects them. You need not name them all. They are not findings: never present one as shown or refuted, never say who raised it or how many did, and leave node_refs empty for what rests only on them, because they have no reference. Keep them out of the headline, the summary, the confidence sentence and the path lines.
```

- [ ] **Step 4: Edit `story-shapes/checker.md`**

In the second paragraph, the one that begins `The material is described to the storyteller like this.`, append this sentence after `…which the story may mention but must not describe.`:

```markdown
 also_raised, when present, lists points that came up but were never debated, each with raised_by, how many models raised it; the story may mention them in plain words without citing a point, but never as findings, and never says who raised them or how many did. answers_note, when present, is one plain sentence on why not every answer argued was picked the usual way; the story says its meaning once, in its own words, near the start of the section about the paths, with no citation, and that one sentence is not a fault under speaks_to_the_person, though anything more about how the debate was run is.
```

Keep it on the same line, with one space before `also_raised`. (The `answers_note` sentence is pre-flight PF-C6, owner ruling C-STORY.)

- [ ] **Step 5: Bump the pack version** (pre-flight PF-C7)

The pack already reads `"version": "2026-10-12.1"` (the story wording of 2026-10-12, commit 8f1ed74f7), and story rows carry it, so the new text needs a version never used before. First list every version the pack has ever had:

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git log --all -p -- story-shapes/pack.json | command grep '"version"' | sort -u
```

Today it prints only `2026-09-26.1`, `2026-09-27.1` and `2026-10-12.1`. Then, in `story-shapes/pack.json`, change `"version": "2026-10-12.1"` to `"version": "2026-10-14.1"`. If `2026-10-14.1` was listed, use the next unused `2026-10-14.N` instead, here, in Step 6b's comment and in the commit subject.

- [ ] **Step 6: Run the pack tests**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/story-pack.test.ts`
Expected: PASS. This includes the owners' rules and the size limits (each file at most 24 KB, the assembled instruction at most 48 KB; common.md grows by about 1.5 KB from 19,883 bytes; pre-flight PF-C9).
Then run: `pnpm exec vitest run tests/unit/prompt-text-pins.test.ts`
Expected: PASS. It pins the story's code-owned answer forms, not the pack text, and builds both story contracts from the shipped pack. (pre-flight PF-C8)

- [ ] **Step 6b: Re-pin the story contract hashes in `tests/unit/hs-s01-seal.test.ts`** (pre-flight PF-C8)

The rows of that file that read the pack (`const pack = loadStoryPack(…)`) pin story contract hashes, and a pack edit moves every one of them. The comment above its `it.each` shows the precedent: the pack edit of 2026-10-12 moved these pins in the same commit.

Run: `pnpm exec vitest run tests/unit/hs-s01-seal.test.ts`
Expected: FAIL on exactly the story rows, and on no other row:
- `R7-a moves story.storyteller.v1 …` and `R7-a moves story.checker.v1 …` (each prints `R7 <name> base=… now=…`);
- `keeps the reviewed compact storyteller v2 distinct from the preserved V1 seal`;
- `seals the current storyteller v3 and the shipped checker v2, …`;
- `seals the current checker v3, distinct from the checker v2 it supersedes`.

Read the six new hashes from that output: the R7-a rows print theirs as `now=`; the other rows show theirs as the received value. Then, in `tests/unit/hs-s01-seal.test.ts`, replace every occurrence of each old full hash below with its new value. A `not.toBe` guard that names one of them moves too, so it still compares a version with the one it supersedes.

| Seal | Old value (today) |
|---|---|
| storyteller v1 (R7-a, the `after` column) | `4803cf19c70f159fe1ba38d68aebf9a5e6799be41cc1a22d952425f578160ffb` |
| checker v1 (R7-a, the `after` column) | `403a837adc5d4cc813cc21b13ce4be4961c6ff0476f9a0014d42b21e5d947172` |
| storyteller v2 | `68dd9b31344f93d1f29e2db5bb49a2c24c4d659ec7568dd381f87dfb8183321a` |
| storyteller v3 (current) | `73b2caba3018cf663b86315b22afa82cc158162f611807c171d0e1d51028e81e` |
| checker v2 | `c5d7860d12c839e14094dd5bb0fa052c6b27d5f3509289a22e320bb5f79e5530` |
| checker v3 (current) | `37df1d19fa32ad6efbace9a837ebeaf2728457c905d9941d91b8eeed82e80fd3` |

Leave the R7-a `base` column (`753f8918…`, `7096736f…`) and every row that does not read the pack exactly as they are.

Then, directly below the comment that ends `… v3 storyteller 1419737c..., v2 checker e92de07b....` (above the line `// Property: all eight sealed families move from their independently measured base`), add:

```ts
  // Debate shape P2c (2026-10-14): the owners' pack (story-shapes/common.md and checker.md, version 2026-10-14.1)
  // now explains also_raised and answers_note, so every story row below moves again, as on 2026-10-12. The answer
  // forms and contract ids are unchanged, and no register row carries a story hash. Before this edit: v1 storyteller
  // 4803cf19..., v1 checker 403a837a..., v2 storyteller 68dd9b31..., v3 storyteller 73b2caba..., v2 checker
  // c5d7860d..., v3 checker 37df1d19....
```

Run: `pnpm exec vitest run tests/unit/hs-s01-seal.test.ts`
Expected: PASS. If a row other than the five story rows is red, stop: the pack edit reached something it should not.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add story-shapes/common.md story-shapes/checker.md story-shapes/pack.json tests/unit/story-pack.test.ts tests/unit/hs-s01-seal.test.ts
git commit -m "$(cat <<'EOF'
Story pack 2026-10-14.1: also raised, not debated, and the answers note (debate shape P2c)

The storyteller is told what also_raised holds and how to mention it (plain
words, no reference, never a finding, never who or how many raised it), and to
say answers_note's meaning once, in the question's language, at the start of the
section about the paths; the checker is told neither needs a citation. Owner
wording option 1. The story contract seals in hs-s01 move with the pack, as on
2026-10-12.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The runner hands the map's also-raised points to the story

**Gate:** the P2b gate in Global Constraints. P2b's map stage must exist in `apps/runner/src/index.ts`, in the same function as the story hook (`input: buildStoryRunSnapshot({`, about line 10281 today; find it by its text). P2b declares, before root 0 and in scope at that hook:
- `let debateShapeMap: MapResult | null = null;` (about line 6748): set only when `shapeMapResult.kind === "MAP" && shapeMapResult.choice !== null`, so it is null on today's run AND on a map fallback;
- `let shapeMapResult: MapResult | null = null;` (about line 6749): the map's whole result, fallbacks and marks included (`MapResult.marks`, records `{ mark, step, detail }`); null only on today's run (no shape);
- `const shapeMapPositions = …` (about line 6878): the positions the map's choice gives, or null without a map choice. The run argues today's opening when it is null or shorter than 2 (`shapePositions`, just below it).

Check that they are there:

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
command grep -n "let debateShapeMap: MapResult | null\|let shapeMapResult: MapResult | null\|const shapeMapPositions = \|from \"@debateai/map\"" apps/runner/src/index.ts | head -6
```

All four lines must print. The `@debateai/map` import line of `apps/runner/src/index.ts` (about line 174, `import { MapChoiceRepository, type MapResult } from "@debateai/map";`) is P2b's and brings `MapResult`. P2c does not touch that line. If P2b named a variable differently after all, use P2b's name in Step 4b; nothing else changes. (Names and lines re-checked against the code; pre-flight PF-C11.)

**Files:**
- Modify: `apps/runner/src/story-snapshot.ts`
- Modify: `apps/runner/src/index.ts`
- Test: `tests/unit/debate-shape-story-snapshot.test.ts` (new)

**Interfaces:**
- `storyAlsoRaisedFrom(map: StoryMapSource | null): readonly { claim: string; raisedBy: number }[] | undefined`. It returns `undefined` when there is no map choice, so the snapshot has no `alsoRaised` key and today's material is unchanged.
- `StorySnapshotSource.alsoRaised?` is optional.
- Owner ruling C-STORY (pre-flight PF-C6): `storyAnswersNoteFrom(map: StoryMapOutcome | null, arguedTodaysOpening: boolean): StoryAnswersNoteKind | undefined`, a small exported pure function. `StoryMapOutcome = Readonly<{ kind: "MAP" | "UNAVAILABLE"; marks: readonly Readonly<{ mark: string }>[] }>` is structural, like `StoryMapSource`, so P2b's `MapResult` fits it. It reads the map's own marks (verified in `DEBATE_SHAPE_MARKS`, `@debateai/kernel`, and `MAP_MARKS`, `packages/map/src/types.ts`):
  - `MAP_UNAVAILABLE` when the map is `UNAVAILABLE` or carries `MAP_UNAVAILABLE_TODAYS_OPENING` (minted by the map's `mapUnavailable`, `packages/map/src/orchestrator.ts`), or when the run argued today's opening anyway (`arguedTodaysOpening`: the map gave fewer than 2 positions, a case no mark records);
  - otherwise `ANSWERS_FILLED` when it carries `ANSWERS_FILLED` or `CHOOSE_QUOTA_FILLED` (both minted in `packages/map/src/choose.ts`);
  - otherwise, and always without a map (today's run), `undefined`.
- `StorySnapshotSource.answersNote?: StoryAnswersNoteKind | undefined` is optional; `buildStoryRunSnapshot` passes it on only when defined.
- `STORY_OMITTED_MARKS` stays as it is: the eight shape marks still never reach the story as codes. The note carries the meaning instead, as one plain sentence.

Implementer note (pre-flight PF-C6): the "fewer than 2 positions → today's opening" case has no mark of its own, and today the code never reaches it: a `MAP` result always holds at least 2 chosen answers (`mapFinishChoice` fills to `MAP_LIMITS.chooseDistinctAnswersMin`, which is 2, marking `ANSWERS_FILLED`), and `shapePositionCount` is never below 2. The runner still passes it as `arguedTodaysOpening`, so the note stays true if that ever changes. A re-claimed run reads its stored map, marks included (`readMapResultForRun`), so the note survives a re-claim.

Implementer note (pre-flight PF-C5): also-raised claims are AI text, and the merge AI saw map key point ids such as `kp03`. `withoutNodeIds` clears only UUID-shaped ids, so such an id could reach the story; only the model checker would catch it. Low risk.

Implementer note (pre-flight PF-C5): the practice harness (`tools/preview-practice/practice-lanes.ts`, `practiceStorySnapshot`, its `buildStoryRunSnapshot({` call) never passes `alsoRaised` or `answersNote`. P2d's practice run must cover both before any upload.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debate-shape-story-snapshot.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProviderGateway } from "@debateai/providers";
import type { StoryCostFallback, StoryStepLease } from "@debateai/story";
import {
  buildStoryRunSnapshot, storyAlsoRaisedFrom, storyAnswersNoteFrom, type StorySnapshotSource
} from "../../apps/runner/src/story-snapshot.js";

/**
 * Debate shape P2c: the map's unchosen points reach the story snapshot, and so does the
 * owner's one-sentence note when the answers came from a map fallback; no map, no key.
 */

const ROOT = "11111111-1111-4111-8111-111111111111";
const provider: ProviderGateway = { call: async () => { throw new Error("unused"); } };
const stepLease: StoryStepLease = (use) => use();
const costFallback: StoryCostFallback = async ({ planned, request, call }) => ({
  result: await call(planned, request), servedBy: planned
});
const UUID_SHAPED = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

function source(overrides: Partial<StorySnapshotSource> = {}): StorySnapshotSource {
  return {
    runId: "run-1", workItemId: "work-1", answerId: "answer-1", answerVersion: 1, questionLine: "Should we?",
    argumentLanguage: { tag: "en", name: "English" }, compositionBudgetTier: "low",
    verdict: { label: "SUPPORTED", rung: 3, trigger: "AT_OR_ABOVE_HIGH_CUT" },
    servedRootNodeId: ROOT, servedStrength: 0.8, runnerUp: null,
    margin: { kind: "ABSENT", reason: "ONE_POSITION" }, disagreement: { kind: "MEASURED", value: 0.05 },
    thresholds: { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 },
    confidenceBand: "FULL", answerMarks: [], servedSegments: [{ text: "Yes." }],
    authored: [{
      nodeId: ROOT, statement: "Yes.", provenanceRef: "artifact-root", wayOfKnowing: "REASONING",
      reversalPoint: "Unless not.", maker: "maker-a", panelDispersion: 0.05
    }],
    positionNodeIds: new Set([ROOT]),
    baseStrengths: [{ nodeId: ROOT, baseStrength: 0.8 }],
    finalStrengths: [{ nodeId: ROOT, strength: 0.8 }],
    arrows: [], arrowOrder: [], sensitivity: [], conditionMarkRecords: [],
    resolveProvider: () => ({ provider, providerRef: "provider:a" }),
    stepLease,
    costFallback,
    ...overrides
  };
}

const MAP = {
  keyPoints: [
    { keyPointId: "kp01", claim: "Chosen point.", makers: ["A", "B"] },
    { keyPointId: "kp02", claim: "Raised by three makers.", makers: ["A", "B", "C"] },
    { keyPointId: "kp03", claim: `A point quoting ${ROOT} by id.`, makers: ["C", "C"] }
  ],
  choice: { alsoRaised: ["kp02", "kp03", "kp99"] }
} as const;

describe("debate shape P2c — the story snapshot's also-raised points", () => {
  it("reads the choice's also-raised ids in order, with distinct makers, skipping unknown ids", () => {
    const items = storyAlsoRaisedFrom(MAP);
    expect(items?.map((item) => item.raisedBy)).toEqual([3, 1]);
    expect(items?.[0]?.claim).toBe("Raised by three makers.");
    // Node ids never reach the material (the snapshot's own rule for free text).
    expect(items?.[1]?.claim).not.toMatch(UUID_SHAPED);
  });

  it("has nothing to say without a map or without a choice", () => {
    expect(storyAlsoRaisedFrom(null)).toBeUndefined();
    expect(storyAlsoRaisedFrom({ keyPoints: MAP.keyPoints, choice: null })).toBeUndefined();
  });

  it("passes the points to the snapshot, and leaves the key out when there are none", () => {
    expect(buildStoryRunSnapshot(source({ alsoRaised: storyAlsoRaisedFrom(MAP) })).alsoRaised)
      .toEqual([{ claim: "Raised by three makers.", raisedBy: 3 }, { claim: "A point quoting (a point) by id.", raisedBy: 1 }]);
    expect("alsoRaised" in buildStoryRunSnapshot(source())).toBe(false);
    expect("alsoRaised" in buildStoryRunSnapshot(source({ alsoRaised: undefined }))).toBe(false);
  });

  // Owner ruling C-STORY (pre-flight PF-C6).
  it("owes the story a note only when the answers argued came from a map fallback", () => {
    expect(storyAnswersNoteFrom(null, false)).toBeUndefined();
    expect(storyAnswersNoteFrom({ kind: "MAP", marks: [] }, false)).toBeUndefined();
    // The map's other fallbacks change how the map was made, not which answers were argued.
    expect(storyAnswersNoteFrom({
      kind: "MAP", marks: [{ mark: "MAP_ANGLES_FALLBACK" }, { mark: "MAP_MERGE_FALLBACK" }, { mark: "MAP_CHOOSE_FALLBACK" }]
    }, false)).toBeUndefined();
    expect(storyAnswersNoteFrom({ kind: "UNAVAILABLE", marks: [{ mark: "MAP_UNAVAILABLE_TODAYS_OPENING" }] }, true))
      .toBe("MAP_UNAVAILABLE");
    expect(storyAnswersNoteFrom({ kind: "UNAVAILABLE", marks: [] }, false)).toBe("MAP_UNAVAILABLE");
    expect(storyAnswersNoteFrom({ kind: "MAP", marks: [{ mark: "ANSWERS_FILLED" }] }, false)).toBe("ANSWERS_FILLED");
    expect(storyAnswersNoteFrom({ kind: "MAP", marks: [{ mark: "CHOOSE_QUOTA_FILLED" }, { mark: "CHOOSE_QUOTA_FILLED" }] }, false))
      .toBe("ANSWERS_FILLED");
    // Today's opening argued after all (the map gave fewer than two positions): that sentence wins.
    expect(storyAnswersNoteFrom({ kind: "MAP", marks: [{ mark: "ANSWERS_FILLED" }] }, true)).toBe("MAP_UNAVAILABLE");
  });

  it("passes the note to the snapshot, leaves the key out without one, and still hands the story no shape mark", () => {
    const noted = buildStoryRunSnapshot(source({ answersNote: "ANSWERS_FILLED", answerMarks: ["ANSWERS_FILLED"] }));
    expect(noted.answersNote).toBe("ANSWERS_FILLED");
    // STORY_OMITTED_MARKS is unchanged: the code never reaches the story, only the note's meaning does.
    expect(noted.verdictBasis.marks).toEqual([]);
    expect("answersNote" in buildStoryRunSnapshot(source())).toBe(false);
    expect("answersNote" in buildStoryRunSnapshot(source({ answersNote: undefined }))).toBe(false);
  });

  it("is wired at the runner's one story snapshot", () => {
    const runner = readFileSync("apps/runner/src/index.ts", "utf8");
    const start = runner.indexOf("input: buildStoryRunSnapshot({");
    expect(start).toBeGreaterThan(0);
    // The call's own arguments: up to the next statement the hook makes after building the snapshot.
    const call = runner.slice(start, start + 8_000);
    expect(call).toContain("positionNodeIds: makerPositionNodeIds,");
    // Pre-flight PF-C11: also_raised only when the map's own answers were argued.
    expect(call).toContain(
      "alsoRaised: storyAlsoRaisedFrom(shapeMapPositions !== null && shapeMapPositions.length >= 2 ? debateShapeMap : null),"
    );
    expect(call.indexOf("alsoRaised: storyAlsoRaisedFrom(")).toBeGreaterThan(call.indexOf("positionNodeIds: makerPositionNodeIds,"));
    // Pre-flight PF-C6: the note reads the map's whole result, never debateShapeMap (null on a fallback).
    expect(call).toContain("answersNote: storyAnswersNoteFrom(shapeMapResult,");
    expect(call).toContain("shapeRun !== null && (shapeMapPositions === null || shapeMapPositions.length < 2))");
    expect(call).not.toContain("storyAnswersNoteFrom(debateShapeMap");
    expect(call.indexOf("answersNote: storyAnswersNoteFrom(")).toBeGreaterThan(call.indexOf("alsoRaised: storyAlsoRaisedFrom("));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-story-snapshot.test.ts`
Expected: FAIL. `storyAlsoRaisedFrom` and `storyAnswersNoteFrom` are not functions.

- [ ] **Step 3: Implement in `apps/runner/src/story-snapshot.ts`**

3-imports. Change the first import line of the file from `import { DEBATE_SHAPE_MARKS, type CompositionBudgetTier, type WayOfKnowing } from "@debateai/kernel";` to:

```ts
import { DEBATE_SHAPE_MARKS, type CompositionBudgetTier, type DebateShapeMark, type WayOfKnowing } from "@debateai/kernel";
```

and, in the `@debateai/story` import block, add `type StoryAnswersNoteKind,` after `withoutStoryNodeIds,` (Task 1 exports it). (pre-flight PF-C6)

3a. In `StorySnapshotSource`, after `readonly roleMakers?: StoryRunRoleMakers | undefined;`, add:

```ts
  /**
   * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map's points that were raised but
   * not debated (`storyAlsoRaisedFrom`). Undefined when the run had no map choice, so the
   * story's material stays exactly today's.
   */
  readonly alsoRaised?: readonly { readonly claim: string; readonly raisedBy: number }[] | undefined;
  /**
   * Debate shape P2c, owner ruling C-STORY: why not every answer argued was picked the usual way
   * (`storyAnswersNoteFrom`). Undefined on today's run and on a map that chose everything itself.
   */
  readonly answersNote?: StoryAnswersNoteKind | undefined;
```

(`answersNote` is pre-flight PF-C6.)

3b. Before `export function buildStoryRunSnapshot`, add:

```ts
/** The members of P2b's `MapResult` (@debateai/map) this module reads; structural, so the runner keeps one import. */
export type StoryMapSource = Readonly<{
  keyPoints: readonly Readonly<{ keyPointId: string; claim: string; makers: readonly string[] }>[];
  choice: Readonly<{ alsoRaised: readonly string[] }> | null;
}>;

/**
 * Debate shape P2c: the map choice's "also raised, not debated" points, in the choice's
 * order (most-raised first), each with how many different makers raised it. A claim is
 * cleared of node ids like every free text here. No map, or a map that chose nothing:
 * undefined.
 */
export function storyAlsoRaisedFrom(
  map: StoryMapSource | null
): readonly { readonly claim: string; readonly raisedBy: number }[] | undefined {
  if (map === null || map.choice === null) return undefined;
  const byId = new Map(map.keyPoints.map((point) => [point.keyPointId, point] as const));
  return Object.freeze(map.choice.alsoRaised.flatMap((keyPointId) => {
    const point = byId.get(keyPointId);
    if (point === undefined) return [];
    return [Object.freeze({ claim: withoutNodeIds(point.claim), raisedBy: Math.max(1, new Set(point.makers).size) })];
  }));
}

/** The members of P2b's `MapResult` the answers note reads; structural, like `StoryMapSource`. */
export type StoryMapOutcome = Readonly<{
  kind: "MAP" | "UNAVAILABLE";
  marks: readonly Readonly<{ mark: string }>[];
}>;

/**
 * Debate shape P2c, owner ruling C-STORY: the plain sentence, if any, the story owes the person about how the answers
 * argued came about. Read from the map's whole result and its marks (the runner's `shapeMapResult`, never
 * `debateShapeMap`, which is null exactly when the map fell back). The map unavailable, or today's opening argued
 * because the map gave fewer than two positions (`arguedTodaysOpening`; no mark records that case), is MAP_UNAVAILABLE;
 * an answer or a point the code filled in is ANSWERS_FILLED. The map's other fallbacks change how the map was made, not
 * which answers were argued: no note. No map (today's run): undefined, so the story's material stays today's.
 */
export function storyAnswersNoteFrom(map: StoryMapOutcome | null, arguedTodaysOpening: boolean): StoryAnswersNoteKind | undefined {
  if (map === null) return undefined;
  const marked = (mark: DebateShapeMark): boolean => map.marks.some((record) => record.mark === mark);
  if (arguedTodaysOpening || map.kind === "UNAVAILABLE" || marked("MAP_UNAVAILABLE_TODAYS_OPENING")) return "MAP_UNAVAILABLE";
  if (marked("ANSWERS_FILLED") || marked("CHOOSE_QUOTA_FILLED")) return "ANSWERS_FILLED";
  return undefined;
}
```

(`StoryMapOutcome` and `storyAnswersNoteFrom` are pre-flight PF-C6.)

3c. In `buildStoryRunSnapshot`'s returned object, the last two lines are today (P2L added the second):

```ts
    ...(source.roleMakers === undefined ? {} : { roleMakers: source.roleMakers }),
    ...(source.languageLocked === true ? { languageLocked: true as const } : {})
```

Replace them with:

```ts
    ...(source.roleMakers === undefined ? {} : { roleMakers: source.roleMakers }),
    ...(source.alsoRaised === undefined
      ? {}
      : { alsoRaised: Object.freeze(source.alsoRaised.map((item) => Object.freeze({ claim: item.claim, raisedBy: item.raisedBy }))) }),
    ...(source.answersNote === undefined ? {} : { answersNote: source.answersNote }),
    ...(source.languageLocked === true ? { languageLocked: true as const } : {})
```

Do not change the `roleMakers` line's text: `tests/architecture/story-runner-wiring.test.ts` pins it (`expect(passThrough).toContain(…)`). (pre-flight PF-C10; the `answersNote` line is pre-flight PF-C6.)

- [ ] **Step 4: Wire it in `apps/runner/src/index.ts`**

4a. Change the `./story-snapshot.js` import (about line 220 today; find it by `from "./story-snapshot.js"`) to:

```ts
import { buildStoryRunSnapshot, storyAlsoRaisedFrom, storyAnswersNoteFrom, storyRotationRoleMakers, storySeatRoleMaker } from "./story-snapshot.js";
```

`storyAlsoRaisedFrom` and `storyAnswersNoteFrom` are P2c's own exports from `apps/runner/src/story-snapshot.ts` (Step 3b), so they join this line, not P2b's `@debateai/map` line. `story-snapshot.ts` imports nothing from `@debateai/map`: `StoryMapSource` and `StoryMapOutcome` are structural.

4b. Inside `input: buildStoryRunSnapshot({ … })` (the story hook, about line 10281 today), directly after `positionNodeIds: makerPositionNodeIds,`, add:

```ts
              // Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map's unchosen points, for the story's "also
              // raised, not debated" paragraph, only when the map's own answers were argued; undefined otherwise.
              alsoRaised: storyAlsoRaisedFrom(shapeMapPositions !== null && shapeMapPositions.length >= 2 ? debateShapeMap : null),
              // Owner ruling C-STORY: one plain sentence when the answers came from a map fallback, read from the map's
              // whole result (debateShapeMap is null on a fallback); undefined on today's run.
              answersNote: storyAnswersNoteFrom(shapeMapResult,
                shapeRun !== null && (shapeMapPositions === null || shapeMapPositions.length < 2)),
```

Here `debateShapeMap`, `shapeMapResult` and `shapeMapPositions` are P2b's in-scope names (see the gate). `debateShapeMap` is set only when `shapeMapResult.kind === "MAP" && shapeMapResult.choice !== null`, so on a map fallback it is null: also_raised is not sent, and the note comes from `shapeMapResult`'s marks instead (pre-flight PF-C6). On today's run all three are null, both members are undefined, and the snapshot has neither key: today's story, byte for byte.

Decision on pre-flight PF-C11 (the optional condition, applied): when the map gives fewer than 2 positions the run argues today's opening, yet `debateShapeMap` is still set, so the plain `storyAlsoRaisedFrom(debateShapeMap)` would send the map's leftover points beside a note that says the answers could not be gathered. The condition `shapeMapPositions !== null && shapeMapPositions.length >= 2` is the same test the run uses to pick the map's positions (`shapePositions`), so the story and the debate agree. Today the case cannot happen (see the implementer note under Interfaces), so the condition costs nothing; a re-claim that adopts the stored map keeps its also-raised list, which is correct.

- [ ] **Step 5: Run the tests**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-story-snapshot.test.ts`
Expected: PASS (6 tests).
Then run: `pnpm exec vitest run tests/unit/story-run-snapshot.test.ts`
Expected: PASS.
Then run: `pnpm exec vitest run tests/architecture/story-runner-wiring.test.ts`
Expected: PASS.
Then run: `pnpm exec vitest run tests/unit/m7-story-fallback.test.ts`
Expected: PASS. It reads `apps/runner/src/story-snapshot.ts` and the runner's story hook. (pre-flight PF-C43)

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/runner/src/story-snapshot.ts apps/runner/src/index.ts tests/unit/debate-shape-story-snapshot.test.ts
git commit -m "$(cat <<'EOF'
Runner: hand the map's also-raised points and the answers note to the story (debate shape P2c)

storyAlsoRaisedFrom reads the map choice's unchosen key points with how many
makers raised each, only when the map's own answers were argued.
storyAnswersNoteFrom reads the map's whole result: a map that was unavailable,
or whose answers or points were filled in, gives the story one plain sentence.
On today's run the snapshot has neither key.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Contract — the debate map view, its public copy, and its content check

**Files:**
- Create: `packages/contract/src/map-view.ts`
- Modify: `packages/contract/src/index.ts`
- Modify: `packages/contract/src/client.ts`
- Modify: `apps/api/src/publication-check/material.ts`
- Modify: `tests/unit/hs-s02-check.test.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt` (regenerated in Step 8b, it gains `packages/contract/src/map-view.ts`) (pre-flight PF-C1)
- Test: `tests/unit/debate-shape-map-view-contract.test.ts` (new)

Implementer note (pre-flight PF-C13): the pre-flight re-checked this task against the code. The publication-check counts are right (today 26 checked / 32 excluded; after this task 28 / 33, 61 leaves, `8 + 19*2 + 1*4`), `node_id` is excluded by the existing `_id` rule, and the `client.ts` anchors exist (about lines 53, 104, 506, 906). Line numbers elsewhere have drifted a little: find every anchor by its text, not its number.

**Interfaces:**
- `DebateMapViewSchema` with `{ positions: { node_id, answer }[] ≤ 5, also_raised: string[] ≤ 20 }`, strict.
- `DEBATE_MAP_VIEW_LIMITS = { maxPositions: 5, maxAnswerChars: 600, maxAlsoRaised: 20, maxClaimChars: 240 }`.
- `PublicDebateSchema.map_view?: DebateMapView`.
- Route `GET /v1/answers/{id}/map`.
- `ContractClient.readAnswerMapView(answerId): Promise<DebateMapView>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debate-shape-map-view-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEBATE_MAP_VIEW_LIMITS, DebateMapViewSchema, PublicDebateSchema, contractInventory, type PublicDebate
} from "@debateai/contract";
import { CHECKED_TEXT_PATHS, extractCheckedText } from "../../apps/api/src/publication-check/material.js";

/** Debate shape P2c (spec 2026-10-12 §3.3 step 8, §3.4): what the debate page reads from the map. */

const VIEW = {
  positions: [{ node_id: "n-hybrid", answer: "Move gradually, with hybrid work." }],
  also_raised: ["Ask the school about a mid-year move."]
};

const BASE = {
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Author",
  question: "Should we move to Cluj?",
  published_at: "2026-10-12T10:00:00.000Z",
  answer: {
    terminal: "SERVED", verdict: "CONTESTED", verdict_available: true, confidence_band: "CAPPED",
    summary_segments: [{ text: "Move gradually." }], badges: [], residual_objections: [],
    reversal_point: "A cheaper flat in Cluj.", as_of: "2026-10-12T09:00:00.000Z"
  }
} as const;

describe("debate shape P2c — the debate map view contract", () => {
  it("accepts the page's view and nothing more: no maker, no count, no extra key", () => {
    expect(DebateMapViewSchema.parse(VIEW)).toEqual(VIEW);
    expect(DebateMapViewSchema.safeParse({ ...VIEW, raised_by: [3] }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: [{ node_id: "n", answer: "Yes.", maker: "OpenAI" }], also_raised: []
    }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: [], also_raised: ["x".repeat(DEBATE_MAP_VIEW_LIMITS.maxClaimChars + 1)]
    }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: [], also_raised: Array.from({ length: DEBATE_MAP_VIEW_LIMITS.maxAlsoRaised + 1 }, () => "x")
    }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: Array.from({ length: DEBATE_MAP_VIEW_LIMITS.maxPositions + 1 }, (_, index) => ({ node_id: `n${String(index)}`, answer: "A." })),
      also_raised: []
    }).success).toBe(false);
  });

  it("rides a public snapshot only when present, so every older snapshot still parses", () => {
    expect(PublicDebateSchema.parse(BASE)).not.toHaveProperty("map_view");
    expect(PublicDebateSchema.parse({ ...BASE, map_view: VIEW }).map_view).toEqual(VIEW);
  });

  it("checks the map view's public text with the arguments, and never the node id", () => {
    expect(CHECKED_TEXT_PATHS).toContainEqual({ path: "map_view.positions[].answer", kind: "ARGUMENTS" });
    expect(CHECKED_TEXT_PATHS).toContainEqual({ path: "map_view.also_raised[]", kind: "ARGUMENTS" });
    const leaves = extractCheckedText(PublicDebateSchema.parse({ ...BASE, map_view: VIEW }) as PublicDebate);
    expect(leaves).toContainEqual({ kind: "ARGUMENTS", text: "Move gradually, with hybrid work." });
    expect(leaves).toContainEqual({ kind: "ARGUMENTS", text: "Ask the school about a mid-year move." });
    expect(leaves.some((leaf) => leaf.text === "n-hybrid")).toBe(false);
  });

  it("is a declared route and resource of the contract inventory", () => {
    expect(contractInventory.routes).toContain("GET /v1/answers/{id}/map");
    expect(contractInventory.resources.DebateMapViewSchema).toBe(DebateMapViewSchema);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-map-view-contract.test.ts`
Expected: FAIL. `DebateMapViewSchema` is undefined.

- [ ] **Step 3: Create `packages/contract/src/map-view.ts`**

```ts
import { z } from "zod";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8, §3.4) — what the debate page shows from the
 * map. It holds each argued answer's statement, keyed by the opening position (root node) that
 * argued it, and the points that were raised but not debated. It carries only text the page
 * shows and node ids the answer already carries: never a maker, a count, a mark or a map id.
 * It imports only zod (never ./index.js), for the same module-cycle reason disclosure.ts does.
 * The same shape rides a public snapshot (`PublicDebateSchema.map_view`).
 */
export const DEBATE_MAP_VIEW_LIMITS = Object.freeze({
  maxPositions: 5,
  maxAnswerChars: 600,
  maxAlsoRaised: 20,
  maxClaimChars: 240
});

export const DebateMapViewSchema = z.object({
  positions: z.array(z.object({
    node_id: z.string().trim().min(1),
    answer: z.string().trim().min(1).max(DEBATE_MAP_VIEW_LIMITS.maxAnswerChars)
  }).strict()).max(DEBATE_MAP_VIEW_LIMITS.maxPositions),
  also_raised: z.array(z.string().trim().min(1).max(DEBATE_MAP_VIEW_LIMITS.maxClaimChars))
    .max(DEBATE_MAP_VIEW_LIMITS.maxAlsoRaised)
}).strict();
export type DebateMapView = z.infer<typeof DebateMapViewSchema>;
```

- [ ] **Step 4: Wire it into `packages/contract/src/index.ts`**

4a. After the line `import { AnswerDisclosureSchema, AnswerFloorSchema } from "./disclosure.js"; export * from "./disclosure.js";` (about line 19), add:

```ts
import { DebateMapViewSchema } from "./map-view.js"; export * from "./map-view.js";
```

4b. In `PublicDebateSchema`, replace

```ts
  floor: AnswerFloorSchema.optional()
}).strict();
export type PublicDebate = z.infer<typeof PublicDebateSchema>;
```

with

```ts
  floor: AnswerFloorSchema.optional(),
  // Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map view copied at publish time,
  // so the public page can list what was raised but not debated and title each position.
  // Optional: every snapshot published before it still parses.
  map_view: DebateMapViewSchema.optional()
}).strict();
export type PublicDebate = z.infer<typeof PublicDebateSchema>;
```

4c. In `contractInventory.routes`, after `"GET /v1/answers/{id}/disclosure",`, add `"GET /v1/answers/{id}/map",`.

4d. In `contractInventory.resources`, change `AnswerStorySchema, AnswerDisclosureSchema, BillingPlansResponseSchema,` to `AnswerStorySchema, AnswerDisclosureSchema, DebateMapViewSchema, BillingPlansResponseSchema,`.

- [ ] **Step 5: Add the client method in `packages/contract/src/client.ts`**

5a. In the big `from "./index.js"` import block (lines 12–132), add `DebateMapViewSchema,` after `AnswerDisclosureSchema,` (line ~52), and `type DebateMapView,` after `type AnswerDisclosure,` (line ~98).

5b. In the `ContractClient` interface, after `readAnswerDisclosure(answerId: string): Promise<AnswerDisclosure>;`, add:

```ts
  /** Debate shape P2c: the owner's map view of an answer (404 when the run had no map choice). */
  readAnswerMapView(answerId: string): Promise<DebateMapView>;
```

5c. In the client object, after the `readAnswerDisclosure: …` line, add:

```ts
    readAnswerMapView: (answerId: string) => request(`/v1/answers/${encodeURIComponent(answerId)}/map`, DebateMapViewSchema),
```

- [ ] **Step 6: Check the new public text in `apps/api/src/publication-check/material.ts`**

Replace

```ts
    .map(path => ({ path: `answer.nodes[].${path}`, kind: "ARGUMENTS" as const })),
  { path: "answer.nodes[].review.reasons[]", kind: "REVIEWS" },
```

with

```ts
    .map(path => ({ path: `answer.nodes[].${path}`, kind: "ARGUMENTS" as const })),
  // Debate shape P2c: the map view's answers and also-raised claims are model text the
  // public page shows, judged with the arguments (kept beside them, so one call per kind holds).
  { path: "map_view.positions[].answer", kind: "ARGUMENTS" },
  { path: "map_view.also_raised[]", kind: "ARGUMENTS" },
  { path: "answer.nodes[].review.reasons[]", kind: "REVIEWS" },
```

`map_view.positions[].node_id` is excluded by the existing `_id` suffix rule.

- [ ] **Step 7: Update the pinned table in `tests/unit/hs-s02-check.test.ts`**

7a. In `const paths = [...]`, replace

```ts
    .map(p => [`answer.nodes[].${p}`, "ARGUMENTS"]),
  ["answer.nodes[].review.reasons[]", "REVIEWS"],
```

with

```ts
    .map(p => [`answer.nodes[].${p}`, "ARGUMENTS"]),
  // Debate shape P2c: the map view's public text, judged with the arguments.
  ["map_view.positions[].answer", "ARGUMENTS"], ["map_view.also_raised[]", "ARGUMENTS"],
  ["answer.nodes[].review.reasons[]", "REVIEWS"],
```

7b. In `snapshot()`, add `"map_view.positions[].node_id"` to the list of `EXCLUDED-` paths, after `"story_short.paths[].position_ref"`.

7c. In the R2 test, replace

```ts
  it("covers the schema with 26 checked paths and 32 excluded strings", async () => {
```

with

```ts
  // Debate shape P2c: map_view adds 3 string leaves — positions[].answer and also_raised[] checked,
  // positions[].node_id excluded: 58 → 61, 32 → 33, 26 → 28 checked paths.
  it("covers the schema with 28 checked paths and 33 excluded strings", async () => {
```

In the same test, change `expect(leaves).toHaveLength(58);` to `expect(leaves).toHaveLength(61);` and `.toHaveLength(32);` to `.toHaveLength(33);`.

7d. In `copies every marked leaf in path order…`, replace

```ts
    // 26 paths: 8 without an array, 17 with one array (2 members each), 1 with two nested arrays (4 members).
    expect(expected).toHaveLength(8 + 17 * 2 + 1 * 4);
```

with

```ts
    // 28 paths: 8 without an array, 19 with one array (2 members each), 1 with two nested arrays (4 members).
    expect(expected).toHaveLength(8 + 19 * 2 + 1 * 4);
```

- [ ] **Step 8: Regenerate the contract and run the tests**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm run generate:contract`
Expected: it exits 0 and rewrites the git-ignored `packages/contract/generated/*`.
Then run, one at a time:
- `pnpm exec vitest run tests/unit/debate-shape-map-view-contract.test.ts` → PASS (4).
- `pnpm exec vitest run tests/unit/hs-s02-check.test.ts` → PASS.

Expected red, on purpose: `tests/unit/s7-authorization.test.ts` is red from this task until Task 5 Step 7. The contract inventory now holds `GET /v1/answers/{id}/map`, but the API mounts no such route yet ("governs the entire canonical inventory": `api.hasRoute` is false, and the pinned route count is still 166). Do not run it as a gate here, and do not push between this task and Task 5. (pre-flight PF-C12)

8b. Update the shipped-file list, because this task adds the shipped file `packages/contract/src/map-view.ts` (pre-flight PF-C1). Run, one at a time:
- `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`
- `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` (again, without the variable) → PASS.

Then `git diff tests/support/shipped-corpus.manifest.txt` must show exactly one added line, `packages/contract/src/map-view.ts`, and nothing removed.

- [ ] **Step 9: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add packages/contract/src/map-view.ts packages/contract/src/index.ts packages/contract/src/client.ts \
  apps/api/src/publication-check/material.ts tests/unit/hs-s02-check.test.ts tests/unit/debate-shape-map-view-contract.test.ts \
  tests/support/shipped-corpus.manifest.txt
git commit -m "$(cat <<'EOF'
Contract: the debate map view and its public copy (debate shape P2c)

DebateMapViewSchema (answers keyed by their opening position, and the points
raised but not debated; no maker, no count), the owner route
GET /v1/answers/{id}/map, readAnswerMapView, and an optional map_view on the
public snapshot whose text the publication check judges with the arguments.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: API — the owner's map view route and the published copy

**Files:**
- Create: `apps/api/src/map-views.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/publications.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/package.json` (`"@debateai/map": "workspace:*"`), `pnpm-lock.yaml` (its apps/api importer, written by `pnpm install --offline`)
- Modify: `tools/orphan-audit/src/index.ts` (the `apps/api` row gains `"map"`)
- Modify: `tests/unit/s7-authorization.test.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt` (regenerated in Step 8b, it gains `apps/api/src/map-views.ts`) (pre-flight PF-C1)
- Test: `tests/unit/debate-shape-map-view-api.test.ts` (new)

**Interfaces:**
- `MapChoiceReader { readMapChoiceForRun(runId): Promise<MapViewSource | null> }`, where P2c's `MapViewSource = { answers: { statement, rootNodeId | null }[]; alsoRaised: { claim, makers[] }[] }`. It is named `MapViewSource`, not `MapChoiceRecord`, so it never clashes with `@debateai/map`'s own `MapChoiceRecord` (pre-flight PF-C19). P2b's `MapChoiceRepository` from `@debateai/map` (`packages/map/src/repository.ts`, P2b Task 8) satisfies this structurally: its `MapChoiceRecord` also carries `opening`, `answers[].answerId|rootIndex|maker|filled`, `alsoRaised[].keyPointId` and `marks`, which this module never reads. See Contract deviation 4.
- `RunOwnerCheck { owns(runId, ownership: RunOwnershipAccess): Promise<boolean> }` and `runOwnerCheckFrom(query)`, which asks `SELECT core.run_is_owned_by($1,$2,$3) AS owned` with `[runId, ownership.ownerRef, ownership.legacyAskerId]` (the SQL function is `core.run_is_owned_by(p_run_id uuid, p_owner_ref uuid, p_legacy_asker_id text)`, migration 0037, EXECUTE granted to `debateai_runtime`). `RunOwnershipAccess` is `{ ownerRef: string | null; legacyAskerId: string | null }` from `@debateai/db`. (pre-flight PF-C16)
- `debateMapViewFrom(source, nodeIds): DebateMapView`.
- `MapViewReadInput = { runId; nodeIds; ownership: RunOwnershipAccess }`; `AnswerMapViewApplication.readMapView(input: MapViewReadInput): Promise<DebateMapView | null>`. (pre-flight PF-C16)
- `RepositoryAnswerMapViewApplication(reader, owner)`: it normalizes the ownership (`normalizeRunOwnership`, as `StoryRepository.readForAnswer` does), asks `owner.owns(runId, ownership)`, and returns null BEFORE `readMapChoiceForRun` when the caller does not own the run. This is the second owner check the P2b ledger asked for: the route's answer read is the first. (pre-flight PF-C16)
- `NO_MAP_VIEWS`.
- `buildApi({ mapViews })`.
- `readPublishableMapView(mapViews, { runId, answer, authenticated, source })`: it passes the publisher's ownership `{ ownerRef: authenticated.ownerRef, legacyAskerId: null }`, so the published copy goes through the same owner check (the story and floor readers of the publish path are owner-scoped the same way, by `authenticated.ownerRef`). (pre-flight PF-C16)
- `PostgresPublicationApplication` gets a 6th constructor argument, `mapViews`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debate-shape-map-view-api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { DEBATE_MAP_VIEW_LIMITS, DebateMapViewSchema, type Answer, type DebateMapView } from "@debateai/contract";
import type { RunOwnershipAccess } from "@debateai/db";
import {
  NO_MAP_VIEWS, RepositoryAnswerMapViewApplication, debateMapViewFrom, runOwnerCheckFrom,
  type AnswerMapViewApplication, type MapViewReadInput, type MapViewSource, type RunOwnerCheck
} from "../../apps/api/src/map-views.js";
import { readPublishableMapView } from "../../apps/api/src/publications.js";
import {
  TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders
} from "../support/httpSession.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { STORY_TEST_ANSWER_ID, STORY_TEST_RUN_ID } from "../support/storyApiFixtures.js";

/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8, §3.4): the owner's read of the map view,
 * GET /v1/answers/{id}/map, and the copy a publication takes. As with the disclosure route,
 * the answer read is the first ownership check, and "not yours", "no map" and "malformed" are
 * one closed 404. The application checks again (core.run_is_owned_by) before it reads the map.
 */

const OWNER = testHttpIdentity("map-view-owner");
const HEADERS = testSessionHeaders(OWNER);
const URL_OF = `/v1/answers/${STORY_TEST_ANSWER_ID}/map`;
/** What the route and the publication pass for this signed-in caller (pre-flight PF-C16). */
const OWNERSHIP: RunOwnershipAccess = Object.freeze({ ownerRef: OWNER.authenticated.ownerRef, legacyAskerId: null });
/** An owner check that always says yes, for the tests about the view's content. */
const OWNED: RunOwnerCheck = Object.freeze({ owns: async () => true });

function answerOf(): Answer {
  return buildFairShapedAnswer({ answer_id: STORY_TEST_ANSWER_ID, run_ref: STORY_TEST_RUN_ID, relevant_as_of: "2026-10-12T10:00:00.000Z" });
}

function application(answer: Answer | null, reads: unknown[] = []): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async (answerId, _session, version, ownership) => {
      reads.push({ answerId, version, ownership });
      return answer;
    },
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

function views(view: DebateMapView | null, calls: MapViewReadInput[] = []): AnswerMapViewApplication {
  return {
    readMapView: async (input) => {
      calls.push(input);
      return view;
    }
  };
}

function api(input: { answer: Answer | null; mapViews?: AnswerMapViewApplication; reads?: unknown[] }) {
  return buildApi({
    application: application(input.answer, input.reads),
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN,
    ...(input.mapViews === undefined ? {} : { mapViews: input.mapViews })
  });
}

afterEach(() => vi.restoreAllMocks());

describe("debate shape P2c — the map view from P2b's map choice", () => {
  const answer = answerOf();
  const nodeIds = new Set(answer.nodes.map((node) => node.node_id));
  const [first, second] = answer.nodes.map((node) => node.node_id);

  it("drops positions whose root node is not in the answer, has none, or repeats one", () => {
    const record: MapViewSource = {
      answers: [
        { statement: "  Move gradually.  ", rootNodeId: first! },
        { statement: "Stay where you are.", rootNodeId: "node:not-published" },
        { statement: "A second answer on the same node.", rootNodeId: first! },
        { statement: "No position argued this.", rootNodeId: null },
        { statement: "Move now.", rootNodeId: second! }
      ],
      alsoRaised: []
    };
    expect(debateMapViewFrom(record, nodeIds).positions).toEqual([
      { node_id: first, answer: "Move gradually." },
      { node_id: second, answer: "Move now." }
    ]);
  });

  it("lists the also-raised claims most-raised first, without who or how many", () => {
    const view = debateMapViewFrom({
      answers: [{ statement: "Move gradually.", rootNodeId: first! }],
      alsoRaised: [
        { claim: "Raised once.", makers: ["OpenAI"] },
        { claim: "Raised by three.", makers: ["OpenAI", "Anthropic", "xAI", "xAI"] },
        { claim: "   ", makers: ["OpenAI"] }
      ]
    }, nodeIds);
    expect(view.also_raised).toEqual(["Raised by three.", "Raised once."]);
    const text = JSON.stringify(view);
    for (const forbidden of ["OpenAI", "Anthropic", "makers", "raised_by"]) expect(text).not.toContain(forbidden);
  });

  it("cuts long text to the contract's limits, never splitting a character", () => {
    const view = debateMapViewFrom({
      answers: [{ statement: "a".repeat(700), rootNodeId: first! }],
      alsoRaised: [{ claim: "b".repeat(300), makers: ["A"] }, { claim: "😀".repeat(200), makers: ["A"] }]
    }, nodeIds);
    expect(DebateMapViewSchema.parse(view)).toEqual(view);
    expect(view.positions[0]!.answer.length).toBeLessThanOrEqual(DEBATE_MAP_VIEW_LIMITS.maxAnswerChars);
    expect(view.positions[0]!.answer.endsWith("…")).toBe(true);
    for (const claim of view.also_raised) {
      expect(claim.length).toBeLessThanOrEqual(DEBATE_MAP_VIEW_LIMITS.maxClaimChars);
      expect(claim).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    }
  });

  it("reads no view when the run has no map choice, or the choice named no answer", async () => {
    const reader = (record: MapViewSource | null) => new RepositoryAnswerMapViewApplication({ readMapChoiceForRun: async () => record }, OWNED);
    const input: MapViewReadInput = { runId: STORY_TEST_RUN_ID, nodeIds, ownership: OWNERSHIP };
    expect(await reader(null).readMapView(input)).toBeNull();
    expect(await reader({ answers: [], alsoRaised: [{ claim: "Orphan.", makers: ["A"] }] }).readMapView(input)).toBeNull();
    expect(await NO_MAP_VIEWS.readMapView(input)).toBeNull();
  });

  // Pre-flight PF-C16: the second owner check. A caller who does not own the run gets no view,
  // and the map is never read for them.
  it("checks the caller owns the run before it reads the map, and reads nothing otherwise", async () => {
    const record: MapViewSource = { answers: [{ statement: "Move gradually.", rootNodeId: first! }], alsoRaised: [] };
    const mapReads: string[] = [];
    const ownerChecks: { runId: string; ownership: RunOwnershipAccess }[] = [];
    const reader = {
      readMapChoiceForRun: async (runId: string) => {
        mapReads.push(runId);
        return record;
      }
    };
    const owner = (owned: boolean): RunOwnerCheck => ({
      owns: async (runId, ownership) => {
        ownerChecks.push({ runId, ownership });
        return owned;
      }
    });
    const input: MapViewReadInput = { runId: STORY_TEST_RUN_ID, nodeIds, ownership: OWNERSHIP };

    // Not the caller's run: null, and the map is not read.
    expect(await new RepositoryAnswerMapViewApplication(reader, owner(false)).readMapView(input)).toBeNull();
    expect(ownerChecks).toEqual([{ runId: STORY_TEST_RUN_ID, ownership: OWNERSHIP }]);
    expect(mapReads).toEqual([]);

    // An ownership naming nobody is refused before any query: no owner check, no map read.
    expect(await new RepositoryAnswerMapViewApplication(reader, owner(true))
      .readMapView({ ...input, ownership: { ownerRef: null, legacyAskerId: null } })).toBeNull();
    expect(ownerChecks).toHaveLength(1);
    expect(mapReads).toEqual([]);

    // The caller's run: checked, then read once.
    expect(await new RepositoryAnswerMapViewApplication(reader, owner(true)).readMapView(input))
      .toEqual({ positions: [{ node_id: first, answer: "Move gradually." }], also_raised: [] });
    expect(ownerChecks).toHaveLength(2);
    expect(mapReads).toEqual([STORY_TEST_RUN_ID]);
  });

  it("asks core.run_is_owned_by, and only a true answer owns the run", async () => {
    const queries: { text: string; values: unknown[] }[] = [];
    const check = (rows: readonly Readonly<{ owned?: unknown }>[]) => runOwnerCheckFrom(async (text, values) => {
      queries.push({ text, values });
      return { rows };
    });
    expect(await check([{ owned: true }]).owns(STORY_TEST_RUN_ID, OWNERSHIP)).toBe(true);
    expect(queries).toEqual([{
      text: "SELECT core.run_is_owned_by($1,$2,$3) AS owned",
      values: [STORY_TEST_RUN_ID, OWNERSHIP.ownerRef, OWNERSHIP.legacyAskerId]
    }]);
    expect(await check([{ owned: false }]).owns(STORY_TEST_RUN_ID, OWNERSHIP)).toBe(false);
    expect(await check([]).owns(STORY_TEST_RUN_ID, OWNERSHIP)).toBe(false);
    expect(await check([{ owned: "true" }]).owns(STORY_TEST_RUN_ID, OWNERSHIP)).toBe(false);
  });
});

describe("debate shape P2c — GET /v1/answers/{id}/map", () => {
  const view: DebateMapView = { positions: [], also_raised: ["Ask the school."] };

  it("needs a session", async () => {
    const reads: unknown[] = [];
    const server = api({ answer: answerOf(), mapViews: views(view), reads });
    const response = await server.inject({ method: "GET", url: URL_OF });
    expect(response.statusCode).toBe(401);
    expect(reads).toEqual([]);
    await server.close();
  });

  // Pre-flight PF-C15: every gate case records the reader's calls and proves the map was never read.
  it("answers the closed 404 without reading the map, for no reader, a malformed id, and an answer that is not the caller's", async () => {
    const cases: { answer: Answer | null; composed: boolean; url: string }[] = [
      { answer: answerOf(), composed: false, url: URL_OF },
      { answer: answerOf(), composed: true, url: "/v1/answers/not-a-uuid/map" },
      { answer: null, composed: true, url: URL_OF }
    ];
    for (const item of cases) {
      const calls: MapViewReadInput[] = [];
      const server = api(item.composed
        ? { answer: item.answer, mapViews: views(view, calls) }
        : { answer: item.answer });
      const response = await server.inject({ method: "GET", url: item.url, headers: HEADERS });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "MAP_VIEW_NOT_FOUND" });
      expect(calls).toEqual([]);
      await server.close();
    }
  });

  it("answers the same closed 404 when the run has no map view", async () => {
    const calls: MapViewReadInput[] = [];
    const server = api({ answer: answerOf(), mapViews: views(null, calls) });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "MAP_VIEW_NOT_FOUND" });
    expect(calls).toHaveLength(1);
    await server.close();
  });

  it("reads the view of the answer's own run, against the answer's own nodes, as the caller", async () => {
    const calls: MapViewReadInput[] = [];
    const answer = answerOf();
    const server = api({ answer, mapViews: views(view, calls) });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(view);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.runId).toBe(STORY_TEST_RUN_ID);
    expect([...calls[0]!.nodeIds].sort()).toEqual(answer.nodes.map((node) => node.node_id).sort());
    expect(calls[0]!.ownership).toEqual(OWNERSHIP);
    await server.close();
  });
});

describe("debate shape P2c — the published copy", () => {
  const input = {
    runId: STORY_TEST_RUN_ID, answer: answerOf(), authenticated: OWNER.authenticated, source: { requestId: "req-map" } as never
  };

  it("copies the owner's view, read as the publisher, and never blocks publishing when the read fails", async () => {
    const view: DebateMapView = { positions: [], also_raised: ["Ask the school."] };
    const calls: MapViewReadInput[] = [];
    expect(await readPublishableMapView(views(view, calls), input)).toEqual(view);
    expect(calls.map((call) => call.ownership)).toEqual([OWNERSHIP]);
    expect(await readPublishableMapView(NO_MAP_VIEWS, input)).toBeNull();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing: AnswerMapViewApplication = { readMapView: async () => { throw new Error("database unreachable"); } };
    expect(await readPublishableMapView(failing, input)).toBeNull();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]![0])).toContain("api.publication.map_view_not_published");
    expect(String(logged.mock.calls[0]![0])).not.toContain("database unreachable");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-map-view-api.test.ts`
Expected: FAIL. `../../apps/api/src/map-views.js` cannot be resolved.

- [ ] **Step 3: Create `apps/api/src/map-views.ts`**

```ts
import { DEBATE_MAP_VIEW_LIMITS, DebateMapViewSchema, type DebateMapView } from "@debateai/contract";
import { normalizeRunOwnership, type RunOwnershipAccess } from "@debateai/db";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8, §3.4) — the debate page's view of the map:
 * - each argued answer's statement, keyed by the opening position that argued it;
 * - the points that were raised but not debated.
 *
 * The row is P2b's (`core.map_choice`, read by `readMapChoiceForRun`, decrypted like other
 * debate text). This module only turns it into the contract's words. Nothing that names a
 * maker, a count, a mark or a map id leaves here.
 *
 * P2b's map reader takes a bare run id and checks no owner. So the read here asks
 * `core.run_is_owned_by` first and reads nothing for a caller who does not own the run: a
 * second gate behind the route's owner-scoped answer read (pre-flight PF-C16).
 */

/**
 * The members of P2b's map choice row this module reads (Contract deviation 4). Named
 * `MapViewSource`, not `MapChoiceRecord`, so it never clashes with `@debateai/map`'s own type.
 */
export interface MapViewSource {
  readonly answers: readonly Readonly<{ statement: string; rootNodeId: string | null }>[];
  readonly alsoRaised: readonly Readonly<{ claim: string; makers: readonly string[] }>[];
}

export interface MapChoiceReader {
  readMapChoiceForRun(runId: string): Promise<MapViewSource | null>;
}

/** Does this caller own this run? The same predicate every owner read uses. */
export interface RunOwnerCheck {
  owns(runId: string, ownership: RunOwnershipAccess): Promise<boolean>;
}

/** One query on the runtime pool; main.ts passes `pool.query`. */
export type RunOwnerQuery = (
  text: string,
  values: unknown[]
) => Promise<Readonly<{ rows: readonly Readonly<{ owned?: unknown }>[] }>>;

const RUN_OWNED_SQL = "SELECT core.run_is_owned_by($1,$2,$3) AS owned";

/**
 * `core.run_is_owned_by(p_run_id uuid, p_owner_ref uuid, p_legacy_asker_id text)` (migration
 * 0037, EXECUTE granted to debateai_runtime). Only a true answer owns: no row, null or any
 * other value is "not yours".
 */
export function runOwnerCheckFrom(query: RunOwnerQuery): RunOwnerCheck {
  return Object.freeze({
    owns: async (runId: string, ownership: RunOwnershipAccess): Promise<boolean> => {
      const result = await query(RUN_OWNED_SQL, [runId, ownership.ownerRef, ownership.legacyAskerId]);
      return result.rows[0]?.owned === true;
    }
  });
}

/** Trimmed, and cut to `limit` UTF-16 units with an ellipsis, never splitting a character. */
function clip(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  let kept = "";
  for (const character of trimmed) {
    if (kept.length + character.length > limit - 1) break;
    kept += character;
  }
  return `${kept}…`;
}

/**
 * The view, against the answer's own nodes. A position whose opening node the answer does not
 * hold is dropped, so a title never points at a node the page cannot show. So is one with no
 * node, or a second answer on the same node. Also-raised claims come most-raised first, ties
 * in the map's order, and only the claims travel.
 * After a re-claim, P2b keeps the first pass's `root_node_id` (`core.map_position` is written
 * with ON CONFLICT DO NOTHING). If that node is not in the answer the position is dropped
 * here: its title just does not show (pre-flight PF-C19).
 */
export function debateMapViewFrom(record: MapViewSource, nodeIds: ReadonlySet<string>): DebateMapView {
  const seen = new Set<string>();
  const positions = record.answers.flatMap((answer) => {
    const nodeId = answer.rootNodeId;
    if (nodeId === null || !nodeIds.has(nodeId) || seen.has(nodeId) || answer.statement.trim() === "") return [];
    seen.add(nodeId);
    return [{ node_id: nodeId, answer: clip(answer.statement, DEBATE_MAP_VIEW_LIMITS.maxAnswerChars) }];
  }).slice(0, DEBATE_MAP_VIEW_LIMITS.maxPositions);
  const alsoRaised = record.alsoRaised
    .map((item, order) => ({ claim: item.claim.trim(), raisedBy: new Set(item.makers).size, order }))
    .filter((item) => item.claim !== "")
    .sort((left, right) => right.raisedBy - left.raisedBy || left.order - right.order)
    .slice(0, DEBATE_MAP_VIEW_LIMITS.maxAlsoRaised)
    .map((item) => clip(item.claim, DEBATE_MAP_VIEW_LIMITS.maxClaimChars));
  return DebateMapViewSchema.parse({ positions, also_raised: alsoRaised });
}

/** Whose run, against which nodes, read as whom (pre-flight PF-C16). */
export type MapViewReadInput = Readonly<{
  runId: string;
  nodeIds: ReadonlySet<string>;
  ownership: RunOwnershipAccess;
}>;

export interface AnswerMapViewApplication {
  readMapView(input: MapViewReadInput): Promise<DebateMapView | null>;
}

/**
 * A run with no map choice has no view. That covers a run without the new shape, and a map that
 * fell back to today's opening and chose no answer. The page then shows exactly what it shows today.
 * A caller who does not own the run has no view either, and the map is not read for them. An
 * ownership naming nobody (or both principals) is refused before any query, as
 * `StoryRepository.readForAnswer` refuses it.
 */
export class RepositoryAnswerMapViewApplication implements AnswerMapViewApplication {
  constructor(
    private readonly reader: MapChoiceReader,
    private readonly owner: RunOwnerCheck
  ) {}

  async readMapView(input: MapViewReadInput): Promise<DebateMapView | null> {
    let ownership: RunOwnershipAccess;
    try {
      ownership = normalizeRunOwnership({
        ownerRef: input.ownership.ownerRef,
        legacyAskerId: input.ownership.legacyAskerId
      });
    } catch {
      return null;
    }
    if (!await this.owner.owns(input.runId, ownership)) return null;
    const record = await this.reader.readMapChoiceForRun(input.runId);
    if (record === null || record.answers.length === 0) return null;
    return debateMapViewFrom(record, input.nodeIds);
  }
}

/** No reader composed (local tools, older deployments): never a view. */
export const NO_MAP_VIEWS: AnswerMapViewApplication = Object.freeze({
  readMapView: async () => null
});
```

Implementer note (pre-flight PF-C19): after a re-claim, P2b keeps the first pass's `root_node_id` in `core.map_position` (written with ON CONFLICT DO NOTHING). `debateMapViewFrom` drops a position whose node the answer does not hold, so a stale node only hides that position's title; the doc comment above says so. Nothing else to do.

Implementer note (pre-flight PF-C19): the local record type is `MapViewSource` (it was `MapChoiceRecord` in an earlier draft), so it never shadows `@debateai/map`'s `MapChoiceRecord`. Use `MapViewSource` everywhere in this task.

- [ ] **Step 4: Add the route in `apps/api/src/index.ts`**

4a. In the `@debateai/contract` import block of `apps/api/src/index.ts` (about lines 24–101), add `DebateMapViewSchema,` after `DataExportDownloadRequestSchema,` (about line 31). This file does not import `AnswerDisclosureSchema` (only `owner-read.ts` does), so do not look for it here. (pre-flight PF-C17)

4b. After `import type { AnswerDisclosureApplication } from "./disclosures.js";` (about line 255), add:

```ts
import type { AnswerMapViewApplication } from "./map-views.js";
```

4c. In the route policy table, after the `GET /v1/answers/{id}/disclosure` row (about line 1419), add:

```ts
  { route: "GET /v1/answers/{id}/map", auth: "user", resource: "run-owner", action: "read-map-view" },
```

4d. In the `buildApi` options interface, after `readonly disclosures?: AnswerDisclosureApplication;`, add:

```ts
  /**
   * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the owner's read of the debate's map
   * view. Optional like `disclosures`; without it the route answers its closed 404.
   */
  readonly mapViews?: AnswerMapViewApplication;
```

4e. Directly after the whole `api.get<…>("/v1/answers/:id/disclosure", …)` handler, add:

```ts
  // Debate shape P2c (spec 2026-10-12 §3.3 step 8, §3.4): the debate page's map view.
  // The answer read is the first ownership check, as for the disclosure; the application
  // checks again (core.run_is_owned_by) before it reads the map (pre-flight PF-C16).
  // "Not yours", "malformed", "no reader" and "no map choice" are one closed 404. The view
  // is read against the answer's own nodes, so it never names a node the page cannot show.
  api.get<{ Params: { id: string } }>("/v1/answers/:id/map", routePolicy("GET /v1/answers/{id}/map"), async (request, reply) => {
    const answerId = ResourceIdSchema.safeParse(request.params.id);
    const mapViews = options.mapViews;
    if (!answerId.success || mapViews === undefined) return reply.status(404).send({ error: "MAP_VIEW_NOT_FOUND" });
    const ownership = ownershipFor(request);
    const answer = await options.application.readAnswer(answerId.data, request.session, undefined, ownership);
    if (answer === null) return reply.status(404).send({ error: "MAP_VIEW_NOT_FOUND" });
    const view = await mapViews.readMapView({
      runId: answer.run_ref,
      nodeIds: new Set(answer.nodes.map((node) => node.node_id)),
      ownership
    });
    return view === null
      ? reply.status(404).send({ error: "MAP_VIEW_NOT_FOUND" })
      : reply.send(DebateMapViewSchema.parse(view));
  });
```

- [ ] **Step 5: Copy the view into a publication in `apps/api/src/publications.ts`**

5a. Add `type DebateMapView,` to the `@debateai/contract` import (after `type AnswerFloor,`). After the `@debateai/db` import block, add:

```ts
import { NO_MAP_VIEWS, type AnswerMapViewApplication } from "./map-views.js";
```

5b. After `logFloorNotPublished`, add:

```ts
/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map view copied into the snapshot, so
 * the public page can list what was raised but not debated and title each position. Like the
 * story and the floor, it never blocks publishing. A failed read publishes no view, and the
 * log records only a bounded diagnostic, never the error's text. It is read as the publisher
 * (owner-scoped, like the story and the floor), so the map reader's own owner check applies
 * here too (pre-flight PF-C16).
 */
export async function readPublishableMapView(
  mapViews: AnswerMapViewApplication,
  input: Readonly<{ runId: string; answer: Answer; authenticated: AuthenticatedSession; source: AuthSourceContext }>
): Promise<DebateMapView | null> {
  try {
    return await mapViews.readMapView({
      runId: input.runId,
      nodeIds: new Set(input.answer.nodes.map((node) => node.node_id)),
      ownership: { ownerRef: input.authenticated.ownerRef, legacyAskerId: null }
    });
  } catch (error) {
    console.error(JSON.stringify(Object.freeze({
      event: "api.publication.map_view_not_published",
      requestId: input.source.requestId,
      diagnostic: storyReadDiagnostic(error)
    })));
    return null;
  }
}
```

5c. In the `PostgresPublicationApplication` constructor, replace

```ts
    private readonly stories: PublicationStoryReader = NO_PUBLICATION_STORIES
  ) {}
```

with

```ts
    private readonly stories: PublicationStoryReader = NO_PUBLICATION_STORIES,
    private readonly mapViews: AnswerMapViewApplication = NO_MAP_VIEWS
  ) {}
```

5d. In `stagePublication`, after `const floor = await readPublishableFloor(this.repository, input);`, add:

```ts
    const mapView = await readPublishableMapView(this.mapViews, input);
```

Then replace `      ...(floor === null ? {} : { floor })` with:

```ts
      ...(floor === null ? {} : { floor }),
      ...(mapView === null ? {} : { map_view: mapView })
```

`storyReadDiagnostic` (publications.ts, about line 134) returns only a typed code or an error class name, never a message, so the log stays bounded. `AuthenticatedSession` is already imported (`import type { AuthenticatedSession } from "./sessions.js";`), and `stagePublication`'s input already carries `authenticated`, so `readPublishableMapView(this.mapViews, input)` type-checks as written.

The published copy and the owner check (pre-flight PF-C16): yes, the publish path needs the ownership too, and it gets it. Publishing is for signed-in owners only, and every other publish-time read is owner-scoped by `input.authenticated.ownerRef` (`readStoryShort`, `readAnswerFloor`, `readAuthorPseudonym`), after `stagePublication` has checked `answer.run_ref === runId` and `preflightGrant`. So `readPublishableMapView` passes `{ ownerRef: input.authenticated.ownerRef, legacyAskerId: null }`, and the map reader's `core.run_is_owned_by` check applies to the published copy as well. A publisher who does not own the run gets no `map_view` (null), never a failed publish.

- [ ] **Step 6: Wire main.ts with P2b's reader** (P2b gate)

Find P2b's reader class: `grep -rn "readMapChoiceForRun" packages/map/src | head`. It is `MapChoiceRepository` from **`@debateai/map`** (`packages/map/src/repository.ts`, P2b Task 8; P2b cross-plan change 1), constructed with the runtime pool: `new MapChoiceRepository(pool)`. It is NOT in `@debateai/db`: do not add it to any `@debateai/db` import. Its record must expose the `MapViewSource` members (Contract deviation 4), or `tsc` refuses the assignment.

6a. In `apps/api/src/main.ts`, after `import { RepositoryAnswerDisclosureApplication } from "./disclosures.js";` (about line 166), add:

```ts
import { MapChoiceRepository } from "@debateai/map";
import { RepositoryAnswerMapViewApplication, runOwnerCheckFrom } from "./map-views.js";
```

6a-2. apps/api now depends on `@debateai/map`:
- `apps/api/package.json` (one line of JSON): in `"dependencies"`, after `"@debateai/mail-templates":"workspace:*",`, add `"@debateai/map":"workspace:*",`.
- `tools/orphan-audit/src/index.ts`: in the `["apps/api", "apps/api", [ … ]]` row, add `"map"` after `"judgement"`.
- Run `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm install --offline`. It links the workspace package and updates `pnpm-lock.yaml`'s `apps/api` importer; nothing is downloaded. If it refuses offline, stop and report BLOCKED with its output.
- Then run `pnpm run audit:architecture`. It exits 1 today and still exits 1 after this step, on dev's known F31 debt only. Expected: exactly three violations, `apps/api -> obs-capture is not a declared edge`, `apps/runner -> obs-capture is not a declared edge` and `apps/scheduler -> obs-capture is not a declared edge`, and no other line. In particular, no line names `apps/api -> map`; if one does, the orphan-audit row edit above is missing. (pre-flight PF-C18)

6b. Before `const publications = publicationCipher === undefined` (about line 1110; `pool` is the runtime pool built at about line 309), add:

```ts
// Debate shape P2c (spec 2026-10-12 §3.3 step 8): the debate page's map view, for the
// owner's route and for the snapshot a publication takes, on the same runtime pool. P2b's
// reader checks no owner, so the view asks core.run_is_owned_by first (pre-flight PF-C16).
const mapViews = new RepositoryAnswerMapViewApplication(
  new MapChoiceRepository(pool),
  runOwnerCheckFrom((text, values) => pool.query<{ owned: boolean }>(text, values))
);
```

6c. In `new PostgresPublicationApplication(…)`, after `new RepositoryPublicationStoryReader(storyRepository)`, add `,\n      mapViews`.

6d. In `buildApi({ … })`, after the `  disclosures: ownerDisclosures,` line (about line 1570; `ownerDisclosures` is built at about line 1512), add:

```ts
  mapViews,
```

- [ ] **Step 7: Update `tests/unit/s7-authorization.test.ts`: the policy row, the route count, and the two closed-404 tables**

7a. In `EXPECTED_AUTHORIZATION_MATRIX`, after the line `  { route: "GET /v1/answers/{id}/disclosure", auth: "user", resource: "run-owner", action: "read-disclosure" },` (about line 127), add:

```ts
  { route: "GET /v1/answers/{id}/map", auth: "user", resource: "run-owner", action: "read-map-view" },
```

7b. The route count (pre-flight PF-C14). In "governs the entire canonical inventory and mounts every route in explicit v2" (about line 317), replace

```ts
    expect(contractInventory.routes).toHaveLength(166);
```

with

```ts
    // Debate shape P2c adds GET /v1/answers/{id}/map.
    expect(contractInventory.routes).toHaveLength(167);
```

Before editing, check the line still reads `toHaveLength(166)`. If it reads another number, a later merge moved it: add exactly 1 to what is there, and say so in the report.

7c. The map reader in the closed-404 tables (pre-flight PF-C15). After the import `import type { AnswerDisclosureApplication } from "../../apps/api/src/disclosures.js";` (about line 13), add:

```ts
import type { AnswerMapViewApplication } from "../../apps/api/src/map-views.js";
```

After the whole `servingDisclosures` function (it ends just before `const USER_HEADERS=testSessionHeaders(USER_IDENTITY);`), add:

```ts
/**
 * Debate shape P2c (pre-flight PF-C15): a composed map view reader that WOULD serve a view,
 * for the same reason as `servingStories`: every read past the map route's own gates turns
 * the denied and malformed rows red.
 */
function servingMapViews(reads: unknown[]): AnswerMapViewApplication {
  return {
    readMapView: async (input) => {
      reads.push(input);
      return { positions: [], also_raised: ["A point that was raised."] };
    }
  };
}
```

7d. In the `it.each` table of "maps denied owned route $method $url to its closed 404 face", after the row ``{ method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/disclosure`, error: "DISCLOSURE_NOT_FOUND" },``, add:

```ts
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/map`, error: "MAP_VIEW_NOT_FOUND" },
```

In the same test's body, replace

```ts
    const disclosureReads: unknown[] = [];
    const api = buildApi({
      application,sessions:testSessionApplication([foreignIdentity]),allowedOrigin:TEST_APP_ORIGIN,
      stories: servingStories(storyReads),
      disclosures: servingDisclosures(disclosureReads)
    });
```

with

```ts
    const disclosureReads: unknown[] = [];
    const mapReads: unknown[] = [];
    const api = buildApi({
      application,sessions:testSessionApplication([foreignIdentity]),allowedOrigin:TEST_APP_ORIGIN,
      stories: servingStories(storyReads),
      disclosures: servingDisclosures(disclosureReads),
      mapViews: servingMapViews(mapReads)
    });
```

and after its `    expect(disclosureReads).toEqual([]);` add `    expect(mapReads).toEqual([]);`.

7e. In the `it.each` table of "maps malformed resource IDs on $method $url to the closed 404 face", after the row `    { method: "GET" as const, url: "/v1/answers/not-a-uuid/disclosure", error: "DISCLOSURE_NOT_FOUND" },`, add:

```ts
    { method: "GET" as const, url: "/v1/answers/not-a-uuid/map", error: "MAP_VIEW_NOT_FOUND" },
```

In the same test's body, replace

```ts
    const disclosureReads: unknown[] = [];
    const api = buildApi({
      application: fixtureApplication(),
      sessions:testSessionApplication([USER_IDENTITY]),allowedOrigin:TEST_APP_ORIGIN,
      stories: servingStories(storyReads),
      disclosures: servingDisclosures(disclosureReads)
    });
```

with

```ts
    const disclosureReads: unknown[] = [];
    const mapReads: unknown[] = [];
    const api = buildApi({
      application: fixtureApplication(),
      sessions:testSessionApplication([USER_IDENTITY]),allowedOrigin:TEST_APP_ORIGIN,
      stories: servingStories(storyReads),
      disclosures: servingDisclosures(disclosureReads),
      mapViews: servingMapViews(mapReads)
    });
```

and after its `    expect(disclosureReads).toEqual([]);` add `    expect(mapReads).toEqual([]);`.

Both `fixtureApplication().readAnswer` answer null, so each new row stops at the route's answer read (denied) or at the id check (malformed), and `mapReads` stays `[]`.

- [ ] **Step 8: Run the tests**

Run each, one at a time:
- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-map-view-api.test.ts` → PASS (11).
- `pnpm exec vitest run tests/unit/s7-authorization.test.ts` → PASS. This is the first run where it is green again since Task 4 (the route is mounted, the count is 167, and the two new closed-404 rows read no map). (pre-flight PF-C12, PF-C14, PF-C15)
- `pnpm exec vitest run tests/unit/m5-answer-disclosure.test.ts` → PASS.
- `pnpm exec vitest run tests/unit/s8-publication.test.ts` → PASS. Publication without a reader stages no `map_view`.

8b. Update the shipped-file list, because this task adds the shipped file `apps/api/src/map-views.ts` (pre-flight PF-C1). Run, one at a time:
- `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`
- `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` (again, without the variable) → PASS.

Then `git diff tests/support/shipped-corpus.manifest.txt` must show exactly one added line, `apps/api/src/map-views.ts`, and nothing removed.

Implementer note (pre-flight PF-C19): a corrupt or undecryptable map row (`MAP_ROW_INVALID`, `CONTENT_CIPHER_UNAVAILABLE`) is thrown by P2b's reader and reaches the API's global 500 handler on the owner route. That is safe (no database detail leaves), and the UI treats a non-404 as "could not read" (Task 6). The tidier pattern is the disclosure route's: a `readOwnerMapView` in `owner-read.ts` that turns a corrupt row into the closed 404 plus one `api.map_view.unreadable` log line with `apiOperationalErrorDiagnostic(error)`. This plan does NOT apply it; leave the 500. On the publish path a corrupt row already publishes no view (`readPublishableMapView` catches and logs).

Implementer note (pre-flight PF-C19): the owner's data export (`ownerDeps` in `main.ts`: `application`, `stories`, `disclosures`) does not carry the map view. Do not add it here: that is an owner decision, reported to the controller.

Implementer note (pre-flight PF-C19): the pre-flight checked, and found right, the record fields against Contract deviation 4; that no a1..a4 id, `keyPointId`, maker or mark leaves `map-views.ts`; that an encrypted run's map read decrypts under the run lease and an erased run reads as null; that the API's runtime pool has the content cipher; that migration 0116 grants SELECT on the map tables to `debateai_runtime`; and the `main.ts` anchor `disclosures: ownerDisclosures,`.

- [ ] **Step 9: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/api/src/map-views.ts apps/api/src/index.ts apps/api/src/publications.ts apps/api/src/main.ts \
  apps/api/package.json pnpm-lock.yaml tools/orphan-audit/src/index.ts \
  tests/unit/s7-authorization.test.ts tests/unit/debate-shape-map-view-api.test.ts \
  tests/support/shipped-corpus.manifest.txt
git commit -m "$(cat <<'EOF'
API: the owner's map view route and the published copy (debate shape P2c)

GET /v1/answers/{id}/map reads P2b's map choice for the answer's own run,
against the answer's own nodes (closed 404 otherwise), after a second owner
check (core.run_is_owned_by) since P2b's reader checks none; a publication
copies the view into its snapshot, read as the publisher, and never fails
for it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: UI data — read the map view beside the answer

**Files:**
- Create: `apps/ui/lib/v3/mapView.ts`
- Modify: `apps/ui/lib/api.ts`
- Modify: `apps/ui/lib/serverApi.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt` (regenerated in Step 6b; it gains `apps/ui/lib/v3/mapView.ts`) (pre-flight PF-C1)
- Test: `tests/unit/debate-shape-map-view-ui.test.ts` (new)

**Interfaces:**
- `readAnswerMapView(client, answer): Promise<AnswerMapViewRead>`, where `AnswerMapViewRead = { mapView: DebateMapView | null; failed: boolean }`.
- `positionTitlesFrom(view, nodes, storyCatalog): ReadonlyMap<nodeId, title>`. It takes no compose catalogue: the AI's name never comes from the interface's words (pre-flight PF-C23, ruling C-NAMES).
- `positionAiName(lineage: { maker, model_id }): string | null`: the plain name a title shows for the AI, or null when none is known (pre-flight PF-C23, ruling C-NAMES).
- `PositionTitleNode = { node_id; maker_lineage: { maker; model_id } | null }`: an owner `Answer` node and a public `ContractNode` both fit it (both lineages carry `maker` and `model_id`).
- The served `DebateBundle` gets an optional `mapViewRead`.
- `GetDebateServerResult` (ok) gets `mapView`.

`mapView.ts` is pure and has no React import. `serverApi.ts`, which is server-side, imports it, so the React context lives in the client component of Task 7.

How a title names the AI (ruling C-NAMES; pre-flight PF-C23). A title never shows a raw model id:
1. A model of a family the UI already names, other than a local one (`modelMeta(id).key` is `claude`, `gpt`, `gemini` or `grok`, and the id does not contain "local"): that family name, e.g. "GPT", "Claude".
2. Otherwise a reviewed preview model: its maker's display name from `PREVIEW_MODEL_MAKERS` (`apps/ui/lib/previewPlanRoster.ts`), e.g. "Z.AI" for GLM, "Alibaba" for Qwen. Qwen never gets `modelMeta`'s "{name} (local)" text, which comes from the interface's compose catalogue, not the question's.
3. Otherwise the node's recorded `maker_lineage.maker`, when it is a plain display name. The runner records display names there ("OpenAI", "Z.AI", "DeepSeek": `packages/providers/src/preview-models.ts`, `apps/ui/lib/v3/storyFixture.ts`). "Plain" means: not the model id, and only letters, digits, spaces and `. & ' -`, at most 40 characters (so no `/`, `:` or `_`).
4. Otherwise no title: the position keeps today's heading.

The answer inside the title loses its closing punctuation: trim it, then strip a trailing run of `[\s.!?。！？؟]`. If nothing is left, there is no title (pre-flight PF-C24).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debate-shape-map-view-ui.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ContractHttpError, type Answer, type DebateMapView } from "@debateai/contract";
import { positionAiName, positionTitlesFrom, readAnswerMapView, type PositionTitleNode } from "../../apps/ui/lib/v3/mapView.js";
import { getDebateBundle } from "../../apps/ui/lib/api.js";
import { PREVIEW_MODEL_MAKERS } from "../../apps/ui/lib/previewPlanRoster.js";
import { STORY_FIXTURE_ANSWER } from "../../apps/ui/lib/v3/storyFixture.js";

/** Debate shape P2c: the owner page reads the map view beside the answer, and titles each position with it. */

/**
 * The one key the titles read, as Wording picks option 1 words it. `public.positionTitle` reaches
 * en/public.json only in Task 7 Step 9a, and `t()` does not fall back to the public catalogue, so
 * this test carries the key itself (pre-flight PF-C20).
 */
const ENGLISH_TITLE: Record<string, string> = { "public.positionTitle": "The case for {answer}, argued by {ai}" };

/** A reviewed preview model id, found by its family, so this test writes no model id of its own. */
function previewModel(family: RegExp): string {
  const id = Object.keys(PREVIEW_MODEL_MAKERS).find((candidate) => family.test(candidate));
  if (id === undefined) throw new Error(`PREVIEW_MODEL_MISSING: no preview model matches ${String(family)}`);
  return id;
}

const VIEW: DebateMapView = {
  positions: [
    { node_id: "n-hybrid", answer: "Move gradually, with hybrid work" },
    { node_id: "n-yes", answer: "Move now" },
    { node_id: "node:not-in-answer", answer: "Stay" }
  ],
  also_raised: ["Ask the school about a mid-year move."]
};

describe("debate shape P2c — readAnswerMapView", () => {
  const answer = { answer_id: STORY_FIXTURE_ANSWER.answer_id };

  it("reads the view, says 'none' for a 404, and 'could not read' for anything else", async () => {
    expect(await readAnswerMapView({ readAnswerMapView: async () => VIEW }, answer)).toEqual({ mapView: VIEW, failed: false });
    expect(await readAnswerMapView({
      readAnswerMapView: async () => { throw new ContractHttpError("NOT_FOUND", 404, "MAP_VIEW_NOT_FOUND"); }
    }, answer)).toEqual({ mapView: null, failed: false });
    expect(await readAnswerMapView({
      readAnswerMapView: async () => { throw new ContractHttpError("SERVER_FAILURE", 500, "boom"); }
    }, answer)).toEqual({ mapView: null, failed: true });
    // A client without the method (an older test double) is a failed read, never a thrown page.
    expect(await readAnswerMapView({} as never, answer)).toEqual({ mapView: null, failed: true });
  });

  it("rides the served bundle beside the floor", async () => {
    const client = {
      readRun: async () => ({ run_ref: STORY_FIXTURE_ANSWER.run_ref, question_line: "q", state: "SETTLED", terminal_reason: null, hold_until: null, argument_language: null }),
      readRunAnswer: async () => STORY_FIXTURE_ANSWER as Answer,
      readAnswerDisclosure: async () => { throw new ContractHttpError("NOT_FOUND", 404, "DISCLOSURE_NOT_FOUND"); },
      readAnswerMapView: async () => VIEW
    };
    const bundle = await getDebateBundle(STORY_FIXTURE_ANSWER.run_ref, "cookie-session", client as never);
    expect(bundle.kind).toBe("served");
    expect(bundle.kind === "served" ? bundle.mapViewRead : null).toEqual({ mapView: VIEW, failed: false });
  });
});

describe("debate shape P2c — positionTitlesFrom", () => {
  const nodes = STORY_FIXTURE_ANSWER.nodes;

  it("titles each position the answer holds, in the catalogue it is given", () => {
    const titles = positionTitlesFrom(VIEW, nodes, ENGLISH_TITLE);
    expect([...titles.keys()]).toEqual(["n-hybrid", "n-yes"]);
    // storyFixture.ts: n-hybrid is xAI's Grok model, n-yes is OpenAI's GPT model.
    expect(titles.get("n-hybrid")).toBe("The case for Move gradually, with hybrid work, argued by Grok");
    const romanian = { "public.positionTitle": "Argumentele pentru {answer}, susținute de {ai}" };
    expect(positionTitlesFrom(VIEW, nodes, romanian).get("n-yes")).toBe("Argumentele pentru Move now, susținute de GPT");
  });

  it("gives no title without a view, or for a position whose AI is not known", () => {
    expect(positionTitlesFrom(null, nodes, ENGLISH_TITLE).size).toBe(0);
    const anonymous = nodes.map((node) => ({ ...node, maker_lineage: null }));
    expect(positionTitlesFrom(VIEW, anonymous, ENGLISH_TITLE).size).toBe(0);
  });

  it("names the AI in plain words and never shows a raw model id (pre-flight PF-C23, ruling C-NAMES)", () => {
    const glm = previewModel(/glm/iu);
    const qwen = previewModel(/qwen/iu);
    const unknown = "acme-lab/acme-7b-chat";
    // A preview model: its maker's display name, even when the recorded maker is not a plain name.
    expect(positionAiName({ maker: "provider:zai", model_id: glm })).toBe("Z.AI");
    // Qwen: its maker's name, never "Qwen (local)" from the interface's compose words.
    expect(positionAiName({ maker: "Alibaba", model_id: qwen })).toBe("Alibaba");
    // A model the UI does not know: the recorded maker when it is a plain name, else nothing.
    expect(positionAiName({ maker: "Acme", model_id: unknown })).toBe("Acme");
    expect(positionAiName({ maker: "provider:acme", model_id: unknown })).toBeNull();
    expect(positionAiName({ maker: unknown, model_id: unknown })).toBeNull();

    const glmNode: PositionTitleNode = { node_id: "n-glm", maker_lineage: { maker: "Z.AI", model_id: glm } };
    const qwenNode: PositionTitleNode = { node_id: "n-qwen", maker_lineage: { maker: "Alibaba", model_id: qwen } };
    const unknownNode: PositionTitleNode = { node_id: "n-unknown", maker_lineage: { maker: "provider:acme", model_id: unknown } };
    const view: DebateMapView = {
      positions: [{ node_id: "n-glm", answer: "Stay" }, { node_id: "n-qwen", answer: "Wait a year" }, { node_id: "n-unknown", answer: "Go" }],
      also_raised: []
    };
    const titles = positionTitlesFrom(view, [glmNode, qwenNode, unknownNode], ENGLISH_TITLE);
    expect([...titles.entries()]).toEqual([
      ["n-glm", "The case for Stay, argued by Z.AI"],
      ["n-qwen", "The case for Wait a year, argued by Alibaba"]
    ]);
    for (const title of titles.values()) {
      for (const id of [glm, qwen, unknown]) expect(title).not.toContain(id);
    }
  });

  it("drops the answer's closing punctuation, and gives no title when nothing is left (pre-flight PF-C24)", () => {
    const view = (answer: string): DebateMapView => ({ positions: [{ node_id: "n-yes", answer }], also_raised: [] });
    expect(positionTitlesFrom(view("Move now."), nodes, ENGLISH_TITLE).get("n-yes")).toBe("The case for Move now, argued by GPT");
    expect(positionTitlesFrom(view("  Move now?! "), nodes, ENGLISH_TITLE).get("n-yes")).toBe("The case for Move now, argued by GPT");
    expect(positionTitlesFrom(view("现在搬。"), nodes, ENGLISH_TITLE).get("n-yes")).toBe("The case for 现在搬, argued by GPT");
    expect(positionTitlesFrom(view(" ?! "), nodes, ENGLISH_TITLE).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-map-view-ui.test.ts`
Expected: FAIL. `../../apps/ui/lib/v3/mapView.js` cannot be resolved.

- [ ] **Step 3: Create `apps/ui/lib/v3/mapView.ts`**

```ts
import { ContractHttpError, type Answer, type ContractClient, type DebateMapView } from "@debateai/contract";
import { modelMeta } from "../models.js";
import { PREVIEW_MODEL_MAKERS } from "../previewPlanRoster.js";
import { t, type MessageCatalog } from "../i18n/translate.js";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8): the debate page's map view, read where the
 * page reads the answer, as the floor is. A 404 (a run without the new shape, or a map that
 * chose nothing) is no view. Any other failure is also no view, but `failed` says it could not
 * be read, so a refresh keeps the view the page already shows for the same answer.
 * Pure: the server-side page imports it. The React context lives in components/PositionTitle.
 */
export type AnswerMapViewRead = Readonly<{ mapView: DebateMapView | null; failed: boolean }>;

export async function readAnswerMapView(
  client: Pick<ContractClient, "readAnswerMapView">,
  answer: Pick<Answer, "answer_id">
): Promise<AnswerMapViewRead> {
  try {
    return { mapView: await client.readAnswerMapView(answer.answer_id), failed: false };
  } catch (failure) {
    return { mapView: null, failed: !(failure instanceof ContractHttpError && failure.code === "NOT_FOUND") };
  }
}

/** The lineage members a title needs. An owner node's `MakerLineage` and a public node's `PublicMakerLineage` both fit. */
export type PositionTitleLineage = Readonly<{ maker: string; model_id: string }>;

/** The two members of an answer's (owner) or a snapshot's (public) node a title needs. */
export type PositionTitleNode = Readonly<{ node_id: string; maker_lineage: PositionTitleLineage | null }>;

/** The model families whose `modelMeta` name is a plain family name in every language ("GPT", "Claude"). */
const PLAIN_FAMILIES: ReadonlySet<string> = new Set(["claude", "gpt", "gemini", "grok"]);

/** A recorded maker that reads as a display name: no id, path or code characters. */
const PLAIN_MAKER_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .&'-]{0,39}$/u;

/** The answer's closing punctuation, which the title's own sentence replaces (pre-flight PF-C24). */
const ANSWER_CLOSE = /[\s.!?。！？؟]+$/u;

/**
 * Ruling C-NAMES (pre-flight PF-C23): the AI's name in a position title, in plain words, never a
 * raw model id.
 * 1. A model of a family the UI names, other than a local one: that family name ("GPT").
 * 2. A reviewed preview model: its maker's display name ("Z.AI", "Alibaba"). `modelMeta` would
 *    give the raw id, or "{name} (local)" in the interface's language, not the question's.
 * 3. The node's recorded maker, when it is a plain display name ("OpenAI").
 * 4. Otherwise null: the position gets no title.
 */
export function positionAiName(lineage: PositionTitleLineage): string | null {
  const modelId = lineage.model_id;
  const meta = modelMeta(modelId);
  if (PLAIN_FAMILIES.has(meta.key) && !modelId.toLowerCase().includes("local")) return meta.name;
  const previewMaker = Object.hasOwn(PREVIEW_MODEL_MAKERS, modelId) ? PREVIEW_MODEL_MAKERS[modelId] : undefined;
  if (previewMaker !== undefined) return previewMaker;
  const maker = lineage.maker.trim();
  return maker !== modelId && PLAIN_MAKER_NAME.test(maker) ? maker : null;
}

/**
 * "The case for {answer}, argued by {ai}" for each opening position the view names. It uses
 * `storyCatalog`, the QUESTION's `public` catalogue, because the answer is written in the
 * question's language and the label must match it. The AI is named by `positionAiName`, and the
 * answer loses its closing punctuation. A position whose node the page does not hold, whose AI
 * has no plain name, or whose answer is empty, gets no title and keeps today's heading.
 */
export function positionTitlesFrom(
  view: DebateMapView | null,
  nodes: Iterable<PositionTitleNode>,
  storyCatalog: MessageCatalog
): ReadonlyMap<string, string> {
  const titles = new Map<string, string>();
  if (view === null) return titles;
  const byId = new Map<string, PositionTitleNode>();
  for (const node of nodes) byId.set(node.node_id, node);
  for (const position of view.positions) {
    const lineage = byId.get(position.node_id)?.maker_lineage ?? null;
    if (lineage === null) continue;
    const ai = positionAiName(lineage);
    const answer = position.answer.trim().replace(ANSWER_CLOSE, "");
    if (ai === null || answer === "") continue;
    titles.set(position.node_id, t(storyCatalog, "public.positionTitle", { answer, ai }));
  }
  return titles;
}
```

(pre-flight PF-C23, PF-C24; ruling C-NAMES) `modelMeta(modelId)` is called with its default English compose catalogue on purpose: for the four plain families its name does not depend on the catalogue.

- [ ] **Step 4: Read it in the served bundle (`apps/ui/lib/api.ts`)**

4a. After `import { readAnswerFloor, type AnswerFloorRead } from "./v3/floorAnswer.js";`, add:

```ts
import { readAnswerMapView, type AnswerMapViewRead } from "./v3/mapView.js";
```

4b. In `DebateBundle`, change the served member to:

```ts
  | { kind: "served"; answer: Answer; detail: DebateDetail; run: null; questionLanguage: ArgumentLanguage | null; floorRead: AnswerFloorRead; mapViewRead?: AnswerMapViewRead }
```

The field is optional so that test doubles building served bundles by hand keep their meaning. The page treats an absent one as a failed read.

4c. Replace `servedDebateBundle` with:

```ts
async function servedDebateBundle(
  answer: Answer,
  catalog: MessageCatalog,
  run: RunProjection | null,
  client: Pick<ContractClient, "readAnswerDisclosure" | "readAnswerMapView">
): Promise<DebateBundle> {
  // The floor and the map view (debate shape P2c) both need only the answer: one round trip.
  const [floorRead, mapViewRead] = await Promise.all([readAnswerFloor(client, answer), readAnswerMapView(client, answer)]);
  return {
    kind: "served",
    answer,
    detail: debateDetailFromAnswer(answer, catalog),
    run: null,
    questionLanguage: run?.argument_language ?? null,
    floorRead,
    mapViewRead
  };
}
```

Implementer note (pre-flight PF-C26): every served read now adds one `GET /v1/answers/{id}/map`, and every run without a shape row answers it with a 404, so this is the common path. Nothing can skip it (unlike the floor read). Make sure the 404 path logs nothing: `readAnswerMapView` returns `{ mapView: null, failed: false }` silently, and neither this function nor the API's route handler (Task 5) may write a warning or error line for a 404.

- [ ] **Step 5: Read it on the server page's first render (`apps/ui/lib/serverApi.ts`)**

5a. Add `type DebateMapView,` to the `@debateai/contract` import (after `type ContractClient,`). After `import { readAnswerFloor } from "./v3/floorAnswer.js";`, add:

```ts
import { readAnswerMapView } from "./v3/mapView.js";
```

5b. Change the ok member of `GetDebateServerResult` to:

```ts
  | { ok: true; debate: DebateDetail; answer: Answer; questionLanguage: ArgumentLanguage | null; floor: AnswerFloor | null; mapView: DebateMapView | null }
```

5c. Replace the final `Promise.all` and return of `getDebateServer` with:

```ts
  // The question's language, a components-only answer's floor (spec 2026-09-26 §14.4.4) and
  // the map view (debate shape P2c) are read side by side: all need only the answer. None of
  // them can fail the page.
  const [questionLanguage, floorRead, mapViewRead] = await Promise.all([
    readQuestionLanguage(resolvedClient, answer.run_ref),
    readAnswerFloor(resolvedClient, answer),
    readAnswerMapView(resolvedClient, answer)
  ]);
  return {
    ok: true,
    debate: debateDetailFromAnswer(answer, catalog),
    answer,
    questionLanguage,
    floor: floorRead.floor,
    mapView: mapViewRead.mapView
  };
```

- [ ] **Step 6: Run the tests**

Run each, one at a time:
- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-map-view-ui.test.ts` → PASS (6). (pre-flight PF-C20: 2 `readAnswerMapView` cases and 4 `positionTitlesFrom` cases, counted after the PF-C23/PF-C24 cases were added)
- `pnpm exec vitest run tests/unit/m6-floor-answer.test.ts` → PASS.

6a. Typecheck the UI with its own compiler (pre-flight PF-C2). The root `pnpm run typecheck` excludes `apps/ui`, so it never sees these files. Heavy; run it alone, after the memory check:

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
memory_pressure | tail -1
pnpm --dir apps/ui exec tsc --noEmit -p tsconfig.json
```

Expected: free memory at least 40%, then exit 0.

6b. Update the shipped-file list, because this task adds the shipped file `apps/ui/lib/v3/mapView.ts` (pre-flight PF-C1). Run, one at a time:
- `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`
- `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` (again, without the variable) → PASS.

Then `git diff tests/support/shipped-corpus.manifest.txt` must show exactly one added line, `apps/ui/lib/v3/mapView.ts`, and nothing removed.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/ui/lib/v3/mapView.ts apps/ui/lib/api.ts apps/ui/lib/serverApi.ts tests/unit/debate-shape-map-view-ui.test.ts \
  tests/support/shipped-corpus.manifest.txt
git commit -m "$(cat <<'EOF'
Debate page data: read the map view beside the answer (debate shape P2c)

readAnswerMapView (404 = none, other failures = could not read) rides the
served bundle and the first render; positionTitlesFrom words "The case for
{answer}, argued by {ai}" in the question's catalogue, naming the AI in
plain words (never a raw model id) and without the answer's closing stop.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Debate page — "Also raised, not debated" and position titles

**Files:**
- Create: `apps/ui/components/PositionTitle.tsx`
- Create: `apps/ui/components/AlsoRaisedList.tsx`
- Modify: `apps/ui/components/DebateCanvas.tsx`
- Modify: `apps/ui/components/DebateThread.tsx`
- Modify: `apps/ui/app/debate/[id]/DebatePageClient.tsx`
- Modify: `apps/ui/app/debate/[id]/DebatePageGate.tsx`
- Modify: `apps/ui/app/debate/[id]/page.tsx`
- Modify: `apps/ui/components/PublicDebateOverview.tsx`
- Modify: `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`
- Modify: `apps/ui/components/AnswerHonestyDrawer.tsx` (shape marks: words only; pre-flight PF-C21, ruling C-DRAWER)
- Modify: `apps/ui/components/NodeDetailDrawer.tsx` (shape marks: neutral tone, no code tooltip; pre-flight PF-C22, rulings C-TONE and C-DRAWER)
- Modify: `apps/ui/messages/en/public.json`
- Modify: `apps/ui/messages/en/debateChrome.json` (the value of `debateChrome.condition.mapMergeFallback` is reworded; no key added; pre-flight PF-C33)
- Modify: `apps/ui/lib/i18n/public.test.mjs`
- Modify: `apps/ui/app/globals.css`
- Modify: `tests/support/shipped-corpus.manifest.txt` (regenerated in Step 10b; it gains `apps/ui/components/AlsoRaisedList.tsx` and `apps/ui/components/PositionTitle.tsx`) (pre-flight PF-C1)
- Test: `tests/render/debate-shape-also-raised.test.tsx` (new)
- Test: `tests/render/debate-shape-mark-labels.test.tsx` (new) (pre-flight PF-C21, PF-C22)

**Interfaces:**
- `<AlsoRaisedList view catalog locale />` renders nothing when `view` is null or undefined. Its heading id comes from React's `useId()` (pre-flight PF-C29).
- `PositionTitlesContext` carries `{ locale, byNodeId }`.
- `<PositionTitle nodeId />` renders nothing when the node has no title.
- `DebatePageClient` gets `initialMapView?` and `publicMapView?`, and `DebatePageGate` gets `initialMapView?`.
- New English keys: `public.alsoRaised.title`, `public.alsoRaised.empty`, `public.positionTitle` (option 1 from Wording picks).
- No other UI key is added. The English value of the existing key `debateChrome.condition.mapMergeFallback` changes to Wording picks option 1, "Points that said the same thing were combined"; the other 34 locales follow in Task 10 (pre-flight PF-C33).
- The eight debate shape marks (`DEBATE_SHAPE_MARKS` from `@debateai/kernel`, which the UI already imports in `apps/ui/lib/v3/labels.ts`): in the honesty drawer they show only their localized label, with no `title` and no scope, subject, reason or lift-path line; in the node drawer their pill has the tone `"neutral"` and no `title` (rulings C-DRAWER, C-TONE).

- [ ] **Step 1: Write the failing render test**

Create `tests/render/debate-shape-also-raised.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, PublicDebateSchema, type DebateMapView } from "@debateai/contract";

/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8, ruling S2): the debate page lists what was raised
 * but not debated, and titles each opening position "The case for …, argued by …". Both are in the
 * question's language (the `public` catalogue of the story locale), and never say who raised a
 * point or how many did.
 */

/*
 * Pre-flight PF-C27: the page mounts with a settled answer, so it replays `readEvents` and never opens
 * `streamEvents`. The refresh under test is the mount refresh (`useEffect(() => { refresh(); })`), which
 * reads the run, the answer, and now the map view through `getDebateBundle`'s read client.
 */
const mocks = vi.hoisted(() => ({
  readAnswerStory: vi.fn(),
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  readAnswer: vi.fn(),
  readAnswerMapView: vi.fn(),
  readEvents: vi.fn(),
  readLedgerDigest: vi.fn(),
  readRunVisibility: vi.fn()
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  // The refresh's read client. It needs no readAnswerDisclosure: the fixture's answer is served, not components-only,
  // so readAnswerFloor never calls it.
  const readClient = {
    readRun: mocks.readRun,
    readRunAnswer: mocks.readRunAnswer,
    readAnswer: mocks.readAnswer,
    readAnswerMapView: mocks.readAnswerMapView
  };
  return {
    ...actual,
    COOKIE_SESSION_MARKER: "cookie-session",
    validateSession: vi.fn().mockResolvedValue(undefined),
    contractClient: {
      readSession: vi.fn(async () => ({
        asker_id: "owner:33333333-3333-4333-8333-333333333333", session_id: "22222222-2222-4222-8222-222222222222",
        caller_scope: "ASKER", ownership_provenance: "server_session", provisional_identity_model: false
      })),
      readAnswerStory: mocks.readAnswerStory,
      readEvents: mocks.readEvents,
      readLedgerDigest: mocks.readLedgerDigest,
      readRunVisibility: mocks.readRunVisibility
    },
    getDebateBundle: (id: string, token: string, _client?: unknown, options?: unknown) =>
      actual.getDebateBundle(id, token, readClient as never, options as never)
  };
});
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("t".repeat(43))
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient.js";
import { PublicDebateOverview } from "../../apps/ui/components/PublicDebateOverview.js";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_DEBATE_ID, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const RUN_REF = STORY_FIXTURE_ANSWER.run_ref;
const VIEW: DebateMapView = {
  positions: [{ node_id: "n-hybrid", answer: "Mutați-vă treptat" }, { node_id: "n-yes", answer: "Da, acum" }],
  also_raised: ["Merită întrebată școala despre mutarea la mijlocul anului.", "Chiria poate crește după un an."]
};
/** A stand-in for the question's catalogue: the English one with recognisable words for the three new keys. */
const QUESTION_WORDS: Record<string, string> = {
  ...publicEnglish,
  "public.alsoRaised.title": "RO Also raised",
  "public.alsoRaised.empty": "RO Every point was debated.",
  "public.positionTitle": "RO Pentru {answer}, susținut de {ai}"
};
const PUBLIC_BASE = {
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Author",
  question: "Ar trebui să ne mutăm cu familia la Cluj?",
  published_at: "2026-10-12T10:00:00.000Z",
  answer: {
    terminal: "SERVED", verdict: "CONTESTED", verdict_available: true, confidence_band: "CAPPED",
    summary_segments: [{ text: "Mutați-vă treptat." }], badges: [], residual_objections: [],
    reversal_point: "O locuință mai ieftină în Cluj.", as_of: "2026-10-12T09:00:00.000Z"
  }
} as const;

/** storyFixture.ts: n-yes is OpenAI's GPT model, n-hybrid is xAI's Grok model (ruling C-NAMES: the family name). */
const TITLES = ["RO Pentru Da, acum, susținut de GPT", "RO Pentru Mutați-vă treptat, susținut de Grok"];

let root: Root | null = null;

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  });
}

async function mount(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await flush();
  return container;
}

function overview(mapView: DebateMapView | undefined): ReactElement {
  const debate = PublicDebateSchema.parse(mapView === undefined ? PUBLIC_BASE : { ...PUBLIC_BASE, map_view: mapView });
  return (
    <PublicDebateOverview debate={debate} catalog={publicEnglish} storyCatalog={QUESTION_WORDS} storyLocale="ro"
      onDetails={() => undefined} onRead={() => undefined} />
  );
}

function owner(initialMapView: DebateMapView | null): ReactElement {
  return (
    <DebatePageClient
      id={STORY_FIXTURE_DEBATE_ID}
      initialDebate={debateDetailFromAnswer(STORY_FIXTURE_ANSWER)}
      initialAnswer={STORY_FIXTURE_ANSWER}
      timeCatalog={{}}
      questionLocale="ro"
      storyLocale="ro"
      storyCatalog={QUESTION_WORDS}
      initialMapView={initialMapView}
    />
  );
}

function titlesIn(container: HTMLElement): string[] {
  return [...new Set([...container.querySelectorAll(".positionTitle")].map((title) => title.textContent ?? ""))];
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  mocks.readAnswerStory.mockReset().mockResolvedValue(storyFixture("READY"));
  mocks.readRun.mockReset().mockResolvedValue({
    run_ref: RUN_REF, question_line: STORY_FIXTURE_ANSWER.question_line, state: "SETTLED",
    terminal_reason: null, hold_until: null, argument_language: null
  });
  mocks.readRunAnswer.mockReset().mockResolvedValue(STORY_FIXTURE_ANSWER);
  mocks.readAnswer.mockReset();
  // By default the page's own refresh cannot read the map view (pre-flight PF-C27).
  mocks.readAnswerMapView.mockReset().mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 500, "boom"));
  mocks.readEvents.mockReset().mockResolvedValue([]);
  mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by this render test"));
  mocks.readRunVisibility.mockReset().mockResolvedValue({ state: "PRIVATE", public_ref: null });
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("debate shape P2c — the public overview's also-raised list", () => {
  it("lists what was raised but not debated, in the question's language, with only the claims", async () => {
    const container = await mount(overview(VIEW));
    const section = container.querySelector<HTMLElement>("section.alsoRaised");
    expect(section?.getAttribute("lang")).toBe("ro");
    expect(section?.querySelector(".alsoRaisedTitle")?.textContent).toBe("RO Also raised");
    expect([...section!.querySelectorAll(".alsoRaisedItem")].map((item) => item.textContent)).toEqual(VIEW.also_raised);
    for (const forbidden of ["OpenAI", "Anthropic", "xAI", "raised by", "raised_by", "P1"]) {
      expect(section!.textContent).not.toContain(forbidden);
    }
  });

  it("says every point was debated when nothing was left over", async () => {
    const container = await mount(overview({ positions: [], also_raised: [] }));
    expect(container.querySelector(".alsoRaisedEmpty")?.textContent).toBe("RO Every point was debated.");
    expect(container.querySelector(".alsoRaisedItem")).toBeNull();
  });

  it("shows nothing for a snapshot without a map", async () => {
    const container = await mount(overview(undefined));
    expect(container.querySelector(".alsoRaised")).toBeNull();
  });
});

describe("debate shape P2c — the owner's debate page", () => {
  it("titles each position in the question's language, and only the positions the view names", async () => {
    const container = await mount(owner(VIEW));
    expect(titlesIn(container).sort()).toEqual([...TITLES].sort());
    for (const title of container.querySelectorAll(".positionTitle")) expect(title.getAttribute("lang")).toBe("ro");
  });

  it("keeps the titles when a refresh cannot read the map", async () => {
    // beforeEach: readAnswerMapView rejects with a 500, so the mount refresh's map read FAILED (pre-flight PF-C27).
    const container = await mount(owner(VIEW));
    await flush();
    await flush();
    expect(mocks.readRunAnswer).toHaveBeenCalled();
    expect(mocks.readAnswerMapView).toHaveBeenCalledWith(STORY_FIXTURE_ANSWER.answer_id);
    expect(titlesIn(container).sort()).toEqual([...TITLES].sort());
    expect(container.querySelectorAll("section.alsoRaised .alsoRaisedItem")).toHaveLength(2);
  });

  it("learns the map view from its own refresh when the server read none", async () => {
    mocks.readAnswerMapView.mockReset().mockResolvedValue(VIEW);
    const container = await mount(owner(null));
    await flush();
    await flush();
    expect(mocks.readAnswerMapView).toHaveBeenCalledWith(STORY_FIXTURE_ANSWER.answer_id);
    expect(titlesIn(container).sort()).toEqual([...TITLES].sort());
    expect([...container.querySelectorAll(".alsoRaisedItem")].map((item) => item.textContent)).toEqual(VIEW.also_raised);
  });

  it("lists the also-raised points on the owner's page too, and nothing without a map", async () => {
    const withMap = await mount(owner(VIEW));
    expect([...withMap.querySelectorAll(".alsoRaisedItem")].map((item) => item.textContent)).toEqual(VIEW.also_raised);
    await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    const without = await mount(owner(null));
    expect(without.querySelector(".alsoRaised")).toBeNull();
    expect(without.querySelector(".positionTitle")).toBeNull();
  });
});
```

1b. Create `tests/render/debate-shape-mark-labels.test.tsx` (pre-flight PF-C21, PF-C22; rulings C-DRAWER, C-TONE). It renders both drawers the way `tests/render/m6-honesty-drawer.test.tsx` does, then reads the markup through the DOM:

```tsx
// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Answer } from "@debateai/contract";
import { DEBATE_SHAPE_MARKS } from "@debateai/kernel";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * Debate shape P2c (rulings C-DRAWER and C-TONE; pre-flight PF-C21, PF-C22): the eight shape marks are
 * information for the reader. The honesty drawer shows only their words: never the run id or node id a
 * record names, its reason code, or the raw mark in a tooltip. The node drawer shows them in the neutral
 * tone, not as a dispute. Every other mark keeps today's tooltip and tone.
 */

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalog = (namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, "en", `${namespace}.json`), "utf8")) as Record<string, string>;
const miscEn = catalog("misc");
const chromeEn = catalog("debateChrome");
function words(key: string): string {
  const value = chromeEn[key];
  if (value === undefined) throw new Error(`catalogue lacks ${key}`);
  return value;
}
const noop = () => {};

/** Ids only the shape records carry, as the runner writes them, so their absence proves the drawer leaked none. */
const RUN_ID = "7f3c2a10-5b8e-4c1d-9a2f-0e6b4d8c1a37";
const SCRUTINISED_NODE = "node:shape-scrutinised-7f3c";
const MERGE_REASON = "MAP_MERGE_FALLBACK:MERGE";
const SCRUTINY_REASON = "SCRUTINY_EXTENDED:3";
const SHAPE: readonly string[] = DEBATE_SHAPE_MARKS;

type MarkRecord = Answer["condition_mark_records"][number];
function shapeRecord(mark: MarkRecord["mark"], scope: MarkRecord["scope"], subjectRef: string, reason: string): MarkRecord {
  return {
    mark, scope, subject_ref: subjectRef, reason, lift_path: null, served_root_rule: null,
    call_site_key: null, planned_leg_count: null, terminal_transport_outcome: null, review_outcome: null,
    hidden_strength: null, hidden_score_threshold: null, hidden_score_threshold_source_ref: null,
    excluded_from_served_number: null, judged_basis_count: null, affected_node_ids: [SCRUTINISED_NODE]
  };
}

const BASE = buildFairShapedAnswer();
/** The fixture's own two marks, all eight shape marks, and a map record and a scrutiny record as the runner writes them. */
const SHAPED = buildFairShapedAnswer({
  condition_marks: [...BASE.condition_marks, ...DEBATE_SHAPE_MARKS],
  condition_mark_records: [
    ...BASE.condition_mark_records,
    shapeRecord("MAP_MERGE_FALLBACK", "answer", RUN_ID, MERGE_REASON),
    shapeRecord("SCRUTINY-EXTENDED", "node", SCRUTINISED_NODE, SCRUTINY_REASON)
  ]
});

function parsed(markup: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = markup;
  return container;
}

function honestyDrawer(answer: Answer): HTMLElement {
  return parsed(renderToStaticMarkup(
    <AnswerHonestyDrawer
      answer={answer}
      live={createLiveRunState()}
      ledgerDigest={null}
      ledgerError={null}
      inspection={null}
      inspectionError={null}
      onShowInspection={noop}
      onUnlinkMemory={noop}
      actionState={null}
      investigationInput={{}}
      onInvestigationInput={noop}
      onRecordInvestigation={noop}
      answerExport={{ available: false, reason: "LEDGER_DIGEST_PENDING", message: "Test-layer export pending." }}
      token={null}
      onClose={noop}
      catalog={miscEn}
      debateChromeCatalog={chromeEn}
      floorShown={false}
    />
  ));
}

function expectNoInternals(text: string): void {
  for (const internal of [RUN_ID, SCRUTINISED_NODE, MERGE_REASON, SCRUTINY_REASON, ...SHAPE]) {
    expect(text, internal).not.toContain(internal);
  }
}

describe("debate shape P2c — the shape marks in the drawers", () => {
  it("the honesty drawer shows only the words of the eight shape marks", () => {
    const drawer = honestyDrawer(SHAPED);
    const merge = words("debateChrome.condition.mapMergeFallback");
    const scrutiny = words("debateChrome.condition.scrutinyExtended");
    const chips = [...drawer.querySelectorAll<HTMLElement>(".roleChip")].map((chip) => chip.textContent);
    expect(chips).toContain(merge);
    expect(chips).toContain(scrutiny);
    expect(chips).toContain(words("debateChrome.condition.answersFilled"));
    // Each shape record's line is its label and nothing else: no scope, subject, reason or lift path.
    const items = [...drawer.querySelectorAll<HTMLElement>("li.drawerFindingItem")];
    for (const label of [merge, scrutiny]) {
      const item = items.find((candidate) => (candidate.textContent ?? "").includes(label));
      expect(item?.textContent?.trim(), label).toBe(label);
    }
    expectNoInternals(drawer.textContent ?? "");
    // No tooltip carries a shape mark; every other mark keeps today's code tooltip.
    for (const element of drawer.querySelectorAll("[title]")) {
      expect(SHAPE).not.toContain(element.getAttribute("title"));
    }
    expect(drawer.querySelector('[title="OWED-CHECK-UNEXECUTED"]')).not.toBeNull();
  });

  it("the node drawer shows the shape marks in the neutral tone, without a code tooltip", () => {
    const v3 = { ...SHAPED.nodes[0]!, condition_marks: [...DEBATE_SHAPE_MARKS, "SINGLE-LINEAGE" as const] };
    const drawer = parsed(renderToStaticMarkup(
      <NodeDetailDrawer
        node={debateDetailFromAnswer(SHAPED).tree!.children[0]!}
        v3={v3}
        token={null}
        onClose={noop}
        onFocusRecommendationNode={() => false}
        canFocusRecommendationNode={() => false}
        onQueued={noop}
        onError={noop}
        onAuthRejected={noop}
        debateChromeCatalog={chromeEn}
        conditionRecords={SHAPED.condition_mark_records}
      />
    ));
    const pills = [...drawer.querySelectorAll<HTMLElement>("[data-condition-pill]")];
    expect(pills).toHaveLength(DEBATE_SHAPE_MARKS.length + 1);
    for (const pill of pills.slice(0, DEBATE_SHAPE_MARKS.length)) {
      expect(pill.getAttribute("data-mark")).toBe("neutral");
      expect(pill.classList.contains("neutral")).toBe(true);
      expect(pill.hasAttribute("title")).toBe(false);
    }
    expect(pills.map((pill) => pill.textContent)).toContain(words("debateChrome.condition.scrutinyExtended"));
    // Every other mark keeps today's tone and tooltip.
    const lineage = pills[DEBATE_SHAPE_MARKS.length]!;
    expect(lineage.getAttribute("data-mark")).toBe("dispute");
    expect(lineage.getAttribute("title")).toBe("SINGLE-LINEAGE");
    expectNoInternals(drawer.textContent ?? "");
  });

  it("words a merge fallback as combining only points that said the same thing (pre-flight PF-C33)", () => {
    expect(words("debateChrome.condition.mapMergeFallback")).toBe("Points that said the same thing were combined");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run, one at a time:
- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/render/debate-shape-also-raised.test.tsx`
  Expected: FAIL. There is no `section.alsoRaised` and no `.positionTitle`.
- `pnpm exec vitest run tests/render/debate-shape-mark-labels.test.tsx`
  Expected: FAIL. The honesty drawer's chips carry `title={mark}` and its records print the run id, node id and reason code; the node drawer's shape pills are `dispute` with `title={mark}`; the English merge-fallback words are still the old ones.

- [ ] **Step 3: Create `apps/ui/components/PositionTitle.tsx`**

```tsx
"use client";

import { createContext, useContext } from "react";
import { localeDirection } from "@/lib/i18n/questionLocale";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8, ruling S2): each opening position is titled
 * "The case for {answer}, argued by {ai}" in the question's language. The page builds the
 * titles once (`positionTitlesFrom`, lib/v3/mapView.ts) and hands them down by context, so
 * every view titles a position the same way without carrying a catalogue of its own. A node
 * without a title keeps today's heading.
 */
export type PositionTitles = Readonly<{ locale: string; byNodeId: ReadonlyMap<string, string> }>;

export const NO_POSITION_TITLES: PositionTitles = Object.freeze({ locale: "en", byNodeId: new Map<string, string>() });

export const PositionTitlesContext = createContext<PositionTitles>(NO_POSITION_TITLES);

export function PositionTitle({ nodeId }: { nodeId: string }) {
  const titles = useContext(PositionTitlesContext);
  const title = titles.byNodeId.get(nodeId);
  if (title === undefined) return null;
  return (
    <p className="positionTitle" lang={titles.locale} dir={localeDirection(titles.locale)} data-ai-generated="true">
      {title}
    </p>
  );
}
```

- [ ] **Step 4: Create `apps/ui/components/AlsoRaisedList.tsx`**

```tsx
"use client";

import { useId } from "react";
import type { DebateMapView } from "@debateai/contract";
import { localeDirection } from "@/lib/i18n/questionLocale";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8): "Also raised, not debated" lists the map's
 * points that no answer argued.
 * - The words are in the question's language: `catalog` is the `public` catalogue of `locale`,
 *   the story's.
 * - Only the claims are shown, never who raised them, how many did, or any mark.
 * - With no map (a run without the new shape, or a map that chose nothing), nothing is shown.
 */
export function AlsoRaisedList({
  view,
  catalog,
  locale
}: {
  view: DebateMapView | null | undefined;
  catalog: MessageCatalog;
  locale: string;
}) {
  // React's useId, not a fixed id, so two lists on one page never share an id (pre-flight PF-C29).
  // A hook: called before the early return.
  const titleId = useId();
  if (view === null || view === undefined) return null;
  return (
    <section className="alsoRaised" aria-labelledby={titleId} lang={locale} dir={localeDirection(locale)} data-ai-generated="true">
      <h2 id={titleId} className="alsoRaisedTitle">{t(catalog, "public.alsoRaised.title")}</h2>
      {view.also_raised.length === 0 ? (
        <p className="alsoRaisedEmpty">{t(catalog, "public.alsoRaised.empty")}</p>
      ) : (
        <ul className="alsoRaisedList">
          {view.also_raised.map((claim, index) => (
            <li key={`${String(index)}:${claim}`} className="alsoRaisedItem">{claim}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Render the title in the two node views; the drawers show the shape marks as plain information**

5a. `apps/ui/components/DebateCanvas.tsx`: after `import { ModelMetaLine } from "@/components/ModelPresentation";`, add `import { PositionTitle } from "@/components/PositionTitle";`. Then replace

```tsx
              ) : null}
            </div>
            <div className="nodeScoreRow">
```

with

```tsx
              ) : null}
            </div>
            <PositionTitle nodeId={node.id} />
            <div className="nodeScoreRow">
```

The canvas packs cards by their measured heights (`heights[node.id]`), so the extra line moves its neighbours down.

5b. `apps/ui/components/DebateThread.tsx`: after `import { ReferenceAuthorPill, ReferenceReviewLine, ReferenceScoreBadges } from "@/components/ReferenceNodeMeta";`, add `import { PositionTitle } from "@/components/PositionTitle";`. Then replace

```tsx
            <ReferenceAuthorPill node={node} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
          </div>
          <ReferenceReviewLine review={v3Node?.review} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
```

with

```tsx
            <ReferenceAuthorPill node={node} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
          </div>
          <PositionTitle nodeId={node.id} />
          <ReferenceReviewLine review={v3Node?.review} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
```

Implementer note (pre-flight PF-C29): titles appear only in the Tree (`DebateCanvas.tsx`) and Thread (`DebateThread.tsx`) views. Split (`DebateSplit.tsx`), Map (`DebateMap.tsx`) and the node drawer keep today's headings in P2c on purpose: spec §3.3 says "titles each position", and the other three views are a follow-up the controller lists for the owner. Keep the title a `<p>`: the Thread card is `role="button"`, which flattens headings anyway. Its `lang`/`dir` pattern is StoryPanel's. The repo has no axe render tests apart from `auth-accessibility`, so none is added here.

5c. `apps/ui/components/AnswerHonestyDrawer.tsx`: the eight shape marks show only their words (pre-flight PF-C21, ruling C-DRAWER). The UI already imports `@debateai/kernel` at run time (`apps/ui/lib/v3/labels.ts` imports `RUN_LEVEL_SPEND_STOP_CODES` from it), and the kernel exports `DEBATE_SHAPE_MARKS` from `packages/kernel/src/index.ts`.
- After `import type { Answer, ExecutionLedgerDigest, Inspection, InvestigationGap } from "@debateai/contract";`, add `import { DEBATE_SHAPE_MARKS } from "@debateai/kernel";`.
- Immediately before `function labeledNumberLine(`, add:

```ts
/**
 * Debate shape P2c (ruling C-DRAWER): the eight shape marks show only their words here. Their
 * records' scope, subject (a run id, `<run>:<n>`, or a node id), reason code (`MAP_MERGE_FALLBACK:MERGE`,
 * `SCRUTINY_EXTENDED:3`) and lift path are engine internals, and their chips carry no raw mark as a tooltip.
 */
const SHAPE_MARKS: ReadonlySet<string> = new Set<string>(DEBATE_SHAPE_MARKS);

```

- Replace

```tsx
                  <span key={mark} className="roleChip" title={mark}>
```

with

```tsx
                  <span key={mark} className="roleChip" title={SHAPE_MARKS.has(mark) ? undefined : mark}>
```

- In the records list, replace

```tsx
                  const backupKeys = backupRecordKeysFor(record);
                  return (
```

with

```tsx
                  if (SHAPE_MARKS.has(record.mark)) {
                    // Debate shape P2c (ruling C-DRAWER): the label only. No scope, run or node id, reason code or lift path.
                    return (
                      <li key={`${record.mark}:${record.subject_ref}`} className="drawerFindingItem">
                        <div className="drawerFindingMeta">
                          <span>{conditionRecordLabel(record, debateChromeCatalog)}</span>
                        </div>
                      </li>
                    );
                  }
                  const backupKeys = backupRecordKeysFor(record);
                  return (
```

5d. `apps/ui/components/NodeDetailDrawer.tsx`: the shape marks' pills are neutral and carry no code tooltip (pre-flight PF-C22, rulings C-TONE and C-DRAWER). Ruling C-TONE answers the pre-flight's owner question: the six map marks, which land on the served root node, are neutral too, as are the two extension marks.
- After `import type { Answer } from "@debateai/contract";`, add `import { DEBATE_SHAPE_MARKS } from "@debateai/kernel";`.
- Immediately before `const DECISION_KIND_LABEL_KEYS: Record<string, string> = {`, add:

```ts
/** Debate shape P2c (rulings C-TONE, C-DRAWER): the eight shape marks are information, not a dispute. */
const SHAPE_MARKS: ReadonlySet<string> = new Set<string>(DEBATE_SHAPE_MARKS);

```

- Replace

```tsx
            const tone = mark === "UNFALSIFIED-AFTER-ROTATION"
              ? "agree"
              : mark === "UNDER-EXPLORED"
                ? "gold"
                : "dispute";
            return (
              <span key={mark} className={`drawerConditionPill ${tone}`} data-condition-pill data-mark={tone} title={mark}>
```

with

```tsx
            const shape = SHAPE_MARKS.has(mark);
            const tone = shape
              ? "neutral"
              : mark === "UNFALSIFIED-AFTER-ROTATION"
                ? "agree"
                : mark === "UNDER-EXPLORED"
                  ? "gold"
                  : "dispute";
            return (
              <span key={mark} className={`drawerConditionPill ${tone}`} data-condition-pill data-mark={tone} title={shape ? undefined : mark}>
```

The `.drawerConditionPill.neutral` rule is added in Step 9d.

- [ ] **Step 6: Wire `apps/ui/app/debate/[id]/DebatePageClient.tsx`**

6a. In the `@debateai/contract` import (lines 25–33), add `type DebateMapView,` after `type AnswerFloor,`. After `import { Toast } from "@/components/Toast";`, add:

```ts
import { AlsoRaisedList } from "@/components/AlsoRaisedList";
import { PositionTitlesContext, type PositionTitles } from "@/components/PositionTitle";
import { positionTitlesFrom } from "@/lib/v3/mapView";
```

6b. In the props destructuring, replace

```ts
  initialFloor = null,
  publicFloor = null
}: {
```

with

```ts
  initialFloor = null,
  publicFloor = null,
  initialMapView = null,
  publicMapView = null
}: {
```

6c. In the props type, replace

```ts
  publicFloor?: ResolvedFloor | null;
}) {
```

with

```ts
  publicFloor?: ResolvedFloor | null;
  /**
   * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the owner's map view, from the server's
   * read beside the answer. The page's own refreshes read it again with the answer.
   */
  initialMapView?: DebateMapView | null;
  /** Public mode: the snapshot's map view. The public page reads nothing else. */
  publicMapView?: DebateMapView | null;
}) {
```

6d. After `const [floor, setFloor] = useState<AnswerFloor | null>(initialFloor);`, add:

```ts
  const [mapView, setMapView] = useState<DebateMapView | null>(initialMapView);
```

6e. In `refresh`, after `setFloor((current) => (floorRead.failed && sameAnswer ? current : floorRead.floor));`, add:

```ts
        // Debate shape P2c: the map view is read with the answer too. A failed read, or a bundle
        // without one, keeps the view the page shows for this same answer version.
        const mapViewRead = bundle.mapViewRead;
        setMapView((current) => (mapViewRead === undefined || mapViewRead.failed
          ? (sameAnswer ? current : null)
          : mapViewRead.mapView));
```

6f. After the `storyView` `useMemo` (it ends with `[publicMode, answer, story, storyLocaleReady, id, storyLocale, resolvedFloor]\n  );`), add:

```ts
  // Debate shape P2c (ruling S2): "The case for {answer}, argued by {ai}" for each opening
  // position, in the question's language (`storyCatalog`), as the story strip speaks it. Like
  // the strip, the owner's titles wait until that language's catalogue has arrived
  // (`storyLocaleReady`), so a "starting" render never shows them in the interface's words.
  const shownMapView = publicMode ? publicMapView : (storyLocaleReady ? mapView : null);
  const positionTitles = useMemo<PositionTitles>(() => ({
    locale: storyLocale,
    byNodeId: positionTitlesFrom(
      shownMapView,
      publicMode ? [...(publicNodesById?.values() ?? [])] : answer?.nodes ?? [],
      storyCatalog
    )
  }), [shownMapView, publicMode, publicNodesById, answer, storyCatalog, storyLocale]);
```

(pre-flight PF-C28: `storyLocaleReady` is the page's existing `useStoryLocaleReady(...)` result, declared before the `storyView` memo. PF-C23: `positionTitlesFrom` takes no compose catalogue.)

6g. Replace

```tsx
      {storyView === null ? null : <StoryPanel view={storyView} catalog={storyCatalog} locale={storyLocale} />}
```

with

```tsx
      {storyView === null ? null : <StoryPanel view={storyView} catalog={storyCatalog} locale={storyLocale} />}

      {/* ---- also raised, not debated (owner; the public page shows it in its overview) ---- */}
      {publicMode ? null : <AlsoRaisedList view={storyLocaleReady ? mapView : null} catalog={storyCatalog} locale={storyLocale} />}
```

(pre-flight PF-C28: the list waits for the question's catalogue too.)

6h. Wrap the component's main return in the provider. Replace the start

```tsx
  return (
    <div
      className="debateView"
```

with

```tsx
  return (
    <PositionTitlesContext.Provider value={positionTitles}>
    <div
      className="debateView"
```

Then replace its end, the only place this text occurs:

```tsx
          </span>
        </div>
      )}
    </div>
  );
}

function formatDebugValue(
```

with

```tsx
          </span>
        </div>
      )}
    </div>
    </PositionTitlesContext.Provider>
  );
}

function formatDebugValue(
```

- [ ] **Step 7: Pass the view in from the server page and the gate**

7a. `apps/ui/app/debate/[id]/DebatePageGate.tsx`:
- Change line 3 to `import type { Answer, AnswerFloor, DebateMapView } from "@debateai/contract";`.
- Add `initialMapView = null` after `initialFloor` in the destructuring.
- Add `/** Debate shape P2c: the map view, from the server's read beside the answer; null when none was read. */\n  initialMapView?: DebateMapView | null;` after `initialFloor: AnswerFloor | null;` in the type.
- Add `initialMapView={initialMapView}` after `initialFloor={initialFloor}` in the JSX.

7b. `apps/ui/app/debate/[id]/page.tsx`:
- Change line 3 to `import type { Answer, AnswerFloor, DebateMapView } from "@debateai/contract";`.
- After `let initialFloor: AnswerFloor | null = null;`, add `let initialMapView: DebateMapView | null = null;`.
- In the `if (result.ok) {` branch, after `initialFloor = result.floor;`, add `initialMapView = result.mapView ?? null;`.
- In the second (final) `<DebatePageGate … />`, after `initialFloor={initialFloor}`, add `initialMapView={initialMapView}`.
- In the `starting` branch's gate, after `initialFloor={null}`, add `initialMapView={null}`.

- [ ] **Step 8: The public page**

8a. `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx`: after `publicFloor={publicFloor}`, add `publicMapView={debate.map_view ?? null}`.

8b. `apps/ui/components/PublicDebateOverview.tsx`: after `import { FloorAnswer } from "@/components/FloorAnswer";`, add `import { AlsoRaisedList } from "@/components/AlsoRaisedList";`. Then replace

```tsx
          <ArgumentCard argument={presentation.strongestCon} catalog={catalog} composeCatalog={composeCatalog} side="con" onRead={onRead} />
        </section>
```

with

```tsx
          <ArgumentCard argument={presentation.strongestCon} catalog={catalog} composeCatalog={composeCatalog} side="con" onRead={onRead} />
        </section>

        {/* Debate shape P2c: what came up but was not debated, in the question's language. */}
        <AlsoRaisedList view={debate.map_view} catalog={storyCatalog} locale={storyLocale} />
```

- [ ] **Step 9: English words, the public catalogue's source list, styles, the merge-fallback reword**

9a. `apps/ui/messages/en/public.json`: after `  "public.story.pathsListName": "Positions the debate explored",`, insert:

```json
  "public.alsoRaised.title": "Also raised, not debated",
  "public.alsoRaised.empty": "Every point that came up was debated.",
  "public.positionTitle": "The case for {answer}, argued by {ai}",
```

Implementer note (pre-flight PF-C29): "Every point that came up was debated." slightly overclaims. Points beyond the ones chosen, and positions a money stop cut, were not argued. The code keeps it. The controller lists an owner wording option for it in Wording picks: "Nothing else came up beyond the points above."

9b. `apps/ui/lib/i18n/public.test.mjs`: in `sourcePaths`, replace

```js
  "lib/v3/floorAnswer.ts"
];
```

with

```js
  "lib/v3/floorAnswer.ts",
  // Debate shape P2c: "Also raised, not debated" and the position titles, `public.alsoRaised.*` and
  // `public.positionTitle`, in the QUESTION's `public` catalogue.
  "components/AlsoRaisedList.tsx",
  "lib/v3/mapView.ts"
];
```

9c. `apps/ui/app/globals.css`: append at the end of the file:

```css
/* Debate shape P2c (spec 2026-10-12 §3.3 step 8): "Also raised, not debated" and the position titles. */
.alsoRaised {
  margin: 16px 0 0;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
  font-family: var(--font-sans);
}
.alsoRaisedTitle {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.alsoRaisedList {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-inline-start: 18px;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text);
}
.alsoRaisedEmpty {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}
.positionTitle {
  margin: 6px 0 2px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text);
}
```

9d. `apps/ui/app/globals.css`: the neutral pill tone for the shape marks (pre-flight PF-C22, ruling C-TONE). Replace the existing rule (about line 8044; it occurs once)

```css
.drawerConditionPill.gold {
  color: var(--gold-text);
  background: var(--gold-bg);
  border-color: var(--gold-border);
}
```

with

```css
.drawerConditionPill.gold {
  color: var(--gold-text);
  background: var(--gold-bg);
  border-color: var(--gold-border);
}

/* Debate shape P2c (ruling C-TONE): the shape marks are information, not a dispute. */
.drawerConditionPill.neutral {
  color: var(--text-2);
  background: var(--surface-sunken);
  border-color: var(--line-2);
}
```

The three tokens are defined for both the light and the dark theme at the top of `globals.css` (`--text-2`, `--surface-sunken`, `--line-2`).

9e. `apps/ui/messages/en/debateChrome.json`: reword the merge-fallback label, which overclaimed (the code combines only points that are identical once normalised, `packages/map/src/keypoints.ts`). Wording picks option 1, no final full stop; the key stays (pre-flight PF-C33). Replace

```json
  "debateChrome.condition.mapMergeFallback": "Similar points were grouped together by a simple rule",
```

with

```json
  "debateChrome.condition.mapMergeFallback": "Points that said the same thing were combined",
```

The other 34 locales (ro included) are reworded in Task 10 with its explicit replace list. Until then they keep the old meaning; `debateChrome.test.mjs` checks keys and placeholders only, so it stays green.

- [ ] **Step 10: Run the tests**

Run each, one at a time:
- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/render/debate-shape-also-raised.test.tsx` → PASS (7). (pre-flight PF-C27: 3 overview cases and 4 owner-page cases, the success-path refresh case included)
- `pnpm exec vitest run tests/render/debate-shape-mark-labels.test.tsx` → PASS (3). (pre-flight PF-C21, PF-C22, PF-C33)
- `pnpm exec vitest run tests/render/m6-honesty-drawer.test.tsx` → PASS. (its pills are not shape marks, so they keep their tone and `title`)
- `pnpm exec vitest run tests/render/debate-page-catalogs.test.tsx` → PASS.
- `pnpm exec vitest run tests/render/story-debate-page.test.tsx` → PASS.
- `pnpm exec vitest run tests/render/story-public-overview.test.tsx` → PASS.
- `pnpm exec vitest run tests/render/pda-s02-public-page.test.tsx` → PASS.
- `pnpm exec vitest run tests/render/ui02e-debate-canvas.test.tsx` → PASS.
- `cd apps/ui && node --import tsx --test lib/i18n/catalogNamespaces.test.mjs` → PASS.
- `cd apps/ui && node --import tsx --test lib/i18n/debateChrome.test.mjs` → PASS. It checks keys and placeholders only, so the English reword alone keeps it green (pre-flight PF-C33).
- `cd apps/ui && node --import tsx --test lib/i18n/public.test.mjs` → expected: "covers every public translation call" and "no hard-coded English" PASS. "all 35 locales carry the exact public contract" FAILS on the three new keys until Task 10 (expected; see Global Constraints).

10a. Typecheck the UI with its own compiler (pre-flight PF-C2). The root `pnpm run typecheck` excludes `apps/ui`, so it never sees these `.tsx` files. Heavy; run it alone, after the memory check:

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
memory_pressure | tail -1
pnpm --dir apps/ui exec tsc --noEmit -p tsconfig.json
```

Expected: free memory at least 40%, then exit 0.

10b. Update the shipped-file list, because this task adds the shipped files `apps/ui/components/AlsoRaisedList.tsx` and `apps/ui/components/PositionTitle.tsx` (pre-flight PF-C1). Run, one at a time:
- `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`
- `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` (again, without the variable) → PASS.

Then `git diff tests/support/shipped-corpus.manifest.txt` must show exactly two added lines, `apps/ui/components/AlsoRaisedList.tsx` and `apps/ui/components/PositionTitle.tsx`, and nothing removed.

- [ ] **Step 11: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/ui/components/PositionTitle.tsx apps/ui/components/AlsoRaisedList.tsx apps/ui/components/DebateCanvas.tsx \
  apps/ui/components/DebateThread.tsx "apps/ui/app/debate/[id]/DebatePageClient.tsx" "apps/ui/app/debate/[id]/DebatePageGate.tsx" \
  "apps/ui/app/debate/[id]/page.tsx" apps/ui/components/PublicDebateOverview.tsx "apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx" \
  apps/ui/components/AnswerHonestyDrawer.tsx apps/ui/components/NodeDetailDrawer.tsx \
  apps/ui/messages/en/public.json apps/ui/messages/en/debateChrome.json apps/ui/lib/i18n/public.test.mjs apps/ui/app/globals.css \
  tests/render/debate-shape-also-raised.test.tsx tests/render/debate-shape-mark-labels.test.tsx \
  tests/support/shipped-corpus.manifest.txt
git commit -m "$(cat <<'EOF'
Debate page: also raised, not debated, and position titles (debate shape P2c)

The owner and public pages list the map's points no answer argued, and title
each opening position "The case for {answer}, argued by {ai}", both in the
question's language; a refresh that cannot read the map keeps what is shown.
The drawers show the eight shape marks as plain information: their words
only, a neutral tone, no codes or ids. The merge-fallback label now says
only points that said the same thing were combined.
English words only; the other 34 locales follow in the translation task.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: /new — Depth mode, Depth of scrutiny and Answer length become real

**Gates:** the Project 1 gate and the P2a gate in Global Constraints.
- **Project 1** removes the Concurrency and Branching width controls and rewrites `newDebate.legacyNotice`. This task assumes its version of `NewDebatePageClient.tsx`, `newDebate.json` and `tier01-new-plan-tier.test.tsx`. It touches only the three controls, the notice and Max tokens.
- **Merge with Project 1:** if Project 1 is not yet merged into this branch, stop. Do not cherry-pick or recreate its edits here.
- **P2a** adds `depthMode`, `scrutiny` and `answerLength` to `DepthParamsSchema`, and the same three (snake case, optional) to `AskRoomQuerySchema` and the typed client's `getAskRoom` (Contract deviation 9).
- **P2b in-force gate** (Global Constraints) before Step 5b: the room flag mirrors the row `apps/api/src/main.ts` hands the API, which must be the in-force row only.

**Files:**
- Modify: `packages/contract/src/index.ts` (`shape_settings` on both room responses)
- Modify: `apps/api/src/index.ts` (the `GET /v1/asks/room` handler)
- Test: `tests/unit/debate-shape-room-flag.test.ts` (new)
- Modify: `apps/ui/app/new/NewDebatePageClient.tsx`
- Modify: `apps/ui/app/new/defaults.tsx`
- Modify: `apps/ui/lib/api.ts`
- Delete: `apps/ui/lib/scrutinyDepth.ts`
- Modify: `apps/ui/lib/i18n/compose.test.mjs`
- Modify: `apps/ui/lib/i18n/catalog.test.mjs`
- Modify: `apps/ui/messages/en/newDebate.json`
- Modify: `apps/ui/messages/en/compose.json`
- Modify: `apps/ui/app/globals.css`
- Modify: `tests/render/tier01-new-plan-tier.test.tsx`
- Test: `tests/render/debate-shape-new-controls.test.tsx` (new)
- Test: `tests/unit/debate-shape-new-ask-wire.test.ts` (new)
- Modify: `tests/support/shipped-corpus.manifest.txt` (regenerated in Step 10: the deleted `apps/ui/lib/scrutinyDepth.ts` leaves the list; this task adds no shipped file, because its new files are all under `tests/`) (pre-flight PF-C1)
- Owner packet, local and never committed: `.superpowers/sdd/2026-10-12-debate-shape-phase2c/support-article-draft.md` at the repository top level (Step 12). No file under `packages/support-kb/` changes in this task (pre-flight PF-C31)

**Interfaces:**
- `defaults.tsx` exports:
  - the types `DepthMode`, `Scrutiny` and `AnswerLength`, derived from P2a's `DepthParams`;
  - the constants `DEPTH_MODES`, `SCRUTINY_LEVELS` and `ANSWER_LENGTHS`;
  - `fixedDepthAllowedFor(planTier)`.
- `NewDebateAskDefaults` gets the optional fields `depthMode`, `scrutiny` and `answerLength`. The config keys are `depth_mode`, `scrutiny` and `answer_length`.
- `createDebate` puts these into `depth_params.depthMode`, `depth_params.scrutiny` and `depth_params.answerLength`.
- Contract: `CustomerAskRoomResponseSchema` and `InternalAskRoomResponseSchema` each gain `shape_settings: z.literal(true).optional()` (last member). `AskRoomResponse` therefore has an optional `shape_settings?: true` on both union members.
- API: the room read adds `shape_settings: true` as the LAST member of its body only when `options.debateShapePolicy !== undefined` (`ApiOptions`, the value the handler's normalisation already reads). Without it the member is never written.
- Page: `shapeSettings` (boolean state, false at first) turns true the first time a room read says `shape_settings === true` and stays true. Only then are the three controls rendered, the room query (`useAskRoom` and the ALREADY_WAITING `readAskRoom`) carries `depth_mode`, `scrutiny` and `answer_length`, and `buildNewDebateAskConfig` gets `depthMode`, `scrutiny` and `answerLength`.

Implementer note (pre-flight PF-C32): P2L Task 18 runs after P2c and edits `createDebate` and `submit()` again; its test step also runs `tests/render/debate-shape-new-controls.test.tsx` and `tests/unit/debate-shape-new-ask-wire.test.ts`, so do not rename these two files.

Implementer note (pre-flight PF-C34, the no-row page): with no shape row in force the OPTIONS panel is not literally today's. The "not sent" notice, Max tokens and both selects go in every case, so the panel keeps only Project 1's comment and the role-overrides line (`ndProvenance`). That is intended (Contract deviation 7); do not add placeholders back.

Implementer note (pre-flight PF-C34, Free-only mirror): the page mirrors only Free's limits (`fixedDepthAllowedFor`, the two selects disabled on Free). A sealed row that restricted a paid plan would still be normalised by the API without a word on the page. With the start values no paid plan is restricted, so do not add more UI rules here (Contract deviation 7).

Implementer note (pre-flight PF-C34, extra room reads): once the flag is on, the page reads `GET /v1/asks/room` once more when the flag turns on and again on every change of the three settings. Each read counts against the person's `askRoomReads` budget (the `admitOrRefuse(reply, "askRoomReads", …)` check at the top of the room handler in `apps/api/src/index.ts`); a 429 only hides the room notice. That is accepted (Contract deviation 9); do not debounce or cache here.

- [ ] **Step 1: Write the failing wire test**

Create `tests/unit/debate-shape-new-ask-wire.test.ts`:

```ts
import type { AskRequest, ContractClient } from "@debateai/contract";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- the root test compiler has no JSX mode; Vitest transpiles this TSX module.
import { buildNewDebateAskConfig, fixedDepthAllowedFor } from "../../apps/ui/app/new/defaults.js";
import { createDebate } from "../../apps/ui/lib/api.js";

/**
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): the page's three choices travel in the
 * ask, inside depth_params, as INTERFACE §2 names them. A config without them sends today's ask.
 */

const SUBMIT_TIME = new Date("2026-10-12T10:00:00.000Z");
const BASE = {
  riskTier: "standard", budgetTier: "low", decisionScope: "shape wire", asOf: "2026-10-12T09:00:00.000Z",
  depth: 2, asOfWasEdited: false, planTier: "premium"
} as const;

function capturingClient(): { client: ContractClient; asks: AskRequest[] } {
  const asks: AskRequest[] = [];
  const client = { submitAsk: async (ask: AskRequest) => { asks.push(ask); return { run_ref: "run:shape", status: "QUEUED" }; } };
  return { client: client as unknown as ContractClient, asks };
}

describe("debate shape P2c — the ask carries depth mode, scrutiny and answer length", () => {
  it("puts the chosen values in the config under snake-case keys, and nothing when none was chosen", () => {
    expect(buildNewDebateAskConfig({ ...BASE, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }, SUBMIT_TIME))
      .toMatchObject({ depth: 2, depth_mode: "fixed", scrutiny: "deep", answer_length: "detailed" });
    const plain = buildNewDebateAskConfig(BASE, SUBMIT_TIME);
    for (const key of ["depth_mode", "scrutiny", "answer_length"]) expect(plain).not.toHaveProperty(key);
  });

  it("puts depth mode, scrutiny and answer length into depth_params on the wire", async () => {
    const { client, asks } = capturingClient();
    const config = buildNewDebateAskConfig({ ...BASE, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "short" }, SUBMIT_TIME);
    await createDebate("Should the city fund the tram?", config, "test-token", client);
    expect(asks[0]?.depth_params).toEqual({ depth: 2, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "short" });
  });

  it("sends today's depth_params when the config carries none of them (older callers)", async () => {
    const { client, asks } = capturingClient();
    await createDebate("Should the city fund the tram?", buildNewDebateAskConfig(BASE, SUBMIT_TIME), "test-token", client);
    expect(asks[0]?.depth_params).toEqual({ depth: 2 });
  });

  it("refuses a value the contract does not offer, before any network call", async () => {
    const { client, asks } = capturingClient();
    const config = { ...buildNewDebateAskConfig(BASE, SUBMIT_TIME), scrutiny: "infinite" };
    await expect(createDebate("Should we?", config, "test-token", client)).rejects.toThrow("ASK_FIELD_REQUIRED: scrutiny");
    const retired = { ...buildNewDebateAskConfig(BASE, SUBMIT_TIME), depth_mode: "recommended" };
    await expect(createDebate("Should we?", retired, "test-token", client)).rejects.toThrow("ASK_FIELD_REQUIRED: depth_mode");
    expect(asks).toEqual([]);
  });

  it("offers Fixed only where the plan allows it (S6)", () => {
    expect(fixedDepthAllowedFor("free")).toBe(false);
    expect(fixedDepthAllowedFor("premium")).toBe(true);
  });
});
```

- [ ] **Step 1b: Write the failing room-flag test (contract and API)**

Create `tests/unit/debate-shape-room-flag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { AskRoomResponseSchema } from "@debateai/contract";
import { debateShapePolicyStartValues } from "@debateai/register";
import type { AskRoomReader } from "../../apps/api/src/ask-room.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * Debate shape P2c (Contract deviation 7; P2a final review row "P2c:85"): with no debateShapePolicy row in force, the
 * API drops depth_mode, scrutiny and answer_length without a word. So the room read says, with one optional member,
 * whether they are in force, and /new offers them only then. Without the row the member is never written: today's
 * room body, byte for byte.
 */

const CUSTOMER_FITS = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null } as const;
const INTERNAL_FITS = { ...CUSTOMER_FITS, funding: { kind: "INTERNAL", expires_at: "2026-10-14T00:00:00.000Z" } } as const;
const ROOM_URL = "/v1/asks/room?plan_tier=premium&composition_budget_tier=low&depth=2";

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" as const }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

async function roomBody(input: Readonly<{ policy: boolean; internal?: boolean }>): Promise<string> {
  const identity = testHttpIdentity("shape-room-flag");
  const askRoom: AskRoomReader = {
    readRoom: async () => ({
      room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null,
      ...(input.internal === true ? { funding: { kind: "INTERNAL" as const, expiresAt: new Date(INTERNAL_FITS.funding.expires_at) } } : {})
    })
  };
  const api = buildApi({
    application: fixtureApplication(), sessions: testSessionApplication([identity]), allowedOrigin: TEST_APP_ORIGIN, askRoom,
    ...(input.policy ? { debateShapePolicy: debateShapePolicyStartValues() } : {})
  });
  try {
    const response = await api.inject({ method: "GET", url: ROOM_URL, headers: testSessionHeaders(identity) });
    expect(response.statusCode).toBe(200);
    return response.body;
  } finally {
    await api.close();
  }
}

describe("debate shape P2c — the room says whether the shape settings are in force", () => {
  it.each([["customer", CUSTOMER_FITS], ["internal", INTERNAL_FITS]] as const)(
    "the %s room: the member absent parses, true parses, false is refused", (_kind, room) => {
      expect("shape_settings" in AskRoomResponseSchema.parse(room)).toBe(false);
      expect(AskRoomResponseSchema.parse({ ...room, shape_settings: true })).toMatchObject({ shape_settings: true });
      expect(AskRoomResponseSchema.safeParse({ ...room, shape_settings: false }).success).toBe(false);
    }
  );

  it("keeps today's room body when no shape row is in force", async () => {
    expect(await roomBody({ policy: false })).toBe(JSON.stringify(CUSTOMER_FITS));
    expect(await roomBody({ policy: false, internal: true })).toBe(JSON.stringify(INTERNAL_FITS));
  });

  it("says shape_settings: true, last, on the customer and the internal room when the row is in force", async () => {
    expect(await roomBody({ policy: true })).toBe(JSON.stringify({ ...CUSTOMER_FITS, shape_settings: true }));
    expect(await roomBody({ policy: true, internal: true })).toBe(JSON.stringify({ ...INTERNAL_FITS, shape_settings: true }));
  });
});
```

The internal room (with `funding`) is refused by the strict customer schema, so its cases prove that `InternalAskRoomResponseSchema` itself carries the member.

- [ ] **Step 2: Write the failing render test**

Create `tests/render/debate-shape-new-controls.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): /new's Depth mode, Depth of scrutiny and
 * Answer length are real choices sent with the ask. Fixed and the scrutiny levels are Premium's;
 * Answer length is every plan's. Nothing on the page still says "not sent", and Max tokens is gone.
 * The three are offered only once the room read says the settings are in force (`shape_settings`);
 * otherwise the API would drop them silently, so the page shows and sends none of them.
 */

const mocks = vi.hoisted(() => ({ createDebate: vi.fn(), push: vi.fn(), readSession: vi.fn(), getAskRoom: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("test-token")
}));
vi.mock("@/lib/api", () => ({
  createDebate: mocks.createDebate,
  contractClient: {
    readSession: mocks.readSession,
    getAskRoom: mocks.getAskRoom,
    readSensitiveDataConsent: async () => ({ status: "given" as const })
  }
}));

/** A room read from an API whose debate shape row is in force (Contract deviation 7). */
const SHAPE_ROOM = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null, shape_settings: true } as const;
/** The same room from an API with no row in force: the member is absent. */
const { shape_settings: _flag, ...PLAIN_ROOM } = SHAPE_ROOM;
const CHOICE_KEYS = ["depth_mode", "scrutiny", "answer_length"] as const;

import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import homeCatalog from "../../apps/ui/messages/en/home.json" with { type: "json" };
import chromeCatalog from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import newDebateCatalog from "../../apps/ui/messages/en/newDebate.json" with { type: "json" };

const words = newDebateCatalog as Record<string, string>;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("debate shape P2c — the /new controls", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.createDebate.mockReset().mockResolvedValue({ id: "run-shape" });
    mocks.push.mockReset();
    mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
    mocks.getAskRoom.mockReset().mockResolvedValue(SHAPE_ROOM);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  async function renderPage(): Promise<void> {
    await act(async () => root!.render(
      <NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog} />
    ));
    // Two settles: the first room read resolves, then the flag shows the controls and the room is read again.
    await settle();
    await settle();
  }

  /** Every room query the page sent, in order. */
  function roomQueries(): Record<string, unknown>[] {
    return mocks.getAskRoom.mock.calls.map((call) => call[0] as Record<string, unknown>);
  }

  async function click(selector: string): Promise<void> {
    await act(async () => document.querySelector<HTMLElement>(selector)!.click());
    await settle();
  }

  async function inputValue(selector: string, value: string): Promise<void> {
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
    await act(async () => {
      setter!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
  }

  async function selectValue(selector: string, value: string): Promise<void> {
    const field = document.querySelector<HTMLSelectElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    await act(async () => {
      setter!.call(field, value);
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  }

  async function submitForm(): Promise<void> {
    await act(async () => {
      document.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
  }

  it("opens on Adaptive, Standard scrutiny and a Standard answer, with no notice and no Max tokens", async () => {
    await renderPage();
    await click(".ndOptionsToggle");
    expect(document.querySelector<HTMLSelectElement>("#depthMode")?.value).toBe("adaptive");
    expect(document.querySelector<HTMLSelectElement>("#scrutinyDepth")?.value).toBe("standard");
    expect(document.querySelector("#answerLength-standard")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector(".ndLegacyNotice")).toBeNull();
    expect(document.querySelector("#maxTokens")).toBeNull();
    const panel = document.querySelector<HTMLElement>("#additionalRunOptions")!.textContent ?? "";
    expect(panel).not.toMatch(/not sent|Max tokens|Selection strategy|Manual|Recommended/);
  });

  it("offers Fixed only on Premium, and keeps Answer length open on Free (S6, S8)", async () => {
    await renderPage();
    await click(".ndOptionsToggle");
    const fixed = () => document.querySelector<HTMLOptionElement>('#depthMode option[value="fixed"]')!;
    expect([...document.querySelectorAll<HTMLOptionElement>("#depthMode option")].map((option) => option.value))
      .toEqual(["adaptive", "fixed"]);
    expect(fixed().disabled).toBe(true);
    expect(document.querySelector<HTMLSelectElement>("#depthMode")?.disabled).toBe(true);
    expect(document.querySelector<HTMLSelectElement>("#scrutinyDepth")?.disabled).toBe(true);
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-field="answerLength"]')].map((pill) => pill.disabled))
      .toEqual([false, false, false]);
    await click("#planTier-premium");
    expect(fixed().disabled).toBe(false);
    expect(document.querySelector<HTMLSelectElement>("#depthMode")?.disabled).toBe(false);
  });

  it("explains the chosen value under each control", async () => {
    await renderPage();
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    expect(document.querySelector("#depthMode-hint")?.textContent).toBe(words["newDebate.depthModeAdaptiveHelp"]);
    await selectValue("#depthMode", "fixed");
    expect(document.querySelector("#depthMode-hint")?.textContent).toBe(words["newDebate.depthModeFixedHelp"]);
    await selectValue("#scrutinyDepth", "exhaustive");
    expect(document.querySelector("#scrutinyDepth-hint")?.textContent).toBe(words["newDebate.scrutinyExhaustiveHelp"]);
    expect(document.querySelector("#answerLength-hint")?.textContent).toBe(words["newDebate.answerLengthHint"]);
    // Accessibility (pre-flight PF-C34): SegmentedRow names its radiogroup by `${field}-label` and points every
    // pill at `${field}-hint`, so a screen reader hears "Answer length" and the hint on each pill.
    const group = document.querySelector<HTMLElement>('[role="radiogroup"][aria-labelledby="answerLength-label"]');
    expect(group).not.toBeNull();
    expect(document.getElementById(group!.getAttribute("aria-labelledby")!)?.textContent).toBe(words["newDebate.answerLength"]);
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-field="answerLength"]')].map((pill) => pill.getAttribute("aria-describedby")))
      .toEqual(["answerLength-hint", "answerLength-hint", "answerLength-hint"]);
  });

  it("sends Premium's choices with the ask", async () => {
    await renderPage();
    await inputValue("#topic", "Should the city fund the tram extension?");
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    await selectValue("#depthMode", "fixed");
    await selectValue("#scrutinyDepth", "deep");
    await click("#answerLength-detailed");
    await submitForm();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({
      plan_tier: "premium", depth_mode: "fixed", scrutiny: "deep", answer_length: "detailed"
    });
  });

  it("sends Free's fixed gauges and the answer length Free chose, even after Premium choices", async () => {
    await renderPage();
    await inputValue("#topic", "Should the city fund the tram extension?");
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    await selectValue("#depthMode", "fixed");
    await selectValue("#scrutinyDepth", "exhaustive");
    await click("#answerLength-short");
    await click("#planTier-free");
    await submitForm();
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({
      plan_tier: "free", depth_mode: "adaptive", scrutiny: "standard", answer_length: "short"
    });
  });

  it.each([
    ["the room has no shape_settings (no row in force)", () => mocks.getAskRoom.mockResolvedValue(PLAIN_ROOM)],
    ["the room read fails", () => mocks.getAskRoom.mockRejectedValue(new Error("room unavailable in render test"))]
  ])("shows none of the three controls and sends none of them when the room does not say they are in force: %s", async (_state, arrange) => {
    arrange();
    await renderPage();
    await inputValue("#topic", "Should the city fund the tram extension?");
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    expect(document.querySelector("#depthMode")).toBeNull();
    expect(document.querySelector("#scrutinyDepth")).toBeNull();
    expect(document.querySelectorAll('[data-field="answerLength"]')).toHaveLength(0);
    // The retired controls are gone either way: they were never sent.
    expect(document.querySelector(".ndLegacyNotice")).toBeNull();
    expect(document.querySelector("#maxTokens")).toBeNull();
    await submitForm();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    for (const key of CHOICE_KEYS) expect(mocks.createDebate.mock.calls[0]?.[1]).not.toHaveProperty(key);
    // The room is read for today's query only.
    expect(roomQueries().length).toBeGreaterThan(0);
    for (const query of roomQueries()) for (const key of CHOICE_KEYS) expect(query).not.toHaveProperty(key);
  });

  it("reads the room with the three choices only once it says they are in force, and keeps them shown when a later read fails", async () => {
    await renderPage();
    expect(Object.keys(roomQueries()[0]!).sort()).toEqual(["composition_budget_tier", "depth", "plan_tier"]);
    expect(roomQueries().at(-1)).toMatchObject({ depth_mode: "adaptive", scrutiny: "standard", answer_length: "standard" });
    // A later read fails (advisory: null), or is refused: the flag already seen is kept.
    mocks.getAskRoom.mockRejectedValue(new Error("room unavailable in render test"));
    await click(".ndOptionsToggle");
    await click("#answerLength-detailed");
    expect(roomQueries().at(-1)).toMatchObject({ answer_length: "detailed" });
    expect(document.querySelector("#depthMode")).not.toBeNull();
    expect(document.querySelector("#answerLength-detailed")?.getAttribute("aria-checked")).toBe("true");
  });
});
```

- [ ] **Step 3: Run the three to see them fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-new-ask-wire.test.ts`
Expected: FAIL. `fixedDepthAllowedFor` is not a function, and `depth_mode` is missing.
Then run: `pnpm exec vitest run tests/unit/debate-shape-room-flag.test.ts`
Expected: 3 of 4 FAIL; `keeps today's room body` already passes (regression guard). The two `it.each` cases fail because `shape_settings: true` is refused by both strict room schemas (their "absent" and "false" lines would pass alone), and the in-force case fails because the room body has no `shape_settings`. (pre-flight PF-C34)
Then run: `pnpm exec vitest run tests/render/debate-shape-new-controls.test.tsx`
Expected: FAIL. The depth mode is `fixed`, `#answerLength-standard` does not exist, and no room query carries the three choices.

- [ ] **Step 4: `apps/ui/app/new/defaults.tsx`**

4a. Change line 1 to `import type { DepthParams, Deployment, PlanTier, Session } from "@debateai/contract";`.

4b. After `export const PROVISIONAL_COMPOSITION_BUDGET_DEFAULT = "low" as const;`, add:

```ts
/*
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): the three choices the ask carries in
 * depth_params, typed by the contract (P2a) so the page never restates them. The API normalises
 * each one per plan again; the page only keeps itself honest.
 */
export type DepthMode = NonNullable<DepthParams["depthMode"]>;
export type Scrutiny = NonNullable<DepthParams["scrutiny"]>;
export type AnswerLength = NonNullable<DepthParams["answerLength"]>;
export const DEPTH_MODES: readonly DepthMode[] = ["adaptive", "fixed"];
export const SCRUTINY_LEVELS: readonly Scrutiny[] = ["standard", "deep", "exhaustive"];
export const ANSWER_LENGTHS: readonly AnswerLength[] = ["short", "standard", "detailed"];

/** S6: Fixed is offered on Premium; Free is adaptive (its depth ceiling 2). */
export function fixedDepthAllowedFor(planTier: PlanTier): boolean {
  return planTier !== "free";
}
```

4c. In `NewDebateAskDefaults`, after `readonly modelStrength?: ModelStrength | null;`, add:

```ts
  /** Debate shape P2c: absent sends nothing, so the API's default applies and older callers keep working. */
  readonly depthMode?: DepthMode;
  readonly scrutiny?: Scrutiny;
  readonly answerLength?: AnswerLength;
```

4d. In `buildNewDebateAskConfig`'s returned object (about line 86; the file indents these lines by 4, 6, 6 and 2 spaces), replace (pre-flight PF-C30)

```ts
    ...(defaults.modelStrength === undefined || defaults.modelStrength === null
      ? {}
      : { model_strength: defaults.modelStrength })
  };
```

with

```ts
    ...(defaults.modelStrength === undefined || defaults.modelStrength === null
      ? {}
      : { model_strength: defaults.modelStrength }),
    ...(defaults.depthMode === undefined ? {} : { depth_mode: defaults.depthMode }),
    ...(defaults.scrutiny === undefined ? {} : { scrutiny: defaults.scrutiny }),
    ...(defaults.answerLength === undefined ? {} : { answer_length: defaults.answerLength })
  };
```

- [ ] **Step 5: `apps/ui/lib/api.ts` puts them on the wire**

5a. In the `@debateai/contract` import (lines 1–10), add `DepthParamsSchema,` after `createContractClient,` and `type DepthParams,` after `type ContractClient,`.

5b. After `optionalModelStrength`, add:

```ts
/**
 * Debate shape P2c (spec 2026-10-12 §3.2): depth mode, scrutiny and answer length ride beside
 * the depth in `depth_params`, each only when the page chose it. A missing one means the API's
 * default, so older callers keep working. The contract's own field schema decides what is
 * valid, so the page never restates the choices.
 */
function optionalDepthChoice<K extends "depthMode" | "scrutiny" | "answerLength">(
  config: AskConfig,
  configKey: "depth_mode" | "scrutiny" | "answer_length",
  key: K
): Partial<Pick<DepthParams, K>> {
  const value = config[configKey];
  if (value === undefined || value === null) return {};
  const parsed = DepthParamsSchema.shape[key].safeParse(value);
  if (!parsed.success || parsed.data === undefined) {
    throw new Error(`ASK_FIELD_REQUIRED: ${configKey} must be one of the offered choices when supplied.`);
  }
  return { [key]: parsed.data } as Partial<Pick<DepthParams, K>>;
}
```

5c. In `createDebate`, replace `    depth_params: { depth: requiredInteger(config, "depth", 0) },` with:

```ts
    depth_params: {
      depth: requiredInteger(config, "depth", 0),
      ...optionalDepthChoice(config, "depth_mode", "depthMode"),
      ...optionalDepthChoice(config, "scrutiny", "scrutiny"),
      ...optionalDepthChoice(config, "answer_length", "answerLength")
    },
```

- [ ] **Step 5b: The room says whether the settings are in force (contract and API)** (P2b in-force gate first)

5b-1. `packages/contract/src/index.ts`, `CustomerAskRoomResponseSchema`. The file has three `waits_for: WaitsForSchema.optional()` lines; use the one at about line 395, the last member of `CustomerAskRoomResponseSchema`, right after the "Final review Part 1b, Important 1" comment. (The one at about 295, in `AskAcceptedSchema`, and the one at about 327, in `AskAlreadyWaitingSchema`, are not it.) Its two lines `  waits_for: WaitsForSchema.optional()` and `}).strict().superRefine((answer, context) => {` are unique as a pair. After that member, add a member, so the object ends (pre-flight PF-C34):

```ts
  waits_for: WaitsForSchema.optional(),
  // Debate shape P2c (Contract deviation 7): present, and only ever `true`, when the deployment's
  // debateShapePolicy row is in force, so the /new page may offer depth mode, scrutiny and answer
  // length. Absent otherwise: the API would drop them, so the page offers none of them.
  shape_settings: z.literal(true).optional()
}).strict().superRefine((answer, context) => {
```

5b-2. Same file, `InternalAskRoomResponseSchema` (written on few lines): replace `funding:InternalFundingUsageSchema,waits_for:WaitsForSchema.optional()` with `funding:InternalFundingUsageSchema,waits_for:WaitsForSchema.optional(),shape_settings:z.literal(true).optional()`. Neither `superRefine` changes.

5b-3. `apps/api/src/index.ts`, the `GET /v1/asks/room` handler (find it by `"/v1/asks/room", routePolicy(`; it is the handler that calls `roomDepthParams(query.data)`). In its `reply.send(AskRoomResponseSchema.parse({ … }))`, replace the last member

```ts
      ...(answer.waitsFor === undefined ? {} : { waits_for: answer.waitsFor })
    }));
```

with

```ts
      ...(answer.waitsFor === undefined ? {} : { waits_for: answer.waitsFor }),
      // Debate shape P2c (Contract deviation 7): the same row the normalisation above reads. After P2b, main.ts hands
      // the API only an in-force row (`debateShapeInForce`); without one the member is never written, so the body is
      // today's byte for byte, and the page offers none of the three settings it would drop.
      ...(options.debateShapePolicy === undefined ? {} : { shape_settings: true as const })
    }));
```

5b-4. Regenerate the contract: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm run generate:contract` exits 0 (it rewrites the git-ignored `packages/contract/generated/*`).

- [ ] **Step 6: `apps/ui/app/new/NewDebatePageClient.tsx` (Project 1's version)**

6a. Delete the line `import { SCRUTINY_DEPTHS, ScrutinyDepth } from "@/lib/scrutinyDepth";`. In the `./defaults` import, add `ANSWER_LENGTHS,` `DEPTH_MODES,` `SCRUTINY_LEVELS,` `fixedDepthAllowedFor,` `type AnswerLength,` `type DepthMode,` `type Scrutiny,` beside the existing names. In the `@/lib/billing/room` import, add `type AskRoomQuery,` (it becomes `import { readAskRoom, useAskRoom, waitingRoomOf, type AskRoom, type AskRoomQuery } from "@/lib/billing/room";`).

6b. Replace

```ts
type AdaptiveDepthMode = "fixed" | "manual" | "recommended" | "adaptive";

const DEPTH_MODE_OPTIONS: Array<{ value: AdaptiveDepthMode; labelKey: string }> = [
  { value: "fixed", labelKey: "newDebate.fixed" },
  { value: "manual", labelKey: "newDebate.manual" },
  { value: "recommended", labelKey: "newDebate.recommended" },
  { value: "adaptive", labelKey: "newDebate.adaptive" }
];
```

with

```ts
/*
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): Depth mode, Depth of scrutiny and
 * Answer length are real choices sent with the ask. These tables hold each value's words.
 */
const DEPTH_MODE_WORDS: Readonly<Record<DepthMode, { label: string; help: string }>> = {
  adaptive: { label: "newDebate.adaptive", help: "newDebate.depthModeAdaptiveHelp" },
  fixed: { label: "newDebate.fixed", help: "newDebate.depthModeFixedHelp" }
};
const SCRUTINY_WORDS: Readonly<Record<Scrutiny, { label: string; help: string }>> = {
  standard: { label: "newDebate.scrutinyStandard", help: "newDebate.scrutinyStandardHelp" },
  deep: { label: "newDebate.scrutinyDeep", help: "newDebate.scrutinyDeepHelp" },
  exhaustive: { label: "newDebate.scrutinyExhaustive", help: "newDebate.scrutinyExhaustiveHelp" }
};
const ANSWER_LENGTH_WORDS: Readonly<Record<AnswerLength, string>> = {
  short: "newDebate.answerLengthShort",
  standard: "newDebate.answerLengthStandard",
  detailed: "newDebate.answerLengthDetailed"
};
```

6c. Replace the two state lines

```ts
  const [depthMode, setDepthMode] = useState<AdaptiveDepthMode>("fixed");
  const [scrutiny, setScrutiny] = useState<ScrutinyDepth>("standard");
```

with

```ts
  // S6: Adaptive by default; S7: Standard scrutiny by default.
  const [depthMode, setDepthMode] = useState<DepthMode>("adaptive");
  const [scrutiny, setScrutiny] = useState<Scrutiny>("standard");
```

Replace `  const [maxTokens, setMaxTokens] = useState(800);` with:

```ts
  // S8: Answer length is every plan's choice, so choosing Free never resets it.
  const [answerLength, setAnswerLength] = useState<AnswerLength>("standard");
```

6c-2. The room flag and the room query (Contract deviations 7 and 9). Replace

```ts
  const [room, setRoom] = useAskRoom(contractClient, {
    plan_tier: planTier, composition_budget_tier: budgetTier, depth
  });
```

with

```ts
  // Debate shape P2c (Contract deviation 7): true once a room read has said the deployment's shape row is
  // in force. Kept for the page's life, like the decided plan below: a later failed, refused or
  // ALREADY_WAITING read never hides the controls mid-edit. Without it the page offers and sends none of
  // the three settings, which the API would otherwise drop without a word.
  const [shapeSettings, setShapeSettings] = useState(false);
  // Contract deviation 9: the room is read for the ask this form would send, the three choices included
  // exactly when they are shown (and so sent).
  const roomQuery: AskRoomQuery = {
    plan_tier: planTier, composition_budget_tier: budgetTier, depth,
    ...(shapeSettings ? { depth_mode: depthMode, scrutiny, answer_length: answerLength } : {})
  };
  const [room, setRoom] = useAskRoom(contractClient, roomQuery);
  useEffect(() => {
    if (room?.shape_settings === true) setShapeSettings(true);
  }, [room]);
```

In `submit`'s ALREADY_WAITING branch, replace

```ts
        const fresh = await readAskRoom(contractClient, {
          plan_tier: planTier, composition_budget_tier: budgetTier, depth
        });
```

with

```ts
        const fresh = await readAskRoom(contractClient, roomQuery);
```

6d. In `choosePlanTier`, replace `    setDepthMode("fixed");` with `    setDepthMode("adaptive");`, and delete the line `    setMaxTokens(800);`.

6e. In the `buildNewDebateAskConfig({ … })` call in `submit`, replace

```ts
        depth,
        asOfWasEdited: false,
```

with

```ts
        depth,
        // Debate shape P2c (Contract deviation 7): sent only when the room says the settings are in force.
        ...(shapeSettings ? { depthMode, scrutiny, answerLength } : {}),
        asOfWasEdited: false,
```

6f. In the OPTIONS panel, replace everything between the line `            <div id="additionalRunOptions" className="ndCard ndLegacy">` and the line `              <p className="ndProvenance">`. That span is the DR-115 comment, the `ndLegacyNotice` paragraph, both `SelectRow`s, Project 1's comment and the `maxTokens` `SliderRow`. The notice and Max tokens go in every case (they were never sent); the three new controls render only with `shapeSettings`. Replace it with:

```tsx
              {/* Parallel calls (owner ruling 2026-10-12): no Branching width and no
                  Concurrency control here. How many calls run at once is an owner-only
                  register setting; how wide a claim branches is the algorithm's choice
                  (one support and one attack reply). */}
              {/* Debate shape P2c (Contract deviation 7): the three settings are offered only when the
                  room says they are in force; otherwise the API would drop them silently. */}
              {shapeSettings ? (
                <>
              <SelectRow
                id="depthMode"
                label={t(catalog, "newDebate.depthMode")}
                hint={t(catalog, DEPTH_MODE_WORDS[depthMode].help)}
                value={depthMode}
                disabled={planTier === "free"}
                onChange={(value) => setDepthMode(value as DepthMode)}
                options={DEPTH_MODES.map((mode) => ({
                  value: mode,
                  label: t(catalog, DEPTH_MODE_WORDS[mode].label),
                  // S6: Fixed is offered only where the plan allows it; the API normalises again.
                  disabled: mode === "fixed" && !fixedDepthAllowedFor(planTier)
                }))}
              />
              <SelectRow
                id="scrutinyDepth"
                label={t(catalog, "newDebate.scrutinyDepth")}
                hint={t(catalog, SCRUTINY_WORDS[scrutiny].help)}
                value={scrutiny}
                disabled={planTier === "free"}
                onChange={(value) => setScrutiny(value as Scrutiny)}
                options={SCRUTINY_LEVELS.map((level) => ({ value: level, label: t(catalog, SCRUTINY_WORDS[level].label) }))}
              />
              {/* S8: Answer length replaces Max tokens and is every plan's choice, Free's included. */}
              <SegmentedRow
                field="answerLength"
                label={t(catalog, "newDebate.answerLength")}
                hint={t(catalog, "newDebate.answerLengthHint")}
                options={ANSWER_LENGTHS.map((length) => ({ value: length, label: t(catalog, ANSWER_LENGTH_WORDS[length]) }))}
                value={answerLength}
                onChange={(value) => setAnswerLength(value as AnswerLength)}
              />
                </>
              ) : null}
```

Keep the JSX indentation the file's linter wants; the structure is: Project 1's comment, the P2c comment, then `{shapeSettings ? (<> … three controls … </>) : null}`.

6g. In `SelectRow`, change the `options` prop type (in its props type) to `options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;`. Change its `<option …>` line to:

```tsx
            <option key={option.value} value={option.value} disabled={option.disabled === true}>{option.label}</option>
```

- [ ] **Step 7: Delete the dead scrutiny presets and their guards**

7a. `git rm apps/ui/lib/scrutinyDepth.ts`. Its last importer was the /new page; `adaptiveExpansionBudgetsFor`, `scrutinyDepthOptions` and the `compose.scrutinyDepth.*` keys have had no users since V3.

7b. `apps/ui/messages/en/compose.json`: delete the six lines `"compose.scrutinyDepth.deep.hint"`, `"compose.scrutinyDepth.deep.label"`, `"compose.scrutinyDepth.exhaustive.hint"`, `"compose.scrutinyDepth.exhaustive.label"`, `"compose.scrutinyDepth.standard.hint"` and `"compose.scrutinyDepth.standard.label"`. The other 34 locales follow in Task 10.

7c. `apps/ui/lib/i18n/compose.test.mjs`:
- Remove `  "lib/scrutinyDepth.ts",` from `ownedFiles`.
- In `compose migration preserves budget and recommendation behavior guards`, delete these seven lines, from `  const depth = sources.get("lib/scrutinyDepth.ts");` through `  assert.match(depth, /return \{ max_rounds: \d+, max_per_node: \d+, max_per_debate: \d+ \};\s*\}/);` (the comment lines in between included).
- Rename the test to `compose migration preserves recommendation and adapter behavior guards`.

7d. `apps/ui/lib/i18n/catalog.test.mjs`: replace the whole `test("the Finnish model budget names LLM tokens rather than identifiers", …)` block with:

```js
test("no locale keeps the /new keys retired by debate shape P2c", () => {
  const retired = [
    "newDebate.legacyNotice", "newDebate.selectionStrategy", "newDebate.manual", "newDebate.recommended",
    "newDebate.maxTokens", "newDebate.maxTokensHint", "newDebate.scrutinyStandardHint",
    "newDebate.scrutinyDeepHint", "newDebate.scrutinyExhaustiveHint"
  ];
  for (const { code } of LOCALES) {
    const catalog = readCatalog(code, "newDebate");
    for (const key of retired) assert.equal(Object.hasOwn(catalog, key), false, `${code}/newDebate still has ${key}`);
  }
});
```

7e. `apps/ui/app/globals.css`: delete the `.ndLegacyNotice { … }` rule (8 lines, at about line 6837). Then replace the comment line just above `.ndLegacy {` (about line 6830), `/* The V2 knobs the V3 contract has no slot for are drawn as a dashed aside. */`, with `/* The OPTIONS panel is drawn as a dashed aside (M12 pins this frame). */`. Change no declaration of `.ndLegacy`: M12 in `tests/unit/tier01-style-contract.test.ts` pins them exactly. (pre-flight PF-C34)

Implementer note (pre-flight PF-C34, legacy look): the three real controls still sit in `.ndLegacy`, a dashed box at 0.88 opacity that looks like "old knobs". Keep the class name and its declarations (M12 pins them). Whether the panel should be restyled now that its controls are real is an owner question for the controller; do not restyle here.

- [ ] **Step 8: English words in `apps/ui/messages/en/newDebate.json`**

Replace every line from `  "newDebate.legacyNotice": …` through `  "newDebate.maxTokensHint": "Per generated argument",`, whatever the notice text now says, with:

```json
  "newDebate.depthMode": "Depth mode",
  "newDebate.depthModeAdaptiveHelp": "Goes deeper only where a point could change the answer.",
  "newDebate.depthModeFixedHelp": "Goes deeper under every point, whether or not it could change the answer.",
  "newDebate.fixed": "Fixed",
  "newDebate.adaptive": "Adaptive",
  "newDebate.scrutinyDepth": "Depth of scrutiny",
  "newDebate.scrutinyStandard": "Standard",
  "newDebate.scrutinyStandardHelp": "The usual checks on every point.",
  "newDebate.scrutinyDeep": "Deep",
  "newDebate.scrutinyDeepHelp": "Extra rounds on the points most in doubt.",
  "newDebate.scrutinyExhaustive": "Exhaustive",
  "newDebate.scrutinyExhaustiveHelp": "The most extra rounds, on more of the points in doubt.",
  "newDebate.answerLength": "Answer length",
  "newDebate.answerLengthHint": "About 300, 700 or 1,500 words: a target, not a hard limit.",
  "newDebate.answerLengthShort": "Short",
  "newDebate.answerLengthStandard": "Standard",
  "newDebate.answerLengthDetailed": "Detailed",
  "newDebate.languageCheck.title": "Your question's language",
  "newDebate.languageCheck.body": "Your question mixes {languages}. The AIs debate best when the whole question is in one language, so we suggest this version in {language}:",
  "newDebate.languageCheck.use": "Use this version",
  "newDebate.languageCheck.keep": "Keep my wording",
  "newDebate.languageCheck.edit": "Edit",
  "newDebate.languageCheck.proposalLabel": "Suggested version",
```

That span has nine keys removed (`legacyNotice`, `selectionStrategy`, `manual`, `recommended`, the three `scrutiny*Hint` and the two `maxTokens*`). Sixteen keys are new: ten for the three controls, and the six `newDebate.languageCheck.*` keys of P2L Task 18 (amendment P2c-1; English text exactly as in P2L Task 18's table). `depthMode`, `fixed`, `adaptive`, `scrutinyDepth`, `scrutinyStandard`, `scrutinyDeep` and `scrutinyExhaustive` keep their values.

The six `languageCheck` keys have no reader until P2L Task 18 (the one-language pop-up), which runs after Task 10 and reuses them. The `newDebate` catalogue has no unused-key test (`catalog.test.mjs` checks only key parity and placeholders), so they are safe to land first. Do not write any code that reads them here.

Implementer note (pre-flight PF-C34, Free hints): on Free, the neighbouring locked rows end their hint with "· fixed by the Free plan" (`newDebate.riskFreeHint`, `newDebate.budgetFreeHint`, `newDebate.modelStrengthFreeHint`), while the locked Depth mode and Depth of scrutiny keep their per-value help. Whether they should say so too is an owner question for the controller; ship the hints exactly as above.

- [ ] **Step 9: Update `tests/render/tier01-new-plan-tier.test.tsx` (Project 1's version)**

9h (do this one first). The file's room read must say the shape settings are in force, or the three controls this step counts are not rendered (Contract deviation 7). Today its `contractClient` mock has no `getAskRoom`, so every room read fails and is `null`.
- In `vi.hoisted(() => ({ … }))`, add `getAskRoom: vi.fn(),` after `readSession: vi.fn(),`.
- In the `vi.mock("@/lib/api", …)` factory, change the `contractClient` line to `contractClient: { readSession: mocks.readSession, getAskRoom: mocks.getAskRoom, readSensitiveDataConsent: async () => ({ status: "given" as const }) }`.
- In `beforeEach`, after `mocks.readSession.mockReset()…;`, add:

```ts
    // Debate shape P2c (Contract deviation 7): a deployment whose shape row is in force, so the three settings show.
    mocks.getAskRoom.mockReset().mockResolvedValue({
      room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null, shape_settings: true
    });
```

- In `renderPage`, after its `await settle();`, add a second `await settle();` (the first room read resolves, then the controls render and the room is read again).
- `tests/render/b10-room-notice.test.tsx` is NOT changed: its rooms carry no `shape_settings`, so its exact room-query pins (`toHaveBeenCalledWith({ plan_tier, composition_budget_tier, depth })`) stay true.

9a. S01-27: change the title to `"S01-27 R4 locks all twelve controls while Free is chosen, when %s"`. Delete `      "maxTokens"` from `lockedIds`, and remove the trailing comma it leaves after `"scrutinyDepth"`. Change `.toHaveLength(13)` to `.toHaveLength(12)` and `Array.from({ length: 13 }, …)` to `Array.from({ length: 12 }, …)`. Before `expect(document.querySelector('#modelStrength-hint')…`, add:

```ts
    // Debate shape P2c, S8: Answer length is every plan's choice, so Free leaves it open.
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-field="answerLength"]')].every((pill) => !pill.disabled)).toBe(true);
```

9b. S01-28: replace `    ]).toEqual([9, 2, 0, 2]);` with

```ts
    // Debate shape P2c: Max tokens is gone (sliders 2 -> 1); Answer length's pills are open on Free.
    ]).toEqual([9, 1, 0, 2]);
```

9c. S01-29: in its `lockedIds`, change `"depthMode", "scrutinyDepth", "maxTokens"` to `"depthMode", "scrutinyDepth"`.

9d. S01-30: change the title to `"S01-30 R5 / M12 keeps the OPTIONS toggle operable in Free, with no 'not sent' notice"`. Replace

```ts
    expect(document.querySelector('.ndLegacyNotice')?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Depth mode, depth of scrutiny and max tokens are not sent yet: the new engine does not use them."
    );
```

(whatever the notice text) with

```ts
    // Debate shape P2c: the three controls are sent, so the "not sent" notice is gone.
    expect(document.querySelector('.ndLegacyNotice')).toBeNull();
    expect(document.querySelector('#additionalRunOptions')?.textContent).not.toMatch(/not sent/i);
```

9e. In Project 1's `offers no Concurrency or Branching width control in %s`, replace

```ts
    expect([...panel.querySelectorAll('.ndSlider')].map((slider) => slider.id)).toEqual(["maxTokens"]);
```

with

```ts
    // Debate shape P2c: Max tokens became the Answer length pills.
    expect([...panel.querySelectorAll('.ndSlider')].map((slider) => slider.id)).toEqual([]);
    expect(document.querySelector('#answerLength-standard')).not.toBeNull();
```

9f. S01-34:
- Replace `    await selectValue('#depthMode', "adaptive");` with `    await selectValue('#depthMode', "fixed");`.
- Replace `    await inputValue('#maxTokens', "4000");` with `    await click('#answerLength-detailed');`.
- Replace `    expect(document.querySelector<HTMLSelectElement>('#depthMode')?.value).toBe("fixed");` with `    expect(document.querySelector<HTMLSelectElement>('#depthMode')?.value).toBe("adaptive");`.
- Replace the slider grid

```ts
    const sliderGrid = ["treeDepth", "maxTokens"].map((id) => {
```

with `    const sliderGrid = ["treeDepth"].map((id) => {`, and its expected array

```ts
    expect(sliderGrid).toEqual([
      { id: "treeDepth", min: "1", max: "5", step: "1", value: "2" },
      { id: "maxTokens", min: "128", max: "4000", step: "32", value: "800" }
    ]);
```

with

```ts
    expect(sliderGrid).toEqual([
      { id: "treeDepth", min: "1", max: "5", step: "1", value: "2" }
    ]);
    // S8: the answer length the asker chose survives the switch to Free.
    expect(document.querySelector('#answerLength-detailed')?.getAttribute("aria-checked")).toBe("true");
```

- Change the final `.toHaveLength(13);` to `.toHaveLength(12);`.

9g. S01-36: in `gaugeIds`, replace `      "maxTokens"` with `      "answerLength-short",\n      "answerLength-standard",\n      "answerLength-detailed"`.

- [ ] **Step 10: Run the tests (one at a time)**

- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/debate-shape-new-ask-wire.test.ts` → PASS (5).
- `pnpm exec vitest run tests/unit/debate-shape-room-flag.test.ts` → PASS (4).
- `pnpm exec vitest run tests/unit/debate-shape-submit.test.ts` → PASS (P2a's room-read cases, unchanged).
- `pnpm exec vitest run tests/unit/b7a-room-read.test.ts` → PASS.
- `pnpm exec vitest run tests/unit/b7a-contract-client.test.ts` → PASS.
- `pnpm exec vitest run tests/render/debate-shape-new-controls.test.tsx` → PASS (8).
- `pnpm exec vitest run tests/render/b10-room-notice.test.tsx` → PASS, unchanged.
- `pnpm exec vitest run tests/render/tier01-new-plan-tier.test.tsx` → PASS.
- `pnpm exec vitest run tests/unit/tier01-ask-wire.test.ts` → PASS.
- `pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx` → PASS.
- `pnpm exec vitest run tests/unit/v2ui-pages.test.ts` → PASS.
- `pnpm exec vitest run tests/unit/tier01-style-contract.test.ts` → PASS.
- `cd apps/ui && node --import tsx --test lib/i18n/compose.test.mjs` → expected: "every compose key used … exists in English" and the guards PASS; the 35-locale compose test FAILS until Task 10.
- `cd apps/ui && node --import tsx --test lib/i18n/catalog.test.mjs` → FAILS on the 34 locales until Task 10 (expected).
- Sweep for leftovers: `grep -rn "scrutinyDepth\.ts\|SCRUTINY_DEPTHS\|adaptiveExpansionBudgetsFor\|AdaptiveDepthMode\|setMaxTokens\|newDebate.legacyNotice\|newDebate.maxTokens\|newDebate.selectionStrategy" apps/ui tests --include='*.ts' --include='*.tsx' --include='*.mjs' | grep -v node_modules`. The only hits allowed are the retired-key list in `catalog.test.mjs` and the "not sent" / retired-id assertions in tests.
- The shipped-file list (pre-flight PF-C1). Step 7a deleted `apps/ui/lib/scrutinyDepth.ts`, which the manifest lists; this task adds no shipped file. Back in the engine folder (`cd "$(git rev-parse --show-toplevel)/dialectical-engine"`), run `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`, then `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` again without the variable → PASS. `git diff tests/support/shipped-corpus.manifest.txt` must show exactly one line removed, `apps/ui/lib/scrutinyDepth.ts`, and nothing added. (s1-1 also calls the live `createDebate`, so it guards Step 5 too.)
- The UI typecheck (pre-flight PF-C2): the root `tsconfig.json` excludes `apps/ui`, so the root typecheck never sees this task's UI code. Check `memory_pressure | tail -1` (free memory at least 40%), then run alone, from the engine folder: `pnpm --dir apps/ui exec tsc --noEmit -p tsconfig.json` → exit 0.

- [ ] **Step 11: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add packages/contract/src/index.ts apps/api/src/index.ts tests/unit/debate-shape-room-flag.test.ts \
  apps/ui/app/new/NewDebatePageClient.tsx apps/ui/app/new/defaults.tsx apps/ui/lib/api.ts apps/ui/lib/i18n/compose.test.mjs \
  apps/ui/lib/i18n/catalog.test.mjs apps/ui/messages/en/newDebate.json apps/ui/messages/en/compose.json apps/ui/app/globals.css \
  tests/render/tier01-new-plan-tier.test.tsx tests/render/debate-shape-new-controls.test.tsx tests/unit/debate-shape-new-ask-wire.test.ts \
  tests/support/shipped-corpus.manifest.txt
git commit -m "$(cat <<'EOF'
New debate: depth mode, scrutiny and answer length are real (debate shape P2c)

The three /new controls are sent in depth_params (Adaptive and Standard by
default; Fixed and the scrutiny levels on Premium; Answer length Short /
Standard / Detailed for every plan, replacing Max tokens), and are offered
only when the room read says the deployment's shape row is in force
(shape_settings: true; absent, the room body is today's and the ask carries
none of them, so nothing is dropped silently). The room is read with the
three choices whenever they are shown. The "not sent" notice and the dead
scrutiny presets are gone. English words only, including the six
languageCheck keys P2L's pop-up will read; the other 34 locales follow in
the translation task.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

The `git rm` of Step 7a is already staged and goes into this commit, together with the regenerated `tests/support/shipped-corpus.manifest.txt` of Step 10 (pre-flight PF-C1).

- [ ] **Step 12: Draft the next version of the help bot's article about these controls (owner-gated; nothing shipped changes)** (pre-flight PF-C31, controller ruling C-ARTICLE)

Why. The help bot's article `unsupported-capabilities` (`packages/support-kb/content/unsupported-capabilities.en.md` and `.ro.md`) and its two recovery rows in `packages/support-kb/recovery/components.json` (`modelProjection` and `fallback`, en and ro) say that depth mode, scrutiny depth, branching width, concurrency and max-token controls "are displayed as legacy options but are not sent". Once the shape row is switched on, that is wrong: the three controls are sent. Branching width and Concurrency already left with Project 1, and Max tokens leaves with this task. While the shape row is absent the article stays as it is (the three are not sent then). The new version must be reviewed and published by the owner BEFORE the shape is switched on.

How the help bot's texts are protected (read only; you change none of it):
- `packages/support-kb/reviews/manifest.json` holds one review record per article file (`articles`: `sha256` of the exact file bytes, plus who reviewed) and one per recovery row (`recovery.components`: `articleSha256`, `modelProjectionSha256`, `fallbackSha256`, plus who reviewed), and `recovery.componentFileSha256`, the sha256 of the whole `components.json`. For this article today, the two en records are SOL (editorial) reviews and the two ro records are the owner's S05 signature (`reviewedBy: "OWNER"`, `ratifiedBy: "V"`).
- `loadHelpCorpus` (`packages/support-kb/src/index.ts`; `apps/api/src/main.ts` calls it at start with `requireReviewedRecovery: true`) admits an article pair only when both files' hashes match their records. If an article's bytes change without a matching record, the pair drops out, the recovery file no longer matches the shipped keys, and the load throws `SUPPORT_KB_RECOVERY_COMPONENT_INVALID`: the API does not start.
- An OWNER record needs the owner's own signature: `reviewerSession`, `reviewedOn`, `ratifiedBy: "V"`, `ratifiedOn` and `evidence`, a committed `docs/...` sign-off file that git tracks (the loader and `tests/unit/support-kb.test.ts` both check it).
- `tests/unit/support-recovery-attestation.test.ts` pins every row's three hashes (`EXPECTED`), the `componentFileSha256`, each row's review record and the counts. `tests/unit/support-context.test.ts` (about line 115) pins the production corpus's `kbVersion`, which folds in every hash and review line.

Hard rules for this step:
- Do not edit any file under `packages/support-kb/`, nor `tests/unit/support-recovery-attestation.test.ts` or `tests/unit/support-context.test.ts`.
- Never write a review record, a sign-off file, a `reviewerSession`, a `ratifiedBy: "V"`, or any sentence saying the owner reviewed or approved. Only the owner signs.

12a. Create the owner packet (the owner explicitly requires and approves this Markdown packet). It is local and git-excluded; do not commit it: `"$(git rev-parse --show-toplevel)/.superpowers/sdd/2026-10-12-debate-shape-phase2c/support-article-draft.md"`.

12b. In the packet, for each of the six texts (article en, article ro, recovery en `modelProjection`, recovery en `fallback`, recovery ro `modelProjection`, recovery ro `fallback`), put: the current text, copied from the file; the draft; and the changed words in the form `[-removed-]{+added+}`, as `docs/missions/cookie-compliance/OWNER-SIGNOFF-S05-support-kb.md` shows them.

The English drafts, word for word. In each text only the second sentence is replaced (by option 1 below: two sentences in the article and in `modelProjection`, one shorter sentence in `fallback`); every other sentence stays byte for byte:

Article `unsupported-capabilities.en.md`, body:

```text
The current V3 product has no node-regeneration resource, scoring-feedback resource, settings-write resource, or adaptive-depth approval resource. On `/new`, the Branching width, Concurrency and Max tokens controls are gone. Depth mode, Depth of scrutiny and Answer length appear under OPTIONS only when this site has switched them on, and then they are sent with the question: Fixed depth and the Deep and Exhaustive scrutiny levels are for paid plans, and Answer length is open on every plan. Challenge currently changes local page state rather than starting a durable rebuttal. Generation history can fail to load and then appear empty. Support cannot turn these limitations into working actions.
```

Article front matter (en and ro alike): replace the source line `  - apps/ui/app/new/page.tsx:335` with `  - apps/ui/app/new/NewDebatePageClient.tsx:N`, where N is the line of `{shapeSettings ? (` in this task's commit, and set `verified_against` to this task's commit (8-character short hash). `title`, `status`, the other sources, `ratified_by: ""` and `ratified_on: ""` stay as they are.

Recovery row en, `modelProjection`:

```text
The current product has no resources for node regeneration, scoring feedback, settings writes, or adaptive-depth approval. On /new, the Branching width, Concurrency and Max tokens controls are gone. Depth mode, Depth of scrutiny and Answer length appear under OPTIONS only when the site has switched them on, and are then sent with the question; Fixed depth and the Deep and Exhaustive scrutiny levels are for paid plans, and Answer length is open on every plan. Challenge changes local page state instead of starting a durable rebuttal. Generation history can fail to load and appear empty. Support cannot turn these limitations into working actions.
```

Recovery row en, `fallback`:

```text
The current product cannot regenerate a node, submit scoring feedback, write settings, or approve adaptive depth. On /new, Depth mode, Depth of scrutiny and Answer length are sent with the question when the site shows them, and the old width, concurrency and token controls are gone. Challenge changes only local page state, and generation history can fail to load and appear empty. Support cannot turn these limits into working actions.
```

The three phrasings of the changed sentence, for the owner to pick from (option 1 is the one drafted above):
1. "On `/new`, the Branching width, Concurrency and Max tokens controls are gone. Depth mode, Depth of scrutiny and Answer length appear under OPTIONS only when this site has switched them on, and then they are sent with the question: Fixed depth and the Deep and Exhaustive scrutiny levels are for paid plans, and Answer length is open on every plan."
2. "Depth mode, Depth of scrutiny and Answer length on `/new` are real settings sent with the question, but only where this site has switched them on; otherwise they are not shown. Free keeps Adaptive depth and Standard scrutiny and can still pick the answer length. Branching width, Concurrency and Max tokens are no longer offered."
3. "`/new` no longer offers Branching width, Concurrency or Max tokens. When this site shows Depth mode, Depth of scrutiny and Answer length under OPTIONS, what you pick there is sent with your question (Fixed depth and deeper scrutiny need a paid plan); when it does not show them, the debate uses the usual settings."

All three are true both before and after the shape is switched on, so the owner can publish the new version first.

The Romanian drafts: write them yourself, in the style and the register of the current ro texts, changing only the same sentence. Use the labels the Romanian page shows: "Mod de profunzime" (`newDebate.depthMode`), "Profunzimea examinării" (`newDebate.scrutinyDepth`), "Fix", "Aprofundat", "Exhaustiv", "OPȚIUNI" (`newDebate.options`), "Gratuit", and "planurile plătite" for paid plans (the sold plans are Free, Plus, Pro and Max, and with the start values every paid plan may pick Fixed, Deep and Exhaustive; `DEBATE_SHAPE_PLAN_KEYS` in `packages/register/src/debate-shape-policy.ts`). For Answer length use the ro value of `newDebate.answerLength`; if Task 10 has not yet written it, propose one and mark it "[must equal ro newDebate.answerLength after Task 10]". Keep the control names unquoted, as the current ro article does.

12c. End the packet with the owner's two questions: which phrasing (1, 2 or 3), and "signed" or the changes wanted, for the six texts as shown.

12d. Report to the controller: "Support article draft ready for owner review: the owner reviews and publishes the updated article BEFORE the shape is switched on." The step ends here. Publication is not part of this plan's tasks.

For the record, what publication changes (done later, in one commit, from the owner's own session, after the owner has answered "signed"; listed so the owner knows the cost):
1. `packages/support-kb/content/unsupported-capabilities.en.md` and `.ro.md`: the signed bytes.
2. `packages/support-kb/recovery/components.json`: the two `unsupported-capabilities` rows: `articleSha256` (sha256 of the new file bytes), `modelProjection`, `fallback`.
3. `packages/support-kb/reviews/manifest.json`: the two `articles` records (new `sha256`; both now `reviewedBy: "OWNER"` with the owner's `reviewerSession`, `reviewedOn`, `evidence`, `ratifiedBy: "V"`, `ratifiedOn`, so the en record moves from SOL to OWNER); the two `recovery.components` rows (new `articleSha256`, `modelProjectionSha256`, `fallbackSha256`, the same OWNER fields); `recovery.componentFileSha256` (sha256 of the new `components.json` bytes).
4. A new committed sign-off file under `docs/` (for example `docs/missions/debate-shape/OWNER-SIGNOFF-unsupported-capabilities.md`, in the S05 file's form), named as `evidence` by the four records.
5. `tests/unit/support-recovery-attestation.test.ts`: the two `EXPECTED` rows' hashes; the `componentFileSha256` pin; a new OWNER review constant for both rows (remove `"unsupported-capabilities.ro"` from `S05_KEYS`); `recoveryOwnerRatifiedCount` 4 → 5, because both rows are then owner-signed. `previewReviewedCount` (17), `ownerRatifiedCount` (6, front matter `ratified_by` stays "") and the 34 article records do not change.
6. `tests/unit/support-context.test.ts`: the `kbVersion` pin, with a dated comment line like its neighbours.
7. The API reads the corpus at start, so the hosted API's restart publishes it. Only after that is the shape row switched on.

---

## Task 9: The phone hand-off draft learns the new controls

**Gates:** the Project 1 gate and the P2a gate. This task rewrites Project 1's version of the module and of its test.

**Files:**
- Modify: `apps/ui/lib/phoneCompletionDraft.ts`
- Modify: `tests/unit/phone-completion-draft-legacy.test.ts` (Project 1's file; rewritten here)

**Interfaces:**
- `PhoneDraftForm` uses `depthMode: 'fixed' | 'adaptive'` and `answerLength: 'short' | 'standard' | 'detailed'`. `maxTokens` is gone.
- The draft stays `version: 1`. It reads two older shapes and never writes them:
  - Project 1's shape (with `maxTokens`);
  - the shape from before parallel calls (with `maxTokens`, `branching` and `concurrency`).
- A submitted config may carry `depth_mode`, `scrutiny` and `answer_length`. An older one without them stays valid.
- `SubmittedPhoneDraft.query` (the room query) may carry the same three (`depth_mode?`, `scrutiny?`, `answer_length?`), as /new now sends them (Contract deviation 9). The check compares them with the config's when present, as it already compares `plan_tier`, `composition_budget_tier` and `depth`. The page sends them in both or in neither (both follow the one room flag), so a draft with the three on one side only is refused. An older draft with none on either side stays valid.

Implementer note (pre-flight PF-C35): Project 1's `tests/unit/phone-completion-draft-legacy.test.ts` has 6 cases today (not 7, as Amendment 20 once said); the rewritten file has 8, so Step 4's "PASS (8)" is right. All the code anchors in `apps/ui/lib/phoneCompletionDraft.ts` match, and no caller depends on the changed types.

- [ ] **Step 1: Rewrite the test**

Replace the whole of `tests/unit/phone-completion-draft-legacy.test.ts` with:

```ts
// @vitest-environment jsdom
/**
 * The phone-completion draft across the /new page's changes:
 * - Parallel calls (owner ruling 2026-10-12) removed Concurrency and Branching width.
 * - Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8) replaced Max tokens with Answer length
 *   and kept two of Depth mode's four values.
 * A draft saved in either older shape keeps parsing in today's shape: the retired values are
 * dropped, Answer length reads as Standard, and a retired depth mode reads as Adaptive. It is
 * never written again in an old shape.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PHONE_COMPLETION_DRAFT_KEY,
  PHONE_COMPLETION_DRAFT_MS,
  acknowledgePhoneDraftUpdate,
  clearPhoneCompletionDraft,
  phoneCompletionDraftForOwner,
  savePhoneCompletionDraft,
  type PhoneDraftForm,
  type SubmittedPhoneDraft
} from "../../apps/ui/lib/phoneCompletionDraft.js";

const OWNER = "asker:draft-owner";
const client = { readSession: async () => ({ asker_id: OWNER }) } as never;

const form: PhoneDraftForm = {
  topic: "Should cities replace private cars with shared transit?",
  planTier: "premium",
  optionsOpen: true,
  depthMode: "fixed",
  scrutiny: "deep",
  depth: 2,
  answerLength: "detailed",
  riskTier: "standard",
  riskTierWasEdited: false,
  budgetTier: "low",
  decisionScope: "City transport policy",
  asOf: "2026-10-12T09:30:00.000Z"
};

/** The form as Project 1 (parallel calls) saved it: Max tokens, no Answer length. */
const { answerLength: _dropped, ...withoutAnswerLength } = form;
const parallelCallsForm = { ...withoutAnswerLength, maxTokens: 800 };
/** ... and as the page saved it before parallel calls: Branching width and Concurrency too. */
const oldestForm = { ...parallelCallsForm, branching: 2, concurrency: 3 };

const legacyConfig = {
  plan_tier: "premium",
  risk_tier: "standard",
  tier_source: "MACHINE_DEFAULT",
  tier_provenance_ref: "machine:plan-tier-free",
  composition_budget_tier: "low",
  depth: 2,
  decision_scope: "City transport policy",
  as_of: "2026-10-12T09:30:00.000Z",
  steering_presets: [],
  steering_annotations: []
};

const choices = { depth_mode: "fixed", scrutiny: "deep", answer_length: "detailed" } as const;
/** The room query as the page sent it before debate shape P2c (and still sends it with no shape row in force). */
const legacyQuery = { plan_tier: "premium", composition_budget_tier: "low", depth: 2 } as const;

const submitted: SubmittedPhoneDraft = {
  topic: form.topic,
  config: { ...legacyConfig, ...choices },
  query: { ...legacyQuery, ...choices }
};

function storeRecord(recordForm: Record<string, unknown>, recordSubmitted: SubmittedPhoneDraft = submitted): string {
  const now = Date.now();
  const id = "0b7a6c1e-2f3d-4a5b-8c9d-0e1f2a3b4c5d";
  window.sessionStorage.setItem(PHONE_COMPLETION_DRAFT_KEY, JSON.stringify({
    version: 1, id, owner: OWNER, created_at: now, expires_at: now + PHONE_COMPLETION_DRAFT_MS,
    phase: "phone-required", form: recordForm, submitted: recordSubmitted
  }));
  return id;
}

function storedForm(): Record<string, unknown> {
  const text = window.sessionStorage.getItem(PHONE_COMPLETION_DRAFT_KEY);
  expect(text, "no draft was stored").not.toBeNull();
  return (JSON.parse(text!) as { form: Record<string, unknown> }).form;
}

describe("phone-completion draft with Answer length and the two depth modes", () => {
  beforeEach(() => clearPhoneCompletionDraft());
  afterEach(() => clearPhoneCompletionDraft());

  it("parses a draft in today's shape", () => {
    const id = storeRecord({ ...form });
    expect(phoneCompletionDraftForOwner(OWNER)?.id).toBe(id);
    expect(phoneCompletionDraftForOwner(OWNER)?.form).toEqual(form);
  });

  it("reads Project 1's shape: Max tokens dropped, Answer length Standard", () => {
    storeRecord(parallelCallsForm);
    expect(phoneCompletionDraftForOwner(OWNER)?.form).toEqual({ ...form, answerLength: "standard" });
  });

  it("reads the oldest shape, and a retired depth mode as Adaptive", () => {
    storeRecord({ ...oldestForm, depthMode: "recommended" });
    const draft = phoneCompletionDraftForOwner(OWNER);
    expect(draft?.form).toEqual({ ...form, depthMode: "adaptive", answerLength: "standard" });
    for (const retired of ["maxTokens", "branching", "concurrency"]) expect(draft?.form).not.toHaveProperty(retired);
  });

  it("rewrites an old draft in today's shape when it moves on", () => {
    const id = storeRecord({ ...oldestForm, depthMode: "manual" });
    expect(acknowledgePhoneDraftUpdate(id, OWNER)).toBe(true);
    expect(storedForm()).toEqual({ ...form, depthMode: "adaptive", answerLength: "standard" });
  });

  it("still refuses a shape that is none of the three", () => {
    storeRecord({ ...parallelCallsForm, branching: 2 });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    storeRecord({ ...form, depthMode: "manual" });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    storeRecord({ ...form, answerLength: "epic" });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
  });

  it("accepts a submitted ask with or without the three choices, and refuses an unknown one", () => {
    storeRecord({ ...form }, { ...submitted, config: legacyConfig, query: legacyQuery });
    expect(phoneCompletionDraftForOwner(OWNER)).not.toBeNull();
    storeRecord({ ...form }, { ...submitted, config: { ...submitted.config, scrutiny: "infinite" } });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
  });

  it("compares the room query's three choices with the ask's, as it compares the depth", () => {
    storeRecord({ ...form }, submitted);
    expect(phoneCompletionDraftForOwner(OWNER)).not.toBeNull();
    // A room query whose choice differs from the ask's is refused, like a differing depth.
    storeRecord({ ...form }, { ...submitted, query: { ...submitted.query, scrutiny: "exhaustive" } });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    // The three on one side only: the page sends them in both or in neither.
    storeRecord({ ...form }, { ...submitted, query: legacyQuery });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    storeRecord({ ...form }, { ...submitted, config: legacyConfig });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
    // A partial set is not a shape the page sends.
    const { answer_length: _length, ...twoChoices } = choices;
    storeRecord({ ...form }, { ...submitted, query: { ...legacyQuery, ...twoChoices } });
    expect(phoneCompletionDraftForOwner(OWNER)).toBeNull();
  });

  it("saves a new draft in today's shape, and refuses to save an old one", async () => {
    expect(await savePhoneCompletionDraft(client, () => form, submitted, () => true)).toBe(true);
    expect(storedForm()).toEqual(form);
    const legacy = parallelCallsForm as unknown as PhoneDraftForm;
    await expect(savePhoneCompletionDraft(client, () => legacy, submitted, () => true)).rejects.toThrow("PHONE_DRAFT_INVALID");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/phone-completion-draft-legacy.test.ts`
Expected: FAIL. Today's shape is refused because `answerLength` is an unknown key.

- [ ] **Step 3: Edit `apps/ui/lib/phoneCompletionDraft.ts`**

3a. Replace the `PhoneDraftForm` type with:

```ts
export type PhoneDraftForm = {
    topic: string; planTier: 'free' | 'premium'; optionsOpen: boolean;
    depthMode: 'fixed' | 'adaptive'; scrutiny: 'standard' | 'deep' | 'exhaustive';
    depth: number; answerLength: 'short' | 'standard' | 'detailed';
    riskTier: string; riskTierWasEdited: boolean; budgetTier: 'low' | 'medium' | 'high';
    decisionScope: string; asOf: string;
};
```

Then replace the `SubmittedPhoneDraft` type with (the room query may carry the three choices, Contract deviation 9):

```ts
export type SubmittedPhoneDraft = { topic: string; config: Record<string, unknown>; query: {
    plan_tier: 'free' | 'premium'; composition_budget_tier: 'low' | 'medium' | 'high'; depth: number;
    depth_mode?: 'fixed' | 'adaptive'; scrutiny?: 'standard' | 'deep' | 'exhaustive'; answer_length?: 'short' | 'standard' | 'detailed';
} };
```

3b. Delete the now-unused `const finiteInt = …;` line.

3c. Replace `function validSubmitted(…) { … }` with:

```ts
const ASK_CONFIG_KEYS = ['plan_tier', 'risk_tier', 'tier_source', 'tier_provenance_ref', 'composition_budget_tier', 'depth', 'decision_scope', 'as_of', 'steering_presets', 'steering_annotations'];
/** Debate shape P2c: the ask now also carries the three depth choices; an ask saved before carries none. */
const DEPTH_CHOICE_CONFIG_KEYS = ['depth_mode', 'scrutiny', 'answer_length'];
const ROOM_QUERY_KEYS = ['plan_tier', 'composition_budget_tier', 'depth'];
function validSubmitted(value: unknown): value is SubmittedPhoneDraft {
    if (!keys(value, ['topic', 'config', 'query']) || typeof value.topic !== 'string') return false;
    const withChoices = keys(value.config, [...ASK_CONFIG_KEYS, ...DEPTH_CHOICE_CONFIG_KEYS]);
    if (!withChoices && !keys(value.config, ASK_CONFIG_KEYS)) return false;
    const c = value.config as Record<string, unknown>;
    if (!Array.isArray(c.steering_presets) || c.steering_presets.length || !Array.isArray(c.steering_annotations) || c.steering_annotations.length) return false;
    if (c.tier_provenance_ref !== (c.tier_source === 'ASKER' ? 'asker:ui-selection' : c.tier_source === 'MACHINE_DEFAULT' ? 'machine:plan-tier-free' : null)) return false;
    const depthParams = withChoices ? {depth:c.depth, depthMode:c.depth_mode, scrutiny:c.scrutiny, answerLength:c.answer_length} : {depth:c.depth};
    const ask = AskRequestSchema.safeParse({question_line:value.topic, risk_tier:c.risk_tier,tier_source:c.tier_source,tier_provenance_ref:c.tier_provenance_ref,composition_budget_tier:c.composition_budget_tier,depth_params:depthParams,decision_scope:c.decision_scope,as_of:c.as_of,steering_presets:c.steering_presets,plan_tier:c.plan_tier,steering_annotations:c.steering_annotations});
    // Debate shape P2c (Contract deviation 9): the room query carries the three choices exactly when the ask does
    // (both follow the page's one room flag); an older draft carries them in neither.
    const queryWithChoices = keys(value.query, [...ROOM_QUERY_KEYS, ...DEPTH_CHOICE_CONFIG_KEYS]);
    if ((!queryWithChoices && !keys(value.query, ROOM_QUERY_KEYS)) || queryWithChoices !== withChoices) return false;
    const q = value.query as Record<string, unknown>;
    if (typeof q.depth !== 'number') return false;
    const room = AskRoomQuerySchema.safeParse({...q, depth: String(q.depth)});
    return ask.success && room.success && room.data.plan_tier === c.plan_tier && room.data.composition_budget_tier === c.composition_budget_tier && room.data.depth === c.depth
        && (!withChoices || (room.data.depth_mode === c.depth_mode && room.data.scrutiny === c.scrutiny && room.data.answer_length === c.answer_length));
}
```

3d. Replace Project 1's block, from `const FORM_KEYS = …` through the end of `function withoutRetiredKeys(…) { … }`, with:

```ts
const FORM_KEYS = ['topic','planTier','optionsOpen','depthMode','scrutiny','depth','answerLength','riskTier','riskTierWasEdited','budgetTier','decisionScope','asOf'];
/** The form as the page saved it before debate shape P2c: Max tokens instead of Answer length. */
const PARALLEL_CALLS_FORM_KEYS = [...FORM_KEYS.filter((name) => name !== 'answerLength'), 'maxTokens'];
/** ... and before parallel calls (owner ruling 2026-10-12): Branching width and Concurrency too. */
const OLDEST_FORM_KEYS = [...PARALLEL_CALLS_FORM_KEYS, 'branching', 'concurrency'];
/** A draft saved in an older shape is READ in today's. The retired values are dropped, Answer
 *  length takes its default (Standard), and a retired depth mode (manual, recommended) reads as
 *  Adaptive. It is never WRITTEN again in an old shape. Any other shape is left as it is, for
 *  validForm to refuse. */
function upgradedForm(value: unknown): unknown {
    if (!plain(value) || (!keys(value, PARALLEL_CALLS_FORM_KEYS) && !keys(value, OLDEST_FORM_KEYS))) return value;
    const form: Record<string, unknown> = { ...value };
    for (const name of ['maxTokens', 'branching', 'concurrency']) delete form[name];
    if (oneOf(form.depthMode, ['manual', 'recommended'])) form.depthMode = 'adaptive';
    form.answerLength = 'standard';
    return form;
}
```

3e. Replace `function validForm(…) { … }` with:

```ts
function validForm(value: unknown): value is PhoneDraftForm {
    if (!keys(value, FORM_KEYS)) return false;
    return typeof value.topic === 'string' && oneOf(value.planTier,['free','premium']) && typeof value.optionsOpen === 'boolean' && oneOf(value.depthMode,['fixed','adaptive']) && oneOf(value.scrutiny,['standard','deep','exhaustive']) && DepthParamsSchema.safeParse({depth:value.depth}).success && oneOf(value.answerLength,['short','standard','detailed']) && oneOf(value.riskTier,['casual','standard','high-stakes']) && typeof value.riskTierWasEdited === 'boolean' && oneOf(value.budgetTier,['low','medium','high']) && typeof value.decisionScope === 'string' && value.decisionScope.length > 0 && typeof value.asOf === 'string' && Number.isFinite(new Date(value.asOf).valueOf());
}
```

3f. In `readRecord`, replace `form: withoutRetiredKeys(parsed.form)` with `form: upgradedForm(parsed.form)`.

- [ ] **Step 4: Run the tests**

Run each, one at a time:
- `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pnpm exec vitest run tests/unit/phone-completion-draft-legacy.test.ts` → PASS (8).
- `pnpm exec vitest run tests/render/phone-completion.test.tsx` → PASS. /new still does not use the module.
- The UI typecheck (pre-flight PF-C2): the root `tsconfig.json` excludes `apps/ui`, so only the UI's own compiler sees `phoneCompletionDraft.ts`. Check `memory_pressure | tail -1` (free memory at least 40%), then run alone, from the engine folder: `pnpm --dir apps/ui exec tsc --noEmit -p tsconfig.json` → exit 0.

This task adds and deletes no shipped file, so the shipped-file list (`tests/support/shipped-corpus.manifest.txt`) does not change.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add apps/ui/lib/phoneCompletionDraft.ts tests/unit/phone-completion-draft-legacy.test.ts
git commit -m "$(cat <<'EOF'
Phone draft: Answer length and the two depth modes (debate shape P2c)

Today's draft carries answerLength instead of maxTokens and only fixed or
adaptive; a draft saved in either older shape is read in today's (Standard
answer, retired modes as Adaptive) and never written back in an old shape.
The saved room query may carry the three choices, and must then match the
ask's; an older draft carries them on neither side.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: All 35 locales

**Files:**
- Modify: `apps/ui/messages/<locale>/newDebate.json`, `apps/ui/messages/<locale>/public.json`, `apps/ui/messages/<locale>/compose.json` and `apps/ui/messages/<locale>/debateChrome.json` for the 34 non-English locales, `ro` included (pre-flight PF-C33).
- Not committed: the translator packets in `.superpowers/sdd/2026-10-12-debate-shape-phase2c/translations/` at the worktree root. `.superpowers/` is git-ignored (the repository's `info/exclude`); Step 1 checks it (pre-flight PF-C36).

**What changes:**
- **Removed** (scripted, no translator):
  - `newDebate.json`: `newDebate.legacyNotice`, `newDebate.selectionStrategy`, `newDebate.manual`, `newDebate.recommended`, `newDebate.maxTokens`, `newDebate.maxTokensHint`, `newDebate.scrutinyStandardHint`, `newDebate.scrutinyDeepHint`, `newDebate.scrutinyExhaustiveHint`.
  - `compose.json`: the six `compose.scrutinyDepth.*` keys.
- **Added** (translated):
  - `newDebate.json`: the 10 control keys of Task 8 Step 8.
  - `newDebate.json`: the six `newDebate.languageCheck.*` keys of P2L Task 18 (`title`, `body`, `use`, `keep`, `edit`, `proposalLabel`; amendment P2c-2), in the same batch. For `ro` they are NOT translated: `ro` gets P2L Task 18's Romanian texts exactly as given (controller ruling CR-7 keeps the informal «ta» text); the merge script below carries them.
  - `public.json`: `public.alsoRaised.title`, `public.alsoRaised.empty`, `public.positionTitle`.
  - So each locale gets 13 + 6 = 19 new keys (`ro`: 13 translated + 6 given).
- **Reworded** (translated; the key already exists in every locale, the merge overwrites its value in place) (pre-flight PF-C33):
  - `debateChrome.json`: `debateChrome.condition.mapMergeFallback`. Meaning: only points that said exactly the same thing were combined. English (Task 7 Step 9, option 1 of Wording picks, no final full stop): "Points that said the same thing were combined". Today's value in every locale ("Similar points were grouped together by a simple rule" and its translations) claims more than the code does, so it is replaced, never reused.
- **Translator key count:** 19 new + 1 reworded = 20 per locale; `ro` translates 14 (10 newDebate control keys, 3 public keys, the reworded key) and gets its six `languageCheck` texts as given (pre-flight PF-C33).

Implementer note (pre-flight PF-C41): between Task 8 and this task, `apps/ui/lib/i18n/compose.test.mjs` is red too (English lost the six `compose.scrutinyDepth.*` keys; the other locales still have them), not only `public.test.mjs` and `catalog.test.mjs`. This task's Step 5 turns all three green.

Implementer note (pre-flight PF-C41): the key list above is fixed. Step 1's key-gap check proves no task before this one added another UI key; if it lists one, stop and report BLOCKED with its output (the key then has to join the packets and the merge lists, including `misc` if it lives there).

Implementer note (pre-flight PF-C41): P2L Task 18 runs after this task. Its Step 0 `grep -L` prints nothing once this task has run, so Step 0 is skipped. If it ever runs, it exits 1 when it lists nothing (it needs `|| true` under `set -e`), and its claim that the merge script "touches nothing else" is wrong: this task's merge also removes the retired keys and rewords `mapMergeFallback`.

**Order with P2L (amendment P2c-3):** P2L Task 18 (the one-language pop-up) runs after this task and reuses these six keys; it also edits `NewDebatePageClient.tsx` and `apps/ui/lib/api.ts` after Task 8. Nothing in P2c reads the six keys.

**Language groups** (one Haiku worker each, effort `xhigh`, in the foreground, all six in ONE message so they run in parallel):

| Worker | Locales |
|---|---|
| H1 Romance | fr, es, it, pt, ro |
| H2 Germanic, Celtic, Maltese | de, nl, da, sv, ga, mt |
| H3 Slavic | bg, hr, cs, pl, ru, sk, sl, uk |
| H4 Baltic, Finno-Ugric, Greek, Turkish | et, fi, hu, lv, lt, el, tr |
| H5 Semitic and South Asian | ar, he, hi |
| H6 East and Southeast Asian | zh, ja, ko, vi, id |

Together these are 34 locales; with `en`, that makes 35.

- [ ] **Step 1: Prepare the packet folder (git-ignored, never committed) and check the starting point**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
PACKETS="$(git rev-parse --show-toplevel)/.superpowers/sdd/2026-10-12-debate-shape-phase2c/translations"
git check-ignore -q "$PACKETS/probe.json" && echo "packets folder is git-ignored"
mkdir -p "$PACKETS" && echo "$PACKETS"
grep -c '"debateChrome.condition.mapMergeFallback": "Points that said the same thing were combined"' apps/ui/messages/en/debateChrome.json
```

Expected: `packets folder is git-ignored`, the folder path, and `1` (Task 7 Step 9 set the English value). If the first line is missing, stop: the packets would show up in `git status`; report BLOCKED. (pre-flight PF-C36, PF-C33)

Then the key-gap check (no files left behind). It proves every non-English locale lacks exactly the 19 keys this task adds and still holds exactly the 15 retired keys, so no task before this one added a UI key that this task does not list (pre-flight PF-C41). Plural variants (`.zero`, `.one`, `.two`, `.few`, `.many`, `.other`) differ by language on purpose and are ignored; locales without a namespace file (for example `password-reset.json`, `staff.json`) are skipped, as today.

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
node --input-type=module - <<'NODE'
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = join(process.cwd(), "apps/ui/messages");
const plural = /\.(?:zero|one|two|few|many|other)$/;
const expectedMissing = ["newDebate.depthModeAdaptiveHelp", "newDebate.depthModeFixedHelp", "newDebate.scrutinyStandardHelp",
  "newDebate.scrutinyDeepHelp", "newDebate.scrutinyExhaustiveHelp", "newDebate.answerLength", "newDebate.answerLengthHint",
  "newDebate.answerLengthShort", "newDebate.answerLengthStandard", "newDebate.answerLengthDetailed",
  "newDebate.languageCheck.title", "newDebate.languageCheck.body", "newDebate.languageCheck.use",
  "newDebate.languageCheck.keep", "newDebate.languageCheck.edit", "newDebate.languageCheck.proposalLabel",
  "public.alsoRaised.title", "public.alsoRaised.empty", "public.positionTitle"].sort();
const expectedExtra = ["newDebate.legacyNotice", "newDebate.selectionStrategy", "newDebate.manual", "newDebate.recommended",
  "newDebate.maxTokens", "newDebate.maxTokensHint", "newDebate.scrutinyStandardHint", "newDebate.scrutinyDeepHint",
  "newDebate.scrutinyExhaustiveHint", "compose.scrutinyDepth.deep.hint", "compose.scrutinyDepth.deep.label",
  "compose.scrutinyDepth.exhaustive.hint", "compose.scrutinyDepth.exhaustive.label", "compose.scrutinyDepth.standard.hint",
  "compose.scrutinyDepth.standard.label"].sort();
const files = readdirSync(join(root, "en")).filter((name) => name.endsWith(".json") && !name.startsWith("_"));
const locales = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== "en").map((entry) => entry.name);
const keysOf = (path) => Object.keys(JSON.parse(readFileSync(path, "utf8"))).filter((key) => !plural.test(key));
const problems = [];
for (const locale of locales) {
  const missing = [];
  const extra = [];
  for (const file of files) {
    const path = join(root, locale, file);
    if (!existsSync(path)) continue;
    const english = keysOf(join(root, "en", file));
    const own = keysOf(path);
    missing.push(...english.filter((key) => !own.includes(key)));
    extra.push(...own.filter((key) => !english.includes(key)));
  }
  if (JSON.stringify(missing.sort()) !== JSON.stringify(expectedMissing)) problems.push(`${locale} lacks: ${missing.join(", ")}`);
  if (JSON.stringify(extra.sort()) !== JSON.stringify(expectedExtra)) problems.push(`${locale} has extra: ${extra.join(", ")}`);
}
if (locales.length !== 34) problems.push(`expected 34 non-English locales, found ${locales.length}`);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`key gap as expected in ${locales.length} locales`);
NODE
```

Expected: `key gap as expected in 34 locales`. Anything else: stop and report BLOCKED with the output (pre-flight PF-C41).

- [ ] **Step 2: Dispatch the six Haiku translators**

Send one prompt per worker. The prompt is the same for all six. Before sending, replace `<LOCALES>` with the worker's row of the table above, `<GROUP>` with its worker name (`H1` … `H6`), `<PACKETS>` with the folder Step 1 printed, and `<ENGINE>` with the absolute path that `cd "$(git rev-parse --show-toplevel)/dialectical-engine" && pwd` prints:

> You are translating 20 short UI strings for a debate website, for these locales only: `<LOCALES>`. Read files ONLY in the engine folder `<ENGINE>`. Read but do not edit any catalogue. Write exactly one file, `<PACKETS>/<GROUP>.json` (outside the engine folder; write nothing else there), shaped `{ "<locale>": { "<key>": "<text>", … 20 keys }, … }`. Exception: for `ro`, write only 14 keys (the 10 newDebate control keys, the 3 public keys and `debateChrome.condition.mapMergeFallback`); the six `newDebate.languageCheck.*` keys for `ro` are the owner's fixed text and are added by the merge, so leave them out. Never read settings.env or key files. You may spawn your own haiku subagents (effort "xhigh") in the foreground if useful; pass these same rules on.
>
> The English source is `apps/ui/messages/en/newDebate.json`, keys `newDebate.depthModeAdaptiveHelp`, `newDebate.depthModeFixedHelp`, `newDebate.scrutinyStandardHelp`, `newDebate.scrutinyDeepHelp`, `newDebate.scrutinyExhaustiveHelp`, `newDebate.answerLength`, `newDebate.answerLengthHint`, `newDebate.answerLengthShort`, `newDebate.answerLengthStandard`, `newDebate.answerLengthDetailed`, `newDebate.languageCheck.title`, `newDebate.languageCheck.body`, `newDebate.languageCheck.use`, `newDebate.languageCheck.keep`, `newDebate.languageCheck.edit`, `newDebate.languageCheck.proposalLabel`, plus `apps/ui/messages/en/public.json` keys `public.alsoRaised.title`, `public.alsoRaised.empty`, `public.positionTitle`, plus `apps/ui/messages/en/debateChrome.json` key `debateChrome.condition.mapMergeFallback`. (pre-flight PF-C33)
>
> Rules:
> 1. Keep `{answer}` and `{ai}` exactly as written, untranslated. Place them where the language's word order needs them. Add no quotation marks around `{answer}` unless the language requires them. `{ai}` is filled with an AI's name and `{answer}` with a whole sentence; neither can take a case ending or agree with anything. Pick a construction in which neither placeholder needs a case ending or agreement (a colon or dash construction where the language would otherwise inflect). (pre-flight PF-C40)
> 2. For consistency, reuse the words each locale's OWN catalogue already uses for "Depth mode", "Fixed", "Adaptive", "Depth of scrutiny", "Standard", "Deep" and "Exhaustive". Read `apps/ui/messages/<locale>/newDebate.json` first. "Standard" in `answerLengthStandard` is the same word as `scrutinyStandard` unless grammar needs agreement with "answer length".
> 3. Write numbers the locale's way, for example 1.500 (de), 1 500 (fr), 1,500 (en-style locales).
> 4. Use the polite, formal register the locale's catalogue already uses. For Romanian, use the polite plural and correct diacritics (ă, â, î, ș, ț with comma below).
> 5. The text is for ordinary readers. Never introduce words such as score, threshold, judge, model ranking, engine or token.
> 6. "Also raised, not debated" means: points that came up while the question was being explored but that the debate did not argue. "The case for {answer}, argued by {ai}" titles the argument for one answer, written by the named AI. `debateChrome.condition.mapMergeFallback` is a short note on a debate page; it means: only points that said exactly the same thing were combined (points that were merely similar were kept apart). It has no final full stop. The locale's current value for this key ("similar points were grouped by a simple rule") is wrong; do not reuse it. (pre-flight PF-C33)
> 7. The six `newDebate.languageCheck.*` keys are a small pop-up on the new-debate page, shown when a question mixes languages; it offers a version of the question in one language. Keep `{languages}` and `{language}` exactly as written, untranslated. The page fills `{languages}` with one language name or a list of names (joined the locale's own way, for example "French and German") and `{language}` with one name, both in the locale's own form (for example lowercase where the language writes language names in lowercase). The sentence must read naturally with one name or a list of names filled in, so pick a construction that works for both (for example "in {language}" or "the language {language}" where grammar needs it). `body` ends with a colon: the suggested version is shown right after it. `edit` is a button that opens the question for editing; `proposalLabel` labels the suggested version.
> 8. Reply with only the path you wrote and the count of keys per locale (20 each; 14 for `ro`). (pre-flight PF-C33)
> 9. Before writing the file, check every string against these seven points (pre-flight PF-C37):
>    1. "point" is a point in a discussion, never a score or a mark;
>    2. "more" is not rendered as "other";
>    3. no word that can read as score, grade, judge, threshold, limit, panel, engine or token;
>    4. natural grammar, in the style of the neighbouring keys of the same catalogue;
>    5. the same words for Depth mode, Fixed, Adaptive, Depth of scrutiny, Standard, Deep and Exhaustive as the locale's own `newDebate.json`;
>    6. placeholders untranslated, and the sentence reads naturally with an AI's name, a full-sentence answer, or one or more language names filled in;
>    7. numbers written the locale's way.

- [ ] **Step 3: One Opus spot-check of the risky locales**

Dispatch one Opus subagent (effort `high`, foreground) with this prompt:

> Review and, where wrong, correct in place the translation packets in `<PACKETS>/*.json` (the folder Step 1 printed) for these locales only: mt, ga, et, lv, lt, ar, he, hi, ja, zh, ko, plus ro (check its formal register and diacritics). Read files only in the engine folder `<ENGINE>`. Check every key, including `debateChrome.condition.mapMergeFallback`, whose meaning is: only points that said exactly the same thing were combined (no final full stop; the locale's old value about "similar points … grouped by a simple rule" is wrong and must not come back). Check meaning against the English in `apps/ui/messages/en/{newDebate,public,debateChrome}.json`. Check placeholders `{answer}` and `{ai}` (no case ending or agreement on either; a colon or dash construction where the language would otherwise inflect), and in the six `newDebate.languageCheck.*` keys `{languages}` and `{language}` (untranslated, and the sentence reads naturally with one language name or a list of names filled in, in the locale's own form). Check the register, natural word order, right-to-left safety for ar and he (no stray direction marks), and these seven points: (1) "point" is a point in a discussion, never a score or a mark; (2) "more" is not rendered as "other"; (3) no word that can read as score, grade, judge, threshold, limit, panel, engine or token; (4) natural grammar, in the style of the neighbouring keys; (5) the same words for Depth mode, Fixed, Adaptive, Depth of scrutiny, Standard, Deep and Exhaustive as the locale's own `newDebate.json`; (6) placeholders untranslated, reading naturally with an AI's name, a full-sentence answer, or one or more language names filled in; (7) numbers written the locale's way. For `ro`, check only its 14 packet keys: its six `languageCheck` texts are the owner's fixed informal text (controller ruling CR-7), are not in the packets, and must not be changed or added. Edit only the packet files. Never read settings.env or key files. You may spawn your own haiku or opus subagents in the foreground when useful; pass these rules on. Report per locale "ok", or a table key | old | new | why. (pre-flight PF-C33, PF-C37, PF-C40)

- [ ] **Step 3b: One Opus second check of all the other locales** (pre-flight PF-C37)

After Step 3 returns, dispatch one Opus subagent (effort `high`, foreground; never at the same time as Step 3, so the packets have one editor at a time) with this prompt, `<PACKETS>` and `<ENGINE>` filled in as in Step 2:

> Review and, where wrong, correct in place the translation packets in `<PACKETS>/*.json` for these 22 locales only: bg, cs, da, de, el, es, fi, fr, hr, hu, id, it, nl, pl, pt, ru, sk, sl, sv, tr, uk, vi. Read files only in the engine folder `<ENGINE>`. Check every key of each locale (20 per locale), including `debateChrome.condition.mapMergeFallback`, whose meaning is: only points that said exactly the same thing were combined (no final full stop; the locale's old value about "similar points … grouped by a simple rule" is wrong and must not come back). Check meaning against the English in `apps/ui/messages/en/{newDebate,public,debateChrome}.json`, and these seven points: (1) "point" is a point in a discussion, never a score or a mark (an earlier batch on this site wrongly used score words such as bod, punkt, točka, pont, poin, punto, ponto, điểm in the score sense); (2) "more" is not rendered as "other"; (3) no word that can read as score, grade, judge, threshold, limit, panel, engine or token; (4) natural grammar, in the style of the neighbouring keys of the same catalogue; (5) the same words for Depth mode, Fixed, Adaptive, Depth of scrutiny, Standard, Deep and Exhaustive as the locale's own `apps/ui/messages/<locale>/newDebate.json`; (6) placeholders `{answer}`, `{ai}`, `{languages}` and `{language}` untranslated, with no case ending or agreement on them, reading naturally with an AI's name, a full-sentence answer, or one or more language names filled in; (7) numbers written the locale's way. Use the polite, formal register each locale's catalogue already uses. Edit only the packet files; never touch the catalogues and never touch another locale's entries. Never read settings.env or key files. You may spawn your own haiku or opus subagents in the foreground when useful; pass these rules on. Report per locale "ok", or a table key | old | new | why.

- [ ] **Step 4: Merge the packets, removing the retired keys and replacing the reworded value**

Run (Node, no files left behind). Added keys are inserted only when missing; the `changed` key is overwritten in place every run, and the script throws when a locale lacks it (pre-flight PF-C33). It also refuses a packet key it does not know, and a packet that tries to set `ro`'s fixed texts.

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
PACKETS="$(git rev-parse --show-toplevel)/.superpowers/sdd/2026-10-12-debate-shape-phase2c/translations"
node --input-type=module - "$PACKETS" <<'NODE'
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = join(process.cwd(), "apps/ui/messages");
const dropped = {
  newDebate: ["newDebate.legacyNotice", "newDebate.selectionStrategy", "newDebate.manual", "newDebate.recommended",
    "newDebate.maxTokens", "newDebate.maxTokensHint", "newDebate.scrutinyStandardHint", "newDebate.scrutinyDeepHint",
    "newDebate.scrutinyExhaustiveHint"],
  compose: ["compose.scrutinyDepth.deep.hint", "compose.scrutinyDepth.deep.label", "compose.scrutinyDepth.exhaustive.hint",
    "compose.scrutinyDepth.exhaustive.label", "compose.scrutinyDepth.standard.hint", "compose.scrutinyDepth.standard.label"]
};
const added = {
  newDebate: ["newDebate.depthModeAdaptiveHelp", "newDebate.depthModeFixedHelp", "newDebate.scrutinyStandardHelp",
    "newDebate.scrutinyDeepHelp", "newDebate.scrutinyExhaustiveHelp", "newDebate.answerLength", "newDebate.answerLengthHint",
    "newDebate.answerLengthShort", "newDebate.answerLengthStandard", "newDebate.answerLengthDetailed",
    "newDebate.languageCheck.title", "newDebate.languageCheck.body", "newDebate.languageCheck.use",
    "newDebate.languageCheck.keep", "newDebate.languageCheck.edit", "newDebate.languageCheck.proposalLabel"],
  public: ["public.alsoRaised.title", "public.alsoRaised.empty", "public.positionTitle"]
};
// Keys every locale already has whose value is replaced by the packet's text (pre-flight PF-C33).
const changed = {
  debateChrome: ["debateChrome.condition.mapMergeFallback"]
};
// P2L Task 18's Romanian texts, as given (controller ruling CR-7: the owner's informal «ta» text), never translated.
const fixed = {
  ro: {
    "newDebate.languageCheck.title": "Limba întrebării",
    "newDebate.languageCheck.body": "Întrebarea ta amestecă limbile {languages}. AI-urile dezbat cel mai bine când toată întrebarea e într-o singură limbă, așa că îți propunem această variantă în limba {language}:",
    "newDebate.languageCheck.use": "Folosește varianta propusă",
    "newDebate.languageCheck.keep": "Păstrează formularea mea",
    "newDebate.languageCheck.edit": "Editează",
    "newDebate.languageCheck.proposalLabel": "Varianta propusă"
  }
};
const packetsDir = process.argv[2];
const translations = Object.assign({}, ...readdirSync(packetsDir).filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(packetsDir, name), "utf8"))));
const known = new Set([...Object.values(added).flat(), ...Object.values(changed).flat()]);
for (const [locale, texts] of Object.entries(translations)) {
  for (const key of Object.keys(texts)) {
    if (!known.has(key)) throw new Error(`UNKNOWN packet key ${locale} ${key}`);
    if (fixed[locale]?.[key] !== undefined) throw new Error(`FIXED text must not be in a packet: ${locale} ${key}`);
  }
}
const locales = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== "en").map((entry) => entry.name);
if (locales.length !== 34) throw new Error(`expected 34 non-English locales, found ${locales.length}`);
for (const locale of locales) {
  for (const namespace of new Set([...Object.keys(dropped), ...Object.keys(added), ...Object.keys(changed)])) {
    const path = join(root, locale, `${namespace}.json`);
    const englishKeys = Object.keys(JSON.parse(readFileSync(join(root, "en", `${namespace}.json`), "utf8")));
    const entries = Object.entries(JSON.parse(readFileSync(path, "utf8"))).filter(([key]) => !(dropped[namespace] ?? []).includes(key));
    for (const key of added[namespace] ?? []) {
      if (entries.some(([existing]) => existing === key)) continue;
      const text = fixed[locale]?.[key] ?? translations[locale]?.[key];
      if (typeof text !== "string" || text.trim() === "") throw new Error(`MISSING ${locale} ${key}`);
      // Insert after the nearest earlier English key the locale already has, so each file keeps English's order.
      const before = englishKeys.slice(0, englishKeys.indexOf(key)).reverse().find((candidate) => entries.some(([existing]) => existing === candidate));
      const at = before === undefined ? 0 : entries.findIndex(([existing]) => existing === before) + 1;
      entries.splice(at, 0, [key, text]);
    }
    // Reworded keys: overwrite the value in place, keeping the key's position; a locale without the key is an error.
    for (const key of changed[namespace] ?? []) {
      const at = entries.findIndex(([existing]) => existing === key);
      if (at === -1) throw new Error(`KEY NOT IN CATALOGUE ${locale} ${key}`);
      const text = translations[locale]?.[key];
      if (typeof text !== "string" || text.trim() === "") throw new Error(`MISSING ${locale} ${key}`);
      entries[at] = [key, text];
    }
    writeFileSync(path, `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`);
  }
}
console.log(`merged ${locales.length} locales`);
NODE
```

Expected: `merged 34 locales`. A `MISSING <locale> <key>` error means a packet is incomplete: re-run that group's worker (then Step 3 or 3b for its locales), then run this step again. `UNKNOWN packet key` or `FIXED text must not be in a packet` means a worker wrote a key it should not have: delete that entry from the packet and run again. `KEY NOT IN CATALOGUE` means a locale's `debateChrome.json` lost the key: stop and report BLOCKED. The step is idempotent: the four files of every locale are rewritten in the same 2-space JSON form they already use. (pre-flight PF-C33)

- [ ] **Step 5: Run every catalogue test that covers the four namespaces**

Run each, one at a time, from `apps/ui`:
- `node --import tsx --test lib/i18n/catalog.test.mjs` → PASS. This covers newDebate's 35 locales, placeholders (including `{languages}` and `{language}` in the six `languageCheck` keys) and the retired keys.
- `grep -c "newDebate.languageCheck" messages/ro/newDebate.json` → `6`, and `grep -n "Întrebarea ta amestecă" messages/ro/newDebate.json` shows P2L's Romanian body unchanged.
- `node --import tsx --test lib/i18n/public.test.mjs` → PASS. This covers 35 locales, unused keys, the sample check (ar, de, es, fr, ja differ from English) and no hard-coded English.
- `node --import tsx --test lib/i18n/compose.test.mjs` → PASS.
- `node --import tsx --test lib/i18n/debateChrome.test.mjs` → PASS. It checks keys and placeholders only, so the next check proves the reword reached every locale. (pre-flight PF-C33)
- `node --import tsx --test lib/i18n/catalogNamespaces.test.mjs` → PASS.

Then, from the engine folder (pre-flight PF-C38), check the diff and the reword:

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git diff --stat -- apps/ui/messages | tail -1
git diff --name-only -- 'apps/ui/messages/*/debateChrome.json' | wc -l
git diff --numstat -- 'apps/ui/messages/*/debateChrome.json' | awk '$1 != 1 || $2 != 1'
grep -h '"debateChrome.condition.mapMergeFallback"' apps/ui/messages/*/debateChrome.json
```

Expected:
- the first line shows `136 files changed` (34 locales × 4 namespaces: newDebate, public, compose, debateChrome); `en` was committed earlier (pre-flight PF-C33);
- the second prints `34`: every non-English `debateChrome.json` changed;
- the third prints nothing: in each of them exactly one line changed, the reworded value;
- the fourth prints 35 lines; read them: each says, in its language, that only points saying the same thing were combined, none mentions "similar" points or a "simple rule", and none ends with a full stop (spot-check of the key, pre-flight PF-C33).

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
git add -- 'apps/ui/messages/*/newDebate.json' 'apps/ui/messages/*/public.json' 'apps/ui/messages/*/compose.json' 'apps/ui/messages/*/debateChrome.json' ':(exclude)apps/ui/messages/en/*'
git diff --cached --stat | tail -1
git commit -m "$(cat <<'EOF'
Locales: debate shape P2c words in all 35 languages

The /new controls' new help lines and Answer length, the debate page's
"Also raised, not debated" and position title, the six languageCheck
keys of the question-language pop-up (P2L; Romanian as the owner wrote it),
and the reworded map note (only points that said the same thing were
combined), translated by language group with a spot-check of the risky
locales and a second check of all the others; the retired /new and
compose keys removed everywhere.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

The `git add` names only the four catalogues of the 34 locales, so another session's edit elsewhere in `apps/ui/messages` is never staged (pre-flight PF-C39). Before the commit, the staged count must read `136 files changed`; if it is larger, something else was already staged: unstage it with `git restore --staged <path>` and look again.

Leave `$PACKETS` in place. It sits in the git-ignored `.superpowers/` folder and is never committed (Step 1 checked this). The owner may delete it later. (pre-flight PF-C36)

---

## Task 11: Final verification

**Files:** none modified. If a check fails, the fix goes in the task that owns the file, as a new commit.

- [ ] **Step 1: Regenerate and typecheck** (heavy; each command alone, after the memory check)

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
memory_pressure | tail -1
pnpm run generate:contract && pnpm run typecheck
```

Expected: exit 0. The root typecheck excludes `apps/ui`, so the UI gets its own compiler next (TypeScript 5.9 in the UI, 7 at the root) (pre-flight PF-C2):

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
memory_pressure | tail -1
pnpm --dir apps/ui exec tsc --noEmit -p tsconfig.json
```

Expected: exit 0. Typical first-run catches of the two typechecks:
- a test double typed as `ContractClient` now missing `readAnswerMapView`; add `readAnswerMapView: async () => { throw new ContractHttpError("NOT_FOUND", 404, "MAP_VIEW_NOT_FOUND"); }` to it;
- P2b's `MapChoiceRepository` record (from `@debateai/map`) not satisfying `MapViewSource` (Task 5 Step 6);
- `Cannot find module '@debateai/map'` from apps/api: Task 5 Step 6a-2's `pnpm install --offline` was not run, or `pnpm-lock.yaml` was not committed.

Then the two source audits. Both print a JSON report and exit 1 today because of the known F31 debt (the obs-capture edges and environment reads of `apps/api`, `apps/runner` and `apps/scheduler`), so exit 0 is not expected. Each command below prints the report's list and then `known-only exit 0` when the list holds exactly the 3 known obs-capture lines and nothing else (pre-flight PF-C18):

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
pnpm --silent run audit:architecture | node -e 'let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => { const list = JSON.parse(s).violations; console.log(list.join("\n")); process.exitCode = list.length === 3 && list.every((line) => line.includes("obs-capture")) ? 0 : 1; });'; echo "known-only exit $?"
pnpm --silent run audit:source | node -e 'let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => { const list = JSON.parse(s).blocking; console.log(list.join("\n")); process.exitCode = list.length === 3 && list.every((line) => line.includes("obs-capture")) ? 0 : 1; });'; echo "known-only exit $?"
```

Expected: both end with `known-only exit 0`. The architecture lines read `apps/api -> … obs-capture is not a declared edge` and the same for `apps/runner` and `apps/scheduler`; none names `map` (apps/api's row lists `"map"` since Task 5). The source lines name the three `packages/obs-capture/install/*.ts` files. Any other line (for example a `switch without default + exhaustive` in a file this plan added) is a new red: fix it in the task that owns the file. If the JSON does not parse, run `pnpm run audit:architecture` or `pnpm run audit:source` plainly and read the list by eye.

- [ ] **Step 2: Re-run this plan's tests, one file at a time**

Each run is `pnpm exec vitest run <file>`, alone, after the memory check (Global Constraints), and must PASS:
- The plan's own tests: `tests/unit/debate-shape-story-also-raised.test.ts`, `tests/unit/story-pack.test.ts`, `tests/unit/debate-shape-story-snapshot.test.ts`, `tests/unit/debate-shape-map-view-contract.test.ts`, `tests/unit/hs-s02-check.test.ts`, `tests/unit/debate-shape-map-view-api.test.ts`, `tests/unit/s7-authorization.test.ts`, `tests/unit/debate-shape-map-view-ui.test.ts`, `tests/render/debate-shape-also-raised.test.tsx`, `tests/render/debate-shape-mark-labels.test.tsx` (Task 7: drawer labels only, neutral pill tone), `tests/unit/debate-shape-room-flag.test.ts`, `tests/unit/debate-shape-submit.test.ts`, `tests/unit/b7a-room-read.test.ts`, `tests/unit/debate-shape-new-ask-wire.test.ts`, `tests/render/debate-shape-new-controls.test.tsx`, `tests/render/b10-room-notice.test.tsx`, `tests/render/tier01-new-plan-tier.test.tsx`, `tests/unit/phone-completion-draft-legacy.test.ts`.
- The shipped-file list (SC1): `tests/unit/s1-1-depth-contract.test.ts` (pre-flight PF-C1). If it reports drift, the task that added or removed the file missed its manifest step; fix it there.
- Guards on files this plan edits (pre-flight PF-C43):
  - `tests/unit/hs-s01-seal.test.ts` and `tests/unit/prompt-text-pins.test.ts` (both read `story-shapes/`; Task 2 re-pins hs-s01 for pack version `2026-10-14.1`);
  - `tests/unit/story-writer.test.ts` (Task 1's writer change) and `tests/unit/m7-story-fallback.test.ts` (reads `story-snapshot.ts`);
  - `tests/unit/call-lane-gateway.test.ts` and `tests/unit/prompt-surface-guard.test.ts` (the P2b lesson);
  - `tests/unit/hs-s02-publish-route.test.ts` (reads `publications.ts`);
  - `tests/unit/v2ui-banner-copy.test.ts` and `tests/unit/b4-billing-register-rows.test.ts` (read `NewDebatePageClient.tsx`);
  - the render tests that load /new: `tests/render/ux01-new-debate-form.test.tsx`, `tests/render/legal-accept-gate.test.tsx`, `tests/render/new-debate-no-phone-step.test.tsx`, `tests/render/preview-free-roster.test.tsx`, `tests/render/internal-funded-ask-page.test.tsx`, `tests/render/sup-04-widget.test.tsx`, `tests/render/phone-completion.test.tsx`;
  - `tests/render/m6-honesty-drawer.test.tsx` and `tests/render/debate-page-catalogs.test.tsx`.
- From `apps/ui`: `node --import tsx --test lib/i18n/debateChrome.test.mjs` → PASS (the reworded `mapMergeFallback` in 35 locales). Step 4 runs it again with the other node tests.

- [ ] **Step 3: The architecture folder** (heavy; alone, after the memory check) (pre-flight PF-C42, controller ruling C-GATE)

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
memory_pressure | tail -1
pnpm exec vitest run tests/architecture --maxWorkers=2
```

Expected: the only red is the known F31 row in `tests/architecture/scaffold.test.ts` ("dev's F31 debt: apps/api, apps/runner and apps/scheduler declare their obs-capture edge", listed in `tests/ci-known-red.txt`). Any other red: report it with its name, and do not bend code to it. Trace where the expectation came from first.

Never run `pnpm test:ci-gate` or the whole suite on the Mac: the full CI gate (unit, architecture and render folders) runs on the pull request, and CI is the judge.

- [ ] **Step 3b: The four database suites, one at a time** (heavy; each alone, after the memory check) (pre-flight PF-C45)

CI's gate skips the database suites, and these four read or write what this plan changes (publications, the story, the map choice). Each starts its own embedded PostgreSQL:

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
memory_pressure | tail -1
pnpm exec vitest run tests/integration/s8-publication-database.test.ts
```

Then the same two lines (memory check, then the run) for `tests/integration/hs-s02-publish-database.test.ts`, `tests/integration/story-publication.test.ts` and `tests/integration/map-choice-repository.test.ts`, one after another, never two at once. Expected: PASS (none of the four is on the known-red list). If embedded PostgreSQL cannot start, report BLOCKED with the output; do not skip the suite.

- [ ] **Step 4: The apps/ui node tests**

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine/apps/ui" && pnpm test
```

Expected: PASS. This runs the 44 node tests of `apps/ui/scripts/node-test-manifest.json` one at a time, the i18n catalogue tests (`debateChrome.test.mjs` included) among them.

- [ ] **Step 5: Owner-text sanity**

`P2C_BASE` is the commit this plan started from, recorded as a line `P2C_BASE=<full commit id>` in `.superpowers/sdd/2026-10-12-debate-shape-phase2c/progress.md` before Task 1 (see Global Constraints). Read it from there (pre-flight PF-C44):

```bash
cd "$(git rev-parse --show-toplevel)/dialectical-engine"
P2C_BASE="$(sed -n 's/^P2C_BASE=\([0-9a-f]\{7,40\}\)$/\1/p' "$(git rev-parse --show-toplevel)/.superpowers/sdd/2026-10-12-debate-shape-phase2c/progress.md" | head -1)"
test -n "$P2C_BASE" && git cat-file -e "${P2C_BASE}^{commit}" && echo "P2C_BASE $P2C_BASE"
git diff "$P2C_BASE"..HEAD -- story-shapes/
grep -n "also_raised\|raised_by\|answers_note" story-shapes/common.md story-shapes/checker.md
```

Expected:
- the first command prints `P2C_BASE` and a commit id; if it prints nothing, the base line is missing from progress.md: stop and report BLOCKED;
- the diff shows only Task 2's owner text (the `also_raised` line, the new section, the `answers_note` text of controller ruling C-STORY, the checker sentence) and the `pack.json` version bump to `2026-10-14.1` (or the next unused `2026-10-14.N` Task 2 recorded);
- the `grep` shows those lines.

- [ ] **Step 6: Room flag and P2L keys sanity**

- `grep -n "shape_settings" packages/contract/src/index.ts apps/api/src/index.ts` shows exactly the two schema members and the one room-handler line (Task 8 Step 5b).
- `grep -rn "cost_envelope.basis.shape\|basis\.shape" apps/ui --include='*.ts' --include='*.tsx' | grep -v node_modules` prints nothing (Global Constraints, P2a M8).
- `for l in apps/ui/messages/*/; do printf '%s %s\n' "$l" "$(grep -c 'newDebate.languageCheck' "$l/newDebate.json")"; done` prints `6` for all 35 locales.
- With `P2C_BASE` set as in Step 5, `git diff --name-only "$P2C_BASE"..HEAD -- 'apps/ui/messages/*/debateChrome.json' | wc -l` prints `35`: English reworded in Task 7, the 34 others in Task 10 (pre-flight PF-C33).

---

## Self-review: spec → tasks

| Spec item | Task |
|---|---|
| S2: positions shown as "the case for …, argued by X" | 6 (`positionTitlesFrom`; the AI's display label, never a raw model id; no trailing full stop inside the title; controller ruling C-NAMES), 7 (render), 10 (locales) |
| S6: Depth mode, Adaptive default, Fixed on Premium only, Free adaptive | 8 (`fixedDepthAllowedFor`, default `adaptive`, Free reset), 9 (draft) |
| S7: Depth of scrutiny Standard/Deep/Exhaustive, Premium only | 8 (select disabled on Free, sent in `depth_params`) |
| S8: Max tokens → Answer length Short/Standard/Detailed, every plan | 8 (SegmentedRow open on Free, sent), 9 (draft), 10 |
| §3.2: three real controls; disable what the plan does not allow; remove the "not sent" notice; all 35 locales via grouped Haiku plus an Opus spot-check of the risky locales and a second check of all the others | 8, 10 (Steps 3 and 3b) (pre-flight PF-C46) |
| §3.2: a missing field means the default (old clients) | 8 (`createDebate` sends only chosen fields), 9 (old draft shapes) |
| §3.3 step 8: "also raised" material to the story, bounded by the story budget | 1 (lowest priority, never moves the ladder), 3 (runner wiring) |
| §3.3 step 8: new story-shapes paragraph | 2 (common.md section, checker sentence, pack version) |
| §3.3 step 8: debate page "Also raised, not debated" (read model + adapter field) | 4 (contract), 5 (route, publication copy), 6 (read beside the answer), 7 (render) |
| §3.3 step 8: no internals in any of these texts | 1 (engine tokens and figures), 4 (schema carries no maker or count), 5 (view drops makers), 7 (render test forbids makers, counts, refs; the honesty drawer shows labels only) |
| §3.4: `core.map_choice` read through `readMapChoiceForRun` | 5 (`MapChoiceReader` port; Contract deviation 4) |
| §5: render tests for the /new controls and the debate page's also-raised list | 7 (`debate-shape-also-raised`, `debate-shape-mark-labels`), 8 |
| §3.3 step 8 answer length in the synthesizer (target sentence, writer bound) | P2b (runner); P2c only sends the choice (8) |
| Invariant "the story covers ≤ 8 positions" | unchanged: `also_raised` and `answers_note` add no paths and no references (1) |
| Owner rule: story text passes the deterministic checks | 1 (also-raised claims free their own figures and words; `also_raised`/`raised_by` refused) |
| Owner rule: owner-editable pack text is a new sealed version | 2 (`pack.json` `2026-10-14.1`, or the next unused `2026-10-14.N` after Task 2's `git log -p` check; the fingerprint changes; `tests/unit/hs-s01-seal.test.ts` re-pinned) (pre-flight PF-C46, PF-C7, PF-C8) |
| Owner rule: 3 phrasings per new sentence, option 1 in code | Wording picks; 1 (the answers note), 2, 7 (incl. the `mapMergeFallback` reword), 8 ship option 1; 10 translates option 1 |
| P2b note: the story says when the answers came from a fallback (controller ruling C-STORY) | 1 (`answersNote` on `StoryRunSnapshot`, the material's `answers_note` field right after `also_raised`, the writer passes it), 2 (the pack text explains `answers_note`), 3 (the runner sets `answersNote`: map unavailable or answers filled) (pre-flight PF-C46, PF-C6) |
| P2b note: the honesty drawer shows only the localized label for the eight shape marks (controller ruling C-DRAWER) | 7 (`tests/render/debate-shape-mark-labels.test.tsx`: no reason codes, run ids, node ids or raw mark code) (pre-flight PF-C46, PF-C21) |
| P2b note: neutral (informational) tone for the six map marks and the two extension marks, served root node pills too (controller ruling C-TONE) | 7 (same render test) (pre-flight PF-C46, PF-C22) |
| P2b note: `debateChrome.condition.mapMergeFallback` rewording (only points that said the same thing were combined) | 7 Step 9 (English, option 1), 10 (34 locales, explicit replace list; Step 5 checks all 34 changed), 11 Step 6 (35 changed since `P2C_BASE`) (pre-flight PF-C46, PF-C33) |
| SC1: the shipped-file list matches the shipped files | 4, 5, 6, 7, 8 (manifest step before each commit), 11 Step 2 (`tests/unit/s1-1-depth-contract.test.ts`) (pre-flight PF-C46, PF-C1) |
| The UI compiles with its own TypeScript | 6, 7, 8, 9, 11 Step 1 (`pnpm --dir apps/ui exec tsc --noEmit -p tsconfig.json`) (pre-flight PF-C46, PF-C2) |
| Architecture sweep and source audits, known F31 only | 11 Step 1 (audits: only the 3 obs-capture lines each), 11 Step 3 (`pnpm exec vitest run tests/architecture --maxWorkers=2`; only scaffold's F31 row red; never `test:ci-gate` locally, CI judges the full suite: controller ruling C-GATE) (pre-flight PF-C46, PF-C18, PF-C42) |
| Database suites CI skips | 11 Step 3b (four suites, one at a time) (pre-flight PF-C45) |
| Second check of the 22 non-risky locales | 10 Step 3b (one Opus, seven checks; the same checks in Step 3 and as translator rule 9) (pre-flight PF-C46, PF-C37) |
| The map view route checks the owner | 5 (owner check port on the map view read) (pre-flight PF-C46, PF-C16) |
| Support article: accurate while the shape row is absent; the updated version before the shape goes on (controller ruling C-ARTICLE) | 8 (owner-gated step: a reviewed draft with its new checksum; the owner reviews and publishes it BEFORE switching the shape on) (pre-flight PF-C31) |
| P2L Task 18 after P2c (amendment P2c-3) | 10 (carries the six `languageCheck` keys; Implementer notes on P2L's Step 0 and the compose test), cross-plan amendment: P2L Task 18 Step 4 also runs `tests/render/debate-shape-new-controls.test.tsx` and `tests/unit/debate-shape-new-ask-wire.test.ts` (pre-flight PF-C32, PF-C41) |
| Project 1 coordination | Gates on Tasks 8–9; only the three controls, the notice and Max tokens are touched; Project 1's comment and its test case are kept and updated |
| Row absent: no setting dropped silently (P2a final review "P2c:85"; controller decision) | 8 (Step 1b contract and API tests, Step 5b `shape_settings`, Step 6c-2/6e/6f controls and ask only with the flag; render tests "shows none of the three controls…" and "reads the room with the three choices only once…") |
| §3.2 room read for the settings it will send (P2a deviation 9, final review M4) | 8 (`useAskRoom` and the ALREADY_WAITING `readAskRoom` carry the three choices with the flag), 9 (draft's room-query check compares them; older drafts stay valid) |
| P2L's six `newDebate.languageCheck.*` keys (P2L amendments P2c-1/2/3) | 8 Step 8 (English), 10 (33 translated, `ro` as given per CR-7, Opus spot-check and second check), 11 Step 6 (count in all 35) |
| P2b's map reader home (`@debateai/map`) and record fields | 5 (Step 6 import, `apps/api/package.json`, `pnpm-lock.yaml`, orphan-audit row), Contract deviation 4 |
| Public answer without `cost_envelope.basis.shape` (P2a M8) | Global Constraints (P2c never reads it), 11 Step 6 |

Placeholders: none (pre-flight PF-C46, PF-C44). Task 11 Step 5 reads `P2C_BASE` from `progress.md`, where it is recorded before Task 1; it has no `<base>` slot. The `<LOCALES>`, `<GROUP>`, `<PACKETS>` and `<ENGINE>` slots in Task 10's subagent prompts are fill-ins whose values Task 10 names (the worker table, Step 1's printed folder, the engine folder's path). Each cross-plan name that may differ is resolved by a gate command plus a single named edit point:
- P2b's `MapResult` variable (`debateShapeMap`): Task 3, gate and Step 4b.
- P2b's reader class (`MapChoiceRepository` from `@debateai/map`): Task 5, Step 6.
- P2b's in-force helper (`debateShapeInForce`): the P2b in-force gate, before Task 8 Step 5b.
- The new pack version (`2026-10-14.1`, or the next unused `2026-10-14.N`): Task 2, Step 5.
