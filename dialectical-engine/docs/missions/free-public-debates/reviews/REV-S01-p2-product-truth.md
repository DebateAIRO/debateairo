# REV(S01) pass 2 (SCOPED) — lens PRODUCT-TRUTH · verdict PASS

- seat `REV-S01-p2-product-truth` (the pass-1 lens session resumed) · node REV(S01) lens product-truth, blind scoped review, pass 2 of 3 · ticket `t_d2c8d5fc`
- worktree (detached, read-only, 0 dirty at claim and at handoff): `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-rev-s01-p1-product-truth/dialectical-engine` · HEAD `c358d494` · previous head `db4758da` · base `5b6cc9b1`
- oracle: **`SPEC-v3.md`** (the SPEC of record) with `DECISIONS.md` §31, V rows V-1…V-11, and V's intake words
- **Verdict: PASS (pass 2) for this lens.** Every blocking finding of my pass 1 is ADDRESSED by measurement, except `P-B1`, which is V row **V-8** and which no file of a backend-only slice can close — verdicted *with V*, per the packet's charge 6. Three non-blocking findings are below; none of them is a state V's acceptance walk can reach, and each needs a ticket.

---

## 1. Packet review (pass 2)

| packet claim | measured from my cwd | result |
|---|---|---|
| slice head `c358d494`, base `5b6cc9b1` | `git rev-parse HEAD` → `c358d494…` | OK |
| `git diff --name-only 5b6cc9b1..c358d494 -- apps/ui \| wc -l` = 0 | `0` | OK |
| freeze pair `5ffdfa13..3a953d5e`, three mission trees, CWD-relative pathspecs | non-empty; carries the union, the FIX handoffs, SPEC-v3, the pass-2 package | OK |
| SPEC of record is `SPEC-v3.md`, requirement set exactly R-1…R-25 | `grep -oE '\*\*R-[0-9]+' SPEC-v3.md \| sort -u \| wc -l` → 25 | OK |
| landed pairs moved: C2 8/0→14/0 and 16/0→20/0, C3 10/0→11/0, C4 integration 14/0→17/0 | measured per file below; every stated pair matches | OK |
| charge 4: the FIX seats' `SKILLS LOADED` lines | present on both READY comments (`t_728887e1`, `t_544048e9`), each naming `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`, `receiving-code-review`, `test-driven-development`, `verification-before-completion`, `systematic-debugging` — the worker floor in full, plus `references/` files; the orchestrator's CONSUMED comment records `skills-check.sh` against the Codex rollout jsonl | OK, no finding |

Packet defect: **P2-N3** below.

---

## 2. Charge 1 — each pass-1 finding of this lens, verdicted by measurement at `c358d494`

I re-ran my own pass-1 probe first, unmodified, at the new head
(`probes/REV-S01-p2-product-truth/scratch/p1-probes-at-c358d494.log`): **14/19 passed, 5 failed**, and
every one of the five is an expectation that pinned the pre-fix state. Two of the five are real
inversions of product behaviour (PT-3, PT-7) and three are the repository double predating the new
`ensureAutoPublishWork` member (PT-4, PT-5, PT-6 — verbatim: `TypeError: this.repository.ensureAutoPublishWork is not a function`).
I then re-derived all five in the pass-2 probe and state below what changed.

