# A public debate stays public after its author leaves: what the legal texts say, and what is left (2026-11-16)

**Status: Part 1 is applied to the English Terms of Service and Privacy Policy on this branch. English only, and the
version numbers stay 2.18 and 3.12 until release (English first). Part 2 waits for the release step. Part 3 waits for
code. Not read by counsel: someone who knows Romanian law and Quebec law reads the English before it is released.**

## What this is for

A public debate is built on by other people, who spend their own credit to dig into it and to have reports written on
it. If the first author could pull it down later, their work would fall with it. The product already keeps a public
debate when an account is erased and shows "a contributor" in place of the pseudonym. The texts said so, but left four
holes:

1. **The licence was too thin.** Section 9 granted it "for as long as it remains published" and only for hosting,
   reading and quoting. It did not say that it outlasts the account or that others may build on the content.
2. **Nothing was said between contributors.** The Terms did not say that nobody owns the page.
3. **No legal basis was named for the time after the account is closed.** Privacy section 4 gave "Contract" for
   publishing. The contract ends at closure.
4. **Nothing checks for personal details before a text goes public.** Still open: Part 3.

The main protection is not a clause. Data-protection law acts on personal data only. A public text with no name and no
link to an account is normally not personal data, so an erasure request has nothing to act on. The clauses cover what
is left: a text that still says something about a person, and the author's rights in their own words.

## The owner's decisions (16 November 2026)

- **No delete button for a public debate, on any plan.** No law we looked at requires one. An author's right to
  withdraw a work exists in some countries (Romania, France, Italy, Spain, Germany), only where the person's own words
  are a protected work, on a written request, and usually against payment for the loss caused to others. It does not
  exist in Canada, the United States or the United Kingdom. Such a request is answered case by case.
- **Personal details are caught where a person types text that will be public** (Part 3): on the Free plan, the
  question and anything else typed into the debate; on any plan, what is typed into a public debate. An AI takes the
  personal part out, shows the person the changed text and says what it changed, so that the question still makes
  sense. A private debate on a paid plan is not checked while it is private; it is checked at Publish.
- **The promise "it does not let us sell your content or license it for someone else's product" leaves the licence.**
  Removing it does not by itself allow those uses: the licence still lists what we may do, and the sentence "This
  licence exists so we can operate the public pages" stays. Licensing the collection to someone else would need its
  own clause and a new acceptance.

## Part 1 — applied on this branch (English)

Terms of Service:

- **Section 8, "Outputs."** Starting, steering or digging into a debate does not make you the author or the owner of
  what the AIs write.
- **Section 9, "Free debates are public."** Says that the debate stays public.
- **Section 9, "No take-back."** Staying public is a term of the contract, accepted at Publish or, on the Free plan,
  when the debate starts. A consent under data-protection law can be withdrawn at any time; a contract term cannot.
  The texts and the pages must never call publishing a "consent".
- **Section 9, "Your name."** Where the law gives the person rights as an author: they agree to be shown under the
  pseudonym, or with no name after erasure, and that others build on what they wrote. Where the law does not let them
  give such rights up, the rights stay; withdrawing after others have built on the text may oblige them to make good
  the others' loss.
- **Section 9, "After the author leaves."** Nobody owns the page. Each person keeps the rights in their own words and
  gives the same licence; nobody can have another person's contribution removed, except through the reporting route.
- **Section 9, "Licence for published content."** The licence covers adapting the content and letting others build on
  it, lasts as long as any rights in the content, continues after the account is closed and cannot be withdrawn,
  except where a law a contract cannot set aside says otherwise.
- **Section 16.** The collection of public debates, as a collection, is ours as the maker of a database.
- **Annex A.3.** Canada: a waiver of moral rights for the uses section 9 describes. Canadian law allows the waiver
  (Copyright Act, s. 14.1); Romanian law does not (Law 8/1996, art. 11), which is why section 9 says the rights stay.

Privacy Policy:

- **Section 4, the publishing row.** Contract while the account exists: a public debate is the service asked for,
  on the Free plan too. After closure, legitimate interests: the people who added to the debate or spent credit on it,
  its readers, and ours in a record that stays whole. The person may object.
- **Section 6, "What happens to your name on erasure."** Why the text stays, that it is a contract term and not a
  consent, and how an objection is weighed.
- **Section 10, Objection.** The right covers a public debate kept after closure.

