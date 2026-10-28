# Question Subjects File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The start-of-debate question check reads its subjects from one JSON file and answers, for every question, the subject and whether it is healthy; nothing about a question is stored.

**Architecture:** `apps/api/src/question-check/subjects.json` is read and validated once at API boot. The check's instruction and its answer parser are built from it. The outcome mapping turns (subject, healthy) into PASS, CRISIS or REFUSE with the subject's screen. The 422 body carries an open `kind` plus `screen` and `emergency_number`, and the UI shows one shared rule line. The keeper call is removed, so no question text is written.

**Tech Stack:** TypeScript (Node 26.9, tsx), zod, Fastify, Next.js, vitest, PostgreSQL (embedded for integration tests).

**Spec:** `docs/superpowers/specs/2026-10-28-question-subjects-file-design.md`

## Global Constraints

- Run every command with `export PATH=/opt/homebrew/bin:$PATH LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8; unset TZ` (Node v26.9.0).
- Work in `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/sf-int-fix/dialectical-engine` on `reconcile/synthesis-flag-int`; commit with a pathspec; never push.
- Answer form, exactly: `{"call":"<32 hex>","subject":"<an id or NONE>","healthy":true|false}`.
- Screens, exactly: `REFUSE`, `HELP_NUMBERS`, `SENSITIVE`.
- Shared rule line key: `home.questionRefusal.rule`; each locale's value is that locale's current `home.questionRefusal.rule.HATE_SPEECH` up to and including its first colon (`:` or `：`), with the colon replaced by `.` (`。` for ja and zh).
- Legal changes go into Terms 2.6 and Privacy 3.6; no new version numbers; dates stay at the V-80 marker.
- No question text may be written to any table or log on any ask outcome.

## Review Focus

- A model answer whose subject differs only in case or spacing (`"drugs"`, `" DRUGS"`) must be refused as `QUESTION_CHECK_ANSWER_SCHEMA` (the unavailable screen), never treated as NONE. Test in Task 2.
- A subjects file saved with a UTF-8 byte-order mark or CRLF line endings must load. Test in Task 1.
- A UI built before a subject was added must still show a refusal screen for an unknown `kind` (for example `GAMBLING`): the shared line, no crash. Test in Task 5.
- The price projection must use the instruction built from the file, which is longer than today's, or the daily cost pot under-counts. Test in Task 4.
- A non-English question gets the same verdict as its English twin: the measurement in Task 7 includes "Cum fac MDMA acasă?" and "Ar trebui să iau MDMA?".

---

### Task 1: The subjects file and its loader

**Files:**
- Create: `apps/api/src/question-check/subjects.json`
- Create: `apps/api/src/question-check/subjects.ts`
- Test: `tests/unit/question-subjects.test.ts`

**Interfaces:**
- Produces: `type QuestionSubjectScreen = "REFUSE" | "HELP_NUMBERS" | "SENSITIVE"`; `type QuestionSubject = Readonly<{ id: string; covers: string; notHealthy: string; healthy: string | null; examplesNotHealthy: readonly string[]; examplesHealthy: readonly string[]; whenNotHealthy: QuestionSubjectScreen; emergencyNumber: boolean; termsPhrase: string | null }>`; `type QuestionSubjects = readonly QuestionSubject[]`; `parseQuestionSubjects(value: unknown): QuestionSubjects`; `readQuestionSubjects(path?: string): QuestionSubjects` (default `resolve("apps/api/src/question-check/subjects.json")`); `QUESTION_SUBJECTS_PATH`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/question-subjects.test.ts`:
  - `loads the shipped file in order`: ids equal `["OWN_CRISIS","SUICIDE_METHODS","HARM_TO_OTHERS","WEAPONS_TERRORISM","DRUGS","CRIME","HATE_SPEECH","RELIGIOUS_INSULT","SUICIDE_AND_ASSISTED_DYING"]`.
  - `refuses a bad file by one code`: each of these throws `/^QUESTION_SUBJECTS_INVALID$/` (the error's `code`): an unknown field; a duplicate id; an id not matching `/^[A-Z][A-Z0-9_]{1,63}$/` or equal to `NONE`; empty `not_healthy`; an unknown `when_not_healthy`; a `HELP_NUMBERS` subject with `healthy` or `examples_healthy`; a `REFUSE` or `SENSITIVE` subject without `terms_phrase` or `healthy`; an empty `subjects` array.
  - `loads a file with a byte-order mark and CRLF line endings` (write a temp copy of the shipped file with `﻿` and `\r\n`, `readQuestionSubjects(temp)` returns 9 subjects).
  - `names a terms phrase that the English Terms section 7 paragraph holds`: for every subject with `termsPhrase`, `apps/ui/legal/en/terms-of-service.md`'s line starting `**Questions that do not start a debate.**` contains it. (Fails until Task 6.)
- [ ] **Step 2: Run** `npx vitest run tests/unit/question-subjects.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Create `subjects.json`** with this exact content (the wording is today's rows on `06ae903d4`, changed only by V's drug and assisted-dying lines):

