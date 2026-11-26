# Upvotes on public debates — design

Date: 26 November 2026 · Branch: `feat/2026-11-26-public-debate-upvotes` (from `dev` at `c946564be`)
Status: **draft for the owner's approval.** The owner's four decisions of 26 November are recorded in section 9.

## 1. What it is and why

A signed-in person can upvote any debate on the home page's **Public debates** tab. Each public row shows how
many upvotes the debate has. The owner asked for it so that readers can tell at a glance which public debates
other people found worth reading, and so that people with accounts have one light way to take part.

## 2. Goals, non-goals, anti-goals

**Goals**

- One upvote per account per debate. Pressing again takes it back. A person may upvote their own debate.
- The count is on every public row, for everyone who can see the row.
- The arrow and the number are obvious at a glance (the owner's words: "obvious to the naked eye").
- A vote is personal data and is treated as such: it leaves with the account and it is in the account's export.

**Non-goals (not in this slice)**

- No downvote. No sorting or ranking by votes: the list keeps its order (newest first).
- No vote control on the debate's own page, on the "Your debates" tab, or on the landing page.
- No list of who voted, anywhere, for anyone, staff included.
- No public list for visitors without a session. Today a browser with no session cookie gets the landing
  page and never sees the tab (`apps/ui/app/page.tsx`); that stays.

**Anti-goals (would make it a failure even if it works)**

- The public list answering differently for different callers, or carrying anything about the caller.
- Any way to learn whether a private, held or unknown debate exists by trying to vote on it.
- A vote surviving its account, or a count that can drift from the rows it counts.

## 3. Approaches considered

How votes are stored and counted:

1. **One row per account per debate; the count is computed when the list is read. — chosen.**
   Exact by construction, taking a vote back deletes the row, nothing lingers. One query for a page of fifty.
2. One row per vote plus a stored running total per debate. Faster only at a scale the site does not have,
   and two things must be kept in agreement.
3. An append-only log of vote and un-vote events, as the visibility events are kept. Full history, but it keeps
   a trail of what a person voted for after they took it back, which works against erasure.

The owner handed over the how; 1 is the builder's call, stated here so it can be corrected.

## 4. The control (approved look)

Approved by the owner as a light-mode mockup on 26 November 2026.

- A box **inside the row's card, at its start edge**, before the claim text; it moves with the row.
  54 × 58 px, 1.5 px border in the ink colour, 11 px radius, the card's own fill.
- A 24 px **filled** up-arrow in soft green `#4FA26B` with a thin outline in the site's green (`--agree`,
  `#2F7A47`). Under it the count, in ink, 14.5 px, weight 700.
- **Hover:** the box takes the pale green tint (`--agree-bg`) and the arrow lifts 2 px.
- **Upvoted:** the box fills `#4FA26B`, the border turns `#2F7A47` and thickens to **3 px**, arrow and number
  turn ink. The thicker border is the mark other than colour that the site's rule asks of a selected state.
- **Dark ("chamber") mode:** border and number in the mode's ink (`#EEF2F8`), the card's fill (`#171E2B`), the
  same green arrow `#4FA26B` with an outline in the mode's green (`#86B58D`), hover in the mode's pale green
  (`#1E2A22`). Upvoted: fill `#4FA26B`, 3 px border `#86B58D`, arrow and number dark (`#0E131D`), because light
  ink on that green is only 2.78:1.
- **Keyboard focus:** the site's 2 px focus ring.
- **Counts of 1000 and more** are shortened: 999 → `999`, 1000 → `1k`, 1249 → `1.2k`, 12 345 → `12.3k`,
  123 456 → `123k`, 1 234 567 → `1.2M`. The decimal mark follows the reader's language (`1,2k` in Romanian);
  digits are always Latin.
- The button is a real `<button>` **outside the row's link** (a button may not sit inside an anchor). It is never
  disabled. It carries `aria-pressed` and a spoken name that includes the count.
- **Right-to-left languages** (Arabic and Hebrew are live): the box sits at the start edge, so it is on the right.
- **Narrow screens** (under 720 px, where the row wraps): the box stays at the start of the claim.
- **Motion:** readers who asked for less motion get no arrow lift and no slide on these rows.
- **No session:** a press sends nothing and shows one line with a link, "Sign in to upvote". This only happens
  when a session has ended while the page was open (see non-goals).
- **Failure:** the press is shown at once; if the server refuses or cannot be reached, state and count go back
  and one line says so. Two exceptions: when the session has ended on the server, the line is the sign-in
  link; and when a vote is taken back on a debate that left the list while the page was open, the box simply
  ends not upvoted, because the vote is gone.
- **Back from a debate:** the row shows the vote as the person left it, not the page the browser kept from
  before the press.
- **Old API, new page:** when the list carries no count (an API from before this feature), the row renders
  exactly as it does today, with no box.

## 5. Behaviour rules

