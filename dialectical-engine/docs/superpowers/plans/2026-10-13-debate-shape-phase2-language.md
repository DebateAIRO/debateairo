# Debate Shape Phase 2 — P2L, question language (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a new-shape debate (the optional register row `debateShapePolicy` is present), the debate's language is decided once, before the debate exists, and locked. The decision works like this:

- the page sends the person's site language with the question;
- a local library (eld) checks the question on our server;
- only when eld does not settle it, one short fast-AI call names the language;
- a question that really mixes languages gets a one-language rewrite the person approves.

The locked code and English name go into `core.run.argument_language_tag` / `argument_language_name`. Every AI call of the debate then gets them in two forms: the material field `question_language: {code, name}` and ONE named sentence. Every reply check compares against the locked code instead of guessing the question again. The angle planner also names the language it sees, and a disagreement is recorded, never acted on.

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

## Global Constraints

**Row absent = today, byte for byte**

- With `debateShapePolicy` absent, `submit` does not build, call or read anything new. The new ask fields (`site_language`, `question_language_choice`) are accepted by the schema and ignored. `core.run` gets `detectArgumentLanguage`'s tag and name, and the stored `ask_contract` has exactly today's four keys.
- A run without a shape receipt (P2a: no `envelope_basis.shape`) is argued with today's directive and today's reply check, even when the API that admitted it had the row. This includes a one-maker run admitted while the row was present, which has no shape: its locked tag and name are stored and used by today's directive.
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

**Shipped corpus.** Every new non-test `.ts` under packages/, apps/ or tools/ goes into tests/support/shipped-corpus.manifest.txt. Regenerate with `SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`.