```json
{
  "subjects": [
    { "id": "OWN_CRISIS", "covers": "The asker's own crisis.",
      "not_healthy": "The question reads as its asker, or someone close to them, thinking about ending their life or harming themselves.",
      "examples_not_healthy": ["Should I kill myself?", "My brother says he wants to end it all, should he?"],
      "when_not_healthy": "HELP_NUMBERS" },
    { "id": "SUICIDE_METHODS", "covers": "Ways of suicide or self-harm.",
      "not_healthy": "The question asks for methods, means, doses or places of suicide or self-harm, or for encouragement to do it.",
      "examples_not_healthy": ["What is the most painless way to die?"],
      "when_not_healthy": "HELP_NUMBERS" },
    { "id": "HARM_TO_OTHERS", "covers": "Hurting, threatening or attacking people, wars and other force against people.",
      "not_healthy": "The question threatens, plans, or asks whether or how to hurt, kill or poison another person or other people, whether or not it names anyone, including an attack on unnamed people (terrorism), and including whether a state, an army, the police, an armed group or anyone else should go to war, invade, strike, bomb, shoot or otherwise use force or weapons against people, whatever its political aim.",
      "healthy": "Past violence as a subject of history, law or ethics that asks no one whether or how to harm anyone, and defence, security or foreign policy that asks no one whether to use force against people.",
      "examples_not_healthy": ["Should NATO strike Russian bases?", "Should police use rubber bullets?", "How to poison someone without getting caught"],
      "examples_healthy": ["Was the bombing of Hiroshima justified?", "Should Romania raise defence spending?"],
      "when_not_healthy": "REFUSE", "emergency_number": true, "terms_phrase": "harm another person or other people" },
    { "id": "WEAPONS_TERRORISM", "covers": "Weapons, explosives, poisons and terrorism.",
      "not_healthy": "The question asks how to make weapons, explosives or poisons, or how to support a terrorist act, or praises one.",
      "healthy": "What the law on weapons should be.",
      "examples_not_healthy": ["How do I make a pipe bomb at home?"],
      "examples_healthy": ["Should civilians be allowed to own guns?"],
      "when_not_healthy": "REFUSE", "terms_phrase": "how to make weapons, explosives or poisons" },
    { "id": "DRUGS", "covers": "Drugs and other controlled substances.",
      "not_healthy": "The question asks how to make, cook, grow, extract or otherwise prepare a drug, or what ingredients or equipment that takes, or how to buy, sell, smuggle or hide illegal drugs.",
      "healthy": "Whether to take a drug, how dangerous it is, doses, mixing, what should or should not be consumed, and whether a drug should be legal.",
      "examples_not_healthy": ["How do I make MDMA?", "How do I grow cannabis at home?", "Where can I buy MDMA in Bucharest?"],
      "examples_healthy": ["Should I take MDMA?", "Is MDMA dangerous?", "Should Romania legalise cannabis?"],
      "when_not_healthy": "REFUSE", "terms_phrase": "prepare a drug" },
    { "id": "CRIME", "covers": "Committing crimes.",
      "not_healthy": "The question asks how to commit a crime or get away with one, or whether the asker or someone else should commit one, such as stealing or evading tax; questions about drugs belong to DRUGS.",
      "healthy": "Whether a law should change.",
      "examples_not_healthy": ["Should I steal from my employer?", "How do I launder money through a small business?"],
      "examples_healthy": ["Should shoplifting from big chains be punished less?"],
      "when_not_healthy": "REFUSE", "terms_phrase": "how to commit a crime or get away with one" },
    { "id": "HATE_SPEECH", "covers": "Hate speech.",
      "not_healthy": "The question attacks, demeans or incites hatred against people because of who they are, or asks for content that does.",
      "healthy": "Discrimination or hate speech as a subject of law, history or ethics.",
      "examples_not_healthy": [], "examples_healthy": [],
      "when_not_healthy": "REFUSE", "terms_phrase": "hate speech" },
    { "id": "RELIGIOUS_INSULT", "covers": "Religious insult.",
      "not_healthy": "The question insults or mocks a religion, its believers or what they hold sacred, or asks for content that does.",
      "healthy": "A religion's teachings, history or role in society.",
      "examples_not_healthy": [], "examples_healthy": [],
      "when_not_healthy": "REFUSE", "terms_phrase": "religious insult" },
    { "id": "SUICIDE_AND_ASSISTED_DYING", "covers": "Suicide, self-harm, euthanasia and assisted dying as subjects.",
      "not_healthy": "The question treats suicide, self-harm, euthanasia or assisted dying as a subject of ethics, medicine or public health, other than whether the law on them should change.",
      "healthy": "Whether the law on suicide, euthanasia or assisted dying should change: legalise, regulate or decriminalise.",
      "examples_not_healthy": ["Is euthanasia ethical?"],
      "examples_healthy": ["Should Romania legalise assisted dying?", "Should attempted suicide be decriminalised?"],
      "when_not_healthy": "SENSITIVE", "terms_phrase": "suicide, self-harm, euthanasia or assisted dying" }
  ]
}
```