- **Which debates can be upvoted.** A debate that is public right now, by the same rule the list uses:
  its latest visibility state is published and it is not held for review
  (`core.run_is_published(core.run_of_publication(ref), ref)`). Anything else — private, held, deleted, a link
  that was never real — answers exactly like a debate that does not exist.
- **Taking a vote back always works**, whatever the debate's state. It is the person's own data.
- **A held debate keeps its votes**; they count again when the hold is lifted.
- **A debate that is gone for good loses its votes.** When a debate's link can never be public again (it was
  made private again, or the end-of-debate check deleted it), its upvotes are deleted by a sweep on the API's
  existing hourly timer, so no personal data is kept without a use. A debate that is only held is never swept;
  one that is held and then made private is.
- **Known limit of this slice.** The only vote control is on the list of the newest 50 public debates, which
  has no paging. Once a debate is no longer on that list, its upvote cannot be taken back from the page; it is
  still deleted with the account and when the debate is gone. The legal texts say "while the debate is on the
  list of public debates". A control on the debate's own page is a follow-up.
- **Closing an account.** Votes are removed when the account row is deleted, which is at the end of the closure
  grace period, not when deletion is requested. Until then they still count.
- **Counts are the same for every caller** and are computed for public debates only.
- **Rate limit.** One flood brake per account covers casting, withdrawing and the "which have I upvoted" read
  together: 60 actions a minute (builder's proposal; the one-vote rule lives in the table, this only stops
  floods). It has a default in code, so it is in force from the first start and no settings version is sealed.
- **Bots.** No extra check beyond a signed-in session, as for saving a question.

## 6. Constraints found in the code

- Migrations are a chain; each step carries a manifest bound to the step before it. `dev` is at 0192, so this is
  **0193**, previous `0192_registration_country_read.sql`. If another step lands on `dev` first, this one is
  renumbered and its manifest redone.
- Two releases run side by side during an upload. The step is **expand** (additive only) and the new list field
  is **optional**, so an older page reads a newer API and a newer page reads an older API.
- No login holds any right on a person-linked identity table. All access is through `SECURITY DEFINER`
  functions with `search_path = pg_catalog`; a function handed an owner first asks
  `identity.request_owner_matches`.
- `serve.publication_snapshot` rows are never deleted (a deleted debate loses its key, not its row), so the
  vote table's reference to the publication needs no `ON DELETE`.
- `packages/db/src/index.ts` is byte-pinned; a new repository is exported from
  `packages/db/src/investigation-reports.ts`, as seven others are.
- The public list is read on the API's system login inside the existing cross-account frame `X10`; the
  per-person calls run on the request pool under the caller's session.
- The home page is rendered per request and no shared cache holds it or the API's answers, so counts are fresh
  and nothing about one person can reach another. The one cache is the reader's own browser, which keeps the
  page it left when they open a debate and press Back (section 4).
- Closed lists that a required check compares with the code, each of which this feature must join: the route
  policy table and the contract's route list (220 → 223 in three tests), the runtime grant disclosures, the
  owner-taking function census, the identity table inventory, the N-1 baseline's set-aside, the export worker's
  function list (25 → 26), the shipped-file manifest, the colour-token test, the 35 translation catalogues.

## 7. The slice, layer by layer

### 7.1 Database — step `0193_public_debate_upvotes.sql`

Table `identity.public_debate_upvote`:
`publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref)`,
`owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE`,
`created_at timestamptz NOT NULL DEFAULT clock_timestamp()`, `PRIMARY KEY (publication_ref, owner_ref)`,
an index on `(owner_ref, created_at)`, the truncate guard, owner = 0115's export owner, no row security,
no privilege for any role. The primary key is the one-vote rule.

Functions (all `SECURITY DEFINER`, `search_path = pg_catalog`):

| Function | Returns | Granted to |
|---|---|---|
| `identity.cast_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid)` | `jsonb {outcome: CAST \| ALREADY \| NOT_PUBLIC, upvotes: int \| null}` | `debateai_billing_runtime` |
| `identity.withdraw_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid)` | `jsonb {outcome: WITHDRAWN \| NONE, upvotes: int, or null when the debate is not public}` | `debateai_billing_runtime` |
| `identity.read_own_public_debate_upvotes(p_owner_ref uuid, p_publication_refs uuid[])` | `uuid[]` (the asked refs this account upvoted; at most 100 asked) | `debateai_billing_runtime` |
| `identity.read_public_debate_upvote_counts(p_publication_refs uuid[])` | `jsonb [{publication_ref, upvotes}]`, public debates only | `debateai_rls_all_accounts` |
| `identity.read_data_export_public_debate_upvotes(p_export_id uuid, p_worker uuid)` | `jsonb [{publication_ref, created_at}]` | `debateai_data_export_worker` |

A sixth function deletes the upvotes of debates that are gone for good (section 5). It takes no owner, is
granted to the system login's marker only (`debateai_rls_all_accounts`), deletes in bounded batches, never
touches a debate under a staff hold, and returns how many rows it removed. Its exact name and signature are
fixed in the plan.

