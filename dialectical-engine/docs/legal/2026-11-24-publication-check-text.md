# The Privacy Policy says what the publication check receives (version 1.2)

Written on 24 November 2026. It continues `2026-11-24-partner-model-out.md`.

Version 1.2 holds two changes: this one, and help getting back into an account, which
`2026-11-24-recovery-help-privacy-1-2.md` describes. They were made on two branches and joined before either reached the
site, so there is one version 1.2. Version 1.1 and the Terms (1.1, 24 November 2026) do not change.

These notes are not legal advice.

## The facts

- A code change on another branch makes the site's AI checks really run, all on Anthropic's Claude Haiku 5.5: the check
  of a finished Free debate before it goes public, and of a debate its owner publishes; the Report button's check; the
  checks of what a dig adds to a public debate (its rewrite of a path, then what it writes later on the paths above and
  on the main answer) and of a report written on a public debate (Terms section 9, "Reports by anyone"), before the
  public page shows them (`apps/api/src/public-tree.ts`, `sweepPublicPage`); and the end-of-debate check of the
  synthesis. The publication check, the Report button's check and the checks on public pages use one judge
  (`apps/api/src/main.ts`).
- The publication check sends the whole public text of the debate, in parts: the question and its paths, the summary
  and the conclusion, the arguments, the web sources (the quotes, titles, sites and links, and the line about each), the
  reviewing AIs' reasons, the story, and the contributions and reports already on the page. Pseudonyms and dates are
  left out (`apps/api/src/publication-check/material.ts`). It checks the text against rules 1 and 2 of the content rule:
  no hate speech, and no denying, justifying or making light of genocides and crimes against humanity
  (`apps/api/src/publication-check/policy.ts`, `packages/providers/src/content-rule.ts`).
- When the publication check answers BLOCK or UNSURE on a finished Free debate, the debate stays private for good, with
  no person involved (`apps/api/src/publications.ts`, `packages/db/src/public-debates.ts`). When it answers so on a
  debate its owner publishes, the debate is not published and stays private, and the owner can press Publish again,
  which runs the check again (`apps/api/src/publications.ts`, `publish`). On a refused Free debate's page, its owner
  reads "Kept private: it did not pass the check, so it has no public page." (`v4.publicMark.KEPT_PRIVATE`): the API
  sends that stage to the owner alone (`apps/api/src/publications.ts`, migration 0189, `apps/ui/lib/v4/publicState.ts`).
  When the owner presses Publish, the refusal is shown on screen with the parts the check found, that an automated tool
  decided, and that a person reviews it on a request to office@dezbatere.ro
  (`apps/ui/components/PublicationControl.tsx`, `public.publication.contentCheck.*`). A refused contribution is shown
  to its writer as "This stayed private: it did not pass the check" (`v4.contribution.KEPT_PRIVATE`): the API gives
  the contribution that state (`apps/api/src/index.ts`, `contributionStateOf`), and the page shows it
  (`apps/ui/components/v4/V4ContributionNote.tsx`, `apps/ui/components/v4/V4PublicDig.tsx`).
- Two refusals are not told to the person they concern. A later text of a dig that the check refuses stays off the page while the
  contribution stays on it, so its digger reads "This changed the public page."; only the dig's terms, shown before the
  dig, say that a later part may not pass (`apps/api/src/public-tree.ts`, `sweepPublicPage` step 2;
  `v4.public.dig.termsMore`). A report written on a debate that the check refuses never reaches the page, and its
  writer is not told: the public page's contract carries no state for a report being written
  (`packages/contract/src/index.ts`, `PublicDebateSchema`; `apps/ui/lib/v4/publicReport.ts`), so the page keeps
  showing it as being written and, after 10 minutes, as taking longer than usual
  (`apps/ui/components/v4/V4PublicLane.tsx`, `ReportWriting`).
- When the Report button's check agrees with a report and the debate was never hidden before, the debate is hidden at
  once with no person (`apps/api/src/public-flag.ts`). A person then reviews it. The debate's owner, and each person
  whose contribution, or report written on the debate, leaves the page with it, gets a statement of reasons that says
  the hide was automated (`migrations/0157_moderation_statements.sql`).
