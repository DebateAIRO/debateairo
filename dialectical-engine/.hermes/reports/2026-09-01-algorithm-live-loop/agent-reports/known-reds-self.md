# SELF-REPORT — lane/known-reds (worker, Opus 5) · murder-case format

`tip 0b2ca8863f376aed44cda583ecdac9fb56f4a43a` · base `ed804f3cab05213d289379031d5350ae4a07e1ef` · filed 2026-09-09 09:21 CEST (from `date`) · three tickets, one round, no rework.

Every timestamp below is read from a record's own header line; every duration from the run's own `Duration` line.

---

## 1. The body: what actually killed twelve days

**The victim.** `tests/unit/pro01-runner-tree.test.ts:225` was red from 2026-08-28 to 2026-09-09. Twelve days.

**The cause is not the one the symptom names.** The failure message says `UNEXPECTED_CLIENT_QUERY`, which reads like a test-harness problem. It is not. Commit `7b3a3063` changed one string in `packages/db/src/index.ts` — `pg_advisory_lock` to `pg_try_advisory_lock` — and four unrelated test files dispatched on that string with `sql.includes(...)`. **No compiler, linter or type can see a substring match against a string literal that lives in another package.** The only observer of that coupling is the test run itself, and the test run's report was, by then, an accepted known-red list.

**So the real cause of the twelve days is not the string. It is that the row was already inside a known-red set.** A red row in an accepted set is not read; it is counted. The set exists so lanes can attain a gate line, and its side effect is that it converts live defects into furniture. `pro01` was named in every attribution since 2026-09-02 and diagnosed by nobody, because "known red" answered the question "is this mine?" and nobody was asked "is this still true?".

**Price of that mechanism, measured here:** the diagnosis, once someone was actually asked to do it, took **four commands** — two `git log -S`, two `git show` — and under two minutes. Twelve days of carrying a red row cost more than that in attribution lines alone, across every lane gate in the mission.

**Upgrade (concrete, cheap).** A known-red entry should carry an expiry and an owner, not just a name. Something like: `known red: <row> · since <commit/date> · ticket <id> | UNTICKETED`. An UNTICKETED entry older than N days is itself a finding at the orchestrator's next gate. The list already exists in every packet; adding two fields to each row costs one line and makes "nobody has looked at this in twelve days" visible instead of invisible.

---

## 2. The second body nobody reported: the class had three members

I was handed one instance. The class had **three affected members**, and I found the other two by running one `grep` over the repository for the dispatch shape:

- `tests/unit/xrev01-node-review.test.ts:126` — red, same signature. Confirmed at my tip: `finding-01-xrev01-class-sibling.log`, `Tests 1 failed | 5 passed (6)`.
- `tests/unit/load01-run-projection.test.ts:6` — red **and hanging**. Its stale branch returns `{ rows: [] }`, which the new try-lock reads as contention, so the lease unlocks, sleeps 10 ms and retries forever. `Duration 120.78s`, `Test timed out in 120000ms`, and the message names no cause at all.

**This is the finding I would most want carried forward.** The same one-line defect produced two completely different failure modes: a loud, correctly-attributed error, and a silent 120-second hang. The hang is strictly worse — it costs two minutes of every full-suite run, and its message points at the test, not at the query change three packages away.

**What the packet said, and why it mattered.** The KNOWN REDS block ends "No additional failures anywhere." That sentence is false as written — two more rows are red on this base from *this lane's own cause*. It is presumably true of the five gate commands, which is what was meant. But as written it is exactly the sentence that would license a seat to fix the named instance and stop. `heartbeat-protocol` §2.2 is the only reason I swept anyway. **A packet should never assert global absence of failures it did not measure globally; say "no additional failures in this lane's gate set" and the sentence becomes true and still does its job.**

---

## 3. What I nearly got wrong

**(a) I hand-rolled a fixture that already exists as a maintained factory.** I wrote a two-node, one-edge `Answer` literal by hand, reading 291 lines of `packages/contract/src/index.ts` across three passes (`:332–360`, `:400–575`, `:575–660`) to get every required field right. `tests/support/v2uiFixtures.ts:9` exports `buildFairShapedAnswer(overrides: Partial<Answer>): Answer` — a two-node, one-edge served answer, `AnswerSchema.parse`d inside the builder, already imported by nine test files. I found it **after** the commit and after all thirteen gate and mutant records were taken, because I went looking while writing this report rather than while writing the fixture.

