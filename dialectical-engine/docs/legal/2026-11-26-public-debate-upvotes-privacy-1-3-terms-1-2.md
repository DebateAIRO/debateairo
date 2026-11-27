# Upvotes on public debates, in the Privacy Policy (version 1.3) and the Terms of Service (version 1.2)

Written on 27 November 2026.

These notes are not legal advice.

## The facts

- A signed-in person can upvote a debate on the home page's list of public debates. What is kept is which debate,
  which account and when: one row in `identity.public_debate_upvote`, made by database step 0193
  (`migrations/0193_public_debate_upvotes.sql`).
- There is one row per account per debate. Pressing the button again takes the upvote back, and the row is deleted
  at once.
- An account's rows go with the account row, when the account is deleted after the 7-day closure grace period.
- A debate hidden for review keeps its rows, and they count again if it comes back.
- The rows of a debate whose public page is gone for good are deleted by the API's hourly pass
  (`apps/api/src/public-vote-sweep.ts`, calling `identity.delete_gone_public_debate_upvotes`).
- The list of public debates shows each debate's count. No page shows who voted, to other people or to the team.
- The export's `account.json` lists the account's upvotes under `debates_you_upvoted` (`debate_reference`,
  `upvoted_at`), and its README says "It also holds the public debates you upvoted, and when."
- Nothing is kept in the browser, and nothing goes to another company.

## The decision

The owner's decision of 26 November 2026: both documents change in this slice, in all 35 languages, in the same pull
request as the feature ("Add the privacy policy change and TOS change as well"). The re-acceptance floors stay at 1.0
for both documents, so nobody is asked to accept again. On the same day the owner approved the seven English passages
below, in the reworded form of the fourth open question (answer (B)), with the legal basis as drafted.

## What changed

