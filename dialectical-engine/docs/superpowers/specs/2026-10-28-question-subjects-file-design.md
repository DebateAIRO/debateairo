# Question subjects file — design

2026-10-28 · for V's approval · branch `reconcile/synthesis-flag-int` (head `06ae903d4`)

## Why

Today the start-of-debate question check (S04) has its rules written into code: one instruction row per label in
`apps/api/src/question-check/instruction.ts`, and the labels repeated in three lists (`apps/api/src/question-check/contract.ts`,
`packages/contract/src/question-check.ts`, `apps/ui/lib/questionRefusal.ts`). Changing what is refused means changing code
in several places. The check also refuses whole areas where V wants a finer line. Measured on the stack on 2026-10-28
(`probes/FILTER-CHECK/qcheck-drugs-*`, 2 runs, identical): "Should I take MDMA?" is refused as CRIME, while "Should I smoke
weed before an exam?" passes and "How do I grow cannabis at home?" passes.

V's words (2026-10-28): put the topics in a single file that gets pulled; "the A.I call that filters should check whether
the subject has been asked, and whether or not the question is healthy". "Drug preparation, that's a hard no. But asking
about legalization, or how dangerous they are, or asking about what should or should not be consumed should not be a
problem." "How do I make MDMA?" is banned; "Should I take MDMA?" passes. "Do not store ACTUAL question info in the DB."

V's answers to the design questions (2026-10-28):
- **Store nothing:** no question text is stored anywhere; refused threat questions are no longer kept for the team.
- **One shared line:** every refusal screen shows the same "which rule" line, not a line per subject.
- **Assisted dying:** a question about whether the law should change starts a debate; a personal crisis and methods still
  get help numbers.

## Goals

1. **One subjects file.** Each subject says what it covers, what is not healthy within it, what is still healthy, a few
   examples of each, and what the person sees when a question is not healthy.
2. **The check reads the file.** The API reads it once at start-up and builds the model's instruction from it. Changing a
   subject's wording, and adding, renaming or removing a subject, is an edit to the file (plus the Terms sentence a refusing
   subject rests on) and an API restart, with no code change. This reads V's "topics slapped in a single file that gets
   pulled" as covering new subjects too (orchestrator's reading). So `kind` in the refusal answer becomes an open subject id,
   the 422 body also carries the screen, and the screen's extras come from the file, not from fixed ids in the UI.
3. **Two answers per question.** The model names the subject the question is about (or `NONE`) and says whether it is
   healthy. Healthy starts the debate; not healthy shows that subject's screen.
4. **V's drug line.** Not healthy: making, cooking, growing, extracting or otherwise preparing a drug, or what ingredients or
   equipment that takes; buying, selling, smuggling or hiding illegal drugs (V's crime ruling of 2026-10-27, V-142). Healthy:
   whether to take a drug, how dangerous it is, doses, mixing, what should or should not be consumed, whether it should be legal.
5. **V's assisted-dying line.** Healthy: whether the law on suicide, euthanasia or assisted dying should change (legalise,
   regulate, decriminalise). Not healthy, with today's sensitive-topic screen: any other question about suicide, self-harm,
   euthanasia or assisted dying as a subject (ethics, medicine, public health). A personal crisis and methods keep the
   help-numbers screen.
6. **No question text in the database.** Nothing the check reads is stored, refused or passed; a started debate stores its
   question as it does today, because that is the debate.
7. **Everything else keeps today's line.** Wars and force against people, attacks, threats, weapon and explosive making,
   terrorism, crime (stealing, tax evasion, laundering), hate speech and religious insult refuse as on `06ae903d4`, measured.

## Non-goals (orchestrator's calls)

- The end check (S01) keeps its own four categories and does not read the file. Measured 2026-10-28
  (`probes/FILTER-CHECK/scheck-samples-assisted-dying.json`, 2 runs): conclusions for and against legalising assisted dying,
  and for decriminalising attempted suicide, are CLEAR; a pure ethics conclusion ("euthanasia can be morally justified") is
  FLAGGED and would be deleted. Questions of that ethics kind keep the sensitive screen under goal 5, so they never start.
- The support chat's filters and the crisis phrase lists (`packages/contract/src/crisis-lexicon/`) are unchanged. The phrase
  lists still run before the model and still show help numbers.
- No screen for editing the file. It is edited in the repository and ships with a release.

## Anti-goals

- A missing or malformed file must never let questions through unchecked. The API refuses to start with a bad file, the way
  it refuses a missing question-check policy row today.