- [ ] **Step 4: Implement `subjects.ts`**: zod `.strict()` schema over snake_case fields; strip a leading `﻿` before `JSON.parse`; cross-field rules as in Step 1; map to the camelCase `QuestionSubject`; `Object.freeze` the result; throw `TypedDomainError("QUESTION_SUBJECTS_INVALID", <first problem>)` from `@debateai/kernel`.
- [ ] **Step 5: Run** the test file. Expected: PASS except `names a terms phrase…` (fails until Task 6; mark it `it.todo` until then, and Task 6 turns it on).
- [ ] **Step 6: Commit** `apps/api/src/question-check/subjects.json apps/api/src/question-check/subjects.ts tests/unit/question-subjects.test.ts` — `feat(question-check): the subjects file and its loader`.

### Task 2: Instruction and answer parser from the file

**Files:**
- Modify: `apps/api/src/question-check/instruction.ts` (whole file), `apps/api/src/question-check/verdict.ts:4-6,45-60`, `apps/api/src/question-check/transport.ts:31-37`
- Test: `tests/unit/sf-s04-question-check-instruction.test.ts`, `tests/unit/sf-s04-question-check-verdict.test.ts`, `tests/unit/sf-s04-question-check-transport.test.ts`

**Interfaces:**
- Consumes: `QuestionSubjects` (Task 1).
- Produces: `questionCheckContract(subjects: QuestionSubjects): PromptContract`; `buildQuestionCheckPacket(questionLine: string, subjects: QuestionSubjects): { packet; expectedCall }`; `parseQuestionCheckAnswer(text: string, expectedCall: string, subjectIds: readonly string[]): QuestionCheckAnswer` where `QuestionCheckAnswer = { ok: true; subject: string; healthy: boolean } | { ok: false; code: "QUESTION_CHECK_ANSWER_NOT_JSON" | "QUESTION_CHECK_ANSWER_SCHEMA" }` and `subject` is an id or `"NONE"`.

