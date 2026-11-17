# Everyone may withdraw within 14 days, and the refund is measured by credit only: what the legal texts say, and what is left (2026-11-16)

**Status: Part 1 is applied on this branch to the English Terms of Service and, as drafts written by an AI, to the same paragraphs of the Terms in the other 34 languages, under the unreleased number: the version
stays 2.18 until release (English first). The Privacy Policy does not change. Part 2 waits for the release step. Not
read by counsel: the three points at the end are for the owner or counsel to settle before release.**

## What this is for

Two things did not match.

1. **Who may withdraw.** Since 10 November 2026 the code lets a buyer in every country the site serves withdraw from a
   paid plan within 14 days. The Terms still gave the right only to people in the EU and the EEA, and Annex A told
   buyers in Australia, New Zealand, Singapore and Japan that they had no cooling-off right, and buyers in South
   Korea that they had 7 days. With billing on, a buyer in Japan would have seen Withdraw in Settings while their
   Terms said the right was not theirs.
2. **How much comes back.** The code kept the larger of two shares of the price: the days gone by, or the plan's
   credit used. Section 13 of the Terms described only the days ("pro rata on the price for the billing period"), and
   section 12 promised a refund measured by usage alone, "however many days have passed", when a person cancels and
   asks. Three measures for one question.

## The owner's decisions (16 November 2026)

- **Everyone the site serves, wherever they live, may withdraw from a paid plan within 14 days of subscribing.** The
  code already does this; the texts now say it.
- **One refund rule for everyone, the EU included:** refund = price paid × (plan credit not used ÷ plan credit in
  force). The days gone by no longer count. Nothing used gives the full price back. All the credit used gives nothing
  back. Before, the code paid the price minus the larger of the days share or the credit share, so the new refund is
  never smaller than the one the old code paid.
- **Kept as they are:** the 14-day window and the per-country list behind it (`withdrawal_countries` in the billing
  policy); a payment that succeeded after the moment of the withdrawal goes back whole; after an upgrade, the credit
  that counts is the credit in force after it; the amount is rounded down to the cent once, at the end; and a
  withdrawal whose refund the site cannot work out from its own records goes to the owner to settle by hand.

The code and its specification are in `docs/superpowers/specs/2026-09-29-paid-plans-and-payments-design.md`, §1.5,
"Amendment 2026-11-16".

## Part 1 — applied on this branch (English)

Terms of Service, still numbered 2.18:

