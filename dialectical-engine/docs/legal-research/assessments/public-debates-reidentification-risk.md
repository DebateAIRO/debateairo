# A public debate after its author's account is erased: can the author be identified again?

Date: 16 November 2026. Draft for counsel; not reviewed. Written for Quebec's rules on anonymization; the same
question decides whether the text is still personal data under the GDPR. The legal points are from memory and none
was read in the primary text for this draft: every one is [unverified] until counsel confirms it. The facts about the
product were read in the code on 16 November 2026 and each names where.

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
| **The first author's pseudonym in the stored public copy** | **Stays inside the stored copy; the page shows "a contributor" in its place** | **See open point 1** |
| The security audit trail | Stays, append-only | The Privacy Policy says it holds no readable identifier; see open point 2 |
| Copies made by others while the pseudonym was shown (search engines, archives, screenshots) | Outside our control | They tie the pseudonym to the debate, not to a person |

## The three risks

**Singling out.** Can one person be picked out from what stays? The pseudonym is random and was given by us, so it
carries nothing about the person. What can single someone out is their own words in the question. Example: "I run
the only pharmacy in a village of 300 people; should I…". Risk: low for most questions, real for a few.

**Linking.** Can what stays be joined with something else to find the person? Two routes: a copy of the page from
before erasure shows the pseudonym beside the text, and the person may have told others which pseudonym was theirs.
All the public debates of one account carried the same pseudonym, so someone who kept copies can still group them, and
several questions together say more than one. Risk: low, and outside what we can undo.

**Inferring.** Can something about the person be guessed from what stays? A question on a health or money matter
invites the guess that the asker has that matter. With no name it attaches to nobody. Risk: low.

## What lowers the risk today

- The pseudonym is random and cannot be chosen.
- The page tells people, before they ask or publish, not to include personal details.
- Anyone can ask us to remove personal details from a public page, with or without an account, and we do.

## Open points before we may call it anonymized

1. **The first author's pseudonym is still in the stored public copy.** It is hidden when the page is shown, not
   removed. "Cannot be undone" is not met while it is there. To close: at erasure, write the stored copy again without
   it, or never store it there and read it from the account as contributions do.
2. **The audit trail.** Confirm, for publication and erasure events, that no entry holds the pseudonym or anything
   else that ties a public debate to the erased account.
3. **Backups.** State how long a backup taken before erasure still holds the account beside its public debates, and
   that it is not used to restore that link.
4. **No check for personal details before a text becomes public.** Until it exists, direct identifiers in the text
   are removed only when someone asks. The regulation wants them removed first.
5. **Who is in charge**, by name, and when the analysis is repeated (suggested: once a year, and whenever what the
   public copy stores changes).
6. **The register entry**, once points 1 to 5 are closed: what is anonymized (the public text of debates whose author
   erased the account), why (so that the people who built on a debate, and its readers, keep it), how (the account and
   every link to it deleted, the name removed, personal details taken out of the text), and the date of this analysis.

Until then the Privacy Policy's Annex B.3 should not say that we anonymize what stays public. It says only what is
true today: the pseudonym is no longer shown, and the text stays.
