# Glossary — mission `translation`

Every term below is product vocabulary: it means one thing in this application and must mean that same one thing in every sentence of every language. The English column is frozen; the language columns are **empty on purpose**.

## The rule that binds a language seat

**A language seat fills its own column in this file, in full, and commits it BEFORE it translates a single catalog key.** A term with an empty cell is an unanswered question, and answering it halfway through a catalog produces two translations of the same word in one product. The seat's slice is not reviewable until its column has no empty cell; the reviewer checks the column first and the catalog second.

Three further rules:

1. **Where a term has no good equivalent, keep the English word and say so in the cell** — write `debate (kept)` rather than inventing a coinage. A kept word is a decision on the record, not a gap.
2. **Never translate an untranslatable token.** The brand marks (`Dialectical Engine`, `DebateAI`, `dezbatere.ro`), the maker names (`OpenAI`, `Anthropic`, `Google`), the model identifiers (`gpt-5.6-sol`, `claude-opus-5`, `gemini-3-ultra`) and the keyboard shortcuts stay in their original form in every language, including in right-to-left text.
3. **A term's translation is the same in every namespace.** `claim` in the tree view and `claim` in the honesty drawer are one word, not two.

`Terracotta` and `Chamber` are listed as terms because whether a mode name is a product name (kept) or a describable word (translated) is a real decision — it is row **T-2** of the contested-decisions table in `translation.md`, and until V rules it, a seat keeps them in English and writes `Terracotta (kept)`.

## The table