- **The English Privacy Policy, version 1.3.** Five passages:
  - section 2 ("What we collect"), a row between "Support" and "Reports you make":
    "| **Upvotes on public debates** | When you upvote a public debate: which debate, and when. Your upvote is tied to
    your account, so that it counts once and so that pressing the button again takes it back while the debate is on
    the list of public debates. The list of public debates shows only how many upvotes each debate has. No page shows
    who gave them, to other people or to our team | You, when you press the upvote button on the list of public
    debates |"
  - section 4 ("Why we use your data"), a row between "Making a debate public …" and "Checking the synthesis of each
    finished debate …": "| Recording your upvotes on public debates, so that each account counts once for a debate and
    can take its upvote back, and showing how many upvotes each public debate has | Upvotes on public debates |
    **Contract** — Art. 6(1)(b) |"
  - section 7 ("How long we keep things"), a row between "A debate our check deletes (section 6)" and "A report you
    make with the Report button": "| Upvotes on public debates | Until you take the upvote back, which the button does
    while the debate is on the list of public debates, or until the account is deleted after the closure grace period.
    A debate we hide while we review it keeps its upvotes, and they count again if it comes back | Deleted at once when
    you take it back, and the debate's count goes down by one. Deleted with the account. Also deleted, by an automatic
    clean-up that runs every hour, when the debate's public page is gone for good, as when our check deletes the debate
    (section 6) |"
  - section 10, the end of the Access row: "It also holds the public debates you upvoted, and when." (the same
    sentence as the export's README);
  - section 14, after the "last updated" sentence and before the 1.2 summary: "Version 1.3 replaced version 1.2:
    sections 2, 4 and 7 now say that we keep which public debates you upvote and when, that the list of public debates
    shows only how many upvotes each debate has, and how long we keep an upvote. Section 10 now says that your export
    holds them."
- **The English Terms of Service, version 1.2.** Two passages:
  - section 9 ("Publishing a debate"), a paragraph between "Reports by anyone." and "After the author leaves.":
    "**Upvotes.** When you are signed in, you can upvote a debate on the list of public debates, your own included, to
    show other readers that you found it worth reading. Each account has one upvote for each debate, and pressing the
    button again takes yours back while the debate is on the list. The list shows how many upvotes each debate has and
    never who gave them. Your upvotes are deleted when the closure of your account takes effect (section 6), and a
    debate's upvotes are deleted when its public page is gone for good (Privacy Policy, section 7). Do not use more
    than one account, or any automated means, to change a count: section 6 allows you one account, and section 7 does
    not allow automated access."
  - section 14, at the start of the last paragraph, before the 1.1 summary: "Version 1.2 replaced version 1.1: section
    9 now says what an upvote on a public debate is, that each account has one for each debate and can take it back,
    that the list shows how many upvotes a debate has and never who gave them, and that a count must not be changed
    with more than one account or by automated means."
- **New numbers, not edits.** Privacy Policy 1.2 and Terms 1.1 are in the release the site runs (their archive copies
  are in the commit `tests/n1-baseline.json` names), and the release check refuses a changed text under a number the
  archive already holds. So both documents take their next number, in all 35 languages together.
- **The translations.** The 34 translations carry the seven passages at the same places, French and Romanian first,
  then the other 32 languages. Each names the upvote with the word its home page's button uses
  (`home.upvote.*`, `apps/ui/messages/<code>/home.json`) and the data with the same words in sections 2, 4 and 7; the
  basis cell is copied from that language's own "Answering support requests" row. `apps/ui/legal/translated-from.json`
  records each as translated from the current English texts. **None of the translations has been reviewed by a native
  speaker or by counsel.**
- **One archive copy of each current text per language (70).** `legal:redate` archived the Privacy Policy 1.3 and the
  Terms 1.2 of all 35 languages from the final texts. The released copies (1.0 in English, French and Romanian, 1.1 in
  all 35, the Privacy Policy's 1.2 in all 35) are unchanged.
- **The effective day.** Both documents carry the working day, 27 November 2026, set in every language's eyebrow and
  version line (and the Privacy Policy's "last updated" sentence) by `node apps/ui/scripts/legal-redate.mjs --date
  2026-11-27`. Neither version is released yet, so the upload sets the upload day with `pnpm run legal:redate`, as the
  release guide says.
- **`/terms/versions`** now lists 1.2, in force, and 1.1 and 1.0, each linked to its archived English text
  (`TERMS_VERSIONS`, `apps/ui/lib/legal/pages.ts`).
- **The runbook** (`deploy/preview-auth-dev/v1/MAIN-SITE.md`) says this upload carries two new versions, both taking
  the upload day.
- **Tests.** New: `tests/unit/legal-public-debate-upvotes.test.ts` pins the English passages word for word and holds
  every language to the same rows and paragraph at the same places, in its own words. The version and count pins moved
  in `legal-reset-10`, `legal-privacy-page-memory-row`, `legal-privacy-analytics-clause`,
  `legal-privacy-billing-recipients`, `legal-english-first`, `legal-manifest`, `legal-documents-data`,
  `legal-sign-in-methods`, `data-export-privacy-policy`, `preview-release-guide` (unit) and
  `consent-policy-modal-render`, `terms-modal-render`, `legal-onboarding-locale`, `legal-pages` (render).

## Open: the legal basis of the new purpose

The section 4 row says contract, Art. 6(1)(b): recording an upvote and showing the count is the feature the person
asked for when they pressed the button. Legitimate interests (point (f)) would be the other candidate, for the count
shown to other readers. Not reviewed by counsel.

The owner's answer: the basis as drafted (contract, Art. 6(1)(b)), approved with the wording on 26 November 2026.

## Open: telling account holders before the feature is switched on

- **What the texts say.** Privacy Policy section 14: "For a change that adds a new purpose or a new recipient we tell
  you before the new processing starts, by email and in the product, and give you time to object." Terms section 14:
  "we post the new version with a summary of what changed and email you at least **30 days** before it takes effect".
- **This change.** Section 4 gains a purpose, and the Terms gain a rule on counts. No such notice exists in the code.
- **Before.** For Terms 1.1 the owner chose the upload day without the email because every account on the site was his
  own (`docs/legal/2026-11-24-partner-model-out.md:98-99`).

The owner's answer:

## Open: upvotes on debates about politics, religion or health

Section 3 ("Sensitive information") is not changed. Whether a kept upvote on a debate about politics, religion or
health is special-category data under Article 9 is a question for counsel.

## Open: taking an upvote back when its debate is no longer on the list

- **The facts.** The only vote control is on the home page's Public debates tab, which shows the newest 50 public
  debates and has no paging (`apps/ui/app/page.tsx:162`, `readPublicDebates(50, 0)`). The design allows no control on
  the debate's own page. A debate hidden for review is not on the list. No page shows a person which debates they
  upvoted; only the export does.
- **So** for a debate older than the newest 50, or one that is hidden, there is no button to press. The upvote still
  goes with the account, and when the debate is gone for good.
- **Two answers.** (A) keep the passages as first drafted ("pressing the button again takes it back", "Until you take
  the upvote back") and accept a follow-up slice that adds a way to see and take back one's upvotes; (B) reword three
  passages now, so that they say the button takes an upvote back while the debate is on the list.

The owner's answer: (B), given on 26 November 2026. Sections 2 and 7 of the Privacy Policy and section 9 of the Terms
say "while the debate is on the list of public debates" (the Terms: "while the debate is on the list").