| pass-1 id | verdict at `c358d494` | the measurement |
|---|---|---|
| **P-B1** — the UI cannot delete a PUBLISHED debate | **WITH V (row V-8)** — unchanged and unchangeable here | `apps/ui` delta is 0; `apps/ui/components/PublicationControl.tsx:194` still gates the delete block on `visibility?.state === "PRIVATE"`. My pass-1 render probe re-run at this head is still **3/3**, i.e. UI-2 still finds no rendered control containing "Delete" when visibility is PUBLISHED. Nothing in this slice could close it (I-4), and the packet's charge 6 says to verdict it *with V*, not NOT ADDRESSED. I agree with that reading. |
| **P-B2** — a second route serves the answer without triggering | **ADDRESSED** | `apps/api/src/index.ts:434-450` extracts one `tryAutoPublishServedAnswer` helper; `:1025` calls it from `GET /v1/answers/{id}` with `answer.run_ref`, `:1121` from `GET /v1/runs/{id}/answer`. Probe **P2-1**: the answers route now calls `tryAutoPublish` exactly once, naming the answer's run and not the answer id. Probe **P2-3** freezes SPEC-v3 §1's mechanical consequence (a) as a test: `AnswerSchema.parse(` send sites in `apps/api/src/index.ts` = **2**, trigger call sites = **2**. Probe **P2-4**: `GET /v1/answers`, `…/inspection` and `…/ledger-digest` trigger nothing, which is SPEC-v3 §1's projection list. The root cause was fixed upstream too — SPEC-v3 §1 replaces the one-route definition with a mechanical test that binds routes added later. |
| **P-B3** — no enqueue-before-attempt | **ADDRESSED for the deterministic path; residue is P2-N1** | `apps/api/src/publications.ts:215-217` inserts `ensureAutoPublishWork` before `readAuthorPseudonym`, and `:252-258` wraps `systemPublish` in a `try` whose `catch` routes to the new `finishFailedAutoPublish`. Probe **P2-7**: with `readAuthorPseudonym` throwing, `ensureAutoPublishWork` has already been called once. Probe **P2-8**: a raising `systemPublish` (the `RAISE … 40001` of `migrations/0067_system_run_publication.sql:414-417`) now produces one `upsertAutoPublishWork` and one `abandonSystemKeyProvision` instead of an unhandled throw. The deterministic path I reported is closed. |
| **P-N1** — retried every 30 s for ever, no backoff | **ADDRESSED** | `migrations/0070_fix_system_publication.sql:99-106`: `next_attempt_at = now + LEAST(30s × 2^LEAST(attempt_count,7), 1 hour)`. Probe **PTDB2-4**, under `SET ROLE debateai_runtime`: after one failure the row is **not** claimable and the delay is > 20 s; after a second it is strictly longer; after twelve it is ≤ 3600 s. My pass-1 PTDB-4 measured the opposite at `db4758da`. The retry is still uncapped in *count*, which is V-2's binding default ("retried until it lands"), so that half is not a finding; the audit-row rate it drove falls from ~2,880/run/day to ~24. |
| **P-N2** — a BLOCKED answer writes for every run, bound or not | **ADDRESSED** | `apps/api/src/publications.ts:203`: the bound check now precedes the BLOCKED branch. Probe **P2-10**: for an unbound run with a BLOCKED answer the repository sees **no call at all**; for a bound one, `runIsFreePublicBound` is the first call and `clearAutoPublishWork` the only write. Probe **P2-11**: a BLOCKED bound run still ends with nothing outstanding (R-8). |
| **P-N3** (= C-B4 = S-N5) — the C2 suite skips off-lane | **ADDRESSED** | `tests/integration/fpd-s01-c2-system-publication.test.ts:225-229` now passes `initdbFlags: ["--encoding=UTF8", …]`, matching `tests/support/testDatabase.ts`. Measured on this host, whose locale is `LC_CTYPE="C"`: the 21-file slice list runs **266/271 with zero skipped**, three times, *without* forcing a locale. At pass 1 the same host produced 0 passed / 16 SKIPPED. |
| **P-N4** — SV-0's gate cannot detect a skipped suite | **ADDRESSED in practice, open as protocol** | The pass-2 package README §5 and my charge 3 now require both locales and declare `passed=0 failed=0` or any skip BROKEN, which is the detection SV-0 lacked. The runner's own marker is C-N2, an orchestrator ticket on a protocol-owned file, not mine. |
| **P-N5** — charge 5 pre-tiered the UI question | **ADDRESSED** | The pass-2 packet's charge 6 names P-B1 by id, states why no file can close it, and tells me to verdict it *with V*. It no longer decides the tier for me. |

---

## 3. Charge 7 — the version-3 acceptance walked again in-process, and the "not public and not deleted" sweep

`SPEC-v3` §4 is still written for V against a served lane, so the same steps stay UNVERIFIED as at
pass 1 (1, 2's ask, 3, 6, 11's list read, 16). Everything decidable in-process was executed; only the
steps that changed are tabulated here, with step 4 read as `DECISIONS.md` §31 B1-p3 corrects it.