Two wordings are shaped by what an English-only change can carry today. The tests of the English-first step compare
the committed translations with the English draft, so they fail when English alone gains a paragraph or a reference to
an article. So "Nobody owns the page" sits inside "After the author leaves." and is not its own paragraph, and the
basis after closure reads "point (f) of the same paragraph" and not "Art. 6(1)(f)". Both can be set right when the
translations are redone at release.

## Part 2 — at release

- **New version numbers and their change-log entries.** Terms 2.19:

  > Version 2.19 replaced version 2.18: section 9 says that the licence you give when a debate or a contribution
  > becomes public continues after you close your account and lets others build on it, that nobody owns a public page,
  > and how your rights as an author are treated; section 8 says that asking does not make you the author of what the
  > AIs write; section 16 names our rights in the collection of public debates; Annex A.3 adds a waiver of moral rights
  > for Canada.

  Privacy 3.13:

  > Version 3.13 replaced version 3.12: section 4 says on what basis a debate is made public and on what basis we keep
  > it public after you close your account; sections 6 and 10 say that you can object to our keeping one.

- **Express acceptance.** The wider licence is a "new use of your content", so section 14 of the Terms requires
  acceptance at the next sign-in, and the change applies only going forward: the Terms re-acceptance floor rises to
  2.19. Debates made public before a person accepts stay under 2.18, which already says that they stay public and that
  erasing the account does not remove them.
- **The other 34 languages**, as for every release.

## Part 3 — waits for code

### The personal-details check

Terms, section 9, a new paragraph after "A flagged debate needs our approval.":

> **Personal details are taken out first.** Wherever you type text that will be public — your question and what you
> add to a debate on the Free plan, and what you add to a public debate on any plan — an AI reads it for details that
> identify a private person, you included: a name, contact details, an identification number, a workplace together
> with a role, or health, money or family details tied to someone who can be recognised. If it finds any, it takes
> that part out, shows you the changed text and tells you what it changed; the debate goes on with the changed text.
> People acting in a public role, and companies and institutions, are not private persons for this check. A private
> debate on a paid plan is not checked while it is private: it is checked when you press Publish, and if personal
> details are found it is not published. The check can miss things: section 10 says how anyone can ask us to remove
> personal details from a public page.

The check must also be named wherever the automated checks are listed: Terms sections 8 and 10; Privacy sections 4, 5,
7 and 8. Privacy, section 4, a new row:

> | Taking personal details out of a text before it becomes public | The text you typed, sent to the model with nothing that identifies you or your account; the changed text; that a change was made | **Legitimate interests** — Art. 6(1)(f): keeping personal details, yours and other people's, off public pages. For sensitive details about you, the **explicit consent** you give on a separate screen before your first debate — Art. 9(2)(a) (section 3) |

### The pseudonym inside the stored public copy

The published snapshot stores the first author's pseudonym (`author_pseudonym`), and after erasure the page shows
"a contributor" in its place (`apps/api/src/public-tree.ts`, `identity.public_author_name_gone`). The pseudonym is
hidden, not removed from what is stored. The texts say it "is removed everywhere". Either the stored copy is rewritten
without it at erasure, or the texts say "is no longer shown". The first is the one that makes the text that stays
anonymous in the sense Quebec's law asks for; see the re-identification analysis.

### The words on the pages

- `newDebate.freePublicNotice` says "On the Free plan your question and its debate are public. Don't include personal
  details." It gains that this is for good: "…are public, and they stay public."
- The Publish step keeps its warning and gains a box to tick, "I understand that publishing is for good." The box
  records agreement to a contract term and must not use the word "consent".

## The papers behind the policy

Both are in `docs/legal-research/assessments/`, as drafts for counsel:

- `public-debates-kept-after-closure.md`: the legitimate-interests assessment that the new basis in Privacy section 4
  relies on.
- `public-debates-reidentification-risk.md`: the analysis Quebec's anonymization regulation asks for. Annex B.3 can say
  that we anonymize what stays public only once its open points are closed.

## What no clause can do

- A request to remove personal details from a public text is always answered, whatever the Terms say.
- An order from a court or an authority is followed.
- A term a consumer could not see or understand can be struck out as unfair (Romania: Law 193/2000; Quebec: Civil
  Code, arts. 1435–1437). The notice on the page at the moment of publishing is what makes this term a fair one.