Cast refuses an account that is not active. The two writers return the fresh count themselves, because the
count reader belongs to the system login and the request pool may not call it.

### 7.2 API

- `PUT /v1/public/debates/{id}/vote` → `200 {voted: true, vote_count}`.
- `DELETE /v1/public/debates/{id}/vote` → `200 {voted: false, vote_count}`.
- `GET /v1/account/public-debate-votes?refs=<1 to 100 uuids, comma-separated>` → `200 {voted: uuid[]}`.
- `GET /v1/public/debates` — each item gains optional `vote_count`; still anonymous, still the same for all.

All three new routes need a session; the two writes need the CSRF pair. Every kind of absence (no such
debate, not public, held, account not active, malformed id) is the same `404 DEBATE_NOT_FOUND`. Answers are
`no-store`. The rate limit is charged before the id is looked at. The routes are always mounted and test for
their store inside the handler, as the Report button's route does.

### 7.3 Contract and client

`PublicDebateSummarySchema` gains `vote_count` (optional, non-negative integer, last key). New strict shapes
`PublicVoteRequestSchema`, `PublicVoteAnswerSchema`, `OwnPublicVotesSchema`. Client methods
`castPublicVote(ref)`, `withdrawPublicVote(ref)`, `readOwnPublicVotes(refs)`.

### 7.4 Page

- `apps/ui/components/LibraryVote.tsx`, a small client component: the button, the optimistic press, the two
  status lines. It wraps the unchanged row link, so the tests that pin the row's markup stay green and
  private rows are byte-identical.
- `apps/ui/lib/upvoteWords.ts`: picks the `home.upvote.*` strings for the browser and formats the short count.
- `DebatesBuffer.tsx` and `page.tsx`: the server page, which already knows the session, reads "which of
  these have I upvoted" once for the page of rows and hands each row its starting state.
- Styles in `globals.css` with two new colour tokens (`--vote`, `--on-vote`) in both modes.
- Strings in all 35 languages: one spoken name with the count in each language's plural forms, the signed-out
  line, the failure line.

### 7.5 Privacy

- Erasure: nothing to build beyond the foreign key; the integration test proves a deleted account's votes go.
- Export: `account.json` gains `debates_you_upvoted: [{debate_reference, upvoted_at}]`, and the export's
  README says so.
- Legal texts, in this slice and in all 35 languages: the Privacy Policy names upvotes (what is kept, why,
  for how long, and that the export holds them), and the Terms of Service say what an upvote is and how it
  may be used. Each document gets its next version and effective date. The re-acceptance floor is not raised,
  so nobody is asked to accept again. The English text of every changed passage is in the plan for the owner
  to approve before the other languages are written.

## 8. How it is built and verified

One vertical slice, built task by task. Each task is written test-first by one subagent and reviewed by a
different one. The plan is an index, `docs/superpowers/plans/2026-11-26-public-debate-upvotes.md`, and one
file per task under `docs/superpowers/plans/2026-11-26-public-debate-upvotes/`; the index fixes the interfaces
above so separately built tasks fit.

Order: database step → its pins and behaviour test → (in parallel) contract shapes, rate-limit budget, words,
styles → repository and the count in the list → export → the three routes → an end-to-end flow on a real
database → the button → the row and page wiring → closing registrations and the full gates.

The baseline on this machine, taken on the untouched tree: typechecks clean; the unit gate ends
`new=30 known=3 stale=0`, where all 30 "new" failures are three files that demand Node 26.8.2 exactly (this
machine has 26.9.0). Builders compare failures by name against that baseline. `pnpm run lint` already exits 1
on `dev` for a known debt and is not used as a judge. Four CI checks cannot run locally (the N-1 job,
`pnpm audit`, gitleaks, CodeQL); the pull request is where they are seen.

## 9. The owner's decisions (26 November 2026)

1. **Legal texts.** "Add the privacy policy change and TOS change as well": both documents change in this
   slice, in all 35 languages (section 7.5).
2. **Votes on a debate that is gone for good** are deleted (sections 5 and 7.1).
3. **Dark mode and the upvoted mark.** The proposed dark colours, and a 3 px border when upvoted in both
   modes (section 4).
4. **Wording**, approved in English and Romanian; the other 33 languages follow it.
   Spoken name: "Upvote. {count} vote" / "Upvote. {count} votes" — "Votați. {count} vot" /
   "Votați. {count} voturi" / "Votați. {count} de voturi". Signed-out line: "Sign in to upvote" /
   "Autentificați-vă pentru a vota". Failure line: "Your vote could not be saved. Try again." /
   "Votul dvs. nu a putut fi salvat. Încercați din nou." One spoken name; the browser announces whether it is
   pressed.

Builder's calls the owner can still correct: the rate limit (60 actions a minute per account), the short
count following the reader's decimal mark, no public list for visitors without a session, and building with
Node 26.9.0 on this machine (CI uses 26.8.2).

## 10. Left to the builder

The exact SQL text, test names, CSS class names and the order of small edits inside a task, within the
interfaces fixed in the plan.