- **Section 12, "Statutory rights first."** The refund on request is "measured by the plan's credit" (it read "measured
  by the plan's usage"). The paragraph's sentence about section 13 read "If the withdrawal right in section 13 also
  applies, you get whichever refund is larger." The two refunds are now the same amount, so it reads "A withdrawal
  under section 13 is refunded by the same measure."
- **Section 13, first paragraph.** "Wherever you live, you may withdraw from a paid subscription within 14 days of
  subscribing" (it read "If you live in the EU or the EEA"). The ways to withdraw are unchanged: the page at
  dezbatere.ro/withdraw, the model form in the confirmation email, or a message to support.
- **Section 13, second paragraph.** A person who asked for the service to start at once and then withdraws pays "only
  for the share of the plan's credit you have used by then, however many days have passed", with the same two examples
  as section 12: 30% of the credit used, 70% of the price refunded; none used, the full price refunded. It read
  "calculated pro rata on the price for the billing period". The sentence in bold stays: using the service during the
  14 days does not lose the right.
- **Section 13, third paragraph.** "Annex A states any further withdrawal or cooling-off right that the law of your
  region gives you. Statutory rights in your country always come first." It read "If you live elsewhere, Annex A
  states the withdrawal or cooling-off right that applies in your region, if any, and our refund policy otherwise."
- **Annex A.4, Australia and New Zealand.** "The 14-day withdrawal right in section 13 applies to the paid plan" (it
  read "No cooling-off right applies to the paid plan beyond what section 12 gives you").
- **Annex A.6, Singapore and Japan.** Each says "the 14-day withdrawal right in section 13 applies to the paid plan"
  (they read "no statutory cooling-off applies to the paid plan" and "no general cooling-off applies to online
  subscriptions").
- **Annex A.6, South Korea.** "You may withdraw from a paid plan within 14 days of subscribing, as section 13 says, and
  the E-Commerce Act's withdrawal rules also apply" (it read "within 7 days of subscribing subject to the E-Commerce
  Act").

Section 13 keeps its three paragraphs, and no paragraph, address or article reference was added or removed anywhere.
The tests of the English-first step compare the committed translations with the English draft and fail otherwise.

The sentences on the pages and in the email were reworded with it, in English and in the other 34 languages: the
checkout sentence a buyer ticks (`billing.consent.immediateStart`), the hint under Withdraw in Settings, the Settings sentence for a withdrawal period that has ended (`billing.subscription.withdrawWindowClosed`, which no longer says "or it doesn't apply where you live"), the /withdraw
page, the /legal notice and the confirmation email (M1). The checkout sentence is hashed into the legal manifest, so
each language's new wording is a new consent version: an acceptance recorded from now on names the new sentence, and
the old sentence's text stays only in the repository's history.

## Part 2 — at release

- **One change-log entry for Terms 2.19, not two.** Version 2.19 also carries the wider licence for public debates
  (`docs/legal/2026-11-16-public-debates-stay-public.md`). The history paragraph in section 14 is a single paragraph
  that starts "Version 2.19 replaced version 2.18:" and lists every change. This decision adds this clause to it:

  > section 13 gives the 14-day right of withdrawal to everyone, wherever they live, and says that if you withdraw
  > you pay only for the share of the plan's credit you have used, however many days have passed; section 12 says that
  > a withdrawal is refunded by the same measure as a refund on request; Annex A.4 and A.6 say that the 14-day right
  > applies in Australia, New Zealand, Singapore, Japan and South Korea

  With the clauses the other note gives, the whole paragraph reads:

  > Version 2.19 replaced version 2.18: section 9 says that the licence you give when a debate or a contribution
  > becomes public continues after you close your account and lets others build on it, that nobody owns a public page,
  > and how your rights as an author are treated; section 8 says that asking does not make you the author of what the
  > AIs write; section 16 names our rights in the collection of public debates; Annex A.3 adds a waiver of moral rights
  > for Canada; section 13 gives the 14-day right of withdrawal to everyone, wherever they live, and says that if you
  > withdraw you pay only for the share of the plan's credit you have used, however many days have passed; section 12
  > says that a withdrawal is refunded by the same measure as a refund on request; Annex A.4 and A.6 say that the
  > 14-day right applies in Australia, New Zealand, Singapore, Japan and South Korea.

  The Privacy Policy's entry for 3.13 gains nothing from this decision.

- **The other 34 languages.** The 34 translations of these Terms paragraphs, and of the page and email sentences
  above, are drafts written by an AI. None has been read by a native speaker. Each language is checked by a native or
  legal reader before release (go-live checklist row 36). Two to read first: the Japanese and Korean Terms rendered
  section 13's "pro rata" as "calculated per day", so their new section 13 must not keep a day-by-day wording, and
  they are also the two countries whose Annex A.6 changes.

## Three things the owner or counsel still has to settle at release

**(a) Does the release need express re-acceptance for this change too?** The new rule never pays less than the old
code did. Terms 2.18 as literally worded can promise more than the old code paid. Section 13 of 2.18 measures by days
alone ("pro rata on the price for the billing period"), and section 12 of 2.18 adds "If the withdrawal right in
section 13 also applies, you get whichever refund is larger." Read together, a person who uses most of the credit in
the first days is owed most of the price back under 2.18: someone who used 80% of the credit on the first day of a
30-day month is owed about 97% of the price by days, and 20% under the new rule. For that person 2.19 is a change
that reduces a right, and section 14 of the Terms then asks for acceptance at the next sign-in, with the change
applying only going forward. The re-acceptance floor is already planned to rise to 2.19 for the wider licence, so the
question is whether that one acceptance is enough for this change as well, and what a person who subscribed under
2.18 and withdraws before accepting 2.19 is paid. Billing is still switched off, so nobody has paid under 2.18 yet;
if 2.19 is released before billing is switched on, no payment was ever made under the 2.18 wording.

**(b) Is credit used an acceptable measure for EU buyers?** For a buyer in the EU the law, not the Terms, sets what
may be kept after a withdrawal from a service that started at the buyer's request: an amount in proportion to what
was provided up to the withdrawal, compared with the whole contract (Directive 2011/83/EU art. 14(3)). The Terms now
measure "what was provided" by the plan's credit used and not by the days gone by. That gives more back to a person
who used little, and less to a person who used all the credit on the first day than a count of days would. Counsel
should confirm that this measure is acceptable. The Terms keep "Statutory rights in your country always come first",
so a buyer whom the law gives more is still owed more; the code pays the credit measure only. Go-live checklist rows
24 and 42 hold this question and stay open.

**(c) The confirmation email attaches the Terms the buyer accepted, not the current ones.** M1 attaches the archived
text of the version and language the buyer accepted. For an acceptance older than 2.19 that text still has the old
section 13 ("If you live in the EU or the EEA", "pro rata") and the old Annex A, which denies or shortens the right,
beside an email sentence that says "Wherever you live, you may withdraw…". The billing routes refuse a person whose
acceptance is below the re-acceptance floor (`LEGAL_REACCEPTANCE_REQUIRED`). So with the floor at 2.19, as planned for
the wider licence, nobody can subscribe on an older acceptance, and the email and its attachment agree. To settle:
that the floor does rise to 2.19 at this release whatever becomes of the licence change, because this decision now
depends on it too; or, if it does not rise, what the email says about which text applies to the withdrawal.
