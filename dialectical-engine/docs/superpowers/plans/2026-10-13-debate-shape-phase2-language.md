# Debate Shape Phase 2 — P2L, question language (implementation plan)

> **Renumbered 2026-10-14:** the migrations this plan calls 0116 (the debate shape map) and 0117 (the language check's site cost) are now 0117 and 0118: the merge of `origin/dev` 221d784db brought dev's own 0116 (`0116_mail_locale.sql`) first. The numbers below are historical.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a new-shape debate (the optional register row `debateShapePolicy` is present), the debate's language is decided once, before the debate exists, and locked. The decision works like this:

- the page sends the person's site language with the question;
- a local library (eld) checks the question on our server;
- only when eld does not settle it, one short fast-AI call names the language;
- a question that really mixes languages gets a one-language rewrite the person approves.

The locked code and English name go into `core.run.argument_language_tag` / `argument_language_name`. Every AI call of the debate then gets them in two forms: the material field `question_language: {code, name}` and ONE named sentence. Every reply check compares against the locked code instead of guessing the question again. The angle planner also names the language it sees, and a disagreement is recorded for operators only (a map note, never a mark people see), never acted on.

With the row absent, everything stays today's behaviour byte for byte: today's guesser `detectArgumentLanguage` still decides at intake, today's directive and today's reply check are unchanged.

**Owner rulings this plan implements:** the question-language spec 2026-10-13 (owner rulings L1–L8, outside this repository; never copy it in). Only what implementers need is restated here. Ruling L8: it is built inside the new debate shape.

**Architecture:**

- `@debateai/kernel` gains one small module, `question-language.ts`. It holds:
  - the language table (ISO 639-1 codes with English names, our 35 site languages named exactly as today);
  - the named sentence, the material field, and the locked reply expectation;
  - one switch, `replyLanguageCheckFor` / `languageDirectiveFor`: today's path when no language is locked, the locked path when one is.
- The decision is made in `apps/api/src/question-language/` (pure decision table, eld wrapper, fast check, signed check reference, the decider class).
- It runs as the FIRST step of `PostgresAskApplication.submit`, after the route's crisis, consent, team, admission and country checks and before billing, admission and the preview admission lock.
- A real mix ends the request with `409 QUESTION_LANGUAGE_CHOICE_NEEDED` carrying the offer and a signed check reference. The page asks the person and sends the same ask again with the choice.
- The owner's settings (fast-check provider + model + limits, and the editable instruction text) are one optional sealed register row, `questionLanguagePolicy`. Absent means the code's start values.
- Inside the debate, the runner passes the locked language to the judge, the map, the story, the answer writer and the answer checker only when the run is a shape run (`shapeRun !== null`, P2b).

**Tech Stack:** TypeScript (ESM, NodeNext, strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), zod 4.4.3, vitest, pnpm 11.20.0 workspace, Node >= 26.8.2 (full ICU), PostgreSQL 18 (embedded for integration tests), `eld` 2.1.0 (new, exact pin).

**Related documents (this folder):**

- debate shape spec `docs/superpowers/specs/2026-10-12-debate-shape-design.md`;
- binding names `2026-10-12-debate-shape-phase2-INTERFACE.md`;
- sibling plans P2a (built), P2b, P2c, P2d (planned, not yet executed). This plan's "Cross-plan amendments" lists the exact edits they need.

All paths are relative to the engine folder `dialectical-engine/` of the worktree `.claude/worktrees/debate-shape-p2` (branch `feat/2026-10-13-debate-shape-phase2`). Every command runs from that folder.

## Amendments 2026-10-13

The controller's rulings CR-1..CR-7 (section "Controller rulings", kept below as the record) are now folded into the
task text, so every task's steps, tests and interfaces agree with them. Code facts were checked at 803f58128.

- CR-3: `LANGUAGE_PLANNER_DISAGREES` is an operator-only MAP NOTE (`MAP_NOTES`), never a condition mark: Task 14 is reworked (no kernel, serve, label, locale or pin edits; `CONDITION_MARKS` stays at P2b's 46), Task 15 records a note, the honesty-drawer text and its wording pick are removed (Owner-visible defaults, Owner steps), cross-plan amendment 2 is dropped, the execution order no longer moves the mark pins.
- CR-3: the operator channel is the map's notes, stored (encrypted per run) in `core.map_choice` content and read back with `readMapResultForRun`, plus `MapResult.plannerLanguage`; P2d's practice report reads them (Tasks 14, 15).
- CR-1: checked: the route's "per-person admission charge" is the admission policy's request limiter (`admitOrRefuse(reply, "asks", …)`, apps/api/src/index.ts, refusal `ADMISSION_RATE_LIMITED`), not the debate allowance or billing, which run inside `submit` after the language step; so charging it for the offer request is accepted. D1, Task 0 Step 4 (re-check at build) and Task 11 (a test that an offer reaches no allowance or billing step).
- CR-2: the always-ask-the-fast-AI sites are one constant in `decide.ts`, `FAST_CHECK_ALWAYS_SITES` = `ga`, `id`, `mt` (eld lacks them), `hr` (Serbian/Bosnian in Latin script), plus every site Task 3 measures with a confident cross-locale confusion (`ELD_CONFUSED_SITES`, recorded in `eld-tuning.ts`). Tasks 3, 7; Owner-visible defaults; Owner steps.
- CR-4: Task 0 Step 5 checks, after the origin/dev merge, whether both preview gates accept thinking off for Haiku; pre-checked on origin/dev da35a529b: the Haiku row's menu is `high`, `medium`, `low` (no `default`), so the start value stays `low` unless the check finds otherwise (Task 4 says how to switch). Contract deviation 1.
- CR-5: the check-reference key is derived with HKDF from the API's existing blind-index key (`blindIndexKey`, main.ts, the same root `SocialAuthService` derives from), purpose label `question-language-check-v1`, so every API process of one deployment shares it; practice and tests keep a per-process random key. A second offer for the same person and question within 15 minutes is answered with the fallback lock (`REPEAT_OFFER`), and the page shows the pop-up at most once per submit. D2, Tasks 8, 10, 12, 18.
- CR-6: the fast check reaches Anthropic only through the preview gate (no key in the API) or the hosted support target that already exists; no question text in any log line. Tasks 6, 12.
- CR-7: kept defaults listed for the owner at the end (Owner steps 8).
- Cross-plan amendments: marked as applied to P2b/P2c/P2d on 2026-10-13, with the CR-3 adjustments.
- P2b pre-flight corrections (2026-10-13, P2b "Pre-flight corrections 2026-10-13"), three follow here:
  - P2b PF-B53: P2b Task 15 now exports `runShapeDebate(harness, options)` from `tests/support/debate-shape-harness.ts` (options include `language?` and `question?`); Task 17's case calls it with the suite's `harness` and adds only `prompts` to its result.
  - P2b PF-B47: `mapConditionRecords(result, runId, servedRootNodeId)` takes a third argument (map records name the served root's node); Task 14's test and cross-plan amendment 4 pass it.
  - P2b PF-B25: Task 19's contract test gains the "never redefines a function an earlier migration owns" case in its corrected form (a `CREATE … FUNCTION` regex, never a bare `FUNCTION <name>` substring, which the migration's own `EXECUTE FUNCTION` lines would contain).

## Pre-flight corrections 2026-10-14

The pre-flight scan (`.superpowers/sdd/2026-10-13-debate-shape-phase2-language/preflight.md`: 4 BLOCKER, 44 FIX, 16 NOTE, checked at 249ed0cd8) and the controller's rulings below are folded into the task text. Line numbers in the tasks drift: find every name by name.

**Controller rulings (binding; they override the findings where they differ):**
- **L-MIX** (PF-L18): eld "sees a mix" when the question, cut into clauses (each at least eld's measured clause minimum), gives at least two CONFIDENT clause readings in different languages; names, brands and borrowed capitalised words cannot make a clause confident alone. Then the fast AI decides (`is_real_mix`). The rule and its minimum are measured in Task 3 on a mixed set built from the #158 legal-page sentences (RO+EN joins) plus pure controls. A missed mix falls back to today's lock (the site language). Cost if wrong: one extra cheap fast call on some single-language questions. Tasks 2, 3, 7.
- **L-NOCONSENT** (PF-L30): a signed-out (legacy) person never reaches the fast AI (no recorded consent): eld + site language decide, no rewrite offered. Cost if wrong: a signed-out mixed question is not offered a rewrite. D1, Tasks 10, 11.
- **L-ROUTE** (PF-L35): a deployment with no Anthropic gate (the preview) never takes the hosted route; with no gate the fast check is OFF (eld + site language). The API never holds a vendor key on the preview (CR-6). Task 12.
- **L-KIT** (PF-L2, PF-L33, PF-L34): Task 0 ALWAYS merges the latest origin/dev (kit v3 from #163); kit v3 carries `debateShapePolicy`, `mapContractHash` and `questionLanguagePolicy` (the P2a/P2b gap too), owned by Task 0 Step 2b (the shape rows) and Task 12 (the language row).
- P2b final review's notes for P2L: root 0's room bound frames the `question_language` field and the sentence, and the P2b fix wave's T12-R3 room (first attempt + one retry, and a repair request) frames it too (Tasks 13, 17); the writer change wraps the single `toSynthesisPromptMaterial` projection (Task 13); moment replay accepts a trailing `question_language` field (Task 13); `judgeLegMaterial(leg, questionLine, declared)` gains a 4th parameter (Task 13); the map entry is `mapRunAngleMap` (Task 15); five judge-input sites, `rootZeroRequestBytes` among them (Task 17).

**Decisions of this corrections pass** (controller may overrule):
- PF-L10: sentences of the locales eld lacks (`ga`, `id`, `mt`) are left out of `wrongLockable`; they still count in `siteConfusions`, so their neighbour sites become always-ask. Cost if wrong: none for safety (CR-2 still catches them); the 0.05% bar becomes reachable.
- PF-L38 (B9): `firstPositionCallProjections` frames the lock (the longest name the kernel can lock) only when the shape row is in force at the API's boot; without the row it is today's number. Cost if wrong: none (the row-absent boot is unchanged).
- PF-L58: option (a) — the SECURITY DEFINER function is the only writer of a language-check row; `recordSpend` refuses `LANGUAGE_CHECK`.
- L-MIX numbers: clause cut at `. ! ? ; : ,` (and full-width forms), spaced dashes, brackets and line breaks; only lower-case words count (a segment's first word may be capitalised); clause minimum chosen from 12/20/30/40 with at most 5% of pure questions flagged, then the most mixes caught, then the longer minimum.
- L-NOCONSENT is implemented as a `fastCheckAllowed` input to the decider (false for a legacy principal), so the step keeps its place before billing; the sign-in refusal that PF-L30 named sits inside the billing block, right before `resolveBillingAsk`.
- Global Constraints gain one line: tasks that edit files the architecture guards read also run those guards (the P2b lesson).

**Per finding** (id → what changed):
- PF-L1 → Task 0 Step 1's grep is `grep -n "framedJudgePromptForTest"` (+ `judgeLegFrameSpec`).
- PF-L2 → Task 0 Step 2 merges origin/dev always (#163 kit v3), with the three expected "keep both" conflicts named; Step 5 no longer waits on it.
- PF-L3 → Task 0 implementer note (CR-1, CR-4, CR-5 re-confirmed, with lines).
- PF-L4 → Task 1 keeps the private `LANGUAGE_NAMES` and adds the typed alias `ARGUMENT_LANGUAGE_NAMES: Readonly<Record<string,string>>`.
- PF-L5 → Task 1 test gains the two Review-Focus-5 assertions, plus an implementer note.
- PF-L6 → Task 2 reads eld's `info().Languages` (capital L) from `apps/api/node_modules/eld/index.d.ts`.
- PF-L7 → Task 2 grep allows no space after the colon; `EldReader` declares `languages()`.
- PF-L8 → Task 2 implementer note (import form; no score in `EldReading` until P2d needs it).
- PF-L9 → Task 3 and Global Constraints: tools files stay out of the corpus manifest; the `node:fs` import is deleted when unused; the measurement is about 300 MB.
- PF-L10 → Task 3: the eld-lacks locales leave `wrongLockable` (decision above); chosen size and memory reported to the owner.
- PF-L11 → Task 4: the row emits `$.`-prefixed paths, copies `protoKeyPath`, exports nine names.
- PF-L12 → Task 4 implementer note; Owner steps 9 (rules gate follow-up).
- PF-L13 → Tasks 5, 6, 12: every refusal tested with `toThrow(/CODE/)` carries its code as its message.
- PF-L14 → Task 5: main and seen codes read by their primary subtag; `sr-Latn` and `pt-BR` test rows.
- PF-L15 → Task 5 implementer note (racing the signal).
- PF-L16 → Task 6: missing usage or an abort after sending records the projected maximum (`FastCheckUsage.projected`); Task 19 writes it.
- PF-L17 → Task 6 implementer note (preview gate facts).
- PF-L18 (BLOCKER) → ruling L-MIX: Task 2 reads clauses, Task 3 measures the clause minimum and records `eldSeesMix`, Task 7's `eldSettles` refuses a mix, with table rows and tests.
- PF-L19 → Task 7: seen languages de-duplicated by primary code, main first, at most six (test); Task 10: the offer is `safeParse`d and a refused one locks the main language (`FAST_MIX_NO_OFFER`, test).
- PF-L20 → Tasks 7 and 10: "eld settles" tests pick a site outside `FAST_CHECK_ALWAYS_SITES`; Task 3 implementer note on a count floor (controller's call).
- PF-L21 → Task 7 implementer note (decision table coverage, now with the mix case).
- PF-L22 → Task 8 implementer note (READY; pass `ownerScopeOf(principal)`).
- PF-L23 → Task 9: `submitAskOrLanguageChoice` calls `requestJson` with `recover`; two names added to `client.ts`'s import block.
- PF-L24 → Task 9 test uses `createContractClient("https://api.test", fetch)`; the 409 is `SERVER_FAILURE` with `serverCode`.
- PF-L25 → Task 9: `SiteLanguageSchema = CatalogLocaleCodeSchema`, `SITE_LANGUAGE_CODES = …options`; `original_question_line` max 8192.
- PF-L26 → Review Focus 4 names Task 5 for the time limit; Task 10 implementer note (in-process memory, repeat pays one call, `onDecided`).
- PF-L27 → Task 11: the new `#submitWithRoom` parameter goes before `fundingBasis`.
- PF-L28 → Task 11: `askRefusalStatus` returns `401 | 403 | 409 | 422 | 429`.
- PF-L29 → Task 11: the "known-domain-code list" sub-step is dropped; Task 18 maps the 409 in `requestFailure.ts`.
- PF-L30 → ruling L-NOCONSENT (applied as `fastCheckAllowed`, see decisions); Task 11 wording "first step" corrected; tests.
- PF-L31 → Task 11's CR-1 case runs with billing on (`billingFor`) and asserts six ports untouched.
- PF-L32 → Task 11 implementer note (two call sites, four ask-contract keys, practice path).
- PF-L33 → Task 0 Step 2b (shape rows) and Task 12 (language row) through `buildPreviewSourceRowsV3` / `composePreviewSnapshotV3`, with tests.
- PF-L34 → Tasks 0 and 12: `native-operator.mjs` (plan keys, v2/v3 arguments), `release-artifacts.mjs`, and the pins (v2 ~321/~375/~400, v3 ~221) updated; hosted member cases copied from the unit file.
- PF-L35 → ruling L-ROUTE: Task 12's `questionLanguageRouteFor` (PREVIEW or NONE on a preview, never HOSTED), with a test.
- PF-L36 → Task 12 states, and Task 19 does, the move of the support-target parse and credential read above the language step.
- PF-L37 → Task 12 lists main.ts's imports, uses `askQuestionMaxBytes()` (already imported) for the bound, and drops the non-existent `--dry`.
- PF-L38 (BLOCKER) → Task 13: `rootPositionRequestBytesBound`, `rootZeroRequestBytes` (and the T12-R3 retry/repair bounds) take the lock, B9 frames the longest lock when the shape row is in force (`questionLanguageForBounds`, Task 1); Task 17 passes `shapeLanguage` at the room's call site(s); tests in both.
- PF-L39 → Task 13: moment replay schemas gain `questionLanguage`, a trailing field is read and stripped before comparison, and passed to the framers; replay test.
- PF-L40 → Task 13: `withQuestionLanguageField(lengthed ? [...material, lengthField] : material, lock)`, test; Task 17 updates P2b's `answer_length` pin.
- PF-L41 → Task 13 test: `.slice(0, -3)` plus field comparisons; the checker case sends a parseable verdict (PARSED unlocked, refused locked).
- PF-L42 → Task 13: the lock is `judgeLegMaterial`'s 4th parameter, after `declared`.
- PF-L43 → Task 13 implementer note (no judge or composer hash moves).
- PF-L44 → Task 14: the `MAP_NOTES` pin is in `tests/unit/map-package.test.ts`; run and commit it.
- PF-L45 → Task 14 implementer note (no database change; undefined on older maps).
- PF-L46 → Task 15 test calls `mapRunAngleMap({...})`.
- PF-L47 → Task 15 updates `map-prompts.test.ts` and `map-specs.test.ts` and runs the first.
- PF-L48 → Task 15: no non-null assertion (`mapLockedLanguage`), files named in `git add`, and the "first" request moved into the code-owned answer form; implementer note.
- PF-L49 (BLOCKER) → Task 16 and Task 20 use the new file `tests/unit/story-locked-language.test.ts`; the existing R2 file also runs.
- PF-L50 → Task 16: `StoryWriteInput` is edited in `writer.ts` (material.ts dropped from the files).
- PF-L51 (BLOCKER) → Task 17's unit test feeds the real directives and the third strip alternative is built like the first two (whole sentence, "fatalFlags" gone).
- PF-L52 → Task 17: `stubReplyLanguage` knows the locked Romanian sentence, the harness's MAP prose follows `question_language`, `prompts` leaves out PROBE, and the whole suite is re-run (digests change).
- PF-L53 → Task 18: `createDebate` keeps returning `{ id }`; mocks resolve `{ id: "run-1" }`.
- PF-L54 → Task 18 test: `vi.hoisted` mocks, `{ status }` consent mocks, `readSession` rejects, native value setter, an inline catalogue loader.
- PF-L55 → Task 18: `cd apps/ui && node --import tsx --test lib/i18n/catalog.test.mjs`.
- PF-L56 → Task 18: `isLocale` guard, then the UI's own typecheck alone.
- PF-L57 → Task 18 Step 0: `grep -L` trigger over all locales, the P2c translator process cut to six keys, the P2c skip rule; API-first note.
- PF-L58 → Task 19: option (a), one writer (decision above); capability probe is the function; price from the policy row.
- PF-L59 → Task 19 lists the eleven pin files (seven integration, each alone).
- PF-L60 → Task 19 implementer note; Owner steps 4 (`spend_unrecorded`).
- PF-L61 → Task 20 adds the render, 0117 contract, kit v3 and integration files, the guards and the UI typecheck.
- PF-L62 → Owner steps 1: let shape debates finish, one version with P2L's map hash plus P2b's judge/composer hashes, re-run the hosted publisher, API before or with the UI.
- PF-L63 → Owner steps 2: "v2/v3 kit".
- PF-L64 → Self-review table gains L8, mix, consent, money and kit rows; implementer note on sealed values.

**Task 18 interplay with P2c (P2c pre-flight corrections, 2026-10-14):**
- P2c PF-C32 → Task 18 Step 4 also runs `tests/render/debate-shape-new-controls.test.tsx` and `tests/unit/debate-shape-new-ask-wire.test.ts`.
- P2c PF-C41, PF-C36 → Task 18 Step 0: `grep -L … || true` (skip when it prints nothing); packets in the git-ignored `.superpowers/sdd/2026-10-13-debate-shape-phase2-language/translations`; P2c's merge script used with its removal and replace lists emptied (it is no longer add-only).
- P2L ledger notes for Task 18 → the `submit()` loop allows four `createDebate` calls plus the consent retry (the CR-5 test makes four); USE sends `proposed_question` as given and the first try's `topic.trim()` as `original_question_line`; after a stale refusal the page never resends a `check_ref` and re-checks once with the person's wording and no choice; a second offer in the same press is answered with KEEP_MINE and its new `check_ref`, never a second pop-up; branch on `serverCode`; the offer comes before plan and allowance refusals (D1 order); known trade-off: after a stale USE_REWRITE the REPEAT_OFFER lock keeps the person's wording.

## Global Constraints

**Row absent = today, byte for byte**

- With `debateShapePolicy` absent, `submit` does not build, call or read anything new. The new ask fields (`site_language`, `question_language_choice`) are accepted by the schema and ignored. `core.run` gets `detectArgumentLanguage`'s tag and name, and the stored `ask_contract` has exactly today's four keys.
- A run without a shape receipt (P2a: no `envelope_basis.shape`) is argued with today's directive and today's reply check, even when the API that admitted it had the row. This includes a one-maker run admitted while the row was present, which has no shape. Ruling L-SHAPED-ONLY (final review I2, 2026-10-14): the API stores the decider's lock (the argument-language columns and the ask-contract member) ONLY when admission minted a shape receipt; an unshaped run stores today's detected tag and name and today's four ask-contract keys, so its directive and its reply check come from the same guess, as today. The runner reads the lock from the stored pair only when the run's receipt has a shape (a shaped receipt that drops to one maker at claim keeps its lock).
- Every new branch in shared code is guarded by a `QuestionLanguage | null | undefined` that is `null`/absent on today's path. Tests pin today's prompt bytes (Tasks 13, 15, 16).

**The language**

- A locked language is `QuestionLanguage = { code, name }`.
  - `code` is a lower-case ISO 639-1 code. For Serbian, Uzbek, Azerbaijani, Kazakh and Mongolian it carries a script subtag (`sr-Latn`, `sr-Cyrl`) taken from the question's own writing system.
  - `name` is English: our 35 exactly as `LANGUAGE_NAMES` in `packages/kernel/src/argument-language.ts` names them; any other code as Node's `Intl.DisplayNames(["en"])` names it.
- Migration 0072's CHECK `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$` already accepts every such code.
- `"und"`, `"unknown"` and codes outside ISO 639-1 are never locked.

**Never block the person**

- Every failure of eld, the fast AI, its transport, its reply or its proposed rewrite ends in a lock: eld's top language when eld was confident, otherwise the site language.
- Only a valid real-mix offer stops the request (409), and the person can always answer "Keep my wording".

**Consent and privacy**

- The fast call runs only inside `submit`, which the route reaches only after the crisis check and the sensitive-data consent check. A question in crisis never reaches the fast AI.
- No question text, rewrite or reply text is ever logged.
- Logs and records carry codes only: language codes, outcome codes, hashes.
- The original question of an accepted rewrite is stored only inside the run's stored ask contract, which is encrypted with the run's content for every signed-in person (`packages/db/src/index.ts` `startRun`, unchanged).

**Money**

- On the preview, the fast call goes through the existing guarded fetch (`createPreviewGuardedFetch`) to the Anthropic gate. The gate has no run concept, so the call is a site cost in the Anthropic daily pot by construction. No app-side row is written.
- On hosted, the fast call is enabled only when the run-less spend record of Task 19 exists (capability check at boot). Until then hosted runs with eld + site language and no rewrite.
- Each preview call reserves the Haiku row's whole output bound (about $0.0165) and settles at its real cost (about $0.00005).

**Sealed values**

- `register.bootstrap.json`, every existing `migrations/*.sql`, `packages/db/src/index.ts` (its `NATIVE_MIGRATE_MODULE_SHA256` pin) and every sealed register row stay as they are.
- The only new migration is Task 19's (number 0117, renumber at build time if another 0117 landed first; P2b owns 0116).

**Source rules** (tools/orphan-audit `auditSourceRules`, pinned by tests/architecture/scaffold.test.ts) apply to every shipped `.ts`:

- no `process` + `.env` text;
- every `switch (` has `default:` and `exhaustive(`;
- no exported ALL_CAPS constant equal to a bare number (numbers live inside functions or frozen objects);
- no import specifier containing `test`/`fixture` in shipped code;
- no `/Users/<name>/` path and no other one-machine path.

**Depth-literal oracle** (tests/support/depthOracle.ts): a shipped line mentioning "depth" must not hold a bare `5`, nor a `6` after `<`, `>`, `<=`, `>=`. This plan's new files never mention depth.

**Shipped corpus.** Every new non-test `.ts` under packages/ or apps/ goes into tests/support/shipped-corpus.manifest.txt (the corpus roots are `packages`, `apps` and `web`: `SHIPPED_ROOTS` in tests/unit/s1-1-depth-contract.test.ts; the manifest lists no `tools/` file, so Task 3's `tools/question-language-tune/*` stays OUT of it). Regenerate with `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`. (Pre-flight PF-L9.)

**Running tests (owner's 16 GB Mac)**

- Before any `vitest run`, `pgrep -fl 'vitest[ ]run'` must show at most one other run, and `memory_pressure | tail -1` must show at least 40% free.
- One file at a time: `pnpm exec vitest run <file>`.
- Integration files (embedded Postgres) run alone, never beside a typecheck or another integration file.
- Never the full suite; CI is the judge.
- Every task that edits a file one of the architecture guard tests reads also runs those guard files, one at a time (P2b lesson, 2026-10-14: four guards went red unseen for several tasks). The usual ones: `tests/unit/prompt-surface-guard.test.ts`, `tests/unit/call-lane-gateway.test.ts`, `tests/architecture/s10-carrier-erasure-red.test.ts`, `tests/architecture/dev-runner-provider-set.test.ts`. Find the rest with `grep -ln "<edited file's name>" tests/architecture/*.test.ts` (P2b's own verification ran every `tests/architecture` file one at a time; this plan's Task 20 runs the four named here).

**Commits** end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only the files the task names (owner sessions share worktrees). No push and no PR inside this plan.

## Review Focus

The six failure modes most likely to ship untested, and where each is caught:

1. **A page-made language or rewrite is accepted.**
   - Risks: a forged or edited reference, another person's reference, a reference replayed for another question, "Use this version" with text that is not the proposal, or a `language` key slipped into the choice.
   - Caught by Task 8 (seven refusal cases on the pure verifier) and Task 11 (the route answers 409/400 and starts no run).
2. **Row absent changes a byte.**
   - Risks: the decider runs, `ask_contract` gains a key, or the tag comes from somewhere other than `detectArgumentLanguage`.
   - Caught by Task 11's integration test (row absent: today's tag, exactly four ask-contract keys) and Tasks 13/15/16 (today's prompts byte-identical).
3. **A wrong lock.**
   - Risk: eld confidently reads a question as the site language when it is not (Serbian Latin as Croatian, Malay for Indonesian, Romanian without diacritics as something else).
   - Caught by Task 3's measured threshold (no cross-site wrong lock between ro and en on the legal-page set, overall rate under the recorded floor) and Task 7's alias rule (eld never settles a site language it lacks).
   - Risk (ruling L-MIX, pre-flight PF-L18): a Romanian question with whole English clauses is read confidently as Romanian on the Romanian site, so eld settles it and the person is never offered a rewrite. Caught by Task 2 (eld also reads each clause of the question), Task 3 (the clause rule's minimum length measured on built RO+EN joins and pure controls) and Task 7 ("eld sees a mix" never settles: the fast AI is asked).
4. **The fast AI blocks or slows the person.**
   - Risks: a hung transport, a malformed reply, a proposal in the wrong language.
   - Caught by Task 7 (every DOWN reading locks), Task 5 (the time limit aborts at `timeoutMs` inside `createFastCheck`; a slow transport ends in DOWN/TIMEOUT) and Task 10 (a DOWN reading ends in a lock, never a refusal). (Pre-flight PF-L26: the time limit lives in Task 5.)
5. **The reply check still re-guesses the question in a shape run.**
   - Caught by Task 1 (the locked check reads the code even when the guesser would read "und") and Task 17 (the shape run's captured prompts carry the named sentence and never the fallback form).
6. **The planner's language changes the debate, or reaches people.**
   - Caught by Task 15: a disagreement is one operator-only map note, and every later call still carries the locked language.
   - Caught by Task 14: the note is never a condition mark, so no honesty drawer, story or page can show it (ruling CR-3).

## Decisions the spec left to the build

**D1. The check is the first half of `POST /v1/asks`, not its own endpoint.** Reasons:

1. **The route's pre-flight order is the safety order.** The crisis check, consent, the preview team rule, the per-person admission charge and the country gate already run, in this order, before `submit`. A separate endpoint would have to repeat all five in the same order. Getting one wrong would send a crisis question, or a question without consent, to an AI company.
2. **The common case costs no extra round trip.** When eld settles the question, or the fast AI names one language, the same request goes on to create the debate. Only a real mix, which is rare, needs a second request.
3. **No new route.** There is no new entry in the closed `authorizationPolicyInventory`, no new admission scope (a new scope would need a new sealed admission-policy value), and no new CSRF or CORS surface.
4. **`submit` is also what the practice tool calls** (`tools/preview-practice/practice-debate.ts`). Putting the step inside `submit`, not in the route, gives practice debates the same language flow.
5. **No lock is held during the call.** The step runs before billing, admission and the preview admission lock, so the up-to-5-second call never holds the advisory lock that serialises preview asks.
6. **A signed-out (legacy) person never reaches the fast AI** (ruling L-NOCONSENT, pre-flight PF-L30). The route checks sensitive-data consent only for signed-in people, so a legacy asker has no recorded consent. For a legacy principal `submit` asks the decider with `fastCheckAllowed: false`: eld and the site language decide, and no rewrite is offered. Cost if wrong: a signed-out mixed question is not offered a rewrite.

The cost: in the real-mix case the route's request limiter is charged twice, once for the request that returned the offer and once for the resubmission. Accepting a reference as "already charged" would let a reference be replayed to skip admission.

Ruling CR-1, checked (2026-10-13): that charge is the admission policy's request limiter (`admitOrRefuse(reply, "asks", "POST /v1/asks", …)` in apps/api/src/index.ts, refusal `ADMISSION_RATE_LIMITED`), an anti-spam limit. The person's debate allowance and money (billing hold, daily/monthly debates, credit) are read inside `submit`, AFTER this step, so an offer never touches them; only the resubmission that starts the debate does. Task 0 Step 4 re-checks this at build time and Task 11 pins it with a test.

**D2. The check reference is a stateless signed token, not a stored row.** Reasons:

- No migration, no table holding question text, no cleanup job, no database write on every check.
- The reference only has to bind what the server already decided. It carries hashes and codes, never text.

The format is `base64url(payload JSON) "." base64url(HMAC-SHA256(key, payload part))`. The payload is:

```text
{ v: 1,
  o: first 32 hex of sha256(owner scope),            // "owner:<ownerRef>" or the legacy asker id
  s: site language code,
  q: sha256 hex of the trimmed original question,
  p: sha256 hex of the trimmed proposed question,
  m: main language code (QuestionLanguage.code),
  e: expiry, ms since epoch (now + 15 minutes) }
```

Binding works like this. The choice is not in the token. Instead, `choice` and the submitted text must match a hash:

- **USE_REWRITE:** sha256(question_line) must equal `p`, and sha256(original_question_line) must equal `q`;
- **KEEP_MINE:** sha256(question_line) must equal `q`.

The locked language is always `m`. A page therefore cannot pick a language, a rewrite, or another person's or another question's reference.

The key (ruling CR-5) is derived, not random: HKDF-SHA-256 over the API's existing blind-index key (`blindIndexKey`, loaded at boot in apps/api/src/main.ts from `BLIND_INDEX_KEY_PATH`, the root `SocialAuthService` already derives its flow key from), salt `debateai:question-language:v1`, info `question-language-check-v1`, 32 bytes. Every API process of one deployment therefore verifies every other's references, and a restart keeps them valid. The practice tool and the tests use a per-process random key (one process). A reference that still fails (expired, edited) makes the page check again without one; a second offer for the same person and question within 15 minutes is then answered with the fallback lock, never a second pop-up (Task 10, `REPEAT_OFFER`; Task 18).

Replay within 15 minutes by the same person, for the same question, gives the same lock, which is harmless.

**D3. Storage needs no migration for the lock.**

- The locked code and name go through `startRun`'s existing `argumentLanguageTag` / `argumentLanguageName` inputs (migration 0072's columns).
- The rest goes into the stored ask contract as one new member, `question_language`, present only with the row: the original question, whether the rewrite was accepted, the lock's source, the site language, eld's and the fast check's codes, and the fast check's contract hash. The ask contract is already encrypted with the run's content for signed-in people, erased with the account (migration 0040), and read by nothing else.
- `packages/db/src/index.ts` is not edited.

**D4. eld runs over its whole 60-language set, never restricted to our 35.** Restricting it (`setLanguageSubset`) would force an outside question into one of ours, for example Catalan read as Spanish or Malay as one of ours. On the Spanish site that would lock Spanish with no fast call. The restriction the spec wants comes from the rule itself: eld settles only when its top language EQUALS the site language, and the site language is always one of ours. See Contract deviation 2.

## Contract deviations

1. **"Thinking off" is not possible today; the fast call uses effort `low`.**
   - The preview Anthropic gate accepts an Anthropic body only with `output_config.effort` from the Haiku row's menu (`high`, `medium`, `low`). It refuses "default"/"none" (packages/providers/src/preview-test.ts `anthropicBodyAccepted`, `preview-models.ts` row menus). The Python gate has the same list (`preview_budget_helper.py` `AnthropicProfile.effort_words`).
   - Real "thinking off" needs a coordinated TypeScript + Python gate change with its parity fixtures. That is out of scope here and listed as an owner follow-up.
   - The row's `effort` field defaults to `"low"`. `timeoutMs` (5,000) still bounds the call, and on timeout the person gets the fallback lock.
   - Ruling CR-4: after Task 0 merges origin/dev (it brings the owner's thinking-effort setting, PR #149), Task 0 Step 5 checks whether BOTH preview gates accept thinking off for Haiku; if they do, the start value becomes that word (Task 4 says how). Pre-checked on origin/dev da35a529b: the Haiku row's menu is `high`, `medium`, `low`, with no `default`, so `low` stands.
2. **eld also lacks Irish (`ga`) and Maltese (`mt`), not only Indonesian.**
   - eld 2.1.0's README lists 60 languages. Our 35 minus that list is `ga`, `id`, `mt`. Bosnian is absent but is not one of our 35, and Serbian is Cyrillic only.
   - The spec's default applies to all three: on those sites the fast AI always checks.
   - In the fallback (fast AI down, or local mode), an eld top language measured as a near neighbour of the site language is read as the site language. `ms` on the Indonesian site is the known case. Task 3 measures the `ga` and `mt` neighbours and records them in `ELD_SITE_ALIASES`.
3. **The spec's "restrict eld to our list where possible" is not done.** See D4: it would cause wrong locks for languages outside our 35.
4. **The Romanian pop-up wording is adjusted so the filled-in names read correctly.**
   - The spec writes «amestecă româna cu engleza», with articled forms. The page fills names from `Intl.DisplayNames`, which gives unarticled forms («română», «engleză»).
   - The Romanian keys therefore read «Întrebarea ta amestecă limbile {languages}. … așa că îți propunem această variantă în limba {language}:».
   - The English text is exactly the spec's, with `{languages}` (a list formatted in the site language) and `{language}`. Owner wording pick: 3 phrasings are offered in Task 18.
5. **The angle planner's `question_language` is required in its answer form but optional in its reader.**
   - It is measurement only (L7), so a reply that omits it is accepted and records nothing.
   - Refusing it would spend a re-ask on a field that may never change the debate.
6. **Test doubles keep today's two strip patterns.**
   - The spec lists "the two-form strip patterns in the test doubles" under what goes away. They go away only for shape runs: today's shape still sends both of today's forms until it is retired.
   - The doubles gain a third pattern for the named sentence (Task 17) and lose none.
7. **The fast check's provider list today is `["anthropic"]`.**
   - Any other value refuses the API's boot (`QUESTION_LANGUAGE_POLICY_INVALID:$.fastCheck.provider`).
   - GPT-6 Luna is added later by widening that enum and adding one transport, after the OpenAI integration (another session) lands. Nothing about OpenAI is built here.
8. **Hosted spend needs a migration (Task 19), so hosted's fast check is off until it is applied.**
   - `ledger.model_spend.spend_source` allows only `RUN`, `SUPPORT` and `STORY` (migration 0074).
   - A run-less site cost under the honest name `LANGUAGE_CHECK` needs a new CHECK value and a SECURITY DEFINER writer.
   - Until migration 0117 is applied, the hosted API detects the missing function at boot and runs with eld + site language. This follows the money law "never spend unrecorded".

## Owner-visible defaults

These are the spec's defaults as built. The ones marked **RISK** are where the code makes the default weaker than it reads.

- **Questions outside the 35 site languages.**
  - The fast AI may name any ISO 639-1 language, and the debate runs in it.
  - Labels, the debate page and the PDF use the site language: `apps/ui/lib/i18n/questionLocale.ts` `questionLocale` already falls back to the interface locale for any tag that is not one of the 35.
  - **RISK (weaker checking):**
    - The reply check has word lists only for our Latin-script languages (`REPLY_FUNCTION_WORDS`). For an outside Latin-script language (for example Catalan) it checks only the writing system, so a reply drifting into Spanish is not caught.
    - The code-owned opposite-answer template (P2b Task 2) has entries only for our 35. An outside debate whose choose step names one answer gets the English template.
- **Serbian or Bosnian in Latin script on the Croatian site** (ruling CR-2).
  - eld would read them as Croatian, so `hr` is a site that ALWAYS asks the fast AI (`FAST_CHECK_ALWAYS_SITES` in `decide.ts`), like `ga`, `id`, `mt` and every site Task 3 measures with a confident near-neighbour confusion.
  - The fast AI then names Serbian (`sr-Latn`). Each extra check costs about $0.00005.
  - With the fast AI down, the fallback still reads eld (Croatian): the never-block rule wins there.
- **Local mode with no paid AI.** eld and the site language decide, and no rewrite is offered.
  - "Paid AI available" means the preview with an Anthropic gate socket, or hosted with an Anthropic support target and Task 19 applied.
  - A preview with no Anthropic gate socket has NO fast check (eld + site language); it never takes the hosted route, even in hosted mode (#163), because the API never holds a vendor key on the preview (ruling L-ROUTE, CR-6, pre-flight PF-L35).
  - A plain local install (relays or subscriptions) has no paid fast check.
- **A signed-out (legacy) person's question** is decided by eld and the site language only, with no rewrite offered (ruling L-NOCONSENT): no consent is recorded for them, so their question never reaches the fast AI.
- **eld also reads each clause** of a question (ruling L-MIX). When two clauses read confidently as different languages, the fast AI is asked even on a site eld would otherwise settle. Cost if the clause rule is too eager: one extra fast call (about $0.00005) on some single-language questions; if it misses a mix, the question is locked in the site language with no offer (today's lock).
- **Each fast check uses one of the preview gate's daily call slots** (`max_paid_posts_per_day`) and briefly holds about $0.0165 of the $2 Anthropic pot until it settles.
- **The real-mix pop-up charges the route's request limiter twice** (D1, CR-1). The debate allowance and billing are charged once, by the request that starts the debate.
- **The fast check's instruction text and settings live in the optional row `questionLanguagePolicy`.** Absent means the code's start values (Claude Haiku 5.5 `claude-haiku-5-5`, effort low, 5 s, the default text in Task 4). An owner edit is a new register version.
- **The planner-disagreement record never reaches people** (ruling CR-3). It is an operator-only map note, stored with the run's map (encrypted with the run's content) and read by the practice report and operators. It is not a condition mark, so the honesty drawer, the story and the debate page never show it (rule: no engine internals in user-facing text).
- **An English question on the Romanian site is debated in English with no pop-up (L5).** The debate page's existing language strip (`QuestionLanguageOffer`, spec 2026-09-26 §14.3) still offers to show the page in English. That strip is about the page, not the debate, and is unchanged. Owner call if it should be hidden for shape runs.
- **A person who presses Esc or clicks outside the pop-up is treated as "Edit"** (back to the question box, nothing sent), never as a choice.

## Controller rulings (2026-10-13, override the sections above where they differ)

Kept as the record. Folded into the task text on 2026-10-13 (see "Amendments 2026-10-13"): CR-1 → D1, Task 0 Step 4, Task 11; CR-2 → Owner-visible defaults, Tasks 3, 7; CR-3 → Goal, Review Focus, Owner-visible defaults, Tasks 14, 15, Owner steps, cross-plan amendment 2 (dropped); CR-4 → Contract deviation 1, Task 0 Step 5, Task 4; CR-5 → D2, Tasks 8, 10, 12, 18; CR-6 → Tasks 6, 12; CR-7 → Owner steps 8.

- **CR-1 (charged twice, D1).** If the route's "per-person admission charge" is only the anti-spam request limiter, charging it for the offer request is accepted. If it touches the person's debate allowance or money (daily/monthly debates, credit, billing hold), the offer request must NOT consume it: the offer returns before any allowance or billing step, and only the resubmission is charged. Task 0's pre-flight says which one it is, with file:line.
- **CR-2 (Croatian site and near neighbours).** Sites where eld can be confidently wrong about a near neighbour always ask the fast AI: `ga`, `id`, `mt` (eld lacks them), `hr` (Serbian/Bosnian in Latin script), plus every site Task 3 measures with a confident near-neighbour confusion. One constant in `decide.ts`, filled from Task 3's numbers. Each extra check costs about $0.00005.
- **CR-3 (planner disagreement is measurement only).** `LANGUAGE_PLANNER_DISAGREES` never reaches people: not in the honesty drawer, the story or any page text (rule: no engine internals in user-facing text). Record it in an operator-only channel (a run note or record the practice report and operators read), not as a user-visible condition mark. If the kernel's condition marks have no operator-only kind, do NOT add it to `CONDITION_MARKS`; then the mark-count pins stay at P2b's value, and cross-plan amendment 2 is dropped.
- **CR-4 (thinking off).** After Task 0 merges origin/dev (it brings the owner's thinking-effort setting, PR #149), check whether the preview gates (TypeScript and Python) accept thinking off for Haiku. If they do, the row's start value is off. Otherwise `low`, as in Contract deviation 1.
- **CR-5 (check-reference key).** The HMAC key must be the same for every API process of one deployment. Derive it (HKDF, purpose label `question-language-check-v1`) from an existing server secret the API already loads, if one fits. Only if none exists, keep the per-process random key and document the single-process limit. A reference that fails on another process must never show the person the pop-up twice in a row for the same question: the page re-runs the check, and a second offer for the same question hash within 15 minutes is answered with the fallback lock (the site language or eld's confident language) instead of another pop-up.
- **CR-6 (transport).** The fast check reaches Anthropic only through the preview gate (preview) or the hosted support target that already exists (hosted). The API gets no new vendor credential in preview. No question text in any log line: codes, hashes and timings only.
- **CR-7 (kept defaults; owner told at the end).** The Romanian pop-up keeps the owner's informal «ta» text (adjusted for filled names). The debate page's language strip stays for L5 questions. Weaker reply checking for languages outside our 35 is accepted.

## Cross-plan amendments (exact edits other plans need; this plan does not edit them)

**Applied 2026-10-13** to P2b, P2c and P2d (each plan's own "Amendments 2026-10-13" log), with ruling CR-3's adjustments: P2b amendment 2 is DROPPED (no ninth mark; `CONDITION_MARKS` stays 46); P2b amendment 5's `question_language` member in the scripted `MAP:angles` reply is added by Task 17 here, not by P2b (P2b's reader is strict until Task 15); P2d records the planner's language from the map note and `plannerLanguage`, never from a condition mark. The text below is the original request, kept as the record.

**P2b (the runner shape)**

1. **Task 2, `mapWrongLanguage`.**
   - Do NOT replace the branch's `mapWrongLanguage(text, expected: ReplyLanguageExpectation)` with the `detectArgumentLanguage` version shown in P2b Task 2 Step 3. That version would bring the question guesser back into the map (spec ruling R-5 and this plan's L6).
   - Keep the current body.
   - In `tests/unit/map-multilingual.test.ts`, replace `mapWrongLanguage("Autobuzele gratuite …", "ro-RO")` with `mapWrongLanguage("Autobuzele gratuite …", { tag: "ro", script: "Latin" })`.
   - `mapPrimarySubtag` stays: the opposite template uses it.
2. **DROPPED by ruling CR-3.** (Was: a ninth shape mark `LANGUAGE_PLANNER_DISAGREES` after `"SCRUTINY-EXTENDED"`, pins 46 → 47.) The disagreement is an operator-only map note; P2b's Task 3 stays at 46 marks and needs no edit.
3. **Task 6 / Owner steps: do not publish the preview's `mapContractHash` before P2L Task 15 lands.**
   - P2L changes the angle planner's instruction and answer form, so `mapPromptContractHash()` changes once more.
   - Dev registers re-seal by themselves.
4. **Task 12 (`map-stage.ts`).** `mapConditionRecords(result, runId, servedRootNodeId)` (third argument: P2b pre-flight PF-B47) must convert EVERY `MapMarkRecord` the result holds, never a fixed list, and never a map note (P2L's record is a note, CR-3). The test's `mapAnglesSpec({ questionLine, languageName, languageTag })` call keeps working: P2L keeps those context fields.
5. **Task 15 (the harness `tests/support/debate-shape-harness.ts` and `classifyGateRequest`'s `"MAP"` kind).**
   - The harness's admitted runs pass `argumentLanguageTag: "en", argumentLanguageName: "English"` (or the case's language) to `startRun` explicitly.
   - The scripted `MAP:angles` reply starts with `"question_language": "<tag>"`.
   - P2L Task 17 makes these edits if P2b shipped without them.

**P2c (what people see)**

1. **Task 8 Step 8:** also add the six keys of P2L Task 18 to `apps/ui/messages/en/newDebate.json`, with the English texts given there.
2. **Task 10:**
   - Translate those six keys in the same batch (13 + 6 = 19 keys per locale; the worker prompt's key list and counts change accordingly).
   - Add `ro` with P2L's Romanian texts as given (not translated).
   - Translator rule for these keys: keep `{languages}` and `{language}` untranslated; the sentence must read naturally with a language name, or a list of names, filled in, in the locale's own form.
   - The Opus spot-check covers them.
3. **Order:** P2L Task 18 (the pop-up) runs after P2c Task 10 and reuses those keys. If P2c ran without amendment 1, P2L Task 18 Step 0 adds them itself with the same translator process.

**P2d (practice and proof)**

1. **Task 0:** P2L is also a precondition. Check with `grep -n "questionLanguageSentence" packages/kernel/src/question-language.ts`.
2. **New practice mode `language`** (no debate, cheap). For each language case it runs, through the same preview gates:
   - the eld reading;
   - the fast check;
   - one `MAP:angles` call on the case's question.

   It records per case:
   - the site language;
   - eld's code, reliability and confidence;
   - the fast check's outcome, `main_language`, `languages_seen`, `is_real_mix` and proposed rewrite;
   - the lock;
   - the planner's `question_language`.

   Output goes to `language.jsonl` + `report.md` in the outside-the-repository report folder. Expected cost is under $0.05.
3. **The language cases** are fixed in code like the other practice questions, with a site language each:

| id | site | question (shape of it) | expected lock | offer? |
|---|---|---|---|---|
| `lang-ro-plain` | ro | Romanian without diacritics ("Ar trebui sa renuntam la leu si sa trecem la euro?") | ro | no |
| `lang-ro-en-mix` | ro | Romanian with English clauses ("Ar trebui România să adopte euro, or should it wait until wages catch up?") | ro | yes |
| `lang-en-on-ro` | ro | English wholly ("Should Romania adopt the euro before 2030?") | en | no |
| `lang-short-code` | en | short / code-like ("Is `rm -rf /` ever safe in CI?") | en | no |
| `lang-sr-latn` | ro | Serbian in Latin script ("Da li bi Srbija trebalo da uvede evro?") | sr-Latn | no |
| `lang-id` | id | Indonesian ("Apakah Indonesia harus menaikkan pajak karbon?") | id | no |
| `lang-ro-borrowed` | ro | Romanian with borrowed words only ("Merită să lucrez la un startup de AI în loc de o corporație?") | ro | no |

4. **Pass bar:** no wrong lock on the set, and every real-mix case is offered a rewrite that keeps the meaning (the owners judge the rewrites from `report.md`). The planner's naming is recorded and does not count toward the pass bar.
5. **Practice `debate` mode** gains `--site-language <one of the 35>` (default: the question's own language) and `--language-choice use|keep` (default `use`, applied when `submit` answers with an offer). The report records the lock, its source and whether a rewrite was used.
6. **One full practice debate on `lang-ro-en-mix`** with `--shape-policy` before the preview upload. This uses the owner's practice-run rule and budget.

**INTERFACE (binding names)** — APPLIED 2026-10-13 as section "8. Question language (P2L)" (§7 already holds P2a's bindings, cited by the P2a ledger), with the planner record as an operator-only map note (CR-3). Originally asked: add a section "7. Question language (P2L)" listing: `QuestionLanguage`, `questionLanguageSentence`, `QUESTION_LANGUAGE_FIELD` (`"question_language"`), `replyLanguageCheckFor`, row `questionLanguagePolicy` (kind `QUESTION_LANGUAGE_POLICY`), mark `LANGUAGE_PLANNER_DISAGREES`, ask fields `site_language` and `question_language_choice`, the 409 code `QUESTION_LANGUAGE_CHOICE_NEEDED`. Edit it when this plan is executed (it is a binding-names file, not a sibling plan).

## Execution order (recommendation)

1. **P2a** — nearly done.
2. **P2b, whole.** P2L's runner tasks (13–17) edit functions P2b creates or reshapes:
   - `framedJudgePrompt` and its test seam;
   - `buildSynthesisRolePrompt`'s new parameter;
   - `map-stage.ts` and the map package;
   - the shape harness.

   Running P2L first would rewrite them twice.
3. **P2L Tasks 0–17, then 20** (kernel, eld, tuning, row, fast check, decision, reference, contract, decider, ask wiring, boot and publishers, judge / answer writer, marks, map, story, runner wiring).
   - These must land before any publish of P2b's `mapContractHash` (amendment P2b-3).
   - Task 0 merges the latest origin/dev first (ruling L-KIT: #163's kit v3) and Step 2b makes kit v3 carry the shape rows; it waits for the P2b fix wave (rulings T-P5, T12-R3) to be committed, since Tasks 13 and 17 frame its root-0 room.
   - Tasks 0–12 touch apps/api, packages/contract and packages/register, apart from one kernel export line. They could run beside P2b in another session, but on the owner's Mac only one heavy test run is allowed at a time, so sequential is recommended.
4. **P2c**, with amendments P2c-1 and P2c-2. Its Task 8 rewrites `NewDebatePageClient.tsx`, `defaults.tsx` and `apps/ui/lib/api.ts`. P2L's UI task edits the same files, so it follows P2c to avoid a three-way merge, and P2c's translator batch carries P2L's six keys.
5. **P2L Task 18** (the pop-up and the site language sent).
6. **P2L Task 19** (hosted run-less spend), any time before hosted go-live. The preview does not need it.
Run Task 20 again after Tasks 18 and 19.
7. **P2d**, with amendments P2d-1 to P2d-6.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/kernel/src/question-language.ts` | create | `QuestionLanguage`, language table, sentence, field, locked expectation, `replyLanguageCheckFor`, `languageDirectiveFor`, `questionLanguageForBounds` (Task 1) |
| `packages/kernel/src/argument-language.ts` | modify | export `ARGUMENT_LANGUAGE_NAMES`, a typed alias of the existing private `LANGUAGE_NAMES` (Task 1, PF-L4) |
| `packages/kernel/src/reply-language.ts` | modify | export `replyScriptOfTag` (reads the existing private table) (Task 1) |
| `packages/kernel/src/index.ts` | modify | `export * from "./question-language.js"` (Task 1; no mark: CR-3) |
| `apps/api/package.json`, `pnpm-lock.yaml` | modify | `eld` 2.1.0 exact (Task 2) |
| `apps/api/src/question-language/eld.ts` | create | eld reader (whole question and each clause), the 60-language list, `SITE_LANGUAGES_ELD_LACKS`, `questionSegments` (Task 2, L-MIX) |
| `tools/question-language-tune/legal-sentences.ts`, `tools/question-language-tune/measure-eld.ts` | create | the #158 legal-page sentence set and the built mixed set; the measurement (Task 3). Not shipped: never in the corpus manifest (PF-L9) |
| `apps/api/src/question-language/eld-tuning.ts` | create | measured numbers: database size, minimum letters, clause minimum letters, site aliases, confused sites; `eldConfident`, `eldSeesMix` (Task 3, CR-2, L-MIX) |
| `packages/register/src/question-language-policy.ts` | create | optional row `questionLanguagePolicy`: parse, read, row, start values, default instruction (Task 4) |
| `apps/api/src/question-language/fast-check.ts` | create | contract, answer form, framing, reply reader, the time-limited check (Task 5) |
| `apps/api/src/question-language/transport.ts` | create | Anthropic Messages transport over a given fetch (preview gate, or the hosted support target's key) (Task 6, CR-6) |
| `apps/api/src/question-language/decide.ts` | create | the pure decision table and `FAST_CHECK_ALWAYS_SITES` (Task 7, CR-2) |
| `apps/api/src/question-language/reference.ts` | create | the reference key derived from the blind-index key (CR-5); sign and verify the check reference; verify a choice (Task 8) |
| `packages/contract/src/index.ts`, `packages/contract/src/client.ts` | modify | `SiteLanguageSchema`, the two ask fields, the 409 offer schema, `submitAskOrLanguageChoice` (Task 9) |
| `apps/api/src/question-language/decider.ts` | create | `QuestionLanguageDecider`, `QuestionLanguageLock`, the run-language helpers (Task 10) |
| `apps/api/src/index.ts` | modify | settings field, `submit` first step, both `startRun` calls, the refusal class and its 409 (Task 11) |
| `apps/api/src/question-language/boot.ts` | create | the paid route (preview gate / hosted key / none), boot refusals, `composeQuestionLanguage` (Task 12) |
| `apps/api/src/main.ts`, `tools/preview-practice/practice-ask-composition.ts` | modify | boot: row, eld, transport choice, decider (Task 12) |
| `deploy/preview-auth-dev/v1/publish-register-v3.ts`, `deploy/preview-auth-dev/v1/native-operator.mjs` | merge + modify | kit v3 (from origin/dev #163) carries `debateShapePolicy` and `mapContractHash` (Task 0 Step 2b, L-KIT) and `questionLanguagePolicy` (Task 12) |
| `deploy/preview-auth-dev/v1/publish-register-v2.ts`, `apps/runner/src/hosted-register-publish.ts` | modify | the optional row in both publishers (Task 12) |
| `packages/judgement/src/index.ts`, `apps/runner/src/index.ts`, `apps/runner/src/map-stage.ts`, `acceptance/moment-tools.ts`, `apps/api/src/main.ts` | modify | judge, review, panel, answer writer, answer checker take the locked language; root 0's room and B9's first-call price frame the lock; moment replay reads the field (Task 13, PF-L38, PF-L39) |
| `packages/map/src/types.ts` | modify | the operator-only map note `LANGUAGE_PLANNER_DISAGREES` and `MapResult.plannerLanguage`; never a condition mark (Task 14, CR-3) |
| `packages/map/src/{prompts,specs,replies,orchestrator}.ts` | modify | named sentence, field, planner's first field, the disagreement note (Task 15) |
| `packages/story/src/{contracts,writer}.ts`, `apps/runner/src/story-snapshot.ts` | modify | story in the locked language (Task 16; `StoryWriteInput` is in writer.ts, PF-L50) |
| `apps/runner/src/index.ts`, `tests/support/preview-gate-stubs.ts`, `tests/support/debate-shape-harness.ts` | modify | the shape run's language (judge inputs, root 0's room, writer, checker, story); doubles (Task 17) |
| `apps/ui/components/QuestionLanguageChoice.tsx`, `apps/ui/app/new/NewDebatePageClient.tsx`, `apps/ui/lib/api.ts` | create/modify | the pop-up; site language sent (Task 18) |
| `migrations/0117_language_check_spend.sql` + lineage + loader, `packages/budget/src/model-spend.ts` | create/modify | hosted run-less site cost (Task 19) |

---
### Task 0: Preconditions

P2L builds on P2b's map stage, judge legs, synthesizer length parameter, marks and harness, and on origin/dev's #158 (the legal-page sentence set and `foreignLatinLetterCount`).

**Files:**
- The merge commit of Step 2 (origin/dev, which brings publish kit v3 from #163).
- Step 2b (ruling L-KIT): modify `deploy/preview-auth-dev/v1/publish-register-v3.ts`, `deploy/preview-auth-dev/v1/native-operator.mjs`, `tests/unit/preview-register-publish-v3.test.ts`.

Implementer note (pre-flight PF-L3): CR-1, CR-4 and CR-5 were re-checked at 249ed0cd8 and hold. Route order in `apps/api/src/index.ts`: crisis (~3475), consent for signed-in people only (~3482–3491), preview team (~3495–3497), `admitOrRefuse(reply, "asks", …)` (~3499–3500; defined ~2211–2220 over `chargeAdmission`, a windowed request counter refusing `ADMISSION_RATE_LIMITED`), country (~3503), parse (~3505), `submit` (~3509). Inside `submit` (~4618) money and allowance are read only later: `resolveBillingAsk` (~4657), `coarseFitFor` (~4669), `#submitWithRoom` (~4683), `openAdmissionLock` (~4692), `evaluateAskAdmission` (~4694). Haiku's row menu is `["high","medium","low"]` (`packages/providers/src/preview-models.ts` ~273–276), the Python list `('low','medium','high')`; `blindIndexKey` is loaded at `apps/api/src/main.ts` ~257 and zeroed at shutdown, and `social-auth.ts` ~61 derives with `hkdfSync`. Line numbers drift: find by name.

- [ ] **Step 1: P2b is in this branch**

Run: `grep -n "framedJudgePromptForTest" packages/judgement/src/index.ts && grep -n "DEBATE_SHAPE_MARKS" packages/kernel/src/index.ts && grep -n "export function judgeLegFrameSpec" packages/judgement/src/index.ts && ls apps/runner/src/map-stage.ts tests/support/debate-shape-harness.ts`

Expected: each grep prints a line (today: `export const framedJudgePromptForTest: typeof framedJudgePrompt = framedJudgePrompt;`), and both paths are listed. If anything is missing, STOP and report to the controller: P2L runs after P2b (see "Execution order"). (Pre-flight PF-L1: the old pattern could not match the `: typeof` form.)

- [ ] **Step 2: Merge the latest origin/dev, always (ruling L-KIT)**

#158 (`b437f5d9a`) and #149 are already in this branch, but origin/dev has moved on: #163 (`f22496daa`) brings publish kit v3 (`deploy/preview-auth-dev/v1/publish-register-v3.ts`), which supersedes kit v2 for the hosted preview, and Step 2b and Task 12 need it. So this merge is unconditional:

Run `git fetch origin dev`, then `git merge --no-ff origin/dev`. The message is `Merge origin/dev (#163 kit v3) before P2L`, followed by a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Expected conflicts (checked with `git merge-tree` on 2026-10-14; all three are plain "keep both": P2a/P2b's `debateShape` choice beside #163's `hostedBilling` choice):
- `deploy/preview-auth-dev/v1/native-operator.mjs`: keep BOTH `validateDebateShapeChoice` (with `DEBATE_SHAPE_OFF`) and `HOSTED_CEILING_BOUNDS` + `validateHostedBillingChoice`; the plan-key line accepts both optional keys (`...(shape?['debateShape']:[]),...(hosted?['hostedBilling']:[])`); keep both validation blocks (`debateShape` on plan/publish only; `hostedBilling` on every operation). In the builder calls, take #163's form (`hosted ? buildPreviewSourceRowsV3(…) : buildPreviewSourceRowsV2(…)`) and give the v2 call its sixth argument back: `…,plan.callConcurrency??null,plan.debateShape??null)`. The v3 call stays as #163 wrote it here; Step 2b adds its argument.
- `deploy/preview-release/v1/release-artifacts.mjs`: keep both flags (`--debate-shape` and `--hosted-billing`) in the usage comment, in `native-plan`'s optional list, in the two parse blocks, the two validation blocks, the two carry lines and the two spreads into the plan.
- `deploy/preview-release/v1/README.md`: keep both texts.

Any other conflict, or one that is not "keep both", means STOP and report. Then run, one after another: `pnpm exec vitest run tests/unit/preview-register-publish-v2.test.ts`, `pnpm exec vitest run tests/unit/preview-register-publish-v3.test.ts`, `pnpm exec vitest run tests/unit/preview-auth-dev-operator.test.ts`, `pnpm exec vitest run tests/unit/preview-release-artifacts.test.ts`. All pass before the merge is committed (the v2 test's operator regex at ~375 still matches: `\{[^}]*\}` reads #163's `{...observation}`).

- [ ] **Step 2b: Kit v3 carries the debate shape rows (ruling L-KIT; pre-flight PF-L33, PF-L34)**

The gap: `buildPreviewSourceRowsV3(bootstrap, runtime, hosted, checker, roleRotation, callConcurrency)` calls kit v2's builder with five arguments, so a hosted-preview publication can never carry `debateShapePolicy`; `composePreviewSnapshotV3` parses only a carried `callConcurrencyPolicy`. (`mapContractHash` already rides: it is a REQUIRED key of `PREVIEW_SOURCE_ROW_KEYS_V2`, which `PREVIEW_SOURCE_ROW_KEYS_V3` extends, and v2's builder makes it; it is checked nowhere in v3.) Once hosted, every preview publication goes through v3 (#163's own test, `preview-register-publish-v3.test.ts` ~144–146), so without this the shape can never be published to the hosted preview.

Write the tests first, in `tests/unit/preview-register-publish-v3.test.ts`, copying the v2 cases of `describe('publish kit v2: the optional debateShapePolicy row …')` (`tests/unit/preview-register-publish-v2.test.ts` ~391–450) and #163's own hosted-choice helpers:
1. `buildPreviewSourceRowsV3(…, hostedChoice, undefined, undefined, null, debateShapePolicyStartValues())` holds a `debateShapePolicy` row equal to kit v2's for the same policy; `'off'` gives the start values with `enabled: false`; `null` (and leaving it out) gives no such row.
2. The v3 source always holds `mapContractHash`, and its value is `JSON.stringify(mapPromptContractHash())` (import from `@debateai/map`).
3. `composePreviewSnapshotV3` over a base that holds a `debateShapePolicy` row the source leaves out carries it unchanged and outside the delta; a base whose carried `debateShapePolicy` is malformed is refused with `DEBATE_SHAPE_POLICY_INVALID`.
4. `assertHostedPreviewBootRows` refuses rows that hold `debateShapePolicy` with a `mapContractHash` that is not the code's (`MAP_CONTRACT_HASH_MISMATCH`), and with no `mapContractHash` row (`DEBATE_SHAPE_MAP_HASH_UNSEALED`): the hosted runner's own boot refusals, asked before anything is sealed.
5. The operator pin: change the regex at ~221 (`…plan\.callConcurrency\?\?null\)`) to end `…plan\.callConcurrency\?\?null,plan\.debateShape\?\?null\)`.

Run `pnpm exec vitest run tests/unit/preview-register-publish-v3.test.ts` and expect FAIL. Then implement:
- `publish-register-v3.ts`: `buildPreviewSourceRowsV3` gains a seventh parameter `debateShape: DebateShapePolicy | 'off' | null = null` and passes it as kit v2's sixth argument. `sourceKeysReviewedV3` already admits it (v2's optional key list holds `DEBATE_SHAPE_POLICY_ROW_KEY`).
- `composePreviewSnapshotV3`: in the carried-rows loop, also `if (row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY) parseDebateShapePolicy(JSON.parse(row.valueJsonText));` (kit v2's own line), and parse the source's `mapContractHash` row with `parseMapContractHash` (`@debateai/register`).
- `assertHostedPreviewBootRows`: when the rows hold `debateShapePolicy`, call `resolveDebateShapeRunnerSettings({ policy: parseDebateShapePolicy(…), mapContractHash: <the row's value or null>, codeMapContractHash: mapPromptContractHash() })` (`apps/runner/src/debate-shape-boot.ts`; kit v3 already imports from `apps/runner/src`). It throws the runner's own typed refusal.
- `native-operator.mjs`: the v3 call passes `plan.debateShape??null` as its seventh argument. No validation change (the merge kept `validateDebateShapeChoice`).

Run, one after another: `pnpm exec vitest run tests/unit/preview-register-publish-v3.test.ts`, `pnpm exec vitest run tests/unit/preview-register-publish-v2.test.ts`, `pnpm exec vitest run tests/unit/preview-auth-dev-operator.test.ts`. Then, alone: `pnpm exec vitest run tests/integration/preview-register-publish-v3.test.ts`. Commit only these files by name: `git add deploy/preview-auth-dev/v1/publish-register-v3.ts deploy/preview-auth-dev/v1/native-operator.mjs tests/unit/preview-register-publish-v3.test.ts`, message `Kit v3 carries the debate shape: debateShapePolicy through to kit v2, mapContractHash parsed, the runner's boot refusals asked before sealing`, then a blank line and the Co-Authored-By line. Task 12 adds `questionLanguagePolicy` the same way.

- [ ] **Step 3: Note the hashes P2L must not move**

Run:

`pnpm exec tsx -e 'import {createHash} from "node:crypto"; import {JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT as t} from "@debateai/judgement"; console.log(createHash("sha256").update(t).digest("hex"))'`

Write the printed value into the controller's notes as `JUDGE_HASH_AFTER_P2B`. Task 13's test pins it.

- [ ] **Step 4: Pre-flight for ruling CR-1 (what the offer request is charged)**

Run: `grep -n 'admitOrRefuse(reply, "asks"' apps/api/src/index.ts` and `grep -n "const admitOrRefuse" -A9 apps/api/src/index.ts`.

Expected (checked on 803f58128): the `POST /v1/asks` route charges `admitOrRefuse(reply, "asks", "POST /v1/asks", …)` BEFORE `submit`, and that function refuses with `ADMISSION_RATE_LIMITED` (the admission policy's request limiter, anti-spam). The person's debate allowance and money (billing hold, daily/monthly debates, credit) are read inside `submit`, after Task 11's language step. Write the file:line of both into the controller's notes. Then CR-1's first branch holds: charging the limiter for the offer request is accepted, and nothing else changes.

If the route now charges anything that touches the person's debate allowance or money before `submit` (a quota of debates, a billing hold, credit), STOP and report: CR-1 then requires the offer to return before that step, which moves the language step into the route, before that charge. That is a plan change for the controller.

- [ ] **Step 5: Ruling CR-4 (thinking off for the fast check)**

Run (#149, the thinking-effort setting, is already in this branch, so this does not wait on Step 2): `grep -n '"claude-haiku-5-5"' -A8 packages/providers/src/preview-models.ts | grep -n "efforts"` and `grep -n "effort_words" packages/providers/ops/preview_budget_helper.py` (the Python gate's `AnthropicProfile`).

- If BOTH the TypeScript row's `efforts` and the Python gate's list for Haiku accept a "thinking off" word (today the TypeScript menu would have to hold `"default"`, which means "send no `output_config`"), write that word into the controller's notes as `FAST_CHECK_EFFORT_START`. Task 4 then uses it.
- Otherwise `FAST_CHECK_EFFORT_START` is `low` (Contract deviation 1). Pre-checked on origin/dev da35a529b: the Haiku row's menu is `["high", "medium", "low"]`, so `low`.

- [ ] **Step 6: Ruling CR-5 (the server secret the reference key derives from)**

Run: `grep -n "const blindIndexKey = loadSecretKey" apps/api/src/main.ts` and `grep -n "hkdfSync" apps/api/src/social-auth.ts`.

Expected: one line each (main.ts loads `blindIndexKey` at boot from `BLIND_INDEX_KEY_PATH`; `SocialAuthService` derives its flow key from it with HKDF). Task 8 derives the reference key the same way. If `blindIndexKey` is gone or renamed, use the root the social-auth flow key now derives from and say so in the commit; if there is none, STOP and report (CR-5's fallback, a per-process key with the single-process limit documented, is the controller's call).

---

### Task 1: Kernel — the locked language, its sentence, its field and its reply check

**Files:**
- Create: `packages/kernel/src/question-language.ts`
- Modify: `packages/kernel/src/argument-language.ts` (one added export line: a typed alias of the name table), `packages/kernel/src/reply-language.ts` (export `replyScriptOfTag`), `packages/kernel/src/index.ts` (one export line), `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-kernel.test.ts` (create)

**Interfaces:**
- Consumes: `argumentLanguageDirective`, `replyLanguageCheck`, `replyLanguageIssues`, `replyProseFieldsAt`, `majorityScript`, `ReplyLanguageExpectation`, `ReplyLanguageIssue`, `ReplyScript` (same package).
- Produces:
```ts
export type QuestionLanguage = Readonly<{ code: string; name: string }>;
export const QUESTION_LANGUAGE_FIELD: "question_language";
export const ARGUMENT_LANGUAGE_NAMES: Readonly<Record<string, string>>;      // argument-language.ts, the existing 35
export function replyScriptOfTag(tag: string): ReplyScript | undefined;      // reply-language.ts
export function questionLanguageOf(code: string, questionLine?: string): QuestionLanguage | null;
export function questionLanguageFromRun(tag: string, name: string): QuestionLanguage | null;
export function questionLanguageSentence(language: QuestionLanguage): string;
export function questionLanguageField(language: QuestionLanguage): Readonly<{ name: "question_language"; content: string }>;
export function withQuestionLanguageField<T extends Readonly<{ name: string; content: string }>>(
  material: readonly T[], language: QuestionLanguage | null | undefined): readonly Readonly<{ name: string; content: string }>[];
export function lockedReplyLanguageExpectation(language: QuestionLanguage, questionLine: string): ReplyLanguageExpectation;
export function replyLanguageCheckFor(questionLine: string, language: QuestionLanguage | null | undefined,
  patterns: readonly string[]): (value: unknown) => readonly ReplyLanguageIssue[];
export function languageDirectiveFor(argumentLanguageName: string | null | undefined,
  language: QuestionLanguage | null | undefined): string;
export function questionLanguageForBounds(): QuestionLanguage;   // PF-L38: the lock whose sentence + field frame longest (B9's price)
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-kernel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ARGUMENT_LANGUAGE_NAMES, QUESTION_LANGUAGE_FIELD, argumentLanguageDirective, detectArgumentLanguage, languageDirectiveFor,
  lockedReplyLanguageExpectation, questionLanguageField, questionLanguageForBounds, questionLanguageFromRun, questionLanguageOf,
  questionLanguageSentence, replyLanguageCheck, replyLanguageCheckFor, replyScriptOfTag, withQuestionLanguageField
} from "@debateai/kernel";
import { readdirSync } from "node:fs";

const SITE_LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const RO = Object.freeze({ code: "ro", name: "Romanian" });
const FRENCH_REPLY = { statement: "Le gouvernement doit maintenir la monnaie nationale pour les citoyens et les entreprises du pays." };

describe("the locked question language (question-language spec 2026-10-13, ruling L6)", () => {
  it("names our 35 site languages exactly as the runs already store them, and other ISO 639-1 codes in English", () => {
    expect(Object.keys(ARGUMENT_LANGUAGE_NAMES).sort()).toEqual(SITE_LOCALES);
    for (const code of SITE_LOCALES) expect(questionLanguageOf(code)).toEqual({ code, name: ARGUMENT_LANGUAGE_NAMES[code] });
    expect(questionLanguageOf("EN")).toEqual({ code: "en", name: "English" });
    expect(questionLanguageOf("ca")).toEqual({ code: "ca", name: "Catalan" });
    expect(questionLanguageOf("ms")).toEqual({ code: "ms", name: "Malay" });
    for (const refused of ["xx", "unknown", "und", "", "en-US", "e", "eng"]) expect(questionLanguageOf(refused)).toBeNull();
  });

  it("adds the script for a two-script language from the question's own letters", () => {
    expect(questionLanguageOf("sr", "Da li bi Srbija trebalo da uvede evro umesto dinara?"))
      .toEqual({ code: "sr-Latn", name: "Serbian (Latin script)" });
    expect(questionLanguageOf("sr", "Да ли би Србија требало да уведе евро уместо динара?"))
      .toEqual({ code: "sr-Cyrl", name: "Serbian (Cyrillic script)" });
    expect(questionLanguageOf("sr")).toEqual({ code: "sr", name: "Serbian" });
    expect(questionLanguageOf("ro", "Да ли би Србија требало да уведе евро?")).toEqual(RO);
  });

  it("reads a run's stored language; und and the fallback name are no lock", () => {
    expect(questionLanguageFromRun("ro", "Romanian")).toEqual(RO);
    expect(questionLanguageFromRun("sr-Latn", "Serbian (Latin script)")).toEqual({ code: "sr-Latn", name: "Serbian (Latin script)" });
    expect(questionLanguageFromRun("und", "the same language as the question")).toBeNull();
    expect(questionLanguageFromRun("ro", "")).toBeNull();
    expect(questionLanguageFromRun("ro", "the same language as the question")).toBeNull();
  });

  it("is ONE named sentence: never the fallback form, never today's question-language wording", () => {
    const sentence = questionLanguageSentence(RO);
    expect(sentence.startsWith("Write every natural-language field in Romanian, the language this debate was set to and named in question_language, even where the material quotes another language.")).toBe(true);
    expect(sentence).toContain("never translate an identifier or literal.");
    expect(sentence).not.toContain("the same language as the question");
    expect(sentence).not.toContain("the language of the question");
    expect(() => questionLanguageSentence({ code: "ro", name: " " })).toThrow(/QUESTION_LANGUAGE_NAME_REQUIRED/u);
    expect(languageDirectiveFor("Romanian", null)).toBe(argumentLanguageDirective("Romanian"));
    expect(languageDirectiveFor(undefined, undefined)).toBe(argumentLanguageDirective(""));
    expect(languageDirectiveFor("French", RO)).toBe(sentence);
  });

  it("puts the field last in the material, only when a language is locked", () => {
    const material = [{ name: "question_line", content: "Q?" }];
    expect(withQuestionLanguageField(material, null)).toBe(material);
    expect(withQuestionLanguageField(material, undefined)).toBe(material);
    expect(withQuestionLanguageField(material, RO)).toEqual([
      { name: "question_line", content: "Q?" }, { name: QUESTION_LANGUAGE_FIELD, content: '{"code":"ro","name":"Romanian"}' }]);
    expect(questionLanguageField(RO)).toEqual({ name: "question_language", content: '{"code":"ro","name":"Romanian"}' });
  });

  it("the locked expectation reads the code (and its script), never the question's guess", () => {
    expect(replyScriptOfTag("ru")).toBe("Cyrillic");
    expect(replyScriptOfTag("ro")).toBeUndefined();
    expect(lockedReplyLanguageExpectation(RO, "Ar trebui sa renuntam la leu?")).toEqual({ tag: "ro", script: "Latin" });
    expect(lockedReplyLanguageExpectation({ code: "sr-Cyrl", name: "Serbian (Cyrillic script)" }, "x")).toEqual({ tag: "sr", script: "Cyrillic" });
    expect(lockedReplyLanguageExpectation({ code: "ja", name: "Japanese" }, "x")).toEqual({ tag: "ja", script: "CJK" });
    expect(lockedReplyLanguageExpectation({ code: "ca", name: "Catalan" }, "Hauria Barcelona de limitar els pisos turístics?"))
      .toEqual({ tag: "ca", script: "Latin" });
    expect(lockedReplyLanguageExpectation({ code: "ca", name: "Catalan" }, "?")).toEqual({ tag: "ca", script: null });
  });

  it("replyLanguageCheckFor: today's check without a lock, the locked check with one", () => {
    const question = "Ar trebui sa renuntam la leu si sa trecem la euro cat mai repede?";
    expect(replyLanguageCheckFor(question, null, ["statement"])(FRENCH_REPLY))
      .toEqual(replyLanguageCheck(question, ["statement"])(FRENCH_REPLY));
    expect(replyLanguageCheckFor(question, RO, ["statement"])(FRENCH_REPLY)).toEqual([
      { code: "TEXT_NOT_IN_QUESTION_LANGUAGE", path: ["statement"], message: "TEXT_NOT_IN_QUESTION_LANGUAGE" }]);
    expect(replyLanguageCheckFor(question, RO, ["statement"])({ statement: "Guvernul trebuie să păstreze moneda națională pentru cetățeni și firme." })).toEqual([]);
    // Review Focus 5 (pre-flight PF-L5): today's guesser cannot name this question, so today's check lets French through;
    // only the locked check refuses it.
    expect(detectArgumentLanguage(question).tag).toBe("und");
    expect(replyLanguageCheck(question, ["statement"])(FRENCH_REPLY)).toEqual([]);
  });

  it("questionLanguageForBounds: no lock the kernel can make frames longer (pre-flight PF-L38: B9 prices with it)", () => {
    const size = (language: { code: string; name: string }) =>
      new TextEncoder().encode(questionLanguageSentence(language) + questionLanguageField(language).content).length;
    const bound = size(questionLanguageForBounds());
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const lines = [undefined, "Da li bi Srbija trebalo da uvede evro umesto dinara?", "Да ли би Србија требало да уведе евро уместо динара?"];
    for (const first of letters) for (const second of letters) for (const line of lines) {
      const language = questionLanguageOf(`${first}${second}`, line);
      if (language !== null) expect(size(language), language.code).toBeLessThanOrEqual(bound);
    }
  });
});
```

Implementer note (pre-flight PF-L5): the two added lines under "replyLanguageCheckFor" prove Review Focus 5. If `detectArgumentLanguage(question).tag` is not `"und"` on this branch, pick another plain Romanian question without diacritics that the guesser reads as `"und"` (keep it about the same topic) and say so in the commit message; never drop the two lines.

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-kernel.test.ts`

Expected: FAIL. `questionLanguageOf`, `ARGUMENT_LANGUAGE_NAMES` and the other new names are not exported.

- [ ] **Step 3: Implement**

`packages/kernel/src/argument-language.ts`: keep the private `const LANGUAGE_NAMES = Object.freeze({…} as const)` and its two uses (`KnownArgumentLanguageTag` and the `detected` helper) exactly as they are. Add ONE line after the table: `export const ARGUMENT_LANGUAGE_NAMES: Readonly<Record<string, string>> = LANGUAGE_NAMES;`. (Pre-flight PF-L4: renaming the literal-keyed table would make the test's `ARGUMENT_LANGUAGE_NAMES[code]` a TS7053 error under the root typecheck; the alias is typed as a plain record.) Nothing else changes, so the guesser's output is untouched.

`packages/kernel/src/reply-language.ts`: below `SCRIPT_OF_TAG`, add:

```ts
/** The writing system a language tag's own table names (Russian → Cyrillic), or undefined for the rest. */
export function replyScriptOfTag(tag: string): ReplyScript | undefined {
  return SCRIPT_OF_TAG[tag];
}
```

Create `packages/kernel/src/question-language.ts`:

```ts
import { ARGUMENT_LANGUAGE_NAMES, argumentLanguageDirective } from "./argument-language.js";
import {
  majorityScript, replyLanguageCheck, replyLanguageIssues, replyProseFieldsAt, replyScriptOfTag,
  type ReplyLanguageExpectation, type ReplyLanguageIssue, type ReplyScript
} from "./reply-language.js";

/**
 * QUESTION LANGUAGE (question-language spec 2026-10-13, ruling L6). In a new-shape debate the language is decided
 * once, before the debate exists, and locked. Every AI call is told the named language (`questionLanguageSentence`)
 * and gets it as the material field `question_language`. Every reply is checked against the locked code
 * (`lockedReplyLanguageExpectation`), never against a new guess from the question. Today's shape keeps today's
 * directive and today's check: every helper here takes `null` for "no lock" and then does exactly what today's code
 * does.
 */
export type QuestionLanguage = Readonly<{ code: string; name: string }>;

/** The material field every new-shape call carries. Code-owned vocabulary, never translated. */
export const QUESTION_LANGUAGE_FIELD = "question_language" as const;

/** ISO 639-1: the only codes a lock may carry (the fast AI's answer and eld's both pass through this list). */
const ISO_639_1 = new Set([
  "aa", "ab", "ae", "af", "ak", "am", "an", "ar", "as", "av", "ay", "az", "ba", "be", "bg", "bi", "bm", "bn", "bo", "br",
  "bs", "ca", "ce", "ch", "co", "cr", "cs", "cu", "cv", "cy", "da", "de", "dv", "dz", "ee", "el", "en", "eo", "es", "et",
  "eu", "fa", "ff", "fi", "fj", "fo", "fr", "fy", "ga", "gd", "gl", "gn", "gu", "gv", "ha", "he", "hi", "ho", "hr", "ht",
  "hu", "hy", "hz", "ia", "id", "ie", "ig", "ii", "ik", "io", "is", "it", "iu", "ja", "jv", "ka", "kg", "ki", "kj", "kk",
  "kl", "km", "kn", "ko", "kr", "ks", "ku", "kv", "kw", "ky", "la", "lb", "lg", "li", "ln", "lo", "lt", "lu", "lv", "mg",
  "mh", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "na", "nb", "nd", "ne", "ng", "nl", "nn", "no", "nr", "nv", "ny",
  "oc", "oj", "om", "or", "os", "pa", "pi", "pl", "ps", "pt", "qu", "rm", "rn", "ro", "ru", "rw", "sa", "sc", "sd", "se",
  "sg", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr", "ss", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "ti", "tk",
  "tl", "tn", "to", "tr", "ts", "tt", "tw", "ty", "ug", "uk", "ur", "uz", "ve", "vi", "vo", "wa", "wo", "xh", "yi", "yo",
  "za", "zh", "zu"
]);

/** Languages commonly written in two scripts: the lock names the script the question itself uses. */
const TWO_SCRIPT_LANGUAGES = new Set(["sr", "uz", "az", "kk", "mn"]);
const SCRIPT_SUBTAGS: Readonly<Record<string, ReplyScript>> = Object.freeze({
  Latn: "Latin", Cyrl: "Cyrillic", Grek: "Greek", Arab: "Arabic", Hebr: "Hebrew", Deva: "Devanagari", Hang: "Hangul",
  Hani: "CJK", Hans: "CJK", Hant: "CJK", Jpan: "CJK"
});
const FALLBACK_NAME = "the same language as the question";
const SCRIPT_LETTERS_MIN = 12;

function englishNameOf(code: string): string | null {
  const known = (ARGUMENT_LANGUAGE_NAMES as Readonly<Record<string, string>>)[code];
  if (known !== undefined) return known;
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" }).of(code);
  } catch {
    return null;
  }
  return name === undefined || name.trim() === "" || name === code ? null : name;
}

/**
 * The lock for a code: our 35 named as the runs already store them, any other ISO 639-1 code in English. A two-script
 * language gets the question's script ("sr-Latn", "Serbian (Latin script)"). Null for anything else ("und",
 * "unknown", regional or three-letter codes): such a value is never locked.
 */
export function questionLanguageOf(code: string, questionLine?: string): QuestionLanguage | null {
  const primary = code.trim().toLowerCase();
  if (!ISO_639_1.has(primary)) return null;
  const name = englishNameOf(primary);
  if (name === null) return null;
  if (questionLine !== undefined && TWO_SCRIPT_LANGUAGES.has(primary)) {
    const letters = questionLine.match(/\p{L}/gu)?.length ?? 0;
    const script = letters >= SCRIPT_LETTERS_MIN ? majorityScript(questionLine) : null;
    if (script === "Latin") return Object.freeze({ code: `${primary}-Latn`, name: `${name} (Latin script)` });
    if (script === "Cyrillic") return Object.freeze({ code: `${primary}-Cyrl`, name: `${name} (Cyrillic script)` });
  }
  return Object.freeze({ code: primary, name });
}

/** A run's stored language as a lock; null for "und" or today's fallback name (a run decided without a lock). */
export function questionLanguageFromRun(tag: string, name: string): QuestionLanguage | null {
  if (tag === "und" || name.trim() === "" || name === FALLBACK_NAME) return null;
  return Object.freeze({ code: tag, name });
}

/**
 * THE one sentence every new-shape call carries (ruling L6). It always names the language; there is no fallback
 * form. It is code, not owner text: the sealed fingerprints exclude it, so a change needs no new register version
 * (the story's per-call hash includes it, as it includes today's directive).
 */
export function questionLanguageSentence(language: QuestionLanguage): string {
  const name = language.name.trim();
  if (name === "") throw new TypeError("QUESTION_LANGUAGE_NAME_REQUIRED");
  return `Write every natural-language field in ${name}, the language this debate was set to and named in question_language, even where the material quotes another language. Keep JSON keys, enum tokens, JSON literals (null, true, false), and identifier-shaped values (including claim_type, basis, outcome, fatalFlags[].type, segment_id, node_refs, served_number_refs and question_language) in English exactly as specified; never translate an identifier or literal.`;
}

export function questionLanguageField(language: QuestionLanguage): Readonly<{ name: typeof QUESTION_LANGUAGE_FIELD; content: string }> {
  return Object.freeze({ name: QUESTION_LANGUAGE_FIELD, content: JSON.stringify({ code: language.code, name: language.name }) });
}

/** The material with the language field LAST; the same array, untouched, when nothing is locked (today's bytes). */
export function withQuestionLanguageField<T extends Readonly<{ name: string; content: string }>>(
  material: readonly T[], language: QuestionLanguage | null | undefined
): readonly Readonly<{ name: string; content: string }>[] {
  if (language === null || language === undefined) return material;
  return Object.freeze([...material, questionLanguageField(language)]);
}

/** What a reply is checked against: the locked code and its script (own table, script subtag, or the question's letters). */
export function lockedReplyLanguageExpectation(language: QuestionLanguage, questionLine: string): ReplyLanguageExpectation {
  const [primaryRaw, ...rest] = language.code.split("-");
  const primary = (primaryRaw ?? "").toLowerCase();
  const subtag = rest.find((part) => part.length === 4);
  const fromSubtag = subtag === undefined ? undefined : SCRIPT_SUBTAGS[subtag[0]!.toUpperCase() + subtag.slice(1).toLowerCase()];
  const known = replyScriptOfTag(primary) ?? fromSubtag;
  if (known !== undefined) return Object.freeze({ tag: primary, script: known });
  if (Object.hasOwn(ARGUMENT_LANGUAGE_NAMES, primary)) return Object.freeze({ tag: primary, script: "Latin" });
  const letters = questionLine.match(/\p{L}/gu)?.length ?? 0;
  return Object.freeze({ tag: primary, script: letters >= SCRIPT_LETTERS_MIN ? majorityScript(questionLine) : null });
}

/** Today's check without a lock; the locked check with one (never a re-guess of the question). */
export function replyLanguageCheckFor(
  questionLine: string, language: QuestionLanguage | null | undefined, patterns: readonly string[]
): (value: unknown) => readonly ReplyLanguageIssue[] {
  if (language === null || language === undefined) return replyLanguageCheck(questionLine, patterns);
  const expected = lockedReplyLanguageExpectation(language, questionLine);
  return (value) => replyLanguageIssues(expected, replyProseFieldsAt(value, patterns));
}

/**
 * Pre-flight PF-L38: the lock whose named sentence and field are the longest in UTF-8 bytes among every lock
 * `questionLanguageOf` can return (each two-script language in both scripts). A price that must cover ANY lock (the
 * API's B9 first-call price) frames with it. Ties: the first code in alphabetical order.
 */
export function questionLanguageForBounds(): QuestionLanguage {
  const size = (language: QuestionLanguage): number =>
    new TextEncoder().encode(questionLanguageSentence(language) + questionLanguageField(language).content).length;
  const candidates = [...ISO_639_1].sort().flatMap((code) => {
    const plain = questionLanguageOf(code);
    if (plain === null) return [];
    return TWO_SCRIPT_LANGUAGES.has(code)
      ? [plain, Object.freeze({ code: `${code}-Latn`, name: `${plain.name} (Latin script)` }),
        Object.freeze({ code: `${code}-Cyrl`, name: `${plain.name} (Cyrillic script)` })]
      : [plain];
  });
  return candidates.reduce((longest, candidate) => size(candidate) > size(longest) ? candidate : longest);
}

/** Today's directive without a lock (byte for byte); the named sentence with one. */
export function languageDirectiveFor(argumentLanguageName: string | null | undefined, language: QuestionLanguage | null | undefined): string {
  return language === null || language === undefined
    ? argumentLanguageDirective(argumentLanguageName ?? "")
    : questionLanguageSentence(language);
}
```

`packages/kernel/src/index.ts`: after `export * from "./reply-language.js";` add `export * from "./question-language.js";`. Add `packages/kernel/src/question-language.ts` to the manifest.

- [ ] **Step 4: Run it and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-kernel.test.ts`
- `pnpm exec vitest run tests/unit/argument-language.test.ts`
- `pnpm exec vitest run tests/unit/reply-language.test.ts`

Expected: PASS. The last two prove that today's guesser and today's check are unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/question-language.ts packages/kernel/src/argument-language.ts packages/kernel/src/reply-language.ts packages/kernel/src/index.ts tests/unit/question-language-kernel.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "Kernel: the locked question language, its one named sentence, its field and the locked reply check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: eld 2.1.0 on the API and its reader

**Files:**
- Modify: `apps/api/package.json` (dependency `"eld": "2.1.0"`, exact), `pnpm-lock.yaml`
- Create: `apps/api/src/question-language/eld.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-eld.test.ts` (create)

**Interfaces:**
- Produces:
```ts
export const ELD_LANGUAGES: readonly string[];               // the 60 codes eld 2.1.0 names
export const SITE_LANGUAGES_ELD_LACKS: readonly string[];    // ["ga", "id", "mt"]
export type EldDatabaseSize = "small" | "medium" | "large";
export type EldSegmentReading = Readonly<{ code: string | null; reliable: boolean; letters: number }>;
export type EldReading = Readonly<{ code: string | null; reliable: boolean; letters: number; segments: readonly EldSegmentReading[] }>;
export interface EldReader { read(text: string): EldReading; languages(): readonly string[] }
export function questionSegments(text: string): readonly string[];   // ruling L-MIX: the clauses eld also reads
export function plainWordsOf(segment: string): string;              // ruling L-MIX: a clause without names, brands, acronyms
export async function loadEldReader(size: EldDatabaseSize): Promise<EldReader>;
```

**The clause rule (ruling L-MIX, pre-flight PF-L18).** eld reads the whole question AND each of its clauses, so a question that really mixes languages is never settled by eld alone:
- **How a question is cut** (`questionSegments`): at every `.` `!` `?` `;` `:` `,` and their full-width forms `。！？；：，、`, at a dash with a space on each side (` - `, ` – `, ` — `), at `(` and `)`, and at line breaks. Each piece is trimmed; empty pieces are dropped. A question with no such mark is one segment.
- **What counts inside a segment** (`plainWordsOf`): the segment is split at white space and each word loses its leading and trailing marks that are not letters or digits. A word counts only when it has at least one letter, no digit, nothing inside but letters, combining marks, an apostrophe or a hyphen, and no upper-case or title-case letter (`\p{Lu}`, `\p{Lt}`) except as the very first character of the segment's first word. So names ("România", "Bucharest"), brands ("iPhone", "OpenAI"), acronyms and borrowed capitalised words ("AI", "EU") and anything with a digit never count; a script without case (Chinese, Arabic, Hebrew, Devanagari) counts whole. The counted words are joined with one space.
- **The segment's reading**: eld reads only that joined text; `letters` counts the `\p{L}` letters in it. A segment with no counted letter has no reading (it is left out of `segments`).
- Whether a segment reading is CONFIDENT, and whether two of them make a mix, is Task 3's (`eldSeesMix`, with the measured `segmentMinLetters`). Task 2 only reads.

- [ ] **Step 1: Check the package before installing (supply chain)**

These are read-only checks. Run each and compare:
- `npm view eld@2.1.0 dist.integrity` must print `sha512-hDQ9FX17th7NDNMO8/St6m3ADQVqjF0sQoOHI6NUAxC7yDaPmZ9wC9d8zau/9FIqOV7KtNwrPKRt6fkkrzZj0g==`.
- `npm view eld@2.1.0 scripts --json` must print nothing (no install scripts), so `strictDepBuilds` needs no new row.
- `npm view eld@2.1.0 dependencies --json` must print nothing (no dependencies).
- `npm view eld@2.1.0 time.2.1.0` must print `2026-08-13…`, which is older than the workspace's 7-day `minimumReleaseAge`.

If any value differs, STOP and report: the package changed under its version.

- [ ] **Step 2: Install with the exact pin**

Run: `pnpm --filter @debateai/api add eld@2.1.0 --save-exact`

Then run: `grep -n '"eld": *"2.1.0"' apps/api/package.json`. Expected: one line (the manifest is one compact JSON line, so the pattern allows no space after the colon; pre-flight PF-L7).

- [ ] **Step 3: Write the failing test** `tests/unit/question-language-eld.test.ts`:

```ts
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ELD_LANGUAGES, SITE_LANGUAGES_ELD_LACKS, loadEldReader, plainWordsOf, questionSegments } from "../../apps/api/src/question-language/eld.js";

const SITE_LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

describe("eld 2.1.0 (question-language spec 2026-10-13, ruling L2)", () => {
  it("knows 60 languages, and lacks exactly Irish, Indonesian and Maltese of our 35", () => {
    expect(ELD_LANGUAGES).toHaveLength(60);
    expect(SITE_LOCALES.filter((code) => !ELD_LANGUAGES.includes(code))).toEqual([...SITE_LANGUAGES_ELD_LACKS]);
    expect(SITE_LANGUAGES_ELD_LACKS).toEqual(["ga", "id", "mt"]);
  });

  it("the loaded database names the same 60 languages", async () => {
    const reader = await loadEldReader("small");
    expect([...reader.languages()].sort()).toEqual([...ELD_LANGUAGES].sort());
  });

  it("reads a plain sentence reliably and counts its letters; empty text is no reading", async () => {
    const reader = await loadEldReader("small");
    const ro = reader.read("Ar trebui ca România să investească mai mult în transportul public din orașele mari?");
    expect(ro).toMatchObject({ code: "ro", reliable: true });
    expect(ro.letters).toBeGreaterThan(60);
    expect(reader.read("   ")).toEqual({ code: null, reliable: false, letters: 0, segments: [] });
    expect(reader.read("2 + 2 = 4?")).toMatchObject({ letters: 0, segments: [] });
  });

  it("ruling L-MIX: cuts a question into clauses, and counts only plain words in each", async () => {
    expect(questionSegments("Ar trebui România să adopte euro, or should it wait until wages catch up?"))
      .toEqual(["Ar trebui România să adopte euro", "or should it wait until wages catch up"]);
    expect(questionSegments("Una pregunta — and an answer (maybe)\nsecond line")).toEqual(["Una pregunta", "and an answer", "maybe", "second line"]);
    expect(questionSegments("Fără niciun semn")).toEqual(["Fără niciun semn"]);
    expect(plainWordsOf("Merită să lucrez la un startup de AI în loc de o corporație"))
      .toBe("Merită să lucrez la un startup de în loc de o corporație");
    expect(plainWordsOf("Should Apple and OpenAI sell the iPhone 17 in România")).toBe("Should and sell the in");
    expect(plainWordsOf("EU, NATO, 2030")).toBe("");
    const reader = await loadEldReader("small");
    const mixed = reader.read("Ar trebui România să adopte euro, or should it wait until wages catch up?");
    expect(mixed.segments).toHaveLength(2);
    expect(mixed.segments.every((segment) => segment.letters > 0)).toBe(true);
    expect(reader.read("Merită să lucrez la un startup de AI în loc de o corporație?").segments).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-eld.test.ts`

Expected: FAIL (the module does not exist).

- [ ] **Step 5: Implement** `apps/api/src/question-language/eld.ts`:

```ts
/**
 * eld (Efficient Language Detector) 2.1.0, Apache-2.0, pure JavaScript, no dependencies (question-language spec
 * 2026-10-13, ruling L2): the free, local first look at a question. It runs over its whole 60-language set. It is
 * never restricted to our 35, because a restricted eld would force an outside question (Catalan, Malay) into one of
 * ours. Our rule restricts by itself: eld only ever SETTLES a question when its top language equals the person's
 * site language (decide.ts).
 */
export const ELD_LANGUAGES: readonly string[] = Object.freeze([
  "am", "ar", "az", "be", "bg", "bn", "ca", "cs", "da", "de", "el", "en", "es", "et", "eu", "fa", "fi", "fr", "gu", "he",
  "hi", "hr", "hu", "hy", "is", "it", "ja", "ka", "kn", "ko", "ku", "lo", "lt", "lv", "ml", "mr", "ms", "nl", "no", "or",
  "pa", "pl", "pt", "ro", "ru", "sk", "sl", "sq", "sr", "sv", "ta", "te", "th", "tl", "tr", "uk", "ur", "vi", "yo", "zh"
]);
/** Our site languages eld cannot name: on these sites the fast AI always checks (the spec's default). */
export const SITE_LANGUAGES_ELD_LACKS: readonly string[] = Object.freeze(["ga", "id", "mt"]);

export type EldDatabaseSize = "small" | "medium" | "large";
export type EldSegmentReading = Readonly<{ code: string | null; reliable: boolean; letters: number }>;
/** The whole question's reading, and one reading per clause that has plain words (ruling L-MIX). */
export type EldReading = Readonly<{ code: string | null; reliable: boolean; letters: number; segments: readonly EldSegmentReading[] }>;
export interface EldReader {
  read(text: string): EldReading;
  languages(): readonly string[];
}

// eld's own declaration (apps/api/node_modules/eld/index.d.ts): info() names its languages under "Languages",
// a record keyed by number (pre-flight PF-L6).
type EldDetector = Readonly<{
  detect(text: string): Readonly<{ language: string; isReliable(): boolean }>;
  info(): Readonly<{ Languages?: Readonly<Record<number, string>> }>;
}>;

/** Ruling L-MIX: where a question is cut into clauses (see the clause rule above the test). */
const CLAUSE_BREAK = /[.!?;:,\u3002\uff01\uff1f\uff1b\uff1a\uff0c\u3001()\n\r]+|\s[-\u2013\u2014]\s/u;

export function questionSegments(text: string): readonly string[] {
  return Object.freeze(text.split(CLAUSE_BREAK).map((piece) => piece.trim()).filter((piece) => piece !== ""));
}

/** Ruling L-MIX: the clause without names, brands, acronyms and anything with a digit; a caseless script counts whole. */
export function plainWordsOf(segment: string): string {
  const words = segment.split(/\s+/u).map((word) => word.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, ""));
  return words.filter((word, index) => /\p{L}/u.test(word)
    && /^[\p{L}\p{M}'\u2019-]+$/u.test(word)
    && !/[\p{Lu}\p{Lt}]/u.test(index === 0 ? word.slice(1) : word)).join(" ");
}

async function eldModule(size: EldDatabaseSize): Promise<EldDetector> {
  // Static entry points: the database ships inside the package, so nothing is fetched or written at run time.
  switch (size) {
    case "small": return (await import("eld/small")).eld as unknown as EldDetector;
    case "medium": return (await import("eld/medium")).eld as unknown as EldDetector;
    case "large": return (await import("eld/large")).eld as unknown as EldDetector;
    default: return exhaustive(size);
  }
}

/** Loaded once at the API's boot, and only when the debate shape row is present (eld's memory: 54–138 MB). */
export async function loadEldReader(size: EldDatabaseSize): Promise<EldReader> {
  const detector = await eldModule(size);
  const readOne = (text: string, letters: number): EldSegmentReading => {
    const result = detector.detect(text);
    const code = typeof result.language === "string" && result.language !== "" ? result.language : null;
    return Object.freeze({ code, reliable: code !== null && result.isReliable(), letters });
  };
  return Object.freeze({
    read(text: string): EldReading {
      const letters = text.match(/\p{L}/gu)?.length ?? 0;
      if (letters === 0) return Object.freeze({ code: null, reliable: false, letters, segments: Object.freeze([]) });
      const whole = readOne(text, letters);
      const segments = questionSegments(text).flatMap((segment) => {
        const plain = plainWordsOf(segment);
        const plainLetters = plain.match(/\p{L}/gu)?.length ?? 0;
        return plainLetters === 0 ? [] : [readOne(plain, plainLetters)];
      });
      return Object.freeze({ ...whole, segments: Object.freeze(segments) });
    },
    languages(): readonly string[] {
      return Object.freeze(Object.values(detector.info().Languages ?? {}).map(String));
    }
  });
}
```

Import `exhaustive` from `@debateai/kernel` at the top. eld's declaration is at `apps/api/node_modules/eld/index.d.ts` (pnpm links it under `apps/api`, not the root `node_modules`): `info()` returns `{'Data type', 'Languages': Record<number,string>, 'Subset'}`, so `languages()` reads the capitalised `Languages` (pre-flight PF-L6). If the values there are not ISO codes, map them to the codes and say so in the commit message. Add the file to the manifest.

Implementer note (pre-flight PF-L8): `(await import("eld/small")).eld` and `isReliable()` are used as eld documents them; the subpath exports share one `index.d.ts`, and Step 6's typecheck of the test proves NodeNext resolves it. `EldReading` carries no score; if P2d's language mode needs eld's confidence, add `getScores()`'s top value then, not now.

- [ ] **Step 6: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/question-language-eld.test.ts`

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/question-language/eld.ts tests/unit/question-language-eld.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API: eld 2.1.0 (exact pin, no install scripts) and its reader over all 60 languages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tune eld on the #158 legal-page set and record the numbers

The spec asks for eld's confidence threshold to be tuned on the 17,833-sentence legal-page set used for #158. That set is every 6–30-word sentence of the site's translated Terms and Privacy pages, in 35 locales. This task measures three database sizes × five minimum lengths, chooses one configuration by a fixed rule, and records the chosen numbers and the measurement in code. Then, at the chosen configuration, it measures the clause rule (ruling L-MIX) on a mixed-language set built from the same sentences, chooses the clause minimum length by a second fixed rule, and records it.

**Files:**
- Create: `tools/question-language-tune/legal-sentences.ts` (the #158 extractor, moved out of the test so the tool and the test share it, plus the built mixed set), `tools/question-language-tune/measure-eld.ts`, `apps/api/src/question-language/eld-tuning.ts`
- Modify: `tests/unit/argument-language.test.ts` (import the moved extractor), `tests/support/shipped-corpus.manifest.txt` (ONLY `apps/api/src/question-language/eld-tuning.ts`: the corpus roots are packages, apps and web, and the manifest lists no `tools/` file; pre-flight PF-L9)
- Test: `tests/unit/question-language-eld-tuning.test.ts` (create)

**Interfaces:**
- Produces:
```ts
// tools/question-language-tune/legal-sentences.ts
export function legalSentences(locale: string): string[];
export const LEGAL_LOCALES: readonly string[];
export function withoutDiacritics(text: string): string;
export function mixedQuestions(): readonly Readonly<{ text: string; order: "RO+EN" | "EN+RO" }>[];   // L-MIX: the built mixed set
export function pureControls(): readonly Readonly<{ text: string; locale: string }>[];              // L-MIX: every legal sentence + RO without diacritics
// tools/question-language-tune/measure-eld.ts
export type EldTuningRow = Readonly<{ size: EldDatabaseSize; minLetters: number; sentences: number;
  settlesOwnSite: number; wrongLockable: number; wrongLockableRoEn: number; roPlainSettles: number; roPlainWrong: number }>;
export async function measureEld(sizes: readonly EldDatabaseSize[], minLetters: readonly number[]): Promise<readonly EldTuningRow[]>;
export function chooseEldTuning(rows: readonly EldTuningRow[]): EldTuningRow | null;
export async function siteAliasCandidates(size: EldDatabaseSize, minLetters: number): Promise<Readonly<Record<string, readonly string[]>>>;
export async function siteConfusions(size: EldDatabaseSize, minLetters: number): Promise<Readonly<Record<string, Readonly<Record<string, number>>>>>; // CR-2
export function confusedSites(confusions: Readonly<Record<string, Readonly<Record<string, number>>>>): readonly string[];
export type EldMixRow = Readonly<{ segmentMinLetters: number; joins: number; mixCaught: number; pure: number; pureFlagged: number }>;
export async function measureEldMix(size: EldDatabaseSize, segmentMinLetters: readonly number[]): Promise<readonly EldMixRow[]>;   // L-MIX
export function chooseSegmentMinLetters(rows: readonly EldMixRow[]): EldMixRow | null;                                            // L-MIX
// apps/api/src/question-language/eld-tuning.ts
export const ELD_TUNING: Readonly<{ database: EldDatabaseSize; minLetters: number; segmentMinLetters: number; measured: Readonly<{ on: string;
  sentences: number; settlesOwnSite: number; wrongLockable: number; wrongLockableRoEn: number }>;
  measuredMix: Readonly<{ joins: number; mixCaught: number; pure: number; pureFlagged: number }> }>;
export const ELD_SITE_ALIASES: Readonly<Record<string, readonly string[]>>;
export const ELD_CONFUSED_SITES: readonly string[];   // CR-2: our sites eld confidently named for another locale's sentence
export function eldConfident(reading: EldReading): boolean;
export function eldSegmentConfident(segment: EldSegmentReading): boolean;   // L-MIX
export function eldSeesMix(reading: EldReading): boolean;                  // L-MIX
```

The definitions below are what the test pins:
- **settlesOwnSite**: the number of sentences for which eld is confident (`reliable && letters >= minLetters`) and names the sentence's own locale. Each one is a question settled with no fast call.
- **wrongLockable**: the number of sentences for which eld is confident and names a DIFFERENT one of our 35. Asked on the site of that other language, each would be a wrong lock. Sentences of the three locales eld lacks (`ga`, `id`, `mt`, `SITE_LANGUAGES_ELD_LACKS`) are NOT counted here: eld can never name them, so every confident reading of them names a neighbour, and the bar would otherwise reject every configuration (pre-flight PF-L10; decision of the corrections pass 2026-10-14). They still count in `sentences`, and they still count in `siteConfusions` below, so every site they are confused with becomes an always-ask site (CR-2): the safety is kept there.
- **wrongLockableRoEn**: the part of `wrongLockable` where a Romanian sentence reads as English or the reverse.
- **roPlain\***: the same two figures for the Romanian sentences with every diacritic removed. This is the "Romanian without diacritics" case.
- **siteConfusions** (ruling CR-2): for each of our sites S, how many sentences of ANOTHER legal locale eld confidently names S, by locale. A site with any such sentence is a site where eld can be confidently wrong about a near neighbour; `confusedSites` lists them, sorted. They join `FAST_CHECK_ALWAYS_SITES` (Task 7): on those sites the fast AI always checks, even when eld names the site language. The choice rule's 0.05% bar still applies to the configuration; this list makes the remaining confusions safe.

**The choice rule** (`chooseEldTuning`):
1. Keep only the rows with `wrongLockableRoEn === 0`, `roPlainWrong === 0`, and `wrongLockable * 2000 <= sentences` (at most 0.05%).
2. Among those, take the largest `settlesOwnSite`.
3. On a tie, take the smaller database, then the smaller `minLetters`.
4. If no row is left, the result is `null`. That means STOP and report to the controller with the table; the owner decides.

The rule has no memory term, so it may pick `large` (about 138 MB resident in the API; small about 54 MB, medium about 71 MB). Report the chosen size and its memory to the controller for the owner (pre-flight PF-L10).

**The clause rule's numbers (ruling L-MIX).** Measured once, at the configuration `chooseEldTuning` chose:
- **The built mixed set** (`mixedQuestions`): pair the i-th Romanian legal sentence with the i-th English one, for i up to the shorter list. Each pair gives two questions: RO+EN = the Romanian sentence without its final `. ! ? ; :`, then `, `, then the English sentence; EN+RO the other way round. These are real mixes: whole clauses in a second language.
- **The pure controls** (`pureControls`): every legal sentence of all 35 locales, plus every Romanian sentence without diacritics. These are single-language questions.
- **A confident segment** (`eldSegmentConfident`): `code !== null && reliable && letters >= segmentMinLetters` (letters of plain words only: Task 2's clause rule, so names, brands and borrowed capitalised words can never make a segment confident alone).
- **eld sees a mix** (`eldSeesMix`): at least two confident segments with different codes.
- **mixCaught**: the built questions for which eld sees a mix. **pureFlagged**: the pure controls for which eld sees a mix (each one costs one extra fast call, about $0.00005, on a site eld would otherwise settle).
- **The choice rule** (`chooseSegmentMinLetters`), over `segmentMinLetters` in 12, 20, 30 and 40: keep the rows with `pureFlagged * 20 <= pure` (at most 5% of single-language questions pay an extra call); take the largest `mixCaught`; on a tie, the LARGER `segmentMinLetters` (fewer false flags). No row left → `null`: STOP and report the table to the controller. A chosen row that catches fewer than 80% of the joins (`mixCaught * 10 < joins * 8`) is kept but reported to the controller: a missed mix only falls back to today's lock (the site language, no offer).

- [ ] **Step 1: Move the extractor.** Create `tools/question-language-tune/legal-sentences.ts` with the #158 code (from `tests/unit/argument-language.test.ts`, the block that starts `function legalSentences`, about lines 324–335), exported, plus the built mixed set:

```ts
import { readFileSync, readdirSync } from "node:fs";

/**
 * The legal-page sentence set (#158, 2026-10-13): every sentence of six to thirty words of the site's translated
 * Terms and Privacy pages, in 35 locales (17,833 sentences when #158 was written). Used to tune the question checks.
 */
export function legalSentences(locale: string): string[] {
  const files = locale === "en"
    ? ["../../apps/ui/lib/termsOfService.ts", "../../apps/ui/lib/privacyPolicy.ts"]
    : [`../../apps/ui/lib/legal/${locale}/termsOfService.ts`, `../../apps/ui/lib/legal/${locale}/privacyPolicy.ts`];
  return files.flatMap((file) => [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/text: "((?:[^"\\]|\\.)*)"/gu)]
    .map((match) => JSON.parse(`"${match[1]!}"`) as string)
    .filter((text) => !text.startsWith("[")))
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?;:])\s+/u))
    .filter((sentence) => { const words = sentence.split(/\s+/u).length; return words >= 6 && words <= 30; });
}

export const LEGAL_LOCALES: readonly string[] = Object.freeze(["en", ...readdirSync(new URL("../../apps/ui/lib/legal/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name)].sort());

/** Romanian typed without diacritics (ă â î ș ț → a a i s t): the most common way people type it. */
export function withoutDiacritics(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
}

/** Ruling L-MIX: real mixes built from the set — a Romanian sentence and an English one joined by a comma, both orders. */
export function mixedQuestions(): readonly Readonly<{ text: string; order: "RO+EN" | "EN+RO" }>[] {
  const ro = legalSentences("ro");
  const en = legalSentences("en");
  const open = (sentence: string): string => sentence.replace(/[.!?;:]+$/u, "");
  return Object.freeze(Array.from({ length: Math.min(ro.length, en.length) }, (_, index) => [
    Object.freeze({ text: `${open(ro[index]!)}, ${en[index]!}`, order: "RO+EN" as const }),
    Object.freeze({ text: `${open(en[index]!)}, ${ro[index]!}`, order: "EN+RO" as const })
  ]).flat());
}

/** Ruling L-MIX: the single-language controls — every legal sentence, and the Romanian ones without diacritics. */
export function pureControls(): readonly Readonly<{ text: string; locale: string }>[] {
  return Object.freeze([
    ...LEGAL_LOCALES.flatMap((locale) => legalSentences(locale).map((text) => Object.freeze({ text, locale }))),
    ...legalSentences("ro").map((text) => Object.freeze({ text: withoutDiacritics(text), locale: "ro-plain" }))
  ]);
}
```

In `tests/unit/argument-language.test.ts`, replace the local `legalSentences` and `LEGAL_LOCALES` with an import of these two names from `../../tools/question-language-tune/legal-sentences.js`. Delete only the moved lines, and then the file's `node:fs` import (line 1) if nothing else in the file uses it any more (pre-flight PF-L9).

- [ ] **Step 2: Write the failing test** `tests/unit/question-language-eld-tuning.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SITE_LANGUAGES_ELD_LACKS, loadEldReader } from "../../apps/api/src/question-language/eld.js";
import { ELD_CONFUSED_SITES, ELD_SITE_ALIASES, ELD_TUNING, eldConfident, eldSeesMix } from "../../apps/api/src/question-language/eld-tuning.js";
import { LEGAL_LOCALES, legalSentences, mixedQuestions, pureControls, withoutDiacritics } from "../../tools/question-language-tune/legal-sentences.js";
import {
  chooseEldTuning, chooseSegmentMinLetters, confusedSites, siteConfusions, type EldMixRow, type EldTuningRow
} from "../../tools/question-language-tune/measure-eld.js";

const row = (over: Partial<EldTuningRow>): EldTuningRow => ({ size: "medium", minLetters: 20, sentences: 20_000, settlesOwnSite: 10_000,
  wrongLockable: 0, wrongLockableRoEn: 0, roPlainSettles: 500, roPlainWrong: 0, ...over });
const mixRow = (over: Partial<EldMixRow>): EldMixRow => ({ segmentMinLetters: 20, joins: 1000, mixCaught: 900, pure: 20_000, pureFlagged: 100, ...over });

describe("eld's confidence, tuned on the legal-page set (question-language spec 2026-10-13)", () => {
  it("the choice rule: no ro/en confusion, at most 0.05% wrong-lockable, then the most questions settled", () => {
    expect(chooseEldTuning([row({ settlesOwnSite: 12_000, wrongLockableRoEn: 1 }), row({ settlesOwnSite: 11_000 })])?.settlesOwnSite).toBe(11_000);
    expect(chooseEldTuning([row({ settlesOwnSite: 12_000, wrongLockable: 11 }), row({ settlesOwnSite: 11_000, wrongLockable: 10 })])?.settlesOwnSite).toBe(11_000);
    expect(chooseEldTuning([row({ size: "large" }), row({ size: "small", minLetters: 30 }), row({ size: "small", minLetters: 12 })]))
      .toMatchObject({ size: "small", minLetters: 12 });
    expect(chooseEldTuning([row({ roPlainWrong: 1 })])).toBeNull();
  });

  it("the recorded configuration still holds on the set (a floor to keep, not a target)", async () => {
    const reader = await loadEldReader(ELD_TUNING.database);
    let sentences = 0;
    let wrongLockable = 0;
    let roEn = 0;
    for (const locale of LEGAL_LOCALES) {
      for (const sentence of legalSentences(locale)) {
        sentences += 1;
        const reading = reader.read(sentence);
        if (!eldConfident(reading) || reading.code === locale || !LEGAL_LOCALES.includes(reading.code!)) continue;
        if (SITE_LANGUAGES_ELD_LACKS.includes(locale)) continue;   // PF-L10: counted by siteConfusions instead
        wrongLockable += 1;
        if ((locale === "ro" && reading.code === "en") || (locale === "en" && reading.code === "ro")) roEn += 1;
      }
    }
    expect(LEGAL_LOCALES).toHaveLength(35);
    expect(sentences).toBe(ELD_TUNING.measured.sentences);
    expect(roEn).toBe(0);
    expect(wrongLockable).toBeLessThanOrEqual(ELD_TUNING.measured.wrongLockable);
    for (const sentence of legalSentences("ro")) {
      const reading = reader.read(withoutDiacritics(sentence));
      if (eldConfident(reading)) expect(reading.code, sentence.slice(0, 40)).toBe("ro");
    }
  }, 120_000);

  it("CR-2: the recorded confused sites are exactly the sites the set confuses at the chosen configuration", async () => {
    expect(confusedSites({ ro: { en: 0 }, hr: { sl: 2 }, en: {} })).toEqual(["hr"]);
    expect(ELD_CONFUSED_SITES).toEqual(confusedSites(await siteConfusions(ELD_TUNING.database, ELD_TUNING.minLetters)));
    for (const site of ELD_CONFUSED_SITES) expect(LEGAL_LOCALES).toContain(site);
  }, 120_000);

  it("L-MIX: the clause choice rule — at most 5% of pure questions flagged, then the most mixes caught, then the longer minimum", () => {
    expect(chooseSegmentMinLetters([mixRow({ mixCaught: 990, pureFlagged: 1001 }), mixRow({ segmentMinLetters: 30, mixCaught: 950 })])?.segmentMinLetters).toBe(30);
    expect(chooseSegmentMinLetters([mixRow({ segmentMinLetters: 12 }), mixRow({ segmentMinLetters: 30 })])?.segmentMinLetters).toBe(30);
    expect(chooseSegmentMinLetters([mixRow({ pureFlagged: 1001 })])).toBeNull();
  });

  it("L-MIX: the recorded clause numbers hold on the built mixed set and the pure controls (exact; eld is deterministic)", async () => {
    const reader = await loadEldReader(ELD_TUNING.database);
    const joins = mixedQuestions();
    const pure = pureControls();
    expect(joins.length).toBe(ELD_TUNING.measuredMix.joins);
    expect(pure.length).toBe(ELD_TUNING.measuredMix.pure);
    expect(joins.filter((question) => eldSeesMix(reader.read(question.text))).length).toBe(ELD_TUNING.measuredMix.mixCaught);
    expect(pure.filter((question) => eldSeesMix(reader.read(question.text))).length).toBe(ELD_TUNING.measuredMix.pureFlagged);
    expect(ELD_TUNING.measuredMix.pureFlagged * 20).toBeLessThanOrEqual(ELD_TUNING.measuredMix.pure);
  }, 120_000);

  it("L-MIX: the practice cases — a Romanian question with an English clause is a mix; borrowed words are not", async () => {
    const reader = await loadEldReader(ELD_TUNING.database);
    expect(eldSeesMix(reader.read("Ar trebui România să adopte euro, or should it wait until wages catch up?"))).toBe(true);
    expect(eldSeesMix(reader.read("Merită să lucrez la un startup de AI în loc de o corporație?"))).toBe(false);
    expect(eldSeesMix(reader.read("Should Romania adopt the euro before 2030?"))).toBe(false);
  });

  it("aliases exist only for the site languages eld lacks, and never name one of our other site languages", () => {
    expect(Object.keys(ELD_SITE_ALIASES).sort()).toEqual(["ga", "id", "mt"]);
    expect(ELD_SITE_ALIASES.id).toContain("ms");
    for (const aliases of Object.values(ELD_SITE_ALIASES)) for (const alias of aliases) expect(LEGAL_LOCALES).not.toContain(alias);
  });
});
```

- [ ] **Step 3: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-eld-tuning.test.ts`

Expected: FAIL (the modules do not exist).

- [ ] **Step 4: Write the measurement** `tools/question-language-tune/measure-eld.ts`:

```ts
import { LEGAL_LOCALES, legalSentences, mixedQuestions, pureControls, withoutDiacritics } from "./legal-sentences.js";
import {
  ELD_LANGUAGES, SITE_LANGUAGES_ELD_LACKS, loadEldReader, type EldDatabaseSize, type EldReading
} from "../../apps/api/src/question-language/eld.js";

export type EldTuningRow = Readonly<{ size: EldDatabaseSize; minLetters: number; sentences: number;
  settlesOwnSite: number; wrongLockable: number; wrongLockableRoEn: number; roPlainSettles: number; roPlainWrong: number }>;

const confidentAt = (minLetters: number) => (reading: EldReading): boolean =>
  reading.code !== null && reading.reliable && reading.letters >= minLetters;

export async function measureEld(sizes: readonly EldDatabaseSize[], minLetters: readonly number[]): Promise<readonly EldTuningRow[]> {
  const rows: EldTuningRow[] = [];
  const corpus = LEGAL_LOCALES.map((locale) => [locale, legalSentences(locale)] as const);
  const roPlain = legalSentences("ro").map(withoutDiacritics);
  for (const size of sizes) {
    const reader = await loadEldReader(size);
    const readings = corpus.map(([locale, sentences]) => [locale, sentences.map((sentence) => reader.read(sentence))] as const);
    const plainReadings = roPlain.map((sentence) => reader.read(sentence));
    for (const min of minLetters) {
      const confident = confidentAt(min);
      let sentences = 0, settlesOwnSite = 0, wrongLockable = 0, wrongLockableRoEn = 0;
      for (const [locale, list] of readings) {
        for (const reading of list) {
          sentences += 1;
          if (!confident(reading)) continue;
          if (reading.code === locale) settlesOwnSite += 1;
          else if (LEGAL_LOCALES.includes(reading.code!) && !SITE_LANGUAGES_ELD_LACKS.includes(locale)) {   // PF-L10
            wrongLockable += 1;
            if ((locale === "ro" && reading.code === "en") || (locale === "en" && reading.code === "ro")) wrongLockableRoEn += 1;
          }
        }
      }
      const roPlainSettles = plainReadings.filter((reading) => confident(reading) && reading.code === "ro").length;
      const roPlainWrong = plainReadings.filter((reading) => confident(reading) && reading.code !== "ro").length;
      rows.push(Object.freeze({ size, minLetters: min, sentences, settlesOwnSite, wrongLockable, wrongLockableRoEn, roPlainSettles, roPlainWrong }));
    }
  }
  return Object.freeze(rows);
}

const SIZE_ORDER: readonly EldDatabaseSize[] = ["small", "medium", "large"];

export function chooseEldTuning(rows: readonly EldTuningRow[]): EldTuningRow | null {
  const safe = rows.filter((row) => row.wrongLockableRoEn === 0 && row.roPlainWrong === 0 && row.wrongLockable * 2000 <= row.sentences);
  if (safe.length === 0) return null;
  return [...safe].sort((a, b) => b.settlesOwnSite - a.settlesOwnSite
    || SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size) || a.minLetters - b.minLetters)[0]!;
}

/** For each site language eld lacks: the eld codes (not ours) it confidently names on that locale's sentences, most first. */
export async function siteAliasCandidates(size: EldDatabaseSize, minLetters: number): Promise<Readonly<Record<string, readonly string[]>>> {
  const reader = await loadEldReader(size);
  const confident = confidentAt(minLetters);
  const out: Record<string, readonly string[]> = {};
  for (const locale of ["ga", "id", "mt"]) {
    const counts = new Map<string, number>();
    for (const sentence of legalSentences(locale)) {
      const reading = reader.read(sentence);
      if (confident(reading) && ELD_LANGUAGES.includes(reading.code!) && !LEGAL_LOCALES.includes(reading.code!)) {
        counts.set(reading.code!, (counts.get(reading.code!) ?? 0) + 1);
      }
    }
    out[locale] = Object.freeze([...counts].sort((a, b) => b[1] - a[1]).map(([code]) => code));
  }
  return Object.freeze(out);
}

/** CR-2: per site S, the confident readings naming S on another legal locale's sentences, by that locale (and the Romanian set without diacritics). */
export async function siteConfusions(size: EldDatabaseSize, minLetters: number): Promise<Readonly<Record<string, Readonly<Record<string, number>>>>> {
  const reader = await loadEldReader(size);
  const confident = confidentAt(minLetters);
  const out: Record<string, Record<string, number>> = Object.fromEntries(LEGAL_LOCALES.map((site) => [site, {}]));
  const note = (from: string, sentence: string): void => {
    const reading = reader.read(sentence);
    if (!confident(reading) || reading.code === from.split("-")[0] || !LEGAL_LOCALES.includes(reading.code!)) return;
    out[reading.code!]![from] = (out[reading.code!]![from] ?? 0) + 1;
  };
  for (const locale of LEGAL_LOCALES) for (const sentence of legalSentences(locale)) note(locale, sentence);
  for (const sentence of legalSentences("ro")) note("ro-plain", withoutDiacritics(sentence));
  return Object.freeze(Object.fromEntries(Object.entries(out).map(([site, from]) => [site, Object.freeze(from)])));
}

export function confusedSites(confusions: Readonly<Record<string, Readonly<Record<string, number>>>>): readonly string[] {
  return Object.freeze(Object.entries(confusions).filter(([, from]) => Object.values(from).some((count) => count > 0)).map(([site]) => site).sort());
}

/** Ruling L-MIX: per clause minimum, how many built mixes eld sees as a mix and how many pure questions it flags. */
export type EldMixRow = Readonly<{ segmentMinLetters: number; joins: number; mixCaught: number; pure: number; pureFlagged: number }>;

export async function measureEldMix(size: EldDatabaseSize, segmentMinLetters: readonly number[]): Promise<readonly EldMixRow[]> {
  const reader = await loadEldReader(size);
  const joins = mixedQuestions().map((question) => reader.read(question.text));
  const pure = pureControls().map((question) => reader.read(question.text));
  return Object.freeze(segmentMinLetters.map((min) => {
    const seesMix = (reading: EldReading): boolean => new Set(reading.segments
      .filter((segment) => segment.code !== null && segment.reliable && segment.letters >= min)
      .map((segment) => segment.code)).size >= 2;
    return Object.freeze({ segmentMinLetters: min, joins: joins.length, mixCaught: joins.filter(seesMix).length,
      pure: pure.length, pureFlagged: pure.filter(seesMix).length });
  }));
}

export function chooseSegmentMinLetters(rows: readonly EldMixRow[]): EldMixRow | null {
  const safe = rows.filter((row) => row.pureFlagged * 20 <= row.pure);
  if (safe.length === 0) return null;
  return [...safe].sort((a, b) => b.mixCaught - a.mixCaught || b.segmentMinLetters - a.segmentMinLetters)[0]!;
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  const rows = await measureEld(["small", "medium", "large"], [0, 12, 20, 30, 40]);
  console.table(rows);
  const chosen = chooseEldTuning(rows);
  console.log(JSON.stringify({ chosen }, null, 2));
  if (chosen !== null) {
    console.log(JSON.stringify(await siteAliasCandidates(chosen.size, chosen.minLetters), null, 2));
    const confusions = await siteConfusions(chosen.size, chosen.minLetters);
    console.log(JSON.stringify({ confusions, confusedSites: confusedSites(confusions) }, null, 2));
    const mixRows = await measureEldMix(chosen.size, [12, 20, 30, 40]);
    console.table(mixRows);
    console.log(JSON.stringify({ chosenMix: chooseSegmentMinLetters(mixRows) }, null, 2));
  }
}
```

The tool is not shipped runtime code. It lives under tools/, which is NOT a corpus root, so it never goes into the manifest (pre-flight PF-L9); it still follows the source rules. The last block uses `process.argv`, not `process.env`, which the rules allow.

- [ ] **Step 5: Measure (one run, about 2–3 minutes, about 300 MB: three eld databases are loaded in one process; pre-flight PF-L9)**

Run: `pnpm exec tsx tools/question-language-tune/measure-eld.ts`

Keep the printed table. If `chosen` is `null`, STOP and report the table to the controller. The owner decides between a looser bar and the fast AI on every question.

Keep the printed `confusions` and `confusedSites` too (ruling CR-2): `confusedSites` goes verbatim into `ELD_CONFUSED_SITES` in Step 6, and the counts per locale go in that constant's comment. An empty list is a valid result. Report the list to the controller: it is part of the owner's "always asks" site list.

Keep the printed mix table and `chosenMix` too (ruling L-MIX): its `segmentMinLetters` and the four counts go into `ELD_TUNING` in Step 6, and the table into the comment. If `chosenMix` is `null`, STOP and report the table to the controller. If it catches fewer than 80% of the joins, continue but report it.

Implementer note (pre-flight PF-L20): with "any confident confusion" as the bar, `confusedSites` may list many sites, so the fast AI becomes the common path. The preview Anthropic gate allows 2 calls at once and 600 paid posts a day, shared with debates (`deploy/preview-gate/v3/README-anthropic.md` ~344), and a busy gate falls back silently (never a block). Report the list's length to the controller with the counts; the controller decides whether a count floor is needed. Do not add one here.

For the aliases, keep only codes that cover at least 5% of that locale's confident readings. `ms` for `id` is expected. Drop any alias that is one of our 35, and any for `ga`/`mt` that names a major language (for example `en`, `it`): a wrong alias there would turn an English question on the Maltese site into Maltese. Report what was dropped.

- [ ] **Step 6: Record the numbers** — create `apps/api/src/question-language/eld-tuning.ts`. Fill in the `<…>` placeholders from Step 5's output, and paste the whole table into the comment:

```ts
import type { EldDatabaseSize, EldReading, EldSegmentReading } from "./eld.js";

/**
 * eld's confidence as measured on the legal-page set (#158; tools/question-language-tune/measure-eld.ts, run on
 * <date>). Confident = isReliable() AND at least `minLetters` letters. Chosen by chooseEldTuning: no Romanian/English
 * confusion, no Romanian-without-diacritics sentence read as anything else, at most 0.05% of sentences readable as
 * another of our languages, then the most questions settled with no fast call.
 *
 * <paste the console.table output here, one row per line>
 */
export const ELD_TUNING = Object.freeze({
  database: "<size>" as EldDatabaseSize,
  minLetters: <n>,
  // Ruling L-MIX: a clause is a confident reading with at least this many letters of plain words (chooseSegmentMinLetters).
  segmentMinLetters: <n>,
  measured: Object.freeze({ on: "<YYYY-MM-DD>", sentences: <n>, settlesOwnSite: <n>, wrongLockable: <n>, wrongLockableRoEn: 0 }),
  // <paste the mix table here>; joins = the built RO+EN / EN+RO set, pure = every legal sentence + RO without diacritics.
  measuredMix: Object.freeze({ joins: <n>, mixCaught: <n>, pure: <n>, pureFlagged: <n> })
});

/**
 * Only in the FALLBACK (fast AI down, or no paid AI): an eld reading that names one of these codes on the given site
 * reads as the site language. eld never SETTLES a site language it lacks (decide.ts).
 */
export const ELD_SITE_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ga: Object.freeze([/* measured */]),
  id: Object.freeze(["ms"]),
  mt: Object.freeze([/* measured */])
});

/**
 * Ruling CR-2: our sites eld confidently named for another locale's sentence on the legal-page set at the chosen
 * configuration (Step 5's `confusedSites`, pasted sorted; the measured counts per locale go in the comment above).
 * On these sites the fast AI always checks (decide.ts FAST_CHECK_ALWAYS_SITES), even when eld names the site language.
 */
export const ELD_CONFUSED_SITES: readonly string[] = Object.freeze([/* measured, sorted */]);

export function eldConfident(reading: EldReading): boolean {
  return reading.code !== null && reading.reliable && reading.letters >= ELD_TUNING.minLetters;
}

/** Ruling L-MIX: one clause read confidently (its letters are plain words only: never names, brands or acronyms). */
export function eldSegmentConfident(segment: EldSegmentReading): boolean {
  return segment.code !== null && segment.reliable && segment.letters >= ELD_TUNING.segmentMinLetters;
}

/** Ruling L-MIX: eld sees a mix when at least two clauses read confidently as DIFFERENT languages. Then eld never settles. */
export function eldSeesMix(reading: EldReading): boolean {
  return new Set(reading.segments.filter(eldSegmentConfident).map((segment) => segment.code)).size >= 2;
}
```

Add `apps/api/src/question-language/eld-tuning.ts` to the manifest (only that file: the tools stay out, PF-L9).

If the "practice cases" test fails at the recorded configuration (the P2d mix case is not seen as a mix, or the borrowed-words case is), STOP and report to the controller with the segments eld read: that case's expected outcome in P2d depends on it.

- [ ] **Step 7: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-eld-tuning.test.ts`
- `pnpm exec vitest run tests/unit/argument-language.test.ts`

- [ ] **Step 8: Commit**

```bash
git add tools/question-language-tune apps/api/src/question-language/eld-tuning.ts tests/unit/question-language-eld-tuning.test.ts tests/unit/argument-language.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "Question language: eld tuned on the legal-page set — size, minimum letters, site aliases and confused sites measured and recorded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The owner's row `questionLanguagePolicy` (fast-check settings + editable instruction)

There is no register row today that stores owner-editable prompt TEXT. Every existing prompt row seals only a sha256 of code text, and the story pack is files, not a row. This is the smallest row consistent with how sealed rows work:
- one optional single-row family, a copy of `answerRoleRotationPolicy` / `debateShapePolicy`;
- never edited: a new value is a new register version;
- absent means the code's start values.

The safety frame stays code (`buildFramedPrompt`). The row holds only the instruction text and the settings.

**Files:**
- Create: `packages/register/src/question-language-policy.ts`
- Modify: `packages/register/src/index.ts` (export block next to `debate-shape-policy.js`), `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-policy.test.ts` (create)

**Interfaces:**
- Produces:
```ts
export const QUESTION_LANGUAGE_POLICY_ROW_KEY: "questionLanguagePolicy";
export const QUESTION_LANGUAGE_FAST_CHECK_PROVIDERS: readonly ["anthropic"];
export const QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION: string;
export type QuestionLanguageFastCheck = Readonly<{ provider: "anthropic"; model: string; effort: "low" | "medium" | "high";
  timeoutMs: number; maxOutputTokens: number; priceMicrosUsdPerMillionTokens: Readonly<{ input: number; output: number }> }>;
export type QuestionLanguagePolicy = Readonly<{ kind: "QUESTION_LANGUAGE_POLICY"; version: 1;
  fastCheck: QuestionLanguageFastCheck | null; instruction: string }>;
export function parseQuestionLanguagePolicy(value: unknown): QuestionLanguagePolicy;       // TypeError("QUESTION_LANGUAGE_POLICY_INVALID:<path>")
export async function readQuestionLanguagePolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<QuestionLanguagePolicy | null>;
export function questionLanguagePolicyRow(policy: QuestionLanguagePolicy, sourceRef: string): Readonly<{ rowKey: "questionLanguagePolicy"; valueJsonText: CanonicalRegisterJson; sourceRef: string }>;
export function questionLanguagePolicyStartValues(): QuestionLanguagePolicy;
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION, QUESTION_LANGUAGE_POLICY_ROW_KEY, parseQuestionLanguagePolicy,
  questionLanguagePolicyRow, questionLanguagePolicyStartValues, readQuestionLanguagePolicy
} from "@debateai/register";

const start = () => JSON.parse(JSON.stringify(questionLanguagePolicyStartValues())) as Record<string, any>;
const poolWith = (rows: unknown[]) => ({ query: async () => ({ rows }) }) as never;

describe("the optional row questionLanguagePolicy (question-language spec 2026-10-13)", () => {
  it("start values: Claude Haiku 5.5, effort low, five seconds, the default instruction", () => {
    expect(questionLanguagePolicyStartValues()).toEqual({
      kind: "QUESTION_LANGUAGE_POLICY", version: 1,
      fastCheck: { provider: "anthropic", model: "claude-haiku-5-5", effort: "low", timeoutMs: 5000, maxOutputTokens: 600,
        priceMicrosUsdPerMillionTokens: { input: 100000, output: 500000 } },
      instruction: QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION
    });
    expect(QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION).toMatch(/borrowed words/u);
    expect(QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION).not.toMatch(/score|threshold|eld|engine/iu);
  });

  it("an owner may switch the fast check off (null) and edit the text", () => {
    const value = { ...start(), fastCheck: null, instruction: "Name the question's language." };
    expect(parseQuestionLanguagePolicy(value)).toEqual(value);
  });

  it.each([
    ["an unknown provider (refused at boot until it is built)", (v: any) => { v.fastCheck.provider = "openai"; }, "$.fastCheck.provider"],
    ["a model id with spaces", (v: any) => { v.fastCheck.model = "claude haiku"; }, "$.fastCheck.model"],
    ["a time limit over 15 s", (v: any) => { v.fastCheck.timeoutMs = 15001; }, "$.fastCheck.timeoutMs"],
    ["an effort the gate does not know", (v: any) => { v.fastCheck.effort = "none"; }, "$.fastCheck.effort"],
    ["an empty instruction", (v: any) => { v.instruction = " "; }, "$.instruction"],
    ["an instruction over 4000 characters", (v: any) => { v.instruction = "a".repeat(4001); }, "$.instruction"],
    ["a control character in the instruction", (v: any) => { v.instruction = "Name it.\u0007"; }, "$.instruction"],
    ["an extra key", (v: any) => { v.extra = 1; }, "$"],
    ["another version", (v: any) => { v.version = 2; }, "$.version"]
  ])("refuses %s", (_name, edit, path) => {
    const value = start();
    edit(value);
    expect(() => parseQuestionLanguagePolicy(value)).toThrow(`QUESTION_LANGUAGE_POLICY_INVALID:${path}`);
  });

  it("reads absent as null, and a sealed row strictly", async () => {
    expect(await readQuestionLanguagePolicy(poolWith([]), 7)).toBeNull();
    expect(await readQuestionLanguagePolicy(poolWith([{ value_json: start() }]), 7)).toEqual(questionLanguagePolicyStartValues());
    await expect(readQuestionLanguagePolicy(poolWith([{ value_json: { kind: "X" } }]), 7)).rejects.toThrow(/QUESTION_LANGUAGE_POLICY_INVALID/u);
  });

  it("the row builder re-parses and needs a source ref", () => {
    const row = questionLanguagePolicyRow(questionLanguagePolicyStartValues(), "owner:2026-10-13");
    expect(row.rowKey).toBe(QUESTION_LANGUAGE_POLICY_ROW_KEY);
    expect(parseQuestionLanguagePolicy(JSON.parse(row.valueJsonText))).toEqual(questionLanguagePolicyStartValues());
    expect(() => questionLanguagePolicyRow(questionLanguagePolicyStartValues(), " ")).toThrow("QUESTION_LANGUAGE_POLICY_INVALID:sourceRef");
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-policy.test.ts`

- [ ] **Step 3: Implement** `packages/register/src/question-language-policy.ts`. Follow `debate-shape-policy.ts`'s helpers: `invalid(path)`, `deepFreeze`, `shapeAst` → here `policyAst`, and `canonicalDecimal` for numbers.

```ts
import type { Pool } from "pg";
import { z } from "zod";
import { canonicalDecimal, canonicalRegisterJson, type CanonicalJsonAst, type CanonicalRegisterJson } from "./register-publication.js";

/**
 * Question language (question-language spec 2026-10-13): ONE optional row in its own family. It holds the fast
 * language check's settings and the owners' editable instruction text. The safety frame around the text is code
 * (buildFramedPrompt). It is not a register.required_row, not in the bootstrap and not in the dev rows. Absent means
 * the start values below. A row that does not parse refuses the API's boot. Never edited: a new value is a new
 * register version.
 */
export const QUESTION_LANGUAGE_POLICY_ROW_KEY = "questionLanguagePolicy" as const;
/** Today only Anthropic; GPT-6 Luna is added here, with its transport, once the OpenAI integration exists. */
export const QUESTION_LANGUAGE_FAST_CHECK_PROVIDERS = Object.freeze(["anthropic"] as const);

export const QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION = [
  "Name the language the question in question_line is written in.",
  "Names of people, places, products and brands, and common borrowed words such as \"AI\", \"startup\" or \"iPhone\",",
  "never count as another language. A question really mixes languages only when whole phrases or clauses are written",
  "in a second language. site_language is the language of the website the person is using: it is a hint, never the answer.",
  "When the question really mixes languages, also write the whole question in its main language: keep its meaning, its",
  "names, brands and terms, add nothing and leave nothing out. Do not answer the question."
].join(" ");

const MODEL_ID = /^[a-z0-9][a-z0-9.-]{0,63}$/u;
// Printable text and line breaks only: no control characters (a bell, an escape) in owner text.
const NO_CONTROL = /^[^\u0000-\u0009\u000b-\u001f\u007f]*$/u;

const fastCheckSchema = z.object({
  provider: z.enum(QUESTION_LANGUAGE_FAST_CHECK_PROVIDERS),
  model: z.string().regex(MODEL_ID),
  effort: z.enum(["low", "medium", "high"]),
  timeoutMs: z.number().int().min(1000).max(15000),
  maxOutputTokens: z.number().int().min(128).max(4096),
  priceMicrosUsdPerMillionTokens: z.object({
    input: z.number().int().min(0).max(100_000_000),
    output: z.number().int().min(0).max(100_000_000)
  }).strict()
}).strict();
const schema = z.object({
  kind: z.literal("QUESTION_LANGUAGE_POLICY"),
  version: z.literal(1),
  fastCheck: fastCheckSchema.nullable(),
  instruction: z.string().max(4000).regex(NO_CONTROL).refine((text) => text.trim() !== "")
}).strict();

export type QuestionLanguageFastCheck = z.infer<typeof fastCheckSchema>;
export type QuestionLanguagePolicy = Readonly<z.infer<typeof schema>>;
```

Then add `invalid`, `protoKeyPath`, `parseQuestionLanguagePolicy`, `readQuestionLanguagePolicy`, `policyAst`, `questionLanguagePolicyRow` and `questionLanguagePolicyStartValues`, modelled on `debate-shape-policy.ts`, with ONE deliberate difference in the path (pre-flight PF-L11):
- the error path: `debate-shape-policy.ts` emits the bare joined path (`fastCheck.provider`) and `$` only for the root; THIS row emits `"$." + path.map(String).join(".")` (`$.fastCheck.provider`), and `$` for the root, because the tests above pin `QUESTION_LANGUAGE_POLICY_INVALID:$.fastCheck.provider`;
- copy its `protoKeyPath` refusal (a `__proto__` / `constructor` / `prototype` key anywhere is refused first, with its `$.`-prefixed path);
- `TypeError` with the `QUESTION_LANGUAGE_POLICY_INVALID:` prefix;
- `readQuestionLanguagePolicy` returns `null` for no row;
- the row builder re-parses and refuses a blank `sourceRef` with `QUESTION_LANGUAGE_POLICY_INVALID:sourceRef` (no `$`: it is not a path in the value).

The start values are those in the test. In `packages/register/src/index.ts`, export the NINE names (seven values: `QUESTION_LANGUAGE_POLICY_ROW_KEY`, `QUESTION_LANGUAGE_FAST_CHECK_PROVIDERS`, `QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION`, `parseQuestionLanguagePolicy`, `readQuestionLanguagePolicy`, `questionLanguagePolicyRow`, `questionLanguagePolicyStartValues`; two types: `QuestionLanguageFastCheck`, `QuestionLanguagePolicy`) next to the debate-shape exports. Add the file to the manifest.

Implementer note (pre-flight PF-L12): the row follows the register-row recipe (optional single row, null when absent, a malformed row throws, the builder re-parses through `canonicalRegisterJson`, not in `developmentRows`); the safety frame stays code (`buildFramedPrompt`, `packages/providers/src/prompt-frame.ts`), and every edit is a new sealed version. The owner's editable-prompt requirement also asks for a rules gate (the injection suite and the answer form kept) before an edited text goes live; this task has only the length and control-character checks. That gate is an owner follow-up (Owner steps 9), not built here. The prices (100,000 and 500,000 micro-USD per million tokens) match the Haiku row; no sealed value moves.

Ruling CR-4: the test and the start values above use effort `low`, which is right when Task 0 Step 5 wrote `FAST_CHECK_EFFORT_START = low` (the expected result). If Step 5 found a "thinking off" word that BOTH preview gates accept for Haiku (for example `default`, which `anthropicMessagesRequestBody` turns into a body with no `output_config`), then: add that word to `fastCheckSchema.effort`'s enum and to the `QuestionLanguageFastCheck` type, make it the start value, change the first test's expected `effort` to it, and keep the refusal case `effort = "none"`. Task 12's boot check (`efforts` of the reviewed preview row) then accepts it by construction. Say which in the commit message.

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/question-language-policy.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/register/src/question-language-policy.ts packages/register/src/index.ts tests/unit/question-language-policy.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "Register: optional row questionLanguagePolicy — fast-check provider, model and limits, and the owners' editable instruction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: The fast check — contract, answer form, framing, reply reader and time limit

**Files:**
- Create: `apps/api/src/question-language/fast-check.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-fast-check.test.ts` (create)

**Interfaces:**
- Consumes: `buildFramedPrompt`, `promptContractFingerprintText`, `readPromptFrame`, `PromptContract`, `PromptPacket` (`@debateai/providers`); `QuestionLanguage`, `questionLanguageOf` (Task 1); `QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION` (Task 4).
- Produces:
```ts
export const QUESTION_LANGUAGE_CHECK_CONTRACT_ID: "ask.question-language.v1";
export const QUESTION_LANGUAGE_CHECK_ANSWER_FORM: string;
export function questionLanguageCheckContract(instruction: string): PromptContract;
export function questionLanguageCheckContractHash(instruction: string): string;
export function assertQuestionLanguageInstructionFrameable(instruction: string): void;   // boot: QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN
export function framedQuestionLanguageCheck(instruction: string, questionLine: string, site: QuestionLanguage): PromptPacket;
export type FastCheckReading =
  | Readonly<{ kind: "DOWN"; reason: "TIMEOUT" | "TRANSPORT" | "UNREADABLE" | "UNKNOWN_LANGUAGE" }>
  | Readonly<{ kind: "ONE"; main: QuestionLanguage }>
  | Readonly<{ kind: "MIX"; main: QuestionLanguage; seen: readonly QuestionLanguage[]; proposed: string }>;
export function readQuestionLanguageReply(text: string, questionLine: string): FastCheckReading;
export type FastCheckTransport = (input: Readonly<{ packet: PromptPacket; signal: AbortSignal }>) => Promise<string>;
export type FastCheck = Readonly<{ contractHash: string; read(questionLine: string, site: QuestionLanguage): Promise<FastCheckReading> }>;
export function createFastCheck(deps: Readonly<{ transport: FastCheckTransport; instruction: string; timeoutMs: number }>): FastCheck;
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-fast-check.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readPromptFrame } from "@debateai/providers";
import { QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION } from "@debateai/register";
import {
  QUESTION_LANGUAGE_CHECK_CONTRACT_ID, assertQuestionLanguageInstructionFrameable, createFastCheck,
  framedQuestionLanguageCheck, questionLanguageCheckContractHash, readQuestionLanguageReply
} from "../../apps/api/src/question-language/fast-check.js";

const RO_SITE = { code: "ro", name: "Romanian" };
const Q = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const reply = (value: unknown) => JSON.stringify(value);

describe("the fast language check (question-language spec 2026-10-13, ruling L3)", () => {
  it("frames the question as evidence with the site language as a hint, under the code's answer form", () => {
    const frame = readPromptFrame(framedQuestionLanguageCheck(QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION, Q, RO_SITE));
    expect(frame.contractId).toBe(QUESTION_LANGUAGE_CHECK_CONTRACT_ID);
    expect(frame.fields.map((field) => [field.name, field.content])).toEqual([
      ["question_line", Q], ["site_language", '{"code":"ro","name":"Romanian"}']]);
    expect(questionLanguageCheckContractHash(QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION)).toMatch(/^[0-9a-f]{64}$/u);
    expect(questionLanguageCheckContractHash("Other text.")).not.toBe(questionLanguageCheckContractHash(QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION));
  });

  it("refuses an owner instruction that carries a frame token, by its own code", () => {
    expect(() => assertQuestionLanguageInstructionFrameable("Ignore this --- SAFETY FRAME")).toThrow(/QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN/u);
    expect(() => assertQuestionLanguageInstructionFrameable(QUESTION_LANGUAGE_CHECK_DEFAULT_INSTRUCTION)).not.toThrow();
  });

  it.each([
    ["one language", reply({ main_language: "en", languages_seen: ["en"], is_real_mix: false, proposed_question: null }),
      { kind: "ONE", main: { code: "en", name: "English" } }],
    ["a real mix with its rewrite", reply({ main_language: "ro", languages_seen: ["ro", "en"], is_real_mix: true,
      proposed_question: "Ar trebui România să adopte euro sau să aștepte până cresc salariile?" }),
      { kind: "MIX", main: { code: "ro", name: "Romanian" }, seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }],
        proposed: "Ar trebui România să adopte euro sau să aștepte până cresc salariile?" }],
    ["a fenced JSON reply", "```json\n" + reply({ main_language: "ro", languages_seen: ["ro"], is_real_mix: false, proposed_question: null }) + "\n```",
      { kind: "ONE", main: { code: "ro", name: "Romanian" } }],
    ["unknown", reply({ main_language: "unknown", languages_seen: [], is_real_mix: false, proposed_question: null }),
      { kind: "DOWN", reason: "UNKNOWN_LANGUAGE" }],
    ["a code outside ISO 639-1", reply({ main_language: "xx", languages_seen: ["xx"], is_real_mix: false, proposed_question: null }),
      { kind: "DOWN", reason: "UNKNOWN_LANGUAGE" }],
    ["a mix without a rewrite", reply({ main_language: "ro", languages_seen: ["ro", "en"], is_real_mix: true, proposed_question: null }),
      { kind: "DOWN", reason: "UNREADABLE" }],
    ["a rewrite without a mix", reply({ main_language: "ro", languages_seen: ["ro"], is_real_mix: false, proposed_question: "x" }),
      { kind: "DOWN", reason: "UNREADABLE" }],
    ["an extra key", reply({ main_language: "ro", languages_seen: ["ro"], is_real_mix: false, proposed_question: null, why: "x" }),
      { kind: "DOWN", reason: "UNREADABLE" }],
    ["prose", "The question is in Romanian.", { kind: "DOWN", reason: "UNREADABLE" }]
  ])("reads %s", (_name, text, expected) => {
    expect(readQuestionLanguageReply(text, Q)).toEqual(expected);
  });

  it("names Serbian with the script the question uses", () => {
    expect(readQuestionLanguageReply(reply({ main_language: "sr", languages_seen: ["sr"], is_real_mix: false, proposed_question: null }),
      "Da li bi Srbija trebalo da uvede evro umesto dinara?")).toEqual({ kind: "ONE", main: { code: "sr-Latn", name: "Serbian (Latin script)" } });
  });

  it("reads a BCP-47 code with a region or script subtag by its primary language (pre-flight PF-L14)", () => {
    expect(readQuestionLanguageReply(reply({ main_language: "sr-Latn", languages_seen: ["sr-Latn"], is_real_mix: false, proposed_question: null }),
      "Da li bi Srbija trebalo da uvede evro umesto dinara?")).toEqual({ kind: "ONE", main: { code: "sr-Latn", name: "Serbian (Latin script)" } });
    expect(readQuestionLanguageReply(reply({ main_language: "pt-BR", languages_seen: ["pt-BR"], is_real_mix: false, proposed_question: null }),
      "O Brasil deveria adotar uma moeda comum com a Argentina?")).toEqual({ kind: "ONE", main: { code: "pt", name: "Portuguese" } });
    expect(readQuestionLanguageReply(reply({ main_language: "ro", languages_seen: ["ro", "en-GB"], is_real_mix: true, proposed_question: "Q?" }), Q))
      .toMatchObject({ kind: "MIX", seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }] });
  });

  it("a transport failure or a slow transport is DOWN, never a throw, and the time limit aborts the call", async () => {
    const failing = createFastCheck({ transport: async () => { throw new Error("boom"); }, instruction: "Name it.", timeoutMs: 1000 });
    expect(await failing.read(Q, RO_SITE)).toEqual({ kind: "DOWN", reason: "TRANSPORT" });
    let aborted = false;
    const slow = createFastCheck({ instruction: "Name it.", timeoutMs: 1000, transport: ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); });
    }) });
    const started = Date.now();
    expect(await slow.read(Q, RO_SITE)).toEqual({ kind: "DOWN", reason: "TIMEOUT" });
    expect(aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-fast-check.test.ts`

- [ ] **Step 3: Implement** `apps/api/src/question-language/fast-check.ts`:

```ts
import { createHash } from "node:crypto";
import { z } from "zod";
import { TypedDomainError, questionLanguageOf, type QuestionLanguage } from "@debateai/kernel";
import { buildFramedPrompt, promptContractFingerprintText, type PromptContract, type PromptPacket } from "@debateai/providers";

/**
 * The fast language check (question-language spec 2026-10-13, ruling L3): one short call, run only when eld did not
 * settle the question, before any debate exists. The INSTRUCTION is the owners' editable text (row
 * questionLanguagePolicy). The ANSWER FORM and the frame are code's. The question is evidence, never orders.
 */
export const QUESTION_LANGUAGE_CHECK_CONTRACT_ID = "ask.question-language.v1" as const;

export const QUESTION_LANGUAGE_CHECK_ANSWER_FORM = [
  "Return only one JSON object with exactly this schema and no additional keys:",
  '{ "main_language": the two-letter ISO 639-1 code of the language most of the question is written in, in lower case, or "unknown",',
  '"languages_seen": [the two-letter codes of every language the question really uses, main_language first, at most 6],',
  '"is_real_mix": true only when whole phrases or clauses are in a second language, otherwise false,',
  '"proposed_question": when is_real_mix is true, the whole question written in main_language; otherwise null }'
].join("\n");

export function questionLanguageCheckContract(instruction: string): PromptContract {
  return Object.freeze({ contractId: QUESTION_LANGUAGE_CHECK_CONTRACT_ID, instruction, answerForm: QUESTION_LANGUAGE_CHECK_ANSWER_FORM });
}

/** Recorded with every lock that used the check, so a lock traces to the exact text that produced it. */
export function questionLanguageCheckContractHash(instruction: string): string {
  return createHash("sha256").update(promptContractFingerprintText(questionLanguageCheckContract(instruction)), "utf8").digest("hex");
}

/** Boot: an owner text carrying a frame token is refused once, by name, never at every ask. */
export function assertQuestionLanguageInstructionFrameable(instruction: string): void {
  try {
    buildFramedPrompt({ contract: questionLanguageCheckContract(instruction), material: [] });
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === "PROMPT_INSTRUCTION_RESERVED_TOKEN") {
      // Pre-flight PF-L13: vitest's toThrow(/…/) matches the MESSAGE, and TypedDomainError keeps the code only in
      // `.code`, so the message IS the code (it carries no owner or question text).
      throw new TypedDomainError("QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN", "QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN");
    }
    throw error;
  }
}

export function framedQuestionLanguageCheck(instruction: string, questionLine: string, site: QuestionLanguage): PromptPacket {
  return buildFramedPrompt({
    contract: questionLanguageCheckContract(instruction),
    material: [
      { name: "question_line", content: questionLine },
      { name: "site_language", content: JSON.stringify({ code: site.code, name: site.name }) }
    ]
  }).packet;
}

export type FastCheckReading =
  | Readonly<{ kind: "DOWN"; reason: "TIMEOUT" | "TRANSPORT" | "UNREADABLE" | "UNKNOWN_LANGUAGE" }>
  | Readonly<{ kind: "ONE"; main: QuestionLanguage }>
  | Readonly<{ kind: "MIX"; main: QuestionLanguage; seen: readonly QuestionLanguage[]; proposed: string }>;

const replySchema = z.object({
  main_language: z.string().min(1).max(16),
  languages_seen: z.array(z.string().min(1).max(16)).max(6),
  is_real_mix: z.boolean(),
  proposed_question: z.string().nullable()
}).strict();

const down = (reason: Extract<FastCheckReading, { kind: "DOWN" }>["reason"]): FastCheckReading => Object.freeze({ kind: "DOWN", reason });

function jsonOf(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(trimmed);
  return JSON.parse(fenced === null ? trimmed : fenced[1]!);
}

/** A strict reading. Anything off is DOWN with a code; the caller then falls back. Never throws. */
export function readQuestionLanguageReply(text: string, questionLine: string): FastCheckReading {
  let parsed: z.infer<typeof replySchema>;
  try {
    const result = replySchema.safeParse(jsonOf(text));
    if (!result.success) return down("UNREADABLE");
    parsed = result.data;
  } catch {
    return down("UNREADABLE");
  }
  if (parsed.is_real_mix !== (parsed.proposed_question !== null)) return down("UNREADABLE");
  // Pre-flight PF-L14: the spec allows BCP-47 codes ("sr-Latn", "pt-BR", "zh-Hans"); the lock keeps only the primary
  // language and re-derives a script subtag from the question's own letters (questionLanguageOf).
  const primaryOf = (code: string): string => code.trim().split("-")[0] ?? "";
  const main = questionLanguageOf(primaryOf(parsed.main_language), questionLine);
  if (main === null) return down("UNKNOWN_LANGUAGE");
  if (!parsed.is_real_mix) return Object.freeze({ kind: "ONE", main });
  const seen = parsed.languages_seen.map((code) => questionLanguageOf(primaryOf(code), questionLine))
    .filter((language): language is QuestionLanguage => language !== null);
  return Object.freeze({ kind: "MIX", main, seen: Object.freeze(seen), proposed: parsed.proposed_question!.trim() });
}

export type FastCheckTransport = (input: Readonly<{ packet: PromptPacket; signal: AbortSignal }>) => Promise<string>;
export type FastCheck = Readonly<{ contractHash: string; read(questionLine: string, site: QuestionLanguage): Promise<FastCheckReading> }>;

export function createFastCheck(deps: Readonly<{ transport: FastCheckTransport; instruction: string; timeoutMs: number }>): FastCheck {
  const contractHash = questionLanguageCheckContractHash(deps.instruction);
  return Object.freeze({
    contractHash,
    async read(questionLine: string, site: QuestionLanguage): Promise<FastCheckReading> {
      const signal = AbortSignal.timeout(deps.timeoutMs);
      try {
        const text = await deps.transport({ packet: framedQuestionLanguageCheck(deps.instruction, questionLine, site), signal });
        return readQuestionLanguageReply(text, questionLine);
      } catch {
        return signal.aborted ? down("TIMEOUT") : down("TRANSPORT");
      }
    }
  });
}
```

`readPromptFrame(packet: PromptPacket)` takes the packet (`packages/providers/src/prompt-frame.ts`), as the test uses it. Add the file to the manifest.

Implementer note (pre-flight PF-L15): `createFastCheck` relies on the transport honouring the abort signal; both real transports do (the preview guarded fetch, `preview-test.ts` ~836–838, and global fetch). If you want `timeoutMs` to hold for ANY transport, race the transport's promise against the signal's abort (a promise rejected on `signal`'s `abort` event) inside `read`; the test above passes either way. `buildFramedPrompt`, `promptContractFingerprintText`, `readPromptFrame` and the `"--- SAFETY FRAME"` reserved token are exported from `@debateai/providers`.

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/question-language-fast-check.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/question-language/fast-check.ts tests/unit/question-language-fast-check.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API: the fast language check — owners' text in the code's frame, a strict reply reader, a time limit that never blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The transport — Anthropic Messages through the preview gate or the hosted support target

The API has no `ProviderGateway`, and the runner's gateway refuses a call with no run (`PROVIDER_RUN_REQUIRED`). The two existing run-less API calls (support chat, publication check) use their own adapter. This transport is the same idea, reduced to one Anthropic Messages POST:
- through the preview's guarded fetch (`createPreviewGuardedFetch`, the Anthropic gate, no key header), which makes it a site cost in the gate's daily pot;
- or, on hosted, with the key of the support target that already exists (the support chat's Anthropic target, parsed at boot).

Ruling CR-6: these are the ONLY two ways. On the preview the API holds no vendor credential (the gate adds the key; `credential` is `undefined` and a key header is refused by the guarded fetch). No new credential, environment variable or secret file is added anywhere. The transport logs nothing; its errors carry a code and a status, never the question, the rewrite or the reply text.

**Files:**
- Create: `apps/api/src/question-language/transport.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-transport.test.ts` (create)

**Interfaces:**
- Consumes: `anthropicMessagesRequestBody`, `anthropicMessagesRequestHeaders`, `readAnthropicMessagesReply`, `PREVIEW_ANTHROPIC_MESSAGES_URL`, `ANTHROPIC_MESSAGES_BASE_URL`, `ANTHROPIC_MESSAGES_PATH` (`@debateai/providers`); `PROJECTED_INPUT_BYTES_PER_TOKEN` (`@debateai/budget`, the money seam's own bytes-per-token projection); `FastCheckTransport` (Task 5); `QuestionLanguageFastCheck` (Task 4).
- Produces:
```ts
// `projected`: true when the vendor named no usage (or the call was aborted after it was sent) and the counts are the
// projected maximum (pre-flight PF-L16: never under-count).
export type FastCheckUsage = Readonly<{ inputTokens: number; outputTokens: number; projected: boolean }>;
export function anthropicFastCheckTransport(deps: Readonly<{
  fetch: typeof fetch; url: string; credential: string | undefined; settings: QuestionLanguageFastCheck;
  onUsage?: (usage: FastCheckUsage) => Promise<void> | void;
}>): FastCheckTransport;
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-transport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PROJECTED_INPUT_BYTES_PER_TOKEN } from "@debateai/budget";
import { PREVIEW_ANTHROPIC_MESSAGES_URL, createPreviewGuardedFetch, type PreviewBudgetExecution } from "@debateai/providers";
import { questionLanguagePolicyStartValues } from "@debateai/register";
import { framedQuestionLanguageCheck } from "../../apps/api/src/question-language/fast-check.js";
import { anthropicFastCheckTransport } from "../../apps/api/src/question-language/transport.js";

const settings = questionLanguagePolicyStartValues().fastCheck!;
const packet = framedQuestionLanguageCheck("Name it.", "Should Romania adopt the euro?", { code: "ro", name: "Romanian" });
const message = (text: string) => JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5",
  content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 310, output_tokens: 28 } });

describe("the fast check's transport", () => {
  it("on the preview: the Anthropic gate accepts the body (Haiku, effort low, no key), and the reply text comes back", async () => {
    const executed: PreviewBudgetExecution[] = [];
    const guarded = createPreviewGuardedFetch({ anthropic: { execute: async (input) => { executed.push(input); return { status: 200, body: message('{"main_language":"en"}') }; } } });
    const usage: unknown[] = [];
    const transport = anthropicFastCheckTransport({ fetch: guarded, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: undefined, settings,
      onUsage: (u) => { usage.push(u); } });
    expect(await transport({ packet, signal: AbortSignal.timeout(5000) })).toBe('{"main_language":"en"}');
    expect(executed).toHaveLength(1);
    const body = JSON.parse(executed[0]!.requestBody);
    expect(body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 600, output_config: { effort: "low" } });
    expect(usage).toEqual([{ inputTokens: 310, outputTokens: 28, projected: false }]);
  });

  it("PF-L16: a reply with no usage, or an abort after sending, records the projected maximum, never nothing", async () => {
    const noUsage = JSON.stringify({ id: "msg_2", type: "message", role: "assistant", model: "claude-haiku-5-5",
      content: [{ type: "text", text: '{"main_language":"en"}' }], stop_reason: "end_turn" });
    const usage: { inputTokens: number; outputTokens: number; projected: boolean }[] = [];
    const sent: string[] = [];
    const answering = (body: string) => (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(String(init?.body)); return new Response(body, { status: 200 }); }) as typeof fetch;
    await anthropicFastCheckTransport({ fetch: answering(noUsage), url: "https://api.anthropic.com/v1/messages", credential: "sk-ant-test", settings,
      onUsage: (u) => { usage.push(u); } })({ packet, signal: AbortSignal.timeout(5000) });
    expect(usage).toEqual([{ inputTokens: Math.ceil(Buffer.byteLength(sent[0]!, "utf8") / PROJECTED_INPUT_BYTES_PER_TOKEN), outputTokens: settings.maxOutputTokens, projected: true }]);
    const hanging = (async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)); })) as typeof fetch;
    const controller = new AbortController();
    const pending = anthropicFastCheckTransport({ fetch: hanging, url: "https://api.anthropic.com/v1/messages", credential: "sk-ant-test", settings,
      onUsage: (u) => { usage.push(u); } })({ packet, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    expect(usage.at(-1)).toMatchObject({ outputTokens: settings.maxOutputTokens, projected: true });
  });

  it("on hosted: the key goes as x-api-key, and a refusal or a non-200 is a throw (the check reads it as DOWN)", async () => {
    const seen: Request[] = [];
    const hostedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return new Response(JSON.stringify({ type: "error" }), { status: 529 });
    }) as typeof fetch;
    const transport = anthropicFastCheckTransport({ fetch: hostedFetch, url: "https://api.anthropic.com/v1/messages", credential: "sk-ant-test", settings });
    await expect(transport({ packet, signal: AbortSignal.timeout(5000) })).rejects.toThrow(/QUESTION_LANGUAGE_FAST_CHECK_HTTP_529/u);
    expect(seen[0]!.headers.get("x-api-key")).toBe("sk-ant-test");
  });

  it("CR-6: on the preview no key header is ever sent, and a failure carries no question text", async () => {
    const guarded = createPreviewGuardedFetch({ anthropic: { execute: async () => ({ status: 500, body: "{}" }) } });
    const transport = anthropicFastCheckTransport({ fetch: guarded, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: undefined, settings });
    const failure = await transport({ packet, signal: AbortSignal.timeout(5000) }).catch((error: unknown) => error);
    expect(String((failure as Error).message)).not.toContain("Romania");
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-transport.test.ts`

- [ ] **Step 3: Implement** `apps/api/src/question-language/transport.ts`:

```ts
import { PROJECTED_INPUT_BYTES_PER_TOKEN } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import { anthropicMessagesRequestBody, anthropicMessagesRequestHeaders, readAnthropicMessagesReply } from "@debateai/providers";
import type { QuestionLanguageFastCheck } from "@debateai/register";
import type { FastCheckTransport } from "./fast-check.js";

export type FastCheckUsage = Readonly<{ inputTokens: number; outputTokens: number; projected: boolean }>;

/**
 * One Anthropic Messages POST for the fast language check. On the preview, `fetch` is the guarded fetch: the
 * Anthropic gate reserves and settles it in its daily pot (a site cost; the gate has no run concept), and no key
 * header is sent. On hosted, `credential` is the support target's Anthropic key and `onUsage` records the site
 * cost (Task 19). The reply text is returned as is; fast-check.ts reads it strictly.
 */
export function anthropicFastCheckTransport(deps: Readonly<{
  fetch: typeof fetch; url: string; credential: string | undefined; settings: QuestionLanguageFastCheck;
  onUsage?: (usage: FastCheckUsage) => Promise<void> | void;
}>): FastCheckTransport {
  return async ({ packet, signal }) => {
    const body = anthropicMessagesRequestBody({ model: deps.settings.model, maxTokens: deps.settings.maxOutputTokens,
      thinkingLevel: deps.settings.effort, messages: packet.messages });
    // Pre-flight PF-L16 (money law: never under-count): when the vendor names no usage (anthropicUsageAsEngineUsage
    // gives -1), or the call is aborted after it was sent, the record is the projected maximum — the request body's
    // bytes by the money seam's own rule, and the whole output bound.
    const projectedMaximum = (): FastCheckUsage => Object.freeze({
      inputTokens: Math.ceil(Buffer.byteLength(typeof body === "string" ? body : JSON.stringify(body), "utf8") / PROJECTED_INPUT_BYTES_PER_TOKEN),
      outputTokens: deps.settings.maxOutputTokens, projected: true });
    let response: Response;
    try {
      response = await deps.fetch(deps.url, { method: "POST", headers: anthropicMessagesRequestHeaders(deps.credential), body, signal });
    } catch (error) {
      if (signal.aborted && deps.onUsage !== undefined) await deps.onUsage(projectedMaximum());
      throw error;
    }
    if (response.status !== 200) {
      // The message is the code (pre-flight PF-L13: toThrow(/…/) reads the message). A refused request costs nothing.
      const code = `QUESTION_LANGUAGE_FAST_CHECK_HTTP_${String(response.status)}`;
      throw new TypedDomainError(code, code);
    }
    const reply = readAnthropicMessagesReply(await response.json());
    if (reply.failure !== null) throw reply.failure;
    const normalized = reply.normalized as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
    const inputTokens = Number(normalized.usage?.prompt_tokens ?? -1);
    const outputTokens = Number(normalized.usage?.completion_tokens ?? -1);
    if (deps.onUsage !== undefined) {
      await deps.onUsage(inputTokens >= 0 && outputTokens >= 0 ? Object.freeze({ inputTokens, outputTokens, projected: false }) : projectedMaximum());
    }
    const content = normalized.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new TypedDomainError("QUESTION_LANGUAGE_FAST_CHECK_REPLY_EMPTY", "QUESTION_LANGUAGE_FAST_CHECK_REPLY_EMPTY");
    return content;
  };
}
```

`TypedDomainError`'s code is a plain `string` (`packages/kernel/src/index.ts`), so the computed code is fine. If `anthropicMessagesRequestBody` returns an object rather than a string, pass `JSON.stringify(body)` to `fetch` (the projection above already measures the string form). Add the file to the manifest.

Implementer note (pre-flight PF-L17): the preview facts hold — `createPreviewGuardedFetch(ports)` (`packages/providers/src/preview-test.ts` ~663); the API already builds `previewFetch` (`apps/api/src/main.ts` ~511); the Anthropic gate's peers include the API (`deploy/preview-gate/v3/README-anthropic.md` ~331). `anthropicBodyAccepted` and the Python `body_valid` accept exactly `model`, `max_tokens` (≤ 32768), `messages`, an optional `system` and `output_config.effort`; this body passes and reserves about $0.0165. At effort `low`, thinking counts against `max_tokens: 600`: a cut-off reply reads UNREADABLE and falls back (never a block). On hosted, the key is the support target's (`SUPPORT_MODEL_TARGET_JSON`, resolved inside `createSupportModelAdapter`), so no new credential (CR-6); the preview never sets it.

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/question-language-transport.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/question-language/transport.ts tests/unit/question-language-transport.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API: the fast check's Anthropic transport — through the preview gate as a site cost, or the hosted support target

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The decision table (pure)

**Files:**
- Create: `apps/api/src/question-language/decide.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-decide.test.ts` (create)

**Interfaces:**
- Consumes: `EldReading`, `SITE_LANGUAGES_ELD_LACKS` (Task 2); `eldConfident`, `eldSeesMix`, `ELD_SITE_ALIASES`, `ELD_CONFUSED_SITES` (Task 3); `FastCheckReading` (Task 5); `QuestionLanguage`, `questionLanguageOf`, `lockedReplyLanguageExpectation`, `replyTextLanguageVerdict` (`@debateai/kernel`).
- Produces:
```ts
export type LockSource = "ELD_SITE" | "FAST" | "FAST_MIX_NO_OFFER" | "FALLBACK_ELD" | "FALLBACK_SITE" | "LOCAL_ELD" | "LOCAL_SITE" | "CHOICE" | "REPEAT_OFFER";
export type LanguageDecision =
  | Readonly<{ kind: "LOCK"; language: QuestionLanguage; source: LockSource }>
  | Readonly<{ kind: "OFFER"; main: QuestionLanguage; seen: readonly QuestionLanguage[]; proposed: string }>;
export const FAST_CHECK_ALWAYS_SITES: readonly string[];   // CR-2: ga, id, mt, hr + ELD_CONFUSED_SITES, sorted, no repeats
export function eldSettles(site: QuestionLanguage, eld: EldReading): boolean;
export function fallbackLock(site: QuestionLanguage, eld: EldReading, questionLine: string, local: boolean): LanguageDecision;
export function decideAfterFast(site: QuestionLanguage, eld: EldReading, fast: FastCheckReading, questionLine: string, maxQuestionBytes: number): LanguageDecision;
```

The table (spec "The flow", L1–L5):

| eld | fast AI | result |
|---|---|---|
| confident, top = site, site not in `FAST_CHECK_ALWAYS_SITES` (CR-2), and eld does NOT see a mix (L-MIX) | not called | LOCK site (`ELD_SITE`) |
| eld sees a mix (`eldSeesMix`: two confident clauses in different languages), whatever its whole-question reading | asked (it decides `is_real_mix`) | the rows below |
| a mix the clause rule misses (eld settles) | not called | LOCK site (`ELD_SITE`): today's lock, no offer (the ruling's accepted cost) |
| anything else, no paid AI (or a signed-out person, L-NOCONSENT: Task 10) | not called | LOCK eld's top (aliased) if confident (`LOCAL_ELD`), else site (`LOCAL_SITE`); never an offer |
| anything else | DOWN (timeout, transport, unreadable, unknown) | LOCK eld's top (aliased) if confident (`FALLBACK_ELD`), else site (`FALLBACK_SITE`) |
| anything else | ONE language M | LOCK M (`FAST`), even when M ≠ site (L5), no offer |
| anything else | MIX, main M, a valid rewrite | OFFER (M, languages seen, rewrite) |
| anything else | MIX but the rewrite is empty, too long, unchanged, not in M, or fewer than two languages seen | LOCK M (`FAST_MIX_NO_OFFER`), no offer |

The offer's languages are main first, then the others in the fast AI's order, each primary language once, at most six in all (pre-flight PF-L19: the contract's 409 body allows 2–6, so a seventh or a repeat must never reach it).

Implementer note (pre-flight PF-L21): every case of the owner's flow has a branch and a test: same language confident; eld unsure or disagreeing; one other language (L5); real mix; fast AI timeout / transport / unreadable / unknown; the always-ask sites; local mode; languages outside the 35; `und` and `unknown` never locked; script subtags; borrowed words (through the instruction and the clause rule); a bad, empty, unchanged or too-long proposal; `ms` read as `id` through the alias; and now "eld sees a mix" (L-MIX). REPEAT_OFFER is Task 10's; the "Edit" choice is the page's (Task 18).

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-decide.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CatalogLocaleCodeSchema } from "@debateai/contract/locale";
import { questionLanguageOf } from "@debateai/kernel";
import { FAST_CHECK_ALWAYS_SITES, decideAfterFast, eldSettles, fallbackLock } from "../../apps/api/src/question-language/decide.js";
import { ELD_CONFUSED_SITES, ELD_TUNING } from "../../apps/api/src/question-language/eld-tuning.js";
import type { EldReading } from "../../apps/api/src/question-language/eld.js";
import type { FastCheckReading } from "../../apps/api/src/question-language/fast-check.js";

const L = (code: string, name: string) => ({ code, name });
const RO = L("ro", "Romanian"), EN = L("en", "English"), ID = L("id", "Indonesian"), CA = L("ca", "Catalan"), HR = L("hr", "Croatian");
const sure = (code: string): EldReading => ({ code, reliable: true, letters: ELD_TUNING.minLetters + 40, segments: [] });
const unsure: EldReading = { code: "ro", reliable: false, letters: 12, segments: [] };
const clause = (code: string, letters = ELD_TUNING.segmentMinLetters + 5) => ({ code, reliable: true, letters });
// Pre-flight PF-L20: Task 3 may put ro or en among the always-ask sites, so the "eld settles" cases use the first site
// (alphabetically) that eld may settle, never a hard-coded one.
const SETTLING_CODE = [...CatalogLocaleCodeSchema.options].sort().find((code) => !FAST_CHECK_ALWAYS_SITES.includes(code));
const SITE = questionLanguageOf(SETTLING_CODE ?? "en")!;
const OTHER = SITE.code === "en" ? "ro" : "en";
const MAX = 8192;
const MIX_Q = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const REWRITE = "Ar trebui România să adopte euro sau să aștepte până cresc salariile?";
const mix = (proposed: string, seen = [RO, EN]): FastCheckReading => ({ kind: "MIX", main: RO, seen, proposed });

describe("the question-language decision table (question-language spec 2026-10-13)", () => {
  it("same language: eld confident and equal to the site settles it, no fast call", () => {
    expect(SETTLING_CODE, "every site always asks the fast AI: report the measured list to the controller").toBeDefined();
    expect(eldSettles(SITE, sure(SITE.code))).toBe(true);
    expect(eldSettles(SITE, sure(OTHER))).toBe(false);
    expect(eldSettles(SITE, { ...unsure, code: SITE.code })).toBe(false);
    expect(eldSettles(SITE, { code: SITE.code, reliable: true, letters: ELD_TUNING.minLetters - 1, segments: [] })).toBe(false);
  });

  it("ruling L-MIX: when eld sees a mix it never settles, even on the site language; a short, unsure or same-language clause is no mix", () => {
    const mixed: EldReading = { ...sure(SITE.code), segments: [clause(SITE.code), clause(OTHER)] };
    expect(eldSettles(SITE, mixed)).toBe(false);
    expect(eldSettles(SITE, { ...sure(SITE.code), segments: [clause(SITE.code), clause(OTHER, ELD_TUNING.segmentMinLetters - 1)] })).toBe(true);
    expect(eldSettles(SITE, { ...sure(SITE.code), segments: [clause(SITE.code), { ...clause(OTHER), reliable: false }] })).toBe(true);
    expect(eldSettles(SITE, { ...sure(SITE.code), segments: [clause(SITE.code), clause(SITE.code)] })).toBe(true);
    // The fast AI then decides: one language is locked (FAST), a real mix is offered, a DOWN check falls back to eld's whole reading.
    expect(decideAfterFast(SITE, mixed, { kind: "ONE", main: SITE }, "q", MAX)).toEqual({ kind: "LOCK", language: SITE, source: "FAST" });
    expect(decideAfterFast(SITE, mixed, { kind: "DOWN", reason: "TIMEOUT" }, "q", MAX)).toEqual({ kind: "LOCK", language: SITE, source: "FALLBACK_ELD" });
    // No paid AI: the site language, never an offer.
    expect(fallbackLock(SITE, mixed, "q", true)).toEqual({ kind: "LOCK", language: SITE, source: "LOCAL_ELD" });
  });

  it("a site language eld lacks is never settled by eld, not even through an alias", () => {
    expect(eldSettles(ID, sure("ms"))).toBe(false);
    expect(eldSettles(ID, sure("id"))).toBe(false);
  });

  it("CR-2: the always-ask sites are ga, id, mt, hr and every measured confused site; eld never settles them", () => {
    expect(FAST_CHECK_ALWAYS_SITES).toEqual([...new Set(["ga", "hr", "id", "mt", ...ELD_CONFUSED_SITES])].sort());
    expect(eldSettles(HR, sure("hr"))).toBe(false);
    for (const site of FAST_CHECK_ALWAYS_SITES) expect(eldSettles(L(site, site), sure(site)), site).toBe(false);
  });

  it("another language wholly (L5): the fast AI's one language is locked, no offer", () => {
    expect(decideAfterFast(RO, sure("en"), { kind: "ONE", main: EN }, "Should Romania adopt the euro before 2030?", MAX))
      .toEqual({ kind: "LOCK", language: EN, source: "FAST" });
  });

  it("a real mix: an offer with the rewrite in the main language", () => {
    expect(decideAfterFast(RO, unsure, mix(REWRITE), MIX_Q, MAX)).toEqual({ kind: "OFFER", main: RO, seen: [RO, EN], proposed: REWRITE });
  });

  it("PF-L19: the offer names main first, each language once, at most six", () => {
    const named = ["en", "fr", "de", "es", "it", "pt"].map((code) => questionLanguageOf(code)!);
    const decision = decideAfterFast(RO, unsure, mix(REWRITE, [...named, EN, RO]), MIX_Q, MAX);
    expect(decision.kind).toBe("OFFER");
    expect(decision.kind === "OFFER" ? decision.seen.map((language) => language.code) : []).toEqual(["ro", "en", "fr", "de", "es", "it"]);
  });

  it("borrowed words only: the fast AI says one language, locked, no offer", () => {
    expect(decideAfterFast(RO, unsure, { kind: "ONE", main: RO }, "Merită să lucrez la un startup de AI în loc de o corporație?", MAX))
      .toEqual({ kind: "LOCK", language: RO, source: "FAST" });
  });

  it.each([
    ["an empty rewrite", mix(" ")],
    ["a rewrite equal to the question", mix(MIX_Q)],
    ["a rewrite too long", mix("a".repeat(MAX + 1))],
    ["a rewrite not in the main language", mix("Should Romania adopt the euro or wait until wages catch up with the rest of Europe?")],
    ["one language seen", mix(REWRITE, [RO])]
  ])("a mix with %s locks the main language and offers nothing", (_name, fast) => {
    expect(decideAfterFast(RO, unsure, fast, MIX_Q, MAX)).toEqual({ kind: "LOCK", language: RO, source: "FAST_MIX_NO_OFFER" });
  });

  it("eld unsure and the fast AI down: the site language, never a block", () => {
    for (const reason of ["TIMEOUT", "TRANSPORT", "UNREADABLE", "UNKNOWN_LANGUAGE"] as const) {
      expect(decideAfterFast(RO, unsure, { kind: "DOWN", reason }, MIX_Q, MAX)).toEqual({ kind: "LOCK", language: RO, source: "FALLBACK_SITE" });
    }
  });

  it("eld confident on another language and the fast AI down: eld's language", () => {
    expect(decideAfterFast(RO, sure("en"), { kind: "DOWN", reason: "TIMEOUT" }, "Should Romania adopt the euro before 2030?", MAX))
      .toEqual({ kind: "LOCK", language: EN, source: "FALLBACK_ELD" });
    expect(decideAfterFast(RO, sure("ca"), { kind: "DOWN", reason: "TIMEOUT" }, "Hauria Barcelona de limitar els pisos turístics?", MAX))
      .toEqual({ kind: "LOCK", language: CA, source: "FALLBACK_ELD" });
  });

  it("a language eld lacks with the fast AI down: eld's near neighbour reads as the site", () => {
    expect(decideAfterFast(ID, sure("ms"), { kind: "DOWN", reason: "TIMEOUT" }, "Apakah Indonesia harus menaikkan pajak karbon tahun depan?", MAX))
      .toEqual({ kind: "LOCK", language: ID, source: "FALLBACK_ELD" });
  });

  it("local mode (no paid AI): eld or the site language, never an offer", () => {
    expect(fallbackLock(RO, unsure, MIX_Q, true)).toEqual({ kind: "LOCK", language: RO, source: "LOCAL_SITE" });
    expect(fallbackLock(RO, sure("en"), "Should Romania adopt the euro before 2030?", true)).toEqual({ kind: "LOCK", language: EN, source: "LOCAL_ELD" });
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-decide.test.ts`

- [ ] **Step 3: Implement** `apps/api/src/question-language/decide.ts`:

```ts
import { lockedReplyLanguageExpectation, questionLanguageOf, replyTextLanguageVerdict, type QuestionLanguage } from "@debateai/kernel";
import { SITE_LANGUAGES_ELD_LACKS, type EldReading } from "./eld.js";
import { ELD_CONFUSED_SITES, ELD_SITE_ALIASES, eldConfident, eldSeesMix } from "./eld-tuning.js";
import type { FastCheckReading } from "./fast-check.js";

/**
 * The question-language decision (question-language spec 2026-10-13, rulings L1–L5), pure. It never blocks: every
 * path ends in a lock, except a valid real-mix offer, which the person answers.
 */
export type LockSource = "ELD_SITE" | "FAST" | "FAST_MIX_NO_OFFER" | "FALLBACK_ELD" | "FALLBACK_SITE" | "LOCAL_ELD" | "LOCAL_SITE" | "CHOICE" | "REPEAT_OFFER";
export type LanguageDecision =
  | Readonly<{ kind: "LOCK"; language: QuestionLanguage; source: LockSource }>
  | Readonly<{ kind: "OFFER"; main: QuestionLanguage; seen: readonly QuestionLanguage[]; proposed: string }>;

/**
 * Ruling CR-2: the sites where eld may be confidently wrong about a near neighbour, so the fast AI always checks even
 * when eld names the site language: the three eld lacks (ga, id, mt), Croatian (Serbian and Bosnian in Latin script
 * read as Croatian), and every site Task 3 measured with a confident cross-locale confusion (ELD_CONFUSED_SITES).
 * Each extra check costs about $0.00005. The fallback (fast AI down) still uses eld: never block.
 */
export const FAST_CHECK_ALWAYS_SITES: readonly string[] = Object.freeze(
  [...new Set([...SITE_LANGUAGES_ELD_LACKS, "hr", ...ELD_CONFUSED_SITES])].sort());

const lock = (language: QuestionLanguage, source: LockSource): LanguageDecision => Object.freeze({ kind: "LOCK", language, source });
const primary = (code: string): string => code.split("-")[0]!.toLowerCase();

/**
 * L1/L2: eld settles a question only when it is confident AND names the site language, outside the always-ask sites
 * (CR-2), and only when it does not see a mix (ruling L-MIX: two confident clauses in different languages send the
 * question to the fast AI, which decides is_real_mix).
 */
export function eldSettles(site: QuestionLanguage, eld: EldReading): boolean {
  return eldConfident(eld) && !FAST_CHECK_ALWAYS_SITES.includes(primary(site.code)) && eld.code === primary(site.code)
    && !eldSeesMix(eld);
}

/** eld's language for a fallback: an alias of a site language eld lacks reads as that site language. */
function eldLanguage(site: QuestionLanguage, eld: EldReading, questionLine: string): QuestionLanguage | null {
  if (!eldConfident(eld)) return null;
  if ((ELD_SITE_ALIASES[primary(site.code)] ?? []).includes(eld.code!)) return site;
  return questionLanguageOf(eld.code!, questionLine);
}

/** Fast AI down (local = false) or no paid AI (local = true): eld's top when confident, else the site language. */
export function fallbackLock(site: QuestionLanguage, eld: EldReading, questionLine: string, local: boolean): LanguageDecision {
  const fromEld = eldLanguage(site, eld, questionLine);
  return fromEld === null ? lock(site, local ? "LOCAL_SITE" : "FALLBACK_SITE") : lock(fromEld, local ? "LOCAL_ELD" : "FALLBACK_ELD");
}

export function decideAfterFast(
  site: QuestionLanguage, eld: EldReading, fast: FastCheckReading, questionLine: string, maxQuestionBytes: number
): LanguageDecision {
  switch (fast.kind) {
    case "DOWN": return fallbackLock(site, eld, questionLine, false);
    case "ONE": return lock(fast.main, "FAST");
    case "MIX": {
      const proposed = fast.proposed.trim();
      // PF-L19: each primary language once, main excluded here (it goes first), in the fast AI's order.
      const others = fast.seen.filter((language, index) => primary(language.code) !== primary(fast.main.code)
        && fast.seen.findIndex((earlier) => primary(earlier.code) === primary(language.code)) === index);
      const usable = proposed !== ""
        && proposed !== questionLine.trim()
        && Buffer.byteLength(proposed, "utf8") <= maxQuestionBytes
        && others.length > 0
        && replyTextLanguageVerdict(lockedReplyLanguageExpectation(fast.main, questionLine), proposed) !== "OTHER";
      if (!usable) return lock(fast.main, "FAST_MIX_NO_OFFER");
      const seen = [fast.main, ...others].slice(0, 6);   // the 409 body allows 2..6 (Task 9)
      return Object.freeze({ kind: "OFFER", main: fast.main, seen: Object.freeze(seen), proposed });
    }
    default: return exhaustive(fast);
  }
}
```

Import `exhaustive` from `@debateai/kernel`. Add the file to the manifest.

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/question-language-decide.test.ts`

If "a rewrite not in the main language" does not come back `OTHER` from the reply verdict, lengthen that English sentence in the test, keeping it plain English, until `replyTextLanguageVerdict({tag:"ro",script:"Latin"}, text)` says `OTHER`. Do not weaken the rule.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/question-language/decide.ts tests/unit/question-language-decide.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API: the question-language decision table — eld settles the site language, the fast AI the rest, never a block

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The check reference — signed, short-lived, bound to the question, the rewrite and the person

**Files:**
- Create: `apps/api/src/question-language/reference.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-reference.test.ts` (create)

**Interfaces:**
- Produces:
```ts
export type QuestionLanguageReferenceKey = Readonly<{ bytes: Buffer }>;
export function questionLanguageReferenceKeyFrom(root: Uint8Array): QuestionLanguageReferenceKey; // CR-5: HKDF from the blind-index key, shared by every API process
export function newQuestionLanguageReferenceKey(): QuestionLanguageReferenceKey;            // 32 random bytes: the practice tool and tests only
export function signQuestionLanguageReference(key: QuestionLanguageReferenceKey, input: Readonly<{
  ownerScope: string; site: string; questionLine: string; proposed: string; main: string; now: Date }>): string;
export type QuestionLanguageChoice = Readonly<{ check_ref: string; choice: "USE_REWRITE" | "KEEP_MINE"; original_question_line?: string }>;
export type VerifiedChoice = Readonly<{ main: string; site: string; rewriteAccepted: boolean; originalQuestionLine: string | null }>;
export function verifyQuestionLanguageChoice(key: QuestionLanguageReferenceKey, input: Readonly<{
  ownerScope: string; questionLine: string; choice: QuestionLanguageChoice; now: Date }>): VerifiedChoice;
// refusals: TypedDomainError QUESTION_LANGUAGE_CHECK_INVALID | QUESTION_LANGUAGE_CHECK_EXPIRED | QUESTION_LANGUAGE_CHOICE_MISMATCH
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-reference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  newQuestionLanguageReferenceKey, questionLanguageReferenceKeyFrom, signQuestionLanguageReference, verifyQuestionLanguageChoice
} from "../../apps/api/src/question-language/reference.js";

const key = newQuestionLanguageReferenceKey();
const NOW = new Date("2026-10-13T10:00:00.000Z");
const ORIGINAL = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const REWRITE = "Ar trebui România să adopte euro sau să aștepte până cresc salariile?";
const ref = signQuestionLanguageReference(key, { ownerScope: "owner:a", site: "ro", questionLine: ORIGINAL, proposed: REWRITE, main: "ro", now: NOW });
const verify = (over: Partial<{ ownerScope: string; questionLine: string; choice: any; now: Date }>, k = key) =>
  verifyQuestionLanguageChoice(k, { ownerScope: "owner:a", questionLine: REWRITE, now: NOW,
    choice: { check_ref: ref, choice: "USE_REWRITE", original_question_line: ORIGINAL }, ...over });

describe("the check reference (question-language spec 2026-10-13: the server decides)", () => {
  it("accepts the server's own rewrite and the person's own wording, locking the checked language", () => {
    expect(verify({})).toEqual({ main: "ro", site: "ro", rewriteAccepted: true, originalQuestionLine: ORIGINAL });
    expect(verify({ questionLine: ORIGINAL, choice: { check_ref: ref, choice: "KEEP_MINE" } }))
      .toEqual({ main: "ro", site: "ro", rewriteAccepted: false, originalQuestionLine: null });
    expect(verify({ now: new Date(NOW.getTime() + 14 * 60_000) }).main).toBe("ro");
  });

  it.each([
    ["a rewrite the page made up", { questionLine: "Ar trebui România să adopte euro?" }, "QUESTION_LANGUAGE_CHOICE_MISMATCH"],
    ["the reference reused for another question", { questionLine: "Altă întrebare?", choice: { check_ref: ref, choice: "KEEP_MINE" } }, "QUESTION_LANGUAGE_CHOICE_MISMATCH"],
    ["a rewrite with another original", { choice: { check_ref: ref, choice: "USE_REWRITE", original_question_line: "x" } }, "QUESTION_LANGUAGE_CHOICE_MISMATCH"],
    ["a rewrite with no original", { choice: { check_ref: ref, choice: "USE_REWRITE" } }, "QUESTION_LANGUAGE_CHOICE_MISMATCH"],
    ["another person's reference", { ownerScope: "owner:b" }, "QUESTION_LANGUAGE_CHECK_INVALID"],
    ["an expired reference", { now: new Date(NOW.getTime() + 15 * 60_000 + 1) }, "QUESTION_LANGUAGE_CHECK_EXPIRED"],
    ["garbage", { choice: { check_ref: "abc", choice: "KEEP_MINE" } }, "QUESTION_LANGUAGE_CHECK_INVALID"]
  ])("refuses %s", (_name, over, code) => {
    expect(() => verify(over as never)).toThrow(code);
  });

  it("refuses a made-up language: an edited payload fails the signature", () => {
    const [payload, mac] = ref.split(".");
    const edited = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    edited.m = "en";
    const forged = `${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${mac!}`;
    expect(() => verify({ choice: { check_ref: forged, choice: "USE_REWRITE", original_question_line: ORIGINAL } })).toThrow("QUESTION_LANGUAGE_CHECK_INVALID");
  });

  it("a reference signed with another key is invalid, so the page checks again", () => {
    expect(() => verify({}, newQuestionLanguageReferenceKey())).toThrow("QUESTION_LANGUAGE_CHECK_INVALID");
  });

  it("CR-5: two API processes of one deployment derive the same key from the same root, and verify each other", () => {
    const root = Buffer.alloc(32, 9);
    const first = questionLanguageReferenceKeyFrom(root);
    const second = questionLanguageReferenceKeyFrom(Buffer.from(root));
    const shared = signQuestionLanguageReference(first, { ownerScope: "owner:a", site: "ro", questionLine: ORIGINAL, proposed: REWRITE, main: "ro", now: NOW });
    expect(verifyQuestionLanguageChoice(second, { ownerScope: "owner:a", questionLine: REWRITE, now: NOW,
      choice: { check_ref: shared, choice: "USE_REWRITE", original_question_line: ORIGINAL } }).main).toBe("ro");
    expect(first.bytes.equals(root)).toBe(false);
    expect(questionLanguageReferenceKeyFrom(Buffer.alloc(32, 8)).bytes.equals(first.bytes)).toBe(false);
    expect(() => questionLanguageReferenceKeyFrom(Buffer.alloc(16, 9))).toThrow("QUESTION_LANGUAGE_REFERENCE_ROOT_INVALID");
  });

  it("carries hashes and codes only, never question text", () => {
    const payload = Buffer.from(ref.split(".")[0]!, "base64url").toString("utf8");
    expect(payload).not.toContain("România");
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual(["e", "m", "o", "p", "q", "s", "v"]);
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-reference.test.ts`

- [ ] **Step 3: Implement** `apps/api/src/question-language/reference.ts`:

```ts
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";

/**
 * The check reference (question-language spec 2026-10-13, "The server decides"; plan decision D2). It is a stateless
 * signed token. It binds the person, the question, the server's own rewrite and the checked language. It never
 * carries a language or text the page could choose. Ruling CR-5: the API's key is derived from its existing
 * blind-index key, so every API process of one deployment shares it and a restart keeps references valid.
 */
export type QuestionLanguageReferenceKey = Readonly<{ bytes: Buffer }>;
export type QuestionLanguageChoice = Readonly<{ check_ref: string; choice: "USE_REWRITE" | "KEEP_MINE"; original_question_line?: string }>;
export type VerifiedChoice = Readonly<{ main: string; site: string; rewriteAccepted: boolean; originalQuestionLine: string | null }>;

type Payload = Readonly<{ v: 1; o: string; s: string; q: string; p: string; m: string; e: number }>;

const sha = (text: string): string => createHash("sha256").update(text.trim(), "utf8").digest("hex");
const ownerOf = (scope: string): string => sha(`question-language-owner:${scope}`).slice(0, 32);
const lifetimeMs = (): number => 15 * 60_000;
const refuse = (code: "QUESTION_LANGUAGE_CHECK_INVALID" | "QUESTION_LANGUAGE_CHECK_EXPIRED" | "QUESTION_LANGUAGE_CHOICE_MISMATCH"): never => {
  throw new TypedDomainError(code, code);
};
const mac = (key: QuestionLanguageReferenceKey, payloadPart: string): Buffer =>
  createHmac("sha256", key.bytes).update(`debateai:question-language-ref:v1\0${payloadPart}`, "utf8").digest();

/**
 * CR-5: HKDF-SHA-256 over a server secret the API already loads (the blind-index key, as SocialAuthService derives its
 * flow key), with this purpose's own salt and label, so the root is never itself the HMAC key and no other purpose's
 * key equals this one.
 */
export function questionLanguageReferenceKeyFrom(root: Uint8Array): QuestionLanguageReferenceKey {
  if (root.byteLength < 32) throw new TypedDomainError("QUESTION_LANGUAGE_REFERENCE_ROOT_INVALID", "QUESTION_LANGUAGE_REFERENCE_ROOT_INVALID");
  return Object.freeze({ bytes: Buffer.from(hkdfSync("sha256", root, Buffer.from("debateai:question-language:v1"),
    Buffer.from("question-language-check-v1"), 32)) });
}

/** A per-process key: the practice tool (one process) and tests only. */
export function newQuestionLanguageReferenceKey(): QuestionLanguageReferenceKey {
  return Object.freeze({ bytes: randomBytes(32) });
}

export function signQuestionLanguageReference(key: QuestionLanguageReferenceKey, input: Readonly<{
  ownerScope: string; site: string; questionLine: string; proposed: string; main: string; now: Date;
}>): string {
  const payload: Payload = { v: 1, o: ownerOf(input.ownerScope), s: input.site, q: sha(input.questionLine), p: sha(input.proposed),
    m: input.main, e: input.now.getTime() + lifetimeMs() };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadPart}.${mac(key, payloadPart).toString("base64url")}`;
}

function payloadOf(key: QuestionLanguageReferenceKey, ref: string): Payload {
  const parts = ref.split(".");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
  const given = Buffer.from(parts[1]!, "base64url");
  const wanted = mac(key, parts[0]!);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
  try {
    const value = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")) as Payload;
    if (value.v !== 1 || typeof value.m !== "string" || typeof value.e !== "number") return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
    return value;
  } catch {
    return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
  }
}

export function verifyQuestionLanguageChoice(key: QuestionLanguageReferenceKey, input: Readonly<{
  ownerScope: string; questionLine: string; choice: QuestionLanguageChoice; now: Date;
}>): VerifiedChoice {
  const payload = payloadOf(key, input.choice.check_ref);
  if (payload.o !== ownerOf(input.ownerScope)) return refuse("QUESTION_LANGUAGE_CHECK_INVALID");
  if (input.now.getTime() > payload.e) return refuse("QUESTION_LANGUAGE_CHECK_EXPIRED");
  if (input.choice.choice === "KEEP_MINE") {
    if (sha(input.questionLine) !== payload.q) return refuse("QUESTION_LANGUAGE_CHOICE_MISMATCH");
    return Object.freeze({ main: payload.m, site: payload.s, rewriteAccepted: false, originalQuestionLine: null });
  }
  const original = input.choice.original_question_line;
  if (original === undefined || sha(original) !== payload.q || sha(input.questionLine) !== payload.p) {
    return refuse("QUESTION_LANGUAGE_CHOICE_MISMATCH");
  }
  return Object.freeze({ main: payload.m, site: payload.s, rewriteAccepted: true, originalQuestionLine: original.trim() });
}
```

Add the file to the manifest.

Implementer note (pre-flight PF-L22): this task was found READY. The HKDF salt and info differ from social-auth's; the MAC is compared with `timingSafeEqual` after a length check; the payload keys are `v,o,s,q,p,m,e` (D2); each refusal's message equals its code, so `toThrow(code)` matches. The owner scope comes from `ownerScopeOf(principal)` (Task 10): for a server principal it is `owner:<ownerRef>`, the same string as `session.asker_id` inside `submit` (`apps/api/src/index.ts` ~4618–4628); the route's bare `ownerRef ?? asker_id` (~3500) has no prefix, so never pass that.

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/question-language-reference.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/question-language/reference.ts tests/unit/question-language-reference.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API: the question-language check reference — key derived from the blind-index key, signed, fifteen minutes, bound to the person, the question and the server's rewrite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Contract — the site language, the person's choice and the offer

**Files:**
- Modify: `packages/contract/src/index.ts` (`AskRequestSchema`, about lines 213–226 today; new schemas next to `AskAlreadyWaitingSchema`), `packages/contract/src/client.ts` (`submitAskOrLanguageChoice` beside `submitAsk`, in the `ContractClient` interface, and two names added to its `./index.js` import block)
- Test: `tests/unit/question-language-contract.test.ts` (create)

**Interfaces:**
- Produces:
```ts
export const SITE_LANGUAGE_CODES = CatalogLocaleCodeSchema.options;   // the 35, never a third copy (PF-L25)
export const SiteLanguageSchema = CatalogLocaleCodeSchema;
export const QuestionLanguageChoiceSchema;   // { check_ref, choice: "USE_REWRITE" | "KEEP_MINE", original_question_line? }, strict
// AskRequestSchema gains: site_language?: SiteLanguage; question_language_choice?: QuestionLanguageChoice
export const QUESTION_LANGUAGE_CHOICE_NEEDED: "QUESTION_LANGUAGE_CHOICE_NEEDED";
export const QuestionLanguageOfferSchema;    // { check_ref, main_language: {code,name}, languages_seen: {code,name}[] (2..6), proposed_question }
export const QuestionLanguageChoiceNeededSchema; // { error, message, offer }
export type AskSubmitOutcome = Readonly<{ kind: "ACCEPTED"; accepted: AskAccepted }> | Readonly<{ kind: "LANGUAGE_CHOICE_NEEDED"; offer: QuestionLanguageOffer }>;
// client: submitAskOrLanguageChoice(input: AskRequest): Promise<AskSubmitOutcome>
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-contract.test.ts`:

```ts
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AskRequestSchema, QUESTION_LANGUAGE_CHOICE_NEEDED, QuestionLanguageChoiceNeededSchema, SITE_LANGUAGE_CODES, createContractClient
} from "@debateai/contract";

const SITE_LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const ASK = { question_line: "q", risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:test",
  composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "s", as_of: "2026-10-13T00:00:00.000Z",
  steering_presets: [], plan_tier: "free", steering_annotations: [] };
const OFFER = { check_ref: "a.b", main_language: { code: "ro", name: "Romanian" },
  languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed_question: "Q în română?" };

describe("the ask's question-language fields (question-language spec 2026-10-13)", () => {
  it("the site language is one of the 35 site locales", () => {
    expect([...SITE_LANGUAGE_CODES].sort()).toEqual(SITE_LOCALES);
    expect(AskRequestSchema.safeParse({ ...ASK, site_language: "ro" }).success).toBe(true);
    expect(AskRequestSchema.safeParse({ ...ASK, site_language: "en-US" }).success).toBe(false);
    expect(AskRequestSchema.safeParse(ASK).success).toBe(true);
  });

  it("the choice names a reference and a choice, never a language or a rewrite of its own", () => {
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE" } }).success).toBe(true);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "a.b", choice: "USE_REWRITE", original_question_line: "o" } }).success).toBe(true);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE", language: "en" } }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "a.b", choice: "EDIT" } }).success).toBe(false);
    expect(AskRequestSchema.safeParse({ ...ASK, question_language_choice: { check_ref: "", choice: "KEEP_MINE" } }).success).toBe(false);
  });

  it("the 409 offer body is strict", () => {
    expect(QuestionLanguageChoiceNeededSchema.parse({ error: QUESTION_LANGUAGE_CHOICE_NEEDED, message: QUESTION_LANGUAGE_CHOICE_NEEDED, offer: OFFER }).offer).toEqual(OFFER);
    expect(QuestionLanguageChoiceNeededSchema.safeParse({ error: QUESTION_LANGUAGE_CHOICE_NEEDED, message: QUESTION_LANGUAGE_CHOICE_NEEDED,
      offer: { ...OFFER, languages_seen: [OFFER.main_language] } }).success).toBe(false);
  });

  it("the client returns the offer as data on 409, and the accepted ask otherwise", async () => {
    // The real signature (pre-flight PF-L24): createContractClient(baseUrl, fetchImplementation = fetch, auth = { mode: "cookie" }).
    const answering = (status: number, body: unknown) => createContractClient("https://api.test",
      (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch);
    expect(await answering(409, { error: QUESTION_LANGUAGE_CHOICE_NEEDED, message: QUESTION_LANGUAGE_CHOICE_NEEDED, offer: OFFER })
      .submitAskOrLanguageChoice(ASK as never)).toEqual({ kind: "LANGUAGE_CHOICE_NEEDED", offer: OFFER });
    expect(await answering(202, { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" }).submitAskOrLanguageChoice(ASK as never))
      .toMatchObject({ kind: "ACCEPTED", accepted: { status: "QUEUED" } });
    await expect(answering(409, { error: "QUESTION_LANGUAGE_CHECK_EXPIRED", message: "QUESTION_LANGUAGE_CHECK_EXPIRED" })
      .submitAskOrLanguageChoice(ASK as never)).rejects.toMatchObject({ status: 409, code: "SERVER_FAILURE", serverCode: "QUESTION_LANGUAGE_CHECK_EXPIRED" });
  });
});
```

A 409 the client does not recover becomes `ContractHttpError` with `.status` 409, `.code` `"SERVER_FAILURE"` (`codeForStatus`, `client.ts` ~142–150) and `.serverCode` the body's `error`; Task 18 branches on `serverCode`, never on `code` (pre-flight PF-L24).

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-contract.test.ts`

- [ ] **Step 3: Implement.** In `packages/contract/src/index.ts`, above `AskRequestSchema` (import `CatalogLocaleCodeSchema` from `./locale.js`, which already holds exactly the 35 and which `registration.ts` uses; pre-flight PF-L25):

```ts
/** The 35 site locales (apps/ui/messages/<locale>): the language the person's page is in (question-language spec 2026-10-13, L1). */
export const SiteLanguageSchema = CatalogLocaleCodeSchema;
export const SITE_LANGUAGE_CODES = CatalogLocaleCodeSchema.options;
export type SiteLanguage = z.infer<typeof SiteLanguageSchema>;
/** The person's answer to a real-mix offer: a reference the server signed and a choice; never a language or text of its own. */
export const QuestionLanguageChoiceSchema = z.object({
  check_ref: z.string().min(3).max(4096).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u),
  choice: z.enum(["USE_REWRITE", "KEEP_MINE"]),
  original_question_line: z.string().trim().min(1).max(8192).optional()
}).strict();
export type QuestionLanguageChoice = z.infer<typeof QuestionLanguageChoiceSchema>;
```

Add the two optional members at the end of `AskRequestSchema`'s object, before `}).strict()`:

```ts
  // Question language (spec 2026-10-13): read only when the debate shape row is present; ignored otherwise.
  site_language: SiteLanguageSchema.optional(),
  question_language_choice: QuestionLanguageChoiceSchema.optional()
```

Next to `AskAlreadyWaitingSchema`:

```ts
export const QUESTION_LANGUAGE_CHOICE_NEEDED = "QUESTION_LANGUAGE_CHOICE_NEEDED" as const;
const NamedLanguageSchema = z.object({ code: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u), name: z.string().min(1).max(64) }).strict();
export const QuestionLanguageOfferSchema = z.object({
  check_ref: z.string().min(3).max(4096),
  main_language: NamedLanguageSchema,
  languages_seen: z.array(NamedLanguageSchema).min(2).max(6),
  proposed_question: z.string().min(1)
}).strict();
export type QuestionLanguageOffer = z.infer<typeof QuestionLanguageOfferSchema>;
export const QuestionLanguageChoiceNeededSchema = z.object({
  error: z.literal(QUESTION_LANGUAGE_CHOICE_NEEDED),
  message: z.literal(QUESTION_LANGUAGE_CHOICE_NEEDED),
  offer: QuestionLanguageOfferSchema
}).strict();
export type AskSubmitOutcome =
  | Readonly<{ kind: "ACCEPTED"; accepted: AskAccepted }>
  | Readonly<{ kind: "LANGUAGE_CHOICE_NEEDED"; offer: QuestionLanguageOffer }>;
```

In `packages/contract/src/client.ts`, beside `submitAsk`, add the method. The local `request(path, schema, init, expectedStatus)` takes four parameters and has NO `recover` (`client.ts` ~524–529), so call `requestJson` directly with its `recover(status, body)` argument, exactly as `startBillingCheckout` does (`client.ts` ~820–826; pre-flight PF-L23):

```ts
    submitAskOrLanguageChoice: (input: AskRequest) => requestJson<AskSubmitOutcome>(
      root.href, fetchImplementation, "/v1/asks",
      AskAcceptedSchema.transform((accepted): AskSubmitOutcome => ({ kind: "ACCEPTED", accepted })),
      { method: "POST", body: JSON.stringify(input) }, auth, undefined,
      (status, body) => {
        if (status !== 409) return null;
        const parsed = QuestionLanguageChoiceNeededSchema.safeParse(body);
        return parsed.success ? Object.freeze({ kind: "LANGUAGE_CHOICE_NEEDED" as const, offer: parsed.data.offer }) : null;
      }
    ),
```

Add `QuestionLanguageChoiceNeededSchema` and `type AskSubmitOutcome` to `client.ts`'s import block from `./index.js` (lines ~13–137).

Add `submitAskOrLanguageChoice(input: AskRequest): Promise<AskSubmitOutcome>;` to the client interface, next to `submitAsk`. Then find every hand-written fake client that must satisfy the interface: `grep -rln "submitAsk:" tests apps tools`. Add `submitAskOrLanguageChoice: async () => { throw new Error("not used"); }` to each fake that is typed as the full interface. Then run `pnpm run generate:contract` (gitignored output).

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-contract.test.ts`
- `pnpm exec vitest run tests/unit/debate-shape-contract.test.ts`
- `pnpm exec vitest run tests/unit/b10-request-failure.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/contract/src/index.ts packages/contract/src/client.ts tests/unit/question-language-contract.test.ts
git commit -m "Contract: site_language and question_language_choice on the ask, the strict 409 offer, submitAskOrLanguageChoice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Also `git add` any fake client file this task touched, by name.

---
### Task 10: The decider — one call that turns an ask into a lock (or an offer)

**Files:**
- Create: `apps/api/src/question-language/decider.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-decider.test.ts` (create)

**Interfaces:**
- Consumes: Tasks 2, 3, 5, 7, 8; `AskRequest`, `QuestionLanguageOffer`, `QuestionLanguageOfferSchema` (Task 9); `detectArgumentLanguage`, `questionLanguageOf`, `TypedDomainError` (`@debateai/kernel`).
- Produces:
```ts
export type QuestionLanguageTrace = Readonly<{
  eld: Readonly<{ code: string | null; reliable: boolean; confident: boolean }> | null;
  fast: Readonly<{ outcome: "ONE" | "MIX" | "DOWN"; reason: string | null; main: string | null }> | null;
  contractHash: string | null }>;
export type QuestionLanguageLock = Readonly<{ language: QuestionLanguage; source: LockSource; siteLanguage: string;
  rewriteAccepted: boolean; originalQuestionLine: string | null; trace: QuestionLanguageTrace }>;
export class QuestionLanguageChoiceNeeded extends Error { readonly offer: QuestionLanguageOffer; readonly trace: QuestionLanguageTrace }
// fastCheckAllowed (ruling L-NOCONSENT): false for a signed-out (legacy) person, who has no recorded consent — eld and the
// site language decide, no fast call, no offer.
export type QuestionLanguagePort = Readonly<{ decide(input: Readonly<{ ask: AskRequest; ownerScope: string; fastCheckAllowed: boolean }>): Promise<QuestionLanguageLock> }>;
export class QuestionLanguageDecider implements QuestionLanguagePort {
  constructor(deps: Readonly<{ eld: EldReader; fastCheck: FastCheck | null; key: QuestionLanguageReferenceKey;
    clock: () => Date; maxQuestionBytes: number; onDecided?: (lock: QuestionLanguageLock | QuestionLanguageChoiceNeeded) => void }>);
}
export function ownerScopeOf(principal: Readonly<{ kind: "server"; ownerRef: string } | { kind: "legacy"; legacyAskerId: string }>): string;
export function runLanguageOf(lock: QuestionLanguageLock | null, questionLine: string): Readonly<{ tag: string; nameEn: string }>;
export function questionLanguageAskContractMember(lock: QuestionLanguageLock | null): Readonly<Record<string, unknown>>;
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-decider.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { detectArgumentLanguage, TypedDomainError } from "@debateai/kernel";
import type { AskRequest } from "@debateai/contract";
import {
  QuestionLanguageChoiceNeeded, QuestionLanguageDecider, questionLanguageAskContractMember, runLanguageOf
} from "../../apps/api/src/question-language/decider.js";
import type { EldReader, EldReading } from "../../apps/api/src/question-language/eld.js";
import { ELD_TUNING } from "../../apps/api/src/question-language/eld-tuning.js";
import type { FastCheck, FastCheckReading } from "../../apps/api/src/question-language/fast-check.js";
import { FAST_CHECK_ALWAYS_SITES } from "../../apps/api/src/question-language/decide.js";
import { newQuestionLanguageReferenceKey } from "../../apps/api/src/question-language/reference.js";
import { SITE_LANGUAGE_CODES } from "@debateai/contract";

const NOW = new Date("2026-10-13T10:00:00.000Z");
const MIX_Q = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const REWRITE = "Ar trebui România să adopte euro sau să aștepte până cresc salariile?";
const askOf = (question_line: string, extra: Partial<AskRequest> = {}) => ({ question_line, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "s",
  as_of: "2026-10-13T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [], ...extra }) as AskRequest;
const eldSaying = (reading: EldReading): EldReader => ({ read: () => reading, languages: () => [] });
const fastSaying = (reading: FastCheckReading) => {
  const read = vi.fn(async () => reading);
  return { check: { contractHash: "c".repeat(64), read } as FastCheck, read };
};
const sure = (code: string): EldReading => ({ code, reliable: true, letters: ELD_TUNING.minLetters + 40, segments: [] });
// Pre-flight PF-L20: the "eld settles" case uses a site eld may settle (Task 3 may make ro or en always-ask).
const SETTLING = [...SITE_LANGUAGE_CODES].sort().find((code) => !FAST_CHECK_ALWAYS_SITES.includes(code))!;
const deciderWith = (eld: EldReader, fastCheck: FastCheck | null, key = newQuestionLanguageReferenceKey()) =>
  new QuestionLanguageDecider({ eld, fastCheck, key, clock: () => NOW, maxQuestionBytes: 8192 });

describe("the question-language decider (question-language spec 2026-10-13)", () => {
  it("eld settles the site language: locked with no fast call", async () => {
    const fast = fastSaying({ kind: "ONE", main: { code: "en", name: "English" } });
    const lock = await deciderWith(eldSaying(sure(SETTLING)), fast.check).decide({ ask: askOf("A question in the site's language?",
      { site_language: SETTLING as never }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(lock).toMatchObject({ language: { code: SETTLING }, source: "ELD_SITE", siteLanguage: SETTLING, rewriteAccepted: false,
      originalQuestionLine: null, trace: { eld: { code: SETTLING, reliable: true, confident: true }, fast: null, contractHash: null } });
    expect(fast.read).not.toHaveBeenCalled();
  });

  it("no site language sent (an older client): English is the proposal", async () => {
    const lock = await deciderWith(eldSaying(sure("en")), null).decide({ ask: askOf("Should cities price congestion?"), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(lock).toMatchObject({ language: { code: "en" }, siteLanguage: "en",
      source: FAST_CHECK_ALWAYS_SITES.includes("en") ? "LOCAL_ELD" : "ELD_SITE" });
  });

  it("ruling L-NOCONSENT: a signed-out person never reaches the fast AI — eld or the site language, never an offer", async () => {
    const fast = fastSaying({ kind: "MIX", main: { code: "ro", name: "Romanian" }, seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed: REWRITE });
    const lock = await deciderWith(eldSaying({ code: "ro", reliable: false, letters: 30, segments: [] }), fast.check)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "legacy:asker-1", fastCheckAllowed: false });
    expect(lock).toMatchObject({ language: { code: "ro" }, source: "LOCAL_SITE", trace: { fast: null } });
    expect(fast.read).not.toHaveBeenCalled();
  });

  it("PF-L19: an offer the contract would refuse is never sent; the main language is locked instead", async () => {
    // A name longer than the 409 body's 64 characters: the decision table offers, the contract would refuse the body.
    const long = { code: "ro", name: "R".repeat(65) };
    const fast = fastSaying({ kind: "MIX", main: long, seen: [long, { code: "en", name: "English" }], proposed: REWRITE });
    const lock = await deciderWith(eldSaying({ code: "ro", reliable: false, letters: 30, segments: [] }), fast.check)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true }).catch((error: unknown) => error);
    expect(lock).toMatchObject({ language: { code: "ro" }, source: "FAST_MIX_NO_OFFER" });
  });

  it("a real mix: an offer whose reference the same person can answer with the server's rewrite", async () => {
    const key = newQuestionLanguageReferenceKey();
    const fast = fastSaying({ kind: "MIX", main: { code: "ro", name: "Romanian" }, seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed: REWRITE });
    const decider = deciderWith(eldSaying({ code: "ro", reliable: false, letters: 30, segments: [] }), fast.check, key);
    const offered = await decider.decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true }).catch((error: unknown) => error);
    expect(offered).toBeInstanceOf(QuestionLanguageChoiceNeeded);
    const offer = (offered as QuestionLanguageChoiceNeeded).offer;
    expect(offer).toMatchObject({ main_language: { code: "ro", name: "Romanian" }, proposed_question: REWRITE,
      languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }] });
    const used = await decider.decide({ ask: askOf(REWRITE, { site_language: "ro",
      question_language_choice: { check_ref: offer.check_ref, choice: "USE_REWRITE", original_question_line: MIX_Q } }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(used).toMatchObject({ language: { code: "ro" }, source: "CHOICE", rewriteAccepted: true, originalQuestionLine: MIX_Q });
    expect(fast.read).toHaveBeenCalledTimes(1);
    await expect(decider.decide({ ask: askOf(MIX_Q, { question_language_choice: { check_ref: offer.check_ref, choice: "KEEP_MINE" } }),
      ownerScope: "owner:b", fastCheckAllowed: true })).rejects.toThrow("QUESTION_LANGUAGE_CHECK_INVALID");
  });

  it("CR-5: a second offer for the same person and question within 15 minutes is the fallback lock, never a second pop-up", async () => {
    let now = NOW;
    const fast = fastSaying({ kind: "MIX", main: { code: "ro", name: "Romanian" }, seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed: REWRITE });
    const decider = new QuestionLanguageDecider({ eld: eldSaying({ code: "ro", reliable: false, letters: 30, segments: [] }), fastCheck: fast.check,
      key: newQuestionLanguageReferenceKey(), clock: () => now, maxQuestionBytes: 8192 });
    const ask = { ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true };
    await expect(decider.decide(ask)).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
    now = new Date(NOW.getTime() + 14 * 60_000);
    expect(await decider.decide(ask)).toMatchObject({ language: { code: "ro" }, source: "REPEAT_OFFER", rewriteAccepted: false });
    await expect(decider.decide({ ...ask, ownerScope: "owner:b", fastCheckAllowed: true })).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
    now = new Date(NOW.getTime() + 30 * 60_000);
    await expect(decider.decide(ask)).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
  });

  it("no paid AI (local): eld or the site language, no offer even for a mix", async () => {
    const lock = await deciderWith(eldSaying({ code: null, reliable: false, letters: 0, segments: [] }), null)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(lock).toMatchObject({ language: { code: "ro" }, source: "LOCAL_SITE" });
  });

  it("the record holds codes and hashes, and the original question only when a rewrite was accepted", async () => {
    const fast = fastSaying({ kind: "ONE", main: { code: "en", name: "English" } });
    const lock = await deciderWith(eldSaying(sure("en")), fast.check).decide({ ask: askOf("Should Romania adopt the euro?", { site_language: "ro" }), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(questionLanguageAskContractMember(lock)).toEqual({ question_language: {
      code: "en", name: "English", source: "FAST", site_language: "ro", rewrite_accepted: false,
      eld: { code: "en", reliable: true, confident: true }, fast: { outcome: "ONE", reason: null, main: "en" }, contract_hash: "c".repeat(64) } });
    expect(questionLanguageAskContractMember(null)).toEqual({});
  });

  it("runLanguageOf: the lock's code and name, or today's guesser without a lock", () => {
    expect(runLanguageOf(null, "Should cities price congestion?")).toEqual({
      tag: detectArgumentLanguage("Should cities price congestion?").tag, nameEn: detectArgumentLanguage("Should cities price congestion?").nameEn });
  });

  it("a choice sent with no reference the server made is refused, never locked", async () => {
    const decider = deciderWith(eldSaying(sure("ro")), null);
    const refused = await decider.decide({ ask: askOf(MIX_Q, { question_language_choice: { check_ref: "aa.bb", choice: "KEEP_MINE" } }), ownerScope: "owner:a", fastCheckAllowed: true })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(TypedDomainError);
    expect((refused as TypedDomainError).code).toBe("QUESTION_LANGUAGE_CHECK_INVALID");
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-decider.test.ts`

- [ ] **Step 3: Implement** `apps/api/src/question-language/decider.ts`:

```ts
import { QuestionLanguageOfferSchema, type AskRequest, type QuestionLanguageOffer } from "@debateai/contract";
import { createHash } from "node:crypto";
import { TypedDomainError, detectArgumentLanguage, questionLanguageOf, type QuestionLanguage } from "@debateai/kernel";
import { decideAfterFast, eldSettles, fallbackLock, type LockSource } from "./decide.js";
import type { EldReader } from "./eld.js";
import { eldConfident } from "./eld-tuning.js";
import type { FastCheck, FastCheckReading } from "./fast-check.js";
import { signQuestionLanguageReference, verifyQuestionLanguageChoice, type QuestionLanguageReferenceKey } from "./reference.js";

/**
 * Question language at "Start debate" (question-language spec 2026-10-13). This is the FIRST step of submit, but only
 * with the debate shape row. It turns the ask into a lock, or into an offer the person answers. It logs nothing and
 * never holds a lock while it waits for the fast AI.
 */
export type QuestionLanguageTrace = Readonly<{
  eld: Readonly<{ code: string | null; reliable: boolean; confident: boolean }> | null;
  fast: Readonly<{ outcome: "ONE" | "MIX" | "DOWN"; reason: string | null; main: string | null }> | null;
  contractHash: string | null;
}>;
export type QuestionLanguageLock = Readonly<{ language: QuestionLanguage; source: LockSource; siteLanguage: string;
  rewriteAccepted: boolean; originalQuestionLine: string | null; trace: QuestionLanguageTrace }>;

export class QuestionLanguageChoiceNeeded extends Error {
  readonly offer: QuestionLanguageOffer;
  readonly trace: QuestionLanguageTrace;
  constructor(offer: QuestionLanguageOffer, trace: QuestionLanguageTrace) {
    super("QUESTION_LANGUAGE_CHOICE_NEEDED");
    this.name = "QuestionLanguageChoiceNeeded";
    this.offer = offer;
    this.trace = trace;
  }
}

/**
 * `fastCheckAllowed` (ruling L-NOCONSENT): the route records sensitive-data consent only for signed-in people, so a
 * signed-out (legacy) person's question never reaches the fast AI: eld and the site language decide, no offer.
 */
export type QuestionLanguagePort = Readonly<{ decide(input: Readonly<{ ask: AskRequest; ownerScope: string; fastCheckAllowed: boolean }>): Promise<QuestionLanguageLock> }>;

export function ownerScopeOf(principal: Readonly<{ kind: "server"; ownerRef: string } | { kind: "legacy"; legacyAskerId: string }>): string {
  return principal.kind === "server" ? `owner:${principal.ownerRef}` : `legacy:${principal.legacyAskerId}`;
}

const fastTrace = (reading: FastCheckReading): QuestionLanguageTrace["fast"] => reading.kind === "DOWN"
  ? Object.freeze({ outcome: "DOWN", reason: reading.reason, main: null })
  : Object.freeze({ outcome: reading.kind, reason: null, main: reading.main.code });

/** CR-5: how long an offer is remembered (the reference's own life) and how many are kept at most (oldest dropped first). */
const OFFER_MEMORY = Object.freeze({ ms: 15 * 60_000, entries: 10_000 });

export class QuestionLanguageDecider implements QuestionLanguagePort {
  /** CR-5: offers made, by hash of person and question (never the text), with when each expires. */
  readonly #offered = new Map<string, number>();

  constructor(private readonly deps: Readonly<{ eld: EldReader; fastCheck: FastCheck | null; key: QuestionLanguageReferenceKey;
    clock: () => Date; maxQuestionBytes: number; onDecided?: (outcome: QuestionLanguageLock | QuestionLanguageChoiceNeeded) => void }>) {}

  async decide(input: Readonly<{ ask: AskRequest; ownerScope: string; fastCheckAllowed: boolean }>): Promise<QuestionLanguageLock> {
    const questionLine = input.ask.question_line;
    const choice = input.ask.question_language_choice;
    if (choice !== undefined) {
      const verified = verifyQuestionLanguageChoice(this.deps.key, { ownerScope: input.ownerScope, questionLine, choice, now: this.deps.clock() });
      const language = questionLanguageOf(verified.main.split("-")[0]!, questionLine);
      if (language === null) throw new TypedDomainError("QUESTION_LANGUAGE_CHECK_INVALID", "QUESTION_LANGUAGE_CHECK_INVALID");
      return this.#done(Object.freeze({ language, source: "CHOICE", siteLanguage: verified.site, rewriteAccepted: verified.rewriteAccepted,
        originalQuestionLine: verified.originalQuestionLine, trace: Object.freeze({ eld: null, fast: null, contractHash: this.deps.fastCheck?.contractHash ?? null }) }));
    }
    const site = questionLanguageOf(input.ask.site_language ?? "en")!;
    const reading = this.deps.eld.read(questionLine);
    const eld = Object.freeze({ code: reading.code, reliable: reading.reliable, confident: eldConfident(reading) });
    const base = { siteLanguage: site.code, rewriteAccepted: false, originalQuestionLine: null } as const;
    if (eldSettles(site, reading)) {
      return this.#done(Object.freeze({ ...base, language: site, source: "ELD_SITE", trace: Object.freeze({ eld, fast: null, contractHash: null }) }));
    }
    if (this.deps.fastCheck === null || !input.fastCheckAllowed) {   // no paid AI, or no recorded consent (L-NOCONSENT)
      const local = fallbackLock(site, reading, questionLine, true);
      if (local.kind !== "LOCK") throw new TypedDomainError("QUESTION_LANGUAGE_DECISION_INVALID", "QUESTION_LANGUAGE_DECISION_INVALID");
      return this.#done(Object.freeze({ ...base, language: local.language, source: local.source, trace: Object.freeze({ eld, fast: null, contractHash: null }) }));
    }
    const fast = await this.deps.fastCheck.read(questionLine, site);
    const trace = Object.freeze({ eld, fast: fastTrace(fast), contractHash: this.deps.fastCheck.contractHash });
    const decision = decideAfterFast(site, reading, fast, questionLine, this.deps.maxQuestionBytes);
    if (decision.kind === "LOCK") return this.#done(Object.freeze({ ...base, language: decision.language, source: decision.source, trace }));
    // CR-5: the same person, the same question, an offer still alive: never a second pop-up; the fallback lock instead.
    const offerKey = createHash("sha256").update(`${input.ownerScope}\0${questionLine.trim()}`, "utf8").digest("hex");
    const nowMs = this.deps.clock().getTime();
    const alive = this.#offered.get(offerKey);
    if (alive !== undefined && alive > nowMs) {
      const fallback = fallbackLock(site, reading, questionLine, false);
      if (fallback.kind !== "LOCK") throw new TypedDomainError("QUESTION_LANGUAGE_DECISION_INVALID", "QUESTION_LANGUAGE_DECISION_INVALID");
      return this.#done(Object.freeze({ ...base, language: fallback.language, source: "REPEAT_OFFER", trace }));
    }
    this.#offered.delete(offerKey);
    this.#offered.set(offerKey, nowMs + OFFER_MEMORY.ms);
    while (this.#offered.size > OFFER_MEMORY.entries) this.#offered.delete(this.#offered.keys().next().value!);
    const checkRef = signQuestionLanguageReference(this.deps.key, { ownerScope: input.ownerScope, site: site.code, questionLine,
      proposed: decision.proposed, main: decision.main.code, now: this.deps.clock() });
    // Pre-flight PF-L19: the offer must be a body the 409 can carry; the route parses it, and a parse failure there would
    // be a 500 (a block). One the contract refuses is never sent: the main language is locked instead.
    const offer = QuestionLanguageOfferSchema.safeParse({ check_ref: checkRef,
      main_language: { code: decision.main.code, name: decision.main.name },
      languages_seen: decision.seen.map((language) => ({ code: language.code, name: language.name })),
      proposed_question: decision.proposed });
    if (!offer.success) {
      return this.#done(Object.freeze({ ...base, language: decision.main, source: "FAST_MIX_NO_OFFER", trace }));
    }
    const needed = new QuestionLanguageChoiceNeeded(Object.freeze(offer.data), trace);
    this.deps.onDecided?.(needed);
    throw needed;
  }

  #done(lock: QuestionLanguageLock): QuestionLanguageLock {
    this.deps.onDecided?.(lock);
    return lock;
  }
}

/** The run's tag and name: the lock's, or today's guesser when there is no lock (today's shape, byte for byte). */
export function runLanguageOf(lock: QuestionLanguageLock | null, questionLine: string): Readonly<{ tag: string; nameEn: string }> {
  if (lock === null) {
    const detected = detectArgumentLanguage(questionLine);
    return Object.freeze({ tag: detected.tag, nameEn: detected.nameEn });
  }
  return Object.freeze({ tag: lock.language.code, nameEn: lock.language.name });
}

/**
 * The run's stored ask contract gains ONE member with the row (plan decision D3). It is encrypted with the run's
 * content for every signed-in person. Codes and hashes only, plus the original question when a rewrite was used.
 */
export function questionLanguageAskContractMember(lock: QuestionLanguageLock | null): Readonly<Record<string, unknown>> {
  if (lock === null) return Object.freeze({});
  return Object.freeze({ question_language: Object.freeze({
    code: lock.language.code, name: lock.language.name, source: lock.source, site_language: lock.siteLanguage,
    rewrite_accepted: lock.rewriteAccepted,
    ...(lock.originalQuestionLine === null ? {} : { original_question_line: lock.originalQuestionLine }),
    ...(lock.trace.eld === null ? {} : { eld: lock.trace.eld }),
    ...(lock.trace.fast === null ? {} : { fast: lock.trace.fast }),
    ...(lock.trace.contractHash === null ? {} : { contract_hash: lock.trace.contractHash })
  }) });
}
```

`ownerScopeOf`'s legacy form must match how Task 8 binds the reference. Both use the same `ownerScope` string from this one function, so they agree by construction. Note the offer-memory entry is set BEFORE the safeParse; that is harmless (a refused offer then answers a repeat with REPEAT_OFFER, also a lock). Add the file to the manifest.

Implementer note (pre-flight PF-L26): the REPEAT_OFFER memory is an in-process `Map`. There is one API process today (`deploy/vps/systemd/debateai-api.service`); a restart or a second process loses it, and then the page's "once per submit" rule (Task 18) is the only guard. The repeat check runs after the fast call, so a repeat still pays one call (about $0.00005). The time limit lives in Task 5 (`AbortSignal.timeout`), not here. `onDecided` carries the original question line: wire it only to practice (P2d), never to a logger.

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/question-language-decider.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/question-language/decider.ts tests/unit/question-language-decider.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API: the question-language decider — eld, the fast check, the offer and the person's verified choice in one step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The ask — the first step of `submit`, both `startRun` calls, and the 409

**Files:**
- Modify: `apps/api/src/index.ts`:
  - `RunCreationSettings` (add `questionLanguage?: QuestionLanguagePort`);
  - `submit` (the new step, right after `const shapePolicy = …`: after the free session-mismatch and preview-team checks, before billing; pre-flight PF-L30's wording);
  - the two `detectArgumentLanguage(ask.question_line)` calls and their `startRun` inputs and `askContract`;
  - `#submitWithRoom`'s parameter list (one new parameter, BEFORE the optional `fundingBasis`; PF-L27);
  - the central error handler (the 409 offer, before the `AskAlreadyWaitingRefusal` branch);
  - `askRefusalStatus` (three codes → 409, and its return type widened; PF-L28).
- Test: `tests/unit/question-language-submit.test.ts` (create)

**Interfaces:**
- Consumes: `QuestionLanguagePort`, `QuestionLanguageChoiceNeeded`, `QuestionLanguageLock`, `ownerScopeOf`, `runLanguageOf`, `questionLanguageAskContractMember` (Task 10); `QuestionLanguageChoiceNeededSchema`, `QUESTION_LANGUAGE_CHOICE_NEEDED` (Task 9).
- Produces: `RunCreationSettings.questionLanguage?: QuestionLanguagePort`. `POST /v1/asks` answers `409 QUESTION_LANGUAGE_CHOICE_NEEDED` with the offer, and 409 `QUESTION_LANGUAGE_CHECK_INVALID` / `_EXPIRED` / `QUESTION_LANGUAGE_CHOICE_MISMATCH`.

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-submit.test.ts`. It reuses the arrangement of `tests/unit/debate-shape-submit.test.ts` (P2a). Copy its `stubPool`, `PANEL`, `CEILING_TERMS`, `serverSession`, `serverPrincipal`, `fixtureApplication` and the body of `arrange`, unchanged, into a local `arrangeWith(settings)`:

```ts
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostgresAskApplication, buildApi, type AskApplication, type RunCreationSettings } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { PLAN_TIER_ROSTERS, QUESTION_LANGUAGE_CHOICE_NEEDED, type AskRequest, type Session } from "@debateai/contract";
import { RunCostSubstitutionRepository, RunRepository } from "@debateai/db";
import { TypedDomainError, detectArgumentLanguage } from "@debateai/kernel";
import { LivenessRepository } from "@debateai/liveness";
import { computeStructuralCeilingBasis, debateShapePolicyStartValues } from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import type { Pool, PoolClient, QueryResult } from "pg";
import { QuestionLanguageChoiceNeeded, type QuestionLanguageLock, type QuestionLanguagePort } from "../../apps/api/src/question-language/decider.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

// stubPool, PANEL, CEILING_TERMS, serverSession, serverPrincipal, fixtureApplication: copied from debate-shape-submit.test.ts
/* … paste them here unchanged … */

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const Q = "Ar trebui România să adopte euro?";
const ask = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: Q, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "medium", depth_params: { depth: 2 }, decision_scope: "question language submit",
  as_of: "2026-10-13T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [], ...extra });
const LOCK: QuestionLanguageLock = Object.freeze({ language: { code: "ro", name: "Romanian" }, source: "ELD_SITE", siteLanguage: "ro",
  rewriteAccepted: false, originalQuestionLine: null, trace: { eld: { code: "ro", reliable: true, confident: true }, fast: null, contractHash: null } });
const OFFER = { check_ref: "a.b", main_language: { code: "ro", name: "Romanian" },
  languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed_question: "Ar trebui România să adopte euro sau să aștepte?" };

// billingFor and its imports (AskBilling, PlanId, plans, EVENT_ID, NOW): copied from debate-shape-submit.test.ts (~105–125).
function arrangeWith(input: Readonly<{ policy: boolean; port?: QuestionLanguagePort; billing?: AskBilling;
  openAdmissionLock?: () => unknown; resolveDiscoveredPanel?: () => Promise<typeof PANEL> }>) {
  const started: Array<Parameters<RunRepository["startRun"]>[0]> = [];
  vi.spyOn(LivenessRepository.prototype, "recordQuery").mockResolvedValue(1);
  vi.spyOn(RunRepository.prototype, "startRun").mockImplementation(async (run) => { started.push(run); return RUN_ID; });
  vi.spyOn(ServeRepository.prototype, "recordMemoryQuestion").mockResolvedValue(undefined);
  vi.spyOn(WorkItemRepository.prototype, "enqueue").mockResolvedValue("22222222-2222-4222-8222-222222222222");
  vi.spyOn(WorkItemRepository.prototype, "enqueueOn").mockResolvedValue("22222222-2222-4222-8222-222222222222");
  vi.spyOn(WorkItemRepository.prototype, "recordSetupFailure").mockResolvedValue(true);
  vi.spyOn(RunCostSubstitutionRepository.prototype, "record").mockResolvedValue("substitution:language");
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, registerVersion: 1, batteryVersion: "language-submit", settlementWatchHandle: "language-submit",
    resolveDiscoveredPanel: input.resolveDiscoveredPanel ?? (async () => PANEL),
    ...(input.billing === undefined ? {} : { billing: input.billing }),
    ...(input.openAdmissionLock === undefined ? {} : { previewBudgetGate: { openAdmissionLock: input.openAdmissionLock } as never }),
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape }) =>
      computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned, ...(shape === null ? {} : { shape }) }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
    ...(input.policy ? { debateShapePolicy: debateShapePolicyStartValues() } : {}),
    ...(input.port === undefined ? {} : { questionLanguage: input.port })
  };
  const application = new PostgresAskApplication(stubPool(), { dispatch: vi.fn(async () => undefined) }, settings,
    { read: async () => [] }, stubPool(), { server: stubPool(), legacy: stubPool() });
  return { application, started };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("submit with the question-language step (question-language spec 2026-10-13)", () => {
  it("the row absent: the decider is never asked, the guesser decides, the ask contract is today's four keys", async () => {
    const decide = vi.fn(async () => LOCK);
    const { application, started } = arrangeWith({ policy: false, port: { decide } });
    await application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal);
    expect(decide).not.toHaveBeenCalled();
    expect(started[0]).toMatchObject({ argumentLanguageTag: detectArgumentLanguage(Q).tag, argumentLanguageName: detectArgumentLanguage(Q).nameEn });
    expect(Object.keys(started[0]!.askContract!)).toEqual(["decision_scope", "steering_presets", "steering_annotations", "critic_unavailable_cap"]);
  });

  it("the row present: the lock's code and name are the run's, and the record joins the ask contract", async () => {
    const decide = vi.fn(async () => LOCK);
    const { application, started } = arrangeWith({ policy: true, port: { decide } });
    await application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal);
    expect(decide).toHaveBeenCalledWith({ ask: expect.objectContaining({ question_line: Q, site_language: "ro" }), ownerScope: `owner:${serverPrincipal.ownerRef}`,
      fastCheckAllowed: true });
    expect(started[0]).toMatchObject({ argumentLanguageTag: "ro", argumentLanguageName: "Romanian" });
    expect(started[0]!.askContract).toMatchObject({ question_language: { code: "ro", source: "ELD_SITE", site_language: "ro", rewrite_accepted: false } });
  });

  it("CR-1: an offer starts no run and touches neither the person's allowance nor money", async () => {
    // Pre-flight PF-L31: with no billing configured the spies below would watch nothing, so this case turns billing on,
    // built exactly like `billingFor()` in tests/unit/debate-shape-submit.test.ts (~105–125), and spies on every port.
    const { billing, estimateMicros } = billingFor("FREE");
    const openAdmissionLock = vi.fn();
    const resolveDiscoveredPanel = vi.fn(async () => PANEL);
    const { application, started } = arrangeWith({ policy: true, billing, openAdmissionLock, resolveDiscoveredPanel,
      port: { decide: async () => { throw new QuestionLanguageChoiceNeeded(OFFER, { eld: null, fast: null, contractHash: null }); } } });
    await expect(application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal)).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
    expect(started).toEqual([]);
    expect(billing.entitlements.current).not.toHaveBeenCalled();
    expect(estimateMicros).not.toHaveBeenCalled();
    expect(resolveDiscoveredPanel).not.toHaveBeenCalled();
    expect(openAdmissionLock).not.toHaveBeenCalled();
    // and spy (vi.spyOn on the objects billingFor builds) on coarseFit.personAllowance.read and coarseFit.spend.readOwnerSpentMicros: not called.
  });

  it("ruling L-NOCONSENT: a signed-out (legacy) person is decided without the fast AI", async () => {
    const decide = vi.fn(async () => LOCK);
    const { application } = arrangeWith({ policy: true, port: { decide } });
    // A legacy session the submit's own check admits: not a server session, asker_id equal to the legacy id (cast as needed).
    const legacySession = { ...serverSession, ownership_provenance: "legacy" as never, asker_id: "asker-legacy-1" };
    await application.submit(ask({ site_language: "ro" }), legacySession, { kind: "legacy", legacyAskerId: "asker-legacy-1" });
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ ownerScope: "legacy:asker-legacy-1", fastCheckAllowed: false }));
  });

  it("the route answers the offer as a strict 409 body, and a stale or forged choice as 409 with its code", async () => {
    const identity = testHttpIdentity("language");
    const sessions = { ...testSessionApplication([identity]), readSensitiveDataConsent: async () => "given" as const, recordSensitiveDataConsent: async () => "given" as const };
    const offering = buildApi({ application: fixtureApplication(async () => { throw new QuestionLanguageChoiceNeeded(OFFER, { eld: null, fast: null, contractHash: null }); }),
      sessions, allowedOrigin: TEST_APP_ORIGIN });
    const offered = await offering.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ask({ site_language: "ro" }) });
    expect(offered.statusCode).toBe(409);
    expect(offered.json()).toEqual({ error: QUESTION_LANGUAGE_CHOICE_NEEDED, message: QUESTION_LANGUAGE_CHOICE_NEEDED, offer: OFFER });
    await offering.close();
    for (const code of ["QUESTION_LANGUAGE_CHECK_INVALID", "QUESTION_LANGUAGE_CHECK_EXPIRED", "QUESTION_LANGUAGE_CHOICE_MISMATCH"]) {
      const { AskRefusal } = await import("@debateai/api");
      const refusing = buildApi({ application: fixtureApplication(async () => { throw new AskRefusal(new TypedDomainError(code, code)); }),
        sessions, allowedOrigin: TEST_APP_ORIGIN });
      const refused = await refusing.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
        payload: ask({ question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE" } }) });
      expect(refused.statusCode, code).toBe(409);
      expect(refused.json()).toMatchObject({ error: code });
      await refusing.close();
    }
  });

  it("a choice that names its own language is malformed (400), and a person without consent never reaches submit", async () => {
    const identity = testHttpIdentity("language-consent");
    const submit = vi.fn(async () => ({ run_ref: RUN_ID, status: "QUEUED" as const }));
    const noConsent = { ...testSessionApplication([identity]), readSensitiveDataConsent: async () => "required" as const, recordSensitiveDataConsent: async () => "given" as const };
    const api = buildApi({ application: fixtureApplication(submit), sessions: noConsent, allowedOrigin: TEST_APP_ORIGIN });
    expect((await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ask() })).statusCode).toBe(403);
    expect(submit).not.toHaveBeenCalled();
    await api.close();
    const consented = { ...noConsent, readSensitiveDataConsent: async () => "given" as const };
    const api2 = buildApi({ application: fixtureApplication(submit), sessions: consented, allowedOrigin: TEST_APP_ORIGIN });
    const malformed = await api2.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
      payload: ask({ question_language_choice: { check_ref: "a.b", choice: "KEEP_MINE", language: "en" } as never }) });
    expect(malformed.statusCode).toBe(400);
    expect(submit).not.toHaveBeenCalled();
    await api2.close();
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-submit.test.ts`

- [ ] **Step 3: Implement in `apps/api/src/index.ts`**

1. **Imports:** from `./question-language/decider.js`, import `QuestionLanguageChoiceNeeded`, `ownerScopeOf`, `questionLanguageAskContractMember`, `runLanguageOf`, `type QuestionLanguageLock`, `type QuestionLanguagePort`. From `@debateai/contract`, add `QuestionLanguageChoiceNeededSchema` and `QUESTION_LANGUAGE_CHOICE_NEEDED`. Re-export `QuestionLanguageChoiceNeeded` and `type QuestionLanguagePort` from the package's public surface, next to `AskRefusal`.
2. **`RunCreationSettings`:** add

   ```ts
     /** Question language (spec 2026-10-13): read only with `debateShapePolicy`; the first step of submit. */
     readonly questionLanguage?: QuestionLanguagePort;
   ```
3. **`submit`:** right after `const shapePolicy = this.settings.debateShapePolicy ?? null;`, add

   ```ts
       // Question language (spec 2026-10-13, ruling L8): with the shape row, the language is decided first — after the
       // route's crisis, consent, team, admission and country checks, before billing, admission and any lock. A refusal
       // of the person's choice is a 409 the page answers by checking again; an offer ends the request with a 409.
       // Ruling L-NOCONSENT (pre-flight PF-L30): the route records consent only for signed-in people, so a legacy
       // principal never reaches the fast AI (eld + site language, no offer). The step stays before billing (CR-1).
       const questionLanguageLock: QuestionLanguageLock | null = shapePolicy === null || this.settings.questionLanguage === undefined
         ? null
         : await this.settings.questionLanguage.decide({ ask: requestedAsk, ownerScope: ownerScopeOf(principal),
           fastCheckAllowed: principal.kind === "server" })
           .catch((error: unknown) => {
             if (error instanceof TypedDomainError) markAskRefusal(error);
             throw error;
           });
   ```

   If `shapePolicy === null` while `questionLanguage` is set, or the reverse, the lock is null: today's path.
4. **Today's path** (`const argumentLanguage = detectArgumentLanguage(ask.question_line);`, near the preview admission lock): replace it with `const argumentLanguage = runLanguageOf(questionLanguageLock, ask.question_line);`. In that path's `askContract: { … critic_unavailable_cap: criticUnavailableCap }`, add `...questionLanguageAskContractMember(questionLanguageLock)` as the last member.
5. **`#submitWithRoom`:**
   - Add the parameter `questionLanguageLock: QuestionLanguageLock | null` right after `shapePlan: DebateShapePlanKey` and BEFORE the optional `fundingBasis?: FundingBasis` (a required parameter after an optional one is TS1016; pre-flight PF-L27). At its one call site (`this.#submitWithRoom(ask, plannedAsk, session, principal, ownership, this.settings.room, substitutedAt, shapePlan, fundingBasis)`, ~4683) pass it in the same place: `…, shapePlan, questionLanguageLock, fundingBasis)`.
   - Inside, replace `const argumentLanguage = detectArgumentLanguage(ask.question_line);` with `const argumentLanguage = runLanguageOf(questionLanguageLock, ask.question_line);`.
   - Add the same spread as the last member of its `askContract`.
   - If `detectArgumentLanguage` has no other use left in the file, remove it from the import list.
6. **Error handler:** before `if (knownError instanceof AskAlreadyWaitingRefusal) {`, add

   ```ts
       // Question language (spec 2026-10-13): a real mix ends the request with the offer; no run exists.
       if (knownError instanceof QuestionLanguageChoiceNeeded) {
         return reply.status(409).send(QuestionLanguageChoiceNeededSchema.parse({
           error: QUESTION_LANGUAGE_CHOICE_NEEDED, message: QUESTION_LANGUAGE_CHOICE_NEEDED, offer: knownError.offer
         }));
       }
   ```
7. **`askRefusalStatus(code)`:** widen its return type from `401 | 403 | 422 | 429` to `401 | 403 | 409 | 422 | 429` (pre-flight PF-L28) and add a branch returning 409 for `QUESTION_LANGUAGE_CHECK_INVALID`, `QUESTION_LANGUAGE_CHECK_EXPIRED` and `QUESTION_LANGUAGE_CHOICE_MISMATCH`. There is NO known-domain-code list in `apps/api` to add them to (pre-flight PF-L29: `grep '"ASK_PLAN_TIER_INVALID"'` finds only two throw sites); the UI maps the 409 in `apps/ui/lib/v3/requestFailure.ts` in Task 18.

- [ ] **Step 4: Run and expect PASS**

Ruling CR-1 (checked in Task 0 Step 4): the case "CR-1: an offer starts no run …" proves the offer touches neither the person's debate allowance nor money, with billing ON (pre-flight PF-L31): `billing.entitlements.current`, `coarseFit.personAllowance.read`, `coarseFit.spend.readOwnerSpentMicros`, `estimator.estimateMicros`, `resolveDiscoveredPanel` and the `previewBudgetGate.openAdmissionLock` spy are never called. (`billingFor("FREE")`, as debate-shape-submit.test.ts uses it.) The route's request limiter (`admitOrRefuse(reply, "asks", …)`) is charged before `submit` and is the only charge the offer request makes; that is accepted by CR-1.

Implementer note (pre-flight PF-L32): there are exactly two `startRun` calls (~4707, ~4976) and two `detectArgumentLanguage(ask.question_line)` calls (~4695, ~4919); the spec's 4627/4850 have drifted. `ask_contract` has four keys today (~4727–4732, ~4996–5001), and its only DB rule is "is an object" (0017). The row-absent guard (`shapePolicy === null || questionLanguage === undefined → null`) keeps today's bytes. Practice (`tools/preview-practice/practice-debate.ts` ~413) calls `submit` directly, skipping the route: it sends no `site_language`, so it defaults to `en` (a Romanian practice question costs one fast call), and an offer surfaces as the refusal `QuestionLanguageChoiceNeeded` until P2d's `--language-choice`.

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-submit.test.ts`
- `pnpm exec vitest run tests/unit/debate-shape-submit.test.ts`
- `pnpm exec vitest run tests/unit/crisis-check-api.test.ts`

The last two prove nothing else moved.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts tests/unit/question-language-submit.test.ts
git commit -m "API: the question language is the first step of submit with the shape row — the lock is the run's, an offer is a 409

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The boot — row, eld, transport choice, the decider; the practice composition; both publishers

**Files:**
- Create: `apps/api/src/question-language/boot.ts`
- Modify:
  - `apps/api/src/main.ts` (after the `debate-shape-policy` boot step);
  - `tools/preview-practice/practice-ask-composition.ts` (the same composition, preview gate fetch);
  - `deploy/preview-auth-dev/v1/publish-register-v2.ts` (`PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2` += `QUESTION_LANGUAGE_POLICY_ROW_KEY`, the builder's SEVENTH argument `questionLanguage: QuestionLanguagePolicy | null = null` and the carried-row parse check, as P2a/P2b did for `debateShapePolicy`);
  - `deploy/preview-auth-dev/v1/publish-register-v3.ts` (kit v3, merged in Task 0; pre-flight PF-L33): `buildPreviewSourceRowsV3` gains an EIGHTH argument `questionLanguage` and passes it as kit v2's seventh; `composePreviewSnapshotV3` parses a carried `questionLanguagePolicy` with `parseQuestionLanguagePolicy`;
  - `deploy/preview-auth-dev/v1/native-operator.mjs` (pre-flight PF-L34: kit v2's builder is called only from here, so without it the new argument is unreachable): plan key `questionLanguage` (like `debateShape`: plan and publish only; one plain JSON object, shape-checked by a new `validateQuestionLanguageChoice`; the register's parser checks it in the builder), passed as the v2 call's seventh argument and the v3 call's eighth (`plan.questionLanguage??null`);
  - `deploy/preview-release/v1/release-artifacts.mjs` (the `native-plan` flag `--question-language '<JSON object>'`, plan only, copied from P2b's `--debate-shape` plumbing without its `off` word: an owner switches the check off with `"fastCheck": null`);
  - `apps/runner/src/hosted-register-publish.ts` (optional member `questionLanguagePolicy` without its `kind`; refusal `HOSTED_REGISTER_QUESTION_LANGUAGE_INVALID`; added to `TOP_LEVEL_KEYS`, the plan and the additive rows block, exactly as P2a Task 10 did for `debateShapePolicy`);
  - `deploy/vps/register/README.md` (one row for the member and its refusal);
  - `tests/support/shipped-corpus.manifest.txt`.
- Test: `tests/unit/question-language-boot.test.ts` (create). Add cases, copying each file's `debateShapePolicy` cases with the new row:
  - `tests/unit/preview-register-publish-v2.test.ts` (and update its three pins: ~321 and ~400 `PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2` now three keys, `[CALL_CONCURRENCY_POLICY_ROW_KEY, DEBATE_SHAPE_POLICY_ROW_KEY, QUESTION_LANGUAGE_POLICY_ROW_KEY]`; ~375 the operator regex now ends `plan\.debateShape\?\?null,plan\.questionLanguage\?\?null\);`);
  - `tests/unit/preview-register-publish-v3.test.ts` (the v3 build carries the row; a carried malformed row is refused; the operator regex at ~221 now ends `plan\.debateShape\?\?null,plan\.questionLanguage\?\?null\)`);
  - `tests/unit/preview-release-artifacts.test.ts` (if it pins the `native-plan` optional flags);
  - `tests/unit/hosted-register-publish.test.ts` (copy the member cases at ~398–415) and `tests/integration/hosted-register-publish.test.ts` (copy the additive-row case at ~556).

**Interfaces:**
- Produces:
```ts
export type QuestionLanguagePaidRoute =
  | Readonly<{ kind: "PREVIEW"; fetch: typeof fetch }>
  | Readonly<{ kind: "HOSTED"; credential: string; recordSpend: (usage: FastCheckUsage) => Promise<void> }>
  | Readonly<{ kind: "NONE" }>;
export function assertQuestionLanguagePolicyBootable(policy: QuestionLanguagePolicy, route: QuestionLanguagePaidRoute): void;
export async function composeQuestionLanguage(input: Readonly<{ policy: QuestionLanguagePolicy | null; route: QuestionLanguagePaidRoute;
  clock: () => Date; maxQuestionBytes: number; referenceKey: QuestionLanguageReferenceKey }>): Promise<QuestionLanguageDecider>;
// Ruling L-ROUTE (pre-flight PF-L35): a configured preview is PREVIEW with the Anthropic socket, else NONE — never HOSTED.
export function questionLanguageRouteFor(input: Readonly<{ previewConfigured: boolean; previewFetch: typeof fetch | undefined;
  anthropicSocket: string | undefined; hosted: () => QuestionLanguagePaidRoute }>): QuestionLanguagePaidRoute;
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-boot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { questionLanguagePolicyStartValues } from "@debateai/register";
import { assertQuestionLanguagePolicyBootable, composeQuestionLanguage, questionLanguageRouteFor } from "../../apps/api/src/question-language/boot.js";
import { newQuestionLanguageReferenceKey } from "../../apps/api/src/question-language/reference.js";

const start = questionLanguagePolicyStartValues();
const previewRoute = { kind: "PREVIEW" as const, fetch: (async () => new Response("{}", { status: 500 })) as typeof fetch };

describe("the question-language boot (question-language spec 2026-10-13)", () => {
  it("the start values boot on the preview (Haiku is a reviewed row and 'low' is on its menu)", () => {
    expect(() => assertQuestionLanguagePolicyBootable(start, previewRoute)).not.toThrow();
  });

  it("ruling L-ROUTE: a preview with no Anthropic gate socket has NO fast check, never the hosted route", () => {
    expect(questionLanguageRouteFor({ previewConfigured: true, previewFetch: previewRoute.fetch, anthropicSocket: undefined, hosted: () => ({ kind: "NONE" }) }))
      .toEqual({ kind: "NONE" });
    expect(questionLanguageRouteFor({ previewConfigured: true, previewFetch: previewRoute.fetch, anthropicSocket: "/run/gate.sock",
      hosted: () => { throw new Error("never asked on the preview"); } })).toEqual({ kind: "PREVIEW", fetch: previewRoute.fetch });
  });

  it("refuses, at boot, a preview model the gate does not review, or an effort off its menu", () => {
    expect(() => assertQuestionLanguagePolicyBootable({ ...start, fastCheck: { ...start.fastCheck!, model: "claude-opus-5-5" } }, previewRoute))
      .toThrow("QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW");
  });

  it("refuses an owner instruction carrying a frame token", () => {
    expect(() => assertQuestionLanguagePolicyBootable({ ...start, instruction: "Name it. --- SAFETY FRAME" }, { kind: "NONE" }))
      .toThrow("QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN");
  });

  it("with no paid route, or the check switched off, the decider is built without a fast check (eld + site language)", async () => {
    for (const [policy, route] of [[start, { kind: "NONE" as const }], [{ ...start, fastCheck: null }, previewRoute]] as const) {
      const decider = await composeQuestionLanguage({ policy, route, clock: () => new Date(), maxQuestionBytes: 8192, referenceKey: newQuestionLanguageReferenceKey() });
      const lock = await decider.decide({ ask: { question_line: "Ar trebui România să adopte euro, or should it wait until wages catch up?", site_language: "ro" } as never, ownerScope: "owner:a", fastCheckAllowed: true });
      expect(lock.source === "LOCAL_SITE" || lock.source === "LOCAL_ELD" || lock.source === "ELD_SITE").toBe(true);
    }
  });

  it("the preview route: a failing gate is the fallback, never a refusal of the ask", async () => {
    const decider = await composeQuestionLanguage({ policy: null, route: previewRoute, clock: () => new Date(), maxQuestionBytes: 8192, referenceKey: newQuestionLanguageReferenceKey() });
    const lock = await decider.decide({ ask: { question_line: "Ar trebui România să adopte euro, or should it wait until wages catch up?", site_language: "ro" } as never, ownerScope: "owner:a", fastCheckAllowed: true });
    expect(["FALLBACK_SITE", "FALLBACK_ELD", "ELD_SITE"]).toContain(lock.source);
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-boot.test.ts`

- [ ] **Step 3: Implement** `apps/api/src/question-language/boot.ts`:

```ts
import { TypedDomainError } from "@debateai/kernel";
import { ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_MESSAGES_PATH, PREVIEW_ANTHROPIC_MESSAGES_URL, previewModelRow } from "@debateai/providers";
import { questionLanguagePolicyStartValues, type QuestionLanguagePolicy } from "@debateai/register";
import { QuestionLanguageDecider } from "./decider.js";
import { loadEldReader } from "./eld.js";
import { ELD_TUNING } from "./eld-tuning.js";
import { assertQuestionLanguageInstructionFrameable, createFastCheck, type FastCheck } from "./fast-check.js";
import type { QuestionLanguageReferenceKey } from "./reference.js";
import { anthropicFastCheckTransport, type FastCheckUsage } from "./transport.js";

/**
 * How a fast check may be paid for, decided once at boot:
 *  - PREVIEW: the guarded fetch, a site cost in the Anthropic gate's daily pot;
 *  - HOSTED: the existing support target's Anthropic key, with the run-less spend record (Task 19);
 * nothing else (ruling CR-6): the API gets no new vendor credential, and on the preview it holds none.
 *  - NONE: local mode with no paid AI. eld and the site language decide, and no rewrite is offered.
 */
export type QuestionLanguagePaidRoute =
  | Readonly<{ kind: "PREVIEW"; fetch: typeof fetch }>
  | Readonly<{ kind: "HOSTED"; credential: string; recordSpend: (usage: FastCheckUsage) => Promise<void> }>
  | Readonly<{ kind: "NONE" }>;

export function assertQuestionLanguagePolicyBootable(policy: QuestionLanguagePolicy, route: QuestionLanguagePaidRoute): void {
  assertQuestionLanguageInstructionFrameable(policy.instruction);
  if (policy.fastCheck === null || route.kind !== "PREVIEW") return;
  const reviewed = previewModelRow(policy.fastCheck.model);
  if (reviewed === undefined || reviewed.provider !== policy.fastCheck.provider
    || !(reviewed.efforts as readonly string[]).includes(policy.fastCheck.effort)) {
    // The message is the code (pre-flight PF-L13: the test's toThrow("…") reads the message).
    throw new TypedDomainError("QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW", "QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW");
  }
}

/**
 * Ruling L-ROUTE (CR-6; pre-flight PF-L35): a deployment with a preview configuration NEVER takes the hosted route,
 * even in hosted mode (#163): the API holds no vendor key on the preview, and the egress proxy admits only the
 * billing hosts. With the Anthropic gate socket it is PREVIEW; without it there is no fast check (eld + site language).
 */
export function questionLanguageRouteFor(input: Readonly<{ previewConfigured: boolean; previewFetch: typeof fetch | undefined;
  anthropicSocket: string | undefined; hosted: () => QuestionLanguagePaidRoute }>): QuestionLanguagePaidRoute {
  if (input.previewConfigured) {
    return input.previewFetch !== undefined && input.anthropicSocket !== undefined
      ? Object.freeze({ kind: "PREVIEW", fetch: input.previewFetch }) : Object.freeze({ kind: "NONE" });
  }
  return input.hosted();
}

export async function composeQuestionLanguage(input: Readonly<{ policy: QuestionLanguagePolicy | null; route: QuestionLanguagePaidRoute;
  clock: () => Date; maxQuestionBytes: number; referenceKey: QuestionLanguageReferenceKey }>): Promise<QuestionLanguageDecider> {
  const policy = input.policy ?? questionLanguagePolicyStartValues();
  assertQuestionLanguagePolicyBootable(policy, input.route);
  const eld = await loadEldReader(ELD_TUNING.database);
  let fastCheck: FastCheck | null = null;
  if (policy.fastCheck !== null && input.route.kind !== "NONE") {
    const transport = input.route.kind === "PREVIEW"
      ? anthropicFastCheckTransport({ fetch: input.route.fetch, url: PREVIEW_ANTHROPIC_MESSAGES_URL, credential: undefined, settings: policy.fastCheck })
      : anthropicFastCheckTransport({ fetch, url: `${ANTHROPIC_MESSAGES_BASE_URL}${ANTHROPIC_MESSAGES_PATH}`, credential: input.route.credential,
        settings: policy.fastCheck, onUsage: input.route.recordSpend });
    fastCheck = createFastCheck({ transport, instruction: policy.instruction, timeoutMs: policy.fastCheck.timeoutMs });
  }
  return new QuestionLanguageDecider({ eld, fastCheck, key: input.referenceKey, clock: input.clock, maxQuestionBytes: input.maxQuestionBytes });
}
```

Check the exact field names on `PreviewModelRow` (`provider`, `efforts`) in `packages/providers/src/preview-models.ts`, and adapt if they differ. Add the file to the manifest.

`apps/api/src/main.ts`, right after P2b's `const debateShapeInForcePolicy = debateShapeInForce(debateShapePolicy);` (~632, the line after `const debateShapePolicy = await boot.run("debate-shape-policy", …)`; a row switched off with `enabled: false` is no row here, so no decider is built). `blindIndexKey` (~257), `previewConfig` (~204) and `previewFetch` (~511) are already loaded above (CR-5). Add these imports (pre-flight PF-L37): `previewProviderSocket` from `@debateai/providers`; `readQuestionLanguagePolicy` from `@debateai/register`; `composeQuestionLanguage` and `questionLanguageRouteFor` from `./question-language/boot.js`; `questionLanguageReferenceKeyFrom` from `./question-language/reference.js`. The question bound is `askQuestionMaxBytes()` from `@debateai/contract`, already imported at main.ts ~60 (the same value as `ASK_QUESTION_MAX_BYTES` in `apps/api/src/index.ts`).

```ts
  // Question language (spec 2026-10-13): only with the debate shape row. The row is optional (absent = start values);
  // a malformed row, an owner text carrying a frame token, or an unreviewed preview model refuses the boot.
  const questionLanguage = debateShapeInForcePolicy === null ? undefined : await boot.run("question-language", async () => composeQuestionLanguage({
    policy: await readQuestionLanguagePolicy(pool, environment.REGISTER_VERSION),
    // Ruling L-ROUTE: a configured preview is PREVIEW (with the Anthropic socket) or NONE, never HOSTED.
    route: questionLanguageRouteFor({
      previewConfigured: previewConfig !== undefined,
      previewFetch,
      anthropicSocket: previewConfig === undefined ? undefined : previewProviderSocket(previewConfig, "anthropic"),
      hosted: hostedQuestionLanguageRoute
    }),
    clock: () => new Date(),
    maxQuestionBytes: askQuestionMaxBytes(),
    // CR-5: one key for every API process of this deployment, derived from the blind-index key loaded above.
    referenceKey: questionLanguageReferenceKeyFrom(blindIndexKey)
  }));
```

Then spread `...(questionLanguage === undefined ? {} : { questionLanguage })` into the `PostgresAskApplication` settings, next to `debateShapePolicy`.

`hostedQuestionLanguageRoute` is a local function in main.ts. It returns `{ kind: "NONE" }` unless ALL of these hold:
- the deployment mode is hosted;
- the support model target (already parsed at boot as `supportModelTarget`) is an Anthropic Messages API target with a custody-read credential;
- the Task 19 spend function exists (`SELECT to_regprocedure('ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)') IS NOT NULL`).

Only then does it return `{ kind: "HOSTED", credential, recordSpend }`. Until Task 19 lands, it returns `{ kind: "NONE" }` unconditionally, with a `// Task 19` comment. It is synchronous here (it is passed as `hosted: hostedQuestionLanguageRoute`); Task 19 makes the capability query, so it then resolves the route BEFORE `composeQuestionLanguage` (an awaited `hostedQuestionLanguageRoute()` whose result the `hosted` callback returns). Read the support target's fields from `apps/api/src/support/model.ts` (`parseSupportModelTargetJson`); never read a key from anywhere else.

Boot order for Task 19 (pre-flight PF-L36): today `supportModelTarget` is parsed at main.ts ~1190, AFTER this step (~632) and after `new PostgresAskApplication(` (~967), and its credential exists only inside `createSupportModelAdapter` (~1196–1200). Task 19's HOSTED route therefore moves the support-target parse (`boot.runSync("support-model-target", …)`) and a custody read of its credential ABOVE this step. Task 12 does not move them: its hosted route is NONE.

`tools/preview-practice/practice-ask-composition.ts`: compose the same way. The route is `{ kind: "PREVIEW", fetch: <the practice's guarded fetch> }` when the practice runs against the gates, and `{ kind: "NONE" }` when the composition has no guarded fetch. `composePracticeAsk` (~72–84) has no dry mode today, so do not add one (pre-flight PF-L37). Its `referenceKey` is `newQuestionLanguageReferenceKey()` (one process; the practice loads no blind-index key). Pass it into the same settings object. Also add an optional `onQuestionLanguage?: (outcome) => void` composition argument wired to the decider's `onDecided`, so P2d's report can record each lock or offer.

Publishers: copy every `debateShapePolicy` line P2a/P2b added in `publish-register-v2.ts` (optional key, builder argument, carried-row parse), the v3 lines Task 0 Step 2b added in `publish-register-v3.ts`, the operator lines in `native-operator.mjs`, the `--debate-shape` lines in `release-artifacts.mjs`, and the member lines in `hosted-register-publish.ts`, with `questionLanguagePolicy`, `questionLanguagePolicyRow`, `parseQuestionLanguagePolicy`, plan key `questionLanguage`, flag `--question-language` and the refusal `HOSTED_REGISTER_QUESTION_LANGUAGE_INVALID`. Copy the matching test cases too, and update the pins listed under Files. Expect friction in `native-operator.mjs`: Task 0's merge and Step 2b already edited it.

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-boot.test.ts`
- `pnpm exec vitest run tests/unit/preview-register-publish-v2.test.ts`
- `pnpm exec vitest run tests/unit/preview-register-publish-v3.test.ts`
- `pnpm exec vitest run tests/unit/preview-auth-dev-operator.test.ts`
- `pnpm exec vitest run tests/unit/preview-release-artifacts.test.ts`
- `pnpm exec vitest run tests/unit/hosted-register-publish.test.ts`
- `pnpm exec vitest run tests/unit/debate-shape-submit.test.ts`

Then, each alone: `pnpm exec vitest run tests/integration/hosted-register-publish.test.ts` and `pnpm exec vitest run tests/integration/preview-register-publish-v3.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/question-language/boot.ts apps/api/src/main.ts tools/preview-practice/practice-ask-composition.ts deploy/preview-auth-dev/v1/publish-register-v2.ts deploy/preview-auth-dev/v1/publish-register-v3.ts deploy/preview-auth-dev/v1/native-operator.mjs deploy/preview-release/v1/release-artifacts.mjs apps/runner/src/hosted-register-publish.ts deploy/vps/register/README.md tests/unit/question-language-boot.test.ts tests/unit/preview-register-publish-v2.test.ts tests/unit/preview-register-publish-v3.test.ts tests/unit/hosted-register-publish.test.ts tests/integration/hosted-register-publish.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API boot: the question-language decider with the shape row — preview gate, hosted key or eld alone; both publishers carry the optional row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Also `git add tests/unit/preview-release-artifacts.test.ts` and `tests/unit/preview-auth-dev-operator.test.ts` by name if this task touched them.

---
### Task 13: Judge, review, panel, answer writer and answer checker take the locked language

Every judge-side call and both answer calls gain an optional `questionLanguage`. Without it, the bytes are today's. With it:
- the instruction ends with the named sentence instead of today's directive;
- the material ends with the field `question_language`;
- the reply check is the locked one.

No sealed fingerprint moves: `JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT`, the composer and the conformance hash are built from the contracts WITHOUT the directive, and material is not fingerprinted.

**Money (pre-flight PF-L38, BLOCKER, never under-count).** A locked request is LONGER than today's: the named sentence is longer than today's directive, and the field rides on top. Two prices are built from today's framing and must frame the lock:
- **Root 0's room** (P2b ruling T12-R0): `rootZeroKeepRoomMicros` is sized by `rootZeroRequestBytes` (`apps/runner/src/map-stage.ts`), which calls `rootPositionRequestBytesBound` (`packages/judgement/src/index.ts`) with today's directive and no field. Both gain `questionLanguage?: QuestionLanguage | null`. The P2b fix wave (ruling T12-R3) changes the room to root 0's FIRST attempt plus ONE retry at `lengthRetryTokenCeiling(tc, 1)` (and the larger of that and a format-repair request), at root 0's seat price: every request-bytes bound the room uses after that wave, the first attempt's, the retry's and the repair's, frames with the lock. Task 17 passes the run's lock at the call site(s).
- **B9's first-call price** (`firstPositionCallProjections`, the API boot's `run-ceiling-covers-one-call` check, `apps/api/src/main.ts` ~659): it frames the primary root with the fallback directive. It gains `questionLanguageLocked?: boolean`: with `true` it frames BOTH today's form and the lock of `questionLanguageForBounds()` (Task 1: the longest name the kernel can lock) and keeps the larger; with `false` or absent it is today's number exactly. main.ts passes `questionLanguageLocked: debateShapeInForcePolicy !== null` (the boot reads the shape row at ~630, before B9). (Decision of the corrections pass: row absent stays today's number.)

**Files:**
- Modify: `packages/judgement/src/index.ts`:
  - `promptContractInArgumentLanguage`, `judgeLegMaterial` (a 4th parameter), `framedJudgePrompt` (+ its test seam);
  - `JudgeInput`, `JudgeSubjectInput` (both gain `readonly questionLanguage?: QuestionLanguage`);
  - `review`, `assess`;
  - the three `replyLanguageCheck(...)` calls;
  - `rootPositionRequestBytesBound` (gains `questionLanguage`) and `firstPositionCallProjections` (gains `questionLanguageLocked`) — PF-L38.
- Modify: `apps/runner/src/index.ts`:
  - the runner's own `promptContractInArgumentLanguage`, `buildSynthesisRolePrompt`;
  - `ComposedCitationContext` (gains `questionLanguage?`), `classifyComposedContent`, `classifyEvaluatorContent` (gains a 4th parameter).
- Modify: `apps/runner/src/map-stage.ts`: `rootZeroRequestBytes` (and any repair or retry bound the P2b fix wave adds beside it) gains `questionLanguage?: QuestionLanguage | null` and forwards it (PF-L38).
- Modify: `apps/api/src/main.ts`: the B9 call passes `questionLanguageLocked: debateShapeInForcePolicy !== null` (PF-L38).
- Modify: `acceptance/moment-tools.ts`: moment replay reads a trailing `question_language` field (pre-flight PF-L39).
- Test: `tests/unit/question-language-prompts.test.ts` (create); cases added to `tests/unit/map-root-zero-room.test.ts`, `tests/unit/b9-boot-check.test.ts` and `tests/unit/a18-moment-tools.test.ts`.

**Interfaces:**
```ts
// packages/judgement
JudgeInput.questionLanguage?: QuestionLanguage; JudgeSubjectInput.questionLanguage?: QuestionLanguage;   // review/panel inputs extend JudgeSubjectInput
framedJudgePromptForTest(leg, questionLine, argumentLanguageName, claim, questionLanguage?: QuestionLanguage | null): FramedPrompt;
function judgeLegMaterial(leg, questionLine, declared, questionLanguage: QuestionLanguage | null = null);   // private; the lock is the 4th parameter, after `declared` (PF-L42)
rootPositionRequestBytesBound(input: { questionLine; argumentLanguageName; completionTokenCeiling; assignedMaterialChars;
  questionLanguage?: QuestionLanguage | null }): number;
firstPositionCallProjections(input: { targets; judgeTokenCeiling; questionMaxBytes; questionLanguageLocked?: boolean }): …;
// apps/runner/src/map-stage.ts
rootZeroRequestBytes(input: { questionLine; argumentLanguageName; completionTokenCeiling; questionLanguage?: QuestionLanguage | null }): number;
// apps/runner
buildSynthesisRolePrompt(request, argumentLanguageName, randomBytes?, answerWords?, questionLanguage?: QuestionLanguage | null): FramedPrompt;
ComposedCitationContext.questionLanguage?: QuestionLanguage;
classifyEvaluatorContent(content, reply?, questionLine?, questionLanguage?: QuestionLanguage | null): ContentClassification;
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-prompts.test.ts`:

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { questionLanguageSentence } from "@debateai/kernel";
import { readPromptFrame, type ProviderGateway } from "@debateai/providers";
import {
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT, Judge, framedJudgePromptForTest, rootPositionRequestBytesBound
} from "@debateai/judgement";
import { buildSynthesisRolePrompt, classifyEvaluatorContent } from "../../apps/runner/src/index.js";
import { synthesisRequestFixture } from "../support/synthesisRequestFixture.js";

/** The judge hash after P2b (Task 0 Step 3 printed it): P2L must not move it. */
const JUDGE_HASH_AFTER_P2B = "<paste the value Task 0 Step 3 printed>";
const RO = { code: "ro", name: "Romanian" };
const fixed = () => Buffer.alloc(16, 7);
const systemOf = (packet: { messages: readonly { role: string; content: string }[] }) => packet.messages.find((m) => m.role === "system")!.content;

async function firstPacket(run: (gateway: ProviderGateway) => Promise<unknown>) {
  let captured: unknown;
  const gateway = { call: async (request: { packet: unknown }) => { captured = request.packet; throw new Error("captured"); } } as unknown as ProviderGateway;
  await run(gateway).catch(() => undefined);
  return captured as { messages: readonly { role: string; content: string }[] };
}

describe("judge-side and answer calls in the locked language (question-language spec 2026-10-13, L6)", () => {
  it("no sealed judge fingerprint moves", () => {
    expect(createHash("sha256").update(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT).digest("hex")).toBe(JUDGE_HASH_AFTER_P2B);
  });

  it("a judge leg without a lock is today's packet; with one it carries the sentence and the field, last", () => {
    const leg = { kind: "support" as const, positionUnderDebate: "P" };
    const today = framedJudgePromptForTest(leg, "Q?", "Romanian", "unknown");
    const none = framedJudgePromptForTest(leg, "Q?", "Romanian", "unknown", null);
    // Pre-flight PF-L41(a): the system text ends heading, fence, canary, end — drop the last THREE lines (the fence and
    // canary differ per call), and compare the material fields too.
    expect(systemOf(none.packet).split("\n").slice(0, -3)).toEqual(systemOf(today.packet).split("\n").slice(0, -3));
    expect(readPromptFrame(none.packet).fields).toEqual(readPromptFrame(today.packet).fields);
    const locked = readPromptFrame(framedJudgePromptForTest(leg, "Q?", "Romanian", "unknown", RO).packet);
    expect(locked.fields.map((field) => field.name)).toEqual(["question_line", "position_under_debate", "question_language"]);
    expect(locked.fields.at(-1)!.content).toBe('{"code":"ro","name":"Romanian"}');
    const system = systemOf(framedJudgePromptForTest(leg, "Q?", "Romanian", "unknown", RO).packet);
    expect(system).toContain(questionLanguageSentence(RO));
    expect(system).not.toContain("the language of the question");
  });

  it("review and panel calls carry the same sentence and field when locked", async () => {
    const reviewPacket = await firstPacket((gateway) => new Judge(gateway).review({ runId: null, subjectItemId: "s", callSiteKey: "REVIEW:x",
      questionLine: "Q?", argumentLanguageName: "Romanian", questionLanguage: RO, statement: "S", authorMaker: "a", providerRef: "p",
      contractHash: "h", bound: { maxAttempts: 1, tokenCeiling: 1024, deadlineMs: 1000 }, edges: [] } as never));
    const panelPacket = await firstPacket((gateway) => new Judge(gateway).assess({ runId: null, subjectItemId: "s", callSiteKey: "PANEL:x",
      questionLine: "Q?", argumentLanguageName: "Romanian", questionLanguage: RO, statement: "S", authorMaker: "a", providerRef: "p",
      contractHash: "h", bound: { maxAttempts: 1, tokenCeiling: 1024, deadlineMs: 1000 } } as never));
    for (const packet of [reviewPacket, panelPacket]) {
      expect(systemOf(packet)).toContain(questionLanguageSentence(RO));
      expect(readPromptFrame(packet as never).fields.at(-1)!.name).toBe("question_language");
    }
    // PF-L41(a): unlocked review and panel calls send today's fields.
    const unlockedReview = await firstPacket((gateway) => new Judge(gateway).review({ runId: null, subjectItemId: "s", callSiteKey: "REVIEW:x",
      questionLine: "Q?", argumentLanguageName: "Romanian", statement: "S", authorMaker: "a", providerRef: "p",
      contractHash: "h", bound: { maxAttempts: 1, tokenCeiling: 1024, deadlineMs: 1000 }, edges: [] } as never));
    expect(readPromptFrame(unlockedReview as never).fields.map((field) => field.name)).not.toContain("question_language");
  });

  it("PF-L38: root 0's room frames the lock — today's bound without it, the locked worst case with it", () => {
    const input = { questionLine: "Q?", argumentLanguageName: "Romanian", completionTokenCeiling: 1024, assignedMaterialChars: { answer: 480, points: 4624 } };
    const unlocked = rootPositionRequestBytesBound(input);
    expect(rootPositionRequestBytesBound({ ...input, questionLanguage: null })).toBe(unlocked);
    const locked = rootPositionRequestBytesBound({ ...input, questionLanguage: RO });
    expect(locked).toBeGreaterThan(unlocked);
    const legs = [{ kind: "primary-root" }, { kind: "assigned-root", assignedAnswer: "\u0001".repeat(480), mapPoints: "\u0001".repeat(4624) }] as const;
    const worst = Math.max(...legs.flatMap((leg) => (["unknown", "resolved"] as const).map((claim) => Buffer.byteLength(JSON.stringify({
      model: "", max_tokens: 1024, messages: framedJudgePromptForTest(leg as never, "Q?", "Romanian", claim, RO).packet.messages }), "utf8"))));
    expect(locked).toBe(worst);
  });

  it("the answer writer: no lock is today's packet byte for byte; a lock adds the sentence and the field", () => {
    const request = synthesisRequestFixture();
    const today = buildSynthesisRolePrompt(request, "Romanian", fixed);
    expect(buildSynthesisRolePrompt(request, "Romanian", fixed, null, null).packet).toEqual(today.packet);
    const locked = buildSynthesisRolePrompt(request, "Romanian", fixed, null, RO);
    expect(systemOf(locked.packet)).toContain(questionLanguageSentence(RO));
    expect(readPromptFrame(locked.packet).fields.at(-1)!.name).toBe("question_language");
  });

  it("PF-L40: a lengthed writer call with a lock keeps answer_length, and question_language rides LAST", () => {
    const request = synthesisRequestFixture();   // a SYNTHESIZER request
    const names = readPromptFrame(buildSynthesisRolePrompt(request, "Romanian", fixed, 300, RO).packet).fields.map((field) => field.name);
    expect(names.slice(-2)).toEqual(["answer_length", "question_language"]);
    expect(readPromptFrame(buildSynthesisRolePrompt(request, "Romanian", fixed, 300, null).packet).fields.at(-1)!.name).toBe("answer_length");
  });

  it("the answer checker's language check reads the lock, not the question (PF-L41(b): a verdict that PARSES)", () => {
    // evaluatorVerdictSchema is strict { satisfied, objection, criteria{5} } (apps/runner/src/index.ts).
    const verdict = JSON.stringify({ satisfied: false,
      objection: "The answer must explain why keeping the national currency protects citizens and the firms of the country.",
      criteria: { fairness_to_losers: true, statement_label_agreement: true, no_overstatement: true, restatement: true, citation_tracing: true } });
    const englishQuestion = "Should Romania drop the leu and adopt the euro as soon as possible?";
    expect(classifyEvaluatorContent(verdict, undefined, englishQuestion, null).parseStatus).toBe("PARSED");
    expect(classifyEvaluatorContent(verdict, undefined, englishQuestion, RO).parseStatus).toBe("SCHEMA_FAILED");
  });
});
```

Notes on the test:
- If `synthesisRequestFixture` lives elsewhere, find it with `grep -rn "export function synthesisRequestFixture" tests/support`. It must be a SYNTHESIZER request (the length variant applies only to the writer).
- The checker case's two lines are the proof: today's check (no lock) PARSES the English verdict for the English question; the locked check refuses it. If a language refusal is classed under another status than `SCHEMA_FAILED` today, use that status in both places of the second line and say so in the commit message.
- The first judge case compares the system message without its last THREE lines (PF-L41(a)).

Also add, in the existing files:
- `tests/unit/map-root-zero-room.test.ts`: `rootZeroRequestBytes({ …, questionLanguage: RO })` is larger than without, and equals `rootPositionRequestBytesBound({ …, assignedMaterialChars: rootZeroMapMaterialChars, questionLanguage: RO }) + ROOT_ZERO_BODY_ALLOWANCES.modelIdBytes`; with `null` it is today's value. If the P2b fix wave (T12-R3) added a retry or repair bound beside it, the same two assertions for each.
- `tests/unit/b9-boot-check.test.ts`: `firstPositionCallProjections({ …, questionLanguageLocked: false })` equals today's call without the member; with `true`, every projection's `requestBytes` is at least the bytes of the primary-root request framed with `questionLanguageForBounds()` and larger than today's.
- `tests/unit/a18-moment-tools.test.ts`: the replay case of PF-L39 (Step 3).

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-prompts.test.ts`

- [ ] **Step 3: Implement**

`packages/judgement/src/index.ts`:

```ts
function promptContractInArgumentLanguage(
  contract: PromptContract,
  argumentLanguageName: string | undefined,
  questionLanguage?: QuestionLanguage | null
): PromptContract {
  return Object.freeze({
    ...contract,
    instruction: questionLanguage === null || questionLanguage === undefined
      ? `${contract.instruction} ${argumentLanguageDirective(argumentLanguageName ?? "the same language as the question")}`
      : `${contract.instruction} ${questionLanguageSentence(questionLanguage)}`
  });
}
```

- `judgeLegMaterial(leg, questionLine, declared, questionLanguage: QuestionLanguage | null = null)`: the lock is the FOURTH parameter, after `declared` (pre-flight PF-L42; the real signature is `judgeLegMaterial(leg, questionLine, declared)`). Keep the closed-table check on the leg's own fields exactly as it is, then `return Object.freeze(withQuestionLanguageField(fields, questionLanguage));`. Write the comment: "the code-owned language field rides LAST, outside the leg's closed table; it is the run's lock, never model or user text".
- `framedJudgePrompt(leg, questionLine, argumentLanguageName, claim, questionLanguage: QuestionLanguage | null = null)` passes `questionLanguage` to `promptContractInArgumentLanguage` and as `judgeLegMaterial`'s fourth argument.
- `rootPositionRequestBytesBound`: the input gains `questionLanguage?: QuestionLanguage | null`, passed to `framedJudgePrompt` for both legs and both claims (PF-L38).
- `firstPositionCallProjections`: the input gains `questionLanguageLocked?: boolean`; with `true`, the packets are today's two PLUS the two framed with `questionLanguageForBounds()`, and `requestBytes` keeps the largest; otherwise today's two only (PF-L38). Update its doc comment ("It uses the fallback language directive …") to say so.
- `Judge.judge` passes `input.questionLanguage ?? null`.
- `review` and `assess`: pass `input.questionLanguage` to `promptContractInArgumentLanguage`, and wrap their `material: [...]` arrays in `withQuestionLanguageField([...], input.questionLanguage)`.
- The three `replyLanguageCheck(input.questionLine, X)` calls become `replyLanguageCheckFor(input.questionLine, input.questionLanguage, X)`.
- Import `questionLanguageSentence`, `withQuestionLanguageField`, `replyLanguageCheckFor` and `type QuestionLanguage` from `@debateai/kernel`.
- (Replaced by pre-flight PF-L38: `firstPositionCallProjections` frames the lock when `questionLanguageLocked` is true; see above. The old "about 60 bytes" estimate was too low: the named sentence alone is longer than today's directive.)

`apps/runner/src/map-stage.ts`: `rootZeroRequestBytes(input)` gains `questionLanguage?: QuestionLanguage | null` and forwards it to `rootPositionRequestBytesBound`. Find every bound the room uses with `grep -n "rootZeroRequestBytes\|rootPositionRequestBytesBound" apps/runner/src/*.ts` after the P2b fix wave has landed (T12-R3 adds the retry and possibly a repair request): each takes and forwards the lock. Task 17 passes `shapeLanguage` at the call site(s) in `apps/runner/src/index.ts`.

`apps/api/src/main.ts`: in `boot.run("run-ceiling-covers-one-call", …)`, call `firstPositionCallProjections({ …, questionLanguageLocked: debateShapeInForcePolicy !== null })`.

`apps/runner/src/index.ts`:
- Give the runner's local `promptContractInArgumentLanguage(contract, argumentLanguageName, questionLanguage: QuestionLanguage | null = null)` the same body shape.
- `buildSynthesisRolePrompt` gains the fifth parameter `questionLanguage: QuestionLanguage | null = null`, used for the contract and for the material. The material is today's ONE projection (`const material = toSynthesisPromptMaterial(request)`, V-MINIMUM-PAYLOAD: applied once), wrapped around P2b's length field so that `question_language` rides LAST (pre-flight PF-L40): `material: withQuestionLanguageField(lengthed ? [...material, synthesizerAnswerLengthField(answerWords)] : material, questionLanguage)`. With `null`, `withQuestionLanguageField` returns its input array itself, so the packet is byte-identical. Task 17 updates P2b's `fields.at(-1)` pin on `answer_length` in `tests/integration/debate-shape-run.test.ts` (~594 today).
- `ComposedCitationContext` gains `readonly questionLanguage?: QuestionLanguage;`. In `classifyComposedContent`, replace `replyLanguageCheck(citation.questionLine, COMPOSED_PROSE)` with `replyLanguageCheckFor(citation.questionLine, citation.questionLanguage, COMPOSED_PROSE)`.
- `classifyEvaluatorContent(content, reply?, questionLine?, questionLanguage: QuestionLanguage | null = null)` uses `replyLanguageCheckFor(questionLine, questionLanguage, EVALUATOR_PROSE)`.

`acceptance/moment-tools.ts` (pre-flight PF-L39): `builderFromRecordedPacket` rebuilds a JUDGE_JUDGE moment through `judgeLegFrameSpec` and refuses (`MOMENT_CONTRACT_MISMATCH`) unless the recorded `frame.fields` equal `spec.materialFields`, so a locked moment would be refused. For every family that can carry the field (JUDGE_JUDGE, JUDGE_REVIEW, JUDGE_ASSESS, SYNTHESIS_WRITER, SYNTHESIS_CHECKER):
- add `questionLanguage: z.object({ code: z.string(), name: z.string() }).strict().optional()` to its input schema (`JudgeJudgeInputsSchema`, `JudgeReviewInputsSchema`, `JudgeAssessInputsSchema`, `SynthesisWriterInputsSchema`, `SynthesisCheckerInputsSchema`), absent on every older moment so their ids are unchanged;
- before any field comparison, when the LAST recorded field is `question_language`, parse its JSON content into `questionLanguage` and drop that field from the list the comparisons read (the writer's `answer_length` check then reads the field before it);
- pass `questionLanguage` on to the framers when the builder is invoked (`invokeMomentBuilder` / `captureMomentPacket`: `framedJudgePrompt`'s fifth argument, the review and panel inputs, `buildSynthesisRolePrompt`'s fifth argument);
- add a replay case to `tests/unit/a18-moment-tools.test.ts`: a locked judge leg's recorded packet replays to the same packet, and an unlocked one keeps its id.

Implementer note (pre-flight PF-L43): the directive is added at call time (`judgement` ~261–271); it is not part of `JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT` (`prompts.ts` ~237–260), `SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT` or the evaluator fingerprint (`runner` ~686–693). So aac53407… and 9a46af29… stay, and this task needs no new register version; the hash pin in the test is the right guard. `runReviewCatchUp` (`apps/runner/src/index.ts` ~1753) also builds a review input, but nothing in production calls it (only two unit tests): leave it unlocked.

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-prompts.test.ts`
- `pnpm exec vitest run tests/unit/judge-shape-legs.test.ts`
- `pnpm exec vitest run tests/unit/synthesizer-length.test.ts`
- `pnpm exec vitest run tests/unit/a17-synthesis-role-prompt.test.ts`
- `pnpm exec vitest run tests/unit/prompt-injection-corpus.test.ts`
- `pnpm exec vitest run tests/unit/map-root-zero-room.test.ts`
- `pnpm exec vitest run tests/unit/b9-boot-check.test.ts`
- `pnpm exec vitest run tests/unit/s2-first-call-plan-models.test.ts`
- `pnpm exec vitest run tests/unit/a18-moment-tools.test.ts`
- `pnpm exec vitest run tests/unit/a18-replay-moment.test.ts`
- the architecture guards (Global Constraints): `pnpm exec vitest run tests/unit/prompt-surface-guard.test.ts`, then `pnpm exec vitest run tests/unit/call-lane-gateway.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/judgement/src/index.ts apps/runner/src/index.ts apps/runner/src/map-stage.ts apps/api/src/main.ts acceptance/moment-tools.ts tests/unit/question-language-prompts.test.ts tests/unit/map-root-zero-room.test.ts tests/unit/b9-boot-check.test.ts tests/unit/a18-moment-tools.test.ts
git commit -m "Judgement and answer calls: the locked language as one named sentence and a last material field; today's bytes without it; root 0's room and B9 frame the lock; replay reads the field

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The record `LANGUAGE_PLANNER_DISAGREES` — an operator-only map note, never a condition mark

Ruling CR-3 (amendment 2026-10-13): the planner's disagreement is measurement only and never reaches people — not the
honesty drawer, not the story, not any page (rule: no engine internals in user-facing text). The kernel's condition marks
have no operator-only kind (every one is shown with a label), so this record is NOT added to `CONDITION_MARKS`. It is a
map NOTE, the map's existing operator channel: `MAP_NOTES` already holds `LIST_REASSIGNED`, `GAP_SKIPPED` and the
rest. Notes travel inside the map result, which P2b stores with the run's map choice (`core.map_choice` content, encrypted
with the run's content) and reads back with `readMapResultForRun`; P2b's `mapConditionRecords` converts marks only,
never notes, and P2b's `MapChoiceRecord` (what pages read) carries no notes. The practice report (P2d) and operators
read it. So: no kernel, serve, label, locale or pin edit; `CONDITION_MARKS` stays at P2b's 46 and `DEBATE_SHAPE_MARKS`
at eight.

**Files:**
- Modify: `packages/map/src/types.ts` (`MAP_NOTES` += `"LANGUAGE_PLANNER_DISAGREES"`; `MapResult.plannerLanguage`)
- Modify: `tests/unit/map-package.test.ts` (it pins the exact `MAP_NOTES` list at ~27; pre-flight PF-L44 — `map-orchestrator.test.ts` never names `MAP_NOTES`)
- Test: `tests/unit/question-language-planner-note.test.ts` (create)

**Interfaces:**
```ts
// packages/map/src/types.ts
export const MAP_NOTES: readonly [..., "LANGUAGE_PLANNER_DISAGREES"];   // appended last
MapResult.plannerLanguage: string | null;   // what the planner named, as a primary subtag; null when it named nothing usable
// The record (Task 15 writes it): { note: "LANGUAGE_PLANNER_DISAGREES", step: "ANGLES", detail: "<locked code>:<planner code>" } — codes only
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-planner-note.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONDITION_MARKS, DEBATE_SHAPE_MARKS } from "@debateai/kernel";
import { MAP_MARKS, MAP_NOTES } from "@debateai/map";
import { mapConditionRecords } from "../../apps/runner/src/map-stage.js";

const RECORD = "LANGUAGE_PLANNER_DISAGREES" as const;
const LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

describe("the planner-disagreement record is operator-only (question-language spec 2026-10-13, L7; ruling CR-3)", () => {
  it("is a map note, never a condition mark, a shape mark or a map mark; the kernel's list keeps P2b's 46", () => {
    expect(MAP_NOTES).toContain(RECORD);
    expect(CONDITION_MARKS as readonly string[]).not.toContain(RECORD);
    expect(DEBATE_SHAPE_MARKS as readonly string[]).not.toContain(RECORD);
    expect(MAP_MARKS as readonly string[]).not.toContain(RECORD);
    expect(CONDITION_MARKS).toHaveLength(46);
  });

  it("never becomes a condition record on the answer", () => {
    const records = mapConditionRecords({ marks: [], notes: [{ note: RECORD, step: "ANGLES", detail: "ro:fr" }] } as never, "run-1", "node-0");
    expect(records).toEqual([]);
  });

  it("has no label and no text in any locale (nothing to show)", () => {
    for (const locale of LOCALES) {
      const text = readFileSync(new URL(`../../apps/ui/messages/${locale}/debateChrome.json`, import.meta.url), "utf8");
      expect(text, locale).not.toMatch(/languagePlannerDisagrees|LANGUAGE_PLANNER_DISAGREES/u);
    }
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-planner-note.test.ts`

Expected: FAIL (the note is not in `MAP_NOTES` yet).

- [ ] **Step 3: Implement**

`packages/map/src/types.ts`:
- append `"LANGUAGE_PLANNER_DISAGREES"` as the LAST element of `MAP_NOTES`, with the comment
  `// Question language (spec 2026-10-13, L7; ruling CR-3): the angle planner named another language than the lock. Measurement only, for operators: never a condition mark, never shown, never acted on.`;
- add `plannerLanguage: string | null;` to `MapResult`, after `stoppedBy` (P2b), with the doc comment
  `/** What the angle planner named in question_language, as a primary subtag; null when it named nothing usable (operators only). */`.
  Every place that builds a `MapResult` sets it (Task 15 sets the real value; give every other return path `null`).

In `tests/unit/map-package.test.ts` (~27), append `"LANGUAGE_PLANNER_DISAGREES"` to the pinned list
`["LIST_REASSIGNED", "LIST_DROPPED", "MERGE_ITEMS_KEPT", "GAP_SKIPPED", "GAP_STOPPED", "MAP_STOPPED"]`. Nothing else changes: no kernel, serve, UI,
locale or pin file (P2b's 46 stays).

Implementer note (pre-flight PF-L45): no database change is needed. `writeMapRun` stores `result` as `z.unknown()` (`packages/map/src/repository.ts` ~55–59, ~143–144), and 0116's CHECKs do not cover notes. "Encrypted per run" holds only for content-encrypted runs; legacy runs store plaintext JSON (~166–168). Older stored maps read back with `plannerLanguage` undefined, not null: readers treat both as "nothing named". `mapConditionRecords` maps `result.marks` only (`apps/runner/src/map-stage.ts` ~150), so `CONDITION_MARKS` stays at 46.

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-planner-note.test.ts`
- `pnpm exec vitest run tests/unit/map-package.test.ts`
- `pnpm exec vitest run tests/unit/map-orchestrator.test.ts`
- `pnpm exec vitest run tests/unit/debate-shape-marks.test.ts` (P2b's 46 marks, unchanged)

- [ ] **Step 5: Commit**

```bash
git add packages/map/src/types.ts tests/unit/question-language-planner-note.test.ts tests/unit/map-package.test.ts
git commit -m "Map: LANGUAGE_PLANNER_DISAGREES is an operator-only map note (never a condition mark) and MapResult.plannerLanguage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Also `git add` by name any file under `packages/map/src` that Step 3 touched to give a `MapResult` its `plannerLanguage: null`.

---

### Task 15: The map speaks the locked language; the planner names the language FIRST; a disagreement is one operator-only note

The map only runs in shape runs (and Phase 1's `openings` practice, whose questions carry fixed `ro`/`en` tags). So the map switches to the locked form for every call, keyed on its context's tag. A tag of `"und"` keeps today's directive and expectation, which can happen only in old practice data.

**Files:**
- Modify:
  - `packages/map/src/prompts.ts`: `MAP_ANSWER_FORMS.angles` (code-owned) gains the first field and the request to fill it; `mapContractInLanguage` takes the language. `MAP_DEFAULT_INSTRUCTIONS.angles` (owner-editable text) is NOT edited (pre-flight PF-L48: an owner edit must not be able to drop the request).
  - `packages/map/src/specs.ts`: `mapSpecOf` appends the field and uses the locked language.
  - `packages/map/src/replies.ts`: `mapAnglesReplySchema` gains an optional `question_language`.
  - `packages/map/src/orchestrator.ts`: `replyLanguage` from the lock; the planner comparison and its note (Task 14 added the note and `MapResult.plannerLanguage`).
- Modify tests whose scripted ANGLES replies or hash pins change: `grep -rln "mapPromptContractHash\|map.angles.v1" tests` lists them. A hash pin is re-pinned to the new printed value. A scripted reply needs no change (the field is optional).
- Modify (pre-flight PF-L47; they go red otherwise):
  - `tests/unit/map-prompts.test.ts` (~41–45): the case "appends the argument-language directive to the instruction" calls the two-argument `mapContractInLanguage(listOpen, "Romanian")`; make it `mapContractInLanguage(listOpen, null, "Romanian")` (no lock: today's directive, still `argumentLanguageDirective("Romanian")` at the end), and add one line for the lock: `mapContractInLanguage(listOpen, { code: "ro", name: "Romanian" }, "Romanian").instruction.endsWith(questionLanguageSentence({ code: "ro", name: "Romanian" }))`.
  - `tests/unit/map-specs.test.ts` (~91–93): every step's material names gain `,question_language` at the end (the suite's context has a real tag); (~96–99) "asks every step in the question's language" now expects `questionLanguageSentence({ code: <the context's tag>, name: <its name> })` instead of `argumentLanguageDirective("English")`, unless the suite's context tag is `"und"` (then today's directive stays).
- Test: `tests/unit/map-question-language.test.ts` (create)

**Interfaces:**
```ts
// packages/map
export function mapLockedLanguage(ctx: Pick<MapSpecContext, "languageTag" | "languageName">): QuestionLanguage | null; // null for "und"
export function mapContractInLanguage(contract: PromptContract, language: QuestionLanguage | null, languageName: string): PromptContract;
MapResult.plannerLanguage: string | null;   // (Task 14) what the planner named, normalised to its primary subtag; null when absent
// MapNoteRecord { note: "LANGUAGE_PLANNER_DISAGREES", step: "ANGLES", detail: "<locked>:<planner>" } — a NOTE (CR-3), never a mark
```

- [ ] **Step 1: Write the failing test** `tests/unit/map-question-language.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { questionLanguageSentence } from "@debateai/kernel";
import { readPromptFrame } from "@debateai/providers";
import {
  MAP_ANSWER_FORMS, mapAnglesReplySchema, mapAnglesSpec, mapListSpec, mapProviderPieces, mapPromptContractHash, mapRunAngleMap,
  type MapCallOutcome, type MapCaller, type MapCallRequest
} from "@debateai/map";

const RO_CTX = { questionLine: "Ar trebui România să adopte euro?", languageName: "Romanian", languageTag: "ro" };
const ANGLES = (language?: string) => JSON.stringify({ ...(language === undefined ? {} : { question_language: language }), angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "Cealaltă parte", focus: "Argumentele împotrivă." },
  { angle_id: "grija", kind: "ASKER_WORRY", label: "Grija", focus: "De ce se teme cel care întreabă." },
  { angle_id: "fapte", kind: "PRACTICAL", label: "Ce e de făcut", focus: "Primul pas concret." },
  { angle_id: "cost", kind: "SPECIFIC", label: "Costul", focus: "Cine plătește trecerea." }] });

describe("the map in the locked language (question-language spec 2026-10-13, L6, L7)", () => {
  it("every step carries the named sentence and the field, last", () => {
    for (const spec of [mapAnglesSpec(RO_CTX as never), mapListSpec(RO_CTX as never, null)]) {
      const frame = readPromptFrame(mapProviderPieces(spec).framed.packet);
      expect(frame.fields.at(-1)).toEqual({ name: "question_language", content: '{"code":"ro","name":"Romanian"}' });
      expect(spec.contract.instruction).toContain(questionLanguageSentence({ code: "ro", name: "Romanian" }));
      expect(spec.contract.instruction).not.toContain("the language of the question");
    }
  });

  it("the planner's answer form puts question_language FIRST; the reader accepts a reply without it", () => {
    expect(MAP_ANSWER_FORMS.angles.indexOf('"question_language"')).toBeLessThan(MAP_ANSWER_FORMS.angles.indexOf('"angles"'));
    expect(mapAnglesReplySchema.safeParse(JSON.parse(ANGLES("ro"))).success).toBe(true);
    expect(mapAnglesReplySchema.safeParse(JSON.parse(ANGLES())).success).toBe(true);
    expect(mapPromptContractHash()).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("a planner that names another language is ONE operator-only note (no mark), and every later call stays in the locked language", async () => {
    const seen: MapCallRequest<unknown>[] = [];
    const caller: MapCaller = { call: async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
      seen.push(request as MapCallRequest<unknown>);
      return request.step === "ANGLES"
        ? { kind: "OK", value: request.spec.read(ANGLES("fr")) } as MapCallOutcome<T>
        : { kind: "FAILED", code: "TEST_STOP" } as MapCallOutcome<T>;
    } };
    const result = await mapRunAngleMap({ ...RO_CTX, seats: [{ aiRef: "a", maker: "ma" }, { aiRef: "b", maker: "mb" }], caller, seed: "q1",
      gapRoundsMax: 1, maxAnswers: 2, pointsPerAnswer: 2 } as never);
    expect(result.plannerLanguage).toBe("fr");
    expect(result.notes.filter((note) => note.note === "LANGUAGE_PLANNER_DISAGREES")).toEqual([
      { note: "LANGUAGE_PLANNER_DISAGREES", step: "ANGLES", detail: "ro:fr" }]);
    expect(result.marks.some((mark) => (mark.mark as string) === "LANGUAGE_PLANNER_DISAGREES")).toBe(false);
    for (const request of seen.slice(1)) expect(request.spec.contract.instruction).toContain("in Romanian, the language this debate was set to");
  });

  it("the same language, a regional form, 'unknown' or nothing: no note", async () => {
    for (const named of ["ro", "ro-RO", "unknown", undefined]) {
      const caller: MapCaller = { call: async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => request.step === "ANGLES"
        ? { kind: "OK", value: request.spec.read(ANGLES(named)) } as MapCallOutcome<T>
        : { kind: "FAILED", code: "TEST_STOP" } as MapCallOutcome<T> };
      const result = await mapRunAngleMap({ ...RO_CTX, seats: [{ aiRef: "a", maker: "ma" }, { aiRef: "b", maker: "mb" }], caller, seed: "q1",
        gapRoundsMax: 1, maxAnswers: 2, pointsPerAnswer: 2 } as never);
      expect(result.notes.some((note) => note.note === "LANGUAGE_PLANNER_DISAGREES"), String(named)).toBe(false);
    }
  });
});
```

The angle-map entry point is `mapRunAngleMap(input: MapRunInput)` (`packages/map/src/orchestrator.ts` ~306; pre-flight PF-L46: there is no `runMapArm`). `MapRunInput` is `{ questionLine, languageName, languageTag, seats, caller, seed, gapRoundsMax, maxAnswers, pointsPerAnswer, contracts?, abandon? }` — no arm argument. Use the `MapCallOutcome` shapes the package defines; adapt only names, never the assertions.

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/map-question-language.test.ts`

- [ ] **Step 3: Implement**

`packages/map/src/prompts.ts`:
- Leave `MAP_DEFAULT_INSTRUCTIONS.angles` as it is (owner-editable text; pre-flight PF-L48).
- Make the code-owned `MAP_ANSWER_FORMS.angles` start its object with the field and carry the request itself: replace `{ "angles": [` with `{ "question_language": FIRST, the two-letter ISO 639-1 code of the language the question in question_line is written in, in lower case, "angles": [`.
- Replace `mapContractInLanguage` with:

```ts
/** The contract a call sends: the instruction, then the locked language's one sentence (today's directive only for "und"). */
export function mapContractInLanguage(contract: PromptContract, language: QuestionLanguage | null, languageName: string): PromptContract {
  return Object.freeze({ ...contract, instruction: `${contract.instruction}\n\n${languageDirectiveFor(languageName, language)}` });
}
```

`packages/map/src/specs.ts`:
- add `export function mapLockedLanguage(ctx) { return ctx.languageTag === "und" ? null : questionLanguageFromRun(ctx.languageTag, ctx.languageName); }`;
- in `mapSpecOf`, use `mapContractInLanguage(…[name], mapLockedLanguage(ctx), ctx.languageName)` and `material: withQuestionLanguageField(material, mapLockedLanguage(ctx))` (then freeze as today).

`packages/map/src/replies.ts`: `mapAnglesReplySchema` gains `question_language: z.string().trim().min(1).max(35).optional()`. The prose patterns of `mapAnglesCheck` never include it (it is a code).

`packages/map/src/orchestrator.ts`:
- In the `MapRun` constructor, set `const lock = mapLockedLanguage(input);` and `replyLanguage: lock === null ? replyLanguageExpectation(input.questionLine) : lockedReplyLanguageExpectation(lock, input.questionLine)` (no non-null assertion: `questionLanguageFromRun` returns null for a stored fallback name, and that must fall back, not crash; pre-flight PF-L48). Keep the R-5 comment and add "(question-language spec 2026-10-13: the lock, never a re-guess)".
- Where the ANGLES reply is accepted, compute `const named = reply.question_language === undefined ? null : mapPrimarySubtag(reply.question_language);`. Keep `named` when `questionLanguageOf(named) !== null`, else `null`, and set it as the result's `plannerLanguage`.
- When `named !== null && named !== mapPrimarySubtag(input.languageTag) && input.languageTag !== "und"`, record ONE note: `run.mapNote("LANGUAGE_PLANNER_DISAGREES", "ANGLES", `${mapPrimarySubtag(input.languageTag)}:${named}`)` (codes only; ruling CR-3: a note, never a mark). Nothing else reads `named`.
- Set `MapResult.plannerLanguage` (Task 14) to `named` on every return path after the planner's reply was accepted, and `null` where none was.

P2b's `mapConditionRecords` converts marks only (P2b amendment 2026-10-13, P2L amendment 4), so the note never reaches the answer. Confirm with `grep -n "result.marks" apps/runner/src/map-stage.ts` (one line, and no `notes` there). Task 14's test pins it.

Print the new map hash and re-pin every test that pins it:

`pnpm exec tsx -e 'import {mapPromptContractHash} from "@debateai/map"; console.log(mapPromptContractHash())'`

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/map-question-language.test.ts`
- `pnpm exec vitest run tests/unit/map-prompts.test.ts`
- `pnpm exec vitest run tests/unit/map-specs.test.ts`
- `pnpm exec vitest run tests/unit/map-replies.test.ts`
- `pnpm exec vitest run tests/unit/map-orchestrator.test.ts`
- `pnpm exec vitest run tests/unit/map-multilingual.test.ts`
- `pnpm exec vitest run tests/unit/map-stage.test.ts`
- `pnpm exec vitest run tests/unit/practice-openings-log.test.ts`

- [ ] **Step 5: Commit** (name every file; owner sessions share the worktree, so never `git add packages/map tests/unit`; pre-flight PF-L48)

Implementer note (pre-flight PF-L48): `mapAnglesReplySchema` is `.strict()` (`packages/map/src/replies.ts` ~22–29), so the new test fails first for the right reason (the reader refuses `question_language`). Also `git add` by name each test file whose map hash pin you re-pinned.

```bash
git add packages/map/src/prompts.ts packages/map/src/specs.ts packages/map/src/replies.ts packages/map/src/orchestrator.ts tests/unit/map-question-language.test.ts tests/unit/map-prompts.test.ts tests/unit/map-specs.test.ts
git commit -m "Map: every step in the locked language; the angle planner names the language first; a disagreement is one operator-only note, never a switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: The story in the locked language

**Files:**
- Modify:
  - `packages/story/src/writer.ts` (`StoryWriteInput = StoryRunSnapshot & {…}`, ~158, gains `readonly languageLocked?: true`; it lives in writer.ts, not material.ts — pre-flight PF-L50);
  - `packages/story/src/contracts.ts` (`storyContractInArgumentLanguage(contract, name, questionLanguage?)`);
  - `packages/story/src/writer.ts` (both contracts, the material field, both reply checks);
  - `apps/runner/src/story-snapshot.ts` (`StorySnapshotSource` / `buildStoryRunSnapshot` carry `languageLocked`).
- Test: `tests/unit/story-locked-language.test.ts` (create). NOT `story-question-language.test.ts`: that file already exists (215 lines, the R2 run-read language test, commits b9b878e85 and f40759368) and must not be overwritten (pre-flight PF-L49).

**Interfaces:**
```ts
export function storyContractInArgumentLanguage(contract: PromptContract, argumentLanguageName: string | null,
  questionLanguage?: QuestionLanguage | null): PromptContract;
StoryWriteInput.languageLocked?: true;   // with it, argumentLanguage {tag, name} IS the lock
```

- [ ] **Step 1: Write the failing test** `tests/unit/story-locked-language.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { questionLanguageSentence } from "@debateai/kernel";
import { storyContractInArgumentLanguage, storyContractHash } from "@debateai/story";

const CONTRACT = Object.freeze({ contractId: "story.test.v1", instruction: "Tell the story.", answerForm: "Return JSON." });
const RO = { code: "ro", name: "Romanian" };

describe("the story in the locked language (question-language spec 2026-10-13)", () => {
  it("without a lock: today's contract and today's per-call hash, byte for byte", () => {
    const today = storyContractInArgumentLanguage(CONTRACT, "Romanian");
    expect(storyContractInArgumentLanguage(CONTRACT, "Romanian", null)).toEqual(today);
    expect(storyContractHash(storyContractInArgumentLanguage(CONTRACT, "Romanian", null))).toBe(storyContractHash(today));
  });

  it("with a lock: the one named sentence after a blank line; the per-call hash follows it (recorded, not sealed)", () => {
    const locked = storyContractInArgumentLanguage(CONTRACT, "Romanian", RO);
    expect(locked.instruction).toBe(`Tell the story.\n\n${questionLanguageSentence(RO)}`);
    expect(storyContractHash(locked)).not.toBe(storyContractHash(storyContractInArgumentLanguage(CONTRACT, "Romanian")));
  });
});
```

Add a second `describe` to the existing story writer test (`tests/unit/story-writer.test.ts`), copying its nearest "argumentLanguage" case. With `languageLocked: true` and `argumentLanguage: { tag: "ro", name: "Romanian" }`, it asserts:
- the captured storyteller packet's last material field is `question_language`;
- its system message holds the named sentence;
- a French story body is refused with `TEXT_NOT_IN_QUESTION_LANGUAGE` even though the question line is plain Romanian without diacritics.

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/story-locked-language.test.ts`

- [ ] **Step 3: Implement**
1. **`contracts.ts`:** the third parameter, `questionLanguage?: QuestionLanguage | null`. With it, the instruction is `${contract.instruction}\n\n${questionLanguageSentence(questionLanguage)}`. Without it, today's line.
2. **`writer.ts`:**
   - `const lock = input.languageLocked === true && input.argumentLanguage !== null ? questionLanguageFromRun(input.argumentLanguage.tag, input.argumentLanguage.name) : null;`
   - pass `lock` to both `storyContractInArgumentLanguage` calls;
   - wrap the storyteller's and the checker's `material` in `withQuestionLanguageField(…, lock)`;
   - the two `replyLanguageCheck(input.questionLine, …)` calls become `replyLanguageCheckFor(input.questionLine, lock, …)`.
3. **`story-snapshot.ts`:** `StorySnapshotSource` gains `readonly languageLocked?: boolean`; `buildStoryRunSnapshot` adds `...(source.languageLocked === true ? { languageLocked: true as const } : {})`.

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/story-locked-language.test.ts`
- `pnpm exec vitest run tests/unit/story-question-language.test.ts` (the existing R2 file: unchanged, still green)
- `pnpm exec vitest run tests/unit/story-writer.test.ts`
- `pnpm exec vitest run tests/unit/story-contracts.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/story/src/contracts.ts packages/story/src/writer.ts apps/runner/src/story-snapshot.ts tests/unit/story-locked-language.test.ts tests/unit/story-writer.test.ts
git commit -m "Story: the locked language's one sentence, its field and the locked check; today's story bytes without a lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The runner passes the lock in a shape run; doubles and the harness learn it

**Files:**
- Modify: `apps/runner/src/index.ts`:
  - `execute`: where P2b computes `shapeRun`, add `const shapeLanguage = shapeRun === null ? null : questionLanguageFromRun(run.argumentLanguageTag, run.argumentLanguageName);`
  - the FIVE judge-input sites (P2b final review): `grep -n "argumentLanguageName: run.argumentLanguageName" apps/runner/src/index.ts` lists them — today the panel `assess` (~6136), root 0's room `rootZeroRequestBytes({ questionLine: run.questionLine, argumentLanguageName: run.argumentLanguageName, … })` (~6718), the root `judge` (~7014), the child-leg `judge` (~7244) and the `review` (~7526). The four judge calls also pass `...(shapeLanguage === null ? {} : { questionLanguage: shapeLanguage })`; P2b's shape legs (assigned-root, consideration legs, close-call extras) go through those same sites.
  - root 0's room (pre-flight PF-L38, BLOCKER): `rootZeroRequestBytes({ …, questionLanguage: shapeLanguage })`, and the same for every retry or repair bound the P2b fix wave (ruling T12-R3: root 0's first attempt plus ONE retry at `lengthRetryTokenCeiling(tc, 1)`, and the larger of that and a format-repair request) put beside it. `shapeLanguage` must be computed BEFORE the map stage, where `keepRoomMicros` is sized.
  - both `buildSynthesisRolePrompt(request, run.argumentLanguageName, …)` calls pass `shapeLanguage` as the fifth argument;
  - the composer's citation context gains `...(shapeLanguage === null ? {} : { questionLanguage: shapeLanguage })`;
  - `classifyEvaluatorContent(content, reply, run.questionLine)` becomes `classifyEvaluatorContent(content, reply, run.questionLine, shapeLanguage)`;
  - the story snapshot source gains `languageLocked: shapeLanguage !== null`.
- Modify: `tests/support/preview-gate-stubs.ts`: `LANGUAGE_DIRECTIVE` (~224 today) gains a third alternative that strips the WHOLE named sentence (see Step 3), and is exported through `stripLanguageDirectiveForTest`. Fix the stale comment above it ("English," → "English, the language of the question,"). `stubReplyLanguage` (~113–116) answers `ro` also when the request carries `questionLanguageSentence({ code: "ro", name: "Romanian" })` (pre-flight PF-L52).
- Modify: `tests/support/debate-shape-harness.ts` (P2b): admitted runs already pass `argumentLanguageTag` / `argumentLanguageName` to `startRun` (`preview-debate-harness.ts` ~476–479) and `runShapeDebate(harness, options)` already takes `language?` / `question?` (~136–184): keep them. The scripted `MAP:angles` reply begins with `"question_language": "<tag>"` (only after Task 15, whose reader accepts it). The scripted MAP prose (ANGLES labels and focus, LIST points and candidate answers, ~60–75) follows the request's `question_language` field: Romanian texts when its code is `ro`, today's English otherwise, with every English literal the script compares against (for example `"The other side"`) read from that same per-language table (pre-flight PF-L52; without it every locked Romanian MAP reply is refused `TEXT_NOT_IN_QUESTION_LANGUAGE`).
- Modify: `tests/integration/debate-shape-run.test.ts` (P2b): one new case (Step 1), and P2b's pin `expect(frame.fields.at(-1)).toEqual({ name: "answer_length", … })` (~594 today) becomes a check of the field BEFORE the last when the run is locked (`fields.at(-2)`), with `fields.at(-1)` the `question_language` field (pre-flight PF-L40).
- Test: `tests/unit/runner-question-language.test.ts` (create) and the integration case.

- [ ] **Step 1: Write the failing tests.** `tests/unit/runner-question-language.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { argumentLanguageDirective, questionLanguageSentence } from "@debateai/kernel";
import { stripLanguageDirectiveForTest } from "../support/preview-gate-stubs.js";

// Pre-flight PF-L51 (BLOCKER): the strip pattern is the WHOLE directive in each form, both sentences, because the second
// sentence names "fatalFlags[].type" and would send every review and checker call to PANEL if it stayed. So the inputs
// are the real directives, never hand-written first sentences.
describe("the test doubles read all three language forms", () => {
  it("strips today's named form, today's fallback form, and the locked sentence, whole", () => {
    for (const text of [argumentLanguageDirective("English"), argumentLanguageDirective("Romanian"), argumentLanguageDirective(""),
      questionLanguageSentence({ code: "en", name: "English" }),
      questionLanguageSentence({ code: "sr-Latn", name: "Serbian (Latin script)" })]) {
      const stripped = stripLanguageDirectiveForTest(`Instruction. ${text}`);
      expect(stripped.trim()).toBe("Instruction.");
      expect(stripped).not.toContain("fatalFlags");
    }
  });
});
```

In `tests/integration/debate-shape-run.test.ts`, add this case, written like its existing "a full new-shape debate" case:

```ts
  it("question language: every captured prompt of a shape run carries the locked sentence and field, never the fallback form", async () => {
    const { prompts } = await runShapeDebate(harness, { label: "question-language", language: { tag: "ro", name: "Romanian" }, question: "Ar trebui sa renuntam la leu?" });
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt.system).toContain("in Romanian, the language this debate was set to");
      expect(prompt.system).not.toContain("the same language as the question");
      expect(prompt.fields.at(-1)?.name).toBe("question_language");
    }
    expect(run.result.kind).toBe("COMPLETED");   // the locked Romanian replies are accepted, not refused (PF-L52)
  });
```

(Destructure `run` as well: `const run = await runShapeDebate(…); const { prompts } = run;`.) `prompts` holds every captured FRAMED packet: PROBE requests (`classifyGateRequest` → `"PROBE"`, no frame) are left out (PF-L52).

`runShapeDebate(harness, options)` is the harness function P2b Task 15 exports from `tests/support/debate-shape-harness.ts` (P2b pre-flight PF-B53); `harness` is the suite's own `previewDebateHarness(...)`, already in scope in `debate-shape-run.test.ts`, and `runShapeDebate` is imported there next to `scriptedShapeAnswers`. Its options already include `language?` and `question?` (both reach `admittedRun`). Add only `prompts` (every captured framed packet as `{ system, fields }`, read with `readPromptFrame`, PROBE requests left out) to its result (`ShapeDebateRun`).

Implementer note (pre-flight PF-L52): the scripted answers are keyed by a digest of each request (`tests/support/scripted-answers.ts` ~30–38), so every locked shape prompt gets a different scripted level than before. Re-run the WHOLE `tests/integration/debate-shape-run.test.ts` after Step 3 and treat every red as real until traced; do not assume the old cases stay green.

- [ ] **Step 2: Run them and expect FAIL**

Run: `pnpm exec vitest run tests/unit/runner-question-language.test.ts`

Then, alone: `pnpm exec vitest run tests/integration/debate-shape-run.test.ts -t "question language"`

- [ ] **Step 3: Implement.**

In `tests/support/preview-gate-stubs.ts`, build the third alternative exactly like the first two (pre-flight PF-L51): today the pattern is `new RegExp([argumentLanguageDirective("\u0000"), argumentLanguageDirective("")].map((directive) => directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\u0000", "[^.]+?")).join("|"), "gu")`. Add `questionLanguageSentence({ code: "x", name: "\u0000" })` to that list (the same escaping and the same `\u0000` → `[^.]+?` replacement), so the WHOLE named sentence, both its sentences, is removed. Never use fragment patterns: they leave the second sentence and its "fatalFlags" behind.

Export the stripping as `stripLanguageDirectiveForTest(text) => text.replace(LANGUAGE_DIRECTIVE, "")`, the same expression `classifyGateRequest` applies (~251; one implementation, two names). Teach `stubReplyLanguage` the locked Romanian sentence (Files). Then make the runner edits listed under Files.

- [ ] **Step 4: Run and expect PASS.** The same two commands, then the architecture guards one at a time (`pnpm exec vitest run tests/unit/prompt-surface-guard.test.ts`, then `pnpm exec vitest run tests/unit/call-lane-gateway.test.ts`), then, each alone:
- `pnpm exec vitest run tests/integration/debate-shape-run.test.ts` (the whole file; see the note above)
- `pnpm exec vitest run tests/integration/debate-shape-row-absent.test.ts` (row absent: unchanged)

Also add a case to `tests/unit/map-root-zero-room.test.ts` or the runner's room test that a locked shape run sizes `keepRoomMicros` from the LOCKED bound (pre-flight PF-L38): with hosted prices, the room for a run whose stored tag/name is `ro`/`Romanian` is larger than the room for the same run read as `und`.

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/index.ts tests/support/preview-gate-stubs.ts tests/support/debate-shape-harness.ts tests/integration/debate-shape-run.test.ts tests/unit/runner-question-language.test.ts
git commit -m "Runner: a shape run's calls carry its locked language; doubles strip the named sentence; the harness sets the language on startRun

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Also `git add tests/unit/map-root-zero-room.test.ts` by name if Step 4's room case went there.

---
### Task 18: /new — the site language goes with the question; the one-language pop-up

**Gate:** runs after P2c Task 10 (see "Execution order"). P2c Task 8 rewrites the same page.

**Files:**
- Create: `apps/ui/components/QuestionLanguageChoice.tsx`
- Modify:
  - `apps/ui/lib/api.ts` (`createDebate` gains an optional fifth argument; `QuestionLanguageChoiceNeededError`; `isQuestionLanguageCheckStale`);
  - `apps/ui/app/new/NewDebatePageClient.tsx` (`submit()` and the dialogs line);
  - `apps/ui/lib/i18n/catalogNamespaces.test.mjs` only if it lists the keys a component reads.
- Modify (only if P2c ran without amendment P2c-1/2): `apps/ui/messages/*/newDebate.json`
- Test: `tests/render/question-language-choice.test.tsx` (create)

**The six keys** (English is the question-language spec's wording; Romanian follows Contract deviation 4):

| key | en | ro |
|---|---|---|
| `newDebate.languageCheck.title` | Your question's language | Limba întrebării |
| `newDebate.languageCheck.body` | Your question mixes {languages}. The AIs debate best when the whole question is in one language, so we suggest this version in {language}: | Întrebarea ta amestecă limbile {languages}. AI-urile dezbat cel mai bine când toată întrebarea e într-o singură limbă, așa că îți propunem această variantă în limba {language}: |
| `newDebate.languageCheck.use` | Use this version | Folosește varianta propusă |
| `newDebate.languageCheck.keep` | Keep my wording | Păstrează formularea mea |
| `newDebate.languageCheck.edit` | Edit | Editează |
| `newDebate.languageCheck.proposalLabel` | Suggested version | Varianta propusă |

`{languages}` is the detected languages' names in the site language, joined with `Intl.ListFormat(locale, { type: "conjunction" })`. `{language}` is the main language's name in the site language. Both come from `Intl.DisplayNames([locale], { type: "language" })`, with the server's English name as the fallback.

The rewrite is shown in a `<blockquote lang={main code}>` with `<bdi>`. There are no guillemets in the keys.

**Interfaces:**
```ts
// apps/ui/lib/api.ts
export class QuestionLanguageChoiceNeededError extends Error { readonly offer: QuestionLanguageOffer }
export function isQuestionLanguageCheckStale(failure: unknown): boolean;   // 409 CHECK_INVALID / CHECK_EXPIRED / CHOICE_MISMATCH
export async function createDebate(topic, config, token, client = contractClient,
  language?: Readonly<{ siteLanguage: SiteLanguage; choice?: QuestionLanguageChoice }>): Promise<{ id: string }>;   // today's return type (PF-L53)
// apps/ui/components/QuestionLanguageChoice.tsx
export type QuestionLanguageAnswer = "USE" | "KEEP" | "EDIT";
export function useQuestionLanguageChoice(input: Readonly<{ catalog: MessageCatalog; locale: LocaleCode }>):
  Readonly<{ ensureChoice(offer: QuestionLanguageOffer): Promise<QuestionLanguageAnswer>; dialog: React.ReactNode }>;
```

- [ ] **Step 0 (only if needed):** run `grep -L '"newDebate.languageCheck.body"' apps/ui/messages/*/newDebate.json || true` (`grep -L` exits 1 when it lists nothing, which is the normal case once P2c Task 10 has run; the `|| true` keeps a `set -e` shell going; P2c pre-flight PF-C41). If it prints nothing, skip the rest of Step 0. If it lists ANY file, some locale lacks the keys and this step runs for exactly the listed locales (pre-flight PF-L57: checking only `en` misses the case where P2c Task 8 added the English keys but Task 10 never translated them, and catalogue parity then goes red).
  - `en` and `ro`, if listed: add the six keys as in the table (Romanian given as is, never translated).
  - Every other listed locale: translate with P2c Task 10's process, cut down to these six keys (`docs/superpowers/plans/2026-10-12-debate-shape-phase2c.md`, the section "## Task 10: All 35 locales"; find it by its heading): the same six Haiku workers by language group, effort `xhigh`, foreground; the worker prompt's key list is these six keys (and its counts become 6 per locale); each group gets only its listed locales; packets in `"$(git rev-parse --show-toplevel)/.superpowers/sdd/2026-10-13-debate-shape-phase2-language/translations"` (git-ignored, never committed; P2c pre-flight PF-C36). P2c's merge script does more than add keys: it also removes the retired keys and replaces the reworded `debateChrome.condition.mapMergeFallback` (P2c pre-flight PF-C41, PF-C33). Use it with its removal list and its replace list emptied, so that here it only adds the six keys. Rules for these keys:
    - keep `{languages}` and `{language}` untranslated;
    - the sentence must read naturally with a language name, or a list of names, filled in;
    - use the catalogue's own register.
  - Then run one Opus spot-check (effort `high`) of whichever of mt, ga, et, lv, lt, ar, he, hi, ja, zh, ko were translated, and merge.
  - If this task runs BEFORE P2c Task 8, tell the controller: P2c Tasks 8 and 10 must then skip these six keys (they exist already).

Implementer note (pre-flight PF-L57): `AskRequestSchema` is `.strict()`, so a UI that sends `site_language` to an API without Tasks 9 and 11 gets a 400. The API ships before or with this UI (Owner steps 1).

- [ ] **Step 1: Write the failing test** `tests/render/question-language-choice.test.tsx`. Model it on `tests/render/sensitive-data-consent.test.tsx`: same mocks of `next/navigation`, `@/components/AuthGate`, `SupportWidget`, and the same catalogue loading from `apps/ui/messages/<locale>/<ns>.json`.

```tsx
// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pre-flight PF-L54: copied from tests/render/sensitive-data-consent.test.tsx (~16–43, ~70–77, ~104–111): mocks made with
// vi.hoisted (a plain const is not yet defined when vi.mock's factory runs); consent mocks answer { status }, never { state };
// readSession REJECTS (as the consent test does), never resolves {}; the textarea is filled through the native value setter.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(), validateSession: vi.fn(), readSession: vi.fn(),
  readSensitiveDataConsent: vi.fn(), giveSensitiveDataConsent: vi.fn(), push: vi.fn()
}));
const createDebate = mocks.createDebate;
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stubs/next-navigation.js")>()),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  return { ...actual, COOKIE_SESSION_MARKER: "cookie-session", createDebate: mocks.createDebate, validateSession: mocks.validateSession,
    contractClient: { readSession: mocks.readSession, readSensitiveDataConsent: mocks.readSensitiveDataConsent,
      giveSensitiveDataConsent: mocks.giveSensitiveDataConsent } };
});
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("test-token")
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));

import { QuestionLanguageChoiceNeededError } from "../../apps/ui/lib/api.js";
import { ContractHttpError } from "@debateai/contract";
import NewDebatePageClient from "../../apps/ui/app/new/NewDebatePageClient.js";

// There is no catalogsFor helper: build the three catalogues the page takes from apps/ui/messages/<locale>/<ns>.json.
const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalogue = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const catalogsFor = (locale: string) => ({ catalog: catalogue(locale, "newDebate"), homeCatalog: catalogue(locale, "home"), chromeCatalog: catalogue(locale, "chrome") });

const MIXED = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const OFFER = { check_ref: "ref.sig", main_language: { code: "ro", name: "Romanian" },
  languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }],
  proposed_question: "Ar trebui România să adopte euro sau să aștepte până cresc salariile?" };

async function renderNew(locale: "ro" | "en") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<NewDebatePageClient locale={locale} {...catalogsFor(locale)} />); });
  return { host, root };
}
async function askWith(host: HTMLElement, text: string) {
  const box = host.querySelector("textarea") as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;   // React reads the native setter
  await act(async () => { setter!.call(box, text); box.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { (host.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
  await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); });
}
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.validateSession.mockReset().mockResolvedValue(undefined);
  mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
  mocks.readSensitiveDataConsent.mockReset().mockResolvedValue({ status: "given" });
  mocks.giveSensitiveDataConsent.mockReset().mockResolvedValue({ status: "given" });
  mocks.push.mockReset();
});
afterEach(() => { createDebate.mockReset(); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("/new: the question's language (question-language spec 2026-10-13)", () => {
  it("sends the page's language with every ask", async () => {
    createDebate.mockResolvedValue({ id: "run-1" });
    const { host } = await renderNew("ro");
    await askWith(host, "Ar trebui România să adopte euro?");
    expect(createDebate).toHaveBeenCalledWith("Ar trebui România să adopte euro?", expect.anything(), "test-token", undefined, { siteLanguage: "ro" });
  });

  it("a real mix: the pop-up names the languages in the site language; 'Use this version' sends the server's rewrite and the reference", async () => {
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER))
      .mockResolvedValueOnce({ id: "run-1" });
    const { host } = await renderNew("ro");
    await askWith(host, MIXED);
    const dialog = document.querySelector('[data-dialog="question-language"]')!;
    expect(dialog.textContent).toContain("Întrebarea ta amestecă limbile");
    expect(dialog.querySelector("blockquote")!.getAttribute("lang")).toBe("ro");
    expect(dialog.textContent).toContain(OFFER.proposed_question);
    expect(dialog.textContent).not.toMatch(/eld|score|model|check_ref/iu);
    await act(async () => { button("Folosește varianta propusă").click(); });
    expect(createDebate).toHaveBeenLastCalledWith(OFFER.proposed_question, expect.anything(), "test-token", undefined,
      { siteLanguage: "ro", choice: { check_ref: "ref.sig", choice: "USE_REWRITE", original_question_line: MIXED } });
  });

  it("'Keep my wording' sends the person's own question with the reference", async () => {
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER))
      .mockResolvedValueOnce({ id: "run-1" });
    const { host } = await renderNew("en");
    await askWith(host, MIXED);
    expect(document.querySelector('[data-dialog="question-language"]')!.textContent).toContain("Your question mixes Romanian and English.");
    await act(async () => { button("Keep my wording").click(); });
    expect(createDebate).toHaveBeenLastCalledWith(MIXED, expect.anything(), "test-token", undefined,
      { siteLanguage: "en", choice: { check_ref: "ref.sig", choice: "KEEP_MINE" } });
  });

  it("CR-5: the pop-up shows at most once per submit; a second offer is answered with the person's own wording", async () => {
    const SECOND = { ...OFFER, check_ref: "ref2.sig" };
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER))
      // The client's 409 for a stale reference: codeForStatus (packages/contract/src/client.ts) gives a 409 "SERVER_FAILURE".
      .mockRejectedValueOnce(new ContractHttpError("SERVER_FAILURE", 409, "QUESTION_LANGUAGE_CHECK_EXPIRED: QUESTION_LANGUAGE_CHECK_EXPIRED", "QUESTION_LANGUAGE_CHECK_EXPIRED"))
      .mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(SECOND))
      .mockResolvedValueOnce({ id: "run-1" });
    const { host } = await renderNew("en");
    await askWith(host, MIXED);
    await act(async () => { button("Use this version").click(); });
    expect(document.querySelectorAll('[data-dialog="question-language"]').length).toBe(0);
    expect(createDebate).toHaveBeenLastCalledWith(MIXED, expect.anything(), "test-token", undefined,
      { siteLanguage: "en", choice: { check_ref: "ref2.sig", choice: "KEEP_MINE" } });
  });

  it("'Edit' and Esc send nothing more and put the person back in the question box", async () => {
    for (const close of [() => button("Edit").click(), () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))]) {
      createDebate.mockReset();
      createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER));
      const { host, root } = await renderNew("en");
      await askWith(host, MIXED);
      await act(async () => { close(); });
      expect(createDebate).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[data-dialog="question-language"]')).toBeNull();
      expect(document.activeElement).toBe(host.querySelector("textarea"));
      root.unmount();
    }
  });
});
```

`catalogsFor` above is this file's own three-line loader (the consent test builds its catalogues the same way, inline). The assertions stay as written.

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/render/question-language-choice.test.tsx`

- [ ] **Step 3: Implement**

`apps/ui/lib/api.ts`:

```ts
/** Question language (spec 2026-10-13): the server found a real mix and offers a one-language version. */
export class QuestionLanguageChoiceNeededError extends Error {
  readonly offer: QuestionLanguageOffer;
  constructor(offer: QuestionLanguageOffer) { super("QUESTION_LANGUAGE_CHOICE_NEEDED"); this.name = "QuestionLanguageChoiceNeededError"; this.offer = offer; }
}
const STALE_CHECK = new Set(["QUESTION_LANGUAGE_CHECK_INVALID", "QUESTION_LANGUAGE_CHECK_EXPIRED", "QUESTION_LANGUAGE_CHOICE_MISMATCH"]);
export function isQuestionLanguageCheckStale(failure: unknown): boolean {
  return failure instanceof ContractHttpError && failure.status === 409 && STALE_CHECK.has(failure.serverCode ?? "");
}
```

In `createDebate`, add the fifth parameter `language?`. When it is given, the ask object gains `site_language: language.siteLanguage` and, with a choice, `question_language_choice: language.choice`. Its return type stays `Promise<{ id: string }>` (the page reads `debate.id`, `NewDebatePageClient.tsx` ~289; pre-flight PF-L53). The last two lines (`const accepted = await client.submitAsk(ask); return { id: accepted.run_ref };`) become:

```ts
  if (language === undefined) {                                   // today's call, unchanged
    const accepted = await client.submitAsk(ask);
    return { id: accepted.run_ref };
  }
  const outcome = await client.submitAskOrLanguageChoice(ask);
  if (outcome.kind === "LANGUAGE_CHOICE_NEEDED") throw new QuestionLanguageChoiceNeededError(outcome.offer);
  return { id: outcome.accepted.run_ref };
```

The render test's mocks resolve `{ id: "run-1" }`, as the consent test's do.

`apps/ui/components/QuestionLanguageChoice.tsx`:
- Follow `SensitiveDataConsent.tsx`'s pattern: a hook whose `ensureChoice` returns a Promise resolved by the buttons; `useModalSurface(open, { containerRef, initialFocusRef, onClose })`; `backdropCloseHandler`; `policyScrim` / `policyBezel` classes.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title, `data-dialog="question-language"`.
- The body fills `{languages}` and `{language}` with names from `Intl.DisplayNames([locale], { type: "language" })`. When that throws or echoes the code, it falls back to the offer's English name. The list is joined with `Intl.ListFormat(locale, { type: "conjunction" })`.
- The rewrite goes in `<blockquote lang={offer.main_language.code}><bdi>…</bdi></blockquote>`, with the `proposalLabel` key as its `aria-label`.
- Buttons, in order: [use] [keep] [edit]. Initial focus is on [use].
- Esc, a backdrop click, and [edit] all resolve `"EDIT"`.

`NewDebatePageClient.tsx` (its `locale` prop is a `string`; pre-flight PF-L56):
- Guard it once: `const pageLocale: LocaleCode = isLocale(locale) ? locale : "en";` (`isLocale`, `apps/ui/lib/i18n/locales.ts` ~79), and use `pageLocale` for `catalogLocale(...)` and `useQuestionLanguageChoice`.
- Create `const languageChoice = useQuestionLanguageChoice({ catalog, locale: pageLocale });` next to `useSensitiveDataConsent`.
- Render `{languageChoice.dialog}` beside `{consent.dialog}{crisis.dialog}`.
- In `submit()`, replace the single `createDebate(topic.trim(), config, token)` call (and its consent retry) with a loop of at most FOUR `createDebate` calls per press of "Start debate", plus today's one consent retry (P2L ledger note for Task 18: the CR-5 test below makes four calls: the first ask, the answer to the offer, the re-check after a stale refusal, and the KEEP_MINE answer to a second offer; "three tries" would stop before the last one):
  - the site language is `catalogLocale(pageLocale)` (en-US/en-GB → en);
  - every call passes it;
  - on `QuestionLanguageChoiceNeededError`, `await languageChoice.ensureChoice(error.offer)`:
    - `"EDIT"`: focus the question textarea and return (the debate is not created; the next submit checks again);
    - `"USE"`: call again with the offer's `proposed_question` exactly as the server sent it (not trimmed or edited) and `{ check_ref, choice: "USE_REWRITE", original_question_line: topic.trim() }`, where `topic.trim()` is the same string the first try sent;
    - `"KEEP"`: call again with `topic.trim()` and `{ check_ref, choice: "KEEP_MINE" }`;
  - on `isQuestionLanguageCheckStale(error)` after a choice: never resend that `check_ref`; call once more with the person's own wording (`topic.trim()`) and no choice (the server checks again; a second offer for the same question within 15 minutes is answered by the server with its fallback lock, `REPEAT_OFFER`, ruling CR-5). Known trade-off: after a stale `USE_REWRITE`, the `REPEAT_OFFER` lock keeps the person's wording, not the rewrite;
  - branch on the error's `serverCode` (via `isQuestionLanguageCheckStale`), never on `.code`: the client's `.code` for every 409 is `"SERVER_FAILURE"`;
  - ruling CR-5, page side: the pop-up shows at most ONCE per press of "Start debate". If a second offer still arrives in the same submit (an API process that did not see the first offer), the page does not show it: it answers that offer with `{ check_ref: <the new reference>, choice: "KEEP_MINE" }` and the person's own wording;
  - the existing consent refusal branch stays as it is, inside the loop;
  - order (D1): the server makes its language offer before any plan or allowance refusal (the decider runs first in `submit`, after the session and team checks). So the pop-up can come first and a plan or allowance refusal only on the answering call; the loop hands every error that is not an offer, a stale-check 409 or the consent refusal to today's handling, unchanged.
- Keep `buildNewDebateAskConfig` and the config object untouched: `tests/render/ux01-new-debate-form.test.tsx` pins its keys.

`apps/ui/lib/v3/requestFailure.ts` (~131–136; pre-flight PF-L29): map a 409 whose `serverCode` is `QUESTION_LANGUAGE_CHECK_INVALID`, `QUESTION_LANGUAGE_CHECK_EXPIRED` or `QUESTION_LANGUAGE_CHOICE_MISMATCH` to the page's plain "check again" handling (the loop above), never to a raw code in text; branch on `serverCode`, since the client's own `.code` for any 409 is `"SERVER_FAILURE"` (PF-L24).

Then find the existing render tests that assert `createDebate`'s exact arguments: `grep -rln "createDebate).toHaveBeenCalledWith\|createDebate).toHaveBeenLastCalledWith" tests/render`. Extend each expectation with `undefined, { siteLanguage: "<that test's locale>" }`. That is the only change those tests need.

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/render/question-language-choice.test.tsx`
- `pnpm exec vitest run tests/render/sensitive-data-consent.test.tsx`
- `pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx`
- `pnpm exec vitest run tests/render/tier01-new-plan-tier.test.tsx`
- `pnpm exec vitest run tests/render/new-debate-no-phone-step.test.tsx`
- `pnpm exec vitest run tests/render/debate-shape-new-controls.test.tsx` (P2c Task 8's /new controls; this task edits the same `submit()`; P2c pre-flight PF-C32)
- `pnpm exec vitest run tests/unit/debate-shape-new-ask-wire.test.ts` (P2c Task 8's wire test; this task adds `createDebate`'s fifth argument; P2c pre-flight PF-C32)

Then run the catalogue check from the UI folder, the form P2c uses (pre-flight PF-L55: the test reads `join(process.cwd(), "messages")` and imports TypeScript, so it fails from the engine folder): `cd apps/ui && node --import tsx --test lib/i18n/catalog.test.mjs` (the same form for `catalogNamespaces.test.mjs` if this task touched it).

Then, alone (the root tsconfig excludes `apps/ui`, so the root typecheck never sees this task; pre-flight PF-L56): `pnpm --dir apps/ui exec tsc --noEmit -p tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/components/QuestionLanguageChoice.tsx apps/ui/lib/api.ts apps/ui/app/new/NewDebatePageClient.tsx apps/ui/lib/v3/requestFailure.ts tests/render/question-language-choice.test.tsx
git commit -m "/new: the site language goes with the question; a real mix offers the server's one-language version — use, keep or edit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Also `git add` by name each existing render test whose `createDebate` expectation Step 3 extended. If Step 0 ran, also `git add` by name each `apps/ui/messages/<locale>/newDebate.json` it changed.

---

### Task 19: Hosted — the fast check as a run-less site cost (migration 0117, renumber at build time)

The preview needs none of this: its gate is the record. Hosted's daily site pot is `ledger.model_spend` summed by day (`readDaySpentMicros`), whose `spend_source` CHECK allows `RUN`, `SUPPORT` and `STORY` only (migration 0074). This task adds `LANGUAGE_CHECK` (no run, no phase) and one SECURITY DEFINER writer the API's runtime role may call. Until it is applied, the hosted API keeps the fast check off (Task 12's capability check).

**Files:**
- Create:
  - `migrations/0117_language_check_spend.sql`;
  - `migrations/lineage/language-check-spend-forward0117.json`;
  - `packages/db/src/migration-forward0117.ts`;
  - `tests/architecture/language-check-spend-0117-contract.test.ts`;
  - `tests/integration/language-check-spend.test.ts`.
- Modify:
  - `packages/db/src/migration-forward-chain.ts` (append `loadForward0117`);
  - `migrations/lineage/README.md` (section "## The language check's site cost (0117)");
  - `packages/budget/src/model-spend.ts` (`ModelSpendSource` += `"LANGUAGE_CHECK"`; `recordSpend` REFUSES it: the SECURITY DEFINER function is the only writer of a language-check row — pre-flight PF-L58, option (a));
  - `apps/api/src/main.ts` (`hostedQuestionLanguageRoute` turns on, see Task 12; the support target's parse and credential read move above the question-language step, PF-L36);
  - every pin that names the chain's last step moves from 0116 to 0117, and a "chains 0117 after 0116" test is added (pre-flight PF-L59; the list at 249ed0cd8 — re-check with `grep -rln "0116_debate_shape_map\|forward0116\|0116" tests` before editing):
    - `tests/architecture/migration-forward-auth-db-batch.test.ts` (~57)
    - `tests/architecture/migration-forward-chain.test.ts` (~62, ~109, ~150)
    - `tests/architecture/security-migration-0065.test.ts` (~631)
    - `tests/unit/preview-auth-dev-pending-forward.test.ts` (~22, ~59, ~65, ~88)
    - integration, each run ALONE: `tests/integration/billing-netopia-migration.test.ts` (~27), `tests/integration/billing-price-currencies-migration.test.ts` (~143), `tests/integration/dx-forward115.test.ts` (~18), `tests/integration/forward-chain-replay-verifiers.test.ts` (~62–72), `tests/integration/preview-auth-dev-fallback.test.ts` (~170), `tests/integration/preview-auth-preservation.test.ts` (~259), `tests/integration/role-rotation-0114.test.ts` (~215).

**Interfaces:**
```sql
ledger.record_language_check_spend(p_spend_id uuid, p_provider_ref text, p_charged_on date,
  p_charge_micros bigint, p_input_tokens bigint, p_output_tokens bigint) RETURNS void  -- SECURITY DEFINER, EXECUTE to debateai_runtime
```
```ts
export function languageCheckChargeMicros(usage: FastCheckUsage, price: Readonly<{ input: number; output: number }>): number; // ceil
```

- [ ] **Step 1: Write the failing tests.** `tests/architecture/language-check-spend-0117-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../migrations/0117_language_check_spend.sql", import.meta.url), "utf8");

describe("0117: the language check's run-less site cost", () => {
  it("widens the source CHECK by exactly LANGUAGE_CHECK and keeps a run-less row phase-less", () => {
    expect(sql).toMatch(/CHECK \(spend_source IN \('RUN', 'SUPPORT', 'STORY', 'LANGUAGE_CHECK'\)\)/u);
    expect(sql).toMatch(/spend_source <> 'LANGUAGE_CHECK' OR \(run_id IS NULL AND spend_phase IS NULL\)/u);
  });
  it("writes only through one SECURITY DEFINER function, granted to the runtime role alone", () => {
    expect(sql).toMatch(/CREATE FUNCTION ledger\.record_language_check_spend\(/u);
    expect(sql).toMatch(/SECURITY DEFINER/u);
    expect(sql).toMatch(/SET search_path = pg_catalog/u);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION ledger\.record_language_check_spend\([^)]*\) FROM PUBLIC/u);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION ledger\.record_language_check_spend\([^)]*\) TO debateai_runtime;/u);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION/u);
  });
  // P2b pre-flight PF-B25: anchored on CREATE. A bare `FUNCTION <name>` substring check can never pass on a migration
  // that also says `EXECUTE FUNCTION <name>` or `GRANT EXECUTE ON FUNCTION <name>`.
  it("never redefines a function an earlier migration owns", () => {
    for (const owned of ["core.progress_value_is_code_shaped", "core.enforce_erasure_barrier()", "core.reject_mutation()", "core.install_truncate_guard"]) {
      expect(sql).not.toMatch(new RegExp(String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+` + escapeRegExp(owned.replace(/\(\)$/u, "")), "u"));
    }
  });
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
```

`tests/integration/language-check-spend.test.ts` (embedded Postgres, run alone): migrate. Call the function once, as the runtime role, with `('…uuid…', 'language-check:anthropic:claude-haiku-5-5', '2026-10-13', 85, 310, 28)`. Assert `PostgresModelSpendStore.readDaySpentMicros("2026-10-13")` grows by 85. Assert a direct `INSERT … spend_source='LANGUAGE_CHECK', run_id=<a run>` is refused by the CHECK. Assert `recordSpend({ spendSource: "LANGUAGE_CHECK", runId: null, … })` is refused with `MODEL_SPEND_LANGUAGE_CHECK_FUNCTION_ONLY` (the function is the one writer, PF-L58), and `spendSource: "RUN", runId: null` still throws `MODEL_SPEND_RUN_REQUIRED`. Add a unit case: `languageCheckChargeMicros({ inputTokens: 310, outputTokens: 28 }, { input: 100000, output: 500000 })` equals `Math.ceil((310*100000 + 28*500000) / 1_000_000)` = 45.

- [ ] **Step 2: Run them and expect FAIL**

Run: `pnpm exec vitest run tests/architecture/language-check-spend-0117-contract.test.ts`

- [ ] **Step 3: Implement**

`migrations/0117_language_check_spend.sql`:

```sql
-- 0117 · The fast language check's site cost (question-language spec 2026-10-13; plan P2L Task 19).
-- One short call made before a debate exists: a SITE cost in the day's pot, never a run's and never a person's.
ALTER TABLE ledger.model_spend DROP CONSTRAINT model_spend_spend_source_check;
ALTER TABLE ledger.model_spend
  ADD CONSTRAINT model_spend_spend_source_check CHECK (spend_source IN ('RUN', 'SUPPORT', 'STORY', 'LANGUAGE_CHECK'));
ALTER TABLE ledger.model_spend
  ADD CONSTRAINT model_spend_language_check_is_runless CHECK (spend_source <> 'LANGUAGE_CHECK' OR (run_id IS NULL AND spend_phase IS NULL));

CREATE FUNCTION ledger.record_language_check_spend(
  p_spend_id uuid, p_provider_ref text, p_charged_on date, p_charge_micros bigint, p_input_tokens bigint, p_output_tokens bigint
) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase, attempt_id)
  VALUES (p_spend_id, 'LANGUAGE_CHECK', NULL, p_provider_ref, p_charged_on, p_charge_micros, p_input_tokens, p_output_tokens, NULL, NULL);
$$;
REVOKE ALL ON FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint) TO debateai_runtime;
```

Before writing it, check the columns of `ledger.model_spend` and its owner role against migrations 0066, 0074 and 0075 (`grep -n "model_spend" migrations/00*.sql`). Copy the owner and ALTER ... OWNER lines the way 0093 does for its SECURITY DEFINER functions. Then follow P2b Task 7 exactly, with 0116 → 0117 and 0115 → 0116, for:
- the manifest;
- the loader (`NAME = "0117_language_check_spend.sql"`, `PREVIOUS = "0116_debate_shape_map.sql"`, refusal prefix `MIGRATION_FORWARD0117_`, postcondition: the function's definition sha256 and ACL, and both CHECKs present);
- the chain append;
- the README section;
- the pins (listed under Files).

`packages/budget/src/model-spend.ts` (pre-flight PF-L58: ONE writer — the plan described two, a direct INSERT through `PostgresModelSpendStore.recordSpend`, ~913–934, which `debateai_runtime` may run (0066 ~90), and the SECURITY DEFINER function; option (a) is taken):
- `ModelSpendSource` gains `"LANGUAGE_CHECK"`, with the comment `the fast language check before a debate: a run-less site cost (0117), written only by ledger.record_language_check_spend`, so `readDaySpentMicros` and every reader type it;
- `recordSpend` refuses `spendSource: "LANGUAGE_CHECK"` with `MODEL_SPEND_LANGUAGE_CHECK_FUNCTION_ONLY`, before any query;
- add `languageCheckChargeMicros`.

`apps/api/src/main.ts`:
- Boot order (pre-flight PF-L36): move `const supportModelTarget = boot.runSync("support-model-target", …)` (~1190 today) ABOVE the question-language step (~632), and read its credential there once through the same custody loader `createSupportModelAdapter` uses (`readCustodyAuthorizationHeader`, as passed at ~1200), so the HOSTED route has it. `createSupportModelAdapter` keeps receiving the same target; nothing else about the support chat changes.
- In `hostedQuestionLanguageRoute` (now `async`, awaited before `composeQuestionLanguage`, its result handed to `questionLanguageRouteFor`'s `hosted` callback — Task 12), replace the placeholder with the capability probe `SELECT to_regprocedure('ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)') IS NOT NULL` and `recordSpend`. The probe asks only whether the one writer exists (option (a)).
- `recordSpend(usage)` calls the function with: `randomUUID()`; `language-check:${provider}:${model}`; `costEnvelopeDay(new Date())`; `languageCheckChargeMicros(usage, price)`, where `price` is the policy row's `fastCheck.priceMicrosUsdPerMillionTokens` (Task 4; the support target carries no price, `support/model.ts` ~82–89); and the two token counts. A `usage.projected` record (no usage named, or an abort after sending: Task 6, PF-L16) is written the same way, at the projected maximum.

A failed record is logged as `api.question_language.spend_unrecorded`, with codes only. It never fails the ask, because the call already happened. That is the same rule the support chat follows for unreported cost.

Implementer note (pre-flight PF-L60): the new step touches only `packages/db/src/migration-forward-chain.ts` (`STEPS`, ~39) and a new loader; `packages/db/src/index.ts` and its `NATIVE_MIGRATE_MODULE_SHA256` pin (`tools/orphan-audit/src/index.ts` ~661) do not move. The CHECK is named `model_spend_spend_source_check` (0074 ~222–225). The 0111 effective verifier inventories only billing functions. Owner-visible: hosted records the check AFTER the call, so a failed record (`spend_unrecorded`) under-counts by one tiny call, as support chat already does — Owner steps 4 says so.

- [ ] **Step 4: Run and expect PASS**

Run: `pnpm exec vitest run tests/architecture/language-check-spend-0117-contract.test.ts`, then each moved pin's unit or architecture file, one at a time. Then each integration file ALONE, one after another: `pnpm exec vitest run tests/integration/language-check-spend.test.ts`, then each moved integration pin's file (the seven listed under Files).

- [ ] **Step 5: Commit**

```bash
git add migrations/0117_language_check_spend.sql migrations/lineage/language-check-spend-forward0117.json migrations/lineage/README.md packages/db/src/migration-forward0117.ts packages/db/src/migration-forward-chain.ts packages/budget/src/model-spend.ts apps/api/src/main.ts tests/architecture/language-check-spend-0117-contract.test.ts tests/integration/language-check-spend.test.ts
git commit -m "db: migration 0117 — the fast language check as a run-less site cost in the day's pot; hosted turns the check on when it exists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Before committing, also `git add` by name every pin file listed under Files that this task moved, the shipped-corpus manifest if it lists the new loader, and any unit test file that holds the `languageCheckChargeMicros` case (owner sessions share the worktree: never a whole directory).

---

### Task 20: Whole-plan verification

- [ ] **Step 1: Shipped corpus and source rules**

Run, one after another:
- `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`
- `pnpm exec vitest run tests/architecture/scaffold.test.ts`

- [ ] **Step 2: Every P2L unit file, one at a time**

The files are `tests/unit/question-language-*.test.ts`, `tests/unit/map-question-language.test.ts`, `tests/unit/story-locked-language.test.ts` (pre-flight PF-L49; the older `tests/unit/story-question-language.test.ts` is R2's and runs too) and `tests/unit/runner-question-language.test.ts`. List them with `ls tests/unit/question-language-*.test.ts` (zsh: the glob is fine in `ls`), and run each with `pnpm exec vitest run <file>`. Never pass an empty list.

After Tasks 18 and 19 (pre-flight PF-L61), also, one at a time:
- `pnpm exec vitest run tests/render/question-language-choice.test.tsx`
- `pnpm exec vitest run tests/architecture/language-check-spend-0117-contract.test.ts`
- `pnpm exec vitest run tests/unit/preview-register-publish-v3.test.ts` (kit v3 carries the three rows, L-KIT)
- alone: `pnpm exec vitest run tests/integration/language-check-spend.test.ts`
- the guard files named in Global Constraints, one at a time.

- [ ] **Step 3: The row-absent proof**

Run, each alone:
- `pnpm exec vitest run tests/integration/debate-shape-row-absent.test.ts`
- `pnpm exec vitest run tests/unit/debate-shape-submit.test.ts`

- [ ] **Step 4: Typecheck once, alone**

Run `pnpm run typecheck` when no vitest run is active. After Task 18, ALSO run the UI's own typecheck, alone (the root tsconfig excludes `apps/ui`; pre-flight PF-L61): `pnpm --dir apps/ui exec tsc --noEmit -p tsconfig.json`.

- [ ] **Step 5: Print the hashes the owner's register republish needs**

Print the map hash with `pnpm exec tsx -e 'import {mapPromptContractHash} from "@debateai/map"; console.log(mapPromptContractHash())'`, and the judge hash as in Task 0 Step 3. The judge hash must equal `JUDGE_HASH_AFTER_P2B`. Put both in the controller's report.

## Owner steps (things that are "off" until the owner acts)

1. **Register republish and deploy order (preview and hosted; pre-flight PF-L62).**
   - P2L changes ONE sealed fingerprint, the map's (`mapContractHash`, new in P2b), because the angle planner's answer form gains `question_language`.
   - A runner refuses a version whose `mapContractHash` is not its own whenever a `debateShapePolicy` row is present, even a disabled one (`apps/runner/src/debate-shape-boot.ts`, `MAP_CONTRACT_HASH_MISMATCH`): a P2L runner refuses a version sealed with P2b's map hash, and a P2b runner refuses P2L's. So, in this order:
     1. let every admitted shape debate finish (no shape debate in flight);
     2. upload P2L and publish ONE new register version that carries P2L's `mapContractHash` together with P2b's judge and composer hashes (P2b PF-B13), then restart the runner and API on it;
     3. on hosted, re-run the hosted publisher after the deploy;
     4. deploy the API before, or together with, the UI (the ask schema is strict: a UI that sends `site_language` to an older API gets 400).
   - Dev registers re-seal by themselves.
   - Unchanged: `judgeContractHash` (Task 13 pins it), `composerContractHash`, `conformanceContractHash`, the story pack fingerprint.
   - The story's per-call contract hash changes for shape runs. It is recorded per call and is not a sealed value.
   - P2b's open owner notes still stand: fix the re-claim bug (task chip task_205182c8) before turning the shape on in hosted mode, and re-check `serve_reserve_basis_points`.
2. **The optional row `questionLanguagePolicy`.** Publish it only to change the provider/model, switch the check off, or edit the instruction. Absent means the start values. Preview: an optional source row of the v2/v3 kit (kit v3, from #163, supersedes v2 for the hosted preview: Task 0 Step 2b and Task 12 make both carry it, through the plan key `questionLanguage` / flag `--question-language`; pre-flight PF-L63). Hosted: the optional file member.
3. **Server gate check.** The preview Anthropic gate must accept `claude-haiku-5-5` with effort `low` from the API's process. It already does for the support relay's model row, but confirm the API's socket access on the server before turning the shape row on.
4. **Hosted:** apply migration 0117 (Task 19) before hosted's first shape debate. Until then hosted runs eld + site language with no rewrite (short Chinese, Japanese, Korean, Hebrew and Greek questions are then read from their alphabet: final review I3). Hosted records each check AFTER the call (its framed message is about 5.2 KB, so one check costs about $0.00013); if that record fails (`api.question_language.spend_unrecorded`), the day's pot under-counts by that one call, as the support chat already does (pre-flight PF-L60). A failed record never fails the ask: after a refused grant, a missing writer or a check violation (42501, 42883, 23514), or three failed records in a row, the spend-record breaker latches and the fast check stays off until a restart (`api.question_language.spend_record_down`; ruling of Task 19). The fast check is also skipped, never blocking, while the day's site pot is at its ceiling (ruling L-POT; an unreadable pot counts as full). The hosted PREVIEW never takes this route (ruling L-ROUTE): with no Anthropic gate socket it runs eld + site language.
5. **Wording picks:**
   - **(a) The pop-up title.** Option 1 «Your question's language / Limba întrebării» (in code); 2 «One language for your question / O singură limbă pentru întrebare»; 3 «Check your question's language / Verifică limba întrebării».
   - **(b) The Romanian body's register.** The spec's text uses «ta» (informal) while the RO catalogue elsewhere uses the polite plural. In code: the spec's informal text, adjusted for filled names (Contract deviation 4).
   - (The planner-disagreement label pick is gone: ruling CR-3 keeps that record operator-only, so it has no user text.)
6. **"Thinking off" for the fast check** (Contract deviation 1, ruling CR-4). Task 0 Step 5 checks whether both preview gates already accept it for Haiku after the origin/dev merge; if not (the expected result: on origin/dev da35a529b the Haiku menu is high/medium/low), it needs a gate change on both sides (TypeScript `anthropicBodyAccepted` and the Python `AnthropicProfile` in packages/providers/ops/preview_budget_helper.py) with parity fixtures, a separate owner-approved task. Until then the check uses effort `low`.
7. **Sites that always ask the fast AI** (ruling CR-2): `ga`, `id`, `mt`, `hr` and every site Task 3 measured as confused (`ELD_CONFUSED_SITES`). The controller reports the measured list (and whether the gate's 600 posts a day, shared with debates, call for a count floor: PF-L20); the owner may add or remove a site (one constant in `decide.ts`). The controller also reports the eld database Task 3 chose and its memory in the API (about 54, 71 or 138 MB; PF-L10), and the clause rule's measured numbers (L-MIX: how many built mixes it catches, how many single-language questions pay an extra call).
8. **Kept defaults the owner is told about at the end** (ruling CR-7): the Romanian pop-up keeps the owner's informal «ta» text, adjusted for filled names (Contract deviation 4); the debate page's existing language strip (`QuestionLanguageOffer`) stays for an L5 question (another language wholly); weaker reply checking for languages outside our 35 is accepted (Owner-visible defaults). Also: the planner's language disagreement is recorded for operators only (CR-3), and the offer request is charged only on the route's request limiter (CR-1). Rulings of 2026-10-14: a signed-out person's question never reaches the fast AI and is never offered a rewrite (L-NOCONSENT); a preview with no Anthropic gate has no fast check (L-ROUTE); eld's clause rule may cost one extra fast call on some single-language questions, and a mix it misses keeps today's lock (L-MIX).
9. **Rules gate for the owner-editable instruction** (owner's editable-prompt requirement; pre-flight PF-L12): before an edited `questionLanguagePolicy.instruction` goes live, the requirement asks for a rules gate (the prompt-injection suite and the answer form kept). P2L ships the length and control-character checks, and (final review I4) every publisher refuses, before sealing, an instruction holding a reserved frame token and a fast-check model the price table does not list (`HOSTED_REGISTER_QUESTION_LANGUAGE_INVALID` on hosted; the API's own boot refusal codes in kits v2 and v3; the hosted readiness check reads the sealed row too). The full rules gate is a follow-up task for the owner to approve.
10. **Keep the debate shape out of force until the pop-up ships (ruling L-POPUP-FIRST, final review I5).** Do not put `debateShapePolicy` in force on any deployment with a fast check (the preview with its Anthropic gate, or hosted after 0117) until P2L Task 18 (the /new pop-up) is deployed. Today's page cannot show the "your question mixes languages" choice. The code also defends itself: an ask without `site_language` (today's page, the practice program, an old client) is never shown an offer; a real mix is locked in the fast AI's main language with the record code `FAST_MIX_NO_OFFER:NO_SITE_LANGUAGE`. Task 18's page always sends `site_language`.

## Self-review: spec → tasks

| Spec item | Task |
|---|---|
| L1 site language proposed, sent with the question (optional field; the page reads the locale it knows) | 9, 18 |
| L2 eld 2.1.0 exact pin, its 60 languages vs our 35, `isReliable()` + minimum length, threshold tuned on the #158 set | 2, 3 |
| L3 fast AI (Haiku 5.5, thinking low (deviation 1), ~5 s, strict JSON, allowed codes), owner setting naming provider + model, unknown provider refused at boot | 4, 5, 6, 12 |
| Owner-editable instruction: code safety frame, text in a sealed optional row | 4, 5, 12 |
| Decision table (same, other wholly, real mix, fast down/timeout/unknown, never block, local mode) | 7, 10 |
| L4 rewrite offer and person's approval; L5 no pop-up for another language wholly | 7, 10, 18 |
| Consent before the fast call | D1, 11 (route order + test) |
| Pop-up on /new, EN + RO wording, 35 locales via the translator process, no internals | 18 (+ P2c amendment) |
| The server decides: signed reference binding question, result and choice; endpoint vs first half of POST | D1, D2, 8, 10, 11 |
| Storing: tag/name in `core.run`; original question + rewrite accepted | D3, 10, 11 |
| L6 every AI call: field + ONE named sentence (judge, map, story, answer writer, synthesizer/checker) | 1, 13, 15, 16, 17 |
| L8 built inside the new debate shape (only shape runs carry the lock; the step runs only with the shape row) | 11, 13, 14, 15, 16, 17 (pre-flight PF-L64) |
| eld sees a mix (ruling L-MIX: the clause rule, measured, never settles) | 2, 3, 7 |
| Consent: a signed-out person never reaches the fast AI (L-NOCONSENT) | D1, 10, 11 |
| Money: root 0's room and B9 frame the lock (PF-L38); a projected record when usage is missing (PF-L16) | 6, 13, 17, 19 |
| Kit v3 carries debateShapePolicy, mapContractHash and questionLanguagePolicy (L-KIT) | 0, 12 |
| L7 planner's FIRST field; `LANGUAGE_PLANNER_DISAGREES` recorded, never acted on — an operator-only map note, never a mark (ruling CR-3) | 14, 15 |
| `replyLanguageCheck` against the locked code, no re-guess (new shape only) | 1, 13, 15, 16, 17 |
| Test doubles answer the planner's field; tests set the language on `startRun` | 17 |
| Site cost in the provider's daily pot (preview) and hosted equivalent | 6, 12, 19 |
| Privacy: no question text in logs, codes only | Global Constraints, 8, 10, 19 |
| Unit tests for the decision table (8 cases) | 7, 10 |
| API tests refusing made-up language / rewrite / expired / mismatched reference | 8, 11 |
| Contract hash consequences | 13, 15, Owner steps 1 |
| Row absent = today byte for byte | Global Constraints, 11, 13, 16, 17, 20 |
| Questions outside the 35 | Owner-visible defaults, 1, 7 |
| Practice language cases and pass bar | P2d amendments (applied to P2d, Task 7b) |
| Controller rulings CR-1..CR-7 | CR-1: D1, 0, 11; CR-2: 3, 7; CR-3: 14, 15; CR-4: 0, 4; CR-5: D2, 8, 10, 12, 18; CR-6: 6, 12; CR-7: Owner steps 8 |
| Controller rulings 2026-10-14 | L-MIX: 2, 3, 7; L-NOCONSENT: D1, 10, 11; L-ROUTE: Owner-visible defaults, 12; L-KIT: 0, 12 |

Implementer note (pre-flight PF-L64): sealed values stay untouched across the plan — no bootstrap edit, no existing migration edit, no `packages/db/src/index.ts` edit; the new row is optional and sealed per version; Tasks 13 and 16 move no sealed hash; Task 15 moves the map hash, which is Owner step 1.