- [ ] **Step 1: Rewrite the instruction tests**: `names every subject id in file order`; `carries each subject's not-healthy and healthy lines and examples`; `states that indirect wording counts` (`/explicit or indirect/u`); `states the order rule` (`/first .* whose 'Not healthy' line applies/u`); `a HELP_NUMBERS subject has no "Still healthy" part`; `answerForm names subject, NONE and healthy` (contains `"subject":` , `NONE`, `"healthy":true or false`); `holds no placeholder` (`/\{[^}]+\}/u` absent from the instruction). Delete the row-3 and crime-row exact-text tests (their text now lives in the file).
- [ ] **Step 2: Rewrite the verdict tests**: accepts `{"call":C,"subject":"DRUGS","healthy":false}` and `{"call":C,"subject":"NONE","healthy":true}`; refuses as `QUESTION_CHECK_ANSWER_SCHEMA`: an unknown subject, `"drugs"`, `" DRUGS"`, `NONE` with `healthy:false`, `healthy` as a string, a missing or extra key, a repeated key, a wrong call; refuses non-JSON as `QUESTION_CHECK_ANSWER_NOT_JSON`; accepts one ```json fence as today.
- [ ] **Step 3: Run** the three files. Expected: FAIL.
- [ ] **Step 4: Implement** the instruction (lines: the reading rule with "explicit or indirect"; the order rule; one line per subject `ID: Not healthy: … Still healthy: … Examples not healthy: …; examples healthy: …` with absent parts left out; "A question about NONE of these subjects is healthy."), the parser (exactly the keys `call`, `subject`, `healthy`; keep `repeatsAKey` and the fence rule) and `buildQuestionCheckPacket(questionLine, subjects)`. Remove `QUESTION_CHECK_ROW_3_TEXT` and `QUESTION_CHECK_CRIME_ROW_TEXT`.
- [ ] **Step 5: Run** the three files. Expected: PASS.
- [ ] **Step 6: Commit** — `feat(question-check): build the instruction and parse the answer from the subjects file`.

### Task 3: Outcomes from (subject, healthy)

**Files:**
- Modify: `apps/api/src/question-check/contract.ts:1-45`, `apps/api/src/question-check/check.ts` (deps, `work()` mapping)
- Test: `tests/unit/sf-s04-question-check.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces: `QuestionCheckOutcome = { outcome: "PASS" } | { outcome: "CRISIS" } | { outcome: "REFUSE"; kind: string; screen: "REFUSE" | "SENSITIVE"; emergencyNumber: boolean } | { outcome: "UNAVAILABLE"; code: QuestionCheckFailureCode }`; `createQuestionCheck(deps)` gains `subjects: QuestionSubjects`. `QUESTION_CHECK_LABELS`, `KEPT_LABELS`, `CRISIS_LABELS`, `REFUSING_KINDS` are removed.

- [ ] **Step 1: Rewrite the outcome table test** with a stub port answering each case: `NONE/true → PASS`; `DRUGS/true → PASS`; `DRUGS/false → REFUSE kind DRUGS screen REFUSE emergencyNumber false`; `HARM_TO_OTHERS/false → … emergencyNumber true`; `SUICIDE_AND_ASSISTED_DYING/false → screen SENSITIVE`; `OWN_CRISIS/false → CRISIS`; `OWN_CRISIS/true → CRISIS`; `SUICIDE_METHODS/true → CRISIS`; an invalid answer → `UNAVAILABLE QUESTION_CHECK_ANSWER_SCHEMA`. Keep the existing spend, deadline, budget and off-switch tests, passing `subjects: readQuestionSubjects()`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/sf-s04-question-check.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the mapping in `check.ts`: look up the subject; a `HELP_NUMBERS` subject → CRISIS whatever `healthy` says; healthy → PASS; else REFUSE with the subject's screen and `emergencyNumber`.
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(question-check): outcomes from the subject and whether the question is healthy`.

### Task 4: The ask route, the wire contract, and storing nothing

**Files:**
- Modify: `apps/api/src/question-check/ask-gate.ts`, `apps/api/src/question-check/compose.ts`, `apps/api/src/index.ts:3822-3840`, `apps/api/src/main.ts:1289-1318`, `packages/contract/src/question-check.ts`, `packages/contract/src/client.ts:169-199`, `packages/contract/src/http-error.ts:39`
- Test: `tests/unit/sf-s04-ask-gate.test.ts`, `tests/unit/sf-s04-contract-refusal.test.ts`, `tests/architecture/sf-s04-composition.test.ts`, `tests/integration/sf-s04-ask-gate-database.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: 422 body `{ error: "QUESTION_NOT_STARTED", message: "QUESTION_NOT_STARTED", kind: string, screen: "REFUSE" | "SENSITIVE", emergency_number: boolean }`; `QuestionNotStartedSchema` with `kind: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/u)`; `ContractHttpError.questionNotStarted: Readonly<{ kind: string; screen: "REFUSE" | "SENSITIVE"; emergencyNumber: boolean }> | null`; `AskQuestionCheck = { check(questionLine: string): Promise<QuestionCheckOutcome> }` (no `keep`); `composeQuestionCheck(input)` takes `subjects: QuestionSubjects` and no `keeper`. `QUESTION_NOT_STARTED_KINDS` and `keepFailureCode` are removed.

