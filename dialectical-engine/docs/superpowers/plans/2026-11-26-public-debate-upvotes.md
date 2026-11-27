# Upvotes on Public Debates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in person can upvote any debate on the home page's Public debates tab, once per account and debate, take the upvote back, and see each public debate's count; a vote is personal data that leaves with its account, is in the account's export, and is named in the Privacy Policy and the Terms of Service.

**Architecture:** One row per account per debate in a new identity table (database step 0194); the count is computed when the list is read, so it cannot drift. All access goes through six `SECURITY DEFINER` functions: three on the request login under the caller's session, the count and a sweep on the API's system login, one for the export worker. Three always-mounted API routes sit behind one per-account flood brake; the home page reads "which of these have I upvoted" once on the server and hands each row to a small client button that wraps the unchanged row link.

**Tech Stack:** PostgreSQL (forward-only migration chain with manifests), TypeScript, Fastify API, zod contract and typed client, Next.js 15.5.29 with React (server page, one client component), vitest, embedded PostgreSQL for integration tests, pnpm, Node 26.

**Spec:** docs/superpowers/specs/2026-11-26-public-debate-upvotes-design.md

Each task is one file under `docs/superpowers/plans/2026-11-26-public-debate-upvotes/`. An implementer sees only its own task file and the design. This index is for the orchestrator and the reviewers.

## Global Constraints

