# Moderation notices: the seven gaps M1–M7 (after 0157) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven gaps left by migration 0157 (PR #246): every statement of reasons and every answer to a reporter is sent, survives a mail outage, never contradicts itself, says when an AI read the report first, reaches every affected person at the final decision, and names the law when the ground is "illegal".

**Architecture:** One new forward step, **0172, `-- n1: drained`**, that redefines 0157's queue, claim, complete and read functions in place (as 0171 did for earlier steps, declared in `amendsPostconditionsOf`), adds two nullable columns, one small table, and widens two kind CHECKs. The API's two mail reconcilers are isolated from each other and from a bad row. Reporter mails gain one optional sentence; statements gain two kinds and a law reference. No change to what 0150/0151 keep, and no new mail purpose.

**Tech Stack:** TypeScript (Node, ESM), PostgreSQL via `pg`, vitest (embedded Postgres in integration tests), Next.js UI, pnpm workspace under `dialectical-engine/`.

**Spec:** the M1–M7 list (owner, 10 November 2026) and its analysis in this session; the 0157 design it amends is the leading comment of `migrations/0157_moderation_statements.sql` and the commit messages of PR #246 (slices 1–5). Go-live row 77 (`docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md`) holds the open legal points.

## Owner decisions this plan assumes (confirm or change before Task 1)

| # | Gap | Default in this plan | Alternative |
|---|---|---|---|
| A | all | 0172 is a **drained** step (uploaded with no debate waiting or running), so it may redefine 0157's functions and swap two CHECKs. Fine before real users. | Expand-only: every changed function gets a new name and the API switches to it; roughly twice the SQL. |
| B | M2 | A failed send waits `min(2^attempts minutes, 6 hours)`; the 20 tries 0157 allows then span about **3 days**. On the last failure the owner and team-limit holders get a staff alert `MODERATION_MAIL_FAILED`. | A longer window, or a log marker only. |
| C | M4, M6 | A person's review step or DECIDE whose ground names a report (source `REPORT_BUTTON`) **closes that report as ACTED** in the same transaction. The reporter gets at most one decision mail per decision: "no breach" is never sent after "acted"; "acted" may follow an earlier "no breach" (a later, real decision). | Leave reports open and only guard the mail. |
| D | M3 | At DECIDE, everyone who got a `CONTRIBUTION_AFFECTED` / `REPORT_AFFECTED` statement for that hide gets a final statement, new kinds `CONTRIBUTION_DECIDED` / `REPORT_DECIDED`, one per person, listing their pieces in `places`. | Reuse `DEBATE_DECIDED` with different copy. |
| E | M7 | Staff type the law as **free text, 3–200 characters**, required whenever `ILLEGAL` is among the grounds (a removal, hidden report, DECIDE; a hide that names `ILLEGAL` as suspected keeps its hold). Stored in plain text (it is a reference, not facts), **bound into the passkey proof** as `law`, kept as long as the statement (not deleted with the facts at 12 months), shown on Settings > Moderation notices and in the export. The mail keeps its existing line "The full statement names the law." | A fixed list of laws; or the law sealed inside the facts. |
| F | M1 | Receipt: new sentence "An automatic check read your report first and passed it to a person." Decisions: reuse the translated `mail.statement.automatedDetection` ("An AI read the report first. A person made this decision."). Shown only when the check produced a verdict. | — |

## Global Constraints

