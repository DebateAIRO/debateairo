# Help getting back into an account, in the Privacy Policy (version 1.2)

Written on 24 November 2026.

Version 1.2 holds two changes: this one, and what the AI checks of public text receive and decide, which
`2026-11-24-publication-check-text.md` describes. They were made on two branches and joined before either reached the
site, so there is one version 1.2. Version 1.1 and the Terms (1.1, 24 November 2026) do not change.

These notes are not legal advice.

## The facts

- A person who has lost their passkey or authenticator app and has no recovery code left can ask for help on
  `/recover/help`. They confirm the request with a link emailed to the account's address and with the account's
  password (migration 0188, `apps/api/src/recovery-permit.ts`).
- A member of the team then approves or refuses the request on an internal page. To decide, they see only: a shortened
  form of the account's sign-in email address, when the account was created, when it was last signed in to, its
  sign-in methods (how many passkeys, whether it has an authenticator app), whether a recovery code is left (yes or no),
  whether it is under a security hold or has a risk mark, whether it has ever paid (yes or no, no amounts) and how many such
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
  what a member of our team sees to decide on the request, and how long we keep it." The same summary goes on with the
  other change in 1.2 (sections 5 and 8 and Annex B on the AI checks; `2026-11-24-publication-check-text.md`), and the
  1.1 summary stays after it. French and Romanian carry the three rows and the summary, sentence for sentence.
- **A new version, not an edit of 1.1.** Privacy Policy 1.1 is in the release the site runs (its archive copies are in
  the commit `tests/n1-baseline.json` names), and the release check refuses a changed text under a number the archive
  already holds. The Terms stay at 1.1, with their day.
- **The translations.** Since 24 November 2026 the release offers all 35 languages, and each has a translation of the
  English 1.1 texts (`RELEASE_LEGAL_LOCALES`, all archived at 1.1). The 34 translations follow the English 1.2, with
  both changes, sentence for sentence, and `apps/ui/legal/translated-from.json` records each as translated from it.
  French and Romanian were translated first. The 32 other languages first carried only the other change, translated
  from its first English 1.2 text, and were then brought up to the English 1.2 and recorded:
  `node apps/ui/scripts/generate-legal-data.mjs --translated --document privacy --locale <code> [--locale <code> …]`.
  `pnpm run legal:release-check` now passes. None of the translations has been reviewed by a native speaker or by
  counsel.
- **One archive copy of 1.2 per language.** `pnpm run generate:legal:archive` copies the current text of every language
  the release offers, and an archive copy is kept for good, so it ran only once every translation followed the English
  1.2. It holds one 1.2 copy for each of the 35 languages, made from the final texts. The other change had archived its
  first English 1.2 text and its translations; none of them was released, and those copies were removed when the two
  changes were joined, since 1.2's text changed. The 1.0 copies (English, French, Romanian) and the 1.1 copies (all 35
  languages) are unchanged. The 1.2 copies are not released yet, so `legal:redate` removes them and makes them again
  when it re-dates 1.2.
- **The effective day is 25 November 2026, the upload day**, in every language's Privacy Policy: the eyebrow, the
  version line and the "last updated" sentence. The drafts first carried the working day 26 November 2026.
  `pnpm run legal:redate --date 2026-11-25` (with `--dry-run` first) set the upload day: it re-dated those three places
  in all 35 Privacy Policies, recorded the 34 translations again, made the 35 archive copies of 1.2 again, kept the
  Terms at 24 November 2026 and passed the release check. Run again for 25 November 2026, it changes nothing. If the
  upload moves to a later day, the same command with that day does the same again.
- **The re-dating command now handles one document at a time.** `apps/ui/scripts/legal-redate.mjs` used to give both
  documents one day and refused when either current version was released. It now leaves a document whose current
  version was released as it is (the Terms 1.1 keep 24 November 2026) and re-dates the other; it refuses only when
  every current version is released. It also refuses any change while a translation the release offers lags its English
  text, since its archive step would otherwise keep that untranslated text under the current number.
- **Nobody is asked to accept again.** The re-acceptance floors stay at 1.0 for both documents.
- **Tests.** The version pins move to Privacy 1.2 (Terms 1.1); each document's effective day is read from its own
  English version line (`legalEffectiveDay(kind)`, `tests/support/legalText.ts`). The checks that hold every translation
  to English's rows and places compare a translation with the English text French was made from
  (`legalEnglishTranslatedFrom`), which is the current English text, since French follows it; English is compared with
  itself. `tests/unit/legal-reset-10.test.ts` pins the launch languages' 1.0 and 1.1 copies by hash, one 1.1 copy for
  each of the other 32 languages, and one 1.2 copy for each of the 35, which is that language's current text; it pins
  the 1.2 change summary in English, French and Romanian, both summaries in every language, and every translation as
  made from the current English text. `tests/unit/legal-redate.test.ts` pins the plan and the command with the release
  the site runs as it is (every archive copy but the 1.2 ones): the Terms are kept, every language's Privacy Policy is
  re-dated in its eyebrow, version line and "last updated" sentence, and a full run on a copy of the legal files makes
  the 1.2 copies again from the re-dated texts, leaves every released copy byte for byte and passes the release check.

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