| Term (English) | What it means, in one line | Where it appears | zh-CN | hi | es | ar | fr | bn | pt-BR | ru | ur | id | de | ja | ko | tr | vi | ro |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **debate** | One question put to the bench, and the whole tree of argument that answers it. | Everywhere: library cards, the workspace title, the public page. |  | | | | | | | | | | | | | | |  |
| **claim** | A single assertion put on the record that can be argued against. | Node headers, the tree, the canvas, scoring rows. |  | | | | | | | | | | | | | | |  |
| **argument** | A claim offered in support of or against its parent claim. | Tree and split views, the focus view counters. |  | | | | | | | | | | | | | | |  |
| **round** | One complete pass of four turns through a debate. | Landing copy, the new-debate form. |  | | | | | | | | | | | | | | |  |
| **turn** | One model's single contribution inside a round. | Card headers on the landing sample and in the thread view. |  | | | | | | | | | | | | | | |  |
| **node** | One addressable item of the tree: a claim with its score, its review and its children. | Detail drawer, canvas controls, live-event counters. |  | | | | | | | | | | | | | | |  |
| **tree view** | The view that draws the debate as a branching structure. | Debate toolbar. |  | | | | | | | | | | | | | | |  |
| **thread view** | The view that draws the debate as a linear sequence of turns. | Debate toolbar. |  | | | | | | | | | | | | | | |  |
| **split view** | The view that puts supporting and opposing arguments in two columns. | Debate toolbar. |  | | | | | | | | | | | | | | |  |
| **map view** | The view that draws the debate as a small overview graph. | Debate toolbar. |  | | | | | | | | | | | | | | |  |
| **outline view** | The condensed list of the debate's claims and their state. | Debate workspace. |  | | | | | | | | | | | | | | |  |
| **canvas** | The pannable, zoomable surface the tree is drawn on. | Debate workspace. |  | | | | | | | | | | | | | | |  |
| **scrutiny** | The pressure applied to a claim — how hard and how deep the bench presses on it. | New-debate controls, node badges, the drawer. |  | | | | | | | | | | | | | | |  |
| **depth** | How many levels of argument the tree is expanded to. | New-debate controls, node metadata. |  | | | | | | | | | | | | | | |  |
| **branching width** | How many sibling arguments each claim may spawn. | New-debate controls. |  | | | | | | | | | | | | | | |  |
| **verdict** | The recorded outcome of the debate, with the receipts that produced it. | Verdict banner, synthesis panel. |  | | | | | | | | | | | | | | |  |
| **confidence band** | The coarse band a score falls into, shown instead of a bare number. | Library cards, the public page. |  | | | | | | | | | | | | | | |  |
| **base score** | A claim's score before cross-review. | Cards, node detail. |  | | | | | | | | | | | | | | |  |
| **final score** | A claim's score after cross-review. | Cards, node detail. |  | | | | | | | | | | | | | | |  |
| **honesty** | The record of what a run could and could not establish about itself. | Honesty drawer, public honesty drawer. |  | | | | | | | | | | | | | | |  |
| **condition mark** | A named limitation attached to an answer, drawn from a closed vocabulary. | Honesty drawer, answer disclosure. |  | | | | | | | | | | | | | | |  |
| **abstention** | A recorded refusal to answer, together with the kind of refusal it was. | Honesty drawer. |  | | | | | | | | | | | | | | |  |
| **investigation** | A focused follow-up on one weak point, recommended by the bench or asked for by the reader. | Investigation drawer, recommendations panel. |  | | | | | | | | | | | | | | |  |
| **maker** | The organisation that built a model — for example OpenAI, Anthropic, Google. | Card bylines, model identity rows. The maker NAME itself is never translated. |  | | | | | | | | | | | | | | |  |
| **asker** | The person who put the question to the bench. | Role chip in the top bar, tier-source labels. |  | | | | | | | | | | | | | | |  |
| **model** | One language model taking part in the debate. | Bylines, the model presentation row, live events. Model IDENTIFIERS are never translated. |  | | | | | | | | | | | | | | |  |
| **run** | One execution of a debate against the bench. | Live events, replay controls, the ledger. |  | | | | | | | | | | | | | | |  |
| **dry run** | A run that produces the plan without spending on the models. | Developer surfaces, run controls. |  | | | | | | | | | | | | | | |  |
| **replay** | Re-running a recorded generation from its stored handle. | Debate toolbar, node detail. |  | | | | | | | | | | | | | | |  |
| **evidence** | The sources a claim rests on, with the date they were read. | Answer disclosure, honesty drawer. |  | | | | | | | | | | | | | | |  |
| **hole** | A gap in the scoring record where a number should be and is not. | Outline view, canvas badges. |  | | | | | | | | | | | | | | |  |
| **fatal flag** | A defect serious enough to invalidate the claim that carries it. | Outline view, canvas badges. |  | | | | | | | | | | | | | | |  |
| **library** | The asker's own list of debates. | Home route, the back link in the debate toolbar. |  | | | | | | | | | | | | | | |  |
| **workspace** | The debate view's drawer of artifacts belonging to one run. | Debate toolbar, workspace drawer. |  | | | | | | | | | | | | | | |  |
| **publication** | Making a debate readable by anyone without an account. | Publication control, public route. |  | | | | | | | | | | | | | | |  |
| **published** | The state of a debate that has been made public. | Publication control, library cards. |  | | | | | | | | | | | | | | |  |
| **private** | The state of a debate that only its asker can read. | Publication control, library cards. |  | | | | | | | | | | | | | | |  |
| **transcript** | The readable record of a finished debate. | Landing copy, public page. |  | | | | | | | | | | | | | | |  |
| **synthesis** | The strongest case on each side, plus the verdict. | Synthesis panel. |  | | | | | | | | | | | | | | |  |
| **challenge** | Flagging a sentence so the bench spawns a focused rebuttal at that point. | Challenge popover, landing method. |  | | | | | | | | | | | | | | |  |
| **review** | A rival model's recorded agreement with or dispute of a claim. | Card footers, node detail. |  | | | | | | | | | | | | | | |  |
| **agreed** | A review outcome: the rival model accepts the claim. | Card footers. |  | | | | | | | | | | | | | | |  |
| **disputed** | A review outcome: the rival model rejects the claim. | Card footers. |  | | | | | | | | | | | | | | |  |
| **pro** | The stance supporting the parent claim. | Stance chips, split view, legend. |  | | | | | | | | | | | | | | |  |
| **con** | The stance opposing the parent claim. | Stance chips, split view, legend. |  | | | | | | | | | | | | | | |  |
| **reasoning** | The stance that binds pro and con rather than taking a side. | Stance chips, split view, legend. |  | | | | | | | | | | | | | | |  |
| **ledger** | The append-only execution record a run writes as it goes. | Export withholding messages, honesty drawer. |  | | | | | | | | | | | | | | |  |
| **provenance** | Where a number or a sentence came from, traceable to its source. | Honesty drawer, node detail. |  | | | | | | | | | | | | | | |  |
| **leverage** | How much a single claim moves the final verdict. | Condition marks, node detail. |  | | | | | | | | | | | | | | |  |
| **stale** | A record that is no longer current and is marked as such. | Condition marks, staleness badges. |  | | | | | | | | | | | | | | |  |
| **settled** | A node whose score will not change again. | Live-event counters. |  | | | | | | | | | | | | | | |  |
| **streaming** | A node whose text is still arriving. | Canvas and thread badges. |  | | | | | | | | | | | | | | |  |
| **risk tier** | How much care and spend a run applies, chosen per debate. | New-debate controls, tier-source labels. |  | | | | | | | | | | | | | | |  |
| **composition budget** | The ceiling on what one run may spend. | New-debate controls. |  | | | | | | | | | | | | | | |  |
| **recovery code** | A single-use code that recovers an account when the authenticator is gone. | Login flow, MFA enrolment. |  | | | | | | | | | | | | | | |  |
| **authenticator** | The application that produces the six-digit sign-in code. | Login flow, MFA enrolment. |  | | | | | | | | | | | | | | |  |
| **session** | One signed-in browser, listed and revocable. | Settings, session controls. |  | | | | | | | | | | | | | | |  |
| **erasure** | The scheduled destruction of an account and its data. | Settings, erasure controls. |  | | | | | | | | | | | | | | |  |
| **verification** | Proving that an email address belongs to the person signing up. | Sign-up flow, verify-email route. |  | | | | | | | | | | | | | | |  |
| **Terracotta** | The light display mode. A product name for a mode, not a colour word. | Mode toggle, everywhere. |  | | | | | | | | | | | | | | |  |
| **Chamber** | The dark display mode. A product name for a mode, not a room. | Mode toggle, everywhere. |  | | | | | | | | | | | | | | |  |

61 terms · 16 language columns · 976 cells to fill across the mission.

## How a reviewer checks a filled column mechanically

1. The column has no empty cell — `LANG-<code>-R01`.
2. Every value in that language's catalogs that renders one of these terms uses the cell's wording; a reviewer greps the catalog for the term's English form and expects zero hits outside the kept-word list.
3. No two rows in one column carry the same translation unless the reviewer records why (two English terms collapsing into one word in that language is a real outcome and must be a written decision, not an accident).