- **Database step:** `0194_public_debate_upvotes.sql`, PREVIOUS `0193_google_return_connects_account.sql`, previous manifest sha256 `2c4c4072e7cba17fa505c875630d8f6ffdca75528cb224504e1f9b39fd23124c` (T01 recomputes it before writing the manifest). If another step lands on `dev` first, this one is renumbered and its manifest redone. The step was built as 0193 and became 0194 when `dev` took 0193 for a Google sign-in connecting to its account by itself (Task T18, take today's dev and renumber the upvote step to 0194).
- **Expand and optional:** the step is expand (additive only); the list's new field `vote_count` is optional. A newer page reads an older API (no count, no box). An older page does not read a newer API (the list schema is strict); it holds because each release's website reads its own release's API.
- **Access rule for person-linked tables:** no login holds any right on `identity.public_debate_upvote`. All access is through `SECURITY DEFINER` functions with `search_path = pg_catalog`; a function handed an owner first asks `identity.request_owner_matches`. No row security, no table grant, only the truncate guard.
- **The 404 face:** no such debate, not public, held, account not active, malformed id and an absent store all answer `404 { "error": "DEBATE_NOT_FOUND" }`, same status, body and headers. Answers are `no-store`.
- **Public now:** `core.run_is_published(core.run_of_publication(ref), ref)` (the list's rule) for cast and the count. **Gone for good:** `NOT core.publication_is_current(ref)` for the sweep, which ignores holds: a debate that is only held is never swept; one held and then made private is.
- **The box:** 54 × 58 px, 1.5 px ink border, 11 px radius, the card's fill, inside the row's card at its start edge; arrow 24 px filled `#4FA26B` with outline `--agree` (`#2F7A47`); count in ink, 14.5 px, weight 700; hover `--agree-bg` and the arrow lifts 2 px; focus is the site's 2 px ring.
- **Upvoted:** fill `#4FA26B`, border 3 px in both modes; light: border `#2F7A47`, arrow and number ink. Chamber: border and number `--ink` (`#EEF2F8`), fill `--core` (`#171E2B`), arrow `#4FA26B` with outline `--agree` (`#86B58D`), hover `--agree-bg` (`#1E2A22`); upvoted: fill `#4FA26B`, 3 px border `#86B58D`, arrow and number `#0E131D`.
- **Tokens:** `--vote` is `#4FA26B` in both modes; `--on-vote` is `#121826` in light and `#0E131D` in chamber. No colour literal outside the two token blocks.
- **Short count:** 999 → `999`, 1000 → `1k`, 1249 → `1.2k`, 12 345 → `12.3k`, 123 456 → `123k`, 1 234 567 → `1.2M`; never rounded up; the reader's decimal mark (`1,2k` in Romanian); Latin digits.
- **English strings (owner-approved):** `home.upvote.label.one` "Upvote. {count} vote", `home.upvote.label.other` "Upvote. {count} votes", `home.upvote.signedOut` "Sign in to upvote", `home.upvote.failed` "Your vote could not be saved. Try again."
- **Romanian strings (owner-approved):** label one "Votați. {count} vot", few "Votați. {count} voturi", other "Votați. {count} de voturi"; signedOut "Autentificați-vă pentru a vota"; failed "Votul dvs. nu a putut fi salvat. Încercați din nou." One spoken name; no `removeLabel` root. The other 33 languages follow these.
- **Rate limit:** 60 actions a minute per account for the three vote routes together (scope `publicVotes`, default in code, no sealed settings row edited), charged before the id is looked at. Never write the figure in a test, a list comment or a commit message: read it from the parsed policy.
- **Legal texts:** Privacy Policy 1.3 and Terms of Service 1.2, all 35 languages, new effective date; the re-acceptance floors stay `1.0`.
- **Environment prefix for every command:** `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools <command>`. The prefix covers one command: a pipe, a loop or `$(…)` goes inside `sh -c '…'`. One literal test path per vitest command. After a change under `packages/contract/src`: `pnpm run generate:contract`.
- **Baseline of the unit gate on this machine:** `CI_KNOWN_RED_GATE new=30 known=3 stale=0`; the 30 are three files that demand Node 26.8.2 exactly (this machine has 26.9.0). Compare failures by name. `pnpm run lint` exits 1 on the untouched tree and is not a judge. Typechecks are clean.
- **Only seen in CI:** the thirty Node-pin tests going green, the N-1 job (needs T02's set-aside entry), `registration-integration`, `pnpm audit`, gitleaks, CodeQL, and the list half of the limits check (whether a figure is refused).
- **Commits:** each task commits its own named paths (`git add` by path, never `-A` or `.`) to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree only; nothing is pushed. One plain sentence as the subject. The command ends with `-m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"`; a session whose instructions give another attribution line uses its own.
- **Shared working tree:** tasks that run at the same time either get a worktree each (merged in dependency order) or share this tree and run their typecheck, `generate:contract` and commit steps one at a time. Every `git status` and typecheck expectation in a task file means "nothing else of yours".
- **Known red between tasks, on purpose:** `tests/unit/s1-1-depth-contract.test.ts` (new shipped files, from the first of T01, T05, T07, T09, T11, T16 until T15); the inventory case of `tests/integration/identity-database.test.ts` and the census case of `tests/integration/security-review-hardening-database.test.ts` (from T01 until T02).

## Review Focus

Five conditions no test covered before review. Each now has a test in its owning task, written before the code it constrains.

1. **Back from a debate (T11, Step 2; code in Step 8).** A person upvotes a row, opens the debate through the row's link and presses Back; Next hands the page its kept payload. The row shows the vote as the person left it; a fresh load shows the server's values. Test: `tests/render/library-vote.test.tsx`, "coming back to the list with the props from before the vote shows the vote as the person left it". Looked at in a real browser in T17, Step 7.
2. **A session that ended on the server (T11, Step 2; code in Step 8).** The press is sent once, answers 401, state and count go back, and the one line is the sign-in link, not "Try again"; a second press sends nothing. Test: same file, "a session that ended on the server: …".
3. **A withdrawal answered 404 (T11, Step 2; code in Step 8).** The debate left the list while the page was open; the server deleted the row and answered 404. The box ends not upvoted and the next press asks to vote. Test: same file, "a withdrawal answered 404 …". The server side is T08, case 4.
4. **The website's own client against the real routes (T07, Step 2, case 12; code in Step 11).** `refs=a%2Cb` in one member, `PUT` with a JSON `{}` body, `DELETE` with no body and no content type, through the real handlers; a debate that is not public surfaces as `NOT_FOUND` with `serverCode` `DEBATE_NOT_FOUND`. Test: `tests/unit/public-vote-routes.test.ts`.
5. **A real vote row in the export (T06, Step 4; code in Steps 7 and 8).** The vote table, 0194's reader on the worker's login, `readRaw`, `collectSnapshot`, `account.json`: one entry per vote of that account, exactly `{ debate_reference, upvoted_at }` in UTC, nothing of another account. Test: `tests/integration/data-export-e2e.test.ts`, case `E16` (the file goes from 15 to 16 cases; T15 Step 12 runs it again).

## Interfaces

**Table** `identity.public_debate_upvote`: `publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref)` (no `ON DELETE`), `owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE`, `created_at timestamptz NOT NULL DEFAULT clock_timestamp()`, `PRIMARY KEY (publication_ref, owner_ref)`; index `public_debate_upvote_owner (owner_ref, created_at)`; truncate guard; owner = 0115's export owner; no privilege for any role.

**SQL functions** (all `SECURITY DEFINER`, `search_path = pg_catalog`; one `GRANT` line each, six in the file):

| Function | Returns | Raises | Granted to |
|---|---|---|---|
| `identity.cast_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid)` | `jsonb {outcome: "CAST" \| "ALREADY", upvotes: integer}` or `{outcome: "NOT_PUBLIC", upvotes: null}` | in order: `22023 PUBLIC_DEBATE_UPVOTE_INVALID` (null argument), `42501 REQUEST_OWNER_MISMATCH`, `22023 PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID` (account not active) | `debateai_billing_runtime` |
| `identity.withdraw_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid)` | `jsonb {outcome: "WITHDRAWN" \| "NONE", upvotes: integer, or null when the debate is not public now}`; deletes the row whatever the debate's state; no account check | the first two above | `debateai_billing_runtime` |
| `identity.read_own_public_debate_upvotes(p_owner_ref uuid, p_publication_refs uuid[])` | `uuid[]`, sorted, empty array when none, no public-now filter | `22023 PUBLIC_DEBATE_UPVOTE_INVALID` (null, or more than 100 refs), then `42501 REQUEST_OWNER_MISMATCH` | `debateai_billing_runtime` |
| `identity.read_public_debate_upvote_counts(p_publication_refs uuid[])` | `jsonb [{publication_ref, upvotes}]` ordered by ref, one entry per distinct asked ref that is public now (0 when no votes), `[]` otherwise | `22023 PUBLIC_DEBATE_UPVOTE_INVALID` (null, or more than 100) | `debateai_rls_all_accounts` |
| `identity.read_data_export_public_debate_upvotes(p_export_id uuid, p_worker uuid)` | `jsonb [{publication_ref, created_at}]` ordered by `created_at`, `publication_ref`; `[]` when none; whatever the debate's state | `P0001 DATA_EXPORT_LEASE_INVALID` without a live lease | `debateai_data_export_worker` |
| `identity.delete_gone_public_debate_upvotes(p_limit integer)` | `integer`, the rows deleted, at most `p_limit`; only votes whose page is no longer its debate's current publication; skips rows another transaction holds | `22023 PUBLIC_DEBATE_UPVOTE_INVALID` (null, or outside 1 to 1000) | `debateai_rls_all_accounts` |

**Step files:** `migrations/0194_public_debate_upvotes.sql`; manifest `migrations/lineage/public-debate-upvotes-forward0194.json` (version `public-debate-upvotes-forward0194-v1`, six keys, `amendsPostconditionsOf: []`); loader `loadForward0194` in `packages/db/src/migration-forward0194.ts` (refusal prefix `MIGRATION_FORWARD0194_`), last in `STEPS`; step refusals `PUBLIC_DEBATE_UPVOTES_OWNER_UNABLE` and `PUBLIC_DEBATE_UPVOTES_CONTRACT`.

**Database pins (T02):** four `privilegeDisclosures` entries with source `migrations/0194_public_debate_upvotes.sql`, in this order: `debateai_billing_runtime` (cast, withdraw, read_own), `debateai_rls_all_accounts` (counts), `debateai_data_export_worker` (export reader), `debateai_rls_all_accounts` (sweep); `ASKS_CONNECTION` gains the three billing-role signatures; the identity inventory gains `"public_debate_upvote"`; `tests/n1-baseline.json` `setAside` gains the released inventory test.

**Repositories** (`packages/db/src/public-debate-upvote.ts`, exported by `export * from "./public-debate-upvote.js";` in `packages/db/src/investigation-reports.ts`; never `packages/db/src/index.ts`, which is byte-pinned):

```ts
export class PostgresPublicDebateUpvoteRepository {            // T05; built on the request pool
  constructor(pool: Pool);
  cast(ownerRef: string, publicationRef: string): Promise<Readonly<{ outcome: "CAST" | "ALREADY" | "NOT_PUBLIC" | "ACCOUNT_INVALID"; upvotes: number | null }>>;
  withdraw(ownerRef: string, publicationRef: string): Promise<Readonly<{ outcome: "WITHDRAWN" | "NONE"; upvotes: number | null }>>;
  readOwn(ownerRef: string, publicationRefs: readonly string[]): Promise<readonly string[]>;   // [] without a query for an empty list
}
export type PublicDebateUpvoteCast; export type PublicDebateUpvoteWithdrawn;   // the two return shapes
export class PostgresPublicDebateUpvoteSweepRepository {       // T16; built on `pool` outside any request
  constructor(pool: Pick<Pool, "query">);
  deleteGone(limit: number): Promise<number>;   // SELECT identity.delete_gone_public_debate_upvotes($1::integer) AS deleted
}
```

`cast` answers `{ outcome: "ACCOUNT_INVALID", upvotes: null }` for the database error `PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID` or code `23503`; every other error is rethrown as it came.

`PostgresPublicationRepository.listPublicRefs(limit: number, offset: number): Promise<Readonly<{ refs: readonly string[]; total: number; upvotes: Readonly<Record<string, number>> }>>` (T05; the count read sits inside the existing `crossAccount("X10")` frame; `{}` for an empty page).

**Admission (T04):** scope `"publicVotes"` in `AdmissionScope`; `AdmissionPolicy.publicVotes: AdmissionScopePolicy<"owner">`, never null; register member `public_votes` (optional); non-exported `DEFAULT_PUBLIC_VOTES`; the bucket is always present, owner-keyed, not evicting. Tests read it as `admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef).publicVotes`.

**API ports (T07, `apps/api/src/public-vote.ts`):** `export type PublicVotePorts = Readonly<{ repository: Pick<PostgresPublicDebateUpvoteRepository, "cast" | "withdraw" | "readOwn"> }>`; `export function ownVoteRefsOf(raw: unknown): readonly string[] | null` (one string of 1 to 100 comma-separated uuids; lower-cased, each once, first-seen order, frozen; null otherwise). `ApiOptions.publicVotes?: PublicVotePorts`. `main.ts`: `const publicDebateUpvoteRepository = new PostgresPublicDebateUpvoteRepository(pool);`, once.

**Routes (T07; always mounted; all three need a session; the two writes need the CSRF pair; all charge `"publicVotes"` with the session's `ownerRef`):**

| Route (policy row: `auth: "user"`, `resource: "public-debate"`) | action | 200 | Other answers |
|---|---|---|---|
| `PUT /v1/public/debates/{id}/vote` | `vote` | `{ voted: true, vote_count }` | 404 `{ error: "DEBATE_NOT_FOUND" }`; 400 `{ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" }` for a body other than absent or `{}` (checked before the charge); 429 `{ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" }` with `retry-after`; 401 `{ error: "SESSION_REQUIRED" }`; 403 `{ error: "CSRF_VALIDATION_FAILED" }` |
| `DELETE /v1/public/debates/{id}/vote` | `withdraw-vote` | `{ voted: false, vote_count }` | 404 (also when the row was deleted but the debate is not public now), 429, 401, 403 |
| `GET /v1/account/public-debate-votes?refs=` | `read-own-votes` | `{ voted: uuid[] }` (`{ voted: [] }` with no store) | 400 for missing, repeated, empty, over-100 or non-uuid refs; 429; 401 |

The three rows follow the flag row in the policy table, in `contractInventory.routes` (220 → 223 in three tests) and in the test matrix. `GET /v1/public/debates` items gain `vote_count` (`page.upvotes?.[publicationRef] ?? 0`); the list stays anonymous and the same for every caller.

**Contract (T03, `@debateai/contract`):** `PublicVoteRequestSchema = z.object({}).strict()`; `PublicVoteAnswerSchema = z.object({ voted: z.boolean(), vote_count: z.number().int().nonnegative() }).strict()` and `type PublicVoteAnswer`; `OwnPublicVotesSchema = z.object({ voted: z.array(z.uuid()).max(100) }).strict()` and `type OwnPublicVotes`; `PublicDebateSummarySchema` gains its last key `vote_count: z.number().int().nonnegative().optional()`.

**Client methods (T03):** `readPublicDebates(limit: number, offset: number): Promise<PublicDebateList>`; `castPublicVote(publicationRef: string): Promise<PublicVoteAnswer>` (PUT, body `{}`); `withdrawPublicVote(publicationRef: string): Promise<PublicVoteAnswer>` (DELETE, no body); `readOwnPublicVotes(publicationRefs: readonly string[]): Promise<OwnPublicVotes>` (GET, all refs in one `refs` member, comma-joined). Refusals throw `ContractHttpError` (`status`, `code`, `serverCode`).

**Export (T06):** `WORKER_FUNCTIONS` gains `"identity.read_data_export_public_debate_upvotes(uuid,uuid)"` (26 functions); raw section `"public_debate_upvotes"` (last in `RAW_SECTIONS`), `KEEP_COLUMNS.public_debate_upvotes = ["publication_ref", "created_at"]`; `account.json` gains its last key `debates_you_upvoted: [{ debate_reference, upvoted_at }]`; the README sentence "It also holds the public debates you upvoted, and when."

**Sweep (T16):** `apps/api/src/public-vote-sweep.ts`: `export async function sweepGonePublicDebateUpvotes(deps: Readonly<{ repository: Pick<PostgresPublicDebateUpvoteSweepRepository, "deleteGone">; log: (line: string) => void }>): Promise<number>` (batches of 500, at most 20 a pass). It runs first, in its own `try`, inside the existing hourly trigger `triggerAskClarifyReservationSweep`; no new timer, no cross-account site. Journal lines `{"event":"public_debate_upvote.gone_deleted","deleted":<n>}` and `[PUBLIC_DEBATE_UPVOTE_SWEEP_PENDING]`.

**Translation keys (T09, namespace `home`, all 35 `apps/ui/messages/<locale>/home.json`):** `home.upvote.label.<each language's CLDR plural categories>` (read with `tPlural(catalog, "home.upvote.label", count, locale)`), `home.upvote.signedOut`, `home.upvote.failed`.

**Words module (T09, `apps/ui/lib/upvoteWords.ts`, not a client file):** `upvoteMessageCatalog(catalog: MessageCatalog): MessageCatalog` (the frozen `home.upvote.*` entries); `shortVoteCount(locale: string, count: number): string`.

**Button (T11, `apps/ui/components/LibraryVote.tsx`, `"use client"`, one export):**

```tsx
export function LibraryVote(props: Readonly<{
  publicRef: string; initialCount: number; initialVoted: boolean; signedIn: boolean; signInHref: string;
  catalog: MessageCatalog; locale: string; describedBy?: string;
  send?: (publicRef: string, vote: boolean) => Promise<PublicVoteAnswer>; children: ReactNode;
}>)
```

DOM: `div.libVoteRow > [ button.libVote[type=button][data-library-vote][aria-pressed][aria-label][aria-describedby?] > svg.libVoteArrow + span.libVoteCount ] + {children} + p.libVoteNote[role=status]` (the paragraph only while there is a line). Never disabled; never inside an anchor.

**Row and page (T12):** `PublicDebatesBuffer` gains `votes?: Readonly<{ signedIn: boolean; voted: ReadonlySet<string>; signInHref: string }>`; `LibraryRow` gains `claimId?: string` (the id `lib-claim-<public_ref>`); a row is boxed when `votes` is given and `debate.vote_count !== undefined`; `page.tsx` hands `votes={{ signedIn: sessionConfirmed, voted, signInHref: signInHref("/?tab=public") }}`.

**Tokens and classes (T10, `apps/ui/app/globals.css`):** `--vote`, `--on-vote`; `.libVoteRow`, `.libVote`, `.libVoteArrow`, `.libVoteCount`, `.libVoteNote`; the exact line `.libVoteRow > .libRow:hover { transform: none; }`.

**Mock (T13, `tools/v4-mock-api/public-votes.ts`):** `publicList`, `routePublicVotes`, `publicVoteSamples`, `publicVoteCounters`, `setPublicVotesLogging`; five seeded public rows whose boxes read `12.3k`, `1.2k` (already upvoted), `999`, `0`, `7`.

**Amendments to the interface fixed before review** (decided by the fixer; reviewers should not flag them):

1. Six SQL functions and six `GRANT` lines, not five: the sweep was decided after the interface was fixed. Four disclosure entries, not three.
2. T11: when a send throws and the browser then holds no session, the line is the sign-in link, not the failure line.
3. T11: a withdrawal answered 404 ends not upvoted with no line; a cast answered 404 goes back with the failure line.
4. T11: the box remembers the server's last answer per `publicRef` in module scope and starts from it when the row mounts with the same props it was seeded from (the cure for Back). Written from the press handler only.
5. T11: each line is also said through `announce()` (`apps/ui/components/Toast.tsx`).
6. T12: `upvoteWords` is computed once outside the map and only when `votes` is given.
7. T12: the page asks `readOwnPublicVotes` only about rows whose `vote_count` is present, and makes no call when there is none.
8. T07: `ownVoteRefsOf` is an added export; refs are lower-cased; a JSON `null` body is a 400; the PUT body is checked before the charge.
9. T07, decided behaviour: the vote routes do not look at the public-read restore hold; an unmapped database refusal (`42501 REQUEST_OWNER_MISMATCH` in a race) is the API's general 500.
10. "Sign in to upvote" (the owner's wording) replaces the earlier draft "Log in to upvote".

## Tasks

| id | Title | Depends on | File under `2026-11-26-public-debate-upvotes/` | May run alongside |
|---|---|---|---|---|
| T01 | Database step 0194, built as 0193 (the vote table, six functions, the step's files) | none (T00, `dev` with 0192, is this tree) | `T01-database-step-0193.md` | T03, T04, T09, T10 |
| T02 | Database pins and behaviour test for step 0194, built as 0193 | T01 | `T02-database-pins-and-behaviour.md` | T03, T04, T05, T06, T09, T10 |
| T03 | Contract shapes and client methods | none | `T03-contract-and-client.md` | T01, T04, T09, T10 |
| T04 | The `publicVotes` admission budget | none | `T04-vote-rate-limit.md` | T01, T03, T09, T10 |
| T05 | Db repository and the count in `listPublicRefs` | T01 | `T05-db-repository-and-list-count.md` | T02, T06 |
| T06 | The account export holds the debates the person upvoted | T01; the owner's yes to the README sentence before its Step 9 | `T06-data-export.md` | T02, T05 |
| T07 | The three vote routes, policy rows, route list, wiring, `vote_count` in the list | T03, T04, T05 | `T07-api-routes.md` | T11 (never T16) |
| T08 | End-to-end flow on a real database | T02, T07 | `T08-end-to-end-flow.md` | T12, T13, T16 |
| T09 | Words in 35 languages and the words module | none | `T09-words-35-languages.md` | T01, T03, T04, T10 |
| T10 | Tokens and vote styles | none | `T10-tokens-and-styles.md` | T01, T03, T04, T09 |
| T11 | The vote button (`LibraryVote`) and its render test | T03, T09 | `T11-vote-button.md` | T07 |
| T12 | Rows and home page wiring | T03, T09, T10, T11 | `T12-row-and-page-wiring.md` | T08, T13, T16 |
| T13 | The mock API serves counts and the three vote routes | T03, T07 | `T13-mock-api.md` | T08, T12, T16 |
| T14 | Privacy Policy 1.3 and Terms of Service 1.2, 35 languages | T06, T09, T12, T16; the owner's approval before its Step 5 | `T14-legal-texts.md` | T08, T13 |
| T15 | Closing registrations and the full gates | every other task committed, and T17's report | `T15-closing-and-gates.md` | none (last, alone) |
| T16 | The sweep that deletes the upvotes of a debate gone for good | T01, T05, T07 | `T16-gone-debate-sweep.md` | T08, T12, T13 |
| T17 | Build the website and look at the vote box in a browser (no commit) | T10, T11, T12, T13 | `T17-build-and-look.md` | none in a shared tree |

## Build order

Before any task. T00 is already true: this tree holds `dev` at `c946564be` with step 0192. The orchestrator gets the owner's answer on three things, in one round: T06's README sentence; T14's seven English passages; and T14's fourth open question (taking an upvote back when its debate is no longer on the list: keep the passages and accept a follow-up slice, or use the reworded drafts in T14 Step 6). It may also run the integration gate once on the untouched tree, so T15 has a baseline: `CI_TEST_FILES_SIDE_BY_SIDE=1 pnpm run test:ci-integration` with the prefix.

1. **Group 1, at the same time:** T01, T03, T04, T09, T10.
2. **Group 2, each after T01, at the same time and beside what is left of group 1:** T02, T05, T06. (T06 stops before its Step 9 until the owner's yes.)
3. **Group 3, at the same time:** T07 (after T03, T04, T05) and T11 (after T03, T09).
4. **Group 4, at the same time:** T16 (after T05 and T07), T08 (after T02 and T07), T12 (after T10 and T11), T13 (after T03 and T07).
5. **T14** (after T06, T09, T12, T16 and the owner's approval). It may overlap T08 and T13.
6. **T17** (after T10, T11, T12, T13): the build and the look. Alone in its tree while the development website runs.
7. **T15**, last and alone, after every other task is committed and T17 has reported.

Tasks that share a hot file never run together:

| Hot file | Editors, in order |
|---|---|
| `apps/api/src/main.ts` | T07, then T16 |
| `packages/contract/src/index.ts` | T03, then T07 |
| `packages/db/src/public-debate-upvote.ts` and `tests/integration/public-debate-upvotes-repository.test.ts` | T05, then T16 |
| `tests/architecture/investigation-reports-0136-contract.test.ts` | T06 edits it; T05 only runs it |
| `apps/api/src/index.ts`, `tests/unit/s7-authorization.test.ts` | T07 alone |
| `apps/ui/app/globals.css` | T10 alone |
| the 35 `apps/ui/messages/<locale>/home.json` | T09 alone |
| `tests/support/shipped-corpus.manifest.txt`, `tests/ci-integration-auth.txt` | T15 alone |
| `apps/api/src/data-export/readme.ts` (shared sentence with T14's passage (d)) | T06; a change of the sentence at T14's gate is a named follow-up to T06 |
| `packages/contract/generated/` (ignored; rewritten by `generate:contract`) | T02, T03, T07, T08, T11, T12, T13, T14, T15, T17: one at a time in a shared tree |

For every group: tasks that run at the same time each need their own worktree, or must run their typecheck, `generate:contract` and commit steps one at a time in the shared tree.

For the orchestrator, outside the plan folder: the design document still names one plan file (section 8), says "A debate under a staff hold is never swept" (section 5; the rule is "a debate that is only held"), and gives "its owner unpublished it" as a way a debate is gone (no route lets an owner do that; "made private again"). The fixer may not edit it.

## Verification at the end

T17 and T15 hold the full text of every command. This is the recipe and what this machine should show. `<prefix>` is the environment prefix of Global Constraints.

| # | Command | Expected on this machine |
|---|---|---|
| 1 | T17 Step 2: `<prefix> pnpm --filter dialectical-engine-v2ui build` | exit 0. Not run while the plan was written; a stop on a missing release setting, not on a file of this slice, is reported as it is |
| 2 | T17 Steps 3 to 8: the website against the mock on `/?tab=public` | five boxes `12.3k`, `1.2k` (upvoted), `999`, `0`, `7`; the look matches design §4 in light and chamber, English and Arabic, 1000px and 375px, with focus and with reduced motion; Back shows the vote; the two lines appear as designed. Screenshots in `${TMPDIR:-/tmp}/upvotes-look/` for the owner |
| 3 | `<prefix> git status --short --untracked-files=all -- packages apps web tests migrations tools` | no output (every task committed; T17 cleaned up) |
| 4 | `<prefix> pnpm run generate:contract`, then `<prefix> pnpm run typecheck`, then `<prefix> pnpm --filter dialectical-engine-v2ui typecheck` | each exit 0, no `error TS` line |
| 5 | `<prefix> pnpm run generate:legal:check`, then `<prefix> pnpm run legal:release-check` | exit 0; every line `: up to date`; `Legal texts: ready for release. …` |
| 6 | `<prefix> pnpm exec vitest run tests/architecture/public-debate-upvotes-closing.test.ts` | `Tests  4 passed (4)` |
| 7 | `<prefix> pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` | `Tests  1011 passed (1011)` (the six shipped files are listed) |
| 8 | The unit gate (CI job `verify-tests`): the two commands of T15 Step 10 (`pnpm run test:ci-gate` with `CI_TEST_FILES_SIDE_BY_SIDE=1`, its log in `${TMPDIR:-/tmp}/upvotes-unit-gate.log`, then the filter for names outside the three Node-pin files). About 7 minutes | `exit=1`, `CI_KNOWN_RED_GATE new=30 known=3 stale=0`; every NEW name is in the three Node-pin files (the second command prints `foreign=1` and nothing before it). From 2 December 2026 (UTC) expect `new=31`: one dated red in `dependency-floors.test.ts`, not this slice's |
| 9 | The integration gate (CI job `auth-integration`): the command of T15 Step 11 (`pnpm run test:ci-integration` with `CI_TEST_FILES_SIDE_BY_SIDE=1`, its log in `${TMPDIR:-/tmp}/upvotes-integration-gate.log`). Up to 30 minutes | `exit=0`, `CI_GATE_SCOPE files=87 tests=<n>`, `CI_KNOWN_RED_GATE new=0 known=0 stale=0`. No baseline of this gate was taken on this machine unless the orchestrator took one first; T15 Step 11 says how to judge anything else |
| 10 | The five database suites no CI job runs (T15 Step 12): `s8-publication-database`, `rls-readers`, `migration-per-step`, `data-export-database`, `data-export-e2e` | each `Test Files  1 passed (1)`; `data-export-e2e` shows 16 tests |
| 11 | What the slice must not have touched (T15 Step 13) | only `-- migrations` and the three paths `migrations/0194_public_debate_upvotes.sql`, `migrations/lineage/README.md`, `migrations/lineage/public-debate-upvotes-forward0194.json` (T15 Step 13's own block still prints the 0193 names it was written with) |
| 12 | `<prefix> sh -c 'node tools/limits-check.mjs --base "$(git merge-base HEAD origin/dev)"; echo "exit=$?"'` | `LIMITS_CHECK_NO_LIST: …`, `LIMITS_CHECK_OK <n> added line(s) read.`, `exit=0` (the shape half only; the list is a CI secret) |
| 13 | `<prefix> git status --short` | nothing, or only the `??` lines of the plan and the design under `docs/superpowers/` |

The new and moved test files, each green when run alone with `<prefix> pnpm exec vitest run <path>`:

| File | Task | Expected |
|---|---|---|
| `tests/architecture/public-debate-upvotes-0194-contract.test.ts` | T01, T18 | `Tests  11 passed (11)` |
| `tests/architecture/migration-forward-chain.test.ts` | T01, T18 | `Tests  70 passed (70)` (69 before dev's 0193 came in) |
| `tests/integration/public-debate-upvotes-0194.test.ts` | T02, T18 | `Tests  12 passed (12)` |
| `tests/architecture/p3-production-database-principals.test.ts` | T02 | `Tests  28 passed (28)` |
| `tests/unit/public-votes-contract.test.ts` | T03 | `Tests  8 passed (8)` |
| `tests/unit/public-vote-budget.test.ts` | T04 | `Tests  7 passed (7)` |
| `tests/integration/public-debate-upvotes-repository.test.ts` | T05, T16 | `Tests  13 passed (13)` (11 after T05) |
| `tests/unit/public-debate-upvotes-export.test.ts` | T06 | `Tests  7 passed (7)` |
| `tests/integration/data-export-e2e.test.ts` | T06 | `Tests  16 passed (16)` |
| `tests/unit/public-vote-routes.test.ts` | T07 | `Tests  12 passed (12)` |
| `tests/unit/s7-authorization.test.ts` | T07 | `Tests  38 passed (38)` |
| `tests/integration/public-vote-flow.test.ts` | T08 | `Tests  7 passed (7)` |
| `tests/unit/public-upvote-words.test.ts` | T09 | `Tests  8 passed (8)` |
| `tests/render/library-vote-css.test.ts` | T10 | `Tests  14 passed (14)` |
| `tests/unit/t9-mode-tokens.test.ts` | T10 | `Tests  9 passed (9)` |
| `tests/render/library-vote.test.tsx` | T11 | `Tests  28 passed (28)` |
| `tests/render/t3-library.test.tsx` | T12 | `Tests  21 passed (21)` |
| `tests/render/locale-leftovers.test.tsx` | T12 | `Tests  7 passed (7)` |
| `tests/unit/v4-mock-public-votes.test.ts` | T13 | `Tests  10 passed (10)` |
| `tests/unit/legal-public-debate-upvotes.test.ts` | T14 | 70 cases, all passed |
| `tests/unit/public-vote-sweep.test.ts` | T16 | `Tests  7 passed (7)` |
| `tests/architecture/public-debate-upvotes-closing.test.ts` | T15 | `Tests  4 passed (4)` |

What only the pull request can show is listed word for word in T15 Step 16 (the Node-pin tests, the N-1 job, `registration-integration`, `pnpm audit`, gitleaks, CodeQL, the list half of the limits check, and the dated dependency exception).