- Paths are relative to `dialectical-engine/` unless they start with `/`. Work in the worktree `.worktrees/moderation-m1-m7` on branch `fix/2026-11-10-moderation-notices-m1-m7`, cut from `origin/feat/2026-10-28-v4-initial` at `6cfe68b1f`. The PR goes into `feat/2026-10-28-v4-initial`.
- **One migration step, 0172**, built the way `migrations/lineage/README.md` says (items 1–7): `migrations/0172_moderation_notice_fixes.sql`, `migrations/lineage/moderation-notice-fixes-forward0172.json` (`previous` = 0171, `security-review-hardening-forward0171.json`, verifier `verify-effective-capabilities-130.sql`), `packages/db/src/migration-forward0172.ts` (`loadForward0172`, refusals prefixed `MIGRATION_FORWARD0172_`), appended **last** to `STEPS` in `packages/db/src/migration-forward-chain.ts`, and a README section "the moderation notice fixes (0172)" in the README's own style. Header lines `-- n1: drained` and `-- n1: keeps-verifier` (no billing object). Each task appends its own section to the SQL file and recomputes `migration.sha256` with the one-liner at the end of the lineage README. If another branch takes 0172 first, renumber everything that carries the number.
- 0172 never edits an earlier migration file. Functions it redefines keep their exact signatures; `amendsPostconditionsOf` lists each one under `0157_moderation_statements.sql` (`function_definition`), plus the two CHECKs it swaps (`moderation_statement_kind_check` of 0157, the kind CHECK of 0151's `staff.public_flag_notice`). A changed staff signature (Task 6) is a **new overload**; the old one keeps existing (0157's postcondition digests it) and loses its grant to `debateai_runtime`.
- Every new or redefined function: `SECURITY DEFINER SET search_path=pg_catalog`, the owner 0157 gave its neighbour, grants as 0157's, and `docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json` updated with `tests/architecture/p3-production-database-principals.test.ts` green.
- Mail stays content-free: flags, dates and links only. No words of a report, debate, facts or law in any mail. Reply-To office@ on decisions, none on the receipt, as 0157.
- Person-facing copy in **all 35 locales** (`packages/mail-templates/messages/<locale>/mail.json`, `apps/ui/messages/<locale>/settings.json`); staff copy in `en` and `ro` only (`apps/ui/messages/{en,ro}/staff.json`). Translation is a mechanical fan-out after the English is final: 3–4 parallel `model: "haiku"` subagents by language group, then one `model: "opus"` spot-check of mt, ga, et, lv, lt, ar, he, hi, ja, zh, ko and formal Romanian. Translations are AI drafts (go-live row 36).
- New integration test files are added to `tests/ci-integration-all.txt`.
- Match the surrounding code: dense comments that cite the gap (`M5 (owner, 10 Nov 2026)`), `Object.freeze`, `Readonly<…>`, fixed refusal codes.
- Machine: one heavy command at a time (one integration file, typecheck, or one unit folder); never the whole suite locally, CI is the judge.
- Commits: one per task (fix-ups allowed), message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push only when the owner says so.

## Review Focus

