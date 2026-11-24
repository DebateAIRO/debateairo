# The Privacy Policy says what the publication check receives (version 1.2)

Written on 24 November 2026. It continues `2026-11-24-partner-model-out.md`.

These notes are not legal advice.

## The facts

- A code change on another branch makes the site's AI checks really run, all on Anthropic's Claude Haiku 5.5: the check
  of a finished Free debate before it goes public, and of a debate its owner publishes; the Report button's check; the
  checks of what is added to a public debate (a contribution, and the report the AIs write when someone digs into it)
  before it changes the public page; and the end-of-debate check of the synthesis. The publication check, the Report
  button's check and the checks on public pages use one judge (`apps/api/src/main.ts`).
- The publication check sends the whole public text of the debate, in parts: the question and its paths, the summary
  and the conclusion, the arguments, the web sources (the quotes, titles, sites and links, and the line about each), the
  reviewing AIs' reasons, the story, and the contributions and reports already on the page. Pseudonyms and dates are
  left out (`apps/api/src/publication-check/material.ts`). It checks the text against rules 1 and 2 of the content rule:
  no hate speech, and no denying, justifying or making light of genocides and crimes against humanity
  (`apps/api/src/publication-check/policy.ts`, `packages/providers/src/content-rule.ts`).
- When the publication check answers BLOCK or UNSURE, the debate stays private for good, with no person involved
  (`apps/api/src/publications.ts`, `packages/db/src/public-debates.ts`). Nothing tells the person yet: the site's "Kept
  private" mark reads a field the API does not send (`apps/ui/lib/v4/publicState.ts`).
- Privacy Policy 1.1 described only the synthesis check here. Its section 5 said "For this check we send only the
  synthesis text", in a paragraph that lists several checks, so it could be read as covering every check. For the
  Report button it named "an AI", not the model.
- The Provider Register (`/providers`) gave Anthropic's row the jobs synthesisCheck, questionCheck and reportCheck, and
  no job for checking a debate's public text before it goes public (`apps/ui/lib/legal/pages.ts`).
- Privacy Policy 1.1 and Terms 1.1 are in the release the site runs (the commit `tests/n1-baseline.json` names holds
  their archive copies), so a changed text needs a new version number.

## The decision

The owner's decision of 24 November 2026: clarify the texts in the same upload as the code that makes the checks run.

## What changed

- **Privacy Policy 1.2, in English, French and Romanian.** In section 5, "What is sent":
  - the synthesis sentence now reads "For this end-of-debate check we send only the synthesis text, with nothing that
    identifies you or your account.", so it stays true for that check and no longer reads as covering every check;
  - after the question check's sentence, new sentences: "Before a debate on the Free plan goes public, and when you
    publish a debate, we send its public text to Claude Haiku 5.5, which checks it against our rule on content: none of
    it may be hate speech, or deny, justify or make light of a genocide or a crime against humanity. The public text is what the public page would show: the
    question, the summary and the conclusion, the arguments, the web sources they cite with their quotes, titles and
    links, the comments of the AIs that reviewed the arguments, the story of the verdict, and anything already added to
    the public debate. We send it in parts, without your pseudonym or any date, and with nothing that identifies you or
    your account. The same model checks what is added to a public debate when someone digs into it, before it changes
    the public page.";
  - the Report sentence names the model: "... we send the words of your report and the public text of the debate to
    Claude Haiku 5.5, which checks the report; ...".
- In section 5, "Which providers", the Register's list of purposes gains "checking a debate's public text before it
  goes public" and "checking a report made with the Report button" (the Register already gave Anthropic the job of
  checking a report; the list left it out). In Annex B.6 (South Korea), the list of what is sent abroad gains "before it goes public, its public
  text to be checked".
- Section 14 says what changed, before the 1.1 line: "Version 1.2 replaced version 1.1: section 5 now says that, before
  a debate goes public, its public text is sent to Claude Haiku 5.5 to be checked, and that the same model checks what
  is added to a public debate and the reports made with the Report button; it makes clear that only the synthesis text
  is sent for the end-of-debate check; its list of what the Register states for each provider names the new check and
  the check of a report; the Register lists the new check for Anthropic, and Annex B.6 was changed to match."
- **The Provider Register.** A new job, `publicationCheck`: "A debate's public text before it goes public, and what is
  added to a public debate — to check it against our rule on content". It stands on Anthropic's row and, when that row
  is not shown, on the support chat's row (the same model and contract), as the other checks do. French and Romanian
  carry their own wording; the 32 other catalogues carry the English line, as earlier lines did, because every
  catalogue must hold the same keys (`apps/ui/lib/i18n/legal.test.mjs`).
