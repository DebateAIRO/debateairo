# A public debate after its author's account is erased: can the author be identified again?

Date: 16 November 2026. Draft for counsel; not reviewed. Written for Quebec's rules on anonymization; the same
question decides whether the text is still personal data under the GDPR. The legal points are from memory and none
was read in the primary text for this draft: every one is [unverified] until counsel confirms it. The facts about the
product were read in the code on 16 November 2026 and each names where.

Updated 17 November 2026: the stored public copy no longer holds the first author's pseudonym (open point 1), the
audit trail was read and tested (open point 2), and one new point was found on the way (open point 7). Later the same
day open point 7 was built: when the account is deleted, each of its debates gets a reference of its own in place of the
account's owner reference. What is left of it is listed under point 7.

## What the law asks (Quebec)

- When the purpose personal information was collected for is achieved, it is destroyed, or anonymized to be used for
  serious and legitimate purposes (Act respecting the protection of personal information in the private sector,
  s. 23).
- Information is anonymized when it is at all times reasonably foreseeable that it no longer allows the person to be
  identified, directly or indirectly, and this cannot be undone.
- The Regulation respecting the anonymization of personal information (in force 30 May 2024) asks for: a named person
  with the right skills in charge; direct identifiers removed first; a written analysis of the risk of
  re-identification that looks at singling a person out, linking records, and inferring; the analysis repeated from
  time to time; and, since 1 January 2025, a register entry saying what was anonymized, for what purpose, by what
  technique and when the analysis was made.

## What stays after an account is erased

Read in `migrations/0137_public_debates.sql`, `migrations/0148_erasure_keeps_public.sql`, `apps/api/src/publications.ts`
and `apps/api/src/public-tree.ts`:

| What | After erasure | Identifies the person? |
|---|---|---|
| The account record (email, recovery email, sign-in data) | Deleted | Gone |
| The private debates and their keys | Keys destroyed | Gone |
| The public text: question, argument tree, scores, verdict | Stays, readable by anyone | Only if the text itself says something about its author |
| The pseudonym on a contribution or a report | The link to the account is set to nothing; the name was never copied | No |
| The first author's pseudonym | Never written into the stored copy; the page reads it from the account, so it goes with the account and the page shows "a contributor" | No; see open point 1 for copies stored before this change |
| The security audit trail | Stays, append-only | No: its publishing and erasure entries hold no pseudonym and nothing that names the debate or the account; see open point 2 |
| **The owner reference beside the debate** (a random id, one per account) | **Replaced, when the account is deleted, by a new random reference made for that one debate. The account's own reference stays only on the records we keep by law (the proof of accepting the terms, the billing records), which name no debate** | **No, for accounts erased after the change; see open point 7 for what is left** |
| Copies made by others while the pseudonym was shown (search engines, archives, screenshots) | Outside our control | They tie the pseudonym to the debate, not to a person |

## The three risks

**Singling out.** Can one person be picked out from what stays? The pseudonym is random and was given by us, so it
carries nothing about the person. What can single someone out is their own words in the question. Example: "I run
the only pharmacy in a village of 300 people; should I…". Risk: low for most questions, real for a few.

**Linking.** Can what stays be joined with something else to find the person? Two routes: a copy of the page from
before erasure shows the pseudonym beside the text, and the person may have told others which pseudonym was theirs.
All the public debates of one account carried the same pseudonym, so someone who kept copies can still group them, and
several questions together say more than one. Risk: low, and outside what we can undo. Inside our own database
there was a third route, the owner reference, which is now cut at erasure: see open point 7.

**Inferring.** Can something about the person be guessed from what stays? A question on a health or money matter
invites the guess that the asker has that matter. With no name it attaches to nobody. Risk: low.

## What lowers the risk today

- The pseudonym is random and cannot be chosen.
- The page tells people, before they ask or publish, not to include personal details.
- Anyone can ask us to remove personal details from a public page, with or without an account, and we do.

## Open points before we may call it anonymized

1. **The first author's pseudonym in the stored public copy. Closed for every copy stored once the change of 17
   November 2026 is on the site.** The name is no longer written into the stored copy at all. The page reads it from
   the account each time, as it does for a contribution and a report (`packages/db/src/publication.ts`, `readPublic`;
   `apps/api/src/public-tree.ts`, `storedPublicCopyOf`). So the step that deletes the account is the step that removes
   the name, and nothing has to be rewritten afterwards. A test publishes a debate, erases its author's account, then
   opens the stored copy and searches every table for the pseudonym: it is in none
   (`tests/integration/s8-publication-database.test.ts`, "nothing stored holds the pseudonym").
   **Still open:** a copy stored before the change has the name inside it. The page never reads it, but it is there.
   Today those copies exist only on the test site. To close: rebuild the test site's database before launch, or write
   those copies again without the name.
2. **The audit trail. Confirmed clean on 17 November 2026.** Publishing writes one entry. Its actor and its target are
   two random references made for that one event; it holds no pseudonym, no account id, no debate id and no
   publication id, and the table that tied those references to the account is deleted with the account
   (`core.transition_run_publication` and `core.publish_free_debate`; `identity.publication_event_binding`). Erasure
   writes one entry: the account's audit token and the erasure request's id, no pseudonym and no publication
   (`identity.finalize_account_erasure`), and the request's lists of publications are emptied when it commits. The two
   entries share no value, so a debate cannot be joined to an erasure through them. The same test reads the whole
   audit trail after erasure and finds none of: the pseudonym, the account id, the owner reference, the publication,
   the debate.