It happened to be out of contract (its import line sits outside my allowed `:1678–:1730`), so nothing had to be redone. **Had it been in contract, I would have burned the commit and every record — roughly ten minutes of gate time — on a rewrite.** The habit that failed is trivial: `ls tests/support/` before writing any fixture literal. It costs one command. I did it in minute 45 instead of minute 5.

Worse, the factory is not merely tidier — it is the actual remedy. Using it lets the `as never` cast go, and **the cast is the murder weapon**: it is what hid a missing required field from the compiler. My fix repairs the instance and leaves the hole open for the next field added to `AnswerSchema`. That is now a recommended ticket in the main report, and it is a better fix than mine.

**(b) I nearly shipped `nodes: []` / `edges: []`.** Four lines shorter, satisfies the type, satisfies the packet's letter, and passes the mutant the packet asked for. It also runs neither redactor, parses nothing real, and stores an artifact whose hardcoded `tree_included: true` describes an empty tree. The mutant the packet named would not have caught the weaker choice — which is the `heartbeat-worker` §2 warning verbatim: *an assertion that pins the mutant you were shown is not a pin of the property*. What saved it was asking what the fixture is for, not what makes the assertion pass.

**(c) I nearly filed the two class-sibling red records under the `r0-` prefix.** They stamp the same tip, so `stamp-check` would have passed with 15 records and no complaint, and my gates table would have silently contained two failures that are not gates. The prefix split (`red-` / `r0-` / `finding-`) is load-bearing and the records block does not say so; it says only which records the stamp-check covers. **Upgrade: the records block should state that non-gate evidence runs go under a distinct prefix, because stamp-check passing is not evidence that a record belongs in the gate set.**

---

## 4. Dead ends, named so nobody re-derives them

- **"Revert the product's lock to the blocking form."** This is the obvious first hypothesis once you see the stub was correct at `970870f3`. It is wrong, and it is wrong *fast*: `tests/architecture/s6-content-encryption-contract.test.ts:55–57` asserts the acquisition does **not** contain `SELECT pg_advisory_lock(hashtextextended($1,0))`. Reverting turns a landed contract test red. **Anyone re-diagnosing a lock-related fixture failure should read that file first — it settles the fixture-versus-product fork in one grep.**
- **"Keep both branches in the stub, like `tests/unit/evaluator-addon.test.ts:280–281`."** Tempting, since that file's tolerance is exactly why it survived `7b3a3063`. Rejected: a branch answering a query the product no longer issues is the rot mechanism itself. Tolerance bought that file three years of survival and also guarantees nobody ever learns the query changed.
- **"The lease-before-envelope order changed."** It did not. `git show 970870f3:./apps/runner/src/index.ts` has the lease wrapping `assertModelAttemptAllowed` at lines 2582/2584, the same order as today's 5417/5419. Checking this cost one command and eliminated an entire branch of the investigation.

---

## 5. What cost wall clock, measured

| item | cost | note |
|---|---|---|
| T9 filtered gate (`-t "T9 counterbalances six resend windows"`) | **376.39s** | for a **comment-only** change |
| `load01` class-sibling evidence run | 120.78s | a hang, not a failure |
| everything else — typecheck ×3, pro01 ×3, s8, f-t9, four mutants | **≈67s combined** | twelve records |

**One comment-only gate cost 5.6× every other record in this lane put together.** I hid most of it by starting it in the background and running the seven read-only gates alongside it (records show `porcelain BEFORE`/`AFTER` unchanged throughout), saving roughly five minutes of serial time — but that is a workaround, not a fix, and it cost me a disclaimer in the report because the durations in three records are no longer isolated measurements.

**Upgrade, and I want to be careful not to overstate it.** The 376s run is not pure waste: it confirms the whole test still parses and passes end-to-end. But for a *comment-only* edit, three cheaper artifacts already cover that: the mechanical comment-only diff proof (`git diff -U0 … | grep -v '^[+-]\s*\(//\|\*\)'` returns nothing), the `tsc` gate (which parses the file), and — specific to this file — `tests/unit/f-t9-unattended-promises.test.ts`, which **slices that very region out and executes it in a child Node process in 0.4 seconds**. The marginal information in the 376-second run is small and the cost is 42% of the lane's measurement time.