- Privacy Policy 1.1 described only the synthesis check here. Its section 5 said "For this check we send only the
  synthesis text", in a paragraph that lists several checks, so it could be read as covering every check. For the
  Report button it named "an AI", not the model.
- The Provider Register (`/providers`) gave Anthropic's row the jobs synthesisCheck, questionCheck and reportCheck, and
  no job for checking a debate's public text before it goes public (`apps/ui/lib/legal/pages.ts`).
- Privacy Policy 1.1 and Terms 1.1 are in the release the site runs (the commit `tests/n1-baseline.json` names holds
  their archive copies), so a changed text needs a new version number.

## The decision

The owner's decision of 24 November 2026: clarify the texts in the same upload as the code that makes the checks run.

The owner's second decision of 24 November 2026, on question (b) below: Privacy Policy 1.2 names all four decisions the
automatic checks make with no person involved.

## What changed

- **Privacy Policy 1.2, in all 35 languages.** It is written in English first. French and Romanian follow it sentence
  for sentence, with both changes, and are recorded as translated from it in `apps/ui/legal/translated-from.json`. The
  32 other languages were first translated from this change's first English 1.2 text: before the rows on help getting
  back into an account were joined to it, and before three wording fixes (section 5's sentence on what a dig adds, and
  section 8's sentences on what the page tells you and on who gets a statement of reasons). They were then brought up
  to the English 1.2, with both changes and the fixes, and are recorded as translated from it too. None of the
  translations has been reviewed by a native speaker or by counsel. In section 5, "What is sent":
  - the synthesis sentence now reads "For this end-of-debate check we send only the synthesis text, with nothing that
    identifies you or your account.", so it stays true for that check and no longer reads as covering every check;
  - after the question check's sentence, new sentences: "Before a debate on the Free plan goes public, and when you
    publish a debate, we send its public text to Claude Haiku 5.5, which checks it against our rule on content: none of
    it may be hate speech, or deny, justify or make light of a genocide or a crime against humanity. The public text is
    what the public page would show: the question, the summary and the conclusion, the arguments, the web sources they
    cite with their quotes, titles and links, the comments of the AIs that reviewed the arguments, the story of the
    verdict, and anything already added to the public debate. We send it in parts, without your pseudonym or any date,
    and with nothing that identifies you or your account. The same model checks what is added to a public debate when
    someone digs into it, and each report written on a public debate, before they reach the public page.";
  - the Report sentence names the model: "... we send the words of your report and the public text of the debate to
    Claude Haiku 5.5, which checks the report; ...".
- In section 5, "Which providers", the Register's list of purposes gains "checking a debate's public text before it
  goes public" and "checking a report made with the Report button" (the Register already gave Anthropic the job of
  checking a report; the list left it out). In Annex B.6 (South Korea), the list of what is sent abroad gains "before
  it goes public, its public text to be checked".
- **The four automatic decisions.** Section 8 now says that four automatic checks decide with no person involved: the
  end-of-debate check can delete a debate, the question check can refuse to start a debate, the publication check can
  keep a debate or a contribution private, and the Report button's check can hide a public debate. Two new paragraphs
  describe the last two. The publication check: a Free debate it does not allow stays private, a debate the owner
  publishes is not published, a contribution stays private to its writer and the page does not change; "In the last
  two cases, the page tells you that the check did not allow it." (a first draft said the page tells you whenever you
  publish or add to a public debate, which a refused report written on a debate and a refused later text of a dig make
  untrue; see "The facts"); no person reviews it first, and a complaint as the Terms describe is reviewed by a person.
  The Report button's check: it hides the debate at once when it agrees with a report and the debate was never hidden
  before; a person then reviews it; the owner and each person whose contribution, or report written on the debate,
  leaves the page get a statement of reasons that says the hide was automated, and can complain. The second
  paragraph's promise of review by a person now says it covers these two and not the deletion or the question check.
  It says "If we automate a decision" instead of "If we ever automate a decision", since refusing to publish is now
  automated. Annex B.4 (Australia) now lists five kinds of decisions (the publication check and the Report button's
  check added, each with the personal information it uses). Annex B.6 (South Korea) names the four decisions instead
  of two, and no longer says that each tells you on screen what happened: when 1.2 was written a refused Free debate
  was not told, and a refused report written on a debate and a refused later text of a dig are still not told (see
  "The facts"); it says that section 8 says what you can do after each, and that you can complain about each.