| step | asks | outcome |
|---|---|---|
| **3b** | a second Free debate, polled through `GET /v1/answers` only; visibility must stay `{"state":"PRIVATE","public_ref":null}` — two keys | **EXECUTED (P2-4, P2-12)**: the answer-index route triggers no publish, and a run with no outstanding work reads back exactly two keys. The run's own progress to a served answer is UNVERIFIED (needs the engine). |
| **3c** | `GET /v1/answers/<answer_id>` → 200, then visibility `PUBLISHED` — "the step that proves V-10" | **EXECUTED (P2-1)**: the route returns the full answer *and* fires the trigger, naming the answer's run. The DB half (the run actually reaching `PUBLISHED`) is the C2 integration suite, 20/20 in six runs. |
| **4** | the public total is step 1's value **plus 2** (`DECISIONS.md` §31) | **UNVERIFIED** (needs the served list). The arithmetic is V-11's binding default; `SPEC-v3.md:390` still says "plus 1" and is frozen, so §31 is the text V must be handed. I confirm the correction is arithmetically right: steps 2-3 publish one debate and steps 3b-3c publish a second before step 4 runs. |
| **5** | two keys, no `publish_pending` | **EXECUTED (P2-12)**; and `packages/db/src/publication.ts:587` now excludes a `PUBLISHED` run from the `publish_pending` EXISTS, so a stale work row cannot add a third key to this step. |
| **11** | the step-2 line is gone, total is step 1 **plus 1** (the 3b debate is still public) | **UNVERIFIED** (list); the delete half is P2-6. |
| **11b** | delete `<free_run2>` → 200/202, never 409 | **EXECUTED (P2-6)**: a run published through the second route surfaces 200 `{"status":"CLEANED"}` and 202 `{"status":"PENDING"}` at `DELETE /v1/debates/{id}`, with no 409. **P2-5** additionally shows that such a run answers the same 409 `FREE_DEBATE_CANNOT_BE_UNPUBLISHED` at unpublish and the same two-key visibility — the route a debate was published through leaves no trace in its later behaviour. |
| 7, 8, 9, 10, 12-15 | unchanged | **EXECUTED, unchanged** (P2-5, P2-13, P2-14, P2-6): 409 twice without consuming the grant, byte-identical 404 for a non-owner, 401 `SESSION_REQUIRED` with no session, unbound unpublish 200, unbound delete 409. |

**The sweep — every way a NEW Free debate ends up not public and not deleted, at `c358d494`:**

| path | disposition now |
|---|---|
| a BLOCKED answer | V-1's accepted default, and now reached without any write on an unbound run (P2-10, P2-11) |
| an auto-publish that keeps failing | V-2's accepted default; the owner reads `publish_pending: true` and the retry now backs off to a one-hour ceiling (PTDB2-4) instead of firing every 30 s |
| the reconciler never runs in production wiring | wired, unchanged (`apps/api/src/main.ts:299-308`); still fed only by the work table (P2-15), which is now written *before* the attempt (P2-7), so the queue no longer depends on the code path that failed |
| an answer served through a route other than the hooked one | **CLOSED** (P2-1, P2-3) — and SPEC-v3 §1 binds routes that do not exist yet |
| an owner-driven publish then unpublish before the answer is served | still not reachable (publish reads the answer first, `apps/api/src/index.ts:1142-1148` at the previous head, unmoved) |
| a run created through the legacy principal path | still not bound (PTDB2-1: `plan_tier IS NULL` reads `bound=false`) |
| a failure that is not one of the four enumerated reasons | **NARROWED, not closed — P2-N1** |
| the publication layer unwired in a deployment | unchanged deployment precondition, not a slice hole |

---

## 4. Charge 2 — new breakage inside the diff since pass 1

I looked for the three shapes the charge names.

- **A guard with no case that fails when it is removed.** The new guards are `ensureAutoPublishWork`'s position (P2-7 fails if it moves back), the bound-check order (P2-10 fails if it moves back), the `try` around `systemPublish` (P2-8), the `latest.state IS DISTINCT FROM 'PUBLISHED'` clause in `packages/db/src/publication.ts:587` (the C2 suite's new *"never projects publish_pending beside PUBLISHED even if stale work exists"*), and the UTF-8 `initdbFlags` (the whole suite fails without it, measured). Each has a case; I did not find a guard without one inside my lens.
- **A fix that re-creates the class it closes.** The enqueue-before-attempt could have re-created P-N2 by writing work rows for unbound runs. It does not: `apps/api/src/publications.ts:203` returns before any write when the run is unbound (P2-10 asserts an empty call list). `ensure_free_public_auto_publish_work` also does not reset an already-outstanding row's backoff (`migrations/0070_fix_system_publication.sql:67` — `ON CONFLICT … WHERE cleared_at IS NOT NULL`), so a repeated serve cannot defeat P-N1's fix; **PTDB2-5** measures exactly that: after a failure, a fresh `ensure` leaves `next_attempt_at` and `attempt_count` unchanged.
- **A changed pair hiding a dropped case.** Compared `it("…")` titles between `db4758da` and `c358d494` for all five changed suites. Nothing was dropped; three titles were *renamed*, each with a visibly stronger successor: `"returns NULL for a NULL tier with one DENY and no publication"` and `"…for a pre-rule Free run with one DENY…"` became `"…with no forgeable DENY…"` (S-N4's fix), and `"returns CONTENDED while a system publication intent is PREPARED"` became `"returns CONTENDED only after queuing erasure during a live system publication intent"` (C-B3 / V-9's fix). Counts: C2 unit 8→14, C3 11, C4 http 8, C2 integration 17→20 cases, C4 integration 14→17 — every pair the package states.