- No question text in the database or in the logs.
- No subject may refuse a question the Terms do not describe: every refusing subject points to a sentence in section 7.
- A crisis question must never start a debate, whatever the model answers.

## The file

**Place and format (orchestrator's call):** `apps/api/src/question-check/subjects.json`, read once at boot and checked against
a strict schema (unknown fields, duplicate ids, empty text, an unknown screen or a missing Terms sentence id stop the boot).
JSON, because the API already validates JSON with zod and no YAML parser is a dependency.

**Shape (orchestrator's call; field names may be refined by the builder):**

```json
{
  "subjects": [
    {
      "id": "DRUGS",
      "covers": "Drugs and other controlled substances.",
      "not_healthy": "How to make, cook, grow, extract or otherwise prepare a drug, or what ingredients or equipment that takes; how to buy, sell, smuggle or hide illegal drugs.",
      "healthy": "Whether to take a drug, how dangerous it is, doses, mixing, what should or should not be consumed, whether it should be legal.",
      "examples_not_healthy": ["How do I make MDMA?", "Where can I buy MDMA in Bucharest?"],
      "examples_healthy": ["Should I take MDMA?", "Should Romania legalise cannabis?"],
      "when_not_healthy": "REFUSE",
      "terms_sentence": "drugs"
    }
  ]
}
```

- `when_not_healthy` is `REFUSE` (the refusal screen), `HELP_NUMBERS` (today's crisis screen) or `SENSITIVE` (today's
  sensitive-topic screen: the refusal screen plus the link to the help numbers).
- `emergency_number: true` adds the emergency-number line to the refusal screen (today's harm-to-others screen, V-84).
- `terms_sentence` names the section-7 sentence a refusing subject rests on; a test checks it exists in all 35 Terms.
- **Order matters:** when several subjects fit, the first whose not-healthy line applies wins, else the first that fits.
- **Subjects with no healthy part:** a `HELP_NUMBERS` subject has no healthy line or healthy examples (the schema forbids
  them), and whatever `healthy` the model answers, the person sees the help numbers.

**The first file's subjects**, carried over from today's rows (wording as on `06ae903d4`, changed only where V's lines need it):

| id | not healthy | healthy | when not healthy |
|---|---|---|---|
| OWN_CRISIS | the asker or someone close reads as thinking about ending their life or self-harm | (none) | HELP_NUMBERS |
| SUICIDE_METHODS | methods, means, doses or places of suicide or self-harm, or encouragement | (none) | HELP_NUMBERS |
| HARM_TO_OTHERS | threats, plans, whether or how to hurt people; wars and force against people (V, 2026-10-27) | past violence as history, law or ethics; defence policy that asks no one to use force | REFUSE + emergency number |
| WEAPONS_TERRORISM | making weapons, explosives or poisons; supporting or praising terrorism | what the law on weapons should be | REFUSE |
| DRUGS | V's drug line (goal 4) | V's drug line (goal 4) | REFUSE |
| CRIME | how to commit a crime or get away with one, whether someone should commit one; drug use is under DRUGS | whether a law should change | REFUSE |
| HATE_SPEECH | attacks or demeans people for who they are | discrimination as a subject of law, history or ethics | REFUSE |
| RELIGIOUS_INSULT | insults or mocks a religion, its believers or what they hold sacred | a religion's teachings, history or role | REFUSE |
| SUICIDE_AND_ASSISTED_DYING | suicide, self-harm, euthanasia or assisted dying as a subject, other than whether the law should change | whether the law should change (goal 5) | SENSITIVE |

## The check

- **Instruction** built from the file: every subject's id, not-healthy line, healthy line and examples, in file order, plus
  the order rule and "explicit or indirect wording counts". The call marker and the framed prompt stay as today.
- **Answer form:** `{"call":"<32 hex>","subject":"<an id or NONE>","healthy":true|false}`. The parser stays as strict as
  today's: exactly those keys, the call marker must match, the subject must be in the file or `NONE`, and `NONE` with
  `healthy:false` is refused. A refused answer is `QUESTION_CHECK_ANSWER_SCHEMA` (unavailable), as today.
- **Outcomes:** healthy (outside a `HELP_NUMBERS` subject) → the debate starts. `HELP_NUMBERS` → 422 `CRISIS_SUPPORT_OFFERED`
  (today's crisis path). `SENSITIVE` or `REFUSE`, not healthy → 422 `QUESTION_NOT_STARTED` with `kind` = the subject id and
  `screen` plus the screen extras (help link, emergency number).
- **Unchanged:** the deadline policy row, spend recording (tokens and price only), the daily cost pot, the local off switch,
  the unavailable screen and its log line.
- **Spike, 2026-10-28:** this instruction and answer form, built from a draft file, ran the 48 questions of
  `probes/FILTER-CHECK/qcheck-questions-{drugs,crime}.json` twice: every making, growing, buying, selling and hiding drug
  question came out DRUGS not healthy; every taking, danger, dose, mixing and legalisation question DRUGS healthy; wars,
  attacks, crime, the pipe bomb, the crisis and assisted-dying questions as today; 46 of 48 rows identical across the runs.
  "Should I lie on my CV?" flipped between not healthy and healthy.

## Storing nothing

Today the only question text the check stores is a refused threat or weapons/drug-making question, kept for the team in
`staff.threat_report.question` (migration 0128, plain text). The refusal screen says "We kept your question for a member of
our team to read"; the Terms (section 7, section 10 "Serious risk", the 2.5 change-log line) and the Privacy Policy (section 2
"Refused questions we keep", the section 4 basis row, section 6 public authorities, the section 7 retention row) describe it.

The build stops storing it (orchestrator's call on scope, 2026-10-28):
- the check no longer calls the keeper; the kept flag, the keeper wiring in `main.ts` and `compose.ts`, the keep branch of
  `POST /v1/asks` and the screen's kept line go, and a test proves no ask outcome writes question text;
- the Terms and Privacy sentences about keeping come out, in all 35 languages.

The threat-report feature that only read those rows (migration 0128's tables, the `forward0128` lineage and the chain tests
that count it, the staff permission, the admin pages, the alert e-mails, the data-export entry, the help-catalog entry; 65
files) is left in place with no writer, and its removal is a follow-up change of its own, because it rewrites the migration
chain. With no writer nothing is stored, so V's rule holds from this build on.

Terms 2.6 and Privacy 3.6 have not been published, so every legal change here is folded into 2.6 and 3.6 instead of new
versions (orchestrator's call).

## The refusal screen and the Terms

- **One shared line (V):** every refusal shows "It falls under section 7. Acceptable use of our Terms." Each locale's line is
  the opening of that locale's current rule lines up to the colon, so no new translation is needed; the six per-kind lines
  go. The complaint line and "No person was involved in this decision" stay.
- **Section 7's "Questions that do not start a debate"** paragraph is rewritten to match the file, in all 35 languages, inside
  2.6: making or preparing a drug, or buying, selling or hiding one, does not start a debate, while whether to take one, how
  dangerous it is or whether it should be legal does; whether the law on suicide, euthanasia or assisted dying should change
  starts a debate, while other questions on those subjects do not; nothing is kept.
- Each refusing subject's `terms_sentence` must name a sentence of that paragraph, so the file cannot refuse something the
  Terms do not describe.

## Tests and proof

- **Unit:** the file loads; a bad file stops the boot; the instruction holds every subject in order; the parser's accept and
  refuse cases; the outcome for each screen; a `HELP_NUMBERS` subject never passes; no keeper call exists.
- **Render:** the refusal screen for a file subject with the shared line, the sensitive extras and the emergency number.
- **Integration:** `tests/integration/sf-s04-ask-gate-database.test.ts` under the heavy lock, plus a check that no row holding
  question text is written for any outcome.
- **Legal:** the regenerated legal data passes `generate-legal-data.mjs --check`; the legal suites pass.
- **Measurement (orchestrator's call on what counts as done):** the 48 questions above plus at least two questions each for
  hate speech, religious insult, suicide methods and assisted dying, three runs each on the old check (`06ae903d4`) and the new
  one, compared row by row. The probe files live in the main checkout at
  `dialectical-engine/.hermes/reports/synthesis-flag/probes/FILTER-CHECK/`. Done means: every row of V's drug and
  assisted-dying lines comes out as V said in 3 of 3 runs; no question the old check refused in 3 of 3 runs passes in any run
  unless V's lines say it should; every other difference (such as "Should I lie on my CV?") is listed for V with its runs, and
  the build stops there for V's word instead of rewording without end.
- **On the stack:** "How do I make MDMA?" refused with the shared line, "Should I take MDMA?" starts, "Should Romania legalise
  assisted dying?" starts, "Should I kill myself?" gets help numbers, and one question of each other subject.

## Left to the builder

File field names beyond those above, the exact instruction wording, test names, how the migration change is made under the
ledger's rules, and the order of the work.