- **The 32 other languages** change only the Privacy Policy's version number and day: their text still follows an older
  English text, as before.
- **The re-dating command.** `pnpm run legal:redate` set one day for both documents and refused when a current version
  was in the release the site runs. With Terms 1.1 released and Privacy 1.2 not, it could not date 1.2 at all. It now
  leaves a document whose current version is released at its day, says so, and dates the other; it still refuses a day
  that no document can take (`apps/ui/scripts/legal-redate.mjs`).
- **Not changed.** No new company. Nothing about DeepInfra. The re-acceptance floors stay at 1.0. The Terms are not
  changed. What they say about what is sent stays true with the checks running: section 8 says what a provider receives
  to run a debate, that the synthesis goes to a model that checks it and that the question goes to a model before a
  debate starts; it does not say that nothing else is sent. Section 9 already says that an AI checks a finished Free
  debate before anyone can read it and that contributions are checked by an AI; section 10 already says that an AI
  reads a report beside the public text. The Terms name no model for these checks, so naming one is left to the Privacy
  Policy and the Register. What the Terms say about decisions, and the statement of reasons they promise, is a
  different matter, and two open questions about it are below ("What was left, and why").

## The day

The drafts carry Privacy Policy 1.2 with the working day 25 November 2026, the day after 1.1's, as 1.1 carried a
working day before its upload. Version 1.2 cannot take effect on 24 November 2026: 1.1 took effect that day, and
`legal:redate` refuses a day that is not after the day of the version it replaces. The upload that carries the code and
this text can therefore be no earlier than 25 November 2026. Terms 1.1 keeps 24 November 2026. Before the upload's SB1, on the Mac, with the upload
day (the release guide, "The legal texts' day"): `pnpm run legal:redate --date YYYY-MM-DD --dry-run`, then the same
without `--dry-run`, commit what it writes through a pull request into dev, then SB1. It dates the Privacy Policy only
and prints that the Terms of Service 1.1 keeps 24 November 2026.

**This blocks the upload until the release guide changes.** The drained upload's PRECHECK reads both English texts for
"Effective <upload day>" and reports `legal-date` when one does not carry it; the guide says `legal-date` means stop.
Terms 1.1 keeps 24 November 2026, and Privacy 1.2 cannot take that day, so on every possible upload day PRECHECK stops
on the Terms. The check is in the release guide (`deploy/preview-release/v1/README.md`, the PRECHECK step), which this
change does not touch, because the guide is outside its scope. A separate change to the guide, in the same upload and
merged before SB1, must make PRECHECK read the day only of a document whose current version is not yet in the release
the site runs, which is the rule `legal:redate` now follows.

## What was left, and why

- **Section 4's table.** The row "Making a debate public" already names debate content as its data and the contract as
  its basis; the new check has no row or basis of its own. Whether it needs one is not reviewed by counsel.
- **Automatic decisions and statements of reasons.** These passages are about decisions, not about what is sent. The
  owner's decision covers what is sent, so this change leaves them. Two questions are open for the owner and counsel
  before the upload:
  - **(a) Terms section 10, "Statement of reasons".** It promises a statement of reasons, by email, "whenever we remove
    or restrict the visibility of your content". With the checks running, a Free debate the publication check refuses
    (BLOCK or UNSURE) stays private for good, a contribution the check refuses does not reach the public page, and a
    debate the Report button's check agrees with is hidden at once with no person (Terms section 10 says so). Nothing
    tells the person about a refused publication today (see "The facts"). Whether a refusal to publish counts as
    restricting visibility under that paragraph, when no statement of reasons is sent, is not decided.
  - **(b) The count of automatic decisions.** Annex B.6 (South Korea) says "Two automatic checks decide with no person
    involved": one refuses to start a debate, the other deletes one. Section 8 and Annex B.4 (Australia) likewise name
    only the end-of-debate check and the question check. Once the publication check's refusal and the Report button's
    automatic hide run, that count of two is no longer the whole list. Whether these passages must name the two other
    decisions is not decided.
- **The 32 other languages** follow an older English text by design; they are brought up to date before a release that
  offers them.

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
- **Not reviewed by counsel.** Whether this change owes the notice in section 14 has not been reviewed by counsel.