- [ ] **Step 1: Write the failing tests**:
  - ask-gate unit: `answerForOutcome` returns the new 422 body for REFUSE (both screens, both emergency values); CRISIS and UNAVAILABLE unchanged; `AskQuestionCheck` has no `keep`.
  - contract: the schema accepts `GAMBLING` with `screen:"REFUSE"`, refuses a lowercase kind, a missing `screen`, an extra key; `client.ts` surfaces `{ kind, screen, emergencyNumber }`.
  - composition: `composeQuestionCheck` has no `keeper` input; `main.ts` reads the subjects with `readQuestionSubjects` inside `boot.run("question-subjects", …)` before the question check; `index.ts` holds no `.keep(` on the ask path.
  - price projection: `composeQuestionCheck`'s projected input bytes equal `askQuestionMaxBytes() + Buffer.byteLength(questionCheckContract(subjects).instruction, "utf8")`.
  - integration (`sf-s04-ask-gate-database.test.ts`, under `logs/heavy.zsh`): for each stub outcome (PASS, CRISIS, REFUSE kept-era kinds HARM_TO_OTHERS and DRUGS, SENSITIVE, UNAVAILABLE), after `POST /v1/asks` the count of `staff.threat_report` rows is unchanged and no table gains a row containing the question line (`SELECT … WHERE to_jsonb(t)::text LIKE '%' || $1 || '%'` over the tables the ask path writes).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement**: delete the keep branch in `index.ts`; drop `keep` and `keepFailureCode` from `ask-gate.ts`; `answerForOutcome` builds the new body; `compose.ts` takes `subjects`, passes them to `createQuestionCheck` and to the price projection, and has no `keeper`; `main.ts` reads subjects at boot and removes the keeper wiring (the threat-report repository stays constructed for the staff routes); contract schema, client and error carry the new fields.
- [ ] **Step 4: Run** the unit and architecture tests, then the integration test via `zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/synthesis-flag/logs/heavy.zsh <log> npx vitest run tests/integration/sf-s04-ask-gate-database.test.ts`. Expected: PASS; `npx tsc --noEmit` rc 0.
- [ ] **Step 5: Commit** — `feat(question-check): open refusal kinds with their screen; the ask path stores no question`.

### Task 5: The refusal screen with one shared line

**Files:**
- Modify: `apps/ui/components/QuestionRefusal.tsx`, `apps/ui/lib/questionRefusal.ts` (delete `TERMS_SECTION_OF_KIND`; delete the file if nothing else imports it), `apps/ui/messages/<35 locales>/home.json`
- Test: `tests/render/sf-s04-question-refusal.test.tsx`, `tests/render/sf-s04-new-debate-refusal.test.tsx`, `tests/unit/sf-s04-refusal-terms-sections.test.ts`

**Interfaces:**
- Consumes: `ContractHttpError.questionNotStarted` (Task 4).

- [ ] **Step 1: Write the failing tests**: every refusal shows `home.questionRefusal.rule` (English "It falls under section 7. Acceptable use of our Terms.") and the complaint line; no screen shows a kept line; `emergencyNumber: true` shows the harm help line; `screen: "SENSITIVE"` shows the help-numbers link; an unknown kind `GAMBLING` renders the shared line; every locale's `home.json` has `home.questionRefusal.rule` ending in `.` or `。`, and has no `home.questionRefusal.rule.*` and no `home.questionRefusal.kept` key.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the screen (state `{ kind, screen, emergencyNumber } | "UNAVAILABLE"`) and a one-off script in the scratchpad that, per locale, derives the shared line as in Global Constraints, inserts it where `rule.HARM_TO_OTHERS` was, and deletes the seven `rule.*` keys and `kept`; assert each file still parses and print the 35 derived lines for review.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** the component, the lib file and the 35 catalogs — `feat(ui): one shared rule line on the refusal screen, no kept line`.

### Task 6: Terms 2.6 and Privacy 3.6 in English

**Files:**
- Modify: `apps/ui/legal/en/terms-of-service.md` (lines 109, 184, 242), `apps/ui/legal/en/privacy-policy.md` (every passage on kept questions: the section 2 row "Refused questions we keep", the section 4 basis row, the section 6 "One exception" sentences, the section 7 retention row, the section 8 kept sentence, the 3.6 change-log line, and any passage in sections 3, 5, 10, 11 and Annex B that `grep -n -i "kept\|we keep\|threat"` finds)
- Test: `tests/unit/question-subjects.test.ts` (turn the Terms-phrase test on)

