# Debate shape Phase 2 — binding interface contract for the plan drafters

> **Renumbered 2026-10-14:** the migrations this plan calls 0116 (the debate shape map) and 0117 (the language check's site cost) are now 0117 and 0118: the merge of `origin/dev` 221d784db brought dev's own 0116 (`0116_mail_locale.sql`) first. The numbers below are historical.

Spec: docs/superpowers/specs/2026-10-12-debate-shape-design.md (§3–§6 are Phase 2). Phase 1 (packages/map + practice
`openings`) is built on branch design/2026-10-12-debate-shape. This file fixes the NAMES every Phase 2 sub-plan uses so
sub-plans written in parallel agree. A drafter who finds a name impossible (clash, convention) proposes the change in
its plan's "Contract deviations" section instead of silently renaming.

**Status (2026-10-14): historical.** This was the drafters' starting contract; the built code and the sub-plans'
deviations superseded parts of it, and where they differ the code wins. Known differences are marked "Superseded"
below (§1 answers, §4 storage, §5 page keys).

Sub-plans (each its own plan file, its own SDD run, in this order):
- P2a — settings and money: register row `debateShapePolicy`, ask-contract fields, plan normalisation, start-of-debate
  estimate + attempt ceiling + four money places, preview publish kit + hosted optional member.
- P2b — the runner shape (needs Project 1's scheduler merged in): map stage in the runner, assigned positions, chosen
  points, panels J + close-call extension, sparse cross-replies, adaptive/fixed rounds, scrutiny, answer length,
  storage migration, marks, fallbacks, ledger call sites.
- P2c — what people see: story "also raised" material + story-shapes paragraph, debate page also-raised list and
  position titles, /new controls real (35 locales), legacy notice removed.
- P2d — practice + proof: practice `debate` mode runs the new shape behind a throwaway-register override; integration
  tests; the whole-debate comparison run (owners' private method; nothing about the method in the repo).

## 1. Register row (P2a)

- Family/key: `debateShapePolicy` (register row key), kind `"DEBATE_SHAPE_POLICY"`, `version: 1`. OPTIONAL row: absent
  → today's shape byte for byte. Invalid → runner boot refuses with `DEBATE_SHAPE_POLICY_INVALID`.
- Pattern to copy: `answerRoleRotationPolicy` (optional single-row family) and Project 1's `callConcurrencyPolicy`.
- TypeScript: `DebateShapePolicy`, parser `parseDebateShapePolicy(value: unknown): DebateShapePolicy` (throws
  `TypeError("DEBATE_SHAPE_POLICY_INVALID:<path>")`), reader `readDebateShapePolicy(register, version): DebateShapePolicy | null`.
- Shape (start values = spec rulings S5–S8):

```text
{ kind: "DEBATE_SHAPE_POLICY", version: 1,
  plans: { free: PlanShape, plus: PlanShape, pro: PlanShape, max: PlanShape, premium: PlanShape },
  answerLength: { short: { words: 300, writerBound: 8192 }, standard: { words: 700, writerBound: 12288 },
                  detailed: { words: 1500, writerBound: 16384 } },
  mapStepBounds: { merge: int 8192..32768, choose: int 8192..32768 } }   // optional member, X1
PlanShape = { mapAIs: int 2..9, answers: int 2..5 (Superseded: 2..4, ruling T-P5), graders: int 1..5, pointsPerAnswer: int 1..6, deeperTopPoints: int 1..6,
              gapRoundsMax: int 0..3, closeCallExtraGraders: int 0..4, fixedDepthAllowed: boolean,
              scrutiny: { deep: null | { roundsPerPoint: int 1..5, pointsPerDebate: int 1..30 },
                          exhaustive: null | { roundsPerPoint: int 1..8, pointsPerDebate: int 1..60 },
                          scrutinyLeverageMin: number 0..1, scrutinyWeakBelow: number 0..1 },
              opening: "ANGLE_MAP" | "BLIND_LISTS" | "SNOWBALL" }
```
- Start values: free {3,3,2,3,1,1,2,false, deep null, exhaustive null, 0.05, 0.5, ANGLE_MAP};
  plus {4,3,3,4,2,2,2,true, deep {2,6}, exhaustive {3,15}, 0.05, 0.5, ANGLE_MAP};
  pro {5,4,3,4,2,2,2,true, …same}; max {7,4,3,4,2,2,2,true, …same}; premium = pro (fallback for unknown premium ids).
  `opening` is filled from the Phase 1 measurement (default ANGLE_MAP = ruling S1).
- `mapStepBounds` (controller ruling X1): the output bound of the map's `MAP:merge` and `MAP:choose` calls, each a whole
  number of tokens from 8,192 to 32,768. The member is optional: absent, it reads the defaults `{ merge: 32768, choose:
  32768 }`. A written member is checked strictly (the refusal path is `mapStepBounds.merge` / `mapStepBounds.choose`).
  The publishers' row always writes it. The resolved shape carries `mapMergeBound` / `mapChooseBound`; the receipt carries
  `shape.map_merge_bound` / `shape.map_choose_bound`.
- Plan lookup: the run's plan id (FREE/PLUS/PRO/MAX) when billing is on, else tier free → `free`, premium → `premium`.
- Sizes are capped at run time: `answers ≤ distinct makers`, `graders ≤ distinct makers − 1`, `mapAIs ≤ makers present`.

## 2. Ask contract fields (P2a)

In `packages/contract` ask config (today only `{ depth }`, index.ts ~137–181), all optional, strict enums:
- `depthMode: "fixed" | "adaptive"` (default `"adaptive"`)
- `scrutiny: "standard" | "deep" | "exhaustive"` (default `"standard"`)
- `answerLength: "short" | "standard" | "detailed"` (default `"standard"`)
Normalisation (API, per plan): fixed→adaptive when `fixedDepthAllowed` false; scrutiny→standard when the plan's budget
is null; Free depth stays 2. Stored with depth in `core.run.depth_params` (JSON) as `{ depth, depthMode, scrutiny,
answerLength }`; `readFrozenHead` returns them; missing keys read as defaults (old runs).

## 3. Runner names (P2b)

- New judge leg kind: `"assigned-root"`; directive text: "Author the strongest case for the answer named in
  assigned_answer." Material fields (closed table): `question_line`, `assigned_answer`, `map_points`.
- Support/attack legs gain the material field `consideration` (the chosen key point's claim) when the shape row is on;
  directive sentence appended: "Build your reply on the consideration named in consideration." Closed-table change →
  the sealed judge contract hash changes (new register version; register `policy.hashes.judge`).
- Map call-site keys (as Phase 1): `MAP:angles`, `MAP:list:<i>`, `MAP:merge`, `MAP:gap:<k>`, `MAP:choose`.
  Gateway role `JUDGE`, lane `served`. Bound: `MAP:merge` and `MAP:choose` answer at the row's map step bounds (§1
  `mapStepBounds`; the run's `mapMergeBound` / `mapChooseBound`, read from its receipt), NOT the judge bound (X1
  supersedes the earlier "judge bound" wording). `MAP:angles`, `MAP:list:<i>` and `MAP:gap:<k>` keep the judge bound
  (preview floor 8,192).
- Map contracts fingerprint: `mapPromptContractHash()` sealed as its own OPTIONAL register row `mapContractHash` (a
  64-hex string; P2b contract deviation 1 supersedes the earlier `policy.hashes.map` idea); new register version.
- Close-call extension mark: `PANEL-CLOSE-CALL-EXTENDED`; scrutiny mark: `SCRUTINY-EXTENDED`; map marks (answer-scope
  records): `MAP_ANGLES_FALLBACK`, `MAP_MERGE_FALLBACK`, `MAP_CHOOSE_FALLBACK`, `MAP_UNAVAILABLE_TODAYS_OPENING`,
  `ANSWERS_FILLED`, `CHOOSE_QUOTA_FILLED` — added to the kernel's `CONDITION_MARKS` (never at its tail) each with a
  typed record.
- Round order: breadth-first global rounds across all positions (round 1 = all positions' chosen points + cross-replies;
  round k ≥ 2 = deeper exchanges), so δ/ε boundaries come after each full round.

## 4. Storage (P2b)

New migration (next free number at build time) with:
- `core.map_item(run_id uuid, step text, item_id text, ai_ref text, maker text, origin text CHECK IN ('BLIND','GAP','SHOWN'),
  angle_id text NULL, angle_kind text NULL, kind text CHECK IN ('POINT','ANSWER'), claim text, why text NULL, leans text NULL,
  list_index int NULL, position int NOT NULL, PRIMARY KEY (run_id, item_id))`
- `core.map_choice(run_id uuid PRIMARY KEY, answers jsonb, also_raised jsonb, marks jsonb, notes jsonb, opening text)`
- Superseded (built in `migrations/0116_debate_shape_map.sql`): `core.map_choice` holds `opening`, `marks` and the
  choice as encrypted `content` (`content_ciphertext`); `core.map_item` holds each item's text as encrypted content too;
  a third table, `core.map_position`, records which root argued each chosen answer.
- Both: append-only guards, runtime grants like other core carriers, content encryption like other debate text where
  enabled, TRUNCATE guard, erasure coverage. Read model: `readMapChoiceForRun(runId)`.

## 5. What people see (P2c)

- Story material: `alsoRaised: { claim: string; raisedBy: number }[]` (bounded by the story budget); story-shapes
  common.md paragraph "Also raised" (owner-editable text; the owner picks among 3 phrasings).
- Debate page: section "Also raised, not debated" (message keys `debate.alsoRaised.title`, `debate.alsoRaised.empty`;
  Superseded: built as `public.alsoRaised.title` and `public.alsoRaised.empty`);
  position title "The case for {answer}, argued by {ai}" (`debate.positionTitle`); 3 phrasings offered to the owner,
  option 1 in code.
- /new: Depth mode (Fixed / Adaptive), Depth of scrutiny (Standard / Deep / Exhaustive), Answer length (Short /
  Standard / Detailed) — keys under `newDebate.*`; legacy notice removed; all 35 locales (parallel Haiku translators by
  language group + one Opus spot-check of risky locales).

## 6. Practice (P2d)

- Practice `debate` mode accepts `--shape-policy <file>` that adds a `debateShapePolicy` row to the THROWAWAY database's
  register only (like Project 1's concurrency override); the report adds map marks, chosen answers count, also-raised
  count, panel extensions, scrutiny extensions.

## 7. Bindings P2b must keep (from P2a's money ceiling)

- Fixed mode adds one exchange per chosen point per round (linear, not branching).
- `MAP_UNAVAILABLE_TODAYS_OPENING` opens at most P positions with at most K round-1 children each and at most ONE cross-reply per position (target = next position in plan order) — never today's every-pair cross-exchange.
- Map repairs stay inside each call's own attempt allowance; a reassigned map list may be re-asked once on another AI (counted twice in the ceiling).
- A position handed on to another maker is handed on before its first call, or the re-ask stays inside the position site's own allowance.
- A run's frozen sizes are read from its receipt (`envelope_basis.shape`, via the shared reader `parseCostEnvelopeBasis`/`debateShapeOfReceipt`), never recomputed.

## 8. Question language (P2L)

Added 2026-10-13 from `2026-10-13-debate-shape-phase2-language.md` (P2L). Numbered 8 because §7 is P2a's binding list,
which the P2a ledger cites as "INTERFACE §7". Built only inside the new shape: with `debateShapePolicy` absent (or
switched off, P2b's `debateShapeInForce`), nothing here runs and every byte is today's.

- Kernel (`packages/kernel/src/question-language.ts`): `QuestionLanguage = Readonly<{ code: string; name: string }>`
  (ISO 639-1 code, a script subtag for two-script languages such as `sr-Latn`; English name);
  `questionLanguageSentence(language)` (THE one named sentence every new-shape call carries); `QUESTION_LANGUAGE_FIELD`
  = `"question_language"` (the material field, `{"code","name"}` JSON, always last); `replyLanguageCheckFor(questionLine,
  language | null, patterns)` (today's check without a lock, the locked check with one); `languageDirectiveFor`,
  `questionLanguageOf`, `questionLanguageFromRun`, `withQuestionLanguageField`, `lockedReplyLanguageExpectation`.
- Register row (optional, its own family): `questionLanguagePolicy`, kind `"QUESTION_LANGUAGE_POLICY"`, `version: 1`,
  `{ fastCheck: { provider: "anthropic", model, effort, timeoutMs, maxOutputTokens, priceMicrosUsdPerMillionTokens } | null,
  instruction }`; parser `parseQuestionLanguagePolicy` (`QUESTION_LANGUAGE_POLICY_INVALID:<path>`), reader
  `readQuestionLanguagePolicy(pool, version)`; absent = the code's start values (Claude Haiku 5.5, effort `low`, 5 s).
- Ask contract (optional fields of `AskRequestSchema`, read only with the shape row): `site_language` (one of the 35
  site locales, `SiteLanguageSchema`) and `question_language_choice` (`{ check_ref, choice: "USE_REWRITE" | "KEEP_MINE",
  original_question_line? }`, strict; never a language or text of the page's own).
- The offer: `409 QUESTION_LANGUAGE_CHOICE_NEEDED` with `{ error, message, offer: { check_ref, main_language, languages_seen,
  proposed_question } }` (`QuestionLanguageChoiceNeededSchema`); a stale or forged choice is `409`
  `QUESTION_LANGUAGE_CHECK_INVALID` / `QUESTION_LANGUAGE_CHECK_EXPIRED` / `QUESTION_LANGUAGE_CHOICE_MISMATCH`. Client:
  `submitAskOrLanguageChoice(input)`.
- Storage: the lock goes into `core.run.argument_language_tag` / `argument_language_name`; the stored ask contract
  gains one member `question_language` (codes and hashes, plus the original question only when a rewrite was used).
- The planner's record (ruling CR-3): `LANGUAGE_PLANNER_DISAGREES` is an operator-only MAP NOTE (`MAP_NOTES`, detail
  `<locked>:<planner>`), with `MapResult.plannerLanguage`; it is NOT a condition mark (`CONDITION_MARKS` stays at P2b's
  46) and never reaches the honesty drawer, the story or any page.
- Map: the angle planner's answer form names `question_language` FIRST; `mapContractHash` changes once more (publish the
  preview's map hash only after P2L Task 15).
