# Keeping personal details out of public text — design

2026-11-17 · for the owner's approval · nothing is built yet · the legal wording this goes with is in
`docs/legal/2026-11-16-public-debates-stay-public.md`, Part 3 (pull request #276)

## What this is for

A public debate stays public for good, also after its author erases their account, because other people spend their
own credit to build on it. That is fair only if the public text says nothing about a private person. Today nothing
checks that: the question check looks for harm, the end-of-debate check for four categories, the check at publishing
for hate speech. None of them looks for a name or a phone number.

Example. On the Free plan someone asks: "My neighbour Ion Popescu, Str. Lalelelor 12, Cluj, is building a second
floor without a permit. Should I report him?" Today that becomes a public page, name and address included, and stays.

The owner's rules of 16 November 2026, in short: (1) check wherever a person types text that will be public; (2) an
AI takes the personal part out, shows the changed text and says what it changed; (3) a private paid debate is checked
only at Publish, and is not published if details are found; (4) people in a public role, companies and institutions
are not private persons; (5) as few tokens as possible.

## The design in six lines

- **Two doors, no new AI call.** Door 1 is where a person types; it rides in the question check's call. Door 2 is where
  a text becomes public; it rides in the publishing check's calls.
- **Door 1 changes the text and asks.** The person sees the changed text and what kind of detail was taken out, and
  picks: use it, edit it, or cancel.
- **Door 2 only says yes or no.** At Publish there is nothing left to rewrite: the AIs already debated the details.
- **The end-of-debate check is not used.** It reads only the AIs' conclusion, never what a person typed, and it also
  runs on private debates, which rule 3 says are not checked.
- **Nothing personal is kept.** The typed text with the details in it is never stored by us.
- **When the model cannot be reached, nothing goes public.** Both doors already work that way today.

## Where a person types text that becomes public

All four arrive through one route, `POST /v1/asks` (`apps/api/src/index.ts`, `askAsOwner`; fields in
`AskRequestSchema`, `packages/contract/src/index.ts`). "Checked today" means the question check already reads it for
harm.

| # | What the person types | Screen | Field, and how it gets public | Checked today |
|---|---|---|---|---|
| 1 | The question | `apps/ui/components/v4/V4AskClient.tsx` (older page: `apps/ui/app/new/NewDebatePageClient.tsx`) | `question_line`; becomes `question` in the public copy (`apps/api/src/publications.ts`) | yes |
| 2 | Answers to the AIs' clarifying questions, the typed "Other" among them; place, time and purpose lines | `apps/ui/components/v4/V4AskQuestions.tsx` | `purpose_lines` (`packages/contract/src/web.ts`); added to the public `question` on a Free debate | yes |
| 3 | On step 2 of starting: the person's own path, and a path's title or wording they edit | `apps/ui/components/v4/V4StartCard.tsx`, `V4StartRow.tsx` | `start_paths` (`packages/contract/src/start-paths.ts`); shown on the public page as "Written by the person who asked" | yes (`apps/api/src/start-paths-at-ask.ts`) |
| 4 | A dig into a public debate, on any plan: the person's own view, or a suggestion they edit | `apps/ui/components/v4/V4PublicLane.tsx`, `V4DigSuggest.tsx` | `public_parent.picks[].text` (admitted in `apps/api/src/public-tree.ts`); quoted word for word in public reports | yes, with a gap |

**The gap in row 4.** The question check reads a dig's own-view texts only while the start step is switched on
(`startHandOverOf` in `apps/api/src/start-paths-at-ask.ts`); otherwise only the question line. Door 1 reads them always.

Two steps where nothing is typed, but typed text goes public:

| # | Step | Screen and code | What goes public |
|---|---|---|---|
| 5 | Publish, on a paid plan | `apps/ui/components/PublicationControl.tsx` → `apps/api/src/publications.ts`. A tick box only. | Everything typed in rows 1–3 while the debate was private, and what the AIs wrote from it |
| 6 | A report on a public debate | `apps/ui/components/v4/V4ReportClient.tsx`. No text box. | The AIs write it, and it repeats the own words of rows 3 and 4 |

Looked for and not there: a text box for steering a running debate, a file upload, text typed at Publish.

- **Not typed:** the pseudonym. The machine makes it up at sign-up (`packages/crypto/src/pseudonym.ts`) and it can
  never be changed, so it cannot hold a real name.
- **Typed, never public:** a report to our team (`apps/ui/components/v4/V4PublicFlag.tsx`), questions saved and not
  started (`apps/api/src/saved-questions/`), the support chat.
- **Typed by our own team, public, read by no check:** a reviewer's correction over a piece of a public page
  (`apps/api/src/staff/public-review.ts`). Outside the owner's rule; listed so it is not forgotten.

## Door 1 — when the person types

**Where it rides.** The question check (`apps/api/src/question-check/`) is one call to Claude Haiku 5.5 that already
receives rows 1–4 before a debate starts. Door 1 adds a few lines to its instruction and two fields to its answer.
The lines are sent only when the text will be public (Free plan, or a dig into a public debate), so a private paid
debate pays nothing and is not checked.

**What the model is asked** (draft, about 200 tokens added):

> Also look for details that identify a private person, the asker included: a name; contact details (phone, e-mail,
> home address, social-media handle); an identification number; a workplace together with a role; health, money or
> family details tied to someone who can be recognised. People acting in a public role, and companies and
> institutions, are not private persons. When unsure whether a person is private, treat them as private. If you find
> such details, write each field that holds them again without them, in the same language, so that it still asks the
> same thing. Change nothing else.

**What it returns.** Today: `{"call":"…","subject":"NONE","healthy":true}`. With Door 1, two more fields:

```json
{"call":"…","subject":"NONE","healthy":true,
 "personal":["NAME","CONTACT"],
 "changed":{"question":"A neighbour is building a second floor without a permit. Should I report it?"}}
```

`personal` lists the kinds found, never the details: `NAME`, `CONTACT`, `ID_NUMBER`, `WORKPLACE_ROLE`, `HEALTH`,
`MONEY`, `FAMILY`. The text goes in as named fields, so only changed fields come back. Nothing found:
`"personal":[],"changed":{}`, about ten tokens.

Code then checks the answer, at no token cost: the changed text is not empty, not longer than the original, in the
same language, and holds no e-mail address, phone number or long run of digits. An answer that fails is treated as
"found, but no usable version", never as "nothing found". A question refused for harm is handled as today.

| The person types | Changed text | The person is told |
|---|---|---|
| "My neighbour Ion Popescu, Str. Lalelelor 12, Cluj, is building a second floor without a permit. Should I report him?" | "A neighbour is building a second floor without a permit. Should I report it?" | a name, contact details |
| "I'm Maria Ionescu, a nurse at the county hospital in Arad, and I have diabetes. Should I move to night shifts?" | "Should a nurse with diabetes move to night shifts?" | a name, a workplace with a role |
| "Should Elon Musk step down as CEO of Tesla?" | no change (public role, company) | — |
| "The mayor's daughter Ana failed her exam. Should he resign?" | "The mayor's daughter failed an exam. Should he resign?" | a name |

In the second row the diabetes stays: with the name and the hospital gone, it is no longer tied to someone who can be
recognised, and the question still makes sense.

**What the person sees and can do.** A dialog built like the one the language check already shows
(`apps/ui/components/QuestionLanguageChoice.tsx`):

> **Personal details taken out**
> Your debate will be public and stays public, so an AI took out details that identify a private person:
> **a name, contact details**. This is the version the AIs will debate:
>
> *A neighbour is building a second floor without a permit. Should I report it?*
>
> [ Use this version ]  [ Edit ]  [ Cancel ]
>
> To keep these details, ask on a paid plan: a debate there is private until you publish it.

- **Use this version**: the debate starts with the changed text. No second AI call: the answer carries a signed mark
  that this exact text was checked, as step 2 of starting already does for a checked line.
- **Edit**: the changed text goes back into the box. What the person then sends is checked again, by one call.
- **Cancel**: nothing starts, nothing is charged, nothing is kept.
- No "keep my wording" on text that will be public.
- **No usable version** (rare): "Your question has details that identify a private person (a name). We could not
  write a version without them. Please take them out and ask again."

## Door 2 — when a text becomes public

**Where it rides.** Everything that becomes public already passes the publishing check
(`apps/api/src/publication-check/`): a paid debate at Publish and a Free debate when it finishes
(`apps/api/src/publications.ts`), and each contribution and report before it changes a public page
(`apps/api/src/public-tree.ts`). It reads the whole public copy, the person's words and the AIs', in five to seven
calls. Its instruction holds rules 1 and 2 today (hate; denying genocide). Door 2 adds **rule 3: details that
identify a private person**, with the same definition as Door 1, kept in one place in code.

**What it returns, and what the person sees.** The same answer as today, where `rules` may hold `3`. Found, or the
model unsure: not published. The existing refusal box says which parts:

> **We did not publish this debate**
> An automated check found details that identify a private person, in: the question, the arguments. A debate with
> personal details stays private.

Nothing is rewritten here: the AIs debated the original text, so the name can sit in fifty places.

**Whom rule 3 covers.** The owner's rule asks for it at Publish on a paid plan. The same calls also run for Free
debates and contributions, so rule 3 can cover them at no extra call, and catch what Door 1 missed or what an AI
brought in from a web page that names a private person. This is open decision 2.

## What is stored

| Thing | Stored? |
|---|---|
| The text as typed, with the personal details | No. The check answers and keeps nothing, as today, and no debate exists yet. It stays in the person's browser until they choose. |
| The changed text | Yes: it is the debate's question or own words, stored as any question is. |
| That a change was made | Yes: one yes/no mark on the debate, with the version of the check's wording. Not shown publicly. |
| The kinds found (a name, health details, …) | No. Shown on the screen, not kept: "this account typed health details" would itself be sensitive. |
| How often it fires | A daily count per kind, with no link to a person or a debate. |
| A refusal at Publish | The row the publishing check already writes (`publication_check_record`): rule 3 and which parts. No text. |

## What it costs

Prices are the code's own for Haiku 5.5 (`packages/providers/src/preview-models.ts`: $0.10 per million tokens in,
$0.50 out). A question check call is about 1,700 tokens in today.