3. **Backups.** State how long a backup taken before erasure still holds the account beside its public debates, and
   that it is not used to restore that link.
4. **No check for personal details before a text becomes public.** Until it exists, direct identifiers in the text
   are removed only when someone asks. The regulation wants them removed first.
5. **Who is in charge**, by name, and when the analysis is repeated (suggested: once a year, and whenever what the
   public copy stores changes).
6. **The register entry**, once points 1 to 5 and 7 are closed: what is anonymized (the public text of debates whose
   author erased the account), why (so that the people who built on a debate, and its readers, keep it), how (the
   account and every link to it deleted, the name removed, personal details taken out of the text), and the date of
   this analysis.
7. **The owner reference joined the public debate to records we keep. Cut at erasure since database step 0177; four
   smaller things are left.** Found on 17 November 2026. Every account has one random owner reference. After erasure
   it stayed beside each of the account's debates, and the same reference is on records we keep because the law asks
   for them: the proof that the person accepted the terms, which holds their IP address and browser, sealed under a
   key we hold, for six years after closure (`legal.acceptance`, `legal.account_closure`), and the billing records,
   kept ten full calendar years (`billing.customer`, `billing.charge` and the other billing tables; a 2026 row is
   deleted from 1 January 2037). Someone with the database and that key could go from a public debate to its owner
   reference, and from there to the IP address used at sign-up, or to an invoice; the reference also grouped all the
   debates one erased account had.

   A test with the real erasure showed where the reference sat beside a debate: on the debate's own record
   (`core.run`, `core.run_ownership_event`) and on a billing row, the usage row written for every debate an account
   starts (`billing.run_charge_scope`: the debate, the owner reference, the plan, the allowance period it counted
   against, the time). Read in the code: three memory tables and the claim record of an old debate hold it too.

   What is true now (`migrations/0177_erased_owner_unlinked.sql`): when the account is deleted, every one of its
   debates gets one new random reference, written over the old one in each of those rows. On the usage row the
   reference and the pointer to the allowance period are both replaced; the plan name and the time stay (the owner's
   choice of 17 November 2026: keep the row for statistics, cut what points at the person). The proof of acceptance
   and the other billing records are not touched: they keep the account's reference and name no debate. Example: an
   account with two public debates, an acceptance record and billing records is erased. Before, both debates and
   all those records held the same reference. After, each debate holds its own new reference, found nowhere else,
   and the acceptance and billing records hold the old one, found beside no debate. Both pages still read and say
   "a contributor", and a stranger can still dig on them. This is proven by tests
   (`tests/integration/public-tree-flow.test.ts`, `tests/integration/s8-publication-database.test.ts`,
   `tests/integration/erased-owner-unlinked-0177.test.ts`).

   What is left:

   - **Billing loses the link for every debate of an erased account, private ones too.** A private debate can be
     linked to a public one of the same account (next item), so leaving the old reference on private debates' usage
     rows would have left a road from a public debate to the person. For an erased account billing can still count
     debates by plan and time, but no longer say which customer they were.
   - **Rows that link two debates of one account to each other still link them**: a memory link (the product noticed
     the person had asked a similar question before) and the record of a debate started again under a new release.
     Nothing on either debate reaches a kept record, so this does not lead to the person, but two public debates the
     memory linked can still be seen to come from one account. To close: delete an erased account's memory links.
   - **A debate paid from a team grant keeps the grant's id** on its usage row. The grant's own owner reference is
     already emptied when the account goes, but the grant groups that team member's debates and carries the
     approval note written when it was given. This concerns team accounts only.
   - **Accounts erased before the change keep the old reference.** There is only the test site, whose database may
     be wiped and rebuilt; if it is not rebuilt before launch, those rows need one clean-up run.

   - **Times can still be compared.** No stored value joins a debate to a kept record any more, but both carry
     times. A debate's own rows say when it was asked and published; the kept records say when the terms were
     accepted (at sign-up) and when billing first recorded the account's free plan (the first time the plan was
     read, often at the first question). A debate asked a minute after a sign-up was probably that person's. On a
     busy site many people fit a given minute and this says little; on a quiet one it can point at one person. This
     is a guess from closeness, not a join, and it does not come from the usage row (its time is the debate's own
     start, which the debate's rows hold anyway). To lower it: keep kept records' times less exact, for example to
     the day. Not built; for counsel and the owner to weigh under "linking".
   - **Whether the law asks for more.** The owner chose to keep the usage row without the customer, for every debate
     of an erased account, private ones too. Whether tax or consumer law asks that each debate's usage stay
     attributable to the customer was not answered and is for counsel.

   Backups (point 3) hold the old reference until they rotate, as they hold the account.

Until every point above is closed, the Privacy Policy's Annex B.3 should not say that we anonymize what stays public. It says only what is
true today: the pseudonym is no longer shown, and the text stays.
