# Help getting back into an account, in the Privacy Policy (version 1.2)

Written on 24 November 2026.

These notes are not legal advice.

## The facts

- A person who has lost their passkey or authenticator app and has no recovery code left can ask for help on
  `/recover/help`. They confirm the request with a link emailed to the account's address and with the account's
  password (migration 0188, `apps/api/src/recovery-permit.ts`).
- A member of the team then approves or refuses the request on an internal page. To decide, they see only: a shortened
  form of the account's sign-in email address, when the account was created, when it was last signed in to, its
  sign-in methods (how many passkeys, whether it has an authenticator app), how many recovery codes are left, whether it
  is under a security hold or has a risk mark, whether it has ever paid (yes or no, no amounts) and how many such
  requests it made before (`apps/api/src/staff/recovery-permits.ts`). They do not see the password, the debates,
  payment details or anything the person typed.
- If the request is approved, the account waits 72 hours, every verified address on it is emailed with a way to stop
  the request, and then the person can set up one new sign-in method.
- Each request is kept with the account until the account is deleted. A request that never got past the emailed link
  (never confirmed with the password) is deleted 90 days after it ended.

## The decision

The owner's decision of 24 November 2026: the Privacy Policy says this, in English, in the same pull request as the
feature. The Terms do not change: section 6 already says that recovery follows the process published in the product,
with waiting periods, and that a request can be refused when it cannot reasonably be established that it comes from
the account holder.

## What changed

- **The English Privacy Policy, version 1.2.** Three rows, each in the shape of its table:
  - section 2 ("What we collect"), after "Security audit trail": "Requests for help getting back into your account",
    with what a request holds, what a member of the team sees to decide, what they do not see, and the 72-hour wait;
  - section 4 ("Why we use your data"), after the bot-check row: helping you get back into your account and making
    sure the request comes from you, on the basis of the contract (at your request) and of legitimate interests
    (keeping other people out of your account);
  - section 7 ("How long we keep things"), after "Login and recovery risk signals": kept while the account exists; a
    request never confirmed with the password, 90 days after it ended.
  Section 14 says what changed: "Version 1.2 replaced version 1.1: sections 2, 4 and 7 now say that you can ask for
  help getting back into your account when you have lost your passkey or authenticator app and have no recovery code,
  what a member of our team sees to decide on the request, and how long we keep it." The 1.1 summary stays after it.
- **A new version, not an edit of 1.1.** Privacy Policy 1.1 is in the release the site runs (its archive copies are in
  the commit `tests/n1-baseline.json` names), and the release check refuses a changed text under a number the archive
  already holds. The Terms stay at 1.1, with their day.
- **The other 34 languages change only their number and day** (eyebrow, end marker and version line). Since 24
  November 2026 the release offers all 35 languages, and each has a translation of the English 1.1 texts
  (`RELEASE_LEGAL_LOCALES`, all archived at 1.1). None of the 34 translations is translated again in this change: each
  keeps the body translated from the English 1.1, and `apps/ui/legal/translated-from.json` still records every one as
  translated from the English 1.1, which is how the tooling marks a translation that lags. `pnpm run generate:legal`
  says so ("privacy: 34 translation(s) follow an older English text (ar, bg, …, zh); bring them up to date before
  release"), and `pnpm run legal:release-check` refuses a release until they are translated and recorded, one language
  at a time or several together:
  `node apps/ui/scripts/generate-legal-data.mjs --translated --document privacy --locale <code> [--locale <code> …]`.
- **No archive copy of 1.2 yet.** `pnpm run generate:legal:archive` copies the current text of every language the
  release offers, now all 35, and an archive copy is kept for good. Run now, it would keep the 34 untranslated texts as
  version 1.2, and their translations could then never be archived under that number. The archive step runs once every
  translation follows the English 1.2; the 1.0 copies (English, French, Romanian) and the 1.1 copies (all 35 languages)
  are unchanged.
- **The working day is 26 November 2026**, in every language's Privacy Policy (and in the English "last updated"
  sentence; the translations' own "last updated" sentence keeps the day of the English 1.1 they follow). The effective
  day is the upload day: once the 34 translations are translated and recorded, `pnpm run legal:redate --date
  YYYY-MM-DD` (with `--dry-run` first) sets it, regenerates, archives and runs the release check.
- **The re-dating command now handles one document at a time.** `apps/ui/scripts/legal-redate.mjs` used to give both
  documents one day and refused when either current version was released. It now leaves a document whose current
  version was released as it is (the Terms 1.1 keep 24 November 2026) and re-dates the other; it refuses only when
  every current version is released. It also refuses any change while a translation the release offers lags its English
  text, since its archive step would otherwise keep that untranslated text under the current number.
- **Nobody is asked to accept again.** The re-acceptance floors stay at 1.0 for both documents.
- **Tests.** The version pins move to Privacy 1.2 (Terms 1.1); each document's effective day is read from its own
  English version line (`legalEffectiveDay(kind)`, `tests/support/legalText.ts`). The checks that hold every translation
  to English's rows and places compare a translation with the English text it was made from
  (`legalEnglishTranslatedFrom`, read from the archive while the translations lag), and English with itself.
  `tests/unit/legal-reset-10.test.ts` pins the launch languages' 1.0 and 1.1 copies by hash, one 1.1 copy for each of the
  other 32 languages, the 1.2 change summary in English, and all 34 translations as made from the English 1.1. The full
  run of `legal:redate` in `tests/unit/legal-redate.test.ts` runs once every translation follows the English texts;
  until then the tests pin its refusal and its dry run.

## Open: telling account holders before the new processing starts

- **What section 14 says.** "For a change that adds a new purpose or a new recipient we tell you before the new
  processing starts, by email and in the product, and give you time to object." For a clarification that changes
  nothing about what is done, the new version is simply posted.
- **This change.** Section 4 gains a purpose (helping a person get back into their account, with a member of the team
  deciding), so it is not only a clarification. Under section 14, account holders are told by email and in the product
  before the first request can be decided, and given time to object.
- **The accounts.** On 24 November 2026 the accounts on the site are the owner's own (see
  `2026-11-24-partner-model-out.md`, "Terms section 14 and this change"), so no outside person would receive the email.
- **The choice** is the owner's, recorded here before the upload that carries 1.2: send the notice (email and in the
  product) before the feature is switched on, or record why it is not needed. Not reviewed by counsel.