1. **A mail outage or the outbound-mail limit's "all stopped" lasting hours**: a statement must still be sent when it ends, inside the ~3-day window, and only one alert per given-up mail. Task 2 tests a send that fails 19 times, then succeeds.
2. **A review step that names a report already closed** (by a person's "no breach", or by an earlier step): the step must still succeed (a hide can never be refused), the report must not be closed twice, and the reporter gets no "no breach" after "acted". Task 3 tests both orders.
3. **A bad source row that keeps failing** (for example a `REMOVE_DIG` whose contribution row is gone): every other statement and every reporter answer still goes, the bad one is retried hourly and alerted once. Task 1 tests it.
4. **A contributor whose dig left with the debate, then whose account was erased before DECIDE**: no final statement, no error (D8). A contributor told at the hide and again at DECIDE gets exactly one final statement even with several pieces. Task 4 tests both.
5. **The release before, still running the old reconcilers for a moment after the upload** (drained, so only the timer): the redefined claim and complete keep their signatures and results, so an old sender still works. Task 2's contract test pins the signatures.

---

### Task 1: One bad row never stops the mail queue (M5), and the 0172 step itself

**Files:**
- Create: `migrations/0172_moderation_notice_fixes.sql` (header, the M5 section, the closing contract block), `migrations/lineage/moderation-notice-fixes-forward0172.json`, `packages/db/src/migration-forward0172.ts`
- Modify: `packages/db/src/migration-forward-chain.ts` (append to `STEPS`), `migrations/lineage/README.md` (intro chain sentence: "…and the moderation notice fixes (0172, below) the sixty-second"; new section)
- Modify: `apps/api/src/moderation-statements.ts:54-61, 104-111` (`reconcile` in both classes), `apps/api/src/main.ts` (the `moderationNoticesTimer` body, near line 1405)
- Test: `tests/integration/moderation-notice-fixes-0172.test.ts` (new; add to `tests/ci-integration-all.txt`), `tests/architecture/moderation-notice-fixes-0172-contract.test.ts` (new), `tests/unit/moderation-notices.test.ts`, `tests/architecture/migration-forward-chain.test.ts` (chain lists)

**Interfaces:**
- Produces table `identity.moderation_statement_stuck (source_id uuid PRIMARY KEY, sqlstate text NOT NULL, first_failed_at timestamptz NOT NULL, last_failed_at timestamptz NOT NULL, tries integer NOT NULL)`, no grants to any login role; truncate guard as 0157's tables.
- Redefines `identity.queue_moderation_statements() RETURNS integer`: each source row (log event or decision) is handled in its own `BEGIN … EXCEPTION WHEN OTHERS` block; on error the row's work rolls back, the stuck row is inserted or its `tries`/`last_failed_at` bumped, and on its first failure `staff.queue_public_flag_notices(source_id, 'MODERATION_MAIL_FAILED')` is called. Both loops skip sources in the stuck table whose `last_failed_at` is less than 1 hour ago. A stuck source that later succeeds deletes its stuck row.
- Swaps the kind CHECK of `staff.public_flag_notice` to `('PUBLIC_FLAG_HIDDEN','PUBLIC_FLAG_WAITING','MODERATION_MAIL_FAILED')`; adds the staff alert template for `MODERATION_MAIL_FAILED` beside `PUBLIC_FLAG_WAITING` in `packages/mail-templates/src/templates.ts` and `apps/api/src/mail-channel.ts` (same catalogue and locales as `PUBLIC_FLAG_WAITING`; text: "A moderation email could not be created or sent. Look at the moderation mail queue." No ids in the body). Task 2 reuses this kind.
- `reconcile()` in both reconcilers: `complete()` for each claim runs in its own `try`; a throw logs `[MODERATION_STATEMENT_COMPLETE_FAILED]` / `[PUBLIC_FLAG_ANSWER_COMPLETE_FAILED]` and the loop goes on.
- The timer runs `moderationStatements.reconcile(100)` and `publicFlagAnswers.reconcile(100)` each in its own `try`, logging `[MODERATION_STATEMENT_PENDING]` / `[PUBLIC_FLAG_ANSWER_PENDING]`; one failing never skips the other.

- [ ] **Step 1: Write the failing integration tests** in `tests/integration/moderation-notice-fixes-0172.test.ts` (embedded Postgres, migrated through 0172; seed helpers as in the 0157 cases of `tests/integration/public-tree-flow.test.ts`):
  - `a source row that raises is set aside and the others are queued`: seed two HIDE events, make the first raise (point `identity.moderation_debate_owner` at a publication whose snapshot row is gone, or seed a `REMOVE_DIG` with no `public_contribution`); `SELECT identity.claim_moderation_statements(100)` returns the second event's statements; `moderation_statement_stuck` has exactly the first `source_id` with `tries = 1`; `staff.public_flag_notice` has one `MODERATION_MAIL_FAILED` row per active owner/holder.
  - `a stuck source is retried after an hour and alerted once`: move `last_failed_at` back 61 minutes, fail again: `tries = 2`, still one alert row; fix the data, move it back again: the statement is queued and the stuck row is gone.
- [ ] **Step 2: Write the failing unit tests** in `tests/unit/moderation-notices.test.ts`: `complete throwing for one claim does not stop the batch` (three claims, `complete` throws on the second: `sendTemplated` called 3 times, `complete` called 3 times); same for `PublicFlagAnswerReconciler`.
- [ ] **Step 3: Run them and see them fail**: `pnpm vitest run tests/integration/moderation-notice-fixes-0172.test.ts`, then `pnpm vitest run tests/unit/moderation-notices.test.ts`. Expected: FAIL (no 0172; batch stops at the throw).
- [ ] **Step 4: Build the 0172 step** (files above) with the M5 section; the closing contract block checks the stuck table, the redefined function's body hash and the widened CHECK. Then the reconciler and timer changes.
- [ ] **Step 5: Write the contract test** `tests/architecture/moderation-notice-fixes-0172-contract.test.ts` in the style of `moderation-statements-0157-contract.test.ts`: header lines, `amendsPostconditionsOf` entries, the step last in `STEPS`, no edit to any file of 0150/0151/0156/0157.
- [ ] **Step 6: Run** the two new files, `tests/unit/moderation-notices.test.ts`, `tests/architecture/migration-forward-chain.test.ts`, `tests/integration/migration-per-step.test.ts`, `tests/integration/forward-chain-replay-verifiers.test.ts`, one at a time. Expected: PASS.
- [ ] **Step 7: Commit** `fix(moderation): one bad row never stops the moderation mail (M5; 0172 step 1)`.

### Task 2: Retries back off over about three days, then alert (M2)

**Files:**
- Modify: `migrations/0172_moderation_notice_fixes.sql` (M2 section), manifest digest
- Test: `tests/integration/moderation-notice-fixes-0172.test.ts`, `tests/architecture/moderation-notice-fixes-0172-contract.test.ts`

**Interfaces:**
- Consumes: Task 1's `MODERATION_MAIL_FAILED` alert kind.
- Adds `next_attempt_at timestamptz` (nullable, no default) to `identity.moderation_statement` and `identity.public_flag_mail`.
- Redefines, same signatures and results: `identity.claim_moderation_statements(integer)` and `identity.claim_public_flag_mail(integer)` also require `next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp()`; `identity.complete_moderation_statement(uuid,uuid,text)` and `identity.complete_public_flag_mail(uuid,uuid,text)` on `RETRY` set `next_attempt_at = clock_timestamp() + least(interval '1 minute' * power(2, attempts_before), interval '6 hours')`; when a `RETRY` sets `failed_at` (the 20th try) they call `staff.queue_public_flag_notices(<statement_id or mail_id>, 'MODERATION_MAIL_FAILED')`. `DROPPED` never alerts (no address is by design, D8). The `attempts` CHECK (0–20) is unchanged.

- [ ] **Step 1: Write the failing tests**:
  - `a failed send waits before its next try`: claim, complete `RETRY` → immediately claiming again returns nothing; after `next_attempt_at` is moved into the past it is claimable. The waits after tries 1, 2, 3 are 1, 2, 4 minutes (± 1 s); after try 10 it is 6 hours.
  - `the 20th failure gives up once and alerts once`: drive one statement through 20 `RETRY`s (moving `next_attempt_at` back each time): `failed_at` set, one `MODERATION_MAIL_FAILED` row per recipient keyed by the statement id; a 19-failure statement that then gets `SENT` has `delivered_at` and no alert. The same two cases for `public_flag_mail`.
  - Contract: the four functions keep their 0157 signatures and return types (Review Focus 5).
- [ ] **Step 2: Run, see FAIL** (claimable at once; no alert).
- [ ] **Step 3: Write the M2 section**, recompute the digest.
- [ ] **Step 4: Run** the integration and contract files. Expected: PASS.
- [ ] **Step 5: Commit** `fix(moderation): a failed moderation mail backs off over three days, then alerts the team (M2)`.

### Task 3: A review step that acts on a report closes it, and the reporter hears one decision (M6, M4)

**Files:**
- Modify: `migrations/0172_moderation_notice_fixes.sql` (M4/M6 section), manifest digest
- Modify: `apps/ui/components/PublicReviewPanel.tsx` (a report closed by a step shows "Closed: we acted on it (review step)"; no Close buttons on it), `apps/ui/messages/{en,ro}/staff.json` (`staff.publicReports.closedByStep`)
- Test: `tests/integration/moderation-notice-fixes-0172.test.ts`, `tests/render/public-review-panel.test.tsx`

**Interfaces:**
- Produces `identity.close_public_flag_by_review(p_flag_id uuid, p_actor uuid, p_source_id uuid) RETURNS void`, which **never raises**: if the report is not dismissed, it calls 0151's `identity.public_flag_dismiss(p_flag_id, p_actor, <operation>, <sha>)` and inserts `identity.public_flag_answer (outcome 'ACTED')`, where `<operation>` is a uuid derived from `p_source_id` (`md5('review-close:' || p_source_id)::uuid`) so it can never collide with a step's own operation id, and `<sha>` is `encode(sha256(convert_to('review-close:' || p_source_id, 'UTF8')), 'hex')`. Already dismissed: nothing. Any error: swallowed and logged with `RAISE WARNING 'PUBLIC_FLAG_REVIEW_CLOSE_SKIPPED'`.
- Redefines (same signatures) `identity.record_hide_ground`, `identity.record_step_ground` and `identity.moderation_decide` to call it when their source is `REPORT_BUTTON` with a `flag_id` **and the actor is a person** (not 0151's automatic actor `00000000-0000-0000-0000-000000000000`: the automatic hide is not a person's decision and leaves the report open for one), after their own insert. A hide still cannot raise.
- Redefines `identity.queue_public_flag_mail()` so the second insert skips a `NO_BREACH` when an `ACTED` row exists for that flag (queued or sent), and the `UNION ALL` of the step and decision paths no longer queues an `ACTED` that the new close already queued (one `ACTED` per flag, the earliest).
- `staff.public_flag_close` is unchanged: on a report a step closed, it already refuses with `PUBLIC_FLAG_ALREADY_DISMISSED`; the panel hides the buttons so staff never reach it.

- [ ] **Step 1: Write the failing tests**:
  - `a removal naming a report closes it as ACTED`: seed a QUEUED report, apply a grounded `REMOVE_DIG` with `source = 'REPORT_BUTTON'`, that `flag_id`: `public_flag.dismissed_at` set, `public_flag_answer.outcome = 'ACTED'`, exactly one `ACTED` row in `public_flag_mail`; `staff.public_flag_close(…, 'NO_BREACH', …)` then raises `PUBLIC_FLAG_ALREADY_DISMISSED`.
  - `a hide naming an already closed report still succeeds`: close as `NO_BREACH` first, then a grounded HIDE naming it: the hide's event exists, the answer stays `NO_BREACH`, mail rows are `NO_BREACH` then `ACTED` (decision C), never the reverse.
  - `the automatic hide leaves the report open`: a report the check settles `AGREE` (0151's automatic HIDE) stays undismissed with no `public_flag_answer` row, so a person still decides it.
  - `the six months start at the step`: the report's words are purged six months after the step's close (move `dismissed_at` back, run 0151's purge).
  - Render: a report with `outcome: 'ACTED'` and `closed_by_step: true` shows the closed line and no Close buttons.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Write the section and the panel change**; add `closed_by_step` to `identity.public_flag_queue_answered()`'s rows (redefined, same signature): true when the answer's `operation_id` is a derived review-close id.
- [ ] **Step 4: Run** the integration file, then the render file. Expected: PASS.
- [ ] **Step 5: Commit** `fix(moderation): a review step that acts on a report closes it, and the reporter hears one decision (M6, M4)`.

### Task 4: Everyone whose content left with a hidden debate hears the final decision (M3)

**Files:**
- Modify: `migrations/0172_moderation_notice_fixes.sql` (M3 section), manifest digest
- Modify: `packages/db/src/moderation-statement.ts` (kind union), `packages/contract/src/web.ts` (statement kind enum), `apps/api/src/moderation-statements.ts` (`TEMPLATE_OF`), `packages/mail-templates/src/templates.ts` (two templates via `statement("contributionDecided")`, `statement("reportDecided")`), `apps/api/src/mail-channel.ts` (purpose `moderation-notice` for both), `apps/ui/components/ModerationNotices.tsx`
- Modify (35 locales): `packages/mail-templates/messages/<locale>/mail.json`, `apps/ui/messages/<locale>/settings.json`
- Test: `tests/integration/moderation-notice-fixes-0172.test.ts`, `tests/unit/mail-templates-render.test.ts`, `tests/render/moderation-notices.test.tsx`

**Interfaces:**
- Swaps `moderation_statement_kind_check` to add `'CONTRIBUTION_DECIDED','REPORT_DECIDED'`.
- `identity.queue_moderation_statements()`'s decision loop (Task 1's version) also, for the decision's debate, finds the hide it makes final (the latest `HIDE` event on that `publication_ref` before the decision with no `REPUBLISH` after it) and, for each person holding a `CONTRIBUTION_AFFECTED` or `REPORT_AFFECTED` statement for that event, calls `identity.state_moderation(person, 'CONTRIBUTION_DECIDED' | 'REPORT_DECIDED', publication_ref, NULL, decision_id, '{}', NULL, NULL, <places: their pieces as [{piece_kind, piece_id}]>, decision.recorded_at)`. `state_moderation` already skips erased accounts.
- English copy (then the fan-out): `mail.statement.contributionDecidedSubject` "Our decision on the debate your contribution was in"; `mail.statement.contributionDecided` "On {happened}, we decided that this public debate stays off the public page: {itemUrl}. The contribution you made there stays off it too, in every copy of the page."; `reportDecided…` the same with "report you asked for". Settings page: the same sentences under the kinds' existing layout.

- [ ] **Step 1: Write the failing tests**:
  - `DECIDE tells each affected contributor once`: a debate with two digs by person P and one report by Q is hidden, then DECIDE: P has one `CONTRIBUTION_DECIDED` with two places, Q one `REPORT_DECIDED`, the author one `DEBATE_DECIDED`; a second queue pass adds nothing.
  - `an erased contributor gets nothing`: erase P between the hide and DECIDE: no row for P, no stuck row.
  - `a debate put back and hidden again`: only the second hide's affected people are told at DECIDE.
  - Render: both templates render in `en` and `ro` with the routes paragraph and Reply-To office@; the settings page lists the new kinds.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement**, English first, then the translation fan-out.
- [ ] **Step 4: Run** each test file in turn, and `pnpm vitest run apps/ui/lib/i18n/public.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(moderation): the final decision reaches everyone whose content left with the debate (M3)`.

### Task 5: The reporter's mails say when an AI read the report first (M1)

**Files:**
- Modify: `migrations/0172_moderation_notice_fixes.sql` (M1 section), manifest digest
- Modify: `packages/db/src/moderation-statement.ts` (`PublicFlagMail.aiReadFirst: boolean`), `apps/api/src/moderation-statements.ts:117-135` (param), `packages/mail-templates/src/templates.ts:136-139, 436` (`optional: { aiReadFirst: "flag" }`; receipt paragraph `when("aiReadFirst", "mail.flagAnswer.aiReadFirst")`; decision paragraphs `when("aiReadFirst", "mail.statement.automatedDetection")` before `routes`)
- Modify (35 locales): `packages/mail-templates/messages/<locale>/mail.json` (`mail.flagAnswer.aiReadFirst` only; the decision sentence already exists)
- Test: `tests/integration/moderation-notice-fixes-0172.test.ts`, `tests/unit/mail-templates-render.test.ts`, `tests/unit/moderation-notices.test.ts`

**Interfaces:**
- Redefines `identity.read_public_flag_mail(uuid,uuid) RETURNS jsonb` (same signature) to add `'aiReadFirst', flag.verdict IN ('AGREE','NOT_FOUND','UNSURE')`. `UNAVAILABLE` or null (no check ran, or it timed out) is false.
- English: `mail.flagAnswer.aiReadFirst` "An automatic check read your report first and passed it to a person."

- [ ] **Step 1: Write the failing tests**: the read returns `aiReadFirst: true` for an `UNSURE` report and `false` for one settled `UNAVAILABLE` by the five-minute sweep; the receipt renders the sentence only when true; `NO_BREACH` and `ACTED` render "An AI read the report first. A person made this decision." only when true; the auto-decided mails are unchanged.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement**, then translate the one key.
- [ ] **Step 4: Run** each file. Expected: PASS.
- [ ] **Step 5: Commit** `fix(moderation): the reporter's mails say when an AI read the report first (M1)`.

### Task 6: An "illegal" ground names the law (M7)

**Files:**
- Modify: `migrations/0172_moderation_notice_fixes.sql` (M7 section), manifest digest
- Modify: `apps/api/src/staff/public-review.ts:31-32, 90-93, 140-195`, `apps/api/src/staff/routes.ts`, `apps/ui/lib/publicReviewApi.ts`, `apps/ui/components/PublicReviewPanel.tsx` (a "Law" field shown and required when "Illegal" is ticked), `apps/ui/messages/{en,ro}/staff.json`
- Modify: `packages/contract/src/web.ts` (`ground.law: string | null`), `apps/api/src/moderation-statements.ts` (`moderationStatementsOf` passes it), `apps/ui/components/ModerationNotices.tsx` (shows "The law we relied on: {law}"), `apps/ui/messages/<locale>/settings.json` (35 locales, one key), `apps/api/src/data-export/{snapshot,types,readme}.ts`
- Test: `tests/integration/moderation-notice-fixes-0172.test.ts`, `tests/unit/` the staff binding test that pins `canonicalPublicFlagBinding` / the review binding's keys, `tests/render/public-review-panel.test.tsx`, `tests/render/moderation-notices.test.tsx`, `tests/unit/sf-s04-data-export.test.ts`

**Interfaces:**
- Adds `law_ref text` (nullable) to `identity.moderation_ground` and `identity.moderation_decision`, each with `CHECK (law_ref IS NULL OR char_length(law_ref) BETWEEN 3 AND 200) NOT VALID`, and a law-required CHECK, also `NOT VALID` (enforced for new rows; rows from before 0172 keep null): on `moderation_ground` `NOT ('ILLEGAL' = ANY (grounds)) OR law_ref IS NOT NULL OR interim`; on `moderation_decision`, which has no `interim`, `NOT ('ILLEGAL' = ANY (grounds)) OR law_ref IS NOT NULL`.
- New overloads `staff.public_review_body_grounded(…, p_law text)` and `staff.public_review_act_grounded(…, p_law text)` (the 0157 argument list plus `p_law` last), same action names; the old overloads lose their `debateai_runtime` grant. They pass `p_law` to new overloads of `identity.record_step_ground` / `identity.moderation_decide`, which refuse `MODERATION_GROUND_LAW_MISSING` before the passkey is spent. The hide path never refuses: a hide with `ILLEGAL` and no law records the hold, as 0157.
- `groundFieldsOf` returns a fifth key `law` (`intent.law ?? ""`); the passkey body and binding carry it.
- `identity.read_own_moderation_statements` and `identity.read_data_export_moderation` (redefined, same signatures) add `law` to each statement's ground. The 12-month purge does not touch `law_ref`.

- [ ] **Step 1: Write the failing tests**: a removal with grounds `['ILLEGAL']` and no law is refused `MODERATION_GROUND_LAW_MISSING` and spends no passkey; with `law = 'Legea nr. 8/1996, art. 139'` it is recorded and the person's statement page and export show the law; a law of 2 or 201 characters is refused; a hide with suspected `ILLEGAL` and no law still hides; the binding test pins the new key; the panel shows the Law field only when Illegal is ticked.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement** SQL, API, UI; translate the one settings key.
- [ ] **Step 4: Run** each file, then `pnpm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(moderation): an "illegal" ground names the law it relies on (M7)`.

### Task 7: Whole-branch check and hand-off

**Files:**
- Modify: `docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md` row 77 (add: "0172 fixes M1–M7 (10 Nov 2026); 0172 is a drained upload"), `deploy/vps/README.md` if it lists the migration count

- [ ] **Step 1: Run** `pnpm run typecheck`, `pnpm run lint`, `pnpm vitest run tests/architecture`, `pnpm vitest run tests/integration/public-tree-flow.test.ts`, `pnpm vitest run tests/integration/moderation-notice-fixes-0172.test.ts`, one at a time. Expected: all PASS; any known-red listed by `tools/ci-known-red.mjs` is unchanged.
- [ ] **Step 2: Check every Review Focus line** has its test in Tasks 1–6 (names above); add any missing.
- [ ] **Step 3: Commit** `docs(go-live): row 77 names 0172`, then ask the owner before pushing and opening the PR into `feat/2026-10-28-v4-initial`.