**Recommendation:** let a packet mark a gate `confirmatory` when the change class is comment-only and a cheaper behavioural observer over the same text exists. Run it, but say in the packet why, so the seat does not have to reason it out — and so a seat under time pressure does not quietly skip it instead.

---

## 6. What made this lane fast, and how to get more of it

Three things did almost all the work, and they are all packet properties, not model properties.

1. **The FACTS block gave verified anchors: file, line, exact query string, exact commit.** I verified each by grep before acting — as instructed — and every one held. That verification took about four minutes and converted the whole diagnosis into four `git` commands. **A packet whose constants are pre-verified is worth more than any amount of seat cleverness.** This is the single highest-leverage artifact in the heartbeat protocol as practised here.
2. **The packet stated the fork and both branches.** "If the projection, not the fixture, is what is wrong … say so and stop." That turned a judgement call into a lookup: read `AnswerSchema:591–592`, see `nodes`/`edges` are required, take the fixture branch. Two minutes, no deliberation, no risk of an out-of-contract product edit.
3. **The contract was tight enough to be checkable and it bound me usefully.** It stopped me from fixing `xrev01` and `load01` — which I could see and could have fixed in two lines — and from doing the `buildFairShapedAnswer` refactor. All three are better as tickets with a reviewer than as unasked scope from a seat that was not chartered for them.

**Toward the one-prompt machine.** Ranked by expected saving:

- **Name the CLASS in the packet, not just the instance.** One sentence — "this is an instance of *stub dispatching on a product query string*; sweep it" — would have made the class sweep the assignment rather than a §2.2 obligation I had to remember. The sweep found two more reds. **This is the highest-value single change in this report.**
- **Add a `fixtures:` line to any packet whose outcome is "write a fixture"**, naming the test-support factories in scope. One line would have pre-empted §3(a) entirely, and in a differently-scoped lane it would have saved a full re-do.
- **Put expiry and ticket-id on every known-red row.** §1. Makes twelve-day-old undiagnosed reds visible at zero cost.
- **Say in the records block which records may overlap.** Read-only gates can run concurrently; anything through `mutate.sh` must be exclusive, because it dirties the tree and any concurrent `gate-run.sh` will record `CLEAN-STATE: CHANGED` and have to be re-run. I worked this out from reading both tools' sources — about six minutes that every seat currently repeats, or gets wrong once at the cost of a re-run.
- **Scope the "no additional failures" claim to the gate set.** §2.

---

## 7. Where the packet was unclear — exactly

- **`:1712–:1730`** (packet OUTCOME 1 and ticket 1): the test body ends at `:1727`; `:1729–:1730` are the first lines of the next test. Harmless — I read the intent as `:1712–:1726` and changed nothing in either — but a seat editing to the letter would have reached into a neighbouring test it was not chartered for.
- **"No additional failures anywhere"** (KNOWN REDS): false as written, true of the gate set. §2.
- **"the RED capture at your RED commit"** (OUTCOME 1): at a lane that starts on a base where the reds already exist and whose fix is a fixture edit, there is no meaningful "RED commit" distinct from the base — there is nothing of mine to commit before the fix. I read it as *capture the red at your tip before the fix lands, with a clean tree*, and did that at `ed804f3c`. Worth one clarifying clause, because the alternative reading (manufacture a commit to have one) is worse and a seat might take it.
- **The `heartbeat-worker` skill note** ("Skill tool may refuse it inside an Agent seat") did not fire: every `Skill` invocation worked in this seat. I read `heartbeat-protocol` and `heartbeat-worker` as markdown because the `heartbeat` loader itself directs you to read them from the repo, not because anything refused. The packet's hedge is fine, but it invited me to report a refusal that never happened; I have said so plainly in the report's line 2 rather than let the ambiguity stand.

---

## 8. One thing I would tell the next seat

The failure message told me `UNEXPECTED_CLIENT_QUERY`, and the fastest wrong move available was to make that message go away. It would have taken thirty seconds to widen the stub's match to `advisory_lock` and get a green row — and the result would have been a stub that answers a query it does not model, in a file whose entire purpose is to model queries faithfully.

The thing that made the difference was spending four minutes on `git log -S` **before** touching the fixture: it produced the commit, the direction of the change, and the contract test that forbids reverting it — and that contract test is what let me say "fixture, not product" as an entailment instead of a preference. **Root cause before fixes is not a ritual here; it is what turns a defensible choice into a provable one, and the reviewer can check a proof.**
