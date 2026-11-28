# NETOPIA's written answer, in the checkout consent, the Privacy Policy (version 1.4) and the Register

Written on 28 November 2026.

These notes are not legal advice.

## The facts

NETOPIA Payments answered the company in writing in November 2026:

- it keeps payers' data only in data centres in the European Union, one of them in Romania, and stores none outside
  the EU;
- it keeps the data of a payment (name, email address, phone, the details of the transaction) for 5 years from the date
  of each transaction and then deletes it automatically; it keeps it longer only while an investigation, a court case or
  an authority's request is under way;
- it does not store full card details.

What it keeps of a card (the first 6 and the last 4 digits and the cardholder's name) is from its notice for payers,
netopia-payments.com/nota-de-informare-gdpr-platitori, as the Register already said.

Three texts on the site said something less exact:

- the checkout consent sentence, `billing.consent.renewal`, beside a tick box at checkout, at a plan upgrade and at a
  card change: "I agree that NETOPIA Payments keeps my card and that {total} is charged to it every month until I
  cancel." Buyers read "keeps my card" as NETOPIA holding their card;
- the Privacy Policy, section 5 ("Other recipients"): "and it keeps your card so that it can charge it at each
  renewal";
- NETOPIA's entry in the Register (`/providers`): where it processes, "Romania, in general", with transfers outside the
  European Economic Area possible; and why it keeps payment data for 5 years.

## The decision

The owner chose the English wording of all three changes; it is used as given. The Terms of Service do not change.

## What changed

- **The consent sentence**, in English: "I agree that {total} is charged to this card every month until I cancel, and
  that the card is remembered for these payments. The card is handled by NETOPIA Payments; neither NETOPIA nor we store
  the full card details. I can cancel at any time in Settings or at dezbatere.ro/cancel." Its version in the legal
  manifest is new in every language (the next section says what that does).
- **The English Privacy Policy, version 1.4.** Two passages:
  - section 5, the sentence on NETOPIA: "You type your card details on its page, not ours, and it remembers your card
    so that it can charge it at each renewal; NETOPIA has told us in writing that it does not store your full card
    details." The sentence after it is unchanged;
  - section 14, after the "last updated" sentence and before the 1.3 summary: "Version 1.4 replaced version 1.3:
    section 5 now says that our payment provider, NETOPIA, remembers your card for renewals without storing its full
    card details, as NETOPIA has confirmed to us in writing."
  No other place in the English Privacy Policy or Terms says that NETOPIA keeps or stores the card. Section 2's
  "Payments" row says that we keep "a code from the payment provider that lets it charge the same card at each
  renewal", and section 7's "Saved card" row says how long we keep that code; both are about what we keep, and both
  agree with NETOPIA's answer. The Terms (section 12) say that the full card number never reaches us.
- **The Register.** NETOPIA's entry says: where, "The European Union only. NETOPIA has told us in writing that it keeps
  the data in data centres in the EU, one of them in Romania, and stores none outside the EU"; how long, "5 years from
  the date of each payment, then deleted automatically; longer only while an investigation, a court case or an
  authority's request is under way. NETOPIA does not store your full card details: it passes them to its bank, to Visa
  or Mastercard and to the bank that issued your card, and keeps only the first 6 and last 4 digits and the cardholder's
  name". It was checked on 28 November 2026 (`NETOPIA_PROVIDER`, `apps/ui/lib/legal/pages.ts`).
- **The translations.** The consent sentence, the two Privacy Policy passages and the two Register sentences are in all
  34 other languages, each in the words and the form of address that language's texts already use.
  `apps/ui/legal/translated-from.json` records each Privacy Policy as translated from the English 1.4 text. **None of
  the translations has been reviewed by a native speaker or by counsel.**
- **The number and the day.** The Privacy Policy 1.3 is archived (its copies were made for the upload of 28 November),
  and the release check refuses a changed text under an archived number, so the change takes the next number, 1.4, in
  all 35 languages together. Its working day is 29 November 2026, in every language's eyebrow, version line and "last
  updated" sentence: a version must take effect after the day of the one before it, and 1.3's is 28 November. The
  upload sets the upload day with `pnpm run legal:redate`, as the release guide says.
- **The archive.** One copy of the Privacy Policy 1.4 in each of the 35 languages. The copies of earlier versions are
  unchanged; `/privacy/versions` lists 1.4 as the current text and 1.3 among the earlier ones.
- **The re-acceptance floors** stay at 1.0 for both documents, so nobody is asked to accept the Privacy Policy again.
- **The runbook** (`deploy/preview-auth-dev/v1/MAIN-SITE.md`) says the next upload carries the Terms 1.2 and the
  Privacy Policy 1.4.

## What a new consent sentence does to people who already hold a plan

- The manifest gives each language's sentence the version `sha256-` and the first 12 hex digits of its sha256
  (`packages/legal-manifest/src/index.ts`, `apps/ui/scripts/legal-consent-manifest.mjs`). Any change of the words is a
  new version.
- The three flows that show the sentence send back the version and hash the page showed, and the API accepts only the
  current pair for that language; anything else is refused with 409 `LEGAL_DOCUMENT_STALE`, and the page says "This page
  is out of date. Please reload it.": checkout (`CheckoutService.start` → `assertCurrentConsent`,
  `apps/api/src/billing/checkout.ts`), an upgrade (`apps/api/src/billing/upgrade.ts`) and a card change
  (`apps/api/src/billing/card-change.ts`), both through `assertCurrentAgreement` in
  `apps/api/src/billing/hosted-payment.ts`. Each acceptance is recorded as a `RENEWAL_TERMS` row with the version and
  hash ticked.
- Renewals never read the consent (`apps/api/src/billing/renewal.ts` does not use the legal manifest). A plan bought
  under the old sentence keeps renewing on its saved card; its acceptance row keeps the old version and hash.
- The re-acceptance screen covers only the Terms and the Privacy Policy, and only below their floors
  (`RepositoryLegalAcceptanceApplication`, `apps/api/src/legal.ts`); the manifest refuses a floor on a consent
  sentence. So nobody who holds a plan is asked to agree again: they see and tick the new sentence the next time they
  upgrade or change their card, or buy again after a plan ends. A page opened before the upload and submitted after it
  is refused once and asks for a reload.

## Open: no notice before the change

Section 14 of the Privacy Policy promises advance notice "For a change that adds a new purpose or a new recipient";
"For clarifications that change nothing about what we do, we simply post the new version." This change adds neither a
purpose nor a recipient: it says more exactly what NETOPIA already did. Read that way, version 1.4 needs no email
before it takes effect. Not reviewed by counsel.

## Open: the Privacy Policy 1.3 and the live site

`tests/n1-baseline.json` names the release the site runs, and that release carries the Privacy Policy 1.2 and the Terms
1.1; the file names a new release only once the pull request after its upload is merged. If the upload that carries
1.4 is the first after that release, 1.3 never goes live, yet its archive copies stay and `/privacy/versions` lists it.