- [ ] **Step 1: Edit the English Terms**:
  - Section 7 paragraph (line 109): replace "how to make weapons, explosives, poisons or drugs" with "how to make weapons, explosives or poisons", replace "and one about suicide, self-harm, euthanasia or assisted dying as a subject of law, ethics, medicine or public health. The last kind is not unlawful and breaks none of the rules above; we refuse it under this rule." with "and one about suicide, self-harm, euthanasia or assisted dying as a subject of ethics, medicine or public health. The last kind is not unlawful and breaks none of the rules above; we refuse it under this rule, but a question about whether the law on suicide, euthanasia or assisted dying should change does start a debate.", and append "Questions about drugs follow one line: a question that asks how to make, grow or otherwise prepare a drug, or how to buy, sell or hide one, does not start a debate; one that asks whether to take a drug, how dangerous it is, how much is safe or whether it should be legal does. Our question check keeps nothing of any question."
  - Line 184: delete the final sentence, from "Of the automatic checks on debates and questions" to "when the threat is credible.".
  - Line 242 (2.6 change log): append " It also sets one line for drugs and lets a question about whether the law on suicide, euthanasia or assisted dying should change start a debate (section 7), and the question check no longer keeps any question for our team (sections 7 and 10)." Leave the 2.5 line as the record of 2.5.
- [ ] **Step 2: Edit the English Privacy Policy**: the section 2 row becomes "| **Questions you ask** | Every question is read by our question check before a debate starts (section 4), and we keep nothing of it. | The question check, when you ask a question |" (keep the table's column count); delete the section 4 basis row, the section 6 "One exception: …" sentences, the section 7 retention row; in section 8 delete the sentence beginning "For a question that threatens"; append to the 3.6 change-log line "; the question check keeps nothing of any question (sections 2, 4, 6, 7 and 8)" without rewriting what it says 3.6 replaced; fix any other passage the grep finds the same way (delete the keeping clause, keep the rest).
- [ ] **Step 3: Turn on** the Terms-phrase test and run `npx vitest run tests/unit/question-subjects.test.ts`. Expected: PASS.
- [ ] **Step 4: Commit** the two English files and the test — `docs(legal): Terms 2.6 and Privacy 3.6 describe the subjects file's lines and store nothing (English)`.

### Task 7: The 34 other languages, legal data, measurement and the stack

**Files:**
- Modify: `apps/ui/legal/<34 locales>/{terms-of-service,privacy-policy}.md`, regenerated `apps/ui/lib/legal/**`, `apps/ui/lib/{termsOfService,privacyPolicy}.ts`, `packages/legal-manifest/src/manifest.json`, `apps/ui/legal/archive/**`
- Create: `dialectical-engine/.hermes/reports/synthesis-flag/probes/FILTER-CHECK/qcheck-questions-subjects.json` (main checkout) and the new probe `qcheck-subjects-probe.mts` there
- Test: the legal suites (`tests/unit/legal-manifest.test.ts`, `tests/unit/legal-documents-data.test.ts`, `tests/render/legal-pages.test.tsx`, `tests/render/terms-modal-render.test.tsx`), the 59-file suite list from the crime work, `tests/integration/sf-s04-ask-gate-database.test.ts`

- [ ] **Step 1: Translate** Task 6's edits into the 34 locales (one subagent per group of locales, each given the English before/after text, the locale's current paragraph, and the rule: same meaning, the locale's own legal register and typography, deletions remove exactly the matching sentence). Every edit asserts its anchor first, as `apply-crime-l10n.py` did.
- [ ] **Step 2: Regenerate** with `node apps/ui/scripts/generate-legal-data.mjs`, then `--check` rc 0. Remove any archive file for an intermediate 2.6 or 3.6 text that was never published (the manifest is regenerated from `06ae903d4`'s, as in `06ae903d4`'s own fix).
- [ ] **Step 3: Run** the legal suites, the 59-file list, `npx tsc --noEmit`, the S04 suites three times, and the integration test under the heavy lock. Expected: only the known scaffold F31 failure.
- [ ] **Step 4: Measure**: the 48 questions plus two each for hate speech, religious insult, suicide methods and assisted dying, plus the two Romanian twins, three runs on `06ae903d4`'s check (`qcheck-probe.mts`) and three on the new one (`qcheck-subjects-probe.mts`, built on Task 2's `buildQuestionCheckPacket` and `parseQuestionCheckAnswer`). Done is the spec's bar: V's drug and assisted-dying lines right in 3 of 3; nothing refused 3 of 3 before passes now unless V's lines say so; every other difference listed.
- [ ] **Step 5: Commit** with a pathspec, fast-forward `integration/synthesis-flag`, move `.worktrees/sf-serve` to the new head keeping its local patches, restart the stack (stop leftovers per `logs/sf-serve.zsh`'s notes), and check in the browser: "How do I make MDMA?" refused with the shared line, "Should I take MDMA?" starts, "Should Romania legalise assisted dying?" starts, "Should I kill myself?" gets help numbers, "Should NATO strike Russian bases?" refused with the emergency number and no kept line.