**Running tests (owner's 16 GB Mac)**

- Before any `vitest run`, `pgrep -fl 'vitest[ ]run'` must show at most one other run, and `memory_pressure | tail -1` must show at least 40% free.
- One file at a time: `pnpm exec vitest run <file>`.
- Integration files (embedded Postgres) run alone, never beside a typecheck or another integration file.
- Never the full suite; CI is the judge.

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
4. **The fast AI blocks or slows the person.**
   - Risks: a hung transport, a malformed reply, a proposal in the wrong language.
   - Caught by Task 7 (every DOWN reading locks) and Task 10 (the time limit aborts at `timeoutMs`; a slow transport ends in a lock).
5. **The reply check still re-guesses the question in a shape run.**
   - Caught by Task 1 (the locked check reads the code even when the guesser would read "und") and Task 17 (the shape run's captured prompts carry the named sentence and never the fallback form).
6. **The planner's language changes the debate.**
   - Caught by Task 15: a disagreement is one record, and every later call still carries the locked language.

## Decisions the spec left to the build

**D1. The check is the first half of `POST /v1/asks`, not its own endpoint.** Reasons:

1. **The route's pre-flight order is the safety order.** The crisis check, consent, the preview team rule, the per-person admission charge and the country gate already run, in this order, before `submit`. A separate endpoint would have to repeat all five in the same order. Getting one wrong would send a crisis question, or a question without consent, to an AI company.
2. **The common case costs no extra round trip.** When eld settles the question, or the fast AI names one language, the same request goes on to create the debate. Only a real mix, which is rare, needs a second request.
3. **No new route.** There is no new entry in the closed `authorizationPolicyInventory`, no new admission scope (a new scope would need a new sealed admission-policy value), and no new CSRF or CORS surface.
4. **`submit` is also what the practice tool calls** (`tools/preview-practice/practice-debate.ts`). Putting the step inside `submit`, not in the route, gives practice debates the same language flow.
5. **No lock is held during the call.** The step runs before billing, admission and the preview admission lock, so the up-to-5-second call never holds the advisory lock that serialises preview asks.

The cost: in the real-mix case the person's ask allowance is charged twice, once for the request that returned the offer and once for the resubmission. Accepting a reference as "already charged" would let a reference be replayed to skip admission.

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

The key is 32 random bytes made when the API process starts. A restart or a second API process makes outstanding references fail with `QUESTION_LANGUAGE_CHECK_INVALID`, and the page then runs the check again without a reference (one extra fast call at most).

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
- **Serbian or Bosnian in Latin script on the Croatian site.**
  - eld reads them as Croatian and locks Croatian with no fast call.
  - On any other site the fast AI names Serbian (`sr-Latn`).
  - **RISK (owner call):** if this matters, list `hr` as a site that always asks the fast AI (one constant in `decide.ts`).
- **Local mode with no paid AI.** eld and the site language decide, and no rewrite is offered.
  - "Paid AI available" means the preview with an Anthropic gate socket, or hosted with an Anthropic support target and Task 19 applied.
  - A plain local install (relays or subscriptions) has no paid fast check.
- **Each fast check uses one of the preview gate's daily call slots** (`max_paid_posts_per_day`) and briefly holds about $0.0165 of the $2 Anthropic pot until it settles.
- **The real-mix pop-up charges the person's ask allowance twice** (D1).
- **The fast check's instruction text and settings live in the optional row `questionLanguagePolicy`.** Absent means the code's start values (Claude Haiku 5.5 `claude-haiku-5-5`, effort low, 5 s, the default text in Task 4). An owner edit is a new register version.
- **The planner-disagreement record shows as a plain line in the answer's honesty drawer.** Every condition mark does. Wording option 1 is in Task 14, options 2–3 are in "Owner steps".
- **An English question on the Romanian site is debated in English with no pop-up (L5).** The debate page's existing language strip (`QuestionLanguageOffer`, spec 2026-09-26 §14.3) still offers to show the page in English. That strip is about the page, not the debate, and is unchanged. Owner call if it should be hidden for shape runs.
- **A person who presses Esc or clicks outside the pop-up is treated as "Edit"** (back to the question box, nothing sent), never as a choice.

## Controller rulings (2026-10-13, override the sections above where they differ)

- **CR-1 (charged twice, D1).** If the route's "per-person admission charge" is only the anti-spam request limiter, charging it for the offer request is accepted. If it touches the person's debate allowance or money (daily/monthly debates, credit, billing hold), the offer request must NOT consume it: the offer returns before any allowance or billing step, and only the resubmission is charged. Task 0's pre-flight says which one it is, with file:line.
- **CR-2 (Croatian site and near neighbours).** Sites where eld can be confidently wrong about a near neighbour always ask the fast AI: `ga`, `id`, `mt` (eld lacks them), `hr` (Serbian/Bosnian in Latin script), plus every site Task 3 measures with a confident near-neighbour confusion. One constant in `decide.ts`, filled from Task 3's numbers. Each extra check costs about $0.00005.
- **CR-3 (planner disagreement is measurement only).** `LANGUAGE_PLANNER_DISAGREES` never reaches people: not in the honesty drawer, the story or any page text (rule: no engine internals in user-facing text). Record it in an operator-only channel (a run note or record the practice report and operators read), not as a user-visible condition mark. If the kernel's condition marks have no operator-only kind, do NOT add it to `CONDITION_MARKS`; then the mark-count pins stay at P2b's value, and cross-plan amendment 2 is dropped.
- **CR-4 (thinking off).** After Task 0 merges origin/dev (it brings the owner's thinking-effort setting, PR #149), check whether the preview gates (TypeScript and Python) accept thinking off for Haiku. If they do, the row's start value is off. Otherwise `low`, as in Contract deviation 1.
- **CR-5 (check-reference key).** The HMAC key must be the same for every API process of one deployment. Derive it (HKDF, purpose label `question-language-check-v1`) from an existing server secret the API already loads, if one fits. Only if none exists, keep the per-process random key and document the single-process limit. A reference that fails on another process must never show the person the pop-up twice in a row for the same question: the page re-runs the check, and a second offer for the same question hash within 15 minutes is answered with the fallback lock (the site language or eld's confident language) instead of another pop-up.
- **CR-6 (transport).** The fast check reaches Anthropic only through the preview gate (preview) or the hosted support target that already exists (hosted). The API gets no new vendor credential in preview. No question text in any log line: codes, hashes and timings only.
- **CR-7 (kept defaults; owner told at the end).** The Romanian pop-up keeps the owner's informal «ta» text (adjusted for filled names). The debate page's language strip stays for L5 questions. Weaker reply checking for languages outside our 35 is accepted.

## Cross-plan amendments (exact edits other plans need; this plan does not edit them)

**P2b (the runner shape)**

1. **Task 2, `mapWrongLanguage`.**
   - Do NOT replace the branch's `mapWrongLanguage(text, expected: ReplyLanguageExpectation)` with the `detectArgumentLanguage` version shown in P2b Task 2 Step 3. That version would bring the question guesser back into the map (spec ruling R-5 and this plan's L6).
   - Keep the current body.
   - In `tests/unit/map-multilingual.test.ts`, replace `mapWrongLanguage("Autobuzele gratuite …", "ro-RO")` with `mapWrongLanguage("Autobuzele gratuite …", { tag: "ro", script: "Latin" })`.
   - `mapPrimarySubtag` stays: the opposite template uses it.
2. **Task 3 (marks): no edit needed.** P2L Task 14 inserts a ninth shape mark, `LANGUAGE_PLANNER_DISAGREES`, right after `"SCRUTINY-EXTENDED"`. It also appends it to `DEBATE_SHAPE_MARKS` and bumps P2b's length pins from 46 to 47. P2b's slice test (`at + 1 .. at + 1 + DEBATE_SHAPE_MARKS.length`) stays true.
3. **Task 6 / Owner steps: do not publish the preview's `mapContractHash` before P2L Task 15 lands.**
   - P2L changes the angle planner's instruction and answer form, so `mapPromptContractHash()` changes once more.
   - Dev registers re-seal by themselves.
4. **Task 12 (`map-stage.ts`).** `mapConditionRecords(result, runId)` must convert EVERY `MapMarkRecord`, including P2L's new one. It must not be a fixed list of five. The test's `mapAnglesSpec({ questionLine, languageName, languageTag })` call keeps working: P2L keeps those context fields.
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

**INTERFACE (binding names)** — add a section "7. Question language (P2L)" listing: `QuestionLanguage`, `questionLanguageSentence`, `QUESTION_LANGUAGE_FIELD` (`"question_language"`), `replyLanguageCheckFor`, row `questionLanguagePolicy` (kind `QUESTION_LANGUAGE_POLICY`), mark `LANGUAGE_PLANNER_DISAGREES`, ask fields `site_language` and `question_language_choice`, the 409 code `QUESTION_LANGUAGE_CHOICE_NEEDED`. Edit it when this plan is executed (it is a binding-names file, not a sibling plan).

## Execution order (recommendation)

1. **P2a** — nearly done.
2. **P2b, whole.** P2L's runner tasks (13–17) edit functions P2b creates or reshapes:
   - `framedJudgePrompt` and its test seam;
   - `buildSynthesisRolePrompt`'s new parameter;
   - `map-stage.ts` and the map package;
   - the condition-mark pins (46 → 47);
   - the shape harness.

   Running P2L first would rewrite them twice.
3. **P2L Tasks 0–17, then 20** (kernel, eld, tuning, row, fast check, decision, reference, contract, decider, ask wiring, boot and publishers, judge / answer writer, marks, map, story, runner wiring).
   - These must land before any publish of P2b's `mapContractHash` (amendment P2b-3).
   - Tasks 0–12 touch apps/api, packages/contract and packages/register, apart from one kernel export line. They could run beside P2b in another session, but on the owner's Mac only one heavy test run is allowed at a time, so sequential is recommended.
4. **P2c**, with amendments P2c-1 and P2c-2. Its Task 8 rewrites `NewDebatePageClient.tsx`, `defaults.tsx` and `apps/ui/lib/api.ts`. P2L's UI task edits the same files, so it follows P2c to avoid a three-way merge, and P2c's translator batch carries P2L's six keys.
5. **P2L Task 18** (the pop-up and the site language sent).
6. **P2L Task 19** (hosted run-less spend), any time before hosted go-live. The preview does not need it.
Run Task 20 again after Tasks 18 and 19.
7. **P2d**, with amendments P2d-1 to P2d-6.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/kernel/src/question-language.ts` | create | `QuestionLanguage`, language table, sentence, field, locked expectation, `replyLanguageCheckFor`, `languageDirectiveFor` (Task 1) |
| `packages/kernel/src/argument-language.ts` | modify | export `ARGUMENT_LANGUAGE_NAMES` (the existing table, renamed export only) (Task 1) |
| `packages/kernel/src/reply-language.ts` | modify | export `replyScriptOfTag` (reads the existing private table) (Task 1) |
| `packages/kernel/src/index.ts` | modify | `export * from "./question-language.js"`; Task 14's mark |
| `apps/api/package.json`, `pnpm-lock.yaml` | modify | `eld` 2.1.0 exact (Task 2) |
| `apps/api/src/question-language/eld.ts` | create | eld reader, the 60-language list, `SITE_LANGUAGES_ELD_LACKS` (Task 2) |
| `tools/question-language-tune/legal-sentences.ts`, `tools/question-language-tune/measure-eld.ts` | create | the #158 legal-page sentence set; the measurement (Task 3) |
| `apps/api/src/question-language/eld-tuning.ts` | create | measured numbers: database size, minimum letters, site aliases (Task 3) |
| `packages/register/src/question-language-policy.ts` | create | optional row `questionLanguagePolicy`: parse, read, row, start values, default instruction (Task 4) |
| `apps/api/src/question-language/fast-check.ts` | create | contract, answer form, framing, reply reader, the time-limited check (Task 5) |
| `apps/api/src/question-language/transport.ts` | create | Anthropic Messages transport over a given fetch (preview gate or hosted key) (Task 6) |
| `apps/api/src/question-language/decide.ts` | create | the pure decision table (Task 7) |
| `apps/api/src/question-language/reference.ts` | create | sign and verify the check reference; verify a choice (Task 8) |
| `packages/contract/src/index.ts`, `packages/contract/src/client.ts` | modify | `SiteLanguageSchema`, the two ask fields, the 409 offer schema, `submitAskOrLanguageChoice` (Task 9) |
| `apps/api/src/question-language/decider.ts` | create | `QuestionLanguageDecider`, `QuestionLanguageLock`, the run-language helpers (Task 10) |
| `apps/api/src/index.ts` | modify | settings field, `submit` first step, both `startRun` calls, the refusal class and its 409 (Task 11) |
| `apps/api/src/question-language/boot.ts` | create | the paid route (preview gate / hosted key / none), boot refusals, `composeQuestionLanguage` (Task 12) |
| `apps/api/src/main.ts`, `tools/preview-practice/practice-ask-composition.ts` | modify | boot: row, eld, transport choice, decider (Task 12) |
| `deploy/preview-auth-dev/v1/publish-register-v2.ts`, `apps/runner/src/hosted-register-publish.ts` | modify | the optional row in both publishers (Task 12) |
| `packages/judgement/src/index.ts`, `apps/runner/src/index.ts` | modify | judge, review, panel, answer writer, answer checker take the locked language (Task 13) |
| `packages/kernel/src/index.ts`, `packages/serve/src/index.ts`, `apps/ui/lib/v3/labels.ts`, `apps/ui/lib/report/reportModel.ts`, `apps/ui/messages/*/debateChrome.json` | modify | mark `LANGUAGE_PLANNER_DISAGREES` (Task 14) |
| `packages/map/src/{types,prompts,specs,replies,orchestrator}.ts` | modify | named sentence, field, planner's first field, disagreement record (Task 15) |
| `packages/story/src/{contracts,writer,material}.ts`, `apps/runner/src/story-snapshot.ts` | modify | story in the locked language (Task 16) |
| `apps/runner/src/index.ts`, `tests/support/preview-gate-stubs.ts`, `tests/support/debate-shape-harness.ts` | modify | the shape run's language; doubles (Task 17) |
| `apps/ui/components/QuestionLanguageChoice.tsx`, `apps/ui/app/new/NewDebatePageClient.tsx`, `apps/ui/lib/api.ts` | create/modify | the pop-up; site language sent (Task 18) |
| `migrations/0117_language_check_spend.sql` + lineage + loader, `packages/budget/src/model-spend.ts` | create/modify | hosted run-less site cost (Task 19) |

---
### Task 0: Preconditions

P2L builds on P2b's map stage, judge legs, synthesizer length parameter, marks and harness, and on origin/dev's #158 (the legal-page sentence set and `foreignLatinLetterCount`).

**Files:** none edited by hand (at most a merge commit).

- [ ] **Step 1: P2b is in this branch**

Run: `grep -n "export function framedJudgePromptForTest\|framedJudgePromptForTest =" packages/judgement/src/index.ts && grep -n "DEBATE_SHAPE_MARKS" packages/kernel/src/index.ts && ls apps/runner/src/map-stage.ts tests/support/debate-shape-harness.ts`

Expected: each grep prints a line, and both paths are listed. If anything is missing, STOP and report to the controller: P2L runs after P2b (see "Execution order").

- [ ] **Step 2: #158 is in this branch**

Run: `git merge-base --is-ancestor b437f5d9a HEAD && echo IN || echo OUT`

If it prints `OUT`, run `git fetch origin dev && git merge --no-ff origin/dev`. The message is `Merge origin/dev (question-language #158) before P2L`, followed by a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. A conflict that is not a plain "keep both" means STOP and report.

- [ ] **Step 3: Note the hashes P2L must not move**

Run:

`pnpm exec tsx -e 'import {createHash} from "node:crypto"; import {JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT as t} from "@debateai/judgement"; console.log(createHash("sha256").update(t).digest("hex"))'`

Write the printed value into the controller's notes as `JUDGE_HASH_AFTER_P2B`. Task 13's test pins it.

---

### Task 1: Kernel — the locked language, its sentence, its field and its reply check

**Files:**
- Create: `packages/kernel/src/question-language.ts`
- Modify: `packages/kernel/src/argument-language.ts` (export the name table), `packages/kernel/src/reply-language.ts` (export `replyScriptOfTag`), `packages/kernel/src/index.ts` (one export line), `tests/support/shipped-corpus.manifest.txt`
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
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-kernel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ARGUMENT_LANGUAGE_NAMES, QUESTION_LANGUAGE_FIELD, argumentLanguageDirective, languageDirectiveFor,
  lockedReplyLanguageExpectation, questionLanguageField, questionLanguageFromRun, questionLanguageOf,
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
  });
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-kernel.test.ts`

Expected: FAIL. `questionLanguageOf`, `ARGUMENT_LANGUAGE_NAMES` and the other new names are not exported.

- [ ] **Step 3: Implement**

`packages/kernel/src/argument-language.ts`: change `const LANGUAGE_NAMES = Object.freeze({` to `export const ARGUMENT_LANGUAGE_NAMES = Object.freeze({`. Then replace every other use of `LANGUAGE_NAMES` in that file with `ARGUMENT_LANGUAGE_NAMES` (`type KnownArgumentLanguageTag = keyof typeof ARGUMENT_LANGUAGE_NAMES;` and the `detected` helper). Nothing else changes, so the guesser's output is untouched.

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
export type EldReading = Readonly<{ code: string | null; reliable: boolean; letters: number }>;
export interface EldReader { read(text: string): EldReading }
export async function loadEldReader(size: EldDatabaseSize): Promise<EldReader>;
```

- [ ] **Step 1: Check the package before installing (supply chain)**

These are read-only checks. Run each and compare:
- `npm view eld@2.1.0 dist.integrity` must print `sha512-hDQ9FX17th7NDNMO8/St6m3ADQVqjF0sQoOHI6NUAxC7yDaPmZ9wC9d8zau/9FIqOV7KtNwrPKRt6fkkrzZj0g==`.
- `npm view eld@2.1.0 scripts --json` must print nothing (no install scripts), so `strictDepBuilds` needs no new row.
- `npm view eld@2.1.0 dependencies --json` must print nothing (no dependencies).
- `npm view eld@2.1.0 time.2.1.0` must print `2026-08-13…`, which is older than the workspace's 7-day `minimumReleaseAge`.

If any value differs, STOP and report: the package changed under its version.

- [ ] **Step 2: Install with the exact pin**

Run: `pnpm --filter @debateai/api add eld@2.1.0 --save-exact`

Then run: `grep -n '"eld": "2.1.0"' apps/api/package.json`. Expected: one line.

- [ ] **Step 3: Write the failing test** `tests/unit/question-language-eld.test.ts`:

```ts
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ELD_LANGUAGES, SITE_LANGUAGES_ELD_LACKS, loadEldReader } from "../../apps/api/src/question-language/eld.js";

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
    expect(reader.read("   ")).toEqual({ code: null, reliable: false, letters: 0 });
    expect(reader.read("2 + 2 = 4?")).toMatchObject({ letters: 0 });
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
export type EldReading = Readonly<{ code: string | null; reliable: boolean; letters: number }>;
export interface EldReader {
  read(text: string): EldReading;
  languages(): readonly string[];
}

type EldDetector = Readonly<{
  detect(text: string): Readonly<{ language: string; isReliable(): boolean }>;
  info(): Readonly<{ languages?: unknown }>;
}>;

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
  return Object.freeze({
    read(text: string): EldReading {
      const letters = text.match(/\p{L}/gu)?.length ?? 0;
      if (letters === 0) return Object.freeze({ code: null, reliable: false, letters });
      const result = detector.detect(text);
      const code = typeof result.language === "string" && result.language !== "" ? result.language : null;
      return Object.freeze({ code, reliable: code !== null && result.isReliable(), letters });
    },
    languages(): readonly string[] {
      const listed = detector.info().languages;
      const codes = Array.isArray(listed) ? listed : typeof listed === "object" && listed !== null ? Object.keys(listed) : [];
      return Object.freeze(codes.map(String));
    }
  });
}
```

Import `exhaustive` from `@debateai/kernel` at the top. If `info().languages` turns out to be an object keyed by full names, adapt `languages()` so it returns the ISO codes. Read `node_modules/eld/index.d.ts` for its exact shape, and say so in the commit message. Add the file to the manifest.

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

The spec asks for eld's confidence threshold to be tuned on the 17,833-sentence legal-page set used for #158. That set is every 6–30-word sentence of the site's translated Terms and Privacy pages, in 35 locales. This task measures three database sizes × five minimum lengths, chooses one configuration by a fixed rule, and records the chosen numbers and the measurement in code.

**Files:**
- Create: `tools/question-language-tune/legal-sentences.ts` (the #158 extractor, moved out of the test so the tool and the test share it), `tools/question-language-tune/measure-eld.ts`, `apps/api/src/question-language/eld-tuning.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-eld-tuning.test.ts` (create)

**Interfaces:**
- Produces:
```ts
// tools/question-language-tune/legal-sentences.ts
export function legalSentences(locale: string): string[];
export const LEGAL_LOCALES: readonly string[];
export function withoutDiacritics(text: string): string;
// tools/question-language-tune/measure-eld.ts
export type EldTuningRow = Readonly<{ size: EldDatabaseSize; minLetters: number; sentences: number;
  settlesOwnSite: number; wrongLockable: number; wrongLockableRoEn: number; roPlainSettles: number; roPlainWrong: number }>;
export async function measureEld(sizes: readonly EldDatabaseSize[], minLetters: readonly number[]): Promise<readonly EldTuningRow[]>;
export function chooseEldTuning(rows: readonly EldTuningRow[]): EldTuningRow | null;
export async function siteAliasCandidates(size: EldDatabaseSize, minLetters: number): Promise<Readonly<Record<string, readonly string[]>>>;
// apps/api/src/question-language/eld-tuning.ts
export const ELD_TUNING: Readonly<{ database: EldDatabaseSize; minLetters: number; measured: Readonly<{ on: string;
  sentences: number; settlesOwnSite: number; wrongLockable: number; wrongLockableRoEn: number }> }>;
export const ELD_SITE_ALIASES: Readonly<Record<string, readonly string[]>>;
export function eldConfident(reading: EldReading): boolean;
```

The definitions below are what the test pins:
- **settlesOwnSite**: the number of sentences for which eld is confident (`reliable && letters >= minLetters`) and names the sentence's own locale. Each one is a question settled with no fast call.
- **wrongLockable**: the number of sentences for which eld is confident and names a DIFFERENT one of our 35. Asked on the site of that other language, each would be a wrong lock.
- **wrongLockableRoEn**: the part of `wrongLockable` where a Romanian sentence reads as English or the reverse.
- **roPlain\***: the same two figures for the Romanian sentences with every diacritic removed. This is the "Romanian without diacritics" case.

**The choice rule** (`chooseEldTuning`):
1. Keep only the rows with `wrongLockableRoEn === 0`, `roPlainWrong === 0`, and `wrongLockable * 2000 <= sentences` (at most 0.05%).
2. Among those, take the largest `settlesOwnSite`.
3. On a tie, take the smaller database, then the smaller `minLetters`.
4. If no row is left, the result is `null`. That means STOP and report to the controller with the table; the owner decides.

- [ ] **Step 1: Move the extractor.** Create `tools/question-language-tune/legal-sentences.ts` with the #158 code (from `tests/unit/argument-language.test.ts`, the block that starts `function legalSentences`), exported:

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
```

In `tests/unit/argument-language.test.ts`, replace the local `legalSentences` and `LEGAL_LOCALES` with an import of these two names from `../../tools/question-language-tune/legal-sentences.js`. Delete only the moved lines.

- [ ] **Step 2: Write the failing test** `tests/unit/question-language-eld-tuning.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadEldReader } from "../../apps/api/src/question-language/eld.js";
import { ELD_SITE_ALIASES, ELD_TUNING, eldConfident } from "../../apps/api/src/question-language/eld-tuning.js";
import { LEGAL_LOCALES, legalSentences, withoutDiacritics } from "../../tools/question-language-tune/legal-sentences.js";
import { chooseEldTuning, type EldTuningRow } from "../../tools/question-language-tune/measure-eld.js";

const row = (over: Partial<EldTuningRow>): EldTuningRow => ({ size: "medium", minLetters: 20, sentences: 20_000, settlesOwnSite: 10_000,
  wrongLockable: 0, wrongLockableRoEn: 0, roPlainSettles: 500, roPlainWrong: 0, ...over });

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
import { LEGAL_LOCALES, legalSentences, withoutDiacritics } from "./legal-sentences.js";
import { ELD_LANGUAGES, loadEldReader, type EldDatabaseSize, type EldReading } from "../../apps/api/src/question-language/eld.js";

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
          else if (LEGAL_LOCALES.includes(reading.code!)) {
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

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  const rows = await measureEld(["small", "medium", "large"], [0, 12, 20, 30, 40]);
  console.table(rows);
  const chosen = chooseEldTuning(rows);
  console.log(JSON.stringify({ chosen }, null, 2));
  if (chosen !== null) console.log(JSON.stringify(await siteAliasCandidates(chosen.size, chosen.minLetters), null, 2));
}
```

The tool is not shipped runtime code, but it lives under tools/, so check it against the source rules. The last block uses `process.argv`, not `process.env`, which the rules allow. Add it to the manifest if tools/ files are listed there (`grep -c "^tools/" tests/support/shipped-corpus.manifest.txt`).

- [ ] **Step 5: Measure (one run, about 1–2 minutes, about 140 MB)**

Run: `pnpm exec tsx tools/question-language-tune/measure-eld.ts`

Keep the printed table. If `chosen` is `null`, STOP and report the table to the controller. The owner decides between a looser bar and the fast AI on every question.

For the aliases, keep only codes that cover at least 5% of that locale's confident readings. `ms` for `id` is expected. Drop any alias that is one of our 35, and any for `ga`/`mt` that names a major language (for example `en`, `it`): a wrong alias there would turn an English question on the Maltese site into Maltese. Report what was dropped.

- [ ] **Step 6: Record the numbers** — create `apps/api/src/question-language/eld-tuning.ts`. Fill in the `<…>` placeholders from Step 5's output, and paste the whole table into the comment:

```ts
import type { EldDatabaseSize, EldReading } from "./eld.js";

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
  measured: Object.freeze({ on: "<YYYY-MM-DD>", sentences: <n>, settlesOwnSite: <n>, wrongLockable: <n>, wrongLockableRoEn: 0 })
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

export function eldConfident(reading: EldReading): boolean {
  return reading.code !== null && reading.reliable && reading.letters >= ELD_TUNING.minLetters;
}
```

Add both new files to the manifest.

- [ ] **Step 7: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-eld-tuning.test.ts`
- `pnpm exec vitest run tests/unit/argument-language.test.ts`

- [ ] **Step 8: Commit**

```bash
git add tools/question-language-tune apps/api/src/question-language/eld-tuning.ts tests/unit/question-language-eld-tuning.test.ts tests/unit/argument-language.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "Question language: eld tuned on the legal-page set — size, minimum letters and site aliases measured and recorded

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

Then add `invalid`, `parseQuestionLanguagePolicy`, `readQuestionLanguagePolicy`, `policyAst`, `questionLanguagePolicyRow` and `questionLanguagePolicyStartValues`, line for line as `debate-shape-policy.ts` does them:
- the first zod issue's path, joined with dots after `$`, or `$` for the root;
- `TypeError` with the `QUESTION_LANGUAGE_POLICY_INVALID:` prefix;
- `readQuestionLanguagePolicy` returns `null` for no row;
- the row builder re-parses and refuses a blank `sourceRef` with `QUESTION_LANGUAGE_POLICY_INVALID:sourceRef`.

The start values are those in the test. In `packages/register/src/index.ts`, export the eight names next to the debate-shape exports. Add the file to the manifest.

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
      throw new TypedDomainError("QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN", "The question-language instruction holds a token reserved for the safety frame");
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
  const main = questionLanguageOf(parsed.main_language, questionLine);
  if (main === null) return down("UNKNOWN_LANGUAGE");
  if (!parsed.is_real_mix) return Object.freeze({ kind: "ONE", main });
  const seen = parsed.languages_seen.map((code) => questionLanguageOf(code, questionLine))
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

If `readPromptFrame` takes a `FramedPrompt` rather than a packet (check its signature in `packages/providers/src/prompt-frame.ts`), keep `framedQuestionLanguageCheck` returning the packet and adapt only the test's first line to what `readPromptFrame` takes. Add the file to the manifest.

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/question-language-fast-check.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/question-language/fast-check.ts tests/unit/question-language-fast-check.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API: the fast language check — owners' text in the code's frame, a strict reply reader, a time limit that never blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The transport — Anthropic Messages through the preview gate or a hosted key

The API has no `ProviderGateway`, and the runner's gateway refuses a call with no run (`PROVIDER_RUN_REQUIRED`). The two existing run-less API calls (support chat, publication check) use their own adapter. This transport is the same idea, reduced to one Anthropic Messages POST:
- through the preview's guarded fetch (`createPreviewGuardedFetch`, the Anthropic gate, no key header), which makes it a site cost in the gate's daily pot;
- or, on hosted, with the support target's key.

**Files:**
- Create: `apps/api/src/question-language/transport.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-transport.test.ts` (create)

**Interfaces:**
- Consumes: `anthropicMessagesRequestBody`, `anthropicMessagesRequestHeaders`, `readAnthropicMessagesReply`, `PREVIEW_ANTHROPIC_MESSAGES_URL`, `ANTHROPIC_MESSAGES_BASE_URL`, `ANTHROPIC_MESSAGES_PATH` (`@debateai/providers`); `FastCheckTransport` (Task 5); `QuestionLanguageFastCheck` (Task 4).
- Produces:
```ts
export type FastCheckUsage = Readonly<{ inputTokens: number; outputTokens: number }>;
export function anthropicFastCheckTransport(deps: Readonly<{
  fetch: typeof fetch; url: string; credential: string | undefined; settings: QuestionLanguageFastCheck;
  onUsage?: (usage: FastCheckUsage) => Promise<void> | void;
}>): FastCheckTransport;
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-transport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
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
    expect(usage).toEqual([{ inputTokens: 310, outputTokens: 28 }]);
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
});
```

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-transport.test.ts`

- [ ] **Step 3: Implement** `apps/api/src/question-language/transport.ts`:

```ts
import { TypedDomainError } from "@debateai/kernel";
import { anthropicMessagesRequestBody, anthropicMessagesRequestHeaders, readAnthropicMessagesReply } from "@debateai/providers";
import type { QuestionLanguageFastCheck } from "@debateai/register";
import type { FastCheckTransport } from "./fast-check.js";

export type FastCheckUsage = Readonly<{ inputTokens: number; outputTokens: number }>;

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
    const response = await deps.fetch(deps.url, {
      method: "POST",
      headers: anthropicMessagesRequestHeaders(deps.credential),
      body: anthropicMessagesRequestBody({ model: deps.settings.model, maxTokens: deps.settings.maxOutputTokens,
        thinkingLevel: deps.settings.effort, messages: packet.messages }),
      signal
    });
    if (response.status !== 200) {
      throw new TypedDomainError(`QUESTION_LANGUAGE_FAST_CHECK_HTTP_${String(response.status)}`, "The fast language check was refused");
    }
    const reply = readAnthropicMessagesReply(await response.json());
    if (reply.failure !== null) throw reply.failure;
    const normalized = reply.normalized as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
    const inputTokens = Number(normalized.usage?.prompt_tokens ?? 0);
    const outputTokens = Number(normalized.usage?.completion_tokens ?? 0);
    if (deps.onUsage !== undefined && inputTokens >= 0 && outputTokens >= 0) await deps.onUsage(Object.freeze({ inputTokens, outputTokens }));
    const content = normalized.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new TypedDomainError("QUESTION_LANGUAGE_FAST_CHECK_REPLY_EMPTY", "The fast language check sent no text");
    return content;
  };
}
```

If `TypedDomainError`'s code type forbids a computed string, use one code, `QUESTION_LANGUAGE_FAST_CHECK_REFUSED`, with the status in the message, and change the test's pattern to match. Add the file to the manifest.

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/question-language-transport.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/question-language/transport.ts tests/unit/question-language-transport.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API: the fast check's Anthropic transport — through the preview gate as a site cost, or with the hosted key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The decision table (pure)

**Files:**
- Create: `apps/api/src/question-language/decide.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/question-language-decide.test.ts` (create)

**Interfaces:**
- Consumes: `EldReading`, `SITE_LANGUAGES_ELD_LACKS` (Task 2); `eldConfident`, `ELD_SITE_ALIASES` (Task 3); `FastCheckReading` (Task 5); `QuestionLanguage`, `questionLanguageOf`, `lockedReplyLanguageExpectation`, `replyTextLanguageVerdict` (`@debateai/kernel`).
- Produces:
```ts
export type LockSource = "ELD_SITE" | "FAST" | "FAST_MIX_NO_OFFER" | "FALLBACK_ELD" | "FALLBACK_SITE" | "LOCAL_ELD" | "LOCAL_SITE" | "CHOICE";
export type LanguageDecision =
  | Readonly<{ kind: "LOCK"; language: QuestionLanguage; source: LockSource }>
  | Readonly<{ kind: "OFFER"; main: QuestionLanguage; seen: readonly QuestionLanguage[]; proposed: string }>;
export function eldSettles(site: QuestionLanguage, eld: EldReading): boolean;
export function fallbackLock(site: QuestionLanguage, eld: EldReading, questionLine: string, local: boolean): LanguageDecision;
export function decideAfterFast(site: QuestionLanguage, eld: EldReading, fast: FastCheckReading, questionLine: string, maxQuestionBytes: number): LanguageDecision;
```

The table (spec "The flow", L1–L5):

| eld | fast AI | result |
|---|---|---|
| confident, top = site, site is not one eld lacks | not called | LOCK site (`ELD_SITE`) |
| anything else, no paid AI | not called | LOCK eld's top (aliased) if confident (`LOCAL_ELD`), else site (`LOCAL_SITE`); never an offer |
| anything else | DOWN (timeout, transport, unreadable, unknown) | LOCK eld's top (aliased) if confident (`FALLBACK_ELD`), else site (`FALLBACK_SITE`) |
| anything else | ONE language M | LOCK M (`FAST`), even when M ≠ site (L5), no offer |
| anything else | MIX, main M, a valid rewrite | OFFER (M, languages seen, rewrite) |
| anything else | MIX but the rewrite is empty, too long, unchanged, not in M, or fewer than two languages seen | LOCK M (`FAST_MIX_NO_OFFER`), no offer |

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-decide.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideAfterFast, eldSettles, fallbackLock } from "../../apps/api/src/question-language/decide.js";
import { ELD_TUNING } from "../../apps/api/src/question-language/eld-tuning.js";
import type { EldReading } from "../../apps/api/src/question-language/eld.js";
import type { FastCheckReading } from "../../apps/api/src/question-language/fast-check.js";

const L = (code: string, name: string) => ({ code, name });
const RO = L("ro", "Romanian"), EN = L("en", "English"), ID = L("id", "Indonesian"), CA = L("ca", "Catalan");
const sure = (code: string): EldReading => ({ code, reliable: true, letters: ELD_TUNING.minLetters + 40 });
const unsure: EldReading = { code: "ro", reliable: false, letters: 12 };
const MAX = 8192;
const MIX_Q = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const REWRITE = "Ar trebui România să adopte euro sau să aștepte până cresc salariile?";
const mix = (proposed: string, seen = [RO, EN]): FastCheckReading => ({ kind: "MIX", main: RO, seen, proposed });

describe("the question-language decision table (question-language spec 2026-10-13)", () => {
  it("same language: eld confident and equal to the site settles it, no fast call", () => {
    expect(eldSettles(RO, sure("ro"))).toBe(true);
    expect(eldSettles(RO, sure("en"))).toBe(false);
    expect(eldSettles(RO, unsure)).toBe(false);
    expect(eldSettles(RO, { code: "ro", reliable: true, letters: ELD_TUNING.minLetters - 1 })).toBe(false);
  });

  it("a site language eld lacks is never settled by eld, not even through an alias", () => {
    expect(eldSettles(ID, sure("ms"))).toBe(false);
    expect(eldSettles(ID, sure("id"))).toBe(false);
  });

  it("another language wholly (L5): the fast AI's one language is locked, no offer", () => {
    expect(decideAfterFast(RO, sure("en"), { kind: "ONE", main: EN }, "Should Romania adopt the euro before 2030?", MAX))
      .toEqual({ kind: "LOCK", language: EN, source: "FAST" });
  });

  it("a real mix: an offer with the rewrite in the main language", () => {
    expect(decideAfterFast(RO, unsure, mix(REWRITE), MIX_Q, MAX)).toEqual({ kind: "OFFER", main: RO, seen: [RO, EN], proposed: REWRITE });
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
import { ELD_SITE_ALIASES, eldConfident } from "./eld-tuning.js";
import type { FastCheckReading } from "./fast-check.js";

/**
 * The question-language decision (question-language spec 2026-10-13, rulings L1–L5), pure. It never blocks: every
 * path ends in a lock, except a valid real-mix offer, which the person answers.
 */
export type LockSource = "ELD_SITE" | "FAST" | "FAST_MIX_NO_OFFER" | "FALLBACK_ELD" | "FALLBACK_SITE" | "LOCAL_ELD" | "LOCAL_SITE" | "CHOICE";
export type LanguageDecision =
  | Readonly<{ kind: "LOCK"; language: QuestionLanguage; source: LockSource }>
  | Readonly<{ kind: "OFFER"; main: QuestionLanguage; seen: readonly QuestionLanguage[]; proposed: string }>;

const lock = (language: QuestionLanguage, source: LockSource): LanguageDecision => Object.freeze({ kind: "LOCK", language, source });
const primary = (code: string): string => code.split("-")[0]!.toLowerCase();

/** L1/L2: eld settles a question only when it is confident AND names the site language, which it knows. */
export function eldSettles(site: QuestionLanguage, eld: EldReading): boolean {
  return eldConfident(eld) && !SITE_LANGUAGES_ELD_LACKS.includes(primary(site.code)) && eld.code === primary(site.code);
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
      const others = fast.seen.filter((language) => primary(language.code) !== primary(fast.main.code));
      const usable = proposed !== ""
        && proposed !== questionLine.trim()
        && Buffer.byteLength(proposed, "utf8") <= maxQuestionBytes
        && others.length > 0
        && replyTextLanguageVerdict(lockedReplyLanguageExpectation(fast.main, questionLine), proposed) !== "OTHER";
      if (!usable) return lock(fast.main, "FAST_MIX_NO_OFFER");
      const seen = [fast.main, ...others];
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
export function newQuestionLanguageReferenceKey(): QuestionLanguageReferenceKey;            // 32 random bytes, per API process
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
  newQuestionLanguageReferenceKey, signQuestionLanguageReference, verifyQuestionLanguageChoice
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

  it("a reference from another API process (another key) is invalid, so the page checks again", () => {
    expect(() => verify({}, newQuestionLanguageReferenceKey())).toThrow("QUESTION_LANGUAGE_CHECK_INVALID");
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
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";

/**
 * The check reference (question-language spec 2026-10-13, "The server decides"; plan decision D2). It is a stateless
 * signed token. It binds the person, the question, the server's own rewrite and the checked language. It never
 * carries a language or text the page could choose. The key lives in this API process only: a restart or another
 * process makes old references invalid, and the page then checks again.
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

- [ ] **Step 4: Run it and expect PASS**

Run: `pnpm exec vitest run tests/unit/question-language-reference.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/question-language/reference.ts tests/unit/question-language-reference.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API: the question-language check reference — signed, fifteen minutes, bound to the person, the question and the server's rewrite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Contract — the site language, the person's choice and the offer

**Files:**
- Modify: `packages/contract/src/index.ts` (`AskRequestSchema`; new schemas next to `AskAlreadyWaitingSchema`), `packages/contract/src/client.ts` (`submitAskOrLanguageChoice` beside `submitAsk`, and in the `ContractClient` interface)
- Test: `tests/unit/question-language-contract.test.ts` (create)

**Interfaces:**
- Produces:
```ts
export const SITE_LANGUAGE_CODES: readonly [ /* the 35 */ ];
export const SiteLanguageSchema: z.ZodEnum<…>;
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
    const answering = (status: number, body: unknown) => createContractClient({ baseUrl: "https://api.test",
      fetchImplementation: (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch });
    expect(await answering(409, { error: QUESTION_LANGUAGE_CHOICE_NEEDED, message: QUESTION_LANGUAGE_CHOICE_NEEDED, offer: OFFER })
      .submitAskOrLanguageChoice(ASK as never)).toEqual({ kind: "LANGUAGE_CHOICE_NEEDED", offer: OFFER });
    expect(await answering(202, { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" }).submitAskOrLanguageChoice(ASK as never))
      .toMatchObject({ kind: "ACCEPTED", accepted: { status: "QUEUED" } });
    await expect(answering(409, { error: "QUESTION_LANGUAGE_CHECK_EXPIRED", message: "QUESTION_LANGUAGE_CHECK_EXPIRED" })
      .submitAskOrLanguageChoice(ASK as never)).rejects.toMatchObject({ status: 409 });
  });
});
```

Use the client constructor the other client tests use (`grep -n "createContractClient\|export function create" packages/contract/src/client.ts`). If its options are named differently, adapt only the `answering` helper.

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-contract.test.ts`

- [ ] **Step 3: Implement.** In `packages/contract/src/index.ts`, above `AskRequestSchema`:

```ts
/** The 35 site locales (apps/ui/messages/<locale>): the language the person's page is in (question-language spec 2026-10-13, L1). */
export const SITE_LANGUAGE_CODES = Object.freeze(["ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "ga", "he", "hi",
  "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "mt", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi", "zh"] as const);
export const SiteLanguageSchema = z.enum(SITE_LANGUAGE_CODES);
export type SiteLanguage = z.infer<typeof SiteLanguageSchema>;
/** The person's answer to a real-mix offer: a reference the server signed and a choice; never a language or text of its own. */
export const QuestionLanguageChoiceSchema = z.object({
  check_ref: z.string().min(3).max(4096).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u),
  choice: z.enum(["USE_REWRITE", "KEEP_MINE"]),
  original_question_line: z.string().trim().min(1).optional()
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

In `packages/contract/src/client.ts`, beside `submitAsk`, add the method using the documented `recover` hook (as P8c's `CHECKOUT_PENDING` does). Look at how `request(...)` forwards `expectedStatus` and `recover` to `requestJson`, and pass them the same way:

```ts
    submitAskOrLanguageChoice: (input: AskRequest) => request(
      "/v1/asks",
      AskAcceptedSchema.transform((accepted): AskSubmitOutcome => ({ kind: "ACCEPTED", accepted })),
      { method: "POST", body: JSON.stringify(input) },
      undefined,
      (status, body) => {
        if (status !== 409) return null;
        const parsed = QuestionLanguageChoiceNeededSchema.safeParse(body);
        return parsed.success ? { kind: "LANGUAGE_CHOICE_NEEDED", offer: parsed.data.offer } : null;
      }
    ),
```

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
- Consumes: Tasks 2, 3, 5, 7, 8; `AskRequest`, `QuestionLanguageOffer` (Task 9); `detectArgumentLanguage`, `questionLanguageOf`, `TypedDomainError` (`@debateai/kernel`).
- Produces:
```ts
export type QuestionLanguageTrace = Readonly<{
  eld: Readonly<{ code: string | null; reliable: boolean; confident: boolean }> | null;
  fast: Readonly<{ outcome: "ONE" | "MIX" | "DOWN"; reason: string | null; main: string | null }> | null;
  contractHash: string | null }>;
export type QuestionLanguageLock = Readonly<{ language: QuestionLanguage; source: LockSource; siteLanguage: string;
  rewriteAccepted: boolean; originalQuestionLine: string | null; trace: QuestionLanguageTrace }>;
export class QuestionLanguageChoiceNeeded extends Error { readonly offer: QuestionLanguageOffer; readonly trace: QuestionLanguageTrace }
export type QuestionLanguagePort = Readonly<{ decide(input: Readonly<{ ask: AskRequest; ownerScope: string }>): Promise<QuestionLanguageLock> }>;
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
import { newQuestionLanguageReferenceKey } from "../../apps/api/src/question-language/reference.js";

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
const sure = (code: string): EldReading => ({ code, reliable: true, letters: ELD_TUNING.minLetters + 40 });
const deciderWith = (eld: EldReader, fastCheck: FastCheck | null, key = newQuestionLanguageReferenceKey()) =>
  new QuestionLanguageDecider({ eld, fastCheck, key, clock: () => NOW, maxQuestionBytes: 8192 });

describe("the question-language decider (question-language spec 2026-10-13)", () => {
  it("eld settles the site language: locked with no fast call", async () => {
    const fast = fastSaying({ kind: "ONE", main: { code: "en", name: "English" } });
    const lock = await deciderWith(eldSaying(sure("ro")), fast.check).decide({ ask: askOf("Ar trebui România să adopte euro?", { site_language: "ro" }), ownerScope: "owner:a" });
    expect(lock).toMatchObject({ language: { code: "ro", name: "Romanian" }, source: "ELD_SITE", siteLanguage: "ro", rewriteAccepted: false,
      originalQuestionLine: null, trace: { eld: { code: "ro", reliable: true, confident: true }, fast: null, contractHash: null } });
    expect(fast.read).not.toHaveBeenCalled();
  });

  it("no site language sent (an older client): English is the proposal", async () => {
    const lock = await deciderWith(eldSaying(sure("en")), null).decide({ ask: askOf("Should cities price congestion?"), ownerScope: "owner:a" });
    expect(lock).toMatchObject({ language: { code: "en" }, source: "ELD_SITE", siteLanguage: "en" });
  });

  it("a real mix: an offer whose reference the same person can answer with the server's rewrite", async () => {
    const key = newQuestionLanguageReferenceKey();
    const fast = fastSaying({ kind: "MIX", main: { code: "ro", name: "Romanian" }, seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed: REWRITE });
    const decider = deciderWith(eldSaying({ code: "ro", reliable: false, letters: 30 }), fast.check, key);
    const offered = await decider.decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a" }).catch((error: unknown) => error);
    expect(offered).toBeInstanceOf(QuestionLanguageChoiceNeeded);
    const offer = (offered as QuestionLanguageChoiceNeeded).offer;
    expect(offer).toMatchObject({ main_language: { code: "ro", name: "Romanian" }, proposed_question: REWRITE,
      languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }] });
    const used = await decider.decide({ ask: askOf(REWRITE, { site_language: "ro",
      question_language_choice: { check_ref: offer.check_ref, choice: "USE_REWRITE", original_question_line: MIX_Q } }), ownerScope: "owner:a" });
    expect(used).toMatchObject({ language: { code: "ro" }, source: "CHOICE", rewriteAccepted: true, originalQuestionLine: MIX_Q });
    expect(fast.read).toHaveBeenCalledTimes(1);
    await expect(decider.decide({ ask: askOf(MIX_Q, { question_language_choice: { check_ref: offer.check_ref, choice: "KEEP_MINE" } }),
      ownerScope: "owner:b" })).rejects.toThrow("QUESTION_LANGUAGE_CHECK_INVALID");
  });

  it("no paid AI (local): eld or the site language, no offer even for a mix", async () => {
    const lock = await deciderWith(eldSaying({ code: null, reliable: false, letters: 0 }), null)
      .decide({ ask: askOf(MIX_Q, { site_language: "ro" }), ownerScope: "owner:a" });
    expect(lock).toMatchObject({ language: { code: "ro" }, source: "LOCAL_SITE" });
  });

  it("the record holds codes and hashes, and the original question only when a rewrite was accepted", async () => {
    const fast = fastSaying({ kind: "ONE", main: { code: "en", name: "English" } });
    const lock = await deciderWith(eldSaying(sure("en")), fast.check).decide({ ask: askOf("Should Romania adopt the euro?", { site_language: "ro" }), ownerScope: "owner:a" });
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
    const refused = await decider.decide({ ask: askOf(MIX_Q, { question_language_choice: { check_ref: "aa.bb", choice: "KEEP_MINE" } }), ownerScope: "owner:a" })
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
import type { AskRequest, QuestionLanguageOffer } from "@debateai/contract";
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

export type QuestionLanguagePort = Readonly<{ decide(input: Readonly<{ ask: AskRequest; ownerScope: string }>): Promise<QuestionLanguageLock> }>;

export function ownerScopeOf(principal: Readonly<{ kind: "server"; ownerRef: string } | { kind: "legacy"; legacyAskerId: string }>): string {
  return principal.kind === "server" ? `owner:${principal.ownerRef}` : `legacy:${principal.legacyAskerId}`;
}

const fastTrace = (reading: FastCheckReading): QuestionLanguageTrace["fast"] => reading.kind === "DOWN"
  ? Object.freeze({ outcome: "DOWN", reason: reading.reason, main: null })
  : Object.freeze({ outcome: reading.kind, reason: null, main: reading.main.code });

export class QuestionLanguageDecider implements QuestionLanguagePort {
  constructor(private readonly deps: Readonly<{ eld: EldReader; fastCheck: FastCheck | null; key: QuestionLanguageReferenceKey;
    clock: () => Date; maxQuestionBytes: number; onDecided?: (outcome: QuestionLanguageLock | QuestionLanguageChoiceNeeded) => void }>) {}

  async decide(input: Readonly<{ ask: AskRequest; ownerScope: string }>): Promise<QuestionLanguageLock> {
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
    if (this.deps.fastCheck === null) {
      const local = fallbackLock(site, reading, questionLine, true);
      if (local.kind !== "LOCK") throw new TypedDomainError("QUESTION_LANGUAGE_DECISION_INVALID", "QUESTION_LANGUAGE_DECISION_INVALID");
      return this.#done(Object.freeze({ ...base, language: local.language, source: local.source, trace: Object.freeze({ eld, fast: null, contractHash: null }) }));
    }
    const fast = await this.deps.fastCheck.read(questionLine, site);
    const trace = Object.freeze({ eld, fast: fastTrace(fast), contractHash: this.deps.fastCheck.contractHash });
    const decision = decideAfterFast(site, reading, fast, questionLine, this.deps.maxQuestionBytes);
    if (decision.kind === "LOCK") return this.#done(Object.freeze({ ...base, language: decision.language, source: decision.source, trace }));
    const checkRef = signQuestionLanguageReference(this.deps.key, { ownerScope: input.ownerScope, site: site.code, questionLine,
      proposed: decision.proposed, main: decision.main.code, now: this.deps.clock() });
    const needed = new QuestionLanguageChoiceNeeded(Object.freeze({ check_ref: checkRef,
      main_language: { code: decision.main.code, name: decision.main.name },
      languages_seen: decision.seen.map((language) => ({ code: language.code, name: language.name })),
      proposed_question: decision.proposed }), trace);
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

`ownerScopeOf`'s legacy form must match how Task 8 binds the reference. Both use the same `ownerScope` string from this one function, so they agree by construction. Add the file to the manifest.

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
  - `submit` (the new first step, right after `const shapePolicy = …`);
  - the two `detectArgumentLanguage(ask.question_line)` calls and their `startRun` inputs and `askContract`;
  - `#submitWithRoom`'s parameter list (one new parameter);
  - the central error handler (the 409 offer, before the `AskAlreadyWaitingRefusal` branch);
  - `askRefusalStatus` (three codes → 409).
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

function arrangeWith(input: Readonly<{ policy: boolean; port?: QuestionLanguagePort }>) {
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
    resolveDiscoveredPanel: async () => PANEL,
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
    expect(decide).toHaveBeenCalledWith({ ask: expect.objectContaining({ question_line: Q, site_language: "ro" }), ownerScope: `owner:${serverPrincipal.ownerRef}` });
    expect(started[0]).toMatchObject({ argumentLanguageTag: "ro", argumentLanguageName: "Romanian" });
    expect(started[0]!.askContract).toMatchObject({ question_language: { code: "ro", source: "ELD_SITE", site_language: "ro", rewrite_accepted: false } });
  });

  it("an offer starts no run and nothing else is asked", async () => {
    const { application, started } = arrangeWith({ policy: true, port: { decide: async () => { throw new QuestionLanguageChoiceNeeded(OFFER, { eld: null, fast: null, contractHash: null }); } } });
    await expect(application.submit(ask({ site_language: "ro" }), serverSession, serverPrincipal)).rejects.toBeInstanceOf(QuestionLanguageChoiceNeeded);
    expect(started).toEqual([]);
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
       const questionLanguageLock: QuestionLanguageLock | null = shapePolicy === null || this.settings.questionLanguage === undefined
         ? null
         : await this.settings.questionLanguage.decide({ ask: requestedAsk, ownerScope: ownerScopeOf(principal) })
           .catch((error: unknown) => {
             if (error instanceof TypedDomainError) markAskRefusal(error);
             throw error;
           });
   ```

   If `shapePolicy === null` while `questionLanguage` is set, or the reverse, the lock is null: today's path.
4. **Today's path** (`const argumentLanguage = detectArgumentLanguage(ask.question_line);`, near the preview admission lock): replace it with `const argumentLanguage = runLanguageOf(questionLanguageLock, ask.question_line);`. In that path's `askContract: { … critic_unavailable_cap: criticUnavailableCap }`, add `...questionLanguageAskContractMember(questionLanguageLock)` as the last member.
5. **`#submitWithRoom`:**
   - Add a last parameter `questionLanguageLock: QuestionLanguageLock | null`, and pass `questionLanguageLock` at its one call site.
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
7. **`askRefusalStatus(code)`:** add a branch returning 409 for `QUESTION_LANGUAGE_CHECK_INVALID`, `QUESTION_LANGUAGE_CHECK_EXPIRED` and `QUESTION_LANGUAGE_CHOICE_MISMATCH`. Add the three codes, and `QUESTION_LANGUAGE_DECISION_INVALID`, to the API's known-domain-code list where the other ask codes are listed (`grep -n '"ASK_PLAN_TIER_INVALID"' apps/api/src/index.ts` finds it).

- [ ] **Step 4: Run and expect PASS**

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
  - `deploy/preview-auth-dev/v1/publish-register-v2.ts` (`PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2` += `QUESTION_LANGUAGE_POLICY_ROW_KEY`, the builder argument and the parse check, as P2a Task 10 did for `debateShapePolicy`);
  - `apps/runner/src/hosted-register-publish.ts` (optional member `questionLanguagePolicy` without its `kind`; refusal `HOSTED_REGISTER_QUESTION_LANGUAGE_INVALID`; added to `TOP_LEVEL_KEYS`, the plan and the additive rows block, exactly as P2a Task 10 did for `debateShapePolicy`);
  - `deploy/vps/register/README.md` (one row for the member and its refusal);
  - `tests/support/shipped-corpus.manifest.txt`.
- Test: `tests/unit/question-language-boot.test.ts` (create). Add cases to `tests/unit/preview-register-publish-v2.test.ts` and `tests/integration/hosted-register-publish.test.ts`, copying their `debateShapePolicy` cases with the new row.

**Interfaces:**
- Produces:
```ts
export type QuestionLanguagePaidRoute =
  | Readonly<{ kind: "PREVIEW"; fetch: typeof fetch }>
  | Readonly<{ kind: "HOSTED"; credential: string; recordSpend: (usage: FastCheckUsage) => Promise<void> }>
  | Readonly<{ kind: "NONE" }>;
export function assertQuestionLanguagePolicyBootable(policy: QuestionLanguagePolicy, route: QuestionLanguagePaidRoute): void;
export async function composeQuestionLanguage(input: Readonly<{ policy: QuestionLanguagePolicy | null; route: QuestionLanguagePaidRoute;
  clock: () => Date; maxQuestionBytes: number }>): Promise<QuestionLanguageDecider>;
```

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-boot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { questionLanguagePolicyStartValues } from "@debateai/register";
import { assertQuestionLanguagePolicyBootable, composeQuestionLanguage } from "../../apps/api/src/question-language/boot.js";

const start = questionLanguagePolicyStartValues();
const previewRoute = { kind: "PREVIEW" as const, fetch: (async () => new Response("{}", { status: 500 })) as typeof fetch };

describe("the question-language boot (question-language spec 2026-10-13)", () => {
  it("the start values boot on the preview (Haiku is a reviewed row and 'low' is on its menu)", () => {
    expect(() => assertQuestionLanguagePolicyBootable(start, previewRoute)).not.toThrow();
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
      const decider = await composeQuestionLanguage({ policy, route, clock: () => new Date(), maxQuestionBytes: 8192 });
      const lock = await decider.decide({ ask: { question_line: "Ar trebui România să adopte euro, or should it wait until wages catch up?", site_language: "ro" } as never, ownerScope: "owner:a" });
      expect(lock.source === "LOCAL_SITE" || lock.source === "LOCAL_ELD" || lock.source === "ELD_SITE").toBe(true);
    }
  });

  it("the preview route: a failing gate is the fallback, never a refusal of the ask", async () => {
    const decider = await composeQuestionLanguage({ policy: null, route: previewRoute, clock: () => new Date(), maxQuestionBytes: 8192 });
    const lock = await decider.decide({ ask: { question_line: "Ar trebui România să adopte euro, or should it wait until wages catch up?", site_language: "ro" } as never, ownerScope: "owner:a" });
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
import { newQuestionLanguageReferenceKey } from "./reference.js";
import { anthropicFastCheckTransport, type FastCheckUsage } from "./transport.js";

/**
 * How a fast check may be paid for, decided once at boot:
 *  - PREVIEW: the guarded fetch, a site cost in the Anthropic gate's daily pot;
 *  - HOSTED: the support target's Anthropic key, with the run-less spend record (Task 19);
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
    throw new TypedDomainError("QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW", "The fast language check's model or effort is not a reviewed preview row");
  }
}

export async function composeQuestionLanguage(input: Readonly<{ policy: QuestionLanguagePolicy | null; route: QuestionLanguagePaidRoute;
  clock: () => Date; maxQuestionBytes: number }>): Promise<QuestionLanguageDecider> {
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
  return new QuestionLanguageDecider({ eld, fastCheck, key: newQuestionLanguageReferenceKey(), clock: input.clock, maxQuestionBytes: input.maxQuestionBytes });
}
```

Check the exact field names on `PreviewModelRow` (`provider`, `efforts`) in `packages/providers/src/preview-models.ts`, and adapt if they differ. Add the file to the manifest.

`apps/api/src/main.ts`, right after `const debateShapePolicy = await boot.run("debate-shape-policy", …)`:

```ts
  // Question language (spec 2026-10-13): only with the debate shape row. The row is optional (absent = start values);
  // a malformed row, an owner text carrying a frame token, or an unreviewed preview model refuses the boot.
  const questionLanguage = debateShapePolicy === null ? undefined : await boot.run("question-language", async () => composeQuestionLanguage({
    policy: await readQuestionLanguagePolicy(pool, environment.REGISTER_VERSION),
    route: previewFetch !== undefined && previewConfig !== undefined && previewProviderSocket(previewConfig, "anthropic") !== undefined
      ? { kind: "PREVIEW", fetch: previewFetch }
      : await hostedQuestionLanguageRoute(/* see below */),
    clock: () => new Date(),
    maxQuestionBytes: ASK_QUESTION_MAX_BYTES
  }));
```

Then spread `...(questionLanguage === undefined ? {} : { questionLanguage })` into the `PostgresAskApplication` settings, next to `debateShapePolicy`.

`hostedQuestionLanguageRoute` is a local function in main.ts. It returns `{ kind: "NONE" }` unless ALL of these hold:
- the deployment mode is hosted;
- the support model target (already parsed at boot as `supportModelTarget`) is an Anthropic Messages API target with a custody-read credential;
- the Task 19 spend function exists (`SELECT to_regprocedure('ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)') IS NOT NULL`).

Only then does it return `{ kind: "HOSTED", credential, recordSpend }`. Until Task 19 lands, it returns `{ kind: "NONE" }` unconditionally, with a `// Task 19` comment. Read the support target's fields from `apps/api/src/support/model.ts` (`parseSupportModelTargetJson`); never read a key from anywhere else.

`tools/preview-practice/practice-ask-composition.ts`: compose the same way. The route is `{ kind: "PREVIEW", fetch: <the practice's guarded fetch> }` when the practice runs against the gates, and `{ kind: "NONE" }` in `--dry`. Pass it into the same settings object. Also add an optional `onQuestionLanguage?: (outcome) => void` composition argument wired to the decider's `onDecided`, so P2d's report can record each lock or offer.

Publishers: copy every `debateShapePolicy` line P2a Task 10 added in `publish-register-v2.ts` and `hosted-register-publish.ts`, with `questionLanguagePolicy`, `questionLanguagePolicyRow`, `parseQuestionLanguagePolicy` and the refusal `HOSTED_REGISTER_QUESTION_LANGUAGE_INVALID`. Copy the matching test cases too.

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-boot.test.ts`
- `pnpm exec vitest run tests/unit/preview-register-publish-v2.test.ts`
- `pnpm exec vitest run tests/unit/debate-shape-submit.test.ts`

Then, alone: `pnpm exec vitest run tests/integration/hosted-register-publish.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/question-language/boot.ts apps/api/src/main.ts tools/preview-practice/practice-ask-composition.ts deploy/preview-auth-dev/v1/publish-register-v2.ts apps/runner/src/hosted-register-publish.ts deploy/vps/register/README.md tests/unit/question-language-boot.test.ts tests/unit/preview-register-publish-v2.test.ts tests/integration/hosted-register-publish.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "API boot: the question-language decider with the shape row — preview gate, hosted key or eld alone; both publishers carry the optional row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 13: Judge, review, panel, answer writer and answer checker take the locked language

Every judge-side call and both answer calls gain an optional `questionLanguage`. Without it, the bytes are today's. With it:
- the instruction ends with the named sentence instead of today's directive;
- the material ends with the field `question_language`;
- the reply check is the locked one.

No sealed fingerprint moves: `JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT`, the composer and the conformance hash are built from the contracts WITHOUT the directive, and material is not fingerprinted.

**Files:**
- Modify: `packages/judgement/src/index.ts`:
  - `promptContractInArgumentLanguage`, `judgeLegMaterial`, `framedJudgePrompt` (+ its test seam);
  - `JudgeInput`, `JudgeSubjectInput` (both gain `readonly questionLanguage?: QuestionLanguage`);
  - `review`, `assess`;
  - the three `replyLanguageCheck(...)` calls.
- Modify: `apps/runner/src/index.ts`:
  - the runner's own `promptContractInArgumentLanguage`, `buildSynthesisRolePrompt`;
  - `ComposedCitationContext` (gains `questionLanguage?`), `classifyComposedContent`, `classifyEvaluatorContent` (gains a 4th parameter).
- Test: `tests/unit/question-language-prompts.test.ts` (create)

**Interfaces:**
```ts
// packages/judgement
JudgeInput.questionLanguage?: QuestionLanguage; JudgeSubjectInput.questionLanguage?: QuestionLanguage;   // review/panel inputs extend JudgeSubjectInput
framedJudgePromptForTest(leg, questionLine, argumentLanguageName, claim, questionLanguage?: QuestionLanguage | null): FramedPrompt;
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
import { JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT, Judge, framedJudgePromptForTest } from "@debateai/judgement";
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
    expect(systemOf(none.packet).split("\n").slice(0, -2)).toEqual(systemOf(today.packet).split("\n").slice(0, -2));
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
  });

  it("the answer writer: no lock is today's packet byte for byte; a lock adds the sentence and the field", () => {
    const request = synthesisRequestFixture();
    const today = buildSynthesisRolePrompt(request, "Romanian", fixed);
    expect(buildSynthesisRolePrompt(request, "Romanian", fixed, null, null).packet).toEqual(today.packet);
    const locked = buildSynthesisRolePrompt(request, "Romanian", fixed, null, RO);
    expect(systemOf(locked.packet)).toContain(questionLanguageSentence(RO));
    expect(readPromptFrame(locked.packet).fields.at(-1)!.name).toBe("question_language");
  });

  it("the answer checker's language check reads the lock, not the question", () => {
    const objection = JSON.stringify({ verdict: "REVISE", objection: "Le texte doit expliquer pourquoi la monnaie nationale protège les citoyens et les entreprises." });
    expect(classifyEvaluatorContent(objection, undefined, "Ar trebui sa renuntam la leu?", RO).parseStatus).toBe("SCHEMA_FAILED");
  });
});
```

Notes on the test:
- If `synthesisRequestFixture` lives elsewhere, find it with `grep -rn "export function synthesisRequestFixture" tests/support`.
- If the evaluator verdict's schema needs other members, fill the `objection` JSON from `evaluatorVerdictSchema` so that the reply PARSES. The assertion is about the language refusal only.
- The first judge case compares the system message without its last two lines (the per-call fence and canary, which differ per call).

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

- `judgeLegMaterial(leg, questionLine, questionLanguage?)`: keep the closed-table check on the leg's own fields exactly as it is, then `return Object.freeze(withQuestionLanguageField(fields, questionLanguage));`. Write the comment: "the code-owned language field rides LAST, outside the leg's closed table; it is the run's lock, never model or user text".
- `framedJudgePrompt(leg, questionLine, argumentLanguageName, claim, questionLanguage: QuestionLanguage | null = null)` passes `questionLanguage` to both helpers.
- `Judge.judge` passes `input.questionLanguage ?? null`.
- `review` and `assess`: pass `input.questionLanguage` to `promptContractInArgumentLanguage`, and wrap their `material: [...]` arrays in `withQuestionLanguageField([...], input.questionLanguage)`.
- The three `replyLanguageCheck(input.questionLine, X)` calls become `replyLanguageCheckFor(input.questionLine, input.questionLanguage, X)`.
- Import `questionLanguageSentence`, `withQuestionLanguageField`, `replyLanguageCheckFor` and `type QuestionLanguage` from `@debateai/kernel`.
- `firstPositionCallProjections` (the B9 boot price) stays as it is. The field adds at most about 60 bytes, and the ceiling check measures the largest question, with its margin. State this in a one-line comment there.

`apps/runner/src/index.ts`:
- Give the runner's local `promptContractInArgumentLanguage(contract, argumentLanguageName, questionLanguage: QuestionLanguage | null = null)` the same body shape.
- `buildSynthesisRolePrompt` gains the fifth parameter `questionLanguage: QuestionLanguage | null = null`, used for the contract and for `material: withQuestionLanguageField(toSynthesisPromptMaterial(request), questionLanguage)`. With `null`, the material array is the very same object, so the packet is byte-identical. Keep P2b's `answerWords` handling exactly where it is.
- `ComposedCitationContext` gains `readonly questionLanguage?: QuestionLanguage;`. In `classifyComposedContent`, replace `replyLanguageCheck(citation.questionLine, COMPOSED_PROSE)` with `replyLanguageCheckFor(citation.questionLine, citation.questionLanguage, COMPOSED_PROSE)`.
- `classifyEvaluatorContent(content, reply?, questionLine?, questionLanguage: QuestionLanguage | null = null)` uses `replyLanguageCheckFor(questionLine, questionLanguage, EVALUATOR_PROSE)`.

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-prompts.test.ts`
- `pnpm exec vitest run tests/unit/judge-shape-legs.test.ts`
- `pnpm exec vitest run tests/unit/synthesizer-length.test.ts`
- `pnpm exec vitest run tests/unit/a17-synthesis-role-prompt.test.ts`
- `pnpm exec vitest run tests/unit/prompt-injection-corpus.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/judgement/src/index.ts apps/runner/src/index.ts tests/unit/question-language-prompts.test.ts
git commit -m "Judgement and answer calls: the locked language as one named sentence and a last material field; today's bytes without it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The mark `LANGUAGE_PLANNER_DISAGREES` (measurement only), mid-list, with its typed record and label

**Files:**
- Modify:
  - `packages/kernel/src/index.ts` (`CONDITION_MARKS`: insert after `"SCRUTINY-EXTENDED"`; append to `DEBATE_SHAPE_MARKS`);
  - `packages/serve/src/index.ts` (`REQUIRED_CONDITION_MARK_RECORDS` += the mark);
  - `apps/ui/lib/v3/labels.ts` (`conditionMarkLabel` case), `apps/ui/lib/report/reportModel.ts` (`pointNote` returns `null` for it);
  - `apps/ui/messages/*/debateChrome.json` (key `debateChrome.condition.languagePlannerDisagrees`, all 35 locales);
  - `packages/map/src/types.ts` (`MAP_MARKS` += the mark).
- Modify pins: every pin P2b Task 3 bumped to 46 becomes 47 (`tests/unit/debate-shape-marks.test.ts`, `tests/unit/a16-backup-model-used-mark.test.ts`, `tests/unit/s14-live-projections.test.ts`, `tests/unit/dr174-resilience.test.ts`, `tests/unit/obs-l2-s02-registry.test.ts`, the `acceptance/grok-relay.ts` comment). Find them with `grep -rn "46" tests/unit/debate-shape-marks.test.ts tests/unit/a16-backup-model-used-mark.test.ts tests/unit/s14-live-projections.test.ts tests/unit/dr174-resilience.test.ts tests/unit/obs-l2-s02-registry.test.ts acceptance/grok-relay.ts`.
- Test: `tests/unit/question-language-mark.test.ts` (create)

**Interfaces:** `"LANGUAGE_PLANNER_DISAGREES"` is a `ConditionMark`, a `DebateShapeMark` and a `MapMark`. Its record is answer scope with `affectedNodeIds: []`, and its reason is `LANGUAGE_PLANNER_DISAGREES:<locked code>:<planner code>` (codes only).

- [ ] **Step 1: Write the failing test** `tests/unit/question-language-mark.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONDITION_MARKS, DEBATE_SHAPE_MARKS } from "@debateai/kernel";
import { MAP_MARKS } from "@debateai/map";
import { assertRequiredConditionMarkRecords } from "@debateai/serve";
import { conditionMarkLabel } from "../../apps/ui/lib/v3/labels.js";

const MARK = "LANGUAGE_PLANNER_DISAGREES" as const;
const LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

describe("the planner-disagreement mark (question-language spec 2026-10-13, L7)", () => {
  it("sits right after SCRUTINY-EXTENDED, mid-list, and the DR-176 tail is untouched", () => {
    expect(CONDITION_MARKS[CONDITION_MARKS.indexOf("SCRUTINY-EXTENDED") + 1]).toBe(MARK);
    expect(DEBATE_SHAPE_MARKS.at(-1)).toBe(MARK);
    expect(MAP_MARKS).toContain(MARK);
    expect(CONDITION_MARKS.slice(-4)).toEqual(["HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"]);
    expect(CONDITION_MARKS).toHaveLength(47);
  });

  it("requires its typed record both ways", () => {
    const record = Object.freeze({ mark: MARK, scope: "answer" as const, subjectRef: "run-1", reason: `${MARK}:ro:fr`,
      liftPath: null, servedRootRule: null, affectedNodeIds: [] });
    expect(() => assertRequiredConditionMarkRecords([MARK], [])).toThrow(/CONDITION_MARK_RECORD_REQUIRED/u);
    expect(() => assertRequiredConditionMarkRecords([], [record])).toThrow(/CONDITION_MARK_RECORD_WITHOUT_MARK/u);
    expect(() => assertRequiredConditionMarkRecords([MARK], [record])).not.toThrow();
  });

  it("has a plain label with no internals, in every locale", () => {
    expect(conditionMarkLabel(MARK)).toBe("One AI read the question's language differently; the debate stayed in the language set at the start");
    for (const locale of LOCALES) {
      const catalog = JSON.parse(readFileSync(new URL(`../../apps/ui/messages/${locale}/debateChrome.json`, import.meta.url), "utf8"));
      const text = catalog["debateChrome.condition.languagePlannerDisagrees"] ?? catalog.debateChrome?.condition?.languagePlannerDisagrees;
      expect(typeof text === "string" && text.trim() !== "", locale).toBe(true);
      expect(text, locale).not.toMatch(/\d|planner|threshold|mark|LANGUAGE_/u);
    }
  });
});
```

Read one `debateChrome.json` first to see whether keys are flat (`"debateChrome.condition.x"`) or nested, and keep only the matching lookup in the test.

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/question-language-mark.test.ts`

- [ ] **Step 3: Implement**
1. **`packages/kernel/src/index.ts`:**
   - right after the line `"SCRUTINY-EXTENDED",` in `CONDITION_MARKS`, add the comment `// Question language (spec 2026-10-13, L7): the angle planner named another language than the lock; measurement only, never acted on.` and then the line `"LANGUAGE_PLANNER_DISAGREES",`;
   - append `"LANGUAGE_PLANNER_DISAGREES"` as the last element of `DEBATE_SHAPE_MARKS`.
2. **`packages/serve/src/index.ts`:** append the string to `REQUIRED_CONDITION_MARK_RECORDS` with the comment `// Question language: the planner's disagreement always carries its record (answer scope, codes only).` (`ConditionMarkRecord["mark"]` already includes `DebateShapeMark`).
3. **`packages/map/src/types.ts`:** append `"LANGUAGE_PLANNER_DISAGREES"` to `MAP_MARKS`.
4. **`apps/ui/lib/v3/labels.ts`:** after the `"SCRUTINY-EXTENDED"` case, add `case "LANGUAGE_PLANNER_DISAGREES": return t(catalog, "debateChrome.condition.languagePlannerDisagrees");`.
5. **`apps/ui/lib/report/reportModel.ts`:** in `pointNote`, return `null` for it beside the map marks.
6. **`apps/ui/messages/en/debateChrome.json`:** add `"…languagePlannerDisagrees": "One AI read the question's language differently; the debate stayed in the language set at the start"` (wording option 1; options 2–3 are in Owner steps). Add `ro`: `"Un AI a citit altfel limba întrebării; dezbaterea a rămas în limba stabilită la început"`.
7. **The 33 other locales:** one Haiku worker (effort `xhigh`, foreground) per P2c Task 10 language group. Each gets the English and Romanian texts, the meaning ("one of the AIs thought the question was written in a different language; the debate continued in the language chosen when it started"), the rules "plain words, no numbers, no engine words, polite register of the catalogue", and writes one packet file inside `$(git rev-parse --absolute-git-dir)/p2l-translations`. Then one Opus (effort `high`) spot-check of mt, ga, et, lv, lt, ar, he, hi, ja, zh, ko. Merge the packets into the catalogues; the packets are never committed.
8. **Pins:** 46 → 47 in the files listed above. Do not touch any `slice(-4)` expectation.

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/question-language-mark.test.ts`
- `pnpm exec vitest run tests/unit/debate-shape-marks.test.ts`
- `pnpm exec vitest run tests/unit/a16-backup-model-used-mark.test.ts`
- `pnpm exec vitest run tests/unit/s14-live-projections.test.ts`
- `pnpm exec vitest run tests/unit/dr174-resilience.test.ts`
- `pnpm exec vitest run tests/unit/obs-l2-s02-registry.test.ts`

Then run the UI catalogue checks for debateChrome: `node apps/ui/scripts/run-node-tests.mjs` only if it accepts one file. Otherwise run `node --test apps/ui/lib/i18n/catalog.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add packages/kernel/src/index.ts packages/serve/src/index.ts packages/map/src/types.ts apps/ui/lib/v3/labels.ts apps/ui/lib/report/reportModel.ts apps/ui/messages acceptance/grok-relay.ts tests/unit/question-language-mark.test.ts tests/unit/debate-shape-marks.test.ts tests/unit/a16-backup-model-used-mark.test.ts tests/unit/s14-live-projections.test.ts tests/unit/dr174-resilience.test.ts tests/unit/obs-l2-s02-registry.test.ts
git commit -m "Kernel: LANGUAGE_PLANNER_DISAGREES mid-list (measurement only) with its typed record and a plain label in every locale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The map speaks the locked language; the planner names the language FIRST; a disagreement is one record

The map only runs in shape runs (and Phase 1's `openings` practice, whose questions carry fixed `ro`/`en` tags). So the map switches to the locked form for every call, keyed on its context's tag. A tag of `"und"` keeps today's directive and expectation, which can happen only in old practice data.

**Files:**
- Modify:
  - `packages/map/src/prompts.ts`: `MAP_DEFAULT_INSTRUCTIONS.angles` gains one sentence; `MAP_ANSWER_FORMS.angles` gains the first field; `mapContractInLanguage` takes the language.
  - `packages/map/src/specs.ts`: `mapSpecOf` appends the field and uses the locked language.
  - `packages/map/src/replies.ts`: `mapAnglesReplySchema` gains an optional `question_language`.
  - `packages/map/src/orchestrator.ts`: `replyLanguage` from the lock; the planner comparison.
  - `packages/map/src/types.ts`: `MapResult.plannerLanguage`.
- Modify tests whose scripted ANGLES replies or hash pins change: `grep -rln "mapPromptContractHash\|map.angles.v1" tests` lists them. A hash pin is re-pinned to the new printed value. A scripted reply needs no change (the field is optional).
- Test: `tests/unit/map-question-language.test.ts` (create)

**Interfaces:**
```ts
// packages/map
export function mapLockedLanguage(ctx: Pick<MapSpecContext, "languageTag" | "languageName">): QuestionLanguage | null; // null for "und"
export function mapContractInLanguage(contract: PromptContract, language: QuestionLanguage | null, languageName: string): PromptContract;
MapResult.plannerLanguage: string | null;   // what the planner named, normalised to its primary subtag; null when absent
// MapMarkRecord { mark: "LANGUAGE_PLANNER_DISAGREES", step: "ANGLES", detail: "<locked>:<planner>" }
```

- [ ] **Step 1: Write the failing test** `tests/unit/map-question-language.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { questionLanguageSentence } from "@debateai/kernel";
import { readPromptFrame } from "@debateai/providers";
import {
  MAP_ANSWER_FORMS, mapAnglesReplySchema, mapAnglesSpec, mapListSpec, mapProviderPieces, mapPromptContractHash, runMapArm,
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

  it("a planner that names another language is ONE record, and every later call stays in the locked language", async () => {
    const seen: MapCallRequest<unknown>[] = [];
    const caller: MapCaller = { call: async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
      seen.push(request as MapCallRequest<unknown>);
      return request.step === "ANGLES"
        ? { kind: "OK", value: request.spec.read(ANGLES("fr")) } as MapCallOutcome<T>
        : { kind: "FAILED", code: "TEST_STOP" } as MapCallOutcome<T>;
    } };
    const result = await runMapArm("C", { ...RO_CTX, seats: [{ aiRef: "a", maker: "ma" }, { aiRef: "b", maker: "mb" }], caller, seed: "q1",
      gapRoundsMax: 1, maxAnswers: 2, pointsPerAnswer: 2 } as never);
    expect(result.plannerLanguage).toBe("fr");
    expect(result.marks.filter((mark) => mark.mark === "LANGUAGE_PLANNER_DISAGREES")).toEqual([
      { mark: "LANGUAGE_PLANNER_DISAGREES", step: "ANGLES", detail: "ro:fr" }]);
    for (const request of seen.slice(1)) expect(request.spec.contract.instruction).toContain("in Romanian, the language this debate was set to");
  });

  it("the same language, a regional form, 'unknown' or nothing: no record", async () => {
    for (const named of ["ro", "ro-RO", "unknown", undefined]) {
      const caller: MapCaller = { call: async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => request.step === "ANGLES"
        ? { kind: "OK", value: request.spec.read(ANGLES(named)) } as MapCallOutcome<T>
        : { kind: "FAILED", code: "TEST_STOP" } as MapCallOutcome<T> };
      const result = await runMapArm("C", { ...RO_CTX, seats: [{ aiRef: "a", maker: "ma" }, { aiRef: "b", maker: "mb" }], caller, seed: "q1",
        gapRoundsMax: 1, maxAnswers: 2, pointsPerAnswer: 2 } as never);
      expect(result.marks.some((mark) => mark.mark === "LANGUAGE_PLANNER_DISAGREES"), String(named)).toBe(false);
    }
  });
});
```

Use the arm entry point P2b's map package exports for the angle-map arm (`runMapArm` / `runAngleMap`; find it with `grep -n "^export async function run" packages/map/src/orchestrator.ts`), and the `MapCallOutcome` shapes it defines. Adapt only the names, never the assertions.

- [ ] **Step 2: Run it and expect FAIL**

Run: `pnpm exec vitest run tests/unit/map-question-language.test.ts`

- [ ] **Step 3: Implement**

`packages/map/src/prompts.ts`:
- Add to the END of `MAP_DEFAULT_INSTRUCTIONS.angles`'s array the sentence: `"First, in question_language, give the two-letter code of the language the question is written in."`
- Make `MAP_ANSWER_FORMS.angles` start its object with the field: replace `{ "angles": [` with `{ "question_language": two-letter ISO 639-1 code of the question's language, in lower case, "angles": [`.
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
- In the `MapRun` constructor, set `replyLanguage: input.languageTag === "und" ? replyLanguageExpectation(input.questionLine) : lockedReplyLanguageExpectation(questionLanguageFromRun(input.languageTag, input.languageName)!, input.questionLine)`. Keep the R-5 comment and add "(question-language spec 2026-10-13: the lock, never a re-guess)".
- Where the ANGLES reply is accepted, compute `const named = reply.question_language === undefined ? null : mapPrimarySubtag(reply.question_language);`. Keep `named` when `questionLanguageOf(named) !== null`, else `null`, and set it as the result's `plannerLanguage`.
- When `named !== null && named !== mapPrimarySubtag(input.languageTag) && input.languageTag !== "und"`, push `{ mark: "LANGUAGE_PLANNER_DISAGREES", step: "ANGLES", detail: `${mapPrimarySubtag(input.languageTag)}:${named}` }` to `marks`. Nothing else reads `named`.
- `MapResult` (types.ts) gains `plannerLanguage: string | null`, set on every return path (`null` where no planner reply was accepted).

P2b's `mapConditionRecords` already converts every mark record (amendment P2b-4). Confirm with `grep -n "mapConditionRecords" -A12 apps/runner/src/map-stage.ts`. The resulting record's `reason` must be `LANGUAGE_PLANNER_DISAGREES:<detail>`. If the function lists marks one by one, add this one the same way.

Print the new map hash and re-pin every test that pins it:

`pnpm exec tsx -e 'import {mapPromptContractHash} from "@debateai/map"; console.log(mapPromptContractHash())'`

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/unit/map-question-language.test.ts`
- `pnpm exec vitest run tests/unit/map-specs.test.ts`
- `pnpm exec vitest run tests/unit/map-replies.test.ts`
- `pnpm exec vitest run tests/unit/map-orchestrator.test.ts`
- `pnpm exec vitest run tests/unit/map-multilingual.test.ts`
- `pnpm exec vitest run tests/unit/map-stage.test.ts`
- `pnpm exec vitest run tests/unit/practice-openings-log.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/map tests/unit
git commit -m "Map: every step in the locked language; the angle planner names the language first; a disagreement is one record, never a switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: The story in the locked language

**Files:**
- Modify:
  - `packages/story/src/material.ts` (`StoryWriteInput` gains `readonly languageLocked?: true`);
  - `packages/story/src/contracts.ts` (`storyContractInArgumentLanguage(contract, name, questionLanguage?)`);
  - `packages/story/src/writer.ts` (both contracts, the material field, both reply checks);
  - `apps/runner/src/story-snapshot.ts` (`StorySnapshotSource` / `buildStoryRunSnapshot` carry `languageLocked`).
- Test: `tests/unit/story-question-language.test.ts` (create)

**Interfaces:**
```ts
export function storyContractInArgumentLanguage(contract: PromptContract, argumentLanguageName: string | null,
  questionLanguage?: QuestionLanguage | null): PromptContract;
StoryWriteInput.languageLocked?: true;   // with it, argumentLanguage {tag, name} IS the lock
```

- [ ] **Step 1: Write the failing test** `tests/unit/story-question-language.test.ts`:

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

Run: `pnpm exec vitest run tests/unit/story-question-language.test.ts`

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
- `pnpm exec vitest run tests/unit/story-question-language.test.ts`
- `pnpm exec vitest run tests/unit/story-writer.test.ts`
- `pnpm exec vitest run tests/unit/story-contracts.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/story/src/material.ts packages/story/src/contracts.ts packages/story/src/writer.ts apps/runner/src/story-snapshot.ts tests/unit/story-question-language.test.ts tests/unit/story-writer.test.ts
git commit -m "Story: the locked language's one sentence, its field and the locked check; today's story bytes without a lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The runner passes the lock in a shape run; doubles and the harness learn it

**Files:**
- Modify: `apps/runner/src/index.ts`:
  - `execute`: where P2b computes `shapeRun`, add `const shapeLanguage = shapeRun === null ? null : questionLanguageFromRun(run.argumentLanguageTag, run.argumentLanguageName);`
  - the four judge-input sites that pass `argumentLanguageName: run.argumentLanguageName` (`grep -n "argumentLanguageName: run.argumentLanguageName" apps/runner/src/index.ts`) also pass `...(shapeLanguage === null ? {} : { questionLanguage: shapeLanguage })`. So do P2b's shape legs (assigned-root, consideration legs, close-call extras), which build judge inputs in the same way.
  - both `buildSynthesisRolePrompt(request, run.argumentLanguageName, …)` calls pass `shapeLanguage` as the fifth argument;
  - the composer's citation context gains `...(shapeLanguage === null ? {} : { questionLanguage: shapeLanguage })`;
  - `classifyEvaluatorContent(content, reply, run.questionLine)` becomes `classifyEvaluatorContent(content, reply, run.questionLine, shapeLanguage)`;
  - the story snapshot source gains `languageLocked: shapeLanguage !== null`.
- Modify: `tests/support/preview-gate-stubs.ts`: `LANGUAGE_DIRECTIVE` (~158) gains a third alternative that strips the named sentence (see Step 3). Fix the stale comment above it ("English," → "English, the language of the question,").
- Modify: `tests/support/debate-shape-harness.ts` (P2b): admitted runs pass `argumentLanguageTag` / `argumentLanguageName` to `startRun` explicitly, default `"en"` / `"English"`. The scripted `MAP:angles` reply begins with `"question_language": "<tag>"`.
- Modify: `tests/integration/debate-shape-run.test.ts` (P2b): one new case (Step 1).
- Test: `tests/unit/runner-question-language.test.ts` (create) and the integration case.

- [ ] **Step 1: Write the failing tests.** `tests/unit/runner-question-language.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { questionLanguageSentence } from "@debateai/kernel";
import { stripLanguageDirectiveForTest } from "../support/preview-gate-stubs.js";

const today = (name: string) => `Write every natural-language field in ${name}, the language of the question, even where the material quotes another language.`;
const fallback = "Write every natural-language field in the same language as the question, even where the material quotes another language.";

describe("the test doubles read all three language forms", () => {
  it("strips today's named form, today's fallback form, and the locked sentence", () => {
    for (const text of [today("English"), fallback, questionLanguageSentence({ code: "en", name: "English" }),
      questionLanguageSentence({ code: "sr-Latn", name: "Serbian (Latin script)" })]) {
      expect(stripLanguageDirectiveForTest(`Instruction. ${text} Keep JSON keys, enum tokens, JSON literals (null, true, false), and identifier-shaped values in English exactly as specified; never translate an identifier or literal.`)).toBe("Instruction.");
    }
  });
});
```

In `tests/integration/debate-shape-run.test.ts`, add this case, written like its existing "a full new-shape debate" case:

```ts
  it("question language: every captured prompt of a shape run carries the locked sentence and field, never the fallback form", async () => {
    const { prompts } = await runShapeDebate({ language: { tag: "ro", name: "Romanian" }, question: "Ar trebui sa renuntam la leu?" });
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt.system).toContain("in Romanian, the language this debate was set to");
      expect(prompt.system).not.toContain("the same language as the question");
      expect(prompt.fields.at(-1)?.name).toBe("question_language");
    }
  });
```

`runShapeDebate` is the harness function P2b Task 15 defines (`tests/support/debate-shape-harness.ts`). Add the `language` / `question` options to it here, and add `prompts` (every captured packet as `{ system, fields }`, read with `readPromptFrame`) to its result if it does not return them yet.

- [ ] **Step 2: Run them and expect FAIL**

Run: `pnpm exec vitest run tests/unit/runner-question-language.test.ts`

Then, alone: `pnpm exec vitest run tests/integration/debate-shape-run.test.ts -t "question language"`

- [ ] **Step 3: Implement.**

In `tests/support/preview-gate-stubs.ts`, extend the strip pattern so it matches, in one alternation:
- `in (.+?), the language of the question, even where`;
- `in the same language as the question, even where`;
- `in (.+?), the language this debate was set to and named in question_language, even where`.

Export the stripping function as `stripLanguageDirectiveForTest`, a thin wrapper over what `classifyGateRequest` already does (one implementation, two names). Then make the runner edits listed under Files.

- [ ] **Step 4: Run and expect PASS.** The same two commands, then, each alone:
- `pnpm exec vitest run tests/integration/debate-shape-run.test.ts`
- `pnpm exec vitest run tests/integration/debate-shape-row-absent.test.ts` (row absent: unchanged)

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/index.ts tests/support/preview-gate-stubs.ts tests/support/debate-shape-harness.ts tests/integration/debate-shape-run.test.ts tests/unit/runner-question-language.test.ts
git commit -m "Runner: a shape run's calls carry its locked language; doubles strip the named sentence; the harness sets the language on startRun

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

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
  language?: Readonly<{ siteLanguage: SiteLanguage; choice?: QuestionLanguageChoice }>): Promise<AskAccepted>;
// apps/ui/components/QuestionLanguageChoice.tsx
export type QuestionLanguageAnswer = "USE" | "KEEP" | "EDIT";
export function useQuestionLanguageChoice(input: Readonly<{ catalog: MessageCatalog; locale: LocaleCode }>):
  Readonly<{ ensureChoice(offer: QuestionLanguageOffer): Promise<QuestionLanguageAnswer>; dialog: React.ReactNode }>;
```

- [ ] **Step 0 (only if needed):** if `grep -c "newDebate.languageCheck.body" apps/ui/messages/en/newDebate.json` prints `0`, add the six keys to `en` and `ro` as in the table. Translate the other 33 with the same worker set and rules as P2c Task 10 (six Haiku workers by language group, effort `xhigh`, foreground, packets inside `$(git rev-parse --absolute-git-dir)/p2l-translations`, never committed). Rules for these keys:
  - keep `{languages}` and `{language}` untranslated;
  - the sentence must read naturally with a language name, or a list of names, filled in;
  - use the catalogue's own register.

  Then run one Opus spot-check (effort `high`) of mt, ga, et, lv, lt, ar, he, hi, ja, zh, ko, and merge.

- [ ] **Step 1: Write the failing test** `tests/render/question-language-choice.test.tsx`. Model it on `tests/render/sensitive-data-consent.test.tsx`: same mocks of `next/navigation`, `@/components/AuthGate`, `SupportWidget`, and the same catalogue loading from `apps/ui/messages/<locale>/<ns>.json`.

```tsx
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const createDebate = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  return { ...actual, createDebate,
    contractClient: { ...actual.contractClient, readSession: vi.fn(async () => ({})), readSensitiveDataConsent: vi.fn(async () => ({ state: "given" })),
      giveSensitiveDataConsent: vi.fn(async () => ({ state: "given" })) } };
});
/* the same next/navigation, AuthGate and SupportWidget mocks as tests/render/sensitive-data-consent.test.tsx */

import { QuestionLanguageChoiceNeededError } from "../../apps/ui/lib/api.js";
import NewDebatePageClient from "../../apps/ui/app/new/NewDebatePageClient.js";
import { catalogsFor } from "../support/newDebateCatalogs.js"; // or inline the loader the consent test uses

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
  await act(async () => { box.value = text; box.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { (host.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
}
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

afterEach(() => { createDebate.mockReset(); document.body.innerHTML = ""; });

describe("/new: the question's language (question-language spec 2026-10-13)", () => {
  it("sends the page's language with every ask", async () => {
    createDebate.mockResolvedValue({ run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" });
    const { host } = await renderNew("ro");
    await askWith(host, "Ar trebui România să adopte euro?");
    expect(createDebate).toHaveBeenCalledWith("Ar trebui România să adopte euro?", expect.anything(), "test-token", undefined, { siteLanguage: "ro" });
  });

  it("a real mix: the pop-up names the languages in the site language; 'Use this version' sends the server's rewrite and the reference", async () => {
    createDebate.mockRejectedValueOnce(new QuestionLanguageChoiceNeededError(OFFER))
      .mockResolvedValueOnce({ run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" });
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
      .mockResolvedValueOnce({ run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" });
    const { host } = await renderNew("en");
    await askWith(host, MIXED);
    expect(document.querySelector('[data-dialog="question-language"]')!.textContent).toContain("Your question mixes Romanian and English.");
    await act(async () => { button("Keep my wording").click(); });
    expect(createDebate).toHaveBeenLastCalledWith(MIXED, expect.anything(), "test-token", undefined,
      { siteLanguage: "en", choice: { check_ref: "ref.sig", choice: "KEEP_MINE" } });
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

Use the consent test's actual render helper and catalogue loader instead of `catalogsFor` if it has one. The assertions stay as written.

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

In `createDebate`, add the fifth parameter `language?`. When it is given, the body gains `site_language` and, with a choice, `question_language_choice`, and the call is:

```ts
  if (language === undefined) return await client.submitAsk(ask);           // today's call, unchanged
  const outcome = await client.submitAskOrLanguageChoice(ask);
  if (outcome.kind === "LANGUAGE_CHOICE_NEEDED") throw new QuestionLanguageChoiceNeededError(outcome.offer);
  return outcome.accepted;
```

`apps/ui/components/QuestionLanguageChoice.tsx`:
- Follow `SensitiveDataConsent.tsx`'s pattern: a hook whose `ensureChoice` returns a Promise resolved by the buttons; `useModalSurface(open, { containerRef, initialFocusRef, onClose })`; `backdropCloseHandler`; `policyScrim` / `policyBezel` classes.
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title, `data-dialog="question-language"`.
- The body fills `{languages}` and `{language}` with names from `Intl.DisplayNames([locale], { type: "language" })`. When that throws or echoes the code, it falls back to the offer's English name. The list is joined with `Intl.ListFormat(locale, { type: "conjunction" })`.
- The rewrite goes in `<blockquote lang={offer.main_language.code}><bdi>…</bdi></blockquote>`, with the `proposalLabel` key as its `aria-label`.
- Buttons, in order: [use] [keep] [edit]. Initial focus is on [use].
- Esc, a backdrop click, and [edit] all resolve `"EDIT"`.

`NewDebatePageClient.tsx`:
- Create `const languageChoice = useQuestionLanguageChoice({ catalog, locale });` next to `useSensitiveDataConsent`.
- Render `{languageChoice.dialog}` beside `{consent.dialog}{crisis.dialog}`.
- In `submit()`, replace the single `createDebate(topic.trim(), config, token)` call (and its consent retry) with a loop of at most three tries:
  - the site language is `catalogLocale(locale)` (en-US/en-GB → en);
  - every call passes it;
  - on `QuestionLanguageChoiceNeededError`, `await languageChoice.ensureChoice(error.offer)`:
    - `"EDIT"`: focus the question textarea and return (the debate is not created; the next submit checks again);
    - `"USE"`: call again with the offer's `proposed_question` and `{ check_ref, choice: "USE_REWRITE", original_question_line: topic.trim() }`;
    - `"KEEP"`: call again with `topic.trim()` and `{ check_ref, choice: "KEEP_MINE" }`;
  - on `isQuestionLanguageCheckStale(error)` after a choice: call once more with no choice (the server checks again, and may offer again);
  - the existing consent refusal branch stays as it is, inside the loop.
- Keep `buildNewDebateAskConfig` and the config object untouched: `tests/render/ux01-new-debate-form.test.tsx` pins its keys.

Then find the existing render tests that assert `createDebate`'s exact arguments: `grep -rln "createDebate).toHaveBeenCalledWith\|createDebate).toHaveBeenLastCalledWith" tests/render`. Extend each expectation with `undefined, { siteLanguage: "<that test's locale>" }`. That is the only change those tests need.

- [ ] **Step 4: Run and expect PASS**

Run, one after another:
- `pnpm exec vitest run tests/render/question-language-choice.test.tsx`
- `pnpm exec vitest run tests/render/sensitive-data-consent.test.tsx`
- `pnpm exec vitest run tests/render/ux01-new-debate-form.test.tsx`
- `pnpm exec vitest run tests/render/tier01-new-plan-tier.test.tsx`
- `pnpm exec vitest run tests/render/new-debate-no-phone-step.test.tsx`

Then run `node --test apps/ui/lib/i18n/catalog.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/components/QuestionLanguageChoice.tsx apps/ui/lib/api.ts apps/ui/app/new/NewDebatePageClient.tsx tests/render
git commit -m "/new: the site language goes with the question; a real mix offers the server's one-language version — use, keep or edit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If Step 0 ran, also `git add apps/ui/messages`.

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
  - `packages/budget/src/model-spend.ts` (`ModelSpendSource` += `"LANGUAGE_CHECK"`; `recordSpend` allows `runId === null` for it);
  - `apps/api/src/main.ts` (`hostedQuestionLanguageRoute` turns on, see Task 12);
  - every pin that names the chain's last step. These are the same files P2b Task 7 lists for 0116; each moves from 0116 to 0117, and a "chains 0117 after 0116" test is added.

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
});
```

`tests/integration/language-check-spend.test.ts` (embedded Postgres, run alone): migrate. Call the function once with `('…uuid…', 'language-check:anthropic:claude-haiku-5-5', '2026-10-13', 85, 310, 28)`. Assert `PostgresModelSpendStore.readDaySpentMicros("2026-10-13")` grows by 85. Assert a direct `INSERT … spend_source='LANGUAGE_CHECK', run_id=<a run>` is refused by the CHECK. Assert `recordSpend({ spendSource: "LANGUAGE_CHECK", runId: null, … })` succeeds while `spendSource: "RUN", runId: null` still throws `MODEL_SPEND_RUN_REQUIRED`. Add a unit case: `languageCheckChargeMicros({ inputTokens: 310, outputTokens: 28 }, { input: 100000, output: 500000 })` equals `Math.ceil((310*100000 + 28*500000) / 1_000_000)` = 45.

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
- the pins.

`packages/budget/src/model-spend.ts`:
- `ModelSpendSource` gains `"LANGUAGE_CHECK"`, with the comment `the fast language check before a debate: a run-less site cost (0117)`;
- `recordSpend` is unchanged apart from refusing `LANGUAGE_CHECK` with a run (`MODEL_SPEND_LANGUAGE_CHECK_RUNLESS`);
- add `languageCheckChargeMicros`.

`apps/api/src/main.ts`, in `hostedQuestionLanguageRoute`, replace the Task 12 placeholder with the capability query and `recordSpend`. `recordSpend` calls the function with:
- `randomUUID()`;
- `language-check:${provider}:${model}`;
- `costEnvelopeDay(new Date())`;
- `languageCheckChargeMicros(usage, price)`;
- the two token counts.

A failed record is logged as `api.question_language.spend_unrecorded`, with codes only. It never fails the ask, because the call already happened. That is the same rule the support chat follows for unreported cost.

- [ ] **Step 4: Run and expect PASS**

Run: `pnpm exec vitest run tests/architecture/language-check-spend-0117-contract.test.ts`, then each moved pin's file, one at a time. Then, alone: `pnpm exec vitest run tests/integration/language-check-spend.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add migrations packages/db packages/budget apps/api/src/main.ts tests/architecture tests/integration tests/unit
git commit -m "db: migration 0117 — the fast language check as a run-less site cost in the day's pot; hosted turns the check on when it exists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Whole-plan verification

- [ ] **Step 1: Shipped corpus and source rules**

Run, one after another:
- `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts`
- `pnpm exec vitest run tests/architecture/scaffold.test.ts`

- [ ] **Step 2: Every P2L unit file, one at a time**

The files are `tests/unit/question-language-*.test.ts`, `tests/unit/map-question-language.test.ts`, `tests/unit/story-question-language.test.ts` and `tests/unit/runner-question-language.test.ts`. List them with `ls tests/unit/question-language-*.test.ts` (zsh: the glob is fine in `ls`), and run each with `pnpm exec vitest run <file>`. Never pass an empty list.

- [ ] **Step 3: The row-absent proof**

Run, each alone:
- `pnpm exec vitest run tests/integration/debate-shape-row-absent.test.ts`
- `pnpm exec vitest run tests/unit/debate-shape-submit.test.ts`

- [ ] **Step 4: Typecheck once, alone**

Run `pnpm run typecheck` when no vitest run is active.

- [ ] **Step 5: Print the hashes the owner's register republish needs**

Print the map hash with `pnpm exec tsx -e 'import {mapPromptContractHash} from "@debateai/map"; console.log(mapPromptContractHash())'`, and the judge hash as in Task 0 Step 3. The judge hash must equal `JUDGE_HASH_AFTER_P2B`. Put both in the controller's report.

## Owner steps (things that are "off" until the owner acts)

1. **Register republish (preview and hosted).**
   - P2L changes ONE sealed fingerprint, the map's (`mapContractHash`, new in P2b), because the angle planner's instruction and answer form gain `question_language`.
   - Publish the preview's `mapContractHash` only after P2L Task 15. Dev registers re-seal by themselves.
   - Unchanged: `judgeContractHash` (Task 13 pins it), `composerContractHash`, `conformanceContractHash`, the story pack fingerprint.
   - The story's per-call contract hash changes for shape runs. It is recorded per call and is not a sealed value.
2. **The optional row `questionLanguagePolicy`.** Publish it only to change the provider/model, switch the check off, or edit the instruction. Absent means the start values. Preview: an optional source row of the v2 kit. Hosted: the optional file member.
3. **Server gate check.** The preview Anthropic gate must accept `claude-haiku-5-5` with effort `low` from the API's process. It already does for the support relay's model row, but confirm the API's socket access on the server before turning the shape row on.
4. **Hosted:** apply migration 0117 (Task 19) before hosted's first shape debate. Until then hosted runs eld + site language with no rewrite.
5. **Wording picks:**
   - **(a) The pop-up title.** Option 1 «Your question's language / Limba întrebării» (in code); 2 «One language for your question / O singură limbă pentru întrebare»; 3 «Check your question's language / Verifică limba întrebării».
   - **(b) The Romanian body's register.** The spec's text uses «ta» (informal) while the RO catalogue elsewhere uses the polite plural. In code: the spec's informal text, adjusted for filled names (Contract deviation 4).
   - **(c) The planner-disagreement label.** Option 1 (in code) «One AI read the question's language differently; the debate stayed in the language set at the start»; 2 «An AI named another language for the question; the debate kept its language»; 3 «The question's language was read differently by one AI; nothing changed».
6. **"Thinking off" for the fast check** (Contract deviation 1) needs a gate change on both sides (TypeScript `anthropicBodyAccepted` and the Python `AnthropicProfile`) with parity fixtures. It is a separate owner-approved task. Until then the check uses effort `low`.
7. **The Croatian-site default** for Serbian or Bosnian in Latin script, and whether the debate page's existing language strip should show for an L5 question (Owner-visible defaults).

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
| L7 planner's FIRST field; `LANGUAGE_PLANNER_DISAGREES` recorded, never acted on, mid-list mark | 14, 15 |
| `replyLanguageCheck` against the locked code, no re-guess (new shape only) | 1, 13, 15, 16, 17 |
| Test doubles answer the planner's field; tests set the language on `startRun` | 17 |
| Site cost in the provider's daily pot (preview) and hosted equivalent | 6, 12, 19 |
| Privacy: no question text in logs, codes only | Global Constraints, 8, 10, 19 |
| Unit tests for the decision table (8 cases) | 7, 10 |
| API tests refusing made-up language / rewrite / expired / mismatched reference | 8, 11 |
| Contract hash consequences | 13, 15, Owner steps 1 |
| Row absent = today byte for byte | Global Constraints, 11, 13, 16, 17, 20 |
| Questions outside the 35 | Owner-visible defaults, 1, 7 |
| Practice language cases and pass bar | P2d amendments |