| Case | Extra tokens |
|---|---|
| Free debate, nothing found (the usual case) | 200–400 in, 10–20 out |
| Details found, "Use this version" | the changed text out, usually under 150 |
| Details found, person edits | one more question check call, about 1,900 in |
| Paid private debate, while private | none |
| Any publication (Door 2) | about 150 in on each of five to seven calls |

One hidden cost when details are found: the planner that prepares the path lists reads the question at the same
moment as the check, to save a second, so its one call is thrown away and made again on the changed text.

## When the model cannot be reached

| Case | What happens |
|---|---|
| Door 1, no answer | The same call as the question check, so as today: the debate does not start, "Try again". |
| Door 1, answer unreadable or the changed text fails the code checks | Treated as found with no usable version. Never as "nothing found". |
| Door 2, no answer | As today: not published. A Free debate or a contribution stays private and is tried again; at Publish the person presses it again. |

## What must be proven first, and what it cannot do

- **Proof.** The publishing check was once measured to judge worse when one call carried two kinds of text; a second
  job in a call could do the same. So before switching on, about 80 lines (private names, public figures, companies,
  sole traders whose firm carries their name, the asker's own details; Romanian and English) are run both ways: in the
  shared call and in a call of its own. Three numbers decide: details missed, false alarms, harm verdicts that
  changed. If the shared call is worse, Door 1 gets a small call of its own (open decision 1).
- **It can miss things**, most of all a person identified without a name ("the only dentist in Vama Veche"). The
  Terms say so, and the route for asking us to remove details from a public page stays.
- **It judges "public role" from the text alone.** "Emil Boc" with no context may be taken out; "the mayor of Cluj,
  Emil Boc" is not. The person can edit and say who it is.
- **It does not look at debates that are already public** (open decision 5).

## Texts that change with it (English only; other languages at release)

**Terms of Service**

- Section 9: the new paragraph "Personal details are taken out first.", as drafted in Part 3. If decision 2 is yes,
  one more sentence: the check at publishing also looks for them, and what it catches stays private.
- Section 9, "What publishing does": "your question as you wrote it" becomes "your question", since on the Free plan
  it may be the changed version.
- Section 8: the sentence on the question check gains "and, where the text will be public, takes personal details
  out of it".
- Section 10: the check joins the list of automated checks; a refusal at Publish can be complained about as any
  refused publication.

**Privacy Policy**

- Section 4: the new row, as drafted in Part 3.
- Section 5: same provider and model as the question check, nothing that identifies the person.
- Section 7: what is kept (the yes/no mark) and what is not (the text as typed, the kinds).
- Section 8: a paragraph like the question check's: automated, no person reads it first, the person can use the
  changed text, edit or cancel; a refusal at Publish can be contested.
- Sections 3 and 11: one sentence each, that a check takes such details out and can miss things.

**Screen texts** (`apps/ui/messages/en/`)

- `newDebate.freePublicNotice`: "On the Free plan your question and its debate are public, and they stay public. An AI
  takes personal details out before the debate starts."
- New `newDebate.personalCheck.*`: the dialog above, the "no usable version" text, and the seven kind names.
- `v4.public.dig.terms`, `v4.suggest.ownViewPublic`: gain "personal details are taken out first".
- New `public.publication.contentCheck.refusedWhatPersonal`: the Door 2 refusal text.

## Build order, once approved

One pull request each: (1) the definition in one place, and the 80 lines with their measurement; (2) Door 1 in the
API, the gap in row 4 included; (3) Door 1 on the screens; (4) Door 2; (5) the English legal and screen texts.

## Open decisions

1. **If the measurement shows the shared call judges worse, may Door 1 use a small call of its own?**
   - *Yes, if the numbers say so (recommended)*: one small extra call per Free question; the harm check stays as it is.
   - *No, shared call only*: fewest tokens; we accept what the measurement shows.
2. **Should the check at publishing look for personal details in Free debates and contributions too?**
   - *Yes (recommended)*: no extra call; catches what Door 1 missed and what an AI brought in from the web. A Free
     debate it catches stays private to its author.
   - *No, only at Publish on a paid plan*: then nothing reads the AIs' text of a Free debate for personal details.
3. **A paid debate is refused at Publish for personal details. What can the person do?**
   - *Nothing more: it stays private, and they can complain by the usual route (recommended).*
   - *Also a button "Ask again without the details"*: opens a new debate with the question as Door 1 would change it;
     the person pays for it.
4. **What is kept when a text was changed?**
   - *A yes/no mark on the debate, and anonymous daily counts (recommended).*
   - *Also the kinds found*: easier to answer a complaint, but it records that an account typed, say, health details.
   - *Nothing at all*: we could not tell how often the check fires.
5. **Debates that are already public?**
   - *Check them once with rule 3, and hide for our review the ones it catches (recommended).*
   - *Leave them; act on requests only.*
6. **When the model is unsure whether a named person is private** (a local head teacher, a sole trader)?
   - *Treat as private and take the name out (recommended)*: the person sees it and can edit to say who it is.
   - *Leave the name in*: fewer false alarms, more private people on public pages.