- Section 14 has one summary of 1.2, before the 1.1 line, naming both changes. Its first sentence is the one on help
  getting back into an account (`2026-11-24-recovery-help-privacy-1-2.md`); then: "Section 5 now says that, before a
  debate goes public, its public text is sent to Claude Haiku 5.5 to be checked, and that the same model checks what is
  added to a public debate, the reports written on a public debate and the reports made with the Report button. It
  also makes clear that only the synthesis text is sent for the end-of-debate check, and its list of what the Register
  states for each provider names the new check and the check of a report. The Register lists the new check for
  Anthropic. Section 8 now names the four decisions our automatic checks make with no person involved, and what you
  can do after each. Annex B.4 and Annex B.6 were changed to match."
- **The Provider Register.** A new job, `publicationCheck`: "A debate's public text before it goes public, and what is
  added to a public debate — to check it against our rule on content". It stands on Anthropic's row and, when that row
  is not shown, on the support chat's row (the same model and contract), as the other checks do. Every one of the 35
  catalogues carries its own wording of it (`apps/ui/messages/<language>/legal.json`), as for the other check jobs
  (`synthesisCheck`, `questionCheck`, `reportCheck`); every catalogue must hold the same keys
  (`apps/ui/lib/i18n/legal.test.mjs`).
- **The re-dating command.** `pnpm run legal:redate` set one day for both documents and refused when a current version
  was in the release the site runs. With Terms 1.1 released and Privacy 1.2 not, it could not date 1.2 at all. This
  change and the one on help getting back into an account each made it date one document at a time; when the two were
  joined, the latter's version was kept (`apps/ui/scripts/legal-redate.mjs`). It leaves a document whose current
  version is released at its day and prints `<document>: released, keeps <day>`, dates the other, refuses a day that no
  document can take, and refuses any change while a translation the release offers follows an older English text.
- **One archive copy of 1.2 per language.** This change had archived its first English 1.2 text and its 34
  translations. None of them was released. The 35 copies were removed when the two changes were joined: 1.2's text
  changed, and the archive step refuses a second text under a version number it already holds. Once every translation
  followed the English 1.2, `pnpm run generate:legal:archive` archived the final 1.2 text of each of the 35 languages;
  the 1.0 and 1.1 copies did not change.
- **Not changed.** No new company. Nothing about DeepInfra. The re-acceptance floors stay at 1.0. The Terms are not
  changed. What they say about what is sent stays true with the checks running: section 8 says what a provider receives
  to run a debate, that the synthesis goes to a model that checks it and that the question goes to a model before a
  debate starts; it does not say that nothing else is sent. Section 9 already says that an AI checks a finished Free
  debate before anyone can read it and that contributions are checked by an AI; section 10 already says that an AI
  reads a report beside the public text. The Terms name no model for these checks, so naming one is left to the Privacy
  Policy and the Register. What the Terms say about decisions agrees with section 8's four decisions: section 9 says a
  refused Free debate and a refused contribution stay private, and section 10 says the Report button's check hides a
  debate with no person and a person then reviews it. The statement of reasons the Terms promise is still an open
  question, below ("What was left, and why").

## The day