---

## 5. Non-blocking findings (each needs a ticket; the tier sets WHEN, never WHETHER)

**P2-N1 — two calls still run before the enqueue, so R-9's forbidden state survives a database blip.**
`apps/api/src/publications.ts:203` (`isFreePublicBound`) and `:207-209` (`readOwnedVisibility`) both
execute before `ensureAutoPublishWork` at `:215`, and `apps/api/src/index.ts:446-448` still swallows
whatever they throw with a bare `catch { }`. Evidence (**P2-9**): with either call rejecting,
`ensureAutoPublishWork` and `upsertAutoPublishWork` are both never called, and both answer-serving
routes still return **200**. That is `SPEC-v3` R-9's named violation — *"`PRIVATE` with nothing
outstanding is a violation of this requirement"* — reached without the owner, the tier or the answer
being unusual. FIX-A's class sweep reports "5/5 fallible attempt sites", which is complete for the
class as *attempt* sites; the class I reported at pass 1 was *any throw before the enqueue*, and it has
these two members left.
Why non-blocking, stated so it can be argued with: both calls are ordinary queries, so a throw means
the database is failing underneath a request whose earlier read succeeded — a narrow transient window,
not a state V's walk or a healthy deployment reaches; and the run now self-heals on the owner's next
read through *either* of two routes, where at pass 1 only one route healed it.
`VERDICT: enqueue on the throw as well — either move the enqueue above the two calls behind the bound
check the route already has, or make the route's catch enqueue / CONFIDENCE: medium / STRONGEST
COUNTER: enqueuing before the bound check re-creates P-N2 by writing work rows for Premium runs, so the
cheap version of this fix is the expensive one to get right, which is an argument for doing it
deliberately on a ticket rather than in the slice's last pass.`

**P2-N2 — `DECISIONS.md` §31 N4-p3 names the wrong list, and the step it describes is still unrunnable for a creator with more than 25 answers.**
The fold reads *"acceptance step 3b reads the public list with `limit=25&offset=0` only"*. Step 3b
(`SPEC-v3.md:378`) reads the **answer index**, `GET $API/v1/answers?limit=25&offset=0`, not the public
list — the public list is read at steps 1, 4, 11 and 11b, all of which already spell out full
pagination. The pagination caveat is real but attaches to the *answers* index: a creator whose answer
list is longer than 25 items polls page 1 for fifteen minutes and never sees `<free_run2>`, so step 3b
— the step SPEC-v3 exists for — cannot be completed as written, and the remedy the fold points at
("the pagination step 11b already spells out") is pagination of a different route. V's test point needs
the corrected sentence, not the fold as it stands.

**P2-N3 — packet accuracy, the same class as pass 1's C-N4 / P-N4, recurring.**
(a) The pass-2 packet line 8 says `comment cursor at dispatch: 0 comments`; `t_d2c8d5fc` carried **1**
comment (the `DISPATCHED` comment, author `default`) when I read it before claiming — the identical
off-by-one that was ticketed at pass 1. (b) Charge 4 says the FIX seats' *agent-reports* carry the
`SKILLS LOADED` lines; `agent-reports/FIX-S01-p1-A.md` and `FIX-S01-p1-B.md` contain no such line —
the lines are on the READY comments, which the same charge also names, so the duty was executable, but
the sentence is wrong about one of its two sources. Neither costs a product behaviour; both cost a
seat's reading, which is what the class is about.

---

## 6. Verification, verbatim

