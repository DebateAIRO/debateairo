# A public debate after its author's account is erased: can the author be identified again?

Date: 16 November 2026. Draft for counsel; not reviewed. Written for Quebec's rules on anonymization; the same
question decides whether the text is still personal data under the GDPR. The legal points are from memory and none
was read in the primary text for this draft: every one is [unverified] until counsel confirms it. The facts about the
product were read in the code on 16 November 2026 and each names where.

Updated 17 November 2026: the stored public copy no longer holds the first author's pseudonym (open point 1), the
audit trail was read and tested (open point 2), and one new point was found on the way (open point 7).

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
| **The owner reference beside the debate** (a random id, one per account) | **Stays on the debate's own record, and on the records we keep by law (the proof of accepting the terms, the billing records)** | **See open point 7** |
| Copies made by others while the pseudonym was shown (search engines, archives, screenshots) | Outside our control | They tie the pseudonym to the debate, not to a person |

## The three risks

**Singling out.** Can one person be picked out from what stays? The pseudonym is random and was given by us, so it
carries nothing about the person. What can single someone out is their own words in the question. Example: "I run
the only pharmacy in a village of 300 people; should I…". Risk: low for most questions, real for a few.

**Linking.** Can what stays be joined with something else to find the person? Two routes: a copy of the page from
before erasure shows the pseudonym beside the text, and the person may have told others which pseudonym was theirs.
All the public debates of one account carried the same pseudonym, so someone who kept copies can still group them, and
several questions together say more than one. Risk: low, and outside what we can undo. Inside our own database
there is a third route, which we can undo: see open point 7.

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
7. **The owner reference still joins the public debate to records we keep.** Found on 17 November 2026. Every account
   has one random owner reference. After erasure the public debate's record still carries it (`core.run`,
   `core.run_ownership_event`); that is how the page knew the name had gone. The same reference is on records we keep
   after erasure because the law asks for them: the proof that the person accepted the terms, which holds their IP
   address and browser, sealed under a key we hold, for six years after closure (`legal.acceptance`,
   `legal.account_closure`, `migrations/0080_legal_acceptance.sql`), and the billing records of a paying customer
   (`billing.customer`, `billing.charge`; how long these stay after erasure was not checked here). Example: someone
   with the database and that key can go from a public debate to its owner reference, and from there to the IP address
   used at sign-up, or to an invoice. The reference also groups all the public debates one erased account had. In the
   test only the closure date was seen beside the reference (the test account had accepted nothing and paid nothing);
   the rest was read in the code. "Cannot be undone" is not met while this join exists. To close: at erasure, cut the
   public debate loose from the owner reference (for example give each kept debate a fresh reference of its own),
   without touching the records the law asks us to keep.

Until then the Privacy Policy's Annex B.3 should not say that we anonymize what stays public. It says only what is
true today: the pseudonym is no longer shown, and the text stays.