Privacy Policy 1.2 takes effect on 25 November 2026, the upload day, in every language. Version 1.2 cannot take effect
on 24 November 2026: 1.1 took effect that day, and `legal:redate` refuses a day that is not after the day of the
version it replaces. So the upload that carries the code and this text can be no earlier than 25 November 2026. Terms
1.1 keeps 24 November 2026. The drafts first carried the working day 26 November 2026, as 1.1 carried a working day
before its upload. `pnpm run legal:redate --date 2026-11-25`, run with `--dry-run` first (the release guide, "The
legal texts' day"), set the upload day: it printed "Privacy Policy: from 26 November 2026 to 25 November 2026" and
"Terms of Service: released, keeps 24 November 2026", re-dated the Privacy Policy in all 35 languages, recorded the 34
translations again, made the 35 archive copies of 1.2 again from the re-dated texts and passed the release check. Run
again for 25 November 2026, it changes nothing. If the upload moves to a later day, run it again with that day, commit
what it writes through a pull request into dev, and only then SB1.

**The release guide's check follows the same rule.** Before this change, the drained upload's PRECHECK read both
English texts for "Effective <upload day>", so with Terms 1.1 keeping 24 November 2026 it would have stopped every
upload on the Terms. This same change makes PRECHECK follow the rule `legal:redate` follows
(`deploy/preview-release/v1/README.md`, the PRECHECK step). A text whose current version has an archive copy in the
commit of the release the site runs (`OREV`, read on the server from the release lock and the reference clone) must
keep the day it has there; any other text must carry the upload day. So on the upload day PRECHECK reads Terms 1.1 as
kept at 24 November 2026 and Privacy 1.2 as new, and stops only if 1.2 does not carry that day. The guide's section
"The legal texts' day" now says what the command dates, leaves and refuses, and what else checks the day. The main-site
runbook (`deploy/preview-auth-dev/v1/MAIN-SITE.md`) follows the same rule in both places it checks the day, 1.8 step 3
and 2.1 step 1, and 2.1 step 1 quotes the two `legal day:` lines PRECHECK prints for this upload.

## What was left, and why

- **Section 4's table.** The row "Making a debate public" already names debate content as its data and the contract as
  its basis; the new check has no row or basis of its own. Whether it needs one is not reviewed by counsel.
- **Automatic decisions and statements of reasons.** Two questions were open for the owner and counsel; one is decided.
  - **(a) Terms section 10, "Statement of reasons". Still open, for the owner and counsel, before the upload.** It
    promises a statement of reasons, by email, "whenever we remove or restrict the visibility of your content". With
    the checks running, a Free debate the publication check refuses (BLOCK or UNSURE) stays private for good, and a
    contribution the check refuses does not reach the public page. A refused Free debate, a refused publish and a
    refused contribution are told on screen but not by email, and a refused report written on a debate or a refused
    later text of a dig is not told at all (see "The facts"). Whether a refusal to publish counts
    as restricting visibility under that paragraph, when no statement of reasons is sent, is not decided. Privacy Policy 1.2 promises no statement of reasons for it: section 8 says a person reviews a
    complaint. The Report button's automatic hide does send one.
  - **(b) The count of automatic decisions. Decided.** Version 1.1 said in Annex B.6 (South Korea) "Two automatic checks
    decide with no person involved", and section 8 and Annex B.4 (Australia) named only the end-of-debate check and
    the question check. The owner decided on 24 November 2026 that version 1.2 names all four; "What changed" says
    how.

## Section 14 and this change

- **What the section says.** "For a change that adds a new purpose or a new recipient we tell you before the new
  processing starts, by email and in the product, and give you time to object." For clarifications that change nothing
  about what is done, the new version is simply posted.
- **Recipient.** No new recipient: Anthropic already receives debate text (the debate jobs, the synthesis check, the
  question check, the support chat), and its row already carried the check of a report. The Report sentence named "an
  AI"; it now names the model.
- **Purpose.** Checking a debate's public text before it goes public was described in the Terms (section 9) and in the
  Privacy Policy only as "after an AI check"; the Register had no job for it. Whether naming it is a clarification or a
  new purpose under section 14 is not reviewed by counsel.
- **The accounts on the day of this change.** The previous note records that on 24 November 2026 the only accounts on
  the site are the operator's own. Any email notice would reach only the operator.
- **The other change in 1.2.** Help getting back into an account adds a purpose to section 4; whether and how account
  holders are told before it starts is an open question in its own note (`2026-11-24-recovery-help-privacy-1-2.md`,
  "Open: telling account holders before the new processing starts").
- **Not reviewed by counsel.** Whether this change owes the notice in section 14 has not been reviewed by counsel.