Run from my cwd, **twice by locale as charge 3 requires**, three runs each; 21 files (the 19 slice
suites plus my two pass-2 probes):

- ambient (`LANG`/`LC_ALL` unset, host `LC_CTYPE="C"`), runs 1/2/3: `Tests  5 failed | 266 passed (271)` each time.
- `LANG=LC_ALL=en_US.UTF-8`, runs 1/2/3: `Tests  5 failed | 266 passed (271)` each time.
- **`grep -c "^ ↓ "` over all six logs: 0** — no skipped test in either locale, and no suite reported `passed=0 failed=0`.
- the five failures, in every run, are exactly the tests named RED at base in `00-intake.md`: `s8-publication-database` *"preserves a committed corpus key when the publish result is transport-ambiguous"* · `s7-authorization` *"keeps one complete, duplicate-free policy row per contract route"* · `register-support-publication` ×2 (the TypeScript-compiler trap) · `s8-publication-contract` *"ships the deliberate controls and public-only reader in the UI composition"*.
- per-file pairs, matching the package's section 3: C1 9/0 · 3/0 — C2 14/0 · 20/0 — C3 11/0 — C4 8/0 · 17/0 — my probes 15/0 · 5/0.
- `pnpm exec tsc --noEmit` with my probes present: **71** diagnostics, exactly **1** of them from my own probe file, so **70 for the slice — the base count** — and none naming a file the slice wrote.
- I hit the `zsh + vitest` trap once myself (quoted list → one filter token → `No test files found`, which is BROKEN, not RED) and re-ran with an array; both spellings are in `scratch/`.

Nothing outlived the run; no no-touch port was bound; nothing was opened on V's desktop; the worktree
ends byte-clean at `c358d494`.

---

## 7. What I did NOT verify

- The served-lane halves of `SPEC-v3` §4: steps 1, 2's ask, 3, 3b's wait, 6, 11's and 4's list reads, 16. REV does not impersonate V (PLAN SV-11).
- Anything in the correctness or security lens: C-B1's pseudonym mutant, C-B2's concurrency race, C-B3/V-9's queued erasure, the f1/f2 trigger admissions of `0069`. I read `0069` only far enough to confirm no product-truth behaviour of mine moved.
- Whether `V-8`, `V-9`, `V-10` or `V-11` have been ruled on by V. Each default binds; I measured against the defaults.

---

## 8. Row for V

None new this pass. My pass-1 row is live as **V-8** and is unchanged by this head: `apps/ui` delta is
0, and my pass-1 render probe still measures no delete control on a PUBLISHED debate. V-10 (the
definition of "served") was ruled into SPEC-v3 and is **built** at this head; V-11's arithmetic
correction still needs to reach V's test point as `DECISIONS.md` §31 states it, not as `SPEC-v3.md:390`
prints it.

---

## 9. Predictions about the other two lenses (blind; falsifiable)

I expect **correctness/tests** to PASS this pass, and to spend most of it on its two surviving mutants
— T8 on the C3 refusal block and T10 — which FIX-A's handoff claims are now caught at 10/1 and 13/1;
if that lens re-runs its own `mutant.sh` I expect it to find the mutants killed but to file a new N on
the *direction* of a mutant it wrote at `db4758da`, because the C2 unit double grew an
`ensureAutoPublishWork` member and a mutant that patches the old shape now fails for the wrong reason
— the same interface-drift that turned three of my own pass-1 cases red. I expect **security/data-safety**
to PASS too and to concentrate on `0069`'s redefined trigger: the f2 admission now ties the cleanup
intent to `NEW.run_id` (S-N3) and the f1 admission checks `expires_at` (S-N2) and boundness (S-N1), and
the C4 suite's new cases read as if each was written against a named fixture; my guess is it files an N
on `identity.audit_system_publication_attempt` still being callable per-run by the runtime role, or on
the erasure path writing no `debate.publication.unpublished` audit — the same gap I predicted it would
find at pass 1. I expect neither lens to raise my **P2-N1**, because both will read `ensureAutoPublishWork`
at `publications.ts:215` and see the enqueue-before-attempt they asked for; the two calls *above* it are
invisible unless you inject a throw into them specifically, which is a product-truth question about
R-9's post-condition rather than a test-coverage or data-safety question. If a lens does raise it, I
would check next whether they also noticed that the route's `catch` is now shared by both answer-serving
routes, so one swallow now hides two paths.
